// Studio scene: draws the construction systems (systems.js members) in the 3D view on a dark
// blueprint stage. X-ray colors per system, the selected system lit up and the rest ghosted,
// a step timeline (pieces drop or rise into place), explode, cutaway and hover labels.

import * as THREE from 'three';
import { wallLength, wallHeight, wallPieces, wallOpenings, bbox, polyArea, centroid } from './geom.js';

const GHOST = '#8d97a3';

export class StudioScene {
  constructor(view) {
    this.v = view;
    this.st = { sel: null, hidden: new Set(), finished: false, explode: 0, blueprint: true, grid: false, cut: 1, step: 16 };
    this.mats = new Map();
    this.groups = [];
  }
  get app() { return this.v.app; }

  // ---------- materials ----------
  sysMat(color, kind = 'solid') {
    const key = color + kind;
    let m = this.mats.get(key);
    if (!m) {
      if (kind === 'ghost') m = new THREE.MeshStandardMaterial({ color: GHOST, transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide });
      else if (kind === 'skin') m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.7, side: THREE.DoubleSide });
      else if (kind === 'lit') m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide });
      else if (kind === 'litSkin') m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.5, side: THREE.DoubleSide });
      else if (kind === 'line') m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 });
      else m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
      this.mats.set(key, m);
    }
    return m;
  }

  // ---------- build ----------
  build(A) {
    const v = this.v, P = this.app.project;
    this.A = A;
    this.color = Object.fromEntries(A.systems.map(s => [s.id, s.color]));
    this.color.exist = '#7a828c';
    this.groups = [];
    for (let s = 0; s <= 16; s++) { const g = new THREE.Group(); g.userData.step = s; this.groups.push(g); v.root.add(g); }
    const levelGroup = (step, levelId) => {
      const g = this.groups[step]; let lg = g.children.find(c => c.userData.levelId === levelId);
      if (!lg) { const L = P.levels.find(l => l.id === levelId); lg = new THREE.Group(); lg.userData.levelId = levelId; lg.position.y = L ? L.elevation : 0; g.add(lg); }
      return lg;
    };
    const unit = new THREE.BoxGeometry(1, 1, 1);
    A.members.forEach(m => {
      const step = m.step || 0, color = this.color[m.sys] || '#999';
      let obj = null;
      if (m.type === 'box') {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(m.len, m.h, m.wid), this.sysMat(color));
        mesh.position.set(m.cx, m.z + m.h / 2, m.cy); mesh.rotation.y = -m.ang; obj = mesh;
        if (m.light) mesh.userData.real = this.sysMat('#fff7e0', 'lit');
        else mesh.userData.real = v.mat(m.sys === 'frame' ? '#5d6670' : '#c3c8cc', { metalness: 0.4, roughness: 0.5 });
      } else if (m.type === 'inst' || m.type === 'truss') {
        const boxes = m.type === 'truss' ? this._truss(m) : m.boxes;
        const im = new THREE.InstancedMesh(unit, this.sysMat(color), boxes.length);
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YZX');
        boxes.forEach((b, i) => {
          const [cx, cy, z, len, wid, h, ang, tilt] = b;
          e.set(0, -ang, tilt || 0); q.setFromEuler(e);
          M.compose(new THREE.Vector3(cx, z + h / 2, cy), q, new THREE.Vector3(len, h, wid)); im.setMatrixAt(i, M);
        });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); obj = im;
        if (m.wood) im.userData.real = v.mat('#d7b07a', { roughness: 0.8 });
      } else if (m.type === 'poly') {
        const shape = new THREE.Shape(m.pts.map(p => new THREE.Vector2(p.x, -p.y)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: m.thick, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.sysMat(color, m.film || m.deckSheet ? 'skin' : 'solid'));
        mesh.position.y = m.z - m.thick; obj = mesh;
        if (m.sys === 'slab') mesh.userData.real = v.mat('#b9b5ab');
        if (m.deckSheet) mesh.userData.real = v.mat('#aeb4b8', { metalness: 0.5, roughness: 0.5 });
        mesh.userData.skin = !!(m.film || m.deckSheet);
      } else if (m.type === 'pipe' || m.type === 'duct') {
        const a = new THREE.Vector3(m.a.x, m.a.z, m.a.y), b = new THREE.Vector3(m.b.x, m.b.z, m.b.y), len = a.distanceTo(b);
        if (len < 0.05) return;
        const geo = m.type === 'pipe' ? new THREE.CylinderGeometry(m.r, m.r, len, 10) : new THREE.BoxGeometry(m.w, len, m.h);
        const mesh = new THREE.Mesh(geo, this.sysMat(color));
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        if (m.type === 'duct') mesh.userData.real = v.mat('#b8c0c6', { metalness: 0.6, roughness: 0.35 });
        obj = mesh;
      } else if (m.type === 'ref') {
        obj = this._ref(m, levelGroup(step, m.levelId));
        if (!obj) return;
        obj.traverse(o => { o.userData.member = m; o.userData.sys = m.existing ? 'exist' : m.sys; });
        this._prep(obj, m);
        return;
      }
      if (!obj) return;
      obj.userData.member = m; obj.userData.sys = m.existing ? 'exist' : m.sys;
      obj.castShadow = true; obj.receiveShadow = true;
      this.groups[step].add(obj);
      this._prep(obj, m);
    });
    this._stage();
    this.apply();
  }
  // remember each mesh's own (realistic) material, and give solid pieces outline edges for the ghost look
  _prep(obj, m) {
    obj.traverse(o => {
      if (!o.isMesh) return;
      if (!o.userData.real) o.userData.real = o.material;
      o.userData.member = o.userData.member || m;
      if (!o.isInstancedMesh && o.geometry && !o.userData.noEdges) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 35), this.sysMat('#a9b4c2', 'line'));
        e.raycast = () => {}; e.userData.edge = true; o.add(e);
      }
    });
  }
  _truss(m) {
    const out = [], s = m.span, r = Math.max(0.6, m.rise), ang = m.along === 'x' ? Math.PI / 2 : 0, c = Math.cos(ang), sn = Math.sin(ang);
    const top = Math.hypot(s / 2, r), web = Math.hypot(s / 4, r / 2);
    m.at.forEach(({ cx, cy }) => {
      const put = (u, zc, len, h, tilt) => out.push([cx + c * u, cy + sn * u, m.base + zc - h / 2, len, 0.125, h, ang, tilt]);
      put(0, 0.2, s, 0.3, 0);
      put(-s / 4, r / 2 + 0.2, top, 0.3, Math.atan2(r, s / 2));
      put(s / 4, r / 2 + 0.2, top, 0.3, -Math.atan2(r, s / 2));
      put(0, r / 2, 0.125, r, 0);
      put(-s / 8 - s / 16, r / 4 + 0.1, web, 0.2, -Math.atan2(r / 2, s / 4));
      put(s / 8 + s / 16, r / 4 + 0.1, web, 0.2, Math.atan2(r / 2, s / 4));
    });
    return out;
  }
  // pieces built by the regular 3D builder (walls, openings, products, roofs, floors, ceilings)
  _ref(m, lg) {
    const v = this.v, P = this.app.project, L = P.levels.find(l => l.id === m.levelId); if (!L) return null;
    const grab = (parent, fn) => { const before = new Set(parent.children); fn(); const added = parent.children.filter(c => !before.has(c)); if (!added.length) return null; const g = new THREE.Group(); added.forEach(c => { parent.remove(c); g.add(c); }); parent.add(g); return g; };
    if (m.ref === 'item') { const it = L.items.find(x => x.id === m.id); return it ? grab(lg, () => v.buildItem(it, lg, L)) : null; }
    if (m.ref === 'opening') {
      const o = L.openings.find(x => x.id === m.id), w = o && L.walls.find(x => x.id === o.wallId); if (!w) return null;
      const sp = wallOpenings(w, L.openings).find(s => s.o.id === o.id); if (!sp) return null;
      const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
      return grab(lg, () => v.buildOpening(sp, w, ang, { x: Math.cos(ang), y: Math.sin(ang) }, w.thickness || 0.5, wallHeight(w, L), lg, L, null));
    }
    if (m.ref === 'roof') {
      const sec = P.roofs.find(r => r.id === m.id); if (!sec) return null;
      const g = grab(v.root, () => v.buildRoof(sec, L)); if (g) { v.root.remove(g); this.groups[m.step].add(g); }
      return g;
    }
    if (m.ref === 'floor' || m.ref === 'ceiling') {
      const r = L.rooms.find(x => x.id === m.id); if (!r) return null;
      const geo = new THREE.ShapeGeometry(new THREE.Shape(r.points.map(p => new THREE.Vector2(p.x, -p.y)))); geo.rotateX(-Math.PI / 2);
      if (m.ref === 'floor') {
        const mat = v.productMat(r.floorId, '#cccccc', 2); if (mat.map) v._uvPlanar(geo, mat.userData.repeatFt || 2);
        const mesh = new THREE.Mesh(geo, this.sysMat(this.color[m.sys], 'solid')); mesh.userData.real = mat; mesh.receiveShadow = true;
        mesh.position.y = r.outdoor ? (L.elevation > 0 ? 0.02 : -0.3) : 0.04; mesh.userData.noEdges = false;
        lg.add(mesh); return mesh;
      }
      const H = r.height || L.height;
      const mesh = new THREE.Mesh(geo, this.sysMat(this.color.ceil, 'skin')); mesh.userData.skin = true;
      mesh.userData.real = v.productMat(r.ceilingId || P.settings.ceilingFinishId, '#f4f4f2', 2, { side: THREE.DoubleSide });
      mesh.position.y = H - 0.02; lg.add(mesh);
      if (m.grid) {   // 2×4 ceiling grid
        const b = bbox(r.points), pts = [];
        for (let x = Math.ceil(b.x / 2) * 2; x < b.x + b.w; x += 2) pts.push(x, H - 0.05, b.y, x, H - 0.05, b.y + b.h);
        for (let y = Math.ceil(b.y / 4) * 4; y < b.y + b.h; y += 4) pts.push(b.x, H - 0.05, y, b.x + b.w, H - 0.05, y);
        const geo2 = new THREE.BufferGeometry(); geo2.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const ln = new THREE.LineSegments(geo2, this.sysMat('#ffffff', 'line')); ln.raycast = () => {}; ln.userData.edge = true; mesh.add(ln); ln.position.y = -mesh.position.y; ln.userData.grid = true;
      }
      return mesh;
    }
    if (m.ref === 'wall') {
      const w = L.walls.find(x => x.id === m.id); if (!w) return null;
      const H = wallHeight(w, L), Lw = wallLength(w), ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), dir = { x: Math.cos(ang), y: Math.sin(ang) }, right = { x: -dir.y, y: dir.x };
      const t = w.thickness || 0.5, g = new THREE.Group();
      const sg = w.exterior ? v.outsideSign(w, L) : 1;   // +1: right side is inside
      const outN = sg > 0 ? -1 : 1;
      const layers = m.existing ? [[0, t, 'exist']] : m.sheath ? [[outN * (t / 2 + 0.03), 0.05, 'sheath']] : m.skin === 'out' ? [[outN * (t / 2 + 0.11), 0.09, 'out']]
        : w.exterior ? [[-outN * (t / 2 - 0.02), 0.05, 'in']] : [[t / 2 - 0.02, 0.05, 'in'], [-(t / 2 - 0.02), 0.05, 'in']];
      const realOut = v.productMat(w.finishOut || P.settings.exteriorFinishId, '#d9d4c5', 4);
      const room = side => { const mm = { x: (w.a.x + w.b.x) / 2 + right.x * side * (t / 2 + 0.5), y: (w.a.y + w.b.y) / 2 + right.y * side * (t / 2 + 0.5) }; const r = v.roomAt(mm, L); return r && r.wallFinishId ? v.productMat(r.wallFinishId, '#f1efe9') : v.mat('#efede7'); };
      wallPieces(w, L.openings, H).forEach(pc => {
        let u0 = pc.u0, u1 = pc.u1; if (u0 < 0.001) u0 -= t / 2; if (u1 > Lw - 0.001) u1 += t / 2;
        const len = u1 - u0, h = pc.z1 - pc.z0; if (len < 0.01 || h < 0.01) return;
        layers.forEach(([off, th, kind]) => {
          const geo = new THREE.BoxGeometry(len, h, th);
          const real = kind === 'out' ? realOut : kind === 'sheath' ? v.mat('#c9a66b', { roughness: 0.9 }) : kind === 'exist' ? v.mat('#c9c9c6') : room(off >= 0 ? 1 : -1);
          if (real.map) v._uvBox(geo, len, h, real.userData.repeatFt || 4);
          const mesh = new THREE.Mesh(geo, this.sysMat(this.color[m.existing ? 'exist' : m.sys], kind === 'out' || kind === 'exist' ? 'solid' : 'skin'));
          mesh.userData.real = real; mesh.userData.skin = kind !== 'exist';
          const cu = (u0 + u1) / 2;
          mesh.position.set(w.a.x + dir.x * cu + right.x * off, pc.z0 + h / 2, w.a.y + dir.y * cu + right.y * off);
          mesh.rotation.y = -ang; mesh.castShadow = true; mesh.receiveShadow = true;
          g.add(mesh);
        });
      });
      lg.add(g); return g;
    }
    return null;
  }

  // ---------- the stage: dark background, blueprint of the plan on the ground, grid ----------
  _stage() {
    const v = this.v, P = this.app.project, L = P.levels[0];
    const pts = []; P.levels.forEach(l => { l.walls.forEach(w => pts.push(w.a, w.b)); l.rooms.forEach(r => pts.push(...r.points)); });
    if (!pts.length) pts.push({ x: 0, y: 0 }, { x: 40, y: 40 });
    const b = bbox(pts), m = 24, W = b.w + 2 * m, Hh = b.h + 2 * m, px = 2048 / Math.max(W, Hh);
    this.box = b;
    const c = document.createElement('canvas'); c.width = Math.ceil(W * px); c.height = Math.ceil(Hh * px);
    const x = c.getContext('2d'), X = p => (p.x - b.x + m) * px, Y = p => (p.y - b.y + m) * px;
    x.fillStyle = 'rgba(14,18,24,0.94)'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = 'rgba(120,150,190,0.10)'; x.lineWidth = 1;
    for (let gx = Math.floor((b.x - m) / 5) * 5; gx < b.x + b.w + m; gx += 5) { x.beginPath(); x.moveTo(X({ x: gx }), 0); x.lineTo(X({ x: gx }), c.height); x.stroke(); }
    for (let gy = Math.floor((b.y - m) / 5) * 5; gy < b.y + b.h + m; gy += 5) { x.beginPath(); x.moveTo(0, Y({ y: gy })); x.lineTo(c.width, Y({ y: gy })); x.stroke(); }
    if (L) {
      x.strokeStyle = 'rgba(214,226,240,0.75)';
      L.walls.forEach(w => {
        const t = (w.thickness || 0.5) * px, a = { x: X(w.a), y: Y(w.a) }, bb = { x: X(w.b), y: Y(w.b) }, len = Math.hypot(bb.x - a.x, bb.y - a.y) || 1, n = { x: -(bb.y - a.y) / len * t / 2, y: (bb.x - a.x) / len * t / 2 };
        x.lineWidth = 1.4;
        [1, -1].forEach(s => { x.beginPath(); x.moveTo(a.x + n.x * s, a.y + n.y * s); x.lineTo(bb.x + n.x * s, bb.y + n.y * s); x.stroke(); });
      });
      // openings: door swings
      x.strokeStyle = 'rgba(150,200,255,0.55)'; x.lineWidth = 1;
      L.openings.forEach(o => {
        const w = L.walls.find(ww => ww.id === o.wallId); if (!w) return;
        const Lw = wallLength(w), cxy = { x: w.a.x + (w.b.x - w.a.x) * o.t, y: w.a.y + (w.b.y - w.a.y) * o.t };
        if (o.type === 'door') { x.beginPath(); x.arc(X(cxy), Y(cxy), o.width / 2 * px, 0, Math.PI * 2); x.stroke(); }
        void Lw;
      });
      x.fillStyle = 'rgba(190,206,226,0.62)'; x.textAlign = 'center'; x.textBaseline = 'middle';
      L.rooms.forEach(r => {
        const cc = centroid(r.points), fs = Math.max(11, Math.min(26, Math.sqrt(polyArea(r.points)) * px * 0.08));
        x.font = `600 ${fs}px "Space Grotesk", Inter, sans-serif`;
        x.fillText((r.name || '').toUpperCase(), X(cc), Y(cc));
      });
      // overall dimensions
      x.font = `500 ${Math.round(13 * px / 9)}px Inter, sans-serif`; x.fillStyle = 'rgba(120,200,255,0.8)';
      x.fillText(`${Math.round(b.w)}′-0″`, X({ x: b.x + b.w / 2 }), Y({ y: b.y }) - 4.5 * px);
      x.save(); x.translate(X({ x: b.x }) - 4.5 * px, Y({ y: b.y + b.h / 2 })); x.rotate(-Math.PI / 2); x.fillText(`${Math.round(b.h)}′-0″`, 0, 0); x.restore();
      x.strokeStyle = 'rgba(120,200,255,0.5)'; x.beginPath(); x.moveTo(X({ x: b.x }), Y({ y: b.y }) - 3 * px); x.lineTo(X({ x: b.x + b.w }), Y({ y: b.y }) - 3 * px); x.moveTo(X({ x: b.x }) - 3 * px, Y({ y: b.y })); x.lineTo(X({ x: b.x }) - 3 * px, Y({ y: b.y + b.h })); x.stroke();
      // grid bubbles
      x.strokeStyle = 'rgba(200,215,235,0.6)'; x.lineWidth = 1.5; x.font = `600 ${Math.round(12 * px / 9)}px Inter, sans-serif`; x.fillStyle = 'rgba(200,215,235,0.8)';
      [[b.x, 'A'], [b.x + b.w, 'B']].forEach(([gx, t]) => { const cx = X({ x: gx }), cy = Y({ y: b.y + b.h }) + 8 * px; x.beginPath(); x.arc(cx, cy, 2 * px, 0, Math.PI * 2); x.stroke(); x.fillText(t, cx, cy); });
      [[b.y, '1'], [b.y + b.h, '2']].forEach(([gy, t]) => { const cx = X({ x: b.x + b.w }) + 8 * px, cy = Y({ y: gy }); x.beginPath(); x.arc(cx, cy, 2 * px, 0, Math.PI * 2); x.stroke(); x.fillText(t, cx, cy); });
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    bp.rotation.x = -Math.PI / 2; bp.position.set(b.x - m + W / 2, -0.36, b.y - m + Hh / 2); bp.renderOrder = -0.5; bp.raycast = () => {};
    this.blueprint = bp; v.root.add(bp);
  }

  // ---------- looks ----------
  apply() {
    const st = this.st;
    this.groups.forEach((g, s) => {
      g.visible = s <= st.step;
      if (!g.userData.anim) { g.position.y = st.explode * this._lift(s); g.scale.y = 1; }
    });
    if (this.blueprint) this.blueprint.visible = st.blueprint;
    this.v.grid.material.opacity = st.grid ? 0.32 : 0;
    this.groups.forEach(g => g.traverse(o => {
      const sys = o.userData.sys; if (!sys) return;
      const m = o.userData.member || {};
      if (o.userData.edge) return;
      // the finished look hides what ends up inside the walls, floors and ceilings
      const buried = m.type === 'inst' || m.type === 'pipe' || m.type === 'duct' || m.type === 'truss' || m.steelPart || m.sheath || m.film || m.sys === 'rebar' || m.sys === 'found' || (m.sys === 'hvac' && m.type === 'box' && !/condenser/i.test(m.label || ''));
      const hide = st.hidden.has(sys) || (st.finished && buried);
      if (o.isMesh) {
        o.visible = !hide;
        const color = this.color[sys] || '#999';
        let mat;
        if (st.finished) mat = o.userData.real;
        else if (st.sel && sys !== st.sel) mat = this.sysMat(GHOST, 'ghost');
        else if (st.sel) mat = this.sysMat(color, o.userData.skin ? 'litSkin' : 'lit');
        else mat = this.sysMat(color, o.userData.skin || sys === 'exist' ? 'skin' : 'solid');
        o.material = mat; o.castShadow = !(st.sel && sys !== st.sel);
        o.children.forEach(e => { if (e.userData.edge) e.visible = !st.finished && (!st.sel || sys !== st.sel || e.userData.grid); });
      }
    }));
    this.v.render();
  }
  _lift(step) { return step <= 0 ? 0 : (step - 1) * 2.4; }
  select(id) { this.st.sel = id || null; this.apply(); }
  toggle(id, on) { if (on) this.st.hidden.delete(id); else this.st.hidden.add(id); this.apply(); }
  set(k, val) { this.st[k] = val; if (k === 'cut') this.cutaway(val); else this.apply(); }
  cutaway(f) {
    const r = this.v.renderer;
    if (f >= 0.999) { r.clippingPlanes = []; this.v.render(); return; }
    const box = new THREE.Box3(); this.groups.forEach(g => { if (g.visible) box.expandByObject(g); });
    const y0 = Math.max(-2, box.min.y), y1 = box.max.y, h = y0 + (y1 - y0) * f;
    r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), h)];
    this.v.render();
  }
  // explode / un-explode smoothly
  explode(on) {
    const from = this.st.explode, to = on ? 1 : 0, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 700), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; this.st.explode = from + (to - from) * e; this.apply(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // show steps up to n; the newest step drops or rises into place
  setStep(n, animate, ms = 900) {
    const prev = this.st.step; this.st.step = n;
    const g = this.groups[n];
    if (!animate || n <= prev || !g) { this.groups.forEach(x => { x.userData.anim = false; }); this.apply(); return; }
    const rise = [6, 9, 10, 11, 13].includes(n), base = this.st.explode * this._lift(n), t0 = performance.now();
    g.userData.anim = true; this.apply();
    const back = x => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    const tick = now => {
      if (!g.userData.anim) return;
      const k = Math.min(1, (now - t0) / ms);
      if (rise) { g.scale.y = Math.max(0.001, 1 - Math.pow(1 - k, 3)); g.position.y = base; }
      else { g.position.y = base + 9 * (1 - back(k)); }
      this.v.render();
      if (k < 1) requestAnimationFrame(tick); else { g.userData.anim = false; g.scale.y = 1; g.position.y = base; this.v.render(); }
    };
    requestAnimationFrame(tick);
  }

  // ---------- hover / click ----------
  hit(e) {
    const v = this.v; v.ray.setFromCamera(v._ndc(e), v.camera);
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const hits = v.ray.intersectObjects(this.groups, true).filter(h => h.object.isMesh && h.object.userData.sys && shown(h.object) && !this._clipped(h.point));
    const sel = this.st.sel;
    return (sel && hits.find(h => h.object.userData.sys === sel)) || hits.find(h => h.object.material && !(h.object.material.opacity < 0.2)) || hits[0] || null;
  }
  _clipped(p) { const cp = this.v.renderer.clippingPlanes[0]; return cp ? cp.distanceToPoint(p) < 0 : false; }
}
