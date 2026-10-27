// test_BIDDEL.mjs <build-dir> — patch BIDDEL: a bid taken off the Bid Board stays off (sweeps, union pushes, reload,
// a second computer, a stale computer's push, Launch Job's auto-add). Two computers (A: Wesley, B: Nick) in ONE
// headless browser, sharing the fake cloud of the offline harness (GC_HARNESS, default the session scratchpad's
// wN/harness_N.mjs), seeded with the realistic fixture (CONFIDENTIAL, never committed).
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS, cget } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');   /* the harness's own copy: its launch is shared below */
const build = process.argv[2];
if (!build) { console.error('usage: node test_BIDDEL.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };

resetCloud(); seedCloudFromBackup(process.env.GC_FIXTURE || SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
const BID = 'BIDu8oewdwnq17', PO = 'I962', JOB = 'PRJu8oeossw813';        /* Cool Roofs · Apartment Fire (bidding) */
const BID2 = 'BIDejk576ss61f', PO2 = 'W780', JOB2 = 'PRJejk50lxun18';     /* ISmash Memphis (bidding) */
const BID3 = 'BIDi6my76ida17', PO3 = 'H138', JOB3 = 'PRJi6my2jgo315';     /* Apartment fire- other buildings */

async function login(c, email){ const p = c.page(); await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20 && typeof window._gcSetBids === 'function', null, 120000, 300); await sleep(6000); await toBids(c); }
async function toBids(c){
  for (let i = 0; i < 8; i++) {
    await c.ev(() => window._setView('leads')).catch(() => {}); await sleep(1500);
    await c.page().getByText(/^Bids \(/).first().click({ timeout: 5000 }).catch(() => {}); await sleep(1500);
    if (await c.ev(() => [...document.querySelectorAll('textarea,input')].some(x => /Auto-added from Launch Job/.test(x.value || ''))).catch(() => false)) return true;
  }
  return false;
}
async function reload(c){ await c.page().reload(); await sleep(3000); await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20 && typeof window._gcSetBids === 'function', null, 120000, 300); await sleep(15000); await toBids(c); }
/* where a bid is: the screen (its card), the browser's own database, the cloud */
const where = (c, po) => c.ev(po => new Promise(res => {
  const screen = [...document.querySelectorAll('textarea,input')].some(x => (x.value || '').includes('PO: ' + po + ' — Auto-added'));
  const q = indexedDB.open('grayco_crm'); q.onsuccess = () => { try { const g = q.result.transaction('kv', 'readonly').objectStore('kv').get('bidLists'); g.onsuccess = () => { let v = g.result; if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; res({ screen, disk: (Array.isArray(v) ? v : []).some(b => b && String(b.notes || '').includes('PO: ' + po + ' ')) }); }; g.onerror = () => res({ screen }); } catch (e) { res({ screen, err: e.message }); } }; q.onerror = () => res({ screen }); }), po);
const cloudBids = () => { let v = cget('bidLists'); if (typeof v === 'string') v = JSON.parse(v); return Array.isArray(v) ? v : []; };
const inCloud = id => cloudBids().some(b => b && b.id === id);
const cloudTomb = () => { let v = cget('gc_tombstones'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return v || {}; };
const proj = (c, id) => c.ev(id => { const p = (window._crm.projects || []).find(x => x && x.id === id); return p ? { status: p.status } : null; }, id);
async function clickOn(c, po, label){
  return c.ev(([po, label]) => {
    const hasPO = e => [...e.querySelectorAll('textarea,input')].some(x => (x.value || '').includes('PO: ' + po + ' '));
    for (const b of [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === label)) {
      let e = b; while (e && !hasPO(e)) e = e.parentElement;
      if (e && [...e.querySelectorAll('button')].filter(x => x.innerText.trim() === label).length === 1) { b.scrollIntoView({ block: 'center' }); b.click(); return true; }
    }
    return false;
  }, [po, label]);
}
const gone = async (c, po, ms = 30000) => { const t0 = Date.now(); let w; while (Date.now() - t0 < ms) { w = await where(c, po); if (!w.screen && !w.disk) return w; await sleep(1000); } return Object.assign({ timeout: true }, w); };

const A = await computer('A', { build }); await login(A, 'wjohnson@grayco-cs.com');
const B = await computer('B', { build }); await login(B, 'nthomas@grayco-cs.com');
ok(await A.ev(() => !!window.__GC_BIDDEL__ && typeof window._gcBidDel === 'function'), 'patch BIDDEL is loaded');
let wA = await where(A, PO), wB = await where(B, PO);
ok(wA.screen && wA.disk && wB.screen && wB.disk && inCloud(BID), 'the Cool Roofs bid (PO I962) is on the Bid Board of both computers and in the cloud', { wA, wB });

/* 1. the red DELETE at the top of the card asks in the page; Esc cancels */
ok(await clickOn(A, PO, 'DELETE'), '1 the card has the red DELETE');
await sleep(600);
const pa = A.page();
const q = await pa.locator('#gcx-biddel').innerText().catch(() => '');
ok(/Remove .*Apartment Fire.* from the bid list\?/.test(q) && /mark the job Lost/.test(q) && /delete the job/.test(q) && /Cancel/.test(q) && A.dialogs.length === 0,
  '1 it asks in the page: remove from the bid list (default) / + mark the job Lost / + delete the job / Cancel — no browser dialog', { q, d: A.dialogs });
ok(await pa.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-a') === 'remove'), '1 the default (focused) choice is "Remove from the bid list"');
await pa.keyboard.press('Escape'); await sleep(500);
wA = await where(A, PO);
ok((await pa.locator('#gcx-biddel').count()) === 0 && wA.screen, '1 Esc = Cancel: the bid is still there');
/* 2. remove (the default): gone here, the job is left as it is */
await clickOn(A, PO, 'DELETE'); await sleep(500);
await pa.keyboard.press('Enter'); await sleep(1500);
wA = await gone(A, PO, 15000);
ok(!wA.timeout, '2 Enter removes it: gone from A\'s screen and disk', wA);
const j1 = await proj(A, JOB);
ok(j1 && /bidding/i.test(j1.status), '2 the job itself is untouched (still "bidding") — only the bid list changed', j1);
ok(await A.ev(([b, p]) => !!(window._gcxDead && window._gcxDead('bidLists', b)) && !!window._gcxDead('bidPO', p), [BID, PO]), '2 the delete is written to the delete list (bid + its PO)');
/* 3. sweeps and union pushes: it stays gone everywhere */
await sleep(20000);
ok(!!cloudTomb()['bidLists:' + BID], '3 the delete mark reached the cloud');
await B.ev(id => window._gcSetBids(prev => prev.map(b => b.id === id ? Object.assign({}, b, { notes: (b.notes || '') + ' · B edit', updated: new Date().toISOString().slice(0, 10) }) : b)), BID2);   /* B (stale copy) pushes its list */
await A.ev(() => { try { window._gcLivePush && window._gcLivePush('bidLists'); } catch (e) {} });
await sleep(150000);
wA = await where(A, PO); wB = await where(B, PO);
ok(!wA.screen && !wA.disk, '3 after 2½ min of sweeps and pushes: still gone on A', wA);
ok(!wB.screen && !wB.disk, '3 … and gone on B (the second computer)', wB);
ok(!inCloud(BID), '3 … and gone from the cloud list (the union push did not put it back)', cloudBids().map(b => b.id));
ok(cloudBids().some(b => b.id === BID2 && /B edit/.test(b.notes || '')), '3 B\'s edit to another bid still reached the cloud');
/* 4. a stale computer pushes an old list that still has it */
const stale = JSON.parse(JSON.stringify(cloudBids()));
stale.push({ id: BID, title: 'Apartment Fire', client: 'Cool Roofs', status: 'Bidding', notes: 'PO: ' + PO + ' — Auto-added from Launch Job', created: '2026-03-16' });
await B.ev(async list => { const u = (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k = localStorage.getItem('grayco_sb_key') || ''; await fetch(u + '/rest/v1/gc_kv', { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ key: 'bidLists', value: list, updated_at: new Date().toISOString() }]) }); }, stale);
await sleep(30000);
wA = await where(A, PO); wB = await where(B, PO);
ok(!wA.screen && !wA.disk && !wB.screen && !wB.disk, '4 an old copy pushed by another computer does not bring it back on either screen', { wA, wB });
/* 5. reload both */
await reload(A); await reload(B);
wA = await where(A, PO); wB = await where(B, PO);
ok(!wA.screen && !wA.disk, '5 A after a reload: still gone', wA);
ok(!wB.screen && !wB.disk, '5 B after a reload: still gone', wB);
/* 6. Launch Job's auto-add for the same PO / job does not put a bid back; a bid a person types in for it stays */
await A.ev(po => window._gcSetBids(prev => prev.concat([{ id: 'BIDautoT1', title: 'Apartment Fire', client: 'Cool Roofs', status: 'Bidding', pid: '', notes: 'PO: ' + po + ' — Auto-added from Launch Job', created: '2026-10-27', comments: [] },
  { id: 'BIDmanT1', title: 'Apartment Fire — rebid', client: 'Cool Roofs', status: 'Bidding', pid: '', notes: 'Owner asked for a rebid, ref PO: ' + po + ' ', created: '2026-10-27', comments: [] }])), PO);
ok(await A.ev(po => window._gcBidDismissed({ id: '', pid: '', notes: 'PO: ' + po + ' — Auto-added from Launch Job' }), PO), '6 Launch Job\'s check says a bid for that PO was taken off the list');
await A.ev(() => window._gcBidDelSweep()); await sleep(2500);
const ids6 = await A.ev(() => new Promise(res => window._gcSetBids(prev => { res(prev.map(b => b.id)); return prev; })));
ok(!ids6.includes('BIDautoT1'), '6 an automatic re-add for that PO is taken off again at once', ids6);
ok(ids6.includes('BIDmanT1'), '6 a bid a person typed in for that job is kept', ids6);
/* 7. the bottom 🗑 Delete, with "+ mark the job Lost" */
await toBids(A);
ok(await clickOn(A, PO2, '🗑 Delete'), '7 the card has the bottom 🗑 Delete');
await sleep(600);
await pa.locator('#gcx-biddel [data-a=lost]').click(); await sleep(2000);
ok(!(await gone(A, PO2, 15000)).timeout, '7 ISmash is off the bid list on A');
ok(/lost/i.test(((await proj(A, JOB2)) || {}).status || ''), '7 … and its job is marked Lost', await proj(A, JOB2));
await sleep(30000);
wB = await where(B, PO2);
ok(!wB.screen && !wB.disk && /lost/i.test(((await proj(B, JOB2)) || {}).status || ''), '7 B: ISmash gone from the bid list and its job Lost', { wB, j: await proj(B, JOB2) });
/* 8. "+ delete the job" asks once more, then removes both */
await clickOn(A, PO3, 'DELETE'); await sleep(600);
const nd = A.dialogs.length;
await pa.locator('#gcx-biddel [data-a=deljob]').click(); await sleep(2000);
ok(A.dialogs.length === nd + 1 && /Delete the job/.test(A.dialogs[nd] || ''), '8 "+ delete the job" asks once more', A.dialogs.slice(nd));
ok(!(await gone(A, PO3, 15000)).timeout && !(await proj(A, JOB3)), '8 the bid and its job are both gone on A');
await sleep(30000);
ok(!(await proj(B, JOB3)) && !(await where(B, PO3)).screen, '8 … and on B');
/* 9. the bids nobody touched are all still there */
const left = cloudBids().map(b => b.id);
ok(['BIDi8yqnrvq02k', 'BIDoleuaipo0y', 'BIDc3enurx151d'].every(id => left.includes(id)), '9 the other bids are untouched in the cloud', left);
const errs = [].concat(A.errs, B.errs).filter(e => !/cdnjs|ResizeObserver/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 3));
console.log('RESULT ' + pass + '/' + (pass + fail));
await shared.close(); process.exit(fail ? 1 : 0);
