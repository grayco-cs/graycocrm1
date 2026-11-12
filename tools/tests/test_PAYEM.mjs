// test_PAYEM.mjs <build-dir> — patch PAYEM in real (headless) browsers, MADE-UP people only (offline harness):
// (1) a crew member on a phone taps ⏱ Clock in on an emergency job → "🚨 Emergency call-out (after hours)" → own timesheet row
//     { emergency: true }; the button reads "🚨 Clock out (emergency)"; tapping it again clocks out.
// (2) the owner approves a 🎖 certification raise (pay rate history, new rate from the next pay period) and a 🏆 PM year-end bonus;
// (3) Run Payroll for the week: the crew line shows the "🚨" hours, the totals row "Emergency call-out 1.5×", the math, the PM's
//     "Bonus — PM year-end"; submitted → Approvals shows both; ✏️ Edit sets the emergency hours; the pay stub has the 1.5× line.
import fs from 'fs';
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_PAYEM.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = (process.argv[3] || process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/payem_shots').replace(/\/?$/, '/');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 240) : '')); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const add = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const now = new Date(), today = ymd(now);
/* the Thursday → Wednesday work week that holds today (the default pay schedule) */
const wkStart = add(now, -((now.getDay() - 4 + 7) % 7)), wkDays = [0, 1, 2, 3, 4, 5, 6].map(k => ymd(add(wkStart, k))).filter(d => d !== today).slice(0, 4);
const CREW = 'crew.demo@grayco-cs.com', ADMIN = 'wjohnson@grayco-cs.com';
H.ACCOUNTS[CREW] = H.ACCOUNTS[CREW] || { pw: 'Correct-Horse-44', id: 'u-crew', role: 'staff' };
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Pat Demo', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u9', name: 'Zedd Demo', email: CREW, role: 'Superintendent', active: true }]);
const prof = (id, u, x) => Object.assign({ id, userId: u.id, name: u.name, email: u.email, payType: 'hourly', annualSalary: 0, hourlyRate: 20, otAfter: 40, otMultiplier: 1.5,
  period: 'weekly', filing: 'single', dependentsCredit: 0, otherIncome: 0, deductions: 0, extra: 0, state: 'TN', workState: 'TN', otherDeductions: [], active: true }, x);
H.cset('payrollProfiles', [prof('PPZ', { id: 'u9', name: 'Zedd Demo', email: CREW }), prof('PPP', { id: 'u3', name: 'Pat Demo', email: 'sbiffle@grayco-cs.com' }, { payType: 'salary', annualSalary: 52000, hourlyRate: 0 }),
  prof('PPO', { id: 'u1', name: 'Wesley Johnson', email: ADMIN }, { payType: 'owner_draw', hourlyRate: 0 })]);
H.cset('timesheets', wkDays.map((d, i) => ({ id: 'TSR' + i, user: 'Zedd Demo', date: d, clockIn: '07:00', clockOut: '16:30', manual: true, updatedAt: now.toISOString() })));   // 4 × 9.5 = 38 h regular
H.cset('payrollRuns', []); H.cset('gc_tombstones', {}); H.cset('payrollSettings', { companyName: 'Demo Co LLC' });
H.cset('projects', [{ id: 'P1', po: 'PO-3001', autoPO: 'PO-3001', name: 'Demo Burst Pipe', client: 'Demo Homeowner', address: '100 Demo St', pm: 'Pat Demo', superintendent: 'Zedd Demo', status: 'In Progress', emergency: true, urgency: 'Emergency', contract: 9000, contractSigned: true, updatedAt: now.toISOString() }]);
H.cset('schedule', [{ id: 'SC1', pid: 'P1', projectId: 'P1', date: today, title: 'Emergency dry-out', start: today, end: today }]);
H.cset('gc_certs', { list: [{ id: 'c1', holderType: 'person', holder: CREW, holderName: 'Zedd Demo', name: 'IICRC WRT', issuer: 'IICRC', expires: ymd(add(now, 300)) }] });
H.cset('gc_cert_plan', { people: { [CREW]: { track: 'mit_tech' } } });

/* ── 1. the crew phone ── */
const C = await H.computer('CREW', { build, mobile: true });
await C.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
await H.signIn(C, CREW, 9000);
const home = await H.waitFor(C, () => !!document.querySelector('#_gcJobPick .gc-ra-q [data-ra-a="clock"]') && !!window._gcPayEm && !!window._gcTimeClock, null, 60000, 300);
ok(!!home, 'crew on a phone: GrayCo Field with ⏱ Clock in');
await sleep(9500);   // the sign-in clock-in (8 s) has run: its open regular punch becomes the call-out
const tapClock = async () => { const loc = C.page().locator('#_gcJobPick .gc-ra-q [data-ra-a="clock"]').first(); await loc.tap({ timeout: 5000 }).catch(async () => { await loc.click({ timeout: 5000 }); }); await sleep(1200);
  if (await C.page().locator('.gc-ra-sheet [data-pj]').count()) { await C.page().locator('.gc-ra-sheet [data-pj]').first().tap().catch(() => {}); await sleep(1200); } };
const dayCheck = await C.ev(() => { const P = window._gcPayEm; const d = new Date(2026, 10, 11, 10, 0); const e = new Date(2026, 10, 11, 18, 5); return { ten: P.afterHours(d), six: P.afterHours(e), sat: P.afterHours(new Date(2026, 10, 14, 10, 0)) }; });
ok(dayCheck && !dayCheck.ten && dayCheck.six && dayCheck.sat, 'owner 11/12: regular hours are Mon–Fri 7 AM–6 PM — 10 AM weekday is work hours, 6:05 PM and Saturday are after hours', dayCheck);
await C.ev(() => { window._gcPayEm.DAY.start = 0; window._gcPayEm.DAY.end = 0; });   /* the rest of this test runs as after hours (an emergency job during work hours is standard pay) */
await tapClock();
const sh = await C.ev(() => { const o = document.getElementById('gc-payem-sheet'); return o ? { em: !!o.querySelector('[data-pe="em"]'), reg: !!o.querySelector('[data-pe="reg"]'), txt: o.innerText } : null; });
ok(sh && sh.em && sh.reg && /emergency job|after hours/.test(sh.txt), '⏱ after hours (on an emergency job) asks: 🚨 Emergency call-out (after hours) or 🕐 Regular time', sh);
await C.page().screenshot({ path: SHOTS + 'payem_1_field_choice.png' });
await C.page().locator('#gc-payem-sheet [data-pe="em"]').tap();
await sleep(1800);
const mine = await C.ev(async () => { const l = await window._gcTimeClock.list(); return { rows: l.filter(r => r.user === 'Zedd Demo' && r.date === window._gcTimeClock.today()).map(r => ({ id: r.id, em: !!r.emergency, inT: r.clockIn, out: r.clockOut, pid: r.pid })), open: window._gcPayEm.openPunch() }; });
ok(mine.rows.filter(r => r.em).length === 1 && mine.rows.filter(r => !r.em && !r.out).length === 0 && mine.open && mine.rows.some(r => r.em && r.id === mine.open.id && r.pid === 'P1'), 'one 🚨 emergency punch for today on the job (the sign-in punch became it — no hour counted twice)', mine);
/* three hours later … */
await C.ev(async () => { const tc = window._gcTimeClock, l = await tc.list(), op = window._gcPayEm.openPunch(), r = l.find(x => x.id === op.id); const d = new Date(Date.now() - 3 * 3600e3);
  r.clockIn = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); r.actualIn = r.clockIn; await tc.save(l); });
try { await C.ev(() => window._gcRA && window._gcRA.sync && window._gcRA.sync()); } catch (e) {}
await sleep(800);
const lbl = await C.ev(() => window._gcRA.label('clock'));
ok(/🚨 Clock out \(emergency\)/.test(lbl), 'the button now reads "🚨 Clock out (emergency)"', lbl);
await C.page().screenshot({ path: SHOTS + 'payem_2_field_on_callout.png' });
await tapClock();
ok(await C.ev(() => !!document.querySelector('#gc-payem-sheet [data-pe="out"]')), 'tapping it again offers 🏁 Clock out of the call-out');
await C.page().locator('#gc-payem-sheet [data-pe="out"]').tap(); await sleep(1800);
const outd = await C.ev(async () => { const l = await window._gcTimeClock.list(); const r = l.find(x => x.emergency && x.user === 'Zedd Demo'); return { r, h: window._gcTimeClock.hoursOf(r), open: window._gcPayEm.openPunch(), toast: (document.getElementById('gc-payem-toast') || {}).textContent || '' }; });
ok(outd.r && outd.r.clockOut && outd.h > 2.9 && outd.h < 3.2 && !outd.open && /h emergency call-out \(1\.5×\)/.test(outd.toast), 'clocked out: ~3 h emergency call-out', { h: outd.h, toast: outd.toast });
await sleep(2500);   // the crew's own list reaches the cloud
await C.b.close().catch(() => {});

/* ── 2. the owner: 🎖 raise + 🏆 bonus ── */
const A = await H.computer('ADMIN', { build });
await A.page().setViewportSize({ width: 1366, height: 900 });
await A.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
await H.signIn(A, ADMIN, 12000);
await H.waitFor(A, () => !!(window.__GC_PAY && window.__GC_PAY.isAdmin() && window._gcCertPlan && window._gcPayEm), null, 90000, 400);
const merged = await H.waitFor(A, async () => (await window.__GC_PAY.timesheetRows('Zedd Demo')).filter(r => r.emergency && r.clockOut).length === 1, null, 40000, 800);
ok(!!merged, 'the office computer has the crew\'s 🚨 punch in Timesheets');
await A.ev(() => window._gcOpenTimesheets()); await sleep(1200);
const tsv = await A.ev(() => ({ badge: document.querySelectorAll('[data-ts-em]').length, toggles: document.querySelectorAll('._tsEm').length, add: !!document.getElementById('_tsE') }));
ok(tsv.badge === 1 && tsv.toggles >= 5 && tsv.add, 'Timesheets: 🚨 Emergency 1.5× badge, a 🚨 toggle per row, 🚨 on + Add time', tsv);
await A.page().screenshot({ path: SHOTS + 'payem_3_timesheets.png' });
await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => x.id === '_tsClose'); if (b) b.click(); });
await A.ev(() => window._gcCertPlan.open('raises')); await sleep(2200);
const eff = await A.ev(() => (document.querySelector('[data-cp-eff="0"]') || {}).value || '');
const per = await A.ev(t => { const c = window._gcPayPeriodContaining(t); return { start: c.start, end: c.end, payday: c.payday }; }, today);
const nxt = await A.ev(() => window._gcCertPlan.nextPayStart());
ok(!!eff && eff === nxt, 'raise row: "Starts" = the next pay period', { eff, nxt });
await A.ev(t => { const i = document.querySelector('[data-cp-eff="0"]'); i.value = t; }, per.start);   // start it with the week being run (so this run shows it)
await A.ev(() => { const i = document.querySelector('[data-cp-amt="0"]'); if (i) i.value = '0.5'; });   // patch CERTROLE: the owner's WRT raise is $1/hr now; this test keeps its $0.50 numbers by editing the amount (an admin may)
await A.page().screenshot({ path: SHOTS + 'payem_4_raise.png' });
await A.ev(() => document.querySelector('[data-cp="approve"]').click()); await sleep(3500);
const pr = await A.ev(async () => (await window.__GC_PAY.profiles()).find(p => p.name === 'Zedd Demo'));
const h0 = (pr.rateHistory || [])[0] || {};
ok(pr.hourlyRate === 20.5 && h0.from === 20 && h0.to === 20.5 && h0.effective === per.start && /Certification raise — IICRC WRT/.test(h0.why) && h0.by === 'Wesley Johnson', '✅ Approve: payroll rate $20 → $20.50 from ' + per.start + ', in the pay rate history (who / when / why)', { rate: pr.hourlyRate, h0 });
const done = (H.cget('gc_cert_plan') || {}).done || [];
ok(done.length === 1 && done[0].effective === per.start && done[0].payroll === 'applied', 'the 🎖 record says it is in Payroll', done);
await A.ev(() => document.querySelector('[data-cptab="bonus"]').click()); await sleep(600);
await A.ev(() => { document.querySelector('[data-cp-ba="sbiffle@grayco-cs.com"]').value = '2500'; document.querySelector('[data-cp-bn="sbiffle@grayco-cs.com"]').value = 'Demo notes'; });
await A.ev(() => document.querySelector('[data-cp="bonusok"][data-em="sbiffle@grayco-cs.com"]').click()); await sleep(2500);
const yr = String(now.getFullYear()), bo = ((H.cget('gc_cert_plan') || {}).bonus || {})[yr] || {};
ok(bo['sbiffle@grayco-cs.com'] && bo['sbiffle@grayco-cs.com'].amount === 2500 && !!bo['sbiffle@grayco-cs.com'].approvedAt, '🏆 PM year-end bonus approved → next paycheck', bo);
await A.page().screenshot({ path: SHOTS + 'payem_5_bonus.png' });
await A.ev(() => { const o = document.getElementById('gc-certplan'); if (o) o.remove(); });

/* ── 3. Run Payroll ── */
await A.ev(() => window._gcOpenPayrollTab('run')); await sleep(1500);
await A.ev(p => { const set = (s, v) => { const e = document.querySelector(s); e.value = v; }; set('#_pFrom', p.start); set('#_pTo', p.end); set('#_pPay', p.payday); document.querySelector('#_pCalc').click(); }, per);
await H.waitFor(A, () => !!document.querySelector('#_pOut table'), null, 30000, 400); await sleep(800);
const run = await A.ev(() => { const rows = [...document.querySelectorAll('#_pOut tbody tr')].map(t => t.innerText.replace(/\s+/g, ' ')); return { rows, tot: (document.querySelector('[data-payem-tot]') || {}).innerText || '' }; });
const zr = run.rows.find(r => /Zedd Demo/.test(r)) || '', E = await A.ev(async () => { const L = (await window.__GC_PAY.timesheetRows('Zedd Demo')).find(r => r.emergency); return window.__GC_PAY.rowHours(L); });
const em = Math.round(E * 100) / 100, x = { total: 38 + em }; x.over = Math.max(0, x.total - 40); x.prem = Math.min(x.total, em + x.over); x.straight = x.total - x.prem; x.ot = x.prem - em;
const want = Math.round((x.straight * 20.5 + em * 30.75 + x.ot * 30.75) * 100) / 100;
const zl = await A.ev(() => { const S = window.__GC_PAY.S; const L = (S.lines || []).find(l => l.name === 'Zedd Demo'); return L && { gross: L.gross, em: L.emHours, ot: L.otHours, hrs: L.hours, rate: L.rate, parts: L.grossParts.map(g => g.label) }; });
ok(zl && Math.abs(zl.gross - want) < 0.02 && Math.abs(zl.em - em) < 0.001 && zl.rate === 20.5 && zl.parts.join() === 'Regular hours,Emergency call-out 1.5×,Overtime', 'Zedd: 38 regular + ' + em + ' 🚨 at the raised $20.50 → ' + x.straight.toFixed(2) + ' × $20.50 + ' + em + ' × $30.75 🚨 + ' + x.ot.toFixed(2) + ' × $30.75 OT = $' + want, zl);
ok(/🚨/.test(zr) && /Emergency call-out 1\.5×: [\d.]+ h · \$[\d,.]+ \(in gross\)/.test(run.tot) && /Bonus — PM year-end: \$2,500\.00/.test(run.tot), 'run table: the 🚨 hours on the line; totals row "🚨 Emergency call-out 1.5×" and "🏆 Bonus — PM year-end"', run);
const pat = await A.ev(() => { const L = (window.__GC_PAY.S.lines || []).find(l => l.name === 'Pat Demo'); return L && { parts: L.grossParts.map(g => g.label + ' ' + g.amount), fed: L.fed, pm: L.pmBonus }; });
ok(pat && pat.parts.join() === 'Salary 1000,Bonus — PM year-end 2500' && pat.pm === 2500, 'Pat: Salary + "Bonus — PM year-end" $2,500 on this check', pat);
await A.ev(() => { const b = [...document.querySelectorAll('#_pOut [data-math]')].find(x => /Zedd Demo/.test(x.closest('tr').innerText)); b.click(); }); await sleep(600);
const math = await A.ev(() => document.querySelector('#_pOut').innerText);
ok(/Emergency call-out 1\.5×/.test(math) && /never stacked/.test(math), 'Show math explains the 🚨 line (never stacked)');
await A.page().screenshot({ path: SHOTS + 'payem_6_run.png', fullPage: false });
await A.ev(() => document.querySelector('#_pSubmit').click()); await sleep(3500);
const saved = await A.ev(async () => { const r = (await window.__GC_PAY.runs()).find(x => x.from && x.lines && x.lines.some(L => L.name === 'Zedd Demo')); return r && { id: r.id, st: r.status, em: r.lines.find(L => L.name === 'Zedd Demo').emHours, pm: r.lines.find(L => L.name === 'Pat Demo').pmBonusKey }; });
ok(saved && saved.st === 'pending' && saved.em > 0 && /^pmbonus:\d{4}:sbiffle@grayco-cs\.com$/.test(saved.pm), 'submitted for approval with the 🚨 hours and the bonus key', saved);

/* ── Approvals: the line, ✏️ emergency hours, the stub ── */
await A.ev(() => window._gcOpenPayrollTab('approvals')); await sleep(2200);
await A.ev(id => { const b = document.querySelector('[data-open="' + id + '"]'); if (b) b.click(); }, saved.id); await sleep(1500);
const ap = await A.ev(() => [...document.querySelectorAll('[data-payem-line]')].map(e => e.innerText));
ok(ap.some(t => /🚨 Emergency call-out 1\.5× [\d.]+ h/.test(t)) && ap.some(t => /🏆 Bonus — PM year-end \$2,500\.00/.test(t)), 'Approvals: each line says 🚨 Emergency call-out 1.5× / 🏆 Bonus — PM year-end', ap);
await A.page().screenshot({ path: SHOTS + 'payem_7_approvals.png' });
const zi = await A.ev(id => { const b = [...document.querySelectorAll('[data-ledit="' + id + '"]')].find(x => /Zedd Demo/.test(x.closest('tr').innerText)); return b ? b.getAttribute('data-idx') : null; }, saved.id);
await A.ev(([id, i]) => document.querySelector('[data-ledit="' + id + '"][data-idx="' + i + '"]').click(), [saved.id, zi]); await sleep(1500);
const ed = await A.ev(() => { const o = document.getElementById('gc-draftedit-ov'); if (!o) return null; const h = o.querySelector('[data-de="hrs"]'), e = o.querySelector('[data-de="em"]'); h.value = '43'; e.value = '5'; e.dispatchEvent(new Event('input', { bubbles: true })); return o.querySelector('[data-de="calc"]').innerText; });
ok(ed && /🚨 Emergency call-out 5\.00 h × \$20\.50 × 1\.5/.test(ed) && /Overtime 3\.00 h/.test(ed) && /Regular 35\.00 h/.test(ed) && /Not stacked/.test(ed), '✏️ Edit: 43 h with 5 🚨 → 35 regular + 5 🚨 + 3 OT (not stacked)', ed);
await A.page().screenshot({ path: SHOTS + 'payem_8_edit.png' });
await A.ev(() => document.querySelector('#gc-draftedit-ov [data-de="save"]').click()); await sleep(2500);
const ln = await A.ev(async id => { const r = (await window.__GC_PAY.runs()).find(x => x.id === id), L = r.lines.find(l => l.name === 'Zedd Demo'); return { g: L.gross, em: L.emHours, ot: L.otHours, h: L.hours, parts: L.grossParts.map(g => g.label + ' ' + g.amount), note: (L.edits || []).slice(-1)[0] }; }, saved.id);
ok(ln.g === 35 * 20.5 + 5 * 30.75 + 3 * 30.75 && ln.em === 5 && ln.h === 35 && ln.ot === 8 && /🚨 emergency/.test(ln.note && ln.note.note), 'saved: $963.50 = 35 × $20.50 + 5 × $30.75 🚨 + 3 × $30.75 OT; the edit note names the 🚨 change', ln);
await A.ev(() => { window.__stubHtml = ''; window._gcOpenDocHTML = h => { window.__stubHtml = h; }; });
await A.ev(id => { const b = [...document.querySelectorAll('[data-stub="' + id + '"]')].find(x => /Zedd Demo/.test(x.closest('tr').innerText)); if (b) b.click(); }, saved.id);
const stub = await H.waitFor(A, () => window.__stubHtml || null, null, 15000, 300);
ok(!!stub && /Emergency call-out 1\.5×/.test(stub) && /5\.00 h × \$30\.75/.test(stub) && /35\.00 \+ 3\.00 OT \+ 5\.00 🚨/.test(stub), 'pay stub: "Emergency call-out 1.5×  5.00 h × $30.75" and the hours 35 + 3 OT + 5 🚨', (stub || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
if (stub) { const p2 = await A.ctx.newPage(); await p2.setViewportSize({ width: 900, height: 1000 }); await p2.setContent(stub); await p2.screenshot({ path: SHOTS + 'payem_9_stub.png', fullPage: true }); await p2.close(); }
/* 📈 pay rate history on the employee */
await A.ev(() => window._gcOpenPayrollTab('employees')); await sleep(1500);
await A.ev(() => { const a = document.querySelector('[data-emp="u9"]') || [...document.querySelectorAll('[data-emp]')].find(x => /Zedd/.test(x.textContent)); if (a) a.click(); }); await sleep(1200);
const hist = await A.ev(() => (document.querySelector('[data-payem-hist]') || {}).innerText || '');
ok(/Pay rate history/.test(hist) && /\$20\.00\/hr → \$20\.50\/hr/.test(hist) && /Certification raise — IICRC WRT/.test(hist) && /Wesley Johnson/.test(hist), 'Payroll → Employees → Zedd: 📈 Pay rate history', hist);
await A.ev(() => { const e = document.querySelector('[data-payem-hist]'); if (e) e.scrollIntoView({ block: 'center' }); }); await sleep(300);
await A.page().screenshot({ path: SHOTS + 'payem_10_history.png' });
const errs = (A.errs || []).concat(C.errs || []).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
console.log('PAYEM ' + pass + '/' + (pass + fail));
await A.b.close().catch(() => {});
process.exit(fail ? 1 : 0);
