/* patch CCLINKSTAT tests — made-up jobs, addresses and CompanyCam projects only; mocks; nothing leaves the machine.
   node tools/tests/test_CCLINKSTAT.mjs [build dir]
     1. companycam-sync against a mock CompanyCam + Supabase:
        • a September browser-import placeholder (plain PRJ… id, source companycam, _ccImported, Bidding) that holds a project's
          id no longer keeps that project from the real CRM job at the same address — the real job gets it;
        • a person's link on a job is never replaced (the project goes beside it, ccMoreIds);
        • a new project at the address of ONE open job is linked to it, never made into a second (placeholder) job;
        • a placeholder a person has worked on (estimating / has a contract) is not treated as a placeholder;
        • gc_cc_sync_health carries jobsLinked / ccJobs / ccDupes / waitingNew / newJobsOn, never the token.
     2. the CompanyCam status line (index.html, script gc-patch-ccs, run in a Node vm): "· N jobs linked", the waiting projects
        with "Make new jobs" OFF, the copies; a rejected key still says "❌ Token not accepted". */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.resolve(process.argv[2] || ROOT);
const FN = path.join(BUILD, 'netlify/functions');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 500) : '')); } }

/* ── 1. companycam-sync ── */
console.log('companycam-sync');
const TOKEN = 'X'.repeat(40);   /* made-up, the mock never checks it */
Object.assign(process.env, { COMPANYCAM_TOKEN: TOKEN, SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', CC_BACKOFF_MS: '0' });
const T = s => Math.floor(Date.parse(s) / 1000);
const PROJ = [
  /* a real job (made in the CRM, no CompanyCam link) and the September import's placeholder holding the project at its address */
  { id: 'J1', name: 'Demo Kitchen', address: '101 Alpha St, Bartlett, TN 38133', status: 'Active', createdAt: '2026-08-01T10:00:00Z' },
  { id: 'PRJmtt0demo1', name: '101 Alpha Street', address: '101 Alpha Street, Bartlett, TN 38133', status: 'bidding', contract: 0, source: 'companycam', _ccImported: true,
    ccProjectId: '8001', ccamId: '8001', createdAt: 1788891000000 },
  /* a person linked J2 to project 8100; the placeholder holds 8002 at the same address */
  { id: 'J2', name: 'Demo Roof', address: '202 Beta Ave, Cordova, TN', status: 'Active', createdAt: '2026-07-01T10:00:00Z', ccProjectId: '8100', ccLinkedBy: 'a person' },
  { id: 'PRJmtt0demo2', name: '202 Beta Avenue', address: '202 Beta Avenue, Cordova, TN', status: 'bidding', contract: 0, source: 'companycam', _ccImported: true,
    ccProjectId: '8002', createdAt: 1788891000000 },
  /* a placeholder someone has worked on: it is that job now, its project stays its own */
  { id: 'J3', name: 'Demo Deck', address: '303 Gamma Rd, Lakeland, TN', status: 'Active', createdAt: '2026-06-01T10:00:00Z' },
  { id: 'PRJmtt0demo3', name: '303 Gamma Road', address: '303 Gamma Road, Lakeland, TN', status: 'estimating', contract: 12000, source: 'companycam', _ccImported: true,
    ccProjectId: '8003', createdAt: 1788891000000 },
  /* a copy of a project a real job already has (counted as a copy, never removed) */
  { id: 'J4', name: 'Demo Fence', address: '404 Delta Ln, Arlington, TN', status: 'Active', createdAt: '2026-05-01T10:00:00Z', ccProjectId: '8004' },
  { id: 'PRJmtt0demo4', name: '404 Delta Lane', address: '404 Delta Lane, Arlington, TN', status: 'bidding', contract: 0, source: 'companycam', _ccImported: true,
    ccProjectId: '8004', createdAt: 1788891000000 },
  /* an open job for a brand-new CompanyCam project at its address */
  { id: 'J5', name: 'Demo Porch', address: '505 Epsilon Dr, Germantown, TN 38138', status: 'bidding', createdAt: '2026-11-01T10:00:00Z' }
];
const CC = [
  { id: 8001, name: '101 Alpha Street', address: { street_address_1: '101 Alpha Street', city: 'Bartlett', state: 'TN', postal_code: '38133' }, created_at: T('2026-08-02T00:00:00Z'), status: 'active' },
  { id: 8002, name: '202 Beta Avenue', address: { street_address_1: '202 Beta Avenue', city: 'Cordova', state: 'TN' }, created_at: T('2026-07-02T00:00:00Z'), status: 'active' },
  { id: 8003, name: '303 Gamma Road', address: { street_address_1: '303 Gamma Road', city: 'Lakeland', state: 'TN' }, created_at: T('2026-06-02T00:00:00Z'), status: 'active' },
  { id: 8004, name: '404 Delta Lane', address: { street_address_1: '404 Delta Lane', city: 'Arlington', state: 'TN' }, created_at: T('2026-05-02T00:00:00Z'), status: 'active' },
  { id: 8005, name: 'Porch at Epsilon', address: { street_address_1: '505 Epsilon Drive', city: 'Germantown', state: 'TN', postal_code: '38138' }, created_at: T('2026-11-02T00:00:00Z'), status: 'active',
    primary_contact: { name: 'Demo Person', phone_number: '(901) 555-0100' } },
  { id: 8006, name: 'Somewhere New', address: { street_address_1: '606 Zeta Ct', city: 'Eads', state: 'TN' }, created_at: T('2026-11-10T00:00:00Z'), status: 'active',
    primary_contact: { name: 'Demo Two', phone_number: '(901) 555-0101' } }
];
const KV = { projects: JSON.parse(JSON.stringify(PROJ)), leads: [], customers: [], users: [], gc_epoch: { epoch: 'e1' }, gc_cc_sync_state: { cursor: 0, linkV: 3, epoch: 'e1' } };
let sent = [];
global.fetch = async function(url, init){
  const u = String(url);
  const J = (b, st) => ({ ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
  if (u.startsWith('https://api.companycam.com/v2/company')) return J({ id: 1, name: 'Demo Co' });
  if (u.startsWith('https://api.companycam.com/v2/projects')) { const pg = +(new URL(u).searchParams.get('page') || 1); return J(pg === 1 ? CC : []); }
  if (u.startsWith('https://api.companycam.com/v2/users')) return J({}, 404);
  if (u.startsWith('https://api.companycam.com/')) throw new Error('unexpected CompanyCam call ' + u);
  if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
    if (init && init.method === 'POST') { sent.push(String(init.body)); JSON.parse(init.body).forEach(r => { KV[r.key] = r.value; }); return J([], 201); }
    const m = /key=in\.\(([^)]*)\)/.exec(decodeURIComponent(u)), m1 = /key=eq\.([^&]*)/.exec(decodeURIComponent(u));
    const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : m1 ? [m1[1]] : [];
    return J(keys.filter(k => KV[k] !== undefined).map(k => ({ key: k, value: KV[k] })));
  }
  if (u.startsWith('https://sb.test/rest/v1/')) return J([]);
  throw new Error('unexpected ' + u);
};
const SYNC = require(path.join(FN, 'companycam-sync.js'));
const X = SYNC._t;
ok('legacy placeholder recognised (Bidding, no contract, source companycam, imported)', typeof X.legacyPlaceholder === 'function' && X.legacyPlaceholder(PROJ[1]) && !X.legacyPlaceholder(PROJ[5]) && !X.legacyPlaceholder(PROJ[0]));
const R = await X.run();
await X.saveHealth(X.healthOf(R));
const P = id => KV.projects.find(p => p.id === id);
ok('run ok, a full re-read for the new rule (linkV ' + X.LINK_V + ')', R.ok && R.full === true && X.LINK_V >= 4, JSON.stringify({ ok: R.ok, full: R.full }));
ok('the real job at the placeholder\'s address gets the project (photos show on it)', P('J1').ccProjectId === '8001', JSON.stringify(P('J1')));
ok('…the placeholder is left as it was (nothing removed)', P('PRJmtt0demo1') && P('PRJmtt0demo1').ccProjectId === '8001');
ok('a person\'s link is never replaced: the project goes beside it', P('J2').ccProjectId === '8100' && JSON.stringify(P('J2').ccMoreIds) === '["8002"]', JSON.stringify(P('J2')));
ok('a placeholder someone worked on keeps its project; the other job is not given it', !P('J3').ccProjectId && !(P('J3').ccMoreIds || []).length);
ok('a new project at ONE open job\'s address is linked to it', P('J5').ccProjectId === '8005', JSON.stringify(P('J5')));
ok('…and never made into a second job', !KV.projects.some(p => p.id === 'PRJcc_8005'));
ok('no new placeholder for a project already in the CRM', !KV.projects.some(p => /^PRJcc_800[1-5]$/.test(p.id)), KV.projects.map(p => p.id).join());
ok('a brand-new project with "Make new jobs" OFF waits on the list (not a job)', !KV.projects.some(p => p.id === 'PRJcc_8006') && (KV.gc_cc_review || []).some(x => x.cc === '8006' && x.kind === 'new'));
const H = KV.gc_cc_sync_health || {};
ok('health: jobsLinked counts the CRM jobs with a project (J1, J2, J4, J5)', H.jobsLinked === 4, JSON.stringify(H));
ok('health: ccJobs (4 made from CompanyCam) and ccDupes 3 (the Bidding placeholders whose project a real job now has: demo1, demo2, demo4)', H.ccJobs === 4 && H.ccDupes === 3, JSON.stringify({ ccJobs: H.ccJobs, ccDupes: H.ccDupes }));
ok('health: 1 new project waiting, Make new jobs OFF', H.waitingNew === 1 && H.newJobsOn === false, JSON.stringify({ w: H.waitingNew, on: H.newJobsOn }));
ok('the token is never written anywhere', !sent.some(b => b.indexOf(TOKEN) >= 0));
/* second run: nothing changes twice */
const snap = JSON.stringify(KV.projects);
const R2 = await X.run();
ok('second run: idempotent, no full read', JSON.stringify(KV.projects) === snap && R2.full === false);
/* linkCounts directly */
if (typeof X.linkCounts !== 'function') ok('linkCounts exists', false);
else {
  const idx = X.knownIndex([{ id: 'A', address: '1 A St', ccProjectId: '1001' }, { id: 'PRJcc_1001', address: '1 A St', status: 'bidding', ccProjectId: '1001', _ccAuto: true },
    { id: 'PRJcc_1002', address: '2 B St', status: 'bidding', ccProjectId: '1002', _ccAuto: true }, { id: 'B', address: '3 C St' }], [], []);
  const c = X.linkCounts(idx, {}, {});
  ok('linkCounts: 1 linked, 2 from CompanyCam, 1 copy', c.jobsLinked === 1 && c.ccJobs === 2 && c.ccDupes === 1, JSON.stringify(c));
  const c2 = X.linkCounts(idx, { PRJcc_1001: 1 }, { B: [{ id: '1003' }] });
  ok('linkCounts: deleted jobs skipped, this run\'s links counted', c2.jobsLinked === 2 && c2.ccJobs === 1 && c2.ccDupes === 0, JSON.stringify(c2));
}

/* ── 2. the status line ── */
console.log('status line (index.html gc-patch-ccs)');
{
  const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
  const m = /<script id="gc-patch-ccs">([\s\S]*?)<\/script>/.exec(html);
  ok('status script found', !!m);
  function lineFor(data){
    const store = { gc_ccsync_last: JSON.stringify({ at: Date.now(), data: data }) };
    const W = { localStorage: { getItem: k => store[k] == null ? null : store[k], setItem: (k, v) => { store[k] = String(v); } },
      setTimeout: () => 0, setInterval: () => 0, fetch: () => new Promise(() => {}), console: { log(){}, info(){} },
      __GC_AUTH__: { email: () => 'demo@grayco.test', mode: () => 'cloud', isAdmin: () => true } };
    W.window = W;
    W.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute(){}, style: {} }), head: { appendChild(){} },
      documentElement: { appendChild(){} }, addEventListener(){}, body: null, readyState: 'complete' };
    W.addEventListener = () => {};
    const ctx = vm.createContext(Object.assign(W, { Date, JSON, Math, String, Number, Object, Array, Promise, RegExp, isFinite, parseInt, Error }));
    vm.runInContext(m[1].replace(/\blocalStorage\b/g, 'window.localStorage'), ctx);
    return W._gcCCSync.text().text;
  }
  const now = new Date().toISOString();
  const base = { tokenSet: true, whoami: { at: now, accepted: true, status: 200 }, health: { at: now, ok: true, read: 0, made: 0, fails: 0, jobsLinked: 169, ccJobs: 214, ccDupes: 165, waitingNew: 3, newJobsOn: false } };
  const t1 = lineFor(base);
  ok('OK line: token accepted + last sync', /✅ Token accepted/.test(t1) && /Last sync: .* — OK, 0 projects read, 0 jobs made/.test(t1), t1);
  ok('OK line: "· 169 jobs linked"', / · 169 jobs linked/.test(t1), t1);
  ok('OK line: 3 waiting, Make new jobs OFF', /⚠ 3 new CompanyCam projects waiting on 📷 Photos \("Make new jobs" is OFF in ⚡ Automations\)/.test(t1), t1);
  ok('OK line: the copies', /165 CompanyCam-made Bidding jobs are copies of a project another job already has/.test(t1), t1);
  const t2 = lineFor(Object.assign({}, base, { health: { at: now, ok: true, read: 2, made: 1, fails: 0 } }));
  ok('an older health row (no counts) reads as before', !/linked|waiting|copies/.test(t2) && /OK, 2 projects read, 1 job made/.test(t2), t2);
  const t3 = lineFor(Object.assign({}, base, { whoami: { at: now, accepted: false, status: 401 } }));
  ok('rejected key: ❌ Token not accepted (401) + make a new token', /❌ Token not accepted \(401\)/.test(t3) && /make a new token in CompanyCam/.test(t3), t3);
}

console.log((fail ? 'FAILED ' : 'PASSED ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
