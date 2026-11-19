// test_PORTALPOL_fn.mjs <build-dir> — patch PORTALPOL (owner 11/19), the server side. Node only, the offline custportal world
// (in-memory Supabase / Resend; nothing leaves the machine; made-up data).
//   1. Insurance info: the customer's own carrier, claim number and adjuster reach the customer (job.insurance in the project
//      details, the claim box company, the claim-help box); a TPA / adjusting company still reads "your insurance company";
//      the portal editor's text keeps the carrier (no rewrite); e-mail scrubbing (insWords) is unchanged.
//   2. Plans / documents staff put in the portal (portal editor pped_, 🏠 Portal card pdoc_, a hand switch-on portalLive) are live
//      at once — no gate item, no e-mail; an estimate's paper and a paper rejected after it was shared are not.
//   3. Questions: s-send question → "❓ …"; c-jobs counts it (questions); the customer's answer tells the job's PM (staff
//      notifier, link to the portal editor) and e-mails / texts nobody; jobmsgnotify uses the given head / link.
//   4. One-time portal links for ACTIVE jobs (nothing sent, logged, Undo turns off only those).
//   5. Go-live (2027-01-01 00:00 Chicago): announcement the day before (staff, CRM only), then portals for OPEN jobs, data-entry
//      mode OFF, the SWITCH automations ON — once; change date / cancel (admins only); automations.js op golive.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const W = await import(path.join(build, 'tools/tests/custportal_world.mjs'));
const FN = path.join(build, 'netlify/functions');
const S = W.S;
W.seedSample({ photos: 4, crmDocs: false }); W.resetCaches();
const ADM = { Authorization: 'Bearer good-admin' }, PM = { Authorization: 'Bearer good-pm' };
const TOK = { 'x-portal-token': S.link };

console.log('1. insurance info in the portal');
{
  let r = await W.handlerCall('portal', { action: 'view' }, TOK);
  let v = r.data;
  ok(r.status === 200 && v.job && v.job.insurance && v.job.insurance.carrier === S.carrier, 'a job with a carrier (not a claim job): job.insurance names the customer\'s insurance company', v.job && v.job.insurance);
  const jobs = W.get('projects'), j = jobs.find(x => x.id === S.pid);
  Object.assign(j, { isInsurance: true, claimNumber: 'CLM-55-0192', adjusterName: 'Pat Adjuster', adjusterPhone: '901-555-0177', portalSummary: { text: S.carrier + ' approved the roof.' } });
  W.put('projects', jobs);
  W.put('gc_claims', [{ id: 'CL1', projectId: S.pid, carrier: S.carrier, claimNumber: 'CLM-55-0192', program: 'Sample TPA Services', adjuster: { name: 'Pat Adjuster', phone: '901-555-0177', company: 'Sample Adjusting Co' }, dateOfLoss: '2026-09-30' }]);
  W.resetCaches();
  r = await W.handlerCall('portal', { action: 'view' }, TOK); v = r.data; const vj = JSON.stringify(v);
  ok(v.insurance && v.insurance.claim && v.insurance.claim.company === S.carrier && v.insurance.claim.companyShown === true, 'claim job: the claim box names the carrier', v.insurance && v.insurance.claim);
  ok(v.insurance.claim.number === 'CLM-55-0192' && v.insurance.claim.adjuster && v.insurance.claim.adjuster.name === 'Pat Adjuster', 'claim number and adjuster are there', v.insurance.claim);
  ok(v.job.insurance && v.job.insurance.claimNumber === 'CLM-55-0192' && v.job.insurance.adjuster && v.job.insurance.adjuster.phone === '901-555-0177', 'job.insurance: carrier, claim number, adjuster', v.job.insurance);
  ok(/Sample Mutual Insurance approved the roof/.test(v.job.summary || ''), 'what staff typed keeps the carrier name (no "your insurance company" rewrite)', v.job.summary);
  ok(!/Sample TPA Services|Sample Adjusting Co/.test(vj), 'a TPA / adjusting company is still not shown to the customer');
  ok(!v.claimHelp || (v.claimHelp.claim && v.claimHelp.claim.company === S.carrier), 'the claim-help box (when on) names the carrier too', v.claimHelp && v.claimHelp.claim);
  const C = require(FN + '/portal.js')._core, p = W.get('projects').find(x => x.id === S.pid), d = { gc_claims: W.get('gc_claims') };
  ok(C.insWords(d, p).some(w => w === S.carrier) && !C.portalInsWords(d, p).some(w => w === S.carrier) && C.portalInsWords(d, p).includes('Sample TPA Services'), 'e-mail scrubbing (insWords) unchanged; the portal\'s list drops only the customer\'s own carrier', C.portalInsWords(d, p));
  const j2 = W.get('projects'); const jj = j2.find(x => x.id === S.pid); jj.portalShowAdjuster = false; W.put('projects', j2); W.resetCaches();
  r = await W.handlerCall('portal', { action: 'view' }, TOK);
  ok(!r.data.job.insurance.adjuster && !r.data.insurance.claim.adjuster && r.data.job.insurance.carrier === S.carrier, 'the job\'s "hide adjuster" switch still hides the adjuster', r.data.job.insurance);
}

console.log('2. staff papers go live at once');
{
  const docs = W.get('projectDocs');
  const ref = n => W.storeFile(W.pdfOf(n, ['x']), 'pdf', 'application/pdf');
  docs.push(
    { id: 'pped_live1', pid: S.pid, name: 'Kitchen plans A.pdf', cat: 'Plans', ref: ref('A'), type: 'application/pdf', portalShare: true, portalLive: true, portalLiveAt: '2026-11-19T15:00:00.000Z', source: 'portal-editor', uploadedAt: '2026-11-19T15:00:00.000Z' },
    { id: 'pdoc_live2', pid: S.pid, name: 'Deck drawing B.pdf', cat: 'Customer portal', ref: ref('B'), type: 'application/pdf', portalShare: true, portalLive: true, portalLiveAt: '2026-11-19T15:00:00.000Z', source: 'portal-card', uploadedAt: '2026-11-19T15:00:00.000Z' },
    { id: 'doc_toggled3', pid: S.pid, name: 'Fence layout C.pdf', cat: 'Plans', ref: ref('C'), type: 'application/pdf', portalShare: true, portalLive: true, portalLiveAt: '2026-11-19T15:00:00.000Z', uploadedAt: '2026-11-18T15:00:00.000Z' },
    { id: 'doc_plain4', pid: S.pid, name: 'Office upload D.pdf', cat: 'Plans', ref: ref('D'), type: 'application/pdf', portalShare: true, uploadedAt: '2026-11-19T15:00:00.000Z' },
    { id: 'doc_est5', pid: S.pid, name: 'Estimate E.pdf', cat: 'Estimates', ref: ref('E'), type: 'application/pdf', portalShare: true, portalLive: true, estimateId: 'E_NOT_SHOWN', uploadedAt: '2026-11-19T15:00:00.000Z' },
    { id: 'pped_rej6', pid: S.pid, name: 'Rejected F.pdf', cat: 'Plans', ref: ref('F'), type: 'application/pdf', portalShare: true, portalLive: true, portalLiveAt: '2026-11-10T15:00:00.000Z', source: 'portal-editor', uploadedAt: '2026-11-10T15:00:00.000Z' });
  W.put('projectDocs', docs);
  const gl = W.get('gc_portal_gate') || []; W.put('gc_portal_gate', (Array.isArray(gl) ? gl : []).concat([{ id: 'd:pped_rej6', pid: S.pid, type: 'd', title: 'Rejected F', st: 'rejected', at: '2026-11-11T10:00:00.000Z', decidedAt: '2026-11-11T10:00:00.000Z' }]));
  W.resetCaches();
  const mails0 = W.RESEND.length;
  let r = await W.handlerCall('portal', { action: 'view' }, TOK);
  const titles = (r.data.docs || []).map(d => d.title);
  ok(['Kitchen plans A.pdf', 'Deck drawing B.pdf', 'Fence layout C.pdf'].every(t => titles.includes(t)), 'portal-editor / 🏠 Portal card uploads and a hand switch-on are in the customer\'s Documents at once', titles);
  ok(!titles.includes('Office upload D.pdf') && !titles.includes('Estimate E.pdf') && !titles.includes('Rejected F.pdf'), 'a paper the office filed by itself, an estimate\'s paper and one rejected after sharing are not', titles);
  r = await W.handlerCall('portal', { action: 'gate', op: 'scan', projectId: S.pid }, ADM);
  r = await W.handlerCall('portal', { action: 'gate', op: 'state', projectId: S.pid }, ADM);
  const keys = (r.data.items || []).map(x => x.key);
  ok(!keys.includes('d:pped_live1') && !keys.includes('d:pdoc_live2') && !keys.includes('d:doc_toggled3') && keys.includes('d:doc_plain4'), 'no "Put in the customer portal" approval for the staff papers (the office\'s own file still waits)', keys);
  ok(W.RESEND.length === mails0, 'nothing was e-mailed');
  const C = require(FN + '/portal.js')._core;
  ok(C.staffLiveDoc('d:x', { id: 'pped_1', portalShare: true }) && !C.staffLiveDoc('d:x', { id: 'pped_1', portalShare: false }) && !C.staffLiveDoc('d:x', { id: 'x', portalShare: true, portalLive: true, internal: true }) && !C.staffLiveDoc('d:x', { id: 'x', portalShare: true, portalLive: true, source: 'estin' }), 'staffLiveDoc: shared + staff-made only; never hidden, internal or an estimate paper');
}

console.log('3. questions in the portal');
{
  const PA = require(FN + '/portal-access.js');
  const calls = []; PA._portalpol.CMN.run = async (who, b) => { calls.push({ who, b }); return { ok: true, to: [{ email: S.pm.email }] }; };
  let r = await W.handlerCall('portal-access', { action: 's-send', projectId: S.pid, party: 'c', text: 'Do you want the gutters white or bronze?', question: true }, PM);
  const last = W.TABLES.gc_portal_msg.slice(-1)[0];
  ok(r.status === 200 && r.data.ok && /^❓ Do you want the gutters/.test(last.text) && last.side === 'gc', 'the portal editor\'s question is stored with ❓', last);
  r = await W.handlerCall('portal-access', { action: 'c-jobs' }, TOK);
  const jq = (r.data.jobs || [])[0] || {};
  ok(r.status === 200 && jq.questions === 1 && jq.unread >= 1, 'c-jobs: 1 new question (and the unread count)', r.data);
  const mails0 = W.RESEND.length, calls0 = W.CALLS.length;
  r = await W.handlerCall('portal-access', { action: 'c-send', projectId: S.pid, text: 'White please.' }, TOK);
  ok(r.status === 200 && r.data.ok && r.data.pmTold === true, 'the customer answers in the portal', r.data);
  const c = calls[0] || { b: {} };
  ok(calls.length === 1 && c.b.pid === S.pid && /White please/.test(c.b.text) && /\(customer portal\)/.test(c.b.head) && /\/\?portaled=PSAMPLE1$/.test(c.b.link), 'the job\'s PM is told (staff notifier: head names the customer, link opens the portal editor)', c.b);
  ok(W.RESEND.length === mails0 && !W.CALLS.slice(calls0).some(x => /twilio|resend/i.test(x)), 'no e-mail or text to the customer');
  r = await W.handlerCall('portal-access', { action: 'c-send', projectId: S.pid, text: 'preview', preview: true }, TOK);
  ok(r.status === 400 && calls.length === 1, 'a staff preview cannot send (and tells nobody)', r.status);
  /* jobmsgnotify: the given head / link (the CRM's own address only) */
  const J = require(FN + '/_lib/jobmsgnotify.js'), pushes = [], texts = [];
  Object.assign(J._D, { data: async () => ({ users: [{ name: S.pm.name, email: S.pm.email, role: 'Project Manager' }, { name: 'Avery Admin', email: 'admin.sample@grayco-cs.com', role: 'Admin' }], projects: [{ id: S.pid, name: 'Sample Roof', pm: S.pm.name }] }),
    away: async () => ({}), quiet: async () => false, push: async (to, p) => { pushes.push({ to, p }); return { to }; }, text: async o => { texts.push(o); return { to: o.only }; }, stateCas: async f => f({}) });
  const o = await J.run({ email: 'customer@portal.invalid', name: 'Sample' }, { pid: S.pid, msgId: 'M1', text: '💬 Portal: White please.', head: 'Sample (customer portal) on Sample Roof', link: 'https://crm.grayco-cs.com/?portaled=' + S.pid });
  ok(o.ok && o.to.length === 1 && o.to[0].email === S.pm.email && pushes[0] && /Sample \(customer portal\)/.test(pushes[0].p.title) && pushes[0].p.url === 'https://crm.grayco-cs.com/?portaled=' + S.pid, 'jobmsgnotify: the PM gets the push with the customer\'s head and the portal-editor link', { o, p: pushes[0] });
  const o2 = await J.run({ email: 'customer@portal.invalid', name: 'Sample' }, { pid: S.pid, msgId: 'M2', text: 'x', link: 'https://evil.example/?x' });
  ok(pushes[1] && /\/\?jobmsg=/.test(pushes[1].p.url), 'a link that is not the CRM\'s own is ignored', pushes[1] && pushes[1].p.url);
}

console.log('4. portal links for active jobs (once, nothing sent, Undo)');
const G = require(FN + '/_lib/golive.js');
{
  W.put('projects', [
    { id: 'A1', name: 'Active one', status: 'In Progress', client: 'A Person' },
    { id: 'A2', name: 'Active with link', status: 'Active' },
    { id: 'A3', name: 'Started 40%', status: '', pct: 40 },
    { id: 'B1', name: 'Bidding', status: 'Bidding' },
    { id: 'L1', name: 'Lead', status: 'Lead' },
    { id: 'C1', name: 'Complete', status: 'Complete' },
    { id: 'H1', name: 'History', status: 'Active', importedHistory: true },
    { id: 'D1', name: 'Deleted', status: 'Active' },
    { id: 'X1', name: 'Lost', status: 'Lost' }]);
  W.put('gc_deleted_projects', ['D1']);
  W.TABLES.gc_portal.push({ token: W.tok(), project_id: 'A2', revoked: false, created_by: 'someone', created_at: '2026-11-01T00:00:00Z' });
  W.put(G.KEY, {});
  W.setAt('2026-11-20T18:00:00Z'); W.resetCaches();
  const mails0 = W.RESEND.length;
  const t1 = await G.tick();
  const made = W.TABLES.gc_portal.filter(x => x.created_by === G.BACKFILL_TAG && !x.revoked).map(x => x.project_id).sort();
  ok(made.join() === 'A1,A3', 'links made for the ACTIVE jobs with none (A1, A3) — not bidding / lead / complete / history / deleted / lost / one that has a link', { made, t1 });
  ok(W.RESEND.length === mails0 && !W.CALLS.some(x => /twilio|resend/i.test(x)), 'nothing sent');
  const st = W.get(G.KEY);
  ok(st.backfill && st.backfill.state === 'done' && st.backfill.n === 2 && (st.log || []).some(x => /Portal links made for 2 active jobs/.test(x.what)), 'logged', st.backfill);
  await G.tick();
  ok(W.TABLES.gc_portal.filter(x => x.created_by === G.BACKFILL_TAG).length === 2, 'once: the next run makes no more');
  let r = await W.handlerCall('automations', { op: 'golive', sub: 'undo-backfill' }, PM);
  ok(r.status === 403, 'Undo: not for a PM (admins only)', r.status);
  r = await W.handlerCall('automations', { op: 'golive', sub: 'undo-backfill' }, ADM);
  ok(r.status === 200 && r.data.backfill.state === 'undone' && r.data.backfill.undone === 2, 'Undo (admin) turns off exactly those links', r.data.backfill);
  ok(W.TABLES.gc_portal.filter(x => x.created_by === G.BACKFILL_TAG).every(x => x.revoked) && W.TABLES.gc_portal.some(x => x.project_id === 'A2' && !x.revoked) && W.TABLES.gc_portal.some(x => x.token === S.link && !x.revoked), 'other links untouched');
  await G.tick();
  ok(W.TABLES.gc_portal.filter(x => x.created_by === G.BACKFILL_TAG && !x.revoked).length === 0, 'undone stays undone (no re-make)');
}

console.log('5. the Jan 1 go-live');
{
  ok(G.midnightUtc('2027-01-01') === '2027-01-01T06:00:00.000Z' && G.planOf({}).date === '2027-01-01' && G.planOf({}).at === '2027-01-01T06:00:00.000Z', 'default plan: 2027-01-01 00:00 America/Chicago (06:00 UTC)', G.planOf({}));
  let r = await W.handlerCall('automations', { op: 'golive', sub: 'view' }, PM);
  ok(r.status === 200 && r.data.plan.date === '2027-01-01' && r.data.keys.length === G.SWITCH.length && r.data.keys.some(k => k.key === 'lead_customer_autotext') && r.data.admin === false, 'view (any staff): date, the switch list (lead_customer_autotext …), not admin', r.data.plan);
  ok(/Jan 3/.test(r.data.replaces), 'it says it replaces the Jan 3 plan', r.data.replaces);
  r = await W.handlerCall('automations', { op: 'golive', sub: 'date', date: '2027-01-05' }, PM);
  ok(r.status === 403, 'a PM cannot change the date', r.status);
  r = await W.handlerCall('automations', { op: 'golive', sub: 'date', date: '2026-01-05' }, ADM);
  ok(r.status === 400, 'a date in the past is refused', r.data);
  r = await W.handlerCall('automations', { op: 'golive', sub: 'cancel' }, ADM);
  ok(r.status === 200 && r.data.plan.cancelled === true, 'admin cancels', r.data.plan);
  W.put('gc_automation_pause', { on: true, since: '2026-11-04T12:00:00Z', at: '2026-11-04T12:00:00Z', by: 'admin' });
  W.put('gc_automations', { _log: [] });
  W.put('users', [{ id: 'u1', name: 'Avery Admin', email: 'admin.sample@grayco-cs.com', role: 'Admin' }, { id: 'u2', name: S.pm.name, email: S.pm.email, role: 'Project Manager' }, { id: 'u3', name: 'Gone Guy', email: 'gone@grayco-cs.com', active: false }, { id: 'u4', name: 'A Sub', email: 'sub@example.com', role: 'Sub' }]);
  W.setAt('2027-01-01T07:00:00Z'); W.resetCaches();
  await G.tick();
  ok(W.get('gc_automation_pause').on === true && !W.TABLES.gc_portal.some(x => x.created_by === G.GOLIVE_TAG), 'cancelled: past the date nothing happens');
  W.setAt('2026-12-10T12:00:00Z');
  r = await W.handlerCall('automations', { op: 'golive', sub: 'resume' }, ADM);
  ok(r.status === 200 && r.data.plan.cancelled === false && r.data.plan.date === '2027-01-01', 'planned again for Jan 1', r.data.plan);
  await G.tick();
  ok(!(W.get('gc_adm_msgs') || []).some(m => m.source === 'golive'), 'Dec 10: no announcement yet');
  W.setAt('2026-12-31T07:00:00Z'); W.resetCaches();
  await G.tick(); await G.tick();
  const msgs = (W.get('gc_adm_msgs') || []).filter(m => m.source === 'golive');
  ok(msgs.length === 1 && msgs[0].channels.join() === 'crm' && msgs[0].recipients.map(x => x.email).sort().join() === ['admin.sample@grayco-cs.com', S.pm.email].sort().join() && /Go-live tomorrow/.test(msgs[0].text) && /data-entry mode OFF/.test(msgs[0].text), 'Dec 31 (the day before): ONE in-CRM announcement to active staff (no sub, no former staff)', msgs[0] && { r: msgs[0].recipients, t: msgs[0].text.slice(0, 160) });
  ok(W.get('gc_automation_pause').on === true, 'still in data-entry mode before midnight');
  const mails0 = W.RESEND.length;
  W.setAt('2027-01-01T06:04:00Z'); W.resetCaches();
  const out = await G.tick();
  const gl = W.TABLES.gc_portal.filter(x => x.created_by === G.GOLIVE_TAG).map(x => x.project_id).sort();
  ok(gl.join() === 'A1,A3,B1,L1', '00:04 Jan 1: links for every OPEN job with none (incl. bidding / lead), not complete / history / deleted / lost / one with a link', { gl, out });
  ok(W.get('gc_automation_pause').on === false && (W.get('gc_automation_pause_log') || [])[0].by === 'go-live', 'data-entry mode OFF (logged "go-live")', W.get('gc_automation_pause'));
  const A = require(FN + '/_lib/automations.js'), row = W.get('gc_automations');
  ok(G.SWITCH.every(k => A.valueOf(row, k) === true) && row._log.filter(x => x.op === 'golive').length === G.SWITCH.length, 'every SWITCH automation is ON, each logged', G.SWITCH.filter(k => !A.valueOf(row, k)));
  ok(['call_recording', 'mkt_autopilot', 'social_drafts', 'bid_result_emails', 'portal_gate_queue'].every(k => A.valueOf(row, k) === false), 'the others stay as they were (recording, marketing, GC bid e-mails, the gate queue)');
  ok(W.RESEND.length === mails0, 'the go-live itself sends nothing');
  const st = W.get(G.KEY);
  ok(st.golive.state === 'done' && st.golive.steps.portals && st.golive.steps.pause && st.golive.steps.auto, 'state done (portals → pause off → automations on)', st.golive);
  W.put('gc_automation_pause', { on: true, by: 'admin', at: '2027-01-02T00:00:00Z' });
  W.setAt('2027-01-02T12:00:00Z'); await G.tick();
  ok(W.get('gc_automation_pause').on === true, 'it runs once: a pause turned on later is not undone');
  r = await W.handlerCall('automations', { op: 'golive', sub: 'date', date: '2027-02-01' }, ADM);
  ok(r.status === 409, 'after it ran the date cannot be changed', r.data);
  W.setDay();
}
console.log(`PORTALPOL_fn ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
