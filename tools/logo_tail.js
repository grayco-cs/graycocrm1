/* __GC_PATCH_LOGO__ — owner (10/26): "every document the CRM produces carries the GrayCo logo".
   ONE shared header for every printed / PDF paper, so a document added later gets it without being touched:
     window._gcDocHeader(opts)      HTML header: the colour logo at the LEFT (0.7 in tall), beside it "GrayCo Construction Services",
                                    address · phone 901-585-0944 · web, and the license line TN #85034 BCB · AR #0486990627 · MS #27769.
                                    opts: { email, noLicense, address:false }.  (_gcPrintHead / _gcEstLogoHeader / _gcBrandPrintHtml now use it.)
     window._gcPdfLogo(doc, opts)   jsPDF header (same layout) → returns the y below it.  GC_pdfHeader / _gcPdfHeaderCentered call it.
   Fallbacks (so nothing slips through):
     * every browser window the CRM opens for a printable document that lacks the logo gets the header injected (and a small
       "GrayCo Construction Services · 901-585-0944 · page n" footer on printed pages 2+ where the browser supports page margin boxes);
     * every jsPDF document: if no logo was drawn on page 1 a small one is added when it is saved / output, and pages 2+ get a
       one-line company footer.
   Test hooks: _gcLogoEnsure(win), _gcLogoStats(). */
(function(){
'use strict';
if (window.__GC_PATCH_LOGO__) return; window.__GC_PATCH_LOGO__ = true;
var W = window, D = document;
var NAME = 'GrayCo Construction Services', PHONE = '901-585-0944', WEB = 'grayco-cs.com', LIC = 'TN #85034 BCB · AR #0486990627 · MS #27769';
var LOGO_RATIO = 420 / 254;                       /* GC_LOGO_PRINT: the colour logo, 420 x 254 */
/* the white logo (img/grayco-logo-white.png, 340 wide) for the few dark header bands */
W.GC_LOGO_WHITE = W.GC_LOGO_WHITE || 'data:image/png;base64,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';
var STATS = W._gcLogoStats = { injectedWindows: 0, pdfLogos: 0, pdfFooters: 0 };
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[GC logo]', e); } catch (x) {} }
function coAddr(){ try { return s(W._gcCompanyAddress ? W._gcCompanyAddress() : W.GC_ADDR); } catch (e) { return s(W.GC_ADDR); } }
function logoSrc(){
  try { if (W.GC_LOGO_PRINT) return W.GC_LOGO_PRINT; } catch (e) {}
  return 'https://crm.grayco-cs.com/grayco-logo.jpg';
}
/* is this html string / image src already a GrayCo logo? (white-on-dark logos count: the paper has its logo) */
function srcIsLogo(src){
  src = s(src); if (!src) return false;
  try { if (W.GC_LOGO_PRINT && src.indexOf(W.GC_LOGO_PRINT.slice(0, 96)) >= 0) return true; } catch (e) {}
  try { if (W.GC_LOGO_B64 && src.indexOf(W.GC_LOGO_B64.slice(0, 64)) >= 0) return true; } catch (e) {}
  try { if (W.GC_LOGO_WHITE && src.indexOf(W.GC_LOGO_WHITE.slice(0, 96)) >= 0) return true; } catch (e) {}
  return /grayco[-_]?logo|portal-logo|logo-white/i.test(src.length > 400 ? src.slice(0, 400) : src);
}

function htmlHasLogo(h){
  h = String(h || '');
  if (/data-gc-logo/.test(h)) return true;
  try { if (W.GC_LOGO_PRINT && h.indexOf(W.GC_LOGO_PRINT.slice(0, 96)) >= 0) return true; } catch (e) {}
  try { if (W.GC_LOGO_B64 && h.indexOf(W.GC_LOGO_B64.slice(0, 64)) >= 0) return true; } catch (e) {}
  try { if (W.GC_LOGO_WHITE && h.indexOf(W.GC_LOGO_WHITE.slice(0, 96)) >= 0) return true; } catch (e) {}
  return /<img[^>]+(grayco[-_]?logo|portal-logo|logo-white)/i.test(h);
}

/* ── 1. the HTML header ─────────────────────────────────────────────────────────────────────── */
W._gcDocHeader = function(o){
  o = o || {};
  var a = o.address === false ? '' : coAddr(), dual = !!o.dual, dk = !!o.dark || dual;
  var line2 = [a, PHONE, s(o.email), WEB].filter(Boolean).map(esc).join(' \u00B7 ');
  var lw = Math.round(67 * (dk ? 340 / 192 : LOGO_RATIO)), lc = Math.round(67 * LOGO_RATIO);
  var tdn = 'border:none;padding:0;background:none;vertical-align:middle;text-align:left;';
  var img = function(src, cls, w){ return '<img data-gc-logo-img="1" class="' + cls + '" src="' + esc(src) + '" alt="' + NAME + '" width="' + w + '" height="67" style="height:0.7in;width:auto;margin:0;border:0' + (dual ? '' : ';display:block') + '">'; };
  /* a table (not flex) so Word, e-mail and every browser lay it out the same;
     dual: a dark screen page whose print version is white (white logo on screen, colour logo on paper) */
  return (dual ? '<style>.gc-dual img{display:block}.gc-dual .gc-p{display:none}@media print{.gc-dual .gc-d{display:none!important}.gc-dual .gc-p{display:block!important}.gc-dual .gc-t1{color:#0f2440!important;-webkit-text-fill-color:#0f2440!important}.gc-dual .gc-t2{color:#333!important}.gc-dual .gc-t3{color:#555!important}}</style>' : '')
    + '<div data-gc-logo="1" class="gc-doc-head' + (dual ? ' gc-dual' : '') + '" style="font-family:Arial,Helvetica,sans-serif;' + (dk ? 'margin:0;padding:0;' : 'border-bottom:2px solid #241968;padding:0 0 10px;margin:0 0 14px;') + 'page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact">'
    + '<table style="border:none;border-collapse:collapse;width:auto;margin:0;background:none"><tr>'
    + '<td style="' + tdn + 'width:1%;padding-right:14px;white-space:nowrap">' + (dual ? img(W.GC_LOGO_WHITE, 'gc-d', lw) + img(logoSrc(), 'gc-p', lc) : img(dk ? W.GC_LOGO_WHITE : logoSrc(), '', lw)) + '</td>'
    + '<td style="' + tdn + 'line-height:1.4"><div class="gc-t1" style="font-size:15pt;font-weight:800;color:' + (dk ? '#fff' : '#0f2440') + ';letter-spacing:.3px">' + NAME + '</div>'
    + '<div class="gc-t2" style="font-size:9.5pt;font-weight:400;color:' + (dk ? '#cfd8e6' : '#333') + '">' + line2 + '</div>'
    + (o.noLicense ? '' : '<div class="gc-t3" style="font-size:8.5pt;font-weight:400;color:' + (dk ? '#9fb0c8' : '#555') + '">' + LIC + '</div>') + '</td></tr></table></div>';
};
/* the older helpers all become the one header */
W._gcPrintHead = function(o){ return W._gcDocHeader(o); };
W._gcEstLogoHeader = function(html){ return W._gcDocHeader({ noLicense: /License/i.test(String(html || '')) }); };

/* string level: add the header after <body> unless the page already carries a logo (HOT3's wrapper, kept) */
W._gcBrandPrintHtml = function(html){
  try {
    html = String(html == null ? '' : html);
    if (!html || htmlHasLogo(html)) return html;
    var hdr = W._gcEstLogoHeader(html);
    if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, function(m){ return m + hdr; });
    return hdr + html;
  } catch (e) { return html; }
};

/* ── 2. the jsPDF header ────────────────────────────────────────────────────────────────────── */
function drawLogo(doc, x, y, h){
  var w = h * LOGO_RATIO;
  try { if (W.GC_LOGO_PRINT) { doc.addImage(W.GC_LOGO_PRINT, 'JPEG', x, y, w, h); return w; } } catch (e) { warn(e); }
  return 0;
}
W._gcPdfLogo = function(doc, opts){
  opts = opts || {};
  var PW = doc.internal.pageSize.getWidth(), m = opts.m || 48, y = opts.y || 40, lh = 50;   /* 50 pt = 0.7 in */
  var lw = drawLogo(doc, m, y, lh); if (lw) STATS.pdfLogos++;
  try { doc.__gcLogoPages = doc.__gcLogoPages || {}; doc.__gcLogoPages[doc.internal.getCurrentPageInfo().pageNumber] = true; } catch (e) {}
  var tx = m + (lw ? lw + 12 : 0), maxW = PW - m - tx - (opts.rightW == null ? 0 : opts.rightW);
  function fit(txt, size, bold){ doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); try { while (size > 6 && doc.getTextWidth(txt) > maxW) { size -= 0.25; doc.setFontSize(size); } } catch (e) {} doc.text(txt, tx, 0); }
  function line(txt, size, bold, color, ty){ doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
    try { while (size > 6 && doc.getTextWidth(txt) > maxW) { size -= 0.25; doc.setFontSize(size); } } catch (e) {} doc.text(txt, tx, ty); }
  line(NAME, 16, true, [15, 36, 64], y + 16);
  var l2 = [s(W.GC_ADDR) || coAddr(), PHONE, s(opts.email), WEB].filter(Boolean).join('  •  ');
  line(l2, 8.5, false, [60, 70, 85], y + 30);
  if (!opts.noLicense) line(LIC, 8, false, [90, 100, 115], y + 42);
  var ry = y + lh + 6;
  doc.setDrawColor(36, 25, 104); doc.setLineWidth(1.5); doc.line(m, ry, PW - m, ry);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  return ry + 24;
};
W._gcPdfHeaderCentered = W._gcPdfLogo;          /* GC_pdfHeader and the estimate PDFs call this name */

/* later pages: a one-line company footer; page 1 without a logo: a small one in the top margin */
function finalizePdf(doc){
  try {
    if (!doc || !doc.internal || doc.__gcFinal === 'busy') return;
    doc.__gcFinal = 'busy';
    var n = doc.internal.getNumberOfPages(), cur = doc.internal.getCurrentPageInfo().pageNumber;
    var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    var font = null, size = 10, color = '#000000';
    try { font = doc.getFont(); size = doc.getFontSize(); color = doc.getTextColor(); } catch (e) {}
    doc.__gcLogoPages = doc.__gcLogoPages || {}; doc.__gcFooterPages = doc.__gcFooterPages || {};
    if (!doc.__gcLogoPages[1] && !doc.__gcNoLogo && !doc.__gcFooterOnly) {
      doc.setPage(1);
      var lw = drawLogo(doc, 36, 8, 26);
      if (lw) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 36, 64); doc.text(NAME, 36 + lw + 8, 21); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 100, 115); doc.text(PHONE, 36 + lw + 8, 31); doc.__gcLogoPages[1] = true; STATS.pdfLogos++; }
    }
    for (var p = 2; p <= n; p++) {
      if (doc.__gcFooterPages[p]) continue;
      doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 128, 140);
      doc.text(NAME + '  ·  ' + PHONE + '  ·  page ' + p + ' of ' + n, PW / 2, PH - 14, { align: 'center' });
      doc.__gcFooterPages[p] = true; STATS.pdfFooters++;
    }
    doc.setPage(cur);
    try { if (font) doc.setFont(font.fontName, font.fontStyle); doc.setFontSize(size); doc.setTextColor(color); } catch (e) {}
    doc.__gcFinal = '';
  } catch (e) { try { doc.__gcFinal = ''; } catch (x) {} warn(e); }
}
function instrument(doc, o){
  if (!doc || doc.__gcLogoInst) return doc;
  doc.__gcLogoInst = true; if (o && o.footerOnly) doc.__gcFooterOnly = true;
  var ai = doc.addImage;
  if (typeof ai === 'function') doc.addImage = function(a){
    try {
      var src = a && typeof a === 'object' && !a.nodeType ? a.imageData : a;
      if (typeof src === 'string' && srcIsLogo(src)) { doc.__gcLogoPages = doc.__gcLogoPages || {}; doc.__gcLogoPages[doc.internal.getCurrentPageInfo().pageNumber] = true; }
    } catch (e) {}
    return ai.apply(this, arguments);
  };
  ['output', 'save', 'autoPrint'].forEach(function(k){
    var o = doc[k]; if (typeof o !== 'function') return;
    doc[k] = function(){ finalizePdf(doc); return o.apply(this, arguments); };
  });
  return doc;
}
function wrapNs(ns){
  try {
    var J = ns && ns.jsPDF;
    if (!J || J.__gcLogo) return;
    var J2 = function(){
      var a = [null].concat([].slice.call(arguments));
      var doc = new (Function.prototype.bind.apply(J, a))();
      return instrument(doc);
    };
    J2.prototype = J.prototype;
    try { Object.keys(J).forEach(function(k){ if (k !== '__orig' && k !== '__gcAut') J2[k] = J[k]; }); } catch (e) {}
    J2.API = J.API; J2.version = J.version; J2.__gcLogo = true;
    ns.jsPDF = J2;
    try { if (W.jsPDF === J) W.jsPDF = J2; } catch (e) {}
  } catch (e) { warn(e); }
}
/* jsPDF is loaded from a script tag at different places, so watch window.jspdf itself */
(function(){
  var cur = W.jspdf;
  try {
    Object.defineProperty(W, 'jspdf', { configurable: true, enumerable: true,
      get: function(){ if (cur) wrapNs(cur); return cur; },
      set: function(v){ cur = v; } });
  } catch (e) { warn(e); }
  if (cur) wrapNs(cur);
})();

/* html2pdf.js (HTML -> PDF) makes its own jsPDF: its page 1 carries the HTML header; pages 2+ get the company footer */
(function(){
  var cur = W.html2pdf;
  function wrapH(h){
    try {
      if (!h || h.__gcLogo || !h.Worker || !h.Worker.prototype || typeof h.Worker.prototype.toPdf !== 'function') return;
      var P = h.Worker.prototype, o = P.toPdf;
      P.toPdf = function(){ var r = o.apply(this, arguments); return r.then(function(){ try { instrument(this.prop.pdf, { footerOnly: true }); } catch (e) { warn(e); } }); };
      h.__gcLogo = true;
    } catch (e) { warn(e); }
  }
  try {
    Object.defineProperty(W, 'html2pdf', { configurable: true, enumerable: true, get: function(){ if (cur) wrapH(cur); return cur; }, set: function(v){ cur = v; } });
  } catch (e) { warn(e); }
  if (cur) wrapH(cur);
})();

/* ── 3. any window the CRM opens for a printable document ───────────────────────────────────── */
var FOOT_CSS = '@page{@bottom-center{content:"' + NAME + ' \\00B7  ' + PHONE + ' \\00B7  page " counter(page);font:7.5pt Arial,Helvetica,sans-serif;color:#667}}@page :first{@bottom-center{content:""}}';
function hasHeader(d){
  try {
    if (d.querySelector('[data-gc-logo]')) return true;
    var imgs = d.images || d.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) { var im = imgs[i], sc = im.getAttribute('src') || ''; if (srcIsLogo(sc) || /\blogo\b/i.test(im.className || '')) return true; }
  } catch (e) {}
  return false;
}
function looksLikeDoc(d){
  try {
    if (!d || !d.body || d.contentType !== 'text/html') return false;
    if (d.documentElement.hasAttribute('data-gc-nologo') || d.body.hasAttribute('data-gc-nologo')) return false;
    if (/^\s*Preparing/i.test(d.title || '')) return false;
    var t = (d.body.innerText || d.body.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length < 80) return false;
    var kids = d.body.children, onlyFrame = kids.length === 1 && /^(IFRAME|EMBED|OBJECT|IMG)$/.test(kids[0].tagName);
    return !onlyFrame;
  } catch (e) { return false; }
}
function ensure(win){
  try {
    var d = win.document, root = d.documentElement;
    if (!root || root.hasAttribute('data-gc-logo-done')) return false;
    if (!looksLikeDoc(d)) return false;
    var added = false;
    if (!hasHeader(d)) {
      var box = d.createElement('div'); box.innerHTML = W._gcDocHeader({});
      var el = box.firstChild; el.setAttribute('data-gc-logo-injected', '1');
      /* after a leading toolbar / print button row, never inside it */
      d.body.insertBefore(el, d.body.firstChild); added = true;
    }
    if (!d.getElementById('gc-logo-foot')) { var st = d.createElement('style'); st.id = 'gc-logo-foot'; st.textContent = FOOT_CSS; (d.head || root).appendChild(st); }
    root.setAttribute('data-gc-logo-done', added ? 'injected' : 'has');
    if (added) STATS.injectedWindows++;
    return added;
  } catch (e) { return false; }   /* cross-origin / closed window */
}
W._gcLogoEnsure = ensure;
W._gcPdfFinish = function(doc, o){ instrument(doc, o); finalizePdf(doc); return doc; };   /* for a generator that builds its own jsPDF: footer / fallback logo now */
/* arm a window the moment it is opened: document.close(), print(), the load events and the window's OWN timer all run ensure()
   (the opener's timers are throttled once the new tab takes the screen, so we do not wait for them) */
function arm(w){
  try { var d0 = w.document; if (d0 && !d0.__gcLogoHook) { d0.__gcLogoHook = 1; var c = d0.close; if (typeof c === 'function') d0.close = function(){ var r = c.apply(this, arguments); try { ensure(w); } catch (e) {} return r; }; } } catch (e) {}
  try { if (!w.__gcLogoArmed) { w.__gcLogoArmed = 1;
    ['DOMContentLoaded', 'load', 'pageshow', 'beforeprint'].forEach(function(ev){ w.addEventListener(ev, function(){ try { ensure(w); } catch (e) {} }); });
    var pr = w.print; if (typeof pr === 'function') w.print = function(){ try { ensure(w); } catch (e) {} return pr.apply(this, arguments); };
    var n2 = 0, iv2 = w.setInterval(function(){ try { if (++n2 > 120) { w.clearInterval(iv2); return; } ensure(w); } catch (e) { try { w.clearInterval(iv2); } catch (x) {} } }, 100); } } catch (e) {}
}
function watch(w){
  arm(w);
  var n = 0, bad = 0, iv = setInterval(function(){
    n++;
    try {
      if (w.closed || n > 260) { clearInterval(iv); return; }
      var d = w.document; if (!d || !d.documentElement) return;
      bad = 0; arm(w);                                                        /* a replaced document / navigated window is armed again */
      if (d.documentElement.hasAttribute('data-gc-logo-done')) return;       /* a replaced document loses the mark: keep watching */
      ensure(w);
    } catch (e) { if (++bad > 30) clearInterval(iv); }                       /* cross-origin while loading is normal; a file url stays cross-origin: give up */
  }, 80);
}
(function(){
  var o = W.open; if (typeof o !== 'function' || o.__gcLogo) return;
  var w = function(url){
    var r = o.apply(this, arguments);
    try { if (r && (url == null || url === '' || /^(about:blank|blob:)/i.test(String(url)))) watch(r); } catch (e) {}
    return r;
  };
  try { Object.keys(o).forEach(function(k){ w[k] = o[k]; }); } catch (e) {}
  w.__gcLogo = true; W.open = w;
})();
/* the shared "open this document" helper, also when pop-ups are blocked and it shows on the page */
(function(){
  var o = W._gcOpenDocHTML; if (typeof o !== 'function' || o.__gcLogo) return;
  var w = function(h){ try { if (Array.isArray(h)) h = h.join(''); if (typeof h === 'string' && /<body/i.test(h) && !/data-gc-nologo/.test(h)) h = W._gcBrandPrintHtml(h); } catch (e) {} return o.call(this, h); };
  w.__gcLogo = true; W._gcOpenDocHTML = w;
})();
try { console.log('[GC] One logo header for every document: _gcDocHeader / _gcPdfLogo, window + jsPDF fallbacks (patch LOGO)'); } catch (e) {}
})();
