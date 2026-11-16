#!/usr/bin/env python3
"""Idempotent patch FIELDPERF: GrayCo Field answers a tap at once on a phone (owner 11/16: "It's lagging very bad").
Measured on an emulated iPhone (CPU x4, a company-sized made-up data set) — see tools/tests/test_FIELDPERF.mjs.
1. tools/fieldperf_early.js → <script id="gc-patch-fieldperf-early"> right after DEVMODE's early script: window.__gcById
   (a record by id from an index kept per list, the same answer as list.filter(id)[0]).
2. The hot loops that scanned a whole list once per row of another list use it (each edit tagged FIELDPERF).
Usage: python3 tools/patch_FIELDPERF.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()
orig = t
def block(tag, fname, before=None, after=None):
    global t
    js = open(os.path.join(HERE, fname), encoding='utf-8').read()
    assert '</script' not in js.lower(), fname
    TAG = '<script id="' + tag + '">'
    if TAG in t:
        assert t.count(TAG) == 1
        i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
        if t[i:j] != js: t = t[:i] + js + t[j:]; print('FIELDPERF:', tag, 'updated')
        return
    if before:
        b = t.index(before); t = t[:b] + TAG + '\n' + js + '</script>\n' + t[b:]
    else:
        b = t.index(after); e = t.index('</script>\n', b) + len('</script>\n')
        t = t[:e] + TAG + '\n' + js + '</script>\n' + t[e:]
    print('FIELDPERF:', tag, 'added')
block('gc-patch-fieldperf-early', 'fieldperf_early.js', before='<script id="gc-patch-fieldboot">')

SKIP = [x for x in os.environ.get('FP_SKIP', '').split(',') if x]   # (testing) leave out the edits whose name has one of these
def sub(name, old, new, count=1):
    global t
    if any(x in name for x in SKIP): print('FIELDPERF: skipped', name); return
    if new in t: return
    assert t.count(old) == count, ('FIELDPERF anchor', name, t.count(old))
    t = t.replace(old, new); print('FIELDPERF:', name)

# AP3: the Field job list's ✉️ — a job looked up by id (was a scan of every job per row, every 1.5 s), a row looked at once
sub('AP3 fieldCards',
    "    var it = items[i]; if(it.querySelector('._gcMailIco')) continue;\n    var id = it.getAttribute('data-id'), job = projects().filter(function(p){ return p && String(p.id) === String(id); })[0];\n    var to = job && (job.clientEmail || job.customerEmail); if(!to) continue;",
    "    var it = items[i]; if(it.getAttribute('data-gc-ap3') === (it.getAttribute('data-id') || '') || it.querySelector('._gcMailIco')) continue;   /* FIELDPERF: a row already looked at */\n    var id = it.getAttribute('data-id'), job = window.__gcById ? window.__gcById(projects(), id) : projects().filter(function(p){ return p && String(p.id) === String(id); })[0];   /* FIELDPERF: by id, not a scan per row */\n    var to = job && (job.clientEmail || job.customerEmail); if(!to) { if(job) it.setAttribute('data-gc-ap3', id || ''); continue; }")
# DATAFULL: proj(pid) inside topJobs (Field home: "My jobs missing data", every 1.2 s)
sub('DATAFULL proj',
    "function proj(pid){ return arr(C().projects).filter(function(p){ return s(p.id) === s(pid); })[0] || null; }\nfunction checkOne(pid)",
    "function proj(pid){ if (W.__gcById && Array.isArray(C().projects)) return W.__gcById(C().projects, pid);   /* FIELDPERF: by id (was a copy + scan of every job per job) */ return arr(C().projects).filter(function(p){ return s(p.id) === s(pid); })[0] || null; }\nfunction checkOne(pid)")
# SUBINV / APOFFICE2: subCostExp per expense approval (every approval count)
sub('SUBINV subCostExp',
    "function subCostExp(id){ var e = arr(crm().expenses).filter(function(x){ return s(x.id) === s(id); })[0];",
    "function subCostExp(id){ var e = W.__gcById && Array.isArray(crm().expenses) ? W.__gcById(crm().expenses, id) : arr(crm().expenses).filter(function(x){ return s(x.id) === s(id); })[0];   /* FIELDPERF: by id */")

# NAV: sync() (every 0.7 s and on every change) measured every screen layer twice (topLayer() is layers() again)
sub('NAV sync: one pass over the layers',
    "  var t = topLayer(), html = D.documentElement;\n  var l = layers();",
    "  var l = layers(), t = l.length ? l[l.length - 1] : null, html = D.documentElement;   /* FIELDPERF: one pass (topLayer() measured them all again) */")

# (SAFENET on a phone — the safety-net copies kept in memory, 10-minute writes — is left out of this release: with every
# other FIELDPERF edit it made test_FIELDPORTAL's "👤 Customer on the open job" check fail 3 of 3; without it 3 of 3 pass.)

# FIELD home: a re-render (new data) replaced the whole home — the role app's own parts (the admin's "All jobs" list, the
# role's quick buttons, patch ROLEAPPS) went with it and came back only when ROLEAPPS' (paced) page watcher ran again,
# up to 1.5 s later while the finger was on the screen, and the page jumped to the top meanwhile: "the all jobs were
# lagging, not showing and showing". Those parts are carried over into the new home at once, and the scroll stays.
sub('FIELD render keeps the role app parts and the scroll',
    "  el.innerHTML = h; paintSync(); paintTabs(m.n);",
    "  var _fpTop = el.querySelector('.fh-wrap > .gc-ra-top'), _fpBot = el.querySelector('.fh-wrap > .gc-ra-bot'), _fpSt = el.scrollTop;   /* FIELDPERF */\n"
    "  el.innerHTML = h;\n"
    "  try { var _fpW = el.querySelector('.fh-wrap'); if (_fpW) { if (_fpTop) { _fpW.insertBefore(_fpTop, _fpW.firstChild); var _fpTl = _fpW.querySelector('.fh-tiles'); if (_fpTl && !_fpTl.children.length) _fpTl.style.display = 'none'; } if (_fpBot) _fpW.appendChild(_fpBot); } if (_fpSt) el.scrollTop = _fpSt; } catch (e) {}   /* FIELDPERF: no flash, no jump */\n"
    "  paintSync(); paintTabs(m.n);")
# ROLEAPPS "All jobs": never blanks while the jobs are (re)loading
sub('ROLEAPPS All jobs keeps the last list while the jobs load',
    "  var L = jobsOf('admin').list, CAP = 30;",
    "  var L = jobsOf('admin').list, CAP = 30;\n  if (!L.length && !arr(C().projects).length && LASTBOT) return LASTBOT;   /* FIELDPERF: the jobs are not there for a moment (a reload): keep the list shown */")
sub('ROLEAPPS remembers the last All jobs',
    "    if (bh) { if (!bot) { bot = D.createElement('div'); bot.className = 'gc-ra-bot'; wrap.appendChild(bot); } if (bot.__h !== bh) { bot.innerHTML = bh; bot.__h = bh; } }",
    "    if (bh) { LASTBOT = bh; if (!bot) { bot = D.createElement('div'); bot.className = 'gc-ra-bot'; wrap.appendChild(bot); } if (bot.__h !== bh) { bot.innerHTML = bh; bot.__h = bh; } }   /* FIELDPERF: LASTBOT */")
sub('ROLEAPPS LASTBOT var',
    "var homeObs = null, homeEl = null, injecting = false;",
    "var homeObs = null, homeEl = null, injecting = false, LASTBOT = '';   /* FIELDPERF */")
# AUTO8 tvNumbers (the Field home's THIS WEEK / NEW LEADS / JOBS GOING tiles, the role apps' money line, the TV): every
# lead, job and invoice counted again on each home re-render (every tap, every data change, every role-app pass). The
# company numbers (no person given) are kept while the same lists are loaded, for 15 s at most; approvals stay live.
sub('AUTO8 tvNumbers kept while the lists are the same',
    "  tv: tv, tvNumbers: tvNumbers, gc: {",
    "  tv: tv, tvNumbers: (function(){ var M = null; return function(sc){   /* FIELDPERF */\n"
    "    if (sc) return tvNumbers(sc);\n"
    "    var c = crm(), k = [c.projects, c.leads, c.invoices, c.invs, W._gcLeadsState], n = Date.now(), d = today();\n"
    "    if (!(M && n - M.at < 15000 && n >= M.at && M.d === d && k.every(function(x, i){ return x === M.k[i]; }))) M = { k: k, at: n, d: d, v: tvNumbers() };\n"
    "    var v = Object.assign({}, M.v); try { v.appr = typeof W._gcApprovalCount === 'function' ? num(W._gcApprovalCount()) : 0; } catch (e) {} return v;\n"
    "  }; })(), gc: {")
# FIELD home: a re-render while a finger is on the screen replaced the card under it — the tap was lost ("I tap and
# nothing happens"). A re-render that comes within 0.8 s of a touch waits until the finger is off (a first draw does not).
sub('FIELD render waits for the finger',
    "function render(force){\n  var el = D.getElementById('_gcJobPick'); if (!el || !el.classList.contains('gc-fh')) return;",
    "function render(force){\n  var el = D.getElementById('_gcJobPick'); if (!el || !el.classList.contains('gc-fh')) return;\n"
    "  if (el.firstChild && W.__gcFpTouch && Date.now() - W.__gcFpTouch() < 800) { render.__fpF = render.__fpF || !!force; if (!render.__fpQ) render.__fpQ = later(function(){ var f = render.__fpF; render.__fpQ = 0; render.__fpF = false; if (f) lastSig = ''; render(f); }, 850); return; }   /* FIELDPERF: not under the finger */")
# FIELD schedToday(p): every job looked through the whole schedule (the company's day on an admin's / the office's home:
# every active job × every schedule row, on every home re-render and every role-app pass). One pass per schedule list and
# day builds job → today's rows; the same rows, in the same order.
sub('FIELD schedToday: one pass per schedule list',
    "function schedToday(p){\n  var t = today();\n  return arr(window._gcSchedVisible(C().schedule)).filter(function(x){\n    if (!x || x.deleted || s(x.pid || x.projectId || x.jobId) !== s(p.id)) return false;\n    var d = s(x.date), a = s(x.start || x.startDate) || d, b = s(x.end || x.endDate) || a;\n    return d ? d === t : (a && a <= t && t <= b);\n  });\n}",
    "var _fpST = { L: null, t: '', m: null };   /* FIELDPERF */\n"
    "function schedToday(p){\n  var t = today(), L = arr(window._gcSchedVisible(C().schedule));\n"
    "  if (_fpST.L !== L || _fpST.t !== t || !_fpST.m) {   /* FIELDPERF: job → today's rows, once per schedule list and day */\n"
    "    var m = {}; L.forEach(function(x){\n"
    "      if (!x || x.deleted) return;\n"
    "      var d = s(x.date), a = s(x.start || x.startDate) || d, b = s(x.end || x.endDate) || a;\n"
    "      if (!(d ? d === t : (a && a <= t && t <= b))) return;\n"
    "      var k = s(x.pid || x.projectId || x.jobId); (m[k] || (m[k] = [])).push(x);\n"
    "    });\n"
    "    _fpST = { L: L, t: t, m: m };\n"
    "  }\n"
    "  return (_fpST.m[s(p.id)] || []).slice();\n}")
# ROLEAPPS jobsOf: GrayCo Field's own job list (the PM's / crew's) was worked out for every role, also when not used
sub('ROLEAPPS jobsOf: Field\'s list only for the roles that use it',
    "  var J = null; try { J = F() && F().jobs ? F().jobs() : null; } catch (e) {}\n  if ((a === 'mit'",
    "  var J = null; if (a === 'pm' || a === 'crew') try { J = F() && F().jobs ? F().jobs() : null; } catch (e) {}   /* FIELDPERF: only where it is used */\n  if ((a === 'mit'")
# ROLEAPPS fieldBottom (the admin's "All jobs"): made again every 0.9 s and on every change of the home; the same jobs → the same rows for 3 s
sub('ROLEAPPS fieldBottom kept for 3 s on the same jobs',
    "function fieldBottom(a){",
    "var _fpFB = { a: '', P: null, at: 0, h: '' };   /* FIELDPERF */\n"
    "function fieldBottom(a){ var P0 = C().projects, n0 = Date.now(); if (_fpFB.h && _fpFB.a === a && _fpFB.P === P0 && n0 - _fpFB.at < 3000 && n0 >= _fpFB.at) return _fpFB.h; var h0 = fieldBottom0(a); if (h0) _fpFB = { a: a, P: P0, at: n0, h: h0 }; return h0; }   /* FIELDPERF: the same jobs → the same rows for 3 s */\n"
    "function fieldBottom0(a){")
# LA: the Desk dashboard's estimating section (every lead counted, every 1.5 s) was drawn under GrayCo Field, where nobody
# sees it. While Field is on screen (FIELDLAG's __gcFL.desk), it waits; on the Desk it runs as before.
sub('LA dashboard waits while GrayCo Field is on screen',
    "  every(function(){ try { if (view() === 'leads') mountSettings(); } catch (e) { warn(e); } try { mountDash(); } catch (e) { warn(e); } }, 1500);",
    "  every(function(){ if (window.__gcFL && window.__gcFL.desk('LA-dash')) return;   /* FIELDPERF: not under GrayCo Field */\n    try { if (view() === 'leads') mountSettings(); } catch (e) { warn(e); } try { mountDash(); } catch (e) { warn(e); } }, 1500);")
# AUTOPANEL2: every automation that is switched off and comes round again ("held") wrote this computer's whole held list
# (~60 K characters) to browser storage — 26 times in 30 s on an idle phone. The list is saved 5 s after the last change
# (one write for a burst) and at once when the app is put away / the page goes; what is sent to the server is unchanged.
sub('AUTOPANEL2 saveHeld: one write per burst',
    "function saveHeld(){ try { localStorage.setItem(HK, JSON.stringify({ held: S.held, pend: pendHeld, last: lastHeld })); } catch (e) {} }",
    "function saveHeld0(){ saveT = 0; try { localStorage.setItem(HK, JSON.stringify({ held: S.held, pend: pendHeld, last: lastHeld })); } catch (e) {} }\n"
    "var saveT = 0; function saveHeld(){ if (!saveT) saveT = T(saveHeld0, 5000); }   /* FIELDPERF: one write per burst (was a ~60 K write on every held tick) */\n"
    "try { W.addEventListener('pagehide', function(){ if (saveT) saveHeld0(); }); document.addEventListener('visibilitychange', function(){ if (document.hidden && saveT) saveHeld0(); }); } catch (e) {}")
if t == orig: print('FIELDPERF: nothing to do')
else: open(p, 'w', encoding='utf-8').write(t)
