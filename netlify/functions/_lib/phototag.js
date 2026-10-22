/* ============================================================================
   GrayCo — AI PHOTO TAGS.   netlify/functions/_lib/phototag.js   (patch X12)

   New job photos — GrayCo Photos records in gc_kv "gc_photos" (their files in crm-files) and the recent CompanyCam
   photos of the CRM's CompanyCam jobs — get a stage (before / tear-off / decking / underlayment / dry-in / install /
   final / punch), damage words, materials and the area, read by the vision model from a small thumbnail.
   The tags live in their own store, gc_kv "gc_photo_ai" ({ map: { photoKey: tags }, day, count }), never inside the
   photo records (so the photo list's own sync is never touched). Photo keys: the GrayCo Photos record id, or
   "cc:<CompanyCam photo id>". A photo is tagged once. At most PHOTO_TAG_DAILY_MAX a day (default 300).
   No ANTHROPIC_API_KEY → nothing happens (dormant).
   ========================================================================== */
'use strict';
const X = require('./x12.js');
const KV = 'gc_photo_ai', BATCH = 12;
const GC_SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function sbUrl(){ return (env('SUPABASE_URL') || GC_SB).replace(/\/$/, ''); }
function sbKey(){ return env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY'); }
function H(extra){ const k = sbKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k }, extra || {}); }
function day(){ return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }   /* Central-ish */

async function kvGet(key, f){ f = f || fetch; try { const r = await f(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: H() }); if (!r.ok) return null; const rows = await r.json(); let v = rows && rows[0] && rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; } catch (e) { return null; } }
async function kvPut(key, value, f){ f = f || fetch; const r = await f(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) }); return r.ok; }
/* gc_photos may be one value or chunked (__manifest + __chunkN) — read either */
async function photoRecords(f){
  let v = await kvGet('gc_photos', f);
  if (v && !Array.isArray(v) && Array.isArray(v.recs)) v = v.recs;
  if (!Array.isArray(v)) { const man = await kvGet('gc_photos__manifest', f); const n = man && (man.chunks || man.n || (Array.isArray(man.keys) ? man.keys.length : 0)); v = []; for (let i = 0; i < (n || 0) && i < 40; i++) { const c = await kvGet('gc_photos__chunk' + i, f); const a = Array.isArray(c) ? c : c && Array.isArray(c.recs) ? c.recs : []; v = v.concat(a); } }
  return arr(v).filter(function(r){ return r && r.id && r.deleted !== true && r.source !== 'ccflag' && (r.thumbRef || r.ref); });
}
/* a small picture: the storage's resize when it has one, else the thumbnail file itself (under 4 MB) */
async function imageB64(ref, f){
  f = f || fetch; const path = s(ref).replace(/^sb:crm-files\//, ''); if (!path || /\.(pdf|esx|zip)$/i.test(path)) return null;
  const tries = [sbUrl() + '/storage/v1/render/image/authenticated/crm-files/' + path + '?width=640&quality=60', sbUrl() + '/storage/v1/object/crm-files/' + path];
  for (const u of tries) { try { const r = await f(u, { headers: H() }); if (!r.ok) continue; const ct = s(r.headers.get('content-type')).split(';')[0] || 'image/jpeg'; if (!/^image\/(jpeg|png|webp|gif)$/.test(ct)) continue; const b = Buffer.from(await r.arrayBuffer()); if (!b.length || b.length > 4.5e6) continue; return { media: ct, data: b.toString('base64') }; } catch (e) {} }
  return null;
}
async function urlB64(url, f){ f = f || fetch; try { const r = await f(url); if (!r.ok) return null; const ct = s(r.headers.get('content-type')).split(';')[0] || 'image/jpeg'; if (!/^image\//.test(ct)) return null; const b = Buffer.from(await r.arrayBuffer()); if (!b.length || b.length > 4.5e6) return null; return { media: ct === 'image/jpg' ? 'image/jpeg' : ct, data: b.toString('base64') }; } catch (e) { return null; } }
/* recent CompanyCam photos of the CRM's CompanyCam jobs (thumbnails) */
async function ccPhotos(projects, f){
  const token = env('COMPANYCAM_TOKEN'); if (!token) return [];
  f = f || fetch; const out = [];
  const jobs = arr(projects).filter(function(p){ return p && !p.deleted && (p.ccProjectId || p.ccamId) && !/complete|closed|archiv/i.test(s(p.status)); }).slice(0, 25);
  for (const p of jobs) {
    try {
      const r = await f('https://api.companycam.com/v2/projects/' + encodeURIComponent(s(p.ccProjectId || p.ccamId)) + '/photos?per_page=30', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
      if (!r.ok) continue; const list = await r.json();
      arr(list).forEach(function(ph){ if (!ph || ph.id == null || !Array.isArray(ph.uris)) return; const by = {}; ph.uris.forEach(function(u){ if (u && u.type) by[u.type] = s(u.uri || u.url); }); const t = by.thumbnail || by.web; if (t && /^https:\/\//.test(t)) out.push({ key: 'cc:' + ph.id, jobId: s(p.id), url: t, note: s(ph.description) }); });
    } catch (e) {}
  }
  return out;
}

const PROMPT = 'A photo from a GrayCo Construction Services job site (roofing, water/fire restoration, remodeling). Tag it with tag_photo: the stage it shows, any damage, visible materials, the area. If unsure, stage "other".';
/* tag up to `limit` new photos; returns { tagged, skipped, left, why } */
async function run(opts){
  opts = opts || {}; const f = opts.fetch || fetch;
  if (!env('ANTHROPIC_API_KEY') && !opts.ai) return { tagged: 0, why: 'dormant: ANTHROPIC_API_KEY is not set' };
  if (!sbKey()) return { tagged: 0, why: 'database not configured' };
  const st = Object.assign({ map: {}, day: '', count: 0, total: 0 }, (await kvGet(KV, f)) || {});
  if (st.day !== day()) { st.day = day(); st.count = 0; }
  const cap = X.dailyMax(), room = Math.max(0, cap - st.count);
  if (!room) return { tagged: 0, why: 'daily limit reached (' + cap + ')', count: st.count, cap };
  const recs = (await photoRecords(f)).filter(function(r){ return !st.map[r.id]; }).sort(function(a, b){ return s(b.at || b.addedAt) < s(a.at || a.addedAt) ? -1 : 1; });
  let todo = recs.map(function(r){ return { key: r.id, jobId: s(r.jobId), ref: r.thumbRef || r.ref, note: [r.note, r.caption, r.tag].map(s).join(' ') }; });
  if (todo.length < BATCH) { const cc = await ccPhotos((await kvGet('projects', f)) || [], f); todo = todo.concat(cc.filter(function(x){ return !st.map[x.key]; })); }
  todo = todo.slice(0, Math.min(room, opts.limit || BATCH));
  let tagged = 0, failed = 0;
  for (const it of todo) {
    const img = it.ref ? await imageB64(it.ref, f) : await urlB64(it.url, f);
    if (!img) { st.map[it.key] = { skip: 'no picture', at: new Date().toISOString() }; failed++; continue; }
    const call = opts.ai ? await opts.ai(it, img) : await X.aiTool(X.PHOTO_TOOL, [{ type: 'image', source: { type: 'base64', media_type: img.media, data: img.data } }, { type: 'text', text: PROMPT + (it.note ? '\nThe photo\'s own note: ' + it.note.slice(0, 200) : '') }], { max: 300, fetch: opts.aiFetch });
    if (!call || !call.ok) { failed++; if (call && /limit|429|5\d\d|timed out|unreachable/.test(call.why || '')) break; continue; }
    const t = X.cleanTag(call.input); t.jobId = it.jobId; t.at = new Date().toISOString(); t.words = X.tagWords(Object.assign({}, call.input, { stage: t.stage }));
    st.map[it.key] = t; st.count++; st.total = (st.total || 0) + 1; tagged++;
  }
  /* keep the store small: the newest 6000 tags */
  const keys = Object.keys(st.map); if (keys.length > 6000) keys.sort(function(a, b){ return s(st.map[a].at) < s(st.map[b].at) ? -1 : 1; }).slice(0, keys.length - 6000).forEach(function(k){ delete st.map[k]; });
  st.last = { at: new Date().toISOString(), tagged, failed };
  if (tagged || failed) await kvPut(KV, st, f);
  return { tagged, failed, count: st.count, cap, left: Math.max(0, recs.length - tagged) };
}
async function usage(f){ const st = (await kvGet(KV, f)) || {}; return { day: st.day === day() ? st.day : day(), today: st.day === day() ? st.count || 0 : 0, cap: X.dailyMax(), total: st.total || Object.keys(st.map || {}).length, last: st.last || null, ai: !!env('ANTHROPIC_API_KEY') }; }
module.exports = { run, usage, KV, photoRecords };
