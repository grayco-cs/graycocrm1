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
const sb = await A.ev(() => { const a = document.querySelector('[data-gc-co-brand]'); return a ? a.innerText.replace(/\s+/g, ' ').trim() : null; });
ok('the sidebar logo is the company switch ("GrayCo · All companies ▾")', /All companies ▾/i.test(sb || ''), sb);
const SHOT = process.env.MULTICO_SHOTS || '';
const pick = async id => { await A.ev(() => document.querySelector('[data-gc-co-brand]').click()); await sleep(500); await A.ev(i => document.querySelector('#gc-co-pop [data-co-f="' + i + '"]').click(), id); await sleep(2500); };
const seen = async () => A.ev(() => { const t = (document.querySelector('#root main') || document.body).innerText; return ['Demo Smith kitchen', 'Demo Lee dry-out', 'Demo Ross abatement', 'Demo Fox water'].filter(n => t.includes(n)); });
const all0 = await seen();
ok('All companies: every job shows', all0.length === 4, all0);
await A.ev(() => document.querySelector('[data-gc-co-brand]').click()); await sleep(500);
const menu = await A.ev(() => (document.getElementById('gc-co-pop') || {}).innerText || '');
ok('click the logo → the menu: All companies · Construction · Mitigation · Environmental · settings', /All companies/.test(menu) && /Construction/.test(menu) && /Mitigation/.test(menu) && /Environmental/.test(menu) && /settings/i.test(menu), menu.slice(0, 200));
await A.ev(() => document.querySelector('#gc-co-pop [data-co-f="mitigation"]').click()); await sleep(2500);
const mit = await seen(), mitSb = await A.ev(() => ({ t: document.querySelector('[data-gc-co-brand]').innerText.replace(/\s+/g, ' '), img: (document.querySelector('[data-gc-co-brand] img') || {}).getAttribute?.('src'), strip: !!document.getElementById('gc-co-strip') }));
ok('Mitigation: only Mitigation jobs (Lee dry-out, Fox water); the logo says Mitigation with its own logo; a colored strip on top', mit.join() === 'Demo Lee dry-out,Demo Fox water' && /Mitigation ▾/i.test(mitSb.t) && /mitigation-logo/.test(mitSb.img || '') && mitSb.strip, { mit, mitSb });
if (SHOT) await A.page().screenshot({ path: SHOT + '_mitigation_jobs.png' });
const pnl = await A.ev(async () => { const d = await window._gcCompanyPnL(); return { n: d.jobCount, names: d.jobs.map(j => j.name), co: d.company }; });
ok('Mitigation P&L counts only Mitigation jobs', pnl.co === 'mitigation' && pnl.names.every(n => /Lee|Fox/.test(n)), pnl);
await A.ev(() => window._setView('leads')); await sleep(2500);
await pick('environmental');
await A.ev(() => window._setView('projects')); await sleep(2500);
const env = await seen();
ok('Environmental: only the abatement job', env.join() === 'Demo Ross abatement', env);
if (SHOT) await A.page().screenshot({ path: SHOT + '_environmental_jobs.png' });
await A.ev(() => window._setView('enviro')); await sleep(2500);
if (SHOT) await A.page().screenshot({ path: SHOT + '_environmental_tab.png' });
await A.ev(() => window._setView('projects')); await sleep(1500);
await A.ev(() => window._setProjects(prev => prev.concat([{ id: 'J9', name: 'Demo new env job', client: 'Demo New', status: 'bidding', type: 'Residential Reno', updatedAt: new Date().toISOString() }]))); await sleep(4500);
const stamped = await A.ev(() => (window._crm.projects.find(p => p.id === 'J9') || {}).companyId);
ok('a new job made while Environmental is picked is filed under Environmental', stamped === 'environmental', stamped);
await pick('all');
const back = await seen();
ok('back to All companies: everything again', back.length === 4, back);
await A.ev(() => document.querySelector('[data-gc-co-brand]').click()); await sleep(500); await A.ev(() => document.querySelector('#gc-co-pop [data-co-set]').click()); await sleep(800);
await A.ev(() => { const card = document.querySelector('[data-co-card="mitigation"]'); const ein = card.querySelector('[data-co-k="ein"]'); ein.value = '123456789'; const ph = card.querySelector('[data-co-k="phone"]'); ph.value = '(901) 555-0111'; document.querySelector('[data-co-save]').click(); }); await sleep(1500);
const sv = await A.ev(() => ({ ein: window._gcCo.get('mitigation').ein, ph: window._gcCo.letterhead('mitigation').phone, msg: (document.querySelector('[data-co-msg]') || {}).textContent }));
ok('⚙ Companies saves the EIN (formatted XX-XXXXXXX) and phone; the letterhead uses them', sv.ein === '12-3456789' && sv.ph === '(901) 555-0111', sv);
await A.ev(() => { const card = document.querySelector('[data-co-card="environmental"]'); card.querySelector('[data-co-k="ein"]').value = '12345'; document.querySelector('[data-co-save]').click(); }); await sleep(600);
const bad = await A.ev(() => (document.querySelector('[data-co-msg]') || {}).textContent);
ok('a wrong EIN is refused', /must be 9 digits/.test(bad || ''), bad);
await A.ev(() => { const m = document.getElementById('gc-co-modal'); m && m.remove(); });
globalThis.__A = A; globalThis.__ok = ok; globalThis.__R = R; globalThis.__errs = errs;
if (!process.env.MULTICO_MORE) { ok('no page errors', !errs.length, errs); const n = R.filter(Boolean).length; console.log('MULTICO ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1); }
