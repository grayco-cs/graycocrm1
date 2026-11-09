// PlanBuilder 3D view: builds a Three.js scene from the project (walls with real openings,
// floors, doors, windows, placed products, roofs) and lets you orbit, walk and pick.
// Plan (x, y) maps to 3D (x, z); height is 3D y. 1 unit = 1 foot.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { wallLength, wallPieces, wallHeight, wallOpenings, pointInPoly, roofTriangles, bbox, lerp } from './geom.js';
import { findProduct } from './catalog.js';
import { FLOOR_DEPTH } from './model.js';

export class View3D {
  constructor(container, app) {
    this.el = container; this.app = app;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dfe8ef');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    this.camera.position.set(60, 50, 80);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.render());
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.texCache = new Map();
    this.matCache = new Map();
    this.opts = { showRoof: true, upTo: -1, cutaway: false, ceilings: false };
    this._lights();
    this._ground();
    this.ray = new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown', e => { this._down = { x: e.clientX, y: e.clientY }; });
    this.renderer.domElement.addEventListener('pointerup', e => { if (this._down && Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) < 4) this.pick(e); });
    this.walk = null;
    this._keys = new Set();
    window.addEventListener('keydown', e => { if (this.walk && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) this._keys.add(e.code); });
    window.addEventListener('keyup', e => this._keys.delete(e.code));
    this.resize();
    const loop = () => { requestAnimationFrame(loop); if (!this.visible) return; if (this.walk) this._walkStep(); if (this.controls.enabled) this.controls.update(); };
    loop();
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f80, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-80, 140, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 1; sc.far = 500;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    this.sun = sun; this.scene.add(sun); this.scene.add(sun.target);
  }
  _ground() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#9fb38a', roughness: 1 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -FLOOR_DEPTH - 0.02; g.receiveShadow = true; g.userData.ground = true;
    this.ground = g; this.scene.add(g);
    const grid = new THREE.GridHelper(400, 80, 0x7f9170, 0x8fa27e); grid.position.y = -FLOOR_DEPTH - 0.01; grid.material.transparent = true; grid.material.opacity = 0.35;
    this.scene.add(grid);
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.renderer.setSize(r.width, r.height, false);
    this.renderer.domElement.style.width = r.width + 'px'; this.renderer.domElement.style.height = r.height + 'px';
    this.camera.aspect = r.width / r.height; this.camera.updateProjectionMatrix();
    this.render();
  }
  render() { this.renderer.render(this.scene, this.camera); }

  // ---------- materials ----------
  tex(product) {
    if (!product || !product.texture) return null;
    let t = this.texCache.get(product.texture);
    if (!t) {
      t = new THREE.TextureLoader().load(product.texture, () => this.render());
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
      this.texCache.set(product.texture, t);
    }
    return t;
  }
  mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    let m = this.matCache.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide }); this.matCache.set(key, m); }
    return m;
  }
  productMat(productId, fallback, repeatFt = 2, opts = {}) {
    const p = findProduct(this.app.catalog, productId);
    const color = p ? p.color : fallback;
    const t = this.tex(p);
    if (!t) return this.mat(color, opts);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: opts.side ?? THREE.FrontSide });
    m.userData.repeatFt = p.textureSize || repeatFt;
    return m;
  }

  // ---------- build ----------
  rebuild() {
    const P = this.app.project; if (!P) return;
    if (this._anim) this.stopBuild();
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.root.clear();
    const upTo = this.opts.upTo < 0 ? P.levels.length - 1 : Math.min(this.opts.upTo, P.levels.length - 1);
    P.levels.forEach((level, li) => {
      if (li > upTo) return;
      const g = new THREE.Group(); g.position.y = level.elevation; g.userData.levelId = level.id;
      this._stage = li * 10;
      this.buildLevel(level, g, li === upTo && this.opts.cutaway);
      this.root.add(g);
    });
    if (this.opts.showRoof && !this.opts.cutaway) {
      P.roofs.forEach(sec => {
        const li = P.levels.findIndex(l => l.id === sec.levelId); if (li < 0 || li > upTo) return;
        this.buildRoof(sec, P.levels[li]);
      });
    }
    this.render();
  }

  outsideSign(w, level) {
    // +1 when the wall's left normal (plan) points outside, -1 when inside
    const L = wallLength(w) || 1, n = { x: (w.b.y - w.a.y) / L * -1, y: (w.b.x - w.a.x) / L };   // n = (-dy, dx) = right/inside for clockwise
    const m = lerp(w.a, w.b, 0.5), off = (w.thickness || 0.5) / 2 + 0.6;
    const p1 = { x: m.x + n.x * off, y: m.y + n.y * off }, p2 = { x: m.x - n.x * off, y: m.y - n.y * off };
    const in1 = level.rooms.some(r => pointInPoly(p1, r.points)), in2 = level.rooms.some(r => pointInPoly(p2, r.points));
    if (in1 !== in2) return in1 ? 1 : -1;
    const pts = []; level.walls.forEach(x => pts.push(x.a, x.b));
    const b = bbox(pts), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    return ((c.x - m.x) * n.x + (c.y - m.y) * n.y) >= 0 ? 1 : -1;
  }
  roomAt(p, level) { return level.rooms.find(r => pointInPoly(p, r.points)) || null; }

  buildLevel(level, g, cut) {
    const P = this.app.project, s = P.settings;
    const tag = (o, step, kind) => { o.userData.build = { stage: (this._stage || 0) + step, kind }; return o; };
    // subfloor / slab under the walls and inside rooms (not under yards, patios and drives)
    const pts = []; level.walls.forEach(w => pts.push(w.a, w.b)); level.rooms.filter(r => !r.outdoor).forEach(r => pts.push(...r.points));
    if (pts.length) {
      const b = bbox(pts), pad = 0.35;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w + pad * 2, FLOOR_DEPTH, b.h + pad * 2), this.mat('#b9b5ab'));
      slab.position.set(b.x + b.w / 2, -FLOOR_DEPTH / 2, b.y + b.h / 2); slab.receiveShadow = true; slab.castShadow = true;
      g.add(tag(slab, 0, 'grow'));
    }
    // floors
    level.rooms.forEach(r => {
      const shape = new THREE.Shape(r.points.map(p => new THREE.Vector2(p.x, -p.y)));
      const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
      const m = this.productMat(r.floorId, '#cccccc', 2);
      if (m.map) this._uvPlanar(geo, m.userData.repeatFt || 2);
      const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true;
      // outside areas sit on the ground (first level only); rooms sit on the slab
      mesh.position.y = r.outdoor ? (level.elevation > 0 ? 0.02 : -FLOOR_DEPTH + 0.03 + (/deck/i.test(r.name) ? 0.5 : 0)) : 0.02;
      mesh.userData.pick = { kind: 'room', id: r.id, levelId: level.id };
      g.add(tag(mesh, r.outdoor ? 0 : 1, 'rise'));
      if (this.opts.ceilings && !cut && !r.outdoor) {
        const cg = geo.clone(); const cm = new THREE.Mesh(cg, this.productMat(r.ceilingId || s.ceilingFinishId, '#fafafa', 2, { side: THREE.BackSide }));
        cm.position.y = (r.height || level.height) - 0.01; g.add(cm);
      }
    });
    // walls
    const cutH = cut ? Math.min(4, level.height) : null;
    level.walls.forEach(w => {
      const H = wallHeight(w, level), L = wallLength(w);
      if (L < 0.05) return;
      const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const t = w.thickness || 0.5;
      // colours of each face: +z (local) side = plan right of a->b
      const right = { x: -dir.y, y: dir.x };
      const m = lerp(w.a, w.b, 0.5);
      const side = (sg) => ({ x: m.x + right.x * sg * (t / 2 + 0.5), y: m.y + right.y * sg * (t / 2 + 0.5) });
      let matR, matL;
      const roomColor = (pt) => { const r = this.roomAt(pt, level); return r && r.wallFinishId ? this.productMat(r.wallFinishId, '#f1efe9') : this.mat('#efede7'); };
      if (w.exterior) {
        const sg = this.outsideSign(w, level);   // +1: right side (local +z) is inside
        const outM = this.productMat(w.finishOut || s.exteriorFinishId, '#d9d4c5', 4);
        const inM = roomColor(side(sg));
        matR = sg > 0 ? inM : outM; matL = sg > 0 ? outM : inM;
      } else { matR = roomColor(side(1)); matL = roomColor(side(-1)); }
      const edgeM = this.mat('#d8d4cc');
      const mats = [edgeM, edgeM, edgeM, edgeM, matR, matL];
      const pieces = wallPieces(w, level.openings, H);
      pieces.forEach(pc => {
        let z0 = pc.z0, z1 = pc.z1;
        if (cutH != null) { if (z0 >= cutH) return; z1 = Math.min(z1, cutH); }
        const len = pc.u1 - pc.u0, h = z1 - z0; if (len < 0.01 || h < 0.01) return;
        // extend full-height end pieces by half the thickness so corners close
        let u0 = pc.u0, u1 = pc.u1;
        if (u0 < 0.001) u0 -= t / 2; if (u1 > L - 0.001) u1 += t / 2;
        const geo = new THREE.BoxGeometry(u1 - u0, h, t);
        if (matR.map || matL.map) this._uvBox(geo, u1 - u0, h, (matR.userData.repeatFt || 4));
        const mesh = new THREE.Mesh(geo, mats);
        const cu = (u0 + u1) / 2;
        mesh.position.set(w.a.x + dir.x * cu, z0 + h / 2, w.a.y + dir.y * cu);
        mesh.rotation.y = -ang;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.pick = { kind: 'wall', id: w.id, levelId: level.id };
        g.add(tag(mesh, 2, 'grow'));
      });
      // door and window bodies
      wallOpenings(w, level.openings).forEach(sp => this.buildOpening(sp, w, ang, dir, t, H, g, level, cutH));
    });
    // placed products
    level.items.forEach(it => this.buildItem(it, g, level));
  }
  _tag(o, step, kind) { o.userData.build = { stage: (this._stage || 0) + step, kind }; return o; }

  buildOpening(sp, w, ang, dir, t, H, g, level, cutH) {
    const o = sp.o, p = findProduct(this.app.catalog, o.productId);
    const width = sp.u1 - sp.u0, sill = o.sill || 0, top = Math.min(H, sill + o.height), h = top - sill;
    if (cutH != null && sill >= cutH) return;
    const cu = (sp.u0 + sp.u1) / 2;
    const grp = new THREE.Group();
    grp.position.set(w.a.x + dir.x * cu, sill + h / 2, w.a.y + dir.y * cu);
    grp.rotation.y = -ang;
    grp.userData.pick = { kind: 'opening', id: o.id, levelId: level.id };
    const color = p ? p.color : '#ffffff';
    const frameM = this.mat(o.type === 'window' || o.type === 'slider' ? '#f4f4f4' : '#efefea');
    const fr = 0.15;
    const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.userData.pick = grp.userData.pick; grp.add(mesh); return mesh; };
    // frame
    add(new THREE.BoxGeometry(width, fr, t + 0.05), frameM, 0, h / 2 - fr / 2, 0);
    if (sill > 0) add(new THREE.BoxGeometry(width + 0.2, fr, t + 0.25), frameM, 0, -h / 2 + fr / 2, 0);
    add(new THREE.BoxGeometry(fr, h, t + 0.05), frameM, -width / 2 + fr / 2, 0, 0);
    add(new THREE.BoxGeometry(fr, h, t + 0.05), frameM, width / 2 - fr / 2, 0, 0);
    const glass = this.mat('#9ec7e8', { opacity: 0.35, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
    if (o.type === 'window') {
      add(new THREE.BoxGeometry(width - fr * 2, h - fr * 2, 0.04), glass, 0, 0, 0);
      add(new THREE.BoxGeometry(width - fr * 2, 0.08, 0.1), frameM, 0, 0, 0);   // meeting rail
    } else if (o.type === 'slider') {
      add(new THREE.BoxGeometry(width - fr * 2, h - fr, 0.04), glass, 0, -fr / 2, 0);
      add(new THREE.BoxGeometry(0.1, h - fr, 0.1), frameM, 0, -fr / 2, 0);
    } else if (o.type === 'door') {
      const leaf = add(new THREE.BoxGeometry(width - fr * 2, h - fr, 0.15), this.mat(color, { roughness: 0.6 }), 0, -fr / 2, 0);
      // open slightly so the space reads
      const hingeX = (o.hinge === 'right' ? 1 : -1) * (width / 2 - fr);
      const pivot = new THREE.Group(); pivot.position.set(hingeX, 0, 0); grp.add(pivot);
      grp.remove(leaf); leaf.position.set(-hingeX, -fr / 2, 0); pivot.add(leaf);
      pivot.rotation.y = -(o.flip ? -1 : 1) * (o.hinge === 'right' ? -1 : 1) * 0.35;   // same side as the swing arc on the plan
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), this.mat('#b08d57', { metalness: 0.8, roughness: 0.3 }));
      knob.position.set(-hingeX * 1.8, -0.6, 0.12); pivot.add(knob);
    } else if (o.type === 'garage') {
      const panel = add(new THREE.BoxGeometry(width - fr * 2, h - fr, 0.2), this.mat(color, { roughness: 0.5 }), 0, -fr / 2, 0);
      void panel;
      for (let i = 1; i < 4; i++) add(new THREE.BoxGeometry(width - fr * 2, 0.05, 0.24), this.mat('#c9c7c0'), 0, -h / 2 + (h * i) / 4, 0);
    }
    g.add(this._tag(grp, 3, 'pop'));
  }

  buildItem(it, g, level) {
    const p = findProduct(this.app.catalog, it.productId);
    const color = p ? p.color : '#999999';
    const type = p ? (p.objType || 'box') : 'box';
    const grp = new THREE.Group();
    grp.position.set(it.x, it.elev || 0, it.y);
    grp.rotation.y = -it.rot * Math.PI / 180;
    grp.userData.pick = { kind: 'item', id: it.id, levelId: level.id };
    const m = this.productMat(it.productId, color, 2, { roughness: 0.6 });
    const add = (geo, mat, x, y, z) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.pick = grp.userData.pick; grp.add(mesh); return mesh; };
    const W = it.w, D = it.d, H = it.h;
    if (type === 'base') {
      add(new THREE.BoxGeometry(W, H - 0.15, D - 0.1), m, 0, (H - 0.15) / 2, 0.05);
      add(new THREE.BoxGeometry(W + 0.05, 0.15, D + 0.05), this.mat('#e9e6e0', { roughness: 0.3 }), 0, H - 0.075, 0);
      add(new THREE.BoxGeometry(W - 0.1, 0.35, 0.02), this.mat('#222'), 0, 0.2, D / 2 - 0.04);  // toe kick shadow
    } else if (type === 'upper') {
      add(new THREE.BoxGeometry(W, H, D), m, 0, H / 2, 0);
    } else if (type === 'cyl') {
      add(new THREE.CylinderGeometry(Math.min(W, D) / 2, Math.min(W, D) / 2, H, 24), m, 0, H / 2, 0);
    } else if (type === 'toilet') {
      add(new THREE.BoxGeometry(W * 0.95, H * 0.55, D * 0.25), m, 0, H * 0.72, -D * 0.37);
      const bowl = add(new THREE.CylinderGeometry(W * 0.36, W * 0.26, H * 0.55, 20), m, 0, H * 0.275, D * 0.1); bowl.scale.z = 1.35;
    } else if (type === 'tub') {
      add(new THREE.BoxGeometry(W, H, D), m, 0, H / 2, 0);
      add(new THREE.BoxGeometry(W - 0.4, 0.05, D - 0.4), this.mat('#cfe3ee', { roughness: 0.2 }), 0, H + 0.01, 0);
    } else if (type === 'panel') {          // backsplash, tile wall, fireplace surround: width × height, thin
      add(new THREE.BoxGeometry(W, H, Math.max(0.04, D)), m, 0, H / 2, 0);
    } else if (type === 'tree') {
      const trunkH = H * 0.35;
      add(new THREE.CylinderGeometry(Math.max(0.15, W * 0.04), Math.max(0.2, W * 0.06), trunkH, 10), this.mat('#6b4a32'), 0, trunkH / 2, 0);
      const crown = add(new THREE.IcosahedronGeometry(1, 1), this.mat(color, { roughness: 1 }), 0, trunkH + (H - trunkH) / 2, 0);
      crown.scale.set(W / 2, (H - trunkH) / 2, D / 2);
    } else if (type === 'shrub') {
      const b = add(new THREE.IcosahedronGeometry(1, 1), this.mat(color, { roughness: 1 }), 0, H / 2, 0); b.scale.set(W / 2, H / 2, D / 2);
    } else if (type === 'fence') {           // fences, railings, edging, retaining walls: a run W long
      const posts = Math.max(2, Math.round(W / 8) + 1);
      add(new THREE.BoxGeometry(W, H * 0.9, Math.max(0.06, D * 0.4)), m, 0, H * 0.45 + 0.05, 0);
      if (H > 1.5) for (let i = 0; i < posts; i++) add(new THREE.BoxGeometry(0.33, H, 0.33), m, -W / 2 + (W * i) / (posts - 1), H / 2, 0);
    } else if (type === 'pergola') {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(new THREE.BoxGeometry(0.5, H, 0.5), m, sx * (W / 2 - 0.5), H / 2, sz * (D / 2 - 0.5)));
      for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.17, 0.6, D + 1), m, -W / 2 + (W * i) / 8, H + 0.3, 0);
      [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.3, 0.8, D + 1.5), m, sx * (W / 2 - 0.5), H - 0.4, 0));
    } else if (type === 'shower') {
      add(new THREE.BoxGeometry(W, 0.3, D), this.mat('#ffffff'), 0, 0.15, 0);
      add(new THREE.BoxGeometry(W, H, 0.04), this.mat('#bfe0ef', { opacity: 0.3, side: THREE.DoubleSide }), 0, H / 2, D / 2);
    } else {
      add(new THREE.BoxGeometry(W, H, D), m, 0, H / 2, 0);
    }
    if (p && ['landscape', 'hardscape', 'outdoor'].includes(p.category) && level.elevation === 0) grp.position.y -= FLOOR_DEPTH * (this._onSlab(it, level) ? 0 : 1);
    g.add(this._tag(grp, 4, type === 'tree' || type === 'shrub' ? 'pop' : 'drop'));
  }
  // Is a placed item inside a (non-outdoor) room, i.e. standing on the slab rather than the ground?
  _onSlab(it, level) { return level.rooms.some(r => !r.outdoor && pointInPoly({ x: it.x, y: it.y }, r.points)); }

  buildRoof(sec, level) {
    const P = this.app.project, s = P.settings;
    const base = level.elevation + level.height;
    const grp = new THREE.Group(); grp.userData.pick = { kind: 'roof', id: sec.id, levelId: level.id };
    grp.userData.build = { stage: 1000, kind: 'lower' };
    const roofM = this.productMat(sec.materialId, '#4a4a4a', 3, { side: THREE.DoubleSide, roughness: 0.9 });
    const sideM = this.productMat(s.exteriorFinishId, '#d9d4c5', 4, { side: THREE.DoubleSide });
    if (sec.style === 'flat') {
      const o = sec.overhang || 0, t = 0.8;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(sec.w + 2 * o, t, sec.d + 2 * o), this.productMat(sec.materialId, '#e5e5e5', 3));
      deck.position.set(sec.x + sec.w / 2, base + t / 2, sec.y + sec.d / 2); deck.castShadow = true; deck.receiveShadow = true; deck.userData.pick = grp.userData.pick; grp.add(deck);
      const ph = sec.parapet || 0;
      if (ph > 0) {
        const pt = 0.5, cap = this.mat('#b8bcc0');
        [[sec.w + pt, ph, pt, sec.x + sec.w / 2, sec.y], [sec.w + pt, ph, pt, sec.x + sec.w / 2, sec.y + sec.d], [pt, ph, sec.d + pt, sec.x, sec.y + sec.d / 2], [pt, ph, sec.d + pt, sec.x + sec.w, sec.y + sec.d / 2]].forEach(([a, b, c, x, z]) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), [sideM, sideM, cap, cap, sideM, sideM]); m.position.set(x, base + t + b / 2 - t, z); m.castShadow = true; m.userData.pick = grp.userData.pick; grp.add(m);
        });
      }
    } else {
      const { faces, gables } = roofTriangles(sec, base);
      const mk = (tris, m) => {
        const pos = []; tris.forEach(tri => tri.forEach(p => pos.push(p.x, p.z, p.y)));
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
        if (m.map) this._uvPlanar(geo, m.userData.repeatFt || 3, true);
        const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.pick = grp.userData.pick; return mesh;
      };
      grp.add(mk(faces, roofM));
      if (gables.length) grp.add(mk(gables, sideM));
    }
    this.root.add(grp);
  }

  // ---------- build animation ----------
  // Rebuilds the model and plays it going up: slab, floors, walls rising in a sweep, doors and windows
  // popping in, products dropping into place, then the roof settling on, while the camera circles slowly.
  playBuild(opts = {}) {
    this.rebuild();
    const items = [];
    this.root.traverse(o => { if (o.userData.build) items.push(o); });
    if (!items.length) return;
    const world = new THREE.Vector3();
    items.forEach(o => {
      o.getWorldPosition(world);
      o.userData.anim = { pos: o.position.clone(), scale: o.scale.clone(), key: world.x + world.z, h: (o.geometry && o.geometry.parameters && o.geometry.parameters.height) || 1 };
    });
    const speed = opts.speed || 1;
    const stages = [...new Set(items.map(o => o.userData.build.stage))].sort((a, b) => a - b);
    const plan = { kind: {}, start: new Map(), dur: new Map() };
    let t = 0.15;
    stages.forEach(st => {
      const list = items.filter(o => o.userData.build.stage === st).sort((a, b) => a.userData.anim.key - b.userData.anim.key);
      const kind = list[0].userData.build.kind;
      const base = { grow: 0.75, rise: 0.6, pop: 0.45, drop: 0.7, lower: 1.3 }[kind] || 0.6;
      const spread = kind === 'grow' && st % 10 === 2 ? 2.4 : kind === 'pop' ? 1.1 : kind === 'drop' ? 1.4 : kind === 'rise' ? 0.6 : 0;
      const stagger = list.length > 1 ? Math.min(0.09, spread / (list.length - 1)) : 0;
      list.forEach((o, i) => { plan.start.set(o, (t + i * stagger) / speed); plan.dur.set(o, base / speed); });
      t += base + stagger * Math.max(0, list.length - 1) - (kind === 'lower' ? 0 : 0.2);
    });
    const total = (t + 0.2) / speed;
    // camera: orbit about 70° around the model while it builds
    const target = this.controls.target.clone();
    const off = this.camera.position.clone().sub(target);
    const r0 = Math.hypot(off.x, off.z), a0 = Math.atan2(off.z, off.x), y0 = off.y;
    const sweep = opts.sweep ?? (70 * Math.PI / 180);
    const ease = x => 1 - Math.pow(1 - x, 3);
    const back = x => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    const inout = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const apply = (o, p) => {
      const a = o.userData.anim, k = o.userData.build.kind;
      if (p <= 0) { o.visible = false; return; }
      o.visible = true;
      if (k === 'grow') { const e = Math.max(0.001, ease(p)); o.scale.y = a.scale.y * e; o.position.y = a.pos.y - a.h / 2 + (a.h * e) / 2; }
      else if (k === 'rise') { o.position.y = a.pos.y - 0.8 * (1 - ease(p)); }
      else if (k === 'pop') { const e = Math.max(0.001, back(p)); o.scale.set(a.scale.x * e, a.scale.y * e, a.scale.z * e); }
      else if (k === 'drop') { o.position.y = a.pos.y + 7 * (1 - back(p)); }
      else if (k === 'lower') { o.position.y = a.pos.y + 14 * (1 - ease(p)); }
    };
    items.forEach(o => apply(o, 0));
    this.controls.enabled = false;
    const t0 = performance.now();
    const anim = { items, done: false };
    this._anim = anim;
    const frame = now => {
      if (anim.done) return;
      const el = (now - t0) / 1000;
      items.forEach(o => apply(o, Math.min(1, (el - plan.start.get(o)) / plan.dur.get(o))));
      const c = inout(Math.min(1, el / total)), ang = a0 + sweep * c;
      this.camera.position.set(target.x + Math.cos(ang) * r0, target.y + y0, target.z + Math.sin(ang) * r0);
      this.camera.lookAt(target);
      this.render();
      if (el >= total) { this.stopBuild(); if (opts.onDone) opts.onDone(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // a click on the 3D view skips to the finished model
    this._skip = () => this.stopBuild();
    this.renderer.domElement.addEventListener('pointerdown', this._skip, { once: true });
  }
  stopBuild() {
    const anim = this._anim; if (!anim) return;
    anim.done = true; this._anim = null;
    anim.items.forEach(o => { const a = o.userData.anim; if (!a) return; o.visible = true; o.position.copy(a.pos); o.scale.copy(a.scale); });
    if (this._skip) this.renderer.domElement.removeEventListener('pointerdown', this._skip);
    this.controls.enabled = !this.walk;
    this.controls.update();
    this.render();
  }
  get building() { return !!this._anim; }

  _uvPlanar(geo, repeatFt, useXZ) {
    const pos = geo.attributes.position, uv = [];
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); uv.push(x / repeatFt, (useXZ ? z + y : z) / repeatFt); }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  _uvBox(geo, len, h, repeatFt) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / repeatFt, uv.getY(i) * h / repeatFt);
  }

  // ---------- camera ----------
  fit() {
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) { this.camera.position.set(40, 40, 60); this.controls.target.set(0, 0, 0); this.render(); return; }
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, size.y * 1.5) * 0.9 + 10;
    this.controls.target.copy(c);
    this.camera.position.set(c.x + r * 0.75, c.y + r * 0.75, c.z + r * 1.0);
    this.sun.position.set(c.x - 80, 140, c.z + 60); this.sun.target.position.copy(c);
    this.controls.update(); this.render();
  }
  setPreset(name) {
    const box = new THREE.Box3().setFromObject(this.root); if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 1.1 + 10;
    this.controls.target.copy(c);
    const pos = { front: [0, size.y * 0.3, r], back: [0, size.y * 0.3, -r], left: [-r, size.y * 0.3, 0], right: [r, size.y * 0.3, 0], top: [0.01, r * 1.4, 0.01], iso: [r * 0.7, r * 0.7, r * 0.9] }[name] || [r, r, r];
    this.camera.position.set(c.x + pos[0], c.y + pos[1], c.z + pos[2]);
    this.controls.update(); this.render();
  }

  // Walk-through: eye at 5'6", WASD / arrows to move, drag to look.
  toggleWalk(on) {
    if (on && !this.walk) {
      const L = this.app.level; const r = L.rooms[0];
      const start = r ? (() => { const b = bbox(r.points); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; })() : { x: 0, y: 0 };
      this.walk = { yaw: 0, pitch: 0, eye: L.elevation + 5.5 };
      this.camera.position.set(start.x, this.walk.eye, start.y);
      this.controls.enabled = false;
      const el = this.renderer.domElement;
      this._look = e => { if (e.buttons !== 1) return; this.walk.yaw -= e.movementX * 0.004; this.walk.pitch = Math.max(-1.2, Math.min(1.2, this.walk.pitch - e.movementY * 0.004)); };
      el.addEventListener('pointermove', this._look);
      this._walkStep();
    } else if (!on && this.walk) {
      this.renderer.domElement.removeEventListener('pointermove', this._look);
      this.walk = null; this.controls.enabled = true; this.fit();
    }
  }
  _walkStep() {
    const w = this.walk, k = this._keys, sp = k.has('ShiftLeft') ? 0.6 : 0.25;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const cam = this.camera;
    cam.position.x += (-Math.sin(w.yaw) * fwd + Math.cos(w.yaw) * str) * sp;
    cam.position.z += (-Math.cos(w.yaw) * fwd - Math.sin(w.yaw) * str) * sp;
    cam.position.y = w.eye;
    cam.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
    this.render();
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hits = this.ray.intersectObjects(this.root.children, true);
    const h = hits.find(x => x.object.userData.pick);
    if (h) this.app.pickFrom3D(h.object.userData.pick); else this.app.select(null);
  }

  screenshot() { this.render(); return this.renderer.domElement.toDataURL('image/png'); }

  async exportGLB() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    return new Promise((res, rej) => new GLTFExporter().parse(this.root, r => res(new Blob([r], { type: 'model/gltf-binary' })), rej, { binary: true }));
  }
}
