/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
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

// Netlify Scheduled Function — runs every Monday at 7am CST
// Sends weekly owner report to Wesley and Nick
// Required env vars: RESEND_API_KEY, OWNER_EMAILS (comma-separated)
// Schedule set in netlify.toml

const RESEND_URL = 'https://api.resend.com/emails';
const GC = {
  name: 'GrayCo Construction Services',
  email: 'office@grayco-cs.com',
  phone: '(901) 585-0944',
  w_email: 'wjohnson@grayco-cs.com',
  n_email: 'nthomas@grayco-cs.com',
};

async function sendEmail(to, subject, html){
  const key = process.env.RESEND_API_KEY;
  if(!key){ console.log('No RESEND_API_KEY — skipping'); return {skipped:true}; }
  const resp = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer '+key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: GC.name+' <'+GC.email+'>',
      to: Array.isArray(to) ? to : [to],
      subject: require('./_lib/mailtag.js').tag(subject, Array.isArray(to) ? to : [to], 'report'), html
    })
  });
  return resp.json();
}

function emailWrap(title, body){
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
    <div style="background:#1a3a5f;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
      <div style="font-size:18px;font-weight:700;">GrayCo Construction Services</div>
      <div style="font-size:14px;opacity:.85;margin-top:4px;">${title}</div>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0;">${body}</div>
    <div style="text-align:center;padding:12px;font-size:11px;color:#999;">${GC.name} · ${GC.phone} · ${GC.email}</div>
  </div>`;
}

async function getCRMSnapshot(){
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if(!url || !key) return null;
    const keys = ['projects','invs','gcAcctRegister','leads','projectPayments','gc_check_queue','gc_sub_approvals'];
    const q = url.replace(/\/$/,'') + '/rest/v1/gc_kv?key=in.(' + keys.map(function(k){return '%22'+k+'%22';}).join(',') + ')&select=key,value';
    const resp = await fetch(q, { headers: { apikey: key, Authorization: 'Bearer '+key } });
    if(!resp.ok) return null;
    const rows = await resp.json();
    const out = {};
    (rows||[]).forEach(function(r){ out[r.key] = r.value; });
    return out;
  } catch(e){ console.log('snapshot failed', e); return null; }
}

exports.handler = async function(event) {
  const headers = Object.assign(gcCors(event || {}, 'GET, POST, OPTIONS'), {'Content-Type':'application/json'});
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const who = await gcStaffAuth(event || {});
  if (!who.ok) return { statusCode: who.statusCode, headers, body: JSON.stringify({ error: who.error }) };
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const owners = (process.env.OWNER_EMAILS || GC.w_email+','+GC.n_email).split(',').map(function(e){return e.trim();});

  const data = await getCRMSnapshot();
  const projects = (data && data.projects) || [];
  const invoices = (data && data.invs) || [];
  const expenses = (data && data.gcAcctRegister) || [];
  const leads = (data && data.leads) || [];
  const checkQueue = (data && data.gc_check_queue) || [];
  const subApprovals = (data && data.gc_sub_approvals) || [];

  const activeJobs = projects.filter(function(p){return ['active','approved'].includes((p.status||'').toLowerCase());});
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const weekAgoStr = weekAgo.toISOString().slice(0,10);

  const weekInvs = invoices.filter(function(i){return (i.date||'') >= weekAgoStr && i.type==='client';});
  const weekCollected = invoices.filter(function(i){return i.status==='paid' && (i.paidDate||i.date||'') >= weekAgoStr;});
  const overdueInvs = invoices.filter(function(i){return i.status!=='paid' && i.due && i.due < today && i.type==='client';});
  const newLeads = leads.filter(function(l){return (l.date||l.created||'') >= weekAgoStr;});
  const bidsOut = leads.filter(function(l){return l.status==='Estimate Sent';});

  const totalBilled = weekInvs.reduce(function(s,i){return s+(parseFloat(i.amt)||0);},0);
  const totalCollected = weekCollected.reduce(function(s,i){return s+(parseFloat(i.amt)||0);},0);
  const totalExpenses = expenses.filter(function(e){return (e.date||'') >= weekAgoStr;}).reduce(function(s,e){return s+(parseFloat(e.amt)||0);},0);
  const totalRevenue = projects.filter(function(p){return ['active','approved','completed'].includes((p.status||'').toLowerCase());}).reduce(function(s,p){return s+(parseFloat(p.contract)||0);},0);

  // ── Pending action items the owners should know about (from data we can see) ──
  const actionItems = [];
  // jobs at 100% not yet completed (need cost review + completion)
  projects.forEach(function(p){
    var pct = Math.round(p.pct||p.ccProgressPct||0);
    var done = /(completed|closed)/i.test(p.status||'');
    if(pct>=100 && !done){ actionItems.push({t:'Job at 100% awaiting completion', d:(p.name||'')+' — verify costs, confirm final payment & punch list'}); }
  });
  // active jobs missing contract/phone/email
  activeJobs.forEach(function(p){
    var miss=[];
    if(!(parseFloat(p.contract)||0)) miss.push('contract');
    if(!(p.clientPhone||p.customerPhone||p.phone)) miss.push('phone');
    if(!(p.clientEmail||p.customerEmail||p.email)) miss.push('email');
    if(miss.length) actionItems.push({t:'Job missing info — reach out to PM', d:(p.name||'')+' ('+(p.pm||'PM')+') — missing '+miss.join(', ')});
  });
  // active jobs not invoiced recently
  activeJobs.forEach(function(p){
    var hasInv = invoices.some(function(i){return i.pid===p.id && i.type==='client';});
    if(!hasInv) actionItems.push({t:'Active job not invoiced yet', d:(p.name||'')});
  });
  // overdue invoices already counted, but add as action
  overdueInvs.forEach(function(i){ actionItems.push({t:'Overdue invoice', d:(i.client||'Client')+' — $'+(parseFloat(i.amt)||0).toLocaleString()}); });
  // checks to write / sign (from synced queue)
  var toWrite = checkQueue.filter(function(c){return c && c.status==='entered';});
  var toSign  = checkQueue.filter(function(c){return c && c.status==='written';});
  if(toWrite.length) actionItems.push({t:'Checks to write', d:toWrite.length+' check(s) entered, waiting to be cut — $'+toWrite.reduce(function(s,c){return s+(parseFloat(c.amount)||0);},0).toLocaleString()});
  if(toSign.length) actionItems.push({t:'Checks to sign (Wesley/Nick)', d:toSign.length+' written check(s) awaiting signature — $'+toSign.reduce(function(s,c){return s+(parseFloat(c.amount)||0);},0).toLocaleString()});
  // sub invoices needing office match or PM approval
  var subMatch = subApprovals.filter(function(a){return a && a.status==='needs_office_match';});
  var subPM = subApprovals.filter(function(a){return a && a.status==='pending_pm';});
  if(subMatch.length) actionItems.push({t:'Sub invoices to match', d:subMatch.length+' need the office to confirm the job'});
  if(subPM.length) actionItems.push({t:'Sub invoices awaiting PM approval', d:subPM.length+' waiting on PM sign-off'});

  const html = emailWrap('📊 Weekly Owner Report — Week of '+today, `
    <h3 style="color:#1a3a5f;margin-top:0;">Company Snapshot</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="padding:10px;background:#e8f4fd;border-radius:6px;text-align:center;width:25%"><div style="font-size:22px;font-weight:700;color:#1a3a5f;">${activeJobs.length}</div><div style="font-size:11px;color:#666;">Active Jobs</div></td>
        <td style="width:2%"></td>
        <td style="padding:10px;background:#e8f8f0;border-radius:6px;text-align:center;width:25%"><div style="font-size:22px;font-weight:700;color:#16a34a;">$${totalCollected.toLocaleString()}</div><div style="font-size:11px;color:#666;">Collected This Week</div></td>
        <td style="width:2%"></td>
        <td style="padding:10px;background:#fff8e1;border-radius:6px;text-align:center;width:25%"><div style="font-size:22px;font-weight:700;color:#d4a017;">$${totalBilled.toLocaleString()}</div><div style="font-size:11px;color:#666;">Billed This Week</div></td>
        <td style="width:2%"></td>
        <td style="padding:10px;background:${overdueInvs.length > 0 ? '#fde8e8' : '#f0f4f8'};border-radius:6px;text-align:center;width:25%"><div style="font-size:22px;font-weight:700;color:${overdueInvs.length > 0 ? '#dc2626' : '#555'};">${overdueInvs.length}</div><div style="font-size:11px;color:#666;">Overdue Invoices</div></td>
      </tr>
    </table>

    ${activeJobs.length > 0 ? `
    <h3 style="color:#1a3a5f;">🏗 Active Jobs</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <tr style="background:#f0f4f8;">
        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid #ddd;">Job</th>
        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid #ddd;">PM</th>
        <th style="padding:7px 8px;text-align:right;border-bottom:2px solid #ddd;">Contract</th>
        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid #ddd;">Status</th>
      </tr>
      ${activeJobs.map(function(p){
        return '<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 8px;font-weight:600;">'+p.name+'</td><td style="padding:6px 8px;color:#666;">'+(p.pm||'—')+'</td><td style="padding:6px 8px;text-align:right;font-weight:700;">$'+(parseFloat(p.contract)||0).toLocaleString()+'</td><td style="padding:6px 8px;color:#1a3a5f;">'+(p.status||'')+'</td></tr>';
      }).join('')}
    </table>` : '<p style="color:#666;">No active jobs this week.</p>'}

    ${overdueInvs.length > 0 ? `
    <h3 style="color:#dc2626;">🔴 Overdue Invoices (${overdueInvs.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      ${overdueInvs.map(function(i){
        var days=Math.round((new Date()-new Date(i.due))/86400000);
        return '<tr style="border-bottom:1px solid #fde8e8;"><td style="padding:5px 8px;font-weight:600;">'+(i.client||'Client')+'</td><td style="padding:5px 8px;color:#dc2626;">$'+(parseFloat(i.amt)||0).toLocaleString()+'</td><td style="padding:5px 8px;color:#888;">Due '+i.due+' ('+days+' days ago)</td></tr>';
      }).join('')}
    </table>` : ''}

    ${bidsOut.length > 0 ? `
    <h3 style="color:#7c3aed;">📋 Bids Pending Response (${bidsOut.length})</h3>
    ${bidsOut.map(function(l){return '<p style="margin:3px 0;font-size:12px;">• <b>'+(l.name||l.address||'Lead')+'</b> — estimate sent '+(l.date||'')+'</p>';}).join('')}
    ` : ''}

    ${newLeads.length > 0 ? `
    <h3 style="color:#16a34a;">✨ New Leads This Week (${newLeads.length})</h3>
    ${newLeads.map(function(l){return '<p style="margin:3px 0;font-size:12px;">• <b>'+(l.name||l.address||'Lead')+'</b> — '+l.status+'</p>';}).join('')}
    ` : ''}

    ${actionItems.length > 0 ? `
    <h3 style="color:#dc2626;">✅ Pending Action Items (${actionItems.length})</h3>
    <div style="background:#fffbf0;border:1px solid #f0d890;border-radius:6px;padding:12px;margin-bottom:16px;">
      ${actionItems.slice(0,25).map(function(a){return '<div style="padding:5px 0;border-bottom:1px solid #f0e0c0;font-size:12px;"><b style="color:#1a3a5f;">'+a.t+':</b> <span style="color:#555;">'+a.d+'</span></div>';}).join('')}
      ${actionItems.length>25 ? '<div style="padding:6px 0;font-size:11px;color:#999;">+'+(actionItems.length-25)+' more — see the To-Do tab in the CRM</div>' : ''}
    </div>
    <p style="font-size:11px;color:#888;">Note: checks to write/sign, sub approvals, and commission payouts are tracked live in the CRM To-Do tab.</p>
    ` : ''}

    <div style="background:#f0f4f8;border-radius:6px;padding:12px;margin-top:16px;font-size:11px;color:#666;">
      <b>Pipeline:</b> $${totalRevenue.toLocaleString()} total active contracts &nbsp;·&nbsp;
      <b>Expenses this week:</b> $${totalExpenses.toLocaleString()} &nbsp;·&nbsp;
      <a href="https://graycocrm1.netlify.app" style="color:#1a3a5f;font-weight:700;">Open CRM →</a>
    </div>
  `);

  const result = await sendEmail(owners, '📊 GrayCo Weekly Report — '+today, html);
  return { statusCode: 200, headers, body: JSON.stringify({sent: today, result}) };
};
