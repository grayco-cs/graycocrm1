/* ── CompanyCam → CRM jobs, on the server, every 15 minutes (patch CC) ─────────────────────────────────────
   "I haven't seen any of his newer ones, and I know there are some."

   Until now a new CompanyCam project became a CRM job only inside a browser: someone had to have the CRM open,
   signed in, with the CompanyCam key check answered "works" in that browser, and the job it made had no PM —
   so Steven's projects came in (when they came in at all) as nobody's job, which a PM's own lists never show.

   This scheduled function does the same work without anyone's browser:
     1. pages through EVERY CompanyCam project changed since the stored cursor (gc_kv "gc_cc_sync_state"),
        newest first; the cursor moves on only after a complete read;
     2. a project made on/after 1 Jan 2026 (owner rule, 33.144) that the CRM does not have — no job, lead or
        customer carries its CompanyCam id, it was not ignored ("gc_cc_dismissed"), its job was not deleted
        (gc_tombstones "projects:PRJcc_<id>", gc_deleted_projects) — becomes a Bidding job (Pipeline), id
        PRJcc_<CompanyCam id>, the same record the CRM itself makes, so it is never made twice;
     3. the PM is the CompanyCam creator: gc_cc_creator_map, a user's ccUserId, the user's name, or the
        CompanyCam user's e-mail (Steven Biffle's projects → PM "Steven Biffle");
     4. a project with the name or address of a job already here is left alone (the CRM's own check links it or
        asks about it), except that the same address as a FINISHED job is a new job when the project was made
        after that job ended (a repeat customer);
     5. an earlier CompanyCam job that came in without a PM gets its creator's PM (never over a person's edit).
   The jobs are written with the service key and the current fresh-start epoch, so a fresh start does not stop
   it; every computer picks them up through the normal sync (lists are unions there, deletes are tombstones).
   Needs COMPANYCAM_TOKEN and SUPABASE_SERVICE_KEY (SUPABASE_URL optional). Answers only its schedule. */
'use strict';
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

/* ── CompanyCam ── */
function ccHeaders(t){ return { Authorization: 'Bearer ' + t, Accept: 'application/json' }; }
/* every project changed since `since`, all pages; complete=false when a page failed (the cursor then stays) */
async function listChanged(token, since){
  const out = []; let complete = true, pages = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(CC_API + '/projects?per_page=' + PER_PAGE + '&page=' + page + '&modified_since=' + since, { headers: ccHeaders(token) });
    if (!r.ok) { if (page === 1) throw Object.assign(new Error('CompanyCam answered ' + r.status), { status: r.status }); complete = false; break; }
    const chunk = await r.json(); pages = page;
    if (!Array.isArray(chunk) || !chunk.length) break;
    chunk.forEach(p => { if (p && p.id != null) out.push(compact(p)); });
    if (chunk.length < PER_PAGE) break;
    if (page === MAX_PAGES) complete = false;
  }
  const seen = {}, list = [];
  out.forEach(p => { if (!seen[p.id]) { seen[p.id] = 1; list.push(p); } });
  list.sort((a, b) => (b.created_at - a.created_at) || (b.updated_at - a.updated_at));   /* newest first */
  return { list, complete, pages };
}
async function ccUser(token, id){
  try { const r = await fetch(CC_API + '/users/' + encodeURIComponent(id), { headers: ccHeaders(token) }); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
}

/* ── who the PM is ── */
function pmFinder(users, creatorMap){
  users = arr(users).filter(u => u && s(u.name) && u.active !== false && !u.fired && !u.deleted);
  const map = {}; Object.keys(obj(creatorMap)).forEach(k => { map[normName(k)] = s(creatorMap[k]); });
  function byName(n){ const k = normName(n); return k ? users.find(u => normName(u.name) === k) || null : null; }
  return function(p, ccu){
    if (!p.creator && !p.creatorId) return null;
    const viaMap = map[normName(p.creator)] || (p.creatorId && map[normName(p.creatorId)]);
    if (viaMap) return byName(viaMap) || { name: viaMap };
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
    const label = { kind, id: s(r.id), name: s(r.name || r.company || r.client), status: low(r.status), end: secOf(r.completionDate || r.endDate || r.closedAt || r.completedAt) };
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
  if (open.length) return { kind: 'linked', why: 'same name/address as ' + open.map(j => j.name || j.id).join(', ') };
  /* only finished jobs: a project made after every one of them ended is new work for a repeat customer */
  if (jobs.every(j => j.end && p.created_at > j.end + 86400)) return { kind: 'new', note: 'same address as the finished job "' + jobs[0].name + '"' };
  return { kind: 'ask', why: 'same name/address as the finished job "' + jobs[0].name + '"' };
}
function ymd(sec){ try { return new Date(sec * 1000).toISOString().slice(0, 10); } catch (e) { return ''; } }
function jobFor(p, pm, note, nowIso){
  const c = p.contact || {}, iso = new Date(p.created_at * 1000).toISOString();
  const j = { id: 'PRJcc_' + p.id, name: p.name || p.address || ('CompanyCam ' + p.id), client: s(c.name), clientPhone: s(c.phone), clientEmail: s(c.email),
    address: p.address || '', type: 'Residential Reno', status: 'bidding', contract: 0, source: 'companycam',
    ccamId: p.id, ccProjectId: p.id, ccamUrl: p.url, companyCamUrl: p.url, ccCreator: p.creator || '', ccCreatorId: p.creatorId || '',
    created: ymd(p.created_at), createdAt: iso, keepAsJob: true, _ccAuto: true, _ccServer: true, savedAt: nowIso, updatedAt: nowIso };
  if (pm) Object.assign(j, { pm: pm, leadSource: pm, broughtInBy: pm, commissionSource: 'self', pmSourced: true });
  if (note) j.notes = 'Made in CompanyCam' + (p.creator ? ' by ' + p.creator : '') + ' — ' + note + '.';
  return j;
}

/* ── one run ── */
async function run(opts){
  opts = opts || {};
  const token = s(process.env.COMPANYCAM_TOKEN), e = sbEnv();
  if (!token) return { ok: false, skipped: 'COMPANYCAM_TOKEN is not set' };
  if (!e.url || !e.key) return { ok: false, skipped: 'SUPABASE_URL / SUPABASE_SERVICE_KEY are not set' };
  const nowIso = new Date().toISOString();
  const kv = await kvRead(['leads', 'customers', 'users', 'gc_tombstones', 'gc_deleted_projects', 'gc_cc_dismissed', 'gc_cc_creator_map', 'gc_epoch', STATE_KEY]);
  const st = Object.assign({ cursor: 0, made: {}, creators: {} }, obj(kv[STATE_KEY]));
  st.made = obj(st.made); st.creators = obj(st.creators);
  const epoch = s(obj(kv.gc_epoch).epoch);
  /* a fresh start empties the job list: the cursor starts again from the owner's cut-off for the new epoch */
  if (s(st.epoch) !== epoch) { st.cursor = 0; st.made = {}; st.epoch = epoch; }
  const since = Math.max(CUT, (+st.cursor || 0) - OVERLAP);
  const cc = await listChanged(token, since);

  const P = await readProjects();
  const tombs = obj(kv.gc_tombstones), dead = {};
  Object.keys(tombs).forEach(k => { if (k.indexOf('projects:') === 0) dead[k.slice(9)] = 1; });
  arr(kv.gc_deleted_projects).forEach(id => { dead[s(id)] = 1; });
  const dis = obj(kv.gc_cc_dismissed);
  const idx = knownIndex(P.list, kv.leads, kv.customers);
  const findPm = pmFinder(kv.users, kv.gc_cc_creator_map);
  async function pmOf(p){
    let ccu = null;
    const cached = p.creatorId && st.creators[p.creatorId];
    if (cached && cached.at && Date.now() - Date.parse(cached.at) < 7 * 86400e3) ccu = cached.user;
    let u = findPm(p, ccu);
    if (!u && p.creatorId && !cached) { ccu = await ccUser(token, p.creatorId); st.creators[p.creatorId] = { at: nowIso, user: ccu ? { first_name: s(ccu.first_name), last_name: s(ccu.last_name), email_address: low(ccu.email_address || ccu.email) } : null }; u = findPm(p, ccu); }
    return u ? String(u.name || '') : '';
  }

  const R = { ok: true, read: cc.list.length, pages: cc.pages, complete: cc.complete, since, made: [], pmFixed: [], linked: 0, ask: [], ignored: 0, deleted: 0, old: 0, archived: 0 };
  const jobs = [];
  for (const p of cc.list) {                              /* newest first */
    if (!p.id) continue;
    if (!p.created_at || p.created_at < CUT) { R.old++; continue; }
    if (p.status && p.status !== 'active') { R.archived++; continue; }
    if (dis['id:' + p.id]) { R.ignored++; continue; }
    if (dead['PRJcc_' + p.id]) { R.deleted++; continue; }
    const d = decide(idx, p);
    if (d.kind === 'linked') { R.linked++; continue; }
    if (d.kind === 'ask') { R.ask.push(p.id); continue; }
    const j = jobFor(p, await pmOf(p), d.note, nowIso);
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
    if (!r || !/^PRJcc_\d+$/.test(s(r.id)) || s(r.pm) || dead[r.id] || r.deleted === true) continue;
    if (r._fe && r._fe.pm) continue;
    const ccId = ccIdFromAny(r.id), p = ccById[ccId] || { id: ccId, creator: s(r.ccCreator), creatorId: s(r.ccCreatorId) };
    if (!p.creator && !p.creatorId) continue;
    const pm = await pmOf(p); if (!pm) continue;
    fixes[r.id] = { pm: pm, leadSource: s(r.leadSource) && r.leadSource !== 'CompanyCam' ? r.leadSource : pm, broughtInBy: s(r.broughtInBy) || pm, commissionSource: 'self', pmSourced: true, updatedAt: nowIso, savedAt: nowIso };
    R.pmFixed.push({ job: r.id, pm: pm });
  }
  const back = Object.keys(st.made).filter(cid => { const id = st.made[cid].id; return !have[id] && !dead[id] && !jobs.some(j => j.id === id) && ccById[cid]; });
  back.forEach(cid => { const p = ccById[cid]; if (p.created_at >= CUT && (!p.status || p.status === 'active') && !dis['id:' + cid]) jobs.push(jobFor(p, '', '', nowIso)); });

  if (jobs.length || Object.keys(fixes).length) {
    /* read the list again right before writing (the CRM may have pushed meanwhile) and add to THAT */
    const P2 = await readProjects();
    const has2 = {}; P2.list.forEach(r => { if (r && r.id) has2[r.id] = 1; });
    const add = jobs.filter(j => !has2[j.id]);
    for (const j of add) if (!j.pm) { const pm = await pmOf(ccById[j.ccProjectId] || { creator: j.ccCreator, creatorId: j.ccCreatorId }); if (pm) Object.assign(j, { pm, leadSource: pm, broughtInBy: pm, commissionSource: 'self', pmSourced: true }); }
    const fix = r => (r && fixes[r.id] && !s(r.pm)) ? Object.assign({}, r, fixes[r.id]) : r;
    if (P2.chunked) {
      const chunks = P2.chunks.map(c => c.map(fix));
      chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(add);
      const rows = chunks.map((c, i) => ({ key: 'projects__chunk' + i, value: c }));
      rows.push({ key: 'projects__manifest', value: Object.assign({}, P2.manifest, { total: chunks.reduce((n, c) => n + c.length, 0), at: nowIso }) });
      if (!opts.dry) await kvWrite(rows, epoch);
    } else if (!opts.dry) await kvWrite([{ key: 'projects', value: P2.list.map(fix).concat(add) }], epoch);
    R.written = add.length;
  }
  if (cc.complete) st.cursor = Math.max(+st.cursor || 0, Math.floor(Date.now() / 1000) - 60);
  st.lastRun = { at: nowIso, read: R.read, made: R.made.length, pmFixed: R.pmFixed.length, ask: R.ask.length, complete: cc.complete };
  if (!opts.dry) await kvWrite([{ key: STATE_KEY, value: st }], epoch);
  return R;
}

exports.handler = async function(event){
  /* scheduled only: Netlify calls it on the schedule in netlify.toml (a scheduled function has no public URL) */
  try {
    const r = await run();
    try { console.log('[companycam-sync] ' + JSON.stringify({ read: r.read, complete: r.complete, skipped: r.skipped, made: (r.made || []).length, pmFixed: (r.pmFixed || []).length, ask: r.ask,
      first: (r.made || []).slice(0, 10).map(x => x.cc + ' ' + x.name + ' → ' + (x.pm || 'no PM')) })); } catch (e) {}
    return { statusCode: 200, body: JSON.stringify({ ok: r.ok, skipped: r.skipped, made: (r.made || []).length, pmFixed: (r.pmFixed || []).length, read: r.read, complete: r.complete }) };
  } catch (e) {
    console.log('[companycam-sync] failed: ' + (e && e.message || e));
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};
exports._t = { run, compact, decide, knownIndex, pmFinder, listChanged, CUT };
