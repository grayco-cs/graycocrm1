// test_ESTUPLOAD_parse.mjs [build-dir] — patch ESTUPLOAD (node, no browser): the words of an uploaded paper.
//   1. schedule language → start / finish dates, a duration, phases — each with the phrase it came from; durations count
//      in working days (Mon–Fri) from the start unless the paper says calendar days; nothing found → nothing.
//   2. the scope from the paper → wording only (SCOPEWORDS: no amounts, no money lines).
// Usage: node test_ESTUPLOAD_parse.mjs [dir with index.html]   (default: this checkout)
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { fileURLToPath } from 'url';
const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const block = id => { const i = html.indexOf('<script id="' + id + '">'), j = html.indexOf('</script>', i); return i > 0 ? html.slice(i + id.length + 15, j) : ''; };
const win = {}; win.window = win;
vm.runInNewContext(block('gc-patch-scopewords'), { window: win });
vm.runInNewContext(block('gc-patch-estupload'), { window: win, document: undefined });
const P = win._gcEstUpParse;
ok(!!P && typeof P.schedFind === 'function' && typeof P.scopeFromText === 'function', 'the parser is in the page (window._gcEstUpParse)');
const T = { today: '2026-11-03' };   /* a Tuesday */
const S = t => P.schedFind(t, T);

/* dates */
let r = S('Work will start on 11/16/2026 and be complete by 11/25/2026.');
ok(r.start === '2026-11-16' && r.finish === '2026-11-25' && /start on 11\/16\/2026/.test(r.startQ), 'numeric dates: "start on 11/16/2026 … complete by 11/25/2026"', r);
r = S('We can begin the week of December 7. Substantial completion by December 18, 2026.');
ok(r.start === '2026-12-07' && r.finish === '2026-12-18', 'month names: "begin the week of December 7" · "Substantial completion by December 18, 2026"', r);
r = S('Start date: Jan 5');
ok(r.start === '2027-01-05', 'a date with no year that already passed this year → next year', r);
r = S('Commencement 11/30');
ok(r.start === '2026-11-30', '"Commencement 11/30"', r);

/* durations */
r = S('The project will take approximately 3 weeks to complete.');
ok(r.days === 15 && !r.cal && /approximately 3 weeks/.test(r.durQ), '"approximately 3 weeks" → 15 working days', r);
r = S('Estimated duration: 10 working days, weather permitting.');
ok(r.days === 10 && !r.cal, '"10 working days" → 10', r);
r = S('Install will take 2–3 days.');
ok(r.days === 3, '"2–3 days" → the longer, 3', r);
r = S('The work will be completed within 14 calendar days.');
ok(r.days === 14 && r.cal, '"14 calendar days" → calendar', r);
r = S('This proposal is good for 30 days. Payment due net 30 days. Warranty: one (1) year on workmanship.');
ok(!r.days && !r.start && !r.finish && !r.phases.length, 'not schedule: "good for 30 days", "net 30 days", a warranty → nothing', r);

/* phases */
r = S('Phase 1: Demo, 2 days\nPhase 2: Install shingles (3 days)\nPhase 3 - Cleanup – 1 day');
ok(r.phases.length === 3 && r.phases.map(p => p.name + ':' + p.days).join('|') === 'Demo:2|Install shingles:3|Cleanup:1' && /^Phase 1/.test(r.phases[0].q), '"Phase N: name, N days" (with , ( – separators)', r.phases);
r = S('Week 1: tear off and dry-in\nWeek 2: shingles and flashing');
ok(r.phases.length === 2 && r.phases[0].days === 5 && r.phases[1].name === 'shingles and flashing', '"Week 1: …" → a 5-working-day phase', r.phases);
r = S('Days 1-2: demo\nDay 3: haul off');
ok(r.phases.length === 2 && r.phases[0].days === 2 && r.phases[1].days === 1, '"Days 1-2: demo" → 2 days', r.phases);
r = S('Tear off and replace shingles = $11,500.00\nGutters and downspouts = $1,000.00\nTotal: $12,500.00');
ok(!r.phases.length && !r.days && !r.start, 'a priced estimate with no schedule words → nothing found', r);

/* the plan: working days from the start */
const pl = P.plan('2026-11-16', { phases: [{ name: 'Demo', days: 2 }, { name: 'Install', days: 3 }] }, '');
ok(pl.phases.map(p => p.start + '>' + p.end).join(',') === '2026-11-16>2026-11-17,2026-11-18>2026-11-20' && pl.finish === '2026-11-20', 'phases one after another, Mon–Fri (Mon 11/16 → Fri 11/20)', pl);
ok(P.addWorking('2026-11-20', 3) === '2026-11-24', '3 working days from a Friday skip the weekend (Fri, Mon, Tue)');
ok(P.addWorking('2026-11-21', 1) === '2026-11-23', 'a Saturday start moves to Monday');
ok(P.addWorking('2026-11-16', 14, true) === '2026-11-29', 'calendar days count every day');
ok(P.plan('2026-11-16', { phases: [], days: 15 }, '').finish === '2026-12-04', '"3 weeks" from Mon 11/16 → Fri 12/4');

/* the scope, wording only */
const sc = P.scopeFromText('GrayCo Construction Services\n5796 Ferguson Rd, Bartlett, TN 38134\nProposal\nCustomer: Brad\nTear off and replace shingles = $11,500.00\nInstall 12 sheets drywall — $1,240.00\nLabor 8 hrs @ $65 = $520\nSubtotal $13,260\nSales tax $0.00\nTotal: $13,260.00\nThis proposal is good for 30 days.');
ok(sc === 'Tear off and replace shingles\nInstall 12 sheets drywall\nLabor 8 hrs', 'scope from a priced paper: the wording only (no $, no subtotal / tax / total)', sc);
const sc2 = P.scopeFromText('Proposal\nScope of Work:\n1. Remove existing carpet in 3 bedrooms\n2. Install LVP flooring, 650 SF — $4,875.00\n3. New baseboards\nExclusions:\nPermits');
ok(sc2 === 'Remove existing carpet in 3 bedrooms\nInstall LVP flooring, 650 SF\nNew baseboards', 'a "Scope of Work" section: its lines up to the next heading, prices stripped', sc2);
ok(P.scopeFromText('') === '', 'nothing → empty');

/* the page: the panel's pieces */
const tail = block('gc-patch-estupload');
ok(/data-eu="sched"[^]*Make schedule for job/.test(tail) && /tentative: true/.test(tail), '"📅 Make schedule for job" makes tentative Schedule items (only on the tap)');
ok(/Customer sees:/.test(tail) && /My PDF \(original\)/.test(tail) && /Template version/.test(tail) && /customerSees: st\.cs/.test(tail), 'the choice "Customer sees: My PDF (original) / Template version" (CUSTPORTAL\'s customerSees)');
ok(/📨 Put in customer portal/.test(tail) && /✉️ Send it myself/.test(tail) && /⬇️ Download/.test(tail), 'the three actions');
ok(/!s\(job\.scopeOfWork\) && !s\(job\.scope\)/.test(tail) && /Add to job scope/.test(tail), 'the job\'s Scope of Work: written only when empty, else "Add to job scope"');
console.log(`ESTUPLOAD_parse ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
