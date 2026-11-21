"""patch SENDEST2 (owner 11/20, iPhone Home Screen app):
 A. "When I click Send estimate it should be where I upload a PDF here" — 📤 Send estimate opens with "📎 Upload a PDF
    estimate" on top: pick a PDF (or a photo, made into a PDF) → pick / confirm the job (or the customer, no job yet) → the
    exact PDF is stored in the CRM (crm-files, fingerprinted) as that job's estimate document (Files & Docs, Estimates) and
    a CRM estimate (source upload, "Customer sees: My PDF") → the same send sheet as every estimate (customer profile, From,
    To, data-entry mode / quiet hours / portal approval decided by the server exactly as before).
 B. "after I open screen, click a button … it opens up to this" (a black screen): 👁 Preview did window.open(blob:, '_blank').
    In the Home Screen app (standalone) a new window is a separate browser sheet that cannot load the app's blob: address —
    black, no way back. Previews now open in the CRM's own viewer (‹ Back); in the Home Screen app any window.open of a
    blob: or a blank page (written into) shows in that viewer too, never a new window."""
import sys
P = 'index.html'; src = open(P).read()
MARK = '/* SENDEST2 */'
if MARK in src: print('already patched'); sys.exit(0)
def rep(a, b, n=1):
    global src
    c = src.count(a); assert c == n, (a[:90], c); src = src.replace(a, b)

NEW = r'''/* SENDEST2 */
function standaloneApp(){ try { return W.navigator.standalone === true || !!(W.matchMedia && (W.matchMedia('(display-mode: standalone)').matches || W.matchMedia('(display-mode: fullscreen)').matches)); } catch (e) { return false; } }
/* a PDF on screen INSIDE the CRM (the CRM's viewer: ‹ Back, Download, Share) — never a new window */
function showPdf(o){
  o = o || {}; var name = s(o.name) || 'Estimate.pdf';
  if (W._gcViewer && typeof W._gcViewer.open === 'function') return W._gcViewer.open({ blob: o.blob, ref: o.ref, data: o.url, name: name, type: 'application/pdf' });
  sheetCss(); var old = D.getElementById('gc-estpdf-pv'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gc-estpdf-pv'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483300;background:#0f2440;display:flex;flex-direction:column;font-family:Inter,Arial,sans-serif';
  ov.innerHTML = '<div style="display:flex;gap:8px;align-items:center;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;color:#fff"><button type="button" class="gcep-b" data-x>‹ Close</button><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(name) + '</b></div><iframe data-fr title="' + esc(name) + '" style="flex:1;width:100%;border:0;background:#fff"></iframe>';
  D.body.appendChild(ov);
  var u = o.blob ? URL.createObjectURL(o.blob) : s(o.url), fr = ov.querySelector('[data-fr]');
  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); if (o.blob) { try { URL.revokeObjectURL(u); } catch (e) {} } };
  if (u) fr.src = u; else if (s(o.ref) && typeof W._gcFileUrl === 'function') Promise.resolve(W._gcFileUrl(o.ref)).then(function(x){ fr.src = x; }, warn);
  return ov;
}
/* the Home Screen app: window.open of a blob: or a blank page (that is then written into) opens a separate browser sheet
   that shows black with no way back to the CRM. There it shows in the CRM's viewer instead (same window, ‹ Back). */
(function guardOpen(){
  var o = W.open; if (typeof o !== 'function' || o.__gcSendest2) return;
  var fake = function(){
    var parts = [], tm = 0, shown = null, w;
    var render = function(){ if (tm) { clearTimeout(tm); tm = 0; } var h = parts.join(''); if (!h) return; var t = /<title>([^<]*)<\/title>/i.exec(h); shown = W._gcViewer.open({ html: h, name: (t && s(t[1])) || 'Document' }); };
    var go = function(u){ u = s(u); if (/^blob:/i.test(u)) shown = W._gcViewer.open({ data: u, name: s(w.document.title) || 'Document' }); else if (/^https?:/i.test(u)) { try { o.call(W, u, '_blank'); } catch (e) {} } };
    w = { closed: false, opener: W, name: '', focus: function(){}, blur: function(){}, moveTo: function(){}, resizeTo: function(){},
      print: function(){ var v = D.getElementById('gc-viewer'), b = v && v.querySelector('[data-gv="print"]'); if (b) { b.hidden = false; b.click(); } },
      close: function(){ w.closed = true; var v = D.getElementById('gc-viewer'); if (shown && v === shown) W._gcViewer.close(); },
      addEventListener: function(t, f){ if (t === 'load' && typeof f === 'function') later(function(){ try { f(); } catch (e) {} }, 400); }, removeEventListener: function(){},
      document: { title: '', body: null, open: function(){ parts = []; }, write: function(){ parts.push([].slice.call(arguments).join('')); if (tm) clearTimeout(tm); tm = later(render, 300); },
        writeln: function(){ w.document.write([].slice.call(arguments).join('') + '\n'); }, close: function(){ render(); }, querySelector: function(){ return null; }, getElementById: function(){ return null; }, createElement: function(t){ return D.createElement(t); } },
      location: { replace: go, assign: go, set href(u){ go(u); }, get href(){ return 'about:blank'; } } };
    return w;
  };
  var g = function(u, target){
    try {
      var t = s(target), url = u == null ? '' : String(u);
      if (standaloneApp() && W._gcViewer && typeof W._gcViewer.open === 'function' && !/^_(self|parent|top)$/i.test(t) && (url === '' || url === 'about:blank' || /^blob:/i.test(url))) {
        S.inApp = (S.inApp || 0) + 1;
        if (!url || url === 'about:blank') return fake();
        W._gcViewer.open({ data: url, name: 'Document' }); var f = fake(); f.closed = true; return f;
      }
    } catch (e) { warn(e); }
    return o.apply(this, arguments);
  };
  try { Object.keys(o).forEach(function(k){ g[k] = o[k]; }); } catch (e) {}
  g.__gcSendest2 = true; W.open = g;
})();
function addEstRec(est){
  var has = function(l){ return arr(l).some(function(x){ return s(x.id) === s(est.id); }); }, done = false;
  manual('estimate (uploaded PDF)');
  try { if (typeof W._gcSetEstimates === 'function') { W._gcSetEstimates(function(prev){ var a = Array.isArray(prev) ? prev.slice() : []; if (!has(a)) a.unshift(est); return a; }); done = true; } } catch (e) { warn(e); }
  try { if (Array.isArray(crm().estimates) && !has(crm().estimates)) W._crm.estimates = [est].concat(crm().estimates); } catch (e) {}
  if (!has(S.est)) S.est = [est].concat(arr(S.est));
  if (!done) idb('estimates').then(function(v){ var a = arr(v); if (!has(a)) a.unshift(est); try { W.idbSet('estimates', a); } catch (e) {} try { if (W._gcApplySync) W._gcApplySync('estimates', a); } catch (e) {} try { if (W._supaUpsert) W._supaUpsert('estimates', a); } catch (e) {} });
}
/* a photo of the estimate → a one-page PDF (letter, fitted) */
function imgToPdf(file){
  var go = (W.jspdf && W.jspdf.jsPDF) ? Promise.resolve(true) : loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  return go.then(function(ok){
    if (!ok || !(W.jspdf && W.jspdf.jsPDF)) throw new Error('The photo could not be made into a PDF here — pick a PDF.');
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function(){
        try {
          var k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight)), cv = D.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
          var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u);
          var doc = new W.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: cv.width > cv.height ? 'landscape' : 'portrait' }), pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
          var sc = Math.min((pw - 36) / cv.width, (ph - 36) / cv.height), w = cv.width * sc, h = cv.height * sc;
          doc.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h); res(doc.output('blob'));
        } catch (e) { rej(e); }
      };
      im.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('That photo could not be read — pick a PDF or a JPG / PNG.')); };
      im.src = u;
    });
  });
}
/* "📎 Upload a PDF estimate": the PDF → the job (or the customer) → the CRM → the send sheet */
function openNewPdf(opts){
  opts = opts || {};
  var live = projects().filter(function(p){ return p && !p.deleted && !/lost|dead|cancel|archiv/i.test(s(p.status)); }).sort(function(a, b){ return s(b.updatedAt || b.createdAt || b.created).localeCompare(s(a.updatedAt || a.createdAt || a.created)); }).slice(0, 400);
  var cs = customers().filter(function(c){ return c && !c.deleted && s(c.name); }).sort(function(a, b){ return s(a.name).localeCompare(s(b.name)); }).slice(0, 600);
  var pre = s(opts.pid);
  var ov = overlay('gc-estpdf-newpdf', '<h3>📎 Upload a PDF estimate</h3><div class="sub">The PDF is kept on the job (Files &amp; Docs → Estimates) and you send it from your own address next.</div>' +
    '<label for="gcep-np-f">The estimate (PDF, or a photo of it)</label><input id="gcep-np-f" type="file" accept="application/pdf,.pdf,image/*" data-file style="font-size:15px">' +
    '<label for="gcep-np-q">Job (or customer, no job yet)</label><input id="gcep-np-q" type="text" data-q placeholder="Search job, PO, customer…" aria-label="Search jobs and customers">' +
    '<select id="gcep-np-t" data-t aria-label="Job or customer" style="margin-top:6px"></select>' +
    '<label for="gcep-np-n">Estimate name</label><input id="gcep-np-n" type="text" data-name>' +
    '<label for="gcep-np-a">Amount (optional)</label><input id="gcep-np-a" type="text" inputmode="decimal" data-amt placeholder="$0.00">' +
    '<div class="gcep-msg" data-m aria-live="polite"></div><div class="row"><button type="button" class="gcep-b" data-x>Cancel</button><button type="button" class="gcep-b pri" data-go>Continue to send ›</button></div>');
  var q = function(sel){ return ov.querySelector(sel); }, msg = function(t, bad){ var m = q('[data-m]'); m.textContent = t; m.className = 'gcep-msg ' + (bad ? 'bad' : 'ok'); };
  var named = false;
  var fill = function(f){
    f = low(f); var sel = q('[data-t]'), cur = sel.value || (pre ? 'p:' + pre : '');
    var J = live.filter(function(p){ return !f || low([p.name, p.autoPO, p.po, p.client, p.address].join(' ')).indexOf(f) >= 0 || s(p.id) === pre; }).slice(0, 150);
    var C = cs.filter(function(c){ return !f || low([c.name, c.company, c.email, c.phone, c.address].join(' ')).indexOf(f) >= 0; }).slice(0, 150);
    sel.innerHTML = '<option value="">— pick the job —</option>' + (J.length ? '<optgroup label="Jobs">' + J.map(function(p){ return '<option value="p:' + esc(p.id) + '">' + esc((p.autoPO ? p.autoPO + ' · ' : '') + s(p.name) + (p.client && low(p.client) !== low(p.name) ? ' — ' + s(p.client) : '')) + '</option>'; }).join('') + '</optgroup>' : '') +
      (C.length ? '<optgroup label="Customer — no job yet (one is made at the send)">' + C.map(function(c){ return '<option value="c:' + esc(c.id) + '">👤 ' + esc(s(c.name) + (c.email ? ' · ' + s(c.email) : '')) + '</option>'; }).join('') + '</optgroup>' : '');
    if (cur && sel.querySelector('option[value="' + cur.replace(/"/g, '') + '"]')) sel.value = cur;
  };
  var nameFor = function(){ if (named) return; var v = q('[data-t]').value, p = /^p:/.test(v) ? proj(v.slice(2)) : null, f = q('[data-file]').files && q('[data-file]').files[0];
    q('[data-name]').value = s(p && p.name) || (f ? s(f.name).replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ') : ''); };
  fill(''); nameFor();
  q('[data-q]').oninput = function(ev){ fill(ev.target.value); };
  q('[data-t]').onchange = nameFor; q('[data-file]').onchange = function(){ nameFor(); msg(''); }; q('[data-name]').oninput = function(){ named = true; };
  q('[data-x]').onclick = function(){ ov.remove(); };
  q('[data-go]').onclick = function(){
    var f = q('[data-file]').files && q('[data-file]').files[0], t = s(q('[data-t]').value);
    if (!f) { msg('Pick the estimate PDF (or a photo of it).', true); return; }
    if (!t) { msg('Pick the job (or the customer).', true); return; }
    var b = q('[data-go]'); b.disabled = true;
    uploadNew({ file: f, pid: /^p:/.test(t) ? t.slice(2) : '', customerId: /^c:/.test(t) ? t.slice(2) : '', name: s(q('[data-name]').value), amount: num(q('[data-amt]').value) }, msg).then(function(r){
      if (!r || !r.ok) { b.disabled = false; return; }
      ov.remove(); openSend(r.estId, Object.assign({}, opts, { pid: r.pid || opts.pid }));
    });
  };
  return ov;
}
function uploadNew(o, msg){
  msg = msg || function(){};
  var p = o.pid ? proj(o.pid) : null, c = o.customerId ? customers().filter(function(x){ return s(x.id) === s(o.customerId); })[0] : null;
  if (!p && !c) { msg('Pick the job (or the customer).', true); return Promise.resolve({ ok: false }); }
  var f = o.file, isImg = /^image\//i.test(s(f && f.type)) || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(s(f && f.name));
  msg(isImg ? 'Making the photo into a PDF…' : 'Saving the PDF in the CRM…');
  var nm = s(o.name) || s(p && p.name) || s(c && c.name) || 'Estimate', fname = 'Estimate — ' + nm.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) + '.pdf';
  return (isImg ? imgToPdf(f) : Promise.resolve(f)).then(function(blob){ msg('Saving the PDF in the CRM…'); return storeConfirmed(blob, fname); }).then(function(file){
    var have = estAll().filter(function(e){ return e && s(e.sourceRef) === file.ref && (p ? s(e.pid) === s(p.id) : s(e.customerId) === s(c.id)) && !deadMap()[e.id]; })[0];
    if (have) { msg('This PDF is already in the CRM as "' + s(have.name) + '" — opening the send.'); return { ok: true, estId: have.id, pid: s(have.pid), again: true }; }
    var at = nowIso(), l = p ? lead(p.leadId || p.fromLeadId) : null;
    var est = { id: 'EUPS_' + file.sha256.slice(0, 12) + Date.now().toString(36).slice(-3), name: nm, client: s(p && p.client) || s(c && (c.name || c.company)), address: s(p && p.address) || s(c && c.address),
      clientEmail: s(p && p.clientEmail) || s(c && c.email), clientPhone: s(p && p.clientPhone) || s(c && (c.mobile || c.phone)), pid: p ? p.id : '', leadId: l ? l.id : '', customerId: s(c && c.id) || s(p && p.customerId),
      lines: [], totalCharge: Math.round(num(o.amount) * 100) / 100, status: 'Draft', date: today(), created: today(), createdAt: at, savedAt: at, updatedAt: at, by: meName(), estimator: meName(),
      source: 'upload', sourceName: s(f && f.name), sourceRef: file.ref, sourceType: 'application/pdf', sourceSha256: file.sha256, customerSees: 'pdf', customerSeesBy: meName(), customerSeesAt: at, uploadedVia: '📤 Send estimate → 📎 Upload a PDF estimate' };
    try { var sg = W._gcEstin && W._gcEstin._t && W._gcEstin._t.sigOf; if (typeof sg === 'function') est.estin = { sig: sg(est), state: 'skipped', reason: 'The uploaded PDF is the estimate (📤 Send estimate) — no proposal made from it', at: at }; } catch (e) {}
    addEstRec(est);
    if (p) upsertDoc({ id: 'DESTUP_' + est.id, pid: p.id, projectId: p.id, estimateId: est.id, cat: 'Estimates', name: fname, ref: file.ref, type: 'application/pdf', size: file.size, sha256: file.sha256,
      uploadedAt: at, uploaded: at.slice(0, 10), by: meName(), source: 'estimate-upload', portalShare: false, confirmed: true, noNotice: true });
    note('uploaded estimate PDF ' + nm + (p ? ' on ' + s(p.autoPO || p.id) : ' for ' + s(c && c.name)));
    msg('✓ Saved in the CRM' + (p ? ' on the job' : '') + ' — now the send.');
    return { ok: true, estId: est.id, pid: p ? p.id : '' };
  }).catch(function(err){ warn(err); var t = /not a PDF/.test(s(err && err.message)) ? 'That file is not a PDF — pick the PDF (or a photo).' : (/photo|PDF/.test(s(err && err.message)) ? s(err.message) : BLOCK); msg(t, true); return { ok: false, error: t }; });
}
function pickEstimate(then, onlyPid, withUpload){'''

rep("function pickEstimate(then, onlyPid){", NEW)
# the top of the Send estimate screen
rep("""  var ov = overlay('gc-estpdf-pick', '<h3>📤 Send estimate</h3><div class="sub">Pick the estimate. It goes from your own address, the PDF is kept in the CRM.</div><input type="text" data-q""",
    """  var ov = overlay('gc-estpdf-pick', '<h3>📤 Send estimate</h3>' + (withUpload ? '<button type="button" class="gcep-b gold" data-newpdf style="display:block;width:100%;min-height:56px;margin:6px 0 4px;text-align:left;padding:12px 14px">📎 Upload a PDF estimate<small style="display:block;font:600 12.5px Inter,Arial,sans-serif;margin-top:2px">From your phone → pick the job → send it to the customer</small></button><div class="sub" style="margin-top:10px">Or pick an estimate already in the CRM. It goes from your own address, the PDF is kept in the CRM.</div>' : '<div class="sub">Pick the estimate. It goes from your own address, the PDF is kept in the CRM.</div>') + '<input type="text" data-q""")
rep("""  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  ov.querySelector('[data-rows]').onclick = function(ev){ var b = ev.target.closest('[data-id]'); if (!b) return; ov.remove(); then(b.getAttribute('data-id')); };""",
    """  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  var np = ov.querySelector('[data-newpdf]'); if (np) np.onclick = function(){ ov.remove(); openNewPdf(withUpload); };   /* SENDEST2 */
  ov.querySelector('[data-rows]').onclick = function(ev){ var b = ev.target.closest('[data-id]'); if (!b) return; ov.remove(); then(b.getAttribute('data-id')); };""")
rep("""  if (!estId) { pickEstimate(function(id){ openSend(id, opts); }, opts.pid); return; }""",
    """  if (!estId) { pickEstimate(function(id){ openSend(id, opts); }, opts.pid, opts); return; }   /* SENDEST2: 📎 Upload a PDF estimate on top */""")
# 👁 Preview: in the CRM's viewer, never a new window (the black screen in the Home Screen app)
rep("""var u = URL.createObjectURL(r.blob); S.lastPreview = u; W.open(u, '_blank'); });""",
    """S.lastPreview = 'viewer'; showPdf({ blob: r.blob, name: 'Preview — ' + s(e.name || 'Estimate') + '.pdf' }); });   /* SENDEST2 */""")
rep("""else if (a === 'upl') { var x = estById(estId); if (x && W._gcFileUrl) W._gcFileUrl(x.sourceRef).then(function(u){ W.open(u, '_blank'); }); }""",
    """else if (a === 'upl') { var x = estById(estId); if (x) showPdf({ ref: x.sourceRef, name: s(x.name || 'Estimate') + '.pdf' }); }   /* SENDEST2 */""")
# the sent-PDF viewer's "Open in new tab": in the Home Screen app → the CRM's viewer (Download / Share)
rep("""  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  var al = ov.querySelector('[data-all]'); if (al) al.onclick = function(){ versionsList(estId); };""",
    """  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  var al = ov.querySelector('[data-all]'); if (al) al.onclick = function(){ versionsList(estId); };
  if (standaloneApp()) { var tb = ov.querySelector('[data-tab]'); tb.textContent = '⬇️ Download / Share'; tb.removeAttribute('target'); tb.onclick = function(ev){ ev.preventDefault(); showPdf({ ref: c.ref, name: s(c.name) || s(e.name || 'Estimate') + '.pdf' }); }; }   /* SENDEST2 */""")
# no-job send: the new job keeps the customer picked
rep("""    customerId: s(l && l.customerId), source: 'grayco', graycoOrigin: true, created: today(), createdAt: nowIso(), createdFrom: 'estimate (📤 Send estimate)', createdBy: meName() };""",
    """    customerId: s(l && l.customerId) || s(e.customerId), source: 'grayco', graycoOrigin: true, created: today(), createdAt: nowIso(), createdFrom: 'estimate (📤 Send estimate)', createdBy: meName() };   /* SENDEST2 */""")
# the uploaded copy on the job is the same file as the sent v1: one entry on the job, not two
rep("""  patchDocs(function(d){ return d && s(d.estimateId) === s(e.id) && d.sentPdf === true && s(d.id) !== id && (+d.version || 0) < (+v.version || 1) && !d.supersededBy; }, { supersededBy: id, supersededAt: nowIso() });""",
    """  patchDocs(function(d){ return d && s(d.estimateId) === s(e.id) && ((d.sentPdf === true && s(d.id) !== id && (+d.version || 0) < (+v.version || 1)) || (s(d.source) === 'estimate-upload' && s(d.ref) === s(v.ref))) && !d.supersededBy; }, { supersededBy: id, supersededAt: nowIso() });   /* SENDEST2 */""")
rep("""W._gcEstPdf = { makeProposal: makeProposal,""", """W._gcEstPdf = { openNewPdf: openNewPdf, uploadNew: uploadNew, showPdf: showPdf, standalone: standaloneApp, makeProposal: makeProposal,""")
open(P, 'w').write(src); print('patched SENDEST2')
