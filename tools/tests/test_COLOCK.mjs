// test_COLOCK.mjs <build-dir> — owner 11/12: "let office and marketing switch between companies … office will be the master CRM for
// office; we will have an office manager for each company with all different emails". Who may switch companies: admins / the owner,
// the master office login, Marketing, anyone with no companies on their record (everyone today) and anyone whose companies list 2+;
// only a person whose record names exactly ONE company is locked to it. Made-up people only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud(); const at = new Date().toISOString();
const USERS = pm => [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u5', name: 'Officezz Master', email: 'office@grayco-cs.com', role: 'Office', payType: 'salary', active: true },
  pm,
  { id: 'u2', name: 'Conzz Carpenter', email: 'conzz.worker@example.test', role: 'Field', payType: 'hourly', active: true }];
const LEGACY = { id: 'u6', name: 'Pmzz Legacy', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', payType: 'salary', active: true };
const MITMGR = { id: 'u6', name: 'Mitzz Officemgr', email: 'sbiffle@grayco-cs.com', role: 'Office Manager', payType: 'salary', active: true, companies: ['mitigation'] };
cset('users', USERS(LEGACY));
cset('projects', [{ id: 'C1', name: 'Conzz Alpha', client: 'Conzz Client', contract: 77777, status: 'active', pm: 'Wesley Johnson', createdAt: at, updatedAt: at },
  { id: 'M1', name: 'Mitzz Beta', client: 'Mitzz Client', contract: 5000, status: 'active', companyId: 'mitigation', pm: 'Wesley Johnson', createdAt: at, updatedAt: at }]);
cset('leads', [{ id: 'L1', client: 'Conzz Kitchen', name: 'Conzz Kitchen', type: 'Residential Reno', scope: 'Kitchen remodel', stage: 'New', createdAt: at, updatedAt: at }]);
const errs = [];
async function as(email){ const A = await computer(email, { build: process.argv[2] }); A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200))); await signIn(A, email, 15000); await sleep(6000); return A; }
/* a PM with no companies on the record (everyone today): not locked — switches to Mitigation and sees its job */
let A = await as('sbiffle@grayco-cs.com');
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(1000);
let lg = await A.ev(() => ({ f: window._gcCo.filter(), can: window._gcCo.canSwitch(), cos: window._gcCo.myCos() }));
await A.ev(() => window._setView('projects')); await sleep(3500);
let t0 = await A.ev(() => document.body.innerText);
ok('a legacy PM (no companies on the record) can still switch: Mitigation picked, the Mitigation job shows', lg.f === 'mitigation' && lg.can && lg.cos.length === 3 && /Mitzz Beta/.test(t0) && !/Conzz Alpha/.test(t0), lg);
await A.ev(() => window._gcCo.setFilter('all')); await sleep(500); await A.b.close();
/* the Mitigation office manager (companies: [mitigation]): locked */
cset('users', USERS(MITMGR));
A = await as('sbiffle@grayco-cs.com');
await A.ev(() => { try { localStorage.setItem('gc_co_filter', 'all'); } catch (e) {} }); await sleep(1200);
let st = await A.ev(() => ({ f: window._gcCo.filter(), can: window._gcCo.canSwitch(), inM: window._gcCo.userIn(window._crm.users.find(u => u.id === 'u6'), 'mitigation'), inC: window._gcCo.userIn(window._crm.users.find(u => u.id === 'u6'), 'construction') }));
ok('an Office Manager with companies [mitigation] is locked to Mitigation (whatever this computer had picked); userIn says so', st.f === 'mitigation' && st.can === false && st.inM && !st.inC, st);
await A.ev(() => window._gcCo.setFilter('construction')); await sleep(800);
ok('…switching to Construction is ignored', await A.ev(() => window._gcCo.filter()) === 'mitigation');
await A.ev(() => window._setView('projects')); await sleep(3500);
let t = await A.ev(() => document.body.innerText);
ok('…the Projects list has Mitzz Beta and no Construction job', /Mitzz Beta/.test(t) && !/Conzz Alpha/.test(t), t.split('\n').filter(l => /zz/.test(l)).slice(0, 6));
const sw = await A.ev(async () => { const b = document.querySelector('[data-gc-co-brand],[data-co-menu]'); const txt = b ? b.textContent : ''; if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 500)); return { txt, menu: !!document.getElementById('gc-co-pop') }; });
ok('…the company switch shows Mitigation with no ▾ and opens no menu', /Mitigation/.test(sw.txt) && !/▾/.test(sw.txt) && !sw.menu, sw);
await A.b.close();
/* the master office login: may switch */
A = await as('office@grayco-cs.com');
st = await A.ev(() => ({ can: window._gcCo.canSwitch(), office: window._gcIsOfficeFull() }));
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(600); const f1 = await A.ev(() => window._gcCo.filter());
await A.ev(() => window._gcCo.setFilter('all')); await sleep(600); const f2 = await A.ev(() => window._gcCo.filter());
ok('the master office login (no companies set) switches companies', st.can && st.office && f1 === 'mitigation' && f2 === 'all', { st, f1, f2 });
await A.b.close();
/* the owner: may switch */
A = await as('wjohnson@grayco-cs.com');
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(600);
ok('the owner switches companies', await A.ev(() => window._gcCo.canSwitch() && window._gcCo.filter() === 'mitigation'));
const lst = await A.ev(() => ({ carp: window._gcCo.userCos(window._crm.users.find(u => u.id === 'u2')), own: window._gcCo.userCos(window._crm.users.find(u => u.id === 'u1')) }));
ok('a person with no companies set is Construction; the owner is in all three', lst.carp.join() === 'construction' && lst.own.join() === 'construction,mitigation,environmental', lst);
await A.ev(() => window._gcCo.setFilter('all')); await A.b.close();
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('COLOCK ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
