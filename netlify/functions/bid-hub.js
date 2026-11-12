/* ============================================================================
   GrayCo — the CRM's 🏗 BID PORTAL tab (patch SYS).   netlify/functions/bid-hub.js

   Owner (10/22): "sub bids can come from bids@ or from the bid portal or sub portal; all leads Glenn gets also go
   into our bid portal as PRIVATE until we switch it over to public; we can invite subs on public bids or invite
   all subs; the bid portal on the estimators' tabs and on admin and office."

   GrayCo staff only (a CRM sign-in on the gc_staff list). Subs, their names and their prices never reach a
   customer: nothing here answers anyone but staff.

     GET  ?jobs=1                 → every bid job: private / public / draft, invited, sub bids, due date, its lead
     GET  ?subbids=<jobId>        → ONE list of the job's sub bids from all three doors:
                                     ✉️ e-mailed to bids@ (gc_sub_bids_email), 🏗 the bid portal (sp_rows bids),
                                     🔨 the sub portal (a bid from a sub who came in through portal.grayco-cs.com)
          (&lead=<inbox id | crm:<lead id>> instead of a job id works too)
     GET  ?subs=1[&job=<id>]      → the invite picker: CRM subs + bid-site subs, ⭐ Preferred first, ⛔ Do not use hidden
     POST {op:'visibility', jobId, mode:'private'|'public'}   public: an admin or an estimator, and a bid due date
     POST {op:'invite', jobId, emails:[…] | all:true, trades:[…]}   one e-mail per sub (in Spanish when that is theirs)
     POST {op:'award', jobId, source, id, on}                  mark a sub bid awarded (or not)
     POST {op:'link', jobId, projectId, projectName}            the CRM project its awarded bids go into (patch BIDEST)
     POST {op:'sweep'}            every estimator lead's draft bid job → PRIVATE (the backfill; never touches a public one)
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const BI = require('./bid-inbox.js');
const L = BI._lib, T = BI._test;
const SP = require('./subportal.js')._hub;
const { s, low, arr, nowIso } = L;

const GONE = /^(deleted|archived)$/i;
function hdr(e, k){ const h = (e && e.headers) || {}; return String(h[k] || h[k.toLowerCase()] || ''); }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function J(code, body, C){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, C || {}), body: JSON.stringify(body) }; }

/* who: staffAuth (bid-inbox) + the profile (estimator / office) from gc_staff */
async function whoIs(event){
  const who = await T.staffAuth(event); if (!who.ok) return who;
  let prof = '';
  try { const r = await L.sb('gc_staff?select=profile,role&email=eq.' + encodeURIComponent(who.email)); if (r.ok) { const row = arr(await r.json())[0]; prof = low(row && (s(row.profile) + ' ' + s(row.role))); } } catch (e) {}
  who.estimator = /estimat/.test(prof + ' ' + who.role);
  /* patch LEADBP (owner 11/12: "Glenn needs to [put leads on the bid portal] too"): the CRM's people list (Admin → Employees, role "Estimator")
     counts too — the gc_staff row of an estimator often says only "staff" */
  if (!who.estimator && !who.admin) { try { const d = await crmLists(); const u = arr(d.users).find(x => x && low(x.email) === who.email && x.active !== false); if (u && /estimat/i.test(s(u.role) + ' ' + s(u.profile) + ' ' + s(u.title))) who.estimator = true; } catch (e) {} }
  who.office = /office/.test(prof + ' ' + who.role) || who.email === 'office@grayco-cs.com';
  who.canInvite = who.admin || who.estimator || who.office;
  who.canPublic = who.admin || who.estimator;
  return who;
}

function amountOf(t){   /* "$12,500.00" / "12,500 total" in an e-mailed bid — best effort */
  const m = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,9}(?:\.\d{2})?)/.exec(s(t)) || /\b(?:total|bid|price|amount|lump sum)\b[^\d$]{0,20}(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,9}(?:\.\d{2})?)/i.exec(s(t));
  return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) / 100 : null;
}
function tradeOf(u, crmByEmail, email){
  const t = arr(u && u.trades).map(s).filter(Boolean);
  if (t.length) return t[0];
  const c = crmByEmail[low(email)]; return c ? s(c.trade) : '';
}
async function users(){ try { return (await SP.listRows([SP.eq('collection', 'users')])).map(r => r.data || {}); } catch (e) { return []; } }
async function crmSubsRaw(){ try { return SP.crmSubList(await SP.crmData()); } catch (e) { return []; } }
async function crmRanked(){ try { return await SP.crmSubs(); } catch (e) { return []; } }
function langOf(spUser, crmRaw){ return low((spUser && spUser.lang) || (crmRaw && (crmRaw.lang || crmRaw.language || crmRaw.preferredLang))).slice(0, 2) === 'es' || /spanish|espa/i.test(s(crmRaw && (crmRaw.language || crmRaw.lang))) ? 'es' : 'en'; }

/* ── the bid jobs ── */
async function jobsList(){
  const [jobs, invites, bids, plans, qs] = await Promise.all([
    SP.listRows([SP.eq('collection', 'jobs')]), SP.listRows([SP.eq('collection', 'invites')]).catch(() => []), SP.listRows([SP.eq('collection', 'bids')]).catch(() => []),
    SP.listRows([SP.eq('collection', 'plans')]).catch(() => []), SP.listRows([SP.eq('collection', 'questions')]).catch(() => [])]);
  const mail = arr(await L.kvGet(T.KV_SUBBIDS).catch(() => []));
  const reqN = {}; (await SP.listRows([SP.eq('collection', 'planreqs')]).catch(() => [])).forEach(r => { if (SP.prOpen && SP.prOpen(r.data)) reqN[r.job_id] = (reqN[r.job_id] || 0) + 1; });   /* patch PLANREQ: 📩 open plan / info requests */
  const c = counts(invites, bids, mail, plans, qs);
  return jobs.map(r => r.data || {}).filter(j => j.id && (!GONE.test(s(j.status)) || restorable(j))).map(j => {
    const k = c(j.id);
    return {
    deleted: GONE.test(s(j.status)), deletedAt: s(j.archivedAt), deletedBy: s(j.archivedBy),   /* patch SYS2: 🗑 Deleted (n), restorable for 30 days */
    archived: GONE.test(s(j.status)) && /^(auto|taken off)$/.test(s(j.archivedReason)), archivedReason: s(j.archivedReason),   /* patch BIDPOST: 🗄 Archived (auto-added, taken off) */
    id: s(j.id), title: s(j.title), address: s(j.address), po: s(j.poNumber), status: s(j.status), draft: j.draft === true || low(j.status) === 'draft',
    visibility: j.draft === true || low(j.status) === 'draft' ? 'draft' : (s(j.visibility) || 'public'), due: validDay(j.bidDueDate), dueTime: s(j.bidDueTime), trades: tradesPicked(j) ? s(j.tradesSought) : '', tradesSuggested: tradesPicked(j) ? '' : s(j.tradesSought),   /* patch PLANREQ-H */
    invited: k.invites, bids: k.bids, plans: k.plans, openQ: k.openQ, openReq: reqN[s(j.id)] || 0, leadId: s(j.leadInbox && j.leadInbox.id), source: s(j.leadInbox && j.leadInbox.source), autoPrivate: !!j.autoPrivate, updatedAt: s(j.updatedAt),
    biddingClosed: !!j.biddingClosed, projectType: s(j.projectType), ourDue: validDay(j.ourDue), ourDueTime: s(j.ourDueTime), crmProjectId: s(j.crmProjectId), crmProjectName: s(j.crmProjectName),   /* patch BIDEST: the CRM project this job's awarded bids go into */
    crmLeadId: s(j.crmLeadId), crmEstId: s(j.crmEstId), postedBy: s(j.postedBy), postedByName: s(j.postedByName), postedAt: s(j.postedAt), pmEmail: s(j.pmEmail), pmName: s(j.pmName),   /* patch BIDPOST */
    auto: !GONE.test(s(j.status)) && autoAdded(j, k)
  }; }).sort((a, b) => (a.draft - b.draft) || (s(a.due) || '9999').localeCompare(s(b.due) || '9999') || a.title.localeCompare(b.title));
}
/* ── patch BIDPOST (owner 11/12): "so many not needed, not real leads or plans — make it where I have to put jobs into the bid portal,
   nothing goes automatic" ─────────────────────────────────────────────────────────────────────────────────────────────────────────
   A job a PERSON posted: 📢 Put on bid portal (postedAt), an admin's / estimator's Publish or Make private / public (publishedBy /
   openedBy that is a person), or one made on the bid site itself. AUTO-ADDED: made by the Lead Inbox / the CRM's old "every lead →
   a draft" sweep, never posted by a person, with no plans, bids, invites or questions. "🧹 Clean up auto-added jobs" (an admin's
   click) archives those (status archived, archivedReason auto — restorable any time from 🗄 Archived); nothing is deleted. */
/* patch PLANREQ-H (owner 11/12: "it auto selected a lot of these"): a bid job's trades are only what a PERSON picked (📢 Put on bid portal,
   ✏️ Trades). Trades copied from a bid-board / GC invite by the Lead Inbox are only SUGGESTED (shown as chips to tap), never selected. */
function tradesPicked(j){ if (!j) return false; if (j.tradesPicked === true) return true; return !(s(j.createdBy) === 'lead-inbox' || !!(j.leadInbox && s(j.leadInbox.id))); }
function tradeSplit(v){ const seen = {}; return s(v).split(/\s*[,;]\s*/).map(x => s(x)).filter(x => { const k = low(x); if (!x || seen[k]) return false; seen[k] = 1; return true; }); }
function validDay(v){ const d = s(v).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || s(v).length > 10 && !/^[T ]/.test(s(v).slice(10, 11))) return ''; const x = new Date(d + 'T12:00:00Z'); return !isNaN(x) && x.toISOString().slice(0, 10) === d ? d : ''; }
function counts(invites, bids, mail, plans, qs){
  const n = {}; const add = (id, k, v) => { if (!id) return; const o = n[id] || (n[id] = { invites: 0, bids: 0, plans: 0, leadPlans: 0, questions: 0, openQ: 0 }); o[k] += v == null ? 1 : v; };
  invites.forEach(r => add(r.job_id, 'invites'));
  bids.forEach(r => { if (!(r.data && r.data.fromEmailBid)) add(r.job_id, 'bids'); });
  mail.forEach(x => { if (x && x.jobId) add(x.jobId, 'bids'); });
  plans.forEach(r => { const it = arr(r.data && r.data.items); add(r.job_id || r.id, 'plans', it.length); add(r.job_id || r.id, 'leadPlans', it.filter(leadFile).length); });   /* patch QAA: the bid-board files the Lead Inbox copied in */
  qs.forEach(r => { add(r.job_id, 'questions'); if (!s(r.data && r.data.answer)) add(r.job_id, 'openQ'); });
  return id => n[id] || { invites: 0, bids: 0, plans: 0, leadPlans: 0, questions: 0, openQ: 0 };
}
function postedOnPurpose(j){
  const person = v => !!s(v) && s(v) !== 'auto' && s(v) !== 'lead-inbox';
  return !!(s(j.postedAt) || (s(j.publishedAt) && person(j.publishedBy)) || (s(j.openedPrivateAt) && !j.autoPrivate && person(j.openedBy)));
}
/* patch QAA (owner 11/12: "start fresh — bid portal empty"): a plan / spec file the Lead Inbox copied in from the bid-board e-mail
   (fromLead, or its staff/lead-inbox/ path) was put there by the old automatic sync, not by a person — it does not make an auto-added
   job "real". A file a person uploaded on the bid site (staff/<month>/…, staff/plans/…) still does. Archived, never deleted. */
function leadFile(f){ return !!f && (f.fromLead === true || /^staff\/lead-inbox\//.test(s(f.fileRef))); }
function autoAdded(j, k){
  const fromLead = s(j.createdBy) === 'lead-inbox' || !!(j.leadInbox && s(j.leadInbox.id));
  return fromLead && !postedOnPurpose(j) && !(k.plans - (k.leadPlans || 0)) && !k.bids && !k.invites && !k.questions && !arr(j.specDocs).filter(f => !leadFile(f)).length;
}
async function cleanup(who, b){
  if (!who.admin) return { code: 403, error: 'Only an admin cleans up the bid portal.' };
  const [jobs, invites, bids, plans, qs] = await Promise.all([SP.listRows([SP.eq('collection', 'jobs')]), SP.listRows([SP.eq('collection', 'invites')]).catch(() => []),
    SP.listRows([SP.eq('collection', 'bids')]).catch(() => []), SP.listRows([SP.eq('collection', 'plans')]).catch(() => []), SP.listRows([SP.eq('collection', 'questions')]).catch(() => [])]);
  const c = counts(invites, bids, arr(await L.kvGet(T.KV_SUBBIDS).catch(() => [])), plans, qs);
  const todo = jobs.map(r => Object.assign({}, r.data || {})).filter(j => j.id && !GONE.test(s(j.status)) && autoAdded(j, c(j.id)));
  if (b.dry) return { ok: true, count: todo.length, sample: todo.slice(0, 25).map(j => s(j.title) || j.id) };
  const at = nowIso();
  todo.forEach(j => { j.archivedFrom = { status: s(j.status), visibility: s(j.visibility), draft: j.draft === true }; Object.assign(j, { status: 'archived', archivedAt: at, archivedBy: who.email, archivedReason: 'auto' });
    logTo(j, who, '🗄 Archived by "Clean up auto-added jobs" (auto-added, never posted, no plans / bids / invites)'); j.updatedAt = at; });
  if (todo.length) await SP.upsertRows(todo.map(j => SP.rowFor('jobs', j)), who.email);
  return { ok: true, archived: todo.length };
}
/* who may put a job on the bid portal: an admin, an estimator, or the PM of that job / lead (and whoever posted it, for changes) */
let CRMC = null;
async function crmLists(){ if (CRMC && Date.now() - CRMC.at < 30000) return CRMC.v; let v = {}; try { v = await SP.kvRead(['projects', 'leads', 'users']); } catch (e) { v = {}; } CRMC = { at: Date.now(), v }; return v; }
async function posterRole(who, ref, job){
  if (who.admin) return 'admin';
  if (who.estimator) return 'estimator';
  if (job && (low(job.postedBy) === who.email || low(job.pmEmail) === who.email)) return 'poster';
  const d = await crmLists(), me = arr(d.users).find(u => u && low(u.email) === who.email);
  const names = [low(me && me.name), low(who.name), who.email].filter(Boolean);
  const pid = s(ref.pid) || s(job && job.crmProjectId), leadId = s(ref.leadId) || s(job && job.crmLeadId);
  const p = pid && arr(d.projects).find(x => x && s(x.id) === pid);
  if (p && (names.indexOf(low(p.pm)) > -1 || low(p.pmEmail) === who.email)) return 'pm';
  const l = leadId && arr(d.leads).find(x => x && s(x.id) === leadId);
  if (l && (names.indexOf(low(l.pm)) > -1 || names.indexOf(low(l.estimator)) > -1 || low(l.pmEmail) === who.email)) return 'pm';
  return '';
}
function cleanLinks(v){ return arr(v).filter(x => x && /^https?:\/\/\S+$/i.test(s(x.url))).map(x => ({ url: s(x.url).slice(0, 1000), label: s(x.label).slice(0, 120) || 'Plans' })).slice(0, 20); }
async function postedView(who, jobId){
  const job = await jobRow(jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  if (!(await posterRole(who, {}, job))) return { code: 403, error: 'Only an admin, an estimator or the job\'s PM sees this.' };
  const pl = await SP.plansOf(job.id).catch(() => []);
  return { ok: true, job: { id: job.id, title: s(job.title), address: s(job.address), due: validDay(job.bidDueDate), dueTime: s(job.bidDueTime), ourDue: validDay(job.ourDue), ourDueTime: s(job.ourDueTime), visibility: job.draft === true ? 'draft' : s(job.visibility) || 'public',
    trades: tradesPicked(job) ? tradeSplit(job.tradesSought) : [], tradesSuggested: tradesPicked(job) ? [] : tradeSplit(job.tradesSought), scope: s(job.scope), specs: s(job.specifications),   /* patch PLANREQ-H */ links: arr(job.plansLinks), files: pl.map(f => ({ name: s(f.name) })), crmFileRefs: arr(job.crmFileRefs),
    archived: GONE.test(s(job.status)), postedBy: s(job.postedBy), postedAt: s(job.postedAt), crmProjectId: s(job.crmProjectId), crmLeadId: s(job.crmLeadId) } };
}
async function postjob(who, b){
  const pid = s(b.pid).slice(0, 120), leadId = s(b.leadId).slice(0, 120), estId = s(b.estId).slice(0, 120);
  let job = s(b.jobId) ? await jobRow(b.jobId) : null;
  if (s(b.jobId) && !job) return { code: 404, error: 'No such bid job.' };
  if (!job && (pid || leadId)) {
    const hit = (await SP.listRows([SP.eq('collection', 'jobs')])).map(r => r.data || {}).filter(j => (pid && s(j.crmProjectId) === pid) || (leadId && s(j.crmLeadId) === leadId))
      .sort((x, y) => (GONE.test(s(x.status)) - GONE.test(s(y.status))) || s(y.updatedAt).localeCompare(s(x.updatedAt)))[0];
    if (hit) job = Object.assign({}, hit);
  }
  const role = await posterRole(who, { pid, leadId }, job);
  if (!role) return { code: 403, error: 'Only an admin, an estimator, or the PM of this job puts it on the bid portal.' };
  const title = s(b.title).slice(0, 200); if (!title) return { code: 400, error: 'Give the job a title.' };
  const keep = (k, v) => b[k] === undefined && job ? v : undefined;   /* a field not sent keeps what the job has */
  const vis = s(b.visibility) === 'public' ? 'public' : 'private', due = b.due === undefined && job ? validDay(job.bidDueDate) : validDay(b.due);
  if (s(b.due) && !due) return { code: 400, error: 'The bid due date is not a date.' };
  if (vis === 'public' && !due) return { code: 400, error: 'Add a bid due date — a public bid job needs one (or post it private, for invited subs only).' };
  const trades = Array.from(new Set(arr(b.trades).map(x => s(x).slice(0, 60)).filter(Boolean))).slice(0, 30);
  const at = nowIso(), isNew = !job;
  if (!job) job = { id: 'j_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), createdBy: 'crm-post', createdByName: s(who.name) || who.email, createdAt: at,
    tradeScopes: [], scopeDocs: [], specDocs: [], bidResultsSharing: 'private', grayCoRole: 'gc', poNumber: s(b.po).slice(0, 40), pmId: '', estimatorId: '' };
  const wasGone = GONE.test(s(job.status));
  if (wasGone) { delete job.archivedAt; delete job.archivedBy; delete job.archivedReason; delete job.archivedFrom; }
  const keepTs = {}; arr(job.tradeScopes).forEach(x => { if (x && s(x.trade)) keepTs[low(x.trade)] = x; });
  const addr0 = keep('address', job && job.address), scope0 = keep('scope', job && job.scope), specs0 = keep('specs', job && job.specifications), links0 = keep('links', job && job.plansLinks);
  Object.assign(job, { title, address: addr0 !== undefined ? s(addr0) : s(b.address).slice(0, 240), bidDueDate: due, bidDueTime: /^\d{2}:\d{2}$/.test(s(b.dueTime)) ? s(b.dueTime) : s(job.bidDueTime),
    scope: scope0 !== undefined ? s(scope0) : s(b.scope).slice(0, 20000), specifications: specs0 !== undefined ? s(specs0) : s(b.specs).slice(0, 20000),
    tradesSought: trades.join(', '), tradeScopes: trades.map(tr => keepTs[low(tr)] || { trade: tr, scope: '' }), visibility: vis, draft: false,
    status: /^(closed|won|lost|awarded)$/i.test(s(job.status)) ? job.status : 'open', postedAt: job.postedAt || at, postedBy: job.postedBy || who.email, postedByName: job.postedByName || s(who.name) || who.email,
    lastPostedAt: at, lastPostedBy: who.email, crmProjectId: pid || s(job.crmProjectId), crmProjectName: s(b.projectName).slice(0, 200) || s(job.crmProjectName), crmLeadId: leadId || s(job.crmLeadId), crmEstId: estId || s(job.crmEstId),
    pmEmail: low(b.pmEmail).slice(0, 160) || s(job.pmEmail), pmName: s(b.pmName).slice(0, 120) || s(job.pmName), plansLinks: links0 !== undefined ? arr(links0) : cleanLinks(b.links), autoPrivate: false, updatedAt: at });
  /* patch PLANREQ-F (owner 11/12): OUR bid due (to the GC / owner — the lead's date, staff only) is kept apart from the SUB due date subs see */
  job.tradesPicked = true;   /* patch PLANREQ-H: a person picked them on the sheet */
  if (b.ourDue !== undefined) { job.ourDue = validDay(b.ourDue); job.ourDueTime = job.ourDue && /^\d{2}:\d{2}$/.test(s(b.ourDueTime)) ? s(b.ourDueTime) : ''; }
  /* patch QAA: the bid site lists the job's PM as its contact (job.pmId = their bid-site staff profile, as the bid site's own Add Job picks it);
     the card said "Send bids and questions to: the Project Manager listed on the job" with nobody listed */
  if (!s(job.pmId) && SP.okEmail(low(job.pmEmail))) job.pmId = 'st_' + low(job.pmEmail).split('@')[0].replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  if (vis === 'public') Object.assign(job, { publishedAt: job.publishedAt || at, publishedBy: who.email, madePublicAt: job.madePublicAt || at });
  else Object.assign(job, { openedPrivateAt: job.openedPrivateAt || at, openedBy: who.email });
  /* the job's files picked in the CRM (crm-files) → copied to the bid site's own bucket once each */
  const had = {}; arr(job.crmFileRefs).forEach(r => { had[r] = 1; });
  const want = arr(b.files).filter(f => f && /^sb:crm-files\//.test(s(f.ref)) && !had[s(f.ref)]).slice(0, 30), copied = [], failed = [];
  /* patch QAA: the job itself is saved BEFORE the files are copied — a big plan set that runs past the function's time limit
     still leaves the job posted (its files can then go up on the bid site, or as a 🔗 link); posting again copies the rest */
  if (want.length) await SP.upsertRows([SP.rowFor('jobs', Object.assign({}, job, { updatedAt: at }))], who.email);
  for (const f of want) {
    let c = null; try { c = await L.portalApi()._copyFile({ ref: s(f.ref), name: s(f.name).slice(0, 160) || 'file', type: s(f.type), size: Number(f.size) || 0, kind: 'plans' }); } catch (e) { c = { name: s(f.name), why: s(e && e.message) }; }
    if (c && c.fileRef) { const g = require('./_lib/tradeguess.js').guess(c.name, '');   /* patch PLANREQ-C: sorted by trade from the name (a scope file also goes on its trade) */
      copied.push({ name: c.name, size: c.size, type: c.type, fileRef: c.fileRef, category: g.kind === 'specs' ? 'Specs' : g.kind === 'scope' ? 'Scope' : s(f.category).slice(0, 60) || 'Plans', trades: g.trades, kind: g.kind, at, by: who.email }); had[s(f.ref)] = 1; } else failed.push({ name: s(f.name), why: s(c && c.why) || 'not copied' });
  }
  job.crmFileRefs = Object.keys(had).slice(0, 200);
  let pl0 = null; if (copied.length) { pl0 = await SP.plansOf(job.id).catch(() => []);   /* patch QAA: the job record lists its plans too (job.plans — what the bid site shows a sub; it said "No plans yet") */
    job.plans = pl0.concat(copied).map(x => ({ name: s(x.name), size: x.size || 0, type: s(x.type), category: s(x.category), version: s(x.version), date: s(x.date), current: !!x.current, trades: arr(x.trades).length ? x.trades : undefined }));
    copied.filter(x => x.kind === 'scope' && arr(x.trades).length).forEach(x => x.trades.forEach(tr => {   /* patch PLANREQ-C */
      let ts = arr(job.tradeScopes).find(y => low(y.trade) === low(tr)); if (!ts) { ts = { id: 'ts_' + crypto.randomBytes(4).toString('hex'), trade: tr, scope: '', files: [] }; job.tradeScopes = arr(job.tradeScopes).concat([ts]); }
      ts.files = arr(ts.files); if (!ts.files.some(f => f.fileRef === x.fileRef)) ts.files.push({ name: x.name, size: x.size, type: x.type, fileRef: x.fileRef, at, by: who.email }); })); }
  logTo(job, who, (isNew ? '📢 Put on the bid portal' : wasGone ? '📢 Back on the bid portal' : '📢 Bid portal job changed') + ' (' + (vis === 'public' ? '🌐 public' : '🔒 private, invited subs only') + ')' + (trades.length ? ' · trades: ' + trades.join(', ') : '') + (copied.length ? ' · ' + copied.length + ' file(s)' : ''));
  const rows = [SP.rowFor('jobs', job)];
  if (copied.length) rows.push({ collection: 'plans', id: job.id, job_id: job.id, data: { items: pl0.concat(copied) } });
  await SP.upsertRows(rows, who.email);
  if (copied.length || arr(job.plansLinks).length) { try { await SP.notifyPlanRequests(job.id); } catch (e) {} }   /* patch PLANREQ */
  return { ok: true, jobId: job.id, created: isNew, visibility: vis, files: copied.length, notCopied: failed, role };
}
async function unpost(who, b){
  const job = await jobRow(b.jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  if (!(await posterRole(who, {}, job))) return { code: 403, error: 'Only an admin, an estimator, or the PM of this job takes it off the bid portal.' };
  if (GONE.test(s(job.status))) return { ok: true, jobId: job.id, already: true };
  job.archivedFrom = { status: s(job.status), visibility: s(job.visibility), draft: job.draft === true };
  Object.assign(job, { status: 'archived', archivedAt: nowIso(), archivedBy: who.email, archivedReason: 'taken off' });
  logTo(job, who, '📢 Taken off the bid portal (🗄 Archived — put it back any time)'); await saveJob(job, who);
  return { ok: true, jobId: job.id };
}

const KEEP_DAYS = 30;
function restorable(j){ if (/^(auto|taken off)$/.test(s(j && j.archivedReason))) return true;   /* patch BIDPOST: archived, not deleted — always back */
  const t = Date.parse(s(j && j.archivedAt)); return !!t && Date.now() - t < KEEP_DAYS * 864e5; }

/* patch BIDEST: a sub bid's file — its name, and the stored ref / link when there is one (the CRM opens it) */
function fileOut(f){ const o = { name: s(f && (f.name || f.fileName)) || 'file' }; const ref = s(f && (f.ref || f.fileRef)); const url = s(f && (f.url || f.link)); if (/^sb:/.test(ref)) o.ref = ref; if (/^https?:\/\//i.test(url)) o.url = url; return o; }

/* ── ONE list of a job's sub bids, from bids@, the bid portal and the sub portal ── */
async function subBids(jobId){
  const [rows, us, raw] = await Promise.all([SP.listRows([SP.eq('collection', 'bids'), SP.eq('job_id', jobId)]).catch(() => []), users(), crmSubsRaw()]);
  const byId = {}, byEmail = {}; us.forEach(u => { if (u.id) byId[u.id] = u; if (u.email) byEmail[low(u.email)] = u; });
  const crmByEmail = {}; raw.forEach(r => { if (r && r.email) crmByEmail[low(r.email)] = r; });
  const out = rows.map(r => r.data || {}).filter(b => b.id && !b.fromEmailBid).map(b => {   /* patch BIDSCOPE: an e-mailed bid's portal copy is listed once (as the e-mail) */
    const u = byId[s(b.userId)] || byEmail[low(b.userEmail)] || {};
    const viaPortal = s(b.via) === 'portal' || !!(u.crmSubId || u.bidsRequested);
    return { source: viaPortal ? 'subportal' : 'portal', id: s(b.id), sub: s(b.userName || u.name), company: s(b.userCompany || u.company), email: low(b.userEmail || u.email),
      trade: s(b.trade) || tradeOf(u, crmByEmail, b.userEmail || u.email), amount: b.amount == null || b.amount === '' ? null : Number(b.amount),
      files: arr(b.docs).map(fileOut), at: s(b.submittedAt || b.updatedAt), awarded: !!b.accepted, notSelected: !b.accepted && !!b.rejected, scope: s(b.scope).slice(0, 3000),
      notes: s(b.notes).slice(0, 3000), awardMailedAt: s(b.awardMailedAt), lang: langOf(u, crmByEmail[low(b.userEmail || u.email)]) };   /* patch BIDSCOPE: included (scope) / notes-exclusions, for the scope comparison */
  });
  arr(await L.kvGet(T.KV_SUBBIDS).catch(() => [])).filter(x => x && x.jobId === jobId).forEach(x => {
    const sub = x.sub || {};
    out.push({ source: 'email', id: s(x.id), sub: s(sub.name), company: s(sub.company), email: low(sub.email), trade: s(x.trade) || tradeOf(byEmail[low(sub.email)], crmByEmail, sub.email),
      amount: x.amount != null ? Number(x.amount) : amountOf(s(x.subject) + '\n' + s(x.text)), files: arr(x.files).map(fileOut), at: s(x.at), awarded: !!x.awarded, scope: s(x.text).slice(0, 3000), awardMailedAt: s(x.awardMailedAt), lang: langOf(byEmail[low(sub.email)], crmByEmail[low(sub.email)]) });
  });
  return out.sort((a, b) => s(a.trade).localeCompare(s(b.trade)) || (a.amount == null) - (b.amount == null) || (a.amount || 0) - (b.amount || 0));
}

/* patch BIDSCOPE: the scope GrayCo SENT for this job (each trade's scope, the job scope, the specifications, the scope / spec
   sheets — their text when the file has it, else only the name) — the CRM flags a sub's exclusion that hits it */
async function sentScope(jobId){
  try {
    const job = await jobRow(jobId); if (!job) return null;
    const docs = arr(job.scopeDocs).concat(arr(job.specDocs)).slice(0, 20).map(f => ({ name: s(f && (f.name || f.fileName)), text: s(f && (f.text || f.extractedText)).slice(0, 6000) }));
    return { scope: s(job.scope).slice(0, 8000), specifications: s(job.specifications).slice(0, 8000), tradeScopes: arr(job.tradeScopes).slice(0, 20).map(x => ({ trade: s(x && x.trade), scope: s(x && x.scope).slice(0, 6000) })), docs };
  } catch (e) { return null; }
}

/* ── the invite picker ── */
async function subsList(jobId){
  const [ranked, raw, us, inv] = await Promise.all([crmRanked(), crmSubsRaw(), users(), jobId ? SP.listRows([SP.eq('collection', 'invites'), SP.eq('job_id', jobId)]).catch(() => []) : []]);
  const rawById = {}; raw.forEach(r => { if (r && r.id) rawById[s(r.id)] = r; });
  const invited = {}; inv.forEach(r => { invited[low(r.email || (r.data && r.data.email))] = 1; });
  const seen = {}, out = [];
  ranked.forEach(c => {
    if (!SP.okEmail(c.email) || seen[c.email]) return; seen[c.email] = 1;
    if (c.flag === 'dnu') return;   /* ⛔ Do not use: never offered */
    const u = us.find(x => low(x.email) === c.email);
    out.push({ email: c.email, name: c.name, company: c.company || (u && u.company) || '', trade: c.trade || (u && arr(u.trades)[0]) || '', trades: arr(u && u.trades).concat(c.trade ? [c.trade] : []),
      flag: c.flag, grade: c.grade, score: c.score, lang: langOf(u, rawById[c.id]), onBidSite: !!(u && u.approved), invited: !!invited[c.email], crmId: s(c.id), portalUserId: s(u && u.id), papers: arr(u && u.papersCrm).slice(0, 20) });   /* patch SIGNUPPAPERS */
  });
  us.filter(u => u.role === 'sub' && u.approved && SP.okEmail(low(u.email)) && !seen[low(u.email)]).forEach(u => {
    const e = low(u.email); seen[e] = 1; const c = u.crmSubId && rawById[s(u.crmSubId)];
    if (c && low(c.subFlag) === 'dnu') return;
    out.push({ email: e, name: s(u.name), company: s(u.company), trade: arr(u.trades)[0] || '', trades: arr(u.trades), flag: '', grade: '', score: null, lang: langOf(u, c), onBidSite: true, invited: !!invited[e],
      notInCrm: !c, phone: s(u.phone), portalUserId: s(u.id), papers: arr(u.papersCrm).slice(0, 20), crmId: s(c && c.id), city: s(u.businessCity), state: s(u.businessState), address: s(u.businessAddress), licenses: s(u.licenseNumbers) });   /* BIDSUBS: what the CRM needs to add them */
  });
  return out;
}

function tradeHit(sub, trades){
  if (!trades.length) return true;
  const mine = arr(sub.trades).concat([sub.trade]).map(low).filter(Boolean);
  return trades.some(t => mine.some(m => m.indexOf(t) > -1 || t.indexOf(m) > -1));
}
function inviteMail(job, link, es){
  const title = s(job.title) || 'GrayCo job', due = s(job.bidDueDate) ? (s(job.bidDueDate) + (s(job.bidDueTime) ? ' ' + s(job.bidDueTime) : '')) : '';
  const tag = [s(job.poNumber), s(job.address)].filter(Boolean).join(' · ');
  const subject = (es ? 'Invitación a licitar — ' : 'Invitation to bid — ') + title + (tag ? ' — ' + tag : '') + (due ? (es ? ' · vence ' : ' · due ') + due : '');
  const lines = es ? [
    'GrayCo Construction Services le invita a licitar <b>' + SP.esc(title) + '</b>' + (s(job.address) ? ' (' + SP.esc(job.address) + ')' : '') + '.',
    due ? 'Fecha límite de la oferta: <b>' + SP.esc(due) + '</b>.' : '', s(job.tradesSought) ? 'Oficios: ' + SP.esc(job.tradesSought) : '',
    'Los planos, el alcance y el formulario de oferta están en el sitio de licitaciones de GrayCo. Si todavía no tiene cuenta, el enlace la crea ya ligada a este trabajo.'
  ] : [
    'GrayCo Construction Services invites you to bid <b>' + SP.esc(title) + '</b>' + (s(job.address) ? ' (' + SP.esc(job.address) + ')' : '') + '.',
    due ? 'Bids are due <b>' + SP.esc(due) + '</b>.' : '', s(job.tradesSought) ? 'Trades: ' + SP.esc(job.tradesSought) : '',
    'Plans, scope and the bid form are on the GrayCo bid site. No account yet? The link makes one already linked to this job.'
  ];
  return { subject: subject.slice(0, 240), html: SP.mailHtml(es ? 'Invitación a licitar' : 'Invitation to bid', lines.filter(Boolean), { href: link, label: es ? 'Ver el trabajo y licitar' : 'See the job and bid' }) };
}

async function invite(who, b){
  const jobId = s(b.jobId); const row = jobId && await SP.getRow('jobs', jobId);
  if (!row || GONE.test(s(row.data.status))) return { code: 404, error: 'No such bid job.' };
  const job = Object.assign({}, row.data);
  const trades = arr(b.trades).map(low).map(x => x.trim()).filter(Boolean).slice(0, 20);
  const pool = await subsList(jobId);
  let targets;
  if (b.all) targets = pool.filter(x => tradeHit(x, trades));
  else {
    const want = Array.from(new Set(arr(b.emails).map(low).filter(SP.okEmail)));
    const dnu = {}; (await crmRanked()).forEach(c => { if (c.flag === 'dnu' && c.email) dnu[c.email] = 1; });
    targets = want.filter(e => !dnu[e]).map(e => pool.find(x => x.email === e) || { email: e, name: '', company: '', lang: 'en', invited: false });
  }
  if (!b.resend) targets = targets.filter(x => !x.invited);
  targets = targets.slice(0, 300);
  if (!targets.length) return { ok: true, invited: 0, mailed: 0, skipped: 'everyone picked is already invited (or there was no one in those trades)' };
  if (job.draft === true || low(job.status) === 'draft') {   /* an invite opens a draft as PRIVATE: only invited subs see it */
    Object.assign(job, { draft: false, visibility: 'private', status: 'open', openedPrivateAt: job.openedPrivateAt || nowIso(), openedBy: who.email, updatedAt: nowIso() });
    await SP.upsertRows([SP.rowFor('jobs', job)], who.email);
  }
  const have = await SP.listRows([SP.eq('collection', 'invites'), SP.eq('job_id', jobId)]).catch(() => []);
  const byEmail = {}; have.forEach(r => { byEmail[low(r.email)] = r.data; });
  const at = nowIso(), rows = [], sent = [];
  for (const t of targets) {
    const inv = byEmail[t.email] || { id: 'i_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'), jobId, email: t.email, token: crypto.randomBytes(16).toString('hex'), createdAt: at, createdBy: who.email, createdByName: who.name || who.email, via: 'crm' };
    if (!byEmail[t.email]) rows.push(SP.rowFor('invites', inv));
    sent.push({ t, inv });
  }
  if (rows.length) await SP.upsertRows(rows, who.email);
  let mailed = 0, es = 0;
  for (const x of sent) {   /* one e-mail per sub: nobody sees who else was invited */
    const isEs = x.t.lang === 'es'; if (isEs) es++;
    const link = SP.PORTAL_ORIGIN + '/?invite=' + x.inv.token + '&job=' + encodeURIComponent(jobId);
    const m = inviteMail(job, link, isEs);
    try { if (await SP.sendMail(x.t.email, m.subject, m.html)) mailed++; } catch (e) {}
  }
  return { ok: true, invited: rows.length, mailed, spanish: es, to: sent.length, visibility: job.draft ? 'draft' : (job.visibility || 'public') };
}

async function visibility(who, b){
  const mode = s(b.mode);
  if (!/^(private|public)$/.test(mode)) return { code: 400, error: 'Private or public?' };
  if (mode === 'public' && !who.canPublic) return { code: 403, error: 'Only an admin or an estimator can make a bid job public to all subs.' };
  if (!who.canInvite) return { code: 403, error: 'Only an admin, an estimator or the office can change a bid job.' };
  const row = await SP.getRow('jobs', s(b.jobId)); if (!row) return { code: 404, error: 'No such bid job.' };
  const job = Object.assign({}, row.data);
  if (mode === 'public') {
    if (!s(job.bidDueDate)) return { code: 400, error: 'Add a bid due date first — a public bid job needs one.' };
    Object.assign(job, { status: /^(closed|won|lost|awarded)$/i.test(s(job.status)) ? job.status : 'open', visibility: 'public', draft: false, publishedAt: job.publishedAt || nowIso(), publishedBy: who.email, madePublicAt: nowIso() });
  } else Object.assign(job, { status: /^(closed|won|lost|awarded)$/i.test(s(job.status)) ? job.status : 'open', visibility: 'private', draft: false, openedPrivateAt: job.openedPrivateAt || nowIso(), openedBy: who.email });
  job.updatedAt = nowIso();
  await SP.upsertRows([SP.rowFor('jobs', job)], who.email);
  return { ok: true, jobId: job.id, visibility: job.visibility };
}

/* patch BIDEST: remember which CRM project a bid job's awarded bids go into (the estimate's project) */
async function link(who, b){
  if (!who.canInvite) return { code: 403, error: 'Only an admin, an estimator or the office links a bid job to a project.' };
  const job = await jobRow(b.jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  const pid = s(b.projectId).slice(0, 120), name = s(b.projectName).slice(0, 200);
  if (s(job.crmProjectId) === pid && s(job.crmProjectName) === name) return { ok: true, jobId: job.id, projectId: pid, same: true };
  job.crmProjectId = pid; job.crmProjectName = name; job.crmProjectBy = who.email; job.crmProjectAt = nowIso();
  logTo(job, who, pid ? '📁 Linked to the CRM project ' + (name || pid) + ' (awarded bids go into its estimate)' : '📁 CRM project link taken off');
  await saveJob(job, who);
  return { ok: true, jobId: job.id, projectId: pid };
}

/* ── patch BIDSCOPE (owner: "award bid by email and portal entry") ──────────────────────────────────────────────────
   🏆 Award (the CRM's confirm sheet) → the awarded sub gets ONE e-mail (EN / ES): the job, the trade, their amount, the PM
   (name / phone / e-mail), next steps (sub agreement / scope to sign in their GrayCo Portal) and — when there are scope
   gaps — "Please confirm these before we finalize: …". awardMailedAt is kept on the bid: a repeat award sends nothing
   unless "Send again" (mailAgain). Never while data-entry mode is on (pause) or PORTAL_MAIL_OFF. An e-mailed bid from a
   sub who has a bid-site profile (same e-mail) gets a copy in the bids collection (fromEmailBid), so their portal shows
   🏆 Awarded. "Tell the other bidders they were not selected" (notifyOthers, off by default): a short polite e-mail,
   no prices, no names. */
const SUB_PORTAL = (function(){ const v = s(process.env.PORTAL_BASE_URL).replace(/\/$/, ''); return /^https:\/\//.test(v) ? v : 'https://portal.grayco-cs.com'; })();
function money2(n){ n = Number(n); return isFinite(n) ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; }
function pmOf(b, who){
  const p = b && b.pm && typeof b.pm === 'object' ? b.pm : {};
  const name = s(p.name).slice(0, 120) || s(who && who.name) || 'GrayCo office', email = low(p.email).slice(0, 160), phone = s(p.phone).replace(/[^\d+().\- ]/g, '').slice(0, 40);
  return { name, email: SP.okEmail(email) ? email : (SP.okEmail(low(who && who.email)) ? low(who.email) : ''), phone };
}
function cleanList(v){ return arr(v).map(x => s(x).replace(/\s+/g, ' ').slice(0, 200)).filter(Boolean).slice(0, 25); }
function awardMail(o, es){
  const title = s(o.job.title) || 'GrayCo job', trade = s(o.trade), amt = o.amount != null && o.amount !== '' ? money2(o.amount) : '';
  const subject = (es ? 'Adjudicada — ' : 'Awarded — ') + title + (trade ? ' — ' + trade : '');
  const pm = o.pm || {}, pmBits = [SP.esc(pm.name), pm.phone ? SP.esc(pm.phone) : '', pm.email ? '<a href="mailto:' + SP.esc(pm.email) + '">' + SP.esc(pm.email) + '</a>' : ''].filter(Boolean).join(' · ');
  const ex = cleanList(o.exclusions), exHtml = ex.map(x => '• ' + SP.esc(x)).join('<br>');
  const lines = es ? [
    '¡Felicidades! GrayCo Construction Services le adjudicó ' + (trade ? '<b>' + SP.esc(trade) + '</b> en ' : '') + '<b>' + SP.esc(title) + '</b>' + (s(o.job.address) ? ' (' + SP.esc(o.job.address) + ')' : '') + '.',
    amt ? 'Su oferta: <b>' + amt + '</b>' : '',
    pmBits ? 'Su gerente de proyecto en GrayCo: <b>' + pmBits + '</b>' : '',
    'Próximos pasos: GrayCo le enviará su contrato de subcontratista / el alcance para firmar en su Portal GrayCo.',
    ex.length ? '<b>Por favor confirme esto antes de finalizar:</b><br>' + exHtml : ''
  ] : [
    'Congratulations! GrayCo Construction Services has awarded you ' + (trade ? '<b>' + SP.esc(trade) + '</b> on ' : '') + '<b>' + SP.esc(title) + '</b>' + (s(o.job.address) ? ' (' + SP.esc(o.job.address) + ')' : '') + '.',
    amt ? 'Your bid: <b>' + amt + '</b>' : '',
    pmBits ? 'Your GrayCo project manager: <b>' + pmBits + '</b>' : '',
    'Next steps: GrayCo will send your sub agreement / scope to sign in your GrayCo Portal.',
    ex.length ? '<b>Please confirm these before we finalize:</b><br>' + exHtml : ''
  ];
  return { subject: subject.slice(0, 240), html: SP.mailHtml(es ? '¡Su oferta fue adjudicada!' : 'Your bid was awarded', lines.filter(Boolean), { href: SUB_PORTAL + '/', label: es ? 'Abrir mi Portal GrayCo' : 'Open my GrayCo Portal' }) };
}
function notSelectedMail(o, es){
  const title = s(o.job.title) || 'GrayCo job', trade = s(o.trade);
  const subject = (es ? 'Actualización de su oferta — ' : 'Bid update — ') + title;
  const lines = es ? ['Gracias por licitar ' + (trade ? '<b>' + SP.esc(trade) + '</b> en ' : '') + '<b>' + SP.esc(title) + '</b>.', 'GrayCo seleccionó otra oferta para este oficio. Apreciamos su tiempo y esperamos trabajar con usted en el próximo proyecto.']
    : ['Thank you for bidding ' + (trade ? '<b>' + SP.esc(trade) + '</b> on ' : '') + '<b>' + SP.esc(title) + '</b>.', 'GrayCo has selected another bid for this trade. We appreciate your time and look forward to working with you on the next one.'];
  return { subject: subject.slice(0, 240), html: SP.mailHtml(es ? 'Gracias por su oferta' : 'Thank you for your bid', lines) };
}
async function mailGate(){
  if (process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true') return 'e-mail is off (PORTAL_MAIL_OFF)';
  try { if (await require('./_lib/pause').isPaused()) return 'data-entry mode is on — nothing goes out'; } catch (e) { return 'data-entry mode could not be checked — nothing goes out'; }
  return '';
}
async function sendOne(to, m){ try { return !!(await SP.sendMail(to, m.subject, m.html)); } catch (e) { return false; } }

async function award(who, b){
  if (!who.canPublic) return { code: 403, error: 'Only an admin or an estimator marks a sub bid awarded.' };
  const on = b.on !== false, id = s(b.id), at = nowIso(), src = s(b.source);
  const found = await jobRow(b.jobId).catch(() => null), job = found || { id: s(b.jobId), title: '' };
  const pm = pmOf(b, who), exclusions = cleanList(b.exclusions), wantMail = on && b.mail !== false;
  const us = on ? await users() : [], uByEmail = {}; us.forEach(u => { if (u && u.email) uByEmail[low(u.email)] = u; });
  let crmByEmail = null; const langFor = async e => { if (!crmByEmail) { crmByEmail = {}; (await crmSubsRaw()).forEach(r => { if (r && r.email) crmByEmail[low(r.email)] = r; }); } return langOf(uByEmail[low(e)], crmByEmail[low(e)]); };
  const out = { ok: true, awarded: on, notSelected: 0, mail: { sent: false } };
  /* the award e-mail (before the bid is saved, so its stamp goes in the same write) */
  async function mailTo(email, trade, amount, mailedAt){
    if (!wantMail) return { sent: false, skipped: 'not asked' };
    if (mailedAt && !b.mailAgain) return { sent: false, skipped: 'already e-mailed ' + mailedAt.slice(0, 10) + ' (tick "Send again")', mailedAt };
    if (!SP.okEmail(low(email))) return { sent: false, skipped: 'no e-mail address on this bid' };
    const gate = await mailGate(); if (gate) return { sent: false, skipped: gate };
    const es = (await langFor(email)) === 'es', m = awardMail({ job, trade, amount, pm, exclusions }, es);
    const ok = await sendOne(low(email), m);
    return ok ? { sent: true, to: low(email), lang: es ? 'es' : 'en', mailedAt: at } : { sent: false, skipped: 'the e-mail could not be sent' };
  }
  let awardedTrade = '', awardedEmail = '';
  if (src === 'email') {
    const cur = arr(await L.kvGet(T.KV_SUBBIDS).catch(() => [])).find(y => y && y.id === id);
    if (!cur) return { code: 404, error: 'No such sub bid.' };
    const email = low(cur.sub && cur.sub.email), trade = s(cur.trade), amount = cur.amount != null ? Number(cur.amount) : amountOf(s(cur.subject) + '\n' + s(cur.text));
    awardedTrade = trade; awardedEmail = email;
    if (on) out.mail = await mailTo(email, trade, amount, s(cur.awardMailedAt));
    let hit = null;
    await L.kvCas(T.KV_SUBBIDS, v => { const l = arr(v); const x = l.find(y => y && y.id === id); if (!x) return undefined; x.awarded = on; x.awardedAt = on ? at : ''; x.awardedBy = who.email;
      if (on) { x.awardPm = pm; x.awardExclusions = exclusions; } if (out.mail.sent) x.awardMailedAt = at; hit = x; return l; });
    if (!hit) return { code: 404, error: 'No such sub bid.' };
    /* the sub's own bid-site profile (same e-mail): a copy of the bid in the bids collection, so their portal shows the award */
    try {
      const u = uByEmail[email] || (on ? null : (await users()).find(x => low(x.email) === email));
      if (u && u.id && s(u.role || 'sub') === 'sub') {
        const prev = await SP.getRow('bids', 'b_em_' + id).catch(() => null), pd = prev && prev.data;
        if (on || pd) {
          const copy = Object.assign({}, pd || { id: 'b_em_' + id, jobId: s(cur.jobId) || s(b.jobId), userId: s(u.id), userEmail: email, userName: s(u.name || (cur.sub && cur.sub.name)), userCompany: s(u.company || (cur.sub && cur.sub.company)),
            amount: amount, trade: trade, notes: 'Bid e-mailed to bids@grayco-cs.com', scope: '', docs: [], via: 'email', fromEmailBid: id, submittedAt: s(cur.at) || at },
            on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email, awardPm: pm, awardExclusions: exclusions } : { accepted: false, acceptedAt: '' }, { updatedAt: at });
          await SP.upsertRows([SP.rowFor('bids', copy)], who.email);
          out.portal = { copied: true, userId: s(u.id) };
        }
      }
    } catch (e) { out.portal = { copied: false, error: s(e && e.message) }; }
  } else {
    const row = await SP.getRow('bids', id); if (!row || (s(b.jobId) && row.job_id !== s(b.jobId))) return { code: 404, error: 'No such sub bid.' };
    const d = row.data || {}, email = low(d.userEmail) || low((us.find(u => s(u.id) === s(d.userId)) || {}).email);
    awardedTrade = s(d.trade); awardedEmail = email;
    if (on) out.mail = await mailTo(email, s(d.trade) || s(b.trade), d.amount, s(d.awardMailedAt));
    const bid = Object.assign({}, d, on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email, awardPm: pm, awardExclusions: exclusions } : { accepted: false, acceptedAt: '' }, out.mail.sent ? { awardMailedAt: at } : {});
    /*AWARDFLOW: the other portal bids on this job in the same trade → Not selected (Undo puts them back) */
    const others = [];
    try {
      const tr = s(bid.trade).toLowerCase(), tag = 'award:' + id;
      (await SP.listRows([SP.eq('collection', 'bids'), SP.eq('job_id', row.job_id)])).forEach(function(r){ const o = r.data || {};
        if (!o.id || o.id === id || s(o.trade).toLowerCase() !== tr) return;
        if (on && !o.accepted && !o.rejected) others.push(Object.assign({}, o, { rejected: true, rejectedAt: at, rejectedBy: tag, notSelected: true }));
        if (!on && o.rejected && o.rejectedBy === tag) others.push(Object.assign({}, o, { rejected: false, rejectedAt: '', rejectedBy: '', notSelected: false }));
      });
    } catch (e) {}
    await SP.upsertRows([SP.rowFor('bids', bid)].concat(others.map(function(o){ return SP.rowFor('bids', o); })), who.email);
    out.notSelected = on ? others.length : 0;
  }
  /* "Tell the other bidders in this trade they were not selected" — only when ticked; no prices, no names */
  if (on && b.notifyOthers) {
    out.others = { mailed: 0, skipped: '' };
    const gate = await mailGate();
    if (gate) out.others.skipped = gate;
    else {
      const trade = s(b.trade) || awardedTrade, tr = low(trade), list = (await subBids(s(b.jobId) || s(job.id)).catch(() => [])).filter(x => x && !(x.source === src && x.id === id) && low(x.trade) === tr && !x.awarded);
      const seen = {}; if (awardedEmail) seen[awardedEmail] = 1;
      for (const x of list) {
        const e = low(x.email); if (!SP.okEmail(e) || seen[e]) continue; seen[e] = 1;
        if (await sendOne(e, notSelectedMail({ job, trade }, x.lang === 'es'))) out.others.mailed++;
      }
    }
  }
  try { logTo(job, who, (on ? '🏆 Awarded ' : '↩ Award taken off ') + (src === 'email' ? 'e-mailed' : 'portal') + ' bid ' + id + (out.mail.sent ? ' — award e-mail sent to ' + out.mail.to : '') + (out.others && out.others.mailed ? ' — ' + out.others.mailed + ' not-selected e-mail(s)' : '')); if (found) await saveJob(job, who); } catch (e) {}
  return out;
}

/* the backfill: every estimator lead's DRAFT bid job → PRIVATE (a public job is never touched) */
async function sweep(who){
  if (!(who.admin || who.estimator)) return { ok: true, opened: 0 };
  if (process.env.BID_PORTAL_AUTO !== '1') return { ok: true, opened: 0, off: true };   /* patch BIDPOST: nothing goes on the bid portal by itself */
  const jobs = await SP.listRows([SP.eq('collection', 'jobs')]);
  const items = arr(await L.kvGet(L.KV).catch(() => [])); const byId = {}; items.forEach(x => { if (x && x.id) byId[x.id] = x; });
  const todo = jobs.map(r => r.data || {}).filter(j => (j.draft === true || low(j.status) === 'draft') && j.leadInbox && s(j.leadInbox.id)).filter(j => {
    const it = byId[s(j.leadInbox.id)];
    if (it && /^(dismissed|merged)$/.test(s(it.status))) return false;
    return L.isCommercial({ type: j.leadInbox.type, source: j.leadInbox.source, origin: it && it.origin }) || !!(it && (it.estimatorEmail || it.estimator));
  }).slice(0, 50);
  const at = nowIso();
  todo.forEach(j => Object.assign(j, { draft: false, visibility: 'private', status: 'open', autoPrivate: true, openedPrivateAt: j.openedPrivateAt || at, openedBy: 'auto', updatedAt: at }));
  if (todo.length) await SP.upsertRows(todo.map(j => SP.rowFor('jobs', j)), 'bid-hub');
  const marks = {}; todo.forEach(j => { marks[s(j.leadInbox.id)] = { jobId: j.id, state: 'private', visibility: 'private', at }; });
  if (todo.length) { try { await L.kvCas(L.KV, v => { const l = arr(v); let ch = false; l.forEach(x => { if (x && marks[x.id]) { x.portal = Object.assign({}, x.portal || {}, marks[x.id]); ch = true; } }); return ch ? l : undefined; }); } catch (e) {} }
  return { ok: true, opened: todo.length };
}

/* ═══ patch SYS2 ═══════════════════════════════════════════════════════════════════════════════════════════════
   🗑 Delete (a soft delete: the job leaves the bid site for every sub; restorable for 30 days; no sub is e-mailed),
   and 📂 Manage: plans & specs (version / date / current, plan-room links), scopes per trade (prices removed), numbered
   addenda (subs acknowledge them on the bid site), updates to all invited subs / one trade / one sub, the subs' Q&A,
   and the activity log. Everything is on the bid site only for the subs who may see that job (invited, or every
   approved sub when the job is public); an e-mail about it always waits on ✅ Approvals and is held in ⏸ Data-entry mode. */
const sinceIso = () => nowIso();
function logTo(job, who, what){ job.log = arr(job.log).concat([{ at: sinceIso(), by: s(who && (who.name || who.email)) || 'staff', what: s(what).slice(0, 300) }]).slice(-300); }
async function jobRow(jobId){ const r = s(jobId) && await SP.getRow('jobs', s(jobId)); return r && r.data ? Object.assign({}, r.data) : null; }
async function saveJob(job, who){ job.updatedAt = nowIso(); await SP.upsertRows([SP.rowFor('jobs', job)], s(who && who.email) || 'bid-hub'); }

async function archive(who, b){
  const ids = Array.from(new Set(arr(b.jobIds).concat(b.jobId ? [b.jobId] : []).map(s).filter(Boolean))).slice(0, 200);
  if (!ids.length) return { code: 400, error: 'Pick a bid job.' };
  if (!who.canPublic) return { code: 403, error: 'Only an admin or an estimator deletes a bid job.' };
  if (ids.length > 1 && !who.admin) return { code: 403, error: 'Only an admin deletes several bid jobs at once.' };
  const at = nowIso(), done = [], leads = [], save = [];
  /* patch HOTDEL (owner 11/12: Delete on 184 selected jobs "didn't click" — one read + one write per job ran past the function's time
     limit): read the jobs 20 at a time in parallel, then write them all in ONE upsert */
  for (let i = 0; i < ids.length; i += 20) {
    const got = await Promise.all(ids.slice(i, i + 20).map(id => jobRow(id).catch(() => null)));
    got.forEach((job, k) => {
      if (!job || GONE.test(s(job.status))) return;
      job.archivedFrom = { status: s(job.status), visibility: s(job.visibility), draft: job.draft === true };
      Object.assign(job, { status: 'archived', archivedAt: at, archivedBy: who.email });
      logTo(job, who, '🗑 Deleted from the bid portal' + (b.markLead ? ' (lead marked not bidding)' : ''));
      job.updatedAt = at; save.push(job); done.push(ids[i + k]);
      if (job.leadInbox && s(job.leadInbox.id)) leads.push(s(job.leadInbox.id));
    });
  }
  if (save.length) await SP.upsertRows(save.map(j => SP.rowFor('jobs', j)), s(who && who.email) || 'bid-hub');
  /* the lead itself stays as it is — unless the person ticked "also mark the lead Lost / not bidding" */
  if (b.markLead && leads.length) {
    const inbox = leads.filter(x => !/^crm:/.test(x));
    if (inbox.length) { try { await L.kvCas(L.KV, v => { const l = arr(v); let ch = false; l.forEach(x => { if (x && inbox.indexOf(x.id) > -1 && x.status !== 'dismissed') { x.status = 'dismissed'; x.reason = 'Not bidding (bid job deleted)'; x.by = who.email; x.dismissedAt = at; ch = true; } }); return ch ? l : undefined; }); } catch (e) {} }
  }
  return { ok: true, deleted: done.length, ids: done, leads };
}
async function restore(who, b){
  if (!who.canPublic) return { code: 403, error: 'Only an admin or an estimator restores a bid job.' };
  const job = await jobRow(b.jobId); if (!job || !GONE.test(s(job.status))) return { code: 404, error: 'No deleted bid job by that name.' };
  if (!restorable(job)) return { code: 410, error: 'Deleted more than ' + KEEP_DAYS + ' days ago — it cannot be restored.' };
  const f = job.archivedFrom || {};
  Object.assign(job, { status: s(f.status) && !GONE.test(s(f.status)) ? f.status : 'open', visibility: s(f.visibility) || 'private', draft: f.draft === true });
  delete job.archivedAt; delete job.archivedBy; delete job.archivedFrom;
  logTo(job, who, '↩ Restored to the bid portal');
  await saveJob(job, who);
  return { ok: true, jobId: job.id, visibility: job.draft ? 'draft' : job.visibility };
}

/* who may see a job's posts: invited e-mails + subs who bid; on a public job every approved sub too */
async function audience(job){
  const [inv, bids, us, raw] = await Promise.all([SP.listRows([SP.eq('collection', 'invites'), SP.eq('job_id', job.id)]).catch(() => []),
    SP.listRows([SP.eq('collection', 'bids'), SP.eq('job_id', job.id)]).catch(() => []), users(), crmSubsRaw()]);
  const byEmail = {}; us.forEach(u => { if (u && u.email) byEmail[low(u.email)] = u; });
  const crm = {}; raw.forEach(r => { if (r && r.email) crm[low(r.email)] = r; });
  const out = {}, add = (e, how) => { e = low(e); if (!SP.okEmail(e) || out[e]) return; const u = byEmail[e]; if (u && u.role !== 'sub') return; const c = crm[e];
    if (c && low(c.subFlag) === 'dnu') return;
    out[e] = { email: e, how, userId: u && u.approved ? s(u.id) : '', name: s((u && u.name) || (c && c.name)), company: s((u && u.company) || (c && (c.company || c.name))),
      trades: arr(u && u.trades).concat(c && (c.trade || c.cat) ? [s(c.trade || c.cat)] : []).map(s).filter(Boolean), lang: langOf(u, c) }; };
  inv.forEach(r => add(r.email || (r.data && r.data.email), 'invited'));
  bids.forEach(r => add(r.data && r.data.userEmail, 'bid'));
  if (s(job.visibility) === 'public' && !(job.draft === true)) us.filter(u => u.role === 'sub' && u.approved).forEach(u => add(u.email, 'public'));
  return Object.keys(out).map(k => out[k]);
}
function inTrade(x, trade){ const t = low(trade); return !t || x.trades.some(m => { m = low(m); return m.indexOf(t) > -1 || t.indexOf(m) > -1; }); }

async function manageView(jobId){
  const job = await jobRow(jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  const [plans, qs, acks, act, aud] = await Promise.all([SP.plansOf(job.id).catch(() => []),
    SP.listRows([SP.eq('collection', 'questions'), SP.eq('job_id', job.id)]).catch(() => []),
    SP.listRows([SP.eq('collection', 'acks'), SP.eq('job_id', job.id)]).catch(() => []),
    SP.listRows([SP.eq('collection', 'activity'), SP.eq('job_id', job.id)]).catch(() => []), audience(job)]);
  let paused = false; try { paused = await require('./_lib/pause').isPaused(); } catch (e) { paused = true; }
  let reqs = []; try { reqs = await SP.planReqsFor(job.id); } catch (e) { reqs = []; }   /* patch PLANREQ: 📩 the subs' plan / info requests (staff only) */
  return { ok: true, paused, resort: resortCount(plans), planreqs: reqs.map(q => ({ id: s(q.id), company: s(q.company), name: s(q.name), phone: s(q.phone), email: s(q.email), trade: s(q.trade), needs: arr(q.needs).length ? q.needs : ['plans'], note: s(q.note), at: s(q.at),
      open: SP.prOpen(q), closedHow: s(q.closedHow) || (s(q.notifiedAt) ? 'plans' : ''), closedAt: s(q.closedAt), closedBy: s(q.closedBy), reply: s(q.reply), repliedByName: s(q.repliedByName), sentNote: s(q.sentNote), notifiedAt: s(q.notifiedAt), mailHeld: !!q.mailHeld, replyMail: s(q.replyMail), to: arr(q.to).map(x => ({ name: s(x.name), roles: arr(x.roles) })) })),
    job: { id: job.id, title: s(job.title), address: s(job.address), po: s(job.poNumber), due: s(job.bidDueDate), dueTime: s(job.bidDueTime),
      visibility: job.draft === true ? 'draft' : s(job.visibility) || 'public', deleted: GONE.test(s(job.status)), trades: tradesPicked(job) ? s(job.tradesSought) : '', tradesSuggested: tradesPicked(job) ? '' : s(job.tradesSought),   /* patch PLANREQ-H */ scope: s(job.scope),
      tradeScopes: arr(job.tradeScopes), plansLinks: arr(job.plansLinks), addenda: arr(job.addenda), posts: arr(job.posts), log: arr(job.log).slice(-200), leadId: s(job.leadInbox && job.leadInbox.id),
      /* patch PLANREQ-E: 📝 Details */ ownerGc: s(job.ownerGc), showOwnerGc: !!job.showOwnerGc, projectType: s(job.projectType), siteWalk: job.siteWalk || null, questionsDue: s(job.questionsDue), startDate: s(job.startDate), duration: s(job.duration),
      bidInstructions: s(job.bidInstructions), requirements: job.requirements || {}, alternates: arr([]).concat(job.alternates || []), unitPrices: arr([]).concat(job.unitPrices || []), bidForm: arr(job.bidForm), contacts: job.contacts || {},
      internalNotes: s(job.internalNotes), ourDue: validDay(job.ourDue), ourDueTime: s(job.ourDueTime), crmLeadId: s(job.crmLeadId), crmProjectId: s(job.crmProjectId), crmProjectName: s(job.crmProjectName), biddingClosed: !!job.biddingClosed, pmName: s(job.pmName), pmEmail: s(job.pmEmail), status: s(job.status) },
    plans: plans.map(p => ({ name: s(p.name), size: p.size || 0, type: s(p.type), fileRef: s(p.fileRef), category: s(p.category), version: s(p.version), date: s(p.date), current: !!p.current, at: s(p.at), by: s(p.by), trades: arr(p.trades) })),
    questions: qs.map(r => r.data || {}).sort((a, b) => s(b.at).localeCompare(s(a.at))),
    acks: acks.map(r => r.data || {}), activity: act.map(r => r.data || {}).sort((a, b) => s(b.at).localeCompare(s(a.at))).slice(0, 200),
    audience: aud.map(x => ({ email: x.email, name: x.name, company: x.company, trades: x.trades, how: x.how, account: !!x.userId, lang: x.lang })) };
}

/* plans & specs: version / date / current on an uploaded file (uploads: subportal.js upload + plans-import), plan-room links */
async function plans(who, b){
  const job = await jobRow(b.jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  const ref = s(b.ref), at = nowIso();
  if (b.addLink) {
    const url = s(b.addLink.url); if (!/^https?:\/\/\S+$/i.test(url)) return { code: 400, error: 'Paste a full link (https://…).' };
    job.plansLinks = arr(job.plansLinks).concat([{ id: 'pl_' + crypto.randomBytes(4).toString('hex'), url: url.slice(0, 1000), label: s(b.addLink.label).slice(0, 120) || 'Plan room', version: s(b.addLink.version).slice(0, 40), date: s(b.addLink.date).slice(0, 10), at, by: who.email }]).slice(0, 40);
    logTo(job, who, '🔗 Plan link added: ' + (s(b.addLink.label) || url));
    await saveJob(job, who);
    let told = 0; try { told = await SP.notifyPlanRequests(job.id); } catch (e) {}   /* patch PLANREQ: whoever asked for plans hears */
    return { ok: true, told };
  }
  const link = arr(job.plansLinks).find(x => x && x.id === ref);
  if (link) {
    if (b.remove) job.plansLinks = arr(job.plansLinks).filter(x => x !== link);
    else { if (b.version != null) link.version = s(b.version).slice(0, 40); if (b.date != null) link.date = s(b.date).slice(0, 10); }
    logTo(job, who, (b.remove ? '🗑 Plan link removed: ' : '✏️ Plan link changed: ') + (link.label || link.url));
    await saveJob(job, who); return { ok: true };
  }
  const items = await SP.plansOf(job.id); const it = items.find(x => x && x.fileRef === ref);
  if (!it) return { code: 404, error: 'That file is not on the job.' };
  let list = items;
  if (b.remove) list = items.filter(x => x !== it);
  else {
    if (b.version != null) it.version = s(b.version).slice(0, 40);
    if (b.date != null) it.date = s(b.date).slice(0, 10);
    if (b.current === true) { items.forEach(x => { if (x !== it && s(x.category) === s(it.category)) x.current = false; }); it.current = true; }
    if (b.current === false) it.current = false;
  }
  await SP.upsertRows([{ collection: 'plans', id: job.id, job_id: job.id, data: { items: list } }], who.email);
  if (Array.isArray(b.trades) && !b.remove) { it.trades = b.trades.map(x => s(x).slice(0, 60)).filter(Boolean).slice(0, 8); if (b.kind === 'specs' || b.kind === 'plans') it.category = b.kind === 'specs' ? 'Specs' : (it.category === 'Specs' ? 'Plans' : it.category); }   /* patch PLANREQ-C: re-file a plan / spec by trade */
  job.plans = list.map(x => ({ name: x.name, size: x.size, type: x.type, category: x.category, version: x.version || '', date: x.date || '', current: !!x.current, trades: arr(x.trades).length ? x.trades : undefined }));   /* what the bid site lists */
  logTo(job, who, (b.remove ? '🗑 Plan removed: ' : b.current ? '⭐ Marked current: ' : '✏️ Plan changed: ') + s(it.name) + (it.version ? ' (' + it.version + ')' : ''));
  await saveJob(job, who);
  return { ok: true };
}

/* scopes per trade — from the estimate / Claude they are cleaned of every price here too; typed ones stay as typed */
async function scope(who, b){
  const job = await jobRow(b.jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  const BP = L.portalApi();
  job.tradeScopes = arr(b.tradeScopes).filter(x => x && (s(x.trade) || s(x.scope) || arr(x.files).length)).slice(0, 30).map(x => {
    const mode = /^(estimate|claude|xactimate)$/.test(s(x.mode)) ? s(x.mode) : 'manual';
    const old = arr(job.tradeScopes).find(y => y && s(y.id) && s(y.id) === s(x.id));
    /* patch PLANREQ-C: a trade's scope files stay (sent back as they are, or a removal) — only files already on the job / uploaded to the bid site's staff area */
    const files = (Array.isArray(x.files) ? arr(x.files) : arr(old && old.files)).filter(f => /^staff\/[A-Za-z0-9._\/-]{3,300}$/.test(s(f.fileRef)) && s(f.fileRef).indexOf('..') < 0).slice(0, 40)
      .map(f => ({ name: s(f.name).slice(0, 200) || 'scope', size: Number(f.size) || 0, type: s(f.type).slice(0, 120), fileRef: s(f.fileRef), at: s(f.at) || nowIso(), by: s(f.by) || who.email }));
    return { id: s(x.id) || 'ts_' + crypto.randomBytes(4).toString('hex'), trade: s(x.trade).slice(0, 80), scope: (mode === 'manual' ? s(x.scope) : BP._noPrices(x.scope)).slice(0, 20000), mode, files, at: nowIso(), by: who.email };
  });
  logTo(job, who, '📝 Scopes saved: ' + (job.tradeScopes.map(x => x.trade || 'general').join(', ') || 'none'));
  await saveJob(job, who);
  return { ok: true, tradeScopes: job.tradeScopes };
}

/* the e-mail about an addendum / an update: queued on ✅ Approvals, never while paused */
function noticeMail(job, what, o, es){
  const title = s(job.title) || 'GrayCo bid job', link = SP.PORTAL_ORIGIN + '/';
  const tag = [s(job.poNumber), s(job.address)].filter(Boolean).join(' · ');
  if (what === 'addendum') {
    const due = o.dueTo ? (es ? 'Nueva fecha límite: <b>' : 'The bid due date changed to <b>') + SP.esc(o.dueTo) + '</b>' + (o.dueFrom ? (es ? ' (antes ' : ' (was ') + SP.esc(o.dueFrom) + ')' : '') + '.' : '';
    const subject = (es ? 'Adenda #' : 'Addendum #') + o.num + ' — ' + title + (tag ? ' — ' + tag : '') + (o.dueTo ? (es ? ' · fecha límite cambiada' : ' · due date changed') : '');
    const lines = [(es ? 'GrayCo publicó la <b>adenda #' : 'GrayCo posted <b>addendum #') + o.num + '</b> ' + (es ? 'para ' : 'for ') + '<b>' + SP.esc(title) + '</b>' + (o.title ? ': ' + SP.esc(o.title) : '') + '.',
      due, o.text ? SP.esc(s(o.text).slice(0, 1500)).replace(/\n/g, '<br>') : '', arr(o.files).length ? (es ? 'Archivos en el sitio de licitaciones: ' : 'Files on the bid site: ') + arr(o.files).map(f => SP.esc(f.name)).join(', ') : '',
      es ? 'Entre al sitio y marque <b>Acuso recibo de la adenda</b>.' : 'Open the job on the bid site and tap <b>Acknowledge addendum #' + o.num + '</b>.'];
    return { subject: subject.slice(0, 240), html: SP.mailHtml(es ? 'Adenda #' + o.num : 'Addendum #' + o.num, lines.filter(Boolean), { href: link, label: es ? 'Ver la adenda' : 'See the addendum' }) };
  }
  const subject = (es ? 'Novedad de GrayCo — ' : 'Update from GrayCo — ') + title + (tag ? ' — ' + tag : '');
  return { subject: subject.slice(0, 240), html: SP.mailHtml(es ? 'Novedad sobre ' + title : 'Update on ' + title, [SP.esc(s(o.body).slice(0, 3000)).replace(/\n/g, '<br>'), es ? 'También está en el sitio de licitaciones (Mensajes).' : 'It is on the bid site too (Messages).'], { href: link, label: es ? 'Abrir el sitio' : 'Open the bid site' }) };
}
async function queueNotice(who, job, what, ref, o, to){
  if (!to.length) return { status: 'nobody', n: 0 };
  let paused = true; try { paused = await require('./_lib/pause').isPaused({ fresh: true }); } catch (e) {}
  if (paused) return { status: 'held', why: 'data-entry mode', n: to.length, at: nowIso() };   /* nothing queued while ⏸ is on */
  const id = 'appr_bp_' + s(job.id).slice(-10) + '_' + (what === 'addendum' ? 'a' + ref : s(ref).slice(-8)) + '_' + Date.now().toString(36);
  const en = noticeMail(job, what, o, false), es = noticeMail(job, what, o, true);
  const core = (exports._core || require('./portal.js')._core);
  const ok = await core.queueApproval({ id, kind: 'bp_notice', title: (what === 'addendum' ? 'Addendum #' + ref : 'Update') + ' to ' + to.length + ' sub' + (to.length === 1 ? '' : 's') + ' — ' + s(job.title),
    pid: '', jobName: s(job.title), to: to.length + ' sub' + (to.length === 1 ? '' : 's') + ' (one e-mail each)', subject: en.subject, html: en.html,
    meta: { jobId: job.id, what, ref: String(ref), to: to.map(x => ({ email: x.email, lang: x.lang })), en, es, by: who.email } });
  return ok ? { status: 'waiting', apprId: id, n: to.length, at: nowIso() } : { status: 'error', why: 'could not reach ✅ Approvals', n: to.length };
}

async function addendum(who, b){
  if (!who.canInvite) return { code: 403, error: 'Only an admin, an estimator or the office posts addenda.' };
  const job = await jobRow(b.jobId); if (!job || GONE.test(s(job.status))) return { code: 404, error: 'No such bid job.' };
  const text = s(b.text).slice(0, 8000), title = s(b.title).slice(0, 200);
  if (!text && !title && !arr(b.files).length) return { code: 400, error: 'Write what the addendum changes, or attach its files.' };
  const files = arr(b.files).filter(f => f && /^staff\/[A-Za-z0-9._\/-]{3,300}$/.test(s(f.fileRef)) && s(f.fileRef).indexOf('..') < 0)
    .slice(0, 20).map(f => ({ name: s(f.name).slice(0, 200) || 'addendum.pdf', size: Number(f.size) || 0, type: s(f.type).slice(0, 80), fileRef: s(f.fileRef) }));
  const num = Math.max(0, ...arr(job.addenda).map(a => Number(a && a.num) || 0)) + 1;
  const a = { num, date: s(b.date).slice(0, 10) || nowIso().slice(0, 10), title, text, files, publishedAt: nowIso(), by: who.email };
  const nd = s(b.newDue).slice(0, 10);
  if (nd && /^\d{4}-\d{2}-\d{2}$/.test(nd) && nd !== s(job.bidDueDate)) { a.dueFrom = s(job.bidDueDate) + (s(job.bidDueTime) ? ' ' + s(job.bidDueTime) : ''); job.bidDueDate = nd; if (s(b.newDueTime)) job.bidDueTime = s(b.newDueTime).slice(0, 5); a.dueTo = nd + (s(job.bidDueTime) ? ' ' + s(job.bidDueTime) : ''); }
  const to = b.notify === false ? [] : await audience(job);
  a.notice = await queueNotice(who, job, 'addendum', num, a, to);
  job.addenda = arr(job.addenda).concat([a]);
  logTo(job, who, '📎 Addendum #' + num + ' posted' + (a.dueTo ? ' — bid due changed to ' + a.dueTo : '') + ' · e-mail: ' + a.notice.status + (a.notice.n ? ' (' + a.notice.n + ')' : ''));
  await saveJob(job, who);
  return { ok: true, num, notice: a.notice, due: job.bidDueDate };
}

async function post(who, b){
  if (!who.canInvite) return { code: 403, error: 'Only an admin, an estimator or the office posts updates.' };
  const job = await jobRow(b.jobId); if (!job || GONE.test(s(job.status))) return { code: 404, error: 'No such bid job.' };
  const body = s(b.body).slice(0, 5000); if (!body) return { code: 400, error: 'Write the update.' };
  const tg = b.target || {}, kind = /^(all|trade|sub)$/.test(s(tg.kind)) ? s(tg.kind) : 'all';
  let aud = await audience(job);
  if (kind === 'trade') aud = aud.filter(x => inTrade(x, tg.trade));
  if (kind === 'sub') aud = aud.filter(x => x.email === low(tg.email));
  if (!aud.length) return { code: 400, error: kind === 'sub' ? 'That sub is not invited to this job.' : 'No invited sub ' + (kind === 'trade' ? 'in ' + s(tg.trade) : 'on this job') + ' yet.' };
  const id = 'bpu_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), at = nowIso();
  const sender = { senderId: 'st_' + who.email.split('@')[0].replace(/[^a-z0-9]+/g, '_').slice(0, 40), senderName: s(who.name) || 'GrayCo', senderCompany: 'GrayCo Construction Services', senderRole: 'admin' };
  const rows = aud.filter(x => x.userId).map((x, i) => SP.rowFor('messages', Object.assign({ id: id + '_' + i, jobId: job.id, recipientSubId: x.userId, body, at, readBy: [], kind: 'update', postId: id }, sender)));
  if (rows.length) await SP.upsertRows(rows, who.email);   /* on the bid site (Messages), no e-mail from here */
  const p = { id, at, by: who.email, body, target: { kind, trade: s(tg.trade), email: low(tg.email) }, n: aud.length, inPortal: rows.length };
  p.notice = b.email ? await queueNotice(who, job, 'post', id, p, aud) : { status: 'portal only', n: 0 };
  job.posts = arr(job.posts).concat([p]).slice(-200);
  logTo(job, who, '📣 Update to ' + (kind === 'all' ? 'all invited subs' : kind === 'trade' ? 'the ' + s(tg.trade) + ' subs' : low(tg.email)) + ' (' + aud.length + ') · e-mail: ' + p.notice.status);
  await saveJob(job, who);
  return { ok: true, id, n: aud.length, inPortal: rows.length, notice: p.notice };
}

/* patch PLANREQ-T / PLANREQ-D (owner 11/12: "need to put what trades we are bidding on some places"; "also need to edit when bid is due"):
   📂 Manage's ✏️ Trades and ✏️ Bid due (the bids-site admin page saves its due date through subportal.js, which calls dueChanged too).
     trades → tradesSought + one trade-scope box per trade (a box with a scope or files is kept even when its trade is taken off);
     due / dueTime → the bid due date ("" = No due date — only on a private job: a public one needs a date, the 📢 rule).
   A changed due date on a job subs can see: 🗂 Activity, and an automatic 📣 Update "Bid due date changed to …" — on the bid site at once
   (Messages / Updates from GrayCo), the e-mail queued on ✅ Approvals like any update (held while ⏸ data-entry mode is on).
   Who: an admin, an estimator, the office, or the job's poster / PM (the Put on bid portal rule). */
/* patch PLANREQ-E (owner 11/12: "need Manage and Actions to have more ways to edit and add info to the bid portal"): 📂 Manage → 📝 Details edits
   the whole bid job in place — title, site address, the owner / GC we bid to (shown to subs only when ticked), project type, bid due, site walk /
   pre-bid meeting (date, time, place, RSVP list — staff only), questions deadline, start date + duration, bid instructions, requirements (bond,
   prevailing wage / Davis-Bacon, certified payroll, COI limits GL / WC / auto, licenses, MBE / WBE), alternates, unit prices, the bid form's
   line items per trade (a sub fills them in when bidding), the PM / estimator contacts subs see, internal notes (never to a sub), trades, the
   CRM lead. Every change → 🗂 Activity; what matters to subs (due, walk, questions deadline, start, instructions, requirements, alternates,
   unit prices, bid form) on a job they can see → one automatic 📣 Update (bid site at once; e-mail on ✅ Approvals, held in ⏸).
   ⏸ Close bidding (op bidding): no new bids or changes, the job stays visible; 📋 Duplicate (op duplicate): a copy as a new 🔒 private job
   (details, trades, scopes, plans, links — no subs, invites, bids, questions). */
function dueText(d, tm){ return d ? d + (tm ? ' ' + tm : '') : 'no due date'; }
const PTYPES = ['commercial', 'multifamily', 'residential', 'insurance'];
const REQ_KEYS = ['bond', 'prevailingWage', 'certifiedPayroll', 'coi', 'licenses', 'mbeWbe'];
function cleanList(v, n, len){ return arr([]).concat(Array.isArray(v) ? v : s(v).split(/\n/)).map(x => s(typeof x === 'object' && x ? x.text || x.name : x).slice(0, len || 300)).filter(Boolean).slice(0, n || 30); }
function reqText(r){ r = r || {}; const l = [];
  if (r.bond) l.push('bond'); if (r.prevailingWage) l.push('prevailing wage / Davis-Bacon'); if (r.certifiedPayroll) l.push('certified payroll');
  if (r.coi) l.push('COI' + ([r.coiGl ? 'GL ' + r.coiGl : '', r.coiWc ? 'WC ' + r.coiWc : '', r.coiAuto ? 'auto ' + r.coiAuto : ''].filter(Boolean).length ? ' (' + [r.coiGl ? 'GL ' + r.coiGl : '', r.coiWc ? 'WC ' + r.coiWc : '', r.coiAuto ? 'auto ' + r.coiAuto : ''].filter(Boolean).join(', ') + ')' : ''));
  if (r.licenses) l.push('licenses' + (r.licensesText ? ': ' + r.licensesText : '')); if (r.mbeWbe) l.push('MBE / WBE' + (r.mbeWbeText ? ': ' + r.mbeWbeText : '')); return l.join(', '); }
/* an automatic update to the subs who can see the job (on the bid site at once; the e-mail waits on ✅ Approvals, held in ⏸) */
async function subNotice(who, job, body){
  if (job.draft === true || low(job.status) === 'draft' || GONE.test(s(job.status))) return { status: 'not posted' };
  const aud = await audience(job);
  if (!aud.length) return { status: 'nobody', n: 0 };
  const id = 'bpu_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), at = nowIso();
  const sender = { senderId: 'st_' + s(who.email).split('@')[0].replace(/[^a-z0-9]+/g, '_').slice(0, 40), senderName: s(who.name) || 'GrayCo', senderCompany: 'GrayCo Construction Services', senderRole: 'admin' };
  const rows = aud.filter(x => x.userId).map((x, i) => SP.rowFor('messages', Object.assign({ id: id + '_' + i, jobId: job.id, recipientSubId: x.userId, body, at, readBy: [], kind: 'update', postId: id }, sender)));
  if (rows.length) await SP.upsertRows(rows, who.email);
  const p = { id, at, by: who.email, body, target: { kind: 'all', trade: '', email: '' }, n: aud.length, inPortal: rows.length, auto: 'details' };
  p.notice = await queueNotice(who, job, 'post', id, p, aud);
  job.posts = arr(job.posts).concat([p]).slice(-200);
  return p.notice;
}
async function dueChanged(who, job, from){   /* the bid site's own due-date save (subportal.js) */
  const to = dueText(validDay(job.bidDueDate), s(job.bidDueTime));
  if (to === from) return null;
  logTo(job, who, '⏰ Bid due changed: ' + from + ' → ' + to);
  return subNotice(who, job, (validDay(job.bidDueDate) ? 'Bid due date changed to ' + to : 'The bid due date was taken off (no due date for now)') + ' (was ' + from + ').');
}
async function details(who, b){
  const job = await jobRow(b.jobId); if (!job || GONE.test(s(job.status))) return { code: 404, error: 'No such bid job.' };
  if (!who.canInvite && !(await posterRole(who, {}, job))) return { code: 403, error: 'Only an admin, an estimator, the office or the job\'s PM changes a bid job.' };
  const out = { ok: true, jobId: job.id }, log = [], subs = [];
  const set = (k, v, label, forSubs, show) => { const was = JSON.stringify(job[k] === undefined ? '' : job[k]); if (was === JSON.stringify(v)) return; job[k] = v; log.push(label); if (forSubs) subs.push(show || label); };
  if (b.title !== undefined) { const t = s(b.title).slice(0, 200); if (!t) return { code: 400, error: 'Give the job a title.' }; set('title', t, 'title'); }
  if (b.address !== undefined) set('address', s(b.address).slice(0, 240), 'site address', true, 'Site address: ' + s(b.address).slice(0, 240));
  if (b.ownerGc !== undefined) set('ownerGc', s(b.ownerGc).slice(0, 200), 'owner / GC');
  if (b.showOwnerGc !== undefined) set('showOwnerGc', b.showOwnerGc === true, 'owner / GC shown to subs: ' + (b.showOwnerGc === true ? 'yes' : 'no'));
  if (b.projectType !== undefined) set('projectType', PTYPES.indexOf(s(b.projectType)) > -1 ? s(b.projectType) : '', 'project type');
  if (b.siteWalk !== undefined) { const w = b.siteWalk || {}; const v = { date: validDay(w.date), time: /^\d{2}:\d{2}$/.test(s(w.time)) ? s(w.time) : '', location: s(w.location).slice(0, 240), rsvp: cleanList(w.rsvp, 60, 120), mandatory: w.mandatory === true };
    const pub = x => JSON.stringify([x && x.date, x && x.time, x && x.location, x && x.mandatory]);
    if (pub(job.siteWalk) !== pub(v)) subs.push(v.date ? 'Site walk / pre-bid meeting: ' + v.date + (v.time ? ' ' + v.time : '') + (v.location ? ' at ' + v.location : '') + (v.mandatory ? ' (mandatory)' : '') : 'The site walk was taken off');
    if (JSON.stringify(job.siteWalk || null) !== JSON.stringify(v)) { job.siteWalk = v; log.push('site walk'); } }
  if (b.questionsDue !== undefined) set('questionsDue', validDay(b.questionsDue), 'questions deadline', true, 'Questions due by ' + (validDay(b.questionsDue) || '— (no deadline)'));
  if (b.startDate !== undefined) set('startDate', validDay(b.startDate), 'start date', true, 'Expected start: ' + (validDay(b.startDate) || 'not set'));
  if (b.duration !== undefined) set('duration', s(b.duration).slice(0, 80), 'duration', true, 'Duration: ' + s(b.duration).slice(0, 80));
  if (b.bidInstructions !== undefined) set('bidInstructions', s(b.bidInstructions).slice(0, 8000), 'bid instructions', true, 'Bid instructions were updated');
  if (b.requirements !== undefined) { const r = b.requirements || {}, v = {}; REQ_KEYS.forEach(k => { v[k] = r[k] === true; });
    ['coiGl', 'coiWc', 'coiAuto', 'licensesText', 'mbeWbeText'].forEach(k => { v[k] = s(r[k]).slice(0, 120); }); set('requirements', v, 'requirements', true, 'Requirements: ' + (reqText(v) || 'none')); }
  if (b.alternates !== undefined) { const v = cleanList(b.alternates, 30, 300); set('alternates', v, 'alternates', true, 'Alternates: ' + (v.join('; ') || 'none')); }
  if (b.unitPrices !== undefined) { const v = cleanList(b.unitPrices, 40, 200); set('unitPrices', v, 'unit prices', true, 'Unit prices requested: ' + (v.join('; ') || 'none')); }
  if (b.bidForm !== undefined) { const v = arr(b.bidForm).filter(x => s(x.item)).slice(0, 80).map(x => ({ id: s(x.id) || 'bf_' + crypto.randomBytes(3).toString('hex'), trade: s(x.trade).slice(0, 60), item: s(x.item).slice(0, 200), unit: s(x.unit).slice(0, 30) }));
    set('bidForm', v, 'bid form', true, 'The bid form now has ' + v.length + ' line item' + (v.length === 1 ? '' : 's')); }
  if (b.contacts !== undefined) { const c = b.contacts || {}, v = {}; ['pmName', 'pmPhone', 'pmEmail', 'estName', 'estPhone', 'estEmail'].forEach(k => { v[k] = s(c[k]).slice(0, 120); }); set('contacts', v, 'contacts shown to subs'); }
  if (b.internalNotes !== undefined) set('internalNotes', s(b.internalNotes).slice(0, 8000), 'internal notes');
  if (b.crmLeadId !== undefined) set('crmLeadId', s(b.crmLeadId).slice(0, 120), 'CRM lead');
  if (b.ourDue !== undefined) { const od = validDay(b.ourDue); if (s(b.ourDue) && !od) return { code: 400, error: 'Our bid due date is not a date.' };   /* patch PLANREQ-F: staff only — never posted to subs */
    set('ourDue', od, 'our bid due ' + (od || 'none')); set('ourDueTime', od && /^\d{2}:\d{2}$/.test(s(b.ourDueTime)) ? s(b.ourDueTime) : '', 'our bid due time'); out.ourDue = job.ourDue; out.ourDueTime = job.ourDueTime; }
  if (Array.isArray(b.trades)) {
    const trades = Array.from(new Set(b.trades.map(x => s(x).slice(0, 60)).filter(Boolean))).slice(0, 30);
    const keep = arr(job.tradeScopes), byT = {}; keep.forEach(x => { if (x && s(x.trade)) byT[low(x.trade)] = x; });
    job.tradeScopes = trades.map(tr => byT[low(tr)] || { id: 'ts_' + crypto.randomBytes(4).toString('hex'), trade: tr, scope: '', files: [] })
      .concat(keep.filter(x => x && !trades.some(tr => low(tr) === low(x.trade)) && (s(x.scope) || arr(x.files).length)));
    if (s(job.tradesSought) !== trades.join(', ') || job.tradesPicked !== true) { job.tradesSought = trades.join(', '); job.tradesPicked = true; log.push('trades: ' + (job.tradesSought || 'none')); }   /* patch PLANREQ-H: picked by a person */
    out.trades = trades;
  }
  if (b.due !== undefined) {
    const d = validDay(b.due); if (s(b.due) && !d) return { code: 400, error: 'The bid due date is not a date.' };
    if (!d && s(job.visibility) === 'public' && !(job.draft === true)) return { code: 400, error: 'A public bid job needs a bid due date — make it private first to have no due date.' };
    const from = dueText(validDay(job.bidDueDate), s(job.bidDueTime));
    job.bidDueDate = d; job.bidDueTime = d ? (/^\d{2}:\d{2}$/.test(s(b.dueTime)) ? s(b.dueTime) : (b.dueTime === '' ? '' : s(job.bidDueTime))) : '';
    const to = dueText(job.bidDueDate, job.bidDueTime);
    if (to !== from) { log.push('⏰ bid due ' + from + ' → ' + to); subs.unshift(d ? 'Bid due date changed to ' + to + ' (was ' + from + ')' : 'The bid due date was taken off (was ' + from + ')'); }
    out.due = job.bidDueDate; out.dueTime = job.bidDueTime;
  }
  if (log.length) logTo(job, who, '📝 Details changed: ' + log.join(' · '));
  if (subs.length) out.notice = await subNotice(who, job, 'GrayCo updated this bid job:\n• ' + subs.join('\n• '));
  await saveJob(job, who);
  out.changed = log;
  return out;
}
/* patch PLANREQ-I (owner 11/12: "the all-subs scope should be here with the plans, and the separate by-trade scopes go to Scopes"): a scope
   file already saved with the plans that is for ONE trade (its name / kind says so: Hamlets_Scope_01_Sitework.docx → Sitework) moves to that
   trade's scope (the trade is added to the job when a person picked its trades; the box shows either way) and leaves the plans list; a scope
   for every sub stays with the plans as "Scope — all subs". Run once when 📂 Manage opens (op resort). */
function resortable(items){
  const G = require('./_lib/tradeguess.js');
  return arr(items).map(f => { const g = G.guess(s(f.name), ''), isScope = /^scope/i.test(s(f.category)) || f.kind === 'scope' || g.kind === 'scope';
    return { f, isScope, trades: isScope ? (arr(f.trades).length && f.kind === 'scope' ? f.trades : g.trades) : [] }; });
}
function resortCount(items){ return resortable(items).filter(x => x.isScope && (x.trades.length || s(x.f.category) !== 'Scope — all subs')).length; }
async function resort(who, b){
  const job = await jobRow(b.jobId); if (!job || GONE.test(s(job.status))) return { code: 404, error: 'No such bid job.' };
  if (!who.canInvite && !(await posterRole(who, {}, job))) return { code: 403, error: 'Only an admin, an estimator, the office or the job\'s PM changes a bid job.' };
  const items = await SP.plansOf(job.id), keep = [], moved = [], relabeled = [];
  resortable(items).forEach(x => {
    if (x.isScope && x.trades.length) { moved.push(x); return; }
    if (x.isScope && s(x.f.category) !== 'Scope — all subs') { x.f.category = 'Scope — all subs'; x.f.kind = 'scope'; relabeled.push(x.f.name); }
    keep.push(x.f);
  });
  if (!moved.length && !relabeled.length) return { ok: true, moved: [], relabeled: [] };
  const picked = tradesPicked(job), sought = tradeSplit(job.tradesSought);
  job.tradeScopes = arr(job.tradeScopes);
  moved.forEach(x => x.trades.forEach(tr => {
    let ts = job.tradeScopes.find(y => low(y.trade) === low(tr)); if (!ts) { ts = { id: 'ts_' + crypto.randomBytes(4).toString('hex'), trade: tr, scope: '', files: [] }; job.tradeScopes.push(ts); }
    ts.files = arr(ts.files); if (!ts.files.some(f => f.fileRef === x.f.fileRef)) ts.files.push({ name: s(x.f.name), size: x.f.size || 0, type: s(x.f.type), fileRef: s(x.f.fileRef), at: s(x.f.at) || nowIso(), by: s(x.f.by) || who.email });
    if (picked && !sought.some(t => low(t) === low(tr))) sought.push(tr);
  }));
  if (picked) job.tradesSought = sought.join(', ');
  job.plans = keep.map(x => ({ name: x.name, size: x.size, type: x.type, category: x.category, version: x.version || '', date: x.date || '', current: !!x.current, trades: arr(x.trades).length ? x.trades : undefined }));
  await SP.upsertRows([{ collection: 'plans', id: job.id, job_id: job.id, data: { items: keep } }], who.email);
  logTo(job, who, '📝 Sorted: ' + moved.map(x => s(x.f.name) + ' → ' + x.trades.join(', ') + ' scope').concat(relabeled.map(n => n + ' → Scope — all subs')).join(' · '));
  await saveJob(job, who);
  return { ok: true, moved: moved.map(x => ({ name: s(x.f.name), trades: x.trades })), relabeled };
}
async function bidding(who, b){   /* ⏸ Close bidding / ▶ Reopen: no new bids or changes; the job stays visible */
  const job = await jobRow(b.jobId); if (!job || GONE.test(s(job.status))) return { code: 404, error: 'No such bid job.' };
  if (!who.canInvite && !(await posterRole(who, {}, job))) return { code: 403, error: 'Only an admin, an estimator, the office or the job\'s PM closes bidding.' };
  const close = b.close === true;
  if (!!job.biddingClosed === close) return { ok: true, biddingClosed: close, same: true };
  job.biddingClosed = close; job.biddingClosedAt = close ? nowIso() : ''; job.biddingClosedBy = close ? who.email : '';
  logTo(job, who, close ? '⏸ Bidding closed (no new bids; the job stays visible)' : '▶ Bidding reopened');
  const notice = await subNotice(who, job, close ? 'Bidding is closed on this job — GrayCo is no longer taking new bids or changes. Thank you to everyone who bid.' : 'Bidding is open again on this job.');
  await saveJob(job, who);
  return { ok: true, biddingClosed: close, notice };
}
async function duplicate(who, b){   /* 📋 a copy as a new private job: the details, trades, scopes, plans and links — never subs, invites, bids or questions */
  const job = await jobRow(b.jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  if (!who.canInvite && !(await posterRole(who, {}, job))) return { code: 403, error: 'Only an admin, an estimator, the office or the job\'s PM copies a bid job.' };
  const at = nowIso(), id = 'j_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const copy = JSON.parse(JSON.stringify(job));
  ['log', 'posts', 'addenda', 'archivedAt', 'archivedBy', 'archivedReason', 'archivedFrom', 'publishedAt', 'publishedBy', 'madePublicAt', 'biddingClosed', 'biddingClosedAt', 'biddingClosedBy', 'awardedAt', 'leadInbox', 'crmFileRefs'].forEach(k => { delete copy[k]; });
  Object.assign(copy, { id, title: s(b.title).slice(0, 200) || 'Copy of ' + s(job.title), status: 'open', visibility: 'private', draft: false, createdAt: at, createdBy: 'crm-copy', createdByName: s(who.name) || who.email,
    postedAt: at, postedBy: who.email, postedByName: s(who.name) || who.email, openedPrivateAt: at, openedBy: who.email, copiedFrom: job.id, updatedAt: at });
  logTo(copy, who, '📋 Copied from "' + s(job.title) + '" (🔒 private — no subs invited yet)');
  const rows = [SP.rowFor('jobs', copy)], pl = await SP.plansOf(job.id).catch(() => []);
  if (pl.length) rows.push({ collection: 'plans', id, job_id: id, data: { items: pl } });
  await SP.upsertRows(rows, who.email);
  const src = await jobRow(job.id); if (src) { logTo(src, who, '📋 Copied to a new job "' + copy.title + '"'); await saveJob(src, who); }
  return { ok: true, jobId: id, title: copy.title };
}
/* a sub's question: answer privately, or publish the answer to every bidder (its e-mail waits on approval, as before) */
async function answer(who, b){
  const q = await SP.getRow('questions', s(b.id)); if (!q) return { code: 404, error: 'No such question.' };
  if (!who.canInvite && !(await posterRole(who, {}, await jobRow(q.data.jobId)))) return { code: 403, error: 'Only an admin, an estimator, the office or the job\'s PM answers bid questions.' };   /* patch BIDPOST: + the poster / PM */
  const pub = b.publish === true;
  const r = await SP.saveCollection({ isAdmin: true, email: who.email, profile: { name: s(who.name) || who.email } }, 'questions',
    [{ id: q.data.id, answer: s(b.answer).slice(0, 8000), visibility: pub ? 'public' : 'private' }], [], {});
  const job = await jobRow(q.data.jobId);
  if (job) { logTo(job, who, '💬 Answered ' + s(q.data.userCompany) + '\'s question' + (pub ? ' — published to all bidders' : ' (private)')); await saveJob(job, who); }
  const now = await SP.getRow('questions', s(b.id));
  return { ok: true, saved: r.saved, question: now && now.data };
}
/* patch PLANREQ: a sub's 📩 plan / info request — ↩ Reply (to that sub: bid site + e-mail, held in ⏸) or ✅ Mark sent; either clears its To-Do */
async function planreq(who, b){
  const q = await SP.getRow('planreqs', s(b.id)); if (!q) return { code: 404, error: 'No such request.' };
  const job = await jobRow(q.data.jobId);
  if (!who.canInvite && !(await posterRole(who, {}, job))) return { code: 403, error: 'Only an admin, an estimator, the office or the job\'s PM answers plan requests.' };
  const r = await SP.planReqAct(who, { id: s(b.id), act: s(b.act), text: s(b.text) });
  if (job) { logTo(job, who, (s(b.act) === 'reply' ? '↩ Replied to ' : '✅ Marked sent: ') + s(q.data.company) + '\'s request (' + arr(q.data.needs).join(', ') + ')'); await saveJob(job, who); }
  return r;
}
async function noticeAgain(who, b){   /* "Send now" after ⏸ ended: queue the held e-mail on Approvals */
  if (!who.canInvite) return { code: 403, error: 'Not allowed.' };
  const job = await jobRow(b.jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  const aud = await audience(job);
  if (s(b.what) === 'addendum') {
    const a = arr(job.addenda).find(x => x && String(x.num) === String(b.ref)); if (!a) return { code: 404, error: 'No such addendum.' };
    a.notice = await queueNotice(who, job, 'addendum', a.num, a, aud);
    logTo(job, who, '📎 Addendum #' + a.num + ' e-mail: ' + a.notice.status); await saveJob(job, who); return { ok: true, notice: a.notice };
  }
  const p = arr(job.posts).find(x => x && x.id === s(b.ref)); if (!p) return { code: 404, error: 'No such update.' };
  let to = aud; if (p.target.kind === 'trade') to = aud.filter(x => inTrade(x, p.target.trade)); if (p.target.kind === 'sub') to = aud.filter(x => x.email === p.target.email);
  p.notice = await queueNotice(who, job, 'post', p.id, p, to);
  logTo(job, who, '📣 Update e-mail: ' + p.notice.status); await saveJob(job, who); return { ok: true, notice: p.notice };
}

exports.handler = async function(event){
  event = event || {}; const C = cors(event); const q = event.queryStringParameters || {};
  if (event.httpMethod === 'OPTIONS') return J(200, {}, C);
  if (event.httpMethod === 'GET' && q.ping === '1') return J(200, { ok: true, service: 'GrayCo bid portal (CRM)' }, C);
  const who = await whoIs(event); if (!who.ok) return J(who.code || 401, { error: who.error }, C);
  try {
    if (event.httpMethod === 'GET') {
      if (q.jobs) return J(200, { ok: true, jobs: await jobsList(), me: { email: who.email, admin: who.admin, estimator: who.estimator, office: who.office, canInvite: who.canInvite, canPublic: who.canPublic } }, C);
      if (q.subbids || q.lead) {
        const jobId = s(q.subbids) || L.portalApi().jobIdFor({ id: s(q.lead) });
        return J(200, { ok: true, jobId, bids: await subBids(jobId), sent: await sentScope(jobId) }, C);   /* patch BIDSCOPE: + the scope GrayCo sent */
      }
      if (q.posted) { const r = await postedView(who, s(q.posted)); return r.code ? J(r.code, { error: r.error }, C) : J(200, r, C); }   /* patch BIDPOST */
      if (q.manage) { if (!who.canInvite && !(await posterRole(who, {}, await jobRow(s(q.manage)))))  return J(403, { error: 'Only an admin, an estimator or the office manages a bid job.' }, C); const r = await manageView(s(q.manage)); return r.code ? J(r.code, { error: r.error }, C) : J(200, r, C); }   /* patch SYS2 */
      if (q.subs) { if (!who.canInvite) return J(403, { error: 'Only an admin, an estimator or the office invites subs.' }, C); return J(200, { ok: true, subs: await subsList(s(q.job)) }, C); }
      return J(400, { error: 'What do you want?' }, C);
    }
    if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' }, C);
    let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }, C); }
    let r;
    if (b.op === 'invite') r = who.canInvite ? await invite(who, b) : { code: 403, error: 'Only an admin, an estimator or the office invites subs.' };
    else if (b.op === 'visibility') r = await visibility(who, b);
    else if (b.op === 'award') r = await award(who, b);
    else if (b.op === 'sweep') r = await sweep(who);
    else if (b.op === 'link') r = await link(who, b);   /* patch BIDEST */
    else if (b.op === 'postjob') r = await postjob(who, b);   /* patch BIDPOST: 📢 Put on bid portal */
    else if (b.op === 'unpost') r = await unpost(who, b);
    else if (b.op === 'cleanup') r = await cleanup(who, b);
    else if (b.op === 'archive') r = await archive(who, b);   /* patch SYS2 */
    else if (b.op === 'restore') r = await restore(who, b);
    else if (/^(plans|scope|addendum|post|notice)$/.test(s(b.op)) && !who.canInvite && !(await posterRole(who, {}, await jobRow(b.jobId)))) r = { code: 403, error: 'Only an admin, an estimator or the office changes a bid job.' };
    else if (b.op === 'plans') r = await plans(who, b);
    else if (b.op === 'scope') r = await scope(who, b);
    else if (b.op === 'addendum') r = await addendum(who, b);
    else if (b.op === 'post') r = await post(who, b);
    else if (b.op === 'answer') r = await answer(who, b);
    else if (b.op === 'notice') r = await noticeAgain(who, b);
    else if (b.op === 'planreq') r = await planreq(who, b);   /* patch PLANREQ */
    else if (b.op === 'details') r = await details(who, b);   /* patch PLANREQ-T/D: ✏️ trades, ✏️ bid due */
    else if (b.op === 'bidding') r = await bidding(who, b);
    else if (b.op === 'resort') r = await resort(who, b);   /* patch PLANREQ-I */   /* patch PLANREQ-E: ⏸ Close bidding / ▶ Reopen */
    else if (b.op === 'duplicate') r = await duplicate(who, b);   /* patch PLANREQ-E: 📋 Duplicate */
    else return J(400, { error: 'Unknown action.' }, C);
    return r.code ? J(r.code, { error: r.error }, C) : J(200, r, C);
  } catch (e) {
    return J(e.status || 502, { error: e.status ? e.message : 'The bid portal could not be reached: ' + s(e && e.message) }, C);
  }
};
exports._test = { postjob, unpost, cleanup, postedView, posterRole, autoAdded, postedOnPurpose, validDay, jobsList, sentScope, awardMail, notSelectedMail, mailGate, pmOf, link, fileOut, amountOf, subBids, subsList, jobsList, invite, visibility, award, sweep, inviteMail, whoIs, archive, restore, manageView, audience, noticeMail, planreq, details, dueChanged, bidding, duplicate, subNotice, tradesPicked, resort, resortCount };
/* patch LOGOALL (owner 10/23: "should have our logo on it"): every customer / sub / GC e-mail this file sends
   straight to Resend gets the GrayCo shell (centered logo, office line, licenses). Internal @grayco-cs.com mail is untouched. */
try { require('./_lib/brand.js').installResend(); } catch (e) {}
