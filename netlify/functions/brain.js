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
// GrayCo Business Brain (patch WEB, part B) — Claude with tools over the LIVE CRM records.
//
// BEFORE (to 33.150): one call to claude-sonnet-4-6 with a small snapshot the browser built (active jobs, overdue
// invoices with the wrong field names, recent leads) and the brain_files table as the system prompt. No tools, no
// role rules (a PM's browser sent every active job's contract), errors shown as raw Anthropic JSON, and "check that
// ANTHROPIC_API_KEY is set" for every failure.
//
// NOW: the browser sends only the conversation. The server reads the records itself (service key), narrows them to
// what the signed-in person may see (SEC2: admins everything; the office every job but no payroll; a PM only their
// own jobs / leads; payroll only admins), and lets Claude call read-only tools (_lib/brain-tools.js): money by
// period / job type / PM, A/R and overdue invoices, jobs behind schedule, bids due, PM workload, margins, estimate
// vs actual, leads by source, one job's detail, an estimate's lines, search. Drafts (customer e-mails, change-order
// text, proposals, job summaries, weekly owner reports, scopes) are written from those numbers. To DO anything it
// can only PROPOSE (a to-do, an e-mail on ✅ Approvals, a lead, an appointment): the person sees a preview and taps
// "Do it" → POST {execute} here, which checks the rules again before doing it.
//
//   POST { messages:[…the conversation as the API keeps it…] }  → { reply, proposals, history, partial, toolsUsed }
//   POST { execute: <proposal> }                                 → { ok, done, clientAction? }
//   GET  ?status=1                                               → { ok, ai, model, viewer, brainFiles }
//
// Env: ANTHROPIC_API_KEY (required), SUPABASE_URL / SUPABASE_SERVICE_KEY (already set).
//      BRAIN_MODEL (default claude-opus-5-5), BRAIN_EFFORT (default medium), BRAIN_DEADLINE_MS (default 23000).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const BT = require('./_lib/brain-tools.js');
function model(){ return (process.env.BRAIN_MODEL || 'claude-opus-5-5').trim(); }
function core(){ return require('./portal.js')._core; }
function s(v){ return v == null ? '' : String(v).trim(); }

const FALLBACK_RULES = `GrayCo Construction Services, LLC — licensed GC and specialty contractor in TN, AR and MS (${require('./_lib/brand.js').companyAddress()}; office 901-585-0944).
Wesley Johnson: business strategy and financials. Nick Thomas: sales and client relationships. Glenn Miller: estimating.
Top 3 priorities: cash flow, scheduling, estimating fast and correctly.
Estimating: 1.5x on materials (1.3x floor, Wesley or Nick approval), 1.5x on labor always.
Approval authority: Wesley or Nick — either can approve anything. Nothing goes to a customer without approval.
Voice: professional and direct. No fluff.`;

/* the brain_files table (Brain Manager) — optional; its text becomes part of the rules */
async function loadBrainFiles() {
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  try {
    const resp = await fetch(url + '/rest/v1/brain_files?select=name,category,content&order=category.asc,name.asc', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!resp.ok) return null;
    const files = await resp.json();
    return Array.isArray(files) && files.length ? files : null;
  } catch (e) { return null; }
}
function brainText(files){
  if (!files) return '';
  let toggles = {}; const tf = files.find(f => f.name === '__agent_toggles__'); if (tf) { try { toggles = JSON.parse(tf.content) || {}; } catch (e) {} }
  const keep = files.filter(f => !String(f.name).startsWith('__') && !(f.category === 'agents' && toggles[f.name] === false));
  const order = ['identity', 'estimating', 'compensation', 'suppliers', 'processes', 'legal', 'general', 'agents'];
  keep.sort((a, b) => (order.indexOf(a.category) + 1 || 99) - (order.indexOf(b.category) + 1 || 99) || String(a.name).localeCompare(String(b.name)));
  return keep.map(f => '### ' + f.name + '\n' + String(f.content || '').slice(0, 6000)).join('\n\n').slice(0, 40000);
}
function systemFor(v, files){
  const who = v.admin ? 'an OWNER / ADMIN — sees everything, including payroll'
    : v.office ? 'the OFFICE — sees every job, but not payroll'
    : 'a ' + (v.role || 'staff member') + ' — sees ONLY their own jobs and leads (the tools already narrow the records); no payroll, no other people\'s numbers';
  return `You are the GrayCo Business Brain, built into the GrayCo CRM. You answer from the LIVE CRM records through your tools and help the team get work done.

Who you are talking to: ${v.name} (${v.email}), ${who}. Never reveal, estimate or guess numbers outside what the tools return for this person; if they ask for something they cannot see, say plainly that it is outside what their role can see.

How to work:
- Numbers come ONLY from the tools. Call tools before answering any question about money, jobs, invoices, bids, leads, schedule, people or margins. Say the date range you used. If the data is missing or looks wrong, say so — never invent.
- Keep answers short and scannable: a one-line answer first, then a few bullets or a small table. Dollar amounts like $12,340.
- Drafting (customer e-mails, change-order text, proposals from estimates, job summaries, weekly owner reports, scope write-ups): look the job / estimate up first, then write the draft in plain text ready to paste. Customer-facing text is warm, plain and professional; never promise dates or prices the records do not support.
- You are READ-ONLY. To create anything (a to-do, a customer e-mail for approval, a lead, an appointment) call propose_action. It only shows the person a preview; it happens when they tap "Do it". Never say it is done — say it is ready for their tap. A customer e-mail always goes through ✅ Approvals.
- GrayCo's rules (from the owner):
${FALLBACK_RULES}
${files ? '\n## Business Brain files (Brain Manager)\n' + files : ''}`;
}

/* ── the records ─────────────────────────────────────────────────────────── */
async function loadFor(who){
  const raw0 = await core().kvRead(['users']);
  const v = BT.viewerOf(who, raw0.users);
  const raw = await core().kvRead(BT.KEYS.concat(v.payroll ? BT.PAYROLL_KEYS : []));
  return { v, raw, d: BT.scope(raw, v) };
}

/* ── the conversation as the API keeps it (thinking blocks passed back unchanged) ── */
function cleanHistory(list){
  let msgs = (Array.isArray(list) ? list : []).filter(m => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' ? m.content.trim() : Array.isArray(m.content) && m.content.length))
    .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 20000) : m.content }));
  let trimmed = false;
  if (msgs.length > 40) {
    /* keep the newest turns, starting at a plain question; with an edited history no thinking block is replayed */
    let i = msgs.length - 40;
    while (i < msgs.length && !(msgs[i].role === 'user' && (typeof msgs[i].content === 'string' || msgs[i].content.every(b => b.type === 'text')))) i++;
    msgs = msgs.slice(i); trimmed = true;
  }
  if (trimmed) msgs = msgs.map(m => Array.isArray(m.content) ? { role: m.role, content: m.content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking') } : m).filter(m => typeof m.content === 'string' || m.content.length);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

async function callClaude(body, ms){
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), Math.max(1000, ms));
  try {
    const headers = { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
    if (body.fallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    const r = await fetch(ANTHROPIC_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    return { status: r.status, ok: r.ok, j, txt };
  } catch (e) {
    return { status: e && e.name === 'AbortError' ? 504 : 502, ok: false, j: null, txt: String(e && e.message || e), aborted: e && e.name === 'AbortError' };
  } finally { clearTimeout(timer); }
}
/* what a person sees when the AI service says no — never raw JSON */
function apiError(r){
  const t = (r.j && r.j.error && (r.j.error.type || '')) || '';
  if (r.status === 401 || t === 'authentication_error') return 'The AI key on the server was not accepted. An admin must check ANTHROPIC_API_KEY in Netlify → Environment variables.';
  if (r.status === 403 || t === 'permission_error') return 'The AI key on the server is not allowed to use this model. An admin can set BRAIN_MODEL in Netlify.';
  if (r.status === 404 || t === 'not_found_error') return 'The AI model "' + model() + '" was not found. An admin can set BRAIN_MODEL in Netlify (e.g. claude-opus-5-5).';
  if (r.status === 429 || t === 'rate_limit_error') return 'The AI is busy right now (rate limit). Try again in a minute.';
  if (r.status === 529 || t === 'overloaded_error') return 'The AI service is overloaded right now. Try again in a minute.';
  if (r.status === 504 || r.aborted) return 'The AI took too long to answer. Try again, or ask a narrower question.';
  if (r.status === 400) return 'The AI could not read this request (' + s(r.j && r.j.error && r.j.error.message).slice(0, 160) + ').';
  if (r.status >= 500) return 'The AI service had a problem (' + r.status + '). Try again in a minute.';
  return 'Could not reach the AI service (' + r.status + ').';
}

async function converse(who, messages, now){
  const { v, d } = await loadFor(who);
  const files = brainText(await loadBrainFiles());
  const tools = BT.toolDefs(v).map((t, i, all) => i === all.length - 1 ? Object.assign({}, t, { cache_control: { type: 'ephemeral' } }) : t);
  const system = [{ type: 'text', text: systemFor(v, files), cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Today is ' + new Date(now).toISOString().slice(0, 10) + ' (America/Chicago business days).' }];
  const history = cleanHistory(messages);
  if (!history.length) return { code: 400, body: { error: 'Ask a question first.' } };
  const start = history.length;
  const deadline = Date.now() + parseInt(process.env.BRAIN_DEADLINE_MS || '23000', 10);
  const proposals = [], used = [];
  let replyParts = [], partial = false, usage = { input_tokens: 0, output_tokens: 0 }, servedBy = model();
  for (let round = 0; round < 8; round++) {
    const left = deadline - Date.now();
    if (left < 2500) { partial = true; break; }
    const body = { model: model(), max_tokens: 4096, system, tools, messages: history, output_config: { effort: process.env.BRAIN_EFFORT || 'medium' }, fallbacks: 'default' };
    let r = await callClaude(body, left);
    if (r.status === 400 && /fallback/i.test(r.txt || '')) { delete body.fallbacks; r = await callClaude(body, deadline - Date.now()); }
    if (!r.ok || !r.j) {
      if (r.aborted && round > 0) { partial = true; break; }
      return { code: r.status === 504 ? 504 : 502, body: { error: apiError(r), status: r.status } };
    }
    const j = r.j; servedBy = s(j.model) || servedBy;
    if (j.usage) { usage.input_tokens += j.usage.input_tokens || 0; usage.output_tokens += j.usage.output_tokens || 0; }
    if (j.stop_reason === 'refusal') { replyParts.push('I can\'t help with that request.'); break; }
    const content = Array.isArray(j.content) ? j.content : [];
    history.push({ role: 'assistant', content });   /* the whole content, thinking blocks included, unchanged */
    content.forEach(b => { if (b.type === 'text' && s(b.text)) replyParts.push(b.text); });
    const calls = content.filter(b => b.type === 'tool_use');
    if (j.stop_reason !== 'tool_use' || !calls.length) { if (j.stop_reason === 'max_tokens') replyParts.push('(The answer was cut off — ask me to continue.)'); break; }
    const results = calls.map(c => {
      used.push(c.name);
      if (c.name === 'propose_action') {
        const p = BT.proposal(c.input, d, now);
        if (p.error) return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify({ error: p.error }), is_error: true };
        proposals.push(p);
        return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify({ proposal_id: p.id, preview: p, status: 'Shown to ' + v.name + ' as a preview card. NOT done yet — it happens only if they tap "Do it".' }) };
      }
      const out = BT.runTool(c.name, c.input, d, now);
      return { type: 'tool_result', tool_use_id: c.id, content: BT.clipJson(out, 14000), is_error: !!(out && out.error) };
    });
    history.push({ role: 'user', content: results });   /* every result in ONE message */
    if (round === 7) partial = true;
  }
  if (partial) replyParts.push('⏳ I need a little more time for this one — tap Continue.');
  return { code: 200, body: { reply: replyParts.join('\n\n').trim(), proposals, history, partial, toolsUsed: used, model: servedBy, usage, added: history.length - start,
    viewer: { name: v.name, role: v.role, seesAll: v.seesAll, payroll: v.payroll } } };
}

/* ── doing what the person tapped ──────────────────────────────────────────── */
function textHtml(t){ return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#14202E;font-size:15px;line-height:1.5;white-space:pre-wrap">' + String(t || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</div>'; }
async function execute(who, prop){
  const { v, raw, d } = await loadFor(who);
  /* re-check it from scratch: the fields as a proposal would make them now, for THIS person */
  const again = BT.proposal(Object.assign({ type: prop && prop.type, summary: prop && prop.summary, job: prop && prop.job && prop.job.id }, prop && prop.fields || {}, prop && prop.fields && prop.fields.lead_type ? { lead_type: prop.fields.lead_type } : {}), d, Date.now());
  if (again.error) return { code: 403, body: { ok: false, error: again.error } };
  again.id = s(prop.id) || again.id;
  const no = BT.allowed(again, d); if (no) return { code: 403, body: { ok: false, error: no } };
  const f = again.fields, at = new Date().toISOString(), job = again.job;
  if (again.type === 'todo') {
    const item = { id: 'T' + again.id, label: f.label, note: f.note, assignee: f.assignee, due: f.due, pid: job ? job.id : '', jobName: job ? job.name : '', addedBy: v.name, addedAt: at, updatedAt: at, done: false, source: 'brain' };
    const has = l => l.some(t => String(t.id) === item.id);
    const r = await core().kvListUpdate('gc_office_tasks', l => has(l) ? null : { list: l.concat([item]), check: has });
    return r.ok ? { code: 200, body: { ok: true, done: '✅ To-do added' + (f.assignee ? ' for ' + f.assignee : '') + ': ' + f.label, record: item } } : { code: 503, body: { ok: false, error: 'Could not save the to-do (' + r.error + '). Try again.' } };
  }
  if (again.type === 'approval_email') {
    const p = job ? d.jobs.find(x => String(x.id) === job.id) : null;
    const pm = p ? core().pmOf(raw, p) : null;
    const ok = await core().queueApproval({ id: 'appr_brain_' + again.id, kind: 'brain_email', pid: job ? job.id : '', jobName: job ? job.name : 'Customer e-mail', pm, to: f.to, subject: f.subject, html: textHtml(f.body), attachments: [], meta: { by: v.name, source: 'Business Brain' } });
    return ok ? { code: 200, body: { ok: true, done: '✅ On the ✅ Approvals list — it goes to ' + f.to + ' once ' + (pm ? pm.name : 'an admin') + ' approves it.' } } : { code: 503, body: { ok: false, error: 'Could not put it on the approvals list. Try again.' } };
  }
  if (again.type === 'lead') {
    const L = require('./bid-inbox.js')._lib;
    const id = L.itemId('brain|' + again.id), mine = !v.seesAll;
    const rec = { id, title: f.name, source: 'Business Brain', sourceKind: 'brain', type: f.lead_type, address: f.address, city: '', state: '', zip: '', scope: f.note, contact: { name: f.name, email: f.email, phone: f.phone },
      plansLinks: [], files: [], emails: [], emailIds: [], notes: ['Added from the Business Brain by ' + v.name + '.'], origin: 'brain', pm: mine ? v.name : '', needsReview: false,
      leadExtra: mine ? { createdBy: v.name, leadSource: 'Self-generated (' + v.name + ')', owner: v.name, commissionSource: 'self', selfGenerated: true } : { createdBy: v.name, leadSource: 'GrayCo', owner: 'GrayCo', commissionSource: 'grayco' } };
    try { await L.kvCas(L.KV, cur => L.upsert(Array.isArray(cur) ? cur : [], rec).items); }
    catch (e) { return { code: 503, body: { ok: false, error: 'Could not save the lead. Try again.' } }; }
    return { code: 200, body: { ok: true, done: '✅ Lead added: ' + f.name + ' — it shows on Leads → 📥 Lead Inbox' + (mine ? ' as yours' : ' (not assigned yet)') + '.', leadId: 'LEADIN-' + id.replace(/^LI-/, '') } };
  }
  if (again.type === 'appointment') {
    const rec = { id: 'SCHbr' + again.id, pid: job ? job.id : '', title: f.title || 'Appointment', date: f.date, time: f.time, endTime: '', assignee: f.assignee, vendor: '', type: 'appointment', address: f.address, notes: f.note, by: v.name, source: 'brain', createdAt: at, updatedAt: at };
    return { code: 200, body: { ok: true, done: '📅 Adding to the schedule: ' + rec.title + ' — ' + f.date + ' ' + f.time, clientAction: { type: 'appointment', record: rec } } };
  }
  return { code: 400, body: { ok: false, error: 'Unknown action.' } };
}

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  const headers = Object.assign(gcCors(event, 'GET, POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  const out = (code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const who = await gcStaffAuth(event);
  if (!who.ok) return out(who.statusCode, { error: who.error });
  const qs = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && qs.status === '1') {
    let viewer = null, files = 0;
    try { const r = await loadFor(who); viewer = { name: r.v.name, role: r.v.role, seesAll: r.v.seesAll, payroll: r.v.payroll }; } catch (e) {}
    try { files = (await loadBrainFiles() || []).length; } catch (e) {}
    return out(200, { ok: true, ai: !!process.env.ANTHROPIC_API_KEY, model: model(), viewer, brainFiles: files, data: !!viewer });
  }
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method not allowed' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'Invalid JSON' }); }
  try {
    if (body && body.execute) { const r = await execute(who, body.execute); return out(r.code, r.body); }
    if (!process.env.ANTHROPIC_API_KEY) return out(503, { error: 'The Business Brain is not switched on: an admin must add ANTHROPIC_API_KEY in Netlify → Site settings → Environment variables.' });
    const r = await converse(who, body && body.messages, Date.now());
    return out(r.code, r.body);
  } catch (e) {
    return out(503, { error: 'The Business Brain could not read the CRM right now (' + s(e && e.message).slice(0, 120) + '). Try again in a moment.' });
  }
};
exports._test = { cleanHistory, apiError, systemFor, converse, execute, model };
