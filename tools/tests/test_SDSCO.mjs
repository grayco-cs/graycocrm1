// test_SDSCO.mjs <build-dir> — patch SDSCO (owner 11/19, on "🧪 Materials & SDS · Construction": "this stuff is for mit and env").
// 🧪 Materials & SDS belongs to GrayCo Mitigation and GrayCo Environmental (a job's company = window._gcCo.ofJob → project.companyId,
// + project.sharedWith). Offline harness (GC_HARNESS), made-up data only, nothing live is written.
//   A. node: the SDSCO block sits right after patch SDS; the RP menu rule checks the company pick.
//   B. admin, Construction picked: no 🧪 Materials & SDS in the left menu; _gcSdsCanSee() false; the page (if opened) says it is
//      Mitigation & Environmental's, no job picker, no 🧮 Dilution calculator; a Construction job page has no 🧪 Materials card / button;
//      _gcSds.open / send on a Construction job do nothing.
//   C. Mitigation picked: the menu item, title "· Mitigation", the picker lists the mitigation jobs (+ one shared into Mitigation) only.
//   D. All companies: the menu item, title "· Mitigation & Environmental", the picker lists only Mitigation / Environmental jobs; the
//      Dilution calculator is in the header; a Construction job page (even a water / mold one) has no 🧪 Materials; a Mitigation job
//      page and an Environmental job page have it.
//   E. existing data untouched (a Construction job's earlier picks + consent, locally and in the cloud); no page errors.
import path from 'path';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.');
const H = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, cget, resetCloud } = H;
const fs = await import('fs');

/* A · node */
const T = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const iS = T.indexOf('<script id="gc-patch-sds">'), iC = T.indexOf('<script id="gc-patch-sdsco">'), iF = T.indexOf('<script id="gc-patch-multico-fresh">');
ok('A1 the SDSCO block is right after patch SDS', iS > 0 && iC > iS && iF > iC, { iS, iC, iF });
ok('A2 the menu rule (patch RP) checks the company pick before adding 🧪 Materials & SDS', /W\._gcCo\.filter\(\) !== 'construction'; \} catch \(e2\) \{ return true; \} \}\)\(\)\s+\/\* patch SDSCO/.test(T));

const now = new Date().toISOString();
const C3MAT = [{ id: 'quat_disinfectant', name: 'Quaternary ammonium disinfectant (EPA-registered)', status: 'approved', at: '2026-11-12T15:00:00.000Z', by: 'Demo Old' }];
const C3CON = { status: 'signed', reqId: 'sr_C3_doc_sds_C3', signedAt: '2026-11-12T15:00:00.000Z', signedBy: 'Demo Old', sigId: 'ps_old', items: ['quat_disinfectant'] };
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, address: id + ' Demo St, Memphis, TN 38135', status: 'active', pm: 'Sam Biffle', contract: 9000, createdAt: now, updatedAt: now }, o);
cset('projects', [
  J('M1', { name: 'Demo Ross basement', type: 'Water Damage', companyId: 'mitigation', notes: 'Sewage backup, cat 3' }),
  J('E1', { name: 'Demo Kline trim', type: 'Environmental', companyId: 'environmental', notes: 'lead paint on the window trim' }),
  J('S1', { name: 'Demo Shared crawlspace', type: 'Residential Reno', companyId: 'construction', sharedWith: ['mitigation'] }),
  J('C1', { name: 'Demo Smith deck', type: 'Residential Reno' }),
  J('C2', { name: 'Demo Wade water', type: 'Water Damage', notes: 'mold and sewage' }),
  J('C3', { name: 'Demo Old kitchen', type: 'Kitchen', materials: C3MAT, materialsConsent: C3CON })]);
cset('invoices', []);

const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000);
const waitOn = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up with patch SDS + SDSCO and the made-up jobs', !!await waitOn(() => window._gcSds && window._gcSdsCo && window._gcCo && (window._crm.projects || []).length >= 6, null, 60000));
await sleep(4000);
const nav = () => A.ev(() => [...document.querySelectorAll('nav button, aside button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ').trim()).join('|'));
const setCo = async c => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(2500); };
const page = () => A.ev(() => { const g = document.querySelector('.gcsds'); if (!g) return null; const sel = document.getElementById('gc-sds-jobpick');
  return { t: g.innerText, off: g.getAttribute('data-sds-off') || '', title: ((g.querySelector('h2') || {}).innerText || ''), opts: sel ? [...sel.options].map(o => o.value).filter(Boolean) : null, dil: !!g.querySelector('#gc-dil-btn'), rows: [...g.querySelectorAll('[data-sds-jobrow]')].map(r => r.getAttribute('data-sds-jobrow')) }; });
const openSds = async () => { await A.ev(() => window._setView('sds')); await sleep(2500); };
/* the job page (desk): opened through the CRM's own path; the job page is up when its "← All Projects" button is there */
const jobPage = async pid => {
  await A.ev(() => window._setView('dashboard')); await sleep(800);
  await A.ev(pid => { window._navToJob(pid); }, pid);
  let up = await waitOn(pid => { const m = document.querySelector('main'); const back = m && [...m.getElementsByTagName('button')].some(b => /^\s*←\s*All Projects\s*$/.test(b.textContent || '')); return back && window._gcOpenProject && window._gcOpenProject.id === pid; }, pid, 15000);
  await sleep(4500);   /* the SDS loop draws its card every 1.5 s */
  return { up: !!up, card: await A.ev(() => { const c = document.getElementById('gc-sds-jc'); return c ? { pid: c.getAttribute('data-pid'), btn: !!c.querySelector('[data-sds-job]'), t: c.innerText.slice(0, 200) } : null; }) };
};

/* B · Construction */
await setCo('construction');
let n = await nav();
ok('B1 Construction picked: no 🧪 Materials & SDS in the left menu (admin)', n.length > 20 && !/Materials & SDS/.test(n), n.slice(0, 500));
ok('B2 … and _gcSdsCanSee() is false', await A.ev(() => window._gcSdsCanSee() === false));
await openSds();
let P = await page();
ok('B3 the page, opened anyway: "for Mitigation and Environmental jobs — not Construction", 🏢 Show All companies, no job picker, no library, no 🧮 Dilution calculator', P && P.off === 'construction' && /Mitigation/.test(P.t) && /Environmental/.test(P.t) && /not Construction/.test(P.t) && /Show All companies/.test(P.t) && P.opts === null && !/Materials library/.test(P.t) && !P.dil && !await A.ev(() => !!document.getElementById('gc-dil-btn')), P);
let jp = await jobPage('C1');
ok('B4 Construction picked: a Construction job page (C1 deck) has no 🧪 Materials card or button', jp.up && !jp.card, jp);
const before = await A.ev(() => document.querySelectorAll('#gc-sds-ov').length);
await A.ev(() => window._gcSds.open('C1')); await sleep(600);
const sent = await A.ev(() => window._gcSds.send('C2'));
ok('B5 _gcSds.open / send on a Construction job do nothing (no 🧪 window, the send refused before any call)', before === 0 && await A.ev(() => !document.getElementById('gc-sds-ov')) && sent && sent.ok === false, sent);

/* C · Mitigation */
await setCo('mitigation');
n = await nav();
ok('C1 Mitigation picked: 🧪 Materials & SDS in the left menu', /Materials & SDS/.test(n), n.slice(0, 500));
await openSds();
P = await page();
ok('C2 the page: "· Mitigation" title, library, the picker lists the mitigation job + the job shared into Mitigation only', P && !P.off && /· Mitigation/.test(P.title) && /Materials library/.test(P.t) && P.opts && P.opts.slice().sort().join() === 'M1,S1', P && { title: P.title, opts: P.opts });
ok('C3 … the 🧮 Dilution calculator is in the header', !!await waitOn(() => !!document.querySelector('.gcsds h2 #gc-dil-btn'), null, 5000));

/* D · All companies */
await setCo('all');
n = await nav();
ok('D1 All companies: 🧪 Materials & SDS in the left menu', /Materials & SDS/.test(n), n.slice(0, 500));
await openSds();
P = await page();
ok('D2 the title says "· Mitigation & Environmental"', P && /Materials & SDS\s*· Mitigation & Environmental/.test(P.title), P && P.title);
ok('D3 "Pick materials for a job" lists only Mitigation / Environmental jobs (M1, E1, shared S1 — no C1 / C2 / C3)', P && P.opts && P.opts.slice().sort().join() === 'E1,M1,S1', P && P.opts);
ok('D4 a job with earlier picks + a signed consent (C3) is still listed with them (nothing hidden away)', P && P.rows.includes('C3'), P && P.rows);
ok('D5 the 🧮 Dilution calculator is in the header', !!await waitOn(() => !!document.querySelector('.gcsds h2 #gc-dil-btn'), null, 5000));
jp = await jobPage('C1');
ok('D6 a Construction job page (C1 deck) has no 🧪 Materials', jp.up && !jp.card, jp);
jp = await jobPage('C2');
ok('D7 a Construction water / mold job page (C2) has no 🧪 Materials either', jp.up && !jp.card, jp);
jp = await jobPage('M1');
ok('D8 a Mitigation job page (M1) has the 🧪 Materials card with its button', jp.up && jp.card && jp.card.pid === 'M1' && jp.card.btn, jp);
await A.ev(() => document.querySelector('#gc-sds-jc [data-sds-job]').click()); await sleep(800);
ok('D9 … its button opens the job\'s 🧪 Materials window', await A.ev(() => /Materials — Demo Ross basement/.test((document.getElementById('gc-sds-job') || {}).innerText || '')));
await A.ev(() => { const o = document.getElementById('gc-sds-ov'); o && o.remove(); });
jp = await jobPage('E1');
ok('D10 an Environmental job page (E1) has it too', jp.up && jp.card && jp.card.pid === 'E1' && jp.card.btn, jp);
await setCo('construction');
jp = await jobPage('M1');
ok('D11 Construction picked: the Mitigation job\'s own page still has its 🧪 Materials (the button follows the job)', jp.up && jp.card && jp.card.pid === 'M1', jp);
jp = await jobPage('C3');
ok('D12 Construction picked: the Construction job with earlier picks (C3) has no 🧪 Materials card', jp.up && !jp.card, jp);
await setCo('all');

/* E · data untouched, no page errors */
await sleep(3000);
const loc = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'C3'); return { m: p.materials, c: p.materialsConsent }; });
const cl = (cget('projects') || []).find(p => p.id === 'C3') || {};
ok('E1 the Construction job\'s earlier picks and signed consent are untouched (here and in the cloud)', JSON.stringify(loc.m) === JSON.stringify(C3MAT) && JSON.stringify(loc.c) === JSON.stringify(C3CON) && JSON.stringify(cl.materials) === JSON.stringify(C3MAT) && JSON.stringify(cl.materialsConsent) === JSON.stringify(C3CON), { loc, cl: { m: cl.materials, c: cl.materialsConsent } });
const noMat = await A.ev(() => window._crm.projects.filter(p => ['M1', 'E1', 'S1', 'C1', 'C2'].includes(p.id) && (p.materials || p.materialsConsent)).map(p => p.id));
ok('E2 nothing was written on the other jobs (no materials / consent added)', noMat.length === 0, noMat);
ok('E3 no page errors', errs.length === 0, errs);

const pass = R.filter(Boolean).length, fail = R.length - pass;
console.log('\n' + pass + ' passed, ' + fail + ' failed');
try { await A.close && A.close(); } catch (e) {}
process.exit(fail ? 1 : 0);
