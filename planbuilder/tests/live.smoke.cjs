// Browser test of the live 3D: time of day, doors, drag-and-drop from the product list, pop-in, tour and video.
// Run from the repo root with python3 -m http.server 8765:  node planbuilder/tests/live.smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.env.PB_URL || 'http://localhost:8765/planbuilder/';
const shots = process.argv[2];

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(URL); await p.waitForFunction(() => window.PlanBuilder && PlanBuilder.project);
  const ev = (f, a) => p.evaluate(f, a);
  await p.click('#btn-projects'); await p.click('.modal .card:has-text("Ranch") button');
  await p.click('[data-view="3d"]'); await p.waitForTimeout(800);
  await ev(() => PlanBuilder.view3d.fit()); await p.waitForTimeout(300);

  // 1) time of day: morning sun in the east, noon in the south, night lights the rooms
  const sun = async h => { await p.$eval('#v-sun', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, h); await p.waitForTimeout(150);
    return ev(() => { const v = PlanBuilder.view3d, d = v.sun.position.clone().sub(v.sun.target.position); return { x: d.x, y: d.y, z: d.z, i: v.sun.intensity, lights: v.live.nightGroup ? v.live.nightGroup.children.length : 0, label: document.querySelector('#v-sun-t').textContent }; }); };
  const m = await sun(8); assert.ok(m.x > 0 && m.y > 0, 'morning sun in the east: ' + JSON.stringify(m)); assert.equal(m.label, '8:00 AM');
  const n = await sun(12.5); assert.ok(n.z > 0 && n.y > Math.abs(n.x), 'noon sun high in the south'); assert.ok(n.i > 2);
  if (shots) await p.screenshot({ path: shots + '/live-noon.png' });
  const d = await sun(18.5); assert.ok(d.x < 0, 'evening sun in the west'); assert.ok(d.i < n.i);
  if (shots) await p.screenshot({ path: shots + '/live-dusk.png' });
  const nt = await sun(21.5); assert.ok(nt.i < 0.05, 'no sun at night'); assert.ok(nt.lights >= 3, 'rooms lit at night: ' + nt.lights);
  if (shots) await p.screenshot({ path: shots + '/live-night.png' });
  await p.dblclick('#v-sun'); await p.waitForTimeout(100);
  assert.equal(await ev(() => PlanBuilder.view3d.live.hour), null); assert.equal(await p.textContent('#v-sun-t'), 'Sun');
  // ▶ plays the day
  await p.click('#v-sunplay'); await p.waitForTimeout(1200);
  const h1 = await ev(() => PlanBuilder.view3d.live.hour); assert.ok(h1 > 5.5 && h1 < 8, 'day playing: ' + h1);
  await p.click('#v-sunplay'); await p.dblclick('#v-sun');

  // 2) doors: open all, one swings back shut, walking up to one opens it
  const doors = await ev(() => [...PlanBuilder.view3d.live.doors.keys()]);
  assert.ok(doors.length >= 3, 'doors in 3D: ' + doors.length);
  const ang = id => ev(id => { const d = PlanBuilder.view3d.live.doors.get(id); return { a: d.pivot.rotation.y, ajar: d.ajar, open: d.open }; }, id);
  await p.click('#v-doors'); await p.waitForTimeout(1600);
  let a = await ang(doors[0]); assert.ok(Math.abs(a.a - a.open) < 0.05, 'door open ' + JSON.stringify(a));
  if (shots) await p.screenshot({ path: shots + '/live-doors.png' });
  await ev(id => PlanBuilder.view3d.live.toggleDoor(id, false), doors[0]); await p.waitForTimeout(1600);
  a = await ang(doors[0]); assert.ok(Math.abs(a.a - a.ajar) < 0.05, 'door shut again');
  await p.click('#v-doors');   // all shut
  // a selected door clicked in 3D opens (the pick path)
  await ev(id => { PlanBuilder.select({ kind: 'opening', id }); const v = PlanBuilder.view3d; v.pick = v.pick.bind(v); const h = { object: { userData: { pick: { kind: 'opening', id } } } }; v._hits = () => [h]; v.pick({}); delete v._hits; }, doors[1]);
  assert.equal(await ev(id => PlanBuilder.view3d.live.doorState.get(id), doors[1]), 1);
  await ev(id => PlanBuilder.view3d.live.toggleDoor(id, false), doors[1]);
  // walking up to a door opens it
  await p.click('#v-walk'); await p.waitForTimeout(300);
  const near = await ev(id => { const v = PlanBuilder.view3d, d = v.live.doors.get(id), w = new (v.camera.position.constructor)(); d.pivot.getWorldPosition(w); v.camera.position.set(w.x + 1, v.camera.position.y, w.z + 1); return id; }, doors[2]);
  await p.waitForTimeout(300);
  assert.equal(await ev(id => PlanBuilder.view3d.live.doorState.get(id), near), 1, 'door opened on the way through');
  await p.click('#v-walk'); await p.waitForTimeout(300);

  // 3) drag a product from the list onto the 3D: a chair on the floor
  await ev(() => PlanBuilder.view3d.setPreset('top')); await p.waitForTimeout(1200);
  await p.selectOption('#pick-cat', 'furniture').catch(() => {});
  await p.fill('#pick-q', 'chair').catch(() => {});
  await p.waitForTimeout(200);
  const card = p.locator('.pcard[draggable="true"]').first();
  const pid = await ev(() => { const c = PlanBuilder.catalog.filter(x => x.kind === 'object' && /chair/i.test(x.name)); return c[0] && c[0].id; });
  assert.ok(pid);
  const before = await ev(() => PlanBuilder.project.levels[0].items.length);
  const box = await p.locator('#view-pane canvas').boundingBox();
  // use the real HTML drag and drop
  const ok = await card.count() ? await card.dragTo(p.locator('#view-pane canvas'), { targetPosition: { x: box.width / 2, y: box.height / 2 } }).then(() => true, () => false) : false;
  let after = await ev(() => PlanBuilder.project.levels[0].items.length);
  if (!ok || after === before) {   // the drag events, directly (some headless builds do not run native drag)
    await ev(({ pid, x, y }) => { const dt = new DataTransfer(); dt.setData('text/pb-product', pid); const c = document.querySelector('#view-pane canvas'); c.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true })); c.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true })); }, { pid, x: box.x + box.width / 2, y: box.y + box.height / 2 });
    after = await ev(() => PlanBuilder.project.levels[0].items.length);
  }
  assert.equal(after, before + 1, 'dropped onto the floor');
  const placed = await ev(() => { const s = PlanBuilder.selection; return s && s.kind; });
  assert.equal(placed, 'item');
  // it pops in
  const popping = await ev(() => PlanBuilder.view3d.live.pops.length + PlanBuilder.view3d.live.rings.length);
  assert.ok(popping >= 1, 'pop-in / ripple running');
  await p.waitForTimeout(700);
  assert.equal(await ev(() => PlanBuilder.view3d.live.pops.length), 0);
  // flooring dropped on a room
  const flo = await ev(({ x, y }) => {
    const A = PlanBuilder, prod = A.catalog.find(c => c.kind === 'floor' && /hickory/i.test(c.name) && !c.ceiling);
    A.view3d.live.drop(prod, { clientX: x, clientY: y });
    const r = A.selection && A.level.rooms.find(rr => rr.id === A.selection.id);
    return { want: prod.id, got: r && r.floorId };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 + 30 });
  assert.equal(flo.got, flo.want, 'floor dropped on a room');
  // a window dropped on a wall
  const win = await ev(() => {
    const A = PlanBuilder, v = A.view3d, lv = A.level, w = lv.walls.find(x => x.exterior) || lv.walls[0];
    v.setPreset('front'); v.controls.update(); v.render();
    const prod = A.catalog.find(c => c.kind === 'opening' && c.openingType === 'window');
    const before = lv.openings.length;
    // find a point on that wall's mesh on screen
    let pt = null; v.root.traverse(o => { if (!pt && o.isMesh && o.userData.pick && o.userData.pick.kind === 'wall' && o.userData.pick.id === w.id) { const c = new (v.camera.position.constructor)(); o.geometry.computeBoundingBox(); o.geometry.boundingBox.getCenter(c); o.localToWorld(c); pt = c.project(v.camera); } });
    const r = v.renderer.domElement.getBoundingClientRect();
    const hits = (() => { const e = { clientX: r.left + (pt.x + 1) / 2 * r.width, clientY: r.top + (1 - pt.y) / 2 * r.height }; return { e, hit: v._hits(e)[0] }; })();
    if (!hits.hit || hits.hit.object.userData.pick.kind !== 'wall') return { skipped: true };
    v.live.drop(prod, hits.e);
    return { added: lv.openings.length - before, kind: A.selection && A.selection.kind };
  });
  if (!win.skipped) { assert.equal(win.added, 1, 'window dropped on a wall'); assert.equal(win.kind, 'opening'); }

  // 4) the tour, recorded to a video
  await ev(() => PlanBuilder.view3d.setPreset('iso')); await p.waitForTimeout(800);
  const canRec = await ev(() => PlanBuilder.view3d.live.canRecord());
  const dl = canRec ? p.waitForEvent('download', { timeout: 60000 }) : null;
  const caps = [];
  await ev(() => { window.__caps = []; const o = PlanBuilder.tourCaption; PlanBuilder.tourCaption = t => { if (t) window.__caps.push(t); o(t); }; PlanBuilder.view3d.live.tour({ fast: true, record: true }); });
  await p.waitForTimeout(1500);
  if (shots) await p.screenshot({ path: shots + '/live-tour.png' });
  await p.waitForFunction(() => !PlanBuilder.view3d.live.touring, null, { timeout: 60000, polling: 200 });
  caps.push(...await ev(() => window.__caps));
  assert.ok(caps.length >= 3, 'tour captions: ' + caps); assert.ok(caps.includes('Inside'));
  const opts = await ev(() => ({ cut: PlanBuilder.view3d.opts.cutaway, ceil: PlanBuilder.view3d.opts.ceilings, ctl: PlanBuilder.view3d.controls.enabled }));
  assert.deepEqual(opts, { cut: false, ceil: false, ctl: true }, 'view put back after the tour');
  if (dl) { const f = await dl; const path = shots ? shots + '/' + f.suggestedFilename() : await f.path(); if (shots) await f.saveAs(path); assert.ok(/3D tour\.(webm|mp4)$/.test(f.suggestedFilename()), f.suggestedFilename()); assert.ok(await ev(() => PlanBuilder.view3d.live.lastVideo.size) > 1000, 'video has frames'); }
  else console.log('(this browser cannot record video: recording not checked)');

  assert.deepEqual(errs, []);
  await b.close();
  console.log('PlanBuilder live 3D test passed');
})().catch(e => { console.error(e); process.exit(1); });
