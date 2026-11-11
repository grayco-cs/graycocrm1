// Browser test: CRM prices. Seeds the CRM's own browser storage (localStorage Rate Book + IndexedDB grayco_crm/kv),
// then checks PlanBuilder reads it, links products, prices the estimate from it and hides it in customer view.
// Run from the repo root with a static server on :8765 (python3 -m http.server 8765):
//   node planbuilder/tests/crm.smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.env.PB_URL || 'http://localhost:8765/planbuilder/';
const shots = process.argv[2];

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());

  // 1) Without the CRM: nothing found, and PlanBuilder must not create the CRM's database
  await p.goto(URL);
  await p.waitForFunction(() => window.PlanBuilder && window.PlanBuilder.project);
  await p.waitForFunction(() => PlanBuilder.crm);
  assert.equal(await p.evaluate(() => PlanBuilder.crm.found), false);
  const dbs = await p.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : []));
  assert.ok(!dbs.includes('grayco_crm'), 'PlanBuilder did not create the CRM database: ' + dbs);

  // 2) Seed the CRM's storage the way the CRM keeps it
  await p.evaluate(async () => {
    localStorage.setItem('__est__gc_rates_v3', JSON.stringify([
      { desc: 'Paint material 1 coat', cost: 0.2, unit: 'per SF', cat: 'Paint', type: 'material', supplier: 'GrayCo Default Rate' },
      { desc: 'Paint interior 1 coat large', cost: 0.9, unit: 'per SF', cat: 'Paint', type: 'labor', supplier: 'GrayCo Default Rate' },
      { desc: 'Roofing tear off + install (1 layer)', cost: 65, unit: 'per square', cat: 'Roofing', type: 'sub' },
      { desc: 'Concrete footing poured', cost: 410, unit: 'per yard', cat: 'Concrete', type: 'sub' },
    ]));
    localStorage.setItem('__est__gc_settings_v1', JSON.stringify({ tax: 8.25, marginPct: 30 }));
    await new Promise((res, rej) => {
      const r = indexedDB.open('grayco_crm', 3);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
        st.put([{ cat: 'Painting', desc: 'Painter', rate: 40, lastUsed: '2026-11-01' }], 'laborRates');
        st.put([{ id: 'CP1', name: 'Sherwin Duration Interior Paint', cat: 'Paint', unit: 'gal', cost: 52 }], 'customProducts');
        st.put({ P0001: 3.99 }, 'priceEdits');
        tx.oncomplete = () => { r.result.close(); res(); };
      };
    });
  });
  await p.reload();
  await p.waitForFunction(() => PlanBuilder.crm && PlanBuilder.crm.found);
  const counts = await p.evaluate(() => PlanBuilder.crm.counts);
  assert.equal(counts.rateBook, 4); assert.equal(counts.laborRates, 1); assert.ok(counts.products > 3000, 'built-in products + custom: ' + counts.products);
  assert.equal(await p.evaluate(() => PlanBuilder.crm.byKey.get('prod:P0001').cost), 3.99, 'the CRM price edit is used');

  // 3) The window, from the catalog
  await p.click('#btn-catalog');
  await p.click('#cat-crm');
  await p.waitForSelector('.crm-status.ok');
  assert.ok((await p.textContent('.crm-status')).includes('4 Rate Book lines'));

  // link the wall paint by typing in the material and labor boxes
  const paint = await p.evaluate(() => {
    const t = PlanBuilder.takeoff.lines.find(l => l.category === 'paint' && l.unit === 'SF');
    return { id: t.productId, name: PlanBuilder.catalog.find(x => x.id === t.productId).name };
  });
  await p.fill('#crm-q', paint.name);
  const row = p.locator('.crm-table tbody tr').first();
  const matLabel = await p.evaluate(() => [...document.querySelectorAll('#crm-mat option')].map(o => o.value).find(v => v.startsWith('Paint material 1 coat')));
  const labLabel = await p.evaluate(() => [...document.querySelectorAll('#crm-lab option')].map(o => o.value).find(v => v.startsWith('Painting – Painter')));
  await row.locator('td.crm-link input[list="crm-mat"]').fill(matLabel); await row.locator('td.crm-link input[list="crm-mat"]').press('Tab');
  await p.locator('.crm-table tbody tr').first().locator('td.crm-link input[list="crm-lab"]').fill(labLabel);
  await p.locator('.crm-table tbody tr').first().locator('td.crm-link input[list="crm-lab"]').press('Tab');
  // the hourly rate asks for hours per SF
  const hrs = p.locator('.crm-table tbody tr').first().locator('input.crm-per');
  await hrs.fill('0.02'); await hrs.press('Tab');
  const prod = await p.evaluate(id => { const x = PlanBuilder.catalog.find(c => c.id === id); return { price: x.price, labor: x.labor, crm: x.crm }; }, paint.id);
  assert.equal(prod.price, 0.2); assert.equal(prod.labor, 0.8, '$40/hr × 0.02 hr'); assert.equal(prod.crm.lab.hrs, 0.02);
  const line = await p.evaluate(id => PlanBuilder.takeoff.lines.find(l => l.productId === id), paint.id);
  assert.equal(line.price, 0.2); assert.equal(line.labor, 0.8);

  // automatic links are marked for checking, and ✓ confirms one
  await p.click('#crm-auto');
  const autoN = await p.evaluate(() => PlanBuilder.catalog.filter(x => x.crm && ((x.crm.mat && x.crm.mat.auto) || (x.crm.lab && x.crm.lab.auto))).length);
  assert.ok(autoN >= 1, 'something was linked automatically');
  await p.check('#crm-chk');
  await p.locator('.crm-check button').first().click();
  await p.uncheck('#crm-chk'); await p.fill('#crm-q', 'paint');
  if (shots) await p.screenshot({ path: shots + '/crm-products.png' });
  assert.equal(await p.evaluate(() => PlanBuilder.catalog.filter(x => x.crm && ((x.crm.mat && x.crm.mat.auto) || (x.crm.lab && x.crm.lab.auto))).length), autoN - 1);

  // tax & margin from the CRM
  await p.click('#crm-terms');
  const S = await p.evaluate(() => PlanBuilder.project.settings);
  assert.equal(S.taxRate, 8.25); assert.equal(S.profitPct, 42.86); assert.equal(S.overheadPct, 0);

  // Studio rates: link the footing to the CRM sub price
  await p.click('.crm-tabs button[data-t="studio"]');
  const fLabel = await p.evaluate(() => [...document.querySelectorAll('#crm-mat option')].map(o => o.value).find(v => v.startsWith('Concrete footing poured')));
  const frow = p.locator('.crm-table tbody tr', { hasText: 'Continuous footing' });
  await frow.locator('input[list="crm-mat"]').fill(fLabel); await frow.locator('input[list="crm-mat"]').press('Tab');
  assert.equal(await p.evaluate(async () => (await import('./js/systems.js')).rates(PlanBuilder.project).footing), 410);
  if (shots) await p.screenshot({ path: shots + '/crm-window.png' });

  // 4) A price change in the CRM reaches PlanBuilder
  await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('__est__gc_rates_v3')); r[0].cost = 0.25; localStorage.setItem('__est__gc_rates_v3', JSON.stringify(r)); });
  await p.click('#crm-refresh');
  await p.waitForFunction(id => PlanBuilder.catalog.find(c => c.id === id).price === 0.25, paint.id);
  assert.equal(await p.evaluate(id => PlanBuilder.takeoff.lines.find(l => l.productId === id).price, paint.id), 0.25);

  // links survive a reload
  await p.reload();
  await p.waitForFunction(() => PlanBuilder.crm && PlanBuilder.crm.found);
  assert.equal(await p.evaluate(id => PlanBuilder.catalog.find(c => c.id === id).crm.mat.key, paint.id), 'rb:paint material 1 coat|per sf');

  // 5) Customer view: no CRM prices anywhere
  await p.evaluate(() => PlanBuilder.setCustomer(true, true));
  assert.equal(await p.isVisible('#btn-catalog'), false, 'the catalog (prices) is hidden from customers');

  assert.deepEqual(errs, []);
  await b.close();
  console.log('PlanBuilder CRM prices test passed');
})().catch(e => { console.error(e); process.exit(1); });
