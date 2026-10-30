#!/usr/bin/env python3
"""Idempotent patch PHOTOSPM: whose projects the GrayCo Photos home shows.

  PM           only the projects where they are the job's PM (job.pm vs. this person, window._gcSamePM — the CRM's own
               rule): Jump Back In, Live Photo Feed (+ View All), All projects, section chips and counts, search, Map, Activity
  admin/office every project, plus a PM switcher under the greeting: "All PMs" · one chip per PM (with a count) · "No PM"
               (jobs whose PM is empty or not a current person); the pick is remembered on this computer
               (localStorage gcu_pmf:<me>), default All PMs
               and "PM: <name> ▾" on each job card and the job's photo page: sets job.pm for the whole CRM, through the
               same setter + stamp as the job panel's Edit Project → PM → Save (window._setProjects); a PM never sees it
  other roles  unchanged (every project)

Display only: items(), the photo / chat sync, the CompanyCam fetches, uploads, the sub portal and the customer "shared" flag
never read the pick. Derived lists are memoized on pvVer (patch PHOTOS2); no timers, no observers.
Code lives in tools/photospm_js.js and tools/photospm.css. Needs patches PHOTOS2 and PHOTODL first.
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_PHOTOSPM.py [index.html]
"""
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_PHOTOSPM__'

def rd(p): return open(p, encoding='utf-8').read()
src = rd(path)
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_PHOTOS2__' in src and '__GC_PATCH_PHOTODL__' in src, 'patches PHOTOS2 and PHOTODL must be applied first'
JS = rd(os.path.join(HERE, 'photospm_js.js')).rstrip('\n')
CSS = rd(os.path.join(HERE, 'photospm.css')).strip('\n')
JS = JS.replace('__PM_CSS__', json.dumps(CSS))

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

# 1. code + css
once("function vProjectsOld(){\n", JS + "\nfunction vProjectsOld(){\n", 'code')
once("].join('\\n') + pvCss() + dlCss();", "].join('\\n') + pvCss() + dlCss() + pmCss();", 'css')
once("   Visibility is unchanged: only projects that items() returns (the CRM's own list for this person) are used. */",
     "   Visibility: only projects that items() returns, narrowed by patch PHOTOSPM (a PM: their own jobs; an admin: the PM picked). */", 'PHOTOS2 note')
# 2. the home's derived data is made from the scoped list (its memo key carries the scope)
once("  var its = items(), k = pvVer + '|' + its.length;\n  if (pvMemo && pvMemo.k === k) return pvMemo;",
     "  var sc = pmScope(items()), its = sc.list, k = sc.k;   /* patch PHOTOSPM */\n  if (pvMemo && pvMemo.k === k) return pvMemo;", 'pvData scope')
once("  pvMemo = { k: k, ids: ids, items: its,", "  pvMemo = { k: k, sc: sc, ids: ids, items: its,", 'pvData memo')
# 3. the switcher: under the greeting, above the search results, on the full feed
once("<small>Here is what is happening across your projects.</small></h1>';",
     "<small>' + esc(pmSub(d)) + '</small></h1>' + pmBar(d);", 'greeting + bar')
once("  return h + pvAll(d, q) + '</div>';", "  return h + (q ? pmBar(d) : '') + pvAll(d, q) + '</div>';", 'search bar')
once("<div class=\"pv-h\"><h2>Live Photo Feed</h2><span class=\"pv-ct\">Newest first</span></div>' +",
     "<div class=\"pv-h\"><h2>Live Photo Feed</h2><span class=\"pv-ct\">Newest first</span></div>' + pmBar(d) +", 'feed all bar')
# 4. a PM's Map and Activity: their own projects
once("function mapItems(){ return items().filter(", "function mapItems(){ return pmOwn().filter(", 'map items')
once("    items().filter(function(it){ return it.address; }).slice(0, 80).map(", "    pmOwn().filter(function(it){ return it.address; }).slice(0, 80).map(", 'map list')
once("  out.sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; });\n  return limit ? out.slice(0, limit) : out;\n}",
     "  out = pmOnly(out);   /* patch PHOTOSPM */\n  out.sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; });\n  return limit ? out.slice(0, limit) : out;\n}", 'activity')
once("  var jobs = {}; ph.forEach(function(r){ jobs[r.jobId] = 1; });", "  ph = pmOnly(ph);   /* patch PHOTOSPM */\n  var jobs = {}; ph.forEach(function(r){ jobs[r.jobId] = 1; });", 'today photos')
once("  var missing = items().filter(function(it){ if (it.kind !== 'job') return false;", "  var missing = pmOwn().filter(function(it){ if (it.kind !== 'job') return false;", 'today missing')
# 5. admins set a job's PM: on the All projects cards and the job's photo page
once("shown.map(function(it){ return pvCard(it, d, false); }).join('')", "shown.map(function(it){ return pmCard(it, d); }).join('')", 'card picker')
once("  h += '<div class=\"gcu-pad\" style=\"gap:12px\">' + dlBar(it, list) +", "  h += '<div class=\"gcu-pad\" style=\"gap:12px\">' + pmPick(it, 'pv-pmjob') + dlBar(it, list) +", 'job picker')
once("  if (t.hasAttribute && t.hasAttribute('data-psort')) {",
     "  if (t.hasAttribute && t.hasAttribute('data-pmset')) { var pj = t.getAttribute('data-pmset'), pv = t.value; t.blur(); return pmAssign(pj, pv); }\n  if (t.hasAttribute && t.hasAttribute('data-psort')) {", 'onChange pm')
# 6. events
once("    case 'fmore': S.fm += 40; return renderMain();",
     "    case 'fmore': S.fm += 40; return renderMain();\n"
     "    case 'pmf': pmfSet(v); S.pm = 24; S.fm = 40; return renderMain();", 'pmf')
assert src.count(MARK) == 1, src.count(MARK)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
