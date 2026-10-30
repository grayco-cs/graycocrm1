/* patch PHOTOLINK tests — made-up jobs, addresses and photo projects only.
   node tools/tests/test_PHOTOLINK.mjs            → the address matcher + one companycam-sync run against a mock
   node tools/tests/test_PHOTOLINK.mjs --browser <build dir>
                                                   → + the offline harness (S/wN/harness_N.mjs, demo seed): GrayCo Photos
                                                     shows a linked 2026 job's photos, the "Link these photo projects" list,
                                                     and ZERO photo / CompanyCam requests on Dashboard / To-Do (2 min) and
                                                     after leaving GrayCo Photos. One headless browser; waits while another runs. */
import { createRequire } from 'module';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } }

/* ── 1. the matcher ── */
const CM = require(path.join(FN, '_lib/cc-match.js'));
console.log('matcher');
ok('street spelled out = abbreviated', CM.sameAddr('1234 Oak Street, Bartlett, TN 38133', '1234 Oak St'));
ok('no commas, city/state/zip after', CM.sameAddr('1234 Oak St Bartlett TN 38133', '1234 oak st., bartlett'));
ok('directional + unit ignored', CM.sameAddr('55 N Maple Ave Apt 4, Memphis TN', '55 Maple Avenue, Memphis'));
ok('different house number', !CM.sameAddr('1234 Oak St', '1235 Oak St'));
ok('different street type', !CM.sameAddr('1234 Oak St', '1234 Oak Ave'));
ok('different ZIP', !CM.sameAddr('1234 Oak St, Bartlett, TN 38133', '1234 Oak St, Cordova, TN 38018'));
ok('no house number is no address', CM.addrParts('Oak Street, Bartlett') === null);
ok('street named Court', CM.sameAddr('9 Court St, Lakeland', '9 Court Street'));
ok('ordinal words', CM.sameAddr('300 First Ave', '300 1st Avenue'));
ok('address object (CompanyCam shape)', CM.sameAddr({ street_address_1: '77 Pine Ln', city: 'Collierville', state: 'TN', postal_code: '38017' }, '77 Pine Lane, Collierville TN 38017'));
ok('name normalised', CM.normName('Trooper Tree!') === 'troopertree' && CM.normName('Ab') === '');

/* ── 2. one companycam-sync run against a mock CompanyCam + Supabase ── */
console.log('companycam-sync');
process.env.COMPANYCAM_TOKEN = 'X'.repeat(40);       /* made-up, the mock never checks it */
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-test';
process.env.CC_BACKOFF_MS = '0';
const T = s => Math.floor(Date.parse(s) / 1000);
const PROJ = [
  /* CRM-made 2026 jobs (no CompanyCam id) */
  { id: 'J1', name: 'Henderson Kitchen', address: '1234 Oak Street, Bartlett, TN 38133', status: 'Active', createdAt: '2026-03-01T10:00:00Z' },
  { id: 'J2', name: 'Lopez Roof', address: '55 N Maple Ave Bartlett TN 38133', status: 'bidding', createdAt: '2026-04-02T10:00:00Z' },
  { id: 'J3', name: 'Twin A', address: '8 Elm Ct, Cordova, TN', status: 'Active', createdAt: '2026-02-01T10:00:00Z' },
  { id: 'J4', name: 'Twin B', address: '8 Elm Court, Cordova, TN', status: 'Active', createdAt: '2026-02-03T10:00:00Z' },
  { id: 'J5', name: 'Already Linked', address: '40 Birch Rd, Germantown, TN', status: 'Active', createdAt: '2026-05-01T10:00:00Z', ccProjectId: '9005' },
  { id: 'J6', name: 'Rejected Pair', address: '61 Cedar Way, Lakeland, TN', status: 'Active', createdAt: '2026-05-01T10:00:00Z' },
  { id: 'J7', name: 'Trooper Tree', address: '7 Tree Ln, Arlington, TN', status: 'Active', createdAt: '2026-06-01T10:00:00Z' },
  { id: 'J8', name: 'Old Barn', address: '12 Barn Rd, Eads, TN', status: 'Active', createdAt: '2025-06-01T10:00:00Z' },
  { id: 'J9', name: 'Dup Hill', address: '90 Hill St, Millington, TN', status: 'Active', createdAt: '2026-07-01T10:00:00Z' },
  { id: 'PRJcc_9009', name: '90 Hill St', address: '90 Hill St, Millington, TN', status: 'bidding', ccProjectId: '9009', _ccAuto: true, createdAt: '2026-07-02T10:00:00Z' }
];
const CC = [
  { id: 9001, name: 'Henderson', address: { street_address_1: '1234 Oak St', city: 'Bartlett', state: 'TN', postal_code: '38133' }, created_at: T('2026-03-02T00:00:00Z'), status: 'active' },
  { id: 9002, name: 'Lopez', address: { street_address_1: '55 Maple Avenue', city: 'Bartlett', state: 'TN' }, created_at: T('2026-04-03T00:00:00Z'), status: 'active' },
  { id: 9003, name: 'Elm job', address: { street_address_1: '8 Elm Ct', city: 'Cordova', state: 'TN' }, created_at: T('2026-02-05T00:00:00Z'), status: 'active' },
  { id: 9004, name: 'Birch second', address: { street_address_1: '40 Birch Road', city: 'Germantown' }, created_at: T('2026-05-10T00:00:00Z'), status: 'active' },
  { id: 9005, name: 'Birch first', address: { street_address_1: '40 Birch Rd', city: 'Germantown' }, created_at: T('2026-05-02T00:00:00Z'), status: 'active' },
  { id: 9006, name: 'Cedar', address: { street_address_1: '61 Cedar Way', city: 'Lakeland' }, created_at: T('2026-05-03T00:00:00Z'), status: 'active' },
  { id: 9007, name: 'Trooper Tree', address: { street_address_1: '999 Other Rd', city: 'Arlington' }, created_at: T('2026-06-02T00:00:00Z'), status: 'active' },
  { id: 9008, name: 'Old Barn', address: { street_address_1: '12 Barn Rd', city: 'Eads' }, created_at: T('2025-06-02T00:00:00Z'), status: 'active' },
  { id: 9009, name: '90 Hill St', address: { street_address_1: '90 Hill St', city: 'Millington' }, created_at: T('2026-07-02T00:00:00Z'), status: 'active' }
];
const KV = { projects: PROJ, leads: [], customers: [], users: [], gc_cc_link_no: { '9006|J6': { at: '2026-10-01' } }, gc_epoch: { epoch: 'e1' } };
let writes = [];
global.fetch = async function(url, init){
  const u = String(url);
  const J = (b, st) => ({ ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
  if (u.startsWith('https://api.companycam.com/v2/company')) return J({ id: 1, name: 'Demo Co' });
  if (u.startsWith('https://api.companycam.com/v2/projects')) { const pg = +(new URL(u).searchParams.get('page') || 1); return J(pg === 1 ? CC : []); }
  if (u.startsWith('https://api.companycam.com/v2/users')) return J({}, 404);
  if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
    if (init && init.method === 'POST') { const rows = JSON.parse(init.body); writes.push(rows); rows.forEach(r => { KV[r.key] = r.value; }); return J([], 201); }
    const m = /key=in\.\(([^)]*)\)/.exec(decodeURIComponent(u)); const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : [];
    return J(keys.filter(k => KV[k] !== undefined).map(k => ({ key: k, value: KV[k] })));
  }
  if (u.startsWith('https://sb.test/rest/v1/')) return J([]);
  throw new Error('unexpected ' + u);
};
const SYNC = require(path.join(FN, 'companycam-sync.js'));
const R = await SYNC._t.run();
const P = id => KV.projects.find(p => p.id === id);
ok('run ok, full re-read once for the new rule', R.ok && R.full === true, JSON.stringify({ ok: R.ok, full: R.full }));
ok('J1 (street spelled differently) linked', P('J1').ccProjectId === '9001');
ok('J2 (no commas, "N", Avenue) linked', P('J2').ccProjectId === '9002');
ok('two look-alike jobs: neither linked', !P('J3').ccProjectId && !P('J4').ccProjectId);
const rev = KV.gc_cc_review || [];
const r3 = rev.find(x => x.cc === '9003');
ok('…on the list with both jobs to pick from', r3 && r3.kind === 'link' && r3.jobs.map(j => j.id).sort().join() === 'J3,J4', JSON.stringify(r3));
ok('existing link never replaced; second project beside it', P('J5').ccProjectId === '9005' && JSON.stringify(P('J5').ccMoreIds) === '["9004"]');
ok('"Not this job" pair never linked', !P('J6').ccProjectId && !(P('J6').ccMoreIds || []).length);
ok('same name, different address: not linked, on the list', !P('J7').ccProjectId && rev.some(x => x.cc === '9007' && x.jobs && x.jobs[0].id === 'J7'));
ok('a project made before 2026 is never linked', !P('J8').ccProjectId);
ok('auto-made CompanyCam job at a CRM job\'s address: the CRM job gets its photos too', JSON.stringify(P('J9').ccProjectId || P('J9').ccMoreIds) === JSON.stringify(['9009']) || P('J9').ccProjectId === '9009');
ok('no new jobs made for linked projects', !KV.projects.some(p => /^PRJcc_900[1-7]$/.test(p.id)), KV.projects.map(p => p.id).join());
ok('sync state remembers the rule version', KV.gc_cc_sync_state && KV.gc_cc_sync_state.linkV === SYNC._t.LINK_V);
/* second run: idempotent, a person's Link applied once */
KV.gc_cc_sync_request = { link: { '9003': 'J4' } };
const before = JSON.stringify(P('J1'));
const R2 = await SYNC._t.run();
ok('second run: nothing linked twice', JSON.stringify(P('J1')) === before && R2.full === false);
ok('a person\'s Link ties the project to that job', P('J4').ccProjectId === '9003' && !P('J3').ccProjectId);
ok('…and it drops off the list', !(KV.gc_cc_review || []).some(x => x.cc === '9003'));

/* ── 3. the webhook's review answers: link + notthis ── */
console.log('companycam-webhook ?proxy=review');
{
  const WH = require(path.join(FN, 'companycam-webhook.js'));
  const prevFetch = global.fetch;
  global.fetch = async function(url, init){
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ email: 'boss@grayco.test' }) };
    if (u.includes('/rest/v1/gc_staff')) return { ok: true, status: 200, json: async () => [{ email: 'boss@grayco.test', role: 'admin', active: true }] };
    return prevFetch(url, init);
  };
  KV.gc_cc_review = [{ cc: '9007', kind: 'link', jobs: [{ id: 'J7', name: 'Trooper Tree' }] }];
  const call = b => WH.handler({ httpMethod: 'POST', queryStringParameters: { proxy: 'review' }, headers: { authorization: 'Bearer t', origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(b) });
  const a = JSON.parse((await call({ cc: '9007', act: 'notthis', job: 'J7' })).body);
  ok('notthis saved', a.ok && KV.gc_cc_link_no['9007|J7'] && KV.gc_cc_review[0].jobs.length === 0);
  const b = JSON.parse((await call({ cc: '9007', act: 'link', job: 'J7' })).body);
  ok('link asked for (the sync applies it)', b.ok && KV.gc_cc_sync_request.link['9007'] === 'J7' && !KV.gc_cc_review.length);
  const c = await call({ cc: '9007', act: 'link' });
  ok('link without a job refused', c.statusCode === 400);
  global.fetch = prevFetch;
}

/* ── 4. the browser (offline harness) ── */
const bi = process.argv.indexOf('--browser');
if (bi > 0) {
  const build = path.resolve(process.argv[bi + 1] || ROOT);
  const { browserCheck } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'photolink_browser.mjs'));
  /* one headless browser at a time: wait (60 s polls, up to 40 min) while another runs */
  for (let i = 0; i < 40; i++) {
    let busy = ''; try { busy = execSync('pgrep headless_shell; pgrep -x chrome; pgrep -x chromium; true').toString().trim(); } catch (e) {}
    if (!busy) break;
    console.log('  … another browser is running, waiting 60 s'); await new Promise(r => setTimeout(r, 60000));
  }
  const res = await browserCheck(build);
  res.forEach(x => ok(x[0], x[1], x[2]));
}
console.log((fail ? 'FAILED ' : 'PASSED ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
