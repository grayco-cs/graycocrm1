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
  return jobs.map(r => r.data || {}).filter(j => j.id && !GONE.test(s(j.status))).map(j => ({
    id: s(j.id), title: s(j.title), address: s(j.address), po: s(j.poNumber), status: s(j.status), draft: j.draft === true || low(j.status) === 'draft',
    visibility: j.draft === true || low(j.status) === 'draft' ? 'draft' : (s(j.visibility) || 'public'), due: s(j.bidDueDate), dueTime: s(j.bidDueTime), trades: s(j.tradesSought),
    invited: inv[j.id] || 0, bids: (nb[j.id] || 0) + (nm[j.id] || 0), leadId: s(j.leadInbox && j.leadInbox.id), source: s(j.leadInbox && j.leadInbox.source), autoPrivate: !!j.autoPrivate, updatedAt: s(j.updatedAt)
  })).sort((a, b) => (a.draft - b.draft) || (s(a.due) || '9999').localeCompare(s(b.due) || '9999') || a.title.localeCompare(b.title));
}

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
    else return J(400, { error: 'Unknown action.' }, C);
    return r.code ? J(r.code, { error: r.error }, C) : J(200, r, C);
  } catch (e) {
    return J(e.status || 502, { error: e.status ? e.message : 'The bid portal could not be reached: ' + s(e && e.message) }, C);
  }
};
exports._test = { amountOf, subBids, subsList, jobsList, invite, visibility, award, sweep, inviteMail, whoIs };
