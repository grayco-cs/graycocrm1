// test_SAMEJOB2.mjs <build-dir> — owner 11/12: "❓ Same job?" asked again for "63800 - Desoto County Schools Press Box Improvements Phase 2"
// ⟷ "63789 - … Phase 1" ("I cleared these once before"). Different project numbers / phases are never asked; "✗ Different jobs" is kept
// for good (gc_kv gc_samejob_no), also after the leads come back with new ids. Made-up data only.
import { computer, signIn, sleep, cset, cget, resetCloud, waitFor } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
resetCloud(); const at = new Date().toISOString(), due = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
const L = (id, o) => Object.assign({ id, stage: 'New Lead', leadKind: 'Commercial', bidDue: due, createdAt: at, updatedAt: at, inboxState: 'new' }, o);
const DORM = [L('LEADIN-d1', { name: 'Coahoma CC - New Dormitory', city: 'Clarksdale', gc: 'Alpha Builders', inboxId: 'LI-d1' }), L('LEADIN-d2', { name: 'New Female Dormitory - Coahoma Community College', city: 'Clarksdale', gc: 'Beta Builders', inboxId: 'LI-d2' })];
cset('leads', [
  L('LEADIN-p2', { name: '63800 - Desoto County Schools Press Box Improvements Phase 2', city: 'Olive Branch', gc: 'Murphy & Sons', inboxId: 'LI-p2' }),
  L('LEADIN-p1', { name: '63789 - Desoto County Schools Press Box Improvements Phase 1', city: 'Olive Branch', gc: 'Murphy & Sons', inboxId: 'LI-p1' }),
  L('LEADIN-q1', { name: 'Zedd Middle School Gym Floor Phase 1', city: 'Zeddville', gc: 'Zedd Builders', inboxId: 'LI-q1' }),
  L('LEADIN-q2', { name: 'Zedd Middle School Gym Floor - Phase II', city: 'Zeddville', gc: 'Zedd Builders', inboxId: 'LI-q2' }),
  L('LEADIN-o1', { name: 'Demo Library Renovation', city: 'Demo City', gc: 'Old Builders', inboxId: 'LI-o1', notSameAs: ['LEADIN-o2'] }),
  L('LEADIN-o2', { name: 'Demo Public Library Renovation Annex', city: 'Demo City', gc: 'Other Builders', inboxId: 'LI-o2' })].concat(DORM));
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => window._setView('leads')); await sleep(3000);
const pairs = () => A.ev(() => window._gcSameJob.pairs().map(p => [p.a.id, p.b.id].sort().join('~')).sort());
let P = await pairs();
ok('63800 Phase 2 ⟷ 63789 Phase 1 (different numbers) is never asked', !P.some(x => /LEADIN-p1/.test(x)), P);
ok('Gym Floor Phase 1 ⟷ Phase II (different phase) is never asked', !P.some(x => /LEADIN-q/.test(x)), P);
ok('a genuine look-alike (the same dormitory from two GCs, no numbers) is still asked', P.includes('LEADIN-d1~LEADIN-d2'), P);
ok('BIDMERGE never joins different numbers / phases by itself', await A.ev(() => { const C = window._gcBidMergeCore; const a = { id: 'x1', name: '63800 - Press Box Phase 2', city: 'Olive Branch' }, b = { id: 'x2', name: '63789 - Press Box Phase 1', city: 'Olive Branch' }; return !!C.same(a, b).no; }));
/* the old answer on the leads (notSameAs) goes into the shared list on load */
const kv0 = await (async () => { for (let i = 0; i < 20; i++) { const v = cget('gc_samejob_no'); if (v && (v.pairs || []).some(p => [p.a, p.b].sort().join() === 'LEADIN-o1,LEADIN-o2')) return v; await sleep(500); } return cget('gc_samejob_no'); })();
ok('an old "Different jobs" (lead.notSameAs) is copied into gc_kv gc_samejob_no', kv0 && kv0.pairs.some(p => [p.a, p.b].sort().join() === 'LEADIN-o1,LEADIN-o2' && p.ka && p.kb), kv0);
/* ✗ Different jobs on the dormitory pair */
await A.ev(() => window._setView('leads')); await sleep(1500);
const bar = await waitFor(A, () => { const e = document.getElementById('gc-sj'); return e && /Dormitory/.test(e.innerText) ? e.innerText : null; }, null, 10000);
ok('the "❓ Same job?" bar shows the dormitory pair', !!bar, bar);
await A.ev(() => { const P = document.getElementById('gc-sj')._p || []; const i = P.findIndex(p => /Dormitory/.test(p.a.name)); document.querySelector('#gc-sj [data-sj-diff="' + i + '"]').click(); });
const kv = await (async () => { for (let i = 0; i < 20; i++) { const v = cget('gc_samejob_no'); if (v && (v.pairs || []).some(p => [p.a, p.b].sort().join() === 'LEADIN-d1,LEADIN-d2')) return v; await sleep(500); } return null; })();
ok('✗ Different jobs → stored in gc_kv gc_samejob_no with both ids and a stable identity for each side', !!kv && kv.pairs.some(p => [p.a, p.b].sort().join() === 'LEADIN-d1,LEADIN-d2' && /^n:/.test(p.ka) && /^n:/.test(p.kb)), kv && kv.pairs);
/* the leads come back with NEW ids and without notSameAs (a re-import) */
await A.ev(D => window._setLeads(p => p.filter(l => !/^LEADIN-d/.test(l.id)).concat(D.map(l => Object.assign({}, l, { id: l.id + '-new', inboxId: l.inboxId + 'n', notSameAs: undefined, updatedAt: new Date().toISOString() })))), DORM);
await sleep(3500); P = await pairs();
ok('re-imported with new ids → still not asked', !P.some(x => /LEADIN-d/.test(x)), P);
/* another computer (empty storage) */
const B = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
await signIn(B, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await B.ev(D => window._setLeads(p => p.filter(l => !/^LEADIN-d/.test(l.id)).concat(D.map(l => Object.assign({}, l, { id: l.id + '-b', notSameAs: undefined, updatedAt: new Date().toISOString() })))), DORM);
await B.ev(() => window._setView('leads')); await sleep(3000);
const PB = await B.ev(() => window._gcSameJob.pairs().map(p => [p.a.id, p.b.id].sort().join('~')));
ok('another computer with new ids → not asked (the shared list)', !PB.some(x => /LEADIN-d/.test(x)), PB);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('SAMEJOB2 ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
