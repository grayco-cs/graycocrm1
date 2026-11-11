// test_CERTPLAN.mjs <build-dir> [shot-dir] — owner 11/11: required certs by role, a raise for every certificate, ⭐ promotion eligible with
// Master designations, PM year-end bonus, emergency after-hours 1.5× / overtime 1.5× not stacked. Made-up people only.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
const ago = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10), ahead = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Pat Planner', email: 'pat@example.com', role: 'Project Manager', hireDate: ago(200), active: true },
  { id: 'u3', name: 'Mo Tech', email: 'mo@example.com', role: 'Mitigation Tech', hireDate: ago(120), active: true },
  { id: 'u4', name: 'Eve Abate', email: 'eve@example.com', role: 'Environmental Tech', hireDate: ago(10), active: true },
  { id: 'u5', name: 'Max Master', email: 'max@example.com', role: 'Mitigation Manager', hireDate: ago(900), active: true }]);
cset('gc_certs', { list: [
  { id: 'c1', holderType: 'person', holder: 'pat@example.com', holderName: 'Pat Planner', name: 'IICRC WRT (Water Restoration Technician)', issuer: 'IICRC', expires: ahead(200) },
  { id: 'c2', holderType: 'person', holder: 'pat@example.com', holderName: 'Pat Planner', name: 'EPA RRP Certified Renovator', issuer: 'EPA', expires: ago(5) },
  { id: 'c3', holderType: 'person', holder: 'mo@example.com', holderName: 'Mo Tech', name: 'IICRC WRT', issuer: 'IICRC', expires: ahead(300) },
  { id: 'c4', holderType: 'person', holder: 'max@example.com', holderName: 'Max Master', name: 'IICRC Master Water Restorer', issuer: 'IICRC', expires: ahead(300) }] });
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => window._gcCertPlan.load()); await sleep(800);
const m = await A.ev(() => { const C = window._gcCertPlan, U = window._crm.users, by = e => U.find(u => u.email === e), p = C.plan();
  const tr = e => C.trackOf(by(e), p);
  const st = (e, id) => { const u = by(e), t = p.tracks[C.trackOf(u, p)], r = t.reqs.find(x => x.id === id); return C.reqStatus(r, (window._gcCertPlan.__held = null, []).concat(JSON.parse(JSON.stringify((window.__cp = 1, [])))), '') && null; };
  return { tracks: ['pat@example.com', 'mo@example.com', 'eve@example.com', 'max@example.com'].map(tr),
    pmReqs: p.tracks.con_pm.reqs.map(r => r.id), mitTech: p.tracks.mit_tech.reqs.map(r => r.id), envPm: p.tracks.env_pm.reqs.map(r => r.id), envTech: p.tracks.env_tech.reqs.map(r => r.id),
    pmMasterDays: p.tracks.con_pm.reqs.filter(r => /Master Restorer course/.test(r.name)).map(r => r.days),
    raisesPat: C.raisesDue(by('pat@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit), raisesMo: C.raisesDue(by('mo@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit),
    masterMax: C.masterOf(by('max@example.com')), masterMo: C.masterOf(by('mo@example.com')),
    w1: C.weekPay(20, 40, 20), w2: C.weekPay(20, 50, 20), w3: C.weekPay(20, 45, 0), w4: C.weekPay(20, 30, 40) }; });
ok('tracks from the role: PM → Construction PM, Mitigation Tech, Environmental Tech, Mitigation Manager', m.tracks.join() === 'con_pm,mit_tech,env_tech,mit_manager', m.tracks);
ok('PM requires WRT + every Master Restorer course within the first year (365 days) + RRP', m.pmReqs.includes('wrt') && ['asd', 'amrt', 'fsrt', 'oct', 'cct', 'uft'].every(x => m.pmReqs.includes(x)) && m.pmMasterDays.every(d => d === 365) && m.pmReqs.includes('rrp'), m);
ok('mitigation tech requires WRT + the legal ones (HazCom, respirator, bloodborne, RRP on-the-job)', ['wrt', 'hazcom', 'resp', 'bbp', 'rrpojt'].every(x => m.mitTech.includes(x)), m.mitTech);
ok('environmental PM requires lead supervisor + RRP renovator (+ asbestos supervisor, respirator, blood lead)', ['leadsup', 'rrp', 'asbsup', 'resp', 'bloodlead'].every(x => m.envPm.includes(x)), m.envPm);
ok('environmental tech requires the abatement worker license (+ asbestos worker, respirator, blood lead)', ['leadwork', 'asbwork', 'resp', 'bloodlead'].every(x => m.envTech.includes(x)), m.envTech);
ok('raises due: Pat (salaried PM) WRT $1,000/yr + RRP $1,000/yr; Mo (hourly) WRT $0.50/hr', m.raisesPat.join() === 'IICRC WRT (Water Restoration Technician)=1000yr,EPA RRP Certified Renovator=1000yr' && m.raisesMo.join() === 'IICRC WRT=0.5hr', m);
ok('⭐ Master Water Restorer → promotion eligible; no master → not', m.masterMax && /promotion eligible/.test(m.masterMax.l) && !m.masterMo, m.masterMax);
ok('pay: 40 h = 20 regular + 20 emergency → 20 × 1 + 20 × 1.5 = $1,000', m.w1.straight === 20 && m.w1.premium === 20 && m.w1.pay === 1000, m.w1);
ok('pay: 50 h with 20 emergency → 30 h at 1.5× (20 emergency + 10 over 40), never 2.25×', m.w2.premium === 30 && m.w2.pay === 20 * 20 + 30 * 30, m.w2);
ok('pay: 45 h, no emergency → 5 h overtime at 1.5×; emergency never more than the hours worked', m.w3.premium === 5 && m.w3.pay === 40 * 20 + 5 * 30 && m.w4.premium === 30, { w3: m.w3, w4: m.w4 });
/* the panel */
await A.ev(() => window._gcCertPlan.open('people')); await sleep(1500);
const txt = await A.ev(() => document.getElementById('gc-certplan').innerText);
ok('the "amounts are suggestions" note shows until they are set', /are <b>suggestions<\/b>|are suggestions/.test(await A.ev(() => document.getElementById('gc-certplan').innerHTML)) || /suggestions/.test(txt), txt.slice(0, 400));
ok('👥 People: Pat — WRT held, RRP expired, Master Restorer courses due', /Pat Planner/.test(txt) && /✅ Held/.test(txt) && /❌ Expired — renew/.test(txt) && /IICRC ASD — Applied Structural Drying \(Master Restorer course\)/.test(txt), '');
ok('⭐ Max Master shows promotion eligible; LAW lines are marked', /⭐ IICRC Master Water Restorer — promotion eligible/.test(txt) && /LAW/.test(txt), '');
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_people.png' });
await A.ev(() => document.querySelector('[data-cptab="raises"]').click()); await sleep(500);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_raises.png' });
await A.ev(() => document.querySelector('[data-cp="approve"]').click()); await sleep(1500);
const saved = cget('gc_cert_plan');
const left = await A.ev(() => document.querySelectorAll('[data-cp="approve"]').length);
ok('✅ Approve saves the raise (who, certificate, amount, by) to the cloud and it leaves the list; a Master designation is one raise (not also an IICRC course raise)', saved && saved.done && saved.done.length === 1 && saved.done[0].email === 'max@example.com' && saved.done[0].rule === 'master:iicrc-master-water-restorer' && saved.done[0].amount === 3000 && saved.done[0].unit === 'yr' && left === 3, { d: saved && saved.done, left });
await A.ev(() => document.querySelector('[data-cptab="pay"]').click()); await sleep(400);
const pay = await A.ev(() => { const s = (a, v) => { const e = document.querySelector('[' + a + ']'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; s('data-cp-tot', '50'); s('data-cp-em', '20'); return document.querySelector('[data-cp-out]').textContent; });
ok('⏱ the week checker: 50 h with 20 emergency → 20 h × $20 + 30 h × $30 = $1,300', /= \$1300\.00/.test(pay) && /not stacked/.test(pay), pay);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_pay.png' });
await A.ev(() => document.querySelector('[data-cptab="bonus"]').click()); await sleep(400);
await A.ev(() => { document.querySelector('[data-cp-ba="pat@example.com"]').value = '2500'; document.querySelector('[data-cp-bn="pat@example.com"]').value = 'Test notes'; document.querySelector('[data-cp="savebonus"]').click(); }); await sleep(1200);
const b = cget('gc_cert_plan'), y = String(new Date().getFullYear());
ok('🏆 PM year-end bonus saves per year (amount + notes)', b && b.bonus && b.bonus[y] && b.bonus[y]['pat@example.com'] && b.bonus[y]['pat@example.com'].amount === 2500, b && b.bonus);
await A.ev(() => document.querySelector('[data-cptab="reqs"]').click()); await sleep(400);
await A.ev(() => { document.querySelector('[data-cp-newreq="env_pm"]').value = 'Asbestos inspector'; document.querySelector('[data-cp-newdays="env_pm"]').value = '180'; document.querySelector('[data-cp="addreq"][data-k="env_pm"]').click(); }); await sleep(1200);
const c = cget('gc_cert_plan');
ok('📋 a new requirement can be added to a role (env PM: "will be more")', c.tracks.env_pm.reqs.some(r => r.name === 'Asbestos inspector' && r.days === 180), c.tracks.env_pm.reqs.map(r => r.name));
const todo = await A.ev(() => window._gcTodoExt.map(f => { try { return f(); } catch (e) { return []; } }).flat().filter(x => /^cp/.test(x.key)).map(x => x.title));
ok('To-Do: raises due and overdue required certificates for admins; a new hire is not overdue on "only for that work" lines', todo.some(t => /💵 Raise due: Mo Tech/.test(t)) && todo.some(t => /Mo Tech: \d+ required certificate/.test(t)) && todo.some(t => /Eve Abate: 2 required certificates overdue/.test(t)), todo);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('CERTPLAN ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
