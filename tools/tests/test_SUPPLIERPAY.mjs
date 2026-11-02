import { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2], email = 'wjohnson@grayco-cs.com';
resetCloud(); seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
const errs = []; const c = await computer('SP', { build }); const p = c.page(); p.on('pageerror', e => errs.push(String(e)));
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20 && typeof window._gcSubPayCheck === 'function', null, 120000, 300); await sleep(3000);
const r = await p.evaluate(() => {
  const C = window._crm; const pid = C.projects[0].id;
  C.subs = (C.subs || []).concat([{ id: 'VSUP1', name: 'Farrel Calhoun Test', isSub: false, cat: 'Paint', w9: false, insExp: '' }, { id: 'VSUB1', name: 'Real Sub Test Co', w9: false, insExp: '' }]);
  C.invoices = (C.invoices || []).concat([{ id: 'INVSUP1', type: 'sub', sub: 'Farrel Calhoun Test', pid, amt: 129.94, status: 'pending' }, { id: 'INVSUB1', type: 'sub', sub: 'Real Sub Test Co', pid, amt: 500, status: 'pending' }]);
  const a = window._gcSubPayCheck('INVSUP1'), b = window._gcSubPayCheck('INVSUB1');
  return { sup: { ok: a.ok, supplier: a.supplier, problems: a.problems, warnings: a.warnings }, sub: { ok: b.ok, problems: b.problems } };
});
console.log(JSON.stringify(r));
ok(r.sup.ok && r.sup.supplier && r.sup.problems.length === 0 && r.sup.warnings.length === 0, 'a supplier (isSub:false) passes with no COI / W-9 / agreement rules');
ok(!r.sub.ok && r.sub.problems.some(x => /COI/.test(x)) && r.sub.problems.some(x => /W-9/.test(x)), 'a real sub with no COI / W-9 is still stopped');
ok(!errs.length, 'no page errors (' + errs.slice(0, 2).join(' | ') + ')');
console.log(`SUPPLIERPAY ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
