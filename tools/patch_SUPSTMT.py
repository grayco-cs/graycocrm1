#!/usr/bin/env python3
"""Idempotent patch SUPSTMT (owner 11/23: "theres no way to track paying the main invoices from suppliers when they send us a large
one day payment statement, we need to pay the statement at once but it also has the jobs we are paying ... it needs to read the memo
address po etc and match to correct jobs, it needs to mark off when we pay a statement what jobs are paid if they are on the right
project if they havnt been paid etc").

Adds tools/supstmt_tail.js as <script id="gc-patch-supplierstmt"> after the last patch: 🧾 Supplier statement on Accounting's tool
row (next to the card / bank statement imports) and on the Invoices pages' 💵 row -- enter a supplier's statement (PDF read by patch
STMTPDF's reader, a photo / scan read by patch BULKDROP's reader, a CSV, or typed / pasted lines), every line matched to its CRM bill
(invoice #, then amount + date) and to its job (PO, ship-to address, an earlier pick, memo / customer -- patch QBCSV's matcher --,
then the bill's job), statuses (matched / already paid / wrong project? / no job / not in the CRM / credit / finance charge), a
person's picks kept for good, and ONE payment for the whole statement (patch LUMPSUM's save: each bill paid, its cost row, the
register), with bills made for lines not in the CRM, credits on their jobs, and "Paid on <Supplier> statement" on the job's lines.

Two small changes to existing patches (each anchor must occur exactly once):
  * patch BULKDROP: window._gcBulkDrop.aiAsk(content, maxTokens) -- the same reader (function, model, proxy) for a statement photo.
  * patch LUMPSUM: its "who may" also lets the accounting roles in (window._gcAcctRole, by role), so they can pay a statement.
Usage: python3 tools/patch_SUPSTMT.py [index.html]"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_SUPSTMT__'
if MARK in src:
    print('SUPSTMT: already patched'); sys.exit(0)
JS = open(os.path.join(here, 'supstmt_tail.js'), encoding='utf-8').read()
assert JS.startswith('/*' + MARK)
assert JS.count(MARK) == 1, 'the mark only in the opening comment'
assert '</script' not in JS.lower()


def once(s, old, new):
    assert s.count(old) == 1, ('SUPSTMT anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


# 1. patch BULKDROP: the photo reader for other patches
A = "function aiCall(content){"
src = once(src, A, "/* patch SUPSTMT: the same reader for a supplier statement's photo (a longer answer: many lines) */\n"
           "function aiAsk(content, max){\n"
           "  var ctl = null; try { ctl = new AbortController(); } catch (e) {}\n"
           "  var t = ctl ? later(function(){ try { ctl.abort(); } catch (e) {} }, 90000) : null;\n"
           "  return W.fetch(FN_AI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl ? ctl.signal : undefined,\n"
           "    body: JSON.stringify({ model: AI_MODEL, max_tokens: Math.max(AI_MAX, Math.min(8000, +max || AI_MAX)), messages: [{ role: 'user', content: content }] }) })\n"
           "    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return { status: r.status, d: d }; }); })\n"
           "    .then(function(x){ if (t) clearTimeout(t); return x; }, function(e){ if (t) clearTimeout(t); throw e; });\n"
           "}\n" + A)
B = "W._gcBulkDrop = { open: open, close: close, add: add, run: run, summary: summary,"
src = once(src, B, "W._gcBulkDrop = { aiAsk: aiAsk, open: open, close: close, add: add, run: run, summary: summary,")

# 2. patch LUMPSUM: accounting roles may pay (by role)
C = """/* ═════════════ who may ═════════════ */
function canUse(){
  try { if (typeof W._gcFullAccess === 'function') return !!W._gcFullAccess(); } catch (e) {}"""
src = once(src, C, """/* ═════════════ who may ═════════════ */
function canUse(){
  try { if (typeof W._gcAcctRole === 'function' && W._gcAcctRole()) return true; } catch (e) {}   /* patch SUPSTMT: accounting roles (by role) */
  try { if (typeof W._gcFullAccess === 'function') return !!W._gcFullAccess(); } catch (e) {}""")

# 3. the new block, after the last patch
E = """  pull: function(){ try { if (navigator.onLine !== false && typeof W._gcPullNow === 'function') Promise.resolve(W._gcPullNow()).catch(function(){}); } catch (e) {} } };
})(window);
</script>
"""
src = once(src, E, E + '<script id="gc-patch-supplierstmt">' + JS.rstrip('\n') + '\n</script>\n')
open(path, 'w', encoding='utf-8').write(src)
print('SUPSTMT: patched', path)
