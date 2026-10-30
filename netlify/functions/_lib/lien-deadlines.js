/* netlify/functions/_lib/lien-deadlines.js — patch OFFFEAT (owner 10/30): the optional per-job "Track lien deadlines".
   ONE copy of the rules, used by the server (office-board.js / the daily office run: To-Do reminders) and by the CRM page
   (tools/patch_OFFFEAT.py puts this same file into index.html; tools/tests/test_OFFFEAT_fn.js checks they are identical).

   ⚖️  NOT LEGAL ADVICE. Every rule below is a planning estimate, marked "confirm with your lawyer" on screen, and is
   written to be CONSERVATIVE: each date counts from the EARLIEST trigger date the job record gives (a scheduled end date
   that has passed counts as "last work" until the office enters the real last day of work), and the CRM asks the office
   to act by an "aim" date some days BEFORE the statutory last day (mail / service / recording time). The sources are the
   statute sections named in each rule; docs/LIEN-DEADLINES.md lists them for the owner's lawyer to review. When a rule
   is not certain for a kind of job (who GrayCo is on the job, residential or not), the screen shows a NOTE to ask the
   lawyer instead of a date. Nothing here files, records or sends anything: it only reminds the office (To-Do).

   Job record (the CRM's project): p.lienTrack = { on, state, role:'prime'|'sub', residential:true|false, start, lastWork,
   filedAt, done: { <ruleKey>: { at, by } }, by, at } — every field optional except on; the rest falls back to the job's
   own fields (state / address, startDate / constructionStart, completionDate / completedAt / endDate, gcJob / hiredByGc,
   type). Off by default: a job without lienTrack.on === true is never computed or reminded. */
(function(root){
'use strict';
var VERSION = '2026-10-30';
var DISCLAIMER = 'Planning estimates only — not legal advice. Confirm every deadline with GrayCo’s lawyer before relying on it.';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function ymd(v){ var t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); if (!t) return ''; var d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
function addDays(day, n){ var d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* n calendar months later, never past the end of that month (Jan 31 + 1 month = Feb 28/29) */
function addMonths(day, n){
  var y = +day.slice(0, 4), m = +day.slice(5, 7) - 1 + n, dd = +day.slice(8, 10);
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + Math.min(dd, last)).slice(-2);
}
function monthEnd(ym){ var y = +ym.slice(0, 4), m = +ym.slice(5, 7); return ym + '-' + ('0' + new Date(Date.UTC(y, m, 0)).getUTCDate()).slice(-2); }
function daysBetween(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }

/* ── THE RULES ── who: 'prime' (GrayCo's contract is with the owner) | 'sub' (GrayCo works under a GC) | 'any';
   res: true (residential only) | false (non-residential only) | null (both). from: start | last | filed | monthly.
   aim: how many days before the last day the office is asked to have it done. */
var RULES = [
  /* TENNESSEE — Tenn. Code Ann. Title 66, Chapter 11 */
  { id: 'TN203', st: 'TN', who: 'prime', res: true, from: 'start', days: 0, aim: 3,
    title: 'Notice of lien rights to the homeowner (before work starts)', cite: 'Tenn. Code Ann. § 66-11-203',
    note: 'Usually part of the signed contract. Sources say a missing notice does not by itself cancel lien rights, but give it anyway.' },
  { id: 'TN112', st: 'TN', who: 'any', res: null, from: 'last', days: 90, aim: 14,
    title: 'Record the Notice of Lien (register of deeds) and serve it on the owner', cite: 'Tenn. Code Ann. § 66-11-112(a); service: § 66-11-115',
    note: 'Counted from the last day of work (completion or abandonment). If the owner records a Notice of Completion, the time can be much shorter (§ 66-11-143) — call the lawyer at once.' },
  { id: 'TN106', st: 'TN', who: 'prime', res: null, from: 'last', days: 365, aim: 45,
    title: 'Lawsuit to enforce the lien (prime contractor)', cite: 'Tenn. Code Ann. § 66-11-106',
    note: 'The lien lasts one year after completion or abandonment unless a suit is brought within that year.' },
  { id: 'TN145', st: 'TN', who: 'sub', res: false, from: 'monthly', days: 90, aim: 14,
    title: 'Notice of nonpayment to the owner and the GC (each month worked)', cite: 'Tenn. Code Ann. § 66-11-145',
    note: 'For a sub / remote contractor on non-residential work: within 90 days after the last day of EACH month GrayCo worked and was not paid. A month missed can cost that month’s lien rights.' },
  /* ARKANSAS — Ark. Code Ann. § 18-44-101 et seq. */
  { id: 'AR115A', st: 'AR', who: 'prime', res: true, from: 'start', days: 0, aim: 3,
    title: 'Residential notice to the owner (before work starts)', cite: 'Ark. Code Ann. § 18-44-115(a)',
    note: 'The statute sets the wording. Arkansas changed the residential rules in 2021 (home-improvement contractors) — confirm what applies.' },
  { id: 'AR114', st: 'AR', who: 'any', res: null, from: 'last', days: 110, aim: 10,
    title: '10-day notice of intent to file a lien, to the owner', cite: 'Ark. Code Ann. § 18-44-114',
    note: 'Must reach the owner at least 10 days before the lien is filed, so no later than day 110 after the last work.' },
  { id: 'AR117', st: 'AR', who: 'any', res: null, from: 'last', days: 120, aim: 10,
    title: 'File the lien with the circuit clerk', cite: 'Ark. Code Ann. § 18-44-117',
    note: '120 days after the last day labor or materials were furnished, with the affidavit that the notices were given.' },
  { id: 'AR119', st: 'AR', who: 'any', res: null, from: 'filed', months: 15, aim: 45,
    title: 'Lawsuit to enforce the lien', cite: 'Ark. Code Ann. § 18-44-119',
    note: '15 months after the lien is filed. Enter the filing date to see it.' },
  /* MISSISSIPPI — Miss. Code Ann. § 85-7-401 et seq. (2016 lien law) */
  { id: 'MS409', st: 'MS', who: 'any', res: true, from: 'last', days: 80, aim: 7,
    title: 'Pre-lien notice to the homeowner (at least 10 days before filing)', cite: 'Miss. Code Ann. § 85-7-409',
    note: 'Single-family residential: the owner must get it at least 10 days before the lien is filed (filing is due by day 90).' },
  { id: 'MS405', st: 'MS', who: 'any', res: null, from: 'last', days: 90, aim: 14,
    title: 'File the claim of lien with the chancery clerk', cite: 'Miss. Code Ann. § 85-7-405(1)(b)',
    note: '90 days after the last day of work or materials.' },
  { id: 'MS421', st: 'MS', who: 'any', res: null, from: 'filed', days: 180, aim: 30,
    title: 'Lawsuit to enforce the lien', cite: 'Miss. Code Ann. § 85-7-421(1) (some sources cite § 85-7-423)',
    note: '180 days after the claim of lien is filed, or the lien expires. Enter the filing date to see it.' }
];
/* notes with no date (ask the lawyer) */
var NOTES = [
  { st: 'TN', who: 'sub', res: true, text: 'On 1–4 family residential work, a sub / remote contractor generally has no lien against the homeowner in Tennessee — ask the lawyer before relying on a lien here.' },
  { st: 'AR', who: 'sub', res: false, text: 'On commercial work, a sub may need an extra notice under Ark. Code Ann. § 18-44-115(b) — ask the lawyer.' },
  { st: 'MS', who: 'sub', res: false, text: 'A sub with no contract with the prime contractor must give a 30-day notice on commercial jobs (Miss. Code Ann. § 85-7-407(2)) — ask the lawyer if this applies.' }
];
var STATES = { TN: 'Tennessee', AR: 'Arkansas', MS: 'Mississippi' };

function lt(p){ return (p && p.lienTrack && typeof p.lienTrack === 'object') ? p.lienTrack : {}; }
function on(p){ return lt(p).on === true; }
function stateOf(p){
  var x = s(lt(p).state).toUpperCase(); if (STATES[x]) return { st: x, how: 'set on the job' };
  x = s(p && p.state).toUpperCase(); if (STATES[x]) return { st: x, how: 'the job’s state' };
  var a = s(p && (p.address || p.jobAddress)), m = /\b(TN|AR|MS)\b\.?,?\s*\d{5}/i.exec(a) || /,\s*(TN|AR|MS)\b/i.exec(a);
  if (m) return { st: m[1].toUpperCase(), how: 'the job address' };
  if (/tennessee/i.test(a)) return { st: 'TN', how: 'the job address' }; if (/arkansas/i.test(a)) return { st: 'AR', how: 'the job address' }; if (/mississippi/i.test(a)) return { st: 'MS', how: 'the job address' };
  return { st: '', how: '' };
}
function roleOf(p){
  var r = low(lt(p).role); if (r === 'prime' || r === 'sub') return { role: r, how: 'set on the job' };
  var gc = p && (p.gcJob === true || p.hiredByGc === true || /^sub/i.test(s(p.ourRole)) || /\bsub(contractor)?\b/i.test(s(p.bidRole)));
  return { role: gc ? 'sub' : 'prime', how: 'guessed from the job (change it if wrong)' };
}
function residentialOf(p){
  var v = lt(p).residential; if (v === true || v === false) return { res: v, how: 'set on the job' };
  var t = [p && p.type, p && p.jobType, p && p.category].map(s).join(' ');
  var com = (p && (p.isCommercial === true || p.commercial === true)) || /commercial|government|municipal|church|school|retail|warehouse|tenant|\bti\b|industrial|office build|hotel|restaurant|multi-?family|apartment/i.test(t);
  return { res: !com, how: 'guessed from the job type (change it if wrong)' };
}
/* the dates the rules count from — the EARLIEST the record supports (conservative) */
function datesOf(p, today){
  var L = lt(p), start = ymd(L.start) || ymd(p.startDate) || ymd(p.constructionStart) || ymd(p.actualStart);
  var last = ymd(L.lastWork), lastHow = last ? 'entered by the office' : '';
  if (!last) {
    var c = [['completionDate', 'the job’s completion date'], ['completedAt', 'when the job was marked complete'], ['endDate', 'the job’s scheduled end date']]
      .map(function(k){ return { d: ymd(p[k[0]]), how: k[1] }; }).filter(function(x){ return x.d && x.d <= today; }).sort(function(a, b){ return a.d < b.d ? -1 : 1; })[0];
    if (c) { last = c.d; lastHow = c.how + ' (enter the real last day of work if it was later)'; }
  }
  return { start: start, last: last, lastHow: lastHow, filed: ymd(L.filedAt) };
}
function applies(r, st, role, res){ return r.st === st && (r.who === 'any' || r.who === role) && (r.res == null || r.res === res); }
function statusOf(due, aim, today, done){
  if (done) return 'done';
  if (!due) return 'needs-date';
  if (today > due) return 'passed';
  if (today >= aim) return 'now';
  if (daysBetween(today, aim) <= 21) return 'soon';
  return 'later';
}
/* everything the job page shows. today: 'YYYY-MM-DD' */
function compute(p, today){
  today = ymd(today) || new Date().toISOString().slice(0, 10);
  var S = stateOf(p), R = roleOf(p), RS = residentialOf(p), D = datesOf(p || {}, today), done = lt(p).done || {};
  var out = { version: VERSION, disclaimer: DISCLAIMER, on: on(p), state: S.st, stateHow: S.how, role: R.role, roleHow: R.how, residential: RS.res, resHow: RS.how,
    start: D.start, last: D.last, lastHow: D.lastHow, filed: D.filed, items: [], notes: [] };
  if (!S.st) { out.notes.push('Pick the job’s state (Tennessee, Arkansas or Mississippi) to see its lien deadlines.'); return out; }
  RULES.forEach(function(r){
    if (!applies(r, S.st, R.role, RS.res)) return;
    var base = { rule: r.id, title: r.title, cite: r.cite, note: r.note, lawyer: true };
    if (r.from === 'monthly') {
      if (!D.start) { out.items.push(Object.assign({ key: r.id, due: '', aim: '', status: 'needs-date', need: 'start' }, base)); return; }
      var endYm = (D.last || today).slice(0, 7), ym = D.start.slice(0, 7), n = 0, list = [];
      while (ym <= endYm && n < 60) { var due = addDays(monthEnd(ym), r.days), key = r.id + ':' + ym; list.push({ ym: ym, due: due, key: key }); var nx = addMonths(ym + '-01', 1); ym = nx.slice(0, 7); n++; }
      list.forEach(function(x){
        var aim = addDays(x.due, -r.aim), st = statusOf(x.due, aim, today, !!done[x.key]);
        out.items.push(Object.assign({}, base, { key: x.key, month: x.ym, title: r.title.replace('(each month worked)', '— work in ' + x.ym), due: x.due, aim: aim, status: st }));
      });
      return;
    }
    var from = r.from === 'start' ? D.start : r.from === 'last' ? D.last : D.filed;
    if (!from) { out.items.push(Object.assign({ key: r.id, due: '', aim: '', status: done[r.id] ? 'done' : 'needs-date', need: r.from }, base)); return; }
    var due2 = r.months ? addDays(addMonths(from, r.months), -1) : addDays(from, r.days), aim2 = addDays(due2, -r.aim);
    out.items.push(Object.assign({}, base, { key: r.id, from: r.from, fromDate: from, due: due2, aim: aim2, status: statusOf(due2, aim2, today, !!done[r.id]) }));
  });
  NOTES.forEach(function(n){ if (n.st === S.st && (n.who === 'any' || n.who === R.role) && (n.res == null || n.res === RS.res)) out.notes.push(n.text); });
  out.items.sort(function(a, b){ var x = a.due || '9999', y = b.due || '9999'; return x < y ? -1 : x > y ? 1 : 0; });
  return out;
}
/* what the To-Do should carry today: items not done, with a date, from 21 days before the aim date until the last day */
function reminders(p, today){
  if (!on(p)) return [];
  var c = compute(p, today);
  return c.items.filter(function(x){ return x.due && x.status !== 'done' && today <= x.due && daysBetween(today, x.aim) <= 21; })
    .map(function(x){ return { key: x.key, title: x.title, due: x.due, aim: x.aim, cite: x.cite, state: c.state, urgent: today >= x.aim }; });
}
var API = { VERSION: VERSION, DISCLAIMER: DISCLAIMER, RULES: RULES, NOTES: NOTES, STATES: STATES, compute: compute, reminders: reminders, on: on, stateOf: stateOf, roleOf: roleOf, residentialOf: residentialOf, datesOf: datesOf,
  _t: { addDays: addDays, addMonths: addMonths, monthEnd: monthEnd, daysBetween: daysBetween } };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root._gcLienRules = API;
})(typeof window !== 'undefined' ? window : this);
