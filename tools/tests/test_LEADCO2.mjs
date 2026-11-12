// test_LEADCO2.mjs <build-dir> — owner 11/12 (Mitigation picked): "these shouldn't be showing on mitigation, should be empty" (Leads: the
// "Same job?" bid-lead pairs and the 📥 inbox count) and "shouldn't have messages" (Messages listed Construction jobs). Made-up data only.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); const at = new Date().toISOString(), due = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const L = (id, o) => Object.assign({ id, client: id, stage: 'New Lead', createdAt: at, updatedAt: at }, o);
cset('leads', [
  L('Conzz Bid A', { name: 'Maintenance Shop Construction at Zedville Terrace - New', type: 'Bid', bidDue: due, gc: 'Alpha Builders', address: 'Zedville, TN', inboxId: 'ib1', inboxState: 'new' }),
  L('Conzz Bid B', { name: 'Maintenance Shop Construction at Zedville Terrace', type: 'Bid', bidDue: due, gc: 'Beta Builders', address: '1 Test Cove, Zedville, TN', inboxId: 'ib2', inboxState: 'new' }),
  L('Mitzz Water', { scope: 'Water in the basement, pipe burst', inboxId: 'ib3', inboxState: 'new' })]);
cset('projects', [{ id: 'pc1', name: 'Conzz Office Remodel', client: 'Test Client', companyId: 'construction', status: 'Active', createdAt: at },
  { id: 'pm1', name: 'Mitzz Dry Out', client: 'Test Owner', companyId: 'mitigation', status: 'Active', createdAt: at }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
const cnt = () => A.ev(() => window._gcLeadInbox ? window._gcLeadInbox.count() : -1);
await A.ev(() => window._gcCo.setFilter('all')); await A.ev(() => window._setView('leads')); await sleep(3000);
ok('All companies: the inbox counts the Construction leads (Leads page shows Construction)', await cnt() === 2, await cnt());
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(2500);
ok('Mitigation: the inbox counts only the Mitigation lead', await cnt() === 1, await cnt());
const sj = await A.ev(() => { const e = document.getElementById('gc-sj'); return e ? e.innerText : ''; });
ok('Mitigation: no Construction "Same job?" bid pairs', !/Zedville/.test(sj), sj);
await A.ev(() => window._gcCo.setFilter('construction')); await sleep(2500);
ok('Construction: the inbox counts the Construction leads again', await cnt() === 2, await cnt());
const msgs = async () => { await A.ev(() => window._setView('messages')); await sleep(2500); return A.ev(() => { const e = document.getElementById('gc-rp-msg'); return e ? e.innerText : ''; }); };
await A.ev(() => window._gcCo.setFilter('mitigation')); await sleep(800); let m = await msgs();
ok('Messages under Mitigation: Mitigation jobs only', /Mitzz Dry Out/.test(m) && !/Conzz Office/.test(m), m.slice(0, 300));
await A.ev(() => window._gcCo.setFilter('all')); await sleep(800); m = await msgs();
ok('Messages under All companies: every job', /Mitzz Dry Out/.test(m) && /Conzz Office/.test(m), m.slice(0, 300));
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('LEADCO2 ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
