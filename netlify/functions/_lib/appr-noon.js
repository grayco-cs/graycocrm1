/* netlify/functions/_lib/appr-noon.js — patch SUBPHOTOS (owner 10/30): "make sure pms look at their approvals everyday".
   Run by auto-wins.js (hourly): the first run at or after 12 PM Central on a BUSINESS DAY (Mon–Fri). Each person who still
   has approvals waiting (the 7 AM digest's own rule — _lib/auto-digest.js collect) and has NOT opened 📋 Approvals today
   gets ONE phone push, ONE e-mail ("You have N approvals waiting") and an ASAP To-Do. Never during ⏸ data-entry mode.
   "Opened Approvals today": the server stamp gc_kv "gc_appr_seen" ([{ id: email, email, at }]) — the CRM writes it when
   📋 Approvals is opened (auto-wins.js { action: 'appr-seen' }); the old gc_appr_seen_<email> is only in that browser.
   seenRows(): who checked and who did not, for the office (window._gcApprovalsCheckedToday in the CRM). */
'use strict';
const A = require('./auto-common.js');
const { s, low, arr, esc, clip, staffEmail } = A;
const SEEN_KEY = 'gc_appr_seen';
const BIZ = { Mon: 1, Tue: 1, Wed: 1, Thu: 1, Fri: 1 };
function now0(o){ return o && o.now != null ? o.now : Date.now(); }
function seenMap(list){ const m = {}; arr(list).forEach(function(x){ const e = low(x.email || x.id); if (staffEmail(e) && s(x.at) > s(m[e])) m[e] = s(x.at); }); return m; }
function seenToday(at, now){ return !!at && A.central(Date.parse(at)).ymd === A.central(now).ymd; }
/* pure: who gets the reminder → [{ email, name, n }] */
function due(box, seen, now, nameOf){
  const c = A.central(now);
  if (!BIZ[c.wd] || c.hour < 12) return [];
  return Object.keys(box || {}).filter(function(e){ return staffEmail(e) && (box[e] || []).length && !seenToday(seen[low(e)], now); })
    .map(function(e){ return { email: low(e), name: s((nameOf || {})[low(e)]), n: box[e].length }; });
}
async function run(opts){
  opts = opts || {};
  const now = now0(opts), c = A.central(now);
  if (!BIZ[c.wd]) return { ok: true, skipped: 'not a business day' };
  if (await A.paused()) return { ok: true, skipped: 'data-entry mode' };
  const C = A.core(), D = require('./auto-digest.js');
  const got = await D.collect(now);
  let seen = {}; try { seen = seenMap((await C.kvListRead(SEEN_KEY) || {}).list); } catch (e) {}
  const list = due(got.box, seen, now, got.nameOf), rep = { ok: true, people: list.length, mailed: 0, pushed: 0, todos: 0 };
  for (const p of list) {
    const subject = 'You have ' + p.n + ' approval' + (p.n === 1 ? '' : 's') + ' waiting';
    const items = D.order(got.box[p.email], now);
    const html = A.shell(subject, D.apprLine(p.n, got.base) + '<p>You haven\'t opened 📋 Approvals today. Please look at them before the end of the day.</p><ul style="padding-left:18px">' +
      items.slice(0, 15).map(function(it){ return '<li><a href="' + esc(it.link) + '">' + esc(clip(it.title, 140)) + '</a>' + (it.sub ? ' — ' + esc(clip(it.sub, 60)) : '') + '</li>'; }).join('') + '</ul>');
    try { const m = await A.staffMail(p.email, '⏰ ' + subject + ' — GrayCo CRM', html); if (m && m.ok) rep.mailed++; } catch (e) {}
    try { const r = await C.pushTo([p.email], { title: '⏰ ' + subject, body: 'Open 📋 Approvals in the CRM', tag: 'gc-appr-noon' }); rep.pushed += (r && r.sent) || 0; } catch (e) {}
    try {
      const at = new Date(now).toISOString(), id = 'apprnoon_' + c.ymd + '_' + p.email;
      const task = { id: id, kind: 'appr_reminder', label: '🔴 ' + subject + ' — open 📋 Approvals', note: 'Automatic 12 PM reminder: approvals are waiting and 📋 Approvals was not opened today.',
        assignees: [p.email], assignee: p.name, personal: true, shared: false, urgency: 'asap', priority: 'asap', prio: 'asap', due: c.ymd, go: { tab: 'approvals' },
        addedBy: 'CRM (automatic)', addedAt: at, createdAt: at, updatedAt: at, done: false };
      const has = function(l){ return l.some(function(x){ return x && s(x.id) === id; }); };
      const w = await C.kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([task]), check: has }; });
      if (w && w.ok && !w.unchanged) rep.todos++;
    } catch (e) {}
  }
  return rep;
}
/* the server "seen" stamp (one row per person, the newest time) */
async function stamp(email, at){
  email = low(email); if (!staffEmail(email)) return false;
  at = at || new Date().toISOString();
  const C = A.core();
  const r = await C.kvListUpdate(SEEN_KEY, function(l){
    const rest = l.filter(function(x){ return low(x && (x.email || x.id)) !== email; });
    return { list: rest.concat([{ id: email, email: email, at: at }]), check: function(l2){ return l2.some(function(x){ return x && low(x.email) === email && s(x.at) >= at; }); } };
  });
  return !!(r && r.ok);
}
/* for the office: [{ name, email, waiting, lastSeen, checkedToday }] — everyone with approvals waiting, plus anyone who stamped */
async function seenRows(opts){
  const now = now0(opts), C = A.core(), D = require('./auto-digest.js');
  const got = await D.collect(now);
  let seen = {}; try { seen = seenMap((await C.kvListRead(SEEN_KEY) || {}).list); } catch (e) {}
  const emails = Array.from(new Set(Object.keys(got.box).concat(Object.keys(seen)))).filter(staffEmail);
  return emails.map(function(e){ return { name: s(got.nameOf[e]) || e, email: e, waiting: (got.box[e] || []).length, lastSeen: seen[e] || '', checkedToday: seenToday(seen[e], now) }; })
    .sort(function(a, b){ return (a.checkedToday - b.checkedToday) || (b.waiting - a.waiting) || a.name.localeCompare(b.name); });
}
module.exports = { run, due, stamp, seenRows, seenMap, seenToday, SEEN_KEY };
