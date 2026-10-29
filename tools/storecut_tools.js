/* __GC_STORECUT_TOOLS__ — one-time clean-ups, admin-run only, dry run first: _gcStoreCutNow({ dryRun: true }) (tools/patch_STORECUT.py) */
(function(){
'use strict';
if (window.__GC_STORECUT_TOOLS__) return; window.__GC_STORECUT_TOOLS__ = true;
var W = window;
var DAY = 864e5, FOLD_DAYS = 3, BUCKET = 'crm-files';   /* folds stay whole for 3 days (a quick Undo needs no download) */
function creds(){ try { return { u: (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k: localStorage.getItem('grayco_sb_key') || '' }; } catch (e) { return { u: '', k: '' }; } }
function H(c){ return { apikey: c.k, Authorization: 'Bearer ' + c.k }; }
function size(v){ if (v === undefined) return 0; if (typeof v === 'string') return v.length; try { return JSON.stringify(v).length; } catch (e) { return 0; } }
function arr(v){ if (typeof v === 'string' && /^\s*\[/.test(v)) { try { v = JSON.parse(v); } catch (e) {} } return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).map(function(k){ return v[k]; }) : []); }
function s(v){ return v == null ? '' : String(v); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && typeof W.__GC_AUTH__.isAdmin === 'function' && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function who(){ try { return W.__GC_AUTH__.email() || ''; } catch (e) { return ''; } }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
async function getRow(c, key){
  var r = await fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', { headers: H(c), cache: 'no-store' });
  if (!r || !r.ok) throw new Error('read ' + key + ' ' + (r && r.status));
  var rows = await r.json(); if (!Array.isArray(rows)) throw new Error('read ' + key);
  if (!rows.length) return undefined;
  var v = rows[0].value; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} }
  return v;
}
async function putRow(c, key, value){
  var allow = key === '__est__gc_ests_v2' && W._gcStoreCut;
  if (allow) W._gcStoreCut.allow(key, true);
  try {
    var r = await fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, H(c)), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
    if (!r || !r.ok) throw new Error('write ' + key + ' ' + (r && r.status));
  } finally { if (allow) W._gcStoreCut.allow(key, false); }
}
function saveFile(name, obj){
  var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  return name + ' (' + Math.round(blob.size / 1e5) / 10 + ' MB)';
}
async function heavyFirst(why){ if (W._gcHeavy && !W._gcHeavy.loaded()) await W._gcHeavy.load(why); }   /* STUCKFIX holds these writes until loaded */
function hex(buf){ var a = new Uint8Array(buf), o = ''; for (var i = 0; i < a.length; i++) o += (a[i] < 16 ? '0' : '') + a[i].toString(16); return o; }
async function sha(bytes){ return hex(await crypto.subtle.digest('SHA-256', bytes)); }
function fromDataUrl(d){
  var m = /^data:([^,]*?),([\s\S]*)$/.exec(s(d)); if (!m) return null;
  var meta = m[1], b64 = /;base64/i.test(meta), type = (meta.split(';')[0] || 'application/octet-stream').toLowerCase();
  var bytes;
  if (b64) { var bin = atob(m[2].replace(/\s+/g, '')); bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
  else bytes = new TextEncoder().encode(decodeURIComponent(m[2]));
  return { type: type, bytes: bytes };
}
function refParts(ref){ var m = /^sb:([a-z0-9][a-z0-9_-]{1,62})\/([0-9a-f]{64})\.([a-z0-9]{1,8})$/.exec(s(ref)); return m ? { bucket: m[1], hash: m[2], ext: m[3], path: m[2] + '.' + m[3] } : null; }
async function inStorage(c, ref){
  var p = refParts(ref); if (!p) return false;
  try {
    var r = await fetch(c.u + '/storage/v1/object/authenticated/' + p.bucket + '/' + p.path, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
    return !!(r && (r.ok || r.status === 206));
  } catch (e) { return false; }
}
async function storeAndCheck(c, fileOrDataUrl, opts){
  if (typeof W._gcStoreFile !== 'function') throw new Error('file storage is not ready on this page');
  var meta = await W._gcStoreFile(fileOrDataUrl, opts);
  if (!meta || !meta.ref) throw new Error('file storage gave no reference');
  for (var i = 0; i < 6; i++) {
    try { if (typeof W._gcFilesUploadNow === 'function') await W._gcFilesUploadNow(); } catch (e) {}
    if (await inStorage(c, meta.ref)) return meta;
    await sleep(1500 + i * 1000);
  }
  throw new Error('"' + (opts && opts.name || 'file') + '" did not reach file storage — nothing changed');
}

/* ── a. estimates: one store ─────────────────────────────────────────────── */
W._gcEstOneNow = async function(opt){
  opt = opt || {};
  var c = creds(), rep = { step: 'estimates' };
  var v2 = await getRow(c, '__est__gc_ests_v2');
  rep.builderCopyBytes = size(v2); rep.builderCopyRows = arr(v2).length;
  if (typeof W._gcEstDedupeNow !== 'function') throw new Error('ESTDEDUPE is not on this page');
  var d = await W._gcEstDedupeNow({ dryRun: !!opt.dryRun, noConfirm: true, allowUnmatched: !!opt.allowUnmatched });
  rep.dedupe = d;
  if (!/^(dry run|cleaned)/.test(s(d && d.result))) throw new Error('estimates: ' + s(d && d.result));
  rep.bytesBefore = d.bytesBefore; rep.bytesAfter = d.bytesAfter - size(v2) + 2;
  if (opt.dryRun) { rep.result = 'dry run: nothing written'; return rep; }
  /* every builder record is in the cleaned "estimates" (ESTDEDUPE's live set is the union of both) */
  var est = arr(await getRow(c, 'estimates')), have = {}; est.forEach(function(e){ if (e && e.id != null) have[String(e.id)] = 1; });
  var miss = arr(v2).filter(function(e){ return e && e.id != null && !have[String(e.id)]; });
  if (miss.length) throw new Error('estimates: ' + miss.length + ' builder estimate(s) are not in "estimates" — the builder copy is kept');
  await putRow(c, '__est__gc_ests_v2', '[]');
  rep.result = 'one store: "estimates" (' + est.length + '), builder copy emptied';
  return rep;
};

/* ── b. documents: the old pieces' PDFs are in file storage, then the pieces are emptied ─────────────── */
W._gcDocsCleanNow = async function(opt){
  opt = opt || {};
  /* the old "no file sync" door answers every projectDocs__* request with an empty "done": open it for this run only */
  var door = typeof W._gcDocSync === 'function';
  if (door) W._gcDocSync(true);
  try { return await docsClean(opt); } finally { if (door) W._gcDocSync(false); }
};
async function docsClean(opt){
  var c = creds(), rep = { step: 'documents', dryRun: !!opt.dryRun };
  await heavyFirst('documents clean-up');
  var plain = arr(await getRow(c, 'projectDocs')), man = await getRow(c, 'projectDocs__manifest');
  var chunks = [], pieces = [], bytesBefore = size(man);
  for (var ci = 0; ci < 80; ci++) {
    var cv = await getRow(c, 'projectDocs__chunk' + ci);
    if (cv === undefined) { if (ci >= ((man && man.count) || 0)) break; else continue; }
    pieces.push(ci); bytesBefore += size(cv); chunks = chunks.concat(arr(cv).map(function(d){ return { d: d, piece: ci }; }));
  }
  rep.plainDocs = plain.length; rep.pieces = pieces.length; rep.pieceDocs = chunks.length; rep.bytesBefore = bytesBefore; rep.manifest = man || null;
  if (!pieces.length && !(man && man.chunked)) { rep.result = 'nothing to do'; rep.bytesAfter = bytesBefore; return rep; }
  var plainIds = {}, refByHash = {};
  plain.forEach(function(d){ if (!d) return; plainIds[s(d.id)] = d; [d.ref, d.data, d.fileRef].forEach(function(r){ var p = refParts(r); if (p) refByHash[p.hash] = r; }); });
  var files = [], recovered = [], noBody = 0;
  for (var i = 0; i < chunks.length; i++) {
    var d = chunks[i].d; if (!d) continue;
    var f = /^data:/.test(s(d.data)) ? fromDataUrl(d.data) : null, item = null;
    if (f) {
      var h = await sha(f.bytes), ref = refByHash[h] || '';
      item = { id: s(d.id), name: s(d.name), bytes: f.bytes.length, hash: h, ref: ref, inStorage: ref ? await inStorage(c, ref) : false };
      if (!item.inStorage && !opt.dryRun) {
        var meta = await storeAndCheck(c, d.data, { kind: 'doc', pid: d.pid || d.projectId || '', name: d.name || ('document-' + d.id) });
        item.ref = meta.ref; item.inStorage = true; item.uploaded = true; refByHash[h] = meta.ref;
      }
      files.push(item);
    } else if (!plainIds[s(d.id)]) noBody++;
    if (!plainIds[s(d.id)]) {
      var keep = {}; Object.keys(d).forEach(function(k){ if (k !== 'data') keep[k] = d[k]; });
      if (item && item.ref) { keep.ref = item.ref; keep.hash = item.hash; keep.size = keep.size || item.bytes; }
      keep.recoveredFrom = 'projectDocs__chunk' + chunks[i].piece + ' (' + s(man && man.at).slice(0, 10) + ')';
      keep.recoveredAt = new Date().toISOString();
      recovered.push(keep);
    }
  }
  rep.files = files.length; rep.filesAlreadyStored = files.filter(function(x){ return x.inStorage && !x.uploaded; }).length;
  rep.filesToUpload = files.filter(function(x){ return !x.inStorage; }).length; rep.filesUploaded = files.filter(function(x){ return x.uploaded; }).length;
  rep.onlyInOldPieces = recovered.map(function(x){ return s(x.id) + ' ' + s(x.name).slice(0, 60) + (x.ref ? '' : ' (no file)'); });
  rep.bytesAfter = 2 + size(recovered) + 160;
  if (opt.dryRun) { rep.result = 'dry run: nothing written'; return rep; }
  var bad = files.filter(function(x){ return !x.inStorage; });
  if (bad.length) throw new Error('documents: ' + bad.length + ' file(s) are not in file storage — nothing changed');
  if (!opt.noBackup) {
    try { rep.backup = saveFile('GrayCo_documents_backup_' + new Date().toISOString().slice(0, 10) + '.json', { _export: 'GrayCo projectDocs pieces before STORECUT', at: new Date().toISOString(), by: who(), projectDocs: plain, manifest: man, pieces: pieces.map(function(n){ return { piece: n, docs: chunks.filter(function(x){ return x.piece === n; }).map(function(x){ return x.d; }) }; }) }); }
    catch (e) { throw new Error('documents: backup file could not be made — nothing changed'); }
  }
  if (recovered.length) {
    var old = arr(await getRow(c, 'gc_docs_recovered')), at = {}; old.forEach(function(x, k){ if (x && x.id != null) at[s(x.id)] = k; });
    recovered.forEach(function(x){ if (s(x.id) in at) old[at[s(x.id)]] = x; else old.push(x); });
    await putRow(c, 'gc_docs_recovered', old);
  }
  await putRow(c, 'projectDocs__manifest', { chunked: false, count: 0, total: plain.length, at: new Date().toISOString(), gen: 'storecut' + Date.now().toString(36), note: 'projectDocs is one row; its files are in file storage (patch STORECUT)' });
  for (var j = 0; j < pieces.length; j++) await putRow(c, 'projectDocs__chunk' + pieces[j], []);
  rep.result = 'cleaned: ' + pieces.length + ' old pieces emptied, ' + recovered.length + ' document(s) kept in gc_docs_recovered';
  return rep;
}

/* ── d. old daily-backup copies in gc_kv (gc_dailybackup_<day>*): the server keeps 30 nights in gc_backups ───────── */
W._gcDailyCloudCleanNow = async function(opt){
  opt = opt || {};
  var c = creds(), keep = +opt.keepDays > 0 ? +opt.keepDays : 7, rep = { step: 'daily backups in gc_kv', keepDays: keep, dryRun: !!opt.dryRun };
  var r = await fetch(c.u + '/rest/v1/gc_kv?key=like.gc_dailybackup_*&select=key,updated_at', { headers: H(c), cache: 'no-store' });
  if (!r || !r.ok) throw new Error('daily backups: list ' + (r && r.status));
  var rows = await r.json(); if (!Array.isArray(rows)) rows = [];
  var cut = new Date(Date.now() - keep * DAY).toISOString().slice(0, 10);
  var old = rows.filter(function(x){ var d = /^gc_dailybackup_(\d{4}-\d{2}-\d{2})/.exec(s(x.key)); return d && d[1] < cut; });
  rep.rows = rows.length; rep.olderRows = old.length; rep.days = Array.from(new Set(rows.map(function(x){ return s(x.key).slice(15, 25); }))).sort();
  var b = 0; for (var i = 0; i < old.length; i++) b += size(await getRow(c, old[i].key));
  rep.bytesBefore = b; rep.bytesAfter = old.length * 40;
  if (!old.length) { rep.result = 'nothing older than ' + keep + ' days'; return rep; }
  if (opt.dryRun) { rep.result = 'dry run: nothing written'; return rep; }
  for (var j = 0; j < old.length; j++) await putRow(c, old[j].key, { emptied: true, by: 'STORECUT', at: new Date().toISOString(), note: 'older than ' + keep + ' days; the nightly server backup (gc_backups) keeps 30 nights' });
  rep.result = 'cleaned: ' + old.length + ' old daily-backup rows emptied';
  return rep;
};

/* ── c. gc_folded: old full copies move to one file in file storage ─────────────── */
W._gcFoldTrimNow = async function(opt){
  opt = opt || {};
  var c = creds(), days = +opt.days > 0 ? +opt.days : FOLD_DAYS, rep = { step: 'folded', days: days, dryRun: !!opt.dryRun };
  await heavyFirst('folded clean-up');
  var F = arr(await getRow(c, 'gc_folded')), cut = new Date(Date.now() - days * DAY).toISOString();
  var old = F.filter(function(f){ return f && f.record && !f.unfolded && s(f.foldedAt || f.updatedAt) && s(f.foldedAt || f.updatedAt) < cut; });
  rep.entries = F.length; rep.olderThanDays = old.length; rep.bytesBefore = size(F);
  var ids = {}; old.forEach(function(f){ ids[s(f.id)] = 1; });
  var stub = function(f, ref){ var o = {}; Object.keys(f).forEach(function(k){ if (k !== 'record') o[k] = f[k]; }); o.archRef = ref; o.archivedAt = new Date().toISOString(); return o; };
  var probe = F.map(function(f){ return f && ids[s(f.id)] ? stub(f, 'sb:' + BUCKET + '/' + new Array(65).join('0') + '.json') : f; });
  rep.bytesAfter = size(probe);
  if (!old.length) { rep.result = 'nothing older than ' + days + ' days'; return rep; }
  if (opt.dryRun) { rep.result = 'dry run: nothing written'; return rep; }
  var body = JSON.stringify({ _export: 'GrayCo gc_folded archive (patch STORECUT)', at: new Date().toISOString(), by: who(), days: days, count: old.length, records: old.map(function(f){ return { id: f.id, list: f.list, recordId: f.recordId, record: f.record }; }) });
  var name = 'gc_folded_archive_' + new Date().toISOString().slice(0, 10) + '.json';
  var meta = await storeAndCheck(c, new File([body], name, { type: 'application/json' }), { kind: 'doc', name: name });
  /* read it back: every archived copy must be in the file before the list lets go of it */
  var back = JSON.parse(await (await W._gcFileBlob(meta.ref)).text());
  var got = {}; (back.records || []).forEach(function(x){ if (x && x.record) got[s(x.id)] = 1; });
  var lost = old.filter(function(f){ return !got[s(f.id)]; });
  if (lost.length) throw new Error('folded: ' + lost.length + ' copies are not in the archive file — nothing changed');
  /* the cloud list as it is NOW (a fold may have happened meanwhile): only the archived entries change */
  var now = arr(await getRow(c, 'gc_folded'));
  var next = now.map(function(f){ return f && ids[s(f.id)] && f.record && !f.unfolded ? stub(f, meta.ref) : f; });
  await putRow(c, 'gc_folded', next);
  try { if (typeof W.idbSet === 'function') await W.idbSet('gc_folded', next); } catch (e) {}
  rep.archive = meta.ref; rep.bytesAfter = size(next); rep.result = 'cleaned: ' + old.length + ' full copies moved to ' + name;
  return rep;
};
/* Undo of an archived fold: the copy comes back from the archive file first */
(function wrapUnfold(n){
  var orig = W._gcUnfold;
  if (typeof orig !== 'function') { if (n < 120) setTimeout(function(){ wrapUnfold(n + 1); }, 1000); return; }
  if (orig.__gcStorecut) return;
  var w = async function(foldId){
    try {
      var F = arr(await W.idbGet('gc_folded')), f = F.find(function(x){ return x && x.id === foldId; });
      if (f && !f.record && f.archRef && typeof W._gcFileBlob === 'function') {
        var j = JSON.parse(await (await W._gcFileBlob(f.archRef)).text());
        var r = (j.records || []).find(function(x){ return x && x.id === foldId; });
        if (r && r.record) { f.record = r.record; await W.idbSet('gc_folded', F); }
        else throw new Error('not in the archive file');
      }
    } catch (e) {
      /* never undo without the record itself: that would put back an empty row */
      try { console.warn('[GC] folded archive not reachable', e); alert('Undo needs the saved copy from file storage, and it could not be reached right now. Try again when online.'); } catch (e2) {}
      return false;
    }
    return orig.apply(this, arguments);
  };
  w.__gcStorecut = true; W._gcUnfold = w;
})(0);

/* ── all three, with one report ─────────────────────────────────────────────── */
var running = false;
W._gcStoreCutNow = async function(opt){
  opt = opt || {};
  if (running) return { skipped: 'already running' };
  running = true;
  var rep = { at: new Date().toISOString(), by: who(), dryRun: !!opt.dryRun, steps: [] };
  try {
    if (!isAdmin()) throw new Error('admins only');
    var c = creds(); if (!c.u || !c.k) throw new Error('not connected to the cloud');
    if (!opt.dryRun && !opt.noConfirm && !W.confirm('Storage clean-up: one estimates list, the old document pieces emptied (their PDFs are in file storage), old folded copies moved to a file. A backup file is saved on this computer first. Go ahead?')) { rep.result = 'cancelled'; return rep; }
    var steps = [['estimates', W._gcEstOneNow], ['documents', W._gcDocsCleanNow], ['folded', W._gcFoldTrimNow], ['daily', W._gcDailyCloudCleanNow]];
    for (var i = 0; i < steps.length; i++) {
      if (opt.only && opt.only !== steps[i][0]) continue;
      try { rep.steps.push(await steps[i][1]({ dryRun: !!opt.dryRun, days: opt.days, allowUnmatched: opt.allowUnmatched })); }
      catch (e) { rep.steps.push({ step: steps[i][0], result: 'stopped: ' + (e && e.message || e) }); if (!opt.dryRun) break; }
    }
    var b = 0, a = 0; rep.steps.forEach(function(x){ b += x.bytesBefore || 0; a += x.bytesAfter == null ? (x.bytesBefore || 0) : x.bytesAfter; });
    rep.mbBefore = Math.round(b / 1e4) / 100; rep.mbAfter = Math.round(a / 1e4) / 100;
    rep.result = rep.steps.every(function(x){ return /^(dry run|cleaned|one store|nothing)/.test(s(x.result)); }) ? (opt.dryRun ? 'dry run: nothing written' : 'cleaned') : 'stopped (see steps)';
    if (!opt.dryRun) { try { await putRow(c, 'gc_storecut_v1', rep); } catch (e) {} }
    return rep;
  } catch (e) {
    rep.result = 'stopped: ' + (e && e.message || e); return rep;
  } finally {
    running = false; W._gcStoreCutReport = rep;
    try { console.log('%c[GC] storage clean-up: ' + rep.result + (rep.mbBefore != null ? ' — ' + rep.mbBefore + ' MB → ' + rep.mbAfter + ' MB' : ''), 'background:#0f2440;color:#fff;padding:2px 6px', rep); } catch (e) {}
  }
};
})();
