// node tools/tests/test_LINEAPPR_fn.mjs — patch LINEAPPR: the pure core of tools/lineappr_tail.js.
// splitLine (one check out of a pending run into its own run), denyLine / closeIfDone (approved if any went out alone,
// denied if all denied), shadowDrafts (auto draft for a payday already being paid), and that the 941 / PMPAY readers
// count a split check once. Made-up people and numbers.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const load = f => { const src = fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/^<script[^>]*>/, '').replace(/<\/script>\s*$/, ''); const window = {}; new Function('window', src)(window); return window; };
const LA = load('lineappr_tail.js')._gcLineAppr, F = load('f941_tail.js')._gcF941, PM = load('pmpaycheck_tail.js')._gcPmPayCheck;
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = typeof want === 'number' ? Math.abs(got - want) < 0.005 : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); } };
const line = (empId, name, gross, fed, net) => ({ empId, name, payType: 'hourly', gross, taxable: gross, fed, ss: +(gross * 0.062).toFixed(2), med: +(gross * 0.0145).toFixed(2), addlMed: 0, state: 0, net, status: 'pending', employerSS: +(gross * 0.062).toFixed(2), employerMed: +(gross * 0.0145).toFixed(2), futa: 0, suta: 0 });
const mk = () => ({ id: 'RUN1', status: 'pending', from: '2026-10-29', to: '2026-11-04', payDate: '2026-11-06', auto: false, totals: {},
  lines: [Object.assign(line('E1', 'Ann Test', 129.6, 0, 119.69), { status: 'denied' }), line('E2', 'Ben Test', 384.62, 20, 335.2), line('E3', 'Cal Test', 1346.15, 150, 1093.17)] });
const DRAFT = { id: 'AUTO1', status: 'draft', auto: true, from: '2026-10-29', to: '2026-11-04', payDate: '2026-11-06', lines: [line('E1', 'Ann Test', 7.6, 0, 7.02)] };

// splitLine: Cal approved alone
let list = [mk(), JSON.parse(JSON.stringify(DRAFT))];
const R = list[0], N = LA.splitLine(list, 'RUN1', 2, 'Tess', '2026-11-05T10:00:00Z');
eq('new run right after the original', list.map(r => r.id), ['RUN1', N.id, 'AUTO1']);
eq('new run: same week and payday, pending, one line', [N.from, N.to, N.payDate, N.status, N.auto, N.splitFrom, N.lines.map(L => L.name)], ['2026-10-29', '2026-11-04', '2026-11-06', 'pending', false, 'RUN1', ['Cal Test']]);
eq('history "approved alone by Tess"', /^approved alone by Tess/.test(N.history[0].note), true);
eq('line left the original run', R.lines.map(L => L.name), ['Ann Test', 'Ben Test']);
eq('original totals: Ben only (Ann denied)', R.totals.gross, 384.62);
eq('new run totals', [N.totals.gross, N.totals.net], [1346.15, 1093.17]);
eq('original remembers it', R.splitOff.map(x => [x.runId, x.name]), [[N.id, 'Cal Test']]);
eq('original stays pending', R.status, 'pending');
let thrown = ''; try { LA.splitLine(list, 'RUN1', 0, 'Tess'); } catch (e) { thrown = e.message; }
eq('a denied line cannot be approved alone', /denied/.test(thrown), true);
// approveRun does the booking; here: mark it approved as approveRun would
N.status = 'approved'; N.lines[0].status = 'approved'; N.lines[0].checkNo = '1003';

// deny Ben -> nothing left waiting -> closes approved (Cal went out alone)
eq('deny Ben: closes approved', LA.denyLine(R, 1, 'wrong hours', 'Tess'), 'approved');
eq('Ben has his reason', [R.lines[1].status, R.lines[1].denyReason, R.lines[1].deniedBy], ['denied', 'wrong hours', 'Tess']);
eq('closed run counts nothing', R.totals.gross, 0);
// all denied, nothing alone -> denied
const D = mk(); eq('deny Ben: Cal still waiting', LA.denyLine(D, 1, 'x', 'Tess'), '');
eq('deny Cal: every check denied -> denied', [LA.denyLine(D, 2, 'y', 'Tess'), D.status, /Ben Test: x; Cal Test: y/.test(D.denyReason)], ['denied', 'denied', true]);

// shadow drafts
let sd = LA.shadowDrafts(list);
eq('auto draft for a payday with a pending/approved run is retired', [sd.changed, sd.deadIds, sd.list.map(r => r.id), sd.retired.length], [true, ['AUTO1'], ['RUN1', N.id], 1]);
eq('no-op the second time', LA.shadowDrafts(sd.list).changed, false);
eq('auto draft alone (nothing else that payday) stays', LA.shadowDrafts([DRAFT]).changed, false);
eq('auto draft next to only a denied run stays', LA.shadowDrafts([Object.assign(mk(), { status: 'denied' }), DRAFT]).changed, false);
eq('a hand draft (auto:false) is not touched', LA.shadowDrafts([mk(), Object.assign({}, DRAFT, { auto: false })]).changed, false);

// 941 / PMPAY: Cal once, Ben approved with the run later -> compare with the same checks approved together
const split = [mk()]; const S1 = LA.splitLine(split, 'RUN1', 2, 'Tess'); S1.status = 'approved';
split[0].status = 'approved';   // "Approve all & record" for the rest (Ben)
const whole = [Object.assign(mk(), { status: 'approved' })];
const q = o => F.compute({ runs: o, payments: [], settings: {}, year: 2026, q: 4 });
const a = q(split), b = q(whole);
eq('941: wages = Ben + Cal once (split)', a.lines.L2, 384.62 + 1346.15);
eq('941: same lines as approving them together', [a.lines.L2, a.lines.L3, a.lines.L5e, a.lines.L12], [b.lines.L2, b.lines.L3, b.lines.L5e, b.lines.L12]);
eq('941: checks counted once', a.runs.reduce((t, r) => t + r.checks, 0), 2);
const pm = o => PM.compute({ runs: o, profiles: [], users: [], ledger: {}, checkQueue: [], today: '2026-11-07' });
eq('PMPAY: same result split or together', JSON.stringify(pm(split).rows), JSON.stringify(pm(whole).rows));

console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
