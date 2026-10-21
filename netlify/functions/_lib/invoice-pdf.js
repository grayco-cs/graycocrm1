/* ── GrayCo invoice PDF (patch AP2) ─────────────────────────────────────────────
   One small PDF writer, no dependencies, for the customer invoice: the same file goes to
   the customer's portal (Payments → Invoices → View PDF / Download) and is attached to the
   invoice e-mail once it is approved. Letter size, Helvetica, WinAnsi text.
   build(doc) → Buffer.  doc = { number, date, due, terms, status, client, address, email,
   job, jobAddress, po, lines:[{desc, amt}], total, paid, balance, isFinal, pm, pmPhone }.
   ──────────────────────────────────────────────────────────────────────────── */
'use strict';
const COMPANY = 'GrayCo Construction Services';
const ADDRESS = '4007 Broadway Rd, Bartlett, TN 38135';
const PHONE = '(901) 585-0944';
const EMAIL = 'office@grayco-cs.com';

/* Helvetica advance widths (1/1000 em) for the characters an invoice uses; others ~ 556 */
const W_REG = { ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, '[': 278, ']': 278, '_': 556, '|': 260, '\xb7': 278,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 };
const W_BOLD_UP = 1.06;
function width(t, size, bold){
  let w = 0;
  for (const ch of String(t)) w += (W_REG[ch] != null ? W_REG[ch] : 556);
  return w / 1000 * size * (bold ? W_BOLD_UP : 1);
}
/* text the standard fonts can draw (WinAnsi): smart quotes and dashes become plain ones */
function clean(t){
  return String(t == null ? '' : t).replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/[•●]/g, '\xb7').replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}
function str(t){ return '(' + clean(t).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }
function wrap(t, size, maxW, bold){
  const words = clean(t).split(' '), out = []; let cur = '';
  words.forEach(function(w){
    const tryL = cur ? cur + ' ' + w : w;
    if (width(tryL, size, bold) <= maxW) { cur = tryL; return; }
    if (cur) out.push(cur);
    while (width(w, size, bold) > maxW && w.length > 1) {         /* one very long word: cut it */
      let k = w.length; while (k > 1 && width(w.slice(0, k), size, bold) > maxW) k--;
      out.push(w.slice(0, k)); w = w.slice(k);
    }
    cur = w;
  });
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
function usd(n){
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function niceDate(d){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (!m) return String(d || '');
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
}

function build(doc){
  doc = doc || {};
  const PW = 612, PH = 792, L = 48, R = 564;
  const pages = []; let ops = [];
  const NAVY = '0.059 0.114 0.184', GOLD = '0.831 0.627 0.090', INK = '0.078 0.125 0.180', MUTED = '0.333 0.384 0.435';
  function text(x, y, t, size, bold, color){ ops.push('BT ' + (color || INK) + ' rg /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Td ' + str(t) + ' Tj ET'); }
  function textR(x, y, t, size, bold, color){ text(x - width(clean(t), size, bold), y, t, size, bold, color); }
  function rect(x, y, w, h, color){ ops.push(color + ' rg ' + x + ' ' + y + ' ' + w + ' ' + h + ' re f'); }
  function line(x1, y1, x2, y2, color, wd){ ops.push((color || MUTED) + ' RG ' + (wd || 0.6) + ' w ' + x1 + ' ' + y1 + ' m ' + x2 + ' ' + y2 + ' l S'); }
  function newPage(){ if (ops.length) pages.push(ops.join('\n')); ops = []; }

  /* header band */
  rect(0, PH - 96, PW, 96, NAVY);
  rect(0, PH - 100, PW, 4, GOLD);
  text(L, PH - 46, COMPANY, 20, true, '1 1 1');
  text(L, PH - 64, ADDRESS + '  \xb7  ' + PHONE + '  \xb7  ' + EMAIL, 9, false, '0.80 0.85 0.92');
  textR(R, PH - 48, doc.isFinal ? 'FINAL INVOICE' : 'INVOICE', 22, true, '1 1 1');
  textR(R, PH - 66, 'Invoice #' + (doc.number || ''), 10, true, '0.97 0.80 0.30');

  /* bill to + facts */
  let y = PH - 132;
  text(L, y, 'BILL TO', 8, true, MUTED);
  text(330, y, 'INVOICE DETAILS', 8, true, MUTED);
  y -= 15;
  const left = [[doc.client, true]].concat(wrap(doc.address || '', 10, 250).map(function(t){ return [t, false]; }));
  if (doc.email) left.push([doc.email, false]);
  if (doc.job) { left.push(['', false]); left.push(['Job: ' + doc.job, true]); }
  if (doc.jobAddress && doc.jobAddress !== doc.address) wrap(doc.jobAddress, 10, 250).forEach(function(t){ left.push([t, false]); });
  if (doc.po) left.push(['PO ' + doc.po, false]);
  const right = [['Invoice #', doc.number], ['Date', niceDate(doc.date)], ['Due', niceDate(doc.due) || 'On receipt'], ['Terms', doc.terms || 'Due on receipt'], ['Status', doc.status]]
    .filter(function(x){ return x[1]; });
  let ly = y, ry = y;
  left.forEach(function(x){ if (x[0]) text(L, ly, x[0], x[1] ? 11 : 10, x[1]); ly -= 14; });
  right.forEach(function(x){ text(330, ry, x[0], 10, false, MUTED); textR(R, ry, x[1], 10, true); ry -= 15; });
  y = Math.min(ly, ry) - 14;

  /* lines */
  function head(){
    rect(L, y - 6, R - L, 22, '0.945 0.929 0.890');
    text(L + 8, y + 1, 'DESCRIPTION', 9, true);
    textR(R - 8, y + 1, 'AMOUNT', 9, true);
    y -= 26;
  }
  head();
  const lines = (Array.isArray(doc.lines) && doc.lines.length ? doc.lines : [{ desc: doc.job || 'Invoice', amt: doc.total }]);
  lines.forEach(function(ln){
    const rows = wrap(ln.desc || '', 10, R - L - 140);
    if (y - rows.length * 13 < 150) { newPage(); y = PH - 60; head(); }
    rows.forEach(function(t, i){ text(L + 8, y, t, 10); if (i === 0 && ln.amt != null && ln.amt !== '') textR(R - 8, y, usd(ln.amt), 10); y -= 13; });
    y -= 5; line(L, y + 9, R, y + 9, '0.88 0.86 0.80', 0.5);
  });

  /* totals */
  if (y < 170) { newPage(); y = PH - 60; }
  y -= 8;
  const tot = [['Invoice total', usd(doc.total), false]];
  if (Number(doc.paid) > 0) tot.push(['Paid', '-' + usd(doc.paid), false]);
  tot.push(['Balance due', usd(doc.balance), true]);
  tot.forEach(function(x){ text(360, y, x[0], x[2] ? 12 : 10, x[2]); textR(R - 8, y, x[1], x[2] ? 12 : 10, x[2]); y -= x[2] ? 18 : 15; });
  line(360, y + 30, R, y + 30, GOLD, 1);

  /* how to pay */
  y -= 18;
  text(L, y, 'How to pay', 11, true); y -= 15;
  wrap('Pay by check made out to ' + COMPANY + ', or cash handed to your Project Manager' + (doc.pm ? ' (' + doc.pm + ')' : '') + '. Every payment shows on your invoice in your GrayCo Portal.', 10, R - L)
    .forEach(function(t){ text(L, y, t, 10); y -= 13; });
  y -= 6;
  text(L, y, 'Questions? Call ' + PHONE + (doc.pmPhone ? ' or ' + (doc.pm || 'your PM') + ' at ' + doc.pmPhone : '') + '.', 10, false, MUTED);
  text(L, 40, 'Thank you for choosing ' + COMPANY + '.', 9, false, MUTED);
  newPage();

  /* assemble */
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = '<< /Producer (GrayCo CRM) /Title ' + str('Invoice ' + (doc.number || '')) + ' >>';
  const kids = [];
  pages.forEach(function(c, i){
    const pn = 6 + i * 2, cn = pn + 1;
    kids.push(pn + ' 0 R');
    objs[pn] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cn + ' 0 R >>';
    objs[cn] = '<< /Length ' + Buffer.byteLength(c, 'latin1') + ' >>\nstream\n' + c + '\nendstream';
  });
  objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  for (let n = 1; n < objs.length; n++) { offs[n] = Buffer.byteLength(out, 'latin1'); out += n + ' 0 obj\n' + objs[n] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
  for (let n = 1; n < objs.length; n++) out += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
module.exports = { build: build, usd: usd, clean: clean, COMPANY: COMPANY, ADDRESS: ADDRESS, PHONE: PHONE };
