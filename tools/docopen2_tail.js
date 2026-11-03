<script id="gc-patch-docopen2">
/* __GC_PATCH_DOCOPEN2__ — ✏️ Edit on the document page (owner 11/03: "the viewer page also needs ✏️ Edit, next to ‹ Back and
   ⬇️ Download"). The CRM's own editors only:
     · an uploaded file (PDF, Word, picture…): its details — the name, the category, "👁 Customer sees it", and "Replace file"
       (the new version goes on the job; the old one stays in its history, hidden from the customer);
     · a proposal / estimate PDF: the estimate (ESTUPLOAD's panel when it is there, else the estimate builder);
     · the job's Scope of Work paper: the job's Scope of Work (Job Info); another job paper: its template (admins —
       the paper is then made again from it, filled in for the job). Nothing here overwrites a signed copy.
   API: window._gcViewer.editFor(item, job) → a function or null; window._gcViewer.fileProps(doc, job) */
(function(){
'use strict';
if (window.__GC_PATCH_DOCOPEN2__) return; window.__GC_PATCH_DOCOPEN2__ = true;
var W = window, D = document;
if (!W._gcViewer) return;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function arr(v){ return Array.isArray(v) ? v : []; }
function crm(){ return W._crm || {}; }
function isAdmin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = W._gcMeNow || {}; return /admin|owner/i.test(s(u.role) + ' ' + s(u.payType)); } catch (e) { return false; } }
function me(){ try { return s((W._gcMeNow || {}).name) || s(localStorage.getItem('grayco_user')); } catch (e) { return ''; } }
function toast(t, bad){ var el = D.getElementById('gcv2-toast'); if (!el) { el = D.createElement('div'); el.id = 'gcv2-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status'); el.style.cssText = 'position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483600;color:#fff;padding:12px 16px;border-radius:12px;font:700 14px Inter,Arial,sans-serif;max-width:92vw;text-align:center'; D.body.appendChild(el); } el.style.background = bad ? '#991b1b' : '#14202e'; el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3800); }
var CATS = ['Contracts', 'Proposals', 'Estimates', 'Change Orders', 'Invoices', 'Lien Waivers', 'Permits', 'Insurance Certs', 'Sub Docs', 'Receipts', 'Plans/Drawings', 'Specs', 'Warranty Docs', 'Photos', 'document', 'Other'];
/* the job's files — the same lists every screen reads (this device, the screen, the cloud) */
function saveDocs(change){
  return Promise.resolve(W.idbGet ? W.idbGet('projectDocs') : null).then(null, function(){ return null; }).then(function(all){
    if (typeof all === 'string') { try { all = JSON.parse(all); } catch (e) { all = null; } }
    if (!Array.isArray(all)) all = arr(crm().projectDocs || W._gcProjectDocs).slice();
    var next = change(all.slice()); if (!next) return false;
    try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('document details'); } catch (e) {}
    return Promise.resolve(W.idbSet ? W.idbSet('projectDocs', next) : null).then(null, function(){}).then(function(){
      try { if (W._setProjectDocs) W._setProjectDocs(function(prev){ if (!Array.isArray(prev)) return next; var by = {}; next.forEach(function(d){ if (d && d.id) by[d.id] = d; }); var out = prev.map(function(d){ return d && by[d.id] ? by[d.id] : d; }); next.forEach(function(d){ if (d && !prev.some(function(x){ return x && x.id === d.id; })) out.push(d); }); return out; }); } catch (e) {}
      try { if (W._crm) W._crm.projectDocs = next; } catch (e) {}
      try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {}
      later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
      return true;
    });
  });
}
function signedCopy(d){ return !!d && (/portal-signature/.test(s(d.source)) || !!d.signRequestId || !!d.signedAt); }
function fileProps(d, p){
  if (!d || !d.id) return null;
  var old = D.getElementById('gcv2-props'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gcv2-props'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Edit the file');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483410;background:#e9eef4;display:flex;flex-direction:column;font-family:Inter,-apple-system,Arial,sans-serif;color:#14202e';
  var cat = s(d.cat) || 'Other', cats = CATS.indexOf(cat) >= 0 ? CATS : [cat].concat(CATS), shown = d.portalShare === true, locked = signedCopy(d);
  var inp = 'width:100%;box-sizing:border-box;min-height:46px;border:1px solid #cfd8e3;border-radius:10px;padding:10px;font:16px Inter,Arial,sans-serif;background:#fff;color:#14202e';
  ov.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;background:#0f2440;color:#fff"><button type="button" data-p="back" style="min-height:44px;padding:0 14px;border-radius:10px;border:0;background:#fff;color:#0f2440;font:700 15px Inter,Arial,sans-serif">‹ Back</button><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">✏️ Edit — ' + esc(d.name || d.fileName || 'File') + '</b></div>' +
    '<div style="flex:1;overflow:auto;padding:14px;max-width:640px;width:100%;margin:0 auto;box-sizing:border-box">' +
    (locked ? '<div style="background:#fff8e1;border-radius:10px;padding:10px;margin-bottom:10px;font-size:14px">A signed copy: it is kept as it is — you can rename it and file it, not replace it.</div>' : '') +
    '<label style="display:block;font-weight:700;font-size:13px;color:#55626f;margin:6px 0 4px">Name</label><input data-p="name" style="' + inp + '" value="' + esc(d.name || d.fileName) + '">' +
    '<label style="display:block;font-weight:700;font-size:13px;color:#55626f;margin:12px 0 4px">Category</label><select data-p="cat" style="' + inp + '">' + cats.map(function(c){ return '<option' + (c === cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
    '<label style="display:flex;align-items:center;gap:10px;min-height:48px;margin-top:10px;font-size:15px;font-weight:700"><input type="checkbox" data-p="shown"' + (shown ? ' checked' : '') + ' style="width:24px;height:24px"> 👁 Customer sees it (in the customer portal)</label>' +
    (locked ? '' : '<label style="display:block;font-weight:700;font-size:13px;color:#55626f;margin:12px 0 4px">Replace file (a new version; the old one stays in its history)</label><input type="file" data-p="file" style="' + inp + '">') +
    '<div data-p="msg" style="font-size:13px;color:#55626f;margin:10px 0"></div>' +
    '<button type="button" data-p="save" style="width:100%;min-height:50px;border:0;border-radius:12px;background:#0f1d2f;color:#fff;font:800 16px Inter,Arial,sans-serif">💾 Save</button>' +
    (arr(d.history).length ? '<div style="margin-top:14px;font-size:13px;color:#55626f"><b>Earlier versions</b>' + arr(d.history).map(function(h){ return '<div>' + esc(h.name) + ' · ' + esc(s(h.at).slice(0, 10)) + (h.by ? ' · ' + esc(h.by) : '') + '</div>'; }).join('') + '</div>' : '') + '</div>';
  D.body.appendChild(ov);
  var q = function(k){ return ov.querySelector('[data-p="' + k + '"]'); };
  ov.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-p]'); if (!b) return; var a = b.getAttribute('data-p');
    if (a === 'back') { ov.remove(); return; }
    if (a !== 'save') return;
    var name = s(q('name').value) || s(d.name), cat2 = q('cat').value, show = !!q('shown').checked, f = q('file') && q('file').files && q('file').files[0];
    b.disabled = true; q('msg').textContent = f ? 'Saving the new version…' : 'Saving…';
    var t = new Date().toISOString();
    var put = function(ref, meta){
      return saveDocs(function(all){
        var i = all.findIndex(function(x){ return x && s(x.id) === s(d.id); }); if (i < 0) all.push(d), i = all.length - 1;
        var cur = Object.assign({}, all[i]);
        if (!ref) { all[i] = Object.assign(cur, { name: name, cat: cat2, portalShare: show, editedAt: t, editedBy: me(), updatedAt: t, savedAt: t }); return all; }
        var nid = 'fdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        var hist = arr(cur.history).concat([{ id: cur.id, name: s(cur.name), ref: s(cur.ref), at: s(cur.uploadedAt || cur.uploaded || cur.savedAt), by: s(cur.by) }]);
        all[i] = Object.assign(cur, { supersededBy: nid, portalShare: false, updatedAt: t, savedAt: t });   /* the old version: kept, never shown to the customer */
        all.push(Object.assign({}, cur, { id: nid, name: name || s(f.name), fileName: s(f.name), cat: cat2, portalShare: show, ref: ref, type: s(meta.type || f.type), size: meta.size || f.size || 0, hash: s(meta.hash), data: undefined,
          uploaded: t.slice(0, 10), uploadedAt: t, by: me(), versionOf: s(cur.versionOf || cur.id), history: hist, supersededBy: undefined, editedAt: t, editedBy: me(), updatedAt: t, savedAt: t }));
        return all;
      });
    };
    (f ? Promise.resolve(W._gcStoreFile ? W._gcStoreFile(f, { kind: 'doc', pid: s(d.pid || (p && p.id)), name: f.name }) : null).then(function(m){ if (!m || !m.ref) throw new Error('file storage is not ready'); return put(m.ref, m); }) : put('', {}))
      .then(function(){ ov.remove(); toast(f ? '✅ New version saved — the old one is in its history' : '✅ Saved'); try { var box = D.querySelector('.gcfp-docs'), sh = box && box.closest('._gcSheetOv'); if (sh && p && W._gcJobDocsList) { sh.remove(); W._gcJobDocsList(p); } } catch (e) {} },
        function(e){ b.disabled = false; q('msg').textContent = 'Not saved: ' + s(e && e.message || e); });
  });
  return ov;
}
function estById(id){ var l = [].concat(arr(W._gcEstimatesState), arr(crm().estimates)); return l.filter(function(e){ return e && s(e.id) === s(id); })[0] || null; }
function editFor(it, p){
  if (!it) return null;
  var pid = s(p && p.id);
  if (it.k === 'doc' && it.d) return function(){ fileProps(it.d, p); };
  if (it.k === 'est') return function(){
    if (W._gcEstUp && W._gcEstUp.after && estById(it.id)) { W._gcEstUp.after(it.id, {}); return; }
    try { if (W._gcJumpToEstimates) { W._gcJumpToEstimates(pid, it.id); return; } } catch (e) {}
    var e = estById(it.id); if (e && W._gcOpenEstimateInBuilder) W._gcOpenEstimateInBuilder(e); else toast('Open it from 📐 Estimates.');
  };
  if (it.k === 'paper') {
    if (/scope of work/i.test(s(it.t))) return function(){ if (W._gcOpenJobProfile) { W._gcOpenJobProfile(pid); later(function(){ var el = D.getElementById('_jpScopeText'); if (el) { try { el.scrollIntoView({ block: 'center' }); el.focus(); } catch (e) {} } }, 450); } };
    if (isAdmin() && W._gcDocLib && W._gcDocLib.edit) return function(){ W._gcDocLib.edit(it.id); };
  }
  return null;
}
W._gcViewer.editFor = editFor;
W._gcViewer.fileProps = fileProps;
try { console.log('[GC] ✏️ Edit on the document page (patch DOCOPEN2)'); } catch (e) {}
})();
</script>
