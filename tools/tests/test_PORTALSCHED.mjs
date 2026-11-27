// test_PORTALSCHED.mjs [build-dir] — patch PORTALSCHED (owner 11/27: "this should be reading my schedule and putting it in here … post in
// schedule portals"): the customer's 📅 Your schedule = the job's plan steps + its POSTED schedule rows, by date, the past ones done and
// the next one "next". Tentative, deleted, archived, internal, staff-only, personal, customerVisible:false rows never show; only a title and
// dates go out (no sub, vendor, crew, assignee, time, notes, cost, phone); a hand "Start — …" entry on a plan step's day and the same title
// on the same day show once. The GC portal keeps its own list (no row twice there) and never shows a tentative row.
// The real portal function on custportal_world.mjs (in-memory Supabase, nothing leaves the machine). Made-up data only.
import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
const W = await import(pathToFileURL(path.join(build, 'tools/tests/custportal_world.mjs')).href);
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const S = W.S, L = () => ({ 'x-portal-token': S.link });
W.setDay(); W.seedSample({ crmDocs: false });
const add = n => { const d = new Date(W.realNow() + n * 864e5); return d.toISOString().slice(0, 10); };   /* the portal's "today" is the real day */
const rows = [
  /* posted rows: shown */
  { id: 'r1', pid: S.pid, title: 'Ridgeline Framing LLC — Frame the new porch', vendor: S.sub, assignee: 'Rory Lane', time: '07:00', endTime: '15:00', notes: 'gate code 4411 · $8,765.43 to the sub', date: add(5), endDateSch: add(7), scope: 'company', type: 'work', tentative: false, by: 'Dana Rivers' },
  { id: 'r2', pid: S.pid, title: 'Cabinet delivery', date: add(-3), scope: 'company', type: 'delivery', crew: ['Marco Diaz'] },
  { id: 'r3', pid: S.pid, title: 'Cabinet delivery', date: add(-3), scope: 'company' },   /* the same title, the same day: once */
  { id: 'r4', pid: S.pid, title: 'Paint walls and trim', date: add(12), scope: 'company', source: 'job-doc', fromFile: 'Construction Schedule.pdf' },
  /* never shown */
  { id: 'x1', pid: S.pid, title: 'TENTATIVE Siding install', date: add(9), scope: 'tentative', tentative: true },
  { id: 'x2', pid: S.pid, title: 'DELETED Old day', date: add(4), scope: 'company', deleted: true },
  { id: 'x3', pid: S.pid, title: 'INTERNAL Crew safety meeting', date: add(2), internal: true },
  { id: 'x4', pid: S.pid, title: 'STAFFONLY Paperwork', date: add(2), staffOnly: true },
  { id: 'x5', pid: S.pid, title: 'PERSONAL Dentist', date: add(2), scope: 'personal' },
  { id: 'x6', pid: S.pid, title: 'HIDDEN from the customer', date: add(3), customerVisible: false },
  { id: 'x7', pid: S.pid, title: 'ARCHIVED day', date: add(3), archived: true },
  { id: 'x8', pid: S.other, title: 'OTHER JOB day', date: add(3), scope: 'company' },
  { id: 'x9', pid: S.pid, title: 'Start — Sample job', date: '2026-11-04', scope: 'company', by: 'Dana Rivers' }   /* a plan step is on that day */
];
W.put('schedule', W.get('schedule').concat(rows));
W.resetCaches();
const v = await W.handlerCall('portal', { action: 'view' }, L());
ok(v.data && v.data.ok, 'the customer view opens', v.data && v.data.error);
const st = (v.data.job || {}).steps || [];
const names = st.map(x => x.name);
console.log('    steps: ' + st.map(x => (x.done ? '✓ ' : x.now ? '▶ ' : '') + x.name + ' ' + x.date + (x.end ? '–' + x.end : '')).join(' | '));
ok(names.includes('Frame the new porch') && names.includes('Cabinet delivery') && names.includes('Paint walls and trim'), 'the posted rows are in "Your schedule"', names);
ok(['Materials delivered', 'Roof tear-off and new roof', 'Kitchen demolition', 'Final walkthrough'].every(n => names.includes(n)), 'the plan steps are still there', names);
ok(!names.some(n => /TENTATIVE|DELETED|INTERNAL|STAFFONLY|PERSONAL|HIDDEN|ARCHIVED|OTHER JOB/.test(n)), 'tentative, deleted, internal, staff-only, personal, hidden, archived and other jobs\' rows never show', names);
ok(names.filter(n => n === 'Cabinet delivery').length === 1 && !names.some(n => /^Start —/.test(n)), 'the same title on the same day once; the hand "Start — …" on a plan step\'s day not twice', names);
const dates = st.map(x => x.date || '9999');
ok(dates.every((d, i) => i === 0 || dates[i - 1] <= d), 'sorted by date', dates);
const porch = st.find(x => x.name === 'Frame the new porch') || {};
ok(porch.date === add(5) && porch.end === add(7) && !porch.done, 'a row keeps its start / end dates', porch);
ok((st.find(x => x.name === 'Cabinet delivery') || {}).done === true, 'a past row is done');
const nx = st.filter(x => x.now);
ok(nx.length === 1 && nx[0] === st.find(x => !x.done), 'one "next": the first one not done', nx);
ok(st.every(x => Object.keys(x).every(k => ['name', 'date', 'end', 'done', 'now'].includes(k))), 'only name + dates go out', st.map(x => Object.keys(x)));
const j = JSON.stringify(v.data.job);
ok(!/Ridgeline|Rory|Marco|07:00|gate code|8,765|8765|Dana Rivers|Construction Schedule\.pdf/.test(j), 'no sub, vendor, crew, assignee, time, notes, cost or file name in the job payload', j.slice(0, 600));
/* the unit: names out of the title */
const P = require(path.join(W.FNDIR, 'portal.js'));
const t1 = P._sched.rowTitle({ title: "Marco's crew start drywall hang $4,500", by: 'x' }, [{ name: 'Marco Diaz' }]);
ok(t1 === 'crew start drywall hang', '"Marco\'s crew start drywall hang $4,500" → "crew start drywall hang"', t1);
/* the GC portal: its own list (no row twice), never a tentative row */
const GCP = require(path.join(W.FNDIR, '_lib/gcp.js'));
const gs = await GCP.scheduleOf(S.pid);
ok(!gs.some(x => /TENTATIVE/.test(x.title)) && gs.some(x => /Paint walls/.test(x.title)), 'GC portal schedule: posted rows, never a tentative one', gs.map(x => x.title));
console.log(`PORTALSCHED ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
