/* __GC_PATCH_SUBINV__ — A SUB'S INVOICE E-MAILED IN, BOOKED BY ITSELF (owner 10/27)
   "when there's an invoice like this in office@ or invoices@: read the PDF, enter it into the job that its address matches,
   calculate the expense on the job's P&L, and create the invoice to pay — when it says we pay — automatically."
   The server reads each e-mailed invoice (Word, PDF, photo, Excel / CSV, Google link, typed in the e-mail) and decides
   (netlify/functions/_lib/subinv.js → gc_kv "gc_mail_money" rec.si). Here, with the CRM's own records:
     · route book  → ▥ Invoices: a received sub invoice on the job (type sub, status received, the file attached, the pay
                     date by the sub pay rule or the invoice's later terms, retainage per the subcontract) + ONE pending job
                     cost row (subInvId — the P&L never counts it twice) → the sub-invoice approval queue (the job's PM);
                     on approval the check is drafted for the pay date. Nothing is paid without approval.
     · match / dup / link / review → ✅ Approvals "🧾 Match this invoice" (top 3 jobs + a picker), "Possible duplicate",
                     "🔗 Open this invoice link" — the office books it or sets it aside. Done ones: gc_kv "gc_mail_money_done".
   JOB-COST APPROVAL ROUTING (owner 10/27): sub invoices and job expenses are asked of the job's PM; after 24 hours without
   the PM (or at once when the job has no PM) of the OFFICE. An admin is asked only when he is that job's PM (owner: "some job
   costs are definitely me or Nick because we will be the PM"), never as the extra / default approver; he can still approve any.
   patch OWNERTODO's makeInvoices calls take() / post(). API: window._gcSubInv = { take, post, load, items, place, dismiss,
   open, route } */
(function(){
'use strict';
if (window.__GC_PATCH_SUBINV__) return; window.__GC_PATCH_SUBINV__ = true;
var W = window, D = document;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v){ return '$' + r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects).filter(function(p){ return !p.deleted; }); }
function proj(pid){ return projects().filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
function me(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u) return u; } } catch (e) {} return {}; }
function myName(){ var u = me(); return s(u.name) || s(u.email).split('@')[0]; }
function isOffice(){ return /^office/i.test(s(me().role)) || /^office/i.test(s(me().profile)); }
function isAdminOnly(){ var u = me(); return !isOffice() && (/^admin$/i.test(s(u.role)) || low(u.payType) === 'owner'); }
function noOfficeUser(){ return !arr(crm().users).some(function(u){ return u.active !== false && /^office/i.test(s(u.role)); }); }
var DAY = 24 * 3600e3;

/* ── the cloud (gc_kv) — the same small reader / writer as patch OWNERTODO ── */
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function sbBase(){ return s(lsGet('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function kvGet(key){
  if (W._gcOT_kv) return Promise.resolve(W._gcOT_kv.get(key));
  var k = s(lsGet('grayco_sb_key')); if (!k) return Promise.resolve(undefined);
  return W.fetch(sbBase() + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: { apikey: k }, cache: 'no-store' })
    .then(function(r){ return r && r.ok ? r.json() : undefined; }).then(function(rows){ if (!Array.isArray(rows)) return undefined; var v = rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }, function(){ return undefined; });
}
function kvPut(key, value){
  if (W._gcOT_kv) { W._gcOT_kv.put(key, value); return Promise.resolve(true); }
  var k = s(lsGet('grayco_sb_key')); if (!k) return Promise.resolve(false);
  return W.fetch(sbBase() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
function markDone(id, val){
  S.done[id] = val;
  return kvGet('gc_mail_money_done').then(function(cur){ var m = obj(cur), x = m[id]; if (!x || s(val.at) >= s(x.at)) m[id] = val; return kvPut('gc_mail_money_done', m); });
}

var S = { list: [], done: {}, held: {} };
function load(list, done){ S.list = arr(list); S.done = obj(done); return S; }
function invIdOf(rec){ return 'INVM-' + s(rec.id).replace(/^MM-/, ''); }
function invNo(v){ return low(v).replace(/[^a-z0-9]/g, '').replace(/^0+/, ''); }

/* the received sub invoice for one e-mail (the same record shape as 📎 Upload Invoice / the sub portal) */
function makeInv(rec, o){
  var si = rec.si || {}, r = si.read || {}, f = arr(rec.files)[0] || {}, p = proj(o.pid) || {};
  var amt = r2(o.amt != null ? o.amt : r.total), retPct = num(o.retainagePct != null ? o.retainagePct : si.retainagePct);
  var ret = o.pid === (si.job && si.job.pid) && si.retainage ? r2(si.retainage) : (retPct ? r2(amt * retPct / 100) : 0);
  var recv = s(si.recvDate) || s(rec.at).slice(0, 10);
  var inv = { id: invIdOf(rec), mailId: rec.id, type: 'sub', pid: s(o.pid), sub: s(o.sub) || s(si.sub && si.sub.name) || rec.fromName || rec.from, subId: s(o.subId),
    po: s(p.autoPO || p.po) || s(r.po), amt: amt, invNum: s(r.invoiceNumber), recvDate: recv, date: s(r.invoiceDate) || recv, dueDate: s(r.dueDate), terms: s(r.terms),
    desc: 'Sub invoice' + (r.invoiceNumber ? ' #' + r.invoiceNumber : '') + ' — ' + (s(r.jobAddress) || s(p.name) || s(rec.subject)) + ' (e-mailed ' + (si.src === 'email body' ? 'in the e-mail' : s(si.src) || 'file') + ', read by the CRM)',
    lines: arr(r.lines), subtotal: r2(r.subtotal), tax: r2(r.tax), address: s(r.jobAddress) || s(p.address),
    status: 'received', source: 'email:' + (s(rec.via) || 'invoices@'), fileName: f.name || '', fileData: f.ref || '', files: arr(rec.files).map(function(z){ return { name: z.name, ref: z.ref, type: z.type }; }),
    fileLink: s(si.file && si.file.link), fromEmail: s(rec.from), forwardedBy: s(rec.forwardedBy), by: (s(rec.via) || 'invoices@') + ' (automatic)',
    payDate: s(si.payDate), payDateAuto: s(si.ruleDate || si.payDate), payDateRule: s(si.payRule), late: new Date(recv + 'T12:00:00').getDay() > 3 || new Date(recv + 'T12:00:00').getDay() === 0,
    retainagePct: retPct, retainage: ret, netPayable: r2(amt - ret), readBy: 'SUBINV', matchWhy: s(si.job && si.job.why), _jobConf: num(si.job && si.job.conf),
    subinv: true, at: nowIso(), createdAt: nowIso() };
  if (si.byTerms && si.payDate) { inv.payDateOverride = si.payDate; inv.payDateWhy = s(si.payRule); }   /* the invoice's own terms are later than the rule: keep them */
  return inv;
}
function inCrm(rec, invoices){
  var id = invIdOf(rec);
  return arr(invoices).some(function(i){ return s(i.id) === id || (i.mailId && s(i.mailId) === s(rec.id)); });
}
/* the same sub + invoice # already in ▥ Invoices (made by hand meanwhile) */
function crmDup(inv, invoices){
  var k = invNo(inv.invNum);
  var hit = arr(invoices).filter(function(i){ return i.type === 'sub' && !/void|rejected|cancel/i.test(s(i.status)) && s(i.id) !== inv.id && ((k && invNo(i.invNum || i.invNo) === k && (s(i.subId) === inv.subId || low(i.sub) === low(inv.sub)))); })[0];
  if (hit) return hit;
  try { if (W._gcSubInvoiceExists && W._gcSubInvoiceExists(inv, inv.id)) return { id: '?' }; } catch (e) {}
  return null;
}
/* OWNERTODO's makeInvoices asks for each invoices@ e-mail: { inv } to add · { hold } for ✅ Approvals · { skip } · null (old way) */
function take(rec, ctx){
  if (!rec || rec.kind !== 'sub_invoice' || !rec.si) return null;
  var si = rec.si, inv;
  ctx = ctx || {};
  if (S.done[rec.id] && S.done[rec.id].done) return { skip: 'done' };
  if (inCrm(rec, ctx.invoices)) return { skip: 'already' };
  if (si.route !== 'book' || !si.job || !proj(si.job.pid)) { S.held[rec.id] = si.route === 'book' ? 'match' : si.route; return { hold: true }; }
  inv = makeInv(rec, { pid: si.job.pid, sub: si.sub && si.sub.name, subId: si.sub && si.sub.id });
  inv._jobCertain = true;
  var d = crmDup(inv, ctx.invoices);
  if (d) { S.held[rec.id] = 'dup'; S.dupOf = S.dupOf || {}; S.dupOf[rec.id] = s(d.id); return { hold: true }; }
  return { inv: inv };
}
/* the PENDING job cost for each booked invoice — once: an existing row for this bill is linked, never a second one */
function post(invs){
  invs = arr(invs).filter(function(i){ return i.type === 'sub' && i.pid && i.subinv; });
  if (!invs.length || typeof W._setExpenses !== 'function') return 0;
  var made = 0;
  W._setExpenses(function(prev){
    var l = Array.isArray(prev) ? prev.slice() : [];
    invs.forEach(function(iv){
      if (l.some(function(e){ return e && s(e.subInvId) === iv.id; })) return;
      var c = null; try { c = W._gcCostRowFor ? W._gcCostRowFor(l, iv) : null; } catch (e) {}
      if (c) { l = l.map(function(x){ return x === c ? Object.assign({}, x, { subInvId: iv.id, _fromSub: true, updatedAt: nowIso() }) : x; }); made++; return; }
      l.push({ id: 'EXPM-' + iv.id, pid: iv.pid, subInvId: iv.id, _fromSub: true, type: 'expense', vendor: iv.sub, desc: 'Sub Invoice: ' + iv.desc, po: iv.po, amt: iv.amt,
        category: 'Subcontractor', status: 'pending', date: iv.date, by: iv.by, source: iv.source, enteredAt: nowIso() });
      made++;
    });
    return l;
  });
  invs.forEach(function(iv){
    try { if (W._gcAddToRegister) W._gcAddToRegister({ srcInvId: iv.id, pid: iv.pid, payee: iv.sub, desc: 'Sub Invoice: ' + iv.desc, po: iv.po, amount: iv.amt, amt: iv.amt, category: 'Subcontractor', date: iv.date, source: 'subinvoice', method: 'invoice', direction: 'out', isIncome: false, status: 'pending' }); } catch (e) {}
  });
  return made;
}
function addInvoice(inv){
  if (typeof W._setInvoices !== 'function') return false;
  W._setInvoices(function(list){ var l = Array.isArray(list) ? list : []; return l.some(function(i){ return s(i.id) === inv.id; }) ? l : l.concat([inv]); });
  post([inv]);
  try { if (W._gcPushAll) (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ W._gcPushAll(); }, 900); } catch (e) {}
  return true;
}
/* the office picks the job (and the sub) → booked like a certain one */
function place(id, o){
  var rec = S.list.filter(function(x){ return s(x.id) === s(id); })[0]; if (!rec || !rec.si || !o || !o.pid || !proj(o.pid)) return null;
  var subRec = arr(crm().subs).filter(function(x){ return s(x.id) === s(o.subId) || (o.sub && low(x.name) === low(o.sub)); })[0];
  var inv = makeInv(rec, { pid: o.pid, sub: subRec ? subRec.name : o.sub, subId: subRec ? subRec.id : '', amt: o.amt });
  if (!(inv.amt > 0)) return null;
  inv._jobCertain = true; inv._matchConfirmed = true; inv.matchedBy = myName(); inv.matchedAt = nowIso();
  if (!addInvoice(inv)) return null;
  markDone(rec.id, { done: true, invId: inv.id, at: nowIso(), by: myName() });
  return inv;
}
function dismiss(id, why){ delete S.held[id]; return markDone(id, { done: true, skip: true, why: s(why) || 'not a sub invoice', at: nowIso(), by: myName() }); }

/* ── ✅ Approvals: the held ones (the office's; the admins are not asked unless there is no office person) ── */
var TITLES = { match: '🧾 Match this invoice', review: '🧾 Match this invoice (does it say we owe it?)', dup: '⚠️ Possible duplicate invoice', link: '🔗 Open this invoice link' };
function items(){
  if (!(isOffice() || (isAdminOnly() && noOfficeUser()))) return [];
  return S.list.filter(function(x){ return x && x.kind === 'sub_invoice' && x.si && !(S.done[x.id] && S.done[x.id].done) && (x.si.route !== 'book' || S.held[x.id]) && !inCrm(x, crm().invoices); }).map(function(x){
    var si = x.si, r = si.read || {}, k = S.held[x.id] || si.route;
    return { id: 'subinv:' + x.id, title: (TITLES[k] || TITLES.match) + ': ' + (s(si.sub && si.sub.name) || x.fromName || x.from) + (r.total ? ' ' + money(r.total) : ''),
      sub: s(si.why) || (k === 'dup' ? 'already in ▥ Invoices' : ''), at: s(x.at), urgency: 'soon', act: { l: k === 'link' ? '🔗 Open' : '🧾 Match', f: function(){ open(x.id); } } };
  });
}
function hookItems(){
  var prev = W._gcHot1Approvals; if (prev && prev.__gcSubinv) return;
  var w = function(){ var base = []; try { base = typeof prev === 'function' ? arr(prev.apply(this, arguments)) : []; } catch (e) {} try { return base.concat(items()); } catch (e) { return base; } };
  try { if (prev) Object.keys(prev).forEach(function(k){ w[k] = prev[k]; }); } catch (e) {}
  w.__gcSubinv = true; W._gcHot1Approvals = w;
}

/* the picker */
function open(id){
  var x = S.list.filter(function(y){ return s(y.id) === s(id); })[0]; if (!x) return;
  var si = x.si || {}, r = si.read || {}, f = arr(x.files)[0] || {}, k = S.held[x.id] || si.route;
  var top = arr(si.top).filter(function(j){ return proj(j.pid); });
  var ov = D.createElement('div'); ov.className = 'gc-si-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gc-linked', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit';
  var others = projects().filter(function(p){ return !/^(lost|dead|cancel+ed|archived)$/i.test(s(p.status)); });
  var subs = arr(crm().subs).filter(function(z){ return z.name; });
  var subPick = s(si.sub && si.sub.id);
  ov.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:12px;width:min(560px,100%);padding:18px;margin-top:20px">' +
    '<div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:16px">' + esc(TITLES[k] || TITLES.match) + '</b><button type="button" data-si="x" aria-label="Close" style="border:none;background:none;font-size:18px;cursor:pointer">✕</button></div>' +
    '<div style="font-size:12.5px;color:#475569;margin:4px 0 10px">From ' + esc(x.fromName || x.from) + (x.forwardedBy ? ' (forwarded by ' + esc(x.forwardedBy) + ')' : '') + ' · ' + esc(s(x.at).slice(0, 10)) + ' · ' + esc(x.subject) + '</div>' +
    (si.why ? '<div style="background:#fef3c7;border-radius:8px;padding:8px;font-size:13px;margin-bottom:8px">Why it waits: ' + esc(si.why) + '</div>' : '') +
    '<div style="font-size:13px;line-height:1.6">' + (r.vendor ? 'Vendor: <b>' + esc(r.vendor) + '</b><br>' : '') + (r.invoiceNumber ? 'Invoice #: ' + esc(r.invoiceNumber) + '<br>' : '') + (r.jobAddress ? 'Job address on it: ' + esc(r.jobAddress) + '<br>' : '') + (r.dueDate ? 'Due: ' + esc(r.dueDate) + '<br>' : '') + (si.payDate ? 'Pays: ' + esc(si.payDate) + ' (' + esc(si.payRule) + ')<br>' : '') + '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">' + (f.ref ? '<button type="button" data-si="file" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer">📄 Open the invoice</button>' : '') +
      arr(si.links).map(function(l){ return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;text-decoration:none;color:#1d4ed8">🔗 Open the link</a>'; }).join('') + '</div>' +
    (top.length ? '<div style="font-weight:700;font-size:13px;margin-top:6px">Best matches</div>' + top.map(function(j, i){ return '<label style="display:block;border:1px solid #e2e8f0;border-radius:8px;padding:7px;margin:4px 0;font-size:13px"><input type="radio" name="gcsi-j" value="' + esc(j.pid) + '"' + (i === 0 ? ' checked' : '') + '> <b>' + esc(j.name) + '</b> · ' + esc(j.address) + ' <span style="color:#64748b">(' + esc(j.conf) + '% — ' + esc(j.why) + ')</span></label>'; }).join('') : '') +
    '<label style="display:block;font-size:13px;margin-top:6px">Or another job<select data-si="job" style="display:block;width:100%;padding:8px;margin-top:3px"><option value="">—</option>' + others.map(function(p){ return '<option value="' + esc(p.id) + '">' + esc((p.autoPO ? p.autoPO + ' · ' : '') + s(p.name) + (p.address ? ' · ' + s(p.address) : '')) + '</option>'; }).join('') + '</select></label>' +
    '<label style="display:block;font-size:13px;margin-top:6px">Sub<select data-si="sub" style="display:block;width:100%;padding:8px;margin-top:3px"><option value="">' + esc(r.vendor || x.fromName || x.from) + ' (not on the sub list)</option>' + subs.map(function(z){ return '<option value="' + esc(z.id) + '"' + (s(z.id) === subPick ? ' selected' : '') + '>' + esc(z.name) + '</option>'; }).join('') + '</select></label>' +
    '<label style="display:block;font-size:13px;margin-top:6px">Amount to pay<input data-si="amt" inputmode="decimal" value="' + esc(r.total ? r2(r.total).toFixed(2) : '') + '" style="display:block;width:100%;padding:8px;margin-top:3px"></label>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" data-si="ok" style="flex:1;padding:10px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">' + (k === 'dup' ? 'It is new — book it' : 'Book it on this job') + '</button>' +
    '<button type="button" data-si="no" style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer">' + (k === 'dup' ? 'Duplicate — set aside' : 'Not a sub invoice') + '</button></div><div data-si="msg" style="font-size:12.5px;margin-top:6px"></div></div>';
  D.body.appendChild(ov);
  function q(n){ return ov.querySelector('[data-si="' + n + '"]'); }
  ov.addEventListener('click', function(ev){
    var t = ev.target; var b = t && t.closest ? t.closest('[data-si]') : null; var a = b ? b.getAttribute('data-si') : '';
    if (t === ov || a === 'x') { ov.remove(); return; }
    if (a === 'file') { try { if (W._gcOpenRef) W._gcOpenRef(f.ref, f.name); } catch (e) {} return; }
    if (a === 'no') { dismiss(x.id, k === 'dup' ? 'duplicate' : 'not a sub invoice'); ov.remove(); return; }
    if (a === 'ok') {
      var radio = ov.querySelector('input[name="gcsi-j"]:checked'), pid = s(q('job').value) || (radio ? radio.value : '');
      var amt = num(q('amt').value), sid = s(q('sub').value);
      if (!pid) { q('msg').textContent = 'Pick the job first.'; return; }
      if (!(amt > 0)) { q('msg').textContent = 'Type the amount first.'; return; }
      var inv = place(x.id, { pid: pid, subId: sid, sub: sid ? '' : (r.vendor || x.fromName || x.from), amt: amt });
      if (!inv) { q('msg').textContent = 'The CRM is still loading — try again in a moment.'; return; }
      ov.innerHTML = '<div style="background:#fff;border-radius:12px;padding:18px;margin-top:20px;color:#15803d;font-weight:700">✓ Booked on ' + esc((proj(pid) || {}).name) + ' — ' + money(inv.amt) + ', pays ' + esc(inv.payDate) + ' after approval. <button type="button" data-si="x" style="margin-left:8px">Close</button></div>';
    }
  });
}

/* ── JOB-COST APPROVAL ROUTING: PM → office after 24 h (or no PM) (an admin only as the job's PM) ── */
function since(v){ var n = +v; if (n) return n; var t = Date.parse(v || ''); return isNaN(t) ? 0 : t; }
function lsList(k){ return arr(lsGet(k)); }
function subCostExp(id){ var e = arr(crm().expenses).filter(function(x){ return s(x.id) === s(id); })[0]; return !!(e && (e._fromSub === true || e.subInvId)); }
function routeGroups(g){
  var mn = low(myName()), off = isOffice(), now = Date.now();
  g.subinv = lsList('gc_sub_approvals').filter(function(a){
    if (a.status !== 'pending_pm') return false;
    var pm = low(a.pmName), mine = pm && pm === mn;
    return mine || (off && (!pm || now - since(a.createdAt) >= DAY));
  }).map(function(a){ return { id: 'sub:' + s(a.invId || a.id), title: s(a.sub || a.subName) }; });
  g.expense = lsList('gc_expense_approvals').filter(function(a){
    if (a.status !== 'pending_pm' && a.status !== 'escalated') return false;
    if (subCostExp(a.expId)) return false;   /* a sub invoice's cost row: approved with the sub invoice */
    var pm = low(a.pm), mine = pm && pm === mn && a.status === 'pending_pm';
    return mine || (off && (!pm || a.status === 'escalated' || now - since(a.enteredAt) >= DAY));
  }).map(function(a){ return { id: 'exp:' + s(a.expId), title: s(a.payee || a.desc) }; });
  return g;
}
var LBL = { email: ['customer e-mail', 'customer e-mails'], subinv: ['sub invoice', 'sub invoices'], invsign: ['invoice to sign off', 'invoices to sign off'], expense: ['expense', 'expenses'], other: ['other approval', 'other approvals'] };
function route(){
  var f = W._gcApprovalSet; if (typeof f !== 'function' || f.__gcSubinvRoute) return;
  var w = function(){
    var r = f.apply(this, arguments);
    try {
      if (!r || !r.groups) return r;
      if (W._gcVAS && W._gcVAS.active && W._gcVAS.active()) return r;   /* View as: the original rule */
      routeGroups(r.groups);
      var total = 0, parts = [];
      Object.keys(r.groups).forEach(function(k){ var n = arr(r.groups[k]).length; total += n; if (n && LBL[k]) parts.push(n + ' ' + (n === 1 ? LBL[k][0] : LBL[k][1])); });
      r.total = total; r.tip = parts.join(' · ');
    } catch (e) {}
    return r;
  };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcSubinvRoute = true; W._gcApprovalSet = w;
}

function tick(){ try { hookItems(); route(); } catch (e) {} }
tick(); RI.call(W, tick, 2000);
W._gcSubInv = { take: take, post: post, load: load, items: items, place: place, dismiss: dismiss, open: open, route: route, routeGroups: routeGroups, state: function(){ return S; } };
try { console.log('[GC] 🧾 Sub invoices e-mailed in are booked by themselves; job-cost approvals: PM → office after 24 h (patch SUBINV)'); } catch (e) {}
})();
