/* ============================================================================
   GrayCo — 💾 STORAGE: how much the CRM keeps, and the plan limits.   netlify/functions/storage-usage.js  (patch INS3)

   Owner (10/22): "this entire CRM will have lots of memory of files in it, how do we store so much data,
   will we save every year and delete the previous years?"

   GET  (admins)            → { ok, buckets: [{ bucket, year, kind, files, bytes }], totals, dbBytes, settings, needsSql }
   POST {settings} (admins) → saves { storageGb, dbGb, warnPct, archiveOn, archiveYears }
   The numbers come from docs/storage-usage.sql (two read-only functions, service key only). Until it has run
   the card says so and shows the plan limits only. Nothing here moves or deletes a file.
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const L = require('./bid-inbox.js')._lib;
const KEY = 'gc_storage_settings';
const DEF = { storageGb: 100, dbGb: 8, warnPct: 80, archiveOn: false, archiveYears: 3 };
function inbox(){ return require('./bid-inbox.js'); }
function hdr(e, k){ const h = (e && e.headers) || {}; return String(h[k] || h[k.toLowerCase()] || ''); }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function reply(code, headers, o){ return { statusCode: code, headers, body: JSON.stringify(o) }; }
function num(v, d, lo, hi){ if (v == null || v === '') return d; const x = Number(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; }
function clean(o){
  o = o || {};
  return { storageGb: num(o.storageGb, DEF.storageGb, 1, 100000), dbGb: num(o.dbGb, DEF.dbGb, 0.5, 100000), warnPct: num(o.warnPct, DEF.warnPct, 10, 100),
    archiveOn: o.archiveOn === true, archiveYears: Math.round(num(o.archiveYears, DEF.archiveYears, 1, 30)) };
}
/* rows from public.gc_storage_usage() → one row per bucket · year · kind */
function shape(rows){
  return (Array.isArray(rows) ? rows : []).map(r => ({ bucket: String(r.bucket || ''), year: Number(r.yr) || 0, kind: String(r.kind || 'other'), files: Number(r.files) || 0, bytes: Number(r.bytes) || 0 }));
}
function totals(list){
  const t = { files: 0, bytes: 0, byKind: {}, byYear: {}, byBucket: {} };
  list.forEach(r => { t.files += r.files; t.bytes += r.bytes; t.byKind[r.kind] = (t.byKind[r.kind] || 0) + r.bytes; t.byYear[r.year] = (t.byYear[r.year] || 0) + r.bytes; t.byBucket[r.bucket] = (t.byBucket[r.bucket] || 0) + r.bytes; });
  return t;
}
async function rpc(name){
  const r = await L.sb('rpc/' + name, { method: 'POST', body: '{}' });
  if (r.status === 404) return { missing: true };
  if (!r.ok) return { error: 'database answered ' + r.status };
  return { data: await r.json() };
}
async function usage(){
  const a = await rpc('gc_storage_usage'), b = await rpc('gc_db_size');
  const list = a.data ? shape(a.data) : [];
  return { buckets: list, totals: totals(list), dbBytes: b.data != null && !b.missing ? Number(b.data) || 0 : null, needsSql: !!(a.missing || b.missing), error: a.error || b.error || '' };
}
exports.handler = async function(event){
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const q = event.queryStringParameters || {};
    if (event.httpMethod === 'GET' && q.ping === '1') return reply(200, headers, { ok: true, service: 'GrayCo storage' });
    const who = await inbox()._test.staffAuth(event);
    if (!who.ok) return reply(who.code || 401, headers, { ok: false, error: who.error });
    if (!who.admin) return reply(403, headers, { ok: false, error: 'Only an owner or admin can see storage.' });
    if (event.httpMethod === 'POST') {
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
      const st = clean(b.settings); st.updatedBy = who.email; st.updatedAt = L.nowIso();
      await L.kvPut(KEY, st);
      return reply(200, headers, { ok: true, settings: st });
    }
    if (event.httpMethod !== 'GET') return reply(405, headers, { ok: false, error: 'Method not allowed' });
    const st = clean(await L.kvGet(KEY));
    const u = await usage();
    return reply(200, headers, Object.assign({ ok: true, settings: st }, u));
  } catch (e) { return reply(500, headers, { ok: false, error: 'Something went wrong: ' + String(e && e.message || e).slice(0, 120) }); }
};
exports._test = { shape, totals, clean, DEF, usage };
