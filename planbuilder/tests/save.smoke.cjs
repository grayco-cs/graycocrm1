// Browser test: save a job to the computer, take it out of the browser, open it again.
//   NODE_PATH=$(npm root -g) node planbuilder/tests/save.smoke.cjs   (with python3 -m http.server 8765 in the repo)
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => { delete window.showSaveFilePicker; window.showSaveFilePicker = undefined; });   // use the download path
  await p.goto('http://localhost:8765/planbuilder/');
  await p.waitForFunction(() => window.PlanBuilder && window.PlanBuilder.project);
  const ev = (f, a) => p.evaluate(f, a);
  await p.click('#btn-projects'); await p.click('.modal .card:has-text("Ranch") button');
  // a custom product, a rendition and a room photo go with the job
  await ev(() => { const A = PlanBuilder; A.catalog.push({ id: 'p-my-tile', category: 'flooring', kind: 'floor', name: 'My special tile', unit: 'SF', price: 9.99, labor: 5, color: '#123456' }); A.level.rooms[0].floorId = 'p-my-tile'; A.level.rooms[0].photos = ['data:image/png;base64,iVBORw0KGgo=']; A.project.renditions.push({ id: 'rd1', name: 'Option A', created: new Date().toISOString(), thumb: '', snapshot: { levels: [], roofs: [], settings: {} } }); A.project.name = 'Smith claim'; A.commit('x'); });
  const id = await ev(() => PlanBuilder.project.id);
  // Save & close
  await p.click('#btn-file');
  const dl = p.waitForEvent('download');
  await p.click('#menu-file [data-file="close"]');
  const file = await dl; const name = file.suggestedFilename(); const path = await file.path();
  assert.ok(/^Smith claim - v1 - \d{4}-\d\d-\d\d\.planbuilder\.json$/.test(name), name);
  await p.waitForTimeout(300);
  assert.equal(await ev(id => (window.localStorage.getItem('pb.project.v1.' + id)), id), null, 'job taken out of the browser');
  assert.notEqual(await ev(() => PlanBuilder.project.name), 'Smith claim');
  // a clean browser: the custom product is not in its catalog
  await ev(() => { PlanBuilder.catalog = PlanBuilder.catalog.filter(x => x.id !== 'p-my-tile'); });
  // Open from computer
  const fc = p.waitForEvent('filechooser');
  await p.click('#btn-file'); await p.click('#menu-file [data-file="open"]');
  await (await fc).setFiles(path);
  await p.waitForFunction(() => PlanBuilder.project.name === 'Smith claim');
  const back = await ev(() => ({ v: PlanBuilder.project.version, r: PlanBuilder.project.renditions.length, ph: PlanBuilder.level.rooms[0].photos.length, prod: !!PlanBuilder.catalog.find(x => x.id === 'p-my-tile'), line: PlanBuilder.takeoff.lines.some(l => l.productId === 'p-my-tile') }));
  assert.deepEqual(back, { v: 1, r: 1, ph: 1, prod: true, line: true });
  // save again: version 2
  const dl2 = p.waitForEvent('download'); await p.keyboard.press('Control+s'); const f2 = await dl2;
  assert.ok(f2.suggestedFilename().includes(' - v2 - '), f2.suggestedFilename());
  // clear all jobs
  await p.click('#btn-projects'); await p.click('.modal button:has-text("Clear all jobs")');
  assert.equal(await ev(() => JSON.parse(localStorage.getItem('pb.projects.v1') || '[]').filter(x => x.name === 'Smith claim').length), 0);
  assert.ok(await ev(() => !!localStorage.getItem('pb.catalog.v1')), 'catalog kept');
  // after a save, the note offers to take the job out of the browser
  await p.click('#btn-projects'); await p.click('.modal .card:has-text("Two-story") button');
  const two = await ev(() => PlanBuilder.project.id);
  const dl3 = p.waitForEvent('download'); await p.keyboard.press('Control+s'); await dl3;
  await p.click('#toast button:has-text("Remove from this browser")');
  assert.equal(await ev(id => localStorage.getItem('pb.project.v1.' + id), two), null, 'removed from the note');
  // weekly clean-up: an old job saved to the computer goes by itself; an old unsaved one is asked about
  await ev(() => {
    const old = new Date(Date.now() - 100 * 86400000).toISOString();
    const mk = (id, name, saved) => { localStorage.setItem('pb.project.v1.' + id, JSON.stringify({ id, name, levels: [{ id: 'l' + id, name: 'F', height: 9, walls: [], rooms: [], openings: [], items: [] }], roofs: [], settings: {} })); return { id, name, updated: old, opened: old, savedAt: saved ? old : '', version: saved ? 2 : 0, dirty: false }; };
    const idx = JSON.parse(localStorage.getItem('pb.projects.v1') || '[]');
    idx.push(mk('old-saved', 'Old saved job', true), mk('old-unsaved', 'Old unsaved job', false));
    localStorage.setItem('pb.projects.v1', JSON.stringify(idx));
    localStorage.setItem('pb.pref.lastCleanup', '0');
  });
  await p.reload(); await p.waitForFunction(() => window.PlanBuilder && window.PlanBuilder.project);
  await p.waitForSelector('.modal h2:has-text("Clean up finished jobs")', { timeout: 5000 });
  assert.equal(await ev(() => localStorage.getItem('pb.project.v1.old-saved')), null, 'old saved job cleaned up by itself');
  assert.ok(await ev(() => !!localStorage.getItem('pb.project.v1.old-unsaved')), 'unsaved job not touched without asking');
  assert.ok(await ev(() => document.querySelector('.modal').textContent.includes('Old unsaved job')));
  await p.click('.modal button:has-text("Keep them for now")');
  assert.ok(await ev(() => !!localStorage.getItem('pb.project.v1.old-unsaved')));
  assert.deepEqual(errs, []);
  console.log('PlanBuilder save / open test passed');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
