#!/usr/bin/env python3
"""patch MAINTSETTINGS — Maintenance → 📦 Plans & prices becomes the ONE "Plans & offers" editor (owner 11/03: "Make sure on the
Maintenance tab we can change how we do all our plans, offers, discounts etc. for ads, portal, whatever." "We can do a 10%
discount on yearly payments at one time. Our goal for maintenance is to do the jobs at 60% margins on the services/work other
than the inspections/maintenance.")

Adds to the existing card (same settings store, gc_kv "gc_maint_plans" via maint-tab settings-set; nothing is sent):
  · per tier: extra service calls a year, the perk / note line (the Gold drawing), the card's bullet list, ⭐ most popular
  · "Paid once a year: save [10] %" and an optional yearly price per tier (else 12 × monthly less that discount)
  · the target margin for repair / service work found on plan visits (60%; inspections and plan visits excluded):
    price = cost ÷ (1 − margin), then the member's repair discount — with the margin left after each tier's discount
  · where the offers / promos live (the Lobby TV offers and the coupons — not duplicated here) and who reads these settings
  · "last changed by … at …"
Idempotent: run it again and nothing changes. Usage: python3 tools/patch_MAINTSETTINGS.py [index.html]"""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'index.html')
t = open(path, encoding='utf-8').read()
MARK = 'patch MAINTSETTINGS'
if MARK in t:
    print('MAINTSETTINGS: already patched'); sys.exit(0)

A = """<b>Membership tiers</b>' + ['bronze', 'silver', 'gold'].map(function(t){ var x = (st.tiers || {})[t] || {}; return '<div class="row">🏅 <b style="width:60px">' + tierName(t) + '</b><label>Repair discount % <input type="number" data-tierd="' + t + '" value="' + esc(x.discount) + '" style="width:70px"' + dis + '></label><input data-tierv="' + t + '" value="' + esc(x.visits) + '" style="flex:1;min-width:200px"' + dis + '>' + (x.note ? '<span class="tag">' + esc(x.note) + '</span>' : '') + '</div>'; }).join('') +"""
A2 = """<b>Membership tiers</b> <span class="mut">(Plans &amp; offers — the customer portal, the lobby TV, the pamphlets and the outreach read these; last changed ' + (st.changedAt ? esc(s(st.changedBy) || '—') + ', ' + esc(s(st.changedAt).slice(0, 16).replace('T', ' ')) : 'never') + ')</span>' + ['bronze', 'silver', 'gold'].map(function(t){ var x = (st.tiers || {})[t] || {};   /* patch MAINTSETTINGS */
      return '<div class="card" style="margin:6px 0;padding:8px"><div class="row">🏅 <b style="width:60px">' + tierName(t) + '</b><label>Repair discount % <input type="number" data-tierd="' + t + '" value="' + esc(x.discount) + '" style="width:70px"' + dis + '></label>' +
        '<label>Extra service calls / yr <input type="number" min="0" max="12" data-tierx="' + t + '" value="' + esc(x.extraCalls != null ? x.extraCalls : '') + '" style="width:60px"' + dis + '></label>' +
        '<label><input type="radio" name="gcms-pop" data-tierpop="' + t + '"' + ((st.popularTier || 'silver') === t ? ' checked' : '') + dis + '> ⭐ Most popular</label></div>' +
        '<div class="row"><label style="flex:1">Plan visits line <input data-tierv="' + t + '" value="' + esc(x.visits) + '" style="width:100%"' + dis + '></label><label style="flex:1">Perk / note <input data-tiern="' + t + '" value="' + esc(x.note || '') + '" style="width:100%"' + dis + '></label></div>' +
        '<label>The card\\u2019s bullets (one per line; empty = the standard lines)<textarea data-tierb="' + t + '" rows="2" style="width:100%"' + dis + '>' + esc(arr(x.bullets).join('\\n')) + '</textarea></label></div>'; }).join('') +
    (function(){ var m = st.repairMargin != null ? +st.repairMargin : 60, d = st.yearlyDiscount != null ? +st.yearlyDiscount : 10, af = function(dc){ var r = 1 - (1 - m / 100) / (1 - dc / 100); return Math.round(r * 1000) / 10; };
      return '<div class="card" style="margin:6px 0;padding:8px"><b>Paying once a year</b><div class="row"><label>Save <input type="number" min="0" max="50" data-yrdisc="1" value="' + esc(d) + '" style="width:60px"' + dis + '> %</label><span class="mut">Yearly = 12 × monthly less this, unless a yearly price is set below.</span></div>' +
        ['residential', 'commercial'].map(function(mk){ return '<div class="row">' + (mk === 'commercial' ? '🏢 per building' : '🏠 per home') + ' yearly (optional)' + ['bronze', 'silver', 'gold'].map(function(tt){ var mo = +(((st.monthly || {})[mk] || {})[tt]) || 0, set = ((st.yearly || {})[mk] || {})[tt]; return '<label>' + tierName(tt) + ' $ <input type="number" data-yr="' + mk + ':' + tt + '" value="' + esc(set != null ? set : '') + '" placeholder="' + (Math.round(mo * 12 * (100 - d)) / 100) + '" style="width:90px"' + dis + '></label>'; }).join('') + '</div>'; }).join('') +
        '<b>Repairs &amp; service work found on plan visits</b><div class="row"><label>Target margin <input type="number" min="0" max="90" data-rmargin="1" value="' + esc(m) + '" style="width:60px"' + dis + '> %</label><span class="mut">Inspections and plan visits are not priced this way. Price = cost ÷ (1 − margin), then the member\\u2019s repair discount.</span></div>' +
        '<div class="mut">A $100 cost → $' + (Math.round(100 / (1 - m / 100) * 100) / 100) + ' · after the discount: ' + ['bronze', 'silver', 'gold'].map(function(tt){ var dc = +(((st.tiers || {})[tt] || {}).discount) || 0; return tierName(tt) + ' ' + (dc ? '−' + dc + '% → ' + af(dc) + '% margin' : af(0) + '% margin'); }).join(' · ') + '</div>' +
        '<b>Offers &amp; promos</b><div class="mut">The offers live where they are shown — 📺 Office TV → Lobby offers (on / approved / end date) and 📣 Marketing → Coupons — so nothing is kept twice. These plan prices, discounts and tiers are what the customer portal (GrayCo Care), the lobby TV, the pamphlets and the outreach e-mails read.</div></div>'; })() +"""
B = """  var tiers = {}; ['bronze', 'silver', 'gold'].forEach(function(t){ tiers[t] = { discount: num(q('[data-tierd="' + t + '"]').value), visits: s(q('[data-tierv="' + t + '"]').value) }; });"""
B2 = """  var tiers = {}; ['bronze', 'silver', 'gold'].forEach(function(t){ var qx = q('[data-tierx="' + t + '"]'), qn = q('[data-tiern="' + t + '"]'), qb = q('[data-tierb="' + t + '"]');   /* patch MAINTSETTINGS */
    tiers[t] = { discount: num(q('[data-tierd="' + t + '"]').value), visits: s(q('[data-tierv="' + t + '"]').value), extraCalls: qx && s(qx.value) !== '' ? num(qx.value) : undefined, note: qn ? s(qn.value) : undefined, bullets: qb ? s(qb.value).split(/\\n+/).map(s).filter(Boolean) : undefined }; });
  var yearly = { residential: {}, commercial: {} }; Array.prototype.forEach.call(el.querySelectorAll('[data-yr]'), function(x){ var k = x.getAttribute('data-yr').split(':'); if (s(x.value) !== '') yearly[k[0]][k[1]] = num(x.value); });
  var popEl = el.querySelector('[data-tierpop]:checked'), ydEl = q('[data-yrdisc]'), rmEl = q('[data-rmargin]');"""
C = """monthly: monthly, areaDays: areaDays, handymanTasks: handymanTasks } })"""
C2 = """monthly: monthly, areaDays: areaDays, handymanTasks: handymanTasks, yearly: yearly, yearlyDiscount: ydEl ? num(ydEl.value) : undefined, repairMargin: rmEl ? num(rmEl.value) : undefined, popularTier: popEl ? popEl.getAttribute('data-tierpop') : undefined } })"""
for old, new in ((A, A2), (B, B2), (C, C2)):
    if t.count(old) != 1:
        print('MAINTSETTINGS: anchor found %d times: %s' % (t.count(old), old[:90])); sys.exit(1)
    t = t.replace(old, new)
open(path, 'w', encoding='utf-8').write(t)
print('MAINTSETTINGS: applied')
