// test_ENVIRO.mjs <build-dir> — ENVIRO + HAZTEXT (owner 11/10): ☢️ Environmental tab for admins / insurance PMs / mitigation managers (not a regular PM);
// hazardous jobs come from the job's own words; a plain residential job gets no ☣️ lead / asbestos card. Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud, ACCOUNTS } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [
  { id: 'H1', name: 'Demo Kline kitchen', client: 'Demo Kline', status: 'In Progress', type: 'Residential', notes: 'House built 1962 — lead paint on the window trim, RRP rules' },
  { id: 'H2', name: 'Demo Ross water', client: 'Demo Ross', status: 'In Progress', type: 'Water mitigation', isInsurance: true, description: 'Mold behind the vanity, sewage backup in basement' },
  { id: 'H3', name: 'Demo Fox fire', client: 'Demo Fox', status: 'Completed', type: 'Fire', scope: 'Smoke and soot cleaning' },
  { id: 'P1', name: 'Demo plain deck', client: 'Demo Plain', status: 'In Progress', type: 'Residential', notes: 'Lead carpenter Pat; sales lead from Facebook' },
  { id: 'W2', name: 'Demo Lee laundry', client: 'Demo Lee', status: 'In Progress', type: 'Water mitigation', notes: 'Washing machine overflow, gray water in hall' },
  { id: 'W3', name: 'Demo Cox basement', client: 'Demo Cox', status: 'In Progress', type: 'Water mitigation', description: 'Cat 3 — flood water came in under the door' },
  { id: 'W1', name: 'Demo Kim pipe', client: 'Demo Kim', status: 'In Progress', type: 'Water mitigation', notes: 'Clean water supply line burst, cat 1' }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(9000);
const nav = await A.ev(() => [...document.querySelectorAll('nav button, aside button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ').trim()));
ok('admin menu has ☢️ Environmental', nav.some(t => /Environmental/.test(t)), nav);
const hz = await A.ev(() => Object.fromEntries((window._crm.projects || []).map(p => [p.id, Object.keys(window._gcHazOf(p)).filter(k => window._gcHazOf(p)[k])])));
ok('hazards from the job\'s own words (H1 lead · H2 mold+sewage · H3 fire · plain deck none — "lead carpenter" / "sales lead" are not lead paint)', hz.H1.join() === 'lead' && hz.H2.join() === 'mold,sewage' && hz.H3.join() === 'fire' && !hz.P1.length, hz);
ok('WATERCAT: Cat 2 (washer / gray water) and Cat 3 (flood water) show; a clean Cat 1 pipe burst does not', hz.W2.join() === 'cat2' && hz.W3.join() === 'sewage' && !hz.W1.length, hz);
await A.ev(() => window._setView('enviro')); await sleep(2500);
let t = await A.ev(() => (document.querySelector('.gcenv') || {}).innerText || '');
ok('the tab: active hazardous jobs (H1, H2), not the finished one or the plain job', /Demo Kline kitchen/.test(t) && /Demo Ross water/.test(t) && !/Demo Fox fire/.test(t) && !/Demo plain deck/.test(t), t.slice(0, 500));
ok('the tab has certifications, papers, EPA / OSHA / state rules and the firm set-up list', /Certifications/.test(t) && /Lead 07/.test(t) && /OSHA/.test(t) && /TDEC/.test(t) && /getting the firm ready/.test(t), t.slice(0, 200));
await A.ev(() => { const b = document.querySelector('.gcenv [data-env="all"]'); b && b.click(); }); await sleep(500);
await A.ev(() => { const b = document.querySelector('.gcenv [data-env-k="fire"]'); b && b.click(); }); await sleep(500);
t = await A.ev(() => (document.querySelector('.gcenv') || {}).innerText || '');
ok('🔥 filter + finished jobs → the fire job only', /Demo Fox fire/.test(t) && !/Demo Kline kitchen/.test(t), t.slice(0, 300));
const opened = await A.ev(() => new Promise(r => { const seen = []; const o0 = window._gcOpenProject; window._gcOpenProject = p => { seen.push(p && p.id); };
  const b = document.querySelector('.gcenv [data-env-job]'); const id = b && b.getAttribute('data-env-job'); b && b.click();
  setTimeout(() => { window._gcOpenProject = o0; r({ id, seen, view: localStorage.getItem('grayco_view') }); }, 800); }));
ok('clicking a hazardous job opens that job (its info page)', opened.id && opened.seen[0] === opened.id && opened.view === 'projects', opened);
await A.ev(() => window._setView('enviro')); await sleep(1500);
const links = await A.ev(() => [...document.querySelectorAll('.gcenv a')].map(a => a.getAttribute('href')));
ok('every link is https:// or a company paper', links.length > 20 && links.every(h => /^https:\/\//.test(h) || /^\/company-docs\//.test(h)), links.filter(h => !/^https:\/\//.test(h) && !/^\/company-docs\//.test(h)));
const pm = await A.ev(() => { const u0 = window._gcMeUser; window._gcMeUser = () => ({ name: 'Pat PM', role: 'Project Manager' }); const a0 = window.__GC_AUTH__.isAdmin; window.__GC_AUTH__.isAdmin = () => false;
  const r = { pm: window._gcEnviroCanSee() }; window._gcMeUser = () => ({ name: 'Ina', role: 'Project Manager', title: 'Senior Insurance PM' }); r.ins = window._gcEnviroCanSee(); window._gcMeUser = () => ({ name: 'Mo', role: 'Mitigation Manager' }); r.mit = window._gcEnviroCanSee();
  window._gcMeUser = u0; window.__GC_AUTH__.isAdmin = a0; return r; });
ok('who sees it: not a regular PM; yes the insurance PM and the mitigation manager', !pm.pm && pm.ins && pm.mit, pm);
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'ENVIRO ' + R.length + '/' + R.length); process.exit(f ? 1 : 0);
