#!/usr/bin/env python3
"""Idempotent patch REFWHY: 👤 Customer profile → 🎁 Referrals & reviews never just says "The referral program could not be
reached." (owner 10/27).

  * Server (netlify/functions/_lib/referral.js overview): a part of the program's store that cannot be read (not set up
    yet, a hiccup) counts as empty instead of failing the whole answer; the answer says which part ("degraded").
  * Page: the section shows what is true — no referrals yet ("Not a referral member yet · 0 referrals"), or why it could
    not look (sign in again / office and admins only / the program is not set up yet / it did not answer — try again),
    with ↻ Try again. Usage: python3 tools/patch_REFWHY.py [repo dir]
"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
if root.endswith('index.html'): root = os.path.dirname(root) or '.'
MARK = '/* patch REFWHY'
def edit(path, pairs, label):
    src = open(path, encoding='utf-8').read()
    if MARK in src: print('REFWHY: ' + label + ' already patched'); return
    for a, b in pairs:
        assert src.count(a) == 1, ('REFWHY find-string count != 1', label, src.count(a), a[:80])
        src = src.replace(a, b)
    open(path, 'w', encoding='utf-8').write(src); print('REFWHY: patched ' + label)
SRV = [
("""  const st = await settings();
  const [mems, refs, cs, led] = await Promise.all([members(), referrals(), cards(), ledger()]);""",
 """  """ + MARK + """: a part that cannot be read counts as empty (and is named), the answer still comes */
  const degraded = [];
  const safe = function(name, p, dflt){ return Promise.resolve().then(function(){ return p(); }).catch(function(e){ degraded.push(name + ': ' + s(e && e.message).slice(0, 80)); return dflt; }); };
  const st = await safe('settings', settings, cleanSettings(null));
  const [mems, refs, cs, led] = await Promise.all([safe('members', members, []), safe('referrals', referrals, []), safe('cards', cards, []), safe('ledger', ledger, [])]);"""),
("""  return {
    settings: st, min: MIN, max: MAX, giftMin: GIFT_MIN,""",
 """  return {
    degraded: degraded,   /* patch REFWHY */
    settings: st, min: MIN, max: MAX, giftMin: GIFT_MIN,"""),
]
PAGE = [
("""    getJSON('/.netlify/functions/referral?list=1').then(function(j){
      if (!j || !j.ok) { el.textContent = 'The referral program could not be reached.'; return; }""",
 """    """ + MARK + """: what is true, or why it could not look (+ ↻ Try again) */
    var refLoad = function(){ el.textContent = 'Looking up referrals…';
      var done = false, tm = setTimeout(function(){ if (done) return; done = true; refShow({ __st: 0, __timeout: true }); }, 15000);
      W.fetch('/.netlify/functions/referral?list=1', { cache: 'no-store' }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j = j || {}; j.__st = r.status; return j; }); }, function(){ return { __st: 0 }; })
        .then(function(j){ if (done) return; done = true; clearTimeout(tm); refShow(j); }); };
    var refWhy = function(j){ var st = j && j.__st, e = s(j && j.error);
      if (st === 401) return 'Your sign-in has expired — sign in again to see referrals.';
      if (st === 403) return 'Referral details: office and admins.';
      if (st === 503 && /not configured/i.test(e)) return 'The referral program is not set up yet — no referrals to show.';
      if (j && j.__timeout) return 'The referral program did not answer in time.';
      if (!st) return 'The referral program did not answer (no internet?).';
      return 'The referral program did not answer right now' + (e ? ' (' + e + ')' : '') + '.'; };
    var refShow = function(j){
      if (!j || !j.ok) { el.innerHTML = '<div class="gcd1-row"><span class="gcd1-muted">' + esc(refWhy(j)) + '</span><span class="r"><button class="gcd1-btn s" data-ref-retry="1">↻ Try again</button></span></div>'; var rb = el.querySelector('[data-ref-retry]'); if (rb) rb.onclick = refLoad; return; }"""),
("""        (made.length ? '<div class="gcd1-row"><span>They were referred by</span><span class="r">' + esc(made[0]) + '</span></div>' : '');
    });""",
 """        (made.length ? '<div class="gcd1-row"><span>They were referred by</span><span class="r">' + esc(made[0]) + '</span></div>' : '');
    };
    refLoad();   /* patch REFWHY */"""),
]
edit(os.path.join(root, 'netlify', 'functions', '_lib', 'referral.js'), SRV, 'referral.js')
edit(os.path.join(root, 'index.html'), PAGE, 'index.html')
