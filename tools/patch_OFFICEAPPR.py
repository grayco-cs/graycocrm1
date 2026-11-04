#!/usr/bin/env python3
"""Idempotent patch OFFICEAPPR (owner Wesley, 11/04): "brittany has some approvals that i already approved and they shouldnt
show if i approve and she cant open it either from approvals, why isnt her stuff working".

1. STALE — what an admin decided stays decided on every computer:
   * gc_payroll_approvals (Form 941, PM pay checks) merges by id, newest updatedAt first. Opening a WAITING Form 941 card
     re-saved its numbers with a NEW updatedAt, so a computer that had not pulled the owner's approval yet (the office's)
     made its old "waiting" copy the newest one and pushed it back over "approved" (the union kept it, on every computer).
     Now (a) the numbers refresh on opening no longer re-stamps the record, and (b) the merge of gc_payroll_approvals never
     lets a record go back: filed > approved > waiting, whatever the stamps say.
   * An approved Form 941 is no longer an approval for the admins (they are done); the office — who files it — keeps ONE
     line "📮 File Form 941 … approved, ready to file (by …): mark it filed" until it is filed (filing is not an approval
     the owner gives, and the card is her only way to it: she has no Form 941 worksheet tab).
   * PM pay flags: a "✓ Checked" made on another computer cleared the flag only at this computer's next full PM pay
     re-check (up to a minute, more while the page is busy) — and only when this computer worked out the very same amounts.
     The ✅ list now drops a flag the moment the check record is here; on a non-admin computer (the office's) any admin /
     office check of that flag clears it (an admin's figures are made from the full pay records).
2. CAN'T OPEN — the Desk (the office's home: Approvals card → "Review") and the Field home opened an item only when its
   action was a plain function; Form 941 / PM pay / To-Do approvals carry { l, f }, so "Review" just went back to the
   approvals list. Both now run act.f (and the Desk steps aside when the action moves to another screen).
   Nothing new is opened to the office: payroll runs stay admin-only (office-kinds.js: payroll is ADMIN-ONLY, rowPay /
   the payroll alert are admin-only) and are not listed for her; Form 941 and PM pay are listed only where they open
   (_gcF941CanFile / payroll canSee, the same tests the cards use).
Also patches the tools/f941_tail.js, tools/pmpaycheck_tail.js and tools/roleapps.js copies.
Usage: python3 tools/patch_OFFICEAPPR.py [index.html]
"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
TOOLS = os.path.join(os.path.dirname(os.path.abspath(path)), 'tools')
MARK = '/* patch OFFICEAPPR'

def patch(fn, reps, required=True):
    if not os.path.exists(fn):
        if required: raise SystemExit('OFFICEAPPR: missing ' + fn)
        return
    src = open(fn, encoding='utf-8').read()
    if MARK in src:
        print('OFFICEAPPR: already patched', fn); return
    for old, new in reps:
        c = src.count(old)
        assert c == 1, ('OFFICEAPPR find-string count', fn, c, old[:120])
        src = src.replace(old, new)
    assert MARK in src
    open(fn, 'w', encoding='utf-8').write(src)
    print('OFFICEAPPR: patched', fn, '(' + str(len(reps)) + ' changes)')

# ── 1a. the merge: a gc_payroll_approvals record never goes back (filed > approved > waiting) ──
MERGE = [
("""function mergeRecords(key, local, inc){""",
 MARK + """: a payroll approval (Form 941) never goes back — filed > approved > waiting, whatever the stamps say */
function payApRank(r){ var st = String(r && r.status || '').toLowerCase(); return st === 'filed' ? 3 : st === 'approved' ? 2 : st === 'waiting' ? 1 : 0; }
function mergeRecords(key, local, inc){"""),
("""    var mine = out[at[id]], a = tsOf(r), b = tsOf(mine);
    if(a && b && a > b) out[at[id]] = r;                       /* strictly newer elsewhere */""",
 """    var mine = out[at[id]], a = tsOf(r), b = tsOf(mine);
    if(key === 'gc_payroll_approvals'){ var ra = payApRank(r), rb = payApRank(mine); if(ra && rb && ra !== rb){ if(ra > rb) out[at[id]] = r; return; } }   /* patch OFFICEAPPR */
    if(a && b && a > b) out[at[id]] = r;                       /* strictly newer elsewhere */"""),
]

# ── 1b. Form 941: opening a waiting card does not re-stamp it; approved = the office's "file it" line only ──
F941 = [
("""async function setRec(id, patch){
  var list=readA(), r=list.filter(function(x){ return x.id===id; })[0]; if(!r) return null;
  Object.assign(r, patch, { updatedAt:new Date().toISOString(), at:new Date().toISOString() }); writeA(list); return r;""",
 """async function setRec(id, patch, quiet){
  var list=readA(), r=list.filter(function(x){ return x.id===id; })[0]; if(!r) return null;
  """ + MARK + """: quiet = the numbers shown on opening: not a decision, so no new stamp (a stale "waiting" copy must never become the newest) */
  Object.assign(r, patch, quiet ? {} : { updatedAt:new Date().toISOString(), at:new Date().toISOString() }); writeA(list); return r;"""),
("""if(rec.status==='waiting'){ rec=await setRec(id, { numbers:snap(R) }) || rec; }""",
 """if(rec.status==='waiting'){ rec=await setRec(id, { numbers:snap(R) }, true) || rec; }   /* patch OFFICEAPPR */"""),
("""return readA().filter(function(x){ return x.kind==='f941' && (x.status==='waiting' || x.status==='approved'); }).map(function(x){""",
 """/* patch OFFICEAPPR: approved = the admins are done; the office (who files) keeps one "file it" line until it is filed */
  return readA().filter(function(x){ return x.kind==='f941' && (x.status==='waiting' || (x.status==='approved' && !canSee())); }).map(function(x){"""),
("""('🧾 Form 941 for Q'+x.q+' '+x.year+': approved, ready to file — mark it filed'),""",
 """('📮 File Form 941 for Q'+x.q+' '+x.year+': approved, ready to file'+(x.approvedBy?(' (by '+s(x.approvedBy)+')'):'')+' — mark it filed'),"""),
]

# ── 1c. PM pay: a check that has arrived clears the flag at once ──
PMPAY = [
("""  if(!canSee() || !LAST) return [];
  return LAST.alerts.map(function(f){""",
 """  if(!canSee() || !LAST) return [];
  """ + MARK + """: a "✓ Checked" synced from another computer clears the flag now (not at the next re-check); on a non-admin
     computer any check of that flag does (the admin's figures come from the full pay records) */
  var chk = readA(), adm = false; try{ adm = !!(P() && P().isAdmin && P().isAdmin()); }catch(e){}
  return LAST.alerts.filter(function(f){ var c = checkFor(chk, f.id); return !(c && (c.sig === f.sig || !adm)); }).map(function(f){"""),
]

# ── 2. Desk "Review" and the Field home: run the item's { l, f } action ──
DESK = [
("""case 'approne': var x = apprItems().filter(function(y){ return y.id === id; })[0]; if (x && typeof x.act === 'function') { try { x.act(); return; } catch (e) {} } openApprovals(); return;""",
 """case 'approne': var x = apprItems().filter(function(y){ return y.id === id; })[0];
      """ + MARK + """: the item's own action ({ l, f } on Form 941 / PM pay / To-Do approvals); the Desk steps aside when it changes screen */
      var xf = x && (typeof x.act === 'function' ? x.act : (x.act && typeof x.act.f === 'function' ? x.act.f : null));
      if (xf) { var v0 = ''; try { v0 = localStorage.getItem('grayco_view') || ''; } catch (e) {} try { xf.call(x.act); later(function(){ var v1 = ''; try { v1 = localStorage.getItem('grayco_view') || ''; } catch (e) {} if (v1 !== v0) deskHide(); }, 400); return; } catch (e) { warn(e); } }
      openApprovals(); return;"""),
]
FIELD = [
("""  if (typeof x.act === 'function') { try { x.act(); return; } catch (e) {} }
  (KIND_OPEN[x.g] || openAllAppr)();""",
 """  if (typeof x.act === 'function') { try { x.act(); return; } catch (e) {} }
  if (x.act && typeof x.act.f === 'function') { try { x.act.f(); return; } catch (e) {} }   """ + MARK + """: { l, f } actions (Form 941, PM pay, To-Do) */
  (KIND_OPEN[x.g] || openAllAppr)();"""),
]

src = open(path, encoding='utf-8').read()
if MARK in src:
    print('OFFICEAPPR: already patched', path)
else:
    patch(path, MERGE + F941 + PMPAY + DESK + FIELD)
patch(os.path.join(TOOLS, 'f941_tail.js'), F941, required=False)
patch(os.path.join(TOOLS, 'pmpaycheck_tail.js'), PMPAY, required=False)
patch(os.path.join(TOOLS, 'roleapps.js'), DESK, required=False)
