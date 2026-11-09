// PlanBuilder app: ties the plan editor, 3D view, catalog, estimate and saving together.

import { Plan2D } from './plan2d.js';
import { fmtFtIn, parseFtIn, wallLength, wallDir, roofMeasure, bbox } from './geom.js';
import { newLevel, restack, normalize, fromTemplate, TEMPLATES, PROJECT_TYPES, splitWall, wallsForRoom, autoRoof, markExterior, uid, swingDoorsIntoRooms } from './model.js';
import { CATEGORIES, UNITS, KINDS, findProduct, categoryName, CSV_COLUMNS, toCSV, catalogFromCSV, EXTERIOR_CATS, OUTDOOR_CATS } from './catalog.js';
import { computeTakeoff, estimateCSV, roomStats } from './takeoff.js';
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = v => '$' + Math.round(v).toLocaleString('en-US');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => { const n = parseFloat(v); return isFinite(n) ? n : d; };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(k => { if (k == null || k === false) return; el.append(k.nodeType ? k : document.createTextNode(String(k))); });
  return el;
}

const app = {
  project: null, level: null, catalog: [], selection: null, tool: 'select', view: 'plan',
  activeProduct: null, wallExterior: false, autoWalls: true, showDims: true, showRoofs: true,
  undo: [], redo: [], lastSaved: null, view3d: null, plan: null, takeoff: null,

  // ---------- startup ----------
  async init() {
    this.catalog = store.loadCatalog();
    const last = store.lastProjectId();
    const p = last && store.loadProject(last);
    this.plan = new Plan2D($('#plan'), this);
    this.bindUI();
    if (p) this.open(p); else this.open(fromTemplate('ranch', this.catalog), true);
    this.renderPicker();
    if (!p) this.toast('Started with the Ranch sample. 📁 Projects → New to start a blank or another template.');
  },

  open(p, isNew = false) {
    this.project = normalize(p);
    this.level = this.project.levels[0];
    this.selection = null; this.undo = []; this.redo = [];
    this.lastSaved = JSON.stringify(this.project);
    if (isNew) store.saveProject(this.project);
    $('#prj-name').value = this.project.name;
    this.refresh(true);
    requestAnimationFrame(() => { this.plan.resize(); this.plan.fit(); if (this.view3d) { this.view3d.rebuild(); this.view3d.fit(); } });
  },

  // ---------- change tracking ----------
  takeSnapshot() { /* the state before a change is always this.lastSaved */ },
  dropSnapshot() { },
  commit(label) {
    const now = JSON.stringify(this.project);
    if (now === this.lastSaved) return;
    this.undo.push(this.lastSaved); if (this.undo.length > 150) this.undo.shift();
    this.redo = [];
    this.lastSaved = now;
    this.save();
    this.refresh(true);
    if (label) this.status(label + ' ✓');
  },
  doUndo() {
    if (this.plan.chain) this.plan.cancel();
    if (!this.undo.length) return this.toast('Nothing to undo.');
    this.redo.push(this.lastSaved); this.lastSaved = this.undo.pop();
    this.restore(this.lastSaved);
  },
  doRedo() {
    if (!this.redo.length) return this.toast('Nothing to redo.');
    this.undo.push(this.lastSaved); this.lastSaved = this.redo.pop();
    this.restore(this.lastSaved);
  },
  restore(json) {
    const lvId = this.level && this.level.id;
    this.project = normalize(JSON.parse(json));
    this.level = this.project.levels.find(l => l.id === lvId) || this.project.levels[0];
    if (this.selection && !this.findSel(this.selection)) this.selection = null;
    $('#prj-name').value = this.project.name;
    this.save(); this.refresh(true);
  },
  save() {
    const ok = store.saveProject(this.project);
    $('#save-state').textContent = ok ? 'Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '⚠ Not saved (browser storage full)';
  },

  refresh(full = true, fast = false) {
    this.plan.draw();
    if (fast) { if (this.view === '3d' || this.view === 'split') this.schedule3D(); return; }
    this.takeoff = computeTakeoff(this.project, this.catalog);
    $('#totals').textContent = `${Math.round(this.takeoff.summary.floorArea).toLocaleString()} SF · ${this.takeoff.summary.roofSquares.toFixed(1)} SQ roof · ${money0(this.takeoff.totals.grand)}`;
    this.renderLevels();
    this.renderProps();
    this.updateUndo();
    if (this.view === '3d' || this.view === 'split') this.schedule3D();
    if (this.view === 'estimate') this.renderEstimate();
  },
  schedule3D() {
    clearTimeout(this._t3);
    this._t3 = setTimeout(() => this.view3d && this.view3d.rebuild(), 120);
  },
  updateUndo() { $('#btn-undo').disabled = !this.undo.length; $('#btn-redo').disabled = !this.redo.length; },

  status(msg) { $('#status').textContent = msg || this.toolHint(); },
  toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(this._toast); this._toast = setTimeout(() => { t.hidden = true; }, ms); },

  // ---------- selection ----------
  select(sel) { this.selection = sel; this.renderProps(); this.plan.draw(); },
  findSel(sel) {
    if (!sel) return null;
    if (sel.kind === 'roof') return this.project.roofs.find(r => r.id === sel.id) || null;
    const L = this.level;
    const list = { wall: L.walls, opening: L.openings, room: L.rooms, item: L.items }[sel.kind];
    return list ? list.find(x => x.id === sel.id) || null : null;
  },
  pickFrom3D(pk) {
    const lv = this.project.levels.find(l => l.id === pk.levelId);
    if (lv && lv !== this.level) { this.level = lv; this.refresh(true); }
    this.setTool('select');
    this.select({ kind: pk.kind, id: pk.id });
  },
  nextRoomName() { return 'Room ' + (this.level.rooms.length + 1); },
  roofDefaults() { const last = this.project.roofs[this.project.roofs.length - 1]; return last ? { style: last.style, pitch: last.pitch, overhang: last.overhang, materialId: last.materialId } : { style: 'gable', pitch: 6, overhang: 1 }; },
  splitWallAt(w, t) { splitWall(this.level, w, t); this.commit('Split wall'); },
  focusProp(name) { const el = $(`#props [data-prop="${name}"]`); if (el) { el.focus(); el.select && el.select(); } },

  // ---------- tools ----------
  setTool(t) {
    if (this.plan.chain || this.plan.poly) this.plan.finishTool();
    this.tool = t;
    $$('.tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    $('#len-wrap').hidden = !(t === 'wall' || t === 'roompoly');
    if ((t === 'opening' && (!this.activeProduct || this.activeProduct.kind !== 'opening')) ) { this.activeProduct = this.catalog.find(p => p.kind === 'opening') || null; $('#pick-cat').value = 'door'; this.renderPicker(); }
    if ((t === 'item' && (!this.activeProduct || this.activeProduct.kind !== 'object'))) { this.activeProduct = this.catalog.find(p => p.kind === 'object') || null; $('#pick-cat').value = 'cabinet'; this.renderPicker(); }
    this.plan.cv.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.status();
    this.plan.draw();
  },
  toolHint() {
    return {
      select: 'Click to select · drag to move · drag a wall end to stretch · double-click a wall to split it · Delete removes · Space+drag or right-drag pans · wheel zooms',
      wall: 'Click to start, click each corner. Type a length + Enter for exact walls. Shift = any angle, Alt = no snap. Double-click / Esc to finish.',
      room: 'Drag a rectangle for a room. Its walls are made too (turn off "Rooms make their walls" to skip).',
      roompoly: 'Click each corner of the room, then click the first corner (or double-click) to close it.',
      opening: `Click a wall to place: ${this.activeProduct ? this.activeProduct.name : 'pick a door or window on the left'}.`,
      item: `Click to place: ${this.activeProduct ? this.activeProduct.name : 'pick a product on the left'} · Q / E rotate 90°.`,
      roof: 'Drag a rectangle over the walls it covers (wall line to wall line; the overhang is added). Set style and pitch on the right.',
      measure: 'Click two points to measure.',
    }[this.tool] || '';
  },

  // Clicking a product in the picker
  useProduct(p) {
    this.activeProduct = p;
    const sel = this.selection, obj = this.findSel(sel);
    if (p.kind === 'opening') {
      if (obj && sel.kind === 'opening' && this.tool === 'select') { Object.assign(obj, { productId: p.id, type: p.openingType || obj.type, width: p.w || obj.width, height: p.h || obj.height, sill: p.sill ?? obj.sill }); this.commit('Changed to ' + p.name); }
      else this.setTool('opening');
    } else if (p.kind === 'object') {
      if (obj && sel.kind === 'item' && this.tool === 'select') { obj.productId = p.id; this.commit('Changed to ' + p.name); }
      else this.setTool('item');
    } else if (p.kind === 'floor') {
      if (obj && sel.kind === 'room') {
        if (p.ceiling) obj.ceilingId = p.id;
        else { obj.floorId = p.id; if (OUTDOOR_CATS.includes(p.category)) obj.outdoor = true; }
        this.commit(`${p.ceiling ? 'Ceiling' : (obj.outdoor ? 'Surface' : 'Floor')}: ${p.name}`);
      } else this.toast(OUTDOOR_CATS.includes(p.category) ? 'Draw the yard, bed, patio or drive with the Room or Shape tool, then click this to cover it.' : 'Select a room first, then click a floor to apply it.');
    } else if (p.kind === 'wall') {
      if (obj && sel.kind === 'room') {
        if (p.category === 'paint' && /ceiling/i.test(p.name)) obj.ceilingId = p.id; else obj.wallFinishId = p.id;
        this.commit('Walls: ' + p.name);
      } else if (obj && sel.kind === 'wall') {
        if (obj.exterior && EXTERIOR_CATS.includes(p.category)) obj.finishOut = p.id; else obj.finishIn = p.id;
        this.commit('Wall finish: ' + p.name);
      } else if (EXTERIOR_CATS.includes(p.category)) { this.project.settings.exteriorFinishId = p.id; this.commit('All outside walls: ' + p.name); }
      else this.toast('Select a room or a wall first, then click a finish to apply it.');
    } else if (p.kind === 'roof') {
      if (p.roofPart) { this.toast('Roof accessories are set in the Estimate tab (Roof accessories).'); }
      else if (obj && sel.kind === 'roof') { obj.materialId = p.id; this.commit('Roof: ' + p.name); }
      else if (this.project.roofs.length) { this.project.roofs.forEach(r => { r.materialId = p.id; }); this.commit('All roofs: ' + p.name); }
      else this.toast('Draw a roof first (⌂ Roof tool, or select the level and use "Auto roof").');
    } else if (p.kind === 'labor') {
      this.project.extraLines.push({ id: uid('xl'), productId: p.id, qty: 1, note: '' });
      this.commit('Added to estimate: ' + p.name);
    }
    this.renderPicker();
  },

  // ---------- UI binding ----------
  bindUI() {
    $$('.tools button').forEach(b => b.addEventListener('click', () => this.setTool(b.dataset.tool)));
    $$('.views button').forEach(b => b.addEventListener('click', () => this.setView(b.dataset.view)));
    $('#opt-ext').addEventListener('change', e => { this.wallExterior = e.target.checked; });
    $('#opt-autowalls').addEventListener('change', e => { this.autoWalls = e.target.checked; });
    $('#opt-dims').addEventListener('change', e => { this.showDims = e.target.checked; this.plan.draw(); });
    $('#opt-roofs').addEventListener('change', e => { this.showRoofs = e.target.checked; this.plan.draw(); });
    $('#plan-fit').addEventListener('click', () => this.plan.fit());
    $('#plan-zin').addEventListener('click', () => this.plan.zoomAt(this.plan.w / 2, this.plan.h / 2, 1.25));
    $('#plan-zout').addEventListener('click', () => this.plan.zoomAt(this.plan.w / 2, this.plan.h / 2, 0.8));
    $('#btn-make3d').addEventListener('click', () => this.make3D());
    $('#v-build').addEventListener('click', () => this.make3D());
    $('#btn-undo').addEventListener('click', () => this.doUndo());
    $('#btn-redo').addEventListener('click', () => this.doRedo());
    $('#prj-name').addEventListener('change', e => { this.project.name = e.target.value.trim() || 'Untitled plan'; this.commit('Renamed'); });
    $('#btn-projects').addEventListener('click', () => this.showProjects());
    $('#btn-catalog').addEventListener('click', () => this.showCatalog());
    $('#btn-export').addEventListener('click', e => { e.stopPropagation(); $('#menu-export').hidden = !$('#menu-export').hidden; });
    document.addEventListener('click', () => { $('#menu-export').hidden = true; });
    $$('#menu-export button').forEach(b => b.addEventListener('click', () => this.exportAs(b.dataset.exp)));
    $('#modal-x').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') this.closeModal(); });
    $('#pick-cat').innerHTML = '<option value="">All products</option>' + CATEGORIES.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('');
    $('#pick-cat').addEventListener('change', () => this.renderPicker());
    $('#pick-q').addEventListener('input', () => this.renderPicker());
    $('#pick-brand').addEventListener('change', () => this.renderPicker());
    const len = $('#len');
    len.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const ft = parseFtIn(len.value); if (this.plan.applyLength(ft)) { len.value = ''; } else this.toast('Type a length like 12, 12.5, 12\' 6" or 12-6. Click the first corner first.'); e.preventDefault(); }
      if (e.key === 'Escape') { len.value = ''; len.blur(); this.plan.finishTool(); }
    });
    // 3D options
    $('#v-roof').addEventListener('change', e => { this.ensure3D().opts.showRoof = e.target.checked; this.view3d.rebuild(); });
    $('#v-cut').addEventListener('change', e => { this.ensure3D().opts.cutaway = e.target.checked; this.view3d.rebuild(); });
    $('#v-ceil').addEventListener('change', e => { this.ensure3D().opts.ceilings = e.target.checked; this.view3d.rebuild(); });
    $('#v-level').addEventListener('change', e => { this.ensure3D().opts.upTo = +e.target.value; this.view3d.rebuild(); });
    $('#v-preset').addEventListener('change', e => { if (e.target.value) this.ensure3D().setPreset(e.target.value); e.target.value = ''; });
    $('#v-walk').addEventListener('click', e => { const v = this.ensure3D(); const on = !v.walk; v.toggleWalk(on); e.target.classList.toggle('on', on); this.status(on ? 'Walking: W A S D or arrows to move (Shift = faster), drag to look around.' : ''); });
    window.addEventListener('resize', () => { if (this.view3d) this.view3d.resize(); });
    window.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('beforeprint', () => { if (!this._printing) this.buildPrint(); });
  },

  onKey(e) {
    const tag = e.target.tagName;
    const typing = /TEXTAREA|SELECT/.test(tag) || (tag === 'INPUT' && !/checkbox|radio|button|color/.test(e.target.type));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); this.doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !typing) { e.preventDefault(); this.duplicateSel(); return; }
    if (typing) return;
    if (this.view3d && this.view3d.walk) return;
    if ((this.tool === 'wall' && this.plan.chain) || (this.tool === 'roompoly' && this.plan.poly)) {
      if (/^[0-9.]$/.test(e.key)) { const len = $('#len'); len.focus(); len.value = ''; return; }
    }
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { if (!$('#modal').hidden) return this.closeModal(); if (this.plan.chain || this.plan.poly || this.plan.measure) this.plan.finishTool(); else { this.setTool('select'); this.select(null); } return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (this.plan.deleteSelection()) e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const map = { v: 'select', w: 'wall', r: 'room', p: 'roompoly', d: 'opening', i: 'item', f: 'roof', m: 'measure' };
    if (map[k]) { this.setTool(map[k]); return; }
    if (k === 'q' || k === 'e') {
      const dlt = k === 'q' ? -90 : 90;
      if (this.tool === 'item') { this.plan.placeRot = (this.plan.placeRot + dlt + 360) % 360; this.plan.draw(); }
      else if (this.selection && this.selection.kind === 'item') { const it = this.findSel(this.selection); it.rot = (it.rot + dlt + 360) % 360; this.commit('Rotate'); }
    }
  },

  duplicateSel() {
    const s = this.selection, o = this.findSel(s); if (!o) return;
    if (s.kind === 'item') { const c = { ...o, id: uid('it'), x: o.x + 1, y: o.y + 1 }; this.level.items.push(c); this.select({ kind: 'item', id: c.id }); this.commit('Duplicate'); }
    else if (s.kind === 'room') { const c = { ...o, id: uid('rm'), name: o.name + ' copy', points: o.points.map(p => ({ x: p.x + 2, y: p.y + 2 })) }; this.level.rooms.push(c); this.select({ kind: 'room', id: c.id }); this.commit('Duplicate'); }
    else if (s.kind === 'roof') { const c = { ...o, id: uid('rf'), x: o.x + 2, y: o.y + 2 }; this.project.roofs.push(c); this.select({ kind: 'roof', id: c.id }); this.commit('Duplicate'); }
  },

  // ---------- views ----------
  async load3D() {
    if (this.view3d) return this.view3d;
    try {
      const { View3D } = await import('./view3d.js');
      this.view3d = new View3D($('#view-pane'), this);
      return this.view3d;
    } catch (e) {
      console.error(e);
      $('#view-pane').innerHTML = '<p style="padding:30px">The 3D view could not start on this device (WebGL is off or unavailable). The plan and estimate still work.</p>';
      return null;
    }
  },
  async setView(v) {
    this.view = v;
    $$('.views button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    const stage = $('#stage');
    stage.classList.toggle('split', v === 'split');
    $('#plan-pane').hidden = !(v === 'plan' || v === 'split');
    $('#view-pane').hidden = !(v === '3d' || v === 'split');
    $('#est-pane').hidden = v !== 'estimate';
    $('.left').style.display = v === 'estimate' ? 'none' : '';
    $('.right').style.display = v === 'estimate' ? 'none' : '';
    this.plan.resize();
    if (v === '3d' || v === 'split') {
      const first = !this.view3d;
      const v3 = await this.load3D();
      if (v3) { v3.visible = true; v3.resize(); v3.rebuild(); if (first || !this._fitted3d) { v3.fit(); this._fitted3d = true; } this.renderLevelSelect(); }
    } else if (this.view3d) this.view3d.visible = false;
    if (v === 'estimate') this.renderEstimate();
  },
  // 🏗 Make 3D: open the 3D view and watch the model build itself.
  async make3D() {
    if (this.view !== '3d' && this.view !== 'split') await this.setView('3d');
    const v = this.view3d; if (!v) return;
    if (v.walk) { v.toggleWalk(false); $('#v-walk').classList.remove('on'); }
    v.rebuild(); v.fit();
    this.status('Building… click the 3D view to skip to the finished model.');
    v.playBuild({ onDone: () => this.status('') });
  },
  renderLevelSelect() {
    const s = $('#v-level'); const cur = this.view3d ? this.view3d.opts.upTo : -1;
    s.innerHTML = '<option value="-1">All levels</option>' + this.project.levels.map((l, i) => `<option value="${i}">Up to ${esc(l.name)}</option>`).join('');
    s.value = String(cur);
  },

  // ---------- levels bar ----------
  renderLevels() {
    const bar = $('#levels'); bar.innerHTML = '';
    this.project.levels.forEach(l => {
      bar.append(h('button', { class: l === this.level ? 'on' : '', onclick: () => { this.level = l; this.selection = null; this.plan.cancel(); this.refresh(true); }, ondblclick: () => this.select(null) }, l.name));
    });
    bar.append(h('button', { title: 'Add a level above', onclick: () => this.addLevel() }, '＋ Level'));
    const lv = this.takeoff && this.takeoff.summary.levels.find(x => x.id === this.level.id);
    if (lv) bar.append(h('span', { class: 'lv-meta' }, `${this.level.name}: ${Math.round(lv.floorArea).toLocaleString()} SF · walls ${fmtFtIn(this.level.height)} high · ${this.level.walls.length} walls · ${this.level.rooms.length} rooms`));
    if (this.view3d) this.renderLevelSelect();
  },
  addLevel() {
    const below = this.project.levels[this.project.levels.length - 1];
    this.modal(h('div', {},
      h('h2', {}, 'Add a level'),
      h('div', { class: 'grid-cards' },
        h('div', { class: 'card' }, h('h4', {}, 'Copy the outside walls'), h('p', {}, `Starts the new floor with the outside walls of ${below.name}.`), h('button', { class: 'btn primary', onclick: () => this._addLevel(true) }, 'Add with outside walls')),
        h('div', { class: 'card' }, h('h4', {}, 'Empty level'), h('p', {}, 'A blank floor above. Good for a bonus room or a partial second story.'), h('button', { class: 'btn', onclick: () => this._addLevel(false) }, 'Add empty level')),
      )));
  },
  _addLevel(copyExt) {
    const below = this.project.levels[this.project.levels.length - 1];
    const n = this.project.levels.length;
    const L = newLevel(n === 1 ? 'Second floor' : n === 2 ? 'Third floor' : `Level ${n + 1}`, 8);
    if (copyExt) below.walls.filter(w => w.exterior).forEach(w => L.walls.push({ ...w, id: uid('w'), a: { ...w.a }, b: { ...w.b } }));
    this.project.levels.push(L); restack(this.project);
    // roofs on the level below move up to the new top level when they covered the whole footprint
    this.level = L; this.closeModal(); this.commit('Add level');
  },

  // ---------- product picker ----------
  renderPicker() {
    const cat = $('#pick-cat').value, q = $('#pick-q').value.trim().toLowerCase(), brand = $('#pick-brand').value;
    const brands = [...new Set(this.catalog.filter(p => !cat || p.category === cat).map(p => p.brand).filter(Boolean))].sort();
    const bs = $('#pick-brand'); const keep = brands.includes(brand) ? brand : '';
    bs.innerHTML = '<option value="">All brands</option>' + brands.map(b => `<option>${esc(b)}</option>`).join(''); bs.value = keep;
    const list = $('#pick-list'); list.innerHTML = '';
    const items = this.catalog.filter(p => (!cat || p.category === cat) && (!keep || p.brand === keep) && (!q || q.split(/\s+/).every(w => productText(p).includes(w))));
    if (!items.length) list.append(h('p', { class: 'hint' }, 'No products. Add some in 📦 Catalog.'));
    items.forEach(p => {
      list.append(h('div', { class: 'pcard' + (this.activeProduct && this.activeProduct.id === p.id ? ' on' : ''), title: p.notes || p.name, onclick: () => this.useProduct(p) },
        swatch(p), h('div', {}, h('div', { class: 'nm' }, p.name), (p.brand || p.colorName || p.finish || p.material) ? h('div', { class: 'pr' }, [p.brand && !p.name.includes(p.brand) ? p.brand : '', p.colorName && !p.name.includes(p.colorName) ? p.colorName : '', p.material && !p.name.includes(p.material) ? p.material : '', p.finish].filter(Boolean).join(' · ')) : null, h('div', { class: 'pr' }, `${money(+p.price + +p.labor)} / ${p.unit}` + (p.w ? ` · ${fmtFtIn(p.w)}${p.d ? ' × ' + fmtFtIn(p.d) : ''}${p.h ? ' × ' + fmtFtIn(p.h) : ''}` : '')))));
    });
  },

  // ---------- properties panel ----------
  renderProps() {
    const el = $('#props'); el.innerHTML = '';
    const sel = this.selection, obj = this.findSel(sel);
    if (!obj) return this.renderProjectProps(el);
    const P = this.project, s = P.settings;
    const set = (fn, label) => () => { fn(); this.commit(label || 'Changed'); };
    if (sel.kind === 'wall') {
      const w = obj, L = wallLength(w);
      el.append(h('h3', {}, w.exterior ? 'Outside wall' : 'Inside wall'), h('div', { class: 'sub' }, `${fmtFtIn(L)} long · ${Math.round(L * (w.height || this.level.height))} SF per side`));
      el.append(lengthField('Length', L, v => { if (v > 0.1) { const d = wallDir(w); w.b = { x: w.a.x + d.x * v, y: w.a.y + d.y * v }; this.commit('Wall length'); } }, 'length'));
      el.append(field('Thickness (in)', h('input', { type: 'number', step: '0.5', min: '2', value: +(w.thickness * 12).toFixed(2), onchange: e => { w.thickness = Math.max(2, num(e.target.value, 4.5)) / 12; this.commit('Wall thickness'); } })));
      el.append(lengthField('Height', w.height || 0, v => { w.height = v > 0 ? v : 0; this.commit('Wall height'); }, '', `Blank = level height (${fmtFtIn(this.level.height)})`));
      el.append(field('Outside wall', h('input', { type: 'checkbox', checked: w.exterior, onchange: e => { w.exterior = e.target.checked; w.thickness = w.exterior ? s.extThick : s.intThick; this.commit('Wall type'); } })));
      if (w.exterior) el.append(field('Outside finish', productSelect(this.catalog, p => p.kind === 'wall' && EXTERIOR_CATS.includes(p.category), w.finishOut, v => { w.finishOut = v; this.commit('Outside finish'); }, `Project default`)));
      el.append(field('Inside face', productSelect(this.catalog, p => p.kind === 'wall' && p.category === 'drywall', w.finishIn, v => { w.finishIn = v; this.commit('Inside finish'); }, 'Project drywall')));
      el.append(h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => this.splitWallAt(w, 0.5) }, 'Split in half'),
        h('button', { class: 'btn small', onclick: () => { const a = w.a; w.a = w.b; w.b = a; this.level.openings.forEach(o => { if (o.wallId === w.id) o.t = 1 - o.t; }); this.commit('Flip wall'); } }, 'Flip direction'),
        h('button', { class: 'btn small danger', onclick: () => this.plan.deleteSelection() }, 'Delete')));
    } else if (sel.kind === 'opening') {
      const o = obj, w = this.level.walls.find(x => x.id === o.wallId), L = w ? wallLength(w) : 0;
      el.append(h('h3', {}, { door: 'Door', window: 'Window', slider: 'Sliding door', garage: 'Garage door', opening: 'Opening' }[o.type] || 'Opening'), h('div', { class: 'sub' }, `${fmtFtIn(o.width)} × ${fmtFtIn(o.height)}` + (o.sill ? ` · sill ${fmtFtIn(o.sill)}` : '')));
      el.append(field('Product', productSelect(this.catalog, p => p.kind === 'opening', o.productId, v => { const p = findProduct(this.catalog, v); o.productId = v; if (p) Object.assign(o, { type: p.openingType || o.type, width: p.w || o.width, height: p.h || o.height, sill: p.sill ?? o.sill }); this.commit('Product'); }, 'None (not priced)')));
      el.append(field('Type', select([['door', 'Door'], ['window', 'Window'], ['slider', 'Sliding door'], ['garage', 'Garage door'], ['opening', 'Cased opening']], o.type, v => { o.type = v; this.commit('Type'); })));
      el.append(lengthField('Width', o.width, v => { if (v > 0.5 && v < L) { o.width = v; this.commit('Width'); } }));
      el.append(lengthField('Height', o.height, v => { if (v > 0.5) { o.height = v; this.commit('Height'); } }));
      el.append(lengthField('Sill height', o.sill || 0, v => { o.sill = Math.max(0, v || 0); this.commit('Sill'); }));
      if (w) el.append(lengthField('From wall start', o.t * L - o.width / 2, v => { const c = Math.max(o.width / 2, Math.min(L - o.width / 2, v + o.width / 2)); o.t = c / L; this.commit('Position'); }, '', 'Edge of the opening from the start of the wall'));
      if (o.type === 'door') el.append(h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: set(() => { o.hinge = o.hinge === 'right' ? 'left' : 'right'; }, 'Hinge side') }, '⇆ Hinge side'),
        h('button', { class: 'btn small', onclick: set(() => { o.flip = !o.flip; }, 'Swing') }, '⇅ Swing in / out')));
      el.append(h('div', { class: 'row' }, h('button', { class: 'btn small danger', onclick: () => this.plan.deleteSelection() }, 'Delete')));
    } else if (sel.kind === 'room') {
      const r = obj, st = roomStats(r, this.level);
      el.append(h('h3', {}, r.name), h('div', { class: 'sub' }, `${Math.round(st.area)} SF floor · ${fmtFtIn(st.perim)} around`));
      el.append(field('Name', h('input', { 'data-prop': 'name', value: r.name, onchange: e => { r.name = e.target.value || 'Room'; this.commit('Room name'); } })));
      el.append(field('Outside area', h('input', { type: 'checkbox', title: 'Yard, bed, patio, drive or deck: priced by its surface only (no walls, ceiling or trim)', checked: !!r.outdoor, onchange: e => { r.outdoor = e.target.checked; this.commit(r.outdoor ? 'Outside area' : 'Inside room'); } })));
      if (r.outdoor) {
        el.append(field('Surface', productSelect(this.catalog, p => p.kind === 'floor' && !p.ceiling, r.floorId, v => { r.floorId = v; this.commit('Surface'); }, 'None')));
        el.append(field('Under it', productSelect(this.catalog, p => p.kind === 'floor' && (p.category === 'landscape' || p.category === 'hardscape'), r.underId || '', v => { r.underId = v; this.commit('Under layer'); }, 'Nothing')));
      } else {
        el.append(field('Floor', productSelect(this.catalog, p => p.kind === 'floor' && !p.ceiling, r.floorId, v => { r.floorId = v; this.commit('Floor'); }, 'None')));
        el.append(field('Walls', productSelect(this.catalog, p => p.kind === 'wall' && !['drywall', 'trim', 'siding', 'masonry'].includes(p.category), r.wallFinishId, v => { r.wallFinishId = v; this.commit('Wall finish'); }, 'None')));
        el.append(field('Ceiling', productSelect(this.catalog, p => (p.kind === 'wall' && p.category === 'paint') || p.ceiling, r.ceilingId, v => { r.ceilingId = v; this.commit('Ceiling'); }, 'Project default')));
        el.append(lengthField('Ceiling height', r.height || 0, v => { r.height = v > 0 ? v : 0; this.commit('Ceiling height'); }, '', `Blank = level height (${fmtFtIn(this.level.height)})`));
        el.append(field('Baseboard', h('input', { type: 'checkbox', checked: r.baseboard !== false, onchange: e => { r.baseboard = e.target.checked; this.commit('Baseboard'); } })));
      }
      if (r.points.length === 4) {
        const b = bbox(r.points);
        el.append(lengthField('Width (E–W)', b.w, v => { if (v > 0.5) { r.points = r.points.map(p => ({ x: b.x + (p.x - b.x) * v / b.w, y: p.y })); this.commit('Room size'); } }));
        el.append(lengthField('Depth (N–S)', b.h, v => { if (v > 0.5) { r.points = r.points.map(p => ({ x: p.x, y: b.y + (p.y - b.y) * v / b.h })); this.commit('Room size'); } }));
      }
      if (r.outdoor) el.append(h('div', { class: 'kv' }, h('span', {}, 'Area'), h('b', {}, Math.round(st.area) + ' SF'), h('span', {}, 'Edge'), h('b', {}, fmtFtIn(st.perim))));
      else el.append(h('div', { class: 'kv' },
        h('span', {}, 'Floor area'), h('b', {}, Math.round(st.area) + ' SF'),
        h('span', {}, 'Wall area (less openings)'), h('b', {}, Math.round(st.wallArea) + ' SF'),
        h('span', {}, 'Ceiling area'), h('b', {}, Math.round(st.area) + ' SF'),
        h('span', {}, 'Baseboard'), h('b', {}, fmtFtIn(st.baseLF)),
        h('span', {}, 'Doors / windows on its walls'), h('b', {}, String(st.openings))));
      el.append(field('Notes', h('textarea', { rows: 2, value: r.notes || '', placeholder: 'Damage notes, photos taken…', onchange: e => { r.notes = e.target.value; this.commit('Notes'); } }), true));
      el.append(h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => { const n = wallsForRoom(this.level, r.points, s, false).length; this.commit(n ? `${n} walls added` : 'Walls already there'); } }, 'Make its walls'),
        h('button', { class: 'btn small', onclick: () => this.duplicateSel() }, 'Duplicate'),
        h('button', { class: 'btn small danger', onclick: () => this.plan.deleteSelection() }, 'Delete')));
    } else if (sel.kind === 'item') {
      const it = obj, p = findProduct(this.catalog, it.productId);
      el.append(h('h3', {}, it.label || (p ? p.name : 'Item')), h('div', { class: 'sub' }, p ? `${money(+p.price + +p.labor)} / ${p.unit}` + (p.unit === 'LF' ? ` × ${fmtFtIn(it.w)} = ${money((+p.price + +p.labor) * it.w)}` : '') : 'Not in the catalog'));
      el.append(field('Product', productSelect(this.catalog, x => x.kind === 'object', it.productId, v => { it.productId = v; this.commit('Product'); })));
      el.append(field('Label', h('input', { value: it.label || '', placeholder: 'Optional', onchange: e => { it.label = e.target.value; this.commit('Label'); } })));
      el.append(lengthField('Width', it.w, v => { if (v > 0.05) { it.w = v; this.commit('Size'); } }));
      el.append(lengthField('Depth', it.d, v => { if (v > 0.05) { it.d = v; this.commit('Size'); } }));
      el.append(lengthField('Height', it.h, v => { if (v > 0.05) { it.h = v; this.commit('Size'); } }));
      el.append(lengthField('Off the floor', it.elev || 0, v => { it.elev = Math.max(0, v || 0); this.commit('Height off floor'); }));
      el.append(field('Rotation °', h('input', { type: 'number', step: '15', value: it.rot, onchange: e => { it.rot = ((num(e.target.value) % 360) + 360) % 360; this.commit('Rotate'); } })));
      el.append(h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: set(() => { it.rot = (it.rot + 90) % 360; }, 'Rotate') }, '↻ 90°'),
        h('button', { class: 'btn small', onclick: () => this.duplicateSel() }, 'Duplicate (Ctrl+D)'),
        h('button', { class: 'btn small danger', onclick: () => this.plan.deleteSelection() }, 'Delete')));
    } else if (sel.kind === 'roof') {
      const r = obj, m = roofMeasure(r);
      el.append(h('h3', {}, 'Roof'), h('div', { class: 'sub' }, `${m.squares.toFixed(2)} squares (${Math.round(m.area)} SF) before waste`));
      el.append(field('Style', select([['gable', 'Gable'], ['hip', 'Hip'], ['shed', 'Shed'], ['flat', 'Flat / low slope']], r.style, v => { r.style = v; if (v === 'flat') { r.pitch = 0; } else if (!r.pitch) r.pitch = 6; this.commit('Roof style'); })));
      if (r.style !== 'flat') el.append(field('Pitch (x/12)', h('input', { type: 'number', step: '0.5', min: '0', max: '24', value: r.pitch, onchange: e => { r.pitch = Math.max(0, Math.min(24, num(e.target.value, 6))); this.commit('Pitch'); } })));
      if (r.style !== 'flat') el.append(field('Ridge runs', select([['auto', 'Along the long side'], ['x', 'East – west'], ['y', 'North – south']], r.ridge, v => { r.ridge = v; this.commit('Ridge'); })));
      el.append(lengthField('Overhang', r.overhang, v => { r.overhang = Math.max(0, v || 0); this.commit('Overhang'); }));
      if (r.style === 'flat') el.append(lengthField('Parapet', r.parapet || 0, v => { r.parapet = Math.max(0, v || 0); this.commit('Parapet'); }));
      el.append(field('Covering', productSelect(this.catalog, p => p.kind === 'roof' && !p.roofPart, r.materialId, v => { r.materialId = v; this.commit('Roof covering'); })));
      el.append(field('Layers to tear off', h('input', { type: 'number', min: '0', max: '4', step: '1', value: r.layers ?? 1, onchange: e => { r.layers = Math.max(0, Math.min(4, Math.round(num(e.target.value, 1)))); this.commit('Layers'); } })));
      el.append(field('Sits on', select(this.project.levels.map(l => [l.id, l.name]), r.levelId, v => { r.levelId = v; this.commit('Roof level'); })));
      el.append(lengthField('Width (E–W)', r.w, v => { if (v > 1) { r.w = v; this.commit('Roof size'); } }));
      el.append(lengthField('Depth (N–S)', r.d, v => { if (v > 1) { r.d = v; this.commit('Roof size'); } }));
      el.append(h('div', { class: 'kv' },
        h('span', {}, 'Squares'), h('b', {}, m.squares.toFixed(2)),
        h('span', {}, 'Pitch factor'), h('b', {}, m.factor.toFixed(3)),
        h('span', {}, 'Ridge'), h('b', {}, fmtFtIn(m.ridge)),
        h('span', {}, 'Hips'), h('b', {}, fmtFtIn(m.hips)),
        h('span', {}, 'Eaves'), h('b', {}, fmtFtIn(m.eaves)),
        h('span', {}, 'Rakes'), h('b', {}, fmtFtIn(m.rakes)),
        h('span', {}, 'Ridge height above walls'), h('b', {}, fmtFtIn(m.rise))));
      el.append(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => this.duplicateSel() }, 'Duplicate'), h('button', { class: 'btn small danger', onclick: () => this.plan.deleteSelection() }, 'Delete')));
    }
  },

  renderProjectProps(el) {
    const P = this.project, L = this.level, s = P.settings;
    const t = this.takeoff;
    el.append(h('h3', {}, 'Project'), h('div', { class: 'sub' }, 'Nothing selected. Click something on the plan to edit it.'));
    el.append(field('Type', select(PROJECT_TYPES, P.type, v => { P.type = v; this.commit('Project type'); this.renderProps(); })));
    const txt = (label, key, ph) => field(label, h('input', { value: P[key] || '', placeholder: ph || '', onchange: e => { P[key] = e.target.value; this.commit(label); } }));
    el.append(txt('Client', 'client'), txt('Address', 'address'));
    if (P.type === 'insurance') el.append(txt('Claim #', 'claimNo'), txt('Carrier', 'carrier'), txt('Adjuster', 'adjuster'), field('Date of loss', h('input', { type: 'date', value: P.dateOfLoss || '', onchange: e => { P.dateOfLoss = e.target.value; this.commit('Date of loss'); } })));
    el.append(field('Notes', h('textarea', { rows: 2, value: P.notes || '', onchange: e => { P.notes = e.target.value; this.commit('Notes'); } }), true));
    el.append(h('hr', { class: 'sep' }), h('h3', {}, 'This level'));
    el.append(field('Name', h('input', { value: L.name, onchange: e => { L.name = e.target.value || 'Level'; this.commit('Level name'); } })));
    el.append(lengthField('Wall height', L.height, v => { if (v > 2) { L.height = v; restack(P); this.commit('Wall height'); } }));
    el.append(h('div', { class: 'row' },
      h('button', { class: 'btn small', title: 'Marks the walls around the outside of the plan as outside walls', onclick: () => { const n = markExterior(L, s); this.commit(n ? `${n} walls marked outside` : 'No change'); } }, 'Find outside walls'),
      h('button', { class: 'btn small', title: 'Turns every door so it swings into its room, not into a hall', onclick: () => { const n = swingDoorsIntoRooms(L); this.commit(n ? `${n} doors turned to swing into their rooms` : 'Every door already swings into its room'); } }, 'Doors swing into rooms'),
      h('button', { class: 'btn small', onclick: () => { const r = autoRoof(P, L, this.roofDefaults()); if (r) { this.select({ kind: 'roof', id: r.id }); this.commit('Auto roof'); } else this.toast('Draw the walls first.'); } }, '⌂ Auto roof'),
      P.levels.length > 1 ? h('button', { class: 'btn small danger', onclick: () => { if (!confirm(`Delete ${L.name} and everything drawn on it?`)) return; P.roofs = P.roofs.filter(r => r.levelId !== L.id); P.levels = P.levels.filter(x => x !== L); restack(P); this.level = P.levels[0]; this.commit('Delete level'); } }, 'Delete level') : null));
    el.append(h('hr', { class: 'sep' }), h('h3', {}, 'Defaults'));
    el.append(field('Outside walls', productSelect(this.catalog, p => p.kind === 'wall' && EXTERIOR_CATS.includes(p.category), s.exteriorFinishId, v => { s.exteriorFinishId = v; this.commit('Outside finish'); }, 'None')));
    el.append(field('Drywall', productSelect(this.catalog, p => p.kind === 'wall' && p.category === 'drywall', s.drywallId, v => { s.drywallId = v; this.commit('Drywall'); }, 'Not included')));
    el.append(field('Ceilings', productSelect(this.catalog, p => (p.kind === 'wall' && p.category === 'paint') || p.ceiling, s.ceilingFinishId, v => { s.ceilingFinishId = v; this.commit('Ceilings'); }, 'Not included')));
    el.append(field('Baseboard', productSelect(this.catalog, p => p.category === 'trim', s.baseboardId, v => { s.baseboardId = v; this.commit('Baseboard'); }, 'Not included')));
    el.append(field('Outside wall (in)', h('input', { type: 'number', step: '0.5', value: +(s.extThick * 12).toFixed(2), onchange: e => { s.extThick = Math.max(2, num(e.target.value, 6)) / 12; this.commit('Thickness'); } })));
    el.append(field('Inside wall (in)', h('input', { type: 'number', step: '0.5', value: +(s.intThick * 12).toFixed(2), onchange: e => { s.intThick = Math.max(2, num(e.target.value, 4.5)) / 12; this.commit('Thickness'); } })));
    el.append(field('Snap', select([['0.0833333', '1"'], ['0.25', '3"'], ['0.5', '6"'], ['1', "1'"], ['0', 'Off']], String(s.snap), v => { s.snap = +v; this.commit('Snap'); })));
    if (t) {
      el.append(h('hr', { class: 'sep' }), h('h3', {}, 'Totals'));
      el.append(h('div', { class: 'kv' },
        h('span', {}, 'Floor area (all levels)'), h('b', {}, Math.round(t.summary.floorArea).toLocaleString() + ' SF'),
        h('span', {}, 'Outside walls'), h('b', {}, fmtFtIn(t.summary.extWallLF)),
        h('span', {}, 'Inside walls'), h('b', {}, fmtFtIn(t.summary.intWallLF)),
        h('span', {}, 'Roof'), h('b', {}, t.summary.roofSquares.toFixed(2) + ' SQ'),
        h('span', {}, 'Doors & windows'), h('b', {}, String(t.summary.openings)),
        h('span', {}, 'Estimate'), h('b', {}, money(t.totals.grand))));
      el.append(h('button', { class: 'btn primary', onclick: () => this.setView('estimate') }, 'Open the estimate →'));
    }
  },

  // ---------- estimate ----------
  renderEstimate() {
    const pane = $('#est-pane'); const P = this.project, s = P.settings;
    const t = this.takeoff = computeTakeoff(P, this.catalog);
    const pct = (label, key) => h('label', {}, label, h('input', { type: 'number', step: '0.25', value: s[key], onchange: e => { s[key] = num(e.target.value); this.commit(label); } }));
    const acc = s.roofAccessories;
    const accSel = (label, key, part) => h('label', {}, label, productSelect(this.catalog, p => p.roofPart === part, acc[key], v => { acc[key] = v; this.commit(label); }, 'Off'));
    const wrap = h('div', { class: 'est' });
    wrap.append(h('div', { class: 'est-head' },
      h('div', {}, h('h2', {}, P.name), h('div', { class: 'sub', style: 'color:var(--muted)' }, [P.client, P.address, P.claimNo ? 'Claim ' + P.claimNo : '', P.carrier].filter(Boolean).join(' · ') || 'Add client / address / claim on the Plan screen (nothing selected).')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.exportAs('csv') }, '⤓ Spreadsheet'), h('button', { class: 'btn primary', onclick: () => this.exportAs('print') }, '🖨 Print / PDF'))));
    wrap.append(h('div', { class: 'est-set' }, pct('Tax % (material)', 'taxRate'), pct('Overhead %', 'overheadPct'), pct('Profit %', 'profitPct'), pct('Floor waste %', 'floorWaste'), pct('Wall waste %', 'wallWaste'), pct('Roof waste %', 'roofWaste')));
    wrap.append(h('div', { class: 'est-set', style: 'margin-top:8px' }, accSel('Tear-off', 'tearoff', 'tearoff'), accSel('Ridge cap', 'ridgecap', 'ridgecap'), accSel('Drip edge', 'drip', 'drip'), accSel('Starter', 'starter', 'starter'), accSel('Ice & water', 'ice', 'ice'), accSel('Gutters', 'gutter', 'gutter')));
    const sm = t.summary;
    wrap.append(h('div', { class: 'summary' },
      h('div', {}, h('b', {}, Math.round(sm.floorArea).toLocaleString() + ' SF'), h('span', {}, 'Floor area')),
      h('div', {}, h('b', {}, sm.roofSquares.toFixed(2)), h('span', {}, 'Roof squares (before waste)')),
      h('div', {}, h('b', {}, fmtFtIn(sm.extWallLF)), h('span', {}, 'Outside walls')),
      h('div', {}, h('b', {}, String(sm.openings)), h('span', {}, 'Doors & windows')),
      h('div', {}, h('b', {}, money0(t.totals.grand)), h('span', {}, 'Total'))));
    t.warnings.forEach(w => wrap.append(h('div', { class: 'warn' }, '⚠ ' + w)));
    const tbl = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'n' }, 'Qty'), h('th', {}, 'Unit'), h('th', { class: 'n' }, 'Material'), h('th', { class: 'n' }, 'Labor'), h('th', { class: 'n' }, 'Total'), h('th', {}, ''))));
    const tb = h('tbody');
    t.groups.forEach(g => {
      tb.append(h('tr', { class: 'grp' }, h('td', { colspan: 5 }, g.name), h('td', { class: 'n' }, money(g.total)), h('td')));
      g.lines.forEach(l => {
        const x = l.extraId ? P.extraLines.find(e => e.id === l.extraId) : null;
        const qtyCell = x ? h('input', { type: 'number', step: '0.01', value: x.qty, onchange: e => { x.qty = num(e.target.value); this.commit('Quantity'); } }) : l.qty.toLocaleString('en-US', { maximumFractionDigits: 2 });
        tb.append(h('tr', {},
          h('td', {}, l.name, h('div', { class: 'src' }, l.source + (l.waste ? ` · +${l.waste}% waste` : ''))),
          h('td', { class: 'n' }, qtyCell), h('td', {}, l.unit),
          h('td', { class: 'n' }, money(l.material), h('div', { class: 'src' }, money(l.price) + '/' + l.unit)),
          h('td', { class: 'n' }, money(l.laborTotal), h('div', { class: 'src' }, money(l.labor) + '/' + l.unit)),
          h('td', { class: 'n' }, h('b', {}, money(l.total))),
          h('td', {}, x ? h('button', { class: 'btn small danger', title: 'Remove line', onclick: () => { P.extraLines = P.extraLines.filter(e => e !== x); this.commit('Removed line'); } }, '×') : '')));
      });
    });
    tbl.append(tb); wrap.append(tbl);
    // add a line
    const addSel = productSelect(this.catalog, () => true, '', () => {}, 'Add a line from the catalog…');
    const qty = h('input', { type: 'number', step: '0.01', value: '1', style: 'width:90px' });
    wrap.append(h('div', { class: 'row', style: 'margin-top:10px;align-items:center' }, addSel, qty,
      h('button', { class: 'btn', onclick: () => { if (!addSel.value) return; P.extraLines.push({ id: uid('xl'), productId: addSel.value, qty: num(qty.value, 1), note: '' }); this.commit('Line added'); } }, '+ Add line'),
      h('button', { class: 'btn', onclick: () => this.customLine() }, '+ Custom line')));
    const T = t.totals;
    wrap.append(h('div', { class: 'tot' },
      h('div', {}, h('span', {}, 'Material'), h('span', {}, money(T.material))),
      h('div', {}, h('span', {}, 'Labor'), h('span', {}, money(T.labor))),
      h('div', {}, h('span', {}, `Tax ${s.taxRate}% on material`), h('span', {}, money(T.tax))),
      h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, money(T.subtotal))),
      h('div', {}, h('span', {}, `Overhead ${s.overheadPct}%`), h('span', {}, money(T.overhead))),
      h('div', {}, h('span', {}, `Profit ${s.profitPct}%`), h('span', {}, money(T.profit))),
      h('div', { class: 'grand' }, h('span', {}, 'Total'), h('span', {}, money(T.grand)))));
    wrap.append(h('p', { class: 'hint', style: 'margin:14px 0' }, 'Quantities come from the drawing: floors from room areas, walls from wall lengths × heights less doors and windows, roofs from the roof sections with pitch and overhang. Prices come from 📦 Catalog. Check every number before sending.'));
    pane.innerHTML = ''; pane.append(wrap);
  },
  customLine() {
    const f = { name: h('input', { placeholder: 'Description' }), unit: select(UNITS.map(u => [u, u]), 'EA', () => {}), qty: h('input', { type: 'number', value: '1', step: '0.01' }), price: h('input', { type: 'number', value: '0', step: '0.01' }), labor: h('input', { type: 'number', value: '0', step: '0.01' }), category: select(CATEGORIES, 'other', () => {}) };
    this.modal(h('div', {}, h('h2', {}, 'Custom estimate line'),
      field('Description', f.name), field('Category', f.category), field('Unit', f.unit), field('Quantity', f.qty), field('Material / unit', f.price), field('Labor / unit', f.labor),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { if (!f.name.value.trim()) return; this.project.extraLines.push({ id: uid('xl'), name: f.name.value.trim(), unit: f.unit.value, qty: num(f.qty.value), price: num(f.price.value), labor: num(f.labor.value), category: f.category.value, note: 'Added by hand' }); this.closeModal(); this.commit('Line added'); } }, 'Add line'))));
  },

  // ---------- modal ----------
  modal(content) { const b = $('#modal-body'); b.innerHTML = ''; b.append(content); $('#modal').hidden = false; },
  closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; },

  // ---------- projects ----------
  showProjects() {
    const list = store.listProjects();
    const body = h('div', {});
    body.append(h('h2', {}, 'Projects'));
    body.append(h('h4', {}, 'Start a new one'));
    body.append(h('div', { class: 'grid-cards' }, TEMPLATES.map(t => h('div', { class: 'card' }, h('h4', {}, t.name), h('p', {}, t.desc), h('button', { class: 'btn primary small', onclick: () => { const p = fromTemplate(t.id, this.catalog); this.open(p, true); this.closeModal(); this.toast('New project: ' + p.name); } }, 'Start')))));
    body.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => {
      const f = await store.pickFile('.json,application/json'); if (!f) return;
      try { const p = normalize(JSON.parse(await store.readText(f))); if (!p.levels) throw new Error('not a plan'); if (store.listProjects().some(x => x.id === p.id) && !confirm('A project with this id is already saved here. Replace it?')) p.id = uid('prj'); this.open(p, true); this.closeModal(); this.toast('Imported ' + p.name); }
      catch (e) { alert('That file is not a PlanBuilder project.'); }
    } }, '⤒ Import a project file')));
    body.append(h('h4', { style: 'margin-top:18px' }, `Saved in this browser (${list.length})`));
    const tbl = h('table', { class: 'cat-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Client / address'), h('th', {}, 'Claim'), h('th', {}, 'Updated'), h('th', {}, ''))));
    const tb = h('tbody');
    list.forEach(x => tb.append(h('tr', {},
      h('td', {}, h('b', {}, x.name), x.id === this.project.id ? ' (open)' : ''), h('td', {}, [x.client, x.address].filter(Boolean).join(' · ')), h('td', {}, x.claimNo || ''), h('td', {}, new Date(x.updated).toLocaleString()),
      h('td', { style: 'white-space:nowrap' },
        h('button', { class: 'btn small', onclick: () => { const p = store.loadProject(x.id); if (p) { this.open(p); this.closeModal(); } } }, 'Open'), ' ',
        h('button', { class: 'btn small', onclick: () => { const p = store.loadProject(x.id); if (!p) return; p.id = uid('prj'); p.name += ' (copy)'; store.saveProject(p); this.showProjects(); } }, 'Copy'), ' ',
        h('button', { class: 'btn small danger', onclick: () => { if (!confirm(`Delete "${x.name}"? This cannot be undone (export it first to keep a copy).`)) return; store.deleteProject(x.id); if (x.id === this.project.id) this.open(fromTemplate('blank', this.catalog), true); this.showProjects(); } }, 'Delete')))));
    tbl.append(tb); body.append(tbl);
    body.append(h('p', { class: 'hint', style: 'margin:12px 0 0' }, 'Projects are saved in this browser on this device. Use Export → Project file to back one up or move it to another computer.'));
    this.modal(body);
  },

  // ---------- catalog editor ----------
  showCatalog() {
    const body = h('div', {});
    const draw = () => {
      body.innerHTML = '';
      body.append(h('h2', {}, `Catalog (${this.catalog.length} products)`));
      body.append(h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Your products, brands, colors and prices. ⧉ copies a product as a new color or option. Screen colors are approximate: check real samples. Changes save right away and update every estimate. Price = material per unit, Labor = labor per unit. Sizes are in feet (w × d × h); doors and windows use w × h and a sill height. Add a picture to use it as the 3D texture (floors, siding, roofs, counters).'));
      const filter = h('input', { type: 'search', placeholder: 'Filter', oninput: () => drawRows() });
      const catF = h('select', { onchange: () => drawRows() }, h('option', { value: '' }, 'All categories'), CATEGORIES.map(([id, n]) => h('option', { value: id }, n)));
      body.append(h('div', { class: 'row' }, filter, catF,
        h('button', { class: 'btn primary', onclick: () => { const p = { id: uid('p'), category: catF.value || 'other', kind: 'object', name: 'New product', brand: '', colorName: '', finish: '', material: '', unit: 'EA', price: 0, labor: 0, color: '#b0b0b0', w: 2, d: 2, h: 3, sku: '', vendor: '', notes: '' }; this.catalog.unshift(p); this.saveCat(); filter.value = ''; drawRows(); } }, '+ Add product'),
        h('button', { class: 'btn', onclick: async () => {
          const f = await store.pickFile('.csv,text/csv'); if (!f) return;
          const { products, errors } = catalogFromCSV(await store.readText(f));
          let added = 0, updated = 0;
          products.forEach(p => { const i = this.catalog.findIndex(x => x.id === p.id); if (i >= 0) { this.catalog[i] = { ...this.catalog[i], ...p }; updated++; } else { this.catalog.push(p); added++; } });
          this.saveCat(); drawRows();
          alert(`Imported: ${added} new, ${updated} updated.` + (errors.length ? '\n\n' + errors.slice(0, 15).join('\n') : ''));
        } }, '⤒ Import CSV'),
        h('button', { class: 'btn', onclick: () => store.download('planbuilder-catalog.csv', toCSV(this.catalog, CSV_COLUMNS), 'text/csv') }, '⤓ Export CSV'),
        h('button', { class: 'btn danger', onclick: () => { if (!confirm('Put the catalog back to the starting products? Your price edits and added products will be lost (export a CSV first to keep them).')) return; this.catalog = store.resetCatalog(); this.saveCat(); drawRows(); } }, 'Reset')));
      const tbl = h('table', { class: 'cat-table' });
      tbl.append(h('thead', {}, h('tr', {}, ['', 'Name', 'Brand / color name', 'Finish / material', 'Category', 'Kind', 'Unit', 'Price', 'Labor', 'W', 'D', 'H', 'Sill / elev', 'SKU / vendor', ''].map(x => h('th', {}, x)))));
      const tb = h('tbody'); tbl.append(tb); body.append(tbl);
      body.append(h('datalist', { id: 'pb-brands' }, [...new Set(this.catalog.map(p => p.brand).filter(Boolean))].sort().map(b => h('option', { value: b }))));
      const drawRows = () => {
        tb.innerHTML = '';
        const q = filter.value.trim().toLowerCase();
        const list = this.catalog.filter(p => (!catF.value || p.category === catF.value) && (!q || q.split(/\s+/).every(w => productText(p).includes(w))));
        const MAX = 150;
        if (list.length > MAX) tb.append(h('tr', {}, h('td', { colspan: 15, class: 'hint' }, `Showing ${MAX} of ${list.length}. Type in Filter or pick a category to narrow it.`)));
        list.slice(0, MAX).forEach(p => {
          const upd = (k, v) => { p[k] = v; this.saveCat(); };
          const n = (k, w = 60) => h('td', { class: 'num' }, h('input', { type: 'number', step: '0.01', style: `width:${w}px`, value: p[k] ?? '', onchange: e => upd(k, e.target.value === '' ? undefined : num(e.target.value)) }));
          const imgBtn = h('button', { class: 'btn small', title: 'Picture / texture', onclick: async () => {
            const f = await store.pickFile('image/*'); if (!f) return;
            p.texture = await shrinkImage(await store.readDataURL(f), 256); this.saveCat(); drawRows();
          } }, p.texture ? '🖼✓' : '🖼');
          tb.append(h('tr', {},
            h('td', { style: 'white-space:nowrap' }, h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#b0b0b0', onchange: e => upd('color', e.target.value) }), ' ', imgBtn, p.texture ? h('button', { class: 'btn small', title: 'Remove picture', onclick: () => { delete p.texture; this.saveCat(); drawRows(); } }, '×') : ''),
            h('td', {}, h('input', { value: p.name, style: 'min-width:200px', onchange: e => upd('name', e.target.value) })),
            h('td', {}, h('input', { value: p.brand || '', placeholder: 'Brand', list: 'pb-brands', style: 'width:110px', onchange: e => upd('brand', e.target.value.trim()) }), h('input', { value: p.colorName || '', placeholder: 'Color name / #', style: 'width:110px', onchange: e => upd('colorName', e.target.value.trim()) })),
            h('td', {}, h('input', { value: p.finish || '', placeholder: 'Finish / sheen', style: 'width:100px', onchange: e => upd('finish', e.target.value.trim()) }), h('input', { value: p.material || '', placeholder: 'Species / material', style: 'width:100px', onchange: e => upd('material', e.target.value.trim()) })),
            h('td', {}, select(CATEGORIES, p.category, v => upd('category', v))),
            h('td', {}, select(KINDS.map(k => [k, k]), p.kind, v => upd('kind', v))),
            h('td', {}, select(UNITS.map(u => [u, u]), p.unit, v => upd('unit', v))),
            n('price', 75), n('labor', 75), n('w', 52), n('d', 52), n('h', 52),
            h('td', { class: 'num' }, h('input', { type: 'number', step: '0.01', style: 'width:52px', value: p.kind === 'opening' ? (p.sill ?? '') : (p.elev ?? ''), onchange: e => upd(p.kind === 'opening' ? 'sill' : 'elev', e.target.value === '' ? undefined : num(e.target.value)) })),
            h('td', {}, h('input', { value: p.sku || '', placeholder: 'SKU', style: 'width:80px', onchange: e => upd('sku', e.target.value) }), h('input', { value: p.vendor || '', placeholder: 'Vendor', style: 'width:90px', onchange: e => upd('vendor', e.target.value) })),
            h('td', { style: 'white-space:nowrap' }, h('button', { class: 'btn small', title: 'Copy as a new color / option', onclick: () => { const c = { ...p, id: uid('p'), name: p.name + ' (new color)', colorName: '' }; delete c.texture; this.catalog.splice(this.catalog.indexOf(p) + 1, 0, c); this.saveCat(); drawRows(); } }, '⧉'), ' ', h('button', { class: 'btn small danger', title: 'Delete product', onclick: () => { if (!confirm(`Delete "${p.name}" from the catalog?`)) return; this.catalog = this.catalog.filter(x => x !== p); store.markRemoved(p.id); this.saveCat(); drawRows(); } }, '×'))));
        });
      };
      drawRows();
    };
    draw();
    this.modal(body);
  },
  saveCat() {
    if (!store.saveCatalog(this.catalog)) this.toast('⚠ The catalog could not be saved: browser storage is full (pictures take the most room).');
    this.renderPicker();
    if (this.view3d) { this.view3d.matCache.clear(); }
    this.refresh(true);
  },

  // ---------- export / print ----------
  async exportAs(kind) {
    $('#menu-export').hidden = true;
    const P = this.project, base = (P.name || 'plan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'plan';
    if (kind === 'json') store.download(base + '.planbuilder.json', JSON.stringify(P, null, 1));
    else if (kind === 'csv') store.download(base + '-estimate.csv', estimateCSV(P, computeTakeoff(P, this.catalog)), 'text/csv');
    else if (kind === 'planpng') { const a = document.createElement('a'); a.href = await brandStamp(this.plan.snapshot()); a.download = base + '-' + this.level.name.replace(/\s+/g, '-') + '.png'; a.click(); }
    else if (kind === 'png' || kind === 'glb') {
      const v = await this.load3D(); if (!v) return;
      const wasHidden = $('#view-pane').hidden;
      if (wasHidden) await this.setView('split');
      v.rebuild(); if (!this._fitted3d) { v.fit(); this._fitted3d = true; }
      if (kind === 'png') { const a = document.createElement('a'); a.href = await brandStamp(v.screenshot()); a.download = base + '-3d.png'; a.click(); }
      else { const blob = await v.exportGLB(); store.download(base + '.glb', blob); }
    } else if (kind === 'print') {
      this._printing = true;
      await this.buildPrint(true);
      setTimeout(() => { window.print(); this._printing = false; }, 300);
    }
  },
  async buildPrint(with3D) {
    const P = this.project, t = computeTakeoff(P, this.catalog), s = P.settings;
    const out = $('#print'); out.innerHTML = '';
    const phead = (title) => h('div', { class: 'print-head' }, h('div', {}, h('h1', {}, title || P.name), h('div', { style: 'color:#555' }, [P.address, P.client].filter(Boolean).join(' · '))), h('img', { class: 'print-logo', src: 'img/grayco-logo-navy.png', alt: 'GrayCo Construction Services' }));
    const pfoot = () => h('div', { class: 'print-foot' }, `GrayCo Construction Services · Prepared ${new Date().toLocaleDateString()} with GrayCo PlanBuilder 3D · Drawings are for estimating; verify all dimensions in the field.`);
    const head = h('div', {}, phead(), h('div', { class: 'meta' },
      ...[['Client', P.client], ['Address', P.address], ['Claim #', P.claimNo], ['Carrier', P.carrier], ['Adjuster', P.adjuster], ['Date of loss', P.dateOfLoss], ['Prepared', new Date().toLocaleDateString()], ['Floor area', Math.round(t.summary.floorArea).toLocaleString() + ' SF']].filter(x => x[1]).map(([k, v]) => h('div', {}, h('b', {}, k + ': '), String(v)))));
    // one page per level
    const curLevel = this.level;
    this.project.levels.forEach((L, i) => {
      this.level = L;
      const img = this.plan.snapshot(1600, 1150);
      out.append(h('div', { class: 'pg' }, i === 0 ? head : phead(), h('h2', {}, `${L.name} plan`), h('img', { src: img, alt: L.name + ' plan' }),
        roomTable(L, t), pfoot()));
    });
    this.level = curLevel; this.plan.draw();
    if (with3D) {
      const v = await this.load3D();
      if (v) {
        const hidden = $('#view-pane').hidden;
        if (hidden) { $('#view-pane').hidden = false; v.visible = true; v.resize(); }
        v.rebuild(); v.fit();
        const shots = [];
        for (const pz of ['iso', 'front', 'back']) { v.setPreset(pz); shots.push(v.screenshot()); }
        v.fit();
        if (hidden) { $('#view-pane').hidden = true; v.visible = false; this.plan.resize(); }
        out.append(h('div', { class: 'pg' }, phead(), h('h2', {}, '3D views'), ...shots.map(src => h('img', { src, style: 'margin-bottom:8px;max-height:3in;object-fit:contain' })), pfoot()));
      }
    }
    // estimate
    const tbl = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'n' }, 'Qty'), h('th', {}, 'Unit'), h('th', { class: 'n' }, 'Unit price'), h('th', { class: 'n' }, 'Total'))));
    const tb = h('tbody');
    t.groups.forEach(g => { tb.append(h('tr', {}, h('td', { colspan: 4 }, h('b', {}, g.name)), h('td', { class: 'n' }, h('b', {}, money(g.total))))); g.lines.forEach(l => tb.append(h('tr', {}, h('td', {}, l.name), h('td', { class: 'n' }, l.qty.toLocaleString('en-US', { maximumFractionDigits: 2 })), h('td', {}, l.unit), h('td', { class: 'n' }, money(l.price + l.labor)), h('td', { class: 'n' }, money(l.total))))); });
    tbl.append(tb);
    const T = t.totals;
    const tot = h('table', { style: 'width:50%;margin:10px 0 0 auto' }, h('tbody', {}, ...[['Material', T.material], ['Labor', T.labor], [`Tax ${s.taxRate}%`, T.tax], ['Subtotal', T.subtotal], [`Overhead ${s.overheadPct}%`, T.overhead], [`Profit ${s.profitPct}%`, T.profit], ['Total', T.grand]].map(([k, v]) => h('tr', {}, h('td', {}, k === 'Total' ? h('b', {}, k) : k), h('td', { class: 'n' }, k === 'Total' ? h('b', {}, money(v)) : money(v))))));
    out.append(h('div', {}, phead(), h('h2', {}, 'Estimate'), tbl, tot, P.notes ? h('p', {}, h('b', {}, 'Notes: '), P.notes) : null, pfoot()));
  },
};

// ---------- small UI helpers ----------
function field(label, input, full) { return h('label', { class: 'f' + (full ? ' full' : '') }, h('span', {}, label), input); }
function lengthField(label, ft, onSet, prop, title) {
  const inp = h('input', { value: ft > 0 ? fmtFtIn(ft) : '', placeholder: ft > 0 ? '' : '—', title: title || 'Feet and inches: 12\' 6", 12-6, 12.5', 'data-prop': prop || null });
  inp.addEventListener('change', () => { const v = inp.value.trim() === '' ? 0 : parseFtIn(inp.value); if (isNaN(v)) { inp.value = fmtFtIn(ft); app.toast('Type a length like 12\' 6", 12-6 or 12.5'); return; } onSet(v); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  return field(label, inp);
}
function select(opts, value, onChange) {
  const s = h('select', { onchange: e => onChange(e.target.value) }, opts.map(([v, n]) => h('option', { value: v }, n)));
  s.value = value == null ? '' : String(value);
  return s;
}
function productSelect(catalog, filter, value, onChange, emptyLabel) {
  const opts = catalog.filter(filter);
  const s = h('select', { onchange: e => onChange(e.target.value) });
  if (emptyLabel) s.append(h('option', { value: '' }, emptyLabel));
  const byCat = {};
  opts.forEach(p => { (byCat[p.category] = byCat[p.category] || []).push(p); });
  Object.entries(byCat).forEach(([c, list]) => s.append(h('optgroup', { label: categoryName(c) }, list.map(p => h('option', { value: p.id }, `${p.name} — ${money(+p.price + +p.labor)}/${p.unit}`)))));
  if (value && !opts.some(p => p.id === value)) s.append(h('option', { value }, `(missing: ${value})`));
  s.value = value || '';
  return s;
}
function productText(p) { return [p.name, p.brand, p.colorName, p.finish, p.material, p.sku, p.vendor, categoryName(p.category)].filter(Boolean).join(' ').toLowerCase(); }
function swatch(p) {
  const d = h('div', { class: 'swatch' });
  d.style.background = p.color || '#ccc';
  if (p.texture) d.style.backgroundImage = `url(${p.texture})`;
  return d;
}
function roomTable(L, t) {
  const lv = t.summary.levels.find(x => x.id === L.id); if (!lv || !lv.rooms.length) return null;
  return h('table', { style: 'margin-top:8px' }, h('thead', {}, h('tr', {}, h('th', {}, 'Room'), h('th', { class: 'n' }, 'Floor SF'), h('th', { class: 'n' }, 'Wall SF'), h('th', { class: 'n' }, 'Perimeter'), h('th', { class: 'n' }, 'Ceiling ht'), h('th', {}, 'Floor'))),
    h('tbody', {}, lv.rooms.map(r => { const room = L.rooms.find(x => x.id === r.id); const fp = findProduct(app.catalog, room && room.floorId); return h('tr', {}, h('td', {}, r.name), h('td', { class: 'n' }, Math.round(r.area)), h('td', { class: 'n' }, Math.round(r.wallArea)), h('td', { class: 'n' }, fmtFtIn(r.perim)), h('td', { class: 'n' }, fmtFtIn(r.height)), h('td', {}, fp ? fp.name : '')); }),
      h('tr', {}, h('td', {}, h('b', {}, 'Total')), h('td', { class: 'n' }, h('b', {}, Math.round(lv.floorArea))), h('td'), h('td'), h('td'), h('td'))));
}
// Puts the GrayCo logo in the bottom-right corner of an exported picture.
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function brandStamp(dataUrl) {
  try {
    const [img, logo] = await Promise.all([loadImg(dataUrl), loadImg('img/grayco-logo-navy.png')]);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const lh = Math.round(Math.min(img.height * 0.11, 150)), lw = Math.round(logo.width * lh / logo.height), pad = Math.round(lh * 0.25);
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(c.width - lw - pad * 2, c.height - lh - pad * 2, lw + pad * 2, lh + pad * 2);
    x.drawImage(logo, c.width - lw - pad, c.height - lh - pad, lw, lh);
    return c.toDataURL('image/png');
  } catch (e) { return dataUrl; }
}
function shrinkImage(dataUrl, max) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.82)); };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

// ensure3D is used by the 3D option boxes, which only show once the view exists
app.ensure3D = function () { return this.view3d || { opts: {}, rebuild() {}, setPreset() {}, toggleWalk() {} }; };

window.PlanBuilder = app;   // handy for debugging and the smoke test
app.init();

