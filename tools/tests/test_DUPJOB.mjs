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
/* the Lead Estimator: the same decision the page makes (patch EST4, netlify/functions/_lib/estimator.js) — a role, not a name */
const EST = require(path.join(build, 'netlify', 'functions', '_lib', 'estimator.js'));
const LE = EST.decide(USERS, null);
const LEN = LE && !LE.ambiguous ? LE.name : '';
const OWNER = USERS.find(u => /^admin$/i.test(u.role)), PMU = USERS.find(u => /project manager/i.test(u.role)), OFFICEU = USERS.find(u => /office/i.test(u.role));
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
  win._gcDefEst = () => EST.decide(win._crm.users, opts.estSetting || null);
  if (opts.me) { win._gcMeNow = { name: opts.me.name, role: opts.me.role }; win.__GC_AUTH__ = { email: () => opts.me.email, isAdmin: () => /^admin$/i.test(opts.me.role), mode: () => 'sb' }; }
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
  ok(np.pm === '' && np.estimator === 'Glenn Miller', 'Hyatt\'s estimate (estimator = workload line): pm blank, estimator = that estimator', np);
  const np2 = w._gcNewJobPeople(Object.assign({}, HYATT, { estimator: 'Brittany Pucket' }), null);
  ok(np2.pm === '' && np2.estimator === LEN && !!LEN, 'estimator = the office user (the 11/02 re-save): no PM; the Lead Estimator is the estimator', [np2, LEN]);
  const np3 = w._gcNewJobPeople({ estimator: 'Office' }, { pm: 'Steven Biffle' });
  ok(np3.pm === 'Steven Biffle' && np3.estimator === LEN, 'the lead\'s real PM stays; "Office" is no estimator → the Lead Estimator', np3);
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
  ok(fresh.made.length === 1 && fj.pm === '' && fj.estimator === LEN && fj.type === 'Commercial Reno', 'patched: a genuinely new estimate still gets its bidding job — no PM, Glenn as estimator, Commercial', fresh.made.map(p => ({ po: p.autoPO, pm: p.pm, est: p.estimator, type: p.type })));
  if (OLD) {
    const was = await estinRun(OLD, false);
    ok(was.made.length === 1 && was.made[0].pm === 'Brittany Pucket' && was.made[0].type === 'Residential', 'before the patch: the same run makes a second "Hyatt Studios" with PM Brittany Pucket, type Residential (P276 reproduced)', was.made.map(p => ({ po: p.autoPO, pm: p.pm, type: p.type, est: p.estimateId })));
  }
}

/* ═══ 6. DUPJOB2: roles, not names ═══ */
section('DUPJOB2: the Lead Estimator and the lead managers are role slots');
{
  ok(!!LEN && /estimat/i.test((USERS.find(u => u.name === LEN) || {}).role), 'the Lead Estimator comes from the Estimator role (one active estimator)', LE);
  const two = USERS.concat([{ id: 'Ux', name: 'Second Estimator', role: 'Estimator', email: 'second.est@example.com', active: true }]);
  ok(EST.decide(two, null).ambiguous === true, 'two estimators and no Lead Estimator picked → nobody is auto-picked (the admins / the lead assign)');
  const w2 = makeWin({ projects: PROJECTS }); w2._crm.users = two; w2._gcDefEst = () => EST.decide(two, null); run(HELP, w2);
  ok(w2._gcNewJobPeople({ estimator: 'Office' }, null).estimator === '', 'two estimators, none picked: a new job gets no estimator by itself');
  w2._gcDefEst = () => EST.decide(two, { name: LEN, email: (USERS.find(u => u.name === LEN) || {}).email });
  ok(w2._gcNewJobPeople({}, null).estimator === LEN, 'two estimators, the Lead Estimator picked in settings → the Lead Estimator gets it');
  const w = makeWin({ projects: PROJECTS }); run(HELP, w);
  ok(w._gcLeadSlot('estimator') && w._gcLeadSlot('estimator').name === LEN, '_gcLeadSlot("estimator") → the Lead Estimator');
  ok(w._gcJobTypeFor({ est: { estimator: LEN, jobType: 'Residential' } }) === 'Commercial Reno', 'the Lead Estimator\'s work → Commercial Reno (role, not a name)');
  w._gcPrimeSub = { of: l => l && l.gcRole === 'prime' ? 'prime' : 'sub' };
  ok(w._gcJobTypeFor({ est: {}, lead: { leadKind: 'bid', source: 'BuildingConnected' } }) === 'Commercial Reno', 'a sub bid / bid invite → Commercial Reno');
  ok(w._gcJobTypeFor({ est: { estimator: LEN }, lead: { leadKind: 'commercial', gcRole: 'prime' } }) === 'New Construction', 'GrayCo\'s own GC (prime) commercial bid → New Construction');
  ok(w._gcAutoPmFor(OWNER.name) === '' && w._gcAutoPmFor(OFFICEU.name) === '' && w._gcAutoPmFor(PMU.name) === PMU.name.trim(), 'a form never fills in an owner or the office as PM; a PM yes');
}
section('DUPJOB2: a job an owner creates is GrayCo\'s, no PM, the owners assign it (every code path through the job stamp)');
{
  const vias = ['estimate', 'estbuilder', 'approval', 'bid', 'schedule', 'lead', 'roofscout'];
  vias.forEach(via => {
    const w = makeWin({ projects: PROJECTS, me: OWNER }); run(HELP, w);
    const p = w._gcFixNewJob({ id: 'N_' + via, name: 'x', pm: OWNER.name, type: 'Roofing', createdBy: OWNER.name, commissionSource: 'self', leadSource: 'Self-generated (' + OWNER.name + ')', pmSourced: true }, via);
    ok(p.pm === '' && p.needsPm === true && p.commissionSource === 'company' && p.owner === 'GrayCo' && p.leadSource === 'GrayCo' && p.pmSourced === false && p.estimator === LEN, 'via ' + via + ': an owner\'s new job → GrayCo lead, PM blank + needsPm, Lead Estimator', p);
  });
  const w = makeWin({ projects: PROJECTS, me: OWNER }); run(HELP, w);
  const pl = w._gcFixNewJob({ id: 'L1', pm: PMU.name, type: 'Roofing', createdBy: OWNER.name }, 'launch');
  ok(pl.pm === PMU.name && !pl.needsPm, 'Launch Job: the PM an owner picks in the form is kept');
  const wp = makeWin({ projects: PROJECTS, me: PMU }); run(HELP, wp);
  const pp = wp._gcFixNewJob({ id: 'P1', pm: PMU.name, type: 'Roofing', createdBy: PMU.name }, 'estimate');
  ok(pp.pm === PMU.name && !pp.needsPm, 'a PM\'s own new job keeps him as PM');
  ok(html.indexOf('pm:Le.pm||(window._gcAutoPmFor?window._gcAutoPmFor(n.name):"")') >= 0, 'Launch Job / New Project: the PM is not defaulted to an owner');
  ok(/if\(\['active','approved'\]\.indexOf\(p\.status\) < 0 && !\(p\.needsPm === true/.test(html), 'the admins\' "no PM assigned" alert lists an owner\'s new job');
  const J = require(path.join(build, 'netlify', 'functions', '_lib', 'jobdata.js'));
  const IX = J.index({ customers: [], projects: [], invs: [], schedule: [], docs: [] });
  ok(J.check({ id: 'Q', name: 'Q', address: '1 A', status: 'bidding', type: 'Roofing', needsPm: true }, IX).need.map(x => x.key).join() === 'pmAssign', 'Missing job data: "PM — an owner assigns it"');
}
section('DUPJOB2: a job / lead entered by hand (patch CC2 / LEADHOLD stamp)');
{
  const STAMP = scriptAround(html, 'W._gcSelfStamp = function');
  ok(STAMP.length > 1000, 'the hand-entry stamp is in the page');
  const stampAs = (u, kind) => { const w = makeWin({ projects: PROJECTS, me: u }); w.navigator = { clipboard: null }; w.document.documentElement = { classList: { contains: () => false } }; run(HELP, w); try { run(STAMP, w); } catch (e) { return { err: String(e) }; } return w._gcSelfStamp({ id: 'H1', name: 'Hand job', address: '9 Test Rd' }, kind, 'desk'); };
  const o = stampAs(OWNER, 'job');
  ok(!o.err && o.pm === undefined || o.pm === '', 'an owner enters a job → no PM', o);
  ok(o.needsPm === true && o.estimator === LEN && o.leadSource === 'GrayCo' && !o.selfGenerated, 'an owner\'s job: needsPm, the Lead Estimator, a GrayCo lead', o);
  const ol = stampAs(OWNER, 'lead');
  ok(!s0(ol.pm) && ol.estimator === LEN, 'an owner enters a lead → no PM, the Lead Estimator', ol);
  const of = stampAs(OFFICEU, 'job');
  ok(!s0(of.pm), 'the office enters a job → no PM (never the office person)', of);
  const pmj = stampAs(PMU, 'job');
  ok(s0(pmj.pm) === s0(PMU.name), 'a PM enters a job → it is his', pmj);
}
function s0(v){ return v == null ? '' : String(v).trim(); }
section('DUPJOB4: saving a job never changes its PM unless the person changed it');
{
  const A = 'e.jsx(re,{l:"Project Manager",children:e.jsxs("select",{style:R,value:y.pm,onChange:j=>T({...y,pm:j.target.value}),children:', B = ']})}),e.jsx(re,{l:"Address",s:2,';
  const i = html.indexOf(A), k = html.indexOf(B, i);
  ok(i > 0 && k > i, 'the job form\'s PM select is in the page');
  const kids = html.slice(i + A.length, k + 1);
  const w = makeWin({ projects: PROJECTS }); run(HELP, w);
  const render = pm => vm.runInContext('(function(e, An, y){ return ' + kids + '; })', vm.createContext(w))({ jsx: (t, p, key) => ({ t, p, key }) }, USERS.map(u => Object.assign({ active: true }, u)), { pm });
  const flat = a => [].concat(...a.map(x => Array.isArray(x) ? x : [x])).filter(Boolean);
  const vals = pm => flat(render(pm)).map(o => o.p.value);
  const S251PM = 'Glenn Miller — 0 jobs · 16 leads · $0';
  ok(vals(S251PM).indexOf(S251PM) >= 0, 'a stored PM that is not a PM (S251\'s) is an option, so the controlled select keeps it on save');
  ok(flat(render(S251PM)).some(o => o.p.value === S251PM && /^⚠ Glenn Miller \(not a PM\)$/.test(o.p.children)), 'shown as "⚠ <name> (not a PM)"');
  ok(vals('Office').indexOf('Office') >= 0 && vals('Some Old PM').indexOf('Some Old PM') >= 0, '"Office" and an unknown old name are kept the same way');
  ok(vals(PMU.name).filter(v => v === PMU.name).length === 1, 'a real PM: listed once, no extra option');
  ok(vals('').indexOf('') === 0 && vals('').length === flat(render('')).length, 'no PM: "Unassigned", nothing added');
  ok(html.indexOf("(s(p.pm) && pmNames().indexOf(s(p.pm)) < 0 ? opt(s(p.pm), p.pm, '\\u26a0 ' + s(p.pm) + ' (not a PM)') : '')") > 0, 'Missing job data "Fix": the stored PM stays selectable');
  ok(html.indexOf('value:Le.pm||(window._gcAutoPmFor?window._gcAutoPmFor(n.name):n.name)') > 0 && html.indexOf('— no PM yet (an owner assigns) —') > 0, 'Launch Job shows what is saved (no PM unless one is picked)');
}
section('DUPJOB3: owners are a role, not names in the code');
{
  const w = makeWin({ projects: PROJECTS }); run(HELP, w);
  const owners = USERS.filter(u => /^admin$/i.test(u.role)).map(u => u.name.trim()).sort();
  ok(JSON.stringify(w._gcOwnerNames().slice().sort()) === JSON.stringify(owners), 'the owners = the Admin-role people in the staff list', w._gcOwnerNames());
  ok(w._gcIsOwnerEmail(OWNER.email) && !w._gcIsOwnerEmail(OFFICEU.email) && !w._gcIsOwnerEmail(PMU.email), 'owner by e-mail: the role decides (not the office, not a PM)');
  const two = USERS.map(u => Object.assign({}, u)); two.find(u => u.id === OWNER.id).active = false;
  w._crm.users = two;
  ok(w._gcOwnerNames().indexOf(OWNER.name.trim()) < 0, 'an owner turned off in the staff list drops out everywhere (no code change)');
  const gone = [
    "u.name==='Wesley Johnson'", 'em==="wjohnson@grayco-cs.com"', "em === 'nthomas@grayco-cs.com'", 'followUpFor:["Nick Thomas","Wesley Johnson"]',
    'forUsers:["Nick Thomas","Wesley Johnson"]', '_pm="Wesley Johnson"', '_pm="Nick Thomas"', "var core=['Wesley Johnson','Nick Thomas'];",
    'var core=[{id:"U2",name:"Wesley Johnson"}', "['Wesley Johnson','Nick Thomas'].forEach", "||'Wesley';", "||'Wesley',", "'Wesley'; \n",
    "DEF = ['nthomas@grayco-cs.com', 'wjohnson@grayco-cs.com']", "[OWNERS.w, OWNERS.n].forEach", "low(x.email) === 'wjohnson@grayco-cs.com'", 'approvedBy: "Wesley Johnson"',
    "est.estimator || 'Wesley Johnson'"];
  const left = gone.filter(g => html.indexOf(g) >= 0);
  ok(left.length === 0, 'no named person left in those conditions / defaults of the page', left);
  ok(html.indexOf("/commercial/.test(roleText(u))") < 0, 'the commercial check is a role (Lead Estimator / Estimator), not a title');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
