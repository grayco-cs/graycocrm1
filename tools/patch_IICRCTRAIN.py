#!/usr/bin/env python3
"""Idempotent patch IICRCTRAIN — GrayCo's own IICRC-principles training documents (owner 11/11). See the header of
tools/iicrctrain.js; the words are in tools/iicrctrain_content.py.

1. index.html: tools/iicrctrain.js (with the documents written in as JSON) as <script id="gc-patch-iicrctrain"> right before the
   document library's script (patch DOCLIB3), so its entries can be listed there and the 🎓 Training courses are in
   window.__GC_TRAIN_EXTRA__ before patch RESTOTRAIN adds its own in front of them.
2. patch DOCLIB3: one library entry per document (group Internal, staff only, opens the training record).
3. patch MULTICO-DOCS: the company Dashboard papers card gets a "🎓 Training" row (Mitigation: fire, water, mold, biohazard;
   Environmental: mold, biohazard).
4. patch SDS: a "🎓 Training:" row under the 🧪 Materials & SDS title.
The script is replaced whenever the content or tools/iicrctrain.js changes; a rerun with nothing to do prints "already current".
Also rerun tools/patch_RESTOTRAIN.py after changing tools/restotrain.js (per-course pass marks).
Usage: python3 tools/patch_IICRCTRAIN.py [index.html]"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
sys.path.insert(0, here)
import iicrctrain_content as C

P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'index.html')
TAG = '<script id="gc-patch-iicrctrain">'
BEFORE = '<script id="gc-patch-doclib3">'


def doc(d, k):
    quiz = []
    for i, (q, ch, a, why) in enumerate(d['quiz']):
        n = len(ch); r = (i + k) % n          # spread the right answers over A–D (the content lists most of them second)
        quiz.append({'q': q, 'c': ch[r:] + ch[:r], 'a': (a - r) % n, 'why': why})
    return {'id': d['id'], 'title': d['title'], 'short': d['short'], 'icon': d['icon'], 'std': d['std'], 'cat': d['cat'],
            'required': d['required'], 'cos': d['cos'], 'intro': d['intro'],
            'sections': [{'id': s['id'], 'title': s['title'], 'body': s['body'].strip()} for s in d['sections']], 'quiz': quiz}


data = json.dumps([doc(d, k) for k, d in enumerate(C.DOCS)], ensure_ascii=False)
js = open(os.path.join(here, 'iicrctrain.js'), encoding='utf-8').read()
assert 'patch IICRCTRAIN' in js[:300]
js = js.replace('/*__DATA__*/null', data).replace('/*__PCT__*/80', str(C.PASS_PCT))
assert '</script' not in js.lower(), 'IICRCTRAIN: the script must not contain </script'

t = open(P, encoding='utf-8').read()
orig = t
assert t.count(BEFORE) == 1, 'IICRCTRAIN: patch DOCLIB3 script not found exactly once'
if TAG in t:
    assert t.count(TAG) == 1
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js:
        t = t[:i] + js + t[j:]; print('IICRCTRAIN: script updated')
    else:
        print('IICRCTRAIN: script already current')
else:
    t = t.replace(BEFORE, TAG + '\n' + js + '</script>\n' + BEFORE); print('IICRCTRAIN: script added')

EDITS = [
    ("    open: function(){ try { W._setView && W._setView('marketing'); } catch (e) {} toast('Marketing → 📰 Flyers / 🏘 Neighbors'); } }\n];\n",
     "    open: function(){ try { W._setView && W._setView('marketing'); } catch (e) {} toast('Marketing → 📰 Flyers / 🏘 Neighbors'); } }\n];\n"
     "try { (W._gcIicrc ? W._gcIicrc.docs : []).forEach(function(d){ FN.push({ id: 'iicrc_' + d.id, title: d.icon + ' ' + d.title, group: 'Internal', jobTypes: ALL, clientFacing: false, desc: 'Staff training record: ' + d.sections.length + ' sections, ' + d.quiz.length + '-question quiz, sign-off (based on the principles of ' + d.std + ')', html: function(){ return W._gcIicrc ? W._gcIicrc.html(d.id) : null; } }); }); } catch (e) {}   /* patch IICRCTRAIN */\n",
     "W._gcIicrc ? W._gcIicrc.docs : []"),
    ("  if (files.length) h += '<div style=\"font:700 12px Inter,Arial,sans-serif;color:#64748b;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.05em\">Programs, plans & references</div>",
     "  try { if (W._gcIicrc) h += W._gcIicrc.coCard(co); } catch (e) {}   /* patch IICRCTRAIN: the training records */\n"
     "  if (files.length) h += '<div style=\"font:700 12px Inter,Arial,sans-serif;color:#64748b;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.05em\">Programs, plans & references</div>",
     "W._gcIicrc.coCard(co)"),
    ("re-entry, first aid — and, per job, which ones the customer approved in their portal before we use them.</p>'\n",
     "re-entry, first aid — and, per job, which ones the customer approved in their portal before we use them.</p>'\n"
     "    + (W._gcIicrc ? W._gcIicrc.chips(co) : '')   /* patch IICRCTRAIN */\n",
     "W._gcIicrc.chips(co)"),
]
for a, b, mark in EDITS:
    if mark in t:
        print('IICRCTRAIN: edit already in (%s)' % mark[:30]); continue
    assert t.count(a) == 1, 'IICRCTRAIN: anchor not found exactly once: ' + a[:70]
    t = t.replace(a, b); print('IICRCTRAIN: edit made (%s)' % mark[:30])

if t != orig:
    open(P, 'w', encoding='utf-8').write(t); print('IICRCTRAIN: patched')
else:
    print('IICRCTRAIN: already patched')
