/* netlify/functions/_lib/away.js — patch AWAY (owner 11/16: "Thursday Friday I want to not be active and let Nick be
   active on it and me see how it works with me away from the company those days"; clarified 11/16: away = that admin
   gets NO notifications (vacation etc.), switched on / off in the admin area or on their own profile; an optional end date
   ends it by itself; most approvals are "any admin" or "PM then admin" and do not change at all).

   AWAY: gc_kv "gc_away" = a list of
     { id, email, name, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' | '' (no end date: until turned off), cover: email, coverName,
       summary: false|true (a 6 PM e-mail of what was approved that day — default OFF), setBy, setAt, endedAt?, endedBy? }
   The dates are Central calendar days, both included. With an end date it ends by itself after that day (no clean-up job);
   "Turn off" stamps endedAt.
   While a person is away:
     • they get NO approval / alert notifications: the 5-minute approval pings (_lib/apprping.js), the 7 AM digest and the
       12 PM reminder (_lib/auto-digest.js collect), staff phone push (portal.js pushTo, _lib/staffpush.js), staff text
       alerts (_lib/smsalert.js notify) and the automatic staff e-mails (_lib/auto-common.js staffMail);
     • "any admin" / "PM then admin" approvals are unchanged — the other admin already gets them (routeBox below drops the
       duplicate, adds no note); only what was waiting on THAT person alone (truly theirs — e.g. their own job as its PM, a
       personal approval) goes to the cover, marked coverFor ("Wesley is away — Nick is covering" on that item only).
   A cover who is away too passes it on to their own cover (at most 3 steps); a chain that comes back to the person, or a
   cover who is not an active admin any more, means nobody is routed to (the person is still silenced).
   Pure helpers (tests): activeMap(list, nowMs), coverOf(map, email), routeBox(box, map), redirect(emails, map), check(rec, ...). */
'use strict';
const KEY = 'gc_away';
const TZ = 'America/Chicago';
const MAX_DAYS = 31;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function ymdC(ms){ try { return new Date(ms == null ? Date.now() : ms).toLocaleDateString('en-CA', { timeZone: TZ }); } catch (e) { return new Date((ms || Date.now()) - 6 * 3600e3).toISOString().slice(0, 10); } }
function okDay(d){ return /^\d{4}-\d{2}-\d{2}$/.test(s(d)) && !isNaN(Date.parse(s(d) + 'T12:00:00Z')); }
function addDays(d, n){ const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function days(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
function staffEmail(e){ return /^[a-z0-9._%+-]+@(in\.)?grayco-cs\.com$/.test(low(e)); }

/* a record that is on today (Central) */
function onToday(r, nowMs){ const t = ymdC(nowMs); return !!(r && !r.endedAt && okDay(r.from) && r.from <= t && (!s(r.to) || (okDay(r.to) && t <= r.to))); }
/* email → the record that is on today */
function activeMap(list, nowMs){
  const m = {};
  arr(list).forEach(function(r){ if (onToday(r, nowMs)) { const e = low(r.email); if (e && (!m[e] || s(r.setAt) > s(m[e].setAt))) m[e] = r; } });
  return m;
}
/* today's and later ones (the panel lists them) */
function upcoming(list, nowMs){ const t = ymdC(nowMs); return arr(list).filter(function(r){ return r && !r.endedAt && okDay(r.from) && (!s(r.to) || (okDay(r.to) && r.to >= t)); }); }
/* who gets an away person's things: their cover, or the cover's cover when that one is away too; '' = nobody */
function coverOf(map, email){
  let e = low(email); const seen = {}; seen[e] = 1;
  for (let i = 0; i < 3; i++) {
    const r = map[e]; if (!r) return i ? e : '';
    const c = low(r.cover); if (!c || seen[c]) return '';
    seen[c] = 1; e = c;
  }
  return map[e] ? '' : e;
}
/* the approvals box (email → [items]) with every away person's items moved to their cover (marked coverFor) */
function routeBox(box, map){
  const out = {};
  Object.keys(box || {}).forEach(function(e){ if (!map[low(e)]) out[low(e)] = (box[e] || []).slice(); });
  Object.keys(box || {}).forEach(function(e){
    if (!map[low(e)]) return;
    const c = coverOf(map, e), who = s(map[low(e)].name) || e;
    if (!c) return;
    const l = out[c] = out[c] || [];
    (box[e] || []).forEach(function(it){
      if (l.indexOf(it) >= 0) return;
      const k = s(it && it.key);
      if (k && l.some(function(x){ return s(x && x.key) === k; })) return;
      l.push(Object.assign({}, it, { coverFor: who }));
    });
  });
  return out;
}
/* a list of e-mails with each away person replaced by their cover (or dropped), no duplicates */
function redirect(emails, map){
  const out = [];
  (Array.isArray(emails) ? emails : [emails]).forEach(function(e0){
    const e = low(e0); if (!e) return;
    const t = map[e] ? coverOf(map, e) : e;
    if (t && out.indexOf(t) < 0) out.push(t);
  });
  return out;
}
/* is a new / changed record acceptable? → '' or the reason. admins = active admin e-mails (role based) */
function check(r, admins, nowMs){
  if (!r) return 'Nothing to save.';
  const e = low(r.email), c = low(r.cover), t = ymdC(nowMs);
  if (!staffEmail(e)) return 'That person is not GrayCo staff.';
  if (admins.indexOf(e) < 0) return 'Away mode is for admins (Wesley, Nick).';
  if (!okDay(r.from)) return 'Pick the first day you are away.';
  if (s(r.to)) {
    if (!okDay(r.to)) return 'The end date is not a date.';
    if (r.to < r.from) return 'The end date is before the first day.';
    if (r.to < t) return 'Those days are over already.';
    if (days(r.from, r.to) + 1 > MAX_DAYS) return 'At most ' + MAX_DAYS + ' days at a time (or leave the end date empty and turn it off yourself).';
  }
  if (c && c === e) return 'Pick someone else to cover for you.';
  if (c && admins.indexOf(c) < 0) return 'The person who covers must be an admin.';
  return '';
}

/* ── storage (gc_kv through portal.js's helpers) ── */
function core(){ return require('../portal.js')._core; }
let CACHE = null;   /* { at, list } — 30 s per function instance */
async function load(force){
  if (!force && CACHE && Date.now() - CACHE.at < 30e3) return CACHE.list;
  let list = [];
  try { const cur = await core().kvListRead(KEY); list = cur ? cur.list : []; } catch (e) { list = []; }
  CACHE = { at: Date.now(), list: list };
  return list;
}
function reset(){ CACHE = null; }
async function activeNow(nowMs){ return activeMap(await load(), nowMs == null ? Date.now() : nowMs); }
async function update(mutate){
  const r = await core().kvListUpdate(KEY, mutate);
  CACHE = null;
  return r;
}
/* "Wesley is away until Fri — Nick is covering" */
function dayName(d){ try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } }
function first(n){ return s(n).split(/\s+/)[0] || s(n); }
function sentence(r){ return first(r.name || r.email) + ' is away' + (s(r.to) ? ' until ' + dayName(r.to) : '') + (s(r.cover) ? ' — ' + first(r.coverName || r.cover) + ' is covering' : ''); }

module.exports = { KEY, MAX_DAYS, ymdC, okDay, addDays, days, onToday, activeMap, upcoming, coverOf, routeBox, redirect, check, load, reset, activeNow, update, sentence, dayName };
