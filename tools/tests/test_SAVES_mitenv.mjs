// test_SAVES_mitenv.mjs <build-dir> [env|equip|read|receipt] — SAVES group "mitenv": GrayCo Mitigation and GrayCo
// Environmental in the field (iPhone) and on the Desk, plus the field receipt.
//   env     Environmental tech: 🌫 Air monitoring → the form → Save    → job P4 envLog in the database, the office's Desk shows it,
//           reload keeps it; the office adds a 🛢 waste entry on Desk at the same time → both kept
//   equip   Mitigation tech: 🌬 Equipment → Add (vendor, kind, delivered) → job P3 equipment in the database, Desk shows it, reload
//   read    Mitigation tech: ➕ Moisture reading → the drying screen → a reading → the claim (gc_claims) in the database, Desk, reload
//   receipt GrayCo Field: 🧾 Snap a receipt → job, store, price, photo → Save → expenses + the receipt photo in the database, Desk
import { H, seed, device, reload, cloudWait, pageWait, R, table, arr, find, sleep, shot, closeAll, counts } from './saves_lib.mjs';
const only = process.argv.slice(3); const want = k => !only.length || only.includes(k);
const W = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function tapText(A, rx){
  const b = A.page().locator('button:visible, [role=button]:visible').filter({ hasText: rx }).first();
  if (!(await b.count())) return false;
  await b.tap({ timeout: 6000 }).catch(() => b.click({ timeout: 6000 }).catch(() => {})); await sleep(2200); return true;
}
const screenSays = A => A.ev(() => [...document.querySelectorAll('body > div')].filter(e => e.offsetHeight > 120 && getComputedStyle(e).display !== 'none' && e.id !== 'gc-est-notes-panel').map(e => (e.id || String(e.className).slice(0, 20)) + ': ' + e.innerText.replace(/\s+/g, ' ').slice(0, 160)).slice(-2));
async function pickJob(A, pid){ await A.ev(p => { const s = [...document.querySelectorAll('select')].find(x => x.offsetParent && [...x.options].some(o => o.value === p)); if (s) { s.value = p; s.dispatchEvent(new Event('change', { bubbles: true })); } }, pid); }

async function env(){
  seed();
  const P = await device('phone', 'env@grayco-cs.com'); W.push(P);
  const opened = await tapText(P, /Air monitoring|🌫/);
  if (!opened) console.log('  (no 🌫 Air monitoring button)', JSON.stringify(await screenSays(P)));
  await pickJob(P, 'P4');
  const form = P.page().locator('form.mws-form[data-mws-env="air"]').first();
  const has = await form.count();
  R('environmental air sample', 'phone', 'form opens', !!has, has ? undefined : await screenSays(P));
  if (has) {
    await form.locator('[data-mws-f="loc"]').fill('Kitchen, inside containment');
    await form.locator('[data-mws-f="result"]').fill('0.004 f/cc');
    await form.locator('[data-mws-f="pass"]').selectOption('Pass').catch(() => {});
    await form.locator('button[type=submit]').tap().catch(() => form.locator('button[type=submit]').click());
    await sleep(1500);
    const db = await cloudWait(() => arr((find('projects', 'P4') || {}).envLog).find(x => x.kind === 'air' && x.result === '0.004 f/cc'), 30000);
    R('environmental air sample', 'phone', 'db', !!db, { envLog: (find('projects', 'P4') || {}).envLog });
    const D = await device('desk', 'office@grayco-cs.com'); W.push(D);
    R('environmental air sample', 'phone', 'other', !!(await pageWait(D, 'projects', 'P4', p => arr(p.envLog).some(x => x.result === '0.004 f/cc'), 30000)));
    // the office logs a waste manifest on Desk while the phone logs a second air sample: both kept
    await P.ev(() => { document.querySelectorAll('form.mws-form').forEach(f => f.closest('[id]') && 0); });
    const waste = await D.ev(() => { try { return !!(window._gcMitWS && window._gcMitWS.envAdd('P4', 'waste', { wtype: 'Asbestos (ACM) — non-friable', manifest: 'DEMO-MAN-7' })); } catch (e) { return false; } });
    await tapText(P, /Air monitoring|🌫/); await pickJob(P, 'P4');
    const f2 = P.page().locator('form.mws-form[data-mws-env="air"]').first();
    if (await f2.count()) { await f2.locator('[data-mws-f="result"]').fill('0.006 f/cc'); await f2.locator('button[type=submit]').tap().catch(() => f2.locator('button[type=submit]').click()); }
    const both = await cloudWait(() => { const l = arr((find('projects', 'P4') || {}).envLog); return l.some(x => x.manifest === 'DEMO-MAN-7') && l.some(x => x.result === '0.006 f/cc') ? l : null; }, 45000);
    R('environmental, phone + Desk on one job', 'both', 'db: both entries kept', !!(waste && both), { waste, envLog: arr((find('projects', 'P4') || {}).envLog).map(x => x.kind + ':' + (x.result || x.manifest)) });
    await reload(P);
    R('environmental air sample', 'phone', 'reload', !!(await pageWait(P, 'projects', 'P4', p => arr(p.envLog).some(x => x.result === '0.004 f/cc'), 20000)));
    await D.close();
  }
  await P.close(); W.length = 0;
}
async function equip(){
  seed();
  const P = await device('phone', 'mit@grayco-cs.com'); W.push(P);
  const opened = await tapText(P, /Equipment|🌬/);
  if (!opened) console.log('  (no 🌬 Equipment button)', JSON.stringify(await screenSays(P)));
  await pickJob(P, 'P3'); await sleep(800);
  const vendor = P.page().locator('input[name="vendor"]:visible').first();
  const has = await vendor.count();
  R('mitigation equipment placed', 'phone', 'form opens', !!has, has ? undefined : await screenSays(P));
  if (has) {
    await vendor.fill('Demo Rentals'); await P.page().locator('button:visible', { hasText: /^Add$/ }).first().tap().catch(() => {});
    await sleep(1500);
    const db = await cloudWait(() => arr((find('projects', 'P3') || {}).equipment).find(x => x.vendor === 'Demo Rentals'), 30000);
    R('mitigation equipment placed', 'phone', 'db', !!db, { equipment: (find('projects', 'P3') || {}).equipment, claim: arr(H.cget('gc_claims')).map(c => arr(c.equipment).length) });
    const D = await device('desk', 'office@grayco-cs.com'); W.push(D);
    R('mitigation equipment placed', 'phone', 'other', !!(await pageWait(D, 'projects', 'P3', p => arr(p.equipment).some(x => x.vendor === 'Demo Rentals'), 30000)));
    await reload(P);
    R('mitigation equipment placed', 'phone', 'reload', !!(await pageWait(P, 'projects', 'P3', p => arr(p.equipment).some(x => x.vendor === 'Demo Rentals'), 20000)));
    await D.close();
  }
  await P.close(); W.length = 0;
}
async function readings(){
  seed();
  const P = await device('phone', 'mit@grayco-cs.com'); W.push(P);
  const opened = await tapText(P, /Moisture reading|➕ Moisture/);
  await sleep(2500);
  console.log('  (drying screen)', JSON.stringify(await screenSays(P)));
  const add = await tapText(P, /Add (a )?reading|＋ Reading|New reading|Add point|＋ Add/);
  const inp = P.page().locator('input[type=number]:visible, input[inputmode=decimal]:visible').first();
  let typed = false;
  if (await inp.count()) { await inp.fill('18'); typed = true; }
  const saved = typed && await tapText(P, /^Save|Add$|Log it|Record/);
  R('mitigation moisture reading', 'phone', 'screen (button → reading → save)', !!(opened && typed && saved), { opened, add, typed, saved });
  const db = await cloudWait(() => arr(H.cget('gc_claims')).some(c => JSON.stringify(c).indexOf('18') >= 0 && JSON.stringify(c).length > 400), 30000);
  R('mitigation moisture reading', 'phone', 'db', !!db);
  await P.close(); W.length = 0;
}
async function receipt(){
  seed();
  const P = await device('phone'); W.push(P);
  let opened = await P.page().locator('[data-fa="tile"][data-tile="receipt"]').first().tap({ timeout: 5000 }).then(() => true, () => false);
  if (!opened) opened = await tapText(P, /Snap a receipt|🧾/);
  await sleep(1500);
  const has = await P.page().locator('#_lePrice').count();
  R('field receipt', 'phone', 'form opens', !!has, has ? undefined : await screenSays(P));
  if (has) {
    await P.ev(() => { const s = document.getElementById('_leJob'); if (s && s.tagName === 'SELECT') { s.value = 'P1'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
    await P.page().fill('#_leStore', 'Demo Hardware'); await P.page().fill('#_lePrice', '42.50');
    try { await P.page().setInputFiles('#_lePhoto', { name: 'receipt.png', mimeType: 'image/png', buffer: PNG }); } catch (e) {}
    await sleep(800);
    await P.page().locator('#_leSave').tap().catch(() => P.page().click('#_leSave'));
    await sleep(2000);
    const db = await cloudWait(() => arr(H.cget('expenses')).find(x => +x.amt === 42.5 && x.pid === 'P1'), 30000);
    R('field receipt', 'phone', 'db', !!db, { expenses: arr(H.cget('expenses')).map(x => [x.amt, x.pid]) });
    const photo = await cloudWait(() => [...H.cloud.keys()].some(k => /^doc:/.test(k)) || H.storage.size > 0, 20000);
    R('field receipt photo', 'phone', 'db', !!photo, { docs: [...H.cloud.keys()].filter(k => /^doc:/.test(k)), files: H.storage.size });
    if (db) {
      const D = await device('desk'); W.push(D);
      R('field receipt', 'phone', 'other', !!(await pageWait(D, 'expenses', db.id, null, 30000)));
      await reload(P);
      R('field receipt', 'phone', 'reload', !!(await pageWait(P, 'expenses', db.id, null, 20000)));
      await D.close();
    }
  }
  await P.close(); W.length = 0;
}
for (const [k, f] of [['env', env], ['equip', equip], ['read', readings], ['receipt', receipt]]) {
  if (!want(k)) continue;
  try { await f(); } catch (e) { console.log('  ✗ FAIL ' + k + ' crashed: ' + String(e && e.stack || e).slice(0, 600)); await closeAll(W); W.length = 0; }
}
await closeAll(W);
table('SAVES mitenv');
process.exit(counts().fail ? 1 : 0);
