/* netlify/functions/_lib/lien-pdf.js — patch AUTOMONEY: a sub's lien waiver as a one-page PDF (Letter, Helvetica, no
   dependencies; the text helpers are the invoice PDF's). build(w) → Buffer.
   w = { title, paras[], sub, jobName, jobAddress, amount, through, invNum, kind, status, signerName, signerTitle, signedAt,
         ip, via, paperAt, paperBy, id }. The wording comes from lien.js waiverParas — a DRAFT for GrayCo's lawyer. */
'use strict';
const IP = require('./invoice-pdf.js');
const PW = 612, PH = 792, L = 54, R = PW - 54;
function str(t){ return '(' + IP.clean(t).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }
function wrap(t, size, maxW, bold){
  const words = IP.clean(t).split(' '), out = []; let cur = '';
  words.forEach(function(w){ const tryL = cur ? cur + ' ' + w : w; if (IP.width(tryL, size, bold) <= maxW) { cur = tryL; return; } if (cur) out.push(cur); cur = w; });
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
function build(w){
  w = w || {};
  let c = '', y = PH - 60;
  const text = function(x, yy, t, size, bold){ c += 'BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + x + ' ' + yy + ' Td ' + str(t) + ' Tj ET\n'; };
  const line = function(yy){ c += '0.6 w ' + L + ' ' + yy + ' m ' + R + ' ' + yy + ' l S\n'; };
  text(L, y, IP.COMPANY, 13, true); y -= 15;
  text(L, y, IP.ADDRESS + '  \xb7  ' + IP.PHONE, 9); y -= 12;
  text(L, y, IP.LICENSES, 8); y -= 10; line(y); y -= 26;
  text(L, y, w.title || 'Lien Waiver and Release', 15, true); y -= 22;
  const rows = [['Claimant (subcontractor)', w.sub], ['Paying party', IP.COMPANY], ['Job', w.jobName], ['Job address', w.jobAddress],
    ['Amount', IP.usd(w.amount)], ['Work through', w.through], ['Invoice', w.invNum], ['Waiver no.', w.id]].filter(function(r){ return r[1]; });
  rows.forEach(function(r){ text(L, y, r[0] + ':', 10, true); text(L + 150, y, String(r[1]), 10); y -= 14; });
  y -= 8;
  (w.paras || []).forEach(function(p){ wrap(p, 10.5, R - L).forEach(function(t){ text(L, y, t, 10.5); y -= 14; }); y -= 6; });
  y -= 10; line(y); y -= 18;
  if (w.status === 'signed') {
    text(L, y, 'Signed electronically by: ' + (w.signerName || '') + (w.signerTitle ? ', ' + w.signerTitle : ''), 10.5, true); y -= 14;
    text(L, y, 'For: ' + (w.sub || '') + '   Date: ' + String(w.signedAt || '').slice(0, 10) + (w.via ? '   Via: ' + w.via : ' Via: e-mailed link'), 10); y -= 14;
    text(L, y, 'Typed name, "I agree" and the time / IP address (' + (w.ip || 'recorded') + ') are kept on file with this waiver.', 8.5); y -= 12;
  } else if (w.status === 'paper' || w.status === 'uploaded') {
    text(L, y, 'Signed on paper — the signed copy is on file (' + String(w.paperAt || w.uploadedAt || '').slice(0, 10) + ').', 10.5, true); y -= 14;
  } else {
    text(L, y, 'Signature: ______________________________   Name / title: ______________________   Date: __________', 10); y -= 14;
    text(L, y, 'For: ' + (w.sub || ''), 10); y -= 14;
  }
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [6 0 R] /Count 1 >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = '<< /Producer (GrayCo CRM) /Title ' + str(w.title || 'Lien waiver') + ' >>';
  objs[6] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 7 0 R >>';
  objs[7] = '<< /Length ' + Buffer.byteLength(c, 'latin1') + ' >>\nstream\n' + c + '\nendstream';
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  for (let n = 1; n < objs.length; n++) { offs[n] = Buffer.byteLength(out, 'latin1'); out += n + ' 0 obj\n' + objs[n] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
  for (let n = 1; n < objs.length; n++) out += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
module.exports = { build };
