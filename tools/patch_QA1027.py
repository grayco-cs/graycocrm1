#!/usr/bin/env python3
"""Idempotent patch QA1027: fixes from the overnight QA of 10/27 (before staff use the r7 features).

 * LEADKIND (owner 10/27): a lead's type follows the job rule (AUTOCOM). A lead from a bid site / public bid /
   BuildingConnected / PlanHub / a GC invite, or for a government / public owner (county, city, state, federal, municipal,
   fire station, park, school, church …) is COMMERCIAL; PROGRAM work is INSURANCE; other leads keep their type. Never turns
   commercial / government / insurance into residential. The rule (tools/leadkind_core.js) is the same text on the page and
   in netlify/functions/_lib/job-auto.js (leadKindOf). The page uses it for the Leads screen badge, the Type filter and the
   bid test, stamps it on leads the Estimate Builder / an estimate upload creates, and runs a one-time, logged fix of the
   open leads already mislabelled, run by an admin from Leads → ⋯ → Fix lead types (N) (it lists the changes first;
   window._gcLeadKindFix({dry:true}) shows the plan, window._gcLeadKindLog() the log; each lead gets kindAuto + a
   history line). Admins get a one-time hint when any open lead needs it.

 * GrayCo Photos wording (owner 10/27): GrayCo Photos and CompanyCam are the same thing; CompanyCam stays behind the scenes.
   Staff-visible text (buttons, labels, tooltips, toasts, lead source labels, TV slide sources, proposal scope lines, help,
   notes written on new leads / jobs) says "GrayCo Photos"; the links that opened CompanyCam itself are gone (the
   "Open in GrayCo Photos" buttons stay); admin-only places where the CompanyCam account is connected / checked say
   "Photo sync (CompanyCam)" or keep the word. Ids, function names, env vars, data values and sync code are unchanged
   (an old saved source filter "CompanyCam (PM's own)" still reads). The pairs are in tools/qa1027_ccwords.json
   (find → new, with the expected count). The job page header is not touched here.

 * SUBHIDE follow-up (legal2.js): the customer / GC portal sign-in note ("By signing in you agree to …") still named the
   "Sub Portal Terms of Use" (its .replace() never matched the <a> links). Customers see the customer terms + privacy;
   the sub / bid portal sees the sub ones.
Every find-string must occur exactly the expected number of times (else nothing is written).
Usage: python3 tools/patch_QA1027.py [index.html]
"""
import sys, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* patch QA1027 */'
CORE = open(os.path.join(ROOT, 'tools', 'leadkind_core.js'), encoding='utf-8').read()
PAGE = open(os.path.join(ROOT, 'tools', 'leadkind_page.js'), encoding='utf-8').read()

# ── the server rule (netlify/functions/_lib/job-auto.js): same core, exported as leadKindOf
ja_path = os.path.join(os.path.dirname(os.path.abspath(path)), 'netlify', 'functions', '_lib', 'job-auto.js')
if os.path.exists(ja_path):
    ja = open(ja_path, encoding='utf-8').read()
    if 'patch LEADKIND' not in ja:
        a = "/* legacy === true: a job made before AUTOCOM with no choices of its own keeps doing what it did (the old table) */"
        b = "  isBidJob: isBidJob, isCompany: isCompany, COMM: COMM, AUTOCOM_V: AUTOCOM_V };"
        assert ja.count(a) == 1 and ja.count(b) == 1, 'job-auto.js anchors'
        ja = ja.replace(a, CORE.rstrip('\n') + '\n' + a).replace(b, "  isBidJob: isBidJob, isCompany: isCompany, COMM: COMM, AUTOCOM_V: AUTOCOM_V,\n  leadKindOf: leadKindOf, leadPublicWord: lkPublic };   /* patch LEADKIND */")
        open(ja_path, 'w', encoding='utf-8').write(ja)
        print('job-auto.js: leadKindOf added')
    else:
        print('job-auto.js: already has leadKindOf')

fdir = os.path.join(os.path.dirname(os.path.abspath(path)), 'netlify', 'functions')
for fn, pairs in [('companycam-sync.js', [("name: p.name || p.address || ('CompanyCam ' + p.id)", "name: p.name || p.address || ('GrayCo Photos ' + p.id)"),
                                          ("if (note) j.notes = 'Made in CompanyCam' + (p.creator ? ' by '", "if (note) j.notes = 'Made in GrayCo Photos' + (p.creator ? ' by '")]),
                  ('companycam-webhook.js', [("name: proj.name || addr || 'New CompanyCam Project',", "name: proj.name || addr || 'New GrayCo Photos Project',")])]:
    fp = os.path.join(fdir, fn)
    if not os.path.exists(fp): continue
    t = open(fp, encoding='utf-8').read()
    if all(n in t for _, n in pairs): continue
    for o, n in pairs:
        assert t.count(o) == 1, (fn, o)
        t = t.replace(o, n)
    open(fp, 'w', encoding='utf-8').write(t); print(fn + ': GrayCo Photos wording')

# SUBHIDE follow-up: the customer / GC portal sign-in note ("By signing in you agree to …") still listed "Sub Portal Terms of
# Use". The note now names the customer documents only, and the sub ones only on the sub / bid portal (o.bid or GCPartner).
lp = os.path.join(os.path.dirname(os.path.abspath(path)), 'legal2.js')
if os.path.exists(lp):
    t = open(lp, encoding='utf-8').read()
    if 'patch QA1027' not in t:
        a = "function signinNote(base){\n  var p = D.createElement('p'); p.setAttribute('data-gc-legal-note', '1'); p.style.cssText = 'font:12.5px/1.45 Arial,sans-serif;color:#475569;margin:10px 0 0;text-align:center';\n  p.innerHTML = 'By signing in you agree to the ' + linksHtml(base, 'all').replace(' &middot; Sub Portal Privacy Notice', '').replace(' &middot; E-SIGN Disclosure', '') + '"
        b = ("function signinNote(base, sub){   /* patch QA1027 (SUBHIDE): customers and GCs never see the sub portal's documents (the old\n"
             "     .replace(' &middot; …') never matched the <a> links, so the customer note listed every document) */\n"
             "  var p = D.createElement('p'); p.setAttribute('data-gc-legal-note', '1'); p.style.cssText = 'font:12.5px/1.45 Arial,sans-serif;color:#475569;margin:10px 0 0;text-align:center';\n"
             "  var L2 = sub ? [['Sub Portal Terms of Use', '/sub-terms.html'], ['Sub Portal Privacy Notice', '/sub-privacy.html']] : [['Customer Portal Terms of Use', '/portal-terms.html'], ['Privacy', '/privacy.html']];\n"
             "  p.innerHTML = 'By signing in you agree to the ' + L2.map(function(x){ return '<a href=\"' + (base || '') + x[1] + '\" target=\"_blank\" rel=\"noopener\">' + x[0] + '</a>'; }).join(' &middot; ') + '")
        c = "if (tgt && !tgt.querySelector('[data-gc-legal-note]')) tgt.appendChild(signinNote(base));"
        d = "if (tgt && !tgt.querySelector('[data-gc-legal-note]')) tgt.appendChild(signinNote(base, !!(o.bid || W.GCPartner)));"
        e = "if (host && !host.querySelector('[data-gc-legal-note]')) { var n = signinNote(base); host.appendChild(n); } }"
        f = "if (host && !host.querySelector('[data-gc-legal-note]')) { var n = signinNote(base, true); host.appendChild(n); } }"
        for o_, n_ in [(a, b), (c, d), (e, f)]:
            assert t.count(o_) == 1, ('legal2.js', o_[:60])
            t = t.replace(o_, n_)
        open(lp, 'w', encoding='utf-8').write(t); print('legal2.js: sign-in note without the sub documents for customers')

if MARK in src:
    print('index.html: already patched'); sys.exit(0)

EDITS = []
def once(old, new, label, n=1):
    EDITS.append((old, new, label, n))

# ── 1. LEADKIND: the rule + the page's helpers, inside the AUTOCOM block (groupCore, proj, isAdmin are there)
once("W._gcJA = {\n",
     CORE.rstrip('\n') + "\n" + PAGE.rstrip('\n') + "   " + MARK + "\n\nW._gcJA = {\n", 'leadkind block')
# the bid test (HOT2): a lead the rule calls commercial is a bid; program work (insurance) is not
once("  if (/commerc|gov|public|municipal|federal/.test(t)) return true;\n  if (/resid|home|house|insur|storm|claim|mitig|water|fire/.test(t)) return false;",
     "  if (/commerc|gov|public|municipal|federal/.test(t)) return true;\n"
     "  var lkA = ''; try { lkA = typeof W._gcLeadAutoKind === 'function' ? W._gcLeadAutoKind(l) : ''; } catch (e) {} if (lkA === 'Commercial') return true; if (lkA === 'Insurance') return false;   /* patch QA1027 LEADKIND */\n"
     "  if (/resid|home|house|insur|storm|claim|mitig|water|fire/.test(t)) return false;", 'isBid')
# the Type filter / badge (typesOf): the rule's answer is the lead's type
once("  var typ = low(l.leadKind || l.type), all = (typ + ' | ' + tx).toLowerCase(), out = [];",
     "  var typ = low(l.leadKind || l.type), all = (typ + ' | ' + tx).toLowerCase(), out = [];\n"
     "  var lkA = ''; try { lkA = typeof W._gcLeadAutoKind === 'function' ? W._gcLeadAutoKind(l) : ''; } catch (e) {} if (lkA) { typ = low(lkA); all = typ + ' | ' + all; }   /* patch QA1027 LEADKIND */", 'typesOf')
# the Leads engine hands out patchMany (one write for the one-time fix)
once("markContacted: markContacted, assign: assign, patchLead: patchLead, setLeads: setLeads,",
     "markContacted: markContacted, assign: assign, patchLead: patchLead, patchMany: patchMany /* patch QA1027 */, setLeads: setLeads,", 'engine patchMany')
# the Leads screen's ⋯ menu (admins): Fix lead types (N)
once("  if (adm && W._gcLeadClean) h += item('clean', 'Clean up', nCl ? String(nCl) : '');",
     "  if (adm && W._gcLeadClean) h += item('clean', 'Clean up', nCl ? String(nCl) : '');\n"
     "  if (adm && W._gcLeadKindCount) { var nK = 0; try { nK = W._gcLeadKindCount(); } catch (x) {} if (nK) h += item('kindfix', 'Fix lead types', String(nK)); }   /* patch QA1027 LEADKIND */", 'menu item')
once("  else if (a === 'clearf') { clearFilters(); }   /* patch LUXSYNC */",
     "  else if (a === 'clearf') { clearFilters(); }   /* patch LUXSYNC */\n"
     "  else if (a === 'kindfix') { try { if (W._gcLeadKindRun) W._gcLeadKindRun().then(function(){ FORCE = true; dirty('kindfix'); }); } catch (x) {} }   /* patch QA1027 LEADKIND */", 'menu action')
# new leads: the Estimate Builder's bidding lead, an estimate upload's lead
once("            estimateId: est.id, pid: pid, created: new Date().toISOString().slice(0,10)\n          };\n",
     "            estimateId: est.id, pid: pid, created: new Date().toISOString().slice(0,10)\n          };\n"
     "          try{ if(window._gcLeadKindStamp) window._gcLeadKindStamp(lead, { estGc: est.gc||'', estClient: est.client||'', estName: est.name||'', estType: est.type||'' }); }catch(_lk){}   /* patch QA1027 LEADKIND */\n", 'estbuilder lead')
once("    if (!lead(l.id)) { manual('lead from an estimate'); addLead(l); }",
     "    try { if (W._gcLeadKindStamp) W._gcLeadKindStamp(l, { estClient: s(rd.f.customer), estName: s(o.title) || s(rd.f.project) }); } catch (e) {}   /* patch QA1027 LEADKIND */\n"
     "    if (!lead(l.id)) { manual('lead from an estimate'); addLead(l); }", 'estimate upload lead')

# ── 2. GrayCo Photos wording
import json
for pr in json.load(open(os.path.join(ROOT, 'tools', 'qa1027_ccwords.json'), encoding='utf-8')):
    once(pr['find'], pr['new'], 'ccwords: ' + pr['find'][:50], pr['count'])

bad = [(lbl, src.count(o), n) for (o, _, lbl, n) in EDITS if src.count(o) != n]
if bad:
    print('find-string count mismatch, nothing written:', bad); sys.exit(1)
for (o, nw, lbl, n) in EDITS:
    assert src.count(o) == n, ('changed by an earlier edit', lbl)
    src = src.replace(o, nw)
open(path, 'w', encoding='utf-8').write(src)
print('index.html: patched (%d edits)' % len(EDITS))
