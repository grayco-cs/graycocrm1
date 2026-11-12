// Furniture, fixtures, appliances and decor drawn as real shapes (not boxes), with real-looking materials:
// fabric with a soft sheen and weave, wood with grain, brushed and polished metal, glazed ceramic, glass.
// view3d.buildItem calls build(kind, ctx); anything not drawn here falls back to the simple shapes in view3d.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { shade } from './surfaces.js';

const RB = (w, h, d, r = 0.06) => {
  const m = Math.min(w, h, d) / 2 - 0.002, rr = Math.max(0.001, Math.min(r, m));
  return rr < 0.012 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 4, rr);
};
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const cyl = (r1, r2, h, s = 24) => new THREE.CylinderGeometry(r1, r2, h, s);

export { refine, showGroup, SHOW_GROUPS } from './furnkinds.js';

// ---------- materials ----------
function canvas(S, draw) { const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S); return c; }
function rnd(seed) { let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) ^ Math.imul(h ^ (h >>> 13), 3266489917)) >>> 0) / 4294967296; }

export function makeKit(v) {
  const cache = new Map(), aniso = v.renderer.capabilities.getMaxAnisotropy();
  const tex = (key, c, rep = 1) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = aniso; if (key.startsWith('col')) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const once = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };
  // a fine woven texture (used as bump on fabric)
  const weave = once('bump|weave', () => tex('bump', canvas(128, (x, S) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, S, S); const r = rnd('weave');
    for (let i = 0; i < S; i += 2) { x.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.08})`; x.fillRect(i, 0, 1, S); x.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.08})`; x.fillRect(0, i, S, 1); }
  }), 6));
  // long continuous wood grain (no plank seams)
  const grain = color => once('col|grain|' + color, () => tex('col', canvas(256, (x, S) => {
    x.fillStyle = color; x.fillRect(0, 0, S, S); const r = rnd(color);
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = shade(color, 0.72 + r() * 0.5); x.globalAlpha = 0.18 + r() * 0.25; x.lineWidth = 0.6 + r() * 1.8;
      const y0 = r() * S; x.beginPath(); x.moveTo(0, y0); for (let s = 0; s <= 16; s++) x.lineTo((S * s) / 16, y0 + Math.sin(s * 0.7 + i) * (2 + r() * 4)); x.stroke();
    }
    x.globalAlpha = 1;
  })));
  const K = {
    fabric: (color, rough = 0.95) => once('fab|' + color + rough, () => new THREE.MeshPhysicalMaterial({ color, roughness: rough, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(shade(color, 1.35)), bumpMap: weave, bumpScale: 0.6 })),
    linen: () => K.fabric('#f3f0ea', 1),
    leather: color => once('lea|' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(shade(color, 1.4)) })),
    wood: color => once('wood|' + color, () => new THREE.MeshStandardMaterial({ color: '#ffffff', map: grain(color), roughness: 0.55 })),
    lacquer: color => once('lac|' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 })),
    steel: () => once('steel', () => new THREE.MeshStandardMaterial({ color: '#c9cdd1', metalness: 0.9, roughness: 0.32 })),
    chrome: () => once('chrome', () => new THREE.MeshStandardMaterial({ color: '#e8ebee', metalness: 1, roughness: 0.08 })),
    brass: () => once('brass', () => new THREE.MeshStandardMaterial({ color: '#c39a5a', metalness: 0.95, roughness: 0.3 })),
    black: () => once('blk', () => new THREE.MeshStandardMaterial({ color: '#1d1d1f', metalness: 0.6, roughness: 0.42 })),
    blackGlass: () => once('bglass', () => new THREE.MeshPhysicalMaterial({ color: '#0c0d10', roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })),
    ceramic: (color = '#fbfbf9') => once('cer|' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })),
    glass: () => once('glass', () => new THREE.MeshPhysicalMaterial({ color: '#dff1ff', roughness: 0.03, transmission: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })),
    mirror: () => once('mir', () => new THREE.MeshStandardMaterial({ color: '#dfe8ee', metalness: 1, roughness: 0.03 })),
    glow: (c = '#ffe2b0', k = 1.6) => once('glow|' + c + k, () => new THREE.MeshStandardMaterial({ color: '#fff7ea', emissive: c, emissiveIntensity: k, roughness: 0.6 })),
    shadeMat: color => once('shade|' + color, () => new THREE.MeshStandardMaterial({ color, emissive: '#ffd59a', emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.94 })),
    paint: color => once('pnt|' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6 })),
    leaf: color => once('leaf|' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide })),
    soil: () => once('soil', () => new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 1 })),
    marble: () => v.counterMat(),
    rugTex: (color, seed) => once('rug|' + color + seed, () => {
      const t = tex('col', canvas(512, (x, S) => {
        const r = rnd(seed); x.fillStyle = color; x.fillRect(0, 0, S, S);
        x.strokeStyle = shade(color, 0.7); x.lineWidth = S * 0.035; x.strokeRect(S * 0.05, S * 0.05, S * 0.9, S * 0.9);
        x.strokeStyle = shade(color, 1.25); x.lineWidth = S * 0.012; x.strokeRect(S * 0.1, S * 0.1, S * 0.8, S * 0.8);
        for (let i = 0; i < 14; i++) { x.fillStyle = shade(color, 0.8 + r() * 0.45); x.globalAlpha = 0.35; const cx = S * (0.2 + r() * 0.6), cy = S * (0.2 + r() * 0.6), s = S * (0.04 + r() * 0.08); x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillRect(-s, -s, 2 * s, 2 * s); x.restore(); }
        x.globalAlpha = 1; for (let i = 0; i < 9000; i++) { x.fillStyle = shade(color, 0.85 + r() * 0.3); x.globalAlpha = 0.25; x.fillRect(r() * S, r() * S, 1.4, 1.4); }
        x.globalAlpha = 1;
      }));
      return new THREE.MeshStandardMaterial({ color: '#ffffff', map: t, roughness: 1, bumpMap: weave, bumpScale: 0.8 });
    }),
  };
  return K;
}

// ---------- the models ----------
// ctx: { W, D, H, add(geo, mat, x, y, z) → mesh, K (materials), color, p, it, level, main (product material), art (canvas texture) }
export function build(kind, c) {
  const f = MODELS[kind]; if (!f) return false;
  f(c); return true;
}
const legs4 = (c, w, d, h, r, mat, inset = 0.25, taper = 0.7) => [-1, 1].forEach(sx => [-1, 1].forEach(sz => c.add(cyl(r * taper, r, h, 12), mat, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset))));
const pull = (c, x, y, z, len = 0.5, vertical = false) => { const m = c.add(cyl(0.025, 0.025, len, 10), c.K.brass(), x, y, z); if (!vertical) m.rotation.z = Math.PI / 2; return m; };
const pillow = (c, w, h, d, mat, x, y, z, rz = 0, rx = -0.25) => { const m = c.add(RB(w, h, d, Math.min(h, d) * 0.45), mat, x, y, z); m.rotation.set(rx, 0, rz); m.scale.set(1, 1, 0.9); return m; };

const MODELS = {
  sofa(c) {
    const { W, D, H, K } = c, fab = K.fabric(c.color), legH = 0.35, seatH = 1.45;
    c.add(RB(W, 0.55, D - 0.1, 0.12), fab, 0, legH + 0.275, 0.05);                                   // plinth
    c.add(RB(W - 0.1, H - legH - 0.25, 0.75, 0.3), fab, 0, legH + (H - legH) / 2, -D / 2 + 0.375);     // back frame
    [-1, 1].forEach(sx => c.add(RB(0.6, 1.75, D - 0.05, 0.28), fab, sx * (W / 2 - 0.3), legH + 0.875, 0.02));   // rolled arms
    const n = Math.max(2, Math.round((W - 1.2) / 2.4)), cw = (W - 1.2) / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.6 + cw * (i + 0.5);
      c.add(RB(cw - 0.05, 0.45, D - 1.05, 0.2), K.fabric(shade(c.color, 1.06)), x, seatH - 0.2, 0.25);              // seat cushion
      const b = c.add(RB(cw - 0.08, 1.35, 0.5, 0.24), K.fabric(shade(c.color, 1.06)), x, seatH + 0.62, -D / 2 + 0.95); b.rotation.x = -0.12;  // back cushion
    }
    const acc = K.fabric(shade(c.color, 0.68));
    pillow(c, 1.3, 1.2, 0.38, acc, -W / 2 + 1.25, seatH + 0.55, -D / 2 + 1.35, 0.12);
    pillow(c, 1.3, 1.2, 0.38, acc, W / 2 - 1.25, seatH + 0.55, -D / 2 + 1.35, -0.12);
    legs4(c, W, D, legH, 0.06, K.black(), 0.35, 0.6);
  },
  armchair(c) {
    const { W, D, H, K } = c, fab = K.fabric(c.color), legH = 0.4;
    c.add(RB(W, 0.6, D - 0.1, 0.15), fab, 0, legH + 0.3, 0.05);
    const back = c.add(RB(W - 0.15, H - legH - 0.3, 0.55, 0.26), fab, 0, legH + (H - legH) / 2 + 0.1, -D / 2 + 0.3); back.rotation.x = -0.08;
    [-1, 1].forEach(sx => c.add(RB(0.42, 1.25, D - 0.25, 0.2), fab, sx * (W / 2 - 0.21), legH + 0.75, 0.05));
    c.add(RB(W - 0.9, 0.42, D - 0.85, 0.18), K.fabric(shade(c.color, 1.06)), 0, legH + 0.78, 0.25);
    pillow(c, 1.1, 1, 0.34, K.fabric(shade(c.color, 0.7)), 0, legH + 1.35, -D / 2 + 0.7, 0.08);
    legs4(c, W, D, legH, 0.06, K.wood('#5b4331'), 0.25, 0.55);
  },
  diningchair(c) {
    const { W, D, H, K } = c, wood = K.wood(c.color), seatY = H * 0.47;
    c.add(RB(W * 0.95, 0.22, D * 0.88, 0.08), K.fabric('#cfc6b8'), 0, seatY, D * 0.04);
    c.add(RB(W * 0.95, 0.12, D * 0.88, 0.04), wood, 0, seatY - 0.15, D * 0.04);
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => { const l = c.add(cyl(0.05, 0.075, seatY - 0.2, 10), wood, sx * W * 0.4, (seatY - 0.2) / 2, sz * D * 0.38); l.rotation.z = sx * 0.04; }));
    [-1, 1].forEach(sx => c.add(cyl(0.05, 0.06, H - seatY, 10), wood, sx * W * 0.4, seatY + (H - seatY) / 2, -D * 0.4));
    const top = c.add(RB(W * 0.92, 0.42, 0.12, 0.05), wood, 0, H - 0.3, -D * 0.4); top.rotation.x = -0.1;
    for (let i = -1; i <= 1; i++) c.add(RB(0.08, H - seatY - 0.6, 0.06, 0.02), wood, i * W * 0.2, seatY + (H - seatY - 0.6) / 2 + 0.1, -D * 0.4);
  },
  officechair(c) {
    const { W, H, K } = c, blk = K.black();
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5, arm = c.add(RB(W * 0.46, 0.08, 0.14, 0.04), blk, Math.cos(a) * W * 0.22, 0.2, Math.sin(a) * W * 0.22); arm.rotation.y = -a; c.add(new THREE.SphereGeometry(0.1, 10, 8), blk, Math.cos(a) * W * 0.44, 0.1, Math.sin(a) * W * 0.44); }
    c.add(cyl(0.07, 0.09, 1.2, 12), K.chrome(), 0, 0.85, 0);
    c.add(RB(W * 0.75, 0.3, W * 0.72, 0.13), K.fabric('#2b2d31'), 0, 1.55, 0.05);
    const back = c.add(RB(W * 0.7, H - 1.9, 0.18, 0.08), K.fabric('#26282c', 0.8), 0, 1.75 + (H - 1.9) / 2, -W * 0.32); back.rotation.x = -0.12;
    [-1, 1].forEach(sx => c.add(RB(0.12, 0.08, W * 0.45, 0.04), blk, sx * W * 0.4, 2.3, 0));
  },
  stool(c) {
    const { W, H, K } = c;
    c.add(lathe([[0, 0], [W * 0.4, 0], [W * 0.42, 0.06], [W * 0.36, 0.14], [0, 0.14]]), K.leather(c.color === '#2f2f2f' ? '#3b3330' : c.color), 0, H - 0.14, 0);
    c.add(cyl(0.06, 0.06, H - 0.14, 12), K.black(), 0, (H - 0.14) / 2, 0);
    c.add(new THREE.TorusGeometry(W * 0.3, 0.03, 8, 32), K.black(), 0, H * 0.35, 0).rotation.x = Math.PI / 2;
    c.add(cyl(W * 0.3, W * 0.33, 0.05, 28), K.black(), 0, 0.025, 0);
  },
  table(c) {
    const { W, D, H, K } = c, wood = K.wood(c.color);
    c.add(RB(W, 0.13, D, 0.05), wood, 0, H - 0.065, 0);
    [-1, 1].forEach(sx => c.add(RB(0.06, 0.3, D - 0.8, 0.02), wood, sx * (W / 2 - 0.4), H - 0.28, 0));
    [-1, 1].forEach(sz => c.add(RB(W - 0.8, 0.3, 0.06, 0.02), wood, 0, H - 0.28, sz * (D / 2 - 0.4)));
    legs4(c, W, D, H - 0.13, 0.1, wood, 0.4, 0.6);
    if (W >= 5) { const run = c.add(RB(1.2, 0.01, D * 0.9, 0.004), K.linen(), 0, H + 0.005, 0); run.castShadow = false; c.add(lathe([[0, 0], [0.18, 0], [0.24, 0.3], [0.12, 0.6], [0.08, 0.75], [0, 0.75]]), K.ceramic('#e9e3d6'), 0, H, 0); }
  },
  roundtable(c) {
    const { W, H, K } = c, wood = K.wood(c.color);
    c.add(cyl(W / 2, W / 2 - 0.03, 0.12, 48), wood, 0, H - 0.06, 0);
    c.add(lathe([[0, 0], [W * 0.26, 0], [W * 0.26, 0.08], [0.15, 0.4], [0.12, H - 0.12], [0, H - 0.12]], 32), wood, 0, 0, 0);
    c.add(lathe([[0, 0], [0.16, 0], [0.22, 0.25], [0.1, 0.5], [0, 0.5]]), K.ceramic('#ffffff'), 0, H, 0);
  },
  coffeetable(c) {
    const { W, D, H, K } = c, wood = K.wood(c.color);
    c.add(RB(W, 0.15, D, 0.08), wood, 0, H - 0.075, 0);
    c.add(RB(W - 0.3, 0.08, D - 0.3, 0.03), wood, 0, 0.35, 0);
    legs4(c, W, D, H - 0.15, 0.07, K.black(), 0.18, 1);
    c.add(RB(1.1, 0.18, 0.8, 0.03), K.lacquer('#2f4a6a'), -W * 0.2, H + 0.09, 0); c.add(RB(1, 0.12, 0.75, 0.03), K.lacquer('#d8cbb3'), -W * 0.2, H + 0.24, 0.02);
    c.add(lathe([[0, 0], [0.22, 0], [0.26, 0.08], [0.24, 0.18], [0, 0.18]]), K.ceramic('#5b6d62'), W * 0.22, H, 0);
  },
  sidetable(c) {
    const { W, H, K } = c, wood = K.wood(c.color);
    c.add(cyl(W / 2, W / 2, 0.1, 40), wood, 0, H - 0.05, 0);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, l = c.add(cyl(0.04, 0.05, H - 0.1, 10), K.brass(), Math.cos(a) * W * 0.32, (H - 0.1) / 2, Math.sin(a) * W * 0.32); l.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08); }
  },
  desk(c) {
    const { W, D, H, K } = c, wood = K.wood(c.color);
    c.add(RB(W, 0.12, D, 0.04), wood, 0, H - 0.06, 0);
    c.add(RB(1.4, H - 0.12, D - 0.1, 0.04), wood, W / 2 - 0.75, (H - 0.12) / 2, 0);
    for (let i = 0; i < 3; i++) { c.add(RB(1.3, (H - 0.3) / 3 - 0.06, 0.03, 0.01), wood, W / 2 - 0.75, 0.15 + (H - 0.3) * (i + 0.5) / 3, D / 2 - 0.03); pull(c, W / 2 - 0.75, 0.15 + (H - 0.3) * (i + 0.5) / 3, D / 2 + 0.03, 0.4); }
    [-1, 1].forEach(sz => c.add(cyl(0.05, 0.07, H - 0.12, 10), K.black(), -W / 2 + 0.2, (H - 0.12) / 2, sz * (D / 2 - 0.2)));
  },
  bed(c) {
    const { W, D, K } = c, wood = K.wood('#6b5140'), legH = 0.35;
    c.add(RB(W + 0.15, 0.45, D + 0.1, 0.08), wood, 0, legH + 0.225, 0.05);
    legs4(c, W + 0.15, D + 0.1, legH, 0.08, wood, 0.25, 0.7);
    const head = K.fabric(shade(c.color, 0.72));
    c.add(RB(W + 0.35, 2.4, 0.42, 0.18), head, 0, legH + 1.6, -D / 2 - 0.12);                              // upholstered headboard
    const cols = Math.max(2, Math.round(W / 1.7));
    for (let i = 0; i < cols; i++) c.add(RB((W + 0.1) / cols - 0.1, 2, 0.12, 0.06), K.fabric(shade(c.color, 0.78)), -W / 2 + (W + 0.1) * (i + 0.5) / cols - 0.05, legH + 1.68, -D / 2 + 0.12);   // channel tufting
    c.add(RB(W - 0.1, 0.8, D - 0.3, 0.28), K.linen(), 0, legH + 0.85, 0.05);                              // mattress
    c.add(RB(W + 0.1, 0.32, D * 0.66, 0.15), K.fabric(c.color), 0, legH + 1.3, D * 0.17);                  // duvet, draped over the sides
    c.add(RB(W + 0.14, 0.34, 1.2, 0.16), K.fabric(shade(c.color, 0.62)), 0, legH + 1.42, D / 2 - 0.85);      // throw at the foot
    const pw = W > 4 ? 2 : 1;
    for (let i = 0; i < pw; i++) {
      const x = -W / 2 + 0.35 + ((W - 0.7) * (i + 0.5)) / pw;
      pillow(c, (W - 0.7) / pw - 0.15, 0.45, 1.25, K.linen(), x, legH + 1.5, -D / 2 + 1.0, 0, -0.35);
      pillow(c, Math.min(1.5, (W - 0.7) / pw - 0.5), 0.9, 0.34, K.fabric(shade(c.color, 0.6)), x, legH + 1.72, -D / 2 + 1.55, 0.06 * (i ? -1 : 1), -0.3);
    }
  },
  nightstand(c) {
    const { W, D, H, K } = c, wood = K.wood(c.color);
    c.add(RB(W, H - 0.35, D, 0.05), wood, 0, 0.35 + (H - 0.35) / 2, 0);
    legs4(c, W, D, 0.35, 0.05, wood, 0.15, 0.7);
    [0.33, 0.72].forEach(k => { c.add(RB(W - 0.16, (H - 0.35) * 0.36, 0.03, 0.02), wood, 0, 0.35 + (H - 0.35) * k, D / 2); pull(c, 0, 0.35 + (H - 0.35) * k, D / 2 + 0.05, 0.35); });
    c.add(lathe([[0, 0], [0.18, 0], [0.24, 0.2], [0.2, 0.5], [0.06, 0.62], [0.06, 0.8], [0, 0.8]]), K.ceramic('#e8e2d4'), -W * 0.18, H, -D * 0.1);
    c.add(lathe([[0.22, 0], [0.3, 0.55], [0.28, 0.56], [0.2, 0.01]], 28), K.shadeMat('#f4ecdc'), -W * 0.18, H + 0.78, -D * 0.1);
  },
  dresser(c) {
    const { W, D, H, K } = c, wood = K.wood(c.color);
    c.add(RB(W, H - 0.3, D, 0.05), wood, 0, 0.3 + (H - 0.3) / 2, 0);
    legs4(c, W, D, 0.3, 0.06, wood, 0.18, 0.7);
    for (let r = 0; r < 3; r++) for (let cI = 0; cI < 2; cI++) {
      const x = (cI - 0.5) * W / 2, y = 0.3 + (H - 0.3) * (r + 0.5) / 3;
      c.add(RB(W / 2 - 0.12, (H - 0.3) / 3 - 0.1, 0.03, 0.02), wood, x, y, D / 2); pull(c, x, y, D / 2 + 0.05, 0.6);
    }
    c.add(lathe([[0, 0], [0.12, 0], [0.2, 0.3], [0.08, 0.7], [0.1, 0.9], [0, 0.9]]), K.ceramic('#3e5547'), W * 0.3, H, 0);
  },
  bench(c) {
    const { W, D, H, K } = c;
    c.add(RB(W, 0.4, D, 0.14), K.fabric('#cfc4b2'), 0, H - 0.2, 0);
    c.add(RB(W, 0.08, D, 0.03), K.wood(c.color), 0, H - 0.44, 0);
    legs4(c, W, D, H - 0.48, 0.06, K.wood(c.color), 0.2, 0.7);
  },
  console(c) {
    const { W, D, H, K } = c, body = K.wood(c.color);
    c.add(RB(W, H - 0.4, D, 0.05), body, 0, 0.4 + (H - 0.4) / 2, 0);
    legs4(c, W, D, 0.4, 0.05, K.black(), 0.25, 1);
    for (let i = 0; i < 3; i++) { const x = -W / 2 + W * (i + 0.5) / 3; c.add(RB(W / 3 - 0.08, H - 0.55, 0.03, 0.02), K.wood(shade(c.color, 1.1)), x, 0.4 + (H - 0.4) / 2, D / 2); pull(c, x + W / 6 - 0.25, 0.4 + (H - 0.4) / 2, D / 2 + 0.05, 0.5, true); }
    c.add(lathe([[0, 0], [0.14, 0], [0.22, 0.2], [0.1, 0.6], [0.12, 0.85], [0, 0.85]]), K.ceramic('#d9d2c4'), W * 0.3, H, 0);
  },
  tv(c) {
    const { W, H, D, K, art } = c;
    c.add(RB(W, H, 0.1, 0.03), K.black(), 0, H / 2, -D / 2 + 0.05);
    c.add(new THREE.PlaneGeometry(W - 0.08, H - 0.08), new THREE.MeshStandardMaterial({ map: art, emissive: '#ffffff', emissiveMap: art, emissiveIntensity: 0.35, roughness: 0.15 }), 0, H / 2, -D / 2 + 0.105);
  },
  shelf(c) {
    const { W, D, H, K } = c, wood = K.wood(c.color), r = rnd(c.it.id);
    c.add(RB(W, H, 0.06, 0.02), wood, 0, H / 2, -D / 2 + 0.03);
    [-1, 1].forEach(sx => c.add(RB(0.08, H, D, 0.03), wood, sx * (W / 2 - 0.04), H / 2, 0));
    for (let i = 0; i <= 5; i++) c.add(RB(W, 0.07, D, 0.02), wood, 0, (H * i) / 5 + 0.035, 0);
    const books = ['#8c3a2f', '#2f4a6a', '#c9a46e', '#3a5a3a', '#6b4a7a', '#d8cbb3', '#2b2b2b', '#a8573a'];
    for (let s = 0; s < 5; s++) {
      let x = -W / 2 + 0.12; const y0 = (H * s) / 5 + 0.07, hs = H / 5 - 0.12;
      if (s % 2 === 1) { c.add(lathe([[0, 0], [0.13, 0], [0.18, 0.18], [0.08, 0.45], [0, 0.45]]), K.ceramic(['#e8e0cf', '#3e5547', '#b8673f'][s % 3]), W / 2 - 0.35, y0, 0); }
      const end = s % 2 === 1 ? W / 2 - 0.65 : W / 2 - 0.12;
      while (x < end - 0.1) {
        const bw = 0.08 + r() * 0.1, bh = hs * (0.62 + r() * 0.34), lean = r() < 0.08;
        const b = c.add(RB(bw, bh, D * (0.6 + r() * 0.25), 0.01), K.lacquer(books[Math.floor(r() * books.length)]), x + bw / 2, y0 + bh / 2, 0);
        if (lean) b.rotation.z = -0.25;
        x += bw + 0.01 + (r() < 0.12 ? 0.25 : 0);
      }
    }
  },
  plant(c) {
    const { W, H, K } = c, r = rnd(c.it.id), potH = H * 0.24, pr = W * 0.3;
    c.add(lathe([[0, 0], [pr * 0.72, 0], [pr, potH * 0.9], [pr * 1.05, potH], [pr * 0.95, potH], [0, potH * 0.92]], 32), K.ceramic(r() < 0.5 ? '#e9e4da' : '#2f3a36'), 0, 0, 0);
    c.add(cyl(pr * 0.94, pr * 0.94, 0.02, 24), K.soil(), 0, potH * 0.93, 0);
    const leafGeo = new THREE.SphereGeometry(1, 12, 8), stems = H > 3 ? 7 : 5, leaf = K.leaf(c.color), leaf2 = K.leaf(shade(c.color, 1.25));
    for (let s = 0; s < stems; s++) {
      const a = s * 2.4 + r() * 0.5, tilt = 0.15 + r() * 0.35, len = (H - potH) * (0.55 + r() * 0.45);
      const st = c.add(cyl(0.015, 0.025, len, 6), K.leaf('#4b5a32'), Math.cos(a) * Math.sin(tilt) * len / 2, potH + Math.cos(tilt) * len / 2, Math.sin(a) * Math.sin(tilt) * len / 2);
      st.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); st.castShadow = false;
      const n = H > 3 ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const t = 0.45 + 0.55 * (k + 1) / n, px = Math.cos(a) * Math.sin(tilt) * len * t, py = potH + Math.cos(tilt) * len * t, pz = Math.sin(a) * Math.sin(tilt) * len * t;
        const lf = c.add(leafGeo, k % 2 ? leaf : leaf2, px + Math.cos(a + k) * 0.12, py, pz + Math.sin(a + k) * 0.12);
        const sz = Math.min(W, H) * (0.1 + r() * 0.07);
        lf.scale.set(sz * 0.55, sz * 0.08, sz); lf.rotation.set(0.5 + r() * 0.5, a + k * 1.7, 0.3 * (r() - 0.5));
      }
    }
  },
  rug(c) {
    const { W, D, K } = c;
    const m = c.add(RB(W, 0.035, D, 0.015), K.rugTex(c.color, c.it.id), 0, 0.018, 0); m.castShadow = false;
  },
  floorlamp(c) {
    const { W, H, K } = c;
    c.add(lathe([[0, 0], [W * 0.26, 0], [W * 0.27, 0.04], [W * 0.18, 0.08], [0, 0.09]], 32), K.black(), 0, 0, 0);
    c.add(cyl(0.035, 0.035, H * 0.78, 10), K.brass(), 0, H * 0.39, 0);
    c.add(lathe([[W * 0.3, 0], [W * 0.38, H * 0.24], [W * 0.37, H * 0.245], [W * 0.29, 0.005]], 36), K.shadeMat('#f4ecdc'), 0, H * 0.72, 0);
    c.add(new THREE.SphereGeometry(0.16, 16, 12), K.glow(), 0, H * 0.8, 0);
  },
  tablelamp(c) {
    const { W, H, K } = c;
    c.add(lathe([[0, 0], [W * 0.2, 0], [W * 0.3, H * 0.15], [W * 0.26, H * 0.38], [W * 0.08, H * 0.5], [W * 0.06, H * 0.55], [0, H * 0.55]], 32), K.ceramic(c.color), 0, 0, 0);
    c.add(lathe([[W * 0.3, 0], [W * 0.42, H * 0.38], [W * 0.41, H * 0.385], [W * 0.29, 0.005]], 36), K.shadeMat('#f4ecdc'), 0, H * 0.55, 0);
    c.add(new THREE.SphereGeometry(0.12, 14, 10), K.glow(), 0, H * 0.68, 0);
  },
  sconce(c) {
    const { W, H, D, K } = c;
    c.add(cyl(0.18, 0.18, 0.05, 24), K.brass(), 0, H * 0.4, -D / 2 + 0.03).rotation.x = Math.PI / 2;
    const arm = c.add(cyl(0.03, 0.03, D * 0.8, 8), K.brass(), 0, H * 0.4, -D / 2 + D * 0.4); arm.rotation.x = Math.PI / 2;
    c.add(lathe([[W * 0.18, 0], [W * 0.32, H * 0.5], [W * 0.31, H * 0.505], [W * 0.17, 0.005]], 28), K.shadeMat('#f4ecdc'), 0, H * 0.4, D * 0.2);
    c.add(new THREE.SphereGeometry(0.09, 12, 8), K.glow(), 0, H * 0.55, D * 0.2);
  },
  pendant(c) {
    const { W, H, K, level, it } = c, drop = Math.max(0.2, (level.height || 9) - (it.elev || 6.5) - H);
    c.add(cyl(0.012, 0.012, drop, 6), K.black(), 0, H + drop / 2, 0);
    c.add(cyl(0.12, 0.12, 0.04, 16), K.black(), 0, H + drop - 0.02, 0);
    c.add(lathe([[0.06, H * 0.95], [W * 0.18, H * 0.85], [W * 0.42, H * 0.45], [W * 0.5, H * 0.3], [W * 0.49, H * 0.29], [W * 0.41, H * 0.44], [0.05, H * 0.94]], 40), new THREE.MeshStandardMaterial({ color: c.color, metalness: 0.75, roughness: 0.32, side: THREE.DoubleSide }), 0, 0, 0);
    c.add(new THREE.SphereGeometry(Math.min(W, H) * 0.14, 16, 12), K.glow(), 0, H * 0.42, 0);
  },
  chandelier(c) {
    const { W, H, K, level, it } = c, drop = Math.max(0.2, (level.height || 9) - (it.elev || 6.4) - H);
    c.add(cyl(0.02, 0.02, drop, 6), K.brass(), 0, H + drop / 2, 0);
    c.add(lathe([[0, H * 0.2], [0.12, H * 0.3], [0.1, H * 0.8], [0.05, H], [0, H]]), K.brass(), 0, 0, 0);
    const ring = c.add(new THREE.TorusGeometry(W * 0.4, 0.03, 8, 48), K.brass(), 0, H * 0.32, 0); ring.rotation.x = Math.PI / 2;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n, x = Math.cos(a) * W * 0.4, z = Math.sin(a) * W * 0.4;
      c.add(cyl(0.05, 0.07, 0.08, 12), K.brass(), x, H * 0.36, z);
      c.add(cyl(0.035, 0.035, 0.28, 10), K.glow('#fff1d6', 0.6), x, H * 0.52, z);
      c.add(new THREE.SphereGeometry(0.06, 10, 8), K.glow(), x, H * 0.7, z);
    }
  },
  fan(c) {
    const { W, H, K } = c;
    c.add(cyl(0.02, 0.02, H, 6), K.black(), 0, H / 2 + 0.2, 0);
    c.add(lathe([[0, 0], [0.32, 0.02], [0.36, 0.16], [0.3, 0.3], [0, 0.32]]), K.black(), 0, 0, 0);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5, b = c.add(RB(W * 0.42, 0.03, 0.42, 0.012), K.wood('#6b5140'), Math.cos(a) * W * 0.25, 0.16, Math.sin(a) * W * 0.25); b.rotation.set(0.12, -a, 0); }
    c.add(lathe([[0, 0], [0.22, 0], [0.2, -0.12], [0, -0.16]]), K.glow('#fff1d6', 0.9), 0, 0, 0);
  },
  recessed(c) {
    const { W, K } = c;
    c.add(cyl(W / 2, W / 2, 0.03, 28), K.paint('#ffffff'), 0, 0.085, 0);
    c.add(cyl(W * 0.36, W * 0.36, 0.02, 24), K.glow('#fff6e8', 1.8), 0, 0.068, 0);
  },
  art(c) {
    const { W, H, D, K, art } = c, frameW = 0.12, z = -D / 2;
    const fr = K.lacquer('#1c1b1a');
    c.add(RB(W, frameW, 0.12, 0.02), fr, 0, H - frameW / 2, z + 0.06); c.add(RB(W, frameW, 0.12, 0.02), fr, 0, frameW / 2, z + 0.06);
    c.add(RB(frameW, H, 0.12, 0.02), fr, -W / 2 + frameW / 2, H / 2, z + 0.06); c.add(RB(frameW, H, 0.12, 0.02), fr, W / 2 - frameW / 2, H / 2, z + 0.06);
    c.add(new THREE.PlaneGeometry(W - frameW * 2, H - frameW * 2), K.paint('#f6f3ec'), 0, H / 2, z + 0.03);
    c.add(new THREE.PlaneGeometry(W - frameW * 2 - 0.4, H - frameW * 2 - 0.4), new THREE.MeshStandardMaterial({ map: art, roughness: 0.85 }), 0, H / 2, z + 0.035);
  },
  mirror(c) {
    const { W, H, D, K } = c, z = -D / 2;
    c.add(RB(W, H, 0.1, Math.min(W, H) * 0.12), K.brass(), 0, H / 2, z + 0.05);
    c.add(RB(W - 0.2, H - 0.2, 0.02, Math.min(W, H) * 0.1), K.mirror(), 0, H / 2, z + 0.105);
  },
  // ---- kitchen & bath ----
  base(c) { cabinet(c, false); },
  upper(c) { cabinet(c, true); },
  vanity(c) {
    cabinet(c, false);
    const { W, D, H, K } = c;
    c.add(lathe([[0, 0], [0.55, 0], [0.62, 0.32], [0.6, 0.33], [0.5, 0.05], [0, 0.03]], 36), K.ceramic(), 0, H - 0.3, 0.05).scale.set(1, 1, 0.75);
    faucet(c, 0, H, -D / 2 + 0.35, 0.6);
  },
  pantry(c) {
    const { W, D, H } = c; c.H = H; cabinetBox(c, W, D, H, 0, 2, true);
  },
  sink(c) {
    const { W, D, K } = c;
    const rim = c.add(RB(W, 0.04, D, 0.02), K.steel(), 0, 0.02, 0); rim.castShadow = false;
    c.add(RB(W - 0.25, 0.02, D - 0.25, 0.08), new THREE.MeshStandardMaterial({ color: '#7d8287', metalness: 0.9, roughness: 0.35 }), 0, 0.045, 0);
    faucet(c, 0, 0.04, -D / 2 + 0.15, 1.1);
  },
  toilet(c) {
    const { W, D, H, K } = c, cer = K.ceramic();
    c.add(RB(W * 0.92, H * 0.5, D * 0.27, 0.12), cer, 0, H * 0.73, -D * 0.36);
    c.add(RB(W * 0.95, 0.06, D * 0.29, 0.03), cer, 0, H * 0.99, -D * 0.36);
    const bowl = c.add(lathe([[0, 0], [W * 0.3, 0], [W * 0.26, H * 0.2], [W * 0.38, H * 0.52], [W * 0.4, H * 0.56], [0, H * 0.56]], 32), cer, 0, 0, D * 0.1); bowl.scale.z = 1.35;
    const seat = c.add(new THREE.TorusGeometry(W * 0.3, 0.06, 10, 36), cer, 0, H * 0.58, D * 0.1); seat.rotation.x = Math.PI / 2; seat.scale.y = 1.35;
    c.add(RB(0.25, 0.04, 0.06, 0.02), K.chrome(), -W * 0.3, H * 0.9, -D * 0.22);
  },
  tub(c) {
    const { W, D, H, K } = c, cer = K.ceramic();
    c.add(RB(W, H, D, 0.35), cer, 0, H / 2, 0);
    c.add(RB(W - 0.45, 0.05, D - 0.45, 0.4), new THREE.MeshPhysicalMaterial({ color: '#d6e9f2', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }), 0, H - 0.12, 0);
    faucet(c, -W / 2 + 0.25, H, 0, 0.5, Math.PI / 2);
  },
  shower(c) {
    const { W, D, H, K } = c;
    c.add(RB(W, 0.25, D, 0.06), K.ceramic(), 0, 0.125, 0);
    c.add(RB(W - 0.2, 0.02, D - 0.2, 0.05), K.ceramic('#eef2f3'), 0, 0.26, 0);
    c.add(RB(W, H - 0.25, 0.03, 0.01), K.glass(), 0, 0.25 + (H - 0.25) / 2, D / 2 - 0.02);
    c.add(RB(0.04, H - 0.25, 0.04, 0.015), K.chrome(), W / 2 - 0.02, 0.25 + (H - 0.25) / 2, D / 2 - 0.02);
    c.add(cyl(0.025, 0.025, 0.7, 10), K.chrome(), 0, H - 0.75, -D / 2 + 0.35).rotation.x = Math.PI / 2;
    c.add(cyl(0.3, 0.32, 0.05, 28), K.chrome(), 0, H - 0.78, -D / 2 + 0.7);
  },
  fridge(c) {
    const { W, D, H, K } = c, st = K.steel();
    c.add(RB(W, H, D - 0.1, 0.05), st, 0, H / 2, -0.05);
    const top = H * 0.66;
    [-1, 1].forEach(sx => { c.add(RB(W / 2 - 0.02, top - 0.04, 0.1, 0.03), st, sx * W / 4, H - top / 2, D / 2 - 0.08); c.add(cyl(0.03, 0.03, top * 0.7, 10), K.chrome(), sx * 0.12, H - top / 2, D / 2 + 0.06); });
    c.add(RB(W - 0.02, H - top - 0.06, 0.1, 0.03), st, 0, (H - top) / 2, D / 2 - 0.08);
    pull(c, 0, H - top - 0.2, D / 2 + 0.06, W * 0.6);
  },
  range(c) {
    const { W, D, H, K } = c, st = K.steel();
    c.add(RB(W, H - 0.06, D, 0.04), st, 0, (H - 0.06) / 2, 0);
    c.add(RB(W, 0.05, D, 0.02), K.blackGlass(), 0, H - 0.03, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const b = c.add(new THREE.TorusGeometry(0.28, 0.025, 6, 32), new THREE.MeshStandardMaterial({ color: '#3a3a3a', emissive: '#ff4a1a', emissiveIntensity: 0.12, roughness: 0.6 }), sx * W * 0.24, H + 0.005, sz * D * 0.22); b.rotation.x = Math.PI / 2; });
    c.add(RB(W, 0.6, 0.15, 0.04), st, 0, H + 0.3, -D / 2 + 0.07);
    c.add(RB(W - 0.25, H * 0.55, 0.04, 0.03), K.blackGlass(), 0, H * 0.42, D / 2 + 0.01);
    pull(c, 0, H * 0.75, D / 2 + 0.08, W * 0.75);
    for (let i = 0; i < 4; i++) c.add(cyl(0.06, 0.06, 0.07, 14), K.black(), -W * 0.3 + i * W * 0.2, H - 0.25, D / 2 + 0.02).rotation.x = Math.PI / 2;
  },
  dishwasher(c) {
    const { W, D, H, K } = c, st = K.steel();
    c.add(RB(W, H, D, 0.03), st, 0, H / 2, 0);
    c.add(RB(W - 0.04, 0.3, 0.04, 0.02), K.black(), 0, H - 0.2, D / 2 + 0.01);
    pull(c, 0, H - 0.45, D / 2 + 0.08, W * 0.75);
  },
  microwave(c) {
    const { W, D, H, K } = c;
    c.add(RB(W, H, D, 0.04), K.steel(), 0, H / 2, 0);
    c.add(RB(W * 0.7, H * 0.75, 0.03, 0.02), K.blackGlass(), -W * 0.12, H / 2, D / 2 + 0.01);
    c.add(RB(W * 0.18, H * 0.75, 0.03, 0.02), K.black(), W * 0.38, H / 2, D / 2 + 0.01);
  },
  laundry(c) {
    const { W, D, H, K } = c, uw = W / 2 - 0.08;
    [-1, 1].forEach(sx => {
      const x = sx * (W / 4);
      c.add(RB(uw, H, D, 0.08), K.paint('#f4f5f6'), x, H / 2, 0);
      c.add(RB(uw, 0.35, 0.05, 0.03), K.blackGlass(), x, H - 0.25, D / 2);
      const ring = c.add(new THREE.TorusGeometry(uw * 0.3, 0.06, 12, 40), K.chrome(), x, H * 0.45, D / 2 + 0.02);
      c.add(new THREE.CircleGeometry(uw * 0.28, 36), K.blackGlass(), x, H * 0.45, D / 2 + 0.03); void ring;
    });
  },
  condenser(c) {
    const { W, D, H, K } = c;
    c.add(RB(W, H - 0.2, D, 0.06), K.paint('#c6cbcf'), 0, (H - 0.2) / 2 + 0.2, 0);
    c.add(RB(W + 0.2, 0.2, D + 0.2, 0.03), K.paint('#9aa0a5'), 0, 0.1, 0);
    c.add(cyl(W * 0.4, W * 0.4, 0.04, 36), K.black(), 0, H + 0.01, 0);
    for (let i = 1; i <= 4; i++) { const t = c.add(new THREE.TorusGeometry(W * 0.1 * i, 0.012, 4, 36), K.steel(), 0, H + 0.04, 0); t.rotation.x = Math.PI / 2; }
  },
  waterheater(c) {
    const { W, H, K } = c;
    c.add(cyl(W / 2, W / 2, H - 0.25, 32), K.paint('#e3e5e6'), 0, (H - 0.25) / 2, 0);
    c.add(lathe([[W / 2, 0], [W * 0.4, 0.15], [0.1, 0.25], [0, 0.25]], 32), K.paint('#e3e5e6'), 0, H - 0.25, 0);
    [-1, 1].forEach(sx => c.add(cyl(0.05, 0.05, 0.6, 10), K.brass(), sx * 0.3, H + 0.2, 0));
  },
  epanel(c) {
    const { W, D, H, K } = c;
    c.add(RB(W, H, D, 0.03), K.paint('#a3a9ae'), 0, H / 2, 0);
    c.add(RB(W - 0.12, H - 0.12, 0.02, 0.02), K.paint('#b4babf'), 0, H / 2, D / 2 + 0.005);
  },
  lounge(c) {
    const { W, D, H, K } = c, al = K.paint('#d9d6cf');
    c.add(RB(W, 0.12, D, 0.05), al, 0, 0.75, 0);
    legs4(c, W, D, 0.75, 0.05, al, 0.2, 1);
    c.add(RB(W - 0.2, 0.35, D * 0.65, 0.14), K.fabric(c.color), 0, 0.98, D * 0.17);
    const back = c.add(RB(W - 0.2, 0.32, D * 0.32, 0.14), K.fabric(c.color), 0, 1.25, -D * 0.33); back.rotation.x = 0.55;
  },
  patioset(c) {
    const { W, H, K } = c, al = K.black();
    c.add(cyl(W * 0.22, W * 0.22, 0.08, 40), K.blackGlass(), 0, H - 0.04, 0);
    c.add(cyl(0.06, 0.08, H, 12), al, 0, H / 2, 0);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * W * 0.36, z = Math.sin(a) * W * 0.36;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a - Math.PI / 2; c.grp.add(g);
      const sub = { ...c, add: (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.userData.pick = c.grp.userData.pick; g.add(m); return m; }, W: 1.7, D: 1.8, H: 3, color: '#3a3a3a' };
      MODELS.diningchair(sub);
    }
    c.add(cyl(0.035, 0.035, 5, 8), K.steel(), 0, H + 2.5, 0);
    c.add(new THREE.ConeGeometry(W * 0.45, 1.2, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.95, side: THREE.DoubleSide }), 0, H + 4.6, 0);
  },
};

// Shaker or flat-slab cabinet run: doors with handles, toe kick, counter (base) or crown (upper).
function cabinetBox(c, W, D, H, y0, rows, tall) {
  const { K, p } = c, slab = /slab|flat|modern/i.test((p && (p.finish || p.name)) || ''), col = c.color;
  const body = K.lacquer(col), kick = tall || c.upper ? 0 : 0.33;
  c.add(RB(W, H - kick, D - 0.06, 0.02), body, 0, y0 + kick + (H - kick) / 2, -0.03);
  if (kick) c.add(RB(W - 0.1, kick, D - 0.25, 0.01), K.paint(shade(col, 0.45)), 0, y0 + kick / 2, -0.1);
  const n = Math.max(1, Math.round(W / 1.5)), dw = W / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + dw * (i + 0.5);
    for (let r = 0; r < rows; r++) {
      const hh = (H - kick) / rows, y = y0 + kick + hh * (r + 0.5);
      c.add(RB(dw - 0.06, hh - 0.06, 0.06, 0.02), body, x, y, D / 2 - 0.03);
      if (!slab) c.add(RB(dw - 0.4, hh - 0.4, 0.03, 0.01), K.lacquer(shade(col, 0.95)), x, y, D / 2 + 0.005);   // shaker panel
      const hx = x + (i % 2 ? -1 : 1) * (dw / 2 - 0.2);
      if (c.upper) pull(c, hx, y - hh / 2 + 0.3, D / 2 + 0.06, 0.4, true);
      else if (!tall && r === rows - 1 && H < 4) pull(c, x, y + hh / 2 - 0.3, D / 2 + 0.06, 0.45);
      else pull(c, hx, y, D / 2 + 0.06, 0.5, true);
    }
  }
}
function cabinet(c, upper) {
  const { W, D, H, K } = c; c.upper = upper;
  if (upper) { cabinetBox(c, W, D, H, 0, 1, false); c.add(RB(W + 0.1, 0.12, D + 0.06, 0.02), K.lacquer(c.color), 0, H + 0.06, 0); c.add(RB(W - 0.1, 0.03, D - 0.2, 0.01), K.glow('#fff1d6', 0.5), 0, -0.01, 0); return; }
  cabinetBox(c, W, D, H - 0.13, 0, 1, false);
  c.add(RB(W + 0.08, 0.13, D + 0.1, 0.03), K.marble(), 0, H - 0.065, 0.02);
}
function faucet(c, x, y, z, s = 1, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; c.grp.add(g);
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.userData.pick = c.grp.userData.pick; g.add(m); return m; };
  const ch = c.K.chrome();
  add(cyl(0.06 * s, 0.07 * s, 0.05, 16), ch, 0, 0.025, 0);
  add(cyl(0.035 * s, 0.035 * s, 0.9 * s, 12), ch, 0, 0.45 * s, 0);
  const arc = add(new THREE.TorusGeometry(0.2 * s, 0.035 * s, 10, 24, Math.PI), ch, 0, 0.9 * s, 0.2 * s); arc.rotation.y = Math.PI / 2;
  add(cyl(0.035 * s, 0.03 * s, 0.15 * s, 12), ch, 0, 0.83 * s, 0.4 * s);
}
