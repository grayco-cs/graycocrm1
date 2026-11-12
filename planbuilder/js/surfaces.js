// Surfaces for the 3D view: wood planks, tile, carpet, concrete, brick, stone, lap siding, board & batten,
// shingles, metal panels, clay tile, slate, grass, mulch, rock, pavers, decking, stucco and paint.
// Each is drawn once on a canvas in the product's own color (so every color in the catalog gets a real-looking
// surface without a picture) and repeats across the model at true scale. A picture uploaded in the catalog wins.

const cache = new Map();

export function shade(hex, k) {
  const n = parseInt(String(hex || '#999999').replace('#', ''), 16); if (!isFinite(n)) return hex;
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function rng(seed) { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) ^ Math.imul(h ^ (h >>> 13), 3266489917)) >>> 0) / 4294967296; }

// What kind of surface a product is, from its category, material and name.
export function surfaceKind(p) {
  if (!p) return 'plain';
  const n = `${p.name} ${p.material || ''} ${p.finish || ''}`.toLowerCase(), c = p.category;
  if (c === 'roofing') {
    if (/standing seam|metal|r-panel|5v/.test(n)) return 'roofmetal';
    if (/clay|spanish|concrete tile/.test(n)) return 'rooftile';
    if (/slate/.test(n)) return 'slate';
    if (/shake/.test(n)) return 'shake';
    if (/tpo|epdm|modified|bitumen|coating/.test(n)) return 'membrane';
    return 'shingle';
  }
  if (c === 'masonry') return /stone|rock|ledge|field|limestone|castle|rubble/.test(n) ? 'stone' : /block|cmu|split/.test(n) ? 'block' : 'brick';
  if (c === 'siding') {
    if (/board & batten|board and batten|batten/.test(n)) return 'batten';
    if (/shingle|shake/.test(n)) return 'shake';
    if (/stucco|eifs/.test(n)) return 'stucco';
    if (/metal|panel/.test(n)) return 'metalwall';
    return 'lap';
  }
  if (c === 'landscape') return /sod|grass|turf|seed/.test(n) ? 'grass' : /mulch|straw|soil|fabric/.test(n) ? 'mulch' : 'rock';
  if (c === 'hardscape') return /paver|brick/.test(n) ? 'pavers' : /flagstone|travertine/.test(n) ? 'flagstone' : /asphalt/.test(n) ? 'asphalt' : /gravel/.test(n) ? 'rock' : 'concrete';
  if (c === 'outdoor' && p.kind === 'floor') return 'deck';
  if (c === 'flooring' || c === 'commercial' && p.kind === 'floor') {
    if (/carpet|berber|frieze|plush/.test(n)) return 'carpet';
    if (/tile|marble|travertine|slate|ceramic|porcelain|saltillo|mosaic|vct/.test(n)) return /hex/.test(n) ? 'hex' : 'tile';
    if (/concrete|epoxy|rubber/.test(n)) return 'concrete';
    return 'wood';
  }
  if (c === 'countertop') return /granite|marble|quartz|quartzite/.test(n) ? 'stoneSlab' : /butcher/.test(n) ? 'wood' : 'plain';
  if (c === 'paint' && /shiplap|beadboard/.test(n)) return 'lap';
  if (c === 'paint') return 'paint';   // eggshell: a soft, slightly uneven painted wall (not flat CG)
  return 'plain';
}

// Real-world size (feet) of one tile of the texture, and how shiny the surface is.
const SPEC = {
  wood: [4, 0.5], tile: [4, 0.28], hex: [2, 0.25], carpet: [2, 1], concrete: [8, 0.45], brick: [4, 0.95], block: [8, 0.9], stone: [6, 0.95],
  lap: [4, 0.75], batten: [4, 0.75], shake: [4, 0.9], stucco: [6, 0.95], metalwall: [4, 0.4], shingle: [4, 0.95], roofmetal: [4, 0.35],
  rooftile: [4, 0.6], slate: [4, 0.7], membrane: [8, 0.8], grass: [6, 1], mulch: [4, 1], rock: [3, 0.9], pavers: [4, 0.85], flagstone: [6, 0.8],
  asphalt: [8, 0.95], deck: [4, 0.6], stoneSlab: [6, 0.18], paint: [6, 0.9], plain: [8, 0.85],
};
// How deep each surface's texture reads in the light (bump), 0 = flat.
const BUMP = { wood: 1.2, deck: 2, tile: 1.6, hex: 1.6, carpet: 1.4, brick: 2.4, block: 2.2, stone: 2.6, flagstone: 2, lap: 1.8, batten: 1.8, shake: 2, stucco: 1.6,
  shingle: 1.8, slate: 1.6, rooftile: 2.2, pavers: 2, paint: 0.15, concrete: 0.6, mulch: 1.5, rock: 2, grass: 1 };
export function surfaceBump(kind) { return BUMP[kind] || 0; }
export function surfaceSpec(kind) { const s = SPEC[kind] || SPEC.plain; return { span: s[0], roughness: s[1], metal: kind === 'roofmetal' || kind === 'metalwall' ? 0.55 : 0 }; }

function speckle(x, w, h, base, amount, count, r) {
  for (let i = 0; i < count; i++) { x.fillStyle = shade(base, 1 + (r() - 0.5) * amount); x.globalAlpha = 0.5; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  x.globalAlpha = 1;
}

// Draw a surface. Returns a canvas (512 px square = SPEC span feet).
export function surfaceCanvas(kind, color, seed = '') {
  const key = kind + '|' + color + '|' + seed;
  if (cache.has(key)) return cache.get(key);
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), r = rng(key), px = S / surfaceSpec(kind).span;   // pixels per foot
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  const lines = (col, a, w) => { x.strokeStyle = col; x.globalAlpha = a; x.lineWidth = w; };
  switch (kind) {
    case 'wood': case 'deck': {
      const bw = (kind === 'deck' ? 0.46 : 0.5) * px, rows = Math.round(S / bw);
      for (let i = 0; i < rows; i++) {
        let xx = -r() * 3 * px;
        while (xx < S) {
          const len = (2 + r() * 4) * px;
          x.globalAlpha = 1; x.fillStyle = shade(color, 0.86 + r() * 0.26); x.fillRect(xx, i * bw, len, bw);
          lines(shade(color, 0.7), 0.35, 1);   // grain
          for (let g = 0; g < 5; g++) { const yy = i * bw + r() * bw; x.beginPath(); x.moveTo(xx, yy); for (let s = 0; s <= 8; s++) x.lineTo(xx + (len * s) / 8, yy + Math.sin(s * 1.3 + r() * 6) * 1.6); x.stroke(); }
          lines(shade(color, 0.45), 0.8, kind === 'deck' ? 3 : 1.4); x.beginPath(); x.moveTo(xx, i * bw); x.lineTo(xx, (i + 1) * bw); x.stroke();
          xx += len;
        }
        lines(shade(color, 0.45), 0.85, kind === 'deck' ? 4 : 1.5); x.beginPath(); x.moveTo(0, i * bw); x.lineTo(S, i * bw); x.stroke();
      }
      break;
    }
    case 'tile': case 'pavers': {
      const tw = (kind === 'pavers' ? 0.75 : 1) * px, th = (kind === 'pavers' ? 0.5 : 1) * px, grout = kind === 'pavers' ? 3 : 2;
      for (let row = 0; row * th < S; row++) for (let col = -1; col * tw < S; col++) {
        const off = kind === 'pavers' && row % 2 ? tw / 2 : 0;
        x.globalAlpha = 1; x.fillStyle = shade(color, 0.92 + r() * 0.16); x.fillRect(col * tw + off + grout / 2, row * th + grout / 2, tw - grout, th - grout);
      }
      speckle(x, S, S, color, 0.3, 1500, r);
      break;
    }
    case 'hex': {
      const R = 0.12 * px, hgt = Math.sqrt(3) * R;
      x.fillStyle = shade(color, 0.7); x.fillRect(0, 0, S, S);
      for (let row = -1; row * hgt < S + hgt; row++) for (let col = -1; col * 1.5 * R < S + R; col++) {
        const cx = col * 1.5 * R, cy = row * hgt + (col % 2 ? hgt / 2 : 0);
        x.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; x.lineTo(cx + Math.cos(a) * (R - 1.2), cy + Math.sin(a) * (R - 1.2)); } x.closePath();
        x.fillStyle = shade(color, 0.95 + r() * 0.1); x.fill();
      }
      break;
    }
    case 'carpet': case 'stucco': case 'membrane': case 'asphalt': speckle(x, S, S, color, kind === 'asphalt' ? 0.6 : 0.35, kind === 'carpet' ? 26000 : 14000, r); break;
    case 'concrete': case 'stoneSlab': {
      for (let i = 0; i < (kind === 'stoneSlab' ? 60 : 40); i++) { const g = x.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 30 + r() * 120); g.addColorStop(0, shade(color, 0.86 + r() * 0.28)); g.addColorStop(1, 'rgba(0,0,0,0)'); x.globalAlpha = 0.5; x.fillStyle = g; x.fillRect(0, 0, S, S); }
      x.globalAlpha = 1; speckle(x, S, S, color, 0.5, 4000, r);
      if (kind === 'stoneSlab') { lines(shade(color, 0.6), 0.25, 1.2); for (let v = 0; v < 6; v++) { x.beginPath(); let px0 = r() * S, py0 = r() * S; x.moveTo(px0, py0); for (let s = 0; s < 10; s++) { px0 += (r() - 0.3) * 60; py0 += (r() - 0.5) * 50; x.lineTo(px0, py0); } x.stroke(); } }
      break;
    }
    case 'brick': case 'block': {
      const bw = (kind === 'block' ? 1.333 : 0.667) * px, bh = (kind === 'block' ? 0.667 : 0.222) * px, m = kind === 'block' ? 3 : 2.5;
      x.fillStyle = shade(color, kind === 'block' ? 0.8 : 1.45); x.fillRect(0, 0, S, S);   // mortar
      for (let row = 0; row * bh < S; row++) for (let col = -1; col * bw < S; col++) {
        const off = row % 2 ? bw / 2 : 0;
        x.fillStyle = shade(color, 0.8 + r() * 0.35); x.fillRect(col * bw + off + m / 2, row * bh + m / 2, bw - m, bh - m);
      }
      speckle(x, S, S, color, 0.6, 5000, r);
      break;
    }
    case 'stone': case 'flagstone': {
      x.fillStyle = shade(color, kind === 'flagstone' ? 0.7 : 0.6); x.fillRect(0, 0, S, S);
      let yy = 0;
      while (yy < S) { const h = (0.25 + r() * 0.45) * px; let xx = -r() * px; while (xx < S) { const w = (0.5 + r() * 1.3) * px; x.fillStyle = shade(color, 0.75 + r() * 0.5); x.beginPath(); x.roundRect ? x.roundRect(xx + 2, yy + 2, w - 4, h - 4, 6) : x.rect(xx + 2, yy + 2, w - 4, h - 4); x.fill(); xx += w; } yy += h; }
      speckle(x, S, S, color, 0.5, 4000, r);
      break;
    }
    case 'lap': case 'batten': case 'metalwall': case 'roofmetal': {
      const vertical = kind !== 'lap', gap = (kind === 'lap' ? 0.583 : kind === 'batten' ? 1.333 : kind === 'metalwall' ? 1 : 1.333) * px;
      for (let k = 0; k * gap < S; k++) {
        const g = vertical ? x.createLinearGradient(k * gap, 0, (k + 1) * gap, 0) : x.createLinearGradient(0, k * gap, 0, (k + 1) * gap);
        g.addColorStop(0, shade(color, kind === 'lap' ? 0.78 : 1.12)); g.addColorStop(0.15, shade(color, 1.02)); g.addColorStop(1, shade(color, 0.96));
        x.fillStyle = g; vertical ? x.fillRect(k * gap, 0, gap, S) : x.fillRect(0, k * gap, S, gap);
        if (vertical) { x.fillStyle = shade(color, kind === 'batten' ? 1.1 : 0.75); x.fillRect(k * gap, 0, kind === 'batten' ? 0.2 * px : 3, S); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(k * gap + (kind === 'batten' ? 0.2 * px : 3), 0, 2, S); }
      }
      if (kind === 'lap' || kind === 'batten') speckle(x, S, S, color, 0.15, 3000, r);
      break;
    }
    case 'shingle': case 'shake': case 'slate': case 'rooftile': {
      const rowH = (kind === 'shingle' ? 0.47 : kind === 'rooftile' ? 0.9 : 0.6) * px;
      for (let row = 0; row * rowH < S; row++) {
        let xx = -(row % 2) * rowH * 0.6;
        while (xx < S) {
          const w = (kind === 'shingle' ? 0.6 + r() * 0.9 : kind === 'rooftile' ? 0.75 : 0.45 + r() * 0.5) * px;
          if (kind === 'rooftile') { const g = x.createLinearGradient(xx, 0, xx + w, 0); g.addColorStop(0, shade(color, 0.7)); g.addColorStop(0.5, shade(color, 1.18)); g.addColorStop(1, shade(color, 0.7)); x.fillStyle = g; }
          else x.fillStyle = shade(color, 0.78 + r() * 0.4);
          x.fillRect(xx + 1, row * rowH, w - 2, rowH - 1);
          x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(xx, row * rowH + rowH - 3, w, 3);   // shadow line under each course
          xx += w;
        }
      }
      speckle(x, S, S, color, kind === 'shingle' ? 0.9 : 0.4, kind === 'shingle' ? 22000 : 6000, r);
      break;
    }
    case 'grass': {
      for (let i = 0; i < 26000; i++) { x.strokeStyle = shade(color, 0.7 + r() * 0.6); x.globalAlpha = 0.6; x.lineWidth = 1; const xx = r() * S, yy = r() * S; x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + (r() - 0.5) * 3, yy - 3 - r() * 4); x.stroke(); }
      x.globalAlpha = 1; break;
    }
    case 'mulch': case 'rock': {
      for (let i = 0; i < (kind === 'rock' ? 2600 : 9000); i++) {
        x.fillStyle = shade(color, 0.6 + r() * 0.8); x.globalAlpha = 0.9; x.beginPath();
        if (kind === 'rock') x.ellipse(r() * S, r() * S, 2 + r() * 6, 2 + r() * 5, r() * 3, 0, 7); else x.ellipse(r() * S, r() * S, 1 + r() * 5, 0.6 + r() * 1.6, r() * 3, 0, 7);
        x.fill();
      }
      x.globalAlpha = 1; break;
    }
    case 'paint': {   // eggshell: a barely-there stipple, the color stays true
      for (let i = 0; i < 16000; i++) { x.fillStyle = shade(color, 0.985 + r() * 0.03); x.globalAlpha = 0.6; x.fillRect(r() * S, r() * S, 1 + r(), 1 + r()); }
      x.globalAlpha = 1;
      break;
    }
    default: speckle(x, S, S, color, 0.06, 4000, r);
  }
  x.globalAlpha = 1;
  cache.set(key, c);
  return c;
}
