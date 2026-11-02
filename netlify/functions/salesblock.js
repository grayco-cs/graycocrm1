// netlify/functions/salesblock.js — patch SALESBLOCK: 🧹 Sales & spam + 🚫 Blocked (admins and the office only).
// Owner 11/01: "Don't let calls like this go through and block them." The filter itself is _lib/salesguard.js (every
// inbound path asks it); this is the CRM's side:
//   GET  ?list=1                → { held (waiting for review), done (the last 40 handled), block (the block list), counts, log }
//   GET  ?count=1               → { held: N } (the quiet "🧹 Sales & spam (N)" line on Leads)
//   POST ?act=block   { phone?, email?, domain?, id?, sig? } → add to the block list (sig: the signed link in an alert text)
//   POST ?act=unblock { phone?, email?, domain? }
//   POST ?act=notspam { id }    → "Not spam → make lead": the lead is filed (or let back into the Lead Inbox) and alerted as
//                                 usual; the sender is never filtered again (allow list)
//   POST ?act=dismiss { id }    → keep it as spam (off the list)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const SGL = require('./_lib/salesguard.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function env(k){ return s(process.env[k]); }
function nowIso(){ return new Date().toISOString(); }
function L(){ return require('./bid-inbox.js')._lib; }
function T(){ return require('./bid-inbox.js')._test; }
function WI(){ return require('./website-intake.js')._lib; }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function G(){ return SGL.def(); }
function slim(x){ const o = Object.assign({}, x); delete o.refile; o.canLead = !!(x.leadId || (x.refile && x.refile.f)); return o; }

async function makeLead(item, who){
  await G().allow({ phone: item.phone, email: item.email }, who.email);
  /* caught when it was already a lead (any source): let it back into the Lead Inbox and alert it now */
  if (item.leadId) {
    let rec = null;
    await L().kvCas(L().KV, v => { const l = arr(v), x = l.find(y => y && s(y.id) === s(item.leadId)); if (!x) return undefined;
      if (x.status === 'dismissed' && x.dismissedBy === 'Sales & spam filter') { x.status = 'new'; delete x.dismissedBy; delete x.dismissReason; }
      x.leadExtra = Object.assign({}, x.leadExtra, { notSpam: true, notSpamBy: low(who.email) }); x.updatedAt = nowIso(); rec = x; return l; });
    if (!rec) return { code: 404, body: { ok: false, error: 'That lead is no longer in the Lead Inbox — add it by hand.' } };
    let alerts = null; try { alerts = await WI().alertLead(rec); } catch (e) {}
    return { code: 200, body: { ok: true, leadId: s(rec.id), restored: true, alerted: !!alerts } };
  }
  const rf = item.refile;
  if (!rf || !rf.f) return { code: 409, body: { ok: false, error: 'This one cannot be made into a lead automatically — add it by hand (Leads → ＋).' } };
  const extra = Object.assign({}, rf.extra || {});
  extra.leadExtra = Object.assign({}, extra.leadExtra || {}, { notSpam: true, notSpamBy: low(who.email) });
  extra.notes = arr(extra.notes).concat(['Was held in 🧹 Sales & spam (' + s(item.why).slice(0, 160) + ') — marked "not spam" by ' + (s(who.name) || low(who.email)) + '.']);
  const r = await WI().fileLead(rf.f, extra);
  let alerts = null; if (r.action === 'added') { try { alerts = await WI().alertLead(r.rec); } catch (e) {} }
  if (item.via === 'sms' && item.phone) { try { await require('./missed-call.js')._test.stateCas(st => { st.owner[item.phone] = { lead: r.id, at: nowIso() }; return true; }); } catch (e) {} }   /* their next text joins this lead */
  return { code: 200, body: { ok: true, leadId: r.id, action: r.action, alerted: !!alerts } };
}

exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase();
  if (m === 'OPTIONS') return J(200, {}, C);
  const who = await T().staffAuth(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  if (!(who.admin || who.office)) return J(403, { ok: false, error: 'Only an admin or the office can see Sales & spam and the block list.' }, C);
  try {
    if (m === 'GET' && qs.count) { const st = await G().store(); return J(200, { ok: true, held: st.list.filter(x => x.status === 'held').length }, C); }
    if (m === 'GET' && qs.list) {
      const st = await G().store(), block = await G().blockList(true);
      const held = st.list.filter(x => x.status === 'held').reverse().map(slim);
      const done = st.list.filter(x => x.status !== 'held').sort((a, b) => s(b.doneAt || b.at).localeCompare(s(a.doneAt || a.at))).slice(0, 40).map(slim);
      return J(200, { ok: true, held, done, block, counts: st.counts, log: st.log.slice(-150).reverse() }, C);
    }
    if (m !== 'POST') return J(400, { ok: false, error: 'Bad request.' }, C);
    let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
    const act = s(qs.act || b.act);
    const findItem = async () => (await G().store()).list.find(x => x.id === s(b.id)) || null;
    if (act === 'block') {
      const item = b.id ? await findItem() : null;
      const phone = SGL.cleanBlock({ phones: [b.phone || (item && item.phone)] }).phones[0] || '';
      const email = low(b.email || (item && item.email));
      const domain = low(b.domain);
      if (s(b.sig) && !SGL.sigOk(phone, b.sig)) return J(400, { ok: false, error: 'That block link is not valid — block the number from the CRM instead.' }, C);
      if (!phone && !email && !domain) return J(400, { ok: false, error: 'Add a 10-digit phone number, an e-mail address or a domain.' }, C);
      if (/(^|[@.])grayco-cs\.com$/.test(email || domain)) return J(400, { ok: false, error: 'GrayCo addresses cannot be blocked.' }, C);
      const block = await G().block({ phone, email, domain }, who.email);
      if (item) await G().setStatus(item.id, 'blocked', who.email);
      return J(200, { ok: true, block, blocked: { phone, email, domain } }, C);
    }
    if (act === 'unblock') {
      const block = await G().unblock({ phone: b.phone, email: b.email, domain: b.domain }, who.email);
      return J(200, { ok: true, block }, C);
    }
    if (act === 'notspam' || act === 'dismiss') {
      const item = await findItem(); if (!item) return J(404, { ok: false, error: 'Not found — refresh the list.' }, C);
      if (act === 'dismiss') { await G().setStatus(item.id, 'dismissed', who.email); return J(200, { ok: true }, C); }
      if (item.status === 'lead') return J(200, { ok: true, leadId: s(item.leadMade), already: true }, C);
      const r = await makeLead(item, who);
      if (r.body.ok) await G().setStatus(item.id, 'lead', who.email, { leadMade: s(r.body.leadId) });
      return J(r.code, r.body, C);
    }
    return J(400, { ok: false, error: 'Bad request.' }, C);
  } catch (e) { return J(503, { ok: false, error: 'Busy — try again (' + s(e && e.message) + ').' }, C); }
};
exports._t = { makeLead };
