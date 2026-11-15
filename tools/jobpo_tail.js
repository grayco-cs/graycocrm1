/* __GC_PATCH_JOBPO__ — 🧾 EXPENSES BY PO ON THE JOB (owner's sub portal plan, 11/15 list item 5.1c: "a PO column and filter on the job's
   expenses, and a per-sub total of PO spend on the job").
   Job page (desk), in the job's tools box: "🧾 Expenses by PO" (admins, the office and the job's PM — never crew or subs):
     · every expense on the job with its PO column (⚠ No PO · ⚠ not this job's PO) — date, vendor, who (the sub / the person), amount;
     · filters: PO (all · each PO seen · No PO) and who (all · each sub · our crew);
     · "PO spend by sub on this job": each sub's receipts on the job (amount, how many, how many without the PO) and, beside it,
       their sub invoices on the job.
   Read-only — fixing a PO stays in 🧾 No PO / Receipts & POs (patch POGUARD). API: window._gcJobPo = { rows(pid), bySub(pid), paint() } */
(function(W){
'use strict';
if (W.__GC_PATCH_JOBPO__) return; W.__GC_PATCH_JOBPO__ = true;
var D = W.document, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(v){ var n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function money(n){ return '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function crm(){ return W._crm || {}; }
function proj(pid){ return arr(crm().projects).find(function(p){ return s(p.id) === s(pid); }) || null; }
function me(){ try { return JSON.parse(localStorage.getItem('grayco_user') || '{}') || {}; } catch (e) { return {}; } }
function may(p){
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  var u = me(); if (/admin|office/i.test(s(u.role) + ' ' + s(u.profile)) || /owner/i.test(s(u.payType))) return true;
  return !!(p && s(u.name) && [p.pm, p.apm, p.assistantPm].some(function(x){ return low(x) === low(u.name); }));
}
function poOf(p){ return s(p && (p.po || p.autoPO)).toUpperCase(); }
function rows(pid){
  var p = proj(pid), mine = poOf(p), out = [];
  arr(crm().expenses).forEach(function(e){
    if (e.deleted || /void|reject/i.test(s(e.status))) return; if (s(e.pid || e.jobId) !== s(pid)) return;
    var po = s(e.po || e.poNumber).toUpperCase(), sub = s(e.sub || (e.subId ? e.payee : ''));
    out.push({ id: s(e.id), date: s(e.date).slice(0, 10), vendor: s(e.vendor || e.payee || e.desc).slice(0, 60), who: sub || s(e.by || e.submittedBy || e.enteredBy).replace(/\s*\((sub portal|field)\)$/i, ''), sub: sub, subId: s(e.subId), amt: num(e.amt != null ? e.amt : e.amount), po: po, flag: !po ? 'none' : (mine && po !== mine && !(p && arr(p.altPOs).some(function(x){ return s(x).toUpperCase() === po; })) ? 'other' : '') });
  });
  return out.sort(function(a, b){ return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
}
function bySub(pid){
  var m = {};
  rows(pid).forEach(function(r){ if (!r.sub) return; var k = low(r.sub); var x = m[k] || (m[k] = { sub: r.sub, rec: 0, n: 0, noPo: 0, inv: 0, ni: 0 }); x.rec += r.amt; x.n++; if (r.flag === 'none') x.noPo++; });
  var seen = {}; arr(crm().invoices).concat(arr(crm().invs)).forEach(function(i){ if (seen[i.id]) return; seen[i.id] = 1; if (s(i.pid) !== s(pid) || i.deleted || /void/i.test(s(i.status)) || !(s(i.type) === 'sub' || s(i.sub))) return; var nm = s(i.sub || i.vendor); if (!nm) return; var k = low(nm); var x = m[k] || (m[k] = { sub: nm, rec: 0, n: 0, noPo: 0, inv: 0, ni: 0 }); x.inv += num(i.amt != null ? i.amt : i.amount); x.ni++; });
  return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a, b){ return (b.rec + b.inv) - (a.rec + a.inv); });
}
var F = { pid: '', po: '', who: '' };
function html(p){
  var R = rows(p.id), S = bySub(p.id), pos = {}, subs = {}; R.forEach(function(r){ if (r.po) pos[r.po] = 1; if (r.sub) subs[r.sub] = 1; });
  var V = R.filter(function(r){ return (!F.po || (F.po === '__none' ? r.flag === 'none' : r.po === F.po)) && (!F.who || (F.who === '__crew' ? !r.sub : r.sub === F.who)); });
  var tot = 0; V.forEach(function(r){ tot += r.amt; });
  var TD = 'padding:5px 7px;border-bottom:1px solid #eef2f7', h = '<summary style="cursor:pointer;font-weight:800">🧾 Expenses by PO <span style="font-weight:400;color:#64748b">(' + R.length + ' · PO ' + esc(poOf(p) || '—') + ')</span></summary>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0"><label>PO <select data-jpo="po"><option value="">All</option>' + Object.keys(pos).sort().map(function(x){ return '<option' + (F.po === x ? ' selected' : '') + ' value="' + esc(x) + '">' + esc(x) + (x === poOf(p) ? ' (this job)' : '') + '</option>'; }).join('') + '<option value="__none"' + (F.po === '__none' ? ' selected' : '') + '>No PO</option></select></label>'
    + '<label>Who <select data-jpo="who"><option value="">All</option>' + Object.keys(subs).sort().map(function(x){ return '<option' + (F.who === x ? ' selected' : '') + ' value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('') + '<option value="__crew"' + (F.who === '__crew' ? ' selected' : '') + '>Our crew / office</option></select></label>'
    + '<span style="align-self:center;color:#475569">' + V.length + ' shown · ' + money(tot) + '</span></div>';
  h += '<div style="overflow-x:auto"><table data-jpo-t style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="' + TD + '">Date</th><th style="' + TD + '">Vendor</th><th style="' + TD + '">Who</th><th style="' + TD + ';text-align:right">Amount</th><th style="' + TD + '">PO</th></tr></thead><tbody>'
    + (V.length ? V.slice(0, 200).map(function(r){ return '<tr data-jpo-r="' + esc(r.id) + '"><td style="' + TD + '">' + esc(r.date) + '</td><td style="' + TD + '">' + esc(r.vendor) + '</td><td style="' + TD + '">' + esc(r.who) + '</td><td style="' + TD + ';text-align:right">' + money(r.amt) + '</td><td style="' + TD + '">' + (r.flag === 'none' ? '<span style="color:#b45309;font-weight:700">⚠ No PO</span>' : esc(r.po) + (r.flag === 'other' ? ' <span style="color:#b91c1c;font-weight:700">⚠ not this job\'s PO</span>' : '')) + '</td></tr>'; }).join('') : '<tr><td colspan="5" style="' + TD + ';color:#64748b">No expenses here.</td></tr>')
    + '</tbody></table></div>';
  h += '<div style="font-weight:800;margin:10px 0 4px">PO spend by sub on this job</div>' + (S.length ? '<table data-jpo-s style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="' + TD + '">Sub</th><th style="' + TD + ';text-align:right">Receipts on the PO</th><th style="' + TD + ';text-align:right">Sub invoices</th></tr></thead><tbody>'
    + S.map(function(x){ return '<tr data-jpo-sub="' + esc(x.sub) + '"><td style="' + TD + '">' + esc(x.sub) + '</td><td style="' + TD + ';text-align:right">' + money(x.rec) + ' <span style="color:#64748b">(' + x.n + (x.noPo ? ', ' + x.noPo + ' no PO' : '') + ')</span></td><td style="' + TD + ';text-align:right">' + money(x.inv) + ' <span style="color:#64748b">(' + x.ni + ')</span></td></tr>'; }).join('') + '</tbody></table>' : '<div style="color:#64748b">No sub receipts or invoices on this job yet.</div>');
  return h;
}
function findBack(){ var m = D.querySelector('main'); if (!m) return null; var bs = m.getElementsByTagName('button'); for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) return bs[i]; return null; }
function paint(){
  try {
    if (D.hidden || D.documentElement.classList.contains('_fieldmode')) return;
    var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, cur = D.getElementById('gc-jpo');
    if (!p || !may(p) || !rows(p.id).length && !bySub(p.id).length) { if (cur) cur.remove(); return; }
    var back = findBack(); if (!back || typeof W._gcJobBox !== 'function') return; var box = W._gcJobBox(back); if (!box) return;
    if (F.pid !== s(p.id)) { F = { pid: s(p.id), po: '', who: '' }; }
    var body = html(p);
    if (cur && cur.__b === body && cur.parentElement === box) return;
    if (cur && cur.contains(D.activeElement)) return;
    var open = cur ? cur.open : false;
    if (!cur) { cur = D.createElement('details'); cur.id = 'gc-jpo'; cur.setAttribute('data-gc-keep', '1'); cur.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin:8px 0;font:14px Inter,Arial,sans-serif;color:#0f172a'; }
    cur.innerHTML = body; cur.__b = body; cur.open = open; if (cur.parentElement !== box) box.appendChild(cur);
  } catch (e) {}
}
D.addEventListener('change', function(e){ var t = e.target; if (!t || !t.closest || !t.closest('#gc-jpo') || !t.hasAttribute('data-jpo')) return; F[t.getAttribute('data-jpo')] = t.value; var c = D.getElementById('gc-jpo'); if (c) c.__b = ''; t.blur(); paint(); }, true);
SI.call(W, paint, 1500);
W._gcJobPo = { rows: rows, bySub: bySub, paint: paint, html: html, filter: function(o){ Object.assign(F, o || {}); var c = D.getElementById('gc-jpo'); if (c) c.__b = ''; paint(); } };
})(window);
