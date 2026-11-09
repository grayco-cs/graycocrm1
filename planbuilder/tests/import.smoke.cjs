// Browser test of importing plans (a drawn picture, a PDF with room labels, an AutoCAD DXF) and the
// AutoCAD-style command line (walls by typed points, ORTHO, a typed rectangle room, CLOSE, HELP).
// Run from the repo root with python3 -m http.server 8765 going:
//   NODE_PATH=$(npm root -g) node planbuilder/tests/import.smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/planbuilder/');
  await p.waitForFunction(() => window.PlanBuilder && window.PlanBuilder.project);
  const ev = (f, a) => p.evaluate(f, a);
  const fx = n => path.join(__dirname, 'fixtures', n);
  const summary = () => ev(() => { const L = PlanBuilder.level; return { walls: L.walls.length, ext: L.walls.filter(w => w.exterior).length, doors: L.openings.filter(o => o.type === 'door').length, windows: L.openings.filter(o => o.type === 'window').length, rooms: L.rooms.map(r => r.name).sort(), roofs: PlanBuilder.project.roofs.length }; });

  // 1) a picture: draw a 40'x30' plan on a canvas (20 px per foot), import it
  const png = await ev(() => {
    const S = 20, O = 100, c = document.createElement('canvas'); c.width = 1000; c.height = 800;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1000, 800); x.fillStyle = '#111';
    const f = v => O + v * S, R = (x0, y0, x1, y1) => x.fillRect(f(x0), f(y0), f(x1) - f(x0), f(y1) - f(y0));
    R(-0.25, -0.25, 10, 0.25); R(14, -0.25, 40.25, 0.25); R(-0.25, 29.75, 20, 30.25); R(23, 29.75, 40.25, 30.25); R(-0.25, -0.25, 0.25, 30.25); R(39.75, -0.25, 40.25, 30.25);
    [-0.15, 0, 0.15].forEach(d => R(10, d - 0.03, 14, d + 0.03));
    R(15.8, 0, 16.2, 12); R(15.8, 15, 16.2, 30); R(16, 17.8, 40, 18.2);
    x.font = '14px sans-serif'; x.fillText("40'-0\"", f(18), f(-1.5)); x.fillRect(f(0), f(-1), f(40) - f(0), 1);
    return c.toDataURL('image/png');
  });
  const buf = Buffer.from(png.split(',')[1], 'base64');
  await p.click('#btn-import');
  await p.setInputFiles('#imp-file', { name: 'house-scan.png', mimeType: 'image/png', buffer: buf });
  await p.waitForSelector('#imp-work:not([hidden])');
  await p.fill('#imp-width', "40'"); await p.waitForTimeout(500);
  const found = await ev(() => document.querySelector('#imp-found').textContent);
  console.log('picture:', found);
  if (out) await p.screenshot({ path: out + '/imp-picture.png' });
  await p.uncheck('#imp-3d');
  await p.click('#imp-go'); await p.waitForTimeout(400);
  let s = await summary(); console.log(JSON.stringify(s));
  assert.equal(s.walls, 6); assert.equal(s.ext, 4); assert.equal(s.doors, 2); assert.equal(s.windows, 1); assert.equal(s.rooms.length, 3); assert.equal(s.roofs, 1);
  const area = await ev(() => Math.round(PlanBuilder.takeoff.summary.floorArea));
  assert.ok(Math.abs(area - 1200) < 30, 'area ' + area);
  assert.ok(await ev(() => !!PlanBuilder.level.underlay), 'picture kept under the plan');

  // 2) a PDF with room names
  await p.click('#btn-import');
  await p.setInputFiles('#imp-file', fx('plan-40x30.pdf'));
  await p.waitForSelector('#imp-work:not([hidden])', { timeout: 20000 });
  await p.fill('#imp-width', "40'"); await p.waitForTimeout(500);
  console.log('pdf:', await ev(() => document.querySelector('#imp-found').textContent));
  if (out) await p.screenshot({ path: out + '/imp-pdf.png' });
  await p.click('#imp-go'); await p.waitForTimeout(800);
  s = await summary(); console.log(JSON.stringify(s));
  assert.ok(s.rooms.includes('Kitchen') && s.rooms.includes('Bedroom') && s.rooms.includes('Living Room'), 'PDF labels name the rooms: ' + s.rooms);
  assert.equal(s.windows, 1); assert.equal(s.doors, 2);
  await p.waitForFunction(() => PlanBuilder.view3d && !PlanBuilder.view3d.building, null, { timeout: 30000 });   // Build the 3D was on
  assert.ok(await ev(() => PlanBuilder.view === '3d' || PlanBuilder.view === 'split'));
  if (out) await p.screenshot({ path: out + '/imp-3d.png' });

  // 3) an AutoCAD DXF in inches
  await p.click('[data-view="plan"]');
  await p.click('#btn-import');
  await p.setInputFiles('#imp-file', fx('plan-30x24.dxf'));
  await p.waitForSelector('#imp-work:not([hidden])');
  console.log('dxf:', await ev(() => document.querySelector('#imp-found').textContent));
  await p.uncheck('#imp-3d');
  await p.click('#imp-go'); await p.waitForTimeout(400);
  s = await summary(); console.log(JSON.stringify(s));
  assert.equal(s.walls, 5); assert.deepEqual(s.rooms, ['Bedroom', 'Great Room']); assert.equal(s.doors, 2);
  assert.equal(await ev(() => Math.round(PlanBuilder.takeoff.summary.floorArea)), 720);

  // 4) command line: L, typed points, ORTHO, CLOSE, a 12x10 room by size, HELP
  await p.click('#btn-projects'); await p.click('.modal .card:has-text("Blank") button');
  const cmd = async t => { await p.click('#cmd'); await p.keyboard.type(t); await p.keyboard.press('Enter'); };
  await cmd('L'); assert.equal(await ev(() => PlanBuilder.tool), 'wall');
  await cmd('0,0'); await cmd('@30,0'); await cmd('@20<270'); await cmd('@30<180'); await cmd('C');
  s = await summary(); assert.equal(s.walls, 4, 'four walls typed');
  const box = await ev(() => PlanBuilder.level.walls.map(w => [w.a.x, w.a.y, w.b.x, w.b.y]));
  assert.deepEqual(box[1], [30, 0, 30, 20]); assert.deepEqual(box[3], [0, 20, 0, 0]);
  await cmd('O'); assert.equal(await ev(() => PlanBuilder.plan.ortho), true);
  assert.ok(await ev(() => document.querySelector('#tg-ortho').classList.contains('on')));
  await cmd('12x10');
  assert.equal(await ev(() => PlanBuilder.level.rooms.length), 1);
  assert.equal(await ev(() => Math.round(PlanBuilder.takeoff.summary.floorArea)), 120);
  await cmd('REC'); await cmd('0,0'); await cmd('@30,20');
  assert.equal(await ev(() => PlanBuilder.level.rooms.length), 2);
  await cmd('HELP'); assert.ok(await ev(() => /ORTHO/.test(document.querySelector('.cmd-help').textContent))); await p.click('#modal-x');
  await cmd('U'); assert.equal(await ev(() => PlanBuilder.level.rooms.length), 1, 'undo');
  if (out) await p.screenshot({ path: out + '/imp-cmd.png' });
  assert.deepEqual(errs, [], 'page errors: ' + errs.join('\n'));
  console.log('PlanBuilder import + command line test passed');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
