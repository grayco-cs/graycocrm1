/* patch PHOTOCOVER — 📸 Photo coverage + the owner's copy rules for GrayCo photo copies.
   node tools/tests/test_PHOTOCOVER.mjs [build dir]
   Part A (server, no network): the REAL _lib/cc-photos.js + companycam-webhook.js against a fake CompanyCam / Storage / gc_kv:
     prod-shaped coverage numbers, copy rules (lost / lead / "Not a job" never copied), a lost job's copies stay, no deletion
     without the admin's click (fake clock), 📌 Keep sticks, 🗑 Delete removes GrayCo copies only (+ the log, the index stays,
     a file another project uses stays), a reopened job is copied again, "Re-index this job", the photo-count re-read, another
     site's link is not a CompanyCam project, CompanyCam is only ever read (GET).
   Part B (browser, offline harness S/wN/harness_N.mjs): the coverage window on a prod-shaped index (problems first, numbers,
     the copy switch line), Link suggestions need a confirm, Re-index, Not a job hides the job, the lost-job decision card,
     GrayCo Photos shows every indexed photo of a linked job while copying is off, no page errors.
   Prod-shaped fixture: gc_kv rows read READ-ONLY (GET, the public anon key) into /dev/shm/pcov (PHOTOCOVER_FIX) — never
   committed. Missing → read once now (PHOTOCOVER_NOFETCH=1 → part A's prod-shaped checks and part B are skipped).
   PHOTOCOVER_NOBROWSER=1 → part A only (no browser, no browser lock). */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const S = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
const build = path.resolve(process.argv[2] || ROOT);
const FIX = process.env.PHOTOCOVER_FIX || '/dev/shm/pcov';
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); } }
const P = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };

/* ── the prod-shaped fixture (read-only GETs, into /dev/shm) ── */
async function fixture(){
  const files = ['meta.json', 'rows.json', 'jobs.json'];
  if (!files.every(f => fs.existsSync(path.join(FIX, f)))) {
    if (process.env.PHOTOCOVER_NOFETCH === '1') return null;
    const key = /GC_SB_DEFAULT_ANON = '([^']+)'/.exec(fs.readFileSync(path.join(FN, 'staff-admin.js'), 'utf8'))[1];
    const U = 'https://ieeonhpfahmwwecizdut.supabase.co/rest/v1/gc_kv', H = { apikey: key, Authorization: 'Bearer ' + key };
    const q = { 'meta.json': '?select=key,value&key=in.(ccidx_state,ccidx,ccidx_copy,ccvis)', 'rows.json': '?select=key,value&key=like.ccidx:*', 'jobs.json': '?select=key,value&key=in.(projects,leads,gc_tombstones,gc_deleted_projects)' };
    fs.mkdirSync(FIX, { recursive: true });
    for (const f of files) { const r = await fetch(U + q[f], { method: 'GET', headers: H }); if (!r.ok) return null; fs.writeFileSync(path.join(FIX, f), await r.text()); }
  }
  const kv = {};
  files.forEach(f => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')).forEach(x => { kv[x.key] = P(x.value); }));
  return kv;
}
const PROD = await fixture();

/* ── part A: the server ── */
console.log('A. server (real cc-photos.js + companycam-webhook.js; fake CompanyCam / Storage / gc_kv)');
process.env.COMPANYCAM_TOKEN = 'X'.repeat(43); process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test';
process.env.CC_PHOTO_MIN_MS = '0'; process.env.CC_COPY_MIN_MS = '0'; process.env.URL = 'https://crm.test'; process.env.CC_BACKOFF_MS = '0';
delete process.env.CC_FAKE_NOW_MS;
const KV = {}, STORE = {}, CALLS = [], DELS = [];
let ROLE = 'admin';
const NOW = Math.floor(Date.now() / 1000);
const CCP = {};   /* fake CompanyCam: id → { p, photos } */
function project(id, name, extra){ CCP[id] = { p: Object.assign({ id, name, status: 'active', created_at: NOW - 86400 * 40, updated_at: NOW - 86400 * 10 }, extra || {}), photos: [] }; return CCP[id]; }
function photos(pid, n, shareWith){ const l = []; for (let i = 0; i < n; i++) { const src = (shareWith && i === 0 ? shareWith : 'p' + pid + '-' + i) + '.jpg'; l.push({ id: pid * 1000 + i, project_id: pid, captured_at: NOW - 3600 * (i + 1), created_at: NOW - 3600 * (i + 1) + 5, creator_name: 'Sample PM', uris: [{ type: 'original', uri: 'https://img.cc.test/o/' + src }, { type: 'web', uri: 'https://img.cc.test/w/' + src }, { type: 'thumbnail', uri: 'https://img.cc.test/t/' + src }] }); } return l; }
const JPG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
function J(b, st){ return { ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null },
  arrayBuffer: async () => { const x = Buffer.isBuffer(b) ? b : Buffer.from(JSON.stringify(b)); return x.buffer.slice(x.byteOffset, x.byteOffset + x.length); } }; }
const nodeFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url), m0 = (init && init.method) || 'GET';
  if (u.startsWith('https://api.companycam.com/')) {
    CALLS.push(m0 + ' ' + u);
    if (m0 !== 'GET') throw new Error('CompanyCam called with ' + m0);
    const x = new URL(u), pg = +(x.searchParams.get('page') || 1), per = +(x.searchParams.get('per_page') || 50), p = x.pathname.replace(/^\/v2/, '');
    if (p === '/projects') { const l = Object.values(CCP).filter(z => !z.gone).map(z => Object.assign({}, z.p, { photo_count: z.photos.length + (z.countSkew || 0) })).sort((a, b) => b.updated_at - a.updated_at); return J(l.slice((pg - 1) * per, pg * per)); }
    const m = /^\/projects\/(\d+)\/photos$/.exec(p);
    if (m) { const z = CCP[m[1]]; if (!z || z.gone) return J({ error: 'not found' }, 404); return J(z.photos.slice((pg - 1) * per, pg * per)); }
    return J([]);
  }
  if (u.startsWith('https://img.cc.test/')) { CALLS.push('IMG ' + u); return J(Buffer.concat([JPG, Buffer.from(u.replace(/^https:\/\/img\.cc\.test\/[wt]\//, '') + (u.indexOf('/t/') > 0 ? '#t' : ''))])); }
  if (u === 'https://sb.test/storage/v1/object/crm-files') { if (m0 !== 'DELETE') throw new Error('storage ' + m0); const b = JSON.parse(init.body); DELS.push(b.prefixes.slice()); b.prefixes.forEach(n => { delete STORE[n]; }); return J(b.prefixes.map(n => ({ name: n }))); }
  if (u.startsWith('https://sb.test/storage/v1/object/crm-files/')) { const n = u.split('/').pop(); if (STORE[n]) return J({ error: 'Duplicate' }, 409); STORE[n] = Buffer.from(init.body); return J({}); }
  if (u.startsWith('https://sb.test/rest/v1/rpc/')) return J({}, 404);
  if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
    if (m0 === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { KV[r.key] = JSON.parse(JSON.stringify(r.value)); }); return J([], 201); }
    const d = decodeURIComponent(u), m = /key=in\.\(([^)]*)\)/.exec(d), e = /key=eq\.([^&]*)/.exec(d), lk = /key=like\.([^&]*)/.exec(d);
    const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : e ? [e[1]] : lk ? Object.keys(KV).filter(k => new RegExp('^' + lk[1].replace(/\*/g, '.*') + '$').test(k)) : [];
    return J(keys.filter(k => KV[k] !== undefined).map(k => ({ key: k, value: KV[k], updated_at: String(JSON.stringify(KV[k]).length) })));
  }
  if (u.startsWith('https://sb.test/auth/v1/user')) return J({ email: 'boss@grayco.test' });
  if (u.startsWith('https://sb.test/rest/v1/gc_staff')) return J([{ email: 'boss@grayco.test', role: ROLE, active: true }]);
  if (u.startsWith('https://sb.test/rest/v1/')) return J([]);
  if (u === 'https://crm.test/.netlify/functions/companycam-photos-background') return J({}, 202);
  throw new Error('unexpected ' + m0 + ' ' + u);
};
const CP = require(path.join(FN, '_lib/cc-photos.js'));
const WH = require(path.join(FN, 'companycam-webhook.js'));
const call = (q, body, m) => WH.handler({ httpMethod: m || 'POST', queryStringParameters: { proxy: q }, headers: { authorization: 'Bearer t', origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(body || {}) }).then(r => Object.assign({ statusCode: r.statusCode }, JSON.parse(r.body || '{}')));
const run = () => CP.run({ who: 'test', budgetMs: 60000 });
const row = pid => KV['ccidx:' + pid] || {};
const nG = pid => Object.keys(row(pid).g || {}).length;
const DAY = 864e5;
const clock = days => { process.env.CC_FAKE_NOW_MS = String(Date.now() + days * DAY); };

/* A0. prod-shaped: the coverage the window shows = the index */
if (PROD) {
  const st = PROD.ccidx_state, done = st.done, pids = Object.keys(done);
  const cov = CP.coverOf(st, PROD.ccidx_copy, {}, {}, [], {});
  const zero = pids.filter(p => !done[p].n), gone = pids.filter(p => done[p].gone), empty = zero.filter(p => !done[p].gone), errs = pids.filter(p => done[p].err);
  console.log('   prod-shaped: ' + pids.length + ' linked projects, ' + st.total.photos + ' photos; 0 photos: ' + zero.length + ' (gone in CompanyCam ' + gone.length + ', empty ' + empty.length + ', read errors ' + errs.length + '), queue ' + st.queue.length);
  ok('prod-shaped: every linked project has its coverage entry (count, last photo, gone)', Object.keys(cov.p).length === pids.length && pids.every(p => cov.p[p].n === (+done[p].n || 0) && cov.p[p].last === (+done[p].last || 0) && cov.p[p].gone === (done[p].gone ? 1 : 0)));
  ok('prod-shaped: 0-photo projects = deleted in CompanyCam (404) + empty in CompanyCam; none were left unread', zero.length === gone.length + empty.length && errs.length === 0 && st.queue.length === 0 && Object.keys(PROD).filter(k => /^ccidx:/.test(k)).every(k => PROD[k].done === true));
  ok('prod-shaped: the copy switch is off → "GrayCo copies are OFF" (copied 0)', cov.status.copy.on === false && cov.status.copy.copied === 0);
  const pj = PROD.projects, ld = PROD.leads, dead = {}; Object.keys(PROD.gc_tombstones || {}).forEach(k => { if (k.indexOf('projects:') === 0) dead[k.slice(9)] = 1; }); (PROD.gc_deleted_projects || []).forEach(x => { dead[String(x && typeof x === 'object' ? x.id : x)] = 1; });
  const lm = CP.linkedMap(pj, ld, dead);
  ok('prod-shaped: CompanyCam-only links keep every project the index has (none dropped by the stricter link rule)', pids.every(p => lm[p]), pids.filter(p => !lm[p]).join(','));
  const cm = CP.classMap(pj, ld, dead), cls = {}; Object.keys(cm).forEach(p => cm[p].forEach(x => { cls[x[1]] = (cls[x[1]] || 0) + 1; }));
  console.log('   prod-shaped job links by kind: ' + JSON.stringify(cls) + ' · projects that would be copied: ' + Object.keys(cm).filter(p => CP.copyOk(cm[p], {}, {})).length + ' of ' + Object.keys(cm).length);
  ok('prod-shaped: lost jobs\' projects and lead-only projects are not copied', Object.keys(cm).every(p => CP.copyOk(cm[p], {}, {}) === cm[p].some(x => ['active', 'bidding', 'completed'].includes(x[1]))));
} else console.log('   (no prod-shaped fixture — skipped)');

/* A1. copy rules */
project(801, 'Active Job').photos = photos(801, 6);
project(802, 'Lost Job').photos = photos(802, 4);
project(803, 'QB Vendor').photos = photos(803, 3);
project(804, 'Lead Only').photos = photos(804, 3);
project(805, 'Done Job').photos = photos(805, 2);
project(806, 'On Hold Job').photos = photos(806, 2);
project(807, 'Soon Lost').photos = photos(807, 5, 'p801-0');   /* its first picture = 801's first (the same file in storage) */
KV.projects = [
  { id: 'J1', name: 'Active Job', status: 'Active', ccProjectId: '801' },
  { id: 'J2', name: 'Lost Job', status: 'lost', ccProjectId: '802' },
  { id: 'J3', name: 'QB Vendor', status: 'Active', ccProjectId: '803' },
  { id: 'J5', name: 'Done Job', status: 'completed', ccProjectId: '805' },
  { id: 'J6', name: 'On Hold Job', status: 'on_hold', ccProjectId: '806' },
  { id: 'J7', name: 'Soon Lost', status: 'bidding', companyCamUrl: 'https://app.companycam.com/projects/807' },
  { id: 'J8', name: 'Hover Link', status: 'Active', sourceUrl: 'https://app.hover.to/projects/123456' }
];
KV.leads = [{ id: 'L4', name: 'Lead Only', status: 'New lead', ccProjectId: '804' }];
KV.ccidx_copy = { on: true, capGB: 80, by: 'boss@grayco.test', at: new Date().toISOString() };
ROLE = 'office';
const nj = await call('photojob', { act: 'notjob', job: 'J3', name: 'QB Vendor' });
ok('"Not a job" (office): saved in ccidx_notjob', nj.ok && KV.ccidx_notjob && KV.ccidx_notjob.J3);
let g = 0; while (g++ < 4) await run();
ok('copies only for jobs that are not lost: active 6, completed 2, on hold 2, bidding 5', nG(801) === 6 && nG(805) === 2 && nG(806) === 2 && nG(807) === 5, [801, 805, 806, 807].map(nG).join(','));
ok('…a lost job\'s photos are NOT copied', nG(802) === 0 && !CALLS.some(c => /^IMG .*p802-/.test(c)));
ok('…"Not a job" and a lead that was never a job: not copied', nG(803) === 0 && nG(804) === 0 && row(804).n === 3);
ok('another site\'s ".../projects/123456" link is not taken for a CompanyCam project', !CALLS.some(c => /projects\/123456/.test(c)) && !KV.ccidx_state.linked['123456']);
const covA = CP.coverOf(KV.ccidx_state, KV.ccidx_copy, KV.ccidx_keep, KV.ccidx_notjob, KV.ccidx_removed, KV.ccidx_request);
ok('coverage: indexed / copied per project', covA.p['801'].n === 6 && covA.p['801'].g === 6 && !covA.p['802'], JSON.stringify(covA.p['801']));
ok('meter: GB by kind (active / bidding / completed), nothing freed or waiting yet', covA.status.copy.meter.bytes.active > 0 && covA.status.copy.meter.bytes.completed > 0 && covA.status.copy.meter.bytes.bidding > 0 && covA.status.copy.meter.freedBytes === 0 && covA.status.copy.meter.pending.projects === 0, JSON.stringify(covA.status.copy.meter));
const back = await call('photojob', { act: 'isjob', job: 'J3' });
await run(); await run();
ok('"It is a job" takes it back → copied', back.ok && !KV.ccidx_notjob.J3 && nG(803) === 3, nG(803));

/* A2. a job becomes lost: copies stay, nothing deleted without the admin's click */
KV.projects.find(x => x.id === 'J7').status = 'lost';
KV.projects.find(x => x.id === 'J1').status = 'Lost';
const storeN0 = Object.keys(STORE).length;
await run();
const L7 = KV.ccidx_state.lost['807'];
ok('J7 lost: tracked from this run (since), its 5 copies stay', !!L7 && L7.jobs[0] === 'J7' && nG(807) === 5 && Object.keys(STORE).length === storeN0, JSON.stringify(L7));
clock(31); await run(); await run();
ok('31 days later, no click: nothing deleted (copies, files and index all stay)', nG(807) === 5 && nG(801) === 6 && Object.keys(STORE).length === storeN0 && DELS.length === 0 && row(807).n === 5);
const covB = CP.coverOf(KV.ccidx_state, KV.ccidx_copy, KV.ccidx_keep, KV.ccidx_notjob, KV.ccidx_removed, KV.ccidx_request);
const lb7 = covB.lost.find(x => x.pid === '807');
ok('the decision is due: lost 30+ days, 5 photos in GrayCo storage, waiting on the meter', !!lb7 && lb7.due && lb7.g === 5 && !lb7.kept && covB.status.copy.meter.pending.due >= 2, JSON.stringify(lb7));

/* A3. 📌 Keep sticks */
ROLE = 'office';
const kp = await call('photojob', { act: 'keep', jobs: ['J1'] });
ROLE = 'admin';
const dk = await call('photojob', { act: 'delete', jobs: ['J1'], confirm: true });
await run();
ok('📌 Keep (office): saved; a Delete after it is refused; the copies stay', kp.ok && KV.ccidx_keep.J1 && !dk.ok && nG(801) === 6 && DELS.length === 0, JSON.stringify(dk));
ok('…kept job: no longer waiting for a decision', CP.coverOf(KV.ccidx_state, KV.ccidx_copy, KV.ccidx_keep).lost.find(x => x.pid === '801').kept === true);

/* A4. 🗑 Delete: admin only, confirmed, GrayCo copies only */
ROLE = 'office';
const d0 = await call('photojob', { act: 'delete', jobs: ['J7'], confirm: true });
ROLE = 'admin';
const d1 = await call('photojob', { act: 'delete', jobs: ['J7'] });
ok('Delete: the office cannot (403); without the confirm it is refused', d0.statusCode === 403 && !d0.ok && d1.statusCode === 400 && !d1.ok);
const files807 = Object.values(row(807).g).flatMap(c => [c[0], c[1]]).filter(Boolean);
const shared = Object.values(row(801).g).flatMap(c => [c[0], c[1]]).filter(f => files807.includes(f));
const d2 = await call('photojob', { act: 'delete', jobs: ['J7'], confirm: true });
await run();
ok('Delete (admin, confirmed): the 5 copies of J7 removed from GrayCo storage', d2.ok && nG(807) === 0 && files807.filter(f => !shared.includes(f)).every(f => !STORE[f]) && DELS.length >= 1, JSON.stringify({ d2, n: nG(807), dels: DELS.length }));
ok('…a file another project also uses stays (the same picture in J1\'s project)', shared.length >= 1 && shared.every(f => STORE[f]) && !DELS.flat().some(f => shared.includes(f)), JSON.stringify(shared));
ok('…the index stays: J7\'s 5 photos still show from CompanyCam\'s links', row(807).n === 5 && row(807).ph.length === 5 && !row(807).g);
const log = KV.ccidx_removed || [];
ok('…the deletion log: job, count, bytes, when, why, who', log.length === 1 && log[0].jobs[0] === 'J7' && log[0].photos === 5 && log[0].bytes > 0 && !!log[0].at && /lost/.test(log[0].why) && log[0].by === 'boss@grayco.test', JSON.stringify(log[0]));
const m3 = CP.coverOf(KV.ccidx_state, KV.ccidx_copy, KV.ccidx_keep).status.copy.meter;
ok('…the meter shows what was freed', m3.freedBytes === log[0].bytes && m3.freedPhotos === 5, JSON.stringify(m3));
ok('CompanyCam was only ever READ (every call a GET; no delete anywhere but GrayCo\'s own crm-files)', CALLS.filter(c => !/^IMG /.test(c)).every(c => /^GET /.test(c)) && CALLS.length > 0);

delete process.env.CC_FAKE_NOW_MS;
/* A5. reopened → copied again */
KV.projects.find(x => x.id === 'J7').status = 'Active';
await run(); await run();
ok('J7 reopened: no longer lost, its photos are copied again', !KV.ccidx_state.lost['807'] && nG(807) === 5, nG(807));
/* lost again → never re-archived silently; un-lost after Keep is fine */
KV.projects.find(x => x.id === 'J1').status = 'Active'; await run();
ok('J1 un-lost: no decision any more, copies kept', !KV.ccidx_state.lost['801'] && nG(801) === 6);

/* A6. Re-index this job + the photo-count re-read */
CCP[801].photos = photos(801, 6).concat(photos(801, 8).slice(6));   /* 2 more photos, CompanyCam's "updated" not moved */
CCP[801].p.updated_at = NOW - 86400 * 20; CCP[801].countSkew = -2;   /* its list count unchanged: only the request makes it read */
const before = CALLS.filter(c => /projects\/801\/photos/.test(c)).length;
const ri = await call('photojob', { act: 'reindex', pids: ['801'], job: 'J1' });
await run();
ok('"Re-index this job": that project is read again in full', ri.ok && KV.ccidx_request.pids['801'] && CALLS.filter(c => /projects\/801\/photos/.test(c)).length > before && row(801).n === 8, row(801).n);
CCP[805].photos = photos(805, 3);   /* one more photo; the project's list entry says 3, the index has 2 */
await run();
ok('CompanyCam\'s photo count differs from the index → read again at once', row(805).n === 3 && KV.ccidx_state.done['805'].ccn === 3, JSON.stringify(KV.ccidx_state.done['805']));
const calls805 = CALLS.filter(c => /projects\/805\/photos/.test(c)).length; await run();
ok('…and not again once they agree', CALLS.filter(c => /projects\/805\/photos/.test(c)).length === calls805);
ROLE = 'office';
const cv = await call('photocover', null, 'GET');
ok('GET ?proxy=photocover (office): coverage + lost + log, no CompanyCam call', cv.ok && cv.p['801'] && Array.isArray(cv.lost) && cv.log.length === 1);
ROLE = 'pm';
const cvx = await call('photocover', null, 'GET');
ok('…a PM cannot (403)', cvx.statusCode === 403);
ROLE = 'admin';
global.fetch = nodeFetch;

/* ── part B: the browser ── */
if (!PROD) { console.log('B. skipped (no prod-shaped fixture)'); finish(); }
if (process.env.PHOTOCOVER_NOBROWSER === '1') { console.log('B. skipped (PHOTOCOVER_NOBROWSER=1)'); finish(); }
console.log('B. browser (offline harness; prod-shaped index)');
const { computer, signIn, sleep, cset, cget, waitFor } = await import(S + '/wN/harness_N.mjs');
const { seedDemo } = await import(S + '/wDEMO/seed.mjs');
seedDemo();
const st = JSON.parse(JSON.stringify(PROD.ccidx_state)), done = st.done;
const byN = Object.keys(done).filter(p => done[p].n > 0).sort((a, b) => done[b].n - done[a].n);
const TOP = byN[0], SECOND = byN[1], GONE = Object.keys(done).find(p => done[p].gone), EMPTY = Object.keys(done).find(p => !done[p].n && !done[p].gone);
const PJ = cget('projects');
const setP = (id, o) => Object.assign(PJ.find(p => p.id === id), o);
setP('P1', { ccProjectId: TOP });          /* a job with many indexed photos, copies OFF */
setP('P2', { ccProjectId: GONE });         /* its CompanyCam project was deleted */
setP('P3', { ccProjectId: EMPTY, name: 'Demo Vendor Co' });   /* empty project — a QuickBooks vendor record */
setP('P4', { address: '4 Flood Ct, Germantown TN 38138' });   /* not linked */
setP('P5', { status: 'lost', ccProjectId: SECOND });          /* lost 40 days ago, with GrayCo copies */
cset('projects', PJ);
st.lost = { [SECOND]: { since: new Date(Date.now() - 40 * DAY).toISOString(), jobs: ['P5'], names: ['Demo Church Roof'] } };
Object.assign(done[SECOND], { g: 7, gb: 7e6 });
cset('ccidx_state', st); cset('ccidx', PROD.ccidx); cset('ccvis', PROD.ccvis || { since: new Date().toISOString() });
[TOP, SECOND, GONE, EMPTY].forEach(p => cset('ccidx:' + p, PROD['ccidx:' + p]));
const topN = PROD['ccidx:' + TOP].ph.length;
const posts = [];
const CCLIST = [{ id: '990001', name: 'Water loss - Germantown', address: '4 Flood Ct, Germantown, TN, 38138', street: '4 Flood Ct', zip: '38138', photo_count: 12, contact: { name: 'Sample Insured' }, updated_at: NOW },
  { id: '990002', name: 'Somebody Else', address: '77 Other Rd, Memphis, TN', photo_count: 3, updated_at: NOW },
  { id: '990003', name: 'Demo Water Loss', address: '', photo_count: 0, updated_at: NOW }];
const c = await computer('PCOV', { build });
const p = c.page();
p.on('dialog', d => d.accept().catch(() => {}));   /* the harness may have answered it already */
await c.ctx.route(u => new URL(u).host === 'img.companycam.com', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
await c.ctx.route(u => /\/\.netlify\/functions\/companycam-webhook/.test(u), async r => {
  const u = new URL(r.request().url()), px = u.searchParams.get('proxy'), Jr = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (r.request().method() === 'POST') {
    const b = JSON.parse(r.request().postData() || '{}'); posts.push({ px, b });
    if (px === 'photojob' && (b.act === 'notjob' || b.act === 'isjob')) { const n = Object.assign({}, cget('ccidx_notjob') || {}); if (b.act === 'notjob') n[b.job] = { at: new Date().toISOString(), by: 'test' }; else delete n[b.job]; cset('ccidx_notjob', n); }
    if (px === 'photojob' && b.act === 'keep') { const k = Object.assign({}, cget('ccidx_keep') || {}); b.jobs.forEach(j => { k[j] = { at: new Date().toISOString(), by: 'test' }; }); cset('ccidx_keep', k); }
    if (px === 'photojob' && b.act === 'reindex') { const q = Object.assign({}, cget('ccidx_request') || {}); q.pids = Object.assign({}, q.pids); b.pids.forEach(x => { q.pids[x] = new Date().toISOString(); }); cset('ccidx_request', q); }
    return Jr({ ok: true, message: 'ok' });
  }
  if (px === 'photocover') return Jr(Object.assign({ ok: true }, CP.coverOf(cget('ccidx_state'), cget('ccidx_copy'), cget('ccidx_keep'), cget('ccidx_notjob'), cget('ccidx_removed'), cget('ccidx_request'))));
  if (px === 'recent') return Jr({ ok: true, projects: CCLIST });
  if (px === 'status') return Jr({ ok: true, verified: true, reason: 'ok', source: 'env', status: 200 });
  if (px === 'sync') return Jr({ ok: true, tokenSet: true, health: { at: new Date().toISOString(), ok: true }, review: [], photoIndex: CP.statusOf(cget('ccidx_state'), cget('ccidx_copy')) });
  return Jr({ ok: true, projects: [] });
});
await signIn(c, 'wjohnson@grayco-cs.com', 12000);
await waitFor(c, () => !!(window._gcPhotoCover && window._crm && (window._crm.projects || []).length), null, 30000, 200);
/* GrayCo Photos: every indexed photo of a linked job, copies OFF */
await p.evaluate(() => window._setView('allphotos'));
await waitFor(c, () => !!document.querySelector('#gcuOv .pv-card'), null, 30000, 200);
ok('GrayCo Photos home: a "📸 Photo coverage" button (admin)', await p.evaluate(() => !!document.querySelector('#gcuOv [data-a="pcover"]')));
await p.evaluate(() => window._gcPhotos.open('P1'));
const GRID = '#gcuOv .gcu-grid [data-src-kind="cc"]';
const shown = await waitFor(c, n => { const l = document.querySelectorAll('#gcuOv .gcu-grid [data-src-kind="cc"]').length; const more = document.querySelector('#gcuOv [data-a="jmore"]'); const m = more ? +(/\((\d+) more\)/.exec(more.textContent) || [0, 0])[1] : 0; return l && l + m === n ? { l, m } : null; }, topN, 30000, 250);
ok('copies OFF: GrayCo Photos shows every indexed photo of the linked job (' + topN + ' from the prod-shaped index, CompanyCam links)', !!shown, JSON.stringify(shown) + ' want ' + topN);
const viaCC = await p.evaluate(g => Array.from(document.querySelectorAll(g)).slice(0, 5).every(b => { const i = b.querySelector('img'); return /img\.companycam\.com/.test(i.getAttribute('data-src') || i.getAttribute('src') || '') && !i.getAttribute('data-ref'); }), GRID);
ok('…from CompanyCam\'s own links (no GrayCo copy needed)', viaCC);
await p.evaluate(() => window._gcPhotos.close());
/* the coverage window */
await p.evaluate(() => window._gcPhotoCover.open());
const sts = await waitFor(c, () => { const l = Array.from(document.querySelectorAll('#gc-photocover-ov [data-pc-row]')); return l.length >= 4 ? l.map(x => x.getAttribute('data-pc-row') + ':' + x.getAttribute('data-st')) : null; }, null, 20000, 250);
const order = (sts || []).map(x => x.split(':')[1]);
const at = id => (sts || []).findIndex(x => x.indexOf(id + ':') === 0);
ok('coverage rows: P2 gone, P3 empty, P4 not linked, P1 ok', (sts || []).includes('P2:gone') && (sts || []).includes('P3:empty') && (sts || []).includes('P4:none') && (sts || []).includes('P1:ok'), JSON.stringify(sts));
ok('…problems first (gone → empty → not linked → ok)', at('P2') < at('P3') && at('P3') < at('P4') && at('P4') < at('P1') && order.indexOf('ok') > order.lastIndexOf('none'), JSON.stringify(sts));
ok('…lost job P5 is not an active / bidding row', at('P5') < 0);
const p1n = await p.evaluate(() => document.querySelector('#gc-photocover-ov [data-pc-row="P1"] [data-pc-n]').textContent);
ok('…P1: photos indexed = the index (' + done[TOP].n + '), copied "off"', +p1n === done[TOP].n && await p.evaluate(() => document.querySelector('#gc-photocover-ov [data-pc-row="P1"] [data-pc-g]').textContent === 'off'), p1n);
const copyTxt = await p.evaluate(() => document.querySelector('#gc-photocover-ov [data-pc-copy]').textContent);
ok('the copy switch, plainly: "GrayCo copies are OFF until Supabase Pro — photos show from CompanyCam links"', copyTxt === 'GrayCo copies are OFF until Supabase Pro — photos show from CompanyCam links', copyTxt);
/* Link: suggestions, a confirm step, no auto-linking */
await p.click('#gc-photocover-ov [data-pc="link"][data-job="P4"]');
const sug = await waitFor(c, () => { const l = Array.from(document.querySelectorAll('#gc-photocover-ov [data-pc-sug]')).map(x => x.getAttribute('data-pc-sug')); return l.length ? l : null; }, null, 10000, 200);
ok('Link: suggestions by address and name (same address first; an unrelated project is not suggested)', !!sug && sug[0] === '990001' && !sug.includes('990002'), JSON.stringify(sug));
await p.click('#gc-photocover-ov [data-pc="choose"][data-cc="990001"]');
const conf = await waitFor(c, () => { const b = document.querySelector('#gc-photocover-ov [data-pc-confirm]'); return b ? b.textContent : null; }, null, 5000, 150);
const linkedYet = await p.evaluate(() => { const j = window._crm.projects.find(x => x.id === 'P4'); return !!(j.ccProjectId || j.ccMoreIds); });
ok('…choosing asks to confirm first — nothing linked yet', /Link CompanyCam project/.test(conf || '') && /12 photos/.test(conf || '') && !linkedYet && !posts.some(x => x.px === 'review'), conf);
await p.click('#gc-photocover-ov [data-pc="linkyes"]');
const linked = await waitFor(c, () => { const j = window._crm.projects.find(x => x.id === 'P4'); return j && j.ccProjectId === '990001' ? j.ccLinkedBy || 'yes' : null; }, null, 10000, 200);
for (let i = 0; i < 40 && !(posts.some(x => x.px === 'review') && posts.some(x => x.px === 'photojob' && x.b.act === 'reindex')); i++) await sleep(250);   /* the server calls follow the job's save (disk + cloud) */
ok('…after "Yes, link it": the job carries the CompanyCam link, the server is told and re-reads it', !!linked && posts.some(x => x.px === 'review' && x.b.act === 'link' && x.b.cc === '990001' && x.b.job === 'P4') && posts.some(x => x.px === 'photojob' && x.b.act === 'reindex' && x.b.pids[0] === '990001'), JSON.stringify(posts.map(x => x.px + ':' + x.b.act)));
/* Re-index */
await p.click('#gc-photocover-ov [data-pc="reindex"][data-job="P1"]');
await waitFor(c, () => /ok/.test((document.querySelector('#gc-photocover-ov [data-pc-msg]') || {}).textContent || '') ? 1 : null, null, 8000, 200);
ok('"⟳ Re-index this job" asks the server to re-read its project', posts.some(x => x.px === 'photojob' && x.b.act === 'reindex' && x.b.job === 'P1' && x.b.pids[0] === TOP));
/* Not a job */
await p.click('#gc-photocover-ov [data-pc="notjob"][data-job="P3"]');
const hid = await waitFor(c, () => !document.querySelector('#gc-photocover-ov [data-pc-row="P3"]') && document.querySelector('#gc-photocover-ov [data-pc="hidden"]') ? document.querySelector('#gc-photocover-ov [data-pc="hidden"]').textContent : null, null, 10000, 200);
ok('"Not a job" hides the job from coverage ("Show the 1 marked Not a job")', !!hid && /1 marked/.test(hid) && posts.some(x => x.px === 'photojob' && x.b.act === 'notjob' && x.b.job === 'P3'), hid);
/* the lost job's decision: To-Do card, Keep, Delete (confirmed) */
const todo = await p.evaluate(() => { try { return (window._gcJOfficeTasks() || []).filter(t => /^photocover_lost_/.test(t.id)).map(t => t.label); } catch (e) { return 'err ' + e.message; } });
ok('the admin\'s To-Do: "📷 <job> was lost 30 days ago — n photos, size in GrayCo storage"', Array.isArray(todo) && todo.length === 1 && /Demo Church Roof was lost 30 days ago — 7 photos, 7 MB in GrayCo storage/.test(todo[0]), JSON.stringify(todo));
await p.click('#gc-photocover-ov [data-pc="sec"][data-v="lost"]');
const lostRow = await waitFor(c, () => { const b = document.querySelector('#gc-photocover-ov [data-pc-lost="P5"]'); return b ? b.textContent : null; }, null, 5000, 150);
ok('lost jobs: Keep / Delete, Select all', /Keep photos/.test(lostRow || '') && /Delete photos/.test(lostRow || '') && await p.evaluate(() => !!document.querySelector('#gc-photocover-ov [data-pc-selall]')), lostRow);
await p.click('#gc-photocover-ov [data-pc-selall]');
await p.click('#gc-photocover-ov [data-pc="delsel"]');
await waitFor(c, () => 1, null, 800, 100);
ok('🗑 Delete photos (selected): confirmed first, then asked of the server with confirm:true', posts.some(x => x.px === 'photojob' && x.b.act === 'delete' && x.b.confirm === true && x.b.jobs[0] === 'P5'), JSON.stringify(posts.filter(x => x.b.act === 'delete')));
await p.click('#gc-photocover-ov [data-pc="keep"][data-job="P5"]').catch(() => {});
const kept = await waitFor(c, () => /Photos kept/.test((document.querySelector('#gc-photocover-ov [data-pc-lost="P5"]') || {}).textContent || '') ? 1 : null, null, 8000, 200);
ok('📌 Keep photos: saved, the card says "Photos kept" and leaves the To-Do', !!kept && posts.some(x => x.b.act === 'keep' && x.b.jobs[0] === 'P5') && (await p.evaluate(() => (window._gcJOfficeTasks() || []).filter(t => /^photocover_lost_/.test(t.id)).length)) === 0);
const arch = await waitFor(c, () => { const j = window._crm.projects.find(x => x.id === 'P5'); return j && j.archived === true ? j.archivedWhy : null; }, null, 8000, 200);
ok('the lost job is archived (the CRM\'s archived flag, why "lost", restorable)', arch === 'lost', arch);
/* the copy box in 📸 CompanyCam sync status */
await p.evaluate(() => { window._gcPhotoCover.close(); window._gcCCSyncPanel(); });
const box = await waitFor(c, () => { const b = document.querySelector('#gc-ccsync-ov [data-ccs-lostrule]'); return b ? b.textContent : null; }, null, 15000, 250);
ok('copy box: the lost-job rule and the trade-off in plain words', /nothing is deleted without that click/.test(box || '') && /Once CompanyCam is cancelled, deleted photos can't be recovered/.test(box || '') && /OFF until Supabase Pro/.test(box || ''), box);
ok('copy box: the storage meter by kind of job', await p.evaluate(() => /active jobs .* completed .* lost .* freed by lost-job removals/.test((document.querySelector('#gc-ccsync-ov [data-ccs-pcmeter]') || {}).textContent || '')));
const errs = c.errs.filter(e => !/ResizeObserver/.test(e));
ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await c.b.close();
finish();
function finish(){ console.log('PHOTOCOVER ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); }
