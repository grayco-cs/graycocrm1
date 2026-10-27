/* ── GrayCo social posting (patch MKT) — Facebook Page, Instagram Business, Google Business Profile ──
   Owner (21 Oct 2026): "You can post for me? That's what I need."
   Every key comes from Netlify environment variables (docs/SOCIAL-SETUP.md); none is ever in a file or sent
   to the browser. status() only says which networks are connected (true / false).

   * One key for everything (optional): AYRSHARE_API_KEY — when set, Ayrshare posts to every network
     (Facebook, Instagram, Google Business, and LinkedIn / TikTok if linked there).
   * Facebook Page:   META_PAGE_ID + META_PAGE_TOKEN (a long-lived PAGE token)  → /{page}/photos or /{page}/feed
   * Instagram:       META_IG_USER_ID (+ the same page token)                   → /{ig}/media + /{ig}/media_publish
   * Google Business: GBP_ACCOUNT_ID + GBP_LOCATION_ID + GBP_REFRESH_TOKEN and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
     (the CRM's Google OAuth app — gcal-oauth.js uses the same two) → v4 localPosts; reviews read + reply.
   Nothing here decides WHETHER to post: _lib/mkt.js only calls publish() for a post an admin approved, and it
   runs the address / carrier guard first. publish() runs the guard again and refuses on any problem. */
'use strict';
const C = require('./mkt-content.js');

const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v21.0');
const GBP_V4 = 'https://mybusiness.googleapis.com/v4';
const AYR = 'https://api.ayrshare.com/api';
function s(v){ return v == null ? '' : String(v).trim(); }
function env(k){ return s(process.env[k]); }

function status(){
  const ayr = !!env('AYRSHARE_API_KEY');
  const fb = !!(env('META_PAGE_ID') && env('META_PAGE_TOKEN'));
  const ig = !!(env('META_IG_USER_ID') && env('META_PAGE_TOKEN'));
  const gbp = !!(env('GBP_ACCOUNT_ID') && env('GBP_LOCATION_ID') && env('GBP_REFRESH_TOKEN') && env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));
  return { ayrshare: ayr, facebook: ayr || fb, instagram: ayr || ig, gbp: ayr || gbp, direct: { facebook: fb, instagram: ig, gbp: gbp }, any: ayr || fb || ig || gbp,
    gbpReviews: gbp };
}

async function jfetch(url, opts){
  let r, t = '', j = {};
  try { r = await fetch(url, opts); t = await r.text(); } catch (e) { return { ok: false, status: 0, j: { error: { message: 'no answer (' + s(e && e.message) + ')' } } }; }
  try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { raw: t.slice(0, 300) }; }
  return { ok: r.ok, status: r.status, j: j };
}
function errOf(res){ const e = res.j && (res.j.error || res.j.errors); return s((e && (e.message || e.error_user_msg || (Array.isArray(e) && e[0] && e[0].message))) || res.j.message || res.j.raw || ('HTTP ' + res.status)).slice(0, 300); }
function form(o){ const p = new URLSearchParams(); Object.keys(o).forEach(function(k){ if (o[k] != null && o[k] !== '') p.append(k, String(o[k])); }); return p; }

/* ── Facebook Page ── */
async function postFacebook(caption, imageUrl, link){
  const page = env('META_PAGE_ID'), tok = env('META_PAGE_TOKEN');
  const res = imageUrl
    ? await jfetch(GRAPH + '/' + encodeURIComponent(page) + '/photos', { method: 'POST', body: form({ url: imageUrl, caption: caption, access_token: tok }) })
    : await jfetch(GRAPH + '/' + encodeURIComponent(page) + '/feed', { method: 'POST', body: form({ message: caption, link: link || '', access_token: tok }) });
  if (!res.ok) return { ok: false, error: 'Facebook: ' + errOf(res) };
  const pid = s(res.j.post_id || res.j.id);
  return { ok: true, id: pid, url: pid ? 'https://www.facebook.com/' + pid : '' };
}
/* ── Instagram Business (needs a picture) ── */
async function postInstagram(caption, imageUrl){
  if (!imageUrl) return { ok: false, error: 'Instagram needs a picture.' };
  const ig = env('META_IG_USER_ID'), tok = env('META_PAGE_TOKEN');
  const c = await jfetch(GRAPH + '/' + encodeURIComponent(ig) + '/media', { method: 'POST', body: form({ image_url: imageUrl, caption: caption, access_token: tok }) });
  if (!c.ok || !c.j.id) return { ok: false, error: 'Instagram: ' + errOf(c) };
  const p = await jfetch(GRAPH + '/' + encodeURIComponent(ig) + '/media_publish', { method: 'POST', body: form({ creation_id: c.j.id, access_token: tok }) });
  if (!p.ok || !p.j.id) return { ok: false, error: 'Instagram: ' + errOf(p) };
  let url = '';
  const l = await jfetch(GRAPH + '/' + encodeURIComponent(p.j.id) + '?fields=permalink&access_token=' + encodeURIComponent(tok), { method: 'GET' });
  if (l.ok) url = s(l.j.permalink);
  return { ok: true, id: s(p.j.id), url: url };
}
/* ── Google Business Profile ── */
let gTok = null;
async function googleToken(){
  if (gTok && gTok.exp > Date.now() + 60e3) return gTok.v;
  const r = await jfetch('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: env('GBP_REFRESH_TOKEN'), grant_type: 'refresh_token' }) });
  if (!r.ok || !r.j.access_token) throw new Error('Google sign-in for the Business Profile failed: ' + errOf(r));
  gTok = { v: r.j.access_token, exp: Date.now() + (+r.j.expires_in || 3000) * 1000 };
  return gTok.v;
}
function gbpBase(){ return GBP_V4 + '/accounts/' + encodeURIComponent(env('GBP_ACCOUNT_ID')) + '/locations/' + encodeURIComponent(env('GBP_LOCATION_ID')); }
async function postGbp(caption, imageUrl, link){
  let tok; try { tok = await googleToken(); } catch (e) { return { ok: false, error: s(e.message) }; }
  const body = { languageCode: 'en-US', summary: C.gbpFromCaption(caption), topicType: 'STANDARD',
    callToAction: { actionType: link ? 'LEARN_MORE' : 'CALL', url: link || undefined } };
  if (imageUrl) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }];
  const r = await jfetch(gbpBase() + '/localPosts', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return { ok: false, error: 'Google Business: ' + errOf(r) };
  return { ok: true, id: s(r.j.name), url: s(r.j.searchUrl) };
}
async function gbpReviews(){
  const tok = await googleToken();
  const r = await jfetch(gbpBase() + '/reviews?pageSize=50', { method: 'GET', headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('Google reviews: ' + errOf(r));
  const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return (r.j.reviews || []).map(function(x){ return { gid: s(x.reviewId || x.name), author: s(x.reviewer && x.reviewer.displayName), rating: STARS[x.starRating] || +x.starRating || 0,
    text: s(x.comment), date: s(x.createTime).slice(0, 10), replied: !!(x.reviewReply && x.reviewReply.comment), reply: s(x.reviewReply && x.reviewReply.comment) }; });
}
async function gbpReply(reviewId, text){
  const tok = await googleToken();
  const r = await jfetch(gbpBase() + '/reviews/' + encodeURIComponent(reviewId) + '/reply', { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: s(text).slice(0, 4000) }) });
  return r.ok ? { ok: true } : { ok: false, error: 'Google reply: ' + errOf(r) };
}
/* ── Ayrshare (one key, every network) ── */
const AYR_NET = { facebook: 'facebook', instagram: 'instagram', gbp: 'gmb' };
async function postAyrshare(caption, imageUrl, networks){
  const platforms = networks.map(function(n){ return AYR_NET[n]; }).filter(Boolean);
  const body = { post: caption, platforms: platforms };
  if (imageUrl) body.mediaUrls = [imageUrl];
  const r = await jfetch(AYR + '/post', { method: 'POST', headers: { Authorization: 'Bearer ' + env('AYRSHARE_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = {};
  const ids = (r.j && (r.j.postIds || (r.j.posts && r.j.posts[0] && r.j.posts[0].postIds))) || [];
  networks.forEach(function(n){
    const hit = ids.find(function(x){ return x && x.platform === AYR_NET[n]; });
    out[n] = hit && (hit.status === 'success' || hit.id) ? { ok: true, id: s(hit.id), url: s(hit.postUrl), via: 'ayrshare', ayrId: s(r.j.id) } : { ok: false, error: 'Ayrshare: ' + (r.ok ? 'not posted to ' + n : errOf(r)) };
  });
  return out;
}

/* post = { caption, captions: { network: its own caption } (patch SOC), imageUrl, networks:[facebook|instagram|gbp|tiktok|linkedin], link,
   extra:[job addresses], names:[customer names], nameOk } → { facebook:{ok,id,url}|{ok:false,error}, … }
   patch SOC: every platform posts ITS version (the week plan writes one per platform); TikTok and LinkedIn go through _lib/soc.js. */
const SOC_NET = { tiktok: 1, linkedin: 1 };
async function publish(post){
  post = post || {};
  const nets = (post.networks || []).filter(function(n){ return AYR_NET[n] || SOC_NET[n]; });
  const capOf = function(n){ return s((post.captions && post.captions[n]) || post.caption); };
  if (!nets.length) return { _error: 'No network picked.' };
  if (!nets.some(function(n){ return capOf(n); })) return { _error: 'No caption.' };
  const SC = require('./soc-content.js'), rules = { addresses: post.extra || [], names: post.names || [], nameOk: !!post.nameOk };
  const problems = []; nets.forEach(function(n){ C.guard(capOf(n), post.extra || []).concat(SC.problems(capOf(n), rules)).forEach(function(p){ if (problems.indexOf(p.l) < 0) problems.push(p.l); }); });
  if (problems.length) return { _error: 'Not posted: ' + problems.join(' ') };
  const st = status(), out = {};
  const meta = nets.filter(function(n){ return AYR_NET[n]; });
  if (meta.length && env('AYRSHARE_API_KEY')) {
    const groups = {}; meta.forEach(function(n){ (groups[capOf(n)] = groups[capOf(n)] || []).push(n); });
    for (const cap of Object.keys(groups)) Object.assign(out, await postAyrshare(cap, s(post.imageUrl), groups[cap]));
  } else {
    for (const n of meta) {
      const caption = capOf(n);
      if (n === 'facebook') out.facebook = st.direct.facebook ? await postFacebook(caption, s(post.imageUrl), s(post.link)) : { ok: false, error: 'Facebook is not connected (META_PAGE_ID / META_PAGE_TOKEN).' };
      if (n === 'instagram') out.instagram = st.direct.instagram ? await postInstagram(caption, s(post.imageUrl)) : { ok: false, error: 'Instagram is not connected (META_IG_USER_ID).' };
      if (n === 'gbp') out.gbp = st.direct.gbp ? await postGbp(caption, s(post.imageUrl), s(post.link)) : { ok: false, error: 'Google Business is not connected (GBP_* keys).' };
    }
  }
  for (const n of nets.filter(function(x){ return SOC_NET[x]; })) out[n] = await require('./soc.js').publishTo(n, capOf(n), s(post.imageUrl), post);
  return out;
}

/* results once the APIs return them: likes, comments, reach, clicks (whatever each network gives) */
async function insights(results){
  const out = {};
  const tok = env('META_PAGE_TOKEN');
  try {
    if (results.facebook && results.facebook.ok && results.facebook.id && tok) {
      const r = await jfetch(GRAPH + '/' + encodeURIComponent(results.facebook.id) + '?fields=likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions_unique,post_clicks)&access_token=' + encodeURIComponent(tok), { method: 'GET' });
      if (r.ok) {
        const ins = {}; ((r.j.insights && r.j.insights.data) || []).forEach(function(m){ ins[m.name] = m.values && m.values[0] && m.values[0].value; });
        out.facebook = { likes: (r.j.likes && r.j.likes.summary && r.j.likes.summary.total_count) || 0, comments: (r.j.comments && r.j.comments.summary && r.j.comments.summary.total_count) || 0,
          shares: (r.j.shares && r.j.shares.count) || 0, reach: ins.post_impressions_unique || 0, clicks: ins.post_clicks || 0 };
      }
    }
    if (results.instagram && results.instagram.ok && results.instagram.id && tok) {
      const r = await jfetch(GRAPH + '/' + encodeURIComponent(results.instagram.id) + '?fields=like_count,comments_count,insights.metric(reach)&access_token=' + encodeURIComponent(tok), { method: 'GET' });
      if (r.ok) { const reach = (((r.j.insights && r.j.insights.data) || [])[0] || {}).values; out.instagram = { likes: r.j.like_count || 0, comments: r.j.comments_count || 0, reach: (reach && reach[0] && reach[0].value) || 0 }; }
    }
    const ayrId = ['facebook', 'instagram', 'gbp'].map(function(n){ return results[n] && results[n].ayrId; }).filter(Boolean)[0];
    if (ayrId && env('AYRSHARE_API_KEY')) {
      const r = await jfetch(AYR + '/analytics/post', { method: 'POST', headers: { Authorization: 'Bearer ' + env('AYRSHARE_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ayrId }) });
      if (r.ok) ['facebook', 'instagram'].forEach(function(n){ const a = r.j[n] && r.j[n].analytics; if (a) out[n] = { likes: a.likeCount || a.reactions && a.reactions.total || 0, comments: a.commentsCount || 0, reach: a.reach || a.impressionsUnique || 0, clicks: a.clicks || 0 }; });
    }
  } catch (e) {}
  return out;
}

module.exports = { status: status, publish: publish, insights: insights, gbpReviews: gbpReviews, gbpReply: gbpReply, _reset: function(){ gTok = null; } };
