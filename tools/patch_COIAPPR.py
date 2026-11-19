#!/usr/bin/env python3
"""Idempotent patch COIAPPR: sub COI / W-9 to confirm are in ✅ Approvals, not a floating pill on every screen (owner 11/19:
"button is on every screen, it shouldn't, but approvals for what COIs should be in portal approvals").

1. patch AUTAI: paintPills draws only the payment-match pill (the "📄 N COI / W-9 to confirm" pill is gone, everywhere);
   one item opens straight to its read / confirm (openSubDoc(ref)); tapping an item no longer hides it for the session
   ("Not now" leaves it waiting); "Not a COI or W-9" → Close takes it off this computer's list for good; a confirmed one
   does not come back from a slow server list; a change of the list tells the approvals (event gc:subdocs-changed).
2. patch APX (and ONELIST: when two copies of a sub's file meet, the one marked read keeps its mark): a row another module adds may say which plain set row it replaces (drop: key) — no double row / count.
3. tools/coiappr_block.html becomes a script right after patch BPAPPR: the items join the ONE approval set (badge, To-Do
   chip, GrayCo Field's My Approvals → Other approvals) and the desk ✅ Approvals tab (rich rows), admins and the office.
Usage: python3 tools/patch_COIAPPR.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_COIAPPR__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

# ── 1. AUTAI ──
a = src.index('<script id="gc-patch-autai">'); b = src.index('</script>', a)
au = src[a:b]
au = once(au, "var SEENDOC = {};",
  "var SEENDOC = {}, SEENK = 'gc_subdoc_seen';   /* patch COIAPPR: what was closed as \"not a COI or W-9\" stays off this computer's list */\n"
  "try { var _sd = JSON.parse(lsGet(SEENK) || '{}') || {}; Object.keys(_sd).forEach(function(k){ SEENDOC[k] = 1; }); } catch (e) {}\n"
  "function dropSubDoc(ref, keep){\n"
  "  ref = s(ref); if (!ref) return; SEENDOC[ref] = 1; SDQ = SDQ.filter(function(z){ return z.ref !== ref; });\n"
  "  if (keep) { try { var o = JSON.parse(lsGet(SEENK) || '{}') || {}; o[ref] = Date.now(); var ks = Object.keys(o); if (ks.length > 300) ks.sort(function(x, y){ return o[x] - o[y]; }).slice(0, ks.length - 300).forEach(function(k){ delete o[k]; }); lsSet(SEENK, JSON.stringify(o)); } catch (e) {} }\n"
  "  paintPills();\n"
  "}")
au = once(au, "    var waiting = arr(j.items);\n",
  "    var waiting = arr(j.items).filter(function(w){ return !SEENDOC[w.ref]; });   /* patch COIAPPR: a confirmed / dismissed one does not come back from a slow list */\n")
au = once(au, """    var x = SDQ[+c.getAttribute('data-i')]; SEENDOC[x.ref] = 1;
    if (!x.pending) { confirmSubRead(ov, x, x.subId, null, null); return; }
    ov.body.innerHTML = '<div class="gcautai-msg">Reading…</div>';
    fn('sub-doc-read', { ref: x.ref, name: x.name, subId: x.subId, kind: /w-?9/i.test(s(x.cat) + s(x.name)) ? 'w9' : 'coi', source: 'sub-docs' }).then(function(j){
      if (!j.ok) { ov.body.innerHTML = '<div class="gcautai-msg gcautai-bad">⚠ ' + esc(j.error) + '</div>'; return; }
      confirmSubRead(ov, j.read, x.subId, null, { ref: x.ref, name: x.name });
    });
  };
}""", """    var x = SDQ[+c.getAttribute('data-i')];   /* patch COIAPPR: a tap no longer hides it — "Not now" leaves it waiting */
    subDocGo(ov, x);
  };
}
/* patch COIAPPR: one item — read it if nobody did yet, then the values to confirm (✅ Approvals opens this) */
function subDocGo(ov, x){
  if (!x.pending) { confirmSubRead(ov, x, x.subId, null, null); return; }
  ov.body.innerHTML = '<div class="gcautai-msg">Reading…</div>';
  fn('sub-doc-read', { ref: x.ref, name: x.name, subId: x.subId, kind: /w-?9/i.test(s(x.cat) + s(x.name)) ? 'w9' : 'coi', source: 'sub-docs' }).then(function(j){
    if (!j.ok) { ov.body.innerHTML = '<div class="gcautai-msg gcautai-bad">⚠ ' + esc(j.error) + '</div>'; return; }
    confirmSubRead(ov, j.read, x.subId, null, { ref: x.ref, name: x.name });
  });
}
function openSubDoc(ref){
  var x = SDQ.filter(function(z){ return z.ref === s(ref); })[0]; if (!x) return false;
  subDocGo(sheet('📄 COI / W-9 to confirm', ''), x); return true;
}""")
au = once(au, "  q('#_gcSdNo').onclick = function(){ if (rd.status === 'new' && (rd.kind !== 'coi' && rd.kind !== 'w9')) fn('sub-doc-read', { act: 'done', id: rd.id, dismiss: true }); ov.close(); };",
  "  q('#_gcSdNo').onclick = function(){ if (rd.status === 'new' && (rd.kind !== 'coi' && rd.kind !== 'w9')) fn('sub-doc-read', { act: 'done', id: rd.id, dismiss: true }); if (rd.kind !== 'coi' && rd.kind !== 'w9' && !form) dropSubDoc(s(rd.ref || (meta && meta.ref)), true); ov.close(); };   /* patch COIAPPR: not a COI / W-9 → off the list */")
au = once(au, """    var n1 = PM.list.filter(function(m){ return m.status === 'new'; }).length, n2 = SDQ.length;
    [['_gcPayPill', n1, '💵 ' + n1 + ' payment' + (n1 === 1 ? '' : 's') + ' match invoices', openPayMatches, 0], ['_gcSubDocPill', n2, '📄 ' + n2 + ' COI / W-9 to confirm', openSubDocs, 44]].forEach(function(c){""",
"""    var n1 = PM.list.filter(function(m){ return m.status === 'new'; }).length;
    /* patch COIAPPR (owner 11/19): no "📄 COI / W-9 to confirm" pill on any screen — the items are in ✅ Approvals */
    var sp = D.getElementById('_gcSubDocPill'); if (sp) sp.remove();
    try { var sg = SDQ.map(function(z){ return z.ref + (z.pending ? 'p' : 'r'); }).join('|'); if (sg !== W.__gcSdqSig) { W.__gcSdqSig = sg; D.dispatchEvent(new CustomEvent('gc:subdocs-changed', { detail: { n: SDQ.length } })); } } catch (e) {}
    [['_gcPayPill', n1, '💵 ' + n1 + ' payment' + (n1 === 1 ? '' : 's') + ' match invoices', openPayMatches, 0]].forEach(function(c){""")
au = once(au, "  subDocs: function(){ return SDQ.slice(); }, scanSubDocs: scanSubDocs,",
  "  subDocs: function(){ return SDQ.slice(); }, scanSubDocs: scanSubDocs, openSubDoc: openSubDoc, openSubDocs: openSubDocs, dropSubDoc: dropSubDoc,   /* patch COIAPPR */\n ")
src = src[:a] + au + src[b:]

# ── 2. APX: a module's row may replace the plain set row (drop: its key) ──
src = once(src, """  if (!sc.preview) arr(W._gcApxExtra).forEach(function(f){ try { var xs = arr(f(sc, now)); if (xs.some(function(r){ return /^bp:su:/.test(r.key); })) out = out.filter(function(r){ return !/bidsite_/.test(s(r.key)); }); xs.forEach(add); } catch (e) { warn(e); } });""",
"""  if (!sc.preview) arr(W._gcApxExtra).forEach(function(f){ try { var xs = arr(f(sc, now)); if (xs.some(function(r){ return /^bp:su:/.test(r.key); })) out = out.filter(function(r){ return !/bidsite_/.test(s(r.key)); });
    var dr = {}; xs.forEach(function(r){ if (r && r.drop) dr[s(r.drop)] = 1; }); if (Object.keys(dr).length) out = out.filter(function(r){ return !dr[s(r.key).replace(/#\\d+$/, '')]; });   /* patch COIAPPR: the rich row replaces the plain set row */
    xs.forEach(add); } catch (e) { warn(e); } });""")

src = once(src, "r.src !== 'bp' && denyTo(r) !== null", "r.src !== 'bp' && r.src !== 'coi' && denyTo(r) !== null")   # no ✕ Deny on a COI row (Read & confirm has Not now / Close)

# ── 4. ONELIST: two copies of a sub's file (vendors / subs / the screen) — the "read" mark of either copy is kept ──
src = once(src, "        if(seen[fk]) return; seen[fk] = 1; files.push(f);",
  "        if(seen[fk]){ var i0 = seen[fk] - 1, f0 = files[i0]; if(f && f.aiRead && f0 && !f0.aiRead) files[i0] = Object.assign({}, f0, { aiRead: f.aiRead, readBy: f.readBy, readAt: f.readAt }); return; }   /* patch COIAPPR: a confirmed COI / W-9 stays confirmed */\n"
  "        seen[fk] = files.length + 1; files.push(f);")

# ── 3. the block, right after patch BPAPPR ──
BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coiappr_block.html'), encoding='utf-8').read().rstrip('\n')
a = src.index('<script id="gc-patch-bpappr">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]
open(path, 'w', encoding='utf-8').write(src)
print('patched')
