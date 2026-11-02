#!/usr/bin/env python3
"""Idempotent patch FIELDDESK: a computer opens on the Desk, a phone in GrayCo Field — on every open.
Owner 11/02 (HP touch-screen laptop, Edge): a short laptop window counted as a phone, GrayCo Field opened by itself and
"Desk" did not hold; then: "it needs to always pop up desktop for computer and field view when on your phone screen /
app on phone". A Desk / Field button switches for this open only. See tools/fielddesk.js.
1. tools/fielddesk.js goes in as <script id="gc-patch-fielddesk"> just before the old Desk / Field button's script
   (replaced when it changes), so window._gcView is there before anything asks.
2. The old Desk / Field button names where it goes and asks _gcChooseView; the toolbar's copy of it says "Field view".
3. GrayCo Field (patch FIELD): "a phone" and "desk view chosen" ask _gcView; a 🖥 Desk button in its header (computers)
   and a 🖥 Desk view item in its ☰ More.
4. Role apps (patch ROLEAPPS): "a phone" asks _gcView; a switch made in this open wins (crews stay Field).
5. The old "keep field view sticky" guard (a key nothing sets any more) no longer puts a computer back in Field.
Usage: python3 tools/patch_FIELDDESK.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
t = open(p, encoding='utf-8').read()
orig = t
M = '/* patch FIELDDESK */'
js = open(os.path.join(HERE, 'fielddesk.js'), encoding='utf-8').read()
assert '</script' not in js.lower(), 'FIELDDESK: a closing script tag in tools/fielddesk.js'
for need in ('<script id="gc-patch-field">', '<script id="gc-patch-roleapps">', '<script id="gc-patch-topbar">'):
    assert need in t, ('FIELDDESK: needs', need)

# 1. the script, before the old Desk / Field button
TAG = '<script id="gc-patch-fielddesk">'
if TAG in t:
    assert t.count(TAG) == 1, 'FIELDDESK: script twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != js: t = t[:i] + js + t[j:]; print('FIELDDESK: script updated')
else:
    A = '<script>\n// ========== PM FIELD MODE v2 — CLEAN BUILD =========='
    assert t.count(A) == 1, ('FIELDDESK: old Desk / Field script anchor', t.count(A))
    t = t.replace(A, TAG + '\n' + js + '</script>\n' + A); print('FIELDDESK: script added')

def sub(name, old, new):
    """replace old (must occur once) by new; new carries the marker so a re-run sees it"""
    global t
    assert M in new
    if new in t:
        assert t.count(new) == 1, ('FIELDDESK: twice', name)
        return
    assert t.count(old) == 1, ('FIELDDESK: anchor', name, t.count(old))
    t = t.replace(old, new); print('FIELDDESK:', name)

# 2. the old Desk / Field button (bottom left; the toolbar's 🖥 clicks it)
sub('old button names where it goes',
    'fmBtn.textContent = isFieldMode ? "Field" : "Desk";',
    'fmBtn.textContent = isFieldMode ? "\\uD83D\\uDDA5 Desk" : "\\uD83D\\uDCF1 Field"; ' + M)
sub('old button asks _gcChooseView',
    'fmBtn.onclick = function() {\n  // Toggle between Field app and Desk view.\n',
    'fmBtn.onclick = function() {\n  if(window._gcChooseView){ window._gcChooseView(document.documentElement.classList.contains("_fieldmode") ? "desk" : "field"); return; } ' + M + '\n  // Toggle between Field app and Desk view.\n')
sub('toolbar: the button on the desk says Field view',
    "{k:'desk', ic:'🖥', t:'Desk / Field view',",
    "{k:'desk', ic:'📱', t:'Field view (GrayCo Field)', " + M)

# 3. GrayCo Field
sub('FIELD: a phone asks _gcView',
    'function phoneDevice(){ var sw = (W.screen',
    "function phoneDevice(){ try { if (W._gcView) return !!(W._gcView.phone() || W._gcView.pref() === 'field'); } catch (e) {} " + M + ' var sw = (W.screen')
sub('FIELD: desk view chosen asks _gcView',
    "function deskPref(){ return lsGet(DESK_KEY) === '1'; }",
    "function deskPref(){ try { if (W._gcView) return W._gcView.pref() === 'desk'; } catch (e) {} " + M + " return lsGet(DESK_KEY) === '1'; }")
sub('FIELD: 🖥 Desk in the header',
    '<span id="gc-fh-sync" data-k="ok">✓ All sent</span></div><div class="fh-wrap">\'',
    '<span id="gc-fh-sync" data-k="ok">✓ All sent</span>\' + (W._gcView && W._gcView.headBtn ? W._gcView.headBtn() : \'\') + \'</div><div class="fh-wrap">\' ' + M)
sub('FIELD: 🖥 Desk view in ☰ More',
    '\'<button type="button" data-m="settings"><span class="e">⚙</span><span>Settings</span></button>\' +',
    '\'<button type="button" data-m="settings"><span class="e">⚙</span><span>Settings</span></button>\' + (W._gcView && W._gcView.moreItem ? W._gcView.moreItem() : \'\') + ' + M)

# 4. role apps
sub('ROLEAPPS: a phone asks _gcView',
    'function phone(){ try { if (F() && F().phone) return !!F().phone(); } catch (e) {}',
    'function phone(){ try { if (W._gcView) return !!W._gcView.phone(); } catch (e) {} ' + M + ' try { if (F() && F().phone) return !!F().phone(); } catch (e) {}')
sub('ROLEAPPS: the person\'s choice wins',
    "if (a === 'crew') return 'field'; return phone() ? 'field' : 'desk'; }",
    "if (a === 'crew') return 'field'; try { var vp = W._gcView ? W._gcView.pref() : ''; if (vp) return vp; } catch (e) {} " + M + " return phone() ? 'field' : 'desk'; }")

# 5. the old sticky guard
sub('old sticky guard retired',
    "function wantsField(){ try{ return localStorage.getItem(FM_KEY)==='1'; }catch(e){ return false; } }",
    "function wantsField(){ if(window._gcView) return false; " + M + " try{ return localStorage.getItem(FM_KEY)==='1'; }catch(e){ return false; } }")

if t == orig:
    print('FIELDDESK: already patched'); sys.exit(0)
open(p, 'w', encoding='utf-8').write(t)
print('FIELDDESK: done')
