#!/usr/bin/env python3
"""patch CUSTPORTAL — the CRM side of the customer-portal audit (11/02).

Owner: "customer portal too: should all photos be in there" and "the GrayCo photos will be in their portal, but they can
also add photos if they want in the portal, and it goes into GrayCo Photos and shows who added the photo too."

1. CompanyCam photos: the CUSTOMER sees them by default (the server's rule, netlify/functions/_lib/cc-vis.js). Before, a
   CompanyCam photo put in after 10/30 was hidden until someone clicked "Customer can see", so every new job showed the
   customer 0 photos. "🔒 Hide from customer" (on a photo, ☑ Select, or the whole job) is the opt-out. A photo whose
   CompanyCam tag / description says insurance / adjuster / claim paperwork is never shown by default. Subs keep the old
   rule (a new CompanyCam photo waits for a click) — the sub portal is unchanged.
2. A photo the customer added in the portal (source 'customer'): a green CUSTOMER badge on the tile and
   "📱 Added by <name> (customer) · <date>" in the photo's details.
3. Job → Customer portal → ✍️ Signatures: the warranty and the certificate of completion are on the "Send for signature"
   list too (they were left out by the paper-name filter).
4. The emergency number in the CRM's customer papers / e-mails is (901) 582-8255 (owner 11/02); the office stays (901) 585-0944.
Idempotent: run it again and nothing changes. Usage: python3 tools/patch_CUSTPORTAL.py [index.html]"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'index.html')
t = open(path, encoding='utf-8').read()
MARK = 'patch CUSTPORTAL'
if MARK in t:
    print('CUSTPORTAL: already patched'); sys.exit(0)

EDITS = []
# 1a. the customer's default for a CompanyCam photo nobody clicked
A = """  if (j) return j.mode === 'show';
  return !(CCV.since > 0 && ccUp(r) >= CCV.since);
}"""
A2 = """  if (j) return j.mode === 'show';
  return !ccInsOnly(r);   /* patch CUSTPORTAL: the customer sees a job's CompanyCam photos by default; "Hide from customer" is the opt-out */
}
/* patch CUSTPORTAL: never by default — a CompanyCam photo whose tag / description says insurance, adjuster or claim paperwork
   (the same words as netlify/functions/_lib/cc-vis.js INS_RE) */
var CC_INS_RE = /\\b(insurance|insurer|adjust[eo]r|claim\\s*(?:doc|docs|document|documents|paper|papers|form|forms|file|photos?)|xactimate|proof of loss|carrier)\\b/i;
function ccInsOnly(r){ return !!r && CC_INS_RE.test(s(r.tag) + ' ' + s(r.note)); }
/* subs keep the CCPHOTOS2 rule: a CompanyCam photo put in after the ccvis moment waits for a click */
function ccSubsDefault(r){ return !ccInsOnly(r) && !(CCV.since > 0 && ccUp(r) >= CCV.since); }"""
EDITS.append((A, A2, 1))
# 1b. subs: a CompanyCam photo nobody decided follows the old rule, not the customer's new default
B = """function subsOf(r){ var f = ccFlag(r), h = f && f.deleted !== true ? f.hideSubs : r.hideSubs; if (h === true) return false; if (h === false) return true; return sharedOf(r); }"""
B2 = """function subsOf(r){ var f = ccFlag(r), h = f && f.deleted !== true ? f.hideSubs : r.hideSubs; if (h === true) return false; if (h === false) return true; if (r && r.source === 'companycam' && !ccDecided(r)) return ccSubsDefault(r);   /* patch CUSTPORTAL */
  return sharedOf(r); }"""
EDITS.append((B, B2, 1))
# 1c. the words on the job's "Show all / Hide all" and in ⚙ Who sees a photo
C = """'Show all ' + list.length + ' photos of this job to the customer?\\n\\nPhotos added later still wait for their own "Customer can see".'"""
C2 = """'Show all ' + list.length + ' photos of this job to the customer?\\n\\nPhotos added later are shown too, unless you hide them.'"""
EDITS.append((C, C2, 1))
D = """'Hide all ' + list.length + ' photos of this job from the customer?'"""
D2 = """'Hide all ' + list.length + ' photos of this job from the customer?\\n\\nPhotos added later are still shown to the customer (hide those one by one, or Hide all again).'"""
EDITS.append((D, D2, 1))
E = """CompanyCam photos added after 10/30 start hidden until someone taps <b>Customer sees it</b> (or <b>👁 Show all to customer</b> on the job)."""
E2 = """CompanyCam photos are on the customer portal by default — tap <b>Hide from customer</b> (or <b>🔒 Hide all</b> on the job) for internal-only photos; one that says insurance / adjuster stays hidden until you show it. Photos the customer adds in the portal say <b>From customer</b>."""
EDITS.append((E, E2, 1))
F = """(cc && !ccDecided(r) ? '👁 Customer can see? (not shown yet)' :"""
F2 = """(cc && !ccDecided(r) ? '👁 Customer can see? (not shown yet — insurance / adjuster)' :"""
EDITS.append((F, F2, 1))
# 2a. the tile badge (two tile renders)
G = """(cc ? '<span class="gcu-ccb">CC</span>' : r.source === 'sub' ? '<span class="gcu-subb">SUB</span>' : '')"""
G2 = """(cc ? '<span class="gcu-ccb">CC</span>' : r.source === 'sub' ? '<span class="gcu-subb">SUB</span>' : r.source === 'customer' ? '<span class="gcu-subb" style="background:#1D5E2C" title="Added by the customer in the portal">CUSTOMER</span>' : '')"""
EDITS.append((G, G2, 2))
# 2b. the photo's details
H = """(sharedOf(r) ? '' : ' · hidden from the customer') + '</div>';   /* patch SUBPHOTOS */"""
H2 = H + """
  if (r.source === 'customer') h += '<div class="gcu-subline" data-gc-custphoto="1" style="padding:6px 12px 0;font-size:12px;font-weight:700;color:#1D5E2C">📱 Added by ' + esc(s(r.custName) || s(r.by).replace(/ \\(customer\\)$/, '') || 'the customer') + ' (customer) · ' + esc(s(r.at).slice(0, 10)) + ' · from the customer portal' + (sharedOf(r) ? '' : ' · hidden from the customer') + '</div>';   /* patch CUSTPORTAL */"""
EDITS.append((H, H2, 1))

# 3. ✍️ Signatures: the warranty and the certificate of completion can be sent for the customer's signature too (kind 'doc')
I = """/contract|agreement|authori[sz]ation|proposal|change.?order|addendum|waiver|sign/i.test(s(d.cat) + ' ' + s(d.name)) && d.source !== 'portal-signature'"""
I2 = """/contract|agreement|authori[sz]ation|proposal|change.?order|addendum|waiver|sign|warrant|completion/i.test(s(d.cat) + ' ' + s(d.name)) && d.source !== 'portal-signature'   /* patch CUSTPORTAL: + warranty, certificate of completion */"""
EDITS.append((I, I2, 1))

# 4. owner 11/02: the EMERGENCY line is (901) 582-8255 (the 24/7 line); the office (901) 585-0944 stays for questions / scheduling
for old in ("Emergency (water, fire): call (901) 585-0944.",              # the customer e-mails' "How to reach us" (patch EMAILMAP)
            "For emergencies: (901) 585-0944.",                           # the welcome & FAQ packet
            "Emergency services available 24/7 — call (901) 585-0944",    # the water damage scope / contract template
            "For an emergency call (901) 585-0944."):                     # the Customer Portal Terms of Use (doc library copy)
    EDITS.append((old, old.replace('585-0944', '582-8255'), 1))

for old, new, n in EDITS:
    c = t.count(old)
    if c != n:
        print('CUSTPORTAL: anchor found %d times (want %d): %s' % (c, n, old[:90])); sys.exit(1)
    t = t.replace(old, new)
open(path, 'w', encoding='utf-8').write(t)
print('CUSTPORTAL: applied')
