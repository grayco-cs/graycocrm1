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
5. ✅ Approvals: the preview of an invoice e-mail shows the CRM's own invoice (what the customer gets now), not the plain PDF.
6. Estimates: "Customer sees: ◉ My PDF ○ Template version" on the job's estimate card (default My PDF; 📘 Make proposal sets
   Template); 📤 Send estimate, ESTIN's "📨 Put proposal in customer portal + send" and the portal deliver only the choice.
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

# 5. owner 11/02 "I want 1 invoice": the approval preview of an invoice e-mail shows what the customer gets — the CRM's own invoice
#    (portal.js action invoice-pdf now answers with that page, _lib/invoice-view.js), not the plain PDF
J = """      var box = q('._ap2PvPdfBox'), msg = q('._ap2PvPdfMsg'); if(!box) return;
"""
J2 = J + """      if(j && j.ok && j.html){ var hu = URL.createObjectURL(new Blob([j.html], { type:'text/html' })); msg.textContent = j.filename || ''; var dl0 = q('._ap2PvDl'); if(dl0){ dl0.href = hu; dl0.download = j.filename || 'Invoice.html'; dl0.style.display = 'inline'; }
        box.innerHTML = '<iframe class="_ap2PvPdfFrame" title="Invoice" style="width:100%;height:620px;border:1px solid #cbd5e1;border-radius:8px;background:#060b16"></iframe>'; box.firstChild.srcdoc = j.html; ov.__pdfBytes = j.html.length; return; }   /* patch CUSTPORTAL: the ONE invoice look */
"""
EDITS.append((J, J2, 1))

# 6. owner 11/02: "I always want the PDF in the CRM, but I want to choose template or PDF." Per estimate: e.customerSees =
#    'pdf' (default — the estimate's own PDF, uploaded or made, exactly as it is) | 'template' (the GrayCo template proposal).
#    The PDF always stays on the job (ESTIN's "Estimate source" file). Selection, routing and display only — the template's
#    design and the tax math are not touched (shared functions: ESTPDF designDefault / send / paintSlot, ESTIN sigOf / process).
K = """  if (isUploadPdf(e)) return 'uploaded';
"""
K2 = """  if (e && e.customerSees === 'template') { var gT = ''; try { gT = W._gcJA ? W._gcJA.groupOf(p || {}) : ''; } catch (x) {} return S.designs && S.designs[gT] === 'p5' ? 'p5' : 'simple'; }   /* patch CUSTPORTAL: "Customer sees: Template version" */
""" + K
EDITS.append((K, K2, 1))
L = """function send(estId, o, msg){
  msg = msg || function(){};
  var e = estById(estId); if (!e) return Promise.resolve({ ok: false, error: 'Estimate not found.' });
"""
L2 = L + """  try { if (o && o.design && o.design !== 'upload') { var csNew = o.design === 'uploaded' ? 'pdf' : 'template'; if (s(e.customerSees) !== csNew && !(csNew === 'pdf' && !s(e.customerSees))) setEst(estId, { customerSees: csNew, customerSeesBy: meName(), customerSeesAt: nowIso() }); } } catch (x) {}   /* patch CUSTPORTAL: what was sent is what the customer sees */
"""
EDITS.append((L, L2, 1))
M = """    h += '<button type="button" class="gcep-sm" data-ep="p5">📘 Make proposal</button><button type="button" class="gcep-sm" data-ep="edit">✏ Open estimate</button>';
"""
M2 = """    /* patch CUSTPORTAL: "Customer sees: ◉ My PDF ○ Template version" — switchable until it is sent or signed */
    (function(){ var cs = s(e.customerSees) === 'template' ? 'template' : 'pdf', lock = !!c || /sign|won|accept|contract/i.test(s(e.status));
      h += '<div class="gcep-cs" data-gc-cs="' + cs + '" style="flex-basis:100%;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px"><b>Customer sees:</b>' + (lock ? '<span>' + (cs === 'template' ? 'Template' : 'PDF') + '</span>'
        : '<label><input type="radio" name="gcep-cs-' + esc(e.id) + '" data-ep="cs" data-v="pdf"' + (cs === 'pdf' ? ' checked' : '') + '> My PDF</label><label><input type="radio" name="gcep-cs-' + esc(e.id) + '" data-ep="cs" data-v="template"' + (cs === 'template' ? ' checked' : '') + '> Template version</label>') + '</div>'; })();
""" + M
EDITS.append((M, M2, 1))
N = """else if (a === 'p5') makeProposal(estId, pid);"""
N2 = """else if (a === 'p5') { try { setEst(estId, { customerSees: 'template', customerSeesBy: meName(), customerSeesAt: nowIso() }); } catch (x) {} makeProposal(estId, pid); }   /* patch CUSTPORTAL: 📘 Make proposal = the Template version */
      else if (a === 'cs') { var cv = b.getAttribute('data-v') === 'template' ? 'template' : 'pdf'; setEst(estId, { customerSees: cv, customerSeesBy: meName(), customerSeesAt: nowIso() }); el.__h = ''; later(function(){ paintSlot(el, estId, pid); }, 50); toast('Customer sees: ' + (cv === 'template' ? 'the Template version' : 'your PDF') + '.'); }"""
EDITS.append((N, N2, 1))
O = """s(e.name), s(e.client), s(e.address)])); }"""
O2 = """s(e.name), s(e.client), s(e.address)].concat(e.customerSees === 'template' ? ['tpl'] : []))); }   /* patch CUSTPORTAL: switching PDF / Template makes the proposal again */"""
EDITS.append((O, O2, 1))
P = """  var html = proposalHtml(Object.assign({}, e, { pid: p.id }));
  return storeProposal(e, p.id, html).then(function(f){"""
P2 = """  /* patch CUSTPORTAL: "Customer sees: My PDF" (the default) → the estimate's own PDF, exactly as it is, goes in the approval and the portal;
     "Template version" → the GrayCo template proposal (as before). The own PDF stays on the job either way ("Estimate source"). */
  var ownRef = s(e.sourceRef), usePdf = e.customerSees !== 'template' && /^sb:crm-files\\/[0-9a-f]{64}\\.pdf$/.test(ownRef);
  var html = usePdf ? '' : proposalHtml(Object.assign({}, e, { pid: p.id }));
  return (usePdf ? Promise.resolve({ ref: ownRef, name: (s(e.sourceName) || ('Estimate — ' + s(e.name || p.name))).replace(/\\.pdf$/i, '') + '.pdf', type: 'application/pdf' }) : storeProposal(e, p.id, html)).then(function(f){"""
EDITS.append((P, P2, 1))

for old, new, n in EDITS:
    c = t.count(old)
    if c != n:
        print('CUSTPORTAL: anchor found %d times (want %d): %s' % (c, n, old[:90])); sys.exit(1)
    t = t.replace(old, new)
open(path, 'w', encoding='utf-8').write(t)
print('CUSTPORTAL: applied')
