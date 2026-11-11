// Browser test of Studio: systems budget, picking a system, timeline steps, explode / finished / ortho,
// hover labels, cutaway, and the customer view (no prices anywhere).
// Run from the repo root with python3 -m http.server 8765 going:
//   NODE_PATH=$(npm root -g) node planbuilder/tests/studio.smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 940 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/planbuilder/');
  await p.waitForFunction(() => window.PlanBuilder && window.PlanBuilder.project);
  const ev = (f, a) => p.evaluate(f, a);
  await p.click('#btn-projects'); await p.click('.modal .card:has-text("Office in front") button');
  await p.click('[data-view="studio"]');
  await p.waitForFunction(() => PlanBuilder.view3d && PlanBuilder.view3d.studio && PlanBuilder.view3d.studio.groups.length === 17);
  await p.waitForTimeout(800);
  // budget and systems
  const total = await ev(() => document.querySelector('.st-total b').textContent);
  assert.match(total, /^\$\d{3},\d{3}$/, 'total ' + total);
  assert.ok(await ev(() => document.querySelectorAll('#st-sys li').length) >= 15);
  assert.equal(await ev(() => getComputedStyle(document.querySelector('aside.right')).display), 'none', 'props panel hidden in Studio');
  if (out) await p.screenshot({ path: out + '/st-all.png' });
  // pick structural steel: drawer with line items
  await p.click('#st-sys li[data-sys="frame"]'); await p.waitForTimeout(500);
  assert.equal(await ev(() => PlanBuilder.view3d.studio.st.sel), 'frame');
  const items = await ev(() => [...document.querySelectorAll('#st-drawer tbody tr')].map(r => r.cells[0].textContent));
  assert.ok(items.some(t => /HSS/.test(t)) && items.some(t => /girder/.test(t)), 'steel lines: ' + items);
  if (out) await p.screenshot({ path: out + '/st-steel.png' });
  // hide a system with the eye
  await p.click('#st-sys li[data-sys="env"] .st-eye');
  assert.ok(await ev(() => PlanBuilder.view3d.studio.st.hidden.has('env')));
  await p.click('#st-sys li[data-sys="env"] .st-eye');
  // timeline: step 5 shows only up to the slab
  await p.click('#st-chips button[data-step="5"]'); await p.waitForTimeout(1200);
  const vis = await ev(() => PlanBuilder.view3d.studio.groups.map(g => g.visible));
  assert.deepEqual(vis.slice(0, 6), [true, true, true, true, true, true]); assert.equal(vis[6], false);
  assert.equal(await ev(() => document.querySelector('#st-phase').textContent), 'Slab Pour');
  // display modes
  await p.click('#st-modes [data-m="explode"]'); await p.waitForTimeout(900);
  assert.ok(await ev(() => PlanBuilder.view3d.studio.groups[5].position.y > 1), 'exploded');
  await p.click('#st-modes [data-m="explode"]');
  await p.click('#st-chips button[data-step="16"]'); await p.waitForTimeout(400);
  await p.click('#st-modes [data-m="ortho"]'); await p.waitForTimeout(300);
  assert.ok(await ev(() => PlanBuilder.view3d.camera.isOrthographicCamera));
  await p.click('#st-modes [data-m="ortho"]');
  assert.ok(await ev(() => PlanBuilder.view3d.camera.isPerspectiveCamera));
  await p.click('#st-modes [data-m="finished"]'); await p.waitForTimeout(300);
  if (out) await p.screenshot({ path: out + '/st-finished.png' });
  await p.click('#st-modes [data-m="finished"]');
  // cutaway
  await p.fill('#st-cut', '40'); await p.dispatchEvent('#st-cut', 'input');
  assert.equal(await ev(() => PlanBuilder.view3d.renderer.clippingPlanes.length), 1);
  await p.fill('#st-cut', '100'); await p.dispatchEvent('#st-cut', 'input');
  // hover label over the model
  await ev(() => PlanBuilder.view3d.studio.select(null));
  const c = await ev(() => { const r = document.querySelector('#view-pane canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(c[0], c[1]); await p.mouse.move(c[0] + 4, c[1] + 2); await p.waitForTimeout(300);
  assert.ok(await ev(() => !document.querySelector('#st-tip').hidden), 'hover label');
  // play from the start
  await p.click('#st-play'); await p.waitForTimeout(2500);
  const st = await ev(() => PlanBuilder.view3d.studio.st.step);
  assert.ok(st >= 1 && st < 16, 'playing, step ' + st);
  await p.click('#st-play');
  // customer view: no dollar amounts
  await p.click('#btn-customer'); await p.waitForTimeout(300);
  await p.click('#st-sys li[data-sys="frame"]');
  const dollars = await ev(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.children.length === 0 && /\$\d/.test(e.textContent)).map(e => e.textContent).slice(0, 5));
  assert.deepEqual(dollars, [], 'no prices visible: ' + dollars);
  await p.click('#btn-customer');
  // include the structure in the estimate: the estimate total matches Studio's
  await p.check('#st-inc'); await p.waitForTimeout(400);
  const same = await ev(() => Math.abs(PlanBuilder.takeoff.totals.grand - PlanBuilder.studioAnalysis().total) < 0.01);
  assert.ok(same, 'estimate total = Studio total');
  // back to the plan: Studio closes, the sky is back
  await p.click('[data-view="3d"]'); await p.waitForTimeout(500);
  assert.equal(await ev(() => PlanBuilder.view3d.opts.studio), false);
  assert.ok(await ev(() => document.querySelector('#studio').hidden));
  assert.deepEqual(errs, [], 'page errors: ' + errs.join('\n'));
  console.log('PlanBuilder Studio test passed');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
