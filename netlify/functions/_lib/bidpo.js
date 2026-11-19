/* ============================================================================
   patch BIDPO — the bid site's PO is the CRM's PO, everywhere.   netlify/functions/_lib/bidpo.js

   Owner (11/19, on the bid site's ✎ Edit Job Details): "Should auto-fill in POs, match or use the job's PO. Always have the
   same PO throughout, but shouldn't have to enter one here."

   Pure rules (no I/O) — subportal.js (load / save / 🔗 Link to CRM job) and bid-hub.js (the CRM's 🏗 Bid portal tab) call them
   with the CRM's lists (gc_kv projects, leads, schedule, tombstones) and the bid jobs.

   Which CRM job a bid job is (resolve):
     1. linked   — the bid job's crmProjectId (📢 Put on bid portal from a job, 🔗 an admin's pick, an earlier match), or the ONE
                   CRM job whose bidJobId is this bid job (the CRM's 📊 Bids → estimate link)
     2. po       — the PO already on the bid job is exactly one live CRM job's PO (a CRM job made from it kept its PO)
     3. lead     — the bid job's CRM lead (crmLeadId / the lead's subPortal.jobId / the Lead Inbox id) became exactly one CRM job
     4. address  — exactly one OPEN CRM job (not lost / closed / archived, not linked to another bid job) at the same street number +
                   street name (Ct = Court, St = Street …; a suffix only has to agree when both have one); several → the one with
                   the same title, else ambiguous
     5. title    — no street match: exactly one open CRM job with the same title in the same city
     Ambiguous → no PO is changed; an admin picks with 🔗 Link to CRM job (or "none of these — give it its own PO").
   The PO (apply):
     linked / matched → the CRM job's PO (autoPO || poNumber || po — what the CRM shows as "PO …"); a CRM PO change follows on the
                        next load or save, and the old one is kept in poHistory.
     no CRM job       → the PO already on the bid job stays (one sub may already have it); none → a new one the CRM's own way
                        (window.nextPO: a letter + 3 digits, e.g. K729, never one a CRM job, lead or other bid job has). The CRM
                        job later made from the lead keeps it (index.html patch BIDPO), and step 2 links them.
   Nobody types a PO on the bid site any more.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }

function poOf(p){ return s(p && (p.autoPO || p.poNumber || p.po)); }
function poKey(v){ return s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/* ── addresses ── */
const SUF = { street: 'st', st: 'st', str: 'st', avenue: 'ave', ave: 'ave', av: 'ave', road: 'rd', rd: 'rd', drive: 'dr', dr: 'dr', drv: 'dr', lane: 'ln', ln: 'ln',
  court: 'ct', ct: 'ct', crt: 'ct', cove: 'cv', cv: 'cv', circle: 'cir', cir: 'cir', boulevard: 'blvd', blvd: 'blvd', place: 'pl', pl: 'pl', parkway: 'pkwy', pkwy: 'pkwy',
  highway: 'hwy', hwy: 'hwy', terrace: 'ter', ter: 'ter', trail: 'trl', trl: 'trl', way: 'way', square: 'sq', sq: 'sq', loop: 'loop', pike: 'pike', crossing: 'xing',
  xing: 'xing', point: 'pt', pt: 'pt', bend: 'bnd', run: 'run', path: 'path', alley: 'aly', expressway: 'expy', expy: 'expy', freeway: 'fwy', fwy: 'fwy', row: 'row', walk: 'walk' };
const DIR = { north: 'n', n: 'n', south: 's', s: 's', east: 'e', e: 'e', west: 'w', w: 'w', northeast: 'ne', ne: 'ne', northwest: 'nw', nw: 'nw', southeast: 'se', se: 'se', southwest: 'sw', sw: 'sw' };
const STATES = /^(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|tennessee|mississippi|arkansas|alabama)$/;
/* "2817 Los Gatos Ct, Memphis, TN 38117" → { num: '2817', name: 'los gatos', suf: 'ct' }; no street number → null */
function street(a){
  let t = low(a).split(/[,\n]/)[0];
  t = t.replace(/(#|\b(apt|apartment|unit|ste|suite|bldg|building|lot)\b\.?)\s*[a-z0-9-]*.*$/, ' ');
  const w = t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!w.length || !/^\d+[a-z]?$/.test(w[0])) return null;
  const rest = w.slice(1);
  let suf = '', name = [];
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i];
    if (i > 0 && SUF[x]) { suf = SUF[x]; break; }   /* the first suffix after the name ends the street ("Gatos Ct Memphis" → Ct) */
    name.push(DIR[x] && (i === 0 || i === rest.length - 1) ? DIR[x] : x);
  }
  if (!suf) while (name.length > 1 && (/^\d{5}(\d{4})?$/.test(name[name.length - 1]) || STATES.test(name[name.length - 1]))) name.pop();   /* "… Memphis TN 38117" with no suffix and no commas */
  name = name.filter(function(x, i){ return !(i === 0 && DIR[x] && name.length > 1); });   /* "N Main" = "Main" — the direction is too often left off */
  if (!name.length) return null;
  return { num: w[0], name: name.join(' '), suf: suf };
}
function sameStreet(a, b){
  const x = street(a), y = street(b);
  return !!(x && y && x.num === y.num && x.name === y.name && (!x.suf || !y.suf || x.suf === y.suf));
}
function cityOf(o, addr){
  const c = low(o && (o.city || o.jobCity));
  if (c) return c.replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  const parts = s(addr != null ? addr : (o && (o.address || o.jobAddress))).split(',').map(function(x){ return low(x).replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  const clean = parts.map(function(x){ return x.replace(/\s+(tn|ms|ar|al|ga|ky|mo|tennessee|mississippi|arkansas)$/, '').trim(); });
  const after = clean.slice(1).filter(function(x){ return x && !STATES.test(x); });
  if (after.length) return after[after.length - 1];   /* "9 Oak Rd, Germantown, TN 38138" → germantown */
  const raw = s(addr != null ? addr : (o && (o.address || o.jobAddress)));
  return clean[0] && !STATES.test(clean[0]) && !street(raw) && parts.length > 1 ? clean[0] : '';   /* "Germantown, TN" (no street) → germantown */
}
function normTitle(v){ return low(v).replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }

/* ── the CRM's lists ── */
/* data: { projects, leads, schedule, gc_tombstones, gc_deleted_projects } as kvRead gives them */
function prep(data){
  data = data || {};
  if (data.__bidpo) return data.__bidpo;
  const tomb = data.gc_tombstones && typeof data.gc_tombstones === 'object' && !Array.isArray(data.gc_tombstones) ? data.gc_tombstones : {};
  const delP = new Set(arr(data.gc_deleted_projects).map(String));
  const gone = function(list, id){ id = s(id); return !!id && (!!tomb[list + ':' + id] || (list === 'projects' && delP.has(id))); };
  const alive = function(p){ return !!(p && s(p.id) && p.deleted !== true && !p._deleted && !p._tombstoned && !gone('projects', p.id) && !/^(deleted|void)$/i.test(s(p.status))); };
  const projects = arr(data.projects).filter(alive);
  const leads = arr(data.leads).filter(function(l){ return l && s(l.id) && l.deleted !== true && !l._deleted && !gone('leads', l.id); });
  const D = { all: arr(data.projects), projects: projects, leads: leads, schedule: arr(data.schedule), byId: {} };
  projects.forEach(function(p){ D.byId[s(p.id)] = p; });
  try { Object.defineProperty(data, '__bidpo', { value: D, enumerable: false, configurable: true }); } catch (e) {}
  return D;
}
const CLOSED = /^(lost|cancel+ed|cancel|closed|complete|completed|paid|paid in full|dead|declined|void|archived|warranty)\b/i;
function isOpen(p){ return !!p && p.archived !== true && !s(p.archivedAt) && !CLOSED.test(s(p.status)); }
function label(p){ return [poOf(p), s(p && (p.name || p.client)) || 'CRM job'].filter(Boolean).join(' · '); }
/* what an admin sees of a CRM job to pick it (no customer phone / e-mail, no carrier) */
function cand(p, why){ return { pid: s(p.id), name: s(p.name) || s(p.client) || 'CRM job', address: s(p.address || p.jobAddress), po: poOf(p), status: s(p.status) || '', open: isOpen(p), why: why || '' }; }

function leadOf(job, D){
  const lid = s(job.crmLeadId), inbox = s(job.leadInbox && job.leadInbox.id), jid = s(job.id);
  const hit = D.leads.filter(function(l){
    if (lid && s(l.id) === lid) return true;
    if (jid && s(l.subPortal && l.subPortal.jobId) === jid) return true;
    if (inbox && (s(l.inboxId) === inbox || s(l.id) === inbox || s(l.id) === 'LEADIN-' + inbox.replace(/^LI-/, ''))) return true;
    return false;
  });
  if (lid) { const exact = hit.filter(function(l){ return s(l.id) === lid; }); if (exact.length) return exact[0]; }
  return hit[0] || null;
}
function projectsOfLead(l, D){
  const ids = [s(l.id), s(l.inboxId)].filter(Boolean), own = [l.pid, l.projectId, l.jobId, l.convertedPid, l.wonPid].map(s).filter(Boolean);
  return D.projects.filter(function(p){ return own.indexOf(s(p.id)) > -1 || [p.leadId, p.fromLeadId, p.fromLead, p.leadInboxId].some(function(v){ return s(v) && ids.indexOf(s(v)) > -1; }); });
}

/* → { state: 'linked' | 'ambiguous' | 'none', how, project, cands: [cand], lead } */
function resolve(job, data, opts){
  const D = prep(data), jid = s(job && job.id), out = { state: 'none', how: '', project: null, cands: [], lead: null };
  job = job || {};
  const one = function(p, how){ out.state = 'linked'; out.how = how; out.project = p; return out; };
  /* 1. the link */
  const pid = s(job.crmProjectId);
  if (pid && D.byId[pid]) return one(D.byId[pid], 'link');
  const back = D.projects.filter(function(p){ return jid && s(p.bidJobId) === jid; });
  if (back.length === 1) return one(back[0], 'bidJobId');
  if (back.length > 1) { const o = back.filter(isOpen); if (o.length === 1) return one(o[0], 'bidJobId'); out.state = 'ambiguous'; out.how = 'bidJobId'; out.cands = back.map(function(p){ return cand(p, 'points at this bid job'); }); return out; }
  /* 2. the PO it already has */
  const k = poKey(job.poNumber);
  if (k.length >= 3 && !job.poNoMatch) {
    let hits = D.projects.filter(function(p){ return [p.autoPO, p.poNumber, p.po].some(function(x){ return poKey(x) === k; }); });
    if (hits.length > 1) hits = hits.filter(function(p){ return sameStreet(p.address || p.jobAddress, job.address); });
    if (hits.length === 1) return one(hits[0], 'po');
  }
  /* 3. its lead */
  const l = leadOf(job, D); out.lead = l;
  if (l) {
    let c = projectsOfLead(l, D);
    if (c.length > 1) { const o = c.filter(isOpen); if (o.length === 1) c = o; }
    if (c.length === 1) return one(c[0], 'lead');
    if (c.length > 1) { out.state = 'ambiguous'; out.how = 'lead'; out.cands = c.map(function(p){ return cand(p, 'made from this job\'s lead'); }); return out; }
  }
  if (job.poNoMatch) return out;   /* an admin said: none of those CRM jobs */
  /* 4. the address, 5. the title in the same city — open CRM jobs only, not one already linked to another bid job (its bidJobId, or
     another live bid job's crmProjectId: two bid jobs for one CRM job is an admin's call) */
  const taken = {}; arr(opts && opts.jobs).forEach(function(j){ if (j && s(j.id) !== jid && s(j.crmProjectId) && !/^(archived|deleted)$/i.test(s(j.status))) taken[s(j.crmProjectId)] = 1; });
  const linkedElsewhere = function(p){ return (s(p.bidJobId) && s(p.bidJobId) !== jid) || !!taken[s(p.id)]; };
  const free = D.projects.filter(function(p){ return isOpen(p) && !linkedElsewhere(p); });
  const t = normTitle(job.title);
  let a = s(job.address) ? free.filter(function(p){ return sameStreet(p.address || p.jobAddress, job.address); }) : [];
  if (a.length > 1) { const tt = a.filter(function(p){ return t && normTitle(p.name) === t; }); if (tt.length === 1) return one(tt[0], 'address+title'); }
  if (a.length === 1) return one(a[0], 'address');
  if (a.length > 1) { out.state = 'ambiguous'; out.how = 'address'; out.cands = a.map(function(p){ return cand(p, 'same address'); }); return out; }
  if (!a.length && s(job.address)) {   /* the only CRM jobs there are linked to ANOTHER bid job (a copy of this one?) — an admin decides, no new PO */
    const other = D.projects.filter(function(p){ return isOpen(p) && linkedElsewhere(p) && sameStreet(p.address || p.jobAddress, job.address); });
    if (other.length) { out.state = 'ambiguous'; out.how = 'address'; out.cands = other.map(function(p){ return cand(p, 'same address — linked to another bid job'); }); return out; }
  }
  const city = cityOf(job);
  if (t && city) {
    const c = free.filter(function(p){ return normTitle(p.name) === t && cityOf(p) === city; });
    if (c.length === 1) return one(c[0], 'title+city');
    if (c.length > 1) { out.state = 'ambiguous'; out.how = 'title+city'; out.cands = c.map(function(p){ return cand(p, 'same title and city'); }); return out; }
  }
  return out;
}

/* the CRM's numbering (index.html window.nextPO / patch LD2 autoPO): a letter + 3 digits, unique across every CRM job (deleted too),
   lead and bid job */
function nextPO(data, jobs, rnd){
  const D = prep(data), used = {};
  rnd = typeof rnd === 'function' ? rnd : Math.random;
  D.all.forEach(function(p){ [p && p.autoPO, p && p.po, p && p.poNumber].forEach(function(x){ if (poKey(x)) used[poKey(x)] = 1; }); });
  arr(data && data.leads).forEach(function(l){ [l && l.autoPO, l && l.jobPO, l && l.po].forEach(function(x){ if (poKey(x)) used[poKey(x)] = 1; }); });
  arr(jobs).forEach(function(j){ if (poKey(j && j.poNumber)) used[poKey(j.poNumber)] = 1; });
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let n = 0; n < 5000; n++) { const po = A[Math.floor(rnd() * 26)] + String(Math.floor(100 + rnd() * 900)); if (!used[po]) return po; }
  for (let n = 0; n < 5000; n++) { const po = A[Math.floor(rnd() * 26)] + A[Math.floor(rnd() * 26)] + String(Math.floor(100 + rnd() * 900)); if (!used[po]) return po; }
  return 'X' + String(Date.now()).slice(-5);
}

/* the job with the CRM's PO → { job (a copy), changed, info } — info is for an admin only (never stored, never to a sub) */
function apply(job0, data, opts){
  opts = opts || {};
  const job = Object.assign({}, job0), at = opts.now || new Date().toISOString();
  const r = resolve(job, data, opts), before = JSON.stringify(job0);
  const setPo = function(po, why){
    if (s(job.poNumber) === po) return;
    if (s(job.poNumber)) job.poHistory = arr(job.poHistory).concat([{ from: s(job.poNumber), to: po, at: at, why: why }]).slice(-20);
    job.poNumber = po;
  };
  if (r.state === 'linked') {
    const p = r.project, po = poOf(p);
    if (s(job.crmProjectId) !== s(p.id)) { job.crmProjectId = s(p.id); job.crmProjectAuto = r.how; job.crmProjectAt = at; job.crmProjectBy = opts.by || 'auto'; }
    if (s(job.crmProjectName) !== label(p)) job.crmProjectName = label(p);
    if (po) { setPo(po, r.how === 'link' || r.how === 'bidJobId' ? 'the CRM job\'s PO' : 'matched to the CRM job (' + r.how + ')'); job.poSource = 'crm'; }
    delete job.poNoMatch;
  } else if (r.state === 'none') {
    if (!s(job.poNumber) && !opts.noAssign) { job.poNumber = nextPO(data, opts.jobs, opts.rnd); job.poSource = 'assigned'; job.poAssignedAt = at; }
    else if (s(job.poNumber) && !s(job.poSource)) job.poSource = 'bid-site';
  }
  /* ambiguous: nothing changes until an admin picks */
  const changed = JSON.stringify(job) !== before;
  if (changed) job.updatedAt = job.updatedAt || at;
  return { job: job, changed: changed, info: { state: r.state, how: r.how, pid: r.project ? s(r.project.id) : '', name: r.project ? s(r.project.name) : '', po: s(job.poNumber), source: s(job.poSource), cands: r.cands, lead: r.lead ? s(r.lead.id) : '' }, resolved: r };
}

/* candidates for 🔗 Link to CRM job / Change link: the ambiguous ones first, then every live CRM job matching the words typed */
function search(job, data, q, opts){
  const D = prep(data), r = resolve(job, data, opts), seen = {}, out = [];
  const add = function(c){ if (!c || seen[c.pid]) return; seen[c.pid] = 1; out.push(c); };
  r.cands.forEach(add);
  if (r.project) add(cand(r.project, 'linked now'));
  D.projects.filter(function(p){ return s(job.address) && sameStreet(p.address || p.jobAddress, job.address); }).forEach(function(p){ add(cand(p, 'same address')); });
  const words = low(q).split(/\s+/).filter(function(w){ return w.length >= 2; });
  if (words.length) D.projects.filter(function(p){ const h = low([p.name, p.address, p.jobAddress, poOf(p), p.client].join(' ')); return words.every(function(w){ return h.indexOf(w) > -1; }); })
    .sort(function(a, b){ return (isOpen(b) - isOpen(a)) || s(b.updatedAt || b.createdAt).localeCompare(s(a.updatedAt || a.createdAt)); }).slice(0, 25).forEach(function(p){ add(cand(p, 'search')); });
  return out.slice(0, 30);
}

/* the CRM's site walk for the job: its CRM job's schedule (an item called site walk / pre-bid / walk-through), else the CRM job's or
   lead's pre-bid (the Lead Inbox: preBid "YYYY-MM-DD[THH:MM]", preBidLocation, preBidMandatory) → { date, time, location, mandatory, from } */
const WALK = /\b(site\s*walk|job\s*walk|walk[\s-]*through|pre[\s-]*bid)\b/i;
function crmSiteWalk(job, data, res){
  const D = prep(data); res = res || resolve(job, data);
  const p = res.project, l = res.lead;
  const today = new Date().toISOString().slice(0, 10);
  if (p) {
    const it = D.schedule.filter(function(x){ return x && !x.deleted && s(x.pid) === s(p.id) && WALK.test(s(x.title) + ' ' + s(x.type)) && /^\d{4}-\d{2}-\d{2}/.test(s(x.date)); })
      .sort(function(a, b){ const fa = s(a.date) >= today, fb = s(b.date) >= today; return (fb - fa) || (fa ? s(a.date).localeCompare(s(b.date)) : s(b.date).localeCompare(s(a.date))); })[0];
    if (it) return { date: s(it.date).slice(0, 10), time: /^\d{2}:\d{2}/.test(s(it.time)) ? s(it.time).slice(0, 5) : '', location: s(it.address) || s(p.address), mandatory: /mandatory/i.test(s(it.title)), from: 'schedule' };
  }
  const src = [p, l].filter(function(x){ return x && /^\d{4}-\d{2}-\d{2}/.test(s(x.preBid)); })[0];
  if (src) { const v = s(src.preBid); return { date: v.slice(0, 10), time: /T(\d{2}:\d{2})/.test(v) ? /T(\d{2}:\d{2})/.exec(v)[1] : '', location: s(src.preBidLocation) || s(job && job.address), mandatory: src.preBidMandatory === true, from: p === src ? 'job' : 'lead' }; }
  return null;
}

module.exports = { poOf, poKey, street, sameStreet, cityOf, normTitle, resolve, apply, nextPO, search, crmSiteWalk, isOpen, label, cand };
