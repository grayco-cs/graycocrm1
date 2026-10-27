/* patch FIELDFIX — an estimate gets its job the moment it is made, however it came in (📐 builder save, 📤 upload on a
   lead / job / the Estimates screen, a PDF dropped or attached on a lead or bid, estimates@ e-mail, Google Docs).
   The job: "<customer> — <project / job-site street>", the JOB SITE address (never a P.O. Box billing address, never
   "United States of America"), status bidding, the CRM's next PO, PM and estimator. No second job: the lead's job, a
   job already made for that lead, or an open job for the same customer at the same street is used instead. An
   estimate made from now on that was pointed at a bare QuickBooks customer row ("EAN Holdings", no job site, no scope)
   gets a real job of its own; the customer row is left as it is. */
var FX_BOOT = '2026-10-27';
function fxSite(a){
  var t = s(a).replace(/\s+/g, ' ').replace(/[,\s]*(United States of America|United States|U\.S\.A\.?|USA)\s*$/i, '').trim();
  return /^(p\.?\s*o\.?\s*box|post office box|pob\b)/i.test(t) ? '' : t;
}
function fxBare(p){
  if (!p) return false;
  var n = low(p.name), named = !n || n === low(p.client) || n === low(p.company) || n === low(p.qbClient);
  return named && !fxSite(p.address) && !s(p.scope) && !(num(p.contract) > 0) && !s(p.startDate);
}
function fxJobName(client, estName, site){
  var nm = s(estName).replace(/\s+[—-]\s+final quote$/i, ''), street = s(site).split(',')[0].trim();
  if (nm && low(nm) !== low(client) && !/^estimate$/i.test(nm)) return (!client || low(nm).indexOf(low(client)) >= 0) ? nm : client + ' — ' + nm;
  return client ? client + (street ? ' — ' + street : '') : (street || nm || 'Estimate');
}
function fxStaff(v){
  v = s(v); if (!v) return '';
  var lv = low(v), us = arr(crm().users).filter(function(u){ return u && u.name && u.active !== false; });
  var hit = us.filter(function(u){ return low(u.name) === lv; })[0] || us.filter(function(u){ return low(u.name).split(' ')[0] === lv.split(' ')[0] && lv.split(' ')[0].length > 2; })[0];
  return hit ? s(hit.name) : v;
}
/* the job the estimate already has — or, for a lead / customer that already has one at that address, that job */
function fxExisting(e, l){
  var lj = l ? proj(l.projectId || l.pid || l.convertedTo || l.jobId) : null;
  if (!lj && l) lj = projects().filter(function(x){ return x && !x.deleted && (s(x.leadId) === s(l.id) || s(x.fromLeadId) === s(l.id)); })[0] || null;
  if (lj && !fxBare(lj)) return lj;
  var site = fxSite(s(e.address) || s(l && l.address)), sk = streetKey(site), cl = low(s(e.client) || s(l && (l.contact || l.name || l.company)));
  if (!sk) return null;
  return projects().filter(function(x){ return x && !x.deleted && !/lost|dead|cancel|complete|closed/i.test(s(x.status)) && streetKey(fxSite(x.address)) === sk && (!cl || low(x.client) === cl || low(x.company) === cl || (l && s(x.leadId) === s(l.id))); })[0] || null;
}
function ensureJob(e){
  var p = jobOf(e); if (p) return p;
  var l = leadOf(e), had = fxExisting(e, l); if (had) { fxLeadNote(l, e, had); return had; }
  var list = projects().slice();
  var pos = list.map(function(x){ return x && (x.autoPO || x.po); }).filter(Boolean), po = '';
  try { po = W.nextPO ? W.nextPO(pos) : ''; } catch (x) {} if (!po) po = 'PO-' + Date.now().toString().slice(-6);
  var client = s(e.client) || s(l && (l.contact || l.name || l.company)), site = fxSite(s(e.address) || s(l && l.address));
  p = { id: 'PRJ' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase(), name: fxJobName(client, s(e.name) || s(l && (l.name || l.company)), site), client: client,
    address: site, autoPO: po, status: 'bidding', type: s(e.jobType || e.type) || s(l && l.projectType) || 'Construction', contract: 0, estimateId: s(e.id), _lastEstId: s(e.id),
    pm: s(e.pm) || s(l && l.pm) || s(e.by || e.estimator), estimator: fxStaff(e.estimator || e.by) || s(l && l.estimator), clientEmail: s(e.clientEmail || e.email) || s(l && l.email), clientPhone: s(e.clientPhone || e.phone) || s(l && l.phone),
    leadId: l ? l.id : '', fromLeadId: l ? l.id : '', source: 'grayco', graycoOrigin: true, created: today(), createdAt: nowIso(), createdFrom: 'estimate (' + (s(e.source) || 'estimate') + ')', createdBy: meName() };
  if (!site && s(e.address)) p.billingAddress = s(e.address);
  try { if (W._gcJA && W._gcJA.stamp) W._gcJA.stamp(p, 'estbuilder'); } catch (x) {}
  manual('a bidding job for an estimate');
  try { if (W._crm) W._crm.projects = [p].concat(projects()); } catch (x) {}
  try { if (W._setProjects) W._setProjects(function(prev){ return Array.isArray(prev) ? [p].concat(prev.filter(function(q){ return q && q.id !== p.id; })) : [p]; }); } catch (x) {}
  try { if (W.idbSet) W.idbSet('projects', projects()); } catch (x) {}
  try { if (W._supaUpsert) W._supaUpsert('projects', projects()); } catch (x) {}
  if (l) patchLead(l.id, { projectId: p.id, pid: p.id, stage: /^(new lead|new|lead|contacted|site visit|)$/i.test(s(l.stage)) ? 'Estimate Sent' : l.stage, estimateId: e.id });
  note('Bidding job ' + p.autoPO + ' made for "' + p.name + '"');
  fxLeadNote(l, e, p);
  return p;
}
function fxLinkable(e){
  if (!e || !s(e.id) || e.deleted === true) return false;
  if (e.isTemplate || /^TMP/.test(s(e.id)) || /template/i.test(s(e.status))) return false;
  if (e._isDraft === true || e.supersededBy || e.portalHide === true) return false;
  if (e.recordOnly === true || e.history === true || e.importHistory === true) return false;
  if (startedAt(e) < BOOT) return false;
  if (/lost|declin|dead|void|cancel|archiv/i.test(s(e.status))) return false;
  return !!(s(e.client) || fxSite(e.address) || leadOf(e) || s(e.pid));
}
function fxLeadNote(l, e, p){
  if (!l || !p || !/upload|email|gdoc/i.test(s(e.source))) return;
  var src = /email/i.test(s(e.source)) ? 'the e-mailed ' : (/gdoc/i.test(s(e.source)) ? 'the Google Doc ' : 'the ');
  var txt = '📐 Estimate "' + s(e.name) + '"' + (totalOf(e) ? ' (' + money(totalOf(e)) + ')' : '') + ' was created from ' + src + (s(e.sourceName) ? 'file "' + s(e.sourceName) + '"' : 'PDF') + ' — job ' + s(p.autoPO) + ' "' + s(p.name) + '" linked';
  var h = { type: 'note', at: nowIso(), by: meName() || 'CRM', text: txt, estId: s(e.id) };
  leadsSave(function(list){ return arr(list).map(function(x){ return x && s(x.id) === s(l.id) && !arr(x.activity).some(function(a){ return a && s(a.estId) === s(e.id); }) ? Object.assign({}, x, { activity: arr(x.activity).concat([h]), updatedAt: nowIso() }) : x; }); });
}
/* every new estimate with no job: its job now (no proposal, no wait for the 10 quiet minutes) */
function fxLinkAll(list){
  if (paused() || viewingAs()) return 0;
  var n = 0;
  arr(list).forEach(function(e){
    if (n >= 6 || !fxLinkable(e) || jobOf(e) || !canRun(e) || S.busy[e.id]) return;
    n++;
    try {
      var p = ensureJob(e);
      setEst(e.id, { pid: p.id, autoPO: e.autoPO || p.autoPO, jobLinkedAt: nowIso() });
      if (s(e.sourceRef) && !docs().some(function(d){ return d.id === 'DESRC_' + e.id; })) upsertDoc({ id: 'DESRC_' + e.id, pid: p.id, projectId: p.id, estimateId: e.id, cat: 'Estimates', name: 'Estimate source — ' + (s(e.sourceName) || 'file'), ref: e.sourceRef, type: s(e.sourceType), uploadedAt: nowIso(), uploaded: today(), by: s(e.by) || 'Upload', source: 'estin-source', portalShare: false, noNotice: true, confirmed: true });
    } catch (x) { note('Job for "' + s(e.name) + '" could not be made: ' + s(x && x.message || x)); }
  });
  return n;
}
