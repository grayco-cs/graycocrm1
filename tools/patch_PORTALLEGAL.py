#!/usr/bin/env python3
"""Idempotent patch PORTALLEGAL: the customer portal shows only customer-facing legal links.
Hard rule: a customer must never learn that subs have a portal. The customer portal (portal.html) footer and its
sign-in note listed "Sub Portal Terms of Use · Sub Portal Privacy Notice" (legal2.js linksHtml('all')).
  * legal2.js (all three copies + the generator tools/legal2/runtime.py):
      linksHtml(base, 'sub')      → Sub Portal Terms of Use · Sub Portal Privacy Notice · E-SIGN Disclosure (unchanged)
      linksHtml(base, 'all')      → every notice (internal use only)
      linksHtml(base[, other])    → Customer Portal Terms of Use · Privacy · E-SIGN Disclosure   (the default now)
      the sign-in note: customers get the customer terms + Privacy; the bid / sub sign-in gets the sub terms + notice.
  * portal.html footer: Customer Portal Terms of Use · Privacy · E-SIGN Disclosure.
  * tools/patch_LEGAL2.py: the same footer, so a rebuild does not bring the sub links back.
usage: python3 tools/patch_PORTALLEGAL.py [repo root]"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
MARK = '/* PORTALLEGAL'

def once(src, a, b, what, n=1):
    c = src.count(a)
    assert c == n, 'PORTALLEGAL %s: expected %d of %r, found %d' % (what, n, a[:90], c)
    return src.replace(a, b)

def rd(p): return open(os.path.join(root, p), encoding='utf-8').read()
def wr(p, s): open(os.path.join(root, p), 'w', encoding='utf-8').write(s)

OLD_LINKS = """  base = base || ''; var L = which === 'sub' ? [['Sub Portal Terms of Use', '/sub-terms.html'], ['Sub Portal Privacy Notice', '/sub-privacy.html'], ['E-SIGN Disclosure', '/esign-consent.html']]
    : [['Customer Portal Terms of Use', '/portal-terms.html'], ['Sub Portal Terms of Use', '/sub-terms.html'], ['Privacy', '/privacy.html'], ['Sub Portal Privacy Notice', '/sub-privacy.html'], ['E-SIGN Disclosure', '/esign-consent.html']];"""
NEW_LINKS = """  base = base || ''; var L = which === 'sub' ? [['Sub Portal Terms of Use', '/sub-terms.html'], ['Sub Portal Privacy Notice', '/sub-privacy.html'], ['E-SIGN Disclosure', '/esign-consent.html']]
    : which === 'all' ? [['Customer Portal Terms of Use', '/portal-terms.html'], ['Sub Portal Terms of Use', '/sub-terms.html'], ['Privacy', '/privacy.html'], ['Sub Portal Privacy Notice', '/sub-privacy.html'], ['E-SIGN Disclosure', '/esign-consent.html']]
    : [['Customer Portal Terms of Use', '/portal-terms.html'], ['Privacy', '/privacy.html'], ['E-SIGN Disclosure', '/esign-consent.html']];   """ + MARK + """: customers never see the sub portal's papers */"""
OLD_NOTE = """function signinNote(base){"""
NEW_NOTE = """function signinNote(base, which){"""
OLD_NOTE2 = """'By signing in you agree to the ' + linksHtml(base, 'all').replace(' &middot; Sub Portal Privacy Notice', '').replace(' &middot; E-SIGN Disclosure', '') + '"""
NEW_NOTE2 = """'By signing in you agree to the ' + linksHtml(base, which === 'sub' ? 'sub' : 'customer').split(' &middot; ').filter(function(x){ return x.indexOf('E-SIGN') < 0; }).join(' &middot; ') + '"""
OLD_P1 = "tgt.appendChild(signinNote(base))"
NEW_P1 = "tgt.appendChild(signinNote(base, o.bid ? 'sub' : 'customer'))"
OLD_P2 = "var n = signinNote(base);"
NEW_P2 = "var n = signinNote(base, 'sub');"

done = 0
for p in ('legal2.js', 'subportal/legal2.js', 'subportal-app/public/legal2.js', 'tools/legal2/runtime.py'):
    s = rd(p)
    if MARK in s: continue
    s = once(s, OLD_LINKS, NEW_LINKS, p)
    s = once(s, OLD_NOTE, NEW_NOTE, p)
    s = once(s, OLD_NOTE2, NEW_NOTE2, p)
    s = once(s, OLD_P1, NEW_P1, p)
    s = once(s, OLD_P2, NEW_P2, p)
    wr(p, s); done += 1

OLD_FOOT = ('<a href="/portal-terms.html" target="_blank" rel="noopener">Customer Portal Terms of Use</a> &middot; <a href="/sub-terms.html" target="_blank" rel="noopener">Sub Portal Terms of Use</a> &middot; '
            '<a href="/privacy.html" target="_blank" rel="noopener">Privacy</a> &middot; <a href="/sub-privacy.html" target="_blank" rel="noopener">Sub Portal Privacy Notice</a> &middot; <a href="/esign-consent.html" target="_blank" rel="noopener">E-SIGN Disclosure</a>')
NEW_FOOT = ('<a href="/portal-terms.html" target="_blank" rel="noopener">Customer Portal Terms of Use</a> &middot; '
            '<a href="/privacy.html" target="_blank" rel="noopener">Privacy</a> &middot; <a href="/esign-consent.html" target="_blank" rel="noopener">E-SIGN Disclosure</a>')
s = rd('portal.html')
if OLD_FOOT in s:
    s = once(s, OLD_FOOT, NEW_FOOT, 'portal.html'); wr('portal.html', s); done += 1
assert 'sub-terms.html' not in rd('portal.html') and 'sub-privacy.html' not in rd('portal.html'), 'PORTALLEGAL: portal.html still links a sub paper'
s = rd('tools/patch_LEGAL2.py')
if OLD_FOOT in s:
    s = once(s, OLD_FOOT, NEW_FOOT, 'patch_LEGAL2.py'); wr('tools/patch_LEGAL2.py', s); done += 1
print('PORTALLEGAL: ' + ('patched (%d files)' % done if done else 'already patched'))
