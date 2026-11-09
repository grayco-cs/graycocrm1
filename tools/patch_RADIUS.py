#!/usr/bin/env python3
"""patch RADIUS (owner 11/9: "hotelprojectleads.com — I want these leads within 300 miles of Memphis").
bid-inbox.js bidPath: after the construction gate, every lead the AI read from an e-mail / pasted page / alert is kept only when its
city / state (or ZIP) is within settings.maxMiles of Memphis (default 300; 0 = no limit). Where a place is looked up once
(OpenStreetMap Nominatim, polite, cached in gc_kv "gc_geo_places"); a place that cannot be found is KEPT (never lost)."""
import sys
P = 'netlify/functions/bid-inbox.js'
src = open(P, encoding='utf-8').read()
if '/*RADIUS*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:70]); src = src.replace(a, b)
rep("""  if (ai.ok) { const g = noticeGate(ai, dbReady() ? await kvGet(KV_SET).catch(() => null) : null); if (g.dropped) { ai.leads = g.leads; if (!ai.leads.length) return { status: 200, body: { ok: true, ignored: 'not construction work', skipped: g.dropped } }; } }""",
"""  if (ai.ok) { const g = noticeGate(ai, dbReady() ? await kvGet(KV_SET).catch(() => null) : null); if (g.dropped) { ai.leads = g.leads; if (!ai.leads.length) return { status: 200, body: { ok: true, ignored: 'not construction work', skipped: g.dropped } }; } }
  /*RADIUS*/ if (ai.ok && ai.leads.length) { const rg = await radiusGate(ai.leads, dbReady() ? await kvGet(KV_SET).catch(() => null) : null); if (rg.dropped.length) { ai.leads = rg.leads; if (!ai.leads.length) return { status: 200, body: { ok: true, ignored: 'too far from Memphis', skipped: rg.dropped } }; } }""")
rep("""/*LEADPASTE*/ async function bidPath(mail, opts){""",
"""/* RADIUS: leads farther than settings.maxMiles (default 300) from Memphis are not made */
const MEM = [35.1495, -90.0490], KV_GEO = 'gc_geo_places';
function miles(a, b){ const R = 3958.8, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
async function placeOf(L, cache){
  const zip = s(L.zip).slice(0, 5), city = s(L.city).replace(/\\b(county|parish)\\b/i, '').trim(), st = s(L.state).toUpperCase().slice(0, 2);
  const key = /^\\d{5}$/.test(zip) ? 'z:' + zip : (city && /^[A-Z]{2}$/.test(st) ? 'c:' + low(city) + ',' + st : (/^[A-Z]{2}$/.test(st) ? '' : ''));
  if (!key) return null;
  if (cache[key] !== undefined) return cache[key];
  const q = key[0] === 'z' ? 'postalcode=' + zip : 'city=' + encodeURIComponent(city) + '&state=' + encodeURIComponent(st);
  try { const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 6000);
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&' + q, { headers: { 'User-Agent': 'GrayCoLeads/1.0 (+https://crm.grayco-cs.com; leads@grayco-cs.com)' }, signal: ac.signal }); clearTimeout(tm);
    const j = r.ok ? await r.json() : []; const p = Array.isArray(j) && j[0] ? [Number(j[0].lat), Number(j[0].lon)] : null;
    cache[key] = p && isFinite(p[0]) && isFinite(p[1]) ? p : null; cache.__new = true; return cache[key];
  } catch (e) { return null; }
}
async function radiusGate(leads, settings){
  const max = settings && settings.maxMiles != null && settings.maxMiles !== '' ? Number(settings.maxMiles) : 300;
  if (!(max > 0)) return { leads: leads, dropped: [] };
  let cache = {}; try { cache = Object.assign({}, (dbReady() && await kvGet(KV_GEO)) || {}); } catch (e) {}
  const keep = [], dropped = [];
  for (const L of arr(leads).slice(0, 20)) {
    const p = await placeOf(L, cache);
    if (!p) { keep.push(L); continue; }   /* where it is cannot be told: kept */
    const d = Math.round(miles(MEM, p));
    if (d > max) dropped.push({ title: s(L.project_name || L.title).slice(0, 120), where: [s(L.city), s(L.state)].filter(Boolean).join(', '), miles: d }); else { L.milesFromMemphis = d; keep.push(L); }
  }
  if (cache.__new) { delete cache.__new; try { if (dbReady()) await kvPut(KV_GEO, cache); } catch (e) {} }
  return { leads: keep, dropped: dropped };
}
/*LEADPASTE*/ async function bidPath(mail, opts){""")
rep("""  allBids: true,""", """  maxMiles: 300,   /* RADIUS (owner 11/9): leads within 300 miles of Memphis; 0 = no limit */
  allBids: true,""")
rep("exports._test = { bidPath,", "exports._test = { radiusGate, miles, bidPath,")
open(P, 'w', encoding='utf-8').write(src); print('patched')
