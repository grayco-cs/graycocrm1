// test_ESTMATH2_fn.mjs <build-dir> — patch ESTMATH2, offline (node, no browser): the Estimate Builder's own script (cut out
// of index.html, run in a VM with a stand-in page) on a TEST estimate saved at x1.3 by "Glenn Miller", Commercial, PM "Pat PM".
//   1. open it and save it without touching anything: margin, estimator, job type, PM and total unchanged (true on main too);
//   2. the production case (Hyatt v2): the open tab is replaced by a stored / synced copy (another computer's tab: x1.25,
//      estimator "Brittany Pucket", Residential) — the saved record's fields win, one note says so, Save writes them
//      (main: the copy's x1.25 / Brittany / Residential are saved as a new version);
//   3. a field changed by hand in this tab this session is kept (margin bar, estimator, job type); an older version
//      opened keeps its own margin.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const BUILD = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8').split('\n');
const st = html.findIndex(l => l.startsWith('// ─── STATE ─')); let a = st; while (!/<script[ >]/.test(html[a])) a--; let b = st; while (!/<\/script>/.test(html[b])) b++;
const SRC = html.slice(a + 1, b).join('\n');
const LINES = [{ id: 'T1', desc: 'Framing sub', qty: 1, cost: 300000, type: 'sub', cat: 'Framing', mult: 'type' },
  { id: 'T2', desc: 'Drywall hang labor 5/8 Type X 4x12', qty: 1000, cost: 28, type: 'labor', cat: 'Drywall', mult: '1.6' },
  { id: 'T3', desc: 'Drywall [5/8" Type X] 4×12 (48 SF) — All', qty: 1000, cost: 23.04, type: 'material', cat: 'Drywall', unit: 'sheet', mult: 'type' }];
const TEST = { id: 'ESTM2TEST', name: 'ESTMATH2 test estimate', num: 'EM2', gc: 'Test GC', estimator: 'Glenn Miller', pm: 'Pat PM', jobType: 'Commercial', status: 'Draft',
  date: '2026-10-26', address: '100 Test St, Memphis, TN', jobMult: 1.3, ovrMult: 1.5, useOvr: false, lines: LINES, versionNo: 1, savedAt: '2026-10-26T19:30:29.485Z' };
const charge = (jm) => 300000 * jm + 1000 * 28 * 1.6 + 1000 * 23.04 * 1.0975 * jm;
TEST.totalCharge = charge(1.3);
const r2 = n => Math.round(n * 100) / 100;
/* a builder in a VM with a stand-in page */
function builder(){
  const els = new Map(), timers = [];
  const El = id => ({ id, value: '', checked: false, style: {}, dataset: {}, innerHTML: '', textContent: '', options: [], children: [], parentNode: { insertBefore(){}, appendChild(){} },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } }, appendChild(){}, insertBefore(){}, remove(){}, addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, contains(){ return false; }, focus(){}, click(){}, getBoundingClientRect(){ return {}; } });
  const qel = id => { if (!els.has(id)) els.set(id, El(id)); return els.get(id); };
  const store = {};
  const ctx = { console: { log(){}, warn(){}, error(){}, info(){} }, navigator: { userAgent: 'node' }, location: { hash: '', href: 'x', search: '' },
    document: { getElementById: qel, querySelector(){ return null; }, querySelectorAll(){ return []; }, createElement(){ return El(''); }, body: El('body'), head: El('head'), documentElement: El('html'), addEventListener(){}, activeElement: null, readyState: 'complete' },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout(){}, setInterval: () => 0, clearInterval(){}, requestAnimationFrame: () => 0,
    alert(){}, confirm: () => false, prompt: () => null, fetch: () => new Promise(() => {}), Event: class { constructor(t){ this.type = t; } }, CustomEvent: class {}, MutationObserver: class { observe(){} disconnect(){} },
    performance: { now: () => Date.now() }, addEventListener(){}, removeEventListener(){}, matchMedia: () => ({ matches: false, addListener(){} }), getComputedStyle: () => ({}) };
  ctx.window = ctx; ctx.self = ctx; ctx.storage = { get: async () => null, set: async () => true }; ctx._crm = { projects: [] };
  vm.createContext(ctx);
  try { vm.runInContext(SRC, ctx, { filename: 'builder.js' }); } catch (e) { /* page-only start-up */ }
  const flush = () => { for (let i = 0; i < 80 && timers.length; i++) { const f = timers.shift(); try { if (typeof f === 'function') f(); } catch (e) {} } };
  flush(); timers.length = 0;
  ctx.__t = JSON.parse(JSON.stringify(TEST));
  const R = s => { const v = vm.runInContext(s, ctx); flush(); return v; };
  R('estimates = [__t]');
  return { R, ctx, flush };
}
const total = B => B.R('lines.reduce((s,l)=>s+lineCharge(l),0)');
const saved = B => { B.R("qs('ej-name').value = qs('ej-name').value || 'ESTMATH2 test estimate'; doSave(true)"); const e = B.R("estimates.find(x=>x.id==='ESTM2TEST')");
  return { jm: String(e.jobMult), tc: r2(e.totalCharge), v: e.versionNo, est: e.estimator, type: e.jobType, pm: e.pm }; };
const want13 = { jm: '1.3', tc: r2(charge(1.3)), est: 'Glenn Miller', type: 'Commercial', pm: 'Pat PM' };
const same = (a, w) => a.jm === w.jm && a.tc === w.tc && a.est === w.est && a.type === w.type && a.pm === w.pm;

/* 1. open + save */
let B = builder();
B.R("loadEst('ESTM2TEST')"); B.R('renderSummary()');
ok(B.R('String(jobMult)') === '1.3' && r2(total(B)) === r2(TEST.totalCharge), 'the test estimate opens at its saved x1.3, $' + r2(total(B)));
let s1 = saved(B);
ok(same(s1, want13), 'opened and saved without touching anything: x1.3, Glenn Miller, Commercial, PM kept, $' + want13.tc, s1);

/* 2. the open tab is replaced by a stored / synced copy (another computer's) */
const synced = B => { const tab = JSON.parse(B.R('JSON.stringify(openSlots[activeSlot])'));
  tab.jobMult = 1.25; tab.fields.estimator = 'Brittany Pucket'; tab.fields.jobType = 'Residential'; tab._pinned = false;
  B.ctx.__tab = tab; B.R('openSlots = [__tab]; activeSlot = 0; loadSlotState(); renderSlotTabs(); renderLines(); renderSummary();'); };
B = builder(); B.R("loadEst('ESTM2TEST')"); synced(B);
const k2 = B.R('JSON.stringify((openSlots[activeSlot]._keptSaved||{}).kept||[])'), msg = B.R("(openSlots[activeSlot]._keptSaved||{}).note||''");   /* the text put in the builder's message line */
console.log('   synced tab (x1.25, Brittany Pucket, Residential) -> x' + B.R('String(jobMult)') + ', ' + B.R("qs('ej-est').value") + ', ' + B.R("qs('ej-type').value") + ' | note: ' + msg);
ok(B.R('String(jobMult)') === '1.3' && B.R("qs('ej-est').value") === 'Glenn Miller' && B.R("qs('ej-type').value") === 'Commercial', 'a stored / synced tab loads with the SAVED margin x1.3, estimator Glenn Miller, job type Commercial', k2);
ok(/^Kept the saved estimator \(Glenn Miller\), job type \(Commercial\), margin x1\.3 — this tab held another copy\.$/.test(msg), 'one short note says which saved fields were kept', msg);
let s2 = saved(B);
ok(same(s2, want13), 'Save writes the saved fields (main: x1.25, Brittany Pucket, Residential as a new version)', s2);

/* 3. changed by hand in this tab, this session: kept */
B = builder(); B.R("loadEst('ESTM2TEST')");
B.R("setJM(1.25, document.createElement('button')); openSlots[activeSlot].jobMult = jobMult; renderLines(); renderSummary();");
B.R("__i = activeSlot; saveSlotState(); addNewSlot(); switchSlot(__i);");
ok(B.R('String(jobMult)') === '1.25', 'a margin set by hand (margin bar) survives a tab switch', B.R('jobMult'));
let s3 = saved(B);
ok(s3.jm === '1.25' && s3.tc === r2(charge(1.25)) && s3.est === 'Glenn Miller', 'and saves as chosen: x1.25, $' + r2(charge(1.25)), s3);
B = builder(); B.R("loadEst('ESTM2TEST')");
B.R("qs('ej-est').value = 'Brittany Pucket'; window._gcHandMark && _gcHandMark('estimator'); _gcSetJobType('Residential', true); saveSlotState();");   /* what picking them in the form does */
synced(B);
ok(B.R("qs('ej-est').value") === 'Brittany Pucket' && B.R("qs('ej-type').value") === 'Residential' && B.R('String(jobMult)') === '1.3', 'an estimator and job type picked by hand in this tab are kept; the untouched margin is still the saved x1.3', [B.R("qs('ej-est').value"), B.R("qs('ej-type').value"), B.R('String(jobMult)')]);
B = builder(); B.R("loadEst('ESTM2TEST')"); synced(B); B.R("loadEst('ESTM2TEST')");
ok(B.R('String(jobMult)') === '1.3' && !B.R('(window.__gcHandSet||{})[openSlots[activeSlot].slotId]'), 'opening it again starts the tab fresh from the record');
B = builder();
B.ctx.__t.versions = [Object.assign(JSON.parse(JSON.stringify(TEST)), { versionNo: 1, jobMult: 1.5, estimator: 'Old Estimator' })];
B.R("estimates = [__t]; loadEst('ESTM2TEST'); _gcOpenEstVersion('ESTM2TEST', 1);");
ok(B.R('String(jobMult)') === '1.5', 'opening an older version (saved at x1.5) keeps that version\'s margin', B.R('jobMult'));
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
