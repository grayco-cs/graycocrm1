/* __GC_PATCH_OFFICEAPPR__ ═════════════════════════════════════════════════════════════════════════════════════
   GrayCo — the office approves everything except payroll; 🚗 employee mileage log (patch OFFICEAPPR, owner 10/27).

   A. "The office manager can approve everything except payroll."
      The office = a CRM user whose role starts with "Office" (e.g. "Office Admin"), or office@grayco-cs.com — never an
      admin's "View as" preview. She may approve every approval an admin may, at any step: change orders of any size
      (commercial CO steps too), estimates / proposals / contracts to sign, customer e-mails, texts and portal invites
      (approving at the PM's step counts as the PM's step done, the same rule as an admin), money / legal papers,
      automations, sub invoices, expenses, invoice sign-offs, bid e-mails, materials, sub scopes, the bid site.
      NOT payroll: payroll runs, the payroll week sign-off, pay stubs — Wesley / Nick (admins) only, here and on the
      server (portal.js refuses a payroll item to anyone but an admin). She gets no admin-only screens from this
      (payroll screens, staff / security settings, API keys stay as they were) — only the approvals.
      Anything that goes to a customer still asks once ("This sends it to …"). Every approval records who, as what
      (role "office"), and when. The 24-hour escalation still tells her when Wesley / Nick have not answered.
      window._gcOA = { office(), canAct(item), payroll(item), approver() }

   B. 🚗 MY MILEAGE (top 💎 menu, phone field app → More): any employee logs company-errand miles — date, from / to
      or purpose, an optional job, miles (or start / end odometer), round trip. Rate $0.70 / mile (an admin changes it:
      gc_kv "gc_mileage_settings", every computer). The list shows each week's trips and total. Each week goes to
      ✅ Approvals as one "Mileage reimbursement" (Wesley, Nick or the office — nobody approves their own; the office's
      own mileage is approved by an admin). Approved weeks are added to that person's next payroll run as a
      non-taxable "Mileage reimbursement" line (on the pay stub too), and marked paid when the run is approved.
      Data: gc_kv "gc_mileage" { entries:[…], weeks:[…] } (merged by id, newer wins).
      window._gcMileage = { open(), state(), rate(), setRate(r), add(o), approve(weekId), reject(weekId, why),
                            weekOf(date), forPay(profile, to), load() }
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_OFFICEAPPR__) return; window.__GC_PATCH_OFFICEAPPR__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return RI.call(W, f, ms); }
function s(v){ return (v == null ? '' : String(v)).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function r1(v){ return Math.round(num(v) * 10) / 10; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v){ return '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function nowIso(){ return new Date().toISOString(); }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function warn(e){ try { console.warn('[GC OFFICEAPPR]', e && e.message || e); } catch (x) {} }
function toast(msg, bad){ try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.className = 'gcmi-toast' + (bad ? ' bad' : ''); t.textContent = msg; D.body.appendChild(t); later(function(){ t.remove(); }, 4200); } catch (e) {} }

/* ═══ A. who may approve ═══ */
function users(){ return arr(W._crm && W._crm.users); }
function myEmail(){ try { var A = W.__GC_AUTH__, e = A && A.email && A.email(); if (e) return low(e); } catch (e) {} return ''; }
function meUser(){
  var e = myEmail(), g = s(lsGet('grayco_user'));
  return users().filter(function(u){ return u && ((e && low(u.email) === e) || (!e && g && (low(u.email) === low(g) || u.name === g))); })[0] || null;
}
function myName(){ var u = meUser(); return s(u && u.name) || myEmail() || s(lsGet('grayco_user')); }
function realAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function vasActive(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
function isOffice(){
  if (realAdmin() || vasActive()) return false;
  var e = myEmail(); if (!e) return false;
  var u = meUser(); if (u && u.active === false) return false;
  return e === 'office@grayco-cs.com' || !!(u && /^office/i.test(s(u.role)));
}
var PAYROLL = /payroll|pay_?stub|paystub|paycheck|pay_?run|pay_?week|wage_run/i;
function payrollItem(x){ if (!x) return false; if (typeof x === 'string') return PAYROLL.test(x); var m = x.meta || {}; return PAYROLL.test(s(x.kind)) || PAYROLL.test(s(m.kind)) || m.payroll === true || x.payroll === true || x.src === 'pay'; }
function ownItem(x){ var m = (x && x.meta) || {}, e = myEmail(); return !!e && (low(x && x.emp) === e || (x && x.kind === 'mileage' && low(m.by) === e)); }
function canAct(x){ return !!x && isOffice() && !payrollItem(x) && !ownItem(x); }
W._gcOA = { office: isOffice, canAct: canAct, payroll: payrollItem, approver: function(){ return realAdmin() || isOffice(); }, PAYROLL: PAYROLL };

/* ═══ B. mileage ═══ */
var KEY = 'gc_mileage', SKEY = 'gc_mileage_settings', LS = 'gc_mileage_cache', LSS = 'gc_mileage_settings_cache', DEFAULT_RATE = 0.70;
function parse(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' ? v : null; }
var DATA = (function(){ var v = parse(lsGet(LS)); return { entries: arr(v && v.entries), weeks: arr(v && v.weeks) }; })();
var SET = (function(){ var v = parse(lsGet(LSS)); return v && num(v.rate) > 0 ? v : { rate: DEFAULT_RATE }; })();
function rate(){ var r = num(SET && SET.rate); return r > 0 ? r : DEFAULT_RATE; }
function creds(){ return { u: s(lsGet('grayco_sb_url')).replace(/\/$/, ''), k: s(lsGet('grayco_sb_key')) }; }
function cloudRead(key){
  var c = creds();
  if (!c.u || !c.k || typeof W.fetch !== 'function') return Promise.resolve({ ok: false });
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ if (!r.ok) return { ok: false }; return r.json().then(function(rows){ return Array.isArray(rows) ? { ok: true, value: parse(rows.length ? rows[0].value : null) } : { ok: false }; }); })
    .catch(function(){ return { ok: false }; });
}
function cloudWrite(key, val){
  var c = creds();
  if (c.u && c.k && typeof W.fetch === 'function') {
    return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, Authorization: 'Bearer ' + c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: key, value: val, updated_at: nowIso() }) }).then(function(r){ if (!r.ok) throw new Error('The cloud answered ' + r.status + '.'); return true; });
  }
  var f = typeof W._supaUpsertNow === 'function' ? W._supaUpsertNow : W._supaUpsert;
  if (typeof f !== 'function') return Promise.reject(new Error('The cloud is not connected on this computer.'));
  return Promise.resolve(f(key, val)).then(function(){ return true; });
}
function newer(a, b){ return s(a.updatedAt || a.createdAt) >= s(b.updatedAt || b.createdAt) ? a : b; }
function mergeList(a, b){ var at = {}, out = []; arr(a).concat(arr(b)).forEach(function(x){ var id = s(x && x.id); if (!id) return; if (!(id in at)) { at[id] = out.length; out.push(x); return; } out[at[id]] = newer(out[at[id]], x); }); return out; }
function take(v){ if (!v) return; DATA = { entries: mergeList(DATA.entries, v.entries), weeks: mergeList(DATA.weeks, v.weeks) }; lsSet(LS, JSON.stringify(DATA)); }
var loading = null, loadedAt = 0;
function load(){
  if (loading) return loading;
  loading = Promise.all([cloudRead(KEY), cloudRead(SKEY)]).then(function(r){
    if (r[0].ok) take(r[0].value);
    if (r[1].ok && r[1].value && num(r[1].value.rate) > 0) { SET = r[1].value; lsSet(LSS, JSON.stringify(SET)); }
    loadedAt = Date.now(); loading = null; repaint(); return DATA;
  }, function(){ loading = null; return DATA; });
  return loading;
}
/* read the cloud, change, write back (merged by id: two computers never lose each other's trips) */
function save(mut){
  return cloudRead(KEY).then(function(r){
    if (r.ok) take(r.value);
    var res = mut(DATA);
    if (res === false) return false;
    lsSet(LS, JSON.stringify(DATA));
    return cloudWrite(KEY, { v: 1, entries: DATA.entries, weeks: DATA.weeks, updatedAt: nowIso() }).then(function(){ repaint(); return res === undefined ? true : res; });
  });
}
function ymd(d){ d = d instanceof Date ? d : new Date(s(d).slice(0, 10) + 'T12:00:00'); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function today(){ return ymd(new Date()); }
/* the week a trip belongs to: Monday – Sunday */
function weekOf(date){ var d = new Date(s(date).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) d = new Date(); var off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); var a = ymd(d); d.setDate(d.getDate() + 6); return { start: a, end: ymd(d) }; }
function nice(dstr){ try { return new Date(s(dstr).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return s(dstr); } }
function when(v){ var t = Date.parse(v || ''); if (!t) return ''; try { return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
function liveEntries(){ return DATA.entries.filter(function(e){ return e && !e.deleted; }); }
function liveWeeks(){ return DATA.weeks.filter(function(w){ return w && !w.deleted; }); }
function entriesOf(wid){ return liveEntries().filter(function(e){ return e.weekId === wid; }).sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : 1; }); }
function totals(wid){ var l = entriesOf(wid), mi = 0, amt = 0; l.forEach(function(e){ mi += num(e.miles); amt += num(e.amount); }); return { trips: l.length, miles: r1(mi), amount: r2(amt) }; }
function recompute(w){ var t = totals(w.id); w.trips = t.trips; w.miles = t.miles; w.amount = t.amount; w.updatedAt = nowIso(); if (!t.trips && w.status === 'pending') w.deleted = true; return w; }
function personName(email){ var u = users().filter(function(x){ return x && low(x.email) === low(email); })[0]; return s(u && u.name) || s(email); }
function whoName(w){ var n = personName(w.emp); return n && n !== s(w.emp) ? n : (s(w.empName) || s(w.emp)); }
function projects(){ return arr(W._crm && W._crm.projects).filter(function(p){ return p && p.id && !p.deleted && !/lost|void|archiv|deleted/i.test(s(p.status)); }); }
function jobLabel(pid){ var p = arr(W._crm && W._crm.projects).filter(function(x){ return x && s(x.id) === s(pid); })[0]; if (!p) return ''; if (W._gcJobLabel) try { return W._gcJobLabel(p); } catch (e) {} return [p.autoPO ? 'PO ' + p.autoPO : '', s(p.name)].filter(Boolean).join(' · '); }

/* log one trip. miles typed (× 2 for a round trip) or the odometer start / end (the miles actually driven) */
function add(o){
  o = o || {};
  var me = myEmail(); if (!me) return Promise.reject(new Error('Sign in first.'));
  var date = s(o.date).slice(0, 10) || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.reject(new Error('Pick the date.'));
  if (date > today()) return Promise.reject(new Error('That date has not happened yet.'));
  var odoS = num(o.odoStart), odoE = num(o.odoEnd), typed = num(o.miles), rt = !!o.roundTrip, miles;
  if (s(o.odoStart) !== '' && s(o.odoEnd) !== '') { if (!(odoE > odoS)) return Promise.reject(new Error('The end odometer must be more than the start.')); miles = odoE - odoS; }
  else miles = typed * (rt ? 2 : 1);
  miles = r1(miles);
  if (!(miles > 0)) return Promise.reject(new Error('Type the miles (or the start and end odometer).'));
  if (miles > 1500) return Promise.reject(new Error('Over 1,500 miles in one trip — check the number.'));
  if (!s(o.purpose) && !(s(o.from) && s(o.to))) return Promise.reject(new Error('Say where you went (from / to) or what the errand was.'));
  var rt0 = rate(), wk = weekOf(date), at = nowIso();
  var e = { id: uid('MI-'), emp: me, empName: myName(), date: date, from: s(o.from).slice(0, 120), to: s(o.to).slice(0, 120), purpose: s(o.purpose).slice(0, 200), pid: s(o.pid),
    roundTrip: rt, odoStart: s(o.odoStart) !== '' ? odoS : null, odoEnd: s(o.odoEnd) !== '' ? odoE : null, miles: miles, rate: rt0, amount: r2(miles * rt0), createdAt: at, updatedAt: at };
  return save(function(d){
    var w = d.weeks.filter(function(x){ return x && !x.deleted && x.emp === me && x.weekStart === wk.start && x.status === 'pending'; })[0];
    if (!w) {
      var n = d.weeks.filter(function(x){ return x && x.emp === me && x.weekStart === wk.start; }).length;
      w = { id: 'MW-' + me.replace(/[^a-z0-9]/g, '_') + '-' + wk.start + (n ? '-' + (n + 1) : ''), kind: 'mileage', emp: me, empName: myName(), weekStart: wk.start, weekEnd: wk.end, status: 'pending', createdAt: at, updatedAt: at };
      d.weeks.push(w);
    }
    e.weekId = w.id; d.entries.push(e); recompute(w);
    return e;
  });
}
function removeEntry(id){
  var me = myEmail();
  return save(function(d){
    var e = d.entries.filter(function(x){ return x && x.id === id; })[0]; if (!e || e.deleted) return false;
    var w = d.weeks.filter(function(x){ return x && x.id === e.weekId; })[0];
    if (e.emp !== me && !realAdmin()) throw new Error('Only the person who drove (or an admin) removes a trip.');
    if (w && w.status !== 'pending') throw new Error('That week is already ' + w.status + ' — it cannot change now.');
    e.deleted = true; e.updatedAt = nowIso(); if (w) recompute(w);
  });
}
function weekById(id){ return DATA.weeks.filter(function(x){ return x && x.id === id; })[0] || null; }
function approverWhy(w){
  if (!w) return 'That week is not there any more.';
  if (!(realAdmin() || isOffice())) return 'Mileage is approved by Wesley, Nick or the office.';
  if (low(w.emp) === myEmail()) return isOffice() ? 'Your own mileage is approved by an admin (Wesley or Nick).' : 'Someone else approves your own mileage.';
  if (w.status !== 'pending') return 'That week is already ' + w.status + '.';
  return '';
}
function decide(id, ok, why){
  var w0 = weekById(id), bad = approverWhy(w0);
  if (bad) return Promise.reject(new Error(bad));
  var by = myName(), email = myEmail(), role = realAdmin() ? 'admin' : 'office', at = nowIso();
  return save(function(d){
    var w = d.weeks.filter(function(x){ return x && x.id === id; })[0];
    var b2 = approverWhy(w); if (b2) throw new Error(b2);
    recompute(w);
    if (ok) { w.status = 'approved'; w.approvedBy = by; w.approvedEmail = email; w.approvedRole = role; w.approvedAt = at; w.approvedAmount = w.amount; w.approvedMiles = w.miles; }
    else { w.status = 'rejected'; w.rejectedBy = by; w.rejectedEmail = email; w.rejectedRole = role; w.rejectedAt = at; w.reason = s(why).slice(0, 300); }
    w.log = arr(w.log).concat([{ act: ok ? 'approved' : 'rejected', by: by, email: email, role: role, at: at }]);
    w.updatedAt = at;
    return w;
  }).then(function(w){ try { console.log('[GC] mileage ' + id + ' ' + (ok ? 'approved' : 'not approved') + ' by ' + by + ' (' + role + ')'); } catch (e) {} try { if (W.__GC_REFRESH_UI__) later(W.__GC_REFRESH_UI__, 150); } catch (e) {} return w; });
}
function setRate(r){
  if (!realAdmin()) return Promise.reject(new Error('Only Wesley or Nick (admins) change the mileage rate.'));
  r = Math.round(num(r) * 1000) / 1000;
  if (!(r > 0 && r < 5)) return Promise.reject(new Error('Type a rate per mile, like 0.70.'));
  var at = nowIso(), by = myName();
  return cloudRead(SKEY).then(function(cur){
    var old = (cur.ok && cur.value) || SET || {};
    var v = { rate: r, updatedBy: by, updatedAt: at, log: arr(old.log).concat([{ from: num(old.rate) || DEFAULT_RATE, to: r, by: by, at: at }]).slice(-50) };
    return cloudWrite(SKEY, v).then(function(){ SET = v; lsSet(LSS, JSON.stringify(v)); repaint(); return v; });
  });
}

/* ── what an approver sees in ✅ Approvals (one row a week, never their own) ── */
function waitingForMe(){
  if (!(realAdmin() || isOffice())) return [];
  var me = myEmail();
  return liveWeeks().filter(function(w){ return w.status === 'pending' && low(w.emp) !== me && num(w.trips) > 0; });
}
function apprItems(){
  return waitingForMe().map(function(w){
    return { id: 'mileage:' + w.id, kind: 'mileage', title: '🚗 Mileage reimbursement — ' + whoName(w) + ', week of ' + nice(w.weekStart) + ': ' + r1(w.miles) + ' mi = ' + money(w.amount),
      sub: w.trips + ' trip' + (w.trips === 1 ? '' : 's') + ' · not taxed · goes on their next paycheck', at: s(w.updatedAt || w.createdAt), amount: num(w.amount),
      act: { l: 'Approve ' + money(w.amount), f: function(){ return decide(w.id, true).then(function(){ toast('✅ Mileage approved — ' + money(w.amount) + ' goes on the next paycheck.'); return true; }, function(e){ toast('⚠ ' + (e && e.message || e), true); return false; }); } } };
  });
}
function hookSet(){
  var prev = W._gcHot1Approvals; if (prev && prev.__gcMileage) return;
  var w = function(){ var base = []; try { base = typeof prev === 'function' ? arr(prev.apply(this, arguments)) : []; } catch (e) {} try { apprItems().forEach(function(x){ base.push(x); }); } catch (e) { warn(e); } return base; };
  try { if (prev) Object.keys(prev).forEach(function(k){ w[k] = prev[k]; }); } catch (e) {}
  w.__gcMileage = true; W._gcHot1Approvals = w;
}

/* ── payroll: approved, unpaid weeks → a non-taxable "Mileage reimbursement" on the person's next run ── */
function emailsOfProfile(p){
  var out = []; if (!p) return out;
  if (s(p.email)) out.push(low(p.email));
  users().forEach(function(u){ if (u && ((p.userId && s(u.id) === s(p.userId)) || (p.name && low(u.name) === low(p.name))) && s(u.email)) out.push(low(u.email)); });
  return out;
}
function forPay(prof, to){
  var em = emailsOfProfile(prof), cut = s(to).slice(0, 10) || '9999-12-31', ids = [], amt = 0, mi = 0;
  if (!em.length) return { amount: 0, miles: 0, ids: [] };
  liveWeeks().forEach(function(w){
    if (w.status !== 'approved' || w.paidRunId || em.indexOf(low(w.emp)) < 0 || s(w.weekStart) > cut) return;
    ids.push(w.id); amt += num(w.approvedAmount != null ? w.approvedAmount : w.amount); mi += num(w.approvedMiles != null ? w.approvedMiles : w.miles);
  });
  return { amount: r2(amt), miles: r1(mi), ids: ids };
}
function wrapPay(){
  var P = W.__GC_PAY; if (!P || typeof P.computeLine !== 'function' || P.computeLine.__gcMileage) return;
  var o = P.computeLine;
  var w = function(prof, from, to, set, ytd, manual, extras){
    var self = this, args = arguments, mi = { amount: 0, ids: [] };
    try { mi = forPay(prof, to); } catch (e) { warn(e); }
    if (!(mi.amount > 0)) return o.apply(self, args);
    var ex = Object.assign({}, extras || {}); ex.reimbursement = r2(num(ex.reimbursement) + mi.amount);
    return Promise.resolve(o.call(self, prof, from, to, set, ytd, manual, ex)).then(function(L){
      if (L && typeof L === 'object') {
        L.mileage = mi.amount; L.mileageMiles = mi.miles; L.mileageWeeks = mi.ids.slice();
        try { L.trace = arr(L.trace).concat([{ label: 'Mileage reimbursement (not taxed)', detail: mi.miles + ' mi · ' + mi.ids.length + ' approved week' + (mi.ids.length === 1 ? '' : 's') + ' (in the reimbursement above)', amt: mi.amount }]); } catch (e) {}
      }
      return L;
    });
  };
  try { Object.keys(o).forEach(function(k){ w[k] = o[k]; }); } catch (e) {}
  w.__gcMileage = true; P.computeLine = w;
}
/* an approved payroll run with mileage on it marks those weeks paid (on an approver's computer) */
var paidBusy = false, paidAt = 0;
function markPaid(){
  if (paidBusy || Date.now() - paidAt < 20000 || !(realAdmin() || isOffice())) return;
  var open = liveWeeks().some(function(w){ return w.status === 'approved' && !w.paidRunId; }); if (!open) return;
  paidAt = Date.now();
  var runs = (W._crm && W._crm.payrollRuns) || W.__GC_RUNS_CACHE__;
  Promise.resolve(Array.isArray(runs) ? runs : (typeof W.idbGet === 'function' ? W.idbGet('payrollRuns') : [])).then(function(rl){
    var hit = {};
    arr(rl).forEach(function(r){ if (!r || low(r.status) !== 'approved') return; arr(r.lines).forEach(function(L){ if (L && low(L.status) !== 'denied') arr(L.mileageWeeks).forEach(function(id){ hit[id] = { run: s(r.id), payDate: s(r.payDate), checkNo: s(L.checkNo) }; }); }); });
    var ids = Object.keys(hit).filter(function(id){ var w = weekById(id); return w && w.status === 'approved' && !w.paidRunId; });
    if (!ids.length) return;
    paidBusy = true;
    return save(function(d){ ids.forEach(function(id){ var w = d.weeks.filter(function(x){ return x && x.id === id; })[0]; if (w && !w.paidRunId) { w.paidRunId = hit[id].run; w.paidPayDate = hit[id].payDate; w.paidCheckNo = hit[id].checkNo; w.paidAt = nowIso(); w.updatedAt = nowIso(); } }); });
  }).then(function(){ paidBusy = false; }, function(e){ paidBusy = false; warn(e); });
}

/* ── the screen ── */
var UI = { open: false, err: '', msg: '' };
function stLabel(w){
  if (w.status === 'approved') return w.paidRunId ? '💵 Paid on the ' + (w.paidPayDate ? nice(w.paidPayDate) + ' ' : '') + 'paycheck' + (w.paidCheckNo ? ' (check ' + esc(w.paidCheckNo) + ')' : '') : '✅ Approved by ' + esc(w.approvedBy) + (w.approvedRole === 'office' ? ' (office)' : '') + ' ' + esc(when(w.approvedAt)) + ' — on your next paycheck';
  if (w.status === 'rejected') return '✖ Not approved by ' + esc(w.rejectedBy) + (w.reason ? ' — “' + esc(w.reason) + '”' : '');
  return '⏳ Waiting on ' + (isOffice() && low(w.emp) === myEmail() ? 'Wesley or Nick' : 'Wesley, Nick or the office');
}
function weekCard(w, mine){
  var es = entriesOf(w.id), t = totals(w.id), amt = w.status === 'approved' ? num(w.approvedAmount) : t.amount, mi = w.status === 'approved' ? num(w.approvedMiles) : t.miles;
  var h = '<div class="gcmi-wk" data-wk="' + esc(w.id) + '"><div class="gcmi-wh"><b>Week of ' + esc(nice(w.weekStart)) + ' – ' + esc(nice(w.weekEnd)) + '</b>' + (mine ? '' : ' · ' + esc(whoName(w)))
    + '<span class="gcmi-tot">' + r1(mi) + ' mi · ' + money(amt) + '</span></div><div class="gcmi-st">' + stLabel(w) + '</div>';
  h += es.map(function(e){
    var where = [e.from && e.to ? esc(e.from) + ' → ' + esc(e.to) : esc(e.from || e.to), e.purpose ? esc(e.purpose) : ''].filter(Boolean).join(' · ');
    return '<div class="gcmi-tr"><span class="gcmi-d">' + esc(nice(e.date)) + '</span><span class="gcmi-w">' + where + (e.pid ? '<span class="gcmi-j">🏗 ' + esc(jobLabel(e.pid) || e.pid) + '</span>' : '') + '</span>'
      + '<span class="gcmi-m">' + r1(e.miles) + ' mi' + (e.roundTrip ? ' (round trip)' : '') + (e.odoStart != null ? ' (odometer ' + esc(e.odoStart) + '–' + esc(e.odoEnd) + ')' : '') + ' × ' + money(e.rate) + ' = <b>' + money(e.amount) + '</b></span>'
      + (mine && w.status === 'pending' ? '<button type="button" class="gcmi-x" data-mi-del="' + esc(e.id) + '" title="Remove this trip">✕</button>' : '') + '</div>';
  }).join('');
  if (!mine && w.status === 'pending' && !approverWhy(w)) h += '<div class="gcmi-acts"><button type="button" class="gcmi-b g" data-mi-ok="' + esc(w.id) + '">✅ Approve ' + money(t.amount) + '</button><button type="button" class="gcmi-b r" data-mi-no="' + esc(w.id) + '">✖ Don\'t approve</button></div>';
  return h + '</div>';
}
function render(){
  var ov = D.getElementById('gcmi-ov'); if (!ov) return;
  var me = myEmail(), adm = realAdmin(), wks = liveWeeks().sort(function(a, b){ return s(a.weekStart) < s(b.weekStart) ? 1 : -1; });
  var mineW = wks.filter(function(w){ return low(w.emp) === me; }), others = waitingForMe();
  var thisWk = weekOf(today()), cur = mineW.filter(function(w){ return w.weekStart === thisWk.start; }), curMi = 0, curAmt = 0;
  cur.forEach(function(w){ var t = totals(w.id); curMi += t.miles; curAmt += t.amount; });
  var opts = '<option value="">— no job (office errand) —</option>' + projects().slice(0, 400).map(function(p){ return '<option value="' + esc(p.id) + '">' + esc(jobLabel(p.id).slice(0, 80)) + '</option>'; }).join('');
  var f = UI.f || {};
  var h = '<div class="gcmi-card"><div class="gcmi-top"><h2>🚗 My mileage</h2><button type="button" class="gcmi-close" data-mi-close>✕</button></div>'
    + '<div class="gcmi-sub">Miles you drive your own car for company errands — paid back on your paycheck (not taxed) after Wesley, Nick or the office approves the week. Rate <b>' + money(rate()) + ' / mile</b>'
    + (adm ? ' <button type="button" class="gcmi-lnk" data-mi-rate>change</button>' : '') + (SET && SET.updatedBy ? '<span class="gcmi-mut"> · set by ' + esc(SET.updatedBy) + ' ' + esc(when(SET.updatedAt)) + '</span>' : '') + '</div>'
    + '<div class="gcmi-now">This week: <b>' + r1(curMi) + ' mi · ' + money(curAmt) + '</b></div>'
    + '<div class="gcmi-form"><div class="gcmi-row"><label>Date<input type="date" id="gcmi-date" value="' + esc(f.date || today()) + '" max="' + today() + '"></label>'
    + '<label class="gcmi-g">Job (optional)<select id="gcmi-pid">' + opts + '</select></label></div>'
    + '<div class="gcmi-row"><label class="gcmi-g">From<input type="text" id="gcmi-from" placeholder="Office" value="' + esc(f.from || '') + '"></label><label class="gcmi-g">To<input type="text" id="gcmi-to" placeholder="Supply house / bank / job" value="' + esc(f.to || '') + '"></label></div>'
    + '<div class="gcmi-row"><label class="gcmi-g">Purpose<input type="text" id="gcmi-purpose" placeholder="Pick up permits, bank deposit…" value="' + esc(f.purpose || '') + '"></label></div>'
    + '<div class="gcmi-row"><label>Miles<input type="number" inputmode="decimal" min="0" step="0.1" id="gcmi-miles" value="' + esc(f.miles || '') + '"></label><label class="gcmi-ck"><input type="checkbox" id="gcmi-rt"' + (f.rt ? ' checked' : '') + '> Round trip (× 2)</label></div>'
    + '<div class="gcmi-row gcmi-or"><span>or odometer</span><label>Start<input type="number" inputmode="decimal" min="0" id="gcmi-os" value="' + esc(f.os || '') + '"></label><label>End<input type="number" inputmode="decimal" min="0" id="gcmi-oe" value="' + esc(f.oe || '') + '"></label></div>'
    + '<button type="button" class="gcmi-b g gcmi-save" data-mi-add>＋ Log trip</button>'
    + (UI.err ? '<div class="gcmi-err">' + esc(UI.err) + '</div>' : '') + (UI.msg ? '<div class="gcmi-msg">' + esc(UI.msg) + '</div>' : '') + '</div>';
  if (others.length) h += '<h3>Waiting for your approval (' + others.length + ')</h3>' + others.map(function(w){ return weekCard(w, false); }).join('');
  h += '<h3>My weeks</h3>' + (mineW.length ? mineW.slice(0, 26).map(function(w){ return weekCard(w, true); }).join('') : '<div class="gcmi-mut">No trips logged yet.</div>');
  if (adm) { var rest = wks.filter(function(w){ return low(w.emp) !== me && w.status !== 'pending'; }).slice(0, 20); if (rest.length) h += '<h3>Everyone — recent</h3>' + rest.map(function(w){ return weekCard(w, false); }).join(''); }
  h += '</div>';
  var keep = UI.f; ov.innerHTML = h; UI.f = keep;
  var sel = ov.querySelector('#gcmi-pid'); if (sel && f.pid) sel.value = f.pid;
}
function readForm(){ var g = function(id){ var e = D.getElementById(id); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; }; return { date: g('gcmi-date'), pid: g('gcmi-pid'), from: g('gcmi-from'), to: g('gcmi-to'), purpose: g('gcmi-purpose'), miles: g('gcmi-miles'), rt: g('gcmi-rt'), os: g('gcmi-os'), oe: g('gcmi-oe') }; }
function open(){
  css();
  var ov = D.getElementById('gcmi-ov');
  if (!ov) {
    ov = D.createElement('div'); ov.id = 'gcmi-ov'; ov.setAttribute('data-gc-keep', '1'); D.body.appendChild(ov);
    ov.addEventListener('click', function(ev){
      var t = ev.target; if (t === ov) { close(); return; }
      var b = t.closest && t.closest('button'); if (!b) return;
      if (b.hasAttribute('data-mi-close')) { close(); return; }
      if (b.hasAttribute('data-mi-add')) {
        var f = readForm(); UI.f = f; UI.err = ''; UI.msg = ''; b.disabled = true;
        add({ date: f.date, pid: f.pid, from: f.from, to: f.to, purpose: f.purpose, miles: f.miles, roundTrip: f.rt, odoStart: f.os, odoEnd: f.oe }).then(function(e){
          UI.f = { date: f.date }; UI.msg = '✓ Logged ' + r1(e.miles) + ' mi = ' + money(e.amount) + '.'; render();
        }, function(e){ UI.err = s(e && e.message || e); render(); });
        return;
      }
      var del = b.getAttribute('data-mi-del'); if (del) { if (!W.confirm('Remove this trip?')) return; removeEntry(del).then(render, function(e){ UI.err = s(e && e.message || e); render(); }); return; }
      var okId = b.getAttribute('data-mi-ok'); if (okId) { b.disabled = true; decide(okId, true).then(function(){ UI.msg = '✅ Approved.'; render(); }, function(e){ UI.err = s(e && e.message || e); render(); }); return; }
      var noId = b.getAttribute('data-mi-no'); if (noId) { var why = W.prompt('Why not? (they see this)', ''); if (why === null) return; decide(noId, false, why).then(function(){ UI.msg = 'Not approved.'; render(); }, function(e){ UI.err = s(e && e.message || e); render(); }); return; }
      if (b.hasAttribute('data-mi-rate')) { var r = W.prompt('Mileage rate per mile (every computer, new trips from now on):', String(rate())); if (r === null) return; setRate(r).then(function(v){ UI.msg = 'Rate is now ' + money(v.rate) + ' / mile.'; render(); }, function(e){ UI.err = s(e && e.message || e); render(); }); }
    });
  }
  UI.open = true; UI.err = ''; UI.msg = ''; render(); load();
  return true;
}
function close(){ UI.open = false; var ov = D.getElementById('gcmi-ov'); if (ov) ov.remove(); }
function repaint(){ if (UI.open && D.getElementById('gcmi-ov')) { var a = D.activeElement; if (a && a.closest && a.closest('#gcmi-ov') && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return; UI.f = D.getElementById('gcmi-date') ? readForm() : UI.f; render(); } }
function css(){
  if (D.getElementById('gcmi-css')) return;
  var st = D.createElement('style'); st.id = 'gcmi-css';
  st.textContent = '#gcmi-ov{position:fixed;inset:0;z-index:100160;background:rgba(6,12,20,.6);display:flex;justify-content:center;align-items:flex-start;overflow-y:auto;padding:calc(12px + env(safe-area-inset-top,0px)) 12px 24px;font-family:Inter,-apple-system,Arial,sans-serif}'
    + '.gcmi-card{background:#fff;color:#0f172a;border-radius:14px;max-width:720px;width:100%;box-sizing:border-box;padding:16px}'
    + '.gcmi-top{display:flex;align-items:center;justify-content:space-between}.gcmi-top h2{margin:0;font-size:20px;color:#0f2440}.gcmi-card h3{font-size:15px;margin:16px 0 8px;color:#0f2440}'
    + '.gcmi-close{border:none;background:#334155;color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer}.gcmi-sub{color:#475569;font-size:13px;margin:6px 0}.gcmi-mut{color:#64748b;font-size:12px}'
    + '.gcmi-now{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:10px;padding:8px 12px;font-size:14px;margin:8px 0}'
    + '.gcmi-form{border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc}.gcmi-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;align-items:flex-end}'
    + '.gcmi-row label{display:flex;flex-direction:column;font-size:12px;font-weight:700;color:#475569;gap:3px;min-width:0}.gcmi-g{flex:1 1 180px}'
    + '.gcmi-row input,.gcmi-row select{padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;background:#fff;color:#0f172a;max-width:100%;box-sizing:border-box}'
    + '.gcmi-row input[type=number]{width:120px}.gcmi-ck{flex-direction:row!important;align-items:center;font-size:14px!important;padding-bottom:8px}.gcmi-or>span{font-size:12px;color:#64748b;padding-bottom:10px}'
    + '.gcmi-b{border:none;border-radius:10px;padding:10px 14px;font-weight:800;font-size:14px;cursor:pointer;min-height:42px}.gcmi-b.g{background:#16a34a;color:#fff}.gcmi-b.r{background:#fff;color:#dc2626;border:2px solid #dc2626}'
    + '.gcmi-save{width:100%}.gcmi-err{color:#b91c1c;font-weight:700;font-size:13px;margin-top:8px}.gcmi-msg{color:#047857;font-weight:700;font-size:13px;margin-top:8px}'
    + '.gcmi-lnk{border:none;background:none;color:#2563eb;font-weight:700;cursor:pointer;padding:0 2px;font-size:13px}'
    + '.gcmi-wk{border:1px solid #e2e8f0;border-left:5px solid #16a34a;border-radius:12px;padding:10px;margin-bottom:10px}.gcmi-wh{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}.gcmi-tot{margin-left:auto;font-weight:800}'
    + '.gcmi-st{font-size:12.5px;color:#475569;margin:3px 0 6px}.gcmi-tr{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;border-top:1px solid #f1f5f9;padding:6px 0;font-size:13px}'
    + '.gcmi-d{font-weight:700;min-width:52px}.gcmi-w{flex:1 1 200px;min-width:0;overflow-wrap:anywhere}.gcmi-j{display:block;color:#1e3a8a;font-size:12px}.gcmi-m{color:#334155}'
    + '.gcmi-x{border:none;background:#fee2e2;color:#991b1b;border-radius:6px;cursor:pointer;padding:2px 8px}.gcmi-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}'
    + '.gcmi-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:100300;background:#065f46;color:#fff;padding:10px 16px;border-radius:10px;font:700 14px Inter,Arial,sans-serif;max-width:calc(100% - 32px)}.gcmi-toast.bad{background:#991b1b}'
    + '#gc-mileage-hub:hover{background:#f1f5f9}';
  D.head.appendChild(st);
}
/* the top 💎 menu: "🚗 My mileage" for everyone signed in */
function hubItem(){
  try {
    var all = D.querySelectorAll('.gc-hub-panel'), panel = null;
    for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) { panel = all[i]; break; }
    if (!panel || !myEmail()) return;
    if (panel.querySelector('#gc-mileage-hub')) return;
    css();
    var it = D.createElement('div'); it.id = 'gc-mileage-hub'; it.className = 'gc-hub-item'; it.setAttribute('role', 'button'); it.tabIndex = 0;
    it.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9';
    it.innerHTML = '<span style="font-size:18px">🚗</span><span>My mileage</span>';
    it.onclick = function(){ open(); };
    it.onkeydown = function(ev){ if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } };
    var after = panel.querySelector('#gc-vas-hub') || panel.querySelector('#gc-auth-hub-team');
    if (after && after.parentNode === panel) panel.insertBefore(it, after.nextSibling); else panel.appendChild(it);
  } catch (e) {}
}

W._gcMileage = { open: open, close: close, state: function(){ return { entries: DATA.entries.slice(), weeks: DATA.weeks.slice(), rate: rate(), settings: SET, loadedAt: loadedAt }; }, rate: rate, setRate: setRate, add: add, remove: removeEntry,
  approve: function(id){ return decide(id, true); }, reject: function(id, why){ return decide(id, false, why); }, weekOf: weekOf, forPay: forPay, load: load, items: apprItems, markPaid: function(){ paidAt = 0; markPaid(); } };

D.addEventListener('click', function(){ later(hubItem, 160); }, true);
function tick(){ if (D.hidden) return; hookSet(); wrapPay(); hubItem(); markPaid(); }
every(tick, 1500); later(tick, 600);
every(function(){ if (!D.hidden && myEmail() && (UI.open || realAdmin() || isOffice()) && Date.now() - loadedAt > 60000) load(); }, 15000);
later(function(){ if (myEmail()) load(); }, 4000);
try { console.log('[GC] Office approves everything except payroll; 🚗 My mileage (patch OFFICEAPPR) — _gcOA, _gcMileage'); } catch (e) {}
})();
