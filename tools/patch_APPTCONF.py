#!/usr/bin/env python3
"""Idempotent patch APPTCONF: appointment confirmations — no duplicates, none on commercial jobs by default, and every
customer-mail approval says plainly what Approve does (owner 10/27: two "✉ Confirm … ROTC Cordova (Monday, November 9)"
cards to the GC's office e-mail, "approve sends what? I don't understand, and there are duplicates").

  * Server (netlify/functions/_lib/auto-queue.js): an appointment confirmation is ONE per job, day and recipient: a second
    schedule item that day is added to the waiting confirmation ("Confirm A + B"), never a second card, and never again
    once one was sent. Commercial / government jobs (job type, isCommercial, or a GC customer) get no automatic appointment
    mail unless a person turned the job's "Schedule updates" switch on.
  * Page: every customer e-mail / text card says what Approve does — "Approve sends this e-mail to <customer> (<address>):
    “<subject>” — <first line>" (portal: puts it in <customer>'s portal; PM step: passes it to Wesley or Nick, then it is
    sent to …), and "Don't approve: nothing is sent". Duplicates already waiting (same job, day and recipient) are
    taken off the list once by an admin's computer (the existing reject: never sent), keeping the first.
Usage: python3 tools/patch_APPTCONF.py [repo dir]
"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
if root.endswith('index.html'): root = os.path.dirname(root) or '.'
MARK = '/* patch APPTCONF'
def edit(path, pairs, label, append=None):
    src = open(path, encoding='utf-8').read()
    if MARK in src: print('APPTCONF: ' + label + ' already patched'); return
    for a, b in pairs:
        assert src.count(a) == 1, ('APPTCONF find-string count != 1', label, src.count(a), a[:80])
        src = src.replace(a, b)
    if append: src = src.rstrip('\n') + append + '\n'
    open(path, 'w', encoding='utf-8').write(src); print('APPTCONF: patched ' + label)

AQ = [
("""  const pm = I.pmOf(data, p);
  const title = clip(body.title, 120) || (K.title + ' — ' + clip(p.name, 80));""",
 """  const pm = I.pmOf(data, p);
  let title = clip(body.title, 120) || (K.title + ' — ' + clip(p.name, 80));
  """ + MARK + """: no automatic appointment mail on a commercial job unless a person turned it on; one confirmation per job, day and recipient */
  const day = (ref.match(/_(\\d{8})/) || [])[1] || '';
  if (K.appt && commercialJob(p, data) && !personTurnedOn(p, K.key)) return { status: 200, out: { ok: false, off: 'commercial', error: 'Commercial job: appointment e-mails are off unless someone turns them on for this job.' } };
  if (kind === 'appt_confirm' && day) {
    const cur0 = await I.kvListRead(I.AQ_KEY);
    const twin = cur0 && cur0.list.find(function(x){ return x && x.kind === 'appt_confirm' && s(x.jobId) === pid && s((x.meta || {}).day || ((s(x.id).match(/_(\\d{8})/) || [])[1])) === day && s(x.to).toLowerCase() === to.toLowerCase() && /^(waiting|sending|sent|recorded)$/.test(s(x.status)) && s(x.id) !== qid; });
    if (twin) {
      const whatNew = (s(body.title).match(/Confirm (.+?) — /) || [])[1] || '';
      if (twin.status === 'waiting' && whatNew) {
        await I.kvListUpdate(I.AQ_KEY, function(l){ const x = l.find(function(y){ return s(y.id) === s(twin.id); }); if (!x || x.status !== 'waiting') return null;
          const items = Array.isArray((x.meta || {}).items) ? x.meta.items.slice() : [((s(x.title).match(/Confirm (.+?) — /) || [])[1] || '')].filter(Boolean);
          if (items.indexOf(whatNew) >= 0) return null;
          items.push(whatNew); x.meta = Object.assign({}, x.meta || {}, { items: items, day: day });
          x.title = clip(s(x.title).replace(/Confirm (.+?) — /, 'Confirm ' + items.join(' + ') + ' — '), 120);
          x.html = String(x.html || '').replace(/(<p>Your project manager:)/, '<p>The same day: <b>' + whatNew.replace(/[<>&]/g, '') + '</b>.</p>$1');
          x.updatedAt = new Date().toISOString();
          return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === s(twin.id); }); return !!(z && z.updatedAt === x.updatedAt); }, result: x }; });
      }
      return { status: 200, out: { ok: true, id: s(twin.id), queued: false, merged: true } };
    }
  }"""),
("""    subject: clip(body.subject, 200), html: html, attachments: [], meta: { by: who.email, ref: ref, auto: !!auto } });""",
 """    subject: clip(body.subject, 200), html: html, attachments: [], meta: { by: who.email, ref: ref, auto: !!auto, day: day || undefined } });"""),
("""async function queue(body, who, I){""",
 """function commercialJob(p, data){
  const t = [p.type, p.jobType, p.category, p.projectType, p.kind, p.segment].map(s).join(' ');
  if (p.isCommercial === true || p.commercial === true) return true;
  if (/commercial|government|municipal|public|school|church|office build|retail|warehouse|tenant|industrial|hotel|restaurant|apartment|multi-?family/i.test(t)) return true;
  try { const cs = (data && (Array.isArray(data.customers) ? data.customers : [])) || []; const c = cs.find(function(x){ return x && (s(x.id) === s(p.customerId) || (s(x.name) && s(x.name) === s(p.client))); }); if (c && /^(gc|general contractor|commercial|business|government)$/i.test(s(c.type))) return true; } catch (e) {}
  return false;
}
function personTurnedOn(p, key){ return !!((p.auto && p.auto[key] === true) || (p.autoX && p.autoX.apptAuto === true) || (p.auto && p.auto.apptAuto === true)); }
async function queue(body, who, I){"""),
]
JS = r"""
<script id="gc-patch-apptconf">
/* __GC_PATCH_APPTCONF__ — what Approve does, in plain words; appointment confirmation duplicates taken off once */
(function(){
'use strict';
if (window.__GC_PATCH_APPTCONF__) return; window.__GC_PATCH_APPTCONF__ = true;
var W = window;
function s(v){ return v == null ? '' : String(v).trim(); }
function proj(pid){ var l = (W._crm && W._crm.projects) || []; for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(pid)) return l[i]; return null; }
function firstLine(html){
  var t = s(String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' '));
  var lines = t.split(/\n+/).map(s).filter(function(l){ return l && !/^(hi|hello|dear|good (morning|afternoon))\b/i.test(l); });
  var l = (lines[0] || '').replace(/\s+([.,!?;:])/g, '$1').replace(/[.]+$/, ''); return l.length > 140 ? l.slice(0, 137) + '…' : l;
}
W._gcApprSay = function(x, last){
  if (!x) return '';
  var p = proj(x.jobId || x.pid), who = s(p && (p.client || p.customerName)) || s(x.jobName) || 'the customer';
  var to = s(x.to), subj = s(x.subject), fl = firstLine(x.html || x.text || x.body);
  var what = x.kind === 'portal_publish' ? 'puts it in ' + who + '’s customer portal (no e-mail)' : (x.channel === 'sms' ? 'texts ' + who + (to ? ' (' + to + ')' : '') : 'sends this e-mail to ' + who + (to ? ' (' + to + ')' : '')) + (subj ? ': “' + subj + '”' : '') + (fl ? ' — ' + fl : '');
  return last ? 'Approve ' + what + '. Don’t approve: nothing is sent.' : 'Approve passes it to Wesley or Nick; when they approve, it ' + what.replace(/^sends/, 'sends').replace(/^puts/, 'goes') + '. Don’t approve: nothing is sent.';
};
/* duplicates already waiting: same job, day and recipient — the first stays, the others are taken off (rejected = never sent) */
var tried = {};
function day(x){ return s((x.meta || {}).day) || ((s(x.id).match(/_(\d{8})/) || [])[1] || ''); }
function sweep(){
  if (!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) || typeof W._gcApprovalAct !== 'function' || typeof W._gcCustApprovals !== 'function') return;
  var all = []; try { all = (W._gcCustApprovals() || {}).all || []; } catch (e) { return; }
  var first = {};
  all.filter(function(x){ return x && x.kind === 'appt_confirm' && /^(waiting|sending|sent)$/.test(s(x.status)) && day(x); })
    .sort(function(a, b){ return (Date.parse(a.createdAt || 0) || 0) - (Date.parse(b.createdAt || 0) || 0); })
    .forEach(function(x){ var k = s(x.jobId) + '|' + day(x) + '|' + s(x.to).toLowerCase(); if (!first[k]) { first[k] = x; return; }
      if (x.status !== 'waiting' || tried[x.id]) return; tried[x.id] = 1;
      try { Promise.resolve(W._gcApprovalAct(x.id, 'reject', { reason: 'Duplicate: one appointment confirmation per job and day (kept “' + s(first[k].title).slice(0, 80) + '”)' })).catch(function(){}); } catch (e) {} });
}
(W.__GC_NATIVE_SETINTERVAL__ || W.setInterval).call(W, function(){ try { sweep(); } catch (e) {} }, 60000);
(W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ try { sweep(); } catch (e) {} }, 20000);
W._gcApptConf = { sweep: sweep, say: W._gcApprSay };
})();
</script>"""
HTML = [
("""      '<span style="font-size:11px;color:#64748b">' + (x.kind === 'portal_publish' ? 'Approve puts it in the customer’s portal' : last ? 'Approve sends it now' : 'Approve passes it to Wesley or Nick') + '</span>' +""",
 """      '<span style="font-size:11px;color:#64748b">' + (x.kind === 'portal_publish' ? 'Approve puts it in the customer’s portal' : last ? 'Approve sends it now' : 'Approve passes it to Wesley or Nick') + '</span>' +   """ + MARK + """: the plain sentence is above the buttons */"""),
("""    '<div style="font-size:12px;color:#92400e;margin-top:2px">' + who + esc(chain) + '</div>' +""",
 """    '<div style="font-size:12px;color:#92400e;margin-top:2px">' + who + esc(chain) + '</div>' +
    (window._gcApprSay ? '<div style="font-size:13px;color:#0f172a;background:#f1f5f9;border-radius:8px;padding:6px 8px;margin-top:6px">' + esc(window._gcApprSay(x, last)) + '</div>' : '') +   /* patch APPTCONF */"""),
("""    + (r.job ? '<div class="apx-j">🏗 ' + esc(r.job) + '</div>' : '')""",
 """    + (r.job ? '<div class="apx-j">🏗 ' + esc(r.job) + '</div>' : '')
    + (r.src === 'queue' && W._gcApprSay && r.approve ? (function(){ var x = null; try { x = queue().filter(function(y){ return s(y.id) === s(r.id); })[0]; } catch (e) {} var t = x ? W._gcApprSay(x, /Approve & send|portal/.test(s(r.approve.l))) : ''; return t ? '<div class="apx-say" style="font-size:13px;color:#0f172a;background:#f1f5f9;border-radius:8px;padding:6px 8px;margin:4px 0">' + esc(t) + '</div>' : ''; })() : '')   /* patch APPTCONF */"""),
]
edit(os.path.join(root, 'netlify', 'functions', '_lib', 'auto-queue.js'), AQ, 'auto-queue.js')
edit(os.path.join(root, 'index.html'), HTML, 'index.html', append=JS)
