#!/usr/bin/env python3
"""Idempotent patch ESTPDF: the PDF that was SENT on every estimate; estimates go out FROM the CRM (owner, 11/01).

Owner (Hyatt Studios, PO S251, Estimates tab): "when I pull up estimates here I want to pull up the PDF that was SENT OUT,
not whatever this is. The PDF has to be in the CRM to be sent out." Then: estimates come from the CRM (from the PM's own
e-mail), into the portal; text / Google Docs sends are uploaded the same way; the customer profile is complete and the
customer features for the job are chosen before a send; a lead / job moves past "Estimate Sent" only once the estimate is
in the portal (an admin may override with a reason). See the header of tools/estpdf_tail.js.

What this changes in index.html (each anchor asserted once; a re-run prints "already patched"):
  1. tools/estpdf_tail.js goes in as <script id="gc-patch-estpdf"> right before gc-patch-roleapps (the last script);
  2. the job's 📝 Estimates tab (the React card): the list is the Estimates screen's own list for the job
     (window._gcEstJobList → _gcEST3.byJob, the same rows and the same de-duplication), the card opens the SENT PDF (the
     editor when never sent), and a slot paints "📄 Sent PDF · Sent Oct 26 to … · v2 · All versions", "Not sent yet",
     "Sent before PDF saving started — no copy on file · 📎 Attach the sent PDF", "✏ Open estimate", and a folded
     autosave draft ("Unsaved changes from … — Open · Discard");
  3. patch EST3: the builder's Send opens 📤 Send estimate; _gcEST3.byJob(pid) = the list's rows for one job;
  4. patch ESTIN: the automatic proposal is a PDF or nothing (no HTML stand-in), and its upload to the file storage is
     confirmed before the approval is asked;
  5. patch JOBFILL: "Suggested — link?" never offers an autosave draft / marker of an estimate the job already has, and a
     real other estimate reads "Another estimate named X, not on any job"; the admin's "↔ Move to job" rows fold into one line;
  6. patch ROLEAPPS (and tools/roleapps.js, the same lines): 📤 Send estimate and ＋ New customer on the Estimator home
     (Field quick buttons and Desk tiles), Send estimate in the PM's More, and the Estimator / Admin home cards from
     window._gcEstPdf.raCard (the outside-the-CRM overrides list);
  7. patch JA (and netlify/functions/_lib/job-auto.js, the same table): a "weeklyUpdates" switch (default ON for every job
     type, so no job changes) that the weekly update approvals obey (KIND_KEY weekly_update).
  8. the Templates → Customer Proposal Generator: its data / HTML builders are exposed as window._gcProposal5 (📤 Send
     estimate's "GrayCo 5-page proposal" and the card's "📘 Make proposal" reuse them); the per-job grid becomes a note.
  9. patch JA's ⚙ Admin defaults read "⚡ Customer features by job type" (the features step uses those switches).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
t = open(p, encoding='utf-8').read()
MARK = '/* patch ESTPDF */'
if MARK in t:
    print('ESTPDF: already patched'); sys.exit(0)


def once(src, a, b, label=''):
    c = src.count(a)
    assert c == 1, 'ESTPDF: expected 1 of %r, found %d %s' % (a[:100], c, label)
    return src.replace(a, b)


# ── 1. the tail ─────────────────────────────────────────────────────────────────────────────────────────────────
TAIL = open(os.path.join(HERE, 'estpdf_tail.js'), encoding='utf-8').read().rstrip('\n')
assert '</script' not in TAIL.lower()
RA = '<script id="gc-patch-roleapps">'
t = once(t, RA, '<script id="gc-patch-estpdf">\n' + MARK + '\n' + TAIL + '\n</script>\n' + RA)

# ── 2. the job's Estimates tab (React) ──────────────────────────────────────────────────────────────────────────
t = once(t, '_pest=(fa||[]).filter(G=>G&&G.pid===j.id)',
         '_pest=(window._gcEstJobList?window._gcEstJobList(j.id,fa):(fa||[]).filter(G=>G&&G.pid===j.id))/* patch ESTPDF: the Estimates screen\'s own rows for this job — one list, one count */')
t = once(t, 'onClick:()=>{try{window._gcJumpToEstimates&&window._gcJumpToEstimates(j.id,_es.id);}catch(_e){}},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsxs("b",{style:{fontSize:13},children:[(_es.winning',
         'onClick:()=>{try{if(window._gcEstPdf&&window._gcEstPdf.openCard)window._gcEstPdf.openCard(_es.id,j.id);else window._gcJumpToEstimates&&window._gcJumpToEstimates(j.id,_es.id);}catch(_e){}}/* patch ESTPDF: the sent PDF; the editor when never sent */,children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsxs("b",{style:{fontSize:13},children:[(_es.winning')
t = once(t, 'e.jsxs("div",{style:{fontSize:11,color:u.tx2,marginTop:2},children:[(_es.status||"draft")," · ",_es.date||_es.created||""]}),',
         'e.jsxs("div",{style:{fontSize:11,color:u.tx2,marginTop:2},children:[(_es.status||"draft")," · ",_es.date||_es.created||""]}),'
         'e.jsx("div",{className:"gcep-slot","data-est":_es.id,"data-pid":j.id,ref:function(_el){if(_el&&window._gcEstPdf)window._gcEstPdf.paintSlot(_el,_es.id,j.id);}})/* patch ESTPDF: 📄 Sent PDF · Not sent yet · ✏ Open estimate */,')

# ── 3. patch EST3: Send → 📤 Send estimate; byJob ─────────────────────────────────────────────────────────────────
t = once(t, """function send(){
  flush();
  var rec = curRec(); if (!rec) { toast('Give it a name and at least one line first.'); return; }
  /* the portal signature flow (patch AUTO5): the job (made when there is none), the e-mail to sign on ✅ Approvals */""",
         """function send(){
  flush();
  var rec = curRec(); if (!rec) { toast('Give it a name and at least one line first.'); return; }
  /* patch ESTPDF: ONE send — the profile, the customer features, the PDF stored first, from the PM's e-mail, into the portal */
  if (W._gcEstPdf && typeof W._gcEstPdf.openSend === 'function') { later(function(){ W._gcEstPdf.openSend(rec.id, { after: function(j){ if (j && j.ok && M.sess && !M.sess.pid) { var r2 = curRec(); if (r2 && r2.pid) M.sess.pid = r2.pid; } } }); }, 400); return; }
  /* the portal signature flow (patch AUTO5): the job (made when there is none), the e-mail to sign on ✅ Approvals */""")
t = once(t, "  open: openEst, newEst: newEst, list: allEsts, flags",
         "  byJob: function(pid){   /* patch ESTPDF: the list's rows for one job (the same versions fold as the screen) — the job's Estimates tab shows exactly these */\n"
         "    var inCrm = {}; crmList().forEach(function(e){ if (e && e.id) inCrm[e.id] = 1; });\n"
         "    var keepScore = function(e){ return (inCrm[e.id] ? 2e13 : 0) + (2e13 - (Date.parse(createdOf(e)) || 0) / 1e3); };\n"
         "    var seen = {}, out = [];\n"
         "    allEsts().filter(function(e){ return e && s(e.pid) === s(pid); }).forEach(function(e){ var ds = dupSig(e), o = seen[ds]; if (o) { if (keepScore(e) > keepScore(o)) { out[out.indexOf(o)] = e; seen[ds] = e; } return; } seen[ds] = e; out.push(e); });\n"
         "    return out.sort(function(a, b){ return createdOf(b).localeCompare(createdOf(a)) || stamp(b).localeCompare(stamp(a)); });\n"
         "  },\n"
         "  open: openEst, newEst: newEst, list: allEsts, flags")

# ── 4. patch ESTIN: a PDF or nothing, the upload confirmed ────────────────────────────────────────────────────────
t = once(t, """  return pdfBlob(html).then(function(b){
    var file = b ? new File([b], base + '.pdf', { type: 'application/pdf' }) : new File([html], base + '.html', { type: 'text/html' });
    if (typeof W._gcStoreFile !== 'function') return { ref: '', name: file.name, type: file.type };
    return W._gcStoreFile(file, { kind: 'doc', pid: pid, name: file.name }).then(function(m){ return { ref: s(m && m.ref), name: file.name, type: file.type }; }, function(){ return { ref: '', name: file.name, type: file.type }; });
  });""",
         """  return pdfBlob(html).then(function(b){
    /* patch ESTPDF: "The PDF has to be in the CRM to be sent out" — a PDF or nothing (no HTML stand-in), its upload confirmed */
    if (!b) return { ref: '', name: base + '.pdf', type: 'application/pdf', why: 'the PDF could not be made' };
    var file = new File([b], base + '.pdf', { type: 'application/pdf' });
    if (W._gcEstPdf && typeof W._gcEstPdf.storeConfirmed === 'function') return W._gcEstPdf.storeConfirmed(file, file.name).then(function(m){ return { ref: s(m && m.ref), name: file.name, type: file.type }; }, function(){ return { ref: '', name: file.name, type: file.type }; });
    if (typeof W._gcStoreFile !== 'function') return { ref: '', name: file.name, type: file.type };
    return W._gcStoreFile(file, { kind: 'doc', pid: pid, name: file.name }).then(function(m){ return { ref: s(m && m.ref), name: file.name, type: file.type }; }, function(){ return { ref: '', name: file.name, type: file.type }; });
  });""")
t = once(t, "    if (!f.ref) throw new Error('The proposal file could not be kept (sign in again).');",
         "    if (!f.ref) throw new Error(\"Couldn't save the PDF to the CRM — not sent. Try again.\");   /* patch ESTPDF */")

# ── 5. patch JOBFILL: no autosave draft / marker as a "suggestion"; say what a real one is ─────────────────────────
t = once(t, "    : kind === 'estimates' ? estimates().filter(function(x){ return !estPid(x) && !x.deleted; })",
         "    : kind === 'estimates' ? (function(){   /* patch ESTPDF: an autosave copy / marker of an estimate this job already has is that estimate (its card shows \"Unsaved changes\"), never a suggestion */\n"
         "        var mineN = {}; estimates().forEach(function(e){ if (e && estPid(e) === s(job.id) && !e.deleted) { mineN[norm(e.name)] = 1; mineN['id:' + s(e.id)] = 1; } });\n"
         "        return estimates().filter(function(x){ if (estPid(x) || x.deleted) return false; if (x._supersededBy || x._promotedTo) return false;\n"
         "          if ((/^draft_/.test(s(x.id)) || x._isDraft === true) && (mineN[norm(x.name)] || mineN['id:' + s(x._savedEstId || x.estId || '')])) return false; return true; }); })()")
t = once(t, "    var x = r.item, t = kind === 'estimates' ? (s(x.name) || 'Estimate') + (x.status ? ' · ' + s(x.status) : '') + (x.date ? ' · ' + s(x.date).slice(0, 10) : '')",
         "    var x = r.item, t = kind === 'estimates' ? 'Another estimate named \\u201c' + (s(x.name) || 'Estimate') + '\\u201d, not on any job' + (x.status ? ' · ' + s(x.status) : '') + (x.date ? ' · ' + s(x.date).slice(0, 10) : '')   /* patch ESTPDF */")

# the admin's "↔ Move to job" rows for the job's OWN estimates read like a second list next to the cards: one folded line
t = once(t, "  return '<div style=\"margin-top:6px\">' + own.map(function(e){",
         "  return '<details class=\"gcjf-move\" style=\"margin-top:6px\"><summary style=\"cursor:pointer;font-size:12px;color:#475569;font-weight:700\">↔ Move an estimate to another job (admin)</summary>' + own.map(function(e){   /* patch ESTPDF: folded — the estimates themselves are the cards below */")
t = once(t, "  }).join('') + '</div>';\n}\nvar OPEN = {};", "  }).join('') + '</details>';\n}\nvar OPEN = {};")

# ── 6. patch ROLEAPPS: Send estimate, New customer, the home cards ──────────────────────────────────────────────
RA_EDITS = [
    ("  estimates: { ic: '🧮', l: 'Estimates', view: 'estimates', run: function(){ go('estimates'); } },",
     "  estimates: { ic: '🧮', l: 'Estimates', view: 'estimates', run: function(){ go('estimates'); } },\n"
     "  sendest:   { ic: '📤', l: 'Send estimate', show: function(){ return !!(W._gcEstPdf && W._gcEstPdf.openSend); }, run: function(){ W._gcEstPdf.openSend(); } },   /* patch ESTPDF */\n"
     "  newcust:   { ic: '👤', l: 'New customer', show: function(){ return !!(W._gcEstPdf && W._gcEstPdf.newCustomer); }, run: function(){ W._gcEstPdf.newCustomer(); } },   /* patch ESTPDF: + New customer → Start estimate */"),
    ("  est:    ['bids', 'visit', 'roofscout', 'myleads', 'quickest', 'photos'],",
     "  est:    ['sendest', 'newcust', 'bids', 'visit', 'myleads', 'quickest', 'roofscout', 'photos'],   /* patch ESTPDF: 📤 Send estimate, 👤 New customer first */"),
    ("  pm:     ['maint', 'cust', 'sub', 'leads', 'estimates', 'receipt', 'todo', 'search'],",
     "  pm:     ['maint', 'cust', 'sub', 'leads', 'estimates', 'sendest', 'receipt', 'todo', 'search'],"),
    ("    h += card('bids', 'Bids due (' + B.length + ')', bidsHtml(B));",
     "    try { if (W._gcEstPdf && W._gcEstPdf.raCard) h += W._gcEstPdf.raCard('est'); } catch (e) { warn(e); }   /* patch ESTPDF: Send estimate + the overrides list */\n"
     "    h += card('bids', 'Bids due (' + B.length + ')', bidsHtml(B));"),
    ("    h += card('appr', 'Approvals (' + n + ')', apprHtml(), all);\n    var Lz = myLeads();",
     "    h += card('appr', 'Approvals (' + n + ')', apprHtml(), all);\n"
     "    try { if (W._gcEstPdf && W._gcEstPdf.raCard) h += W._gcEstPdf.raCard('admin'); } catch (e) { warn(e); }   /* patch ESTPDF: estimates marked sent outside the CRM (admin overrides) */\n"
     "    var Lz = myLeads();"),
]
for a, b in RA_EDITS:
    t = once(t, a, b, '(roleapps in index.html)')
ra_src = os.path.join(HERE, 'roleapps.js')
r = open(ra_src, encoding='utf-8').read()
if 'patch ESTPDF' not in r:
    for a, b in RA_EDITS:
        r = once(r, a, b, '(tools/roleapps.js)')
    open(ra_src, 'w', encoding='utf-8').write(r)

# ── 7. patch JA: weeklyUpdates (default on) ─────────────────────────────────────────────────────────────────────
t = once(t, "  ['progressPosts', 'email', '📸 Progress posts notification', 'When the PM posts an update to the portal.', true, false, 'pm'],",
         "  ['progressPosts', 'email', '📸 Progress posts notification', 'When the PM posts an update to the portal.', true, false, 'pm'],\n"
         "  ['weeklyUpdates', 'email', '📰 Weekly updates in the portal', 'The friendly weekly progress update (portal + e-mail), still approved by the PM.', true, false, 'pm'],   /* patch ESTPDF */")
t = once(t, "  checkup: 'yearlyCheckup', contract: 'contractSign', faq_packet: 'faqPacket', warranty: 'warrantyCert', lien_waiver: 'lienWaivers', w9: 'w9', change_order: 'coSign' };\nvar NOT_ALL",
         "  checkup: 'yearlyCheckup', contract: 'contractSign', faq_packet: 'faqPacket', warranty: 'warrantyCert', lien_waiver: 'lienWaivers', w9: 'w9', change_order: 'coSign', weekly_update: 'weeklyUpdates' };   /* patch ESTPDF */\nvar NOT_ALL")
ja = os.path.join(HERE, '..', 'netlify', 'functions', '_lib', 'job-auto.js')
j = open(ja, encoding='utf-8').read()
if 'weeklyUpdates' not in j:
    j = once(j, "  ['welcome', 'email', true], ['scheduleUpdates', 'email', true], ['apptAuto', 'email', false], ['progressPosts', 'email', true], ['docsNotice', 'email', true],",
             "  ['welcome', 'email', true], ['scheduleUpdates', 'email', true], ['apptAuto', 'email', false], ['progressPosts', 'email', true], ['weeklyUpdates', 'email', true], ['docsNotice', 'email', true],   /* patch ESTPDF: weeklyUpdates */")
    j = once(j, "  lien_waiver: 'lienWaivers', w9: 'w9', change_order: 'coSign'\n};",
             "  lien_waiver: 'lienWaivers', w9: 'w9', change_order: 'coSign', weekly_update: 'weeklyUpdates'   /* patch ESTPDF */\n};")
    open(ja, 'w', encoding='utf-8').write(j)

# ── 8. the Customer Proposal Generator (Templates): one estimate, two outputs ───────────────────────────────────
#    its data + HTML builders are exposed (window._gcProposal5) so 📤 Send estimate ("GrayCo 5-page proposal") and the job's
#    "📘 Make proposal" reuse it — nothing rebuilt; the Templates page drops the per-job grid for a short note.
t = once(t, 'tc(E),fl(!0)},hl=g=>{', 'if(window.__gcP5Only){window.__gcP5Last=E;return E;}/* patch ESTPDF: the data only */tc(E),fl(!0)},hl=g=>{')
t = once(t, '},zf=({pd:_initPd,onGenerate:H,onClose:_})=>{',
         '},_gcP5x=(window._gcProposal5={data:function(g,te){window.__gcP5Only=true;try{return ls(g,te);}finally{window.__gcP5Only=false;}},html:hl,open:function(g,te){return ls(g,te);}})/* patch ESTPDF */,zf=({pd:_initPd,onGenerate:H,onClose:_})=>{')
G0 = 'e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8},children:g.length?g.map(te=>e.jsxs("div",{style:{padding:10,borderRadius:6,border:'
G1 = 'children:"No active/bidding projects — launch a job first"})})'
assert t.count(G0) == 1 and t.count(G1) == 1, 'ESTPDF: the Templates grid anchors'
i = t.index(G0); j = t.index(G1, i) + len(G1)
t = t[:i] + 'e.jsx("div",{"data-gcep-p5note":"1",style:{fontSize:12.5,color:u.tx2,padding:"8px 2px",lineHeight:1.5},children:"Make a proposal from the job\u2019s 📝 Estimates tab (📘 Make proposal) or 📤 Send estimate — the estimate is made once and this 5-page design comes from it. (The design and its wording stay here.)"})/* patch ESTPDF: no per-job grid */' + t[j:]

# ── 9. ⚙ Admin: patch JA's defaults are the "Customer features by job type" (one place, the same switches) ─────────
t = once(t, "    sh.innerHTML = '<h2>⚡ Automation defaults</h2>", "    sh.innerHTML = '<h2>⚡ Customer features by job type</h2>")   # patch ESTPDF
t = once(t, "  c.innerHTML = '<span><b>⚡ Automation defaults</b> · ", "  c.innerHTML = '<span><b>⚡ Customer features by job type</b> (automation defaults) · ")

open(p, 'w', encoding='utf-8').write(t)
print('ESTPDF: patched (%d bytes)' % len(t))
