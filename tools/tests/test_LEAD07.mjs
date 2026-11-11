// test_LEAD07.mjs <build-dir> — LEAD07 (owner 11/10): a job marked "lead abatement" needs Lead 07 (occupant protection plan) before work
// starts; the form is in Company documents → ☣️ Lead & asbestos and the PDF is served. Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'PA', name: 'Demo Head Start playground', status: 'Active', startDate: '2027-02-22', leadAsb: { yearBuilt: 1965, childOccupied: true, abatement: true } },
  { id: 'PB', name: 'Demo kitchen', status: 'Active', startDate: '2027-02-22', leadAsb: { yearBuilt: 1965, disturbsPaint: true } }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(9000);
const r = await A.ev(() => { const P = window._crm.projects; const n = id => window._gcLeadAsb.need(P.find(p => p.id === id)).map(x => x.k + '@' + x.due); return { a: n('PA'), b: n('PB') }; });
ok('abatement job → Lead 07 due the day before work starts', r.a.indexOf('L07@2027-02-21') >= 0, r);
ok('a renovation job (not abatement) → no Lead 07', !r.b.some(x => /^L07/.test(x)), r);
const st = await A.page().evaluate(async () => (await fetch('/company-docs/01667c529f454cf1/GrayCo_Lead_07_Abatement_Occupant_Protection_Plan.pdf')).status);
ok('the Lead 07 PDF is served', st === 200, st);
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'LEAD07 ' + R.length + '/' + R.length); process.exit(f ? 1 : 0);
