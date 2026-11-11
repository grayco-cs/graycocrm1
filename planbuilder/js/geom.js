// PlanBuilder geometry: pure math, no page or 3D code, so the tests can run it in Node.
// Units: 1 unit = 1 foot. Plan x runs right (east), plan y runs down (south) on the 2D screen.

export const EPS = 1e-6;

export function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
export function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
export function round(v, step) { return Math.round(v / step) * step; }
export function snapPt(p, step) { return step > 0 ? { x: round(p.x, step), y: round(p.y, step) } : { x: p.x, y: p.y }; }

// Signed polygon area (shoelace). Positive or negative depending on winding.
export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
export function polyArea(pts) { return Math.abs(signedArea(pts)); }
export function polyPerimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}
export function centroid(pts) {
  const A = signedArea(pts);
  if (Math.abs(A) < EPS) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f; cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}
export function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Closest point on segment ab to p: { t (0..1), d (distance), p (point) }.
export function projectOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  let t = L2 < EPS ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, d: dist(p, q), p: q };
}

// Snap a direction to the nearest multiple of `deg` degrees, keeping the length.
export function snapAngle(a, b, deg) {
  const L = dist(a, b);
  if (L < EPS || !deg) return { x: b.x, y: b.y };
  const step = deg * Math.PI / 180;
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / step) * step;
  return { x: a.x + Math.cos(ang) * L, y: a.y + Math.sin(ang) * L };
}

// ---- Feet and inches ----

// 12.5 -> 12' 6"   ;  0.25 -> 3"
export function fmtFtIn(ft, inchStep = 0.5) {
  if (!isFinite(ft)) return '';
  const neg = ft < 0; ft = Math.abs(ft);
  let totalIn = round(ft * 12, inchStep);
  let f = Math.floor(totalIn / 12 + EPS);
  let i = totalIn - f * 12;
  if (i >= 12 - EPS) { f += 1; i = 0; }
  const iTxt = Math.abs(i - Math.round(i)) < EPS ? String(Math.round(i)) : i.toFixed(1).replace(/\.0$/, '');
  const s = f === 0 ? `${iTxt}"` : (i < EPS ? `${f}'` : `${f}' ${iTxt}"`);
  return (neg ? '-' : '') + s;
}

// Accepts: 12  12.5  12'  12'6  12' 6"  12-6  12 6  6"  144in  3.5m (metres)
// Returns feet, or NaN when the text is not a length.
export function parseFtIn(text) {
  if (text == null) return NaN;
  let s = String(text).trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  if (!s) return NaN;
  let m;
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*(m|meters?|metres?)$/))) return parseFloat(m[1]) * 3.28084;
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/))) return parseFloat(m[1]) / 12;
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?$/))) return parseFloat(m[1]);
  if ((m = s.match(/^(-?\d+)\s*(?:'|ft)?\s*[-\s]?\s*(\d+(?:\.\d+)?)\s*(?:"|in)?$/))) {
    const f = parseInt(m[1], 10), i = parseFloat(m[2]);
    if (i >= 12) return NaN;
    return f < 0 ? f - i / 12 : f + i / 12;
  }
  return NaN;
}

// ---- Walls and openings ----

export function wallLength(w) { return dist(w.a, w.b); }
export function wallDir(w) {
  const L = wallLength(w) || 1;
  return { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
}
// Unit normal (left side of a->b in plan coordinates).
export function wallNormal(w) { const d = wallDir(w); return { x: d.y, y: -d.x }; }

// An opening sits on a wall at fraction t of the centre line. Its span along the wall in feet.
export function openingSpan(o, w) {
  const L = wallLength(w);
  const c = o.t * L;
  const u0 = Math.max(0, c - o.width / 2), u1 = Math.min(L, c + o.width / 2);
  return { u0, u1, c };
}
// Openings on one wall, sorted, clipped and with overlaps merged out (first wins).
export function wallOpenings(w, openings) {
  const list = openings.filter(o => o.wallId === w.id)
    .map(o => ({ o, ...openingSpan(o, w) }))
    .sort((a, b) => a.u0 - b.u0);
  const out = []; let last = 0;
  for (const s of list) {
    if (s.u1 - s.u0 < 0.05) continue;
    const u0 = Math.max(s.u0, last);
    if (s.u1 - u0 < 0.05) continue;
    out.push({ ...s, u0 });
    last = s.u1;
  }
  return out;
}
// Height actually used by a wall (its own, or the level's).
export function wallHeight(w, level) { return w.height > 0 ? w.height : (level && level.height) || 9; }

// Split a wall's face into rectangles (u0,u1 along the wall; z0,z1 height) around its openings.
// Used by the 3D builder and by the area takeoff, so both always agree.
export function wallPieces(w, openings, H) {
  const L = wallLength(w);
  const ops = wallOpenings(w, openings);
  const pieces = []; let u = 0;
  for (const s of ops) {
    if (s.u0 > u + EPS) pieces.push({ u0: u, u1: s.u0, z0: 0, z1: H });
    const sill = Math.max(0, s.o.sill || 0), top = Math.min(H, sill + s.o.height);
    if (sill > EPS) pieces.push({ u0: s.u0, u1: s.u1, z0: 0, z1: sill });
    if (top < H - EPS) pieces.push({ u0: s.u0, u1: s.u1, z0: top, z1: H });
    u = s.u1;
  }
  if (L > u + EPS) pieces.push({ u0: u, u1: L, z0: 0, z1: H });
  return pieces;
}
export function openingArea(o, H) {
  const sill = Math.max(0, o.sill || 0);
  return o.width * Math.max(0, Math.min(H, sill + o.height) - sill);
}

// ---- Roofs ----
// A roof section is a rectangle in plan (x,y,w,d = the wall lines it covers) plus
// style, pitch (rise per 12 run), overhang and ridge direction.
// ridge 'x' = ridge runs along x (slopes face north/south); 'y' = along y; 'auto' = along the longer side.

export function pitchFactor(pitch) { return Math.sqrt(1 + (pitch / 12) ** 2); }

export function ridgeAxis(sec) {
  if (sec.ridge === 'x' || sec.ridge === 'y') return sec.ridge;
  return sec.w >= sec.d ? 'x' : 'y';
}

// Measurements of one roof section, the way a roofer orders: squares, ridge, hips, valleys, eaves, rakes.
export function roofMeasure(sec) {
  const p = Math.max(0, +sec.pitch || 0), o = Math.max(0, +sec.overhang || 0);
  const k = pitchFactor(p), slope = p / 12;
  const axis = ridgeAxis(sec);
  // L = length along the ridge, S = span across it (both including overhang).
  const L = (axis === 'x' ? sec.w : sec.d) + 2 * o;
  const S = (axis === 'x' ? sec.d : sec.w) + 2 * o;
  const planArea = L * S;
  const r = { style: sec.style, pitch: p, factor: k, planArea, area: 0, ridge: 0, hips: 0, valleys: 0, eaves: 0, rakes: 0, rise: 0, faces: 0 };
  switch (sec.style) {
    case 'gable': {
      const run = S / 2, rafter = run * k;
      r.area = 2 * L * rafter; r.ridge = L; r.eaves = 2 * L; r.rakes = 4 * rafter;
      r.rise = ((axis === 'x' ? sec.d : sec.w) / 2) * slope; r.faces = 2;
      break;
    }
    case 'hip': {
      const run = S / 2;
      r.area = planArea * k;               // every face has the same pitch
      r.ridge = Math.max(0, L - S);
      r.hips = 4 * run * Math.sqrt(2 + slope * slope);
      r.eaves = 2 * (L + S);
      r.rise = ((axis === 'x' ? sec.d : sec.w) / 2) * slope; r.faces = 4;
      break;
    }
    case 'shed': {
      const rafter = S * k;
      r.area = L * rafter; r.eaves = L; r.ridge = L; /* high side gets ridge/flashing */
      r.rakes = 2 * rafter; r.rise = (axis === 'x' ? sec.d : sec.w) * slope; r.faces = 1;
      break;
    }
    case 'flat':
    default: {
      r.pitch = 0; r.factor = 1; r.area = planArea; r.eaves = 2 * (L + S); r.faces = 1;
      break;
    }
  }
  r.squares = r.area / 100;
  return r;
}

// Triangles for a roof section in 3D, in plan coordinates with z up.
// base = height of the top of the walls (plate). Returns { faces:[[p,p,p],...], gables:[[p,p,p]] }.
export function roofTriangles(sec, base) {
  const p = Math.max(0, +sec.pitch || 0), o = Math.max(0, +sec.overhang || 0), slope = p / 12;
  const axis = ridgeAxis(sec);
  // Work in a local frame: u along the ridge, v across it.
  const u0 = (axis === 'x' ? sec.x : sec.y) - o, u1 = (axis === 'x' ? sec.x + sec.w : sec.y + sec.d) + o;
  const v0w = axis === 'x' ? sec.y : sec.x, v1w = axis === 'x' ? sec.y + sec.d : sec.x + sec.w;   // wall lines
  const v0 = v0w - o, v1 = v1w + o;
  const zEave = base - o * slope;
  const P = (u, v, z) => axis === 'x' ? { x: u, y: v, z } : { x: v, y: u, z };
  const faces = [], gables = [];
  if (sec.style === 'gable') {
    const vm = (v0 + v1) / 2, zr = base + ((v1w - v0w) / 2) * slope;
    faces.push([P(u0, v0, zEave), P(u1, v0, zEave), P(u1, vm, zr)], [P(u0, v0, zEave), P(u1, vm, zr), P(u0, vm, zr)]);
    faces.push([P(u1, v1, zEave), P(u0, v1, zEave), P(u0, vm, zr)], [P(u1, v1, zEave), P(u0, vm, zr), P(u1, vm, zr)]);
    // Gable-end wall infill at the wall lines (triangle above the plate).
    const uw0 = u0 + o, uw1 = u1 - o;
    gables.push([P(uw0, v0w, base), P(uw0, v1w, base), P(uw0, (v0w + v1w) / 2, zr)]);
    gables.push([P(uw1, v1w, base), P(uw1, v0w, base), P(uw1, (v0w + v1w) / 2, zr)]);
  } else if (sec.style === 'hip') {
    const S = v1 - v0, L = u1 - u0, run = S / 2, zr = zEave + run * slope;
    const vm = (v0 + v1) / 2;
    let ra = u0 + run, rb = u1 - run;
    if (rb < ra) { ra = rb = (u0 + u1) / 2; }
    const zTop = L < S ? zEave + (L / 2) * slope : zr;
    const A = P(u0, v0, zEave), B = P(u1, v0, zEave), C = P(u1, v1, zEave), D = P(u0, v1, zEave);
    const R1 = P(ra, vm, zTop), R2 = P(rb, vm, zTop);
    faces.push([A, B, R2], [A, R2, R1]);   // long side
    faces.push([C, D, R1], [C, R1, R2]);   // other long side
    faces.push([B, C, R2]);                // hip end
    faces.push([D, A, R1]);                // hip end
  } else if (sec.style === 'shed') {
    const zHigh = base + (v1w - v0w) * slope + o * slope;
    faces.push([P(u0, v0, zEave), P(u1, v0, zEave), P(u1, v1, zHigh)], [P(u0, v0, zEave), P(u1, v1, zHigh), P(u0, v1, zHigh)]);
    const zw = base + (v1w - v0w) * slope;
    gables.push([P(u0 + o, v0w, base), P(u0 + o, v1w, base), P(u0 + o, v1w, zw)]);
    gables.push([P(u1 - o, v1w, base), P(u1 - o, v0w, base), P(u1 - o, v1w, zw)]);
    // the tall side: wall from the plate up to the high edge of the roof
    gables.push([P(u0 + o, v1w, base), P(u1 - o, v1w, base), P(u1 - o, v1w, zw)], [P(u0 + o, v1w, base), P(u1 - o, v1w, zw), P(u0 + o, v1w, zw)]);
  } else {
    const z = base + 0.01;
    faces.push([P(u0, v0, z), P(u1, v0, z), P(u1, v1, z)], [P(u0, v0, z), P(u1, v1, z), P(u0, v1, z)]);
  }
  return { faces, gables };
}

// Rectangle (in plan) around a level's exterior walls, or all walls if none are marked exterior.
export function footprintRect(level) {
  const walls = (level.walls || []);
  const ext = walls.filter(w => w.exterior);
  const use = ext.length ? ext : walls;
  if (!use.length) return null;
  const pts = []; use.forEach(w => { pts.push(w.a, w.b); });
  return bbox(pts);
}
