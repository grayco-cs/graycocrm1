/* ============================================================================
   GrayCo — "✋ I'm bidding" / "🚫 Not bidding", job views from the sub portal, and the bid-due reminders a sub sees.
   netlify/functions/_lib/bidintent.js   (patch BIDREMIND2, owner 11/23: "on jobs people click yes to bidding on or if they open a
   project at all send follow up notifications and emails when its within 3 days of being due and the day its being due")

   Used by subportal.js (the bid site: actions bid-intent, my-bidstate, notes-read) and portal-access.js (the sub portal's 📋 Jobs to bid:
   p-bid-intent, p-bid-view, p-bid-note-read). Rows in sp_rows:
     intents   id <jobId>__<userId>  { intent: 'yes' | 'no' | '' , at, via }   — the sub's own answer, changeable any time
     activity  kind 'view' (the bid site already logs one when a sub opens a job; the sub portal now does too, once a day per job)
     duenotes  written by _lib/bidmail.js dueReminders (the scheduled run): the reminder = the notification; readAt when dismissed
   Only the sub's own rows; only for a job they may see (subportal subScope). Never anyone else's name.
   ========================================================================== */
'use strict';
function SP(){ return require('../subportal.js')._hub; }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function fail(code, msg){ const e = new Error(msg); e.status = code; return e; }
const INTENTS = ['yes', 'no', ''];

async function setIntent(who, sc, jobId, intent, via){
  const H = SP(), me = s(who.profile && who.profile.id);
  if (!who.approved) throw fail(403, 'Your account is waiting for GrayCo to approve it.');
  intent = s(intent); if (INTENTS.indexOf(intent) < 0) throw fail(400, 'Bidding or not bidding?');
  if (!sc || !sc.jobs || !sc.jobs[s(jobId)]) throw fail(403, 'That job is not open to you.');
  const p = who.profile || {}, id = s(jobId) + '__' + me;
  const rec = { id: id, jobId: s(jobId), userId: me, userEmail: low(p.email || who.email), userName: s(p.name), userCompany: s(p.company), role: s(p.role), intent: intent, at: new Date().toISOString(), via: via === 'portal' ? 'portal' : 'bidsite' };
  await H.upsertRows([H.rowFor('intents', rec)], low(who.email) || 'bid site');
  return { ok: true, jobId: s(jobId), intent: intent };
}
async function logView(who, sc, jobId, via){
  const H = SP(), me = s(who.profile && who.profile.id);
  if (!sc || !sc.jobs || !sc.jobs[s(jobId)]) return { ok: false };
  const day = new Date().toISOString().slice(0, 10), id = 'a_pv_' + (s(jobId) + '_' + me + '_' + day).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 120);
  if (await H.getRow('activity', id)) return { ok: true, already: true };
  const p = who.profile || {};
  await H.upsertRows([H.rowFor('activity', { id: id, jobId: s(jobId), userId: me, userName: s(p.name), userCompany: s(p.company), kind: 'view', via: via === 'portal' ? 'portal' : 'bidsite', at: new Date().toISOString() })], low(who.email) || 'portal');
  return { ok: true };
}
/* the sub's own reminders (newest first, the last 45 days) and their answers */
async function stateOf(userId, jobIds){
  const H = SP(), since = new Date(Date.now() - 45 * 864e5).toISOString();
  let notes = [], intents = {};
  try { notes = (await H.listRows([H.eq('collection', 'duenotes'), H.eq('user_id', s(userId))])).map(function(r){ return r.data || {}; }); } catch (e) { notes = []; }
  try { (await H.listRows([H.eq('collection', 'intents'), H.eq('user_id', s(userId))])).forEach(function(r){ const d = r.data || {}; if (d.intent) intents[s(d.jobId)] = d.intent; }); } catch (e) {}
  if (Array.isArray(jobIds)) { const ok = {}; jobIds.forEach(function(x){ ok[s(x)] = 1; }); notes = notes.filter(function(n){ return ok[s(n.jobId)]; }); }
  notes = notes.filter(function(n){ return s(n.at) >= since; }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }).slice(0, 30)
    .map(function(n){ return { id: s(n.id), jobId: s(n.jobId), step: s(n.step), due: s(n.due), title: s(n.title), body: s(n.body), at: s(n.at), readAt: s(n.readAt) }; });
  return { notes: notes, intents: intents };
}
async function markRead(userId, ids){
  const H = SP(); let n = 0; const at = new Date().toISOString();
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 50)) {
    const r = await H.getRow('duenotes', s(id)); const d = r && r.data;
    if (!d || s(d.userId) !== s(userId) || d.readAt) continue;
    await H.upsertRows([H.rowFor('duenotes', Object.assign({}, d, { readAt: at }))], 'reader'); n++;
  }
  return { ok: true, read: n };
}
module.exports = { setIntent, logView, stateOf, markRead, INTENTS };
