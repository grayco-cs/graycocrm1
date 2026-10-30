// netlify/functions/mail-sent.js — patch SENTLOG: "📤 Sent by the CRM" + "📬 Waiting on a reply" (owner 10/24: "I want to
// be able to see my auto and resend e-mails … office and admin to see those e-mails so they can follow up on them if
// someone ignores, say, an insurance request"). The rules are in _lib/sentlog.js.
//   Who: admins and the office see everything; a PM sees only the e-mail about his own jobs (list / get); nobody else.
//   GET  ?op=list&type=&status=&pid=&waiting=1&q=&months=1..3&offset=&limit=   → what the CRM sent, newest first
//   GET  ?op=get&id=                                                            → one e-mail as it was sent (its body)
//   GET  ?op=followups                                                          → waiting (overdue first) + answered in 14 days
//   POST ?op=resend {id}                                                        → "📨 Resend reminder" (office / admins)
//   POST ?op=resolve {id, note}                                                 → "✓ Mark resolved" (office / admins)
//   GET|POST ?op=settings {track, days}                                         → which types wait on a reply, days (POST: admins)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const X = require('./_lib/mailidx.js');
const SL = require('./_lib/sentlog.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function env(k){ return s(process.env[k]); }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function BI(){ return require('./bid-inbox.js'); }

/* who is calling: admin · office · pm (his jobs only) · none */
async function whoIs(event){
  const who = exports._auth ? await exports._auth(event) : await BI()._test.staffAuth(event);
  if (!who.ok) return who;
  let profile = '', payroll = false;
  if (!exports._auth) { try { const r = await BI()._lib.sb('gc_staff?select=*&email=eq.' + encodeURIComponent(low(who.email))); if (r && r.ok) { const row = arr(await r.json())[0] || {}; profile = s(row.profile); payroll = row.payroll === true; } } catch (e) {} }
  else { profile = s(who.profile); payroll = who.payroll === true; }
  const tag = low(who.role) + ' ' + low(profile);
  /* office = the office profile (or payroll, which only the office has); marketing sees none; everyone else: his own jobs */
  who.level = who.admin ? 'admin' : /office/.test(tag) || payroll || who.office === true ? 'office' : /market/.test(tag) ? 'none' : 'pm';   /* patch OFFICEFULL: who.office */
  return who;
}
async function projects(){ try { return arr((await X.crmData(['projects'])).projects); } catch (e) { return []; } }
function pmJobs(list, who){
  const em = low(who.email), nm = low(who.name);
  return list.filter(p => p && (low(p.pmEmail) === em || (nm && (low(p.pm || p.projectManager) === nm || low(p.apm) === nm)) || arr(p.team).some(t => low(t && (t.email || t)) === em)))
    .map(p => s(p.id));
}
function fuView(f){
  return { id: f.id, type: f.type, label: f.label, to: f.to, who: f.who || arr(f.to)[0], phone: f.phone || '', subject: f.subject, fromName: f.fromName, from: f.from, pid: f.pid, at: f.at, due: f.due,
    status: f.status, n: f.n | 0, esc: f.esc || '', bounced: f.bounced || '', overdue: f.status === 'waiting' && s(f.due) <= SL.nowIso(), answer: f.answer || null, why: f.why || '', how: f.how || '', doneAt: f.doneAt || '', hist: arr(f.hist).slice(-8) };
}
async function crmRows(months){
  const out = [], now = new Date();
  for (let i = 0; i < Math.max(1, Math.min(3, months || 2)); i++) out.push(...arr(await X.get(X.crmKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString()))));
  return out;
}

exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase(), op = s(qs.op) || 'list';
  if (m === 'OPTIONS') return J(200, {}, C);
  const who = await whoIs(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  if (who.level === 'none') return J(403, { ok: false, error: 'Only the office, the admins and a job\'s PM can see the e-mail the CRM sent.' }, C);
  const staffWide = who.level === 'admin' || who.level === 'office';
  let body = {}; if (m === 'POST') { try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); } }
  try {
    if (op === 'settings') {
      if (m === 'POST') { if (!staffWide) return J(403, { ok: false, error: 'Only an admin or the office can change this.' }, C);   /* patch OFFICEFULL */ return J(200, { ok: true, settings: await SL.saveSettings(body, who.email) }, C); }
      return J(200, { ok: true, settings: await SL.settings(), types: SL.TYPES }, C);
    }
    if (op === 'followups') {
      if (!staffWide) return J(403, { ok: false, error: 'Only the office and the admins follow up on e-mail.' }, C);
      const cut = new Date(Date.parse(SL.nowIso()) - 14 * 864e5).toISOString();
      const l = (await SL.followups()).filter(f => f.status === 'waiting' || s(f.doneAt) >= cut).map(fuView);
      const rank = f => f.status !== 'waiting' ? 9 : f.esc === 'asap' ? 0 : f.esc === 'soon' || f.bounced ? 1 : f.overdue ? 2 : 3;
      l.sort((a, b) => rank(a) - rank(b) || s(a.status === 'waiting' ? a.due : b.doneAt).localeCompare(s(a.status === 'waiting' ? b.due : a.doneAt)));
      const waiting = l.filter(f => f.status === 'waiting');
      return J(200, { ok: true, rows: l, counts: { waiting: waiting.length, overdue: waiting.filter(f => f.overdue || f.bounced).length, escalated: waiting.filter(f => f.esc).length } }, C);
    }
    if (op === 'resolve' && m === 'POST') {
      if (!staffWide) return J(403, { ok: false, error: 'Only the office and the admins can do this.' }, C);
      return J(200, await SL.resolve(s(body.id), who.email, body.note), C);
    }
    if (op === 'resend' && m === 'POST') {
      if (!staffWide) return J(403, { ok: false, error: 'Only the office and the admins can do this.' }, C);
      const r = await SL.resend(s(body.id), who.email);
      return J(r.ok ? 200 : 400, r, C);
    }
    if (op === 'list' || op === 'get') {
      const plist = await projects(), mine = staffWide ? null : pmJobs(plist, who);
      const pname = {}; plist.forEach(p => { if (p && p.id) pname[s(p.id)] = s(p.name || p.address || p.id); });
      const fus = {}; (await SL.followups()).forEach(f => { fus[f.id] = f; });
      const view = r => { const type = r.type || SL.classify(r, {}); const f = fus[r.id];
        return { id: r.id, at: r.at, src: r.src, to: r.to, cc: r.cc, from: r.from, fromName: r.fromName, subject: r.subject, snippet: r.snippet, status: r.status, dlv: r.dlv || '', dlvAt: r.dlvAt || '', att: r.att,
          type, typeLabel: (SL.TYPES[type] || SL.TYPES.other).label, via: r.via || '', by: r.via === 'personal' || !r.via ? (r.fromName || r.from) : 'automatic (' + r.via + ')',
          pid: r.pid, job: r.pid ? pname[r.pid] || '' : '', wait: f ? { status: f.status, overdue: f.status === 'waiting' && s(f.due) <= SL.nowIso(), due: f.due, n: f.n | 0, esc: f.esc || '', answer: f.answer || null, why: f.why || '' } : null }; };
      let rows = (await crmRows(parseInt(qs.months, 10) || 2)).filter(r => r && (r.src === 'crm' || r.src === 'sms'));
      if (op === 'get') {
        const r = rows.find(x => x.id === s(qs.id)); if (!r) return J(404, { ok: false, error: 'Not found (only the last 3 months are kept here).' }, C);
        if (mine && mine.indexOf(s(r.pid)) < 0) return J(403, { ok: false, error: 'Only that job\'s PM, the office or an admin can open it.' }, C);
        return J(200, { ok: true, row: view(r), body: await SL.bodyOf(r.id, r.at), followup: fus[r.id] ? fuView(fus[r.id]) : null }, C);
      }
      if (mine) rows = rows.filter(r => r.pid && mine.indexOf(s(r.pid)) >= 0);
      const seen = {}; rows = rows.filter(r => seen[r.id] ? false : (seen[r.id] = 1)).sort((a, b) => s(b.at).localeCompare(s(a.at))).map(view);
      const q = low(qs.q);
      rows = rows.filter(r => (!qs.type || r.type === qs.type) && (!qs.pid || r.pid === s(qs.pid))
        && (!qs.status || (qs.status === 'bounced' ? r.dlv === 'bounced' || r.dlv === 'complained' : qs.status === 'delivered' ? r.dlv === 'delivered' : r.status === qs.status))
        && (qs.waiting !== '1' || (r.wait && r.wait.status === 'waiting'))
        && (!q || (low(r.subject) + ' ' + arr(r.to).join(' ') + ' ' + low(r.fromName) + ' ' + low(r.job) + ' ' + low(r.snippet)).indexOf(q) >= 0));
      const limit = Math.max(1, Math.min(200, parseInt(qs.limit, 10) || 100)), offset = Math.max(0, parseInt(qs.offset, 10) || 0);
      const counts = {}; rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
      return J(200, { ok: true, total: rows.length, rows: rows.slice(offset, offset + limit), offset, limit, counts, level: who.level, types: SL.TYPES }, C);
    }
    return J(400, { ok: false, error: 'Bad request.' }, C);
  } catch (e) {
    return J(503, { ok: false, error: 'The sent-mail list is busy — ' + s(e && e.message) }, C);
  }
};
