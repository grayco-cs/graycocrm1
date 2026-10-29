/* MONEY-CORE-START — patch AUTOMONEY: the owner's three money rules, pure (no I/O). The same text runs on the server
   (netlify/functions/_lib/money-rules.js, lien.js) and in the CRM page (tools/automoney_tail.js embeds this file as is;
   tools/tests/test_AUTOMONEY.js checks the two are identical).
     1. DEPOSIT BEFORE SCHEDULING (owner: "yes … pm can override before admin but admin office gets a note")
     2. SUB LIEN WAIVERS by job type (owner: "default for residential to not have lien waivers but can make them have them,
        default on commercial to have lien waivers and can change to no")
     3. JOB PROFIT ALERT (owner: "yes alert") — costs at 80 % of the budget, then at 100 %, once each. */
var GCMoneyCore = (function(){
  'use strict';
  function s(v){ return v == null ? '' : String(v).trim(); }
  function low(v){ return s(v).toLowerCase(); }
  function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,%\s]/g, '')); return isFinite(n) ? n : 0; }
  function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
  /* the day these rules start: jobs already on the schedule / sub invoices received before it are left as they were */
  var SINCE = '2026-10-29';

  /* ── 1 · DEPOSIT ─────────────────────────────────────────────────────────────────────────────── */
  var DEP_RX = /deposit|retainer|down ?payment|mobiliz/;
  function invPaid(iv){ var st = low(iv.status); if (/void|cancel|deleted|refund/.test(st)) return false; return st === 'paid' || iv.paid === true || (!!s(iv.paidDate) && st !== 'unpaid'); }
  /* is the deposit in? p = the job; invoices = the CRM's invoices (client ones count); payments = projectPayments */
  function depositState(p, invoices, payments){
    p = p || {}; var pid = s(p.id);
    if (p.depositPaid === true || p.depositReceived === true || s(p.depositPaidDate)) return { paid: true, how: 'marked paid on the job' };
    var dep = null, any = null, open = null;
    arr(invoices).forEach(function(iv){
      if (s(iv.pid || iv.projectId) !== pid || iv.deleted === true) return;
      var ty = low(iv.type); if (ty === 'sub' || ty === 'supplier' || ty === 'bill') return;
      var isDep = DEP_RX.test(low([iv.drawType, iv.desc, iv.title, iv.kind, iv.label, iv.type].join(' ')));
      if (invPaid(iv)) { if (isDep && !dep) dep = iv; if (!any) any = iv; }
      else if (isDep && !open && !/void|cancel/.test(low(iv.status))) open = iv;
    });
    if (dep) return { paid: true, how: 'deposit invoice paid', id: s(dep.id) };
    var pay = arr(payments).filter(function(x){ return s(x.pid || x.projectId) === pid && num(x.amount != null ? x.amount : x.amt) > 0 && !/void|refund|bounce|fail/.test(low(x.status)); })[0];
    if (pay) return { paid: true, how: 'customer payment recorded' };
    if (any) return { paid: true, how: 'customer invoice paid' };
    return { paid: false, how: open ? 'deposit invoice sent, not paid yet' : 'no deposit invoice yet', openId: open ? s(open.id) : '' };
  }
  /* crew / sub days are gated; meetings, inspections, walk-throughs and the start / end markers are not */
  var NOT_WORK = /\b(meeting|walk ?-?through|walkthrough|inspection|estimate|measure|consult|appointment|site visit|end date|deadline|close ?out|final walk|pre-?con)\b/i;
  function isWorkDay(item){ item = item || {}; var ty = low(item.type); if (ty && ty !== 'work' && ty !== 'sub' && ty !== 'crew') return false; return !NOT_WORK.test(s(item.title)); }
  function overrideFor(pid, list){
    return arr(list).filter(function(x){ return s(x.pid) === s(pid) && x.revoked !== true; }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); })[0] || null;
  }
  var CLOSED = /complete|closed|finished|archived|lost|cancel|dead|void/;
  /* o: { p, required, dep (depositState), overrides, item {title,type}, hasWork (the job already has work days on the schedule) }
     → { ok, why, override? } */
  function gate(o){
    o = o || {}; var p = o.p || {};
    if (!o.required) return { ok: true, why: 'deposit not required for this job type' };
    if (p.importedHistory === true || p.historyOnly === true || p.noSend === true) return { ok: true, why: 'history job' };
    if (CLOSED.test(low(p.status))) return { ok: true, why: 'job closed' };
    if (o.item && !isWorkDay(o.item)) return { ok: true, why: 'not a crew / sub day' };
    if (o.dep && o.dep.paid) return { ok: true, why: 'deposit paid' };
    var ov = overrideFor(p.id, o.overrides);
    if (ov) return { ok: true, why: 'scheduled anyway', override: ov };
    if (o.hasWork && s(p.createdAt || p.created || p.date).slice(0, 10) < SINCE) return { ok: true, why: 'already on the schedule before this rule' };
    return { ok: false, why: 'deposit', text: 'No deposit yet — ' + ((o.dep && o.dep.how) || 'not recorded') + '.' };
  }
  /* who may press "Schedule anyway": the job's PM, or an admin */
  function canOverride(o){ o = o || {}; return !!(o.admin || (s(o.me) && low(o.me) === low(o.pm))); }
  function cleanReason(r){ r = s(r).replace(/\s+/g, ' '); return r.length >= 3 ? r.slice(0, 300) : ''; }

  /* ── 2 · LIEN WAIVERS ────────────────────────────────────────────────────────────────────────── */
  /* o: { own (p.auto.subLien when the job says so, else undefined), typeDefault (the job type's default),
          legacyJob (the old "every sub on this job" switch), legacySub (the old "always ask this sub") } */
  function lienRequired(o){
    o = o || {};
    var job = typeof o.own === 'boolean' ? o.own : (!!o.legacyJob || !!o.typeDefault);
    return !!(job || o.legacySub);
  }
  function lienDone(w){ return !!(w && /^(signed|uploaded|paper)$/.test(s(w.status))); }
  /* the hold on a sub's check: null = may be paid; else the reason (o: { required, waiver, inv }) */
  function payHold(o){
    o = o || {};
    if (!o.required) return null;
    if (lienDone(o.waiver)) return null;
    var inv = o.inv || {}, got = s(inv.recvDate || inv.date || inv.createdAt).slice(0, 10);
    if (!o.waiver && got && got < SINCE) return null;   /* invoices in before the rule: never held by it */
    var st = s(o.waiver && o.waiver.status);
    var where = st === 'sent' ? 'sent to the sub — waiting for their signature in the Sub Portal'
      : st === 'waiting_approval' ? 'the request waits on the approvals list (first one to this sub)'
      : st === 'no_email' ? 'no e-mail on file for this sub'
      : 'not requested yet';
    return 'Lien waiver needed before this check (required on this job) — ' + where + '. The office can mark it received on paper.';
  }

  /* ── 3 · PROFIT ALERT ────────────────────────────────────────────────────────────────────────── */
  function levels(set){ set = set || {}; var w = num(set.warnPct) || 80, o = num(set.overPct) || 100; if (w >= o) w = Math.max(1, o - 1); return [Math.round(w), Math.round(o)]; }
  /* o: { actual, budget, set {warnPct, overPct}, fired { <level>: true } } → { pct, fire (the level to alert now, or 0), mark [levels now done] } */
  function profitCheck(o){
    o = o || {}; var budget = num(o.budget), actual = num(o.actual), L = levels(o.set), fired = o.fired || {};
    if (!(budget > 0) || !(actual > 0)) return { pct: 0, fire: 0, mark: [] };
    var pct = Math.round(actual / budget * 1000) / 10, reached = L.filter(function(l){ return pct >= l; });
    var fresh = reached.filter(function(l){ return !fired[l]; });
    if (!fresh.length) return { pct: pct, fire: 0, mark: [] };
    return { pct: pct, fire: fresh[fresh.length - 1], mark: fresh, over: pct >= L[1] };   /* straight past both: one alert (the higher) */
  }
  return { SINCE: SINCE, depositState: depositState, isWorkDay: isWorkDay, overrideFor: overrideFor, gate: gate, canOverride: canOverride, cleanReason: cleanReason,
    lienRequired: lienRequired, lienDone: lienDone, payHold: payHold, levels: levels, profitCheck: profitCheck };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GCMoneyCore;
/* MONEY-CORE-END */
