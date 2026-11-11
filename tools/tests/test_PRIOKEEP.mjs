// test_PRIOKEEP.mjs <build-dir> — PRIOKEEP + LSAVETTAB (owner 11/11). Offline harness, made-up data.
// 1) a lead whose 1–10 priority was overwritten with "Medium" gets the number back from its history (admin computer);
// 2) the 📞 LSA calls card is not at the top of Leads: a button with a red count sits next to Outreach and opens it.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
resetCloud();
const now = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('leads', [
  { id: 'LP1', name: 'Demo Ramble', company: 'Demo Ramble', status: 'new', stage: 'Estimate Sent', priority: 'Medium', prioritySetAt: '2026-11-09T15:14:39.041Z', updatedAt: '2026-11-10T00:00:00.000Z',
    activity: [{ type: 'priority', text: 'Priority 6', at: '2026-11-04T16:00:00Z', by: 'Wesley Johnson' }, { type: 'priority', text: 'Priority 6 → 9', at: '2026-11-09T15:19:00Z', by: 'Wesley Johnson' }] },
  { id: 'LP2', name: 'Demo Plain', company: 'Demo Plain', status: 'new', priority: 'Medium', updatedAt: '2026-11-10T00:00:00.000Z' },
  { id: 'LP3', name: 'Demo Seven', company: 'Demo Seven', status: 'new', priority: 7, updatedAt: '2026-11-10T00:00:00.000Z', activity: [{ type: 'priority', text: 'Priority 3', at: '2026-11-01T00:00:00Z' }] },
  { id: 'LV1', name: 'Google LSA caller (2:31 PM)', company: 'Google LSA caller', status: 'new', stage: 'New', lsaCall: true, source: 'Google LSA', message: 'A potential customer called the office through Google Local Services.', createdAt: now, updatedAt: now },
  { id: 'LV2', name: 'Google LSA caller (11:27 AM)', company: 'Google LSA caller', status: 'new', stage: 'New', lsaCall: true, source: 'Google LSA', message: 'Another call.', createdAt: now, updatedAt: now }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => window._setView('leads')); await sleep(6000);
const pr = await A.ev(() => Object.fromEntries((window._crm.leads || []).filter(l => /^LP/.test(l.id)).map(l => [l.id, l.priority])));
ok('PRIOKEEP: "Medium" over a real priority → back to the last number in its history (9); a lead never given a number stays; a set 7 is untouched', pr.LP1 === 9 && pr.LP2 === 'Medium' && pr.LP3 === 7, pr);
const st = await A.ev(() => { const hub = document.getElementById('gc-leads-hub'); const b = document.getElementById('gc-lsa-btn'); const v = hub && hub.querySelector('.gclu-views');
  return { hub: !!hub, btn: b ? b.innerText.replace(/\s+/g, ' ').trim() : null, inViews: !!(b && v && b.parentElement === v), afterOutreach: !!(b && b.previousElementSibling && /Outreach/.test(b.previousElementSibling.innerText)), card: !!document.getElementById('gc-lsa-vet') }; });
ok('LSAVETTAB: 📞 LSA calls (2) button next to Outreach; no card at the top until clicked', st.hub && /LSA calls\s*2/.test(st.btn || '') && st.inViews && st.afterOutreach && !st.card, st);
await A.ev(() => document.getElementById('gc-lsa-btn').click()); await sleep(2000);
const op = await A.ev(() => { const c = document.getElementById('gc-lsa-vet'), top = document.querySelector('#gc-leads-hub .gclu-top'); return { card: !!c, under: !!(c && top && c.previousElementSibling === top), n: c ? c.querySelectorAll('[data-vet]').length : 0 }; });
ok('click → the card opens under the toolbar with both calls', op.card && op.under && op.n === 2, op);
await sleep(3500);
ok('it stays open on the next repaint', await A.ev(() => !!document.getElementById('gc-lsa-vet')));
await A.ev(() => document.querySelector('#gc-lsa-vet [data-vet-x]').click()); await sleep(2000);
ok('✕ closes it; the button stays', await A.ev(() => !document.getElementById('gc-lsa-vet') && !!document.getElementById('gc-lsa-btn')));
ok('no page errors', !errs.length, errs);
const p = R.filter(Boolean).length; console.log('PRIOKEEP ' + p + '/' + R.length); await A.close?.(); process.exit(p === R.length ? 0 : 1);
