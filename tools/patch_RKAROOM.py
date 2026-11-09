#!/usr/bin/env python3
"""patch RKAROOM (owner 11/9: "https://www.rkaplanroom.build/projects/public"): RKA Construction's public plan room joins the
morning public bid watch. A plain reader (no AI — the site's robots.txt says Content-Signal ai-input=no; its "User-agent: *"
section allows reading) takes each project card: name, bid date, company (the GC), location, description, the project link.
Bidding Closed cards are skipped. Each item now carries its own city / state / GC (toRecord: item first, then the source)."""
import sys
P = 'netlify/functions/bid-watch.js'
src = open(P, encoding='utf-8').read()
if '/*RKAROOM*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
rep("""  { id: 'shelby-county', name: 'Shelby County Government — bid postings',""",
"""  /*RKAROOM*/ { id: 'rka-planroom', name: 'RKA Construction — public plan room', label: 'RKA plan room', owner: '', city: '', state: 'MS', type: 'commercial',
    auto: true, kind: 'rka', url: 'https://www.rkaplanroom.build/projects/public', noAi: true },
  { id: 'shelby-county', name: 'Shelby County Government — bid postings',""")
rep("""function parseCivicBids(html, base){""",
"""/* RKAROOM: rkaplanroom.build/projects/public — <a class="row" href=".../projects/<id>/details/<slug>"> … <div class="bid-date">11/18/26 2:00pm</div>
   … <div class="name">Name</div> … <div class="company">GC</div> <div class="location">City, ST</div> <div class="description">…</div></a> */
function parseRka(html, base){
  const H = String(html || ''), out = [], seen = {};
  const re = /<a\\b[^>]*class=["'][^"']*\\brow\\b[^"']*["'][^>]*href=["']([^"']*\\/projects\\/(\\d+)\\/details\\/[^"']*)["'][^>]*>([\\s\\S]*?)<\\/a>/gi; let m;
  const pick = (blk, cls) => { const r = new RegExp('<div[^>]*class=["\\'][^"\\']*\\\\b' + cls + '\\\\b[^"\\']*["\\'][^>]*>([\\\\s\\\\S]*?)<\\\\/div>', 'i').exec(blk); return r ? htmlToText(r[1].replace(/<svg[\\s\\S]*?<\\/svg>/gi, '')).replace(/\\s+/g, ' ').trim() : ''; };
  while ((m = re.exec(H))) {
    const id = m[2], blk = m[3]; if (seen[id]) continue; seen[id] = 1;
    const name = pick(blk, 'name'); if (!name) continue;
    if (/bidding\\s+closed/i.test(blk.replace(/<[^>]+>/g, ' '))) continue;
    const bd = pick(blk, 'bid-date'), dm = /(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})/.exec(bd);
    const due = dm ? (dm[3].length === 2 ? '20' + dm[3] : dm[3]) + '-' + ('0' + dm[1]).slice(-2) + '-' + ('0' + dm[2]).slice(-2) : '';
    const loc = pick(blk, 'location'), lm = /([^,]+),\\s*([A-Z]{2}|Mississippi|Tennessee|Arkansas|Alabama)\\s*$/i.exec(loc);
    const ST = { mississippi: 'MS', tennessee: 'TN', arkansas: 'AR', alabama: 'AL' };
    out.push({ id: 'rka' + id, title: name.slice(0, 180), number: '', due: due, url: absUrl(m[1], base), context: (pick(blk, 'description') + ' — ' + loc).slice(0, 600), status: '',
      city: lm ? s(lm[1]).replace(/^the university of mississippi$/i, 'Oxford') : '', state: lm ? (ST[low(lm[2])] || s(lm[2]).toUpperCase()) : '', gc: pick(blk, 'company') });
  }
  return out;
}
function parseCivicBids(html, base){""")
rep("""src.kind === 'civic' ? parseCivicBids(page.text, src.url) :""", """src.kind === 'civic' ? parseCivicBids(page.text, src.url) : src.kind === 'rka' ? parseRka(page.text, src.url) :""")
rep("""    owner: src.owner || '', gc: '', address: '', city: src.city || '', state: src.state || '',""",
"""    owner: src.owner || '', gc: it.gc || '', address: '', city: it.city || src.city || '', state: it.state || src.state || '',""")
rep("""    id: itemId('watch|' + src.id + '|' + it.id), title: it.title, source: src.label, sourceKind: 'public_bid', sourceRef: src.name, type: 'government',""",
"""    id: itemId('watch|' + src.id + '|' + it.id), title: it.title, source: src.label, sourceKind: 'public_bid', sourceRef: src.name, type: src.type || 'government',""")
rep("exports._test = { BF,", "exports._test = { parseRka, BF,")
open(P, 'w', encoding='utf-8').write(src); print('patched')

# + LEADPASTE honors robots.txt: Content-Signal ai-input=no (or Disallow: / for everyone) → the page is not fetched for the AI (edited in bid-inbox.js 11/9)
