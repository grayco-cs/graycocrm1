// test_PMPAYCHECK.mjs <build-dir> [mirror.json] — patch PMPAYCHECK in the browser, on the read-only mirror (never committed),
// as Wesley, with seeded payroll (Steven: a Q3 overpay = known; a Q4 commission due and not paid = alert) and one commission
// profile with no pay setup:
//   1. the Payroll page shows the 🔎 PM pay check card with both Q4 alerts and the collapsed "Known — Q3 2026" summary;
//   2. ✅ My Approvals lists them as "other approvals" and the header count includes them;
//   3. "✓ Checked — this is right" + a note clears one (record on gc_payroll_approvals: who + amounts), the count drops.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs). Run under the scratchpad's browser_lock.sh.
import path from 'path'; import fs from 'fs'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud } = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const email = 'wjohnson@grayco-cs.com';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

resetCloud(); for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const put = (k, v) => cloud.set(k, { key: k, value: v, updated_at: new Date().toISOString() });
const SID = 'Ub5608wjnv2t';
const PROFS = [{ id: 'PPT1', name: 'Steven Biffle', userId: SID, payType: 'salary_commission', annualSalary: 52000, period: 'weekly', active: true },
  { id: 'PPT2', name: 'PMPTest NoSetup', payType: 'commission', period: 'weekly', active: true }];
const L = (empId, name, sal, comm) => ({ empId, name, period: 'weekly', gross: sal + comm, commission: comm, grossParts: [{ label: 'Salary', amount: sal }].concat(comm ? [{ label: 'Commission', amount: comm }] : []), status: 'paid' });
const RUNS = [{ id: 'PMPT_R1', payDate: '2026-09-25', from: '2026-09-19', to: '2026-09-25', status: 'paid', lines: [L(SID, 'Steven Biffle', 1000, 900)] },
  { id: 'PMPT_R2', payDate: '2026-10-23', from: '2026-10-17', to: '2026-10-23', status: 'paid', lines: [L(SID, 'Steven Biffle', 1000, 0), L('PMPTest NoSetup', 'PMPTest NoSetup', 0, 120)] }];
const LEDGER = { PMPT_J1: { pm: 'Steven Biffle', amount: 500, payDate: '2026-09-25', job: 'PMPTest Oak St' }, PMPT_J2: { pm: 'Steven Biffle', amount: 700, payDate: '2026-10-23', job: 'PMPTest Ash St' } };
put('payrollProfiles', PROFS); put('payrollRuns', RUNS); put('gc_commission_paid', LEDGER); put('gc_payroll_approvals', []);
put('gc_sub_approvals', []); put('gc_email_queue', []); put('gc_approval_queue', []);

const c = await computer('PMP', { build }); const p = c.page();
await p.setViewportSize({ width: 1280, height: 800 });
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
await sleep(10000);
/* the same seed on this computer (idb + localStorage), whatever the sync has brought down */
await p.evaluate(async ([pr, ru, le]) => { localStorage.setItem('gc_commission_paid', JSON.stringify(le)); localStorage.setItem('gc_payroll_approvals', '[]');
  await window.__GC_PAY.saveProfiles(pr); await window.__GC_PAY.saveRuns(ru); }, [PROFS, RUNS, LEDGER]);
const R = await p.evaluate(async () => { const r = await window._gcPmPayRefresh(); return { alerts: r.alerts.map(f => f.id), known: r.known.count, over: r.known.over }; });
console.log('   check', JSON.stringify(R));
ok(R.alerts.includes('comm|' + SID + '|2026-10-23') && R.alerts.includes('nosetup|PMPTest NoSetup'), 'Q4 commission owed and "no pay setup" are alerts', R);
ok(!R.alerts.some(id => id.includes('2026-09-25')) && R.known === 1 && R.over === 400, 'Q3 overpay is known (no alert): 1 gap, $400 over', R);

/* Payroll page card */
await p.evaluate(() => window._gcOpenPayrollTab('run'));
const card = await waitFor(c, () => { const m = document.getElementById('_gcPmPayCardMount'); return m && /PM pay check/.test(m.textContent) ? true : null; }, null, 20000, 400);
const cv = await p.evaluate(() => { const m = document.getElementById('_gcPmPayCardMount'); const k = m.querySelector('details[data-pmp-known]');
  return { text: m.textContent.slice(0, 1500), flags: m.querySelectorAll('[data-pmp-flag]').length, known: !!k, knownOpen: k ? k.open : null, knownText: k ? k.querySelector('summary').textContent : '' }; });
console.log('   card', JSON.stringify(cv));
ok(card && cv.flags >= 2 && /Commission owed but not paid/.test(cv.text) && /No pay setup for PMPTest NoSetup/.test(cv.text), 'Payroll page card shows the alerts', cv);
ok(cv.known && cv.knownOpen === false && /Known — Q3 2026 \(owner aware\)/.test(cv.knownText), 'Known — Q3 2026 summary is there, collapsed', cv);

/* My Approvals */
const SET = () => p.evaluate(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); const s = window._gcApprovalSet(); const o = (window._gcHot1Approvals ? window._gcHot1Approvals() : []).filter(x => /^pmpay:/.test(x.id)); const g = (s.groups && s.groups.other) || []; return { total: s.total, tip: s.tip, pm: o.length, inSet: g.filter(x => /^pmpay:/.test(x.id)).length, others: g.length }; });
const s1 = await SET(); console.log('   set', JSON.stringify(s1));
await p.evaluate(() => window._gcOpenPmApprovals());
const sh = await waitFor(c, () => { const t = document.body.innerText; return /PM pay: Steven Biffle/.test(t) && /PM pay: PMPTest NoSetup/.test(t) ? true : null; }, null, 10000, 300);
let head = null; for (let i = 0; i < 20 && !head; i++) { head = await p.evaluate(() => { const h = document.querySelector('[data-gc-appr-total]'); return h ? { n: +h.getAttribute('data-gc-appr-total'), t: h.textContent } : null; }); if (!head) await new Promise(r => setTimeout(r, 250)); }   // the sheet redraws itself in place (APPROVALSFIX): wait for the header
const s1b = await SET(); console.log('   sheet head', JSON.stringify(head), JSON.stringify(s1b));
ok(sh && s1.pm >= 2, 'My Approvals lists the PM pay flags as other approvals', s1);
ok(head && s1b.inSet === s1b.pm && s1b.pm >= 2 && /other approval/.test(head.t), 'the header count includes them: the counted set holds every PM pay item as an other approval', { head, s1b });
await p.evaluate(() => { [...document.querySelectorAll('body > div')].forEach(o => { if (o.style.position === 'fixed' && /My Approvals/.test(o.textContent.slice(0, 300))) o.remove(); }); });

/* ✓ Checked — this is right */
await p.evaluate(() => { window.prompt = () => 'test: owner set this up by hand'; });
await p.evaluate(() => window._gcPmPayOpen('nosetup|PMPTest NoSetup'));
await waitFor(c, () => document.querySelector('#_gcPmPayOv [data-pmp-ok="nosetup|PMPTest NoSetup"]') ? true : null, null, 10000, 300);
await p.locator('#_gcPmPayOv [data-pmp-ok="nosetup|PMPTest NoSetup"]').click(); await sleep(2500);
const after = await p.evaluate(async () => { const r = await window._gcPmPayRefresh(); const rec = JSON.parse(localStorage.getItem('gc_payroll_approvals') || '[]').filter(x => x.kind === 'pmpay_check');
  return { alerts: r.alerts.map(f => f.id), rec: rec.map(x => ({ flagId: x.flagId, by: x.by, note: x.note, sig: x.sig })) }; });
const s2 = await SET(); console.log('   after', JSON.stringify(after), JSON.stringify(s2));
ok(!after.alerts.includes('nosetup|PMPTest NoSetup') && after.alerts.includes('comm|' + SID + '|2026-10-23'), '✓ Checked clears that flag only', after);
ok(after.rec.length === 1 && after.rec[0].by && /by hand/.test(after.rec[0].note) && after.rec[0].sig === '0.00|0.00', 'the check is stored with who, the note and the amounts', after.rec);
ok(s2.pm === s1.pm - 1 && s2.inSet === s1.inSet - 1, 'the PM pay items in the counted set drop by one', { s1, s2 });
ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
await c.b.close(); process.exit(fail ? 1 : 0);
