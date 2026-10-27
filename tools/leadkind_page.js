/* the lead's estimate and job, as the page knows them (patch LEADKIND) */
var LKM = {}, LKAt = 0, LKIX = null, LKIXAt = 0;
function lkNorm(v){ return low(v).replace(/[–—]/g, '-').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim(); }
function lkIndex(){
  var n = Date.now(); if (LKIX && n - LKIXAt < 15000) return LKIX;
  var ix = { id: {}, lead: {}, name: {} };
  arr(W._crm && W._crm.estimates).forEach(function(e){
    if (!e || typeof e !== 'object') return;
    if (e.id != null) ix.id[String(e.id)] = e;
    var li = s(e.leadId || e.estinLeadId); if (li) ix.lead[li] = e;
    var nm = lkNorm(e.name); if (nm && (!ix.name[nm] || s(e.gc))) ix.name[nm] = e;
  });
  LKIX = ix; LKIXAt = n; return ix;
}
function lkHints(l){
  var h = {}, ix = lkIndex();
  var e = ix.id[s(l.estimateId)] || ix.id[s(l.estId)] || ix.lead[s(l.id)] || null;
  if (!e) { var c = ix.name[lkNorm(l.name || l.title)]; if (c && (!s(c.address) || !s(l.address) || lkNorm(c.address).indexOf(lkNorm(l.address).split(' ').slice(0, 3).join(' ')) >= 0)) e = c; }
  if (e) { h.estGc = s(e.gc); h.estClient = s(e.client); h.estName = s(e.name); h.estType = s(e.type || e.jobType); }
  var pid = s(l.pid || l.projectId || l.convertedTo || l.jobId);
  if (pid) { var p = proj(pid); if (p) { try { h.jobGroup = groupCore(p, null); } catch (x) {} } }
  return h;
}
function lkAuto(l){
  if (!l || typeof l !== 'object') return null;
  var n = Date.now(); if (n - LKAt > 15000) { LKM = {}; LKAt = n; }
  var k = s(l.id) + '|' + s(l.updatedAt || l.savedAt) + '|' + s(l.leadKind) + '|' + s(l.type) + '|' + s(l.name) + '|' + s(l.source) + '|' + s(l.gc) + '|' + s(l.pid || l.projectId);
  if (Object.prototype.hasOwnProperty.call(LKM, k)) return LKM[k];
  var r = null; try { r = leadKindOf(l, lkHints(l)); } catch (e) {}
  LKM[k] = r; return r;
}
/* stamp a NEW lead (or one being fixed): leadKind + kindAuto + a line in its history; false when the rule says nothing */
function lkStamp(l, extra, by){
  var h = lkHints(l); if (extra && typeof extra === 'object') Object.keys(extra).forEach(function(k){ if (s(extra[k])) h[k] = extra[k]; });
  var r = leadKindOf(l, h); if (!r) return false;
  var was = s(l.leadKind || l.type), at = nowIso();
  l.leadKind = r.kind; l.kindAuto = { kind: r.kind, why: r.why, was: was, at: at, by: by || 'auto' };
  var a = arr(l.activity).slice(); a.push({ type: 'system', text: 'Type set to ' + r.kind + ' automatically — ' + r.why + (was ? ' (was ' + was + ')' : ''), at: at, by: by || 'CRM' }); l.activity = a.slice(-200);
  return r;
}
/* the one-time fix of the open leads already filed under the wrong type (an admin's computer runs it once, logged) */
function lkLeads(){ try { var E = W._gcLeadsEngine; if (E && typeof E.rawLeads === 'function') { var r = arr(E.rawLeads()).filter(function(l){ try { return !(typeof E.dead === 'function' && E.dead(l)); } catch (x) { return true; } }); if (r.length) return r; } } catch (e) {} return arr(W._crm && W._crm.leads); }
var LK_GONE = {};   /* a lead the CRM's own list no longer has (a merged-away duplicate still in this computer's copy): not counted again */
var LK_FLAG = 'gc_leadkind_fix_v1', LK_LOG = 'gc_leadkind_log_v1';
function lkOpen(l){ return !!l && !l.archived && !l.deleted && !/^(won|lost|dead|closed|declined|archived|converted)$/i.test(s(l.stage)) && !/^(won|lost|dead|closed|declined|archived|converted)$/i.test(s(l.status)) && !s(l.convertedTo); }
function lkFix(opts){
  opts = opts || {};
  try { if (W._gcVAS && W._gcVAS.active()) return Promise.resolve({ skipped: 'view-as' }); } catch (e) {}
  if (!isAdmin()) return Promise.resolve({ skipped: 'not admin' });
  var E = W._gcLeadsEngine, list = lkLeads();
  var todo = list.filter(function(l){ return lkOpen(l) && !LK_GONE[s(l.id)] && !!leadKindOf(l, lkHints(l)); });
  var plan = todo.map(function(l){ var r = leadKindOf(l, lkHints(l)); return { id: s(l.id), name: s(l.name || l.title), was: s(l.leadKind || l.type), kind: r.kind, why: r.why }; });
  if (opts.dry || !todo.length) { if (!opts.dry) lsSet(LK_FLAG, nowIso()); return Promise.resolve({ dry: !!opts.dry, changed: 0, plan: plan }); }
  if (!E || typeof E.patchMany !== 'function' || typeof E.patchLead !== 'function') return Promise.resolve({ error: 'leads engine not ready', plan: plan });
  var me = myName(), done = [];
  var ps = [];
  E.patchMany(function(){ todo.forEach(function(l){ var lid = s(l.id); ps.push(E.patchLead(l.id, function(x){ if (!lkOpen(x)) return false; var r = lkStamp(x, null, 'Lead type fix (' + me + ')'); if (!r) return false; done.push({ id: s(x.id), name: s(x.name || x.title), was: s(x.kindAuto.was), kind: r.kind, why: r.why, at: x.kindAuto.at, by: me }); }).then(function(ok){ if (!ok) LK_GONE[lid] = 1; return ok; })); }); });
  return Promise.all(ps).then(function(){
    lsSet(LK_FLAG, nowIso());
    try { var old = jparse(lsGet(LK_LOG), []); lsSet(LK_LOG, JSON.stringify(arr(old).concat(done).slice(-500))); } catch (e) {}
    try { console.info('[GC] LEADKIND: ' + done.length + ' open lead(s) re-typed', done); } catch (e) {}
    if (done.length) try { (E.toast || toast)('Lead types fixed: ' + done.length + ' lead' + (done.length === 1 ? '' : 's') + ' → ' + done.map(function(d){ return d.kind; }).filter(function(k, i, a){ return a.indexOf(k) === i; }).join(' / ')); } catch (e) {}
    return { changed: done.length, done: done, plan: plan };
  });
}
/* how many open leads the fix would change (the Leads screen's ⋯ menu shows it to admins) */
var LKN = { at: 0, n: 0 };
function lkCount(){ var n = Date.now(); if (n - LKN.at < 15000) return LKN.n; LKN.at = n; try { LKN.n = lkLeads().filter(function(l){ return lkOpen(l) && !LK_GONE[s(l.id)] && !!leadKindOf(l, lkHints(l)); }).length; } catch (e) { LKN.n = 0; } return LKN.n; }
/* the admin runs it from Leads → ⋯ → Fix lead types: shows what will change, then changes it (one write) and logs it */
function lkRun(){
  return lkFix({ dry: true }).then(function(r){
    var plan = arr(r && r.plan); if (!plan.length) { try { (W._gcLeadsEngine.toast || toast)('Every open lead already has the right type.'); } catch (e) {} return r; }
    var txt = plan.slice(0, 25).map(function(x){ return '• ' + x.name + ': ' + (x.was || 'no type') + ' → ' + x.kind + ' (' + x.why + ')'; }).join('\n') + (plan.length > 25 ? '\n… and ' + (plan.length - 25) + ' more' : '');
    if (!W.confirm('Fix the type of ' + plan.length + ' open lead' + (plan.length === 1 ? '' : 's') + '?\n\n' + txt + '\n\nEach lead gets a line in its history. Nothing else changes.')) return r;
    return lkFix({}).then(function(x){ LKN.at = 0; setTimeout(function(){ LKN.at = 0; }, 2000); return x; });
  });
}
/* once per admin (per computer): a hint, if any open lead is filed under the wrong type */
(function lkHint(n){
  setTimeout(function(){
    try {
      if (lsGet(LK_FLAG) || lsGet('gc_leadkind_hint_v1')) return;
      if (!isAdmin() || !W._gcLeadsEngine || !lkLeads().length) { if (n < 40) lkHint(n + 1); return; }
      var c = lkCount(); lsSet('gc_leadkind_hint_v1', nowIso());
      if (c) try { (W._gcLeadsEngine.toast || toast)(c + ' open lead' + (c === 1 ? ' is' : 's are') + ' filed under the wrong type (e.g. a county / public bid as Residential). Leads → ⋯ → Fix lead types.'); } catch (e) {}
    } catch (e) {}
  }, n === 0 ? 30000 : 15000);
})(0);
W._gcLeadAutoKind = function(l){ var r = lkAuto(l); return r ? r.kind : ''; };
W._gcLeadAutoWhy = lkAuto;
W._gcLeadKindOf = leadKindOf;
W._gcLeadKindStamp = function(l, extra){ try { return lkStamp(l, extra, 'CRM (new lead)'); } catch (e) { return false; } };
W._gcLeadKindFix = lkFix;
W._gcLeadKindRun = lkRun;
W._gcLeadKindCount = lkCount;
W._gcLeadKindLog = function(){ return jparse(lsGet(LK_LOG), []); };
