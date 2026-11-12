// Live 3D: the parts of the 3D view that move.
//   • Sun & time of day: the sun crosses the sky (east → south → west), shadows follow, dawn and dusk turn warm,
//     at night the sky goes dark and the rooms light up from inside. ▶ plays a whole day.
//   • Doors: click a selected door to swing it open or shut; walking through, doors open as you reach them.
//   • 🎬 Tour: the camera circles the house, looks down into the rooms, then visits each room at eye height.
//     ⏺ records the tour (or anything you do in 3D) to a video file.
//   • Drag a product from the list onto the 3D: furniture and fixtures land where you drop them, doors and windows
//     on the wall you drop them on, floors / paint / siding / roofing on the surface under the pointer.
//   • New pieces pop in, and a ripple runs across the ground when a style or furniture changes.
import * as THREE from 'three';
import { centroid, polyArea, wallLength, projectOnSeg } from './geom.js';
import { addItem, addOpening } from './model.js';

const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const LAT = 35 * Math.PI / 180;   // Tennessee
const DECL = 10 * Math.PI / 180;  // a spring / late-summer sun

// Sun direction for an hour of the day (plan north = up = −z, east = +x). Returns {dir: Vector3 (toward the sun), elev}.
export function sunAt(hour) {
  const H = (hour - 12) * 15 * Math.PI / 180;   // hour angle
  const sinAlt = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // azimuth from south, + toward west; plan south = +z, west = −x
  const A = Math.atan2(Math.sin(H), Math.sin(LAT) * Math.cos(H) - Math.tan(DECL) * Math.cos(LAT));
  const x = -Math.sin(A) * Math.cos(alt), z = Math.cos(A) * Math.cos(alt), y = Math.sin(alt);
  return { dir: new THREE.Vector3(x, y, z).normalize(), elev: alt };
}

// Light and sky for an hour: 0 = night … 1 = full day, plus warm tint near sunrise / sunset.
const C = s => new THREE.Color(s);
const PAL = {
  day: { top: C('#5d8fd6'), mid: C('#cfe0f2'), bottom: C('#e9eef2'), fog: C('#d9e4ee'), sun: C('#fff3e2'), hemi: C('#eaf2ff') },
  dusk: { top: C('#3b4f8f'), mid: C('#f2a46b'), bottom: C('#f6d2a8'), fog: C('#e8b994'), sun: C('#ffb36b'), hemi: C('#ffd2b0') },
  night: { top: C('#02040c'), mid: C('#0b1630'), bottom: C('#121d33'), fog: C('#0b1426'), sun: C('#9fb4ff'), hemi: C('#30406a') },
};
export function lightAt(hour) {
  const { elev } = sunAt(hour), deg = elev * 180 / Math.PI;
  const day = Math.max(0, Math.min(1, (deg + 4) / 16));          // 0 below −4°, 1 above 12°
  const warm = Math.max(0, 1 - Math.abs(deg - 3) / 12) * (deg > -6 ? 1 : 0);   // strongest just above the horizon
  return { day, warm, elev };
}

export function installLive(v, app) {
  const L = {
    hour: null, playing: false, doors: new Map(), doorState: new Map(), auto: new Set(), pops: [], rings: [], known: null,
    nightGroup: null, touring: false, recorder: null,
  };
  v.live = L;

  // ---------- doors ----------
  // view3d.buildOpening registers every door: pivot, closed (ajar) angle and which way it swings.
  L.registerDoor = (id, pivot, ajar) => {
    const sign = ajar >= 0 ? 1 : -1;
    const d = { id, pivot, ajar, open: sign * 1.45, k: L.doorState.get(id) ?? 0 };
    pivot.rotation.y = lerp(d.ajar, d.open, d.k);
    L.doors.set(id, d);
  };
  L.toggleDoor = (id, open) => {
    const cur = L.doorState.get(id) ?? 0, want = open == null ? (cur > 0.5 ? 0 : 1) : (open ? 1 : 0);
    L.doorState.set(id, want); L.auto.delete(id);
    return want;
  };
  L.allDoors = open => { L.doors.forEach((d, id) => L.toggleDoor(id, open)); };

  // ---------- sun & time of day ----------
  L.setTime = hour => {
    L.hour = hour == null ? null : Math.max(4.5, Math.min(22.5, hour));
    applySky(); L.lightRooms(); v.render();
  };
  function applySky() {
    const sky = v.skyMat.uniforms, fog = v.scene.fog;
    if (L.hour == null || v.opts.holo || v.opts.studio) {
      if (!v.opts.holo && !v.opts.studio) { sky.top.value.copy(PAL.day.top); sky.mid.value.copy(PAL.day.mid); sky.bottom.value.copy(PAL.day.bottom); fog.color.copy(PAL.day.fog); }
      v.sun.position.set(-80, 140, 60); v.sun.target.position.set(0, 0, 0); v.sun.intensity = 2.6; v.sun.color.copy(PAL.day.sun);
      v.hemi.intensity = 0.85; v.hemi.color.copy(PAL.day.hemi); v.scene.environmentIntensity = 0.55; v.renderer.toneMappingExposure = 1.05;
      return;
    }
    const { day, warm } = lightAt(L.hour), { dir } = sunAt(L.hour);
    const mix = (a, b, c) => a.clone().lerp(b, warm).lerp(c, 1 - day);
    sky.top.value.copy(mix(PAL.day.top, PAL.dusk.top, PAL.night.top));
    sky.mid.value.copy(mix(PAL.day.mid, PAL.dusk.mid, PAL.night.mid));
    sky.bottom.value.copy(mix(PAL.day.bottom, PAL.dusk.bottom, PAL.night.bottom));
    fog.color.copy(mix(PAL.day.fog, PAL.dusk.fog, PAL.night.fog));
    const box = v._modelBox(), c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const up = dir.y < 0.05 ? new THREE.Vector3(dir.x, 0.05, dir.z).normalize() : dir;
    v.sun.target.position.copy(c); v.sun.position.copy(c).addScaledVector(up, 170);
    v.sun.intensity = 2.8 * day * (1 - 0.35 * warm);
    v.sun.color.copy(PAL.day.sun).lerp(PAL.dusk.sun, warm);
    v.hemi.intensity = 0.22 + 0.63 * day; v.hemi.color.copy(PAL.day.hemi).lerp(PAL.dusk.hemi, warm).lerp(PAL.night.hemi, 1 - day);
    v.scene.environmentIntensity = 0.12 + 0.43 * day;
    v.renderer.toneMappingExposure = 0.85 + 0.2 * day;
  }
  // At night the rooms glow: a warm light in each room (the largest ones, so it stays quick) and lit glass.
  L.lightRooms = () => {
    if (L.nightGroup) { v.scene.remove(L.nightGroup); L.nightGroup.children.forEach(l => l.dispose && l.dispose()); L.nightGroup = null; }
    const night = L.hour != null && !v.opts.holo && !v.opts.studio ? 1 - lightAt(L.hour).day : 0;
    if (v._glass) { v._glass.emissive = v._glass.emissive || new THREE.Color(); v._glass.emissive.set('#ffcf87'); v._glass.emissiveIntensity = night * 0.9; v._glass.opacity = 0.28 + night * 0.4; }
    if (night < 0.15) return;
    const g = new THREE.Group(), P = app.project;
    const rooms = [];
    P.levels.forEach(l => l.rooms.forEach(r => { if (!r.outdoor && v.showPhase(r)) rooms.push({ r, l, a: polyArea(r.points) }); }));
    rooms.sort((a, b) => b.a - a.a).slice(0, 10).forEach(({ r, l }) => {
      const c = centroid(r.points), reach = Math.min(16, Math.sqrt(polyArea(r.points)) * 0.9 + 4), pl = new THREE.PointLight(0xffd29a, 60 * night, reach, 2);   // short reach: lights the room, not the lawn
      pl.position.set(c.x, l.elevation + Math.min(7.5, (r.height || l.height) - 1), c.y); g.add(pl);
    });
    L.nightGroup = g; v.scene.add(g);
  };
  L.playDay = on => {
    L.playing = on == null ? !L.playing : !!on;
    if (L.playing && (L.hour == null || L.hour >= 21.5)) L.hour = 5.5;
    L._last = performance.now();
  };

  // ---------- after every rebuild: doors keep their state, new pieces pop in ----------
  L.beforeRebuild = () => { L.doors.clear(); };
  L.afterRebuild = () => {
    if (L.hour != null) { applySky(); L.lightRooms(); }
    const groups = [];
    v.root.traverse(o => { if (o.isGroup && o.userData.pick && (o.userData.pick.kind === 'item' || o.userData.pick.kind === 'opening')) groups.push(o); });
    const ids = new Set(groups.map(g => g.userData.pick.id));
    if (L.known && !L.touring && !v._anim) {
      const fresh = groups.filter(g => !L.known.has(g.userData.pick.id)).slice(0, 80);
      const t0 = performance.now();
      fresh.forEach((g, i) => { g.userData.pop = { t0: t0 + i * 18, s: g.scale.clone() }; g.scale.setScalar(0.001); L.pops.push(g); });
    }
    L.known = ids;
  };

  // a ring that runs across the ground from a point (or the middle of the house)
  L.ripple = at => {
    const box = v._modelBox(); if (box.isEmpty()) return;
    const c = at || box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: '#39d0ff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(c.x, (app.level ? app.level.elevation : 0) + 0.06, c.z);
    m.userData.ring = { t0: performance.now(), r: Math.max(size.x, size.z) * 0.75 + 6 };
    v.scene.add(m); L.rings.push(m);
  };

  // ---------- Show ▾: furniture, art, rugs, plants, lights, kitchen & bath, yard ----------
  L.fades = [];
  L.setShown = (group, on) => {
    const hide = v.opts.hide;
    if (on) hide.delete(group); else hide.add(group);
    try { localStorage.setItem('pb.pref.hide3d', JSON.stringify([...hide])); } catch (e) { /* ignore */ }
    const list = []; v.root.traverse(o => { if (o.isGroup && o.userData.show === group) list.push(o); });
    const t0 = performance.now(), step = Math.min(25, 600 / Math.max(1, list.length));
    list.forEach((g, i) => {
      const base = g.userData.baseScale || (g.userData.baseScale = g.scale.clone());
      if (on && !g.visible) { g.visible = true; g.scale.setScalar(0.001); }
      g.userData.fade = { t0: t0 + i * step, on, base, from: on ? 0 : 1 };
      if (!L.fades.includes(g)) L.fades.push(g);
    });
    v.render();
    return list.length;
  };
  L.countShown = group => { let n = 0; v.root.traverse(o => { if (o.isGroup && o.userData.show === group) n++; }); return n; };

  // ---------- every frame ----------
  L.tick = now => {
    let moved = false, geo = false;
    const fdt = Math.min(0.5, (now - (L._prev || now)) / 1000); L._prev = now;   // seconds since the last frame
    // play the day: 5:30 → 21:30 in about 24 s
    if (L.playing) {
      const dt = Math.min(0.1, (now - (L._last || now)) / 1000); L._last = now;
      L.hour += dt * 0.67;
      if (L.hour >= 21.5) { L.hour = 21.5; L.playing = false; app.onDayEnd && app.onDayEnd(); }
      applySky(); if (Math.floor(L.hour * 4) !== L._q) { L._q = Math.floor(L.hour * 4); L.lightRooms(); }
      app.onHour && app.onHour(L.hour); geo = true;
    }
    // doors: walking up to one opens it
    if (v.walk) {
      const cp = v.camera.position, wp = new THREE.Vector3();
      L.doors.forEach((d, id) => {
        d.pivot.getWorldPosition(wp); const dist = Math.hypot(wp.x - cp.x, wp.z - cp.z);
        if (dist < 4.5 && (L.doorState.get(id) ?? 0) < 0.5) { L.doorState.set(id, 1); L.auto.add(id); }
        else if (dist > 8 && L.auto.has(id)) { L.doorState.set(id, 0); L.auto.delete(id); }
      });
    }
    L.doors.forEach((d, id) => {
      const want = L.doorState.get(id) ?? 0;
      if (d.k !== want) { const step = fdt / 0.7; d.k = want > d.k ? Math.min(want, d.k + step) : Math.max(want, d.k - step); d.pivot.rotation.y = lerp(d.ajar, d.open, ease(d.k)); geo = true; }   // 0.7 s swing
    });
    // pieces popping in, with a little overshoot
    if (L.pops.length) {
      L.pops = L.pops.filter(g => {
        const p = g.userData.pop; if (!p) return false;
        const k = Math.max(0, Math.min(1, (now - p.t0) / 380));
        const s = k <= 0 ? 0.001 : k < 1 ? 1 + 0.12 * Math.sin(k * Math.PI) * (1 - k) * 3 - (1 - k) * (1 - k) : 1;
        g.scale.set(p.s.x * Math.max(0.001, s), p.s.y * Math.max(0.001, s), p.s.z * Math.max(0.001, s)); geo = true;
        if (k >= 1) { g.scale.copy(p.s); delete g.userData.pop; return false; }
        return true;
      });
    }
    if (L.fades.length) {   // pieces shrinking away / springing back
      L.fades = L.fades.filter(g => {
        const f = g.userData.fade; if (!f) return false;
        const k = Math.max(0, Math.min(1, (now - f.t0) / 340));
        const s = f.on ? (k <= 0 ? 0.001 : 1 + 1.6 * Math.pow(k - 1, 3) + 0.6 * Math.pow(k - 1, 2)) : 1 - ease(k);
        g.scale.set(f.base.x * Math.max(0.001, s), f.base.y * Math.max(0.001, s), f.base.z * Math.max(0.001, s)); geo = true;
        if (k >= 1) { g.scale.copy(f.base); if (!f.on) g.visible = false; delete g.userData.fade; return false; }
        return true;
      });
    }
    if (v._hl && v._hl.length && v._hlAt && now - v._hlAt < 1700) {   // a picked piece pulses for a moment
      const k = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin((now - v._hlAt) / 1700 * Math.PI * 6 - Math.PI / 2));
      v._hl.forEach(([o]) => (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.emissive) m.emissiveIntensity = k; }));
      moved = true;
    }
    if (L.rings.length) {
      L.rings = L.rings.filter(m => {
        const k = Math.min(1, (now - m.userData.ring.t0) / 1100), r = 1 + m.userData.ring.r * ease(k);
        m.scale.setScalar(r); m.material.opacity = 0.85 * (1 - k); moved = true;
        if (k >= 1) { v.scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }
        return true;
      });
    }
    if (geo) v.render(); else if (moved) v.render(true);
  };

  // ---------- drag a product onto the 3D ----------
  const el = v.renderer.domElement;
  el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/pb-product')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  el.addEventListener('drop', e => {
    const id = e.dataTransfer.getData('text/pb-product'); if (!id) return;
    e.preventDefault();
    const p = app.catalog.find(x => x.id === id); if (p) L.drop(p, e);
  });
  L.drop = (p, e) => {
    const hits = v._hits(e);
    if (!hits.length) { app.toast('Drop it on the house: a floor, a wall or the roof.'); return false; }
    const lvl = id => app.project.levels.find(l => l.id === id);
    if (p.kind === 'object') {
      const h = hits.find(x => x.object.userData.pick.kind === 'room') || hits[0];
      const level = lvl(h.object.userData.pick.levelId) || app.level;
      const snap = n => Math.round(n * 4) / 4;
      const it = addItem(level, p, snap(h.point.x), snap(h.point.z));
      app.level = level; app.select({ kind: 'item', id: it.id }); app.commit('Placed ' + p.name);
      L.ripple(new THREE.Vector3(h.point.x, 0, h.point.z));
      return true;
    }
    if (p.kind === 'opening') {
      const h = hits.find(x => x.object.userData.pick.kind === 'wall');
      if (!h) { app.toast('Drop doors and windows on a wall.'); return false; }
      const level = lvl(h.object.userData.pick.levelId) || app.level, w = level.walls.find(x => x.id === h.object.userData.pick.id);
      const len = wallLength(w), half = (p.w || 3) / 2;
      if (len < (p.w || 3) + 0.2) { app.toast('That wall is too short for it.'); return false; }
      const t = Math.max(half + 0.1, Math.min(len - half - 0.1, projectOnSeg({ x: h.point.x, y: h.point.z }, w.a, w.b).t * len)) / len;
      const o = addOpening(level, w, t, p);
      if (p.sill != null) o.sill = p.sill;
      app.level = level; app.select({ kind: 'opening', id: o.id }); app.commit('Placed ' + p.name);
      return true;
    }
    // finishes: apply to what is under the pointer
    const want = p.kind === 'roof' ? ['roof'] : p.kind === 'floor' ? ['room'] : ['wall', 'room'];
    const h = hits.find(x => want.includes(x.object.userData.pick.kind));
    if (!h) { app.toast(p.kind === 'roof' ? 'Drop roofing on a roof.' : p.kind === 'floor' ? 'Drop flooring on a floor.' : 'Drop it on a wall or in a room.'); return false; }
    const pk = h.object.userData.pick, level = lvl(pk.levelId);
    if (level) app.level = level;
    app.select({ kind: pk.kind, id: pk.id });
    app.useProduct(p);
    L.ripple(new THREE.Vector3(h.point.x, 0, h.point.z));
    return true;
  };

  // ---------- 🎬 tour & ⏺ video ----------
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function fly(pos, look, ms) {
    const p0 = v.camera.position.clone(), l0 = v.controls.target.clone(), t0 = performance.now();
    for (;;) {
      if (!L.touring) return;
      const k = Math.min(1, (performance.now() - t0) / ms), e = ease(k);
      v.camera.position.lerpVectors(p0, pos, e); v.controls.target.lerpVectors(l0, look, e); v.camera.lookAt(v.controls.target);
      v.render(true);
      if (k >= 1) return;
      await frame();
    }
  }
  async function orbit(c, r, h, ms, from = 0, turn = Math.PI * 2) {
    const t0 = performance.now();
    for (;;) {
      if (!L.touring) return;
      const k = Math.min(1, (performance.now() - t0) / ms), a = from + turn * k;
      v.camera.position.set(c.x + Math.cos(a) * r, c.y + h, c.z + Math.sin(a) * r); v.controls.target.copy(c); v.camera.lookAt(c);
      v.render(true);
      if (k >= 1) return;
      await frame();
    }
  }
  const caption = t => app.tourCaption && app.tourCaption(t);
  L.tour = async (opts = {}) => {
    if (L.touring) { L.stopTour(); return; }
    if (v.walk) v.toggleWalk(false);
    const keep = { cut: v.opts.cutaway, ceil: v.opts.ceilings, roof: v.opts.showRoof, spin: v.opts.spin };
    L.touring = true; v.controls.enabled = false; v.controls.autoRotate = false;
    if (opts.record) L.record(true);
    try {
      v.opts.cutaway = false; v.opts.ceilings = false; v.opts.showRoof = true; v.rebuild();
      const box = v._modelBox(), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const R = Math.max(s.x, s.z) * 1.15 + 18, Hh = Math.max(12, s.y * 0.9 + 6);
      caption(app.project.name || 'The house');
      const a0 = Math.atan2(v.camera.position.z - c.z, v.camera.position.x - c.x);
      await fly(new THREE.Vector3(c.x + Math.cos(a0) * R, c.y + Hh, c.z + Math.sin(a0) * R), c, 1500);
      await orbit(c, R, Hh, opts.fast ? 2500 : 11000, a0, Math.PI * 2);
      if (!L.touring) return;
      // look down into the rooms (dollhouse)
      caption('Inside');
      v.opts.cutaway = true; v.rebuild();
      await fly(new THREE.Vector3(c.x + 0.01, c.y + Math.max(s.x, s.z) * 1.05 + 10, c.z + R * 0.45), new THREE.Vector3(c.x, box.min.y, c.z), 2200);
      await sleep(opts.fast ? 200 : 900);
      // each room at eye height
      v.opts.cutaway = false; v.opts.ceilings = true; v.opts.showRoof = true; v.rebuild();
      const lev = app.level, rooms = lev.rooms.filter(r => !r.outdoor && v.showPhase(r) && polyArea(r.points) > 30).sort((a, b) => polyArea(b.points) - polyArea(a.points)).slice(0, opts.fast ? 2 : 8);
      for (const r of rooms) {
        if (!L.touring) return;
        const cc = centroid(r.points), xs = r.points.map(p => p.x), ys = r.points.map(p => p.y);
        const corner = { x: lerp(cc.x, Math.min(...xs), 0.7), y: lerp(cc.y, Math.max(...ys), 0.7) };
        const eye = lev.elevation + 5.4;
        caption(r.name || 'Room');
        v.camera.position.set(corner.x, eye, corner.y); v.controls.target.set(cc.x, eye - 0.6, cc.y); v.camera.lookAt(v.controls.target); v.render(true);
        await fly(new THREE.Vector3(lerp(corner.x, cc.x, 0.35), eye, lerp(corner.y, cc.y, 0.35)), new THREE.Vector3(lerp(cc.x, Math.max(...xs), 0.6), eye - 0.8, lerp(cc.y, Math.min(...ys), 0.6)), opts.fast ? 700 : 3200);
      }
      if (!L.touring) return;
      caption('');
      v.opts.ceilings = false; v.rebuild();
      await fly(new THREE.Vector3(c.x + R * 0.8, c.y + Hh * 0.8, c.z + R * 0.8), c, 2000);
      await sleep(opts.fast ? 100 : 600);
    } finally {
      if (L.recorder && opts.record) L.record(false);
      Object.assign(v.opts, { cutaway: keep.cut, ceilings: keep.ceil, showRoof: keep.roof });
      L.touring = false; caption(''); v.controls.enabled = true; v.controls.autoRotate = keep.spin; v.rebuild();
      app.onTourEnd && app.onTourEnd();
    }
  };
  L.stopTour = () => { L.touring = false; };

  // ⏺ record what the 3D view shows to a .webm video
  L.canRecord = () => typeof MediaRecorder !== 'undefined' && !!el.captureStream;
  L.record = on => {
    if (on && !L.recorder) {
      if (!L.canRecord()) { app.toast('This browser cannot record video. Use Chrome or Edge.'); return false; }
      const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(el.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined);
      const parts = []; rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(parts, { type: rec.mimeType || 'video/webm' });
        L.lastVideo = blob;
        const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `${(app.project.name || 'PlanBuilder').replace(/[\\/:*?"<>|]+/g, '-')} - 3D tour.${ext}`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        app.onRecord && app.onRecord(false, blob);
      };
      rec.start(500); L.recorder = rec;
      // keep frames coming while recording, even when nothing moves
      const keepAlive = () => { if (!L.recorder) return; v.render(true); setTimeout(keepAlive, 100); }; keepAlive();
      app.onRecord && app.onRecord(true);
      return true;
    }
    if (!on && L.recorder) { const r = L.recorder; L.recorder = null; r.stop(); return true; }
    return false;
  };
  return L;
}
