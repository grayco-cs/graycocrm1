/* patch CCPHOTOS — the browser half: GrayCo Photos shows every linked job's CompanyCam photos from the server's index.
   node tools/tests/test_CCPHOTOS.mjs <build dir>      (offline harness S/wN/harness_N.mjs + S/wDEMO/seed.mjs; made-up data only)
   The index is made by the REAL server code (_lib/cc-photos.js) against a fake CompanyCam, written into the harness's cloud,
   then the page reads it:
     • every job / lead with a linked project shows its photo count on its card and every photo on its page — no CompanyCam
       read for an indexed project; a project not indexed yet still comes from CompanyCam (the old way)
     • grids use CompanyCam's small "thumbnail" link (loading=lazy), a photo opened full screen its "web" link
     • 300 photos: 120 tiles, then "Show more photos"
     • the Live Photo Feed comes from the index
     • a phone upload is stored ≤ 1600 px, JPEG, with a ≤ 360 px thumbnail
     • the CRM's "what changed" pull never asks for the index; 📸 CompanyCam sync status shows the index + "⟳ Index all photos now"
     • no page errors */
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const S = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { computer, signIn, sleep, cset, cget, waitFor, cloud } = await import(S + '/wN/harness_N.mjs');
const { seedDemo } = await import(S + '/wDEMO/seed.mjs');
const build = path.resolve(process.argv[2] || ROOT);
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + extra : '')); } }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/* ── made-up CompanyCam projects ── */
const NOW = Math.floor(Date.now() / 1000);
function photo(pid, i){
  const src = 'c3JjLXBob3RvLWJ1Y2tldC1wYXRoLWZvci0' + pid + '-' + i + '.jpg';
  return { id: pid * 1000 + i, project_id: pid, captured_at: NOW - 86400 * 3 - i * 300, creator_name: i % 2 ? 'Sample PM' : 'Sample Super', description: i === 0 ? 'Before tear-off' : '',
    uris: [{ type: 'original', uri: 'https://img.cc.test/o/' + src }, { type: 'web', uri: 'https://img.cc.test/rs:fit:1024/' + src }, { type: 'thumbnail', uri: 'https://img.cc.test/rs:fit:250/' + src }] };
}
const CCP = { 8001: 300, 8002: 12, 8003: 5, 8004: 4, 8005: 6, 8006: 3 };
const PH = {}; Object.keys(CCP).forEach(pid => { PH[pid] = []; for (let i = 0; i < CCP[pid]; i++) PH[pid].push(photo(+pid, i)); });

/* ── the CRM data: demo jobs, linked the ways the CRM links them ── */
seedDemo();
const P = cget('projects');
const job = id => P.find(p => p.id === id);
job('P1').ccProjectId = '8001';                                            /* 300 photos */
job('P2').ccamUrl = 'https://app.companycam.com/projects/8002';            /* linked by its CompanyCam link */
job('P3').ccProjectId = '8003'; job('P3').ccMoreIds = ['8004'];            /* two photo projects */
job('P4').ccProjectId = '8006';                                            /* linked after the last index run: not indexed yet */
cset('projects', P);
const L = cget('leads'); L.find(l => l.id === 'L1').ccProjectId = '8005'; cset('leads', L);   /* a lead's project */

/* ── the server's index, made by the real code (8006 is linked to P4 only after this run) ── */
process.env.COMPANYCAM_TOKEN = 'X'.repeat(43); process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test'; process.env.CC_PHOTO_MIN_MS = '0';
const nodeFetch = global.fetch;
global.fetch = async function(url, init){
  const u = String(url), J = (b, st) => ({ ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
  if (u.startsWith('https://api.companycam.com/v2/')) {
    const x = new URL(u), m = /^\/v2\/projects\/(\d+)\/photos$/.exec(x.pathname), pg = +(x.searchParams.get('page') || 1), per = +(x.searchParams.get('per_page') || 50);
    if (m) return J((PH[m[1]] || []).slice((pg - 1) * per, pg * per));
    if (x.pathname === '/v2/projects') return J([]);
    return J({});
  }
  if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
    if (init && init.method === 'POST') { JSON.parse(init.body).forEach(r => cset(r.key, r.value)); return J([], 201); }
    const d = decodeURIComponent(u), m = /key=in\.\(([^)]*)\)/.exec(d);
    const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : [];
    return J(keys.filter(k => cget(k) !== undefined).map(k => ({ key: k, value: cget(k), updated_at: String(JSON.stringify(cget(k)).length) })));
  }
  throw new Error('unexpected ' + u);
};
const CPL = require(path.join(ROOT, 'netlify/functions/_lib/cc-photos.js'));
const saveP4 = job('P4').ccProjectId; delete job('P4').ccProjectId; cset('projects', P);
const ir = await CPL.run({ who: 'test', budgetMs: 60000 });
job('P4').ccProjectId = saveP4; cset('projects', P);
global.fetch = nodeFetch;
ok('server index built: 5 projects, 327 photos, a feed of the newest (40 a project)', ir.ok && cget('ccidx') && cget('ccidx').n === 327 && cget('ccidx').feed.length === 67 && cget('ccidx:8001').n === 300 && !cget('ccidx:8006'), JSON.stringify({ n: cget('ccidx') && cget('ccidx').n, feed: cget('ccidx') && cget('ccidx').feed.length, ir }));

/* ── the browser ── */
const c = await computer('CCP', { build });
const proxied = [], posts = [];
await c.ctx.route(u => new URL(u).host === 'img.cc.test', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await c.ctx.route(u => /\/\.netlify\/functions\/companycam-webhook/.test(u), async r => {
  const u = new URL(r.request().url()), q = u.searchParams, px = q.get('proxy'), J = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await sleep(80);
  if (r.request().method() === 'POST') { posts.push(px); return J({ ok: true, started: true, message: 'Indexing every CompanyCam photo now — press Refresh to see how far it is.' }); }
  if (px === 'status') return J({ ok: true, verified: true, reason: 'ok', source: 'env', status: 200 });
  if (px === 'sync') return J({ ok: true, tokenSet: true, health: { at: new Date().toISOString(), ok: true, read: 6 }, review: [], photoIndex: CPL.statusOf(cget('ccidx_state')) });
  if (px === 'recent') return J({ ok: true, projects: [] });
  if (px === 'api') {
    const ep = q.get('endpoint') || '', per = +q.get('per_page') || 50, pg = +q.get('page') || 1; proxied.push(ep);
    let m = /^projects\/(\d+)\/photos$/.exec(ep); if (m) return J((PH[m[1]] || []).slice((pg - 1) * per, pg * per));
    m = /^photos\/(\d+)$/.exec(ep); if (m) { const pid = Math.floor(+m[1] / 1000); return J((PH[pid] || []).find(x => x.id === +m[1]) || {}); }
    if (ep === 'photos') return J([]);
    return J([]);
  }
  return J({});
});
await signIn(c, 'wjohnson@grayco-cs.com', 12000);
const p = c.page();
await p.evaluate(() => window._setView('allphotos'));
await waitFor(c, () => !!document.querySelector('#gcuOv .pv-card'), null, 30000, 200);
/* 1. the cards: counts from the index before any job is opened */
const cards = await waitFor(c, () => {
  const t = id => { const b = document.querySelector('#gcuOv .pv-card[data-id="' + id + '"]'); return b ? b.textContent : ''; };
  const o = { P1: t('P1'), P2: t('P2'), P3: t('P3') };
  return /300 photos/.test(o.P1) && /12 photos/.test(o.P2) && /9 photos/.test(o.P3) ? o : null;
}, null, 30000, 250);
const cardDbg = cards ? '' : await p.evaluate(() => ['P1', 'P2', 'P3'].map(id => { const b = document.querySelector('#gcuOv .pv-card[data-id="' + id + '"]'); return id + ': ' + (b ? b.textContent.slice(0, 80) : 'none'); }).join(' | '));
ok('every linked job\'s card shows its CompanyCam photo count from the index (300 · 12 · 5+4)', !!cards, cardDbg);
ok('…with no CompanyCam read per project', !proxied.some(e => /^projects\/800[1-5]\/photos/.test(e)), proxied.join(' '));
const feed = await waitFor(c, () => { const l = Array.from(document.querySelectorAll('#gcuOv [data-src-kind="cc"] img')); return l.length ? l.map(i => i.getAttribute('data-src') || i.getAttribute('src') || '') : null; }, null, 15000, 250);
ok('the Live Photo Feed shows CompanyCam photos from the index, small links', !!feed && feed.length > 0 && feed.every(u => /rs:fit:250/.test(u)), feed ? feed.slice(0, 2).join(' ') : JSON.stringify(await p.evaluate(() => ({ ix: window._gcPhotos.ccIndex(), feed: (document.querySelector('#gcuOv .pv-panel') || {}).textContent }))));
/* 2. a job with 300 photos */
await p.evaluate(() => window._gcPhotos.open('P1'));
const n1 = await waitFor(c, () => { const n = document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length; return n >= 120 ? n : null; }, null, 20000, 200);
const more = await p.evaluate(() => { const b = document.querySelector('#gcuOv [data-a="jmore"]'); return b ? b.textContent : ''; });
ok('300 photos: 120 tiles first, then "Show more photos (180 more)"', n1 === 120 && /180 more/.test(more), n1 + ' ' + more);
const grid = await p.evaluate(() => Array.from(document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"] img')).map(i => ({ s: i.getAttribute('data-src') || '', l: i.getAttribute('loading') })));
ok('grid tiles use CompanyCam\'s thumbnail link, loading=lazy', grid.length === 120 && grid.every(x => /rs:fit:250/.test(x.s) && x.l === 'lazy'), JSON.stringify(grid[0]));
await p.click('#gcuOv [data-a="jmore"]');
const n2 = await waitFor(c, () => { const n = document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length; return n >= 300 ? n : null; }, null, 10000, 200);
ok('"Show more" → all 300', n2 === 300 && !(await p.$('#gcuOv [data-a="jmore"]')), String(n2));
ok('no CompanyCam read for the indexed job', !proxied.some(e => /^projects\/8001\/photos/.test(e)));
/* 3. full screen: the larger "web" link */
await p.click('#gcuOv .gcu-grid [data-src-kind="cc"]');
const big = await waitFor(c, () => { const i = document.querySelector('#gcu-big img'); return i ? (i.getAttribute('data-src') || i.getAttribute('src') || '') : null; }, null, 10000, 200);
ok('a photo opened full screen uses the "web" link', /rs:fit:1024/.test(big || ''), big);
await sleep(800);
ok('…and asks the server once for that photo\'s links (the original for Download)', proxied.filter(e => /^photos\/8001\d+$/.test(e)).length === 1, proxied.filter(e => /^photos\//.test(e)).join(' '));
/* 4. every other linked job / lead */
async function tiles(id){ await p.evaluate(x => window._gcPhotos.open(x), id); return waitFor(c, () => { const n = document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length; return n || null; }, null, 15000, 200); }
const t2 = await tiles('P2'); await sleep(400);
ok('P2 (linked by its CompanyCam link): 12 photos', t2 === 12 && (await p.evaluate(() => document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length)) === 12, String(t2));
await tiles('P3'); await sleep(600);
const t3 = await p.evaluate(() => document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length);
ok('P3 (two photo projects): 5 + 4', t3 === 9, String(t3));
await tiles('L1'); await sleep(600);
const tl = await p.evaluate(() => document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length);
ok('a lead\'s CompanyCam project: 6 photos', tl === 6, String(tl));
await tiles('P4'); await sleep(1200);
const t4 = await p.evaluate(() => document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length);
ok('a project linked after the last index run still comes from CompanyCam (3)', t4 === 3 && proxied.some(e => e === 'projects/8006/photos'), t4 + ' ' + proxied.filter(e => /8006/.test(e)).join(' '));
ok('no CompanyCam read for any indexed project', !proxied.some(e => /^projects\/800[1-5]\/photos/.test(e)), proxied.filter(e => /^projects/.test(e)).join(' '));
/* 5. a phone upload is stored small */
const up = await p.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = 4000; cv.height = 3000; const x = cv.getContext('2d');
  for (let i = 0; i < 400; i++) { x.fillStyle = 'hsl(' + (i * 37 % 360) + ',70%,' + (30 + i % 40) + '%)'; x.fillRect((i * 97) % 4000, (i * 61) % 3000, 300, 200); }
  const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.95));
  const f = new File([b], 'phone.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  const r = await window._gcPhotos.capture('P2', [f], 'During', { customer: false });   /* (with patch SUBPHOTOS: no "Customer can see?" question) */
  return { inSize: b.size, id: r.added[0] };
});
const rec = await waitFor(c, id => { const r = window._gcPhotos.records().find(x => x.id === id); return r && r.ref && r.thumbRef && r.thumbRef !== r.ref ? { ref: r.ref, thumbRef: r.thumbRef } : null; }, up.id, 40000, 500);
const dims = rec ? await p.evaluate(async rr => {
  const one = async ref => { const b = await window._gcFileBlob(ref); const bm = await createImageBitmap(b); return { w: bm.width, h: bm.height, size: b.size, type: b.type }; };
  return { full: await one(rr.ref), thumb: await one(rr.thumbRef) };
}, rec) : null;
ok('a 4000×3000 phone photo is stored at most 1600 px, JPEG, much smaller', dims && Math.max(dims.full.w, dims.full.h) <= 1600 && /jpeg/.test(dims.full.type) && dims.full.size < up.inSize / 3, JSON.stringify({ dims, inSize: up.inSize }));
ok('…with a thumbnail of at most 360 px', dims && Math.max(dims.thumb.w, dims.thumb.h) <= 360, JSON.stringify(dims && dims.thumb));
/* 6. the CRM's pull, the status window */
const bulk = c.log.filter(x => x.method === 'GET' && x.path === '/rest/v1/gc_kv' && !/key=(eq|in)\./.test(x.q));
ok('the CRM\'s "what changed" reads leave the photo index out', bulk.length > 0 && bulk.every(x => /key=not\.like\.ccidx\*/.test(x.q)), bulk.slice(0, 2).map(x => x.q.slice(0, 160)).join(' | '));
const idxReads = c.log.filter(x => x.method === 'GET' && /ccidx/.test(x.q) && !/not\.like\.ccidx/.test(x.q));
ok('the index is read in a few small reads (the summary + the rows of each job opened)', idxReads.length > 0 && idxReads.length <= 24, idxReads.length + ': ' + idxReads.map(x => x.q.replace(/.*key=/, '').slice(0, 40)).join(' '));
await p.evaluate(() => { window._gcPhotos.close(); window._gcCCSyncPanel(); });
const line = await waitFor(c, () => { const b = document.querySelector('#gc-ccsync-ov'); return b && /CompanyCam photos in GrayCo Photos/.test(b.textContent) && /5 of 5 linked projects/.test(b.textContent) ? b.textContent.match(/CompanyCam photos in GrayCo Photos[^\n]{0,140}/)[0] : null; }, null, 15000, 250);
ok('📸 CompanyCam sync status shows the photo index', !!line, line || await p.evaluate(() => (document.querySelector('#gc-ccsync-ov') || {}).textContent || 'no window'));
await p.evaluate(() => document.querySelector('#gc-ccsync-ov [data-ccs-pidx]').click());
await sleep(1200);
ok('"⟳ Index all photos now" asks the server', posts.includes('photoindex') && /Indexing every CompanyCam photo now/.test(await p.evaluate(() => document.querySelector('#gc-ccsync-ov').textContent)), posts.join());
const errs = c.errs.filter(e => !/ResizeObserver/.test(e));
ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await c.b.close();
console.log('CCPHOTOS ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
