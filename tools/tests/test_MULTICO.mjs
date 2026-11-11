// test_MULTICO.mjs <build-dir> — owner 11/11: three companies in one CRM (Construction / Mitigation / Environmental). Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud();
const now = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [
  { id: 'J1', name: 'Demo Smith kitchen', client: 'Demo Smith', status: 'In Progress', type: 'Residential Reno', contract: 40000, updatedAt: now },
  { id: 'J2', name: 'Demo Lee dry-out', client: 'Demo Lee', status: 'In Progress', type: 'Mitigation', contract: 6000, updatedAt: now },
  { id: 'J3', name: 'Demo Ross abatement', client: 'Demo Ross', status: 'In Progress', type: 'Environmental', contract: 9000, updatedAt: now },
  { id: 'J4', name: 'Demo Fox water', client: 'Demo Fox', status: 'In Progress', type: 'Water Damage', companyId: 'mitigation', contract: 3000, updatedAt: now }]);
cset('invs', [{ id: 'I1', pid: 'J2', num: '1001', amount: 6000, status: 'Sent', date: now.slice(0, 10), updatedAt: now }, { id: 'I2', pid: 'J1', num: '1002', amount: 10000, status: 'Sent', date: now.slice(0, 10), updatedAt: now }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(7000);
const co = await A.ev(() => { const C = window._gcCo, P = window._crm.projects; const j = id => P.find(p => p.id === id);
  return { n: C.list().length, names: C.list().map(c => c.legal), j1: C.ofJob(j('J1')), j2: C.ofJob(j('J2')), j3: C.ofJob(j('J3')), j4: C.ofJob(j('J4')), i1: C.ofInv((window._crm.invs || window._crm.invoices || []).find(x => x.id === 'I1') || { pid: 'J2' }) }; });
ok('3 companies with their legal names', co.n === 3 && co.names.join('|') === 'GrayCo Construction Services, LLC|GrayCo Mitigation, LLC|GrayCo Environmental, LLC', co);
ok('a job\'s company: its own pick, else its type (Mitigation / Environmental), else Construction; an invoice follows its job', co.j1 === 'construction' && co.j2 === 'mitigation' && co.j3 === 'environmental' && co.j4 === 'mitigation' && co.i1 === 'mitigation', co);
await A.ev(() => window._setView('projects')); await sleep(3000);
const bar = await A.ev(() => { const b = document.getElementById('gc-co-bar'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; });
ok('the company bar on Jobs: All · Construction · Mitigation · Environmental · ⚙ Companies (admin)', /All/.test(bar || '') && /Construction/.test(bar) && /Mitigation/.test(bar) && /Environmental/.test(bar) && /Companies/.test(bar), bar);
await A.ev(() => document.querySelector('[data-co-set]').click()); await sleep(800);
await A.ev(() => { const card = document.querySelector('[data-co-card="mitigation"]'); const ein = card.querySelector('[data-co-k="ein"]'); ein.value = '123456789'; const ph = card.querySelector('[data-co-k="phone"]'); ph.value = '(901) 555-0111'; document.querySelector('[data-co-save]').click(); }); await sleep(1500);
const sv = await A.ev(() => ({ ein: window._gcCo.get('mitigation').ein, ph: window._gcCo.letterhead('mitigation').phone, msg: (document.querySelector('[data-co-msg]') || {}).textContent }));
ok('⚙ Companies saves the EIN (formatted XX-XXXXXXX) and phone; the letterhead uses them', sv.ein === '12-3456789' && sv.ph === '(901) 555-0111', sv);
await A.ev(() => { const card = document.querySelector('[data-co-card="environmental"]'); card.querySelector('[data-co-k="ein"]').value = '12345'; document.querySelector('[data-co-save]').click(); }); await sleep(600);
const bad = await A.ev(() => (document.querySelector('[data-co-msg]') || {}).textContent);
ok('a wrong EIN is refused', /must be 9 digits/.test(bad || ''), bad);
await A.ev(() => { const m = document.getElementById('gc-co-modal'); m && m.remove(); });
globalThis.__A = A; globalThis.__ok = ok; globalThis.__R = R; globalThis.__errs = errs;
if (!process.env.MULTICO_MORE) { ok('no page errors', !errs.length, errs); const n = R.filter(Boolean).length; console.log('MULTICO ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1); }
