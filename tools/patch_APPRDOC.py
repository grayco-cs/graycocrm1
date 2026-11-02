#!/usr/bin/env python3
"""Idempotent patch APPRDOC: see the document you are approving, on the card, and attach one where none is there.

Owner: "On any approval, job etc. be able to add receipts, documents, PDFs to them from the approval list if no
document is there for what we're approving, and from projects. I want to see the document we are approving when we
approve." And on a sub-invoice card ("Sub invoice — invoice-22902 · Uploaded: invoice-22902.pdf · $20,000.00 · Rapid
Air"): "when it says open invoice I want to go to that PDF".

1. On every approval card with a document (sub / supplier invoices, client invoices, expenses / receipts, queue items
   with attachments: COs, estimates, pay apps, lien waivers, portal papers ...): a "📄 <file>" chip per file. A click
   opens the viewer BESIDE the cards (desk: a panel on the right, the list moves left; phone: a sheet), PDF or image,
   every file as a tab, with ✅ Approve / 📝 Note / ✕ Deny of that card under it (they press the card's own buttons).
   Where the files are found: the record's fileData / fileUrl / pdfUrl / receipt / photo fields and its attachments /
   files / docs lists (a data: URL, an https link or a CRM file-store ref "sb:crm-files/…", resolved by _gcFileUrl --
   "Uploaded: invoice-22902.pdf" is invoices[].fileData = sb:crm-files/<hash>.pdf), the sub-invoice PDF store
   (gc_sub_pdfs, _gcAttachSubPDF), the queue item's attachments, and the job's Files & Docs entries linked to the card.
2. "✏️ Open sub invoice" / "✏️ Open invoice …" opened the edit form. Now "📄 Open sub invoice" / "📄 Open invoice" /
   "📄 Open receipt" open the file in the viewer (no file: the 📎 Attach box), and the form moved to "✏ Edit".
   "📄 Sub invoice" made OUR paper from the record (or showed a gc_sub_pdfs file, which the viewer now shows): it is
   "📄 Our sub-invoice form" now. A client invoice's "🧾 Invoice PDF" is the paper being approved: it stays, and "📄 Open
   invoice" shows it when nothing is attached.
3. No document: "📎 Attach receipt / PDF" (a computer file, or a photo on a phone), stored with the CRM file store
   (_gcStoreFile), linked to the record (attachments[], and fileData when it had none) and to the job's Files & Docs
   (projectDocs, apxFor = the card), then shown on the card. Money items (sub invoices, expenses over $0) say "No
   document attached" in amber.
4. Admin → PM & team settings: "📎 Approvals need a document" (gc_kv gc_apprdoc_settings; default OFF = warn only).
   ON: a sub invoice / expense over $0 with no document cannot be approved (the button says so; bulk / phone approve
   are held too).
5. The job pages: Expenses, Invoices, COs and 💰 Invoices & Payments get a column with 👁 (view, when a file is there)
   and 📎 (attach) on every line -- the same viewer and attach.
6. Phone: GrayCo Field's "My approvals" cards get the same 📄 / 📎 button.
Console: _gcApprDoc.docs(key), .open(key), .attach(key), .settings()
Usage: python3 tools/patch_APPRDOC.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch APPRDOC'
if MARK in t:
    print('APPRDOC: already patched'); sys.exit(0)

def rep(name, old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, 'APPRDOC %s: expected %d, found %d' % (name, count, n)
    t = t.replace(old, new)

JS = r'''/* patch APPRDOC — the document on the card: find it, show it beside the card, attach one where none is there */
var AD = { pdfs: {}, pdfAt: 0, docs: [], docAt: 0, local: {}, lineLocal: {}, set: null, setAt: 0 };
function adNow(){ return new Date().toISOString(); }
function adSb(){ var u = '', k = ''; try { u = s(localStorage.getItem('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); k = s(localStorage.getItem('grayco_sb_key')); } catch (e) {} return { u: u, k: k }; }
/* the setting (gc_kv gc_apprdoc_settings): { require: false } -- warn only unless an admin turns it on */
function adSettings(){
  if (!AD.set) { try { AD.set = JSON.parse(localStorage.getItem('gc_apprdoc_settings') || 'null'); } catch (e) {} AD.set = AD.set || { require: false }; }
  if (Date.now() - AD.setAt > 300000) { AD.setAt = Date.now(); var c = adSb(); if (c.k) { try { W.fetch(c.u + '/rest/v1/gc_kv?key=eq.gc_apprdoc_settings&select=value', { headers: { apikey: c.k }, cache: 'no-store' }).then(function(r){ return r && r.ok ? r.json() : null; }).then(function(rows){ var v = Array.isArray(rows) && rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } if (v && typeof v === 'object') { var ch = !!v.require !== !!AD.set.require; AD.set = v; try { localStorage.setItem('gc_apprdoc_settings', JSON.stringify(v)); } catch (e) {} if (ch) { fresh(); paintSoon(); } } }, function(){}); } catch (e) {} } }
  return AD.set;
}
function adSave(req){
  var v = { require: !!req, at: adNow(), by: myName() }; AD.set = v; AD.setAt = Date.now();
  try { localStorage.setItem('gc_apprdoc_settings', JSON.stringify(v)); } catch (e) {}
  var c = adSb(); fresh(); paintSoon();
  if (!c.k) return Promise.resolve(false);
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'gc_apprdoc_settings', value: v, updated_at: v.at }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
/* the sub-invoice PDF store (patch "SUB INVOICE PDF ATTACH": idb gc_sub_pdfs, { <invoice id>: { name, type, data } }) */
function adPdfs(){
  if (Date.now() - AD.pdfAt > 20000 && typeof W.idbGet === 'function') { AD.pdfAt = Date.now(); try { Promise.resolve(W.idbGet('gc_sub_pdfs')).then(function(v){ if (v && typeof v === 'object' && JSON.stringify(Object.keys(v)) !== JSON.stringify(Object.keys(AD.pdfs))) { AD.pdfs = v; fresh(); paintSoon(); } else if (v && typeof v === 'object') AD.pdfs = v; }, function(){}); } catch (e) {} }
  return AD.pdfs;
}
/* the job's Files & Docs (idb projectDocs): the files attached from a card (apxFor = the card / the line) */
function adProjDocs(){
  if (Date.now() - AD.docAt > 20000 && typeof W.idbGet === 'function') { AD.docAt = Date.now(); try { Promise.resolve(W.idbGet('projectDocs')).then(function(v){ if (Array.isArray(v)) AD.docs = v.filter(function(d){ return d && d.apxFor; }); }, function(){}); } catch (e) {} }
  return AD.docs;
}
function adIsSrc(v){ return typeof v === 'string' && /^(data:|https?:|blob:|sb:)/i.test(v.trim()); }
function adTypeOf(name, type, src){ var t = low(type), n = low(name) + ' ' + low(String(src || '').slice(0, 40)); if (/pdf/.test(t) || /\.pdf\b|application\/pdf/.test(n)) return 'pdf'; if (/^image\//.test(t) || /\.(png|jpe?g|gif|webp|heic)\b|data:image\//.test(n)) return 'img'; return 'file'; }
/* every file on a record: fileData / fileUrl / pdfUrl / receipt / photo …, and the attachments / files / docs lists */
function adFromRec(rec, out){
  if (!rec || typeof rec !== 'object') return;
  var nm = s(rec.fileName || rec.filename || rec.pdfName);
  ['fileData', 'fileUrl', 'pdfUrl', 'pdf', 'receiptUrl', 'receipt', 'receiptPhoto', 'receiptImg', 'photo', 'imgData', 'imageUrl'].forEach(function(k){ var v = rec[k]; if (adIsSrc(v)) out.push({ name: nm || (/receipt/i.test(k) ? 'Receipt' : 'Document'), type: s(rec.fileType || rec.fileMime), src: s(v) }); else if (v && typeof v === 'object' && adIsSrc(v.ref || v.url || v.data)) out.push({ name: s(v.name) || nm || 'Document', type: s(v.type), src: s(v.ref || v.url || v.data) }); });
  var f = rec._files; if (f && typeof f === 'object') Object.keys(f).forEach(function(k){ var x = f[k]; if (x && adIsSrc(x.ref || x.url || x.data)) out.push({ name: s(x.name) || nm || 'Document', type: s(x.type), src: s(x.ref || x.url || x.data) }); });
  [rec.attachments, rec.files, rec.docs, rec.documents, rec.receipts].forEach(function(l){ arr(l).forEach(function(x){ if (!x) return; if (adIsSrc(x)) { out.push({ name: 'Document', type: '', src: s(x) }); return; } var v = x.ref || x.url || x.data || x.src || x.fileData || x.href; if (adIsSrc(v)) out.push({ name: s(x.name || x.fileName || x.title) || 'Document', type: s(x.type || x.mime), src: s(v) }); }); });
}
function adInvoice(id){ id = s(id); if (!id) return null; return arr(crm().invoices).filter(function(i){ return i && s(i.id) === id; })[0] || null; }
function adExpense(id){ id = s(id); if (!id) return null; return arr(crm().expenses).filter(function(e){ return e && s(e.id) === id; })[0] || null; }
function adCo(id){ id = s(id); return arr(crm().changeOrders).filter(function(c){ return c && s(c.id) === id; })[0] || null; }
function adQueueItem(id){ return queue().filter(function(y){ return y && s(y.id) === s(id); })[0] || null; }
/* what a card is about: its kind, the record id, the job, the amount */
function adWhat(r){
  if (!r) return null;
  if (r.src === 'sub') return { k: 'inv', id: s(r.id), noun: 'sub invoice', money: true, pid: s(r.pid), amt: num(r.amount) };
  if (r.src === 'inv') return { k: 'inv', id: s(r.id), noun: 'invoice', money: false, client: true, pid: s(r.pid), amt: num(r.amount) };
  if (r.src === 'exp') { var eid = s(r.eid || r.id).replace(/^expId:/, ''), ex = adExpense(eid) || {}; return { k: 'exp', id: eid, noun: 'receipt', money: true, pid: s(r.pid || ex.pid || ex.jobId), amt: num(r.amount) || num(ex.amt || ex.amount) }; }   /* a stub card (no amount / job) reads them from the expense */
  if (r.src === 'queue') { var x = adQueueItem(r.id) || {}, m = x.meta || {}; var inv = s(m.invoiceId) || s((arr(x.attachments).filter(function(a){ return a && a.invoiceId; })[0] || {}).invoiceId); return { k: 'queue', id: s(r.id), inv: inv, noun: 'document', money: false, pid: s(r.pid), amt: num(r.amount), x: x }; }
  return null;
}
function adLineDocs(k, id){
  var out = [];
  if (k === 'inv') { var iv = adInvoice(id); adFromRec(iv, out); var sp = adPdfs()[s(id)]; if (sp && adIsSrc(sp.data)) out.push({ name: s(sp.name) || 'Sub invoice PDF', type: s(sp.type), src: s(sp.data) }); }
  if (k === 'exp') adFromRec(adExpense(id), out);
  if (k === 'co') adFromRec(adCo(id), out);
  adProjDocs().forEach(function(d){ if (d && !d.deleted && s(d.apxFor) === k + ':' + s(id) && adIsSrc(d.ref || d.data || d.url)) out.push({ name: s(d.name) || 'Document', type: s(d.type), src: s(d.ref || d.data || d.url) }); });
  arr(AD.lineLocal[k + '|' + id]).forEach(function(x){ out.push(x); });
  var seen = {}; return out.filter(function(d){ if (seen[d.src]) return false; seen[d.src] = 1; return true; });
}
function adDocs(r){
  var w = adWhat(r); if (!w) return [];
  var out = [];
  if (w.k === 'queue') { adFromRec(w.x, out); if (w.inv) out = out.concat(adLineDocs('inv', w.inv)); }
  else out = adLineDocs(w.k, w.id);
  adProjDocs().forEach(function(d){ if (d && !d.deleted && s(d.apxFor) === s(r.key) && adIsSrc(d.ref || d.data || d.url)) out.push({ name: s(d.name) || 'Document', type: s(d.type), src: s(d.ref || d.data || d.url) }); });
  arr(AD.local[r.key]).forEach(function(d){ out.push(d); });
  var seen = {}; return out.filter(function(d){ var k = d.src.length > 200 ? d.src.slice(0, 120) + d.src.length : d.src; if (seen[k]) return false; seen[k] = 1; return true; });
}
function adBlock(r){ var w = adWhat(r); if (!w || !w.money || !(w.amt > 0)) return false; return !!adSettings().require && !adDocs(r).length; }
/* the card: the files, or 📎 Attach (+ "No document attached" on a money item) */
function adStrip(r, where){
  var w = adWhat(r); if (!w || (where !== 'tab' && where !== 'pin')) return '';
  var d = adDocs(r), k = esc(r.key);
  if (d.length) return '<div class="apxd-strip">' + d.slice(0, 6).map(function(x, i){ var ic = adTypeOf(x.name, x.type, x.src) === 'img' ? '🖼' : '📄'; return '<button type="button" class="apxd-chip" data-apxd-view="' + k + '" data-apxd-i="' + i + '" title="View ' + esc(x.name) + '">' + ic + ' ' + esc(x.name.length > 34 ? x.name.slice(0, 32) + '…' : x.name) + '</button>'; }).join('') + (d.length > 6 ? '<span class="apxd-more">+' + (d.length - 6) + '</span>' : '') + '</div>';
  if (w.client) return '';
  return '<div class="apxd-strip">' + (w.money && w.amt > 0 ? '<span class="apxd-warn">⚠ No document attached' + (adSettings().require ? ' — needed before approving' : '') + '</span>' : '') + '<button type="button" class="apxd-add" data-apxd-add="' + k + '">📎 Attach receipt / PDF</button></div>';
}
/* the buttons: "Open …" = the file; the form is "✏ Edit"; our own paper is labelled as ours */
function adRow(r){
  var w = adWhat(r); if (!w) return r;
  var o = Object.assign({}, r), id = w.id;
  if (o.edit && o.edit.form && /^✏️? ?Open /.test(s(o.edit.l))) o.edit = Object.assign({}, o.edit, { l: '✏ Edit' });
  if (w.k !== 'queue') o.view = { l: '📄 Open ' + w.noun, f: function(){ adOpen(r.key); } };
  else if (adDocs(r).length) o.view = { l: '📎 Attachments (' + adDocs(r).length + ')', f: function(){ adOpen(r.key); } };
  if (r.src === 'sub') o.doc = { l: '📄 Our sub-invoice form', f: function(){ call('_gcViewInvoicePDF', id, s(r.pid)); } };
  return o;
}
function adRowFor(key){ var r = null; try { r = rowByKey(s(key)); } catch (e) {} if (r) return r; var m = /^(exp|sub|inv|ap2):(.+)$/.exec(s(key)); if (!m) return null; return m[1] === 'exp' ? { key: key, src: 'exp', id: m[2], eid: m[2] } : m[1] === 'sub' ? { key: key, src: 'sub', id: m[2] } : m[1] === 'inv' ? { key: key, src: 'inv', id: m[2] } : { key: key, src: 'queue', id: m[2] }; }
/* the viewer, beside the cards */
var ADV = { key: '', i: 0, url: '', line: null };
function adClose(){ var v = D.getElementById('apxd-view'); if (v) v.remove(); D.documentElement.classList.remove('apxd-open'); if (ADV.url && /^blob:/.test(ADV.url)) { try { URL.revokeObjectURL(ADV.url); } catch (e) {} } ADV = { key: '', i: 0, url: '', line: null }; }
function adResolve(src){
  src = s(src);
  if (/^sb:/i.test(src)) return typeof W._gcFileUrl === 'function' ? Promise.resolve(W._gcFileUrl(src)) : Promise.reject(new Error('the file store is not ready'));
  if (/^data:/i.test(src)) return W.fetch(src).then(function(r){ return r.blob(); }).then(function(b){ return URL.createObjectURL(b); });
  return Promise.resolve(src);
}
function adDraw(docs, title, i){
  var v = D.getElementById('apxd-view');
  if (!v) { v = D.createElement('div'); v.id = 'apxd-view'; v.setAttribute('data-gc-keep', '1'); v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Document'); D.body.appendChild(v); }
  D.documentElement.classList.add('apxd-open');
  var x = docs[i] || docs[0], key = esc(ADV.key || '');
  var acts = ADV.key && !ADV.line ? '<div class="apxd-acts">' + ['approve', 'note', 'deny'].map(function(a){ var b = D.querySelector('[data-apx-act$="|' + cssq(ADV.key) + '|' + a + '"]'); return b && !b.disabled ? '<button type="button" class="apxd-act ' + a + '" data-apxd-act="' + a + '">' + esc(b.textContent) + '</button>' : ''; }).join('') + '</div>' : '';
  v.innerHTML = '<div class="apxd-hd"><b>' + esc(title || 'Document') + '</b><button type="button" class="apxd-x" data-apxd-close="1" aria-label="Close">✕</button></div>'
    + (docs.length > 1 ? '<div class="apxd-tabs">' + docs.map(function(d, j){ return '<button type="button" class="apxd-tab' + (j === i ? ' on' : '') + '" data-apxd-tab="' + j + '">' + esc(d.name.length > 28 ? d.name.slice(0, 26) + '…' : d.name) + '</button>'; }).join('') + '</div>' : '')
    + '<div class="apxd-body"><div class="apxd-load">Opening ' + esc(x ? x.name : '') + '…</div></div>'
    + '<div class="apxd-ft">' + acts + '<button type="button" class="apxd-add2" data-apxd-add="' + key + '"' + (ADV.line ? ' data-apxd-line-add="' + esc(ADV.line.k + '|' + ADV.line.id) + '" data-apxd-pid="' + esc(ADV.line.pid) + '"' : '') + '>📎 Add another file</button></div>';
  if (!x) return;
  var body = v.querySelector('.apxd-body'), want = x.src;
  adResolve(x.src).then(function(url){
    if (!D.getElementById('apxd-view') || !body.isConnected) return;
    if (ADV.url && ADV.url !== url && /^blob:/.test(ADV.url)) { try { URL.revokeObjectURL(ADV.url); } catch (e) {} }
    ADV.url = url;
    var ty = adTypeOf(x.name, x.type, want);
    body.innerHTML = ty === 'img' ? '<img class="apxd-img" alt="' + esc(x.name) + '" src="' + esc(url) + '">'
      : ty === 'pdf' ? '<iframe class="apxd-frame" title="' + esc(x.name) + '" src="' + esc(url) + '"></iframe>'
      : '<div class="apxd-load">This file cannot be shown here. <a href="' + esc(url) + '" target="_blank" rel="noopener">Open ' + esc(x.name) + '</a></div>';
    body.setAttribute('data-apxd-shown', esc(x.name));
  }, function(e){ body.innerHTML = '<div class="apxd-load">Could not open ' + esc(x.name) + ' (' + esc(e && e.message || 'error') + ').</div>'; });
}
function adOpen(key, i){
  var r = adRowFor(key); if (!r) return false;
  var d = adDocs(r), w = adWhat(r);
  if (!d.length) { if (w && w.client) { call('_gcViewInvoicePDF', w.id, w.pid); return true; } adAttach(key); return true; }
  ADV.key = s(key); ADV.i = i || 0; ADV.line = null;
  adDraw(d, (r.kindL ? r.kindL + ' — ' : '') + s(r.title || ''), ADV.i);
  return true;
}
/* a job-page line (exp | inv | co + id) */
function adOpenLine(k, id, pid, i){
  var d = adLineDocs(k, id); if (!d.length) { adAttachLine(k, id, pid); return; }
  ADV.key = ''; ADV.i = i || 0; ADV.line = { k: k, id: id, pid: pid };
  adDraw(d, k === 'exp' ? 'Expense — receipt' : k === 'co' ? 'Change order' : 'Invoice', ADV.i);
}
/* attach: a file (or a photo on a phone) → the CRM file store → the record + the job's Files & Docs → the card */
function adPick(cb){
  var inp = D.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,image/*'; inp.multiple = true; inp.style.display = 'none'; inp.setAttribute('data-apxd-input', '1');
  inp.addEventListener('change', function(){ var f = Array.prototype.slice.call(inp.files || []); inp.remove(); if (f.length) cb(f); });
  D.body.appendChild(inp); W.__gcApxdInput = inp; inp.click();
}
function adStore(files, pid){
  if (typeof W._gcStoreFile !== 'function') return Promise.reject(new Error('the file store is not ready yet'));
  return Promise.all(files.map(function(f){ if (f.size > 25 * 1024 * 1024) return Promise.reject(new Error(f.name + ' is over 25 MB')); return W._gcStoreFile(f, { kind: 'doc', pid: pid || '', name: f.name }).then(function(m){ return { ref: m.ref, name: s(m.name || f.name), type: s(m.type || f.type), size: m.size || f.size, at: adNow(), by: myName(), via: 'approvals' }; }); }));
}
function adLinkRec(k, id, ents){
  var now = adNow();
  function add(x){ var o = Object.assign({}, x); o.attachments = arr(x.attachments).concat(ents); if (!adIsSrc(o.fileData) && k !== 'exp') { o.fileData = ents[0].ref; o.fileName = o.fileName || ents[0].name; } o.updatedAt = now; return o; }
  try {
    if (k === 'inv' && typeof W._setInvoices === 'function') W._setInvoices(function(l){ return arr(l).map(function(x){ return x && s(x.id) === s(id) ? add(x) : x; }); });
    if (k === 'exp' && typeof W._setExpenses === 'function') W._setExpenses(function(l){ return arr(l).map(function(x){ return x && s(x.id) === s(id) ? add(x) : x; }); });
    if (k === 'co' && typeof W._gcSetCOs === 'function') W._gcSetCOs(function(l){ return arr(l).map(function(x){ if (!x || s(x.id) !== s(id)) return x; var o = Object.assign({}, x); o.files = arr(x.files).concat(ents.map(function(e){ return { name: e.name, data: e.ref, ref: e.ref, type: e.type, size: e.size, at: e.at }; })); o.updatedAt = now; return o; }); });
  } catch (e) { warn(e); }
}
function adLinkDocs(pid, ents, key, recId, cat){
  if (typeof W._setProjectDocs !== 'function') return;
  var day = adNow().slice(0, 10);
  var rows = ents.map(function(e, i){ return { id: 'DOCAD' + Date.now().toString(36) + i + Math.random().toString(36).slice(2, 5), pid: s(pid), name: e.name, cat: cat || 'Receipts', by: e.by, data: e.ref, ref: e.ref, type: e.type, size: e.size, uploaded: day, source: 'approvals', apxFor: s(key), recId: s(recId), confirmed: true, updatedAt: e.at }; });
  try { W._setProjectDocs(function(l){ return arr(l).concat(rows); }); } catch (e) { warn(e); }
}
function adAttach(key){
  var r = adRowFor(key), w = adWhat(r); if (!r || !w) return false;
  adPick(function(files){
    toast('📎 Saving ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
    adStore(files, w.pid).then(function(ents){
      AD.local[r.key] = arr(AD.local[r.key]).concat(ents.map(function(e){ return { name: e.name, type: e.type, src: e.ref }; }));
      if (w.k === 'queue') { if (w.inv) adLinkRec('inv', w.inv, ents); } else adLinkRec(w.k, w.id, ents);
      adLinkDocs(w.pid, ents, r.key, w.inv || w.id, w.k === 'exp' ? 'Receipts' : w.k === 'inv' ? 'Invoices' : 'Approvals');
      toast('📎 Attached ' + ents.map(function(e){ return e.name; }).join(', ') + ' — on the card and in the job’s Files & Docs');
      fresh(); paintSoon(); later(function(){ adOpen(r.key, adDocs(r).length - 1); }, 300);
    }, function(e){ toast('Could not attach: ' + (e && e.message || 'error')); });
  });
  return true;
}
function adAttachLine(k, id, pid){
  adPick(function(files){
    toast('📎 Saving ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
    adStore(files, pid).then(function(ents){
      adLinkRec(k, id, ents); adLinkDocs(pid, ents, k + ':' + id, id, k === 'exp' ? 'Receipts' : k === 'co' ? 'Change Orders' : 'Invoices');
      var lk = k === 'exp' ? 'exp:' + id : k === 'inv' ? (adInvoice(id) && low(adInvoice(id).type) === 'client' ? 'inv:' + id : 'sub:' + id) : '';
      if (lk) AD.local[lk] = arr(AD.local[lk]).concat(ents.map(function(e){ return { name: e.name, type: e.type, src: e.ref }; }));
      AD.lineLocal[k + '|' + id] = arr(AD.lineLocal[k + '|' + id]).concat(ents.map(function(e){ return { name: e.name, type: e.type, src: e.ref }; }));
      toast('📎 Attached ' + ents.map(function(e){ return e.name; }).join(', ')); adLines(true); fresh(); paintSoon();
    }, function(e){ toast('Could not attach: ' + (e && e.message || 'error')); });
  });
}
/* the job pages' lines: each placeholder <span data-apxd-line="exp|<id>"> gets 👁 (a file is there) and 📎 */
function adLines(force){
  var els = D.querySelectorAll('[data-apxd-line]'); if (!els.length) return;
  Array.prototype.forEach.call(els, function(el){
    var v = s(el.getAttribute('data-apxd-line')), i = v.indexOf('|'), k = v.slice(0, i), id = v.slice(i + 1), n = adLineDocs(k, id).length, sig = n + '';
    if (!force && el.getAttribute('data-apxd-sig') === sig) return;
    el.setAttribute('data-apxd-sig', sig);
    el.innerHTML = (n ? '<button type="button" class="apxd-lb" data-apxd-lview="' + esc(v) + '" title="View the ' + (n === 1 ? 'file' : n + ' files') + '">👁' + (n > 1 ? ' ' + n : '') + '</button>' : '') + '<button type="button" class="apxd-lb" data-apxd-ladd="' + esc(v) + '" title="Attach a receipt / PDF">📎</button>';
  });
}
every(function(){ try { if (!D.hidden) adLines(false); } catch (e) {} }, 1200);
/* the Field app's "My approvals" card */
W._gcApprDocChip = function(key){
  try { var r = adRowFor(key), w = adWhat(r); if (!w) return ''; var n = adDocs(r).length; if (!n && w.client) return '';
    return '<button type="button" class="fh-apd" data-apxd-' + (n ? 'view' : 'add') + '="' + esc(key) + '" data-apxd-i="0" style="border:1px solid #c7d2fe;background:#eef2ff;color:#1e1b4b;border-radius:8px;padding:6px 10px;font:600 13px Arial;margin:4px 0;min-height:36px">' + (n ? '📄 View (' + n + ')' : '📎 Attach receipt / PDF') + '</button>'; } catch (e) { return ''; }
};
/* Admin → PM & team settings */
W._gcApprDocAdminHtml = function(){
  var on = !!adSettings().require;
  return '<h4 style="margin:16px 0 6px">📎 Approvals need a document</h4>'
    + '<div style="color:#475569;margin-bottom:6px">Off: a sub invoice or expense with no document says "No document attached" on its card and can still be approved. On: it cannot be approved until a receipt / PDF is attached (📎 on the card).</div>'
    + '<label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" data-apxd-req="1"' + (on ? ' checked' : '') + '> Require a document before approving a sub invoice or expense</label>';
};
D.addEventListener('change', function(ev){ var t = ev.target; if (!t || !t.hasAttribute || !t.hasAttribute('data-apxd-req')) return; if (!(adminLike() || realAdmin())) { t.checked = !t.checked; toast('Only an admin changes this.'); return; } adSave(t.checked).then(function(ok){ toast(ok ? (t.checked ? '📎 Approvals now need a document (sub invoices, expenses)' : '📎 A missing document only warns now') : 'Saved on this computer — the cloud did not answer'); }); }, true);
D.addEventListener('click', function(ev){
  var t = ev.target; if (!t || !t.closest) return;
  var b = t.closest('[data-apxd-view],[data-apxd-add],[data-apxd-close],[data-apxd-tab],[data-apxd-act],[data-apxd-lview],[data-apxd-ladd]'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  if (b.hasAttribute('data-apxd-close')) return adClose();
  if (b.hasAttribute('data-apxd-tab')) { var j = +b.getAttribute('data-apxd-tab'); if (ADV.line) adOpenLine(ADV.line.k, ADV.line.id, ADV.line.pid, j); else adOpen(ADV.key, j); return; }
  if (b.hasAttribute('data-apxd-act')) { var a = b.getAttribute('data-apxd-act'), cb = D.querySelector('[data-apx-act$="|' + cssq(ADV.key) + '|' + a + '"]'); if (cb) { cb.click(); if (a !== 'note') adClose(); } return; }
  if (b.hasAttribute('data-apxd-lview') || b.hasAttribute('data-apxd-ladd')) { var v = s(b.getAttribute('data-apxd-lview') || b.getAttribute('data-apxd-ladd')), i = v.indexOf('|'), host = b.closest('[data-apxd-line]'), pid = s(host && host.getAttribute('data-apxd-pid')); if (b.hasAttribute('data-apxd-lview')) adOpenLine(v.slice(0, i), v.slice(i + 1), pid, 0); else adAttachLine(v.slice(0, i), v.slice(i + 1), pid); return; }
  if (b.hasAttribute('data-apxd-line-add')) { var lv = s(b.getAttribute('data-apxd-line-add')), li = lv.indexOf('|'); adAttachLine(lv.slice(0, li), lv.slice(li + 1), s(b.getAttribute('data-apxd-pid'))); return; }
  if (b.hasAttribute('data-apxd-view')) { adOpen(b.getAttribute('data-apxd-view'), +(b.getAttribute('data-apxd-i') || 0)); return; }
  if (b.hasAttribute('data-apxd-add')) { var k = s(b.getAttribute('data-apxd-add')); if (k) adAttach(k); return; }
}, true);
D.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && D.getElementById('apxd-view')) { adClose(); } }, true);
try {
  var adcss = D.createElement('style'); adcss.id = 'apxd-css';
  adcss.textContent = '.apxd-strip{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}.apxd-chip,.apxd-add{border:1px solid #c7d2fe;background:#eef2ff;color:#1e1b4b;border-radius:8px;padding:5px 9px;font:600 12.5px Arial,sans-serif;cursor:pointer;min-height:32px}.apxd-add{background:#fff;border-style:dashed}.apxd-warn{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:8px;padding:4px 8px;font:600 12px Arial}.apxd-more{font-size:12px;color:#64748b}'
    + '#apxd-view{position:fixed;top:0;right:0;bottom:0;width:min(46vw,760px);z-index:2147482000;background:#fff;border-left:1px solid #cbd5e1;box-shadow:-10px 0 30px rgba(15,23,42,.18);display:flex;flex-direction:column;font:14px Arial,sans-serif;color:#0f172a}'
    + 'html.apxd-open .apx{margin-right:min(46vw,760px)}.apxd-hd{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid #e2e8f0}.apxd-hd b{flex:1;font-size:14px}.apxd-x{border:0;background:#f1f5f9;border-radius:8px;width:40px;height:40px;font-size:18px;cursor:pointer}'
    + '.apxd-tabs{display:flex;gap:4px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid #eef2ff}.apxd-tab{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:5px 8px;font:12px Arial;cursor:pointer}.apxd-tab.on{background:#1e1b4b;color:#fff;border-color:#1e1b4b}'
    + '.apxd-body{flex:1;min-height:0;overflow:auto;background:#f8fafc;display:flex;align-items:stretch;justify-content:center}.apxd-frame{width:100%;height:100%;border:0;background:#fff}.apxd-img{max-width:100%;object-fit:contain;align-self:flex-start}.apxd-load{padding:24px;color:#475569}'
    + '.apxd-ft{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-top:1px solid #e2e8f0}.apxd-acts{display:flex;gap:6px;flex-wrap:wrap;flex:1}.apxd-act,.apxd-add2{border-radius:8px;padding:9px 12px;font:700 13px Arial;cursor:pointer;min-height:40px;border:1px solid #cbd5e1;background:#fff}.apxd-act.approve{background:#16a34a;color:#fff;border-color:#16a34a}.apxd-act.deny{color:#b91c1c;border-color:#fca5a5}'
    + '.apxd-lb{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:2px 7px;margin:0 2px;cursor:pointer;font-size:13px;min-height:28px}'
    + '@media (max-width:760px){#apxd-view{top:auto;left:0;width:auto;height:78vh;border-left:0;border-top:1px solid #cbd5e1;border-radius:14px 14px 0 0}html.apxd-open .apx{margin-right:0}}';
  (D.head || D.documentElement).appendChild(adcss);
} catch (e) {}
W._gcApprDoc = { docs: function(key){ return adDocs(adRowFor(key)); }, open: adOpen, attach: adAttach, settings: adSettings, save: adSave, lineDocs: function(k, id){ return adLineDocs(k, id); } };
'''

# 1. the module, in the Approvals IIFE (before the card drawing)
rep('apx-module', "function rowHtml(r, now, where){", JS + "function rowHtml(r, now, where){")
# 2. the card: files / 📎 Attach under the title
rep('apx-strip', "    + apxNotesHtml(r)   /* patch APXNOTE */", "    + adStrip(r, where)   " + MARK + ": the document on the card */\n    + apxNotesHtml(r)   /* patch APXNOTE */")
# 3. the buttons: Open = the file, ✏ Edit = the form; our own paper labelled
rep('apx-btns', "function btns(r, where){\n  var h = '';", "function btns(r, where){\n  r = adRow(r);   " + MARK + ": Open … = the file */\n  var h = '';")
rep('apx-approve',
    "  h += b('approve', r.approve ? { l: busy[r.id] ? 'Working…' : r.approve.l, f: r.approve.mode ? function(){ inlineApprove(r); } : r.approve.f } : null, 'go');",
    "  if (r.approve && adBlock(r)) h += '<button type=\"button\" class=\"apx-b go\" disabled title=\"Admin setting: approvals need a document\">✅ Approve — attach the document first</button>';   " + MARK + ": the require setting */\n"
    "  else h += b('approve', r.approve ? { l: busy[r.id] ? 'Working…' : r.approve.l, f: r.approve.mode ? function(){ inlineApprove(r); } : r.approve.f } : null, 'go');")
rep('apx-view', "  h += b('doc', r.doc, 'dc');\n  return '<div class=\"apx-bs\">' + h + '</div>';",
    "  h += b('view', r.view, 'dc');   " + MARK + " */\n  h += b('doc', r.doc, 'dc');\n  return '<div class=\"apx-bs\">' + h + '</div>';")
rep('apx-inline', "function inlineApprove(r){\n  if (!r || !r.approve || PEND[r.key] || DONE[r.key]) return false;",
    "function inlineApprove(r){\n  if (!r || !r.approve || PEND[r.key] || DONE[r.key]) return false;\n  if (adBlock(r)) { toast('📎 Attach the document first (Admin setting: approvals need a document).'); return false; }   " + MARK + " */")
# 4. Admin → PM & team settings
rep('admin', "    + estAllHtml()   /* patch PROJLEAK */", "    + estAllHtml()   /* patch PROJLEAK */\n    + (typeof W._gcApprDocAdminHtml === 'function' ? W._gcApprDocAdminHtml() : '')   " + MARK + " */")
# 5. the Field app's approval cards
rep('field',
    "'<div class=\"t\"><b>' + esc(x.title) + '</b>' + (x.sub ? '<span>' + esc(x.sub) + '</span>' : '') + '</div>' + (W._gcCanApproveInPlace",
    "'<div class=\"t\"><b>' + esc(x.title) + '</b>' + (x.sub ? '<span>' + esc(x.sub) + '</span>' : '') + '</div>' + (W._gcApprDocChip ? W._gcApprDocChip(x.id) : '') /* patch APPRDOC */ + (W._gcCanApproveInPlace")
# 6. the job pages: a 👁 / 📎 column on every line
rep('job-exp', '{k:"category",l:"Category"},{k:"amt",l:"Amount",r:G=>e.jsx("b",{children:ue(G.amt)})}],rows:jt}',
    '{k:"category",l:"Category"},{k:"amt",l:"Amount",r:G=>e.jsx("b",{children:ue(G.amt)})},{k:"_apxd",l:"Receipt",r:G=>e.jsx("span",{"data-apxd-line":"exp|"+G.id,"data-apxd-pid":j.id})}],rows:jt}')
rep('job-inv', '{k:"status",l:"Status",r:G=>e.jsx(Wa,{s:G.status})}],rows:Mt}',
    '{k:"status",l:"Status",r:G=>e.jsx(Wa,{s:G.status})},{k:"_apxd",l:"File",r:G=>e.jsx("span",{"data-apxd-line":"inv|"+G.id,"data-apxd-pid":j.id})}],rows:Mt}')
rep('job-co', 'children:"+ File"})]})}],rows:at}',
    'children:"+ File"})]})},{k:"_apxd",l:"View",r:G=>e.jsx("span",{"data-apxd-line":"co|"+G.id,"data-apxd-pid":j.id})}],rows:at}')
rep('job-invpay', "            '<td style=\"display:flex;gap:4px;\">'+",
    "            '<td style=\"display:flex;gap:4px;\">'+\n              '<span data-apxd-line=\"inv|'+inv.id+'\" data-apxd-pid=\"'+(proj?proj.id:'')+'\"></span>'+   // patch APPRDOC: 👁 / 📎")

open(p, 'w', encoding='utf-8').write(t)
print('APPRDOC: patched')
