/* ============================================================================
   GrayCo — 🧾 NO PO (patch POGUARD).   netlify/functions/po-guard.js   (staff only — the CRM / GrayCo Field)

   GET  ?list=1                      → the No-PO alerts this person may see (admin / office: all; a PM: their jobs';
                                       crew: their own) — and a sweep: one that got its job / PO in the CRM is resolved.
   POST { op: 'flag', items: [...] } → expenses / receipts with no PO (or a PO that is no job's) → one alert each, with the
                                       job suggestion and the notices (_lib/poguard.js). The same receipt never twice.
   POST { op: 'set', id, po | pid }  → the PO / job for that receipt (admin / office; the person who sent it; the PM of its
                                       job) → the alert is resolved, its To-Dos done. Returns the job, so the caller
                                       writes it on the expense (the CRM's own list).
   POST { op: 'ask', id, text }      → 💬 Ask for the PO (admin / office): the sub's portal thread, or the crew member's
                                       Field notice + push. Never an e-mail.
   ========================================================================== */
'use strict';
const PG = require('./_lib/poguard.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (s(process.env.SITE_ORIGIN) || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function T(){ return require('./bid-inbox.js')._test; }
function core(){ return require('./portal.js')._core; }
async function deps(){
  const data = await PG.liveData(core(), ['gc_mail_money_done']);
  return { d: Object.assign(PG.liveDeps(data), exports._deps || {}), data: data };
}
function whoOf(who, data){
  const u = (Array.isArray(data.users) ? data.users : []).filter(function(x){ return x && low(x.email) === low(who.email); })[0] || {};
  return { email: low(who.email), name: s(u.name) || s(who.name) || low(who.email), admin: !!who.admin, office: !!who.office || /office/i.test(s(u.role)) || /^admin$/i.test(s(u.role)) };
}
exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase();
  if (m === 'OPTIONS') return J(200, {}, C);
  const who0 = await T().staffAuth(event); if (!who0.ok) return J(who0.code || 401, { ok: false, error: who0.error }, C);
  try {
    const D = await deps(), data = D.data, who = whoOf(who0, data);
    if (m === 'GET' && qs.list) {
      const mailDone = data.gc_mail_money_done && typeof data.gc_mail_money_done === 'object' ? data.gc_mail_money_done : {};
      return J(200, { ok: true, alerts: await PG.list(who, D.d, { mailDone: mailDone }), me: who, n: PG.digestN() }, C);
    }
    if (m !== 'POST') return J(400, { ok: false, error: 'Unknown request.' }, C);
    let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
    const op = s(b.op);
    if (op === 'flag') {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 100).map(function(it){
        const by = it && it.by || {};
        return { key: s(it.key).slice(0, 120), src: it.src === 'mail' ? 'mail' : 'expense', expId: s(it.expId).slice(0, 90), amt: it.amt, vendor: it.vendor, date: it.date, po: it.po, pid: it.pid,
          merchantAddr: it.merchantAddr, by: { kind: /^(crew|pm|office|admin)$/.test(s(by.kind)) ? s(by.kind) : (by.email ? 'crew' : 'unknown'), name: s(by.name).slice(0, 80), email: low(by.email).slice(0, 120) } };
      }).filter(function(it){ return /^exp:[A-Za-z0-9_.:-]{1,100}$/.test(it.key) && it.expId; });
      return J(200, await PG.flag(items, D.d), C);
    }
    if (op === 'set') {
      const a = await PG.get(b.id, D.d);
      if (!a) return J(404, { ok: false, error: 'That receipt is not on the No-PO list.' }, C);
      if (!PG.canSet(who, a, data, D.d.core)) return J(403, { ok: false, error: 'Only the office, the person who sent it, or the job\'s PM can set its PO.' }, C);
      if (a.status !== 'open') return J(200, { ok: true, already: true, pid: a.setPid, po: a.setPo }, C);
      let p = null;
      if (s(b.po)) { p = PG.jobByPo(b.po, PG.jobs(data)); if (!p) return J(400, { ok: false, error: 'PO "' + s(b.po).slice(0, 40) + '" is not a job\'s PO. Pick the job instead.' }, C); }
      else if (s(b.pid)) { p = PG.jobById(data, b.pid); if (!p) return J(400, { ok: false, error: 'That job is not in the CRM.' }, C); }
      else return J(400, { ok: false, error: 'Pick the job or type its PO.' }, C);
      const po = s(b.po) || PG.poOf(p);
      const r = await PG.resolve([{ id: a.id, pid: s(p.id), po: po, by: who.name, how: s(b.how).slice(0, 30) || 'set' }], D.d);
      if (a.src === 'sub' && a.srid) {   /* the sub's own receipt list shows the job / PO the office set */
        try { await D.d.kv.kvCas(PG.SUBR_KEY, function(v){ const r0 = v && v.list && v.list[a.srid]; if (!r0 || s(r0.pid)) return undefined;
          r0.edits = (Array.isArray(r0.edits) ? r0.edits : []).concat([{ at: new Date().toISOString(), by: who.name, from: { pid: r0.pid, po: r0.po }, to: { pid: s(p.id), po: po } }]).slice(-10); r0.pid = s(p.id); r0.job = s(p.name); r0.po = po; return v; }); } catch (e) {}
      }
      return J(200, { ok: true, pid: s(p.id), job: s(p.name), po: po, alert: (r.alerts || [])[0] || null, kind: a.src, expId: a.expId, srid: a.srid, mailId: a.mailId }, C);
    }
    if (op === 'ask') {
      if (!(who.admin || who.office)) return J(403, { ok: false, error: 'Admins and the office ask for the PO.' }, C);
      const r = await PG.ask(b.id, b.text, who, D.d);
      return J(r.ok ? 200 : (r.code || 400), r, C);
    }
    return J(400, { ok: false, error: 'Unknown request.' }, C);
  } catch (e) { return J(500, { ok: false, error: s(e && e.message) || 'Something went wrong.' }, C); }
};
exports._deps = null;   /* tests: { now } etc. */
