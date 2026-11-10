#!/usr/bin/env python3
"""Idempotent patch RESTOTRAIN — GrayCo's own 🔥 Fire & Smoke Restoration and 👃 Odor Control courses in 🎓 Training, with a quiz
at the end of each (owner 11/10). See the header of tools/restotrain.js; the words are in tools/restotrain_content.py.

1. index.html: tools/restotrain.js (with the courses written in as JSON) as <script id="gc-patch-restotrain"> right before
   patch TRAIN's script, so window.__GC_TRAIN_EXTRA__ is there when Training builds its list.
2. patch TRAIN (three small edits, each made once):
   a. modules(): the extra courses join the list after the CRM videos (id "b:<course id>", built-in, their own category);
   b. a part with a quiz shows the quiz under its text (window.__GC_TRAIN_QUIZ__);
   c. a quiz part's tick box is locked until the quiz is passed.
The script is replaced whenever the content or tools/restotrain.js changes; a rerun with nothing to do prints "already current".
Usage: python3 tools/patch_RESTOTRAIN.py [index.html]"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
sys.path.insert(0, here)
import restotrain_content as C

P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'index.html')
TAG = '<script id="gc-patch-restotrain">'
TRAIN_TAG = '<script id="gc-patch-train">'


def course(c):
    parts = [{'id': p['id'], 'title': p['title'], 'body': p['body'].strip()} for p in c['parts']]
    pdf = 'https://crm.grayco-cs.com/training/' + c['pdf']
    parts.insert(0, {'id': 'print', 'title': 'The printable manual',
                     'body': 'The whole course as a GrayCo manual you can print or read on paper, with the review questions: '
                             '[🖨 Open the ' + c['short'] + ' manual (PDF)](' + pdf + ')'})
    parts.append({'id': 'quiz', 'title': 'Quiz: pass %d of %d to finish' % (C.PASS, len(c['quiz'])),
                  'body': 'Take it after you have read every part. You can retake it as many times as you need.',
                  'quiz': [{'q': q, 'c': ch, 'a': a, 'why': why} for q, ch, a, why in c['quiz']]})
    return {'id': c['id'], 'title': c['title'], 'intro': c['intro'], 'required': c['required'], 'cat': c['cat'], 'parts': parts}


data = json.dumps([course(c) for c in C.COURSES], ensure_ascii=False)
js = open(os.path.join(here, 'restotrain.js'), encoding='utf-8').read()
assert 'patch RESTOTRAIN' in js[:300]
js = js.replace('/*__DATA__*/null', data).replace('/*__PASS__*/16', str(C.PASS))
assert '</script' not in js.lower(), 'RESTOTRAIN: the script must not contain </script'

t = open(P, encoding='utf-8').read()
orig = t
assert t.count(TRAIN_TAG) == 1, 'RESTOTRAIN: patch TRAIN script not found exactly once'

# 1. the script, right before TRAIN's
if TAG in t:
    assert t.count(TAG) == 1
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js:
        t = t[:i] + js + t[j:]; print('RESTOTRAIN: script updated')
    else:
        print('RESTOTRAIN: script already current')
else:
    t = t.replace(TRAIN_TAG, TAG + '\n' + js + '</script>\n' + TRAIN_TAG); print('RESTOTRAIN: script added')

# 2. patch TRAIN edits (inside TRAIN's script only)
ti = t.index(TRAIN_TAG); tj = t.index('</script>', ti)
train = t[ti:tj]
EDITS = [
    ("parts: [{ id: 'watch', title: 'Watch the video' }] }); });\n",
     "parts: [{ id: 'watch', title: 'Watch the video' }] }); });\n"
     "  (Array.isArray(W.__GC_TRAIN_EXTRA__) ? W.__GC_TRAIN_EXTRA__ : []).forEach(function(x, i){ out.push({ id: 'b:' + x.id, builtin: true, title: x.title, intro: x.intro, required: x.required, kind: 'guide', cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'Other', order: 70 + i, parts: x.parts }); });   /* patch RESTOTRAIN */\n",
     '__GC_TRAIN_EXTRA__'),
    ("(p.body ? '<div class=\"gctr-pb\">' + md(p.body) + '</div>' : '') + '</div>';",
     "(p.body ? '<div class=\"gctr-pb\">' + md(p.body) + '</div>' : '') + (p.quiz && W.__GC_TRAIN_QUIZ__ ? W.__GC_TRAIN_QUIZ__(key, p.quiz, dn) : '') + '</div>';   /* patch RESTOTRAIN: the quiz */",
     '__GC_TRAIN_QUIZ__(key'),
    ("data-k=\"' + esc(key) + '\"' + (dn ? ' checked' : '') + '> ✓ ' + (watch ? 'I watched this' : 'I read this') + '</label>'",
     "data-k=\"' + esc(key) + '\"' + (dn ? ' checked' : '') + (p.quiz && !dn ? ' disabled title=\"Pass the quiz to tick this\"' : '') + '> ✓ ' + (p.quiz ? 'Passed' : watch ? 'I watched this' : 'I read this') + '</label>'",
     'Pass the quiz to tick this'),
]
for old, new, mark in EDITS:
    if mark in train:
        print('RESTOTRAIN: TRAIN edit already in (' + mark[:24] + ')'); continue
    assert train.count(old) == 1, ('RESTOTRAIN: TRAIN anchor count != 1', old[:60])
    train = train.replace(old, new); print('RESTOTRAIN: TRAIN edit made (' + mark[:24] + ')')
t = t[:ti] + train + t[tj:]

if t != orig:
    open(P, 'w', encoding='utf-8').write(t); print('RESTOTRAIN: index.html written')
else:
    print('RESTOTRAIN: already patched')
