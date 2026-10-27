#!/usr/bin/env python3
"""Idempotent patch FIELDFIX: GrayCo Field v2 everywhere (desk field view, Jobs / All jobs), GrayCo navy/gold look,
job cards with job name / PO / job-site address / stage / PM / customer; every new estimate gets its job at once
(patch ESTIN), estimate PDFs put on leads / bids become estimates + jobs, one-time fill of bare job rows.

Parts: tools/fieldfix_field.js (into patch FIELD), tools/fieldfix_estin.js (replaces ESTIN's ensureJob),
tools/fieldfix_tail.js (<script id="gc-patch-fieldfix"> after patch FIELD).
Usage: python3 tools/patch_FIELDFIX.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
def part(n): return open(os.path.join(HERE, n), encoding='utf-8').read().rstrip('\n')
FIELDJS, ESTINJS, TAIL = part('fieldfix_field.js'), part('fieldfix_estin.js'), part('fieldfix_tail.js')
MARK = '__GC_PATCH_FIELDFIX__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

def region(start_tag):
    a = src.index(start_tag); b = src.index('</script>', a)
    return a, b

# ── patch FIELD (all edits must land inside its script) ──
fa, fb = region('<script id="gc-patch-field">')
def once_in_field(old, new, label):
    global src, fa, fb
    seg = src[fa:fb]
    assert src.count(old) == 1 and seg.count(old) == 1, ('field anchor', label, src.count(old), seg.count(old))
    src = src[:fa] + seg.replace(old, new) + src[fb:]
    fa, fb = region('<script id="gc-patch-field">')

once_in_field("function eligible(){ return inField() && phoneDevice(); }",
              "function eligible(){ return inField(); }   /* patch FIELDFIX: every device (a desk's field view too); the phone still opens in it by itself */", 'eligible')
once_in_field("var orig = null;\nfunction openHome(){", FIELDJS + "\nvar orig = null;\nfunction openHome(){", 'block')
once_in_field("Array.prototype.forEach.call(D.querySelectorAll('._gcSheetOv,#_gcJobDash,#_gcJobPick'), function(o){ o.remove(); });",
              "Array.prototype.forEach.call(D.querySelectorAll('._gcSheetOv,#_gcJobDash,#_gcJobPick,#_gcFhAll'), function(o){ o.remove(); });", 'openHome clears All jobs')
once_in_field("""  var w = function(){
    if (eligible() && !W.__gcFhAll) return openHome();
    W.__gcFhAll = false;
    return orig.apply(this, arguments);
  };""", """  var w = function(){
    var all = !!W.__gcFhAll; W.__gcFhAll = false;   /* patch FIELDFIX: the old list only when this app cannot draw */
    if (eligible()) {
      try { return all ? openAll() : openHome(); }
      catch (e) { try { console.warn('[GC] GrayCo Field could not draw — the old job list', e); } catch (x) {} var h = D.getElementById('_gcJobPick'); if (h) h.remove(); }
    }
    return orig.apply(this, arguments);
  };""", 'wrapPicker')
once_in_field("if (a === 'alljobs') { W.__gcFhAll = true; if (W._gcJobPicker) W._gcJobPicker(); return; }",
              "if (a === 'alljobs') { openAll(); return; }   /* patch FIELDFIX */\n  if (a === 'desk') { fxDesk(); return; }", 'alljobs')
once_in_field("if (k === 'jobs') { W.__gcFhAll = true; if (W._gcJobPicker) W._gcJobPicker(); return; }",
              "if (k === 'jobs') { openAll(); return; }   /* patch FIELDFIX */", 'jobs tab')
once_in_field("    if (k === 'home') { openHome(); return; }", "    if (k === 'home') { fxClose(); openHome(); return; }", 'home tab')
once_in_field("data-fa=\"open\" data-pid=\"' + esc(p.id) + '\">' + esc(p.name) + '</button><div class=\"fh-a\">' + esc([p.address, p.client].filter(Boolean).join(' · ')) + '</div>'",
              "data-fa=\"open\" data-pid=\"' + esc(p.id) + '\">' + esc(fxView(p).name) + '</button><div class=\"fh-a\">' + fxSub(p) + '</div>'", 'job card')
once_in_field("""  var h = '<div class="fh-top"><div class="fh-brand"><img class="fh-logo" src="grayco-logo.jpg" alt="GrayCo"><div style="min-width:0"><div class="fh-h">GrayCo Field</div><div class="fh-s">' + esc(myName()) + ' · ' + esc(ROLE_NAMES[k] || '') + ' · ' + esc(dt) + '</div></div></div><span id="gc-fh-sync" data-k="ok">✓ All sent</span></div><div class="fh-wrap">';""",
              """  var h = '<div class="fh-top fx-top">' + (phoneDevice() ? '' : '<button type="button" class="fx-desk" data-fa="desk">🖥 Desk</button>') + '<div class="fx-logo"><img class="fh-logo" src="grayco-logo.jpg" alt="GrayCo"></div><div class="fh-h">GrayCo Field</div><div class="fh-s">' + esc(myName()) + ' · ' + esc(ROLE_NAMES[k] || '') + ' · ' + esc(dt) + '</div><span id="gc-fh-sync" data-k="ok">✓ All sent</span></div><div class="fh-wrap">';   /* patch FIELDFIX: GrayCo navy / gold, the logo centred */""", 'header')
once_in_field("""'.gc-fh-sheet .matched{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:10px;padding:8px 10px;font-size:13px;font-weight:700;margin-top:6px}'
  ].join('');""", """'.gc-fh-sheet .matched{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:10px;padding:8px 10px;font-size:13px;font-weight:700;margin-top:6px}'
  ].concat(FX_CSS).join('');""", 'css')
once_in_field("function setOn(){\n  var on = eligible();", "function setOn(){\n  var on = eligible(); if (!on) fxClose();", 'setOn')
once_in_field("W._gcField = { open: openHome,", "W._gcField = { all: openAll, view: function(pid){ var p = proj(pid); return p ? fxView(p) : null; }, open: openHome,", 'api')

# ── patch ESTIN ──
ea, eb = region('<script id="gc-patch-estin">')
def once_in_estin(old, new, label):
    global src, ea, eb
    seg = src[ea:eb]
    assert src.count(old) == 1 and seg.count(old) == 1, ('estin anchor', label, src.count(old), seg.count(old))
    src = src[:ea] + seg.replace(old, new) + src[eb:]
    ea, eb = region('<script id="gc-patch-estin">')
seg = src[ea:eb]
i, j = seg.index('function ensureJob(e){'), seg.index('function scopeWords(e){')
assert seg.count('function ensureJob(e){') == 1 and seg.count('function scopeWords(e){') == 1 and i < j
assert src.count('function ensureJob(e){') == 1
src = src[:ea] + seg[:i] + ESTINJS + '\n' + seg[j:] + src[eb:]
ea, eb = region('<script id="gc-patch-estin">')
once_in_estin("function jobOf(e){\n  if (!e) return null;\n  return proj(e.pid) ||",
              "function jobOf(e){\n  if (!e) return null;\n  var fxp = proj(e.pid); if (fxp && fxBare(fxp) && startedAt(e) >= FX_BOOT) fxp = null;   /* patch FIELDFIX: a new estimate pointed at a bare customer row gets a job of its own */\n  return fxp ||", 'jobOf')
once_in_estin("  f.address = pick(/(?:location|address|job site|site|property|loss location)(?: address)?\\s*[:\\-]\\s*([^\\n]{5,120})/i);",
              "  f.address = pick(/(?:location|address|job site|site|property|loss location)(?: address)?\\s*[:\\-]\\s*([^\\n]{5,120})/i);\n  f.estimator = pick(/(?:estimator|estimated by|prepared by)\\s*[:\\-]\\s*([^\\n]{2,60})/i);   /* patch FIELDFIX */", 'whoIn estimator')
once_in_estin("by: s(o.by) || meName(), estimator: s(o.by) || meName(),",
              "by: s(o.by) || meName(), estimator: fxStaff(rd.f.estimator) || s(o.by) || meName(),", 'estimateFrom estimator')
once_in_estin("    var list = estList(), jobs = [];", "    var list = estList(), jobs = [];\n    fxLinkAll(list);   /* patch FIELDFIX: its job the moment it is made */", 'scan links')
once_in_estin("W._gcEstin = { measure: measureFor,", "W._gcEstin = { ensureJob: ensureJob, linkJobs: function(){ return loadLists().then(function(){ return fxLinkAll(estList()); }); }, measure: measureFor,", 'estin api')

# ── the tail ──
once('<script id="gc-patch-PRODSRC">', '<script id="gc-patch-fieldfix">\n' + TAIL + '\n</script>\n<script id="gc-patch-PRODSRC">', 'tail after FIELD')
assert src.index('id="gc-patch-field">') < src.index('id="gc-patch-fieldfix">') < src.index('id="gc-patch-PRODSRC">')
assert src.count(MARK) >= 1
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
