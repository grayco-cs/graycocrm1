/* ── GrayCo staff check (security build) ──────────────────────────────────────
   A call from the CRM must carry the signed-in person's Supabase token:
       Authorization: Bearer <access token>
   The token is checked with Supabase (/auth/v1/user) and the email must be on
   the staff list: table gc_staff (read with the service key) once it exists —
   it is then the ONLY list, so removing someone there blocks them here at
   once — and the STAFF_EMAILS variable only before that table exists.
   No token / bad token → 401.  Signed in but not staff → 403.
   (Kept inline in every function on purpose: each function is bundled alone.) */
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
function gcHeader(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* CORS: only the CRM's own site may call from a browser (SITE_ORIGIN, comma list). */
function gcCors(event, methods, extraHeaders){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',')
    .map(function(s){ return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = gcHeader(event, 'origin').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization' + (extraHeaders ? ', ' + extraHeaders : ''),
    'Access-Control-Allow-Methods': methods || 'POST, OPTIONS'
  };
}
async function gcStaffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(gcHeader(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first (no sign-in token was sent).' };
  const token = m[1];
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  let user = null;
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
    if (r.ok) user = await r.json();
  } catch (e) {
    return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' };
  }
  const email = String((user && user.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let role = null, listed = false, name = '';
  if (svc) {
    try {
      const r = await fetch(url + '/rest/v1/gc_staff?select=email,name,role,active&email=eq.' + encodeURIComponent(email),
        { headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
      if (r.ok) {
        listed = true;
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.active !== false) { role = String(row.role || 'staff').toLowerCase(); name = row.name || ''; }
      }
    } catch (e) {}
  }
  if (!listed) {
    const env = (process.env.STAFF_EMAILS || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
    if (env.indexOf(email) > -1) role = 'staff';
  }
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  return { ok: true, email: email, role: role, name: name, userId: user.id || '' };
}
/* ── end GrayCo staff check ────────────────────────────────────────────────── */

// netlify/functions/soc.js — GrayCo 📣 Marketing, part 3 (patch SOC): TikTok + LinkedIn, the 3-a-week plan, the media
// library's server data, listings, the approval stage. Server: _lib/soc.js + _lib/soc-content.js.
//   GET  ?callback=1&code&state                 → the TikTok / LinkedIn sign-in comes back here (signed state, 15 minutes)
//   GET  ?media=<signed token>                  → one marketing picture for TikTok to pull (signed, one day)
//   POST { op:'status' }                        → connected yes / no per platform (never a token), the stage, the hint
//   POST { op:'connect'|'disconnect', platform } admin → TikTok / LinkedIn sign-in link / forget the tokens
//   POST { op:'plan_week', week, replace }      office / admin → plan the Mon / Wed / Fri posts now (goes to Approvals)
//   POST { op:'swap', id, type, service }       office / admin → another post for that day
//   POST { op:'rewrite', id }                   office / admin → the per-platform versions written again
//   POST { op:'set_stage', stage, note }        admin → the approval stage (logged)
//   POST { op:'library' }                       staff → the AI photo tags + the approved testimonials (with the customer's OK)
//   POST { op:'listings_sync' }                 office / admin → BrightLocal (dormant without its keys)
//   POST { op:'mm_settings', set? }             admin sets / staff read: "Marketing Manager sees sold values", "… approves at stage 2"
//   patch MM — the Marketing Manager profile (_lib/mm.js; he is never on the staff rules): status, library, plan_week, swap, rewrite,
//   listings_sync, mm_boot, mm_kv_read / mm_kv_write (the marketing document, redacted), mm_jobs, mm_file, my_leads, mm_tasks, mm_task,
//   mm_approvals, mm_approve, mm_queue, mm_review_reply, mm_website. Every answer to him is redacted (no customer e-mail / phone / address).
// Signed-in GrayCo staff only (the two GETs are signed links). Nothing goes public from here: posts wait on ✅ Approvals.
'use strict';
const S = require('./_lib/soc.js');
const SC = require('./_lib/soc-content.js');
const M = require('./_lib/mkt.js');
const MM = require('./_lib/mm.js');   /* patch MM */
function reply(code, headers, o){ return { statusCode: code, headers: headers, body: JSON.stringify(o) }; }
function page(title, msg, ok){
  return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>' +
      '<body style="font-family:Arial,sans-serif;background:#F5F7FB;margin:0;padding:40px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #dce3ee;border-radius:12px;padding:22px">' +
      '<h2 style="color:' + (ok ? '#166534' : '#9a3412') + ';margin-top:0">' + (ok ? '✓ ' : '') + title + '</h2><p>' + String(msg).replace(/[<>&]/g, '') + '</p>' +
      '<p><a href="/" style="color:#1E2060;font-weight:bold">Back to the GrayCo CRM → Marketing → 🔌 Connections</a></p></div></body></html>' };
}
async function mediaReply(tok){
  const o = S.readMediaToken(tok); if (!o) return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'expired' };
  const url = await M.signRef(o.r, 600); if (!url) return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'not found' };
  const r = await fetch(url); if (!r.ok) return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'not found' };
  const ct = String(r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!/^(image|video)\//.test(ct)) return { statusCode: 415, headers: { 'Content-Type': 'text/plain' }, body: 'not media' };
  const b = Buffer.from(await r.arrayBuffer());
  return { statusCode: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=600' }, body: b.toString('base64'), isBase64Encoded: true };
}
/* ── patch MM: the Marketing Manager's calls (who.marketing). Every answer is redacted except the two that already are. ── */
const MKT_APPR = { mkt_experiment: 1, mkt_feature: 1, social_post: 1, soc_week: 1, mkt_campaign: 1, mkt_neighbor: 1, mkt_addraft: 1, mkt_event: 1, mkt_page: 1, mkt_outreach: 1, mkt_ad: 1, mkt_giveaway: 1, mkt_payout: 1 };
const HTML_OK = { social_post: 1, soc_week: 1, mkt_addraft: 1, mkt_page: 1 };
function core(){ return require('./portal.js')._core; }
/* patch MM: 💡 Ideas & experiments — each card's results (from the same rows as My leads) and the monthly scorecard */
async function ideasView(who, admin, month){
  const data = await M.crmData(['leads', 'projects', 'users']), doc = await M.readDoc(), st = admin ? { soldValues: true } : await MM.settings();
  const rows = MM.myLeads(data, doc, { soldValues: st.soldValues }), ad = M._recs(doc, 'adcamps'), results = {};
  M._recs(doc, 'experiments').forEach(function(x){ if (x && /^(running|results|keep|kill)$/.test(String(x.stage || ''))) { const r = MM.expResults(x, rows, ad, { soldValues: st.soldValues }); if (r) results[x.id] = r; } });
  const sc = MM.scorecard(rows, { month: month, focus: M._cfg(doc).socFocus, soldValues: st.soldValues, reviews: M._recs(doc, 'reviews'), posts: M._recs(doc, 'posts'), listings: M._recs(doc, 'listings') });
  return { ok: true, results: results, scorecard: sc, soldValues: st.soldValues };
}
async function mmOps(op, body, who, headers){
  const R = function(code, o){ return reply(code, headers, MM.redact(o)); };
  if (op === 'status') { const st = await S.status(), doc = await M.readDoc(), sc = SC.stageCfg(M._cfg(doc)); return R(200, { ok: true, role: 'marketing', platforms: st, stage: sc.stage, flags: sc.flags, mm: await MM.settings() }); }
  if (op === 'mm_boot') { const doc = await M.readDoc(); return R(200, { ok: true, role: 'marketing', name: who.name, stage: SC.stageCfg(M._cfg(doc)).stage, mm: await MM.settings() }); }
  if (op === 'library') {
    const d = await M.crmData(['gc_photo_ai']); const map = (d.gc_photo_ai && d.gc_photo_ai.map) || {}, tags = {};
    Object.keys(map).slice(-4000).forEach(function(k){ const t = map[k] || {}; tags[k] = { stage: t.stage || '', materials: (t.materials || []).slice(0, 4), area: t.area || '' }; });
    let testi = []; try { testi = (await require('./bid-inbox.js')._lib.kvGet('gc_x10_testimonials')) || []; } catch (e) {}
    testi = (Array.isArray(testi) ? testi : (testi.list || [])).filter(function(t){ return t && !t.deleted && t.permission === true && t.status === 'approved'; })
      .map(function(t){ return { id: t.id, pid: t.pid, first: String(t.name || '').split(/\s+/)[0], city: t.city, text: t.text, video: t.video && t.video.ref ? t.video.ref : '', at: t.at }; });
    return R(200, { ok: true, tags: tags, testimonials: testi });
  }
  if (op === 'plan_week') return R(200, await S.planWeek({ week: body.week || 'next', replace: body.replace === true, by: who.name || who.email }));
  if (op === 'swap') return R(200, await S.swapPost(String(body.id || ''), String(body.type || ''), String(body.service || ''), who.email));
  if (op === 'rewrite') return R(200, await S.readapt(String(body.id || '')));
  if (op === 'listings_sync') return R(200, await S.listingsSync(who.email));
  /* the marketing document, redacted both ways */
  if (op === 'mm_kv_read') { if (String(body.key) !== M.KEY) return R(403, { ok: false, error: 'Not a marketing record.' }); return reply(200, headers, { ok: true, value: MM.redactDoc(await M.readDoc()) }); }
  if (op === 'mm_kv_write') {
    if (String(body.key) !== M.KEY || !body.value || typeof body.value !== 'object') return R(403, { ok: false, error: 'Not a marketing record.' });
    let data = {}; try { data = await M.crmData(['projects']); } catch (e) {}
    const jobAddr = {}, jobNames = {}; (Array.isArray(data.projects) ? data.projects : []).forEach(function(p){ if (!p) return; jobAddr[String(p.id)] = [p.address, p.jobAddress].filter(Boolean).map(String); jobNames[String(p.id)] = [p.client, p.clientName, p.customer].filter(Boolean).map(String); });
    const w = await M.update(function(d){ return MM.mergeWrite(d, body.value, { name: who.name || who.email, jobAddr: jobAddr, jobNames: jobNames }); });
    return R(w.ok ? 200 : 503, { ok: w.ok, changed: (w.changed || []).length });
  }
  /* the jobs as a marketing projection, the photos he may use, and one picture link at a time */
  if (op === 'mm_jobs') { const data = await M.crmData(['projects', 'gc_photos']), doc = await M.readDoc(); return reply(200, headers, { ok: true, jobs: MM.jobs(data, doc), photos: MM.photos(data, doc) }); }   /* built safe: no customer, no money, no house number */
  if (op === 'mm_file') {
    const ref = String(body.ref || ''); const data = await M.crmData(['projects', 'gc_photos']), doc = await M.readDoc();
    let testi = []; try { testi = (await require('./bid-inbox.js')._lib.kvGet('gc_x10_testimonials')) || []; } catch (e) {}
    if (!MM.allowedRefs(data, doc, Array.isArray(testi) ? testi : (testi.list || []))[ref]) return reply(403, headers, { ok: false, error: 'That file is not part of marketing.' });
    const url = await M.signRef(ref, 3600); return reply(url ? 200 : 404, headers, { ok: !!url, url: url });
  }
  /* My leads */
  if (op === 'my_leads') {
    const data = await M.crmData(['leads', 'projects', 'users']), doc = await M.readDoc(), st = await MM.settings();
    const rows = MM.myLeads(data, doc, { soldValues: st.soldValues });
    return R(200, { ok: true, rows: rows, funnel: MM.funnel(rows, M._recs(doc, 'adcamps'), M._cfg(doc).socFocus, { soldValues: st.soldValues }), soldValues: st.soldValues });
  }
  /* his To-Dos and Today's plan */
  if (op === 'mm_tasks') {
    const cur = await core().kvListRead('gc_office_tasks'), doc = await M.readDoc(), nowMs = Date.now();
    const posts = M._recs(doc, 'posts').filter(function(p){ return p.scheduleAt && Date.parse(p.scheduleAt) >= nowMs - 864e5 && Date.parse(p.scheduleAt) <= nowMs + 7 * 864e5; }).sort(function(a, b){ return a.scheduleAt < b.scheduleAt ? -1 : 1; });
    const drafts = M._recs(doc, 'posts').filter(function(p){ return p.status === 'draft' || p.status === 'rejected'; }).length;
    const q = ((await core().kvListRead('gc_approval_queue')) || {}).list || [];
    return R(200, { ok: true, tasks: MM.myTasks(cur && cur.list, who.email), plan: { posts: posts.map(function(p){ return { id: p.id, title: p.title, when: p.scheduleAt, status: p.status }; }), drafts: drafts,
      approvals: q.filter(function(x){ return x && x.status === 'waiting' && x.mmOk === true; }).length, week: M._recs(doc, 'socweeks').filter(function(w){ return w.status === 'draft' || w.status === 'rejected'; }).map(function(w){ return w.id; }) } });
  }
  if (op === 'mm_task') {
    const id = String(body.id || ''), email = who.email, at = new Date().toISOString();
    const r = await core().kvListUpdate('gc_office_tasks', function(l){
      if (body.add) { const label = String(body.add.label || '').trim().slice(0, 200); if (!label) return null; const t = { id: 'TM' + Date.now() + Math.floor(Math.random() * 1000), label: label, due: /^\d{4}-\d{2}-\d{2}$/.test(String(body.add.due || '')) ? body.add.due : '', done: false, addedAt: at, updatedAt: at, assignees: [email], assignee: who.name || email, personal: true, self: true, kind: 'assigned', assignedBy: email, addedBy: who.name || email };
        return { list: l.concat([t]), check: function(x){ return x.some(function(y){ return y.id === t.id; }); }, result: t.id }; }
      const t = l.find(function(x){ return String(x.id) === id; }); if (!t || !MM.mine(t, email)) return null;
      if (body.itemId) { const it = (t.items || []).find(function(i){ return String(i.id) === String(body.itemId); }); if (!it) return null; it.done = body.done === true; }
      else { t.done = body.done === true; t.doneAt = t.done ? at : ''; t.doneBy = t.done ? (who.name || email) : ''; }
      t.updatedAt = at; return { list: l, check: function(){ return true; }, result: t.id };
    });
    return R(r.ok && r.result ? 200 : 403, { ok: !!(r.ok && r.result), id: r.result });
  }
  /* the marketing approvals: the list (what he may decide is marked), approve / reject what carries mmOk, queue his drafts */
  if (op === 'mm_approvals') {
    const q = ((await core().kvListRead('gc_approval_queue')) || {}).list || [];
    const items = q.filter(function(x){ return x && MKT_APPR[x.kind] && (x.status === 'waiting' || Date.parse(x.updatedAt || 0) > Date.now() - 14 * 864e5); }).slice(-80)
      .map(function(x){ return { id: x.id, kind: x.kind, title: x.title, to: x.to, subject: x.subject, html: HTML_OK[x.kind] ? x.html : '', status: x.status, mine: x.mmOk === true, flags: x.flags || [], createdAt: x.createdAt, decidedBy: (x.approvals || []).slice(-1).map(function(a){ return a.role; })[0] || '' }; });
    return R(200, { ok: true, items: items });
  }
  if (op === 'ideas') return R(200, await ideasView(who, false));   /* 💡 Ideas & experiments: results + the monthly scorecard */
  if (op === 'mm_approve') { const d = String(body.decision || ''); if (['approve', 'reject'].indexOf(d) < 0) return R(400, { ok: false, error: 'approve or reject' }); const a = await core().approvalAction({ op: d, id: String(body.id || ''), reason: String(body.reason || '').slice(0, 400) }, who); return R(a.status, a.out); }
  if (op === 'mm_upload') {   /* a picture / short video from a content session or a post: stored like the CRM stores files (fingerprint name), marked in the marketing document */
    const m = /^data:((?:image|video)\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(body.dataUrl || ''));
    if (!m) return R(400, { ok: false, error: 'A picture or a video, please.' });
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 4.5 * 1024 * 1024) return R(413, { ok: false, error: 'Too big (4.5 MB at most here).' });
    const ext = (m[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('quicktime', 'mov').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    const name = require('crypto').createHash('sha256').update(buf).digest('hex') + '.' + ext, sb = (process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), k = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const r = await fetch(sb + '/storage/v1/object/crm-files/' + name, { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': m[1], 'x-upsert': 'true' }, body: buf });
    if (!r.ok) return R(502, { ok: false, error: 'Could not store it (' + r.status + ').' });
    const ref = 'sb:crm-files/' + name;
    await M.update(function(d){ const id = 'up_' + name.slice(0, 16); (d.media = d.media || {})[id] = Object.assign({}, d.media[id] || {}, { id: id, ref: ref, kind: /^video/.test(m[1]) ? 'video' : 'photo', name: String(body.name || '').slice(0, 80), by: who.name || who.email, createdAt: new Date().toISOString() }); return [['media', id]]; });
    return R(200, { ok: true, ref: ref });
  }
  if (op === 'mm_queue') { const a = await M.queueForApproval({ kind: String(body.kind || ''), recId: String(body.recId || ''), again: body.again === true }, who, { queueApproval: core().queueApproval, officeTodo: core().officeTodo }); return R(a.status, a.out); }
  if (op === 'mm_review_reply') { const a = await M.approveReply(String(body.id || ''), body.text, who); return R(a.status, a.out); }
  if (op === 'mm_website') { let v = null; try { v = (await M.crmData(['roofPriceRanges'])).roofPriceRanges || null; } catch (e) {} return R(200, { ok: true, roofPriceRanges: v || null, forms: ['general', 'roofing', 'storm', 'water', 'remodel', 'commercial', 'roofprice'] }); }
  return R(403, { ok: false, error: 'Not part of the Marketing Manager profile.' });
}
exports.handler = async function(event){
  const q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && q.callback === '1') {
    try { const r = await S.callback(q); return r.ok ? page(r.platform + ' is connected', 'Approved posts go out on it at their time. You can close this tab.', true) : page('Not connected', r.error, false); }
    catch (e) { return page('Not connected', String(e && e.message || e).slice(0, 200), false); }
  }
  if (event.httpMethod === 'GET' && q.media) { try { return await mediaReply(String(q.media)); } catch (e) { return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: 'error' }; } }
  const headers = Object.assign(gcCors(event, 'POST, OPTIONS'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  const who = await MM.orStaff(await gcStaffAuth(event), event);   /* patch MM: or the Marketing Manager */
  if (!who.ok) return reply(who.statusCode, headers, { ok: false, error: who.error });
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return reply(500, headers, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const op = String(body.op || '');
  let data = {}; try { data = await M.crmData(['users']); } catch (e) {}
  const role = M.roleOf(who, data), admin = role === 'admin', office = admin || role === 'office';
  if (who.marketing) { try { return await mmOps(op, body, who, headers); } catch (e) { return reply(500, headers, { ok: false, error: 'Marketing hit a problem: ' + String(e && e.message || e).slice(0, 160) }); } }   /* patch MM */
  try {
    if (op === 'mm_settings') {   /* patch MM: the admin settings of the Marketing Manager profile (gc_kv gc_mkt_admin) */
      if (body.set) { if (!admin) return reply(403, headers, { ok: false, error: 'Only an admin changes that.' }); return reply(200, headers, { ok: true, mm: await MM.setSettings(body.set, who) }); }
      return reply(200, headers, { ok: true, mm: await MM.settings() });
    }
    if (op === 'status') {
      const st = await S.status(), doc = await M.readDoc(), sc = SC.stageCfg(M._cfg(doc));
      return reply(200, headers, { ok: true, role: role, platforms: st, stage: sc.stage, since: sc.since, flags: sc.flags, known: sc.known.length, hint: admin ? await S.stageHint(doc, data) : null, redirect: S.redirectUri() });
    }
    if (op === 'library') {
      const d = await M.crmData(['gc_photo_ai']); const map = (d.gc_photo_ai && d.gc_photo_ai.map) || {}, tags = {};
      Object.keys(map).slice(-4000).forEach(function(k){ const t = map[k] || {}; tags[k] = { stage: t.stage || '', materials: (t.materials || []).slice(0, 4), area: t.area || '' }; });
      let testi = []; try { testi = (await require('./bid-inbox.js')._lib.kvGet('gc_x10_testimonials')) || []; } catch (e) {}
      testi = (Array.isArray(testi) ? testi : (testi.list || [])).filter(function(t){ return t && !t.deleted && t.permission === true && t.status === 'approved'; })
        .map(function(t){ return { id: t.id, pid: t.pid, first: String(t.name || '').split(/\s+/)[0], city: t.city, text: t.text, video: t.video && t.video.ref ? t.video.ref : '', at: t.at }; });
      return reply(200, headers, { ok: true, tags: tags, testimonials: testi });
    }
    if (op === 'ideas') { if (!admin) return reply(403, headers, { ok: false, error: 'Ideas & experiments: the Marketing Manager and admins.' }); return reply(200, headers, await ideasView(who, true, body.month)); }   /* patch MM */
    if (op === 'feature_requests') { if (!admin) return reply(403, headers, { ok: false, error: 'Admins only.' }); let v = []; try { v = (await M.kvRow(M.FEATURE_KEY)).v || []; } catch (e) {} return reply(200, headers, { ok: true, list: Array.isArray(v) ? v : [] }); }
    if (op === 'my_leads_admin' || op === 'mm_website') {   /* patch MM: the same views for the office / admins (they may see everything anyway) */
      if (!office) return reply(403, headers, { ok: false, error: 'The office or an admin does that.' });
      if (op === 'mm_website') { let v = null; try { v = (await M.crmData(['roofPriceRanges'])).roofPriceRanges || null; } catch (e) {} return reply(200, headers, { ok: true, roofPriceRanges: v || null }); }
      const data = await M.crmData(['leads', 'projects', 'users']), doc = await M.readDoc(), rows = MM.myLeads(data, doc, { soldValues: true });
      return reply(200, headers, { ok: true, rows: rows, funnel: MM.funnel(rows, M._recs(doc, 'adcamps'), M._cfg(doc).socFocus, { soldValues: true }), soldValues: true });
    }
    if (!office) return reply(403, headers, { ok: false, error: 'The office or an admin does that.' });
    if (op === 'plan_week') return reply(200, headers, await S.planWeek({ week: body.week || 'next', replace: body.replace === true, by: who.name || who.email }));
    if (op === 'swap') return reply(200, headers, await S.swapPost(String(body.id || ''), String(body.type || ''), String(body.service || ''), who.email));
    if (op === 'rewrite') return reply(200, headers, await S.readapt(String(body.id || '')));
    if (op === 'listings_sync') return reply(200, headers, await S.listingsSync(who.email));
    if (!admin) return reply(403, headers, { ok: false, error: 'Only an admin does that.' });
    if (op === 'connect') { const u = S.authUrl(String(body.platform || ''), who.email); return reply(u ? 200 : 400, headers, u ? { ok: true, url: u } : { ok: false, error: 'Not set up on Netlify yet — see the steps in 🔌 Connections.' }); }
    if (op === 'disconnect') { await S.forget(String(body.platform || '')); return reply(200, headers, { ok: true }); }
    if (op === 'set_stage') return reply(200, headers, await S.setStage(body.stage, { email: who.email, name: who.name }, body.note));
    return reply(400, headers, { ok: false, error: 'Unknown op' });
  } catch (e) { return reply(500, headers, { ok: false, error: 'Marketing hit a problem: ' + String(e && e.message || e).slice(0, 160) }); }
};
