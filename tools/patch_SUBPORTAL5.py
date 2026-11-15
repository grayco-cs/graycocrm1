#!/usr/bin/env python3
"""patch SUBPORTAL5 (owner's sub portal plan, 11/15 list item 5.1 + 5.1b):
  SUBCONFIRM — 👷 Confirm subs on jobs (tools/subconfirm_tail.js): links the CRM already has (sub invoices, agreements, schedule) are
               offered once, never added by themselves; ✅ To-Do "👷 N subs to confirm" → 👷 Confirm them.
  SCOPEVER   — 🔄 scope versions (tools/scopever_tail.js + netlify/functions/_lib/scopediff.js): "Scope updated — what changed" on the
               next send to a sub (portal message / e-mail) and in the portal's scope card; "📝 Proposal changed — review <sub>'s
               scope?" To-Do when the estimate is saved after the scope was sent (never re-sent by itself).
Idempotent. Usage: python3 tools/patch_SUBPORTAL5.py [repo-root]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(here)
def edit(fn, pairs):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read(); n0 = src
    for o, n in pairs:
        if n in src: continue
        assert src.count(o) == 1, (fn, src.count(o), o[:90]); src = src.replace(o, n)
    if src != n0: open(p, 'w', encoding='utf-8').write(src)
SD = "(W._gcScopeDiff && W._gcScopeDiff.forSub ? W._gcScopeDiff.forSub(d, c.id) : '')"
edit('index.html', [
    # SCOPESEND sends: the change text on top, a small copy of what was sent on each send row
    ("function rec(c, via, ok, status, detail, extra){ var r = Object.assign({ id: uid('SND_'), at: nowIso(), by: myName(), byEmail: myEmail(), version: num(d.version), via: via, subId: s(c.id), subName: s(c.name), email: low(c.email), ok: !!ok, status: status, detail: s(detail).slice(0, 300) }, extra || {});",
     "function rec(c, via, ok, status, detail, extra){ var r = Object.assign({ id: uid('SND_'), at: nowIso(), by: myName(), byEmail: myEmail(), version: num(d.version), via: via, subId: s(c.id), subName: s(c.name), email: low(c.email), ok: !!ok, status: status, detail: s(detail).slice(0, 300) }, ok && W._gcScopeDiff && W._gcScopeDiff.compact ? { ls: W._gcScopeDiff.compact(d) } : {}, extra || {});   /* patch SCOPEVER: what was sent */"),
    ("return fn('send-email', { mode: 'personal', to: c.email, subject: subject, html: html, fromName: myName(),",
     "var chg = " + SD + ";   /* patch SCOPEVER */\n        return fn('send-email', { mode: 'personal', to: c.email, subject: subject, html: (chg ? '<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14202E;white-space:pre-wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px;margin-bottom:12px\">' + esc(chg) + '</div>' : '') + html, fromName: myName(),"),
    ("return fn('portal-access', { action: 's-send', projectId: pid, party: 's:' + c.id, text: strip(message).slice(0, 1500) + '\\n\\n' + scopeText(d), files: f ? [f] : [] }); })",
     "var chg = " + SD + "; return fn('portal-access', { action: 's-send', projectId: pid, party: 's:' + c.id, text: (chg ? chg + '\\n\\n' : '') + strip(message).slice(0, 1500) + '\\n\\n' + scopeText(d), files: f ? [f] : [] }); })   /* patch SCOPEVER */"),
    # the To-Do's one button for the new kinds
    ("      else if (t.kind === 'job_contact') o.act = { l: '📇 Fill them in', f: function(){ call('_gcJobContactSheet'); } };   /* JOBCONTACT */",
     "      else if (t.kind === 'job_contact') o.act = { l: '📇 Fill them in', f: function(){ call('_gcJobContactSheet'); } };   /* JOBCONTACT */\n"
     "      else if (t.kind === 'sub_confirm') o.act = { l: '👷 Confirm them', f: function(){ call('_gcSubConfirmSheet'); } };   /* SUBCONFIRM */\n"
     "      else if (t.kind === 'scope_review') o.act = { l: '📋 Open the scope', f: function(){ call('_gcScopeReviewOpen', id); } };   /* SCOPEVER */"),
])
edit('netlify/functions/portal-access.js', [
    ("    signedName: x.status === 'accepted' && d.signature && Number(d.signature.version) === Number(x.version) ? clip(d.signature.name, 80) : '' };\n}",
     "    signedName: x.status === 'accepted' && d.signature && Number(d.signature.version) === Number(x.version) ? clip(d.signature.name, 80) : '',\n"
     "    changes: scopeChanges(x) };   /* patch SCOPEVER */\n}\n"
     "/* patch SCOPEVER: what changed since the version the sub saw before (words only — a scope line has no price) */\n"
     "function scopeChanges(x){\n"
     "  try { const H = (Array.isArray(x.history) ? x.history : []).filter(function(h){ return h && Number(h.version) < Number(x.version) && h.data; }); const prev = H[H.length - 1]; if (!prev) return null;\n"
     "    const c = require('./_lib/scopediff.js').diff(prev.data, x.data || {}); if (!c.any) return null;\n"
     "    const cl = function(v){ return clip(SS().clean(v), 200); };\n"
     "    return { from: Number(prev.version), to: Number(x.version), added: c.added.map(cl), removed: c.removed.map(cl), changed: c.changed.map(cl), other: c.other.map(cl) };\n"
     "  } catch (e) { return null; }\n}"),
])
edit('portal-app.js', [
    ("    version: 'Version', date: 'Date',", "    scopeUpd: '🔄 Scope updated — what changed', chAdded: 'Added', chRemoved: 'Taken out', chChanged: 'Changed',\n    version: 'Version', date: 'Date',"),
    ("version: 'Versión'", "scopeUpd: '🔄 Alcance actualizado — qué cambió', chAdded: 'Agregado', chRemoved: 'Quitado', chChanged: 'Cambiado', version: 'Versión'"),
    ("    h('div', { class: 'muted', text: t('version') + ' ' + x.version + ' · ' + dt(x.date) + (x.start ? ' · ' + t('starts') + ' ' + dt(x.start) : '') })];\n",
     "    h('div', { class: 'muted', text: t('version') + ' ' + x.version + ' · ' + dt(x.date) + (x.start ? ' · ' + t('starts') + ' ' + dt(x.start) : '') })];\n"
     "  var xc = x.changes;   /* patch SCOPEVER: what changed since the version before */\n"
     "  if (xc && x.status !== 'accepted') kids.push(h('div', { class: 'box', 'data-scope-upd': '1' }, [h('b', { text: t('scopeUpd') + ' (v' + xc.from + ' → v' + xc.to + ')' })].concat(\n"
     "    (xc.added || []).map(function(v){ return h('div', { text: '+ ' + t('chAdded') + ': ' + v }); }), (xc.removed || []).map(function(v){ return h('div', { text: '− ' + t('chRemoved') + ': ' + v }); }),\n"
     "    (xc.changed || []).map(function(v){ return h('div', { text: '~ ' + t('chChanged') + ': ' + v }); }), (xc.other || []).map(function(v){ return h('div', { text: '~ ' + v }); }))));\n"),
])
P = os.path.join(R, 'index.html')
for tag, fn in [('subconfirm', 'subconfirm_tail.js'), ('scopever', 'scopever_tail.js')]:
    TAG = '<script id="gc-patch-' + tag + '">'
    js = open(os.path.join(here, fn), encoding='utf-8').read(); assert '</script' not in js.lower()
    src = open(P, encoding='utf-8').read()
    if TAG in src:
        i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
    else:
        src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
    open(P, 'w', encoding='utf-8').write(src)
print('SUBPORTAL5 applied')
