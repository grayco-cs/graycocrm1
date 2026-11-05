// test_LINEAPPR.mjs <build-dir> — patch LINEAPPR in a real (headless) browser, owner signed in, MADE-UP people only.
// A pending run (Ann hourly, Ben hourly, Cal salary) + an automatic draft for the same payday:
// the draft is retired on load; ✓ Approve this check on Cal books his check alone (own run, approveRun's register /
// payment history / check no.); ✕ Deny this check on Ann (reason); ✏️ Edit Ben's hours; ✓ Approve all & record books Ben.
// Then: each check booked once, Ann nowhere, 941 / YTD / Friday checks count Ben + Cal once.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_LINEAPPR.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const ADMIN = 'wjohnson@grayco-cs.com';
const USERS = [
  { id: 'UA1', name: 'Tess Owner', email: ADMIN, role: 'Admin', active: true, payType: 'owner' },
  { id: 'E1', name: 'Ann Test', email: 'ann.test@example.test', role: 'Office Assistant', active: true, payType: 'hourly' },
  { id: 'E2', name: 'Ben Test', email: 'ben.test@example.test', role: 'Crew', active: true, payType: 'hourly' },
  { id: 'E3', name: 'Cal Test', email: 'cal.test@example.test', role: 'Office Manager', active: true, payType: 'salary' }];
const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 15.2, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }, x);
const line = (empId, name, payType, hours, rate, gross, fed, net) => ({ empId, name, payType, hours, otHours: 0, rate, gross, taxable: gross, fed, ss: +(gross * 0.062).toFixed(2), med: +(gross * 0.0145).toFixed(2), addlMed: 0, state: 0, net,
  employerSS: +(gross * 0.062).toFixed(2), employerMed: +(gross * 0.0145).toFixed(2), futa: 0, suta: 0, status: 'pending', grossParts: [{ label: payType === 'hourly' ? 'Regular hours' : 'Salary', amount: gross }] });
const PD = '2026-11-06', FROM = '2026-10-29', TO = '2026-11-04';
const RUN1 = { id: 'RUN1', status: 'pending', auto: false, from: FROM, to: TO, payDate: PD, createdAt: '2026-11-05T09:00:00Z', submittedBy: 'Tess Owner',
  lines: [line('E1', 'Ann Test', 'hourly', 8.53, 15.2, 129.6, 0, 119.69), line('E2', 'Ben Test', 'hourly', 15.38, 25, 384.62, 20, 335.2), line('E3', 'Cal Test', 'salary', 40, 0, 1346.15, 150, 1093.17)], totals: { gross: 1860.37, net: 1548.06 } };
const AUTO1 = { id: 'AUTO1', status: 'draft', auto: true, from: FROM, to: TO, payDate: PD, createdAt: '2026-11-05T08:00:00Z', createdBy: 'calculated automatically',
  lines: [line('E1', 'Ann Test', 'hourly', 0.5, 15.2, 7.6, 0, 7.02)], totals: { gross: 7.6, net: 7.02 } };
resetCloud();
cset('users', USERS);
cset('payrollProfiles', [prof('PP1', USERS[1]), prof('PP2', USERS[2], { hourlyRate: 25 }), prof('PP3', USERS[3], { payType: 'salary', annualSalary: 70000 })]);
cset('payrollRuns', [RUN1, AUTO1]);
cset('gc_check_queue', []); cset('gc_tombstones', {}); cset('timesheets', []); cset('payrollTaxPayments', []); cset('gcAcctRegister', []);
cset('payrollSettings', { pastPayCutoff: '2026-01-01', pastPayAutoStub: false, companyName: 'Test Co LLC', nextCheckNo: 5001 });

const A = await computer('A', { build }); const p = A.page();
await p.route('**/.netlify/functions/paystubs**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"stubs":[]}' }).catch(() => {}));
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(ADMIN); await p.locator('#gc-auth-password').fill(ACCOUNTS[ADMIN].pw); await sleep(300);
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await waitFor(A, async () => !!(window.__GC_PAY && window._gcLineApprove && window.__GC_PAY.isAdmin()) && (await window.__GC_PAY.profiles()).length >= 3, null, 120000, 400);
await sleep(10000);
const RUNS = () => A.ev(async () => JSON.parse(JSON.stringify(await window.__GC_PAY.runs())));

// ── the shadow automatic draft ──
const h0 = await A.ev(async () => { const ret = (await window.__GC_PAY.get('payrollRetired')) || [];
  return { ids: (await window.__GC_PAY.runs()).map(r => r.id), ret: ret.filter(x => x.runId === 'AUTO1').length, tomb: !!(window._gcxDead && window._gcxDead('payrollRuns', 'AUTO1')) }; });
ok(h0.ids.join() === 'RUN1' && h0.ret === 1 && h0.tomb, 'on load: the automatic draft for a payday that already has a pending run is retired (archived in payrollRetired, tombstoned)', h0);
const nw = await A.ev(async () => { let n = 0; const o = window.idbSet; window.idbSet = function(k){ if (k === 'payrollRuns') n++; return o.apply(this, arguments); };
  await window.__GC_PAY.runs(); await window.__GC_PAY.runs(); window.idbSet = o; return n; });
ok(nw === 0, 'after that, reading the runs writes nothing (condition-gated)', nw);
const wt = await A.ev(async () => (await window._gcPayrollWaitingToApprove()).map(r => r.id));
ok(wt.join() === 'RUN1', 'To-Do "waiting to approve": the pending run only, not the draft', wt);
await A.ev(() => window._gcAutoPayroll()); await sleep(800);
const h1 = (await RUNS()).filter(r => r.payDate === PD).map(r => r.id + ':' + r.status);
ok(h1.join() === 'RUN1:pending', 'the automatic payroll does not bring it back', h1);

// ── the buttons ──
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2500);
await A.ev(() => { const b = document.querySelector('[data-open="RUN1"]'); if (b) b.click(); }); await sleep(1500);
const btn = await A.ev(() => ['lappr', 'ldeny', 'ledit', 'stub'].map(k => [...document.querySelectorAll('[data-' + k + '="RUN1"]')].map(b => b.getAttribute('data-idx')).join('')));
ok(btn.join() === '012,012,012,012', 'every line: ✓ Approve this check, ✕ Deny this check, ✏️ Edit, Pay stub', btn);
ok(await A.ev(() => !!document.querySelector('[data-appr="RUN1"]') && !!document.querySelector('[data-deny="RUN1"]') && !document.body.textContent.includes('Hold this one')), 'run buttons stay; "Hold this one" is gone');
ok(!(await A.ev(() => document.getElementById('gc-payroll-mount').textContent.includes('7.60'))), 'approvals show no $7.60 draft');

// ── 1. approve Cal alone ──
let nd = A.dialogs.length;
await A.ev(() => document.querySelector('[data-lappr="RUN1"][data-idx="2"]').click());
await waitFor(A, async () => (await window.__GC_PAY.runs()).some(r => r.splitFrom === 'RUN1' && r.status === 'approved'), null, 20000, 300); await sleep(2500);
const d1 = A.dialogs.slice(nd);
ok(d1.filter(d => /^confirm:/.test(d)).length === 1 && /^confirm: Approve only Cal Test's check/.test(d1[0]) && d1.some(d => /^alert: Approved Cal Test — check 5001/.test(d)), 'one confirm ("Approve only Cal Test\'s check"), then "Approved Cal Test — check 5001"', d1);
let all = await RUNS(); const N = all.find(r => r.splitFrom === 'RUN1'), R1 = all.find(r => r.id === 'RUN1');
ok(N && N.status === 'approved' && N.from === FROM && N.to === TO && N.payDate === PD && N.lines.length === 1 && N.lines[0].name === 'Cal Test' && N.lines[0].status === 'approved' && N.lines[0].checkNo === '5001',
  'Cal: own run, same week + payday, approved, check 5001', N);
ok(N && /^approved alone by \S+/.test((N.history || [])[0].note), 'history "approved alone by <me>"', N && N.history);
ok(R1.status === 'pending' && R1.lines.map(L => L.name + ':' + L.status).join() === 'Ann Test:pending,Ben Test:pending' && R1.totals.gross === 514.22, 'the rest of the run is still Waiting on admin, totals without Cal', R1);
const book = () => A.ev(async () => { const reg = ((await window.idbGet('gcAcctRegister')) || []).filter(x => /^PAYROLL_/.test(x.srcInvId || ''));
  const pay = JSON.parse(localStorage.getItem('gc_employee_payments') || '[]').filter(x => x.kind === 'payroll');
  return { reg: reg.map(x => x.srcInvId + '=' + (x.amt || x.amount)).sort(), pay: pay.map(x => x.emp + ' ' + x.amount + ' #' + x.checkNo).sort() }; });
const b1 = await book();
ok(b1.reg.length === 2 && b1.reg.some(x => x === 'PAYROLL_' + N.id + '_E3_WAGES=1346.15') && b1.reg.some(x => x.startsWith('PAYROLL_' + N.id + '_ERTAX=')), 'register: Cal\'s wages + employer taxes booked by approveRun, nothing else', b1);
ok(b1.pay.join() === 'Cal Test 1093.17 #5001', 'payment history: Cal\'s check', b1.pay);

// ── 2. deny Ann with a reason ──
await A.ev(() => { const b = document.querySelector('[data-open="RUN1"]'); if (b && !document.querySelector('[data-ldeny="RUN1"]')) b.click(); }); await sleep(1200);
A.prompts = ['hours are wrong — fix her timesheet'];
await A.ev(() => document.querySelector('[data-ldeny="RUN1"][data-idx="0"]').click()); await sleep(2500);
all = await RUNS(); const R2 = all.find(r => r.id === 'RUN1'), ann = R2.lines[0];
ok(ann.status === 'denied' && ann.denyReason === 'hours are wrong — fix her timesheet' && R2.status === 'pending', 'Ann denied with the reason; the run still waits for Ben', { ann, st: R2.status });
ok(await A.ev(() => document.getElementById('gc-payroll-mount').textContent.includes('denied: hours are wrong') && !!document.querySelector('[data-line="RUN1"][data-idx="0"][data-act="pending"]')), 'her row shows the reason and Undo');

// ── 3. edit Ben's hours ──
await A.ev(() => { const b = document.querySelector('[data-open="RUN1"]'); if (b && !document.querySelector('[data-ledit="RUN1"]')) b.click(); }); await sleep(1000);
await A.ev(() => document.querySelector('[data-ledit="RUN1"][data-idx="1"]').click()); await sleep(1500);
await p.locator('#gc-draftedit-ov [data-de="hrs"]').fill('30'); await sleep(300);
await A.ev(() => document.querySelector('#gc-draftedit-ov [data-de="save"]').click()); await sleep(2500);
all = await RUNS(); const R3 = all.find(r => r.id === 'RUN1'), ben = R3.lines[1];
ok(ben.hours === 30 && ben.gross === 750 && R3.status === 'pending' && R3.lines[0].status === 'denied', 'Ben: 30 h, gross $750, taxes recalculated; Ann stays denied', { h: ben.hours, g: ben.gross, st: R3.status });

// ── 4. approve the rest ──
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2000);
nd = A.dialogs.length;
await A.ev(() => document.querySelector('[data-appr="RUN1"]').click());
await waitFor(A, async () => (await window.__GC_PAY.runs()).find(r => r.id === 'RUN1').status === 'approved', null, 20000, 300); await sleep(2500);
ok(A.dialogs.slice(nd).some(d => /^confirm: Approve 1 check /.test(d)), '✓ Approve all & record: "Approve 1 check" (Ben)', A.dialogs.slice(nd));
all = await RUNS(); const R4 = all.find(r => r.id === 'RUN1'), N4 = all.find(r => r.id === N.id);
ok(R4.lines.map(L => L.name + ':' + L.status + ':' + (L.checkNo || '')).join() === 'Ann Test:denied:,Ben Test:approved:5002' && N4.lines[0].checkNo === '5001', 'Ben check 5002, Ann no check, Cal keeps 5001', R4.lines);
const b2 = await book();
ok(b2.reg.filter(x => /_WAGES=/.test(x)).join() === ['PAYROLL_' + N.id + '_E3_WAGES=1346.15', 'PAYROLL_RUN1_E2_WAGES=750'].sort().join() && !b2.reg.some(x => /_E1_/.test(x)), 'register wages: Cal 1346.15 once, Ben 750 once, Ann none', b2.reg);
ok(b2.reg.filter(x => /_ERTAX=/.test(x)).length === 2, 'employer taxes: one row per approved run', b2.reg);
ok(b2.pay.join() === ['Ben Test ' + ben.net + ' #5002', 'Cal Test 1093.17 #5001'].sort().join(), 'payment history: Ben and Cal once each', b2.pay);

// ── counts: runs / 941 / YTD / Friday ──
const c = await A.ev(async ([pd, gb]) => { const P = window.__GC_PAY, all = await P.runs();
  const same = all.filter(r => r.payDate === pd).map(r => r.status);
  const f = window._gcF941.compute({ runs: all, payments: [], settings: await P.settings(), year: 2026, q: 4 });
  const yC = P.ytdFor(all, 'E3', '2026'), yB = P.ytdFor(all, 'E2', '2026'), yA = P.ytdFor(all, 'E1', '2026');
  let due = null; try { due = (await window._gcChecksDue(pd)).payroll.map(x => x.name + ' ' + x.amt); } catch (e) { due = String(e); }
  return { same, L2: f.lines.L2, checks: f.runs.reduce((t, r) => t + r.checks, 0), yC: [yC.gross, yC.checks], yB: [yB.gross, yB.checks], yA: [yA.gross, yA.checks], due }; }, [PD]);
ok(c.same.sort().join() === 'approved,approved', 'payday ' + PD + ': two approved runs, no draft', c.same);
ok(Math.abs(c.L2 - (1346.15 + 750)) < 0.005 && c.checks === 2, '941 Q4: wages = Cal + Ben once, 2 checks', c);
ok(c.yC.join() === '1346.15,1' && c.yB.join() === '750,1' && c.yA.join() === '0,0', 'YTD: Cal 1 check, Ben 1 check, Ann none', c);
console.log('    Friday checks: ' + JSON.stringify(c.due));
ok(Array.isArray(c.due) && c.due.filter(x => /Cal Test/.test(x)).length === 1 && c.due.filter(x => /Ben Test/.test(x)).length === 1 && !c.due.some(x => /Ann Test/.test(x)), 'Friday check run: Cal once, Ben once, no Ann', c.due);
const errs = (A.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
