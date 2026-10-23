// netlify/functions/mail-all.js — patch MAILALL: "🌐 All GrayCo e-mail" (owner 10/23: "open all aliases and e-mails that
// receive and send — I want to see all e-mailing from GrayCo"). ADMINS ONLY, checked here on every call.
//   GET  ?op=status                 → set up? which mailboxes, last sync per mailbox, the setup steps when not set up
//   GET  ?op=list&…                 → the index (metadata only), newest first, every mailbox + what the CRM sent
//          filters: mailbox, addr, dir=in|out, src=gmail|crm|sms, att=1, from=YYYY-MM-DD, to=YYYY-MM-DD, q, pid, cust,
//          emails=a@x,b@y, offset, limit;  live=1&q=… asks Gmail itself (Gmail search words) across the chosen mailboxes
//   GET  ?op=get&mailbox=&id=       → one message with its body, fetched live from Gmail — NEVER stored; the opening is logged
//   GET  ?op=thread&mailbox=&id=    → the thread's messages (metadata)
//   GET  ?op=access                 → who opened which message (the audit log)
//   GET|POST ?op=settings           → { pmSeesJobMail } (POST: admins)
//   POST ?op=link {key, pid}        → "Link to job" (an e-mail's Message-ID / id → job)
//   POST ?op=sync                   → sync now (the same as the 15-minute schedule, mail-all-sync)
// A job's PM may list that job's e-mail (op=list&pid=…) only when an admin turned "PMs see their job's e-mail" on.
// Read-only Gmail (scope gmail.readonly). Nothing here sends, changes or deletes mail.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const G = require('./_lib/gmail.js');
const X = require('./_lib/mailidx.js');
const MC = require('./_lib/mailcenter.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function env(k){ return s(process.env[k]); }
function T(){ return require('./bid-inbox.js')._test; }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
const SETUP = [
  'Google Cloud Console (console.cloud.google.com) → New project (e.g. "GrayCo CRM mail").',
  'APIs & Services → Library → "Gmail API" → Enable.',
  'IAM & Admin → Service accounts → Create service account → then Keys → Add key → JSON (a file downloads — keep it private).',
  'Open the service account → copy its "Unique ID" (the client ID, a long number).',
  'Google Admin (admin.google.com) → Security → Access and data control → API controls → Manage Domain Wide Delegation → Add new: that client ID + the scope https://www.googleapis.com/auth/gmail.readonly → Authorize.',
  'Netlify → the CRM site → Site configuration → Environment variables (scope: Functions, Production): GOOGLE_SA_EMAIL = the service account e-mail; GOOGLE_SA_KEY = the private key from the JSON file (or paste the whole JSON file) — never in chat or e-mail; GMAIL_DOMAIN = grayco-cs.com → Save → Deploys → Trigger deploy.',
  'Come back here: the first sync runs within 15 minutes (or press "Sync now").'
];

/* the mailboxes: every active GrayCo person + the extra mailboxes and receiving mailboxes in the Email Center addresses */
async function mailboxes(){
  const dom = G.account().domain || 'grayco-cs.com', out = [];
  function add(e){ e = low(e); if (e && e.endsWith('@' + dom) && !/@in\./.test(e) && out.indexOf(e) < 0) out.push(e); }
  try {
    const r = await require('./bid-inbox.js')._lib.sb('gc_staff?select=email,active');
    if (r && r.ok) arr(await r.json()).forEach(x => { if (x && x.active !== false) add(x.email); });
  } catch (e) {}
  let set = null; try { set = MC.settings(await require('./bid-inbox.js')._lib.kvGet(MC.SET_KEY)); } catch (e) { set = MC.settings(null); }
  arr(set.mailboxes).forEach(add); add('office@' + dom);
  arr(set.aliases).forEach(a => { if (a && (a.kind === 'mailbox')) add(a.address); if (a && a.mailbox) add(a.mailbox); });
  const hidden = arr(set.hidden).map(low);
  return out.filter(e => hidden.indexOf(e) < 0);
}

/* ── the sync (every 15 minutes, and "Sync now") ── */
async function syncBox(box, state, match, deadline){
  const st = Object.assign({}, state[box] || {});
  let ids = [], hid = s(st.historyId);
  if (hid) {
    const h = await G.history(box, hid, 400);
    if (h.reset) hid = '';
    else { ids = h.ids; st.historyId = h.historyId; }
  }
  if (!hid) {   /* first look (or Google lost the history): the last 30 days, newest 100 */
    const p = await G.profile(box); st.historyId = s(p.historyId);
    ids = (await G.listIds(box, { q: 'newer_than:30d', max: 100 })).ids;
  }
  ids = ids.slice(0, 150);
  const rows = (await G.pool(ids, 5, async id => { if (Date.now() > deadline) return null; return G.meta(box, id); })).filter(r => r && !r.error && r.id);
  rows.forEach(r => Object.assign(r, match(r)));
  if (rows.length) await X.addRows(X.boxKey(box), rows, X.MAX_BOX);
  st.at = new Date().toISOString(); st.n = rows.length; st.err = rows.length < ids.length && Date.now() > deadline ? 'time ran out — the rest next run' : '';
  if (rows.length < ids.length && Date.now() > deadline) st.historyId = hid || '';   /* not all read: keep the old point so nothing is skipped */
  return st;
}
async function runSync(opts){
  opts = opts || {};
  if (!G.configured()) return { ok: false, skipped: 'not set up' };
  const deadline = Date.now() + (opts.budgetMs || 20000);
  const boxes = await mailboxes();
  const state = (await X.get(X.STATE_KEY)) || {};
  let match = () => ({});
  try { match = X.matcher(await X.crmData(['customers', 'projects', 'leads'])); } catch (e) {}
  const order = boxes.slice().sort((a, b) => s((state[a] || {}).at).localeCompare(s((state[b] || {}).at)));   /* least recently synced first */
  const done = {};
  for (const box of order) {
    if (Date.now() > deadline) break;
    try { done[box] = await syncBox(box, state, match, deadline); }
    catch (e) { done[box] = Object.assign({}, state[box] || {}, { at: new Date().toISOString(), err: s(e && e.message).slice(0, 200) }); }
  }
  await X.cas(X.STATE_KEY, v => Object.assign({}, v || {}, done));
  return { ok: true, synced: Object.keys(done).length, boxes: boxes.length, errors: Object.keys(done).filter(k => done[k].err).length };
}

/* links an admin made + the PM rule */
async function applyLinks(rows){
  const links = (await X.get(X.LINKS_KEY)) || {};
  rows.forEach(r => { const k = r.mid ? 'm:' + low(r.mid) : 'i:' + r.id; if (links[k]) r.pid = links[k]; });
  return rows;
}
async function pmOf(pid){
  try { const d = await X.crmData(['projects']); const p = arr(d.projects).find(x => x && s(x.id) === s(pid)); return p ? { pm: low(p.pm || p.projectManager), email: low(p.pmEmail) } : null; } catch (e) { return null; }
}

exports.runSync = runSync;
exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase(), op = s(qs.op) || 'status';
  if (m === 'OPTIONS') return J(200, {}, C);
  const who = await T().staffAuth(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  let settings = {}; try { settings = (await X.get(X.SET_KEY)) || {}; } catch (e) {}
  /* a PM may read his own job's e-mail list when the owner allowed it — nothing else */
  if (!who.admin) {
    if (op === 'settings' && m === 'GET') return J(200, { ok: true, settings: { pmSeesJobMail: settings.pmSeesJobMail === true } }, C);   /* the PM's page only needs the switch */
    if (op === 'list' && qs.pid && settings.pmSeesJobMail === true && !qs.live) {
      const pm = await pmOf(qs.pid);
      if (!pm || !((pm.email && pm.email === low(who.email)) || (pm.pm && low(who.name) && pm.pm === low(who.name)))) return J(403, { ok: false, error: 'Only that job\'s PM or an admin can see its e-mail.' }, C);
    } else return J(403, { ok: false, error: 'Only an admin can see all GrayCo e-mail.' }, C);
  }
  try {
    if (op === 'status') {
      const boxes = G.configured() ? await mailboxes() : [];
      const state = (await X.get(X.STATE_KEY)) || {};
      return J(200, { ok: true, configured: G.configured(), domain: G.account().domain, mailboxes: boxes, state, settings, setup: SETUP, scope: G.SCOPE }, C);
    }
    if (op === 'settings') {
      if (m === 'POST') {
        let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
        const v = { pmSeesJobMail: b.pmSeesJobMail === true, by: low(who.email), at: new Date().toISOString() };
        await X.cas(X.SET_KEY, () => v); return J(200, { ok: true, settings: v }, C);
      }
      return J(200, { ok: true, settings }, C);
    }
    if (op === 'access') { const l = (await X.get(X.ACCESS_KEY)) || []; return J(200, { ok: true, rows: arr(l).slice(-300).reverse() }, C); }
    if (op === 'link' && m === 'POST') {
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      const key = b.mid ? 'm:' + low(b.mid) : b.id ? 'i:' + s(b.id) : ''; if (!key) return J(400, { ok: false, error: 'Which e-mail?' }, C);
      await X.cas(X.LINKS_KEY, v => { v = v || {}; if (s(b.pid)) v[key] = s(b.pid).slice(0, 80); else delete v[key]; return v; });
      return J(200, { ok: true }, C);
    }
    if (op === 'sync' && m === 'POST') { const r = await runSync({ budgetMs: 18000 }); return J(200, r, C); }
    if (op === 'list') {
      const limit = Math.max(1, Math.min(300, parseInt(qs.limit, 10) || 100)), offset = Math.max(0, parseInt(qs.offset, 10) || 0);
      const boxesAll = G.configured() ? await mailboxes() : [];
      const chosen = s(qs.mailboxes || qs.mailbox) ? s(qs.mailboxes || qs.mailbox).split(',').map(low).filter(b => boxesAll.indexOf(b) >= 0) : boxesAll;
      if (qs.live && who.admin) {   /* Gmail's own search across the chosen mailboxes (newest 25 each) */
        if (!G.configured()) return J(200, { ok: false, configured: false, error: 'Gmail reading is not set up yet.', setup: SETUP }, C);
        const per = await G.pool(chosen.slice(0, 40), 4, async box => {
          const l = await G.listIds(box, { q: s(qs.q), max: 25 });
          return (await G.pool(l.ids, 5, id => G.meta(box, id))).filter(r => r && r.id);
        });
        let rows = []; per.forEach(p => { if (Array.isArray(p)) rows = rows.concat(p); });
        rows = X.collapse(await applyLinks(rows));
        return J(200, { ok: true, live: true, total: rows.length, rows: rows.slice(0, 300) }, C);
      }
      let rows = await X.allRows(qs.pid && !who.admin ? boxesAll : chosen, !(s(qs.mailboxes || qs.mailbox)) || s(qs.mailbox) === 'crm');
      if (s(qs.mailbox) === 'crm') rows = rows.filter(r => r.mailbox === 'crm');
      rows = X.collapse(await applyLinks(rows));
      rows = X.filter(rows, { q: qs.q, addr: qs.addr, dir: qs.dir, src: qs.src, att: qs.att === '1', from: qs.from, to: qs.to, pid: qs.pid, cust: qs.cust, emails: s(qs.emails).split(',').filter(Boolean) });
      return J(200, { ok: true, configured: G.configured(), total: rows.length, rows: rows.slice(offset, offset + limit), offset, limit }, C);
    }
    if (op === 'get' || op === 'thread') {
      const box = low(qs.mailbox), id = s(qs.id);
      if (!box || !id) return J(400, { ok: false, error: 'Which mailbox and message?' }, C);
      if (!G.configured()) return J(200, { ok: false, configured: false, error: 'Gmail reading is not set up yet.', setup: SETUP }, C);
      if ((await mailboxes()).indexOf(box) < 0) return J(403, { ok: false, error: 'Not a GrayCo mailbox.' }, C);
      if (op === 'thread') { const rows = await G.thread(box, id); return J(200, { ok: true, rows }, C); }
      const g = await G.full(box, id);
      await X.logAccess(who.email, g.row);
      return J(200, { ok: true, row: g.row, body: g.body, gmail: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(box) + '#all/' + encodeURIComponent(g.row.thread || id) }, C);
    }
    return J(400, { ok: false, error: 'Bad request.' }, C);
  } catch (e) {
    if (e && e.code === 'not_configured') return J(200, { ok: false, configured: false, error: e.message, setup: SETUP }, C);
    return J(e && e.code === 'denied' ? 502 : 503, { ok: false, error: 'All GrayCo e-mail is busy — ' + s(e && e.message) }, C);
  }
};
