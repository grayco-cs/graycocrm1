// PlanBuilder 3D view: builds a Three.js scene from the project (walls with real openings,
// floors, doors, windows, placed products, roofs) and lets you orbit, walk and pick.
// Plan (x, y) maps to 3D (x, z); height is 3D y. 1 unit = 1 foot.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surfaceKind, surfaceSpec, surfaceCanvas } from './surfaces.js';
import { wallLength, wallPieces, wallHeight, wallOpenings, pointInPoly, roofTriangles, bbox, lerp, projectOnSeg, polyArea, centroid, ridgeAxis as ridgeAxisOf } from './geom.js';
import { findProduct } from './catalog.js';
import { FLOOR_DEPTH, wallsAtPoint } from './model.js';
import { StudioScene } from './studio3d.js';

function shade(hex, k) {
  const n = parseInt(String(hex).replace('#', ''), 16); if (!isFinite(n)) return hex;
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// A box with softly rounded edges (radius clamped to fit), so nothing in the model looks blocky.
function RB(w, h, d, r = 0.07) {
  const m = Math.min(w, h, d) / 2 - 0.002;
  const rr = Math.max(0.001, Math.min(r, m));
  return rr < 0.012 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 3, rr);
}

export class View3D {
  constructor(container, app) {
    this.el = container; this.app = app;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.fullRatio = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.fullRatio);
    this.renderer.shadowMap.enabled = true;
    // Shadows are redrawn only when the model changes, not when the camera moves.
    this.renderer.shadowMap.autoUpdate = false; this._shadowDirty = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    // soft image-based light (reflections on glass, counters, metal) from a studio room
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;
    this._sky();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    this.camera.position.set(60, 50, 80);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this._cameraMoved());
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.texCache = new Map();
    this.matCache = new Map();
    this.opts = { showRoof: true, upTo: -1, cutaway: false, ceilings: false, phaseView: 'after', highlightNew: false, damage: false, holo: false, spin: false, studio: false };
    this._lights();
    this._ground();
    this.ray = new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown', e => this._pDown(e));
    this.renderer.domElement.addEventListener('pointermove', e => this._pMove(e));
    this.renderer.domElement.addEventListener('pointerup', e => this._pUp(e));
    this.renderer.domElement.addEventListener('dblclick', e => { if (this.walk || this._anim) return; const h = this._hits(e)[0]; if (h) this.focusOn(h.object.userData.pick); });
    this.roomLight = new THREE.PointLight(0xffe6c2, 0, 45, 1.4); this.roomLight.castShadow = false; this.scene.add(this.roomLight);
    this.walk = null;
    this._keys = new Set();
    window.addEventListener('keydown', e => { if (this.walk && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) this._keys.add(e.code); });
    window.addEventListener('keyup', e => this._keys.delete(e.code));
    this.resize();
    const loop = () => { requestAnimationFrame(loop); if (!this.visible) return; if (this.walk) this._walkStep(); if (this.controls.enabled) this.controls.update(); };
    loop();
  }

  // Gradient sky dome and distance haze.
  _sky() {
    const geo = new THREE.SphereGeometry(2400, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#5d8fd6') }, mid: { value: new THREE.Color('#cfe0f2') }, bottom: { value: new THREE.Color('#e9eef2') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(geo, this.skyMat); this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#d9e4ee', 260, 1400);
  }
  _lights() {
    this.hemi = new THREE.HemisphereLight(0xeaf2ff, 0x5b6450, 0.85); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff3e2, 2.6);
    sun.position.set(-80, 140, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 3;
    const sc = sun.shadow.camera; sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 1; sc.far = 500;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    this.sun = sun; this.scene.add(sun); this.scene.add(sun.target);
  }
  _ground() {
    const gt = new THREE.CanvasTexture(surfaceCanvas('grass', '#7f9b62', 'ground'));
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(2000 / 6, 2000 / 6); gt.colorSpace = THREE.SRGBColorSpace; gt.anisotropy = 8;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#ffffff', map: gt, roughness: 1 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -FLOOR_DEPTH - 0.02; g.receiveShadow = true; g.userData.ground = true;
    this.ground = g; this.scene.add(g);
    const grid = new THREE.GridHelper(600, 120, 0x39e1ff, 0x1d5f8f); grid.position.y = -FLOOR_DEPTH - 0.01; grid.material.transparent = true; grid.material.opacity = 0.0;
    this.grid = grid; this.scene.add(grid);
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.renderer.setSize(r.width, r.height, false);
    this.renderer.domElement.style.width = r.width + 'px'; this.renderer.domElement.style.height = r.height + 'px';
    if (this.camera.isOrthographicCamera) { const h = this.camera.userData.h || 40, a = r.width / r.height; Object.assign(this.camera, { left: -h * a, right: h * a, top: h, bottom: -h }); }
    else this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(r.width, r.height); }
    this.render();
  }
  render(cameraOnly) {
    if (!cameraOnly) this._shadowDirty = true;
    this.renderer.shadowMap.needsUpdate = this._shadowDirty; this._shadowDirty = false;
    if (this.opts.holo && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  // Orbit / zoom / pan: one draw per screen frame, at a lower resolution while moving, sharp again when it stops.
  _cameraMoved() {
    clearTimeout(this._sharpT); this._sharpT = setTimeout(() => this._sharpen(), 220);
    if (this.fullRatio > 1 && !this._lowRes) { this._lowRes = true; this._setRatio(1); this.render(true); return; }   // resizing clears the canvas, so draw now
    if (this._camRaf) return;
    this._camRaf = requestAnimationFrame(() => { this._camRaf = 0; this.render(true); });
  }
  _sharpen() { clearTimeout(this._sharpT); if (!this._lowRes) return; this._lowRes = false; this._setRatio(this.fullRatio); this.render(true); }
  _setRatio(r) {
    this.renderer.setPixelRatio(r);
    if (this.composer) { const s = this.el.getBoundingClientRect(); this.composer.setPixelRatio(r); this.composer.setSize(s.width, s.height); }
  }
  // Glow for the Holo view (loaded the first time it is used).
  async _bloom() {
    if (this.composer) return;
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
    const r = this.el.getBoundingClientRect();
    const c = new EffectComposer(this.renderer); c.setSize(r.width, r.height);
    c.addPass(new RenderPass(this.scene, this.camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(r.width, r.height), 0.9, 0.55, 0.05));
    c.addPass(new OutputPass());
    this.composer = c;
  }
  // Holo: a glowing wireframe-and-glass look on a dark blueprint background.
  async setHolo(on) {
    this.opts.holo = !!on;
    if (on) await this._bloom();
    this.skyMat.uniforms.top.value.set(on ? '#03060f' : '#5d8fd6'); this.skyMat.uniforms.mid.value.set(on ? '#081a33' : '#cfe0f2'); this.skyMat.uniforms.bottom.value.set(on ? '#050b18' : '#e9eef2');
    this.scene.fog.color.set(on ? '#06101f' : '#d9e4ee');
    this.ground.visible = !on; this.grid.material.opacity = on ? 0.35 : 0;
    this.rebuild();
  }
  _holoize() {
    const fill = this._holoFill || (this._holoFill = new THREE.MeshBasicMaterial({ color: '#0f3a6b', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    const line = this._holoLine || (this._holoLine = new THREE.LineBasicMaterial({ color: '#46e3ff', transparent: true, opacity: 0.85 }));
    const accent = this._holoAccent || (this._holoAccent = new THREE.LineBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.95 }));
    const meshes = []; this.root.traverse(o => { if (o.isMesh) meshes.push(o); });
    meshes.forEach(o => {
      const pk = o.userData.pick || {};
      o.material = fill; o.castShadow = false;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), pk.kind === 'item' || pk.kind === 'opening' ? accent : line);
      e.userData.pick = o.userData.pick; e.raycast = () => {};
      o.add(e);
    });
  }
  // Studio: dark stage, no sky or grass, systems drawn by StudioScene.
  setStudio(on) {
    this.opts.studio = !!on;
    if (!this.studio) this.studio = new StudioScene(this);
    if (on && this.opts.holo) { this.opts.holo = false; }
    this.sky.visible = !on; this.ground.visible = !on && !this.opts.holo;
    this.scene.background = on ? new THREE.Color('#0b0d11') : null;
    this.scene.fog.color.set(on ? '#0b0d11' : this.opts.holo ? '#06101f' : '#d9e4ee');
    this.scene.fog.near = on ? 400 : 260;
    this.grid.material.opacity = 0;
    this.scene.environmentIntensity = on ? 0.75 : 0.55;
    if (!on) { this.renderer.clippingPlanes = []; if (this.ortho) this.setOrtho(false); }
    this.rebuild();
  }
  // Flat (orthographic) camera, for measured-looking views.
  setOrtho(on) {
    const persp = this.persp || (this.persp = this.camera);
    const t = this.controls.target, cur = this.camera;
    if (on) {
      const o = this.orthoCam || (this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 5000));
      const d = cur.position.distanceTo(t), hh = d * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
      o.userData.h = hh; o.position.copy(cur.position); o.quaternion.copy(cur.quaternion); o.zoom = 1;
      this.camera = o; this.ortho = true;
    } else {
      if (!this.ortho) return;
      persp.position.copy(cur.position); persp.quaternion.copy(cur.quaternion);
      const hh = cur.userData.h / (cur.zoom || 1), d = hh / Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
      persp.position.copy(t).add(cur.position.clone().sub(t).normalize().multiplyScalar(d));
      this.camera = persp; this.ortho = false;
    }
    this.controls.object = this.camera; this.controls.update();
    this.resize();
  }

  // Slowly turn the model like a showroom turntable.
  setSpin(on) { this.opts.spin = !!on; this.controls.autoRotate = !!on; this.controls.autoRotateSpeed = 0.7; this.render(); }

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
    if (t) {
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: opts.side ?? THREE.FrontSide });
      m.userData.repeatFt = p.textureSize || repeatFt;
      return m;
    }
    // a real-looking surface drawn in the product's color
    const kind = surfaceKind(p);
    if (!p || kind === 'plain') return this.mat(color, { ...opts, roughness: opts.roughness ?? 0.88 });
    const key = 'surf|' + p.id + '|' + color + '|' + (opts.side || 0);
    let m = this.matCache.get(key);
    if (!m) {
      const spec = surfaceSpec(kind);
      const tx = new THREE.CanvasTexture(surfaceCanvas(kind, color, p.id));
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const Ctor = kind === 'stoneSlab' ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      m = new Ctor({ map: tx, roughness: spec.roughness, metalness: spec.metal, side: opts.side ?? THREE.FrontSide });
      if (kind === 'stoneSlab') { m.clearcoat = 1; m.clearcoatRoughness = 0.12; }
      m.userData.repeatFt = spec.span;
      this.matCache.set(key, m);
    }
    return m;
  }

  // ---------- build ----------
  rebuild() {
    const P = this.app.project; if (!P) return;
    if (this._anim) this.stopBuild();
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.root.clear();
    if (this.opts.studio) {   // Studio: the construction systems instead of the finished house
      const A = this.app.studioAnalysis && this.app.studioAnalysis();
      if (A) this.studio.build(A);
      this.render(); return;
    }
    const upTo = this.opts.upTo < 0 ? P.levels.length - 1 : Math.min(this.opts.upTo, P.levels.length - 1);
    P.levels.forEach((level, li) => {
      if (li > upTo) return;
      const g = new THREE.Group(); g.position.y = level.elevation; g.userData.levelId = level.id;
      this._stage = li * 10;
      this.buildLevel(this.viewLevel(level), g, li === upTo && this.opts.cutaway);
      this._afterLevel(level, g);
      this.root.add(g);
    });
    if (this.opts.showRoof && !this.opts.cutaway) {
      P.roofs.forEach(sec => {
        const li = P.levels.findIndex(l => l.id === sec.levelId); if (li < 0 || li > upTo) return;
        if (!this.showPhase(sec)) return;
        this.buildRoof(sec, P.levels[li]);
      });
    }
    if (this.opts.highlightNew || this.opts.damage) this._markRoofs();
    if (this.opts.holo) this._holoize();
    if (this._sel) this.setSelection(this._sel, true);
    if (this.walk) this._walkPrep();
    this.render();
  }

  // ---- phases: Before = existing + what gets torn out; After = existing + new work ----
  showPhase(o) {
    const p = (o && o.phase) || 'new', v = this.opts.phaseView;
    return v === 'before' ? p !== 'new' : v === 'after' ? p !== 'demo' : true;
  }
  viewLevel(level) {
    const f = a => a.filter(o => this.showPhase(o));
    const walls = f(level.walls), ids = new Set(walls.map(w => w.id));
    return { ...level, walls, rooms: f(level.rooms), items: f(level.items), openings: f(level.openings).filter(o => ids.has(o.wallId)) };
  }
  // grey out existing work (to show what is new) and mark damage
  _afterLevel(level, g) {
    const phase = new Map(), damaged = new Set();
    ['walls', 'rooms', 'items', 'openings'].forEach(k => level[k].forEach(o => phase.set(o.id, o.phase || 'new')));
    level.rooms.forEach(r => { if (r.damaged) damaged.add(r.id); });
    const grey = this.mat('#c9c9c6'), red = this.mat('#e0453a', { opacity: 0.45, side: THREE.DoubleSide });
    g.traverse(o => {
      const pk = o.userData.pick; if (!pk || !o.isMesh) return;
      if (this.opts.highlightNew && phase.get(pk.id) === 'existing') o.material = Array.isArray(o.material) ? o.material.map(() => grey) : grey;
      if (this.opts.damage && pk.kind === 'room' && damaged.has(pk.id) && o.geometry.type === 'ShapeGeometry') {
        const ov = new THREE.Mesh(o.geometry, red); ov.position.copy(o.position); ov.position.y += 0.04; ov.renderOrder = 2; o.parent.add(ov);
      }
    });
  }
  _markRoofs() {
    const P = this.app.project, grey = this.mat('#c9c9c6', { side: THREE.DoubleSide }), red = this.mat('#d9443a', { side: THREE.DoubleSide, roughness: 0.8 });
    this.root.children.forEach(grp => {
      const pk = grp.userData.pick; if (!pk || pk.kind !== 'roof') return;
      const r = P.roofs.find(x => x.id === pk.id); if (!r) return;
      const m = this.opts.damage && r.damaged ? red : this.opts.highlightNew && r.phase === 'existing' ? grey : null;
      if (m) grp.traverse(o => { if (o.isMesh) o.material = m; });
    });
  }

  // ---- selection highlight ----
  setSelection(sel, again) {
    if (this.opts.studio) { this._sel = sel; return; }
    if (this._hl) this._hl.forEach(([o, m]) => { o.material = m; });
    this._hl = []; this._sel = sel;
    if (sel) {
      this.root.traverse(o => {
        if (!o.isMesh || !o.userData.pick || o.userData.pick.id !== sel.id) return;
        const tint = m => { const c = m.clone(); if (c.emissive) { c.emissive.set('#3d7cff'); c.emissiveIntensity = 0.45; } return c; };
        this._hl.push([o, o.material]);
        o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
      });
    }
    if (!again) this.render();
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
    const glass = this._glass || (this._glass = new THREE.MeshPhysicalMaterial({ color: '#bfe3ff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }));
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
    const color = it.color || (p ? p.color : '#999999');
    const type = p ? (p.objType || 'box') : 'box';
    const grp = new THREE.Group();
    grp.position.set(it.x, it.elev || 0, it.y);
    grp.rotation.y = -it.rot * Math.PI / 180;
    grp.userData.pick = { kind: 'item', id: it.id, levelId: level.id };
    const m = it.color ? this.mat(it.color, { roughness: 0.7 }) : this.productMat(it.productId, color, 2, { roughness: 0.6 });
    const add = (geo, mat, x, y, z) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.pick = grp.userData.pick; grp.add(mesh); return mesh; };
    const W = it.w, D = it.d, H = it.h;
    if (type === 'base') {
      add(RB(W, H - 0.15, D - 0.1), m, 0, (H - 0.15) / 2, 0.05);
      add(RB(W + 0.05, 0.15, D + 0.05, 0.04), this.counterMat(), 0, H - 0.075, 0);
      add(RB(W - 0.1, 0.35, 0.02), this.mat('#222'), 0, 0.2, D / 2 - 0.04);  // toe kick shadow
    } else if (type === 'upper') {
      add(RB(W, H, D), m, 0, H / 2, 0);
    } else if (type === 'cyl') {
      add(new THREE.CylinderGeometry(Math.min(W, D) / 2, Math.min(W, D) / 2, H, 24), m, 0, H / 2, 0);
    } else if (type === 'toilet') {
      add(RB(W * 0.95, H * 0.55, D * 0.25), m, 0, H * 0.72, -D * 0.37);
      const bowl = add(new THREE.CylinderGeometry(W * 0.36, W * 0.26, H * 0.55, 20), m, 0, H * 0.275, D * 0.1); bowl.scale.z = 1.35;
    } else if (type === 'tub') {
      add(RB(W, H, D, 0.3), m, 0, H / 2, 0);
      add(RB(W - 0.4, 0.05, D - 0.4), this.mat('#cfe3ee', { roughness: 0.2 }), 0, H + 0.01, 0);
    } else if (type === 'sofa') {
      add(RB(W, H * 0.42, D, 0.22), m, 0, H * 0.21 + 0.25, 0);                     // seat base
      add(RB(W, H * 0.6, D * 0.25, 0.2), m, 0, H * 0.5 + 0.25, -D * 0.375);     // back
      [-1, 1].forEach(sx => add(RB(0.55, H * 0.55, D, 0.25), m, sx * (W / 2 - 0.275), H * 0.27 + 0.25, 0));
      const cush = this.mat(it.color ? shade(it.color, 1.12) : '#d8d4cc', { roughness: 0.9 });
      const n = Math.max(2, Math.round(W / 2.6));
      for (let i = 0; i < n; i++) add(RB((W - 1.2) / n - 0.08, 0.35, D * 0.62, 0.16), cush, -W / 2 + 0.6 + ((W - 1.2) * (i + 0.5)) / n, H * 0.42 + 0.42, D * 0.08);
      [-1, 1].forEach(sx => [-1, 1].forEach(sz => add(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 6), this.mat('#2a2522'), sx * (W / 2 - 0.3), 0.125, sz * (D / 2 - 0.3))));
    } else if (type === 'chair') {
      add(RB(W * 0.9, 0.25, D * 0.85, 0.1), m, 0, H * 0.45, D * 0.05);
      add(RB(W * 0.9, H * 0.5, 0.18), m, 0, H * 0.72, -D * 0.4);
      const leg = this.mat('#2a2522');
      [-1, 1].forEach(sx => [-1, 1].forEach(sz => add(RB(0.12, H * 0.45, 0.12), leg, sx * W * 0.38, H * 0.225, sz * D * 0.36)));
    } else if (type === 'stool') {
      add(new THREE.CylinderGeometry(W * 0.4, W * 0.4, 0.2, 18), m, 0, H - 0.1, 0);
      add(new THREE.CylinderGeometry(0.08, 0.12, H - 0.2, 8), this.mat('#2a2a2a', { metalness: 0.6 }), 0, (H - 0.2) / 2, 0);
    } else if (type === 'table') {
      const round = p && p.round;
      add(round ? new THREE.CylinderGeometry(W / 2, W / 2, 0.15, 32) : RB(W, 0.15, D), m, 0, H - 0.075, 0);
      if (round) add(new THREE.CylinderGeometry(0.2, 0.5, H - 0.15, 12), m, 0, (H - 0.15) / 2, 0);
      else [-1, 1].forEach(sx => [-1, 1].forEach(sz => add(RB(0.2, H - 0.15, 0.2), m, sx * (W / 2 - 0.3), (H - 0.15) / 2, sz * (D / 2 - 0.3))));
    } else if (type === 'bed') {
      add(RB(W, 1.1, D), this.mat(it.color ? shade(it.color, 0.6) : '#6e5440'), 0, 0.55, 0);             // frame
      add(RB(W - 0.2, 0.75, D - 0.4, 0.3), this.mat('#f4f2ee', { roughness: 0.95 }), 0, 1.45, 0.1);            // mattress
      add(RB(W - 0.1, 0.3, D * 0.62, 0.14), m, 0, 1.9, D * 0.18);                                              // duvet
      add(RB(W + 0.2, 3.8, 0.35), this.mat(it.color ? shade(it.color, 0.55) : '#5a4636'), 0, 1.9, -D / 2);   // headboard
      const pw = W > 4 ? 2 : 1;
      for (let i = 0; i < pw; i++) add(RB((W - 0.8) / pw - 0.15, 0.45, 1.1, 0.2), this.mat('#ffffff', { roughness: 1 }), -W / 2 + 0.4 + ((W - 0.8) * (i + 0.5)) / pw, 2.05, -D / 2 + 1);
    } else if (type === 'rug') {
      const r = add(RB(W, 0.03, D), this.mat(color, { roughness: 1 }), 0, 0.035, 0); r.castShadow = false;
      add(RB(W - 0.8, 0.032, D - 0.8), this.mat(shade(color, 0.82), { roughness: 1 }), 0, 0.037, 0).castShadow = false;
    } else if (type === 'lamp') {
      const glow = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffd9a0', emissiveIntensity: 1.2, roughness: 0.8 });
      add(new THREE.CylinderGeometry(0.06, 0.06, H * 0.8, 8), this.mat('#2a2a2a', { metalness: 0.5 }), 0, H * 0.4, 0);
      add(new THREE.CylinderGeometry(W * 0.3, W * 0.42, H * 0.28, 20, 1, true), glow, 0, H * 0.84, 0);
      add(new THREE.CylinderGeometry(W * 0.3, W * 0.3, 0.06, 16), this.mat('#2a2a2a'), 0, 0.03, 0);
    } else if (type === 'pendant') {
      const glow = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffd9a0', emissiveIntensity: 1.4 });
      const ceil = (level.height || 9) - (it.elev || 6.5);
      add(new THREE.CylinderGeometry(0.02, 0.02, Math.max(0.2, ceil), 4), this.mat('#222'), 0, H + Math.max(0.2, ceil) / 2, 0);
      add(new THREE.ConeGeometry(W / 2, H * 0.7, 20, 1, true), this.mat(color, { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }), 0, H * 0.65, 0);
      add(new THREE.SphereGeometry(Math.min(W, H) * 0.18, 12, 8), glow, 0, H * 0.35, 0);
    } else if (type === 'art' || type === 'mirror') {
      add(RB(W, H, 0.08), this.mat(type === 'mirror' ? '#2a2a2a' : '#1d1d1d'), 0, H / 2, -D / 2 + 0.04);
      const face = type === 'mirror' ? this.mat('#cfdbe2', { metalness: 0.9, roughness: 0.05 }) : new THREE.MeshStandardMaterial({ map: this.artTexture(it.id, it.color || color), roughness: 0.9 });
      add(new THREE.PlaneGeometry(W - 0.25, H - 0.25), face, 0, H / 2, -D / 2 + 0.085);
    } else if (type === 'tv') {
      add(RB(W, H, 0.12), this.mat('#0d0d0d', { roughness: 0.3 }), 0, H / 2, -D / 2 + 0.06);
      add(new THREE.PlaneGeometry(W - 0.12, H - 0.12), new THREE.MeshStandardMaterial({ color: '#16222e', emissive: '#1b3550', emissiveIntensity: 0.6, roughness: 0.2 }), 0, H / 2, -D / 2 + 0.125);
    } else if (type === 'shelf') {
      add(RB(W, H, 0.1), m, 0, H / 2, -D / 2 + 0.05);
      [-1, 1].forEach(sx => add(RB(0.1, H, D), m, sx * (W / 2 - 0.05), H / 2, 0));
      for (let i = 0; i <= 5; i++) add(RB(W, 0.08, D), m, 0, (H * i) / 5 + 0.04, 0);
      const books = ['#8c3a2f', '#2f4a6a', '#c9a46e', '#3a5a3a', '#6b4a7a', '#d8cbb3'];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) add(RB(W / 8, H / 5 * 0.7, D * 0.7), this.mat(books[(i * 3 + j) % books.length]), -W / 2 + 0.3 + (W - 0.6) * (j + 0.5) / 7, (H * i) / 5 + 0.08 + H / 5 * 0.35, 0);
    } else if (type === 'plant') {
      add(new THREE.CylinderGeometry(W * 0.3, W * 0.22, H * 0.25, 16), this.mat('#d8cbb3'), 0, H * 0.125, 0);
      const leaf = this.mat(color, { roughness: 1 });
      [[0, 0.62, 0, 0.42], [0.15, 0.78, 0.1, 0.32], [-0.15, 0.82, -0.08, 0.3]].forEach(([x, y, z, r]) => { const b = add(new THREE.IcosahedronGeometry(1, 1), leaf, x * W, y * H, z * W); b.scale.set(W * r, H * r * 0.7, W * r); });
    } else if (type === 'panel') {          // backsplash, tile wall, fireplace surround: width × height, thin
      add(RB(W, H, Math.max(0.04, D)), m, 0, H / 2, 0);
    } else if (type === 'tree') {
      const trunkH = H * 0.35;
      add(new THREE.CylinderGeometry(Math.max(0.15, W * 0.04), Math.max(0.2, W * 0.06), trunkH, 10), this.mat('#6b4a32'), 0, trunkH / 2, 0);
      const crown = add(new THREE.IcosahedronGeometry(1, 1), this.mat(color, { roughness: 1 }), 0, trunkH + (H - trunkH) / 2, 0);
      crown.scale.set(W / 2, (H - trunkH) / 2, D / 2);
    } else if (type === 'shrub') {
      const b = add(new THREE.IcosahedronGeometry(1, 1), this.mat(color, { roughness: 1 }), 0, H / 2, 0); b.scale.set(W / 2, H / 2, D / 2);
    } else if (type === 'fence') {           // fences, railings, edging, retaining walls: a run W long
      const posts = Math.max(2, Math.round(W / 8) + 1);
      add(RB(W, H * 0.9, Math.max(0.06, D * 0.4)), m, 0, H * 0.45 + 0.05, 0);
      if (H > 1.5) for (let i = 0; i < posts; i++) add(RB(0.33, H, 0.33), m, -W / 2 + (W * i) / (posts - 1), H / 2, 0);
    } else if (type === 'pergola') {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(RB(0.5, H, 0.5), m, sx * (W / 2 - 0.5), H / 2, sz * (D / 2 - 0.5)));
      for (let i = 0; i < 9; i++) add(RB(0.17, 0.6, D + 1), m, -W / 2 + (W * i) / 8, H + 0.3, 0);
      [-1, 1].forEach(sx => add(RB(0.3, 0.8, D + 1.5), m, sx * (W / 2 - 0.5), H - 0.4, 0));
    } else if (type === 'shower') {
      add(RB(W, 0.3, D), this.mat('#ffffff'), 0, 0.15, 0);
      add(RB(W, H, 0.04), this.mat('#bfe0ef', { opacity: 0.3, side: THREE.DoubleSide }), 0, H / 2, D / 2);
    } else {
      add(RB(W, H, D), m, 0, H / 2, 0);
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
        if (m.map) this._uvRoof(geo, m.userData.repeatFt || 3, ridgeAxisOf(sec));
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
  get flying() { return !!this._flying; }

  counterMat() {
    return this._counter || (this._counter = new THREE.MeshPhysicalMaterial({ color: '#ebe8e2', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 }));
  }
  // Abstract art for wall pieces, different for each item, in the style's accent color.
  artTexture(seed, accent) {
    const key = 'art|' + seed + '|' + accent;
    if (this.texCache.has(key)) return this.texCache.get(key);
    let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
    const c = document.createElement('canvas'); c.width = 256; c.height = 192; const x = c.getContext('2d');
    x.fillStyle = '#f3efe6'; x.fillRect(0, 0, 256, 192);
    const cols = [accent, shade(accent, 1.35), shade(accent, 0.6), '#d9b56a', '#2b2b2b', '#c96f3a'];
    for (let i = 0; i < 7; i++) {
      x.globalAlpha = 0.55 + rnd() * 0.4; x.fillStyle = cols[Math.floor(rnd() * cols.length)];
      if (rnd() < 0.5) { x.beginPath(); x.arc(rnd() * 256, rnd() * 192, 15 + rnd() * 60, 0, 7); x.fill(); }
      else x.fillRect(rnd() * 200, rnd() * 150, 30 + rnd() * 120, 10 + rnd() * 70);
    }
    x.globalAlpha = 1; x.strokeStyle = '#2b2b2b'; x.lineWidth = 3; x.beginPath(); x.moveTo(rnd() * 256, rnd() * 192); for (let i = 0; i < 4; i++) x.quadraticCurveTo(rnd() * 256, rnd() * 192, rnd() * 256, rnd() * 192); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.texCache.set(key, t);
    return t;
  }

  // Roof surfaces: courses run along the eaves (parallel to the ridge), measured up the slope.
  _uvRoof(geo, repeatFt, axis) {
    const pos = geo.attributes.position, uv = [];
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); uv.push((axis === 'x' ? x : z) / repeatFt, ((axis === 'x' ? z : x) * 0.95 + y * 0.31) / repeatFt); }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
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
  // Glide the camera to a new view (eased), instead of jumping.
  flyTo(pos, target, ms = 900) {
    if (!this.visible || ms <= 0) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.render(); return; }
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone(), start = performance.now();
    const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const id = (this._fly = {});
    const step = now => {
      if (this._fly !== id) return;
      const k = ease(Math.min(1, (now - start) / ms));
      this.camera.position.lerpVectors(p0, pos, k); this.controls.target.lerpVectors(t0, target, k);
      this.controls.update(); this.render();
      if (k < 1) requestAnimationFrame(step); else this._flying = false;
    };
    this._flying = true;
    requestAnimationFrame(step);
  }
  _fitShadows(c, size) {
    const r = Math.max(size.x, size.z) * 0.75 + 25, sc = this.sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
    this.sun.position.set(c.x - r * 0.8, c.y + r * 1.4, c.z + r * 0.6); this.sun.target.position.copy(c); this.sun.target.updateMatrixWorld();
  }
  _modelBox() {
    const box = new THREE.Box3();
    if (this.opts.studio && this.studio && this.studio.groups.length) this.studio.groups.forEach(g => box.expandByObject(g));
    else box.setFromObject(this.root);
    return box;
  }
  fit(smooth) {
    const box = this._modelBox();
    if (box.isEmpty()) { this.camera.position.set(40, 40, 60); this.controls.target.set(0, 0, 0); this.render(); return; }
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, size.y * 1.5) * 0.9 + 10;
    this._fitShadows(c, size);
    this.flyTo(new THREE.Vector3(c.x + r * 0.75, c.y + r * 0.6, c.z + r * 1.0), c, smooth ? 900 : 0);
  }
  // Double-click a piece: the camera glides in to frame it.
  focusOn(pick) {
    const box = new THREE.Box3(); let found = false;
    this.root.traverse(o => { if (o.isMesh && o.userData.pick && o.userData.pick.id === pick.id) { box.expandByObject(o); found = true; } });
    if (!found) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 1.6 + 6;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.flyTo(c.clone().add(dir.multiplyScalar(r)), c, 800);
  }
  setPreset(name) {
    const box = this._modelBox(); if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 1.1 + 10;
    const pos = { front: [0, size.y * 0.3, r], back: [0, size.y * 0.3, -r], left: [-r, size.y * 0.3, 0], right: [r, size.y * 0.3, 0], top: [0.01, r * 1.4, 0.01], iso: [r * 0.7, r * 0.7, r * 0.9] }[name] || [r, r, r];
    this.flyTo(new THREE.Vector3(c.x + pos[0], c.y + pos[1], c.z + pos[2]), c, this._shot ? 0 : 900);
  }

  // ---------- pointer: click to select, drag the selected piece to move it, walk-mode look / glide ----------
  _ndc(e) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  _hits(e) { this.ray.setFromCamera(this._ndc(e), this.camera); return this.ray.intersectObjects(this.root.children, true).filter(h => h.object.userData.pick && h.object.visible); }
  _floorPoint(e, y) { this.ray.setFromCamera(this._ndc(e), this.camera); const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null; }
  _pDown(e) {
    this._down = { x: e.clientX, y: e.clientY };
    if (this._anim || this.walk || this.opts.studio) return;
    const sel = this.app.selection;
    if (!sel || !['item', 'opening', 'wall'].includes(sel.kind)) return;
    // the selected piece can be grabbed even when the roof or a wall is in front of it
    const h = this._hits(e).find(x => x.object.userData.pick.id === sel.id);
    if (!h) return;
    const level = this.app.level, y = level.elevation;
    const p0 = this._floorPoint(e, y); if (!p0) return;
    const d = { kind: sel.kind, id: sel.id, p0, y, active: false };
    if (sel.kind === 'item') { const it = level.items.find(x => x.id === sel.id); if (!it) return; d.obj = it; d.x0 = it.x; d.y0 = it.y; this.root.traverse(o => { if (!d.grp && o.isGroup && o.userData.pick && o.userData.pick.id === sel.id) d.grp = o; }); }
    else if (sel.kind === 'opening') { const o = level.openings.find(x => x.id === sel.id); if (!o) return; d.obj = o; d.wall = level.walls.find(w => w.id === o.wallId); if (!d.wall) return; }
    else { const w = level.walls.find(x => x.id === sel.id); if (!w) return; d.obj = w; d.a0 = { ...w.a }; d.b0 = { ...w.b }; d.ja = wallsAtPoint(level, w.a).filter(([x]) => x !== w); d.jb = wallsAtPoint(level, w.b).filter(([x]) => x !== w); }
    this._drag = d; this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }
  _pMove(e) {
    const d = this._drag;
    if (!d) { if (this.opts.studio && this.app.studioHover) this.app.studioHover(e); return; }
    if (!d.active && Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) < 4) return;
    d.active = true;
    const p = this._floorPoint(e, d.y); if (!p) return;
    const snap = v => e.altKey ? v : Math.round(v * 4) / 4;
    const dx = p.x - d.p0.x, dz = p.z - d.p0.z;
    if (d.kind === 'item') {
      d.obj.x = snap(d.x0 + dx); d.obj.y = snap(d.y0 + dz);
      if (d.grp) { d.grp.position.x = d.obj.x; d.grp.position.z = d.obj.y; this.render(); }
    } else if (d.kind === 'opening') {
      const w = d.wall, L = wallLength(w), pr = projectOnSeg({ x: p.x, y: p.z }, w.a, w.b), half = d.obj.width / 2;
      d.obj.t = Math.max(half + 0.05, Math.min(L - half - 0.05, snap(pr.t * L))) / L;
      this._liveRebuild();
    } else {
      const w = d.obj, L = Math.hypot(d.b0.x - d.a0.x, d.b0.y - d.a0.y) || 1, n = { x: -(d.b0.y - d.a0.y) / L, y: (d.b0.x - d.a0.x) / L };
      const k = snap(dx * n.x + dz * n.y);
      w.a = { x: d.a0.x + n.x * k, y: d.a0.y + n.y * k }; w.b = { x: d.b0.x + n.x * k, y: d.b0.y + n.y * k };
      d.ja.forEach(([x, end]) => { x[end] = { ...w.a }; }); d.jb.forEach(([x, end]) => { x[end] = { ...w.b }; });
      this._liveRebuild();
    }
    this.app.plan.draw();
  }
  _liveRebuild() { if (this._lrT) return; this._lrT = setTimeout(() => { this._lrT = null; this.rebuild(); }, 70); }
  _pUp(e) {
    const d = this._drag; this._drag = null;
    if (d) { this.controls.enabled = !this.walk; if (d.active) { this.app.commit('Moved in 3D'); return; } }
    if (!this._down || Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) >= 4) return;
    if (this._anim) return;
    if (this.walk) {   // click a floor to glide there
      const h = this._hits(e).find(x => x.object.userData.pick.kind === 'room');
      if (h) this.walk.glide = { x: h.point.x, z: h.point.z };
      return;
    }
    if (this.opts.studio) { if (this.app.studioClick) this.app.studioClick(e); return; }
    this.pick(e);
  }

  // ---------- walk-through ----------
  // Eye at 5'5". W/S or ↑/↓ walk, A/D step sideways, ←/→ turn, drag to look, click a floor to glide there.
  // Walls stop you; doors and openings let you through. Each room you enter lights up and shows its card.
  toggleWalk(on) {
    if (on && !this.walk) {
      const L = this.app.level;
      const rooms = L.rooms.filter(r => !r.outdoor && this.showPhase(r)).sort((a, b) => polyArea(b.points) - polyArea(a.points));
      const c = rooms[0] ? centroid(rooms[0].points) : { x: 0, y: 0 };
      this.walk = { yaw: 0, pitch: -0.05, eye: L.elevation + 5.4, vx: 0, vz: 0, roomId: null, glide: null };
      this._ceilBefore = this.opts.ceilings; this.opts.ceilings = true;
      this.camera.position.set(c.x, this.walk.eye, c.y);
      this.controls.enabled = false;
      const el = this.renderer.domElement;
      this._look = e => { if (e.buttons !== 1 || this._drag) return; this.walk.yaw -= e.movementX * 0.004; this.walk.pitch = Math.max(-1.2, Math.min(1.2, this.walk.pitch - e.movementY * 0.004)); };
      el.addEventListener('pointermove', this._look);
      this.rebuild();
      this.app.onWalk && this.app.onWalk(true);
      this._walkStep();
    } else if (!on && this.walk) {
      this.renderer.domElement.removeEventListener('pointermove', this._look);
      this.walk = null; this.opts.ceilings = this._ceilBefore; this.roomLight.intensity = 0;
      this.controls.enabled = true; this.rebuild(); this.fit();
      this.app.onWalk && this.app.onWalk(false);
    }
  }
  _walkPrep() {
    const L = this.viewLevel(this.app.level);
    this._solid = [];
    L.walls.forEach(w => {
      const H = wallHeight(w, L), len = wallLength(w); if (len < 0.05) return;
      const d = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
      wallPieces(w, L.openings, H).forEach(pc => { if (pc.z0 < 1 && pc.z1 > 2) this._solid.push({ a: { x: w.a.x + d.x * pc.u0, y: w.a.y + d.y * pc.u0 }, b: { x: w.a.x + d.x * pc.u1, y: w.a.y + d.y * pc.u1 }, r: (w.thickness || 0.5) / 2 + 0.85 }); });
    });
  }
  _blocked(x, z) { return (this._solid || []).some(s => projectOnSeg({ x, y: z }, s.a, s.b).d < s.r); }
  _walkStep() {
    const w = this.walk, k = this._keys, cam = this.camera;
    const run = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.2 : 1;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const turn = (k.has('ArrowLeft') || k.has('KeyQ') ? 1 : 0) - (k.has('ArrowRight') || k.has('KeyE') ? 1 : 0);
    w.yaw += turn * 0.035;
    let tx = (-Math.sin(w.yaw) * fwd + Math.cos(w.yaw) * str) * 0.22 * run, tz = (-Math.cos(w.yaw) * fwd - Math.sin(w.yaw) * str) * 0.22 * run;
    if (w.glide) {
      const gx = w.glide.x - cam.position.x, gz = w.glide.z - cam.position.z, gd = Math.hypot(gx, gz);
      if (gd < 0.3 || fwd || str) w.glide = null;
      else { const sp = Math.min(0.32, gd * 0.08 + 0.05); tx = gx / gd * sp; tz = gz / gd * sp; const want = Math.atan2(-gx, -gz); let da = want - w.yaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; w.yaw += da * 0.08; }
    }
    w.vx += (tx - w.vx) * 0.25; w.vz += (tz - w.vz) * 0.25;   // ease in and out
    const x = cam.position.x, z = cam.position.z;
    if (!this._blocked(x + w.vx, z + w.vz)) { cam.position.x += w.vx; cam.position.z += w.vz; }
    else if (!this._blocked(x + w.vx, z)) { cam.position.x += w.vx; w.vz = 0; }
    else if (!this._blocked(x, z + w.vz)) { cam.position.z += w.vz; w.vx = 0; }
    else { w.vx = w.vz = 0; if (w.glide) w.glide = null; }
    cam.position.y = w.eye;
    cam.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
    // which room am I in?
    const L = this.app.level, here = { x: cam.position.x, y: cam.position.z };
    const room = L.rooms.filter(r => this.showPhase(r)).sort((a, b) => (a.outdoor ? 1 : 0) - (b.outdoor ? 1 : 0) || polyArea(a.points) - polyArea(b.points)).find(r => pointInPoly(here, r.points)) || null;
    const id = room ? room.id : null;
    if (id !== w.roomId) {
      w.roomId = id;
      if (room && !room.outdoor) { const c = centroid(room.points); this.roomLight.position.set(c.x, L.elevation + (room.height || L.height) - 1.2, c.y); this._lightTo = 38; }
      else this._lightTo = 0;
      this.app.onEnterRoom && this.app.onEnterRoom(room);
    }
    if (this._lightTo != null) this.roomLight.intensity += (this._lightTo - this.roomLight.intensity) * 0.1;
    this.render();
  }

  pick(e) {
    const h = this._hits(e)[0];
    if (h) this.app.pickFrom3D(h.object.userData.pick); else this.app.select(null);
  }

  screenshot() { this._sharpen(); this.render(); return this.renderer.domElement.toDataURL('image/png'); }
  shots(names) { this._shot = true; const out = names.map(n => { this.setPreset(n); return this.screenshot(); }); this._shot = false; return out; }

  async exportGLB() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    return new Promise((res, rej) => new GLTFExporter().parse(this.root, r => res(new Blob([r], { type: 'model/gltf-binary' })), rej, { binary: true }));
  }
}
