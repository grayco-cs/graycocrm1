#!/usr/bin/env python3
"""Idempotent patch MKTFIX8 (Marketing audit — the week plan, the first screen the Marketing Manager uses):
"✅ Approve the week" for him says what it will really do.

At stage 1 (the start setting) an admin approves every week, so his "✅ Approve the week" could only end in
"Sent to ✅ Approvals — This one needs an admin." Now, for him:
  • a week waiting at stage 1: no button — "⏳ Waiting for an admin on ✅ Approvals";
  • a draft / sent-back week: "📤 Send the week for approval";
  • stage 2 or 3: "✅ Approve the week" as before (the server still sends flagged weeks to an admin).
Admins and the office see no change.

    python3 tools/patch_MKTFIX8.py [index.html]
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = 'patch MKTFIX8'
if MARK in t:
    print('MKTFIX8: already patched'); sys.exit(0)
old = """(!allOk && office() ? '<button class="gmt-btn g" data-a="soc-approve-week" data-id="' + esc(w.id) + '"' + (STATE.busy === 'week' ? ' disabled' : '') + '>✅ Approve the week</button>'"""
new = """(!allOk && office() ? (W._gcMMData && +((STATE.st || {}).stage || 1) < 2 && w.status === 'waiting' ? '<span class="gmt-muted">⏳ Waiting for an admin on ✅ Approvals (stage 1)</span>' : '<button class="gmt-btn g" data-a="soc-approve-week" data-id="' + esc(w.id) + '"' + (STATE.busy === 'week' ? ' disabled' : '') + '>' + (W._gcMMData && +((STATE.st || {}).stage || 1) < 2 ? '📤 Send the week for approval' : '✅ Approve the week') + '</button>')   /* patch MKTFIX8 */"""
assert t.count(old) == 1, t.count(old)
t = t.replace(old, new)
old2 = """'Sent to ✅ Approvals' + (r && r.error ? ' — ' + r.error : '') + '.'"""
new2 = """'Sent to ✅ Approvals' + (r && r.error ? ' — ' + String(r.error).replace(/[.\\s]+$/, '') : '') + '.'"""
assert t.count(old2) == 1, t.count(old2)
t = t.replace(old2, new2)
open(p, 'w', encoding='utf-8').write(t)
print('MKTFIX8: patched')
