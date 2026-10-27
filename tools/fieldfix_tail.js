/* __GC_PATCH_FIELDFIX__ ═════════════════════════════════════════════════════════════════════════════════
   GrayCo — estimate PDFs on leads / bids / the pipeline become estimates with their job; bare job rows filled once.
   (patch FIELDFIX, with its parts inside patch FIELD and patch ESTIN)

   1. A PDF or Word estimate / proposal (often made in Google Docs or Claude) put on a LEAD, a BID or a bidding job —
      chosen in a file box on that lead / bid / job, or dropped on its card in the Leads screen, the Bids list or
      the pipeline — goes through the one estimate door (window._gcEstimateIntake.upload, patch ESTIN): read in the
      browser (job name, job-site address, customer, amount, estimator), the estimate made and linked, its bidding
      job made (or the lead's / customer's existing job at that address used), the PDF kept on the estimate and in
      the job's documents, and a note on the lead. The same file twice is recognised and not made again. In a file
      box the file name has to say estimate / proposal / quote / bid (a photo or a plan is left alone); a file
      dropped on a card is always read.
   2. ONE-TIME FILL (admin computer, once — flag gc_kv "gc_fieldfix_mig_v1"): a job row that is only a customer's
      name (the name is the customer, no job site — e.g. a QuickBooks customer "EAN Holdings" an estimate was made
      against) and has an estimate pointing at it gets, from that estimate: the job name, the job-site address (a
      P.O. Box billing address moves to billingAddress), estimator, PM, estimateId — empty / placeholder fields only,
      nothing deleted. Every change is logged in gc_kv "gc_fieldfix_mig_log".
        _gcFieldFixMigrate()            shows what would change, changes nothing
        _gcFieldFixMigrate({ yes:true }) does it (admin only)
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_FIELDFIX__) return; window.__GC_PATCH_FIELDFIX__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function nowIso(){ return new Date().toISOString(); }
function later(f, ms){ return ST.call(W, f, ms || 0); }
function C(){ return W._crm || {}; }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function viewingAs(){ try { return !!(W._gcRP && W._gcRP.status && W._gcRP.status().viewAs); } catch (e) { return false; } }
function paused(){ try { var st = W._gcPause && W._gcPause.state && W._gcPause.state(); return !!(st && st.paused); } catch (e) { return false; } }
function me(){ try { var u = W._gcMeNow; if (u && u.name) return s(u.name); } catch (e) {} return s(lsGet('grayco_user')); }
function site(a){
  var t = s(a).replace(/\s+/g, ' ').replace(/[,\s]*(United States of America|United States|U\.S\.A\.?|USA)\s*$/i, '').trim();
  return /^(p\.?\s*o\.?\s*box|post office box|pob\b)/i.test(t) ? '' : t;
}
function toast(t, bad){
  var el = D.getElementById('gc-fx-toast');
  if (!el) { el = D.createElement('div'); el.id = 'gc-fx-toast'; el.setAttribute('data-gcnav-ignore', '1'); el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:100095;max-width:min(92vw,520px);border-radius:12px;padding:12px 16px;font:600 14px Inter,-apple-system,sans-serif;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.3);pointer-events:none'; D.body.appendChild(el); }
  el.style.background = bad ? '#991b1b' : '#0f2440'; el.style.borderBottom = '3px solid ' + (bad ? '#fca5a5' : '#d4a017');
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 6000);
}

/* ── 1. estimate PDFs put on a lead / bid / bidding job ── */
var LEAD_ATTRS = ['data-lead', 'data-lead-id', 'data-gcl-id', 'data-lux-open', 'data-rso-id', 'data-lc-id'], BID_ATTRS = ['data-bid', 'data-sys-bid'];
var EST_NAME = /(estimat|proposal|quot(e|ation)|(^|[^a-z])bid([^a-z]|$)|scope of work)/i, EST_FILE = /\.(pdf|docx?)$/i;
function leadsAll(){ var ls = arr(C().leads); try { if (typeof W._gcLaLeads === 'function') ls = ls.concat(arr(W._gcLaLeads())); } catch (e) {} return ls; }
function resolve(id){
  id = s(id); if (!id) return null;
  if (leadsAll().some(function(x){ return x && s(x.id) === id; })) return { leadId: id };
  var p = arr(C().projects).filter(function(x){ return x && s(x.id) === id; })[0];
  if (p) return /lost|complete|closed|cancel/i.test(s(p.status)) ? null : { pid: id, bidding: /bid|estimat|lead|pending|prospect/i.test(s(p.status)) || !s(p.status) };
  var b = arr(C().bidLists).filter(function(x){ return x && s(x.id) === id; })[0];
  if (b) return s(b.leadId) ? { leadId: s(b.leadId) } : (s(b.pid) ? { pid: s(b.pid), bidding: true } : null);
  return null;
}
function ctxOf(el, drop){
  for (var n = el; n && n.nodeType === 1 && n !== D.body; n = n.parentElement) {
    var a, i, r;
    for (i = 0; i < LEAD_ATTRS.length; i++) if ((a = n.getAttribute(LEAD_ATTRS[i])) && (r = resolve(a))) return r;
    for (i = 0; i < BID_ATTRS.length; i++) if ((a = n.getAttribute(BID_ATTRS[i])) && (r = resolve(a))) return r;
    if (drop) continue;   /* a drop goes on a card that says which lead / bid it is */
    var ups = n.querySelectorAll ? n.querySelectorAll('[data-estin="upload"][data-lead],[data-estin="upload"][data-pid]') : [];
    if (ups.length) {
      var ids = {}; Array.prototype.forEach.call(ups, function(b){ ids[(b.getAttribute('data-lead') ? 'l:' + b.getAttribute('data-lead') : 'p:' + b.getAttribute('data-pid'))] = 1; });
      var k = Object.keys(ids); if (k.length !== 1) return null;
      return k[0][0] === 'l' ? resolve(k[0].slice(2)) : resolve(k[0].slice(2));
    }
  }
  return null;
}
function intake(){ return W._gcEstimateIntake && typeof W._gcEstimateIntake.upload === 'function' ? W._gcEstimateIntake : null; }
var SEEN = {};
function take(file, ctx, how){
  var I = intake(); if (!I || !file) return;
  var key = [file.name, file.size, file.lastModified, ctx.leadId || ctx.pid].join('|'); if (SEEN[key]) return; SEEN[key] = 1;
  toast('📐 Reading the estimate "' + file.name + '"…');
  Promise.resolve(I.upload(file, ctx.leadId ? { leadId: ctx.leadId, via: how } : { pid: ctx.pid, via: how })).then(function(r){
    r = r || {};
    if (!r.ok) { toast('The estimate "' + file.name + '" could not be read: ' + s(r.error || 'unknown'), true); return; }
    var e = r.estimate || {};
    toast(r.duplicate ? '📐 "' + file.name + '" is already in the CRM as "' + s(e.name) + '"' : '📐 Estimate "' + s(e.name) + '" made from the PDF' + (r.review ? ' — it needs a look (📨 Proposals)' : '') + '; its job is linked');
    try { if (W._gcEstin && W._gcEstin.scan) later(function(){ W._gcEstin.scan(); }, 1500); } catch (x) {}
  }, function(err){ toast('The estimate "' + file.name + '" could not be read: ' + s(err && err.message || err), true); });
}
/* a file chosen in a lead's / bid's / bidding job's own file box */
D.addEventListener('change', function(ev){
  var t = ev.target;
  if (!t || t.tagName !== 'INPUT' || t.type !== 'file' || !t.files || !t.files.length) return;
  if (t.hasAttribute('data-es') || t.hasAttribute('data-estin') || (t.closest && t.closest('.gces-ov,#_gcEstPanel,.gc-fh-sheet,#_gcJobPick,#_gcFhAll'))) return;   /* the estimate door's own boxes, the builder, the field app */
  var files = Array.prototype.filter.call(t.files, function(f){ return EST_FILE.test(s(f.name)) && EST_NAME.test(s(f.name)); });
  if (!files.length) return;
  var ctx = ctxOf(t, false); if (!ctx || (ctx.pid && !ctx.bidding)) return;
  files.forEach(function(f){ take(f, ctx, 'attach'); });
}, true);
/* a PDF dropped on a lead / bid card */
function dropCard(ev){ var t = ev.target; if (!t || !t.closest) return null; var sel = LEAD_ATTRS.concat(BID_ATTRS).map(function(a){ return '[' + a + ']'; }).join(','); var c = t.closest(sel); return c && !c.closest('#_gcJobPick,#_gcFhAll,.gces-ov') ? c : null; }
function hasFiles(ev){ var dt = ev.dataTransfer; return !!(dt && dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0); }
var HL = null;
function hl(c){ if (HL && HL !== c) { HL.style.outline = HL.__fxOl || ''; HL = null; } if (c && HL !== c) { c.__fxOl = c.style.outline; c.style.outline = '3px dashed #d4a017'; HL = c; } }
D.addEventListener('dragover', function(ev){ if (!hasFiles(ev)) return; var c = dropCard(ev); if (!c || !ctxOf(c, true)) { hl(null); return; } ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'copy'; } catch (e) {} hl(c); }, true);
D.addEventListener('dragleave', function(ev){ if (HL && !HL.contains(ev.relatedTarget)) hl(null); }, true);
D.addEventListener('drop', function(ev){
  if (!hasFiles(ev)) return; var c = dropCard(ev); hl(null); if (!c) return;
  var ctx = ctxOf(c, true); if (!ctx) return;
  ev.preventDefault(); ev.stopPropagation();
  var files = Array.prototype.filter.call(ev.dataTransfer.files || [], function(f){ return EST_FILE.test(s(f.name)); });
  if (!files.length) { toast('Drop a PDF or Word estimate here.', true); return; }
  files.forEach(function(f){ take(f, ctx, 'drop'); });
}, true);

/* ── 2. the one-time fill of bare job rows from their estimates ── */
var FLAG = 'gc_fieldfix_mig_v1', LOG = 'gc_fieldfix_mig_log';
function named(p){ var n = low(p.name); return !n || n === low(p.client) || n === low(p.company) || n === low(p.qbClient); }
function jobName(client, estName, st){
  var nm = s(estName).replace(/\s+[—-]\s+final quote$/i, ''), street = s(st).split(',')[0].trim();
  if (nm && low(nm) !== low(client) && !/^estimate$/i.test(nm)) return (!client || low(nm).indexOf(low(client)) >= 0) ? nm : client + ' — ' + nm;
  return client ? client + (street ? ' — ' + street : '') : street;
}
function rawProjects(){ try { return Promise.resolve(typeof W._gcProjectsRaw === 'function' ? W._gcProjectsRaw() : (W.idbGet ? W.idbGet('projects') : null)).then(function(v){ return Array.isArray(v) && v.length ? v : arr(C().projects); }, function(){ return arr(C().projects); }); } catch (e) { return Promise.resolve(arr(C().projects)); } }
function allEstimates(){
  var mem = Array.isArray(W._gcEstimatesState) && W._gcEstimatesState.length ? W._gcEstimatesState : arr(C().estimates);
  try { return Promise.resolve(W.idbGet ? W.idbGet('estimates') : null).then(function(v){ var by = {}; arr(v).concat(mem).forEach(function(e){ if (e && e.id) by[e.id] = e; }); return Object.keys(by).map(function(k){ return by[k]; }); }, function(){ return mem; }); } catch (e) { return Promise.resolve(mem); }
}
function plan(projects, ests){
  var out = [];
  projects.forEach(function(p){
    if (!p || !p.id || p.deleted || /lost|complete|closed|cancel/i.test(s(p.status))) return;
    var nm = named(p), noSite = !site(p.address);
    if (!nm && !noSite) return;
    var eid = s(p.estimateId || p._lastEstId);
    var es = ests.filter(function(e){ return e && !e.deleted && !e.isTemplate && e._isDraft !== true && (s(e.pid) === s(p.id) || (eid && s(e.id) === eid)); })
      .sort(function(a, b){ return s(b.updatedAt || b.savedAt || b.date).localeCompare(s(a.updatedAt || a.savedAt || a.date)); });
    if (!es.length) return;
    var e = es[0], cust = s(p.client || p.company || p.qbClient), ch = {}, was = {};
    if (nm) { var jn = jobName(cust, e.name, site(e.address)); if (jn && low(jn) !== low(p.name)) { ch.name = jn; was.name = s(p.name); } }
    if (noSite && site(e.address)) {
      ch.address = site(e.address); was.address = s(p.address);
      if (s(p.address)) { if (!s(p.billingAddress)) ch.billingAddress = s(p.address); else if (low(p.billingAddress) !== low(p.address)) ch._fxOldAddress = s(p.address); }
    }
    if (!s(p.estimator) && s(e.estimator || e.by)) { ch.estimator = s(e.estimator || e.by); was.estimator = ''; }
    if (!s(p.pm) && s(e.pm)) { ch.pm = s(e.pm); was.pm = ''; }
    if (!s(p.estimateId)) { ch.estimateId = s(e.id); was.estimateId = ''; }
    if (Object.keys(ch).length) out.push({ pid: s(p.id), po: s(p.autoPO), before: was, set: ch, estimateId: s(e.id), estimateName: s(e.name), otherEstimates: es.slice(1).map(function(x){ return { id: s(x.id), name: s(x.name), address: s(x.address) }; }) });
  });
  return out;
}
function migrate(o){
  o = o || {};
  return Promise.all([rawProjects(), allEstimates()]).then(function(v){
    var all = v[0], changes = plan(all, v[1]);
    if (!o.yes) return { dryRun: true, changes: changes };
    if (!isAdmin()) return { ok: false, error: 'admin only', changes: changes };
    if (viewingAs() || paused()) return { ok: false, error: 'not while viewing as someone or in data-entry mode', changes: changes };
    var at = nowIso(), by = me(), map = {};
    changes.forEach(function(c){ map[c.pid] = c; });
    var put = function(p){ var c = p && map[s(p.id)]; return c ? Object.assign({}, p, c.set, { updatedAt: at, savedAt: at, _fxFilledAt: at }) : p; };
    var next = all.map(put), done = { at: at, by: by, changed: changes.length, auto: !!o.auto };
    try { W.__GC_MANUAL_SAVE__ = true; } catch (e) {}
    if (changes.length) {
      try { if (W._setProjects) W._setProjects(function(prev){ return Array.isArray(prev) ? prev.map(put) : prev; }); } catch (e) {}
      try { if (W._crm && Array.isArray(W._crm.projects)) W._crm.projects = W._crm.projects.map(put); } catch (e) {}
    }
    return Promise.resolve(changes.length && W.idbSet ? W.idbSet('projects', next) : null).then(function(){
      try { if (changes.length && W._supaUpsert) W._supaUpsert('projects', next); } catch (e) {}
      var log = []; try { log = arr(JSON.parse(lsGet(LOG) || '[]')); } catch (e) {}
      log = log.concat([{ at: at, by: by, auto: !!o.auto, changes: changes }]).slice(-20);
      lsSet(LOG, JSON.stringify(log)); lsSet(FLAG, JSON.stringify(done));
      try { if (W._supaUpsert) { W._supaUpsert(LOG, log); W._supaUpsert(FLAG, done); } } catch (e) {}
      try { console.log('[GC] FIELDFIX one-time fill: ' + changes.length + ' job row(s) filled from their estimates', changes); } catch (e) {}
      return { ok: true, changes: changes };
    });
  });
}
W._gcFieldFixMigrate = migrate;
W._gcFieldFixPlan = function(){ return migrate({}); };
/* once, on an admin's computer, a minute after sign-in (the cloud flag stops a second computer) */
function auto(){
  if (lsGet(FLAG) || !isAdmin() || viewingAs() || paused() || D.hidden) return;
  if (!arr(C().projects).length) { later(auto, 60e3); return; }
  var get = typeof W._gcCloudGet === 'function' ? Promise.resolve(W._gcCloudGet(FLAG)).catch(function(){ return null; }) : Promise.resolve(null);
  get.then(function(v){ if (v && typeof v === 'object' && v.at) { lsSet(FLAG, JSON.stringify(v)); return; } return migrate({ yes: true, auto: true }); }).catch(function(){});
}
later(auto, 60e3);
try { console.log('[GC] 📐 estimate PDFs on leads / bids → estimate + job · one-time job-row fill (patch FIELDFIX)'); } catch (e) {}
})();
