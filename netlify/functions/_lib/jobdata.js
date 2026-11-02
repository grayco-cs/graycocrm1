/* ── GrayCo — JOB DATA COMPLETENESS: one checklist per job (patch DATAFULL) ─────────────────────────────────────────
   Owner (11/01): "does admin and office get nightly data check alert, I want office to make sure every job has full data
   in it". Then: "I just want to be able to click all options when I create the job; if I create a job on the fly with
   photos etc while we're bidding, before we have an estimate, don't make me choose all that."

   ONE rule. The nightly check (netlify/functions/_lib/datacheck.js) requires this file, and the CRM page carries the SAME
   text, copied verbatim by tools/patch_DATAFULL.py (window._gcJobData). Plain ES5, no require, no DOM.

   WHAT EACH JOB NEEDS FOLLOWS ITS STAGE (stageOf):
     bidding   (bid / lead / estimating …)    job name + job address + job type (patch DUPJOB, owner 11/02: every job has its type). Nothing else is asked (photos are optional).
     estimate  (an estimate is being sent)     + the customer ready for an estimate — the same list patch ESTPDF checks
               before an estimate goes out: full name, mobile, e-mail, service address, billing address (or "same"),
               preferred contact; insurance jobs also claim number and date of loss.
     won       (signed / approved / sold)      the full checklist: customer linked (customerId), customer phone or
               e-mail, job address, PM, job type, status, contract amount, signed contract or estimate PDF on file, one
               schedule item a person accepted (a draft template item — draft:true — does not count, nor an automatic
               start / finish marker); insurance / mitigation: claim number, date of loss, adjuster contact;
               commercial: GC / contact, the customer's PO, retainage % (or "none").
     active    (in progress / on hold …)       + start date, photos.
     complete  (completed / closed / paid)     + final invoice, completion date, closeout photos.
     skip      lost / dead / cancelled / deleted / test jobs — not checked.
   Leads (the Leads list): who it is assigned to, its source, its next step or due date.

   "N/A for this job": the office marks an item and it stops counting — project.dataNA = { <key>: { by, at } }
   (a lead: lead.dataNA). Score = done ÷ (required − N/A) as 0–100 %.
   STAFF ONLY. It never reads out a value — only which items are missing — and never names an insurance carrier.
   It only reports: nothing here changes, fills or guesses a record.
   ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
(function(root, make){
  var api = make();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root._gcJobData = api;
})(typeof window !== 'undefined' ? window : this, function(){
  'use strict';
  var VERSION = 'DATAFULL-1';
  function s(v){ return v == null ? '' : String(v).trim(); }
  function low(v){ return s(v).toLowerCase(); }
  function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
  function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function has(v){ if (v == null) return false; if (typeof v === 'number') return isFinite(v); if (typeof v === 'boolean') return v; if (Array.isArray(v)) return v.length > 0; if (typeof v === 'object') return Object.keys(v).some(function(k){ return has(v[k]); }); return s(v) !== ''; }
  function any(o, keys){ for (var i = 0; i < keys.length; i++) if (has(o[keys[i]])) return true; return false; }
  function digits(v){ return s(v).replace(/\D/g, ''); }
  function okPhone(v){ var d = digits(v); return d.length === 10 || (d.length === 11 && d[0] === '1'); }
  function okEmail(v){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(v)); }
  function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }

  /* ── stages ── */
  var SKIP = /\b(lost|dead|cancel+ed|cancel|void|declined?|archived?|deleted|not\s*bidding|no\s*bid|duplicate|test)\b/i;
  var DONE = /complet|closed|paid\s*in\s*full|^paid$|warranty|finished|^done$/i;
  var ACTIVE = /active|in.?progress|progress|started|underway|production|on.?hold|hold|punch|substantial|mitigation|drying|demo/i;
  var PRE = /bid|quot|propos|estimat|lead|prospect|pending|draft|inspection|^new\b|appointment|contacted/i;
  var SENT = /propos|quot|sent|presented|delivered|submitted|awaiting|review/i;
  /* an estimate is being sent: the status says so, an estimate for the job was sent, or the CRM has its sent PDF */
  function estimateSent(p, ix){
    var st = low(p.status) + ' ' + low(p.stage);
    if (/estimate sent|proposal sent|quote sent|quoted|presented|proposal/.test(st)) return true;
    var pid = s(p.id), E = (ix && ix.estByPid[pid]) || [];
    for (var i = 0; i < E.length; i++) { var e = E[i]; if (has(e.sentPdf) || has(e.sentPdfs) || has(e.sentAt) || /sent|presented|delivered|signed|accepted|approved|won/i.test(s(e.status))) return true; }
    return !!(ix && ix.sentByPid[pid] && ix.sentByPid[pid].length);
  }
  function signed(p, ix){
    if (p.contractSigned || p.contractSignedAt || s(p.contractUrl) || p.signedAt || (p.autoDocs && p.autoDocs.contract) || s(p.contractFile) || p.contractTypedAt || low(p.jobStage) === 'signed') return true;
    var D = (ix && ix.docsByPid[s(p.id)]) || [];
    for (var i = 0; i < D.length; i++) { var d = D[i], t = s(d.cat || d.category || d.type || d.kind) + ' ' + s(d.name || d.title || d.filename); if (/contract|agreement/i.test(t) && !/unsigned|draft|template/i.test(s(d.name || d.title))) return true; }
    return false;
  }
  function stageOf(p, ix){
    if (!p || !s(p.id) || p.deleted === true || p._deleted || p.tombstoned || p.recordOnly || /^__TEST__/.test(s(p.id))) return 'skip';
    if (ix && ix.dead[s(p.id)]) return 'skip';
    var st = s(p.status || p.stage), js = low(p.jobStage);
    if (SKIP.test(st)) return 'skip';
    if (DONE.test(st) || js === 'complete') return 'complete';
    if (ACTIVE.test(st) || js === 'in_progress' || js === 'substantial' || js === 'inspection') return 'active';
    if (PRE.test(st) || !st) {
      if (signed(p, ix)) return 'won';
      return estimateSent(p, ix) ? 'estimate' : 'bidding';
    }
    return 'won';   /* approved / signed / sold / scheduled / any other status past bidding */
  }
  var RANK = { bidding: 0, estimate: 1, won: 2, active: 3, complete: 4 };
  var STAGE_LABEL = { bidding: 'Bidding', estimate: 'Estimate going out', won: 'Won', active: 'Active', complete: 'Completed', skip: 'Not checked' };

  /* ── kinds: insurance / mitigation, commercial ── */
  function kindOf(p, ix){
    var t = low(p.type) + ' ' + low(p.jobType) + ' ' + low(p.jobTypeLabel) + ' ' + low(p.category);
    var k = { insurance: false, commercial: false };
    if (p.isInsurance === true || p.insurance === true || /insur|claim|water|fire|flood|mitigat|mold|storm|restor|smoke|hail/.test(t) || (ix && ix.claimByPid[s(p.id)])) k.insurance = true;
    if (p.isCommercial === true || /commercial|tenant|\bti\b|government|municipal|industrial|retail|office build/.test(t)) k.commercial = true;
    return k;
  }

  /* ── what counts as "on file" (one place) ── */
  function custOf(p, ix){ var id = s(p.customerId); return id && ix ? (ix.custById[id] || null) : null; }
  function claimOf(p, ix){ return (ix && ix.claimByPid[s(p.id)]) || null; }
  function phoneOrMail(p, ix){
    var c = custOf(p, ix) || {};
    return [p.clientPhone, p.phone, p.customerPhone, p.cell, p.mobile, c.phone, c.cell, c.mobile].some(okPhone) || [p.clientEmail, p.email, p.customerEmail, c.email, c.contactEmail].some(okEmail);
  }
  function paperOnFile(p, ix){
    if (signed(p, ix)) return true;
    var pid = s(p.id);
    if ((ix.sentByPid[pid] || []).length) return true;
    var E = ix.estByPid[pid] || [];
    for (var i = 0; i < E.length; i++) if (has(E[i].sentPdf) || has(E[i].sentPdfs)) return true;
    var D = ix.docsByPid[pid] || [];
    for (var j = 0; j < D.length; j++) { var d = D[j], t = s(d.cat || d.category) + ' ' + s(d.name || d.title || d.filename), mime = s(d.type || d.mime); if (/estimate|proposal/i.test(t) && (/pdf/i.test(mime) || /\.pdf$/i.test(s(d.name)) || /^sb:crm-files\/.*\.pdf$/i.test(s(d.ref)))) return true; }
    return false;
  }
  /* a schedule item a person put on (or accepted): not a draft template item, not the automatic start / finish marker */
  function realSched(e){
    if (!e || e.deleted || e._deleted || e.draft === true || e._autoBookend) return false;
    if (e.acceptedAt || e.acceptedBy || e.confirmedBy || e.confirmedAt) return true;
    return !/^(auto|automations?|system|crm|template)$/i.test(s(e.by || e.createdBy));
  }
  function scheduled(p, ix){ var L = ix.schedByPid[s(p.id)] || []; for (var i = 0; i < L.length; i++) if (realSched(L[i])) return true; return false; }
  function isPhotoDoc(d){ var t = s(d.cat || d.category) + ' ' + s(d.name || d.title), m = s(d.type || d.mime); return /photo|picture|companycam|image/i.test(t) || /^image\//i.test(m) || /\.(jpe?g|png|heic|webp)$/i.test(s(d.name)); }
  function photos(p, ix){
    if (arr(p.photos).length || has(p.ccPhotoCount) || num(p.photoCount) > 0) return true;
    if (s(p.ccamId) || s(p.ccProjectId) || s(p.companyCamUrl) || s(p.ccamUrl)) return true;   /* the job's CompanyCam project (photos live there) */
    var D = ix.docsByPid[s(p.id)] || []; for (var i = 0; i < D.length; i++) if (isPhotoDoc(D[i])) return true;
    return !!ix.photoAi[s(p.id)];
  }
  function closeoutPhotos(p, ix){
    var co = obj(p._closeoutDocs);
    if (has(p.closeoutPhotos) || has(co.photos) || has(p.finalPhotos) || has(p.afterPhotos)) return true;
    var D = ix.docsByPid[s(p.id)] || []; for (var i = 0; i < D.length; i++) { var d = D[i]; if (isPhotoDoc(d) && /closeout|close-out|final|after|complet/i.test(s(d.cat) + ' ' + s(d.name || d.title) + ' ' + s(d.tag))) return true; }
    return false;
  }
  function finalInvoice(p, ix){
    if (p.finalInvoiceId || p.finalInvoiceAt || p.paidInFull === true) return true;
    var L = ix.invByPid[s(p.id)] || [];
    for (var i = 0; i < L.length; i++) { var r = L[i]; if (/^(sub|vendor|supplier|bill|expense)$/i.test(s(r.type))) continue; if (r.isFinal === true || r.final === true || /^final/i.test(s(r.drawType)) || /^final/i.test(s(r.draw)) || /final invoice/i.test(s(r.desc))) return true; }
    return false;
  }
  function completion(p){ return any(p, ['completionDate', 'completedAt', 'completedDate', 'completedOn', 'closedAt', 'finishedAt', 'actualEndDate']) || has(obj(p._closeoutDocs).coc); }
  function claimNo(p, ix){ var c = claimOf(p, ix) || {}; return any(p, ['claimNumber', 'claimNo', 'claim', 'claimNum', 'insClaim']) || has(c.claimNumber); }
  function lossDate(p, ix){ var c = claimOf(p, ix) || {}; return any(p, ['dateOfLoss', 'lossDate', 'dol', 'insDateOfLoss']) || has(c.dateOfLoss); }
  function adjuster(p, ix){
    var c = claimOf(p, ix) || {}, a = obj(p.adjuster), ca = obj(c.adjuster), da = obj(c.deskAdjuster);
    var ok = function(o){ return okPhone(o.phone) || okEmail(o.email) || okPhone(o.cell); };
    return ok(a) || ok(ca) || ok(da) || okPhone(p.adjusterPhone) || okEmail(p.adjusterEmail) || (typeof p.adjuster === 'string' && (okEmail(p.adjuster) || digits(p.adjuster).length >= 10));
  }
  function gcContact(p, ix){ var c = cust(p, ix), g = obj(p.gcInfo), cg = obj(c.gcInfo); return any(p, ['gc', 'gcName', 'gcContact', 'generalContractor', 'gcCompany', 'contactName', 'siteContact', 'company']) || has(g.name) || has(g.contact) || has(cg.name) || has(cg.contact) || has(c.company); }
  function custPo(p){ return any(p, ['customerPO', 'customerPo', 'clientPO', 'clientPo', 'poNumber', 'custPO', 'gcPO']) || (!!s(p.po) && s(p.po) !== s(p.autoPO)); }
  function retainage(p){ return p.retainage != null && s(p.retainage) !== '' || p.retainagePct != null && s(p.retainagePct) !== '' || p.retainageNone === true; }
  /* customer ready for an estimate (patch ESTPDF's list) */
  function cust(p, ix){ return custOf(p, ix) || {}; }
  function fullName(p, ix){ var c = cust(p, ix), n = s(c.name) || s(p.client) || s(p.customer) || s(p.clientName); return /\S+\s+\S+/.test(n.replace(/\b(llc|inc|co)\b\.?/ig, '').trim()) || (!!s(c.company || p.company) && !!s(c.contact || c.name)); }
  function mobile(p, ix){ var c = cust(p, ix); return [c.mobile, c.cell, c.phone, p.clientMobile, p.clientCell, p.clientPhone, p.phone].some(okPhone); }
  function email(p, ix){ var c = cust(p, ix); return [c.email, c.contactEmail, p.clientEmail, p.email, p.customerEmail].some(okEmail); }
  function billing(p, ix){ var c = cust(p, ix); return c.billingSame === true || p.billingSame === true || low(c.billingAddress) === 'same' || low(p.billingAddress) === 'same' || has(c.billingAddress) || has(p.billingAddress); }
  function prefContact(p, ix){ var c = cust(p, ix); return any(c, ['preferredContact', 'prefContact', 'contactPref', 'contactMethod']) || any(p, ['preferredContact', 'prefContact', 'contactPref', 'contactMethod']); }

  /* ── the items ──
     key · label · group · from: the first stage that needs it · only: 'insurance' | 'commercial' | 'estimate' ·
     fix: what "Fix" opens — { field, input } a field on the job, or { open } a part of the job page */
  var ITEMS = [
    { key: 'name', label: 'Job name', group: 'Job', from: 'bidding', test: function(p){ return !!s(p.name); }, fix: { field: 'name', input: 'text' } },
    { key: 'address', label: 'Job address', group: 'Job', from: 'bidding', test: function(p){ return !!s(p.address || p.jobAddress); }, fix: { field: 'address', input: 'text' } },
    { key: 'custName', label: 'Customer full name', group: 'Customer (for the estimate)', from: 'estimate', to: 'estimate', test: fullName, fix: { field: 'client', input: 'text' } },
    { key: 'custMobile', label: 'Customer mobile', group: 'Customer (for the estimate)', from: 'estimate', to: 'estimate', test: mobile, fix: { field: 'clientPhone', input: 'tel' } },
    { key: 'custEmail', label: 'Customer e-mail', group: 'Customer (for the estimate)', from: 'estimate', to: 'estimate', test: email, fix: { field: 'clientEmail', input: 'email' } },
    { key: 'billing', label: 'Billing address (or "same")', group: 'Customer (for the estimate)', from: 'estimate', to: 'estimate', test: billing, fix: { field: 'billingAddress', input: 'billing' } },
    { key: 'prefContact', label: 'Preferred contact', group: 'Customer (for the estimate)', from: 'estimate', to: 'estimate', test: prefContact, fix: { field: 'preferredContact', input: 'pref' } },
    { key: 'customer', label: 'Customer linked', group: 'Customer', from: 'won', test: function(p, ix){ return !!custOf(p, ix) || (!!s(p.customerId) && !ix.haveCustomers); }, fix: { field: 'customerId', input: 'customer' } },
    { key: 'contact', label: 'Customer phone or e-mail', group: 'Customer', from: 'won', test: phoneOrMail, fix: { field: 'clientPhone', input: 'contact' } },
    { key: 'pm', label: 'PM', group: 'Job', from: 'won', test: function(p){ return !!s(p.pm || p.projectManager || p.pmName); }, fix: { field: 'pm', input: 'pm' } },
    { key: 'pmAssign', label: 'PM — an owner assigns it', group: 'Job', from: 'bidding', to: 'estimate', test: function(p){ return !(p.needsPm === true && !s(p.pm || p.projectManager || p.pmName)); }, fix: { field: 'pm', input: 'pm' } },
    { key: 'type', label: 'Job type (pick one)', group: 'Job', from: 'bidding', test: function(p){ var t = s(p.type || p.jobType); return !!t && !/^(residential|commercial|insurance|construction)$/i.test(t); }, fix: { field: 'type', input: 'type' } },
    { key: 'status', label: 'Status', group: 'Job', from: 'won', test: function(p){ return !!s(p.status); }, fix: { field: 'status', input: 'status' } },
    { key: 'contract', label: 'Contract amount', group: 'Money', from: 'won', test: function(p){ return (num(p.contract) || num(p.contractAmt) || num(p.contractAmount) || num(p.contractValue)) > 0; }, fix: { field: 'contract', input: 'money' } },
    { key: 'papers', label: 'Signed contract or estimate PDF', group: 'Papers', from: 'won', test: paperOnFile, fix: { open: 'docs' } },
    { key: 'schedule', label: 'Schedule item someone accepted', group: 'Schedule', from: 'won', test: scheduled, fix: { open: 'schedule' } },
    { key: 'claim', label: 'Claim number', group: 'Insurance (staff only)', from: 'estimate', only: 'insurance', test: claimNo, fix: { field: 'claimNumber', input: 'text' } },
    { key: 'dol', label: 'Date of loss', group: 'Insurance (staff only)', from: 'estimate', only: 'insurance', test: lossDate, fix: { field: 'dateOfLoss', input: 'date' } },
    { key: 'adjuster', label: 'Adjuster contact', group: 'Insurance (staff only)', from: 'won', only: 'insurance', test: adjuster, fix: { field: 'adjuster', input: 'adjuster' } },
    { key: 'gc', label: 'GC / contact', group: 'Commercial', from: 'won', only: 'commercial', test: gcContact, fix: { field: 'gcContact', input: 'text' } },
    { key: 'po', label: "Customer's PO", group: 'Commercial', from: 'won', only: 'commercial', test: custPo, fix: { field: 'customerPO', input: 'text' } },
    { key: 'retainage', label: 'Retainage % (or none)', group: 'Commercial', from: 'won', only: 'commercial', test: retainage, fix: { field: 'retainagePct', input: 'percent' } },
    { key: 'start', label: 'Start date', group: 'Schedule', from: 'active', test: function(p){ return any(p, ['startDate', 'actualStart', 'startedAt', 'start']); }, fix: { field: 'startDate', input: 'date' } },
    { key: 'photos', label: 'Photos', group: 'Photos', from: 'active', test: photos, fix: { open: 'photos' } },
    { key: 'finalInv', label: 'Final invoice', group: 'Closeout', from: 'complete', test: finalInvoice, fix: { open: 'invoices' } },
    { key: 'completion', label: 'Completion date', group: 'Closeout', from: 'complete', test: completion, fix: { field: 'completionDate', input: 'date' } },
    { key: 'closeout', label: 'Closeout photos', group: 'Closeout', from: 'complete', test: closeoutPhotos, fix: { open: 'photos' } }
  ];
  var BY_KEY = {}; ITEMS.forEach(function(it){ BY_KEY[it.key] = it; });
  var LEAD_ITEMS = [
    { key: 'assignee', label: 'Assigned to', test: function(l){ return any(l, ['pm', 'estimator', 'assignee', 'assignedTo', 'assigneeEmail', 'owner']); }, fix: { field: 'pm', input: 'pm' } },
    { key: 'source', label: 'Source', test: function(l){ return any(l, ['source', 'leadSource', 'sources', 'referral']); }, fix: { field: 'source', input: 'text' } },
    { key: 'next', label: 'Next step or due date', test: function(l){ return any(l, ['nextStep', 'nextAction', 'next', 'nextAt', 'followUp', 'followUpAt', 'followUpDate', 'bidDue', 'dueDate', 'due', 'apptAt', 'appointment']); }, fix: { field: 'nextStep', input: 'text' } }
  ];
  var LEAD_CLOSED = /^(won|lost|dead|deleted|converted|declined|not\s*bidding|no\s*bid|pass(ed)?|archived|cancell?ed|closed|dismissed|merged|spam)$/i;

  /* ── the index: every list the rule reads, by job ── */
  function index(data, opts){
    data = data || {}; opts = opts || {};
    var ix = { custById: {}, docsByPid: {}, schedByPid: {}, invByPid: {}, estByPid: {}, sentByPid: {}, claimByPid: {}, photoAi: {}, dead: {}, haveCustomers: false, now: opts.now || Date.now() };
    var push = function(m, k, x){ if (!k) return; (m[k] = m[k] || []).push(x); };
    arr(data.customers).forEach(function(c){ if (c.id && c.deleted !== true && !c._deleted) { ix.custById[s(c.id)] = c; ix.haveCustomers = true; } });
    var seenDoc = {};
    arr(data.projectDocs).concat(arr(data.gc_project_docs), arr(data.docs)).forEach(function(d){ var id = s(d.id); if (id && seenDoc[id]) return; if (id) seenDoc[id] = 1; if (!d.deleted) push(ix.docsByPid, pidOf(d), d); });
    arr(data.schedule).forEach(function(e){ push(ix.schedByPid, pidOf(e), e); });
    var seenInv = {};
    arr(data.invs).concat(arr(data.invoices)).forEach(function(r){ var id = s(r.id); if (id && seenInv[id]) return; if (id) seenInv[id] = 1; push(ix.invByPid, pidOf(r), r); });
    arr(data.estimates).forEach(function(e){ push(ix.estByPid, pidOf(e), e); });
    arr(data.gc_est_sent).forEach(function(e){ if (/sent|held/i.test(s(e.status) || 'sent')) push(ix.sentByPid, pidOf(e), e); });
    arr(data.gc_claims).forEach(function(c){ if (c.deleted !== true) { var k = pidOf(c); if (k && !ix.claimByPid[k]) ix.claimByPid[k] = c; } });
    var ai = obj(obj(data.gc_photo_ai).map); Object.keys(ai).forEach(function(k){ var j = s(ai[k] && ai[k].jobId); if (j) ix.photoAi[j] = 1; });
    (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ ix.dead[s(x)] = 1; });
    return ix;
  }

  /* ── one job ── */
  function naOf(r){ return obj(r && r.dataNA); }
  function applies(it, stage, kind){
    if (RANK[stage] == null || RANK[stage] < RANK[it.from]) return false;
    if (it.to && RANK[stage] > RANK[it.to]) return false;
    if (it.only && !kind[it.only]) return false;
    return true;
  }
  function check(p, ix){
    ix = ix || index({});
    var stage = stageOf(p, ix);
    var out = { pid: s(p && p.id), name: s(p && p.name), po: s(p && (p.autoPO || p.po)), pm: s(p && (p.pm || p.projectManager)), status: s(p && p.status), stage: stage, stageLabel: STAGE_LABEL[stage], kind: { insurance: false, commercial: false }, score: 100, total: 0, done: [], need: [], na: [] };
    if (stage === 'skip') return out;
    var kind = out.kind = kindOf(p, ix), na = naOf(p);
    ITEMS.forEach(function(it){
      if (!applies(it, stage, kind)) return;
      if (it.key !== 'name' && na[it.key]) { out.na.push(it.key); return; }
      out.total++;
      var ok = false; try { ok = !!it.test(p, ix); } catch (e) { ok = false; }
      if (ok) out.done.push(it.key); else out.need.push({ key: it.key, label: it.label, group: it.group, fix: it.fix });
    });
    out.score = out.total ? Math.round(100 * out.done.length / out.total) : 100;
    return out;
  }
  /* customer ready for an estimate (the ESTPDF list), whatever the job's stage */
  function custReady(p, ix){
    ix = ix || index({});
    var kind = kindOf(p, ix), miss = [];
    ['custName', 'custMobile', 'custEmail', 'address', 'billing', 'prefContact'].concat(kind.insurance ? ['claim', 'dol'] : []).forEach(function(k){ var it = BY_KEY[k]; if (!it.test(p, ix)) miss.push({ key: k, label: k === 'address' ? 'Service address' : it.label }); });
    return { ok: !miss.length, missing: miss };
  }
  function leadCheck(l){
    var out = { id: s(l && l.id), name: s(l && (l.name || l.title || l.company || l.client)), score: 100, total: 0, done: [], need: [], na: [], skip: false };
    if (!l || !l.id || l.deleted || l._deleted || l.converted || l.notBidding || l.noBid || l.mergedInto || [l.stage, l.status, l.inboxState].some(function(v){ return LEAD_CLOSED.test(s(v)); })) { out.skip = true; return out; }
    var na = naOf(l);
    LEAD_ITEMS.forEach(function(it){ if (na[it.key]) { out.na.push(it.key); return; } out.total++; if (it.test(l)) out.done.push(it.key); else out.need.push({ key: it.key, label: it.label, group: 'Lead', fix: it.fix }); });
    out.score = out.total ? Math.round(100 * out.done.length / out.total) : 100;
    return out;
  }

  /* ── every job: most missing first ── */
  function checkAll(data, opts){
    opts = opts || {};
    var ix = index(data, opts), jobs = [], leads = [], byItem = {}, byStage = {}, n = 0, complete = 0;
    arr(data.projects).forEach(function(p){
      var r = check(p, ix); if (r.stage === 'skip') return;
      n++; byStage[r.stage] = (byStage[r.stage] || 0) + 1;
      if (!r.need.length) { complete++; return; }
      r.need.forEach(function(m){ byItem[m.key] = (byItem[m.key] || 0) + 1; });
      jobs.push(r);
    });
    jobs.sort(function(a, b){ return b.need.length - a.need.length || a.score - b.score || (RANK[b.stage] - RANK[a.stage]) || (a.name < b.name ? -1 : 1); });
    if (opts.leads !== false) arr(data.leads).forEach(function(l){ var r = leadCheck(l); if (!r.skip && r.need.length) leads.push(r); });
    leads.sort(function(a, b){ return b.need.length - a.need.length; });
    var top = Object.keys(byItem).map(function(k){ return { key: k, label: BY_KEY[k].label, count: byItem[k] }; }).sort(function(a, b){ return b.count - a.count; });
    return { version: VERSION, at: new Date(ix.now).toISOString(), checked: n, complete: complete, needInfo: jobs.length, byStage: byStage, top: top, jobs: jobs, leads: leads };
  }
  /* the job header chip: "Data 80% · 3 missing" (a bidding job with its name and address: "Data: bidding") */
  function chip(r){
    if (!r || r.stage === 'skip') return '';
    if (r.stage === 'bidding' && !r.need.length) return 'Data: bidding';
    return 'Data ' + r.score + '%' + (r.need.length ? ' · ' + r.need.length + ' missing' : ' · complete');
  }

  return { VERSION: VERSION, ITEMS: ITEMS, LEAD_ITEMS: LEAD_ITEMS, BY_KEY: BY_KEY, STAGE_LABEL: STAGE_LABEL, RANK: RANK,
    index: index, stageOf: stageOf, kindOf: kindOf, check: check, custReady: custReady, leadCheck: leadCheck, checkAll: checkAll, chip: chip, realSched: realSched };
});
