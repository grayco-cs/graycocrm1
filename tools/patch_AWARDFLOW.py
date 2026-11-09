#!/usr/bin/env python3
"""patch AWARDFLOW (owner's sub portal plan: "pick the winner → that sub sees Awarded; the other bidders see Not selected, no prices").
bid-hub award of a portal bid also marks the other portal bids on the same job + same trade notSelected (rejected, rejectedBy award:<id>);
Undo puts those back. The sub portal's To bid list reads accepted / rejected; the CRM bid table shows "Not selected"."""
import sys
def patch(P, pairs, marker):
    src = open(P, encoding='utf-8').read()
    if marker in src: print(P, 'already patched'); return
    for a, b in pairs:
        assert src.count(a) == 1, (P, src.count(a), a[:90]); src = src.replace(a, b)
    open(P, 'w', encoding='utf-8').write(src); print(P, 'patched')
patch('netlify/functions/bid-hub.js', [(
"""  const bid = Object.assign({}, row.data, on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email } : { accepted: false, acceptedAt: '' });
  await SP.upsertRows([SP.rowFor('bids', bid)], who.email);
  return { ok: true, awarded: on };""",
"""  const bid = Object.assign({}, row.data, on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email } : { accepted: false, acceptedAt: '' });
  /*AWARDFLOW: the other portal bids on this job in the same trade → Not selected (Undo puts them back) */
  const others = [];
  try {
    const tr = s(bid.trade).toLowerCase(), tag = 'award:' + id;
    (await SP.listRows([SP.eq('collection', 'bids'), SP.eq('job_id', row.job_id)])).forEach(function(r){ const o = r.data || {};
      if (!o.id || o.id === id || s(o.trade).toLowerCase() !== tr) return;
      if (on && !o.accepted && !o.rejected) others.push(Object.assign({}, o, { rejected: true, rejectedAt: at, rejectedBy: tag, notSelected: true }));
      if (!on && o.rejected && o.rejectedBy === tag) others.push(Object.assign({}, o, { rejected: false, rejectedAt: '', rejectedBy: '', notSelected: false }));
    });
  } catch (e) {}
  await SP.upsertRows([SP.rowFor('bids', bid)].concat(others.map(function(o){ return SP.rowFor('bids', o); })), who.email);
  return { ok: true, awarded: on, notSelected: on ? others.length : 0 };"""), (
"""awarded: !!b.accepted, scope: s(b.scope).slice(0, 600) };""",
"""awarded: !!b.accepted, notSelected: !b.accepted && !!b.rejected, scope: s(b.scope).slice(0, 600) };""")], '/*AWARDFLOW')
patch('netlify/functions/portal-access.js', [(
"""const bs = low(b && (b.status || b.result)), res = !b ? (inv.has(r.id) ? 'invited' : 'open') : /award|won|accept|select/.test(bs) && !/not/.test(bs) ? 'awarded'""",
"""const bs = low(b && (b.status || b.result)) /*AWARDFLOW*/ + (b && b.accepted ? ' accepted' : b && b.rejected ? ' rejected' : ''), res = !b ? (inv.has(r.id) ? 'invited' : 'open') : /award|won|accept|select/.test(bs) && !/not|reject/.test(bs) ? 'awarded'""")], '/*AWARDFLOW')
patch('index.html', [(
"""          : aw ? '<button type="button" class="b" data-sys="award" data-src="' + esc(b.source) + '" data-id="' + esc(b.id) + '" data-job="' + esc(jobId) + '">🏆 Mark awarded</button>' : '') + '</td></tr>';""",
"""          : (b.notSelected ? '<span class="mut">Not selected</span> ' : '') /*AWARDFLOW*/ + (aw ? '<button type="button" class="b" data-sys="award" data-src="' + esc(b.source) + '" data-id="' + esc(b.id) + '" data-job="' + esc(jobId) + '">🏆 Mark awarded</button>' : '')) + '</td></tr>';"""), (
"""    toast(on ? '🏆 Marked awarded' : 'Award taken off');""",
"""    toast(on ? '🏆 Marked awarded' + (arguments[0] && arguments[0].notSelected ? ' · ' + arguments[0].notSelected + ' other bid' + (arguments[0].notSelected === 1 ? '' : 's') + ' in this trade → Not selected' : '') : 'Award taken off');""")], '/*AWARDFLOW')
