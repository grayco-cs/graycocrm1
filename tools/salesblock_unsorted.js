/* __GC_PATCH_SALESBLOCK_UNSORTED__ — a small ✕ on each Messages → 📥 Unsorted row (owner 11/01: "a small ✕ top right in case I
   want to delete one of these GrayCo text messages"). ADMINS AND THE OFFICE ONLY. No confirm: the row goes at once, with a
   5-second Undo. Messages have no "Recently deleted" bin, so this is a flag (unsortedHidden) that only takes the message off
   Unsorted — it stays in the record and in any thread history; a lead is never touched. Saved here and to the cloud at once
   (gc_kv gc_job_messages, the same merge-and-write as the Unsorted Move button); Undo writes it back. */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_SALESBLOCK_UNSORTED__) return; W.__GC_PATCH_SALESBLOCK_UNSORTED__ = true;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function allowed(){
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; }
}
function msgs(){ try { return arr(JSON.parse(localStorage.getItem('gc_job_messages') || '[]')); } catch (e) { return []; } }
function setLocal(id, extra){ var l = msgs().map(function(m){ return m && m.id === id ? Object.assign({}, m, extra) : m; }); try { localStorage.setItem('gc_job_messages', JSON.stringify(l)); } catch (e) {} }
function creds(){ var u = '', k = ''; try { u = localStorage.getItem('grayco_sb_url') || ''; k = localStorage.getItem('grayco_sb_key') || ''; } catch (e) {} return { u: u || W._GC_SB_URL || 'https://ieeonhpfahmwwecizdut.supabase.co', k: k || W._GC_SB_KEY || W.SB_KEY || '' }; }
/* the cloud copy: read, merge with this computer's list by id, the flag applied, write back */
function push(id, extra){
  var cr = creds(); if (!cr.k) return Promise.resolve(true);
  var H = { apikey: cr.k, Authorization: 'Bearer ' + cr.k, 'Content-Type': 'application/json' }, base = cr.u.replace(/\/$/, '') + '/rest/v1/gc_kv';
  return W.fetch(base + '?key=eq.gc_job_messages&select=value', { headers: H }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
    var remote = []; try { var v = rows && rows[0] && rows[0].value; remote = typeof v === 'string' ? JSON.parse(v) : arr(v); } catch (e) {}
    var all = {}; arr(remote).concat(msgs()).forEach(function(m){ if (m && m.id) all[m.id] = m; });
    var merged = Object.keys(all).map(function(k){ var m = all[k]; return m.id === id ? Object.assign({}, m, extra) : m; }).sort(function(a, b){ return s(a.at).localeCompare(s(b.at)); });
    try { localStorage.setItem('gc_job_messages', JSON.stringify(merged)); } catch (e) {}
    return W.fetch(base + '?on_conflict=key', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H), body: JSON.stringify({ key: 'gc_job_messages', value: JSON.stringify(merged), updated_at: new Date().toISOString() }) }).then(function(){ return true; });
  }).catch(function(){ return true; });
}
/* Unsorted leaves out a hidden message (the count in its title too) */
function wrap(){
  var f = W._gcMsgUnsorted; if (typeof f !== 'function' || f.__sbx) return !!f;
  var w = function(){ return arr(f.apply(this, arguments)).filter(function(m){ return !(m && m.unsortedHidden === true); }); };
  w.__sbx = true; W._gcMsgUnsorted = w; return true;
}
function undoToast(msg, onUndo){
  var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.className = 'gcsbx-toast';
  t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100270;background:#1e293b;color:#fff;padding:9px 14px;border-radius:10px;font:600 13px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);display:flex;gap:12px;align-items:center';
  t.innerHTML = '<span></span><button type="button" style="background:#fff;color:#1e293b;border:0;border-radius:7px;padding:4px 10px;font:700 12px Inter,sans-serif;cursor:pointer">Undo</button>';
  t.firstChild.textContent = msg; D.body.appendChild(t);
  var undone = false;
  t.querySelector('button').onclick = function(){ undone = true; try { t.remove(); } catch (e) {} onUndo(); };
  return { gone: function(){ return undone; }, el: t };
}
function hide(row, id){
  var at = new Date().toISOString(), me = ''; try { me = s(W.__GC_AUTH__.email()); } catch (e) {}
  var flag = { unsortedHidden: true, unsortedHiddenAt: at, unsortedHiddenBy: me };
  setLocal(id, flag); row.style.display = 'none'; push(id, flag);
  var u = undoToast('Removed from Unsorted.', function(){ var off = { unsortedHidden: false }; setLocal(id, off); push(id, off); row.style.display = ''; });
  ST.call(W, function(){ try { u.el.remove(); } catch (e) {} }, 5000);
}
function decorate(){
  var box = D.querySelector('.gc-qa-unsorted'); if (!box || !allowed()) return;
  Array.prototype.forEach.call(box.querySelectorAll('.gc-qa-urow'), function(row){
    if (row.querySelector('.gcsbx-x')) return;
    var sel = row.querySelector('[data-qa-pick]'), id = sel && sel.getAttribute('data-qa-pick'); if (!id) return;
    row.style.position = 'relative'; row.style.paddingRight = '26px';
    var b = D.createElement('button'); b.type = 'button'; b.className = 'gcsbx-x'; b.textContent = '✕'; b.title = 'Remove from Unsorted (Undo for 5 seconds)'; b.setAttribute('aria-label', 'Remove from Unsorted');
    b.style.cssText = 'position:absolute;top:4px;right:0;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:#9a3412;font:700 13px/22px Arial,sans-serif;cursor:pointer;padding:0';
    b.onclick = function(ev){ ev.preventDefault(); ev.stopPropagation(); hide(row, id); };
    row.appendChild(b);
  });
}
if (!wrap()) { var tries = 0, iv = RI.call(W, function(){ if (wrap() || ++tries > 240) clearInterval(iv); }, 500); }
RI.call(W, function(){ try { wrap(); decorate(); } catch (e) {} }, 1000);
W._gcUnsortedHide = { hide: hide, decorate: decorate };
})();
