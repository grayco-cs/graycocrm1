// test_LEADCO.mjs <build-dir> — owner 11/12: "leads for Environmental and Mitigation go to their page for leads, only construction leads go to
// the construction page". Made-up leads only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); const at = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const L = (id, o) => Object.assign({ id, client: id, stage: 'New', createdAt: at, updatedAt: at }, o);
cset('leads', [L('Conzz Kitchen', { type: 'Residential Reno', scope: 'Kitchen remodel and new cabinets' }), L('Conzz Fire Rebuild', { type: 'Insurance', scope: 'Rebuild after a house fire — framing, drywall, roof', companyId: 'construction' }),
  L('Mitzz Burst Pipe', { scope: 'Pipe burst, water in the basement', companyId: 'construction' }), L('Mitzz Board Up', { emergency: true, scope: 'Board up after a break-in' }),
  L('Envzz Asbestos', { scope: 'Asbestos tile removal before remodel' }), L('Envzz Typed', { type: 'Environmental', scope: 'Survey' }), L('Envzz Lead Paint', { scope: 'Lead paint abatement on a 1950 house' }),
  L('Conzz Leads Word', { scope: 'Following up on the leads from the home show' }), L('Mitzz Picked', { companyId: 'mitigation', scope: 'Roof replacement' })]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
const co = await A.ev(() => window._crm.leads.map(l => l.client + '=' + window._gcCo.ofLead(l)).sort());
ok('each lead gets its company from what it is about (explicit Mitigation / Environmental kept)', JSON.stringify(co) === JSON.stringify(['Conzz Fire Rebuild=construction', 'Conzz Kitchen=construction', 'Conzz Leads Word=construction', 'Envzz Asbestos=environmental', 'Envzz Lead Paint=environmental', 'Envzz Typed=environmental', 'Mitzz Board Up=mitigation', 'Mitzz Burst Pipe=mitigation', 'Mitzz Picked=mitigation']), co);
const shown = async () => { await A.ev(() => window._setView('leads')); await sleep(2500); return A.ev(() => { const t = (document.getElementById('gc-leads-hub') || document.body).innerText + document.body.innerText; return ['Conzz Kitchen', 'Conzz Fire Rebuild', 'Mitzz Burst Pipe', 'Mitzz Board Up', 'Envzz Asbestos', 'Envzz Typed', 'Envzz Lead Paint', 'Mitzz Picked'].filter(n => t.includes(n)); }); };
await A.ev(() => window._gcCo.setFilter('all')); await sleep(800);
let s = await shown();
ok('All companies (the Construction page) shows only Construction leads', s.every(n => /^Conzz/.test(n)) && s.includes('Conzz Kitchen'), s);
const bar = await A.ev(() => (document.querySelector('[data-gcl-coall]') || {}).textContent || '');
ok('…with "show every company" to see them all', /show every company/.test(bar), bar);
await A.ev(() => document.querySelector('[data-gcl-coall]').click()); await sleep(1500); s = await shown();
ok('show every company → all leads', s.length === 8, s);
await A.ev(() => window._gcCo.setLeadsAll(false)); await sleep(500);
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(800); s = await shown();
ok('Mitigation page: the Mitigation leads only', s.sort().join() === 'Mitzz Board Up,Mitzz Burst Pipe,Mitzz Picked', s);
await A.ev(() => window._gcCo.setFilter('environmental')); await sleep(800); s = await shown();
ok('Environmental page: the Environmental leads only', s.sort().join() === 'Envzz Asbestos,Envzz Lead Paint,Envzz Typed', s);
await A.ev(() => window._gcCo.setFilter('construction')); await sleep(800); s = await shown();
ok('Construction picked: Construction leads only', s.every(n => /^Conzz/.test(n)) && s.length >= 2, s);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('LEADCO ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
