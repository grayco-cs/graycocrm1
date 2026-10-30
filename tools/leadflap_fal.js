/* patch LEADFLAP-1: FILED ONCE, AND NEVER OVER A LEAD THAT IS THERE.
   Measured on the live mirror (10/30): this ran every 4-5 s for the whole session. Its "already a lead?" check read
   the leads from disk, and the disk read leaves out the leads that were deleted (gc_tombstones) and the ones the
   lead-delete guard takes off the disk (_gcLDEL: same CompanyCam / QuickBooks id as a deleted lead). So each run
   filed those again -- 26 deleted ones and up to 41 kept ones, the kept ones under their OWN id, as a blank copy
   dated today with no PM -- handed that disk copy to the screen and the cloud as the whole list, and the tombstone
   sweep took the deleted ones off again 2-3 s later: the lead list swapped between 116 / 149 / 175 copies, an
   assignment on one of those leads went blank in memory (the Approvals "Assign this lead" count moved), and the
   blank copy was written to disk and sent to the cloud.
   Now: a held-off row is filed only when no lead has it -- not on the screen, not on disk, not deleted (the CRM's
   delete list or the lead-delete guard), not merged into another lead -- and the new rows are ADDED to the list
   that is there (screen, disk, cloud); nothing already there is replaced. The same held-off rows as the last run
   that filed nothing are not looked at again. */
var filedSig = '';
function leadGone(cand){
  try{ if(window._gcxDead && window._gcxDead('leads', cand.id)) return true; }catch(e){}
  try{ if(window._gcLDEL && window._gcLDEL.blocked && window._gcLDEL.blocked(cand)) return true; }catch(e){}
  try{ if(window._gcApplyTombstoneFilter){ var f = window._gcApplyTombstoneFilter('leads', [cand]); if(Array.isArray(f) && !f.length) return true; } }catch(e){}
  return false;
}
async function fileAsLeads(){
  filingT = null;
  var rows = Object.keys(heldOff).map(function(k){ return heldOff[k]; });
  if(!rows.length) return;
  var sig = rows.map(function(p){ return s(p && p.id); }).sort().join(',');
  if(sig === filedSig) return;
  var leads = null;
  try{ leads = await window.idbGet('leads'); }catch(e){}
  if(!Array.isArray(leads)) leads = [];
  var have = {};
  function note(l){
    if(!l) return; if(l.id!=null) have['id:'+s(l.id)]=1;
    if(l.fromProjectId) have['p:'+l.fromProjectId]=1; if(l.ccamId) have['cc:'+l.ccamId]=1; if(l.ccId) have['cc:'+l.ccId]=1; if(l.qbId) have['qb:'+l.qbId]=1;
    [].concat(l.mergedFrom||[], l._mergedFrom||[]).forEach(function(x){ x = s(x); if(x){ have['id:'+x]=1; if(/^L(QB|CC)_/.test(x)) have['p:'+x.slice(4)]=1; } });
  }
  leads.forEach(note);
  try{ var onScreen = window._crm && window._crm.leads; if(Array.isArray(onScreen)) onScreen.forEach(note); }catch(e){}
  try{ var dup = JSON.parse(localStorage.getItem('gc_dupes_removed')||'[]'); if(Array.isArray(dup)) dup.forEach(function(d){ if(d && d.from==='leads' && d.row) note(d.row); }); }catch(e){}   /* merged away by the de-dupe sweep */
  var added = [];
  rows.forEach(function(p){
    var cc = s(p.ccamId||p.ccProjectId), qb = s(p.qbId||p.qbCustomerId);
    var isQB = fromQuickBooks(p), lid = (isQB?'LQB_':'LCC_')+p.id;
    if(have['id:'+lid] || have['p:'+p.id] || (cc && have['cc:'+cc]) || (qb && have['qb:'+qb])) return;
    var cand = { id:lid, company:s(p.client||p.name)||(isQB?'QuickBooks customer':'CompanyCam lead'), name:s(p.name),
                 contact:s(p.contact||p.clientName), phone:s(p.clientPhone||p.phone), email:s(p.clientEmail||p.email), address:s(p.address),
                 projectType:s(p.type), estValue:0, priority:'Medium', source:(isQB?'QuickBooks':'CompanyCam'), status:'new',
                 created:new Date().toISOString().slice(0,10), ccamId:cc||undefined, qbId:qb||undefined,
                 ccamUrl:s(p.ccamUrl||p.companyCamUrl)||undefined, fromProjectId:p.id,
                 note:'Kept off the job board: '+(isQB?'a QuickBooks customer':'a CompanyCam project')+' with nothing on it. Give it a contract, a note or an invoice to make it a job.' };
    have['id:'+lid]=1; have['p:'+p.id]=1; if(cc) have['cc:'+cc]=1; if(qb) have['qb:'+qb]=1;
    if(leadGone(cand)) return;                                    /* deleted on purpose: it stays deleted */
    added.push(cand);
  });
  if(!added.length){ filedSig = sig; return; }
  filedSig = '';
  /* the disk: added to what is on it now (read again), nothing on it replaced */
  var disk = null; try{ disk = await window.idbGet('leads'); }catch(e){}
  if(!Array.isArray(disk)) disk = leads;
  var hd = {}; disk.forEach(function(l){ if(l && l.id!=null) hd[s(l.id)]=1; });
  var addD = added.filter(function(l){ return !hd[l.id]; });
  var next = addD.length ? disk.concat(addD) : disk;
  if(addD.length){ try{ await window.idbSet('leads', next); }catch(e){} }
  /* the screen: added to the list React holds now (an edit made a moment ago stays) */
  try{ if(window._setLeads) window._setLeads(function(prev){ var a = Array.isArray(prev) ? prev : [], h = {}; a.forEach(function(l){ if(l && l.id!=null) h[s(l.id)]=1; }); var add = added.filter(function(l){ return !h[l.id]; }); return add.length ? a.concat(add) : prev; }); }catch(e){}
  try{ if(addD.length && window._supaUpsert) window._supaUpsert('leads', next); }catch(e){}
  try{ console.log('[GC] '+added.length+' importer row(s) filed as leads for review (they are not jobs). Leads → source CompanyCam / QuickBooks.'); }catch(e){}
}
