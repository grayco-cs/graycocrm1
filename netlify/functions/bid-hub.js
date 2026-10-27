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
  const [jobs, invites, bids] = await Promise.all([
    SP.listRows([SP.eq('collection', 'jobs')]), SP.listRows([SP.eq('collection', 'invites')]).catch(() => []), SP.listRows([SP.eq('collection', 'bids')]).catch(() => [])]);
  const mail = arr(await L.kvGet(T.KV_SUBBIDS).catch(() => []));
  const inv = {}, nb = {}, nm = {};
  invites.forEach(r => { if (r.job_id) inv[r.job_id] = (inv[r.job_id] || 0) + 1; });
  bids.forEach(r => { if (r.job_id) nb[r.job_id] = (nb[r.job_id] || 0) + 1; });
  mail.forEach(x => { if (x && x.jobId) nm[x.jobId] = (nm[x.jobId] || 0) + 1; });
  return jobs.map(r => r.data || {}).filter(j => j.id && (!GONE.test(s(j.status)) || restorable(j))).map(j => ({
    deleted: GONE.test(s(j.status)), deletedAt: s(j.archivedAt), deletedBy: s(j.archivedBy),   /* patch SYS2: 🗑 Deleted (n), restorable for 30 days */
    id: s(j.id), title: s(j.title), address: s(j.address), po: s(j.poNumber), status: s(j.status), draft: j.draft === true || low(j.status) === 'draft',
    visibility: j.draft === true || low(j.status) === 'draft' ? 'draft' : (s(j.visibility) || 'public'), due: s(j.bidDueDate), dueTime: s(j.bidDueTime), trades: s(j.tradesSought),
    invited: inv[j.id] || 0, bids: (nb[j.id] || 0) + (nm[j.id] || 0), leadId: s(j.leadInbox && j.leadInbox.id), source: s(j.leadInbox && j.leadInbox.source), autoPrivate: !!j.autoPrivate, updatedAt: s(j.updatedAt)
  })).sort((a, b) => (a.draft - b.draft) || (s(a.due) || '9999').localeCompare(s(b.due) || '9999') || a.title.localeCompare(b.title));
}
const KEEP_DAYS = 30;
function restorable(j){ const t = Date.parse(s(j && j.archivedAt)); return !!t && Date.now() - t < KEEP_DAYS * 864e5; }

/* ── ONE list of a job's sub bids, from bids@, the bid portal and the sub portal ── */
async function subBids(jobId){
  const [rows, us, raw] = await Promise.all([SP.listRows([SP.eq('collection', 'bids'), SP.eq('job_id', jobId)]).catch(() => []), users(), crmSubsRaw()]);
  const byId = {}, byEmail = {}; us.forEach(u => { if (u.id) byId[u.id] = u; if (u.email) byEmail[low(u.email)] = u; });
  const crmByEmail = {}; raw.forEach(r => { if (r && r.email) crmByEmail[low(r.email)] = r; });
  const out = rows.map(r => r.data || {}).filter(b => b.id).map(b => {
    const u = byId[s(b.userId)] || byEmail[low(b.userEmail)] || {};
    const viaPortal = s(b.via) === 'portal' || !!(u.crmSubId || u.bidsRequested);
    return { source: viaPortal ? 'subportal' : 'portal', id: s(b.id), sub: s(b.userName || u.name), company: s(b.userCompany || u.company), email: low(b.userEmail || u.email),
      trade: s(b.trade) || tradeOf(u, crmByEmail, b.userEmail || u.email), amount: b.amount == null || b.amount === '' ? null : Number(b.amount),
      files: arr(b.docs).map(f => ({ name: s(f && (f.name || f.fileName)) || 'file' })), at: s(b.submittedAt || b.updatedAt), awarded: !!b.accepted, scope: s(b.scope).slice(0, 600) };
  });
  arr(await L.kvGet(T.KV_SUBBIDS).catch(() => [])).filter(x => x && x.jobId === jobId).forEach(x => {
    const sub = x.sub || {};
    out.push({ source: 'email', id: s(x.id), sub: s(sub.name), company: s(sub.company), email: low(sub.email), trade: s(x.trade) || tradeOf(byEmail[low(sub.email)], crmByEmail, sub.email),
      amount: x.amount != null ? Number(x.amount) : amountOf(s(x.subject) + '\n' + s(x.text)), files: arr(x.files).map(f => ({ name: s(f && f.name) || 'file' })), at: s(x.at), awarded: !!x.awarded, scope: s(x.text).slice(0, 600) });
  });
  return out.sort((a, b) => s(a.trade).localeCompare(s(b.trade)) || (a.amount == null) - (b.amount == null) || (a.amount || 0) - (b.amount || 0));
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
      flag: c.flag, grade: c.grade, score: c.score, lang: langOf(u, rawById[c.id]), onBidSite: !!(u && u.approved), invited: !!invited[c.email] });
  });
  us.filter(u => u.role === 'sub' && u.approved && SP.okEmail(low(u.email)) && !seen[low(u.email)]).forEach(u => {
    const e = low(u.email); seen[e] = 1; const c = u.crmSubId && rawById[s(u.crmSubId)];
    if (c && low(c.subFlag) === 'dnu') return;
    out.push({ email: e, name: s(u.name), company: s(u.company), trade: arr(u.trades)[0] || '', trades: arr(u.trades), flag: '', grade: '', score: null, lang: langOf(u, c), onBidSite: true, invited: !!invited[e] });
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

async function award(who, b){
  if (!who.canPublic) return { code: 403, error: 'Only an admin or an estimator marks a sub bid awarded.' };
  const on = b.on !== false, id = s(b.id), at = nowIso();
  if (s(b.source) === 'email') {
    let hit = null;
    await L.kvCas(T.KV_SUBBIDS, v => { const l = arr(v); const x = l.find(y => y && y.id === id); if (!x) return undefined; x.awarded = on; x.awardedAt = on ? at : ''; x.awardedBy = who.email; hit = x; return l; });
    return hit ? { ok: true, awarded: on } : { code: 404, error: 'No such sub bid.' };
  }
  const row = await SP.getRow('bids', id); if (!row || (s(b.jobId) && row.job_id !== s(b.jobId))) return { code: 404, error: 'No such sub bid.' };
  const bid = Object.assign({}, row.data, on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email } : { accepted: false, acceptedAt: '' });
  await SP.upsertRows([SP.rowFor('bids', bid)], who.email);
  return { ok: true, awarded: on };
}

/* the backfill: every estimator lead's DRAFT bid job → PRIVATE (a public job is never touched) */
async function sweep(who){
  if (!(who.admin || who.estimator)) return { ok: true, opened: 0 };
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
  const at = nowIso(), done = [], leads = [];
  for (const id of ids) {
    const job = await jobRow(id); if (!job || GONE.test(s(job.status))) continue;
    job.archivedFrom = { status: s(job.status), visibility: s(job.visibility), draft: job.draft === true };
    Object.assign(job, { status: 'archived', archivedAt: at, archivedBy: who.email });
    logTo(job, who, '🗑 Deleted from the bid portal' + (b.markLead ? ' (lead marked not bidding)' : ''));
    await saveJob(job, who); done.push(id);
    if (job.leadInbox && s(job.leadInbox.id)) leads.push(s(job.leadInbox.id));
  }
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
  return { ok: true, paused, job: { id: job.id, title: s(job.title), address: s(job.address), po: s(job.poNumber), due: s(job.bidDueDate), dueTime: s(job.bidDueTime),
      visibility: job.draft === true ? 'draft' : s(job.visibility) || 'public', deleted: GONE.test(s(job.status)), trades: s(job.tradesSought), scope: s(job.scope),
      tradeScopes: arr(job.tradeScopes), plansLinks: arr(job.plansLinks), addenda: arr(job.addenda), posts: arr(job.posts), log: arr(job.log).slice(-200), leadId: s(job.leadInbox && job.leadInbox.id) },
    plans: plans.map(p => ({ name: s(p.name), size: p.size || 0, type: s(p.type), fileRef: s(p.fileRef), category: s(p.category), version: s(p.version), date: s(p.date), current: !!p.current, at: s(p.at), by: s(p.by) })),
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
    await saveJob(job, who); return { ok: true };
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
  job.plans = list.map(x => ({ name: x.name, size: x.size, type: x.type, category: x.category, version: x.version || '', date: x.date || '', current: !!x.current }));   /* what the bid site lists */
  logTo(job, who, (b.remove ? '🗑 Plan removed: ' : b.current ? '⭐ Marked current: ' : '✏️ Plan changed: ') + s(it.name) + (it.version ? ' (' + it.version + ')' : ''));
  await saveJob(job, who);
  return { ok: true };
}

/* scopes per trade — from the estimate / Claude they are cleaned of every price here too; typed ones stay as typed */
async function scope(who, b){
  const job = await jobRow(b.jobId); if (!job) return { code: 404, error: 'No such bid job.' };
  const BP = L.portalApi();
  job.tradeScopes = arr(b.tradeScopes).filter(x => x && (s(x.trade) || s(x.scope))).slice(0, 30).map(x => {
    const mode = /^(estimate|claude|xactimate)$/.test(s(x.mode)) ? s(x.mode) : 'manual';
    return { id: s(x.id) || 'ts_' + crypto.randomBytes(4).toString('hex'), trade: s(x.trade).slice(0, 80), scope: (mode === 'manual' ? s(x.scope) : BP._noPrices(x.scope)).slice(0, 20000), mode, at: nowIso(), by: who.email };
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

/* a sub's question: answer privately, or publish the answer to every bidder (its e-mail waits on approval, as before) */
async function answer(who, b){
  if (!who.canInvite) return { code: 403, error: 'Only an admin, an estimator or the office answers bid questions.' };
  const q = await SP.getRow('questions', s(b.id)); if (!q) return { code: 404, error: 'No such question.' };
  const pub = b.publish === true;
  const r = await SP.saveCollection({ isAdmin: true, email: who.email, profile: { name: s(who.name) || who.email } }, 'questions',
    [{ id: q.data.id, answer: s(b.answer).slice(0, 8000), visibility: pub ? 'public' : 'private' }], [], {});
  const job = await jobRow(q.data.jobId);
  if (job) { logTo(job, who, '💬 Answered ' + s(q.data.userCompany) + '\'s question' + (pub ? ' — published to all bidders' : ' (private)')); await saveJob(job, who); }
  const now = await SP.getRow('questions', s(b.id));
  return { ok: true, saved: r.saved, question: now && now.data };
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
      if (q.jobs) return J(200, { ok: true, jobs: await jobsList(), me: { admin: who.admin, estimator: who.estimator, office: who.office, canInvite: who.canInvite, canPublic: who.canPublic } }, C);
      if (q.subbids || q.lead) {
        const jobId = s(q.subbids) || L.portalApi().jobIdFor({ id: s(q.lead) });
        return J(200, { ok: true, jobId, bids: await subBids(jobId) }, C);
      }
      if (q.manage) { if (!who.canInvite) return J(403, { error: 'Only an admin, an estimator or the office manages a bid job.' }, C); const r = await manageView(s(q.manage)); return r.code ? J(r.code, { error: r.error }, C) : J(200, r, C); }   /* patch SYS2 */
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
    else if (b.op === 'archive') r = await archive(who, b);   /* patch SYS2 */
    else if (b.op === 'restore') r = await restore(who, b);
    else if (/^(plans|scope|addendum|post|answer|notice)$/.test(s(b.op)) && !who.canInvite) r = { code: 403, error: 'Only an admin, an estimator or the office changes a bid job.' };
    else if (b.op === 'plans') r = await plans(who, b);
    else if (b.op === 'scope') r = await scope(who, b);
    else if (b.op === 'addendum') r = await addendum(who, b);
    else if (b.op === 'post') r = await post(who, b);
    else if (b.op === 'answer') r = await answer(who, b);
    else if (b.op === 'notice') r = await noticeAgain(who, b);
    else return J(400, { error: 'Unknown action.' }, C);
    return r.code ? J(r.code, { error: r.error }, C) : J(200, r, C);
  } catch (e) {
    return J(e.status || 502, { error: e.status ? e.message : 'The bid portal could not be reached: ' + s(e && e.message) }, C);
  }
};
exports._test = { amountOf, subBids, subsList, jobsList, invite, visibility, award, sweep, inviteMail, whoIs, archive, restore, manageView, audience, noticeMail };
/* patch LOGOALL (owner 10/23: "should have our logo on it"): every customer / sub / GC e-mail this file sends
   straight to Resend gets the GrayCo shell (centered logo, office line, licenses). Internal @grayco-cs.com mail is untouched. */
try { require('./_lib/brand.js').installResend(); } catch (e) {}
