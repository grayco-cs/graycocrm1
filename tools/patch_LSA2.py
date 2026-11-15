#!/usr/bin/env python3
"""patch LSA2 (owner's 11/15 list, item 4): LSACOUNT (pending / bad Google LSA leads out of the lead counts and the weekly report),
LSANUDGE (24-hour PM To-Do), LSADISPUTE2 (2 days before the 30-day dispute line + ✓ Disputed in Ads), LSAPANEL (📊 LSA by month),
LSADEDUPE (website-intake: the same LSA lead again — same Google lead id or same phone within 30 days — is added to the first one).
The CRM block is tools/lsa2_tail.js. Idempotent. Usage: python3 tools/patch_LSA2.py [repo-root]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(here)
def edit(fn, pairs):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read(); n0 = src
    for o, n in pairs:
        if n in src: continue
        assert src.count(o) == 1, (fn, src.count(o), o[:90]); src = src.replace(o, n)
    if src != n0: open(p, 'w', encoding='utf-8').write(src)
PEND = "(window._gcLsaPend && window._gcLsaPend(l))"
edit('index.html', [
    # Leads hub: New today · this week
    ("var today = all.filter(function(l){ return born(l) >= day0.getTime(); }).length, week = all.filter(function(l){ return born(l) >= wk; }).length;",
     "var today = all.filter(function(l){ return born(l) >= day0.getTime() && !" + PEND + "; }).length, week = all.filter(function(l){ return born(l) >= wk && !" + PEND + "; }).length;   /* patch LSA2: an LSA lead counts once it is good */"),
    # TV / Field / office TV scorecard numbers
    ("var L = leads().filter(function(l){ return l && l.id && !l.deleted && (all || tvMineLead(l, sc)); });",
     "var L = leads().filter(function(l){ return l && l.id && !l.deleted && !" + PEND + " && (all || tvMineLead(l, sc)); });   /* patch LSA2 */"),
    ("L.forEach(function(l){ var t = tvLeadT(l); if (isFinite(t) && t >= wk && !/quickbooks|import/i.test(String(l.source || l.leadSource || ''))) { wkN++;",
     "L.forEach(function(l){ var t = tvLeadT(l); if (isFinite(t) && t >= wk && !" + PEND + " && !/quickbooks|import/i.test(String(l.source || l.leadSource || ''))) { wkN++;   /* patch LSA2 */"),
    ("if (inP(c, P) && !/quickbooks|import/i.test(s(l.source || l.leadSource))) newL++;",
     "if (inP(c, P) && !" + PEND + " && !/quickbooks|import/i.test(s(l.source || l.leadSource))) newL++;   /* patch LSA2 */"),
])
# the weekly report e-mail
edit('netlify/functions/scheduled-reports.js', [
    ("  const newLeads = leads.filter(function(l){return (l.date||l.created||'') >= weekAgoStr;});",
     "  /* patch LSA2: a Google LSA lead counts once it is good (pending / bad ones are left out) */\n"
     "  const lsaPend = function(l){ const ex = (l && l.leadExtra) || {}, c = String(l.lsaCheck || ex.lsaCheck || ''); const lsa = !!c || /google\\s*lsa|local\\s*services/i.test([l.source, l.leadSource, ex.leadSource].join(' ')); return lsa && c !== 'good' && !/won|convert|job/i.test(String(l.stage || '') + ' ' + String(l.status || '')) && !l.projectId; };\n"
     "  const newLeads = leads.filter(function(l){return (l.date||l.created||'') >= weekAgoStr && !lsaPend(l);});")])
# LSADEDUPE
edit('netlify/functions/website-intake.js', [
    ("if (r2 !== rec) rec.companyId = 'mitigation'; const o = L().upsert(arr(v), r2); action = o.action; return o.items; });",
     "if (r2 !== rec) rec.companyId = 'mitigation'; if (!have) { const dup = lsaDupOf(arr(v), rec, id); if (dup) { lsaFold(dup, rec, at); action = 'merged'; dupOf = dup; return arr(v); } }   /* patch LSA2: LSADEDUPE */ const o = L().upsert(arr(v), r2); action = o.action; return o.items; });\n"
     "  if (dupOf) return { id: dupOf.id, rec: dupOf, action, customer: cust, mergedFrom: id };   /* patch LSA2 */"),
    ("  let action = '';\n  await L().kvCas(L().KV, v => { const have",
     "  let action = '', dupOf = null;   /* patch LSA2 */\n  await L().kvCas(L().KV, v => { const have"),
    ("async function fileLead(f, extra){",
     "/* patch LSA2 — LSADEDUPE (owner 11/15): the same Google LSA lead again (Google sends a new-lead e-mail, then a message / call e-mail\n"
     "   for the same person) is ONE lead: the same LSA lead id (from Google's link) or the same phone within 30 days, still open → the\n"
     "   new e-mail's words are added to the first one as a 🔁 note (leadExtra.lsaRepeats counts them) and no second lead is made. */\n"
     "function lsaOf(r){ const ex = (r && r.leadExtra) || {}; return /google\\s*lsa|local\\s*services/i.test([r && r.source, ex.leadSource, ex.mkSource === 'Google LSA' ? 'google lsa' : ''].join(' ')) || !!ex.lsaCheck; }\n"
     "function lsaIdOf(u){ u = s(u); const m = /\\/(?:lead|leads|message)s?\\/([A-Za-z0-9_-]{6,})/.exec(u) || /[?&](?:lead_?id|leadId|lid)=([A-Za-z0-9_-]{6,})/.exec(u); return m ? m[1] : ''; }\n"
     "function lsaDupOf(list, rec, id){\n"
     "  if (!lsaOf(rec)) return null;\n"
     "  const ph = phone10((rec.contact || {}).phone), lid = lsaIdOf((rec.leadExtra || {}).lsaLink), now = Date.now();\n"
     "  if (ph.length !== 10 && !lid) return null;\n"
     "  return list.find(x => { if (!x || String(x.id) === String(id) || !lsaOf(x) || x.deleted || x.dismissed || x.mergedInto) return false;\n"
     "    const t = Date.parse((x.leadExtra || {}).receivedAt || x.receivedAt || x.created || x.createdAt || ''); if (isFinite(t) && now - t > 30 * 864e5) return false;\n"
     "    const xl = lsaIdOf((x.leadExtra || {}).lsaLink); if (lid && xl) return xl === lid;\n"
     "    return ph.length === 10 && phone10((x.contact || {}).phone) === ph; }) || null;\n"
     "}\n"
     "function lsaFold(x, rec, at){\n"
     "  const ex = Object.assign({}, x.leadExtra || {}), rx = rec.leadExtra || {};\n"
     "  ex.lsaRepeats = (+ex.lsaRepeats || 0) + 1; if (!s(ex.lsaLink) && s(rx.lsaLink)) ex.lsaLink = rx.lsaLink; if (rx.lsaCall && !ex.lsaCall) ex.lsaCall = true; x.leadExtra = ex;\n"
     "  const said = clip(s(rec.scope), 300); x.notes = arr(x.notes).concat(['🔁 Same Google LSA lead again, ' + at.slice(0, 16).replace('T', ' ') + ' UTC' + (said ? ': ' + said : '') + '.']).slice(-60);\n"
     "  if (!s((x.contact || {}).phone) && s((rec.contact || {}).phone)) x.contact = Object.assign({}, x.contact || {}, { phone: rec.contact.phone });\n"
     "  x.updatedAt = at;\n"
     "}\n"
     "async function fileLead(f, extra){"),
])
P = os.path.join(R, 'index.html'); TAG = '<script id="gc-patch-lsa2">'
js = open(os.path.join(here, 'lsa2_tail.js'), encoding='utf-8').read(); assert '</script' not in js.lower()
src = open(P, encoding='utf-8').read()
if TAG in src:
    i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
else:
    src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
open(P, 'w', encoding='utf-8').write(src); print('LSA2 applied')
