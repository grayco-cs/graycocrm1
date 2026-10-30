/* patch CCPHOTOS2 — the server half, against a FAKE CompanyCam (API + picture links) and a FAKE Supabase (gc_kv + Storage).
   node tools/tests/test_CCPHOTOS2_fn.mjs            (made-up projects / photos only; no network)
     1. off by default: the index is built, nothing is copied, the window says Off; the "new photo" moment (ccvis) is stamped
     2. the switch: owner / admin only (the office is refused)
     3. a run that runs out of time keeps every copy it made; the next runs finish — every photo copied, once
        (crm-files/<sha256>.jpg like a GrayCo upload, web + thumbnail, never the original, never the token)
     4. no re-copy: a run with nothing new fetches no picture
     5. a new photo is copied on the next run
     6. a photo removed in CompanyCam keeps its GrayCo copy (marked removed) — even a whole deleted project; without a copy it drops
     7. the safety cap: copying pauses, the office To-Do hears once, raising the cap goes on; the whole bucket counts too
     8. an expired picture link: the project is re-read for fresh links and copied then; a 429 waits
     9. who sees a CompanyCam photo (customer portal, GC link, sub portal): old ones as before, new ones only after a click,
        per photo / per job, newest choice wins; the GrayCo copy is what the portal shows */
import { createRequire } from 'module';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } }

const TOKEN = 'K'.repeat(43);
process.env.COMPANYCAM_TOKEN = TOKEN;
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-test-key';
process.env.URL = 'https://crm.test';
process.env.CC_PHOTO_MIN_MS = '0';
process.env.CC_COPY_MIN_MS = '0';
process.env.PORTAL_MAIL_OFF = '1';
delete process.env.RESEND_API_KEY;
const NOW = Math.floor(Date.now() / 1000);

/* ── a tiny JPEG with real SOF dimensions ── */
function jpeg(w, h, seed, size){
  const head = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xFF, 0xDA, 0x00, 0x02]);
  const parts = []; let n = 0, i = 0; while (n < size) { const d = crypto.createHash('sha512').update(seed + ':' + i++).digest(); parts.push(d); n += d.length; }
  return Buffer.concat([head, Buffer.concat(parts).slice(0, size), Buffer.from([0xFF, 0xD9])]);
}

/* ── the fake CompanyCam ── */
let GEN = 1;
const CCP = {};
function mkPhoto(pid, id, cap, created){
  const src = Buffer.from('photo-' + id).toString('base64').replace(/=/g, '') + '.jpg';
  return { id, project_id: pid, captured_at: cap, created_at: created || cap + 5, creator_name: 'Sample PM', description: '',
    uris: [{ type: 'original', uri: 'https://img.cc.test/g' + GEN + '/rs:fit:4032/' + src }, { type: 'web', uri: 'https://img.cc.test/g' + GEN + '/rs:fit:1024/' + src }, { type: 'thumbnail', uri: 'https://img.cc.test/g' + GEN + '/rs:fit:250/' + src }] };
}
function mkPhotos(pid, n, start, cap0){ const out = []; for (let i = 0; i < n; i++) out.push(mkPhoto(pid, pid * 10000 + (start || 0) + i, (cap0 || NOW - 86400 * 20) + i * 60)); return out; }
function project(id, name){ CCP[id] = { p: { id, name, status: 'active', created_at: NOW - 86400 * 40, updated_at: NOW - 86400 * 10 }, photos: [] }; return CCP[id]; }
project(701, 'Henderson Kitchen').photos = mkPhotos(701, 60);
project(702, 'Lopez Roof').photos = mkPhotos(702, 25);
project(703, 'Lead Lane').photos = mkPhotos(703, 10);
function J(b, st, hd){ return { ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: k => (hd || {})[String(k).toLowerCase()] || null }, arrayBuffer: async () => { const x = Buffer.isBuffer(b) ? b : Buffer.from(JSON.stringify(b)); return x.buffer.slice(x.byteOffset, x.byteOffset + x.length); } }; }
const imgGets = []; let imgAuth = 0, imgRate = null, img404 = {};
function imgAnswer(u, init){
  const h = (init && init.headers) || {};
  if (h.Authorization || h.authorization) imgAuth++;
  imgGets.push(u);
  if (imgRate && imgRate.n > 0) { imgRate.n--; return J({ error: 'slow down' }, 429, { 'retry-after': String(imgRate.after) }); }
  const m = /^https:\/\/img\.cc\.test\/g(\d+)\/rs:fit:(\d+)\/(.+)$/.exec(u);
  if (!m) return J('nope', 404);
  if (+m[1] !== GEN || img404[u]) return J('expired', 403);
  if (m[2] === '4032') return J(jpeg(4032, 3024, m[3], 30000));
  return m[2] === '1024' ? J(jpeg(1024, 768, 'w' + m[3], 1800)) : J(jpeg(250, 188, 't' + m[3], 300));
}
function ccAnswer(u){
  const url = new URL(u), p = url.pathname.replace(/^\/v2/, ''), page = +(url.searchParams.get('page') || 1), per = +(url.searchParams.get('per_page') || 50);
  if (p === '/projects') { const l = Object.values(CCP).filter(x => !x.gone).map(x => x.p).sort((a, b) => b.updated_at - a.updated_at); return J(l.slice((page - 1) * per, page * per)); }
  const m = /^\/projects\/(\d+)\/photos$/.exec(p);
  if (m) { const x = CCP[+m[1]]; if (!x || x.gone) return J({ error: 'not found' }, 404); const l = x.photos.slice().sort((a, b) => b.captured_at - a.captured_at); return J(l.slice((page - 1) * per, page * per)); }
  return J({ error: 'unknown' }, 404);
}
/* ── the fake Supabase: gc_kv, Storage (crm-files), the storage-usage function, the staff check ── */
const KV = {}; const STORE = {}; const puts = []; const kicks = []; let BUCKET_RPC = null; let ROLE = 'admin';
function verOf(k){ const t = JSON.stringify(KV[k]); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ':' + h; }
global.fetch = async function(url, init){
  const u = String(url);
  if (u.indexOf(TOKEN) >= 0) throw new Error('the token is in a URL');
  if (u.startsWith('https://img.cc.test/')) return imgAnswer(u, init);
  if (u.startsWith('https://api.companycam.com/v2/')) {
    const auth = init && init.headers && (init.headers.Authorization || init.headers.authorization);
    if (auth !== 'Bearer ' + TOKEN) return J({ error: 'unauthorized' }, 401);
    return ccAnswer(u);
  }
  if (u.startsWith('https://sb.test/storage/v1/object/sign/crm-files')) {
    const b = JSON.parse(init.body); return J(b.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=sig', error: STORE[p] ? null : 'not found' })));
  }
  if (u.startsWith('https://sb.test/storage/v1/object/crm-files/')) {
    const name = u.slice('https://sb.test/storage/v1/object/crm-files/'.length), buf = Buffer.from(init.body);
    puts.push(name);
    if (STORE[name]) return J({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, 400);
    STORE[name] = { buf, type: init.headers['Content-Type'] }; return J({ Key: 'crm-files/' + name });
  }
  if (u.startsWith('https://sb.test/rest/v1/rpc/gc_storage_usage')) return BUCKET_RPC == null ? J({ message: 'not found' }, 404) : J([{ bucket: 'crm-files', yr: 2026, kind: 'photo', files: 1, bytes: BUCKET_RPC }]);
  if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
    if (init && init.method === 'POST') {
      const body = JSON.parse(init.body), rows = Array.isArray(body) ? body : [body], ign = /ignore-duplicates/.test(String(init.headers.Prefer || ''));
      rows.forEach(r => { if (ign && KV[r.key] !== undefined) return; KV[r.key] = JSON.parse(JSON.stringify(r.value)); }); return J([], 201);
    }
    const d = decodeURIComponent(u), m = /key=in\.\(([^)]*)\)/.exec(d), e = /key=eq\.([^&]*)/.exec(d), lk = /key=like\.([^&]*)/.exec(d);
    const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : e ? [e[1]] : lk ? Object.keys(KV).filter(k => new RegExp('^' + lk[1].replace(/\*/g, '.*') + '$').test(k)) : [];
    return J(keys.filter(k => KV[k] !== undefined).map(k => ({ key: k, value: KV[k], updated_at: verOf(k) })));
  }
  if (u.startsWith('https://sb.test/auth/v1/user')) return J({ email: 'boss@grayco.test' });
  if (u.startsWith('https://sb.test/rest/v1/gc_staff')) return J([{ email: 'boss@grayco.test', role: ROLE, active: true }]);
  if (u.startsWith('https://sb.test/rest/v1/')) return J([]);
  if (u === 'https://crm.test/.netlify/functions/companycam-photos-background') { kicks.push(1); return J({}, 202); }
  throw new Error('unexpected ' + u);
};
const CP = require(path.join(FN, '_lib/cc-photos.js'));
const CV = require(path.join(FN, '_lib/cc-vis.js'));
const WH = require(path.join(FN, 'companycam-webhook.js'));
const rowOf = pid => KV['ccidx:' + pid];
const gOf = pid => (rowOf(pid) && rowOf(pid).g) || {};
const nG = pid => Object.keys(gOf(pid)).length;
const call = (q, m, body) => WH.handler({ httpMethod: m || 'POST', queryStringParameters: { proxy: q }, headers: { authorization: 'Bearer t', origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(body || {}) });
const run = (ms) => CP.run({ who: 'test', budgetMs: ms || 60000 });
KV.projects = [
  { id: 'J1', name: 'Henderson Kitchen', status: 'Active', ccProjectId: '701' },
  { id: 'J2', name: 'Lopez Roof', status: 'Active', ccProjectId: '702' }
];
KV.leads = [{ id: 'L3', name: 'Lead Lane', status: 'New lead', ccProjectId: '703' }];

/* ── 1. off by default ── */
console.log('1. off by default');
const r1 = await run();
ok('the index is built (60 + 25 + 10)', r1.ok && rowOf(701).n === 60 && rowOf(702).n === 25 && rowOf(703).n === 10, JSON.stringify(r1));
ok('nothing copied, no picture fetched, nothing stored', imgGets.length === 0 && puts.length === 0 && nG(701) === 0, imgGets.length + ' / ' + puts.length);
const s1 = CP.statusOf(KV.ccidx_state, KV.ccidx_copy);
ok('the window: Off, 0 of 95 copied, an estimate for all of them, cap 80 GB', s1.copy && s1.copy.on === false && s1.copy.copied === 0 && s1.copy.total === 95 && s1.copy.capGB === 80 && s1.copy.estimateBytes === 95 * 250000 && KV.ccidx_state.copy.stop === 'off', JSON.stringify(s1.copy));
ok('"new CompanyCam photo" starts now: gc_kv ccvis stamped once', KV.ccvis && Math.abs(Date.parse(KV.ccvis.since) / 1000 - NOW) < 120);
const since0 = KV.ccvis.since; await run();
ok('…and never moved by a later run', KV.ccvis.since === since0);
const sy0 = JSON.parse((await call('sync', 'GET')).body);
ok('?proxy=sync carries the meter (Off) and the moment', sy0.photoIndex && sy0.photoIndex.copy && sy0.photoIndex.copy.on === false && sy0.ccvis && sy0.ccvis.since === since0, JSON.stringify(sy0.photoIndex && sy0.photoIndex.copy));

/* ── 2. the switch ── */
console.log('2. the switch');
ROLE = 'office';
const so = await call('photocopy', 'POST', { on: true });
ok('the office cannot turn it on', so.statusCode === 403 && !KV.ccidx_copy);
ROLE = 'admin';
const sa = JSON.parse((await call('photocopy', 'POST', { on: true, capGB: 80 })).body);
ok('an admin turns it on: gc_kv ccidx_copy { on, capGB 80, by }, the background is started', sa.ok && KV.ccidx_copy.on === true && KV.ccidx_copy.capGB === 80 && KV.ccidx_copy.by === 'boss@grayco.test' && kicks.length >= 1, JSON.stringify(sa));
const bad = await call('photocopy', 'POST', { capGB: 'lots' });
ok('a cap that is not a number is refused', bad.statusCode === 400);

/* ── 3. resume after a timeout ── */
console.log('3. copy everything, across runs');
process.env.CC_COPY_MIN_MS = '70';
const r3 = await run(6800);
const part = nG(701) + nG(702) + nG(703);
ok('a short run copies some and stops for time (' + part + ' of 95)', part > 0 && part < 95 && r3.more === true, JSON.stringify(r3.copy));
ok('…what it copied is saved in the index rows', part === (KV.ccidx_state.done['701'].g || 0) + (KV.ccidx_state.done['702'].g || 0) + (KV.ccidx_state.done['703'].g || 0));
process.env.CC_COPY_MIN_MS = '0';
let guard = 0; while (nG(701) + nG(702) + nG(703) < 95 && guard++ < 6) await run();
ok('the next runs finish: all 95 photos have a GrayCo copy', nG(701) === 60 && nG(702) === 25 && nG(703) === 10);
const webGets = imgGets.filter(u => /rs:fit:1024/.test(u)), thGets = imgGets.filter(u => /rs:fit:250/.test(u));
ok('each picture fetched exactly once (95 web + 95 thumbnails), never the original', webGets.length === 95 && new Set(webGets).size === 95 && thGets.length === 95 && new Set(thGets).size === 95 && !imgGets.some(u => /4032/.test(u)), webGets.length + ' ' + thGets.length);
ok('stored once each, nothing stored twice', puts.length === 190 && new Set(puts).size === 190, puts.length);
const anyId = String(701 * 10000 + 5), g5 = gOf(701)[anyId];
ok('crm-files/<sha256>.jpg like a GrayCo upload: the name is the fingerprint of the bytes', g5 && /^[0-9a-f]{64}\.jpg$/.test(g5[0]) && crypto.createHash('sha256').update(STORE[g5[0]].buf).digest('hex') + '.jpg' === g5[0] && STORE[g5[0]].type === 'image/jpeg');
ok('web copy (1024 px) + a separate small thumbnail, with their bytes', g5 && /^[0-9a-f]{64}\.jpg$/.test(g5[1]) && g5[1] !== g5[0] && CP.imgDims(STORE[g5[0]].buf).w === 1024 && CP.imgDims(STORE[g5[1]].buf).w === 250 && g5[2] === STORE[g5[0]].buf.length + STORE[g5[1]].buf.length);
const up5 = CP.unpackRow(rowOf(701)).find(x => x.id === anyId);
ok('the index entry says where the copy is (gpath / gthumb)', up5 && up5.gpath === g5[0] && up5.gthumb === g5[1] && !up5.removed);
ok('the CompanyCam token never went to a picture link and is stored nowhere', imgAuth === 0 && JSON.stringify(KV).indexOf(TOKEN) < 0);
const s3 = CP.statusOf(KV.ccidx_state, KV.ccidx_copy).copy;
const allBytes = Object.values(STORE).reduce((n, x) => n + x.buf.length, 0);
ok('the meter: 95 of 95 copied, bytes = what was stored, the estimate from the measured average', s3.copied === 95 && s3.total === 95 && s3.bytes === allBytes && s3.measured && s3.avgBytes === Math.round(allBytes / 95) && s3.estimateBytes === 95 * s3.avgBytes && !s3.stop, JSON.stringify(s3));
ok('the summary\'s cover and feed carry the copies', Array.isArray(KV.ccidx.p['701']) && /^[0-9a-f]{64}\.jpg$/.test(KV.ccidx.p['701'][4] || '') && KV.ccidx.feed.some(x => /^[0-9a-f]{64}\.jpg$/.test(x[7] || '')));

/* ── 4. no re-copy ── */
console.log('4. never copied twice');
imgGets.length = 0; puts.length = 0;
const r4 = await run();
ok('a run with nothing new fetches no picture and stores nothing', imgGets.length === 0 && puts.length === 0 && !r4.more, imgGets.length + ' ' + JSON.stringify(r4.copy));
/* the background function is not asked to go on when nothing is left */
const SCHED = require(path.join(FN, 'companycam-photos.js'));
const k4 = kicks.length; const sr4 = JSON.parse((await SCHED.handler({})).body);
ok('…and the 15-minute run does not start the background run for nothing', !sr4.handedOff && kicks.length === k4, JSON.stringify(sr4));

/* ── 5. a new photo ── */
console.log('5. a new photo');
CCP[701].photos.push(...mkPhotos(701, 2, 900, NOW - 120)); CCP[701].p.updated_at = NOW;
imgGets.length = 0;
await run();
ok('the 2 new photos are indexed and copied (4 pictures fetched)', rowOf(701).n === 62 && nG(701) === 62 && imgGets.length === 4, imgGets.length);

/* ── 6. removed in CompanyCam ── */
console.log('6. removed in CompanyCam: the GrayCo copy stays');
const gone3 = CCP[701].photos.splice(0, 3).map(p => String(p.id));
KV.ccidx_copy = Object.assign({}, KV.ccidx_copy, { on: false, at: new Date().toISOString() });   /* off: a new photo is indexed, not copied */
CCP[702].photos.push(mkPhoto(702, 702 * 10000 + 777, NOW - 300)); CCP[702].p.updated_at = NOW + 1;
await run();
const unc = String(702 * 10000 + 777);
ok('(switch off: the new 702 photo is indexed, not copied)', rowOf(702).n === 26 && !gOf(702)[unc]);
CCP[702].photos = CCP[702].photos.filter(p => String(p.id) !== unc);
CCP[703].gone = true;
KV.ccidx_request = { at: new Date().toISOString(), by: 'test' };
await run();
const rows701 = CP.unpackRow(rowOf(701));
ok('the 3 photos removed in CompanyCam are still in the index, with their copy, marked removed', gone3.every(id => { const x = rows701.find(r => r.id === id); return x && x.gpath && x.removed > 0; }) && rowOf(701).n === 62, rowOf(701).n);
ok('the others are not marked', rows701.filter(x => x.removed).length === 3);
ok('a removed photo WITHOUT a copy drops as before', rowOf(702).n === 25 && !CP.unpackRow(rowOf(702)).some(x => x.id === unc));
ok('a whole project deleted in CompanyCam: its 10 copied photos stay, marked removed, on the job\'s card', rowOf(703).gone === true && rowOf(703).n === 10 && CP.unpackRow(rowOf(703)).every(x => x.gpath && x.removed) && KV.ccidx.p['703'] && KV.ccidx.p['703'][0] === 10, JSON.stringify(KV.ccidx.p['703']));
ok('the meter counts them ("removed in CompanyCam")', CP.statusOf(KV.ccidx_state, KV.ccidx_copy).copy.removed === 13);
KV.ccidx_request = { at: new Date(Date.now() + 1000).toISOString(), by: 'test' };
await run();
ok('…and they stay on the next full re-read too', rowOf(701).n === 62 && rowOf(703).n === 10 && CP.unpackRow(rowOf(701)).filter(x => x.removed).length === 3);

/* ── 7. the safety cap ── */
console.log('7. the safety cap');
const used7 = CP.statusOf(KV.ccidx_state, KV.ccidx_copy).copy.bytes;
CCP[702].photos.push(...mkPhotos(702, 20, 500, NOW - 7200)); CCP[702].p.updated_at = NOW + 2;
KV.ccidx_copy = { on: true, capGB: (used7 + 6 * 2104) / 1e9, by: 'test', at: new Date().toISOString() };
imgGets.length = 0;
const r7 = await run();
const c7 = KV.ccidx_state.copy, todos = () => (typeof KV.gc_office_tasks === 'string' ? JSON.parse(KV.gc_office_tasks) : (KV.gc_office_tasks || [])).filter(t => /^ccphotos-cap-/.test(t.id));
ok('copying pauses at the cap (some of the 20 copied, not all)', c7.stop === 'cap' && nG(702) > 25 && nG(702) < 45 && !r7.more, nG(702) + ' ' + JSON.stringify(r7.copy));
ok('the office To-Do says so, once', todos().length === 1 && /paused at/.test(todos()[0].label), JSON.stringify(todos()));
const s7 = CP.statusOf(KV.ccidx_state, KV.ccidx_copy).copy;
ok('the window shows the stop', s7.stop === 'cap' && !!s7.stopAt);
imgGets.length = 0; await run();
ok('a run while paused fetches nothing, and the To-Do is not repeated', imgGets.length === 0 && todos().length === 1);
KV.ccidx_copy = { on: true, capGB: 80, by: 'test', at: new Date().toISOString() };
await run();
ok('raising the cap goes on: all 45 of 702 copied', nG(702) === 45 && !KV.ccidx_state.copy.stop, nG(702));
BUCKET_RPC = 80.5e9; KV.ccidx_state.copy.bucketAt = '';
CCP[702].photos.push(...mkPhotos(702, 2, 600, NOW - 6000)); CCP[702].p.updated_at = NOW + 3;
imgGets.length = 0; await run();
ok('the whole file storage counts too (80.5 GB in crm-files, cap 80): paused before copying', KV.ccidx_state.copy.stop === 'cap' && imgGets.length === 0 && nG(702) === 45 && CP.statusOf(KV.ccidx_state, KV.ccidx_copy).copy.bucketBytes === 80.5e9, JSON.stringify({ stop: KV.ccidx_state.copy.stop, gets: imgGets.length, n: nG(702), b: KV.ccidx_state.copy.bucket }));
BUCKET_RPC = null; KV.ccidx_state.copy.bucketAt = ''; KV.ccidx_copy = { on: true, capGB: 80, by: 'test', at: new Date().toISOString() };
await run();
ok('…and goes on when there is room', nG(702) === 47 && !KV.ccidx_state.copy.stop);

/* ── 8. expired links, 429 ── */
console.log('8. expired picture links, CompanyCam asks to wait');
KV.ccidx_copy = { on: false, capGB: 80, by: 'test', at: new Date().toISOString() };
CCP[702].photos.push(...mkPhotos(702, 3, 800, NOW - 5000)); CCP[702].p.updated_at = NOW + 4;
await run();   /* indexed with today's links, not copied (off) */
GEN = 2;       /* CompanyCam renews its links: every link the index has is now expired */
CCP[702].photos.forEach(p => { p.uris.forEach(u => { u.uri = u.uri.replace(/\/g1\//, '/g2/'); }); });
KV.ccidx_copy = { on: true, capGB: 80, by: 'test', at: new Date().toISOString() };
await run();
ok('an expired link is tried, nothing stored, and the project is marked to be read again', Object.keys(rowOf(702).gx || {}).length === 3 && !!(KV.ccidx_state.copy.stale || {})['702'] && nG(702) === 47, JSON.stringify(rowOf(702).gx));
await run();
ok('the next run re-reads it for fresh links and makes the copies', nG(702) === 50 && !rowOf(702).gx, nG(702));
imgRate = { n: 99, after: 600 };
CCP[701].photos.push(...mkPhotos(701, 2, 950, NOW - 4000)); CCP[701].p.updated_at = NOW + 5;
await run();
ok('a long "429 wait": copying waits until then, the index goes on', rowOf(701).n === 64 && nG(701) === 62 && !!KV.ccidx_state.copy.wait && CP.statusOf(KV.ccidx_state, KV.ccidx_copy).copy.wait);
imgRate = null; KV.ccidx_state.copy.wait = new Date(Date.now() - 1000).toISOString();
await run();
ok('…then copies', nG(701) === 64);

/* ── 9. who sees a CompanyCam photo ── */
console.log('9. customer visibility is a click');
const since = CV.sinceOf(KV.ccvis);
const ix0 = CV.index([]);
ok('a photo put in before this release: the customer sees it (as before)', CV.customerSees('1', since - 3600, 'J1', ix0, since) === true);
ok('a photo put in after: hidden until someone clicks', CV.customerSees('2', since + 60, 'J1', ix0, since) === false);
const t0 = new Date(Date.now() - 60000).toISOString(), t1 = new Date(Date.now() - 30000).toISOString(), t2 = new Date().toISOString();
let recs = [{ id: 'ccf_2', source: 'ccflag', ccId: '2', jobId: 'J1', shared: true, visAt: t0 }, { id: 'ccf_1', source: 'ccflag', ccId: '1', jobId: 'J1', shared: false, at: t0 }];
let ix = CV.index(recs);
ok('"Customer can see" on a new photo shows it; "hidden" on an old one hides it', CV.customerSees('2', since + 60, 'J1', ix, since) === true && CV.customerSees('1', since - 3600, 'J1', ix, since) === false);
recs.push({ id: 'ccj_J1', source: 'ccflag', jobId: 'J1', mode: 'show', at: t1, upto: since + 600 }); ix = CV.index(recs);
ok('"Show all" on the job shows its photos up to that moment (the hidden old one too: newer choice)', CV.customerSees('1', since - 3600, 'J1', ix, since) === true && CV.customerSees('3', since + 500, 'J1', ix, since) === true);
ok('…a photo that comes in after "Show all" still waits for its own click', CV.customerSees('4', since + 900, 'J1', ix, since) === false);
recs[0] = Object.assign({}, recs[0], { shared: false, visAt: t2 }); ix = CV.index(recs);
ok('a click on one photo after "Show all" wins for that photo', CV.customerSees('2', since + 60, 'J1', ix, since) === false && CV.customerSees('3', since + 500, 'J1', ix, since) === true);
ok('another job is not touched by J1\'s "Show all"', CV.customerSees('5', since + 60, 'J2', ix, since) === false);
recs.push({ id: 'ccj_J2', source: 'ccflag', jobId: 'J2', mode: 'hide', at: t2, upto: since + 600 }); ix = CV.index(recs);
ok('"Hide all" hides even the old ones', CV.customerSees('6', since - 3600, 'J2', ix, since) === false);
ok('subs: "Subs see it" wins, else the same as the customer', CV.subsSee('2', since + 60, 'J1', CV.index([{ id: 'ccf_2', source: 'ccflag', ccId: '2', hideSubs: false, shared: false }]), since) === true && CV.subsSee('9', since + 60, 'J1', ix0, since) === false && CV.subsSee('9', since - 60, 'J1', ix0, since) === true);
/* the customer portal itself (portal.js), server-side, from the index + GrayCo copies */
const PJ = require(path.join(FN, 'portal.js'))._core;
/* 702: make 2 photos "new" (put in after the release), the rest are old */
const r702 = KV['ccidx:702'];
const newIds = r702.ph.slice(0, 2).map(x => String(x[0]));
r702.ph.slice(0, 2).forEach(x => { while (x.length < 7) x.push(x.length === 4 ? -1 : ''); x[7] = since + 120; });
const oldHidden = String(r702.ph[5][0]);
const p702 = { id: 'J2', name: 'Lopez Roof', ccProjectId: '702' };
let list = await PJ.ccCustomerPhotos(p702, [{ id: 'ccf_' + oldHidden, source: 'ccflag', ccId: oldHidden, jobId: 'J2', shared: false, at: t0 }], 'customer');
const ids = list.map(x => x.id.slice(3));
ok('portal: the new photos are not served, the hidden old one is not served, every other old one is', !newIds.some(i => ids.includes(i)) && !ids.includes(oldHidden) && list.length === r702.ph.length - 3, list.length + ' of ' + r702.ph.length);
ok('portal: the GrayCo copy is what it serves (signed crm-files links, not CompanyCam)', list.length > 0 && list.every(x => /^https:\/\/sb\.test\/storage\/v1\/object\/sign\/crm-files\/[0-9a-f]{64}\.jpg/.test(x.f) && /^https:\/\/sb\.test\//.test(x.t) && x.copy === true), list[0] && list[0].f);
list = await PJ.ccCustomerPhotos(p702, [{ id: 'ccf_' + newIds[0], source: 'ccflag', ccId: newIds[0], jobId: 'J2', shared: true, visAt: t2 }], 'customer');
ok('portal: after "Customer can see" on one new photo, that one is served', list.some(x => x.id === 'cc_' + newIds[0]) && !list.some(x => x.id === 'cc_' + newIds[1]));
list = await PJ.ccCustomerPhotos(p702, [{ id: 'ccj_J2', source: 'ccflag', jobId: 'J2', mode: 'show', at: t2, upto: since + 3600 }], 'customer');
ok('portal: "Show all" on the job serves every one of its photos', list.length === r702.ph.length);
list = await PJ.ccCustomerPhotos(p702, [{ id: 'ccj_J2', source: 'ccflag', jobId: 'J2', mode: 'hide', at: t2, upto: since + 3600 }], 'customer');
ok('portal: "Hide all" serves none', list.length === 0);
const p703 = { id: 'L3', name: 'Lead Lane', ccProjectId: '703' };
list = await PJ.ccCustomerPhotos(p703, [], 'customer');
ok('portal: a project deleted in CompanyCam still shows its (old, visible) photos from the GrayCo copies', list.length === 10 && list.every(x => x.copy));
const SP = require(path.join(FN, 'sub-photos.js'))._core;
const subList = await SP.jobPhotos({ gc_photos: [{ id: 'ccf_' + newIds[1], source: 'ccflag', ccId: newIds[1], jobId: 'J2', hideSubs: false, at: t2 }] }, p702, 'sub', null);
ok('sub portal: old photos + the one "Subs see it" new one; the other new one waits', subList.some(x => x.id === 'cc_' + newIds[1]) && !subList.some(x => x.id === 'cc_' + newIds[0]) && subList.length === r702.ph.length - 1, subList.length);
/* the live fallback (a project not indexed yet) follows the same rule */
delete KV['ccidx:701'];
CCP[701].photos[0].created_at = since + 300; CCP[701].photos[0].captured_at = since + 290;
list = await PJ.ccCustomerPhotos({ id: 'J1', ccProjectId: '701' }, [], 'customer');
ok('portal, project not indexed yet (straight from CompanyCam): a new photo is hidden there too', list.length === CCP[701].photos.length - 1 && !list.some(x => x.id === 'cc_' + CCP[701].photos[0].id), list.length + ' / ' + CCP[701].photos.length);
console.log((fail ? 'FAILED ' : 'PASSED ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
