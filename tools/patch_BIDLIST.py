#!/usr/bin/env python3
"""patch BIDLIST (owner 11/5: subs "can see jobs they need to bid and jobs they have for sure and jobs they are on").
The sub portal's 📝 To bid card now lists the bid jobs the sub can bid on (invited, or open to every approved sub) from the
bid site (the CRM's 🏗 Bid portal tab): title, area, bid due date, trades wanted, and where they stand — Invited ·
Bid sent · ✅ Awarded · Not selected — with "Open & bid" to the bid site. Never another sub's bid or GrayCo's numbers."""
import sys, os
R = sys.argv[1] if len(sys.argv) > 1 else '.'
def patch(fn, pairs, mark):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read()
    if mark in src: print(fn, 'already patched'); return
    for o, n in pairs:
        assert src.count(o) == 1, (fn, src.count(o), o[:70]); src = src.replace(o, n)
    open(p, 'w', encoding='utf-8').write(src); print(fn, 'patched')
patch('netlify/functions/portal-access.js', [
 ("    if (p.approved === true) return { state: 'approved', url: bidsBase() };",
  "    if (p.approved === true) return { state: 'approved', url: bidsBase(), jobs: await bidJobsFor(p, sub) };   /* BIDLIST */"),
 ("async function bidsState(sub){",
  "/* BIDLIST: the bid jobs this approved sub can bid on (invited or public, open) + the ones they bid on, newest due first */\n"
  "async function bidJobsFor(p, sub){\n"
  "  try {\n"
  "    const H = require('./subportal.js')._hub, mail = low(p.email || sub.email);\n"
  "    const all = await Promise.all([H.listRows([H.eq('collection', 'jobs')]), mail ? H.listRows([H.eq('collection', 'invites'), H.eq('email', mail)]) : [], s(p.id) ? H.listRows([H.eq('collection', 'bids'), H.eq('user_id', s(p.id))]) : []]);\n"
  "    const inv = new Set(arr(all[1]).map(function(r){ return r.job_id; })), mine = {};\n"
  "    arr(all[2]).forEach(function(r){ mine[r.job_id] = r.data || {}; });\n"
  "    const out = [];\n"
  "    arr(all[0]).forEach(function(r){ const j = r.data || {}; const st = low(j.status);\n"
  "      if (j.draft === true || st === 'draft' || H.isGone(j)) return;\n"
  "      const open = ['closed', 'won', 'lost'].indexOf(st) < 0, canSee = (j.visibility || 'public') === 'public' || inv.has(r.id), b = mine[r.id];\n"
  "      if (!(canSee && open) && !b) return;\n"
  "      const bs = low(b && (b.status || b.result)), res = !b ? (inv.has(r.id) ? 'invited' : 'open') : /award|won|accept|select/.test(bs) && !/not/.test(bs) ? 'awarded' : (/lost|declin|reject|not/.test(bs) || (!open && st !== 'closed')) ? 'not-selected' : 'sent';\n"
  "      const parts = s(j.address).split(',').map(function(x){ return x.trim(); }).filter(Boolean);\n"
  "      out.push({ id: s(r.id), title: s(j.title) || 'Bid job', area: parts.slice(-2).join(', '), due: s(j.bidDueDate).slice(0, 10), trades: (Array.isArray(j.tradesSought) ? j.tradesSought : []).map(function(x){ return s(x && x.trade || x); }).filter(Boolean).slice(0, 6), state: res });\n"
  "    });\n"
  "    out.sort(function(a, b){ return (a.state === 'invited' ? 0 : 1) - (b.state === 'invited' ? 0 : 1) || s(a.due || '9').localeCompare(s(b.due || '9')); });\n"
  "    return out.slice(0, 40);\n"
  "  } catch (e) { return []; }\n"
  "}\nasync function bidsState(sub){"),
], 'BIDLIST')
patch('portal-app.js', [
 ("  else if (b.state === 'approved') kids.push(h('p', { class: 'muted', text: t('bidsApproved') }), h('a', { class: 'btn navy', href: b.url, target: '_blank', rel: 'noopener', text: t('bidsOpen') }));",
  "  else if (b.state === 'approved') {   /* BIDLIST: the jobs to bid */\n"
  "    var J = b.jobs || [], W2 = { invited: '📨 Invited', open: 'Open to bid', sent: '✓ Bid sent', awarded: '✅ Awarded', 'not-selected': 'Not selected' };\n"
  "    if (J.length) J.forEach(function(j){ kids.push(h('div', { class: 'post', 'data-bidjob': j.id }, [h('div', { class: 'row' }, [h('b', { text: j.title }), pill(W2[j.state] || j.state, j.state === 'awarded' || j.state === 'sent' ? 'ok' : j.state === 'invited' ? 'due' : '')]),\n"
  "      h('div', { class: 'muted', text: [j.area, j.due ? t('bidDue') + ' ' + dt(j.due) : '', (j.trades || []).join(', ')].filter(Boolean).join(' · ') }),\n"
  "      (j.state === 'invited' || j.state === 'open') ? h('a', { class: 'btn gold', href: b.url + '/?job=' + encodeURIComponent(j.id), target: '_blank', rel: 'noopener', text: t('bidOpenBid') }) : null])); });\n"
  "    else kids.push(h('p', { class: 'muted', text: t('bidsNone') }));\n"
  "    kids.push(h('a', { class: 'btn navy', href: b.url, target: '_blank', rel: 'noopener', text: t('bidsOpen') }));\n"
  "  }"),
 ("  return card(t('bidsTitle'), kids, 'bids');", "  return card(b.state === 'approved' ? t('toBid') : t('bidsTitle'), kids, 'bids');"),
 ("    toBid: '📝 To bid', jobsNow:", "    bidDue: 'Bid due', bidOpenBid: 'Open & bid', bidsNone: 'No jobs to bid right now — GrayCo invites you when one fits your trade.', toBid: '📝 To bid', jobsNow:"),
 ("    toBid: '📝 Para licitar', jobsNow:", "    bidDue: 'Fecha límite', bidOpenBid: 'Abrir y licitar', bidsNone: 'No hay trabajos para licitar ahora — GrayCo le invita cuando uno sea de su oficio.', toBid: '📝 Para licitar', jobsNow:"),
], 'BIDLIST')
