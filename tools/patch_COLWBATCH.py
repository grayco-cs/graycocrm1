# COLWBATCH (owner 11/22 "Everything is lagging and freezing"): the column-resize helper read each header's computed style
# right after adding the previous header's drag handle, forcing a full restyle of the table (480 jobs) once per column —
# ~1.4 s on Projects. Now: read every header first, then add the handles.
import sys
p = 'index.html'; s = open(p, encoding='utf-8').read()
old = """  ths(t).forEach(function(th){
    if (th.querySelector(':scope>.gccw-h')) return;
    if (W.getComputedStyle(th).position === 'static') th.style.position = 'relative';
    var h = D.createElement('div'); h.className = 'gccw-h'; h.title = 'Drag to resize · double-click to reset'; th.appendChild(h);
  });"""
new = """  var need = ths(t).filter(function(th){ return !th.querySelector(':scope>.gccw-h'); });   /* COLWBATCH: all reads, then all writes */
  var stat = need.map(function(th){ return W.getComputedStyle(th).position === 'static'; });
  need.forEach(function(th, i){
    if (stat[i]) th.style.position = 'relative';
    var h = D.createElement('div'); h.className = 'gccw-h'; h.title = 'Drag to resize · double-click to reset'; th.appendChild(h);
  });"""
assert s.count(old) == 1, 'anchor'
assert 'COLWBATCH' not in s
s = s.replace(old, new); open(p, 'w', encoding='utf-8').write(s); print('COLWBATCH applied')
