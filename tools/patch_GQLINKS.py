#!/usr/bin/env python3
"""Idempotent patch GQLINKS: 🔗 Google quick links at the top of 📣 Marketing (owner 11/19: "I want easy links to my LSA,
AdWords, all the Google Ads things I need, so Malcolm can have quick easy access to them").

1. tools/gqlinks_block.html becomes a script right after patch MMTABS: the strip (LSA dashboard / leads, Google Ads, Keyword
   Planner, Business Profile, Analytics, Search Console, Tag Manager, the review link; the LSA customer ID as a copyable
   label) on Marketing's home and 🔗 Marketing logins, for the Marketing Manager, admins and the office; admins edit the list
   (gc_mkt_v1 cfg.main.quickLinks). Links only.
2. patch ROLEAPPS: GrayCo Field ☰ More → Office → 🔗 Google quick links (admins; shown only when window._gcGQL says so).
Usage: python3 tools/patch_GQLINKS.py [index.html]
"""
import os, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_GQLINKS__' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)

BLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gqlinks_block.html'), encoding='utf-8').read().rstrip('\n')
src = once(src, '</script><!-- /MMTABS -->', '</script><!-- /MMTABS -->\n' + BLOCK)

a = src.index('<script id="gc-patch-roleapps">'); b = src.index('</script>', a)
ra = src[a:b]
ra = once(ra, "  camera:    { ic: '📷', l: 'Camera', show: function(){ return !!(W._gcPhotos && W._gcPhotos.open); }, run: function(p){ fmCamera(p); } }   /* patch FIELDMORE: GrayCo Photos' camera */\n};",
  "  camera:    { ic: '📷', l: 'Camera', show: function(){ return !!(W._gcPhotos && W._gcPhotos.open); }, run: function(p){ fmCamera(p); } },   /* patch FIELDMORE: GrayCo Photos' camera */\n"
  "  gql:       { ic: '🔗', l: 'Google quick links', show: function(){ try { return !!(W._gcGQL && W._gcGQL.canField()); } catch (e) { return false; } }, run: function(){ W._gcGQL.sheet(); } }   /* patch GQLINKS: LSA, Google Ads, Business Profile … */\n};")
ra = once(ra, "var FM_OFF = { admin: ['claims', 'match', 'maint'],", "var FM_OFF = { admin: ['claims', 'match', 'maint', 'gql'],")
src = src[:a] + ra + src[b:]
open(path, 'w', encoding='utf-8').write(src)
print('patched')
