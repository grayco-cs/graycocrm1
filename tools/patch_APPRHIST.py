#!/usr/bin/env python3
"""patch APPRHIST — ✅ Approvals → 🕘 Recently approved shows EVERY kind of approval decision (the newest 8) and a
"📜 All approvals history (N)" button → a history screen in the page (sort / filter / load more).

  python3 tools/patch_APPRHIST.py [index.html]

The page code is tools/apprhist_tail.js (a new script right after the APPRNOSEND script). Small hooks, each marked
/* patch APPRHIST */ inside a JS comment:
  · APX recent(): each row carries its item key; tabHtml: the Recently approved block comes from window._gcApprHist;
    window._gcAPX gets kindLabel.
  · the decisions nothing recorded before: 🧱 bid-site material requests (BIDSITE3 decide), 🛡 COI / 🧾 W-9 confirmed
    (AUTAI applySubRead) and denied (COIAPPR doDeny), 🏖 time off (TIMEOFF decide).
The server side (appr-away op history, the archive) is netlify/functions/_lib/apprping.js.
Every anchor must occur exactly once; a re-run prints "already patched".
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
MARK = '/* patch APPRHIST */'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_APPRHIST__' in src:
    print('already patched'); sys.exit(0)
assert 'APPRHIST' not in src, 'the mark is already used'
tail = open(os.path.join(HERE, 'apprhist_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script' not in tail.lower()

def once(a, b):
    global src
    n = src.count(a)
    assert n == 1, ('anchor count', n, a[:90])
    src = src.replace(a, b)

# ── APX: the key on each Recently approved row ──
once("    out.push({ t: t, icon: x.status === 'rejected' ? '✖' : '✅', title: s(x.title) || kindLabel(x.kind),",
     "    out.push({ key: 'ap2:' + s(x.id), t: t, icon: x.status === 'rejected' ? '✖' : '✅', title: s(x.title) || kindLabel(x.kind),   " + MARK)
once("    out.push({ t: t, icon: ok ? '✅' : '✖', title: 'Sub invoice — ' + (s(a.sub) || 'Sub') + ' ' + money(a.amt), job: jobLine(p, ''), pid: s(a.pid),",
     "    out.push({ key: 'sub:' + s(a.invId || a.id), t: t, icon: ok ? '✅' : '✖', title: 'Sub invoice — ' + (s(a.sub) || 'Sub') + ' ' + money(a.amt), job: jobLine(p, ''), pid: s(a.pid),   " + MARK)
# ── APX tabHtml: the block from the one record ──
once("  var rec = recent(sc, now);\n  h += '<div class=\"apx-rh\">🕘 Recently approved <span>(14 days — who approved each step, and when)</span></div>'",
     "  var rec = recent(sc, now), rh = ''; try { rh = W._gcApprHist ? W._gcApprHist.recentHtml(sc, now, rec) : ''; } catch (e) { warn(e); rh = ''; }   " + MARK + "\n"
     "  if (rh) return h + rh + '</div>';\n"
     "  h += '<div class=\"apx-rh\">🕘 Recently approved <span>(14 days — who approved each step, and when)</span></div>'")
once("  open: open, draw: function(){ fresh(); tick(true); }, recent: function(){ return recent(scope(), Date.now()); } };",
     "  open: open, draw: function(){ fresh(); tick(true); }, recent: function(){ return recent(scope(), Date.now()); }, kindLabel: kindLabel };   " + MARK)
# ── 🧱 bid-site material requests ──
once("      MR.list = MR.list.filter(function(r){ return r.id !== id; }); fresh();",
     "      try { if (W._gcApprHist) W._gcApprHist.log({ key: 'bp:mr:' + s(id), src: 'bp', kind: 'Material request', title: '🧱 ' + s(x.userCompany) + ' — ' + what(x) + (s(x.jobTitle) ? ' — ' + s(x.jobTitle) : ''), pid: s(x.crmProjectId), job: s(x.jobTitle), decision: act === 'approve' ? 'approved' : 'denied', note: s(note) }); } catch (e) {}   " + MARK + "\n"
     "      MR.list = MR.list.filter(function(r){ return r.id !== id; }); fresh();")
# ── 🛡 COI / 🧾 W-9 confirmed (the Read & confirm sheet) ──
once("  log({ what: 'subdoc', kind: rd.kind, sub: sid });\n",
     "  try { if (W._gcApprHist) { var _hm = /([0-9a-f]{64})/i.exec(s(file.ref)); W._gcApprHist.log({ key: 'coi:subdoc_' + (_hm ? _hm[1].slice(0, 20) : s(file.ref).replace(/[^A-Za-z0-9]/g, '').slice(-24)), src: 'coi', kind: 'Sub COI / W-9', title: (rd.kind === 'w9' ? '🧾 W-9' : '🛡 COI') + ' confirmed — ' + s(sb.name) + ': ' + s(file.name), decision: 'approved' }); } } catch (e) {}   " + MARK + "\n"
     "  log({ what: 'subdoc', kind: rd.kind, sub: sid });\n")
# ── 🛡 COI / 🧾 W-9 denied ──
once("  fresh();\n  var body = { act: 'reject', id: it.readId, ref: it.ref, subId: it.subId, kind: it.kind, reason: reason,",
     "  try { if (W._gcApprHist) W._gcApprHist.log({ key: 'coi:' + it.id, src: 'coi', kind: 'Sub COI / W-9', title: (it.kind === 'w9' ? '🧾 W-9' : '🛡 COI') + ' denied — ' + it.sub + ': ' + it.file, decision: 'denied', note: reason }); } catch (e) {}   " + MARK + "\n"
     "  fresh();\n  var body = { act: 'reject', id: it.readId, ref: it.ref, subId: it.subId, kind: it.kind, reason: reason,")
# ── 🏖 time off ──
once("    toast((ok ? '✅ Approved' : '✖ Denied') + ' — ' + first(x.name) + ' sees it now.');",
     "    try { if (W._gcApprHist) W._gcApprHist.log({ key: 'td:to:' + x.id, src: 'other', kind: 'Time off', title: '🏖 Time off: ' + x.name + ' · ' + rangeTxt(x.from, x.to), decision: ok ? 'approved' : 'denied', note: x.decisionNote }); } catch (e) {}   " + MARK + "\n"
     "    toast((ok ? '✅ Approved' : '✖ Denied') + ' — ' + first(x.name) + ' sees it now.');")

# ── the script itself: right after the APPRNOSEND script ──
a = '<script id="gc-patch-apprnosend">'
assert src.count(a) == 1
end = src.index('</script>', src.index(a)) + len('</script>')
assert src[end:end + 1] == '\n'
src = src[:end + 1] + '<script id="gc-patch-apprhist">\n' + MARK + '\n' + tail + '\n</script>\n' + src[end + 1:]
assert src.count('<script id="gc-patch-apprhist">') == 1
open(path, 'w', encoding='utf-8').write(src)
print('APPRHIST applied')
