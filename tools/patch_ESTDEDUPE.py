#!/usr/bin/env python3
"""Idempotent patch ESTDEDUPE: a one-time, admin-run clean-up of the estimates in the cloud (NOT automatic).

Production 10/29 (read-only scan): estimates live in three places --
  * gc_kv "estimates" (plain row, 44, 2.68 MB, 10-28) and "__est__gc_ests_v2" (44, 2.68 MB, 10-28): the live set (45 ids together);
  * estimates__chunk0..11 + estimates__manifest (10-21: "11 chunks / 119 rows", but 12 chunks / 147 rows exist -> torn, so no
    computer can read them; every read downloads ~13 MB, fails and retries). The 114 ids found only there are all older
    copies of live estimates: 19 are "-gid..." copies of a live id, 95 have the same name as a live estimate. 12.1 MB.

window._gcEstDedupeNow({ dryRun: true })  -> the report only, nothing written.
window._gcEstDedupeNow()                  -> 1. downloads a backup file (every estimate from all three places) first,
                                             2. writes the plain row = the union by id of the live set (newest save wins),
                                             3. the manifest says "not chunked", 4. the old chunks are emptied.
Safety (any one stops it, nothing written): every live id must be in the result; every chunk-only id must be a copy of a
live estimate (same id stem or same name) unless opt.allowUnmatched; the result must fit one row (3.4 MB); admins only.
__est__gc_ests_v2 is not written (the estimate builder's own store keeps its rows).
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_ESTDEDUPE__'
if MARK in src:
    print('already patched'); sys.exit(0)

JS = r"""
<script id="gc-patch-estdedupe">
/* __GC_PATCH_ESTDEDUPE__ — one-time estimates clean-up, admin-run only: _gcEstDedupeNow({ dryRun: true }) (tools/patch_ESTDEDUPE.py) */
(function(){
'use strict';
if (window.__GC_ESTDEDUPE__) return; window.__GC_ESTDEDUPE__ = true;
function creds(){ try { return { u: (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k: localStorage.getItem('grayco_sb_key') || '' }; } catch (e) { return { u: '', k: '' }; } }
function H(c){ return { apikey: c.k, Authorization: 'Bearer ' + c.k }; }
function idOf(r){ return (r && typeof r === 'object' && r.id != null && r.id !== '') ? String(r.id) : ''; }
function stamp(r){ return String((r && (r.updatedAt || r.savedAt || r.modified || r.lastModified)) || ''); }
function nm(r){ return String((r && (r.name || r.projName || r.client)) || '').toLowerCase().trim(); }
function stem(id){ return String(id).replace(/(-gid[a-z0-9_]+)+$/i, '').replace(/^(est|draft)_/, ''); }
function size(v){ try { return JSON.stringify(v).length; } catch (e) { return 0; } }
async function getRow(c, key){
  var r = await fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', { headers: H(c), cache: 'no-store' });
  if (!r || !r.ok) throw new Error('read ' + key + ' ' + (r && r.status));
  var rows = await r.json(); if (!Array.isArray(rows)) throw new Error('read ' + key);
  if (!rows.length) return undefined;
  var v = rows[0].value; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} }
  return v;
}
async function putRow(c, key, value){
  var r = await fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, H(c)), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  if (!r || !r.ok) throw new Error('write ' + key + ' ' + (r && r.status));
}
function arr(v){ return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).map(function(k){ return v[k]; }) : []); }
var running = false;
window._gcEstDedupeNow = async function(opt){
  opt = opt || {};
  if (running) return { skipped: 'already running' };
  running = true;
  var rep = { at: new Date().toISOString(), by: '', dryRun: !!opt.dryRun };
  try {
    if (!(window.__GC_AUTH__ && typeof window.__GC_AUTH__.isAdmin === 'function' && window.__GC_AUTH__.isAdmin())) throw new Error('admins only');
    try { rep.by = window.__GC_AUTH__.email() || ''; } catch (e) {}
    var c = creds(); if (!c.u || !c.k) throw new Error('not connected to the cloud');
    if (window._gcHeavy && !window._gcHeavy.loaded()) await window._gcHeavy.load('estimates clean-up');   /* STUCKFIX: writes wait for the load */
    var plain = arr(await getRow(c, 'estimates')), v2 = arr(await getRow(c, '__est__gc_ests_v2')), man = await getRow(c, 'estimates__manifest');
    var chunks = [], nChunks = 0, bytesBefore = size(plain) + size(v2);
    for (var ci = 0; ci < 60; ci++) {
      var cv = await getRow(c, 'estimates__chunk' + ci);
      if (cv === undefined) { if (ci >= ((man && man.count) || 0)) break; else continue; }
      nChunks = ci + 1; bytesBefore += size(cv); chunks = chunks.concat(arr(cv));
    }
    /* the live set: plain row + builder store, union by id, the newer save wins */
    var at = {}, live = [];
    plain.concat(v2).forEach(function(r){ var id = idOf(r); if (!id) return; if (!(id in at)) { at[id] = live.length; live.push(r); return; }
      var o = live[at[id]]; if (stamp(r) > stamp(o) || (stamp(r) === stamp(o) && size(r) > size(o))) live[at[id]] = r; });
    var liveIds = {}, liveStems = {}, liveNames = {}; live.forEach(function(r){ liveIds[idOf(r)] = 1; liveStems[stem(idOf(r))] = 1; if (nm(r)) liveNames[nm(r)] = 1; });
    var only = {}, unmatched = [];
    chunks.forEach(function(r){ var id = idOf(r); if (!id || liveIds[id]) return; var o = only[id]; if (!o || stamp(r) > stamp(o)) only[id] = r; });
    Object.keys(only).forEach(function(id){ var r = only[id]; if (!(liveStems[stem(id)] || (nm(r) && liveNames[nm(r)]))) unmatched.push(id + ' ' + (r.name || r.projName || r.client || '')); });
    rep.plainRow = plain.length; rep.builderStore = v2.length; rep.chunks = nChunks; rep.chunkRows = chunks.length; rep.manifest = man || null;
    rep.liveUnique = live.length; rep.chunkOnlyIds = Object.keys(only).length; rep.chunkOnlyUnmatched = unmatched.length; rep.unmatchedSample = unmatched.slice(0, 10);
    rep.bytesBefore = bytesBefore; rep.bytesAfter = size(live) + size(v2);
    var lost = Object.keys(liveIds).filter(function(id){ return !live.some(function(r){ return idOf(r) === id; }); });
    if (lost.length) throw new Error('safety: ' + lost.length + ' live estimates would be lost');
    if (unmatched.length && !opt.allowUnmatched) throw new Error('safety: ' + unmatched.length + ' estimates are only in the old chunks and are not a copy of a live one — nothing written (see unmatchedSample)');
    if (!live.length) throw new Error('safety: no live estimates');
    if (size(live) > 3400000) throw new Error('safety: the live estimates do not fit one row (' + size(live) + ' bytes)');
    if (opt.dryRun) { rep.result = 'dry run: nothing written'; return rep; }
    /* backup first: every estimate from all three places, as a file on this computer */
    try {
      var blob = new Blob([JSON.stringify({ _export: 'GrayCo estimates before EST-DEDUPE', at: rep.at, by: rep.by, estimates: plain, builderStore: v2, manifest: man, chunks: chunks })], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'GrayCo_estimates_backup_' + rep.at.slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
      rep.backup = a.download + ' (' + Math.round(blob.size / 1e5) / 10 + ' MB)';
    } catch (e) { throw new Error('backup file could not be made — nothing written'); }
    if (!opt.noConfirm && !window.confirm('Estimates clean-up: keep ' + live.length + ' estimates in one row, empty the ' + nChunks + ' old pieces (' + rep.chunkOnlyIds + ' old copies, saved in ' + rep.backup + '). Go ahead?')) { rep.result = 'cancelled'; return rep; }
    await putRow(c, 'estimates', live);
    await putRow(c, 'estimates__manifest', { chunked: false, count: 0, total: live.length, at: new Date().toISOString(), gen: 'estdedupe' + Date.now().toString(36), note: 'estimates are one row again (patch ESTDEDUPE)' });
    for (var cj = 0; cj < nChunks; cj++) await putRow(c, 'estimates__chunk' + cj, []);
    rep.result = 'cleaned';
    await putRow(c, 'gc_estdedupe_v1', rep);
    return rep;
  } catch (e) {
    rep.result = 'stopped: ' + (e && e.message || e);
    return rep;
  } finally {
    running = false; window._gcEstDedupeReport = rep;
    try { console.log('%c[GC] estimates clean-up: ' + rep.result, 'background:#0f2440;color:#fff;padding:2px 6px', rep); } catch (e) {}
  }
};
})();
</script>
"""
src = src.rstrip('\n') + '\n' + JS.lstrip('\n')
open(path, 'w', encoding='utf-8').write(src)
print('patched ESTDEDUPE')
