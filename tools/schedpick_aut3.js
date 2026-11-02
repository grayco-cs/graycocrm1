/* patch SCHEDPICK — TEMPLATES ARE OFFERED, NEVER APPLIED BY THEMSELVES (owner 11/01: "the templates DON'T APPLY
   AUTOMATICALLY UNLESS I CLICK APPLY TEMPLATES"). What this job can take from its templates (each with its own
   "Apply" on the job's 📋 Templates panel), and the one-time "added automatically — keep / remove" review of what the
   older automations put on a job. window._gcTplOffer = { offers, apply*, makeDoc, autoAdded, review, replan }. */
function spWho(){ try { return s(U.me()) || 'someone'; } catch (e) { return 'someone'; } }
function spIns(p){ return /insurance|claim|fire|water|restoration/i.test(groupText(p)) || p.isInsurance === true; }
function spOffers(pid){
  var p = A.proj(pid); if (!p) return null;
  var tpl = pickTemplate(p), k = permitKind(p), row = permitTable().kinds[k] || { permits: [], inspections: [] }, office = officeFor(p);
  var haveP = {}, haveI = {}; arr(p.permits).forEach(function(x){ haveP[low(x && x.type)] = 1; }); arr(insLoad()[pid]).forEach(function(i){ haveI[low(i && i.label)] = 1; });
  var ds = tpl ? (tpl.draws || DRAW_DEFAULTS[tpl.id] || '') : '', docs = [], ad = p.autoDocs || {};
  if (!s(p.contractUrl) && !p.contractSigned && !ad.contract) docs.push({ kind: 'contract', name: 'Contract (filled in, a draft for review)', note: 'The e-mail to the customer waits on ✅ Approvals.' });
  if (spIns(p) && !ad.work_auth) docs.push({ kind: 'work_auth', name: 'Work authorization (insurance)', note: 'Goes on the job and the customer portal.' });
  return { pid: s(pid), job: s(p.name), template: tpl ? { id: tpl.id, name: tpl.name, tasks: arr(tpl.tasks).length } : null,
    permits: { kind: k, office: office ? office.name : '', permits: arr(row.permits).filter(function(t){ return !haveP[low(t)]; }), inspections: arr(row.inspections).filter(function(l){ return !haveI[low(l)]; }) },
    draws: !s(p.drawSchedule) && ds ? { value: ds, from: tpl ? tpl.name : '' } : null, docs: docs };
}
function spApplyPermits(pid, pick){
  var p = A.proj(pid); if (!p) return Promise.resolve(false);
  pick = pick || {}; var who = spWho(), office = officeFor(p), kind = permitKind(p);
  var want = arr(pick.permits).map(s).filter(Boolean), wantI = arr(pick.inspections).map(s).filter(Boolean);
  if (!want.length && !wantI.length) return Promise.resolve(false);
  return Promise.resolve(want.length ? A.saveProject(pid, function(q){
    var have = {}; arr(q.permits).forEach(function(x){ have[low(x && x.type)] = 1; });
    var add = want.filter(function(t){ return !have[low(t)]; }).map(function(t){ return { id: 'PERM_P_' + pid + '_' + slug(t), type: t, number: '', issued: '', expires: '', status: 'Needed', office: office ? office.name : '', officeUrl: office ? office.url : '', by: who, fromTemplate: kind, addedAt: nowIso() }; });
    if (!add.length) return false;
    q.permits = arr(q.permits).concat(add);
    A.jobNote(q, who + ' applied the permit checklist (' + kind + '): ' + add.map(function(x){ return x.type; }).join(', ') + (office ? ' — ' + office.name : ''));
  }) : null).then(function(){
    if (wantI.length) {
      var data = insLoad(), list = arr(data[pid]).slice(), haveI = {};
      list.forEach(function(i){ haveI[low(i && i.label)] = 1; });
      var addI = wantI.filter(function(l){ return !haveI[low(l)]; }).map(function(l){ return { id: 'INS_P_' + pid + '_' + slug(l), label: l, date: '', done: false, by: who, fromTemplate: kind }; });
      if (addI.length) { data[pid] = list.concat(addI); insSave(data); }
    }
    A.emit('gc:permits-applied', { pid: pid, permits: want.length, inspections: wantI.length, by: who });
    return true;
  });
}
function spApplyDraws(pid){
  var o = spOffers(pid); if (!o || !o.draws) return Promise.resolve(false);
  var who = spWho();
  return A.saveProject(pid, function(q){ if (s(q.drawSchedule)) return false; q.drawSchedule = o.draws.value; q.drawScheduleBy = who + ' (the “' + o.draws.from + '” default)'; A.jobNote(q, who + ' set the draw schedule to ' + o.draws.value + ' (the “' + o.draws.from + '” default).'); });
}
function spMakeDoc(pid, kind){
  var p = A.proj(pid); if (!p) return Promise.resolve(null);
  var who = spWho();
  if (kind === 'contract') return hdoc(p, 'contract', { id: 'aut_contract_' + pid, portal: false }).then(function(rec){
    if (!rec) return null;
    A.saveProject(pid, function(q){ q.autoDocs = Object.assign({}, q.autoDocs || {}, { contract: { id: rec.id, at: nowIso(), by: who } }); A.jobNote(q, who + ' made the contract from the template (internal until the e-mail is approved and sent).'); });
    A.queue({ kind: 'contract', projectId: pid, title: '✍️ Contract — ' + s(p.name), subject: 'Your GrayCo contract — ' + s(p.name), html: contractHtml(p) });
    return rec;
  });
  if (kind === 'work_auth') return hdoc(p, 'work_auth', { id: 'aut_workauth_' + pid }).then(function(rec){
    if (rec) A.saveProject(pid, function(q){ q.autoDocs = Object.assign({}, q.autoDocs || {}, { work_auth: { id: rec.id, at: nowIso(), by: who } }); A.jobNote(q, who + ' made the work authorization from the template.'); });
    return rec;
  });
  return Promise.resolve(null);
}
/* ── what the older automations added by themselves (one-time review on the job) ── */
function spUntouchedPermit(x){ return x && /^PERM_T_/.test(s(x.id)) && /^automations$/i.test(s(x.by)) && /^needed$/i.test(s(x.status || 'Needed')) && !s(x.number) && !s(x.issued); }
function spUntouchedIns(i){ return i && /^INS_T_/.test(s(i.id)) && /^automations$/i.test(s(i.by)) && !i.done && !s(i.date); }
function spUntouchedPunch(x){ return x && /^PUN_T_/.test(s(x.id)) && /^automations$/i.test(s(x.by)) && !/done|complete|closed|fixed/i.test(s(x.status)) && !s(x.note || x.notes) && !arr(x.photos).length; }
function spPunchNow(){ return Promise.resolve(W.idbGet ? W.idbGet('punch') : null).then(function(v){ return Array.isArray(v) ? v : arr(crm().punch); }, function(){ return arr(crm().punch); }); }
function spAutoAdded(pid){
  var p = A.proj(pid); if (!p) return Promise.resolve([]);
  if (p.autoReview && p.autoReview.done) return Promise.resolve([]);
  var out = [], ad = p.autoDocs || {};
  arr(p.permits).forEach(function(x){ if (spUntouchedPermit(x)) out.push({ key: 'permit:' + x.id, kind: 'Permit', label: s(x.type) }); });
  arr(insLoad()[pid]).forEach(function(i){ if (spUntouchedIns(i)) out.push({ key: 'insp:' + i.id, kind: 'Inspection', label: s(i.label) }); });
  if (/^template\b/i.test(s(p.drawScheduleBy)) && s(p.drawSchedule)) out.push({ key: 'draws', kind: 'Draw schedule', label: s(p.drawSchedule) + ' (' + s(p.drawScheduleBy) + ')' });
  if (ad.contract && !ad.contract.by && !p.contractSigned) out.push({ key: 'doc:contract', kind: 'Document', label: 'Contract draft (made at kickoff)', id: s(ad.contract.id) });
  if (ad.work_auth && !ad.work_auth.by) out.push({ key: 'doc:work_auth', kind: 'Document', label: 'Work authorization (made at kickoff)', id: s(ad.work_auth.id) });
  return spPunchNow().then(function(list){
    list.forEach(function(x){ if (x && String(x.pid) === String(pid) && spUntouchedPunch(x)) out.push({ key: 'punch:' + x.id, kind: 'Punch item', label: s(x.item) }); });
    return out;
  });
}
function spDropDoc(id){
  if (!id) return Promise.resolve();
  try { if (W._gcTombstone) W._gcTombstone('projectDocs', id); } catch (e) {}
  try { if (W._setProjectDocs) W._setProjectDocs(function(prev){ return Array.isArray(prev) ? prev.filter(function(d){ return !(d && d.id === id); }) : prev; }); } catch (e) {}
  return Promise.resolve(W.idbGet ? W.idbGet('projectDocs') : null).then(function(all){
    if (!Array.isArray(all) || !all.some(function(d){ return d && d.id === id; })) return;
    var next = all.filter(function(d){ return !(d && d.id === id); });
    try { W.idbSet('projectDocs', next); } catch (e) {}
    try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {}
  }, function(){});
}
/* keys: what the person chose to REMOVE; everything else listed is kept. Either way the review is done for the job. */
function spReview(pid, keys){
  keys = arr(keys); var who = spWho(), rm = {}; keys.forEach(function(k){ rm[k] = 1; });
  return spAutoAdded(pid).then(function(items){
    var gone = items.filter(function(x){ return rm[x.key]; }), kept = items.filter(function(x){ return !rm[x.key]; });
    var permIds = {}, insIds = {}, punIds = {}, docs = [];
    gone.forEach(function(x){ var k = x.key.split(':'); if (k[0] === 'permit') permIds[k.slice(1).join(':')] = 1; else if (k[0] === 'insp') insIds[k.slice(1).join(':')] = 1; else if (k[0] === 'punch') punIds[k.slice(1).join(':')] = 1; else if (k[0] === 'doc') docs.push(x); });
    var p0 = A.proj(pid) || {};
    var work = [];
    if (Object.keys(insIds).length) { var data = insLoad(); data[pid] = arr(data[pid]).filter(function(i){ return !(i && insIds[i.id]); }); insSave(data); }
    if (Object.keys(punIds).length) work.push(spPunchNow().then(function(list){
      Object.keys(punIds).forEach(function(id){ try { if (W._gcTombstone) W._gcTombstone('punch', id); } catch (e) {} });
      var next = list.filter(function(x){ return !(x && punIds[x.id]); });
      try { if (W._gcApplySync) W._gcApplySync('punch', next); } catch (e) {} try { if (W.idbSet) W.idbSet('punch', next); } catch (e) {} try { if (W._supaUpsert) W._supaUpsert('punch', next); } catch (e) {}
    }));
    docs.forEach(function(x){ work.push(spDropDoc(x.id)); });
    work.push(A.saveProject(pid, function(q){
      if (Object.keys(permIds).length) q.permits = arr(q.permits).filter(function(x){ return !(x && permIds[x.id]); });
      if (rm.draws && s(q.drawSchedule) === s(p0.drawSchedule) && /^template\b/i.test(s(q.drawScheduleBy))) { q.drawSchedule = ''; q.drawScheduleBy = ''; }
      if (docs.length) { q.autoDocs = Object.assign({}, q.autoDocs || {}); docs.forEach(function(x){ delete q.autoDocs[x.key.slice(4)]; }); }
      q.autoReview = { done: true, at: nowIso(), by: who, kept: kept.map(function(x){ return x.kind + ': ' + x.label; }).slice(0, 60), removed: gone.map(function(x){ return x.kind + ': ' + x.label; }).slice(0, 60) };
      A.jobNote(q, who + ' reviewed what the automations had added: kept ' + kept.length + ', removed ' + gone.length + (gone.length ? ' (' + gone.map(function(x){ return x.label; }).join(', ').slice(0, 200) + ')' : '') + '.');
    }));
    return Promise.all(work).then(function(){ return { kept: kept.length, removed: gone.length }; });
  });
}
/* the customer-portal plan from the job's template rows (accepted ones are real steps; suggestions are marked draft) */
function spReplan(pid, rows){
  rows = arr(rows).filter(function(r){ return r && String(r.pid) === String(pid) && r.tpl; }).sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : 1; });
  if (!rows.length) return A.saveProject(pid, function(q){ if (!q.schedPlan) return false; q.schedPlan = Object.assign({}, q.schedPlan, { v: 2, at: nowIso(), steps: [] }); });
  var tpl = allTemplates()[rows[0].tpl] || { id: rows[0].tpl, name: s(rows[0].tplName) };
  return A.saveProject(pid, function(q){ q.schedPlan = planOf(rows, tpl); q.schedTemplate = q.schedTemplate || tpl.id; });
}
W._gcTplOffer = { offers: spOffers, applyPermits: spApplyPermits, applyDraws: spApplyDraws, makeDoc: spMakeDoc, autoAdded: spAutoAdded, review: spReview, replan: spReplan,
  preview: function(pid, tplId, fit, start){ var p = A.proj(pid), tpl = allTemplates()[tplId]; if (!p || !tpl) return null; var st = /^\d{4}-\d{2}-\d{2}$/.test(s(start)) ? s(start) : (/^\d{4}-\d{2}-\d{2}/.test(s(p.startDate)) ? s(p.startDate).slice(0, 10) : today()); return planFor(p, tpl, st, fit === false ? '' : (fit || s(p.endDate))); },
  apply: function(pid, tplId, fit, start){ return draftSchedule(pid, { template: tplId, manual: true, force: true, fit: fit !== false, start: start }); }, fixChain: fixChain };
