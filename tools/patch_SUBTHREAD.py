#!/usr/bin/env python3
"""patch SUBTHREAD (owner's sub portal plan, 11/15 list item 5.4): the per-job GrayCo ↔ sub thread (gc_portal_msg party s:<sub>)
  · every message in it also lands in the job's 💬 Messages tagged with the sub (_lib/subthread.js);
  · GrayCo writes → the sub gets an e-mail / text with a button straight to that job in their portal (once per 30 minutes per job;
    data-entry mode holds it);
  · automatic posts: schedule ✅ confirmed (SUBSCHED; 📨 ask to move was already posted), a scope / change order published to sign
    (s-scope-approve), 🏆 awarded with the PO (CRM, after the award puts the sub on the job), 💵 payment sent (CRM, a paid sub
    invoice, once — gc_kv gc_subpay_posted); scope sends were already posts (SCOPESEND, now with "what changed").
Idempotent. Usage: python3 tools/patch_SUBTHREAD.py [repo-root]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(here)
def edit(fn, pairs):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read(); n0 = src
    for o, n in pairs:
        if n in src: continue
        assert src.count(o) == 1, (fn, src.count(o), o[:90]); src = src.replace(o, n)
    if src != n0: open(p, 'w', encoding='utf-8').write(src)
edit('netlify/functions/portal-access.js', [
    ("async function msgInsert(pid, party, side, author, text, files){\n  const id = newId('M');\n  await dbPost('gc_portal_msg', { id: id, project_id: s(pid), party: party, side: side, author: clip(author, 80), text: clip(text, 4000),\n    files: (files || []).map(function(f){ return { ref: s(f.ref), name: clip(f.name, 120), type: s(f.type) }; }).filter(function(f){ return refPath(f.ref); }) });\n  return id;\n}",
     "async function msgInsert(pid, party, side, author, text, files, opt){\n  const id = newId('M');\n  await dbPost('gc_portal_msg', { id: id, project_id: s(pid), party: party, side: side, author: clip(author, 80), text: clip(text, 4000),\n    files: (files || []).map(function(f){ return { ref: s(f.ref), name: clip(f.name, 120), type: s(f.type) }; }).filter(function(f){ return refPath(f.ref); }) });\n"
     "  /* patch SUBTHREAD: a sub's thread → the job's 💬 Messages (tagged with the sub) + a notice to the sub when GrayCo wrote */\n"
     "  if (/^s:/.test(s(party))) { try { await require('./_lib/subthread.js').after(subThreadDeps(), { id: id, pid: s(pid), subId: s(party).slice(2), side: side, author: author, text: text, files: (files || []).map(function(f){ return { name: clip(f && f.name, 120) }; }), notify: !(opt && opt.notify === false) }); } catch (e) {} }\n"
     "  return id;\n}\n"
     "function subThreadDeps(){ return { core: function(){ return require('./portal.js')._core; }, crmData: crmData, subById: subById, jobTagOf: jobTagOf, subLinkCreate: subLinkCreate, linkFor: linkFor, sendMail: sendMail, sendText: sendText, textReady: textReady, mailHtml: mailHtml, dbGet: dbGet, okEmail: okEmail, phone10: phone10 }; }"),
    ("    await dbPost('gc_sub_event', { id: newId('E'), kind: 'scope', project_id: x.project_id, sub_id: x.sub_id, data: { subName: s(sub.name), scopeId: x.id, kind: x.kind, op: 'published', version: x.version, title: x.title, total: money(x.total), by: me } });",
     "    await dbPost('gc_sub_event', { id: newId('E'), kind: 'scope', project_id: x.project_id, sub_id: x.sub_id, data: { subName: s(sub.name), scopeId: x.id, kind: x.kind, op: 'published', version: x.version, title: x.title, total: money(x.total), by: me } });\n"
     "    try { let chg = ''; try { const H = (Array.isArray(x.history) ? x.history : []).filter(function(h){ return h && Number(h.version) < Number(x.version) && h.data; }); const pv = H[H.length - 1]; if (pv) { const SDF = require('./_lib/scopediff.js'); chg = SDF.text(SDF.diff(pv.data, x.data || {}), pv.version, x.version); } } catch (e2) {}\n"
     "      await msgInsert(x.project_id, 's:' + x.sub_id, 'gc', me, (x.kind === 'co' ? '📋 GrayCo sent you a change order to review and sign: ' : '📋 GrayCo sent you a scope to review and sign: ') + clip(x.title, 160) + ' (v' + x.version + '). Open it under Scope.' + (chg ? '\\n\\n' + chg : ''), [], { notify: false }); } catch (e) {}   /* patch SUBTHREAD: in the thread too (the e-mail below is the notice) */"),
])
edit('netlify/functions/_lib/subsched.js', [
    ("  if (op === 'move') {\n    const es = hit.lang === 'es';",
     "  if (op === 'confirm') {   /* patch SUBTHREAD: ✅ confirmed → a line in the sub's thread on the job */\n"
     "    const es = hit.lang === 'es';\n"
     "    try { await deps.msgInsert(hit.pid, 's:' + hit.subId, 'gc', me, (es ? '📅 GrayCo confirmó su horario: \"' : '📅 GrayCo confirmed your schedule: \"') + hit.task + '\" (' + datesLine(hit) + ').', []); } catch (e) {}\n"
     "  }\n"
     "  if (op === 'move') {\n    const es = hit.lang === 'es';"),
])
P = os.path.join(R, 'index.html'); TAG = '<script id="gc-patch-subthread">'
js = open(os.path.join(here, 'subthread_tail.js'), encoding='utf-8').read(); assert '</script' not in js.lower()
src = open(P, encoding='utf-8').read()
if TAG in src:
    i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
else:
    src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
open(P, 'w', encoding='utf-8').write(src); print('SUBTHREAD applied')
