#!/usr/bin/env python3
"""Idempotent patch LEGAL2: the missing customer / insurance / subcontractor legal documents, wired into the CRM (owner 10/26).
Every document is a DRAFT pending attorney review: customer-facing output carries the small footer "Form rev. 10/26/2026";
the admin-only note "DRAFT — pending attorney review (sent 10/26)" shows only to admins (Company Documents list, template editor,
under the Job Type Template select) and is never printed — the same pattern as patch OPCLAUSE (tools/patch_OPCLAUSE.py).

What it does
  1. Library (the doc library in index.html, same system as Company Documents / Forms): NEW built-in templates, all selectable, NONE auto-attached or
     auto-sent: Notice of Cancellation (TN / AR / MS, two copies), Emergency waiver, Assignment of Benefits (optional), Mold Remediation Agreement,
     Contents Pack-Out Authorization, lien waivers per state (TN / MS / AR x conditional / unconditional x progress / final), Mississippi Notice to Owner,
     E-SIGN / UETA consent, Customer Portal Terms of Use, Sub Portal Terms of Use, Sub Portal Privacy Notice, Master Subcontract Agreement,
     Subcontract Work Order, Subcontractor One-Year Workmanship Warranty, TN / MS / AR disclosure riders.
  2. Right to cancel (legally needed, so it IS wired in): clause + 16 CFR 429 statement in the Residential and Commercial contract texts, the proposal
     acceptance block, a two-copy detachable Notice page on residential / insurance proposals, the library Client Contract, the automation contract PDF,
     and the portal (notice + acknowledgement). Insurance contracts get the insurer-denial right.
  3. State wiring of live proposals: TN by default, MS when the job address is in MS, AR when in AR; venue / arbitration / lien / prompt-pay / tax follow
     the state and county. Retainage: 5% residential, 10% commercial (unless the contract says otherwise); pay apps match.
  4. Assignment of Benefits: the Direction to Pay is explicitly NOT an assignment; the restoration agreements no longer assign (they point to the optional AOB).
     The Work Authorization / Direction to Pay placeholder "[Terms reviewed by your attorney go here.]" is replaced with real terms.
  5. E-SIGN / UETA consent before every e-signature in the customer portal and the sub portal (checkbox + disclosure), recorded on the signed copy.
     Footers / sign-in screens link the Terms of Use and Privacy pages (new static pages).
Every find-string must occur exactly once. Usage: python3 tools/patch_LEGAL2.py   (run from the repo root; files are rewritten in place)
"""
import os, re, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from legal2 import lib, cancel, insurance, liens, portal, subs, riders, contract, runtime   # noqa: E402  (importing registers the documents)

MARK = 'LEGAL2-patch'

def rd(p):
    return open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, t):
    open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(t)
def once(text, old, new, label):
    n = text.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    return text.replace(old, new)
def sq(t):  # body of a single-quoted JS string
    return t.replace('\\', '\\\\').replace("'", "\\'")
def nth(text, old, new, n, label, total):
    """replace the n-th (1-based) occurrence of old; assert there are `total` occurrences"""
    assert text.count(old) == total, ('occurrence count', label, text.count(old), total)
    i = -1
    for _ in range(n):
        i = text.index(old, i + 1)
    return text[:i] + new + text[i + len(old):]

DOCS = lib.DOCS
IDS = ['gcb_' + d['id'] for d in DOCS]
TPLGROUP = {'cancel': 'Client', 'rider': 'Client', 'esign': 'Client', 'portal_tou': 'Client', 'subportal': 'Sub', 'msa': 'Sub', 'sub_': 'Sub', 'lien': 'Lien Waivers', 'aob': 'Insurance', 'mold': 'Insurance', 'packout': 'Insurance'}
def grp(i):
    for k, v in TPLGROUP.items():
        if i.startswith(k): return v
    return 'Client'

# ===================================================================================== generated files
def write_static():
    rt = runtime.build_js()
    for p in ('legal2.js', 'subportal/legal2.js', 'subportal-app/public/legal2.js'):
        wr(p, rt)
    B = lambda blocks: blocks
    wr('portal-terms.html', lib.static_page('Customer Portal Terms of Use', 'GrayCo Customer Portal — Terms of Use', portal.TOU_CUSTOMER))
    wr('sub-terms.html', lib.static_page('Sub Portal Terms of Use', 'GrayCo Sub Portal and Bid Site — Terms of Use', portal.TOU_SUB))
    wr('sub-privacy.html', lib.static_page('Sub Portal Privacy Notice', 'GrayCo Sub Portal and Bid Site — Privacy Notice', portal.PRIVACY_SUB))
    wr('esign-consent.html', lib.static_page('E-SIGN Disclosure and Consent', 'Consent to Do Business Electronically', [('box', 'You will see this before you sign anything electronically in the GrayCo portals. Paper copies are always free: call ' + lib.PHONE + '.')] + portal.ESIGN + [('p', '<b>Consent box shown at signing:</b> ' + portal.CHECK)]))
    wr('cancel-notice.html', ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notice of Cancellation — GrayCo Construction Services</title>\n'
        '<style>body{font-family:Arial,Helvetica,sans-serif;max-width:7.5in;margin:16px auto;padding:0 14px;color:#111}.bar{margin:0 0 12px;font-size:14px}@media print{.bar{display:none}body{margin:0 auto}}.rev{font-size:8pt;color:#777;text-align:right}</style></head><body>\n'
        '<div class="bar"><b>Notice of Cancellation</b> — two copies. State: <select id="st"><option>TN</option><option>AR</option><option>MS</option></select> <button onclick="window.print()">Print both copies</button></div>\n'
        '<div id="out"></div><div class="rev">' + lib.REV + '</div>\n<noscript>JavaScript is needed to show this notice. Call ' + lib.PHONE + ' for a paper copy.</noscript>\n'
        '<script src="legal2.js"></script><script>(function(){var q=new URLSearchParams(location.search),s=(q.get("s")||"TN").toUpperCase(),d=q.get("d")||"";var el=document.getElementById("st");if(["TN","AR","MS"].indexOf(s)<0)s="TN";el.value=s;'
        'function paint(){var st=el.value,o={};if(d){var x=new Date(d+"T12:00:00");if(!isNaN(x)){o.date=x.toLocaleDateString("en-US");o.deadline=GCLegal.deadline(x).toLocaleDateString("en-US");}}'
        'document.getElementById("out").innerHTML=GCLegal.noticeHtml(st,o);}el.onchange=paint;paint();})();</script></body></html>\n'))

# ===================================================================================== library JS (inside the doclib closure)
def lib_js():
    out = ["/* ===== LEGAL2-patch: new library documents — DRAFT, pending attorney review (sent 10/26). Selectable; never auto-attached or auto-sent. ===== */",
           "var L2_NOTE = " + json.dumps(lib.NOTE, ensure_ascii=False) + ", L2_REV = " + json.dumps(lib.REV) + ", L2_IDS = " + json.dumps({i: 1 for i in IDS}) + ";",
           "function l2NoteRow(row, id){ if (!L2_IDS[id] || !row || row.querySelector('[data-gc-admin-note=\"legal2\"]')) return; var nt = D.createElement('span'); nt.setAttribute('data-gc-admin-note', 'legal2'); nt.textContent = L2_NOTE; nt.style.cssText = 'font-size:10.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:2px 6px'; row.appendChild(nt); }",
           "function l2box(t){ return '<div style=\"border:1.5px solid #333;padding:8px 10px;margin:8px 0;font-size:10pt;line-height:1.5;background:#fafafa\">' + t + '</div>'; }",
           "function l2li(a){ return '<ul style=\"margin:0 0 10px 18px;padding:0;line-height:1.55\">' + a.map(function(x){ return '<li style=\"margin:0 0 4px\">' + x + '</li>'; }).join('') + '</ul>'; }",
           "function l2(blocks){ return blocks.map(function(b){ switch (b[0]) {",
           "  case 'title': return title(b[1], b[2]); case 'info': return info(b[1]); case 'h': return h(b[1]); case 'p': return p(b[1]); case 'box': return l2box(b[1]); case 'li': return l2li(b[1]);",
           "  case 'checks': return checks(b[1]); case 'grid': return grid(b[1], b[2]); case 'sigs': return sigs(b[1], b[2]); case 'small': return '<p style=\"font-size:9pt;color:#555;margin:6px 0\">' + b[1] + '</p>';",
           "  case 'notice': return W.GCLegal ? W.GCLegal.noticeHtml(b[1], { date: '{date}', po: '{po}', address: '{job_address}' }) : ''; default: return ''; } }).join('') + '<div data-gc-formrev=\"1\" style=\"margin-top:16px;font-size:8pt;color:#777;text-align:right\">' + L2_REV + '</div>'; }"]
    for d in DOCS:
        out.append("T(%s, %s, %s, %s, %s, l2(%s));" % (json.dumps(d['id']), json.dumps(d['name'], ensure_ascii=False), json.dumps(d['category'], ensure_ascii=False), json.dumps(d['jobTypes']), 'true' if d['clientFacing'] else 'false', lib.jsq([list(b) for b in d['blocks']])))
    return '\n'.join(out) + '\n\n'

# ===================================================================================== index.html
def patch_index():
    src = rd('index.html')
    if MARK in src:
        print('index.html: already patched'); return
    # ---- 0. the shared runtime, loaded before the library script
    src = once(src, '<script id="gc-patch-doclib">', '<script src="legal2.js"></script>   <!-- ' + MARK + ' -->\n<script id="gc-patch-doclib">', 'script-tag')
    # ---- 1. the new library documents + admin note
    src = once(src, 'function builtins(){ return L; }', lib_js() + 'function builtins(){ return L; }', 'builtins')
    src = once(src, "gcb_roof_contingency: 'Insurance', ", "gcb_roof_contingency: 'Insurance', " + ', '.join("%s: '%s'" % (i, grp(i[4:])) for i in IDS) + ', ', 'tplgroup')
    src = once(src, "    opNoteRow(row, m[1]);\n  });", "    opNoteRow(row, m[1]);\n    l2NoteRow(row, m[1]);   /* LEGAL2-patch: admin-only */\n  });", 'note-list')
    src = once(src, "(OP_IDS[b.id] ? '<br><span data-gc-admin-note=\"opclause\">' + OPNOTE + '</span>' : '')",
               "(OP_IDS[b.id] ? '<br><span data-gc-admin-note=\"opclause\">' + OPNOTE + '</span>' : '') + (L2_IDS[b.id] ? '<br><span data-gc-admin-note=\"legal2\">' + L2_NOTE + '</span>' : '')", 'note-edit')
    src = once(src, 'children:"Admin note: O&P clause pending attorney review (sent 10/26)"}):null]})',
               'children:"Admin note: O&P clause pending attorney review (sent 10/26)"}):null,(window.__GC_AUTH__&&window.__GC_AUTH__.isAdmin&&window.__GC_AUTH__.isAdmin())?e.jsx("div",{"data-gc-admin-note":"legal2",style:{fontSize:11,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"4px 8px",marginTop:4},children:"Admin note: ' + lib.NOTE + ' (right-to-cancel clause, state contract wording, retainage)"}):null]})', 'note-select')

    # ---- 2. live proposal: state wiring + cancellation clause + acceptance statement + two-copy notice pages
    src = once(src, ':g.contractText);if(window._gcNormalizeContract)_ct=window._gcNormalizeContract(_ct);',
               ':g.contractText);try{if(window.GCLegal)_ct=window.GCLegal.contract(_ct,g)}catch(_e){}if(window._gcNormalizeContract)_ct=window._gcNormalizeContract(_ct);', 'print-contract')
    src = once(src, '<div style="font-size:10px;color:#334155;margin-bottom:16px;">By signing below, ${_?"Owner authorizes',
               '${window.GCLegal?window.GCLegal.acceptHtml(g):""}<div style="font-size:10px;color:#334155;margin-bottom:16px;">By signing below, ${_?"Owner authorizes', 'print-accept')
    src = once(src, '</div>${ke(6)}</div>\n    </body></html>', '</div>${ke(6)}</div>${window.GCLegal?window.GCLegal.pages(g):""}\n    </body></html>', 'print-pages')

    # ---- 3. Job Type Template contract texts (Ks)
    ks_a = src.index('Ks={"Residential Reno"')
    FIRE_END = '11. ENTIRE AGREEMENT: This document constitutes the complete agreement between the parties.`}}'
    assert src.count(FIRE_END) == 1
    ks_b = src.index(FIRE_END) + len(FIRE_END)
    head, ks, tail = src[:ks_a], src[ks_a:ks_b], src[ks_b:]
    OLD_RET = "Retainage shall not exceed five percent (5%) of the work properly completed — the maximum allowed in Tennessee, Mississippi, and Arkansas — and shall be released promptly upon substantial completion (and, in Mississippi, no later than 60 days after final completion)."
    ks = nth(ks, OLD_RET, "Retainage, if any, shall not exceed five percent (5%) of the work properly completed and shall be released promptly upon substantial completion (and, in Mississippi, no later than 60 days after final completion).", 1, 'ret-res', 2)
    ks = nth(ks, OLD_RET, "Retainage, if any, shall be ten percent (10%) of the amount of the work properly completed unless this Agreement states a different percentage, and shall be released promptly upon substantial completion (and, in Mississippi, no later than 60 days after final completion).", 1, 'ret-com', 1)
    END17 = "Time limits and written-notice requirements are of the essence and strictly enforced.`"
    ks = nth(ks, END17, "Time limits and written-notice requirements are of the essence and strictly enforced.\n\n18. " + cancel.clause('TN', 'residential') + "`", 1, 'cancel-res', 2)
    ks = nth(ks, END17, "Time limits and written-notice requirements are of the essence and strictly enforced.\n\n18. " + cancel.clause('TN', 'commercial') + "`", 1, 'cancel-com', 1)
    # insurance contracts: the old CANCELLATION line becomes the state clause (TN default; the print prefix re-picks MS / AR)
    INS_CLAUSE = cancel.clause('TN', 'insurance')
    cnt = 0
    def repl(m):
        nonlocal cnt; cnt += 1
        return '\n\n' + m.group(1) + '. ' + INS_CLAUSE
    ks = re.sub(r'\n\n(\d+)\. CANCELLATION: Owner may cancel within 3 business days[^\n]*', repl, ks)
    assert cnt == 4, ('insurance cancellation lines', cnt)
    # Direction to Pay: NOT an assignment (the restoration agreements no longer assign; they point to the optional AOB)
    DTP_NEW = insurance.RESTORATION_DTP_HEAD + "\n" + insurance.RESTORATION_DTP
    for tail_txt, lbl in (("Owner assigns to Contractor the right to communicate with the insurance company, submit supplements, and negotiate claim amounts on Owner\\'s behalf for the scope of repairs described herein.", 'dtp-ins'),
                          ("Owner assigns to Contractor the right to communicate with the insurance company, submit supplements, and negotiate claim amounts on Owner\\'s behalf.", 'dtp-wf')):
        pass
    OLDHEAD = "DIRECTION TO PAY / ASSIGNMENT OF BENEFITS\nOwner hereby directs their insurance company to issue all claim payments for this loss directly to GrayCo Construction Services, LLC and Owner as co-payees. Owner assigns to Contractor the right to communicate with the insurance company, submit supplements, and negotiate claim amounts on Owner\\'s behalf"
    assert ks.count(OLDHEAD) == 3, ('dtp paragraphs', ks.count(OLDHEAD))
    ks = ks.replace(OLDHEAD + " for the scope of repairs described herein.", DTP_NEW).replace(OLDHEAD + ".", DTP_NEW)
    assert 'ASSIGNMENT OF BENEFITS\nOwner hereby' not in ks
    ks = nth(ks, 'Insurance proceeds are assigned to GrayCo Construction per the Direction to Pay.', 'Insurance proceeds are paid to you and GrayCo together per the Direction to Pay (not an assignment).', 1, 'pay-1', 1)
    ks = nth(ks, 'Insurance proceeds assigned to GrayCo Construction per Direction to Pay.', 'Insurance proceeds are paid to you and GrayCo together per the Direction to Pay (not an assignment).', 1, 'pay-2', 2)
    ks = nth(ks, 'Insurance proceeds assigned to GrayCo Construction per Direction to Pay.', 'Insurance proceeds are paid to you and GrayCo together per the Direction to Pay (not an assignment).', 1, 'pay-3', 1)
    src = head + ks + tail
    assert 'ssigns to Contractor' not in src

    # ---- 4. Work Authorization / Direction to Pay placeholders replaced with real terms; Direction to Pay is NOT an assignment
    PH = "\\n\\n[Terms reviewed by your attorney go here.]';"
    assert src.count(PH) == 2
    wa_txt = '\\n\\n'.join(sq(t) for t in insurance.WA_TERMS)
    dtp_txt = '\\n\\n'.join(sq(t) for t in insurance.DTP_TERMS)
    src = nth(src, PH, "\\n\\n" + wa_txt + "';", 1, 'wa-terms', 2)
    src = nth(src, PH, "\\n\\n" + dtp_txt + "';", 1, 'dtp-terms', 1)
    NA = insurance.NOT_AOB + ' ' + insurance.DTP_REVOKE + ' ' + insurance.AOB_REF
    src = once(src, "This direction does not assign my policy or my claim; I keep all of my rights under the policy.", sq(NA), 'paper-dtp')
    src = once(src, "This does not assign my policy or my other rights under it.')", sq(NA) + "')", 'lib-dtp')
    src = once(src, "2. Communicate and negotiate directly with my/our insurance carrier and adjuster on my/our behalf.<br>",
               sq("2. Communicate directly with my/our insurance carrier and adjuster about the scope and price of GrayCo's work, and submit estimates, supplements and documents (GrayCo does not adjust, negotiate or settle my/our claim and is not a public adjuster).<br>"), 'v1-wa-2')
    src = once(src, "3. Receive insurance claim payments and supplements directly assigned or endorsed to GrayCo.<br>",
               sq("3. Receive insurance payments for GrayCo's covered work, made payable to me/us and GrayCo together under my/our Direction to Pay (not an assignment of benefits; an optional Assignment of Benefits form is available).<br>"), 'v1-wa-3')
    src = once(src, 'There is no assignment of benefits form.', 'An optional Assignment of Benefits form is in Docs → Insurance (a draft pending attorney review); it is never sent or attached automatically.', 'help-aob')

    # ---- 5. the library Client Contract (A2): cancellation clause, acceptance statement, retainage by job type, two-copy notice
    RET_A2_OLD = "Any retainage withheld shall not exceed five percent (5%) of the amount of work properly completed, which is the maximum permitted in Tennessee, Mississippi, and Arkansas. Retainage shall be released"
    RET_A2_NEW = ("Any retainage withheld '+(window.GCLegal&&window.GCLegal.groupOf(j)==='commercial'?'shall be ten percent (10%) of the amount of work properly completed unless this contract states a different percentage.':'shall not exceed five percent (5%) of the amount of work properly completed.')+' Retainage shall be released")
    src = once(src, RET_A2_OLD, RET_A2_NEW, 'a2-ret')
    A2_SIG = "'<div style=\"margin-top:20px;\">'+sig2('CLIENT / OWNER — Signature, Printed Name, Date','GRAYCO CONSTRUCTION SERVICES — Authorized Representative, Printed Name, Date')+'</div>',"
    A2_ADD = ("(window.GCLegal&&window.GCLegal.groupOf(j)!=='commercial'?'<div class=\"hdr\">19 — NOTICE OF RIGHT TO CANCEL</div><p style=\"font-size:11px;\">'+window.GCLegal.clause(window.GCLegal.stateOf(j),window.GCLegal.groupOf(j))+'</p><p style=\"font-size:11px;font-weight:700;border:1.5px solid #000;padding:6px\">'+window.GCLegal.data.accept+'</p>':''),\n      ")
    src = once(src, A2_SIG, A2_ADD + A2_SIG, 'a2-clause')
    A2_END = "      '<p style=\"font-size:9px;text-align:center;margin-top:8px;\">'+gcContact()+' &nbsp;|&nbsp; '+GC.lic+'</p>',\n    ].join(''), 'Client Contract');"
    A2_NEW = ("      '<p style=\"font-size:9px;text-align:center;margin-top:8px;\">'+gcContact()+' &nbsp;|&nbsp; '+GC.lic+'</p>',\n"
              "      (window.GCLegal&&window.GCLegal.groupOf(j)!=='commercial'?'<div style=\"page-break-before:always\">'+window.GCLegal.noticeHtml(window.GCLegal.stateOf(j),{po:jPO,address:jAddr,customer:jClient})+'<p style=\"font:8pt Arial;color:#777;text-align:right\">'+window.GCLegal.REV+'</p></div>':'<p style=\"font:8pt Arial;color:#777;text-align:right\">'+(window.GCLegal?window.GCLegal.REV:'')+'</p>'),\n"
              "    ].join(''), 'Client Contract');")
    src = once(src, A2_END, A2_NEW, 'a2-end')

    # ---- 6. automation contract PDF (A3): the clause, the statement above the signatures, and both notice copies
    A3_OLD = "P.sigs('Owner signature / date', 'GrayCo representative / date');\n  }).then(function(b){ return fileMade(job, 'contract'"
    A3_NEW = ("try { if (W.GCLegal) { var _gl = W.GCLegal, _gk = _gl.groupOf(job), _gs = _gl.stateOf(job);   /* LEGAL2-patch */\n"
              "      if (_gk !== 'commercial') { P.txt('8. NOTICE OF RIGHT TO CANCEL', 11, true); P.txt(_gl.clause(_gs, _gk)); P.txt(_gl.data.accept, 10, true); }\n"
              "      P.sigs('Owner signature / date', 'GrayCo representative / date'); if (_gk !== 'commercial') _gl.pdfNotice(P, _gs); else P.txt(_gl.REV, 8); } else P.sigs('Owner signature / date', 'GrayCo representative / date'); } catch (_e) { P.sigs('Owner signature / date', 'GrayCo representative / date'); }\n"
              "  }).then(function(b){ return fileMade(job, 'contract'")
    src = once(src, A3_OLD, A3_NEW, 'a3')

    # ---- 7. retainage: pay apps follow the contract (5% residential, 10% commercial unless the contract / job says otherwise)
    src = once(src, "function retPct(p){ var v = p.retainagePct; return v === 0 || v === '0' ? 0 : (isFinite(parseFloat(v)) ? Math.max(0, Math.min(50, parseFloat(v))) : 10); }",
               "function retPct(p){ var v = p.retainagePct; return v === 0 || v === '0' ? 0 : (isFinite(parseFloat(v)) ? Math.max(0, Math.min(50, parseFloat(v))) : (jobGroup(p) === 'commercial' ? 10 : 5)); }   /* LEGAL2-patch: 5% residential, 10% commercial */", 'retpct')
    src = once(src, "var ret = Math.round(((Number(p.retainagePct) || 10)) * 100) / 100;",
               "var ret = Math.round(((Number(p.retainagePct) || (/residential|insur|restor|home|roof|water|fire/i.test(String(p.type || p.jobType || '')) ? 5 : 10))) * 100) / 100;   /* LEGAL2-patch */", 'retpct-gc')
    # the old job-type mapper matched the two letters "ti" inside "residential", so every residential job printed the COMMERCIAL template
    src = once(src, '||te.includes("ti")||te.includes("build-out")', '||/\\bti\\b/.test(te)||te.includes("build-out")', 'wo-ti')
    src = src.replace('<script src="legal2.js"></script>   <!-- ' + MARK + ' -->', '<script src="legal2.js"></script>   <!-- ' + MARK + ' -->', 1)
    assert MARK in src
    wr('index.html', src)
    print('index.html patched')

# ===================================================================================== portal.html
def patch_portal():
    p = rd('portal.html')
    if MARK in p:
        print('portal.html: already patched'); return
    p = once(p, 'TN #85034 BCB &middot; AR #0486990627 &middot; MS #27769</footer>',
             'TN #85034 BCB &middot; AR #0486990627 &middot; MS #27769<br><span data-gc-legal-links="1" style="font-size:12px"><a href="/portal-terms.html" target="_blank" rel="noopener">Customer Portal Terms of Use</a> &middot; <a href="/sub-terms.html" target="_blank" rel="noopener">Sub Portal Terms of Use</a> &middot; <a href="/privacy.html" target="_blank" rel="noopener">Privacy</a> &middot; <a href="/sub-privacy.html" target="_blank" rel="noopener">Sub Portal Privacy Notice</a> &middot; <a href="/esign-consent.html" target="_blank" rel="noopener">E-SIGN Disclosure</a></span><br><span style="font-size:11px">' + lib.REV + '</span></footer>', 'foot')
    p = once(p, '</head>', '<script src="/legal2.js"></script>   <!-- ' + MARK + ': in the head so it is loaded before the signing code runs -->\n</head>', 'script-head')
    p = once(p, '<script src="/portal-plus.js" defer></script>',
             '<script>document.addEventListener("DOMContentLoaded",function(){try{window.GCLegal&&window.GCLegal.boot({base:""})}catch(e){}});</script>   <!-- ' + MARK + ' -->\n<script src="/portal-plus.js" defer></script>', 'script')
    p = once(p, "  box.appendChild(h('label', { class: 'muted', text: 'Your full name' })); box.appendChild(nm);",
             "  /* LEGAL2-patch: the E-SIGN / UETA consent comes BEFORE any signature; residential contracts also show the Notice of Cancellation */\n"
             "  var esg = window.GCLegal ? window.GCLegal.esignBox({ base: '' }) : null, cnc = null;\n"
             "  if (esg) box.appendChild(esg.el);\n"
             "  if (window.GCLegal && (x.kind === 'contract' || x.kind === 'estimate') && !(D && D.job && D.job.group === 'commercial')) { cnc = window.GCLegal.cancelBox((D && D.job && D.job.state) || 'TN', { base: '', address: (D && D.job && D.job.address) || '', po: '' }); box.appendChild(cnc.el); }\n"
             "  box.appendChild(h('label', { class: 'muted', text: 'Your full name' })); box.appendChild(nm);", 'item-box')
    p = once(p, "    if (busy) return; if (!nm.value.trim()) { msg.textContent = 'Please type your full name.'; nm.focus(); return; }",
             "    if (busy) return; if (!esg) { msg.textContent = 'The consent form did not load. Please refresh this page.'; return; } if (!esg.ok()) { msg.textContent = 'Please tick the box to agree to do business electronically.'; esg.el.scrollIntoView({ block: 'center' }); return; } if (cnc && !cnc.ok()) { msg.textContent = 'Please tick the box to confirm you received the Notice of Cancellation.'; cnc.el.scrollIntoView({ block: 'center' }); return; }\n"
             "    if (!nm.value.trim()) { msg.textContent = 'Please type your full name.'; nm.focus(); return; }", 'gate')
    p = once(p, "api({ action: 'sign', id: x.id, name: nm.value, agree: true, strokes: pad.strokes(),",
             "api({ action: 'sign', id: x.id, name: nm.value, agree: true, esignConsent: esg.record(), cancelNotice: cnc ? { ack: true, state: (D && D.job && D.job.state) || 'TN' } : undefined, strokes: pad.strokes(),", 'api')
    wr('portal.html', p)
    print('portal.html patched')

def patch_portal_app():
    t = rd('portal-app.js')
    if MARK in t:
        print('portal-app.js: already patched'); return
    t = once(t, "    field(t('signName'), nm), h('div', { class: 'muted', text: t('signDraw') }), pad.el,",
             "    (esg ? esg.el : null), field(t('signName'), nm), h('div', { class: 'muted', text: t('signDraw') }), pad.el,", 'sheet')
    t = once(t, "  var agreeTxt = t(x.kind === 'co' ? 'signAgreeCo' : 'signAgreeScope', { amt: usd(x.total), v: x.version });",
             "  var agreeTxt = t(x.kind === 'co' ? 'signAgreeCo' : 'signAgreeScope', { amt: usd(x.total), v: x.version });\n  var esg = window.GCLegal ? window.GCLegal.esignBox({ base: '' }) : null;   /* LEGAL2-patch: E-SIGN consent before the signature */", 'esg')
    t = once(t, "    if (nm.value.trim().length < 3) { msg.textContent = t('signNeedName'); nm.focus(); return; }",
             "    if (!esg) { msg.textContent = 'The consent form did not load. Please refresh this page.'; return; } if (!esg.ok()) { msg.textContent = 'Tick the box to agree to do business electronically.'; esg.el.scrollIntoView({ block: 'center' }); return; }\n"
             "    if (nm.value.trim().length < 3) { msg.textContent = t('signNeedName'); nm.focus(); return; }", 'gate')
    t = once(t, "api('p-scope', { id: x.id, op: 'sign', version: x.version, signName: nm.value, agree: true, strokes: pad.strokes() })",
             "api('p-scope', { id: x.id, op: 'sign', version: x.version, signName: nm.value, agree: true, esignConsent: esg.record(), strokes: pad.strokes() })", 'api')
    t = t.replace('var OFFICE = \'901-585-0944\';', 'var OFFICE = \'901-585-0944\';   /* ' + MARK + ' */', 1)
    assert MARK in t
    wr('portal-app.js', t)
    print('portal-app.js patched')

def patch_functions():
    f = rd('netlify/functions/portal-sign.js')
    if MARK not in f:
        f = once(f, "return { ok: true, job: { name: T(p.name) }, items: items,",
                 "return { ok: true, job: { name: T(p.name), state: legalState(p), group: /commercial|tenant|government|bid/i.test(s(p.type || p.jobType)) ? 'commercial' : 'residential', address: s(p.address) }, items: items,   /* LEGAL2-patch */", 'view')
        f = once(f, "async function view(pid){",
                 "/* LEGAL2-patch: the job's state (TN default, MS / AR from the address) so the portal shows the right Notice of Cancellation */\nfunction legalState(p){ const a = s(p && (p.state || p.address)); let m; if ((m = /\\b(MS|AR|TN)\\b\\.?,?\\s*\\d{5}/.exec(a)) || (m = /,\\s*(MS|AR|TN)\\b/.exec(a))) return m[1]; if (/mississippi/i.test(a)) return 'MS'; if (/arkansas/i.test(a)) return 'AR'; return 'TN'; }\nasync function view(pid){", 'legalstate')
        f = once(f, "  if (body.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree.' } };\n  const cs = sel().cleanStrokes(body.strokes);",
                 "  if (body.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree.' } };\n"
                 "  /* LEGAL2-patch: E-SIGN / UETA — nothing is signed until the customer agreed to do business electronically */\n"
                 "  if (!body.esignConsent || body.esignConsent.agree !== true) return { status: 400, out: { ok: false, error: 'Please tick the box to agree to do business electronically, then sign.' } };\n"
                 "  const esignC = { agree: true, at: new Date().toISOString(), version: clip(body.esignConsent.version, 20), consentAt: clip(body.esignConsent.at, 40) };\n"
                 "  const cancelC = body.cancelNotice && body.cancelNotice.ack === true ? { ack: true, state: clip(body.cancelNotice.state, 2) } : null;\n"
                 "  const cs = sel().cleanStrokes(body.strokes);", 'sign-gate')
        f = once(f, "amount: r.amount, docName: T(r.docName), name: name, strokes: cs.strokes, at: at, ip: ip, ref: sigId, sms: smsC, smsM: smsM });",
                 "amount: r.amount, docName: T(r.docName), name: name, strokes: cs.strokes, at: at, ip: ip, ref: sigId, sms: smsC, smsM: smsM, esign: esignC, cancel: cancelC });", 'pdf-args')
        f = once(f, "  if (smsC) signedRec.smsConsent = smsC;   /* patch SMSCONSENT */",
                 "  signedRec.esign = esignC; if (cancelC) signedRec.cancelNotice = cancelC;   /* LEGAL2-patch */\n  if (smsC) signedRec.smsConsent = smsC;   /* patch SMSCONSENT */", 'record')
        f = once(f, "  b.push({ t: 'p', text: 'Warranty: 5 years on roofing and insurance work, 1 year on all other work, from substantial completion, as stated on the warranty certificate.', size: 9, muted: true });",
                 "  b.push({ t: 'p', text: 'Warranty: 5 years on roofing and insurance work, 1 year on all other work, from substantial completion, as stated on the warranty certificate.', size: 9, muted: true });\n"
                 "  if (o.esign) b.push({ t: 'p', text: 'Electronic records: the signer agreed to do business electronically (E-SIGN / UETA disclosure, version ' + (o.esign.version || '') + ') before signing.', size: 9, muted: true });   /* LEGAL2-patch */\n"
                 "  if (o.cancel) b.push({ t: 'p', text: 'Notice of Cancellation: the signer confirmed receiving the Notice of Cancellation (' + o.cancel.state + ') and the explanation of the right to cancel. Form rev. 10/26/2026.', size: 9, muted: true });", 'pdf-lines')
        f += '\n/* ' + MARK + ' */\n'
        wr('netlify/functions/portal-sign.js', f)
        print('portal-sign.js patched')
    a = rd('netlify/functions/portal-access.js')
    if MARK not in a:
        a = once(a, "      if (body.agree !== true) throw Fail(400, 'Tick the box to agree, then sign.');\n      const strokes = cleanStrokes(body.strokes);",
                 "      if (body.agree !== true) throw Fail(400, 'Tick the box to agree, then sign.');\n"
                 "      /* LEGAL2-patch: E-SIGN / UETA consent before the signature */\n"
                 "      if (!body.esignConsent || body.esignConsent.agree !== true) throw Fail(400, 'Tick the box to agree to do business electronically, then sign.');\n"
                 "      const strokes = cleanStrokes(body.strokes);", 'gate')
        a = once(a, "const sig = { name: signName, strokes: strokes, at: now,", "const sig = { esign: { agree: true, at: now, version: clip(body.esignConsent.version, 20) }, name: signName, strokes: strokes, at: now,", 'sig')
        a += '\n/* ' + MARK + ' */\n'
        wr('netlify/functions/portal-access.js', a)
        print('portal-access.js patched')

def patch_misc():
    t = rd('netlify.toml')
    if MARK not in t:
        red = ''.join('[[redirects]]\n  from = "https://portal.grayco-cs.com/%s"\n  to = "/%s"\n  status = 200\n  force = true\n\n' % (n, n) for n in ('legal2.js', 'portal-terms.html', 'sub-terms.html', 'sub-privacy.html', 'esign-consent.html', 'cancel-notice.html', 'privacy.html', 'terms.html', 'sms-consent.html', 'mkt-pages.css'))
        t = once(t, '[[redirects]]\n  from = "https://portal.grayco-cs.com/*"', '# ' + MARK + ': the legal pages and the shared legal runtime are served on the portal host too\n' + red + '[[redirects]]\n  from = "https://portal.grayco-cs.com/*"', 'toml')
        wr('netlify.toml', t); print('netlify.toml patched')
    for ix, js in (('subportal/index.html', './legal2.js'), ('subportal-app/index.html', '/legal2.js')):
        h = rd(ix)
        if MARK in h: continue
        tag = '    <script src="%s"></script><script>document.addEventListener("DOMContentLoaded",function(){try{window.GCLegal&&window.GCLegal.boot({bid:true,base:"https://portal.grayco-cs.com"})}catch(e){}});</script><!-- %s -->\n' % (js, MARK)
        h = once(h, '  </head>', tag + '  </head>', ix)
        wr(ix, h); print(ix, 'patched')
    # the shared stylesheet for the static pages is part of the site already (mkt-pages.css)

if __name__ == '__main__':
    os.chdir(ROOT)
    write_static()
    patch_index(); patch_portal(); patch_portal_app(); patch_functions(); patch_misc()
    print('LEGAL2: %d documents' % len(DOCS))
