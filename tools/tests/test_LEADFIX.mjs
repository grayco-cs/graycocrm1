// test_LEADFIX.mjs <build-dir> — first the earlier patch LEADFIX's checks (test_LEADFIX_IMPORT.mjs, the Lead Inbox import), then patch LEADRISK (🚨 Leads at risk: ✓ Contacted / ✕ Clear / Clear all) and patch BIDAUTO (a job is on the
// bid portal only when a person put it there). Offline: made-up data, the offline harness, node only for the server files.
//   A. node — LEADRISK: lead-watch.js clearSig / cleared (a clear holds until something new happens on the lead; the lead is never closed);
//      the speed-to-lead reminders (bid-alerts speedCandidates) skip a cleared lead; the PM-reply ladder's "has not answered" step stops on it;
//      the card's header no longer says the owners are texted at 48 h (that text is off: QUIETSAT).
//   B. the CRM (two owners' computers): ✓ Contacted on a row = the lead's own ✅ Contacted (contactedAt / contactedBy / stage Contacted);
//      ✕ Clear takes a row off for good (lwClear + lwClearLog on the lead, who / when, the lead kept); "Clear all" asks inline (no pop-up),
//      Cancel keeps them, Yes clears the rest; the card disappears when empty; the second owner's computer sees it cleared (synced data);
//      a new event on a cleared lead (a new PM) brings it back.
// Usage: node test_LEADFIX.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = path.resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('usage: node test_LEADFIX.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const NOW = Date.parse('2026-11-20T17:00:00Z');
const iso = h => new Date(NOW - h * 3600e3).toISOString();

console.log('0. the earlier patch LEADFIX (the Lead Inbox import): tools/tests/test_LEADFIX_IMPORT.mjs');
{ const { spawnSync } = await import('child_process');
  const r = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'test_LEADFIX_IMPORT.mjs'), build], { encoding: 'utf8' });
  const last = String(r.stdout || '').trim().split('\n').pop();
  ok(r.status === 0 && /^OK /.test(last), 'the Lead Inbox import checks pass (' + last + ')', String(r.stdout || '').split('\n').filter(x => /✗/.test(x)).slice(0, 5)); }
console.log('A. node: LEADRISK — the clear, the server');
const LW = require(path.join(build, 'netlify/functions/_lib/lead-watch.js'));
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
{
  const l = { id: 'X1', name: 'Johnson', source: 'Phone call', stage: 'New Lead', createdAt: iso(260), pm: 'Demo PM', pmEmail: 'pm@grayco-cs.com', assignedAt: iso(240) };
  ok(LW.risk(l, NOW) && LW.risk(l, NOW).k === 'pm48', 'a PM has had the lead 10 days, not contacted → at risk');
  const c = Object.assign({}, l, { lwClear: { at: iso(1), by: 'Owner', byEmail: 'o@x', sig: LW.clearSig(l) }, lwClearLog: [{ at: iso(1) }], updatedAt: iso(0) });
  ok(LW.cleared(c) && LW.risk(c, NOW) === null && !LW.closed(c) && LW.risk(c, NOW, { withCleared: true }), 'cleared: off the clock, the lead is not closed (withCleared still sees it)');
  ok(LW.cleared(Object.assign({}, c, { activity: [{ type: 'system', text: '📱 texted', by: 'GrayCo text' }], updatedAt: iso(-1) })), 'the CRM\'s own lines / a save do not bring it back');
  ok(!LW.cleared(Object.assign({}, c, { pm: 'Other PM', assignedAt: iso(30) })) && !LW.cleared(Object.assign({}, c, { calls: [{ at: iso(0), by: 'missed call', type: 'inbound' }] })) && !LW.cleared(Object.assign({}, c, { stage: 'Lost' })),
    'something new (a new PM, a call, the stage) → not cleared any more');
  const BA = require(path.join(build, 'netlify/functions/_lib/bid-alerts.js'));
  const api = BA.make({ env: () => '', s: v => (v == null ? '' : String(v)).trim(), low: v => (v == null ? '' : String(v)).trim().toLowerCase(), arr: v => Array.isArray(v) ? v : [], nowIso: () => new Date(NOW).toISOString(), sb: async () => ({ ok: false }), kvCas: async () => ({}), kvGet: async () => null, now: () => NOW });
  const web = { id: 'W1', name: 'Website lead', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(30) };
  const webC = Object.assign({}, web, { lwClear: { at: iso(1), by: 'Owner', sig: LW.clearSig(web) } });
  const cand = api.speedCandidates([web, webC].map((x, i) => Object.assign({}, x, { id: 'W' + i })), [], {});
  ok(cand.length === 1 && cand[0].key === 'W0', 'speed to lead (the owners\' "assign it" texts, the PM\'s reminder) skips a cleared lead', cand.map(x => x.key));
  const sms = fs.readFileSync(path.join(build, 'netlify/functions/_lib/smsalert.js'), 'utf8');
  ok(/leadCleared: async id =>/.test(sms) && /e\.kind === 'reply'\) \{ try \{ if \(await _D\.leadCleared\(e\.leadId\)\) done = true;/.test(sms), 'the PM-reply ladder ("<PM> has not answered") stops on a cleared lead');
  ok(/return \{ skipped: 'off \(owner 11\/22: never send the 48 h "has not contacted" alert\)' \};/.test(sms), 'the 48 h "<PM> has not contacted" owners\' text stays off (QUIETSAT)');
  const iL = t.indexOf('<script id="gc-patch-leadwatch">'), blk = t.slice(iL, t.indexOf('</script>', iL));
  ok(!/owners are texted at/.test(blk), 'the card header no longer says the owners are texted at 48 h');
  const a = t.indexOf('/* __LEADWATCH_CORE_BEGIN__'), b = t.indexOf('/* __LEADWATCH_CORE_END__ */');
  ok(t.slice(t.indexOf('\n', a) + 1, b).replace(/\n+$/, '') === fs.readFileSync(path.join(build, 'netlify/functions/_lib/lead-watch.js'), 'utf8').replace(/\n+$/, ''), 'lead-watch.js is inlined word for word');
  ok(!/wjohnson|ngray|Wesley|Nick/i.test(blk), 'no names or e-mails in the block (roles decide)');
  ok(/LAST\.at && Math\.abs\(rt - LAST\.at\) < 3000 && LAST\.ref === ref/.test(blk), 'the card\'s list cache is keyed on the real clock and the leads list itself (patch LWCACHE: a synced new PM is never hidden by a stale list)');
}

/* ── C. BIDAUTO (node: the real bid-hub / subportal / bid-portal over the in-memory Supabase of qaa_world.mjs) ── */
if (fs.existsSync(path.join(build, 'tools/patch_BIDAUTO.py'))) {
  console.log('C. node: BIDAUTO — a job is on the bid portal only when a person put it there');
  const W = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'qaa_world.mjs')).href);
  const { DB, putRow, rowData } = W;
  W.install();
  const F = W.fns(build), Hb = F.hub._test, BPX = require(path.join(build, 'netlify/functions/_lib/bid-portal.js'));
  W.H.resetCloud();
  W.H.cset('users', [{ id: 'u1', name: 'Owner One', email: 'wjohnson@grayco-cs.com', role: 'Admin' }]);
  DB.sp_rows.length = 0;
  const OWN = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Owner One', admin: true, estimator: false, canPublic: true, canInvite: true };
  const AUTO = { status: 'open', draft: false, visibility: 'private', autoPrivate: true, openedBy: 'auto', openedPrivateAt: '2026-11-01T12:00:00Z', createdBy: 'lead-inbox' };
  const job = (id, extra) => putRow('jobs', id, Object.assign({ id, title: 'Demo job ' + id, leadInbox: { id: 'LI-' + id } }, extra), { job_id: id });
  job('J_auto', AUTO);
  job('J_auto2', Object.assign({}, AUTO, { openedBy: 'someone@grayco-cs.com' }));   /* the old CRM sweep opened it under the signed-in person's name */
  job('J_abid', AUTO); putRow('bids', 'b1', { id: 'b1', jobId: 'J_abid', userId: 'u_b', amount: 10 }, { job_id: 'J_abid', user_id: 'u_b' });
  job('J_aq', AUTO); putRow('questions', 'q1', { id: 'q1', jobId: 'J_aq', userId: 'u_x', body: '?' }, { job_id: 'J_aq', user_id: 'u_x' });
  job('J_ainv', AUTO); putRow('invites', 'i1', { id: 'i1', jobId: 'J_ainv', email: 'inv@demo.test' }, { job_id: 'J_ainv', email: 'inv@demo.test' });
  job('J_apr', AUTO); putRow('planreqs', 'pr1', { id: 'pr1', jobId: 'J_apr', email: 'pr@demo.test', at: '2026-11-02T12:00:00Z' }, { job_id: 'J_apr' });
  job('J_posted', { status: 'open', draft: false, visibility: 'private', postedAt: '2026-11-10T12:00:00Z', postedBy: 'wjohnson@grayco-cs.com', openedPrivateAt: '2026-11-10T12:00:00Z', openedBy: 'wjohnson@grayco-cs.com', crmLeadId: 'LX1' });
  job('J_pub', Object.assign({}, AUTO, { visibility: 'public', publishedAt: '2026-11-03T12:00:00Z', publishedBy: 'wjohnson@grayco-cs.com' }));
  job('J_draft', { status: 'draft', draft: true, visibility: 'private', createdBy: 'lead-inbox' });
  ok(BPX.autoOpened({ autoPrivate: true, openedBy: 'auto', draft: false, status: 'open' }) && !BPX.autoOpened({ autoPrivate: true, draft: false, status: 'open', postedAt: 'x' }) && !BPX.autoOpened({ draft: true, autoPrivate: true })
    && BPX.autoDraft({ openedBy: 'auto', draft: false }, {}) && !BPX.autoDraft({ openedBy: 'auto', draft: false }, { bids: 1 }), 'the rule (bid-portal.js): auto-opened = the old automatic opening and no person since; a sub\'s touch keeps it');
  const list = await Hb.jobsList(), J = id => list.find(x => x.id === id) || {};
  ok(['J_auto', 'J_auto2'].every(id => J(id).autoDraft && J(id).draft && J(id).visibility === 'draft'), 'the old automatic jobs nobody touched read as drafts (read time — the stored rows are unchanged)', ['J_auto', 'J_auto2'].map(id => [J(id).visibility, J(id).autoDraft]));
  ok(rowData('jobs/J_auto').draft === false && rowData('jobs/J_auto').visibility === 'private' && rowData('jobs/J_auto').autoPrivate === true, '… nothing was written to the bid job itself');
  ok(['J_abid', 'J_aq', 'J_ainv', 'J_apr'].every(id => J(id).autoOpenedTouched && !J(id).draft && J(id).visibility === 'private'), 'a job a sub already touched (a bid, a question, an invite, a plan request) is kept as it is', ['J_abid', 'J_aq', 'J_ainv', 'J_apr'].map(id => [id, J(id).visibility, J(id).subTouch]));
  ok(J('J_posted').personOpened && !J('J_posted').draft && J('J_posted').visibility === 'private' && J('J_pub').visibility === 'public' && !J('J_pub').autoDraft, 'a job a person put on (📢 posted, published) is still listed as on the bid portal', [J('J_posted'), J('J_pub')].map(j => [j.id, j.visibility, j.personOpened]));
  ok(J('J_draft').draft && !J('J_draft').autoDraft, 'a plain draft stays a draft');
  const rep = JSON.parse((await F.hub.handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { autoopen: '1' } })).body || '{}');
  ok(rep && (rep.error || rep.ok), 'GET ?autoopen=1 answers (staff sign-in checked)', rep);
  const sub = await (async () => { DB.gc_staff.length = 0; DB.gc_staff.push({ email: 'wjohnson@grayco-cs.com', name: 'Owner One', role: 'admin', active: true }); W.TOK['t-own'] = 'wjohnson@grayco-cs.com';
    return JSON.parse((await F.hub.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer t-own', origin: 'https://app.local' }, queryStringParameters: { autoopen: '1' } })).body || '{}'); })();
  ok(sub.ok && sub.autoOpened === 6 && sub.nowDrafts === 2 && sub.subTouched.map(x => x.id).sort().join() === 'J_abid,J_ainv,J_apr,J_aq', 'the owner\'s list (?autoopen=1, admins): 6 opened by the old automatic way, 2 now drafts, 4 a sub touched — kept, listed', sub);
  /* the subs' view */
  putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'any@demo.test', name: 'Any Sub', company: 'Any Co', trades: [] }, { user_id: 'u_a', email: 'any@demo.test' });
  putRow('users', 'u_i', { id: 'u_i', role: 'sub', approved: true, email: 'inv@demo.test', name: 'Invited Sub', company: 'Inv Co', trades: [] }, { user_id: 'u_i', email: 'inv@demo.test' });
  putRow('users', 'u_b', { id: 'u_b', role: 'sub', approved: true, email: 'bid@demo.test', name: 'Bid Sub', company: 'Bid Co', trades: [] }, { user_id: 'u_b', email: 'bid@demo.test' });
  Object.assign(W.TOK, { 't-a': 'any@demo.test', 't-i': 'inv@demo.test', 't-b': 'bid@demo.test' });
  const seen = async tok => ((JSON.parse((await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tok, origin: 'https://bids.test' }, body: JSON.stringify({ action: 'load', keys: ['jobs'] }) })).body).data || {}).jobs || []).map(j => j.id).sort();
  const sa = await seen('t-a'), si = await seen('t-i'), sb2 = await seen('t-b');
  ok(sa.join() === 'J_pub', 'a sub who was never invited sees only the job a person published — none of the old automatic ones', sa);
  ok(si.includes('J_ainv') && !si.includes('J_auto') && sb2.includes('J_abid') && !sb2.includes('J_auto2'), 'the sub invited to an old automatic job, and the sub who bid on one, still see it', { si, sb2 });
  /* nothing opens a job by itself */
  process.env.BID_PORTAL_AUTO = '1';
  const sw = await F.hub.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer t-own', origin: 'https://app.local' }, body: JSON.stringify({ op: 'sweep' }) });
  const swb = JSON.parse(sw.body || '{}');
  ok(swb.ok && swb.opened === 0 && rowData('jobs/J_draft').draft === true, 'bid-hub op sweep never opens a draft, even with BID_PORTAL_AUTO=1', swb);
  const bp = BPX.make({ env: k => process.env[k] || '', s: v => (v == null ? '' : String(v)).trim(), low: v => (v == null ? '' : String(v)).trim().toLowerCase(), arr: v => Array.isArray(v) ? v : [], nowIso: () => new Date().toISOString(),
    sbUrl: () => 'https://sb.test', svcH: h => Object.assign({ apikey: 'svc-test', Authorization: 'Bearer svc-test' }, h || {}), kvCas: async () => ({}), kvGet: async () => [] });
  const it = { id: 'LI-newlead', title: 'Demo new bid lead', source: 'City of Demo', type: 'Government', bidDue: '2026-12-10', estimator: 'Demo Estimator' };
  const r1 = await bp.setPortal(it, { mode: 'private', auto: true }, { email: 'auto' }), j1 = rowData('jobs/' + bp.jobIdFor(it));
  ok(r1.ok && r1.state === 'draft' && j1 && j1.draft === true && j1.status === 'draft' && !j1.autoPrivate && !j1.openedPrivateAt, 'an automatic setPortal call leaves a NEW lead\'s job a hidden draft (never opened to subs)', { r1, j1: j1 && { d: j1.draft, s: j1.status, v: j1.visibility } });
  const r2 = await bp.setPortal(it, { mode: 'private' }, { email: 'wjohnson@grayco-cs.com' }), j2 = rowData('jobs/' + bp.jobIdFor(it));
  ok(r2.ok && r2.state === 'private' && j2.draft === false && j2.personOpenedBy === 'wjohnson@grayco-cs.com' && BPX.personOpened(j2) && !BPX.autoOpened(j2), 'a person\'s "private" puts it on (personOpened)', { r2, by: j2.personOpenedBy });
  delete process.env.BID_PORTAL_AUTO;
  const bi = fs.readFileSync(path.join(build, 'netlify/functions/bid-inbox.js'), 'utf8');
  ok(!/setPortal\(it, \{ mode: 'private', auto: true \}/.test(bi) && /const auto = false;/.test(bi), 'bid-inbox: no automatic private opening of new leads (afterStore), the CRM\'s portal op never auto-opens');
  /* a person opens an old automatic job → on */
  const vr = await F.hub.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer t-own', origin: 'https://app.local' }, body: JSON.stringify({ op: 'visibility', jobId: 'J_auto', mode: 'private' }) });
  const ja = rowData('jobs/J_auto');
  ok(vr.statusCode === 200 && ja.autoPrivate === false && ja.personOpenedBy === 'wjohnson@grayco-cs.com' && !(await Hb.jobsList()).find(x => x.id === 'J_auto').autoDraft, 'a person\'s 🔒 Private on an old automatic job puts it on the bid portal for real', { code: vr.statusCode, ja: { ap: ja.autoPrivate, by: ja.personOpenedBy } });
  /* the badge text (the Lead Inbox Leads list) */
  const seg = (a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i); return i >= 0 && j > i ? t.slice(i, j) : ''; };
  const code = seg('function lxOn(p){', 'function lxHay(l){');
  const mk = (on) => new Function('window', 'isNew', "function s(v){ return v == null ? '' : String(v).trim(); }\n" + code + '\nreturn { lxStatus: lxStatus, lxOn: lxOn };')({ _gcBidPortalOn: () => on }, () => false);
  const L0 = { id: 'L1', inboxId: 'LI-1' };
  ok(code && mk('draft').lxStatus(L0, { jobId: 'j', state: 'published' }).t === 'Draft (not on portal)' && mk('on').lxStatus(L0, { jobId: 'j', state: 'published' }).t === 'On bid portal'
    && mk('on').lxStatus(L0, { jobId: 'j', state: 'private' }).t === 'On bid portal' && mk('gone').lxStatus(L0, { jobId: 'j', state: 'published' }).t !== 'On bid portal', 'the Leads list badge: "On bid portal" only for a job a person put on; the old automatic one says "Draft (not on portal)"');
  const pon = seg('W._gcBidPortalOn = function(p){', '\n};');
  const PO = (jobsL) => new Function('W', 'JOBS', 'jobs', 'BA', "function s(v){ return v == null ? '' : String(v).trim(); } function arr(v){ return Array.isArray(v) ? v : []; }\n" + seg('function bidJobOf(id){', 'W._gcBidPortalOn = function(p){') + pon + '\n};\nreturn W._gcBidPortalOn;')({}, { at: jobsL ? 1 : 0, list: jobsL }, () => Promise.resolve([]), { asked: Date.now() });
  const LST = (await Hb.jobsList());
  const on = PO(LST);
  ok(on({ jobId: 'J_abid', state: 'published' }) === 'on' && on({ jobId: 'J_auto2', state: 'published' }) === 'draft' && on({ jobId: 'J_posted', state: 'private' }) === 'on' && on({ jobId: 'J_draft', state: 'draft' }) === 'draft' && on(null) === '',
    'window._gcBidPortalOn reads bid-hub\'s list: the person-opened and the sub-touched jobs are on, the untouched automatic one is a draft');
  ok(PO(null)({ jobId: 'J_x', state: 'published' }) === 'draft' && PO(null)({ jobId: 'J_x', state: 'published', publishedBy: 'wjohnson@grayco-cs.com' }) === 'on', '… before the list is loaded only a person\'s Publish counts as on');
}

if (process.env.LEADFIX_NODE_ONLY === '1') { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

/* ── B. the CRM ── */
const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const PM = byId('u-pm'), ADMIN = byId('u-wesley'), ADMIN2 = byId('u-nick');
H.onFn('automation-pause', () => ({ paused: false, flag: { on: false } }));
const LEADS = () => [
  { id: 'LR_J', name: 'Johnson', contactName: 'Sample Home J', phone: '(901) 555-0121', source: 'Phone call', stage: 'New Lead', createdAt: iso(250), pm: 'Demo PM', pmEmail: PM, assignedAt: iso(240), leadKind: 'Residential', companyId: 'construction' },
  { id: 'LR_W', name: 'Website lead — Sample Home K', contactName: 'Sample Home K', phone: '(901) 555-0122', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(6), leadKind: 'Residential', companyId: 'construction' },
  { id: 'LR_W2', name: 'Website lead — Sample Home L', contactName: 'Sample Home L', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(30), leadKind: 'Residential', companyId: 'construction' },
  { id: 'LR_P', name: 'Phone lead — Sample Home M', contactName: 'Sample Home M', phone: '(901) 555-0124', source: 'Phone call', stage: 'New Lead', createdAt: iso(130), pm: 'Demo PM', pmEmail: PM, assignedAt: iso(30), leadKind: 'Residential', companyId: 'construction' },
  { id: 'LR_OK', name: 'Contacted already', contactName: 'Sample Home N', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(50), pm: 'Demo PM', pmEmail: PM, assignedAt: iso(49), contactedAt: iso(48), companyId: 'construction' }];
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Owner One', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u4', name: 'Owner Two', email: ADMIN2, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', active: true }]);
  H.cset('leads', LEADS());
  for (const k of ['projects', 'invs', 'customers', 'schedule', 'estimates', 'expenses', 'vendors', 'subs', 'punch', 'projectDocs', 'gc_office_tasks']) H.cset(k, []);
  H.cset('gc_epahud_seed_v1', { at: '2026-11-18T00:00:00.000Z' });
}
const INIT = `window.__GC_LW_NOW__ = ${NOW}; window.__GC_PAPERS_TODAY__ = '2026-11-20';`;
const sev = async (A, f, x) => { for (let i = 0; i < 30; i++) { try { return await A.ev(f, x); } catch (e) { if (!/context was destroyed|navigation|Target closed/i.test(String(e))) throw e; await sleep(1000); } } return A.ev(f, x); };
const rowsOf = A => sev(A, () => { const c = document.getElementById('gc-lw-card'); return c ? { ids: [...c.querySelectorAll('[data-lw-row]')].map(r => r.getAttribute('data-lw-row')).sort(), text: c.innerText, btn: [...c.querySelectorAll('[data-lw-row]')].map(r => [...r.querySelectorAll('button')].map(b => b.textContent.trim()).join('|')) } : null; });
/* who did it: the owner's name on the CRM's people list, or the sign-in's (the page knows one or the other first) */
const ME = new RegExp('^(Owner One|' + H.ACCOUNTS[ADMIN].name + ')$');
const cloudLead = id => (H.cget('leads') || []).find(l => l && l.id === id);
const OPEN = [];
try {
  seed();
  console.log('B. the owners: ✓ Contacted, ✕ Clear, Clear all — shared across computers');
  const A = await H.computer('OWNER1', { build, init: [INIT] }); OPEN.push(A);
  await H.signIn(A, ADMIN, 30000);
  await H.waitFor(A, () => window._gcLeadWatch && (window._crm.leads || []).length >= 5, null, 60000);
  await sev(A, () => { window._setView('leads'); });
  await H.waitFor(A, () => !!document.getElementById('gc-lw-card') && !!window._gcLeadsHub, null, 20000);
  let c = await rowsOf(A);
  ok(c && c.ids.join() === 'LR_J,LR_P,LR_W,LR_W2', 'the card lists the four leads at risk', c);
  ok(c && /Not contacted — Demo PM has had it 10 days/.test(c.text) && c.btn.every(x => /Open\|✓ Contacted\|✕ Clear/.test(x)) && /Clear all/.test(c.text), 'each row: Open, ✓ Contacted, ✕ Clear; the card: Clear all', c);
  ok(!/owners are texted/.test(c.text), 'the header does not promise a 48 h owners\' text', c.text);

  await sev(A, () => document.querySelector('#gc-lw-card [data-lw-done="LR_W"]').click());
  c = await H.waitFor(A, () => { const x = document.getElementById('gc-lw-card'); return x && !x.querySelector('[data-lw-row="LR_W"]') ? true : null; }, null, 10000);
  ok(!!c, '✓ Contacted takes the row off');
  const w = await (async () => { for (let i = 0; i < 120; i++) { const l = cloudLead('LR_W'); if (l && l.contactedAt) return l; await sleep(500); } return cloudLead('LR_W'); })();
  ok(w && w.contactedAt && ME.test(w.contactedBy) && w.stage === 'Contacted' && w.lastContact, 'it is the lead\'s own ✅ Contacted: contactedAt / contactedBy / stage Contacted, saved to the synced leads', w && { contactedAt: w.contactedAt, by: w.contactedBy, stage: w.stage });

  await H.waitFor(A, () => !!document.querySelector('#gc-lw-card [data-lw-clear="LR_J"]'), null, 10000);
  await sev(A, () => document.querySelector('#gc-lw-card [data-lw-clear="LR_J"]').click());
  ok(!!(await H.waitFor(A, () => { const x = document.getElementById('gc-lw-card'); return x && !x.querySelector('[data-lw-row="LR_J"]') ? true : null; }, null, 10000)), '✕ Clear takes the row off');
  const j = await (async () => { for (let i = 0; i < 40; i++) { const l = cloudLead('LR_J'); if (l && l.lwClear) return l; await sleep(500); } return cloudLead('LR_J'); })();
  ok(j && j.lwClear && ME.test(j.lwClear.by) && j.lwClear.byEmail === ADMIN && j.lwClear.at && j.lwClear.sig && (j.lwClearLog || []).length === 1 && j.lwClear.all === false, 'who and when are on the lead (lwClear) and kept in lwClearLog', j && { c: j.lwClear, n: (j.lwClearLog || []).length });
  ok(j && !j.archived && !j.deleted && j.stage === 'New Lead' && (H.cget('leads') || []).length === 5, 'the lead itself is kept as it was (never deleted, closed or archived)', j && { a: j.archived, d: j.deleted, st: j.stage });

  await sev(A, () => document.querySelector('#gc-lw-card [data-lw-clearall="ask"]').click());
  c = await rowsOf(A);
  ok(c && /Clear all 2\?/.test(c.text) && /Yes, clear all/.test(c.text) && c.ids.join() === 'LR_P,LR_W2', 'Clear all asks inline: "Clear all 2?" Yes / Cancel', c);
  await sev(A, () => document.querySelector('#gc-lw-card [data-lw-clearall="no"]').click());
  c = await rowsOf(A);
  ok(c && c.ids.join() === 'LR_P,LR_W2' && !/Yes, clear all/.test(c.text), 'Cancel keeps them', c);
  await sev(A, () => document.querySelector('#gc-lw-card [data-lw-clearall="ask"]').click());
  await sev(A, () => document.querySelector('#gc-lw-card [data-lw-clearall="yes"]').click());
  ok(!!(await H.waitFor(A, () => !document.getElementById('gc-lw-card') ? true : null, null, 10000)), 'the card disappears when it is empty');
  ok(!A.dialogs || !A.dialogs.length, 'no pop-up (no confirm / alert)', A.dialogs);
  const both = await (async () => { for (let i = 0; i < 40; i++) { const p = cloudLead('LR_P'), q = cloudLead('LR_W2'); if (p && p.lwClear && q && q.lwClear) return [p, q]; await sleep(500); } return [cloudLead('LR_P'), cloudLead('LR_W2')]; })();
  ok(both.every(l => l && l.lwClear && l.lwClear.all === true && ME.test(l.lwClear.by)), 'Clear all is saved on each lead (all: true)', both.map(l => l && l.lwClear));

  const B = await H.computer('OWNER2', { build, init: [INIT] }); OPEN.push(B);
  await H.signIn(B, ADMIN2, 30000);
  await H.waitFor(B, () => window._gcLeadWatch && (window._crm.leads || []).length >= 5 && (window._crm.leads || []).some(l => l.id === 'LR_J' && l.lwClear), null, 60000);
  await sev(B, () => { window._setView('leads'); }); await sleep(3500);
  const b1 = await sev(B, () => ({ card: !!document.getElementById('gc-lw-card'), list: window._gcLeadWatch.list().map(z => z.l.id) }));
  ok(b1 && !b1.card && b1.list.length === 0, 'the other owner\'s computer: cleared there too (the card is not shown)', b1);

  /* something new on a cleared lead: another PM takes it */
  const L2 = (H.cget('leads') || []).map(l => l.id === 'LR_J' ? Object.assign({}, l, { pm: 'Demo Estimator', assignedAt: iso(30), updatedAt: new Date().toISOString() }) : l);
  H.cset('leads', L2);
  await B.page().reload({ waitUntil: 'domcontentloaded' });
  await H.waitFor(B, () => window._gcLeadWatch && (window._crm.leads || []).some(l => l.id === 'LR_J' && l.pm === 'Demo Estimator'), null, 60000);
  await sev(B, () => { window._setView('leads'); });
  const back = await H.waitFor(B, () => { const x = document.getElementById('gc-lw-card'); return x ? [...x.querySelectorAll('[data-lw-row]')].map(r => r.getAttribute('data-lw-row')).join() : null; }, null, 45000);
  if (back !== 'LR_J') console.log(JSON.stringify(await sev(B, () => { const l = (window._crm.leads || []).find(x => x.id === 'LR_J'); const C = window._gcLeadWatchCore; return { l, sig: C.clearSig(l), cl: C.cleared(l), r: C.risk(l, window.__GC_LW_NOW__, { withCleared: true }), list: window._gcLeadWatch.list().map(z => z.l.id), st: window._gcLeadWatch.state() }; })).slice(0, 3000));
  ok(back === 'LR_J', 'a new event on a cleared lead (a new PM) brings it back — only that one', back);
} catch (e) { fail++; console.log('  ✗ FAIL exception ' + (e && e.stack || e)); }
finally { for (const A of OPEN) { try { await A.close(); } catch (e) {} } }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
