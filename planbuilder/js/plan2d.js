// PlanBuilder 2D plan editor: draws the current level on a canvas and handles every drawing tool.
// It never owns data: it reads app.project / app.level and calls app.commit() after a change.

import { dist, lerp, snapPt, snapAngle, projectOnSeg, pointInPoly, centroid, polyArea, fmtFtIn, wallLength, wallDir, wallOpenings, ridgeAxis, bbox, EPS } from './geom.js';
import { addWall, addRoom, addOpening, addItem, addRoof, wallsAtPoint, wallsForRoom, rectPts, removeWall } from './model.js';
import { findProduct } from './catalog.js';
import { parseFtIn as parseLen } from './geom.js';

const HANDLE_PX = 7;

export class Plan2D {
  constructor(canvas, app) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.app = app;
    this.view = { scale: 14, ox: 80, oy: 80 };
    this.mouse = { x: 0, y: 0, w: { x: 0, y: 0 } };
    this.chain = null;          // wall tool: { pts: [world points] }
    this.poly = null;           // room polygon tool: points
    this.dragRect = null;       // room / roof rectangle: { a, b }
    this.drag = null;           // select tool drag state
    this.measure = null;        // measure tool: { a, b, done }
    this.placeRot = 0;          // rotation for the item being placed
    this.hover = null;
    this.snapMark = null;
    this.pointers = new Map();
    this.spaceDown = false;
    this._bind();
    this.resize();
  }

  // ---------- coordinates ----------
  toScreen(p) { return { x: p.x * this.view.scale + this.view.ox, y: p.y * this.view.scale + this.view.oy }; }
  toWorld(sx, sy) { return { x: (sx - this.view.ox) / this.view.scale, y: (sy - this.view.oy) / this.view.scale }; }
  get level() { return this.app.level; }
  get project() { return this.app.project; }
  get settings() { return this.app.project.settings; }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px';
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.draw();
  }

  fit() {
    const pts = [];
    this.project.levels.forEach(l => { l.walls.forEach(w => pts.push(w.a, w.b)); l.rooms.forEach(r => pts.push(...r.points)); });
    if (!pts.length) { this.view = { scale: 14, ox: this.w / 2 - 20 * 14, oy: this.h / 2 - 15 * 14 }; this.draw(); return; }
    const b = bbox(pts), pad = 60;
    const s = Math.min((this.w - pad * 2) / Math.max(b.w, 5), (this.h - pad * 2) / Math.max(b.h, 5));
    this.view.scale = Math.max(2, Math.min(80, s));
    this.view.ox = this.w / 2 - (b.x + b.w / 2) * this.view.scale;
    this.view.oy = this.h / 2 - (b.y + b.h / 2) * this.view.scale;
    this.draw();
  }
  zoomAt(sx, sy, f) {
    const w = this.toWorld(sx, sy);
    this.view.scale = Math.max(1.5, Math.min(150, this.view.scale * f));
    this.view.ox = sx - w.x * this.view.scale; this.view.oy = sy - w.y * this.view.scale;
    this.drawSoon();
  }
  // Zoom and pan can fire many events per screen frame; draw once per frame.
  drawSoon() {
    if (this._drawRaf) return;
    this._drawRaf = requestAnimationFrame(() => { this._drawRaf = 0; this.draw(); });
  }

  // ---------- snapping ----------
  snapWorld(w, ev, from) {
    const tolW = 9 / this.view.scale;
    this.snapMark = null;
    // 1) wall ends and room corners on this level
    let best = null, bd = tolW;
    const consider = (p, kind) => { const d = dist(p, w); if (d < bd) { bd = d; best = { x: p.x, y: p.y, kind }; } };
    this.level.walls.forEach(wl => { consider(wl.a, 'end'); consider(wl.b, 'end'); });
    this.level.rooms.forEach(r => r.points.forEach(p => consider(p, 'corner')));
    if (this.chain && this.chain.pts.length > 2) consider(this.chain.pts[0], 'close');
    if (best && !(ev && ev.altKey) && this.osnap !== false) { this.snapMark = best; return { x: best.x, y: best.y }; }
    // 2) angle from the previous point, then grid
    let p = { ...w };
    if (from && !(ev && ev.shiftKey)) p = snapAngle(from, p, this.ortho ? 90 : (this.settings.angleSnap || 15));
    if (!(ev && ev.altKey) && this.gridSnap !== false) {
      if (from && !(ev && ev.shiftKey)) {
        // keep the angle, snap the length to the grid step
        const L = dist(from, p), step = this.settings.snap || 0.5;
        const Ls = Math.round(L / step) * step;
        if (L > EPS) p = lerp(from, p, Ls / L);
        // a nearby wall line (to land exactly on it)
      } else p = snapPt(p, this.settings.snap || 0.5);
    }
    // 3) onto a wall line
    if (!(ev && ev.altKey) && this.osnap !== false) {
      for (const wl of this.level.walls) {
        const pr = projectOnSeg(p, wl.a, wl.b);
        if (pr.d < tolW * 0.6 && pr.t > 0.001 && pr.t < 0.999) { this.snapMark = { ...pr.p, kind: 'on' }; return pr.p; }
      }
    }
    return p;
  }

  // ---------- hit testing ----------
  hit(w) {
    const L = this.level, px = 1 / this.view.scale;
    const sel = this.app.selection;
    // handles of the selected thing first
    if (sel) {
      if (sel.kind === 'wall') {
        const wl = L.walls.find(x => x.id === sel.id);
        if (wl) { if (dist(w, wl.a) < HANDLE_PX * px) return { kind: 'wall-end', wall: wl, end: 'a' }; if (dist(w, wl.b) < HANDLE_PX * px) return { kind: 'wall-end', wall: wl, end: 'b' }; }
      } else if (sel.kind === 'room') {
        const r = L.rooms.find(x => x.id === sel.id);
        if (r) for (let i = 0; i < r.points.length; i++) if (dist(w, r.points[i]) < HANDLE_PX * px) return { kind: 'room-pt', room: r, i };
      } else if (sel.kind === 'roof') {
        const rf = this.project.roofs.find(x => x.id === sel.id);
        if (rf) { const c = [{ x: rf.x, y: rf.y }, { x: rf.x + rf.w, y: rf.y }, { x: rf.x + rf.w, y: rf.y + rf.d }, { x: rf.x, y: rf.y + rf.d }]; for (let i = 0; i < 4; i++) if (dist(w, c[i]) < HANDLE_PX * px) return { kind: 'roof-corner', roof: rf, i }; }
      } else if (sel.kind === 'item') {
        const it = L.items.find(x => x.id === sel.id);
        if (it) { const hp = this.itemRotHandle(it); if (dist(w, hp) < HANDLE_PX * px) return { kind: 'item-rot', item: it }; }
      }
    }
    for (const o of L.openings) {
      const wl = L.walls.find(x => x.id === o.wallId); if (!wl) continue;
      const len = wallLength(wl), c = lerp(wl.a, wl.b, o.t), pr = projectOnSeg(w, wl.a, wl.b);
      if (Math.abs(pr.t * len - o.t * len) < o.width / 2 && pr.d < Math.max(wl.thickness, 6 * px)) return { kind: 'opening', obj: o, wall: wl, c };
    }
    for (let i = L.items.length - 1; i >= 0; i--) {
      const it = L.items[i], a = -it.rot * Math.PI / 180;
      const dx = w.x - it.x, dy = w.y - it.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.d / 2) return { kind: 'item', obj: it };
    }
    if (sel && sel.kind !== 'wall') {
      for (const wl of L.walls) { if (dist(w, wl.a) < HANDLE_PX * px * 0.8) return { kind: 'wall-end', wall: wl, end: 'a' }; if (dist(w, wl.b) < HANDLE_PX * px * 0.8) return { kind: 'wall-end', wall: wl, end: 'b' }; }
    }
    for (const wl of L.walls) { const pr = projectOnSeg(w, wl.a, wl.b); if (pr.d < wl.thickness / 2 + 4 * px) return { kind: 'wall', obj: wl, t: pr.t }; }
    if (this.app.showRoofs) {
      for (const rf of this.roofsHere()) {
        const edges = rectPts(rf.x, rf.y, rf.w, rf.d);
        for (let i = 0; i < 4; i++) if (projectOnSeg(w, edges[i], edges[(i + 1) % 4]).d < 5 * px) return { kind: 'roof', obj: rf };
      }
    }
    for (let i = L.rooms.length - 1; i >= 0; i--) if (pointInPoly(w, L.rooms[i].points)) return { kind: 'room', obj: L.rooms[i] };
    return null;
  }
  roofsHere() { return this.project.roofs.filter(r => r.levelId === this.level.id); }
  itemRotHandle(it) {
    const a = it.rot * Math.PI / 180, r = it.d / 2 + 14 / this.view.scale;
    return { x: it.x + r * Math.sin(a), y: it.y - r * Math.cos(a) };
  }
  nearestWall(w, maxPx = 24) {
    let best = null, bd = maxPx / this.view.scale;
    for (const wl of this.level.walls) { const pr = projectOnSeg(w, wl.a, wl.b); if (pr.d < bd) { bd = pr.d; best = { wall: wl, t: pr.t, p: pr.p }; } }
    return best;
  }

  // ---------- events ----------
  _bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => this.onDown(e));
    cv.addEventListener('pointermove', e => this.onMove(e));
    cv.addEventListener('pointerup', e => this.onUp(e));
    cv.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.drag = null; });
    cv.addEventListener('dblclick', e => this.onDbl(e));
    cv.addEventListener('contextmenu', e => { e.preventDefault(); });
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { this.spaceDown = true; cv.style.cursor = 'grab'; } });
    window.addEventListener('keyup', e => { if (e.code === 'Space') { this.spaceDown = false; cv.style.cursor = ''; } });
  }
  _pos(e) { const r = this.cv.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx, sy, w: this.toWorld(sx, sy) }; }

  onDown(e) {
    this.cv.setPointerCapture(e.pointerId);
    const P = this._pos(e);
    this.pointers.set(e.pointerId, { x: P.sx, y: P.sy });
    if (this.pointers.size === 2) { // pinch start
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      this.drag = null; return;
    }
    if (e.button === 1 || this.spaceDown || this.app.tool === 'pan' || (e.button === 2 && this.app.tool === 'select')) {
      this.drag = { kind: 'pan', sx: P.sx, sy: P.sy, ox: this.view.ox, oy: this.view.oy }; return;
    }
    if (e.button === 2) { this.finishTool(); return; }
    const tool = this.app.tool;
    if (tool === 'select') return this.selectDown(P, e);
    if (tool === 'wall') return this.wallClick(P, e);
    if (tool === 'room' || tool === 'roof') { const a = this.snapWorld(P.w, e); this.dragRect = { a, b: a, tool }; return; }
    if (tool === 'roompoly') return this.polyClick(P, e);
    if (tool === 'opening') return this.openingClick(P);
    if (tool === 'item') return this.itemClick(P, e);
    if (tool === 'ucal') return this.calClick(P);
    if (tool === 'umove') { const u = this.level.underlay; if (u) this.drag = { kind: 'umove', sx: P.w.x, sy: P.w.y, x0: u.x, y0: u.y, moved: false, label: 'Move picture' }; return; }
    if (tool === 'measure') {
      const p = this.snapWorld(P.w, e, this.measure && !this.measure.done ? this.measure.a : null);
      if (!this.measure || this.measure.done) this.measure = { a: p, b: p, done: false };
      else { this.measure.b = p; this.measure.done = true; }
      this.draw(); return;
    }
  }

  onMove(e) {
    const P = this._pos(e);
    if (this.app.showCoords) this.app.showCoords(P.w);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: P.sx, y: P.sy });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.view.ox += cx - this.pinch.cx; this.view.oy += cy - this.pinch.cy;
      this.zoomAt(cx, cy, d / (this.pinch.d || d));
      this.pinch = { d, cx, cy }; return;
    }
    this.mouse = { x: P.sx, y: P.sy, w: P.w, ev: e };
    const d = this.drag;
    if (d) {
      if (d.kind === 'pan') { this.view.ox = d.ox + P.sx - d.sx; this.view.oy = d.oy + P.sy - d.sy; this.drawSoon(); return; }
      if (d.kind === 'umove') { const u = this.level.underlay; u.x = d.x0 + P.w.x - d.sx; u.y = d.y0 + P.w.y - d.sy; d.moved = true; this.draw(); return; }
      return this.selectDrag(P, e);
    }
    if (this.dragRect) { this.dragRect.b = this.snapWorld(P.w, e); this.draw(); this.app.status(this.rectInfo()); return; }
    if (this.measure && !this.measure.done) { this.measure.b = this.snapWorld(P.w, e, this.measure.a); this.draw(); this.app.status('Distance: ' + fmtFtIn(dist(this.measure.a, this.measure.b))); return; }
    if (this.app.tool === 'select') { const h = this.hit(P.w); this.hover = h; this.cv.style.cursor = this.spaceDown ? 'grab' : (h ? (h.kind.includes('end') || h.kind.includes('pt') || h.kind.includes('corner') ? 'crosshair' : 'move') : 'default'); }
    if (this.app.tool === 'wall' || this.app.tool === 'roompoly') {
      const from = this.chain ? this.chain.pts[this.chain.pts.length - 1] : (this.poly && this.poly.length ? this.poly[this.poly.length - 1] : null);
      this.mouse.snap = this.snapWorld(P.w, e, from);
      if (from) this.app.status(`Length ${fmtFtIn(dist(from, this.mouse.snap))} — type a length and press Enter, or click. Double-click / Esc to finish.`);
    }
    this.drawSoon();
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.dragRect) {
      const { a, b, tool } = this.dragRect; this.dragRect = null;
      const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      if (r.w >= 1 && r.h >= 1) {
        if (tool === 'room') this.makeRectRoom(r);
        else {
          const rf = addRoof(this.project, this.level, { x: r.x, y: r.y, w: r.w, h: r.h }, this.app.roofDefaults());
          this.app.select({ kind: 'roof', id: rf.id });
          this.app.commit('Add roof');
        }
      }
      this.draw(); return;
    }
    if (this.drag && this.drag.kind !== 'pan' && this.drag.moved) this.app.commit(this.drag.label || 'Move');
    else if (this.drag && this.drag.kind !== 'pan' && this.drag.snapshot) this.app.dropSnapshot();
    this.drag = null;
    this.draw();
  }

  onDbl(e) {
    if (this.app.tool === 'wall' || this.app.tool === 'roompoly') { this.finishTool(); return; }
    if (this.app.tool === 'select') {
      const P = this._pos(e), h = this.hit(P.w);
      if (h && h.kind === 'wall') { // double-click a wall: split it there
        const t = h.t; this.app.splitWallAt(h.obj, t);
      } else if (h && h.kind === 'room') this.app.focusProp('name');
    }
  }

  // A rectangle room { x, y, w, h } (drag, or typed on the command line).
  makeRectRoom(r) {
    const pts = rectPts(r.x, r.y, r.w, r.h);
    const room = addRoom(this.level, pts, { name: this.app.nextRoomName() });
    if (this.app.autoWalls) wallsForRoom(this.level, pts, this.settings, !this.level.walls.length);
    this.app.select({ kind: 'room', id: room.id });
    this.app.commit('Add room');
    return room;
  }
  finishTool() {
    if (this.chain) { const n = this.chain.made; this.chain = null; if (n) this.app.commit('Draw walls'); else this.app.dropSnapshot(); }
    if (this.poly) { const pts = this.poly; this.poly = null; if (pts.length >= 3) this.makePolyRoom(pts); }
    this.measure = null; this.dragRect = null;
    this.app.status('');
    this.draw();
  }
  cancel() {
    if (this.chain) { if (this.chain.made) this.app.commit('Draw walls'); this.chain = null; }
    this.poly = null; this.dragRect = null; this.measure = null;
    this.draw();
  }

  // ----- wall tool -----
  wallClick(P, e) {
    const from = this.chain ? this.chain.pts[this.chain.pts.length - 1] : null;
    const p = this.snapWorld(P.w, e, from);
    this.addWallPoint(p);
  }
  addWallPoint(p) {
    if (!this.chain) { this.app.takeSnapshot(); this.chain = { pts: [p], made: 0 }; this.draw(); return; }
    const from = this.chain.pts[this.chain.pts.length - 1];
    if (dist(from, p) < 0.2) { this.finishTool(); return; }
    const ext = this.app.wallExterior;
    addWall(this.level, from, p, { exterior: ext, thickness: ext ? this.settings.extThick : this.settings.intThick });
    this.chain.made++;
    if (dist(p, this.chain.pts[0]) < 0.05 && this.chain.pts.length > 1) { this.chain.pts.push(p); this.finishTool(); return; }
    this.chain.pts.push(p);
    this.app.refresh(false);
    this.draw();
  }
  // Typed length (feet) in the direction the mouse points.
  applyLength(ft) {
    const pts = this.app.tool === 'roompoly' ? this.poly : (this.chain && this.chain.pts);
    if (!pts || !pts.length || !(ft > 0)) return false;
    const from = pts[pts.length - 1];
    const target = this.mouse.snap || this.mouse.w;
    let dir = { x: target.x - from.x, y: target.y - from.y };
    const L = Math.hypot(dir.x, dir.y);
    if (L < EPS) dir = { x: 1, y: 0 }; else dir = { x: dir.x / L, y: dir.y / L };
    const p = { x: from.x + dir.x * ft, y: from.y + dir.y * ft };
    p.x = Math.round(p.x * 1000) / 1000; p.y = Math.round(p.y * 1000) / 1000;
    if (this.app.tool === 'roompoly') { this.poly.push(p); this.draw(); } else this.addWallPoint(p);
    return true;
  }

  // ----- polygon room -----
  polyClick(P, e) {
    const from = this.poly && this.poly.length ? this.poly[this.poly.length - 1] : null;
    const p = this.snapWorld(P.w, e, from);
    if (!this.poly) this.poly = [];
    if (this.poly.length >= 3 && dist(p, this.poly[0]) < 0.1) { const pts = this.poly; this.poly = null; this.makePolyRoom(pts); return; }
    this.poly.push(p); this.draw();
  }
  makePolyRoom(pts) {
    if (polyArea(pts) < 1) return;
    const room = addRoom(this.level, pts, { name: this.app.nextRoomName() });
    if (this.app.autoWalls) wallsForRoom(this.level, pts, this.settings, !this.level.walls.length);
    this.app.select({ kind: 'room', id: room.id });
    this.app.commit('Add room');
  }

  // ----- doors & windows -----
  openingPreview(w) {
    const prod = this.app.activeProduct;
    if (!prod) return null;
    const nw = this.nearestWall(w, 30);
    if (!nw) return null;
    const L = wallLength(nw.wall), half = (prod.w || 3) / 2;
    if (L < prod.w + 0.2) return { ...nw, bad: true };
    let c = nw.t * L;
    const step = this.settings.snap || 0.5;
    c = Math.round(c / step) * step;
    c = Math.max(half + 0.1, Math.min(L - half - 0.1, c));
    // no overlap with another opening
    const bad = wallOpenings(nw.wall, this.level.openings).some(s => c + half > s.u0 + 0.01 && c - half < s.u1 - 0.01);
    return { wall: nw.wall, t: c / L, bad, prod };
  }
  openingClick(P) {
    const pv = this.openingPreview(P.w);
    if (!pv) { this.app.status('Click on a wall to place the door or window.'); return; }
    if (pv.bad) { this.app.status('No room on that wall here (it is too short or another door / window is in the way).'); return; }
    const o = addOpening(this.level, pv.wall, pv.t, pv.prod);
    this.app.select({ kind: 'opening', id: o.id });
    this.app.commit('Add ' + (pv.prod.openingType || 'opening'));
  }

  // ----- placed items -----
  itemClick(P, e) {
    const prod = this.app.activeProduct; if (!prod) return;
    const p = (e && e.altKey) ? P.w : snapPt(P.w, (this.settings.snap || 0.5) / 2);
    const it = addItem(this.level, prod, p.x, p.y);
    it.rot = this.placeRot;
    this.app.select({ kind: 'item', id: it.id });
    this.app.commit('Place ' + prod.name);
  }

  // ----- picture underlay: click two points a known distance apart, type that distance -----
  calClick(P) {
    const u = this.level.underlay; if (!u) return;
    if (!this.cal) { this.cal = { a: P.w }; this.app.status('Now click the other end of a wall or dimension you know.'); this.draw(); return; }
    const a = this.cal.a, b = P.w; this.cal = null;
    const drawn = dist(a, b); if (drawn < 0.05) return;
    const txt = prompt('How long is that, really? (e.g. 24, 24\' 6", 24-6)', '');
    const real = parseLen(txt);
    if (!(real > 0)) { this.app.status('Scale not changed.'); return; }
    const k = real / drawn;
    // scale about point a, so a stays where it is
    u.x = a.x + (u.x - a.x) * k; u.y = a.y + (u.y - a.y) * k; u.scale *= k;
    this.app.setTool('select'); this.app.commit('Picture scaled'); this.fit();
  }

  // ----- select tool -----
  selectDown(P, e) {
    const h = this.hit(P.w);
    if (!h) { this.app.select(null); this.drag = { kind: 'pan', sx: P.sx, sy: P.sy, ox: this.view.ox, oy: this.view.oy }; return; }
    this.app.takeSnapshot();
    const start = P.w;
    switch (h.kind) {
      case 'wall-end': {
        const joined = wallsAtPoint(this.level, h.wall[h.end]);
        this.app.select({ kind: 'wall', id: h.wall.id });
        this.drag = { kind: 'wall-end', joined, origin: { ...h.wall[h.end] }, anchor: h.end === 'a' ? h.wall.b : h.wall.a, snapshot: true, label: 'Move wall end' };
        break;
      }
      case 'wall': {
        const wl = h.obj;
        this.app.select({ kind: 'wall', id: wl.id });
        const ja = wallsAtPoint(this.level, wl.a).filter(([w]) => w !== wl), jb = wallsAtPoint(this.level, wl.b).filter(([w]) => w !== wl);
        this.drag = { kind: 'wall', wall: wl, start, a0: { ...wl.a }, b0: { ...wl.b }, ja, jb, snapshot: true, label: 'Move wall' };
        break;
      }
      case 'opening': this.app.select({ kind: 'opening', id: h.obj.id }); this.drag = { kind: 'opening', obj: h.obj, wall: h.wall, snapshot: true, label: 'Move door / window' }; break;
      case 'item': this.app.select({ kind: 'item', id: h.obj.id }); this.drag = { kind: 'item', obj: h.obj, start, x0: h.obj.x, y0: h.obj.y, snapshot: true, label: 'Move item' }; break;
      case 'item-rot': this.drag = { kind: 'item-rot', obj: h.item, snapshot: true, label: 'Rotate item' }; break;
      case 'room': this.app.select({ kind: 'room', id: h.obj.id }); this.drag = { kind: 'room', obj: h.obj, start, pts0: h.obj.points.map(p => ({ ...p })), snapshot: true, label: 'Move room' }; break;
      case 'room-pt': this.drag = { kind: 'room-pt', obj: h.room, i: h.i, snapshot: true, label: 'Reshape room' }; break;
      case 'roof': this.app.select({ kind: 'roof', id: h.obj.id }); this.drag = { kind: 'roof', obj: h.obj, start, x0: h.obj.x, y0: h.obj.y, snapshot: true, label: 'Move roof' }; break;
      case 'roof-corner': { const rf = h.roof; const c = rectPts(rf.x, rf.y, rf.w, rf.d); this.drag = { kind: 'roof-corner', obj: rf, opp: c[(h.i + 2) % 4], snapshot: true, label: 'Resize roof' }; break; }
    }
    this.draw();
  }
  selectDrag(P, e) {
    const d = this.drag, step = this.settings.snap || 0.5;
    d.moved = true;
    const delta = (a) => { let dx = P.w.x - a.x, dy = P.w.y - a.y; if (!e.altKey) { dx = Math.round(dx / step) * step; dy = Math.round(dy / step) * step; } return { dx, dy }; };
    switch (d.kind) {
      case 'wall-end': {
        const p = this.snapWorld(P.w, e, d.anchor);
        d.joined.forEach(([w, end]) => { w[end] = { ...p }; });
        this.app.status(`Wall ${fmtFtIn(dist(d.anchor, p))}`);
        break;
      }
      case 'wall': {
        const { dx, dy } = delta(d.start);
        d.wall.a = { x: d.a0.x + dx, y: d.a0.y + dy }; d.wall.b = { x: d.b0.x + dx, y: d.b0.y + dy };
        d.ja.forEach(([w, end]) => { w[end] = { ...d.wall.a }; }); d.jb.forEach(([w, end]) => { w[end] = { ...d.wall.b }; });
        break;
      }
      case 'opening': {
        const wl = d.wall, L = wallLength(wl), pr = projectOnSeg(P.w, wl.a, wl.b);
        let c = Math.round(pr.t * L / step) * step; const half = d.obj.width / 2;
        c = Math.max(half + 0.05, Math.min(L - half - 0.05, c));
        d.obj.t = c / L;
        this.app.status(`From wall start: ${fmtFtIn(c - half)} to the edge · ${fmtFtIn(L - c - half)} to the other end`);
        break;
      }
      case 'item': { const { dx, dy } = delta(d.start); d.obj.x = d.x0 + dx; d.obj.y = d.y0 + dy; break; }
      case 'item-rot': {
        let a = Math.atan2(P.w.y - d.obj.y, P.w.x - d.obj.x) * 180 / Math.PI + 90;
        if (!e.shiftKey) a = Math.round(a / 15) * 15;
        d.obj.rot = ((a % 360) + 360) % 360; this.app.status(`Rotation ${d.obj.rot}°`);
        break;
      }
      case 'room': { const { dx, dy } = delta(d.start); d.obj.points = d.pts0.map(p => ({ x: p.x + dx, y: p.y + dy })); break; }
      case 'room-pt': { const p = this.snapWorld(P.w, e); d.obj.points[d.i] = p; break; }
      case 'roof': { const { dx, dy } = delta(d.start); d.obj.x = d.x0 + dx; d.obj.y = d.y0 + dy; break; }
      case 'roof-corner': {
        const p = this.snapWorld(P.w, e);
        d.obj.x = Math.min(p.x, d.opp.x); d.obj.y = Math.min(p.y, d.opp.y); d.obj.w = Math.max(1, Math.abs(p.x - d.opp.x)); d.obj.d = Math.max(1, Math.abs(p.y - d.opp.y));
        this.app.status(`Roof ${fmtFtIn(d.obj.w)} × ${fmtFtIn(d.obj.d)}`);
        break;
      }
    }
    this.app.refresh(false, true);
    this.draw();
  }

  rectInfo() {
    if (!this.dragRect) return '';
    const { a, b } = this.dragRect;
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    return `${fmtFtIn(w)} × ${fmtFtIn(h)} = ${Math.round(w * h)} SF`;
  }

  deleteSelection() {
    const s = this.app.selection; if (!s) return false;
    const L = this.level;
    if (s.kind === 'wall') removeWall(L, s.id);
    else if (s.kind === 'opening') L.openings = L.openings.filter(o => o.id !== s.id);
    else if (s.kind === 'item') L.items = L.items.filter(o => o.id !== s.id);
    else if (s.kind === 'room') L.rooms = L.rooms.filter(o => o.id !== s.id);
    else if (s.kind === 'roof') this.project.roofs = this.project.roofs.filter(o => o.id !== s.id);
    else return false;
    this.app.select(null);
    this.app.commit('Delete');
    return true;
  }

  // ================= drawing =================
  draw() {
    const c = this.ctx, dpr = this.dpr || 1;
    if (!this.app.project) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();
    this.colors = { existing: col('--plan-existing') || '#9aa0a6', newWork: col('--plan-new') || '#d9822b', bg: col('--plan-bg'), grid: col('--plan-grid'), grid5: col('--plan-grid5'), wall: col('--plan-wall'), wallExt: col('--plan-wall-ext'), text: col('--plan-text'), sel: col('--accent'), ghost: col('--plan-ghost'), dim: col('--plan-dim') };
    const C = this.colors;
    c.fillStyle = C.bg; c.fillRect(0, 0, this.w, this.h);
    this.drawGrid();
    this.drawUnderlay();
    const li = this.project.levels.indexOf(this.level);
    if (li > 0) this.drawGhost(this.project.levels[li - 1]);
    this.drawRooms();
    if (this.app.showRoofs) this.drawRoofs();
    this.drawWalls();
    this.drawOpenings();
    this.drawItems();
    this.drawRoomLabels();
    this.drawSelectionDims();
    this.drawTools();
  }

  // A picture (scan, sketch, photo of a plan, satellite view) under the drawing, at a set scale.
  drawUnderlay() {
    const u = this.level.underlay; if (!u || !u.src || u.hidden) return;
    if (!this._uimg || this._uimg.src !== u.src) { this._uimg = new Image(); this._uimg.onload = () => this.draw(); this._uimg.src = u.src; return; }
    if (!this._uimg.complete) return;
    const s0 = this.toScreen({ x: u.x, y: u.y }), k = u.scale * this.view.scale;
    this.ctx.globalAlpha = u.opacity ?? 0.5; this.ctx.drawImage(this._uimg, s0.x, s0.y, this._uimg.width * k, this._uimg.height * k); this.ctx.globalAlpha = 1;
  }
  drawGrid() {
    const c = this.ctx, s = this.view.scale, C = this.colors;
    let step = 1; while (step * s < 8) step *= 5;
    const w0 = this.toWorld(0, 0), w1 = this.toWorld(this.w, this.h);
    c.lineWidth = 1;
    for (let pass = 0; pass < 2; pass++) {
      const st = pass === 0 ? step : step * 5;
      c.strokeStyle = pass === 0 ? C.grid : C.grid5;
      c.beginPath();
      for (let x = Math.floor(w0.x / st) * st; x <= w1.x; x += st) { const X = Math.round(x * s + this.view.ox) + 0.5; c.moveTo(X, 0); c.lineTo(X, this.h); }
      for (let y = Math.floor(w0.y / st) * st; y <= w1.y; y += st) { const Y = Math.round(y * s + this.view.oy) + 0.5; c.moveTo(0, Y); c.lineTo(this.w, Y); }
      c.stroke();
    }
    // scale bar
    c.fillStyle = C.dim; c.font = '11px system-ui, sans-serif';
    let bar = 1; while (bar * s < 60) bar = bar < 5 ? bar + 4 : bar * 2;
    const y = this.h - 16; c.fillRect(14, y, bar * s, 3); c.fillText(fmtFtIn(bar), 18 + bar * s, y + 5);
  }

  drawGhost(level) {
    const c = this.ctx; c.strokeStyle = this.colors.ghost; c.lineWidth = Math.max(1, 0.4 * this.view.scale); c.setLineDash([4, 4]);
    level.walls.forEach(w => { const a = this.toScreen(w.a), b = this.toScreen(w.b); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); });
    c.setLineDash([]);
  }

  drawRooms() {
    const c = this.ctx, sel = this.app.selection;
    this.level.rooms.forEach(r => {
      const prod = findProduct(this.app.catalog, r.floorId);
      c.beginPath(); r.points.forEach((p, i) => { const s = this.toScreen(p); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); }); c.closePath();
      c.globalAlpha = (r.phase === 'existing' ? 0.16 : 0.35); c.fillStyle = prod ? prod.color : '#cccccc'; c.fill(); c.globalAlpha = 1;
      if (r.phase === 'demo') { c.setLineDash([5, 4]); c.strokeStyle = '#d0392b'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
      if (r.damaged) { c.save(); c.clip(); c.strokeStyle = 'rgba(208,57,43,.45)'; c.lineWidth = 2; c.beginPath(); const bb0 = bbox(r.points), a0 = this.toScreen({ x: bb0.x, y: bb0.y }), a1 = this.toScreen({ x: bb0.x + bb0.w, y: bb0.y + bb0.h }); for (let k = a0.x - (a1.y - a0.y); k < a1.x; k += 12) { c.moveTo(k, a1.y); c.lineTo(k + (a1.y - a0.y), a0.y); } c.stroke(); c.restore(); }
      if (r.outdoor) { c.setLineDash([2, 4]); c.strokeStyle = this.colors.dim; c.lineWidth = 1; c.stroke(); c.setLineDash([]); }
      if (sel && sel.kind === 'room' && sel.id === r.id) {
        c.strokeStyle = this.colors.sel; c.lineWidth = 2; c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]);
        r.points.forEach(p => this.handle(p));
      }
    });
  }
  drawRoomLabels() {
    const c = this.ctx;
    this.level.rooms.forEach(r => {
      const ct = centroid(r.points), s = this.toScreen(ct);
      if (this.view.scale > 5) {
        c.fillStyle = this.colors.text; c.textAlign = 'center';
        c.font = `600 ${Math.min(14, Math.max(10, this.view.scale * 0.8))}px system-ui, sans-serif`;
        c.lineJoin = 'round'; c.strokeStyle = this.colors.bg; c.lineWidth = 3.5;
        c.strokeText(r.name, s.x, s.y - 2); c.fillText(r.name, s.x, s.y - 2);
        c.font = `${Math.min(12, Math.max(9, this.view.scale * 0.65))}px system-ui, sans-serif`;
        c.fillStyle = this.colors.dim;
        const bb = bbox(r.points);
        const dims = r.points.length === 4 ? `${fmtFtIn(bb.w)} × ${fmtFtIn(bb.h)} · ` : '';
        c.strokeText(dims + Math.round(polyArea(r.points)) + ' SF', s.x, s.y + 13); c.fillText(dims + Math.round(polyArea(r.points)) + ' SF', s.x, s.y + 13);
        c.textAlign = 'start';
      }
    });
  }

  wallPoly(w) {
    const d = wallDir(w), n = { x: -d.y, y: d.x }, t = w.thickness / 2;
    return [{ x: w.a.x + n.x * t, y: w.a.y + n.y * t }, { x: w.b.x + n.x * t, y: w.b.y + n.y * t }, { x: w.b.x - n.x * t, y: w.b.y - n.y * t }, { x: w.a.x - n.x * t, y: w.a.y - n.y * t }];
  }
  // Are phases in use (anything marked Existing or Demolish)? Then new work is drawn in its own color.
  phased() { return this.project.levels.some(l => ['walls', 'rooms', 'openings', 'items'].some(k => l[k].some(o => o.phase && o.phase !== 'new'))) || this.project.roofs.some(r => r.phase && r.phase !== 'new'); }
  drawWalls() {
    const c = this.ctx, sel = this.app.selection, C = this.colors;
    // joints: draw round caps by filling circles at ends, then the bodies
    this.level.walls.forEach(w => {
      const poly = this.wallPoly(w).map(p => this.toScreen(p));
      c.beginPath(); poly.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
      const ph = w.phase || 'new', phased = this.phased();
      if (ph === 'demo') { c.setLineDash([5, 4]); c.strokeStyle = '#d0392b'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); c.globalAlpha = 0.12; c.fillStyle = '#d0392b'; c.fill(); c.globalAlpha = 1; return; }
      c.fillStyle = phased && ph === 'existing' ? C.existing : phased && ph === 'new' ? C.newWork : (w.exterior ? C.wallExt : C.wall); c.fill();
      if (phased && ph === 'existing') { c.save(); c.clip(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.beginPath(); for (let k = -400; k < 400; k += 6) { c.moveTo(poly[0].x + k, poly[0].y - 200); c.lineTo(poly[0].x + k + 200, poly[0].y); } c.stroke(); c.restore(); }
      const r = w.thickness / 2 * this.view.scale;
      c.fillStyle = phased && ph === 'existing' ? C.existing : phased && ph === 'new' ? C.newWork : (w.exterior ? C.wallExt : C.wall);
      [w.a, w.b].forEach(p => { const s = this.toScreen(p); c.fillRect(s.x - r, s.y - r, r * 2, r * 2); });
    });
    this.level.walls.forEach(w => {
      const isSel = sel && sel.kind === 'wall' && sel.id === w.id;
      const isHover = this.hover && this.hover.kind === 'wall' && this.hover.obj === w;
      if (isSel || isHover) {
        const poly = this.wallPoly(w).map(p => this.toScreen(p));
        c.beginPath(); poly.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
        c.strokeStyle = C.sel; c.lineWidth = isSel ? 2.5 : 1.5; c.stroke();
        if (isSel) { this.handle(w.a); this.handle(w.b); }
      }
      // length label
      if (this.app.showDims && this.view.scale > 4) {
        const L = wallLength(w); if (L < 1.5) return;
        const m = lerp(w.a, w.b, 0.5), d = wallDir(w), off = (w.thickness / 2) + 10 / this.view.scale;
        const n = { x: -d.y, y: d.x };
        const s = this.toScreen({ x: m.x + n.x * off * (w.exterior ? -1 : 1), y: m.y + n.y * off * (w.exterior ? -1 : 1) });
        c.save(); c.translate(s.x, s.y);
        let a = Math.atan2(d.y, d.x); if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
        c.rotate(a); c.font = '11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const txt = fmtFtIn(L); const tw = c.measureText(txt).width;
        c.fillStyle = C.bg; c.globalAlpha = 0.85; c.fillRect(-tw / 2 - 2, -7, tw + 4, 14); c.globalAlpha = 1;
        c.fillStyle = C.dim; c.fillText(txt, 0, 0); c.restore();
      }
    });
  }

  drawOpenings() {
    const c = this.ctx, sel = this.app.selection, C = this.colors, s = this.view.scale;
    this.level.openings.forEach(o => {
      const w = this.level.walls.find(x => x.id === o.wallId); if (!w) return;
      const L = wallLength(w), d = wallDir(w), n = { x: -d.y, y: d.x };
      const c0 = o.t * L - o.width / 2, c1 = o.t * L + o.width / 2;
      const A = { x: w.a.x + d.x * c0, y: w.a.y + d.y * c0 }, B = { x: w.a.x + d.x * c1, y: w.a.y + d.y * c1 };
      const t = w.thickness / 2 + 0.02;
      const quad = [{ x: A.x + n.x * t, y: A.y + n.y * t }, { x: B.x + n.x * t, y: B.y + n.y * t }, { x: B.x - n.x * t, y: B.y - n.y * t }, { x: A.x - n.x * t, y: A.y - n.y * t }].map(p => this.toScreen(p));
      c.beginPath(); quad.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
      c.fillStyle = C.bg; c.fill();
      if (o.phase === 'demo') { c.strokeStyle = '#d0392b'; c.lineWidth = 2; c.beginPath(); c.moveTo(quad[0].x, quad[0].y); c.lineTo(quad[2].x, quad[2].y); c.moveTo(quad[1].x, quad[1].y); c.lineTo(quad[3].x, quad[3].y); c.stroke(); }
      c.strokeStyle = C.text; c.lineWidth = 1;
      const sA = this.toScreen(A), sB = this.toScreen(B);
      if (o.type === 'window' || o.type === 'slider') {
        c.stroke();
        c.beginPath(); c.moveTo(sA.x, sA.y); c.lineTo(sB.x, sB.y); c.strokeStyle = '#3d8bd4'; c.lineWidth = 2; c.stroke();
      } else if (o.type === 'door') {
        const side = o.flip ? -1 : 1, hingeAtA = o.hinge !== 'right';
        const H = hingeAtA ? A : B, other = hingeAtA ? B : A;
        const tip = { x: H.x + n.x * o.width * side, y: H.y + n.y * o.width * side };
        const sH = this.toScreen(H), sT = this.toScreen(tip);
        c.beginPath(); c.moveTo(sH.x, sH.y); c.lineTo(sT.x, sT.y); c.lineWidth = 2; c.stroke();
        const a0 = Math.atan2(other.y - H.y, other.x - H.x), a1 = Math.atan2(tip.y - H.y, tip.x - H.x);
        c.beginPath(); c.lineWidth = 1; c.setLineDash([3, 3]);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        c.arc(sH.x, sH.y, o.width * s, a0, a1, da < 0); c.stroke(); c.setLineDash([]);
      } else if (o.type === 'garage') {
        c.setLineDash([6, 3]); c.stroke(); c.setLineDash([]);
      } else { c.setLineDash([2, 3]); c.beginPath(); c.moveTo(sA.x, sA.y); c.lineTo(sB.x, sB.y); c.stroke(); c.setLineDash([]); }
      if (sel && sel.kind === 'opening' && sel.id === o.id) {
        c.beginPath(); quad.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.strokeStyle = C.sel; c.lineWidth = 2.5; c.stroke();
        // distances to the wall ends
        if (this.app.showDims) {
          this.dimLine(w.a, A, n, -(w.thickness / 2 + 22 / s));
          this.dimLine(B, w.b, n, -(w.thickness / 2 + 22 / s));
        }
      }
    });
  }

  drawItems() {
    const c = this.ctx, sel = this.app.selection, C = this.colors;
    this.level.items.forEach(it => {
      const p = findProduct(this.app.catalog, it.productId);
      const s = this.toScreen(it), sc = this.view.scale;
      c.save(); c.translate(s.x, s.y); c.rotate(it.rot * Math.PI / 180);
      const w = it.w * sc, d = it.d * sc;
      c.fillStyle = p ? p.color : '#999'; c.globalAlpha = (it.elev || 0) > 3 ? 0.45 : 0.85;
      if (p && (p.objType === 'cyl')) { c.beginPath(); c.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; c.strokeStyle = C.text; c.lineWidth = 1; c.stroke(); }
      else { c.fillRect(-w / 2, -d / 2, w, d); c.globalAlpha = 1; c.strokeStyle = C.text; c.lineWidth = 1; c.strokeRect(-w / 2, -d / 2, w, d);
        // front edge marker
        c.beginPath(); c.moveTo(-w / 2 + 2, d / 2 - 2); c.lineTo(w / 2 - 2, d / 2 - 2); c.strokeStyle = 'rgba(0,0,0,.35)'; c.stroke(); }
      if (p && p.objType === 'toilet') { c.beginPath(); c.ellipse(0, d * 0.12, w * 0.38, d * 0.32, 0, 0, Math.PI * 2); c.strokeStyle = C.text; c.stroke(); }
      if (sc > 8 && w > 30) { c.fillStyle = '#111'; c.font = '10px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; const lbl = it.label || (p ? p.name.split(/[–(]/)[0].trim() : '?'); c.fillText(lbl.length > 22 ? lbl.slice(0, 21) + '…' : lbl, 0, 0, w - 4); }
      if (sel && sel.kind === 'item' && sel.id === it.id) { c.strokeStyle = C.sel; c.lineWidth = 2.5; c.strokeRect(-w / 2 - 2, -d / 2 - 2, w + 4, d + 4); }
      c.restore();
      if (sel && sel.kind === 'item' && sel.id === it.id) {
        const hp = this.itemRotHandle(it), sh = this.toScreen(hp);
        c.beginPath(); c.arc(sh.x, sh.y, 6, 0, Math.PI * 2); c.fillStyle = C.sel; c.fill();
        c.fillStyle = '#fff'; c.font = '10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('↻', sh.x, sh.y + 0.5); c.textBaseline = 'alphabetic'; c.textAlign = 'start';
      }
    });
  }

  drawRoofs() {
    const c = this.ctx, sel = this.app.selection, C = this.colors;
    this.roofsHere().forEach(rf => {
      const isSel = sel && sel.kind === 'roof' && sel.id === rf.id;
      const o = rf.overhang || 0;
      const outer = rectPts(rf.x - o, rf.y - o, rf.w + 2 * o, rf.d + 2 * o).map(p => this.toScreen(p));
      c.beginPath(); outer.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
      c.strokeStyle = isSel ? C.sel : '#c0392b'; c.lineWidth = isSel ? 2.5 : 1.2; c.setLineDash([8, 5]); c.stroke(); c.setLineDash([]);
      // ridge / hip lines
      const ax = ridgeAxis(rf); c.beginPath();
      const X0 = rf.x - o, X1 = rf.x + rf.w + o, Y0 = rf.y - o, Y1 = rf.y + rf.d + o;
      const L = (pt) => this.toScreen(pt);
      if (rf.style === 'gable') { const m = ax === 'x' ? [{ x: X0, y: (Y0 + Y1) / 2 }, { x: X1, y: (Y0 + Y1) / 2 }] : [{ x: (X0 + X1) / 2, y: Y0 }, { x: (X0 + X1) / 2, y: Y1 }]; const a = L(m[0]), b = L(m[1]); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
      if (rf.style === 'hip') {
        const S = ax === 'x' ? Y1 - Y0 : X1 - X0, run = S / 2;
        let r1, r2;
        if (ax === 'x') { r1 = { x: Math.min(X0 + run, (X0 + X1) / 2), y: (Y0 + Y1) / 2 }; r2 = { x: Math.max(X1 - run, (X0 + X1) / 2), y: (Y0 + Y1) / 2 }; }
        else { r1 = { x: (X0 + X1) / 2, y: Math.min(Y0 + run, (Y0 + Y1) / 2) }; r2 = { x: (X0 + X1) / 2, y: Math.max(Y1 - run, (Y0 + Y1) / 2) }; }
        const A = L(r1), B = L(r2); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y);
        const corners = ax === 'x' ? [[{ x: X0, y: Y0 }, r1], [{ x: X0, y: Y1 }, r1], [{ x: X1, y: Y0 }, r2], [{ x: X1, y: Y1 }, r2]] : [[{ x: X0, y: Y0 }, r1], [{ x: X1, y: Y0 }, r1], [{ x: X0, y: Y1 }, r2], [{ x: X1, y: Y1 }, r2]];
        corners.forEach(([p, q]) => { const a = L(p), b = L(q); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); });
      }
      if (rf.style === 'shed') { // arrow down-slope
        const m = L({ x: (X0 + X1) / 2, y: (Y0 + Y1) / 2 });
        const dir = ax === 'x' ? { x: 0, y: -1 } : { x: -1, y: 0 };
        c.moveTo(m.x, m.y); c.lineTo(m.x + dir.x * 30, m.y + dir.y * 30);
      }
      c.strokeStyle = isSel ? C.sel : '#c0392b'; c.lineWidth = 1; c.stroke();
      const lab = L({ x: X0, y: Y0 });
      c.fillStyle = '#c0392b'; c.font = '600 11px system-ui'; c.fillText(rf.style === 'flat' ? 'Flat roof' : `${rf.style} ${rf.pitch}/12`, lab.x + 4, lab.y + 13);
      if (isSel) rectPts(rf.x, rf.y, rf.w, rf.d).forEach(p => this.handle(p));
    });
  }

  dimLine(p, q, n, off) {
    const c = this.ctx, L = dist(p, q); if (L < 0.2) return;
    const a = this.toScreen({ x: p.x + n.x * off, y: p.y + n.y * off }), b = this.toScreen({ x: q.x + n.x * off, y: q.y + n.y * off });
    c.strokeStyle = this.colors.sel; c.lineWidth = 1; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    [a, b].forEach(e => { c.beginPath(); c.arc(e.x, e.y, 2, 0, 7); c.fillStyle = this.colors.sel; c.fill(); });
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, txt = fmtFtIn(L);
    c.font = '600 11px system-ui'; const tw = c.measureText(txt).width;
    c.fillStyle = this.colors.bg; c.fillRect(m.x - tw / 2 - 3, m.y - 8, tw + 6, 16);
    c.fillStyle = this.colors.sel; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, m.x, m.y); c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  }

  drawSelectionDims() {
    const sel = this.app.selection; if (!sel || !this.app.showDims) return;
    if (sel.kind === 'room') {
      const r = this.level.rooms.find(x => x.id === sel.id); if (!r) return;
      const sgn = Math.sign(polyArea(r.points) && (r.points.reduce((s, p, i) => { const q = r.points[(i + 1) % r.points.length]; return s + p.x * q.y - q.x * p.y; }, 0))) || 1;
      for (let i = 0; i < r.points.length; i++) {
        const a = r.points[i], b = r.points[(i + 1) % r.points.length], L = dist(a, b) || 1;
        const n = { x: (b.y - a.y) / L * sgn, y: -(b.x - a.x) / L * sgn };
        this.dimLine(a, b, n, -14 / this.view.scale);
      }
    }
  }

  handle(p) {
    const c = this.ctx, s = this.toScreen(p);
    c.fillStyle = '#fff'; c.strokeStyle = this.colors.sel; c.lineWidth = 2;
    c.beginPath(); c.rect(s.x - 4.5, s.y - 4.5, 9, 9); c.fill(); c.stroke();
  }

  drawTools() {
    const c = this.ctx, C = this.colors, tool = this.app.tool;
    const m = this.mouse;
    if (this.snapMark) {
      const s = this.toScreen(this.snapMark);
      c.strokeStyle = this.snapMark.kind === 'close' ? '#27ae60' : '#e67e22'; c.lineWidth = 2;
      c.beginPath(); if (this.snapMark.kind === 'on') { c.moveTo(s.x - 6, s.y); c.lineTo(s.x + 6, s.y); c.moveTo(s.x, s.y - 6); c.lineTo(s.x, s.y + 6); } else c.arc(s.x, s.y, 7, 0, 7); c.stroke();
    }
    if ((tool === 'wall' && this.chain) || (tool === 'roompoly' && this.poly)) {
      const pts = tool === 'wall' ? this.chain.pts : this.poly;
      const last = pts[pts.length - 1], cur = m.snap || m.w;
      c.strokeStyle = C.sel; c.lineWidth = tool === 'wall' ? Math.max(2, (this.app.wallExterior ? this.settings.extThick : this.settings.intThick) * this.view.scale) : 2;
      c.globalAlpha = 0.6; c.beginPath();
      const s0 = this.toScreen(pts[0]); c.moveTo(s0.x, s0.y);
      if (tool === 'roompoly') pts.slice(1).forEach(p => { const s = this.toScreen(p); c.lineTo(s.x, s.y); });
      else { c.moveTo(this.toScreen(last).x, this.toScreen(last).y); }
      const sc = this.toScreen(cur); c.lineTo(sc.x, sc.y); c.stroke(); c.globalAlpha = 1;
      const d = { x: cur.x - last.x, y: cur.y - last.y }, L = Math.hypot(d.x, d.y);
      if (L > 0.1) this.dimLine(last, cur, { x: -d.y / L, y: d.x / L }, 18 / this.view.scale);
    }
    if (tool === 'wall' && !this.chain && m.snap) { const s = this.toScreen(m.snap); c.fillStyle = C.sel; c.beginPath(); c.arc(s.x, s.y, 3.5, 0, 7); c.fill(); }
    if (this.dragRect) {
      const { a, b, tool: t } = this.dragRect;
      const A = this.toScreen(a), B = this.toScreen(b);
      c.strokeStyle = t === 'roof' ? '#c0392b' : C.sel; c.setLineDash([6, 4]); c.lineWidth = 2; c.strokeRect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y)); c.setLineDash([]);
      this.dimLine({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) }, { x: 0, y: 1 }, -16 / this.view.scale);
      this.dimLine({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) }, { x: 1, y: 0 }, -16 / this.view.scale);
    }
    if (tool === 'opening' && m.w) {
      const pv = this.openingPreview(m.w);
      if (pv && pv.wall) {
        const w = pv.wall, L = wallLength(w), d = wallDir(w), pw = (pv.prod ? pv.prod.w : 3);
        const cc = (pv.t || 0) * L; const A = { x: w.a.x + d.x * (cc - pw / 2), y: w.a.y + d.y * (cc - pw / 2) }, B = { x: w.a.x + d.x * (cc + pw / 2), y: w.a.y + d.y * (cc + pw / 2) };
        const sA = this.toScreen(A), sB = this.toScreen(B);
        c.strokeStyle = pv.bad ? '#e74c3c' : '#27ae60'; c.lineWidth = Math.max(4, w.thickness * this.view.scale + 2); c.globalAlpha = 0.7;
        c.beginPath(); c.moveTo(sA.x, sA.y); c.lineTo(sB.x, sB.y); c.stroke(); c.globalAlpha = 1;
        if (!pv.bad) { const n = { x: -d.y, y: d.x }; this.dimLine(w.a, A, n, -(w.thickness / 2 + 20 / this.view.scale)); this.dimLine(B, w.b, n, -(w.thickness / 2 + 20 / this.view.scale)); }
      }
    }
    if (tool === 'item' && m.w && this.app.activeProduct) {
      const p = this.app.activeProduct, s = this.toScreen(m.w), sc = this.view.scale;
      c.save(); c.translate(s.x, s.y); c.rotate(this.placeRot * Math.PI / 180); c.globalAlpha = 0.5; c.fillStyle = p.color;
      c.fillRect(-(p.w || 2) * sc / 2, -(p.d || 2) * sc / 2, (p.w || 2) * sc, (p.d || 2) * sc); c.globalAlpha = 1; c.strokeStyle = C.sel; c.strokeRect(-(p.w || 2) * sc / 2, -(p.d || 2) * sc / 2, (p.w || 2) * sc, (p.d || 2) * sc); c.restore();
    }
    if (this.measure) {
      const { a, b } = this.measure; const d = { x: b.x - a.x, y: b.y - a.y }, L = Math.hypot(d.x, d.y) || 1;
      this.dimLine(a, b, { x: -d.y / L, y: d.x / L }, 0);
    }
  }

  // PNG of the plan for printing (white background, fitted).
  snapshot(widthPx = 1600, heightPx = 1100) {
    const saved = { view: { ...this.view }, w: this.w, h: this.h, dpr: this.dpr, sel: this.app.selection };
    const cv = document.createElement('canvas'); cv.width = widthPx; cv.height = heightPx;
    const oldCv = this.cv, oldCtx = this.ctx;
    this.cv = cv; this.ctx = cv.getContext('2d'); this.w = widthPx; this.h = heightPx; this.dpr = 1;
    this.app.selection = null; const oldTool = this.app.tool; this.app.tool = 'none'; this.snapMark = null;
    document.documentElement.classList.add('print-colors');
    this.fit();
    document.documentElement.classList.remove('print-colors');
    const url = cv.toDataURL('image/png');
    this.cv = oldCv; this.ctx = oldCtx; this.view = saved.view; this.w = saved.w; this.h = saved.h; this.dpr = saved.dpr; this.app.selection = saved.sel; this.app.tool = oldTool;
    this.draw();
    return url;
  }
}
