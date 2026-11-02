#!/usr/bin/env python3
"""Idempotent patch DATAFULL (owner 11/01): "does admin and office get nightly data check alert, I want office to make sure
every job has full data in it" — one data checklist per job, by the job's stage (a bidding job only needs its name and
address), the 🧾 Missing job data board (office, admins; a PM his own jobs) with a one-click Fix and "N/A for this job", the
"Data 80% · 3 missing" chip in each job's header, the morning alert shown once in the CRM, and the new-job forms asking only
for the name and the address ("＋ More details (optional)" holds every other choice). See the header of tools/datafull.js.
The page carries the SAME rule as the nightly check: netlify/functions/_lib/jobdata.js is copied in verbatim, then
tools/datafull.js — together as <script id="gc-patch-datafull"> at the end of the page (replaced when either changes).
No other line of the page is changed: it layers on public hooks (patch JA's stamp, patch CC2's ＋ New project, the role
apps' desk home, the 🏢 Office tab, the job page). Usage: python3 tools/patch_DATAFULL.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
t = open(p, encoding='utf-8').read()

def once(anchor, tag):
    """the page must have exactly one of each hook this patch builds on"""
    c = t.count(anchor)
    assert c == 1, ('DATAFULL anchor', tag, c, anchor[:100])

once('<script id="gc-patch-ja">', 'patch JA script')
once('try{if(window._gcJA)window._gcJA.stamp(_np,"proj")}catch(_ja){}', 'New Project form stamps the new job')
once('"data-gc-ja":"proj"', 'New Project form automations box')
once("var j = addJob((W._gcJA ? W._gcJA.stamp : function(x){ return x; })(newJob(", 'Field ＋ New project stamps the new job')
once("W._gcSelfNewJob = function(opts){", 'Field ＋ New project')
once("W._gcSchedTemplates = {", 'schedule templates')
once('<script id="gc-patch-roleapps">', 'role apps')
once('id:"gc-om-mount"', 'the Office tab')
once("window._gcIsOfficeFull = function(){", 'the office check')
once("window._gcClaims = {", 'claims')

TAG = '<script id="gc-patch-datafull">'
rule = open(os.path.join(root, 'netlify', 'functions', '_lib', 'jobdata.js'), encoding='utf-8').read().strip() + '\n'
js = open(os.path.join(here, 'datafull.js'), encoding='utf-8').read().strip() + '\n'
for x in (rule, js):
    assert '</script' not in x.lower()
assert '(patch DATAFULL)' in js and '(patch DATAFULL)' in rule
MARK = '/* patch DATAFULL */\n'
RULE_BEGIN = '/* ── DATAFULL rule: netlify/functions/_lib/jobdata.js, verbatim ── */\n'
RULE_END = '/* ── end of the DATAFULL rule ── */\n'
body = MARK + RULE_BEGIN + rule + RULE_END + js
if TAG in t:
    assert t.count(TAG) == 1, 'DATAFULL: script tag twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] == body:
        print('DATAFULL: already patched')
        sys.exit(0)
    t = t[:i] + body + t[j:]; print('DATAFULL: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'DATAFULL: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + body + '</script>\n'
    print('DATAFULL: script added')
open(p, 'w', encoding='utf-8').write(t)
