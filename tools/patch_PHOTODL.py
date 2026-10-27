#!/usr/bin/env python3
"""Idempotent patch PHOTODL: download photos from GrayCo Photos, CompanyCam-style.

  viewer       a "Download" chip: the full-size picture, named <project>_<YYYY-MM-DD>_<HHMM>_<n>.jpg
  project page "Download all" (optional date range + tag) and "Select" mode (tap photos, "Select all on this day",
               "Download selected (N)"; on a phone "Save to Photos" for up to 20)
  many photos  one ZIP <project>_photos_<date>.zip: a folder per day + photos.csv; 4 at a time, one retry, progress bar,
               Cancel, failures listed; JSZip 3.10.1 (cdnjs, pinned + SRI) loaded only when a ZIP is built
  server       companycam-webhook ?proxy=img&url=  (staff sign-in, CompanyCam image hosts only, 15 MB cap) — fallback when the
               browser may not read the image CDN directly
  activity     "<person> downloaded N photos from <project>" in the Photos Activity tab (kept on this computer)

Code lives in tools/photodl_js.js, tools/photodl.css, tools/photodl_fn.js. Needs patch PHOTOS2 first.
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_PHOTODL.py [index.html] [netlify/functions/companycam-webhook.js]
"""
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
fpath = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'netlify/functions/companycam-webhook.js')
MARK = '__GC_PATCH_PHOTODL__'

def rd(p): return open(p, encoding='utf-8').read()
def once(src, old, new, label):
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    return src.replace(old, new)

# ── server ──
fsrc = rd(fpath)
if 'patch PHOTODL' in fsrc:
    print('function already patched')
else:
    FN = rd(os.path.join(HERE, 'photodl_fn.js'))
    fsrc = once(fsrc, "// Netlify function — CompanyCam integration:\n", FN + "// Netlify function — CompanyCam integration:\n", 'fn helpers')
    fsrc = once(fsrc, "// 8. GET  ?proxy=pending :", "// 9. GET  ?proxy=img&url=<CompanyCam image link> : one picture, staff only (patch PHOTODL)\n// 8. GET  ?proxy=pending :", 'fn doc')
    fsrc = once(fsrc, "  // GET ?proxy=api — proxy CompanyCam read calls from the browser\n",
        "  // GET ?proxy=img — patch PHOTODL: one CompanyCam picture for the download button (staff check ran above)\n"
        "  if(event.httpMethod === 'GET' && qs.proxy === 'img'){\n    return await ccImgProxy(qs.url, headers);\n  }\n\n"
        "  // GET ?proxy=api — proxy CompanyCam read calls from the browser\n", 'fn route')
    open(fpath, 'w', encoding='utf-8').write(fsrc)
    print('patched', fpath)

# ── page ──
src = rd(path)
if MARK in src:
    print('already patched'); sys.exit(0)
assert '__GC_PATCH_PHOTOS2__' in src, 'patch PHOTOS2 must be applied first'
JS = rd(os.path.join(HERE, 'photodl_js.js')).rstrip('\n')
CSS = rd(os.path.join(HERE, 'photodl.css')).strip('\n')
JS = JS.replace('__DL_CSS__', json.dumps(CSS))
# 1. code + css
src = once(src, "function vProjectsOld(){\n", JS + "\nfunction vProjectsOld(){\n", 'code')
src = once(src, "].join('\\n') + pvCss();", "].join('\\n') + pvCss() + dlCss();", 'css')
# 2. CompanyCam originals are kept for the download
src = once(src, "fullUrl: full, at: at,", "fullUrl: full, origUrl: by.original || '', at: at,", 'ccMap original')
# 3. viewer: Download chip
src = once(src, "h += '<div class=\"gcu-pchips\">' + (cc ? '<span class=\"gcu-pc\" style=\"background:' + CCBLUE + ';display:flex;align-items:center\">CompanyCam</span>' : '') +",
    "h += '<div class=\"gcu-pchips\">' + (cc ? '<span class=\"gcu-pc\" style=\"background:' + CCBLUE + ';display:flex;align-items:center\">CompanyCam</span>' : '') +\n    '<button class=\"gcu-pc dl-one\" data-a=\"dlone\" aria-label=\"Download this photo\">⬇ Download</button>' +", 'viewer chip')
src = once(src, "  if (a === 'addrep') {", "  if (a === 'dlone') return dlOne(r);\n  if (a === 'addrep') {", 'viewer handler')
# 4. project page: toolbar, per-day select button, tiles with a check, action bar
src = once(src, "h += '<div class=\"gcu-pad\" style=\"gap:12px\"><div class=\"gcu-chips\" role=\"group\" aria-label=\"Filter by tag\">'",
    "h += '<div class=\"gcu-pad\" style=\"gap:12px\">' + dlBar(it, list) + '<div class=\"gcu-chips\" role=\"group\" aria-label=\"Filter by tag\">'", 'job toolbar')
src = once(src, "esc(Object.keys(who).slice(0, 3).join(', ')) + '</span></div><div class=\"gcu-grid\">' +",
    "esc(Object.keys(who).slice(0, 3).join(', ')) + '</span>' + dlDayBtn(k, l) + '</div><div class=\"gcu-grid\">' +", 'job day button')
src = once(src, "      l.map(tileHtml).join('') + '</div></div>';", "      l.map(dlTile).join('') + '</div></div>';", 'job tiles')
src = once(src, "  return h + '</div></div>';\n}\nfunction tileHtmlOld(r){", "  return h + '</div>' + dlActionBar() + '</div>';\n}\nfunction tileHtmlOld(r){", 'job action bar')
src = once(src, "(S.screen === 'job' && S.jobTab === 'photos'); }\nfunction composeMode", "(S.screen === 'job' && S.jobTab === 'photos' && !dlOn()); }\nfunction composeMode", 'fab')
# 5. events
src = once(src, "    case 'photo': closeLayer(); var r0 = photoById(id);", "    case 'photo': if (dlOn()) return dlPick(id); closeLayer(); var r0 = photoById(id);", 'photo tap')
src = once(src, "    case 'closelayer': return closeLayer();", "    case 'closelayer': DL.share = null; return closeLayer();", 'closelayer')
src = once(src, "    case 'job': closeLayer(); return go('job', {", "    case 'job': S.dlm = false; closeLayer(); return go('job', {", 'job card')
src = once(src, "    case 'pdf': return doPdf();",
    "    case 'dlsel': S.dlm = true; S.dlJob = S.jobId; S.dsel = {}; return render();\n"
    "    case 'dlexit': S.dlm = false; S.dsel = {}; return render();\n"
    "    case 'dlall': return dlSelAll(true);\n"
    "    case 'dlclr': return dlSelAll(false);\n"
    "    case 'dlday': return dlDay(v);\n"
    "    case 'dlopen': return dlOpenSheet();\n"
    "    case 'dlftag': dlF().tag = v; return dlSheetPaint();\n"
    "    case 'dlgo': return dlSheetGo('zip');\n"
    "    case 'dlshare': return dlSheetGo('share');\n"
    "    case 'dlsegdl': return dlStart(dlSelected(), 'zip');\n"
    "    case 'dlsegshare': return dlStart(dlSelected(), 'share');\n"
    "    case 'dlcancel': return dlCancel();\n"
    "    case 'dlshgo': return dlShareNow();\n"
    "    case 'pdf': return doPdf();", 'events')
src = once(src, "  if (t.id === 'gcu-reptitle') {", "  if (t.id === 'gcu-dlf' || t.id === 'gcu-dlt') { dlF()[t.id === 'gcu-dlf' ? 'from' : 'to'] = s(t.value); return dlSheetPaint(); }\n  if (t.id === 'gcu-reptitle') {", 'date inputs')
# 6. Activity
src = once(src, "  arr(jGet('gcu_stage_ev', [])).forEach(function(e){ if (s(e.at) >= cut)",
    "  arr(jGet('gcu_dl_ev', [])).forEach(function(e){ if (s(e.at) >= cut) out.push({ type: 'download', id: e.id, at: e.at, who: e.by || 'Someone', whoKey: e.byKey, jobId: e.jobId, what: 'downloaded ' + e.n + ' photo' + (e.n === 1 ? '' : 's') + ' from' }); });\n"
    "  arr(jGet('gcu_stage_ev', [])).forEach(function(e){ if (s(e.at) >= cut)", 'activity')
assert src.count(MARK) == 1, src.count(MARK)
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
