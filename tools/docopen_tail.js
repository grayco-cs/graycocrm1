<script id="gc-patch-docopen">
/* __GC_PATCH_DOCOPEN__ — a document opens as a page INSIDE the CRM, never a pop-up (owner 11/03, iPhone, Field → job
   → Documents): tapping "GrayCo_Proposal_Potts_Flooring.docx" left a new Safari sheet stuck on about:blank (the CRM opened
   an empty window in the tap, then sent it a blob: address after reading the file — Safari loses that; a data: address
   is refused outright); Safari also asked "allow pop-up?"; and a job paper (Scope of Work) opened full screen in a new
   tab with no way back. "I don't want a pop-up. I want it as a page where I can choose to download, but also I need to
   be able to go back."
   window._gcViewer.open({ name, ref | data | html, type, print, edit }) — a full-screen page in the same tab:
     · a sticky top bar: ‹ Back · the file name · ⬇️ Download · 📤 Share (the phone's share sheet with the file) · 🖨 Print
       (papers / HTML) — and ✏️ Edit when the opener gives one;
     · the body: a PDF as page pictures (pdf.js, the CRM's reader; else the browser's own viewer), a picture, a Word .docx
       as readable text (mammoth), a paper / HTML page in a frame; anything else: "Preview not available" + Download / Share.
     · ‹ Back and the phone's Back (the NAV patch's Back closes the top screen through its "‹ Back") return to the list.
   Used by: Field 📄 Documents (every file, every job paper), the job papers (_gcDocLib.open), every file reference the
   CRM opens (_gcOpenRef: desk links too) and the CRM's generated documents (_gcOpenDocHTML). Downloads stay downloads. */
(function(){
'use strict';
if (window.__GC_PATCH_DOCOPEN__) return; window.__GC_PATCH_DOCOPEN__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', html: 'text/html', htm: 'text/html', txt: 'text/plain', csv: 'text/csv', svg: 'image/svg+xml' };
function extOf(n){ var m = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(s(n)); return m ? m[1].toLowerCase() : ''; }
function kindOf(type, name){
  var t = s(type).toLowerCase(), e = extOf(name);
  if (/pdf/.test(t) || e === 'pdf') return 'pdf';
  if (/^image\//.test(t) || /^(jpe?g|png|gif|webp|svg|bmp)$/.test(e)) return 'img';
  if (/wordprocessingml/.test(t) || e === 'docx') return 'docx';
  if (/html/.test(t) || /^html?$/.test(e)) return 'html';
  if (/^text\//.test(t) || /^(txt|csv)$/.test(e)) return 'text';
  return 'other';
}
function loadScript(src){ return new Promise(function(res){ var x = D.createElement('script'); x.src = src; x.onload = function(){ res(true); }; x.onerror = function(){ res(false); }; D.head.appendChild(x); later(function(){ res(false); }, 15000); }); }
var PDFJS = null, MAMMOTH = null;
function pdfjs(){
  if (W.pdfjsLib && !W.pdfjsLib.__gcLocal && W.pdfjsLib.getDocument) return Promise.resolve(W.pdfjsLib);
  if (PDFJS) return PDFJS;
  var local = W.pdfjsLib && W.pdfjsLib.__gcLocal ? W.pdfjsLib : null;
  return (PDFJS = loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').then(function(ok){
    if (ok && W.pdfjsLib && !W.pdfjsLib.__gcLocal) { try { W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch (e) {} return W.pdfjsLib; }
    if (local && !W.pdfjsLib) W.pdfjsLib = local; PDFJS = null; return null;
  }));
}
function mammoth(){ if (W.mammoth && W.mammoth.convertToHtml) return Promise.resolve(W.mammoth); if (MAMMOTH) return MAMMOTH; return (MAMMOTH = loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js').then(function(ok){ if (ok && W.mammoth) return W.mammoth; MAMMOTH = null; return null; })); }
function css(){
  if (D.getElementById('gc-viewer-css')) return;
  var st = D.createElement('style'); st.id = 'gc-viewer-css';
  st.textContent = '#gc-viewer{position:fixed;inset:0;z-index:2147483400;background:#e9eef4;display:flex;flex-direction:column;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;color:#14202e}' +
    '#gc-viewer .gv-bar{position:sticky;top:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;background:#0f2440;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2)}' +
    '#gc-viewer .gv-bar b{flex:1 1 140px;min-width:0;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#gc-viewer .gv-b{min-height:44px;min-width:44px;padding:0 12px;border-radius:10px;border:0;background:#1e3a5f;color:#fff;font:700 14px Inter,-apple-system,Arial,sans-serif;cursor:pointer}#gc-viewer .gv-b[data-gv="back"]{background:#fff;color:#0f2440;font-size:15px}' +
    '#gc-viewer .gv-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:10px;box-sizing:border-box}#gc-viewer .gv-page{display:block;width:100%;max-width:900px;margin:0 auto 10px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.15)}' +
    '#gc-viewer iframe.gv-page{height:calc(100vh - 90px);border:0}#gc-viewer .gv-msg{max-width:560px;margin:30px auto;background:#fff;border-radius:12px;padding:18px;font-size:15px;line-height:1.5;text-align:center}' +
    '#gc-viewer .gv-doc{max-width:820px;margin:0 auto;background:#fff;padding:22px;box-sizing:border-box;font:15px/1.55 Georgia,serif;overflow-wrap:anywhere}#gc-viewer .gv-doc img{max-width:100%}';
  D.head.appendChild(st);
}
var CUR = null;
function close(){ var v = D.getElementById('gc-viewer'); if (v) v.remove(); if (CUR && CUR.url) { try { URL.revokeObjectURL(CUR.url); } catch (e) {} } CUR = null; }
function blobOf(o){
  if (o.blob instanceof Blob) return Promise.resolve(o.blob);
  if (s(o.html)) return Promise.resolve(new Blob([o.html], { type: 'text/html' }));
  if (s(o.ref) && W._gcFileBlob) return Promise.resolve(W._gcFileBlob(o.ref));
  var d = s(o.data);
  if (/^data:/.test(d)) { try { var m = /^data:([^;,]*)(;base64)?,(.*)$/.exec(d), raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), b = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i); return Promise.resolve(new Blob([b], { type: m[1] || o.type || '' })); } catch (e) { return Promise.reject(e); } }
  if (/^(https?:|blob:)/.test(d)) return W.fetch(d).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); });
  return Promise.reject(new Error('no file'));
}
function fileName(o, type){ var n = s(o.name) || 'Document', e = extOf(n); if (!e) { var k = Object.keys(MIME).filter(function(x){ return MIME[x] === type; })[0]; if (k) n += '.' + k; } return n.replace(/[\\/:*?"<>|]/g, '-'); }
function open(o){
  o = o || {}; close(); css();
  var v = D.createElement('div'); v.id = 'gc-viewer'; v.setAttribute('data-gc-keep', '1'); v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', s(o.name) || 'Document');
  v.innerHTML = '<div class="gv-bar"><button type="button" class="gv-b" data-gv="back" aria-label="Back">‹ Back</button><b>' + esc(o.name || 'Document') + '</b>' +
    (typeof o.edit === 'function' ? '<button type="button" class="gv-b" data-gv="edit">✏️ Edit</button>' : '') +
    '<button type="button" class="gv-b" data-gv="dl" aria-label="Download">⬇️ Download</button><button type="button" class="gv-b" data-gv="share" aria-label="Share">📤 Share</button>' +
    '<button type="button" class="gv-b" data-gv="print" hidden>🖨 Print</button></div><div class="gv-body" data-gv-body><div class="gv-msg">Opening ' + esc(o.name || 'the document') + '…</div></div>';
  D.body.appendChild(v);
  var cur = CUR = { o: o, v: v, blob: null, file: null, url: '' }, body = v.querySelector('[data-gv-body]');
  var msg = function(h){ body.innerHTML = '<div class="gv-msg">' + h + '</div>'; };
  v.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-gv]'); if (!b) return; var a = b.getAttribute('data-gv');
    if (a === 'back') { close(); if (typeof o.onClose === 'function') try { o.onClose(); } catch (e) {} return; }
    if (a === 'edit') { close(); try { o.edit(); } catch (e) {} return; }
    if (a === 'print') { var fr = body.querySelector('iframe'); try { if (fr && fr.contentWindow) { fr.contentWindow.focus(); fr.contentWindow.print(); } else W.print(); } catch (e) { W.print(); } return; }
    if (!cur.file) { msg('The file is still loading — try again in a moment.'); return; }
    if (a === 'share' && W.navigator && typeof W.navigator.share === 'function' && (!W.navigator.canShare || W.navigator.canShare({ files: [cur.file] }))) {
      W.navigator.share({ files: [cur.file], title: cur.file.name }).then(null, function(err){ if (!(err && err.name === 'AbortError')) download(cur); }); return;
    }
    download(cur);
  });
  blobOf(o).then(function(blob){
    if (CUR !== cur) return;
    var type = s(o.type) || s(blob.type) || MIME[extOf(o.name)] || 'application/octet-stream', name = fileName(o, type);
    if (!blob.type || blob.type !== type) blob = new Blob([blob], { type: type });
    cur.blob = blob; cur.file = new File([blob], name, { type: type }); cur.url = URL.createObjectURL(blob);
    var k = s(o.html) ? 'html' : kindOf(type, name);
    if (k === 'html') return blob.text().then(function(h){
      var fr = D.createElement('iframe'); fr.className = 'gv-page'; fr.title = name;
      if (!s(o.html)) fr.setAttribute('sandbox', 'allow-modals allow-same-origin');   /* an uploaded page: shown, its scripts never run */
      body.innerHTML = ''; body.appendChild(fr); fr.srcdoc = h; v.querySelector('[data-gv="print"]').hidden = false;
    });
    if (k === 'img') { body.innerHTML = '<img class="gv-page" alt="' + esc(name) + '" src="' + cur.url + '">'; return; }
    if (k === 'text') return blob.text().then(function(t){ body.innerHTML = '<pre class="gv-doc" style="white-space:pre-wrap;font:14px/1.5 ui-monospace,Menlo,monospace">' + esc(t.slice(0, 400000)) + '</pre>'; });
    if (k === 'pdf') return pdfjs().then(function(lib){
      if (CUR !== cur) return;
      if (!lib) { body.innerHTML = '<iframe class="gv-page" title="' + esc(name) + '" src="' + cur.url + '"></iframe>'; return; }
      return blob.arrayBuffer().then(function(ab){ return lib.getDocument({ data: new Uint8Array(ab) }).promise; }).then(function(pdf){
        body.innerHTML = ''; var n = Math.min(pdf.numPages, 60), chain = Promise.resolve();
        for (var i = 1; i <= n; i++) (function(i){ chain = chain.then(function(){ if (CUR !== cur) return; return pdf.getPage(i).then(function(pg){
          var vp0 = pg.getViewport({ scale: 1 }), sc = Math.min(2.5, Math.max(1, (Math.min(W.innerWidth, 900) * (W.devicePixelRatio || 1)) / vp0.width)), vp = pg.getViewport({ scale: sc });
          var cv = D.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(function(){ var im = D.createElement('img'); im.className = 'gv-page'; im.alt = name + ' — page ' + i; im.src = cv.toDataURL('image/jpeg', 0.9); body.appendChild(im); });
        }); }); })(i);
        return chain;
      }, function(){ body.innerHTML = '<iframe class="gv-page" title="' + esc(name) + '" src="' + cur.url + '"></iframe>'; });
    });
    if (k === 'docx') return mammoth().then(function(m){
      if (!m) { msg('A Word file — the preview could not load here.<br><br>Use ⬇️ Download or 📤 Share to open it.'); return; }
      return blob.arrayBuffer().then(function(ab){ return m.convertToHtml({ arrayBuffer: ab }); }).then(function(r){
        var fr = D.createElement('iframe'); fr.className = 'gv-page'; fr.title = name; fr.setAttribute('sandbox', 'allow-same-origin');
        body.innerHTML = ''; body.appendChild(fr);
        fr.srcdoc = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px/1.55 Georgia,serif;color:#14202e;padding:18px;margin:0;overflow-wrap:anywhere}img{max-width:100%}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ccd;padding:4px}</style>' + s(r && r.value);
      }, function(){ msg('A Word file — this one cannot be previewed.<br><br>Use ⬇️ Download or 📤 Share to open it.'); });
    });
    msg('Preview not available for this kind of file.<br><br>Use ⬇️ Download or 📤 Share to open it.');
  }).catch(function(e){ if (CUR === cur) msg('This file cannot be opened right now (' + esc(e && e.message || 'offline') + ').'); });
  return v;
}
function download(cur){ var a = D.createElement('a'); a.href = cur.url; a.download = cur.file.name; a.rel = 'noopener'; a.style.display = 'none'; D.body.appendChild(a); a.click(); later(function(){ a.remove(); }, 2000); }
W._gcViewer = { open: open, close: close, kindOf: kindOf };

try { console.log('[GC] 📄 Documents open as a page in the CRM — ‹ Back, ⬇️ Download, 📤 Share (patch DOCOPEN) — _gcViewer'); } catch (e) {}
})();
</script>
