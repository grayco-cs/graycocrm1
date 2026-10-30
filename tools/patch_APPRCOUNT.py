#!/usr/bin/env python3
"""patch APPRCOUNT - the Approvals count drops the moment an approval is acted on; Deny needs no reason.

Owner 10/30: "im moving approvals and number isnt going down" and "let me deny without reason if i want to".

Why the number stayed:
  * Deny: the Approvals card's Deny refused without a reason ("Write why first"), so a Deny pressed straight away did
    nothing; and a deny that did go through only hid the card - the badge (the approval set) never left denied items
    out, so the sidebar kept counting them.
  * Approve & send: the card waited for the server's queue to be read again before it left the set (a slow / failed
    refresh kept it counted); an inline approval kept its card in "Waiting on me" for the 5-s undo window.
  * Assign: the card's Assign only opened the lead in the Leads hub - nothing on the Approvals page assigned it.
  * The count was memoized for 800 ms, so even a decided item was still in the next repaint.

This patch:
  * one rule for the count and the cards: an item acted on here is "gone" until its record changes (or 10 minutes),
    a denied item is left out of the set as well as the list - the badge, the To-Do pin, the header chips and the
    cards are the same N, and they repaint on the action (no new polling);
  * Deny denies on the click: the card leaves, the count drops, a 10-second toast offers "Why? (optional)",
    "Send back" (now) and "Undo"; the old "why?" box no longer requires a reason; no window.prompt;
    the expense card's / Expense Details' Reject no longer prompt;
  * Assign on an "Assign this lead" card opens the Leads hub's own assign picker right on the card (admins); picking
    a person assigns it (the hub's own assign()) and the card leaves at once; anyone else keeps the lead drawer.

Idempotent: a second run prints "already patched" and changes nothing. Every find-string must occur exactly once.

usage: python3 tools/patch_APPRCOUNT.py [path/to/index.html]
"""
import os, sys

P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
src = open(P, encoding='utf-8').read()
if 'patch APPRCOUNT' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, (n, old[:90])
    return s.replace(old, new)

BLOCK = r"""/* ── patch APPRCOUNT (owner 10/30: "im moving approvals and number isnt going down") ──────────────────────
   GONE: an item approved / sent / assigned here leaves the set and the list at once, until its record changes
   (then the record decides again) or 10 minutes pass. DPEND: a deny in its 10-second undo window. The set itself
   leaves out GONE, DPEND and denied items, so the badge, the pin, the header chips and the cards are one N. */
var GONE = {}, DPEND = {};
function bareKey(k){ return s(k).replace(/#\d+$/, ''); }
function gSig(key){
  var m;
  try {
    if ((m = /^ap2:(.+)$/.exec(key))) { var x = queue().filter(function(y){ return y && s(y.id) === m[1]; })[0]; return x ? s(x.status) + '|' + s(x.step) + '|' + arr(x.approvals).length : '-'; }
    if ((m = /^sub:(.+)$/.exec(key))) { var a = subs().filter(function(y){ return y && (s(y.id) === m[1] || s(y.invId) === m[1]); })[0]; return a ? s(a.status) + '|' + s(a.pmDecidedAt) : '-'; }
    if ((m = /^inv:(.+)$/.exec(key))) { var iv = arr(crm().invoices).filter(function(y){ return y && s(y.id) === m[1]; })[0]; return iv ? s(iv.status) : '-'; }
    if (/^td:hot1:asg:/.test(key)) return 'done';   /* assigned here: hidden for the 10 minutes even if a stale copy of the leads flickers back (the set's live check still drops it) */
  } catch (e) {}
  return '';
}
function asgOpen(){
  if (ASGC && Date.now() - ASGC.at < 300) return ASGC.v;
  var v = {}; try { arr(typeof W._gcLeadsToAssign === 'function' ? W._gcLeadsToAssign() : []).forEach(function(l){ if (l && l.id) v[s(l.id)] = 1; }); } catch (e) {}
  ASGC = { at: Date.now(), v: v }; return v;
}
var ASGC = null;
function isGone(k){
  k = bareKey(k); if (!k) return false;
  if (DPEND[k]) return true;
  var g = GONE[k]; if (!g) return false;
  if (Date.now() - g.at > 600000 || gSig(k) !== g.sig) { delete GONE[k]; return false; }
  return true;
}
function bump(){
  fresh();
  try { if (typeof W._gcApprovalSetFresh === 'function') W._gcApprovalSetFresh(); } catch (e) {}
  try { navBadge(); } catch (e) { warn(e); }
  paintSoon();
}
function goneNow(k){ k = bareKey(k); if (!k) return; ASGC = null; GONE[k] = { at: Date.now(), sig: gSig(k) }; bump(); }
var LBLC = { email: ['customer e-mail', 'customer e-mails'], subinv: ['sub invoice', 'sub invoices'], invsign: ['invoice to sign off', 'invoices to sign off'], expense: ['expense', 'expenses'], other: ['other approval', 'other approvals'] };
function trimSet(r){
  if (!r || !r.groups) return r;
  var c = denyTodos();
  var total = 0, parts = [];
  Object.keys(r.groups).forEach(function(g){
    r.groups[g] = arr(r.groups[g]).filter(function(x){ var k = bareKey(x && x.id), m = /^td:hot1:asg:(.+)$/.exec(k); if (m && typeof W._gcLeadsToAssign === 'function' && !asgOpen()[m[1]]) return false; return !(k && (c.open[k] || isGone(k))); });   /* an assigned lead never comes back from the To-Do's last snapshot */
    var n = r.groups[g].length; total += n; if (n && LBLC[g]) parts.push(n + ' ' + (n === 1 ? LBLC[g][0] : LBLC[g][1]));
  });
  r.total = total; r.tip = parts.join(' · ');
  return r;
}
function wrapSetCount(){
  var f = W._gcApprovalSet; if (typeof f !== 'function' || f.__gcAPC) return;
  var w = function(){ var r = f.apply(this, arguments); try { trimSet(r); } catch (e) { warn(e); } return r; };
  try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {}
  w.__gcAPC = true; W._gcApprovalSet = w;
  try { if (typeof W._gcApprovalSetFresh === 'function') W._gcApprovalSetFresh(); } catch (e) {}
}
/* Deny: on the click. The card leaves and the count drops now; the deny itself is written after 10 s (or at once with
   "Send back", Enter, or when the page closes). A reason is optional. */
function quickDeny(r){
  var k = bareKey(r.key); if (!k || DPEND[k]) return;
  DPEND[k] = { r: r, why: s(DREASON[r.key]), until: Date.now() + 10000 };
  delete DENYBOX[r.key];
  denyToast(k); bump();
  (function wait(){ later(function(){ var p = DPEND[k]; if (!p) return; if (Date.now() < p.until) return wait(); commitDeny(k); }, Math.max(200, (DPEND[k] ? DPEND[k].until : Date.now()) - Date.now())); })();
}
function commitDeny(k){
  var p = DPEND[k]; if (!p) return; delete DPEND[k];
  var t = D.querySelector('[data-apx-dk="' + cssq(k) + '"]'); var inp = t && t.querySelector('input'); if (inp) p.why = s(inp.value) || p.why;
  if (t) t.remove();
  DREASON[p.r.key] = p.why;
  try { doDeny(p.r); } catch (e) { warn(e); }
  bump();
}
function undoDeny(k){
  if (!DPEND[k]) return; delete DPEND[k];
  var t = D.querySelector('[data-apx-dk="' + cssq(k) + '"]'); if (t) t.remove();
  toast('↩ Undone — not denied.'); bump();
}
function denyHost(){
  var h = D.getElementById('apx-dtoasts'); if (h) return h;
  h = D.createElement('div'); h.id = 'apx-dtoasts'; h.setAttribute('data-gc-keep', '1');
  h.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:6px;align-items:center;max-width:94vw;font:14px Inter,Arial,sans-serif';
  D.body.appendChild(h); return h;
}
function denyToast(k){
  var p = DPEND[k]; if (!p) return;
  try {
    var t = D.createElement('div'); t.setAttribute('data-apx-dk', k);
    t.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#0f172a;color:#fff;padding:8px 10px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:94vw';
    var bs = 'border:0;border-radius:7px;padding:6px 10px;font:600 13px Inter,Arial,sans-serif;cursor:pointer';
    t.innerHTML = '<span>✕ Denied — ' + esc(s(p.r.title).slice(0, 60)) + '</span>'
      + '<input type="text" data-apx-dwhy="' + esc(k) + '" placeholder="Why? (optional)" style="flex:1;min-width:160px;padding:6px 8px;border-radius:7px;border:1px solid #475569;background:#1e293b;color:#fff;font:13px Inter,Arial,sans-serif">'
      + '<button type="button" data-apx-dsend="' + esc(k) + '" style="' + bs + ';background:#dc2626;color:#fff">Send back</button>'
      + '<button type="button" data-apx-dundo="' + esc(k) + '" style="' + bs + ';background:#e2e8f0;color:#0f172a">↩ Undo</button>';
    denyHost().appendChild(t);
  } catch (e) { warn(e); }
}
D.addEventListener('click', function(ev){
  var b = ev.target && ev.target.closest && ev.target.closest('[data-apx-dundo],[data-apx-dsend]'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  if (b.hasAttribute('data-apx-dundo')) undoDeny(b.getAttribute('data-apx-dundo')); else commitDeny(b.getAttribute('data-apx-dsend'));
}, true);
D.addEventListener('input', function(ev){ var t = ev.target; if (t && t.getAttribute && t.hasAttribute('data-apx-dwhy')) { var p = DPEND[t.getAttribute('data-apx-dwhy')]; if (p) { p.why = s(t.value); p.until = Date.now() + 10000; } } }, true);
D.addEventListener('keydown', function(ev){ var t = ev.target; if (ev.key === 'Enter' && t && t.getAttribute && t.hasAttribute('data-apx-dwhy')) { ev.preventDefault(); commitDeny(t.getAttribute('data-apx-dwhy')); } }, true);
W.addEventListener('pagehide', function(){ Object.keys(DPEND).forEach(function(k){ try { commitDeny(k); } catch (e) {} }); });
/* Assign on an "Assign this lead" card: the Leads hub's picker on the card (admins); the hub's assign() saves */
function canAssignHere(){ try { var h = W._gcLeadsHub; return !!(h && typeof h.picker === 'function' && typeof h.canAssign === 'function' && h.canAssign()); } catch (e) { return false; } }
function assignHere(r, el){
  var lid = bareKey(r.key).replace(/^td:hot1:asg:/, '');
  if (!canAssignHere()) { try { r.approve.f(); } catch (e) { warn(e); } return; }
  later(function(){ try { W._gcLeadsHub.picker([lid], el && el.isConnected ? el : null); } catch (e) { warn(e); try { r.approve.f(); } catch (x) {} } }, 0);
}
W.addEventListener('gc-lead-assigned', function(ev){ var d = ev && ev.detail; if (d && d.id) goneNow('td:hot1:asg:' + s(d.id)); });
W._gcApprCount = { state: function(){ return { gone: Object.keys(GONE), denying: Object.keys(DPEND) }; }, isGone: isGone, deny: function(key){ var r = rowByKey(s(key)); if (r) quickDeny(r); return !!r; } };
wrapSetCount();
function denyFilter(rows){"""

# 1. the set's memo can be cleared on an action (no 800-ms-old count after an approval)
src = once(src, "  function current(){ if (memo && Date.now() - memo.at < 800) return memo; memo = window._gcApprovalSet(); return memo; }",
                "  function current(){ if (memo && Date.now() - memo.at < 800) return memo; memo = window._gcApprovalSet(); return memo; }\n  window._gcApprovalSetFresh = function(){ memo = null; };   /* patch APPRCOUNT */")
# 2. Approvals tab: the block, and the list leaves out what the count leaves out
src = once(src, "function denyFilter(rows){", BLOCK)
src = once(src, "  return rows.filter(function(r){ return !(r && c.open[r.key.replace(/#\\d+$/, '')]); })",
                "  return rows.filter(function(r){ return !(r && (c.open[r.key.replace(/#\\d+$/, '')] || isGone(r.key))); })   /* patch APPRCOUNT */")
src = once(src, "    wrapMore(); refreshPay();", "    wrapMore(); refreshPay(); wrapSetCount(); if (force) { try { if (W._gcApprovalSetFresh) W._gcApprovalSetFresh(); } catch (e) {} }   /* patch APPRCOUNT: a forced repaint reads the set once, for the badge and the cards */")
# 3. Deny: no reason needed
src = once(src, "  if (!why) { toast('Write why first — the PM sees it.'); if (inp) try { inp.focus(); } catch (e) {} return; }\n",
                "  /* patch APPRCOUNT: a reason is optional */\n")
src = once(src, "label: '↩ Fix and resend: ' + title + ' — ' + why.slice(0, 160) + ' (from ' + me + ')'",
                "label: '↩ Fix and resend: ' + title + (why ? ' — ' + why.slice(0, 160) : '') + ' (from ' + me + ')'")
src = once(src, "body: why + ' — from ' + me", "body: (why || 'No reason given') + ' — from ' + me")
i = src.index("  if (r.approve && r.src !== 'pay' && r.src !== 'mat' && denyTo(r) !== null) h += b('deny'")
j = src.index('\n', i)
src = src[:i] + "  if (r.approve && r.src !== 'pay' && r.src !== 'mat' && denyTo(r) !== null) h += b('deny', { l: '✕ Deny', f: function(){ quickDeny(r); } }, 'dn');   /* patch APPRCOUNT: denies on the click (reason optional, 10-s undo) */" + src[j:]
# 4. the click hands the button to the action (the assign picker opens on it)
src = once(src, "if (f) { try { f(); } catch (e) { warn(e); } } if (/\\|approve$/", "if (f) { try { f(a); } catch (e) { warn(e); } } if (/\\|approve$/")
src = once(src, "  h += b('approve', r.approve ? {",
                "  if (r.approve && !r.approve.mode && /^td:hot1:asg:/.test(r.key) && canAssignHere()) { var r0 = r; r = Object.assign({}, r, { approve: { l: r.approve.l, f: function(el){ assignHere(r0, el); } } }); }   /* patch APPRCOUNT */\n  h += b('approve', r.approve ? {")
# 5. approved / sent: gone at once
src = once(src, "delete busy[id]; j = j || {};", "delete busy[id]; j = j || {}; if (j.ok) goneNow('ap2:' + id);   /* patch APPRCOUNT */")
src = once(src, "  DONE[r.key] = { r: r, ok: ok, at: Date.now() };", "  DONE[r.key] = { r: r, ok: ok, at: Date.now() };\n  if (ok) goneNow(r.key);   /* patch APPRCOUNT */")
src = once(src, "  var me = rows.filter(function(r){ return r.mine; }).length;", "  var me = rows.filter(function(r){ return r.mine && !PEND[r.key]; }).length;   /* patch APPRCOUNT: the same N as the badge */")
# 6. Leads hub: every assignment says so; the picker is reachable from Approvals
src = once(src, "if (W._gcLeadHold) W._gcLeadHold.picked(id, name); }",
                "if (W._gcLeadHold) W._gcLeadHold.picked(id, name); try { W.dispatchEvent(new CustomEvent('gc-lead-assigned', { detail: { id: id, to: name } })); } catch (e) {} }   /* patch APPRCOUNT */")
src = once(src, "isBid: isBidL, filtered: function(){", "isBid: isBidL, picker: openPicker, canAssign: canAssignAll, filtered: function(){")
# 7. the expense card's / Expense Details' Reject: no prompt
src = once(src, "var _rn=prompt('Why are you denying this expense? (goes back to the PM)',''); if(_rn===null) return;", "var _rn='';   /* patch APPRCOUNT: no reason needed */")
src = once(src, "var note=prompt('Reason for rejecting (optional):','')||'';", "var note='';   /* patch APPRCOUNT */")

open(P, 'w', encoding='utf-8').write(src)
print('patched')
