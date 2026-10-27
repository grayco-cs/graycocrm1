#!/usr/bin/env python3
"""Idempotent patch TODONOAPPR: approvals live only on the Approvals tab, not on the To-Do (owner 10/27: "if approvals
are on approvals they don't need to be on the todo right? clouds up my todo").

Display / count only; no data is changed or deleted:
  * To-Do (tab, Office To-Do, Office page, field To-Do): the pinned "Approvals waiting on you (N)" box with its rows
    and AP2's green customer e-mail cards are replaced by ONE compact line "✅ N approvals waiting → Open Approvals"
    (opens the Approvals tab; N = the Approvals tab's own badge number).
  * No approval rows in the To-Do lists (every To-Do line about an approval is filed under cat 'appr', including
    "waiting on others" approvals); the "Needs approval" chip is gone; Overdue / Due today / This week / Waiting count
    the real to-dos only.
  * The left-menu To-Do badge counts to-dos only (it was to-dos + approvals); Approvals keeps its own badge.
  * The Approvals tab, the green APPROVE panel and Office Status keep every approval as before.
Cheaper too: with ~100 approvals the To-Do drew the pin rows and up to 20 e-mail cards (6,600 px before the first
to-do) on every open."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch TODONOAPPR'
if MARK in t: print('TODONOAPPR: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('TODONOAPPR anchor count != 1', n, old[:90])
    t = t.replace(old, new)

# 1. td2: paint from a view of the state without approval lines (counts redone from what is shown)
once("""var painting = false;
function paint(force){
  if (painting) return; painting = true;
  try {
    var hs = hosts(); if (!hs.length) return;
    if (force) dirty = true;
    var st = state();""",
"""""" + MARK + """: the To-Do shows no approvals (they are on the Approvals tab); a view of the state, the data untouched */
var NAV = null;
function noAppr(st){
  if (!st || !Array.isArray(st.items)) return st;
  if (NAV && NAV.src === st) return NAV.v;
  function keep(x){ return !(x && x.cat === 'appr'); }
  var v = Object.assign({}, st); v.items = st.items.filter(keep);
  if (Array.isArray(st.all)) v.all = st.all.filter(keep);
  if (Array.isArray(st.snoozed)) v.snoozed = st.snoozed.filter(keep);
  var c = Object.assign({}, st.counts || {}); c.over = c.today = c.week = c.wait = c.total = c.mine = 0;
  v.items.forEach(function(g){ if (g.waiting) { c.wait++; return; } c.total++; if (g.dueCls === 'over') c.over++; else if (g.dueCls === 'today') c.today++; else if (g.dueCls === 'week') c.week++; if (g.mine) c.mine++; });
  c.apprRows = 0; c.todos = c.total; c.now = c.over + c.today; v.counts = c;
  NAV = { src: st, v: v }; return v;
}
var painting = false;
function paint(force){
  if (painting) return; painting = true;
  try {
    var hs = hosts(); if (!hs.length) return;
    if (force) dirty = true;
    var st = noAppr(state());   /* patch TODONOAPPR */""")
once("""  return chip('appr', 'Needs approval', c.appr, 'g') + chip('over', 'Overdue', c.over, 'r')""",
     """  return /* patch TODONOAPPR: no "Needs approval" chip */ chip('over', 'Overdue', c.over, 'r')""")
# 2. APX: the pin becomes one compact line; AP2's cards are not in the To-Do
once("""    var sec = root.querySelector(':scope > ._gcAp2Sec');
    var saved = ACTS; ACTS = {};
    var P = pinHtml(!sec);""",
"""    var sec = root.querySelector(':scope > ._gcAp2Sec');
    if (sec) { sec.remove(); sec = null; }   /* patch TODONOAPPR: the customer e-mail cards are on the Approvals tab */
    var saved = ACTS; ACTS = {};
    var P = pinLine();""")
once("""function ACTS_PIN_RESET(){ PIN_ACTS = {}; }""",
"""function ACTS_PIN_RESET(){ PIN_ACTS = {}; }
/* patch TODONOAPPR: the To-Do's one line — the same N as the Approvals badge */
function pinLine(){
  var n = 0; try { n = typeof W._gcApprovalCount === 'function' ? W._gcApprovalCount() : ((theSet() || {}).total || 0); } catch (e) {}
  n = Math.max(0, (+n || 0) - pendCount());
  return { n: n, h: '<button type="button" class="apx-pin-1" data-apx-go="1">' + (n ? '✅ ' + n + ' approval' + (n === 1 ? '' : 's') + ' waiting → <u>Open Approvals</u>' : '✅ No approvals waiting · <u>Approvals tab</u>') + '</button>' };
}""")
once("""  + '.apx-pin-n{font-size:13px;font-weight:700;color:#166534;margin:2px 0 0}'""",
"""  + '.apx-pin-n{font-size:13px;font-weight:700;color:#166534;margin:2px 0 0}'
  + '.td2 > .apx-pin{padding:0;border:0;background:none;margin:0 0 8px}.apx-pin-1{display:block;width:100%;text-align:left;border:1px solid #86efac;background:#f0fdf4;color:#14532d;border-radius:10px;padding:8px 12px;font:700 14px Inter,-apple-system,Arial,sans-serif;cursor:pointer}.apx-pin-1:hover{background:#dcfce7}.td2 > .apx-pin.empty .apx-pin-1{border-color:#bbf7d0;color:#166534;font-weight:600;font-size:13px}'   /* patch TODONOAPPR */""")
once("""    hostTodoTab(); hostOfficeTodo(); hostOfficeStatus(); hostGreen(); green();""",
     """    /* patch TODONOAPPR: not in the To-Do tab / Office To-Do (the Approvals tab has them) */ hostOfficeStatus(); hostGreen(); green();""")

# 3. the To-Do menu badge: to-dos only
once("""  return { n: todos + appr, todos: todos, appr: appr };""",
     """  return { n: todos, todos: todos, appr: appr };   /* patch TODONOAPPR: approvals have their own badge */""")
once("""    var tt = k.todos + ' to-do' + (k.todos === 1 ? '' : 's') + ' · ' + k.appr + ' approval' + (k.appr === 1 ? '' : 's');""",
     """    var tt = k.todos + ' to-do' + (k.todos === 1 ? '' : 's');   /* patch TODONOAPPR */""")
open(p, 'w', encoding='utf-8').write(t); print('TODONOAPPR: patched')
