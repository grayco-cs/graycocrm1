// test_PAYMANUAL.mjs <build-dir> — patch PAYMANUAL: Payroll → "✍ Enter a week by hand" (any week, from the payroll
// profiles, same approval rules, duplicate-week warning) and delete / void a run (admin vs office, the delete list).
// Two computers (A: an admin, B: the office) in ONE headless browser, sharing the fake cloud of the offline harness
// (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs). MADE-UP people and amounts only: the cloud is
// seeded below, no fixture, no real payroll.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cget, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_PAYMANUAL.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };

/* ── made-up company: two crew, the app's own shared "Office" sign-in, an admin ───────────────────── */
const ADMIN = 'wjohnson@grayco-cs.com', OFFICE = 'office@grayco-cs.com';
const USERS = [
  { id: 'UA1', name: 'Tess Admin', email: ADMIN, role: 'Admin', active: true, payType: 'owner' },
  { id: 'U5', name: 'Office', email: OFFICE, role: 'Office', active: true, payType: 'salary' },
  { id: 'UT1', name: 'Avery Testworth', email: 'avery.test@example.test', role: 'Crew', active: true, payType: 'hourly', hourlyRate: 22 },
  { id: 'UT2', name: 'Blake Sampleton', email: 'blake.test@example.test', role: 'Crew', active: true, payType: 'salary', salary: 52000 }];
const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: '', annualSalary: 0, hourlyRate: 0, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', otherDeductions: [], active: true }, x);
const PROFILES = [prof('PPUT1', USERS[2], { payType: 'hourly', hourlyRate: 22 }), prof('PPUT2', USERS[3], { payType: 'salary', annualSalary: 52000 })];
const line = (name, gross, net, x) => Object.assign({ empId: name, name, payType: 'hourly', period: 'weekly', hours: 40, otHours: 0, rate: 22, gross, fed: 50, ss: r2(gross * .062), med: r2(gross * .0145), addlMed: 0, state: 0, otherDed: 0, net, employerSS: r2(gross * .062), employerMed: r2(gross * .0145), futa: 0, suta: 0, status: 'pending', checkNo: '' }, x);
function r2(v){ return Math.round(v * 100) / 100; }
const run = (id, from, to, payDate, status, by, lines, x) => Object.assign({ id, from, to, payDate, payday: payDate, date: payDate, status, createdBy: by, createdAt: '2026-09-20T15:00:00.000Z', lines,
  totals: { gross: lines.reduce((s, L) => s + L.gross, 0), net: lines.reduce((s, L) => s + L.net, 0) } }, x);
const RUNS = [
  run('RPTPAID', '2026-09-03', '2026-09-09', '2026-09-11', 'paid', 'Tess Admin', [line('Avery Testworth', 880, 762.68, { status: 'paid', checkNo: '9001', paidOut: true })], { approvedBy: 'Tess Admin', checksWritten: true }),
  run('RPTPEND', '2026-09-10', '2026-09-16', '2026-09-18', 'pending', 'Office', [line('Avery Testworth', 660, 569.51)], { submittedBy: 'Office' }),
  run('RPTAPPR', '2026-09-17', '2026-09-23', '2026-09-25', 'approved', 'Office', [line('Blake Sampleton', 1000, 873.50, { status: 'approved', checkNo: '9002' })], { approvedBy: 'Tess Admin' }),
  run('RPTODRAFT', '2026-09-24', '2026-09-30', '2026-10-02', 'draft', 'Office', [line('Avery Testworth', 440, 386.34)]),
  run('RPTXDRAFT', '2026-10-01', '2026-10-07', '2026-10-09', 'draft', 'Someone Else', [line('Avery Testworth', 220, 193.17)]),
  run('RPTDENY', '2026-10-08', '2026-10-14', '2026-10-16', 'denied', 'Office', [line('Avery Testworth', 330, 289.75)], { deniedBy: 'Tess Admin', denyReason: 'wrong hours' })];
const REG = [
  { id: 'RGT1', srcInvId: 'PAYROLL_RPTAPPR_Blake Sampleton_WAGES', type: 'expense', category: 'Payroll — Wages', payee: 'Blake Sampleton', amt: 1000, date: '2026-09-25', status: 'paid' },
  { id: 'RGT2', srcInvId: 'PAYROLL_RPTAPPR_ERTAX', type: 'expense', category: 'Payroll — Employer Taxes', payee: 'IRS / State', amt: 76.5, date: '2026-09-25', status: 'pending' },
  { id: 'RGT3', srcInvId: 'TESTSUPPLY1', type: 'expense', category: 'Materials', payee: 'Test Supply Co', amt: 123.45, date: '2026-09-20', status: 'paid' }];
const PROJECTS = [{ id: 'PJT1', name: 'Test Reroof One', client: 'Test Customer A', status: 'active', pm: 'Tess Admin' }, { id: 'PJT2', name: 'Test Gutter Two', client: 'Test Customer B', status: 'active', pm: 'Tess Admin' }];
resetCloud();
cset('users', USERS); cset('payrollProfiles', PROFILES); cset('payrollRuns', RUNS); cset('gcAcctRegister', REG); cset('projects', PROJECTS);
cset('gc_tombstones', {}); cset('timesheets', []);

const cloudRuns = () => { let v = cget('payrollRuns'); if (typeof v === 'string') v = JSON.parse(v); return Array.isArray(v) ? v : []; };
const cloudTomb = () => { let v = cget('gc_tombstones'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return v || {}; };
async function login(c, email){
  const p = c.page(); await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await ready(c);
}
async function ready(c){
  await waitFor(c, async () => !!(window.__GC_PAY && window._gcPayManualOpen && window.__GC_PAY.canSee()) && (await window.__GC_PAY.runs()).length >= 3, null, 120000, 400);
  await sleep(6000);
}
const disk = c => c.ev(async () => { const v = await window.idbGet('payrollRuns'); return (Array.isArray(v) ? v : []).map(r => ({ id: r.id, status: r.status, to: r.to, by: r.createdBy, man: !!r.enteredManually, n: (r.lines || []).length })); });
const readRuns = c => c.ev(async () => (await window.__GC_PAY.runs()).map(r => ({ id: r.id, status: r.status })));
async function toTab(c, tab){ await c.ev(t => window._gcOpenPayrollTab(t), tab); await sleep(1800); }
const has = (c, sel) => c.ev(s => !!document.querySelector(s), sel);

const A = await computer('A', { build }); await login(A, ADMIN);
const pa = A.page();
const SHOTS = process.env.PAYM_SHOTS || '';   /* optional: a folder for screenshots */
ok(await A.ev(() => !!window.__GC_PAYMANUAL__ && window.__GC_PAY.isAdmin()), 'A is signed in as an admin and patch PAYMANUAL is loaded');

/* 1. the button on Run Payroll */
await toTab(A, 'run');
if (SHOTS) await pa.screenshot({ path: SHOTS + '/paym_run_tab.png' });
ok(await has(A, '#_pManual'), '1 admin: "✍ Enter a week by hand" is on the Run Payroll tab', await A.ev(() => (document.querySelector('#gc-payroll-mount') || {}).innerText || '').then(s => s.slice(0, 200)));
await pa.locator('#_pManual').click(); await sleep(1500);
ok(await has(A, '#_gcPmOv') && await has(A, '#_pmPaid') && await has(A, '#_pmApproved'), '1 it opens the hand-entry screen; an admin can save approved or paid');
const wkNow = await A.ev(() => { const c = window._gcCurrentPayPeriod(); return { end: c.end, val: document.querySelector('#_pmEnd').value }; });
ok(wkNow.val === wkNow.end, '1 it starts on this week (the same week as Run Payroll)', wkNow);
await pa.locator('#_pmLast').click(); await sleep(600);
const wkLast = await A.ev(() => { const c = window._gcCurrentPayPeriod(); const l = window._gcPayPeriodFor(window.__GC_PAY.addDays(c.payday, -7)); return { want: l.end, val: document.querySelector('#_pmEnd').value }; });
ok(wkLast.val === wkLast.want, '1 "Last week" moves to the week before', wkLast);
async function pickWeek(day){ await A.ev(d => { const e = document.querySelector('#_pmEnd'); e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, day); await sleep(900); }

/* 2. the duplicate-week warning */
await pickWeek('2026-09-05');
const dupBox = await A.ev(() => { const b = document.querySelector('#_pmDup'); return { shown: b && b.style.display !== 'none', text: b && b.textContent, end: document.querySelector('#_pmEnd').value }; });
ok(dupBox.end === '2026-09-09', '2 any date is moved to the payroll week it falls in (Sat 9/5 → week ending Wed 9/9)', dupBox);
ok(dupBox.shown && /already a payroll run/.test(dupBox.text) && /Paid/.test(dupBox.text), '2 a week that already has a run shows the warning (the paid run for 9/3–9/9)', dupBox);
await pickWeek('2026-08-26');
ok(await A.ev(() => document.querySelector('#_pmDup').style.display === 'none'), '2 an empty week shows no warning');

/* 3. add a manual week (admin, paid) through the screen */
async function addPerson(c, name){ await c.page().locator('#_pmPick').selectOption(name); await c.page().locator('#_pmAdd').click(); await sleep(300); }
async function typeIn(c, row, k, v){ const l = c.page().locator(`#_pmBody tr[data-row="${row}"] [data-k="${k}"]`); await l.fill(String(v)); await sleep(150); }
await addPerson(A, 'Avery Testworth'); await addPerson(A, 'Blake Sampleton');
await typeIn(A, 0, 'hours', 40); await typeIn(A, 0, 'fed', 50); await typeIn(A, 0, 'fica', 67.32);
const auto = await A.ev(() => ({ g: document.querySelector('#_pmBody tr[data-row="0"] [data-k="gross"]').value, n: document.querySelector('#_pmBody tr[data-row="0"] [data-k="net"]').value, rate: document.querySelector('#_pmBody tr[data-row="0"] [data-k="rate"]').value }));
ok(auto.rate === '22' && +auto.g === 880 && +auto.n === 762.68, '3 the rate comes from the payroll profile; gross = hours × rate, net = gross − taxes', auto);
await typeIn(A, 1, 'gross', 1000); await typeIn(A, 1, 'fed', 90); await typeIn(A, 1, 'fica', 76.5); await typeIn(A, 1, 'checkNo', 'M-1');
if (SHOTS) await pa.screenshot({ path: SHOTS + '/paym_form_admin.png' });
const nd0 = A.dialogs.length;
await pa.locator('#_pmPaid').click(); await sleep(2500);
let d = await disk(A); const man = d.filter(r => r.man && r.to === '2026-08-26');
ok(man.length === 1 && man[0].status === 'paid' && man[0].n === 2, '3 saved into payrollRuns: week ending 8/26, paid, 2 lines, enteredManually', man);
const m1 = await A.ev(async () => (await window.__GC_PAY.runs()).find(r => r.enteredManually && r.to === '2026-08-26'));
ok(m1 && m1.from === '2026-08-20' && m1.payDate === '2026-08-28' && m1.lines[1].checkNo === 'M-1' && m1.lines[1].net === 833.5 && m1.totals.gross === 1880 && m1.checksWritten === true,
  '3 the run carries its week, Friday check date, check #, net and totals', m1 && { from: m1.from, pay: m1.payDate, l: m1.lines.map(L => [L.name, L.gross, L.net, L.checkNo]), t: m1.totals });
ok(A.dialogs.slice(nd0).some(x => /entered by hand/.test(x)), '3 it says what was saved', A.dialogs.slice(nd0));
const MAN1 = m1 && m1.id;
let cr = null; for (let i = 0; i < 30 && !cr; i++) { await sleep(1000); cr = cloudRuns().find(r => r.id === MAN1); }
ok(!!cr && cr.enteredManually === true, '3 the hand-entered run reached the cloud, where payroll is kept now (payrollRuns)');

/* 4. the same week again: warned on screen and asked once more before saving */
await toTab(A, 'run'); await pa.locator('#_pManual').click(); await sleep(1200);
await pickWeek('2026-08-26');
ok(await A.ev(() => /already a payroll run/.test(document.querySelector('#_pmDup').textContent || '')), '4 the run just entered is found for the same week');
await addPerson(A, 'Avery Testworth'); await typeIn(A, 0, 'gross', 100);
const nd1 = A.dialogs.length;
await pa.locator('#_pmApproved').click(); await sleep(2500);
ok(A.dialogs.slice(nd1).some(x => /^confirm: There is already a payroll run for the week/.test(x)), '4 saving asks "There is already a payroll run for the week … save another?"', A.dialogs.slice(nd1));
d = await disk(A);
const two = d.filter(r => r.to === '2026-08-26');
ok(two.length === 2 && two.some(r => r.status === 'approved'), '4 only after yes is the second run saved (approved)', two);
const MAN2 = (two.find(r => r.status === 'approved') || {}).id;
const refused = await A.ev(() => window._gcPayManualSave({ weekEnding: '2026-08-26', status: 'approved', lines: [{ name: 'Avery Testworth', gross: 10 }] }));
ok(!refused.ok && refused.dup && refused.dup.length === 2, '4 without that yes the save is refused (the duplicate list is returned)', { ok: refused.ok, why: refused.why });

/* 5. the Approvals tab: who may delete what (admin) */
await toTab(A, 'approvals');
if (SHOTS) await pa.screenshot({ path: SHOTS + '/paym_approvals_admin.png', fullPage: true });
const btnsA = await A.ev(() => ({ del: [...document.querySelectorAll('[data-del]')].map(b => b.getAttribute('data-del')), vd: [...document.querySelectorAll('[data-void]')].map(b => b.getAttribute('data-void')),
  chips: (document.querySelector('#gc-payroll-mount') || {}).innerText.includes('entered by hand') }));
ok(['RPTPEND', 'RPTAPPR', 'RPTODRAFT', 'RPTXDRAFT', 'RPTDENY', MAN2].every(id => btnsA.del.includes(id)) && !btnsA.del.includes('RPTPAID') && !btnsA.del.includes(MAN1),
  '5 admin: Delete on every run that is not paid (draft, waiting, approved, denied) — not on a paid one', btnsA);
ok(btnsA.vd.includes('RPTPAID') && btnsA.vd.includes(MAN1) && btnsA.vd.length === 2, '5 admin: Void only on the paid runs', btnsA.vd);
ok(btnsA.chips, '5 a hand-entered run is tagged "entered by hand"');

/* 6. delete a waiting (pending) run: the question names the week and the total; the delete list keeps it deleted */
const nd2 = A.dialogs.length;
await pa.locator('[data-del="RPTPEND"]').click(); await sleep(2500);
const q6 = A.dialogs.slice(nd2).join(' | ');
ok(/^confirm: Delete the payroll run for the week Thu 9\/10\/2026 → Wed 9\/16\/2026\?/.test(A.dialogs[nd2] || '') && /\$569\.51 net/.test(q6) && /Waiting on admin/.test(q6), '6 the question names the week and the total', q6);
d = await disk(A);
ok(!d.some(r => r.id === 'RPTPEND'), '6 the pending run is gone from this computer');
ok(await A.ev(() => !!window._gcxDead('payrollRuns', 'RPTPEND')), '6 it is on the app\'s delete list (gc_tombstones: payrollRuns:RPTPEND)');
const log6 = await A.ev(() => (window._gcxDeleteLog() || []).filter(e => e.list === 'payrollRuns' && e.id === 'RPTPEND').slice(-1)[0]);
ok(log6 && /payroll week 2026-09-10 → 2026-09-16/.test(log6.why) && /\$569\.51/.test(log6.why), '6 the delete is in the app\'s delete log with the week and the total', log6);
let t6 = false, c6 = true; for (let i = 0; i < 30; i++) { await sleep(1000); t6 = !!cloudTomb()['payrollRuns:RPTPEND']; c6 = cloudRuns().some(r => r.id === 'RPTPEND'); if (t6 && !c6) break; }
ok(t6, '6 the delete mark reached the cloud');
ok(!c6, '6 the cloud copy of payroll no longer has the run');

/* 7. a paid run cannot be deleted; void needs the typed word */
const r7 = await A.ev(() => window._gcPayRunDelete('RPTPAID', { quiet: true, noAsk: true }));
ok(!r7.ok && /cannot be deleted/.test(r7.why) && (await disk(A)).some(r => r.id === 'RPTPAID' && r.status === 'paid'), '7 a paid run cannot be deleted (even asked directly)', r7);
const r7b = await A.ev(() => window._gcPayRunVoid('RPTPAID', { quiet: true, typed: 'yes' }));
ok(!r7b.ok && (await disk(A)).some(r => r.id === 'RPTPAID' && r.status === 'paid'), '7 Void without typing VOID does nothing', r7b);
const due0 = await A.ev(async m2 => { const x = await window._gcChecksDue('2026-12-31'); return (x.payroll || []).filter(p => p.runId === 'RPTPAID' || p.runId === m2).map(p => p.runId); }, MAN2);
A.prompts = ['void'];
const nd3 = A.dialogs.length;
await toTab(A, 'approvals'); await pa.locator('[data-void="RPTPAID"]').click(); await sleep(2500);
ok(/^prompt: Type VOID to void the PAID payroll run for the week Thu 9\/3\/2026 → Wed 9\/9\/2026/.test(A.dialogs[nd3] || '') && /\$762\.68 net/.test(A.dialogs[nd3] || ''), '7 Void asks for the typed word, naming the week and the total', A.dialogs.slice(nd3));
const v7 = await A.ev(async () => (await window.idbGet('payrollRuns')).find(r => r.id === 'RPTPAID'));
ok(v7 && v7.status === 'voided' && v7.voidedFrom === 'paid' && !!v7.voidedBy && (v7.history || []).some(h => h.action === 'voided'), '7 the run is kept, marked voided, with who and when in its history', v7 && { st: v7.status, by: v7.voidedBy, h: v7.history });
ok(await A.ev(() => /Voided/.test((document.querySelector('#gc-payroll-mount') || {}).innerText || '')), '7 the Approvals tab shows it as Voided');
const after7 = await A.ev(async () => { const P = window.__GC_PAY, all = await P.runs(); const ytd = P.ytdFor(all, 'Avery Testworth', '2026', '2026-12-31'); const x = await window._gcChecksDue('2026-12-31');
  return { ytdGross: ytd.gross, due: (x.payroll || []).filter(p => p.runId === 'RPTPAID').length, cost: await window._gcPayrollCost('2026-09-01', '2026-09-30') }; });
ok(after7.ytdGross === 0 && after7.due === 0, '7 a voided run is out of year-to-date and the checks due', { after7, due0 });
const r7c = await A.ev(() => window._gcPayRunDelete('RPTPAID', { quiet: true, noAsk: true }));
ok(!r7c.ok, '7 a voided run is not deleted either (kept for the record)', r7c);

/* 8. delete an approved (not paid) run: its rows come out of the books, other rows stay */
const reg0 = await A.ev(async () => ((await window.idbGet('gcAcctRegister')) || []).map(r => r.id));
await toTab(A, 'approvals'); await pa.locator('[data-del="RPTAPPR"]').click(); await sleep(3500);
const reg1 = await A.ev(async () => ((await window.idbGet('gcAcctRegister')) || []).map(r => r.id));
ok(!(await disk(A)).some(r => r.id === 'RPTAPPR'), '8 the approved (not paid) run is deleted');
ok(reg0.includes('RGT1') && !reg1.includes('RGT1') && !reg1.includes('RGT2') && reg1.includes('RGT3'), '8 its wages and employer-tax rows came out of the books; other rows are untouched', { reg0, reg1 });

/* 9. THE CLOUD MERGE DOES NOT BRING A DELETED RUN BACK: another computer pushes its old copy, then a pull and a reload */
const stale = RUNS.map(r => (r.id === 'RPTPEND' || r.id === 'RPTAPPR') ? Object.assign({}, r, { updatedAt: new Date(Date.now() + 60000).toISOString() }) : r);   /* the deleted ones even look newer */
cset('payrollRuns', stale.concat(cloudRuns().filter(r => !stale.some(s => s.id === r.id))));
ok(cloudRuns().some(r => r.id === 'RPTPEND') && cloudRuns().some(r => r.id === 'RPTAPPR'), '9 (setup) an old copy with the deleted runs is now in the cloud, newer than this computer\'s');
await A.ev(() => window._gcPullNow(true)); await sleep(6000);
d = await disk(A);
ok(!d.some(r => r.id === 'RPTPEND' || r.id === 'RPTAPPR'), '9 after a cloud pull the deleted runs are still gone from this computer', d.map(r => r.id));
ok(!(await readRuns(A)).some(r => r.id === 'RPTPEND' || r.id === 'RPTAPPR'), '9 … and from what the payroll page reads');
await pa.reload(); await ready(A); await A.ev(() => window._gcPullNow(true)); await sleep(5000);
d = await disk(A);
await toTab(A, 'approvals');
const scr9 = await A.ev(() => [...document.querySelectorAll('[data-open]')].map(b => b.getAttribute('data-open')));
ok(!d.some(r => r.id === 'RPTPEND' || r.id === 'RPTAPPR') && !scr9.includes('RPTPEND') && !scr9.includes('RPTAPPR') && scr9.includes('RPTPAID'), '9 after a reload and another pull: still gone (disk and screen); the voided run is still listed', { d: d.map(r => r.id), scr9 });
const v9 = d.find(r => r.id === 'RPTPAID');
ok(v9 && v9.status === 'voided', '9 the void was not undone by the old copy either', v9);

/* 10. the office */
const B = await computer('B', { build }); await login(B, OFFICE);
const pb = B.page();
ok(await B.ev(() => window.__GC_PAY.isOffice() && !window.__GC_PAY.isAdmin()), '10 B is signed in as the office');
await toTab(B, 'run');
ok(await has(B, '#_pManual'), '10 office: "✍ Enter a week by hand" is on the Run Payroll tab');
await pb.locator('#_pManual').click(); await sleep(1500);
ok(await has(B, '#_pmSend') && !(await has(B, '#_pmPaid')) && !(await has(B, '#_pmApproved')), '10 office: "Send to an admin for approval" — no approved / paid');
await B.ev(d => { const e = document.querySelector('#_pmEnd'); e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, '2026-08-19'); await sleep(900);
await addPerson(B, 'Avery Testworth'); await typeIn(B, 0, 'hours', 10);
await pb.locator('#_pmSend').click(); await sleep(2500);
const bRun = await B.ev(async () => (await window.__GC_PAY.runs()).find(r => r.enteredManually && r.to === '2026-08-19'));
ok(bRun && bRun.status === 'pending' && bRun.submittedBy === bRun.createdBy && bRun.lines[0].gross === 220, '10 office: the hand-entered week goes to an admin (pending)', bRun && { st: bRun.status, by: bRun.createdBy, g: bRun.lines[0].gross });
const bPaid = await B.ev(() => window._gcPayManualSave({ weekEnding: '2026-08-12', status: 'paid', lines: [{ name: 'Avery Testworth', gross: 50 }] }));
ok(!bPaid.ok && /Only an admin/.test(bPaid.why), '10 office: saving as paid is refused', bPaid);
await toTab(B, 'approvals');
const btnsB = await B.ev(() => ({ del: [...document.querySelectorAll('[data-del]')].map(b => b.getAttribute('data-del')), vd: document.querySelectorAll('[data-void]').length }));
ok(btnsB.del.length === 1 && btnsB.del[0] === 'RPTODRAFT' && btnsB.vd === 0, '10 office: Delete only on its own draft; no Void', btnsB);
const bx = await B.ev(async m1 => ({ other: await window._gcPayRunDelete('RPTXDRAFT', { quiet: true, noAsk: true }), deny: await window._gcPayRunDelete('RPTDENY', { quiet: true, noAsk: true }),
  pend: await window._gcPayRunDelete((await window.__GC_PAY.runs()).find(r => r.enteredManually && r.to === '2026-08-19').id, { quiet: true, noAsk: true }), paid: await window._gcPayRunDelete(m1 || 'x', { quiet: true, noAsk: true }) }), MAN1);
ok(!bx.other.ok && !bx.deny.ok && !bx.pend.ok && !bx.paid.ok, '10 office: refused (asked directly) for someone else\'s draft, a denied run, its own waiting run and a paid run', bx);
await pb.locator('[data-del="RPTODRAFT"]').click(); await sleep(2500);
ok(!(await disk(B)).some(r => r.id === 'RPTODRAFT') && await B.ev(() => !!window._gcxDead('payrollRuns', 'RPTODRAFT')), '10 office: its own draft is deleted, through the delete list');
const left = await disk(B);
ok(['RPTXDRAFT', 'RPTDENY', 'RPTPAID', MAN1, MAN2].every(id => left.some(r => r.id === id)), '10 office: nothing else was touched', left.map(r => r.id));

const errs = [].concat(A.errs, B.errs).filter(e => !/cdnjs|ResizeObserver/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 3));
console.log('RESULT ' + pass + '/' + (pass + fail));
await shared.close(); process.exit(fail ? 1 : 0);
