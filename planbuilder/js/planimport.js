// Plan import: reads a floor plan you already have and turns it into walls, doors, windows and rooms.
//  - Pictures and PDFs (scans, photos of prints, exported drawings): the thick dark lines are walls.
//    Thin lines (text, dimensions, door swings, furniture, hatching) are dropped, gaps in walls become
//    doors (or windows when window lines sit in the gap), and every closed space becomes a room.
//  - AutoCAD DXF: lines and polylines, in the file's own units. Pairs of parallel lines a wall-thickness
//    apart become one wall; layers named like walls are used first; TEXT / MTEXT inside a room names it.
// Straight walls at any angle from DXF; pictures are read for square (horizontal / vertical) walls.
// No network: everything runs in the browser.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;

// ======================= pictures =======================

// Grey levels of an RGBA image (transparent counts as white).
export function toGray(img) {
  const { width: w, height: h, data } = img, g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = data[j + 3] < 128 ? 255 : (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114) | 0;
  return g;
}
// Otsu threshold: the grey level that best splits ink from paper.
export function otsu(g) {
  const hist = new Float64Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = g.length - wB; if (!wF) break;
    sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; th = t; }
  }
  return th;
}
// Keep only pixels that sit inside a solid square of side 2r+1 (erode), then grow them back (dilate):
// lines thinner than that disappear, thick walls stay.
function openMask(m, w, h, r) {
  if (r < 1) return m.slice();
  const k = 2 * r + 1;
  const pass = (src, horiz, needAll) => {
    const out = new Uint8Array(w * h), n = horiz ? w : h, lines = horiz ? h : w;
    for (let L = 0; L < lines; L++) {
      const at = i => horiz ? L * w + i : i * w + L;
      let cnt = 0;
      for (let i = 0; i < Math.min(r, n); i++) cnt += src[at(i)];
      for (let i = 0; i < n; i++) {
        if (i + r < n) cnt += src[at(i + r)];
        if (i - r - 1 >= 0) cnt -= src[at(i - r - 1)];
        const span = Math.min(n - 1, i + r) - Math.max(0, i - r) + 1;
        out[at(i)] = needAll ? (cnt === span && span === k ? 1 : 0) : (cnt > 0 ? 1 : 0);
      }
    }
    return out;
  };
  const er = pass(pass(m, true, true), false, true);
  return pass(pass(er, true, false), false, false);
}
// Pixels that are part of a long run along one direction.
function runMask(m, w, h, minLen, horiz) {
  const out = new Uint8Array(w * h), n = horiz ? w : h, lines = horiz ? h : w;
  for (let L = 0; L < lines; L++) {
    let s = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && m[horiz ? L * w + i : i * w + L];
      if (on && s < 0) s = i;
      if (!on && s >= 0) { if (i - s >= minLen) for (let j = s; j < i; j++) out[horiz ? L * w + j : j * w + L] = 1; s = -1; }
    }
  }
  return out;
}
// Connected pieces of a mask: bounding box, pixel count, mean of the cross position.
function components(m, w, h) {
  const lab = new Int32Array(w * h), out = [], stack = [];
  let id = 0;
  for (let p = 0; p < m.length; p++) {
    if (!m[p] || lab[p]) continue;
    id++; lab[p] = id; stack.push(p);
    const c = { x0: w, y0: h, x1: 0, y1: 0, n: 0, sx: 0, sy: 0 };
    while (stack.length) {
      const q = stack.pop(), x = q % w, y = (q / w) | 0;
      c.n++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const nb = [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1];
      for (const r of nb) if (r >= 0 && m[r] && !lab[r]) { lab[r] = id; stack.push(r); }
    }
    out.push(c);
  }
  return out;
}

/**
 * Find wall segments in a picture. img: { width, height, data } (RGBA).
 * opts.dark: grey level below which a pixel is ink (default: Otsu). opts.minThick: thinnest wall in pixels.
 * Returns { segs: [{a, b, t}] in pixels, ink (thin-line mask), w, h, dark, minThick }.
 */
export function detectWallsInImage(img, opts = {}) {
  const w = img.width, h = img.height, g = toGray(img);
  const dark = opts.dark ?? Math.min(170, Math.max(60, otsu(g)));
  const ink = new Uint8Array(w * h); for (let i = 0; i < g.length; i++) ink[i] = g[i] < dark ? 1 : 0;
  const minThick = opts.minThick ?? guessThickness(ink, w, h);
  const wallM = openMask(ink, w, h, Math.max(1, Math.floor(minThick / 2)));
  const minLen = Math.max(12, Math.round(minThick * 3));
  const segs = [];
  [true, false].forEach(horiz => {
    const rm = runMask(wallM, w, h, minLen, horiz);
    components(rm, w, h).forEach(c => {
      const len = horiz ? c.x1 - c.x0 + 1 : c.y1 - c.y0 + 1, thick = c.n / len;
      if (len < minLen || thick < minThick * 0.6 || thick > len / 1.6) return;
      if (horiz) { const y = c.sy / c.n; segs.push({ a: { x: c.x0, y }, b: { x: c.x1 + 1, y }, t: thick }); }
      else { const x = c.sx / c.n; segs.push({ a: { x, y: c.y0 }, b: { x, y: c.y1 + 1 }, t: thick }); }
    });
  });
  return { segs, ink, w, h, dark, minThick };
}
// Thinnest wall worth keeping: a bit thicker than the typical pen line.
function guessThickness(ink, w, h) {
  const runs = new Map();
  const add = n => { if (n >= 1 && n < 80) runs.set(n, (runs.get(n) || 0) + 1); };
  for (let y = 0; y < h; y += 3) { let s = -1; for (let x = 0; x <= w; x++) { const on = x < w && ink[y * w + x]; if (on && s < 0) s = x; if (!on && s >= 0) { add(x - s); s = -1; } } }
  for (let x = 0; x < w; x += 3) { let s = -1; for (let y = 0; y <= h; y++) { const on = y < h && ink[y * w + x]; if (on && s < 0) s = y; if (!on && s >= 0) { add(y - s); s = -1; } } }
  let pen = 1, most = 0; runs.forEach((c, n) => { if (n <= 6 && c > most) { most = c; pen = n; } });
  return clamp(pen * 2 + 2, 4, 24);
}
// Fraction of ink inside a wall-thick band between two points (pixels): window lines sit in the gap.
export function inkFraction(ink, w, h, a, b, t) {
  const L = hyp(b.x - a.x, b.y - a.y); if (L < 1) return 0;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L; let on = 0, n = 0;
  for (let s = L * 0.15; s <= L * 0.85; s += 1) for (let k = -t / 2; k <= t / 2; k += 1) {
    const x = Math.round(a.x + ux * s - uy * k), y = Math.round(a.y + uy * s + ux * k);
    if (x < 0 || y < 0 || x >= w || y >= h) continue; n++; on += ink[y * w + x];
  }
  return n ? on / n : 0;
}

// ======================= AutoCAD DXF =======================

const DXF_UNITS = { 1: 1 / 12, 2: 1, 4: 1 / 304.8, 5: 1 / 30.48, 6: 3.28084, 3: 5280, 8: 1 / 12000, 10: 3, 14: 0.328084 };
export const DXF_UNIT_NAMES = { 1: 'inches', 2: 'feet', 4: 'millimeters', 5: 'centimeters', 6: 'meters' };

/** Read a DXF: { segs (drawing units), texts, layers, units (INSUNITS code), arcs } */
export function parseDXF(text) {
  const raw = text.split(/\r?\n/), pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([parseInt(raw[i], 10), raw[i + 1].trim()]);
  let units = 0, i = 0;
  const blocks = new Map(), top = [];
  let section = '', cur = null, list = top, block = null;
  const flush = () => { if (cur) { list.push(cur); cur = null; } };
  for (; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0) {
      flush();
      if (v === 'SECTION') { const nx = pairs[i + 1]; section = nx && nx[0] === 2 ? nx[1] : ''; continue; }
      if (v === 'ENDSEC') { section = ''; continue; }
      if (section === 'BLOCKS' && v === 'BLOCK') { block = { name: '', ents: [], bx: 0, by: 0 }; list = block.ents; cur = { type: 'BLOCKHEAD', g: [] }; continue; }
      if (section === 'BLOCKS' && v === 'ENDBLK') { if (block) blocks.set(block.name, block); block = null; list = top; continue; }
      if (section === 'ENTITIES' || section === 'BLOCKS') cur = { type: v, g: [] };
      continue;
    }
    if (section === 'HEADER' && c === 9 && v === '$INSUNITS') { const nx = pairs[i + 1]; if (nx && nx[0] === 70) units = +nx[1]; }
    if (cur) {
      if (cur.type === 'BLOCKHEAD' && block) { if (c === 2) block.name = v; if (c === 10) block.bx = +v; if (c === 20) block.by = +v; }
      else cur.g.push([c, v]);
    }
  }
  flush();
  const segs = [], texts = [], arcs = [];
  const val = (g, code, d = 0) => { const f = g.find(x => x[0] === code); return f ? f[1] : d; };
  const emit = (ents, T, depth, layerOver) => {
    let poly = null;
    ents.forEach(e => {
      const g = e.g, layer = layerOver && val(g, 8, '0') === '0' ? layerOver : val(g, 8, '0');
      const P = (x, y) => T(+x, +y);
      if (e.type === 'LINE') segs.push({ a: P(val(g, 10), val(g, 20)), b: P(val(g, 11), val(g, 21)), layer });
      else if (e.type === 'LWPOLYLINE') {
        const pts = []; let x = null;
        g.forEach(([c, v]) => { if (c === 10) x = +v; if (c === 20 && x != null) { pts.push(P(x, +v)); x = null; } });
        const closed = (+val(g, 70, 0)) & 1;
        for (let k = 0; k + 1 < pts.length; k++) segs.push({ a: pts[k], b: pts[k + 1], layer });
        if (closed && pts.length > 2) segs.push({ a: pts[pts.length - 1], b: pts[0], layer });
      } else if (e.type === 'POLYLINE') poly = { pts: [], closed: (+val(g, 70, 0)) & 1, layer };
      else if (e.type === 'VERTEX' && poly) poly.pts.push(P(val(g, 10), val(g, 20)));
      else if (e.type === 'SEQEND' && poly) {
        for (let k = 0; k + 1 < poly.pts.length; k++) segs.push({ a: poly.pts[k], b: poly.pts[k + 1], layer: poly.layer });
        if (poly.closed && poly.pts.length > 2) segs.push({ a: poly.pts[poly.pts.length - 1], b: poly.pts[0], layer: poly.layer });
        poly = null;
      } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
        let s = g.filter(([c]) => c === 3).map(x => x[1]).join('') + val(g, 1, '');
        s = s.replace(/\\[PpNn]/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/%%[cdp]/gi, '').trim();
        if (s) texts.push({ ...P(val(g, 10), val(g, 20)), text: s, layer });
      } else if (e.type === 'ARC') arcs.push({ c: P(val(g, 10), val(g, 20)), layer });
      else if (e.type === 'INSERT' && depth < 4) {
        const b = blocks.get(val(g, 2, '')); if (!b) return;
        const ix = +val(g, 10), iy = +val(g, 20), sx = +val(g, 41, 1) || 1, sy = +val(g, 42, 1) || 1, rot = (+val(g, 50, 0)) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
        emit(b.ents, (x, y) => { const lx = (x - b.bx) * sx, ly = (y - b.by) * sy; return T(ix + lx * c - ly * s, iy + lx * s + ly * c); }, depth + 1, layer);
      }
    });
  };
  emit(top, (x, y) => ({ x, y }), 0, null);
  return { segs, texts, arcs, units, layers: [...new Set(segs.map(s => s.layer))] };
}
// Feet per drawing unit (DXF $INSUNITS; unitless architectural drawings are usually inches).
export function dxfScale(units) { return DXF_UNITS[units] || 1 / 12; }

const SKIP_LAYER = /dim|text|anno|furn|equip|hatch|grid|title|border|defpoint|symb|note|elec|plum|mech|light|ceil|fixt|area|room|tag|key|sheet|vport/i;
const WALL_LAYER = /wall/i;

/** DXF segments (feet, y down like the plan) → wall candidates: pairs of parallel faces become centerlines. */
export function dxfWalls(dxf, ftPerUnit) {
  const k = ftPerUnit;
  const all = dxf.segs.map(s => ({ a: { x: s.a.x * k, y: -s.a.y * k }, b: { x: s.b.x * k, y: -s.b.y * k }, layer: s.layer })).filter(s => hyp(s.b.x - s.a.x, s.b.y - s.a.y) > 0.05);
  const wallLayer = all.filter(s => WALL_LAYER.test(s.layer));
  const use = wallLayer.length >= 4 ? wallLayer : all.filter(s => !SKIP_LAYER.test(s.layer));
  const segs = [];
  // pair parallel faces 2"–18" apart that overlap along their length
  const info = use.map(s => { const L = hyp(s.b.x - s.a.x, s.b.y - s.a.y), u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L }; return { s, L, u }; });
  for (let i = 0; i < info.length; i++) {
    const A = info[i];
    for (let j = i + 1; j < info.length; j++) {
      const B = info[j];
      if (Math.abs(A.u.x * B.u.y - A.u.y * B.u.x) > 0.035) continue;      // not parallel (2°)
      const d = Math.abs((B.s.a.x - A.s.a.x) * -A.u.y + (B.s.a.y - A.s.a.y) * A.u.x);
      if (d < 0.15 || d > 1.5) continue;
      const pa = 0, pb = A.L, q1 = (B.s.a.x - A.s.a.x) * A.u.x + (B.s.a.y - A.s.a.y) * A.u.y, q2 = (B.s.b.x - A.s.a.x) * A.u.x + (B.s.b.y - A.s.a.y) * A.u.y;
      const o0 = Math.max(pa, Math.min(q1, q2)), o1 = Math.min(pb, Math.max(q1, q2));
      if (o1 - o0 < Math.max(0.8, d * 1.5)) continue;
      const n = { x: -A.u.y, y: A.u.x }, side = (B.s.a.x - A.s.a.x) * n.x + (B.s.a.y - A.s.a.y) * n.y >= 0 ? 1 : -1;
      const off = side * d / 2;
      segs.push({ a: { x: A.s.a.x + A.u.x * o0 + n.x * off, y: A.s.a.y + A.u.y * o0 + n.y * off }, b: { x: A.s.a.x + A.u.x * o1 + n.x * off, y: A.s.a.y + A.u.y * o1 + n.y * off }, t: d, pair: true });
    }
  }
  // keep a pair only if no third face lies between its two faces (otherwise it spans two walls)
  const thin = use;
  const good = segs.filter(s => {
    const L = hyp(s.b.x - s.a.x, s.b.y - s.a.y), u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
    const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    return !thin.some(f => {
      const fl = hyp(f.b.x - f.a.x, f.b.y - f.a.y); if (fl < 0.3) return false;
      const fu = { x: (f.b.x - f.a.x) / fl, y: (f.b.y - f.a.y) / fl };
      if (Math.abs(u.x * fu.y - u.y * fu.x) > 0.035) return false;
      const d = Math.abs((f.a.x - mid.x) * -u.y + (f.a.y - mid.y) * u.x);
      if (d > s.t / 2 - 0.04) return false;
      const q1 = (f.a.x - mid.x) * u.x + (f.a.y - mid.y) * u.y, q2 = (f.b.x - mid.x) * u.x + (f.b.y - mid.y) * u.y;
      return Math.min(q1, q2) < 0 && Math.max(q1, q2) > 0;
    });
  });
  if (good.length >= 3) return { segs: good, faces: use, mode: 'pairs' };
  return { segs: use.map(s => ({ a: s.a, b: s.b, t: 0.375 })), faces: use, mode: 'single' };
}

// ======================= clean up: one wall per line, openings from gaps, corners joined =======================

/**
 * segs (feet): [{a, b, t}]. opts.gapInk(a, b, t) → 0..1 ink in a gap (window lines), optional.
 * Returns { walls: [{a, b, t}], openings: [{wall (index), c (feet from a), width, type}] }.
 */
export function cleanWalls(segs, opts = {}) {
  const ANG = 0.035;
  const items = segs.map(s => {
    const L = hyp(s.b.x - s.a.x, s.b.y - s.a.y); let u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
    if (u.x < -1e-9 || (Math.abs(u.x) < 1e-9 && u.y < 0)) u = { x: -u.x, y: -u.y };
    const n = { x: -u.y, y: u.x }, off = s.a.x * n.x + s.a.y * n.y;
    const p0 = s.a.x * u.x + s.a.y * u.y, p1 = s.b.x * u.x + s.b.y * u.y;
    return { u, n, off, s0: Math.min(p0, p1), s1: Math.max(p0, p1), t: s.t || 0.375, L };
  }).filter(x => x.L > 0.3);
  // group collinear lines
  const groups = [];
  items.sort((a, b) => b.L - a.L).forEach(it => {
    const g = groups.find(G => Math.abs(G.u.x * it.u.y - G.u.y * it.u.x) < ANG && Math.abs(G.off - it.off) < Math.max(G.t, it.t) * 0.6);
    if (g) { g.parts.push(it); g.t = Math.max(g.t, it.t); } else groups.push({ u: it.u, n: it.n, off: it.off, t: it.t, parts: [it] });
  });
  const walls = [], openings = [];
  const pt = (G, s) => ({ x: G.u.x * s + G.n.x * G.off, y: G.u.y * s + G.n.y * G.off });
  groups.forEach(G => {
    const iv = G.parts.map(p => [p.s0, p.s1, p.t]).sort((a, b) => a[0] - b[0]);
    const runs = [];
    iv.forEach(([a, b, t]) => {
      const last = runs[runs.length - 1];
      if (last && a <= last.e + 0.6) { last.e = Math.max(last.e, b); last.t = Math.max(last.t, t); }
      else runs.push({ s: a, e: b, t, gaps: [] });
    });
    // gaps between runs that look like doors / windows join the runs into one wall
    const merged = [];
    runs.forEach(r => {
      const last = merged[merged.length - 1];
      const gap = last ? r.s - last.e : Infinity;
      if (last && gap >= 1.5 && gap <= (opts.maxOpening || 16)) {
        last.gaps.push([last.e, r.s]); last.e = r.e; last.t = Math.max(last.t, r.t);
      } else merged.push({ ...r, gaps: [] });
    });
    merged.forEach(r => {
      if (r.e - r.s < 1) return;
      const wi = walls.length;
      walls.push({ a: pt(G, r.s), b: pt(G, r.e), t: r.t });
      r.gaps.forEach(([g0, g1]) => {
        const width = g1 - g0, ink = opts.gapInk ? opts.gapInk(pt(G, g0), pt(G, g1), r.t) : 0;
        openings.push({ wall: wi, at: pt(G, (g0 + g1) / 2), width, ink, type: ink > (opts.windowInk ?? 0.1) ? 'window' : 'door' });
      });
    });
  });
  joinCorners(walls);
  // openings: keep them on their (possibly extended) walls
  openings.forEach(o => {
    const w = walls[o.wall], L = hyp(w.b.x - w.a.x, w.b.y - w.a.y);
    o.c = clamp(((o.at.x - w.a.x) * (w.b.x - w.a.x) + (o.at.y - w.a.y) * (w.b.y - w.a.y)) / L, o.width / 2, L - o.width / 2);
    delete o.at;
  });
  // a gap crossed by another wall is a junction, not an opening
  const keep = openings.filter(o => {
    const w = walls[o.wall], L = hyp(w.b.x - w.a.x, w.b.y - w.a.y), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const g0 = { x: w.a.x + u.x * (o.c - o.width / 2 + 0.2), y: w.a.y + u.y * (o.c - o.width / 2 + 0.2) }, g1 = { x: w.a.x + u.x * (o.c + o.width / 2 - 0.2), y: w.a.y + u.y * (o.c + o.width / 2 - 0.2) };
    return !walls.some((v, i) => i !== o.wall && segCross(g0, g1, v.a, v.b));
  });
  return { walls, openings: keep };
}
function segCross(p, q, r, s) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(r, s, p), d2 = d(r, s, q), d3 = d(p, q, r), d4 = d(p, q, s);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && Math.abs(d1) > 1e-9 && Math.abs(d2) > 1e-9;
}
// Move each wall end onto the centerline of the wall it runs into (L and T corners), within a wall thickness.
export function joinCorners(walls) {
  walls.forEach((w, i) => ['a', 'b'].forEach(end => {
    const p = w[end], other = end === 'a' ? w.b : w.a;
    let best = null, bd = Infinity;
    walls.forEach((v, j) => {
      if (j === i) return;
      const L = hyp(v.b.x - v.a.x, v.b.y - v.a.y); if (L < 0.01) return;
      const u = { x: (v.b.x - v.a.x) / L, y: (v.b.y - v.a.y) / L };
      const wu = { x: other.x - p.x, y: other.y - p.y }, wl = hyp(wu.x, wu.y) || 1;
      if (Math.abs((wu.x / wl) * u.y - (wu.y / wl) * u.x) < 0.5) return;          // nearly parallel
      // where this wall's line meets v's line
      const den = (p.x - other.x) * (v.a.y - v.b.y) - (p.y - other.y) * (v.a.x - v.b.x);
      if (Math.abs(den) < 1e-9) return;
      const tt = ((p.x - v.a.x) * (v.a.y - v.b.y) - (p.y - v.a.y) * (v.a.x - v.b.x)) / den;
      const X = { x: p.x + (other.x - p.x) * tt, y: p.y + (other.y - p.y) * tt };
      const move = hyp(X.x - p.x, X.y - p.y), tol = Math.max(w.t, v.t) * 0.75 + 0.35;
      const along = (X.x - v.a.x) * u.x + (X.y - v.a.y) * u.y;
      if (move > tol || along < -tol || along > L + tol) return;
      if (move < bd) { bd = move; best = { X, v, along, L }; }
    });
    if (best) {
      w[end] = best.X;
      // stretch the other wall too when the corner is just past its end
      if (best.along < 0) best.v.a = { ...best.X }; else if (best.along > best.L) best.v.b = { ...best.X };
    }
  }));
  return walls;
}

// ======================= rooms: every closed space =======================

/**
 * walls (feet): closed spaces between them become rooms. Returns { rooms: [{points, area}], outside(x, y) }.
 */
export function findRooms(walls, opts = {}) {
  if (!walls.length) return { rooms: [], outside: () => true };
  const xs = walls.flatMap(w => [w.a.x, w.b.x]), ys = walls.flatMap(w => [w.a.y, w.b.y]);
  const X0 = Math.min(...xs) - 2, Y0 = Math.min(...ys) - 2, X1 = Math.max(...xs) + 2, Y1 = Math.max(...ys) + 2;
  const cell = Math.max(0.25, Math.max(X1 - X0, Y1 - Y0) / 700);
  const W = Math.ceil((X1 - X0) / cell) + 1, H = Math.ceil((Y1 - Y0) / cell) + 1;
  const bar = new Uint8Array(W * H);
  walls.forEach(w => {
    const L = hyp(w.b.x - w.a.x, w.b.y - w.a.y), n = Math.max(1, Math.ceil(L / (cell / 2)));
    for (let i = 0; i <= n; i++) { const x = w.a.x + (w.b.x - w.a.x) * i / n, y = w.a.y + (w.b.y - w.a.y) * i / n; bar[Math.round((y - Y0) / cell) * W + Math.round((x - X0) / cell)] = 1; }
  });
  const lab = new Int32Array(W * H); // -1 outside, >0 room
  const flood = (start, id) => {
    const st = [start]; lab[start] = id; let n = 0; const cells = [];
    while (st.length) {
      const q = st.pop(); n++; cells.push(q); const x = q % W, y = (q / W) | 0;
      if (x > 0 && !bar[q - 1] && !lab[q - 1]) { lab[q - 1] = id; st.push(q - 1); }
      if (x < W - 1 && !bar[q + 1] && !lab[q + 1]) { lab[q + 1] = id; st.push(q + 1); }
      if (y > 0 && !bar[q - W] && !lab[q - W]) { lab[q - W] = id; st.push(q - W); }
      if (y < H - 1 && !bar[q + W] && !lab[q + W]) { lab[q + W] = id; st.push(q + W); }
    }
    return cells;
  };
  flood(0, -1);
  const rooms = []; let id = 0;
  const xsnap = walls.filter(w => Math.abs(w.a.x - w.b.x) < 0.05).map(w => (w.a.x + w.b.x) / 2);
  const ysnap = walls.filter(w => Math.abs(w.a.y - w.b.y) < 0.05).map(w => (w.a.y + w.b.y) / 2);
  const snapTo = (v, list) => { let b = v, bd = cell * 1.6; list.forEach(s => { const d = Math.abs(s - v); if (d < bd) { bd = d; b = s; } }); return Math.round(b * 1000) / 1000; };
  for (let p = 0; p < W * H; p++) {
    if (bar[p] || lab[p]) continue;
    id++; const cells = flood(p, id), area = cells.length * cell * cell;
    if (area < (opts.minArea || 12)) continue;
    let loop = traceCells(lab, W, H, id);
    loop = simplify(loop.map(([gx, gy]) => ({ x: X0 + (gx - 0.5) * cell, y: Y0 + (gy - 0.5) * cell })), cell * 1.3);
    const pts = loop.map(q => ({ x: snapTo(q.x, xsnap), y: snapTo(q.y, ysnap) })).filter((q, i, a) => { const r = a[(i + 1) % a.length]; return hyp(q.x - r.x, q.y - r.y) > 0.05; });
    if (pts.length >= 3) rooms.push({ points: pts, area: Math.abs(shoelace(pts)) });
  }
  const outside = (x, y) => { const gx = Math.round((x - X0) / cell), gy = Math.round((y - Y0) / cell); if (gx < 0 || gy < 0 || gx >= W || gy >= H) return true; return lab[gy * W + gx] === -1; };
  return { rooms, outside, cell };
}
function shoelace(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return a / 2; }
// Outline of one labelled region of grid cells (corner coordinates, the longest loop).
function traceCells(lab, W, H, id) {
  const inR = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === id;
  const next = new Map(); const key = (x, y) => x + ',' + y;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inR(x, y)) continue;
    if (!inR(x, y - 1)) next.set(key(x, y), [x + 1, y]);
    if (!inR(x + 1, y)) next.set(key(x + 1, y), [x + 1, y + 1]);
    if (!inR(x, y + 1)) next.set(key(x + 1, y + 1), [x, y + 1]);
    if (!inR(x - 1, y)) next.set(key(x, y + 1), [x, y]);
  }
  let best = [];
  const seen = new Set();
  for (const k0 of next.keys()) {
    if (seen.has(k0)) continue;
    const loop = []; let k = k0, guard = 0;
    while (!seen.has(k) && guard++ < 1e6) { seen.add(k); const [x, y] = k.split(',').map(Number); loop.push([x, y]); const n = next.get(k); if (!n) break; k = key(n[0], n[1]); }
    if (loop.length > best.length) best = loop;
  }
  return best;
}
// Douglas–Peucker on a closed loop: drops stair-steps and points on straight runs.
function simplify(pts, eps) {
  if (pts.length < 4) return pts;
  let far = 0, fd = -1; pts.forEach((p, i) => { const d = hyp(p.x - pts[0].x, p.y - pts[0].y); if (d > fd) { fd = d; far = i; } });
  const dp = (a) => {
    if (a.length < 3) return a;
    const A = a[0], B = a[a.length - 1], L = hyp(B.x - A.x, B.y - A.y) || 1e-9;
    let idx = -1, md = -1;
    for (let i = 1; i < a.length - 1; i++) { const d = Math.abs((B.x - A.x) * (A.y - a[i].y) - (A.x - a[i].x) * (B.y - A.y)) / L; if (d > md) { md = d; idx = i; } }
    if (md <= eps) return [A, B];
    return dp(a.slice(0, idx + 1)).slice(0, -1).concat(dp(a.slice(idx)));
  };
  const one = dp(pts.slice(0, far + 1)), two = dp(pts.slice(far).concat([pts[0]]));
  return one.slice(0, -1).concat(two.slice(0, -1));
}

// ======================= names =======================
const DIM_RE = /^\s*[\d\s'"\-x×/.,]+$|\d+\s*['′]|\d+\s*["″]|^\d+(\.\d+)?\s*(sf|sq|ft|m2)?$/i;
const ROOM_WORDS = /bed|bath|kitchen|living|dining|family|great|office|closet|clo\b|wic|w\.i\.c|laundry|util|garage|foyer|entry|hall|pantry|mud|den|study|master|primary|suite|porch|patio|deck|lobby|conference|break|storage|stor|mech|elec|restroom|toilet|men|women|reception|open|work|shop|bonus|media|game|gym|nook|loft|room|rm\b|wc\b|powder|vestibule|corridor|kitch/i;
export function isRoomLabel(s) { return !!s && /[a-z]{2,}/i.test(s) && !DIM_RE.test(s) && s.length <= 32; }
const title = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bWic\b/, 'Walk-in Closet').replace(/\bClo\b/, 'Closet');

/** Name rooms from labels inside them (DXF / PDF text), else by size and shape. */
export function nameRooms(rooms, labels = []) {
  const inPoly = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const big = rooms.reduce((m, r) => r.area > (m ? m.area : 0) ? r : m, null);
  let n = 0;
  rooms.forEach(r => {
    const inside = labels.filter(l => isRoomLabel(l.text) && inPoly(l, r.points));
    const pick = inside.find(l => ROOM_WORDS.test(l.text)) || inside[0];
    if (pick) { r.name = title(pick.text.replace(/\s+/g, ' ').trim()); r.named = true; return; }
    const xs = r.points.map(p => p.x), ys = r.points.map(p => p.y), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    if (r.area < 30) r.name = 'Closet';
    else if (Math.min(bw, bh) <= 5.5 && Math.max(bw, bh) / Math.max(0.1, Math.min(bw, bh)) >= 2.4) r.name = 'Hall';
    else if (r === big && rooms.length > 2) r.name = 'Living';
    else r.name = 'Room ' + (++n);
  });
  return rooms;
}

// ======================= put it on a level =======================

/**
 * Adds the imported walls, openings and rooms to a level (feet). M = model.js exports
 * { addWall, addOpening, addRoom, swingDoorsIntoRooms }. products: { door, extDoor, window, garage, cased }.
 */
export function applyImport(level, plan, settings, M, products, opts = {}) {
  const { walls, openings, rooms, outside } = plan;
  const made = walls.map(w => {
    const L = hyp(w.b.x - w.a.x, w.b.y - w.a.y), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }, n = { x: -u.y, y: u.x };
    const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, off = (w.t || 0.4) / 2 + 0.6;
    const o1 = outside ? outside(m.x + n.x * off, m.y + n.y * off) : false, o2 = outside ? outside(m.x - n.x * off, m.y - n.y * off) : false;
    const ext = o1 !== o2;
    const t = Math.round(clamp(w.t || (ext ? settings.extThick : settings.intThick), 0.29, 1.2) * 24) / 24;
    return M.addWall(level, w.a, w.b, { exterior: ext, thickness: t, height: opts.height || 0, phase: opts.phase });
  });
  let doors = 0, windows = 0;
  openings.forEach(o => {
    const w = made[o.wall]; if (!w) return;
    const L = hyp(w.b.x - w.a.x, w.b.y - w.a.y);
    const width = Math.round(o.width * 6) / 6;
    let prod = o.type === 'window' ? products.window : w.exterior ? (width >= 7.5 ? products.garage : products.extDoor) : (width > 4.2 ? products.cased : products.door);
    const op = M.addOpening(level, w, clamp(o.c / L, 0.01, 0.99), prod);
    op.width = width; if (opts.phase) op.phase = opts.phase;
    if (op.type === 'window') windows++; else doors++;
  });
  rooms.forEach(r => { const rm = M.addRoom(level, r.points, { name: r.name, phase: opts.phase }); if (opts.phase) rm.phase = opts.phase; });
  if (M.swingDoorsIntoRooms) M.swingDoorsIntoRooms(level);
  return { walls: made.length, doors, windows, rooms: rooms.length, area: rooms.reduce((a, r) => a + r.area, 0) };
}

/** Everything for a picture: pixels → feet. ftPerPx from the user's overall width. */
export function planFromImage(det, ftPerPx, opts = {}) {
  const k = ftPerPx;
  const segs = det.segs.map(s => ({ a: { x: s.a.x * k, y: s.a.y * k }, b: { x: s.b.x * k, y: s.b.y * k }, t: s.t * k }));
  const gapInk = (a, b, t) => inkFraction(det.ink, det.w, det.h, { x: a.x / k, y: a.y / k }, { x: b.x / k, y: b.y / k }, t / k);
  const cw = cleanWalls(segs, { gapInk, windowInk: opts.windowInk });
  const fr = findRooms(cw.walls);
  nameRooms(fr.rooms, (opts.labels || []).map(l => ({ x: l.x * k, y: l.y * k, text: l.text })));
  return { ...cw, rooms: fr.rooms, outside: fr.outside };
}
/** Everything for a DXF. */
export function planFromDXF(dxf, ftPerUnit) {
  const dw = dxfWalls(dxf, ftPerUnit);
  // window lines in a gap: other faces lying along the gap
  const gapInk = (a, b, t) => {
    const L = hyp(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    let c = 0;
    dxf.segs.forEach(s0 => {
      const s = { a: { x: s0.a.x * ftPerUnit, y: -s0.a.y * ftPerUnit }, b: { x: s0.b.x * ftPerUnit, y: -s0.b.y * ftPerUnit } };
      const m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, sl = hyp(s.b.x - s.a.x, s.b.y - s.a.y); if (sl < L * 0.5) return;
      const along = (m.x - a.x) * u.x + (m.y - a.y) * u.y, across = Math.abs((m.x - a.x) * -u.y + (m.y - a.y) * u.x);
      const par = Math.abs(((s.b.x - s.a.x) / sl) * u.y - ((s.b.y - s.a.y) / sl) * u.x) < 0.05;
      if (par && along > 0 && along < L && across < t / 2 + 0.05) c++;
    });
    return c >= 2 ? 1 : 0;
  };
  const cw = cleanWalls(dw.segs, { gapInk, windowInk: 0.5 });
  const fr = findRooms(cw.walls);
  nameRooms(fr.rooms, dxf.texts.map(t => ({ x: t.x * ftPerUnit, y: -t.y * ftPerUnit, text: t.text })));
  return { ...cw, rooms: fr.rooms, outside: fr.outside, mode: dw.mode };
}
// Move a plan so its top-left corner sits at (0, 0).
export function normalizePlan(plan) {
  const pts = plan.walls.flatMap(w => [w.a, w.b]); if (!pts.length) return plan;
  const x0 = Math.min(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y));
  const sh = p => ({ x: Math.round((p.x - x0) * 1000) / 1000, y: Math.round((p.y - y0) * 1000) / 1000 });
  const outside = plan.outside;
  return { ...plan, walls: plan.walls.map(w => ({ ...w, a: sh(w.a), b: sh(w.b) })), rooms: plan.rooms.map(r => ({ ...r, points: r.points.map(sh) })), outside: outside ? (x, y) => outside(x + x0, y + y0) : null, shift: { x: x0, y: y0 } };
}
