// Browser smoke test: draws on the plan with every tool and checks the model, 3D and estimate.
// Run from the repo root with a static server on :8765 (python3 -m http.server 8765):
//   node planbuilder/tests/ui.smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.env.PB_URL || 'http://localhost:8765/planbuilder/';
const shots = process.argv[2];

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(URL);
  await p.waitForFunction(() => window.PlanBuilder && window.PlanBuilder.project);
  const ev = fn => p.evaluate(fn);

  // Start a blank project from the Projects window
  await p.click('#btn-projects');
  await p.click('.modal .card:has-text("Blank plan") button');
  assert.equal(await ev(() => PlanBuilder.level.walls.length), 0);

  // world -> page coordinates on the plan canvas
  const at = async (x, y) => p.evaluate(([x, y]) => { const r = document.querySelector('#plan').getBoundingClientRect(); const s = PlanBuilder.plan.toScreen({ x, y }); return [r.left + s.x, r.top + s.y]; }, [x, y]);
  await ev(() => { PlanBuilder.plan.view = { scale: 12, ox: 120, oy: 120 }; PlanBuilder.plan.draw(); });

  // 1) Walls with typed lengths: 40' east, 30' south, 40' west, close
  await p.keyboard.press('w');
  await p.check('#opt-ext');
  let [x, y] = await at(0, 0); await p.mouse.click(x, y);
  [x, y] = await at(10, 0); await p.mouse.move(x, y);
  await p.keyboard.type('40'); await p.keyboard.press('Enter');
  [x, y] = await at(40, 10); await p.mouse.move(x, y);
  await p.keyboard.type("30'"); await p.keyboard.press('Enter');
  [x, y] = await at(20, 30); await p.mouse.move(x, y);
  await p.keyboard.type('40'); await p.keyboard.press('Enter');
  [x, y] = await at(0, 0); await p.mouse.move(x, y); await p.mouse.click(x, y);
  const walls = await ev(() => PlanBuilder.level.walls.map(w => [w.a.x, w.a.y, w.b.x, w.b.y, w.exterior]));
  assert.equal(walls.length, 4, 'four outside walls: ' + JSON.stringify(walls));
  assert.deepEqual(walls[1], [40, 0, 40, 30, true]);
  await p.uncheck('#opt-ext');

  // 2) Room by dragging: 16 x 30 on the west side (its outside edges already have walls)
  await p.keyboard.press('r');
  [x, y] = await at(0, 0); await p.mouse.move(x, y); await p.mouse.down();
  [x, y] = await at(16, 30); await p.mouse.move(x, y, { steps: 5 }); await p.mouse.up();
  const r1 = await ev(() => ({ rooms: PlanBuilder.level.rooms.length, walls: PlanBuilder.level.walls.length }));
  assert.equal(r1.rooms, 1); assert.equal(r1.walls, 5, 'only the new inside wall is added');
  // and the rest of the house as a second room
  [x, y] = await at(16, 0); await p.mouse.move(x, y); await p.mouse.down();
  [x, y] = await at(40, 30); await p.mouse.move(x, y, { steps: 5 }); await p.mouse.up();
  assert.equal(await ev(() => PlanBuilder.level.walls.length), 5);

  // 3) Door on the south wall
  await p.keyboard.press('d');
  [x, y] = await at(8, 30); await p.mouse.move(x, y); await p.mouse.click(x, y);
  assert.equal(await ev(() => PlanBuilder.level.openings.length), 1);
  // a window from the picker on the north wall
  await p.selectOption('#pick-cat', 'window');
  await p.click('.pcard:has-text("Vinyl single-hung 3050")');
  [x, y] = await at(28, 0); await p.mouse.move(x, y); await p.mouse.click(x, y);
  const ops = await ev(() => PlanBuilder.level.openings.map(o => o.type));
  assert.deepEqual(ops, ['door', 'window']);

  // 4) Place a product (refrigerator)
  await p.selectOption('#pick-cat', 'appliance');
  await p.click('.pcard:has-text("Refrigerator")');
  [x, y] = await at(30, 15); await p.mouse.move(x, y); await p.mouse.click(x, y);
  assert.equal(await ev(() => PlanBuilder.level.items.length), 1);

  // 5) Select a room and apply a floor from the picker
  await p.keyboard.press('v');
  [x, y] = await at(6, 10); await p.mouse.click(x, y);
  assert.equal(await ev(() => PlanBuilder.selection && PlanBuilder.selection.kind), 'room');
  await p.selectOption('#pick-cat', 'flooring');
  await p.click('.pcard:has-text("Porcelain tile")');
  assert.equal(await ev(() => PlanBuilder.findSel(PlanBuilder.selection).floorId), 'flr-tile-porc');

  // 6) Roof by dragging over the walls
  await p.keyboard.press('f');
  [x, y] = await at(0, 0); await p.mouse.move(x, y); await p.mouse.down();
  [x, y] = await at(40, 30); await p.mouse.move(x, y, { steps: 5 }); await p.mouse.up();
  const roof = await ev(() => PlanBuilder.project.roofs[0]);
  assert.ok(roof && roof.w === 40 && roof.d === 30, 'roof 40 x 30');
  // set it to a 7/12 hip from the properties panel
  await p.selectOption('#props select >> nth=0', 'hip');
  await p.fill('#props input[type=number] >> nth=0', '7'); await p.keyboard.press('Tab');
  const rr = await ev(() => PlanBuilder.project.roofs[0]);
  assert.equal(rr.style, 'hip'); assert.equal(rr.pitch, 7);

  // 7) Edit a wall length from the panel
  await p.keyboard.press('Escape');
  await p.keyboard.press('v');
  [x, y] = await at(16, 15); await p.mouse.click(x, y);
  assert.equal(await ev(() => PlanBuilder.selection.kind), 'wall');

  // 8) Undo / redo
  const nItems = await ev(() => PlanBuilder.level.items.length);
  await ev(() => PlanBuilder.doUndo()); await ev(() => PlanBuilder.doRedo());
  assert.equal(await ev(() => PlanBuilder.level.items.length), nItems);

  // 9) Estimate has the roof, floor, door and fridge
  const est = await ev(() => PlanBuilder.takeoff.lines.map(l => l.productId));
  ['rf-arch-shingle', 'flr-tile-porc', 'dr-int-6p', 'wn-sh-3050', 'ap-fridge', 'sid-vinyl'].forEach(id => assert.ok(est.includes(id), 'estimate has ' + id));
  if (shots) await p.screenshot({ path: shots + '/smoke-plan.png' });

  // 10) 3D builds, cutaway, two levels
  await p.click('[data-view="split"]');
  await p.waitForTimeout(1500);
  const meshes = await ev(() => { let n = 0; PlanBuilder.view3d.root.traverse(o => { if (o.isMesh) n++; }); return n; });
  assert.ok(meshes > 20, 'meshes in 3D: ' + meshes);
  await p.click('.levels button:has-text("Level")');
  await p.click('.modal button:has-text("Add with outside walls")');
  assert.equal(await ev(() => PlanBuilder.project.levels.length), 2);
  assert.equal(await ev(() => PlanBuilder.project.levels[1].elevation), 10);
  await p.check('#v-cut'); await p.waitForTimeout(500);
  if (shots) await p.screenshot({ path: shots + '/smoke-split.png' });

  // 11) Templates all load and price
  for (const t of ['ranch', 'twostory', 'commercial']) {
    await p.click('#btn-projects');
    await p.click(`.modal .card >> nth=${['blank', 'ranch', 'twostory', 'commercial'].indexOf(t)} >> button`);
    await p.click('[data-view="3d"]'); await p.waitForTimeout(1200);
    const g = await ev(() => PlanBuilder.takeoff.totals.grand);
    assert.ok(g > 50000, t + ' total ' + g);
    if (shots) await p.screenshot({ path: shots + `/smoke-${t}.png` });
  }

  // 11b) Make 3D plays the build animation and ends with every piece in place
  await p.click('#btn-make3d');
  await p.waitForTimeout(400);
  assert.ok(await ev(() => PlanBuilder.view3d.building), 'build animation is running');
  await p.waitForFunction(() => !PlanBuilder.view3d.building, null, { timeout: 30000 });
  assert.ok(await ev(() => { let ok = true; PlanBuilder.view3d.root.traverse(o => { if (o.userData.build && (!o.visible || Math.abs(o.scale.y - 1) > 1e-6)) ok = false; }); return ok; }), 'all pieces in place after the build');

  // 12) Catalog editor: change a price, estimate follows
  await p.click('#btn-catalog');
  const before = await ev(() => PlanBuilder.takeoff.totals.grand);
  await p.fill('.modal input[type=search]', 'Porcelain tile');
  await p.fill('.cat-table tbody tr >> nth=0 >> td.num input >> nth=0', '10'); await p.keyboard.press('Tab');
  await p.click('#modal-x');
  const after = await ev(() => PlanBuilder.takeoff.totals.grand);
  assert.ok(after > before, 'tile price raised the total');

  // 13) Print layout builds (plans + 3D + estimate)
  await ev(() => PlanBuilder.buildPrint(true));
  assert.ok(await ev(() => document.querySelectorAll('#print img').length >= 4));

  // 14) Exports produce files
  const dl = p.waitForEvent('download'); await ev(() => PlanBuilder.exportAs('csv')); const f = await dl; assert.ok((await f.suggestedFilename()).endsWith('.csv'));
  const dl2 = p.waitForEvent('download'); await ev(() => PlanBuilder.exportAs('glb')); const f2 = await dl2; assert.ok((await f2.suggestedFilename()).endsWith('.glb'));

  assert.deepEqual(errs, [], 'page errors: ' + errs.join('\n'));
  console.log('PlanBuilder smoke test passed');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
