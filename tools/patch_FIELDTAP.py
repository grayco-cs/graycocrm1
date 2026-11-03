#!/usr/bin/env python3
"""Idempotent patch FIELDTAP (owner 11/03, a screenshot of the GrayCo Field home, ALL JOBS): "need to be able to click
the whole button to click the job; right now it's just the bold letters. Remember this is a phone: small buttons, big
fingers."

  1. GrayCo Field's job cards (.fh-job: the Field home's job sections and ROLEAPPS' ALL JOBS list): a tap anywhere on
     the card opens the job (title, sub-line, progress, padding, empty space). Its own buttons keep their own action:
     👤 Customer portal · 🔧 Sub portal · 📸 Photos · 💬 Message (FIELDPORTAL's .fp-row), the tool buttons, links —
     a tap on them or in the gaps between them never opens the job. The card gets cursor:pointer and a pressed state.
  2. To-Do (Field, #_gcTD2Ov): a tap anywhere on a to-do row opens it (only the title did); its checkbox, ⋯, the
     action button and the sub-task toggle keep their own action. Rows are at least 44 px tall in Field.
  Already whole-row (checked, unchanged): Find a job / Jobs list rows (._jpItem buttons, 90 px), the Field Documents
  rows (.gcfp-doc buttons / links, 52 px).
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '__GC_PATCH_FIELDTAP__'
if MARK in t:
    print('FIELDTAP: already patched'); sys.exit(0)


def rep(t, old, new, n=1):
    c = t.count(old)
    assert c == n, ('FIELDTAP anchor found %d times (want %d): %r' % (c, n, old[:120]))
    return t.replace(old, new)


# ── 1. GrayCo Field (patch FIELD): the whole job card ────────────────────────────────────────────────────────────
t = rep(t, """function onClick(ev){
  var t = ev.target.closest('[data-fa]'); if (!t) return;
  var a = t.getAttribute('data-fa'), pid = t.getAttribute('data-pid'), p = pid ? proj(pid) : null;""",
"""/* __GC_PATCH_FIELDTAP__ (owner 11/03): "click the whole button to click the job … small buttons, big fingers" — a tap
   anywhere on a job card opens the job, except on its own buttons / links (and the gaps between them) */
var CARD_SKIP = 'a,button,input,select,textarea,label,.fp-row,.fh-g3,.fh-g4,.fh-lock';
function cardTap(el){ if (!el || !el.closest || el.closest(CARD_SKIP)) return null; var c = el.closest('.fh-job[data-job]'); return c ? c.querySelector('[data-fa="open"]') : null; }
function pressWire(ov){
  var on = null, clr = function(){ if (on) { on.classList.remove('fh-press'); on = null; } };
  ov.addEventListener('pointerdown', function(e){ clr(); if (cardTap(e.target)) { on = e.target.closest('.fh-job'); on.classList.add('fh-press'); } });
  ['pointerup', 'pointercancel'].forEach(function(n){ ov.addEventListener(n, function(){ later(clr, 140); }); });
  ov.addEventListener('scroll', clr, true);
}
function onClick(ev){
  var t = ev.target.closest('[data-fa]'); if (!t) t = cardTap(ev.target); if (!t) return;   /* patch FIELDTAP */
  var a = t.getAttribute('data-fa'), pid = t.getAttribute('data-pid'), p = pid ? proj(pid) : null;""")
t = rep(t, """  var ov = D.createElement('div'); ov.id = '_gcJobPick'; ov.className = 'gc-fh'; D.body.appendChild(ov);
  ov.addEventListener('click', onClick);
""", """  var ov = D.createElement('div'); ov.id = '_gcJobPick'; ov.className = 'gc-fh'; D.body.appendChild(ov);
  ov.addEventListener('click', onClick); pressWire(ov);   /* patch FIELDTAP */
""")
t = rep(t, """    '.gc-fh .fh-job{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin-bottom:12px}',
""", """    '.gc-fh .fh-job{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin-bottom:12px}',
    '.gc-fh .fh-job[data-job]{cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s,border-color .12s;min-height:44px;box-sizing:border-box}.gc-fh .fh-job.fh-press{background:#f1f5f9;border-color:#94a3b8}.gc-fh .fh-job .fp-row,.gc-fh .fh-job .fh-g3,.gc-fh .fh-job .fh-g4{cursor:default}',   /* patch FIELDTAP */
""")

# ── 2. To-Do (patch TD2) in Field: the whole row ─────────────────────────────────────────────────────────────────
t = rep(t, """  function clickH(e){
    var b = e.target.closest('[data-td2]'); if (!b || !root.contains(b)) return;""",
"""  function clickH(e){
    var b = e.target.closest('[data-td2]'); if (!b && isField()) b = rowTap(e.target, root);   /* patch FIELDTAP */
    if (!b || !root.contains(b)) return;""")
t = rep(t, """function wire(root){
  root.addEventListener('click', function(e){""",
"""/* patch FIELDTAP: in Field a tap anywhere on a to-do row opens it (its checkbox / buttons keep their own action) */
function rowTap(el, root){ if (!el || !el.closest || el.closest('a,button,input,select,textarea,label')) return null; var r = el.closest('.td2-row[data-k]'); return r && root.contains(r) ? r.querySelector('[data-td2="open"]') : null; }
function wire(root){
  root.addEventListener('click', function(e){""")
t = rep(t, """ + '.td2-row{display:flex;align-items:center;gap:8px;min-height:42px;""",
""" + '#_gcTD2Ov .td2-row[data-k]{min-height:44px;cursor:pointer;-webkit-tap-highlight-color:transparent}#_gcTD2Ov .td2-row[data-k]:active{background:#f1f5f9}'   /* patch FIELDTAP */
 + '.td2-row{display:flex;align-items:center;gap:8px;min-height:42px;""")

open(p, 'w', encoding='utf-8').write(t)
print('FIELDTAP: patched')
