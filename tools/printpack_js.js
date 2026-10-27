/* __GC_PATCH_PRINTPACK__ — 🖨 PRINT PACK (patch PRINTPACK)
   Owner: "make sure all my print pack, brochures, pamphlets etc are in my CRM and I can send the link to print front and back
   to someone and it prints correctly with each document."
   Marketing → 🖨 Print pack (also 💎 → Print pack): one card per piece with front/back preview, Print (opens the PDF), Copy link,
   E-mail link (your own @grayco-cs.com composer, person to person) and Text link, and the print settings for that piece.
   The PDFs are static files in /print/ (built by tools/printpack/, see tools/patch_PRINTPACK.py); /print/ is a public page
   a print shop can open. OFFICE = desk printer on Letter paper; PRINTSHOP = 0.125 in bleed + crop marks. No customer data. */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_PRINTPACK__) return; W.__GC_PATCH_PRINTPACK__ = true;
var nST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var PIECES = __PIECES__;
var BASE = 'https://crm.grayco-cs.com/print/';
var ZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var ZIP_SRI = 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==';
var PP = { prev: '', zip: '' };
function abs(file){ return BASE + file; }
function rel(file){ return 'print/' + file; }
function piece(slug){ return PIECES.filter(function(p){ return p.slug === slug; })[0] || null; }
function variant(p, v){ return v === 'shop' && p.shop ? { file: p.slug + '-printshop.pdf', how: p.shop, label: 'PRINTSHOP' } : { file: p.slug + '.pdf', how: p.office, label: 'OFFICE' }; }

var X = null, tries = 0;
function boot(){ X = W._gcMktExt; if (!X) { if (tries++ < 120) nST(boot, 500); return; } install(); }
nST(boot, 0);

function install(){
var SECS = X.SECS, VIEWS = X.VIEWS, ACT = X.ACT, esc = X.esc, s = X.s, toast = X.toast;
if (!SECS.some(function(y){ return y.id === 'printpack'; })) {
  var at = -1; SECS.forEach(function(y, i){ if (y.id === 'brand') at = i; });
  SECS.splice(at >= 0 ? at : SECS.length, 0, { id: 'printpack', ic: '🖨', l: 'Print pack', d: 'Brochures, flyers, door hangers, customer guides — print, or send the link to a print shop' });
}
if (X.PM_SECS.indexOf('printpack') < 0) X.PM_SECS.push('printpack');   /* PMs print hangers and forms too; nothing here is private */

function btn(a, label, attrs, cls){ return '<button class="gmt-btn ' + (cls || 'o') + '" data-a="' + a + '"' + (attrs || '') + '>' + label + '</button>'; }
function sendRow(file, slug, v){
  var at = ' data-f="' + esc(file) + '" data-s="' + esc(slug) + '" data-v="' + v + '"';
  return btn('pp-print', '🖨 Print', at, '') + btn('pp-copy', '🔗 Copy link', at) + btn('pp-mail', '✉️ E-mail link', at) + btn('pp-text', '📱 Text link', at);
}
VIEWS.printpack = function(){
  var h = '<div class="gmt-card"><h2>🖨 Print pack</h2><div>Every GrayCo brochure, flyer, door hanger and customer guide as a print-ready PDF. <b>Page 1 is the front, page 2 is the back</b> — print double-sided with the setting shown on each card, at <b>100% / Actual size</b> (never “Fit to page”).</div>' +
    '<div class="gmt-muted" style="margin-top:6px"><b>OFFICE</b> = Letter paper on the office printer. <b>PRINTSHOP</b> = the same piece with 0.125 in bleed + crop marks for a print shop. Send a shop one link to the whole pack: <a href="' + BASE + '" target="_blank" rel="noopener">' + BASE + '</a></div>' +
    '<div class="gmt-row" style="margin-top:8px">' + btn('pp-copy', '🔗 Copy the print-shop page link', ' data-f="" data-s="" data-v="all"') + btn('pp-mail', '✉️ E-mail it', ' data-f="" data-s="" data-v="all"') + btn('pp-text', '📱 Text it', ' data-f="" data-s="" data-v="all"') +
    btn('pp-zip', PP.zip ? esc(PP.zip) : '⬇ Download all (zip)', PP.zip ? ' disabled' : '') + '</div></div>';
  if (PP.prev) {
    var q = piece(PP.prev);
    if (q) h += '<div class="gmt-card" data-pp-preview="' + esc(q.slug) + '"><div class="gmt-row" style="justify-content:space-between"><h2 style="margin:0">' + esc(q.title) + '</h2>' + btn('pp-prev', '✕ Close preview', ' data-s=""') + '</div>' +
      '<div class="gmt-row" style="align-items:flex-start;margin-top:8px">' + q.thumbs.map(function(t, i){ return '<figure style="margin:0;flex:1;min-width:220px;max-width:520px"><img src="' + rel('thumbs/' + t) + '" alt="' + esc(q.title) + ' page ' + (i + 1) + '" style="width:100%;border:1px solid #dce3ee;border-radius:6px;background:#fff"><figcaption class="gmt-muted">Page ' + (i + 1) + (q.thumbs.length > 1 ? (i ? ' — back' : ' — front') : '') + '</figcaption></figure>'; }).join('') + '</div></div>';
  }
  h += '<div class="gmt-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">' + PIECES.map(function(p){
    var o = variant(p, 'office'), sh = p.shop ? variant(p, 'shop') : null;
    return '<div class="gmt-card" style="margin:0" data-pp="' + esc(p.slug) + '"><div class="gmt-row" style="align-items:flex-start;flex-wrap:nowrap">' +
      '<img src="' + rel('thumbs/' + p.thumbs[0]) + '" alt="" loading="lazy" data-a="pp-prev" data-s="' + esc(p.slug) + '" style="width:110px;flex:none;border:1px solid #dce3ee;border-radius:6px;cursor:zoom-in;background:#fff">' +
      '<div style="min-width:0"><span class="gmt-chip">' + esc(p.kind) + '</span><b style="display:block;margin:4px 0 2px">' + esc(p.title) + '</b><div class="gmt-muted">' + esc(p.size) + '</div><div class="gmt-muted">' + esc(p.use) + '</div>' +
      '<div style="margin-top:6px">' + btn('pp-prev', '👁 Preview', ' data-s="' + esc(p.slug) + '"') + '</div></div></div>' +
      '<div style="margin-top:8px;font-size:12px"><b>OFFICE</b> · ' + esc(o.how) + '</div><div class="gmt-row" style="margin-top:4px">' + sendRow(o.file, p.slug, 'office') + '</div>' +
      (sh ? '<div style="margin-top:8px;font-size:12px"><b>PRINTSHOP</b> · ' + esc(sh.how) + '</div><div class="gmt-row" style="margin-top:4px">' + sendRow(sh.file, p.slug, 'shop') + '</div>' : '') + '</div>';
  }).join('') + '</div>';
  h += '<div class="gmt-card"><h2>Made in the CRM per job (not in this pack)</h2><div class="gmt-muted">Neighborhood flyers and door hangers with a job’s street and tracked QR (🏡 Neighborhood / flyer maker), lunch-and-learn invites, coupon art and QR codes (🖨 Print & brand kit) are built on the spot, so they print from their own screens.</div></div>';
  return h;
};
function linkFor(b){ var v = b.getAttribute('data-v'), f = b.getAttribute('data-f'); return v === 'all' ? BASE : abs(f); }
function textFor(b){
  var v = b.getAttribute('data-v'), p = piece(b.getAttribute('data-s'));
  if (v === 'all' || !p) return { subj: 'GrayCo print pack', body: 'All GrayCo print pieces with the print settings for each one:\n' + BASE + '\n\nPage 1 = front, page 2 = back. Print at 100% (no “fit to page”).' };
  var x = variant(p, v);
  return { subj: 'Please print: GrayCo ' + p.title + ' (' + x.label + ')', body: 'Please print: GrayCo ' + p.title + ' (' + x.label + ')\n' + abs(x.file) + '\n\nSettings: ' + x.how + '\nPage 1 = front' + (p.pages > 1 ? ', page 2 = back.' : ' (single-sided).') };
}
ACT['pp-prev'] = function(b){ PP.prev = b.getAttribute('data-s') || ''; X.draw(); if (PP.prev) nST(function(){ var n = D.querySelector('[data-pp-preview]'); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); };
ACT['pp-print'] = function(b){ var w = W.open(rel(b.getAttribute('data-f')), '_blank'); if (!w) toast('Allow pop-ups to open the PDF.', true); };
ACT['pp-copy'] = function(b){ var u = linkFor(b); X.copyText(u).then(function(){ toast('Link copied: ' + u); }, function(){ toast(u); }); };
ACT['pp-mail'] = function(b){
  var t = textFor(b), me = ''; try { me = s(X.myName()); } catch (e) {}
  var body = 'Hi,\n\n' + t.body + '\n\nThank you,\n' + (me ? me + '\n' : '') + 'GrayCo Construction Services, LLC · (901) 585-0944';
  if (typeof W._gcCompose === 'function') { if (W._gcCompose({ to: '', subject: t.subj, body: body, about: 'print' }) !== null) return; }
  X.openUrl('mailto:?subject=' + encodeURIComponent(t.subj) + '&body=' + encodeURIComponent(body));
};
ACT['pp-text'] = function(b){
  var t = textFor(b), msg = 'GrayCo Construction Services: ' + t.body;
  var to = s(W.prompt('Text the link to which number? (e.g. the print shop)', '') || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (!to) return;
  if (to.length !== 10) { toast('That is not a 10-digit phone number.', true); return; }
  if (W._gcTexts && typeof W._gcTexts.send === 'function') {
    if (!W.confirm('Text this to ' + to + '?\n\n' + msg)) return;
    W._gcTexts.send(to, msg, '').then(function(o){ if (o && o.ok) toast('Text sent.'); else toast('Not sent: ' + ((o && o.error) || 'try again') + ' — the link is copied instead.', true), X.copyText(linkFor(b)); }, function(){ toast('Not sent — the link is copied instead.', true); X.copyText(linkFor(b)); });
    return;
  }
  X.openUrl('sms:' + to + '?&body=' + encodeURIComponent(msg));
};
function loadZip(){
  if (W.JSZip) return Promise.resolve(W.JSZip);
  return new Promise(function(res, rej){
    var sc = D.createElement('script'); sc.src = ZIP_URL; sc.integrity = ZIP_SRI; sc.crossOrigin = 'anonymous'; sc.async = true;
    sc.onload = function(){ W.JSZip ? res(W.JSZip) : rej(new Error('ZIP tool missing')); };
    sc.onerror = function(){ try { sc.remove(); } catch (e) {} rej(new Error('Could not load the ZIP tool (are you online?)')); };
    D.head.appendChild(sc);
  });
}
ACT['pp-zip'] = function(){
  if (PP.zip) return;
  var files = []; PIECES.forEach(function(p){ files.push(['OFFICE/' + p.slug + '.pdf', p.slug + '.pdf']); if (p.shop) files.push(['PRINTSHOP/' + p.slug + '-printshop.pdf', p.slug + '-printshop.pdf']); });
  var readme = 'GrayCo print pack — page 1 = front, page 2 = back. Print at 100% / Actual size (no "Fit to page").\r\n\r\n' + PIECES.map(function(p){ return p.title + '\r\n  OFFICE: ' + p.office + (p.shop ? '\r\n  PRINTSHOP: ' + p.shop : ''); }).join('\r\n\r\n') + '\r\n\r\nOnline: ' + BASE + '\r\n';
  var done = 0; PP.zip = 'Preparing…'; X.draw();
  loadZip().then(function(JSZip){
    var z = new JSZip(); z.file('PRINT-SETTINGS.txt', readme);
    return Promise.all(files.map(function(f){ return fetch(rel(f[1]), { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error(f[1] + ': ' + r.status); return r.blob(); }).then(function(bl){ z.file(f[0], bl); done++; PP.zip = 'Downloading ' + done + '/' + files.length + '…'; X.draw(); }); }))
      .then(function(){ return z.generateAsync({ type: 'blob' }); });
  }).then(function(blob){
    var a = D.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'GrayCo-print-pack.zip'; D.body.appendChild(a); a.click(); nST(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    PP.zip = ''; X.draw(); toast('Print pack downloaded (' + files.length + ' PDFs + PRINT-SETTINGS.txt).');
  }, function(e){ PP.zip = ''; X.draw(); toast('ZIP failed: ' + (e && e.message || e), true); });
};
ACT['pp-open'] = function(){ X.go('printpack'); };
W._gcOpenPrintPack = function(){ if (W._gcMkt && W._gcMkt.open) W._gcMkt.open('printpack'); };
W._gcPrintPack = { pieces: PIECES, base: BASE };
}
})();
