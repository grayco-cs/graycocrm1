#!/usr/bin/env python3
"""patch BARGEROOM (owner 11/9: "bidding.bargedesign.com/projects/public — use this planroom but only show us jobs within our range,
these look to be pretty far right now"): Barge Design Solutions' public plan room joins the morning bid watch (same planroom
software as RKA / MR — parseRka), as PRIME (engineered public works: the owner advertises). A source marked radius:true keeps only
projects within the Lead Inbox range (300 miles of Memphis + the Atlanta area — bid-inbox radiusGate); a place that cannot be
found is kept. Plain reader, no AI (robots.txt Content-Signal ai-input=no)."""
import sys
P = 'netlify/functions/bid-watch.js'
src = open(P, encoding='utf-8').read()
if '/*BARGEROOM*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
rep("""  /*MRPLANROOM*/ { id: 'mr-planroom',""", """  /*BARGEROOM*/ { id: 'barge-planroom', name: 'Barge Design Solutions — public plan room', label: 'Barge Design (public owner)', owner: '', city: '', state: '', type: 'government',
    auto: true, kind: 'rka', companyIs: 'owner', radius: true, url: 'https://bidding.bargedesign.com/projects/public', noAi: true },
  /*MRPLANROOM*/ { id: 'mr-planroom',""")
rep("""      const mine = seen[src.id] = seen[src.id] || {};
      items.forEach(it => {""", """      const mine = seen[src.id] = seen[src.id] || {};
      const from0 = records.length;   /* BARGEROOM */
      items.forEach(it => {""")
rep("""        records.push(toRecord(src, it, mw.hits));
      });""", """        records.push(toRecord(src, it, mw.hits));
      });
      /* BARGEROOM: only the jobs within range (300 mi of Memphis + the Atlanta area) */
      if (src.radius && records.length > from0) {
        const got = records.splice(from0);
        try { const g = { leads: [], dropped: [] }, rg = require('./bid-inbox.js')._test.radiusGate; for (let i = 0; i < got.length; i += 20) { const o = await rg(got.slice(i, i + 20).map(r => ({ city: r.city, state: r.state, project_name: r.title, _r: r })), settings); g.leads.push(...o.leads); g.dropped.push(...o.dropped); }
          g.leads.forEach(l => records.push(l._r)); st.tooFar = g.dropped.length; st.matched -= g.dropped.length; if (g.dropped.length) st.why = (st.why ? st.why + ' · ' : '') + g.dropped.length + ' too far away (' + g.dropped.map(d => d.where + ' ' + d.miles + ' mi').slice(0, 3).join(', ') + ')'; }
        catch (e) { got.forEach(r => records.push(r)); }
      }""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
