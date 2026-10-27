/* ── Google sign-ins, server only (patch GTOK) ─────────────────────────────────────────────────────────────────────
   Each person's "Connect Google" (gcal-oauth: Calendar + Drive, read only) leaves a refresh token. Those used to sit in
   gc_kv "gcal_token_<name>", which every signed-in staff browser could read. They now live in the service-only table
   gc_lead_inbox_kv (docs/lead-inbox.sql: Row Level Security on, no rules — only the service key gets in), same key name.
     · get(user)  — the safe copy; an old gc_kv copy is moved over and deleted the first time it is read.
     · set(user)  — writes the safe copy (and removes any gc_kv copy). Only before that table exists does it fall back
                    to gc_kv; docs/google-tokens.sql then makes those rows unreadable to every browser.
     · list()     — every connected person (gcal-sync), moving old copies on the way.
     · status()   — for the admin panel: where tokens live and whether docs/google-tokens.sql still has to run.
   The browser never sees a token: only "connected ✓ / not connected". */
'use strict';
const PFX = 'gcal_token_';
const SAFE = 'gc_lead_inbox_kv';
const s = v => (v == null ? '' : String(v));
function sbUrl(){ return s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function sbKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function H(extra){ const k = sbKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k }, extra || {}); }
function parse(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

let SAFE_OK = null;                                  /* does the service-only table exist? (asked once per warm function) */
async function safeOk(){
  if (SAFE_OK !== null) return SAFE_OK;
  if (!sbKey()) return false;
  try { const r = await fetch(sbUrl() + '/rest/v1/' + SAFE + '?select=key&limit=1', { headers: H() }); SAFE_OK = r.ok; } catch (e) { return false; }
  return SAFE_OK;
}
async function readRow(table, key){
  try {
    const r = await fetch(sbUrl() + '/rest/v1/' + table + '?select=value&key=eq.' + encodeURIComponent(key), { headers: H() });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? parse(rows[0].value) : null;
  } catch (e) { return null; }
}
async function readAll(table){
  try {
    const r = await fetch(sbUrl() + '/rest/v1/' + table + '?select=key,value&key=like.' + encodeURIComponent(PFX + '*'), { headers: H() });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows.filter(x => x && s(x.key).indexOf(PFX) === 0) : [];
  } catch (e) { return []; }
}
async function write(table, key, value){
  const row = { key: key, value: value };
  if (table === SAFE) row.updated_at = new Date().toISOString();
  try {
    const r = await fetch(sbUrl() + '/rest/v1/' + table + '?on_conflict=key', { method: 'POST',
      headers: H({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(row) });
    return r.ok;
  } catch (e) { return false; }
}
async function del(table, key){
  try { const r = await fetch(sbUrl() + '/rest/v1/' + table + '?key=eq.' + encodeURIComponent(key), { method: 'DELETE', headers: H({ Prefer: 'return=minimal' }) }); return r.ok; }
  catch (e) { return false; }
}
/* an old gc_kv copy → the safe table (the newer safe copy wins), then the gc_kv copy is deleted. Never deletes unless the safe copy exists. */
async function moveOld(key, value){
  if (!(await safeOk())) return false;
  const have = await readRow(SAFE, key);
  if (!have && !(await write(SAFE, key, value))) return false;
  return del('gc_kv', key);
}

async function get(user){
  const key = PFX + s(user);
  if (!s(user)) return null;
  if (await safeOk()) { const v = await readRow(SAFE, key); if (v) return v; }
  const old = await readRow('gc_kv', key);
  if (old) await moveOld(key, old);
  return old;
}
async function set(user, tok){
  const key = PFX + s(user);
  if (!s(user) || !tok || typeof tok !== 'object') return false;
  if (await safeOk()) { const ok = await write(SAFE, key, tok); if (ok) await del('gc_kv', key); return ok; }
  return write('gc_kv', key, tok);                    /* only until docs/lead-inbox.sql / google-tokens.sql has run */
}
async function list(){
  const out = {};
  const safe = await safeOk();
  if (safe) (await readAll(SAFE)).forEach(r => { const v = parse(r.value); if (v) out[r.key] = v; });
  for (const r of await readAll('gc_kv')) {
    const v = parse(r.value);
    if (!v) continue;
    if (!out[r.key]) out[r.key] = v;
    if (safe) await moveOld(r.key, out[r.key]);
  }
  return Object.keys(out).map(k => ({ key: k, user: k.slice(PFX.length), value: out[k] }));
}
async function status(){
  const safe = await safeOk();
  const old = (await readAll('gc_kv')).length;
  if (safe && old) await list();                      /* moving them is cheap: do it now */
  const left = safe && old ? (await readAll('gc_kv')).length : old;
  return { safe: safe, oldCopies: left, needsSql: !safe || left > 0,
    connected: safe ? (await readAll(SAFE)).length : left };
}

module.exports = { PFX, SAFE, get, set, list, status, _t: { reset: () => { SAFE_OK = null; } } };
