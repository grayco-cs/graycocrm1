// node tools/tests/test_PMPAYCHECK_fn.mjs — patch PMPAYCHECK: the pure core of tools/pmpaycheck_tail.js.
// Matching math (commission due vs paid per pay date, salary vs profile), the Q3-2026-known / Q4-always rule,
// "✓ Checked" clears until the amounts change, and the one "No pay setup" flag. Expected numbers by hand.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'pmpaycheck_tail.js'), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
const window = {}; new Function('window', src)(window);
const C = window._gcPmPayCheck;
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = typeof want === 'number' ? Math.abs(got - want) < 0.005 : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); } };

const users = [{ id: 'U1', name: 'Sam PM', role: 'Project Manager', payType: 'overhead_split', overhead: 15, split: 40 },
  { id: 'U2', name: 'Nora NoSetup', role: 'Project Manager' }, { id: 'U3', name: 'Hal Hourly', role: 'Crew', payType: 'hourly' }];
const profiles = [{ name: 'Sam PM', userId: 'U1', payType: 'salary_commission', annualSalary: 52000, period: 'weekly' },
  { name: 'Nora NoSetup', userId: 'U2', payType: 'commission', period: 'weekly' }, { name: 'Hal Hourly', userId: 'U3', payType: 'hourly' }];
const line = (empId, name, gross, comm) => ({ empId, name, period: 'weekly', gross, commission: comm, grossParts: [] });
const run = (id, d, lines, status = 'paid') => ({ id, payDate: d, status, lines });
const runs = [
  run('R1', '2026-09-25', [line('U1', 'Sam PM', 1000 + 900, 900)]),            // Q3: overpaid 400 (known)
  run('R2', '2026-10-09', [line('U1', 'Sam PM', 1000 + 300, 300), line('U2', 'Nora NoSetup', 250, 250), line('U3', 'Hal Hourly', 800, 0)]),
  run('R3', '2026-10-16', [{ empId: 'U1', name: 'Sam PM', period: 'weekly', gross: 1100.5, grossParts: [{ label: 'Salary', amount: 1000 }, { label: 'Commission', amount: 100.5 }] }]),
  run('R4', '2026-10-23', [line('U1', 'Sam PM', 1000, 0)]),
  run('RX', '2026-10-23', [line('U1', 'Sam PM', 5000, 5000)], 'pending'),      // not paid: ignored
];
const ledger = {
  J1: { pm: 'Sam PM', amount: 500, payDate: '2026-09-25', job: 'Oak St' },
  J2: { pm: 'Sam PM', amount: 300, payDate: '2026-10-09', job: 'Elm St' },
  J3: { pm: 'Sam PM', amount: 100, payDate: '2026-10-16', job: 'Pine St' },   // paid 100.50: within $1, no flag
  J4: { pm: 'Sam PM', amount: 700, payDate: '2026-10-23', job: 'Ash St' },    // owed, not paid
  J5: { pm: 'Other', bringer: 'Sam PM', bringerAmount: 50, amount: 0, payDate: '2026-10-30', job: 'Bay St' },  // after last run, past today: open owed
  J6: { pm: 'Sam PM', amount: 200, payDate: '2026-10-23', job: 'Fir St' },    // paid by a written separate check: not expected on payroll
};
const checkQueue = [{ dir: 'out', type: 'commission', status: 'written', emp: 'Sam PM', jobId: 'J6', amount: 200 }];
const base = { runs, profiles, users, ledger, checkQueue, today: '2026-11-03' };
let R = C.compute(base);
const by = id => R.flags.find(f => f.id === id);

// matching math
eq('Q3 commission flag: paid 900, due 500', [by('comm|U1|2026-09-25').expected, by('comm|U1|2026-09-25').paid, by('comm|U1|2026-09-25').kind], [500, 900, 'comm_unearned']);
eq('10/09 matches: no commission flag', by('comm|U1|2026-10-09'), undefined);
eq('10/16 within $1 (grossParts commission 100.50 vs 100): no flag', by('comm|U1|2026-10-16'), undefined);
const f23 = by('comm|U1|2026-10-23');
eq('10/23 commission owed but not paid: 700 (the separately written 200 not counted)', [f23.kind, f23.expected, f23.paid, f23.diff], ['comm_owed', 700, 0, -700]);
eq('10/23 flag links the job and the run', [f23.jobs.map(j => j.pid), f23.runs], [['J4'], ['R4']]);
eq('pending run ignored (no 5000)', R.rows.filter(r => r.payDate === '2026-10-23').map(r => r.paidComm), [0]);
const fo = by('comm|U1|open');
eq('handoff share due 10/30, on no run yet: owed 50', [fo.kind, fo.expected, fo.jobs[0].share, fo.quarter], ['comm_owed', 50, 'handoff', 'Q4 2026']);
eq('salary matches profile (52000/52 = 1000) on every date', R.flags.filter(f => f.kind === 'salary').length, 0);
// salary mismatch
const R2 = C.compute(Object.assign({}, base, { profiles: [Object.assign({}, profiles[0], { annualSalary: 57200 })].concat(profiles.slice(1)) }));
const fs1 = R2.flags.find(f => f.id === 'sal|U1|2026-10-09');
eq('salary different from profile: paid 1000, profile 1100', [fs1.kind, fs1.expected, fs1.paid, fs1.diff], ['salary', 1100, 1000, -100]);
eq('hourly crew never checked', R.flags.filter(f => f.empId === 'U3').length, 0);

// Q3 known / Q4 always
eq('Q3 flag is known, not an alert', [by('comm|U1|2026-09-25').known, R.alerts.some(f => f.id === 'comm|U1|2026-09-25')], [true, false]);
eq('known summary: 1 gap, 400 over', [R.known.count, R.known.over, R.known.byName['Sam PM'].over], [1, 400, 400]);
eq('9/30 known, 10/1 not', [C.isKnown('2026-09-30'), C.isKnown('2026-10-01')], [true, false]);
eq('Q4 flags alert', ['comm|U1|2026-10-23', 'comm|U1|open', 'nosetup|U2'].every(id => R.alerts.some(f => f.id === id)), true);

// no pay setup: exactly one flag, and no commission comparison for that PM
eq('one "No pay setup" flag for Nora', R.flags.filter(f => f.empId === 'U2').map(f => f.id), ['nosetup|U2']);
eq('its reason', by('nosetup|U2').reason.startsWith("No pay setup for Nora NoSetup — can't check commission"), true);

// ✓ Checked clears; amounts change → alerts again
const rec = C.checkRecord(f23, 'paid by hand on 10/24', 'Office', '2026-11-03T10:00:00Z');
eq('record keeps who / when / amounts', [rec.kind, rec.flagId, rec.by, rec.expected, rec.paid, rec.note], ['pmpay_check', 'comm|U1|2026-10-23', 'Office', 700, 0, 'paid by hand on 10/24']);
R = C.compute(Object.assign({}, base, { checks: [rec] }));
eq('checked flag cleared', [by('comm|U1|2026-10-23').cleared, R.alerts.some(f => f.id === 'comm|U1|2026-10-23')], [true, false]);
const led2 = Object.assign({}, ledger, { J4: Object.assign({}, ledger.J4, { amount: 750 }) });
R = C.compute(Object.assign({}, base, { ledger: led2, checks: [rec] }));
eq('amount changed after the check → alerts again', [by('comm|U1|2026-10-23').changed, R.alerts.some(f => f.id === 'comm|U1|2026-10-23')], [true, true]);
eq('quarter roll-up Q4 Sam: due 300+100+700, paid 300+100.5', (q => [q.expComm, q.paidComm, q.periods])(R.quarters.find(q => q.name === 'Sam PM' && q.quarter === 'Q4 2026')), [1150, 400.5, 3]);

console.log((fail ? 'FAIL ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
