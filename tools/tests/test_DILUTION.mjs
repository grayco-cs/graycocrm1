// test_DILUTION.mjs <build-dir> — owner 11/11: "have calculators for dilution rates" — 🧮 in Materials & SDS; label-convention math.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(7000);
const m = await A.ev(() => { const d = window._gcDilution; const r = (x) => x && Math.round(x.conc * 100) / 100; return { r64: r(d.byRatio(64, 128)), r32b: r(d.byRatio(32, 640)), oz: r(d.byOzPerGal(2, 640)), bl: r(d.byStrength(6, 1000, 128)), bad: d.byStrength(6, 90000, 128) }; });
ok('math: 1:64 in 1 gal = 2 oz; 1:32 in 5 gal = 20 oz; 2 oz/gal in 5 gal = 10 oz; 6 % bleach → 1,000 ppm in 1 gal = 2.13 oz; stronger than stock refused', m.r64 === 2 && m.r32b === 20 && m.oz === 10 && m.bl === 2.13 && m.bad === null, m);
await A.ev(() => window._setView('sds')); await sleep(3500);
const b = await A.ev(() => !!document.getElementById('gc-dil-btn'));
ok('🧮 Dilution calculator button in the Materials & SDS tab', b);
await A.ev(() => document.getElementById('gc-dil-btn').click()); await sleep(600);
const out = await A.ev(() => { const o = document.getElementById('gc-dil'); return o ? o.querySelector('[data-dil-out]').innerText + ' | ' + o.innerText.includes('never water to concentrate') : null; });
ok('it opens with a result (1:64 in 1 gallon → 2 fl oz) and the safety lines', /Concentrate:\s*2 fl oz/.test(out || '') && /true$/.test(out), out);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('DILUTION ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
