/* ============================================================================
   GrayCo — BID REQUIREMENT REMINDERS (patch BIDSITE3 item I, owner 11/20).   netlify/functions/_lib/bidremind.js
   Owner: "when bids require bid bonds, pre-bid meetings, sealed bids, pre-qualification paperwork etc., make sure to remind me before
   it's due."
   For every OPEN bid (prime or sub; a CRM lead, or a Lead Inbox item not in the CRM yet) whose 📐 plan room details (PLANROOM:
   leadExtra.planRoom / item.planRoom) name requirements, one ladder per requirement:
     bond       bid bond / bid security — order it from the surety (the % / amount)         due: the bid due
     prebid     pre-bid meeting / site walk (time + place; MANDATORY flagged)                 due: the pre-bid
     sealed     a SEALED bid delivered by hand (deliver-by time + address; allow travel)      due: the bid due
     prequal    pre-qualification / registration paperwork                                    due: its own date, else the bid due
     questions  the questions / RFI deadline                                                  due: questions due
     biddue     the bid due itself (only on a bid that has requirements)                      due: the bid due
   Steps: 7 days, 3 days and 1 day before (8:00 AM Central that day) and the MORNING-OF (7:00 AM Central). Each step once only
   (recorded in the lead-inbox kv "gc_bid_remind"); a bid that came in late gets only the step it is in (no catch-up burst).
   Who: the assigned estimator (the lead's estimator / PM) AND Owner 1 / Owner 2 (by role: _lib/owners.js) —
     · a GrayCo STAFF text (smsalert.notify: staff cells, tagged 'staff' — not a customer send; staff quiet hours hold it, the
       morning-of step goes at 7 AM),
     · a CRM To-Do (gc_office_tasks) for those people, one per requirement (updated each step).
   It stops for an item when: its box on the bid card's "✅ Bid requirements checklist" is ticked (the lead's planRoom.checklist), its
   To-Do is ticked done, or someone taps "✓ Done" in the text (bid-inbox ?bidremind_done=<signed token>) — or the bid is closed.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const KEY = 'gc_bid_remind';
const STEPS = [{ k: 'd7', days: 7, at: '08:00', l: 'in 7 days' }, { k: 'd3', days: 3, at: '08:00', l: 'in 3 days' }, { k: 'd1', days: 1, at: '08:00', l: 'TOMORROW' }, { k: 'day', days: 0, at: '07:00', l: 'TODAY' }];
const CLOSED = /^(won|lost|dead|closed|declined|no[- ]?bid|not bidding|archived|deleted|converted|dismissed|submitted)$/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ v = s(v).replace(/\s+/g, ' '); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function BD(){ return require('./bid-due.js'); }
function SA(){ return require('./smsalert.js'); }
function day10(v){ const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(s(v)); return m ? (m[1] + (m[2] ? 'T' + m[2] : '')) : ''; }
function addDays(day, n){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); return d.toISOString().slice(0, 10); }
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/* a date written in a sentence ("by December 1, 2026", "12/01/2026") → YYYY-MM-DD */
function dateIn(t, ref){
  t = s(t); let m = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(t);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i.exec(t);
  if (m) { const y = m[3] ? +m[3] : +s(ref).slice(0, 4) || new Date().getFullYear(); return y + '-' + ('0' + MONTHS[low(m[1]).slice(0, 3)]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  return '';
}
function fmt(due){ try { return BD().fmtDue(due); } catch (e) { return due; } }

/* ── what a bid needs: the requirement items with their due (Central wall time) ── */
function itemsOf(b){
  const pr = obj(b.planRoom), F = obj(pr.fields), ck = arr(pr.checklist), bidDue = day10(b.bidDue || F.bidDue), out = [];
  const pb = obj(F.preBid), pbDue = /^\d{4}-\d{2}-\d{2}$/.test(s(pb.date || b.preBidDate)) ? s(pb.date || b.preBidDate) + (/^\d{2}:\d{2}$/.test(s(pb.time)) ? 'T' + s(pb.time) : '') : day10(b.preBid);
  const mand = pb.mandatory === true || b.preBidMandatory === true, place = s(pb.place || b.preBidLocation);
  const ckDone = kind => { const l = ck.filter(x => x && x.kind === kind); return l.length > 0 && l.every(x => x.done === true); };
  const bonds = arr(F.bonds), bondTxt = s(F.bidBond) ? s(F.bidBond) + ' of the bid' : (bonds.find(x => /bid (bond|security)/i.test(x)) || '');
  if ((s(F.bidBond) || bonds.some(x => /bid (bond|security|guarant)/i.test(x)) || ck.some(x => x && x.kind === 'bond')) && bidDue)
    out.push({ kind: 'bond', due: bidDue, done: ckDone('bond'), text: 'BID BOND — order it from the surety' + (bondTxt ? ' (' + clip(bondTxt, 60) + ')' : '') + '; it goes in with the bid' });
  if (pbDue) out.push({ kind: 'prebid', due: pbDue, done: ckDone('prebid'), mandatory: mand, text: (mand ? 'MANDATORY ' : '') + 'pre-bid / site walk' + (place ? ' at ' + clip(place, 80) : '') });
  const del = s(F.delivery), sealed = /sealed/i.test(del) || /sealed|hand[- ]deliver|physical/i.test(s(b.submitMethod));
  if (sealed && bidDue) { const to = (/delivered to ([^;]+)/i.exec(del) || [])[1] || s(b.submitWhere);
    out.push({ kind: 'sealed', due: bidDue, done: ckDone('sealed'), text: 'SEALED bid — deliver it by hand' + (to ? ' to ' + clip(to, 90) : '') + ' by ' + fmt(bidDue) + ' (allow travel time)' }); }
  const pq = arr(F.prequal).concat(ck.filter(x => x && x.kind === 'prequal').map(x => x.label));
  if (pq.length) { const d = dateIn(pq.join(' '), bidDue) || bidDue.slice(0, 10); if (d) out.push({ kind: 'prequal', due: d, done: ckDone('prequal'), text: 'pre-qualification / registration paperwork — ' + clip(pq[0], 90) }); }
  const qd = day10(F.questionsDue || b.questionsDue);
  if (qd) out.push({ kind: 'questions', due: qd, done: ckDone('questions'), text: 'questions / RFIs deadline' });
  if (out.length && bidDue) out.push({ kind: 'biddue', due: bidDue, done: ckDone('biddue'), text: 'the BID is due' + (s(b.dueToCompany || b.gc) ? ' to ' + clip(b.dueToCompany || b.gc, 50) : '') });
  return out;
}
/* the step a requirement is in right now (null: none — not yet, or past due) */
function stepNow(due, t){
  due = s(due); if (!/^\d{4}-\d{2}-\d{2}/.test(due)) return null;
  const end = BD().wallToEpoch(due.length > 10 ? due : due + 'T23:59'); if (!(end > t)) return null;
  let cur = null;
  STEPS.forEach(st => { const at = BD().wallToEpoch(addDays(due.slice(0, 10), -st.days) + 'T' + st.at); if (at <= t) cur = st; });
  return cur;
}
function sig(key){ return crypto.createHmac('sha256', 'bid-remind|' + (s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) || 'dev')).update(key).digest('hex').slice(0, 24); }
function doneLink(key){ const base = (s(process.env.CRM_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, ''); return base + '/.netlify/functions/bid-inbox?bidremind_done=' + encodeURIComponent(key) + '.' + sig(key); }
function checkToken(tok){ const m = /^(.+)\.([a-f0-9]{24})$/.exec(s(tok)); if (!m) return ''; const a = Buffer.from(sig(m[1])), b = Buffer.from(m[2]); return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : ''; }

/* the open bids with plan room requirements (CRM leads, then Lead Inbox items not in the CRM yet) */
function bidsOf(leads, items){
  const out = [], have = {}, haveInbox = {};
  arr(leads).forEach(l => { if (l && l.id) { have[l.id] = 1; if (l.inboxId) haveInbox[l.inboxId] = 1; } });
  const closed = x => !x || x.deleted || x._deleted || x.converted || x.notBidding || x.noBid || [x.stage, x.status, x.bidStatus, x.inboxState].some(v => CLOSED.test(s(v)));
  arr(leads).forEach(l => { if (closed(l)) return; const pr = obj(obj(l.leadExtra).planRoom || l.planRoom); if (!Object.keys(pr).length) return;
    out.push({ key: s(l.id), title: s(l.name || l.title), bidDue: s(l.bidDue), preBid: s(l.preBid), preBidLocation: s(l.preBidLocation), preBidMandatory: l.preBidMandatory, questionsDue: s(l.questionsDue),
      dueToCompany: s(l.dueToCompany || l.gc), submitMethod: s(l.submitMethod), submitWhere: s(l.submitWhere), planRoom: pr, estimator: s(l.estimator || l.pm), estimatorEmail: low(l.estimatorEmail || l.pmEmail), bidRole: low(l.bidRole) }); });
  arr(items).forEach(it => { if (!it || it.stub || haveInbox[it.id] || closed(it) || !it.planRoom) return; const lid = 'LEADIN-' + s(it.id).replace(/^LI-/, ''); if (have[lid]) return;
    out.push({ key: lid, title: s(it.title), bidDue: s(it.bidDue), preBid: s(it.preBid), preBidLocation: s(it.preBidLocation), preBidMandatory: it.preBidMandatory, questionsDue: s(it.questionsDue),
      dueToCompany: s(it.dueToCompany || it.gc), submitMethod: s(it.submitMethod), submitWhere: s(it.submitWhere), planRoom: it.planRoom, estimator: s(it.estimator || it.pm), estimatorEmail: low(it.estimatorEmail || it.pmEmail), bidRole: low(it.bidRole) }); });
  return out;
}
function emailOf(name, users){ const u = arr(users).find(x => x && low(x.name) === low(name)); return low(u && u.email); }

/* one run (bid-alerts.js, every 10 minutes). deps (tests): { now, kvCas, people, owners, notify, todo, tasks } */
async function run(src, deps){
  src = src || {}; deps = deps || {};
  const t = deps.now ? deps.now() : Date.now();
  const kvCas = deps.kvCas || ((k, f) => SA()._D.kvCas(k, f));
  const pp = deps.people ? await deps.people() : await SA()._D.people().catch(() => ({}));
  const owners = deps.owners ? await deps.owners() : await SA().loadOwners(pp).catch(() => []);
  const tasks = deps.tasks ? await deps.tasks() : await todoList();
  const taskDone = {}; arr(tasks).forEach(x => { if (x && /^bidreq_/.test(s(x.id)) && x.done === true) taskDone[s(x.id)] = 1; });
  const want = [];
  bidsOf(src.leads, src.items).forEach(b => itemsOf(b).forEach(it => {
    const key = b.key + '|' + it.kind, tid = 'bidreq_' + key.replace(/[^A-Za-z0-9_-]+/g, '_');
    if (it.done || taskDone[tid]) return;
    const st = stepNow(it.due, t); if (!st) return;
    want.push({ b, it, key, tid, st, sk: key + '|' + it.due + '|' + st.k });
  }));
  let mine = [];
  if (want.length) await kvCas(KEY, v => {
    const S = Object.assign({ sent: {}, done: {} }, obj(v)); S.sent = obj(S.sent); S.done = obj(S.done);
    mine = want.filter(x => !S.done[x.key] && !S.sent[x.sk]);
    mine.forEach(x => { S.sent[x.sk] = new Date(t).toISOString(); });
    const cut = new Date(t - 60 * 864e5).toISOString(); Object.keys(S.sent).forEach(k => { if (s(S.sent[k]) < cut) delete S.sent[k]; });
    return mine.length ? S : undefined;
  });
  const out = { sent: 0, todos: 0, list: [] };
  for (const x of mine) {
    const est = x.b.estimatorEmail || emailOf(x.b.estimator, pp && pp.users);
    const to = Array.from(new Set([est].concat(arr(owners).map(o => low(o && o.email))).filter(e => /@(in\.)?grayco-cs\.com$/.test(e))));
    const text = 'GrayCo ⏰ ' + x.st.l + ': ' + x.it.text + ' — ' + clip(x.b.title || 'bid', 70) + ' · ' + (x.it.kind === 'prebid' ? 'pre-bid ' : 'due ') + fmt(x.it.due) + '. ✓ Done: ' + doneLink(x.key);
    let r = {}; try { r = deps.notify ? await deps.notify({ only: to, text, key: x.key, step: x.st.k }) : await SA().notify({ type: 'bidreq', text, body: () => text, link: '', only: to, thread: 'bidreq:' + x.sk, hold: true, sqOnly: true }); } catch (e) { r = { error: s(e && e.message) }; }
    let td = false; try { td = deps.todo ? await deps.todo(x, to) : await todoUpsert(x, to, pp); } catch (e) { td = false; }
    if (td) out.todos++;
    if (r && (r.sent || (r.skipped && r.skipped.held))) out.sent++;
    out.list.push({ key: x.key, step: x.st.k, to, text, sent: r && r.sent, held: !!(r && r.skipped && r.skipped.held) });
  }
  return out;
}
/* ✓ Done (the text's link, or the CRM): that item's ladder stops */
async function markDone(key, by, deps){
  deps = deps || {}; key = s(key); if (!key) return { ok: false };
  const kvCas = deps.kvCas || ((k, f) => SA()._D.kvCas(k, f));
  await kvCas(KEY, v => { const S = Object.assign({ sent: {}, done: {} }, obj(v)); S.done = obj(S.done); S.done[key] = { at: new Date().toISOString(), by: s(by) || 'text link' }; return S; });
  try { if (!deps.noTodo) await todoClose('bidreq_' + key.replace(/[^A-Za-z0-9_-]+/g, '_'), by); } catch (e) {}
  return { ok: true, key };
}
/* the CRM To-Do (gc_kv gc_office_tasks): one per requirement, for the estimator and the owners */
function SP(){ return require('../subportal.js')._hub; }
async function todoList(){ try { return arr((await SP().kvRead(['gc_office_tasks'])).gc_office_tasks); } catch (e) { return []; } }
async function todoUpsert(x, to, pp){
  const names = to.map(e => { const u = arr(pp && pp.users).find(y => y && low(y.email) === e); return s(u && u.name) || e; });
  const at = new Date().toISOString();
  const task = { id: x.tid, kind: 'bidreq', label: '⏰ ' + clip(x.it.text, 90) + ' — ' + clip(x.b.title, 60), note: 'Due ' + fmt(x.it.due) + ' (' + x.st.l + '). Tick this To-Do or the box on the bid card\'s checklist when it is done — the reminders stop.',
    leadId: x.b.key, assignees: to, assignee: names.join(', '), shared: to.length > 1, prio: x.st.k === 'day' || x.st.k === 'd1' ? 'high' : 'normal', due: s(x.it.due).slice(0, 10), addedBy: 'Bid reminders', updatedAt: at, done: false };
  const r = await SP().kvListUpd('gc_office_tasks', l => { const i = l.findIndex(y => y && s(y.id) === x.tid); if (i >= 0) { if (l[i].done) return null; l[i] = Object.assign({}, l[i], task, { addedAt: l[i].addedAt || at }); } else l.push(Object.assign({ addedAt: at }, task));
    return { list: l, check: ll => ll.some(y => y && s(y.id) === x.tid) }; });
  return !!(r && r.ok);
}
async function todoClose(tid, by){
  const at = new Date().toISOString();
  return SP().kvListUpd('gc_office_tasks', l => { const i = l.findIndex(y => y && s(y.id) === tid); if (i < 0 || l[i].done) return null; l[i] = Object.assign({}, l[i], { done: true, doneAt: at, doneBy: s(by) || 'text link', updatedAt: at }); return { list: l }; });
}
module.exports = { KEY, STEPS, itemsOf, stepNow, bidsOf, run, markDone, doneLink, checkToken, dateIn };
