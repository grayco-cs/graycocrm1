#!/usr/bin/env python3
"""patch LEADPASTE, server (owner 11/9: "want to be able to add websites or emails into leads where it scrubs and enters into crm
as a lead"; "we have emails from estimating@summitgc.net that we want in our leads too").
bid-inbox.js: the bid path of an inbound e-mail (AI read → construction gate → records → merge → portal draft + alert) becomes
bidPath(mail, opts), and POST ?pastelead=1 { text | url, kind: 'bid' | 'customer' } (signed-in staff) runs a pasted e-mail or a
web page through it — the same reading, merging (one lead per project) and alerts as mail to leads@. kind 'customer' → the
homeowner path (website-intake.fromEmail)."""
import sys
P = 'netlify/functions/bid-inbox.js'
src = open(P, encoding='utf-8').read()
if '/*LEADPASTE*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
rep("""  const links = linksOf(mail), hint = sourceHint(mail, links);
  const ai = await extract(mail, links, hint, opts.inline ? 18000 : 0);""",
"""  return bidPath(mail, opts);
}
/*LEADPASTE*/ async function bidPath(mail, opts){
  opts = opts || {};
  const links = linksOf(mail), hint = sourceHint(mail, links);
  const ai = await extract(mail, links, hint, opts.inline ? 18000 : 0);""")
rep("""  /* patch MAILFIX: 📬 Mail received — the last 50 e-mails""",
"""  /*LEADPASTE*/ if (qs.pastelead && event.httpMethod === 'POST') {
    const who = await staffAuth(event); if (!who.ok) return J(who.code, { error: who.error }, C);
    if (!dbReady()) return J(500, { error: 'Supabase is not configured on Netlify.' }, C);
    let b = {}; try { b = JSON.parse(rawBody(event) || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }, C); }
    let text = s(b.text).slice(0, 40000), url = s(b.url), html = '', title = '';
    if (!text && !url) return J(400, { error: 'Paste an e-mail or a web address.' }, C);
    if (url) {
      if (!/^https?:\\/\\/[^\\s"'<>]{4,500}$/i.test(url)) return J(400, { error: 'That web address does not look right.' }, C);
      try { const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 12000);
        const r = await fetch(url, { headers: { 'User-Agent': 'GrayCoLeads/1.0 (+https://crm.grayco-cs.com)', Accept: 'text/html,text/plain,*/*' }, signal: ac.signal, redirect: 'follow' }); clearTimeout(tm);
        if (!r.ok) return J(200, { ok: false, error: 'The page answered ' + r.status + ' — it may need a sign-in. Copy its text and paste it instead.' }, C);
        html = (await r.text()).slice(0, 600000); const tt = /<title[^>]*>([\\s\\S]*?)<\\/title>/i.exec(html); title = tt ? s(decodeEntities(tt[1])).slice(0, 160) : '';
        text = (htmlToText(html) + (text ? '\\n\\n' + text : '')).slice(0, 40000);
      } catch (e) { return J(200, { ok: false, error: 'Could not open that page (' + s(e && e.message).slice(0, 80) + '). Copy its text and paste it instead.' }, C); }
    }
    const hf = /^\\s*From:\\s*(.+)$/mi.exec(text), hs = /^\\s*Subject:\\s*(.+)$/mi.exec(text);
    const from = hf ? addr(hf[1]) : { email: '', name: '' };
    const first = s(text.split(/\\n/).find(l => s(l).length > 3) || '').slice(0, 140);
    const mail = { id: 'paste_' + sha256((url || '') + text).slice(0, 20), from: from.email ? from : { email: 'pasted@leads.grayco-cs.com', name: s(who.name) || 'Pasted by GrayCo' },
      to: [], cc: [], subject: s(hs ? hs[1] : (title || first || 'Pasted lead')).slice(0, 200), text: text + (url ? '\\n\\nSource: ' + url : ''), html: html.slice(0, 400000),
      date: nowIso(), files: [], skipped: [], headers: {}, messageId: '' };
    try {
      if (s(b.kind) === 'customer') { const r = await require('./website-intake.js').fromEmail(mail); return J(200, Object.assign({ ok: true, inbox: 'leads', pasted: true }, r), C); }
      const r = await bidPath(mail, { inline: true });
      return J(r.status === 200 ? 200 : r.status, Object.assign({ pasted: true }, r.body), C);
    } catch (e) { return J(502, { error: 'Could not read it just now (' + s(e && e.message).slice(0, 120) + ') — try again.' }, C); }
  }

  /* patch MAILFIX: 📬 Mail received — the last 50 e-mails""")
rep("exports._test = { noticeGate,", "exports._test = { bidPath, noticeGate,")
open(P, 'w', encoding='utf-8').write(src); print('patched')
