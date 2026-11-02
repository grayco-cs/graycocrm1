// test_AUTOPANEL2.mjs [build-dir] — patch AUTOPANEL2, Node only (no browser, nothing leaves): the page's own code, taken out
// of index.html and run in a small sandbox.
//   1. ⚡ core: a "held" record of this computer (and the batch not sent yet) survives a page reload, and is sent after it;
//   2. progress-slider auto-draw (_gcSetProjectPct) OFF: "held" is recorded before the % is saved (even when the save
//      fails), no draw invoice; ON: the draw invoice is made;
//   3. AUT3 ensureDraws: job stages ON + progress auto-draw OFF → a draw because the % moved is held, not made; the
//      Complete-stage final invoice (job stages) still is;
//   4. missed-call text-back: one default for the server and the panel (ON, 🔒 safety); the panel asks before ON and OFF;
//   5. AUTOPANEL3: "CompanyCam % -> job %" and "Invoice auto-mark-paid" have switches, OFF by default (held, nothing changed).
// Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { createRequire } from 'module';
const BUILD = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..'));
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const AUTO = createRequire(path.join(BUILD, 'netlify', 'functions', 'x.js'))('./_lib/automations.js');
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
function between(a, b, from){ const i = html.indexOf(a, from || 0); if (i < 0) throw new Error('not found: ' + a.slice(0, 80)); const j = html.indexOf(b, i + a.length); if (j < 0) throw new Error('no end for: ' + a.slice(0, 80)); return html.slice(i, j); }
const CORE = between('<script id="gc-patch-autopanel-core">', '</script>').replace('<script id="gc-patch-autopanel-core">', '');
const PCT = between('window._gcSetProjectPct = function(pid, val){', '\n};\n') + '\n};\n';
const ENS = between('function ensureDraws(pid, why){', '\n}\n') + '\n}\n';
ok(html.split('/* __GC_PATCH_AUTOPANEL2__ */').length === 2, 'index.html carries the AUTOPANEL2 marker once');

/* a page: window = the sandbox, a localStorage shared across "reloads", timers held until run() */
function page(store, opts){
  opts = opts || {};
  const timers = [], posts = [];
  const ls = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } };
  const w = { console: { log(){}, warn(){} }, localStorage: ls, JSON, Date, Math, Promise, Object, Array, String, Number, parseFloat, isNaN, Error,
    setTimeout: (f, ms) => { timers.push(f); return timers.length; }, setInterval: () => 0, clearInterval(){}, clearTimeout(){},
    document: { hidden: false, addEventListener(){} }, dispatchEvent(){}, CustomEvent: function(){},
    __GC_AUTH__: { email: () => 'wjohnson@grayco-cs.com', isAdmin: () => true },
    fetch: async (u, o) => { const b = o && o.body ? JSON.parse(o.body) : null; posts.push({ m: (o && o.method) || 'GET', b });
      const row = opts.row || {};
      return { status: 200, text: async () => JSON.stringify({ settings: AUTO.all(row), row, log: [], admin: true }) }; } };
  w.window = w;
  vm.createContext(w);
  vm.runInContext(CORE, w);
  w.__run = async () => { while (timers.length) { const f = timers.shift(); try { f(); } catch (e) {} } await new Promise(r => setImmediate(r)); };
  w.__posts = posts;
  return w;
}

/* ══ 1. held survives a reload ══ */
console.log('1. ⚡ core: "held" survives a page reload');
{
  const store = new Map();
  const p1 = page(store);
  ok(p1._gcAutoOn('progress_autodraw') === false, 'progress auto-draw is OFF by default (switches not read yet)');
  ok(p1._gcAutoGate('progress_autodraw', 2, ['Smith roof']) === false, 'the gate says no while it is OFF');
  ok((p1._gcAutomations.state().localHeld.progress_autodraw || {}).n === 1, 'and records "held" on this computer');
  const saved = JSON.parse(store.get('gc_auto_held_local') || '{}');
  ok(saved.held && saved.held.progress_autodraw && saved.pend && saved.pend.progress_autodraw && saved.pend.progress_autodraw.n === 2, 'kept in localStorage (the record and the batch not sent yet)', saved);
  /* the page reloads before the 4-second send */
  const p2 = page(store);
  const lh = p2._gcAutomations.state().localHeld.progress_autodraw || {};
  ok(lh.n === 1 && lh.would === 2 && lh.sample[0] === 'Smith roof', 'after a reload the page still shows it held ("held on this computer")', lh);
  await p2.__run();
  const sent = p2.__posts.filter(x => x.b && x.b.op === 'held');
  ok(sent.length === 1 && sent[0].b.items.some(i => i.key === 'progress_autodraw' && i.n === 2), 'and the batch that was not sent before the reload is sent now (gc_auto_held)', p2.__posts);
  ok(!(JSON.parse(store.get('gc_auto_held_local')).pend || {}).progress_autodraw, 'once sent it is not sent again');
  const p3 = page(store); await p3.__run();
  ok(!p3.__posts.some(x => x.b && x.b.op === 'held'), 'a second reload sends nothing twice');
  ok(p3._gcAutoGate('progress_autodraw', 1) === false && (p3._gcAutomations.state().localHeld.progress_autodraw || {}).n === 2, 'held again → the count goes on (2)');
  store.set('gc_auto_held_local', '{not json'); let p4; try { p4 = page(store); } catch (e) {}
  ok(!!p4 && p4._gcAutoOn('progress_autodraw') === false, 'a broken saved copy is ignored');
}

/* ══ 2. the slider ══ */
console.log('2. progress-slider auto-draw (_gcSetProjectPct)');
async function slider(row){
  const store = new Map(), w = page(store, { row });
  if (row) { await w._gcAutomations.load(); }
  const inv = [], saves = [], alerts = [];
  w.__proj = { id: 'P1', name: 'Smith roof', pct: 10, contract: 10000, client: 'Ann Smith' };
  w._crm = { projects: [w.__proj], invoices: [] };
  w._gcFindProject = pid => pid === 'P1' ? w.__proj : null;
  w._gcDrawMilestones = () => [{ n: 1, at: 50, share: 50, pctOfContract: .5 }, { n: 2, at: 100, share: 50, pctOfContract: .5 }];
  w._gcDrawInvoiced = () => null;
  w._gcClientInvoiced = () => 1;   /* something billed already → the consolidated draw, not the final */
  w._setInvoices = f => { inv.push(f([])); };
  w._setProjects = f => { saves.push(f([w.__proj])); };
  w.alert = m => alerts.push(String(m)); w._setView = () => {};
  vm.runInContext(PCT, w);
  return { w, inv, saves, alerts };
}
{
  const t = await slider(null);
  t.w._setProjects = () => { throw new Error('the save failed'); };
  let err = null; try { t.w._gcSetProjectPct('P1', 60); } catch (e) { err = e.message; }
  ok(err === 'the save failed' && (t.w._gcAutomations.state().localHeld.progress_autodraw || {}).n === 1, 'OFF: "held" is recorded before the % is saved — even a failing save cannot skip it', [err, t.w._gcAutomations.state().localHeld]);
  const t2 = await slider(null);
  t2.w._gcSetProjectPct('P1', 60);
  ok(t2.saves.length === 1 && t2.saves[0][0].pct === 60, 'OFF: the % is still saved (60)');
  ok(t2.inv.length === 0 && !t2.alerts.length, 'OFF: no draw invoice, no message', [t2.inv, t2.alerts]);
  ok((t2.w._gcAutomations.state().localHeld.progress_autodraw || {}).would === 1, 'OFF: held "would have done 1"');
  const t3 = await slider({ progress_autodraw: true });
  t3.w._gcSetProjectPct('P1', 60);
  ok(t3.inv.length === 1 && t3.inv[0][0].createdBy === 'auto-draw' && !t3.w._gcAutomations.state().localHeld.progress_autodraw, 'ON: the draw invoice is made (and nothing held)', t3.inv);
  const t4 = await slider(null);
  t4.w.__proj.pct = 60; t4.w._gcDrawInvoiced = (pid, n) => n === 1 ? { id: 'INV-d1' } : null; t4.w._gcSetProjectPct('P1', 70);
  ok(!t4.w._gcAutomations.state().localHeld.progress_autodraw, 'no draw due → nothing held');
}

/* ══ 3. AUT3 ensureDraws ══ */
console.log('3. AUT3: a draw because the % moved needs "Progress-slider auto-draw" ON too');
async function aut3(row){
  const w = page(new Map(), { row }); await w._gcAutomations.load();
  const inv = [];
  const p = { id: 'P1', name: 'Smith roof', pct: 60, contract: 10000, client: 'Ann Smith' };
  w._gcDrawMilestones = () => [{ n: 1, at: 50 }, { n: 2, at: 100 }];
  w._gcClientInvoiced = () => 0;
  w._setInvoices = f => { inv.push(f([])); };
  const A = { proj: () => p, jobAuto: () => true, saveProject(){ return Promise.resolve(); }, jobNote(){}, emit(){} };
  const make = vm.runInContext('(function(W, A, crm, s, num, arr, today, addDays, nowIso, ST, DRAFTED){ ' + ENS + ' return ensureDraws; })', w);
  const ens = make(w, A, () => ({ invoices: [] }), v => v == null ? '' : String(v).trim(), v => parseFloat(String(v == null ? '' : v).replace(/[$,]/g, '')) || 0,
    v => Array.isArray(v) ? v : [], () => '2026-11-02', d => d, () => new Date().toISOString(), () => 0, {});
  return { w, inv, ens };
}
{
  const a = await aut3({ job_stages: true, progress_autodraw: false });
  ok(a.ens('P1', 'pct') === null && a.inv.length === 0, 'job stages ON, progress auto-draw OFF: the % moved → no draw invoice', a.inv);
  ok((a.w._gcAutomations.state().localHeld.progress_autodraw || {}).n === 1, '… and "held" recorded for progress auto-draw');
  ok(a.ens('P1') && a.inv.length === 1 && /auto-draw \(milestone\)/.test(a.inv[0][0].createdBy), 'the Complete-stage final / draw (job stages) is still made', a.inv);
  const b = await aut3({ job_stages: true, progress_autodraw: true });
  ok(b.ens('P1', 'pct') && b.inv.length === 1, 'both ON: the % moved → the draw invoice is made');
  const c = await aut3({ job_stages: false, progress_autodraw: true });
  ok(c.ens('P1', 'pct') === null && c.inv.length === 0 && (c.w._gcAutomations.state().localHeld.job_stages || {}).n === 1, 'job stages OFF: nothing (held for job stages)');
  ok(/ensureDraws\(d\.pid, 'pct'\)/.test(html) && /ensureDraws\(pid, 'pct'\)/.test(html) && !/ensureDraws\(d\.pid\)/.test(html), 'every progress-move caller says it is a progress move');
}

/* ══ 4. missed-call text-back ══ */
console.log('4. missed-call text-back: one default, asks both ways');
{
  const m = AUTO.BY.missed_call_textback;
  ok(m.defaultOn === true && m.critical && m.group === 'safety' && m.effect === 'A', 'registry: 🔒 safety, ON by default, sends to customers', m);
  const fn = fs.readFileSync(path.join(BUILD, 'netlify', 'functions', 'missed-call.js'), 'utf8');
  ok(/isOn\('missed_call_textback'\)/.test(fn) && /require\('\.\/_lib\/pause'\)\.install\(\)/.test(fn), 'the server asks the same switch (default ON = texts as today); pause still installed');
  ok(AUTO.valueOf({}, 'missed_call_textback') === true && AUTO.valueOf(null, 'missed_call_textback') === true, 'no row / unreadable row → ON (the server and the panel use this one rule)');
  const w = page(new Map(), { row: {} }); await w._gcAutomations.load();
  ok(w._gcAutomations.state().settings.missed_call_textback === true, 'the panel\'s switch state with no row → ON');
  ok(/if \(want && a\.group === 'safety' && !confirm\('Turn ON "'/.test(html) && /if \(!want && a\.critical && !confirm\('Turn OFF "'/.test(html), 'the panel confirms a safety switch before ON and before OFF');
}
/* ══ 5. AUTOPANEL3: the two timers that had no switch ══ */
console.log('5. AUTOPANEL3: CompanyCam % -> job % and invoice auto-mark-paid have switches (default OFF)');
{
  const cc = AUTO.BY.cc_pct_sync, mp = AUTO.BY.auto_mark_paid, js = AUTO.BY.job_stages;
  ok(cc && cc.defaultOn === false && cc.effect === 'C' && cc.group === 'rec' && cc.where === 'page' && !cc.critical, 'registry: cc_pct_sync — record change, page, OFF by default', cc);
  ok(mp && mp.defaultOn === false && mp.effect === 'C' && mp.group === 'rec' && mp.where === 'page' && !mp.critical && /guess/i.test(mp.desc), 'registry: auto_mark_paid — record change (a guess), OFF by default', mp);
  ok(/Progress-slider auto-draw/.test(js.desc) && !/milestone \/ final draws/.test(js.desc), 'job_stages says a draw because the % moved also needs progress auto-draw', js.desc);
  const mm = /\/\* AUTOREG-BEGIN \*\/\n([\s\S]*?)\/\* AUTOREG-END \*\//.exec(html);
  ok(!!mm && mm[1] === fs.readFileSync(path.join(BUILD, 'netlify', 'functions', '_lib', 'automations.js'), 'utf8'), 'the page still carries _lib/automations.js word for word');
  ok(/var STATE = \{ cc_pct_sync: [^}]*auto_mark_paid: /.test(html), 'the panel warns how many are waiting before either is switched ON');
  const CCF = between('window._gcAutoInvoiceFromProgress = function(){', '\n  };\n') + '\n  };\n';
  const MPF = between('window._gcAutoMarkPaid = function(){', '\n  };\n') + '\n  };\n';
  async function acct(row){
    const w = page(new Map(), { row }); await w._gcAutomations.load();
    const pctCalls = [], invSets = [];
    w._crm = { projects: [{ id: 'P1', name: 'Smith roof', status: 'active', pct: 10, ccProgressPct: 60 }, { id: 'P2', name: 'Done', status: 'active', pct: 50, ccProgressPct: 50 }],
      invoices: [{ id: 'I1', pid: 'P1', type: 'client', status: 'sent', amt: 5000, desc: 'Draw 1' }, { id: 'I2', pid: 'P1', type: 'client', status: 'sent', amt: 1234 }],
      projectPayments: [{ id: 'PAY1', pid: 'P1', amount: 5000, method: 'check' }] };
    w._gcSetProjectPct = (pid, v) => pctCalls.push([pid, v]);
    w._setInvoices = f => { invSets.push(f(w._crm.invoices)); };
    w.__GC_ALERT_BAR__ = null;
    vm.runInContext(CCF + MPF, w);
    w._gcAutoInvoiceFromProgress(); w._gcAutoMarkPaid();
    return { w, pctCalls, invSets, lh: w._gcAutomations.state().localHeld };
  }
  const off = await acct({});
  ok(off.pctCalls.length === 0 && (off.lh.cc_pct_sync || {}).would === 1 && /Smith roof 10% -> 60%/.test((off.lh.cc_pct_sync || {}).sample[0]), 'OFF: the job % is left alone, held "would have done 1" (Smith roof 10% -> 60%)', [off.pctCalls, off.lh.cc_pct_sync]);
  ok(off.invSets.length === 0 && !off.w._crm.projectPayments[0]._linkedInv && (off.lh.auto_mark_paid || {}).would === 1, 'OFF: no invoice marked paid, payment not linked, held "would have done 1"', [off.invSets, off.lh.auto_mark_paid]);
  const on = await acct({ cc_pct_sync: true, auto_mark_paid: true });
  ok(on.pctCalls.length === 1 && on.pctCalls[0][0] === 'P1' && on.pctCalls[0][1] === 60 && !on.lh.cc_pct_sync, 'ON: the CompanyCam % is copied to the job (P1 → 60)', on.pctCalls);
  const paid = on.invSets[0] || [];
  ok(paid.length === 2 && paid.find(i => i.id === 'I1').status === 'paid' && paid.find(i => i.id === 'I1')._autoPaid && paid.find(i => i.id === 'I2').status === 'sent', 'ON: the same-job, same-amount invoice is marked paid (as before)', paid);
  const none = page(new Map(), { row: {} }); await none._gcAutomations.load();
  none._crm = { projects: [{ id: 'P1', status: 'active', pct: 60, ccProgressPct: 60 }], invoices: [], projectPayments: [] };
  vm.runInContext(CCF + MPF, none); none._gcAutoInvoiceFromProgress(); none._gcAutoMarkPaid();
  ok(!none._gcAutomations.state().localHeld.cc_pct_sync && !none._gcAutomations.state().localHeld.auto_mark_paid, 'nothing waiting → nothing held');
}
console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
