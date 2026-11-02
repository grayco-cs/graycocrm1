#!/usr/bin/env python3
"""Idempotent patch PHOTOCOVER — 📸 Photo coverage + the owner's copy rules for GrayCo photo copies.

Owner (11/01): "all my GrayCo Photos aren't CompanyCam photos yet, some jobs have 0 photos, some are in though";
"we only want active jobs or jobs not lost photos taking up GrayCo photo space"; "there are some jobs I do want to keep if I
lost them, so yes let me click keep or delete completely after the 30 days".

Server (netlify/functions/_lib/cc-photos.js, companycam-webhook.js ?proxy=photocover / ?proxy=photojob): copies only for jobs
that are not lost (and not "Not a job", not a lead that never became a job); a lost job's copies stay, and after 30 days the
admin decides — 📌 Keep or 🗑 Delete (GrayCo's copies only, logged in gc_kv ccidx_removed; never CompanyCam). "Re-index this
job"; a project whose CompanyCam photo count differs from the index is read again; another site's ".../projects/123" link is
no longer taken for a CompanyCam project.

This page:
 1. tools/photocover.js as <script id="gc-patch-photocover"> at the end of the page: the 📸 Photo coverage window (Admin →
    ⚙ Admin settings, the GrayCo Photos home, the To-Do decision cards, the open lost job's banner).
 2. GrayCo Photos: a job's CompanyCam projects are ALL its CompanyCam fields (+ ccMoreIds) — the same list the server indexes
    (it used to take only the first field, so a second link's photos were indexed but never shown).
 3. GrayCo Photos home: a "📸 Photo coverage" button (admins / the office).
 4. 📸 CompanyCam sync status: the copy box says the lost-job rule and the trade-off, the storage meter by kind of job, and
    opens 📸 Photo coverage.
Each find-string must occur exactly once. Usage: python3 tools/patch_PHOTOCOVER.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
src = open(p, encoding='utf-8').read()
MARK = '/* patch PHOTOCOVER */'
TAG = '<script id="gc-patch-photocover">'
js = open(os.path.join(here, 'photocover.js'), encoding='utf-8').read()
assert '</script' not in js


def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('PHOTOCOVER anchor', label, n)
    src = src.replace(old, new)


changed = False
if MARK not in src:
    # 2. every CompanyCam field of a job, like the server
    once("function ccIdsOf(p){ var out = [], a = ccIdOf(p); if (a) out.push(a); arr(p && p.ccMoreIds).forEach(function(v){ var x = ccIdFromAny(v); if (x && out.indexOf(x) < 0) out.push(x); }); return out; }",
         "function ccIdsOf(p){ var out = [], a = ccIdOf(p); if (a) out.push(a); ['ccProjectId', 'companyCamId', 'companycamId', 'ccamId', 'ccId', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'ccProjectUrl', 'sourceUrl'].forEach(function(f){ var x = p ? ccIdFromAny(p[f]) : ''; if (x && out.indexOf(x) < 0) out.push(x); }); arr(p && p.ccMoreIds).forEach(function(v){ var x = ccIdFromAny(v); if (x && out.indexOf(x) < 0) out.push(x); }); return out; }   " + MARK + " /* every CompanyCam field, like the server's index */",
         'ccIdsOf')
    # 3. the button on the GrayCo Photos home
    once("""  var h = '<div class="gcu-pad pv">' + (q ? '' : linkHtml());""",
         """  var h = '<div class="gcu-pad pv">' + (q ? '' : pcoverBtn() + linkHtml());""", 'home')
    once("""function vProjects(){
  if (!pvReady""", """function pcoverBtn(){ try { if (!window._gcPhotoCover || !window._gcPhotoCover.allowed()) return ''; } catch (e) { return ''; }   """ + MARK + """
  return '<div style="display:flex;justify-content:flex-end;margin:0 0 -16px"><button class="pv-link" data-a="pcover" title="Every active and bidding job: its CompanyCam project, photos indexed / copied, problems first">📸 Photo coverage</button></div>'; }
function vProjects(){
  if (!pvReady""", 'pcoverBtn')
    once("""    case 'lklink': case 'lkno': return linkAct(a, v, id);   /* patch PHOTOLINK */""",
         """    case 'lklink': case 'lkno': return linkAct(a, v, id);   /* patch PHOTOLINK */
    case 'pcover': try { if (window._gcPhotoCover) window._gcPhotoCover.open(); } catch (e) {} return;   """ + MARK, 'click')
    # 4. the copy box
    once("""    + '<div style="font-size:12px;color:#475569;margin:3px 0 6px">So every picture stays when CompanyCam is cancelled. Needs Supabase Pro (100 GB of file storage) — docs/COMPANYCAM.md.</div>'""",
         """    + '<div style="font-size:12px;color:#475569;margin:3px 0 6px">So every picture stays when CompanyCam is cancelled. Needs Supabase Pro (100 GB of file storage) — docs/COMPANYCAM.md.</div>'
    + '<div data-ccs-lostrule style="font-size:12px;color:#475569;margin:0 0 6px">' + esc(c.on ? '' : 'GrayCo copies are OFF until Supabase Pro — photos show from CompanyCam links. ') + 'Copies are made only for jobs that are not lost (bidding, active, on hold, completed; never "Not a job" records or leads). Lost jobs: GrayCo copies stay 30 days after the job is lost, then the admin chooses 📌 Keep photos or 🗑 Delete photos — nothing is deleted without that click. Once CompanyCam is cancelled, deleted photos can\\'t be recovered.</div>'
    + pcMeter(c)   """ + MARK, 'copybox')
    once("""function copyBox(d){""", """function pcMeter(c){   """ + MARK + """ /* GB by kind of job, freed, waiting for a decision */
  var m = c && c.meter; if (!m) return '';
  var b = m.bytes || {}, p = m.pending || {};
  return '<div data-ccs-pcmeter style="font-size:12px;color:#334155;margin:0 0 6px">GrayCo storage: active jobs ' + gbTxt(b.active) + ' · bidding ' + gbTxt(b.bidding) + ' · completed ' + gbTxt(b.completed) + ' · lost ' + gbTxt(b.lost) + ' · freed by lost-job removals ' + gbTxt(m.freedBytes) + ' · waiting for a decision ' + gbTxt(p.bytes) + ' (' + (+p.projects || 0) + ')'
    + ' <button type="button" data-ccs-pcover style="margin-left:6px;padding:3px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">📸 Photo coverage</button></div>';
}
function copyBox(d){""", 'pcMeter')
    once("""  if (t.closest('[data-ccs-capsave]')) {""", """  if (t.closest('[data-ccs-pcover]')) { try { if (W._gcPhotoCover) W._gcPhotoCover.open(); } catch (e) {} return; }   """ + MARK + """
  if (t.closest('[data-ccs-capsave]')) {""", 'pcover click')
    changed = True
    print('PHOTOCOVER: page patched')
else:
    print('PHOTOCOVER: already patched')

if TAG in src:
    i = src.index(TAG) + len(TAG) + 1; j = src.index('</script>', i)
    if src[i:j] == js:
        print('PHOTOCOVER: script already current')
    else:
        src = src[:i] + js + src[j:]; changed = True; print('PHOTOCOVER: script updated')
else:
    assert src.rstrip().endswith('</script>'), 'PHOTOCOVER: page end'
    src = src.rstrip() + '\n' + TAG + '\n' + js + '</script>\n'; changed = True
    print('PHOTOCOVER: script added')
if changed:
    open(p, 'w', encoding='utf-8').write(src)
else:
    print('already patched')
