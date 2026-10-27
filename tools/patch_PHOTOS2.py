#!/usr/bin/env python3
"""Idempotent patch PHOTOS2: GrayCo Photos tab redesign (CompanyCam-style home).

  greeting · Jump Back In (recently viewed / added-to projects) · Live Photo Feed (newest photos, View All) ·
  All projects (search, section filter, sort, Load more) · rounded day-grouped tiles inside a project · skeletons / empty states.

Code lives in tools/photos2_js.js and tools/photos2.css (inlined here); every find-string must occur exactly once.
Usage: python3 tools/patch_PHOTOS2.py [index.html]
"""
import sys, os, json
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
MARK = '__GC_PATCH_PHOTOS2__'
if MARK in src:
    print('already patched'); sys.exit(0)
JS = open(os.path.join(HERE, 'photos2_js.js'), encoding='utf-8').read().rstrip('\n')
CSS = open(os.path.join(HERE, 'photos2.css'), encoding='utf-8').read().strip('\n')
JS = JS.replace('__PV_CSS__', json.dumps(CSS))

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

# 1. css appended to the module's stylesheet
once("{visibility:hidden!important}'\n].join('\\n');", "{visibility:hidden!important}'\n].join('\\n') + pvCss();", 'css join')
# 2. state
once("sel: null, more: 30, mapPick: '', reportId: '' };", "sel: null, more: 30, pm: 24, fm: 40, feedAll: false, psort: 'recent', mapPick: '', reportId: '' };", 'state')
# 3. old home / tile / header kept as dead code under new names, new ones inserted ahead of them
once('function cardHtml(it, idx){', 'function cardHtmlOld(it, idx){', 'cardHtml')
once('function tileHtml(r){', 'function tileHtmlOld(r){', 'tileHtml')
once('function vProjects(){\n  var idx = photoIndex()', JS + '\nfunction vProjectsOld(){\n  var idx = photoIndex()', 'vProjects (+ new code)')
once('function headHtml(){\n  var right = syncPill(inner())', 'function headHtmlOld(){\n  var right = syncPill(inner())', 'headHtml')
# 4. light theme on the screens that use it
once("  setHTML(root.querySelector('.gcu-hd'), headHtml());\n  setHTML(root.querySelector('.gcu-nav'), navHtml());",
     "  var pvLt = ['projects', 'map', 'activity', 'team', 'job'].indexOf(S.screen) >= 0;\n  root.classList.toggle('gcu-lt', pvLt); root.querySelector('.gcu-hd').classList.toggle('lt', pvLt);\n"
     "  setHTML(root.querySelector('.gcu-hd'), headHtml());\n  setHTML(root.querySelector('.gcu-nav'), navHtml());", 'render')
# 5. derived data is re-made after any change event, never on a timer
once("function emit(k){ emitKeys[k || 'any'] = 1;", "function emit(k){ pvVer++; emitKeys[k || 'any'] = 1;", 'emit')
# 6. photos shown in the feed (not in a per-project list) can still be opened in the viewer
once("function photoById(id){ if (PH.map[id]) return PH.map[id];", "function photoById(id){ if (PH.map[id]) return PH.map[id]; if (ccFeed.map[id]) return ccFeed.map[id];", 'photoById')
# 7. "viewed" for Jump Back In
once("  if (screen === 'job' && S.jobId) { ccLoad(S.jobId); }", "  if (screen === 'job' && S.jobId) { ccLoad(S.jobId); pvMarkViewed(S.jobId); }", 'go viewed')
once("filter: 'All', shots: [], camPick: false }); ccLoad(String(jobId)); }", "filter: 'All', shots: [], camPick: false }); ccLoad(String(jobId)); pvMarkViewed(jobId); }", 'open viewed')
# 8. boot: skeleton until the local store is read; one feed fetch per open
once("  render(); pullSoon(300); ccProjectsRefresh(); rtConnect();\n  return true;\n}\nfunction tabGone",
     "  pvBoot(); render(); pullSoon(300); ccProjectsRefresh(); pvFeedLoad(); rtConnect();\n  return true;\n}\nfunction tabGone", 'mountTab')
once("  render();\n  pullSoon(300); ccProjectsRefresh(); rtConnect();\n  return true;\n}\nfunction close(){",
     "  pvBoot(); render();\n  pullSoon(300); ccProjectsRefresh(); pvFeedLoad(); rtConnect();\n  return true;\n}\nfunction close(){", 'open')
# 9. events
once("    case 'tab': S.more = 30; return go(v);", "    case 'tab': S.more = 30; S.pm = 24; S.fm = 40; S.feedAll = false; return go(v);", 'tab')
once("    case 'sec': S.section = v; S.more = 30;", "    case 'sec': S.section = v; S.more = 30; S.pm = 24;", 'sec')
once("    case 'more': S.more += 30; return renderMain();",
     "    case 'more': S.more += 30; S.pm += 24; return renderMain();\n"
     "    case 'fmore': S.fm += 40; return renderMain();\n"
     "    case 'feedall': S.feedAll = true; S.fm = 40; renderMain(); if (mainEl) mainEl.scrollTop = 0; return;\n"
     "    case 'feedback': S.feedAll = false; renderMain(); if (mainEl) mainEl.scrollTop = 0; return;\n"
     "    case 'rail': var rl = root.querySelector('#' + v); if (rl) rl.scrollBy({ left: (+b.getAttribute('data-d') || 1) * Math.max(160, rl.clientWidth * 0.85), behavior: 'smooth' }); return;", 'more')
once("S.q = t.value; S.more = 30; renderMain(); return; }", "S.q = t.value; S.more = 30; S.pm = 24; renderMain(); return; }", 'search')
once("  var t = ev.target; if (!t || !root.contains(t)) return;\n  if (t.id === 'gcu-capf'",
     "  var t = ev.target; if (!t || !root.contains(t)) return;\n  if (t.hasAttribute && t.hasAttribute('data-psort')) { S.psort = t.value; S.pm = 24; t.blur(); return renderMain(); }\n  if (t.id === 'gcu-capf'", 'onChange')
assert src.count(MARK) == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
