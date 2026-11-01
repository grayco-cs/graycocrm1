#!/usr/bin/env python3
"""Idempotent patch CUSTQUIET: customer quiet hours, 7 PM - 7 AM Central, in the CRM.

Owner (Wesley): "I do work after 9pm and approvals etc all the time never post to portal or send texts anything after
7pm -7am".

Staff keep working and approving at night; nothing goes OUT to customers or subs 7:00 PM - 7:00 AM Central. The servers
hold it (netlify/functions/_lib/custquiet.js, portal.js approvals "scheduled", cust-release.js sends at 7:00 AM). Here:
 * window._gcCQ: the same clock as the servers (America/Chicago; quiet = hour >= 19 || hour < 7; nextRelease = the next
   7:00 AM Central), the sentence, and "Send now (emergency)" for admins.
 * Every answer from a function that says it was scheduled / held (an approval, a text, a crew text, a portal welcome
   text, an automatic approval) shows the toast "⏰ Scheduled for 7:00 AM — customers don't get posts or texts 7 PM–7 AM".
   For an admin the toast carries a "Send now (emergency)" link for that one item; nobody else gets it, and it is never
   the default.
 * The approval cards (Approvals list, the PDF review panel, the card actions) say the same sentence instead of
   "Done." / "Sent", and the Approvals list keeps a scheduled item as "⏰ Scheduled 7:00 AM" until it is released
   (admins and the office see all of them, a PM their own); admins get "Send now (emergency)" on it.
 * The review panel's "Approve sends it now" reads "⏰ Approve now — it goes out at 7:00 AM" inside the window.
 * The text bar's old "after 8 PM" question now says 7 PM (the server no longer asks; it queues).
Usage: python3 tools/patch_CUSTQUIET.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CUSTQUIET:'
if MARK in src:
    print('already patched'); sys.exit(0)

def sub(old, new):
    global src
    n = src.count(old)
    assert n == 1, ('CUSTQUIET anchor', n, old[:100])
    src = src.replace(old, new)

SAYJ = "window._gcCQSay ? window._gcCQSay(j) : '⏰ Scheduled for 7:00 AM'"

# 1) the approvals card notes (patch APPR act, the AP2 review panel, the APX list's toast)
sub("notes[id] = j.sent ? '✅ Sent to ' + s(j.item && j.item.to) : (op === 'reject' ? 'Rejected.'",
    "notes[id] = j.scheduled ? (" + SAYJ + ") /* patch CUSTQUIET: approved 7 PM–7 AM → 7:00 AM */ : j.sent ? '✅ Sent to ' + s(j.item && j.item.to) : (op === 'reject' ? 'Rejected.'")
sub("if(j.ok) notes[id] = j.sent ? (j.item && j.item.kind === 'portal_publish'",
    "if(j.ok) notes[id] = j.scheduled ? (" + SAYJ + ") /* patch CUSTQUIET */ : j.sent ? (j.item && j.item.kind === 'portal_publish'")
sub("toast(j.ok ? (j.sent ? '✅ Approved and sent.'",
    "toast(j.ok ? (j.scheduled ? (" + SAYJ + ") /* patch CUSTQUIET */ : j.sent ? '✅ Approved and sent.'")
sub("(x.kind === 'portal_publish' ? 'Approve puts it in the customer’s portal' : last ? 'Approve sends it now' : 'Approve passes it to Wesley or Nick')",
    "((x.kind === 'portal_publish' || last) && window._gcCQ && window._gcCQ.quiet() ? '⏰ Approve now — it goes out at 7:00 AM' /* patch CUSTQUIET */ : x.kind === 'portal_publish' ? 'Approve puts it in the customer’s portal' : last ? 'Approve sends it now' : 'Approve passes it to Wesley or Nick')")

# 2) the Approvals list keeps a scheduled item ("⏰ Scheduled 7:00 AM") until 7 AM
sub("  Q.forEach(function(x){\n    if (!x || (x.status !== 'waiting' && x.status !== 'sending')) return;",
    "  Q.forEach(function(x){\n    if (x && x.status === 'scheduled') { if (sc.kind === 'admin' || sc.kind === 'office' || (sc.kind === 'pm' && samePerson(x.pm, who))) add(rowQueue(x, false, now)); return; }   /* patch CUSTQUIET: approved at night, goes at 7 AM */\n    if (!x || (x.status !== 'waiting' && x.status !== 'sending')) return;")
sub("  var step = x.status === 'sending' ? 'sending' : x.step === 'pm' ? 'pm' : esc8 ? 'office' : 'admin';",
    "  var step = x.status === 'scheduled' ? 'scheduled' : x.status === 'sending' ? 'sending' : x.step === 'pm' ? 'pm' : esc8 ? 'office' : 'admin';   /* patch CUSTQUIET */")
sub("  var waits = step === 'sending' ? 'Sending now…' :",
    "  var waits = step === 'scheduled' ? '⏰ Scheduled 7:00 AM' /* patch CUSTQUIET */ : step === 'sending' ? 'Sending now…' :")
sub("    + (r.chain ? '<span class=\"apx-ch\">' + esc(r.chain) + '</span>' : '') + '</div>'\n    + btns(r, where)",
    "    + (r.chain ? '<span class=\"apx-ch\">' + esc(r.chain) + '</span>' : '') + '</div>'\n    + (W._gcCQRowHtml ? W._gcCQRowHtml(r) : '')   /* patch CUSTQUIET: \"Scheduled 7:00 AM\" + the admin's Send now */\n    + btns(r, where)")
sub("var RANK = { waiting:0, sending:1, approved:2, rejected:3, sent:4 };",
    "var RANK = { waiting:0, scheduled:1, sending:1, approved:2, rejected:3, sent:4 };   /* patch CUSTQUIET: scheduled = approved, waits for 7 AM */")

# 3) the text bar: 7 PM (the server queues now; this question only shows for an old server answer)
sub("    /* patch SMSROUTE: after 8 PM the CRM asks before texting */",
    "    /* patch SMSROUTE: after 7 PM the CRM asks before texting (patch CUSTQUIET: 7 PM; the server now queues the text for 7 AM) */")
sub("yes = W.confirm('It is after 8 PM (or before 7 AM). Texts normally wait until morning. Send it now anyway?');",
    "yes = W.confirm('It is after 7 PM (or before 7 AM). Texts to customers wait until 7:00 AM. Send it now anyway?');")

# 4) the module: clock, toast, Send now (emergency)
BLOCK = r"""
<script id="gc-patch-custquiet">
/* patch CUSTQUIET: customer quiet hours (owner: "never post to portal or send texts anything after 7pm -7am").
   Staff work and approve at night; nothing goes to customers or subs 7:00 PM – 7:00 AM Central. The servers hold it and
   send it at 7:00 AM (netlify/functions/_lib/custquiet.js, cust-release.js). This page: the same clock, the toast, the
   "Scheduled 7:00 AM" line on an approval, and an admin-only "Send now (emergency)" for one item. */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_CUSTQUIET__) return; W.__GC_PATCH_CUSTQUIET__ = true;
var SAY = '⏰ Scheduled for 7:00 AM — customers don\'t get posts or texts 7 PM–7 AM';
var TZ = 'America/Chicago', START_H = 19, END_H = 7;
function s(v){ return v == null ? '' : String(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowMs(){ return typeof W._gcCQNow === 'function' ? W._gcCQNow() : Date.now(); }
function parts(ms){
  var o = {};
  try { new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).forEach(function(p){ o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, se: +o.second }; }
  catch (e) { var d = new Date(ms - 6 * 3600000); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), se: d.getUTCSeconds() }; }
}
function quiet(ms){ var h = parts(ms == null ? nowMs() : ms).h; return h >= START_H || h < END_H; }
function atCentral(y, mo, d, h){ var g = Date.UTC(y, mo - 1, d, h, 0, 0); for (var i = 0; i < 3; i++) { var p = parts(g), diff = Date.UTC(y, mo - 1, d, h, 0, 0) - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.se); if (!diff) break; g += diff; } return g; }
function nextRelease(ms){ ms = ms == null ? nowMs() : ms; var p = parts(ms), t = p.h < END_H ? p : (function(){ var x = new Date(Date.UTC(p.y, p.mo - 1, p.d + 1)); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() }; })(); return atCentral(t.y, t.mo, t.d, END_H); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
W._gcCQ = { quiet: quiet, nextRelease: nextRelease, say: SAY, isAdmin: isAdmin, parts: parts };
W._gcCQSay = function(j){ return SAY; };

/* the toast (one at a time); an admin gets "Send now (emergency)" for that one item */
var lastToast = null;
function toast(msg, send){
  try {
    if (lastToast) { try { lastToast.remove(); } catch (e) {} }
    var t = D.createElement('div'); t.className = 'gc-cq-toast'; t.setAttribute('data-gc-keep', '1'); t.setAttribute('role', 'status');
    t.innerHTML = '<span class="gc-cq-msg">' + esc(msg) + '</span>' + (send && isAdmin() ? ' <a href="#" class="gc-cq-now" data-cq-' + (send.q ? 'q' : 'a') + '="' + esc(send.id) + '">Send now (emergency)</a>' : '');
    D.body.appendChild(t); lastToast = t;
    setTimeout(function(){ try { t.remove(); } catch (e) {} }, 9000);
  } catch (e) {}
}
W._gcCQToast = toast;
function authHeaders(){ return { 'Content-Type': 'application/json' }; }   /* the page's fetch adds the sign-in to function calls */
function sendNowApproval(id){
  if (!isAdmin()) return;
  if (!W.confirm('Send it now, at night? It goes to the customer right away. Only for an emergency.')) return;
  var go = typeof W._gcApprovalAct === 'function' ? Promise.resolve(W._gcApprovalAct(id, 'sendnow'))
    : W.fetch('/.netlify/functions/portal', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'approval', op: 'sendnow', id: id }) }).then(function(r){ return r.json(); });
  go.then(function(j){ toast(j && j.ok ? '✅ Sent now (emergency).' : '⚠ ' + ((j && j.error) || 'Try again.')); try { if (W._gcApprovalsRefresh) W._gcApprovalsRefresh(); } catch (e) {} }, function(){ toast('⚠ Try again.'); });
}
function sendNowQueued(id){
  if (!isAdmin()) return;
  if (!W.confirm('Send it now, at night? It goes to the customer right away. Only for an emergency.')) return;
  W.fetch('/.netlify/functions/cust-quiet', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ op: 'sendnow', id: id }) })
    .then(function(r){ return r.json(); }).then(function(j){ toast(j && j.ok ? '✅ Sent now (emergency).' : '⚠ ' + ((j && j.error) || 'Try again.')); }, function(){ toast('⚠ Try again.'); });
}
D.addEventListener('click', function(ev){
  var a = ev.target && ev.target.closest ? ev.target.closest('[data-cq-a],[data-cq-q]') : null; if (!a) return;
  ev.preventDefault(); ev.stopPropagation();
  if (!isAdmin()) return;
  if (a.hasAttribute('data-cq-a')) sendNowApproval(a.getAttribute('data-cq-a')); else sendNowQueued(a.getAttribute('data-cq-q'));
}, true);
/* the Approvals list: a scheduled item's line (patch APX rowHtml calls this) */
W._gcCQRowHtml = function(r){
  if (!r || r.step !== 'scheduled') return '';
  return '<div class="gc-cq-row">' + esc(SAY) + (isAdmin() && r.src === 'queue' ? ' <a href="#" class="gc-cq-now" data-cq-a="' + esc(r.id) + '">Send now (emergency)</a>' : '') + '</div>';
};
/* any function's answer that says "scheduled" / "held" → the toast */
var FN_RE = /\/\.netlify\/functions\/(portal|texts|field-ops|portal-access|cust-quiet|gc-portal|portal-extra|portal-plus)\b/;
var prev = W.fetch;
if (typeof prev === 'function') {
  var g = function(url, opts){
    var p = prev.apply(this, arguments);
    try {
      var u = typeof url === 'string' ? url : (url && url.url) || '';
      var m = s((opts && opts.method) || (url && url.method) || 'GET').toUpperCase();
      if (m !== 'POST' || !FN_RE.test(u)) return p;
      return p.then(function(res){
        try { if (res && typeof res.clone === 'function') res.clone().json().then(function(j){
          if (!j || !(j.scheduled === true || j.held === true)) return;
          var item = j.item && j.item.id ? { id: j.item.id } : j.cqId ? { id: j.cqId, q: true } : null;
          toast(s(j.say) || SAY, j.scheduled && j.item && j.item.status === 'scheduled' ? item : (j.cqId ? { id: j.cqId, q: true } : null));
        }).catch(function(){}); } catch (e) {}
        return res;
      });
    } catch (e) { return p; }
  };
  try { Object.keys(prev).forEach(function(k){ if (!(k in g)) g[k] = prev[k]; }); } catch (e) {}
  W.fetch = g;
}
try {
  var st = D.createElement('style'); st.id = 'gc-cq-style';
  st.textContent = '.gc-cq-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100300;background:#1e3a8a;color:#fff;padding:11px 16px;border-radius:10px;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:min(92vw,560px);line-height:1.4}'
    + '.gc-cq-toast .gc-cq-now{color:#fde68a;text-decoration:underline;font-weight:700;margin-left:6px;white-space:nowrap}'
    + '.gc-cq-row{font-size:12.5px;font-weight:700;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:5px 8px;margin:4px 0}'
    + '.gc-cq-row .gc-cq-now{color:#b91c1c;font-weight:700;margin-left:6px;text-decoration:underline}'
    + '.apx-w.scheduled{color:#1e3a8a;font-weight:700}';
  (D.head || D.documentElement).appendChild(st);
} catch (e) {}
try { console.log('[GC] ⏰ Customer quiet hours 7 PM–7 AM Central: approvals / texts go at 7:00 AM (patch CUSTQUIET) — _gcCQ'); } catch (e) {}
})();
</script>"""
ANCHOR = "try { console.log('[GC] 📱 Field: portals, photos & messages on every job, the job page as an app, ⚙ Settings (patch FIELDPORTAL) — _gcFP'); } catch (e) {}\n})();\n</script>"
sub(ANCHOR, ANCHOR + BLOCK)

open(path, 'w', encoding='utf-8').write(src)
print('CUSTQUIET: patched', path)
