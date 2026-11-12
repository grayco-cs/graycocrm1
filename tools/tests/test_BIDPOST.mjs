// test_BIDPOST.mjs <build-dir> [shot-dir] — patch BIDPOST + SIGNUPPAPERS (owner 11/12): "make it where I have to put jobs into the bid
// portal, nothing goes automatic"; Glenn (estimator), an admin, or a job's PM puts a job on it (📢 Put on bid portal: public / private,
// trades, due date, scope, files); old auto-added jobs are archived by an admin's "🧹 Clean up"; "No due date" instead of "NaN days left";
// subs ask questions; sign-up papers ("I have it — will send later" / upload) for a faster approval. Made-up data only.
//   A. the server (no browser; in-memory bid site, fake CRM lists, fake fetch): nothing is drafted / opened by itself; the clean-up rule
//      (auto-added, never posted, no plans / bids / invites / questions) and its archive + restore; postjob / unpost and who may (admin,
//      estimator, the job's PM — not other staff); answers by the poster; sign-up papers (token, upload path, validation, claims,
//      on file / says has it / missing, ⚡ ready).
//   B. the CRM (offline harness, fake bid-hub / portal-access): 🧹 Clean up → only real jobs; 🗄 Archived; 📢 Put on bid portal on a job
//      page / a lead / an estimate (admin), posting a PUBLIC job with trades + files; a PM sees it only on their own job; the bid question
//      To-Do; the Approvals row with the papers.
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const req = createRequire(import.meta.url), FN = path.join(BUILD, 'netlify/functions');

/* ════ A. the server ════ */
Object.assign(process.env, { RESEND_API_KEY: 're-test', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test' }); delete process.env.BID_PORTAL_AUTO; process.env.PORTAL_MAIL_OFF = '1';
const PAX = req(FN + '/portal-access.js');
const BI = req(FN + '/bid-inbox.js'), H = req(FN + '/bid-hub.js')._test, SPM = req(FN + '/subportal.js'), SP = SPM._hub, L = BI._lib, T = BI._test, BPL = req(FN + '/_lib/bid-portal.js');
const ROWS = new Map(), KV = {}, FETCH = [];
const row = (c, d, extra) => Object.assign({ collection: c, id: d.id, job_id: c === 'jobs' || c === 'plans' ? d.id : d.jobId, user_id: d.userId || '', email: d.email || '', data: d }, extra || {});
const put = (c, d, extra) => ROWS.set(c + '/' + d.id, row(c, d, extra));
SP.listRows = async filters => { const f = {}; filters.forEach(x => { const m = /^(\w+)=eq\.(.*)$/.exec(x); if (m) f[m[1]] = decodeURIComponent(m[2]); });
  return [...ROWS.values()].filter(r => (!f.collection || r.collection === f.collection) && (!f.job_id || r.job_id === f.job_id) && (!f.key || f.key === r.collection + '/' + r.id)); };
SP.getRow = async (c, id) => ROWS.get(c + '/' + id) || null;
SP.plansOf = async id => { const r = ROWS.get('plans/' + id); return r ? (r.data.items || []) : []; };
SP.upsertRows = async rows => { rows.forEach(r => ROWS.set(r.collection + '/' + r.id, Object.assign({}, r, { data: JSON.parse(JSON.stringify(r.data)) }))); return rows; };
const CRM = { users: [{ name: 'Pat Planner', email: 'pat@example.com', role: 'Project Manager' }, { name: 'Gus Estimator', email: 'gus@example.com', role: 'Estimator' }, { name: 'Ozzie Office', email: 'ozzie@example.com', role: 'Office' }],
  projects: [{ id: 'P1', name: 'Sample Clinic', pm: 'Pat Planner' }, { id: 'P2', name: 'Other Job', pm: 'Someone Else' }], leads: [{ id: 'L1', name: 'Sample Paint Lead', pm: 'Pat Planner' }] };
SP.kvRead = async keys => { const o = {}; keys.forEach(k => { o[k] = CRM[k] || []; }); return o; };
L.kvGet = async k => JSON.parse(JSON.stringify(KV[k] === undefined ? null : KV[k]));
L.kvCas = async (k, f) => { const v = f(JSON.parse(JSON.stringify(KV[k] === undefined ? null : KV[k]))); if (v !== undefined) KV[k] = v; return v; };
let COPY = 0; L.portalApi = () => ({ _copyFile: async f => { COPY++; return { name: f.name, size: 1234, type: 'application/pdf', fileRef: 'staff/crm/' + f.name, kind: 'plans' }; } });
/* the database the function files reach directly (sp_rows), on the same in-memory rows */
globalThis.fetch = async (url, o) => { const u = new URL(String(url)), m = (o && o.method) || 'GET'; FETCH.push({ url: String(url), method: m });
  const res = v => ({ ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v), arrayBuffer: async () => new ArrayBuffer(0) });
  if (/\/rest\/v1\/sp_rows/.test(u.pathname)) {
    if (m === 'POST') { JSON.parse(o.body || '[]').forEach(r => ROWS.set(r.collection + '/' + r.id, { collection: r.collection, id: r.id, job_id: r.job_id, user_id: r.user_id, email: r.email, data: r.data })); return res([]); }
    const f = {}; u.searchParams.forEach((v, k) => { if (/^eq\./.test(v)) f[k] = v.slice(3); });
    return res([...ROWS.values()].filter(r => (!f.key || f.key === r.collection + '/' + r.id) && (!f.collection || r.collection === f.collection) && (!f.id || r.id === f.id)).map(r => Object.assign({ key: r.collection + '/' + r.id }, r)));
  }
  return res([]); };
const ADMIN = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', admin: true, estimator: false, canPublic: true, canInvite: true };
const EST = { ok: true, email: 'gus@example.com', name: 'Gus Estimator', admin: false, estimator: true, canPublic: true, canInvite: true };
const PM = { ok: true, email: 'pat@example.com', name: 'Pat Planner', admin: false, estimator: false, canPublic: false, canInvite: false };
const OTHER = { ok: true, email: 'ozzie@example.com', name: 'Ozzie Office', admin: false, estimator: false, canPublic: false, canInvite: false };
/* A1 nothing automatic */
let drafted = 0; const realMake = BPL.make; BPL.make = d => Object.assign(realMake(d), { draft: async () => { drafted++; return { ok: true, state: 'draft', jobId: 'j_x' }; } });
try { await L.afterStore([{ action: 'added', id: 'LI-1' }], [{ id: 'LI-1', title: 'Some bid board lead', type: 'commercial', source: 'bid board', status: 'new' }], {}); } catch (e) {}
ok('A1 a new lead is NOT drafted onto the bid portal (no automatic jobs)', drafted === 0, drafted);
const fl = await L.flushPortal();
ok('A1 the queued-drafts flush is off', fl.off === true && fl.created === 0, fl);
put('jobs', { id: 'J_dr', title: 'Old draft', draft: true, status: 'draft', createdBy: 'lead-inbox', leadInbox: { id: 'LI-9', type: 'commercial' } });
const sw = await H.sweep(EST);
ok('A1 the old "drafts → private" sweep is off', sw.off === true && sw.opened === 0 && ROWS.get('jobs/J_dr').data.draft === true, sw);
BPL.make = realMake;
/* A2 the clean-up rule */
ROWS.clear();
put('jobs', { id: 'J_auto1', title: 'Sample Lead Ann', draft: true, status: 'draft', createdBy: 'lead-inbox', leadInbox: { id: 'LI-1' }, bidDueDate: '' });
put('jobs', { id: 'J_auto2', title: 'Sample Refurb - 100 Test St', status: 'open', visibility: 'private', draft: false, autoPrivate: true, openedBy: 'gus@example.com', openedPrivateAt: '2026-11-01', createdBy: 'lead-inbox', leadInbox: { id: 'LI-2' } });
put('jobs', { id: 'J_plans', title: 'Lead with plans', draft: true, status: 'draft', createdBy: 'lead-inbox', leadInbox: { id: 'LI-3' } }); put('plans', { id: 'J_plans', items: [{ name: 'A1.pdf' }] });
put('jobs', { id: 'J_bid', title: 'Lead with a bid', draft: true, status: 'draft', createdBy: 'lead-inbox', leadInbox: { id: 'LI-4' } }); put('bids', { id: 'b1', jobId: 'J_bid', amount: 100 });
put('jobs', { id: 'J_pub', title: 'Published on purpose', status: 'open', visibility: 'public', draft: false, publishedAt: '2026-11-02', publishedBy: 'wjohnson@grayco-cs.com', createdBy: 'lead-inbox', leadInbox: { id: 'LI-5' }, bidDueDate: '2026-12-01' });
put('jobs', { id: 'J_site', title: 'Made on the bid site', status: 'open', visibility: 'public', createdBy: 'u_admin', bidDueDate: 'not a date' });
const dry = await H.cleanup(ADMIN, { dry: true });
ok('A2 clean-up (dry): only the 2 auto-added, never-posted jobs with no plans / bids / invites', dry.count === 2 && dry.sample.sort().join('|') === 'Sample Lead Ann|Sample Refurb - 100 Test St', dry);
ok('A2 only an admin cleans up', (await H.cleanup(EST, { dry: true })).code === 403);
const done = await H.cleanup(ADMIN, {});
const st = id => ROWS.get('jobs/' + id).data;
ok('A2 clean-up archives them (status archived, reason auto) — nothing deleted; the others untouched', done.archived === 2 && st('J_auto1').status === 'archived' && st('J_auto1').archivedReason === 'auto' && st('J_auto2').archivedFrom.visibility === 'private'
  && ['J_plans', 'J_bid', 'J_pub', 'J_site'].every(id => st(id).status !== 'archived') && ROWS.size >= 8, done);
let list = await H.jobsList();
const byId = id => list.find(j => j.id === id) || {};
ok('A2 the list: archived ones flagged 🗄 (restorable any time), the rest not auto', byId('J_auto1').archived && byId('J_auto1').deleted && !byId('J_pub').auto && !byId('J_site').auto && list.filter(j => !j.deleted).length === 4, list.map(j => j.id + ':' + j.archived + ':' + j.auto));
ok('A2 "No due date" data: a bad / missing due date comes back empty (never "Invalid Date")', byId('J_site').due === '' && byId('J_pub').due === '2026-12-01' && H.validDay('2026-02-30x') === '' && H.validDay('2026-11-20') === '2026-11-20', [byId('J_site').due, byId('J_pub').due]);
/* A3 posting */
let r = await H.postjob(OTHER, { pid: 'P1', title: 'Sample Clinic', visibility: 'private', trades: ['Paint'] });
ok('A3 other staff (not admin / estimator / the job\'s PM) cannot post', r.code === 403, r);
r = await H.postjob(PM, { pid: 'P2', title: 'Other Job', visibility: 'private', trades: ['Paint'] });
ok('A3 a PM cannot post a job that is not theirs', r.code === 403, r);
r = await H.postjob(PM, { pid: 'P1', title: 'Sample Clinic — exterior paint', visibility: 'public', trades: ['Exterior paint'] });
ok('A3 a public job needs a bid due date', r.code === 400 && /due date/.test(r.error), r);
r = await H.postjob(PM, { pid: 'P1', title: 'Sample Clinic — exterior paint', address: '100 Sample St', visibility: 'public', due: '2026-12-05', trades: ['Exterior paint', 'Carpentry'], scope: '2,500 SF exterior repaint: wash, scrape, prime, 2 coats.',
  specs: 'Body SW 7036.', links: [{ url: 'https://drive.google.com/sample-plans', label: 'Full plan set' }], files: [{ ref: 'sb:crm-files/abc.pdf', name: 'elevations.pdf' }], pmEmail: 'pat@example.com', pmName: 'Pat Planner', projectName: 'T101 · Sample Clinic' });
const J1 = r.jobId, j1 = () => ROWS.get('jobs/' + J1).data;
ok('A3 the PM of the job posts it: public, trades, due, scope, specs, link, copied file, linked to the project, posted by them', r.ok && r.created && r.role === 'pm' && j1().visibility === 'public' && j1().draft === false && j1().tradesSought === 'Exterior paint, Carpentry'
  && j1().bidDueDate === '2026-12-05' && j1().crmProjectId === 'P1' && j1().postedBy === 'pat@example.com' && j1().plansLinks[0].url === 'https://drive.google.com/sample-plans' && ROWS.get('plans/' + J1).data.items[0].name === 'elevations.pdf' && COPY === 1, j1());
r = await H.postjob(EST, { pid: 'P1', title: 'Sample Clinic — exterior paint', visibility: 'private', trades: ['Exterior paint'], files: [{ ref: 'sb:crm-files/abc.pdf', name: 'elevations.pdf' }] });
ok('A3 posting the same job again updates it (same id, no copy of a file already shared); an estimator may', r.ok && !r.created && r.jobId === J1 && j1().visibility === 'private' && COPY === 1 && [...ROWS.values()].filter(x => x.collection === 'jobs' && x.data.crmProjectId === 'P1').length === 1, r);
r = await H.postjob(PM, { leadId: 'L1', title: '2,500 SF exterior paint', visibility: 'private', trades: ['Paint'], scope: 'Small job: 2,500 SF exterior repaint.' });
ok('A3 a lead (any type, a small job) can be posted by its PM', r.ok && r.created && ROWS.get('jobs/' + r.jobId).data.crmLeadId === 'L1', r);
const pv = await H.postedView(PM, J1);
ok('A3 the poster can read it back to edit (trades, scope, links, files)', pv.ok && pv.job.trades.join() === 'Exterior paint' && pv.job.links.length === 1 && pv.job.files.length === 1, pv);
ok('A3 other staff cannot', (await H.postedView(OTHER, J1)).code === 403);
r = await H.unpost(OTHER, { jobId: J1 }); ok('A3 others cannot take it off', r.code === 403, r);
r = await H.unpost(PM, { jobId: J1 });
ok('A3 Take off bid portal → 🗄 archived (taken off), restorable', r.ok && j1().status === 'archived' && j1().archivedReason === 'taken off', j1());
r = await H.postjob(PM, { jobId: J1, pid: 'P1', title: 'Sample Clinic — exterior paint', visibility: 'private', trades: ['Exterior paint'] });
ok('A3 posting it again puts it back', r.ok && j1().status === 'open' && !j1().archivedReason, j1());
ok('A3 the server knows who posted: posterRole', (await H.posterRole(PM, {}, j1())) === 'poster' && (await H.posterRole(OTHER, {}, j1())) === '');
/* A4 sign-up papers */
const PP = SPM._papers;
const tok = PP.paperToken('u_abc123');
ok('A4 the sign-up token belongs to that new profile only and expires', PP.paperUser(tok) === 'u_abc123' && (() => { try { PP.paperUser(tok.replace(/.$/, c => c === 'a' ? 'b' : 'a')); return false; } catch (e) { return e.status === 401; } })(), tok);
const cp = (x) => PP.cleanPaper(x, 'u_abc123');
ok('A4 a paper must be in the profile\'s own folder; insurance needs its expiry; exempt WC does not', !cp({ type: 'w9', fileRef: 'u/u_other/x.pdf' }) && !cp({ type: 'insurance_general', fileRef: 'u/u_abc123/gl.pdf' })
  && !!cp({ type: 'insurance_general', fileRef: 'u/u_abc123/gl.pdf', expirationDate: '2027-05-01' }) && cp({ type: 'insurance_workers_comp', fileRef: 'u/u_abc123/ex.pdf', wcExempt: true }).wcExempt === true && !cp({ type: 'bogus', fileRef: 'u/u_abc123/x.pdf' }));
put('users', { id: 'u_abc123', role: 'sub', email: 'new@example.com', company: 'Sample Paint Co' });
await PP.signupPapers({ paperToken: tok, items: [{ type: 'w9', fileRef: 'u/u_abc123/w9.pdf', fileName: 'w9.pdf' }, { type: 'insurance_general', fileRef: 'u/u_abc123/gl.pdf', fileName: 'gl.pdf', expirationDate: '2099-05-01' },
  { type: 'license', fileRef: 'u/u_abc123/lic.jpg', fileName: 'lic.jpg', licState: 'tn', licType: 'Painting', licNumber: '12345' }] });
const sd = ROWS.get('subdocs/u_abc123').data.items;
ok('A4 the uploads are saved as the bid site\'s papers (subdocs: w9, insurance_general, license)', sd.map(d => d.type).join() === 'w9,insurance_general,license' && sd[2].licState === 'TN' && sd.every(d => d.atSignup), sd);
const paOf = PAX._papers.papersOf;
const p1 = paOf(sd, {}, { wc: true });
ok('A4 Approvals: W-9 ✓ on file, GL ✓ (exp), WC ☑ only "says has it", license on file; NOT ⚡ ready (WC not on file)', p1.w9.ok && p1.gl.ok && p1.gl.exp === '2099-05-01' && p1.wc.says === true && p1.licenses[0].state === 'TN' && p1.ready === false, p1);
const p2 = paOf(sd.concat([{ type: 'insurance_workers_comp', fileRef: 'u/u_abc123/wc.pdf', expirationDate: '2099-01-01', uploadedAt: '2026-11-12' }]), {}, {});
ok('A4 all three on file and current → ⚡ ready for quick approval', p2.ready === true, p2);
const p3 = paOf([{ type: 'w9', fileRef: 'x' }, { type: 'insurance_general', fileRef: 'y', expirationDate: '2020-01-01' }, { type: 'insurance_workers_comp', fileRef: 'z', wcExempt: true }], {}, {});
ok('A4 an expired GL is not ready (exempt WC with its form counts)', p3.ready === false && p3.gl.ok === false && p3.wc.ok === true, p3);
ok('A4 nothing ticked and nothing uploaded → missing (—)', paOf([], {}, {}).w9 === null);
const reg = fs.readFileSync(path.join(FN, 'subportal.js'), 'utf8');
ok('A4 the bid papers check still needs real files (papersMissing reads subdocs only — a claim is on the profile, not a paper)', /async function papersMissing[\s\S]{0,300}getRow\('subdocs'/.test(reg) && /papersClaimed/.test(reg));

/* ════ B. the CRM ════ */
const { computer, signIn, sleep, cset, cget, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 3 * 864e5).toISOString(), day = at.slice(0, 10), due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', phone: '(901) 555-0177', active: true }]);
cset('leads', [{ id: 'L1', name: 'Sample Paint Lead', type: 'Residential', stage: 'New Lead', address: '22 Test Ln', city: 'Memphis', state: 'TN', desc: '2,500 SF exterior paint — 2-story house, wood siding.', createdAt: at, updatedAt: at }]);
cset('projects', [{ id: 'P1', name: 'Sample Clinic Remodel', client: 'Sample Health LLC', address: '100 Sample St', city: 'Memphis', state: 'TN', status: 'estimating', autoPO: 'T101', pm: 'Sam Biffle', scope: 'Interior remodel of a 3,000 SF clinic.', createdAt: at, updatedAt: at, files: [] },
  { id: 'P2', name: 'Other Job', client: 'Other Client', status: 'active', autoPO: 'T102', pm: 'Wesley Johnson', createdAt: at, updatedAt: at, files: [] }]);
cset('projectDocs', [{ id: 'D1', pid: 'P1', cat: 'Plans/Drawings', name: 'A1 floor plan.pdf', type: 'application/pdf', size: 2400000, data: 'sb:crm-files/' + 'a'.repeat(64) + '.pdf', ref: 'sb:crm-files/' + 'a'.repeat(64) + '.pdf', date: day },
  { id: 'D2', pid: 'P1', cat: 'Plans/Drawings', name: 'Full plan set — Drive', type: 'link', data: 'https://drive.google.com/sample-full-set', link: 'https://drive.google.com/sample-full-set', date: day }]);
cset('estimates', [{ id: 'E1', name: 'Sample Clinic Remodel — base', status: 'Draft', pid: 'P1', lines: [{ id: 'H1', desc: 'Paint walls', cost: 2, qty: 3000, cat: 'Paint', type: 'labor', mult: 'type' }], scope: { text: 'Paint all interior walls, 2 coats.', inc: '', exc: '', notes: '' }, settings: {}, jobMult: 'mat', totalCost: 6000, totalCharge: 8500, createdAt: at, savedAt: at, updatedAt: at }]);
const JOBS = [
  { id: 'J_auto1', title: 'Sample Lead Ann', status: 'draft', visibility: 'draft', draft: true, due: '', invited: 0, bids: 0, plans: 0, auto: true },
  { id: 'J_auto2', title: 'Sample Lead Bo', status: 'draft', visibility: 'draft', draft: true, due: '', invited: 0, bids: 0, plans: 0, auto: true },
  { id: 'J_auto3', title: 'Sample Lead Cy', status: 'draft', visibility: 'draft', draft: true, due: '', invited: 0, bids: 0, plans: 0, auto: true },
  { id: 'J_auto4', title: 'Sample Refurb - 100 Test St', status: 'open', visibility: 'private', due: '', invited: 0, bids: 0, plans: 0, auto: true },
  { id: 'J_real', title: 'Sample Office Build-Out', status: 'open', visibility: 'public', due, invited: 6, bids: 3, plans: 4, postedBy: 'wjohnson@grayco-cs.com', postedByName: 'Wesley Johnson', openQ: 2 }];
const HUB = { posts: [], cleanups: 0 };
const route = async (c, who) => c.ctx.route('**/.netlify/functions/bid-hub*', async rt => {
  const u = new URL(rt.request().url()), q = u.searchParams, J = (b, code) => rt.fulfill({ status: code || 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (rt.request().method() === 'POST') { const b = JSON.parse(rt.request().postData() || '{}');
    if (b.op === 'cleanup') { if (b.dry) return J({ ok: true, count: JOBS.filter(j => j.auto).length, sample: JOBS.filter(j => j.auto).map(j => j.title) }); HUB.cleanups++; JOBS.forEach(j => { if (j.auto) { j.auto = false; j.deleted = true; j.archived = true; j.archivedReason = 'auto'; } }); return J({ ok: true, archived: 4 }); }
    if (b.op === 'postjob') { HUB.posts.push(Object.assign({ who }, b)); const id = 'J_new' + HUB.posts.length; JOBS.push({ id, title: b.title, status: 'open', visibility: b.visibility, due: b.due, invited: 0, bids: 0, plans: b.files.length, crmProjectId: b.pid, crmLeadId: b.leadId, crmEstId: b.estId, postedBy: who, trades: b.trades.join(', ') });
      return J({ ok: true, jobId: id, created: true, visibility: b.visibility, files: b.files.length, notCopied: [] }); }
    return J({ ok: true }); }
  if (q.get('jobs')) return J({ ok: true, jobs: JOBS, me: { email: who, admin: who === 'wjohnson@grayco-cs.com', canInvite: true, canPublic: true } });
  if (q.get('posted')) return J({ ok: false, error: 'no' }, 404);
  return J({ ok: true, subs: [], bids: [] });
});
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await route(A, 'wjohnson@grayco-cs.com');
const SYNC = { ok: true, events: [], unread: {}, links: {}, waiting: [], codes: [], admin: true, me: 'wjohnson@grayco-cs.com', bids: [
  { id: 'u_new1', company: 'Sample Paint Co', name: 'Sal Sample', email: 'sal@example.com', trades: ['Paint', 'Drywall'], city: 'Memphis', state: 'TN', crew: 6, area: 'Shelby, DeSoto',
    papers: { w9: { ok: true, url: 'https://example.com/w9.pdf', name: 'w9.pdf' }, gl: { ok: true, exp: '2027-05-01', url: 'https://example.com/gl.pdf' }, wc: { ok: true, exp: '2027-03-01', url: 'https://example.com/wc.pdf' }, licenses: [{ ok: true, state: 'TN', number: '12345', url: 'https://example.com/lic.pdf' }], ready: true } },
  { id: 'u_new2', company: 'Sample Roofing LLC', name: 'Ray Sample', email: 'ray@example.com', trades: ['Roofing'], city: 'Southaven', state: 'MS',
    papers: { w9: { says: true }, gl: { ok: true, exp: '2027-01-15', url: 'https://example.com/gl2.pdf' }, wc: { says: true, exempt: true }, licenses: [], ready: false } }] };
await A.ctx.route('**/.netlify/functions/portal-access*', async rt => { const b = JSON.parse(rt.request().postData() || '{}'); return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b.action === 's-sync' ? SYNC : { ok: true }) }); });
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(7000);
const wait = async (c, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 patch BIDPOST is loaded', await A.ev(() => !!window.__GC_PATCH_BIDPOST__ && !!window._gcBidPost));
/* B1 the tab: 🧹 Clean up → only the real job */
await A.ev(() => { try { localStorage.setItem('gc_bp_mode:wjohnson@grayco-cs.com', 'crm'); } catch (e) {} window._setView('bidportal'); });
await wait(A, () => document.querySelector('#gc-sys-bp-mount [data-sys-auto]'));
const b1 = await A.ev(() => ({ rows: [...document.querySelectorAll('#gc-sys-bp-mount tr[data-sys-job]')].map(r => r.getAttribute('data-sys-job')), btn: (document.querySelector('#gc-sys-bp-mount [data-sys="cleanup"]') || {}).textContent, autoTxt: /auto-added/.test(document.querySelector('#gc-sys-bp-mount tr[data-sys-job="J_auto1"]').textContent) }));
ok('B1 before: the auto-added jobs are listed as "🤖 auto-added", with "🧹 Clean up auto-added jobs (4)"', b1.rows.length === 5 && b1.btn === '🧹 Clean up auto-added jobs (4)' && b1.autoTxt, b1);
await shot(A, '01_bidportal_before_cleanup');
A.acceptConfirm = true;
await A.ev(() => document.querySelector('#gc-sys-bp-mount [data-sys="cleanup"]').click());
await wait(A, () => !document.querySelector('#gc-sys-bp-mount [data-sys-auto]') && document.querySelectorAll('#gc-sys-bp-mount tr[data-sys-job]').length === 1);
const b2 = await A.ev(() => ({ rows: [...document.querySelectorAll('#gc-sys-bp-mount tr[data-sys-job]')].map(r => r.getAttribute('data-sys-job')), arch: [...document.querySelectorAll('#gc-sys-bp-mount [data-sys="f"]')].map(b => b.textContent).find(x => /Archived/.test(x)) }));
ok('B1 after the admin\'s click (a confirm first): only the real job is listed; "🗄 Archived (4)" holds the rest', HUB.cleanups === 1 && b2.rows.join() === 'J_real' && b2.arch === '🗄 Archived (4)', b2);
await shot(A, '02_bidportal_after_cleanup');
await A.ev(() => [...document.querySelectorAll('#gc-sys-bp-mount [data-sys="f"]')].find(b => /Archived/.test(b.textContent)).click()); await sleep(500);
const b3 = await A.ev(() => ({ rows: [...document.querySelectorAll('#gc-sys-bp-mount tr[data-sys-job]')].map(r => r.getAttribute('data-sys-job')), restore: document.querySelectorAll('#gc-sys-bp-mount [data-sys="restore"]').length }));
ok('B1 🗄 Archived shows them with ↩ Restore', b3.rows.length === 4 && b3.restore === 4, b3);
await shot(A, '03_bidportal_archived');
/* B2 📢 on the job page (admin) */
await A.ev(() => { window._gcOpenProject = { id: 'P1' }; window._setView('projects'); });
await A.ev(() => { try { if (window._navToJob) window._navToJob('P1'); else if (window._gcOpenJobProfile) window._gcOpenJobProfile('P1'); } catch (e) {} });
const jb = await wait(A, () => document.querySelector('#gcbp-job [data-bidpost]'), null, 20000);
ok('B2 the job page has "📢 Put on bid portal" (admin)', !!jb);
await A.ev(() => window._gcBidPost.open({ pid: 'P1' }));
await wait(A, () => document.querySelector('#gcbp-modal #gcbp-title'));
const sh = await A.ev(() => ({ title: document.getElementById('gcbp-title').value, addr: document.getElementById('gcbp-addr').value, scope: document.getElementById('gcbp-scope').value, files: [...document.querySelectorAll('#gcbp-modal [data-bp-file]')].map(x => x.parentNode.textContent.trim() + (x.checked ? '[x]' : '')), trades: document.querySelectorAll('#gcbp-modal [data-bp="trade"]').length }));
ok('B2 the sheet: title, address, scope filled from the job; its files + Drive link offered (plans ticked); the trade list', sh.title === 'Sample Clinic Remodel' && /100 Sample St/.test(sh.addr) && /3,000 SF clinic/.test(sh.scope) && sh.files.length === 2 && sh.files.every(f => /\[x\]$/.test(f)) && sh.trades > 10, sh);
await A.ev(() => { document.querySelector('#gcbp-modal input[name="gcbp-vis"][value="public"]').click(); [...document.querySelectorAll('#gcbp-modal [data-bp="trade"]')].filter(b => /^(Paint|Drywall)$/.test(b.textContent)).forEach(b => b.click());
  document.getElementById('gcbp-trade').value = 'Exterior paint'; document.querySelector('#gcbp-modal [data-bp="addtrade"]').click(); document.getElementById('gcbp-due').value = ''; });
await A.ev(() => document.querySelector('#gcbp-modal [data-bp="post"]').click()); await sleep(300);
ok('B2 a PUBLIC job without a due date is stopped (or post it private)', /public job needs a bid due date/.test(await A.ev(() => document.querySelector('#gcbp-modal [data-bp-err]').textContent)) && HUB.posts.length === 0);
await A.ev(d => { document.getElementById('gcbp-due').value = d; document.getElementById('gcbp-specs').value = 'Plans in the shared set; walk-through Tuesdays 9 AM.'; }, due);
await shot(A, '04_put_on_bid_portal_sheet');
await A.ev(() => document.querySelector('#gcbp-modal [data-bp="post"]').click());
await wait(A, () => !document.getElementById('gcbp-modal'));
const ps = HUB.posts[0] || {};
ok('B2 📢 posts it: public, trades Paint + Drywall + Exterior paint, due, scope, the job\'s PDF (copied) and Drive link, linked to the job', ps.op === 'postjob' && ps.pid === 'P1' && ps.visibility === 'public' && ps.trades.sort().join() === 'Drywall,Exterior paint,Paint' && ps.due === due
  && ps.files.length === 1 && /^sb:crm-files\//.test(ps.files[0].ref) && ps.links.some(l => l.url === 'https://drive.google.com/sample-full-set') && ps.pmName === 'Sam Biffle' && ps.pmEmail === 'sbiffle@grayco-cs.com', ps);
await sleep(1500);
ok('B2 the job page now says "📢 On bid portal · 🌐 Edit"', /On bid portal · 🌐 Edit/.test(await A.ev(() => (document.querySelector('#gcbp-job') || {}).textContent || '')));
/* B3 a lead (any type) and an estimate */
ok('B3 a lead and an estimate can be put on too (admin)', await A.ev(() => window._gcBidPost.canPost({ leadId: 'L1' }) && window._gcBidPost.canPost({ estId: 'E1' })));
await A.ev(() => window._gcBidPost.open({ leadId: 'L1' })); await wait(A, () => document.querySelector('#gcbp-modal #gcbp-title'));
const ls = await A.ev(() => ({ t: document.getElementById('gcbp-title').value, s: document.getElementById('gcbp-scope').value }));
ok('B3 the lead\'s sheet: its name and what it is ("2,500 SF exterior paint …")', ls.t === 'Sample Paint Lead' && /2,500 SF exterior paint/.test(ls.s), ls);
await A.ev(() => { [...document.querySelectorAll('#gcbp-modal [data-bp="trade"]')].find(b => b.textContent === 'Paint').click(); document.querySelector('#gcbp-modal [data-bp="post"]').click(); });
await wait(A, () => !document.getElementById('gcbp-modal'));
ok('B3 a small job (private) posts with just a trade and the scope', HUB.posts[1] && HUB.posts[1].leadId === 'L1' && HUB.posts[1].visibility === 'private', HUB.posts[1]);
/* B4 the bid question To-Do */
await A.ev(() => window._gcBidPost.jobs(true)); await sleep(500);
const td = await A.ev(() => window._gcBidPost.todo().map(x => ({ t: x.title, vis: x.vis, who: x.who })));
ok('B4 a job with unanswered bid questions → a To-Do for the poster ("❓ 2 bid questions to answer — …")', td.some(x => x.t === '❓ 2 bid questions to answer — Sample Office Build-Out' && x.vis === 'who'), td);
/* B5 Approvals: the papers */
await A.ev(() => window._setView('subs'));
const ap = await wait(A, () => document.querySelector('.gcsub-panel [data-bidreq="u_new1"] .gcsub-papers') && document.querySelector('.gcsub-panel [data-bidreq="u_new2"] .gcsub-papers'), null, 90000);
const aps = await A.ev(() => ['u_new1', 'u_new2'].map(id => { const r = document.querySelector('.gcsub-panel [data-bidreq="' + id + '"]'); return { txt: r.querySelector('.gcsub-papers').textContent, quick: !!r.querySelector('[data-quick]'), links: r.querySelectorAll('.gcsub-papers a').length, states: [...r.querySelectorAll('[data-paper]')].map(x => x.getAttribute('data-paper') + ':' + x.getAttribute('data-state')).join(',') }; }));
ok('B5 Approvals: "📎 Papers: W-9 ✓ on file · GL ✓ on file (exp …) · WC ✓ … · License TN #12345 ✓" with links and ⚡ Ready for quick approval', !!ap && /W-9 ✓ on file/.test(aps[0].txt) && /GL ✓ on file \(exp 2027-05-01\)/.test(aps[0].txt) && /License TN #12345 ✓/.test(aps[0].txt) && aps[0].quick && aps[0].links === 4, aps[0]);
ok('B5 a sub who only ticked "I have it": W-9 ☑ says has it, WC ☑ says exempt — no ⚡', /W-9 ☑ says has it/.test(aps[1].txt) && /WC ☑ says exempt/.test(aps[1].txt) && !aps[1].quick && aps[1].states === 'w9:says,gl:file,wc:says', aps[1]);
await A.ev(() => { const r = document.querySelector('.gcsub-panel [data-sec="bids"]'); if (r) r.scrollIntoView({ block: 'center' }); }); await sleep(400);
await shot(A, '05_approvals_papers');
ok('no page errors (admin)', !errs.length, errs);
/* B6 a PM: the button only on their own job */
const P = await computer('sbiffle@grayco-cs.com', { build: BUILD });
const errs2 = []; P.page().on('pageerror', e => errs2.push(String(e.message).slice(0, 200)));
await route(P, 'sbiffle@grayco-cs.com');
await signIn(P, 'sbiffle@grayco-cs.com', 15000); await sleep(7000);
const pm = await P.ev(() => ({ me: window._gcBidPost.state(), p1: window._gcBidPost.canPost({ pid: 'P1' }), p2: window._gcBidPost.canPost({ pid: 'P2' }) }));
ok('B6 a PM sees 📢 on their own job (P1, PM Sam Biffle) — not on another PM\'s job (P2)', pm.p1 === true && pm.p2 === false, pm);
ok('no page errors (PM)', !errs2.length, errs2);
if (SHOTS) fs.writeFileSync(SHOTS + '/index-crm.txt', ['CRM screenshots (test_BIDPOST.mjs) — made-up data',
  '01_bidportal_before_cleanup.png   🏗 Bid portal tab (📊 Bids & invites): old auto-added jobs (🤖) + the admin\'s "🧹 Clean up auto-added jobs (4)"',
  '02_bidportal_after_cleanup.png    after the clean-up: only the job posted on purpose; "🗄 Archived (4)"',
  '03_bidportal_archived.png         🗄 Archived: the auto-added jobs, each with ↩ Restore (nothing deleted)',
  '04_put_on_bid_portal_sheet.png    📢 Put on bid portal (on a job): 🌐 public, trades, due date, scope / specs, the job\'s files + Drive link',
  '05_approvals_papers.png           Subs → 🔨 Bid site requests: 📎 Papers (✓ on file / ☑ says has it / —) and ⚡ Ready for quick approval', ''].join('\n'));
const n = R.filter(Boolean).length; console.log('BIDPOST ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
