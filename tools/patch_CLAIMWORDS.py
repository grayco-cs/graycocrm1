#!/usr/bin/env python3
"""Idempotent patch CLAIMWORDS — the CRM side of two owner decisions (11/01), with patch CLAIMHELP.

1. "yes take out negotiating, make it documenting for the best approval": every customer-facing paper and template stops
   saying GrayCo negotiates or secures approval of the claim. GrayCo documents the damage, meets the adjuster and provides
   estimates and supporting documentation so the claim can be fully reviewed — no promise of approval or of an amount,
   no negotiating on the homeowner's behalf.
   · the "Cancellation / Overhead & Profit (Liquidated Damages)" clause in every copy (Work Authorization, Direction to
     Pay, the insurance / water / fire / roof agreements, the claim papers, on-site signing, the library templates);
   · the Work Authorization's "INSURANCE CLAIM AUTHORIZATION" line ("work directly with your insurance carrier on your
     behalf");
   · the marketing copies the CRM carries of the newsletter / social / ad text (the server files are edited in place).
   The admin-only notes beside these papers now read "DRAFT — for lawyer review" (never printed, never in the portal).
   The adjuster's name / phone show by default when entered (owner 11/01); the 🛡 Insurance portal panel's switch is ticked
   unless someone hid them for that job (portalShowAdjuster false — the per-job "hide adjuster").
2. "Carrier names: never shown anywhere in the portal": the job's 🛡 Insurance portal switch "Show carrier name to
   customer" and the ⚡ Automations switch "Show the insurance carrier name" stay visible but disabled, with the note
   "GrayCo never shows the insurance company's name to customers." (the portal server ignores both — portal.js).
Every find-string must occur the stated number of times. Usage: python3 tools/patch_CLAIMWORDS.py [index.html]
"""
import sys

p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch CLAIMWORDS */'
if MARK in t:
    print('CLAIMWORDS: already patched')
    sys.exit(0)


def rep(old, new, n=1):
    global t
    c = t.count(old)
    assert c == n, ('CLAIMWORDS anchor count', c, '!=', n, old[:100])
    t = t.replace(old, new)


NEVER = 'GrayCo never shows the insurance company’s name to customers.'

# ── 1. legal wording (DRAFT — for lawyer review) ──
rep('documenting, negotiating, and securing approval of the insurance claim',
    'thoroughly documenting the damage, meeting with the adjuster, and providing detailed estimates and supporting documentation so the claim can be fully reviewed for approval', 16)
rep('if GrayCo secures approval of my/our insurance claim and I/we thereafter',
    'if my/our insurance claim is approved and I/we thereafter', 16)
rep('preparing, documenting, and securing the approved claim',
    'documenting the damage and preparing the estimates and supporting documentation for the claim', 14)
rep('adjuster meetings and claim approval work', 'adjuster meetings and claim documentation work', 2)
rep('to perform all work necessary to restore your property and to work directly with your insurance carrier on your behalf.',
    'to perform all work necessary to restore your property and to communicate with your insurance company about the scope and price of GrayCo’s work. GrayCo does not negotiate or settle your claim and is not a public adjuster.')
# the admin-only notes beside those papers (never printed)
rep("var OPNOTE = 'O&P clause pending attorney review (sent 10/26)',",
    "var OPNOTE = 'DRAFT — for lawyer review: O&P clause and the insurance-claim wording (sent 10/26; 11/01 “documenting, not negotiating”)',   " + MARK)
rep('children:"Admin note: O&P clause pending attorney review (sent 10/26)"',
    'children:"Admin note: DRAFT — for lawyer review — O&P clause and the insurance-claim wording (sent 10/26; 11/01 “documenting, not negotiating”)"')

# ── marketing copies (same text as netlify/functions/_lib/mkt-content.js / soc-content.js) ──
rep('and we work with your insurance company for you.', 'and we meet your adjuster to show the damage we documented.')
rep('we document it with photos and help you through your insurance claim from start to finish.',
    'we document it with photos, give you a detailed estimate, and meet your adjuster to show the damage.')
rep('We handle claims every week — ask us anything.', 'We work on insurance repairs every week — ask us anything.')
rep('We help with claims every week.', 'We work on insurance repairs every week.')
rep('We help with your insurance claim from the first call to the final repair.',
    'We document the damage for your insurance claim and handle the repair, from the first call to the final walk-through.')
rep('• We work with your insurance from start to finish', '• We meet your adjuster to show the damage')

# ── 2. carrier names never shown: the switches stay, disabled, with the note ──
# 🛡 Insurance portal panel (patch INSP)
rep("var showC = p.portalShowCarrier === true, showA = p.portalShowAdjuster === true, carrier = carrierOf(p);",
    "var showC = false /* owner 11/01: never */, showA = p.portalShowAdjuster !== false /* owner 11/01: shown by default */, carrier = carrierOf(p);")
rep("       ck('adjuster', p.portalShowAdjuster === true, 'Show adjuster name &amp; phone', 'Only when you are OK with the customer calling the adjuster from the portal.');",
    "       ck('adjuster', p.portalShowAdjuster !== false, 'Show adjuster name &amp; phone', 'On by default when they are entered (owner 11/01). Untick to hide them from this customer.');")
rep("' · carrier ' + (p.portalShowCarrier === true ? 'SHOWN' : 'hidden') + '</span></div>'",
    "' · carrier never shown</span></div>'")
rep("h += ck('carrier', p.portalShowCarrier === true, 'Show carrier name to customer', 'Off (owner rule): the customer sees “your insurance company” everywhere.') +",
    "h += ck('carrier', false, 'Show carrier name to customer', '" + NEVER + " The portal always says “your insurance company”.').replace('<input ', '<input disabled ').replace('cursor:pointer', 'cursor:not-allowed;opacity:.6') +")
rep("    if (q === 'carrier') { await saveProject(pid, function(x){ x.portalShowCarrier = !!t.checked; });",
    "    if (q === 'carrier') { t.checked = false; toast('" + NEVER + "'); return; }\n    if (q === 'carrier-old') { await saveProject(pid, function(x){ x.portalShowCarrier = !!t.checked; });")
# ⚡ Automations (patch JA)
rep("  ['showCarrier', 'portal', '🏷 Show the insurance carrier name', 'Off: the portal says “your insurance company”.', false],",
    "  ['showCarrier', 'portal', '🏷 Show the insurance carrier name', '" + NEVER + " The portal says “your insurance company”.', false],")
rep("      var k = o[0], on = LOCKED[k] ? true : !!v[k], lock = !!LOCKED[k];",
    "      var k = o[0], nev = k === 'showCarrier', on = nev ? false : (LOCKED[k] ? true : !!v[k]), lock = !!LOCKED[k] || nev;   /* CLAIMWORDS: carrier names never shown */")
rep("(lock && !o[6] ? '<span class=\"gcja-chip auto\">always on</span>' : '')",
    "(lock && !o[6] ? '<span class=\"gcja-chip auto\">' + (nev ? 'never' : 'always on') + '</span>' : '')")
rep("    var t = ev.target; var k = t && t.getAttribute && t.getAttribute('data-k'); if (!k || LOCKED[k]) return;",
    "    var t = ev.target; var k = t && t.getAttribute && t.getAttribute('data-k'); if (!k || LOCKED[k] || k === 'showCarrier') return;")
rep("  if (p.auto.showCarrier === true) p.portalShowCarrier = true;", "  /* CLAIMWORDS: never p.portalShowCarrier = true (owner 11/01: carrier names never shown) */")

assert 'negotiating, and securing approval' not in t and 'secures approval of my/our' not in t
open(p, 'w', encoding='utf-8').write(t)
print('CLAIMWORDS: patched', p)
