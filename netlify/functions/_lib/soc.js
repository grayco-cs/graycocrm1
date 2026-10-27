/* ── GrayCo Social, part 3 (patch SOC): TikTok + LinkedIn, per-platform versions, the 3-a-week plan, listings ──────────
   Owner (22 Oct 2026): "does my CRM take care of all this" — the agency quote (3 posts a week on Facebook, Instagram,
   TikTok and LinkedIn, adapted per platform, a content library, Google Business, 40 listings). Restoration first
   (water, fire, storm), then roofing, remodels, commercial — the weights are data (cfg.main.socFocus).

   * TikTok + LinkedIn: OAuth from Marketing → 🔌 Connections. Dormant until TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET and
     LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are set on Netlify (both apps need the platform's review first). The
     tokens live ONLY in the service-only store (gc_lead_inbox_kv "gc_social_tokens"); the browser sees connected yes / no.
     Not connected → the approved post becomes a "Ready to post" pack (caption + picture + Open app) on the To-Do.
   * Versions: adapt(idea) asks the AI (ANTHROPIC_API_KEY, the small model) for five different versions and keeps only
     what passes the rules (soc-content.js normalize: no address, no customer name without their OK, no carrier);
     templates without a key.
   * The week: planWeek() — Mon / Wed / Fri, a mix (progress, before/after, testimonial, team, tip, seasonal), the
     services by the focus weights, photos only from jobs whose customer said yes. The week goes onto THE approvals
     list as ONE item (kind soc_week): one tap approves the three posts; nothing is posted before that.
   * Listings: BrightLocal (optional, BRIGHTLOCAL_API_KEY / _SECRET / _REPORT_ID) fills what each listing shows. */
'use strict';
const crypto = require('crypto');
const SC = require('./soc-content.js');
const C = require('./mkt-content.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : (v && Array.isArray(v.list) ? v.list : []); }
function env(k){ return s(process.env[k]); }
function L(){ return require('../bid-inbox.js')._lib; }
function M(){ return require('./mkt.js'); }
function X2(){ return require('./mkt2.js'); }
let nowFn = function(){ return Date.now(); };
function nowIso(){ return new Date(nowFn()).toISOString(); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function redirectUri(){ return site() + '/.netlify/functions/soc?callback=1'; }
async function jfetch(url, opts){
  let r, t = '', j = {};
  try { r = await fetch(url, opts); t = await r.text(); } catch (e) { return { ok: false, status: 0, j: { error: { message: 'no answer (' + s(e && e.message) + ')' } }, h: null }; }
  try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { raw: t.slice(0, 300) }; }
  return { ok: r.ok, status: r.status, j: j, h: r.headers };
}
function errOf(res){ const e = res.j && res.j.error; return s((e && (e.message || e.error_description || (typeof e === 'string' ? e : ''))) || res.j.error_description || res.j.message || res.j.raw || ('HTTP ' + res.status)).slice(0, 300); }
function form(o){ return Object.keys(o).filter(function(k){ return o[k] != null && o[k] !== ''; }).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(String(o[k])); }).join('&'); }

/* ══════════════ 1. CONNECTIONS ══════════════ */
const TK = 'gc_social_tokens';
function ttConfigured(){ return !!(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET')); }
function liConfigured(){ return !!(env('LINKEDIN_CLIENT_ID') && env('LINKEDIN_CLIENT_SECRET')); }
function blConfigured(){ return !!(env('BRIGHTLOCAL_API_KEY') && env('BRIGHTLOCAL_API_SECRET') && env('BRIGHTLOCAL_REPORT_ID')); }
async function tokens(){ try { return (await L().kvGet(TK)) || {}; } catch (e) { return {}; } }
async function saveTokens(plat, t){ await L().kvCas(TK, function(v){ v = v && typeof v === 'object' ? v : {}; v[plat] = Object.assign({}, v[plat] || {}, t); return v; }); }
async function forget(plat){ await L().kvCas(TK, function(v){ v = v && typeof v === 'object' ? v : {}; if (!v[plat]) return undefined; delete v[plat]; return v; }); }
/* which platforms can post by themselves (true / false only — never a token) */
async function status(){
  const st = require('./social.js').status(), t = await tokens();
  const tt = t.tiktok || {}, li = t.linkedin || {};
  const out = Object.assign({}, st, {
    tiktok: ttConfigured() && !!(tt.access || tt.refresh), linkedin: liConfigured() && !!li.access && !(li.expiresAt && Date.parse(li.expiresAt) < nowFn()),
    tiktokInfo: { configured: ttConfigured(), connected: !!(tt.access || tt.refresh), by: s(tt.by), connectedAt: s(tt.connectedAt), name: s(tt.name), lastError: s(tt.lastError) },
    linkedinInfo: { configured: liConfigured(), connected: !!li.access, by: s(li.by), connectedAt: s(li.connectedAt), name: s(li.name), org: !!li.org, expiresAt: s(li.expiresAt), lastError: s(li.lastError) },
    brightlocal: blConfigured(), ai: !!env('ANTHROPIC_API_KEY')
  });
  out.any = !!(out.any || out.tiktok || out.linkedin);
  return out;
}
function authUrl(plat, email){
  const st = X2().makeState('soc-' + plat, email);
  if (plat === 'tiktok') {
    if (!ttConfigured()) return '';
    return 'https://www.tiktok.com/v2/auth/authorize/?' + form({ client_key: env('TIKTOK_CLIENT_KEY'), scope: 'user.info.basic,video.publish,video.upload,video.list', response_type: 'code', redirect_uri: redirectUri(), state: st });
  }
  if (plat === 'linkedin') {
    if (!liConfigured()) return '';
    return 'https://www.linkedin.com/oauth/v2/authorization?' + form({ response_type: 'code', client_id: env('LINKEDIN_CLIENT_ID'), redirect_uri: redirectUri(), state: st,
      scope: env('LINKEDIN_SCOPES') || 'openid profile w_member_social w_organization_social r_organization_social rw_organization_admin' });
  }
  return '';
}
async function callback(q){
  const st = X2().readState(q.state);
  if (!st || !/^soc-(tiktok|linkedin)$/.test(s(st.p))) return { ok: false, error: 'This sign-in link expired. Start again from Marketing → 🔌 Connections.' };
  if (q.error) return { ok: false, error: s(q.error_description || q.error) };
  if (!s(q.code)) return { ok: false, error: 'No code came back.' };
  const plat = st.p.slice(4);
  if (plat === 'tiktok') {
    const r = await jfetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), code: q.code, grant_type: 'authorization_code', redirect_uri: redirectUri() }) });
    if (!r.ok || !r.j.access_token) return { ok: false, error: 'TikTok did not give a token: ' + errOf(r) };
    await saveTokens('tiktok', { access: r.j.access_token, refresh: s(r.j.refresh_token), openId: s(r.j.open_id), expiresAt: new Date(nowFn() + (+r.j.expires_in || 86400) * 1000).toISOString(),
      refreshExpiresAt: new Date(nowFn() + (+r.j.refresh_expires_in || 31536000) * 1000).toISOString(), connectedAt: nowIso(), by: st.e, lastError: '' });
    return { ok: true, platform: 'TikTok' };
  }
  const r = await jfetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ grant_type: 'authorization_code', code: q.code, redirect_uri: redirectUri(), client_id: env('LINKEDIN_CLIENT_ID'), client_secret: env('LINKEDIN_CLIENT_SECRET') }) });
  if (!r.ok || !r.j.access_token) return { ok: false, error: 'LinkedIn did not give a token: ' + errOf(r) };
  const tok = r.j.access_token, rec = { access: tok, refresh: s(r.j.refresh_token), expiresAt: new Date(nowFn() + (+r.j.expires_in || 5184000) * 1000).toISOString(), connectedAt: nowIso(), by: st.e, lastError: '' };
  /* post as the GrayCo company page: LINKEDIN_ORG_ID, else the first page this person administers; else as the person */
  let org = env('LINKEDIN_ORG_ID');
  if (!org) { const a = await jfetch('https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', { headers: liHeaders(tok) }); const e = a.ok && arr(a.j.elements)[0]; if (e) org = s(e.organization || e.organizationTarget).split(':').pop(); }
  if (org) rec.org = org;
  const me = await jfetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: 'Bearer ' + tok } });
  if (me.ok) { rec.person = s(me.j.sub); rec.name = s(me.j.name); }
  await saveTokens('linkedin', rec);
  return { ok: true, platform: 'LinkedIn' + (org ? ' (company page)' : '') };
}
function liHeaders(tok){ return { Authorization: 'Bearer ' + tok, 'LinkedIn-Version': env('LINKEDIN_VERSION') || '202410', 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' }; }
async function ttAccess(){
  const t = (await tokens()).tiktok || {};
  if (!t.access && !t.refresh) throw new Error('TikTok is not connected.');
  if (t.access && Date.parse(t.expiresAt || 0) > nowFn() + 120e3) return t;
  const r = await jfetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: t.refresh }) });
  if (!r.ok || !r.j.access_token) { await saveTokens('tiktok', { lastError: 'Sign-in expired: ' + errOf(r) }); throw new Error('TikTok sign-in expired — reconnect it in Marketing → 🔌 Connections.'); }
  const n = { access: r.j.access_token, refresh: s(r.j.refresh_token) || t.refresh, expiresAt: new Date(nowFn() + (+r.j.expires_in || 86400) * 1000).toISOString(), lastError: '' };
  await saveTokens('tiktok', n);
  return Object.assign({}, t, n);
}

/* ── the picture for TikTok (it pulls from a verified domain: the CRM's own address, a signed one-day link) ── */
function mediaToken(ref){ const body = Buffer.from(JSON.stringify({ r: s(ref), t: nowFn() })).toString('base64url'); return body + '.' + crypto.createHmac('sha256', X2secret()).update('soc-media|' + body).digest('base64url'); }
function X2secret(){ const own = env('MKT2_SECRET'); return own.length >= 16 ? own : (env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || 'x'); }
function readMediaToken(tok){
  const i = s(tok).lastIndexOf('.'); if (i < 1) return null;
  const body = tok.slice(0, i), sig = crypto.createHmac('sha256', X2secret()).update('soc-media|' + body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(tok.slice(i + 1)); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let o; try { o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  return o && nowFn() - (+o.t || 0) < 86400e3 ? o : null;
}
function mediaUrl(ref){ return site() + '/.netlify/functions/soc?media=' + mediaToken(ref); }

/* ── posting ── */
async function postTikTok(caption, ref, post){
  if (!ref) return { ok: false, manual: true, error: 'TikTok needs a video or a picture — film it from the script (Ready-to-post pack).' };
  let t; try { t = await ttAccess(); } catch (e) { return { ok: false, error: s(e.message) }; }
  const H = { Authorization: 'Bearer ' + t.access, 'Content-Type': 'application/json; charset=UTF-8' };
  const privacy = env('TIKTOK_PRIVACY') || 'PUBLIC_TO_EVERYONE', isVideo = /\.(mp4|mov|webm)$/i.test(s(post && post.videoRef) || '');
  const url = mediaUrl(isVideo ? post.videoRef : ref);
  const r = isVideo
    ? await jfetch('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers: H, body: JSON.stringify({ post_info: { title: caption.slice(0, 2200), privacy_level: privacy, disable_comment: false }, source_info: { source: 'PULL_FROM_URL', video_url: url } }) })
    : await jfetch('https://open.tiktokapis.com/v2/post/publish/content/init/', { method: 'POST', headers: H, body: JSON.stringify({ media_type: 'PHOTO', post_mode: 'DIRECT_POST',
      post_info: { title: caption.slice(0, 90), description: caption.slice(0, 4000), privacy_level: privacy, disable_comment: false, auto_add_music: true }, source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [url] } }) });
  const pid = s(r.j && r.j.data && r.j.data.publish_id), code = s(r.j && r.j.error && r.j.error.code);
  if (!r.ok || !pid || (code && code !== 'ok')) return { ok: false, error: 'TikTok: ' + errOf(r) };
  return { ok: true, id: pid, url: '', publishId: pid, pending: true };
}
async function postLinkedIn(caption, imageUrl){
  const t = (await tokens()).linkedin || {};
  if (!t.access) return { ok: false, error: 'LinkedIn is not connected.' };
  const author = t.org ? 'urn:li:organization:' + t.org : 'urn:li:person:' + t.person, H = liHeaders(t.access);
  const body = { author: author, commentary: caption.replace(/([\\(){}\[\]<>@|~_*#])/g, '\\$1'), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false };
  if (imageUrl) {
    const up = await jfetch('https://api.linkedin.com/rest/images?action=initializeUpload', { method: 'POST', headers: H, body: JSON.stringify({ initializeUploadRequest: { owner: author } }) });
    const v = up.ok && up.j.value;
    if (v && v.uploadUrl && v.image) {
      try { const img = await fetch(imageUrl); const buf = Buffer.from(await img.arrayBuffer()); const put = await fetch(v.uploadUrl, { method: 'PUT', headers: { Authorization: 'Bearer ' + t.access }, body: buf }); if (put.ok) body.content = { media: { id: v.image } }; } catch (e) {}
    }
  }
  const r = await jfetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) { if (r.status === 401) await saveTokens('linkedin', { lastError: 'Sign-in expired — reconnect.' }); return { ok: false, error: 'LinkedIn: ' + errOf(r) }; }
  const urn = s(r.h && r.h.get && (r.h.get('x-restli-id') || r.h.get('x-linkedin-id'))) || s(r.j.id);
  return { ok: true, id: urn, url: urn ? 'https://www.linkedin.com/feed/update/' + urn + '/' : '' };
}
async function publishTo(net, caption, imageUrl, post){
  if (net === 'tiktok') return postTikTok(caption, s(post && (post.videoRef || post.photoRef)), post);
  if (net === 'linkedin') return postLinkedIn(caption, imageUrl);
  return { ok: false, error: 'Unknown network.' };
}
/* likes / comments / views where the API allows it */
async function insights(results){
  const out = {};
  try {
    const li = results.linkedin, t = (await tokens()).linkedin || {};
    if (li && li.ok && li.id && t.access) {
      const r = await jfetch('https://api.linkedin.com/rest/socialActions/' + encodeURIComponent(li.id), { headers: liHeaders(t.access) });
      if (r.ok) out.linkedin = { likes: +(r.j.likesSummary && r.j.likesSummary.totalLikes) || 0, comments: +(r.j.commentsSummary && (r.j.commentsSummary.aggregatedTotalComments || r.j.commentsSummary.totalFirstLevelComments)) || 0 };
    }
    const tt = results.tiktok;
    if (tt && tt.ok && (tt.videoId || tt.publishId)) {
      const a = await ttAccess(), H = { Authorization: 'Bearer ' + a.access, 'Content-Type': 'application/json' };
      let vid = s(tt.videoId);
      if (!vid) { const st = await jfetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', { method: 'POST', headers: H, body: JSON.stringify({ publish_id: tt.publishId }) }); vid = s(arr(st.j && st.j.data && st.j.data.publicaly_available_post_id)[0]); if (vid) out.tiktokId = vid; }
      if (vid) {
        const q = await jfetch('https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count,share_url', { method: 'POST', headers: H, body: JSON.stringify({ filters: { video_ids: [vid] } }) });
        const v = q.ok && arr(q.j.data && q.j.data.videos)[0];
        if (v) out.tiktok = { likes: +v.like_count || 0, comments: +v.comment_count || 0, shares: +v.share_count || 0, views: +v.view_count || 0, url: s(v.share_url) };
      }
    }
  } catch (e) {}
  return out;
}

/* ══════════════ 2. THE VERSIONS (AI, else templates) ══════════════ */
const VTOOL = { name: 'social_versions', description: 'One social idea written five different ways, one per platform.', input_schema: { type: 'object', properties: {
  facebook: { type: 'object', properties: { caption: { type: 'string' } }, required: ['caption'] },
  instagram: { type: 'object', properties: { format: { type: 'string', enum: ['reel', 'carousel'] }, script: { type: 'array', items: { type: 'string' } }, slides: { type: 'array', items: { type: 'string' } }, caption: { type: 'string' }, hashtags: { type: 'string' } }, required: ['format', 'caption', 'hashtags'] },
  tiktok: { type: 'object', properties: { hook: { type: 'string' }, onScreen: { type: 'array', items: { type: 'string' } }, script: { type: 'array', items: { type: 'string' } }, caption: { type: 'string' }, hashtags: { type: 'string' } }, required: ['hook', 'caption'] },
  linkedin: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  gbp: { type: 'object', properties: { text: { type: 'string' }, cta: { type: 'string', enum: ['CALL', 'LEARN_MORE'] } }, required: ['text'] }
}, required: ['facebook', 'instagram', 'tiktok', 'linkedin', 'gbp'] } };
/* idea + the rules (addresses, names, nameOk) → { versions, ai } */
async function adapt(idea, rules){
  rules = rules || {};
  let raw = null, ai = false;
  if (env('ANTHROPIC_API_KEY') && !rules.noAi) {
    const r = await require('./x12.js').aiTool(VTOOL, SC.aiPrompt(idea), { model: env('SOC_AI_MODEL') || env('X12_AI_MODEL') || 'claude-haiku-5-5', max: 2500, timeout: 25000 });
    if (r.ok) { raw = r.input; ai = true; }
  }
  return { versions: SC.normalize(raw, idea, rules), ai: ai };
}

/* ══════════════ 3. THE WEEK ══════════════ */
function proj(data, id){ return arr(data.projects).find(function(p){ return p && s(p.id) === s(id); }) || null; }
function permOk(doc, p){ const r = doc && doc.perms && doc.perms['job_' + s(p && p.id)]; return !!((r && !r.del && r.marketing === true) || (p && (p.marketingOk === true || p.mktPhotoOk === true))); }
function clientNames(p){ return [p && p.client, p && p.clientName, p && p.customer, p && p.customerName, p && p.owner].map(s).filter(function(x){ return x.length >= 3; }); }
function jobPhotos(data, ai, pid){
  return arr(data.gc_photos).filter(function(r){ return r && r.deleted !== true && r.source !== 'ccflag' && s(r.jobId) === s(pid) && s(r.ref) && r.shared !== false && s(r.tag) !== 'Damage'; })
    .map(function(r){ const t = ai[s(r.id)] || {}; return { ref: s(r.ref), at: s(r.at), tag: s(r.tag), stage: low(t.stage), ai: t }; })
    .sort(function(a, b){ return a.at < b.at ? 1 : -1; });
}
function isActive(p){ return p && p.deleted !== true && !C.isDone(p) && !/lost|cancel|dead|lead|estimat|bid|prospect|on hold/i.test(s(p.status)); }
function mondayOf(nowMs, which){
  if (/^\d{4}-\d{2}-\d{2}$/.test(s(which))) return s(which);
  const p = C.ctParts(nowMs), add = which === 'this' ? -((p.wd + 6) % 7) : (p.wd === 0 ? 1 : 8 - p.wd);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d + add)).toISOString().slice(0, 10);
}
function slotsFor(monday, cfg){
  const t = (cfg && cfg.socTimes) || {}, base = Date.parse(monday + 'T12:00:00Z');
  return [0, 2, 4].map(function(off, i){ const d = new Date(base + off * 864e5), hm = s(t[['mon', 'wed', 'fri'][i]] || '11:00').split(':');
    return new Date(C.ctToMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), +hm[0] || 11, +hm[1] || 0)).toISOString(); });
}
function cityName(slug){ return s(slug).split('-').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
/* everything the planner can use this week */
async function inputs(doc){
  let data = {}; try { data = await M().crmData(['projects', 'users', 'gc_photos', 'gc_photo_ai']); } catch (e) {}
  const ai = (data.gc_photo_ai && data.gc_photo_ai.map) || {};
  let testi = []; try { testi = arr(await L().kvGet('gc_x10_testimonials')); } catch (e) {}
  return { data: data, ai: ai, testi: testi };
}
function usedIds(doc, k){ return M()._recs(doc, 'posts').map(function(p){ return s(p[k]); }).filter(Boolean); }
/* the candidates per service and type: { restoration: { beforeafter: [..], progress: [..], testimonial: [..] }, … } */
function candidates(doc, inp, nowMs){
  const out = {}; SC.SERVICES.forEach(function(x){ out[x.v] = { progress: [], beforeafter: [], testimonial: [] }; });
  const usedJobs = usedIds(doc, 'jobId'), usedT = usedIds(doc, 'testimonialId').concat(usedIds(doc, 'reviewId'));
  const cutoff = new Date(nowMs - 150 * 864e5).toISOString().slice(0, 10), recent = new Date(nowMs - 21 * 864e5).toISOString();
  arr(inp.data.projects).forEach(function(p){
    if (!p || p.deleted === true || !permOk(doc, p)) return;
    const svc = SC.serviceOf(p) || 'remodel', ph = jobPhotos(inp.data, inp.ai, p.id); if (!ph.length) return;
    if (C.isDone(p) && (C.doneDate(p) || '9999') >= cutoff && usedJobs.indexOf(s(p.id)) < 0) {
      const after = ph.find(function(x){ return x.tag === 'After' || x.stage === 'final'; }), before = ph.find(function(x){ return x.tag === 'Before' || x.stage === 'before'; });
      if (after) out[svc].beforeafter.push({ p: p, photo: after.ref, before: before ? before.ref : '', refs: [after.ref].concat(before ? [before.ref] : []).concat(ph.filter(function(x){ return x.ref !== after.ref && (!before || x.ref !== before.ref); }).slice(0, 3).map(function(x){ return x.ref; })) });
    }
    if (isActive(p)) {
      const fresh = ph.filter(function(x){ return x.at >= recent; });
      const used = M()._recs(doc, 'posts').some(function(x){ return s(x.jobId) === s(p.id) && x.socType === 'progress' && Date.parse(x.createdAt || 0) > nowMs - 28 * 864e5; });
      if (fresh.length && !used) out[svc].progress.push({ p: p, photo: fresh[0].ref, refs: fresh.slice(0, 4).map(function(x){ return x.ref; }) });
    }
  });
  arr(inp.testi).forEach(function(t){
    if (!t || t.deleted || t.permission !== true || s(t.status) !== 'approved' || !s(t.text) || usedT.indexOf(s(t.id)) >= 0) return;
    const p = proj(inp.data, t.pid) || {}; const svc = SC.serviceOf(p) || 'remodel';
    out[svc].testimonial.push({ t: t, p: p });
  });
  M()._recs(doc, 'reviews').forEach(function(r){ if ((+r.rating || 0) >= 5 && s(r.text) && usedT.indexOf(s(r.id)) < 0 && !r.thanksPostId) out[SC.serviceOf({ scope: r.text }) || 'restoration'].testimonial.push({ r: r }); });
  return out;
}
/* one planned slot → the idea + the post record (without its versions) */
function ideaFor(slot, cands, doc, inp, ctx){
  const svc = slot.service, type = slot.type, month = C.ctParts(ctx.nowMs).mo;
  const idea = { type: type, service: svc, week: ctx.week, city: cityName(SC.REST_CITIES[(ctx.wn + ctx.i) % SC.REST_CITIES.length]) };
  const rec = { socType: type, socService: svc, title: SC.typeLabel(type).replace(/^\S+\s/, '') + ' — ' + (SC.SERVICES.find(function(x){ return x.v === svc; }) || {}).v };
  const rules = { addresses: [], names: [], nameOk: false };
  const pick = (cands[svc] && cands[svc][type] || [])[0];
  if (pick && pick.p && pick.p.id) {
    const p = pick.p; idea.city = C.areaOf(p); idea.jobText = [p.type, p.jobType, p.name, p.scope].join(' ');
    rules.addresses = [s(p.address), s(p.jobAddress)].filter(Boolean); rules.names = clientNames(p);
    Object.assign(rec, { jobId: s(p.id), jobName: s(p.name), jobAddresses: rules.addresses });
  }
  if (type === 'beforeafter' || type === 'progress') { if (pick) { rec.photoRef = pick.photo; rec.beforeRef = pick.before || ''; rec.photoRefs = pick.refs; idea.photos = pick.refs.length; } }
  if (type === 'testimonial' && pick) {
    if (pick.t) { idea.quote = s(pick.t.text).slice(0, 300); idea.quoteBy = s(pick.t.name).split(/\s+/)[0]; rules.nameOk = true; rec.testimonialId = s(pick.t.id); if (pick.t.video && pick.t.video.ref) { rec.videoRef = s(pick.t.video.ref); idea.video = true; } }
    else if (pick.r) { idea.quote = s(pick.r.text).slice(0, 300); idea.quoteBy = s(pick.r.author).split(/\s+/)[0]; rules.nameOk = true; rules.names = [s(pick.r.author)]; rec.reviewId = s(pick.r.id); }
    if (pick.t) rules.names = [s(pick.t.name)].concat(rules.names);
  }
  if (svc === 'restoration') idea.sub = idea.jobText ? SC.subFor(idea, 0) : SC.nextSub(ctx.subs);
  if (type === 'tip') {
    if (svc === 'restoration') { const used = usedIds(doc, 'tipId'); const t = SC.REST_TIPS.filter(function(x){ return x.sub === idea.sub && used.indexOf(x.id) < 0; })[0] || SC.REST_TIPS.filter(function(x){ return x.sub === idea.sub; })[0]; idea.tip = t.t; rec.tipId = t.id; }
    else { const t = C.tipFor(month, usedIds(doc, 'tipId')); idea.tip = t.t; rec.tipId = t.id; }
  }
  if (type === 'seasonal') idea.season = SC.SEASON[month];
  if (type === 'team') {
    const team = M()._recs(doc, 'media').filter(function(m){ return m.type === 'team' && s(m.ref); }).sort(function(a, b){ return s(a.lastUsed) < s(b.lastUsed) ? -1 : 1; })[0];
    if (team) { rec.photoRef = team.ref; rec.mediaId = team.id; idea.photos = 1; idea.team = s(team.people); }
  }
  if (svc === 'restoration') { rec.socSub = idea.sub; ctx.subs[idea.sub] = (+ctx.subs[idea.sub] || 0) + 1; }
  if (pick && cands[svc] && cands[svc][type]) cands[svc][type].shift();
  rec.link = SC.withUtm(SC.pageFor(idea), 'facebook', idea);
  return { idea: idea, rec: rec, rules: rules };
}
/* plan the week (o.week = 'next' | 'this' | 'YYYY-MM-DD' Monday). Idempotent: a week already planned stays as it is (o.replace re-plans its drafts). */
async function planWeek(o){
  o = o || {};
  const nowMs = nowFn(); let doc = await M().readDoc();
  const cfg = M()._cfg(doc), monday = mondayOf(nowMs, o.week || 'next');
  const have = M()._get(doc, 'socweeks', monday);
  if (have && !o.replace && have.status !== 'rejected') return { ok: true, week: monday, existing: true, postIds: arr(have.postIds) };
  if (have && o.replace && /^(approved|waiting)$/.test(s(have.status))) return { ok: false, error: 'This week is already ' + have.status + ' — edit the posts one by one.' };
  const inp = await inputs(doc), cands = candidates(doc, inp, nowMs);
  const hist = {}, subs = {}, lastWk = M()._recs(doc, 'socweeks').filter(function(w){ return w.id < monday; }).sort(function(a, b){ return a.id < b.id ? 1 : -1; })[0];
  M()._recs(doc, 'posts').forEach(function(p){ if (p.socService && p.status !== 'rejected') hist[p.socService] = (hist[p.socService] || 0) + 1; if (p.socSub) subs[p.socSub] = (subs[p.socSub] || 0) + 1; });
  const avail = {}; Object.keys(cands).forEach(function(k){ avail[k] = { progress: cands[k].progress.length > 0, beforeafter: cands[k].beforeafter.length > 0, testimonial: cands[k].testimonial.length > 0 }; });
  const team = M()._recs(doc, 'media').some(function(m){ return m.type === 'team' && s(m.ref); });
  const last = lastWk ? arr(lastWk.types) : [];
  const wn = SC.weekNo(Date.parse(monday + 'T12:00:00Z'));
  const mix = o.mix || SC.planMix({ week: wn, weights: cfg.socFocus, history: hist, avail: avail, team: team, last: last });
  const slots = slotsFor(monday, cfg), nets = arr(cfg.socNetworks).length ? arr(cfg.socNetworks).filter(function(n){ return SC.PLAT_IDS.indexOf(n) >= 0; }) : SC.PLAT_IDS.slice();
  const ctx = { nowMs: nowMs, week: monday, wn: wn, subs: subs, i: 0 }, posts = [];
  for (let i = 0; i < mix.length; i++) {
    ctx.i = i;
    const x = ideaFor(mix[i], cands, doc, inp, ctx), a = await adapt(x.idea, x.rules);
    posts.push(Object.assign({ id: M()._rid('post'), kind: 'soc', socWeek: monday, socDay: ['Mon', 'Wed', 'Fri'][i], networks: nets.slice(), versions: a.versions, ai: a.ai,
      caption: SC.captionFor('facebook', a.versions.facebook), names: x.rules.names, nameOk: x.rules.nameOk, scheduleAt: slots[i], status: 'draft', autopilot: true, createdAt: nowIso() }, x.rec));
  }
  const week = { id: monday, week: monday, postIds: posts.map(function(p){ return p.id; }), types: mix.map(function(m){ return m.type; }), services: mix.map(function(m){ return m.service; }), status: 'draft', createdAt: nowIso(), by: o.by || 'Autopilot' };
  const w = await M().update(function(d){
    const ch = [];
    if (have && o.replace) arr(have.postIds).forEach(function(id){ const p = M()._get(d, 'posts', id); if (p && !/^(posted|posting)$/.test(s(p.status))) { p.del = true; ch.push(['posts', id]); } });
    posts.forEach(function(p){ ch.push(M()._put(d, 'posts', p)); });
    ch.push(M()._put(d, 'socweeks', week));
    return ch;
  });
  if (!w.ok) return { ok: false, error: 'busy' };
  let queued = null;
  if (o.queue !== false) { try { queued = await M().queueForApproval({ kind: 'soc_week', recId: monday, system: true }, { email: 'autopilot@grayco-cs.com', role: 'admin' }, require('../portal.js')._core); } catch (e) { queued = { out: { ok: false, error: s(e.message) } }; } }
  return { ok: true, week: monday, postIds: week.postIds, mix: mix, queued: queued && queued.out };
}
/* swap one post of the week for another type / service */
async function swapPost(id, type, service, by){
  const nowMs = nowFn(), doc = await M().readDoc(), old = M()._get(doc, 'posts', id);
  if (!old || !old.socWeek) return { ok: false, error: 'That post is not part of a week plan.' };
  if (/^(posted|posting|approved)$/.test(s(old.status))) return { ok: false, error: 'That post is already ' + old.status + '.' };
  const inp = await inputs(doc), cands = candidates(doc, inp, nowMs), subs = {};
  M()._recs(doc, 'posts').forEach(function(p){ if (p.socSub) subs[p.socSub] = (subs[p.socSub] || 0) + 1; });
  const svc = SC.SERVICES.some(function(x){ return x.v === service; }) ? service : old.socService || 'restoration';
  let t = SC.TYPES.some(function(x){ return x.v === type; }) ? type : 'tip';
  if ({ progress: 1, beforeafter: 1, testimonial: 1 }[t] && !(cands[svc] && cands[svc][t] && cands[svc][t].length)) return { ok: false, error: 'No ' + SC.typeLabel(t).replace(/^\S+\s/, '').toLowerCase() + ' for ' + svc + ' with photos and the customer\'s OK — pick another.' };
  const ctx = { nowMs: nowMs, week: old.socWeek, wn: SC.weekNo(Date.parse(old.socWeek + 'T12:00:00Z')), subs: subs, i: ['Mon', 'Wed', 'Fri'].indexOf(old.socDay) };
  const x = ideaFor({ service: svc, type: t }, cands, doc, inp, ctx), a = await adapt(x.idea, x.rules);
  const keep = { id: id, kind: 'soc', socWeek: old.socWeek, socDay: old.socDay, networks: arr(old.networks), scheduleAt: old.scheduleAt, status: 'draft', autopilot: true, createdAt: old.createdAt, swappedBy: s(by), swappedAt: nowIso() };
  const rec = Object.assign(keep, x.rec, { versions: a.versions, ai: a.ai, caption: SC.captionFor('facebook', a.versions.facebook), names: x.rules.names, nameOk: x.rules.nameOk });
  const w = await M().update(function(d){ const ch = [M()._put(d, 'posts', rec)]; const wk = M()._get(d, 'socweeks', old.socWeek); if (wk) { const i = arr(wk.postIds).indexOf(id); if (i >= 0) { wk.types = arr(wk.types); wk.types[i] = t; wk.services = arr(wk.services); wk.services[i] = svc; } if (wk.status === 'rejected') wk.status = 'draft'; ch.push(['socweeks', wk.id]); } return ch; });
  return w.ok ? { ok: true, post: rec } : { ok: false, error: 'busy' };
}
/* re-write one post's versions (after an edit of the idea, or "✨ Rewrite") */
async function readapt(id){
  const doc = await M().readDoc(), p = M()._get(doc, 'posts', id); if (!p) return { ok: false, error: 'Not found.' };
  const idea = { type: p.socType || 'tip', service: p.socService || 'restoration', sub: p.socSub, week: p.socWeek, city: p.jobId ? '' : 'Bartlett', tip: '', photos: arr(p.photoRefs).length || (p.photoRef ? 1 : 0) };
  idea.tip = idea.season = SC.captionFor('facebook', (p.versions || {}).facebook).split('\n\n')[1] || '';
  const a = await adapt(idea, { addresses: arr(p.jobAddresses), names: arr(p.names), nameOk: !!p.nameOk });
  return { ok: true, versions: a.versions, ai: a.ai };
}

/* ── the approval of a week (one item, three posts) ── */
async function weekApproval(rec, doc){
  const posts = arr(rec.postIds).map(function(id){ return M()._get(doc, 'posts', id); }).filter(Boolean);
  const bad = []; posts.forEach(function(p){ SC.postProblems(p).forEach(function(x){ bad.push(s(p.socDay) + ' ' + x.l); }); });
  if (bad.length) return { error: bad.slice(0, 3).join(' ') };
  let html = '<p><b>The week of ' + C.esc(rec.week) + '</b> — 3 posts, each written for every platform. Approving approves all three; each one posts on its day (platforms not connected become a Ready-to-post pack on the To-Do).</p>';
  for (const p of posts) {
    const img = p.photoRef ? await M().signRef(p.photoRef, 7 * 86400) : '';
    html += '<div style="border:1px solid #dce3ee;border-radius:10px;padding:10px;margin:10px 0"><b>' + C.esc(p.socDay + ' · ' + C.ctLabel(p.scheduleAt)) + '</b> — ' + C.esc(SC.typeLabel(p.socType)) + ' · ' + C.esc(p.socService || '') + (p.socSub ? ' (' + C.esc(p.socSub) + ')' : '') +
      (img ? '<img src="' + C.esc(img) + '" alt="" style="max-width:100%;border-radius:8px;display:block;margin:8px 0">' : '') +
      arr(p.networks).map(function(n){ const pl = SC.plat(n); const v = (p.versions || {})[n]; if (!v) return ''; return '<div style="margin:6px 0"><b>' + C.esc(pl ? pl.ic + ' ' + pl.l : n) + '</b>' + (v.hook ? '<div><i>Hook:</i> ' + C.esc(v.hook) + '</div>' : '') + '<div>' + C.esc(SC.captionFor(n, v)).replace(/\n/g, '<br>') + '</div></div>'; }).join('') + '</div>';
  }
  return { title: '📣 Marketing — the week of ' + rec.week + ': 3 posts (Mon / Wed / Fri)', to: posts.length + ' posts × ' + arr((posts[0] || {}).networks).length + ' platforms', subject: 'Social posts — week of ' + rec.week, html: html, meta: { posts: posts.length } };
}
function afterWeekApproved(d, rec, by){
  const ch = [];
  arr(rec.postIds).forEach(function(id){ const p = M()._get(d, 'posts', id); if (!p || !/^(draft|waiting|rejected)$/.test(s(p.status) || 'draft')) return; p.status = 'approved'; p.approvedBy = s(by.by) || 'admin'; p.approvedEmail = s(by.email); p.approvedAt = nowIso(); p.apprId = s(by.apprId); p.weekApproved = true; ch.push(['posts', id]); });
  return ch;
}

/* ── per-network captions for posting, and the Ready-to-post To-Do ── */
function captionsFor(post){ const out = {}, v = post && post.versions; if (!v) return null; Object.keys(v).forEach(function(n){ const c = SC.captionFor(n, v[n]); if (c) out[n] = c; }); return out; }
async function readyTodo(post, nets){
  if (!nets.length) return '';
  const id = 'soc_ready_' + s(post.id), names = nets.map(function(n){ const p = SC.plat(n); return p ? p.l : n; }).join(', ');
  const note = 'Marketing → 🗓 Week plan → this post → 📲 Ready-to-post: copy the caption, download the picture' + (nets.indexOf('tiktok') >= 0 || nets.indexOf('instagram') >= 0 ? ' (or film the reel from the script)' : '') + ', tap Open. Then "Mark posted" and paste the link.\n\n' +
    nets.map(function(n){ return (SC.plat(n) || { l: n }).l + ':\n' + SC.captionFor(n, (post.versions || {})[n] || { caption: post.caption, text: post.caption }).slice(0, 400); }).join('\n\n');
  try { await require('../portal.js')._core.officeTodo(id, '📲 Ready to post: ' + s(post.title || 'social post') + ' → ' + names + (post.scheduleAt ? ' (' + C.ctLabel(post.scheduleAt) + ')' : ''), note); } catch (e) {}
  return id;
}

/* ══════════════ 4. LISTINGS (BrightLocal, optional) ══════════════ */
function blSig(){ const exp = Math.floor(nowFn() / 1000) + 1800; return { expires: exp, sig: crypto.createHmac('sha1', env('BRIGHTLOCAL_API_SECRET')).update(env('BRIGHTLOCAL_API_KEY') + exp).digest('base64') }; }
async function listingsSync(by){
  if (!blConfigured()) return { ok: true, dormant: true, note: 'Set BRIGHTLOCAL_API_KEY, BRIGHTLOCAL_API_SECRET and BRIGHTLOCAL_REPORT_ID (a Citation Tracker report) on Netlify to check listings automatically.' };
  const g = blSig();
  const r = await jfetch('https://tools.brightlocal.com/seo-tools/api/v2/ct/get-results?' + form({ 'api-key': env('BRIGHTLOCAL_API_KEY'), sig: g.sig, expires: g.expires, 'report-id': env('BRIGHTLOCAL_REPORT_ID') }), { method: 'GET' });
  if (!r.ok || r.j.success === false) return { ok: false, error: 'BrightLocal: ' + errOf(r) };
  const res = (r.j.response && r.j.response.results) || r.j.results || {};
  const rows = [].concat(arr(res.active), arr(res.citations), arr(res.pending), Array.isArray(res) ? res : []);
  const hits = [];
  rows.forEach(function(c){
    const url = s(c.url || c['citation-url'] || c.link), dom = low(c.domain || c.site || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]);
    const L0 = SC.LISTINGS.find(function(x){ return dom && (dom === x.dom || dom.endsWith('.' + x.dom) || x.dom.endsWith(dom)); }); if (!L0) return;
    hits.push({ id: L0.id, url: url, name: s(c['business-name'] || c.name), address: [s(c.address || c['address1']), s(c.city), s(c.postcode || c.zip)].filter(Boolean).join(', '), phone: s(c.telephone || c.phone), checkedAt: nowIso(), via: 'brightlocal' });
  });
  if (hits.length) await M().update(function(d){ return hits.map(function(h){ const old = M()._get(d, 'listings', h.id) || { id: h.id }; return M()._put(d, 'listings', Object.assign({}, old, h, { by: s(by) || 'BrightLocal' })); }); });
  return { ok: true, updated: hits.length };
}

/* ══════════════ 5. THE APPROVAL STAGE (data, never names) + the scheduled jobs ══════════════ */
/* an admin moves the stage; every change is logged (collection stagelog) */
async function setStage(stage, who, note){
  stage = +stage; if ([1, 2, 3].indexOf(stage) < 0) return { ok: false, error: 'Stage 1, 2 or 3.' };
  let from = 1;
  const w = await M().update(function(d){
    const c0 = M()._get(d, 'cfg', 'main') || { id: 'main' }, a0 = Object.assign({}, c0.apprStage || {});
    from = SC.stageCfg(c0).stage; if (from === stage) return null;
    a0.stage = stage; a0.since = nowIso(); a0.by = low(who && who.email); c0.apprStage = a0; c0.id = 'main'; (d.cfg = d.cfg || {}).main = c0;
    const log = { id: M()._rid('stg'), from: from, to: stage, by: low(who && who.email), name: s(who && who.name), note: s(note).slice(0, 300), when: nowIso() };
    return [['cfg', 'main'], M()._put(d, 'stagelog', log)];
  });
  return w.ok ? { ok: true, from: from, stage: stage, unchanged: !w.changed.length } : { ok: false, error: 'busy' };
}
function adminEmailsOf(data){ return arr(data && data.users).filter(function(u){ return u && u.active !== false && (/^admin$/i.test(s(u.role)) || low(u.payType) === 'owner'); }).map(function(u){ return low(u.email); }); }
/* the graduation hint: marketing approvals decided since the stage began, with "did an admin change it" */
async function stageHint(doc, data){
  const sc = SC.stageCfg(M()._cfg(doc));
  let q = []; try { q = arr((await require('../portal.js')._core.kvListRead('gc_approval_queue') || {}).list); } catch (e) {}
  const admins = adminEmailsOf(data), since = Date.parse(sc.since || 0) || 0;
  const decided = q.filter(function(x){ return x && SC.CONTENT_KINDS[x.kind] && x.status !== 'waiting' && Date.parse(x.updatedAt || x.createdAt || 0) >= since; })
    .map(function(x){ return { at: x.updatedAt || x.createdAt, adminEdit: arr(x.edits).some(function(e){ return admins.indexOf(low(e.email)) >= 0; }) || (x.status === 'rejected' && admins.indexOf(low(x.rejectedEmail)) >= 0) }; });
  M()._recs(doc, 'posts').forEach(function(p){ if (p.adminEditAt && Date.parse(p.adminEditAt) >= since) decided.push({ at: p.adminEditAt, adminEdit: true }); });
  return SC.stageHint(sc, decided, nowFn());
}
async function mailAdmins(data, subject, html){
  const key = env('RESEND_API_KEY'); if (!key) return 0;
  const to = adminEmailsOf(data).filter(function(e, i, a){ return /@grayco-cs\.com$/.test(e) && a.indexOf(e) === i; });
  let n = 0;
  for (const e of to) {
    try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'GrayCo Marketing <news@grayco-cs.com>', to: [e], subject: subject, html: html }) }); if (r.ok) n++; } catch (x) {}
  }
  return n;
}
/* what went out in the last 7 days (the Friday digest) */
function digestHtml(doc, nowMs){
  const since = nowMs - 7 * 864e5, rows = [];
  M()._recs(doc, 'posts').forEach(function(p){ const r = p.results || {}; Object.keys(r).forEach(function(n){ const x = r[n]; if (x && (x.ok || x.manualDone) && Date.parse(x.at || p.postedAt || 0) >= since) rows.push('<tr><td>' + C.esc(C.ctLabel(x.at || p.postedAt)) + '</td><td>' + C.esc((SC.plat(n) || { l: n }).l) + '</td><td>' + C.esc(p.title) + '</td><td>' + (x.url ? '<a href="' + C.esc(x.url) + '">open</a>' : '') + '</td><td>' + C.esc(p.approvedBy || '') + '</td></tr>'); }); });
  M()._recs(doc, 'campaigns').forEach(function(c){ if (c.status === 'sent' && Date.parse(c.sentAt || 0) >= since) rows.push('<tr><td>' + C.esc(C.ctLabel(c.sentAt)) + '</td><td>E-mail</td><td>' + C.esc(c.title || c.subject) + '</td><td>' + C.esc((c.stats && c.stats.sent) || '') + ' sent</td><td>' + C.esc(c.approvedBy || '') + '</td></tr>'); });
  const st = SC.stageCfg(M()._cfg(doc));
  return { n: rows.length, html: '<h2>GrayCo marketing — what went out this week</h2><p>Approval stage: <b>' + C.esc(SC.ASTAGES[st.stage - 1].l) + '</b>. Flagged drafts still came to you on ✅ Approvals.</p>' +
    (rows.length ? '<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr><th align="left">When</th><th align="left">Where</th><th align="left">What</th><th></th><th align="left">Approved by</th></tr>' + rows.join('') + '</table>' : '<p>Nothing went out this week.</p>') +
    '<p style="color:#55626F">Marketing → 🗓 Week plan has every post and its links.</p>' };
}
/* every 15 minutes (mkt-scheduled.js): Sunday → next week's plan; stage 3 → the office's "posting tomorrow" list; Friday afternoon (stage 2 / 3) → the admins' digest */
async function scheduled(o){
  o = o || {};
  const nowMs = nowFn(), p = C.ctParts(nowMs), out = {};
  const doc = await M().readDoc();
  const c = M()._cfg(doc), sc = SC.stageCfg(c), st = M()._get(doc, 'auto', 'soc') || { id: 'soc', plans: {}, tomorrow: {}, digests: {} };
  ['plans', 'tomorrow', 'digests'].forEach(function(k){ st[k] = st[k] || {}; });
  const today = new Date(Date.UTC(p.y, p.mo - 1, p.d)).toISOString().slice(0, 10), wk = C.weekKey(nowMs), ch = {};
  if (c.socPlan && c.socPlan.on === true && ((p.wd === 0 && p.h >= 7) || o.forcePlan)) {
    const next = mondayOf(nowMs, 'next');
    if (!st.plans[next] || o.forcePlan) { out.plan = await planWeek({ week: next }); if (out.plan.ok) { st.plans[next] = nowIso(); ch.plans = 1; } }
  }
  if (sc.stage === 3 && (p.h >= 8 || o.forceTomorrow) && (!st.tomorrow[today] || o.forceTomorrow)) {
    const d2 = out.plan ? await M().readDoc() : doc, until = nowMs + 36 * 3600e3;
    const list = M()._recs(d2, 'posts').filter(function(x){ return x.status === 'approved' && x.scheduleAt && Date.parse(x.scheduleAt) > nowMs && Date.parse(x.scheduleAt) <= until; });
    if (list.length) { try { await require('../portal.js')._core.officeTodo('soc_tomorrow_' + today, '🗓 Posting tomorrow: ' + list.length + ' marketing post' + (list.length > 1 ? 's' : '') + ' — pause or edit within 24 h', list.map(function(x){ return '• ' + C.ctLabel(x.scheduleAt) + ' — ' + s(x.title) + (x.vetoUntil ? ' (veto until ' + C.ctLabel(x.vetoUntil) + ')' : ''); }).join('\n') + '\n\nMarketing → 🗓 Week plan → ⏸ Pause or ✏️ Edit.'); } catch (e) {} }
    out.tomorrow = list.length; st.tomorrow[today] = nowIso(); ch.tomorrow = 1;
  }
  if (sc.stage >= 2 && ((p.wd === 5 && p.h >= 15) || o.forceDigest) && (!st.digests[wk] || o.forceDigest)) {
    let data = {}; try { data = await M().crmData(['users']); } catch (e) {}
    const d = digestHtml(doc, nowMs); out.digest = await mailAdmins(data, 'GrayCo marketing — the week (' + d.n + ' went out)', d.html); out.digestRows = d.n; st.digests[wk] = nowIso(); ch.digest = 1;
  }
  if (Object.keys(ch).length) {
    ['plans', 'tomorrow', 'digests'].forEach(function(k){ const ks = Object.keys(st[k]).sort().slice(-30), o2 = {}; ks.forEach(function(x){ o2[x] = st[k][x]; }); st[k] = o2; });
    await M().update(function(d){ return [M()._put(d, 'auto', Object.assign({}, st, { id: 'soc' }))]; });
  }
  return out;
}

module.exports = { setStage, stageHint, digestHtml, scheduled, status, authUrl, callback, forget, tokens, publishTo, insights, adapt, planWeek, swapPost, readapt, weekApproval, afterWeekApproved, captionsFor, readyTodo,
  listingsSync, mediaToken, readMediaToken, mondayOf, slotsFor, candidates, VTOOL, redirectUri, TK,
  _setNow: function(f){ nowFn = f || function(){ return Date.now(); }; } };
