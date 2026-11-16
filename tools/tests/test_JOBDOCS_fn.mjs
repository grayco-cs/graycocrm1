// test_JOBDOCS_fn.mjs <build-dir> — node-only (no browser) checks of patch JOBDOCS (paperwork by job type) with the owner's 11/16 answers.
// Runs index.html's own script blocks (LEADASB ☣️ card, JOBSTEPS words, LEADASB3 start gate, JOBDOCS) in a vm with a tiny DOM stand-in.
// Made-up data only; nothing leaves the machine.
//   1. each job type → its papers (asbestos, lead, lead + asbestos, mold, water, fire, construction); "needs a form" upload slots.
//   2. owner (b): a Construction-company "Water Damage" / "Fire Damage" job is a construction job — rebuild papers only, not emergency.
//   3. assignment: idempotent, type change drops untouched / keeps handled, a new job gets its list; older jobs untouched.
//   4. 🔒 start gate: asbestos → Asbestos 01; owner (a) Environmental mold job → the mold disclosure; Mitigation mold / water / fire
//      never; given → starts; admin Start anyway.
//   5. owner (c): asbestos / lead on an emergency job → one To-Do for GrayCo Environmental (its PM), linked to the job; no block; no repeat.
//   6. the admin's table edit is used by the next job; a non-admin cannot save.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = id => { const i = html.indexOf('<script id="' + id + '">'); if (i < 0) return ''; const st = html.indexOf('>', i) + 1; return html.slice(st, html.indexOf('</script>', st)); };
const SRC = ['gc-patch-leadasb', 'gc-patch-jobsteps', 'gc-patch-leadasb3', 'gc-patch-jobdocs'].map(id => [id, block(id)]);
ok('0 index.html has the LEADASB, JOBSTEPS, LEADASB3 and JOBDOCS scripts', SRC.every(([, s]) => s.length > 2000), SRC.map(([k, s]) => [k, s.length]));
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ── a tiny DOM + window ── */
function el(tag){ const e = { tagName: String(tag).toUpperCase(), style: {}, attrs: {}, children: [], innerHTML: '', textContent: '', parentElement: null,
  setAttribute(k, v){ this.attrs[k] = String(v); }, getAttribute(k){ return this.attrs[k] == null ? null : this.attrs[k]; }, hasAttribute(k){ return k in this.attrs; },
  appendChild(c){ c.parentElement = this; this.children.push(c); return c; }, insertBefore(c){ return this.appendChild(c); }, remove(){ if (this.parentElement) { const l = this.parentElement.children; l.splice(l.indexOf(this), 1); this.parentElement = null; } },
  addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, contains(){ return false; }, focus(){} }; return e; }
const LIS = {}, IV = [];
const D = { hidden: false, body: el('body'), head: el('head'), documentElement: { classList: { contains: () => false } }, activeElement: null,
  addEventListener(t, f){ (LIS[t] = LIS[t] || []).push(f); }, getElementById(id){ return D.body.children.find(c => c.id === id) || D.head.children.find(c => c.id === id) || null; },
  querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementsByTagName(){ return []; }, createElement: el };
const store = {}; const LS = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const KV = {}, PROMPTS = [];
let ADMIN = true;
const W = { document: D, localStorage: LS, console, JSON, Date, Math, Promise, Object, Array, String, Number, RegExp, Error, isNaN, parseInt, parseFloat, encodeURIComponent,
  __GC_NATIVE_SETTIMEOUT__: (f, ms) => { IV.push({ f, ms, once: true }); return IV.length; }, __GC_NATIVE_SETINTERVAL__: (f, ms) => { IV.push({ f, ms }); return IV.length; },
  setTimeout: (f, ms) => { IV.push({ f, ms, once: true }); return 0; }, setInterval: (f, ms) => { IV.push({ f, ms }); return 0; },
  __GC_AUTH__: { isAdmin: () => ADMIN, email: () => 'wjohnson@grayco-cs.com' },
  _ehSb: k => Promise.resolve(KV[k] === undefined ? [] : KV[k]), _supaUpsertNow: (k, v) => { KV[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(true); },
  prompt: (m, d) => { PROMPTS.push(m); return '1'; }, alert: () => {}, confirm: () => true, fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, items: [] }) }),
  _gcCo: { ofJob: p => (p && ['construction', 'mitigation', 'environmental'].includes(p.companyId) ? p.companyId : 'construction') },
  _gcJobIsInsurance: p => !!(p && p.claimNo), _gcJobKind: p => (/commercial/i.test((p && p.type) || '') ? 'commercial' : 'residential'),
  _gcDocLib: { builtins: () => [], send: () => Promise.resolve({ ok: true }), open: () => {} } };
W.window = W;
W._crm = { projects: [], projectDocs: [], users: [] };
let WRITES = 0;
W._setProjects = f => { WRITES++; W._crm.projects = typeof f === 'function' ? f(W._crm.projects) : f; };
W._setProjectDocs = f => { W._crm.projectDocs = typeof f === 'function' ? f(W._crm.projectDocs) : f; };
store.grayco_user = JSON.stringify({ name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner' });
vm.createContext(W);
for (const [id, s] of SRC) { try { vm.runInContext(s, W, { filename: id }); } catch (e) { ok('load ' + id, false, String(e.stack || e).slice(0, 500)); } }
const JD = W._gcJobDocs, LA3 = W._gcLeadAsb3;
ok('0 _gcJobDocs and the start gate are up', !!JD && !!LA3 && typeof LA3.gateMiss === 'function');
const now = new Date().toISOString(), old = '2026-10-01T15:00:00.000Z';
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, address: id + ' Demo St, Memphis, TN 38135', status: 'active', pct: 0, startDate: day(6), pm: 'Demo PM', createdAt: now, updatedAt: now }, o);
W._crm.users = [{ name: 'Wesley Johnson', role: 'Admin', payType: 'owner', companies: ['construction', 'mitigation', 'environmental'] }, { name: 'Erin Env', role: 'Project Manager', companies: ['environmental'], active: true }, { name: 'Mo Mit', role: 'Project Manager', companies: ['mitigation'], active: true }];
W._crm.projects = [
  J('PA', { type: 'Environmental', companyId: 'environmental', description: 'Asbestos floor tile removal' }),
  J('PW', { type: 'Water Damage', companyId: 'mitigation' }),
  J('PF', { type: 'Fire Damage', companyId: 'mitigation' }),
  J('PMM', { type: 'Mold', companyId: 'mitigation', name: 'Demo mold emergency' }),
  J('PME', { type: 'Mold Remediation', companyId: 'environmental', name: 'Demo mold remediation' }),
  J('PL', { type: 'Residential Reno', leadAsb: { yearBuilt: 1962, disturbsPaint: true } }),
  J('PLA', { type: 'Environmental', companyId: 'environmental', description: 'Lead paint and asbestos abatement' }),
  J('PC', { type: 'Kitchen' }),
  J('PCW', { type: 'Water Damage', name: 'Demo rebuild after a leak' }),
  J('PCF', { type: 'Fire Damage', name: 'Demo rebuild after a fire' }),
  J('PWA', { type: 'Water Damage', companyId: 'mitigation', description: 'Pipe burst — suspect asbestos in the ceiling texture', leadAsb: { asbFound: day(-1) } }),
  J('PFL', { type: 'Fire Damage', companyId: 'mitigation', description: 'Smoke cleaning in a 1950s home — lead paint on the trim' }),
  J('POLD', { type: 'Water Damage', companyId: 'mitigation', createdAt: old, updatedAt: old })];
const P = id => W._crm.projects.find(p => p.id === id);
const K = id => ((P(id).jobDocs || {}).items || []).map(x => x.k);
const has = (id, ...ks) => ks.every(k => K(id).includes(k));
const item = (id, k) => ((P(id).jobDocs || {}).items || []).find(x => x.k === k);
JD.sweep();
/* ═ 1 ═ */
ok('1a asbestos → testing auth, Asbestos 01 🔒, abatement agreement, waste log, clearance, Asbestos 02 (no contract)', has('PA', 'gcb_asb_testing_auth', 'gcb_asb_01', 'gcb_env_abatement_agreement', 'gcb_env_waste_log', 'gcb_env_clearance', 'gcb_asb_02') && item('PA', 'gcb_asb_01').gate && !has('PA', 'gcb_contract'), K('PA'));
ok('1b water (Mitigation) → emergency auth, drying log, certificate of drying', has('PW', 'gcb_water_emergency_auth', 'gcb_drying_log', 'gcb_water_dry_cert') && JSON.stringify(P('PW').jobDocs.types) === '["water"]', K('PW'));
ok('1c fire (Mitigation) → board-up, fire work auth, pack-out + the smoke/odor record as an upload slot', has('PF', 'gcb_board_up_auth', 'gcb_fire_work_auth', 'gcb_packout_auth') && P('PF').jobDocs.items.some(x => x.needsForm && /smoke \/ odor/i.test(x.label)), K('PF'));
ok('1d mold → disclosure, assessment, agreement, clearance + the protocol upload slot', has('PME', 'gcb_mold', 'gcb_mold_assessment_auth', 'gcb_mold_contract', 'gcb_mold_clearance_cert') && P('PME').jobDocs.items.some(x => x.needsForm && /protocol/i.test(x.label)), K('PME'));
ok('1e lead reno in TN → Lead 01 🔒, Lead 03, + construction set with the TN rider; the HUD notice only on HUD jobs', has('PL', 'gcb_lead_01', 'gcb_lead_03', 'gcb_contract', 'gcb_rider_tn') && !P('PL').jobDocs.items.some(x => /HUD/.test(x.label)), K('PL'));
ok('1f lead + asbestos → both + the combo, shared papers once', ['lead', 'asbestos', 'lead+asbestos'].every(t => P('PLA').jobDocs.types.includes(t)) && K('PLA').filter(k => k === 'gcb_env_abatement_agreement').length === 1 && new Set(K('PLA')).size === K('PLA').length, K('PLA'));
ok('1g construction (kitchen) → contract, scope, selections, change orders, completion, warranty', has('PC', 'gcb_contract', 'gcb_scope', 'gcb_selections', 'gcb_change_order', 'gcb_completion', 'gcb_warranty') && JSON.stringify(P('PC').jobDocs.types) === '["construction"]');
ok('1h optional papers stay out of the defaults (no waiver of right to cancel, cancel notices, lien waivers, satisfaction)', !W._crm.projects.some(p => (p.jobDocs && p.jobDocs.items || []).some(x => /cancel|lien|satisfaction/.test(x.k))));
/* ═ 2 ═ */
ok('2 owner (b): Construction-company "Water Damage" / "Fire Damage" → construction papers only (no mitigation set), not emergency', JSON.stringify(P('PCW').jobDocs.types) === '["construction"]' && JSON.stringify(P('PCF').jobDocs.types) === '["construction"]' && !has('PCW', 'gcb_water_emergency_auth') && !has('PCF', 'gcb_fire_work_auth') && has('PCW', 'gcb_contract') && !JD.emergency(P('PCW')) && !JD.emergency(P('PCF')), { w: P('PCW').jobDocs.types, f: P('PCF').jobDocs.types });
/* ═ 3 ═ */
ok('3a an older job is left alone', !P('POLD').jobDocs);
const w0 = WRITES, pa0 = JSON.stringify(P('PA').jobDocs);
JD.sweep(); JD.sweep();
ok('3b sweeping again changes nothing (no write, no duplicates)', WRITES === w0 && JSON.stringify(P('PA').jobDocs) === pa0 && JD.assign('PA') === false);
JD.markDone('PW', 'gcb_drying_log', 'in the job file'); IV.filter(x => x.once).splice(0).forEach(x => x.f()); IV.splice(0, IV.length, ...IV.filter(x => !x.once));
JD.notNeeded('PW', 'gcb_mit_first_call');
W._crm.projects = W._crm.projects.map(p => p.id === 'PW' ? Object.assign({}, p, { type: 'Fire Damage' }) : p);
JD.sweep();
ok('3c type change water → fire: fire papers in, untouched water papers out, handled ones kept (stale), shared once', has('PW', 'gcb_fire_work_auth') && !has('PW', 'gcb_water_emergency_auth') && item('PW', 'gcb_drying_log') && item('PW', 'gcb_drying_log').stale && item('PW', 'gcb_mit_first_call') && item('PW', 'gcb_mit_first_call').stale && K('PW').filter(k => k === 'gcb_contents_disposal').length === 1, K('PW'));
W._crm.projects = W._crm.projects.concat([J('PNEW', { type: 'Mold', companyId: 'environmental', status: 'bidding' })]);
JD.sweep();
ok('3d a job made now gets its list', has('PNEW', 'gcb_mold', 'gcb_mold_clearance_cert'));
/* ═ 4 ═ */
const miss = id => LA3.gateMiss(P(id));
ok('4a asbestos job → the gate wants Asbestos 01', JSON.stringify(miss('PA')) === '["A01"]', miss('PA'));
ok('4b lead + asbestos → Lead 01 first, then Asbestos 01', JSON.stringify(miss('PLA')) === '["L01","A01"]', miss('PLA'));
ok('4c owner (a): Environmental mold remediation → the mold disclosure is a hard stop', JSON.stringify(miss('PME')) === '["gcb_mold"]' && item('PME', 'gcb_mold').gate === true, { m: miss('PME'), i: item('PME', 'gcb_mold') });
ok('4d …emergency mold (Mitigation), water, fire, and a water job with asbestos found → never stopped', JD.emergency(P('PMM')) && miss('PMM').length === 0 && !item('PMM', 'gcb_mold').gate && miss('PWA').length === 0 && miss('PF').length === 0, { pmm: miss('PMM'), pwa: miss('PWA') });
ok('4e construction jobs (incl. a Construction "Water Damage" rebuild) have no gate', miss('PC').length === 0 && miss('PCW').length === 0);
/* the gate in action (LEADASB3's own watcher) */
const gate = IV.find(x => x.f.name === 'gate' && x.ms === 1200).f;
const fire = t => (LIS[t] || []).forEach(f => f({ target: D.body }));
gate();   /* first look */
const start = id => { fire('pointerdown'); W._crm.projects = W._crm.projects.map(p => p.id === id ? Object.assign({}, p, { pct: 10 }) : p); gate(); };
start('PME');
let dlg = D.getElementById('gc-la3-gate');
ok('4f starting the Environmental mold job → put back to 0 % and "Give the customer Mold disclosure & disclaimer first"', P('PME').pct === 0 && dlg && /Give the customer Mold disclosure &amp; disclaimer first/.test(dlg.innerHTML) && /Start anyway \(admin\)/.test(dlg.innerHTML), dlg && dlg.innerHTML.slice(0, 300));
dlg.remove();
JD.markDone('PME', 'gcb_mold', 'signed'); IV.filter(x => x.once).forEach(x => x.f()); IV.splice(0, IV.length, ...IV.filter(x => !x.once));
start('PME');
ok('4g mold disclosure signed → it starts', P('PME').pct === 10 && !D.getElementById('gc-la3-gate'), miss('PME'));
start('PMM'); start('PWA');
ok('4h Mitigation mold job and the water job with asbestos start, no dialog', P('PMM').pct === 10 && P('PWA').pct === 10 && !D.getElementById('gc-la3-gate'));
start('PA'); dlg = D.getElementById('gc-la3-gate');
ok('4i asbestos job → "Give the customer Asbestos 01 first"', P('PA').pct === 0 && dlg && /Give the customer Asbestos 01 first/.test(dlg.innerHTML));
dlg.remove();
W._crm.projectDocs = [{ id: 'D1', pid: 'PA', name: 'Asbestos 01 signed - Client PA.pdf', cat: 'Other' }];
start('PA');
ok('4j a signed Asbestos 01 in the job files → it starts', P('PA').pct === 10 && !D.getElementById('gc-la3-gate'));
/* ═ 5 ═ */
let n = JD.envSweep();
const T = () => JSON.parse(store.gc_office_tasks || '[]').filter(t => t.kind === 'jobdocs_env');
let t = T();
ok('5a owner (c): asbestos on the emergency water job → one To-Do for GrayCo Environmental, linked to the job, for the Environmental PM', t.some(x => x.pid === 'PWA' && /Asbestos found on .* — GrayCo Environmental needs to get involved/.test(x.label) && x.assignee === 'Erin Env' && x.companyId === 'environmental' && x.prio === 'high'), t);
ok('5b …lead on the emergency fire job too; none for Environmental-company or construction jobs', t.some(x => x.pid === 'PFL' && /Lead found/.test(x.label)) && !t.some(x => ['PA', 'PLA', 'PL', 'PC', 'PCW'].includes(x.pid)), t.map(x => x.pid));
T(); const all = JSON.parse(store.gc_office_tasks); all.forEach(x => { if (x.pid === 'PWA') x.done = true; }); store.gc_office_tasks = JSON.stringify(all);
n = JD.envSweep();
ok('5c not repeated, and a ticked one stays ticked', n === 0 && T().filter(x => x.pid === 'PWA').length === 1 && T().find(x => x.pid === 'PWA').done === true);
ok('5d the job card says Environmental needs to get involved; no carrier names, no sub portal', /GrayCo Environmental needs to get involved/.test(JD.html(P('PWA'))) && !/state farm|allstate|geico|usaa|sub ?portal/i.test(W._crm.projects.filter(p => p.jobDocs).map(p => JD.html(p)).join(' ')));
/* ═ 6 ═ */
const tbl = JSON.parse(JSON.stringify(JD.table())); tbl.types.find(x => x.key === 'mold').items.push({ label: 'Moisture map for the mold area', when: 'during', needsForm: true, who: 'file' });
const r1 = await JD.saveTable(tbl);
ok('6a admin saves the table → gc_kv gc_jobdocs_table', r1.ok && KV.gc_jobdocs_table && KV.gc_jobdocs_table.types.find(x => x.key === 'mold').items.some(x => /Moisture map/.test(x.label)));
W._crm.projects = W._crm.projects.concat([J('PNEW2', { type: 'Mold', companyId: 'environmental' })]);
JD.sweep();
ok('6b the next mold job uses it (as an upload slot); a job that had a list picks it up, no duplicates', (P('PNEW2').jobDocs.items || []).some(x => /Moisture map/.test(x.label) && x.needsForm) && (P('PNEW').jobDocs.items || []).some(x => /Moisture map/.test(x.label)) && new Set(K('PNEW')).size === K('PNEW').length);
ADMIN = false; store.grayco_user = JSON.stringify({ name: 'Demo PM', role: 'Project Manager' });
const r2 = await JD.saveTable(JD.DEFAULT);
ok('6c a non-admin cannot save it', r2.ok === false && KV.gc_jobdocs_table.types.find(x => x.key === 'mold').items.some(x => /Moisture map/.test(x.label)));
ok('Z no JOBDOCS errors', !W.__gcJdErr, W.__gcJdErr);
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
