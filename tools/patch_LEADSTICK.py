#!/usr/bin/env python3
"""Idempotent patch LEADSTICK: a change made on Leads (stage, assign, priority, Contacted, Won / Lost, bid due...) shows at
once and sticks (owner 10/27: "Assigned to Wesley Johnson" toast but the panel still says "— Unassigned —"; "Moved to
Estimate Sent" but the stage still says New Lead; Priority 1–10 and ✕ Lost do nothing).

Cause: the Leads hub drew from window._crm.leads whenever that copy had MORE leads than the live list. window._crm.leads is
a one-time copy left by the CompanyCam / QuickBooks lead movers (LCC_ / LQB_ leads); once any lead leaves the live list
(deleted, merged, archived) that old copy is longer for good, so every panel and row was drawn from it: the save went
through, the screen kept showing the old values (and the panel acted on the old record).
Now:
  * the hub draws from the live list (this computer's saved copy / the CRM's own list) whenever it has leads; a lead only
    in the old copy is still listed after them (nothing disappears);
  * a change to a lead that is not in the live list (only in the old copy) is saved onto the live list instead of being
    dropped ("Could not save");
  * window._crm.leads gets the changed lead too, so every other screen reading it sees the new values.
Usage: python3 tools/patch_LEADSTICK.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch LEADSTICK'
if MARK in src:
    print('LEADSTICK: already patched'); sys.exit(0)
E = [
("""function rawLeads(){ if (view() === 'leads') pullLeads(); var c = arr(crm().leads); return LEADS_NOW && (LEADS_NOW.length >= c.length || !c.length) ? LEADS_NOW : c; }""",
 """function rawLeads(){ if (view() === 'leads') pullLeads(); var c = arr(crm().leads); if (LEADS_NOW && LEADS_NOW.length) return stickMerge(LEADS_NOW, c); return LEADS_NOW && !c.length ? LEADS_NOW : c; }
""" + MARK + """: the live list wins; a lead only in window._crm.leads (an old one-time copy) is listed after it */
var STK = { a: null, b: null, v: null };
function stickMerge(live, old){
  if (!old.length || old === live) return live;
  if (STK.a === live && STK.b === old) return STK.v;
  var have = {}; live.forEach(function(l){ if (l && l.id != null) have[s(l.id)] = 1; });
  var extra = old.filter(function(l){ return l && l.id != null && !have[s(l.id)]; });
  STK = { a: live, b: old, v: extra.length ? live.concat(extra) : live };
  return STK.v;
}"""),
("""    var i = -1; list.forEach(function(l, k){ if (l && l.id === id) i = k; }); if (i < 0) return null;
    var l = Object.assign({}, list[i]); if (fn2(l) === false) return null; l.updatedAt = nowIso(); list[i] = l; LEADS_NOW = list; LEADS_SIG = ''; return list;""",
 """    var i = -1; list.forEach(function(l, k){ if (l && l.id === id) i = k; });
    if (i < 0) { var shown = rawLeads().filter(function(x){ return x && x.id === id; })[0]; if (!shown) return null; list.push(shown); i = list.length - 1; }   /* patch LEADSTICK: a lead on screen but not in the live list is saved onto it */
    var l = Object.assign({}, list[i]); if (fn2(l) === false) return null; l.updatedAt = nowIso(); list[i] = l; LEADS_NOW = list; LEADS_SIG = '';
    try { var cl = W._crm && W._crm.leads; if (Array.isArray(cl)) W._crm.leads = cl.map(function(x){ return x && x.id === id ? l : x; }); } catch (e) {}   /* patch LEADSTICK */
    return list;"""),
]
for a, b in E:
    assert src.count(a) == 1, ('LEADSTICK find-string count != 1', src.count(a), a[:80])
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('LEADSTICK: patched', path)
