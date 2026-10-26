#!/usr/bin/env python3
"""Idempotent patch COMMCO: commercial jobs — every change order signed (whatever the amount), the job on hold until it
is, the GC superintendent initials the materials before work starts, and change orders / materials / submittals /
approvals go through the GC portal (link + e-mail, office@ copied).

Owner 10/26: "Commercial: we get change orders signed for any new work no matter what; the job cannot continue until
the change order is signed. We also need to initial all materials we are using in commercial on site for their supers
— before we start we have supers initial a checklist of materials we are using." Then: "all change orders, links,
submittals, approvals for commercial go through GC portal and email."

index.html:
  1. the COMMCO tail (tools/commco_tail.js; its RULES block is copied from netlify/functions/_lib/commco.js so the page
     and the server decide the same way);
  2. ➕ Add Change Order: on a commercial job every amount needs the GC's signature (no typed customer name — the GC
     signs in the GC portal); the CO is marked commco / requiresSignature;
  3. patch AUTO5: a commercial job's change order is not sent to the homeowner portal (it goes to the GC portal);
  4. patch GCP: a commercial job is a GC job; the panel gets 🧱 Materials / 📑 Submittals / ✅ Approvals; a signed GC
     change order that IS a job change order (crmId) marks that change order signed instead of adding a copy;
  5. patch JA: "🏗 Make the GC portal link" + "✉️ Send the GC portal invite" (commercial: on), the CO line's label;
  6. patch RP (Site Book): today's daily log on a stopped commercial job asks for the override.
legal2.js (3 copies): the commercial proposal contract gets the change-order / materials clause (residential and
insurance untouched).
Usage: python3 tools/patch_COMMCO.py [index.html]   ("already patched" on a rerun)
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* patch COMMCO v1 */'

def once(s, old, new, what=''):
    n = s.count(old)
    assert n == 1, ('anchor count != 1', what or old[:90], n)
    return s.replace(old, new)

def legal(root):
    CL = ("  if (kind === 'commercial') out.push((91 + op.length) + '. CHANGE ORDERS AND MATERIALS (COMMERCIAL): No added or changed work proceeds without a signed change order, whatever the amount; "
          "materials are reviewed and initialed by the GC\\u2019s superintendent before installation. GrayCo Construction Services, LLC stops the added or changed work until the change order is signed.');   /* patch COMMCO */\n")
    OLD = "  op.forEach(function(b, i){ out.push((91 + i) + '. ' + b.replace('described below', 'described above')); });   /* CONSIST-patch: after the cancellation clause */\n  return out.join('\\n\\n');"
    n = 0
    for rel in ('legal2.js', 'subportal/legal2.js', 'subportal-app/public/legal2.js'):
        f = os.path.join(root, rel)
        if not os.path.exists(f):
            continue
        t = open(f, encoding='utf-8').read()
        if 'patch COMMCO' in t:
            continue
        t = once(t, OLD, OLD.replace("\n  return out.join", "\n" + CL + "  return out.join"), rel)
        open(f, 'w', encoding='utf-8').write(t)
        n += 1
    return n

if MARK in src:
    print('already patched'); legal(os.path.dirname(os.path.abspath(path))); sys.exit(0)

# ---- 1. the tail (RULES copied from the server lib) ----------------------------------------------------------------
lib = open(os.path.join(ROOT, 'netlify/functions/_lib/commco.js'), encoding='utf-8').read()
m = re.search(r'/\* RULES-BEGIN[^\n]*\n(.*?)/\* RULES-END \*/', lib, re.S)
assert m, 'RULES block not found in _lib/commco.js'
tail = open(os.path.join(ROOT, 'tools/commco_tail.js'), encoding='utf-8').read()
assert tail.count('/*__RULES__*/') == 1
tail = tail.replace('/*__RULES__*/', '/* RULES (copied from netlify/functions/_lib/commco.js by tools/patch_COMMCO.py) */\n' + m.group(1).rstrip() + '\n')
assert '</script' not in tail
src = src.rstrip('\n') + '\n<script id="gc-patch-commco">\n' + MARK + '\n' + tail + '\n</script>\n'

# ---- 2. ➕ Add Change Order (gcAddCO) ------------------------------------------------------------------------------
src = once(src, """    if(absAmt>2500){
      th.style.background='#fef2f2'; th.style.color='#991b1b';""", """    if(absAmt>0 && window._gcCommco && _ctx && window._gcCommco.isComm(_ctx.pid)){   /* patch COMMCO: commercial — every amount */
      th.style.background='#fef2f2'; th.style.color='#991b1b';
      th.innerHTML='Commercial job: <b>every change order needs the GC’s signature, whatever the amount</b>. It goes to the GC portal to sign (and by e-mail), and <b>the job is on hold until it is signed</b>.'+(absAmt>2500?' Over $2,500: owner approval (Nick or Wesley) and the PM signature below too.':'');
      if(sw) sw.style.display=absAmt>2500?'block':'none';
    } else if(absAmt>2500){
      th.style.background='#fef2f2'; th.style.color='#991b1b';""", 'gcAddCO threshold')
src = once(src, """      if(!_sigCust){ if(errEl) errEl.textContent='Over $2,500: customer signature is required (type customer full name).'; return; }""",
          """      if(!_sigCust && !(window._gcCommco && window._gcCommco.isComm(_ctx.pid))){ if(errEl) errEl.textContent='Over $2,500: customer signature is required (type customer full name).'; return; }   /* patch COMMCO: the GC signs in the GC portal */""", 'gcAddCO save sig')
src = once(src, """      requiresOwnerApproval: Math.abs(amt)>2500,""", """      requiresOwnerApproval: Math.abs(amt)>2500,
      commco: !!(window._gcCommco && window._gcCommco.isComm(_ctx.pid)),   /* patch COMMCO: commercial — the GC signs every one; the job waits */
      requiresSignature: window._gcCommco ? window._gcCommco.coNeedsSign(window._gcCommco.isComm(_ctx.pid), { amt: amt }) : Math.abs(amt)>2500,
      createdAt: new Date().toISOString(),""", 'gcAddCO record')

# ---- 3. patch AUTO5: commercial change orders go to the GC portal, not the homeowner portal --------------------------
src = once(src, """  var want = coList().filter(function(c){ return c && c.id && c.pid && coOpen(c)""",
          """  var want = coList().filter(function(c){ return c && c.id && c.pid && !(W._gcCommco && W._gcCommco.isComm(c.pid)) /* patch COMMCO: the GC portal */ && coOpen(c)""", 'AUTO5 askCOs')

# ---- 4. patch GCP --------------------------------------------------------------------------------------------------
src = once(src, """function isGc(p){ if (!p) return false; if (p.gcJob === true || low(p.hiredBy) === 'gc') return true; if (p.gcJob === false) return false; var c = custOf(p);""",
          """function isGc(p){ if (!p) return false; if (p.gcJob === true || low(p.hiredBy) === 'gc') return true; if (p.gcJob === false) return false; if (W._gcCommco && W._gcCommco.isComm(p)) return true;   /* patch COMMCO */ var c = custOf(p);""", 'GCP isGc')
src = once(src, """function isCommercial(p){ return /commercial|tenant|\\bti\\b|new construction|government|municipal/i.test(s(p.type) + ' ' + s(p.jobType)); }""",
          """function isCommercial(p){ if (W._gcCommco) return W._gcCommco.isComm(p);   /* patch COMMCO: the one AUTOCOM rule */
  return /commercial|tenant|\\bti\\b|new construction|government|municipal/i.test(s(p.type) + ' ' + s(p.jobType)); }""", 'GCP isCommercial')
src = once(src, """['rfi', '❓ RFIs' + (openR ? ' · ' + openR + ' open' : '')], ['log', '🕑 What happened']].map(function(t){""",
          """['rfi', '❓ RFIs' + (openR ? ' · ' + openR + ' open' : '')]].concat(W._gcCommco ? W._gcCommco.gcpTabs(p, S) : []).concat([['log', '🕑 What happened']]).map(function(t){""", 'GCP tabs')
src = once(src, """  } else {
    h += '<div class="box">' + (arr(S.log).length""", """  } else if (W._gcCommco && /^(mats|subm|appr)$/.test(P.tab)) {   /* patch COMMCO */
    h += W._gcCommco.gcpPane(P.tab, p, st, P);
  } else {
    h += '<div class="box">' + (arr(S.log).length""", 'GCP panes')
src = once(src, """W._gcGCP = { open: open, workload: workload, docs: function(){ return CD.list; }, sweep: function(){ lastSweep = 0; return sweep(); }, isGc: isGc, checkinDone: checkinDone, annotate: annotate, _p: P };""",
          """W._gcGCP = { open: open, workload: workload, docs: function(){ return CD.list; }, sweep: function(){ lastSweep = 0; return sweep(); }, isGc: isGc, checkinDone: checkinDone, annotate: annotate, _p: P,
  _paint: paint, _load: load, _api: api, _store: storeFile };   /* patch COMMCO */""", 'GCP export')
src = once(src, """        if (cur.some(function(x){ return x && x.id === id; })) return;
        var p = proj(c.pid) || {};""", """        if (cur.some(function(x){ return x && x.id === id; })) return;
        /* patch COMMCO: the GC signed a job change order (sent from the job) → that change order is signed; no copy */
        if (c.crmId && (cur.some(function(x){ return x && x.id === c.crmId; }) || arr(crm().changeOrders).some(function(x){ return x && x.id === c.crmId; }))) { (byPid[c.pid].signedCrm = byPid[c.pid].signedCrm || []).push(c); byPid[c.pid].map[c.id] = c.crmId; return; }
        var p = proj(c.pid) || {};""", 'GCP sweep crmId')
src = once(src, """      var saved = added.length ? Promise.resolve(W.idbSet('cos', cur.concat(added))).then(function(){""",
          """      /* patch COMMCO: the signature onto the job's own change order (approved, signed by the GC) */
      var signedCrm = []; Object.keys(byPid).forEach(function(k){ signedCrm = signedCrm.concat(byPid[k].signedCrm || []); });
      if (signedCrm.length) {
        var put = function(x){ var g = signedCrm.filter(function(c){ return x && c.crmId === x.id; })[0]; return g && !x.signedAt ? Object.assign({}, x, { status: 'approved', gcSigned: true, customerSigned: true, signedBy: s(g.signedBy) + ' (GC portal)', signedAt: s(g.signedAt), sigCustomer: { name: s(g.signedBy), at: s(g.signedAt) }, approvedBy: s(g.signedBy) + ' (GC portal)', approvedAt: s(g.signedAt), gcCoId: g.id, gcCoNumber: s(g.number), updatedAt: new Date().toISOString() }) : x; };
        cur = cur.map(put);
        try { if (W._gcSetCOs) W._gcSetCOs(function(a){ return Array.isArray(a) ? a.map(put) : a; }); } catch (e) {}
        try { if (W._crm && Array.isArray(W._crm.changeOrders)) W._crm.changeOrders = W._crm.changeOrders.map(put); } catch (e) {}
        if (!added.length) { try { W.idbSet('cos', cur); if (W._gcLivePush) W._gcLivePush('cos'); else if (W._supaUpsert) W._supaUpsert('cos', cur); } catch (e) {} }
      }
      var saved = added.length ? Promise.resolve(W.idbSet('cos', cur.concat(added))).then(function(){""", 'GCP sweep save')

src = once(src, """sigCustomer: { name: s(c.signedBy), at: s(c.signedAt) }, source: 'GC portal', by: 'GC portal',""",
          """sigCustomer: { name: s(c.signedBy), at: s(c.signedAt) }, source: 'GC portal', signedAt: s(c.signedAt), signedBy: s(c.signedBy), gcSigned: true, customerSigned: true, by: 'GC portal',""", 'GCP sweep signed copy')   # patch COMMCO: a GC-signed one is signed (never holds a job)

# ---- 5. patch JA: the GC portal automations; the change-order line says what it does now ----------------------------
src = once(src, """  ['portal', 'Customer portal', 'The customer’s private GrayCo Portal page.'],""",
          """  ['portal', 'Customer portal / GC portal', 'The customer’s private GrayCo Portal page — or, on a commercial job, the GC’s project page.'],   /* patch COMMCO */""", 'JA section')
src = once(src, """  ['portalSelections', 'portal', '🎨 Customer picks selections in the portal', 'Off: the PM picks with them (their signature is still asked).', true],""",
          """  ['portalSelections', 'portal', '🎨 Customer picks selections in the portal', 'Off: the PM picks with them (their signature is still asked).', true],
  ['gcPortalLink', 'portal', '🏗 Make the GC portal link', 'The GC’s private project page: change orders to sign, submittals, materials approval, approval requests.', { commercial: true, other: false }],   /* patch COMMCO */
  ['gcPortalInvite', 'portal', '✉️ Send the GC portal invite', 'E-mail the link to the GC contacts (office@ copied).', { commercial: true, other: false }, false, 'pm'],""", 'JA opts')
src = once(src, """  ['coSign', 'docs', '± Change orders over $2,500 for signature', 'Sent to the customer to sign.', true, false, 'admin'],""",
          """  ['coSign', 'docs', '± Change orders for signature', 'Over $2,500, sent to the customer to sign. Commercial: every change order, whatever the amount, to the GC (the job waits until it is signed).', true, false, 'admin'],   /* patch COMMCO */""", 'JA coSign')

# ---- 6. patch RP (Site Book): the daily log on a stopped commercial job ---------------------------------------------
src = once(src, """  function addTo(pid, list, item){ return edit(pid, function(r){""",
          """  function addTo(pid, list, item){ if (list === 'logs' && window._gcCommco && window._gcCommco.blockNow(pid, 'log', function(){ addTo(pid, list, item); })) return null;   /* patch COMMCO */
    return edit(pid, function(r){""", 'RP addTo')

open(path, 'w', encoding='utf-8').write(src)
print('patched COMMCO;', legal(os.path.dirname(os.path.abspath(path))), 'legal2.js copies')
