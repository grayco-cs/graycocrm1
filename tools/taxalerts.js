/* __GC_PATCH_TAXALERTS__ — 🧾 TAX DEADLINES: a tax calendar with alerts to the admins and the office.   (patch TAXALERTS)
   Owner 11/01: "make sure every month and quarterly we have a pay taxes alert to office and admin" … "payroll taxes, and
   personally Wesley and Nick pay a quarterly number in to taxes."
   • ⚙ Admin → 🧾 Tax deadlines: the calendar. Admins switch items on / off and edit them (name, how often and the due-day rule,
     who is reminded, notes, the pay / file link, the weekend-holiday shift, the "Confirm with CPA" mark); the office sees it
     read-only (also from the 🧾 Taxes card → Calendar, and crm…/#taxes). The rules are window._gcTaxCal (the same file the
     server uses: netlify/functions/_lib/taxcal.js, inlined above this script).
   • Company items: gc_kv gc_tax_calendar (+ gc_tax_paid). Payroll taxes are ON by default (941 deposits, Form 941, TN SUTA,
     FUTA, Form 940, W-2 / W-3, 1099-NEC); TN sales & use, F&E and business tax are OFF until the owner / CPA turns them on.
   • The owners' quarterly estimated tax (Wesley, Nick): gc_admin_kv gc_tax_owner — only an admin computer asks for it, and
     the database answers nobody else. The office never sees these items or their amounts. Never posted as a company expense.
   • Alerts: the To-Do (this page computes them: 7 days before, the due day, every day while overdue — each with ✓ Paid) and,
     from the server (auto-wins, 8 AM Central), one staff e-mail + push (+ a text for "Approvals" text alerts, never at night).
   • ✓ Paid: date, amount (the Payroll estimate filled in when the Payroll runs have it), confirmation #, who, and an optional
     receipt into the CRM's file storage. A payroll item can also be recorded in Payroll → Withholding & taxes (lowers the
     balance owed there, booked as "Payroll Taxes Paid"); an owner's estimated tax never is.
   • 🧾 Taxes card on the Admin and Office homes (the Desk home, the Office page, the admin dashboard): anything overdue + the
     next 3 due dates.
   API: window._gcTax = { open(), state(), load(), alerts(), upcoming(), paid(kind, key, rec), setClock(ms) } */
(function(){
'use strict';
if (window.__GC_PATCH_TAXALERTS__) return; window.__GC_PATCH_TAXALERTS__ = true;
var W = window, D = document, T = W._gcTaxCal; if (!T) return;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
var K_CAL = 'gc_tax_calendar', K_PAID = 'gc_tax_paid', K_OWN = 'gc_tax_owner', K_PAYTAX = 'payrollTaxPayments';
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(v){ var n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function warn(e){ try { console.warn('[GC TAXALERTS]', e && e.message || e); } catch (x) {} }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }

/* ── the clock (tests set window.__gcTaxClock = ms) and today in Memphis ── */
function nowMs(){ var c = W.__gcTaxClock; return typeof c === 'number' ? c : typeof c === 'function' ? c() : Date.now(); }
function today(){
  try { var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowMs())).forEach(function(x){ p[x.type] = x.value; }); return p.year + '-' + p.month + '-' + p.day; }
  catch (e) { return new Date(nowMs() - 6 * 3600e3).toISOString().slice(0, 10); }
}

/* ── who ── */
function crm(){ return W._crm || {}; }
function users(){ return arr(crm().users).filter(function(u){ return u.active !== false && !u.tombstoned && !u._deleted && /@/.test(s(u.email)); }); }
function meUser(){ try { return (W._gcMeUser && W._gcMeUser()) || {}; } catch (e) { return {}; } }
function myEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()) || low(meUser().email); } catch (e) { return ''; } }
function myName(){ return s(meUser().name) || lsGet('grayco_user') || myEmail(); }
function realAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function vas(){ try { return W._gcVAS && W._gcVAS.active() ? s(W._gcVAS.role()) : ''; } catch (e) { return ''; } }
function officeMe(){
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  var u = meUser(); return myEmail() === 'office@grayco-cs.com' || /office/i.test(s(u.role) + ' ' + s(u.title));
}
/* admins (not viewing as someone else) see everything; the office — or an admin's 👁 View as Office — sees the company items */
function seesOwner(){ return realAdmin() && !vas(); }
function canEdit(){ return realAdmin() && !vas(); }
function canSee(){ var v = vas(); if (v) return realAdmin() && /office|admin/i.test(v); return realAdmin() || officeMe(); }
function people(){
  var U = users();
  return { admins: U.filter(function(u){ return s(u.role) === 'Admin' || low(u.payType) === 'owner'; }).map(function(u){ return low(u.email); }),
           office: U.filter(function(u){ return /office/i.test(s(u.role)) && s(u.role) !== 'Admin'; }).map(function(u){ return low(u.email); }) };
}
function nameOf(email){ var u = users().filter(function(x){ return low(x.email) === low(email); })[0]; return u ? s(u.name) : email; }

/* ── the data ── */
var S = { cal: T.merge(null, 'company'), paid: [], own: null, runs: null, at: 0, ver: 0, busy: null, err: '' };
function cloudGet(k){ return typeof W._gcCloudGet === 'function' ? Promise.resolve(W._gcCloudGet(k)).catch(function(){ return null; }) : Promise.resolve(null); }
function cloudPut(k, v){ try { return Promise.resolve(W._supaUpsert(k, v)).then(function(){ return true; }, function(){ return false; }); } catch (e) { return Promise.resolve(false); } }
function adminGet(){
  if (!seesOwner()) return Promise.resolve(null);
  return W.fetch(SB + '/rest/v1/gc_admin_kv?select=value&key=eq.' + K_OWN, { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; })
    .then(function(rows){ if (!Array.isArray(rows)) return null; return rows[0] ? obj(rows[0].value) : {}; }, function(){ return null; });
}
function adminPut(v){
  if (!seesOwner()) return Promise.resolve(false);
  return W.fetch(SB + '/rest/v1/gc_admin_kv?on_conflict=key', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify([{ key: K_OWN, value: v, updated_at: new Date().toISOString() }]) }).then(function(r){ return !!r.ok; }, function(){ return false; });
}
/* the Payroll runs (for the estimates): this computer's copy (Payroll reads only IndexedDB), else the cloud's — a computer that
   never opened Payroll has none yet. Payroll-only data: the database answers the admins and the office (payroll) only. */
function payrollRuns(){
  var local = Promise.resolve(null);
  try { if (W.__GC_PAY && typeof W.__GC_PAY.runs === 'function') local = Promise.resolve(W.__GC_PAY.runs()).then(function(l){ return Array.isArray(l) ? l : null; }, function(){ return null; }); } catch (e) {}
  return local.then(function(l){
    if (l && l.length) return l;
    return cloudGet('payrollRuns').then(function(c){ if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } } return Array.isArray(c) ? c : l; });
  });
}
function load(){
  if (S.busy) return S.busy;
  if (!canSee()) return Promise.resolve(false);
  S.busy = Promise.all([cloudGet(K_CAL), cloudGet(K_PAID), adminGet(), payrollRuns()]).then(function(r){
    var cal = T.merge(r[0], 'company'); cal.raw = obj(r[0]); S.cal = cal; S.paid = Array.isArray(r[1]) ? r[1] : [];
    if (r[2]) { var o = T.merge(r[2], 'owner'); o.raw = r[2]; S.own = o; } else if (!seesOwner()) S.own = null;
    if (r[3]) S.runs = r[3];
    /* a list's start day (no alerts for dates before it) — the server's first run stamps it too */
    if (canEdit() && !cal.startedAt) { cal.startedAt = today(); cloudPut(K_CAL, Object.assign({}, cal.raw, { v: 1, startedAt: cal.startedAt })); }
    if (canEdit() && S.own && !S.own.startedAt && r[2]) { S.own.startedAt = today(); adminPut(Object.assign({}, r[2], { v: 1, startedAt: S.own.startedAt })); }
    S.at = Date.now(); S.ver++; S.busy = null; S.err = ''; repaint(); return true;
  }, function(e){ S.busy = null; S.err = s(e && e.message || e); return false; });
  return S.busy;
}
function lists(){
  var out = [];
  if (canSee()) out.push({ kind: 'company', cal: S.cal, paid: S.paid });
  if (seesOwner() && S.own) out.push({ kind: 'owner', cal: S.own, paid: S.own.paid });
  return out;
}
function find(kind, key){
  var L = kind === 'owner' ? S.own : S.cal; if (!L) return null;
  var id = s(key).split('|')[0], nominal = s(key).split('|')[1], item = arr(L.items).filter(function(x){ return x.id === id; })[0];
  if (!item) return null;
  var occ = T.occurrences(item, T.addDays(nominal, -5), T.addDays(nominal, 20)).filter(function(o){ return o.key === key; })[0];
  return occ ? { item: item, occ: occ, kind: kind } : null;
}
function est(item, occ){ return T.estimate(item, occ, S.runs || []); }

/* ── alerts on the To-Do ── */
var TD = { sig: '', v: [] };
function alerts(){
  var t = today(), out = [];
  lists().forEach(function(L){ T.alertsFor(L.cal, t, L.paid).forEach(function(a){ a.kind = L.kind; out.push(a); }); });
  return out;
}
function todoItems(){
  if (!canSee()) return [];
  var sig = today() + '|' + S.ver + '|' + canSee() + seesOwner(); if (sig === TD.sig) return TD.v;
  var P = people(), out = [];
  alerts().forEach(function(a){
    var e = est(a.item, a.occ), it = a.item, who, vis;
    if (a.kind === 'owner') { who = T.recipients(it, P); vis = 'who'; }
    else if (it.who === 'admins') { who = P.admins; vis = 'who'; } else if (it.who === 'office') { who = P.office; vis = 'who'; } else { who = []; vis = 'company'; }
    var key = 'tax:' + a.occ.key + ':' + a.stage + (a.stage === 'over' ? ':' + today() : ''), k = a.kind, ok = a.occ.key;
    out.push({ key: key, thing: 'tax|' + a.occ.key, title: a.title, cat: 'money', due: a.occ.due, prio: a.stage === 'soon' ? 'med' : 'high', who: who, vis: vis,
      sub: [it.name, e != null ? (a.kind === 'owner' ? 'amount ' : 'est. ') + T.money(e) : (it.pay ? 'amount: enter it when paid' : ''), it.cpa ? 'Confirm with CPA' : ''].filter(Boolean).join(' · '),
      act: { l: '✓ Paid', f: function(){ openPaid(k, ok); } } });
  });
  TD = { sig: sig, v: out }; return out;
}
W._gcTodoExt = Array.isArray(W._gcTodoExt) ? W._gcTodoExt : []; W._gcTodoExt.push(function(){ try { return todoItems(); } catch (e) { warn(e); return []; } });

/* ── the home card ── */
function rowsHtml(full){
  var t = today(), over = [], next = [];
  lists().forEach(function(L){ var u = T.upcoming(L.cal, t, L.paid, 3); u.overdue.forEach(function(r){ r.kind = L.kind; over.push(r); }); u.next.forEach(function(r){ r.kind = L.kind; next.push(r); }); });
  var by = function(a, b){ return a.occ.due < b.occ.due ? -1 : a.occ.due > b.occ.due ? 1 : 0; };
  over.sort(by); next.sort(by); next = next.slice(0, 3);
  function row(r){
    var e = est(r.item, r.occ), d = r.days;
    var when = d < 0 ? '<span class="gctx-red">OVERDUE ' + (-d) + ' day' + (d === -1 ? '' : 's') + '</span>' : d === 0 ? '<span class="gctx-red">due today</span>' : 'in ' + d + ' day' + (d === 1 ? '' : 's');
    return '<div class="gctx-row' + (d < 0 ? ' over' : '') + '" data-tax-row="' + esc(r.occ.key) + '"><div class="tx"><b>' + esc(r.item.short || r.item.name) + ' ' + esc(r.occ.label) + '</b>'
      + '<small>' + esc(T.longDate(r.occ.due)) + ' · ' + when + (e != null ? ' · ' + (r.kind === 'owner' ? '' : 'est. ') + esc(T.money(e)) : '') + (r.kind === 'owner' ? ' · admins only' : '') + '</small></div>'
      + '<button type="button" class="gctx-btn ok" data-tax-a="paid" data-kind="' + r.kind + '" data-key="' + esc(r.occ.key) + '">✓ Paid</button></div>';
  }
  var h = over.map(row).join('') + next.map(row).join('');
  return { html: h || '<div class="gctx-empty">✓ Nothing due — every switched-on tax is paid.</div>', over: over.length, next: next.length };
}
function cardBody(){ css(); var r = rowsHtml(); return '<div class="gctx-card-in" data-tax-card="1" data-over="' + r.over + '">' + r.html + '<div class="gctx-foot">Reminders, not tax advice — confirm with the CPA.</div></div>'; }
/* the Desk home (patch ROLEAPPS calls window._gcRaCards for its cards) */
W._gcRaCards = Array.isArray(W._gcRaCards) ? W._gcRaCards : [];
W._gcRaCards.push(function(a, card){
  if ((a !== 'admin' && a !== 'office') || !canSee() || typeof card !== 'function') return '';
  return card('taxes', '🧾 Taxes', cardBody(), '<button type="button" class="gc-ra-link" data-tax-a="open">Calendar ›</button>');
});
/* the Office page (#gc-om-mount) and the admin's company dashboard */
function cardEl(id){
  var el = D.getElementById(id);
  if (!el) { el = D.createElement('section'); el.id = id; el.className = 'gctx-card'; el.setAttribute('data-gc-keep', '1'); }
  return el;
}
function view(){ return lsGet('grayco_view') || ''; }
function paintHomes(){
  var ok = canSee() && !D.documentElement.classList.contains('_fieldmode');
  var om = D.getElementById('gc-om-mount'), a = D.getElementById('gc-tax-om');
  if (ok && om && om.children.length) {
    a = cardEl('gc-tax-om'); var tb = D.getElementById('_gcOmToolbar'), ref = tb && tb.parentNode === om ? tb.nextSibling : om.firstChild;
    if (a.parentNode !== om || (ref !== a && a.previousSibling !== tb)) om.insertBefore(a, ref);
    fill(a);
  } else if (a) a.remove();
  var main = D.querySelector('main'), b = D.getElementById('gc-tax-dash');
  var dash = ok && main && view() === 'dashboard' && !D.getElementById('gc-ofhome') && realAdmin() && !vas();
  if (dash) { b = cardEl('gc-tax-dash'); if (b.parentNode !== main || main.firstChild !== b) main.insertBefore(b, main.firstChild); fill(b); }
  else if (b) b.remove();
}
function fill(el){
  var h = '<div class="gctx-hd"><b>🧾 Taxes</b><button type="button" class="gctx-link" data-tax-a="open">Calendar ›</button></div>' + cardBody();
  if (el.__h !== h) { el.innerHTML = h; el.__h = h; }
}

/* ── ✓ Paid ── */
function modal(id, title, inner){
  css(); var old = D.getElementById(id); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = id; ov.className = 'gctx-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1');
  ov.innerHTML = '<div class="gctx-box" role="dialog" aria-label="' + esc(title) + '"><div class="gctx-bh"><b>' + esc(title) + '</b><button type="button" class="gctx-x" data-tax-close="1" aria-label="Close">✕</button></div><div class="gctx-bb">' + inner + '</div></div>';
  ov.addEventListener('click', function(e){ if (e.target === ov || (e.target.closest && e.target.closest('[data-tax-close]'))) ov.remove(); });
  D.body.appendChild(ov); return ov;
}
function toast(t, bad){
  css(); var el = D.getElementById('gctx-toast'); if (!el) { el = D.createElement('div'); el.id = 'gctx-toast'; el.setAttribute('data-gc-keep', '1'); D.body.appendChild(el); }
  el.textContent = t; el.style.background = bad ? '#991b1b' : '#14532d'; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3800);
}
function openPaid(kind, key){
  if (kind === 'owner' ? !seesOwner() : !canSee()) { toast('Only the admins and the office mark taxes paid.', true); return null; }
  var f = find(kind, key); if (!f) { toast('That due date is not on the tax calendar any more.', true); return null; }
  var e = est(f.item, f.occ), payroll = kind === 'company' && !!f.item.pay && !!(W.__GC_PAY && W.__GC_PAY.get);
  var ov = modal('gctx-paid', '✓ Paid — ' + (f.item.short || f.item.name) + ' ' + f.occ.label,
    '<div class="gctx-sub">' + esc(f.item.name) + ' · due ' + esc(T.longDate(f.occ.due)) + (f.item.link ? ' · <a href="' + esc(f.item.link) + '" target="_blank" rel="noopener">pay / file ›</a>' : '') + '</div>'
    + '<div class="gctx-grid">'
    + '<label>Date paid<input type="date" id="gctx-p-date" value="' + today() + '"></label>'
    + '<label>Amount' + (e != null ? ' <small>(' + (kind === 'owner' ? 'the quarterly number' : 'estimated from Payroll') + ')</small>' : ' <small>(enter amount)</small>') + '<input id="gctx-p-amt" inputmode="decimal" placeholder="0.00" value="' + (e != null ? e.toFixed(2) : '') + '"></label>'
    + '<label>Confirmation #<input id="gctx-p-conf" placeholder="EFTPS / TNTAP / bank confirmation"></label>'
    + '<label>Receipt <small>(optional — PDF or photo)</small><input type="file" id="gctx-p-file" accept="application/pdf,image/*"></label>'
    + '</div>'
    + '<label class="gctx-ck"><input type="checkbox" id="gctx-p-none"> No payment due this time (for example FUTA under $500) — just clear the reminder</label>'
    + (payroll ? '<label class="gctx-ck"><input type="checkbox" id="gctx-p-pay" checked> Also record it in Payroll → Withholding &amp; taxes (lowers the balance owed there)</label>' : '')
    + (kind === 'owner' ? '<div class="gctx-sub">The owner’s own tax — tracked here only, never posted as a company expense. Admins only.</div>' : '')
    + '<div class="gctx-act"><button type="button" class="gctx-btn ok" id="gctx-p-save">✓ Save — paid</button><button type="button" class="gctx-btn" data-tax-close="1">Cancel</button><span id="gctx-p-msg" class="gctx-sub"></span></div>');
  ov.querySelector('#gctx-p-save').onclick = function(){
    var btn = this, none = ov.querySelector('#gctx-p-none').checked, amt = num(ov.querySelector('#gctx-p-amt').value), msg = ov.querySelector('#gctx-p-msg');
    if (!none && !(amt > 0)) { msg.textContent = 'Enter the amount paid (or tick “No payment due this time”).'; return; }
    var file = ov.querySelector('#gctx-p-file').files[0], pay = ov.querySelector('#gctx-p-pay');
    btn.disabled = true; msg.textContent = 'Saving…';
    var rec = { key: f.occ.key, itemId: f.item.id, due: f.occ.due, nominal: f.occ.nominal, label: f.occ.label, name: f.item.short || f.item.name,
      paidOn: s(ov.querySelector('#gctx-p-date').value) || today(), amount: none ? 0 : Math.round(amt * 100) / 100, none: none, confirm: s(ov.querySelector('#gctx-p-conf').value).slice(0, 120),
      by: myName(), byEmail: myEmail(), at: new Date().toISOString() };
    var up = file && typeof W._gcStoreFile === 'function' ? Promise.resolve(W._gcStoreFile(file, { name: file.name })).then(function(m){ return m && m.ref ? { ref: m.ref, name: s(m.name || file.name), type: s(m.type), size: m.size || 0 } : null; }, function(){ return null; }) : Promise.resolve(null);
    up.then(function(rc){
      if (rc) rec.receipt = rc; else if (file) rec.receiptFailed = s(file.name);
      return markPaid(kind, rec, !!(pay && pay.checked) && !none ? f.item.pay : '');
    }).then(function(ok){
      if (!ok) { btn.disabled = false; msg.textContent = 'Could not save — check the connection and try again.'; return; }
      ov.remove(); toast('✓ ' + (f.item.short || f.item.name) + ' ' + f.occ.label + ' marked paid' + (rec.receipt ? ' (receipt kept)' : '') + '.');
    });
  };
  return ov;
}
/* save a paid record (company → gc_kv gc_tax_paid; owner → gc_admin_kv gc_tax_owner) */
function markPaid(kind, rec, payKind){
  rec.id = rec.id || 'TAXP' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (kind === 'owner') {
    if (!seesOwner()) return Promise.resolve(false);
    return adminGet().then(function(cur){
      if (cur == null) return false;
      var v = Object.assign({ v: 1 }, cur); v.paid = arr(v.paid).filter(function(p){ return p.key !== rec.key; }).concat([rec]).slice(-400);
      if (!v.startedAt) v.startedAt = (S.own && S.own.startedAt) || today();
      return adminPut(v).then(function(ok){ if (ok) { S.own = Object.assign(T.merge(v, 'owner'), { raw: v }); S.ver++; repaint(); } return ok; });
    });
  }
  if (!canSee()) return Promise.resolve(false);
  return cloudGet(K_PAID).then(function(cur){
    var l = (Array.isArray(cur) ? cur : S.paid).filter(function(p){ return p && p.key !== rec.key; }).concat([rec]).slice(-1000);
    return cloudPut(K_PAID, l).then(function(ok){
      if (!ok) return false;
      S.paid = l; S.ver++; repaint();
      if (payKind) try { recordPayroll(rec, payKind); } catch (e) { warn(e); }
      return true;
    });
  });
}
/* the same record Payroll → "+ Record a tax payment" makes (its balance owed goes down; booked as Payroll Taxes Paid) */
function recordPayroll(rec, kind){
  var P = W.__GC_PAY; if (!P || !P.get || !(rec.amount > 0)) return;
  Promise.resolve(P.get(K_PAYTAX)).then(function(l){
    l = Array.isArray(l) ? l : [];
    var x = { id: 'TXP' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: rec.paidOn, kind: kind, amount: rec.amount, confirm: rec.confirm,
      note: 'Tax calendar: ' + rec.name + ' ' + rec.label, by: rec.by, at: rec.at, taxKey: rec.key };
    if (l.some(function(y){ return y && y.taxKey === rec.key; })) return;
    l.push(x);
    return Promise.resolve(P.put(K_PAYTAX, l)).then(function(){
      var irs = kind === '941' || kind === 'futa';
      if (W._gcAddToRegister) return W._gcAddToRegister({ srcInvId: 'PAYROLLTAX_' + x.id, pid: '', type: 'expense', category: 'Payroll Taxes Paid', vendor: irs ? 'IRS' : 'State', payee: irs ? 'IRS' : 'State',
        desc: rec.name + ' ' + rec.label + (rec.confirm ? ' · ' + rec.confirm : ''), amt: rec.amount, amount: rec.amount, date: rec.paidOn, status: 'paid', by: rec.by });
    });
  }).catch(warn);
}
function undoPaid(kind, key){
  if (!canEdit()) return Promise.resolve(false);
  if (kind === 'owner') return adminGet().then(function(cur){ if (cur == null) return false; var v = Object.assign({}, cur); v.paid = arr(v.paid).filter(function(p){ return p.key !== key; }); return adminPut(v).then(function(ok){ if (ok) { S.own = Object.assign(T.merge(v, 'owner'), { raw: v }); S.ver++; repaint(); } return ok; }); });
  return cloudGet(K_PAID).then(function(cur){ var l = (Array.isArray(cur) ? cur : S.paid).filter(function(p){ return p && p.key !== key; }); return cloudPut(K_PAID, l).then(function(ok){ if (ok) { S.paid = l; S.ver++; repaint(); } return ok; }); });
}

/* ── the calendar (⚙ Admin → 🧾 Tax deadlines; read-only for the office) ── */
var UI = { edit: null, kind: null, host: null };
var FREQ = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
var WHO = { 'admins+office': 'Admins + office', admins: 'Admins only', office: 'Office only', own: 'The owner (admins only)' };
function rule(it){
  if (it.freq === 'monthly') return 'Monthly · by the ' + (it.day === 'last' ? 'last day' : ordinal(it.day)) + (it.prior !== false ? ' (for last month)' : '');
  return FREQ[it.freq] + ' · ' + arr0(it.dates).map(function(d){ var p = d.split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[0] - 1] + ' ' + (p[1] === 'last' ? 'last day' : +p[1]); }).join(', ');
}
function arr0(v){ return Array.isArray(v) ? v : []; }
function ordinal(n){ n = +n; var t = n % 100, u = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); }
function itemRow(it, kind, paid){
  var t = today(), nx = T.upcoming({ items: [Object.assign({}, it, { on: true })], startedAt: '' }, t, paid, 1), n = nx.next[0], e = n ? est(it, n.occ) : null, edit = canEdit();
  return '<tr data-tax-item="' + esc(it.id) + '" data-kind="' + kind + '" class="' + (it.on === false ? 'off' : '') + '">'
    + '<td>' + (edit ? '<label class="gctx-sw"><input type="checkbox" data-tax-a="toggle" data-kind="' + kind + '" data-id="' + esc(it.id) + '"' + (it.on !== false ? ' checked' : '') + '><span></span></label>' : (it.on !== false ? '✅' : '⏸')) + '</td>'
    + '<td><b>' + esc(it.name) + '</b>' + (it.cpa ? ' <span class="gctx-chip">Confirm with CPA</span>' : ' <span class="gctx-chip ok">CPA confirmed</span>') + (it.on === false ? ' <span class="gctx-chip off">Off</span>' : '')
    + '<div class="gctx-sub">' + esc(rule(it)) + (it.shift === 'none' ? ' · no weekend shift' : ' · a weekend / holiday moves it to the next business day') + ' · reminds ' + (it.lead || 7) + ' days before</div>'
    + (it.notes ? '<div class="gctx-note">' + esc(it.notes) + '</div>' : '') + '</td>'
    + '<td>' + esc(WHO[it.who] || it.who) + (kind === 'owner' && it.owner ? '<div class="gctx-sub">' + esc(it.who === 'admins' ? 'both admins' : nameOf(it.owner)) + '</div>' : '') + '</td>'
    + '<td>' + (n ? '<b>' + esc(T.longDate(n.occ.due)) + '</b><div class="gctx-sub">' + esc(n.occ.label) + (n.occ.due !== n.occ.nominal ? ' · moved from ' + esc(T.short(n.occ.nominal)) : '') + '</div>' : '—')
    + (kind === 'owner' ? '<div class="gctx-sub">' + (num(it.amount) > 0 ? 'Amount ' + esc(T.money(it.amount)) : 'No amount set') + '</div>' : e != null ? '<div class="gctx-sub">est. ' + esc(T.money(e)) + '</div>' : '') + '</td>'
    + '<td>' + (it.link ? '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(it.link.replace(/^https:\/\//, '').split('/')[0]) + ' ›</a>' : '') + '</td>'
    + '<td>' + (edit ? '<button type="button" class="gctx-btn" data-tax-a="edit" data-kind="' + kind + '" data-id="' + esc(it.id) + '">Edit</button>' : '') + '</td></tr>'
    + (UI.edit === it.id && UI.kind === kind ? '<tr class="gctx-edrow"><td colspan="6">' + editForm(it, kind) + '</td></tr>' : '');
}
function editForm(it, kind){
  var P = people(), opt = function(v, l, cur){ return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>'; };
  return '<div class="gctx-ed" data-kind="' + kind + '" data-id="' + esc(it.id) + '"><div class="gctx-grid">'
    + '<label>Name<input data-f="name" value="' + esc(it.name) + '"></label>'
    + '<label>Short name <small>(in alerts)</small><input data-f="short" value="' + esc(it.short) + '"></label>'
    + '<label>How often<select data-f="freq">' + opt('monthly', 'Monthly', it.freq) + opt('quarterly', 'Quarterly', it.freq) + opt('yearly', 'Yearly', it.freq) + '</select></label>'
    + '<label>Monthly: day of the month <small>(1–31 or last)</small><input data-f="day" value="' + esc(it.day || 15) + '"></label>'
    + '<label>Quarterly / yearly: dates <small>(MM-DD, in the tax year’s order; MM-last = last day)</small><input data-f="dates" value="' + esc(arr0(it.dates).join(', ')) + '"></label>'
    + '<label>Period<select data-f="prior">' + opt('1', 'for the month / year before', it.prior !== false ? '1' : '0') + opt('0', 'for the month / year it is due in', it.prior !== false ? '1' : '0') + '</select></label>'
    + '<label>Weekend / holiday<select data-f="shift">' + opt('bizday', 'move to the next business day', it.shift) + opt('none', 'keep the date', it.shift) + '</select></label>'
    + '<label>Remind this many days before<input data-f="lead" inputmode="numeric" value="' + esc(it.lead || 7) + '"></label>'
    + (kind === 'owner'
      ? '<label>Remind<select data-f="who">' + opt('own', 'the owner only', it.who) + opt('admins', 'both admins', it.who) + '</select></label>'
        + '<label>Owner<select data-f="owner">' + P.admins.map(function(e){ return opt(e, nameOf(e), it.owner); }).join('') + '</select></label>'
        + '<label>The quarterly number ($)<input data-f="amount" inputmode="decimal" value="' + (num(it.amount) > 0 ? num(it.amount).toFixed(2) : '') + '"></label>'
      : '<label>Remind<select data-f="who">' + opt('admins+office', 'admins + office', it.who) + opt('admins', 'admins only', it.who) + opt('office', 'office only', it.who) + '</select></label>'
        + '<label>Amount estimate from Payroll<select data-f="pay">' + opt('', 'none', it.pay || '') + opt('941', 'Form 941 taxes', it.pay || '') + opt('suta', 'state unemployment', it.pay || '') + opt('futa', 'FUTA', it.pay || '') + '</select></label>')
    + '<label>Link <small>(https://…, e.g. EFTPS or TNTAP)</small><input data-f="link" value="' + esc(it.link) + '"></label>'
    + '</div><label>Notes<textarea data-f="notes" rows="2">' + esc(it.notes) + '</textarea></label>'
    + '<label class="gctx-ck"><input type="checkbox" data-f="cpaok"' + (it.cpa ? '' : ' checked') + '> Confirmed with the CPA (takes off the “Confirm with CPA” mark)</label>'
    + '<div class="gctx-act"><button type="button" class="gctx-btn ok" data-tax-a="save">Save</button><button type="button" class="gctx-btn" data-tax-a="cancel">Cancel</button>'
    + (it.custom ? '<button type="button" class="gctx-btn bad" data-tax-a="remove">Remove</button>' : '') + '</div></div>';
}
function paidHtml(){
  var l = S.paid.map(function(p){ return Object.assign({ kind: 'company' }, p); });
  if (seesOwner() && S.own) l = l.concat(arr(S.own.paid).map(function(p){ return Object.assign({ kind: 'owner' }, p); }));
  l.sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; });
  if (!l.length) return '<div class="gctx-empty">Nothing marked paid yet.</div>';
  return '<table class="gctx-t"><thead><tr><th>Paid</th><th>What</th><th>Amount</th><th>Confirmation</th><th>By</th><th></th></tr></thead><tbody>' + l.slice(0, 40).map(function(p){
    return '<tr><td>' + esc(p.paidOn) + '</td><td>' + esc(p.name) + ' ' + esc(p.label) + '<div class="gctx-sub">due ' + esc(p.due) + (p.kind === 'owner' ? ' · admins only' : '') + '</div></td><td>' + (p.none ? 'none due' : esc(T.money(p.amount))) + '</td><td>' + esc(p.confirm || '—')
      + (p.receipt && p.receipt.ref ? ' · <button type="button" class="gctx-link" data-tax-a="receipt" data-ref="' + esc(p.receipt.ref) + '">📎 receipt</button>' : '') + '</td><td>' + esc(p.by) + '</td><td>'
      + (canEdit() ? '<button type="button" class="gctx-link" data-tax-a="undo" data-kind="' + p.kind + '" data-key="' + esc(p.key) + '">Undo</button>' : '') + '</td></tr>';
  }).join('') + '</tbody></table>';
}
function calHtml(){
  css();
  var head = '<tr><th></th><th>Tax</th><th>Who is reminded</th><th>Next due</th><th>Pay / file</th><th></th></tr>';
  var h = '<div class="gctx-cal" data-tax-cal="1"><div class="gctx-top"><div><b>🧾 Tax deadlines</b><div class="gctx-sub">Today ' + esc(T.longDate(today())) + '. Alerts: 7 days before, on the due day (8 AM Central) and every day while overdue — until someone taps ✓ Paid. '
    + (canEdit() ? 'Switch on what applies; the CPA confirms the rest.' : 'Only an admin changes this list.') + '</div></div>'
    + '<div class="gctx-tops">' + rowsHtml().html + '</div></div>'
    + '<h4>Company &amp; payroll taxes <small>— admins + office</small></h4><div class="gctx-scroll"><table class="gctx-t">' + head + '<tbody>' + S.cal.items.map(function(it){ return itemRow(it, 'company', S.paid); }).join('') + '</tbody></table></div>'
    + (canEdit() ? '<button type="button" class="gctx-btn" data-tax-a="add" data-kind="company">+ Add a deadline</button>' : '');
  if (seesOwner()) {
    h += '<h4>Owners — quarterly estimated tax <small>— admins only; the office never sees these</small></h4>'
      + (S.own ? '<div class="gctx-scroll"><table class="gctx-t">' + head + '<tbody>' + S.own.items.map(function(it){ return itemRow(it, 'owner', S.own.paid); }).join('') + '</tbody></table></div>'
        + '<button type="button" class="gctx-btn" data-tax-a="add" data-kind="owner">+ Add an owner item</button>'
        : '<div class="gctx-empty">The owners-only records could not be read (is docs/admin-data.sql set up?).</div>');
  }
  h += '<h4>Marked paid</h4>' + paidHtml()
    + '<div class="gctx-cpa" data-tax-cpa="1">⚠ ' + esc(T.CPA_NOTE) + '</div></div>';
  return h;
}
function renderCal(box){ UI.host = box; if (!box) return; box.innerHTML = calHtml(); if (!S.at) load(); }
function openCal(){
  if (!canSee()) { toast('The tax calendar is for the admins and the office.', true); return null; }
  var ov = modal('gctx-calov', '🧾 Tax deadlines', '<div id="gctx-calbox"></div>'); ov.querySelector('.gctx-box').classList.add('wide');
  renderCal(ov.querySelector('#gctx-calbox')); load(); return ov;
}
function repaint(){
  try { if (UI.host && UI.host.isConnected && !UI.host.querySelector('.gctx-ed')) UI.host.innerHTML = calHtml(); } catch (e) { warn(e); }
  try { paintHomes(); } catch (e) { warn(e); }
  try { if (W._gcRA && W._gcRA.state && W._gcRA.state().desk) { /* the desk re-renders by itself when its html changes */ } } catch (e) {}
}
function listOf(kind){ return kind === 'owner' ? S.own : S.cal; }
function saveList(kind){
  if (!canEdit()) return Promise.resolve(false);
  var L = listOf(kind); if (!L) return Promise.resolve(false);
  var v = { v: 1, startedAt: L.startedAt || today(), items: L.items, removed: L.removed || [], updatedBy: myName(), updatedAt: new Date().toISOString() };
  if (kind === 'owner') return adminGet().then(function(cur){ if (cur == null) return false; v.paid = arr(cur.paid); return adminPut(v).then(function(ok){ if (ok) { S.own = Object.assign(T.merge(v, 'owner'), { raw: v }); S.ver++; } return ok; }); });
  return cloudPut(K_CAL, v).then(function(ok){ if (ok) { var paid = S.paid; S.cal = Object.assign(T.merge(v, 'company'), { raw: v }); S.paid = paid; S.ver++; } return ok; });
}
function readForm(ed, it){
  var g = function(f){ var el = ed.querySelector('[data-f="' + f + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
  var x = Object.assign({}, it, { name: g('name'), short: g('short'), freq: g('freq'), day: g('day'), dates: s(g('dates')).split(/[\s,;]+/).filter(Boolean), prior: g('prior') !== '0',
    shift: g('shift'), lead: g('lead'), who: g('who'), link: g('link'), notes: g('notes'), cpa: !g('cpaok') });
  if (g('cpaok') && it.cpa) x.confirmedBy = myName() + ' ' + today();
  if (ed.getAttribute('data-kind') === 'owner') { x.owner = g('owner'); x.amount = num(g('amount')); x.personal = true; } else x.pay = g('pay');
  return T.cleanItem(x);
}

/* ── clicks ── */
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-tax-a]') : null; if (!b) return;
  var a = b.getAttribute('data-tax-a'), kind = b.getAttribute('data-kind') || 'company', id = b.getAttribute('data-id');
  if (a === 'toggle') return;   /* the change event does it */
  e.preventDefault(); e.stopPropagation();
  if (a === 'open') { openCal(); return; }
  if (a === 'paid') { openPaid(kind, b.getAttribute('data-key')); return; }
  if (a === 'receipt') { var ref = b.getAttribute('data-ref'); if (W._gcFileUrl) W._gcFileUrl(ref).then(function(u){ W.open(u, '_blank'); }, function(){ toast('The receipt is not reachable from this computer yet.', true); }); return; }
  if (a === 'undo') { if (W.confirm('Undo “paid”? The reminder comes back.')) undoPaid(kind, b.getAttribute('data-key')).then(function(ok){ toast(ok ? 'Undone.' : 'Could not save.', !ok); }); return; }
  if (!canEdit()) return;
  var L = listOf(kind);
  if (a === 'edit') { UI.edit = UI.edit === id && UI.kind === kind ? null : id; UI.kind = kind; if (UI.host) UI.host.innerHTML = calHtml(); return; }
  if (a === 'cancel') { UI.edit = null; if (UI.host) UI.host.innerHTML = calHtml(); return; }
  if (a === 'add' && L) {
    var nid = (kind === 'owner' ? 'own_' : 'tax_') + Date.now().toString(36);
    L.items.push(T.cleanItem(kind === 'owner' ? { id: nid, name: 'New owner item', freq: 'quarterly', dates: ['04-15', '06-15', '09-15', '01-15'], owner: people().admins[0] || '', personal: true, custom: true, since: today() }
      : { id: nid, name: 'New tax deadline', freq: 'monthly', day: 15, custom: true, since: today() }));
    UI.edit = nid; UI.kind = kind; if (UI.host) UI.host.innerHTML = calHtml(); return;
  }
  if ((a === 'save' || a === 'remove') && L) {
    var ed = b.closest('.gctx-ed'), iid = ed.getAttribute('data-id'), i = -1;
    L.items.forEach(function(x, j){ if (x.id === iid) i = j; }); if (i < 0) return;
    if (a === 'remove') { if (!W.confirm('Remove this deadline?')) return; L.items.splice(i, 1); L.removed = (L.removed || []).concat([iid]); }
    else { var nx = readForm(ed, L.items[i]); if (!nx.name) { toast('Give it a name.', true); return; } L.items[i] = nx; }
    b.disabled = true;
    saveList(kind).then(function(ok){ UI.edit = ok ? null : UI.edit; toast(ok ? '✓ Saved — the alerts follow the new rule.' : 'Could not save.', !ok); if (UI.host) UI.host.innerHTML = calHtml(); repaint(); });
  }
}, true);
D.addEventListener('change', function(e){
  var c = e.target; if (!c || !c.matches || !c.matches('input[data-tax-a="toggle"]')) return;
  if (!canEdit()) { c.checked = !c.checked; return; }
  var kind = c.getAttribute('data-kind'), L = listOf(kind), id = c.getAttribute('data-id'); if (!L) return;
  L.items.forEach(function(x){ if (x.id === id) { x.on = !!c.checked; if (x.on) x.since = today(); } });
  saveList(kind).then(function(ok){ toast(ok ? (c.checked ? '✓ Switched on — reminders start from today.' : 'Switched off — no reminders for it.') : 'Could not save.', !ok); if (UI.host) UI.host.innerHTML = calHtml(); repaint(); });
}, true);

/* ── ⚙ Admin → 🧾 Tax deadlines ── */
function admSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'taxes', after: 'pay', ic: '🧾', t: 'Tax deadlines', d: 'Payroll taxes, the owners’ quarterly estimated tax, TN taxes — alerts to the admins and the office until paid',
    render: function(box){ renderCal(box); load(); },
    count: function(){ var r = lists(), n = 0; r.forEach(function(L){ n += T.upcoming(L.cal, today(), L.paid, 0).overdue.length; }); return n ? n + ' overdue' : 'calendar'; } });
  return true;
}
if (!admSection()) { var tries = 0, iv = RI.call(W, function(){ if (admSection() || ++tries > 40) clearInterval(iv); }, 1500); }

/* ── crm…/#taxes opens the calendar ── */
function hash(){ if (/^#taxes\b/.test(location.hash || '') && canSee()) { openCal(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} } }
W.addEventListener('hashchange', hash);

/* ── styles ── */
function css(){
  if (D.getElementById('gctx-css')) return;
  var st = D.createElement('style'); st.id = 'gctx-css';
  st.textContent = [
    '.gctx-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;margin:12px 16px;padding:10px 14px;font:13.5px Inter,Arial,sans-serif;color:#111827;box-shadow:0 1px 2px rgba(16,24,40,.05)}',
    '.gctx-hd{display:flex;justify-content:space-between;align-items:center;font-size:15px;margin-bottom:4px}',
    '.gctx-row{display:flex;align-items:center;gap:10px;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding:7px 0}.gctx-row:last-of-type{border-bottom:none}.gctx-row .tx{min-width:0}.gctx-row small{display:block;color:#6b7280;font-size:12px}',
    '.gctx-row.over b,.gctx-red{color:#b42318;font-weight:800}',
    '.gctx-btn{border:1px solid #d1d5db;background:#fff;color:#1f2937;border-radius:9px;padding:6px 10px;font:700 12.5px Inter,sans-serif;cursor:pointer;white-space:nowrap}.gctx-btn.ok{background:#16a34a;border-color:#16a34a;color:#fff}.gctx-btn.bad{color:#b42318}.gctx-btn:disabled{opacity:.6}',
    '.gctx-link{border:none;background:none;color:#2563eb;font:700 12.5px Inter,sans-serif;cursor:pointer;padding:0}',
    '.gctx-empty{color:#6b7280;padding:8px 0}.gctx-foot{color:#9ca3af;font-size:11px;margin-top:4px}',
    '.gctx-ov{position:fixed;inset:0;z-index:2147482500;background:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}',
    '.gctx-box{background:#fff;border-radius:14px;max-width:620px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);font:14px Inter,Arial,sans-serif;color:#111827}.gctx-box.wide{max-width:1100px}',
    '.gctx-bh{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:15px}.gctx-x{border:none;background:none;font-size:18px;cursor:pointer}.gctx-bb{padding:12px 16px}',
    '.gctx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:10px 0}',
    '.gctx-box label,.gctx-ed label{display:block;font-size:12px;font-weight:700;color:#374151}.gctx-box input:not([type=checkbox]),.gctx-ed input:not([type=checkbox]),.gctx-ed select,.gctx-ed textarea{display:block;width:100%;box-sizing:border-box;margin-top:3px;padding:7px 8px;border:1px solid #cbd5e1;border-radius:7px;font:13px Inter,Arial,sans-serif}',
    '.gctx-ck{display:flex!important;gap:8px;align-items:flex-start;font-weight:600!important;margin:8px 0}.gctx-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}',
    '.gctx-sub{color:#6b7280;font-size:12px;font-weight:400}.gctx-note{color:#475569;font-size:12px;margin-top:3px}',
    '.gctx-cal h4{margin:16px 0 6px;font-size:14px}.gctx-cal h4 small{color:#6b7280;font-weight:400}.gctx-top{display:grid;grid-template-columns:1fr minmax(260px,420px);gap:14px}',
    '.gctx-scroll{overflow-x:auto}.gctx-t{width:100%;border-collapse:collapse;font-size:13px}.gctx-t th{text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;padding:6px}.gctx-t td{padding:7px 6px;border-top:1px solid #f1f5f9;vertical-align:top}',
    '.gctx-t tr.off td{opacity:.6}.gctx-edrow td{background:#f8fafc}.gctx-ed{padding:6px 0}',
    '.gctx-chip{display:inline-block;font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;background:#fef3c7;color:#92400e;vertical-align:middle}.gctx-chip.ok{background:#dcfce7;color:#166534}.gctx-chip.off{background:#e5e7eb;color:#374151}',
    '.gctx-sw{position:relative;display:inline-block;width:38px;height:22px}.gctx-sw input{opacity:0;width:0;height:0}.gctx-sw span{position:absolute;inset:0;background:#cbd5e1;border-radius:999px;cursor:pointer;transition:.15s}.gctx-sw span:before{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}.gctx-sw input:checked+span{background:#16a34a}.gctx-sw input:checked+span:before{transform:translateX(16px)}',
    '.gctx-cpa{margin-top:16px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#92400e;font-size:12.5px}',
    '#gctx-toast{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:28px;z-index:2147483000;color:#fff;border-radius:12px;padding:11px 16px;font:600 14px Inter,sans-serif;max-width:calc(100% - 32px);box-shadow:0 8px 24px rgba(0,0,0,.3)}',
    '@media (max-width:700px){.gctx-top{grid-template-columns:1fr}.gctx-card{margin:10px}}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}

/* ── keep it fresh: the first look once the person is known, then every 5 minutes; the home cards every 1.5 s ── */
var first = RI.call(W, function(){ if (canSee() && (W._gcCloudGet || W._supaUpsert)) { clearInterval(first); load(); hash(); } }, 1500);
RI.call(W, function(){ if (canSee() && Date.now() - S.at > 5 * 60e3) load(); }, 60e3);
RI.call(W, function(){ try { paintHomes(); } catch (e) {} }, 1500);

W._gcTax = { open: openCal, load: load, alerts: function(){ return alerts().map(function(a){ return { kind: a.kind, key: a.occ.key, stage: a.stage, title: a.title }; }); },
  upcoming: function(){ return rowsHtml(); }, todo: todoItems, paidDialog: openPaid, paid: markPaid, undo: undoPaid,
  setClock: function(ms){ W.__gcTaxClock = ms; TD.sig = ''; S.ver++; repaint(); },
  state: function(){ return { at: S.at, ver: S.ver, today: today(), canSee: canSee(), seesOwner: seesOwner(), canEdit: canEdit(), company: S.cal.items.map(function(x){ return x.id + (x.on === false ? ':off' : ''); }),
    owner: S.own ? S.own.items.map(function(x){ return x.id; }) : null, paid: S.paid.length, ownPaid: S.own ? arr(S.own.paid).length : null, runs: S.runs ? S.runs.length : null, err: S.err }; } };
try { console.log('[GC] 🧾 Tax deadlines: ⚙ Admin → 🧾 Tax deadlines, alerts on the To-Do, the 🧾 Taxes card (patch TAXALERTS) — _gcTax.state()'); } catch (e) {}
})();
