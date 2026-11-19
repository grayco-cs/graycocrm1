/* ============================================================================
   GrayCo — PLAIN PDF TEXT.   netlify/functions/_lib/pdftext.js   (patch PLANROOM)

   The words of a small text PDF (a bid notice, an invitation to bid, a spec cover, the instructions to bidders),
   read without any outside service or package: the objects (plain and in object streams), the Flate-compressed
   page contents, the fonts' ToUnicode maps, the text operators (Tj TJ ' "), and a new line where the text moves
   down. A scanned PDF (pictures of pages) has no words: text() answers '' and the caller says so.

     text(buf, { maxChars }) → string ('' when nothing could be read)
   Never throws.
   ========================================================================== */
'use strict';
const zlib = require('zlib');

function latin(buf){ return buf.toString('latin1'); }
function inflate(b){
  try { return zlib.inflateSync(b); } catch (e) {}
  try { return zlib.inflateRawSync(b.slice(2)); } catch (e) {}
  try { return zlib.inflateSync(b, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch (e) {}
  return null;
}
/* the stream of one object: its dictionary text and its decoded bytes (Flate only; anything else is skipped) */
function streamOf(src, start){
  const s0 = src.indexOf('stream', start); if (s0 < 0) return null;
  let p = s0 + 6; if (src[p] === '\r') p++; if (src[p] === '\n') p++;
  const dict = src.slice(start, s0);
  const lm = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict);
  let end = lm && !lm[2] ? p + (+lm[1]) : -1;
  if (end < 0 || src.slice(end, end + 30).indexOf('endstream') < 0) { end = src.indexOf('endstream', p); if (end < 0) return null; }
  const raw = Buffer.from(src.slice(p, end), 'latin1');
  const filt = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict) || [])[1] || '';
  if (!filt) return { dict, data: raw };
  if (/^\/FlateDecode$|^\[\s*\/FlateDecode\s*\]$/.test(filt.trim())) { const d = inflate(raw); return d ? { dict, data: d } : null; }
  return null;
}
/* every object: number → { body (text before any stream), stream (decoded) } */
function objects(src){
  const out = {}, re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  const starts = []; while ((m = re.exec(src))) starts.push({ n: +m[1], at: m.index, body: re.lastIndex });
  starts.forEach((o, i) => {
    const stop = i + 1 < starts.length ? starts[i + 1].at : src.length;
    const chunk = src.slice(o.body, stop), eo = chunk.indexOf('endobj');
    const body = eo >= 0 ? chunk.slice(0, eo) : chunk;
    const si = body.indexOf('stream');
    const rec = { body: si >= 0 ? body.slice(0, si) : body };
    if (si >= 0 && /^\s*<</.test(body)) { const st = streamOf(src, o.body); if (st) rec.stream = st.data; }
    out[o.n] = rec;
  });
  /* object streams (PDF 1.5+): the objects packed inside */
  Object.keys(out).forEach(k => {
    const o = out[k]; if (!o.stream || !/\/Type\s*\/ObjStm/.test(o.body)) return;
    const n = +((/\/N\s+(\d+)/.exec(o.body) || [])[1] || 0), first = +((/\/First\s+(\d+)/.exec(o.body) || [])[1] || 0);
    const t = latin(o.stream), head = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = head[2 * i], off = head[2 * i + 1], next = i + 1 < n ? head[2 * i + 3] : t.length - first;
      if (!isFinite(num) || out[num]) continue;
      out[num] = { body: t.slice(first + off, first + next) };
    }
  });
  return out;
}
function ref(v){ const m = /^\s*(\d+)\s+\d+\s+R/.exec(v || ''); return m ? +m[1] : null; }
function dictOf(objs, v){ const r = ref(v); return r != null && objs[r] ? objs[r].body : v || ''; }
/* a ToUnicode CMap → { map: code(hex) → string, bytes: 1|2 } */
function cmap(t){
  const map = {}; let bytes = 1;
  const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(t); if (cs) bytes = Math.max(1, cs[1].length / 2);
  const hexStr = h => { let o = ''; for (let i = 0; i + 4 <= h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); if (h.length === 2) o = String.fromCharCode(parseInt(h, 16)); return o; };
  t.replace(/beginbfchar([\s\S]*?)endbfchar/g, (m0, body) => { body.replace(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g, (m, a, b) => { map[a.toLowerCase()] = hexStr(b); return m; }); return m0; });
  t.replace(/beginbfrange([\s\S]*?)endbfrange/g, (m0, body) => {
    body.replace(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g, (m, a, b, c, d, list) => {
      const lo = parseInt(a, 16), hi = parseInt(b, 16), w = a.length; if (hi - lo > 5000) return m;
      if (d != null) { const base = parseInt(d.slice(-4), 16), pre = d.length > 4 ? hexStr(d.slice(0, -4)) : ''; for (let x = lo; x <= hi; x++) map[x.toString(16).padStart(w, '0')] = pre + String.fromCharCode(base + x - lo); }
      else { const items = (list.match(/<([0-9a-fA-F]+)>/g) || []).map(x => hexStr(x.slice(1, -1))); for (let x = lo; x <= hi && x - lo < items.length; x++) map[x.toString(16).padStart(w, '0')] = items[x - lo]; }
      return m; });
    return m0; });
  return { map, bytes };
}
/* the fonts a page (or form) can use: /F1 → { map, bytes } | null */
function fontsOf(objs, resDict, memo){
  const fonts = {};
  const res = dictOf(objs, resDict);
  const fm = /\/Font\s*(<<[\s\S]*?>>|\d+\s+\d+\s+R)/.exec(res); if (!fm) return fonts;
  const fd = dictOf(objs, fm[1]);
  fd.replace(/\/([^\s\/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g, (m, name, num) => {
    num = +num; if (memo[num] === undefined) {
      memo[num] = null; const f = objs[num] && objs[num].body;
      const tu = f && ref((/\/ToUnicode\s+(\d+\s+\d+\s+R)/.exec(f) || [])[1]);
      if (tu != null && objs[tu] && objs[tu].stream) memo[num] = cmap(latin(objs[tu].stream));
      else if (f && /Identity-H/.test(f)) memo[num] = { map: {}, bytes: 2 };
    }
    fonts[name] = memo[num]; return m;
  });
  return fonts;
}
/* a PDF string literal → its bytes (latin1) */
function lit(s, i){
  let depth = 1, out = ''; i++;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === '\\') { const n = s[i + 1];
      if (/[0-7]/.test(n)) { const m = /^[0-7]{1,3}/.exec(s.slice(i + 1)); out += String.fromCharCode(parseInt(m[0], 8) & 255); i += 1 + m[0].length; continue; }
      const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }; if (n === '\r' || n === '\n') { i += n === '\r' && s[i + 2] === '\n' ? 3 : 2; continue; }
      out += esc[n] != null ? esc[n] : n; i += 2; continue; }
    if (c === '(') depth++; if (c === ')') { depth--; if (!depth) break; }
    out += c; i++;
  }
  return { v: out, end: i + 1 };
}
const WIN = { 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—', 0x95: '•', 0x85: '…', 0xa0: ' ' };
function decodeStr(bytes, font){
  if (font && font.map && Object.keys(font.map).length) {
    const w = font.bytes || 1; let o = '';
    for (let i = 0; i + w <= bytes.length; i += w) { let h = ''; for (let k = 0; k < w; k++) h += bytes.charCodeAt(i + k).toString(16).padStart(2, '0'); const u = font.map[h]; o += u != null ? u : (w === 1 ? bytes[i] : ''); }
    return o;
  }
  if (font && font.bytes === 2) return '';   /* Identity-H without a map: no way to know the letters */
  let o = ''; for (let i = 0; i < bytes.length; i++) { const c = bytes.charCodeAt(i); o += WIN[c] || (c >= 32 || c === 9 ? String.fromCharCode(c) : ''); }
  return o;
}
function hexBytes(h){ h = h.replace(/\s+/g, ''); if (h.length % 2) h += '0'; let o = ''; for (let i = 0; i < h.length; i += 2) o += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return o; }
/* one content stream → text */
function contentText(t, fonts){
  /* the text position is followed in text space: BT resets the line start, Td / TD / T* move it, Tm sets it. Text shown on a new
     y → a new line; on the same y, a jump past where the words so far would end (about half an em a letter) → a space. */
  let out = '', font = null, i = 0, operands = [], fs = 10, sx = 1, lx = 0, ly = 0, lead = 0, lastY = null, curX = null, run = 0, pend = false;
  const n = t.length;
  const show = str => {
    if (!str) return;
    if (pend) {
      if (lastY != null && Math.abs(ly - lastY) > Math.max(0.5, fs * Math.abs(sx) * 0.6)) { if (!/\n$/.test(out)) out += '\n'; }
      else if (curX != null) { const end = curX + run * fs * sx * 0.5; if (lx - end > fs * sx * 0.2 && !/\s$/.test(out)) out += ' '; }
      curX = lx; run = 0; lastY = ly; pend = false;
    }
    out += str; run += str.length;
  };
  const moved = () => { pend = true; };
  while (i < n) {
    const c = t[i];
    if (c === '(') { const r = lit(t, i); operands.push({ s: r.v }); i = r.end; continue; }
    if (c === '<' && t[i + 1] !== '<') { const e = t.indexOf('>', i); operands.push({ s: hexBytes(t.slice(i + 1, e < 0 ? n : e)) }); i = e < 0 ? n : e + 1; continue; }
    if (c === '[') { const arrv = []; i++; while (i < n && t[i] !== ']') { if (t[i] === '(') { const r = lit(t, i); arrv.push(r.v); i = r.end; } else if (t[i] === '<') { const e = t.indexOf('>', i); arrv.push(hexBytes(t.slice(i + 1, e < 0 ? n : e))); i = e < 0 ? n : e + 1; } else { const m = /^-?\d*\.?\d+/.exec(t.slice(i, i + 20)); if (m) { arrv.push(+m[0]); i += m[0].length; } else i++; } } i++; operands.push({ a: arrv }); continue; }
    if (c === '/') { const m = /^\/[^\s\/<>\[\]()]+/.exec(t.slice(i, i + 80)); operands.push({ n: m ? m[0].slice(1) : '' }); i += m ? m[0].length : 1; continue; }
    if (/[-\d.]/.test(c)) { const m = /^-?\d*\.?\d+/.exec(t.slice(i, i + 30)); if (m) { operands.push({ num: +m[0] }); i += m[0].length; continue; } }
    if (/[A-Za-z'"*]/.test(c)) {
      const m = /^[A-Za-z'"*]+/.exec(t.slice(i, i + 10)), op = m[0]; i += op.length;
      const nums = operands.filter(y => y.num != null).map(y => y.num);
      if (op === 'BI') { const e = t.indexOf('EI', i); i = e < 0 ? n : e + 2; operands = []; continue; }
      if (op === 'BT') { lx = 0; ly = 0; moved(); }
      else if (op === 'Tf') { const nm = operands.filter(x => x.n != null).pop(); font = nm ? fonts[nm.n] || null : null; if (nums.length && nums[nums.length - 1] > 0) fs = nums[nums.length - 1]; }
      else if (op === 'TL') { if (nums.length) lead = nums[nums.length - 1]; }
      else if (op === 'Td' || op === 'TD') { if (nums.length >= 2) { lx += nums[nums.length - 2] * sx; ly += nums[nums.length - 1] * Math.abs(sx || 1); if (op === 'TD') lead = -nums[nums.length - 1]; } moved(); }
      else if (op === 'Tm') { if (nums.length >= 6) { const v = nums.slice(-6); sx = Math.abs(v[0]) || 1; lx = v[4]; ly = v[5]; } moved(); }
      else if (op === 'T*') { ly -= lead || fs; moved(); }
      else if (op === 'Tj' || op === "'" || op === '"') { if (op !== 'Tj') { ly -= lead || fs; moved(); } const x = operands.filter(y => y.s != null).pop(); if (x) show(decodeStr(x.s, font)); }
      else if (op === 'TJ') { const x = operands.filter(y => y.a).pop(); if (x) x.a.forEach(v => { if (typeof v === 'string') show(decodeStr(v, font)); else if (v < -250) { if (!/\s$/.test(out)) { out += ' '; } } }); }
      operands = []; continue;
    }
    i++;
  }
  return out;
}
function text(buf, opt){
  opt = opt || {};
  try {
    if (!buf || buf.length < 8 || latin(buf.slice(0, 1024)).indexOf('%PDF') < 0) return '';
    const src = latin(buf), objs = objects(src), memo = {}, pages = [];
    const walk = (k, d) => { const o = objs[k]; if (!o || d > 30) return; if (/\/Type\s*\/Pages\b/.test(o.body)) { const km = /\/Kids\s*\[([^\]]*)\]/.exec(o.body); (km ? km[1].match(/\d+\s+\d+\s+R/g) || [] : []).map(ref).forEach(c => walk(c, d + 1)); } else if (/\/Type\s*\/Page\b/.test(o.body) && pages.indexOf(k) < 0) pages.push(k); };
    const root = ref((/\/Root\s+(\d+\s+\d+\s+R)/.exec(src) || [])[1]), cat = root != null && objs[root] ? objs[root].body : '';
    const top = ref((/\/Pages\s+(\d+\s+\d+\s+R)/.exec(cat) || [])[1]); if (top != null) walk(top, 0);
    if (!pages.length) Object.keys(objs).map(Number).sort((a, b) => a - b).forEach(k => { const b = objs[k].body; if (/\/Type\s*\/Page\b(?!s)/.test(b)) pages.push(k); });
    let out = '';
    const inherit = k => { let b = objs[k].body, g = 0; while (!/\/Resources/.test(b) && g++ < 10) { const p = ref((/\/Parent\s+(\d+\s+\d+\s+R)/.exec(b) || [])[1]); if (p == null || !objs[p]) break; b = objs[p].body; } return (/\/Resources\s*(<<(?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>)*>>|\d+\s+\d+\s+R)/.exec(b) || [])[1] || ''; };
    for (const k of pages) {
      const b = objs[k].body, fonts = fontsOf(objs, inherit(k), memo);
      const cm = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(b); if (!cm) continue;
      const refs = (cm[1].match(/\d+\s+\d+\s+R/g) || []).map(ref).filter(x => x != null);
      let content = '';
      refs.forEach(r => { let o = objs[r]; if (o && !o.stream && /^\s*\[/.test(o.body)) { (o.body.match(/\d+\s+\d+\s+R/g) || []).map(ref).forEach(r2 => { if (objs[r2] && objs[r2].stream) content += latin(objs[r2].stream) + '\n'; }); } else if (o && o.stream) content += latin(o.stream) + '\n'; });
      /* form XObjects drawn on the page (Word / Bluebeam often put the text in one) */
      const xo = /\/XObject\s*(<<[\s\S]*?>>|\d+\s+\d+\s+R)/.exec(inherit(k));
      let forms = '';
      if (xo) dictOf(objs, xo[1]).replace(/\/[^\s\/<>]+\s+(\d+)\s+\d+\s+R/g, (m, num) => { const o = objs[+num]; if (o && o.stream && /\/Subtype\s*\/Form/.test(o.body)) { const ff = fontsOf(objs, (/\/Resources\s*(<<(?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>)*>>|\d+\s+\d+\s+R)/.exec(o.body) || [])[1] || '', memo); forms += contentText(latin(o.stream), Object.assign({}, fonts, ff)) + '\n'; } return m; });
      out += contentText(content, fonts) + '\n' + forms + '\n\f\n';
      if (out.length > (opt.maxChars || 200000)) break;
    }
    out = out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/(\d) (st|nd|rd|th)\b/g, '$1$2').replace(/ ([,.;:)])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
    return out.slice(0, opt.maxChars || 200000);
  } catch (e) { return ''; }
}
module.exports = { text };
