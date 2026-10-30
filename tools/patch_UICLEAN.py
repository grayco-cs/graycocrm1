#!/usr/bin/env python3
"""Idempotent patch UICLEAN (owner 10/29): "the duplicates button is on every page — take it out", and the expense
buttons (Enter expenses / Expense inbox / Jobs with no expenses) do not belong on To-Do.
• 🧹 Duplicates is no longer put on any page; it stays in Admin → 🧹 Duplicates.
• The three expense buttons leave To-Do; they stay on a job's Expenses tab (and _gcExpEntry / _gcExpInbox /
  _gcNoExpenseJobs still open them)."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch UICLEAN'
if MARK in t: print('UICLEAN: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('UICLEAN anchor', n, old[:80]); t = t.replace(old, new)
once("""function mountApx(){
  if (!isAdminish()) return;""",
"""function mountApx(){
  """ + MARK + """: no Duplicates button on the pages — Admin → 🧹 Duplicates only */
  Array.prototype.forEach.call(D.querySelectorAll('[data-gcdd-btn]'), function(x){ x.remove(); }); return;
  if (!isAdminish()) return;""")
once("""  if (!mount || !canEnter() || isMM()) { if (host) host.remove(); return; }
  if (!host) {
    host = D.createElement('div'); host.id = 'gc-exp2-todo';""",
"""  if (true) { if (host) host.remove(); return; }   """ + MARK + """: the expense buttons are not on To-Do */
  if (!host) {
    host = D.createElement('div'); host.id = 'gc-exp2-todo';""")
open(p, 'w', encoding='utf-8').write(t); print('UICLEAN: patched', p)
