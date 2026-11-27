/* patch ZIPIMPORT — 📦 IMPORT A ZIP OF JOB FILES (owner 11/25: "On the 💎 diamond menu I want import mass zip files. These files
   should be read and put into the correct job. If there is a question because no address / job name / PO is present, send to office
   and admin for approval for the right project … be able to choose which job the files go to instead of automatic read — a pull
   down for the project." + "make sure all documents when I send this zip also go into the portal under their documents too").
   · 💎 → "📦 Import ZIP of job files" (admins, the office and PMs — by role). An in-page sheet (light, no pop-ups).
   · Pick .zip files (or plain files / a whole folder). The job pulldown: "🔎 Read each file and place it (automatic)" or one job
     (every file goes there).
   · Automatic: each file's folders (deepest first, the ZIP's own name last), then its file name, then (PDFs only, when the path says
     nothing) the text of the PDF (window._gcPdfText — no new library) are matched against every job's PO (autoPO / po), street
     address (house number + street name), job name and client. One job → that job; none or several → "❓ needs a job".
   · Preview before anything is saved: each file's job (pulldown per file, and per folder = the whole folder at once), its
     category (the job Docs tab's categories) and ☑ "Show in the customer's portal" (ON by default — OFF, with the reason, for
     anything that reads as sub / internal paperwork: sub invoices, bids / quotes, W-9, a sub's COI, payroll, cost sheets, pricing;
     standing rule: never reveal sub data to customers).
   · Import → each file goes through the CRM file store (window._gcStoreFile: Supabase Storage "crm-files", the record keeps only
     sb:crm-files/<sha256>.<ext>) and onto the job's projectDocs list (the job's Docs / Files & Docs; the portal function reads the
     same list): portalShare true + portalLive (patch PORTALPOL: staff put it there, it shows at once) or portalShare false.
     A re-run skips a file already on that job (same job + name + size).
   · "Needs a job" files are stored too and wait as ONE card per import in ✅ Approvals (admins + the office): each file with a job
     pulldown → 📥 Place (its portal choice from the preview goes with it), or 🚫 Leave out.
   · Every import is logged in gc_kv "gc_zip_import" (a list of imports: who, when, each file and where it went). Never purged.
   Console: _gcZipImport.open(), .state(), .match(text), .refresh() */
(function(){
'use strict';
if (window.__GC_ZIPIMP__) return; window.__GC_ZIPIMP__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var K = 'gc_zip_import', LS = 'gc_zipimp_cache';
var SB_DEF = 'https://ieeonhpfahmwwecizdut.supabase.co';
var JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var JSZIP_SRI = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';
var CATS = (Array.isArray(W._AJ_DOC_CATS) && W._AJ_DOC_CATS.length) ? W._AJ_DOC_CATS.slice() : ['Plans/Drawings', 'Contracts', 'Permits', 'Sub Docs', 'Receipts', 'Change Orders', 'Invoices', 'Insurance Certs', 'Bid Responses', 'Warranty Docs', 'Specs', 'Other'];
var MAX_FILE = 50 * 1024 * 1024;

function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[GC zip import]', e && e.message || e); } catch (x) {} }
function crm(){ return W._crm || {}; }
function nowIso(){ return new Date().toISOString(); }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function kb(n){ n = +n || 0; return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

/* ── who ── */
function myEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function realAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function meU(){ var e = myEmail(); return arr(crm().users).filter(function(u){ return u && e && low(u.email) === e; })[0] || null; }
function myName(){ var u = meU(); if (u && s(u.name)) return s(u.name); try { return s(localStorage.getItem('grayco_user')) || myEmail(); } catch (e) { return myEmail(); } }
function role(){ try { if (W._gcRP && typeof W._gcRP.role === 'function') { var r = s(W._gcRP.role()); if (r) return r; } } catch (e) {} var u = meU(); return s(u && u.role); }
function rpStatus(){ try { return W._gcRP && W._gcRP.status ? W._gcRP.status() : null; } catch (e) { return null; } }
/* admins and the office: the approval card (an admin previewing another role sees that role's view) */
function officeOrAdmin(){
  if (!myEmail()) return false;
  var st = rpStatus();
  if (st && st.admin && st.viewAs) return /^(office|admin)/i.test(s(st.viewAs));
  if (realAdmin()) return true;
  var u = meU();
  return /^(office|admin)/i.test(role()) || !!(u && (/office|admin/i.test(s(u.role)) || low(u.payType) === 'owner'));
}
/* the import itself: admins, the office and PMs (an APM counts as a PM) */
function canImport(){
  if (officeOrAdmin()) return true;
  var r = role(), u = meU();
  return /project manager|^pm$|^apm$|assistant\s*(pm|project)/i.test(r) || !!(u && /project manager|^pm$|^apm$|assistant\s*(pm|project)/i.test(s(u.role)));
}

/* ── jobs ── */
function projects(){
  var dead = {}; try { if (typeof W._gcxDeadIds === 'function') arr(W._gcxDeadIds('projects')).forEach(function(id){ dead[id] = 1; }); } catch (e) {}
  return arr(crm().projects).filter(function(p){ return p && p.id != null && p.deleted !== true && p._deleted !== true && !dead[p.id] && !/^deleted$/i.test(s(p.status)); });
}
function proj(pid){ return projects().filter(function(p){ return String(p.id) === String(pid); })[0] || null; }
function poOf(p){ return s(p.autoPO || p.po || p.poNumber); }
function jobLabel(p){ return [s(p.name) || 'Job', s(p.address), poOf(p)].filter(Boolean).join(' — '); }
function jobsSorted(){
  var act = function(p){ return /complete|closed|cancel|lost|archiv/i.test(s(p.status)) ? 1 : 0; };
  return projects().slice().sort(function(a, b){ return act(a) - act(b) || low(a.name).localeCompare(low(b.name)); });
}

/* ── matching: PO, street address, job name, client ── */
function norm(t){ return ' ' + low(t).replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
function rxq(t){ return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
var DIR = '(?:n|s|e|w|ne|nw|se|sw|north|south|east|west)';
function keysOf(p){
  var k = { pid: String(p.id), po: [], addr: null, name: '', client: '' };
  [p.autoPO, p.po, p.poNumber].forEach(function(v){
    var c = low(v).replace(/^\s*(p\.?\s?o\.?|po)\s*[#:._-]*\s*/, '').replace(/[^a-z0-9]/g, '');
    if (c.length < 3 || !/\d/.test(c) || k.po.some(function(x){ return x.c === c; })) return;
    var m = /^([a-z]*)(\d+)([a-z]*)$/.exec(c), rx;
    if (m && !m[1] && !m[3]) rx = new RegExp(' (?:po|p o) ?' + c + ' ');              /* digits only: "PO 3001" / "PO-3001", never a bare number */
    else if (m) rx = new RegExp(' ' + m[1] + ' ?' + m[2] + (m[3] ? ' ?' + m[3] : '') + ' ');   /* K791 / "K 791" / "PO K791" */
    else rx = new RegExp(' ' + rxq(c) + ' ');
    k.po.push({ c: c, rx: rx });
  });
  var a = /^\s*(\d{1,6})[a-z]?\s+(?:(?:n|s|e|w|north|south|east|west)\.?\s+)?([a-z0-9]+)/i.exec(s(p.address));
  if (a && !/^(st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|blvd|hwy|highway)$/i.test(a[2])) k.addr = new RegExp(' ' + a[1] + ' (?:' + DIR + ' )?' + rxq(low(a[2])) + ' ');
  var n = norm(p.name).trim(); if (n.length >= 5) k.name = ' ' + n + ' ';
  var c2 = norm(p.client || p.customer).trim(); if (c2.length >= 4) k.client = ' ' + c2 + ' ';
  return k;
}
var KEYS = null, KEYSIG = '';
function allKeys(){
  var ps = projects(), sig = ps.length + ':' + ps.map(function(p){ return p.id + '|' + poOf(p) + '|' + s(p.address) + '|' + s(p.name) + '|' + s(p.client); }).join('~').length;
  if (!KEYS || sig !== KEYSIG) { KEYS = ps.map(keysOf); KEYSIG = sig; }
  return KEYS;
}
/* best job for a piece of text: {pid, why} when one job scores highest, {cands} when several tie, {} when none */
function match(text, min){
  var t = norm(text); if (t.length < 3) return {};
  var best = 0, tops = [], whys = {};
  allKeys().forEach(function(k){
    var sc = 0, why = [];
    if (k.po.some(function(x){ return x.rx.test(t); })) { sc += 10; why.push('PO'); }
    if (k.addr && k.addr.test(t)) { sc += 8; why.push('address'); }
    if (k.name && t.indexOf(k.name) >= 0) { sc += 4; why.push('job name'); }
    if (k.client && t.indexOf(k.client) >= 0) { sc += 2; why.push('client'); }
    if (!sc || sc < (min || 1)) return;
    whys[k.pid] = why;
    if (sc > best) { best = sc; tops = [k.pid]; } else if (sc === best) tops.push(k.pid);
  });
  if (tops.length === 1) return { pid: tops[0], why: whys[tops[0]].join(' + '), score: best };
  if (tops.length > 1) return { cands: tops, score: best };
  return {};
}
/* folders (deepest first, then the ZIP's name), then the file name, then the whole path */
function placeByPath(path, zipName){
  var seg = s(path).split('/').filter(Boolean), file = seg.pop() || '', base = file.replace(/\.[a-z0-9]{1,5}$/i, '');
  var dirs = seg.slice().reverse(); if (zipName) dirs.push(s(zipName).replace(/\.zip$/i, ''));
  var amb = null;
  for (var i = 0; i < dirs.length; i++) { var r = match(dirs[i]); if (r.pid) return { pid: r.pid, how: 'folder “' + dirs[i] + '” (' + r.why + ')' }; if (r.cands && !amb) amb = { cands: r.cands, at: 'folder “' + dirs[i] + '”' }; }
  var f = match(base); if (f.pid) return { pid: f.pid, how: 'file name (' + f.why + ')' };
  if (f.cands && !amb) amb = { cands: f.cands, at: 'file name' };
  var all = match(dirs.concat([base]).join(' / ')); if (all.pid) return { pid: all.pid, how: 'folder + file name (' + all.why + ')' };
  return amb ? { amb: amb } : {};
}

/* ── category (the job Docs tab's categories) and the portal rule ── */
function pick(cat){ return CATS.indexOf(cat) >= 0 ? cat : 'Other'; }
function guessCat(path, type){
  var t = low(path);
  if (/change.?order|\bc\.?o\.?\s?#?\d/.test(t)) return pick('Change Orders');
  if (/\bw-?9\b|\bcoi\b|certificate of insurance|insurance/.test(t)) return pick('Insurance Certs');
  if (/\bsubs?\b|subcontract/.test(t)) return pick('Sub Docs');
  if (/\bbids?\b|\bquotes?\b|bid response|proposal from/.test(t)) return pick('Bid Responses');
  if (/contract|agreement|signed|work auth|\bproposal/.test(t)) return pick('Contracts');
  if (/permit/.test(t)) return pick('Permits');
  if (/\bplans?\b|drawing|blueprint|elevation|floor ?plan|site ?plan|\.(dwg|dxf)$|\bsheet [a-z]?\d/.test(t)) return pick('Plans/Drawings');
  if (/invoice|\binv\b|pay ?app|billing|statement/.test(t)) return pick('Invoices');
  if (/receipt/.test(t)) return pick('Receipts');
  if (/warrant/.test(t)) return pick('Warranty Docs');
  if (/\bspecs?\b|specification|submittal/.test(t)) return pick('Specs');
  return 'Other';
}
function isPhoto(name, type){ return /^image\//.test(s(type)) || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(s(name)); }
/* the same words the portal keeps out by itself (netlify/functions/portal.js INTERNAL_DOC) + the owner's list */
var INTERNAL_RULES = [
  [/\bw-?9\b/, 'a W-9 (tax form)'],
  [/\bcoi\b|certificate of insurance|insurance cert/, 'an insurance certificate (a sub’s COI)'],
  [/\bsubs?\b|subcontract|sub-?contractor|sub.?agreement/, 'sub paperwork'],
  [/\bbids?\b|\bquotes?\b|bid response|bid form|pricing|price ?sheet|\bcosts?\b|cost ?sheet|budget|takeoff|margin|markup/, 'pricing / cost paperwork'],
  [/payroll|timesheet|pay ?stub|commission|\b1099\b|tax return/, 'payroll / tax paperwork'],
  [/vendor|supplier|purchase order/, 'vendor / supplier paperwork'],
  [/internal|job sheet|onboarding|operations manual/, 'internal paperwork'],
  /* PORTALSTRICT (owner 11/26: "only paperwork for the work — contracts, schedules, notices etc.; no sub scopes, internal, money documents") */
  [/invoice|\bbills?\b|pay ?app|payment|\bcheck\b|receipt|estimate|proposal|change order|retainage|lien|deposit|balance|statement|\$/, 'money paperwork (invoices, payments, estimates, change orders)'],
  [/scope/, 'a scope (sub / internal scopes stay off the portal)'],
  [/superintendent|hotels?|per ?diem|first day|toolbox|field forms?|legal checklist|labels?\b|\bsigns?\b|pickup|order checklist|read first|\bindex\b|training plan/, 'crew / field paperwork for GrayCo']
];
/* PORTALSTRICT: the portal box starts ticked ONLY for customer paperwork about the work */
var CUST_OK = /owner portal|for signature|signature|authorization|acknowledg|compliance (plan|package)|contract|agreement|schedule|look ?ahead|timeline|notice|notification|letter|memo|permit|plans?\b|drawings?|blueprint|specs?\b|specification|submittal|warranty|completion|closeout|close-out|inspection|report|minutes|meeting|safety plan|site plan|photo|certificate of occupancy|\bco\b cert|approval/;
function custOk(path){ return CUST_OK.test(low(path).replace(/[_]+/g, ' ')); }
function internalWhy(path){
  var t = low(path).replace(/[_]+/g, ' ');
  for (var i = 0; i < INTERNAL_RULES.length; i++) if (INTERNAL_RULES[i][0].test(t)) return INTERNAL_RULES[i][1];
  return '';
}

/* ── JSZip on demand (the page's pinned copy + its integrity hash) ── */
var zipP = null;
function loadZip(){
  if (W.JSZip) return Promise.resolve(W.JSZip);
  if (zipP) return zipP;
  zipP = new Promise(function(res, rej){
    var sc = D.createElement('script'); sc.src = JSZIP; sc.integrity = JSZIP_SRI; sc.crossOrigin = 'anonymous';
    sc.onload = function(){ W.JSZip ? res(W.JSZip) : rej(new Error('the ZIP reader did not load')); };
    sc.onerror = function(){ zipP = null; rej(new Error('the ZIP reader could not be loaded — check the internet connection')); };
    D.head.appendChild(sc);
  });
  return zipP;
}

/* ── gc_kv "gc_zip_import": every import (who, when, each file and where it went), merged by id, never purged ── */
function creds(){ var u = '', k = ''; try { u = s(localStorage.getItem('grayco_sb_url')).replace(/\/$/, ''); k = s(localStorage.getItem('grayco_sb_key')); } catch (e) {} return { u: u || SB_DEF, k: k }; }
function hdr(c, json){ var h = { apikey: c.k, Authorization: 'Bearer ' + c.k }; if (json) { h['Content-Type'] = 'application/json'; h.Prefer = 'resolution=merge-duplicates,return=minimal'; } return h; }
function parseList(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return arr(v).filter(function(x){ return x && typeof x === 'object' && x.id; }); }
function newer(a, b){ return s(b.updatedAt) > s(a.updatedAt) ? b : a; }
function mergeFiles(a, b){ var out = [], at = {}; arr(a).concat(arr(b)).forEach(function(f){ if (!f || !f.id) return; if (!(f.id in at)) { at[f.id] = out.length; out.push(f); } else out[at[f.id]] = newer(out[at[f.id]], f); }); return out; }
function mergeLists(a, b){
  var out = [], at = {};
  arr(a).concat(arr(b)).forEach(function(x){
    if (!x || !x.id) return;
    if (!(x.id in at)) { at[x.id] = out.length; out.push(x); return; }
    var y = out[at[x.id]], n = newer(y, x), m = Object.assign({}, n === y ? x : y, n); m.files = mergeFiles(y.files, x.files); if (y.contractReads || x.contractReads) m.contractReads = mergeFiles(y.contractReads, x.contractReads); if (y.docReads || x.docReads) m.docReads = mergeFiles(y.docReads, x.docReads); out[at[x.id]] = m;   /* patch CONTRACTREAD2: + docReads */
  });
  return out.sort(function(p, q){ return s(q.at).localeCompare(s(p.at)); });
}
function cache(){ try { return parseList(localStorage.getItem(LS)); } catch (e) { return []; } }
function setCache(l){ try { localStorage.setItem(LS, JSON.stringify(l)); } catch (e) {} }
var readAt = 0, reading = null;
function refresh(force){
  if (reading) return reading;
  if (!force && Date.now() - readAt < 45000) return Promise.resolve(cache());
  var c = creds(); if (!c.k) return Promise.resolve(cache());
  reading = W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + K + '&select=value', { headers: hdr(c), cache: 'no-store' })
    .then(function(r){ if (!r || !r.ok) throw new Error('read ' + (r && r.status)); return r.json(); })
    .then(function(rows){ readAt = Date.now(); var l = mergeLists(cache(), parseList(rows && rows[0] && rows[0].value)); setCache(l); fresh(); return l; })
    .catch(function(e){ warn(e); return cache(); })
    .then(function(l){ reading = null; return l; });
  return reading;
}
/* a phone's write guard (FIELDGUARD) sends only the keys a person changed: an import / a placement is one */
function personWrote(keys){ try { var fg = W.__gcFG; if (fg && fg.dirty) { keys.forEach(function(k){ fg.dirty[k] = Date.now(); }); } } catch (e) {} }
var wq = Promise.resolve();
function saveBatch(b){
  b.updatedAt = nowIso();
  setCache(mergeLists(cache(), [b])); fresh();
  wq = wq.then(function(){
    var c = creds(); if (!c.k) return false;
    return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + K + '&select=value', { headers: hdr(c), cache: 'no-store' })
      .then(function(r){ if (!r || !r.ok) throw new Error('read ' + (r && r.status)); return r.json(); })
      .then(function(rows){
        var l = mergeLists(mergeLists(parseList(rows && rows[0] && rows[0].value), cache()), [b]); setCache(l);
        personWrote([K]);
        return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: hdr(c, true), body: JSON.stringify({ key: K, value: l, updated_at: nowIso() }) })
          .then(function(r){ if (!r || !r.ok) throw new Error('write ' + (r && r.status)); return true; });
      })
      .catch(function(e){ warn(e); setTimeoutRetry(); return false; });
  });
  return wq;
}
var retryT = null;
function setTimeoutRetry(){ if (retryT) return; retryT = later(function(){ retryT = null; var l = cache(); if (l[0]) saveBatch(l[0]); }, 30000); }

/* ── the job's documents: projectDocs (the job Docs tab, Files & Docs count, the customer portal) ── */
function docsNow(){
  return Promise.resolve(typeof W.idbGet === 'function' ? W.idbGet('projectDocs') : null).catch(function(){ return null; }).then(function(all){
    return Array.isArray(all) ? all : arr(crm().projectDocs || W._gcProjectDocs);
  });
}
function addDocs(recs){
  if (!recs.length) return Promise.resolve(0);
  return docsNow().then(function(all){
    var have = {}; all.forEach(function(d){ if (d && d.id) have[d.id] = 1; });
    var add = recs.filter(function(r){ return !have[r.id]; }); if (!add.length) return 0;
    var next = all.concat(add);
    return Promise.resolve(typeof W.idbSet === 'function' ? W.idbSet('projectDocs', next) : null).catch(function(){}).then(function(){
      try { if (W._setProjectDocs) W._setProjectDocs(function(prev){ if (!Array.isArray(prev)) return next; var h = {}; prev.forEach(function(d){ if (d && d.id) h[d.id] = 1; }); return prev.concat(add.filter(function(r){ return !h[r.id]; })); }); } catch (e) {}
      try { if (W._crm) W._crm.projectDocs = next; } catch (e) {}
      personWrote(['projectDocs']);
      try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {}
      return add.length;
    });
  });
}
function dupKey(pid, name, size){ return String(pid) + '|' + low(name) + '|' + (+size || 0); }
function docIndex(all){ var h = {}; arr(all).forEach(function(d){ if (!d || d.deleted === true || d.pid == null) return; h[dupKey(d.pid, d.name, d.size)] = 1; if (d.origSize) h[dupKey(d.pid, d.name, d.origSize)] = 1; }); return h; }
/* a file that went to the office before (waiting, placed from ✅ Approvals or left out) is not sent again */
function waitingIndex(){ var h = {}; cache().forEach(function(b){ arr(b.files).forEach(function(f){ if (f && f.ref && (f.queued || !f.pid)) h[dupKey('?', f.name, f.size)] = 1; }); }); return h; }
function docRec(pid, f, meta, batchId, by){
  var at = nowIso(), on = !!f.portal;
  var r = { id: 'zdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), pid: String(pid), name: f.name, cat: f.cat || 'Other',
    type: meta.type || f.type || '', size: f.size, storedSize: meta.size || f.size, origSize: f.size, ref: meta.ref, hash: meta.hash || '',
    uploaded: at.slice(0, 10), uploadedAt: at, by: by, source: 'zip-import', zipBatch: batchId, zipPath: f.path, savedAt: at, updatedAt: at,
    portalShare: on };
  if (on) { r.portalLive = true; r.portalLiveAt = at; r.portalLiveBy = by; }   /* patch PORTALPOL: staff put it in the portal — live at once */
  else if (f.portalWhy) { r.internal = true; r.portalNever = true; r.portalOffWhy = f.portalWhy; }
  return r;
}

/* ── patch ZIPSCHED (owner 11/25: "when I send mass zips to put into each job's documents, if you read a schedule or tentative
   schedule make sure to put those into the schedule"): a schedule file in the import (its name / folder says schedule, tentative
   schedule, look-ahead, 3-week, construction schedule, timeline, Gantt, baseline) is read — Excel / CSV with the Schedule screen's
   own 📥 Import column guessing (task / activity, start, end / finish, duration, assignee / sub, trade), PDF text (window._gcPdfText:
   rows that pair an activity with a date or a date range — one row per line, or MS Project / P6 cell-per-line layouts), Word
   (window._gcDocxText). Fewer than 2 dated rows = not read (nothing guessed). The rows go on the job's Schedule like the Schedule
   screen's own import (same record shape; scope 'tentative' + tentative:true = the 📋 Tentative tab), tagged source 'zip-import',
   zipBatch, fromFile; never twice (same job + title + start). A needs-a-job file carries its rows to the office's 📥 Place. ── */
var SCHED_RX = /schedul|look.?ahead|\b\d{1,2}.?(week|wk)s?\b|timeline|gantt|baseline|milestones/i;
var TENT_RX = /tentative|proposed|draft|preliminary|prelim\b/i;
var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
var XLSX_SRI = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
var xlP = null;
function loadXlsx(){
  if (W.XLSX && W.XLSX.read) return Promise.resolve(W.XLSX);
  if (xlP) return xlP;
  xlP = new Promise(function(res, rej){
    var sc = D.createElement('script'); sc.src = XLSX_URL; sc.integrity = XLSX_SRI; sc.crossOrigin = 'anonymous';
    sc.onload = function(){ W.XLSX && W.XLSX.read ? res(W.XLSX) : rej(new Error('the Excel reader did not load')); };
    sc.onerror = function(){ xlP = null; rej(new Error('the Excel reader could not be loaded')); };
    D.head.appendChild(sc);
  });
  return xlP;
}
function p2(n){ return String(n).padStart(2, '0'); }
function okY(y){ return y >= 2020 && y <= 2099; }
var MONS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
var MON_SRC = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
function monOf(w){ w = low(w); return MONS[w.slice(0, 4)] || MONS[w.slice(0, 3)] || 0; }
function ymd(v){
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return okY(v.getFullYear()) ? v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate()) : '';
  if (typeof v === 'number') { if (v > 43000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); } return ''; }
  var t = s(v).toLowerCase().replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/, '').replace(/\s+\d{1,2}:\d{2}(\s*[ap]m)?$/, '');
  var m, y, mo, da;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  else if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(t))) { y = +(m[3].length === 2 ? '20' + m[3] : m[3]); mo = +m[1]; da = +m[2]; }
  else if ((m = new RegExp('^' + MON_SRC + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}|\\d{2})$').exec(t))) { mo = monOf(m[1]); da = +m[2]; y = +(m[3].length === 2 ? '20' + m[3] : m[3]); }
  else if ((m = new RegExp('^(\\d{1,2})[\\s\\-]' + MON_SRC + '\\.?[\\s\\-,]+(\\d{4}|\\d{2})$').exec(t))) { mo = monOf(m[2]); da = +m[1]; y = +(m[3].length === 2 ? '20' + m[3] : m[3]); }
  else return '';
  if (!okY(y) || mo < 1 || mo > 12 || da < 1 || da > 31) return '';
  var dt = new Date(y, mo - 1, da); if (dt.getMonth() !== mo - 1) return '';
  return y + '-' + p2(mo) + '-' + p2(da);
}
function addDays(d, n){ var x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); }
/* a table (rows of cells) → items, with the Schedule screen's 📥 Import column guessing; rows without a readable start are left out */
function hnorm(c){ return low(c).replace(/[_\-.#]/g, ' ').replace(/\s+/g, ' ').trim(); }
function hasWord(h, w){ return h === w || (' ' + h + ' ').indexOf(' ' + w + ' ') >= 0; }
var TKW = ['task', 'phase', 'activity', 'item', 'work', 'scope', 'milestone', 'name', 'title', 'task name', 'activity name', 'deliverable', 'line item', 'wbs name', 'description'];
var DKW = ['start', 'date', 'begin', 'planned start', 'actual start', 'start date', 'day', 'when', 'target start', 'finish'];
function rowsToItems(rows){
  var ne = arr(rows).filter(function(r){ return arr(r).some(function(c){ return s(c); }); });
  if (ne.length < 2) return [];
  var hIdx = -1;
  for (var i = 0; i < Math.min(15, ne.length); i++) {
    var rr = ne[i].map(hnorm);
    if (rr.some(function(h){ return TKW.some(function(k){ return hasWord(h, k); }); }) && rr.some(function(h){ return DKW.some(function(k){ return hasWord(h, k); }); })) { hIdx = i; break; }
  }
  if (hIdx < 0) return [];
  var hd = ne[hIdx].map(hnorm), dt = ne.slice(hIdx + 1);
  var fi = function(groups, not){ for (var g = 0; g < groups.length; g++) for (var x = 0; x < hd.length; x++) { if (not && not.indexOf(x) >= 0) continue; if (groups[g].some(function(w){ return hasWord(hd[x], w); })) return x; } return -1; };
  var tC = fi([['task name', 'activity name', 'wbs name'], ['task', 'phase', 'activity', 'item', 'work item', 'scope', 'milestone'], ['title', 'name', 'deliverable', 'line item'], ['description', 'desc']]);
  if (tC < 0) return [];
  var sC = fi([['start date', 'planned start', 'actual start', 'target start', 'early start'], ['start', 'begin', 'date', 'day', 'when', 'scheduled']], [tC]);
  var eC = fi([['end date', 'finish date', 'planned finish', 'completion date', 'early finish'], ['finish', 'end', 'complete', 'due', 'deadline']], [tC, sC]);
  var duC = fi([['duration', 'dur', 'days', 'length', 'span', 'orig dur', 'original duration']], [tC, sC, eC]);
  var aC = fi([['resource', 'resources', 'resource names', 'assigned', 'assignee', 'crew', 'responsible', 'superintendent', 'foreman', 'sub', 'subcontractor', 'contractor', 'who']], [tC, sC, eC, duC]);
  var tyC = fi([['trade', 'type', 'category']], [tC, sC, eC, duC, aC]);
  if (sC < 0 && eC < 0) return [];
  var out = [];
  dt.forEach(function(row){
    var t = s(row[tC]).replace(/\s+/g, ' '); if (!t || /^(grand )?(total|subtotal)$/i.test(t)) return;
    var st = sC >= 0 ? ymd(row[sC]) : '', en = eC >= 0 ? ymd(row[eC]) : '', du = duC >= 0 ? parseInt(String(row[duC]).replace(/[^\d]/g, ''), 10) || 0 : 0;
    if (!st && en && du > 0) st = addDays(en, -(du - 1));
    if (!st) return;
    if (en && en < st) en = '';
    out.push({ t: t.slice(0, 120), s: st, e: en && en !== st ? en : '', du: du, who: aC >= 0 ? s(row[aC]).slice(0, 80) : '', trade: tyC >= 0 ? s(row[tyC]).slice(0, 60) : '' });
  });
  return out;
}
function csvRows(txt){
  var rows = [], row = [], cur = '', q = false, sep = ',';
  var first = String(txt).split(/\r?\n/)[0] || ''; if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) sep = ';'; else if ((first.match(/\t/g) || []).length > (first.match(/,/g) || []).length) sep = '\t';
  for (var i = 0; i < txt.length; i++) {
    var c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
/* text (PDF / Word) → items: a line with an activity and one or two dates; or (cell-per-line layouts) an activity line followed by
   its date lines. Header, page and print lines are left out. */
var DATE_SRC = '(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?\\s+)?(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.](?:\\d{4}|\\d{2})(?![\\d\\/])|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}[\\s\\-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?[\\s\\-,]+(?:\\d{4}|\\d{2}))';
var NOT_ACT = /^(activity|task|task name|activity name|description|name|start|finish|end|duration|id|wbs|printed|print date|run date|data date|date|page|project|report|as of|prepared|layout|filter|total float|resource)\b|\bpage \d+ of \d+/i;
function cleanAct(t){
  return s(t).replace(/^[\s\-–•*]*(?:[A-Z]{0,4}[\-.]?\d+(?:[.\-]\d+)*[\s.)\-:]+)?/, '').replace(/\s+\d+(?:\.\d+)?\s*(?:d|day|days|wd|wk|wks|week|weeks|edays|h|hrs)\.?\s*$/i, '').replace(/\s+\d+\s*$/, '').replace(/[\s,;:|\-–]+$/, '').replace(/\s+/g, ' ');
}
function datesIn(line){ var rx = new RegExp(DATE_SRC, 'gi'), m, out = []; while ((m = rx.exec(line))) { var d = ymd(m[0].replace(/\.$/, '')); if (d) out.push({ d: d, i: m.index, n: m[0].length }); } return out; }
function schedFromText(text){
  var lines = String(text || '').split(/\n+/).map(function(l){ return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  var one = [], seen = {};
  var push = function(L, t, a, b){ t = cleanAct(t); if (!/[a-z].*[a-z].*[a-z]/i.test(t) || t.length > 120 || NOT_ACT.test(t)) return; if (b && b < a) b = ''; var k = low(t) + '|' + a; if (seen[k]) return; seen[k] = 1; L.push({ t: t, s: a, e: b && b !== a ? b : '', du: 0, who: '', trade: '' }); };
  lines.forEach(function(l){ var ds = datesIn(l); if (!ds.length || ds[0].i < 3) return; push(one, l.slice(0, ds[0].i), ds[0].d, ds[1] ? ds[1].d : ''); });
  if (one.length >= 2) return one.slice(0, 400);
  /* cell per line: an activity, then its start / finish on the lines that follow */
  var seq = [], cur = null; seen = {};
  var flush = function(){ if (cur && cur.d.length) push(seq, cur.t, cur.d[0], cur.d[1] || ''); cur = null; };
  lines.forEach(function(l){
    var ds = datesIn(l);
    var rest = ds.reduce(function(acc, x){ return acc.replace(l.substr(x.i, x.n), ' '); }, l).replace(/\b\d+(?:\.\d+)?\s*(?:d|days?|wd|wks?|weeks?|h|hrs)?\b/gi, ' ').replace(/[\s%$,.\-–]+/g, '');
    if (ds.length && !rest) { if (cur) { ds.forEach(function(x){ if (cur.d.length < 2) cur.d.push(x.d); }); if (cur.d.length >= 2) flush(); } return; }
    if (ds.length) { flush(); if (ds[0].i >= 3) push(seq, l.slice(0, ds[0].i), ds[0].d, ds[1] ? ds[1].d : ''); return; }
    if (!/[a-z]{3}/i.test(l)) return;   /* a duration / number cell between the activity and its dates */
    flush(); if (l.length <= 120 && !NOT_ACT.test(l)) cur = { t: l, d: [] };
  });
  flush();
  return seq.length >= 2 ? seq.slice(0, 400) : [];
}
function isSchedFile(r){ return SCHED_RX.test(r.path) && /\.(xlsx|xlsm|xls|csv|txt|pdf|docx)$/i.test(r.name); }
async function readSched(r){
  var b = await r.get(); if (!r.size) r.size = b.size;
  if (b.size > 25 * 1048576) return { items: [], text: '' };
  var ext = (/\.([a-z0-9]+)$/i.exec(r.name) || [])[1].toLowerCase(), items = [], text = '';
  if (ext === 'csv' || ext === 'txt') { text = await b.text(); items = rowsToItems(csvRows(text)); if (!items.length) items = schedFromText(text); }
  else if (/^xls/.test(ext)) {
    var XL = await loadXlsx(), wb = XL.read(new Uint8Array(await b.arrayBuffer()), { type: 'array', cellDates: true, raw: false });
    wb.SheetNames.forEach(function(n){ var ws = wb.Sheets[n]; if (!ws || !ws['!ref'] || items.length) return; var rows = XL.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false }); items = rowsToItems(rows); if (!text) text = rows.slice(0, 8).map(function(x){ return arr(x).join(' '); }).join('\n'); });
  }
  else if (ext === 'pdf' && typeof W._gcPdfText === 'function') { text = s(await W._gcPdfText(new Uint8Array(await b.arrayBuffer()))); items = schedFromText(text); }
  else if (ext === 'docx' && typeof W._gcDocxText === 'function') { text = s(await W._gcDocxText(new Uint8Array(await b.arrayBuffer()))); items = schedFromText(text); }
  return { items: items, text: text.slice(0, 4000) };
}
async function detectScheds(){
  var L = S.rows.filter(function(r){ return !r.schedRead && r.status !== 'big' && isSchedFile(r); });
  for (var i = 0; i < L.length; i++) {
    var r = L[i]; r.schedRead = true;
    try {
      msg('Reading the schedule in ' + r.name + '…');
      var x = await readSched(r);
      if (x.items.length) r.sched = { on: true, tent: TENT_RX.test(r.path) || TENT_RX.test(x.text.slice(0, 3000)), open: false, items: x.items.map(function(it){ it.on = true; return it; }) };
    } catch (e) { warn(e); }
  }
  msg('');
}
function schedPicked(r){ return r.sched && r.sched.on ? r.sched.items.filter(function(it){ return it.on !== false; }) : []; }
function schedRecs(pid, items, tent, ctx){
  var p = proj(pid) || {};
  return arr(items).map(function(it, i){
    var notes = [it.e ? 'End: ' + it.e : '', it.du ? it.du + ' days' : '', it.trade ? 'Trade: ' + it.trade : '', 'From ' + ctx.file].filter(Boolean).join(' | ');
    return { id: 'SCH' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '_' + i, pid: String(pid), title: it.t, date: it.s, endDateSch: it.e || '',
      time: '08:00', endTime: '17:00', assignee: it.who || '', vendor: '', type: 'work', address: s(p.address), notes: notes,
      scope: tent ? 'tentative' : 'company', tentative: !!tent, by: ctx.by, createdBy: ctx.by, source: 'zip-import', zipBatch: ctx.batch, fromFile: ctx.file, createdAt: nowIso() };
  });
}
function schedKey(x){ return String(x.pid) + '|' + low(x.title) + '|' + s(x.date); }
function addSched(recs){
  if (!recs.length) return Promise.resolve(0);
  return Promise.resolve(typeof W.idbGet === 'function' ? W.idbGet('schedule') : null).catch(function(){ return null; }).then(function(cur){
    var live = (Array.isArray(cur) ? cur : []).concat(arr(crm().schedule)), have = {};
    live.forEach(function(e){ if (e && e.pid != null && e.deleted !== true) have[schedKey(e)] = 1; });
    var add = recs.filter(function(m){ var k = schedKey(m); if (have[k]) return false; have[k] = 1; return true; });
    if (!add.length) return 0;
    personWrote(['schedule']);
    var put = function(base){
      var h = {}; base.forEach(function(e){ if (e && e.pid != null) h[schedKey(e)] = 1; });
      var out = base.concat(add.filter(function(m){ return !h[schedKey(m)]; }));
      try { if (W.idbSet) W.idbSet('schedule', out); } catch (e) {}
      try { if (W._supaUpsert) W._supaUpsert('schedule', out); } catch (e) {}
      return out;
    };
    if (typeof W._setSchedule === 'function') { var done = false; W._setSchedule(function(prev){ var out = put(Array.isArray(prev) ? prev : (Array.isArray(cur) ? cur : [])); done = true; return out; }); if (!done) put(Array.isArray(cur) ? cur : []); }
    else { var out = put(Array.isArray(cur) ? cur : []); try { if (W._crm) W._crm.schedule = out; } catch (e) {} }
    return add.length;
  });
}

/* ── patch CONTRACTREAD (owner 11/26, Clarendon - CSI: "I entered a contract, it should have read the contract and took the info out
   of it for the contract price"): a contract-type file in the import (category Contracts, or its name says contract / agreement /
   award / notice to proceed / purchase order / bid proposal form / schedule of values) is read — PDF (_gcPdfText), Word
   (_gcDocxText), Excel (SheetJS) — for a LABELLED total: Contract Sum / Price / Amount, Total Contract, Award Amount, Total Base
   Bid, Grand Total (and "Total" on a schedule of values). The largest of the strongest labels wins; unit prices, insurance limits,
   per-day amounts, dates and phone numbers are never read; no label = nothing. Sub / vendor / change-order / pay-app paperwork and a
   file that went to several jobs never set a job's contract. Several files on one job → the most confident one.
   An empty / $0 contract is set (window._gcxPatchJob: a person's edit by the importer, SYNC-A) and the job remembers where it came
   from (contractFrom); a job that already has a contract is never changed — its page shows "📄 <file> says $X — the job shows $Y
   · ✅ Use $X · Keep" under the money tiles until someone answers. Kept in gc_zip_import (contractReads), so every computer sees it. ── */
var CT_NAME = /contract|agreement|\baward|notice to proceed|\bntp\b|purchase order|bid proposal|proposal form|bid form|schedule of values|\bsov\b/i;
var CT_NOT = /\bsubs?\b|subcontract|sub-?contractor|sub.?agreement|vendor|supplier|\bw-?9\b|\bcoi\b|insurance|payroll|change.?order|\bc\.?o\.?\s?#?\d|pay ?app|invoice|lien|waiver|amendment/i;
var CT_STRONG = /(original\s+)?contract\s+(sum|price|amount|total|value)|total\s+contract(\s+(sum|price|amount|value))?|award(ed)?\s+amount|amount\s+of\s+(the\s+)?award|total\s+base\s+bid|base\s+bid\s+total|total\s+bid(\s+amount|\s+price)?|grand\s+total|lump\s+sum(\s+price|\s+amount)?|total\s+project\s+(cost|price|amount)/i;
var CT_WEAK = /^\s*(sov\s+)?total\b|\btotal\s*(:|\$)|\btotals?\s*$/i;
var CT_BAD = /insurance|limit|occurrence|aggregate|liquidated|per\s+day|per\s+diem|retain|deductible|bond\s+amount|penalty|unit\s+price|allowance|per\s+(sf|sq|lf|ea|hour|hr|unit|each)|\/\s?(sf|lf|hr|ea|day)\b|hourly|rate/i;
var MONEY = /\$\s*\d[\d,]*(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g;
function moneyIn(t){ var m, out = []; MONEY.lastIndex = 0; while ((m = MONEY.exec(t))) { var after = t.slice(m.index + m[0].length, m.index + m[0].length + 14); if (/^\s*(\/|per\b|each\b|ea\b|sf\b|lf\b|hr\b)/i.test(after)) continue; var v = parseFloat(m[0].replace(/[$,\s]/g, '')); if (v >= 500 && v < 1e9) out.push(v); } return out; }
/* text → { amount, label, conf } (conf 3 = a contract-sum label, 2 = "Total" on a schedule of values) or null */
function contractFromText(text, sov){
  var lines = String(text || '').split(/\n+/).map(function(l){ return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean), best = null;
  var take = function(v, label, conf){ if (!best || conf > best.conf || (conf === best.conf && v > best.amount)) best = { amount: Math.round(v * 100) / 100, label: label, conf: conf }; };
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i], m = CT_STRONG.exec(l), conf = 3;
    if (!m && sov && CT_WEAK.test(l)) { m = CT_WEAK.exec(l); conf = 2; }
    if (!m) continue;
    var tail = l.slice(m.index + m[0].length), ctx = l.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
    if (CT_BAD.test(ctx)) continue;
    var vs = moneyIn(tail.slice(0, 200));
    if (!vs.length && i + 1 < lines.length && !CT_STRONG.test(lines[i + 1]) && lines[i + 1].length < 200) vs = moneyIn(lines[i + 1]);   /* the amount on the next line (cell-per-line PDFs) */
    if (!vs.length) continue;
    take(Math.max.apply(null, vs), m[0].replace(/\s+/g, ' ').trim(), conf);
  }
  return best;
}
/* a sheet (rows of cells) → the same: a row whose words are a contract-sum / total label, its largest amount */
function contractFromRows(rows, sov){
  var best = null;
  arr(rows).forEach(function(r){
    var words = arr(r).filter(function(c){ return typeof c === 'string' && /[a-z]{3}/i.test(c); }).join(' '), nums = [];
    arr(r).forEach(function(c){ var v = typeof c === 'number' ? c : (/^\s*\$?\s*[\d,]+(\.\d+)?\s*$/.test(String(c)) ? parseFloat(String(c).replace(/[$,\s]/g, '')) : NaN); if (isFinite(v) && v >= 500 && v < 1e9) nums.push(v); });
    if (!words || !nums.length || CT_BAD.test(words)) return;
    var conf = CT_STRONG.test(words) ? 3 : (sov && /^\s*(grand\s+)?totals?\b|\btotals?\s*$/i.test(words) ? 2 : 0);
    if (!conf) return;
    var v = Math.max.apply(null, nums);
    if (!best || conf > best.conf || (conf === best.conf && v > best.amount)) best = { amount: Math.round(v * 100) / 100, label: words.slice(0, 60), conf: conf };
  });
  return best;
}
function isContractFile(r){ return /\.(pdf|docx|xlsx|xls)$/i.test(r.name) && !CT_NOT.test(r.path) && (r.cat === 'Contracts' || CT_NAME.test(r.path)); }
async function readContract(get, name, path){
  var b = await get(); if (b.size > 25 * 1048576) return null;
  var ext = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toLowerCase(), sov = /schedule of values|\bsov\b/i.test(path);
  if (ext === 'pdf' && typeof W._gcPdfText === 'function') { var t = s(await W._gcPdfText(new Uint8Array(await b.arrayBuffer()))); return contractFromText(t, sov || /schedule of values/i.test(t.slice(0, 2000))); }
  if (ext === 'docx' && typeof W._gcDocxText === 'function') { var t2 = s(await W._gcDocxText(new Uint8Array(await b.arrayBuffer()))); return contractFromText(t2, sov || /schedule of values/i.test(t2.slice(0, 2000))); }
  if (/^xls/.test(ext)) {
    var XL = await loadXlsx(), wb = XL.read(new Uint8Array(await b.arrayBuffer()), { type: 'array', raw: true }), best = null;
    wb.SheetNames.forEach(function(n){ var ws = wb.Sheets[n]; if (!ws || !ws['!ref']) return; var rows = XL.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
      var sv = sov || rows.slice(0, 6).some(function(r){ return /schedule of values/i.test(arr(r).join(' ')); }); var x = contractFromRows(rows, sv); if (x && (!best || x.conf > best.conf || (x.conf === best.conf && x.amount > best.amount))) best = x; });
    return best;
  }
  return null;
}
function money2(n){ return '$' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function curContract(p){ return parseFloat(String(p && (p.contract != null && p.contract !== '' ? p.contract : p.contractAmount) || '').replace(/[$,\s]/g, '')) || 0; }
/* one read → the job: set it when the job has none, else an open "Use / Keep" note */
async function applyContract(pid, rd, file, batch, by){
  var p = proj(pid); if (!p || !rd) return null;
  var cur = curContract(p), at = nowIso();
  if (!cur && +rd.cloudCur > 0) cur = +rd.cloudCur;   /* patch CONTRACTREAD2: the cloud's copy of the job already has one (typed on another computer) */
  var rec = { id: 'ct_' + String(pid) + '_' + low(file).replace(/[^a-z0-9]+/g, '_').slice(0, 40), pid: String(pid), job: s(p.name), file: file, amount: rd.amount, label: rd.label, conf: rd.conf, was: cur, at: at, by: by, updatedAt: at };
  /* patch CONTRACTREAD2: a person's ✅ Use / Keep on this job is final — a later read only records itself, it never asks again */
  var decided = ctFor(pid).filter(function(o){ return o.x.state === 'used' || o.x.state === 'kept'; })[0];
  if (decided) { rec.state = 'after-decision'; rec.decided = decided.x.state; batch.contractReads = arr(batch.contractReads).filter(function(x){ return x.id !== rec.id; }).concat([rec]); return rec; }
  if (rd.noteOnly) rec.noteOnly = true;
  if (!cur && rd.noteOnly) rec.state = 'open';   /* a proposal / estimate: never the price by itself — ✅ Use / Keep */
  else if (!cur) {
    var ok = false;
    if (typeof W._gcxPatchJob === 'function') { try { ok = await W._gcxPatchJob(String(pid), { contract: rd.amount, contractFrom: { file: file, amount: rd.amount, label: rd.label, at: at, by: by, zipBatch: batch.id } }, 'Contract ' + money2(rd.amount) + ' read from ' + file); } catch (e) { warn(e); } }
    rec.state = ok ? 'set' : 'open';
  } else rec.state = Math.abs(cur - rd.amount) < 0.01 ? 'same' : 'open';
  batch.contractReads = arr(batch.contractReads).filter(function(x){ return x.id !== rec.id; }).concat([rec]);
  return rec;
}
function ctLine(x){ return x.state === 'set' ? '💲 Contract price read: ' + esc(x.job) + ' ' + money2(x.amount) + ' (from ' + esc(x.file) + ')'
  : x.state === 'open' ? '💲 ' + esc(x.job) + ': ' + esc(x.file) + ' says ' + money2(x.amount) + ' — the job shows ' + money2(x.was) + ' (✅ Use / Keep on the job page)'
  : x.state === 'same' ? '💲 ' + esc(x.job) + ': ' + esc(x.file) + ' says ' + money2(x.amount) + ' — the same as the job' : ''; }
/* the job page: the open note (and the last read, as the job's own record of where its contract came from) */
function ctFor(pid){ var out = []; cache().forEach(function(b){ arr(b.contractReads).forEach(function(x){ if (x && String(x.pid) === String(pid)) out.push({ x: x, b: b }); }); }); return out.sort(function(a, c){ return s(c.x.updatedAt).localeCompare(s(a.x.updatedAt)); }); }
function ctStrip(){ var b = [].slice.call(D.querySelectorAll('main button, #root button')).filter(function(x){ return /^Files & Docs \(/.test(s(x.textContent)); })[0]; return b ? b.parentElement : null; }
var ctSig = '';
function ctPaint(){
  try {
    var op = W._gcOpenProject, pid = op && op.id, el = D.getElementById('gc-zipct');
    var st = pid && canImport() ? ctStrip() : null;
    if (!st) { if (el) el.remove(); return; }
    var L = ctFor(pid), open = L.filter(function(o){ return o.x.state === 'open'; }), p = proj(pid) || op, cur = curContract(p);
    open = open.filter(function(o){ return Math.abs(cur - o.x.amount) >= 0.01; });
    var last = L.filter(function(o){ return o.x.state === 'set' || o.x.state === 'used'; })[0];
    var sig = pid + '|' + cur + '|' + open.map(function(o){ return o.x.id + o.x.amount; }).join(',') + '|' + (last ? last.x.id + last.x.state : '');
    if (!open.length && !last) { if (el) el.remove(); return; }
    if (el && el.__sig === sig && el.nextElementSibling === st) return;
    if (!el) { el = D.createElement('div'); el.id = 'gc-zipct'; el.setAttribute('data-gc-keep', '1'); }
    el.__sig = sig;
    el.style.cssText = 'margin:8px 0;display:flex;flex-direction:column;gap:6px;font:13px Inter,-apple-system,Arial,sans-serif';
    el.innerHTML = open.map(function(o){ var x = o.x;
      return '<div data-ct="' + esc(x.id) + '" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#fffbeb;border:1px solid #fcd34d;color:#78350f;border-radius:10px;padding:8px 12px">' +
        '<span style="flex:1 1 240px;min-width:0;overflow-wrap:anywhere">📄 <b>' + esc(x.file) + '</b> says <b>' + money2(x.amount) + '</b> — the job shows ' + money2(cur) + (x.label ? ' <span style="color:#92400e;font-size:12px">(“' + esc(x.label) + '”)</span>' : '') + '</span>' +
        '<button type="button" data-ct-use="' + esc(x.id) + '" style="border:1px solid #15803d;background:#16a34a;color:#fff;border-radius:8px;padding:6px 12px;font:700 13px inherit;cursor:pointer">✅ Use ' + money2(x.amount) + '</button>' +
        '<button type="button" data-ct-keep="' + esc(x.id) + '" style="border:1px solid #d6dbe3;background:#fff;color:#334155;border-radius:8px;padding:6px 12px;font:600 13px inherit;cursor:pointer">Keep</button></div>'; }).join('') +
      (last && !open.length ? '<div style="color:#64748b;font-size:12px">📄 Contract ' + money2(last.x.amount) + ' read from ' + esc(last.x.file) + ' · ' + esc(s(last.x.updatedAt).slice(0, 10)) + (last.x.state === 'used' ? ' (used by ' + esc(last.x.decidedBy || '') + ')' : last.b.id === DR_ID ? ' (read from the job\'s documents)' : ' (ZIP import by ' + esc(last.x.by) + ')') + '</div>' : '');
    st.parentNode.insertBefore(el, st);
    el.querySelectorAll('[data-ct-use],[data-ct-keep]').forEach(function(bt){ bt.onclick = function(){ var use = bt.hasAttribute('data-ct-use'); ctDecide(pid, bt.getAttribute(use ? 'data-ct-use' : 'data-ct-keep'), use); }; });
  } catch (e) { warn(e); }
}
async function ctDecide(pid, id, use){
  var hit = null; ctFor(pid).forEach(function(o){ if (o.x.id === id && !hit) hit = o; }); if (!hit) return;
  var x = hit.x, by = myName(), at = nowIso();
  if (use) {
    var ok = false; try { ok = typeof W._gcxPatchJob === 'function' && await W._gcxPatchJob(String(pid), { contract: x.amount, contractFrom: { file: x.file, amount: x.amount, label: x.label, at: at, by: by, zipBatch: hit.b.id, replaced: x.was } }, 'Contract ' + money2(x.amount) + ' from ' + x.file); } catch (e) { warn(e); }
    if (!ok) { toast('Could not change the job — open it and try again.'); return; }
  }
  var b = hit.b; b.contractReads = arr(b.contractReads).map(function(y){ return y.id === id ? Object.assign({}, y, { state: use ? 'used' : 'kept', decidedBy: by, decidedAt: at, updatedAt: at }) : y; });
  await saveBatch(b);
  toast(use ? '✅ Contract set to ' + money2(x.amount) : 'Kept ' + money2(curContract(proj(pid))));
  ctSig = ''; var el = D.getElementById('gc-zipct'); if (el) el.__sig = ''; later(ctPaint, 50);
}
var ctReadAt = 0;
SI.call(W, function(){ try { if (D.hidden) return; var op = W._gcOpenProject; if (op && op.id && canImport() && Date.now() - ctReadAt > 60000) { ctReadAt = Date.now(); refresh(false).then(ctPaint); } ctPaint(); drPaint(); } catch (e) {} }, 1500);

/* ── patch CONTRACTREAD2 + DOCSCHED (owner 11/27, the Projects list with every Head Start job at Contract $0.00: "my contracts with
   amounts officially are in the crm and under contracts it should be reading that and entering here" + "this should be reading my
   schedule and putting it in here if i put any schedule in for the job in the documents"): the documents ALREADY on the jobs are
   read — not only a ZIP being imported. The CRM page reads them (it has the PDF / Word / Excel readers), quietly, a few jobs at a
   time when the page is idle, on a computer of an admin, the office or a PM (by role). Any way a file got onto a job (📦 ZIP, the
   job's Documents upload / drag-drop, the field app, the portals) lands in projectDocs, and that list is what is looked at.
   · The contract: category Contracts or a contract-like name; never a subcontract / sub agreement (nor category Sub Docs), nor
     change orders, invoices, insurance, lien waivers. In order: "contract" + "signed" / "executed" → an exhibit / award → any
     other "contract" / "agreement" → (only when nothing else exists) a proposal / estimate / quote. The first of those that has a
     labelled amount (CONTRACTREAD's own reader) is used. An empty / $0 contract is set through window._gcxPatchJob (contract +
     contractFrom only); a job that has a contract only gets the "📄 <file> says $X — the job shows $Y · ✅ Use · Keep" note; a
     proposal / estimate, or one file on several jobs, never sets the price — it is always the note. A person's Use / Keep is final.
   · A schedule (any category; schedule / tentative schedule / look-ahead / timeline / Gantt / calendar — never a schedule of
     values) is read with ZIPSCHED's reader and added like ZIPSCHED (never twice: same job + title + start; nothing is removed, the
     person-typed Start / Finish entries stay). A tentative one goes on the 📋 Tentative tab and, on a job that is already active /
     approved / scheduled, TENTPOST's card asks on the job page "📅 Tentative schedule found in <file> (N items) — ✅ Post as the
     schedule · ✏️ Edit first · Later". Never posted silently.
   · Each file is read once: gc_kv gc_zip_import keeps one record "zi_docread" (docReads per document id + the contractReads the job
     page shows), so every computer knows what was read. A file that could not be fetched is tried again (3 times).
   · 💎 → "📄 Read contract prices and schedules from job documents" (admins): runs it now for every job, with the results listed.
   Console: _gcDocRead.run({ all: true }), .state(), .tier(doc), .isSched(doc) ── */
var DR_ID = 'zi_docread';
var DR = { busy: false, runs: 0, startAt: Date.now(), last: [], errs: 0, lastRun: '' };
var DR_FIRST = +W.__GC_DOCREAD_FIRST__ || 75000, DR_EVERY = +W.__GC_DOCREAD_EVERY__ || 20000, DR_JOBS = 3;
var GO_ST = /^(active|approved|in[ _-]?progress|scheduled)$/i;
function isAdminNow(){
  if (!myEmail()) return false;
  var st = rpStatus(); if (st && st.admin && st.viewAs) return /^admin/i.test(s(st.viewAs));
  if (realAdmin()) return true;
  var u = meU(); return /^admin/i.test(role()) || !!(u && (/^admin/i.test(s(u.role)) || low(u.payType) === 'owner'));
}
function drRec(){ var b = cache().filter(function(x){ return x.id === DR_ID; })[0]; return b ? JSON.parse(JSON.stringify(b)) : { id: DR_ID, kind: 'docread', at: '2026-11-27T00:00:00.000Z', by: 'CRM (job documents)', files: [], contractReads: [], docReads: [] }; }
function docPid(d){ return s(d && (d.pid != null && d.pid !== '' ? d.pid : (d.projectId || d.jobId))); }
function docName(d){ return s(d && (d.name || d.fileName || d.title)); }
function docExt(d){ var m = /\.([a-z0-9]{2,5})$/i.exec(docName(d)) || /\.([a-z0-9]{2,5})$/i.exec(s(d && d.ref)); return m ? m[1].toLowerCase() : ''; }
function docSrc(d){ if (/^sb:crm-files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/.test(s(d && d.ref))) return 'ref'; if (/^data:[a-z]/i.test(s(d && (d.data || d.url)))) return 'data'; return ''; }
function nmz(t){ return ' ' + low(t).replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
var CT2_NOT = /\bsub ?contract|\bsub(contractor)? ?agreement|\bsubs?\b|change ?order|\bco \d|invoice|\blien\b|waiver|insurance|\bcoi\b|\bw ?9\b|payroll|pay ?app|vendor|supplier|amendment/;
/* the contract file's rank: 1 signed contract · 2 contract / agreement · 3 exhibit / award · 4 proposal / estimate (the note only) · 0 not one */
function ctTier(d){
  if (!d || !/^(pdf|docx|xlsx|xls)$/.test(docExt(d))) return 0;
  var n = nmz(docName(d)), cat = low(d.cat);
  if (/\bsub/.test(cat) || CT2_NOT.test(n)) return 0;
  if (!(cat === 'contracts' || /contract|agreement|award|exhibit|proposal|estimate|quote/.test(n))) return 0;
  if (/contract/.test(n) && /\b(signed|executed)\b/.test(n)) return 1;
  if (/exhibit|\baward/.test(n)) return 3;
  if (/contract|agreement/.test(n)) return 2;
  if (/proposal|estimate|\bquote\b|\bbid\b/.test(n)) return 4;
  return 0;
}
function isSchedDoc(d){
  if (!d || !/^(pdf|docx|xlsx|xlsm|xls|csv|txt)$/.test(docExt(d))) return false;
  var n = nmz(docName(d));
  if (/schedule of values|\bsov\b|pay ?app|invoice|\bpay ?schedule|payment schedule|draw schedule/.test(n)) return false;
  return /schedul|look ?ahead|timeline|gantt|calendar/.test(n);
}
/* read at its ZIP import already (CONTRACTREAD / ZIPSCHED of that import) */
function zipHandled(d, kind){
  if (!d || !d.zipBatch) return false;
  var b = cache().filter(function(x){ return x.id === d.zipBatch; })[0]; if (!b) return false;
  if (kind === 'contract') return arr(b.contractReads).some(function(x){ return x && String(x.pid) === docPid(d) && low(x.file) === low(docName(d)); });
  return arr(b.files).some(function(f){ return f && f.docId === d.id && +f.schedItems > 0; });
}
function readsOf(rec){ var h = {}; arr(rec.docReads).forEach(function(x){ if (x && x.id) h[x.id] = x; }); return h; }
function needRead(h, id){ var x = h[id]; if (!x) return true; return x.state === 'retry' && (+x.tries || 0) < 3 && Date.now() - (Date.parse(x.updatedAt) || 0) > 10 * 60000; }
function putRead(rec, h, o){ o.updatedAt = nowIso(); h[o.id] = o; rec.docReads = arr(rec.docReads).filter(function(x){ return x && x.id !== o.id; }).concat([o]); return o; }
async function docBlob(d){
  if (docSrc(d) === 'ref') { if (typeof W._gcFileBlob !== 'function') { var e0 = new Error('the file store is not on this page'); e0.code = 'offline'; throw e0; } return await W._gcFileBlob(d.ref); }
  var r = await W.fetch(s(d.data || d.url)); return await r.blob();
}
function workOf(pid, docs, rec){
  var h = readsOf(rec), ct = [], sc = [];
  docs.forEach(function(d){
    if (docPid(d) !== pid) return;
    var t = ctTier(d); if (t && !zipHandled(d, 'contract') && needRead(h, 'ct|' + d.id)) ct.push({ d: d, t: t });
    if (isSchedDoc(d) && !zipHandled(d, 'sched') && needRead(h, 'sc|' + d.id)) sc.push(d);
  });
  return { ct: ct, sc: sc };
}
function retryOrGiveUp(rec, h, id, base, e){
  var x = h[id], n = (+(x && x.tries) || 0) + 1, code = s(e && e.code);
  var soft = code === 'offline' || code === 'missing' || /fetch|network|storage|reach/i.test(s(e && e.message));
  return putRead(rec, h, Object.assign(base, { state: soft && n < 3 ? 'retry' : 'unreadable', tries: n, why: s(e && e.message || e).slice(0, 120) }));
}
/* the job as the cloud has it now (null = could not be read) */
function cloudJob(pid){
  var c = creds(); if (!c.k) return Promise.resolve(null);
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.projects&select=value', { headers: hdr(c), cache: 'no-store' })
    .then(function(r){ if (!r || !r.ok) throw new Error('read ' + (r && r.status)); return r.json(); })
    .then(function(rows){ var v = rows && rows[0] && rows[0].value; if (typeof v === 'string') v = JSON.parse(v); return arr(v).filter(function(q){ return q && String(q.id) === String(pid); })[0] || {}; })
    .catch(function(e){ warn(e); return null; });
}
async function drContract(pid, docs, rec, by, out){
  var p = proj(pid); if (!p) return;
  var h = readsOf(rec), cands = workOf(pid, docs, rec).ct; if (!cands.length) return;
  var best = 9;
  arr(rec.docReads).forEach(function(x){ if (x && x.kind === 'contract' && String(x.pid) === pid && +x.amount > 0 && x.tier && x.state !== 'unreadable') best = Math.min(best, +x.tier); });
  cache().forEach(function(b){ if (b.id !== DR_ID && arr(b.contractReads).some(function(x){ return x && String(x.pid) === pid; })) best = Math.min(best, 2); });
  for (var t = 1; t <= 4; t++) {
    var L = cands.filter(function(c){ return c.t === t; }); if (!L.length) continue;
    if (t > best) { L.forEach(function(c){ putRead(rec, h, { id: 'ct|' + c.d.id, kind: 'contract', docId: c.d.id, pid: pid, file: docName(c.d), tier: t, state: 'skipped', why: 'a better contract file was read', at: nowIso(), by: by }); }); continue; }
    var got = null;
    for (var i = 0; i < L.length; i++) {
      var d = L[i].d, nm = docName(d), base = { id: 'ct|' + d.id, kind: 'contract', docId: d.id, pid: pid, job: s(p.name), file: nm, tier: t, at: nowIso(), by: by };
      var rd = null;
      try { rd = await readContract(function(){ return docBlob(d); }, nm, nm); }
      catch (e) { warn(e); var rr = retryOrGiveUp(rec, h, base.id, base, e); out.push({ pid: pid, job: s(p.name), kind: 'contract', file: nm, state: rr.state, line: rr.state === 'retry' ? '⏳ ' + esc(p.name) + ': ' + esc(nm) + ' could not be fetched yet — tried again later' : '⚠ ' + esc(p.name) + ': ' + esc(nm) + ' could not be read (' + esc(rr.why) + ')' }); continue; }
      putRead(rec, h, Object.assign(base, rd ? { state: 'read', amount: rd.amount, label: rd.label, conf: rd.conf } : { state: 'no-amount', amount: 0 }));
      if (!rd) { out.push({ pid: pid, job: s(p.name), kind: 'contract', file: nm, state: 'no-amount', line: '⚠ ' + esc(p.name) + ': no labelled contract amount in ' + esc(nm) + ' (a scanned PDF has no text to read) — type the contract on the job' }); continue; }
      if (!got || rd.conf > got.rd.conf || (rd.conf === got.rd.conf && rd.amount > got.rd.amount)) got = { rd: rd, d: d };
    }
    if (!got) continue;
    best = t;
    var gd = got.d, gn = docName(gd);
    var multi = docs.some(function(o){ return o && o.id !== gd.id && docPid(o) && docPid(o) !== pid && ((s(o.hash) && s(o.hash) === s(gd.hash)) || (low(docName(o)) === low(gn) && (+o.size || 0) === (+gd.size || 0) && (+gd.size || 0) > 0)); });
    var cloudCur = 0;
    if (!curContract(proj(pid)) && !(t === 4 || multi)) {   /* before setting a price: the cloud's newest copy of the job must not have one either */
      var cj = await cloudJob(pid);
      if (cj === null) { var dr0 = h['ct|' + gd.id]; putRead(rec, h, Object.assign({}, dr0, { state: 'retry', tries: (+dr0.tries || 0) + 1, why: 'the cloud copy of the job could not be checked' })); out.push({ pid: pid, job: s(p.name), kind: 'contract', file: gn, state: 'retry', line: '⏳ ' + esc(p.name) + ': ' + esc(gn) + ' says ' + money2(got.rd.amount) + ' — set once the cloud can be checked' }); return; }
      cloudCur = curContract(cj);
    }
    var x = await applyContract(pid, Object.assign({}, got.rd, { noteOnly: t === 4 || multi, cloudCur: cloudCur }), gn, rec, by);
    if (x) {
      var dr = h['ct|' + gd.id]; if (dr) putRead(rec, h, Object.assign({}, dr, { state: 'applied', result: x.state, noteOnly: !!(t === 4 || multi), multiJob: multi || undefined }));
      var ln = ctLine(x);
      if (x.state === 'after-decision') ln = '💲 ' + esc(p.name) + ': ' + esc(gn) + ' says ' + money2(x.amount) + ' — the contract was already decided on the job (' + esc(x.decided) + '), not asked again';
      if (x.state === 'open' && x.noteOnly && !x.was) ln = '💲 ' + esc(p.name) + ': ' + esc(gn) + ' says ' + money2(x.amount) + (multi ? ' (the same file is on other jobs)' : ' (a proposal / estimate — not the contract)') + ' — ✅ Use / Keep on the job page';
      out.push({ pid: pid, job: s(p.name), kind: 'contract', file: gn, state: x.state, amount: x.amount, line: ln });
    }
  }
}
async function drSched(pid, docs, rec, by, out){
  var p = proj(pid); if (!p) return;
  var h = readsOf(rec), L = workOf(pid, docs, rec).sc;
  for (var i = 0; i < L.length; i++) {
    var d = L[i], nm = docName(d), base = { id: 'sc|' + d.id, kind: 'schedule', docId: d.id, pid: pid, job: s(p.name), file: nm, at: nowIso(), by: by };
    var x = null;
    try { x = await readSched({ name: nm, path: nm, size: +d.size || 0, get: function(){ return docBlob(d); } }); }
    catch (e) { warn(e); var rr = retryOrGiveUp(rec, h, base.id, base, e); out.push({ pid: pid, job: s(p.name), kind: 'schedule', file: nm, state: rr.state, line: (rr.state === 'retry' ? '⏳ ' : '⚠ ') + esc(p.name) + ': the schedule ' + esc(nm) + (rr.state === 'retry' ? ' could not be fetched yet — tried again later' : ' could not be read') }); continue; }
    if (!x || !arr(x.items).length) {
      putRead(rec, h, Object.assign(base, { state: 'none', n: 0, noText: !s(x && x.text) }));
      out.push({ pid: pid, job: s(p.name), kind: 'schedule', file: nm, state: 'none', line: '📅 ' + esc(p.name) + ': no dated rows found in ' + esc(nm) + (!s(x && x.text) ? ' (no text in the file — a scan?)' : '') });
      continue;
    }
    var tent = TENT_RX.test(nm) || TENT_RX.test(s(x.text).slice(0, 3000));
    var recs = schedRecs(pid, x.items, tent, { file: nm, batch: DR_ID, by: by }).map(function(r){ r.source = 'job-doc'; r.fromDocId = s(d.id); return r; });
    var added = 0; try { added = await addSched(recs); } catch (e) { warn(e); }
    /* the page's own copy (window._crm.schedule — what TENTPOST and the job page read) is rebuilt only when another list changes: add the new rows to it */
    try { if (added && W._crm && Array.isArray(W._crm.schedule)) { var hv = {}; W._crm.schedule.forEach(function(e){ if (e && e.pid != null && e.deleted !== true) hv[schedKey(e)] = 1; }); var nw = recs.filter(function(r){ if (hv[schedKey(r)]) return false; hv[schedKey(r)] = 1; return true; }); if (nw.length) W._crm.schedule = W._crm.schedule.concat(nw); } } catch (e) { warn(e); }
    var ask = tent && GO_ST.test(s(p.status));
    putRead(rec, h, Object.assign(base, { state: tent ? (ask ? 'tent-ask' : 'tentative') : 'posted', n: x.items.length, added: added, tent: tent }));
    out.push({ pid: pid, job: s(p.name), kind: 'schedule', file: nm, state: tent ? 'tentative' : 'posted', n: x.items.length,
      line: '📅 ' + esc(p.name) + ': ' + x.items.length + (tent ? ' tentative' : '') + ' schedule item' + (x.items.length === 1 ? '' : 's') + ' read from ' + esc(nm) + (added < x.items.length ? ' (' + (x.items.length - added) + ' already on the schedule)' : '') + (tent ? (ask ? ' — ✅ Post / ✏️ Edit first on the job page' : ' — on the 📋 Tentative tab until the job goes active') : ' — on the job\'s Schedule') });
  }
}
async function drRun(o){
  o = o || {};
  if (DR.busy) return [];
  if (typeof W._gcPdfText !== 'function' || typeof W._gcFileBlob !== 'function') return [];   /* the readers are not on this page yet */
  DR.busy = true; DR.runs++; var out = [];
  try {
    var docs = arr(await docsNow()).filter(function(d){ return d && d.deleted !== true && d._deleted !== true && docPid(d) && docSrc(d); });
    var pick = function(rec){ return projects().map(function(p){ return String(p.id); }).filter(function(pid){ var w = workOf(pid, docs, rec); return w.ct.length || w.sc.length; })
      .sort(function(a, b){ return (curContract(proj(a)) ? 1 : 0) - (curContract(proj(b)) ? 1 : 0); }); };
    if (!pick(drRec()).length) return out;
    await refresh(true);
    var todo = pick(drRec()), by = myName();
    if (o.onStart) o.onStart(todo.length);
    for (var i = 0; i < todo.length; i++) {
      if (!o.all && i >= (o.max || DR_JOBS)) break;
      var rec = drRec(), n0 = out.length;
      try { await drContract(todo[i], docs, rec, by, out); } catch (e) { DR.errs++; warn(e); }
      try { await drSched(todo[i], docs, rec, by, out); } catch (e) { DR.errs++; warn(e); }
      await saveBatch(rec);
      if (o.onLine) o.onLine(out.slice(n0), i + 1, todo.length);
    }
  } catch (e) { DR.errs++; warn(e); }
  finally { DR.busy = false; DR.lastRun = nowIso(); DR.last = out.map(function(x){ return x.line.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'); }).slice(-60); }
  if (out.length) { var el = D.getElementById('gc-zipct'); if (el) el.__sig = ''; later(ctPaint, 50); }
  return out;
}
/* idle: a few jobs at a time, on a computer of an admin / the office / a PM, the page shown, nobody typing */
function drIdle(){
  try {
    if (DR.busy || D.hidden || !canImport() || Date.now() - DR.startAt < DR_FIRST || W.__GC_IS_TYPING__ || D.getElementById('gczi-ov')) return;
    if (!projects().length) return;
    var go = function(){ drRun({ max: DR_JOBS }); };
    if (typeof W.requestIdleCallback === 'function') W.requestIdleCallback(go, { timeout: 8000 }); else go();
  } catch (e) { warn(e); }
}
SI.call(W, drIdle, DR_EVERY);
/* the job page: where its schedule came from, and TENTPOST's card for a tentative schedule read from a document */
function drPaint(){
  var op = W._gcOpenProject, pid = op && op.id ? String(op.id) : '', el = D.getElementById('gc-docsched');
  var st = pid && canImport() ? ctStrip() : null;
  var rec = cache().filter(function(x){ return x.id === DR_ID; })[0];
  var L = rec && pid ? arr(rec.docReads).filter(function(x){ return x && x.kind === 'schedule' && String(x.pid) === pid && +x.n > 0; }).sort(function(a, b){ return s(b.updatedAt).localeCompare(s(a.updatedAt)); }) : [];
  if (!st || !L.length) { if (el) el.remove(); }
  else {
    var x = L[0], tp = W._gcTentPost, left = 0;
    try { left = tp && tp.tentOf ? tp.tentOf(pid).filter(function(r){ return s(r.fromFile) === s(x.file); }).length : 0; } catch (e) {}
    var h = '📅 ' + x.n + ' schedule item' + (+x.n === 1 ? '' : 's') + ' read from ' + esc(x.file) + ' · ' + esc(s(x.updatedAt).slice(0, 10)) + (x.tent ? (left ? ' (tentative — not posted yet)' : ' (tentative)') : ' (on the Schedule)');
    if (!el) { el = D.createElement('div'); el.id = 'gc-docsched'; el.setAttribute('data-gc-keep', '1'); el.style.cssText = 'margin:4px 0 8px;color:#64748b;font:12px Inter,-apple-system,Arial,sans-serif'; }
    if (el.__h !== h) { el.innerHTML = h; el.__h = h; }
    if (el.nextElementSibling !== st) st.parentNode.insertBefore(el, st);
  }
  /* TENTPOST asks once per document on the job's page */
  try {
    var T = W._gcTentPost; if (!pid || !T || !T.ask || !rec) return;
    var ask = arr(rec.docReads).filter(function(x){ return x && x.kind === 'schedule' && x.state === 'tent-ask' && String(x.pid) === pid; })[0];
    if (!ask || ASKED[ask.id]) return;
    var n = T.tentOf(pid).filter(function(r){ return s(r.fromFile) === s(ask.file); }).length;
    if (!n) return;
    ASKED[ask.id] = 1;
    T.ask(pid, 'document', { file: ask.file, n: n, readId: ask.id });
  } catch (e) { warn(e); }
}
var ASKED = {};
/* TENTPOST tells which button was pressed: the answer is kept (✅ Post / ✏️ Edit first / Later — never asked again) */
W.__gcTentDecided = function(pid, act, info){
  try {
    if (!info || !info.readId) return;
    var rec = drRec(), h = readsOf(rec), x = h[info.readId]; if (!x || x.state !== 'tent-ask') return;
    putRead(rec, h, Object.assign({}, x, { state: 'tent-' + act, decidedBy: myName(), decidedAt: nowIso() }));
    saveBatch(rec);
  } catch (e) { warn(e); }
};
/* 💎 → 📄 Read contract prices and schedules from job documents (admins): all jobs now, the results listed */
function drOpen(){
  if (!isAdminNow()) { toast('Reading every job\'s documents is for admins.'); return; }
  var body = shell('gcdr-ov', '📄 Read contract prices and schedules from job documents');
  body.innerHTML = '<div class="mut">The documents already on every job are read once: the contract (the signed contract first — never a subcontract or sub agreement) and any schedule. ' +
    'An empty or $0 contract is set from it; a job that already has a contract only gets “📄 … says $X · ✅ Use · Keep” on its page. A schedule goes on the job\'s Schedule; a tentative one waits for ✅ Post on the job page. Files read before are not read again. This also runs by itself, a few jobs at a time.</div>' +
    '<div class="pick"><button type="button" class="btn go" data-dr="go">▶ Read now (all jobs)</button></div><div class="mut" data-dr="msg"></div><div class="sum" data-dr="list" style="display:none"></div>';
  var go = body.querySelector('[data-dr="go"]'), m = body.querySelector('[data-dr="msg"]'), list = body.querySelector('[data-dr="list"]');
  go.onclick = function(){
    if (DR.busy) { m.textContent = 'Already reading — a moment…'; return; }
    go.disabled = true; m.textContent = 'Looking at every job\'s documents…'; list.style.display = 'none'; list.innerHTML = '';
    var shown = 0;
    drRun({ all: true,
      onStart: function(n){ m.textContent = n + ' job' + (n === 1 ? '' : 's') + ' with documents not read yet…'; },
      onLine: function(lines, i, n){ m.textContent = 'Read ' + i + ' of ' + n + ' jobs…'; lines.forEach(function(x){ shown++; list.style.display = 'block'; var dv = D.createElement('div'); dv.style.cssText = 'padding:4px 0;border-top:1px solid #eef2f7'; dv.innerHTML = x.line; dv.setAttribute('data-dr-line', x.kind); list.appendChild(dv); }); }
    }).then(function(out){
      go.disabled = false;
      m.textContent = shown ? '✓ Done — ' + out.length + ' result' + (out.length === 1 ? '' : 's') + '.' : '✓ Nothing new to read — every contract and schedule document on the jobs was read before.';
    });
  };
}

/* ── the sheet ── */
var S = null;   /* { rows: [...], mode, zips, busy, done } */
function css(){
  if (D.getElementById('gczi-css')) return;
  var st = D.createElement('style'); st.id = 'gczi-css';
  st.textContent = '.gczi-ov{position:fixed;inset:0;z-index:100060;background:rgba(15,23,42,.35);display:flex;justify-content:center;align-items:flex-start;padding:24px 16px;overflow:auto;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;box-sizing:border-box}' +
    '.gczi{background:#fff;color:#1f2937;border-radius:14px;width:100%;max-width:1000px;box-shadow:0 16px 48px rgba(15,23,42,.22);padding:18px;box-sizing:border-box;min-width:0}' +
    '.gczi *{box-sizing:border-box}.gczi h2{margin:0;font-size:18px;color:#0f172a}.gczi .mut{color:#64748b;font-size:12.5px}' +
    '.gczi .hd{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}' +
    '.gczi .x{border:1px solid #d6dbe3;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font:600 13px inherit;color:#334155}' +
    '.gczi .pick{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}' +
    '.gczi .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;border-radius:10px;padding:9px 14px;font:600 14px Inter,Arial,sans-serif;cursor:pointer;min-height:42px}' +
    '.gczi .btn.go{background:#16a34a;border-color:#15803d;color:#fff}.gczi .btn[disabled]{opacity:.5;cursor:default}' +
    '.gczi select,.gczi input[type=text]{font:14px Inter,Arial,sans-serif;border:1px solid #cbd5e1;border-radius:8px;padding:7px 8px;background:#fff;color:#0f172a;max-width:100%;min-width:0}' +
    '.gczi .jobsel{width:100%;font-weight:600;min-height:42px}' +
    '.gczi .grp{border:1px solid #e2e8f0;border-radius:12px;margin:10px 0;overflow:hidden}' +
    '.gczi .gh{background:#f1f5f9;padding:8px 10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.gczi .gh b{flex:1 1 200px;min-width:0;overflow-wrap:anywhere;font-size:13.5px}' +
    '.gczi .gh select{flex:1 1 260px}' +
    '.gczi .row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 10px;border-top:1px solid #eef2f7}' +
    '.gczi .fn{flex:1 1 220px;min-width:0;overflow-wrap:anywhere;font-size:13.5px}.gczi .fn small{display:block;color:#64748b;font-size:11.5px}' +
    '.gczi .row .rj{flex:1 1 240px}.gczi .row .rc{flex:0 1 150px}' +
    '.gczi .pt{display:flex;align-items:center;gap:6px;font-size:12.5px;flex:1 1 200px;min-width:0}.gczi .pt input{width:20px;height:20px;accent-color:#16a34a;flex:none}' +
    '.gczi .pt .why{color:#b45309;font-size:11.5px}' +
    '.gczi .tag{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700}.gczi .tag.ok{background:#dcfce7;color:#166534}.gczi .tag.q{background:#fef3c7;color:#92400e}.gczi .tag.dup{background:#e0e7ff;color:#3730a3}.gczi .tag.skip{background:#f1f5f9;color:#475569}' +
    '.gczi .bar{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:8px 0}.gczi .bar i{display:block;height:100%;background:#16a34a;width:0;transition:width .2s}' +
    '.gczi .sum{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:13.5px;margin:10px 0}' +
    '.gczi .foot{position:sticky;bottom:-24px;background:#fff;border-top:1px solid #e2e8f0;padding:10px 0 4px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
    '.gczi .sch{margin:0 10px 8px 10px;padding:8px 10px;border:1px dashed #93c5fd;background:#eff6ff;border-radius:10px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px}.gczi .sch details{flex:1 1 100%;min-width:0}.gczi .sch summary{cursor:pointer;color:#1d4ed8;font-size:12.5px}' +
    '.gczi .schl{max-height:260px;overflow:auto;margin-top:6px}.gczi .si{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:3px 0;border-top:1px solid #dbeafe;font-size:12.5px}.gczi .si input{width:18px;height:18px;flex:none}.gczi .si .st{flex:1 1 160px;min-width:0;overflow-wrap:anywhere}.gczi .si .sd{color:#475569;white-space:nowrap}' +
    '@media (max-width:640px){.gczi-ov{padding:0}.gczi{border-radius:0;min-height:100%;padding:14px 12px}.gczi .row .rc{flex:1 1 140px}}';
  D.head.appendChild(st);
}
function toast(m){ try { var t = D.createElement('div'); t.textContent = m; t.setAttribute('data-gc-keep', '1'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fff;color:#1f2937;border:1px solid #d6dbe3;box-shadow:0 8px 24px rgba(15,23,42,.16);padding:10px 18px;border-radius:10px;z-index:100070;font:600 14px Inter,Arial,sans-serif;max-width:92vw'; D.body.appendChild(t); later(function(){ t.remove(); }, 4200); } catch (e) {} }
function shell(id, title){
  css();
  var old = D.getElementById(id); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = id; ov.className = 'gczi-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gc-noac', '1'); ov.setAttribute('data-gcnav-ignore', '1');
  ov.innerHTML = '<div class="gczi" role="dialog" aria-label="' + esc(title) + '"><div class="hd"><h2>' + esc(title) + '</h2><button type="button" class="x" data-zi="close">✕ Close</button></div><div data-zi-body></div></div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(e){ var c = e.target.closest && e.target.closest('[data-zi="close"]'); if (c) { if (S && S.busy) { toast('Still importing — wait for it to finish.'); return; } ov.remove(); } });
  return ov.querySelector('[data-zi-body]');
}
function jobOpts(sel, extra){
  return (extra || '') + jobsSorted().map(function(p){ return '<option value="' + esc(p.id) + '"' + (String(sel) === String(p.id) ? ' selected' : '') + '>' + esc(jobLabel(p)) + '</option>'; }).join('');
}
function rowOpts(sel){
  return jobOpts(sel, '<option value=""' + (!sel ? ' selected' : '') + '>❓ Needs a job — the office picks it</option><option value="__skip"' + (sel === '__skip' ? ' selected' : '') + '>🚫 Leave this file out</option>');
}
function open(){
  if (!canImport()) { toast('Importing ZIPs is for admins, the office and PMs.'); return; }
  S = { rows: [], mode: 'auto', zips: [], busy: false, done: null };
  var body = shell('gczi-ov', '📦 Import ZIP of job files');
  body.innerHTML = '<div class="mut">Pick one or more ZIP files (or plain files, or a whole folder). Nothing is saved until you press Import. A folder per address / PO works best.</div>' +
    '<div class="pick"><label class="btn">📦 Choose ZIP or files<input type="file" multiple data-zi-in="files" style="display:none"></label>' +
    '<label class="btn">📁 Choose a folder<input type="file" multiple webkitdirectory directory data-zi-in="dir" style="display:none"></label></div>' +
    '<label style="display:block;font-weight:700;font-size:13px;margin:6px 0 4px">Where do the files go?</label>' +
    '<select class="jobsel" data-zi="mode">' + jobOpts('', '<option value="auto" selected>🔎 Read each file and place it (automatic)</option>') + '</select>' +
    '<div data-zi="msg" class="mut" style="margin-top:8px"></div><div data-zi="list"></div><div data-zi="foot"></div>';
  body.querySelector('[data-zi="mode"]').onchange = function(){ S.mode = this.value; applyMode(); paint(); };
  Array.prototype.forEach.call(body.querySelectorAll('[data-zi-in]'), function(inp){
    inp.onchange = function(){ var fl = Array.prototype.slice.call(this.files || []); this.value = ''; addInputs(fl); };
  });
  refresh(true);
}
function msg(t){ var m = D.querySelector('#gczi-ov [data-zi="msg"]'); if (m) m.textContent = t; }
var JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)|(^|\/)\._/i;
function addRow(o){
  if (JUNK.test(o.path) || !o.name) return;
  var why = internalWhy(o.path);
  var r = { id: 'r' + S.rows.length, path: o.path, folder: o.path.split('/').slice(0, -1).join('/') || '(top level)', name: o.name, size: o.size, type: o.type || '', get: o.get, zipName: o.zipName || '',
    cat: isPhoto(o.name, o.type) ? 'Other' : guessCat(o.path, o.type), portal: !why && custOk(o.path), portalWhy: why, portalNote: (!why && !custOk(o.path)) ? 'not clearly customer paperwork — tick to share it' : '', auto: null, pid: '', status: '' };   /* PORTALSTRICT */
  if (r.size > MAX_FILE) r.status = 'big';
  S.rows.push(r);
}
async function addInputs(files){
  if (!files.length || !S) return;
  msg('Reading ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '…');
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (/\.zip$/i.test(f.name)) {
      try {
        var JSZ = await loadZip();
        var z = await JSZ.loadAsync(await f.arrayBuffer());
        S.zips.push(f.name);
        Object.keys(z.files).forEach(function(n){
          var e = z.files[n]; if (!e || e.dir) return;
          var nm = n.split('/').pop();
          var size = (e._data && e._data.uncompressedSize) || 0;
          addRow({ path: n, name: nm, size: size, zipName: f.name, get: function(){ return e.async('blob'); } });
        });
      } catch (e) { msg('Could not open “' + f.name + '”: ' + (e && e.message || e)); warn(e); }
    } else {
      addRow({ path: s(f.webkitRelativePath) || f.name, name: f.name, size: f.size, type: f.type, get: (function(ff){ return function(){ return Promise.resolve(ff); }; })(f) });
    }
  }
  await autoPlace();
  await detectScheds();   /* patch ZIPSCHED */
  applyMode(); paint();
}
/* sizes of ZIP entries are known only once read — read the ones without one when the time comes */
async function autoPlace(){
  var pdfs = [];
  S.rows.forEach(function(r){
    if (r.auto) return;
    var a = placeByPath(r.path, r.zipName);
    r.auto = a;
    if (!a.pid && /\.pdf$/i.test(r.name) && r.size < 20 * 1048576) pdfs.push(r);
  });
  if (pdfs.length && typeof W._gcPdfText === 'function') {
    var n = 0;
    for (var i = 0; i < pdfs.length && i < 80; i++) {
      var r = pdfs[i];
      try {
        msg('Reading the first pages of ' + r.name + '…');
        var b = await r.get(); if (!r.size) r.size = b.size;
        var by = new Uint8Array(await b.slice(0, 3 * 1048576).arrayBuffer());
        var tx = await W._gcPdfText(by);
        var m = match(s(tx).slice(0, 20000), 8);   /* only a PO or a street address inside a PDF counts */
        if (m.pid) { r.auto = { pid: m.pid, how: 'text inside the PDF (' + m.why + ')' }; n++; }
      } catch (e) { warn(e); }
    }
  }
  msg('');
}
function applyMode(){
  S.rows.forEach(function(r){
    if (r.status === 'big') { r.pid = '__skip'; return; }
    r.pid = S.mode === 'auto' ? ((r.auto && r.auto.pid) || '') : S.mode;
  });
}
function rowHow(r){
  if (r.status === 'big') return '<span class="tag skip">over 50 MB — use 🔗 Add a link</span>';
  if (r.pid === '__skip') return '<span class="tag skip">left out</span>';
  if (r.pid && S.dups && S.dups[dupKey(r.pid, r.name, r.size)]) return '<span class="tag dup">already on this job — skipped</span>';
  if (!r.pid) return '<span class="tag q">❓ needs a job' + (r.auto && r.auto.amb ? ' — ' + r.auto.amb.cands.length + ' jobs match the ' + esc(r.auto.amb.at) : ' — no PO / address / job name found') + '</span>';
  if (S.mode !== 'auto') return '<span class="tag ok">picked</span>';
  if (r.auto && r.auto.pid === r.pid) return '<span class="tag ok">🔎 ' + esc(r.auto.how) + '</span>';
  return '<span class="tag ok">changed by you</span>';
}
function counts(){
  var c = { go: 0, q: 0, skip: 0, dup: 0 };
  S.rows.forEach(function(r){ if (r.pid === '__skip') c.skip++; else if (!r.pid) c.q++; else if (S.dups && S.dups[dupKey(r.pid, r.name, r.size)]) c.dup++; else c.go++; });
  return c;
}
function paint(){
  var ov = D.getElementById('gczi-ov'); if (!ov || !S) return;
  var L = ov.querySelector('[data-zi="list"]'), F = ov.querySelector('[data-zi="foot"]');
  if (S.done) { L.innerHTML = S.done; F.innerHTML = '<div class="foot"><button type="button" class="btn" data-zi="again">📦 Import more</button><button type="button" class="btn" data-zi="close">Close</button></div>'; F.querySelector('[data-zi="again"]').onclick = open; return; }
  if (!S.rows.length) { L.innerHTML = ''; F.innerHTML = ''; return; }
  if (!S.dups && !S.dupsLoading) { S.dupsLoading = true; loadDups(); }   /* the duplicate check reads the job files once */
  var groups = [], gi = {};
  S.rows.forEach(function(r){ var k = (r.zipName ? r.zipName + ' › ' : '') + r.folder; if (!(k in gi)) { gi[k] = groups.length; groups.push({ k: k, rows: [] }); } groups[gi[k]].rows.push(r); });
  var h = '';
  groups.forEach(function(g, x){
    var same = g.rows.every(function(r){ return r.pid === g.rows[0].pid; }), gsel = same ? g.rows[0].pid : '__mixed';
    h += '<div class="grp" data-zi-grp="' + x + '"><div class="gh"><b>📁 ' + esc(g.k) + ' <span class="mut">(' + g.rows.length + ' file' + (g.rows.length > 1 ? 's' : '') + ')</span></b>' +
      '<select data-zi-fold="' + x + '" aria-label="Job for the whole folder">' + (gsel === '__mixed' ? '<option value="__mixed" selected>— files go to different jobs —</option>' : '') + rowOpts(gsel === '__mixed' ? '-' : gsel) + '</select></div>';
    g.rows.forEach(function(r){
      h += '<div class="row" data-zi-row="' + r.id + '"><div class="fn">' + esc(r.name) + '<small>' + (r.size ? kb(r.size) + ' · ' : '') + rowHow(r) + '</small></div>' +
        '<select class="rj" data-zi-job="' + r.id + '" aria-label="Job">' + rowOpts(r.pid) + '</select>' +
        '<select class="rc" data-zi-cat="' + r.id + '" aria-label="Category">' + CATS.map(function(c){ return '<option' + (c === r.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
        '<label class="pt"><input type="checkbox" data-zi-portal="' + r.id + '"' + (r.portal ? ' checked' : '') + '><span>Show in the customer’s portal' + (!r.portalWhy && r.portalNote && !r.portal ? '<br><span class="why">Off: ' + esc(r.portalNote) + '</span>' : '') + (r.portalWhy ? '<br><span class="why">' + (r.portal ? '⚠ looks like ' : 'Off: looks like ') + esc(r.portalWhy) + ' — never shown to customers' + (r.portal ? ' (you turned it on)' : '') + '</span>' : '') + '</span></label></div>' + schedHtml(r);
    });
    h += '</div>';
  });
  L.innerHTML = h;
  var c = counts();
  F.innerHTML = '<div class="foot"><button type="button" class="btn go" data-zi="go"' + (c.go + c.q ? '' : ' disabled') + '>⬆ Import ' + (c.go + c.q) + ' file' + (c.go + c.q === 1 ? '' : 's') + '</button>' +
    '<span class="mut">' + c.go + ' to jobs · ' + c.q + ' need a job (they go to the office / admins on ✅ Approvals)' + (c.dup ? ' · ' + c.dup + ' already imported' : '') + (c.skip ? ' · ' + c.skip + ' left out' : '') + '</span>' +
    '<div class="bar" data-zi="bar" style="flex:1 1 100%;display:none"><i></i></div><div class="mut" data-zi="prog" style="flex:1 1 100%"></div></div>';
  L.querySelectorAll('[data-zi-job]').forEach(function(sel){ sel.onchange = function(){ var r = rowById(sel.getAttribute('data-zi-job')); if (r) { r.pid = sel.value; paint(); } }; });
  L.querySelectorAll('[data-zi-cat]').forEach(function(sel){ sel.onchange = function(){ var r = rowById(sel.getAttribute('data-zi-cat')); if (r) r.cat = sel.value; }; });
  L.querySelectorAll('[data-zi-portal]').forEach(function(cb){ cb.onchange = function(){ var r = rowById(cb.getAttribute('data-zi-portal')); if (r) { r.portal = cb.checked; paint(); } }; });
  L.querySelectorAll('[data-zi-fold]').forEach(function(sel){ sel.onchange = function(){ if (sel.value === '__mixed') return; var g = groups[+sel.getAttribute('data-zi-fold')]; g.rows.forEach(function(r){ if (r.status !== 'big') r.pid = sel.value; }); paint(); }; });
  schedWire(L);
  F.querySelector('[data-zi="go"]').onclick = run;
}
/* patch ZIPSCHED: under a schedule file — the rows found, the job's Schedule, Tentative */
function schedHtml(r){
  if (!r.sched || r.pid === '__skip') return '';
  var x = r.sched, p = r.pid ? proj(r.pid) : null, n = x.items.length, on = schedPicked(r).length;
  var where = p ? esc(s(p.name)) + '’s Schedule' : 'the Schedule of the job the office picks';
  return '<div class="sch" data-zs="' + r.id + '"><label class="pt"><input type="checkbox" data-zs-on="' + r.id + '"' + (x.on ? ' checked' : '') + '><span>📅 <b>' + n + ' schedule item' + (n === 1 ? '' : 's') + ' found</b> → add ' + (on < n && x.on ? on + ' ' : '') + 'to ' + where + '</span></label>' +
    '<label class="pt"><input type="checkbox" data-zs-tent="' + r.id + '"' + (x.tent ? ' checked' : '') + '><span>Tentative <span class="mut">(📋 Tentative tab)</span></span></label>' +
    '<details data-zs-det="' + r.id + '"' + (x.open ? ' open' : '') + '><summary>Show the rows</summary><div class="schl">' +
    x.items.map(function(it, i){ return '<label class="si"><input type="checkbox" data-zs-it="' + r.id + ':' + i + '"' + (it.on !== false ? ' checked' : '') + '><span class="st">' + esc(it.t) + '</span><span class="sd">' + esc(it.s) + (it.e ? ' → ' + esc(it.e) : '') + '</span></label>'; }).join('') + '</div></details></div>';
}
function schedWire(L){
  L.querySelectorAll('[data-zs-on]').forEach(function(cb){ cb.onchange = function(){ var r = rowById(cb.getAttribute('data-zs-on')); if (r && r.sched) { r.sched.on = cb.checked; paint(); } }; });
  L.querySelectorAll('[data-zs-tent]').forEach(function(cb){ cb.onchange = function(){ var r = rowById(cb.getAttribute('data-zs-tent')); if (r && r.sched) r.sched.tent = cb.checked; }; });
  L.querySelectorAll('[data-zs-det]').forEach(function(d){ d.addEventListener('toggle', function(){ var r = rowById(d.getAttribute('data-zs-det')); if (r && r.sched) r.sched.open = d.open; }); });
  L.querySelectorAll('[data-zs-it]').forEach(function(cb){ cb.onchange = function(){ var a = cb.getAttribute('data-zs-it').split(':'), r = rowById(a[0]); if (r && r.sched && r.sched.items[+a[1]]) { r.sched.items[+a[1]].on = cb.checked; paint(); } }; });
}
function rowById(id){ return S.rows.filter(function(r){ return r.id === id; })[0] || null; }
/* the duplicate check reads the job files once a list is shown */
function loadDups(){ return docsNow().then(function(all){ if (S) { S.dups = docIndex(all); paint(); } }); }

async function run(){
  if (!S || S.busy) return;
  if (typeof W._gcStoreFile !== 'function') { msg('File storage is not ready yet — try again in a moment.'); return; }
  S.busy = true;
  var ov = D.getElementById('gczi-ov'), bar = ov.querySelector('[data-zi="bar"]'), prog = ov.querySelector('[data-zi="prog"]'), go = ov.querySelector('[data-zi="go"]');
  go.disabled = true; bar.style.display = 'block';
  ov.querySelectorAll('.gczi select, .gczi input').forEach(function(x){ x.disabled = true; });
  var by = myName(), bid = uid('zi_'), at = nowIso();
  var batch = { id: bid, at: at, by: by, byEmail: myEmail(), zips: S.zips.slice(), mode: S.mode === 'auto' ? 'automatic' : 'one job', files: [] };
  var dups = docIndex(await docsNow()), waiting = waitingIndex();
  var todo = S.rows.filter(function(r){ return r.pid !== '__skip'; }), done = 0, placed = 0, queued = 0, skipped = 0, failed = 0, recs = [], perJob = {};
  var sRecs = [], sFound = 0, sJobs = {};   /* patch ZIPSCHED */
  var ctCand = [];   /* patch CONTRACTREAD: contract-type files placed / skipped as already there / sent to the office */
  var schedFor = function(r){ var it = schedPicked(r); sFound += r.sched ? r.sched.items.length : 0; if (!r.pid || !it.length) return 0; var L = schedRecs(r.pid, it, r.sched.tent, { file: r.name, batch: bid, by: by }); sRecs = sRecs.concat(L); sJobs[r.pid] = 1; return L.length; };
  for (var i = 0; i < todo.length; i++) {
    var r = todo[i];
    prog.textContent = 'Saving ' + (i + 1) + ' of ' + todo.length + ': ' + r.name;
    bar.firstChild.style.width = Math.round(100 * i / todo.length) + '%';
    try {
      var blob = null;
      if (!r.size) { blob = await r.get(); r.size = blob.size; }
      var key = r.pid ? dupKey(r.pid, r.name, r.size) : dupKey('?', r.name, r.size);
      if ((r.pid ? dups : waiting)[key]) { skipped++; var sk = { id: 'f' + i, name: r.name, path: r.path, size: r.size, pid: r.pid || '', skipped: 'already imported', schedItems: r.pid ? schedFor(r) : 0, updatedAt: nowIso() }; batch.files.push(sk); if (r.pid && isContractFile(r)) ctCand.push({ r: r, ent: sk }); continue; }   /* a re-run adds no schedule row twice (same job + title + start) */
      if (!blob) blob = await r.get();
      if (blob.size > MAX_FILE) { failed++; batch.files.push({ id: 'f' + i, name: r.name, path: r.path, size: blob.size, failed: 'over 50 MB', updatedAt: nowIso() }); continue; }
      var file = blob instanceof File && blob.name === r.name ? blob : new File([blob], r.name, { type: r.type || blob.type || '' });
      var meta = await W._gcStoreFile(file, { kind: 'doc', pid: r.pid || undefined, name: r.name });
      if (!meta || !meta.ref) throw new Error('no reference');
      var ent = { id: 'f' + i, name: r.name, path: r.path, size: r.size, type: meta.type || r.type || '', ref: meta.ref, hash: meta.hash || '', storedSize: meta.size || r.size,
        cat: r.cat, portal: !!r.portal, portalWhy: r.portalWhy || '', how: r.pid ? (S.mode === 'auto' ? (r.auto && r.auto.pid === r.pid ? r.auto.how : 'picked in the preview') : 'one job picked') : '', updatedAt: nowIso() };
      if (r.pid) {
        var rec = docRec(r.pid, ent, meta, bid, by); recs.push(rec); dups[key] = 1;
        ent.pid = String(r.pid); ent.docId = rec.id; ent.placedAt = rec.uploadedAt; ent.placedBy = by; placed++;
        perJob[r.pid] = (perJob[r.pid] || 0) + 1;
        if (r.sched) ent.schedItems = schedFor(r);
      } else { ent.pid = ''; ent.queued = true; waiting[key] = 1; queued++;
        if (r.sched) { sFound += r.sched.items.length; var pk = schedPicked(r); if (pk.length) ent.sched = { tent: !!r.sched.tent, items: pk.map(function(x){ return { t: x.t, s: x.s, e: x.e, du: x.du, who: x.who, trade: x.trade }; }) }; }   /* patch ZIPSCHED: goes with the file to 📥 Place */
      }
      batch.files.push(ent);
      if (isContractFile(r)) ctCand.push({ r: r, ent: ent });
      if (recs.length >= 25) { await addDocs(recs.splice(0)); }
    } catch (e) { failed++; warn(e); batch.files.push({ id: 'f' + i, name: r.name, path: r.path, size: r.size, failed: s(e && e.message || e).slice(0, 120), updatedAt: nowIso() }); }
    done++;
  }
  if (recs.length) await addDocs(recs.splice(0));
  var sAdded = 0; try { sAdded = await addSched(sRecs); } catch (e) { warn(e); }   /* patch ZIPSCHED */
  /* patch CONTRACTREAD: the contract price — one read per file; a file that went to several jobs sets none; the best read per job */
  var ctMulti = {}, ctBest = {};
  ctCand.forEach(function(c){ var k = low(c.r.name) + '|' + c.r.size; (ctMulti[k] = ctMulti[k] || {})[c.r.pid || '?'] = 1; });
  for (var ci = 0; ci < ctCand.length; ci++) {
    var c = ctCand[ci]; if (Object.keys(ctMulti[low(c.r.name) + '|' + c.r.size]).length > 1) continue;
    prog.textContent = 'Reading the contract price in ' + c.r.name + '…';
    var rd = null; try { rd = await readContract(c.r.get, c.r.name, c.r.path); } catch (e) { warn(e); }
    if (!rd) continue;
    c.ent.contractRead = rd;
    if (c.r.pid) { var cb = ctBest[c.r.pid]; if (!cb || rd.conf > cb.rd.conf || (rd.conf === cb.rd.conf && rd.amount > cb.rd.amount)) ctBest[c.r.pid] = { rd: rd, file: c.r.name }; }
  }
  for (var cp in ctBest) { try { await applyContract(cp, ctBest[cp].rd, ctBest[cp].file, batch, by); } catch (e) { warn(e); } }
  bar.firstChild.style.width = '100%';
  batch.counts = { placed: placed, waiting: queued, skipped: skipped, failed: failed, schedFound: sFound, schedAdded: sAdded, schedJobs: Object.keys(sJobs).length, contractsSet: arr(batch.contractReads).filter(function(x){ return x.state === 'set'; }).length, contractsToCheck: arr(batch.contractReads).filter(function(x){ return x.state === 'open'; }).length };
  batch.jobs = Object.keys(perJob).map(function(pid){ var p = proj(pid); return { pid: pid, name: p ? s(p.name) : pid, n: perJob[pid] }; });
  prog.textContent = 'Saving the import log…';
  await saveBatch(batch);
  S.busy = false;
  var h = '<div class="sum"><b>✓ Import finished.</b><br>' + placed + ' file' + (placed === 1 ? '' : 's') + ' put on ' + batch.jobs.length + ' job' + (batch.jobs.length === 1 ? '' : 's') +
    (queued ? '<br>❓ ' + queued + ' file' + (queued === 1 ? '' : 's') + ' need a job — sent to the office and admins (✅ Approvals → “📦 Files from a ZIP need a job”).' : '') +
    (sFound ? '<br>📅 ' + sAdded + ' schedule item' + (sAdded === 1 ? '' : 's') + ' added to ' + Object.keys(sJobs).length + ' job schedule' + (Object.keys(sJobs).length === 1 ? '' : 's') + (sRecs.length > sAdded ? ' (' + (sRecs.length - sAdded) + ' already there)' : '') + '.' : '') +
    arr(batch.contractReads).map(function(x){ var t = ctLine(x); return t ? '<br>' + t : ''; }).join('') +
    (skipped ? '<br>' + skipped + ' already imported before — skipped.' : '') + (failed ? '<br><span style="color:#b91c1c">' + failed + ' could not be saved (see the log).</span>' : '') + '</div>';
  h += batch.jobs.map(function(j){ return '<div class="row"><div class="fn">📁 ' + esc(j.name) + '</div><span class="mut">' + j.n + ' file' + (j.n === 1 ? '' : 's') + '</span></div>'; }).join('');
  S.done = h; paint();
  toast('📦 ' + placed + ' file' + (placed === 1 ? '' : 's') + ' imported' + (queued ? ' · ' + queued + ' sent to the office' : ''));
}

/* ── ✅ Approvals: one card per import with files that need a job (admins + the office) ── */
function waitingFiles(b){ return arr(b.files).filter(function(f){ return f && f.ref && !f.pid && !f.dropped && !f.failed && !f.skipped; }); }
function pendingBatches(){ return cache().filter(function(b){ return waitingFiles(b).length; }); }
function cardTitle(b){ var n = waitingFiles(b).length; return '📦 ' + n + ' file' + (n === 1 ? '' : 's') + ' from a ZIP need' + (n === 1 ? 's' : '') + ' a job'; }
function cardSub(b){ var w = waitingFiles(b); return 'Imported by ' + s(b.by) + ' · ' + s(b.at).slice(0, 10) + ' · ' + w.slice(0, 3).map(function(f){ return f.name; }).join(', ') + (w.length > 3 ? ' …' : ''); }
function items(){ if (!officeOrAdmin()) return []; return pendingBatches().map(function(b){ return { id: 'zipimp_' + b.id, b: b }; }); }
function setAdd(r){
  try {
    if (!r || !r.groups) return r;
    var L = items(); if (!L.length) return r;
    var g = r.groups.other = arr(r.groups.other), have = {}; g.forEach(function(x){ have[s(x && x.id)] = 1; });
    var n = 0;
    L.forEach(function(it){ if (have[it.id]) return; have[it.id] = 1; n++;
      g.push({ id: it.id, title: cardTitle(it.b), sub: cardSub(it.b), at: s(it.b.at), act: { l: '📥 Pick the jobs', f: function(){ openPlace(it.b.id); } } }); });
    if (n) { r.total = (r.total || 0) + n; r.tip = (s(r.tip) ? s(r.tip) + ' · ' : '') + n + ' ZIP import' + (n === 1 ? '' : 's') + ' to place'; }
  } catch (e) { warn(e); }
  return r;
}
function wrapSet(){
  var f = W._gcApprovalSet; if (typeof f !== 'function' || f.__gcZipImp) return;
  var w = function(){ return setAdd(f.apply(this, arguments)); };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcZipImp = true; W._gcApprovalSet = w;
  fresh();
}
function rows(sc){
  if (sc && sc.kind && sc.kind !== 'admin' && sc.kind !== 'office') return [];
  return items().map(function(it){
    return { key: 'zipimp:' + it.b.id, id: it.id, src: 'zipimp', group: 'zipimp', kind: 'zip_import', kindL: 'ZIP files to place', icon: '📦', title: cardTitle(it.b),
      pid: '', job: cardSub(it.b), pm: '', step: 'admin', waits: 'Admins or the office', since: Date.parse(it.b.at) || 0, clock: '', amount: 0, mine: true, escalated: false, chain: 'no PO / address / job name in the file',
      approve: { l: '📥 Pick the jobs', f: function(){ openPlace(it.b.id); } }, open: null, doc: null, edit: null, drop: 'td:' + it.id };
  });
}
var sig = '';
function fresh(){
  try { if (typeof W._gcApprovalSetFresh === 'function') W._gcApprovalSetFresh(); } catch (e) {}
  try { if (W._gcAPX && W._gcAPX.draw) W._gcAPX.draw(); } catch (e) {}
}
function watch(){
  wrapSet();
  try { var n = items().map(function(x){ return x.id + ':' + waitingFiles(x.b).length; }).join('|'); if (n !== sig) { sig = n; fresh(); } } catch (e) { warn(e); }
}
function openPlace(bid){
  var b = cache().filter(function(x){ return x.id === bid; })[0];
  var body = shell('gczi-place', '📦 Files from a ZIP — pick the job');
  if (!b) { body.innerHTML = '<div class="mut">This import is not on this computer yet — wait a moment and try again.</div>'; refresh(true); return; }
  var paintP = function(){
    var w = waitingFiles(b), placed = arr(b.files).filter(function(f){ return f && f.pid && f.placedFrom === 'approvals'; });
    var h = '<div class="mut">Imported by ' + esc(b.by) + ' on ' + esc(s(b.at).slice(0, 16).replace('T', ' ')) + (arr(b.zips).length ? ' from ' + esc(b.zips.join(', ')) : '') + '. These files had no PO, address or job name the CRM could read. Pick the job for each, then 📥 Place.</div>';
    if (!w.length) h += '<div class="sum">✓ Every file of this import has a job now.</div>';
    h += '<div class="grp">' + w.map(function(f){
      return '<div class="row" data-zp="' + esc(f.id) + '"><div class="fn">' + esc(f.name) + '<small>' + esc(f.path) + ' · ' + kb(f.size) + ' · ' + esc(f.cat || 'Other') + (f.sched && arr(f.sched.items).length ? ' · 📅 ' + f.sched.items.length + ' schedule item' + (f.sched.items.length === 1 ? '' : 's') + (f.sched.tent ? ' (tentative)' : '') + ' go on the job’s Schedule' : '') + ' · ' + (f.portal ? 'goes in the customer portal' : 'staff only' + (f.portalWhy ? ' (' + esc(f.portalWhy) + ')' : '')) + '</small></div>' +
        '<select class="rj" data-zp-job="' + esc(f.id) + '" aria-label="Job">' + jobOpts('', '<option value="">— pick the job —</option>') + '</select>' +
        '<button type="button" class="btn go" data-zp-go="' + esc(f.id) + '">📥 Place</button><button type="button" class="btn" data-zp-drop="' + esc(f.id) + '">🚫 Leave out</button></div>';
    }).join('') + '</div>';
    if (placed.length) h += '<div class="mut" style="margin-top:8px">Placed: ' + placed.map(function(f){ var p = proj(f.pid); return esc(f.name) + ' → ' + esc(p ? p.name : f.pid); }).join(' · ') + '</div>';
    body.innerHTML = h;
    body.querySelectorAll('[data-zp-go]').forEach(function(bt){ bt.onclick = function(){
      var id = bt.getAttribute('data-zp-go'), sel = body.querySelector('[data-zp-job="' + id + '"]'), pid = sel && sel.value;
      if (!pid) { toast('Pick the job first.'); return; }
      bt.disabled = true; placeOne(b, id, pid).then(function(){ paintP(); });
    }; });
    body.querySelectorAll('[data-zp-drop]').forEach(function(bt){ bt.onclick = function(){
      var f = arr(b.files).filter(function(x){ return x.id === bt.getAttribute('data-zp-drop'); })[0]; if (!f) return;
      f.dropped = true; f.droppedBy = myName(); f.droppedAt = nowIso(); f.updatedAt = nowIso(); saveBatch(b); paintP();
    }; });
  };
  paintP();
}
function placeOne(b, fid, pid){
  var f = arr(b.files).filter(function(x){ return x.id === fid; })[0]; if (!f || f.pid) return Promise.resolve(false);
  var by = myName();
  return docsNow().then(function(all){
    var dup = docIndex(all)[dupKey(pid, f.name, f.size)];
    var rec = dup ? null : docRec(pid, f, { ref: f.ref, hash: f.hash, type: f.type, size: f.storedSize || f.size }, b.id, by);
    return (rec ? addDocs([rec]) : Promise.resolve(0)).then(function(){
      /* patch ZIPSCHED: the schedule rows found in the file go on that job's Schedule now */
      return f.sched && arr(f.sched.items).length ? addSched(schedRecs(pid, f.sched.items, f.sched.tent, { file: f.name, batch: b.id, by: by })).then(function(n){ f.schedAdded = n; }, function(e){ warn(e); }) : null;
    }).then(function(){
      /* patch CONTRACTREAD: the contract price read from the file goes to the job it is placed on */
      return f.contractRead ? applyContract(pid, f.contractRead, f.name, b, by).then(function(x){ if (x) toast(ctLine(x).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')); }, function(e){ warn(e); }) : null;
    }).then(function(){
      f.pid = String(pid); f.docId = rec ? rec.id : ''; f.placedAt = nowIso(); f.placedBy = by; f.placedFrom = 'approvals'; f.updatedAt = nowIso();
      var p = proj(pid); toast('📥 ' + f.name + ' → ' + (p ? p.name : 'the job'));
      return saveBatch(b);
    });
  });
}

/* ── 💎 menu item (admins, the office, PMs): near the top, right after 🏗 Project Hubs ── */
function hubItem(panel){
  try {
    if (!panel) { var all = D.querySelectorAll('.gc-hub-panel'); for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) { panel = all[i]; break; } }
    if (!panel || !canImport()) return;
    var it = panel.querySelector('#gc-zipimp-hub');
    if (!it) {
      it = D.createElement('div'); it.id = 'gc-zipimp-hub'; it.className = 'gc-hub-item'; it.setAttribute('data-label', 'Import ZIP of job files');
      it.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9;';
      it.innerHTML = '<span class="gc-hub-icon" style="font-size:18px">📦</span><span>Import ZIP of job files</span>';
      it.onclick = function(){ later(open, 0); };
    }
    var ph = panel.querySelector('#gc-hub-projhub-link');
    if (ph && ph.parentNode === panel) { if (ph.nextSibling !== it) panel.insertBefore(it, ph.nextSibling); }
    else if (!it.parentNode) { var first = panel.querySelector('.gc-hub-item'); if (first && first.parentNode === panel) panel.insertBefore(it, first.nextSibling); else panel.insertBefore(it, panel.firstChild); }
    /* patch CONTRACTREAD2: admins — read the documents already on every job now */
    var dr = panel.querySelector('#gc-docread-hub');
    if (!isAdminNow()) { if (dr) dr.remove(); return; }
    if (!dr) {
      dr = D.createElement('div'); dr.id = 'gc-docread-hub'; dr.className = 'gc-hub-item'; dr.setAttribute('data-label', 'Read contract prices and schedules from job documents');
      dr.style.cssText = it.style.cssText;
      dr.innerHTML = '<span class="gc-hub-icon" style="font-size:18px">📄</span><span>Read contract prices and schedules from job documents</span>';
      dr.onclick = function(){ later(drOpen, 0); };
    }
    if (it.parentNode && it.nextSibling !== dr) it.parentNode.insertBefore(dr, it.nextSibling);
  } catch (e) { warn(e); }
}
D.addEventListener('gc-hub-open', function(e){ var p = e && e.detail && e.detail.panel; hubItem(p); later(function(){ hubItem(p); }, 0); later(function(){ hubItem(p); }, 250); if (officeOrAdmin()) refresh(false); });

/* the list of imports: read at start, then every 2 minutes for admins / the office (the approval card), when the page is shown */
later(function(){ if (officeOrAdmin()) refresh(true); }, 5000);
SI.call(W, function(){ try { if (!D.hidden && officeOrAdmin()) refresh(false).then(watch); } catch (e) {} }, 120000);
wrapSet(); SI.call(W, watch, 3000);
W._gcApxExtra = arr(W._gcApxExtra); W._gcApxExtra.push(rows);

W._gcDocRead = { run: drRun, open: drOpen, tier: ctTier, isSched: isSchedDoc, record: drRec, paint: drPaint,
  state: function(){ return { busy: DR.busy, runs: DR.runs, lastRun: DR.lastRun, errs: DR.errs, last: DR.last.slice() }; } };   /* patch CONTRACTREAD2 */
W._gcZipImport = { open: open, openPlace: openPlace, match: match, placeByPath: placeByPath, internalWhy: internalWhy, guessCat: guessCat,
  contractFromText: contractFromText, contractFromRows: contractFromRows, ctPaint: ctPaint,
  schedFromText: schedFromText, rowsToItems: rowsToItems, ymd: ymd,
  refresh: function(){ return refresh(true); }, list: cache, items: items, canImport: canImport,
  state: function(){ return S ? { rows: S.rows.map(function(r){ return { path: r.path, name: r.name, size: r.size, pid: r.pid, auto: r.auto, cat: r.cat, portal: r.portal, portalWhy: r.portalWhy, sched: r.sched ? { on: r.sched.on, tent: r.sched.tent, n: r.sched.items.length, items: r.sched.items } : null }; }), mode: S.mode, busy: S.busy, done: !!S.done } : null; } };
try { console.log('[GC] 📦 Import ZIP of job files (💎 menu) — _gcZipImport'); } catch (e) {}
})();
