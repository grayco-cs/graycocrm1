/* netlify/functions/_lib/cc-api.js — patch CCS2: CompanyCam v2 API helpers shared by companycam-sync and
   companycam-webhook. Per CompanyCam's official OpenAPI spec (github.com/CompanyCam/openapi-spec, openapi.yaml):
     • GET /v2/projects: page, per_page, query, status (active|deleted), modified_since = "An ISO8601 formatted date
       and time to return projects modified on or after the provided value" (NOT unix seconds); answers "sorted by
       most recent activity first"; no sort parameter; no per_page maximum stated (photos: default 50, max 100).
     • GET /v2/company: "Retrieve Company" — the cheap "is this token accepted?" call.
   Never returns or records the token itself. */
'use strict';
const CC_API = 'https://api.companycam.com/v2';

/* the token as pasted into Netlify, cleaned: whitespace (also newlines inside), surrounding quotes, a leading
   "Bearer ". shape = what was wrong with it — length and flags only, never the value. */
function cleanToken(raw){
  const orig = raw == null ? '' : String(raw);
  let t = orig.trim(), quotes = false, bearer = false;
  for (let i = 0; i < 3; i++) {
    const m = /^(["'`])([\s\S]*)\1$/.exec(t); if (m) { t = m[2].trim(); quotes = true; }
    if (/^bearer\s+/i.test(t)) { t = t.replace(/^bearer\s+/i, '').trim(); bearer = true; }
  }
  const inner = /\s/.test(t);
  t = t.replace(/\s+/g, '');
  const shape = { len: t.length, rawLen: orig.length, outerSpace: orig !== orig.trim(), innerSpace: inner, quotes, bearer,
    charset: /^[A-Za-z0-9._\-~+/=]+$/.test(t) ? 'ok' : 'odd' };
  shape.malformed = !!(shape.outerSpace || shape.innerSpace || quotes || bearer || shape.charset !== 'ok' || (t && t.length < 20));
  return { token: t, shape };
}
/* unix seconds (or ms, or an ISO string) → ISO8601 "2026-10-22T23:15:00Z" */
function isoOf(v){
  let n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n) || !n) { const p = Date.parse(String(v || '')); n = isFinite(p) ? p / 1000 : 0; }
  else if (n > 1e12) n = n / 1000;
  return new Date(Math.floor(n) * 1000).toISOString().replace(/\.000Z$/, 'Z');
}
function scrub(text, token){
  let s = String(text == null ? '' : text);
  if (token) s = s.split(token).join('…');
  return s.replace(/Bearer\s+\S+/gi, 'Bearer …').replace(/\s+/g, ' ').trim().slice(0, 200);
}
function headers(token){ return { Authorization: 'Bearer ' + token, Accept: 'application/json' }; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function backoffMs(){ const v = Number(process.env.CC_BACKOFF_MS); return isFinite(v) && v >= 0 ? v : 1500; }
/* GET with one retry on a 5xx (or a network error) after a short backoff. Returns { r, status, retried, body? } —
   body is the (scrubbed, trimmed) error text of a failed answer. */
async function getRetry(url, token){
  let retried = false, last = null;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: headers(token) });
      if (r.ok || r.status < 500) {
        if (r.ok) return { r, status: r.status, retried };
        let body = ''; try { body = scrub(await r.text(), token); } catch (e) {}
        return { r: null, status: r.status, retried, body };
      }
      let body = ''; try { body = scrub(await r.text(), token); } catch (e) {}
      last = { r: null, status: r.status, retried, body };
    } catch (e) { last = { r: null, status: 0, retried, body: scrub(e && e.message || e, token) }; }
    if (i === 0) { retried = true; await sleep(backoffMs()); }
  }
  last.retried = true;
  return last;
}
/* is the token accepted at all? (GET /company — independent of the projects list) */
/* accepted === true ONLY for a 200 whose body is a company object (id or name) — a bare 200, an empty answer or HTML
   proves nothing. false = 401 / 403. null = anything else (CompanyCam down, odd answer). */
async function whoami(token){
  const at = new Date().toISOString();
  try {
    const r = await fetch(CC_API + '/company', { headers: headers(token) });
    let name = '', verified = false;
    if (r.ok) { try { const j = await r.json(); if (j && typeof j === 'object' && !Array.isArray(j) && (j.id != null || j.name)) { verified = true; name = String(j.name || '').slice(0, 80); } } catch (e) {} }
    return { at, status: r.status, accepted: verified ? true : (r.status === 401 || r.status === 403) ? false : null, company: name };
  } catch (e) { return { at, status: 0, accepted: null }; }
}
const WHOAMI_KEY = 'gc_cc_whoami';
/* the record of the last real check (service key; never the token) */
async function saveWhoami(rec){
  const url = String(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key || !rec) return false;
  try {
    const r = await fetch(url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key: WHOAMI_KEY, value: { at: rec.at, status: rec.status, accepted: rec.accepted, company: rec.company || '' }, updated_at: new Date().toISOString() }]) });
    return r.ok;
  } catch (e) { return false; }
}
module.exports = { CC_API, cleanToken, isoOf, scrub, getRetry, whoami, saveWhoami, WHOAMI_KEY, headers };
