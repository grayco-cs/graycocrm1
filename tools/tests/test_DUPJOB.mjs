// test_DUPJOB.mjs <build-dir> [<before-build-index.html>] — patch DUPJOB, offline (no browser): one job per estimate, only real
// PMs as PM, no silent "Residential". Runs the page's own code (the DUPJOB helpers and the whole ESTIN proposal maker) in a
// Node vm against the real-data mirror (MIRROR, default the 10/30 loop mirror) — never production.
// Usage: node tools/tests/test_DUPJOB.mjs . [path/to/old/index.html]   (the old build, when given, must make the duplicate)
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
const OLD = process.argv[3] ? path.resolve(process.argv[3]) : '';
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const section = t => console.log('== ' + t);

/* ── the mirror ── */
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const val = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
const by = {}; rows.forEach(r => { by[r.key] = val(r.v !== undefined ? r.v : r.value); });
const PROJECTS = by.projects, USERS = by.users, ESTS = by.estimates, LEADS = by.leads || [];
const clone = o => JSON.parse(JSON.stringify(o));
const HYATT = clone(ESTS.find(e => e && e.id === 'mvpngqx4tzo'));
const S251 = PROJECTS.find(p => p.id === 'PRJMVPQN1E2FG');
ok(!!HYATT && !!S251, 'mirror has the Hyatt estimate and S251');

function pageScript(html, startMark, endMark){
  const a = html.indexOf(startMark); if (a < 0) return '';
  const b = html.indexOf(endMark, a); return html.slice(a, b);
}
function helpCode(page){ const a = page.indexOf('/* __GC_PATCH_DUPJOB__'); if (a < 0) return ''; const b = page.indexOf('window._pmList=function(An)', a); return page.slice(a, page.indexOf('\n', b)); }
function scriptAround(html, mark){
  const i = html.indexOf(mark); if (i < 0) return '';
  const a = html.lastIndexOf('<script', i), a2 = html.indexOf('>', a) + 1, b = html.indexOf('</script>', i);
  return html.slice(a2, b);
}
function makeWin(opts){
  const timers = [];
  const store = {};
  const win = {
    console: { log(){}, warn(){}, error(){} },
    setTimeout: (f, ms) => { timers.push(f); return timers.length; }, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, createElement: () => ({ style: {}, appendChild(){}, setAttribute(){}, addEventListener(){}, querySelector: () => null, querySelectorAll: () => [] }), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener(){}, head: { appendChild(){} }, body: { appendChild(){} } },
    fetch: (u) => Promise.resolve(opts.fetch ? opts.fetch(u) : { ok: false, status: 503, json: () => Promise.resolve(null) }),
    CustomEvent: function(){}, dispatchEvent(){}, addEventListener(){},
    _crm: { projects: clone(opts.projects || []), users: clone(USERS), estimates: [] },
    __GC_AUTH__: { email: () => 'wjohnson@grayco-cs.com', isAdmin: () => true },
    _gcMeNow: { name: 'Wesley Johnson', role: 'Admin' },
    idbGet: k => Promise.resolve(opts.idb && opts.idb[k] !== undefined ? clone(opts.idb[k]) : null), idbSet(){},
    nextPO: () => 'Z999',
    made: [], upserts: [],
  };
  win._setProjects = f => { const next = typeof f === 'function' ? f(win._crm.projects) : f; win.made.push('setProjects'); return next; };
  win._supaUpsert = (k, v) => { win.upserts.push(k); };
  win._gcEstimatesState = opts.ests || [];
  win.window = win; win.self = win;
  win.__timers = timers;
  return win;
}
function run(code, win){ vm.runInContext(code, vm.createContext(win), { timeout: 20000 }); }
async function flush(win){ for (let i = 0; i < 40; i++) { await new Promise(r => setImmediate(r)); const t = win.__timers.splice(0); t.forEach(f => { try { f(); } catch (e) {} }); } }

const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const HELP = helpCode(html);
ok(HELP.length > 1000, 'the DUPJOB helpers are in the page');
const ESTIN = scriptAround(html, '/* __GC_PATCH_ESTIN__ ═');
ok(ESTIN.length > 10000, 'the ESTIN proposal maker is in the page');

/* ═══ 1. who may be PM ═══ */
section('only a PM-role person or an owner is a PM; office, marketing, "Office", a workload line or an estimator never');
{
  const w = makeWin({ projects: PROJECTS }); run(HELP, w);
  ok(w._gcCanPM('Steven Biffle') === true, 'Steven Biffle (Project Manager) can be PM');
  ok(w._gcCanPM('Wesley Johnson') && w._gcCanPM('Nick Thomas'), 'the owners (Admin) can be PM');
  ok(!w._gcCanPM('Brittany Pucket'), 'Brittany Pucket (Office Admin) is never a PM');
  ok(!w._gcCanPM('Office'), '"Office" is never a PM');
  ok(!w._gcCanPM('Glenn Miller'), 'Glenn Miller (Estimator) is not a PM');
  ok(!w._gcCanPM('Glenn Miller — 0 jobs · 16 leads · $0'), 'a workload line is not a PM');
  ok(w._gcCleanPerson('Glenn Miller — 0 jobs · 16 leads · $0') === 'Glenn Miller', 'the workload line cleans to the name');
  const list = w._pmList(USERS.map(u => Object.assign({ active: true }, u))).map(u => u.name.trim());
  ok(list.indexOf('Brittany Pucket') < 0 && list.indexOf('Office') < 0 && list.indexOf('Glenn Miller') < 0 && list.indexOf('Steven Biffle') >= 0, 'the job PM picker (_pmList): no office, no estimator', list);
  ok(w._gcPmCell(S251) === '⚠ Glenn Miller (not a PM)', 'S251\'s PM cell: the pm field only, flagged, not the workload line', w._gcPmCell(S251));
  ok(w._gcPmCell({ pm: 'Office' }) === '⚠ Office (not a PM)' && w._gcPmCell({ pm: 'Steven Biffle ' }) === 'Steven Biffle' && w._gcPmCell({ pm: '' }) === '', 'PM cell: "Office" flagged, a PM shown, blank blank');
  const np = w._gcNewJobPeople(HYATT, null);
  ok(np.pm === '' && np.estimator === 'Glenn Miller', 'Hyatt\'s estimate (estimator = workload line): pm blank, estimator Glenn Miller', np);
  const np2 = w._gcNewJobPeople(Object.assign({}, HYATT, { estimator: 'Brittany Pucket' }), null);
  ok(np2.pm === '' && np2.estimator === '', 'estimator Brittany (office, the 11/02 re-save): neither PM nor estimator', np2);
  const np3 = w._gcNewJobPeople({ estimator: 'Office' }, { pm: 'Steven Biffle' });
  ok(np3.pm === 'Steven Biffle' && np3.estimator === '', 'the lead\'s real PM stays; "Office" is no estimator', np3);
}

/* ═══ 2. job type ═══ */
section('job type: the best source, never a silent "Residential"');
{
  const w = makeWin({ projects: PROJECTS }); run(HELP, w);
  ok(w._gcJobTypeFor({ est: HYATT }) === 'Commercial Reno', 'Glenn\'s estimate (builder said "Residential", its default) → Commercial', w._gcJobTypeFor({ est: HYATT }));
  ok(w._gcJobTypeFor({ est: { estimator: 'Office' } }) === '', 'nothing known → blank (then "Pick job type")');
  ok(w._gcJobTypeFor({ est: { jobType: 'Residential', estimator: 'Wesley Johnson' } }) === '', 'the builder\'s default "Residential" alone is not trusted');
  ok(w._gcJobTypeFor({ est: { jobType: 'Commercial' } }) === 'Commercial Reno', 'builder "Commercial" → Commercial Reno');
  ok(w._gcJobTypeFor({ est: {}, lead: { leadKind: 'bid', source: 'BuildingConnected' } }) === 'Commercial Reno', 'a bid invite → Commercial');
  ok(w._gcJobTypeFor({ est: {}, lead: { projectType: 'Insurance Claim' } }) === 'Insurance Claim', 'a lead\'s CRM type is kept');
  const p = w._gcFixNewJob({ id: 'X', pm: 'Brittany Pucket', type: 'Residential', estimateId: 'nope' });
  ok(p.pm === '' && p.needsType === true && p.type === '' && p.pmCleared.was === 'Brittany Pucket', 'a code-made job with an office PM and the raw "Residential": pm cleared, type to pick', p);
  const p2 = w._gcFixNewJob({ id: 'Y', pm: 'Glenn Miller — 0 jobs · 16 leads · $0', type: '' });
  ok(p2.pm === '' && p2.estimator === 'Glenn Miller' && p2.type === 'Commercial Reno' && p2.isCommercial === true, 'a workload-line PM → Glenn as estimator, Commercial', p2);
  const p3 = w._gcFixNewJob({ id: 'Z', pm: 'Steven Biffle', type: 'Roofing' });
  ok(p3.pm === 'Steven Biffle' && p3.type === 'Roofing' && !p3.needsType, 'a real PM and a real type are left alone');
  const J = require(path.join(build, 'netlify', 'functions', '_lib', 'jobdata.js'));
  const IX = J.index({ customers: [], projects: [], invs: [], schedule: [], docs: [] });
  const chk = J.check({ id: 'B', name: 'Bid', address: '1 A St', status: 'bidding' }, IX);
  ok(chk.need.map(x => x.key).join(',') === 'type' && /pick/i.test(chk.need[0].label), 'Missing job data: a bidding job with no type → "Job type (pick one)"', chk.need);
  ok(J.check({ id: 'B', name: 'Bid', address: '1 A St', status: 'bidding', type: 'Residential' }, IX).need.length === 1, 'the raw "Residential" does not count as a type');
  ok(html.indexOf(fs.readFileSync(path.join(build, 'netlify', 'functions', '_lib', 'jobdata.js'), 'utf8').split('\n').find(l => l.indexOf("key: 'type'") >= 0).trim()) >= 0, 'the page\'s copy of the rule says the same');
}

/* ═══ 3. CompanyCam creators ═══ */
section('CompanyCam: an owner\'s project is a GrayCo lead with no PM; an estimator\'s is his as estimator');
{
  const w = makeWin({ projects: PROJECTS }); run(HELP, w);
  const own = w._gcCcCreatorRule({ pm: 'Wesley Johnson', pmSourced: true, commissionSource: 'self', type: '' });
  ok(own.pm === '' && own.commissionSource === 'company' && own.owner === 'GrayCo' && own.leadSource === 'GrayCo' && own.needsType === true, 'Wesley\'s project: GrayCo lead, PM blank, type to pick', own);
  const est = w._gcCcCreatorRule({ pm: 'Glenn Miller', pmSourced: true, type: '' });
  ok(est.pm === '' && est.estimator === 'Glenn Miller' && est.type === 'Commercial Reno', 'Glenn\'s project: Glenn as estimator, Commercial', est);
  const pmj = w._gcCcCreatorRule({ pm: 'Steven Biffle', pmSourced: true, type: '' });
  ok(pmj.pm === 'Steven Biffle', 'a PM\'s own project keeps him as PM');
  const CS = require(path.join(build, 'netlify', 'functions', 'companycam-sync.js'));
  ok(typeof CS === 'object', 'companycam-sync.js loads');
  const src = fs.readFileSync(path.join(build, 'netlify', 'functions', 'companycam-sync.js'), 'utf8');
  const sb = { require: createRequire(path.join(build, 'netlify', 'functions', 'companycam-sync.js')), module: { exports: {} }, exports: {}, process, console: { log(){}, warn(){} }, Buffer, URL, setTimeout, fetch: () => Promise.reject(new Error('offline')) };
  vm.runInContext(src + '\n;this.__t = { creatorRule, creatorKind, jobFor };', vm.createContext(sb));
  const T = sb.__t;
  const U = USERS;
  ok(T.creatorKind(U, 'Wesley Johnson') === 'owner' && T.creatorKind(U, 'Nick Thomas') === 'owner' && T.creatorKind(U, 'Steven Biffle ') === 'pm' && T.creatorKind(U, 'Glenn Miller') === 'other', 'server: creator kinds (owners, PM, estimator)');
  const j1 = T.creatorRule(T.jobFor({ id: 1, name: 'Owner job', created_at: 1798000000, address: '1 A' }, 'Nick Thomas', '', '2026-11-02T00:00:00Z', ''), U);
  ok(j1.pm === '' && j1.owner === 'GrayCo' && j1.commissionSource === 'company' && j1.type === '' && j1.needsType, 'server: Nick\'s CompanyCam project → GrayCo lead, no PM, no default type', j1);
  const j2 = T.creatorRule(T.jobFor({ id: 2, name: 'Est job', created_at: 1798000000, address: '2 A' }, 'Glenn Miller', '', '2026-11-02T00:00:00Z', ''), U);
  ok(j2.pm === '' && j2.estimator === 'Glenn Miller' && j2.type === 'Commercial Reno', 'server: Glenn\'s project → estimator Glenn, Commercial', j2);
  const j3 = T.creatorRule(T.jobFor({ id: 3, name: 'PM job', created_at: 1798000000, address: '3 A' }, 'Steven Biffle ', '', '2026-11-02T00:00:00Z', ''), U);
  ok(j3.pm === 'Steven Biffle ' && j3.commissionSource === 'self', 'server: Steven\'s own project stays his (PM)');
}

/* ═══ 4. finding the job ═══ */
section('the job for an estimate is found wherever the job list is');
{
  const w = makeWin({ projects: [] }); run(HELP, w);
  ok(w._gcJobsNotReady() === true, 'no jobs on screen yet → not ready (no job is made)');
  const f = w._gcJobForEstimate(HYATT, PROJECTS);
  ok(f && f.id === 'PRJMVPQN1E2FG', 'Hyatt\'s estimate → S251 from the saved list, though the screen has none', f && f.id);
  const f2 = w._gcJobForEstimate({ id: 'new1', name: 'Hyatt  Studios', address: 'Olive Branch, MS' }, PROJECTS);
  ok(f2 && f2.id === 'PRJMVPQN1E2FG', 'a new estimate with the same name + address (any spelling) → S251');
  ok(w._gcJobForEstimate({ id: 'new2', name: 'Hyatt Studios', address: 'Southaven, MS' }, PROJECTS) === null, 'same name, other address → no match (a new job is fine)');
  ok(w._gcJobForEstimate({ id: 'new3', name: 'Hyatt Studios' }, PROJECTS) === null, 'no address → never matched by name alone');
}

/* ═══ 5. the proposal maker end to end (the 11/02 condition: the screen's list does not hold S251) ═══ */
async function estinRun(indexHtml, withHelpers, o){
  o = o || {};
  const page = fs.readFileSync(indexHtml, 'utf8');
  const code = scriptAround(page, '/* __GC_PATCH_ESTIN__ ═'), help = withHelpers ? helpCode(page) : '';
  const e = o.fresh ? Object.assign(clone(HYATT), { id: 'mtestnew01', pid: '', autoPO: '', name: 'Brand New Warehouse', address: '1 Test Way, Memphis, TN', estin: null, estimator: 'Glenn Miller', jobType: 'Residential', savedAt: '2026-11-02T17:43:48.347Z', estinNow: true })
    : Object.assign(clone(HYATT), { estin: null, estimator: 'Brittany Pucket', savedAt: '2026-11-02T17:43:48.347Z', estinNow: true });
  const others = o.fresh ? PROJECTS : PROJECTS.filter(p => p.id !== 'PRJMVPQN1E2FG').slice(0, 40);   /* the screen's list: S251 missing */
  const w = makeWin({ projects: others, idb: { projects: o.noIdb ? null : PROJECTS, estimates: [e], leads: LEADS, projectDocs: [] }, ests: [e],
    fetch: u => (/key=eq\.projects/.test(String(u)) && !o.noCloud ? { ok: true, json: () => Promise.resolve([{ value: PROJECTS }]) } : { ok: false, status: 503, json: () => Promise.resolve({}) }) });
  w.localStorage.setItem('grayco_sb_url', 'https://example.invalid'); w.localStorage.setItem('grayco_sb_key', 'x');
  w._gcJA = { stamp: p => p };
  const ctx = vm.createContext(w);
  if (help) vm.runInContext(help, ctx);
  vm.runInContext(code, ctx);
  const r = w._gcEstin.process(e, true);
  const out = await Promise.race([Promise.resolve(r).catch(x => ({ err: String(x) })), new Promise(res => setTimeout(() => res({ timeout: true }), 8000))]);
  await flush(w);
  if (o.fresh) return { out, made: w._crm.projects.filter(p => p.estimateId === 'mtestnew01'), w };
  const made = w._crm.projects.filter(p => p.createdFrom === 'estimate (ESTIN)' && p.createdAt && p.createdAt > '2026-11-02T19' || (p.autoPO === 'Z999'));
  return { out, made, w };
}
section('ESTIN with S251 missing from the screen\'s list (the 11/02 19:06 condition)');
{
  const now = await estinRun(path.join(build, 'index.html'), true);
  ok(now.made.length === 0, 'patched: no second job is made', now.made.map(p => ({ po: p.autoPO, pm: p.pm })));
  ok(now.w.made.length === 0, 'patched: the job list is not written');
  const tgt = JSON.stringify(now.w._gcEstin.state().log);
  ok(/Hyatt Studios/.test(tgt) && !/Bidding job/.test(tgt), 'patched: the proposal run goes on with the existing job', now.w._gcEstin.state().log.slice(0, 3));
  const cloudOnly = await estinRun(path.join(build, 'index.html'), true, { noIdb: true });
  ok(cloudOnly.made.length === 0, 'patched: S251 only in the cloud (not on screen, not saved here) → found there, no second job');
  const none = await estinRun(path.join(build, 'index.html'), true, { noIdb: true, noCloud: true });
  ok(none.made.length === 0 && /could not be checked/.test(JSON.stringify(none.w._gcEstin.state().log)), 'patched: the job cannot be checked anywhere → it waits (no job), retried on the next scan', none.w._gcEstin.state().log.slice(0, 2));
  const fresh = await estinRun(path.join(build, 'index.html'), true, { fresh: true });
  const fj = fresh.made[0] || {};
  ok(fresh.made.length === 1 && fj.pm === '' && fj.estimator === 'Glenn Miller' && fj.type === 'Commercial Reno', 'patched: a genuinely new estimate still gets its bidding job — no PM, Glenn as estimator, Commercial', fresh.made.map(p => ({ po: p.autoPO, pm: p.pm, est: p.estimator, type: p.type })));
  if (OLD) {
    const was = await estinRun(OLD, false);
    ok(was.made.length === 1 && was.made[0].pm === 'Brittany Pucket' && was.made[0].type === 'Residential', 'before the patch: the same run makes a second "Hyatt Studios" with PM Brittany Pucket, type Residential (P276 reproduced)', was.made.map(p => ({ po: p.autoPO, pm: p.pm, type: p.type, est: p.estimateId })));
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
