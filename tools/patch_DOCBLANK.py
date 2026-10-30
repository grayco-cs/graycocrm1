#!/usr/bin/env python3
"""Idempotent patch DOCBLANK: the Document Library's papers open at the click (owner 10/30, Forms & Docs screenshot:
"these dont o[pen blank" -- 📄 Blank, and the 👁 Preview / ✨ Generate filled next to it, did not open in Edge).

Why: patch DOCLIB3's buttons read the library and the cloud first (the list, then gc_doc_uploads / gc_doc_custom /
gc_doc_favs, again for the paper, then the template's doctpl: copy -- two to three cloud round trips) and only THEN
called window.open. A click lets a page open a tab for about 5 seconds; on the office connection that ran out, so Edge
(and Chrome) blocked the tab. A template paper (Scope of Work, Material Selection Sheet, Photo & Jobsite Policy,
Payment Terms, Notices of Cancellation ...) then only showed a small "allow pop-ups" toast; nothing opened.

Now (inside DOCLIB3):
  * the click opens the tab AT ONCE (a "Preparing <paper> ..." page) and the paper is written into it when it is
    ready -- the first document open after the click (template / code-built papers, the generators' own window through
    patch DL, an uploaded PDF / image) is handed that tab;
  * when the browser blocks the tab anyway (window.open gives null), the paper shows ON THE PAGE in the in-page viewer
    (Print / Save as PDF, Close) instead of the toast -- the same viewer the generators already fall back to;
  * a paper that cannot be made closes the waiting tab and says why; Preview on a paper made from the job (proposal,
    estimate, thank-you) with no job picked says "Pick a job first";
  * an uploaded file's link is kept 60 s (was 5 s) so a slow PDF viewer still loads it;
  * the 📋 Documents-for-this-job picker's Open / Preview / Print use the same path;
  * GrayCo Proposal / Estimate Summary: "That job has no estimate yet." for every job -- the job's estimate was looked
    up in _crm.estimates, which the app never fills; it now reads the app's estimates (window._gcEstimatesState);
  * the GrayCo PM Playbook showed only the letterhead: its web-font @import stopped the written page after the
    <style>; the fonts now load from a <link> at the end of the page.
Usage: python3 tools/patch_DOCBLANK.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch DOCBLANK'
if MARK in src:
    print('DOCBLANK: already patched'); sys.exit(0)
assert src.count('if (window.__GC_PATCH_DOCLIB3__) return;') == 1, 'DOCLIB3 not found once'

R = []

# 1. the tab opened at the click, handed to the first document open
OLD = "/* ── a paper's HTML (filled for a job, or blank) ── */"
NEW = MARK + """ (owner 10/30 "these dont open blank"): the tab is opened AT THE CLICK, before any cloud read; the first
   document open after it (window.open of a blank page or a blob) is handed that tab. Blocked anyway → null → the
   caller shows the paper on the page (patch DL's viewer). */
var SLOT = null;   /* { w, blocked, used, at } */
/* a stylesheet @import (the PM Playbook's web fonts) stops a written tab / viewer after its <style>: the page showed
   the letterhead only. The fonts load from a <link> at the end of the page instead. */
function noImport(h){
  if (typeof h !== 'string' || h.indexOf('@import') < 0) return h;
  var L = []; h = h.replace(/@import url\\((['"]?)([^'")]+)\\1\\);?/g, function(m, q, u){ L.push(u); return ''; });
  var k = L.map(function(u){ return '<link rel="stylesheet" href="' + esc(u) + '">'; }).join('');
  return /<\\/body>/i.test(h) ? h.replace(/<\\/body>/i, k + '</body>') : h + k;
}
function willOpen(e, pid){
  if (!e || e.kind === 'docx' || (e.kind === 'fn' && e.openOnly)) return false;
  if (e.needsJob && !pid) return false;
  if (e.file) {
    var u = e.up || {}, l = e.legacy || {}, d = u.data || u.ref || l.fileData;
    if (!d || (W._gcIsRef && W._gcIsRef(d))) return false;
    return /pdf|image|text/.test((String(d).split(',')[0].match(/:(.*?);/) || [])[1] || u.fileType || '');
  }
  return true;
}
function arm(e, pid){
  if (!willOpen(e, pid)) return null;
  var w = null; try { w = W.open('', '_blank'); } catch (x) { w = null; }
  if (w) { try { w.document.open(); w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Preparing…</title></head><body style="font-family:Arial,sans-serif;color:#1a3a5f;padding:48px;text-align:center"><div style="font-size:18px;font-weight:800">GrayCo Construction Services</div><div style="margin-top:10px;font-size:14px;color:#555">Preparing ' + esc(e.title || 'your document') + '…</div></body></html>'); w.document.close(); } catch (x) {} }
  SLOT = { w: w, blocked: !w, used: false, at: Date.now() };
  return SLOT;
}
function disarm(sl){
  if (!sl) return;
  later(function(){ if (SLOT === sl) SLOT = null; if (!sl.used && sl.w && !sl.w.closed) { try { sl.w.close(); } catch (x) {} } }, 1600);
}
/* the Docs tab not painted yet (the job's 📋 Documents picker): what the id says */
function guess(uid){
  var m = /^(gen|fn):(.+)$/.exec(uid || '');
  if (m && m[1] === 'gen') return GEN.some(function(g){ return g[0] === m[2]; }) ? { uid: uid, kind: 'gen', title: '' } : null;
  if (m) { var f = FN.filter(function(x){ return x.id === m[2]; })[0]; return f ? { uid: uid, kind: 'fn', title: f.title, openOnly: !f.html, needsJob: !!f.needsJob } : null; }
  return /^gcb_/.test(uid || '') ? { uid: uid, kind: 'tpl', title: '' } : null;
}
/* a library button: open the tab now, make the paper, write it in */
function go(uid, pid, filled){
  var u0 = ALIAS[uid] || uid, e = LAST.filter(function(x){ return x && x.uid === u0; })[0] || guess(u0), sl = null;
  if (e && e.needsJob && !pid) { toast('Pick a job first \u2014 this paper is made from the job.', true); return Promise.resolve(null); }   /* at once, not after the cloud reads */
  try { sl = arm(e, pid); } catch (x) { sl = null; }
  var r; try { r = launch(uid, pid, filled); } catch (x) { disarm(sl); throw x; }
  Promise.resolve(r).then(function(){ disarm(sl); }, function(){ disarm(sl); });
  return r;
}
(function handOff(){
  var o = W.open; if (typeof o !== 'function' || o.__gcBlank) return;
  var f = function(u, name){
    var sl = SLOT;
    if (sl && !sl.used && Date.now() - sl.at < 30000 && (name == null || name === '' || name === '_blank') && (u == null || u === '' || u === 'about:blank' || /^blob:/i.test(String(u)))) {
      sl.used = true;
      if (sl.blocked) return null;                     /* the browser said no at the click: shown on the page */
      if (sl.w && !sl.w.closed) {
        if (u && u !== 'about:blank') { try { sl.w.location.replace(u); } catch (x) { try { sl.w.location.href = u; } catch (x2) {} } }
        try { if (Object.keys(CUS).length || (CTX.uid && Date.now() < CTX.until)) decorateWin(sl.w); } catch (x) {}
        try { sl.w.focus(); } catch (x) {}
        return sl.w;
      }
    }
    return o.apply(this, arguments);
  };
  try { Object.keys(o).forEach(function(k){ f[k] = o[k]; }); } catch (x) {}
  f.__gcBlank = true; f.__gcDocs3 = true; W.open = f;
})();

""" + OLD
R.append((OLD, NEW))

# 2. decorating the tab: once per window, and it may wait for the cloud (up to 30 s, was 12 s)
OLD = "  if (!w || w.__gcCustomDone) return;\n  var n = 0;\n  (function tick(){"
NEW = "  if (!w || w.__gcCustomDone || w.__gcDeco) return;   /* patch DOCBLANK: once per window */\n  try { w.__gcDeco = 1; } catch (e) {}\n  var n = 0;\n  (function tick(){"
R.append((OLD, NEW))
OLD = "{ if (++n < 60) later(tick, 200); return; }"
NEW = "{ if (++n < 150) later(tick, 200); return; }"
R.append((OLD, NEW))

# 3. a paper with no tab → the in-page viewer (was: a toast, nothing opened)
OLD = "function openHtml(h){ var w = W.open('', '_blank'); if (!w) { toast('Allow pop-ups for the CRM to see the document.', true); return; } try { w.document.open(); w.document.write(h); w.document.close(); } catch (e) {} }"
NEW = """function openHtml(h){
  h = noImport(h);   /* patch DOCBLANK */
  var w = null; try { w = W.open('', '_blank'); } catch (e) { w = null; }
  if (w) { try { w.document.open(); w.document.write(h); w.document.close(); try { w.focus(); } catch (e) {} return; } catch (e) {} }
  var t = /<title>([^<]*)<\\/title>/i.exec(h || '');   /* patch DOCBLANK: blocked → shown on the page */
  if (W._gcDocOverlay) return W._gcDocOverlay(h, t ? t[1] : 'Document');
  toast('Allow pop-ups for the CRM to see the document.', true);
}"""
R.append((OLD, NEW))

# 4. an uploaded PDF / image: blocked → on the page; the link lives 60 s
OLD = "if (/pdf|image|text/.test(mime)) W.open(url, '_blank'); else {"
NEW = "if (/pdf|image|text/.test(mime)) { var fw = null; try { fw = W.open(url, '_blank'); } catch (x2) { fw = null; } if (!fw && W._gcDocOverlay) W._gcDocOverlay('<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>' + esc(name) + '</title></head><body style=\"margin:0\"><iframe src=\"' + url + '\" style=\"border:0;width:100%;height:100vh\"></iframe></body></html>', name); } else {"
R.append((OLD, NEW))
OLD = "later(function(){ URL.revokeObjectURL(url); }, 5000);"
NEW = "later(function(){ URL.revokeObjectURL(url); }, 60000);"
R.append((OLD, NEW))

# 5. a paper made from the job, no job picked: say so (Preview used to say "no estimate yet")
OLD = "    if ((filled !== false && e.needsJob) && !pid) return toast('Pick a job first.', true);"
NEW = "    if (e.needsJob && !pid) return toast('Pick a job first \\u2014 this paper is made from the job.', true);   /* patch DOCBLANK */"
R.append((OLD, NEW))

# 6. the buttons (library cards, and the job's 📋 Documents picker) go through go()
OLD = """  if (act === 'fill') return launch(uid, pid, true);
  if (act === 'blank') return launch(uid, '', false);
  if (act === 'prev' || act === 'open') return launch(uid, pid, !!pid);"""
NEW = """  if (act === 'fill') return go(uid, pid, true);   /* patch DOCBLANK: the tab opens at the click */
  if (act === 'blank') return go(uid, '', false);
  if (act === 'prev' || act === 'open') return go(uid, pid, !!pid);"""
R.append((OLD, NEW))
OLD = """  if (act === 'open' || act === 'prev') return launch(id, pid, true);
  if (act === 'print') return launch(id, pid, true);"""
NEW = """  if (act === 'open' || act === 'prev') return go(id, pid, true);   /* patch DOCBLANK */
  if (act === 'print') return go(id, pid, true);"""
R.append((OLD, NEW))

# 7. the PM Playbook: its body after the font @import was never shown in the tab
OLD = "html: function(){ return typeof W._gcPlaybookHTML === 'string' ? W._gcPlaybookHTML : null; } },"
NEW = "html: function(){ return typeof W._gcPlaybookHTML === 'string' ? noImport(W._gcPlaybookHTML) : null; } },   /* patch DOCBLANK */"
R.append((OLD, NEW))

# 8. the proposal / estimate summary looked for the job's estimate in _crm.estimates, which the app never fills
#    (the estimates live in the app's state, window._gcEstimatesState): "That job has no estimate yet." for every job
OLD = "function estFor(pid){ var es = (((W._crm || {}).estimates) || []).filter(Boolean)"
NEW = "function estFor(pid){ var es = ((Array.isArray((W._crm || {}).estimates) && W._crm.estimates.length ? W._crm.estimates : Array.isArray(W._gcEstimatesState) ? W._gcEstimatesState : []) || []).filter(Boolean)   /* patch DOCBLANK: the app's estimates */"
R.append((OLD, NEW))

# 9. API
OLD = "W._gcDocs3 = { list: list, entry: entry, html: html, launch: launch,"
NEW = "W._gcDocs3 = { open: go, list: list, entry: entry, html: html, launch: launch,"
R.append((OLD, NEW))

for old, new in R:
    n = src.count(old)
    assert n == 1, ('DOCBLANK find-string count != 1', n, old[:80])
for old, new in R:
    src = src.replace(old, new)
open(path, 'w', encoding='utf-8').write(src)
print('DOCBLANK: patched', path)
