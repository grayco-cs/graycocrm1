#!/usr/bin/env python3
"""Idempotent patch MKTOFFICE (owner 11/19): marketing accounts, phone-call leads counted right, admin -> marketing messages,
the office's call-screening script.

1. GQLINKS' "🔗 Google quick links" strip becomes the "🔗 Marketing accounts" panel: Google (LSA dashboard + leads, Google Ads,
   Keyword Planner, Business Profile, Analytics, Search Console, Tag Manager, Merchant Center), Meta (Business Suite, Ads Manager,
   Events Manager, Instagram, the Facebook Page), the listings the CRM knows (Angi, Nextdoor, Yelp, BBB — the saved listing link
   too), the website editor and the review link. Admin-editable in the marketing settings (cfg.main.quickLinks: urls, ids, extra,
   cid), an account-ID label with 📋 Copy per link, no passwords. Admins and the marketing role only (desk, and Field ☰ More).
2. tools/mktoffice_block.html becomes a script right after GQLINKS: 📞 Log a phone call lead, 📋 Call script, 💬 Message marketing,
   "How did you hear?" on the lead page (see the block's header).
3. GrayCo Field ☰ More → Office: 🔗 Marketing accounts, 📞 Log a phone call lead, 📋 Call script, 💬 Message marketing.
4. LSALEADS' office intake (📞 Google call — fill in the lead) asks "How did you hear about us?" (Google LSA preselected); the
   answer goes to the server (lsaintake howHeard) and onto the lead.
Server: netlify/functions/_lib/mmmsg.js, _lib/calllead.js, soc.js ops; _lib/smsalert.js lsaIntake keeps howHeard.
Kill switch: localStorage gc_mktoffice_off = '1'.
Usage: python3 tools/patch_MKTOFFICE.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_MKTOFFICE__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

HERE = os.path.dirname(os.path.abspath(__file__))
BLOCK = open(os.path.join(HERE, 'mktoffice_block.html'), encoding='utf-8').read().rstrip('\n')

# ── 1. GQLINKS → 🔗 Marketing accounts ──
src = once(src, """var DEF = [
  { k: 'lsa', ic: '📍', l: 'LSA dashboard', url: 'https://ads.google.com/localservices/', d: 'Google Local Services Ads: budget, hours, service area, Google Guaranteed' },""",
"""/* patch MKTOFFICE: the full 🔗 Marketing accounts panel — g = the group; lst = the 📣 Marketing → Listings record whose saved link is shown too */
var GROUPS = [['google', 'Google'], ['meta', 'Meta (Facebook / Instagram)'], ['list', 'Listings'], ['web', 'Website & reviews'], ['x', 'More']];
var DEF = [
  { g: 'google', k: 'lsa', ic: '📍', l: 'LSA dashboard', url: 'https://ads.google.com/localservices/', d: 'Google Local Services Ads: budget, hours, service area, Google Guaranteed' },""")
src = once(src, """  { k: 'lsaleads', ic: '📞', l: 'LSA leads', url: 'https://ads.google.com/localservices/leads', d: 'Every LSA call / message: listen, rate, dispute a junk lead', login: 'lsa' },
  { k: 'gads', ic: '🎯', l: 'Google Ads', url: 'https://ads.google.com/', d: 'Search ads: campaigns, budgets, keywords, conversions', login: 'gads' },
  { k: 'kwp', ic: '🔑', l: 'Keyword Planner', url: 'https://ads.google.com/aw/keywordplanner/home', d: 'Search volume and bids for new keywords' },
  { k: 'gbp', ic: '🏢', l: 'Business Profile', url: 'https://business.google.com/', d: 'The Google Maps listing: posts, photos, hours, review replies', login: 'gbp' },
  { k: 'ga', ic: '📊', l: 'Analytics', url: 'https://analytics.google.com/', d: 'Website visitors and where they came from', login: 'ga' },
  { k: 'gsc', ic: '🔎', l: 'Search Console', url: 'https://search.google.com/search-console', d: 'How grayco-cs.com shows in Google search', login: 'gsc' },
  { k: 'gtm', ic: '🏷', l: 'Tag Manager', url: 'https://tagmanager.google.com/', d: 'The website tags (Analytics, Ads conversions)' },
  { k: 'review', ic: '⭐', l: 'Review link', url: '', d: 'The short link to send customers for a Google review', login: 'review' }
];""",
"""  { g: 'google', k: 'lsaleads', ic: '📞', l: 'LSA leads', url: 'https://ads.google.com/localservices/leads', d: 'Every LSA call / message: listen, rate, dispute a junk lead', login: 'lsa' },
  { g: 'google', k: 'gads', ic: '🎯', l: 'Google Ads', url: 'https://ads.google.com/', d: 'Search ads: campaigns, budgets, keywords, conversions', login: 'gads' },
  { g: 'google', k: 'kwp', ic: '🔑', l: 'Keyword Planner', url: 'https://ads.google.com/aw/keywordplanner/home', d: 'Search volume and bids for new keywords' },
  { g: 'google', k: 'gbp', ic: '🏢', l: 'Business Profile', url: 'https://business.google.com/', d: 'The Google Maps listing: posts, photos, hours, review replies', login: 'gbp' },
  { g: 'google', k: 'ga', ic: '📊', l: 'Analytics', url: 'https://analytics.google.com/', d: 'Website visitors and where they came from', login: 'ga' },
  { g: 'google', k: 'gsc', ic: '🔎', l: 'Search Console', url: 'https://search.google.com/search-console', d: 'How grayco-cs.com shows in Google search', login: 'gsc' },
  { g: 'google', k: 'gtm', ic: '🏷', l: 'Tag Manager', url: 'https://tagmanager.google.com/', d: 'The website tags (Analytics, Ads conversions)' },
  { g: 'google', k: 'gmc', ic: '🛒', l: 'Merchant Center', url: 'https://merchants.google.com/', d: 'Google Merchant Center: the business and its free listings on Google' },
  { g: 'meta', k: 'metabs', ic: '📘', l: 'Business Suite', url: 'https://business.facebook.com/', d: 'Meta Business Suite: the Facebook and Instagram pages, posts, inbox' },
  { g: 'meta', k: 'metaads', ic: '📊', l: 'Ads Manager', url: 'https://adsmanager.facebook.com/', d: 'Meta Ads Manager: Facebook / Instagram ad campaigns, budgets, results' },
  { g: 'meta', k: 'metaev', ic: '📡', l: 'Events Manager', url: 'https://business.facebook.com/events_manager2', d: 'The Meta pixel: website leads counted for the ads' },
  { g: 'meta', k: 'ig', ic: '📸', l: 'Instagram', url: 'https://www.instagram.com/', d: 'Instagram: reels, before / after photos', lst: 'instagram' },
  { g: 'meta', k: 'fbpage', ic: '👍', l: 'Facebook Page', url: 'https://www.facebook.com/GrayCoConstructionServices', d: 'The GrayCo Facebook page (the saved listing link wins)', lst: 'facebook', page: true },
  { g: 'list', k: 'angi', ic: '🏠', l: 'Angi', url: 'https://office.angi.com/', d: 'Angi for pros (sign in); the listing link from Marketing → Listings is beside it', lst: 'angi' },
  { g: 'list', k: 'nextdoor', ic: '🏡', l: 'Nextdoor', url: 'https://business.nextdoor.com/', d: 'Nextdoor Business (sign in)', lst: 'nextdoor' },
  { g: 'list', k: 'yelp', ic: '⭐', l: 'Yelp', url: 'https://biz.yelp.com/', d: 'Yelp for Business (sign in)', lst: 'yelp' },
  { g: 'list', k: 'bbb', ic: '🛡', l: 'BBB', url: 'https://www.bbb.org/', d: 'Better Business Bureau business login', lst: 'bbb' },
  { g: 'web', k: 'site', ic: '🌍', l: 'Website editor', url: 'https://grayco-cs.com/', d: 'Edit the website: open grayco-cs.com, then the gear button, bottom right', login: 'site' },
  { g: 'web', k: 'review', ic: '⭐', l: 'Review link', url: '', d: 'The short link to send customers for a Google review', login: 'review' }
];
/* the listing's own saved link (📣 Marketing → Listings), when there is one */
function listingUrl(id){ try { var x = X(), r = x && x.MK && x.MK.get ? x.MK.get('listings', id) : null; return r ? okUrl(r.url) : ''; } catch (e) { return ''; } }""")
src = once(src, """  var out = DEF.map(function(d){
    var url = okUrl(u[d.k]) || (d.k === 'review' ? reviewLink() : (d.login && stored(d.login)) || d.url);
    return { k: d.k, ic: d.ic, l: d.l, url: url, d: d.d };
  });
  arr(q.extra).forEach(function(x, i){ var url = okUrl(x && x.url), l = s(x && x.l).slice(0, 40); if (url && l) out.push({ k: 'x' + i, ic: '🔗', l: l, url: url, d: '', extra: true }); });""",
"""  var ids = q.ids && typeof q.ids === 'object' ? q.ids : {};
  var out = DEF.map(function(d){
    var lu = d.lst ? listingUrl(d.lst) : '';
    var url = okUrl(u[d.k]) || (d.k === 'review' ? reviewLink() : (d.login && stored(d.login)) || (d.page && lu) || d.url);
    return { k: d.k, g: d.g, ic: d.ic, l: d.l, url: url, d: d.d, id: s(ids[d.k]).slice(0, 60), listing: lu && lu !== url ? lu : '' };
  });
  arr(q.extra).forEach(function(x, i){ var url = okUrl(x && x.url), l = s(x && x.l).slice(0, 40); if (url && l) out.push({ k: 'x' + i, g: 'x', ic: '🔗', l: l, url: url, d: '', extra: true, id: s(ids['x' + i]).slice(0, 60) }); });""")
src = once(src, """/* the Marketing Manager, admins and the office (Marketing's own role: admin / office / marketing; a PM is 'pm') */
function can(){ if (isMM()) return true; var r = role(); return r === 'admin' || r === 'office' || r === 'marketing'; }""",
"""/* patch MKTOFFICE: the Marketing Manager and admins (Marketing's own role: admin / marketing; the office and a PM do not see it) */
function can(){ if (isMM()) return true; var r = role(); return r === 'admin' || r === 'marketing'; }""")
src = once(src, """  '@media(min-width:700px){#gc-gql-ov{align-items:center}#gc-gql-ov .gql{border-radius:16px}}';""",
"""  '@media(min-width:700px){#gc-gql-ov{align-items:center}#gc-gql-ov .gql{border-radius:16px}}' +
  '.gql-g{margin:0 0 10px}.gql-gh{font:800 12px Inter,Arial,sans-serif;color:#475569;text-transform:uppercase;letter-spacing:.04em;margin:0 0 6px}.gql-i{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}' +
  '.gql-id{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#334155;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:999px;padding:2px 4px 2px 8px}.gql-id code{font:700 12px ui-monospace,Menlo,Consolas,monospace;user-select:all}' +
  '.gql-id button{border:0;background:#fff;border-radius:999px;cursor:pointer;font-size:12px;padding:2px 6px}.gql-lst{font-size:12px;color:#174ea6;text-decoration:underline}.gql-f .gql-pair{display:grid;grid-template-columns:2fr 1fr;gap:6px}';""")
src = once(src, """  var h = '<!--gql--><div class="gql" data-gql="' + esc(where) + '"><div class="gql-h"><b>🔗 Google quick links</b>' +""",
"""  var h = '<!--gql--><div class="gql" data-gql="' + esc(where) + '"><div class="gql-h"><b>🔗 Marketing accounts</b>' +""")
src = once(src, """    '<div class="gql-l">' + L.map(function(x){ return '<a class="gql-a' + (x.extra ? ' x' : '') + '" data-gql-k="' + esc(x.k) + '" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(x.d || x.l) + '">' + esc(x.ic) + ' ' + esc(x.l) + ' ↗</a>'; }).join('') + '</div>' +
    '<div class="gql-n">Opens Google in a new tab — sign in with your own GrayCo Google account. Links only: no password is kept in the CRM.</div>';""",
"""    GROUPS.map(function(G){ var g = L.filter(function(x){ return (x.g || 'x') === G[0]; }); if (!g.length) return '';   /* patch MKTOFFICE: by group, an account-ID label per link */
      return '<div class="gql-g" data-gql-g="' + G[0] + '"><div class="gql-gh">' + esc(G[1]) + '</div><div class="gql-l">' + g.map(function(x){ return '<span class="gql-i"><a class="gql-a' + (x.extra ? ' x' : '') + '" data-gql-k="' + esc(x.k) + '" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(x.d || x.l) + '">' + esc(x.ic) + ' ' + esc(x.l) + ' ↗</a>' +
        (x.id ? '<span class="gql-id" data-gql-idk="' + esc(x.k) + '">ID <code>' + esc(x.id) + '</code><button type="button" data-gql-copy="' + esc(x.id) + '" title="Copy the account ID">📋</button></span>' : '') +
        (x.listing ? '<a class="gql-lst" data-gql-lst="' + esc(x.k) + '" href="' + esc(x.listing) + '" target="_blank" rel="noopener noreferrer">listing ↗</a>' : '') + '</span>'; }).join('') + '</div></div>'; }).join('') +
    '<div class="gql-n">Opens each account in a new tab — sign in with your own GrayCo account. Links and account IDs only: no password is kept in the CRM.</div>';""")
src = once(src, """    h += '<div class="gql-f" data-gql-form>' + DEF.map(function(d){ var cur = L.filter(function(x){ return x.k === d.k; })[0] || {}; return '<label>' + esc(d.ic + ' ' + d.l) + '<input data-gql-u="' + esc(d.k) + '" value="' + esc(okUrl(u[d.k])) + '" placeholder="' + esc(cur.url) + '"></label>'; }).join('') +""",
"""    var ids0 = q.ids && typeof q.ids === 'object' ? q.ids : {};
    h += '<div class="gql-f" data-gql-form>' + DEF.map(function(d){ var cur = L.filter(function(x){ return x.k === d.k; })[0] || {}; return '<label>' + esc(d.ic + ' ' + d.l) + '<span class="gql-pair"><input data-gql-u="' + esc(d.k) + '" value="' + esc(okUrl(u[d.k])) + '" placeholder="' + esc(cur.url) + '"><input data-gql-idv="' + esc(d.k) + '" value="' + esc(s(ids0[d.k])) + '" placeholder="account ID (optional)" aria-label="' + esc(d.l) + ' account ID"></span></label>'; }).join('') +""")
src = once(src, """  if (bad.length) { toast('Not saved — check: ' + bad[0].slice(0, 60) + ' (https:// links; customer ID like 555-434-6278)'); return; }
  try { X().setCfg({ quickLinks: { urls: urls, extra: extra.slice(0, 20), cid: c || CID } }); } catch (e) { warn(e); toast('Not saved: ' + (e && e.message)); return; }""",
"""  var ids = {}; box.querySelectorAll('[data-gql-idv]').forEach(function(i){ var v = s(i.value).slice(0, 60); if (!v) return; if (/^[\\w .:#\\/-]{1,60}$/.test(v) && !/pass(word)?|pwd/i.test(v)) ids[i.getAttribute('data-gql-idv')] = v; else bad.push(v); });   /* patch MKTOFFICE: account IDs — never a password */
  if (bad.length) { toast('Not saved — check: ' + bad[0].slice(0, 60) + ' (https:// links; customer ID like 555-434-6278; account IDs: letters, numbers, - . : # / only)'); return; }
  try { X().setCfg({ quickLinks: { urls: urls, extra: extra.slice(0, 20), cid: c || CID, ids: ids } }); } catch (e) { warn(e); toast('Not saved: ' + (e && e.message)); return; }""")
src = once(src, """  if (!can()) { toast('Google quick links are for marketing and admins.'); return null; }""",
"""  if (!can()) { toast('Marketing accounts are for marketing and admins.'); return null; }""")
src = once(src, """ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Google quick links');""",
"""ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Marketing accounts');""")

# ── 2. the block, right after GQLINKS ──
a = src.index('<script id="gc-patch-gqlinks">'); b = src.index('</script>', a) + len('</script>')
src = src[:b] + '\n' + BLOCK + src[b:]

# ── 3. GrayCo Field ☰ More ──
src = once(src, """  gql:       { ic: '🔗', l: 'Google quick links', show: function(){ try { return !!(W._gcGQL && W._gcGQL.canField()); } catch (e) { return false; } }, run: function(){ W._gcGQL.sheet(); } }   /* patch GQLINKS: LSA, Google Ads, Business Profile … */
};""",
"""  gql:       { ic: '🔗', l: 'Marketing accounts', show: function(){ try { return !!(W._gcGQL && W._gcGQL.canField()); } catch (e) { return false; } }, run: function(){ W._gcGQL.sheet(); } },   /* patch GQLINKS / MKTOFFICE: Google, Meta, listings, website … */
  calllead:  { ic: '📞', l: 'Log a phone call lead', show: function(){ try { return !!(W._gcCallLead && W._gcCallLead.can()); } catch (e) { return false; } }, run: function(){ W._gcCallLead.open({}); } },   /* patch MKTOFFICE */
  callscript:{ ic: '📋', l: 'Call script', show: function(){ try { return !!(W._gcCallScript && W._gcCallScript.can()); } catch (e) { return false; } }, run: function(){ W._gcCallScript.open(); } },   /* patch MKTOFFICE */
  mmmsg:     { ic: '💬', l: 'Message marketing', show: function(){ try { return !!(W._gcMMMsg && W._gcMMMsg.can() && realAdmin()); } catch (e) { return false; } }, run: function(){ W._gcMMMsg.open(); } }   /* patch MKTOFFICE */
};""")
src = once(src, """var FM_OFF = { admin: ['claims', 'match', 'maint', 'gql'], pm: ['leads', 'estimates', 'maint'], est: ['appr', 'leads', 'estimates'], ins: ['appr'], crew: [], office: ['leads', 'maint'] };""",
"""var FM_OFF = { admin: ['claims', 'match', 'maint', 'gql', 'calllead', 'callscript', 'mmmsg'], pm: ['leads', 'estimates', 'maint'], est: ['appr', 'leads', 'estimates'], ins: ['appr'], crew: [], office: ['leads', 'maint', 'calllead', 'callscript'] };   /* patch MKTOFFICE: + 📞 / 📋 / 💬 */""")

# ── 4. LSALEADS' office intake: "How did you hear about us?" ──
src = once(src, """    + '<label style="display:block;margin-top:8px;font-size:13px;font-weight:700">Address<input data-in-addr value="" style="' + IN + '"></label>'""",
"""    + '<label style="display:block;margin-top:8px;font-size:13px;font-weight:700">Address<input data-in-addr value="" style="' + IN + '"></label>'
    + (typeof W._gcMkoHeardSelect === 'function' ? W._gcMkoHeardSelect() : '')   /* patch MKTOFFICE: "How did you hear about us?" */""")
src = once(src, """address: s(ov.querySelector('[data-in-addr]').value), action: act, pmEmail: pm })""",
"""address: s(ov.querySelector('[data-in-addr]').value), action: act, pmEmail: pm, howHeard: s((ov.querySelector('[data-in-heard]') || {}).value) })""")
src = once(src, """        ov.remove(); seen(x.id);
        toast(R.rating === 'bad' ?""",
"""        ov.remove(); seen(x.id);
        try { if (W._gcMkoIntakeHeard) W._gcMkoIntakeHeard(x.id, s((ov.querySelector('[data-in-heard]') || {}).value)); } catch (e2) {}   /* patch MKTOFFICE */
        toast(R.rating === 'bad' ?""")
open(path, 'w', encoding='utf-8').write(src)
print('patched')
