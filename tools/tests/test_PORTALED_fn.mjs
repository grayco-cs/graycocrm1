// test_PORTALED_fn.mjs <build-dir> — patch PORTALED, the server side (node only, mocked storage: custportal_world.mjs's in-memory
// Supabase; nothing leaves the machine; made-up data).
//   A. _lib/portaled.js: summary / checklist / scopes / milestones from the job; archived rows never sent; never a price, a note,
//      who made it, a sub's name, a carrier's name or a portal link (a sub's portal link looks like a customer's); the milestones
//      join the schedule steps in date order with one "now".
//   B. portal.js view (the customer's link, the real handler): the editor's fields reach the customer; the whole answer has no
//      carrier, no sub, no sub price, no portal link from staff text, no archived row; a job without the fields is unchanged.
//   C. portal.js gate state (staff): each waiting paper carries its ✅ Approvals id (aq); without a staff sign-in → 401; the gate
//      approve through the existing approval op puts it in the portal (the view then lists it) and e-mails nobody.
//   D. portal.html draws the three cards (edCards in home()).
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const W = await import(path.join(build, 'tools/tests/custportal_world.mjs'));
const L = require(path.join(build, 'netlify/functions/_lib/portaled.js'));

console.log('A. _lib/portaled.js');
{
  const p = { id: 'P1', subs: [{ name: 'Ridgeline Framing LLC', bidAmt: 999 }], insCarrier: 'Sample Mutual Insurance',
    portalSummary: { text: 'Roof by Ridgeline Framing LLC; Sample Mutual Insurance pays. Sub link https://portal.grayco-cs.com/#t=' + 'A'.repeat(43) + ' and State Farm.', by: 'Demo PM', at: '2026-11-19T10:00:00Z' },
    portalTasks: [{ id: 't1', text: 'Pick your shingle color', due: '2026-11-25', done: false, by: 'Demo PM', note: 'INTERNAL margin 31%' }, { id: 't2', text: 'Old task', archived: true }, { id: 't3', text: 'Sign the contract', done: true, doneAt: '2026-11-18' }],
    portalScopes: [{ id: 's1', title: 'Roof', lines: [{ area: 'Roof', work: 'Tear off and re-roof', qty: 32, unit: 'SQ', note: 'cost 8765', srcCost: 8765, price: 12000 }], included: 'Drip edge', excluded: 'Decking', by: 'x' }, { id: 's2', title: 'Gone', text: 'x', archived: true }],
    portalMilestones: [{ id: 'm1', name: 'Cabinets installed', date: '2030-01-10' }, { id: 'm2', name: 'Archived one', date: '2030-01-01', archived: true }] };
  const out = L.build(p, ['Sample Mutual Insurance', /\b(state\s*farm)\b/i]);
  const js = JSON.stringify(out);
  ok(/[Yy]our insurance company/.test(out.summary) && !/Sample Mutual|State Farm/i.test(js), 'carrier names → "your insurance company" (the job\'s carrier and a common one)', out.summary);
  ok(/[Oo]ur trade partner/.test(out.summary) && !/Ridgeline/.test(js), 'the job\'s sub → "our trade partner"', out.summary);
  ok(!/#t=|portal\.grayco/.test(js) && /\[link removed\]/.test(out.summary), 'a portal link (customer or sub — the same shape) is taken out', out.summary);
  ok(out.tasks.length === 2 && out.tasks[0].id === 't1' && out.tasks[1].done === true && !/Old task/.test(js), 'checklist: open first, then done; archived never sent', out.tasks);
  ok(!/INTERNAL|margin|8765|12000|999|Demo PM/.test(js) && out.tasks.every(t => Object.keys(t).join() === 'id,text,due,done,doneAt'), 'never a note, a cost, a price, a bid or who made it', out.tasks);
  ok(out.scopes.length === 1 && Object.keys(out.scopes[0].lines[0]).join() === 'area,work,qty,unit' && out.scopes[0].lines[0].qty === 32, 'scope lines: area / work / qty / unit only; the archived scope is not sent', out.scopes);
  const view = { job: { steps: [{ name: 'Materials delivered', date: '2020-01-01', done: true }, { name: 'Roof', date: '2030-02-01', now: true }] } };
  L.attach(view, p, []);
  ok(view.job.steps.map(x => x.name).join('|') === 'Materials delivered|Cabinets installed|Roof' && view.job.steps.filter(x => x.now).length === 1 && view.job.steps[1].now === true, 'milestones join the schedule in date order, one "next"', view.job.steps);
  const v2 = { job: { steps: [] } }; L.attach(v2, { id: 'X' }, []);
  ok(!v2.job.summary && Array.isArray(v2.checklist) && !v2.checklist.length && !v2.scopes.length && !v2.job.steps.length, 'a job without the fields: nothing added', v2);
}

console.log('B. portal.js view (the real handler, the customer\'s link)');
W.seedSample({ photos: 4, crmDocs: false }); W.resetCaches();
const S = W.S;
const jobs = W.get('projects');
const j = jobs.find(x => x.id === S.pid);
Object.assign(j, {
  portalSummary: { text: 'Full roof and kitchen. ' + S.carrier + ' covers the roof. ' + S.sub + ' frames the wall. Their portal https://portal.grayco-cs.com/#t=' + S.otherLink, at: '2026-11-01T12:00:00Z', by: S.pm.name },
  portalTasks: [{ id: 'pt1', text: 'Pick your tile', due: '2026-11-20', done: false }, { id: 'pt2', text: 'ARCHIVED TASK', archived: true }],
  portalScopes: [{ id: 'ps1', title: 'Kitchen', lines: [{ area: 'Kitchen', work: 'Shaker cabinets, soft close', qty: 1, unit: 'LS', srcCost: S.subPrice }], included: 'Hardware', excluded: 'Appliances' }],
  portalMilestones: [{ id: 'pm1', name: 'Cabinets installed', date: '2026-11-15' }] });
W.put('projects', jobs);
let r = await W.handlerCall('portal', { action: 'view' }, { 'x-portal-token': S.link });
const v = r.data; const vj = JSON.stringify(v);
ok(r.status === 200 && v.ok, 'the customer\'s view answers', r.status);
ok(/Full roof and kitchen/.test(v.job.summary || ''), 'About your project reaches the customer', v.job && v.job.summary);
ok((v.checklist || []).length === 1 && v.checklist[0].text === 'Pick your tile', 'the checklist reaches the customer (the archived task does not)', v.checklist);
ok((v.scopes || []).length === 1 && v.scopes[0].lines[0].work === 'Shaker cabinets, soft close', 'the scope reaches the customer', v.scopes);
ok((v.job.steps || []).some(x => x.name === 'Cabinets installed'), 'the milestone is in Your schedule', (v.job.steps || []).map(x => x.name));
ok(!vj.includes(S.carrier) && !/Sample Mutual/i.test(vj), 'no carrier name anywhere in the customer\'s answer');
ok(!vj.includes(S.sub) && !vj.includes(String(S.subPrice)), 'no sub name, no sub price');
ok(!vj.includes(S.otherLink) && !/ARCHIVED TASK/.test(vj), 'no portal link from staff text, no archived row');

console.log('C. gate state (staff) + approve in place');
const docs = W.get('projectDocs');
docs.push({ id: 'pped_plan1', pid: S.pid, name: 'Kitchen plans.pdf', cat: 'Plans', ref: W.storeFile(W.pdfOf('Kitchen plans', ['Plan view']), 'pdf', 'application/pdf'), type: 'application/pdf', portalShare: true, uploadedAt: '2026-11-02T15:00:00.000Z', source: 'portal-editor' });
W.put('projectDocs', docs); W.resetCaches();
r = await W.handlerCall('portal', { action: 'view' }, { 'x-portal-token': S.link });
ok(!(r.data.docs || []).some(d => /Kitchen plans/.test(d.title)), 'a new paper is not in the portal before its approval (PORTALGATE)', (r.data.docs || []).map(d => d.title));
r = await W.handlerCall('portal', { action: 'gate', op: 'scan', projectId: S.pid }, { Authorization: 'Bearer good-admin' });
ok(r.status === 200 && r.data.ok, 'gate scan (staff) queues it', r.data);
r = await W.handlerCall('portal', { action: 'gate', op: 'state', projectId: S.pid }, { Authorization: 'Bearer good-admin' });
const g = (r.data.items || []).find(x => x.key === 'd:pped_plan1');
ok(r.status === 200 && g && g.st === 'pending' && /^aq_gate_/.test(g.aq || ''), 'gate state: the waiting paper carries its ✅ Approvals id (aq)', g);
const r401 = await W.handlerCall('portal', { action: 'gate', op: 'state', projectId: S.pid }, {});
ok(r401.status === 401 && !r401.data.items, 'gate state without a staff sign-in → 401, nothing listed', r401.status);
const mails0 = W.RESEND.length;
r = await W.handlerCall('portal', { action: 'approval', op: 'approve', id: g.aq, device: 'phone' }, { Authorization: 'Bearer good-admin' });
ok(r.status === 200 && r.data.ok, 'the admin approves it in place (the existing approval op)', r.data);
W.resetCaches();
r = await W.handlerCall('portal', { action: 'view' }, { 'x-portal-token': S.link });
ok((r.data.docs || []).some(d => /Kitchen plans/.test(d.title)), 'then it is in the customer\'s Documents', (r.data.docs || []).map(d => d.title));
ok(W.RESEND.length === mails0, 'approving it e-mailed nobody', W.RESEND.slice(mails0).map(m => m && m.subject));

console.log('D. portal.html');
{
  const t = fs.readFileSync(path.join(build, 'portal.html'), 'utf8');
  ok(/function edCards\(\)/.test(t) && /var ed = edCards\(\);/.test(t) && (t.match(/, ed, \[updates\(\)/g) || []).length === 2, 'portal.html: Home draws About your project / checklist / scope (phone and wide)');
  const ix = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
  ok(/<script id="gc-patch-portaled">/.test(ix) && /W\._gcPortalEd && W\._gcPortalEd\.open\(p\.id\)/.test(ix) && /data-q="ped"/.test(ix), 'index.html: the block, the Field hook and the desk card button are in');
  ok(!/Open in GrayCo Photos/.test(ix.slice(ix.indexOf('<script id="gc-patch-portaled">'), ix.indexOf('</script>', ix.indexOf('<script id="gc-patch-portaled">')))), 'the portal page adds no "Open in GrayCo Photos" button');
}
console.log(`PORTALED_fn ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
