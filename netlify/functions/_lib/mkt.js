/* ── GrayCo Marketing — the server side (patch MKT) ─────────────────────────────────────────────────
   Owner (21 Oct 2026): "Make sure our marketing tab is top notch … I want to do all marketing for GrayCo but I know
   nothing, I need help." He approved seasonal e-mails from news@, neighbor marketing, review requests, referral
   thank-yous, maintenance plans and the yearly home report.

   The records: gc_kv "gc_mkt_v1" = { collection: { id: record } } — the CRM's 📣 Marketing tab keeps it (newest
   record wins, record.at). This file changes records only by reading, changing and writing back with a fresh .at,
   then reading again to make sure a save from a browser at the same moment did not take the change out.

   NOTHING CUSTOMER-FACING GOES OUT WITHOUT AN ADMIN'S APPROVAL:
   * A campaign or a social post is put on THE approvals list (gc_approval_queue, patch APPR) by the portal
     function — kinds "mkt_campaign", "social_post", "mkt_neighbor" — with the e-mail / the picture as the preview.
     Step: admin (Wesley or Nick); after 24 hours the office may decide too (patch AP4, the owner's rule).
   * Approved, the record is "approved" with its time; the scheduled function (mkt-scheduled.js, every 15 min)
     sends / posts it when its time comes. News e-mail goes ONLY through _lib/news.js sendNews(): unsubscribed
     addresses are skipped, every e-mail has the one-click unsubscribe; if the unsubscribe list cannot be read,
     nothing is sent. Each address gets a campaign once (the send log gc_kv "gc_mkt_sendlog").
   * Social posts: the address / insurance-carrier guard runs when the post is queued, and again just before it
     is posted (_lib/social.js refuses too).
   * Review replies: the OFFICE (or an admin) approves them in the Marketing tab (owner decision C9).
   Autopilot (cfg.autopilot.on): every week 3 social posts (a finished job's before/after, a tip, a review or a
   community post) + 1 Google Business post; every month the seasonal news@ e-mail (+ the anniversary home
   report when anyone has an anniversary); after each finished job the neighbor door-hanger list; after each new
   5-star Google review a thank-you post and a reply draft. Every draft goes to Approvals. */
'use strict';
const crypto = require('crypto');
const C = require('./mkt-content.js');
const KEY = 'gc_mkt_v1', LOG_KEY = 'gc_mkt_sendlog', AQ_KEY = 'gc_approval_queue';
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const MKT_KINDS = { mkt_campaign: 'campaigns', social_post: 'posts', mkt_neighbor: 'neighbors' };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function H(extra){ const k = svcKey(); const jwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k); return Object.assign(jwt ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }, { 'Content-Type': 'application/json' }, extra || {}); }
function news(){ return require('./news.js'); }
function social(){ return require('./social.js'); }
let nowFn = function(){ return Date.now(); };
function nowIso(){ return new Date(nowFn()).toISOString(); }

/* ── gc_kv ── */
async function kvRow(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(key), { headers: H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(); let v = rows && rows[0] ? rows[0].value : null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return { v: v, at: s(rows && rows[0] && rows[0].updated_at) };
}
async function kvPut(key, value){
  const w = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) });
  if (!w.ok) throw new Error('gc_kv write ' + w.status);
}
/* the CRM's records (a big list may be stored in pieces: <key>__manifest + <key>__chunkN) */
async function crmData(keys){
  keys = keys || ['customers', 'projects', 'users', 'gc_photos'];
  const want = []; keys.forEach(function(k){ want.push(k, k + '__manifest'); });
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value,updated_at&key=in.(' + want.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: H() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(), by = {}; (Array.isArray(rows) ? rows : []).forEach(function(x){ by[x.key] = x; });
  const out = {};
  for (const k of keys) {
    let val = by[k] ? by[k].value : null, man = by[k + '__manifest'], mv = man && man.value;
    if (typeof mv === 'string') { try { mv = JSON.parse(mv); } catch (e) { mv = null; } }
    if (mv && mv.chunked && mv.count > 0 && (!by[k] || s(man.updated_at) >= s(by[k].updated_at))) {
      const names = []; for (let i = 0; i < Math.min(mv.count, 60); i++) names.push('"' + k + '__chunk' + i + '"');
      const rr = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,value&key=in.(' + names.join(',') + ')', { headers: H() });
      if (rr.ok) { const parts = await rr.json(), b = {}; (parts || []).forEach(function(x){ b[x.key] = x.value; }); let all = []; for (let i = 0; i < mv.count; i++) all = all.concat(arr(b[k + '__chunk' + i])); if (all.length) val = all; }
    }
    out[k] = typeof val === 'string' ? (function(){ try { return JSON.parse(val); } catch (e) { return val; } })() : val;
  }
  return out;
}

/* ── the marketing records ── */
function recs(doc, coll, withDel){ const m = (doc && doc[coll]) || {}; return Object.keys(m).map(function(k){ return m[k]; }).filter(function(r){ return r && (withDel || !r.del); }); }
function get(doc, coll, id){ const r = doc && doc[coll] && doc[coll][id]; return r && !r.del ? r : null; }
function cfg(doc){ return get(doc, 'cfg', 'main') || {}; }
function autoCfg(doc){
  const a = cfg(doc).autopilot || {};
  return { on: a.on === true, postsPerWeek: Math.max(1, Math.min(7, +a.postsPerWeek || 3)), networks: arr(a.networks).length ? arr(a.networks) : ['facebook', 'instagram', 'gbp'],
    times: arr(a.times).length ? arr(a.times) : C.DEFAULT_TIMES, monthlyEmail: a.monthlyEmail !== false, neighbor: a.neighbor !== false, reviewThanks: a.reviewThanks !== false, gbpWeekly: a.gbpWeekly !== false };
}
async function readDoc(){ const r = await kvRow(KEY); return r.v && typeof r.v === 'object' ? r.v : {}; }
/* change records: mutate(doc) returns [[coll, id], …] it changed (or null). Each changed record gets a new .at. */
async function update(mutate){
  for (let tries = 0; tries < 5; tries++) {
    const doc = await readDoc();
    const ch = mutate(doc);
    if (!ch || !ch.length) return { ok: true, doc: doc, changed: [] };
    let at = nowIso();
    ch.forEach(function(c){ const r = doc[c[0]] && doc[c[0]][c[1]]; if (r) { if (s(r.at) >= at) at = new Date(Date.parse(r.at) + 1).toISOString(); } });
    const stamp = {}; ch.forEach(function(c){ const r = doc[c[0]] && doc[c[0]][c[1]]; if (r) { r.at = at; r.by = r.by || 'GrayCo server'; stamp[c[0] + '|' + c[1]] = at; } });
    await kvPut(KEY, doc);
    await sleep(60 + 120 * tries);
    const after = await readDoc();
    const lost = ch.some(function(c){ const r = after[c[0]] && after[c[0]][c[1]]; return !r || s(r.at) < stamp[c[0] + '|' + c[1]]; });
    if (!lost) return { ok: true, doc: after, changed: ch };
  }
  return { ok: false, error: 'busy' };
}
function put(doc, coll, rec){ (doc[coll] = doc[coll] || {})[rec.id] = rec; return [coll, rec.id]; }
function rid(p){ return p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

/* ── pictures: a signed link to a CRM file (the bucket is private) ── */
async function signRef(ref, secs){
  const m = /^sb:crm-files\/(.+)$/.exec(s(ref)); if (!m) return /^https:\/\//.test(s(ref)) ? s(ref) : '';
  try {
    const r = await fetch(sbUrl() + '/storage/v1/object/sign/crm-files/' + m[1].split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: secs || 3600 }) });
    if (!r.ok) return '';
    const j = await r.json(); const u = s(j.signedURL || j.signedUrl);
    return u ? (/^https:/.test(u) ? u : sbUrl() + '/storage/v1' + (u[0] === '/' ? '' : '/') + u) : '';
  } catch (e) { return ''; }
}

/* ── who may do what ── */
function roleOf(who, data){
  if (low(who && who.role) === 'admin') return 'admin';
  if (/office/.test(low(who && who.role)) || low(who && who.email) === 'office@grayco-cs.com') return 'office';
  const u = arr(data && data.users).find(function(x){ return low(x.email) === low(who && who.email); });
  if (u && /admin|owner/i.test(s(u.role))) return 'admin';
  if (u && /office/i.test(s(u.role))) return 'office';
  return 'staff';
}

/* ── the audience, with the unsubscribed taken out (throws when the list cannot be read) ── */
async function audienceFor(rec, data){
  const list = C.audience(data, rec.aud || { type: 'all' }, nowIso());
  const off = await news().suppressed(list.map(function(c){ return c.email; }));
  return { send: list.filter(function(c){ return !off.has(c.email); }), skipped: list.filter(function(c){ return off.has(c.email); }).map(function(c){ return c.email; }) };
}
function campaignVars(rec, c){
  const v = C.varsFor(c, rec.vars || {});
  if (rec.vars && rec.vars.city && !v.city) v.city = rec.vars.city;
  v.review_link = s(rec.reviewLink) || C.BRAND.reviewLink;
  return v;
}
function campaignBodyFor(rec, c){
  const v = campaignVars(rec, c);
  if (rec.approvedHtml) return { subject: C.fill(rec.subject, v), html: C.emailShell({ bodyHtml: C.fill(rec.approvedHtml, v) }) };
  return { subject: C.fill(rec.subject, v), html: C.campaignHtml(rec, v) };
}

/* ── 1. onto the approvals list (called by portal.js op "queue") ── */
async function queueForApproval(body, who, core){
  const kind = s(body.kind), coll = MKT_KINDS[kind], id = s(body.recId);
  if (!coll || !id) return { status: 400, out: { ok: false, error: 'Bad request' } };
  let data = {}; try { data = await crmData(['customers', 'projects', 'users']); } catch (e) {}
  const role = roleOf(who, data);
  if (role === 'staff' && !body.system) return { status: 403, out: { ok: false, error: 'Only the office or an admin can send marketing for approval.' } };
  const doc = await readDoc(); const rec0 = get(doc, coll, id), rec = rec0 ? Object.assign({}, rec0, { reviewLink: s(cfg(doc).reviewLink) }) : null;
  if (!rec) return { status: 404, out: { ok: false, retry: true, error: 'That draft is not in the cloud yet — try again in a few seconds.' } };
  if (/^(waiting|approved|sending|sent|posting|posted)$/.test(s(rec.status)) && !body.again) return { status: 200, out: { ok: true, already: rec.status, id: rec.apprId } };
  const n = (+rec.submits || 0) + 1, qid = 'appr_mkt_' + id + '_' + n;
  let title, to, subject, html, meta = { recId: id, coll: coll, by: low(who && who.email) };
  if (kind === 'social_post') {
    const pr = C.guard(rec.caption, rec.jobAddresses || []);
    if (pr.length) return { status: 400, out: { ok: false, error: pr.map(function(p){ return p.l; }).join(' ') } };
    const img = rec.photoRef ? await signRef(rec.photoRef, 7 * 86400) : '';
    const nets = arr(rec.networks).map(function(v){ const n0 = C.NETWORKS.find(function(x){ return x.v === v; }); return n0 ? n0.l : v; }).join(' · ');
    title = '📣 Marketing — social post (' + (nets || 'no network') + ')' + (rec.scheduleAt ? ' · ' + C.ctLabel(rec.scheduleAt) : '');
    to = nets; subject = s(rec.title) || 'Social post';
    html = (img ? '<img src="' + C.esc(img) + '" alt="post picture" style="max-width:100%;border-radius:8px;display:block;margin:0 0 10px">' : '') + '<div>' + C.esc(rec.caption).replace(/\n/g, '<br>') + '</div>';
    meta.image = img;
  } else if (kind === 'mkt_campaign') {
    let aud; try { aud = await audienceFor(rec, data); } catch (e) { return { status: 503, out: { ok: false, error: 'The GrayCo News unsubscribe list cannot be read (run docs/news-unsubscribe.sql) — nothing can be queued blind.' } }; }
    title = '📣 Marketing — e-mail “' + s(rec.title || rec.subject) + '”' + (rec.scheduleAt ? ' · ' + C.ctLabel(rec.scheduleAt) : ' · when approved');
    to = aud.send.length + ' customers (' + C.audLabel(rec.aud) + ')' + (aud.skipped.length ? ' — ' + aud.skipped.length + ' unsubscribed skipped' : '');
    const sample = aud.send[0] || { first: 'Pat', zip: '', kinds: [] };
    const b = campaignBodyFor(rec, sample); subject = b.subject; html = b.html;
    meta.count = aud.send.length; meta.skipped = aud.skipped.length;
  } else {
    title = '📣 Marketing — door hangers / postcards near ' + (s(rec.street) || 'a finished job'); to = (+rec.count || 0) + ' homes';
    subject = 'Neighbor marketing: ' + s(rec.street); html = '<p>Print and deliver ' + C.esc(rec.count || '') + ' door hangers on ' + C.esc(rec.street) + ' (' + C.esc(rec.city) + '). The list and the printable door hanger are in Marketing → Neighborhood.</p>';
  }
  const ok = await core.queueApproval({ id: qid, kind: kind, title: title, pid: s(rec.jobId), jobName: s(rec.jobName), pm: null, to: to, subject: subject, html: html, attachments: [], meta: meta });
  if (!ok) return { status: 502, out: { ok: false, error: 'Could not put it on the approvals list — try again.' } };
  await update(function(d){ const r = get(d, coll, id); if (!r) return null; r.status = 'waiting'; r.apprId = qid; r.submits = n; r.submittedBy = low(who && who.email); r.submittedAt = nowIso(); r.reason = ''; return [[coll, id]]; });
  return { status: 200, out: { ok: true, id: qid, queued: true } };
}

/* ── 2. approved / rejected on the approvals list (portal.js calls these) ── */
async function onApproved(item){
  const m = item.meta || {}, coll = m.coll || MKT_KINDS[item.kind], id = s(m.recId);
  const last = (item.approvals || []).slice(-1)[0] || {};
  const r = await update(function(d){
    const rec = get(d, coll, id); if (!rec) return null;
    rec.status = 'approved'; rec.approvedBy = s(last.by) || 'admin'; rec.approvedEmail = s(last.email); rec.approvedAt = nowIso(); rec.apprId = s(item.id);
    if (coll === 'posts' && item.editedAt && s(item.text)) rec.caption = s(item.text);
    if (coll === 'campaigns' && item.editedAt) { rec.subject = s(item.subject) || rec.subject; rec.approvedHtml = String(item.html || ''); }
    if (coll === 'posts' && !rec.scheduleAt) rec.scheduleAt = nowIso();
    return [[coll, id]];
  });
  if (!r.ok) return { ok: false, error: 'Approved, but the marketing record could not be updated — try again.' };
  if (coll === 'neighbors') {
    try { const core = require('../portal.js')._core; await core.officeTodo('mkt_nb_' + id, 'Print & deliver door hangers on ' + s(get(r.doc, 'neighbors', id) && get(r.doc, 'neighbors', id).street), 'Marketing → Neighborhood has the list, the CSV and the printable door hanger.'); } catch (e) {}
  }
  return { ok: true, scheduled: true };
}
async function onRejected(item, me){
  const m = item.meta || {}, coll = m.coll || MKT_KINDS[item.kind], id = s(m.recId);
  if (!coll || !id) return;
  await update(function(d){ const rec = get(d, coll, id); if (!rec || rec.apprId !== s(item.id)) return null; rec.status = 'rejected'; rec.reason = s(item.reason); rec.rejectedBy = s(me && me.by); return [[coll, id]]; });
}
/* the approvals list said so, but the record did not hear it (a reject, or an approve whose update failed) */
async function reconcile(doc){
  let q = []; try { const r = await kvRow(AQ_KEY); q = arr(r.v); } catch (e) { return 0; }
  const by = {}; q.forEach(function(x){ if (x && x.id) by[x.id] = x; });
  const fix = [];
  Object.keys(MKT_KINDS).forEach(function(k){ recs(doc, MKT_KINDS[k]).forEach(function(rec){ const it = rec.apprId && by[rec.apprId]; if (!it || rec.status !== 'waiting') return; if (it.status === 'rejected' || it.status === 'sent') fix.push(it); }); });
  for (const it of fix) { if (it.status === 'rejected') await onRejected(it, { by: it.rejectedBy }); else await onApproved(it); }
  return fix.length;
}

/* ── 3. sending: approved campaigns whose time came, approved posts whose time came ── */
async function sendCampaign(rec, deadline){
  const claim = 'k' + crypto.randomBytes(5).toString('hex');
  const c1 = await update(function(d){ const r = get(d, 'campaigns', rec.id); if (!r || !(r.status === 'approved' || (r.status === 'sending' && nowFn() - Date.parse(r.claimAt || 0) > 10 * 60e3))) return null; r.status = 'sending'; r.claim = claim; r.claimAt = nowIso(); r.startedAt = r.startedAt || nowIso(); return [['campaigns', r.id]]; });
  const mine = get(c1.doc, 'campaigns', rec.id);
  if (!mine || mine.claim !== claim) return { skipped: 'busy' };
  let data, aud;
  try { data = await crmData(['customers', 'projects']); aud = await audienceFor(mine, data); }
  catch (e) { await update(function(d){ const r = get(d, 'campaigns', rec.id); if (!r || r.claim !== claim) return null; r.status = 'approved'; r.lastError = 'The unsubscribe list could not be read — nothing was sent.'; return [['campaigns', r.id]]; }); return { error: 'suppression' }; }
  mine.reviewLink = s(cfg(c1.doc).reviewLink);
  const logRow = await kvRow(LOG_KEY).catch(function(){ return { v: {} }; });
  const log = logRow.v && typeof logRow.v === 'object' ? logRow.v : {};
  const L = log[rec.id] = log[rec.id] || {};
  aud.skipped.forEach(function(e){ if (!L[e]) L[e] = { st: 'unsubscribed', at: nowIso() }; });
  let n = 0, more = false;
  for (const c of aud.send) {
    if (L[c.email] && L[c.email].st !== 'failed') continue;
    if (nowFn() > deadline) { more = true; break; }
    const b = campaignBodyFor(mine, c);
    const res = await news().sendNews({ to: c.email, subject: b.subject, html: b.html });
    L[c.email] = { st: res.skipped ? 'unsubscribed' : (res.ok ? 'sent' : 'failed'), at: nowIso(), err: res.ok ? '' : s(res.error || res.status) };
    n++;
    if (n % 10 === 0) { try { await kvPut(LOG_KEY, log); } catch (e) {} }
    await sleep(+process.env.MKT_SEND_GAP_MS || 250);
  }
  try { await kvPut(LOG_KEY, log); } catch (e) {}
  const vals = Object.keys(L).map(function(k){ return L[k]; });
  const stats = { total: aud.send.length + aud.skipped.length, sent: vals.filter(function(x){ return x.st === 'sent'; }).length, skipped: vals.filter(function(x){ return x.st === 'unsubscribed'; }).length, failed: vals.filter(function(x){ return x.st === 'failed'; }).length };
  await update(function(d){ const r = get(d, 'campaigns', rec.id); if (!r || r.claim !== claim) return null; r.stats = stats; if (more) { r.status = 'approved'; r.claim = ''; } else { r.status = 'sent'; r.sentAt = nowIso(); } return [['campaigns', r.id]]; });
  return { sent: n, more: more, stats: stats };
}
async function publishPost(rec){
  const st = social().status();
  const want = arr(rec.networks);
  if (!st.any || !want.some(function(n){ return st[n]; })) {
    if (!rec.needsManual) await update(function(d){ const r = get(d, 'posts', rec.id); if (!r || r.status !== 'approved') return null; r.needsManual = true; r.lastError = 'Not connected yet — use “Copy + open” in Marketing → Social, or connect the networks (docs/SOCIAL-SETUP.md).'; return [['posts', r.id]]; });
    return { manual: true };
  }
  const claim = 'p' + crypto.randomBytes(5).toString('hex');
  const c1 = await update(function(d){ const r = get(d, 'posts', rec.id); if (!r || !(r.status === 'approved' || (r.status === 'posting' && nowFn() - Date.parse(r.claimAt || 0) > 10 * 60e3))) return null; r.status = 'posting'; r.claim = claim; r.claimAt = nowIso(); return [['posts', r.id]]; });
  const mine = get(c1.doc, 'posts', rec.id);
  if (!mine || mine.claim !== claim) return { skipped: 'busy' };
  const img = mine.photoRef ? await signRef(mine.photoRef, 3600) : '';
  const nets = want.filter(function(n){ return st[n] && !(mine.results && mine.results[n] && mine.results[n].ok); });
  const res = await social().publish({ caption: mine.caption, imageUrl: img, networks: nets, link: mine.link || '', extra: mine.jobAddresses || [] });
  await update(function(d){
    const r = get(d, 'posts', rec.id); if (!r || r.claim !== claim) return null;
    r.results = Object.assign({}, r.results || {}); Object.keys(res).forEach(function(k){ if (k !== '_error') r.results[k] = Object.assign({ at: nowIso() }, res[k]); });
    const oks = Object.keys(r.results).filter(function(k){ return r.results[k] && r.results[k].ok; });
    if (res._error) { r.status = 'failed'; r.lastError = res._error; }
    else if (oks.length) { r.status = 'posted'; r.postedAt = r.postedAt || nowIso(); r.lastError = Object.keys(r.results).filter(function(k){ return !r.results[k].ok; }).map(function(k){ return r.results[k].error; }).join(' ').slice(0, 400); }
    else { r.status = 'failed'; r.lastError = Object.keys(r.results).map(function(k){ return r.results[k].error; }).join(' ').slice(0, 400); }
    return [['posts', r.id]];
  });
  return res;
}
async function runDue(o){
  o = o || {}; const deadline = nowFn() + (o.budgetMs || 18000), out = { campaigns: [], posts: [], reconciled: 0 };
  let doc = await readDoc();
  out.reconciled = await reconcile(doc);
  if (out.reconciled) doc = await readDoc();
  const now = nowFn();
  for (const p of recs(doc, 'posts')) {
    if (nowFn() > deadline) break;
    if ((p.status === 'approved' || p.status === 'posting') && (!p.scheduleAt || Date.parse(p.scheduleAt) <= now) && !(p.needsManual && !social().status().any)) out.posts.push({ id: p.id, r: await publishPost(p) });
  }
  for (const c of recs(doc, 'campaigns')) {
    if (nowFn() > deadline) break;
    if ((c.status === 'approved' || c.status === 'sending') && (!c.scheduleAt || Date.parse(c.scheduleAt) <= now)) out.campaigns.push({ id: c.id, r: await sendCampaign(c, deadline) });
  }
  return out;
}

/* ── 4. Autopilot: the drafts (each one goes to Approvals) ── */
function sharedPhotos(data, pid){
  return arr(data.gc_photos).filter(function(r){ return r && r.deleted !== true && r.source !== 'ccflag' && s(r.jobId) === s(pid) && s(r.ref) && (r.shared === true || (r.shared == null && s(r.tag) !== 'Damage')); })
    .sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; });
}
function reviewReplyDraft(r){
  const first = s(r.author).split(/\s+/)[0] || 'there';
  if ((+r.rating || 0) >= 4) return 'Thank you, ' + first + '! It was a pleasure working with you. We’re glad you’re happy with the work — and we’re always here if you need anything. — The GrayCo team';
  return 'Thank you for the feedback, ' + first + '. We’re sorry we fell short. Please call our office at ' + C.BRAND.phone + ' so we can make it right. — Wesley, GrayCo Construction Services';
}
async function autopilot(o){
  o = o || {};
  const core = require('../portal.js')._core;
  let doc = await readDoc();
  const A = autoCfg(doc);
  if (!A.on && !o.force) return { off: true };
  const nowMs = nowFn(), wk = C.weekKey(nowMs), mo = C.monthKey(nowMs), month = +mo.slice(5, 7);
  const state = get(doc, 'auto', 'state') || { id: 'state', weeks: {}, months: {}, jobs: {}, reviews: {} };
  const made = { posts: [], campaigns: [], neighbors: [], reviews: [] };
  let data = {}; try { data = await crmData(['customers', 'projects', 'users', 'gc_photos']); } catch (e) {}
  const projects = arr(data.projects).filter(function(p){ return p && p.deleted !== true; });
  const newRecs = [];
  const weekly = !state.weeks[wk] || o.forceWeek;
  if (weekly) {
    const slots = C.nextSlots(nowMs, A.postsPerWeek + 1, A.times);
    const usedJobs = recs(doc, 'posts').map(function(p){ return s(p.jobId); }).filter(Boolean);
    const usedTips = recs(doc, 'posts').map(function(p){ return s(p.tipId); }).filter(Boolean);
    const cutoff = new Date(nowMs - 120 * 864e5).toISOString().slice(0, 10);
    const jobs = projects.filter(function(p){ return C.isDone(p) && (C.doneDate(p) || '9999') >= cutoff && usedJobs.indexOf(s(p.id)) < 0; })
      .map(function(p){ const ph = sharedPhotos(data, p.id); return { p: p, after: ph.find(function(x){ return x.tag === 'After'; }) || null, before: ph.find(function(x){ return x.tag === 'Before'; }) || null }; })
      .filter(function(x){ return x.after; });
    const plan = [];
    if (jobs[0]) plan.push({ kind: 'job', jobId: s(jobs[0].p.id), jobName: s(jobs[0].p.name), caption: C.jobCaption(jobs[0].p), photoRef: jobs[0].after.ref, beforeRef: jobs[0].before ? jobs[0].before.ref : '', jobAddresses: [s(jobs[0].p.address)] });
    const tip = C.tipFor(month, usedTips); plan.push({ kind: 'tip', tipId: tip.id, caption: tip.t + '\n\n' + C.BRAND.hashtags });
    const rv = recs(doc, 'reviews').filter(function(r){ return (+r.rating || 0) >= 5 && !r.thanksPostId && s(r.text); })[0];
    const evs = recs(doc, 'events').filter(function(e){ const d = s(e.date); if (!d) return false; const ms = Date.parse(d + 'T12:00:00Z'); return ms > nowMs - 7 * 864e5 && ms < nowMs + 14 * 864e5 && !e.postedBefore; });
    if (rv) plan.push({ kind: 'review', reviewId: rv.id, caption: C.reviewCaption(rv) });
    else if (evs[0]) plan.push({ kind: 'event', eventId: evs[0].id, caption: C.eventCaption(evs[0], Date.parse(evs[0].date + 'T23:00:00Z') < nowMs), photoRef: s((arr(evs[0].photos)[0] || {}).ref) });
    while (plan.length < A.postsPerWeek) { const t2 = C.tipFor(month, usedTips.concat(plan.map(function(x){ return x.tipId; }).filter(Boolean))); plan.push({ kind: 'tip', tipId: t2.id, caption: t2.t + '\n\n' + C.BRAND.hashtags }); }
    plan.slice(0, A.postsPerWeek).forEach(function(x, i){
      const nets = A.networks.filter(function(n){ return n !== 'gbp' && (n !== 'instagram' || x.photoRef); });
      if (!nets.length) return;
      newRecs.push(['posts', Object.assign({ id: rid('post'), title: ({ job: 'Before / after', tip: 'Tip', review: 'Review thank-you', event: 'Community' })[x.kind], networks: nets, scheduleAt: slots[i] || slots[0], status: 'draft', autopilot: true, createdAt: nowIso() }, x)]);
    });
    if (A.gbpWeekly && A.networks.indexOf('gbp') >= 0) {
      const g = plan[0];
      newRecs.push(['posts', { id: rid('post'), title: 'Google Business weekly', kind: 'gbp', networks: ['gbp'], caption: C.gbpFromCaption(g.kind === 'job' ? C.jobCaption(projects.find(function(p){ return s(p.id) === g.jobId; }) || {}, 'gbp') : g.caption),
        photoRef: g.photoRef || '', jobId: g.jobId || '', jobAddresses: g.jobAddresses || [], scheduleAt: slots[0], status: 'draft', autopilot: true, createdAt: nowIso() }]);
    }
    if (rv) state.reviews[rv.id] = state.reviews[rv.id] || 'thanks';
    state.weeks[wk] = nowIso();
  }
  if (A.monthlyEmail && (!state.months[mo] || o.forceMonth)) {
    const t = C.seasonalFor(month)[0];
    const sendAt = C.nextSlots(nowMs, 1, [{ d: 2, h: 10, m: 0 }])[0];
    if (t) newRecs.push(['campaigns', { id: rid('camp'), tpl: t.id, title: t.name + ' — ' + mo, ctitle: t.title, subject: t.subject, preheader: t.preheader, body: t.body, cta: t.cta, aud: t.audience, scheduleAt: sendAt, status: 'draft', autopilot: true, createdAt: nowIso() }]);
    const ann = C.audience(data, { type: 'anniversary' }, nowIso());
    if (ann.length) { const h = C.tplById('home_report'); newRecs.push(['campaigns', { id: rid('camp'), tpl: 'home_report', title: 'Home report — ' + mo, ctitle: h.title, subject: h.subject, preheader: h.preheader, body: h.body, cta: h.cta, aud: { type: 'anniversary' }, scheduleAt: sendAt, status: 'draft', autopilot: true, createdAt: nowIso() }]); }
    state.months[mo] = nowIso();
  }
  if (A.neighbor) {
    const since = new Date(nowMs - 21 * 864e5).toISOString().slice(0, 10);
    projects.filter(function(p){ return C.isDone(p) && (C.doneDate(p) || '') >= since && !state.jobs[s(p.id)] && /\d/.test(s(p.address)); }).slice(0, 5).forEach(function(p){
      const street = C.streetOnly(p.address), zip = C.zipOf(p.address);
      newRecs.push(['neighbors', { id: rid('nb'), jobId: s(p.id), jobName: s(p.name), street: street, city: C.areaOf(p), zip: zip, count: 40, kind: C.kindOf(p), status: 'draft', autopilot: true, createdAt: nowIso() }]);
      state.jobs[s(p.id)] = nowIso();
    });
  }
  /* new Google reviews (when the Business Profile is connected) → a reply draft (office approves) and, for 5 stars, a thank-you post */
  if (social().status().gbpReviews) {
    try {
      const have = {}; recs(doc, 'reviews', true).forEach(function(r){ if (r.gid) have[r.gid] = 1; });
      (await social().gbpReviews()).forEach(function(g){
        if (have[g.gid]) return;
        const r = { id: rid('rev'), gid: g.gid, source: 'google', author: g.author, rating: g.rating, text: g.text, date: g.date, reply: g.reply || '', replyStatus: g.replied ? 'posted' : 'draft', createdAt: nowIso() };
        if (!g.replied) r.replyDraft = reviewReplyDraft(r);
        newRecs.push(['reviews', r]); made.reviews.push(r.id);
        if (A.reviewThanks && g.rating >= 5 && g.text) { const pid = rid('post'); r.thanksPostId = pid; newRecs.push(['posts', { id: pid, title: 'Review thank-you', kind: 'review', reviewId: r.id, caption: C.reviewCaption(r), networks: A.networks.filter(function(n){ return n !== 'instagram' && n !== 'gbp'; }).concat([]), scheduleAt: C.nextSlots(nowMs, 1, A.times)[0], status: 'draft', autopilot: true, createdAt: nowIso() }]); }
      });
    } catch (e) { made.reviewError = s(e.message); }
  }
  const w = await update(function(d){
    const ch = newRecs.map(function(x){ return put(d, x[0], x[1]); });
    state.at = ''; ch.push(put(d, 'auto', Object.assign({}, state)));
    return ch;
  });
  if (!w.ok) return { ok: false, error: 'busy' };
  /* every draft onto the approvals list */
  const who = { email: 'autopilot@grayco-cs.com', role: 'admin' };
  for (const x of newRecs) {
    const kind = x[0] === 'posts' ? 'social_post' : x[0] === 'campaigns' ? 'mkt_campaign' : x[0] === 'neighbors' ? 'mkt_neighbor' : '';
    if (!kind) continue;
    made[x[0]].push(x[1].id);
    try { await queueForApproval({ kind: kind, recId: x[1].id, system: true }, who, core); } catch (e) {}
  }
  return { ok: true, made: made };
}

/* ── 5. review replies (office or admin approves) and insights ── */
async function approveReply(id, text, who){
  let data = {}; try { data = await crmData(['users']); } catch (e) {}
  const role = roleOf(who, data);
  if (role !== 'admin' && role !== 'office') return { status: 403, out: { ok: false, error: 'The office or an admin approves review replies.' } };
  const doc = await readDoc(); const r = get(doc, 'reviews', id);
  if (!r) return { status: 404, out: { ok: false, error: 'That review is not in the cloud yet.' } };
  const reply = s(text) || s(r.replyDraft);
  const pr = C.guard(reply, []); if (pr.length) return { status: 400, out: { ok: false, error: pr.map(function(p){ return p.l; }).join(' ') } };
  let posted = false, err = '';
  if (r.gid && social().status().gbpReviews) { const g = await social().gbpReply(r.gid, reply); posted = g.ok; err = g.error || ''; }
  const u = await update(function(d){ const x = get(d, 'reviews', id); if (!x) return null; x.reply = reply; x.replyStatus = posted ? 'posted' : 'approved'; x.replyBy = s(who.name) || low(who.email); x.replyAt = nowIso(); x.replyError = err; return [['reviews', id]]; });
  return { status: 200, out: { ok: u.ok, posted: posted, error: err, manual: !posted } };
}
async function refreshInsights(){
  const doc = await readDoc(), since = nowFn() - 45 * 864e5, out = [];
  for (const p of recs(doc, 'posts').filter(function(p){ return p.status === 'posted' && Date.parse(p.postedAt || 0) > since; }).slice(0, 25)) {
    const ins = await social().insights(p.results || {});
    if (Object.keys(ins).length) out.push([p.id, ins]);
  }
  if (out.length) await update(function(d){ return out.map(function(x){ const r = get(d, 'posts', x[0]); if (!r) return null; r.insights = Object.assign({}, x[1], { at: nowIso() }); return ['posts', x[0]]; }).filter(Boolean); });
  return out.length;
}

module.exports = { KEY: KEY, LOG_KEY: LOG_KEY, MKT_KINDS: MKT_KINDS, isMktKind: function(k){ return !!MKT_KINDS[s(k)]; },
  queueForApproval: queueForApproval, onApproved: onApproved, onRejected: onRejected, reconcile: reconcile, runDue: runDue, autopilot: autopilot,
  approveReply: approveReply, refreshInsights: refreshInsights, audienceFor: audienceFor, readDoc: readDoc, update: update, crmData: crmData, roleOf: roleOf, signRef: signRef,
  reviewReplyDraft: reviewReplyDraft, _setNow: function(f){ nowFn = f || function(){ return Date.now(); }; } };
