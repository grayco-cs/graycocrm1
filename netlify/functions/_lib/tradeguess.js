/* netlify/functions/_lib/tradeguess.js — patch PLANREQ-C (owner 11/12: "if I add scopes and plans and specs put them in scopes by trade").
   What a bid-job file is and which trade(s) it is for, from its name and (when it has one) the start of its text:
     guess(name, text) → { kind: 'plans' | 'specs' | 'scope', trades: ['Electrical', …], why }
   • kind: "scope / SOW / bid form / exhibit" → scope; "spec / project manual / Division nn / section nn nn nn" → specs; a drawing (sheet
     number E-101, "plans", "drawings", DWG / DXF / pictures) → plans; a Word / Excel / text file with a trade and no plan / spec word → scope
     ("Plumbing fixture schedule.xlsx" → Plumbing scope); nothing known → plans.
   • trades: the words the CRM's "What is this document?" box reads (patch DOCGUESS — the same patterns), named as the bid trade list
     (patch BIDPOST tradeList: Paint, Windows & Doors, Fire protection …); CSI divisions (Div 09 Finishes → Drywall, Paint, Flooring, Tile,
     Ceilings; 26 → Electrical; 22 → Plumbing; 23 → HVAC …); drawing sheet prefixes (E- → Electrical, P- → Plumbing, M- → HVAC, FP- → Fire
     protection, S- → Concrete, L- → Landscaping; A- / G- / C- stay general).
   • text(buf, ext) → the first words of a PDF (its /Title and text in its first streams), a Word / Excel / PowerPoint file (its XML), a
     text / CSV / RTF file — best effort, a few KB, never throws.
   The person can change every guess before it is saved (CRM 📂 Manage → 📐 Plans & specs). Pure — no network. */
'use strict';
const zlib = require('zlib');
function s(v){ return v == null ? '' : String(v); }
const TRADES = [
  ['site ?work|sitework|site prep|grading|earthwork|excavat|erosion', 'Sitework'], ['concrete|flatwork|foundation|footing|slab', 'Concrete'], ['framing|carpentry|rough carp', 'Framing'],
  ['roof', 'Roofing'], ['drywall|sheetrock|gypsum', 'Drywall'], ['electric', 'Electrical'], ['plumb', 'Plumbing'], ['hvac|mechanical|heating|air condition|ductwork', 'HVAC'],
  ['paint|coating', 'Paint'], ['tile', 'Tile'], ['flooring|floor finish|floor cover|carpet|\\blvp\\b|vinyl plank|\\bvct\\b', 'Flooring'], ['ceiling|\\bact\\b|acoustical', 'Ceilings'], ['demo(lition)?\\b|tear ?out', 'Demolition'],
  ['insulat', 'Insulation'], ['masonry|brick|\\bcmu\\b|stone', 'Masonry'], ['door|hardware|window|glaz|storefront', 'Windows & Doors'], ['cabinet|millwork|countertop|casework', 'Cabinets'],
  ['landscap|irrigation', 'Landscaping'], ['fire ?sprinkler|fire protection|fire suppression', 'Fire protection'], ['siding|soffit|fascia', 'Siding'], ['gutter', 'Gutters'],
  ['mitigat|water damage|drying', 'Mitigation'], ['asbestos|abatement|\\blead\\b|mold remed', 'Abatement'], ['clean', 'Cleaning']];
/* CSI MasterFormat divisions → bid trades */
const CSI = { '02': ['Demolition'], '03': ['Concrete'], '04': ['Masonry'], '06': ['Framing', 'Cabinets'], '07': ['Roofing', 'Insulation', 'Siding'], '08': ['Windows & Doors'],
  '09': ['Drywall', 'Paint', 'Flooring', 'Tile', 'Ceilings'], '12': ['Cabinets'], '21': ['Fire protection'], '22': ['Plumbing'], '23': ['HVAC'], '26': ['Electrical'], '27': ['Electrical'],
  '28': ['Electrical'], '31': ['Concrete'], '32': ['Landscaping'] };
/* drawing sheet prefixes */
const SHEET = { E: ['Electrical'], P: ['Plumbing'], M: ['HVAC'], H: ['HVAC'], FP: ['Fire protection'], F: ['Fire protection'], S: ['Concrete'], L: ['Landscaping'], D: ['Demolition'], AD: ['Demolition'], ID: ['Flooring', 'Paint'] };
const EXT = { pdf: 1, png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, tif: 1, tiff: 1, heic: 1, heif: 1, bmp: 1, doc: 1, docx: 1, xls: 1, xlsx: 1, xlsm: 1, csv: 1, ppt: 1, pptx: 1, txt: 1, rtf: 1, dwg: 1, dxf: 1, dwf: 1, zip: 1 };
const TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', csv: 'text/csv', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', rtf: 'application/rtf', dwg: 'application/acad', dxf: 'image/vnd.dxf', dwf: 'model/vnd.dwf', zip: 'application/zip' };
const KINDS = ['plans', 'specs', 'scope'];

function words(t){ return s(t).replace(/[_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim(); }
function tradesIn(t){
  const out = []; const add = l => l.forEach(x => { if (out.indexOf(x) < 0) out.push(x); });
  t = ' ' + words(t) + ' ';
  /* CSI: "Div 09", "Division 26", "Section 09 29 00", "092900" */
  let m; const re = /\b(?:div(?:ision)?\.?\s*(\d{1,2})\b|section\s*(\d{2})\s?\d{2}\s?\d{2}|\b(\d{2})\s\d{2}\s\d{2}\b)/ig;
  while ((m = re.exec(t))) { const d = ('0' + (m[1] || m[2] || m[3])).slice(-2); if (CSI[d]) add(CSI[d]); }
  TRADES.map(x => { const m2 = new RegExp(x[0], 'i').exec(t); return m2 ? [m2.index, x[1]] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]).forEach(x => add([x[1]]));   /* the trade named first leads */
  return out;
}
function sheetTrades(name){
  const base = s(name).replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  const m = /^([A-Z]{1,2})[-\s.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?\b/.exec(base);   /* E-101, P2.1, FP-001, M101 */
  return m && SHEET[m[1]] ? SHEET[m[1]].slice() : [];
}
function extOf(n){ const m = /\.([A-Za-z0-9]{2,5})$/.exec(s(n)); return m ? m[1].toLowerCase() : ''; }
function guess(name, text){
  const n = s(name), base = n.split('/').pop(), ext = extOf(base), t = words(base.replace(/\.[A-Za-z0-9]{1,5}$/, '')) + ' ' + words(n.split('/').slice(0, -1).join(' ')), head = s(text).slice(0, 4000);
  const all = t + ' ' + head;
  const sheet = sheetTrades(base);
  let trades = tradesIn(t); if (!trades.length && head) trades = tradesIn(head);
  sheet.forEach(x => { if (trades.indexOf(x) < 0) trades.unshift(x); });
  let kind = '', why = '';
  /* patch PLANREQ-I (owner 11/12): a scope for EVERY sub (general scope, all trades, Div 01 general requirements) stays with the plans */
  if (/\b(general (scope|requirements|conditions)|all (trades|subs|bidders)|div(ision)?\.?\s*0?1\b)/i.test(t)) { kind = 'scope'; trades = []; why = 'a scope for every sub'; }
  else if (/\b(scope|sow|bid form|exhibit|inclusions|exclusions)\b/i.test(t)) { kind = 'scope'; why = 'the name says scope'; }
  else if (/\b(spec|specs|specifications?|project manual|div(ision)?\.?\s*\d{1,2}|section\s*\d{2}\s?\d{2})\b/i.test(t)) { kind = 'specs'; why = 'the name says specs'; }
  else if (sheet.length || /\b(plans?|drawings?|sheets?|blueprints?|elevations?|floor ?plan|details?|cd set|permit set)\b/i.test(t) || /^(dwg|dxf|dwf|png|jpg|jpeg|gif|webp|tif|tiff|heic|heif|bmp)$/.test(ext)) { kind = 'plans'; why = sheet.length ? 'a drawing sheet number' : 'the name says plans'; }
  else if (/\b(scope of work|statement of work|bid form|inclusions)\b/i.test(head)) { kind = 'scope'; why = 'the document says scope'; }
  else if (/\b(specifications|project manual|section \d{2} ?\d{2} ?\d{2}|division \d{1,2})\b/i.test(head)) { kind = 'specs'; why = 'the document says specs'; }
  else if (trades.length && /^(doc|docx|xls|xlsx|xlsm|csv|txt|rtf|ppt|pptx|pdf)$/.test(ext)) { kind = 'scope'; why = 'a ' + trades[0] + ' document'; }
  else { kind = 'plans'; why = 'nothing says otherwise'; }
  if (/\b(schedule)\b/i.test(t) && trades.length && kind === 'plans' && !sheet.length) { kind = 'scope'; why = 'a ' + trades[0] + ' schedule'; }
  return { kind: kind, trades: trades.slice(0, 6), why: why, ext: ext, type: TYPES[ext] || 'application/octet-stream', ok: !!EXT[ext] };
}
/* ── the first words of a file (best effort) ── */
function zipEntries(buf){
  const out = {}; let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  const n = Math.min(buf.readUInt16LE(eocd + 10), 400); let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8'); p += 46 + nl + xl + cl;
    out[name] = function(){ try { if (usize > 8 * 1024 * 1024) return ''; const st = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.slice(st, st + csize);
      return (method === 0 ? raw : zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, usize) })).toString('utf8'); } catch (e) { return ''; } };
  }
  return out;
}
function xmlText(x){ return s(x).replace(/<\/(w:p|a:p|row|si)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim(); }
function pdfText(buf){
  const raw = buf.slice(0, Math.min(buf.length, 3 * 1024 * 1024)).toString('latin1'); let out = '';
  const tm = /\/Title\s*\(([^)]{2,200})\)/.exec(raw); if (tm) out += tm[1] + '\n';
  const re = /stream\r?\n/g; let m, n = 0;
  while ((m = re.exec(raw)) && n < 12 && out.length < 4000) {
    const st = m.index + m[0].length, en = raw.indexOf('endstream', st); if (en < 0) break; n++;
    let body = Buffer.from(raw.slice(st, en), 'latin1'), txt = '';
    try { txt = zlib.inflateSync(body).toString('latin1'); } catch (e) { txt = body.toString('latin1'); }
    const parts = txt.match(/\((?:\\.|[^\\)])*\)\s*T[jJ*']|\[(?:[^\]]*)\]\s*TJ/g) || [];
    out += parts.map(p => (p.match(/\((?:\\.|[^\\)])*\)/g) || []).map(q => q.slice(1, -1).replace(/\\(.)/g, '$1')).join('')).join(' ') + '\n';
  }
  return out.replace(/[^\x20-\x7E\n]+/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
function text(buf, ext){
  try {
    if (!buf || !buf.length) return '';
    ext = s(ext).toLowerCase();
    if (ext === 'pdf') return pdfText(buf).slice(0, 4000);
    if (ext === 'docx') { const z = zipEntries(buf); return xmlText((z['docProps/core.xml'] ? z['docProps/core.xml']() : '') + '\n' + (z['word/document.xml'] ? z['word/document.xml']() : '')).slice(0, 4000); }
    if (ext === 'xlsx' || ext === 'xlsm') { const z = zipEntries(buf); return xmlText(Object.keys(z).filter(k => /^xl\/(sharedStrings|worksheets\/sheet1)\.xml$/.test(k)).map(k => z[k]()).join('\n')).slice(0, 4000); }
    if (ext === 'pptx') { const z = zipEntries(buf); return xmlText(Object.keys(z).filter(k => /^ppt\/slides\/slide[12]\.xml$/.test(k)).map(k => z[k]()).join('\n')).slice(0, 4000); }
    if (/^(txt|csv|rtf)$/.test(ext)) return buf.slice(0, 8000).toString('utf8').replace(/\\[a-z]+-?\d* ?|[{}]/g, ext === 'rtf' ? ' ' : '$&').slice(0, 4000);
  } catch (e) {}
  return '';
}
module.exports = { guess, text, tradesIn, sheetTrades, extOf, EXT, TYPES, KINDS, CSI, TRADES };
