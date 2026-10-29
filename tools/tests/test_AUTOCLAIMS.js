/* patch AUTOCLAIMS tests: node tools/tests/test_AUTOCLAIMS.js — the rules (auto-claims.js), the scheduled function
   (claims-auto.js, every dependency mocked: no Supabase, no Resend, a fake clock), the morning digest (plan.js) and the
   approval send of an adjuster nudge (portal.js, fetch mocked). Made-up names, @example.com / 555 data only. */
'use strict';
const assert = require('assert');
const path = require('path');
const FN = path.join(__dirname, '../../netlify/functions');
process.env.CRM_URL = 'https://crm.test';
const AC = require(path.join(FN, '_lib/auto-claims.js'));
const PLAN = require(path.join(FN, '_lib/plan.js'));
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ FAIL ' + name + '\n     ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); } };

const TODAY = '2026-11-10';
const PROJECTS = [
  { id: 'P1', name: 'Test Roof — 1 Elm St', pm: 'Pat PM', address: '1 Elm St, Memphis, TN', status: 'active' },
  { id: 'P2', name: 'Test Water — 2 Oak St', pm: 'Pat PM', address: '2 Oak St, Memphis, TN', status: 'active', superintendent: 'Sam Super' },
  { id: 'P3', name: 'Closed job', pm: 'Pat PM', status: 'complete' }
];
const USERS = [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'Project Manager', active: true }, { name: 'Mo Mit', email: 'mo@grayco-cs.com', role: 'Mitigation Manager', active: true }, { name: 'Sam Super', email: 'sam@grayco-cs.com', role: 'Superintendent', active: true }];
const SITEBOOK = [
  { id: 'P1', permit: { number: 'BLD-555-01', jurisdiction: 'Memphis / Shelby County, TN' }, inspections: [
    { id: 'I1', type: 'Final', date: '2026-11-11', result: 'Scheduled' },           /* tomorrow */
    { id: 'I2', type: 'Framing', date: '2026-11-08', result: 'Scheduled' },          /* passed date, no answer */
    { id: 'I3', type: 'Rough-in', date: '2026-11-05', result: 'Failed', notes: 'Missing nail plates' },
    { id: 'I4', type: 'Footing', date: '2026-11-01', result: 'Passed' },
    { id: 'I5', type: 'Insulation', date: '2026-11-10', result: '' },                 /* today */
    { id: 'I6', type: 'Gone', date: '2026-11-09', deleted: true } ] },
  { id: 'P2', permit: { number: '', jurisdiction: '', status: 'Finaled / closed' }, inspections: [] }
];
const JOBINS = { P2: [{ id: 'J1', label: 'Rough-in inspection', date: '2026-11-07', done: false }, { id: 'J2', label: 'Final inspection', date: '', done: false }, { id: 'J3', label: 'Old', date: '2026-10-01', done: true }] };

(async function(){
console.log('AUTOCLAIMS — 8. permits & inspections');
await T('results in plain words are normalized', () => {
  assert.strictEqual(AC.normResult('Scheduled'), ''); assert.strictEqual(AC.normResult('Passed'), 'passed'); assert.strictEqual(AC.normResult('FAILED'), 'failed');
  assert.strictEqual(AC.normResult('Rescheduled'), 'resched'); assert.strictEqual(AC.normResult('Cancelled'), 'cancelled'); assert.strictEqual(AC.normResult(''), '');
});
const list = AC.inspections({ sitebook: SITEBOOK, jobInspections: JOBINS });
await T('Site Book + job inspections in one list, deleted ones left out, sorted by date', () => {
  assert.strictEqual(list.length, 8);
  assert.ok(!list.some(i => i.id === 'I6'));
  assert.strictEqual(list.find(i => i.id === 'J3').result, 'passed', 'done on the AUT3 list = passed');
  const dated = list.filter(i => i.date).map(i => i.date); assert.deepStrictEqual(dated, dated.slice().sort());
});
await T('the Site Book map form ({ pid: record }) reads the same as the list form', () => {
  const m = {}; SITEBOOK.forEach(r => m[r.id] = r);
  assert.strictEqual(AC.inspections({ sitebook: m }).length, AC.inspections({ sitebook: SITEBOOK }).length);
});
const act = AC.inspActions(list, TODAY);
await T('day-before reminder, today, the after-date question and the failed fix', () => {
  assert.deepStrictEqual(act.remind.map(i => i.id), ['I1']);
  assert.deepStrictEqual(act.today.map(i => i.id), ['I5']);
  assert.deepStrictEqual(act.ask.map(i => i.id).sort(), ['I2', 'J1']);
  assert.deepStrictEqual(act.fix.map(i => i.id), ['I3']);
});
await T('a failed inspection with a re-inspection booked needs no fix to-do', () => {
  const l2 = list.concat([{ key: 'sb:P1:I9', src: 'sitebook', pid: 'P1', id: 'I9', type: 'Re-inspection: Rough-in', date: '2026-11-14', result: '', reinspOf: 'I3' }]);
  assert.strictEqual(AC.inspActions(l2, TODAY).fix.length, 0);
  assert.strictEqual(AC.inspActions(list.map(i => i.id === 'I3' ? Object.assign({}, i, { rescheduledTo: '2026-11-14' }) : i), TODAY).fix.length, 0);
});
await T('a very old unanswered inspection is not pushed every day (askDays)', () => {
  const old = [{ key: 'x', pid: 'P1', id: 'X', type: 'Old', date: '2026-09-01', result: '' }];
  assert.strictEqual(AC.inspActions(old, TODAY).ask.length, 0);
  assert.strictEqual(AC.inspActions(old, TODAY, { askDays: 3650 }).ask.length, 1);
});
await T('the open list: open inspections + open permits, closed job and finaled permit left out', () => {
  const tr = AC.openTracker({ sitebook: SITEBOOK, jobInspections: JOBINS, projects: PROJECTS.concat([{ id: 'P1x' }]).map(p => Object.assign({ permits: p.id === 'P1' ? [{ id: 'PERM1', type: 'Electrical permit', status: 'Needed' }, { id: 'PERM2', type: 'Building', status: 'Finaled / closed' }] : [] }, p)) }, TODAY);
  assert.deepStrictEqual(tr.inspections.map(i => i.id).sort(), ['I1', 'I2', 'I3', 'I5', 'J1', 'J2']);
  assert.strictEqual(tr.counts.ask, 2); assert.strictEqual(tr.counts.failed, 1);
  assert.deepStrictEqual(tr.permits.map(p => p.type + ':' + p.status).sort(), ['Building permit:Issued', 'Electrical permit:Needed']);
  assert.strictEqual(tr.inspections.find(i => i.id === 'I3').pm, 'Pat PM');
});
await T('the schedule row of a Site Book inspection is internal (never in the portal) and has a stable id', () => {
  const r = AC.schedRow(list.find(i => i.id === 'I1'), PROJECTS[0]);
  assert.strictEqual(r.id, 'SB_INS_P1_I1'); assert.strictEqual(r.date, '2026-11-11'); assert.strictEqual(r.type, 'inspection');
  assert.strictEqual(r.internal, true); assert.strictEqual(r.portal, false); assert.strictEqual(r.assignee, 'Pat PM');
});
await T('the fix to-do: the same id on the server and in the CRM, assigned to the PM, due today', () => {
  const i = list.find(x => x.id === 'I3'), t = AC.fixTodo(i, PROJECTS[0], 'Pat@GrayCo-cs.com', TODAY);
  assert.strictEqual(t.id, AC.fixTodoId({ pid: 'P1', id: 'I3' })); assert.deepStrictEqual(t.assignees, ['pat@grayco-cs.com']);
  assert.strictEqual(t.due, TODAY); assert.ok(/Fix \+ reschedule: failed Rough-in inspection/.test(t.label)); assert.ok(/Missing nail plates/.test(t.note));
});

console.log('AUTOCLAIMS — 10. drying log reminders');
const CLAIM_DRY = { id: 'C1', projectId: 'P2', phase: 'Inspection', pm: '', mitTech: 'Mo Mit',
  equipment: [{ id: 'E1', kind: 'airmover', qty: 4, placedAt: '2026-11-06' }, { id: 'E2', kind: 'dehu', qty: 1, placedAt: '2026-11-06' }],
  moisture: [{ room: 'Kitchen', material: 'drywall', reading: 40, goal: 12, date: '2026-11-06' }, { room: 'Kitchen', material: 'drywall', reading: 30, goal: 12, date: '2026-11-07' }, { room: 'Kitchen', material: 'drywall', reading: 22, goal: 12, date: '2026-11-09' }],
  atmos: [{ date: '2026-11-07', rh: 50 }] };
await T('Day N counts from the first equipment day; the day with no reading is missed', () => {
  const d = AC.dryingOf(CLAIM_DRY, TODAY);
  assert.strictEqual(d.day, 5); assert.deepStrictEqual(d.missed, ['2026-11-08']); assert.strictEqual(d.loggedToday, false); assert.strictEqual(d.onsite, 5);
  assert.ok(/Day 5/.test(AC.dryingTitle(d, 'Test Water'))); assert.ok(/1 drying day with no readings/.test(AC.missedText(d)));
});
await T('today\'s reading in → logged today; a photo day counts as logged', () => {
  const c = JSON.parse(JSON.stringify(CLAIM_DRY)); c.moisture.push({ room: 'Kitchen', material: 'drywall', reading: 15, goal: 12, date: TODAY });
  assert.strictEqual(AC.dryingOf(c, TODAY).loggedToday, true);
  assert.deepStrictEqual(AC.dryingOf(CLAIM_DRY, TODAY, { photoDays: ['2026-11-08'] }).missed, []);
});
await T('drying ends when it is marked complete (dry standard met), when the equipment is picked up, or the claim closes', () => {
  assert.strictEqual(AC.dryingOf(Object.assign({}, CLAIM_DRY, { drying: { completeAt: '2026-11-09T18:00:00Z' } }), TODAY), null);
  assert.strictEqual(AC.dryingOf(Object.assign({}, CLAIM_DRY, { equipment: CLAIM_DRY.equipment.map(e => Object.assign({}, e, { removedAt: '2026-11-09' })) }), TODAY), null);
  assert.strictEqual(AC.dryingOf(Object.assign({}, CLAIM_DRY, { phase: 'Closed' }), TODAY), null);
  assert.strictEqual(AC.dryingOf({ id: 'C9', projectId: 'P1', equipment: [] }, TODAY), null);
});
await T('equipment picked up mid-way: days after the pick-up are not "missed"', () => {
  const c = { id: 'C2', projectId: 'P2', equipment: [{ id: 'a', placedAt: '2026-11-01', removedAt: '2026-11-03' }, { id: 'b', placedAt: '2026-11-08' }], moisture: [{ date: '2026-11-01', room: 'a', reading: 1, goal: 1 }, { date: '2026-11-02', room: 'a', reading: 1, goal: 1 }, { date: '2026-11-08', room: 'a', reading: 1, goal: 1 }] };
  assert.deepStrictEqual(AC.dryingOf(c, TODAY).missed, ['2026-11-09']);
});
await T('who takes the readings: the claim\'s tech, then the PM', () => {
  assert.deepStrictEqual(AC.dryingWho(CLAIM_DRY, PROJECTS[1]), ['Mo Mit', 'Pat PM']);
});

console.log('AUTOCLAIMS — 11. supplement tracker');
const CLAIM_S = { id: 'C3', projectId: 'P1', claimNumber: 'CLM-555-0001', insured: 'Test Owner', carrier: 'Acme Mutual Test',
  estimates: [{ id: 'v1', version: 1, side: 'carrier', source: 'pdf', lines: [{ desc: 'Remove & replace laminated comp shingles', qty: 30, unit: 'SQ' }, { desc: 'Drip edge', qty: 200, unit: 'LF' }, { desc: 'Replace sheathing - plywood 1/2"', qty: 64, unit: 'SF' }] }],
  notes: [{ id: 'n1', text: '#supplement Found 3 rotted rafter tails 12 LF on the north side', at: '2026-11-04T15:00:00Z', by: 'Pat PM' }, { id: 'n2', text: 'Regular note' }, { id: 'n3', text: 'Drip edge #supplement', at: '2026-11-05T15:00:00Z' }],
  suppMarks: [{ id: 'm1', desc: 'Starter strip — eaves', what: 'Not on the estimate', qty: 180, unit: 'LF' }],
  fieldSupp: { items: [{ id: 'f1', item: 'Ice & water shield in valleys', reason: 'Code (IRC R905)', qty: 2, unit: 'SQ' }], marks: { 'co:co2': { include: false } } } };
const COS = [{ id: 'co1', pid: 'P1', desc: 'Replace rotted decking', amt: 640, status: 'Approved', reason: 'Found at tear-off' }, { id: 'co2', pid: 'P1', desc: 'Upgrade to designer shingles', amt: 900, status: 'Signed', ownerPay: true },
  { id: 'co3', pid: 'P1', desc: 'Add gutter guards', amt: 300, status: 'Signed' }, { id: 'co4', pid: 'P1', desc: 'Void one', status: 'Void' }, { id: 'co5', pid: 'P2', desc: 'Other job', status: 'Signed' }];
const PHOTOS = [{ id: 'ph1', jobId: 'P1', tags: ['Before', 'supplement'], caption: 'Soft decking at the ridge' }, { id: 'ph2', jobId: 'P1', tags: ['After'] }, { id: 'ph3', jobId: 'P1', note: 'chimney cricket #supplement' }];
const items = AC.suppCollect({ claim: CLAIM_S, project: PROJECTS[0], changeOrders: COS, photos: PHOTOS });
await T('collects field items, change orders, tagged notes and photos; the customer\'s upgrade, voids and other jobs stay out', () => {
  const keys = items.map(x => x.key);
  ['f:f1', 'm:m1', 'co:co1', 'co:co3', 'n:n1', 'n:n3', 'ph:ph1', 'ph:ph3'].forEach(k => assert.ok(keys.includes(k), 'missing ' + k));
  ['co:co2', 'co:co4', 'co:co5', 'n:n2', 'ph:ph2'].forEach(k => assert.ok(!keys.includes(k), 'should not have ' + k));
});
await T('what is already on the Xactimate (carrier) estimate is found and left unticked', () => {
  const de = items.find(x => x.key === 'n:n3'); assert.strictEqual(de.onEstimate, true); assert.strictEqual(de.include, false);
  assert.strictEqual(items.find(x => x.key === 'co:co1').onEstimate, false, 'decking ≠ sheathing words');
  assert.strictEqual(items.find(x => x.key === 'f:f1').include, true);
});
await T('a note\'s quantity and unit are read (12 LF); the PM\'s marks (untick / qty / reason) are kept', () => {
  const n1 = items.find(x => x.key === 'n:n1'); assert.strictEqual(n1.qty, 12); assert.strictEqual(n1.unit, 'LF'); assert.ok(!/#supplement/.test(n1.item));
  const c2 = JSON.parse(JSON.stringify(CLAIM_S)); c2.fieldSupp.marks['co:co3'] = { include: false }; c2.fieldSupp.marks['f:f1'] = { qty: 3, reason: 'Valleys + eaves' };
  const it2 = AC.suppCollect({ claim: c2, project: PROJECTS[0], changeOrders: COS, photos: PHOTOS });
  assert.strictEqual(it2.find(x => x.key === 'co:co3').include, false); assert.strictEqual(it2.find(x => x.key === 'f:f1').qty, 3); assert.strictEqual(it2.find(x => x.key === 'f:f1').reason, 'Valleys + eaves');
});
await T('CSV for the adjuster: only included items, quoted, no formula injection', () => {
  const evil = AC.suppCollect({ claim: { id: 'x', projectId: 'P1', fieldSupp: { items: [{ id: 'e', item: '=HYPERLINK("x")', reason: 'a, "b"' }] } } });
  const csv = AC.suppCsv(items.concat(evil), { claimNumber: 'CLM-555-0001', insured: 'Test Owner' });
  const lines = csv.trim().split(/\r\n/);
  assert.ok(/^# Supplement request — claim CLM-555-0001/.test(lines[0])); assert.strictEqual(lines[1], 'Item,Reason,Qty,Unit,Photos,Source,Date');
  assert.strictEqual(lines.length, 2 + items.filter(x => x.include).length + 1);
  assert.ok(!/Drip edge/.test(csv), 'unticked item is not exported');
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"') || csv.includes("'=HYPERLINK"), 'formula neutralised'); assert.ok(csv.includes('"a, ""b"""'));
});
await T('the carrier lines: the newest carrier version', () => {
  const c = { estimates: [{ id: 'a', version: 1, side: 'carrier', lines: [{ desc: 'old' }] }, { id: 'b', version: 2, side: 'carrier', lines: [{ desc: 'new' }] }, { id: 'g', version: 3, side: 'grayco', lines: [{ desc: 'ours' }] }] };
  assert.deepStrictEqual(AC.carrierLines(c).map(l => l.desc), ['new']);
});

console.log('AUTOCLAIMS — 12. claim status nudges');
const NOW = Date.parse('2026-11-10T15:00:00Z');
const CLAIM_N = { id: 'C4', projectId: 'P1', phase: 'Submitted to carrier', claimNumber: 'CLM-555-0002', insured: 'Test Owner', carrier: 'Acme Mutual Test', address: '1 Elm St',
  adjuster: { name: 'Alex Adjuster', email: 'alex.adjuster@example.com', company: 'Test Adjusting Co' }, createdAt: '2026-10-20T15:00:00Z',
  phaseHistory: [{ phase: 'New loss', at: '2026-10-20T15:00:00Z' }, { phase: 'Submitted to carrier', at: '2026-11-03T15:00:00Z' }],
  notes: [{ id: 'x1', internal: true, text: 'internal', at: '2026-11-09T15:00:00Z' }] };
await T('quiet 7 days (internal notes do not count) → due; 4 days → not yet; configurable', () => {
  const d = AC.nudgeDue(CLAIM_N, NOW, { days: 5 }); assert.strictEqual(d.due, true); assert.strictEqual(d.days, 7);
  assert.strictEqual(AC.nudgeDue(CLAIM_N, NOW, { days: 8 }).due, false);
  const c2 = JSON.parse(JSON.stringify(CLAIM_N)); c2.notes.push({ id: 'in1', text: 'Adjuster replied', at: '2026-11-06T15:00:00Z', dir: 'in' });
  assert.strictEqual(AC.nudgeDue(c2, NOW, { days: 5 }).due, false);
});
await T('a status change, a follow-up or the last nudge restarts the clock', () => {
  const c2 = JSON.parse(JSON.stringify(CLAIM_N)); c2.phaseHistory.push({ phase: 'Approved', at: '2026-11-08T15:00:00Z' }); c2.phase = 'Approved';
  assert.strictEqual(AC.nudgeDue(c2, NOW, {}).due, false);
  assert.strictEqual(AC.nudgeDue(CLAIM_N, NOW, { lastNudge: '2026-11-07T14:00:00Z' }).due, false);
  assert.strictEqual(AC.nudgeDue(Object.assign({}, CLAIM_N, { followups: [{ at: '2026-11-09T15:00:00Z' }] }), NOW, {}).due, false);
});
await T('never: closed / new loss, no adjuster e-mail, history, switched off', () => {
  assert.strictEqual(AC.nudgeDue(Object.assign({}, CLAIM_N, { phase: 'Closed' }), NOW, {}).due, false);
  assert.strictEqual(AC.nudgeDue(Object.assign({}, CLAIM_N, { phase: 'New loss' }), NOW, {}).due, false);
  assert.strictEqual(AC.nudgeDue(Object.assign({}, CLAIM_N, { adjuster: { name: 'x' } }), NOW, {}).why, 'no adjuster e-mail on the claim');
  assert.strictEqual(AC.nudgeDue(Object.assign({}, CLAIM_N, { importedHistory: true }), NOW, {}).due, false);
  assert.strictEqual(AC.nudgeDue(Object.assign({}, CLAIM_N, { autoNudge: false }), NOW, {}).due, false);
});
await T('the draft: polite, to the adjuster, the claim # and the PM\'s name; HTML escaped', () => {
  const d = AC.nudgeDraft(Object.assign({}, CLAIM_N, { insured: 'Test <Owner>' }), PROJECTS[0], { name: 'Pat PM', phone: '901-555-0003' }, { days: 7 });
  assert.strictEqual(d.to, 'alex.adjuster@example.com'); assert.ok(/^Hi Alex,/.test(d.text)); assert.ok(/7 days/.test(d.text)); assert.ok(/your review of our estimate/.test(d.text));
  assert.ok(/claim #CLM-555-0002/.test(d.subject)); assert.ok(/Pat PM/.test(d.text)); assert.ok(d.html.includes('Test &lt;Owner&gt;')); assert.ok(!/<Owner>/.test(d.html));
});
await T('the carrier never reaches the homeowner: carrierWords + scrubCarrier', () => {
  const w = AC.carrierWords(CLAIM_N, { carrier: 'Acme Mutual Test' });
  assert.ok(w.includes('Acme Mutual Test') && w.includes('Test Adjusting Co'));
  assert.strictEqual(AC.scrubCarrier('Acme Mutual Test (via Test Adjusting Co) approved it', w), 'your insurance company (via your insurance company) approved it');
});

console.log('AUTOCLAIMS — the scheduled function (claims-auto.js, mocked)');
process.env.RESEND_API_KEY = 're_test_key';
const CA = require(path.join(FN, 'claims-auto.js'));
function rig(o){
  o = o || {};
  const kv = Object.assign({ gc_office_tasks: [], gc_claims_auto: [], gc_approval_queue: [] }, o.kv || {});
  const mails = [], pushes = [], queued = [];
  let t = o.now;
  Object.assign(CA._test.D, {
    now: () => t,
    crm: async () => ({ projects: PROJECTS, users: USERS, gc_claims: o.claims || [] }),
    kv: async keys => { const r = {}; keys.forEach(k => { r[k] = kv[k]; }); return r; },
    listRead: async k => ({ list: JSON.parse(JSON.stringify(kv[k] || [])) }),
    listUpdate: async (k, fn) => { const m = fn(JSON.parse(JSON.stringify(kv[k] || []))); if (m && m.list) kv[k] = m.list; return { ok: true }; },
    queue: async q => { queued.push(q); kv.gc_approval_queue = (kv.gc_approval_queue || []).concat([Object.assign({ status: 'waiting', createdAt: new Date(t).toISOString() }, q)]); return true; },
    aqKey: () => 'gc_approval_queue',
    findProject: (d, id) => PROJECTS.find(p => p.id === id) || null,
    pmOf: (d, p) => { const u = USERS.find(x => x.name === p.pm); return u ? { name: u.name, email: u.email } : null; },
    admins: () => ['wjohnson@grayco-cs.com'],
    push: async (to, p) => { pushes.push({ to, p }); return { sent: 1 }; },
    paused: async () => !!o.paused,
    mail: async m => { mails.push(m); return { ok: true }; }
  });
  return { kv, mails, pushes, queued, set: v => { t = v; } };
}
const AT7 = Date.parse('2026-11-10T13:05:00Z');   /* 7:05 AM Central (CST) */
const AT9 = Date.parse('2026-11-10T15:05:00Z');   /* 9:05 AM Central, a Tuesday */
await T('inspections at 7 AM: tomorrow → PM e-mail + push; no answer → "Did it pass?"; failed → one fix To-Do; once only', async () => {
  const r = rig({ now: AT7, kv: { gc_sitebook: SITEBOOK, gc_job_inspections: JOBINS } });
  const rep = await CA._test.runInspections({});
  assert.strictEqual(rep.remind, 1); assert.strictEqual(rep.ask, 2); assert.strictEqual(rep.fix, 1);
  assert.ok(r.mails.some(m => /Tomorrow: Final inspection/.test(m.subject) && m.to.includes('pat@grayco-cs.com')));
  assert.ok(r.mails.some(m => /Did it pass\? Framing/.test(m.subject)));
  assert.ok(r.mails.every(m => m.to.every(e => /@grayco-cs\.com$/.test(e))), 'staff only');
  const fx = r.kv.gc_office_tasks.filter(x => x.kind === 'insp_fix'); assert.strictEqual(fx.length, 1); assert.deepStrictEqual(fx[0].assignees, ['pat@grayco-cs.com']);
  const again = await CA._test.runInspections({}); assert.strictEqual(again.remind + again.ask + again.fix, 0);
  assert.strictEqual(r.kv.gc_office_tasks.length, 1);
  r.set(Date.parse('2026-11-10T18:00:00Z')); assert.ok((await CA._test.runInspections({})).notNow, 'only at 7 AM');
});
await T('the fix To-Do the CRM already made (same id) is never made twice', async () => {
  const i = AC.inspections({ sitebook: SITEBOOK }).find(x => x.id === 'I3');
  const r = rig({ now: AT7, kv: { gc_sitebook: SITEBOOK, gc_office_tasks: [Object.assign(AC.fixTodo(i, PROJECTS[0], 'pat@grayco-cs.com', '2026-11-05'), { done: true })] } });
  const rep = await CA._test.runInspections({}); assert.strictEqual(rep.fix, 0); assert.strictEqual(r.kv.gc_office_tasks.length, 1);
});
await T('drying at 7 AM: yesterday missed → the tech + PM told once; a claim marked complete is left alone', async () => {
  const c = JSON.parse(JSON.stringify(CLAIM_DRY)); c.moisture = c.moisture.filter(x => x.date !== '2026-11-09');
  const done = Object.assign({}, CLAIM_DRY, { id: 'C5', drying: { completeAt: '2026-11-09T12:00:00Z' } });
  const r = rig({ now: AT7, claims: [c, done] });
  const rep = await CA._test.runDrying({}); assert.strictEqual(rep.active, 1); assert.strictEqual(rep.told, 1);
  assert.deepStrictEqual(r.mails[0].to.slice().sort(), ['mo@grayco-cs.com', 'pat@grayco-cs.com']);
  assert.strictEqual((await CA._test.runDrying({})).told, 0);
});
await T('nudges at 9 AM: one draft in Approvals for the PM, to the adjuster, never sent; no second while one waits', async () => {
  const r = rig({ now: AT9, claims: [CLAIM_N, Object.assign({}, CLAIM_N, { id: 'C6', phase: 'Closed' })], kv: { gc_integration_settings: { ins4: { nudgeDays: 5 } } } });
  const rep = await CA._test.runNudges({});
  assert.strictEqual(rep.queued, 1); const q = r.queued[0];
  assert.strictEqual(q.kind, 'claim_nudge'); assert.strictEqual(q.to, 'alex.adjuster@example.com'); assert.strictEqual(q.pm.email, 'pat@grayco-cs.com'); assert.strictEqual(q.meta.claimId, 'C4');
  assert.strictEqual(r.mails.length, 0, 'nothing e-mailed by the run itself');
  r.set(AT9 + 864e5); const rep2 = await CA._test.runNudges({}); assert.strictEqual(rep2.queued, 0); assert.strictEqual(rep2.waiting, 1);
});
await T('nudges: the setting is used (10 days → not yet), a rejected draft restarts the clock, data-entry mode queues nothing, weekends off', async () => {
  let r = rig({ now: AT9, claims: [CLAIM_N], kv: { gc_integration_settings: { ins4: { nudgeDays: 10 } } } });
  assert.strictEqual((await CA._test.runNudges({})).queued, 0);
  r = rig({ now: AT9, claims: [CLAIM_N], kv: { gc_approval_queue: [{ id: 'q0', kind: 'claim_nudge', status: 'rejected', rejectedAt: '2026-11-08T15:00:00Z', meta: { claimId: 'C4' } }] } });
  assert.strictEqual((await CA._test.runNudges({})).queued, 0);
  r = rig({ now: AT9, claims: [CLAIM_N], paused: true }); const p = await CA._test.runNudges({}); assert.strictEqual(p.paused, true); assert.strictEqual(r.queued.length, 0);
  r = rig({ now: Date.parse('2026-11-08T15:05:00Z'), claims: [CLAIM_N] }); assert.ok((await CA._test.runNudges({})).notNow, 'Sunday');
});
await T('the handler refuses a non-admin call (no token)', async () => {
  const res = await require(path.join(FN, 'claims-auto.js')).handler({ httpMethod: 'POST', body: '{}', headers: {} });
  assert.strictEqual(res.statusCode, 403);
});

console.log('AUTOCLAIMS — the morning digest (plan.js) and the approval send (portal.js)');
await T('Today\'s plan: Day N + missed days for the tech / mitigation, inspections today / tomorrow / to answer for the PM', () => {
  const b = PLAN.build({ projects: PROJECTS, users: USERS, staff: [], gc_claims: [CLAIM_DRY], gc_sitebook: SITEBOOK, gc_job_inspections: JOBINS }, { now: Date.parse('2026-11-10T08:00:00Z'), day: TODAY, owners: [] });
  const pat = b.plans['pat@grayco-cs.com'].items.map(x => x.label), mo = b.plans['mo@grayco-cs.com'].items.map(x => x.label);
  assert.ok(mo.some(l => /Take moisture readings \+ photos \(Day 5\)/.test(l)), mo.join(' | '));
  assert.ok(mo.some(l => /1 drying day with no readings/.test(l)));
  assert.ok(pat.some(l => /Inspection today: Insulation/.test(l)), pat.join(' | '));
  assert.ok(pat.some(l => /Inspection tomorrow: Final/.test(l)));
  assert.ok(pat.some(l => /Passed \/ Failed \/ Rescheduled\? Framing/.test(l)));
  assert.ok(!pat.concat(mo).some(l => /Acme/.test(l)));
});
await T('an approved adjuster nudge goes From / Reply-To claims@, to the adjuster only', async () => {
  const P = require(path.join(FN, 'portal.js'));
  const realFetch = global.fetch; const calls = [];
  global.fetch = async (u, o) => { calls.push({ u: String(u), o }); return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; };
  try {
    const send = P._core.claimNudgeSend; const src0 = require('fs').readFileSync(path.join(FN, 'portal.js'), 'utf8'); assert.ok(/if \(item\.kind === 'claim_nudge'\) return claimNudgeSend\(item\);/.test(src0), 'aqSend routes claim_nudge');
    if (typeof send !== 'function') { console.log('     (aqSend not exported — checking the source instead)'); const src = require('fs').readFileSync(path.join(FN, 'portal.js'), 'utf8'); assert.ok(/if \(item\.kind === 'claim_nudge'\) return claimNudgeSend\(item\);/.test(src)); return; }
    const r = await send({ id: 'q1', kind: 'claim_nudge', to: 'alex.adjuster@example.com', subject: 'Following up — claim #CLM-555-0002', html: '<p>Hi</p>', pm: 'Pat PM', pmEmail: 'pat@grayco-cs.com' }, new Date().toISOString());
    assert.strictEqual(r.ok, true);
    const m = calls.find(c => /api\.resend\.com\/emails/.test(c.u)); assert.ok(m, 'resend called');
    const body = JSON.parse(m.o.body); assert.deepStrictEqual(body.to, ['alex.adjuster@example.com']); assert.ok(/claims@grayco-cs\.com/.test(body.from)); assert.strictEqual(body.reply_to, 'claims@grayco-cs.com');
  } finally { global.fetch = realFetch; }
});

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
})();
