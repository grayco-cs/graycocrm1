#!/usr/bin/env python3
"""patch SCOPEFILES: 📎 Add scope files in 👷 Subs & portal (tools/scopefiles_tail.js) + "Use the <trade> scope file" in the sub scope editor."""
import sys, os
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_PATCH_SCOPEFILES__' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, ('anchor', src.count(a), a[:80])
    src = src.replace(a, b)
# hub: button + handler
rep("""<button type="button" class="gcsub-btn" data-act="site">📍 Site notes (gate, parking, hours…)</button></div>';
    sh.body.innerHTML = h;""",
"""<button type="button" class="gcsub-btn" data-act="site">📍 Site notes (gate, parking, hours…)</button>' + (window._gcScopeFiles ? '<button type="button" class="gcsub-btn" data-act="scope-files">📎 Add scope files' + (window._gcScopeFiles.docs(pid).length ? ' (' + window._gcScopeFiles.docs(pid).length + ' on the job)' : '') + '</button>' : '') + '</div>';
    sh.body.innerHTML = h;""")
rep("""    if (act === 'site') return siteSheet(pid, reopen);
    if (act === 'welcome')""",
"""    if (act === 'site') return siteSheet(pid, reopen);
    if (act === 'scope-files') { sh.close(); return window._gcScopeFiles.open(pid, reopen); }
    if (act === 'welcome')""")
# scope editor: use the trade's scope file
rep("""      (src.length ? '<div class="gcsub-cta"><select class="gcsub-inp" id="sc-src">""",
"""      (kind === 'scope' && window._gcScopeFiles ? window._gcScopeFiles.forTrade(pid, sb.trade || sb.cat || '').map(function(sf, i){ return '<div class="gcsub-cta"><button type="button" class="gcsub-btn g" data-sf="' + i + '">📄 Use the ' + esc(sf.trade) + ' scope file — ' + esc(sf.name) + '</button><span class="gcsub-muted">Fills the lines from the file (no $ lines) and attaches it for this sub only</span></div>'; }).join('') : '') +
      (src.length ? '<div class="gcsub-cta"><select class="gcsub-inp" id="sc-src">""")
rep("""    if (t.id === 'sc-add') { read(); lines.push(""",
"""    if (t.hasAttribute('data-sf')) { var sf = window._gcScopeFiles.forTrade(pid, sb.trade || sb.cat || '')[+t.getAttribute('data-sf')]; if (!sf) return; var keepF = read(); var fl = window._gcScopeFiles.toLines(sf.scopeText);
      var blankF = lines.length === 1 && !lines[0].desc; lines = (blankF ? [] : lines).concat(fl); if (!lines.length) lines.push({ room: '', desc: '', meas: '', qty: '', unit: '' });
      if (!files.some(function(f){ return f.ref === sf.ref; })) files.push({ ref: sf.ref, name: sf.name, type: sf.type || '' }); keepF.files = files; paint(); restore(keepF);
      toast(fl.length ? 'Added ' + fl.length + ' lines from ' + sf.name + ' and attached the file — check them' : 'Attached ' + sf.name + ' (no text could be read — type the lines)'); return; }
    if (t.id === 'sc-add') { read(); lines.push(""")
tail = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scopefiles_tail.js'), encoding='utf-8').read()
open(P, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + tail); print('patched')
