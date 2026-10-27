/* ── CompanyCam → CRM jobs, on the server, every 15 minutes (patch CC) ─────────────────────────────────────
   "I haven't seen any of his newer ones, and I know there are some."

   Until now a new CompanyCam project became a CRM job only inside a browser: someone had to have the CRM open,
   signed in, with the CompanyCam key check answered "works" in that browser, and the job it made had no PM —
   so a PM's projects came in (when they came in at all) as nobody's job, which a PM's own lists never show.

   This scheduled function does the same work without anyone's browser:
     1. pages through EVERY CompanyCam project changed since the stored cursor (gc_kv "gc_cc_sync_state"),
        newest first; the cursor moves on only after a complete read;
     2. a project made on/after 1 Jan 2026 (owner rule, 33.144) that the CRM does not have — no job, lead or
        customer carries its CompanyCam id, it was not ignored ("gc_cc_dismissed"), its job was not deleted
        (gc_tombstones "projects:PRJcc_<id>", gc_deleted_projects) — becomes a Bidding job (Pipeline), id
        PRJcc_<CompanyCam id>, the same record the CRM itself makes, so it is never made twice;
     3. the PM is the CompanyCam creator: gc_cc_creator_map, a person's "GrayCo Photos name / e-mail" (ccName, set in
        Admin → Employees), a user's ccUserId, the user's name, or the CompanyCam user's e-mail (a PM's own projects
        → that PM). A creator nobody is mapped to → the Senior PM (gc_senior_pm, Admin → Employees), not as their
        own lead (patch PMG). A creator who has left (turned off / offboarded) is never made PM;
     4. a project with the name or address of a job already here is left alone (the CRM's own check links it or
        asks about it), except that the same address as a FINISHED job is a new job when the project was made
        after that job ended (a repeat customer);
     5. an earlier CompanyCam job that came in without a PM gets its creator's PM (never over a person's edit).
   The jobs are written with the service key and the current fresh-start epoch, so a fresh start does not stop
   it; every computer picks them up through the normal sync (lists are unions there, deletes are tombstones).
   Needs COMPANYCAM_TOKEN and SUPABASE_SERVICE_KEY (SUPABASE_URL optional). Answers only its schedule. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const CC_API = 'https://api.companycam.com/v2';
const CUT = Date.UTC(2026, 0, 1) / 1000;          /* owner rule: made before 2026 → never brought in */
const PER_PAGE = 50, MAX_PAGES = 400, OVERLAP = 3600;
const STATE_KEY = 'gc_cc_sync_state';
const ID_FIELDS = ['ccProjectId', 'companyCamId', 'companycamId', 'ccId', 'ccamId', 'ccProjectUrl', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'sourceUrl'];
const CLOSED_JOB = /^(completed?|closed|lost|cancell?ed|done|archived|dead|declined)$/;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; }
function secOf(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : v;
  const n = Number(v); if (isFinite(n) && String(v).trim() !== '') return n > 1e12 ? Math.floor(n / 1000) : n;
  const d = Date.parse(v); return isNaN(d) ? 0 : Math.floor(d / 1000);
}
function createdSec(p){
  const c = secOf(p.created_at); if (c) return c;
  const all = [p.updated_at, p.createdAt].map(secOf).filter(x => x > 0);
  return all.length ? Math.min.apply(null, all) : 0;
}
function ccIdFromAny(v){
  if (v == null || v === '') return '';
  const t = String(v), m = t.match(/projects\/(\d+)/) || t.match(/^PRJcc_(\d+)$/);
  if (m) return m[1];
  return /^\d{3,}$/.test(t.trim()) ? t.trim() : '';
}
const SUFFIX = { street:'st', st:'st', road:'rd', rd:'rd', avenue:'ave', ave:'ave', av:'ave', drive:'dr', dr:'dr', lane:'ln', ln:'ln', court:'ct', ct:'ct',
  boulevard:'blvd', blvd:'blvd', highway:'hwy', hwy:'hwy', place:'pl', pl:'pl', circle:'cir', cir:'cir', parkway:'pkwy', pkwy:'pkwy', cove:'cv', cv:'cv',
  terrace:'ter', ter:'ter', trail:'trl', trl:'trl', way:'way', north:'n', n:'n', south:'s', s:'s', east:'e', e:'e', west:'w', w:'w' };
function normAddr(a){
  const line = low(a).split(',')[0].replace(/[.#]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!line || !/\d/.test(line)) return '';
  return line.split(' ').map(w => SUFFIX[w] || w).join('');
}
function normName(n){ return low(n).replace(/[^a-z0-9]/g, ''); }

/* ── the small shape of a CompanyCam project ── */
function compact(p){
  const a = p.address || {}, cr = p.creator || {};
  const c = p.primary_contact || p.contact || (Array.isArray(p.contacts) && p.contacts[0]) || null;
  const street = s(a.street_address_1);
  return {
    id: s(p.id), name: s(p.name), street: street,
    address: [a.street_address_1, a.street_address_2, a.city, a.state, a.postal_code].map(s).filter(Boolean).join(', '),
    created_at: createdSec(p), updated_at: secOf(p.updated_at) || createdSec(p), status: low(p.status),
    creatorId: s(p.creator_id || cr.id),
    creator: s(cr.name || [cr.first_name, cr.last_name].filter(Boolean).join(' ') || p.creator_name || p.created_by_name || ''),
    creatorEmail: low(cr.email || cr.email_address || ''),
    url: s(p.project_url || p.url) || ('https://app.companycam.com/projects/' + s(p.id)),
    contact: c ? { name: s(c.name || c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ')), phone: s(c.phone_number || c.phone), email: s(c.email || c.email_address) } : null
  };
}

/* ── Supabase (service key) ── */
function sbEnv(){ return { url: s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), key: s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) }; }
async function kvRead(keys){
  const e = sbEnv();
  const r = await fetch(e.url + '/rest/v1/gc_kv?select=key,value&key=in.(' + keys.map(k => '"' + k + '"').join(',') + ')', { headers: { apikey: e.key, Authorization: 'Bearer ' + e.key } });
  if (!r.ok) throw new Error('gc_kv read answered ' + r.status);
  const out = {}; arr(await r.json()).forEach(x => { if (x && x.key) out[x.key] = parse(x.value); });
  return out;
}
async function kvWrite(rows, epoch){
  const e = sbEnv();
  const body = rows.map(x => Object.assign({ key: x.key, value: x.value, updated_at: new Date().toISOString() }, epoch ? { epoch: epoch } : {}));
  const r = await fetch(e.url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST',
    headers: { apikey: e.key, Authorization: 'Bearer ' + e.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body) });
  if (!r.ok) throw new Error('gc_kv write answered ' + r.status);
}
/* the job list: one row "projects", or (a big list) "projects__manifest" + "projects__chunkN" */
async function readProjects(){
  const m = await kvRead(['projects', 'projects__manifest']);
  const man = obj(m.projects__manifest);
  if (man.chunked && man.count > 0) {
    const keys = []; for (let i = 0; i < man.count; i++) keys.push('projects__chunk' + i);
    const c = await kvRead(keys);
    const chunks = keys.map(k => c[k]);
    if (chunks.some(x => !Array.isArray(x))) throw new Error('a projects chunk is missing');
    return { chunked: true, manifest: man, chunks: chunks, list: [].concat.apply([], chunks) };
  }
  if (m.projects != null && !Array.isArray(m.projects)) throw new Error('projects is not a list');
  return { chunked: false, list: arr(m.projects) };
}

/* patch SRC: RoofScout leads at one street address (service key; matched on the house number, then the
   normalized street — the rule in _lib/leadsource.js). A failed read is "none found". */
const _rsCache = {};
async function rsNear(address){
  const SRC = require('./_lib/leadsource.js');
  const a = SRC.normAddr(address); if (a.length < 6) return [];
  if (_rsCache[a]) return _rsCache[a];
  const num = (/^\s*(\d+)/.exec(String(address || '')) || [])[1]; if (!num) return [];
  const e = sbEnv(); let rows = [];
  try {
    const r = await fetch(e.url + '/rest/v1/rs_leads?select=id,data,created_at&order=created_at.asc&limit=200&data->>address=ilike.' + encodeURIComponent(num + ' *'), { headers: { apikey: e.key, Authorization: 'Bearer ' + e.key } });
    if (r.ok) rows = arr(await r.json());
  } catch (err) {}
  _rsCache[a] = SRC.roofscoutFrom(rows).filter(x => SRC.normAddr(x.address) === a);
  return _rsCache[a];
}

/* ── CompanyCam ── */
function ccHeaders(t){ return { Authorization: 'Bearer ' + t, Accept: 'application/json' }; }
/* patch CCS2: what this run learned about CompanyCam (copied into gc_cc_sync_health; never the token) */
let DIAG = { attempts: [] };
/* every project changed since `since`, all pages; complete=false when a page failed (the cursor then stays).
   patch CCS2 — per CompanyCam's v2 spec modified_since is ISO8601 (it was sent as unix seconds) and the list comes
   "sorted by most recent activity first". A 5xx is retried once; if page 1 still fails: per_page 25, then no filter at
   all (newest first, stop at the first page with nothing changed since). 401 / 403 / 404 stop at once. */
const VARIANTS = [{ name: 'iso50', per: PER_PAGE, filter: true }, { name: 'iso25', per: 25, filter: true }, { name: 'nofilter', per: PER_PAGE, filter: false }];
/* patch CCSYNC (unwrap): the list as an array whether CompanyCam answers [..] or { projects | data | results | items: [..] } */
function unwrapList(x){
  if (Array.isArray(x)) return x;
  const o = obj(x); for (const k of ['projects', 'data', 'results', 'items']) if (Array.isArray(o[k])) return o[k];
  return x;
}
function shapeOf(x){ if (x == null) return 'empty'; if (Array.isArray(x)) return 'list'; if (typeof x === 'object') return 'object {' + Object.keys(x).slice(0, 6).join(', ') + '}'; return typeof x; }
async function listChanged(token, since){
  const CCA = require('./_lib/cc-api.js'), iso = CCA.isoOf(since);
  let firstErr = null, skipFilter = false;
  for (const v of VARIANTS) {
    if (skipFilter && v.filter) continue;   /* patch CCSYNC: CompanyCam's date filter left out new projects — read newest first instead */
    const out = []; let complete = true, pages = 0, retried = false, failed = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const g = await CCA.getRetry(CC_API + '/projects?per_page=' + v.per + '&page=' + page + (v.filter ? '&modified_since=' + encodeURIComponent(iso) : ''), token);
      if (g.retried) retried = true;
      if (!g.r) { if (page === 1) failed = g; else complete = false; break; }
      const raw0 = await g.r.json(), chunk = unwrapList(raw0); pages = page;
      if (page === 1) { DIAG.request = '/v2/projects?per_page=' + v.per + '&page=1' + (v.filter ? '&modified_since=' + iso : ''); DIAG.rawFirstPage = Array.isArray(chunk) ? chunk.length : -1; }
      if (!Array.isArray(chunk)) {   /* patch CCSYNC: an answer that is not a list is an error, never "OK, 0 read" */
        if (page === 1) failed = { status: 0, body: 'CompanyCam answered in an unexpected shape (' + shapeOf(raw0) + ')' }; else complete = false;
        break;
      }
      if (!chunk.length) break;
      let fresh = 0;
      chunk.forEach(p => { if (p && p.id != null) { const c = compact(p); if (v.filter || Math.max(c.updated_at || 0, c.created_at || 0) >= since) { out.push(c); fresh++; } } });
      if (!v.filter && !fresh) break;
      if (chunk.length < v.per) break;
      if (page === MAX_PAGES) complete = false;
    }
    if (failed) {
      if (!firstErr) firstErr = failed;
      DIAG.attempts.push({ variant: v.name, status: failed.status, retried: !!failed.retried });
      if (failed.status && failed.status < 500 && failed.status !== 400 && failed.status !== 422) break;   /* the token or the URL: no other form helps */
      continue;
    }
    /* patch CCSYNC: trust but verify — the newest page WITHOUT the date filter; a project changed since the bookmark that the
       filtered list left out means the filter can't be trusted: read newest-first instead (one extra call per run) */
    if (v.filter && complete) {
      const chk = await CCA.getRetry(CC_API + '/projects?per_page=' + PER_PAGE + '&page=1', token);
      if (chk.r) {
        const rc = unwrapList(await chk.r.json());
        if (Array.isArray(rc)) {
          const have = {}; out.forEach(p => { have[p.id] = 1; });
          const missed = rc.filter(p => p && p.id != null).map(compact).filter(c => !have[c.id] && Math.max(c.updated_at || 0, c.created_at || 0) >= since);
          DIAG.check = { newestPage: rc.length, missed: missed.length };
          if (missed.length) { DIAG.filterIgnored = v.name; DIAG.attempts.push({ variant: v.name, status: 200, filterMissed: missed.length }); skipFilter = true; continue; }
        }
      }
    }
    DIAG.variant = v.name; DIAG.retried = retried; DIAG.attempts.push({ variant: v.name, status: 200, retried });
    if (firstErr) DIAG.ccError = { status: firstErr.status, body: firstErr.body || '' };
    const seen = {}, list = [];
    out.forEach(p => { if (!seen[p.id]) { seen[p.id] = 1; list.push(p); } });
    list.sort((a, b) => (b.created_at - a.created_at) || (b.updated_at - a.updated_at));   /* newest first */
    return { list, complete, pages, variant: v.name };
  }
  DIAG.ccError = { status: firstErr.status, body: firstErr.body || '' };
  throw Object.assign(new Error(firstErr.status ? 'CompanyCam answered ' + firstErr.status : (firstErr.body || 'CompanyCam gave no usable answer')), { status: firstErr.status });
}
async function ccUser(token, id){
  try { const r = await fetch(CC_API + '/users/' + encodeURIComponent(id), { headers: ccHeaders(token) }); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
}

/* ── who the PM is ── */
function pmFinder(users, creatorMap){
  const P = require('./_lib/people.js'), all = arr(users).filter(u => u && s(u.name));
  users = all.filter(u => P.isActive(u));   /* patch PMG: someone who has left is never made PM */
  const gone = all.filter(u => !P.isActive(u));
  const map = {}; Object.keys(obj(creatorMap)).forEach(k => { map[normName(k)] = s(creatorMap[k]); });
  function byName(n){ const k = normName(n); return k ? users.find(u => normName(u.name) === k) || null : null; }
  function left(n){ const k = normName(n); return !!k && gone.some(u => normName(u.name) === k || low(u.email) === low(n)); }
  return function(p, ccu){
    if (!p.creator && !p.creatorId) return null;
    const viaMap = map[normName(p.creator)] || (p.creatorId && map[normName(p.creatorId)]);
    if (viaMap) return byName(viaMap) || (left(viaMap) ? null : { name: viaMap });
    /* patch PMG: the person's own "GrayCo Photos name / e-mail" (Admin → Employees) */
    const em0 = low(p.creatorEmail || (ccu && (ccu.email_address || ccu.email)));
    const viaSet = users.find(u => { const v = s(u.ccName); return !!v && (normName(v) === normName(p.creator) || (!!em0 && low(v) === em0)); });
    if (viaSet) return viaSet;
    if (p.creatorId) { const u = users.find(x => [x.ccUserId, x.companyCamId, x.companycamUserId].map(s).indexOf(p.creatorId) >= 0); if (u) return u; }
    const u1 = byName(p.creator); if (u1) return u1;
    const em = low(p.creatorEmail || (ccu && (ccu.email_address || ccu.email)));
    if (em) { const u = users.find(x => low(x.email) === em); if (u) return u; }
    if (ccu) { const u = byName([ccu.first_name, ccu.last_name].filter(Boolean).join(' ')); if (u) return u; }
    return null;
  };
}

/* ── what the CRM already has ── */
function knownIndex(projects, leads, customers){
  const idx = { id: {}, addr: {}, name: {} };
  function add(r, kind){
    if (!r || typeof r !== 'object' || r.deleted === true) return;
    const label = { kind, id: s(r.id), name: s(r.name || r.company || r.client), status: low(r.status), end: secOf(r.completionDate || r.endDate || r.closedAt || r.completedAt),
      hasCc: ID_FIELDS.some(f => !!ccIdFromAny(r[f])) || /^PRJcc_\d+$/.test(s(r.id)) };   /* patch CCSYNC */
    ID_FIELDS.forEach(f => { const id = ccIdFromAny(r[f]); if (id) idx.id[id] = label; });
    const own = ccIdFromAny(r.id); if (/^PRJcc_/.test(s(r.id)) && own) idx.id[own] = label;
    if (kind !== 'job') return;
    const a = normAddr(r.address || r.jobAddress || r.street || r.siteAddress || ''); if (a.length >= 6) (idx.addr[a] = idx.addr[a] || []).push(label);
    [r.name, r.company].forEach(n => { const k = normName(n); if (k.length >= 4) (idx.name[k] = idx.name[k] || []).push(label); });
  }
  arr(projects).forEach(r => add(r, 'job')); arr(leads).forEach(r => add(r, 'lead')); arr(customers).forEach(r => add(r, 'customer'));
  return idx;
}
/* 'linked' | 'ask' (a person decides on the CRM's review list) | 'new' */
function decide(idx, p){
  if (idx.id[p.id]) return { kind: 'linked', why: 'its CompanyCam id is on ' + idx.id[p.id].kind + ' ' + idx.id[p.id].id };
  const hits = {};
  const a = normAddr(p.street || p.address); if (a.length >= 6) arr(idx.addr[a]).forEach(l => { hits[l.id] = l; });
  const n = normName(p.name); if (n.length >= 4) arr(idx.name[n]).forEach(l => { hits[l.id] = l; });
  const jobs = Object.keys(hits).map(k => hits[k]);
  if (!jobs.length) return { kind: 'new' };
  const open = jobs.filter(j => !CLOSED_JOB.test(j.status));
  if (open.length) return { kind: 'linked', by: 'match', jobs: open, why: 'same name/address as ' + open.map(j => j.name || j.id).join(', ') };   /* patch CCSYNC: by + jobs */
  /* only finished jobs: a project made after every one of them ended is new work for a repeat customer */
  if (jobs.every(j => j.end && p.created_at > j.end + 86400)) return { kind: 'new', note: 'same address as the finished job "' + jobs[0].name + '"' };
  return { kind: 'ask', why: 'same name/address as the finished job "' + jobs[0].name + '"' };
}
function ymd(sec){ try { return new Date(sec * 1000).toISOString().slice(0, 10); } catch (e) { return ''; } }
/* patch CC2: a project its creator made is their lead */
function selfFields(pm){ return { pm: pm, leadSource: 'Self-generated (' + pm + ')', broughtInBy: pm, commissionSource: 'self', pmSourced: true, selfGenerated: true, owner: pm, createdBy: pm }; }
function jobFor(p, pm, note, nowIso, senior){
  const c = p.contact || {}, iso = new Date(p.created_at * 1000).toISOString();
  const j = { id: 'PRJcc_' + p.id, name: p.name || p.address || ('GrayCo Photos ' + p.id), client: s(c.name), clientPhone: s(c.phone), clientEmail: s(c.email),
    address: p.address || '', type: 'Residential Reno', status: 'bidding', contract: 0, source: 'companycam',
    ccamId: p.id, ccProjectId: p.id, ccamUrl: p.url, companyCamUrl: p.url, ccCreator: p.creator || '', ccCreatorId: p.creatorId || '',
    created: ymd(p.created_at), createdAt: iso, keepAsJob: true, _ccAuto: true, _ccServer: true, savedAt: nowIso, updatedAt: nowIso };
  if (pm) Object.assign(j, selfFields(pm)); else { j.createdBy = 'CompanyCam' + (p.creator ? ' (' + p.creator + ')' : ''); if (senior) { j.pm = senior; j.pmBy = 'senior-pm'; } }   /* patch PMG: nobody mapped → the Senior PM runs it (not their own lead) */
  if (note) j.notes = 'Made in GrayCo Photos' + (p.creator ? ' by ' + p.creator : '') + ' — ' + note + '.';
  return j;
}

/* ── one run ── */
async function run(opts){
  opts = opts || {};
  const CCA = require('./_lib/cc-api.js'), ct = CCA.cleanToken(process.env.COMPANYCAM_TOKEN), token = ct.token, e = sbEnv();   /* patch CCS2: spaces / quotes / "Bearer " cleaned */
  DIAG = { attempts: [] };
  if (process.env.COMPANYCAM_TOKEN != null && String(process.env.COMPANYCAM_TOKEN).length) DIAG.tokenShape = ct.shape;
  if (!token) return { ok: false, skipped: 'COMPANYCAM_TOKEN is not set' };
  if (!e.url || !e.key) return { ok: false, skipped: 'SUPABASE_URL / SUPABASE_SERVICE_KEY are not set' };
  DIAG.whoami = await CCA.whoami(token);   /* is the token accepted at all (separate from the projects list)? */
  await CCA.saveWhoami(DIAG.whoami);
  const nowIso = new Date().toISOString();
  const kv = await kvRead(['leads', 'customers', 'users', 'gc_tombstones', 'gc_deleted_projects', 'gc_cc_dismissed', 'gc_cc_creator_map', 'gc_epoch', 'gc_senior_pm', 'gc_lead_inbox', STATE_KEY, 'gc_cc_sync_request', 'gc_cc_review']);
  const seniorU = require('./_lib/people.js').seniorPm(kv.users, kv.gc_senior_pm), senior = seniorU ? s(seniorU.name) : '';   /* patch PMG */
  const st = Object.assign({ cursor: 0, made: {}, creators: {} }, obj(kv[STATE_KEY]));
  st.made = obj(st.made); st.creators = obj(st.creators);
  const epoch = s(obj(kv.gc_epoch).epoch);
  /* a fresh start empties the job list: the cursor starts again from the owner's cut-off for the new epoch */
  if (s(st.epoch) !== epoch) { st.cursor = 0; st.made = {}; st.epoch = epoch; }
  /* patch CCSYNC: the bookmark heals itself — never in the future; no complete read for 3 days, or an admin's
     "⟳ Sync all now" (gc_kv gc_cc_sync_request), reads everything again from the owner's cut-off */
  const nowSec = Math.floor(Date.now() / 1000), req = obj(kv.gc_cc_sync_request), makeIds = obj(req.make);
  if ((+st.cursor || 0) > nowSec + 300) { st.cursor = 0; st.healed = { at: nowIso, why: 'the bookmark was in the future' }; }
  const lastOk = Date.parse(s(st.lastOkAt)) || 0;
  const wantFull = !!(s(req.at) && s(req.at) !== s(st.fullDoneFor));
  const stale = !!((+st.cursor || 0) > 0 && lastOk && Date.now() - lastOk > 3 * 86400e3);
  const full = wantFull || stale;
  const since = full ? CUT : Math.max(CUT, (+st.cursor || 0) - OVERLAP);
  const cc = await listChanged(token, since);
  function revOf(p, kind, why){ return { cc: s(p.id), kind: kind, why: s(why).slice(0, 300), name: s(p.name), address: s(p.address), url: s(p.url), creator: s(p.creator), created: ymd(p.created_at), at: nowIso }; }

  const P = await readProjects();
  const tombs = obj(kv.gc_tombstones), dead = {};
  Object.keys(tombs).forEach(k => { if (k.indexOf('projects:') === 0) dead[k.slice(9)] = 1; });
  arr(kv.gc_deleted_projects).forEach(id => { dead[s(id)] = 1; });
  const dis = obj(kv.gc_cc_dismissed);
  const idx = knownIndex(P.list, kv.leads, kv.customers);
  const findPm = pmFinder(kv.users, kv.gc_cc_creator_map);
  /* patch SRC: GrayCo lead or the PM's own? (earliest record at the address wins; RoofScout counts) */
  const SRC = require('./_lib/leadsource.js');
  let inboxV = null;   /* the Lead Inbox's own table once docs/lead-inbox.sql has run; gc_kv before that */
  try { const r = await fetch(e.url + '/rest/v1/gc_lead_inbox_kv?select=value&key=eq.gc_lead_inbox', { headers: { apikey: e.key, Authorization: 'Bearer ' + e.key } }); if (r.ok) { const x = arr(await r.json())[0]; if (x) inboxV = parse(x.value); } } catch (err) {}
  if (inboxV == null) inboxV = kv.gc_lead_inbox;
  const inboxItems = Array.isArray(inboxV) ? inboxV : arr(obj(inboxV).items);
  const srcRecs = SRC.recordsFrom({ projects: P.list, leads: kv.leads, customers: kv.customers, inbox: inboxItems });
  async function srcFix(j){
    if (!j || SRC.storedOf(j) !== 'self') return j;
    const c = SRC.classify(j, { records: srcRecs, roofscout: await rsNear(j.address) });
    if (c.source === 'company') { const pm = j.pm; Object.assign(j, SRC.fieldsFor(c, nowIso)); j.pm = pm; j.owner = 'GrayCo'; }
    else Object.assign(j, { leadSourceWhy: c.reason, leadSourceAt: nowIso, leadSourceV: 1 });
    return j;
  }
  async function pmOf(p){
    let ccu = null;
    const cached = p.creatorId && st.creators[p.creatorId];
    if (cached && cached.at && Date.now() - Date.parse(cached.at) < 7 * 86400e3) ccu = cached.user;
    let u = findPm(p, ccu);
    if (!u && p.creatorId && !cached) { ccu = await ccUser(token, p.creatorId); st.creators[p.creatorId] = { at: nowIso, user: ccu ? { first_name: s(ccu.first_name), last_name: s(ccu.last_name), email_address: low(ccu.email_address || ccu.email) } : null }; u = findPm(p, ccu); }
    return u ? String(u.name || '') : '';
  }

  const R = { ok: true, read: cc.list.length, pages: cc.pages, complete: cc.complete, since, made: [], pmFixed: [], linked: 0, ask: [], ignored: 0, deleted: 0, old: 0, archived: 0,
    full: full, attached: [], review: [], senior: [] };   /* patch CCSYNC */
  const jobs = [], attach = {};
  for (const p of cc.list) {                              /* newest first */
    if (!p.id) continue;
    if (!p.created_at || p.created_at < CUT) { R.old++; continue; }
    if (p.status && p.status !== 'active') { R.archived++; continue; }
    if (dis['id:' + p.id]) { R.ignored++; continue; }
    if (dead['PRJcc_' + p.id]) { R.deleted++; continue; }
    let d = decide(idx, p);
    /* patch CCSYNC: a person said "make it a new job" on the review list (never over a project already tied by its id) */
    if (makeIds[p.id] && (d.kind !== 'linked' || d.by === 'match')) d = { kind: 'new', note: 'made from the CompanyCam review list' };
    if (d.kind === 'linked') {
      R.linked++;
      /* patch CCSYNC: matched only by name / address → its CompanyCam id goes on that ONE open job that has none yet (its
         photos then come in); anything less clear goes on the review list instead of being dropped */
      if (d.by === 'match') {
        const js = arr(d.jobs), free = js.filter(j => !j.hasCc);
        if (js.length === 1 && free.length === 1 && js[0].kind === 'job' && !attach[js[0].id]) { attach[js[0].id] = p; js[0].hasCc = true; idx.id[p.id] = js[0]; R.attached.push({ cc: p.id, job: js[0].id, name: js[0].name }); }
        else R.review.push(revOf(p, 'match', d.why + (free.length ? '' : ' — that job already has its own CompanyCam project, so this may be new work')));
      }
      continue;
    }
    if (d.kind === 'ask') { R.ask.push(p.id); R.review.push(revOf(p, 'ask', d.why)); continue; }
    const j = await srcFix(jobFor(p, await pmOf(p), d.note, nowIso, senior));
    if (!s(j.pm) || j.pmBy === 'senior-pm') { R.senior.push(p.id); R.review.push(revOf(p, 'pm', 'nobody at GrayCo is set up as CompanyCam user "' + (p.creator || p.creatorId || '?') + '"' + (s(j.pm) ? ' — ' + j.pm + ' (Senior PM) has the job' : ' and no Senior PM is set') + '. Set that person\'s GrayCo Photos name in Admin → Employees.')); }
    jobs.push(j); idx.id[p.id] = { kind: 'job', id: j.id };
    st.made[p.id] = { id: j.id, at: nowIso };
    R.made.push({ cc: p.id, job: j.id, pm: j.pm || '', name: j.name });
  }
  /* a job this function made that has gone from the list without a delete (a push raced this write) comes back */
  const have = {}; P.list.forEach(r => { if (r && r.id) have[r.id] = 1; });
  const ccById = {}; cc.list.forEach(p => { ccById[p.id] = p; });
  /* earlier CompanyCam jobs without a PM get their creator's (not over a person's own edit of the PM) */
  const fixes = {};
  for (const r of P.list) {
    if (!r || !/^PRJcc_\d+$/.test(s(r.id)) || (s(r.pm) && r.pmBy !== 'senior-pm') || dead[r.id] || r.deleted === true) continue;   /* patch PMG: a Senior PM stand-in gives way to the creator once mapped */
    if (r._fe && r._fe.pm) continue;
    const ccId = ccIdFromAny(r.id), p = ccById[ccId] || { id: ccId, creator: s(r.ccCreator), creatorId: s(r.ccCreatorId) };
    if (!p.creator && !p.creatorId) continue;
    const pm = await pmOf(p); if (!pm) continue;
    fixes[r.id] = Object.assign(selfFields(pm), { leadSource: s(r.leadSource) && r.leadSource !== 'CompanyCam' && low(r.leadSource) !== low(pm) ? r.leadSource : 'Self-generated (' + pm + ')', broughtInBy: s(r.broughtInBy) || pm, owner: s(r.owner) || pm, createdBy: s(r.createdBy) || pm, updatedAt: nowIso, savedAt: nowIso });
    { const c = SRC.classify(Object.assign({}, r, fixes[r.id], { pmBy: '' }), { records: srcRecs, roofscout: await rsNear(r.address) });   /* patch SRC */
      if (c.source === 'company') fixes[r.id] = Object.assign({ pm: pm, updatedAt: nowIso, savedAt: nowIso }, SRC.fieldsFor(c, nowIso));
      else fixes[r.id].leadSourceWhy = c.reason; }
    R.pmFixed.push({ job: r.id, pm: pm });
  }
  const back = Object.keys(st.made).filter(cid => { const id = st.made[cid].id; return !have[id] && !dead[id] && !jobs.some(j => j.id === id) && ccById[cid]; });
  back.forEach(cid => { const p = ccById[cid]; if (p.created_at >= CUT && (!p.status || p.status === 'active') && !dis['id:' + cid]) jobs.push(jobFor(p, '', '', nowIso)); });

  if (jobs.length || Object.keys(fixes).length || Object.keys(attach).length) {
    /* read the list again right before writing (the CRM may have pushed meanwhile) and add to THAT */
    const P2 = await readProjects();
    const has2 = {}; P2.list.forEach(r => { if (r && r.id) has2[r.id] = 1; });
    const add = jobs.filter(j => !has2[j.id]);
    for (const j of add) if (!j.pm) { const pm = await pmOf(ccById[j.ccProjectId] || { creator: j.ccCreator, creatorId: j.ccCreatorId }); if (pm) { Object.assign(j, selfFields(pm)); await srcFix(j); } }
    const fix0 = r => (r && fixes[r.id] && (!s(r.pm) || r.pmBy === 'senior-pm')) ? Object.assign({}, r, fixes[r.id], { pmBy: '' }) : r;
    /* patch CCSYNC: the CompanyCam id onto the one matching job (only while it still has none) */
    const fix = r => { r = fix0(r); const p = r && attach[r.id]; if (!p || ID_FIELDS.some(f => !!ccIdFromAny(r[f]))) return r;
      return Object.assign({}, r, { ccProjectId: p.id, ccamId: p.id, ccamUrl: p.url, companyCamUrl: p.url, ccLinkedBy: 'companycam-sync', ccLinkedAt: nowIso, updatedAt: nowIso, savedAt: nowIso }); };
    if (P2.chunked) {
      const chunks = P2.chunks.map(c => c.map(fix));
      chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(add);
      const rows = chunks.map((c, i) => ({ key: 'projects__chunk' + i, value: c }));
      rows.push({ key: 'projects__manifest', value: Object.assign({}, P2.manifest, { total: chunks.reduce((n, c) => n + c.length, 0), at: nowIso }) });
      if (!opts.dry) await kvWrite(rows, epoch);
    } else if (!opts.dry) await kvWrite([{ key: 'projects', value: P2.list.map(fix).concat(add) }], epoch);
    R.written = add.length;
  }
  if (cc.complete) { st.cursor = Math.max(+st.cursor || 0, Math.floor(Date.now() / 1000) - 60); st.lastOkAt = nowIso; if (wantFull) st.fullDoneFor = s(req.at); if (full) st.lastFullAt = nowIso; }   /* patch CCSYNC */
  st.lastRun = { at: nowIso, read: R.read, made: R.made.length, pmFixed: R.pmFixed.length, ask: R.ask.length, complete: cc.complete, full: full };
  /* patch CCSYNC: the review list (gc_kv gc_cc_review) — what a person must decide. A project that has since been tied to
     a job (its id) drops off; "not a new job" (gc_cc_dismissed) keeps it off; a Senior-PM job drops off once its PM is set. */
  const rev = {}; arr(kv.gc_cc_review).forEach(x => { if (x && x.cc) rev[x.cc + '|' + x.kind] = x; });
  const nowKeys = {}; R.review.forEach(x => { const k = x.cc + '|' + x.kind; nowKeys[k] = 1; rev[k] = Object.assign({}, rev[k] || {}, x, { first: (rev[k] && rev[k].first) || x.at }); });
  const reviewList = Object.keys(rev).map(k => rev[k]).filter(x => {
    const k = x.cc + '|' + x.kind;
    if (dis['id:' + x.cc] || dead['PRJcc_' + x.cc]) return false;
    if (x.kind === 'pm') return !R.pmFixed.some(f => f.job === 'PRJcc_' + x.cc);
    if (!nowKeys[k] && idx.id[x.cc]) return false;
    return true;
  }).sort((a, b) => (s(b.at) > s(a.at) ? 1 : s(b.at) < s(a.at) ? -1 : 0)).slice(0, 200);
  R.reviewCount = reviewList.length;
  if (!opts.dry) await kvWrite([{ key: STATE_KEY, value: st }, { key: 'gc_cc_review', value: reviewList }], epoch);
  return R;
}

/* patch CCS: every run leaves one small record the CRM shows (Admin, GrayCo Systems, GrayCo Photos), so a missing or
   refused CompanyCam key is seen in the CRM, not only in Netlify's function log. Never the key, never a secret. */
const HEALTH_KEY = 'gc_cc_sync_health';
function healthOf(r, err){
  const h = { at: new Date().toISOString(), ok: false };
  if (err) {
    h.error = String(err && err.message || err).replace(/Bearer\s+\S+/gi, 'Bearer ...').slice(0, 200);
    if (err && +err.status) h.httpStatus = +err.status;
    else { const m = /CompanyCam answered (\d{3})/.exec(h.error); if (m) h.httpStatus = +m[1]; }
    return withDiag(h);
  }
  r = r || {};
  if (r.skipped) { h.skipped = String(r.skipped); h.tokenSet = !/COMPANYCAM_TOKEN/.test(h.skipped); return withDiag(h); }
  h.ok = r.ok !== false; h.read = +r.read || 0; h.made = (r.made || []).length; h.pmFixed = (r.pmFixed || []).length; h.complete = r.complete !== false;
  /* patch CCSYNC: every project read is accounted for */
  Object.assign(h, { pages: +r.pages || 0, linked: +r.linked || 0, attached: (r.attached || []).length, review: +r.reviewCount || 0, ask: (r.ask || []).length,
    senior: (r.senior || []).length, old: +r.old || 0, archived: +r.archived || 0, ignored: +r.ignored || 0, deleted: +r.deleted || 0, full: !!r.full });
  return withDiag(h);
}
/* patch CCS2: + which request form worked, CompanyCam's own error text, the /company check, the token's shape */
function withDiag(h){
  const d = DIAG || {};
  if (d.variant) h.variant = d.variant;
  if (d.retried) h.retried = true;
  if (d.attempts && d.attempts.length) h.attempts = d.attempts.slice(0, 6);
  if (d.ccError) h.ccError = { status: +d.ccError.status || 0, body: String(d.ccError.body || '').slice(0, 200) };
  if (d.whoami) { h.tokenAccepted = d.whoami.accepted; h.whoamiStatus = d.whoami.status; if (d.whoami.company) h.company = d.whoami.company; }
  if (d.tokenShape) h.tokenShape = d.tokenShape;
  /* patch CCSYNC (unwrap): the exact request (never the token) and what CompanyCam really returned */
  if (d.request) h.request = d.request;
  if (d.rawFirstPage != null) h.rawFirstPage = d.rawFirstPage;
  if (d.check) h.check = d.check;
  if (d.filterIgnored) h.filterIgnored = d.filterIgnored;
  return h;
}
async function saveHealth(h){
  const e = sbEnv(); if (!e.url || !e.key) return false;   /* no service key: nothing can be written (the CRM then says "no run recorded") */
  try { await kvWrite([{ key: HEALTH_KEY, value: h }]); return true; } catch (err) { return false; }
}

exports.handler = async function(event){
  /* scheduled only: Netlify calls it on the schedule in netlify.toml (a scheduled function has no public URL) */
  try {
    const r = await run();
    await saveHealth(healthOf(r));   /* patch CCS */
    try { console.log('[companycam-sync] ' + JSON.stringify({ read: r.read, complete: r.complete, skipped: r.skipped, made: (r.made || []).length, pmFixed: (r.pmFixed || []).length, ask: r.ask,
      first: (r.made || []).slice(0, 10).map(x => x.cc + ' ' + x.name + ' → ' + (x.pm || 'no PM')) })); } catch (e) {}
    return { statusCode: 200, body: JSON.stringify({ ok: r.ok, skipped: r.skipped, made: (r.made || []).length, pmFixed: (r.pmFixed || []).length, read: r.read, complete: r.complete }) };
  } catch (e) {
    console.log('[companycam-sync] failed: ' + (e && e.message || e));
    await saveHealth(healthOf(null, e));   /* patch CCS: a failed run is recorded too */
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};
exports._t = { run, compact, decide, knownIndex, pmFinder, listChanged, rsNear, CUT, healthOf, HEALTH_KEY };
