<script id="gc-patch-inboxnewjob">
/* __GC_PATCH_INBOXNEWJOB__ ════════════════════════════════════════════════════
   GrayCo — "＋ New job…" in the money inboxes' job pickers.   (patch INBOXNEWJOB)
   Office (Brittany, 11/05): "The job on the invoice says Enterprise. Need to be able to create a job."
   Owner: "need on office profile to be able to create projects for invoices that may come in without projects etc".

   • Every "pick the job" select for unplaced money (📥 Needs a job, 📧 Receipts e-mailed in, 💳/🏦 statement import,
     QuickBooks "needs a home") has "＋ New job…" (admins and the office only — never the crew: _gcCanCreateProject).
   • Picking it opens a small form: job name (from the PO / job text on the item), customer (optional, search the
     customers), type (Residential / Commercial / Insurance), address (optional), PO# (the item's PO, else the CRM's own
     auto-PO), status (Active by default). The job is made the way "＋ New project" makes one (patch CC2 newJob + addJob
     via _setProjects: the auto-PO, the sync, the customer link, the ⚡ automations and every new-job hook run as usual).
   • The new job is selected in the picker, so Save books the bill to it; 📥 Needs a job remembers the PO → job
     (gc_kv gc_money_rules "po:<PO>"), so the next bill with that PO lands there by itself.
   Console: _gcNewJobFor(selectEl) · _gcCanCreateProject()
   ═════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_INBOXNEWJOB__) return; window.__GC_PATCH_INBOXNEWJOB__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function me(){ try { if (typeof W._gcMeUser === 'function') return W._gcMeUser() || {}; } catch (e) {} try { return JSON.parse(localStorage.getItem('grayco_user') || '{}') || {}; } catch (e) { return {}; } }
function title(t){ t = s(t); return /^[A-Z0-9 &'.-]+$/.test(t) && /[A-Z]{2}/.test(t) ? t.toLowerCase().replace(/(^|[\s-])([a-z])/g, function(m, a, b){ return a + b.toUpperCase(); }) : t; }

/* who may make a job: the owners / admins and the office (Office, Office Admin, Office Manager) — not the crew */
W._gcCanCreateProject = function(){
  var u = me(), r = low(u.role), pf = low(u.profile);
  try { if (W._gcVAS && W._gcVAS.role && W._gcVAS.role()) { var va = low(W._gcVAS.role()); return /^(admin|office)/.test(va); } } catch (e) {}
  if (low(u.payType) === 'owner' || /^admin/.test(r) || /office/.test(r) || /office/.test(pf)) return true;
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  try { var S = W.__GC_AUTH__ && W.__GC_AUTH__.session && W.__GC_AUTH__.session(); if (S && S.roleKnown && /^(admin|office)/.test(low(S.role))) return true; } catch (e) {}
  return false;
};
W._gcNewJobOpt = function(){ try { return W._gcCanCreateProject() ? '<option value="__newjob">＋ New job…</option>' : ''; } catch (e) { return ''; } };

var TYPES = { Residential: 'Residential Reno', Commercial: 'Commercial Reno', Insurance: 'Insurance' };
/* the customers (Customers list first, then the jobs' customers not on it) */
function customers(){
  var seen = {}, out = [];
  arr(W._crm && W._crm.customers).forEach(function(c){ var n = s(c.name || c.company); if (!c.deleted && n && !seen[low(n)]) { seen[low(n)] = 1; out.push(c); } });
  arr(W._crm && W._crm.projects).forEach(function(p){ var n = s(p.client || p.customer); if (!p.deleted && n && !seen[low(n)]) { seen[low(n)] = 1; out.push({ name: n, phone: s(p.clientPhone), email: s(p.clientEmail), id: s(p.customerId) }); } });
  return out;
}
function autoPO(){ try { var used = arr(W._crm && W._crm.projects).map(function(p){ return p.autoPO || p.po; }).filter(Boolean); if (typeof W.nextPO === 'function') return W.nextPO(used); } catch (e) {} return ''; }

/* the form; resolves the new job (or null on Cancel) */
function form(pre){
  pre = pre || {};
  return new Promise(function(res){
    var old = D.getElementById('gc-inj-ov'); if (old) old.remove();
    var ov = D.createElement('div'); ov.id = 'gc-inj-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gc-linked', '1');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit';
    var I = 'display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:3px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px', L = 'display:block;font-size:12.5px;font-weight:700;color:#334155;margin-top:9px';
    var po = s(pre.po).toUpperCase(), auto = po ? '' : autoPO();
    ov.innerHTML = '<div role="dialog" aria-label="New job" style="background:#fff;color:#0f172a;border-radius:12px;width:min(460px,100%);padding:18px;margin-top:40px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">＋ New job</b><button type="button" data-j="x" aria-label="Close" style="border:none;background:none;font-size:20px;cursor:pointer">✕</button></div>' +
      (pre.from ? '<div style="font-size:12.5px;color:#475569;margin-top:2px">For ' + esc(pre.from) + '</div>' : '') +
      '<label style="' + L + '">Job name<input data-j="name" style="' + I + '" value="' + esc(pre.name) + '" autocomplete="off"></label>' +
      '<label style="' + L + '">Customer (optional)<input data-j="cust" list="gc-inj-custs" style="' + I + '" placeholder="Search the customers…" value="' + esc(pre.customer) + '" autocomplete="off"><datalist id="gc-inj-custs">' +
        customers().slice(0, 2000).map(function(c){ return '<option value="' + esc(c.name || c.company) + '">'; }).join('') + '</datalist></label>' +
      '<label style="' + L + '">Type<select data-j="type" style="' + I + '">' + Object.keys(TYPES).map(function(k){ return '<option' + (k === pre.type ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></label>' +
      '<label style="' + L + '">Address (optional)<input data-j="addr" style="' + I + '" value="' + esc(pre.address) + '" autocomplete="off"></label>' +
      '<label style="' + L + '">PO#' + (po ? ' (from the invoice)' : ' (the CRM\'s own)') + '<input data-j="po" style="' + I + '" value="' + esc(po || auto) + '" autocomplete="off"></label>' +
      '<label style="' + L + '">Status<select data-j="status" style="' + I + '"><option value="active" selected>Active</option><option value="bidding">Bidding</option></select></label>' +
      '<div data-j="err" role="alert" style="color:#b91c1c;font-size:12.5px;margin-top:8px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" data-j="ok" style="flex:1;padding:10px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">Create job</button>' +
      '<button type="button" data-j="x" style="padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer">Cancel</button></div></div>';
    D.body.appendChild(ov);
    var q = function(k){ return ov.querySelector('[data-j="' + k + '"]'); };
    ST.call(W, function(){ try { q('name').focus(); q('name').select(); } catch (e) {} }, 30);
    var done = function(v){ ov.remove(); res(v); };
    ov.addEventListener('click', function(ev){ var b = ev.target.closest && ev.target.closest('[data-j]'); if (ev.target === ov || (b && b.getAttribute('data-j') === 'x')) done(null); });
    q('ok').onclick = function(){
      var name = s(q('name').value), addr = s(q('addr').value), cn = s(q('cust').value), p = s(q('po').value).toUpperCase(), type = q('type').value;
      if (!name) { q('err').textContent = 'Type the job name.'; return; }
      if (p && arr(W._crm && W._crm.projects).some(function(x){ return !x.deleted && s(x.autoPO || x.po).toUpperCase() === p; })) { q('err').textContent = 'PO ' + p + ' is already a job — pick that job in the list instead.'; return; }
      if (typeof W._gcSelfAddJob !== 'function') { q('err').textContent = 'The CRM is still loading — try again in a moment.'; return; }
      var c = customers().filter(function(x){ return low(x.name || x.company) === low(cn); })[0];
      var extra = { autoPO: p || '', createdFrom: s(pre.from) || 'money inbox', commercial: type === 'Commercial' || undefined, insurance: type === 'Insurance' || undefined };
      if (pre.po && p === s(pre.po).toUpperCase()) extra.po = p;
      if (c) { extra.customerId = s(c.id); if (!addr) addr = s(c.address); }
      Object.keys(extra).forEach(function(k){ if (extra[k] === undefined || extra[k] === '') delete extra[k]; });
      var j = null;
      try { j = W._gcSelfAddJob({ name: name, client: c ? s(c.name || c.company) : cn, phone: c ? s(c.phone) : '', email: c ? s(c.email) : '', address: addr, type: TYPES[type] || type, kind: q('status').value === 'active' ? 'active' : '', extra: extra }, 'money inbox'); } catch (e) { q('err').textContent = 'Could not make the job: ' + (e && e.message || e); return; }
      done(j);
    };
  });
}

/* a select that was set to "＋ New job…": the form, then the new job is chosen in it */
W._gcNewJobFor = function(sel){
  var pre = { name: title(sel.getAttribute('data-gcnj-name') || sel.getAttribute('data-gcnj-po')), po: sel.getAttribute('data-gcnj-po') || '', address: sel.getAttribute('data-gcnj-addr') || '', customer: sel.getAttribute('data-gcnj-cust') || '', from: sel.getAttribute('data-gcnj-from') || '' };
  var prev = sel.getAttribute('data-gcnj-prev') || '';
  sel.value = ''; try { if ([].some.call(sel.options, function(o){ return o.value === prev; })) sel.value = prev; } catch (e) {}
  return form(pre).then(function(j){
    if (!j || !j.id) return null;
    var o = D.createElement('option'); o.value = s(j.id); o.textContent = (s(j.autoPO) ? 'PO ' + s(j.autoPO) + ' · ' : '') + s(j.name) + ' (new)';
    var nj = [].filter.call(sel.options, function(x){ return x.value === '__newjob'; })[0];
    if (nj && nj.parentNode) nj.parentNode.insertBefore(o, nj.nextSibling); else sel.appendChild(o);
    sel.value = s(j.id); sel.setAttribute('data-gcnj-made', s(j.id));
    try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    return j;
  });
};
D.addEventListener('focusin', function(ev){ var t = ev.target; if (t && t.tagName === 'SELECT' && t.value !== '__newjob') t.setAttribute('data-gcnj-prev', t.value); }, true);
D.addEventListener('change', function(ev){
  var t = ev.target; if (!t || t.tagName !== 'SELECT' || t.value !== '__newjob') return;
  ev.stopImmediatePropagation();
  W._gcNewJobFor(t);
}, true);
try { console.log('[GC] ＋ New job… in the money inboxes (patch INBOXNEWJOB)'); } catch (e) {}
})();
</script>
