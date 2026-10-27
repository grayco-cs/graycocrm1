// printhtml.mjs — turns a rendered print-pack page (the DOM pp.mjs prints to PDF) into its HTML print version
// (patch ADDRALL). print/<slug>.html is the same pages as print/<slug>.pdf — same @page size, same page order, the
// PRINTSHOP bleed + crop marks — but the company address is a <span data-gc-addr> that /gc-address.js fills with the
// address from the ONE setting (⚙ Admin → 🏢 Company address) when the page opens. ?print=1 prints once it is in.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGOS = ['logo-navy', 'logo-white'].map(n => {
  try { return [n, 'data:image/png;base64,' + fs.readFileSync(path.join(HERE, '_build', n + '.png')).toString('base64')]; } catch (e) { return null; }
}).filter(Boolean);

// Inter, the font the PDFs are made with (the same files, subset): a desk PC without Inter wraps the lines exactly
// as the PDF does. print/assets/fonts/ (OFL).
const FONTS = '<style id="gcpp-fonts">' + [['Regular', 400], ['Medium', 500], ['SemiBold', 600], ['Bold', 700], ['ExtraBold', 800], ['Black', 900]].map(([n, w]) =>
  '@font-face{font-family:Inter;font-style:normal;font-weight:' + w + ';font-display:block;src:url(assets/fonts/Inter-' + n + '.woff) format("woff")}').join('') + '</style>';

export function printHtml(html, o) {
  let h = String(html);
  // the logos as files next to the page (print/assets/), not 60 KB of base64 in every page
  for (const [n, uri] of LOGOS) h = h.split(uri).join('assets/' + n + '.png');
  // the PDF's page box, last so it wins; the screen bar never prints
  const css = '<style id="gcpp-print">@page{size:' + o.w + 'in ' + o.h + 'in;margin:0}' +
    '.gcpp-bar{position:sticky;top:0;z-index:9;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#0F1D2F;color:#fff;font:13px/1.4 Arial,sans-serif;padding:8px 14px}' +
    '.gcpp-bar b{color:#C4A469}.gcpp-bar button{background:#C4A469;color:#0F1D2F;border:0;border-radius:6px;padding:6px 12px;font-weight:700;cursor:pointer}' +
    '@media print{.gcpp-bar{display:none!important}}</style>';
  h = h.replace('</head>', FONTS + css + '<meta name="robots" content="noindex"><meta name="gc-print-piece" content="' + o.slug + '"></head>');
  const bar = '<div class="gcpp-bar" data-gcpp-bar="1"><b>GrayCo print pack</b><span>' + (o.mode === 'bleed' ? 'PRINTSHOP · ' + o.w + ' × ' + o.h + ' in with 0.125 in bleed + crop marks' : 'OFFICE · ' + o.w + ' × ' + o.h + ' in') +
    ' · print at 100% / Actual size · page 1 = front, page 2 = back</span><span>Address: <span data-gc-addr></span></span><button type="button" onclick="window.print()">🖨 Print</button></div>';
  h = h.replace(/<body([^>]*)>/, '<body$1>' + bar);
  const js = '<script src="../gc-address.js"></script><script>(function(){var A=window._gcCompanyAddress;' +
    'if(A&&A.fill)A.fill();' +
    'if(/[?&]print=1\\b/.test(location.search)){var go=function(){(document.fonts&&document.fonts.ready||Promise.resolve()).then(function(){setTimeout(function(){window.print();},300);});};' +
    'if(A&&A.ready)A.ready.then(go,go);else go();}})();</script>';
  h = h.replace('</body>', js + '</body>');
  return h;
}
