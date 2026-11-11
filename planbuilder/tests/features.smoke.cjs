// Browser test of the house-design features: existing house + addition, demolition, styles, auto-furnish,
// Make 3D, Before / After, walk-through (walls stop you), entered estimate + price memory, customer view
// (no prices on screen), renditions, and dragging furniture in 3D.
// Run from the repo root with python3 -m http.server 8765 going:
//   NODE_PATH=$(npm root -g) node planbuilder/tests/features.smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/planbuilder/');
  await p.waitForFunction(() => window.PlanBuilder && window.PlanBuilder.project);
  const ev = (f, a) => p.evaluate(f, a);
  await p.click('#btn-projects'); await p.click('.modal .card:has-text("Ranch") button');
  // 1) the drawn house is existing
  await p.click('.right button:has-text("All of this level is existing")');
  assert.equal(await ev(() => PlanBuilder.level.walls.every(w => w.phase === 'existing')), true);
  // 2) draw an addition: a 20x16 family room off the back (north) wall, new
  await ev(() => PlanBuilder.plan.view = { scale: 9, ox: 300, oy: 330 });
  await p.click('#phase-seg [data-phase="new"]');
  await p.click('[data-tool="room"]');
  const at = async (x, y) => p.evaluate(([x, y]) => { const r = document.querySelector('#plan').getBoundingClientRect(); const s = PlanBuilder.plan.toScreen({ x, y }); return [r.left + s.x, r.top + s.y]; }, [x, y]);
  let [x, y] = await at(20, -16); await p.mouse.move(x, y); await p.mouse.down(); [x, y] = await at(40, 0); await p.mouse.move(x, y, { steps: 6 }); await p.mouse.up();
  await ev(() => { const r = PlanBuilder.findSel(PlanBuilder.selection); r.name = 'Family room'; PlanBuilder.commit('name'); });
  // knock out part of the old back wall: mark it demolish
  await ev(async () => { const A = PlanBuilder, L = A.level, M = await import('./js/model.js'); const n = L.walls.find(w => w.a.y === 0 && w.b.y === 0 && w.a.x === 0 && w.b.x === 60); const w2 = M.splitWall(L, n, 20 / 60); const w3 = M.splitWall(L, w2, 0.5); w2.phase = 'demo'; void w3; A.commit('demo'); });
  // existing door on demo wall becomes demo too? fine
  if (out) await p.screenshot({ path: out + '/f-plan.png' });
  await ev(() => PlanBuilder.select(null));
  // 3) style the new work only: frames a roof over it
  await p.click('.style-card:has-text("Modern Farmhouse")');
  await p.click('.right button:has-text("Apply to new work only")');
  const nroofs = await ev(() => PlanBuilder.project.roofs.filter(r => r.phase === 'new').length);
  assert.equal(nroofs, 1, 'a roof framed over the addition');
  await p.click('.right button:has-text("Furnish all rooms")');
  const furn = await ev(() => PlanBuilder.level.items.filter(i => i.auto).length);
  assert.ok(furn > 30, 'furnished ' + furn);
  const T = await ev(() => ({ newArea: PlanBuilder.takeoff.summary.newArea, lines: PlanBuilder.takeoff.lines.map(l => l.productId) }));
  assert.equal(Math.round(T.newArea), 320); assert.ok(T.lines.includes('lb-demo-wall')); assert.ok(!T.lines.includes('flr-carpet'), 'existing bedrooms not priced');
  // 4) 3D after / before
  await p.click('#btn-make3d'); await p.waitForTimeout(800); await p.waitForFunction(() => PlanBuilder.view3d && !PlanBuilder.view3d.building, null, { timeout: 30000 });
  await p.check('#v-new'); await p.waitForTimeout(300);
  if (out) await p.screenshot({ path: out + '/f-after.png' });
  await p.uncheck('#v-new'); await p.selectOption('#v-phase', 'before'); await p.waitForTimeout(300);
  if (out) await p.screenshot({ path: out + '/f-before.png' });
  await p.selectOption('#v-phase', 'after');
  // 5) whole-house style + cutaway interior
  await p.click('[data-view="split"]');
  await ev(() => PlanBuilder.select(null));
  await p.click('.style-card:has-text("Craftsman")'); await p.click('.right button:has-text("Apply to whole house")');
  await p.click('[data-view="3d"]'); await p.check('#v-cut'); await p.waitForTimeout(500);
  if (out) await p.screenshot({ path: out + '/f-inside.png' });
  await p.uncheck('#v-cut');
  // 6) walk: start inside, walk forward, room card
  await p.click('#v-walk'); await p.waitForTimeout(600);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(900); await p.keyboard.up('KeyW');
  await p.waitForTimeout(400);
  const hud = await ev(() => !document.querySelector('#walk-hud').hidden && document.querySelector('#walk-hud h4') && document.querySelector('#walk-hud h4').textContent);
  console.log('walk room:', hud);
  if (out) await p.screenshot({ path: out + '/f-walk.png' });
  // walls stop you: walk forward a long time, still inside the house bounds
  await p.keyboard.down('KeyW'); await p.waitForTimeout(3000); await p.keyboard.up('KeyW');
  const pos = await ev(() => { const c = PlanBuilder.view3d.camera.position; return [c.x, c.z]; });
  assert.ok(pos[0] > -1 && pos[0] < 61 && pos[1] > -17 && pos[1] < 31, 'stayed inside: ' + pos);
  await p.click('#v-walk'); await p.waitForTimeout(300);
  // 7) enter an estimate by pasting lines into a room
  await p.click('[data-view="plan"]');
  const roomId = await ev(() => PlanBuilder.level.rooms.find(r => r.name === 'Kitchen').id);
  await ev(id => PlanBuilder.enterEstimate(id), roomId);
  await p.fill('.paste-box', 'FCV LVP  R&R Vinyl plank flooring  224 SF  6.85\nDRY 1/2  Drywall 1/2" hung taped floated  96.5 SF  2.41\nCLN BIO  Clean and treat with antimicrobial 224 SF 0.38');
  await p.click('.modal button:has-text("Read pasted lines")');
  const parsed = await ev(() => [...document.querySelectorAll('.modal tbody tr')].map(tr => [...tr.querySelectorAll('input,select')].map(i => i.value)));
  console.log(JSON.stringify(parsed));
  await p.click('.modal button:has-text("Add to this job")');
  const xl = await ev(() => PlanBuilder.project.extraLines.filter(x => x.note === 'Entered estimate').length);
  assert.ok(xl >= 3, 'lines added ' + xl);
  const mem = await ev(async () => (await import('./js/store.js')).getBook('pl-learned').count);
  assert.ok(mem >= 3, 'remembered ' + mem);
  // 8) customer view: no $ anywhere
  await p.click('#btn-customer');
  await p.click('[data-view="estimate"]'); await p.waitForTimeout(300);
  const dollars = await ev(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.children.length === 0 && /\$\d/.test(e.textContent)).map(e => e.textContent).slice(0, 5));
  assert.deepEqual(dollars, [], 'no prices visible: ' + dollars);
  if (out) await p.screenshot({ path: out + '/f-scope.png' });
  await p.click('#btn-customer');
  // 9) renditions
  await ev(() => PlanBuilder.showRenditions()); await p.fill('.modal input', 'Option A – Craftsman'); await p.click('.modal button:has-text("Save current")'); await p.waitForTimeout(1500);
  assert.equal(await ev(() => PlanBuilder.project.renditions.length), 1);
  if (out) await p.screenshot({ path: out + '/f-rend.png' });
  await p.click('#modal-x');
  // 10) edit in 3D: select a sofa and drag it
  await p.click('[data-view="3d"]'); await p.waitForTimeout(800);
  const it = await ev(() => { const i = PlanBuilder.level.items.find(x => x.productId === 'fn-sofa-3' || x.productId === 'fn-sofa-sect'); PlanBuilder.pickFrom3D({ kind: 'item', id: i.id, levelId: PlanBuilder.level.id }); return { id: i.id, x: i.x, y: i.y }; });
  await ev(() => { const v = PlanBuilder.view3d; v.setPreset('top'); });
  await p.waitForTimeout(100); await p.waitForFunction(() => !PlanBuilder.view3d.flying); await p.waitForTimeout(600);   // the camera glides to the top view and settles
  const scr = await ev(id => { const v = PlanBuilder.view3d, i = PlanBuilder.level.items.find(x => x.id === id); const THREE_v = v.camera.position.clone(); THREE_v.set(i.x, PlanBuilder.level.elevation + 1, i.y); THREE_v.project(v.camera); const r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (THREE_v.x + 1) / 2 * r.width, r.top + (1 - THREE_v.y) / 2 * r.height]; }, it.id);
  await p.mouse.move(scr[0], scr[1]); await p.mouse.down();
  await p.mouse.move(scr[0] + 60, scr[1] + 10, { steps: 8 }); await p.mouse.up();
  const moved = await ev(id => { const i = PlanBuilder.level.items.find(x => x.id === id); return [i.x, i.y]; }, it.id);
  console.log('sofa', it.x, it.y, '->', moved);
  assert.ok(Math.abs(moved[0] - it.x) > 0.5, 'dragged in 3D');
  assert.deepEqual(errs, [], 'page errors: ' + errs.join('\n'));
  console.log('PlanBuilder features test passed');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
