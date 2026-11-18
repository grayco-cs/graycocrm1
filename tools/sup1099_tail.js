/* __GC_PATCH_SUP1099__ — 🧾 1099 CONTRACTOR STAFF (a 1099 SUPERINTENDENT)   (patch SUP1099)
   Owner 11/18: "We are hiring a 1099 superintendent. We will update his information on the sub portal, but should we make him a 1099
   superintendent profile that has superintendent stuff so he can use our app?" — the owner chose BOTH: a GrayCo Field sign-in with the
   Superintendent role, plus a linked sub portal account for his W-9, COI and invoices.
   • ⚙ Admin → 👤 Employees → EDIT → Employment (beside Role): "W-2 employee" (everyone today, the default — nothing is written for
     them) or "1099 contractor". Any role; the role still decides his menu, Field layout and approvals.
   • A 1099 contractor's own screens (and 👁 View as him): no payroll / pay stubs / W-2 / W-4 / payroll tax, no PTO or time off, no
     "Call in sick" (🚧 "Can't make it today" sends a plain message to the PM of each of today's jobs and the admins instead — no
     sick day is recorded), no commissions, no benefits. The time clock still runs, but his punch is only "hours on site"
     (onsite: true, payroll: false) for job records and his invoices — payroll never reads it.
     He keeps every Field tool of his role (Superintendent: his jobs, schedule, daily logs, punch, inspections, crews and subs on his
     jobs, messages, photos, 🧾 Snap a receipt — job expenses he is paid back for through his invoice) and his approvals.
   • Payroll: no payroll profile is made for him, payroll runs (by hand, automatic, the week entry) skip him; PM pay counts him like an
     owner (no commission — that share stays with GrayCo). Editor: no 💰 Pay / 🏥 Insurance tabs for him.
   • Paperwork: saving him as 1099 links him to a Subs record by his e-mail (an existing one — same e-mail, or one he is already linked
     to — else a new one: isSub, staff1099, staffUserId, staffName) and turns that record's sub portal link on. He signs in at the
     GrayCo Portal with the same e-mail (a code, or his password) to send his W-9, COI (expiry reminders: the existing sub compliance),
     signed contractor agreement and invoices — the sub portal lists the jobs where he is superintendent (portal-access.js). They land
     on that Subs record and in sub bills → ✅ Approvals → job cost like any sub's; the 📄 1099 Reports count his paid bills.
   • His profile (admins and the office): 🧾 Contractor paperwork — W-9 ✓/✗, COI expiry, agreement signed, paid this year (the sum of
     his paid sub bills), the linked Subs record and its portal link.
   Nothing new is shown to subs or customers: the sub portal shows him what it shows any sub (the sub's view of a job).
   Console: _gc1099.state(), _gc1099.is(user), _gc1099.link(user), _gc1099.paperwork(user) */
(function(W, D){
'use strict';
if (W.__GC_PATCH_SUP1099__) return; W.__GC_PATCH_SUP1099__ = true;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function norm(v){ return low(v).replace(/[^a-z0-9@.\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(e)); }
function nowIso(){ return new Date().toISOString(); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function ymd(v){ var t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function warn(e){ try { console.warn('[GC SUP1099]', e && e.message || e); } catch (x) {} }
function toast(m, bad){
  try { if (W._gcToast) return W._gcToast(m, bad); } catch (e) {}
  try { var t = D.getElementById('gc1099-toast'); if (!t) { t = D.createElement('div'); t.id = 'gc1099-toast'; t.setAttribute('data-gc-keep', '1'); t.setAttribute('role', 'status'); D.body.appendChild(t); }
    t.textContent = m; t.className = bad ? 'bad' : ''; t.style.display = 'block'; clearTimeout(t.__t); t.__t = later(function(){ t.style.display = 'none'; }, bad ? 7000 : 4500); } catch (e) {}
}

/* ── who ── */
function C(){ return W._crm || {}; }
function users(){ return arr(C().users); }
function is1099(u){ return !!u && low(u.employment) === '1099'; }
function active(u){ return !!u && u.active !== false && !u.departed && !/disabled|inactive|terminated/i.test(s(u.status)); }
function userBy(x){
  if (!x) return null;
  if (typeof x === 'object') { var id = s(x.id), L0 = users(); if (id && id !== 'NEW') { for (var i = 0; i < L0.length; i++) if (s(L0[i].id) === id) return L0[i]; } x = x.email || x.name; }
  var k = low(x); if (!k) return null;
  var L = users(), hit = null;
  for (var j = 0; j < L.length; j++) { var u = L[j]; if (low(u.email) === k || low(u.name) === k) { if (!hit || (active(u) && !active(hit))) hit = u; } }
  return hit;
}
function authEmail(){ try { var A = W.__GC_AUTH__, e = A && A.email && A.email(); return low(e); } catch (e) { return ''; } }
function vas(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
function meEmail(){ if (vas()) { try { var e = W._gcVAS.email(); if (e) return low(e); } catch (x) {} } return authEmail(); }
function meUser(){ var e = meEmail(); return (e && userBy(e)) || null; }
function meIs(){ return is1099(meUser()); }
function realAdmin(){ if (vas()) return false; try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function officeViewer(){
  if (vas()) return false;
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  var u = userBy(authEmail()); return !!u && /office/i.test(s(u.role));
}
/* the payroll profile → is it a 1099 contractor's? (userId, then e-mail, then name) */
function skipPay(p){
  if (!p) return false;
  var u = null, id = s(p.userId), L = users();
  if (id) for (var i = 0; i < L.length; i++) if (s(L[i].id) === id) { u = L[i]; break; }
  if (!u && okEmail(p.email)) u = userBy(p.email);
  if (!u && s(p.name)) u = userBy(p.name);
  return is1099(u);
}
/* the time clock's punch for this person: a 1099 contractor's is hours on site, never payroll */
function punchTag(name){
  var u = (name && userBy(name)) || null;
  if (!u) { var me = userBy(authEmail()); if (me && (!name || low(me.name) === low(name) || low(s(me.email).split('@')[0]) === low(name))) u = me; }
  return is1099(u) ? { onsite: true, payroll: false, hoursKind: '1099 hours on site' } : {};
}

/* ── the Subs record ── */
function subsAll(){
  var a = arr(C().vendors), b = arr(C().subs), seen = {}, out = [];
  (b === a ? a : a.concat(b)).forEach(function(r){ var k = s(r.id); if (!k || seen[k]) return; seen[k] = 1; out.push(r); });
  return out;
}
function tomb(id){ try { return typeof W._gcIsTombstoned === 'function' && !!(W._gcIsTombstoned('vendors', id) || W._gcIsTombstoned('subs', id)); } catch (e) { return false; } }
function vendorFor(u){
  if (!u) return null;
  var L = subsAll().filter(function(r){ return !tomb(r.id) && r.deleted !== true; }), e = low(u.email);
  return (s(u.subId) && L.filter(function(r){ return s(r.id) === s(u.subId); })[0])
    || L.filter(function(r){ return s(u.id) && s(r.staffUserId) === s(u.id); })[0]
    || (okEmail(e) && L.filter(function(r){ return low(r.email) === e || arr([]).concat(r.altEmails || []).map(low).indexOf(e) > -1; })[0])
    || null;
}
function filesOf(v, kind){ return (Array.isArray(v && v.files) ? v.files : []).filter(function(f){ return f && low(f.kind) === kind; }); }
function invsAll(){ var seen = {}; return arr(C().invs).concat(arr(C().invoices)).filter(function(iv){ var k = s(iv.id); if (k && seen[k]) return false; if (k) seen[k] = 1; return true; }); }
function billIsHis(iv, v){ if (s(iv.type) !== 'sub' || iv.deleted === true) return false; var sid = s(iv.subId || iv.vendorId); return sid ? sid === s(v.id) : (!!norm(iv.sub || iv.vendor) && (norm(iv.sub || iv.vendor) === norm(v.name) || norm(iv.sub || iv.vendor) === norm(v.company))); }
function billPaid(iv){ return low(iv.status) === 'paid' || iv.paid === true; }
/* what the profile card shows */
function paperwork(u){
  u = userBy(u) || u; var v = vendorFor(u), yr = String(new Date().getFullYear());
  var out = { is1099: is1099(u), linked: !!v, subId: v ? s(v.id) : '', subName: v ? s(v.name || v.company) : '', year: yr,
    w9: false, coi: { on: false, exp: '', days: null }, agreement: false, paidYtd: 0, paidCount: 0, openBills: 0, openAmount: 0, compliance: null };
  if (!v) return out;
  out.w9 = v.w9 === true || !!s(v.tin) || filesOf(v, 'w9').length > 0;
  var exp = ymd(v.insExp || v.insuranceExp || v.coiExpiration) || filesOf(v, 'coi').map(function(f){ return ymd(f.exp); }).filter(Boolean).sort().pop() || '';
  out.coi = { on: v.coi === true || !!exp, exp: exp, days: exp ? Math.ceil((Date.parse(exp + 'T12:00:00') - Date.now()) / 864e5) : null };
  out.agreement = !!v.subAgreement || filesOf(v, 'agreement').length > 0;
  invsAll().forEach(function(iv){
    if (!billIsHis(iv, v) || /void|reject|denied|declin/i.test(s(iv.status))) return;
    if (billPaid(iv)) { if (String(ymd(iv.paidDate || iv.date)).slice(0, 4) === yr) { out.paidYtd += num(iv.amt || iv.amount); out.paidCount++; } }
    else { out.openBills++; out.openAmount += num(iv.amt || iv.amount); }
  });
  out.paidYtd = Math.round(out.paidYtd * 100) / 100; out.openAmount = Math.round(out.openAmount * 100) / 100;
  try { if (W._gcSubCompliance) out.compliance = W._gcSubCompliance(v); } catch (e) {}
  return out;
}

/* ── link a 1099 staff member to a Subs record (match by e-mail, else make one) + turn its sub portal link on ── */
var LINKS = {}, LAST = null;
function waitUser(u0, n){
  return new Promise(function(res){
    (function tryIt(k){ var u = userBy(u0); if ((u && (!is1099(u0) || is1099(u))) || k >= (n || 20)) return res(u || null); later(function(){ tryIt(k + 1); }, 300); })(0);
  });
}
function pushVendors(){
  later(function(){
    try { var l = arr(W._crm && W._crm.vendors); if (!l.length) return; W.__GC_MANUAL_SAVE__ = true; if (W._supaUpsertNow) W._supaUpsertNow('vendors', l); else if (W._supaUpsert) W._supaUpsert('vendors', l); if (W.idbSet) W.idbSet('vendors', l); } catch (e) { warn(e); }
    later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 2500);
  }, 900);
}
function api(fn, body){
  return W.fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(r){
    return r.text().then(function(t){ var j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, ok: r.ok && !!(j && j.ok !== false), data: j || {} }; });
  }, function(){ return { status: 0, ok: false, data: { error: 'No internet — try again.' } }; });
}
/* the sub portal link of his Subs record (portal-access s-link create; the record must have reached the cloud — retried) */
function portalOn(subId){
  var waits = [1500, 3000, 6000, 12000, 25000, 45000];
  return new Promise(function(res){
    (function go(k){
      api('portal-access', { action: 's-link', subId: subId, op: 'create' }).then(function(r){
        if (r.ok && r.data && r.data.active) return res({ ok: true, url: s(r.data.url) });
        if (k < waits.length && (r.status === 404 || r.status === 0 || r.status >= 500)) return later(function(){ go(k + 1); }, waits[k]);
        res({ ok: false, error: s(r.data && r.data.error) || ('HTTP ' + r.status) });
      });
    })(0);
  });
}
function link(u0){
  return waitUser(u0).then(function(u){
    if (!u) return { ok: false, why: 'That person is not on the people list yet.' };
    if (!is1099(u)) {
      /* back to W-2: his Subs record stays (his papers and bills), it just stops listing his jobs in the sub portal */
      var v0 = vendorFor(u);
      if (v0 && v0.staff1099 === true && typeof W._setVendors === 'function') { var at0 = nowIso(); W._setVendors(function(prev){ return Array.isArray(prev) ? prev.map(function(r){ return r && s(r.id) === s(v0.id) ? Object.assign({}, r, { staff1099: false, updatedAt: at0, savedAt: at0 }) : r; }) : prev; }); pushVendors(); }
      return { ok: true, w2: true };
    }
    if (!okEmail(u.email)) return { ok: false, why: 'Add his e-mail first — the sub portal signs him in with it.' };
    if (typeof W._setVendors !== 'function') return { ok: false, why: 'The Subs list is not loaded yet — save him again in a minute.' };
    var v = vendorFor(u), at = nowIso(), made = !v, e = low(u.email);
    var base = v || { id: 'SUB1099' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: s(u.name), company: s(u.name), email: e, phone: s(u.phone),
      trade: (s(u.role) || 'Contractor') + ' (1099)', cat: 'Sub', isSub: true, source: '1099 staff', status: 'Active', createdAt: at };
    var rec = Object.assign({}, base, { isSub: true, staff1099: true, staffUserId: s(u.id), staffName: s(u.name), contact: s(base.contact) || s(u.name),
      email: s(base.email) || e, phone: s(base.phone) || s(u.phone), updatedAt: at, savedAt: at });
    if (low(rec.email) !== e) rec.altEmails = (Array.isArray(rec.altEmails) ? rec.altEmails : []).concat([e]).filter(function(x, i, a){ return a.indexOf(x) === i; });
    W._setVendors(function(prev){
      if (!Array.isArray(prev)) return prev;
      var hit = false, out = prev.map(function(r){ if (r && s(r.id) === s(rec.id)) { hit = true; return Object.assign({}, r, rec); } return r; });
      if (!hit) out.push(rec);
      return out;
    });
    pushVendors();
    if (s(u.subId) !== s(rec.id) && typeof W._setUsers === 'function') {
      try { W._setUsers(function(prev){ return Array.isArray(prev) ? prev.map(function(x){ return x && s(x.id) === s(u.id) ? Object.assign({}, x, { subId: rec.id, updatedAt: at }) : x; }) : prev; }); } catch (e2) { warn(e2); }
    }
    LINKS[s(u.id)] = { subId: rec.id, made: made, at: at, portal: 'turning on' };
    return portalOn(rec.id).then(function(p){
      LINKS[s(u.id)].portal = p.ok ? 'on' : ('not on: ' + (p.error || ''));
      LAST = { user: s(u.name), subId: rec.id, made: made, portal: p };
      return { ok: true, subId: rec.id, made: made, portal: p };
    });
  });
}
/* called by the Employees editor after Save (React: the record as saved) */
function saved(u){
  if (!u || !(realAdmin() || officeViewer())) return;
  var want = is1099(u), had = (function(){ var x = userBy(u); return x && (is1099(x) || s(x.subId)); })();
  if (!want && !had && !s(u.subId)) return;   /* a W-2 employee: nothing at all */
  later(function(){
    link(u).then(function(r){
      if (!want) return;
      if (r && r.ok) toast('🧾 ' + s(u.name) + ' is a 1099 contractor — ' + (r.made ? 'a new Subs record was made' : 'linked to the Subs record') + ' with his e-mail' + (r.portal && r.portal.ok ? '; his sub portal is on (same e-mail).' : '. The sub portal link will turn on when the record reaches the cloud — or turn it on in Subs.'));
      else toast('🧾 Not linked yet: ' + s(r && r.why), true);
    }, function(e){ warn(e); });
  }, 400);
}

/* ── 🧾 Contractor paperwork (his profile; admins and the office) ── */
function mark(on, yes, no){ return '<span class="gc1099-m ' + (on ? 'ok' : 'no') + '">' + (on ? '✓' : '✗') + '</span> ' + esc(on ? yes : no); }
function cardHtml(u){
  var P = paperwork(u), admin = realAdmin();
  var h = '<div class="gc1099-card" data-gc1099-card="' + esc(u.id) + '"><div class="hd">🧾 Contractor paperwork <span>1099 · paid by invoice, not payroll</span></div>';
  if (!P.linked) return h + '<div class="row">No Subs record linked yet — his W-9, COI, agreement and invoices live on one.</div>' + (admin ? '<div class="bt"><button type="button" data-gc1099-act="link" data-id="' + esc(u.id) + '">🔗 Link / make his Subs record (by e-mail)</button></div>' : '') + '</div>';
  var coi = P.coi.exp ? ('expires ' + P.coi.exp + (P.coi.days < 0 ? ' — EXPIRED' : P.coi.days <= 30 ? ' — in ' + P.coi.days + ' day' + (P.coi.days === 1 ? '' : 's') : '')) : (P.coi.on ? 'on file (no date)' : 'not on file');
  var coiOk = P.coi.on && !(P.coi.days != null && P.coi.days < 0);
  h += '<div class="grid">'
    + '<div data-k="w9">' + mark(P.w9, 'W-9 on file', 'No W-9') + '</div>'
    + '<div data-k="coi" class="' + (P.coi.days != null && P.coi.days <= 30 ? 'warn' : '') + '">' + mark(coiOk, 'COI ' + coi, 'COI ' + coi) + '</div>'
    + '<div data-k="agreement">' + mark(P.agreement, 'Contractor agreement signed', 'Contractor agreement not signed') + '</div>'
    + '<div data-k="ytd"><b>' + money(P.paidYtd) + '</b> paid in ' + esc(P.year) + ' <small>(' + P.paidCount + ' paid bill' + (P.paidCount === 1 ? '' : 's') + (P.paidYtd >= 600 ? ' · 1099-NEC due' : '') + ')</small></div>'
    + '</div>'
    + '<div class="row">Subs record: <b>' + esc(P.subName) + '</b>' + (P.openBills ? ' · ' + P.openBills + ' open bill' + (P.openBills === 1 ? '' : 's') + ' (' + money(P.openAmount) + ')' : '') + ' · he signs in to the GrayCo Portal with ' + esc(low(u.email)) + '</div>'
    + '<div class="bt"><button type="button" data-gc1099-act="r1099">📄 1099 report</button><button type="button" data-gc1099-act="comp">🛡 Sub compliance</button>'
    + (admin ? '<button type="button" data-gc1099-act="link" data-id="' + esc(u.id) + '">🔗 Sub portal link on</button>' : '') + '</div>';
  return h + '</div>';
}
function paintCards(){
  var hosts = D.querySelectorAll('[data-gc1099-user]'); if (!hosts.length) return;
  var may = realAdmin() || officeViewer();
  Array.prototype.forEach.call(hosts, function(host){
    var id = host.getAttribute('data-gc1099-user'), u = users().filter(function(x){ return s(x.id) === id; })[0];
    var html = may && u && is1099(u) ? cardHtml(u) : '';
    if (host.__h !== html) { host.innerHTML = html; host.__h = html; }
  });
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-gc1099-act]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var a = b.getAttribute('data-gc1099-act');
  if (a === 'r1099') { try { W._gcOpen1099 && W._gcOpen1099('out', new Date().getFullYear()); } catch (x) { warn(x); } return; }
  if (a === 'comp') { try { W._gcOpenSubCompliance && W._gcOpenSubCompliance(); } catch (x) { warn(x); } return; }
  if (a === 'link') {
    if (!realAdmin()) return; var u = userBy({ id: b.getAttribute('data-id') }); if (!u) return;
    b.disabled = true; b.textContent = '🔗 Working…';
    link(u).then(function(r){ b.disabled = false; toast(r && r.ok ? '🔗 ' + s(u.name) + ': Subs record ' + (r.made ? 'made' : 'linked') + (r.portal && r.portal.ok ? ', sub portal on.' : '; the sub portal link did not turn on yet (' + s(r.portal && r.portal.error) + ').') : 'Not linked: ' + s(r && r.why), !(r && r.ok)); paintCards(); });
  }
}, true);

/* ── 🚧 Can't make it today (instead of Call in sick) ── */
function projects(){ return arr(C().projects).filter(function(p){ return p.deleted !== true && !/lost|dead|cancel|closed|complete/i.test(s(p.status)); }); }
function namesIn(v){ return (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\s*[,;&\/]\s*|\s+and\s+/)).map(s).filter(Boolean); }
function supOf(p, u){ return [p.superintendent, p.superName, p.super].some(function(n){ return typeof n === 'string' && norm(n) === norm(u.name); }); }
function todaysJobs(u){
  var out = [], seen = {};
  try { if (W._gcTimeOff && W._gcTimeOff.jobsOn) W._gcTimeOff.jobsOn(u.email, today()).forEach(function(j){ var p = projects().filter(function(x){ return s(x.id) === s(j.pid); })[0]; if (p && !seen[p.id]) { seen[p.id] = 1; out.push(p); } }); } catch (e) {}
  if (!out.length) projects().forEach(function(p){ if (supOf(p, u) && !seen[p.id]) { seen[p.id] = 1; out.push(p); } });
  return out;
}
function cantTo(u, jobs){
  var to = [];
  function add(m){ if (m && active(m) && okEmail(m.email) && low(m.email) !== low(u.email) && to.indexOf(low(m.email)) < 0) to.push(low(m.email)); }
  jobs.forEach(function(p){ namesIn(p.pm || p.projectManager).forEach(function(n){ add(userBy(n)); }); });
  users().forEach(function(m){ if (/^admin$/i.test(s(m.role)) || low(m.payType) === 'owner') add(m); });
  return to;
}
function cantSheet(){
  var u = meUser(); if (!u) { toast('Your e-mail is not on the people list yet — ask the office to add you.', true); return null; }
  var old = D.getElementById('gc1099-cant'); if (old) old.remove();
  var jobs = todaysJobs(u), to = cantTo(u, jobs);
  var names = to.map(function(e){ var m = userBy(e); return s(m && m.name).split(/\s+/)[0] || e; });
  var o = D.createElement('div'); o.id = 'gc1099-cant'; o.className = 'gc1099-ov'; o.setAttribute('data-gc-keep', '1'); o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Can’t make it today');
  o.innerHTML = '<div class="gc1099-sh"><div class="hd">🚧 Can’t make it today <button type="button" data-x aria-label="Close">✕</button></div>'
    + '<div class="note">' + (jobs.length ? 'Today: <b>' + esc(jobs.map(function(p){ return s(p.name); }).join(', ')) + '</b>. ' : '') + 'Goes to ' + esc(names.join(', ') || 'the office') + ' as a message. (No sick day or time off is recorded — you are a 1099 contractor.)</div>'
    + '<label>Note (optional)</label><input type="text" data-f="note" maxlength="240" placeholder="e.g. truck broke down — back tomorrow">'
    + '<div class="err" data-f="err"></div><button type="button" class="go" data-go>🚧 Send</button></div>';
  D.body.appendChild(o);
  o.addEventListener('click', function(ev){ if (ev.target === o || (ev.target.closest && ev.target.closest('[data-x]'))) o.remove(); });
  o.querySelector('[data-go]').addEventListener('click', function(){
    var b = this, note = s(o.querySelector('[data-f="note"]').value);
    if (!to.length) { o.querySelector('[data-f="err"]').textContent = 'Nobody to tell — call the office.'; return; }
    b.disabled = true; b.textContent = 'Sending…';
    var msg = { kind: 'callout', title: '🚧 ' + s(u.name) + ' can’t make it today', body: (jobs.length ? jobs.map(function(p){ return s(p.name); }).join(', ') + (note ? ' — ' : '') : '') + note, link: jobs[0] ? '#job=' + s(jobs[0].id) : '' };
    LAST_CANT = { to: to.slice(), msg: msg, at: nowIso() };
    var go = typeof W._gcNotify === 'function' ? W._gcNotify(to, msg) : Promise.resolve({ ok: false });
    Promise.resolve(go).then(function(r){
      o.remove(); toast('🚧 Sent to ' + (names.join(', ') || 'the office') + '.');
    }, function(){ b.disabled = false; b.textContent = '🚧 Send'; o.querySelector('[data-f="err"]').textContent = 'Not sent — try again.'; });
  });
  return o;
}
var LAST_CANT = null;
/* clicks: 🚧, and any Time off / Call in sick button another screen still draws (before patch TIMEOFF's own handler) */
W.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-gc1099="cant"],[data-to-a="off"],[data-to-a="sick"]'); if (!b) return;
  if (b.getAttribute('data-gc1099') !== 'cant' && !meIs()) return;
  e.preventDefault(); e.stopPropagation();
  if (b.getAttribute('data-to-a') === 'off') { block('Time off'); return; }
  cantSheet();
}, true);

/* ── a 1099 contractor's own screens: no payroll, pay stubs, W-2 / W-4, PTO, sick, commission, benefits ── */
var SAY = 'You are set up as a 1099 contractor: GrayCo pays you through your invoices in the sub portal — there is no payroll, pay stub, PTO, sick pay, commission or benefits here.';
function block(what){ toast((what ? what + ': ' : '') + SAY); return false; }
var GUARD = ['_gcOpenMyPay', '_gcOpenMyPayRecord', '_gcPayStub', '_gcOpenPayroll', '_gcOpenPayrollTab', '_gcOpenPayrollCheck', '_gcOpenPayrollHistory', '_gcOpenPayPerson', '_gcOpenPayEveryone',
  '_gcOpenPMCommission', '_gcOpenCustomCommission', '_gcOpenFlatCommission', '_gcOpenCommissionAudit', '_gcOpenPayRules', '_gcOpenPayStructures', '_gcOpenMyStubs', '_gcOpenMyPayStubs', '_gcOpenTeamPay', '_gcMyPayLines'];
function guard(){
  GUARD.forEach(function(k){
    var f = W[k]; if (typeof f !== 'function' || f.__gc1099) return;
    var g = function(){ if (meIs()) return block(); return f.apply(this, arguments); };
    Object.keys(f).forEach(function(x){ try { g[x] = f[x]; } catch (e) {} });
    g.__gc1099 = true; g.__orig = f; W[k] = g;
  });
  var T = W._gcTimeOff;
  if (T && !T.__gc1099) {
    T.__gc1099 = true;
    ['openOff', 'openSick'].forEach(function(k){ var f = T[k]; if (typeof f !== 'function') return; T[k] = function(){ if (meIs()) { if (k === 'openSick') return cantSheet(); return block('Time off'); } return f.apply(this, arguments); }; });
  }
}
var SWN = 0;
var PAY_RX = /\b(my pay\b|pay ?stubs?|payroll|paycheck|pay check|pto\b|paid time off|time off|call(?:ed)? in sick|sick (?:day|pay|leave)|commissions?\b|benefits?\b|w-?2\b|w-?4\b|team pay|pending pay|pay record|my pay record)/i;
function sweep(){
  var on = meIs(), root = D.documentElement;
  if (root.classList.contains('gc-1099') !== on) root.classList.toggle('gc-1099', on);
  if (!on) {
    Array.prototype.forEach.call(D.querySelectorAll('[data-gc1099-hid]'), function(el){ el.style.display = el.getAttribute('data-gc1099-hid') === '-' ? '' : el.getAttribute('data-gc1099-hid'); el.removeAttribute('data-gc1099-hid'); });
    return;
  }
  var L = D.querySelectorAll('button,a,[role="button"],[role="menuitem"],[data-ra-a],[data-m],.gc-ra-item,.gc-hub-item,li');
  for (var i = 0; i < L.length; i++) {
    var el = L[i]; if (el.hasAttribute('data-gc1099-hid') || el.closest('#gc1099-cant,.gc1099-card,#gc-to-toast,#gc1099-toast')) continue;
    var t = s(el.textContent); if (!t || t.length > 70 || !PAY_RX.test(t)) continue;
    if (/can.t make it|hours on site|invoice/i.test(t)) continue;
    el.setAttribute('data-gc1099-hid', el.style.display || '-'); el.style.display = 'none';
  }
  /* a "PENDING PAY" figure on the desk dashboard (the tile around the label) — every 4th tick (a phone's lighter) */
  if ((SWN = (SWN + 1) % 4) !== 1) return;
  var tiles = D.querySelectorAll('#root div');
  for (var j = 0; j < tiles.length && j < 6000; j++) {
    var d = tiles[j]; if (d.children.length || !/^(pending pay|my pay|commission(s)?( owed)?)$/i.test(s(d.textContent))) continue;
    var box = d.parentElement; if (!box || box.hasAttribute('data-gc1099-hid') || s(box.textContent).length > 60) continue;
    box.setAttribute('data-gc1099-hid', box.style.display || '-'); box.style.display = 'none';
  }
}
function css(){
  if (D.getElementById('gc1099-css')) return;
  var st = D.createElement('style'); st.id = 'gc1099-css';
  st.textContent = '.gc1099-card{border:1px solid #fcd34d;background:#fffbeb;border-radius:10px;padding:10px 12px;margin:0 0 12px;font:13px/1.45 Arial,sans-serif;color:#1f2937}'
    + '.gc1099-card .hd{font-weight:800;font-size:14px;margin-bottom:6px;color:#92400e}.gc1099-card .hd span{font-weight:600;font-size:11px;color:#a16207;margin-left:6px}'
    + '.gc1099-card .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px 12px;margin-bottom:6px}.gc1099-card .grid .warn{color:#b45309;font-weight:700}'
    + '.gc1099-card .row{font-size:12px;color:#4b5563;margin:4px 0}.gc1099-card .bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}'
    + '.gc1099-card .bt button{border:1px solid #d97706;background:#fff;color:#92400e;border-radius:7px;padding:6px 10px;font:700 12px Arial;cursor:pointer;min-height:32px}'
    + '.gc1099-m{display:inline-block;width:18px;text-align:center;font-weight:900}.gc1099-m.ok{color:#15803d}.gc1099-m.no{color:#b91c1c}'
    + '.gc1099-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483000;display:flex;align-items:flex-end;justify-content:center}'
    + '.gc1099-sh{background:#fff;color:#0f172a;width:100%;max-width:520px;border-radius:14px 14px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));font:15px/1.4 Arial,sans-serif;box-sizing:border-box}'
    + '.gc1099-sh .hd{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:17px;margin-bottom:8px}.gc1099-sh .hd button{border:0;background:none;font-size:20px;min-width:44px;min-height:44px;cursor:pointer}'
    + '.gc1099-sh .note{font-size:13px;color:#475569;margin-bottom:8px}.gc1099-sh label{display:block;font-size:12px;font-weight:700;color:#334155;margin:6px 0 3px}'
    + '.gc1099-sh input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px}.gc1099-sh .err{color:#b91c1c;font-size:13px;min-height:18px;margin:6px 0}'
    + '.gc1099-sh .go{width:100%;min-height:48px;border:0;border-radius:10px;background:#b45309;color:#fff;font:800 16px Arial;cursor:pointer}'
    + '#gc1099-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);max-width:92vw;background:#1e293b;color:#fff;padding:10px 14px;border-radius:10px;font:14px Arial;z-index:2147483600;display:none;box-shadow:0 6px 20px rgba(0,0,0,.3)}#gc1099-toast.bad{background:#991b1b}';
  (D.head || D.documentElement).appendChild(st);
}
function tick(){ try { css(); guard(); sweep(); paintCards(); } catch (e) { warn(e); } }
RI.call(W, function(){ if (!D.hidden) tick(); }, 1000);
later(tick, 300);

W._gc1099 = { is: function(u){ return is1099(userBy(u) || u); }, meIs: meIs, skipPay: skipPay, punchTag: punchTag, saved: saved, link: link, paperwork: paperwork, vendorFor: function(u){ return vendorFor(userBy(u) || u); },
  cant: cantSheet, state: function(){ return { me: meEmail(), meIs: meIs(), links: JSON.parse(JSON.stringify(LINKS)), last: LAST, lastCant: LAST_CANT }; } };
try { console.log('[GC] 🧾 1099 contractor staff (patch SUP1099): _gc1099.state()'); } catch (e) {}
})(window, document);
