#!/usr/bin/env python3
"""patch DOCAUTO2, server (owner 11/9: "if they don't have portal we can email these documents … asbestos, lead, mold documents
are a must"): request-many with attach:true puts the papers' PDFs on the ONE e-mail as attachments (up to 30 MB in all; a paper
too big rides as its portal link only), so the customer has them in hand even without opening the portal."""
import sys
P = 'netlify/functions/portal-sign.js'
src = open(P, encoding='utf-8').read()
if '/*DOCAUTO2*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
rep("""    if (r.out && r.out.made) made.push({ id: r.out.id, title: clip(it.title, 120) });""",
"""    if (r.out && r.out.made) made.push({ id: r.out.id, title: clip(it.title, 120), docRef: s(it.docRef), docName: clip(it.docName, 120) });""")
rep("""  const sent = await sendFromPm({ to: to, subject: (made.length === 1 ? 'Please review and sign: ' + T(made[0].title) : made.length + ' papers to review and sign'), html: html }, p, pm);""",
"""  /*DOCAUTO2*/ let atts = [];
  if (body.attach === true) { let tot = 0;
    for (const m of made) { try { const path = refPath(m.docRef); if (!path) continue;
      const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { headers: keyHeaders(svcKey()) }); if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer()); if (tot + b.length > 30 * 1048576) continue; tot += b.length;
      atts.push({ filename: (clip(m.docName || m.title, 110) || 'paper').replace(/[^\\w .()#-]+/g, '-') + (/\\.pdf$/i.test(m.docName) ? '' : '.pdf'), content: b.toString('base64') }); } catch (e) {} } }
  const sent = await sendFromPm({ to: to, subject: (made.length === 1 ? 'Please review and sign: ' + T(made[0].title) : made.length + ' papers to review and sign'), html: html + (atts.length ? '<p style="font-size:13px;color:#55626F">' + (atts.length === 1 ? 'A copy is attached' : 'Copies are attached') + ' to this e-mail too.</p>' : ''), attachments: atts }, p, pm);""")
rep("""  if (Array.isArray(item.cc) && item.cc.length) payload.cc = item.cc.slice(0, 5);""",
"""  if (Array.isArray(item.cc) && item.cc.length) payload.cc = item.cc.slice(0, 5);
  if (Array.isArray(item.attachments) && item.attachments.length) payload.attachments = item.attachments.slice(0, 10);   /* DOCAUTO2 */""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
