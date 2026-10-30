/* patch CCPHOTOS — the CompanyCam photo index on the server, against a FAKE CompanyCam + Supabase (made-up projects / photos only).
   node tools/tests/test_CCPHOTOS_fn.mjs
     1. every photo of every linked project is indexed (several pages; jobs, leads, PRJcc_ jobs; unlinked / deleted not read)
     2. incremental after: only the changed project, only its first page
     3. a backfill that runs out of time keeps its place and the next runs finish it — no photo twice
     4. CompanyCam's 429: a short Retry-After is waited out; a long one stops the run until then
     5. an expired link: the 12-hour re-read takes CompanyCam's fresh links
     6. companycam-sync links by PO / address, archived 2026 projects go on their job, uncertain → the review list, no duplicate jobs
     7. the admin's "⟳ Index all photos now" (webhook ?proxy=photoindex) → the signed background run; a forged hand-off is refused
   No network. The token is made up and never printed. */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } }

const TOKEN = 'T'.repeat(43);
process.env.COMPANYCAM_TOKEN = TOKEN;
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-test-key';
process.env.URL = 'https://crm.test';
process.env.CC_BACKOFF_MS = '0';
process.env.CC_PHOTO_MIN_MS = '0';
const T = s => Math.floor(Date.parse(s) / 1000);
const NOW = Math.floor(Date.now() / 1000);

/* ── the fake CompanyCam ── */
let GEN = 1;                         /* link generation: an "expired" link is one of an older generation */
const CCP = {};                      /* project id → { p, photos: [] } */
function mkPhotos(pid, n, start){ const out = []; for (let i = 0; i < n; i++) { const id = pid * 10000 + (start || 0) + i; out.push(mkPhoto(pid, id, NOW - 86400 * 30 + id % 10000 * 60)); } return out; }
function mkPhoto(pid, id, cap){
  const src = 'aHR0cHM6Ly9jb21wYW55Y2FtLXBlbmRpbmcuczMuYW1hem9uYXdzLmNvbS9' + Buffer.from('photo-' + id).toString('base64').replace(/=/g, '') + '.jpg';
  return { id, project_id: pid, captured_at: cap, created_at: cap + 5, creator_name: id % 3 ? 'Nick Field' : 'Sam Roof', description: id % 7 === 0 ? 'After the tear-off' : '',
    coordinates: { lat: 35.1 + pid / 1e4, lon: -89.9 },
    uris: [{ type: 'original', uri: 'https://img.cc.test/sig' + GEN + '/' + src }, { type: 'web', uri: 'https://img.cc.test/sig' + GEN + '/rs:fit:1024/' + src }, { type: 'thumbnail', uri: 'https://img.cc.test/sig' + GEN + '/rs:fit:250/' + src }] };
}
function project(id, name, extra){ CCP[id] = { p: Object.assign({ id, name, status: 'active', created_at: T('2026-03-01T00:00:00Z'), updated_at: NOW - 86400 * 20, address: {} }, extra || {}), photos: [] }; return CCP[id]; }
project(501, 'Henderson Kitchen').photos = mkPhotos(501, 250);
project(502, 'Lopez Roof').photos = mkPhotos(502, 40);
project(503, 'Lead Lane').photos = mkPhotos(503, 120);
project(504, 'Deleted Job').photos = mkPhotos(504, 30);
project(505, 'Server Made').photos = [];
project(506, 'Nobody Links Me').photos = mkPhotos(506, 10);
const calls = []; let rate = null;   /* rate = { path: RegExp, n: times, after: seconds } */
function J(b, st, hd){ return { ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: k => (hd || {})[String(k).toLowerCase()] || null } }; }
function ccAnswer(u){
  const url = new URL(u), p = url.pathname.replace(/^\/v2/, ''), page = +(url.searchParams.get('page') || 1), per = +(url.searchParams.get('per_page') || 50);
  calls.push(p + '?page=' + page);
  if (rate && rate.path.test(p) && rate.n > 0) { rate.n--; return J({ error: 'Too many requests' }, 429, { 'retry-after': String(rate.after) }); }
  if (p === '/company') return J({ id: 1, name: 'Demo Co' });
  if (p === '/projects') { const l = Object.values(CCP).map(x => x.p).sort((a, b) => b.updated_at - a.updated_at); return J(l.slice((page - 1) * per, page * per)); }
  let m = /^\/projects\/(\d+)\/photos$/.exec(p);
  if (m) { const x = CCP[+m[1]]; if (!x) return J({ error: 'not found' }, 404); const l = x.photos.slice().sort((a, b) => b.captured_at - a.captured_at); return J(l.slice((page - 1) * per, page * per)); }
  m = /^\/users\/\d+$/.exec(p); if (m) return J({}, 404);
  return J({ error: 'unknown ' + p }, 404);
}
/* ── the fake Supabase gc_kv + our own site ── */
const KV = {}; const kvWrites = []; const kicks = []; const kvReads = [];
/* a row's "updated_at": changes whenever its value does */
function verOf(k){ const t = JSON.stringify(KV[k]); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ':' + h; }
let bgHandler = null;
global.fetch = async function(url, init){
  const u = String(url);
  if (u.indexOf(TOKEN) >= 0) throw new Error('the token is in a URL');
  if (u.startsWith('https://api.companycam.com/v2/')) {
    const auth = init && init.headers && (init.headers.Authorization || init.headers.authorization);
    if (auth !== 'Bearer ' + TOKEN) return J({ error: 'unauthorized' }, 401);
    return ccAnswer(u);
  }
  if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
    if (init && init.method === 'POST') { const rows = JSON.parse(init.body); kvWrites.push(rows.map(r => r.key)); rows.forEach(r => { KV[r.key] = JSON.parse(JSON.stringify(r.value)); }); return J([], 201); }
    const d = decodeURIComponent(u), m = /key=in\.\(([^)]*)\)/.exec(d), e = /key=eq\.([^&]*)/.exec(d), lk = /key=like\.([^&]*)/.exec(d);
    const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : e ? [e[1]] : lk ? Object.keys(KV).filter(k => new RegExp('^' + lk[1].replace(/\*/g, '.*') + '$').test(k)) : [];
    if (/select=[^&]*value/.test(d)) kvReads.push(...keys);
    return J(keys.filter(k => KV[k] !== undefined).map(k => ({ key: k, value: KV[k], updated_at: verOf(k) })));
  }
  if (u.startsWith('https://sb.test/auth/v1/user')) return J({ email: 'boss@grayco.test' });
  if (u.startsWith('https://sb.test/rest/v1/gc_staff')) return J([{ email: 'boss@grayco.test', role: 'admin', active: true }]);
  if (u.startsWith('https://sb.test/rest/v1/')) return J([]);
  if (u === 'https://crm.test/.netlify/functions/companycam-photos-background') {
    const h = init.headers; kicks.push({ ts: h['x-ccp-ts'], sig: h['x-ccp-sig'] });
    if (bgHandler) setTimeout(() => bgHandler({ httpMethod: 'POST', headers: h, body: init.body }).then(r => { kicks[kicks.length - 1].status = r.statusCode; }), 0);
    return J({}, 202);
  }
  throw new Error('unexpected ' + u);
};
const CP = require(path.join(FN, '_lib/cc-photos.js'));
function rowOf(pid){ return KV['ccidx:' + pid]; }
function idsOf(pid){ return CP.unpackRow(rowOf(pid)).map(x => x.id); }
const uniq = l => new Set(l).size === l.length;

/* ── 1. backfill: all photos of all linked projects ── */
console.log('1. backfill');
KV.projects = [
  { id: 'J1', name: 'Henderson Kitchen', status: 'Active', ccProjectId: '501' },
  { id: 'J2', name: 'Lopez Roof', status: 'bidding', ccamUrl: 'https://app.companycam.com/projects/502' },
  { id: 'J4', name: 'Deleted Job', status: 'Active', ccProjectId: '504', deleted: true },
  { id: 'PRJcc_505', name: 'Server Made', status: 'bidding' },
  { id: 'J6', name: 'No CompanyCam', status: 'Active' }
];
KV.leads = [{ id: 'L3', name: 'Lead Lane', status: 'New lead', ccProjectId: '503' }];
const r1 = await CP.run({ who: 'test', budgetMs: 60000 });
ok('run ok', r1.ok && !r1.stop, JSON.stringify(r1));
ok('501: all 250 photos over 3 pages', rowOf(501) && rowOf(501).n === 250 && rowOf(501).done === true && uniq(idsOf(501)), rowOf(501) && rowOf(501).n);
ok('502 (linked by its CompanyCam link): 40', rowOf(502) && rowOf(502).n === 40);
ok('503 (a lead\'s project): 120', rowOf(503) && rowOf(503).n === 120 && rowOf(503).kind === 'lead');
ok('505 (a PRJcc_ job): indexed, no photos', rowOf(505) && rowOf(505).n === 0 && rowOf(505).done === true);
ok('a deleted job\'s and an unlinked project are not read', !rowOf(504) && !rowOf(506) && !calls.some(c => /\/projects\/50[46]\//.test(c)));
ok('the job id is on each project', rowOf(501).job === 'J1' && rowOf(502).job === 'J2' && rowOf(505).job === 'PRJcc_505');
const ph = CP.unpackRow(rowOf(501));
const src1 = CCP[501].photos.find(p => String(p.id) === ph[0].id);
ok('grid link = CompanyCam thumbnail, full screen = web (no original kept)', ph[0].thumb === src1.uris[2].uri && ph[0].web === src1.uris[1].uri && JSON.stringify(rowOf(501)).indexOf('original') < 0 && JSON.stringify(rowOf(501)).indexOf(src1.uris[0].uri) < 0);
ok('newest first, creator and tag kept', ph[0].at >= ph[1].at && ph[0].by && CP.unpackRow(rowOf(501)).some(x => x.tag === 'After'));
const bytes = JSON.stringify(rowOf(501).ph).length / 250;
ok('small: under 330 bytes a photo in the index (' + Math.round(bytes) + ')', bytes < 330);
const sum = KV.ccidx;
ok('summary: every linked project with its count and cover', sum && sum.p['501'][0] === 250 && sum.p['503'][0] === 120 && sum.p['505'][0] === 0 && sum.n === 410 && /^https:\/\/img\.cc\.test\//.test(sum.p['501'][2]));
ok('summary feed: the newest photos across projects (40 a project, 150 at most)', sum.feed.length === 120 && sum.feed[0][2] >= sum.feed[119][2] && new Set(sum.feed.map(x => x[0])).size === 3);
const st1 = KV.ccidx_state;
ok('progress: projects done / total, photos', st1.prog && st1.prog.total === 4 && st1.prog.done === 4 && st1.prog.photos === 410 && !!st1.prog.doneAt, JSON.stringify(st1.prog));
ok('lock released, bookmark set (from now on incremental)', !st1.lock && st1.cursor > 0 && !st1.queue.length);
ok('the token is stored nowhere', JSON.stringify(KV).indexOf(TOKEN) < 0);
const s1 = CP.statusOf(st1);
ok('status for the CRM window', s1.linked === 4 && s1.indexed === 4 && s1.photos === 410 && s1.queue === 0);

/* ── 2. incremental ── */
console.log('2. incremental');
calls.length = 0;
CCP[502].photos.push(...mkPhotos(502, 3, 900).map(p => Object.assign(p, { captured_at: NOW - 60 })));
CCP[502].p.updated_at = NOW;
const r2 = await CP.run({ who: 'test', budgetMs: 60000 });
ok('502 has its 3 new photos (43), newest first', rowOf(502).n === 43 && idsOf(502)[0] === String(502 * 10000 + 900) || idsOf(502).slice(0, 3).every(id => +id >= 502 * 10000 + 900), JSON.stringify(idsOf(502).slice(0, 3)));
ok('only the changed project was read, one page', !calls.some(c => /\/projects\/50[13]\//.test(c)) && calls.filter(c => /\/projects\/502\/photos/.test(c)).length === 1, calls.join(' '));
ok('nothing else read again', r2.projects === 1 && r2.photos === 3, JSON.stringify(r2));
kvReads.length = 0;
const r2b = await CP.run({ who: 'test', budgetMs: 60000 });
ok('a run with nothing new reads no photos', r2b.projects === 0 && r2b.photos === 0);
ok('…nor the job list (unchanged: its time stamps only) nor the summary', r2b.jobsCached === true && !kvReads.includes('projects') && !kvReads.includes('leads') && !kvReads.includes('ccidx'), kvReads.join());

/* ── 3. a backfill that runs out of time resumes ── */
console.log('3. resume after a timeout');
for (const k of Object.keys(KV)) if (/^ccidx/.test(k)) delete KV[k];
process.env.CC_PHOTO_MIN_MS = '1300';     /* slow CompanyCam: 2 pages a run */
let runs = 0, stops = 0, rr, mid = false;
do { rr = await CP.run({ who: 'test', budgetMs: 4000 }); if (rowOf(501) && rowOf(501).done === false && rowOf(501).next > 1) mid = true; if (process.env.DBG) console.log('run', runs, JSON.stringify(rr), rowOf(501) && [rowOf(501).done, rowOf(501).next, rowOf(501).n]); runs++; if (rr.stop === 'time') stops++; } while (rr.more && runs < 20);
process.env.CC_PHOTO_MIN_MS = '0';
ok('it stopped for time and went on (' + runs + ' runs, ' + stops + ' stopped)', stops >= 2 && !rr.more, JSON.stringify(rr));
ok('…in the middle of a project, from the page it reached', mid);
ok('every photo, none twice', rowOf(501).n === 250 && uniq(idsOf(501)) && rowOf(502).n === 43 && rowOf(503).n === 120 && KV.ccidx.n === 413, [rowOf(501).n, rowOf(502).n, rowOf(503).n, KV.ccidx.n].join());
ok('progress reached its total', KV.ccidx_state.prog.done === KV.ccidx_state.prog.total && !!KV.ccidx_state.prog.doneAt, JSON.stringify(KV.ccidx_state.prog));

/* ── 4. 429 ── */
console.log('4. CompanyCam rate limit');
calls.length = 0;
CCP[501].p.updated_at = NOW + 5; CCP[501].photos.push(mkPhoto(501, 501 * 10000 + 5000, NOW));
rate = { path: /\/projects\/501\/photos/, n: 1, after: 1 };
const r4 = await CP.run({ who: 'test', budgetMs: 60000 });
ok('a short Retry-After is waited out and the photo comes in', r4.limited === 1 && !r4.stop && rowOf(501).n === 251, JSON.stringify(r4));
CCP[502].p.updated_at = NOW + 9; CCP[502].photos.push(mkPhoto(502, 502 * 10000 + 5000, NOW));
rate = { path: /\/projects\/502\/photos/, n: 1, after: 300 };
const r4b = await CP.run({ who: 'test', budgetMs: 20000 });
ok('a long Retry-After stops the run and is remembered', r4b.stop === 'rate' && !!KV.ccidx_state.wait && KV.ccidx_state.queue.some(q => q.pid === '502'), JSON.stringify(r4b));
const r4c = await CP.run({ who: 'test', budgetMs: 20000 });
ok('…the next run waits (no CompanyCam call)', r4c.waiting === true && rowOf(502).n === 43);
KV.ccidx_state.wait = new Date(Date.now() - 1000).toISOString();
const r4d = await CP.run({ who: 'test', budgetMs: 20000 });
ok('…and after the wait it goes on', !r4d.stop && rowOf(502).n === 44 && !KV.ccidx_state.wait, JSON.stringify(r4d));

/* ── 5. an expired link ── */
console.log('5. expired links');
GEN = 2;
CCP[503].photos = CCP[503].photos.map(p => mkPhoto(503, p.id, p.captured_at));   /* CompanyCam hands out new links */
ok('before: the stored links are the old ones', CP.unpackRow(rowOf(503))[0].thumb.indexOf('/sig1/') > 0);
const old = new Date(Date.now() - 13 * 3600e3).toISOString();
KV.ccidx_state.done['503'].full = old; KV.ccidx_state.done['503'].at = old;
const r5 = await CP.run({ who: 'test', budgetMs: 60000 });
const p503 = CP.unpackRow(rowOf(503));
ok('the 12-hour re-read takes the fresh links', r5.projects >= 1 && p503.every(x => x.thumb.indexOf('/sig2/') > 0 && x.web.indexOf('/sig2/') > 0) && p503.length === 120);
ok('the summary\'s feed and cover follow', KV.ccidx.feed.filter(x => x[0] === '503').every(x => x[4].indexOf('/sig2/') > 0));
CCP[503].photos = CCP[503].photos.slice(0, 100);   /* 20 deleted in CompanyCam */
KV.ccidx_state.done['503'].full = old;
await CP.run({ who: 'test', budgetMs: 60000 });
ok('photos deleted in CompanyCam drop on the re-read', rowOf(503).n === 100);

/* ── 6. companycam-sync: linking ── */
console.log('6. linking (companycam-sync)');
for (const k of Object.keys(CCP)) delete CCP[k];
const C = (id, name, addr, extra) => project(id, name, Object.assign({ address: addr ? { street_address_1: addr, city: 'Bartlett', state: 'TN' } : {}, created_at: T('2026-05-01T00:00:00Z'), updated_at: NOW - 100 }, extra || {}));
KV.projects = [
  { id: 'JP', name: 'Smith Residence', po: 'Q368', address: '', status: 'Active', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'JA', name: 'Garcia Kitchen', po: 'T724', address: '77 Pine Ln, Bartlett, TN', status: 'Active', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'JT1', name: 'Twin Oaks', po: 'A174', address: '10 Twin Rd, Bartlett, TN', status: 'Active', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'JT2', name: 'Twin Oaks', po: 'V614', address: '12 Twin Rd, Bartlett, TN', status: 'Active', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'JC', name: 'Done Deal', po: 'V221', address: '5 Finish St, Bartlett, TN', status: 'completed', createdAt: '2026-02-01T00:00:00Z', completionDate: '2026-06-01' },
  { id: 'JD', name: 'Old Timer', po: 'F673', address: '9 Elder Ave, Bartlett, TN', status: 'Active', createdAt: '2026-01-05T00:00:00Z' },
  { id: 'JX', name: 'PO Conflict', po: 'P976', address: '1 Main St, Bartlett, TN', status: 'Active', createdAt: '2026-04-01T00:00:00Z' }
];
KV.leads = []; KV.customers = []; KV.users = []; KV.gc_epoch = { epoch: 'e1' };
C(601, 'Q368 - Smith roof', '');                          /* PO in the name, no address */
C(602, 'Garcia', '77 Pine Lane');                         /* the address */
C(603, 'Twin Oaks', '');                                  /* the name of two jobs */
C(604, 'Finish', '5 Finish Street', { status: 'archived', created_at: T('2026-03-01T00:00:00Z') });   /* archived 2026 */
C(605, 'Elder', '9 Elder Avenue', { created_at: T('2025-09-01T00:00:00Z') });                         /* before 2026 */
C(606, 'Brand New', '400 New Rd');                        /* nobody's: a new job */
C(607, 'P976 Main', '2 Other Rd');                        /* PO of a job at another address */
const SYNC = require(path.join(FN, 'companycam-sync.js'));
const n0 = KV.projects.length;
const s1r = await SYNC._t.run();
const P = id => KV.projects.find(p => p.id === id);
const rev = () => KV.gc_cc_review || [];
ok('sync ran (full re-read for the new rule)', s1r.ok && s1r.full === true, JSON.stringify({ ok: s1r.ok, full: s1r.full }));
ok('PO in the project name → that job', P('JP').ccProjectId === '601');
ok('same address → that job', P('JA').ccProjectId === '602');
ok('archived 2026 project at a finished job\'s address → on that job', P('JC').ccProjectId === '604');
ok('a name two jobs share: on the review list with both, linked to neither', !P('JT1').ccProjectId && !P('JT2').ccProjectId && rev().some(x => x.cc === '603' && x.jobs && x.jobs.length === 2));
ok('a project made before 2026: never linked by itself, on the list for one tap', !P('JD').ccProjectId && rev().some(x => x.cc === '605' && x.jobs && x.jobs[0].id === 'JD'));
ok('a PO whose job is at another address: asked, not linked', !P('JX').ccProjectId && rev().some(x => x.cc === '607' && x.jobs && x.jobs[0].id === 'JX'));
ok('a project nobody has becomes ONE new job', KV.projects.filter(p => p.id === 'PRJcc_606').length === 1 && KV.projects.length === n0 + 1, KV.projects.map(p => p.id).join());
const s2r = await SYNC._t.run();
ok('second run: no duplicate jobs, links unchanged', KV.projects.length === n0 + 1 && P('JP').ccProjectId === '601' && !P('JP').ccMoreIds && s2r.full === false);
/* and the photo index follows the links */
for (const k of Object.keys(KV)) if (/^ccidx/.test(k)) delete KV[k];
CCP[601].photos = mkPhotos(601, 12); CCP[602].photos = mkPhotos(602, 5); CCP[604].photos = mkPhotos(604, 7); CCP[605].photos = mkPhotos(605, 9);
await CP.run({ who: 'test', budgetMs: 60000 });
ok('newly linked jobs get their photos indexed (and the review-list one does not until it is linked)', rowOf(601).n === 12 && rowOf(602).n === 5 && rowOf(604).n === 7 && rowOf(606).job === 'PRJcc_606' && !rowOf(605));

/* ── 7. the admin button + the signed background run ── */
console.log('7. ⟳ Index all photos now');
const WH = require(path.join(FN, 'companycam-webhook.js'));
const BG = require(path.join(FN, 'companycam-photos-background.js'));
bgHandler = BG.handler;
const call = (q, m) => WH.handler({ httpMethod: m || 'POST', queryStringParameters: { proxy: q }, headers: { authorization: 'Bearer t', origin: 'https://crm.grayco-cs.com' }, body: '{}' });
const before = KV.ccidx_state.prog;
const a = JSON.parse((await call('photoindex')).body);
ok('admin asks: request saved, background started', a.ok && a.started === true && KV.ccidx_request && KV.ccidx_request.by === 'boss@grayco.test' && kicks.length >= 1);
await new Promise(r => setTimeout(r, 1500));
ok('the background run accepted the signed hand-off and re-read every linked project', kicks[kicks.length - 1].status === 200 && KV.ccidx_state.prog.kind === 'request' && KV.ccidx_state.prog.done === KV.ccidx_state.prog.total && KV.ccidx_state.prog.total >= 4, JSON.stringify(KV.ccidx_state.prog));
const forged = await BG.handler({ httpMethod: 'POST', headers: { 'x-ccp-ts': String(Date.now()), 'x-ccp-sig': 'f'.repeat(64) }, body: '{}' });
const stale = await BG.handler({ httpMethod: 'POST', headers: { 'x-ccp-ts': String(Date.now() - 600000), 'x-ccp-sig': CP.handoffSig(String(Date.now() - 600000)) }, body: '{}' });
ok('a forged or old hand-off is refused', forged.statusCode === 401 && stale.statusCode === 401);
const sy = JSON.parse((await call('sync', 'GET')).body);
ok('?proxy=sync shows the index progress', sy.photoIndex && sy.photoIndex.indexed >= 4 && sy.photoIndex.prog && sy.photoIndex.prog.total >= 4, JSON.stringify(sy.photoIndex));
/* the scheduled function hands a backlog to the background function */
const SCHED = require(path.join(FN, 'companycam-photos.js'));
for (const k of Object.keys(KV)) if (/^ccidx/.test(k)) delete KV[k];
bgHandler = null; const k0 = kicks.length;
CCP[601].photos = mkPhotos(601, 1500);
process.env.CC_PHOTO_MIN_MS = '600'; process.env.CC_PHOTO_SCHED_MS = '4000';
const sr = await SCHED.handler({});
process.env.CC_PHOTO_MIN_MS = '0';
ok('the 15-minute run hands a backlog to the background function', JSON.parse(sr.body).handedOff === true && JSON.parse(sr.body).queue > 0 && kicks.length > k0, sr.body);
ok('…signed, never with the token', kicks.slice(k0).every(k => k.sig && k.sig.length === 64 && k.sig.indexOf(TOKEN) < 0));
console.log((fail ? 'FAILED ' : 'PASSED ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
