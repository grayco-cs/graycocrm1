#!/usr/bin/env python3
"""Idempotent patch DUENAG: the "missing due info" e-mail — only for new bids, once per bid, in the morning, in plain words
(owner 10/27: a 10 PM e-mail "⚠ Missing due info: VMF Refurb- 210 E Vine St., Paragould, Ar — add the bid due date and
who it is due to" about an OLD BuildingConnected bid, right after he assigned leads to himself).

netlify/functions/_lib/bid-alerts.js nag():
  * only bids received in the last 30 days; never an archived / merged / lost / closed one (closed() as before);
  * ONE such e-mail per bid, ever (state key "nagLead|<lead>"): assigning it again does not send it again;
  * only in the morning digest: Monday–Friday from 7:00 to 11:00 AM Central (no evening / weekend e-mail);
  * worded plainly: "This bid has no due date yet: VMF Refurb (invited by JC Curtis Construction on BuildingConnected).
    Add the due date on the lead, or archive it if you're not bidding."
Usage: python3 tools/patch_DUENAG.py [repo dir]
"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
P = os.path.join(root, 'netlify', 'functions', '_lib', 'bid-alerts.js')
src = open(P, encoding='utf-8').read()
MARK = '/* patch DUENAG'
if MARK in src:
    print('DUENAG: already patched'); sys.exit(0)
a0 = src.index('  async function nag(src, t){')
a1 = src.index('  /* ── "Assigned to you"', a0)
NEW = """  async function nag(src, t){
    """ + MARK + """: the morning digest only (Mon–Fri 7–11 AM Central), bids received in the last 30 days, once per bid ever */
    const w = BD.epochToWall(t), hm = w.slice(11, 16), wd = new Date(w.slice(0, 10) + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6 || hm < NAG_FROM || hm >= NAG_TO) return { sent: 0, notNow: true };
    const by = {};
    arr(src.leads).forEach(l => {
      if (!l || !l.id || closed(l) || l.archived || l.mergedInto || l.expired) return;
      if (!(l.dueUnknown || (isBid(l) && missingDue(l)))) return;
      const got = Date.parse(s(l.receivedAt || l.inboxAt || l.createdAt || l.created || l.dateAdded || l.date)) || 0;
      if (!got || t - got > NAG_MAX_AGE_D * 864e5) return;
      const x = entry(Object.assign({}, l, { key: l.id, title: l.name || l.title, type: l.leadKind || l.type }));
      if (!x.assigneeEmail) return;
      (by[x.assigneeEmail] = by[x.assigneeEmail] || []).push(x);
    });
    const people = Object.keys(by); if (!people.length) return { sent: 0 };
    let todo = {};
    await kvCas(KA, v => { const st = loadState(v); let any = false; todo = {};
      people.forEach(e => { const fresh = by[e].filter(x => !st.reminded['nagLead|' + x.key]); if (!fresh.length) return; fresh.forEach(x => { st.reminded['nagLead|' + x.key] = nowIso(); }); todo[e] = fresh; any = true; });
      return any ? st : undefined; });
    let sent = 0;
    for (const e of Object.keys(todo)) {
      const list = todo[e], n = list.length;
      const line = x => x.title + (x.gc || x.source ? ' (' + (x.gc ? 'invited by ' + x.gc : '') + (x.gc && x.source ? ' on ' : '') + (x.source ? (x.gc ? '' : 'from ') + x.source : '') + ')' : '');
      const subject = n === 1 ? 'This bid has no due date yet: ' + list[0].title : n + ' new bids have no due date yet';
      const html = frame('GrayCo — bids with no due date yet', (n === 1 ? 'This bid has no due date yet: <b>' + esc(line(list[0])) + '</b>.' : 'These new bids have no due date yet.') + ' Add the due date on the lead, or archive it if you\\'re not bidding. (You get this once per bid.)', list.map(rowHtml).join(''), FOOT);
      const r = await deliver({ subject, html, text: subject + '\\n\\n' + list.map(x => '- ' + line(x)).join('\\n') + '\\n\\nAdd the due date on the lead, or archive it if you\\'re not bidding.\\n' + site() + '/#leads',
        push: { title: subject.slice(0, 100), body: list.slice(0, 3).map(x => x.title).join('\\n').slice(0, 180), tag: 'lead-nag-' + e } }, null, [e]);
      if (r.ok) sent++; else await kvCas(KA, v => { const st = loadState(v); list.forEach(x => { delete st.reminded['nagLead|' + x.key]; }); return st; }).catch(() => {});
    }
    return { sent, people: people.length };
  }

"""
src = src[:a0] + NEW + src[a1:]
old = "const RETRY_H = 24, REMIND_EARLY = 50, REMIND_LATE = 70, TODAY_AT = '08:00';"
assert src.count(old) == 1
src = src.replace(old, old + "\nconst NAG_FROM = '07:00', NAG_TO = '11:00', NAG_MAX_AGE_D = 30;   /* patch DUENAG */")
open(P, 'w', encoding='utf-8').write(src)
print('DUENAG: patched', P)
