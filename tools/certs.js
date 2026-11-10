/* patch CERTS — 📜 Certifications: every license and certification the company and each employee hold, with the exact
   expiration date, the date to apply for renewal by, how often it renews, the fee, what renewal needs, and a log of every
   payment (owner 11/10: "make sure in my crm i dont miss when i have to renew certs … exact dates … all payments and renewal
   fees too … have a spot for me to enter admin and employees certs").
   Where: Forms & Docs → 🎓 Training → 📜 Certifications (admins; the button sits beside 👥 Team progress); To-Do items open it
   too. window._gcCerts.open().
   Data: gc_kv gc_certs = { list: [cert], updatedAt }, read-merge-write by id (two computers agree).
     cert = { id, holderType: 'company'|'person', holder (e-mail or 'company'), holderName, name, issuer, number, state, issued,
              expires, leadDays (apply this many days before it expires), cycleMonths, fee (number), feeNote, requirements,
              renewUrl, notes, fileRef, fileName, payments: [{ id, date, amount, method, conf, note, by }], archived, updatedAt }
   First open by an admin with nothing saved: GrayCo's own licenses and firm certifications are added from the templates below
   with blank dates ("date needed"), so they only need the dates and numbers filled in.
   Reminders: To-Do for admins here (anything to renew within 90 days of its apply-by date, past it, expired, or missing a
   date), and the daily server run (gc-portal-daily → gcp.certRun) e-mails admins + office at 90 / 60 / 30 / 7 days before the
   apply-by date, on it, and once expired. Fees and rules are from the issuing agencies' pages (11/10/26): check them on renewal. */
(function(){
'use strict';
if (window.__GC_PATCH_CERTS__) return; window.__GC_PATCH_CERTS__ = true;
var W = window, D = document, KEY = 'gc_certs';
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function isObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowISO(){ return new Date().toISOString(); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function ymd(v){ var t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function uid(){ return 'CERT' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function warn(e){ try { console.warn('[GC CERTS]', e && e.message || e); } catch (x) {} }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function usd(n){ return '$' + Math.round(num(n)).toLocaleString('en-US'); }
function addDays(d, n){ var t = Date.parse(ymd(d) + 'T12:00:00Z'); return isNaN(t) ? '' : new Date(t + n * 864e5).toISOString().slice(0, 10); }
function addMonths(d, m){ var t = ymd(d); if (!t || !m) return ''; var y = +t.slice(0, 4), mo = +t.slice(5, 7) - 1 + (+m), da = +t.slice(8, 10); var x = new Date(Date.UTC(y + Math.floor(mo / 12), ((mo % 12) + 12) % 12, 1)); var last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(da, last)); return x.toISOString().slice(0, 10); }
function daysTo(d){ var t = Date.parse(ymd(d) + 'T12:00:00Z'), n = Date.parse(today() + 'T12:00:00Z'); return isNaN(t) ? null : Math.round((t - n) / 864e5); }
function fmt(d){ var t = ymd(d); if (!t) return ''; try { return new Date(t + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return t; } }
function cycleText(m){ m = +m || 0; if (!m) return 'See certificate'; if (m % 12 === 0) { var y = m / 12; return y === 1 ? 'Every year' : 'Every ' + y + ' years'; } return 'Every ' + m + ' months'; }
function me(){
  try { if (W._gcMeNow && W._gcMeNow.email) return W._gcMeNow; } catch (e) {}
  var n = ''; try { n = s(localStorage.getItem('grayco_user')); } catch (e) {}
  var j = null; try { j = JSON.parse(n); } catch (e) {}
  if (isObj(j)) return j;
  return { name: n, email: '' };
}
function isAdmin(){
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  try { if (W.__GC_AUTH__ && typeof W.__GC_AUTH__.isAdmin === 'function') return !!W.__GC_AUTH__.isAdmin(); } catch (e) {}
  var u = me(); return /^admin$/i.test(s(u.role)) || low(u.payType) === 'owner';
}
function staff(){
  var u = arr(((W._crm || {}).users) || []).filter(function(x){ return x && x.active !== false && /@/.test(s(x.email)); });
  var seen = {}; return u.filter(function(x){ var k = low(x.email); if (seen[k]) return false; seen[k] = 1; return true; }).sort(function(a, b){ return s(a.name).localeCompare(s(b.name)); });
}
function sb(k){ try { return Promise.resolve(W._ehSb ? W._ehSb(k) : null).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }, function(){ return null; }); } catch (e) { return Promise.resolve(null); } }
function put(k, v){ try { var f = W._supaUpsertNow || W._supaUpsert; return Promise.resolve(f ? f(k, v) : null); } catch (e) { return Promise.resolve(null); } }
function lsGet(k, d){ try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function toast(m, bad){ try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = m; t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1000060;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 14px Inter,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)'; D.body.appendChild(t); later(function(){ t.remove(); }, 4200); } catch (e) {} }

/* ── what GrayCo holds, and what employees commonly hold ── */
var TEMPLATES = [
  { t: 'tn_lic', holderType: 'company', name: 'Tennessee contractor license (BC)', issuer: 'TN Board for Licensing Contractors', state: 'TN', number: '85034', leadDays: 30, cycleMonths: 24, fee: 200, feeNote: '$200; $20 per month late', requirements: 'Renewal due 30 days before expiration (notice mailed ~90 days before). No grace period to work while expired; 12 months to renew before a new application is needed. Financial statement: CPA-compiled for limits over $1.5M (GrayCo is $3M).', renewUrl: 'https://www.tn.gov/commerce/regboards/contractor.html' },
  { t: 'ar_lic', holderType: 'company', name: 'Arkansas commercial contractor license', issuer: 'AR Contractors Licensing Board', state: 'AR', number: '0486990627', leadDays: 30, cycleMonths: 12, fee: 0, feeNote: 'Check the renewal notice', requirements: 'Expires at midnight the day before the anniversary of the issue date unless the Board sets another date.', renewUrl: 'https://aclb-olr.ark.org/app/login.html' },
  { t: 'ms_lic', holderType: 'company', name: 'Mississippi commercial contractor certificate', issuer: 'MS State Board of Contractors', state: 'MS', number: '27769', leadDays: 30, cycleMonths: 12, fee: 400, feeNote: '$400; $450 once expired', requirements: 'Due yearly by the issue date. Expired more than 180 days = new application.', renewUrl: 'https://www.msboc.us/' },
  { t: 'epa_rrp_firm', holderType: 'company', name: 'EPA RRP Lead-Safe Certified Firm (TN & AR)', issuer: 'US EPA', state: 'TN/AR', leadDays: 90, cycleMonths: 60, fee: 300, feeNote: '$300', requirements: 'Apply for recertification at least 90 days before it expires.', renewUrl: 'https://www.epa.gov/lead/renovation-repair-and-painting-program-firm-certification' },
  { t: 'mdeq_firm', holderType: 'company', name: 'MDEQ lead-based paint firm certification (MS)', issuer: 'Mississippi DEQ', state: 'MS', leadDays: 30, cycleMonths: 12, fee: 350, feeNote: '$350 renovation or abatement; $500 both', requirements: 'Valid one year; reapply every year.', renewUrl: 'https://www.mdeq.ms.gov/lead-based-paint-certification-and-accreditation/' },
  { t: 'tdec_firm', holderType: 'company', name: 'TDEC lead-based paint abatement firm (TN)', issuer: 'TN Dept. of Environment & Conservation', state: 'TN', leadDays: 60, cycleMonths: 36, fee: 0, feeNote: 'Check TDEC fee schedule', requirements: 'Three-year certification period.', renewUrl: 'https://www.tn.gov/environment/program-areas/solid-waste/toxic-substances/lead-hazard-program/lead-certification.html' },
  { t: 'adh_firm', holderType: 'company', name: 'ADH lead-based paint contractor license (AR)', issuer: 'Arkansas Dept. of Health', state: 'AR', leadDays: 30, cycleMonths: 12, fee: 1200, feeNote: '$1,200 per year (check)', requirements: 'Renewal application + exact fee by check, notarized disclosure, certificate of liability insurance, letter on certified employees, work practices and supervisor on site.', renewUrl: 'https://healthy.arkansas.gov/programs-services/licensing-military-member-licensure-permits-plan-reviews/lead-based-paint-program/' },
  { t: 'iicrc_firm', holderType: 'company', name: 'IICRC Certified Firm', issuer: 'IICRC', leadDays: 30, cycleMonths: 12, fee: 199, feeNote: '$199 per year', requirements: 'Every firm expires December 31; invoices go out from October. Technicians must be current and liability insurance up to date.', renewUrl: 'https://iicrc.org/IICRCCertifiedFirm/' },
  { t: 'haag_co', holderType: 'company', name: 'HAAG certification', issuer: 'Haag', leadDays: 30, cycleMonths: 0, fee: 0, feeNote: 'See certificate', requirements: 'Use the dates on the certificate.', renewUrl: 'https://haagglobal.com/' },
  { t: 'iicrc_tech', holderType: 'person', name: 'IICRC technician certification (WRT / FSRT / OCT …)', issuer: 'IICRC', leadDays: 30, cycleMonths: 12, fee: 0, feeNote: 'Billed by the certifications held (about $46–$58+)', requirements: 'Renew every year; 14 continuing-education hours (CECs) every 4 years (Master/Inspector: every 2 years).', renewUrl: 'https://iicrc.org/' },
  { t: 'rrp_renovator', holderType: 'person', name: 'EPA RRP Certified Renovator', issuer: 'EPA-accredited training provider', leadDays: 60, cycleMonths: 60, fee: 0, feeNote: 'Refresher course fee', requirements: 'Take the refresher before it expires: hands-on refresher = 5 years, online-only = 3 years. Lapsed = retake the 8-hour initial course.', renewUrl: 'https://www.epa.gov/lead' },
  { t: 'mdeq_ind', holderType: 'person', name: 'MDEQ lead renovator / supervisor / worker (MS)', issuer: 'Mississippi DEQ', state: 'MS', leadDays: 30, cycleMonths: 12, fee: 75, feeNote: 'Renovator $75 (first two in a firm free); supervisor $150; worker $35', requirements: 'Certification yearly; lead training refresher every 3 years.', renewUrl: 'https://www.mdeq.ms.gov/lead-based-paint-certification-and-accreditation/' },
  { t: 'tdec_ind', holderType: 'person', name: 'TDEC lead abatement supervisor / worker (TN)', issuer: 'TN Dept. of Environment & Conservation', state: 'TN', leadDays: 60, cycleMonths: 36, fee: 675, feeNote: 'Supervisor $675; worker $200', requirements: 'Three-year certification; apply at least 60 days before it expires.', renewUrl: 'https://www.tn.gov/environment/program-areas/solid-waste/toxic-substances/lead-hazard-program/lead-certification.html' },
  { t: 'adh_ind', holderType: 'person', name: 'ADH lead certification (AR individual)', issuer: 'Arkansas Dept. of Health', state: 'AR', leadDays: 30, cycleMonths: 12, fee: 0, feeNote: 'Check ADH', requirements: 'Annual certification.', renewUrl: 'https://healthy.arkansas.gov/programs-services/licensing-military-member-licensure-permits-plan-reviews/lead-based-paint-program/' },
  { t: 'haag_ind', holderType: 'person', name: 'HAAG Certified Inspector', issuer: 'Haag', leadDays: 30, cycleMonths: 0, fee: 0, feeNote: 'See certificate', requirements: 'Use the dates on the certificate.', renewUrl: 'https://haagglobal.com/' },
  { t: 'other', holderType: 'company', name: '', issuer: '', leadDays: 30, cycleMonths: 12, fee: 0, feeNote: '', requirements: '', renewUrl: '' }
];
var SEED = ['tn_lic', 'ar_lic', 'ms_lic', 'epa_rrp_firm', 'mdeq_firm', 'tdec_firm', 'adh_firm', 'iicrc_firm', 'haag_co'];
function tpl(t){ return TEMPLATES.filter(function(x){ return x.t === t; })[0] || TEMPLATES[TEMPLATES.length - 1]; }
function fromTpl(t, holder){
  var x = tpl(t), c = { id: uid(), tpl: x.t, holderType: x.holderType, holder: x.holderType === 'company' ? 'company' : '', holderName: x.holderType === 'company' ? 'GrayCo' : '', name: x.name, issuer: x.issuer, number: x.number || '', state: x.state || '',
    issued: '', expires: '', leadDays: x.leadDays, cycleMonths: x.cycleMonths, fee: x.fee || 0, feeNote: x.feeNote || '', requirements: x.requirements || '', renewUrl: x.renewUrl || '', notes: '', payments: [], archived: false, updatedAt: nowISO() };
  if (holder) { c.holder = low(holder.email); c.holderName = s(holder.name); }
  return c;
}

/* ── the list ── */
var LIST = arr((lsGet('gc_certs_cache', {}) || {}).list);
var LOADED = false;
function live(){ return LIST.filter(function(c){ return c && c.id && !c.archived; }); }
function load(){
  return sb(KEY).then(function(v){
    var o = isObj(v) ? v : null;
    if (o) { LIST = arr(o.list); lsSet('gc_certs_cache', { list: LIST }); }
    LOADED = true; bust(); return o;
  }).catch(function(e){ warn(e); LOADED = true; return null; });
}
function save(mut){
  return sb(KEY).then(function(v){
    var cur = arr(isObj(v) ? v.list : LIST).slice();
    var out = mut(cur) || cur;
    var o = { list: out, updatedAt: nowISO() };
    LIST = out; lsSet('gc_certs_cache', { list: LIST }); bust();
    return put(KEY, o).then(function(){ return o; });
  });
}
function upsert(c){ c.updatedAt = nowISO(); return save(function(cur){ var i = cur.findIndex(function(x){ return x && x.id === c.id; }); if (i >= 0) cur[i] = c; else cur.push(c); return cur; }); }
function seedIfEmpty(o){
  if (o && arr(o.list).length) return Promise.resolve(false);
  if (!isAdmin()) return Promise.resolve(false);
  var add = SEED.map(function(t){ return fromTpl(t); });
  var wes = staff().filter(function(u){ return /wesley/i.test(s(u.name)) || /^wjohnson@/i.test(s(u.email)); })[0];
  if (wes) { var w = fromTpl('iicrc_tech', wes); w.name = 'IICRC WRT (Water Restoration Technician)'; add.push(w); }
  return save(function(cur){ return cur.length ? cur : add; }).then(function(){ return true; });
}

/* ── status ── */
function applyBy(c){ var e = ymd(c.expires); return e ? addDays(e, -Math.max(0, +c.leadDays || 0)) : ''; }
function status(c){
  var e = ymd(c.expires); if (!e) return { k: 'nodate', l: 'Date needed', o: 3, d: null };
  var dE = daysTo(e), dA = daysTo(applyBy(c));
  if (dE < 0) return { k: 'expired', l: 'Expired ' + (-dE) + ' d ago', o: 0, d: dE };
  if (dA <= 0) return { k: 'now', l: 'Renew now', o: 1, d: dA };
  if (dA <= 90) return { k: 'soon', l: 'Apply in ' + dA + ' d', o: 2, d: dA };
  return { k: 'ok', l: 'Current', o: 4, d: dA };
}
function sorted(list){ return list.slice().sort(function(a, b){ var x = status(a), y = status(b); return x.o - y.o || (x.d == null ? 1e9 : x.d) - (y.d == null ? 1e9 : y.d) || s(a.name).localeCompare(s(b.name)); }); }

/* ── To-Do (admins) ── */
function bust(){ try { if (W._gcBustTodoCache) W._gcBustTodoCache(); } catch (e) {} }
W._gcTodoExt = arr(W._gcTodoExt);
W._gcTodoExt.push(function(){
  try {
    if (!isAdmin()) return [];
    var out = [], L = live(), u = me();
    L.forEach(function(c){
      var st = status(c); if (st.k === 'ok' || st.k === 'nodate') return;
      out.push({ key: 'cert:' + c.id + ':' + ymd(c.expires), cat: 'jobs', thing: 'cert|' + c.id, prio: st.k === 'soon' && st.d > 30 ? 'med' : 'high', due: st.k === 'soon' ? applyBy(c) : today(),
        title: '📜 ' + (st.k === 'expired' ? 'EXPIRED: ' : st.k === 'now' ? 'Renew now: ' : 'Renew by ' + fmt(applyBy(c)) + ': ') + s(c.name) + ' (' + (s(c.holderName) || 'GrayCo') + ')',
        sub: 'Expires ' + fmt(c.expires) + (c.fee ? ' · fee ' + usd(c.fee) : (s(c.feeNote) ? ' · ' + s(c.feeNote) : '')), who: [s(u.name)], vis: 'who', act: { l: '📜 Open', f: function(){ open_(c.id); } } });
    });
    var nd = L.filter(function(c){ return !ymd(c.expires); }).length;
    if (nd) out.push({ key: 'cert:nodate', cat: 'jobs', thing: 'cert|nodate', prio: 'med', due: today(), title: '📜 Enter the expiration dates for ' + nd + ' certification' + (nd === 1 ? '' : 's'), sub: 'So the CRM can warn you 90 days before each renewal.', who: [s(u.name)], vis: 'who', act: { l: '📜 Open', f: function(){ open_(); } } });
    return out;
  } catch (e) { warn(e); return []; }
});

/* ── the look ── */
(function css(){
  if (D.getElementById('gc-certs-css')) return;
  var st = D.createElement('style'); st.id = 'gc-certs-css';
  st.textContent = [
    '.gcc-ov{position:fixed;inset:0;z-index:1000040;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}',
    '.gcc-dlg{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:1120px;padding:18px 20px;font:14px/1.45 Inter,Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3)}',
    '.gcc-dlg.sm{max-width:640px}',
    '.gcc-h{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}',
    '.gcc-h b{font-size:18px}',
    '.gcc-btn{border:1px solid #cbd5e1;background:#fff;color:#0f2440;border-radius:9px;padding:7px 12px;font:600 13px Inter,Arial,sans-serif;cursor:pointer}',
    '.gcc-btn.pri{background:#0f2440;color:#fff;border-color:#0f2440}',
    '.gcc-btn.sm{padding:4px 9px;font-size:12px}',
    '.gcc-stats{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}',
    '.gcc-stat{flex:1;min-width:140px;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px}',
    '.gcc-stat .n{font-size:22px;font-weight:800;color:#0f2440}.gcc-stat .l{font-size:12px;color:#64748b}',
    '.gcc-stat.red .n{color:#b91c1c}.gcc-stat.amb .n{color:#b45309}',
    '.gcc-tabs{display:flex;gap:6px;margin:4px 0 10px;flex-wrap:wrap}',
    '.gcc-tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 13px;font:700 13px Inter,Arial,sans-serif;cursor:pointer;color:#0f2440}',
    '.gcc-tabs button[aria-pressed=true]{background:#0f2440;color:#fff;border-color:#0f2440}',
    '.gcc-tbl{overflow-x:auto}.gcc-tbl table{width:100%;border-collapse:collapse;font-size:13px}',
    '.gcc-tbl th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;padding:6px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap}',
    '.gcc-tbl td{padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:top}',
    '.gcc-tbl td.nw{white-space:nowrap}',
    '.gcc-sub{font-size:12px;color:#64748b}',
    '.gcc-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700;white-space:nowrap}',
    '.gcc-pill.expired{background:#fee2e2;color:#991b1b}.gcc-pill.now{background:#ffedd5;color:#9a3412}.gcc-pill.soon{background:#fef3c7;color:#92400e}.gcc-pill.ok{background:#dcfce7;color:#14532d}.gcc-pill.nodate{background:#e2e8f0;color:#334155}',
    '.gcc-sec{margin:14px 0 6px;font-weight:800;color:#0f2440}',
    '.gcc-f{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:12px}',
    '.gcc-f label{display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:3px}',
    '.gcc-f input,.gcc-f select,.gcc-f textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;font:14px Inter,Arial,sans-serif}',
    '.gcc-f .full{grid-column:1/-1}',
    '.gcc-help{font-size:12px;color:#64748b;margin-top:3px}',
    '@media (max-width:640px){.gcc-f{grid-template-columns:1fr}}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
})();

/* ── the main window ── */
var UI = { tab: 'company', focus: '' };
function row(c){
  var st = status(c), last = arr(c.payments).slice(-1)[0];
  return '<tr data-gcc-row="' + esc(c.id) + '"' + (UI.focus === c.id ? ' style="background:#fffbeb"' : '') + '>' +
    '<td><span class="gcc-pill ' + st.k + '">' + esc(st.l) + '</span></td>' +
    '<td><b>' + esc(c.name || '(no name)') + '</b>' + (s(c.number) ? ' <span class="gcc-sub">#' + esc(c.number) + '</span>' : '') + '<div class="gcc-sub">' + esc(s(c.issuer)) + (s(c.state) ? ' · ' + esc(c.state) : '') + '</div></td>' +
    (UI.tab === 'people' ? '<td class="nw">' + esc(c.holderName || c.holder) + '</td>' : '') +
    '<td class="nw">' + (ymd(c.expires) ? '<b>' + esc(fmt(c.expires)) + '</b>' : '<span class="gcc-sub">—</span>') + '</td>' +
    '<td class="nw">' + (ymd(c.expires) ? esc(fmt(applyBy(c))) + '<div class="gcc-sub">' + esc(+c.leadDays || 0) + ' d before</div>' : '<span class="gcc-sub">—</span>') + '</td>' +
    '<td class="nw">' + esc(cycleText(c.cycleMonths)) + '</td>' +
    '<td>' + (c.fee ? '<b>' + esc(usd(c.fee)) + '</b>' : '') + (s(c.feeNote) && (!c.fee || s(c.feeNote) !== usd(c.fee)) ? '<div class="gcc-sub">' + esc(c.feeNote) + '</div>' : '') + (last ? '<div class="gcc-sub">Paid ' + esc(fmt(last.date)) + ' ' + esc(usd(last.amount)) + '</div>' : '') + '</td>' +
    '<td class="nw"><button type="button" class="gcc-btn sm pri" data-gcc="renew" data-id="' + esc(c.id) + '">✓ Renewed / paid</button> <button type="button" class="gcc-btn sm" data-gcc="edit" data-id="' + esc(c.id) + '">✏️ Edit</button>' + (c.fileRef ? ' <button type="button" class="gcc-btn sm" data-gcc="file" data-id="' + esc(c.id) + '">📄</button>' : '') + '</td></tr>';
}
function table(list, people){
  if (!list.length) return '<p class="gcc-sub">Nothing here yet.</p>';
  return '<div class="gcc-tbl"><table><thead><tr><th>Status</th><th>Certification / license</th>' + (people ? '<th>Employee</th>' : '') + '<th>Expires</th><th>Apply by</th><th>Renews</th><th>Fee</th><th></th></tr></thead><tbody>' + sorted(list).map(row).join('') + '</tbody></table></div>';
}
function payments(){
  var all = [];
  live().forEach(function(c){ arr(c.payments).forEach(function(p){ all.push({ c: c, p: p }); }); });
  all.sort(function(a, b){ return s(b.p.date).localeCompare(s(a.p.date)); });
  var byYear = {}; all.forEach(function(x){ var y = s(x.p.date).slice(0, 4) || '—'; byYear[y] = (byYear[y] || 0) + num(x.p.amount); });
  var up = live().filter(function(c){ var d = daysTo(c.expires); return ymd(c.expires) && d != null && d <= 365; }).sort(function(a, b){ return s(applyBy(a)).localeCompare(s(applyBy(b))); });
  var upTot = up.reduce(function(a, c){ return a + num(c.fee); }, 0);
  var h = '<div class="gcc-sec">Upcoming renewal fees (next 12 months): ' + esc(usd(upTot)) + '</div>';
  h += up.length ? '<div class="gcc-tbl"><table><thead><tr><th>Apply by</th><th>Certification</th><th>Holder</th><th>Fee</th></tr></thead><tbody>' + up.map(function(c){ return '<tr><td class="nw">' + esc(fmt(applyBy(c))) + '</td><td>' + esc(c.name) + '</td><td>' + esc(c.holderName || 'GrayCo') + '</td><td>' + (c.fee ? esc(usd(c.fee)) : esc(c.feeNote || '')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="gcc-sub">None with a date in the next 12 months.</p>';
  h += '<div class="gcc-sec">Payments made</div>' + (Object.keys(byYear).length ? '<p class="gcc-sub">' + Object.keys(byYear).sort().reverse().map(function(y){ return '<b>' + esc(y) + ':</b> ' + esc(usd(byYear[y])); }).join(' · ') + '</p>' : '');
  h += all.length ? '<div class="gcc-tbl"><table><thead><tr><th>Date</th><th>Certification</th><th>Holder</th><th>Amount</th><th>Method</th><th>Confirmation</th><th>Note</th></tr></thead><tbody>' + all.map(function(x){ return '<tr><td class="nw">' + esc(fmt(x.p.date)) + '</td><td>' + esc(x.c.name) + '</td><td>' + esc(x.c.holderName || 'GrayCo') + '</td><td class="nw"><b>' + esc(usd(x.p.amount)) + '</b></td><td>' + esc(x.p.method || '') + '</td><td>' + esc(x.p.conf || '') + '</td><td>' + esc(x.p.note || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="gcc-sub">No payments logged yet. Use "✓ Renewed / paid" on a certification.</p>';
  return h;
}
function render(ov){
  var L = live(), co = L.filter(function(c){ return c.holderType !== 'person'; }), pe = L.filter(function(c){ return c.holderType === 'person'; });
  var n = { exp: 0, now: 0, soon: 0, nd: 0 }; L.forEach(function(c){ var k = status(c).k; if (k === 'expired') n.exp++; else if (k === 'now') n.now++; else if (k === 'soon') n.soon++; else if (k === 'nodate') n.nd++; });
  var fees = L.filter(function(c){ var d = daysTo(c.expires); return ymd(c.expires) && d != null && d <= 365; }).reduce(function(a, c){ return a + num(c.fee); }, 0);
  var h = '<div class="gcc-h"><b>📜 Certifications &amp; licenses</b><span><button type="button" class="gcc-btn pri" data-gcc="add">＋ Add certification</button> <button type="button" class="gcc-btn" data-gcc="close">✕</button></span></div>' +
    '<div class="gcc-sub" style="margin-top:4px">Every license and certification GrayCo and each employee hold. The CRM e-mails admins and the office and adds a To-Do 90, 60, 30 and 7 days before each "apply by" date, on it, and if anything expires.</div>' +
    '<div class="gcc-stats"><div class="gcc-stat red"><div class="n">' + n.exp + '</div><div class="l">Expired</div></div><div class="gcc-stat amb"><div class="n">' + (n.now + n.soon) + '</div><div class="l">Renew within 90 days</div></div><div class="gcc-stat"><div class="n">' + n.nd + '</div><div class="l">Missing a date</div></div><div class="gcc-stat"><div class="n">' + esc(usd(fees)) + '</div><div class="l">Fees due next 12 months</div></div></div>' +
    '<div class="gcc-tabs">' + [['company', '🏢 Company (' + co.length + ')'], ['people', '👷 Employees (' + pe.length + ')'], ['pay', '💵 Payments & fees']].map(function(t){ return '<button type="button" data-gcctab="' + t[0] + '" aria-pressed="' + (UI.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
  if (UI.tab === 'company') h += table(co, false);
  else if (UI.tab === 'people') {
    h += table(pe, true);
  } else h += payments();
  h += '<div class="gcc-sub" style="margin-top:12px">Renewal rules and fees come from each agency\'s website as of Nov 2026. Check the renewal notice each time and update the fee here if it changed.</div>';
  ov.querySelector('.gcc-dlg').innerHTML = h;
}
var OV = null;
function open_(focusId){
  if (!isAdmin()) { toast('Only admins can open Certifications.', true); return; }
  if (OV) { OV.remove(); OV = null; }
  UI.focus = s(focusId);
  if (focusId) { var c = LIST.filter(function(x){ return x && x.id === focusId; })[0]; if (c) UI.tab = c.holderType === 'person' ? 'people' : 'company'; }
  var ov = D.createElement('div'); ov.className = 'gcc-ov'; ov.setAttribute('data-gc-keep', '1'); ov.innerHTML = '<div class="gcc-dlg"><p>Loading…</p></div>';
  D.body.appendChild(ov); OV = ov;
  render(ov);
  load().then(function(o){ return seedIfEmpty(o); }).then(function(seeded){ if (seeded) toast('📜 GrayCo\'s licenses and firm certifications were added. Fill in the dates.'); if (OV === ov) render(ov); });
  ov.addEventListener('click', function(e){
    if (e.target === ov) { ov.remove(); OV = null; return; }
    var t = e.target.closest && e.target.closest('[data-gcc],[data-gcctab]'); if (!t) return;
    if (t.hasAttribute('data-gcctab')) { UI.tab = t.getAttribute('data-gcctab'); render(ov); return; }
    var a = t.getAttribute('data-gcc'), id = t.getAttribute('data-id'), c = LIST.filter(function(x){ return x && x.id === id; })[0];
    if (a === 'close') { ov.remove(); OV = null; return; }
    if (a === 'add') return editDlg(null);
    if (a === 'edit' && c) return editDlg(c);
    if (a === 'renew' && c) return renewDlg(c);
    if (a === 'file' && c && c.fileRef) openFile(c.fileRef);
  });
}
function rerender(){ if (OV) render(OV); }
function openFile(ref){
  Promise.resolve(W._gcFileUrl ? W._gcFileUrl(ref) : null).then(function(u){ if (!u) throw new Error('no link'); var w = W.open(u, '_blank'); if (!w) toast('Allow pop-ups to open the file.', true); }, function(){ toast('The file is not reachable yet.', true); }).catch(function(){ toast('The file is not reachable yet.', true); });
}
function storeFile(inp){
  var f = inp && inp.files && inp.files[0]; if (!f) return Promise.resolve(null);
  if (!W._gcStoreFile) return Promise.reject(new Error('the file store is not ready'));
  return W._gcStoreFile(f, { kind: 'doc', name: f.name }).then(function(meta){ if (!meta || !meta.ref) throw new Error('the file was not stored'); return { ref: meta.ref, fileName: f.name }; });
}

/* ── add / edit ── */
function editDlg(c){
  var isNew = !c, x = c ? JSON.parse(JSON.stringify(c)) : fromTpl(UI.tab === 'people' ? 'iicrc_tech' : 'other');
  var people = staff();
  var ov = D.createElement('div'); ov.className = 'gcc-ov'; ov.style.zIndex = '1000050'; ov.setAttribute('data-gc-keep', '1');
  var tplOpts = TEMPLATES.map(function(t){ return '<option value="' + esc(t.t) + '">' + esc(t.t === 'other' ? 'Something else (blank)' : (t.holderType === 'company' ? '🏢 ' : '👷 ') + t.name) + '</option>'; }).join('');
  var holderOpts = '<option value="company">🏢 GrayCo (the company)</option>' + people.map(function(u){ return '<option value="' + esc(low(u.email)) + '">👷 ' + esc(u.name || u.email) + '</option>'; }).join('');
  ov.innerHTML = '<div class="gcc-dlg sm"><div class="gcc-h"><b>' + (isNew ? '＋ Add a certification' : '✏️ ' + esc(x.name)) + '</b><button type="button" class="gcc-btn" data-x="1">✕</button></div>' +
    '<div class="gcc-f">' +
    (isNew ? '<div class="full"><label for="gcc-tpl">Start from</label><select id="gcc-tpl"><option value="">Choose a type…</option>' + tplOpts + '</select><div class="gcc-help">Fills in the issuer, how often it renews, the fee and what renewal needs.</div></div>' : '') +
    '<div class="full"><label for="gcc-holder">Who holds it</label><select id="gcc-holder">' + holderOpts + '</select></div>' +
    '<div class="full"><label for="gcc-name">Certification / license</label><input id="gcc-name"></div>' +
    '<div><label for="gcc-issuer">Issued by</label><input id="gcc-issuer"></div>' +
    '<div><label for="gcc-number">Number</label><input id="gcc-number"></div>' +
    '<div><label for="gcc-issued">Issued / last renewed</label><input id="gcc-issued" type="date"></div>' +
    '<div><label for="gcc-expires">Expires (exact date)</label><input id="gcc-expires" type="date"></div>' +
    '<div><label for="gcc-lead">Apply this many days before it expires</label><input id="gcc-lead" type="number" min="0" max="365"><div class="gcc-help" id="gcc-ab"></div></div>' +
    '<div><label for="gcc-cycle">Renews every (months)</label><input id="gcc-cycle" type="number" min="0" max="120"><div class="gcc-help">12 = yearly, 24 = every 2 years, 0 = see certificate</div></div>' +
    '<div><label for="gcc-fee">Renewal fee ($)</label><input id="gcc-fee" type="number" min="0" step="1"></div>' +
    '<div><label for="gcc-feenote">Fee notes (late fees etc.)</label><input id="gcc-feenote"></div>' +
    '<div class="full"><label for="gcc-req">What renewal needs</label><textarea id="gcc-req" rows="3"></textarea></div>' +
    '<div class="full"><label for="gcc-url">Where to renew (website)</label><input id="gcc-url" type="url"></div>' +
    '<div class="full"><label for="gcc-notes">Notes</label><textarea id="gcc-notes" rows="2"></textarea></div>' +
    '<div class="full"><label for="gcc-file">Certificate (PDF or photo)</label><input id="gcc-file" type="file" accept=".pdf,image/*">' + (x.fileName ? '<div class="gcc-help">On file: ' + esc(x.fileName) + '</div>' : '') + '</div>' +
    '</div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px;flex-wrap:wrap">' + (isNew ? '<span></span>' : '<button type="button" class="gcc-btn" data-del="1">🗄 Remove</button>') +
    '<span><button type="button" class="gcc-btn" data-x="1">Cancel</button> <button type="button" class="gcc-btn pri" data-save="1">Save</button></span></div></div>';
  D.body.appendChild(ov);
  var q = function(sel){ return ov.querySelector(sel); };
  function fill(){
    q('#gcc-holder').value = x.holderType === 'person' ? low(x.holder) : 'company';
    q('#gcc-name').value = x.name || ''; q('#gcc-issuer').value = x.issuer || ''; q('#gcc-number').value = x.number || '';
    q('#gcc-issued').value = ymd(x.issued); q('#gcc-expires').value = ymd(x.expires); q('#gcc-lead').value = +x.leadDays || 0; q('#gcc-cycle').value = +x.cycleMonths || 0;
    q('#gcc-fee').value = x.fee ? +x.fee : ''; q('#gcc-feenote').value = x.feeNote || ''; q('#gcc-req').value = x.requirements || ''; q('#gcc-url').value = x.renewUrl || ''; q('#gcc-notes').value = x.notes || '';
    hint();
  }
  function hint(){ var e = q('#gcc-expires').value, n = +q('#gcc-lead').value || 0; q('#gcc-ab').textContent = e ? 'Apply by ' + fmt(addDays(e, -n)) : ''; }
  fill();
  q('#gcc-expires').addEventListener('change', hint); q('#gcc-lead').addEventListener('input', hint);
  q('#gcc-issued').addEventListener('change', function(){ if (!q('#gcc-expires').value && +q('#gcc-cycle').value) { q('#gcc-expires').value = addMonths(q('#gcc-issued').value, +q('#gcc-cycle').value); hint(); } });
  if (isNew) q('#gcc-tpl').addEventListener('change', function(){ var t = q('#gcc-tpl').value; if (!t) return; var h = q('#gcc-holder').value; var keep = { id: x.id }; x = fromTpl(t); x.id = keep.id; if (x.holderType === 'person' && h !== 'company') { x.holder = h; } fill(); if (x.holderType === 'company') q('#gcc-holder').value = 'company'; });
  ov.addEventListener('click', function(e){
    if (e.target === ov || (e.target.getAttribute && e.target.getAttribute('data-x'))) { ov.remove(); return; }
    if (e.target.getAttribute && e.target.getAttribute('data-del')) {
      if (!e.target.getAttribute('data-sure')) { e.target.setAttribute('data-sure', '1'); e.target.textContent = 'Tap again to remove'; return; }
      x.archived = true; x.archivedAt = nowISO(); upsert(x).then(function(){ toast('🗄 Removed'); ov.remove(); rerender(); }); return;
    }
    if (!(e.target.getAttribute && e.target.getAttribute('data-save'))) return;
    var h = q('#gcc-holder').value, who = staff().filter(function(u){ return low(u.email) === h; })[0];
    x.holderType = h === 'company' ? 'company' : 'person'; x.holder = h; x.holderName = h === 'company' ? 'GrayCo' : s(who && who.name) || h;
    x.name = s(q('#gcc-name').value); x.issuer = s(q('#gcc-issuer').value); x.number = s(q('#gcc-number').value);
    x.issued = ymd(q('#gcc-issued').value); x.expires = ymd(q('#gcc-expires').value); x.leadDays = Math.max(0, Math.min(365, +q('#gcc-lead').value || 0)); x.cycleMonths = Math.max(0, Math.min(120, +q('#gcc-cycle').value || 0));
    x.fee = num(q('#gcc-fee').value); x.feeNote = s(q('#gcc-feenote').value); x.requirements = s(q('#gcc-req').value); x.renewUrl = s(q('#gcc-url').value); x.notes = s(q('#gcc-notes').value);
    if (!x.name) { toast('Give it a name.', true); return; }
    var btn = e.target; btn.disabled = true; btn.textContent = 'Saving…';
    storeFile(q('#gcc-file')).then(function(f){ if (f) { x.fileRef = f.ref; x.fileName = f.fileName; } return upsert(x); }).then(function(){ toast('📜 Saved'); ov.remove(); rerender(); }, function(er){ btn.disabled = false; btn.textContent = 'Save'; toast('Not saved: ' + s(er && er.message), true); });
  });
}

/* ── renewed / paid ── */
function renewDlg(c){
  var x = JSON.parse(JSON.stringify(c));
  var next = ymd(x.expires) && +x.cycleMonths ? addMonths(x.expires, +x.cycleMonths) : '';
  var ov = D.createElement('div'); ov.className = 'gcc-ov'; ov.style.zIndex = '1000050'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="gcc-dlg sm"><div class="gcc-h"><b>✓ Renewed / paid: ' + esc(x.name) + '</b><button type="button" class="gcc-btn" data-x="1">✕</button></div>' +
    '<div class="gcc-sub" style="margin-top:4px">' + esc(x.holderName || 'GrayCo') + (ymd(x.expires) ? ' · expires ' + esc(fmt(x.expires)) : '') + '</div><div class="gcc-f">' +
    '<div><label for="gcr-date">Date paid</label><input id="gcr-date" type="date"></div>' +
    '<div><label for="gcr-amt">Amount paid ($)</label><input id="gcr-amt" type="number" min="0" step="0.01"></div>' +
    '<div><label for="gcr-method">Paid by</label><select id="gcr-method"><option>Card</option><option>Check</option><option>ACH</option><option>Online</option><option>Other</option></select></div>' +
    '<div><label for="gcr-conf">Confirmation / check #</label><input id="gcr-conf"></div>' +
    '<div class="full"><label for="gcr-exp">New expiration date</label><input id="gcr-exp" type="date"><div class="gcc-help">' + (next ? 'Filled in from the renewal cycle (' + esc(cycleText(x.cycleMonths).toLowerCase()) + '). Change it to match the new certificate.' : 'Enter the date on the new certificate.') + '</div></div>' +
    '<div class="full"><label for="gcr-note">Note</label><input id="gcr-note"></div>' +
    '<div class="full"><label for="gcr-file">New certificate (optional)</label><input id="gcr-file" type="file" accept=".pdf,image/*"></div>' +
    '<div class="full"><label><input id="gcr-only" type="checkbox"> Payment only (not renewed yet; keep the current expiration date)</label></div>' +
    '</div><div style="text-align:right;margin-top:14px"><button type="button" class="gcc-btn" data-x="1">Cancel</button> <button type="button" class="gcc-btn pri" data-save="1">Save</button></div></div>';
  D.body.appendChild(ov);
  var q = function(sel){ return ov.querySelector(sel); };
  q('#gcr-date').value = today(); q('#gcr-amt').value = x.fee ? +x.fee : ''; q('#gcr-exp').value = next;
  q('#gcr-only').addEventListener('change', function(){ q('#gcr-exp').disabled = q('#gcr-only').checked; });
  ov.addEventListener('click', function(e){
    if (e.target === ov || (e.target.getAttribute && e.target.getAttribute('data-x'))) { ov.remove(); return; }
    if (!(e.target.getAttribute && e.target.getAttribute('data-save'))) return;
    var only = q('#gcr-only').checked, exp = ymd(q('#gcr-exp').value);
    if (!only && !exp) { toast('Enter the new expiration date (or tick "Payment only").', true); return; }
    var amt = num(q('#gcr-amt').value);
    x.payments = arr(x.payments).concat([{ id: uid(), date: ymd(q('#gcr-date').value) || today(), amount: amt, method: s(q('#gcr-method').value), conf: s(q('#gcr-conf').value), note: s(q('#gcr-note').value), by: s(me().name), forExpires: ymd(x.expires) }]);
    if (!only) { x.issued = ymd(q('#gcr-date').value) || today(); x.expires = exp; }
    var btn = e.target; btn.disabled = true; btn.textContent = 'Saving…';
    storeFile(q('#gcr-file')).then(function(f){ if (f) { x.fileRef = f.ref; x.fileName = f.fileName; } return upsert(x); }).then(function(){ toast(only ? '💵 Payment logged' : '✅ Renewed: new expiration ' + fmt(exp)); ov.remove(); rerender(); }, function(er){ btn.disabled = false; btn.textContent = 'Save'; toast('Not saved: ' + s(er && er.message), true); });
  });
}

/* the 📜 Certifications button beside 👥 Team progress in Training (admins) */
D.addEventListener('click', function(e){ var b = e.target && e.target.closest ? e.target.closest('[data-gcc-open]') : null; if (!b) return; e.preventDefault(); e.stopPropagation(); open_(); }, true);

/* start: one read for the To-Do (admins only) */
later(function(){ if (isAdmin()) load(); }, 4000);
W._gcCerts = { open: open_, list: function(){ return live(); }, load: load, status: status, applyBy: applyBy, templates: TEMPLATES, _addMonths: addMonths };
try { console.log('[GC] 📜 Certifications (patch CERTS): _gcCerts'); } catch (e) {}
})();
