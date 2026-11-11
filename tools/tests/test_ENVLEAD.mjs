// test_ENVLEAD.mjs <build-dir> — owner 11/11: "in leads also have Environmental as a lead choice". Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('leads', [{ id: 'E1', name: 'Demo Env', company: 'Demo Env', projectType: 'Environmental', type: 'Environmental', status: 'new', updatedAt: new Date().toISOString() },
  { id: 'E2', name: 'Demo Sewer', company: 'Demo Sewer', projectType: 'Water Damage', type: 'Water Damage', message: 'sewage backup in the basement', status: 'new', updatedAt: new Date().toISOString() },
  { id: 'E3', name: 'Demo Deck', company: 'Demo Deck', projectType: 'Residential Reno', type: 'Residential Reno', status: 'new', updatedAt: new Date().toISOString() }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => window._setView('leads')); await sleep(5000);
const r = await A.ev(() => { const T = window._gcLeadTypes, L = window._crm.leads || []; const of = id => T.of(L.find(l => l.id === id));
  const sel = [...document.querySelectorAll('select[data-gcl-f="type"] option')].map(o => o.value);
  return { list: T.list.includes('Environmental'), sel: !sel.length || sel.includes('Environmental'), e1: of('E1'), e2: of('E2'), e3: of('E3') }; });
ok('Environmental is a lead type and in the Type filter', r.list && r.sel, r);
ok('a lead typed Environmental, or with sewage in its notes, is Environmental; a deck is not', r.e1.includes('Environmental') && r.e2.includes('Environmental') && !r.e3.includes('Environmental'), r);
await A.ev(() => { const b = document.querySelector('[data-gcl-new]'); b && b.click(); }); await sleep(2500);
const f = await A.ev(() => [...document.querySelectorAll('#root main select option')].map(o => o.textContent).filter(x => x === 'Environmental').length);
ok('the ＋ New lead form offers Environmental as the type', f > 0, f);
const pf = await A.ev(() => [...document.querySelectorAll('#root main select')].some(sel => { const v = [...sel.options].map(o => o.value).join(); return v === ',Residential,Commercial,Industrial'; }));
ok('…and a Property pick: Residential / Commercial / Industrial', pf);
const ex = await A.ev(() => ({ a: window._gcLeadLaunchExtra({ id: 'x', type: 'Environmental', sector: 'Industrial' }), b: window._gcLeadLaunchExtra({ id: 'y', leadKind: 'Commercial', type: 'Commercial TI' }) }));
ok('a lead → Launch Job carries Environmental and the property', ex.a.type === 'Environmental' && ex.a.sector === 'Industrial' && ex.b.sector === 'Commercial', ex);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('ENVLEAD ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
