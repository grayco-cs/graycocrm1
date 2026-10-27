<script>
/* ============================================================================
   GrayCo — A BID TAKEN OFF THE BID LIST STAYS OFF.  patch BIDDEL

   "I know I deleted these, why are they back?"

   The Bid Board card has two delete buttons. The red DELETE at the top only
   took the bid out of this screen's list: it wrote no delete mark. Every list
   goes up to the cloud as the union of this computer and the cloud, so the
   next push put the bid straight back from the cloud copy, and every other
   computer kept it too. Only the 🗑 Delete at the bottom of the card wrote a
   mark.

   Now both buttons ask the same question, in the page:
     · Remove from the bid list            (the default — Enter)
     · Remove + mark the job Lost          (when the bid has a job)
     · Remove + delete the job             (when the bid has a job; asks again)
     · Cancel                              (Esc)
   and a removal is written to the one delete list (synced to every computer),
   so no sync, union push, reload or other computer can bring it back. The
   job's PO is marked too, so Launch Job never puts a bid back for a job whose
   bid was taken off.
   ========================================================================== */
(function(){
'use strict';
if(window.__GC_BIDDEL__) return; window.__GC_BIDDEL__ = true;
function s(v){ return v == null ? '' : String(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function crm(){ return window._crm || {}; }
function poOf(b){ if(!b) return ''; var m = s(b.notes).match(/PO:\s*([A-Z]\d{3,})/); return s(b.autoPO || b.po || (m && m[1]) || ''); }
function jobOf(b){
  var ps = Array.isArray(crm().projects) ? crm().projects : [];
  if(b && b.pid){ var j = ps.find(function(p){ return p && p.id === b.pid; }); if(j) return j; }
  var po = poOf(b); if(!po) return null;
  return ps.find(function(p){ return p && s(p.autoPO) === po; }) || null;
}
function mark(type, id){
  if(!id) return;
  try{ if(window._gcTombstone) window._gcTombstone(type, id); }catch(e){}
  try{ if(window._gcxDel) window._gcxDel(type, id); }catch(e){}
}
/* is this bid (or the job it was launched for) one a person took off the list? */
function dismissed(b){
  try{
    if(!b) return false;
    var dead = window._gcxDead || window._gcIsTombstoned;
    if(typeof dead !== 'function') return false;
    if(b.id && dead('bidLists', b.id)) return true;
    /* the job-level mark only stops the AUTOMATIC adds (Launch Job); a bid a person types in again is theirs */
    if(!/Auto-added/i.test(s(b.notes))) return false;
    var po = poOf(b); if(po && dead('bidPO', po)) return true;
    var j = jobOf(b); if(j && j.id && dead('bidJob', j.id)) return true;
  }catch(e){}
  return false;
}
window._gcBidDismissed = dismissed;
function removeBid(b, setBids){
  var id = s(b.id), j = jobOf(b), po = poOf(b) || (j && s(j.autoPO));
  try{ window.__GC_DELETING_AT__ = Date.now(); }catch(e){}
  mark('bidLists', id);
  if(po) mark('bidPO', po);
  if(j && j.id) mark('bidJob', j.id);
  var f = function(prev){ return (prev || []).filter(function(x){ return !(x && s(x.id) === id); }); };
  try{ if(typeof setBids === 'function') setBids(f); else if(window._gcSetBids) window._gcSetBids(f); }catch(e){}
}
function toast(msg){ try{ if(window._gcToast) return window._gcToast(msg); }catch(e){} try{ var t = document.createElement('div'); t.id = 'gcx-biddel-toast'; t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 16px;border-radius:8px;font:13px system-ui,sans-serif;z-index:100001;max-width:90vw'; document.body.appendChild(t); setTimeout(function(){ try{ t.remove(); }catch(e){} }, 4000); }catch(e){} }

window._gcBidDel = function(bid, setBids){
  if(!bid || !bid.id) return;
  var old = document.getElementById('gcx-biddel'); if(old) old.remove();
  var j = jobOf(bid), jLost = j && /^lost$/i.test(s(j.status));
  var box = document.createElement('div'); box.id = 'gcx-biddel';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif';
  var btn = 'display:block;width:100%;text-align:left;padding:10px 12px;margin-top:8px;border-radius:6px;font-size:13px;cursor:pointer;font-family:inherit;';
  box.innerHTML = '<div style="background:#fff;color:#111;max-width:420px;width:100%;border-radius:10px;padding:18px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
    + '<div data-q style="font-weight:700;font-size:15px">Remove “' + esc(bid.title || 'this bid') + '” from the bid list?</div>'
    + '<div style="font-size:12px;color:#555;margin-top:4px">It stays off on every computer.' + (j ? ' Its job: <b>' + esc(j.name || '') + '</b>' + (j.autoPO ? ' (PO ' + esc(j.autoPO) + ')' : '') + ' — ' + esc(j.status || '') + '.' : '') + '</div>'
    + '<button type="button" data-a="remove" style="' + btn + 'background:#dc2626;color:#fff;border:none;font-weight:700">Remove from the bid list</button>'
    + (j && !jLost ? '<button type="button" data-a="lost" style="' + btn + 'background:#fff;color:#b91c1c;border:1px solid #fca5a5">Remove + also mark the job Lost</button>' : '')
    + (j ? '<button type="button" data-a="deljob" style="' + btn + 'background:#fff;color:#7f1d1d;border:1px solid #fca5a5">Remove + also delete the job</button>' : '')
    + '<button type="button" data-a="cancel" style="' + btn + 'background:#f3f4f6;color:#111;border:1px solid #d1d5db;text-align:center">Cancel</button>'
    + '</div>';
  function close(){ try{ document.removeEventListener('keydown', key, true); box.remove(); }catch(e){} }
  function act(a){
    if(a === 'cancel'){ close(); return; }
    if(a === 'deljob' && !window.confirm('Delete the job "' + s(j && j.name) + '" too? Its estimates, change orders and invoices are kept.')) return;
    close();
    removeBid(bid, setBids);
    var msg = '“' + s(bid.title || 'Bid') + '” removed from the bid list';
    if(a === 'lost' && j){
      try{ if(window._setProjects) window._setProjects(function(prev){ return (prev || []).map(function(p){ return p && p.id === j.id ? Object.assign({}, p, { status:'lost', updatedAt:new Date().toISOString() }) : p; }); }); }catch(e){}
      msg += ' · job marked Lost';
    } else if(a === 'deljob' && j){
      try{ if(window._gcTombstoneProject) window._gcTombstoneProject(j.id); }catch(e){}
      try{ window.__GC_DELETING_AT__ = Date.now(); if(window._gcxDel) window._gcxDel('projects', j.id); }catch(e){}
      try{ if(window._setProjects) window._setProjects(function(prev){ return (prev || []).filter(function(p){ return !(p && p.id === j.id); }); }); }catch(e){}
      msg += ' · job deleted';
    }
    toast(msg);
  }
  function key(ev){
    if(ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); close(); }
    else if(ev.key === 'Enter' && !(ev.target && ev.target.closest && ev.target.closest('#gcx-biddel button'))){ ev.preventDefault(); ev.stopPropagation(); act('remove'); }
  }
  box.addEventListener('click', function(ev){ var b = ev.target.closest && ev.target.closest('button[data-a]'); if(b){ act(b.getAttribute('data-a')); } else if(ev.target === box){ close(); } });
  document.addEventListener('keydown', key, true);
  document.body.appendChild(box);
  try{ box.querySelector('[data-a=remove]').focus(); }catch(e){}
};

/* a bid already marked off never shows again, whatever list hands it back (the gcx filter covers the cloud and the
   disk; this also covers Launch Job / an add for a PO or job that was taken off) */
function sweep(){
  try{
    if(window.__GC_IS_TYPING__ || typeof window._gcSetBids !== 'function') return;
    window._gcSetBids(function(prev){
      if(!Array.isArray(prev) || !prev.length) return prev;
      var bad = {}, n = 0; prev.forEach(function(b){ if(b && b.id && dismissed(b)){ bad[s(b.id)] = 1; n++; } });
      if(!n) return prev;
      Object.keys(bad).forEach(function(id){ setTimeout(function(){ mark('bidLists', id); }, 0); });
      return prev.filter(function(x){ return !(x && bad[s(x.id)]); });
    });
  }catch(e){}
}
setTimeout(sweep, 5000); setInterval(sweep, 20000);
window._gcBidDelSweep = sweep;
console.log('[GC] BIDDEL: a bid taken off the Bid Board stays off on every computer.');
})();
</script>
