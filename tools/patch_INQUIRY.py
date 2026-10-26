#!/usr/bin/env python3
"""Idempotent patch INQUIRY (owner 10/26): a website contact that is not a lead is a shared To-Do for the admins
and the office (gc_office_tasks, kind "web_inquiry", written by netlify/functions/website-intake.js). This patch
gives that To-Do its card: the details, Reply by e-mail, Call, Convert to lead, Invite to sub onboarding (a sub),
Mark done.   usage: python3 tools/patch_INQUIRY.py [index.html]"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch INQUIRY */'
if MARK in src:
    print('already patched'); sys.exit(0)

# 1. the To-Do (patch TODO srcStored): a web_inquiry row opens the inquiry card; Call is the second button
A = "      if (t.kind === 'partner_job') { o.cat = 'appr';"
assert src.count(A) == 1, ('anchor A', src.count(A))
assert src.count("function storeDone(n, id, on, extra){") == 1 and src.count("var OT = 'gc_office_tasks', AT = 'gc_admin_tasks';") == 1
ADD = ("      if (t.kind === 'web_inquiry') { var iq = t.inquiry || {}; o.cat = iq.kind === 'sub' ? 'subs' : 'cust'; o.vis = 'company'; o.thing = 'webinq|' + id; o.prio = 'high';"
       " o.sub = [s(iq.email), s(iq.phone), s(iq.location)].filter(Boolean).join(' · ') + (s(iq.message) ? ' — ' + s(iq.message).replace(/\\s+/g, ' ').slice(0, 140) : '');"
       " o.act = { l: '📨 Open', f: function(){ call('_gcInquiryOpen', t, { done: function(extra){ storeDone(n, id, true, extra); dirty = true; try { paint(true); } catch (e) {} } }); } };"
       " if (s(t.phone || iq.phone)) o.act2 = actCall(s(t.phone || iq.phone)); }   " + MARK + "\n")
src = src.replace(A, ADD + A)

# 2. the inquiry card
TAIL = r'''
<script id="gc-patch-inquiry">
/* patch INQUIRY — the card behind a website inquiry on the To-Do (gc_office_tasks, kind "web_inquiry"):
   the sender's details, ✉️ Reply (the CRM's own composer, else the mail app), 📞 Call, ➕ Convert to lead
   (website-intake.js ?act=inquiry-lead: the same Lead Inbox lead a lead form makes; the To-Do is marked done),
   🤝 Invite to sub onboarding (a "sub" inquiry: the sub onboarding form, _sendSubForm), ✅ Mark done. */
(function(){
'use strict';
var W = window, D = document;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function bearer(){ var h = { 'Content-Type': 'application/json' }; try { var a = JSON.parse(W.localStorage.getItem('gc_auth_v1') || 'null'); if (a && a.access_token) h.Authorization = 'Bearer ' + a.access_token; } catch (e) {} return h; }
function noteLine(t, k){ var m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(s(t.note)); return m ? m[1] : ''; }
var ID = '_gcInqOv';
function close(){ var o = D.getElementById(ID); if (o) o.remove(); }
W._gcInquiryOpen = function(t, h){
  t = t || {}; h = h || {}; close();
  var q = t.inquiry || {}, name = s(q.name), email = s(q.email || t.email), phone = s(q.phone || t.phone), first = name.split(/\s+/)[0] || '';
  var isSub = q.kind === 'sub', canInvite = isSub && typeof W._sendSubForm === 'function';
  var rows = [['From', name], ['Company', q.company], ['E-mail', email], ['Phone', phone], ['Location', q.location], ['They picked', q.picked], ['Message', q.message],
    ['Sent from', noteLine(t, 'Sent from') || q.page], ['Received', noteLine(t, 'Received') || q.receivedAt]].filter(function(r){ return s(r[1]); });
  var B = 'border:none;border-radius:10px;padding:10px 14px;font:700 14px Inter,Arial,sans-serif;cursor:pointer;min-height:42px';
  var ov = D.createElement('div'); ov.id = ID; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100220;background:rgba(6,12,20,.85);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:calc(14px + env(safe-area-inset-top,0px)) 12px 24px;font-family:Inter,-apple-system,Arial,sans-serif';
  ov.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:14px;max-width:600px;width:100%;padding:16px;box-sizing:border-box">'
    + '<div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Website inquiry · not a lead</div>'
    + '<div style="font-size:19px;font-weight:800;margin-top:2px;overflow-wrap:anywhere">' + esc(s(t.label).replace(/^Inquiry:\s*/, '')) + '</div></div>'
    + '<button type="button" data-q="x" aria-label="Close" style="' + B + ';background:#334155;color:#fff;min-height:36px;padding:6px 12px">✕</button></div>'
    + '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;table-layout:fixed">' + rows.map(function(r){
        var v = r[0] === 'E-mail' ? '<a href="mailto:' + esc(r[1]) + '">' + esc(r[1]) + '</a>' : r[0] === 'Phone' ? '<a href="tel:' + esc(r[1].replace(/[^\d+]/g, '')) + '">' + esc(r[1]) + '</a>' : esc(r[1]).replace(/\n/g, '<br>');
        return '<tr><td style="width:96px;padding:5px 8px 5px 0;color:#64748b;vertical-align:top;font-weight:600">' + esc(r[0]) + '</td><td style="padding:5px 0;overflow-wrap:anywhere;white-space:normal">' + v + '</td></tr>'; }).join('') + '</table>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px">'
    + (email ? '<button type="button" data-q="reply" style="' + B + ';background:#2563eb;color:#fff">✉️ Reply by e-mail</button>' : '')
    + (phone ? '<button type="button" data-q="call" style="' + B + ';background:#0f766e;color:#fff">📞 Call</button>' : '')
    + '<button type="button" data-q="lead" style="' + B + ';background:#d4a017;color:#1b1640">➕ Convert to lead</button>'
    + (canInvite ? '<button type="button" data-q="invite" style="' + B + ';background:#7c3aed;color:#fff">🤝 Invite to sub onboarding</button>' : '')
    + '<button type="button" data-q="done" style="' + B + ';background:#16a34a;color:#fff">✅ Mark done</button></div>'
    + '<div data-q="msg" style="margin-top:10px;font-size:13px;color:#475569;min-height:18px"></div></div>';
  D.body.appendChild(ov);
  var msg = ov.querySelector('[data-q="msg"]');
  function say(x, bad){ msg.textContent = x; msg.style.color = bad ? '#b91c1c' : '#15803d'; }
  function done(extra){ try { if (typeof h.done === 'function') h.done(extra); } catch (e) {} }
  ov.addEventListener('click', function(e){
    if (e.target === ov) { close(); return; }
    var b = e.target.closest('[data-q]'); if (!b) return;
    var a = b.getAttribute('data-q');
    if (a === 'x') close();
    else if (a === 'reply') {
      var subj = 'Re: your message to GrayCo Construction', body = (first ? 'Hi ' + first + ',' : 'Hello,') + '\n\nThank you for reaching out to GrayCo Construction Services.\n\n';
      close();
      if (typeof W._gcCompose === 'function') { try { if (W._gcCompose({ to: email, subject: subj, body: body, customer: name, about: isSub ? 'sub' : 'customer' }) !== null) return; } catch (x) {} }
      try { W.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body); } catch (x) {}
    }
    else if (a === 'call') { try { W.open('tel:' + phone.replace(/[^\d+]/g, ''), '_self'); } catch (x) {} }
    else if (a === 'invite') { close(); try { W._sendSubForm({ name: s(q.company) || name, email: email }); } catch (x) {} }
    else if (a === 'done') { done(); close(); }
    else if (a === 'lead') {
      if (!W.confirm('Make ' + (name || 'this inquiry') + ' a lead? It goes to the Lead Inbox / Leads like a website lead, and this To-Do is marked done.')) return;
      b.disabled = true; say('Making the lead…');
      W.fetch('/.netlify/functions/website-intake?act=inquiry-lead', { method: 'POST', headers: bearer(), body: JSON.stringify({ id: s(t.id) }), cache: 'no-store' })
        .then(function(r){ return r.json().catch(function(){ return { ok: false, error: 'The server answered ' + r.status + '.' }; }); })
        .then(function(j){
          if (!j || !j.ok) { b.disabled = false; say((j && j.error) || 'Could not make the lead.', true); return; }
          done({ leadId: s(j.leadId) }); say('Lead made — it is in the Lead Inbox (Leads).');
          setTimeout(close, 1400);
        }, function(){ b.disabled = false; say('Could not reach the server — check the internet connection.', true); });
    }
  });
};
})();
</script>
'''
assert src.count('<script id="gc-patch-inquiry">') == 0
src = src.rstrip('\n') + '\n' + TAIL.lstrip('\n')
assert src.count(MARK) == 1 and src.count('<script id="gc-patch-inquiry">') == 1 and src.count("W._gcInquiryOpen = function(t, h){") == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched')
