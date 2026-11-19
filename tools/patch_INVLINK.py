#!/usr/bin/env python3
"""patch INVLINK — invoices on the right job, QuickBooks only for past jobs, sub / supplier invoices (owner 11/19).
Idempotent: every part has its own /* INVLINK… */ marker and asserts each anchor exactly once; a re-run prints "already patched".
  A. tools/invlink_block.html (+ tools/invlink_core.js, the pure core, inserted at /*@@CORE@@*/) → <script id="gc-patch-invlink">,
     appended at the end of the page (after patch SUPPLIERINV, whose _gcIsSupplierInv it replaces).
  B. ▥ Invoices (React bundle): the client PO column shows the job's PO, never the word "view"; three tabs Client · Sub · Supplier;
     a bill's Assign… list starts with the matcher's guesses.
  C. The finders never link on the customer's name alone: FINDJOB _gcJobForInvoice, LCLEAN-Q's sweep, the QuickBooks history import.
  D. No automatic draw invoice on a past job: the legacy progress-billing cron, the % slider, JOBFILL ensureDraws.
Usage: python3 tools/patch_INVLINK.py [index.html]"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
src = open(path, encoding='utf-8').read()
CORE = open(os.path.join(HERE, 'invlink_core.js'), encoding='utf-8').read()
BLOCK = open(os.path.join(HERE, 'invlink_block.html'), encoding='utf-8').read().replace('/*@@CORE@@*/', CORE.strip())
PAST = "(window._gcInvLink&&window._gcInvLink.isPastJob&&window._gcInvLink.isPastJob({P}))"
def past(v): return PAST.replace('{P}', v)

PARTS = []
# ── B. the bundle ──
B1 = 'children:[W.po||"view"," 📄"]'
B1n = ('children:[(window._gcInvPoCell?window._gcInvPoCell(W):(W.po||"—"))/* INVLINK-B1: the job\'s PO, never "view"; the invoice # under it (two invoices on one job no longer look doubled) */," 📄",'
       '(window._gcInvNumCell&&window._gcInvNumCell(W))?e.jsx("span",{style:{display:"block",fontSize:10,fontWeight:600,color:"#64748b",textDecoration:"none"},children:"#"+window._gcInvNumCell(W)}):null]')
B2 = ('[{id:"client",l:`Client Invoices (${De.length})`},{id:"sub",l:`Sub Invoices (${z.length})`}].map(W=>e.jsx("button",{onClick:()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();window.__GC_INV_TAB__={tab:W.id};_(W.id)},'
      'style:{padding:"7px 18px",border:"none",background:"none",borderBottom:H===W.id?`2px solid ${u.acc}`:"2px solid transparent",color:H===W.id?u.acc:u.tx2,fontWeight:H===W.id?700:400,')
B2n = ('(window._gcInvLink&&window._gcInvLink.tabs?window._gcInvLink.tabs(De.length,Ba,W=>(_shA||_shP.has(W.pid)),H):[{id:"client",l:`Client Invoices (${De.length})`},{id:"sub",l:`Sub Invoices (${z.length})`}])/* INVLINK-B2: Client · Sub · Supplier */.map(W=>e.jsx("button",{onClick:()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();window.__GC_INV_TAB__={tab:W.tab||W.id};if(W.sup){window._gcInvTab=W.sup;window._gcInvLink&&window._gcInvLink.retab&&window._gcInvLink.retab();}_(W.tab||W.id)},'
       'style:{padding:"7px 18px",border:"none",background:"none",borderBottom:(W.on!=null?W.on:H===W.id)?`2px solid ${u.acc}`:"2px solid transparent",color:(W.on!=null?W.on:H===W.id)?u.acc:u.tx2,fontWeight:(W.on!=null?W.on:H===W.id)?700:400,')
B3 = ('value:W.pid||"",onChange:K=>{const $e=K.target.value,ze=Wt.find(et=>et.id===$e);Oa(et=>et.map(ve=>ve.id===W.id?{...ve,pid:$e,po:(ze==null?void 0:ze.autoPO)||ve.po}:ve))},children:[e.jsx("option",{value:"",children:"Assign..."}),(window._gcJOPick?window._gcJOPick(Wt):Wt).map(')
B3n = ('value:W.pid||"",onChange:K=>{const $e=K.target.value,ze=Wt.find(et=>et.id===$e);Oa(et=>et.map(ve=>ve.id===W.id?{...ve,pid:$e,po:(ze==null?void 0:ze.autoPO)||ve.po}:ve))},children:[e.jsx("option",{value:"",children:"Assign..."}),(window._gcInvLink&&window._gcInvLink.pickJobs?window._gcInvLink.pickJobs(W,(window._gcJOPick?window._gcJOPick(Wt):Wt)):(window._gcJOPick?window._gcJOPick(Wt):Wt))/* INVLINK-B3: the guesses first */.map(')
PARTS.append(('/* INVLINK-B1:', [(B1, B1n)]))
PARTS.append(('/* INVLINK-B2:', [(B2, B2n)]))
PARTS.append(('/* INVLINK-B3:', [(B3, B3n)]))
# ── C. no link on the customer alone ──
C1 = '  if(top===1 && m.text.length>1) return null;\n'
C1n = '  if(top===1) return null;   /* INVLINK-C1: the customer\'s name alone is a suggestion, never a link (owner 11/19: A & B\'s invoices on its first job) */\n'
C2 = '    var p = jobFor(i.client || i.customer || i.name); if (!p) return i;\n'
C2n = ('    if (i.noAutoLink || i.pidManual) return i;   /* INVLINK-C2: a person\'s choice stays */\n'
       '    var p = (W._gcInvLink && W._gcInvLink.sureJob) ? W._gcInvLink.sureJob(i, projects, { invs: list }) : null; if (!p) return i;   /* INVLINK-C2: only a SURE job (QB project / PO / address), never "the customer\'s one job" */\n')
C3 = "var _hj=histJobFor(r.name);"
C3n = "var _hj=(window._gcInvLink&&window._gcInvLink.sureJob)?window._gcInvLink.sureJob(rec,projects()):null;/* INVLINK-C3: no job from the customer's name alone */"
PARTS.append(('/* INVLINK-C1:', [(C1, C1n)]))
PARTS.append(('/* INVLINK-C2:', [(C2, C2n)]))
PARTS.append(('/* INVLINK-C3:', [(C3, C3n)]))
# ── D. no automatic draw on a past job ──
D1 = '    if (p.status !== "active" || !p.contract) return;\n    // Use the SAME validated schedule'
D1n = '    if (p.status !== "active" || !p.contract) return;\n    if (' + past('p') + ') return;   /* INVLINK-D1: a past job is billed in QuickBooks only */\n    // Use the SAME validated schedule'
D2 = '  if(!_gcAdOn) return;   /* patch AUTOPANEL (+2)'
D2n = '  if(' + past('proj') + ') return;   /* INVLINK-D2: a past job is billed in QuickBooks only — the % is saved, no draw */\n' + D2
D3 = "  var p = A.proj(pid); if (!p || p.importedHistory || p.noAutomations"
D3n = "  var p = A.proj(pid); if (p && " + past('p') + ") return null;   /* INVLINK-D3: a past job is billed in QuickBooks only */\n" + D3
PARTS.append(('/* INVLINK-D1:', [(D1, D1n)]))
PARTS.append(('/* INVLINK-D2:', [(D2, D2n)]))
PARTS.append(('/* INVLINK-D3:', [(D3, D3n)]))

done = 0
for marker, edits in PARTS:
    if marker in src: continue
    for a, b in edits:
        n = src.count(a)
        assert n == 1, 'INVLINK anchor found %d times: %r' % (n, a[:90])
        src = src.replace(a, b)
    done += 1
if '__GC_PATCH_INVLINK__' not in src:
    src = src.rstrip('\n') + '\n' + BLOCK.rstrip('\n') + '\n'
    done += 1
if not done:
    print('already patched'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(src)
print('patch INVLINK: %d part(s) applied' % done)
