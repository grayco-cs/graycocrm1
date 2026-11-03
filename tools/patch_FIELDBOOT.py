#!/usr/bin/env python3
"""Idempotent patch FIELDBOOT: a phone opens straight in GrayCo Field — the Desk is never drawn first.
Owner 11/03 (iPhone, the Home Screen app): "when I open from the share/home screen app it briefly goes to this first,
like half a second. I want it straight to Field view/app." React drew the Desk (sidebar + Company Dashboard) first and
GrayCo Field (patch FIELD) took over 350 ms after the CRM's data object (autoField in its soon() timer).
1. tools/fieldboot_early.js goes in as <script id="gc-patch-fieldboot"> right after BOOTSAFE (before anything is drawn;
   replaced when it changes): patch FIELDDESK's phone rule, run synchronously; on a phone <html> gets gc-boot-field and a
   white splash (logo + "GrayCo Field") covers the page until GrayCo Field is on screen (or the sign-in screen, or a Desk
   view chosen for this open, or 6 s after the page is read). A computer: nothing changes.
2. patch BOOT's "Loading the CRM…" cover stays out of the way while the splash is up (it times the open as before).
3. patch FIELD: while gc-boot-field is on and Field has not been opened yet, its look runs at once (0 ms, not 350 ms),
   and once right when the script is read (not only at 1.2 s).
Usage: python3 tools/patch_FIELDBOOT.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()
orig = t
M = '/* patch FIELDBOOT */'
js = open(os.path.join(HERE, 'fieldboot_early.js'), encoding='utf-8').read()
assert '</script' not in js.lower(), 'FIELDBOOT: a closing script tag in tools/fieldboot_early.js'
assert '__GC_PATCH_FIELDBOOT__' in js
for need in ('<script id="gc-patch-bootsafe">', '<script id="gc-patch-boot-cover">', '<script id="gc-patch-field">', '<script id="gc-patch-fielddesk">'):
    assert need in t, ('FIELDBOOT: needs', need)

# 1. the early script, right after BOOTSAFE
TAG = '<script id="gc-patch-fieldboot">'
if TAG in t:
    assert t.count(TAG) == 1, 'FIELDBOOT: script twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js: t = t[:i] + js + t[j:]; print('FIELDBOOT: script updated')
else:
    b = t.index('<script id="gc-patch-bootsafe">'); e = t.index('</script>\n', b) + len('</script>\n')
    assert t.index('<script id="gc-patch-boot-cover">') > e
    t = t[:e] + TAG + '\n' + js + '</script>\n' + t[e:]; print('FIELDBOOT: script added')

def sub(name, old, new):
    """replace old (must occur once) by new; new carries the marker so a re-run sees it"""
    global t
    assert M in new
    if new in t:
        assert t.count(new) == 1, ('FIELDBOOT: twice', name)
        return
    assert t.count(old) == 1, ('FIELDBOOT: anchor', name, t.count(old))
    t = t.replace(old, new); print('FIELDBOOT:', name)

# 2. patch BOOT's cover: not over the phone's splash
sub('BOOT cover stays out of the splash',
    "D.documentElement.appendChild(c);\ntry { if (c.showPopover) c.showPopover(); } catch (e) {}",
    "if (!D.documentElement.classList.contains('gc-boot-field')) { " + M + "\nD.documentElement.appendChild(c);\ntry { if (c.showPopover) c.showPopover(); } catch (e) {}\n}")

# 3. patch FIELD: open at once while booting on a phone
sub('FIELD: the look runs at once while booting',
    "ccRetry(); } catch (e) {} }, 350); }",
    "ccRetry(); } catch (e) {} }, (!autoDone && D.documentElement.classList.contains('gc-boot-field')) ? 0 : 350); } " + M)
sub('FIELD: a first look when read (booting on a phone)',
    "builtIns(); wrapPicker(); hookApprovals(); later(soon, 1200);",
    "builtIns(); wrapPicker(); hookApprovals(); later(soon, 1200); if (D.documentElement.classList.contains('gc-boot-field')) soon(); " + M)

if t == orig:
    print('FIELDBOOT: already patched'); sys.exit(0)
open(p, 'w', encoding='utf-8').write(t)
print('FIELDBOOT: done')
