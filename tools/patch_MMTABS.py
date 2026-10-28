#!/usr/bin/env python3
"""Idempotent patch MMTABS: the Marketing Manager's own left-menu tabs + admins assign to-dos to him.

    python3 tools/patch_MMTABS.py [repo-root]      (default: the current directory)

Builds on patch MM (tools/... gc-patch-mm-early / gc-patch-mm in index.html, netlify/functions/soc.js, _lib/mm.js).
index.html
  1. patch MM early: window._gcMMTabs (the tab list: id, icon, label, section, sections of the tab); his saved view may be a tab.
  2. the app's view switch: the tab ids draw the Marketing mount (same element, same key) and tell window._gcMMTabView.
  3. patch RP: his menu = Marketing, the tabs, GrayCo Systems (MM_TABS); the menu knows the tab items.
  4. patch MM: his start screen may be a tab.
  5. patch TD2 (✅ To-Do): the Marketing Manager is in "Give it to", "@name" and the person lookup (he is not active
     staff: window._gcMMPeople() = users role "Marketing Manager" + gc_staff profile "marketing"); _gcTD2.addRec(rec).
  6. the Google-connect banner and Launch Job's "✨ Fill from a lead" never show for him.
  7. <script id="gc-patch-mmtabs"> (tools/mmtabs_tail.js) after gc-patch-mm: the tabs, ‹ Back, admins' "＋ Task for marketing".
netlify/functions/_lib/mm.js
  8. his to-dos: also a to-do whose assigneeEmail is his (the voice / AI to-dos); the list carries who added it.
Every find-string must match exactly once; a file that already carries the MMTABS marker is left alone.
"""
import os, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
HERE = os.path.dirname(os.path.abspath(__file__))
MARK = 'MMTABS'
TAIL = open(os.path.join(HERE, 'mmtabs_tail.js'), encoding='utf-8').read().rstrip('\n')

TABS = [  # id, icon, label, section, other sections of the tab
    ('mmt_todo', '✅', 'My To-Do', 'mytodo', []),
    ('mmt_leads', '📈', 'My leads', 'myleads', ['website']),
    ('mmt_appr', '✔️', 'Marketing approvals', 'mmappr', []),
    ('mmt_email', '✉️', 'E-mail & newsletter', 'campaigns', ['newsletter']),
    ('mmt_social', '📱', 'Social posts / Week plan', 'socweek', ['social']),
    ('mmt_cal', '🗓', 'Content calendar', 'calendar', []),
    ('mmt_reviews', '⭐', 'Reviews & referrals', 'reviews', ['refprog']),
    ('mmt_ads', '🎯', 'Ads', 'adshub', ['adsrest', 'ads', 'library']),
    ('mmt_media', '🗂', 'Media library', 'media', []),
    ('mmt_ideas', '💡', 'Ideas board', 'experiments', ['ideas']),
    ('mmt_logins', '🔗', 'Marketing logins', 'logins', []),
]
# the marketing sign-in pages (owner: "google analytics and all of these login pages i need for google ads"): links only,
# never a password or key. soon = the account / link is not set up yet (the website footer has no company LinkedIn / Instagram).
LOGINS = [  # key, icon, label, url, what it is for, soon
    ('ga', '📊', 'Google Analytics', 'https://analytics.google.com/', 'Website visitors, where they came from, which pages turn into calls and form leads', False),
    ('gsc', '🔎', 'Google Search Console', 'https://search.google.com/search-console?resource_id=sc-domain:grayco-cs.com', 'How grayco-cs.com shows in Google search: queries, clicks, pages Google cannot read', False),
    ('gads', '🎯', 'Google Ads', 'https://ads.google.com/', 'Search ads and Local Services Ads: budgets, keywords, conversions (spend changes go through an admin)', False),
    ('gbp', '📍', 'Google Business Profile', 'https://business.google.com/', 'The Google Maps listing: posts, photos, hours, review replies', False),
    ('gtag', '🏷', 'Google Tag / Tag Assistant', 'https://tagassistant.google.com/', 'Check the website tags fire (Analytics, Ads conversions) before and after a change', False),
    ('meta', '📘', 'Meta Business Suite', 'https://business.facebook.com/', 'Facebook and Instagram pages: posts, inbox, ads', False),
    ('metaev', '📡', 'Meta Events Manager (pixel)', 'https://business.facebook.com/events_manager2/', 'The Facebook / Instagram pixel: website leads counted for the ads', False),
    ('site', '🌍', 'Website editor', 'https://grayco-cs.com/', 'Edit the website: open grayco-cs.com, then the gear button, bottom right', False),
    ('review', '⭐', 'Google review link', 'https://grayco-cs.com/review', 'The short link to send customers for a Google review (also on the QR codes)', False),
    ('linkedin', '💼', 'LinkedIn', 'https://www.linkedin.com/', 'The company page for commercial work and hiring posts', True),
    ('instagram', '📸', 'Instagram', 'https://www.instagram.com/', 'Reels and before / after photos', True),
    ('callrail', '📞', 'CallRail', 'https://app.callrail.com/', 'Call tracking: which ad or page made the phone ring', True),
]
IDS = [t[0] for t in TABS]


def js_tabs():
    rows = []
    for i, ic, l, sec, also in TABS:
        rows.append("{ id: '%s', ic: '%s', l: '%s', sec: '%s', also: [%s] }" % (i, ic, l, sec, ', '.join("'%s'" % a for a in also)))
    return '[\n  ' + ',\n  '.join(rows) + '\n]'


def js_logins():
    q = lambda v: "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
    rows = ["{ k: %s, ic: %s, l: %s, url: %s, d: %s, soon: %s }" % (q(k), q(ic), q(l), q(u), q(d), 'true' if soon else 'false') for k, ic, l, u, d, soon in LOGINS]
    return '[\n  ' + ',\n  '.join(rows) + '\n]'


def rd(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def wr(rel, txt):
    with open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(txt)


def edit(rel, pairs):
    src = rd(rel)
    if MARK in src:
        print('already patched:', rel)
        return
    for find, repl in pairs:
        n = src.count(find)
        assert n == 1, (rel, 'find-string matched %d times' % n, find[:90])
        src = src.replace(find, repl)
    wr(rel, src)
    print('patched:', rel)


def index():
    cases = ''.join('case"%s":' % i for i in IDS)
    mm_tabs = ', '.join("'%s'" % i for i in ['marketing'] + IDS + ['systems'])
    edit('index.html', [
        # 1. the tab list (for everyone: the admins' code reads it too), his saved view may be a tab
        ("W._gcIsMM = isMM;\nif (!isMM()) return;",
         "W._gcIsMM = isMM;\n"
         "/* patch MMTABS: his left-menu tabs — each one is the Marketing screen opened at a section (sec), with the tab's other sections (also) */\n"
         "W._gcMMTabs = " + js_tabs() + ";\n"
         "/* patch MMTABS: the marketing sign-in pages (links only — never a password or key); soon = not set up yet */\n"
         "W._gcMktLogins = " + js_logins() + ";\n"
         "if (!isMM()) return;"),
        ("try { var v = localStorage.getItem('grayco_view'); if (v !== 'marketing') localStorage.setItem('grayco_view', 'marketing'); } catch (e) {}",
         "try { var v = localStorage.getItem('grayco_view'); if (v !== 'marketing' && !/^mmt_[a-z]+$/.test(v || '')) localStorage.setItem('grayco_view', 'marketing'); } catch (e) {}   /* patch MMTABS: or one of his tabs */"),
        # 2. the view switch
        ('case"marketing":return e.jsx("div",{key:"gc-view-marketing",id:"gc-mk-mount",ref:function(el){if(el&&window._gcMktMount)window._gcMktMount(el)},',
         cases + 'case"marketing":return e.jsx("div",{key:"gc-view-marketing",id:"gc-mk-mount",ref:function(el){if(el&&window._gcMktMount)window._gcMktMount(el);if(el&&window._gcMMTabView)window._gcMMTabView(P,el)/* patch MMTABS */},'),
        # 3. patch RP: his menu
        ("var MM_TABS = { 'Marketing Manager': ['marketing', 'systems'] };",
         "var MM_TABS = { 'Marketing Manager': [" + mm_tabs + "] };   /* patch MMTABS: his own tabs (window._gcMMTabs) */"),
        ("var by = {}; arr(Uf).forEach(function(g){ by[g.id] = g; });",
         "var by = {}; arr(Uf).forEach(function(g){ by[g.id] = g; });\n"
         "      if (role === 'Marketing Manager') arr(W._gcMMTabs).forEach(function(g){ if (!by[g.id]) by[g.id] = { id: g.id, l: g.l, ic: g.ic }; });   /* patch MMTABS */"),
        # 4. patch MM: his start screen
        ("if (!/^(marketing|systems)$/.test(localStorage.getItem('grayco_view') || '')",
         "if (!/^(marketing|systems|mmt_[a-z]+)$/.test(localStorage.getItem('grayco_view') || '')   /* patch MMTABS: or one of his tabs */"),
        ("  var KEEP = {}; SECS.forEach(function(x){ KEEP[x.id] = 1; });",
         "  var KEEP = { logins: 1 }; SECS.forEach(function(x){ KEEP[x.id] = 1; });   /* patch MMTABS: + 🔗 Marketing logins */"),
        # GrayCo Systems: the marketing logins in "Website & marketing" (the Marketing Manager sees that group); admin systems stay admin-only
        ("  if (adm) t = t.concat([\n",
         "  t = t.concat(arr(W._gcMktLogins).map(function(x){ return { g: 'Website & marketing', k: 'ml_' + x.k, ic: x.ic, b: x.l + (x.soon ? ' (set up soon)' : ''), d: x.d }; }));   /* patch MMTABS: marketing logins */\n"
         "  if (adm) t = t.concat([\n"),
        ("  if (URLS[k]) return W.open(URLS[k], '_blank', 'noopener');",
         "  if (/^ml_/.test(k)) { var _ml = arr(W._gcMktLogins).filter(function(x){ return 'ml_' + x.k === k; })[0]; if (_ml) return W.open(_ml.url, '_blank', 'noopener'); }   /* patch MMTABS */\n"
         "  if (URLS[k]) return W.open(URLS[k], '_blank', 'noopener');"),
        # 5. patch TD2: the Marketing Manager can be given a to-do
        ("  if (!seen['office@grayco-cs.com']) out.push(person('office@grayco-cs.com'));\n  return out;",
         "  mmPeople().forEach(function(u){ var p = person(u.email); if (!p || seen[p.key]) return; seen[p.key] = 1; out.push(p); });   /* patch MMTABS: the Marketing Manager (not active staff) */\n"
         "  if (!seen['office@grayco-cs.com']) out.push(person('office@grayco-cs.com'));\n  return out;"),
        ("  var u = users().filter(function(x){ return x && (low(x.email) === k || low(x.name) === k); })[0]\n       || users().filter(function(x){ return x && k.indexOf('@') < 0 && low(s(x.name).split(' ')[0]) === k; })[0];",
         "  var u = users().filter(function(x){ return x && (low(x.email) === k || low(x.name) === k); })[0]\n       || users().filter(function(x){ return x && k.indexOf('@') < 0 && low(s(x.name).split(' ')[0]) === k; })[0]\n"
         "       || mmPeople().filter(function(x){ return low(x.email) === k || low(x.name) === k; })[0];   /* patch MMTABS */"),
        ("users().forEach(function(u){ if (p || !u) return; var full = low(u.name)",
         "users().concat(mmPeople()).forEach(function(u){ if (p || !u) return; var full = low(u.name)"),
        ("function pkey(k){ var p = person(k); return p ? p.key : ''; }",
         "function pkey(k){ var p = person(k); return p ? p.key : ''; }\n"
         "function mmPeople(){ try { return typeof W._gcMMPeople === 'function' ? arr(W._gcMMPeople()) : []; } catch (e) { return []; } }   /* patch MMTABS: Marketing Managers {name, email} */"),
        ("  state: function(){ return state(true); }, parse: parse, add: function(text){",
         "  addRec: function(rec){ if (!rec || !rec.id || !rec.label) return false; storeAdd(OT, rec); dirty = true; paint(true); return true; },   /* patch MMTABS: a ready record (📣 Marketing → ＋ Task for marketing) */\n"
         "  state: function(){ return state(true); }, parse: parse, add: function(text){"),
        # 6. not for him: the Google-connect banner, "✨ Fill from a lead"
        ("  function showBanner(){\n    if(connected() || dismissedRecently())",
         "  function showBanner(){\n    if(window._gcIsMM && window._gcIsMM()){ var _mx=document.getElementById('_gConnBar'); if(_mx) _mx.remove(); return; }   /* patch MMTABS: not for the Marketing Manager */\n    if(connected() || dismissedRecently())"),
        ("function launchBar(){\n  var main = D.querySelector('main'); if (!main) return;",
         "function launchBar(){\n  var main = D.querySelector('main'); if (!main) return;\n"
         "  try { if (typeof W._gcIsMM === 'function' && W._gcIsMM()) { var _mh = main.querySelector('.gcx12-launch'); if (_mh) _mh.remove(); return; } } catch (e) {}   /* patch MMTABS: never for the Marketing Manager (customer names) */"),
        # 7. the tabs script, after patch MM
        ("</script><!-- /MM -->",
         "</script><!-- /MM -->\n" + TAIL + "<!-- /MMTABS -->"),
        # the My To-Do line shows who gave it to him
        ("(t.due ? ' <span class=\"gmt-muted\">due ' + esc(t.due) + '</span>' : '') + (t.note ?",
         "(t.due ? ' <span class=\"gmt-muted\">due ' + esc(t.due) + '</span>' : '') + (t.by && !t.self ? ' <span class=\"gmt-muted\" data-mm-by>· from ' + esc(t.by) + '</span>' : '') /* patch MMTABS */ + (t.note ?"),
    ])
    src = rd('index.html')
    assert src.index('id="gc-patch-mm">') < src.index('id="gc-patch-mmtabs">')


def mmlib():
    edit('netlify/functions/_lib/mm.js', [
        ("function mine(t, email){ return !!t && !t.deleted && (arr(t.assignees).map(low).indexOf(email) >= 0 || low(t.assignee) === email || low(t.owner) === email || low(t.addedByEmail) === email && t.personal); }",
         "function mine(t, email){ return !!t && !t.deleted && (arr(t.assignees).map(low).indexOf(email) >= 0 || low(t.assignee) === email || low(t.assigneeEmail) === email || low(t.owner) === email || low(t.addedByEmail) === email && t.personal); }   /* patch MMTABS: + assigneeEmail (voice / AI to-dos) */"),
        ("return { id: s(t.id), label: scrubText(s(t.label)), note: scrubText(s(t.note)).slice(0, 600), due: s(t.due), done: !!t.done,",
         "return { id: s(t.id), label: scrubText(s(t.label)), note: scrubText(s(t.note)).slice(0, 600), due: s(t.due), done: !!t.done, by: scrubText(s(t.addedBy)).slice(0, 60), self: low(t.addedByEmail) === email || !!t.self /* patch MMTABS */,"),
    ])


if __name__ == '__main__':
    index()
    mmlib()
