/* netlify/functions/_lib/taxcal.js — patch TAXALERTS: the TAX CALENDAR's rules, shared by the server (auto-wins → _lib/taxalerts.js)
   and the CRM page (tools/patch_TAXALERTS.py inlines this file into index.html, so both compute the very same due dates).

   Owner 11/01: "make sure every month and quarterly we have a pay taxes alert to office and admin" — and then: "payroll taxes,
   and personally Wesley and Nick pay a quarterly number in to taxes."

   TWO LISTS
     company  gc_kv "gc_tax_calendar" { v, startedAt, items: [...], removed: [ids] } — admins edit (⚙ Admin → 🧾 Tax deadlines),
              the office reads. Payroll taxes ON by default; sales / use, F&E and business tax OFF until the owner / CPA turns
              them on. Paid records: gc_kv "gc_tax_paid" [{ key, itemId, due, paidOn, amount, confirm, by, at, receipt }].
     owner    gc_admin_kv "gc_tax_owner" { items, paid, startedAt } — the two owners' quarterly estimated tax: admins only (the
              database answers nobody else; the office never asks for it). Never posted as a company expense.

   AN ITEM  { id, name, short, on, freq: 'monthly'|'quarterly'|'yearly', day (monthly: 1–31 or 'last'), dates (['MM-DD' |
              'MM-last', …] for quarterly / yearly, in the tax year's order), prior (the period is the month / year before),
              shift ('bizday' = a weekend or a federal holiday moves it to the next business day | 'none'), who ('admins+office'
              | 'admins' | 'office'; owner items: 'own' | 'admins'), owner (e-mail, owner items), amount (owner items: the fixed
              quarterly number), pay ('941'|'suta'|'futa' — the estimate comes from the Payroll runs), lead (days of warning, 7),
              link, notes, cpa (true = "Confirm with CPA" until someone says it is confirmed), since (no alerts for dates before) }
   AN OCCURRENCE  { key: id|nominal, itemId, nominal (the rule's date), due (after the weekend / holiday shift), label ('Q4 2026',
              'Oct 2026', '2026'), period: { from, to } }
   STAGES   'soon' (from `lead` days before, once) → 'due' (the due day, once) → 'over' (every day after, until ✓ Paid).
   These are reminders, not tax advice: every default is marked "Confirm with CPA". */
(function(root){
'use strict';

var VERSION = 'TAXCAL-1';
var LEAD = 7;
var EFTPS = 'https://www.eftps.gov/eftps/';
var TNTAP = 'https://tntap.tn.gov/eservices/';
var JOBS4TN = 'https://www.jobs4tn.gov/';
var Q_END = ['04-30', '07-31', '10-31', '01-31'];   /* the last day of the month after each quarter */
var EST = ['04-15', '06-15', '09-15', '01-15'];     /* federal estimated tax (1040-ES) */

/* the company's starting list — every one "Confirm with CPA" */
var DEFAULTS = [
  { id: '941dep', name: 'Federal payroll tax deposit (Form 941 taxes)', short: '941 deposit', on: true, freq: 'monthly', day: 15, prior: true, pay: '941', who: 'admins+office', link: EFTPS,
    notes: 'Monthly depositor: by the 15th, last month’s federal income tax withheld + both halves of Social Security and Medicare, through EFTPS. Semi-weekly depositors follow a different schedule — the CPA confirms which GrayCo is.' },
  { id: '941q', name: 'Form 941 — quarterly federal payroll return', short: 'Form 941', on: true, freq: 'quarterly', dates: Q_END.slice(), pay: '941', who: 'admins+office', link: 'https://www.irs.gov/forms-pubs/about-form-941',
    notes: 'The quarter’s return (the deposits made count toward it). Filed by the last day of the month after the quarter.' },
  { id: 'suta', name: 'Tennessee unemployment (SUTA) — quarterly wage report and premium', short: 'TN unemployment (SUTA)', on: true, freq: 'quarterly', dates: Q_END.slice(), pay: 'suta', who: 'admins+office', link: JOBS4TN,
    notes: 'The quarter’s wage report and premium to the TN Department of Labor, by the last day of the month after the quarter.' },
  { id: 'futa', name: 'FUTA deposit (Form 940 tax) — only when over $500', short: 'FUTA deposit', on: true, freq: 'quarterly', dates: ['04-30', '07-31', '10-31'], pay: 'futa', who: 'admins+office', link: EFTPS,
    notes: 'Deposit when the FUTA owed (with any amount carried over) is more than $500; otherwise it carries to the next quarter. The 4th quarter goes with Form 940 by Jan 31. Use “No payment due this time” when under $500.' },
  { id: '940', name: 'Form 940 — annual federal unemployment (FUTA) return', short: 'Form 940', on: true, freq: 'yearly', dates: ['01-31'], prior: true, pay: 'futa', who: 'admins+office', link: 'https://www.irs.gov/forms-pubs/about-form-940',
    notes: 'Last year’s FUTA return (and any 4th-quarter FUTA still owed).' },
  { id: 'w2', name: 'W-2s to employees + W-2 / W-3 to the Social Security Administration', short: 'W-2s / W-3', on: true, freq: 'yearly', dates: ['01-31'], prior: true, who: 'admins+office', link: 'https://www.ssa.gov/bso/',
    notes: 'Every W-2 employee’s copy and the SSA filing (Business Services Online), by Jan 31.' },
  { id: '1099', name: '1099-NEC to subs + the IRS', short: '1099-NEC', on: true, freq: 'yearly', dates: ['01-31'], prior: true, who: 'admins+office', link: 'https://www.irs.gov/forms-pubs/about-form-1099-nec',
    notes: 'Each sub / vendor paid $600+ last year (the CRM’s 1099 report lists them), to the sub and the IRS by Jan 31.' },
  { id: 'tnsales', name: 'TN sales & use tax', short: 'TN sales & use tax', on: false, freq: 'monthly', day: 20, prior: true, who: 'admins+office', link: TNTAP,
    notes: 'By the 20th for last month, on TNTAP. Contractors usually pay use tax on materials instead of collecting sales tax — the CPA confirms whether GrayCo files and how often.' },
  { id: 'fae_est', name: 'TN franchise & excise tax — quarterly estimate', short: 'TN F&E estimate', on: false, freq: 'quarterly', dates: ['04-15', '06-15', '09-15', '12-15'], who: 'admins', link: TNTAP,
    notes: 'Calendar-year dates (the 15th day of the 4th, 6th, 9th and 12th months). Only when the CPA says estimates are required.' },
  { id: 'fae', name: 'TN franchise & excise tax — annual return', short: 'TN F&E return', on: false, freq: 'yearly', dates: ['04-15'], prior: true, who: 'admins', link: TNTAP,
    notes: 'The 15th day of the 4th month after the year ends (calendar year: Apr 15). The CPA confirms.' },
  { id: 'tnbiz', name: 'TN business tax — annual', short: 'TN business tax', on: false, freq: 'yearly', dates: ['04-15'], prior: true, who: 'admins', link: TNTAP,
    notes: 'The date depends on the business tax classification — the CPA confirms the date and changes it here.' }
];
DEFAULTS.forEach(function(x){ x.cpa = true; x.shift = 'bizday'; x.lead = LEAD; });

/* the owners' quarterly estimated tax — admins only, never the office */
var OWNER_DEFAULTS = [
  { id: 'est_wj', name: 'Wesley Johnson — quarterly estimated tax', short: 'Wesley Johnson — quarterly estimated tax', owner: 'wjohnson@grayco-cs.com' },
  { id: 'est_nt', name: 'Nick Thomas — quarterly estimated tax', short: 'Nick Thomas — quarterly estimated tax', owner: 'nthomas@grayco-cs.com' }
];
OWNER_DEFAULTS.forEach(function(x){
  x.on = true; x.freq = 'quarterly'; x.dates = EST.slice(); x.who = 'own'; x.amount = 0; x.cpa = true; x.shift = 'bizday'; x.lead = LEAD; x.personal = true;
  x.link = 'https://www.irs.gov/payments/direct-pay'; x.notes = 'The owner’s own quarterly federal estimated tax (1040-ES) — “the quarterly number”. Tracked here only; it is not a company expense.';
});

/* ── small helpers ── */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function copy(o){ return JSON.parse(JSON.stringify(o)); }
function pad(n){ return (n < 10 ? '0' : '') + n; }

/* ── dates: 'YYYY-MM-DD' strings, computed in UTC so no time zone moves a day ── */
function mk(y, m, d){ var t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
function parts(ymd){ var p = s(ymd).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
function isYmd(v){ return /^\d{4}-\d{2}-\d{2}$/.test(s(v)); }
function lastDay(y, m){ return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function addDays(ymd, n){ var p = parts(ymd); return mk(p.y, p.m, p.d + n); }
function dow(ymd){ var p = parts(ymd); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
function diff(a, b){ var x = parts(a), y = parts(b); return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 864e5); }   /* b − a, in days */
function nthWd(y, m, wd, n){ var first = dow(mk(y, m, 1)); return mk(y, m, 1 + ((wd - first + 7) % 7) + 7 * (n - 1)); }
function lastWd(y, m, wd){ var L = lastDay(y, m), ld = dow(mk(y, m, L)); return mk(y, m, L - ((ld - wd + 7) % 7)); }
function observed(ymd){ var w = dow(ymd); return w === 6 ? addDays(ymd, -1) : w === 0 ? addDays(ymd, 1) : ymd; }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function short(ymd){ var p = parts(ymd); return MON[p.m - 1] + ' ' + p.d; }
function longDate(ymd){ var p = parts(ymd); return MON[p.m - 1] + ' ' + p.d + ', ' + p.y; }

/* federal legal holidays (the IRS's rule: a Washington, D.C. legal holiday — so D.C. Emancipation Day, Apr 16, counts) */
var HCACHE = {};
function holidays(y){
  if (HCACHE[y]) return HCACHE[y];
  var h = {};
  function add(d, n){ h[d] = n; }
  [y, y + 1].forEach(function(yy){ var o = observed(mk(yy, 1, 1)); if (parts(o).y === y) add(o, 'New Year’s Day'); });
  add(nthWd(y, 1, 1, 3), 'Martin Luther King Jr. Day');
  add(nthWd(y, 2, 1, 3), 'Washington’s Birthday');
  add(observed(mk(y, 4, 16)), 'D.C. Emancipation Day');
  add(lastWd(y, 5, 1), 'Memorial Day');
  if (y >= 2021) add(observed(mk(y, 6, 19)), 'Juneteenth');
  add(observed(mk(y, 7, 4)), 'Independence Day');
  add(nthWd(y, 9, 1, 1), 'Labor Day');
  add(nthWd(y, 10, 1, 2), 'Columbus Day');
  add(observed(mk(y, 11, 11)), 'Veterans Day');
  add(nthWd(y, 11, 4, 4), 'Thanksgiving Day');
  add(observed(mk(y, 12, 25)), 'Christmas Day');
  HCACHE[y] = h; return h;
}
function holidayName(ymd){ return holidays(parts(ymd).y)[ymd] || ''; }
function isBizDay(ymd){ var w = dow(ymd); return w !== 0 && w !== 6 && !holidayName(ymd); }
function shiftDue(ymd, rule){ if (rule === 'none') return ymd; var d = ymd, n = 0; while (!isBizDay(d) && n++ < 10) d = addDays(d, 1); return d; }

/* ── one item's due dates ── */
function dayOf(spec, y, m){ var L = lastDay(y, m); if (s(spec) === 'last') return L; var n = parseInt(spec, 10); return isFinite(n) && n > 0 ? Math.min(n, L) : L; }
function mmdd(v){ var m = /^(\d{1,2})-(\d{1,2}|last)$/.exec(s(v)); if (!m) return null; var mo = +m[1]; if (mo < 1 || mo > 12) return null; return { m: mo, d: m[2] }; }
function normDates(l){ var out = []; arr0(l).forEach(function(v){ var x = mmdd(v); if (x) out.push(pad(x.m) + '-' + (x.d === 'last' ? 'last' : pad(Math.min(31, Math.max(1, +x.d))))); }); return out; }
function arr0(v){ return Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[\s,;]+/) : []); }
function monthRange(y, m){ return { from: mk(y, m, 1), to: mk(y, m, lastDay(y, m)) }; }
/* every occurrence whose DUE date is in [from, to] */
function occurrences(item, from, to){
  item = item || {}; var out = [];
  if (!isYmd(from) || !isYmd(to)) return out;
  var y0 = parts(from).y - 1, y1 = parts(to).y + 1, shift = item.shift === 'none' ? 'none' : 'bizday';
  function push(nominal, label, period){
    var due = shiftDue(nominal, shift);
    if (due < from || due > to) return;
    out.push({ key: s(item.id) + '|' + nominal, itemId: s(item.id), nominal: nominal, due: due, label: label, period: period });
  }
  if (item.freq === 'monthly') {
    for (var y = y0; y <= y1; y++) for (var m = 1; m <= 12; m++) {
      var nominal = mk(y, m, dayOf(item.day, y, m));
      var pm = item.prior === false ? { y: y, m: m } : (m === 1 ? { y: y - 1, m: 12 } : { y: y, m: m - 1 });
      push(nominal, MON[pm.m - 1] + ' ' + pm.y, monthRange(pm.y, pm.m));
    }
  } else if (item.freq === 'quarterly' || item.freq === 'yearly') {
    var dl = normDates(item.dates); if (!dl.length) return out;
    var first = mmdd(dl[0]).m;
    for (var ty = y0; ty <= y1; ty++) dl.forEach(function(v, i){
      var x = mmdd(v), cy = x.m < first ? ty + 1 : ty, nominal = mk(cy, x.m, dayOf(x.d, cy, x.m)), label, period = null;
      if (item.freq === 'quarterly') {
        label = 'Q' + (i + 1) + ' ' + ty;
        if (i < 4) period = { from: mk(ty, 3 * i + 1, 1), to: mk(ty, 3 * i + 3, lastDay(ty, 3 * i + 3)) };
      } else {
        var py = item.prior === false ? cy : cy - 1; label = String(py); period = { from: mk(py, 1, 1), to: mk(py, 12, 31) };
      }
      push(nominal, label, period);
    });
  }
  out.sort(function(a, b){ return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  var seen = {}; return out.filter(function(o){ if (seen[o.key]) return false; seen[o.key] = 1; return true; });
}
function nextDue(item, today, n){ return occurrences(item, today, addDays(today, 800)).slice(0, n || 1); }

/* ── the lists ── */
function cleanItem(x, base){
  x = Object.assign({}, base || {}, obj(x));
  var it = { id: s(x.id).replace(/[^\w.-]/g, '').slice(0, 40), name: s(x.name).slice(0, 140), short: s(x.short || x.name).slice(0, 80), on: x.on !== false,
    freq: /^(monthly|quarterly|yearly)$/.test(s(x.freq)) ? s(x.freq) : 'quarterly', prior: x.prior !== false,
    shift: x.shift === 'none' ? 'none' : 'bizday', lead: Math.max(1, Math.min(60, parseInt(x.lead, 10) || LEAD)),
    link: /^https:\/\/[^\s"'<>]+$/i.test(s(x.link)) ? s(x.link).slice(0, 300) : '', notes: s(x.notes).slice(0, 1200), cpa: x.cpa !== false };
  if (it.freq === 'monthly') it.day = s(x.day) === 'last' ? 'last' : Math.max(1, Math.min(31, parseInt(x.day, 10) || 15));
  else { it.dates = normDates(x.dates); if (!it.dates.length) it.dates = it.freq === 'yearly' ? ['01-31'] : Q_END.slice(); if (it.freq === 'yearly') it.dates = it.dates.slice(0, 4); }
  if (/^(941|suta|futa)$/.test(s(x.pay))) it.pay = s(x.pay);
  if (isYmd(x.since)) it.since = s(x.since);
  if (x.personal || x.owner) { it.personal = true; it.owner = low(x.owner); it.who = x.who === 'admins' ? 'admins' : 'own'; it.amount = r2(x.amount); }
  else it.who = /^(admins\+office|admins|office)$/.test(s(x.who)) ? s(x.who) : 'admins+office';
  if (x.custom) it.custom = true;
  if (x.confirmedBy) it.confirmedBy = s(x.confirmedBy).slice(0, 80);
  return it;
}
/* saved → the full list (defaults by id, the saved fields over them, custom items after; removed ids left out) */
function merge(saved, kind){
  var sv = obj(saved), defs = kind === 'owner' ? OWNER_DEFAULTS : DEFAULTS, rm = {}, by = {}, out = [];
  arr0(sv.removed).forEach(function(id){ rm[s(id)] = 1; });
  arr(sv.items).forEach(function(x){ if (s(x.id)) by[s(x.id)] = x; });
  defs.forEach(function(d){ if (rm[d.id]) return; out.push(cleanItem(by[d.id] || {}, d)); delete by[d.id]; });
  Object.keys(by).forEach(function(id){ if (rm[id]) return; var x = by[id]; out.push(cleanItem(Object.assign({ custom: true }, x, kind === 'owner' ? { personal: true } : {}), kind === 'owner' ? OWNER_DEFAULTS[0] : null)); });
  return { v: 1, startedAt: isYmd(sv.startedAt) ? sv.startedAt : '', items: out.filter(function(x){ return x.id; }), removed: Object.keys(rm), paid: arr(sv.paid) };
}
function defaults(kind){ return copy(kind === 'owner' ? OWNER_DEFAULTS : DEFAULTS); }

/* ── paid ── */
function paidMap(list){ var m = {}; arr(list).forEach(function(p){ if (s(p.key) && !p.undone) m[s(p.key)] = p; }); return m; }

/* ── what is due / overdue today ── */
function stageOf(occ, today, lead){
  var d = diff(today, occ.due);   /* days left */
  if (d < 0) return { stage: 'over', days: -d };
  if (d === 0) return { stage: 'due', days: 0 };
  if (d <= (lead || LEAD)) return { stage: 'soon', days: d };
  return null;
}
function titleOf(item, occ, st){
  var what = s(item.short || item.name) + (occ.label && !item.personal ? ' ' + occ.label : item.personal ? ' (' + occ.label + ')' : '');
  if (st.stage === 'soon') return '🧾 Due in ' + st.days + ' day' + (st.days === 1 ? '' : 's') + ': ' + what + ' — ' + short(occ.due);
  if (st.stage === 'due') return '🧾 Due today: ' + what + ' — ' + short(occ.due);
  return '🧾 OVERDUE ' + st.days + ' day' + (st.days === 1 ? '' : 's') + ': ' + what + ' — was due ' + short(occ.due);
}
/* cal = merge(...) result; → [{ item, occ, stage, days, title }] for today (paid and switched-off ones left out) */
function alertsFor(cal, today, paid){
  var out = [], pm = paid && !Array.isArray(paid) ? paid : paidMap(paid || cal.paid);
  arr(cal.items).forEach(function(item){
    if (item.on === false) return;
    var since = item.since || cal.startedAt || today, lead = item.lead || LEAD;
    occurrences(item, addDays(today, -400), addDays(today, lead)).forEach(function(occ){
      if (occ.due < since || pm[occ.key]) return;
      var st = stageOf(occ, today, lead); if (!st) return;
      out.push({ item: item, occ: occ, stage: st.stage, days: st.days, title: titleOf(item, occ, st) });
    });
  });
  out.sort(function(a, b){ return a.occ.due < b.occ.due ? -1 : a.occ.due > b.occ.due ? 1 : 0; });
  return out;
}
/* the home card: everything overdue + the next n due dates (unpaid, switched on) */
function upcoming(cal, today, paid, n){
  var pm = paid && !Array.isArray(paid) ? paid : paidMap(paid || cal.paid), over = [], next = [];
  arr(cal.items).forEach(function(item){
    if (item.on === false) return;
    var since = item.since || cal.startedAt || today;
    occurrences(item, addDays(today, -400), addDays(today, 400)).forEach(function(occ){
      if (occ.due < since || pm[occ.key]) return;
      var d = diff(today, occ.due), row = { item: item, occ: occ, days: d };
      if (d < 0) over.push(row); else next.push(row);
    });
  });
  var by = function(a, b){ return a.occ.due < b.occ.due ? -1 : a.occ.due > b.occ.due ? 1 : 0; };
  over.sort(by); next.sort(by);
  return { overdue: over, next: next.slice(0, n == null ? 3 : n) };
}

/* who is told: people = { admins: [emails], office: [emails] }. An owner item never goes to the office. */
function recipients(item, people){
  var A = arr0(people && people.admins).map(low).filter(Boolean), O = arr0(people && people.office).map(low).filter(Boolean), out;
  if (item.personal || item.owner) {
    out = item.who === 'admins' || !item.owner || A.indexOf(low(item.owner)) < 0 ? A : [low(item.owner)];
    return uniq(out.filter(function(e){ return A.indexOf(e) >= 0; }));
  }
  out = item.who === 'admins' ? A : item.who === 'office' ? O : A.concat(O);
  return uniq(out);
}
function uniq(l){ var o = []; l.forEach(function(x){ if (x && o.indexOf(x) < 0) o.push(x); }); return o; }

/* the estimated amount for a payroll item, from the approved / paid payroll runs (null = no payroll data → "enter amount") */
function estimate(item, occ, runs){
  if (item.personal) return num(item.amount) > 0 ? r2(item.amount) : null;
  if (!item.pay || !occ || !occ.period) return null;
  var tot = 0, lines = 0;
  arr(runs).forEach(function(r){
    if (['approved', 'paid'].indexOf(s(r.status)) < 0) return;
    var pd = s(r.payDate).slice(0, 10); if (!isYmd(pd) || pd < occ.period.from || pd > occ.period.to) return;
    arr(r.lines).forEach(function(L){
      if (s(L.status) === 'denied') return; lines++;
      if (item.pay === '941') tot += num(L.fed) + num(L.ss) * 2 + num(L.med) * 2 + num(L.addlMed);
      else if (item.pay === 'suta') tot += num(L.suta);
      else if (item.pay === 'futa') tot += num(L.futa);
    });
  });
  return lines ? r2(tot) : null;
}
function money(v){ var n = r2(v); return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

var API = { VERSION: VERSION, LEAD: LEAD, DEFAULTS: DEFAULTS, OWNER_DEFAULTS: OWNER_DEFAULTS, defaults: defaults, merge: merge, cleanItem: cleanItem,
  occurrences: occurrences, nextDue: nextDue, shiftDue: shiftDue, isBizDay: isBizDay, holidays: holidays, holidayName: holidayName,
  addDays: addDays, diff: diff, dow: dow, short: short, longDate: longDate, isYmd: isYmd, paidMap: paidMap, stageOf: stageOf, titleOf: titleOf,
  alertsFor: alertsFor, upcoming: upcoming, recipients: recipients, estimate: estimate, money: money, normDates: normDates,
  CPA_NOTE: 'These are reminders, not tax advice. Every date here starts as “Confirm with CPA” — the owner or the CPA confirms which apply, the dates and the amounts.' };
if (typeof module === 'object' && module.exports) module.exports = API; else root._gcTaxCal = API;
})(typeof window !== 'undefined' ? window : this);
