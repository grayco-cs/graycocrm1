/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: only the CRM's own site may call from a browser (SITE_ORIGIN, comma list). */
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',')
    .map(function(s){ return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' + (extraHeaders ? ', ' + extraHeaders : ''),
    'Access-Control-Allow-Methods': methods || 'POST, OPTIONS'
  };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const token = m[1];
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (r.ok) user = await r.json();
  } catch (e) {
    return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' };
  }
  const email = String((user && user.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let role = null, listed = false, name = '';
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email),
        { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (r.ok) {
        listed = true;
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) { role = String(row.role || 'staff').toLowerCase(); name = row.name || ''; }
      }
    } catch (e) {}
  }
  if (!listed) {
    const env = (process.env.STAFF_EMAILS || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
    if (env.indexOf(email) > -1) role = 'staff';
  }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name, userId: user.id || '' };
}
/* ── end GrayCo staff check ────────────────────────────────────────────────── */

// netlify/functions/brain.js
// GrayCo Business Brain — reads live files from Supabase, respects agent toggles
//
// Required env vars:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const FALLBACK_SYSTEM = `You are the GrayCo Business Brain — the AI operating system for GrayCo Construction Services, LLC.
GrayCo is a licensed GC and specialty contractor in TN and AR. Wesley Johnson handles business strategy and financials. Nick Thomas handles sales and client relationships. Glenn Miller handles estimating.
Top 3 priorities: Cash flow, Scheduling, Estimating fast and correctly.
Estimating: 1.5x on materials (1.3x floor, Wesley or Nick approval), 1.5x on labor always.
Approval authority: Wesley or Nick — either can approve anything.
Voice: Professional and direct. No fluff.
NOTE: Could not load full Business Brain files — using fallback. Check Supabase connection.`;

// ── Load brain files from Supabase ───────────────────────────────────────────
async function loadBrainFiles() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;

  try {
    const resp = await fetch(
      `${url}/rest/v1/brain_files?select=name,category,content&order=category.asc,name.asc`,
      { headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' } }
    );
    if (!resp.ok) return null;
    const files = await resp.json();
    return files && files.length ? files : null;
  } catch (e) {
    console.error('Failed to load brain files:', e.message);
    return null;
  }
}

// ── Build system prompt, skipping disabled agents ────────────────────────────
function buildSystemPrompt(files, crmContext) {
  // Separate out system config files
  const togglesFile = files.find(f => f.name === '__agent_toggles__');
  let agentToggles = {};
  if (togglesFile) {
    try { agentToggles = JSON.parse(togglesFile.content) || {}; } catch {}
  }

  // Filter out system files and disabled agents
  const activeFiles = files.filter(f => {
    if (f.name.startsWith('__')) return false;          // skip system files
    if (f.category === 'agents' && agentToggles[f.name] === false) return false; // skip disabled agents
    return true;
  });

  const disabledAgents = files.filter(f =>
    f.category === 'agents' && agentToggles[f.name] === false
  );

  let prompt = `You are the GrayCo Business Brain — the AI operating system for GrayCo Construction Services, LLC.

You are embedded directly in the GrayCo CRM. Use the live CRM data passed with each message to give specific, accurate answers. Reference actual job names, amounts, and dates — never give generic answers when you have real data.

Wesley and Nick decide. You execute.

`;

  if (disabledAgents.length > 0) {
    prompt += `## DISABLED AGENTS (do not use these capabilities)\n`;
    prompt += disabledAgents.map(f => `- ${f.name}`).join('\n');
    prompt += '\n\n';
  }

  // Group active files by category
  const byCategory = {};
  activeFiles.forEach(f => {
    const cat = f.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  });

  prompt += '## BUSINESS BRAIN FILES\n\n';

  // Identity files first, then others, agents last
  const catOrder = ['identity', 'estimating', 'compensation', 'suppliers', 'processes', 'legal', 'general', 'agents'];
  const sortedCats = [
    ...catOrder.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !catOrder.includes(c)),
  ];

  sortedCats.forEach(cat => {
    if (!byCategory[cat]) return;
    byCategory[cat].forEach(f => {
      prompt += `### ${f.name}\n${f.content}\n\n`;
    });
  });

  if (crmContext) {
    prompt += `---\n\n## LIVE CRM DATA (as of this request)\n\`\`\`json\n${JSON.stringify(crmContext, null, 2)}\n\`\`\`\n`;
  }

  return prompt;
}

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json' });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const who = await gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { messages = [], crmContext = null } = body;
  if (!messages.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No messages provided' }) };

  const brainFiles = await loadBrainFiles();
  const systemPrompt = brainFiles
    ? buildSystemPrompt(brainFiles, crmContext)
    : FALLBACK_SYSTEM + (crmContext ? `\n\n## LIVE CRM DATA\n\`\`\`json\n${JSON.stringify(crmContext, null, 2)}\n\`\`\`` : '');

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2048, system: systemPrompt, messages }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: err }) };
    }

    const data = await resp.json();
    const text = (data.content || []).map(b => b.text || '').join('');

    const activeAgents = brainFiles
      ? brainFiles.filter(f => f.category === 'agents' && !f.name.startsWith('__')).length
      : 0;

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ response: text, usage: data.usage, brainFilesLoaded: brainFiles ? brainFiles.length : 0, activeAgents }),
    };
  } catch (e) {
    console.error('Brain error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
