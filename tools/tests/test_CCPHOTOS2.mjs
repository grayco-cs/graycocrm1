/* patch CCPHOTOS2 — the browser half: GrayCo Photos shows GrayCo's own copy of a CompanyCam photo (falls back to CompanyCam's
   link), and customer visibility of CompanyCam photos is a click — per photo, many at once, a whole job — which the customer
   portal (server side) follows.
   node tools/tests/test_CCPHOTOS2.mjs <build dir>   (offline harness S/wN/harness_N.mjs + S/wDEMO/seed.mjs; made-up data only)
   The index and the copies are made by the REAL server code (_lib/cc-photos.js) against a fake CompanyCam + a fake Storage,
   written into the harness's cloud; the portal's answer comes from the REAL portal.js (_core.ccCustomerPhotos) reading the
   same cloud after the page's clicks were saved. */
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const S = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { computer, signIn, sleep, cset, cget, waitFor } = await import(S + '/wN/harness_N.mjs');
const { seedDemo } = await import(S + '/wDEMO/seed.mjs');
const build = path.resolve(process.argv[2] || ROOT);
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + extra : '')); } }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const pngFor = u => Buffer.concat([PNG, Buffer.from('#' + u)]);   /* a valid picture, a different file for every link */

/* ── made-up CompanyCam photos: 9001 → P1 (copied), 9002 → P2 (no copy yet) ── */
const NOW = Math.floor(Date.now() / 1000), SINCE = NOW - 3600, iso = t => new Date(t * 1000).toISOString();
function photo(pid, i, cap, created){
  const src = 'cGhvdG8tcGF0aC0' + pid + '-' + i + '.jpg';
  return { id: pid * 1000 + i, project_id: pid, captured_at: cap, created_at: created || cap + 5, creator_name: 'Sample PM', description: '',
    uris: [{ type: 'original', uri: 'https://img.cc.test/o/' + src }, { type: 'web', uri: 'https://img.cc.test/rs:fit:1024/' + src }, { type: 'thumbnail', uri: 'https://img.cc.test/rs:fit:250/' + src }] };
}
const PH = { 9001: [], 9002: [] };
for (let i = 0; i < 10; i++) {
  if (i < 4) PH[9001].push(photo(9001, i, NOW - 1800 - i * 60));                      /* taken + put in after this release: NEW */
  else if (i === 9) PH[9001].push(photo(9001, i, NOW - 86400 * 5, NOW - 600));        /* taken long ago, put in after: NEW */
  else PH[9001].push(photo(9001, i, NOW - 86400 * 2 - i * 60));                       /* from before: the customer already sees it */
}
for (let i = 0; i < 4; i++) PH[9002].push(photo(9002, i, NOW - 86400 * 3 - i * 60));
const NEW = [0, 1, 2, 3, 9].map(i => 'cc_' + (9001000 + i)), OLD = [4, 5, 6, 7, 8].map(i => 'cc_' + (9001000 + i));

seedDemo();
const P = cget('projects');
P.find(p => p.id === 'P1').ccProjectId = '9001';
P.find(p => p.id === 'P2').ccProjectId = '9002';
cset('projects', P);
cset('ccvis', { since: iso(SINCE), by: 'test' });
cset('ccidx_copy', { on: true, capGB: 80, by: 'wjohnson@grayco-cs.com', at: new Date().toISOString() });

/* ── the server: index + copies (real code), fake CompanyCam / Storage over the harness cloud ── */
process.env.COMPANYCAM_TOKEN = 'X'.repeat(43); process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test';
process.env.CC_PHOTO_MIN_MS = '0'; process.env.CC_COPY_MIN_MS = '0'; process.env.PORTAL_MAIL_OFF = '1';
const STORE = {};
const nodeFetch = global.fetch;
function fake(url, init){
  const u = String(url), J = (b, st) => ({ ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null },
    arrayBuffer: async () => { const x = Buffer.isBuffer(b) ? b : Buffer.from(JSON.stringify(b)); return x.buffer.slice(x.byteOffset, x.byteOffset + x.length); } });
  if (u.startsWith('https://img.cc.test/')) return J(pngFor(u));
  if (u.startsWith('https://api.companycam.com/v2/')) {
    const x = new URL(u), m = /^\/v2\/projects\/(\d+)\/photos$/.exec(x.pathname), pg = +(x.searchParams.get('page') || 1), per = +(x.searchParams.get('per_page') || 50);
    if (m) return J((PH[m[1]] || []).slice((pg - 1) * per, pg * per));
    return J([]);
  }
  if (u.startsWith('https://sb.test/storage/v1/object/sign/crm-files')) { const b = JSON.parse(init.body); return J(b.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t', error: STORE[p] ? null : 'nope' }))); }
  if (u.startsWith('https://sb.test/storage/v1/object/crm-files/')) { const n = u.split('/').pop(); if (STORE[n]) return J({ error: 'Duplicate' }, 409); STORE[n] = Buffer.from(init.body); return J({}); }
  if (u.startsWith('https://sb.test/rest/v1/rpc/')) return J({}, 404);
  if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
    if (init && init.method === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { if (/ignore-duplicates/.test(String(init.headers.Prefer)) && cget(r.key) !== undefined) return; cset(r.key, r.value); }); return J([], 201); }
    const d = decodeURIComponent(u), m = /key=in\.\(([^)]*)\)/.exec(d), e = /key=eq\.([^&]*)/.exec(d);
    const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : e ? [e[1]] : [];
    return J(keys.filter(k => cget(k) !== undefined).map(k => ({ key: k, value: cget(k), updated_at: String(JSON.stringify(cget(k)).length) })));
  }
  throw new Error('unexpected ' + u);
}
global.fetch = async (u, i) => fake(u, i);
const CPL = require(path.join(ROOT, 'netlify/functions/_lib/cc-photos.js'));
const PJ = require(path.join(ROOT, 'netlify/functions/portal.js'))._core;
const ir = await CPL.run({ who: 'test', budgetMs: 60000 });
/* P2's project: as if it was linked after the copies were made (no copy yet) */
const r2 = cget('ccidx:9002'); delete r2.g; cset('ccidx:9002', r2);
const st = cget('ccidx_state'); Object.assign(st.done['9002'], { g: 0, gb: 0 }); cset('ccidx_state', st);
/* one old photo was removed in CompanyCam since: its copy is kept, marked */
/* one old photo was removed in CompanyCam since: the next full re-read keeps its copy, marked */
const removedId = 9001008; PH[9001] = PH[9001].filter(x => x.id !== removedId);
cset('ccidx_request', { at: new Date().toISOString(), by: 'test' }); cset('ccidx_copy', Object.assign({}, cget('ccidx_copy'), { on: false }));
await CPL.run({ who: 'test', budgetMs: 60000 });
cset('ccidx_copy', Object.assign({}, cget('ccidx_copy'), { on: true }));
const r1 = cget('ccidx:9001');
ok('server: 14 photos indexed, the 10 of P1 copied into crm-files (<sha256>.png)', ir.ok && cget('ccidx').n === 14 && Object.keys(r1.g).length === 10 && Object.values(r1.g).every(g => /^[0-9a-f]{64}\.png$/.test(g[0]) && STORE[g[0]] && crypto.createHash('sha256').update(STORE[g[0]]).digest('hex') + '.png' === g[0]), JSON.stringify(ir.copy));
const portal0 = await PJ.ccCustomerPhotos({ id: 'P1', ccProjectId: '9001' }, [], 'customer');
ok('portal before any click: the 5 photos from before this release, none of the 5 new ones', portal0.length === 5 && portal0.every(x => OLD.includes(x.id)), portal0.map(x => x.id).join(' '));
ok('portal serves P1\'s photos from the GrayCo copies (signed crm-files links)', portal0.every(x => x.copy && /\/storage\/v1\/object\/sign\/crm-files\/[0-9a-f]{64}\.png/.test(x.f)));
const portalP2 = await PJ.ccCustomerPhotos({ id: 'P2', ccProjectId: '9002' }, [], 'customer');
ok('portal, a job without copies: CompanyCam\'s own links (as before)', portalP2.length === 4 && portalP2.every(x => /^https:\/\/img\.cc\.test\//.test(x.f) && !x.copy));
global.fetch = nodeFetch;

/* ── the browser ── */
const c = await computer('CCP2', { build });
const blocked = {}; const posts = []; let thumbOfBlocked = '';
const g5 = r1.g['9001005']; blocked[g5[1]] = 1;   /* this copy's thumbnail cannot be read → CompanyCam's link */
await c.ctx.route(u => new URL(u).host === 'img.cc.test', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await c.ctx.route(u => /\/storage\/v1\/object\/authenticated\/crm-files\//.test(u), r => {
  const n = r.request().url().split('/').pop().split('?')[0];
  if (blocked[n] || !STORE[n]) return r.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"not found"}' });
  return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: STORE[n] });
});
await c.ctx.route(u => /\/\.netlify\/functions\/companycam-webhook/.test(u), async r => {
  const u = new URL(r.request().url()), q = u.searchParams, px = q.get('proxy'), J = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (r.request().method() === 'POST') { posts.push({ px, body: r.request().postData() }); if (px === 'photocopy') { const b = JSON.parse(r.request().postData() || '{}'); cset('ccidx_copy', Object.assign({}, cget('ccidx_copy'), b)); return J({ ok: true, on: cget('ccidx_copy').on, capGB: cget('ccidx_copy').capGB, message: cget('ccidx_copy').on ? 'GrayCo copies are ON' : 'GrayCo copies are OFF — the copies already made stay.' }); } return J({ ok: true }); }
  if (px === 'status') return J({ ok: true, verified: true, reason: 'ok', source: 'env', status: 200 });
  if (px === 'sync') return J({ ok: true, tokenSet: true, health: { at: new Date().toISOString(), ok: true, read: 2 }, review: [], photoIndex: CPL.statusOf(cget('ccidx_state'), cget('ccidx_copy')) });
  if (px === 'api') { const ep = q.get('endpoint') || ''; const m = /^photos\/(\d+)$/.exec(ep); if (m) { const pid = Math.floor(+m[1] / 1000); return J((PH[pid] || []).find(x => x.id === +m[1]) || {}); } return J([]); }
  return J({ ok: true, projects: [] });
});
await signIn(c, 'wjohnson@grayco-cs.com', 12000);
const p = c.page();
await p.evaluate(() => window._setView('allphotos'));
await waitFor(c, () => !!document.querySelector('#gcuOv .pv-card'), null, 30000, 200);
await waitFor(c, () => window._gcPhotos.ccIndex().since > 0, null, 15000, 200);
ok('the page knows when "new" starts (gc_kv ccvis, read with the index summary)', (await p.evaluate(() => window._gcPhotos.ccIndex().since)) === SINCE);
await p.evaluate(() => window._gcPhotos.open('P1'));
const GRID = '#gcuOv .gcu-grid [data-src-kind="cc"]';
await waitFor(c, g => document.querySelectorAll(g).length === 10 ? 1 : null, GRID, 20000, 200);
await p.evaluate(g => { const l = document.querySelectorAll(g); l[l.length - 1].scrollIntoView(); }, GRID);   /* tiles load as they come into view */
const tiles = await waitFor(c, g => { const l = Array.from(document.querySelectorAll(g)).map(b => { const i = b.querySelector('img'); return { id: b.getAttribute('data-id'), ref: i.getAttribute('data-ref') || '', fb: i.getAttribute('data-fb') || '', src: i.getAttribute('src') || '' }; });
  return l.length === 10 && l.every(x => x.src) ? l : null; }, GRID, 20000, 250);
if (!tiles) console.log(await p.evaluate(g => Array.from(document.querySelectorAll(g)).map(b => { const i = b.querySelector('img'); return b.getAttribute('data-id').slice(-2) + ':' + (i.getAttribute('data-ref') ? 'ref' : '') + (i.getAttribute('data-src') ? 'src' : '') + '=' + (i.getAttribute('src') || '').slice(0, 12); }).join(' '), GRID));
ok('grid: every P1 tile uses its GrayCo copy (crm-files thumbnail, read as a blob)', !!tiles && tiles.filter(x => x.id !== 'cc_9001005').every(x => /^sb:crm-files\/[0-9a-f]{64}\.png$/.test(x.ref) && /^blob:/.test(x.src)), JSON.stringify(tiles && tiles.slice(0, 2)));
const t5 = tiles && tiles.find(x => x.id === 'cc_9001005');
ok('a copy that cannot be read falls back to CompanyCam\'s link', !!t5 && /^https:\/\/img\.cc\.test\/rs:fit:250\//.test(t5.src) && t5.fb === t5.src, JSON.stringify(t5));
const locks = () => p.evaluate(g => Array.from(document.querySelectorAll(g)).filter(b => b.querySelector('.gcu-lock')).map(b => b.getAttribute('data-id')).sort(), GRID);
let L = await locks();
ok('new CompanyCam photos are hidden from the customer by default (🔒 on the 5 new ones)', JSON.stringify(L) === JSON.stringify(NEW.slice().sort()), L.join(' '));
ok('photos the customer could already see stay shown (no 🔒 on the 5 from before)', OLD.every(id => !L.includes(id)));
/* the viewer: full screen from the copy; the removed one; "Customer can see?" */
await p.click('#gcuOv [data-id="cc_9001000"]');
const v0 = await waitFor(c, () => { const i = document.querySelector('#gcu-big img'), b = document.querySelector('#gcuOv [data-a="share"]'); return i && b && i.getAttribute('src') ? { ref: i.getAttribute('data-ref') || '', src: i.getAttribute('src'), share: b.textContent, chip: !!document.querySelector('#gcuOv .gcu-gcopy') } : null; }, null, 15000, 200);
ok('full screen: the GrayCo web copy, with a "GrayCo copy" chip', !!v0 && /^sb:crm-files\//.test(v0.ref) && /^blob:/.test(v0.src) && v0.chip, JSON.stringify(v0));
ok('a new photo says "Customer can see? (not shown yet)"', !!v0 && /Customer can see\? \(not shown yet\)/.test(v0.share), v0 && v0.share);
await p.click('#gcuOv [data-a="share"]');
const v1 = await waitFor(c, () => { const b = document.querySelector('#gcuOv [data-a="share"]'); return b && /Customer sees it/.test(b.textContent) ? b.textContent : null; }, null, 8000, 150);
const f0 = await p.evaluate(() => window._gcPhotos.records().find(r => r.id === 'ccf_9001000'));
ok('per photo: one click → "Customer sees it" (flag ccf_<id> shared, with the time of the click)', !!v1 && f0 && f0.shared === true && !!f0.visAt, JSON.stringify(f0));
await p.evaluate(() => window._gcPhotos.open('P1'));
await p.click('#gcuOv [data-id="cc_' + removedId + '"]');
const vr = await waitFor(c, () => { const ch = document.querySelector('#gcuOv .gcu-ccgone'); return ch ? ch.textContent : null; }, null, 8000, 150);
ok('a photo removed in CompanyCam: "Removed in CompanyCam · GrayCo copy kept"', /Removed in CompanyCam/.test(vr || ''), vr || await p.evaluate(() => { const r = window._gcPhotos.state; return JSON.stringify({ pid: r.photoId, chips: (document.querySelector('#gcuOv .gcu-pchips') || {}).textContent }); }));
/* many at once */
await p.evaluate(() => window._gcPhotos.open('P1'));
await waitFor(c, g => document.querySelectorAll(g).length === 10 ? 1 : null, GRID, 10000, 200);
await p.click('#gcuOv [data-a="dlsel"]');
await p.click('#gcuOv [data-id="cc_9001001"]'); await p.click('#gcuOv [data-id="cc_9001002"]');
const selBtns = await p.evaluate(() => Array.from(document.querySelectorAll('#gcuOv [data-a="vissel"]')).map(b => b.textContent));
ok('select mode: "👁 Customer can see (2)" / "🔒 Hide from customer (2)"', selBtns.length === 2 && /Customer can see \(2\)/.test(selBtns[0]) && /Hide from customer \(2\)/.test(selBtns[1]), selBtns.join(' | '));
await p.click('#gcuOv [data-a="vissel"][data-v="1"]');
L = await waitFor(c, g => { const l = Array.from(document.querySelectorAll(g)).filter(b => b.querySelector('.gcu-lock')).map(b => b.getAttribute('data-id')).sort(); return l.length === 2 ? l : null; }, GRID, 8000, 150) || await locks();
ok('multi-select: the 2 chosen new photos are shown → only 2 new ones still hidden', JSON.stringify(L) === JSON.stringify(['cc_9001003', 'cc_9001009']), L.join(' '));
await p.click('#gcuOv [data-a="dlclr"]').catch(() => {});
await p.click('#gcuOv [data-id="cc_9001006"]');
await p.click('#gcuOv [data-a="vissel"][data-v="0"]');
L = await waitFor(c, g => { const l = Array.from(document.querySelectorAll(g)).filter(b => b.querySelector('.gcu-lock')).map(b => b.getAttribute('data-id')).sort(); return l.length === 3 ? l : null; }, GRID, 8000, 150) || await locks();
ok('multi-select can hide an older photo too', L.includes('cc_9001006') && L.length === 3, L.join(' '));
await p.click('#gcuOv [data-a="dlexit"]');
/* a whole job */
const jb = await p.evaluate(() => Array.from(document.querySelectorAll('#gcuOv [data-a="visjob"]')).map(b => b.textContent + '|' + b.getAttribute('title')));
ok('the job has "👁 Show all to customer" and "🔒 Hide all"', jb.length === 2 && /Show all to customer/.test(jb[0]) && /Show all of this job's photos to the customer/.test(jb[0]) && /Hide all/.test(jb[1]), jb.join(' / '));
await p.click('#gcuOv [data-a="visjob"][data-v="hide"]');
L = await waitFor(c, g => { const l = Array.from(document.querySelectorAll(g)).filter(b => b.querySelector('.gcu-lock')); return l.length === 10 ? l.length : null; }, GRID, 8000, 150);
ok('"Hide all": every photo of the job hidden (one record, not one a photo)', L === 10 && (await p.evaluate(() => window._gcPhotos.records().filter(r => /^ccf_/.test(r.id)).length)) === 4, String(L));
await p.click('#gcuOv [data-a="visjob"][data-v="show"]');
L = await waitFor(c, g => { const l = Array.from(document.querySelectorAll(g)).filter(b => b.querySelector('.gcu-lock')); return l.length === 0 ? 'none' : null; }, GRID, 8000, 150);
ok('"Show all": every photo of the job shown, the new ones too', L === 'none');
await p.click('#gcuOv [data-id="cc_9001004"]');
await waitFor(c, () => !!document.querySelector('#gcuOv [data-a="share"]'), null, 8000, 150);
await sleep(30);
await p.click('#gcuOv [data-a="share"]');
await waitFor(c, () => { const b = document.querySelector('#gcuOv [data-a="share"]'); return b && !/Customer sees it/.test(b.textContent) ? 1 : null; }, null, 8000, 150);
await p.evaluate(() => window._gcPhotos.open('P1'));
L = await waitFor(c, g => { const l = Array.from(document.querySelectorAll(g)).filter(b => b.querySelector('.gcu-lock')).map(b => b.getAttribute('data-id')); return l.length === 1 ? l : null; }, GRID, 8000, 150) || await locks();
ok('a click on one photo after "Show all" wins for that photo', JSON.stringify(L) === '["cc_9001004"]', JSON.stringify(L));
const ccj = await p.evaluate(() => window._gcPhotos.records().find(r => r.id === 'ccj_P1'));
ok('the job record: ccj_P1 { mode show, at, upto } (a flag record: never counted as a photo)', ccj && ccj.mode === 'show' && ccj.source === 'ccflag' && ccj.upto >= ccj.upto && Math.abs(ccj.upto - Date.now() / 1000) < 600, JSON.stringify(ccj));
/* the clicks reach the cloud → the customer portal (server side) follows them */
await p.evaluate(() => window._gcPhotos.sync());
const saved = await waitFor(c, () => 1, null, 1000, 100) && await (async () => { for (let i = 0; i < 40; i++) { const l = cget('gc_photos') || []; const a = l.find(r => r.id === 'ccj_P1'), b = l.find(r => r.id === 'ccf_9001004'); if (a && a.mode === 'show' && b && b.shared === false) return l; await sleep(250); } return null; })();
ok('the choices are saved to the cloud (gc_photos)', !!saved);
global.fetch = async (u, i) => fake(u, i);
const portal1 = await PJ.ccCustomerPhotos({ id: 'P1', ccProjectId: '9001' }, cget('gc_photos'), 'customer');
global.fetch = nodeFetch;
const shownInCrm = await p.evaluate(g => Array.from(document.querySelectorAll(g)).filter(b => !b.querySelector('.gcu-lock')).map(b => b.getAttribute('data-id')).sort(), GRID);
ok('the customer portal (server) serves exactly what GrayCo Photos shows as "Customer sees it" (9: all but the one hidden)', portal1.length === 9 && JSON.stringify(portal1.map(x => x.id).sort()) === JSON.stringify(shownInCrm) && !portal1.some(x => x.id === 'cc_9001004'), portal1.map(x => x.id).join(' '));
/* P2: no copies → CompanyCam's links */
await p.evaluate(() => window._gcPhotos.open('P2'));
const t2 = await waitFor(c, g => { const l = Array.from(document.querySelectorAll(g)).map(b => b.querySelector('img').getAttribute('data-src') || ''); return l.length === 4 ? l : null; }, GRID, 15000, 200);
ok('a job without copies: CompanyCam\'s own links (as before)', !!t2 && t2.every(u => /^https:\/\/img\.cc\.test\/rs:fit:250\//.test(u)), JSON.stringify(t2));
/* 📸 CompanyCam sync status: the switch + the meter */
await p.evaluate(() => { window._gcPhotos.close(); window._gcCCSyncPanel(); });
const meter = await waitFor(c, () => { const b = document.querySelector('#gc-ccsync-ov [data-ccs-copybox]'); return b && /Keep a GrayCo copy of every photo: On/.test(b.textContent) ? b.textContent : null; }, null, 15000, 250);
ok('status window: "Keep a GrayCo copy of every photo: On" · 10 of 14 copied · GB used · the estimate · the cap', !!meter && /10 of 14 photos copied/.test(meter) && /used/.test(meter) && /all 14 photos ≈/.test(meter) && /pauses at 80 GB/.test(meter) && /1 removed in CompanyCam, kept/.test(meter) && /Supabase Pro/.test(meter), meter);
await p.evaluate(() => document.querySelector('#gc-ccsync-ov [data-ccs-copy="off"]').click());
const off = await waitFor(c, () => { const b = document.querySelector('#gc-ccsync-ov [data-ccs-copybox]'); return b && /every photo: Off/.test(b.textContent) ? b.textContent : null; }, null, 10000, 250);
ok('the owner turns it off (POST ?proxy=photocopy {on:false}) — the window says Off', !!off && posts.some(x => x.px === 'photocopy' && JSON.parse(x.body).on === false), posts.map(x => x.px + x.body).join());
await p.evaluate(() => { const i = document.querySelector('#gc-ccsync-ov [data-ccs-cap]'); i.value = '90'; document.querySelector('#gc-ccsync-ov [data-ccs-capsave]').click(); });
await waitFor(c, () => /Safety cap: 90 GB/.test((document.querySelector('#gc-ccsync-ov') || {}).textContent || '') ? 1 : null, null, 8000, 200);
ok('the safety cap is set from the window', posts.some(x => x.px === 'photocopy' && JSON.parse(x.body).capGB === 90) && cget('ccidx_copy').capGB === 90);
const errs = c.errs.filter(e => !/ResizeObserver/.test(e));
ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await c.b.close();
console.log('CCPHOTOS2 ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
