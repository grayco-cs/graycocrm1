// test_W4SAFE.mjs <build-dir> — patch W4SAFE in the offline browser harness (made-up people only).
// The cloud holds a filled W-4 (married, $2,000 dependents credit, +$15 extra, $24/h). A FRESH computer (empty IndexedDB) signs in:
//  1. after load: the W-4 is intact on this computer and in the cloud (no default profile seeded before the cloud pull won)
//  2. after Payroll → Employees → the person is opened: the form shows married / 2000 / 15, the cloud is still intact
//  3. a person's save (extra 15 → 20, filing stays married) reaches the cloud; a reload and a second fresh computer keep it
//  4. a person's change TO a default value (married → single) is kept too (a person's edit is never undone by "filled beats default")
// Usage: node test_W4SAFE.mjs <dir with index.html>   (run under the scratchpad browser lock)
import path from 'path'; import { pathToFileURL } from 'url';
const build = path.resolve(process.argv[2] || '.');
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
let pass = 0, fail = 0;
const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); } };
const EMAIL = 'wjohnson@grayco-cs.com', PAT = 'Pat Example';
const old = '2026-10-20T15:00:00.000Z';
const USERS = [
  { id: 'u-wesley', name: 'Wesley Johnson', email: EMAIL, role: 'Admin', payType: 'owner', active: true },
  { id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true, hourlyRate: 20, payType: 'hourly' },
  { id: 'u-pat', name: PAT, email: 'pat@example.test', role: 'Crew', active: true, hourlyRate: 24, payType: 'hourly' }];
const PROF = (u, o) => Object.assign({ id: 'PP' + u.id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 0, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', multipleJobs: false, dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, exemptFed: false, state: 'TN', stateRate: 0, stateExtra: 0,
  otherDeductions: [], active: true, hireDate: '', ssn4: '', address: '', notes: '', updatedAt: old }, o);
const PROFILES = [PROF(USERS[0], { payType: 'owner_draw' }), PROF(USERS[1], { hourlyRate: 20 }),
  PROF(USERS[2], { hourlyRate: 24, filing: 'married', dependentsCredit: 2000, extra: 15, ssn4: '1234', hireDate: '2025-03-01' })];
H.resetCloud();
H.cset('users', USERS); H.cset('payrollProfiles', PROFILES);
H.cset('projects', [{ id: 'P1', name: 'Zedd Job', status: 'Active', updatedAt: old }]);
/* the payroll list arrives LATE on the fresh computer (the way the office computers have it: the sign-in must say who this
   is before payroll keys are asked for, and the first pull is slow): for the first SLOWPAY_MS of a page, a read naming
   payrollProfiles waits that long and a bulk read comes back without that row. The people list is there at once. */
const SLOWPAY = `(function(){ var T0 = Date.now(), MS = ${Number(process.env.SLOWPAY_MS || 20000)}, nf = window.fetch;
  function slow(input, init){
    var u = String(typeof input === 'string' ? input : (input && input.url) || input), m = String((init && init.method) || 'GET').toUpperCase();
    if (!/\\/rest\\/v1\\/gc_kv/.test(u) || m !== 'GET' || Date.now() - T0 > MS) return nf.apply(this, arguments);
    var self = this, args = arguments;
    if (/payrollProfiles/.test(decodeURIComponent(u))) return new Promise(function(r){ setTimeout(r, Math.max(0, MS - (Date.now() - T0))); }).then(function(){ return nf.apply(self, args); });
    return nf.apply(this, arguments).then(function(r){ return r.text().then(function(t){ var o = t; try { var j = JSON.parse(t); if (Array.isArray(j) && j.some(function(x){ return x && x.key === 'payrollProfiles'; })) o = JSON.stringify(j.filter(function(x){ return !(x && x.key === 'payrollProfiles'); })); } catch (e) {}
      return new Response(o, { status: r.status, statusText: r.statusText, headers: r.headers }); }); });
  }
  window.fetch = slow; })();`;
const cPat = () => (H.cget('payrollProfiles') || []).filter(p => p && (p.userId === 'u-pat' || p.name === PAT));
const w4 = p => p ? { id: p.id, filing: p.filing, dep: p.dependentsCredit, extra: p.extra, rate: p.hourlyRate, ssn4: p.ssn4 } : null;
const localPat = A => A.ev(async () => { const l = await window._gcPayrollProfiles(); return l.filter(p => p && p.name === 'Pat Example').map(p => ({ id: p.id, filing: p.filing, dep: p.dependentsCredit, extra: p.extra, rate: p.hourlyRate, ssn4: p.ssn4 })); });
async function ready(A){ return H.waitFor(A, () => (window._crm && (window._crm.users || []).length >= 3 && typeof window._gcPayrollProfiles === 'function') || null, null, 90000); }
async function openPat(A){
  await A.ev(() => window._gcPayrollOpenEmp('u-pat', 'Pat Example'));
  return H.waitFor(A, () => { const s = document.querySelector('[data-p="filing"]'), e = document.querySelector('[data-p="extra"]'), d = document.querySelector('[data-p="dependentsCredit"]');
    return s && e ? { filing: s.value, extra: e.value, dep: d ? d.value : null } : null; }, null, 30000);
}
const A = await H.computer('A', { build, init: SLOWPAY }); let B = null, C = null;
try {
  await H.signIn(A, EMAIL, 20000); await ready(A);
  const early = await localPat(A);   /* the very first call on a fresh computer */
  await H.sleep(25000);
  const l1 = await localPat(A), c1 = cPat();
  console.log('    first call: ' + JSON.stringify(early) + '  after 25 s: ' + JSON.stringify(l1) + '  cloud: ' + JSON.stringify(c1.map(w4)));
  ok(l1.length === 1 && l1[0].filing === 'married' && l1[0].dep === 2000 && l1[0].extra === 15 && l1[0].ssn4 === '1234', '1. fresh computer after load: the W-4 is intact here (married / 2000 / +15)', l1);
  ok(c1.length === 1 && c1[0].filing === 'married' && c1[0].dependentsCredit === 2000 && c1[0].extra === 15, '1. …and in the cloud', c1.map(w4));
  ok(!early.length || (early[0].filing === 'married' && early[0].extra === 15), '1. even the first answer on the fresh computer is never a default W-4', early);
  const f = await openPat(A);
  ok(f && f.filing === 'married' && Number(f.extra) === 15 && Number(f.dep) === 2000, '2. Payroll → Employees → ' + PAT + ': the form shows married / 2000 / 15', f);
  await H.sleep(4000);
  const c2 = cPat(); ok(c2.length === 1 && c2[0].filing === 'married' && c2[0].extra === 15, '2. …the cloud is still intact after the screen opened', c2.map(w4));
  /* 3. a person's save */
  await A.ev(() => { const e = document.querySelector('[data-p="extra"]'); e.value = '20'; document.querySelector('#_pSaveProf').click(); });
  const c3 = await (async () => { const t = Date.now(); let v; while (Date.now() - t < 30000) { v = cPat(); if (v.length && v[0].extra === 20) return v; await H.sleep(800); } return v; })();
  ok(c3.length === 1 && c3[0].extra === 20 && c3[0].filing === 'married' && c3[0].dependentsCredit === 2000 && c3[0].ssn4 === '1234', '3. a save (extra → 20) reaches the cloud with the rest of the W-4', c3.map(w4));
  await A.page().reload({ waitUntil: 'domcontentloaded' }); await ready(A); await H.sleep(8000);
  const l3 = await localPat(A); ok(l3.length === 1 && l3[0].extra === 20 && l3[0].filing === 'married', '3. …after a reload', l3);
  B = await H.computer('B', { build, init: SLOWPAY }); await H.signIn(B, EMAIL, 20000); await ready(B);
  const bEarly = await localPat(B); await H.sleep(25000);
  const lb = await localPat(B), cb = cPat();
  ok(lb.length === 1 && lb[0].extra === 20 && lb[0].filing === 'married' && (!bEarly.length || bEarly[0].filing === 'married'), '3. …on a second fresh computer', { bEarly, lb });
  ok(cb.length === 1 && cb[0].extra === 20 && cb[0].filing === 'married', '3. …and the cloud after computer B loaded', cb.map(w4));
  /* 4. a person changes the W-4 TO a default value: kept */
  const fb = await openPat(B);
  await B.ev(() => { const s = document.querySelector('[data-p="filing"]'); s.value = 'single'; const e = document.querySelector('[data-p="extra"]'); e.value = '0'; document.querySelector('#_pSaveProf').click(); });
  const c4 = await (async () => { const t = Date.now(); let v; while (Date.now() - t < 30000) { v = cPat(); if (v.length && v[0].filing === 'single') return v; await H.sleep(800); } return v; })();
  ok(fb && c4.length === 1 && c4[0].filing === 'single' && c4[0].extra === 0 && c4[0].dependentsCredit === 2000, '4. a person setting single / +0 (the defaults) is saved to the cloud', c4.map(w4));
  await H.sleep(8000);
  await A.page().reload({ waitUntil: 'domcontentloaded' }); await ready(A); await H.sleep(28000);   /* past the late payroll pull */
  const l4 = await localPat(A), c5 = cPat();
  ok(l4.length === 1 && l4[0].filing === 'single' && l4[0].extra === 0 && c5[0].filing === 'single', '4. …and computer A (which had married / 20) takes it, the cloud keeps it', { l4, c5: c5.map(w4) });
  const errs = A.errs.concat(B.errs).filter(e => !/ResizeObserver|Script error/.test(e));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
} catch (e) { fail++; console.log('FAIL exception ' + (e && e.stack || e)); }
finally { for (const X of [A, B, C]) { try { if (X) await X.close(); } catch (e) {} } }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
