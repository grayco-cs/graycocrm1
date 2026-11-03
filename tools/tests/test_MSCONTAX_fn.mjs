// node tools/tests/test_MSCONTAX_fn.mjs — the 🏛 MS contractor tax worksheet's math (tools/mscontax_tail.js) on synthetic jobs.
// Expected numbers worked out by hand.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'mscontax_tail.js'), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
const window = {}; new Function('window', src)(window);
const M = window._gcMsTax;
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = typeof want === 'number' ? Math.abs(got - want) < 0.005 : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); } };
const yes = (n, v) => eq(n, !!v, true), no = (n, v) => eq(n, !!v, false);

// ---- which jobs are Mississippi ----
yes('state field', M.jobMsWhy({ state: 'MS' }));
yes('state Mississippi', M.jobMsWhy({ state: 'Mississippi' }));
yes('address MS', M.jobMsWhy({ address: '123 Main St, Southaven, MS 38671' }));
yes('zip only', M.jobMsWhy({ address: '9 Goodman Rd 38654' }));
yes('zip field', M.jobMsWhy({ zip: '38632' }));
yes('estimate job state', M.jobMsWhy({ id: 'P9', address: 'somewhere' }, [{ pid: 'P9', settings: { jobState: 'MS' } }]));
no('Bartlett TN', M.jobMsWhy({ address: '6000 Stage Rd, Bartlett, TN 38134' }));
no('Jackson TN not MS city', M.jobMsWhy({ address: '100 Main, Jackson, TN 38301' }));
no('house number 3901 is not a zip', M.jobMsWhy({ address: '3901 Summer Ave, Memphis, TN' }));
yes('city only (weak)', /check$/.test(M.jobMsWhy({ address: '12 Elm, Olive Branch' })));
no('state TN field beats city', M.jobMsWhy({ state: 'TN', address: 'Oxford Rd' }));

// ---- invoice tax detection ----
eq('tax line', M.taxOnInvoice({ lines: [{ desc: 'Roof', amt: 20000 }, { desc: 'MS contractors tax (3.5%)', amt: 700 }] }), { how: 'tax line', collected: 700 });
eq('msTax field', M.taxOnInvoice({ msTax: '350.50' }), { how: 'separate amount', collected: 350.5 });
eq('none', M.taxOnInvoice({ desc: 'Draw 1' }), { how: '', collected: 0 });

// ---- a quarter ----
const projects = [
  { id: 'A', name: 'Prime retail Southaven', state: 'MS', contract: 120000, client: 'Owner LLC' },      // over 75k → MPC
  { id: 'B', name: 'Sub to GC Hernando', address: '1 Commerce St, Hernando, MS 38632', contract: 40000, client: 'Big GC' },
  { id: 'C', name: 'Insurance roof', address: '55 Pine, Olive Branch, MS 38654', contract: 8000, client: 'Jones (State Farm)' }, // ≤ 10k
  { id: 'D', name: 'Bartlett office', address: '6000 Stage Rd, Bartlett, TN 38134', contract: 90000 },  // TN, ignored
  { id: 'E', name: 'Small contract big billing', zip: '38671', contract: 9000 },                       // billed 12k ever → over 10k
];
const invoices = [
  { id: 'i1', type: 'client', pid: 'A', invNum: '1001', date: '2026-07-10', amt: 50000, paidDate: '2026-08-01', lines: [{ desc: 'MS contractor tax', amt: 1750 }] },
  { id: 'i2', type: 'client', pid: 'A', invNum: '1002', date: '2026-09-30', amt: 30000, paidDate: '2026-10-05' },
  { id: 'i3', type: 'client', pid: 'B', invNum: '1003', date: '2026-08-15', amount: 20000 },
  { id: 'i4', pid: 'C', invNum: '1004', date: '2026-09-01', amt: 8000, paidDate: '2026-09-20' },
  { id: 'i5', type: 'client', pid: 'D', invNum: '1005', date: '2026-08-01', amt: 45000 },            // TN
  { id: 'i6', type: 'sub', pid: 'A', invNum: 'S1', date: '2026-08-01', amt: 9999 },                  // a sub's bill to us
  { id: 'i7', type: 'client', pid: 'B', invNum: '1006', date: '2026-08-20', amt: 5000, status: 'draft' },
  { id: 'i8', type: 'client', pid: 'A', invNum: '0999', date: '2026-06-30', amt: 40000 },            // Q2
  { id: 'i9', type: 'client', pid: 'E', invNum: '1007', date: '2026-07-01', amt: 6000 },
  { id: 'i10', type: 'client', pid: 'E', invNum: '1008', date: '2026-11-01', amt: 6000 },           // Q4, but makes E 12k billed
  { id: 'i11', type: 'client', invNum: '1009', date: '2026-08-02', amt: 1000, address: 'Tupelo, MS 38801' }, // no job, MS address
];
const R = M.compute({ projects, invoices, year: 2026, q: 3 });
eq('rows', R.rows.map(r => r.invNum), ['1007', '1001', '1009', '1003', '1004', '1002']);
eq('gross', R.totals.gross, 50000 + 30000 + 20000 + 8000 + 6000 + 1000);   // 115000
eq('under10k', R.totals.under10k, 8000 + 1000);                           // job C and the 1k no-job invoice
eq('taxable', R.totals.taxable, 106000);
eq('taxDue', R.totals.taxDue, 106000 * 0.035);                             // 3710
eq('collected', R.totals.collected, 1750);
eq('notCollected', R.totals.notCollected, 3710 - 1750);
eq('A contract = max(contract, billed)', R.jobs.find(j => j.pid === 'A').contract, 120000);
eq('E contract from billing', R.jobs.find(j => j.pid === 'E').contract, 12000);
eq('mpc jobs', R.mpcJobs.map(j => j.pid), ['A']);
eq('hasPaidDates', R.hasPaidDates, true);
eq('due date', R.quarter.dueDate, '2026-10-20');

const P = M.compute({ projects, invoices, year: 2026, q: 3, basis: 'paid' });
eq('paid rows', P.rows.map(r => r.invNum), ['1001', '1004']);
eq('paid gross', P.totals.gross, 58000);
eq('paid tax', P.totals.taxDue, 1750);
eq('Q4 paid', M.compute({ projects, invoices, year: 2026, q: 4, basis: 'paid' }).rows.map(r => r.invNum), ['1002']);
eq('lastEnded', M.lastEndedQuarter('2026-11-03'), { year: 2026, q: 3 });
eq('lastEnded Jan', M.lastEndedQuarter('2027-01-05'), { year: 2026, q: 4 });
yes('csv has total', /TOTAL,,,,115000\.00,,,3710\.00,,1750\.00/.test(M.csv(R)));

console.log(`MSCONTAX_fn ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
