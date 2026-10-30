/* netlify/functions/_lib/cc-vis.js — patch CCPHOTOS2: who sees a CompanyCam photo, the same rule everywhere (the CRM's
   GrayCo Photos, the customer portal, the GC link, the sub portal).

   Owner (10/30): "Company cam photos / Grayco are clicked for customer to see or not".

   Before: every CompanyCam photo was on the customer portal unless a person hid it (flag record ccf_<id>, shared:false).
   Now customer visibility is a click, like GrayCo's own uploads (SUBPHOTOS asks Yes / No on each one):
     • a CompanyCam photo put into CompanyCam AFTER this release ("since", gc_kv "ccvis", stamped the first time the new code
       runs) is NOT shown to the customer until someone clicks "Customer can see" on it, or "Show all of this job's photos to
       the customer" on its job;
     • a photo from before keeps what it had: shown, unless a person hid it — nothing a customer was already shown is pulled.
   The choices, newest wins (all in gc_kv "gc_photos", records with source 'ccflag', so no photo list ever counts them):
     • per photo  — "ccf_<CompanyCam id>": { shared: true | false, hideSubs, visAt }      (the old flag records, unchanged)
     • per job    — "ccj_<CRM job id>":   { mode: 'show' | 'hide', at, upto }            (covers the photos put in up to
                    "upto" (unix seconds) — a photo that comes in later still waits for its own click)
   A photo's time is when it went into CompanyCam (the later of captured_at / created_at).
   Subs: "Subs see it" (hideSubs) wins; not set → the same as the customer (as for GrayCo's own photos). */
'use strict';
const KEY = 'ccvis';

function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function secOf(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  const n = Number(v); if (isFinite(n) && String(v).trim() !== '') return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const d = Date.parse(v); return isNaN(d) ? 0 : Math.floor(d / 1000);
}
/* when a CompanyCam photo went into CompanyCam (unix seconds) */
function upOf(ph){ return Math.max(secOf(ph && ph.captured_at), secOf(ph && ph.created_at)); }
function sinceOf(v){ v = obj(typeof v === 'string' ? (function(){ try { return JSON.parse(v); } catch (e) { return {}; } })() : v); return secOf(v.since); }
function stampOf(r){ return s(r && (r.visAt || r.updatedAt || r.at)); }

/* gc_photos → { flags: { ccId: rec }, jobs: { jobId: rec } } */
function index(recs){
  const flags = {}, jobs = {};
  arr(recs).forEach(function(r){
    if (!r || r.source !== 'ccflag') return;
    if (s(r.ccId)) flags[s(r.ccId)] = r;
    else if (/^ccj_/.test(s(r.id)) && s(r.jobId)) jobs[s(r.jobId)] = r;
  });
  return { flags: flags, jobs: jobs };
}
function jobRule(ix, jobId, up){
  const j = ix && ix.jobs[s(jobId)];
  if (!j || j.deleted === true || (j.mode !== 'show' && j.mode !== 'hide')) return null;
  return (+up || 0) <= (+j.upto || 0) ? j : null;
}
/* does the customer see this CompanyCam photo? */
function customerSees(ccId, up, jobId, ix, since){
  const f = ix && ix.flags[s(ccId)], j = jobRule(ix, jobId, up);
  const fa = f && f.deleted !== true && f.shared != null ? stampOf(f) : '';
  if (fa && (!j || fa > s(j.at))) return f.shared === true;
  if (j) return j.mode === 'show';
  return !(since > 0 && (+up || 0) >= since);
}
function subsSee(ccId, up, jobId, ix, since){
  const f = ix && ix.flags[s(ccId)], h = f && f.deleted !== true ? f.hideSubs : undefined;
  if (h === true) return false; if (h === false) return true;
  return customerSees(ccId, up, jobId, ix, since);
}

/* the moment "new" starts: gc_kv ccvis.since — written once (never moved by a later run) the first time it is needed */
let sinceCache = null;
async function ensureSince(opts){
  opts = opts || {};
  if (sinceCache && Date.now() - sinceCache.at < 10 * 60e3 && !opts.fresh) return sinceCache.since;
  const url = s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), key = s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) return 0;
  const H = { apikey: key, Authorization: 'Bearer ' + key };
  async function read(){
    const r = await fetch(url + '/rest/v1/gc_kv?select=key,value&key=in.(%22' + KEY + '%22)', { headers: H });
    if (!r.ok) return null;
    const rows = arr(await r.json()); return rows[0] ? sinceOf(rows[0].value) : 0;
  }
  try {
    let v = opts.known != null ? sinceOf(opts.known) : await read();
    if (v === 0) {
      const at = new Date().toISOString();
      await fetch(url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }, H),
        body: JSON.stringify([{ key: KEY, value: { since: at, by: s(opts.who) || 'server', note: 'CompanyCam photos put in after this moment wait for "Customer can see" (patch CCPHOTOS2)' }, updated_at: at }]) });
      v = (await read()) || secOf(at);
    }
    if (v) sinceCache = { at: Date.now(), since: v };
    return v || 0;
  } catch (e) { return sinceCache ? sinceCache.since : 0; }
}

/* ── a job's CompanyCam photos for the customer / the GC link / a sub: the server's index (with GrayCo's own copies) first,
   CompanyCam itself when the project is not indexed yet ──
   deps: { kvRead(keys) → {key: value}, signRefs(refs) → {ref: url}, live(ccId) → [{ ccId, t, f, at, up }] }
   → [{ id: 'cc_<id>', t, f, at (YYYY-MM-DD), src: 'companycam' }] newest first, at most opts.max */
function ymd(sec){ return sec ? new Date(sec * 1000).toISOString().slice(0, 10) : ''; }
function unpackThumb(x, w){ if (!x) return w; if (typeof x === 'string') return x; if (Array.isArray(x) && x.length === 3) return w.slice(0, x[0]) + x[2] + w.slice(w.length - x[1]); return w; }
function httpsOnly(u){ const t = s(u); return /^https:\/\/[^\s"'<>]+$/i.test(t) ? t : ''; }
const NAME_RE = /^[0-9a-f]{64}\.(jpg|jpeg|png|webp)$/;
function refOf(name){ return NAME_RE.test(s(name)) ? 'sb:crm-files/' + s(name) : ''; }
/* a stored copy: g[id] = [web file, thumb file | 0, bytes, removedAt?] */
function copyOf(g, id){ const c = obj(g)[s(id)]; if (!Array.isArray(c)) return null; const f = refOf(c[0]); if (!f) return null; return { f: f, t: refOf(c[1]) || f, removed: +c[3] || 0 }; }
function fromRow(row){
  row = obj(row);
  return arr(row.ph).map(function(x){
    if (!Array.isArray(x)) return null;
    const id = s(x[0]), web = httpsOnly(x[2]), cap = +x[1] || 0;
    return { ccId: id, f: web, t: httpsOnly(unpackThumb(x[3], s(x[2]))) || web, up: Math.max(cap, +x[7] || 0), cap: cap };
  }).filter(Boolean);
}
async function photosFor(p, recs, audience, deps, opts){
  opts = opts || {};
  const ccId = s(opts.ccId), jobId = s(p && p.id);
  if (!/^\d{3,}$/.test(ccId)) return [];
  const ix = index(recs), since = await ensureSince({ who: audience });
  let row = null; try { row = obj((await deps.kvRead(['ccidx:' + ccId]))['ccidx:' + ccId]); } catch (e) { row = {}; }
  let list = null;
  if (row.done === true && Array.isArray(row.ph)) list = fromRow(row);
  else {
    let live = []; try { live = arr(await deps.live(ccId)); } catch (e) { live = []; }
    list = live.length ? live.map(function(c){ return { ccId: s(c.ccId || s(c.id).replace(/^cc_/, '')), f: httpsOnly(c.f), t: httpsOnly(c.t) || httpsOnly(c.f), up: +c.up || 0, cap: +c.cap || +c.up || 0 }; })
      : fromRow(row);
  }
  const see = audience === 'sub' ? subsSee : customerSees;
  const seen = {};
  let pick = list.filter(function(x){
    if (!x || !x.ccId || seen[x.ccId]) return false; seen[x.ccId] = 1;
    const c = copyOf(row.g, x.ccId); x.copy = c;
    if (!c && !x.f) return false;
    return see(x.ccId, x.up, jobId, ix, since);
  });
  pick.sort(function(a, b){ return (b.cap || 0) - (a.cap || 0); });
  pick = pick.slice(0, opts.max || 600);
  /* GrayCo's own copy when there is one (it outlives CompanyCam): short-lived signed links, only for what is shown */
  const refs = []; pick.forEach(function(x){ if (x.copy) refs.push(x.copy.f, x.copy.t); });
  const signed = {};
  for (let i = 0; i < refs.length; i += 100) { try { Object.assign(signed, await deps.signRefs(refs.slice(i, i + 100))); } catch (e) {} }
  return pick.map(function(x){
    const f = (x.copy && signed[x.copy.f]) || x.f, t = (x.copy && (signed[x.copy.t] || signed[x.copy.f])) || x.t || f;
    if (!f) return null;
    const o = { id: 'cc_' + x.ccId, t: t, f: f, at: ymd(x.cap || x.up), src: 'companycam' };
    if (x.copy && signed[x.copy.f]) o.copy = true;
    return o;
  }).filter(Boolean);
}
module.exports = { KEY, index, customerSees, subsSee, ensureSince, sinceOf, upOf, stampOf, photosFor, copyOf, fromRow, refOf, secOf, _reset: function(){ sinceCache = null; } };
