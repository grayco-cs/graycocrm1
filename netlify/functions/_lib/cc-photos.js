/* netlify/functions/_lib/cc-photos.js — patch CCPHOTOS: every CompanyCam photo of every linked project, indexed on the server.
   Owner (10/30): "make sure all company cam photos that come in are very low storage small files and they are all in my grayco
   photos by the morning they never actually are only some jobs".

   Why only some jobs showed photos: nothing was ever stored. GrayCo Photos asked CompanyCam for ONE job's photos while that job's
   page was open in that browser (and only once the browser's own CompanyCam check said "on"); the home cards, counts, Jump Back In
   and the feed only knew the jobs opened in this session plus CompanyCam's newest 40 photos company-wide.

   Now (no picture is ever copied — only CompanyCam's own small links):
     • gc_kv "ccidx:<CompanyCam project id>" — that project's photos, newest first, a few hundred bytes each:
         { v, pid, job, at, upd, n, done, next?, u: [creator names], geo?, ph: [[id, captured, web, thumb, creator#, tag, note]] }
       thumb is stored as a difference to web when they share most of the link ([prefix length, suffix length, middle]).
     • gc_kv "ccidx" — the summary every screen reads once: { v, at, n, p: { pid: [count, newest, cover thumb, job] }, feed: newest 150 }
     • gc_kv "ccidx_state" — bookmark, queue, progress ({ total, done, photos }), lock, rate-limit wait. "ccidx_request" — an admin's
       "⟳ Index all photos now".
   A run (companycam-photos every 15 minutes; companycam-photos-background up to ~13 minutes when there is a backlog):
     1. the linked projects = every CompanyCam id a live CRM job or lead carries (its own fields + ccMoreIds, PRJcc_<id>);
     2. a linked project never indexed → queued (the first run after a deploy is the whole backfill);
     3. CompanyCam's project list, newest activity first, down to the bookmark → a changed linked project is queued (incremental:
        read from page 1 until a page brings nothing new);
     4. a project not fully re-read for 12 hours is queued for a full re-read (deleted photos drop, fresh links if CompanyCam's expire);
     5. the queue is read page by page (100 photos a page, ≥ 260 ms apart, a 429 waits Retry-After or stops the run until then),
        each project written as soon as it is done; a run that runs out of time keeps its place (page) and the next run goes on.
   The keys "ccidx*" are never taken by the CRM's "what changed" pull (patch CCPHOTOS1) nor by the nightly backup (rebuildable).
   No secrets are stored or logged; the CompanyCam token stays in COMPANYCAM_TOKEN. */
'use strict';
const crypto = require('crypto');
const CC_API = 'https://api.companycam.com/v2';
const IDX = 'ccidx', STATE = 'ccidx_state', REQ = 'ccidx_request', ROW = 'ccidx:';
const PER = 100, FEED = 150, NOTE = 200, OVERLAP = 3600, REFRESH_MS = 12 * 3600e3, REFRESH_PER_RUN = 25, LIST_PAGES = 12;
const ID_FIELDS = ['ccProjectId', 'companyCamId', 'companycamId', 'ccId', 'ccamId', 'ccProjectUrl', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'sourceUrl'];
const TAGS = ['Before', 'During', 'Damage', 'After', 'Punch'];

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; }
function env(k){ return s(process.env[k]); }
function secOf(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  const n = Number(v); if (isFinite(n) && String(v).trim() !== '') return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const d = Date.parse(v); return isNaN(d) ? 0 : Math.floor(d / 1000);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ccIdFromAny(v){
  if (v == null || v === '') return '';
  const t = String(v), m = t.match(/projects\/(\d+)/) || t.match(/^PRJcc_(\d+)$/) || t.match(/^cc:(\d+)$/);
  if (m) return m[1];
  return /^\d{3,}$/.test(t.trim()) ? t.trim() : '';
}
function ccIdsOf(r){
  const out = []; if (!r || typeof r !== 'object') return out;
  const own = /^PRJcc_\d+$/.test(s(r.id)) ? ccIdFromAny(r.id) : ''; if (own) out.push(own);
  ID_FIELDS.forEach(f => { const id = ccIdFromAny(r[f]); if (id && out.indexOf(id) < 0) out.push(id); });
  arr(r.ccMoreIds).forEach(v => { const id = ccIdFromAny(v); if (id && out.indexOf(id) < 0) out.push(id); });
  return out;
}
const EXCL = /\b(lost|dead|cancel+ed|void|spam|junk|duplicate)\b/i;
/* every linked CompanyCam project → the CRM record it shows on (a job first, then a lead) */
function linkedMap(projects, leads, deadIds){
  const out = {}, dead = deadIds || {};
  function add(r, kind){
    if (!r || typeof r !== 'object' || r.deleted === true || !r.id || dead[s(r.id)]) return;
    if (EXCL.test(s(r.status) + ' ' + s(r.stage))) return;
    ccIdsOf(r).forEach(id => { if (!out[id] || (out[id].kind === 'lead' && kind === 'job')) out[id] = { job: s(r.id), kind }; });
  }
  arr(projects).forEach(r => add(r, 'job')); arr(leads).forEach(r => add(r, 'lead'));
  return out;
}

/* ── one CompanyCam photo → its small row ── */
function httpsOnly(u){ const t = s(u); return /^https:\/\/[^\s"'<>]+$/i.test(t) ? t : ''; }
function urisOf(ph){
  const by = {}; arr(ph && ph.uris).forEach(u => { if (u && u.type) by[low(u.type)] = httpsOnly(u.uri || u.url); });
  const web = by.web || by.large || by.original || httpsOnly(ph && ph.photo_url) || '';
  const thumb = by.thumbnail || by.small || web;
  return { web, thumb };
}
/* thumb as a difference to web (CompanyCam's two links usually share the long source part) */
function packThumb(t, w){
  if (!t || t === w) return 0;
  let p = 0; const m = Math.min(t.length, w.length); while (p < m && t[p] === w[p]) p++;
  let q = 0; while (q < m - p && t[t.length - 1 - q] === w[w.length - 1 - q]) q++;
  const mid = t.slice(p, t.length - q);
  return p + q > 24 ? [p, q, mid] : t;
}
function unpackThumb(x, w){
  if (!x) return w;
  if (typeof x === 'string') return x;
  if (Array.isArray(x) && x.length === 3) return w.slice(0, x[0]) + x[2] + w.slice(w.length - x[1]);
  return w;
}
function tagOf(ph){
  const words = arr(ph.tags).map(t => low(t && (t.display_value || t.value || t.name) || t)).join(' ') + ' ' + low(ph.description);
  for (const t of TAGS) if (words.indexOf(low(t)) >= 0) return t;
  return '';
}
function creatorOf(ph){ return s(ph.creator_name || (ph.creator && (ph.creator.name || [ph.creator.first_name, ph.creator.last_name].filter(Boolean).join(' '))) || ''); }
/* → [id, captured, web, thumb, creatorIndex, tag, note] (trailing empties dropped) or null */
function packPhoto(ph, people){
  if (!ph || ph.id == null) return null;
  const u = urisOf(ph); if (!u.web) return null;
  const cap = secOf(ph.captured_at) || secOf(ph.created_at);
  const who = creatorOf(ph); let wi = -1;
  if (who) { wi = people.indexOf(who); if (wi < 0) { people.push(who); wi = people.length - 1; } }
  const row = [s(ph.id), cap, u.web, packThumb(u.thumb, u.web), wi, tagOf(ph), s(ph.description).slice(0, NOTE)];
  while (row.length > 4 && (row[row.length - 1] === '' || row[row.length - 1] === -1)) row.pop();
  return row;
}
function geoOf(list){
  for (const ph of arr(list)) { const c = ph && ph.coordinates; if (c && c.lat != null && (c.lon != null || c.lng != null) && +c.lat) return [Math.round(+c.lat * 1e5) / 1e5, Math.round(+(c.lon != null ? c.lon : c.lng) * 1e5) / 1e5]; }
  return null;
}
/* photo rows of a stored project, unpacked (tests, the summary's feed) */
function unpackRow(row){
  row = obj(row); const people = arr(row.u);
  return arr(row.ph).map(x => ({ id: s(x[0]), at: +x[1] || 0, web: s(x[2]), thumb: unpackThumb(x[3], s(x[2])), by: x[4] != null && x[4] >= 0 ? s(people[x[4]]) : '', tag: s(x[5]), note: s(x[6]), pid: s(row.pid) }));
}

/* ── Supabase (service key) ── */
function sbEnv(){ return { url: s(env('SUPABASE_URL') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''), key: env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') }; }
async function kvRead(keys){
  const e = sbEnv(), out = {};
  for (let i = 0; i < keys.length; i += 60) {
    const part = keys.slice(i, i + 60);
    const r = await fetch(e.url + '/rest/v1/gc_kv?select=key,value&key=in.(' + part.map(k => '"' + encodeURIComponent(k) + '"').join(',') + ')', { headers: { apikey: e.key, Authorization: 'Bearer ' + e.key } });
    if (!r.ok) throw new Error('gc_kv read answered ' + r.status);
    arr(await r.json()).forEach(x => { if (x && x.key) out[x.key] = parse(x.value); });
  }
  return out;
}
async function kvWrite(rows){
  const e = sbEnv();
  const r = await fetch(e.url + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST',
    headers: { apikey: e.key, Authorization: 'Bearer ' + e.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.map(x => ({ key: x.key, value: x.value, updated_at: new Date().toISOString() }))) });
  if (!r.ok) throw new Error('gc_kv write answered ' + r.status);
}
async function readJobs(){
  const m = await kvRead(['projects', 'projects__manifest', 'leads', 'gc_tombstones', 'gc_deleted_projects']);
  const man = obj(m.projects__manifest); let list = arr(m.projects);
  if (man.chunked && man.count > 0) {
    const keys = []; for (let i = 0; i < man.count; i++) keys.push('projects__chunk' + i);
    const c = await kvRead(keys); list = [].concat.apply([], keys.map(k => arr(c[k])));
  }
  const dead = {}; Object.keys(obj(m.gc_tombstones)).forEach(k => { if (k.indexOf('projects:') === 0) dead[k.slice(9)] = 1; });
  arr(m.gc_deleted_projects).forEach(x => { dead[s(x && typeof x === 'object' ? x.id : x)] = 1; });
  return { projects: list, leads: arr(m.leads), dead };
}
/* the job list is read only when it changed since the last run (its time stamps are a few bytes); the linked projects are
   kept in the state between runs */
const JOB_KEYS = ['projects', 'projects__manifest', 'leads', 'gc_tombstones', 'gc_deleted_projects'];
async function jobsSig(){
  const e = sbEnv(), H = { apikey: e.key, Authorization: 'Bearer ' + e.key }, out = [];
  for (const f of ['key=in.(' + JOB_KEYS.map(k => '"' + k + '"').join(',') + ')', 'key=like.projects__chunk*']) {
    const r = await fetch(e.url + '/rest/v1/gc_kv?select=key,updated_at&' + f, { headers: H });
    if (!r.ok) return '';
    arr(await r.json()).forEach(x => { if (x && x.key) out.push(s(x.key) + '@' + s(x.updated_at)); });
  }
  return out.length ? out.sort().join('|') : '';
}
async function linkedNow(st, R){
  let sig = ''; try { sig = await jobsSig(); } catch (e) { sig = ''; }
  if (sig && sig === s(st.jobsSig) && st.linked && typeof st.linked === 'object') { R.jobsCached = true; return st.linked; }
  const J = await readJobs();
  const l = linkedMap(J.projects, J.leads, J.dead);
  R.linkedChanged = JSON.stringify(l) !== JSON.stringify(obj(st.linked));
  st.jobsSig = sig; st.linked = l;
  return l;
}

/* ── CompanyCam, politely: paced, 5xx once more, 429 waits Retry-After (or stops the run until then) ── */
function minGap(){ const v = Number(process.env.CC_PHOTO_MIN_MS); return isFinite(v) && v >= 0 ? v : 260; }
function retryAfterMs(r){
  let h = ''; try { h = s(r.headers && r.headers.get && r.headers.get('retry-after')); } catch (e) {}
  if (!h) return 30000;
  if (/^\d+(\.\d+)?$/.test(h)) return Math.max(1000, Math.round(+h * 1000));
  const d = Date.parse(h); return isNaN(d) ? 30000 : Math.max(1000, d - Date.now());
}
function Caller(token, deadline, R){
  let last = 0;
  return async function get(path){
    for (let attempt = 0; attempt < 5; attempt++) {
      const gap = last + minGap() - Date.now();
      if (Date.now() + Math.max(0, gap) > deadline) throw Object.assign(new Error('time'), { stop: 'time' });
      if (gap > 0) await sleep(gap);
      last = Date.now(); R.calls++;
      let r;
      try { r = await fetch(CC_API + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }); }
      catch (e) { if (attempt === 0) { await sleep(1000); continue; } throw Object.assign(new Error('CompanyCam unreachable'), { status: 0 }); }
      if (r.status === 429) {
        R.limited++;
        const ms = retryAfterMs(r);
        if (Date.now() + ms + 2000 < deadline && ms <= 65000) { await sleep(ms); continue; }
        throw Object.assign(new Error('CompanyCam rate limit'), { stop: 'rate', waitMs: ms });
      }
      if (r.status >= 500) { if (attempt < 1) { await sleep(1500); continue; } throw Object.assign(new Error('CompanyCam answered ' + r.status), { status: r.status }); }
      return r;
    }
    throw Object.assign(new Error('CompanyCam rate limit'), { stop: 'rate', waitMs: 60000 });
  };
}
function unwrap(x){ if (Array.isArray(x)) return x; const o = obj(x); for (const k of ['photos', 'projects', 'data', 'results', 'items']) if (Array.isArray(o[k])) return o[k]; return null; }

/* ── the summary everyone reads ── */
function summaryOf(prev, st, linked, rows){
  prev = obj(prev); const p = {}, done = obj(st.done); let n = 0;
  /* projects read this run: from their rows; the others: as the last summary had them (their job id as it is now) */
  Object.keys(obj(prev.p)).forEach(pid => { const x = prev.p[pid]; if (linked[pid] && done[pid] && !done[pid].gone && Array.isArray(x)) p[pid] = [+x[0] || 0, +x[1] || 0, s(x[2]), linked[pid].job]; });
  Object.keys(rows).forEach(pid => { const r = rows[pid]; delete p[pid]; if (!linked[pid] || r.gone) return; const f = arr(r.ph)[0];
    p[pid] = [arr(r.ph).length, f ? +f[1] || 0 : 0, f ? unpackThumb(f[3], f[2]) : '', linked[pid].job]; });
  Object.keys(done).forEach(pid => { if (!p[pid] && linked[pid] && !done[pid].gone && !done[pid].err) p[pid] = [+done[pid].n || 0, +done[pid].last || 0, '', linked[pid].job]; });
  Object.keys(p).forEach(pid => { n += p[pid][0]; });
  const prevFeed = prev.feed;
  /* the feed: newest photos across the linked projects (projects read this run replace their old entries) */
  const fresh = {}; Object.keys(rows).forEach(pid => { fresh[pid] = 1; });
  let feed = arr(prevFeed).filter(x => x && linked[s(x[0])] && !fresh[s(x[0])]);
  Object.keys(rows).forEach(pid => { const row = rows[pid]; if (!linked[pid]) return; const people = arr(row.u);
    arr(row.ph).slice(0, 40).forEach(x => feed.push([pid, x[0], x[1], x[2], unpackThumb(x[3], x[2]), x[4] != null && x[4] >= 0 ? s(people[x[4]]) : '', s(x[5])])); });
  feed.sort((a, b) => (b[2] || 0) - (a[2] || 0)); feed = feed.slice(0, FEED);
  return { v: 1, at: new Date().toISOString(), n, projects: Object.keys(p).length, p, feed };
}

/* ── one run ── */
async function run(opts){
  opts = opts || {};
  const budget = +opts.budgetMs || 18000, t0 = Date.now(), deadline = t0 + budget, runId = (opts.who || 'run') + ':' + crypto.randomBytes(4).toString('hex');
  const CCA = require('./cc-api.js'), token = CCA.cleanToken(process.env.COMPANYCAM_TOKEN).token, e = sbEnv();
  const R = { ok: true, who: opts.who || 'run', calls: 0, limited: 0, projects: 0, photos: 0, queued: 0, changed: 0, stop: '', more: false };
  if (!token) return Object.assign(R, { ok: false, skipped: 'COMPANYCAM_TOKEN is not set' });
  if (!e.url || !e.key) return Object.assign(R, { ok: false, skipped: 'SUPABASE_URL / SUPABASE_SERVICE_KEY are not set' });
  const kv = await kvRead([STATE, REQ]);
  const st = Object.assign({ v: 1, cursor: 0, done: {}, queue: [], prog: null }, obj(kv[STATE]));
  st.done = obj(st.done); st.queue = arr(st.queue).filter(q => q && q.pid);
  const nowMs = Date.now(), nowIso = new Date(nowMs).toISOString();
  if (st.lock && Date.parse(s(st.lock.until)) > nowMs && s(st.lock.id) !== runId) return Object.assign(R, { skipped: 'another run is indexing (until ' + s(st.lock.until) + ')', busy: true });
  if (st.wait && Date.parse(s(st.wait)) > nowMs) return Object.assign(R, { skipped: 'CompanyCam asked to wait until ' + s(st.wait), waiting: true, more: st.queue.length > 0 });
  st.lock = { id: runId, until: new Date(nowMs + budget + 90000).toISOString() };
  if (!st.cursor && !st.cursor0) st.cursor0 = Math.floor(nowMs / 1000) - 60;   /* the backfill's start: changes made while it runs are read after it */
  if (!opts.dry) await kvWrite([{ key: STATE, value: st }]);
  try { return await work(); }
  catch (err) {   /* never leave the lock behind: the next run goes on from what was saved */
    st.lock = null; st.last = { at: new Date().toISOString(), who: R.who, calls: R.calls, projects: R.projects, photos: R.photos, error: s(err && err.message || err).replace(/Bearer\s+\S+/gi, 'Bearer ...').slice(0, 160) };
    try { if (!opts.dry) await kvWrite([{ key: STATE, value: st }]); } catch (e) {}
    throw err;
  }
  async function work(){
  const linked = await linkedNow(st, R);
  const qHas = {}; st.queue.forEach(q => { qHas[q.pid] = q; });
  function enqueue(pid, mode, front){
    const q = qHas[pid];
    if (q) { if (mode === 'full') q.mode = 'full'; return; }
    const it = { pid, mode }; qHas[pid] = it; R.queued++;
    if (front) st.queue.unshift(it); else st.queue.push(it);
  }
  /* an admin's "⟳ Index all photos now": every linked project read again in full */
  const req = obj(kv[REQ]);
  if (s(req.at) && s(req.at) !== s(st.reqDone)) {
    Object.keys(linked).forEach(pid => enqueue(pid, 'full'));
    Object.keys(qHas).forEach(pid => { qHas[pid].mode = 'full'; });
    st.reqDone = s(req.at);
    st.prog = { kind: 'request', by: s(req.by), at: s(req.at), startedAt: nowIso, total: Object.keys(linked).length, done: 0, photos: 0 };
  }
  /* a linked project never indexed (the first run after a deploy = the whole backfill) */
  const fresh = Object.keys(linked).filter(pid => !st.done[pid] && !qHas[pid]);
  if (fresh.length) {
    fresh.forEach(pid => enqueue(pid, 'full'));
    if (!st.prog || st.prog.doneAt) st.prog = { kind: Object.keys(st.done).length ? 'new projects' : 'backfill', startedAt: nowIso, total: fresh.length, done: 0, photos: 0 };
    else st.prog.total = (+st.prog.total || 0) + fresh.length;
  }
  st.queue = st.queue.filter(q => linked[q.pid]);   /* unlinked meanwhile: not read */
  const get = Caller(token, deadline - 1500, R);

  /* CompanyCam's project list, newest activity first, down to the bookmark: a changed linked project is read again */
  let listTop = 0, listComplete = false; const listUpd = {};
  try {
    if (st.cursor) {
      for (let page = 1; page <= LIST_PAGES; page++) {
        const r = await get('/projects?per_page=' + PER + '&page=' + page);
        if (!r.ok) { if (r.status === 401 || r.status === 403) throw Object.assign(new Error('CompanyCam refused the token (' + r.status + ')'), { status: r.status }); break; }
        const l = unwrap(await r.json()); if (!l) break;
        let anyNew = false;
        l.forEach(p => {
          if (!p || p.id == null) return;
          const pid = s(p.id), up = Math.max(secOf(p.updated_at), secOf(p.last_activity_at), secOf(p.created_at));
          if (up > listTop) listTop = up;
          if (up < (+st.cursor || 0) - OVERLAP) return;
          anyNew = true; listUpd[pid] = up;
          const d = st.done[pid];
          if (linked[pid] && !(d && (+d.upd || 0) >= up)) { enqueue(pid, d && !d.err ? 'inc' : 'full', true); R.changed++; }
        });
        if (!anyNew || l.length < PER) { listComplete = true; break; }
      }
    } else listComplete = true;
  } catch (err) { if (err.stop || err.status === 401 || err.status === 403) R.stop = err.stop || 'refused'; if (err.status === 401 || err.status === 403) { R.ok = false; R.error = err.message; } }
  /* a full re-read every 12 hours (deleted photos drop; links CompanyCam renewed are taken) */
  if (!R.stop) {
    let n = 0;
    Object.keys(linked).filter(pid => st.done[pid] && !qHas[pid] && nowMs - Date.parse(s(st.done[pid].full || st.done[pid].at)) > REFRESH_MS)
      .sort((a, b) => s(st.done[a].full || st.done[a].at) < s(st.done[b].full || st.done[b].at) ? -1 : 1)
      .forEach(pid => { if (n++ < REFRESH_PER_RUN) enqueue(pid, 'full'); });
  }

  /* the queue, project by project */
  const rowsDone = {};
  let lastSave = Date.now(), prevSum = null;
  async function saveProgress(final){
    const rows = [{ key: STATE, value: st }];
    /* the summary only when something in it changed (it is read with the last one, once a run) */
    if (Object.keys(rowsDone).length || (final && (R.linkedChanged || st.sumV !== 1))) {
      if (!prevSum) { try { prevSum = obj((await kvRead([IDX]))[IDX]); } catch (e) { prevSum = {}; } }
      rows.push({ key: IDX, value: summaryOf(prevSum, st, linked, rowsDone) });
      st.sumV = 1;
    }
    if (!opts.dry) await kvWrite(rows);
    lastSave = Date.now();
  }
  while (st.queue.length && !R.stop) {
    if (Date.now() > deadline - 2500) { R.stop = 'time'; break; }
    const q = st.queue[0], pid = q.pid, prev = st.done[pid] || null;
    let row = null;
    try { row = obj((await kvRead([ROW + pid]))[ROW + pid]); } catch (err) { row = {}; }
    const old = row.done === true ? row : null;   /* a complete earlier read stays on screen while it is read again */
    const inc = q.mode === 'inc' && !!old && arr(row.ph).length > 0;
    const people = arr(row.u).slice();
    let acc = [], page = 1, complete = false, gone = false, geo = row.geo || null;
    if (!inc && row.next && s(q.started) && row.partialFor === s(q.started)) { acc = arr(old ? row.pend : row.ph).slice(); page = +row.next || 1; }
    else if (!inc) q.started = nowIso;
    const have = {}; if (inc) arr(row.ph).forEach(x => { have[s(x[0])] = 1; });
    const added = [];
    try {
      for (;;) {
        if (Date.now() > deadline - 2500) throw Object.assign(new Error('time'), { stop: 'time' });
        const r = await get('/projects/' + encodeURIComponent(pid) + '/photos?per_page=' + PER + '&page=' + page);
        if (r.status === 404) { gone = true; complete = true; break; }
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error('CompanyCam refused the token (' + r.status + ')'), { status: r.status });
        if (!r.ok) throw Object.assign(new Error('CompanyCam photos answered ' + r.status), { status: r.status });
        const l = unwrap(await r.json());
        if (!l) throw Object.assign(new Error('CompanyCam photos: unexpected answer'), { status: 0 });
        if (!geo) geo = geoOf(l);
        let news = 0;
        l.forEach(ph => { const x = packPhoto(ph, people); if (!x) return; if (inc) { if (!have[x[0]]) { have[x[0]] = 1; added.push(x); news++; } } else acc.push(x); });
        if (l.length < PER) { complete = true; break; }
        if (inc && !news) { complete = true; break; }
        page++;
      }
    } catch (err) {
      if (err.stop) R.stop = err.stop;
      else if (err.status === 401 || err.status === 403) { R.stop = 'refused'; R.ok = false; R.error = err.message; }
      else {
        /* this project failed (not the token, not the clock): the others go on; after 3 tries it waits for the 12-hour re-read */
        R.errors = (R.errors || 0) + 1; R.lastError = s(err.message).slice(0, 160); q.fails = (q.fails || 0) + 1;
        st.queue.shift();
        if (q.fails < 3) st.queue.push(q);
        else { delete qHas[pid]; st.done[pid] = Object.assign({}, prev || { n: 0, last: 0 }, { at: nowIso, full: nowIso, err: s(err.message).slice(0, 80) }); }
        continue;
      }
      if (err.stop === 'rate') st.wait = new Date(Date.now() + (err.waitMs || 60000)).toISOString();
    }
    if (!complete) {
      /* out of time / rate limited mid-project: what was read is kept and the next run goes on from this page */
      if (!inc && acc.length && !opts.dry) {
        const seenP = {}; acc = acc.filter(x => { if (seenP[x[0]]) return false; seenP[x[0]] = 1; return true; });
        const part = old ? Object.assign({}, old, { u: people, partialFor: s(q.started), next: page, pend: acc })
          : { v: 1, pid, job: linked[pid].job, kind: linked[pid].kind, at: nowIso, partialFor: s(q.started), next: page, u: people, ph: acc, done: false, n: acc.length };
        await kvWrite([{ key: ROW + pid, value: part }]).catch(() => {});
      }
      break;
    }
    let ph;
    if (gone) ph = [];
    else if (inc) ph = added.concat(arr(row.ph));
    else { const seenP = {}; ph = acc.filter(x => { if (seenP[x[0]]) return false; seenP[x[0]] = 1; return true; }); }
    ph.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    /* creators no photo points at any more are dropped (the list stays small) */
    const used = {}; ph.forEach(x => { if (x[4] != null && x[4] >= 0) used[x[4]] = 1; });
    const u2 = [], map = {}; people.forEach((nm, i) => { if (used[i]) { map[i] = u2.length; u2.push(nm); } });
    ph = ph.map(x => { if (x[4] == null || x[4] < 0) return x; const y = x.slice(); y[4] = map[x[4]]; return y; });
    const out = { v: 1, pid, job: linked[pid].job, kind: linked[pid].kind, at: nowIso, upd: Math.max(+listUpd[pid] || 0, +(prev && prev.upd) || 0), n: ph.length, done: true, u: u2, ph };
    if (geo) out.geo = geo; if (gone) out.gone = true;
    if (!opts.dry) await kvWrite([{ key: ROW + pid, value: out }]);
    rowsDone[pid] = out;
    st.done[pid] = { at: nowIso, full: inc ? s(prev && prev.full) || nowIso : nowIso, upd: out.upd, n: ph.length, last: ph.length ? ph[0][1] : 0, gone: gone || undefined };
    st.queue.shift(); delete qHas[pid];
    R.projects++; R.photos += inc ? added.length : ph.length;
    if (st.prog && !st.prog.doneAt) { st.prog.done = (+st.prog.done || 0) + 1; st.prog.photos = (+st.prog.photos || 0) + ph.length; }
    if (Date.now() - lastSave > 8000) await saveProgress(false);
  }
  if (listComplete && !R.stop && listTop) st.cursor = Math.max(+st.cursor || 0, listTop);
  if (!st.cursor && !R.stop && !st.queue.length) { st.cursor = +st.cursor0 || Math.floor(nowMs / 1000) - 60; delete st.cursor0; }   /* the backfill is done: from now on, incremental */
  if (st.prog && !st.prog.doneAt && !st.queue.length) st.prog.doneAt = new Date().toISOString();
  R.more = st.queue.length > 0;
  R.queue = st.queue.length;
  R.linked = Object.keys(linked).length;
  R.indexed = Object.keys(st.done).filter(pid => linked[pid]).length;
  R.ms = Date.now() - t0;
  st.last = { at: new Date().toISOString(), who: R.who, calls: R.calls, projects: R.projects, photos: R.photos, changed: R.changed, limited: R.limited, stop: R.stop || '', ms: R.ms, queue: R.queue, error: R.error || R.lastError || '' };
  st.total = { linked: R.linked, indexed: R.indexed, photos: Object.keys(st.done).reduce((n, pid) => n + (linked[pid] ? (+st.done[pid].n || 0) : 0), 0) };
  if (!R.stop) delete st.wait;
  st.lock = null;
  await saveProgress(true);
  return R;
  }
}

/* ── the hand-off to the background function (signed: only our own functions can start it) ── */
function handoffSig(ts){ return crypto.createHmac('sha256', 'ccphotos-handoff:' + (env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'))).update(String(ts), 'utf8').digest('hex'); }
function handoffOk(headers){
  const h = {}; Object.keys(obj(headers)).forEach(k => { h[k.toLowerCase()] = s(headers[k]); });
  const ts = h['x-ccp-ts'], sig = h['x-ccp-sig'];
  if (!ts || !sig || !/^\d{10,16}$/.test(ts) || Math.abs(Date.now() - +ts) > 120000) return false;
  const a = Buffer.from(sig), b = Buffer.from(handoffSig(ts));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}
async function kickBackground(why){
  const base = (env('URL') || env('DEPLOY_PRIME_URL') || env('DEPLOY_URL')).replace(/\/$/, '');
  if (!base || !(env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'))) return false;
  const ts = String(Date.now());
  try {
    const r = await fetch(base + '/.netlify/functions/companycam-photos-background', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ccp-ts': ts, 'x-ccp-sig': handoffSig(ts) }, body: JSON.stringify({ why: s(why).slice(0, 60) }) });
    return r.status === 202 || r.ok;
  } catch (e) { return false; }
}
/* what the CRM's "📸 CompanyCam sync status" window shows (never a secret) */
function statusOf(st){
  st = obj(st); const p = obj(st.prog), t = obj(st.total), l = obj(st.last);
  return { linked: +t.linked || 0, indexed: +t.indexed || 0, photos: +t.photos || 0, queue: arr(st.queue).length, running: !!(st.lock && Date.parse(s(st.lock.until)) > Date.now()),
    wait: s(st.wait), last: { at: s(l.at), who: s(l.who), projects: +l.projects || 0, photos: +l.photos || 0, calls: +l.calls || 0, stop: s(l.stop), error: s(l.error).slice(0, 160) },
    prog: st.prog ? { kind: s(p.kind), total: +p.total || 0, done: +p.done || 0, photos: +p.photos || 0, startedAt: s(p.startedAt), doneAt: s(p.doneAt), by: s(p.by) } : null };
}
module.exports = { run, kickBackground, handoffOk, handoffSig, statusOf, linkedMap, ccIdsOf, packPhoto, packThumb, unpackThumb, unpackRow, summaryOf,
  IDX, STATE, REQ, ROW, PER };
