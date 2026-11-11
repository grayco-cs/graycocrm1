// test_FINISHPHOTO.mjs <build-dir> — FINISHPHOTO (owner 11/10): a job set to 100 % here with no After photo is put back and the
// "Add the finish photos first" box shows; with an After photo it sticks; a sync from another computer (no input here) is left alone;
// an admin can waive. Offline harness wN/harness_N.mjs, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'PF1', name: 'Demo Finish Job', client: 'Demo Customer', status: 'In Progress', pct: 60 }, { id: 'PF2', name: 'Demo Photo Job', client: 'Demo B', status: 'In Progress', pct: 70 },
  { id: 'PF3', name: 'Demo Synced Job', client: 'Demo C', status: 'In Progress', pct: 80 }, { id: 'PF4', name: 'Demo Waive Job', client: 'Demo D', status: 'In Progress', pct: 90 }, { id: 'PF5', name: 'Demo Sub Photo Job', client: 'Demo E', status: 'In Progress', pct: 85 }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(9000);
const ready = await A.ev(() => !!window._gcFinishPhoto && (window._crm && window._crm.projects || []).length >= 4);
ok('patch loaded, 4 jobs', ready);
await sleep(2000);   /* first snapshot */
const setPct = (id, v) => A.ev(([id, v]) => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window._setProjects(l => l.map(p => p.id === id ? Object.assign({}, p, { pct: v }) : p)); }, [id, v]);
const pct = id => A.ev(id => ((window._crm.projects || []).find(p => p.id === id) || {}).pct, id);
const box = () => A.ev(() => { const b = document.getElementById('gc-finishphoto'); return b ? b.innerText : ''; });
// 1. no photo → back to 60, the box shows
await setPct('PF1', 100); await sleep(2500);
ok('no After photo: 100 % is put back to 60', (await pct('PF1')) === 60, await pct('PF1'));
const t1 = await box(); ok('the box says add the finish photos first (with the admin waive)', /Add the finish photos first/.test(t1) && /Add After photos/.test(t1) && /anyway \(admin\)/.test(t1), t1);
await A.ev(() => { const b = document.querySelector('#gc-finishphoto [data-fp="close"]'); b && b.click(); }); await sleep(300);
// 2. an After photo → 100 sticks
await A.ev(() => { const P = window._gcPhotos; const r0 = P.records; P.records = () => (r0() || []).concat([{ id: 'ph1', jobId: 'PF2', tag: 'After', ref: 'x' }]); });
await setPct('PF2', 100); await sleep(2500);
ok('with an After photo: 100 % sticks', (await pct('PF2')) === 100 && !(await box()), await pct('PF2'));
// 3. a change from another computer (no input here for 11 s) is left alone
await sleep(11000);
await A.ev(() => window._setProjects(l => l.map(p => p.id === 'PF3' ? Object.assign({}, p, { pct: 100 }) : p))); await sleep(2500);
ok('synced from another computer: left at 100', (await pct('PF3')) === 100 && !(await box()), await pct('PF3'));
// 4. admin waive
await setPct('PF4', 100); await sleep(2500);
ok('PF4 put back to 90', (await pct('PF4')) === 90);
await A.ev(() => { const b = document.querySelector('#gc-finishphoto [data-fp="waive"]'); b && b.click(); }); await sleep(2500);
const p4 = await A.ev(() => (window._crm.projects || []).find(p => p.id === 'PF4'));
ok('admin "Mark 100 % anyway": 100 % + finishPhotoWaived', p4.pct === 100 && p4.finishPhotoWaived && /Wesley/.test(p4.finishPhotoWaived.by), p4);
// 5. SUBAFTER: only the sub's After photos → 100 % sticks, and the PM gets the small "good enough for marketing?" check
await A.ev(() => { const P = window._gcPhotos; const r0 = P.records; P.records = () => (r0() || []).concat([{ id: 'ph5', jobId: 'PF5', tag: 'After', source: 'sub', ref: 'y' }]); });
await setPct('PF5', 100); await sleep(2500);
const m5 = await A.ev(() => { const b = document.getElementById('gc-finishmedia'); return b ? b.innerText : ''; });
ok('sub After photos: 100 % sticks + "Check the finish photos" (not blocking)', (await pct('PF5')) === 100 && /Check the finish photos/.test(m5) && /good enough for marketing/.test(m5), m5);
await A.ev(() => { const b = document.querySelector('#gc-finishmedia [data-fm="ok"]'); b && b.click(); }); await sleep(1500);
const p5 = await A.ev(() => (window._crm.projects || []).find(p => p.id === 'PF5'));
ok('"✓ They look good" is saved on the job', p5.finishPhotosOk && /Wesley/.test(p5.finishPhotosOk.by), p5.finishPhotosOk);
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'FINISHPHOTO ' + R.length + '/' + R.length); await A.close?.(); process.exit(f ? 1 : 0);
