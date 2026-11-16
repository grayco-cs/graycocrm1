#!/usr/bin/env python3
"""Idempotent patch DEVMODE: a computer opens the Desk, a phone GrayCo Field — by the device, never the role.
Owner 11/16: "The field view app is pulling up as the first screen in Glenn's screen and everyone else's too and it should
open desk cuz they are using computer … unless it's opened from an iPhone then it should be field opening … have the option
for it to ask on sign in if I want field or desk on my profile."
Root cause: patch ROLEAPPS sent every crew role (Superintendent / Foreman / Crew / Laborer) to GrayCo Field on ANY device
(mode(): crew → 'field'; crewDesk() put a computer in Field mode) and patch FIELDDESK refused the Desk for them.
1. tools/devmode_early.js → <script id="gc-patch-devmode-early"> right before FIELDBOOT: window._gcDevice (phone / tablet /
   computer from the user agent, iPadOS-as-Mac, touch-only + screen size; this sign-in's Field / Desk pick).
2. FIELDDESK asks _gcDevice; a Desk / Field switch lasts for this open only; crews are refused the Desk only on a phone.
3. ROLEAPPS: crews get Field on a phone (or in 👁 View as…), the Desk on a computer.
4. tools/devmode_tail.js → <script id="gc-patch-devmode"> after ROLEAPPS: signing out and in again in the same page
   does not keep a Desk / Field switch. (The owner, 11/16: no "Ask me Field or Desk" question — the device decides.)
Usage: python3 tools/patch_DEVMODE.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()
orig = t
def block(tag, fname, anchor_before=None, after_script=None):
    global t
    js = open(os.path.join(HERE, fname), encoding='utf-8').read()
    assert '</script' not in js.lower(), fname
    TAG = '<script id="' + tag + '">'
    if TAG in t:
        assert t.count(TAG) == 1
        i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
        if t[i:j] != js: t = t[:i] + js + t[j:]; print('DEVMODE:', tag, 'updated')
        return
    if anchor_before:
        b = t.index(anchor_before); t = t[:b] + TAG + '\n' + js + '</script>\n' + t[b:]
    else:
        b = t.index(after_script); e = t.index('</script>\n', b) + len('</script>\n')
        t = t[:e] + TAG + '\n' + js + '</script>\n' + t[e:]
    print('DEVMODE:', tag, 'added')
block('gc-patch-devmode-early', 'devmode_early.js', anchor_before='<script id="gc-patch-fieldboot">')
block('gc-patch-devmode', 'devmode_tail.js', after_script='<script id="gc-patch-roleapps">')

def sub(name, olds, new):
    """olds: the text before (main), and what the first DEVMODE commit (with the ask setting) put there"""
    global t
    if isinstance(olds, str): olds = [olds]
    for old in olds:
        if old not in new and t.count(old) == 1:
            t = t.replace(old, new); print('DEVMODE:', name); return
    if new in t:
        assert t.count(new) == 1, ('DEVMODE twice', name); return
    raise AssertionError(('DEVMODE anchor', name, [t.count(o) for o in olds]))
sub('FIELDDESK phone() asks _gcDevice',
    ["function phone(){\n  if (uaMobile()) return true;\n  if (computerOS() || deskPointer()) return false;",
     "function phone(){\n  try { if (W._gcDevice) return !!W._gcDevice.fieldDevice(); } catch (e) {}   /* DEVMODE: the device decides (patch DEVMODE's _gcDevice: a phone / a tablet without a mouse) */\n  if (uaMobile()) return true;\n  if (computerOS() || deskPointer()) return false;"],
    "function phone(){\n  try { if (W._gcDevice) return !!W._gcDevice.fieldDevice(); } catch (e) {}   /* DEVMODE: the device decides (patch DEVMODE's _gcDevice: a phone or a tablet → Field) */\n  if (uaMobile()) return true;\n  if (computerOS() || deskPointer()) return false;")
sub('FIELDDESK: a switch is for this open only (no sign-in pick)',
    ["var CUR = ''; try { if (W._gcDevice && W._gcDevice.kind() !== 'phone') CUR = W._gcDevice.choice() || ''; } catch (e) {}   /* DEVMODE: this sign-in's \"Ask me Field or Desk\" pick (a computer / tablet) */\nfunction pref(){ return CUR; }",
     "var CUR = '';\nfunction pref(){ return CUR; }"],
    "var CUR = '';   /* DEVMODE: the owner (11/16): no question at sign-in — the device decides; a switch lasts for this open */\nfunction pref(){ return CUR; }")
sub('FIELDDESK crews: Desk on a computer',
    ["  if (v === 'desk' && crewApp()) { toast('Crews use GrayCo Field.'); return 'crew'; }\n  set(v);",
     "  if (v === 'desk' && crewApp() && phone()) { toast('Crews use GrayCo Field.'); return 'crew'; }   /* DEVMODE: only on a phone — on a computer a crew member has the Desk too */\n  set(v);\n  try { if (W._gcDevice && W._gcDevice.choice()) W._gcDevice.setChoice(v); } catch (e) {}   /* DEVMODE: with the ask setting on, a switch changes this sign-in's pick; without it, this open only */"],
    "  if (v === 'desk' && crewApp() && phone()) { toast('Crews use GrayCo Field.'); return 'crew'; }   /* DEVMODE: only on a phone — on a computer a crew member has the Desk too */\n  set(v);")
sub('FIELDDESK re-check',
    "if (v === 'desk' && inField() && !crewApp()) toDesk(); paint();",
    "if (v === 'desk' && inField() && !(crewApp() && phone())) toDesk(); paint();")
sub('ROLEAPPS mode(): crews Field only on a phone',
    "function mode(a){ a = a === undefined ? app() : a; if (!a) return ''; if (a === 'crew') return 'field';",
    "function mode(a){ a = a === undefined ? app() : a; if (!a) return ''; if (a === 'crew' && (phone() || vas())) return 'field';   /* DEVMODE: a crew member on a computer gets the Desk (owner 11/16); 👁 View as a crew member still previews Field */")
sub('ROLEAPPS crewDesk(): only View as',
    "  var want = a === 'crew' && !phone();\n",
    "  var want = a === 'crew' && !phone() && !!vas();   /* DEVMODE: only 👁 View as… puts a computer in the crew's Field */\n")
sub('the daily digest does not pop up over GrayCo Field',
    "      if(shown===todayKey() || !(crm().projects||[]).length) return;",
    "      if(shown===todayKey() || !(crm().projects||[]).length) return;\n      if(document.documentElement.classList.contains('_fieldmode') || (window._gcDevice && window._gcDevice.wantField())) return;   /* DEVMODE: not over GrayCo Field (a phone): it covered the job page and its buttons; the Desk shows it */")
if t == orig: print('DEVMODE: nothing to do')
else: open(p, 'w', encoding='utf-8').write(t)
