// netlify/functions/appr-away.js — patch AWAY: 🏖 Away (no notifications while away; the Gmail auto-reply), phone
// notifications for approvals (staff push subscriptions), the approval audit and 📊 Approvals this week.
// POST { op } from the CRM with the person's sign-in (the page adds it). Staff only; the admin-only ops are marked.
//   state                     → my away record, every admin's upcoming away, my phones (never the address), the push key
//   set {email?, from, to?, cover?, summary?, replyText?}   (admin) turn Away on — for myself, or (admin area) another admin
//   off {email?}              (admin) turn it off now (the Gmail auto-reply too)
//   subscribe {sub, device} / unsubscribe {endpoint} / test   my own phone(s)
//   feed {items}              (admin) the CRM-only approvals waiting on admins (_lib/apprping.js)
//   audit {rec}               one approval decision, from this device (who = the sign-in, never the page)
//   week                      (admin) 📊 Approvals this week
//   ping                      (admin) run the approval pings now
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const portal = require('./portal.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function AW(){ return require('./_lib/away.js'); }
function SP(){ return require('./_lib/staffpush.js'); }
function PG(){ return require('./_lib/apprping.js'); }
function VAC(){ return require('./_lib/vacation.js'); }
function pub(r){ return r && { id: s(r.id), email: low(r.email), name: s(r.name), from: s(r.from), to: s(r.to), cover: low(r.cover), coverName: s(r.coverName), summary: r.summary === true, replyText: s(r.replyText), setBy: s(r.setBy), setAt: s(r.setAt), vacation: r.vacation || null, sentence: AW().sentence(r) }; }

async function people(){
  const C = portal._core; let data = {}; try { data = await C.crmData(true); } catch (e) {}
  const users = arr(data.users).filter(function(u){ return u && u.active !== false && /@/.test(s(u.email)); });
  const admins = C.adminEmails(data);
  const nameOf = function(e){ const u = users.filter(function(x){ return low(x.email) === low(e); })[0]; return s(u && u.name) || low(e); };
  return { admins: admins, list: admins.map(function(e){ return { email: e, name: nameOf(e) }; }), nameOf: nameOf };
}
function otherFor(rec, P){
  const e = low(rec.cover) || P.admins.filter(function(x){ return x !== low(rec.email); })[0] || '';
  return e ? { email: e, name: P.nameOf(e) } : null;
}
async function act(body, who){
  const op = s(body.op) || 'state', now = Date.now();
  const admin = !!who.admin;
  if (op === 'state') {
    const list = await AW().load(true), up = AW().upcoming(list, now), P = admin ? await people() : null;
    const K = SP().keys(), subs = await SP().subsOf(who.email);
    let cov = {};
    try { const v = await portal._core.kvRead([PG().STATE]); const st = v[PG().STATE] || {}; cov = (st.covered && st.covered[low(who.email)]) || {}; } catch (e) {}
    return { status: 200, out: { ok: true, me: { email: low(who.email), admin: admin }, today: AW().ymdC(now), mine: pub(up.filter(function(r){ return low(r.email) === low(who.email); }).sort(function(a, b){ return s(b.setAt).localeCompare(s(a.setAt)); })[0] || null),
      activeMine: !!AW().activeMap(list, now)[low(who.email)], away: up.map(pub), admins: P ? P.list : [],
      push: { ready: !!K, key: K ? K.pub : '', devices: subs.length, on: SP().hasOn(subs, body.endpoint), list: subs.map(function(x){ return { device: s(x.device) || 'phone', at: s(x.at) }; }) }, covered: cov,
      defaultText: P ? VAC().defaultText({ to: s(body.to) }, otherFor({ email: low(body.email) || low(who.email), cover: low(body.cover) }, P)) : '' } };
  }
  if (op === 'set' || op === 'off') {
    if (!admin) return { status: 403, out: { ok: false, error: 'Away is for admins (Wesley, Nick).' } };
    const P = await people(), email = low(body.email) || low(who.email);
    if (op === 'off') {
      let ended = null;
      const r = await AW().update(function(l){ let ch = false; l.forEach(function(x){ if (x && low(x.email) === email && !x.endedAt) { x.endedAt = new Date(now).toISOString(); x.endedBy = low(who.email); ended = x; ch = true; } }); return ch ? { list: l, check: function(){ return true; }, result: ended } : null; });
      if (!r.ok) return { status: 502, out: { ok: false, error: 'Could not save it — try again.' } };
      let vac = null; if (ended) { try { vac = await VAC().set(ended, otherFor(ended, P), false); } catch (e) { vac = { ok: false, error: 'Google could not be reached.' }; } }
      return { status: 200, out: { ok: true, off: true, was: pub(ended), vacation: vac } };
    }
    const today = AW().ymdC(now);
    const rec = { id: 'AW' + now.toString(36), email: email, name: P.nameOf(email), from: s(body.from) || today, to: s(body.to), cover: low(body.cover) || (P.admins.filter(function(x){ return x !== email; })[0] || ''),
      summary: body.summary === true, replyText: s(body.replyText).slice(0, 1500), setBy: low(who.email), setAt: new Date(now).toISOString() };
    rec.coverName = rec.cover ? P.nameOf(rec.cover) : '';
    const bad = AW().check(rec, P.admins, now);
    if (bad) return { status: 400, out: { ok: false, error: bad } };
    if (/insurance|carrier|sub ?portal|subportal/i.test(rec.replyText)) return { status: 400, out: { ok: false, error: 'Keep insurance carriers and the sub portal out of the auto-reply.' } };
    let vac = null; try { vac = await VAC().set(rec, otherFor(rec, P), true); } catch (e) { vac = { ok: false, error: 'Google could not be reached.' }; }
    rec.vacation = { ok: !!(vac && vac.ok), needReconnect: !!(vac && vac.needReconnect), error: s(vac && vac.error), at: rec.setAt };
    const r = await AW().update(function(l){ l.forEach(function(x){ if (x && low(x.email) === email && !x.endedAt) { x.endedAt = rec.setAt; x.endedBy = low(who.email); x.replaced = rec.id; } }); return { list: l.concat([rec]).slice(-60), check: function(l2){ return l2.some(function(x){ return x && x.id === rec.id; }); }, result: rec }; });
    if (!r.ok) return { status: 502, out: { ok: false, error: 'Could not save it — try again.' } };
    return { status: 200, out: { ok: true, away: pub(rec), vacation: rec.vacation } };
  }
  if (op === 'subscribe') { const r = await SP().subscribe(who.email, body.sub, { device: body.device, ua: body.ua }); return { status: r.ok ? 200 : 400, out: r }; }
  if (op === 'unsubscribe') return { status: 200, out: await SP().unsubscribe(who.email, body.endpoint) };
  if (op === 'test') {
    const r = await SP().send([who.email], { title: '🔔 GrayCo CRM — notifications are on', body: 'New approvals will show here. Tap to open your approvals.', url: (s(process.env.CRM_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, '') + '/#apx=mine', tag: 'gc-test' }, { noAway: true });
    return { status: 200, out: { ok: r.sent > 0, sent: r.sent, why: r.why || (r.sent ? '' : 'No phone answered — turn notifications on again on that phone.') } };
  }
  if (op === 'feed') { if (!admin) return { status: 403, out: { ok: false, error: 'Admins only.' } }; return { status: 200, out: await PG().feed(who.email, body.items) }; }
  if (op === 'audit') {
    const rec = Object.assign({}, body.rec || {}, { by: s(who.name) || s(body.rec && body.rec.by) || low(who.email), email: low(who.email), role: admin ? 'admin' : s(who.role) });
    return { status: 200, out: await PG().audit(rec) };
  }
  if (op === 'week') { if (!admin) return { status: 403, out: { ok: false, error: 'Admins only.' } }; return { status: 200, out: await PG().week() }; }
  if (op === 'ping') { if (!admin) return { status: 403, out: { ok: false, error: 'Admins only.' } }; return { status: 200, out: await PG().run({ force: true }) }; }
  return { status: 400, out: { ok: false, error: 'Bad request' } };
}
exports._act = act;
exports.handler = async function(event){
  event = event || {};
  const C = portal._core, cors = C.gcCors(event, 'POST, OPTIONS');
  const headers = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'POST only' }) };
  const who = await C.gcStaffAuth(event);
  if (!who.ok) return { statusCode: who.statusCode || 401, headers, body: JSON.stringify({ ok: false, error: who.error }) };
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Bad request' }) }; }
  try { const a = await act(body, who); return { statusCode: a.status, headers, body: JSON.stringify(a.out) }; }
  catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Something went wrong: ' + s(e && e.message).slice(0, 120) }) }; }
};
