/* ============================================================================
   GrayCo — 🩺 MONTHLY CRM HEALTH E-MAIL + 🌀 EQUIPMENT-ON-SITE REMINDER (patch AUTO13).
   netlify/functions/_lib/health13.js  (used by netlify/functions/crm-health.js)

   Owner (10/22): "Monthly CRM health e-mail to you … backups completed, storage used, e-mail receiving working,
   failed automations or errors, logins, approvals stuck over 48 hours. One short e-mail so you know everything is
   running." and "Mitigation equipment billing … a daily reminder for equipment still placed more than N days".

   report()  → { items: [{ k, label, status: 'green'|'amber'|'red', text }], at }   (read-only — changes nothing)
   send(rep) → one e-mail from noreply@ to the admins only (gc_staff / users admins + OWNER_EMAILS)
   equipRun()→ claims (gc_kv "gc_claims") with equipment on site longer than N days (claims settings
               drying.eqRemindDays, default 5) → one shared Office To-Do per claim + equipment day (fixed id, so once)
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
let CORE = null; function core(){ return CORE || require('../portal.js')._core; }
function L(){ return require('../bid-inbox.js')._lib; }
const D = { core: null, lib: null, now: null, fetch: null, usage: null };   /* tests swap these */
function C(){ return D.core || core(); }
function B(){ return D.lib || L(); }
function now(){ return D.now ? D.now() : Date.now(); }
function hoursAgo(iso){ const t = Date.parse(s(iso)); return isFinite(t) ? (now() - t) / 3600e3 : Infinity; }
function ago(iso){ const h = hoursAgo(iso); if (!isFinite(h)) return 'never'; if (h < 1) return 'within the hour'; if (h < 48) return Math.round(h) + ' h ago'; return Math.round(h / 24) + ' days ago'; }
/* the newest ISO time anywhere in a value (status objects differ per feature) */
function newest(v, depth){
  let best = ''; depth = depth || 0; if (depth > 5 || v == null) return best;
  if (typeof v === 'string') return /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) ? v : '';
  if (Array.isArray(v)) { v.slice(-200).forEach(function(x){ const t = newest(x, depth + 1); if (t > best) best = t; }); return best; }
  if (typeof v === 'object') Object.keys(v).slice(0, 200).forEach(function(k){ const t = newest(v[k], depth + 1); if (t > best) best = t; });
  return best;
}
function errorsIn(v, depth, out){
  out = out || []; depth = depth || 0; if (depth > 4 || !v || typeof v !== 'object' || out.length > 5) return out;
  Object.keys(v).slice(0, 100).forEach(function(k){ const x = v[k]; if (/^(error|err|lastError)$/i.test(k) && s(x) && typeof x !== 'object') out.push(s(x).slice(0, 120)); else if (x && typeof x === 'object') errorsIn(x, depth + 1, out); });
  return out;
}
function item(k, label, status, text){ return { k: k, label: label, status: status, text: text }; }

/* ── the checks ── */
async function backups(){
  try {
    /* patch AUTOFIX-BACKUP: the CRM's own data is the gc_kv snapshot. The newest row of ANY table said "green" even when
       the big gc_kv snapshot failed every night (only the small tables saved) — so the gc_kv row is checked itself. */
    const r = await B().sb('gc_backups?select=taken_at,row_count&source=eq.gc_kv&order=taken_at.desc&limit=1');
    if (!r.ok) return item('backup', 'Nightly backup', 'amber', r.status === 404 ? 'The backup table is not set up (docs/security-prepare.sql).' : 'Could not read the backups (' + r.status + ').');
    const row = arr(await r.json())[0]; const at = s(row && row.taken_at);
    if (!at) return item('backup', 'Nightly backup', 'red', 'No backup of the CRM data (gc_kv) has been saved yet — check the gc-backup log on Netlify.');
    const h = hoursAgo(at);
    return item('backup', 'Nightly backup', h < 36 ? 'green' : h < 72 ? 'amber' : 'red', 'Last backup of the CRM data ' + ago(at) + (row && row.row_count != null ? ' (' + row.row_count + ' rows)' : '') + '.' + (h >= 36 ? ' Check the gc-backup log on Netlify.' : ''));
  } catch (e) { return item('backup', 'Nightly backup', 'amber', 'Could not check the backups.'); }
}
async function storage(){
  try {
    const U = D.usage || require('../storage-usage.js')._test;
    const u = await U.usage(), st = obj(await B().kvGet('gc_storage_settings'));
    if (u.needsSql) return item('storage', 'File storage', 'amber', 'Not counted yet — run docs/storage-usage.sql once in Supabase.');
    const gb = (u.totals && u.totals.bytes || 0) / 1073741824, lim = Number(st.storageGb) || 100, warn = Number(st.warnPct) || 80, pct = lim ? gb / lim * 100 : 0;
    return item('storage', 'File storage', pct >= warn ? 'red' : pct >= warn - 15 ? 'amber' : 'green', gb.toFixed(1) + ' GB of ' + lim + ' GB used (' + Math.round(pct) + '%).' + (u.dbBytes != null ? ' Database ' + (u.dbBytes / 1073741824).toFixed(2) + ' GB.' : ''));
  } catch (e) { return item('storage', 'File storage', 'amber', 'Could not read storage.'); }
}
const INBOUND = [['gc_lead_inbox_alerts', 'Leads & bids (leads@ / bids@ / bid boards)'], ['gc_comms_status', 'Job e-mail history (mail@)']];
async function inbound(){
  const parts = []; let worst = 'green';
  for (const [k, l] of INBOUND) {
    let v = null; try { v = await B().kvGet(k); } catch (e) {}
    const t = newest(v);
    const st = !t ? 'amber' : hoursAgo(t) > 24 * 7 ? 'amber' : 'green';
    if (st !== 'green') worst = 'amber';
    parts.push(l + ': ' + (t ? 'last ' + ago(t) : 'nothing received yet'));
  }
  return item('inbound', 'E-mail into the CRM', worst, parts.join(' · ') + (worst !== 'green' ? ' — if this should be working, check Resend (in.grayco-cs.com) and the Google groups.' : ''));
}
/* patch SALESSPAM: the day's count of filtered sales pitches — the only place they show outside 🗑 Filtered (admins) */
async function salesFiltered(){
  try {
    const SS = require('./salesspam.js');
    const save = SS._D.kvGet; if (D.lib) SS._D.kvGet = function(k){ return B().kvGet(k); };
    let c; try { c = await SS.counts(); } finally { SS._D.kvGet = save; }
    return item('salesspam', 'Sales e-mails filtered', 'green', SS.healthText(c));
  } catch (e) { return item('salesspam', 'Sales e-mails filtered', 'green', 'Not counted yet.'); }
}
const SCHED = [['gc_bid_watch_status', 'Public bid watcher'], ['gc_lead_inbox_alerts', 'Lead alerts & reminders'], ['gc_coi_req_state', 'COI renewal requests'], ['gc_warr_check_state', 'Warranty check-ups'], ['gc_health13_state', 'This health check']];
async function scheduled(){
  const bad = [], errs = []; let ran = 0;
  for (const [k, l] of SCHED) {
    let v = null; try { v = await B().kvGet(k); } catch (e) {}
    if (v == null) continue; ran++;
    const t = newest(v); if (t && hoursAgo(t) > 24 * 3) bad.push(l + ' (last ran ' + ago(t) + ')');
    errorsIn(obj(v)).forEach(function(e){ errs.push(l + ': ' + e); });
  }
  const its = [item('sched', 'Automatic jobs', bad.length ? 'amber' : 'green', bad.length ? 'Not run lately: ' + bad.join(', ') + '.' : ran + ' automatic jobs checked — all ran recently.')];
  its.push(item('errors', 'Errors logged', errs.length ? 'amber' : 'green', errs.length ? errs.slice(0, 5).join(' · ') : 'No errors recorded.'));
  return its;
}
async function approvals(){
  try {
    const d = await C().kvRead(['gc_approval_queue']);
    const l = arr(d.gc_approval_queue).filter(function(x){ return x && /^(waiting|sending)$/.test(s(x.status)) && hoursAgo(x.createdAt) > 48; });
    return item('approvals', 'Approvals waiting over 48 h', l.length > 5 ? 'red' : l.length ? 'amber' : 'green', l.length ? l.length + ' waiting: ' + l.slice(0, 4).map(function(x){ return s(x.title).slice(0, 50); }).join('; ') + (l.length > 4 ? '…' : '') : 'None.');
  } catch (e) { return item('approvals', 'Approvals waiting over 48 h', 'amber', 'Could not read the approvals.'); }
}
async function logins(){
  try {
    const f = D.fetch || fetch, url = s(process.env.SUPABASE_URL).replace(/\/$/, ''), key = s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!url || !key) return item('logins', 'Sign-ins', 'green', 'Not available here.');
    const r = await f(url + '/auth/v1/admin/users?per_page=200', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r.ok) return item('logins', 'Sign-ins', 'green', 'Not available (' + r.status + ').');
    const j = await r.json(), users = arr(j && j.users || j).filter(function(u){ return u && u.email && /@grayco-cs\.com$/i.test(u.email); });
    const month = new Date(now()).toISOString().slice(0, 7), on = users.filter(function(u){ return s(u.last_sign_in_at).slice(0, 7) === month; });
    return item('logins', 'Sign-ins this month', 'green', on.length + ' of ' + users.length + ' people signed in this month' + (users.length ? ': ' + users.map(function(u){ return low(u.email).split('@')[0] + ' ' + (u.last_sign_in_at ? s(u.last_sign_in_at).slice(5, 10) : '—'); }).join(', ') : '') + '.');
  } catch (e) { return item('logins', 'Sign-ins', 'green', 'Not available.'); }
}
function switchedOff(){
  const off = Object.keys(process.env).filter(function(k){ return /_OFF$/.test(k) && env(k) === '1'; }).sort();
  return item('off', 'Automations switched off', off.length ? 'amber' : 'green', off.length ? off.join(', ') + ' (Netlify settings)' : 'None — everything is on.');
}
async function report(){
  const items = [];
  items.push(await backups()); items.push(await storage()); items.push(await inbound()); items.push(await salesFiltered());
  (await scheduled()).forEach(function(x){ items.push(x); });
  items.push(await approvals()); items.push(await logins()); items.push(switchedOff());
  return { at: new Date(now()).toISOString(), items: items, worst: items.some(function(x){ return x.status === 'red'; }) ? 'red' : items.some(function(x){ return x.status === 'amber'; }) ? 'amber' : 'green' };
}
const DOT = { green: '🟢', amber: '🟡', red: '🔴' };
function mail(rep){
  const month = new Date(Date.parse(rep.at) || now()).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Chicago' });
  const subject = DOT[rep.worst] + ' GrayCo CRM health — ' + month;
  const rows = rep.items.map(function(x){ return '<tr><td style="padding:7px 8px;border-bottom:1px solid #eee;white-space:nowrap">' + DOT[x.status] + ' <b>' + esc(x.label) + '</b></td><td style="padding:7px 8px;border-bottom:1px solid #eee;color:#333">' + esc(x.text) + '</td></tr>'; }).join('');
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:680px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">GrayCo CRM health — ' + esc(month) + '</div><div style="padding:8px 18px 18px">' +
    '<p>' + (rep.worst === 'green' ? 'Everything is running.' : 'Most things are running; the items in yellow or red need a look.') + '</p><table style="width:100%;border-collapse:collapse;font:14px Arial">' + rows + '</table>' +
    '<p style="color:#777;font-size:12px;margin-top:16px">Sent to GrayCo admins only, on the 1st of each month (and when an admin presses “Send now” in ⚙ Admin → 🩺 CRM health).</p></div></div>';
  const text = subject + '\n\n' + rep.items.map(function(x){ return '[' + x.status.toUpperCase() + '] ' + x.label + ': ' + x.text; }).join('\n');
  return { subject: subject, html: html, text: text };
}
async function admins(){
  const out = [];
  try { const r = await B().sb('gc_staff?select=email,role,active&role=eq.admin'); if (r.ok) arr(await r.json()).forEach(function(x){ if (x && x.active !== false && okEmail(x.email)) out.push(low(x.email)); }); } catch (e) {}
  (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(okEmail).forEach(function(e){ out.push(e); });
  return Array.from(new Set(out));
}
async function send(rep){
  rep = rep || await report();
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const to = await admins(); if (!to.length) return { ok: false, error: 'no admin e-mail' };
  const m = mail(rep), f = D.fetch || fetch;
  const r = await f('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: m.subject, html: m.html, text: m.text, headers: { 'X-GrayCo-CRM': 'crm-health' } }) });
  if (r && r.ok) return { ok: true, to: to, subject: m.subject };
  /* the e-mail service said no: say what it said (a 403 there is a key or sending-domain problem, not the CRM sign-in) */
  let why = ''; try { why = String(await r.text()).slice(0, 240); } catch (e) {}
  return { ok: false, to: to, subject: m.subject, status: r ? r.status : 0, error: 'The e-mail service (Resend) answered ' + (r ? r.status : 'nothing') + (why ? ': ' + why : '') + ' — check RESEND_API_KEY and the grayco-cs.com sending domain in Resend.' };
}

/* ── equipment on site too long (mitigation) ── */
function ymd(iso){ return s(iso).slice(0, 10); }
async function equipRun(){
  const c = C(); let d = {};
  try { d = await c.kvRead(['gc_claims', 'gc_integration_settings', 'projects', 'users', 'gc_senior_pm']); } catch (e) { return { error: 'read failed' }; }
  const st = obj(d.gc_integration_settings), days = Math.max(1, Number(obj(st.drying).eqRemindDays) || 5), out = { checked: 0, todos: 0, days: days };
  const cl = arr(d.gc_claims).filter(function(x){ return x && x.deleted !== true; });
  for (const x of cl) {
    const on = arr(x.equipment).filter(function(e){ return e && !e.deleted && !e.removedAt && e.placedAt; });
    if (!on.length) continue; out.checked++;
    const oldest = on.map(function(e){ return ymd(e.placedAt); }).sort()[0];
    const age = (now() - Date.parse(oldest + 'T12:00:00Z')) / 864e5;
    if (!(age > days)) continue;
    const p = arr(d.projects).filter(function(q){ return q && s(q.id) === s(x.projectId); })[0] || {};
    let pm = null; try { pm = c.pmOf(d, p); } catch (e) {}
    const n = on.reduce(function(t, e){ return t + (Number(e.qty) || 1); }, 0);
    const it = { id: 'EQLONG_' + s(x.id) + '_' + oldest, kind: 'equip_long', pid: s(x.projectId), assignees: pm && pm.name ? [pm.name] : [], prio: 'high',
      label: '🌀 Equipment on site ' + Math.floor(age) + ' days — ' + (s(x.title) || s(p.name) || 'mitigation job'),
      note: n + ' piece' + (n === 1 ? '' : 's') + ' of drying equipment placed since ' + oldest + ' and not marked removed. Check the readings: if it is dry, pull the equipment and mark it removed (Insurance → the claim → Drying); if it still needs to run, note why for the carrier.' };
    try {
      const has = function(l){ return l.some(function(t){ return t && s(t.id) === it.id; }); };
      const at = nowIso();
      const r = await c.kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([Object.assign({ addedBy: 'GrayCo CRM', addedAt: at, updatedAt: at, done: false }, it)]), check: has }; });
      if (r && r.ok) out.todos++;
    } catch (e) {}
  }
  return out;
}
module.exports = { report: report, send: send, mail: mail, equipRun: equipRun, newest: newest, errorsIn: errorsIn, _D: D };
