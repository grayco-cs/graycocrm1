/* patch PLANREQ — node tools/tests/test_PLANREQ_fn.mjs [build dir]   (no browser; an in-memory Supabase + caught e-mail; made-up people and jobs)
   Owner 11/12: "on bid portal if I don't have plans have where sub can request plans or more info and it emails and messages the PM or estimator".
   · a sub's 📩 request → ONE e-mail to the job's PM + estimator (staff only — it goes while ⏸ data-entry mode is on), a 💬 Job Messages post
     naming them (notify list → 🔔 For you), a To-Do "📩 <Sub> asked for plans — <job>" with them as assignees
   · fallbacks: no PM / estimator → the poster → the Senior Estimator → office@
   · one open request per sub per job; a sub not approved / a job not open to them / a closed job → refused; an admin can't "request"
   · plans added (a 🔗 link via bid-hub op plans, a plan file, 📢 postjob) → the request closes, its To-Do is done, the sub gets a bid-site notice,
     the "Plans are now posted" e-mail is HELD while ⏸ is on and sent on a later look; a request on a job that already had plans is not closed by the sweep
   · bid-hub op planreq: ↩ Reply (notice + e-mail to the sub) / ✅ Mark sent; who may (admin / estimator / office / the job's PM — not other staff)
   · manageView lists the requests; jobsList counts open ones; a sub loads only their own (no other sub's name) */
import { createRequire } from 'module'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const FN = path.join(ROOT, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test' });
['PORTAL_MAIL_OFF', 'OWNER_EMAILS', 'SUBPORTAL_NOTIFY', 'PORTAL_AUTO_EMAIL'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.message ? e.message.slice(0, 600) : e); } }
const yes = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
const now = new Date().toISOString(), day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* ── the in-memory database ── */
const SP = new Map(), KV = { gc_office_tasks: '[]', gc_job_messages: '[]', gc_automation_pause: { on: false },
  users: [{ id: 'U_pm', name: 'Pat Planner', email: 'pplanner@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'U_est', name: 'Gus Estimator', email: 'gestimator@grayco-cs.com', role: 'Estimator', active: true },
    { id: 'U_o', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true }, { id: 'U_lpm', name: 'Lee Leadpm', email: 'lleadpm@grayco-cs.com', role: 'Project Manager', active: true }],
  projects: [{ id: 'P1', name: 'Sample Clinic', pm: 'Pat Planner' }], leads: [{ id: 'L1', name: 'Sample Lead', pm: 'Lee Leadpm', estimator: 'Gus Estimator' }] };
let KVAT = 0; const KVT = {};
let STAFF = [{ email: 'wjohnson@grayco-cs.com', name: 'Wes Owner', role: 'admin', active: true }, { email: 'pplanner@grayco-cs.com', name: 'Pat Planner', role: 'pm', active: true },
  { email: 'gestimator@grayco-cs.com', name: 'Gus Estimator', role: 'staff', profile: 'estimator', active: true }];
const MAIL = [];
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body), clone(){ return this; }, headers: { get: () => null } });
const dec = v => decodeURIComponent(String(v || ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(String(url)), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'm' + MAIL.length }); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/rest/v1/sp_rows') {
    if (m === 'POST') { JSON.parse(init.body).forEach(r => SP.set(r.key, Object.assign({}, SP.get(r.key) || {}, JSON.parse(JSON.stringify(r))))); return res(201, []); }
    let rows = [...SP.values()];
    for (const [k, v] of q.entries()) { if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dec(v.slice(3)));
      else if (v.startsWith('in.')) { const l = dec(v.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => l.includes(String(r[k]))); } }
    if (m === 'DELETE') { rows.forEach(r => SP.delete(r.key)); return res(204, ''); }
    return res(200, rows.sort((a, b) => a.key < b.key ? -1 : 1));
  }
  if (u.pathname === '/rest/v1/gc_kv' || u.pathname === '/rest/v1/gc_lead_inbox_kv') {
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return res(200, []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { KV[r.key] = r.value; KVT[r.key] = 'T' + (++KVAT); }); return res(201, []); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? dec(k.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [dec(k.replace(/^eq\./, ''))];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: KVT[x] || 'T0' })));
  }
  if (u.pathname === '/rest/v1/gc_staff') return res(200, STAFF);
  return res(200, []);   /* mail index, sent log … */
};
const SPM = require(path.join(FN, 'subportal.js')), HUBX = SPM._hub;
const BH = require(path.join(FN, 'bid-hub.js'))._test;
const PAUSE = require(path.join(FN, '_lib/pause.js'));
const setPause = on => { KV.gc_automation_pause = { on }; PAUSE.reset(); };
const kvList = k => { const v = KV[k]; return typeof v === 'string' ? JSON.parse(v) : v; };
const put = (c, d, extra) => SP.set(c + '/' + d.id, Object.assign({ key: c + '/' + d.id, collection: c, id: d.id, job_id: c === 'jobs' || c === 'plans' ? d.id : (d.jobId || null), user_id: d.userId || null, email: d.email || null, data: d }, extra || {}));
const row = k => SP.get(k) && SP.get(k).data;

/* made-up subs and jobs */
const SUB = { id: 'u_sam', role: 'sub', approved: true, email: 'sam@sampledrywall.test', name: 'Sam Sample', company: 'Sample Drywall LLC', phone: '901-555-0141', trades: ['Drywall'] };
const SUB2 = { id: 'u_otto', role: 'sub', approved: true, email: 'otto@otherpaint.test', name: 'Otto Other', company: 'Other Paint Co', phone: '901-555-0142', trades: ['Paint'], lang: 'es' };
const WAIT = { id: 'u_wes', role: 'sub', approved: false, email: 'wes@waitroof.test', name: 'Wes Wait', company: 'Waiting Roof Co' };
[SUB, SUB2, WAIT].forEach(u => put('users', u, { user_id: u.id, email: u.email }));
put('jobs', { id: 'j_noplans', title: 'Sample Clinic Remodel', address: '100 Sample Pkwy', status: 'open', visibility: 'public', bidDueDate: day(7), pmEmail: 'pplanner@grayco-cs.com', pmName: 'Pat Planner', estimatorId: 'st_gestimator', postedBy: 'wjohnson@grayco-cs.com', crmProjectId: 'P1' });
put('jobs', { id: 'j_lead', title: 'Sample Lead Job', status: 'open', visibility: 'public', bidDueDate: day(7), crmLeadId: 'L1', postedBy: 'wjohnson@grayco-cs.com' });
put('jobs', { id: 'j_poster', title: 'Sample Poster Job', status: 'open', visibility: 'public', bidDueDate: day(7), postedBy: 'wjohnson@grayco-cs.com', postedByName: 'Wes Owner' });
put('jobs', { id: 'j_nobody', title: 'Sample Nobody Job', status: 'open', visibility: 'public', bidDueDate: day(7), postedBy: 'lead-inbox' });
put('jobs', { id: 'j_plans', title: 'Sample Office (has plans)', status: 'open', visibility: 'public', bidDueDate: day(7), pmEmail: 'pplanner@grayco-cs.com', plansLinks: [{ id: 'pl_1', url: 'https://drive.google.com/sample-set', label: 'Plan set' }] });
put('jobs', { id: 'j_priv', title: 'PRIVATE-NOT-INVITED', status: 'open', visibility: 'private' });
put('jobs', { id: 'j_closed', title: 'CLOSED-JOB', status: 'closed', visibility: 'public' });
put('plans', { id: 'j_plans', items: [] });
const whoSub = u => ({ email: u.email, isAdmin: false, isSub: true, approved: u.approved === true, profile: u });
const ADMIN = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wes Owner', admin: true, estimator: false, canPublic: true, canInvite: true };
const PMW = { ok: true, email: 'pplanner@grayco-cs.com', name: 'Pat Planner', admin: false, estimator: false, canPublic: false, canInvite: false };
const OTHER = { ok: true, email: 'ozzie@grayco-cs.com', name: 'Ozzie Other', admin: false, estimator: false, canPublic: false, canInvite: false };
const ask = (u, jobId, needs, note) => HUBX.requestPlans(whoSub(u), { jobId, needs, note }, {});

await t('a request on a job with NO plans → one e-mail to the PM + the estimator (staff only), naming the sub, what they need and the note', async () => {
  MAIL.length = 0;
  const r = await ask(SUB, 'j_noplans', ['plans', 'sitewalk'], 'Need the full set and a walk-through time.');
  yes(r.ok && !r.already && r.request.status === 'open', JSON.stringify(r));
  eq(r.request.needs, ['plans', 'sitewalk']);
  eq(MAIL.length, 1, 'one e-mail');
  eq(MAIL[0].to.slice().sort(), ['gestimator@grayco-cs.com', 'pplanner@grayco-cs.com']);
  yes(/Sample Drywall LLC asked for plans — Sample Clinic Remodel/.test(MAIL[0].subject), MAIL[0].subject);
  yes(/Plans, Site walk \/ access/.test(MAIL[0].html) && /Need the full set/.test(MAIL[0].html) && /901-555-0141/.test(MAIL[0].html) && /sam@sampledrywall\.test/.test(MAIL[0].html), 'contents');
  yes(!/\$\d/.test(MAIL[0].html), 'no price');
});
await t('… a 💬 Job Messages post on the CRM project\'s thread naming @Pat Planner @Gus Estimator (notify list → 🔔 For you)', async () => {
  const msgs = kvList('gc_job_messages'), m = msgs.find(x => x.planReqId === 'j_noplans__u_sam');
  yes(m, 'message posted');
  eq(m.pid, 'P1');
  yes(/^📩 @Pat Planner @Gus Estimator — Sample Drywall LLC/.test(m.text), m.text);
  eq(m.notify.map(x => x.e + ':' + x.why).sort(), ['gestimator@grayco-cs.com:mention', 'pplanner@grayco-cs.com:mention']);
  eq(m.notify.map(x => x.id).sort(), ['U_est', 'U_pm'], 'the CRM people ids (tags)');
});
await t('… and a To-Do "📩 Sample Drywall LLC asked for plans — Sample Clinic Remodel" for both of them (not done)', async () => {
  const td = kvList('gc_office_tasks').find(x => x.id === 'planreq_j_noplans__u_sam');
  yes(td && !td.done, JSON.stringify(td));
  eq(td.label, '📩 Sample Drywall LLC asked for plans — Sample Clinic Remodel');
  eq(td.assignees.slice().sort(), ['gestimator@grayco-cs.com', 'pplanner@grayco-cs.com']);
  eq([td.kind, td.pid, td.bidJobId, td.prio], ['planreq', 'P1', 'j_noplans', 'high']);
});
await t('one open request per sub per job: asking again → "already", no second e-mail / message / To-Do', async () => {
  const n0 = MAIL.length, m0 = kvList('gc_job_messages').length, t0 = kvList('gc_office_tasks').length;
  const r = await ask(SUB, 'j_noplans', ['specs'], 'again');
  yes(r.already === true && r.request.note === 'Need the full set and a walk-through time.', JSON.stringify(r));
  eq([MAIL.length, kvList('gc_job_messages').length, kvList('gc_office_tasks').length], [n0, m0, t0]);
});
await t('only approved subs, only jobs open to them for bids; "Other" needs a note; GrayCo staff can\'t "request"', async () => {
  const no = async (f, re) => { try { await f(); } catch (e) { yes(re.test(e.message), e.message); return e.status; } throw new Error('not refused'); };
  eq(await no(() => ask(WAIT, 'j_noplans', ['plans']), /waiting for GrayCo to approve/), 403);
  eq(await no(() => ask(SUB, 'j_priv', ['plans']), /not open to you/), 404);
  eq(await no(() => ask(SUB, 'j_closed', ['plans']), /not open to you|closed/), 404);
  await no(() => ask(SUB2, 'j_lead', ['other'], ''), /Write what you need/);
  await no(() => HUBX.requestPlans({ isAdmin: true, email: 'wjohnson@grayco-cs.com', profile: {} }, { jobId: 'j_noplans' }, {}), /for subcontractors/);
});
await t('who hears: the CRM lead\'s PM + estimator; no one set → the poster; nobody at all → the Senior Estimator, else office@', async () => {
  MAIL.length = 0;
  await ask(SUB, 'j_lead', ['specs'], ''); eq(MAIL[0].to.slice().sort(), ['gestimator@grayco-cs.com', 'lleadpm@grayco-cs.com'], 'lead');
  eq(kvList('gc_job_messages').find(x => x.planReqId === 'j_lead__u_sam').pid, 'L1', 'the lead\'s thread');
  yes(/asked for more info/.test(MAIL[0].subject), 'specs only → "more info": ' + MAIL[0].subject);
  await ask(SUB, 'j_poster', ['plans'], ''); eq(MAIL[1].to, ['wjohnson@grayco-cs.com'], 'poster');
  await ask(SUB, 'j_nobody', ['plans'], ''); eq(MAIL[2].to, ['gestimator@grayco-cs.com'], 'the Senior Estimator (the one person with the Estimator role)');
  eq(kvList('gc_job_messages').find(x => x.planReqId === 'j_nobody__u_sam').pid, 'bidjob:j_nobody', 'no CRM job / lead → the bid job\'s own thread');
  STAFF = STAFF.filter(x => !/estimat/.test(x.profile || '')); KV.users = KV.users.filter(u => u.role !== 'Estimator');
  await ask(SUB2, 'j_nobody', ['plans'], ''); eq(MAIL[3].to, ['office@grayco-cs.com'], 'no estimator at all → office@');
  STAFF.push({ email: 'gestimator@grayco-cs.com', name: 'Gus Estimator', role: 'staff', profile: 'estimator', active: true }); KV.users.push({ id: 'U_est', name: 'Gus Estimator', email: 'gestimator@grayco-cs.com', role: 'Estimator', active: true });
});
await t('⏸ data-entry mode: the request e-mail to staff still goes (staff only)', async () => {
  setPause(true); MAIL.length = 0;
  const r = await ask(SUB2, 'j_noplans', ['plans'], 'Paint scope?');
  yes(r.ok && !r.already, JSON.stringify(r));
  eq(MAIL.length, 1, 'sent while paused'); eq(MAIL[0].to.slice().sort(), ['gestimator@grayco-cs.com', 'pplanner@grayco-cs.com']);
});
await t('a 🔗 plan link added (bid-hub op plans) → both requests close, To-Dos done, each sub gets a bid-site notice; the sub e-mail is HELD (⏸ on)', async () => {
  MAIL.length = 0;
  const r = await BH.manageView('j_noplans'); eq(r.planreqs.filter(x => x.open).length, 2, 'two open before');
  const jl = await BH.jobsList(); eq((jl.find(j => j.id === 'j_noplans') || {}).openReq, 2, 'jobsList openReq');
  const hub = require(path.join(FN, 'bid-hub.js'));
  const H = { httpMethod: 'POST', headers: {}, body: JSON.stringify({ op: 'plans', jobId: 'j_noplans', addLink: { url: 'https://drive.google.com/sample-clinic', label: 'Full set' } }) };
  const BI = require(path.join(FN, 'bid-inbox.js')); const realAuth = BI._test.staffAuth; BI._test.staffAuth = async () => Object.assign({}, ADMIN);
  const out = await hub.handler(H); BI._test.staffAuth = realAuth;
  eq(out.statusCode, 200, out.body);
  const q1 = row('planreqs/j_noplans__u_sam'), q2 = row('planreqs/j_noplans__u_otto');
  eq([q1.status, q1.closedHow, q2.status, q2.closedHow], ['closed', 'plans', 'closed', 'plans']);
  const tds = kvList('gc_office_tasks').filter(x => /^planreq_j_noplans__/.test(x.id));
  yes(tds.length === 2 && tds.every(x => x.done && x.doneWhy === 'plans posted'), JSON.stringify(tds));
  const notes = [...SP.values()].filter(r => r.collection === 'messages' && /^planreq_j_noplans__/.test(r.data.postId)).map(r => r.user_id + ':' + r.data.body);
  yes(notes.some(x => /^u_sam:Plans are now posted for Sample Clinic Remodel/.test(x)) && notes.some(x => /^u_otto:Los planos ya están publicados/.test(x)), JSON.stringify(notes));
  eq(MAIL.filter(m => !m.to.every(a => /@grayco-cs\.com$/.test(a))).length, 0, 'no e-mail to a sub while paused');
  yes(q1.mailHeld === true && !q1.notifiedAt, 'held');
});
await t('⏸ off → the next look (the bid site\'s load sweep) sends each sub "Plans are now posted" once', async () => {
  setPause(false); MAIL.length = 0;
  await HUBX.notifyPlanRequests('j_noplans');
  const subs = MAIL.filter(m => m.to.some(a => !/@grayco-cs\.com$/.test(a)));
  eq(subs.map(m => m.to[0]).sort(), ['otto@otherpaint.test', 'sam@sampledrywall.test']);
  yes(subs.some(m => /^Plans are now posted for Sample Clinic Remodel/.test(m.subject)) && subs.some(m => /^Los planos están publicados/.test(m.subject)), JSON.stringify(subs.map(m => m.subject)));
  MAIL.length = 0; await HUBX.notifyPlanRequests('j_noplans'); eq(MAIL.length, 0, 'once');
});
await t('after it closed the sub may ask again (a new open request); a request on a job that ALREADY had plans is not closed by the sweep', async () => {
  const r = await ask(SUB, 'j_noplans', ['sitewalk'], 'When is the walk?'); yes(r.ok && !r.already && r.request.status === 'open', JSON.stringify(r));
  eq(row('planreqs/j_noplans__u_sam').history.length, 1, 'the older one is kept in history');
  const r2 = await ask(SUB, 'j_plans', ['specs'], 'Spec book?'); yes(r2.request.status === 'open');
  await HUBX.notifyPlanRequests('j_plans');
  eq(row('planreqs/j_plans__u_sam').status, 'open', 'still open (no new plans since)');
});
await t('bid-hub op planreq: ↩ Reply → closed "answered", To-Do done, bid-site notice + e-mail to the sub; ✅ Mark sent → closed "sent"', async () => {
  MAIL.length = 0;
  const r = await BH.planreq(PMW, { id: 'j_noplans__u_sam', act: 'reply', text: 'Walk is Tuesday 9 AM at the front gate.' });
  yes(r.ok && r.mail === 'sent', JSON.stringify(r));
  const q = row('planreqs/j_noplans__u_sam'); eq([q.status, q.closedHow, q.reply, q.repliedByName], ['closed', 'answered', 'Walk is Tuesday 9 AM at the front gate.', 'Pat Planner']);
  yes(kvList('gc_office_tasks').find(x => x.id === 'planreq_j_noplans__u_sam').done, 'To-Do done');
  eq(MAIL.length, 1); eq(MAIL[0].to, ['sam@sampledrywall.test']); yes(/Walk is Tuesday/.test(MAIL[0].html));
  const s2 = await BH.planreq(ADMIN, { id: 'j_plans__u_sam', act: 'sent', text: 'E-mailed the spec book.' });
  yes(s2.ok && row('planreqs/j_plans__u_sam').closedHow === 'sent', JSON.stringify(s2));
  yes([...SP.values()].some(r => r.collection === 'messages' && r.user_id === 'u_sam' && /GrayCo sent what you asked for \(Specs\): E-mailed the spec book/.test(r.data.body)), 'notice');
});
await t('who may answer: not other staff; a reply while ⏸ is on → the e-mail is held (the sub still sees it on the bid site)', async () => {
  const r = await BH.planreq(OTHER, { id: 'j_lead__u_sam', act: 'sent' }); eq(r.code, 403);
  setPause(true); MAIL.length = 0;
  const r2 = await BH.planreq(ADMIN, { id: 'j_lead__u_sam', act: 'reply', text: 'Specs are in the addendum.' });
  eq(r2.mail, 'held'); eq(MAIL.length, 0); setPause(false);
});
await t('a sub loads only their own requests (no other sub\'s name, no GrayCo e-mails); manageView lists every request for staff', async () => {
  const mine = HUBX.subReqView;
  const rows = [...SP.values()].filter(r => r.collection === 'planreqs' && r.user_id === 'u_sam').map(r => mine(r.data));
  yes(rows.length >= 4 && rows.every(x => !('company' in x) && !('to' in x) && !('email' in x)), JSON.stringify(rows[0]));
  const mv = await BH.manageView('j_noplans');
  eq(mv.planreqs.map(x => x.company).sort(), ['Other Paint Co', 'Sample Drywall LLC']);
  yes(mv.planreqs.every(x => Array.isArray(x.needs) && 'open' in x), 'shape');
});
/* ── patch PLANREQ-T/D/E: 📂 Manage → 📝 Details (bid-hub op details), ⏸ Close bidding, 📋 Duplicate ── */
const callHub = async (who, body) => { const hub = require(path.join(FN, 'bid-hub.js')), BI = require(path.join(FN, 'bid-inbox.js')); const ra = BI._test.staffAuth; BI._test.staffAuth = async () => Object.assign({}, who);
  try { const o = await hub.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) }); return { code: o.statusCode, j: JSON.parse(o.body) }; } finally { BI._test.staffAuth = ra; } };
put('invites', { id: 'inv_d', jobId: 'j_noplans', email: SUB.email }, { email: SUB.email });
await t('details: trades → tradesSought + one scope box per trade (a box with content is kept); the PM may, other staff may not', async () => {
  const r = await callHub(PMW, { op: 'details', jobId: 'j_noplans', trades: ['Drywall', 'Paint', 'Electrical'] }); eq(r.code, 200, JSON.stringify(r.j));
  const j = row('jobs/j_noplans'); eq(j.tradesSought, 'Drywall, Paint, Electrical'); eq(j.tradeScopes.map(x => x.trade), ['Drywall', 'Paint', 'Electrical']);
  eq((await callHub(OTHER, { op: 'details', jobId: 'j_noplans', trades: ['X'] })).code, 403);
});
await t('details: the whole job (title, address, type, owner / GC + show, site walk + RSVP, questions due, start, instructions, requirements, alternates, unit prices, bid form, contacts, internal notes) → saved, 🗂 Activity, ONE 📣 update to the subs (bid site at once)', async () => {
  setPause(true);
  const m0 = [...SP.values()].filter(r => r.collection === 'messages').length;
  const r = await callHub(ADMIN, { op: 'details', jobId: 'j_noplans', title: 'Sample Clinic Remodel', address: '100 Sample Pkwy, Memphis, TN', projectType: 'commercial', ownerGc: 'Sample Builders Inc.', showOwnerGc: false,
    due: day(12), dueTime: '14:00', questionsDue: day(8), startDate: day(40), duration: '10 weeks', bidInstructions: 'Bid on our form; list exclusions.', siteWalk: { date: day(5), time: '09:00', location: 'Front gate', mandatory: true, rsvp: ['RSVP-SECRET Sam'] },
    requirements: { bond: true, prevailingWage: true, coi: true, coiGl: '$1M/$2M' }, alternates: ['Alt 1: LVT in the lobby'], unitPrices: ['Drywall patch per SF'], bidForm: [{ trade: 'Drywall', item: 'Hang + finish walls', unit: 'LS' }],
    contacts: { pmName: 'Pat Planner', pmPhone: '901-555-0100' }, internalNotes: 'INTERNAL-ONLY margin note' });
  eq(r.code, 200, JSON.stringify(r.j)); yes(r.j.changed.length >= 10, JSON.stringify(r.j.changed));
  const j = row('jobs/j_noplans'); eq([j.bidDueDate, j.bidDueTime, j.projectType, j.siteWalk.location, j.requirements.bond, j.bidForm.length, j.internalNotes], [day(12), '14:00', 'commercial', 'Front gate', true, 1, 'INTERNAL-ONLY margin note']);
  yes(j.log.some(x => /Details changed/.test(x.what) && /bid due/.test(x.what)), 'Activity');
  const msgs = [...SP.values()].filter(r => r.collection === 'messages').slice(m0);
  yes(msgs.length >= 1 && msgs.every(r => /GrayCo updated this bid job/.test(r.data.body)) && /Bid due date changed to/.test(msgs[0].data.body) && /Site walk/.test(msgs[0].data.body), JSON.stringify(msgs.map(m => m.data.body)));
  eq(new Set(msgs.map(m => m.data.postId)).size, 1, 'one update');
  yes(j.posts.slice(-1)[0].notice.status === 'held', 'the e-mail is held in ⏸: ' + JSON.stringify(j.posts.slice(-1)[0].notice));
  setPause(false);
  const v = HUBX.subJobView(j, ['Drywall']); yes(!('internalNotes' in v) && !('ownerGc' in v) && !(v.siteWalk && v.siteWalk.rsvp), 'the sub view hides internal notes, the owner / GC (not ticked) and the RSVP list');
  eq(MAIL.filter(m => m.to.some(a => !/@grayco-cs\.com$/.test(a))).length, 0, 'no e-mail to a sub from here');
});
await t('details: no due date on a PUBLIC job → refused (make it private first); the same op with only the due date', async () => {
  const r = await callHub(ADMIN, { op: 'details', jobId: 'j_noplans', due: '' }); eq(r.code, 400); yes(/public bid job needs a bid due date/.test(r.j.error));
  const r2 = await callHub(ADMIN, { op: 'details', jobId: 'j_noplans', due: day(14), dueTime: '' }); eq([r2.code, row('jobs/j_noplans').bidDueDate, row('jobs/j_noplans').bidDueTime], [200, day(14), '']);
});
await t('⏸ Close bidding: the job stays visible, no new bids (subScope biddable false) and a request is refused; ▶ Reopen', async () => {
  const r = await callHub(ADMIN, { op: 'bidding', jobId: 'j_noplans', close: true }); eq([r.code, r.j.biddingClosed], [200, true]);
  const sc = await HUBX.subScope(whoSub(SUB)); yes(!!sc.jobs.j_noplans && !sc.biddable.j_noplans, 'visible, not biddable');
  let e = ''; try { await HUBX.requestPlans(whoSub(SUB2), { jobId: 'j_noplans', needs: ['plans'] }, {}); } catch (x) { e = x.message; } yes(/closed|open request|already/.test(e) || e === '', e);
  eq((await callHub(ADMIN, { op: 'bidding', jobId: 'j_noplans', close: false })).j.biddingClosed, false);
});
await t('📋 Duplicate: a new 🔒 private job with the details, trades, scopes and plans — no subs, invites, bids, questions; the source logs it', async () => {
  const r = await callHub(PMW, { op: 'duplicate', jobId: 'j_noplans', title: 'Sample Clinic Remodel — Phase 2' }); eq(r.code, 200, JSON.stringify(r.j));
  const c = row('jobs/' + r.j.jobId); eq([c.title, c.visibility, c.status, c.tradesSought, c.copiedFrom, (c.posts || []).length], ['Sample Clinic Remodel — Phase 2', 'private', 'open', 'Drywall, Paint, Electrical', 'j_noplans', 0]);
  yes(![...SP.values()].some(x => (x.collection === 'invites' || x.collection === 'bids' || x.collection === 'questions' || x.collection === 'planreqs') && x.job_id === r.j.jobId), 'nothing of the subs copied');
  yes(row('jobs/j_noplans').log.some(x => /Copied to a new job/.test(x.what)));
});
await t('the bid site\'s own due-date save (subportal.js admin save) → 🗂 Activity + the automatic update too', async () => {
  const j = Object.assign({}, row('jobs/j_noplans'), { bidDueDate: day(20), bidDueTime: '10:00' });
  const m0 = [...SP.values()].filter(r => r.collection === 'messages').length;
  await HUBX.saveCollection({ isAdmin: true, email: 'wjohnson@grayco-cs.com', profile: { name: 'Wes Owner' } }, 'jobs', [j], [], {});
  const after = row('jobs/j_noplans'); yes(after.log.some(x => /Bid due changed: .* → .*10:00/.test(x.what)), JSON.stringify(after.log.slice(-2)));
  yes([...SP.values()].filter(r => r.collection === 'messages').slice(m0).some(r => /Bid due date changed to/.test(r.data.body)), 'update posted');
});
await t('PLANREQ-F: our bid due (staff only) apart from the sub due — details saves it without an update to subs; the sub view never has it', async () => {
  const m0 = [...SP.values()].filter(r => r.collection === 'messages').length;
  const r = await callHub(ADMIN, { op: 'details', jobId: 'j_noplans', ourDue: day(21), ourDueTime: '14:00' }); eq(r.code, 200, JSON.stringify(r.j));
  const j = row('jobs/j_noplans'); eq([j.ourDue, j.ourDueTime], [day(21), '14:00']);
  eq([...SP.values()].filter(r => r.collection === 'messages').length, m0, 'no update for our own date');
  const v = HUBX.subJobView(j, []); yes(!('ourDue' in v) && !('ourDueTime' in v), 'hidden from subs');
  const jl = (await BH.jobsList()).find(x => x.id === 'j_noplans'); eq([jl.ourDue, jl.ourDueTime], [day(21), '14:00']);
});
console.log('\nPLANREQ_fn ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
