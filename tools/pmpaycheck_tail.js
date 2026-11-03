<script>
/* __GC_PMPAYCHECK__ — 🔎 PM pay check (patch PMPAYCHECK, owner 11/03: "make sure all checks we give to pms for commissions
   salary etc match up to what i do in payroll or flag for admin office view" · "we have been overpaying steven so i know
   the third quarter, but for 4th and beyond always alert").
   READ-ONLY reconciliation, per PM and per pay date, rolled up per quarter:
     SHOULD = the CRM's own figures — the per-job commission the commission engine worked out (gc_commission_paid: the
              pay matrix / pay-source rules / overhead split through _gcCalcCommission + _gcPmJobPay, runner and
              handoff "bringer" shares) due on or before each pay date, and salary = the payroll profile's annual
              salary ÷ pay periods.
     PAID   = the payroll runs (window.__GC_PAY.runs(), the paystub-entry runs included): each line's commission
              (line.commission, else the "Commission" grossParts) and its salary (gross − commission − bonus); a
              commission check actually written outside payroll (gc_check_queue, status written) counts as paid.
   Any gap over $1 is a flag. Pay dates through 9/30/2026 (Q3 2026 and earlier) never alert: they are one collapsed
   "Known — Q3 2026 (owner aware)" total. From 10/1/2026 on they ALWAYS alert — no snooze; a flag clears only with
   "✓ Checked — this is right" + a note (who / when / the amounts, on gc_payroll_approvals kind 'pmpay_check'), and it
   alerts again when the amounts change. Shows to admin + office only: a card on the Payroll page and one "other
   approval" per open flag in ✅ My Approvals. Never changes pay, runs, checks or the ledger.
   The pure core (W._gcPmPayCheck.compute) is run by tools/tests/test_PMPAYCHECK_fn.mjs in Node. */
(function(W){
'use strict';
if(W.__GC_PMPAYCHECK__) return; W.__GC_PMPAYCHECK__ = true;

var KNOWN_THROUGH = '2026-09-30', TOL = 1, AK = 'gc_payroll_approvals';
var PERIODS = { weekly:52, biweekly:26, semimonthly:24, monthly:12 };
function s(v){ return v == null ? '' : String(v); }
function n2(v){ var x = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(n2(v) * 100 + (n2(v) >= 0 ? 1e-7 : -1e-7)) / 100; }
function low(v){ return s(v).trim().toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function ymd(v){ var m = s(v).match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; }
function money(v){ var x = r2(v), neg = x < 0; return (neg ? '-$' : '$') + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function esc(v){ return s(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function quarterOf(d){ d = ymd(d); if(!d) return ''; return 'Q' + (Math.floor((+d.slice(5,7) - 1) / 3) + 1) + ' ' + d.slice(0,4); }
function isKnown(d){ d = ymd(d); return !!d && d <= KNOWN_THROUGH; }

/* the pay structure the commission engine needs (Admin → 👥 Team roles) */
function hasPaySetup(u){
  if(!u) return false;
  var pt = low(u.payType);
  if(u.payMatrix || u.paySourceRules || u.payRules) return true;
  if(pt === 'overhead_split' || pt === 'revenue_pct' || pt === 'custom') return true;
  return u.ownOverhead != null || u.ownSplit != null || (u.overhead != null && u.split != null);
}
function isPmUser(u){ var pt = low(u && u.payType); return !!u && pt !== 'owner' && (/project manager|^pm$/i.test(s(u.role)) || pt === 'overhead_split' || pt === 'revenue_pct' || pt === 'custom' || !!u.payMatrix); }
function runOk(r){ var st = low(r && r.status); return !!r && !r.tombstoned && !r.deleted && (st === 'paid' || st === 'approved'); }
function lineComm(L){
  if(L.commission != null && s(L.commission) !== '') return r2(L.commission);
  return r2(arr(L.grossParts).reduce(function(a, g){ return a + (/commission/i.test(s(g && g.label)) ? n2(g.amount) : 0); }, 0));
}
/* gc_commission_paid: { pid: { pm, amount, payDate, bringer, bringerAmount, … } } (an old list of ids has no amounts) */
function ledgerFor(ledger, name, projects){
  var w = low(name), out = [], pj = {};
  arr(projects).forEach(function(p){ if(p && p.id) pj[p.id] = p; });
  if(!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return out;
  Object.keys(ledger).forEach(function(pid){
    var e = ledger[pid]; if(!e || typeof e !== 'object') return;
    var d = ymd(e.payDate || e.at || e.date), jn = s(e.job || (pj[pid] && (pj[pid].name || pj[pid].address)) || pid);
    if(low(e.pm || e.who) === w && n2(e.amount != null ? e.amount : e.amt)) out.push({ pid:pid, job:jn, amount:r2(e.amount != null ? e.amount : e.amt), payDate:d, share:'runner' });
    if(e.bringer && low(e.bringer) === w && n2(e.bringerAmount)) out.push({ pid:pid, job:jn, amount:r2(e.bringerAmount), payDate:d, share:'handoff' });
  });
  return out;
}
function writtenCheck(queue, name, pid){
  var w = low(name);
  return arr(queue).filter(function(c){ return c && low(c.dir) === 'out' && /commission/i.test(s(c.type)) && low(c.status) === 'written' && low(c.emp) === w && s(c.jobId) === s(pid); })[0] || null;
}
function sig(f){ return r2(f.expected).toFixed(2) + '|' + r2(f.paid).toFixed(2); }
/* the latest "✓ Checked" record for a flag; cleared only while the amounts are the same */
function checkFor(checks, id){
  var hit = null;
  arr(checks).forEach(function(c){ if(c && c.kind === 'pmpay_check' && c.flagId === id && (!hit || s(c.at) > s(hit.at))) hit = c; });
  return hit;
}

/* input: { runs, profiles, users, ledger, checkQueue, projects, checks, today } */
function compute(o){
  o = o || {};
  var today = ymd(o.today) || ymd(new Date().toISOString()), users = arr(o.users), profiles = arr(o.profiles);
  var runs = arr(o.runs).filter(runOk).map(function(r){ return { r:r, d:ymd(r.payDate || r.payday || r.date) }; }).filter(function(x){ return x.d; });
  runs.sort(function(a, b){ return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  var dates = []; runs.forEach(function(x){ if(dates.indexOf(x.d) < 0) dates.push(x.d); });
  function userOf(p){ return users.filter(function(u){ return u && ((p.userId && u.id === p.userId) || low(u.name) === low(p.name)); })[0] || null; }

  /* who: payroll profiles on commission / of a PM, and anyone the ledger owes commission */
  var pms = [], seen = {};
  profiles.forEach(function(p){
    if(!p || !p.name || p.active === false || p.tombstoned) return;
    var u = userOf(p), pt = low(p.payType);
    if(!(/commission/.test(pt) || isPmUser(u))) return;
    var key = s(p.userId || p.name); if(seen[key]) return; seen[key] = 1;
    pms.push({ key:key, name:s(p.name), prof:p, user:u });
  });
  if(o.ledger && typeof o.ledger === 'object' && !Array.isArray(o.ledger)) Object.keys(o.ledger).forEach(function(pid){
    var e = o.ledger[pid]; if(!e) return;
    [e.pm || e.who, e.bringer].forEach(function(nm){
      if(!nm || pms.some(function(x){ return low(x.name) === low(nm); })) return;
      var u = users.filter(function(z){ return z && low(z.name) === low(nm); })[0] || null;
      pms.push({ key:s((u && u.id) || nm), name:s(nm), prof:null, user:u });
    });
  });
  /* patch PMPAY2: only active Team people who are not let go and not an owner / admin */
  (function(){ var fired = {}; try{ fired = JSON.parse(localStorage.getItem('gc_fired_users') || '{}') || {}; }catch(_f){}
    var owners = {}; try{ (window._gcOwnerNames ? window._gcOwnerNames() : []).forEach(function(n){ owners[low(n)] = 1; }); }catch(_o){}
    pms = pms.filter(function(pm){ var u = pm.user, nm = low(pm.name), em = low(u && u.email);
      if(fired[nm] || (em && fired[em])) return false;
      if(users.length && !u) return false;
      if(u && (u.active === false || u.fired === true || u.terminated === true || /inactive|terminat|former|fired|let go|removed/.test(low(u.status)))) return false;
      if(owners[nm] || (u && (/^(admin|owner)$/.test(low(u.role)) || low(u.payType) === 'owner'))) return false;
      return true; }); })();

  var flags = [], rows = [];
  pms.forEach(function(pm){
    var p = pm.prof || {}, pt = low(p.payType), setup = hasPaySetup(pm.user);
    var mine = function(L){ return L && (s(L.empId) === pm.key || (pm.user && s(L.empId) === s(pm.user.id)) || low(L.name) === low(pm.name)); };
    var led = ledgerFor(o.ledger, pm.name, o.projects), sepPaid = [];
    led = led.filter(function(e){ var c = writtenCheck(o.checkQueue, pm.name, e.pid); if(c){ sepPaid.push({ entry:e, check:c }); return false; } return true; });
    var anyCommLine = runs.some(function(x){ return arr(x.r.lines).some(function(L){ return mine(L) && lineComm(L) > 0; }); });
    var needsComm = /commission/.test(pt) || led.length > 0 || anyCommLine || isPmUser(pm.user);
    if(needsComm && !setup){
      flags.push({ id:'nosetup|' + pm.key, kind:'nosetup', empId:pm.key, name:pm.name, payDate:'', quarter:'', known:false, expected:0, paid:0, diff:0,
        reason:'No pay setup for ' + pm.name + ' — can\'t check commission (set the pay structure in Admin → 👥 Team roles)', jobs:[], runs:[] });
    }
    var salaried = (pt === 'salary' || pt === 'salary_commission') && n2(p.annualSalary) > 0;
    dates.forEach(function(d, i){
      var prev = i ? dates[i-1] : '', lines = [], runIds = [];
      runs.forEach(function(x){ if(x.d !== d) return; arr(x.r.lines).forEach(function(L){ if(mine(L)){ lines.push(L); if(runIds.indexOf(x.r.id) < 0) runIds.push(x.r.id); } }); });
      var due = led.filter(function(e){ return e.payDate && e.payDate > prev && e.payDate <= d; });
      var expC = r2(due.reduce(function(a, e){ return a + e.amount; }, 0));
      if(!lines.length && !(setup && expC)) return;
      var paidC = r2(lines.reduce(function(a, L){ return a + lineComm(L); }, 0));
      var paidS = r2(lines.reduce(function(a, L){ return a + n2(L.gross) - lineComm(L) - n2(L.bonus); }, 0));
      var per = PERIODS[low((lines[0] && lines[0].period) || p.period) || 'weekly'] || 52;
      var expS = salaried && lines.length ? r2(n2(p.annualSalary) / per) : null;
      var row = { empId:pm.key, name:pm.name, payDate:d, quarter:quarterOf(d), known:isKnown(d), expComm:setup ? expC : null, paidComm:paidC, expSal:expS, paidSal:paidS, runs:runIds, jobs:due };
      rows.push(row);
      var base = { empId:pm.key, name:pm.name, payDate:d, quarter:row.quarter, known:row.known, runs:runIds };
      if(setup && Math.abs(paidC - expC) > TOL){
        var owed = paidC < expC;
        flags.push(Object.assign({}, base, { id:'comm|' + pm.key + '|' + d, kind:owed ? 'comm_owed' : 'comm_unearned', expected:expC, paid:paidC, diff:r2(paidC - expC), jobs:due,
          reason: owed ? ('Commission owed but not paid: ' + money(expC - paidC) + ' — the CRM has ' + money(expC) + ' due by ' + d + ' (' + due.length + ' job' + (due.length === 1 ? '' : 's') + '), payroll paid ' + money(paidC))
                       : ('Commission paid but not earned: ' + money(paidC - expC) + ' — payroll paid ' + money(paidC) + ', the CRM has ' + money(expC) + ' due ' + (prev ? 'after ' + prev + ' ' : '') + 'through ' + d) }));
      }
      if(expS != null && Math.abs(paidS - expS) > TOL){
        flags.push(Object.assign({}, base, { id:'sal|' + pm.key + '|' + d, kind:'salary', expected:expS, paid:paidS, diff:r2(paidS - expS), jobs:[],
          reason:'Salary different from the profile: paid ' + money(paidS) + ', the profile says ' + money(expS) + ' (' + money(p.annualSalary) + ' a year ÷ ' + per + ')' }));
      }
    });
    /* due before today but on no run yet */
    var last = dates.length ? dates[dates.length - 1] : '';
    var late = setup ? led.filter(function(e){ return e.payDate && e.payDate > last && e.payDate < today; }) : [];
    if(late.length){
      var dl = late.reduce(function(a, e){ return e.payDate > a ? e.payDate : a; }, ''), amt = r2(late.reduce(function(a, e){ return a + e.amount; }, 0));
      flags.push({ id:'comm|' + pm.key + '|open', kind:'comm_owed', empId:pm.key, name:pm.name, payDate:dl, quarter:quarterOf(dl), known:isKnown(dl), expected:amt, paid:0, diff:-amt, jobs:late, runs:[],
        reason:'Commission owed but not paid: ' + money(amt) + ' was due by ' + dl + ' and is on no payroll run yet' });
    }
    pm.sepPaid = sepPaid;
  });

  flags.forEach(function(f){
    f.sig = sig(f);
    var c = checkFor(o.checks, f.id);
    f.check = c;
    f.cleared = !!(c && c.sig === f.sig);
    f.changed = !!(c && c.sig !== f.sig);
  });
  var alerts = flags.filter(function(f){ return !f.known && !f.cleared; });
  var knownF = flags.filter(function(f){ return f.known; });
  var kt = { count:knownF.length, expected:0, paid:0, over:0, under:0, byName:{} };
  knownF.forEach(function(f){ kt.expected = r2(kt.expected + f.expected); kt.paid = r2(kt.paid + f.paid); if(f.diff > 0) kt.over = r2(kt.over + f.diff); else kt.under = r2(kt.under - f.diff);
    var b = kt.byName[f.name] = kt.byName[f.name] || { over:0, under:0, count:0 }; b.count++; if(f.diff > 0) b.over = r2(b.over + f.diff); else b.under = r2(b.under - f.diff); });
  var quarters = {};
  rows.forEach(function(r){ var k = r.name + '|' + r.quarter, q = quarters[k] = quarters[k] || { name:r.name, quarter:r.quarter, known:r.known, expComm:0, paidComm:0, expSal:0, paidSal:0, periods:0 };
    q.periods++; q.expComm = r2(q.expComm + n2(r.expComm)); q.paidComm = r2(q.paidComm + r.paidComm); q.expSal = r2(q.expSal + n2(r.expSal == null ? r.paidSal : r.expSal)); q.paidSal = r2(q.paidSal + r.paidSal); });
  return { flags:flags, alerts:alerts, known:kt, rows:rows, quarters:Object.keys(quarters).map(function(k){ return quarters[k]; }), pms:pms.map(function(p){ return { key:p.key, name:p.name, setup:hasPaySetup(p.user), sepPaid:p.sepPaid }; }) };
}
/* the record "✓ Checked — this is right" stores */
function checkRecord(f, note, by, now){
  now = now || new Date().toISOString();
  return { id:'pmpay_' + f.id.replace(/[^A-Za-z0-9_-]/g, '_'), kind:'pmpay_check', flagId:f.id, name:f.name, payDate:f.payDate, flagKind:f.kind,
    expected:r2(f.expected), paid:r2(f.paid), sig:f.sig || sig(f), note:s(note), by:s(by), at:now, createdAt:now, updatedAt:now };
}
W._gcPmPayCheck = { compute:compute, checkRecord:checkRecord, quarterOf:quarterOf, isKnown:isKnown, hasPaySetup:hasPaySetup, KNOWN_THROUGH:KNOWN_THROUGH };

if(!W.document) return;   /* Node test: the pure core only */

/* ── in the CRM ─────────────────────────────────────────────────────────── */
function P(){ return W.__GC_PAY; }
function canSee(){ try{ var p = P(); return !!(p && p.canSee && p.canSee()); }catch(e){ return false; } }
function readA(){ var v = null; try{ v = JSON.parse(localStorage.getItem(AK) || '[]'); }catch(e){} return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function writeA(list){ try{ localStorage.setItem(AK, JSON.stringify(list)); }catch(e){}
  try{ if(W.idbSet) W.idbSet(AK, list); }catch(e){} try{ if(W._supaUpsert) W._supaUpsert(AK, list); }catch(e){}
  try{ if(W._gcApprovalSetFresh) W._gcApprovalSetFresh(); }catch(e){} }
function lsJ(k, d){ try{ var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; }catch(e){ return d; } }
var LAST = null, busy = null;
async function refresh(){
  if(busy) return busy;
  busy = (async function(){
    try{
      var p = P(); if(!p) return LAST;
      var runs = await p.runs(), profs = await p.profiles(), pj = [];
      try{ pj = (W._crm && W._crm.projects) || []; }catch(e){}
      var before = LAST ? LAST.alerts.map(function(f){ return f.id + f.sig; }).join(',') : null;
      LAST = compute({ runs:runs, profiles:profs, users:(p.users && p.users()) || [], ledger:lsJ('gc_commission_paid', {}), checkQueue:lsJ('gc_check_queue', []), projects:pj, checks:readA() });
      LAST.at = Date.now();
      if(before !== LAST.alerts.map(function(f){ return f.id + f.sig; }).join(',')){ try{ if(W._gcApprovalSetFresh) W._gcApprovalSetFresh(); }catch(e){} }
    }catch(e){ try{ console.warn('PM pay check', e); }catch(_e){} }
    return LAST;
  })();
  try{ return await busy; } finally{ busy = null; }
}
W._gcPmPayRefresh = refresh;

var BTN = 'padding:5px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#0f2440;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;';
var TD = 'padding:5px 8px;border-bottom:1px solid #eef2f7;font-size:12px;';
function flagHtml(f){
  var jobs = arr(f.jobs).map(function(j){ return '<a href="#" data-pmp-job="' + esc(j.pid) + '" style="color:#2563eb">' + esc(j.job) + '</a> ' + money(j.amount) + (j.share === 'handoff' ? ' (handoff)' : ''); }).join(' · ');
  var rs = arr(f.runs).map(function(id){ return '<a href="#" data-pmp-run="' + esc(id) + '" style="color:#2563eb">run ' + esc(f.payDate) + '</a>'; }).join(' · ');
  return '<div data-pmp-flag="' + esc(f.id) + '" style="border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:8px 10px;margin:6px 0">'
    + '<div style="font-weight:800">⚠ ' + esc(f.name) + (f.payDate ? ' · ' + esc(f.payDate) + ' (' + esc(f.quarter) + ')' : '') + '</div>'
    + '<div style="font-size:13px;margin:2px 0">' + esc(f.reason) + '</div>'
    + (f.changed ? '<div style="font-size:12px;color:#b91c1c">Checked by ' + esc(f.check.by) + ' ' + esc(s(f.check.at).slice(0,10)) + ' at ' + money(f.check.expected) + ' / ' + money(f.check.paid) + ' — the amounts changed since.</div>' : '')
    + (jobs ? '<div style="font-size:12px">Jobs: ' + jobs + '</div>' : '') + (rs ? '<div style="font-size:12px">Payroll: ' + rs + '</div>' : '')
    + '<div style="margin-top:6px"><button data-pmp-ok="' + esc(f.id) + '" style="' + BTN + 'border-color:#16a34a;color:#166534">✓ Checked — this is right</button></div></div>';
}
function cardHtml(R, focus){
  var al = R.alerts.slice(); if(focus) al.sort(function(a, b){ return (b.id === focus) - (a.id === focus); });
  var k = R.known, ok = R.flags.filter(function(f){ return f.cleared && !f.known; });
  var qs = R.quarters.filter(function(q){ return !q.known; });
  return '<div style="background:#fff;border:1px solid ' + (al.length ? '#fca5a5' : '#bbf7d0') + ';border-radius:10px;padding:12px 14px;margin-bottom:12px">'
    + '<div style="font-size:15px;font-weight:800">' + (al.length ? ('🔎 PM pay check — ' + al.length + ' to look at') : '🔎 PM pay check — PM pay matches payroll') + '</div>'
    + '<div style="font-size:12px;color:#64748b">What each PM should get (the CRM\'s commission per job + profile salary) against what payroll paid. Read-only — nothing here changes pay.</div>'
    + al.map(flagHtml).join('')
    + (qs.length ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700;font-size:13px">By quarter (Q4 2026 on)</summary><table style="border-collapse:collapse;width:100%;margin-top:4px"><tr>'
      + ['PM','Quarter','Pay dates','Commission due','Commission paid','Salary due','Salary paid'].map(function(h){ return '<th style="' + TD + 'text-align:left;color:#64748b">' + h + '</th>'; }).join('') + '</tr>'
      + qs.map(function(q){ return '<tr><td style="' + TD + '">' + esc(q.name) + '</td><td style="' + TD + '">' + esc(q.quarter) + '</td><td style="' + TD + '">' + q.periods + '</td><td style="' + TD + '">' + money(q.expComm) + '</td><td style="' + TD + '">' + money(q.paidComm) + '</td><td style="' + TD + '">' + money(q.expSal) + '</td><td style="' + TD + '">' + money(q.paidSal) + '</td></tr>'; }).join('')
      + '</table></details>' : '')
    + (ok.length ? '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:13px">✓ Checked (' + ok.length + ')</summary>' + ok.map(function(f){ return '<div style="font-size:12px;margin:3px 0">' + esc(f.name) + ' ' + esc(f.payDate) + ': ' + esc(f.reason) + ' — checked by ' + esc(f.check.by) + ' ' + esc(s(f.check.at).slice(0,10)) + ': “' + esc(f.check.note) + '”</div>'; }).join('') + '</details>' : '')
    + (k.count ? '<details data-pmp-known style="margin-top:6px"><summary style="cursor:pointer;font-size:13px">Known — Q3 2026 (owner aware): ' + k.count + ' gap' + (k.count === 1 ? '' : 's') + ', ' + money(k.over) + ' overpaid, ' + money(k.under) + ' underpaid</summary>'
      + Object.keys(k.byName).map(function(nm){ var b = k.byName[nm]; return '<div style="font-size:12px;margin:3px 0">' + esc(nm) + ': ' + b.count + ' pay date' + (b.count === 1 ? '' : 's') + ' · ' + money(b.over) + ' over · ' + money(b.under) + ' under</div>'; }).join('')
      + '<div style="font-size:12px;color:#64748b">Due ' + money(k.expected) + ' · paid ' + money(k.paid) + ' (pay dates through 9/30/2026 — no alerts)</div></details>' : '')
    + '</div>';
}
function wire(el, R, again){
  Array.prototype.forEach.call(el.querySelectorAll('[data-pmp-job]'), function(a){ a.onclick = function(e){ e.preventDefault(); try{ W._gcOpenProject && W._gcOpenProject(a.getAttribute('data-pmp-job')); }catch(_e){} }; });
  Array.prototype.forEach.call(el.querySelectorAll('[data-pmp-run]'), function(a){ a.onclick = function(e){ e.preventDefault(); var ov = document.getElementById('_gcPmPayOv'); if(ov) ov.remove(); try{ W._gcPayrollOpenRun && W._gcPayrollOpenRun(a.getAttribute('data-pmp-run')); }catch(_e){} }; });
  Array.prototype.forEach.call(el.querySelectorAll('[data-pmp-ok]'), function(b){ b.onclick = async function(){
    var id = b.getAttribute('data-pmp-ok'), f = R.flags.filter(function(x){ return x.id === id; })[0]; if(!f) return;
    var note = W.prompt('✓ Checked — this is right.\n' + f.name + (f.payDate ? ' ' + f.payDate : '') + ': ' + f.reason + '\n\nWhy is it right? (required)');
    if(note == null) return; note = s(note).trim(); if(!note){ W.alert('A note is needed to clear the flag.'); return; }
    var me = ''; try{ me = P().me(); }catch(e){}
    var rec = checkRecord(f, note, me), list = readA().filter(function(x){ return x.id !== rec.id; });
    var old = readA().filter(function(x){ return x.id === rec.id; })[0]; if(old) rec.history = arr(old.history).concat([{ by:old.by, at:old.at, note:old.note, expected:old.expected, paid:old.paid }]);
    list.push(rec); writeA(list); await refresh(); again();
  }; });
}
async function renderInto(el, focus){
  if(!el || !canSee()) return;
  var R = await refresh(); if(!R) return;
  el.innerHTML = cardHtml(R, focus); wire(el, R, function(){ renderInto(el, focus); });
}
W._gcPmPayCard = renderInto;
function openOverlay(focus){
  var old = document.getElementById('_gcPmPayOv'); if(old) old.remove();
  var ov = document.createElement('div'); ov.id = '_gcPmPayOv'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;';
  ov.innerHTML = '<div style="max-width:760px;width:100%;color:#0f2440"><div style="text-align:right;margin-bottom:6px"><button data-x style="' + BTN + '">✕ Close</button></div><div data-body></div></div>';
  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  ov.onclick = function(e){ if(e.target === ov) ov.remove(); };
  document.body.appendChild(ov); renderInto(ov.querySelector('[data-body]'), focus);
}
W._gcPmPayOpen = openOverlay;

/* ✅ My Approvals — one "other approval" per open flag (counted in the header like the Form 941 one) */
function items(){
  if(!canSee() || !LAST) return [];
  return LAST.alerts.map(function(f){
    return { id:'pmpay:' + f.id, at:f.payDate || '', urgency:'asap',
      title:'🔎 PM pay: ' + f.name + (f.payDate ? ' · ' + f.payDate : '') + (f.kind === 'nosetup' ? ' — no pay setup' : f.kind === 'salary' ? ' — salary differs' : f.kind === 'comm_owed' ? ' — commission owed, not paid' : ' — commission paid, not earned'),
      sub:f.reason, act:{ l:'🔎 Look', f:function(){ openOverlay(f.id); } } };
  });
}
W._gcPmPayItems = items;
function hookApprovals(){
  var prev = W._gcHot1Approvals; if(prev && prev.__gcPmPay) return;
  var w = function(){ var base = []; try{ base = typeof prev === 'function' ? (prev.apply(this, arguments) || []) : []; }catch(e){} try{ return (Array.isArray(base) ? base : []).concat(items()); }catch(e){ return base; } };
  try{ if(prev) Object.keys(prev).forEach(function(k){ w[k] = prev[k]; }); }catch(e){}
  w.__gcPmPay = true; W._gcHot1Approvals = w;
}
hookApprovals(); setTimeout(hookApprovals, 4000); setInterval(hookApprovals, 15000);
setTimeout(function(){ if(canSee()) refresh(); }, 8000); setInterval(function(){ if(canSee()) refresh(); }, 60000);
})(window);
</script>
