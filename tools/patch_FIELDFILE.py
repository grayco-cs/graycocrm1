"""Idempotent patch FIELDFILE (on top of FIELDPORTAL): 📷 Add Photo/File keeps you on the job — a file is stored on the
job's Documents right there; the dark Job Info sheet is no longer opened.

  Owner 11/03 (iPhone, Field, job "Brad"): "Tried to add a file and it went to this dark page." — the Job Info sheet.
  Cause: 📷 Add Photo/File opens the phone's picker (camera / library / files) correctly; a PHOTO then goes to GrayCo
  Photos, but any other FILE (a PDF, Word, Excel…) was handed to docsUpload(), which OPENED the old Job Info sheet
  (window._gcOpenJobProfile — dark navy by design) and pushed the file into that sheet's old "📄 Add Document" input.
  So every non-photo file landed the person on Job Info (and, where the browser refused the hand-over, left the file
  unsaved with only a "Tap 📄 Add Document" note).
  Now: each file goes to the CRM's file storage (window._gcStoreFile, kind 'doc', as patch Q's customer-portal upload
  does) and a record is added to the job's projectDocs (idb + the screen + the cloud, as the signed-paper copy does);
  a toast says what happened and the job page stays on the screen. Photos are unchanged (GrayCo Photos' own upload).
  The Job Info sheet's dark look is its normal look (the 📋 Job Info tile opens the same sheet) — not changed.

Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_FIELDFILE.py [index.html]   (also updates tools/fieldportal.js when it has the block)
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_FIELDFILE__'

OLD = """/* ── 📷 Add Photo/File: photos → GrayCo Photos' own upload; any other file → the job's Documents (job profile input) ── */
function docsUpload(p, files){
  if (typeof W._gcOpenJobProfile !== 'function') { toast('Documents are not on this phone yet.'); return false; }
  W._gcOpenJobProfile(p.id);
  var inp = D.getElementById('_jpFileInput');
  if (inp && typeof W.DataTransfer === 'function') {
    try { var dt = new W.DataTransfer(); files.forEach(function(f){ dt.items.add(f); }); inp.files = dt.files; inp.dispatchEvent(new Event('change')); return true; } catch (e) {}
  }
  toast('Tap 📄 Add Document to attach the file.');
  var b = D.getElementById('_jpFileBtn'); if (b) try { b.scrollIntoView({ block: 'center' }); } catch (e) {}
  return false;
}"""

NEW = """/* ── 📷 Add Photo/File: photos → GrayCo Photos' own upload; any other file → the job's Documents ── */
/* __GC_PATCH_FIELDFILE__ (owner 11/03): a file is stored on the job's Documents right here (the CRM's file storage + the
   job's projectDocs) — the job page stays on the screen; the old Job Info sheet is no longer opened for it */
function addJobDoc(rec){
  return Promise.resolve(W.idbGet ? W.idbGet('projectDocs') : null).then(null, function(){ return null; }).then(function(all){
    if (typeof all === 'string') { try { all = JSON.parse(all); } catch (e) { all = null; } }
    if (!Array.isArray(all)) all = arr(C().projectDocs || W._gcProjectDocs).slice();
    if (all.some(function(d){ return d && d.id === rec.id; })) return false;
    var next = all.concat([rec]);
    try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('field file'); } catch (e) {}
    return Promise.resolve(W.idbSet ? W.idbSet('projectDocs', next) : null).then(null, function(){}).then(function(){
      try { if (W._setProjectDocs) W._setProjectDocs(function(prev){ return Array.isArray(prev) ? (prev.some(function(d){ return d && d.id === rec.id; }) ? prev : prev.concat([rec])) : next; }); } catch (e) {}
      try { if (W._crm) W._crm.projectDocs = next; } catch (e) {}
      try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {}
      try { if (W._gcTabChangeSync) W._gcTabChangeSync('field file'); } catch (e) {}
      (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
      return true;
    });
  });
}
function docsUpload(p, files){
  if (typeof W._gcStoreFile !== 'function') { toast('File storage is not ready yet — try again in a moment.'); return Promise.resolve(0); }
  var pid = s(p.id), by = s((meU() || {}).name) || s(lsGet('grayco_user')), done = 0, bad = [];
  toast('Saving ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' to this job…');
  return files.reduce(function(pr, f){
    return pr.then(function(){
      return W._gcStoreFile(f, { kind: 'doc', pid: pid, name: f.name }).then(function(m){
        if (!m || !m.ref) throw new Error('no file reference');
        var t = new Date().toISOString();
        return addJobDoc({ id: 'fdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pid: pid, projectId: pid, name: s(f.name) || 'File', fileName: s(f.name),
          cat: 'document', type: s(m.type || f.type), size: m.size || f.size || 0, ref: m.ref, hash: s(m.hash), uploaded: today(), uploadedAt: t, by: by, source: 'field', savedAt: t, updatedAt: t });
      }).then(function(){ done++; }, function(e){ bad.push(s(f.name) + ' (' + s(e && e.message || e) + ')'); });
    });
  }, Promise.resolve()).then(function(){
    toast(bad.length ? 'Not saved: ' + bad.join(', ') + (done ? ' · ' + done + ' saved' : '') : '📄 ' + done + ' file' + (done === 1 ? '' : 's') + ' added to this job\\'s Documents');
    return done;
  });
}"""

src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_FIELDPORTAL__' in src, 'FIELDPORTAL is not in this page'
n = src.count(OLD)
assert n == 1, ('anchor count != 1', 'docsUpload', n)
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFILE')

# the patch source in tools/
tp = os.path.join(HERE, 'fieldportal.js')
if os.path.exists(tp):
    t = open(tp, encoding='utf-8').read()
    if MARK in t:
        print('tools/fieldportal.js: already patched')
    elif t.count(OLD) == 1:
        open(tp, 'w', encoding='utf-8').write(t.replace(OLD, NEW)); print('tools/fieldportal.js: patched')
    else:
        print('tools/fieldportal.js: block not found (left as is)')
