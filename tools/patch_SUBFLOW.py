#!/usr/bin/env python3
"""Idempotent patch SUBFLOW (owner 11/23: "Make sure my sub portal is correctly taking bids for jobs and everything is working correctly.
Remember bid portal is very important too like sub portal. Bid portal should take bids, make sure they can download plans, request plans;
when a sub requests anything or messages on bid or sub portal directed towards PM or estimator they should get notification and be able to
answer on their app or CRM.").

The CRM side (desk AND GrayCo Field — the 💬 Job Messages thread is the same overlay in both):
  * every post the bid site / sub portal writes for the job's PM + estimator (a 📩 plan request, a ❓ question, a 💬 message, a sub portal
    thread message) gets "↩ Reply to <sub>" under it: a sheet with the answer box (a question also offers "📣 Answer to all bidders");
    the answer goes back to the sub where they asked (bid-hub op subreply → the bid site AND the sub portal), the team sees
    "↩ Answered <sub>: …" in the thread, and a post someone already answered says "✓ Answered" (a second reply is still possible);
  * a 📨 bid / 🧱 material request post says where it is answered (🏗 Bid portal → 📨 Bids / ✅ Approvals).
Server: netlify/functions/bid-hub.js (op subreply), subportal.js (SUBFLOW: the 🔔 posts, push / text, To-Dos), portal-access.js.
Every MARK sits inside a JS comment. Anchors must each occur exactly once.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
t = open(p, encoding='utf-8').read(); orig = t
MARK = '/* SUBFLOW: ↩ Reply to the sub from the job thread */'
TAG = '<script data-gc-patch="SUBFLOW">'


def once(s, old, new):
    assert s.count(old) == 1, ('SUBFLOW: anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


# 1. the Job Messages bubble: a hook under each message (data-mid on the row; the reply button from the SUBFLOW script)
OLD = "+'</div><div style=\"font-size:9px;color:#94a3b8;margin-top:1px\">'+esc(when)+'</div></div>';"
NEW = "+'</div><div style=\"font-size:9px;color:#94a3b8;margin-top:1px\">'+esc(when)+'</div>'+(window._gcSubflow&&!mine?window._gcSubflow.btn(m,pid):'')+'</div>';   /* SUBFLOW: ↩ Reply to the sub */"
if NEW not in t:
    t = once(t, OLD, NEW)

JS = r"""
(function(W, D){
'use strict';
if (W._gcSubflow) return;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function toast(msg, bad){ try { if (W._gcSys && W._gcSys.toast) return W._gcSys.toast(msg, bad); } catch (e) {} try { if (typeof W.showToast === 'function') return W.showToast(msg); } catch (e) {} }
/* what a post from a sub is: { kind, id, subId, company, pid } — or null */
function what(m, pid){
  if (!m) return null;
  var sf = m.sf && typeof m.sf === 'object' ? m.sf : null;
  if (sf && /^(question|planreq|message|bid|matreq|mquote)$/.test(s(sf.kind))) return { kind: s(sf.kind), id: s(sf.id), company: s(sf.company), pid: s(m.pid) || pid };
  if (s(m.planReqId)) return { kind: 'planreq', id: s(m.planReqId), company: s(m.authorName).replace(/\s*\(bid site\)\s*$/, ''), pid: s(m.pid) || pid };
  if (s(m.channel) === 'subportal' && s(m.dir) === 'in' && s(m.subId)) return { kind: 'portal', subId: s(m.subId), company: s(m.subName) || 'the sub', pid: s(m.pid) || pid };
  return null;
}
/* who already answered which post (the "↩ Answered" posts in the cached thread list) */
var AN = { raw: -1, at: 0, map: {} };
function answered(){
  if (Date.now() - AN.at < 1500) return AN.map;
  var raw = ''; try { raw = localStorage.getItem('gc_job_messages') || '[]'; } catch (e) {}
  if (raw.length !== AN.raw) { var map = {}; try { JSON.parse(raw).forEach(function(x){ if (x && s(x.sfReplyTo)) map[s(x.sfReplyTo)] = s(x.authorName) || 'GrayCo'; }); } catch (e) {} AN.map = map; AN.raw = raw.length; }
  AN.at = Date.now(); return AN.map;
}
var SHOWN = {};
function btn(m, pid){
  try {
    var w = what(m, pid); if (!w) return '';
    var st = 'display:inline-block;margin-top:4px;padding:6px 12px;min-height:34px;border:1px solid #2563eb;border-radius:8px;background:#eff6ff;color:#1d4ed8;font:700 12px Arial,sans-serif;cursor:pointer;touch-action:manipulation';
    if (w.kind === 'bid' || w.kind === 'mquote') return '<div data-sfnote="1" style="font-size:11px;color:#475569;margin-top:3px">📨 Compare it in 🏗 Bid portal → 📨 Bids</div>';
    if (w.kind === 'matreq') return '<div data-sfnote="1" style="font-size:11px;color:#475569;margin-top:3px">🧱 Approve or decline it in ✅ Approvals</div>';
    var by = answered()[s(m.id)];
    SHOWN[s(m.id)] = w;
    return (by ? '<div data-sfdone="1" style="font-size:11px;color:#15803d;font-weight:700;margin-top:3px">✓ Answered by ' + esc(by) + '</div>' : '') +
      '<button type="button" data-sfr="' + esc(m.id) + '" style="' + st + '">↩ ' + (by ? 'Reply again to ' : 'Reply to ') + esc(w.company || 'the sub') + '</button>';
  } catch (e) { return ''; }
}
function post(body){
  return W.fetch('/.netlify/functions/bid-hub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok || j.error) throw new Error(j.error || ('The server answered ' + r.status)); return j; }); });
}
function addLocal(p){
  if (!p || !p.id) return;
  try { var l = JSON.parse(localStorage.getItem('gc_job_messages') || '[]'); if (!l.some(function(x){ return x && x.id === p.id; })) { l.push(p); localStorage.setItem('gc_job_messages', JSON.stringify(l)); } } catch (e) {}
  AN.at = 0;
}
function sheet(mid){
  var w = SHOWN[mid]; if (!w) return;
  var old = D.getElementById('gc-sfr-sheet'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gc-sfr-sheet'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100260;background:rgba(6,12,20,.6);display:flex;align-items:flex-end;justify-content:center;padding:12px';
  var lbl = w.kind === 'question' ? '❓ Answer ' + esc(w.company) + '\'s question' : w.kind === 'planreq' ? '📩 Answer ' + esc(w.company) + '\'s request' : '💬 Reply to ' + esc(w.company);
  var where = w.kind === 'portal' ? 'They see it in their GrayCo Portal (portal.grayco-cs.com) and get a notice.' : 'They see it on the bid site and in their GrayCo Portal (📋 Jobs to bid).';
  ov.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Reply to the sub" style="background:#fff;border-radius:14px;width:100%;max-width:520px;padding:14px;font:14px Arial,sans-serif;color:#0f2440;box-shadow:0 10px 40px rgba(0,0,0,.35)">'
    + '<div style="font-weight:800;font-size:15px;margin-bottom:4px">' + lbl + '</div><div style="font-size:12px;color:#64748b;margin-bottom:8px">' + where + '</div>'
    + '<textarea id="gc-sfr-text" rows="4" maxlength="4000" placeholder="Your answer" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:15px Arial,sans-serif;min-height:96px"></textarea>'
    + '<div id="gc-sfr-err" role="alert" style="color:#b91c1c;font-size:12px;min-height:16px"></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">'
    + '<button type="button" data-sfx="cancel" style="min-height:44px;padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer">Cancel</button>'
    + (w.kind === 'question' ? '<button type="button" data-sfx="all" style="min-height:44px;padding:8px 14px;border:none;border-radius:8px;background:#7c3aed;color:#fff;font-weight:700;cursor:pointer">📣 Answer to all bidders</button>' : '')
    + '<button type="button" data-sfx="send" style="min-height:44px;padding:8px 14px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">' + (w.kind === 'question' ? 'Answer privately' : 'Send to ' + esc(w.company)) + '</button></div></div>';
  D.body.appendChild(ov);
  var ta = ov.querySelector('#gc-sfr-text'), err = ov.querySelector('#gc-sfr-err');
  try { ta.focus(); } catch (e) {}
  ov.addEventListener('click', function(e){
    if (e.target === ov) { ov.remove(); return; }
    var b = e.target.closest ? e.target.closest('[data-sfx]') : null; if (!b) return;
    var x = b.getAttribute('data-sfx'); if (x === 'cancel') { ov.remove(); return; }
    var text = s(ta.value); if (!text) { err.textContent = 'Write the answer first.'; ta.focus(); return; }
    Array.prototype.forEach.call(ov.querySelectorAll('button'), function(y){ y.disabled = true; });
    err.textContent = '';
    post({ op: 'subreply', kind: w.kind, id: w.id, subId: w.subId, pid: w.pid, company: w.company, msgId: mid, text: text, publish: x === 'all' }).then(function(r){
      ov.remove(); addLocal(r.post);
      toast(x === 'all' ? '📣 Answered to all bidders (its e-mail waits on ✅ Approvals)' : '↩ Sent to ' + (w.company || 'the sub') + (r.mail === 'held' ? ' — e-mail held (data-entry mode); they see it on the bid site' : ''));
      try { var o = D.getElementById('_gcJobMsgOv'); if (o && W._gcOpenJobMessages && w.pid) { o.remove(); W._gcOpenJobMessages(w.pid); } } catch (e) {}
    }, function(e2){
      Array.prototype.forEach.call(ov.querySelectorAll('button'), function(y){ y.disabled = false; });
      err.textContent = s(e2 && e2.message) || 'Not sent — try again.';
    });
  });
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-sfr]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation(); sheet(b.getAttribute('data-sfr'));
}, true);
W._gcSubflow = { btn: btn, what: what, sheet: sheet };
try { console.log('[GC] ↩ Reply to the sub from the job thread (patch SUBFLOW): _gcSubflow'); } catch (e) {}
})(window, document);
"""
assert '</script' not in JS.lower()
body = MARK + JS
if TAG in t:
    assert t.count(TAG) == 1, 'SUBFLOW: script tag twice'
    i = t.index(TAG) + len(TAG) + 1; j = t.index('</script>', i)
    if t[i:j] != body:
        t = t[:i] + body + t[j:]; print('SUBFLOW: script updated')
else:
    assert t.rstrip().endswith('</script>'), 'SUBFLOW: page end'
    t = t.rstrip() + '\n' + TAG + '\n' + body + '</script>\n'
    print('SUBFLOW: script added')
assert t.count(MARK) == 1
if t == orig:
    print('SUBFLOW: already patched'); sys.exit(0)
open(p, 'w', encoding='utf-8').write(t)
print('SUBFLOW: patched', p)
