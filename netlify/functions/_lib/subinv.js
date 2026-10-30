/* ============================================================================
   GrayCo — A SUB'S INVOICE, READ AND PLACED BY ITSELF (patch SUBINV).   netlify/functions/_lib/subinv.js

   Owner (10/27): "when there's an invoice like this in office@ or invoices@: read the PDF, enter it into the job that its
   address matches, calculate the expense on the job's P&L, and create the invoice to pay — when it says we pay —
   automatically." Subs send Word (.docx / .doc), PDF, photos, Excel / CSV, Google Docs / Sheets (attached or as a link)
   or type the invoice in the e-mail itself.

   This file only READS and DECIDES; nothing is paid or sent. money-mail.js keeps the result on the e-mail's record in
   gc_kv "gc_mail_money" as rec.si, and the CRM page (index.html, patch SUBINV) books it with the CRM's own records:
     route 'book'  → a received sub invoice on the job (+ the PENDING job cost row) → ✅ Approvals (the job's PM, then
                     the office after 24 h) → on approval the check is drafted for the pay date;
     route 'match' → ✅ Approvals "🧾 Match this invoice" (the top 3 jobs + a picker) — the job or the sub is not certain;
     route 'dup'   → ✅ Approvals "Possible duplicate" — never booked twice;
     route 'link'  → ✅ Approvals "🔗 Open this invoice link" — a Google link the CRM could not open;
     route 'review'→ ✅ Approvals "Match this invoice" — it does not say GrayCo owes it (paid / a statement / not an invoice).
   Pay date: the CRM's sub pay rule — in by Wednesday (Central) → paid the Friday of the following week; later → the
   Friday after that; the invoice's own due date when that is later. No pay-when-paid. Retainage per the subcontract.
   No packages: a .docx / .xlsx is a ZIP (read with zlib), a PDF's text layer is read with zlib, the rest goes to the AI
   reader (_lib/ai.js) when ANTHROPIC_API_KEY is set.
   ========================================================================== */
'use strict';
const zlib = require('zlib');
const crypto = require('crypto');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(s(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function cents(v){ return Math.round(num(v) * 100); }

/* ── 1. text out of the file ───────────────────────────────────────────────── */
const MAX_UNZIP = 30 * 1024 * 1024;
/* a small ZIP reader (stored + deflate) → { name: Buffer } for the names `want` accepts */
function unzipEntries(buf, want){
  const out = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16), total = 0;
  for (let k = 0; k < Math.min(n, 3000); k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    p += 46 + nl + xl + cl;
    if (!want(name) || (flags & 1) || usize > MAX_UNZIP || total + usize > MAX_UNZIP) continue;
    if (off + 30 > buf.length || buf.readUInt32LE(off) !== 0x04034b50) continue;
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.slice(start, start + csize);
    let data = null;
    try { data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, usize) }) : null; } catch (e) { data = null; }
    if (data) { out[name] = data; total += data.length; }
  }
  return out;
}
function xmlDecode(t){ return s(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function(m, d){ return String.fromCharCode(+d); }).replace(/&#x([0-9a-f]+);/gi, function(m, h){ return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, '&'); }
function wordXmlText(xml){
  return xmlDecode(String(xml)
    .replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>').replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<w:cr\/>/g, '\n')
    .replace(/<\/w:tc>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .split('\n').map(function(l){ return l.replace(/[  ]+/g, ' ').replace(/\t\s*/g, '\t').replace(/^\s+|\s+$/g, ''); }).filter(Boolean).join('\n');
}
function docxText(buf){
  const z = unzipEntries(buf, function(n){ return /^word\/(document|header\d*|footer\d*)\.xml$/.test(n); });
  const order = Object.keys(z).sort(function(a, b){ return (/header/.test(a) ? 0 : /document/.test(a) ? 1 : 2) - (/header/.test(b) ? 0 : /document/.test(b) ? 1 : 2); });
  return order.map(function(k){ return wordXmlText(z[k].toString('utf8')); }).filter(Boolean).join('\n');
}
function colIdx(ref){ const m = /^([A-Z]+)/.exec(s(ref)); if (!m) return 0; let n = 0; for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }
function xlsxText(buf){
  const z = unzipEntries(buf, function(n){ return n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
  const shared = [];
  if (z['xl/sharedStrings.xml']) String(z['xl/sharedStrings.xml']).replace(/<si>([\s\S]*?)<\/si>/g, function(m, inner){ shared.push(xmlDecode((inner.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(function(t){ return t.replace(/<[^>]+>/g, ''); }).join(''))); return m; });
  const out = [];
  Object.keys(z).filter(function(k){ return /worksheets/.test(k); }).sort().forEach(function(k){
    String(z[k]).replace(/<row[^>]*>([\s\S]*?)<\/row>/g, function(m, row){
      const cells = [];
      row.replace(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function(mm, attrs, inner){
        const ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1], t = (/t="(\w+)"/.exec(attrs) || [])[1];
        let v = (/<v>([\s\S]*?)<\/v>/.exec(inner || '') || [])[1];
        if (t === 's') v = shared[parseInt(v, 10)]; else if (t === 'inlineStr') v = ((inner || '').match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(function(x){ return x.replace(/<[^>]+>/g, ''); }).join(''); else v = xmlDecode(v);
        if (s(v)) cells[colIdx(ref)] = s(v);
        return mm;
      });
      const line = cells.map(function(c){ return c || ''; }).join('\t').replace(/\t+$/, '');
      if (s(line)) out.push(line);
      return m;
    });
  });
  return out.join('\n');
}
/* an old binary Word file (.doc): the text runs (UTF-16 and 8-bit) */
function docText(buf){
  const u16 = buf.toString('utf16le').match(/[\x20-\x7e\t\r\n -ÿ]{6,}/g) || [];
  const a8 = buf.toString('latin1').match(/[\x20-\x7e\t\r\n]{6,}/g) || [];
  const pick = (u16.join('').length > a8.join('').length * 0.5 ? u16 : a8).map(function(x){ return x.replace(/\r/g, '\n'); });
  return pick.filter(function(x){ return /[a-z]{3}/i.test(x) && !/^[\x20-\x2f]+$/.test(x); }).join('\n').slice(0, 40000);
}
/* a PDF's text layer (no fonts decoded: plain Latin text only) — the AI reader is the real reader for PDFs */
function pdfUnesc(t){ return t.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, function(m, c){ if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8)); return { n: '\n', r: '\n', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[c]; }); }
function pdfText(buf){
  const src = buf.toString('latin1'), parts = [];
  const re = /stream\r?\n/g; let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length, end = src.indexOf('endstream', start); if (end < 0) break;
    const raw = buf.slice(start, end);
    const dict = src.slice(Math.max(0, m.index - 300), m.index);
    let data = null;
    if (/FlateDecode/.test(dict)) { try { data = zlib.inflateSync(raw); } catch (e) { try { data = zlib.inflateSync(raw.slice(0, raw.length - 1)); } catch (e2) { data = null; } } }
    else if (!/Filter/.test(dict)) data = raw;
    if (data) parts.push(data.toString('latin1'));
    re.lastIndex = end + 9;
  }
  const lines = [];
  parts.forEach(function(c){
    if (!/\b(Tj|TJ|')\b/.test(c) || !/BT/.test(c)) return;
    let cur = '';
    c.replace(/\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^)\\])*)\)\s*(?:Tj|')|(T\*|Td|TD|Tm|ET)\b/g, function(all, tj, one, op){
      if (op) { if (s(cur)) lines.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; return all; }
      if (tj != null) { tj.replace(/\(((?:\\.|[^)\\])*)\)|(-?\d+(?:\.\d+)?)/g, function(x, str, k){ if (str != null) cur += pdfUnesc(str); else if (num(k) < -200) cur += ' '; return x; }); }
      else cur += pdfUnesc(one);
      return all;
    });
    if (s(cur)) lines.push(cur.replace(/\s+/g, ' ').trim());
  });
  return lines.filter(function(l){ return /[A-Za-z0-9]/.test(l); }).join('\n').slice(0, 60000);
}
function csvText(buf){ return buf.toString('utf8').replace(/^﻿/, '').split(/\r?\n/).map(function(l){ return l.replace(/","/g, '\t').replace(/^"|"$/g, '').replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\t'); }).join('\n').slice(0, 60000); }

const TYPE_BY_EXT = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff' };
/* what kind of paper a file is: pdf | docx | doc | xlsx | xls | csv | txt | image | '' (not one we read) */
function kindOf(name, type){
  const ext = low(s(name).split('.').pop()), t = low(type);
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/wordprocessingml/.test(t) || ext === 'docx') return 'docx';
  if (t === 'application/msword' || ext === 'doc') return 'doc';
  if (/spreadsheetml/.test(t) || ext === 'xlsx') return 'xlsx';
  if (t === 'application/vnd.ms-excel' || ext === 'xls') return 'xls';
  if (t === 'text/csv' || ext === 'csv') return 'csv';
  if (/^image\//.test(t) || /^(jpe?g|png|gif|webp|heic|tiff?)$/.test(ext)) return 'image';
  if ((t === 'text/plain' || ext === 'txt') && !/^(signature|smime)/i.test(s(name))) return 'txt';
  return '';
}
function typeFor(name, type){ const t = low(type).split(';')[0]; if (t && !/octet-stream/.test(t)) return t; return TYPE_BY_EXT[low(s(name).split('.').pop())] || 'application/octet-stream'; }
function textOf(buf, kind){
  try {
    if (kind === 'docx') return docxText(buf);
    if (kind === 'xlsx') return xlsxText(buf);
    if (kind === 'doc' || kind === 'xls') return docText(buf);
    if (kind === 'pdf') return pdfText(buf);
    if (kind === 'csv') return csvText(buf);
    if (kind === 'txt') return buf.toString('utf8').slice(0, 60000);
  } catch (e) {}
  return '';
}

/* ── 2. the fields, from the text (no AI) ──────────────────────────────────── */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function iso(y, m, d){ y = +y; m = +m; d = +d; if (y < 100) y += 2000; if (!y || !m || !d || m > 12 || d > 31) return ''; return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
function dateIn(t){
  t = s(t); let m;
  if ((m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t))) return iso(m[1], m[2], m[3]);
  if ((m = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/.exec(t))) return iso(m[3], m[1], m[2]);
  if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(t))) return iso(m[3], MONTHS[low(m[1]).slice(0, 3)], m[2]);
  return '';
}
function labelled(lines, re, pick){
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]); if (!m) continue;
    const after = lines[i].slice(m.index + m[0].length);
    const v = pick(after) || pick(lines[i + 1] || '');
    if (v) return v;
  }
  return '';
}
function moneyIn(t){ const m = /\(?-?\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}|\d+)\)?/.exec(s(t)); return m ? num(m[1]) : 0; }
const SUFFIX = { cove: 'cv', cv: 'cv', drive: 'dr', dr: 'dr', street: 'st', st: 'st', road: 'rd', rd: 'rd', lane: 'ln', ln: 'ln', avenue: 'ave', ave: 'ave', av: 'ave',
  boulevard: 'blvd', blvd: 'blvd', court: 'ct', ct: 'ct', circle: 'cir', cir: 'cir', place: 'pl', pl: 'pl', parkway: 'pkwy', pkwy: 'pkwy', highway: 'hwy', hwy: 'hwy',
  trail: 'trl', trl: 'trl', terrace: 'ter', ter: 'ter', way: 'way', loop: 'loop', pass: 'pass', run: 'run', square: 'sq', sq: 'sq', point: 'pt', pt: 'pt', cove_: 'cv' };
const DIRS = { north: 'n', south: 's', east: 'e', west: 'w', n: 'n', s: 's', e: 'e', w: 'w', ne: 'ne', nw: 'nw', se: 'se', sw: 'sw' };
const STREET_RE = /\b(\d{2,6})\s+((?:[NSEW]\.?\s+)?[A-Za-z0-9][A-Za-z0-9'.-]*(?:\s+[A-Za-z0-9'.-]+){0,3}?)\s+(cove|cv|drive|dr|street|st|road|rd|lane|ln|avenue|ave|av|boulevard|blvd|court|ct|circle|cir|place|pl|parkway|pkwy|highway|hwy|trail|trl|terrace|ter|way|loop|pass|run|square|sq|point|pt)\b\.?/i;
/* "8382 Laurett Cove" → { num: '8382', name: 'laurett', suffix: 'cv', key: '8382 laurett cv' } */
function addrParts(a){
  const t = low(a).replace(/[#,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const m = STREET_RE.exec(t);
  let n = '', words = [], suf = '';
  if (m) { n = m[1]; words = m[2].replace(/\./g, '').split(' '); suf = SUFFIX[low(m[3])] || low(m[3]); }
  else { const m2 = /^(\d{2,6})\s+(.+)$/.exec(t); if (!m2) return null; n = m2[1]; words = m2[2].replace(/\./g, '').split(' ').slice(0, 3); const last = words[words.length - 1]; if (SUFFIX[last]) { suf = SUFFIX[last]; words.pop(); } }
  words = words.map(function(w){ return DIRS[w] || w; }).filter(function(w){ return w && !DIRS[w]; });
  const name = words.join(' ');
  if (!name) return null;
  return { num: n, name: name, suffix: suf, key: (n + ' ' + name + ' ' + suf).trim() };
}
function findAddress(text, subject){
  const pool = [s(subject)].concat(s(text).split('\n'));
  for (const l of pool) { const m = STREET_RE.exec(l); if (m && !/\b(p\.?\s?o\.?\s+box)\b/i.test(l)) return s(m[0]).replace(/\.$/, ''); }
  return '';
}
/* the invoice's own fields from its words; vendor and address may come from the e-mail too */
function parseText(text, ctx){
  ctx = ctx || {};
  const t = s(text), lines = t.split('\n').map(function(l){ return s(l); }).filter(Boolean);
  const invoiceNumber = labelled(lines, /\binv(?:oice)?\.?\s*(?:#|no\.?|num(?:ber)?)\s*:?/i, function(x){ const m = /^\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{0,24})/.exec(x); return m && !/^(date|total|due|amount)$/i.test(m[1]) ? m[1] : ''; })
    || ((/\binvoice\s*#\s*([A-Za-z0-9-]{1,24})/i.exec(t + ' ' + s(ctx.subject)) || [])[1] || '');
  const invoiceDate = labelled(lines, /\b(invoice\s+date|date\s+of\s+invoice|inv\.?\s*date|^date)\b\s*:?/i, dateIn) || dateIn(t.slice(0, 600));
  const dueDate = labelled(lines, /\b(due\s+date|payment\s+due|due\s+by|due\s+on)\b\s*:?/i, dateIn);
  const terms = ((/\b(net\s*\d{1,3}|due\s+(?:up)?on\s+receipt|upon\s+receipt|cod)\b/i.exec(t) || [])[1] || '');
  const po = labelled(lines, /\b(p\.?\s?o\.?\s*(?:#|no\.?|number)?|purchase\s+order)\s*:?/i, function(x){ const m = /^\s*[:#]?\s*([A-Za-z]?-?\d{3,8}[A-Za-z0-9-]*)/.exec(x); return m ? m[1].toUpperCase() : ''; });
  let total = 0, how = '';
  [/\b(balance\s+due|amount\s+due|total\s+due|please\s+pay|invoice\s+total|grand\s+total)\b/i, /\btotal\b(?!\s*(?:paid|tax))/i].some(function(re){
    lines.forEach(function(l, i){ const m = re.exec(l); if (!m) return; if (/sub\s*-?\s*total/i.test(l) && re.source.indexOf('balance') < 0) return; const v = moneyIn(l.slice(m.index + m[0].length)) || moneyIn(lines[i + 1] || ''); if (v > total) { total = v; how = low(m[1] || m[0]); } });
    return total > 0;
  });
  const subtotal = labelled(lines, /\bsub\s*-?\s*total\b\s*:?/i, moneyIn) || 0;
  const tax = labelled(lines, /\b(sales\s+)?tax\b\s*:?/i, function(x){ return /\d/.test(x) ? moneyIn(x) : 0; }) || 0;
  const retainage = labelled(lines, /\b(retainage|retention)\b[^$\d]*/i, moneyIn) || 0;
  const items = [];
  lines.forEach(function(l){
    if (/\b(total|subtotal|tax|balance|amount due|invoice|date|phone|fax|email|p\.?o\.?\s*#)\b/i.test(l)) return;
    const m = /^(.{3,140}?)[\t ]+\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$/.exec(l);
    if (m && /[a-z]{3}/i.test(m[1])) items.push({ desc: m[1].replace(/\t+/g, ' ').replace(/\s+\$?\s*\d[\d,]*(\.\d+)?\s*$/, '').trim().slice(0, 160), amount: num(m[2]) });
  });
  const address = findAddress(t, ctx.subject);
  const paid = /\b(paid\s+in\s+full|payment\s+received|thank\s+you\s+for\s+your\s+payment|receipt)\b/i.test(t) && !/\b(balance\s+due|amount\s+due)\b[^\n]*[1-9]/i.test(t);
  const weOwe = !paid && total > 0;
  const looksInvoice = /\b(invoice|bill|amount\s+due|balance\s+due|pay\s+application|statement)\b/i.test(t + ' ' + s(ctx.subject));
  return { vendor: s(ctx.vendor), invoiceNumber: s(invoiceNumber), invoiceDate: invoiceDate, dueDate: dueDate, terms: s(terms), po: s(po), jobAddress: address, customer: '',
    lines: items.slice(0, 40), subtotal: r2(subtotal), tax: r2(tax), total: r2(total), retainage: r2(retainage), weOwe: weOwe, isInvoice: looksInvoice && total > 0, how: how ? 'read from "' + how + '"' : '', by: 'text' };
}

/* ── 3. the AI reader (PDF, photo, or the text of anything else) ───────────── */
const AI_TOOL = { name: 'sub_invoice', description: 'The fields of one invoice a subcontractor or supplier sent to GrayCo Construction Services (a general contractor).',
  input_schema: { type: 'object', properties: {
    isInvoice: { type: 'boolean', description: 'true when this is an invoice / bill / pay application asking for payment' },
    weOwe: { type: 'boolean', description: 'true when it asks GrayCo to pay a balance (billed to GrayCo). false for a receipt already paid, a statement with nothing due, a quote, or GrayCo\'s own invoice to its customer' },
    vendor: { type: 'string', description: 'the company that sent the invoice (the payee)' }, vendorEmail: { type: 'string' }, vendorPhone: { type: 'string' },
    invoiceNumber: { type: 'string' }, invoiceDate: { type: 'string', description: 'YYYY-MM-DD' }, dueDate: { type: 'string', description: 'YYYY-MM-DD, empty when none' },
    terms: { type: 'string', description: 'payment terms as written, e.g. Net 30, Due on receipt' },
    jobAddress: { type: 'string', description: 'the job site / property address the work was done at (not the vendor\'s or GrayCo\'s office address)' },
    po: { type: 'string', description: 'GrayCo PO / job number if shown' }, customer: { type: 'string', description: 'the homeowner / owner / job name if shown' },
    lines: { type: 'array', items: { type: 'object', properties: { desc: { type: 'string' }, qty: { type: 'number' }, amount: { type: 'number' } } } },
    subtotal: { type: 'number' }, tax: { type: 'number' }, retainage: { type: 'number', description: 'retainage withheld on this invoice, if shown' },
    total: { type: 'number', description: 'the amount due now' } }, required: ['isInvoice', 'weOwe', 'total'] } };
async function aiRead(ai, file, text, ctx){
  if (!ai || !ai.ready || !ai.ready()) return null;
  const content = [];
  const k = file && file.kind;
  if (file && file.buf && k === 'pdf' && file.buf.length <= 20 * 1024 * 1024) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.buf.toString('base64') } });
  else if (file && file.buf && k === 'image' && /^image\/(jpeg|png|gif|webp)$/.test(file.type) && file.buf.length <= 5 * 1024 * 1024) content.push({ type: 'image', source: { type: 'base64', media_type: file.type, data: file.buf.toString('base64') } });
  else if (s(text)) content.push({ type: 'text', text: 'The invoice (text taken from ' + (file ? s(file.name) || k : 'the e-mail') + '):\n\n' + s(text).slice(0, 30000) });
  else return null;
  content.push({ type: 'text', text: 'E-mail from ' + s(ctx.fromName) + ' <' + s(ctx.from) + '>, subject "' + s(ctx.subject) + '". Read the invoice and answer with the sub_invoice tool. Dates as YYYY-MM-DD. Amounts as plain numbers.' });
  const r = await ai.ask({ content: content, tool: AI_TOOL, maxTokens: 2500, timeoutMs: 60000 });
  if (!r || !r.ok || !r.out || typeof r.out !== 'object') return null;
  const o = r.out;
  return { vendor: s(o.vendor), vendorEmail: low(o.vendorEmail), invoiceNumber: s(o.invoiceNumber), invoiceDate: dateIn(o.invoiceDate) || '', dueDate: dateIn(o.dueDate) || '', terms: s(o.terms),
    jobAddress: s(o.jobAddress), po: s(o.po).toUpperCase(), customer: s(o.customer), lines: arr(o.lines).slice(0, 60).map(function(l){ return { desc: s(l.desc).slice(0, 200), qty: num(l.qty) || undefined, amount: r2(l.amount) }; }),
    subtotal: r2(o.subtotal), tax: r2(o.tax), retainage: r2(o.retainage), total: r2(o.total), weOwe: o.weOwe !== false, isInvoice: o.isInvoice !== false, by: 'ai' };
}

/* ── 4. a forwarded e-mail: the sub is the forwarded From:, not the GrayCo person ── */
function staffAddr(e){ return /@([a-z0-9-]+\.)*grayco-cs\.com$/i.test(s(e)); }
function forwarded(mail){
  const from = low(mail.from && mail.from.email), t = s(mail.text);
  if (!staffAddr(from)) return null;
  const fwd = /^\s*(fwd?|fw)\s*:/i.test(s(mail.subject)) || /(-{3,}\s*Forwarded message|Begin forwarded message|-{3,}\s*Original Message)/i.test(t);
  if (!fwd) return null;
  const at = t.search(/(-{3,}\s*Forwarded message|Begin forwarded message|-{3,}\s*Original Message|^From:)/im);
  const head = at >= 0 ? t.slice(at, at + 1500) : t.slice(0, 1500);
  let m = /From:\s*\*?\s*"?([^"<\n*]*?)"?\s*\*?\s*<([^>\s]+@[^>\s]+)>/i.exec(head), name = '', email = '';
  if (m) { name = s(m[1]); email = low(m[2]); } else if ((m = /From:\s*\*?\s*([^\s<>]+@[^\s<>]+)/i.exec(head))) email = low(m[1]).replace(/[*,;]+$/, '');
  const subj = (/Subject:\s*(.+)/i.exec(head) || [])[1] || s(mail.subject).replace(/^\s*((fwd?|fw)\s*:\s*)+/i, '');
  if (!email || staffAddr(email)) return { by: from, byName: s(mail.from && mail.from.name), email: '', name: name, subject: s(subj) };
  return { by: from, byName: s(mail.from && mail.from.name), email: email, name: name, subject: s(subj) };
}

/* ── 5. Google Docs / Sheets / Drive links in the e-mail ───────────────────── */
function googleLinks(text){
  const out = [], seen = {};
  const re = /https?:\/\/(?:docs|drive)\.google\.com\/(?:(document|spreadsheets|presentation)\/d\/|file\/d\/|open\?id=|uc\?(?:export=download&)?id=)([A-Za-z0-9_-]{20,})[^\s<>"')\]]*/g; let m;
  while ((m = re.exec(s(text)))) { if (seen[m[2]]) continue; seen[m[2]] = 1; out.push({ url: m[0], kind: m[1] || 'file', id: m[2] }); }
  return out.slice(0, 5);
}
/* the link as text (public export first, then the CRM's Google Drive reader as office@ / the forwarder) */
async function fetchGoogle(link, deps){
  const f = deps.fetch || globalThis.fetch;
  const pub = link.kind === 'document' ? 'https://docs.google.com/document/d/' + link.id + '/export?format=txt'
    : link.kind === 'spreadsheets' ? 'https://docs.google.com/spreadsheets/d/' + link.id + '/export?format=csv'
    : link.kind === 'presentation' ? 'https://docs.google.com/presentation/d/' + link.id + '/export/txt'
    : 'https://drive.google.com/uc?export=download&id=' + link.id;
  try {
    const r = await f(pub, { redirect: 'follow' });
    const ct = low(r && r.headers && r.headers.get ? r.headers.get('content-type') : '');
    if (r && r.ok && !/text\/html/.test(ct)) {
      const buf = Buffer.from(await r.arrayBuffer());
      const kind = link.kind === 'document' || link.kind === 'presentation' ? 'txt' : link.kind === 'spreadsheets' ? 'csv' : kindOf('', ct) || 'pdf';
      return { ok: true, via: 'public link', kind: kind, buf: buf, type: kind === 'txt' ? 'text/plain' : kind === 'csv' ? 'text/csv' : ct.split(';')[0] };
    }
  } catch (e) {}
  if (deps.driveExport) { try { const d = await deps.driveExport(link); if (d && d.ok) return d; } catch (e) {} }
  return { ok: false };
}

/* ── 6. who sent it: the sub on the CRM's list ─────────────────────────────── */
const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|live|aol|icloud|me|msn|comcast|att|bellsouth|sbcglobal|protonmail)\./i;
function normName(v){ return low(v).replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd|l\.l\.c|the)\b\.?/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function emailsOf(x){ return [x.email, x.contactEmail, x.billingEmail, x.apEmail, x.email2, x.altEmail].concat(arr(x.emails).map(function(e){ return e.email; }), Array.isArray(x.emails) ? x.emails.filter(function(e){ return typeof e === 'string'; }) : []).map(low).filter(function(e){ return /@/.test(e); }); }
function lev(a, b){ if (a === b) return 0; if (Math.abs(a.length - b.length) > 2) return 9; const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function matchSub(subs, who){
  const email = low(who.email), dom = email.split('@')[1] || '', vendor = normName(who.vendor), fromName = normName(who.name), fileHay = normName(who.hay);
  let best = null;
  arr(subs).forEach(function(x){
    if (x.deleted || x.archived === true) return;
    const nm = normName(x.company || x.companyName || x.name), pn = normName(x.name), cn = normName(x.contact || x.contactName);
    let sc = 0, why = '';
    const ems = emailsOf(x);
    if (email && ems.indexOf(email) >= 0) { sc = 100; why = 'their e-mail ' + email; }
    else if (dom && !FREE_MAIL.test(email) && ems.some(function(e){ return e.split('@')[1] === dom; })) { sc = 92; why = 'their e-mail domain ' + dom; }
    [[nm, 'company'], [pn, 'name']].forEach(function(p){
      const n = p[0]; if (!n || n.length < 4) return;
      if (vendor && (vendor === n || (n.length >= 8 && (vendor.indexOf(n) >= 0 || n.indexOf(vendor) >= 0 && vendor.length >= 8)))) { if (sc < 90) { sc = 90; why = 'the ' + p[1] + ' on the invoice'; } }
      else if (vendor && n.length >= 6 && lev(vendor, n) <= 2) { if (sc < 82) { sc = 82; why = 'the ' + p[1] + ' on the invoice (close spelling)'; } }
      else if (fileHay && n.length >= 8 && fileHay.indexOf(n) >= 0) { if (sc < 80) { sc = 80; why = 'the ' + p[1] + ' in the file name / subject'; } }
    });
    if (cn && fromName && cn === fromName && sc < 70) { sc = 70; why = 'the contact\'s name'; }
    if (sc && (!best || sc > best.conf)) best = { id: s(x.id), name: s(x.company || x.companyName || x.name), conf: sc, why: why, retainagePct: num(x.retainagePct || x.retainage) };
  });
  return best;
}

/* ── 7. which job: the job-site address first, then the PO, then the customer / job name ── */
function closed(p){ return /^(lost|dead|cancel+ed|void|archived|declined)$/i.test(s(p.status)) || p.deleted === true; }
function jobAddr(p){ return s(p.address || p.jobAddress || p.siteAddress || p.street || (p.location && p.location.address)); }
function scoreJob(p, f){
  let sc = 0; const why = [];
  const a = addrParts(f.jobAddress), pa = addrParts(jobAddr(p));
  if (a && pa) {
    const sameNum = a.num && a.num === pa.num;
    const nameEq = a.name === pa.name, nameNear = !nameEq && a.name.length >= 5 && lev(a.name, pa.name) <= 1;
    const sufOk = !a.suffix || !pa.suffix || a.suffix === pa.suffix;
    if (sameNum && nameEq && sufOk) { sc = 96; why.push('address ' + a.num + ' ' + pa.name); }
    else if (sameNum && nameNear && sufOk) { sc = 88; why.push('address ' + a.num + ' ' + pa.name + ' (close spelling)'); }
    else if (sameNum && (nameEq || nameNear)) { sc = 80; why.push('house number and street name'); }
    else if (nameEq && sufOk && a.name.length >= 5) { sc = 35; why.push('street name only'); }
  } else if (!a && pa && pa.name.length >= 5 && (' ' + normName(f.hay) + ' ').indexOf(' ' + pa.name + ' ') >= 0) { sc = 30; why.push('street name "' + pa.name + '" in the text'); }
  const po = s(p.autoPO || p.po).toUpperCase();
  if (po && po.length >= 3) {
    if (f.po && s(f.po).toUpperCase() === po) { sc = Math.max(sc, 95) + (sc >= 80 ? 4 : 0); why.push('PO ' + po); }
    else if (f.hay && new RegExp('\\b' + po.replace(/[^A-Z0-9]/g, '') + '\\b').test(f.hay.toUpperCase()) && /^[A-Z]-?\d{3,}$/.test(po)) { sc = Math.max(sc, 85); why.push('PO ' + po + ' in the text'); }
  }
  const cust = normName(p.client || p.customer || p.clientName), jn = normName(p.name), hay = normName(f.hay + ' ' + f.customer);
  if (cust && cust.length >= 6 && hay.indexOf(cust) >= 0) { sc = sc ? sc + 3 : 40; why.push('customer ' + s(p.client || p.customer)); }
  if (jn && jn.length >= 8 && hay.indexOf(jn) >= 0) { sc = sc ? sc + 3 : 50; why.push('job name'); }
  if (closed(p)) sc -= 30;
  return { pid: s(p.id), name: s(p.name), address: jobAddr(p), po: s(p.autoPO || p.po), pm: s(p.pm || p.projectManager), conf: Math.max(0, Math.min(100, sc)), why: why.join(' · ') };
}
function matchJob(projects, f, deleted){
  const dead = {}; (Array.isArray(deleted) ? deleted : []).forEach(function(x){ dead[s(x && typeof x === 'object' ? x.id : x)] = 1; });
  const all = arr(projects).filter(function(p){ return p.id != null && !dead[s(p.id)] && p.deleted !== true; }).map(function(p){ return scoreJob(p, f); }).filter(function(x){ return x.conf > 0; });
  all.sort(function(a, b){ return b.conf - a.conf; });
  const top = all.slice(0, 3), best = top[0] || null, second = top[1] || null;
  const certain = !!(best && best.conf >= 85 && (!second || best.conf - second.conf >= 15));
  return { best: best, top: top, certain: certain };
}

/* patch MONEY (owner 10/30: "make sure invoices to clients and from subs go directly into invoices"): the PO wins. One job
   whose CRM PO is on the invoice — its PO field, or "PO A101" / "PO# A101" in the file, the subject or the e-mail — is the
   job, even when an address in the text looks like another job. Two jobs with the same PO: not certain. */
const PO_TOKEN = /\bP\.?\s?O\.?\s*(?:#|no\.?|num(?:ber)?)?\s*[:#-]?\s*([A-Z]-?\d{3,6})\b/gi;
function poKey(v){ return s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function poTokens(text){ const out = []; const t = s(text); let m; PO_TOKEN.lastIndex = 0; while ((m = PO_TOKEN.exec(t))) { const k = poKey(m[1]); if (out.indexOf(k) < 0) out.push(k); } return out.slice(0, 12); }
function poJob(projects, f, deleted){
  const want = {}; if (s(f.po) && /^[A-Z]-?\d{3,6}$/i.test(s(f.po))) want[poKey(f.po)] = 1;
  poTokens(f.hay).forEach(function(k){ want[k] = 1; });
  if (!Object.keys(want).length) return null;
  const dead = {}; (Array.isArray(deleted) ? deleted : []).forEach(function(x){ dead[s(x && typeof x === 'object' ? x.id : x)] = 1; });
  const hits = arr(projects).filter(function(p){ const k = poKey(p.autoPO || p.po); return p.id != null && !dead[s(p.id)] && p.deleted !== true && k.length >= 3 && want[k]; });
  return hits.length === 1 ? hits[0] : null;
}
/* the jobs a sub is working now: on the job's sub list, or invoiced on it in the last 180 days (open jobs only) */
function openJob(p){ return !closed(p) && !/^(completed?|closed|bidding|estimating|lost|dead|cancel+ed|archived|declined)$/i.test(s(p.status)); }
function subOpenJobs(data, sub, now){
  if (!sub || !(s(sub.id) || s(sub.name))) return [];
  const why = {}, since = (now || Date.now()) - 180 * 864e5;
  arr(data.projects).forEach(function(p){ if (p.id == null || !openJob(p)) return; if (arr(p.subs).some(function(x){ return (s(x.subId) && s(x.subId) === s(sub.id)) || sameSub(x.name || x.company, sub.name); })) why[s(p.id)] = 'on the job\'s sub list'; });
  arr(data.invs).concat(arr(data.invoices)).forEach(function(iv){
    if (low(iv.type) !== 'sub' || !s(iv.pid) || /void|rejected|cancel|deleted/.test(low(iv.status))) return;
    if (!((s(sub.id) && s(iv.subId) === s(sub.id)) || sameSub(iv.sub, sub.name))) return;
    const t = Date.parse(s(iv.recvDate || iv.date).slice(0, 10)); if (isFinite(t) && t < since) return;
    if (!why[s(iv.pid)]) why[s(iv.pid)] = 'their invoices on it';
  });
  return arr(data.projects).filter(function(p){ return why[s(p.id)] && openJob(p); }).map(function(p){ return { pid: s(p.id), name: s(p.name), address: jobAddr(p), po: s(p.autoPO || p.po), pm: s(p.pm || p.projectManager), conf: 86, why: 'the sub\'s only open job (' + why[s(p.id)] + ')' }; });
}
/* a supplier (materials, rentals: an Expense on the job) or a sub (a Sub invoice to approve and pay) */
const SUPPLIER_RE = /\b(home\s*depot|lowe'?s|84\s*lumber|abc\s+supply|beacon|srs\s+distribution|ferguson|sherwin|floor\s*(?:&|and)\s*decor|sunbelt|united\s+rentals|fastenal|white\s*cap|l\s*&\s*w\s+supply|johnstone|winsupply|grainger|menards|builders\s+firstsource|mccoy'?s|carrier\s+enterprise|graybar|hd\s+supply|rexel|daltile|ace\s+hardware|ppg|benjamin\s+moore|lumber|supply|supplies|rentals?|materials|wholesale|distribut\w*|hardware)\b/i;
function payeeKind(rec, vendor){
  if (rec && (rec._supplier || rec.isSub === false)) return 'supplier';
  if (rec && rec.isSub === true) return 'sub';
  return SUPPLIER_RE.test(s(vendor)) ? 'supplier' : 'sub';
}
/* the CRM's supplier directory (ccw_suppliers: n name, e e-mail, p phone, t type) on the same list as the subs */
function supplierRows(list){ return arr(list).filter(function(x){ return s(x.n || x.name); }).map(function(x){ return { id: s(x.id), name: s(x.n || x.name), email: s(x.e || x.email), phone: s(x.p || x.phone), isSub: false, _supplier: true }; }); }
/* a receipt / supplier bill already on the expense list: same amount within 3 days and the same vendor, or the same invoice # */
function findExpDup(o){
  const amt = cents(o.total), k = invKey(o.invoiceNumber);
  for (const e of arr(o.expenses)) {
    if (e.deleted || /rejected|void/.test(low(e.status))) continue;
    const ek = invKey(e.invNum || e.ref || e.invoiceNumber);
    if (k && ek && k === ek && sameSub(e.vendor || e.payee, o.vendor)) return { expId: s(e.id), why: 'the same vendor and invoice # ' + s(o.invoiceNumber) + ' is already in Expenses' };
    if (amt && cents(e.amt != null ? e.amt : e.amount) === amt && sameSub(e.vendor || e.payee, o.vendor)) {
      const x = Date.parse(s(e.date).slice(0, 10)), y = Date.parse(s(o.date).slice(0, 10));
      if (isFinite(x) && isFinite(y) && Math.abs(x - y) <= 3 * 864e5) return { expId: s(e.id), why: 'the same vendor and amount ($' + r2(o.total).toFixed(2) + ') is already in Expenses (' + s(e.date).slice(0, 10) + ')' };
    }
  }
  return null;
}
/* GrayCo's OWN invoice to a customer, e-mailed by QuickBooks (a copy to office@ / invoices@) — never a bill to pay */
function ownInvoice(mail){
  const from = low(mail.from && mail.from.email), name = s(mail.from && mail.from.name), subj = s(mail.subject);
  const qb = /@([a-z0-9-]+\.)*intuit\.com$/.test(from) || /quickbooks/i.test(from);
  return qb && /\b(invoice|estimate|statement|payment\s+reminder)\b/i.test(subj) && /gray\s*co/i.test(name + ' ' + subj.replace(/^.*?\bfrom\b/i, ''));
}

/* ── 8. the pay date (the CRM's sub pay rule; Central time) ────────────────── */
function centralYmd(when){
  const d = when ? new Date(when) : new Date(); if (isNaN(d)) return centralYmd();
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(function(x){ p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}
function addDays(ymd, n){ const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function payRule(recvYmd){
  const wd = new Date(recvYmd + 'T12:00:00Z').getUTCDay();          /* 0 Sun … 3 Wed */
  const made = wd <= 3;
  const cut = addDays(recvYmd, made ? 3 - wd : 7 - wd + 3);
  const pay = addDays(cut, 2 + 7);
  return { cutoff: cut, payDate: pay, made: made, rule: made ? 'in by Wednesday ' + cut + ' → paid the Friday of the following week, ' + pay : 'after Wednesday → waits for the ' + cut + ' cut-off, paid Friday ' + pay };
}
/* the later of the rule and the invoice's own terms (net N from its date, or its due date) */
function payDateFor(recvYmd, f){
  const r = payRule(recvYmd);
  let own = dateIn(f.dueDate);
  const net = /net\s*(\d{1,3})/i.exec(s(f.terms));
  if (!own && net && dateIn(f.invoiceDate)) own = addDays(dateIn(f.invoiceDate), parseInt(net[1], 10));
  if (own && own > r.payDate) return { payDate: own, ruleDate: r.payDate, rule: 'the invoice\'s own terms (' + (f.dueDate ? 'due ' + own : s(f.terms)) + ') — later than the pay rule (' + r.payDate + ')', byTerms: true, cutoff: r.cutoff };
  return { payDate: r.payDate, ruleDate: r.payDate, rule: r.rule, byTerms: false, cutoff: r.cutoff };
}

/* ── 9. duplicates: same sub + invoice #, or the same amount on the same job / address within 30 days ── */
function invKey(v){ return low(v).replace(/^(inv(oice)?|#|no\.?)\s*/i, '').replace(/[^a-z0-9]/g, '').replace(/^0+/, ''); }
function sameSub(a, b){ const x = normName(a), y = normName(b); return !!(x && y && (x === y || (x.length >= 6 && y.length >= 6 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0)))); }
function within30(a, b){ const x = Date.parse(s(a).slice(0, 10)), y = Date.parse(s(b).slice(0, 10)); return isFinite(x) && isFinite(y) && Math.abs(x - y) <= 30 * 864e5; }
function findDup(o){
  const k = invKey(o.invoiceNumber), amt = cents(o.total), addr = addrParts(o.address);
  for (const iv of arr(o.invoices)) {
    if (low(iv.type) !== 'sub' && low(iv.type) !== 'supplier') continue;
    if (/void|rejected|cancel|deleted/.test(low(iv.status)) || iv.deleted) continue;
    const subHit = (o.subId && s(iv.subId) === o.subId) || sameSub(iv.sub || iv.vendor, o.subName);
    const ik = invKey(iv.invNum || iv.invNo || iv.number);
    if (k && ik && k === ik && subHit) return { invId: s(iv.id), why: 'the same sub and invoice # ' + s(o.invoiceNumber) + ' is already in ▥ Invoices' };
    if (amt && cents(iv.amt || iv.amount) === amt && within30(iv.recvDate || iv.date, o.recvDate)) {
      const ia = addrParts(iv.address); const samePlace = (o.pid && s(iv.pid) === o.pid) || (addr && ia && addr.key === ia.key);
      if (samePlace) return { invId: s(iv.id), why: 'the same amount ($' + r2(o.total).toFixed(2) + ') on the same job within 30 days' };
    }
  }
  for (const m of arr(o.mailList)) {
    if (!m.si || s(m.id) === s(o.selfId) || m.kind !== 'sub_invoice' || m.si.route === 'dup') continue;
    const r = m.si.read || {}, mk = invKey(r.invoiceNumber);
    const subHit = (o.subId && m.si.sub && s(m.si.sub.id) === o.subId) || sameSub((m.si.sub && m.si.sub.name) || r.vendor, o.subName) || (o.fromEmail && low(m.si.fromEmail) === low(o.fromEmail));
    if (k && mk && k === mk && subHit) return { mailId: s(m.id), why: 'the same sub and invoice # ' + s(o.invoiceNumber) + ' came in ' + s(m.at).slice(0, 10) };
    if (amt && cents(r.total) === amt && within30(m.si.recvDate || m.at, o.recvDate) && ((o.pid && m.si.job && s(m.si.job.pid) === o.pid) || (addr && addrParts(r.jobAddress) && addrParts(r.jobAddress).key === addr.key)))
      return { mailId: s(m.id), why: 'the same amount on the same job came in ' + s(m.at).slice(0, 10) };
  }
  return null;
}

/* ── 10. the retainage the subcontract sets (the job's signed sub agreement, else the sub's record) ── */
function retainageFor(p, sub){
  let pct = 0;
  arr(p && p.subAgreements).forEach(function(a){ if (a.deleted || !/signed|active|executed/i.test(s(a.status))) return; const who = s(a.subId) === s(sub && sub.id) || sameSub(a.sub || a.subName || a.company, sub && sub.name); if (who) pct = num(a.retainagePct != null ? a.retainagePct : a.retainage) || pct; });
  if (!pct && sub) pct = num(sub.retainagePct);
  return Math.max(0, Math.min(50, pct));
}

/* ── 11. the whole read for one e-mail ─────────────────────────────────────── */
/* mail: { from:{email,name}, subject, text, date }; files: [{ name, type, buf, ref, hash }];
   deps: { data: { projects, subs, vendors, invs, invoices, gc_deleted_projects }, mailList, ai, fetch, driveExport, now } */
async function analyze(mail, files, deps){
  deps = deps || {};
  const data = deps.data || {}, now = deps.now || Date.now();
  const fw = forwarded(mail);
  const who = { email: fw && fw.email ? fw.email : low(mail.from && mail.from.email), name: fw ? fw.name : s(mail.from && mail.from.name) };
  const subject = fw ? fw.subject : s(mail.subject);
  const ctx = { from: who.email, fromName: who.name, subject: subject };
  const papers = [];
  arr(files).forEach(function(f){ const k = kindOf(f.name, f.type); if (k) papers.push(Object.assign({}, f, { kind: k })); });
  const links = googleLinks(s(mail.text) + '\n' + s(mail.html));
  const linkInfo = [];
  if (!papers.length && links.length) {
    for (const l of links) {
      const g = await fetchGoogle(l, deps);
      linkInfo.push({ url: l.url, kind: l.kind, ok: !!g.ok, via: g.via || '' });
      if (g.ok) { papers.push({ name: 'Google ' + (l.kind === 'file' ? 'Drive file' : l.kind) + ' ' + l.id.slice(0, 8), type: g.type, buf: g.buf, kind: g.kind, link: l.url, fetched: true }); break; }
    }
  }
  /* the best paper: an invoice-looking file first (by name), then PDF / Word / sheet / photo */
  const rank = { pdf: 5, docx: 5, doc: 4, xlsx: 4, xls: 3, csv: 3, image: 2, txt: 1 };
  papers.sort(function(a, b){ return ((/inv|bill|statement|pay\s*app/i.test(b.name) ? 10 : 0) + rank[b.kind]) - ((/inv|bill|statement|pay\s*app/i.test(a.name) ? 10 : 0) + rank[a.kind]); });
  let used = papers[0] || null, text = used ? textOf(used.buf, used.kind) : '';
  let src = used ? used.kind : '';
  const bodyText = s(mail.text).replace(/\n>.*$/gm, '');
  if (!used && /\b(invoice|amount\s+due|balance\s+due|total)\b/i.test(bodyText) && /\$?\s*\d[\d,]*\.\d{2}/.test(bodyText)) { text = bodyText; src = 'email body'; }
  const fileHay = papers.map(function(p){ return p.name; }).join(' ') + ' ' + subject;
  let f = null;
  if (text || used) { try { f = await aiRead(deps.ai, used, text, ctx); } catch (e) { f = null; } }
  const rx = parseText(text, { subject: subject, vendor: who.name });
  if (!f) f = rx;
  else { ['invoiceNumber', 'invoiceDate', 'dueDate', 'terms', 'po', 'jobAddress'].forEach(function(k){ if (!s(f[k]) && s(rx[k])) f[k] = rx[k]; }); if (!(f.total > 0) && rx.total > 0) f.total = rx.total; }
  if (!s(f.jobAddress)) f.jobAddress = findAddress('', subject) || findAddress(fileHay, '');
  const recvDate = centralYmd(mail.date || now);
  const read = { vendor: s(f.vendor) || who.name, vendorEmail: s(f.vendorEmail), invoiceNumber: s(f.invoiceNumber), invoiceDate: s(f.invoiceDate), dueDate: s(f.dueDate), terms: s(f.terms),
    jobAddress: s(f.jobAddress), po: s(f.po), customer: s(f.customer), lines: arr(f.lines), subtotal: r2(f.subtotal), tax: r2(f.tax), retainage: r2(f.retainage), total: r2(f.total),
    weOwe: f.weOwe !== false, isInvoice: f.isInvoice !== false, by: f.by, how: s(f.how) };
  /* the sub */
  const payees = arr(data.subs).concat(arr(data.vendors), supplierRows(data.ccw_suppliers));
  const sub = matchSub(payees, { email: who.email || read.vendorEmail, name: who.name, vendor: read.vendor, hay: fileHay });
  /* the job: the CRM PO on the invoice first (patch MONEY), then the address / customer / job name, then the sub's open jobs */
  const hay = text.slice(0, 20000) + ' ' + fileHay + ' ' + bodyText.slice(0, 4000);
  const jm = matchJob(data.projects, { jobAddress: read.jobAddress, po: read.po, customer: read.customer, hay: text.slice(0, 20000) + ' ' + fileHay }, data.gc_deleted_projects);
  let job = jm.best, how = job ? 'match' : '';
  const pj = poJob(data.projects, { po: read.po, hay: hay }, data.gc_deleted_projects);
  if (pj) {
    const sc = scoreJob(pj, { jobAddress: read.jobAddress, po: s(pj.autoPO || pj.po), customer: read.customer, hay: hay });
    job = Object.assign(sc, { conf: Math.max(97, sc.conf), why: 'PO ' + s(pj.autoPO || pj.po) + ' on the invoice' + (sc.why && !/^PO /.test(sc.why) ? ' · ' + sc.why : '') });
    jm.top = [job].concat(arr(jm.top).filter(function(x){ return x.pid !== job.pid; })).slice(0, 3); jm.certain = true; how = 'po';
  }
  const payKind = deps.kind === 'receipt' ? 'supplier' : deps.kind === 'client_invoice' ? 'client' : payeeKind(sub ? payees.find(function(x){ return s(x.id) === sub.id; }) : null, read.vendor || who.name);
  if (!jm.certain && payKind === 'sub' && sub && sub.conf >= 80) {
    const open = subOpenJobs(data, sub, now);
    if (open.length === 1 && (!job || job.conf < 85 || job.pid === open[0].pid)) { job = open[0]; jm.top = [job].concat(arr(jm.top).filter(function(x){ return x.pid !== job.pid; })).slice(0, 3); jm.certain = true; how = 'sub'; }
    else if (open.length > 1) jm.top = arr(jm.top).concat(open.filter(function(o){ return !arr(jm.top).some(function(x){ return x.pid === o.pid; }); }).map(function(o){ return Object.assign({}, o, { conf: 60, why: 'one of the sub\'s open jobs' }); })).slice(0, 5);
  }
  const pay = payDateFor(recvDate, read);
  const proj = job ? arr(data.projects).find(function(p){ return s(p.id) === job.pid; }) : null;
  const subRec = sub ? payees.find(function(x){ return s(x.id) === sub.id; }) : null;
  const retPct = proj ? retainageFor(proj, subRec || (sub ? { id: sub.id, name: sub.name, retainagePct: sub.retainagePct } : null)) : 0;
  const retainage = read.retainage > 0 ? read.retainage : (retPct ? r2(read.total * retPct / 100) : 0);
  const expDup = read.total > 0 && payKind === 'supplier' ? findExpDup({ invoiceNumber: read.invoiceNumber, total: read.total, vendor: (sub && sub.name) || read.vendor || who.name, date: read.invoiceDate || recvDate, expenses: data.expenses }) : null;
  const dup = expDup || (read.total > 0 && payKind !== 'client' ? findDup({ invoiceNumber: read.invoiceNumber, total: read.total, address: read.jobAddress, pid: jm.certain && job ? job.pid : '', subId: sub && sub.conf >= 80 ? sub.id : '', subName: (sub && sub.name) || read.vendor,
    fromEmail: who.email, recvDate: recvDate, invoices: arr(data.invs).concat(arr(data.invoices)), mailList: deps.mailList, selfId: deps.selfId }) : null)
    || (read.total > 0 && payKind === 'client' ? clientDup(read, arr(data.invs).concat(arr(data.invoices))) : null);
  let route = 'book', why = '';
  if (!used && !text) { route = links.length ? 'link' : 'review'; why = links.length ? 'the invoice is a Google link the CRM could not open' : 'no invoice file or invoice text was found'; }
  else if (dup) { route = 'dup'; why = dup.why; }
  else if (!(read.total > 0)) { route = 'match'; why = 'the amount could not be read'; }
  else if (payKind === 'sub' && (!read.isInvoice || !read.weOwe)) { route = 'review'; why = 'it does not say GrayCo owes it (paid, a statement or not an invoice)'; }
  else if (!jm.certain) { route = 'match'; why = job ? 'the job is not certain (best ' + job.conf + '%: ' + job.why + ')' : 'no job matched' + (read.po ? ' (PO "' + read.po + '" is not a CRM job)' : '') + (read.jobAddress ? ' "' + read.jobAddress + '"' : ''); }
  else if (payKind === 'sub' && (!sub || sub.conf < 80)) { route = 'match'; why = 'the sub is not on the CRM\'s sub list' + (read.vendor ? ' ("' + read.vendor + '")' : ''); }
  return { v: 1, route: route, why: why, src: src, payee: payKind, kind: deps.kind || 'sub_invoice', jobBy: jm.certain ? how || 'match' : '', file: used ? { name: s(used.name), kind: used.kind, ref: s(used.ref), link: s(used.link) } : null,
    read: read, sub: sub ? { id: sub.id, name: sub.name, conf: sub.conf, why: sub.why } : { id: '', name: read.vendor || who.name, conf: 0, why: 'not on the sub list' },
    job: job, top: jm.top, certain: !!jm.certain, dup: dup, recvDate: recvDate, payDate: pay.payDate, ruleDate: pay.ruleDate, payRule: pay.rule, byTerms: pay.byTerms,
    retainagePct: retPct, retainage: retainage, net: r2(read.total - retainage), fromEmail: who.email, fromName: who.name, subject: subject,
    forwardedBy: fw ? fw.by : '', links: linkInfo.length ? linkInfo : links.map(function(l){ return { url: l.url, kind: l.kind, ok: false }; }), at: new Date(now).toISOString() };
}

/* a QuickBooks copy of an invoice the CRM already has (same invoice #) — nothing to add */
function clientDup(read, invoices){
  const k = invKey(read.invoiceNumber); if (!k) return null;
  const hit = arr(invoices).find(function(iv){ return !/^(sub|supplier)$/i.test(s(iv.type)) && invKey(iv.invNum || iv.invNo || iv.number || iv.qbDocNumber) === k; });
  return hit ? { invId: s(hit.id), why: 'invoice # ' + s(read.invoiceNumber) + ' is already in ▥ Invoices', same: true } : null;
}
function fileHash(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
module.exports = { analyze, parseText, docxText, xlsxText, docText, pdfText, csvText, textOf, kindOf, typeFor, unzipEntries, addrParts, findAddress, matchJob, matchSub, scoreJob,
  payRule, payDateFor, centralYmd, findDup, invKey, forwarded, googleLinks, fetchGoogle, retainageFor, aiRead, AI_TOOL, fileHash,
  poJob, poTokens, subOpenJobs, payeeKind, supplierRows, findExpDup, ownInvoice, clientDup };
