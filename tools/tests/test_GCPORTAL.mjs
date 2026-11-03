/* patch GCPORTAL — the customer portal when GrayCo is the SUB for a GC: node tools/tests/test_GCPORTAL.mjs [--no-browser]
   Offline (custportal_world.mjs: fake Supabase, the real functions behind a local server with netlify.toml's portal rules).
   The REAL job ROTC Cordova (T724, client A & B Construction Co., Inc. — a GC account) from the mirror ($GC_MIRROR) gets the GC
   variant: greeted by the company's name, commercial sub stages, no GrayCo Care / maintenance plans, no My home, no referral /
   review asks, no residential warranty, "Request a change order" only. A residential job keeps the homeowner portal.
   Screenshots (phone 390×844, desktop 1366×768) → <scratch>/preview/customer_gc/. */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { createRequire } from 'module';
import * as W from './custportal_world.mjs';
const require = createRequire(import.meta.url);
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.GCPORTAL_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/preview/customer_gc';
fs.mkdirSync(SHOTS, { recursive: true });
let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const C = require(W.FNDIR + '/portal.js')._core;
const call = W.handlerCall;
const LINKS = {};
function loadMirror(){
  for (const k of Object.keys(W.KV)) delete W.KV[k];
  const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
  for (const r of rows) if (r && r.key && !/^_probe_/.test(r.key)) W.KV[r.key] = { value: r.v, at: r.updated_at || '2026-10-30T00:00:00Z' };
  W.put('gc_portal_gate', [{ id: '_meta', since: '2026-10-24T00:00:00Z', gf: {} }]);
  W.TABLES.gc_portal = []; W.resetCaches();
}
const linkFor = pid => { if (!LINKS[pid]) { LINKS[pid] = W.tok(); W.TABLES.gc_portal.push({ token: LINKS[pid], project_id: pid, revoked: false }); } return { 'x-portal-token': LINKS[pid] }; };
const HAVE = fs.existsSync(MIRROR);
let ROTC = null, RES = null;
console.log('NODE');
await t('the rule: portalStyle — the job\'s choice, a GC account, a bid as the sub (PRIMESUB), a commercial job for a contractor; else homeowner', async () => {
  const data = { customers: [{ id: 'CG', name: 'Big GC Inc', type: 'gc' }, { id: 'CH', name: 'Pat Home' }], leads: [{ id: 'L1', projectId: 'P3', source: 'BuildingConnected', type: 'Commercial' }] };
  const st = p => C.portalStyle(data, p);
  assert.strictEqual(st({ id: 'P1', client: 'Big GC Inc', customerId: 'CG', type: 'Commercial TI' }).gc, true, 'GC account');
  assert.strictEqual(st({ id: 'P2', client: 'Pat Home', type: 'Residential Reno' }).gc, false, 'homeowner');
  assert.strictEqual(st({ id: 'P3', client: 'Someone', type: 'Commercial TI' }).gc, true, 'bid as the sub (BuildingConnected)');
  assert.strictEqual(st({ id: 'P4', client: 'Ridge Builders LLC', type: 'Commercial Reno' }).gc, true, 'commercial job for a contractor');
  assert.strictEqual(st({ id: 'P5', client: 'Midtown Dental LLC', type: 'Commercial TI' }).gc, false, 'a commercial owner (not a contractor) keeps the homeowner style — they may want plans');
  assert.strictEqual(st({ id: 'P6', client: 'Big GC Inc', customerId: 'CG', portalStyle: 'home' }).gc, false, 'the job\'s choice wins (Homeowner)');
  assert.strictEqual(st({ id: 'P7', client: 'Pat Home', portalStyle: 'gc' }).gc, true, 'the job\'s choice wins (GC)');
  assert.strictEqual(C.clientIsCompany(data, { client: 'A & B Construction Co., Inc.' }), true); assert.strictEqual(C.clientIsCompany(data, { client: 'Bob & Mary Smith' }), false);
});
await t('mirror: ROTC Cordova (T724, A & B Construction Co., Inc.) → the GC variant: company greeting, commercial sub stages, no review / warranty, GrayCo company papers allowed', async () => {
  if (!HAVE) { console.log('    (mirror not on this computer — skipped)'); return; }
  loadMirror();
  const data = await C.crmData(true);
  ROTC = C.listOf(data, ['projects']).find(p => p.autoPO === 'T724' || /ROTC Cordova/i.test(p.name || ''));
  assert.ok(ROTC, 'ROTC Cordova is in the mirror');
  const why = C.portalStyle(data, ROTC); assert.ok(why.gc, JSON.stringify(why)); console.log('    rule: ' + why.why);
  const v = (await call('portal', { action: 'view' }, linkFor(ROTC.id))).data;
  assert.ok(v.ok && v.variant === 'gc', JSON.stringify(v).slice(0, 200));
  assert.ok(v.customer.company === true && v.customer.firstName === '' && /A & B Construction/.test(v.customer.name), JSON.stringify(v.customer));
  assert.deepStrictEqual(v.job.stages, C.GC_STAGES); assert.ok(/Scheduled \/ mobilizing|Awarded/.test(v.job.stageName), v.job.stageName);
  assert.ok(v.review === null && v.showReview === false && v.warranty === null, 'no review ask, no residential warranty');
  const ex = (await call('portal-extra', { action: 'info' }, linkFor(ROTC.id))).data; assert.ok(ex.ok && ex.warranty === null, 'AUTO7: no residential warranty block: ' + JSON.stringify(ex).slice(0, 160));
  RES = C.listOf(data, ['projects']).find(p => /residential/i.test(p.type || '') && /@/.test(p.clientEmail || '') && !C.portalStyle(data, p).gc && !C.clientIsCompany(data, p) && !/lost|dead|cancel/i.test(p.status || ''));
  assert.ok(RES, 'a residential job in the mirror');
  const r = (await call('portal', { action: 'view' }, linkFor(RES.id))).data;
  assert.ok(r.variant === 'home' && r.job.stages[0] === 'Lead' && !r.customer.company && r.customer.firstName, 'the residential job keeps the homeowner portal');
});
await t('the sample homeowner job is unchanged; set to "GC (we\'re the sub)" on its card it turns GC; no carrier / sub / internal words either way', async () => {
  W.setDay(); W.seedSample({ crmDocs: false }); W.resetCaches();
  const L = { 'x-portal-token': W.S.link };
  let v = (await call('portal', { action: 'view' }, L)).data; assert.ok(v.variant === 'home' && v.customer.firstName === 'Sample' && !v.customer.company && v.job.stages[0] === 'Lead');
  const p = W.get('projects'); p[0].portalStyle = 'gc'; W.put('projects', p); W.resetCaches();
  v = (await call('portal', { action: 'view' }, L)).data; assert.ok(v.variant === 'gc' && v.job.stages[0] === 'Bid submitted', v.job.stageName);
  const j = JSON.stringify(v); for (const w of [W.S.carrier, W.S.sub, '8765', 'INTERNAL', 'Other Person']) assert.ok(!j.includes(w), w);
  p[0].portalStyle = ''; W.put('projects', p); W.resetCaches();
});
await t('the CRM: "Portal style: Automatic / Homeowner / GC (we\'re the sub)" on the job\'s Customer portal card (patch applied, idempotent)', async () => {
  const crm = fs.readFileSync(path.join(W.ROOT, 'index.html'), 'utf8');
  assert.ok(/data-q="pstyle"/.test(crm) && /GC \(we\\u2019re the sub\)/.test(crm) && /x\.portalStyle = t\.value === 'gc' \|\| t\.value === 'home'/.test(crm));
  const out = require('child_process').execFileSync('python3', [path.join(W.ROOT, 'tools/patch_GCPORTAL.py'), path.join(W.ROOT, 'index.html')]).toString(); assert.ok(/already patched/.test(out));
});
if (!process.argv.includes('--no-browser') && HAVE && ROTC) {
  console.log('BROWSER');
  const srv = await W.startServer(), browser = await W.launch(), ERRS = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (const kind of ['phone', 'desktop']) {
    await t(kind + ': ROTC Cordova — "A & B Construction Co., Inc. — your project", commercial stages, Change orders only, no Care / My home / referral', async () => {
      loadMirror(); LINKS[ROTC.id] = null; const L = linkFor(ROTC.id)['x-portal-token'];
      const ctx = await W.context(browser, kind);
      const PNG = fs.readFileSync(path.join(W.ROOT, 'portal-icon-192.png'));
      await ctx.route(/https:\/\/(img|static)\.companycam\.com\//, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
      const pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push(kind + ': ' + e.message));
      await pg.goto(srv.ORIGIN + '/#t=' + L); await pg.waitForSelector('#track', { timeout: 30000 }); await sleep(3500);
      assert.strictEqual(await pg.textContent('#hi'), 'A & B Construction Co., Inc. — your project');
      const tr = await pg.textContent('#track'); assert.ok(/Bid submitted/.test(tr) && /Pay application \/ final invoice/.test(tr) && !/Appointment booked/.test(tr), tr.slice(0, 200));
      for (const sel of ['#gcpp-maint', '#gcph-home', '#gcph-testi', '#gcRefCard', '#gcrefer', '#gcpp-heard', '#gcpr-project']) assert.ok(!(await pg.isVisible(sel).catch(() => false)), sel + ' hidden');
      await pg.waitForSelector('#gcpr-change', { timeout: 15000 }); assert.ok(/Request a change order/.test(await pg.textContent('#gcpr-change')));
      const body = await pg.evaluate(() => document.body.innerText); assert.ok(!/GrayCo Care|maintenance plan|Refer a friend|Leave a Google review|My home/i.test(body), 'no homeowner offers in the page');
      await pg.screenshot({ path: path.join(SHOTS, kind + '_01_home.png') });
      await pg.screenshot({ path: path.join(SHOTS, kind + '_02_home_full.png'), fullPage: true });
      await pg.click('#tabs button[data-tab="docs"]'); await sleep(900); await pg.screenshot({ path: path.join(SHOTS, kind + '_03_documents.png') });
      await pg.click('#tabs button[data-tab="pay"]'); await sleep(700); await pg.screenshot({ path: path.join(SHOTS, kind + '_04_payments.png') });
      await pg.click('#tabs button[data-tab="msgs"]'); await sleep(900); await pg.screenshot({ path: path.join(SHOTS, kind + '_05_messages.png') });
      await ctx.close();
    });
    await t(kind + ': a residential homeowner job keeps the homeowner portal ("Hi <first name>", homeowner stages, Request a new project)', async () => {
      W.setDay(); W.seedSample({ crmDocs: false }); W.resetCaches();
      const ctx = await W.context(browser, kind), pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push(kind + ' home: ' + e.message));
      await pg.goto(srv.ORIGIN + '/#t=' + W.S.link); await pg.waitForSelector('#track', { timeout: 30000 }); await sleep(2500);
      assert.ok(/^Hi Sample — your project$/.test(await pg.textContent('#hi')));
      assert.ok(/Appointment booked/.test(await pg.textContent('#track')));
      await pg.waitForSelector('#gcpr-project', { timeout: 15000 }); assert.ok(await pg.isVisible('#gcpr-project'));
      await pg.screenshot({ path: path.join(SHOTS, kind + '_09_homeowner_unchanged.png') });
      await ctx.close();
    });
  }
  await t('no page errors', async () => { assert.deepStrictEqual(ERRS, []); });
  await browser.close(); await srv.close();
}
console.log((failed ? 'FAILED ' : 'OK ') + passed + '/' + (passed + failed) + '   screenshots: ' + SHOTS);
process.exit(failed ? 1 : 0);
