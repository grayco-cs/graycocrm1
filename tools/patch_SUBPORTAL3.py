#!/usr/bin/env python3
"""Idempotent patch SUBPORTAL3 (owner 11/02): "all photos should be in the sub portal from GrayCo Photos; the sub portal should have
everything they need on it to do work at the customer's house."  The CRM side (index.html):
* 📸 GrayCo Photos' "Subs see it" follows the new rule of the sub portal (netlify/functions/sub-photos.js, _lib/cc-vis.js): a sub on
  the job sees EVERY photo of it, whether or not the customer sees it, unless a person clicked "Hidden from subs" ("Internal only" =
  hidden from the customer AND from subs).
* The "Who sees a photo" help text says so.
* A photo a sub sent from the sub portal says who added it: the tile shows "FROM SUB" and "Added by <company> (sub) · <date>", the
  photo's details "🧰 Added by <company> (sub) · <date> · from the sub portal".
Each anchor must be in the page exactly once; a second run prints "already patched" and changes nothing.
Usage: python3 tools/patch_SUBPORTAL3.py [index.html]"""
import os, sys
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
t = open(p, encoding='utf-8').read()
MARK = '/* patch SUBPORTAL3 */'
if MARK in t:
    print('SUBPORTAL3: already patched'); sys.exit(0)

EDITS = [
    # 1. the sub rule
    ("function subsOf(r){ var f = ccFlag(r), h = f && f.deleted !== true ? f.hideSubs : r.hideSubs; if (h === true) return false; if (h === false) return true; return sharedOf(r); }",
     "function subsOf(r){ var f = ccFlag(r), h = f && f.deleted !== true ? f.hideSubs : r.hideSubs; return h !== true; }   /* patch SUBPORTAL3: subs see every photo of their job unless a person hid it from subs */"),
    ("/* who sees a photo. Customer: \"shared\" (Damage starts internal). Subs: hideSubs true = hidden, false = shown,\n   not set = the same as the customer (so an \"Internal only\" photo is never shown to a sub).",
     "/* who sees a photo. Customer: \"shared\" (Damage starts internal). Subs (patch SUBPORTAL3, owner 11/02): every photo of their job,\n   unless hideSubs is true (\"Hidden from subs\"; \"Internal only\" = hidden from the customer and from subs)."),
    # 2. the details line of a sub's photo
    ("\">🧰 From sub portal · ' + esc(s(r.subCompany || r.subName || s(r.by).replace(/ \\(sub( portal)?\\)$/, ''))) + ' · ' + esc(s(r.at).slice(0, 10)) + (sharedOf(r) ? '' : ' · hidden from the customer') + '</div>';   /* patch SUBPHOTOS */",
     "\">🧰 Added by ' + esc(subWho(r)) + ' (sub) · ' + esc(s(r.at).slice(0, 10)) + ' · from the sub portal' + (sharedOf(r) ? '' : ' · hidden from the customer') + '</div>';   /* patch SUBPHOTOS + SUBPORTAL3 */"),
    # 4. the settings help text says the new rule
    ("<b>Subs see it</b> puts it on the sub portal for subs on that job. Damage photos start internal.",
     "Subs on that job see every photo in the sub portal unless you tap <b>Subs see it</b> so it reads <b>Hidden from subs</b>. Damage photos start hidden from the customer."),
    # 3. the tile: "FROM SUB" + "Added by <company> (sub) · <date>" (a wrapper, so the tile code itself is not edited)
    ("function tileHtml(r){ return pvTile(r, 'job'); }",
     "function tileHtml(r){ return pvTile(r, 'job'); }\n"
     + MARK + "\n"
     "function subWho(r){ return s(r.subCompany || r.subName || s(r.by).replace(/ \\(sub( portal)?\\)$/, '')) || 'Subcontractor'; }\n"
     "var pvTileBase = pvTile;\n"
     "pvTile = function(r, mode){\n"
     "  var h = pvTileBase(r, mode); if (!r || r.source !== 'sub') return h;\n"
     "  if (!document.getElementById('gc-subportal3-css')) { var st = document.createElement('style'); st.id = 'gc-subportal3-css'; st.textContent = '.gcu-subby{position:absolute;left:0;right:0;top:0;padding:2px 5px;font-size:9px;font-weight:700;line-height:1.3;color:#fff;background:rgba(180,83,9,.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;pointer-events:none}'; document.head.appendChild(st); }\n"
     "  var by = 'Added by ' + subWho(r) + ' (sub) · ' + s(r.at).slice(0, 10);\n"
     "  return h.replace('<span class=\"gcu-subb\">SUB</span>', '<span class=\"gcu-subb\" title=\"From the sub portal\">FROM SUB</span><span class=\"gcu-subby\" data-subby=\"1\">' + esc(by) + '</span>');\n"
     "};"),
]
for a, b in EDITS:
    n = t.count(a)
    assert n == 1, 'SUBPORTAL3: anchor found %d times: %r' % (n, a[:90])
    t = t.replace(a, b)
open(p, 'w', encoding='utf-8').write(t)
print('SUBPORTAL3: patched (%d edits)' % len(EDITS))
