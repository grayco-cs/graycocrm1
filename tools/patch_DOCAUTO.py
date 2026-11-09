#!/usr/bin/env python3
"""patch DOCAUTO, server part (owner 11/9: "all have docusign — most documents are without approvals, just automatic documents by job type").
portal-sign.js: POST {action:'request-many', projectId, items:[{refId, title, docRef, docName}]} (staff) → each paper goes straight into
the customer's portal (✍️ Papers to sign — the same e-sign: E-SIGN consent, typed + drawn signature, signed PDF copy to the customer and
the PM) with NO approval, and ONE e-mail "N papers to review and sign" goes from the PM (mail-off / pause respected; no e-mail → office to-do).
Proposals, contracts, change orders and invoices keep their own flows (and their approvals). The CRM side is tools/docauto_tail.js."""
import sys
P = 'netlify/functions/portal-sign.js'
src = open(P, encoding='utf-8').read()
DONE = '/*DOCAUTO*/' in src
if DONE: print('already patched')
if not DONE:
    def rep(a, b):
        global src
        assert src.count(a) == 1, (src.count(a), a[:80]); src = src.replace(a, b)
    rep("""  if (made.mailed) return { status: 200, out: { ok: true, id: r.id, queued: false, mailed: true } };""",
    """  if (made.mailed) return { status: 200, out: { ok: true, id: r.id, queued: false, mailed: true } };
      if (body.direct === true && kind === 'doc') return { status: 200, out: { ok: true, id: r.id, direct: true, made: true } };   /*DOCAUTO*/""")
    rep("""async function listFor(pid){""",
    """/*DOCAUTO*/ async function requestMany(body, who){
      const pid = s(body.projectId); if (!ID_RE.test(pid)) return { status: 400, out: { ok: false, error: 'Open a job first.' } };
      const items = arr(body.items).slice(0, 30), made = [], had = [];
      for (const it of items) {
        if (!it || !refPath(it.docRef)) continue;
        const r = await request({ projectId: pid, kind: 'doc', refId: s(it.refId), title: it.title, docRef: it.docRef, docName: it.docName, note: clip(it.note, 300) || 'Please read it and sign that you got it.', direct: true }, who);
        if (r.out && r.out.made) made.push({ id: r.out.id, title: clip(it.title, 120) }); else if (r.out && r.out.ok) had.push(s(r.out.id)); else return { status: r.status, out: r.out };
      }
      if (!made.length) return { status: 200, out: { ok: true, made: 0, already: had.length } };
      const data = await jobData(true), p = core().findProject(data, pid), T = scrubber(p), pm = pmFull(data, p), to = custEmail(p);
      if (body.quiet === true) return { status: 200, out: { ok: true, made: made.length, mailed: false } };
      if (!okEmail(to)) {
        await core().officeTodo('portal_sign_many_' + pid + '_' + made[0].id, '✍️ ' + made.length + ' paper' + (made.length === 1 ? '' : 's') + ' to sign in ' + (s(p.client) || 'the customer') + '\\'s portal — ' + T(p.name), 'No customer e-mail on file. They wait in their GrayCo Portal (Home → ✍️ Papers to sign): ' + made.map(function(x){ return T(x.title); }).join(', ') + '. Call or text them the portal link.');
        return { status: 200, out: { ok: true, made: made.length, mailed: false, noEmail: true } };
      }
      const html = '<p>Hi ' + esc(firstName(p.client) || 'there') + ',</p><p>Your papers for <b>' + esc(T(p.name)) + '</b> are ready in your GrayCo Portal:</p><ul>' + made.map(function(x){ return '<li>' + esc(T(x.title)) + '</li>'; }).join('') + '</ul>' +
        '<p>Please read them and sign — it takes a minute, on your phone or computer. You get a copy of everything you sign.</p>' +
        '<p style="text-align:center;margin:22px 0"><a href="' + core().LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Review and sign</a></p>' +
        '<p style="font-size:13px;color:#55626F">Questions? Call ' + esc(pm ? pm.name : 'us') + (pm && pm.phone ? ' at ' + esc(pm.phone) : '') + ' or the office at ' + OFFICE_PHONE + '.</p>';
      const sent = await sendFromPm({ to: to, subject: (made.length === 1 ? 'Please review and sign: ' + T(made[0].title) : made.length + ' papers to review and sign'), html: html }, p, pm);
      return { status: 200, out: { ok: true, made: made.length, mailed: !!sent.ok, mailError: sent.ok ? '' : sent.error } };
    }
    async function listFor(pid){""")
    rep("""  if (action === 'request' || action === 'list' || action === 'void' || action === 'followups') {""",
    """  if (action === 'request' || action === 'request-many' || action === 'list' || action === 'void' || action === 'followups') {""")
    rep("""      if (action === 'request') { const r = await request(body, who); return reply(r.status, headers, r.out); }""",
    """      if (action === 'request') { const r = await request(body, who); return reply(r.status, headers, r.out); }
          if (action === 'request-many') { const r = await requestMany(body, who); return reply(r.status, headers, r.out); }   /*DOCAUTO*/""")
    rep("""exports._ps = { runFollowups: runFollowups,""", """exports._ps = { requestMany: requestMany, request: request, runFollowups: runFollowups,""")
    open(P, 'w', encoding='utf-8').write(src); print('patched')

# CRM part: append tools/docauto_tail.js to index.html
import os
P2 = 'index.html'
s2 = open(P2, encoding='utf-8').read()
if '__GC_PATCH_DOCAUTO__' in s2: print('index already patched')
else:
    t = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docauto_tail.js'), encoding='utf-8').read()
    open(P2, 'w', encoding='utf-8').write(s2.rstrip('\n') + '\n' + t); print('index patched')
