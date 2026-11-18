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
async function tapText(A, rx, scope){
  /* the person taps what is on top: GrayCo Field (or the job page / an open sheet), not the Desk behind it */
  const top = scope || await A.ev(() => { const ids = ['gc-mws-sheet', '_gcJobDash', '_gcJobPick']; for (const id of ids) { const e = document.getElementById(id); if (e && e.offsetHeight) return '#' + id; } return 'body'; });
  const b = A.page().locator(top + ' button:visible, ' + top + ' [role=button]:visible').filter({ hasText: rx }).first();
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
  const pg = P.page();
  await H.waitFor(P, () => { try { return !!(window._gcClaims && window._gcClaims.forProject && window._gcClaims.forProject('P3')); } catch (e) { return false; } }, null, 30000);   /* the phone has the drying file */
  const opened = await tapText(P, /Moisture reading/);
  await pickJob(P, 'P3'); await sleep(2500);
  const f = pg.locator('.gcbb-moistform:visible').first();
  const has = await f.count();
  R('mitigation moisture reading', 'phone', 'form opens', !!has, has ? undefined : await screenSays(P));
  if (has) {
    await f.locator('input[name="room"]').fill('Kitchen'); await f.locator('input[name="material"]').fill('Drywall');
    await f.locator('input[name="point"]').fill('N wall 1'); await f.locator('input[name="reading"]').fill('27'); await f.locator('input[name="goal"]').fill('12').catch(() => {});
    await f.locator('button[data-a="moist"]').tap().catch(() => f.locator('button[data-a="moist"]').click());
    await sleep(1500);
    const cl = () => arr(H.cget('gc_claims')).find(c => c.id === 'CLM1') || {};
    const db = await cloudWait(() => arr(cl().moisture).find(m => m.room === 'Kitchen' && +m.reading === 27), 40000);
    R('mitigation moisture reading', 'phone', 'db', !!db, { moisture: cl().moisture, claims: arr(H.cget('gc_claims')).map(c => c.id) });
    // equipment on the same drying screen: + Add equipment (an air mover in the kitchen)
    const ef = pg.locator('.gcbb-eqform:visible').first();
    if (await ef.count()) {
      await ef.locator('input[name="eroom"]').fill('Kitchen').catch(() => {}); await ef.locator('input[name="qty"]').fill('3').catch(() => {});
      await ef.locator('button[data-a="eqadd"]').tap().catch(() => ef.locator('button[data-a="eqadd"]').click().catch(() => {}));
      const eq = await cloudWait(() => arr(cl().equipment).find(e => e.room === 'Kitchen' && +e.qty === 3), 40000);
      R('mitigation equipment (drying screen)', 'phone', 'db', !!eq, { equipment: cl().equipment });
    } else R('mitigation equipment (drying screen)', 'phone', 'form opens', false, await screenSays(P));
    if (db) {
      const D = await device('desk', 'office@grayco-cs.com'); W.push(D);
      const seen = await H.waitFor(D, () => { try { const c = window._gcClaims.get('CLM1'); return !!(c && (c.moisture || []).some(m => m.room === 'Kitchen' && +m.reading === 27)); } catch (e) { return false; } }, null, 40000);
      R('mitigation moisture reading', 'phone', 'other', !!seen);
      await reload(P);
      const kept = await H.waitFor(P, () => { try { const c = window._gcClaims.get('CLM1'); return !!(c && (c.moisture || []).some(m => +m.reading === 27)); } catch (e) { return false; } }, null, 30000);
      R('mitigation moisture reading', 'phone', 'reload', !!kept);
      await D.close();
    }
  }
  await P.close(); W.length = 0;
}
async function receipt(){
  seed();
  const P = await device('phone'); W.push(P);   /* the owner's GrayCo Field home: the 🧾 Snap a receipt tile */
  let opened = await tapText(P, /Snap a receipt/);
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
async function clock(){
  seed();
  const P = await device('phone', 'crew@grayco-cs.com'); W.push(P);
  const KEY = 'gc_timeclock_crew_grayco_cs_com';
  const opened = await tapText(P, /Clock in/);
  if (!opened) console.log('  (no ⏱ Clock in)', JSON.stringify(await screenSays(P)));
  await sleep(1500);
  await tapText(P, /Regular time/, 'body').catch(() => {});   /* after hours: "Is this an emergency call-out?" → Regular time */
  await sleep(2500);
  const entry = () => arr(H.cget(KEY)).find(e => e && e.clockIn);
  const db = await cloudWait(entry, 40000);
  R('crew clock in', 'phone', 'db', !!db, { cloud: H.cget(KEY), keys: [...H.cloud.keys()].filter(k => /timeclock|timesheet|sitebook/.test(k)), screen: await screenSays(P) });
  if (db) {
    /* another phone (a new phone, or the crew member's second device): the clock entry comes back from the cloud */
    const P2 = await device('phone', 'crew@grayco-cs.com'); W.push(P2);
    const back = await H.waitFor(P2, id => { try { const o = JSON.parse(localStorage.getItem('gc_timeclock_mine_v1') || 'null'); return !!(o && (o.list || []).some(e => e.id === id)); } catch (e) { return false; } }, db.id, 40000);
    R('crew clock in', 'phone', 'other phone reads it back', !!back);
    const D = await device('desk', 'wjohnson@grayco-cs.com'); W.push(D);
    const onDesk = await H.waitFor(D, id => window.idbGet('timesheets').then(l => (l || []).some(e => e && e.id === id)), db.id, 40000);
    R('crew clock in', 'phone', 'office (timesheets)', !!onDesk);
    await reload(P);
    const kept = await H.waitFor(P, id => { try { const o = JSON.parse(localStorage.getItem('gc_timeclock_mine_v1') || 'null'); return !!(o && (o.list || []).some(e => e.id === id)); } catch (e) { return false; } }, db.id, 20000);
    R('crew clock in', 'phone', 'reload', !!kept);
    await P2.close(); await D.close();
  }
  await P.close(); W.length = 0;
}
for (const [k, f] of [['env', env], ['read', readings], ['receipt', receipt], ['clock', clock]].concat(only.includes('equip') ? [['equip', equip]] : [])) {   /* equip = a rental on the job (the Desk's equipment sheet); the field's 🌬 is the drying screen, in 'read' */
  if (!want(k)) continue;
  try { await f(); } catch (e) { console.log('  ✗ FAIL ' + k + ' crashed: ' + String(e && e.stack || e).slice(0, 600)); await closeAll(W); W.length = 0; }
}
await closeAll(W);
table('SAVES mitenv');
process.exit(counts().fail ? 1 : 0);
