/* __GC_PATCH_ESTPDF__ ═══════════════════════════════════════════════════════════════════════════════════════════
   GrayCo — THE PDF THAT WAS SENT, ON EVERY ESTIMATE; ESTIMATES GO OUT FROM THE CRM (patch ESTPDF).

   Owner 11/01 (Hyatt Studios, PO S251, Estimates tab): "when I pull up estimates here I want to pull up the PDF that was
   SENT OUT, not whatever this is. The PDF has to be in the CRM to be sent out." — "I want estimators and everyone to do
   everything for the company in the CRM, including e-mails, at least when sending out estimates … estimates need to
   come FROM the CRM." — "that way they go into portal etc" — "I need to update the customer profile before an estimate
   is sent" — "as soon as I have to send bid from CRM I need to choose all features we do with the customer".

   1. 📤 SEND ESTIMATE — one path, desk and phone (the builder's Send, the job's estimate card, the Estimator home):
        customer profile check (name, mobile, e-mail, job address, billing address, preferred contact; insurance:
        claim # + date of loss — staff-only) → "Finish customer profile" with only what is missing →
        "Customer features for this job" (patch JA's per-job switches, pre-ticked from the job type's defaults; any of
        them can be ✕'d for this job; saved on the job: job.auto + job.features) →
        the PDF is made from the customer copy of the estimate (no carrier names, no internal notes, no claim #) — an
        uploaded estimate's own PDF is used as it is → its exact bytes are stored in the CRM's file storage FIRST
        (sha256 = its name; the upload must be confirmed) → send-email.js mode 'estimate' reads THAT file back, checks
        the fingerprint, attaches those bytes, From "<estimator> · GrayCo Construction", Reply-To the estimator, held
        7 PM–7 AM (CUSTQUIET) → the estimate: sentPdfs[] (v1, v2 …) + sentPdf, status Sent; the job's Files & Docs:
        "Estimate — <name> — sent <date>.pdf" (older versions marked superseded); the lead's activity; the e-mail log;
        and, when ticked, the customer portal: the same file, through the normal portal approval ("Put in the customer
        portal"), with the portal's e-sign paper (portal-sign.js, mailed:true — no second e-mail).
        No PDF in the CRM → "Couldn't save the PDF to the CRM — not sent. Try again." and nothing goes out.
   2. THE ESTIMATE CARD (job → 📝 Estimates): "📄 Sent PDF" opens the exact file sent ("Sent Oct 26 to … · v2",
        All versions); the title opens it too; never sent → "Not sent yet" (the editor opens as before); sent before
        this build with no copy found → "Sent before PDF saving started — no copy on file" + 📎 Attach the sent PDF;
        "✏ Open estimate" keeps the editor one tap away. A leftover autosave draft of the same estimate is folded into
        its card ("Unsaved changes from <date> — Open · Discard"), never offered as a second estimate.
   3. BACK-FILL: a sent estimate with no PDF linked looks for its PDF — the portal's e-sign paper, a job file with the
        same estimate id, a job PDF with the same name dated ±1 day, an e-mail attachment in the e-mail log — and links
        only a certain match. Nothing is ever made from the current draft and called "sent".
   4. SENT BY TEXT / GOOGLE DOCS: "📎 Upload the estimate I sent" (owner 11/01: "they can send estimates in text or from
        Google Docs, they just need to upload it so it all goes in the portal and in circulation for our auto") — the
        same profile check and features step, the exact PDF stored (versioned), published to the portal the same way,
        the estimate marked Sent with its method (text / Google Docs / e-mail), and the same automations as a CRM send
        (the estimate follow-ups — portal-sign.js runFollowups, job.proposalSentAt —, the lead's stage, the activity).
   5. THE GATE: a lead / job / estimate moves to "Estimate Sent" or later (Negotiating, Won, Contract, Active …) only
        once the estimate went to the portal by one of the two paths → "📤 Send from the CRM" / "📎 Upload the estimate
        you sent"; an admin may override with a reason (logged on the record) — those overrides are the list
        "Estimates marked sent outside the CRM" on the Estimator and Admin homes.
   API: window._gcEstPdf = { openSend, send, openUpload, uploadSent, inPortal, versions, current, paintSlot, openCard, view, attach, backfill,
        backfillPlan, outside, profileGaps, features, newCustomer, jobList, pull, status }
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_ESTPDF__) return; window.__GC_PATCH_ESTPDF__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
var SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
var BLOCK = 'Couldn’t save the PDF to the CRM — not sent. Try again.';
var SENT_KEY = 'gc_est_sent';
var CARRIERS = /\b(state\s*farm|allstate|usaa|liberty\s*mutual|nationwide|travelers|progressive|american\s*family|erie\s*insurance|chubb|the\s*hartford|auto[\s-]*owners|safeco|geico|homesite|metlife|amica|tennessee\s*farmers|farmers\s*insurance|farm\s*bureau|shelter\s*insurance|cincinnati\s*insurance|universal\s*property|citizens\s*property|kemper|hippo\s*insurance|foremost|assurant|american\s*strategic|asi\s*insurance|stillwater)\b/gi;
var S = { sent: [], sentAt: 0, reqs: [], mail: [], est: [], docs: [], sends: 0, blocked: 0, errors: '', log: [] };

/* ── small helpers ── */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var x = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return '$' + (Math.round(num(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function today(){ var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function norm(v){ return low(v).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function crm(){ return W._crm || {}; }
function warn(e){ try { console.warn('[GC ESTPDF]', e); } catch (x) {} }
function note(t){ S.log.push(nowIso().slice(11, 19) + ' ' + t); if (S.log.length > 60) S.log.shift(); }
function dayMs(v){ var t = s(v); if (!t) return NaN; return Date.parse(t.length === 10 ? t + 'T12:00:00' : t); }
function fmtDay(v){ var d = new Date(dayMs(v)); return isFinite(d) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : '') : s(v).slice(0, 10); }
function fmtWhen(v){ var d = new Date(dayMs(v)); return isFinite(d) ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
function myEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function meName(){
  var em = myEmail();
  try { var u = arr(crm().users).filter(function(x){ return low(x.email) === em; })[0]; if (u && u.name) return s(u.name); } catch (e) {}
  try { if (W._gcMeNow && W._gcMeNow.name) return s(W._gcMeNow.name); } catch (e) {}
  try { var n = localStorage.getItem('grayco_user'); if (n && n.charAt(0) !== '{') return s(n); } catch (e) {}
  return em ? em.split('@')[0] : 'GrayCo';
}
function isAdmin(){ try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {} try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function realAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function signedIn(){ return !!myEmail(); }
function toast(t, bad){
  try { if (typeof W._gcToast === 'function') return W._gcToast(t); } catch (e) {}
  var d = D.createElement('div'); d.className = 'gc-estpdf-toast'; d.textContent = t; d.setAttribute('role', 'status');
  d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:' + (bad ? '#B42318' : '#0f2440') + ';color:#fff;padding:11px 16px;border-radius:10px;z-index:2147483300;font:600 14px Inter,Arial,sans-serif;max-width:92vw;box-shadow:0 6px 24px rgba(0,0,0,.3)';
  D.body.appendChild(d); later(function(){ if (d.parentNode) d.remove(); }, 5200);
}
function creds(){ try { return { u: (localStorage.getItem('grayco_sb_url') || SB).replace(/\/$/, ''), k: localStorage.getItem('grayco_sb_key') || '' }; } catch (e) { return { u: SB, k: '' }; } }
function kvRead(key){
  var c = creds(); if (!c.u) return Promise.resolve(null);
  var h = c.k ? { apikey: c.k, Authorization: 'Bearer ' + c.k } : {};
  return W.fetch(c.u + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(key), { headers: h, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; })
    .then(function(rows){ if (!Array.isArray(rows)) return null; var v = rows[0] ? rows[0].value : []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v; });
}
function kvWrite(key, value){
  var c = creds(); if (!c.u) return Promise.resolve(false);
  manual('estpdf ' + key);
  var h = { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }; if (c.k) { h.apikey = c.k; h.Authorization = 'Bearer ' + c.k; }
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: h, body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
function call(fn, body){
  return W.fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t || '{}') || {}; } catch (e) { j = { error: t.slice(0, 200) }; } j.__s = r.status; return j; }); }, function(e){ return { ok: false, __s: 0, error: 'No connection (' + s(e && e.message) + ')' }; });
}
function idb(k){ try { return Promise.resolve(W.idbGet ? W.idbGet(k) : null).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v; }, function(){ return null; }); } catch (e) { return Promise.resolve(null); } }
function manual(why){ try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow(why); } catch (e) {} later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500); }

/* ── the CRM's lists ── */
function stampOf(e){ var a = s(e && (e.updatedAt || e.updated_at)), b = s(e && e.savedAt); return a > b ? a : b; }
function builderEsts(){ try { return typeof estimates !== 'undefined' && Array.isArray(estimates) ? estimates : []; } catch (e) { return []; } }   /* the builder's own list (a page global) */
function estAll(){
  var by = {};
  [S.est, arr(crm().estimates), arr(W._gcEstimatesState), builderEsts()].forEach(function(l){ arr(l).forEach(function(e){ if (!e.id) return; var o = by[e.id]; if (!o || stampOf(e) >= stampOf(o)) by[e.id] = o && arr(o.sentPdfs).length > arr(e.sentPdfs).length && stampOf(e) === stampOf(o) ? o : e; }); });
  return Object.keys(by).map(function(k){ return by[k]; });
}
function deadMap(){ var d = {}; try { if (W._gcxDeadIds) { var m = W._gcxDeadIds('estimates') || {}; for (var k in m) d[k] = 1; } } catch (e) {} return d; }
function isMarker(e){ return !!(e && (e._promotedTo || e._supersededBy)); }
function estById(id){ id = s(id); if (!id) return null; return estAll().filter(function(e){ return s(e.id) === id || s(e.estBuilderId) === id; }).sort(function(a, b){ return s(a.id) === id ? -1 : 1; })[0] || null; }
function projects(){ return arr(crm().projects); }
function proj(pid){ pid = s(pid); return pid ? projects().filter(function(p){ return s(p.id) === pid; })[0] || null : null; }
function leads(){ var l = arr(crm().leads); return l.length ? l : arr(S.leads); }
function lead(id){ id = s(id); return id ? leads().filter(function(l){ return s(l.id) === id; })[0] || null : null; }
function customers(){ var c = arr(W._graycoCustomers); if (!c.length) c = arr(crm().customers); var have = {}; c.forEach(function(x){ have[s(x.id)] = 1; }); return c.concat(arr(S.custAdds).filter(function(x){ return !have[s(x.id)]; })); }   /* + the ones added here, until the list hands them back */
function docs(){ var d = arr(W._gcProjectDocs); if (!d.length) d = arr(crm().projectDocs); if (!d.length) d = S.docs; return d; }
function jobOf(e){ if (!e) return null; return proj(e.pid) || projects().filter(function(p){ return s(p.estimateId) === s(e.id) || s(p._lastEstId) === s(e.id); })[0] || null; }
function leadOf(e, p){ return lead(e && (e.leadId || e.gdocLeadId || e.estinLeadId)) || (p ? lead(p.leadId || p.fromLeadId) : null) || (p ? leads().filter(function(l){ return s(l.projectId || l.pid) === s(p.id); })[0] : null) || null; }
function setEst(id, ch){
  var at = nowIso();
  var put = function(list){ return arr(list).map(function(x){ return s(x.id) === s(id) ? Object.assign({}, x, typeof ch === 'function' ? ch(x) : ch, { updatedAt: at, savedAt: at }) : x; }); };
  var done = false;
  manual('estimate PDF');
  try { if (typeof W._gcSetEstimates === 'function') { W._gcSetEstimates(function(prev){ return put(prev); }); done = true; } } catch (e) { warn(e); }
  try { if (Array.isArray(crm().estimates)) W._crm.estimates = put(crm().estimates); } catch (e) {}
  try { if (Array.isArray(W._gcEstimatesState)) W._gcEstimatesState = put(W._gcEstimatesState); } catch (e) {}
  try { var b = builderEsts(); b.forEach(function(x, i){ if (x && s(x.id) === s(id)) b[i] = put([x])[0]; }); } catch (e) {}
  S.est = put(S.est);
  if (!done) idb('estimates').then(function(v){ var next = put(v); try { W.idbSet('estimates', next); } catch (e) {} try { if (W._gcApplySync) W._gcApplySync('estimates', next); } catch (e) {} try { if (W._supaUpsert) W._supaUpsert('estimates', next); } catch (e) {} });
}
function upsertDoc(d){
  var put = function(l){ var a = arr(l).slice(), i = a.findIndex(function(x){ return s(x.id) === s(d.id); }); if (i >= 0) a[i] = Object.assign({}, a[i], d); else a.unshift(d); return a; };
  manual('estimate PDF document');
  try { if (typeof W._setProjectDocs === 'function') W._setProjectDocs(function(prev){ return put(prev); }); } catch (e) {}
  try { if (W._crm) W._crm.projectDocs = put(crm().projectDocs); } catch (e) {}
  S.docs = put(S.docs);
  idb('projectDocs').then(function(v){ var next = put(v); try { W.idbSet('projectDocs', next); } catch (e) {} try { if (W._gcApplySync) W._gcApplySync('projectDocs', next); } catch (e) {} try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {} });
}
function patchDocs(test, ch){
  var put = function(l){ return arr(l).map(function(x){ return test(x) ? Object.assign({}, x, ch) : x; }); };
  try { if (typeof W._setProjectDocs === 'function') W._setProjectDocs(function(prev){ return put(prev); }); } catch (e) {}
  try { if (W._crm) W._crm.projectDocs = put(crm().projectDocs); } catch (e) {}
  S.docs = put(S.docs);
}
function setProj(pid, ch){
  var at = nowIso(), put = function(l){ return arr(l).map(function(p){ return s(p.id) === s(pid) ? Object.assign({}, p, typeof ch === 'function' ? ch(p) : ch, { updatedAt: at, savedAt: at }) : p; }); };
  manual('job (estimate send)');
  try { if (W._crm) W._crm.projects = put(crm().projects); } catch (e) {}
  try { if (typeof W._setProjects === 'function') W._setProjects(function(prev){ return put(prev); }); } catch (e) {}
}
function addProj(p){
  manual('a job for an estimate');
  try { if (W._crm) W._crm.projects = [p].concat(projects()); } catch (e) {}
  try { if (typeof W._setProjects === 'function') W._setProjects(function(prev){ return Array.isArray(prev) ? [p].concat(prev.filter(function(q){ return q && q.id !== p.id; })) : [p]; }); } catch (e) {}
  try { if (W.idbSet) W.idbSet('projects', projects()); } catch (e) {}
  try { if (W._supaUpsert) W._supaUpsert('projects', projects()); } catch (e) {}
}
function leadsSave(fn){
  manual('lead (estimate send)');
  try { if (typeof W._setLeads === 'function') W._setLeads(function(prev){ return fn(Array.isArray(prev) ? prev.slice() : []); }); } catch (e) {}
  try { if (W._crm && Array.isArray(W._crm.leads)) W._crm.leads = fn(W._crm.leads.slice()); } catch (e) {}
}
function setLead(id, ch){ leadsSave(function(l){ return l.map(function(x){ return x && s(x.id) === s(id) ? Object.assign({}, x, typeof ch === 'function' ? ch(x) : ch, { updatedAt: nowIso() }) : x; }); }); }
function custSave(fn){
  manual('customer profile');
  var f = typeof W.__gcSetCustomersNow === 'function' ? W.__gcSetCustomersNow : W._setCustomers;
  try { if (typeof f === 'function') f(function(prev){ return fn(Array.isArray(prev) ? prev.slice() : []); }); } catch (e) { warn(e); }
  try { if (W._crm && Array.isArray(W._crm.customers)) W._crm.customers = fn(W._crm.customers.slice()); } catch (e) {}
  try { if (Array.isArray(W._graycoCustomers)) W._graycoCustomers = fn(W._graycoCustomers.slice()); } catch (e) {}
}

/* ════ 1. THE SENT VERSIONS ═════════════════════════════════════════════════════════════════════════════════ */
function idsOf(e){ var o = {}; [e && e.id, e && e.estBuilderId, e && e._promotedFrom].forEach(function(x){ if (s(x)) o[s(x)] = 1; }); return o; }
function shaOfRef(ref){ var m = /^sb:crm-files\/([0-9a-f]{64})\.pdf$/i.exec(s(ref)); return m ? m[1].toLowerCase() : ''; }
function isPdfRef(ref){ return !!shaOfRef(ref); }
/* every version of one estimate: what it carries (sentPdfs) + what the server recorded (gc_est_sent), one row each */
function versions(e){
  if (!e) return [];
  var ids = idsOf(e), by = {}, out = [];
  var add = function(v, src){
    if (!v || !isPdfRef(v.ref)) return;
    if (/^(failed|paused)$/.test(s(v.status))) return;
    var k = s(v.id) || ('ref:' + s(v.ref)); var o = by[k] || by['sha:' + s(v.sha256 || shaOfRef(v.ref))];
    if (o) { if (src === 'server' && (v.status === 'sent' && o.status !== 'sent')) { o.status = 'sent'; o.sentAt = v.sentAt; } if (!o.sentTo && v.sentTo) o.sentTo = v.sentTo; if (v.portalAt) o.portalAt = v.portalAt; return; }
    var x = Object.assign({}, v); x.sha256 = s(v.sha256 || shaOfRef(v.ref)); x._src = src;
    by[k] = x; by['sha:' + x.sha256] = x; out.push(x);
  };
  arr(e.sentPdfs).forEach(function(v){ add(v, 'estimate'); });
  S.sent.forEach(function(v){ if (ids[s(v.estId)]) add(v, 'server'); });
  out.sort(function(a, b){ return (+a.version || 0) - (+b.version || 0) || s(a.sentAt || a.heldAt).localeCompare(s(b.sentAt || b.heldAt)); });
  out.forEach(function(v, i){ v.version = +v.version || (i + 1); });
  return out;
}
function current(e){ var v = versions(e); return v.length ? v[v.length - 1] : null; }
function hasSend(e){ return !!current(e); }
/* went to the portal by one of the two paths (a CRM send / an upload; the older proposal / e-sign / portal sends count; a
   back-filled copy of a send from before this build counts too — those jobs keep moving as before) */
function inPortal(e){ return versions(e).some(function(v){ return /^(crm-email|upload|esign|proposal|portal|compose|bid|backfill)$/.test(s(v.via)) && /^(sent|held)$/.test(s(v.status)); }); }
function verLine(v){
  if (!v) return '';
  var who = s(v.sentTo).split(/[,;]\s*/)[0];
  if (who.length > 26) who = who.slice(0, 24) + '…';
  if (v.status === 'held') return '⏰ Goes out ' + fmtWhen(v.releaseAt) + ' (customer quiet hours) · v' + v.version;
  if (v.via === 'backfill') return 'On file ' + fmtDay(v.sentAt) + ' · linked from ' + s(v.how || 'the job’s files') + ' · v' + v.version;
  if (v.via === 'upload') return 'Sent ' + fmtDay(v.sentAt) + ' by ' + ({ text: 'text', gdocs: 'Google Docs', email: 'e-mail' }[v.method] || 'hand') + (who ? ' to ' + who : '') + ' · uploaded · v' + v.version;
  return 'Sent ' + fmtDay(v.sentAt) + (who ? ' to ' + who : (v.via === 'portal' ? ' to the customer portal' : '')) + ' · v' + v.version;
}
/* the server's list → the estimates and the job's documents (each version once, same ids on every computer) */
function pull(force){
  if (!signedIn()) return Promise.resolve(S.sent);
  if (!force && Date.now() - S.sentAt < 120e3) return Promise.resolve(S.sent);
  S.sentAt = Date.now();
  kvRead('gc_est_views').then(function(v){ if (Array.isArray(v)) S.views = arr(v); }, function(){});   /* the customer opened it in the portal */
  return kvRead(SENT_KEY).then(function(v){ if (Array.isArray(v)) { S.sent = arr(v); fold(); } return S.sent; }, function(){ return S.sent; });
}
function fold(){
  var touched = 0;
  S.sent.forEach(function(v){
    if (!isPdfRef(v.ref) || /^(failed|paused)$/.test(s(v.status))) return;
    var e = estById(v.estId); if (!e) return;
    var have = arr(e.sentPdfs).filter(function(x){ return s(x.id) === s(v.id) || (x.sha256 && x.sha256 === v.sha256); })[0];
    if (have && (have.status === v.status || v.status !== 'sent')) return;
    var row = { id: s(v.id), ref: s(v.ref), sha256: s(v.sha256), size: v.size || 0, version: +v.version || 0, status: s(v.status), sentAt: s(v.sentAt), heldAt: s(v.heldAt), releaseAt: s(v.releaseAt),
      sentTo: s(v.sentTo), sentBy: s(v.sentBy), via: s(v.via), name: s(v.name), portalAt: s(v.portalAt) };
    setEst(e.id, function(x){ var l = arr(x.sentPdfs).filter(function(y){ return !(s(y.id) === row.id || (y.sha256 && y.sha256 === row.sha256)); }).concat([Object.assign({}, have || {}, row)]);
      l.sort(function(a, b){ return (+a.version || 0) - (+b.version || 0); }); var cur = l[l.length - 1];
      return { sentPdfs: l, sentPdf: summary(cur), status: /^(won|signed|accepted|approved|lost|declined)/i.test(s(x.status)) ? x.status : 'Sent', sentDate: s(cur.sentAt || cur.heldAt).slice(0, 10) || x.sentDate }; });
    var p = proj(v.pid || e.pid);
    if (p) fileDoc(e, p, row, v.via === 'portal');
    touched++;
  });
  if (touched) note('folded ' + touched + ' send record(s) into the estimates');
}
function summary(v){ return v ? { fileId: s(v.id), url: s(v.ref), ref: s(v.ref), sentAt: s(v.sentAt), heldUntil: v.status === 'held' ? s(v.releaseAt) : '', sentTo: s(v.sentTo), sentBy: s(v.sentBy), version: +v.version || 1, sha256: s(v.sha256), via: s(v.via) } : null; }
function docName(e, v){ var nm = scrub(s(e.name || e.num || 'Estimate'), wordsFor(e, jobOf(e))).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80); return 'Estimate — ' + nm + ' — sent ' + s(v.sentAt || v.heldAt || nowIso()).slice(0, 10) + '.pdf'; }
function fileDoc(e, p, v, portal){
  var id = 'DESTPDF_' + s(e.id).replace(/[^A-Za-z0-9_-]/g, '_') + '_v' + (+v.version || 1);
  if (docs().some(function(d){ return s(d.id) === id && s(d.ref) === s(v.ref); })) return id;
  upsertDoc({ id: id, pid: p.id, projectId: p.id, estimateId: e.id, cat: 'Estimates', name: s(v.docName) || docName(e, v), ref: v.ref, type: 'application/pdf', size: v.size || 0, sha256: v.sha256 || shaOfRef(v.ref),
    uploadedAt: s(v.sentAt || v.heldAt) || nowIso(), uploaded: s(v.sentAt || v.heldAt || nowIso()).slice(0, 10), by: s(v.sentBy) || meName(), source: 'estimate-sent', sentPdf: true, version: +v.version || 1,
    sentTo: s(v.sentTo), portalShare: portal ? true : (e.portalShare === true ? true : false), confirmed: true, noNotice: true });
  /* the older versions stay, marked superseded */
  patchDocs(function(d){ return d && s(d.estimateId) === s(e.id) && d.sentPdf === true && s(d.id) !== id && (+d.version || 0) < (+v.version || 1) && !d.supersededBy; }, { supersededBy: id, supersededAt: nowIso() });
  return id;
}

/* ════ 2. THE PDF (the customer copy) ═══════════════════════════════════════════════════════════════════════ */
function claimOf(p){ try { var c = arr(crm().gc_claims).filter(function(x){ return x && x.deleted !== true && s(x.projectId) === s(p && p.id); })[0]; return c || null; } catch (e) { return null; } }
function isIns(p){ if (!p) return false; if (p.isInsurance === true) return true; if (p.isInsurance === false) return false; return /insurance\s*claim|insurance|restoration|mitigation/i.test(s(p.type) + ' ' + s(p.jobType)) || !!claimOf(p); }
function wordsFor(e, p){
  var w = [];
  var c = claimOf(p) || {};
  [p && p.carrier, p && p.insuranceCo, p && p.insuranceCompany, p && p.insurer, c.carrier, c.tpa, c.program, p && p.adjusterCompany, p && p.tpa, e && e.carrier, e && e.insuranceCo]
    .forEach(function(v){ v = s(v); if (v.length >= 3 && !/^none/i.test(v)) w.push(v); });
  [p && p.claimNumber, p && p.claimNo, c.claimNumber, c.claimNo, e && e.claimNumber].forEach(function(v){ v = s(v); if (v.length >= 4) w.push({ claim: v }); });
  return w;
}
function scrub(t, words){
  t = String(t == null ? '' : t).replace(CARRIERS, 'your insurance company');
  arr([]).concat(words || []).forEach(function(w){
    if (w && typeof w === 'object' && w.claim) { t = t.split(w.claim).join('(on file)'); return; }
    var x = s(w); if (x.length < 3) return;
    t = t.replace(new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'your insurance company');
  });
  return t.replace(/\bclaim\s*(#|no\.?|number)\s*[:#]?\s*[A-Z0-9-]{4,}/gi, 'claim (on file)');
}
var INTERNAL = /^(notes|internalNotes|internal|privateNotes|pmNotes|estimatorNotes|costNotes|officeNotes|adminNotes|internalNote|carrier|insuranceCo|insuranceCompany|insurer|adjuster|adjusterCompany|claimNumber|claimNo|dateOfLoss|lossDate|tpa|margin|gp|totalCost|subToEmail|subToCompany|subToContact|versions|estin|activity)$/;
/* the estimate as the customer may see it: no internal notes, no carrier / claim, no costs */
function customerCopy(e){
  var p = jobOf(e), words = wordsFor(e, p), out = {};
  Object.keys(e || {}).forEach(function(k){ if (!INTERNAL.test(k)) out[k] = e[k]; });
  ['name', 'client', 'address', 'scopeNotes', 'description'].forEach(function(k){ if (typeof out[k] === 'string') out[k] = scrub(out[k], words); });
  if (out.scope && typeof out.scope === 'object') { out.scope = Object.assign({}, out.scope); ['text', 'inc', 'exc'].forEach(function(k){ if (typeof out.scope[k] === 'string') out.scope[k] = scrub(out.scope[k], words); }); }
  out.lines = arr(e && e.lines).map(function(l){ var c = {}; Object.keys(l).forEach(function(k){ if (!/note|internal|memo|vendor|supplier/i.test(k)) c[k] = l[k]; }); if (typeof c.desc === 'string') c.desc = scrub(c.desc, words); if (typeof c.cat === 'string') c.cat = scrub(c.cat, words); return c; });
  return { est: out, words: words };
}
function proposalHtml(e){
  var cc = customerCopy(e), html = '';
  try { if (W._gcEstin && typeof W._gcEstin.proposalHtml === 'function') html = W._gcEstin.proposalHtml(cc.est); } catch (x) { warn(x); }
  if (!html) { try { if (typeof W._gcBuildGrayCoProposal === 'function') html = W._gcBuildGrayCoProposal(cc.est); } catch (x) { warn(x); } }
  return html ? scrub(html, cc.words) : '';
}
function loadScript(src){ return new Promise(function(res){ var x = D.createElement('script'); x.src = src; x.onload = function(){ res(true); }; x.onerror = function(){ res(false); }; (D.head || D.documentElement).appendChild(x); later(function(){ res(false); }, 15000); }); }
function viaHtml2pdf(html){
  var go = W.html2pdf ? Promise.resolve(true) : loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
  return go.then(function(ok){
    if (!ok || !W.html2pdf) return null;
    var holder = D.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:816px;background:#fff'; holder.innerHTML = html; D.body.appendChild(holder);
    return W.html2pdf().set({ margin: 0, image: { type: 'jpeg', quality: 0.92 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'pt', format: 'letter', orientation: 'portrait' } })
      .from(holder).toPdf().get('pdf').then(function(pdf){ holder.remove(); return pdf.output('blob'); }, function(){ holder.remove(); return null; });
  }, function(){ return null; });
}
/* the plain GrayCo proposal (text PDF) when the page renderer cannot load: the same customer copy */
function viaJsPdf(e){
  var go = (W.jspdf && W.jspdf.jsPDF) ? Promise.resolve(true) : loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  return go.then(function(ok){
    if (!ok || !(W.jspdf && W.jspdf.jsPDF)) return null;
    var cc = customerCopy(e), est = cc.est, p = jobOf(e) || {};
    var doc = new W.jspdf.jsPDF({ unit: 'pt', format: 'letter' }), y = 54, L = 54, Wd = 504;
    var line = function(t, sz, bold, gap){ doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(sz || 10); doc.splitTextToSize(String(t || ''), Wd).forEach(function(r){ if (y > 740) { doc.addPage(); y = 54; } doc.text(r, L, y); y += (sz || 10) + 4; }); y += gap || 0; };
    line('GrayCo Construction Services, LLC', 16, true); line('(901) 585-0944 · billing@grayco-cs.com · TN License # 85034 BCB', 9, false, 8);
    line('PROPOSAL', 13, true, 2); line(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 10, false, 6);
    line('Project: ' + scrub(s(est.name || p.name), cc.words), 11, true); if (s(est.address || p.address)) line('Location: ' + scrub(s(est.address || p.address), cc.words), 10);
    if (s(est.client || p.client)) line('Customer: ' + scrub(s(est.client || p.client), cc.words), 10, false, 8);
    line('SCOPE OF WORK', 11, true, 2);
    var groups = {}, order = [];
    arr(est.lines).forEach(function(l){ var c = s(l.cat || l.category) || 'General'; if (!groups[c]) { groups[c] = { t: 0, items: [] }; order.push(c); } var q = num(l.qty) || 1; groups[c].t += l.charge != null ? num(l.charge) : (l.sell != null ? num(l.sell) : num(l.cost) * q); if (s(l.desc)) groups[c].items.push(s(l.desc)); });
    var total = num(est.totalCharge) || num(est.total);
    order.forEach(function(c, i){ line((i + 1) + '. ' + c + (groups[c].items.length ? ' — ' + groups[c].items.slice(0, 3).join(', ') : ''), 10); });
    if (!order.length && s(est.scopeNotes || (est.scope && est.scope.text))) line(s(est.scopeNotes || est.scope.text), 10);
    y += 6; line('TOTAL: ' + money(total), 13, true, 10);
    line('This proposal is valid for 30 days. Payment terms per the contract. Thank you for choosing GrayCo.', 9, false, 16);
    line('Customer signature: ____________________________   Date: ____________', 10);
    return doc.output('blob');
  }, function(){ return null; });
}
/* the 5-page GrayCo proposal: the CRM's own Customer Proposal Generator (Templates), its data + its HTML (exposed by this patch) */
function proposal5Html(e){
  var G = W._gcProposal5; if (!G || typeof G.data !== 'function' || typeof G.html !== 'function') return '';
  var p = jobOf(e), cc = customerCopy(e); if (!p) return '';
  var pd = null; try { pd = G.data(Object.assign({}, p, { customerNotes: '' }), cc.est); } catch (x) { warn(x); }
  if (!pd) return '';
  var html = ''; try { html = G.html(pd); } catch (x) { warn(x); }
  return html ? scrub(html, cc.words) : '';
}
/* a whole HTML page (its own <style>) → PDF. Its CSS is scoped to one holder (".gcp5 …"), so while it is drawn its
   styles never touch the CRM page (html2pdf draws a copy of the holder inside this page) */
function scopeCss(css, root){
  var out = '', i = 0;
  css = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  while (i < css.length) {
    var b = css.indexOf('{', i); if (b < 0) break;
    var head = css.slice(i, b).trim(), depth = 1, j = b + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    var body = css.slice(b + 1, j - 1);
    if (/^@(media|supports)/i.test(head)) out += head + '{' + scopeCss(body, root) + '}';
    else if (/^@(page|font-face|keyframes|-webkit-keyframes|import|charset)/i.test(head)) { if (!/^@page/i.test(head)) out += head + '{' + body + '}'; }
    else out += head.split(',').map(function(sel){ sel = sel.trim(); if (!sel) return ''; if (/^(html|body|:root)$/i.test(sel)) return root; return root + ' ' + sel.replace(/^(html|body)\s+/i, ''); }).filter(Boolean).join(',') + '{' + body + '}';
    i = j;
  }
  return out;
}
function viaFrame(html){
  var go = W.html2pdf ? Promise.resolve(true) : loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
  return go.then(function(ok){
    if (!ok || !W.html2pdf) return null;
    var css = '', m, re = /<style[^>]*>([\s\S]*?)<\/style>/gi; while ((m = re.exec(html))) css += m[1] + '\n';
    var bm = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html), body = (bm ? bm[1] : html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\son[a-z]+="[^"]*"/gi, '');
    var holder = D.createElement('div'); holder.className = 'gcp5'; holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:8.5in;background:#fff';
    holder.innerHTML = '<style>' + scopeCss(css, '.gcp5') + '</style>' + body;
    D.body.appendChild(holder);
    return W.html2pdf().set({ margin: 0, image: { type: 'jpeg', quality: 0.9 }, html2canvas: { scale: 1.5, useCORS: true, backgroundColor: null }, pagebreak: { mode: ['css'] }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } })
      .from(holder).toPdf().get('pdf').then(function(pdf){ holder.remove(); return pdf.output('blob'); }, function(err){ holder.remove(); warn(err); return null; });
  }, function(){ return null; });
}
var DESIGNS = { p5: 'GrayCo 5-page proposal', simple: 'Simple estimate', uploaded: 'The uploaded estimate PDF' };
function designDefault(p, e){
  if (isUploadPdf(e)) return 'uploaded';
  var g = ''; try { g = W._gcJA ? W._gcJA.groupOf(p || {}) : ''; } catch (x) {}
  var d = S.designs && S.designs[g]; return d === 'p5' || d === 'simple' ? d : 'simple';
}
function isUploadPdf(e){ return !!(e && isPdfRef(e.sourceRef) && /upload|email/i.test(s(e.source)) && /pdf/i.test(s(e.sourceType) + ' ' + s(e.sourceRef))); }
/* → { blob, name, how } or null (no PDF → no send) */
function makePdf(e, design){
  design = design || (isUploadPdf(e) ? 'uploaded' : 'simple');
  if (design === 'uploaded' && isUploadPdf(e) && typeof W._gcFileBlob === 'function') return W._gcFileBlob(e.sourceRef).then(function(b){ return { blob: b, how: 'uploaded PDF' }; }, function(){ return null; });   /* an uploaded estimate IS its PDF */
  if (design === 'p5') { var h5 = proposal5Html(e); if (!h5) return Promise.resolve(null); return viaFrame(h5).then(function(b){ return b ? { blob: b, how: DESIGNS.p5 } : null; }); }   /* the 5-page design or nothing (never a different design in its place) */
  var html = proposalHtml(e);
  return (html ? viaHtml2pdf(html) : Promise.resolve(null)).then(function(b){ return b ? { blob: b, how: 'GrayCo proposal' } : viaJsPdf(e).then(function(b2){ return b2 ? { blob: b2, how: 'GrayCo proposal (plain)' } : null; }); });
}
function hex(buf){ var a = new Uint8Array(buf), o = ''; for (var i = 0; i < a.length; i++) o += (a[i] < 16 ? '0' : '') + a[i].toString(16); return o; }
function sha256(buf){ return crypto.subtle.digest('SHA-256', buf).then(hex); }
/* the exact bytes into crm-files, CONFIRMED (the upload answered ok / already there) — else it throws: no send */
function storeConfirmed(blob, name){
  return blob.arrayBuffer().then(function(ab){
    var head = new Uint8Array(ab.slice(0, 5)); if (String.fromCharCode.apply(null, head) !== '%PDF-') throw new Error('not a PDF');
    return sha256(ab).then(function(h){
      var ref = 'sb:crm-files/' + h + '.pdf', file = new Blob([ab], { type: 'application/pdf' });
      try { if (typeof W._gcStoreFile === 'function') W._gcStoreFile(new File([ab], name || 'Estimate.pdf', { type: 'application/pdf' }), { kind: 'doc', name: name }).catch(function(){}); } catch (e) {}
      return W.fetch(SB + '/storage/v1/object/crm-files/' + h + '.pdf', { method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' } })
        .then(function(r){
          if (r.ok) return 'ok';
          return r.text().then(function(t){ if (r.status === 409 || /Duplicate|already exists/i.test(t)) return 'exists'; throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 80)); });
        }).then(function(){ return { ref: ref, sha256: h, size: ab.byteLength, name: name }; });
    });
  });
}

/* ════ 3. CUSTOMER PROFILE (before a send) ══════════════════════════════════════════════════════════════════ */
function custFor(p, l, e){
  var cs = customers(), id = s((p && p.customerId) || (l && l.customerId) || (e && e.customerId));
  var c = id ? cs.filter(function(x){ return s(x.id) === id; })[0] : null;
  if (c) return c;
  var CA = W._gcCustAllCore; if (!CA) return null;
  var name = s((p && p.client) || (l && (l.contactName || l.name)) || (e && e.client));
  var cand = { name: name, email: CA.email((p && p.clientEmail) || (l && l.email) || (e && (e.clientEmail || e.email))), phone: CA.phone10((p && p.clientPhone) || (l && l.phone) || (e && e.clientPhone)), address: s((p && p.address) || (l && l.address) || (e && e.address)) };
  if (!cand.name && !cand.email && !cand.phone) return null;
  var m = CA.match(cs, cand);
  return m && m.by !== 'name only' ? m.c : null;   /* never on a name alone */
}
var PROFILE_FIELDS = [
  ['name', 'Customer full name (or company)', 'text', 'name'], ['contact', 'Contact name (for a company)', 'text', 'name'],
  ['phone', 'Mobile phone', 'tel', 'tel'], ['email', 'E-mail (the estimate is e-mailed)', 'email', 'email'],
  ['address', 'Service / job address', 'text', 'street-address'], ['billing', 'Billing address', 'text', 'street-address'],
  ['prefer', 'Preferred contact method', 'select'], ['claim', 'Claim number (staff only — never shown to the customer)', 'text', 'off'], ['dol', 'Date of loss (staff only)', 'date', 'off']
];
function profileOf(e){
  var p = jobOf(e), l = leadOf(e, p), c = custFor(p, l, e) || {}, cl = claimOf(p) || {};
  var v = {
    name: s(c.name || (p && p.client) || (l && (l.contactName || (l.contact && l.contact.name) || l.name)) || e.client),
    company: s(c.company || (l && l.company)), contact: s(c.contactName || (arr(c.contacts)[0] || {}).name || (l && l.contactName)),
    phone: s(c.mobile || c.phone || (p && p.clientPhone) || (l && l.phone) || e.clientPhone),
    email: s(c.email || (p && p.clientEmail) || (l && l.email) || e.clientEmail || e.email),
    address: s((p && p.address) || (l && l.address) || e.address),
    billing: s(c.billingAddress || (p && p.billingAddress)), billingSame: c.billingSameAsJob === true || (p && p.billingSameAsJob === true),
    prefer: s(c.preferredContact || (p && p.preferredContact) || (l && l.preferredContact)),
    claim: s((p && (p.claimNumber || p.claimNo)) || cl.claimNumber || cl.claimNo), dol: s((p && (p.dateOfLoss || p.lossDate)) || cl.dateOfLoss || cl.lossDate || cl.dol),
    ins: isIns(p), p: p, l: l, c: c.id ? c : null
  };
  return v;
}
function profileGaps(e){
  var v = profileOf(e), g = [];
  var company = v.company && !v.name ? true : false;
  if (!v.name && !(v.company && v.contact)) g.push('name');
  if (company && !v.contact) g.push('contact');
  if (!(W._gcCustAllCore ? W._gcCustAllCore.phone10(v.phone) : v.phone.replace(/\D/g, '').length >= 10)) g.push('phone');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.email)) g.push('email');
  if (s(v.address).length < 6) g.push('address');
  if (!v.billing && !v.billingSame) g.push('billing');
  if (!/^(text|call|email|e-mail|phone)$/i.test(v.prefer)) g.push('prefer');
  if (v.ins) { if (!v.claim) g.push('claim'); if (!v.dol) g.push('dol'); }
  return g;
}
function knownAddresses(){
  var o = {}; projects().concat(leads()).forEach(function(x){ var a = s(x.address); if (a.length > 8) o[a] = 1; }); customers().forEach(function(c){ var a = s(c.address); if (a.length > 8) o[a] = 1; });
  return Object.keys(o).slice(0, 400);
}
function sheetCss(){
  if (D.getElementById('gc-estpdf-css')) return;
  var st = D.createElement('style'); st.id = 'gc-estpdf-css';
  st.textContent = [
    '.gcep-ov{position:fixed;inset:0;z-index:2147483200;background:rgba(6,12,20,.86);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(12px + env(safe-area-inset-top,0px)) 10px 40px;font-family:Inter,-apple-system,Arial,sans-serif}',
    '.gcep-box{background:#f8fafc;color:#0f172a;border-radius:14px;max-width:640px;width:100%;padding:16px;box-sizing:border-box}',
    '.gcep-box h3{margin:0 0 4px;font-size:18px}.gcep-box .sub{font-size:13px;color:#475569;margin-bottom:8px}',
    '.gcep-box label{display:block;font-size:12.5px;font-weight:700;color:#475569;margin:10px 0 4px}',
    '.gcep-box input[type=text],.gcep-box input[type=email],.gcep-box input[type=tel],.gcep-box input[type=date],.gcep-box select,.gcep-box textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;background:#fff;color:#0f172a;min-height:46px}',
    '.gcep-box .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.gcep-box .row button{flex:1;min-height:48px}',
    '.gcep-b{border:none;border-radius:10px;padding:10px 14px;font:800 15px Inter,Arial,sans-serif;cursor:pointer;background:#e2e8f0;color:#0f172a}.gcep-b.pri{background:#2563eb;color:#fff}.gcep-b.gold{background:#d4a017;color:#0f1d2f}.gcep-b:disabled{opacity:.55}',
    '.gcep-msg{font-size:14px;font-weight:700;margin-top:10px;min-height:18px}.gcep-msg.bad{color:#b91c1c}.gcep-msg.ok{color:#0f766e}',
    '.gcep-feat{background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-top:8px}.gcep-feat .fh{display:flex;align-items:center;gap:8px;padding:10px 12px;font-weight:800;cursor:pointer}',
    '.gcep-feat .fl{padding:0 10px 8px}.gcep-feat .fi{display:flex;align-items:center;gap:10px;padding:8px 4px;border-top:1px solid #f1f5f9;font-size:14px}.gcep-feat .fi small{display:block;color:#64748b;font-size:12px}',
    '.gcep-feat .fi .x{margin-left:auto;border:1px solid #cbd5e1;background:#fff;border-radius:8px;min-width:40px;min-height:36px;font-weight:800;cursor:pointer}.gcep-feat .fi.off{opacity:.55}.gcep-feat .fi.off .t{text-decoration:line-through}',
    '.gcep-slot{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.gcep-slot .m{font-size:11px;color:#64748b}.gcep-slot .w{font-size:11.5px;color:#92400e;font-weight:700}',
    '.gcep-pdf{background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:800;padding:6px 12px;cursor:pointer}',
    '.gcep-sm{background:#fff;color:#1e3a5f;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;font-weight:700;padding:4px 9px;cursor:pointer}',
    '.gcep-ns{font-size:11.5px;font-weight:800;color:#64748b;background:#f1f5f9;border-radius:6px;padding:4px 8px}',
    '.gcep-ver{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:6px 0;cursor:pointer;font-size:14px}',
    '.gcep-list .it{display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #f1f5f9;font-size:13px}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}
function overlay(id, html){
  sheetCss();
  var old = D.getElementById(id); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = id; ov.className = 'gcep-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="gcep-box" role="dialog" aria-modal="true">' + html + '</div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(ev){ if (ev.target === ov) ov.remove(); });
  return ov;
}
/* the short "Finish customer profile" sheet: only what is missing, pre-filled from the lead / job */
function profileSheet(e, gaps, then){
  var v = profileOf(e), dl = '<datalist id="gcep-addrs">' + knownAddresses().map(function(a){ return '<option value="' + esc(a) + '">'; }).join('') + '</datalist>';
  var val = { name: v.name || v.company, contact: v.contact, phone: v.phone, email: v.email, address: v.address, billing: v.billing, prefer: v.prefer, claim: v.claim, dol: v.dol };
  var field = function(k){
    var f = PROFILE_FIELDS.filter(function(x){ return x[0] === k; })[0]; if (!f) return '';
    if (k === 'prefer') return '<label for="gcep-f-prefer">' + f[1] + '</label><select id="gcep-f-prefer" data-f="prefer"><option value="">— pick one —</option><option value="text"' + (val.prefer === 'text' ? ' selected' : '') + '>Text</option><option value="call"' + (val.prefer === 'call' ? ' selected' : '') + '>Phone call</option><option value="email"' + (val.prefer === 'email' ? ' selected' : '') + '>E-mail</option></select>';
    if (k === 'billing') return '<label for="gcep-f-billing">' + f[1] + '</label><label style="display:flex;gap:8px;align-items:center;font-weight:700;color:#0f172a;margin:4px 0"><input type="checkbox" data-f="same" style="width:22px;height:22px"> Same as the job address</label><input id="gcep-f-billing" data-f="billing" type="text" autocomplete="street-address" list="gcep-addrs" value="' + esc(val.billing) + '">';
    return '<label for="gcep-f-' + k + '">' + f[1] + '</label><input id="gcep-f-' + k + '" data-f="' + k + '" type="' + f[2] + '"' + (f[2] === 'tel' ? ' inputmode="tel"' : f[2] === 'email' ? ' inputmode="email"' : '') + ' autocomplete="' + (f[3] || 'off') + '"' + (k === 'address' ? ' list="gcep-addrs"' : '') + ' value="' + esc(val[k]) + '">' + (k === 'address' ? '<button type="button" class="gcep-sm" data-geo="1" style="margin-top:6px">✓ Check the address</button>' : '');
  };
  var ov = overlay('gc-estpdf-prof', '<h3>👤 Finish customer profile</h3><div class="sub">Before <b>' + esc(e.name || 'this estimate') + '</b> is sent the customer needs: ' + gaps.map(function(k){ return { name: 'name', contact: 'contact name', phone: 'mobile phone', email: 'e-mail', address: 'job address', billing: 'billing address', prefer: 'preferred contact', claim: 'claim #', dol: 'date of loss' }[k]; }).join(', ') + '.</div>' + dl +
    gaps.map(field).join('') + '<div class="gcep-msg" data-m></div><div class="row"><button type="button" class="gcep-b" data-x>Cancel</button><button type="button" class="gcep-b pri" data-save>Save and continue</button></div>');
  var q = function(sel){ return ov.querySelector(sel); }, msg = function(t, bad){ var m = q('[data-m]'); m.textContent = t; m.className = 'gcep-msg ' + (bad ? 'bad' : 'ok'); };
  q('[data-x]').onclick = function(){ ov.remove(); };
  var same = q('[data-f="same"]'); if (same) same.onchange = function(){ var b = q('[data-f="billing"]'); if (b) { b.disabled = same.checked; if (same.checked) b.value = s((q('[data-f="address"]') || {}).value || v.address); } };
  var geo = q('[data-geo]'); if (geo) geo.onclick = function(){
    var a = s(q('[data-f="address"]').value); if (!a) return;
    msg('Checking…'); call('geocode', { addresses: [a] }).then(function(j){ var r = j && Array.isArray(j.results) ? j.results[0] : null; if (r && r.matched) { q('[data-f="address"]').value = s(r.matched); msg('✓ Found: ' + s(r.matched)); } else msg('Not found by the map service — check it, or keep it as typed.', true); });
  };
  q('[data-save]').onclick = function(){
    var g = {}; Array.prototype.forEach.call(ov.querySelectorAll('[data-f]'), function(i){ g[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : s(i.value); });
    if (g.same) g.billing = s(g.address || v.address);
    var bad = '';
    if ('name' in g && !g.name) bad = 'Type the customer’s name.';
    else if ('phone' in g && (W._gcCustAllCore ? !W._gcCustAllCore.phone10(g.phone) : g.phone.replace(/\D/g, '').length < 10)) bad = 'Type a 10-digit mobile number.';
    else if ('email' in g && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(g.email)) bad = 'Check the e-mail.';
    else if ('address' in g && g.address.length < 6) bad = 'Type the job address.';
    else if ('billing' in g && !g.billing && !g.same) bad = 'Type the billing address or tick "Same as the job address".';
    else if ('prefer' in g && !g.prefer) bad = 'Pick how they like to be contacted.';
    else if ('claim' in g && !g.claim) bad = 'Type the claim number.';
    else if ('dol' in g && !g.dol) bad = 'Pick the date of loss.';
    else if ('contact' in g && !g.contact) bad = 'Type the contact’s name.';
    if (bad) { msg(bad, true); return; }
    saveProfile(e, g);
    ov.remove();
    later(then, 50);
  };
  return ov;
}
function saveProfile(e, g){
  var v = profileOf(e), p = v.p, l = v.l, CA = W._gcCustAllCore;
  var name = s(g.name) || v.name, phone = s(g.phone) || v.phone, email = low(g.email) || v.email, address = s(g.address) || v.address;
  var extra = {};
  if ('billing' in g || g.same) { extra.billingAddress = s(g.billing); extra.billingSameAsJob = !!g.same; }
  if (g.prefer) extra.preferredContact = g.prefer;
  if (g.contact) extra.contactName = g.contact;
  if (g.phone) extra.mobile = g.phone;
  var cust = v.c;
  if (!cust && typeof W._gcCustAllAdd === 'function') { try { cust = W._gcCustAllAdd({ name: name, phone: phone, email: email, address: address, _pid: p ? p.id : '' }); } catch (x) { warn(x); } }
  if (cust && cust.id) {
    custSave(function(list){
      var hit = false, out = list.map(function(c){ if (c && s(c.id) === s(cust.id)) { hit = true; var n = Object.assign({}, c, extra, { updatedAt: nowIso() }); if (g.name) n.name = g.name; if (g.phone) n.phone = g.phone; if (g.email) n.email = low(g.email); if (g.address && !s(c.address)) n.address = g.address; return n; } return c; });
      if (!hit) out.push(Object.assign({}, cust, extra, { name: name, phone: phone, email: email, address: s(cust.address) || address, updatedAt: nowIso() }));
      return out;
    });
  }
  if (p) setProj(p.id, function(x){ var o = { }; if (g.name) o.client = g.name; if (g.phone) o.clientPhone = g.phone; if (g.email) o.clientEmail = low(g.email); if (g.address) o.address = g.address; if (cust && cust.id && !x.customerId) o.customerId = cust.id; if (g.claim) o.claimNumber = g.claim; if (g.dol) o.dateOfLoss = g.dol; return Object.assign(o, extra); });
  if (l) setLead(l.id, function(x){ var o = {}; if (g.phone && !s(x.phone)) o.phone = g.phone; if (g.email && !s(x.email)) o.email = low(g.email); if (g.address && !s(x.address)) o.address = g.address; if (cust && cust.id && !x.customerId) o.customerId = cust.id; if (g.prefer) o.preferredContact = g.prefer; return o; });
  if (!p && !l) setEst(e.id, function(){ var o = {}; if (g.name) o.client = g.name; if (g.email) o.clientEmail = low(g.email); if (g.phone) o.clientPhone = g.phone; if (g.address) o.address = g.address; return o; });
  /* until the lists hand the saved records back, the check reads these */
  S.profile = S.profile || {}; S.profile[e.id] = Object.assign({}, S.profile[e.id] || {}, g, extra);
  note('profile saved for ' + s(e.name));
}

/* ════ 4. CUSTOMER FEATURES FOR THIS JOB (patch JA's per-job switches) ══════════════════════════════════════ */
/* the customer-facing switches the CRM already honours (server: _lib/job-auto.js blockedKind; page: patch JA) */
var FEATURES = [
  ['portalLink', '🔗 Customer portal access'], ['portalInvite', '✉️ Portal invite e-mail / text'], ['weeklyUpdates', '📰 Weekly updates in the portal'],
  ['progressPosts', '📸 Progress post notices'], ['docsNotice', '📬 “New in your portal” notices'], ['portalSelections', '🎨 Selections in the portal'],
  ['contractSign', '✍️ E-sign for the estimate / contract'], ['coSign', '± Change orders through the portal (signature)'], ['scheduleUpdates', '🗓 Schedule updates & appointment notices'],
  ['invoiceEmail', '🧾 Invoices e-mailed / in the portal'], ['paymentReminders', '⏰ Payment reminders'], ['finalReminders', '🏁 Final invoice reminders'],
  ['lienWaivers', '📑 Lien waivers'], ['warrantyCert', '🛡 Warranty letter at closeout'], ['thankYou', '🎉 Thank-you e-mail'], ['reviewRequest', '⭐ Review request after completion'],
  ['yearlyCheckup', '🔧 Yearly checkup (maintenance) reminder'], ['faqPacket', '📘 Customer FAQ / portal packet'], ['welcome', '👋 Welcome / job started'],
  ['w9', '🧾 W-9 for the customer'], ['newsletter', '📰 GrayCo News list'], ['claimFile', '🛡 Insurance claim help (claim file)'], ['showCarrier', '🏷 Show the carrier name in the portal']
];
function featureDefaults(p){
  var JA = W._gcJA; if (!JA || !p) return null;
  try { return JA.defaultsFor ? JA.defaultsFor(JA.groupOf(p)) : null; } catch (e) { return null; }
}
function featureState(p){
  var JA = W._gcJA; if (!JA || !p) return null;
  var eff = {}; try { eff = JA.effective(p) || {}; } catch (e) { eff = {}; }
  var has = {}; try { (JA.KEYS || []).forEach(function(k){ has[k] = 1; }); } catch (e) {}
  var own = p.features && typeof p.features === 'object' ? p.features : null;
  return FEATURES.filter(function(f){ return has[f[0]]; }).map(function(f){ var on = own && typeof own[f[0]] === 'boolean' ? own[f[0]] : eff[f[0]] !== false; return { key: f[0], label: f[1], on: on, def: (featureDefaults(p) || {})[f[0]] !== false }; });
}
function featuresHtml(p){
  var st = featureState(p); if (!st || !st.length) return '';
  var chosen = !!(p.features && p.features.chosenAt), grp = ''; try { grp = W._gcJA.groupOf(p); } catch (e) {}
  return '<div class="gcep-feat" data-feat><div class="fh" data-fh>⚙ Customer features for this job <span style="font-weight:600;color:#64748b;font-size:12.5px">' + (chosen ? '· chosen ' + esc(fmtDay(p.features.chosenAt)) : '· the ' + esc(grp || 'job type') + ' defaults — ✕ any you don’t want') + '</span><span style="margin-left:auto" data-fcount></span></div>' +
    '<div class="fl" data-fl' + (chosen ? ' style="display:none"' : '') + '>' + st.map(function(f){ return '<div class="fi' + (f.on ? '' : ' off') + '" data-fk="' + esc(f.key) + '" data-on="' + (f.on ? 1 : 0) + '"><span class="t">' + esc(f.label) + (f.def ? '<small>default for this job type</small>' : '') + '</span><button type="button" class="x" aria-label="' + (f.on ? 'Turn off ' : 'Turn on ') + esc(f.label) + '">' + (f.on ? '✕' : '＋') + '</button></div>'; }).join('') +
    (realAdmin() ? '<div style="padding:8px 4px"><button type="button" class="gcep-sm" data-fdef>⚙ Customer features by job type (defaults)</button></div>' : '') + '</div></div>';
}
function wireFeatures(box){
  var f = box.querySelector('[data-feat]'); if (!f) return;
  var count = function(){ var on = f.querySelectorAll('.fi[data-on="1"]').length, all = f.querySelectorAll('.fi').length; var c = f.querySelector('[data-fcount]'); if (c) c.textContent = on + ' of ' + all + ' on'; };
  f.querySelector('[data-fh]').onclick = function(){ var l = f.querySelector('[data-fl]'); l.style.display = l.style.display === 'none' ? '' : 'none'; };
  Array.prototype.forEach.call(f.querySelectorAll('.fi .x'), function(b){ b.onclick = function(ev){ ev.stopPropagation(); var it = b.parentNode, on = it.getAttribute('data-on') !== '1'; it.setAttribute('data-on', on ? 1 : 0); it.classList.toggle('off', !on); b.textContent = on ? '✕' : '＋'; count(); }; });
  var d = f.querySelector('[data-fdef]'); if (d) d.onclick = function(){ openFeatureDefaults(); };
  count();
}
function readFeatures(box){ var o = {}, f = box.querySelector('[data-feat]'); if (!f) return null; Array.prototype.forEach.call(f.querySelectorAll('.fi'), function(it){ o[it.getAttribute('data-fk')] = it.getAttribute('data-on') === '1'; }); return o; }
/* the choice goes on the job: job.features (what was chosen at the send) and patch JA's job.auto (what every send obeys) */
function saveFeatures(p, sel, e){
  if (!p || !sel) return Promise.resolve();
  var JA = W._gcJA, eff = {}; try { eff = JA.effective(p) || {}; } catch (x) {}
  var auto = Object.assign({}, eff); Object.keys(sel).forEach(function(k){ auto[k] = !!sel[k]; });
  var feat = Object.assign({}, sel, { chosenAt: nowIso(), by: meName(), via: 'estimate send', estId: s(e && e.id), group: (function(){ try { return JA.groupOf(p); } catch (x) { return ''; } })() });
  var go = JA && typeof JA.set === 'function' ? Promise.resolve(JA.set(p.id, auto)).catch(warn) : Promise.resolve();
  return go.then(function(){ setProj(p.id, { features: feat, auto: Object.assign({}, auto, { updatedAt: nowIso(), by: meName(), via: 'estimate send' }) }); });
}
function openFeatureDefaults(){
  if (!realAdmin()) { toast('Only an admin can change the defaults for each job type.', true); return; }
  try { if (W._gcJobAutoDefaults && W._gcJobAutoDefaults.open) return W._gcJobAutoDefaults.open(); if (W._gcJA && W._gcJA.openDefaults) return W._gcJA.openDefaults(); } catch (e) { warn(e); }
}

/* ════ 5. 📤 SEND ESTIMATE ══════════════════════════════════════════════════════════════════════════════════ */
function ensureJob(e){
  var p = jobOf(e); if (p) return p;
  var l = leadOf(e), pos = projects().map(function(x){ return x && (x.autoPO || x.po); }).filter(Boolean), po = '';
  try { po = W.nextPO ? W.nextPO(pos) : ''; } catch (x) {} if (!po) po = 'PO-' + Date.now().toString().slice(-6);
  p = { id: 'PRJ' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase(), name: s(e.name) || s(l && l.name) || 'Estimate', client: s(e.client) || s(l && (l.contactName || l.name)),
    address: s(e.address) || s(l && l.address), autoPO: po, status: 'bidding', type: s(e.jobType) || s(l && l.projectType) || 'Construction', contract: 0, estimateId: s(e.id), _lastEstId: s(e.id),
    pm: s(e.pm) || s(l && l.pm), clientEmail: s(e.clientEmail || e.email) || s(l && l.email), clientPhone: s(e.clientPhone) || s(l && l.phone), leadId: l ? l.id : '', fromLeadId: l ? l.id : '',
    customerId: s(l && l.customerId), source: 'grayco', graycoOrigin: true, created: today(), createdAt: nowIso(), createdFrom: 'estimate (📤 Send estimate)', createdBy: meName() };
  addProj(p); setEst(e.id, { pid: p.id, autoPO: e.autoPO || p.autoPO });
  if (l) setLead(l.id, { projectId: p.id, pid: p.id, estimateId: e.id });
  return p;
}
function defaultBody(e, p, v){
  var first = s(v.contact || v.name).split(/\s+/)[0];
  return 'Hi' + (first ? ' ' + first : '') + ',\n\nThank you for the chance to bid ' + s(e.name || (p && p.name) || 'your project') + '. Our estimate is attached as a PDF' + (num(e.totalCharge) ? ' (' + money(e.totalCharge) + ')' : '') + '.\n\nIf you have any questions, reply to this e-mail or call me.\n\nThank you,\n' + meName();
}
/* who it is FROM (the server decides the same way from the job in the cloud — send-email.js estimateFrom) */
function pmOf(p){
  var n = s(p && (p.pm || p.projectManager || p.pmName)); if (!n) return null;
  var u = arr(crm().users).filter(function(x){ return low(x.name) === low(n); })[0];
  return { name: n, email: low((u && u.email) || (p && p.pmEmail)) };
}
function fromLine(p){
  var pm = pmOf(p);
  if (!pm) return 'From <b>' + esc(meName()) + '</b> &lt;' + esc(myEmail()) + '&gt; (no PM on the job) — replies come to you.';
  if (/^[^@\s]+@grayco-cs\.com$/.test(pm.email) && !/^(office|billing|news|portal)@/.test(pm.email)) return 'From the job’s PM <b>' + esc(pm.name) + '</b> &lt;' + esc(pm.email) + '&gt; — replies go to ' + esc(pm.name.split(' ')[0]) + '.';
  return 'From <b>' + esc(pm.name) + ' · GrayCo</b> &lt;office@grayco-cs.com&gt; — <b>' + esc(pm.name) + ' has no @grayco-cs.com e-mail</b>, so it goes from the company address; replies go to ' + esc(pm.email || myEmail()) + '.';
}
/* "PDF design": the estimate is made once; the 5-page proposal or the simple estimate comes from it, or the PDF that was sent
   another way is uploaded. The admin picks the default for each job type (gc_kv gc_estpdf_design). */
function designHtml(p, e){
  var d = designDefault(p, e), g = ''; try { g = W._gcJA ? W._gcJA.groupOf(p || {}) : ''; } catch (x) {}
  var opt = function(v, l){ return '<option value="' + v + '"' + (d === v ? ' selected' : '') + '>' + l + '</option>'; };
  return '<label for="gcep-design">PDF design</label><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="gcep-design" data-design style="flex:1;min-width:220px">' +
    opt('p5', '📘 GrayCo 5-page proposal (cover, scope, estimate, schedule, warranty, contact)') + opt('simple', '📄 Simple estimate') + (isUploadPdf(e) ? opt('uploaded', '📎 The uploaded estimate PDF (as it is)') : '') +
    opt('upload', '📤 Upload the one I sent (text / Google Docs)') + '</select><button type="button" class="gcep-sm" data-dprev>👁 Preview</button>' +
    (realAdmin() && g ? '<button type="button" class="gcep-sm" data-ddef data-g="' + esc(g) + '">⚙ Default for ' + esc(g) + ' jobs</button>' : '') + '</div>';
}
function wireDesign(ov, p, e, toUpload){
  var sel = ov.querySelector('[data-design]'); if (!sel) return;
  sel.onchange = function(){ if (sel.value === 'upload') toUpload(); };
  var pv = ov.querySelector('[data-dprev]'); if (pv) pv.onclick = function(){
    var d = sel.value === 'upload' ? 'simple' : sel.value; pv.disabled = true; pv.textContent = '…';
    makePdf(e, d).then(function(r){ pv.disabled = false; pv.textContent = '👁 Preview'; if (!r || !r.blob) { toast('That PDF could not be made here — try the other design.', true); return; } var u = URL.createObjectURL(r.blob); S.lastPreview = u; W.open(u, '_blank'); });
  };
  var df = ov.querySelector('[data-ddef]'); if (df) df.onclick = function(){
    var g = df.getAttribute('data-g'), v = sel.value; if (!/^(p5|simple)$/.test(v)) { toast('Pick the 5-page proposal or the simple estimate first.', true); return; }
    S.designs = Object.assign({}, S.designs || {}, { [g]: v, updatedAt: nowIso(), by: meName() });
    kvWrite('gc_estpdf_design', S.designs).then(function(ok){ toast(ok ? '⚙ New ' + g + ' jobs now default to: ' + DESIGNS[v] : 'Could not save the default — try again.', !ok); });
  };
}
function quietNow(){ try { return !!(W._gcCQ && W._gcCQ.quiet()); } catch (e) { return false; } }
function pickEstimate(then){
  var me = low(meName()), list = estAll().filter(function(e){ return e && !e._isDraft && !/^draft_/.test(s(e.id)) && !isMarker(e) && !e.isTemplate && !deadMap()[e.id] && (s(e.name) || s(e.num)); })
    .sort(function(a, b){ var am = low(a.estimator || a.by) === me ? 1 : 0, bm = low(b.estimator || b.by) === me ? 1 : 0; return bm - am || stampOf(b).localeCompare(stampOf(a)); }).slice(0, 80);
  var ov = overlay('gc-estpdf-pick', '<h3>📤 Send estimate</h3><div class="sub">Pick the estimate. It goes from your own address, the PDF is kept in the CRM.</div><input type="text" data-q placeholder="Search name, customer, PO…" aria-label="Search estimates"><div data-rows></div><div class="row"><button type="button" class="gcep-b" data-x>Cancel</button></div>');
  var draw = function(q){ q = low(q); ov.querySelector('[data-rows]').innerHTML = list.filter(function(e){ var p = jobOf(e); return !q || low([e.name, e.num, e.client, p && p.name, p && p.autoPO].join(' ')).indexOf(q) >= 0; }).map(function(e){ var p = jobOf(e), c = current(e); return '<button type="button" class="gcep-ver" data-id="' + esc(e.id) + '"><b>' + esc(e.name || e.num) + '</b> ' + (num(e.totalCharge) ? money(e.totalCharge) : '') + '<div style="font-size:12px;color:#64748b">' + esc([p ? 'PO ' + s(p.autoPO) + ' · ' + s(p.name) : 'no job yet', c ? verLine(c) : 'Not sent yet'].join(' · ')) + '</div></button>'; }).join('') || '<div class="sub">No estimates.</div>'; };
  draw('');
  ov.querySelector('[data-q]').oninput = function(ev){ draw(ev.target.value); };
  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  ov.querySelector('[data-rows]').onclick = function(ev){ var b = ev.target.closest('[data-id]'); if (!b) return; ov.remove(); then(b.getAttribute('data-id')); };
}
function openSend(estId, opts){
  opts = opts || {};
  if (!estId) { pickEstimate(function(id){ openSend(id, opts); }); return; }
  var e = estById(estId);
  if (!e) { toast('Estimate not found — open it once, then Send.', true); return; }
  if (!/@grayco-cs\.com$/.test(myEmail())) { toast('Sign in with your @grayco-cs.com account to send from the CRM.', true); return; }
  if (!profileOk(e, function(){ openSend(estId, opts); })) return;
  var v = profileOf(e), p = v.p, prof = (S.profile && S.profile[e.id]) || {};
  var to = s(prof.email || v.email), cust = s(prof.name || v.name || v.company);
  var feat = p ? featuresHtml(p) : '<div class="sub" style="margin-top:8px">⚙ Customer features: chosen on the job when it is made at this send.</div>';
  var ov = overlay('gc-estpdf-send', '<h3>📤 Send estimate</h3>' +
    '<div class="sub"><b>' + esc(e.name || e.num || 'Estimate') + '</b>' + (num(e.totalCharge) ? ' · ' + money(e.totalCharge) : '') + (p ? ' · PO ' + esc(p.autoPO) : '') + '<br>' + fromLine(p) +
    (quietNow() ? '<br><b style="color:#92400e">⏰ 7 PM–7 AM: it is saved now and goes to the customer at 7:00 AM.</b>' : '') + '</div>' +
    '<label for="gcep-to">To</label><input id="gcep-to" type="email" inputmode="email" data-to value="' + esc(to) + '">' +
    '<label for="gcep-cc">CC</label><input id="gcep-cc" type="email" inputmode="email" data-cc placeholder="(optional)">' +
    '<label for="gcep-subj">Subject</label><input id="gcep-subj" type="text" data-subj value="' + esc('Your GrayCo estimate — ' + scrub(s(e.name || (p && p.name) || 'your project'), wordsFor(e, p))) + '">' +
    '<label for="gcep-body">Message</label><textarea id="gcep-body" rows="7" data-body>' + esc(defaultBody(e, p, v)) + '</textarea>' +
    '<div class="sub" style="margin-top:12px">📄 The same PDF goes into ' + esc(cust || 'the customer') + '’s portal to accept / e-sign (after the portal approval; 7 PM–7 AM it waits for 7:00 AM).</div>' +
    designHtml(p, e) +
    feat +
    '<div class="sub" style="margin-top:10px">The PDF you pick is made from this estimate (the customer copy), saved in the CRM first and published to the portal; if it cannot be saved, nothing is sent.</div>' +
    '<div class="gcep-msg" data-m aria-live="polite"></div><div class="row"><button type="button" class="gcep-b" data-x>Cancel</button><button type="button" class="gcep-b pri" data-send>📤 Send estimate</button></div>');
  wireFeatures(ov);
  var q = function(sel){ return ov.querySelector(sel); }, msg = function(t, bad){ var m = q('[data-m]'); m.textContent = t; m.className = 'gcep-msg ' + (bad ? 'bad' : 'ok'); };
  q('[data-x]').onclick = function(){ ov.remove(); };
  wireDesign(ov, p, e, function(){ ov.remove(); openUpload(estId, opts); });
  q('[data-send]').onclick = function(){
    var b = q('[data-send]'); b.disabled = true;
    var o = { to: s(q('[data-to]').value), cc: s(q('[data-cc]').value), subject: s(q('[data-subj]').value), body: String(q('[data-body]').value || ''), portal: true, features: readFeatures(ov), design: s(q('[data-design]').value) || 'simple' };
    send(e.id, o, msg).then(function(r){ if (r && r.ok) { later(function(){ ov.remove(); }, 1200); if (typeof opts.after === 'function') opts.after(r); } else b.disabled = false; }, function(err){ b.disabled = false; msg(s(err && err.message) || 'Not sent — try again.', true); });
  };
  return ov;
}
/* the send itself: PDF → stored + confirmed → e-mail (exact bytes) → recorded everywhere. msg(t, bad) shows progress */
function send(estId, o, msg){
  msg = msg || function(){};
  var e = estById(estId); if (!e) return Promise.resolve({ ok: false, error: 'Estimate not found.' });
  if (!/^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i.test(s(o.to).split(/[,;\s]+/)[0] || '')) { msg('Check the "To" address.', true); return Promise.resolve({ ok: false, error: 'to' }); }
  if (!s(o.subject) || !s(o.body)) { msg('Add a subject and a message.', true); return Promise.resolve({ ok: false, error: 'subject' }); }
  if (S.busy) return Promise.resolve({ ok: false, error: 'busy' });
  S.busy = true;
  var p = ensureJob(e), l = leadOf(e, p), file = null, pdfHow = '';
  msg('Making the PDF…');
  return saveFeatures(p, o.features, e).then(function(){ return makePdf(e, o.design); }).then(function(r){
    if (!r || !r.blob) { var er = new Error('The PDF could not be made — not sent. Try again.'); er.block = true; throw er; }
    pdfHow = r.how;
    msg('Saving the PDF in the CRM…');
    var nm = docName(e, { sentAt: nowIso() });
    return storeConfirmed(r.blob, nm).catch(function(err){ warn(err); S.blocked++; var x = new Error(BLOCK); x.block = true; throw x; });
  }).then(function(f){
    file = f;
    msg('Sending from ' + myEmail() + '…');
    var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#14202E;white-space:pre-wrap">' + esc(o.body) + '</div>';
    return call('send-email', { mode: 'estimate', estId: e.id, pid: p ? p.id : '', leadId: l ? l.id : '', to: o.to, cc: o.cc, subject: o.subject, html: html, fromName: meName(), customer: s(p && p.client),
      pdf: { ref: f.ref, sha256: f.sha256, name: f.name } });
  }).then(function(j){
    if (!j || !j.ok) { var er = new Error(j && j.blocked ? BLOCK : ('Not sent: ' + s(j && j.error || 'try again'))); er.block = !!(j && j.blocked); throw er; }
    if (j.paused) { var ep = new Error('Data-entry mode is on — nothing goes to customers, so it was not sent.'); throw ep; }
    var rec = j.sent || {}, ver = +rec.version || ((versions(e).slice(-1)[0] || {}).version || 0) + 1, at = nowIso();
    var row = { id: s(rec.id) || uid('es_'), ref: file.ref, sha256: file.sha256, size: file.size, version: ver, status: j.held ? 'held' : 'sent', sentAt: j.held ? '' : at, heldAt: j.held ? at : '', releaseAt: s(j.releaseAt),
      sentTo: s(o.to), cc: s(o.cc), sentBy: meName(), sentByEmail: myEmail(), from: s(j.from), via: 'crm-email', method: 'crm-email', name: file.name, how: pdfHow, design: s(o.design) || 'simple' };
    S.sends++; note('sent ' + s(e.name) + ' v' + ver + (j.held ? ' (held)' : ''));
    return afterSent(e, p, l, row, o, '📤 Estimate "' + s(e.name) + '" e-mailed from the CRM to ' + s(o.to) + ' (PDF v' + ver + (j.held ? ', goes out 7:00 AM' : '') + ')').then(function(pr){
      msg(j.held ? '⏰ Saved in the CRM — it goes to ' + s(o.to) + ' at 7:00 AM (v' + ver + ').' : '✅ Sent to ' + s(o.to) + ' — PDF v' + ver + ' is in the CRM.' + (pr && pr.ok ? ' Waiting for the portal approval.' : ''));
      toast(j.held ? '⏰ Estimate saved — goes out 7:00 AM (customer quiet hours).' : '📤 Estimate sent — the PDF is on the job.');
      S.busy = false;
      return { ok: true, version: ver, held: !!j.held, ref: file.ref, sha256: file.sha256, docId: docId, portal: pr };
    });
  }).catch(function(err){
    S.busy = false; S.errors = s(err && err.message);
    msg(s(err && err.message) || BLOCK, true);
    if (err && err.block) toast(BLOCK, true);
    return { ok: false, error: s(err && err.message), blocked: !!(err && err.block) };
  });
}
/* both paths, once the PDF is in the CRM and went to the customer: the estimate (Sent, its versions), the job's Files &
   Docs, the lead (stage + activity), the job's proposalSentAt (the estimate follow-ups of portal-sign.js start from it),
   and the customer portal (the same file) */
function afterSent(e, p, l, row, o, line){
  var at = nowIso(), when = s(row.sentAt || row.releaseAt || at);
  S.sent = S.sent.filter(function(x){ return s(x.id) !== row.id; }).concat([Object.assign({ estId: e.id, pid: p ? p.id : '' }, row)]);
  setEst(e.id, function(x){ var lst = arr(x.sentPdfs).filter(function(y){ return s(y.id) !== row.id && y.sha256 !== row.sha256; }).concat([row]); return { sentPdfs: lst, sentPdf: summary(row), status: /^(won|signed|accepted|approved)/i.test(s(x.status)) ? x.status : 'Sent', sentDate: when.slice(0, 10), sentTo: s(row.sentTo) || x.sentTo, sentMethod: s(row.method || row.via), portalShare: true }; });
  var docId = p ? fileDoc(e, p, row, true) : '';
  if (p) setProj(p.id, function(x){ return { proposalSentAt: when, estimateSentAt: when, estimateSentVia: s(row.method || row.via), estimateId: x.estimateId || e.id, _lastEstId: e.id }; });
  if (l) setLead(l.id, function(x){ var st = /^(new lead|new|lead|contacted|site visit|)$/i.test(s(x.stage)) ? 'Estimate Sent' : x.stage; return { stage: st, estimateSentAt: when, activity: arr(x.activity).concat([{ at: at, by: meName(), type: 'estimate', text: line }]).slice(-200) }; });
  return p ? portalPublish(e, p, row, docId).catch(function(){ return null; }) : Promise.resolve(null);
}
/* the same file into the customer portal: the estimate + its document are portal papers; the "Put in the customer portal"
   approval (PORTALGATE) decides when it shows, and the portal's e-sign paper points at the same file (no second e-mail) */
function portalPublish(e, p, row, docId){
  var title = 'Estimate' + (s(e.num) ? ' #' + s(e.num) : '') + ' — ' + scrub(s(e.name || p.name), wordsFor(e, p));
  return call('portal-sign', { action: 'request', projectId: String(p.id), kind: 'estimate', refId: s(e.id), title: title.slice(0, 120), amount: num(e.totalCharge) || null, lines: [], docRef: row.ref, docName: row.name, mailed: true, again: true,
      sentAt: s(row.sentAt || row.releaseAt) || nowIso(), sentVia: s(row.method || row.via) })
    .then(function(j){ return call('portal', { action: 'gate', op: 'scan', projectId: String(p.id) }).then(function(){ return j; }, function(){ return j; }); });
}

/* ════ 5b. 📎 UPLOAD THE ESTIMATE I SENT (by text / Google Docs) — an accepted path, the same as a CRM send ═══════ */
var METHODS = [['text', '💬 Text message'], ['gdocs', '📝 Google Docs'], ['email', '✉️ E-mail from another program'], ['other', 'Other']];
function profileOk(e, again){
  var gaps = profileGaps(e);
  if (S.profile && S.profile[e.id]) gaps = gaps.filter(function(k){ return !s(S.profile[e.id][k === 'billing' ? 'billingAddress' : k]) && !(k === 'billing' && S.profile[e.id].billingSameAsJob) && !(k === 'prefer' && S.profile[e.id].preferredContact); });
  if (gaps.length) { profileSheet(e, gaps, again); return false; }
  return true;
}
function openUpload(estId, opts){
  opts = opts || {};
  if (!estId) { pickEstimate(function(id){ openUpload(id, opts); }); return; }
  var e = estById(estId); if (!e) { toast('Estimate not found.', true); return; }
  if (!profileOk(e, function(){ openUpload(estId, opts); })) return;
  var v = profileOf(e), p = v.p;
  var ov = overlay('gc-estpdf-upl', '<h3>📎 Upload the estimate I sent</h3><div class="sub"><b>' + esc(e.name || 'Estimate') + '</b> — the exact PDF you sent goes on the job and into ' + esc(v.name || 'the customer') + '’s portal, and the estimate is marked Sent (follow-ups start like a CRM send).</div>' +
    '<label for="gcep-u-m">How did you send it?</label><select id="gcep-u-m" data-m2>' + METHODS.map(function(m){ return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select>' +
    '<div data-gd style="display:none"><label for="gcep-u-g">Google Doc link (kept with it)</label><input id="gcep-u-g" type="text" inputmode="url" data-gdoc placeholder="https://docs.google.com/…"><div class="sub">Google Docs: File → Download → PDF, then pick that PDF below (the PDF is required).</div></div>' +
    '<label for="gcep-u-to">Sent to (phone or e-mail)</label><input id="gcep-u-to" type="text" data-sto value="' + esc(v.phone || v.email) + '">' +
    '<label for="gcep-u-d">Date sent</label><input id="gcep-u-d" type="date" data-day value="' + today() + '">' +
    '<label for="gcep-u-f">The PDF you sent</label><input id="gcep-u-f" type="file" accept="application/pdf,.pdf" data-file style="font-size:15px">' +
    (p ? featuresHtml(p) : '') +
    '<div class="gcep-msg" data-m aria-live="polite"></div><div class="row"><button type="button" class="gcep-b" data-x>Cancel</button><button type="button" class="gcep-b pri" data-go>📎 Save — it was sent</button></div>');
  wireFeatures(ov);
  var q = function(sel){ return ov.querySelector(sel); }, msg = function(t, bad){ var m = q('[data-m]'); m.textContent = t; m.className = 'gcep-msg ' + (bad ? 'bad' : 'ok'); };
  q('[data-m2]').onchange = function(){ q('[data-gd]').style.display = q('[data-m2]').value === 'gdocs' ? '' : 'none'; };
  q('[data-x]').onclick = function(){ ov.remove(); };
  q('[data-go]').onclick = function(){
    var f = q('[data-file]').files && q('[data-file]').files[0];
    if (!f) { msg('Pick the PDF you sent (for a Google Doc: download it as PDF first).', true); return; }
    var b = q('[data-go]'); b.disabled = true;
    uploadSent(estId, { file: f, method: q('[data-m2]').value, gdocUrl: s(q('[data-gdoc]').value), sentTo: s(q('[data-sto]').value), day: s(q('[data-day]').value), features: readFeatures(ov) }, msg)
      .then(function(r){ if (r && r.ok) { later(function(){ ov.remove(); }, 1000); if (typeof opts.after === 'function') opts.after(r); } else b.disabled = false; });
  };
  return ov;
}
function uploadSent(estId, o, msg){
  msg = msg || function(){};
  var e = estById(estId); if (!e) return Promise.resolve({ ok: false });
  var p = ensureJob(e), l = leadOf(e, p), file = null;
  var when = /^\d{4}-\d{2}-\d{2}$/.test(s(o.day)) ? (s(o.day) === today() ? nowIso() : s(o.day) + 'T12:00:00.000Z') : nowIso();
  msg('Saving the PDF in the CRM…');
  return saveFeatures(p, o.features, e).then(function(){
    if (!(o.file instanceof Blob)) throw new Error('no file');
    return storeConfirmed(o.file, docName(e, { sentAt: when }));
  }).catch(function(err){ warn(err); S.blocked++; var x = new Error(/not a PDF/.test(s(err && err.message)) ? 'That file is not a PDF — pick the PDF you sent.' : BLOCK); x.block = true; throw x; }).then(function(f){
    file = f;
    return call('send-email', { mode: 'estimate-record', estId: e.id, pid: p.id, leadId: l ? l.id : '', method: o.method, sentAt: when, sentTo: o.sentTo, gdocUrl: o.gdocUrl, pdf: { ref: f.ref, sha256: f.sha256, name: f.name } });
  }).then(function(j){
    if (!j || !j.ok) { var er = new Error(j && j.blocked ? BLOCK : 'Not saved: ' + s(j && j.error || 'try again')); er.block = !!(j && j.blocked); throw er; }
    var rec = j.sent || {}, ver = +rec.version || ((versions(e).slice(-1)[0] || {}).version || 0) + 1;
    var row = { id: s(rec.id) || uid('es_'), ref: file.ref, sha256: file.sha256, size: file.size, version: ver, status: 'sent', sentAt: when, sentTo: s(o.sentTo), sentBy: meName(), sentByEmail: myEmail(),
      via: 'upload', method: s(o.method) || 'other', gdocUrl: s(o.gdocUrl), name: file.name };
    var how = ({ text: 'text', gdocs: 'Google Docs', email: 'e-mail' })[row.method] || 'hand';
    S.sends++; note('uploaded as sent ' + s(e.name) + ' v' + ver + ' (' + row.method + ')');
    return afterSent(e, p, l, row, {}, '📎 Estimate "' + s(e.name) + '" sent by ' + how + (row.sentTo ? ' to ' + row.sentTo : '') + ' — PDF v' + ver + ' uploaded by ' + meName()).then(function(){
      msg('✅ Saved — PDF v' + ver + ' is on the job and goes to the portal (after its approval).'); toast('📎 Estimate marked Sent (' + how + ') — the PDF is on the job.');
      return { ok: true, version: ver, ref: file.ref, sha256: file.sha256 };
    });
  }).catch(function(err){ S.errors = s(err && err.message); msg(s(err && err.message) || BLOCK, true); if (err && err.block) toast(BLOCK, true); return { ok: false, error: s(err && err.message), blocked: !!(err && err.block) }; });
}

/* ════ 6. THE CARD, THE VIEWER ══════════════════════════════════════════════════════════════════════════════ */
function draftsFor(e){
  /* an autosave copy of THIS estimate the builder kept (draft_…, same name, real work, newer) — never a second estimate */
  var n = norm(e && e.name); if (!n) return [];
  return estAll().filter(function(d){ return d && /^draft_/.test(s(d.id)) && !isMarker(d) && !deadMap()[d.id] && !s(d.pid) && norm(d.name) === n && (arr(d.lines).length || arr(d.mats).length) && stampOf(d) > stampOf(e); });
}
function paintSlot(el, estId, pid){
  try {
    var e = estById(estId) || { id: estId }, v = versions(e), c = v[v.length - 1], h = '';
    if (c) {
      var seen = arr(S.views).filter(function(x){ return s(x.estId) === s(e.id) && s(x.at) >= s(c.sentAt || c.heldAt); }).map(function(x){ return s(x.at); }).sort()[0];
      h += '<button type="button" class="gcep-pdf" data-ep="pdf">📄 Sent PDF</button><span class="m" data-ep-line>' + esc(verLine(c)) + (seen ? ' · 👁 Viewed in the portal ' + esc(fmtDay(seen)) : '') + '</span>';
      if (v.length > 1) h += '<button type="button" class="gcep-sm" data-ep="all">All versions (' + v.length + ')</button>';
    } else if (wasSent(e)) {
      h += '<span class="w">Sent before PDF saving started — no copy on file</span><button type="button" class="gcep-sm" data-ep="attach">📎 Attach the sent PDF</button>';
    } else {
      h += '<span class="gcep-ns">Not sent yet</span><button type="button" class="gcep-sm" data-ep="send">📤 Send estimate</button><button type="button" class="gcep-sm" data-ep="upsent">📎 Upload the estimate I sent</button>';
      if (isUploadPdf(e)) h += '<button type="button" class="gcep-sm" data-ep="upl">📄 Uploaded PDF</button>';
    }
    h += '<button type="button" class="gcep-sm" data-ep="p5">📘 Make proposal</button><button type="button" class="gcep-sm" data-ep="edit">✏ Open estimate</button>';
    var dr = draftsFor(e)[0];
    if (dr) h += '<div class="w" style="flex-basis:100%">✎ Unsaved changes from ' + esc(fmtDay(stampOf(dr))) + ' — <button type="button" class="gcep-sm" data-ep="dopen" data-d="' + esc(dr.id) + '">Open</button> <button type="button" class="gcep-sm" data-ep="ddisc" data-d="' + esc(dr.id) + '">Discard</button></div>';
    if (el.__h === h) return; el.__h = h;
    sheetCss();
    el.className = 'gcep-slot'; el.innerHTML = h;
    el.onclick = function(ev){
      var b = ev.target.closest('[data-ep]'); ev.stopPropagation(); if (!b) return;
      var a = b.getAttribute('data-ep');
      if (a === 'pdf') view(estId); else if (a === 'all') versionsList(estId); else if (a === 'attach') attach(estId, { backfill: true }); else if (a === 'send') openSend(estId); else if (a === 'upsent') openUpload(estId); else if (a === 'p5') makeProposal(estId, pid);
      else if (a === 'edit') openEditor(estId, pid); else if (a === 'upl') { var x = estById(estId); if (x && W._gcFileUrl) W._gcFileUrl(x.sourceRef).then(function(u){ W.open(u, '_blank'); }); }
      else if (a === 'dopen') openEditor(b.getAttribute('data-d'), pid); else if (a === 'ddisc') discardDraft(b.getAttribute('data-d'), estId);
    };
  } catch (x) { warn(x); }
}
/* "📘 Make proposal": the CRM's own 5-page Customer Proposal Generator, for this job and THIS estimate */
function makeProposal(estId, pid){
  var e = estById(estId), p = proj(pid) || jobOf(e);
  if (!p) { toast('Link the estimate to a job first.', true); return null; }
  if (!W._gcProposal5 || typeof W._gcProposal5.open !== 'function') { toast('Open the Projects screen once, then try again.', true); return null; }
  try { return W._gcProposal5.open(p, e); } catch (x) { warn(x); return null; }
}
function openEditor(id, pid){ try { if (W._gcJumpToEstimates) return W._gcJumpToEstimates(pid || '', id); if (W._gcEST3 && W._gcEST3.open) return W._gcEST3.open(id); } catch (e) { warn(e); } }
function discardDraft(did, estId){
  if (!confirm('Discard the unsaved changes? The saved estimate stays as it is.')) return;
  setEst(did, { _supersededBy: s(estId), lines: [], mats: [], labor: [], discardedAt: nowIso(), discardedBy: meName() });
  try { if (W._gcTombstone) W._gcTombstone('estimates', did); } catch (e) {}
  toast('Unsaved changes discarded.');
}
/* the title / the card: the sent PDF when there is one, else the editor (as before) */
function openCard(estId, pid){ var e = estById(estId); if (e && current(e)) return view(estId); return openEditor(estId, pid); }
function view(estId, verId){
  var e = estById(estId); if (!e) return null;
  var v = versions(e), c = verId ? v.filter(function(x){ return s(x.id) === s(verId); })[0] : v[v.length - 1];
  if (!c) { toast('Not sent yet — no PDF has gone to the customer.'); return null; }
  sheetCss();
  var old = D.getElementById('gc-estpdf-view'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gc-estpdf-view'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483250;background:rgba(6,12,20,.92);display:flex;flex-direction:column;font-family:Inter,Arial,sans-serif';
  ov.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0f2440;color:#fff;flex-wrap:wrap"><button type="button" data-x style="background:#334155;color:#fff;border:none;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer">← Back</button>' +
    '<div style="flex:1;min-width:160px"><div style="font-weight:800;font-size:14px">' + esc(e.name || 'Estimate') + ' — the PDF that was sent</div><div style="font-size:12px;color:#9ab" data-line>' + esc(verLine(c)) + (c.sha256 ? ' · ' + esc(c.sha256.slice(0, 10)) : '') + '</div></div>' +
    (v.length > 1 ? '<button type="button" data-all style="background:#1e3a5f;color:#fff;border:none;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer">All versions (' + v.length + ')</button>' : '') +
    '<a data-tab target="_blank" rel="noopener" style="background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;padding:8px 12px;font-weight:700;font-size:12px">Open in new tab</a></div>' +
    '<div data-load style="color:#cbd5e1;padding:20px;font-size:14px">Opening the PDF…</div><iframe data-fr title="Sent estimate PDF" style="flex:1;width:100%;border:none;background:#fff;display:none"></iframe>';
  D.body.appendChild(ov);
  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  var al = ov.querySelector('[data-all]'); if (al) al.onclick = function(){ versionsList(estId); };
  var get = typeof W._gcFileUrl === 'function' ? W._gcFileUrl(c.ref) : Promise.reject(new Error('no file helper'));
  Promise.resolve(get).then(function(u){ var f = ov.querySelector('[data-fr]'); f.src = u; f.style.display = ''; ov.querySelector('[data-load]').remove(); ov.querySelector('[data-tab]').href = u; ov.setAttribute('data-ready', '1'); },
    function(err){ var l = ov.querySelector('[data-load]'); if (l) l.textContent = 'This PDF is in the CRM’s file storage but cannot be opened right now (' + s(err && err.message || 'offline') + ').'; });
  return ov;
}
function versionsList(estId){
  var e = estById(estId); if (!e) return;
  var v = versions(e).slice().reverse();
  var ov = overlay('gc-estpdf-vers', '<h3>' + esc(e.name || 'Estimate') + ' — every PDF sent</h3><div class="sub">Each send keeps its own file (newest first).</div>' +
    v.map(function(x, i){ return '<button type="button" class="gcep-ver" data-v="' + esc(x.id) + '"><b>v' + x.version + (i === 0 ? ' · current' : ' · superseded') + '</b><div style="font-size:12.5px;color:#475569">' + esc(verLine(x)) + '</div></button>'; }).join('') +
    '<div class="row"><button type="button" class="gcep-b" data-x>Close</button></div>');
  ov.querySelector('[data-x]').onclick = function(){ ov.remove(); };
  Array.prototype.forEach.call(ov.querySelectorAll('[data-v]'), function(b){ b.onclick = function(){ ov.remove(); view(estId, b.getAttribute('data-v')); }; });
}
/* "📎 Attach the sent PDF" — a PDF sent outside the CRM (or before PDF saving started), kept with its date */
function attach(estId, o){
  o = o || {};
  var e = estById(estId); if (!e) return Promise.resolve(null);
  return new Promise(function(res){
    var inp = D.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,.pdf'; inp.style.display = 'none'; inp.setAttribute('data-gc-estpdf-file', '1'); D.body.appendChild(inp);
    inp.onchange = function(){
      var f = inp.files && inp.files[0]; inp.remove(); if (!f) return res(null);
      var when = s(o.date) || (o.ask === false ? today() : (W.prompt('When was it sent? (YYYY-MM-DD)', s(e.sentDate || e.date || today()).slice(0, 10)) || today()));
      toast('📎 Saving the PDF in the CRM…');
      storeConfirmed(f, docName(e, { sentAt: when })).then(function(file){
        var row = { id: 'att_' + file.sha256.slice(0, 16), ref: file.ref, sha256: file.sha256, size: file.size, version: ((versions(e).slice(-1)[0] || {}).version || 0) + 1, status: 'sent', sentAt: /^\d{4}-\d{2}-\d{2}$/.test(when) ? when + 'T12:00:00.000Z' : nowIso(),
          sentTo: s(o.to), sentBy: meName(), via: 'backfill', how: 'the copy attached by ' + meName(), name: file.name, attachedAt: nowIso() };
        setEst(e.id, function(x){ var lst = arr(x.sentPdfs).filter(function(y){ return y.sha256 !== row.sha256; }).concat([row]); return { sentPdfs: lst, sentPdf: summary(row), sentAttached: { by: meName(), byEmail: myEmail(), at: nowIso(), sentAt: row.sentAt }, status: /^(won|signed|accepted|approved)/i.test(s(x.status)) ? x.status : (o.status || 'Sent'), sentDate: row.sentAt.slice(0, 10) }; });
        var p = jobOf(e); if (p) fileDoc(e, p, row, false);
        toast('📎 Saved — the sent PDF is on file.');
        res(row);
      }, function(err){ warn(err); toast(BLOCK, true); res(null); });
    };
    inp.click();
  });
}

/* ════ 7. BACK-FILL (estimates sent before this build) ══════════════════════════════════════════════════════ */
var SENTISH = /^(sent|submitted|estimate sent|approved|accepted|signed|won|final|awarded|contract|lost|declined)/i;
function reqsFor(e){ var ids = idsOf(e); return S.reqs.filter(function(r){ return r && s(r.kind) === 'estimate' && ids[s(r.refId)]; }); }
function wasSent(e){
  if (!e || /^draft_/.test(s(e.id)) || isMarker(e)) return false;
  return SENTISH.test(s(e.status)) || e.winning === true || !!s(e.sentDate) || reqsFor(e).length > 0 || /^(waiting|needs-email|sent)$/.test(s(e.estin && e.estin.state));
}
function within1(a, b){ var x = dayMs(a), y = dayMs(b); return isFinite(x) && isFinite(y) && Math.abs(x - y) <= 36 * 3600e3; }
function backfillOne(e){
  var ids = idsOf(e), out = [], seen = {}, p = jobOf(e);
  var add = function(ref, at, how, to, src){ if (!isPdfRef(ref) || seen[ref]) return; seen[ref] = 1; out.push({ ref: ref, at: s(at), how: how, sentTo: s(to), src: src }); };
  reqsFor(e).forEach(function(r){ add(r.docRef, r.createdAt, 'the portal e-sign paper', '', 'sign request ' + s(r.id)); });
  docs().forEach(function(d){ if (d && d.deleted !== true && (ids[s(d.estimateId)] || ids[s(d.estId)] || ids[s(d.estBuilderId)])) add(d.ref, d.uploadedAt || d.savedAt || d.uploaded, 'a job file with the same estimate id', d.sentTo, 'doc ' + s(d.id)); });
  var n = norm(e.name), when = s(e.sentDate || e.date);
  if (p && n.length >= 4 && when) docs().forEach(function(d){ if (d && d.deleted !== true && s(d.pid) === s(p.id) && !s(d.estimateId) && norm(d.name).indexOf(n) >= 0 && within1(d.uploadedAt || d.uploaded || d.savedAt, when)) add(d.ref, d.uploadedAt || d.uploaded, 'a job PDF with the same name and date', '', 'doc ' + s(d.id)); });
  if (p) S.mail.forEach(function(m){
    if (!m || s(m.pid) !== s(p.id)) return;
    arr(m.attachments).concat((m.attachments || []).filter(function(x){ return typeof x === 'string'; }).map(function(x){ return { name: x }; })).forEach(function(a){
      var an = norm(typeof a === 'string' ? a : a.name || a.filename); if (!an) return;
      var d = docs().filter(function(x){ return x && s(x.pid) === s(p.id) && isPdfRef(x.ref) && norm(x.name) === an; })[0];
      if (d && (n && an.indexOf(n) >= 0) && within1(m.at, d.uploadedAt || d.uploaded)) add(d.ref, m.at, 'the e-mail log (attachment ' + s(d.name) + ')', arr(m.to).join(', ') || s(m.to), 'mail ' + s(m.id));
    });
  });
  out.sort(function(a, b){ return s(a.at).localeCompare(s(b.at)); });
  return out;
}
function backfillPlan(){
  var dead = deadMap(), seenName = {}, rows = [];
  estAll().filter(function(e){ return !dead[e.id] && !e.isTemplate && wasSent(e); }).forEach(function(e){
    if (/-gid[a-z0-9]+/i.test(s(e.id)) && estById(s(e.id).replace(/(-gid[a-z0-9]+)+$/i, ''))) return;   /* a sync copy of one already counted */
    var have = versions(e).length, m = have ? [] : backfillOne(e);
    rows.push({ estId: e.id, name: s(e.name), pid: s(e.pid), status: s(e.status), linked: have ? 'already' : (m.length ? 'linked' : 'none'), matches: m.map(function(x){ return { how: x.how, ref: x.ref, at: x.at, src: x.src }; }) });
  });
  return { rows: rows, linked: rows.filter(function(r){ return r.linked === 'linked'; }).length, already: rows.filter(function(r){ return r.linked === 'already'; }).length, none: rows.filter(function(r){ return r.linked === 'none'; }).length };
}
function loadEvidence(){
  return Promise.all([kvRead('gc_sign_requests'), kvRead('gc_email_log'), idb('gc_sign_requests')]).then(function(v){
    if (Array.isArray(v[0])) S.reqs = arr(v[0]); else if (Array.isArray(v[2])) S.reqs = arr(v[2]);
    if (Array.isArray(v[1])) S.mail = arr(v[1]);
  }, function(){});
}
function backfill(o){
  o = o || {};
  return loadEvidence().then(function(){ return pull(true); }).then(function(){
    var plan = backfillPlan();
    if (o.apply) plan.rows.forEach(function(r){
      if (r.linked !== 'linked') return;
      var e = estById(r.estId); if (!e || versions(e).length) return;
      var rows = r.matches.map(function(mx, i){ var sha = shaOfRef(mx.ref); return { id: 'bf_' + sha.slice(0, 16), ref: mx.ref, sha256: sha, version: i + 1, status: 'sent', sentAt: s(mx.at) || s(e.sentDate || e.date), sentTo: s(mx.sentTo || ''), sentBy: '', via: 'backfill', how: mx.how, src: mx.src, linkedAt: nowIso(), linkedBy: meName() }; });
      setEst(e.id, { sentPdfs: rows, sentPdf: summary(rows[rows.length - 1]), backfillAt: nowIso() });
    });
    if (o.apply) plan.rows.forEach(function(r){ if (r.linked === 'none') { var e = estById(r.estId); if (e && !e.sentPdfMissing) setEst(e.id, { sentPdfMissing: true }); } });
    note('back-fill: ' + plan.linked + ' linked, ' + plan.none + ' no copy on file' + (o.apply ? ' (saved)' : ' (dry run)'));
    return plan;
  });
}

/* ════ 8. THE GATE: no "Estimate Sent" or later stage until the estimate went to the portal ════════════════════ */
var LATER_LEAD = /^(estimate sent|negotiat\w*|won|contract|signed|sold|approved|active)$/i;
var LATER_EST = /^(sent|submitted|won|signed|accepted|approved|awarded|contract)$/i;
var LATER_JOB = /^(approved|active|in.?progress|scheduled|contract|signed|sold|won|on_hold)$/i;
function gateSheet(e, then, why, rec){
  var adm = realAdmin();
  var ov = overlay('gc-estpdf-rule', '<h3>📤 The estimate goes to the portal first</h3><div class="sub">' + esc(why || 'Moving it on') + ': <b>' + esc((e && e.name) || (rec && rec.name) || 'this estimate') + '</b> has not gone to the customer’s portal yet. Send it from the CRM, or upload the PDF you sent by text / Google Docs.</div>' +
    '<div class="row" style="flex-direction:column">' + (e ? '<button type="button" class="gcep-b pri" data-s>📤 Send from the CRM</button><button type="button" class="gcep-b" data-u>📎 Upload the estimate you sent</button>' : '<button type="button" class="gcep-b pri" data-n>✨ Start the estimate</button>') +
    (adm ? '<button type="button" class="gcep-b" data-o>Admin override (with a reason)</button>' : '') + '<button type="button" class="gcep-b" data-x>Cancel</button></div>');
  var done = function(ok, how){ ov.remove(); if (then) then(ok, how); };
  ov.querySelector('[data-x]').onclick = function(){ done(false); };
  var sb = ov.querySelector('[data-s]'); if (sb) sb.onclick = function(){ ov.remove(); openSend(e.id, { after: function(){ if (then) then(true, 'send'); } }); };
  var ub = ov.querySelector('[data-u]'); if (ub) ub.onclick = function(){ ov.remove(); openUpload(e.id, { after: function(){ if (then) then(true, 'upload'); } }); };
  var nb = ov.querySelector('[data-n]'); if (nb) nb.onclick = function(){ ov.remove(); try { if (W._gcField && W._gcField.estimate && rec) W._gcField.estimate({ leadId: rec.id, lead: rec, name: s(rec.name) }); else if (W._gcEST3) W._gcEST3.newEst(); } catch (x) { warn(x); } };
  var ob = ov.querySelector('[data-o]'); if (ob) ob.onclick = function(){
    var why2 = s(W.prompt('Override — why is it moving on without the estimate in the portal? (logged)', ''));
    if (!why2) return;
    var o = { by: meName(), byEmail: myEmail(), at: nowIso(), reason: why2.slice(0, 300), stage: s(why) };
    if (e) setEst(e.id, function(x){ return { sentOverride: o, overrides: arr(x.overrides).concat([o]).slice(-20) }; });
    if (rec && rec._kind === 'lead') setLead(rec.id, function(x){ return { stageOverride: o, activity: arr(x.activity).concat([{ at: o.at, by: o.by, type: 'override', text: '⚠ Admin override (' + o.stage + '): ' + o.reason }]).slice(-200) }; });
    if (rec && rec._kind === 'job') setProj(rec.id, function(x){ return { stageOverride: o, stageOverrides: arr(x.stageOverrides).concat([o]).slice(-20) }; });
    S.overrides = arr(S.overrides).concat([Object.assign({ estId: e ? e.id : '', name: s((e && e.name) || (rec && rec.name)), recId: rec ? rec.id : '', kind: rec ? rec._kind : 'estimate' }, o)]);
    note('override: ' + o.stage + ' — ' + o.reason);
    done(true, 'override');
  };
  return ov;
}
function leadEstimates(l){
  if (!l) return [];
  var pids = {}; [l.projectId, l.pid, l.fromProjectId].forEach(function(x){ if (s(x)) pids[s(x)] = 1; });
  return estAll().filter(function(e){ return e && !isMarker(e) && !/^draft_/.test(s(e.id)) && !deadMap()[e.id] && (s(e.leadId) === s(l.id) || s(e.id) === s(l.estimateId) || pids[s(e.pid)]); });
}
function jobEstimates(p){ return p ? estAll().filter(function(e){ return e && !isMarker(e) && !/^draft_/.test(s(e.id)) && !deadMap()[e.id] && (s(e.pid) === s(p.id) || s(e.id) === s(p.estimateId)); }) : []; }
/* a lead / job moving on: one of its estimates must have gone to the portal; else the gate (then(ok)). → true when gated */
function gateFor(list, rec, why, then){
  if (list.some(inPortal) || list.some(function(e){ return e.sentOverride; })) return false;
  if (rec && (rec.stageOverride || rec.importedHistory === true || rec.historyOnly === true)) return false;
  var go = function(e){ gateSheet(e, then, why, rec); };
  if (list.length === 1) go(list[0]); else if (list.length > 1) pickEstimate(function(id){ go(estById(id)); }); else go(null);
  return true;
}
var OLD = new WeakMap();
D.addEventListener('focusin', function(ev){ var t = ev.target; if (t && t.tagName === 'SELECT') OLD.set(t, t.value); }, true);
D.addEventListener('mousedown', function(ev){ var t = ev.target && ev.target.closest && ev.target.closest('select'); if (t) OLD.set(t, t.value); }, true);
function revert(sel){ var o = OLD.has(sel) ? OLD.get(sel) : null; if (o != null) sel.value = o; return o; }
function replay(t, val){ W.__gcEstPdfBypass = true; try { var setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(t, val); t.dispatchEvent(new Event('change', { bubbles: true })); } finally { W.__gcEstPdfBypass = false; } }
function openJobNow(){ var j = W._gcOpenProject && W._gcOpenProject.id ? W._gcOpenProject : null; if (!j) { try { j = proj(sessionStorage.getItem('grayco_openpid') || ''); } catch (e) {} } return j ? proj(j.id) || j : null; }
function bare(v){ return s(v).replace(/^[^A-Za-z0-9]+/, ''); }
D.addEventListener('change', function(ev){
  var t = ev.target; if (!t || t.tagName !== 'SELECT' || W.__gcEstPdfBypass) return;
  var val = s(t.value), old = OLD.has(t) ? s(OLD.get(t)) : '';
  var opts = Array.prototype.map.call(t.options || [], function(o){ return low(bare(o.value || o.text)); });
  try {
    /* the estimate builder's status */
    if (t.id === 'ej-status') {
      if (!LATER_EST.test(val) || LATER_EST.test(old)) return;
      var st = W._gcEST3 && W._gcEST3.status ? W._gcEST3.status() : null, e = estById(st && st.session && st.session.id);
      if (!e || inPortal(e) || e.sentOverride) return;
      ev.stopImmediatePropagation(); revert(t);
      gateSheet(e, function(ok){ if (ok) replay(t, val); }, 'Status → ' + val);
      return;
    }
    /* a lead's stage → Estimate Sent or later */
    if (t.getAttribute('data-d') === 'stage' || (opts.indexOf('new lead') >= 0 && opts.indexOf('estimate sent') >= 0)) {
      if (!LATER_LEAD.test(bare(val)) || LATER_LEAD.test(bare(old))) return;
      var lid = ''; try { var u = W._gcLeadsHub && W._gcLeadsHub.ui && W._gcLeadsHub.ui(); lid = s(u && u.open); } catch (x) {}
      if (!lid) { var c = t.closest('[data-lead],[data-lid],[data-id]'); lid = c ? s(c.getAttribute('data-lead') || c.getAttribute('data-lid') || c.getAttribute('data-id')) : ''; }
      var l = lead(lid); if (!l) return;
      if (gateFor(leadEstimates(l), Object.assign({ _kind: 'lead' }, l), 'Stage → ' + bare(val), function(ok){ if (ok) replay(t, val); })) { ev.stopImmediatePropagation(); revert(t); }
      return;
    }
    /* a job leaving bidding (→ Approved / Active / Contract …) */
    if (opts.indexOf('bidding') >= 0 && opts.indexOf('active') >= 0 && /^(bidding|estimating)$/i.test(old) && LATER_JOB.test(val)) {
      var p = openJobNow(); if (!p) return;
      if (gateFor(jobEstimates(p), Object.assign({ _kind: 'job' }, p), 'Job → ' + val, function(ok){ if (ok) replay(t, val); })) { ev.stopImmediatePropagation(); revert(t); }
    }
  } catch (x) { warn(x); }
}, true);
/* 🏆 Mark winner: the estimate went to the portal first (or an admin override) */
function wrapWinner(){
  var f = W._gcMarkEstimateWinner; if (typeof f !== 'function' || f.__gcEstPdf) return;
  var w = function(id){
    var e = estById(id), self = this, args = arguments;
    if (!e || W.__gcEstPdfBypass || (W._gcIsWinningEstimate && W._gcIsWinningEstimate(e)) || inPortal(e) || e.sentOverride) return f.apply(self, args);
    return new Promise(function(res){ gateSheet(e, function(ok){ if (!ok) return res(undefined); W.__gcEstPdfBypass = true; Promise.resolve(f.apply(self, args)).then(function(r){ W.__gcEstPdfBypass = false; res(r); }, function(){ W.__gcEstPdfBypass = false; res(undefined); }); }, '🏆 Mark winner'); });
  };
  w.__gcEstPdf = true; W._gcMarkEstimateWinner = w;
}
/* e-sign from the job (patch AUTO5): its paper is this estimate's PDF, stored in the CRM first; no PDF → not asked */
function wrapESign(){
  var f = W._gcESignEstimate; if (typeof f !== 'function' || f.__gcEstPdf) return;
  var w = function(estId, opts){
    var e = estById(estId), self = this, args = arguments;
    if (!e) return f.apply(self, args);
    var have = docs().filter(function(d){ return d && d.deleted !== true && s(d.estimateId) === s(e.id) && isPdfRef(d.ref) && d.sentPdf === true; })[0];
    if (have) return f.apply(self, args);
    return makePdf(e).then(function(r){ if (!r || !r.blob) throw new Error('no pdf'); return storeConfirmed(r.blob, docName(e, { sentAt: nowIso() })); }).then(function(file){
      var p = ensureJob(e), row = { id: 'esg_' + file.sha256.slice(0, 16), ref: file.ref, sha256: file.sha256, size: file.size, version: (versions(e).slice(-1)[0] || {}).version + 1 || 1, status: 'waiting', sentAt: '', via: 'esign', name: file.name };
      fileDoc(e, p, Object.assign({}, row, { sentAt: nowIso(), docName: docName(e, { sentAt: nowIso() }).replace(/ — sent /, ' — for signature ') }), true);
      return f.apply(self, args);
    }).catch(function(err){ warn(err); S.blocked++; return { ok: false, blocked: true, error: BLOCK }; });
  };
  w.__gcEstPdf = true; W._gcESignEstimate = w;
}
/* the old "📄 PDF" buttons (Estimates list, builder): the sent PDF when there is one */
function wrapPdfOpen(){
  var f = W._gcEstPdfOpen; if (typeof f !== 'function' || f.__gcEstPdf) return;
  var w = function(est){ var e = est && estById(est.id) || est; if (e && current(e)) return view(e.id); return f.apply(this, arguments); };
  w.__gcEstPdf = true; W._gcEstPdfOpen = w;
}

/* ════ 9. OUTSIDE SENDS, THE ROLE APPS ══════════════════════════════════════════════════════════════════════ */
/* "Estimates marked sent outside the CRM": the stage changes an admin let through without the estimate in the portal */
function outside(mine){
  var me = low(meName()), out = [];
  estAll().forEach(function(e){ if (e && !deadMap()[e.id]) arr(e.overrides).concat(e.sentOverride && !arr(e.overrides).length ? [e.sentOverride] : []).forEach(function(o){ out.push({ id: e.id, name: s(e.name), by: s(o.by), at: s(o.at), reason: s(o.reason), stage: s(o.stage), pid: s(e.pid), owner: low(e.estimator || e.by) }); }); });
  leads().forEach(function(l){ var o = l && l.stageOverride; if (o) out.push({ id: '', leadId: l.id, name: s(l.name), by: s(o.by), at: s(o.at), reason: s(o.reason), stage: s(o.stage), owner: low(l.estimator || l.pm) }); });
  projects().forEach(function(p){ arr(p && p.stageOverrides).forEach(function(o){ out.push({ id: '', pid: p.id, name: s(p.name), by: s(o.by), at: s(o.at), reason: s(o.reason), stage: s(o.stage), owner: low(p.estimator || p.pm) }); }); });
  var seen = {};
  out = out.filter(function(x){ var k = [x.id, x.leadId, x.pid, x.at].join('|'); if (seen[k]) return false; seen[k] = 1; return true; });
  if (mine) out = out.filter(function(x){ return x.owner === me || low(x.by) === me; });
  return out.sort(function(a, b){ return b.at.localeCompare(a.at); });
}
function raCard(app){
  if (app !== 'est' && app !== 'admin') return '';
  var L = outside(app === 'est'), h = '';
  if (app === 'est') h += '<section class="gc-ra-card" data-card="sendest"><div class="ch"><b>📤 Send estimate</b></div><div class="cb"><div class="gc-ra-item"><div class="t"><b>Estimates go out from the CRM</b><small>Your name, your reply-to; the PDF stays on the job and goes to the portal.</small></div><div class="b"><button type="button" class="gc-ra-sm pri" data-estpdf-act="send">📤 Send estimate</button><button type="button" class="gc-ra-sm" data-estpdf-act="upload">📎 Upload the estimate I sent</button><button type="button" class="gc-ra-sm" data-estpdf-act="newcust">＋ New customer</button></div></div></div></section>';
  h += '<section class="gc-ra-card" data-card="estoutside"><div class="ch"><b>Estimates marked sent outside the CRM (' + L.length + ')</b></div><div class="cb">' +
    (L.length ? L.slice(0, 12).map(function(x){ return '<div class="gc-ra-item"><div class="t"><b>' + esc(x.name) + '</b><small>' + esc([x.stage, 'admin override by ' + x.by, fmtDay(x.at), x.reason ? '“' + x.reason + '”' : ''].filter(Boolean).join(' · ')) + '</small></div></div>'; }).join('') : '<div class="gc-ra-empty">✓ None — every estimate went to the portal from the CRM or by upload.</div>') + '</div></section>';
  return h;
}
D.addEventListener('click', function(ev){
  var b = ev.target && ev.target.closest && ev.target.closest('[data-estpdf-act]'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  var a = b.getAttribute('data-estpdf-act');
  if (a === 'send') openSend(s(b.getAttribute('data-id')) || null); else if (a === 'upload') openUpload(s(b.getAttribute('data-id')) || null); else if (a === 'newcust') newCustomer(); else if (a === 'view') view(b.getAttribute('data-id'));
}, true);

/* "+ New customer" → "Start estimate" in one flow (Field app and desk). Matching: patch CUSTALL's rules — e-mail, phone,
   name + street; never a name alone. A quick job / lead while bidding asks for nothing (only a send needs the profile). */
function newCustomer(){
  var dl = '<datalist id="gcep-addrs2">' + knownAddresses().map(function(a){ return '<option value="' + esc(a) + '">'; }).join('') + '</datalist>';
  var ov = overlay('gc-estpdf-newcust', '<h3>＋ New customer</h3><div class="sub">Name, phone, e-mail and address now — everything else can wait until the estimate is sent.</div>' + dl +
    '<label for="gcep-nc-name">Full name (or company)</label><input id="gcep-nc-name" type="text" autocomplete="name" data-f="name">' +
    '<label for="gcep-nc-phone">Mobile phone</label><input id="gcep-nc-phone" type="tel" inputmode="tel" autocomplete="tel" data-f="phone">' +
    '<label for="gcep-nc-email">E-mail</label><input id="gcep-nc-email" type="email" inputmode="email" autocomplete="email" data-f="email">' +
    '<label for="gcep-nc-addr">Job address</label><input id="gcep-nc-addr" type="text" autocomplete="street-address" list="gcep-addrs2" data-f="address">' +
    '<div class="gcep-msg" data-m></div><div class="row"><button type="button" class="gcep-b" data-x>Cancel</button><button type="button" class="gcep-b pri" data-go>Start estimate ›</button></div>');
  var q = function(sel){ return ov.querySelector(sel); }, msg = function(t, bad){ var m = q('[data-m]'); m.textContent = t; m.className = 'gcep-msg ' + (bad ? 'bad' : 'ok'); };
  q('[data-x]').onclick = function(){ ov.remove(); };
  q('[data-go]').onclick = function(){
    var g = {}; Array.prototype.forEach.call(ov.querySelectorAll('[data-f]'), function(i){ g[i.getAttribute('data-f')] = s(i.value); });
    if (!g.name) { msg('Type the customer’s name.', true); return; }
    var r = makeCustomer(g);
    ov.remove();
    toast(r.matched ? '👤 Linked to ' + s(r.cust.name) + ' (same ' + r.by + ').' : '👤 New customer added: ' + s(r.cust.name));
    later(function(){ try { if (W._gcField && typeof W._gcField.estimate === 'function') W._gcField.estimate({ leadId: r.lead.id, lead: r.lead, name: s(r.cust.name) }); else if (W._gcEST3 && W._gcEST3.newEst) W._gcEST3.newEst(); } catch (x) { warn(x); } }, 80);
  };
  return ov;
}
function makeCustomer(g){
  var CA = W._gcCustAllCore, cs = customers(), at = nowIso();
  var cand = { name: s(g.name), email: CA ? CA.email(g.email) : low(g.email), phone: CA ? CA.phone10(g.phone) : s(g.phone).replace(/\D/g, ''), phoneRaw: s(g.phone), address: s(g.address), kind: 'job', ref: 'field', source: 'Field (new customer)' };
  var m = CA ? CA.match(cs, cand) : null, cust, matched = false, by = '';
  if (m && m.by !== 'name only') {
    matched = true; by = m.by; cust = m.c;
    var f = CA.fill(m.c, cand, at); if (f) { cust = f.c; custSave(function(l){ return l.map(function(x){ return x && s(x.id) === s(m.c.id) ? Object.assign({}, x, f.c) : x; }); }); S.custAdds = arr(S.custAdds).map(function(x){ return s(x.id) === s(m.c.id) ? f.c : x; }); }
  } else {
    cust = CA ? CA.make(cand, at, meName()) : { id: 'CUSA_' + Date.now().toString(36), name: cand.name, email: cand.email, phone: cand.phoneRaw, address: cand.address, created: at.slice(0, 10) };
    if (m && m.by === 'name only' && cs.some(function(x){ return s(x.id) === s(cust.id); })) cust.id = cust.id + '_' + Date.now().toString(36).slice(-4);   /* a name alone never merges */
    cust.by = meName(); cust.source = 'Field (new customer)';
    custSave(function(l){ return l.some(function(x){ return x && s(x.id) === s(cust.id); }) ? l : l.concat([cust]); });
    S.custAdds = arr(S.custAdds).concat([cust]);
  }
  var ld = { id: 'L' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5), name: s(g.name), contactName: s(g.name), phone: s(g.phone), email: low(g.email), address: s(g.address),
    stage: 'New Lead', status: 'new', source: 'Field (new customer)', customerId: s(cust.id), created: today(), createdAt: at, createdBy: meName(), estimator: meName(), updatedAt: at, savedAt: at,
    activity: [{ at: at, by: meName(), type: 'created', text: '＋ New customer → estimate (' + (matched ? 'linked to an existing customer by ' + by : 'new customer') + ')' }] };
  leadsSave(function(l){ return [ld].concat(l); });
  S.leads = [ld].concat(arr(S.leads));
  return { cust: cust, lead: ld, matched: matched, by: by };
}

/* ════ 10. ONE LIST PER JOB (the job's Estimates tab = the Estimates screen) ═══════════════════════════════ */
function jobList(pid, fa){
  /* the Estimates screen's rows for this job; before the CRM's list is in (the first second after a sign-in) the job's own */
  try { if (W._gcEST3 && typeof W._gcEST3.byJob === 'function' && arr(W._gcEST3.list()).length) { var l = W._gcEST3.byJob(pid); if (Array.isArray(l)) return l; } } catch (e) { warn(e); }
  return arr(fa).filter(function(G){ return G && s(G.pid) === s(pid) && !isMarker(G) && !/^draft_/.test(s(G.id)); });
}
W._gcEstJobList = jobList;

/* ── start ── */
function boot(){
  idb('estimates').then(function(v){ if (Array.isArray(v)) S.est = arr(v); });
  idb('projectDocs').then(function(v){ if (Array.isArray(v)) S.docs = arr(v); });
  idb('leads').then(function(v){ if (Array.isArray(v)) S.leads = arr(v); });
  idb('gc_sign_requests').then(function(v){ if (Array.isArray(v) && !S.reqs.length) S.reqs = arr(v); });
}
boot();
SI.call(W, function(){
  wrapWinner(); wrapESign(); wrapPdfOpen();
  if (D.visibilityState === 'visible' && signedIn() && D.querySelector('.gcep-slot')) pull(false);   /* only while an Estimates tab is on screen */
  /* the job's cards repaint on their own render; this keeps the line fresh when a send is recorded meanwhile */
  Array.prototype.forEach.call(D.querySelectorAll('.gcep-slot[data-est]'), function(el){ paintSlot(el, el.getAttribute('data-est'), el.getAttribute('data-pid')); });
}, 4000);
later(function(){ wrapWinner(); wrapESign(); wrapPdfOpen(); if (signedIn()) { loadEvidence(); pull(true); kvRead('gc_estpdf_design').then(function(v){ if (v && typeof v === 'object' && !Array.isArray(v)) S.designs = v; }); } }, 2500);
/* once a day an admin / office computer links what it can find for estimates sent before this build (certain matches only) */
later(function(){
  try { if (!(isAdmin()) || !signedIn()) return; var k = 'gc_estpdf_bf_day', d = today(); if (localStorage.getItem(k) === d) return; localStorage.setItem(k, d); backfill({ apply: true }); } catch (e) {}
}, 45000);

W._gcEstPdf = { makeProposal: makeProposal, proposal5Html: proposal5Html, designDefault: designDefault, openSend: openSend, send: send, openUpload: openUpload, uploadSent: uploadSent, inPortal: inPortal, gateSheet: gateSheet, fromLine: fromLine, versions: versions, current: current, hasSend: hasSend, paintSlot: paintSlot, openCard: openCard, view: view, versionsList: versionsList, attach: attach,
  backfill: backfill, backfillPlan: backfillPlan, loadEvidence: loadEvidence, outside: outside, raCard: raCard, profileGaps: profileGaps, profileOf: profileOf, profileSheet: profileSheet,
  features: featureState, featureList: FEATURES, saveFeatures: saveFeatures, openFeatureDefaults: openFeatureDefaults, newCustomer: newCustomer, makeCustomer: makeCustomer,
  jobList: jobList, drafts: draftsFor, customerCopy: customerCopy, proposalHtml: proposalHtml, makePdf: makePdf, storeConfirmed: storeConfirmed, pull: pull, fold: fold, scrub: scrub,
  wasSent: wasSent, status: function(){ return { sent: S.sent.length, reqs: S.reqs.length, mail: S.mail.length, sends: S.sends, blocked: S.blocked, errors: S.errors, log: S.log.slice(-20) }; },
  _S: S, BLOCK: BLOCK };
try { console.log('[GC] 📄 Estimates: the PDF that was SENT on every estimate, 📤 Send estimate from the CRM (patch ESTPDF) — _gcEstPdf.status()'); } catch (e) {}
})();
