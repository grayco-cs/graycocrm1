// test_OFFICEAPPR.mjs <build-dir> [mirror.json] — patch OFFICEAPPR (owner 11/04: "brittany has some approvals that i already
// approved and they shouldnt show if i approve and she cant open it either from approvals"). Two computers on the read-only
// mirror (never committed): the owner (admin) and the office (office@grayco-cs.com), seeded with a waiting Form 941, a PM pay
// flag and a pending expense:
//   1. the office's ✅ list has the 941, the PM pay flag and the expense, and no payroll run (admin-only);
//   2. the office can OPEN every item she is shown: Desk → Approvals → "Review" opens the Form 941 card / the PM pay check;
//   3. the owner decides (941 approved, PM pay ✓ Checked, expense approved) while the office is off line and opens the
//      waiting 941 there (the old re-stamp); back on line, after sync: the cloud keeps "approved", the office's list drops the
//      PM pay flag and the expense, and the 941 is only her "📮 File … mark it filed" line (which opens); the owner's list has no 941;
//   4. the merge: an approved gc_payroll_approvals record is never replaced by a newer-stamped "waiting" copy.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs). Run under the scratchpad's browser_lock.sh.
import path from 'path'; import fs from 'fs'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud, RT } = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

resetCloud(); for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const V = k => { const v = (cloud.get(k) || {}).value; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) {} } return v; };
const put = (k, v) => cloud.set(k, { key: k, value: v, updated_at: new Date().toISOString() });
const ent = new Date(Date.now() - 864e5).toISOString(), today = new Date().toISOString().slice(0, 10);
const SID = 'Ub5608wjnv2t';
const L = (sal, st) => ({ empId: SID, name: 'Steven Biffle', period: 'weekly', gross: sal, net: sal, commission: 0, grossParts: [{ label: 'Salary', amount: sal }], status: st || 'paid' });
put('payrollProfiles', [{ id: 'PPT1', name: 'Steven Biffle', userId: SID, payType: 'salary_commission', annualSalary: 52000, period: 'weekly', active: true }]);
put('payrollRuns', [{ id: 'OA_R1', payDate: '2026-10-23', from: '2026-10-17', to: '2026-10-23', status: 'paid', lines: [L(1000)] },
  { id: 'OA_RUN2', payDate: '2026-11-06', from: '2026-10-31', to: '2026-11-06', status: 'pending', createdAt: ent, totals: { net: 900 }, lines: [L(1000, 'pending')] }]);
put('gc_commission_paid', { OA_J2: { pm: 'Steven Biffle', amount: 700, payDate: '2026-10-23', job: 'OATest Ash St' } });   // commission owed, not paid → a PM pay flag
put('gc_payroll_approvals', [{ id: 'f941_2026_Q3', kind: 'f941', year: 2026, q: 3, status: 'waiting', due: '2026-11-02', createdAt: ent, createdBy: 'CRM', updatedAt: ent, at: ent, numbers: { L2: 1000, L3: 100, L12: 250, L13: 250, L14: 0, warnings: [] } }]);
const job = (V('projects') || []).filter(p => p && p.id && /active/i.test(String(p.status || '')) && !/^QB_/.test(p.id))[0];
put('expenses', (V('expenses') || []).map(e => e && typeof e === 'object' ? Object.assign({}, e, { approved: true }) : e).concat([{ id: 'EXPOA1', type: 'expense', vendor: 'OATest Lumber', desc: 'OATest boards', amt: 77.5, pid: job.id, category: 'Materials', status: 'pending', date: today, by: 'Wesley Johnson', updatedAt: ent }]));
put('gc_expense_approvals', [{ id: 'expId:EXPOA1', expId: 'EXPOA1', jobId: job.id, pm: job.pm || 'Wesley Johnson', amount: 77.5, payee: 'OATest Lumber', desc: 'OATest boards', matched: true, status: 'pending_pm', enteredAt: ent }]);
put('gc_sub_approvals', []); put('gc_email_queue', []); put('gc_approval_queue', []);

async function signin(name, email){
  const c = await computer(name, { build }); const p = c.page(); await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
  return c;
}
const [A, O] = await Promise.all([signin('ADM', 'wjohnson@grayco-cs.com'), signin('OFF', 'office@grayco-cs.com')]);
await sleep(25000);
/* the live ✅ set, as the badge / Desk / sheet read it (no forced PM pay re-check: what the screen has) */
const SET = c => c.page().evaluate(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); const s = window._gcApprovalSet(), g = s.groups;
  return Object.keys(g).flatMap(k => g[k].map(x => ({ g: k, id: String(x.id), t: String(x.title || '') }))).filter(x => !/hot1:asg|job messages|invoices to review/.test(x.id)); });
const has = (l, re) => l.some(x => re.test(x.id));
await O.page().evaluate(() => window._gcPmPayRefresh && window._gcPmPayRefresh()); await sleep(1500);
const o1 = await SET(O); console.log('   office set', JSON.stringify(o1));
ok(has(o1, /^f941:/) && has(o1, /^pmpay:/) && has(o1, /^exp:EXPOA1/), 'office lists the Form 941, the PM pay flag and the expense', o1);
ok(!o1.some(x => /payroll/i.test(x.t) || /^pay:/.test(x.id)), 'office: no payroll run (admin-only) in her list', o1);

/* 2. Desk → Approvals → Review opens each item */
const desk = await O.page().evaluate(() => { try { return window._gcRA && window._gcRA.open(); } catch (e) { return 'ERR ' + e.message; } });
await sleep(1500);
async function review(c, re, ovId){
  const r = await c.page().evaluate(([src, ov]) => {
    const re = new RegExp(src); const desk = document.getElementById('gc-ra-desk'); if (!desk || desk.style.display === 'none') return { desk: false };
    const b = [...desk.querySelectorAll('[data-ra-a="approne"]')].find(x => re.test(x.getAttribute('data-id'))); if (!b) return { desk: true, btn: false, ids: [...desk.querySelectorAll('[data-ra-a="approne"]')].map(x => x.getAttribute('data-id')) };
    b.scrollIntoView({ block: 'center' }); const bb = b.getBoundingClientRect(); return { desk: true, btn: true, x: bb.left + bb.width / 2, y: bb.top + bb.height / 2 };
  }, [re.source, ovId]);
  if (!r.btn) return r;
  await c.page().mouse.click(r.x, r.y);
  await waitFor(c, ov => { const e = document.getElementById(ov); return e && /Form 941 —|PM pay check/.test(e.innerText) ? true : null; }, ovId, 10000, 250);
  const seen = await waitFor(c, ov => { const e = document.getElementById(ov); if (!e) return null; const bb = e.getBoundingClientRect(), at = document.elementFromPoint(bb.left + bb.width / 2, Math.min(bb.top + 40, innerHeight - 5)); return { top: !!at && e.contains(at), txt: e.innerText.slice(0, 160) }; }, ovId, 8000, 250);
  await c.page().evaluate(ov => { const e = document.getElementById(ov); if (e) e.remove(); }, ovId);
  return Object.assign(r, { opened: seen });
}
const rv1 = await review(O, /^f941:/, '_gcF941Card'); console.log('   desk review 941', JSON.stringify(rv1), 'open()', desk);
ok(rv1.opened && rv1.opened.top && /Form 941/.test(rv1.opened.txt), 'office Desk → Review opens the Form 941 card (on top)', rv1);
const rv2 = await review(O, /^pmpay:/, '_gcPmPayOv'); console.log('   desk review PM pay', JSON.stringify(rv2));
ok(rv2.opened && rv2.opened.top && /PM pay check/.test(rv2.opened.txt), 'office Desk → Review opens the PM pay check (on top)', rv2);
const fo = await O.page().evaluate(async () => { const it = (window._gcField && window._gcField.approvals() || []).filter(x => /^(f941|pmpay):/.test(x.id)); return it.map(x => ({ id: x.id, f: !!(x.act && (typeof x.act === 'function' || typeof x.act.f === 'function')) })); });
ok(fo.length >= 2 && fo.every(x => x.f), 'every Form 941 / PM pay item the office is shown carries an action that opens it', fo);

/* 3. the owner decides while the office is off line and opens the waiting 941 there */
O.down = true; const oSock = [...(O.sockets || [])]; oSock.forEach(s => RT.sockets.delete(s));
await A.page().evaluate(() => { window.prompt = () => 'owner checked'; window.confirm = () => true; });
await A.page().evaluate(() => window._gcF941OpenCard('f941_2026_Q3')); await A.page().waitForSelector('#_gcF941Card [data-ok]', { timeout: 15000 });
await A.page().locator('#_gcF941Card [data-ok]').click(); await sleep(1500);
await A.page().evaluate(() => { const e = document.getElementById('_gcF941Card'); if (e) e.remove(); });
await A.page().evaluate(() => window._gcPmPayRefresh()); await A.page().evaluate(() => window._gcPmPayOpen()); await sleep(2500);
const flags = await A.page().evaluate(() => [...document.querySelectorAll('#_gcPmPayOv [data-pmp-ok]')].map(b => b.getAttribute('data-pmp-ok')));
for (const f of flags) { await A.page().locator(`#_gcPmPayOv [data-pmp-ok="${f}"]`).click(); await sleep(1800); }
await A.page().evaluate(() => { const e = document.getElementById('_gcPmPayOv'); if (e) e.remove(); });
const exOk = await A.page().evaluate(() => !!(window._gcApproveInPlace && window._gcApproveInPlace('exp:EXPOA1')));
await sleep(8000);
await O.page().evaluate(() => window._gcF941OpenCard('f941_2026_Q3')); await sleep(2500);   /* the office, still off line, opens the waiting copy */
await O.page().evaluate(() => { const e = document.getElementById('_gcF941Card'); if (e) e.remove(); });
const cl1 = (V('gc_payroll_approvals') || []).find(x => x.id === 'f941_2026_Q3');
ok(flags.length >= 1 && exOk && cl1 && cl1.status === 'approved', 'the owner: 941 approved, PM pay checked, expense approved (in the cloud)', { flags, exOk, st: cl1 && cl1.status });
O.down = false; oSock.forEach(s => RT.sockets.add(s));
/* back on line: the office's list drops what the owner decided (badge-level read, no forced re-check) */
let o2 = null; const t0 = Date.now();
for (let i = 0; i < 45; i++) { await sleep(2000); o2 = await SET(O); if (!has(o2, /^pmpay:/) && !has(o2, /^exp:EXPOA1/) && o2.filter(x => /^f941:/.test(x.id)).every(x => /^📮 File/.test(x.t))) break; }
console.log('   office after (' + Math.round((Date.now() - t0) / 1000) + ' s)', JSON.stringify(o2));
ok(!has(o2, /^pmpay:/), 'office: the PM pay flag the owner checked is gone', o2);
ok(!has(o2, /^exp:EXPOA1/), 'office: the expense the owner approved is gone', o2);
const f2 = o2.filter(x => /^f941:/.test(x.id));
ok(f2.length === 1 && /^📮 File Form 941 for Q3 2026: approved, ready to file/.test(f2[0].t), 'office: the 941 is no longer "review / approve" — only her "📮 File … mark it filed" line', f2);
await sleep(6000);
const cl2 = (V('gc_payroll_approvals') || []).find(x => x.id === 'f941_2026_Q3');
const ol = await O.page().evaluate(() => (JSON.parse(localStorage.getItem('gc_payroll_approvals') || '[]').find(x => x.id === 'f941_2026_Q3') || {}).status);
ok(cl2 && cl2.status === 'approved' && ol === 'approved', 'the office opening her old "waiting" copy did not undo the approval (cloud and office: approved)', { cloud: cl2 && cl2.status, office: ol });
const a2 = await SET(A);
ok(!has(a2, /^f941:/) && !has(a2, /^pmpay:/) && !has(a2, /^exp:EXPOA1/), 'the owner\'s own list has none of the three', a2.filter(x => /^(f941|pmpay|exp)/.test(x.id)));
await O.page().evaluate(() => window._gcRA && window._gcRA.open()); await sleep(1500);
const rv3 = await review(O, /^f941:/, '_gcF941Card');
ok(rv3.opened && rv3.opened.top && /Form 941/.test(rv3.opened.txt), 'office: the "📮 File" line opens the Form 941 card', rv3);

/* 4. the merge itself */
const mg = await A.page().evaluate(() => { const ap = { id: 'X941', kind: 'f941', status: 'approved', updatedAt: '2026-11-04T10:00:00.000Z' }, wt = { id: 'X941', kind: 'f941', status: 'waiting', updatedAt: '2026-11-04T11:00:00.000Z' }, fl = Object.assign({}, ap, { status: 'filed', updatedAt: '2026-11-04T12:00:00.000Z' });
  const m = window._gcMergeValue; return [m('gc_payroll_approvals', [ap], [wt])[0].status, m('gc_payroll_approvals', [wt], [ap])[0].status, m('gc_payroll_approvals', [ap], [fl])[0].status, m('gc_payroll_approvals', [fl], [ap])[0].status]; });
ok(mg.join() === 'approved,approved,filed,filed', 'merge: approved beats a newer "waiting", filed beats approved, either side', mg);
const errs = A.errs.concat(O.errs).filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
await A.b.close(); await O.b.close(); process.exit(fail ? 1 : 0);
