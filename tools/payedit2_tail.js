<script>
/* __GC_PAYEDIT2__ — owners get no commission (patch PAYEDIT2, owner 11/03: "owners do no commission this shouldn't be here").
   The commission engine (_gcQueueCommissionForJob) queued a commission check in gc_check_queue for the job's PM whenever a
   job was collected in full — and the owner runs jobs as PM, so Wesley got six "— commission" checks on the 2026-09-18 run.
   Owners are paid by draws. From here: anyone who is an owner / admin (role Admin or Owner, payType owner, _gcOwnerNames)
   or who was let go (gc_fired_users) never earns commission, is never queued a commission check, and gets no commission in
   payroll (_gcCommissionForPM). Unpaid owner / let-go commission checks already waiting are taken off the queue (only when
   there are any), and each one is kept in gc_owner_comm_removed. Real employees' checks are never touched. */
(function(W){
'use strict';
if(W.__GC_PAYEDIT2__) return; W.__GC_PAYEDIT2__ = true;
var HIST = 'gc_owner_comm_removed';
function s(v){ return String(v == null ? '' : v).trim(); }
function low(v){ return s(v).toLowerCase().replace(/\s+/g, ' '); }
function lsJ(k, d){ try{ var v = JSON.parse(W.localStorage.getItem(k) || 'null'); return v == null ? d : v; }catch(e){ return d; } }
function lsPut(k, v){ try{ W.localStorage.setItem(k, JSON.stringify(v)); }catch(e){} try{ if(W._supaUpsert) W._supaUpsert(k, v); }catch(e){} }

/* pure: the names (lower case) who never get commission */
function noCommSet(ctx){
  ctx = ctx || {}; var out = {};
  (ctx.users || []).forEach(function(u){
    if(!u) return;
    var r = low(u.role), pt = low(u.payType);
    if(/^(admin|owner)$/.test(r) || pt === 'owner' || pt === 'owner_draw'){ if(u.name) out[low(u.name)] = 'owner'; if(u.email) out[low(u.email)] = 'owner'; }
  });
  (ctx.ownerNames || []).forEach(function(n){ if(s(n)) out[low(n)] = 'owner'; });
  var f = ctx.fired || {};
  if(Array.isArray(f)) f.forEach(function(n){ var k = low(n && typeof n === 'object' ? n.name : n); if(k && !out[k]) out[k] = 'let go'; });
  else Object.keys(f).forEach(function(n){ if(f[n] && low(n) && !out[low(n)]) out[low(n)] = 'let go'; });
  delete out[''];
  return out;
}
function isComm(c){ return !!c && /commission/i.test(s(c.type) + ' ' + s(c.kind)); }
/* pure: split the check queue — unpaid commission checks for an owner / someone let go come out, everything else stays */
function healQueue(q, set){
  var keep = [], removed = [];
  (Array.isArray(q) ? q : []).forEach(function(c){
    var why = c && set[low(c.emp || c.payee)];
    if(why && isComm(c) && low(c.status) === 'entered' && low(c.dir || 'out') === 'out') removed.push({ why:why, check:c }); else keep.push(c);
  });
  return { keep:keep, removed:removed };
}
var CORE = { noCommSet:noCommSet, healQueue:healQueue, isComm:isComm };
W._gcPayEdit2Core = CORE;

function liveSet(){
  var users = []; try{ users = (W._crm && W._crm.users) || []; }catch(e){}
  var own = []; try{ own = W._gcOwnerNames ? W._gcOwnerNames() : []; }catch(e){}
  try{ (W._gcOwnerUsers ? W._gcOwnerUsers() : []).forEach(function(u){ if(u && u.name) own.push(u.name); }); }catch(e){}
  return noCommSet({ users:users, ownerNames:own, fired:lsJ('gc_fired_users', {}) });
}
W._gcNoCommission = function(name){ var k = low(name); return !!k && !!liveSet()[k]; };

/* the self-heal: only when an owner / let-go commission check is waiting */
W._gcOwnerCommHeal = function(){
  var q = lsJ('gc_check_queue', []); if(!Array.isArray(q) || !q.length) return 0;
  var res = healQueue(q, liveSet()); if(!res.removed.length) return 0;
  var at = new Date().toISOString(), by = ''; try{ by = W.localStorage.getItem('grayco_user') || ''; }catch(e){}
  var h = lsJ(HIST, []); if(!Array.isArray(h)) h = [];
  var seen = {}; h.forEach(function(x){ if(x && x.check) seen[x.check.id] = 1; });
  res.removed.forEach(function(x){ if(!seen[x.check.id]) h.push({ at:at, by:by || 'auto', why:x.why + ' — no commission (paid by draws)', check:x.check }); });
  if(h.length > 300) h = h.slice(h.length - 300);
  lsPut(HIST, h);
  try{ if(W._gcTombstoneMany) W._gcTombstoneMany('gc_check_queue', res.removed.map(function(x){ return x.check.id; }).filter(Boolean)); }catch(e){}
  lsPut('gc_check_queue', res.keep);
  try{ console.log('[GC] PAYEDIT2: ' + res.removed.length + ' unpaid commission check(s) for an owner / someone let go taken off the checks due (copies in ' + HIST + ')'); }catch(e){}
  try{ if(W._gcRefreshCheckRun) W._gcRefreshCheckRun(); }catch(e){}
  return res.removed.length;
};

/* gates on every path that makes or shows commission */
function wrapAll(){
  var d = W._gcDraftCheck;
  if(typeof d === 'function' && !d.__noOwnerComm){
    var wd = function(check){
      if(check && isComm(check) && low(check.dir || 'out') === 'out' && W._gcNoCommission(check.emp || check.payee)){
        try{ console.log('[GC] PAYEDIT2: no commission check for ' + s(check.emp || check.payee) + ' (owner / let go)'); }catch(e){}
        return null;
      }
      return d.apply(this, arguments);
    };
    wd.__noOwnerComm = true; W._gcDraftCheck = wd;
  }
  var qj = W._gcQueueCommissionForJob;
  if(typeof qj === 'function' && !qj.__noOwnerComm){
    var wq = async function(pid){
      var res = await qj.apply(this, arguments);
      try{
        var log = lsJ('gc_commission_paid', {}), e = log && !Array.isArray(log) ? log[pid] : null;
        if(e && e.pm && W._gcNoCommission(e.pm) && !e.noCommission){ e.ownerAmount = e.amount; e.amount = 0; e.checkId = ''; e.noCommission = 'owner / let go — paid by draws'; lsPut('gc_commission_paid', log); }
      }catch(err){}
      return res;
    };
    wq.__noOwnerComm = true; W._gcQueueCommissionForJob = wq;
  }
  var cp = W._gcCommissionForPM;
  if(typeof cp === 'function' && !cp.__noOwnerComm){
    var wc = async function(pmName){
      if(W._gcNoCommission(pmName)) return { total:0, earned:0, alreadyOnACheck:0, detail:[], note:'no commission — ' + s(pmName) + ' is an owner (paid by draws) or was let go' };
      return cp.apply(this, arguments);
    };
    Object.keys(cp).forEach(function(k){ wc[k] = cp[k]; });
    wc.__noOwnerComm = true; W._gcCommissionForPM = wc;
  }
  var qd = W._gcQueuedChecksDue;
  if(typeof qd === 'function' && !qd.__noOwnerComm){
    var wqd = function(){
      var l = qd.apply(this, arguments);
      return Array.isArray(l) ? l.filter(function(c){ return !(c && /commission/i.test(s(c.kind)) && W._gcNoCommission(c.who)); }) : l;
    };
    wqd.__noOwnerComm = true; W._gcQueuedChecksDue = wqd;
  }
}
wrapAll(); setTimeout(wrapAll, 3000); setInterval(wrapAll, 7000);
setTimeout(W._gcOwnerCommHeal, 8000); setTimeout(W._gcOwnerCommHeal, 30000); setInterval(W._gcOwnerCommHeal, 300000);
})(window);
</script>
