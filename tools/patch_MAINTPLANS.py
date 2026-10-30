#!/usr/bin/env python3
"""Idempotent patch MAINTPLANS — more maintenance plans, several per home, all in the customer portal.

Owner 10/30 (phone, 🛠 Maintenance on a job showed ONE plan): "I should have more maintenance plans I can choose and when
I choose it shows up on customer portal".

1. 🛠 Maintenance on a job (desktop and Field — the same window): EVERY offered plan in the catalog is listed with a
   checkbox, how often (once / twice a year) and the yearly price for this home, pre-filled from the plan's usual price
   (it can be changed for this home). Pick one or more → Send quote: one call (portal-plus quote-many), one
   "your quote is ready" e-mail on ✅ Approvals (kind maint_quote, as before); the customer sees every picked plan
   under "Your maintenance plans" in the portal and signs each one there. A plan the customer asked for is ticked.
   Signed plans keep their visit / end-the-plan buttons, unchanged.
2. ⚙ Admin → 🛠 Maintenance plans: each plan has a name, what is included, how often (once / twice a year) and a usual
   yearly price; add, remove, turn off. Admins and the office change it (the server already allowed the office).
   Stored as before (gc_kv "gc_maint_plans" through portal-plus action 'plans').
3. The job's plan fit (the 🛠 bar's "offered" list) also knows deck / fence and water / moisture jobs.
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch MAINTPLANS'
if MARK in t:
    print('MAINTPLANS: already patched'); sys.exit(0)


def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('MAINTPLANS anchor count != 1', n, old[:90])
    t = t.replace(old, new)


def block(start, end, new):
    """replace the text from `start` up to (not including) `end`; both must be found exactly once"""
    global t
    assert t.count(start) == 1, ('MAINTPLANS start anchor count != 1', t.count(start), start[:90])
    a = t.index(start)
    assert t.count(end, a) >= 1, ('MAINTPLANS end anchor missing', end[:90])
    b = t.index(end, a)
    assert t[a:b].count('\nfunction ') <= 1 or start.startswith('function openMaint'), 'MAINTPLANS block too wide'
    t = t[:a] + new + t[b:]


# ── 3. the job's plan fit ──
once("if (/siding|exterior|trim|paint/.test(t)) o.push('siding'); return o; }",
     "if (/siding|exterior|trim|paint/.test(t)) o.push('siding'); if (/deck|fence|pergola|porch/.test(t)) o.push('deck'); if (/water|moisture|mold|mitigation|crawl|plumb/.test(t)) o.push('water'); return o; }   /* patch MAINTPLANS: deck / water plans */")

once("function plansFor(p){ var st = MT.settings; if (!st) return []; var w = workOf(p); return arr(st.plans).filter(function(x){ return x.on !== false && ",
     "function plansFor(p){ var st = MT.settings; if (!st) return []; var w = workOf(p); return arr(st.plans).filter(function(x){ return x.on !== false && x.freq !== 'once' && (x.market === 'commercial') === (groupOf(p) === 'commercial') /* patch MAINTPLANS */ && ")

# ── 1. 🛠 Maintenance on a job: every plan, a checkbox, a price per home, one Send quote ──
block("function openMaint(pid){\n", "\n/* the next visit on the CRM schedule (once per plan and date) */", r"""function openMaint(pid){   /* patch MAINTPLANS: every plan in the catalog, pick one or more, one Send quote */
  var p = proj(pid) || { id: pid, name: 'Job' };
  var O = overlay('🛠 Maintenance — ' + s(p.name), 'Pick one or more plans for this home and set each yearly price. Send quote: the customer sees every plan you picked in their portal and signs there. The “your quote is ready” e-mail and each yearly invoice wait on ✅ Approvals.');
  var pick = {}, price = {};
  var showAll = false, mk = groupOf(p) === 'commercial' ? 'commercial' : 'residential';
  function fq(f){ return ({ twice: 'Twice a year', quarterly: 'Every 3 months', winter: 'Each winter (Dec–Feb), on call', once: 'One time' })[f] || 'Once a year'; }
  function bills(f){ return f === 'quarterly' ? 4 : f === 'twice' ? 2 : 1; }
  function active(cs, id){ return cs.filter(function(x){ return x.planId === id && !/^(cancelled|declined)$/.test(s(x.status)); })[0]; }
  function rows(){
    var cs = MT.contracts.filter(function(c){ return s(c.pid) === s(pid); });
    var plans = arr(MT.settings && MT.settings.plans).filter(function(x){ return x.on !== false && x.freq !== 'once' && (showAll || (x.market === 'commercial' ? 'commercial' : 'residential') === mk); }).slice();
    cs.forEach(function(c){ if (!plans.some(function(x){ return x.id === c.planId; }) && !/^(cancelled|declined)$/.test(s(c.status))) plans.push({ id: c.planId, name: c.planName, includes: s(c.includes), freq: s(c.freq) || 'yearly', price: 0 }); });
    return { cs: cs, plans: plans };
  }
  function picked(){
    var R = rows();
    return R.plans.filter(function(pl){ var c = active(R.cs, pl.id); return (!c || c.status !== 'signed') && (pick[pl.id] != null ? pick[pl.id] : !!(c && c.status === 'requested')); })
      .map(function(pl){ var c = active(R.cs, pl.id); return { pl: pl, c: c, price: num(price[pl.id] != null ? price[pl.id] : (c && c.price ? c.price : pl.price)) }; });
  }
  function paint(){
    if (!MT.settings) { O.body.innerHTML = '<div class="gcx9-mut">Loading…</div>'; return; }
    var R = rows(), cs = R.cs, plans = R.plans, fits = plansFor(p).map(function(x){ return x.id; });
    if (!plans.length) { O.body.innerHTML = '<div class="gcx9-mut" style="margin:12px 0">No maintenance plans are turned on. The plan list is in ⚙ Admin → 🛠 Maintenance plans.</div>'; return; }
    var n = picked().length;
    O.body.innerHTML = plans.map(function(pl){
      var c = active(cs, pl.id), old = cs.filter(function(x){ return x.planId === pl.id && /^(cancelled|declined)$/.test(s(x.status)); });
      var f = s(c && c.freq) || pl.freq, words = s(pl.includes).replace(/\s*Price:\s*\[[^\]]*\][^.]*\.?/i, '').trim();
      var h = '<div class="gcx9-plan" data-plan="' + esc(pl.id) + '">';
      if (!c || c.status === 'requested' || c.status === 'quoted') {
        var on = pick[pl.id] != null ? pick[pl.id] : !!(c && c.status === 'requested');
        var val = price[pl.id] != null ? price[pl.id] : (c && c.price ? c.price : (pl.price || ''));
        h += '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-pick="' + esc(pl.id) + '"' + (on ? ' checked' : '') + ' style="width:22px;height:22px;margin-top:1px;flex:none">' +
          '<span><b style="font-size:15px">' + esc(pl.name) + '</b> <span class="gcx9-tag">' + esc(fq(f)) + '</span>' + (fits.indexOf(pl.id) >= 0 ? '<span class="gcx9-tag" style="background:#dcfce7;color:#166534">fits this job</span>' : '') + '</span></label>' +
          (words ? '<div class="gcx9-mut" style="margin:4px 0 4px 32px">' + esc(words) + '</div>' : '') +
          (c && c.status === 'requested' ? '<div style="margin:6px 0 6px 32px"><span class="gcx9-tag" style="background:#fef3c7;color:#92400e">The customer asked for a quote ' + esc(day(c.requestedAt)) + '</span>' + (c.note ? ' “' + esc(c.note) + '”' : '') + '</div>' : '') +
          (c && c.status === 'quoted' ? '<div style="margin:6px 0 6px 32px"><span class="gcx9-tag" style="background:#e0f2fe;color:#075985">In the portal: ' + esc(usd(c.price)) + ' / year, quoted ' + esc(day(c.quotedAt)) + ' — waiting for the customer to sign</span></div>' : '') +
          '<div class="gcx9-row" style="margin-left:32px"><label>Yearly price for this home <input class="gcx9-in" type="number" min="1" step="1" inputmode="decimal" data-price="' + esc(pl.id) + '" value="' + esc(val) + '" style="width:120px"></label>' +
          (pl.price ? '<span class="gcx9-mut">usual ' + esc(usd(pl.price)) + '</span>' : '') + (bills(f) > 1 ? '<span class="gcx9-mut">billed ' + bills(f) + ' times a year, every ' + (12 / bills(f)) + ' months</span>' : '') + '</div>';
      } else if (c.status === 'signed') {
        h += '<b style="font-size:15px">' + esc(pl.name) + '</b> <span class="gcx9-tag">' + esc(fq(f)) + '</span>' + (words ? '<div class="gcx9-mut" style="margin:4px 0">' + esc(words) + '</div>' : '') +
          '<div style="margin:6px 0"><span class="gcx9-tag" style="background:#dcfce7;color:#166534">✓ Signed by ' + esc(c.signName) + ' on ' + esc(day(c.signedAt)) + ' · ' + esc(usd(c.price)) + ' / year</span>' + (c.docRef ? ' <a href="#" data-ref="' + esc(c.docRef) + '" data-name="' + esc(c.docName || 'Signed plan.pdf') + '">📄 Signed copy</a>' : '') + '</div>' +
          '<div class="gcx9-row"><label>Next visit <input class="gcx9-in" type="date" data-next="' + esc(c.id) + '" value="' + esc(c.nextVisit) + '"></label><button type="button" class="gcx9-btn l" data-savenext="' + esc(c.id) + '">Save date</button><button type="button" class="gcx9-btn g" data-visit="' + esc(c.id) + '">✓ Visit done</button><button type="button" class="gcx9-btn l" data-cancel="' + esc(c.id) + '">End the plan</button></div>' +
          (arr(c.visits).length ? '<div class="gcx9-mut">Visits: ' + arr(c.visits).map(function(v){ return esc(day(v.at)) + (v.by ? ' (' + esc(v.by) + ')' : ''); }).join(' · ') + '</div>' : '') +
          (arr(c.invoices).length ? '<div class="gcx9-mut">Invoices: ' + arr(c.invoices).map(function(v){ return 'year ' + esc(v.year) + ' ' + esc(usd(v.amount)) + ' — ' + esc(v.status || 'waiting'); }).join(' · ') + '</div>' : '');
      }
      if (old.length) h += '<div class="gcx9-mut">Earlier: ' + old.map(function(x){ return esc(x.status) + ' ' + esc(day(x.declinedAt || x.cancelledAt || x.updatedAt)); }).join(' · ') + '</div>';
      return h + '</div>';
    }).join('') +
      '<div class="gcx9-row"><button type="button" class="gcx9-btn l" data-allplans="1">' + (showAll ? 'Show only ' + mk + ' plans' : 'Show ' + (mk === 'commercial' ? 'residential' : 'commercial') + ' plans too') + '</button></div>' +
      '<div class="gcx9-row" style="position:sticky;bottom:0;background:#fff;padding:10px 0;border-top:1px solid #e2e8f0"><button type="button" class="gcx9-btn g" data-sendq="1"' + (n ? '' : ' disabled') + '>Send quote' + (n ? ' (' + n + (n === 1 ? ' plan' : ' plans') + ')' : '') + '</button>' +
      '<span class="gcx9-mut">' + (n ? 'Total ' + esc(usd(picked().reduce(function(t, x){ return t + x.price; }, 0))) + ' / year. ' : 'Tick the plans for this home. ') + 'The customer sees every plan you picked in their portal and signs there.</span></div>';
  }
  O.body.addEventListener('change', function(e){
    var t = e.target; if (!t || !t.getAttribute) return;
    if (t.hasAttribute('data-pick')) { pick[t.getAttribute('data-pick')] = !!t.checked; paint(); }
  });
  O.body.addEventListener('input', function(e){
    var t = e.target; if (!t || !t.getAttribute || !t.hasAttribute('data-price')) return;
    var id = t.getAttribute('data-price'); price[id] = t.value;
    if (num(t.value) > 0 && pick[id] == null) { pick[id] = true; var cb = O.body.querySelector('[data-pick="' + id + '"]'); if (cb) cb.checked = true; }
    var b = O.body.querySelector('[data-sendq]'), n = picked().length; if (b) { b.disabled = !n; b.textContent = 'Send quote' + (n ? ' (' + n + (n === 1 ? ' plan' : ' plans') + ')' : ''); }
  });
  O.body.addEventListener('click', function(e){
    var t = e.target; if (!t || !t.closest) return;
    var r = t.closest('[data-ref]'); if (r) { e.preventDefault(); try { W._gcOpenRef(r.getAttribute('data-ref'), r.getAttribute('data-name')); } catch (x) {} return; }
    var b = t.closest('button'); if (!b || b.disabled) return;
    var body = null;
    if (b.hasAttribute('data-allplans')) { showAll = !showAll; paint(); return; }
    if (b.hasAttribute('data-sendq')) {
      var L = picked(); if (!L.length) { toast('Tick at least one plan.', true); return; }
      var bad = L.filter(function(x){ return !(x.price > 0); })[0]; if (bad) { toast('Enter the yearly price for the ' + bad.pl.name + '.', true); return; }
      body = { action: 'quote-many', pid: pid, items: L.map(function(x){ return { planId: x.pl.id, contractId: x.c ? x.c.id : undefined, price: x.price }; }) };
    }
    else if (b.hasAttribute('data-savenext')) { var id = b.getAttribute('data-savenext'); body = { action: 'update', contractId: id, nextVisit: s((O.body.querySelector('[data-next="' + id + '"]') || {}).value) }; }
    else if (b.hasAttribute('data-visit')) { var note = W.prompt('Visit done — anything to note? (optional)', ''); if (note === null) return; body = { action: 'update', contractId: b.getAttribute('data-visit'), visitDone: true, note: note }; }
    else if (b.hasAttribute('data-cancel')) { var why = W.prompt('End this maintenance plan? Why (optional):', ''); if (why === null) return; body = { action: 'update', contractId: b.getAttribute('data-cancel'), cancel: true, note: why }; }
    if (!body) return;
    b.disabled = true; var t0 = b.textContent; b.textContent = 'Saving…';
    fn('portal-plus', { body: body }).then(function(j){
      b.disabled = false; b.textContent = t0;
      if (!j || !j.ok) { toast((j && j.error) || 'Could not save.', true); return; }
      if (body.action === 'quote-many') { pick = {}; price = {}; }
      toast(body.action === 'quote-many' ? (j.queued ? 'Quote saved — it is in the customer’s portal; the e-mail to the customer is on ✅ Approvals' : 'Quote saved — it is in the customer’s portal') : 'Saved');
      pullMaint(true).then(function(){ paint(); paintBars(true); });
    });
  });
  paint(); pullMaint(true).then(paint);
}
""")

# ── 2. ⚙ Admin → 🛠 Maintenance plans: name, words, how often, usual price ──
block("function openPlans(){\n", "\n/* ══ 4. 🛡 Insurance: carrier speed report", r"""function openPlans(){   /* patch MAINTPLANS: the plan catalog — how often and a usual price; admins and the office */
  var O = overlay('🛠 Maintenance plans', 'The plans you can pick on a job (🛠 Maintenance) and offer in the customer portal. The usual price is filled in on each job and can be changed for that home.');
  var st = null, mkt = 'residential';
  function canEdit(){ try { if (typeof W._gcFullAccess === 'function') return !!W._gcFullAccess(); } catch (e) {} return isAdmin(); }
  function paint(){
    if (!st) { O.body.innerHTML = '<div class="gcx9-mut">Loading…</div>'; return; }
    var ed = canEdit(), dis = ed ? '' : ' disabled';
    O.body.innerHTML = '<div class="gcx9-row"><b>Offer in the portal on:</b>' + ['residential', 'insurance', 'commercial', 'program'].map(function(g){ return '<label><input type="checkbox" data-on="' + g + '"' + (arr(st.offerOn).indexOf(g) >= 0 ? ' checked' : '') + dis + '> ' + g + '</label>'; }).join(' ') + '</div>' +
      (st.saved ? '' : '<div class="gcx9-mut" style="margin:6px 0;color:#92400e">The usual prices below are a starting list — set your own and Save.</div>') +
      '<div class="gcx9-row"><b>Show:</b>' + ['residential', 'commercial', 'all'].map(function(m){ return '<button type="button" class="gcx9-chip' + (mkt === m ? ' on' : '') + '" data-mkt="' + m + '">' + (m === 'all' ? 'All' : m === 'commercial' ? '🏢 Commercial' : '🏠 Residential') + '</button>'; }).join('') + '</div>' +
      arr(st.plans).map(function(x, i){ var f = x.freq || ((parseInt(x.visits, 10) || 1) >= 2 ? 'twice' : 'yearly'), m = x.market === 'commercial' ? 'commercial' : 'residential';
        return '<div class="gcx9-plan" data-i="' + i + '"' + (mkt !== 'all' && mkt !== m ? ' hidden' : '') + '><div class="gcx9-row"><input class="gcx9-in" data-k="name" aria-label="Plan name" value="' + esc(x.name) + '" style="flex:1;min-width:180px"' + dis + '>' +
        '<label><input type="checkbox" data-k="on"' + (x.on !== false ? ' checked' : '') + dis + '> offered</label></div>' +
        '<textarea class="gcx9-in" data-k="includes" aria-label="What is included" rows="3" style="width:100%;box-sizing:border-box"' + dis + '>' + esc(s(x.includes).replace(/\s*Price:\s*\[[^\]]*\][^.]*\.?/i, '').trim()) + '</textarea>' +
        '<div class="gcx9-row"><label>How often <select class="gcx9-in" data-k="freq"' + dis + '>' + [['yearly', 'Once a year'], ['twice', 'Twice a year'], ['quarterly', 'Every 3 months'], ['winter', 'Each winter (Dec–Feb), on call'], ['once', 'One time (an offer, not billed)']].map(function(o){ return '<option value="' + o[0] + '"' + (f === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<label>For <select class="gcx9-in" data-k="market"' + dis + '><option value="residential"' + (m === 'residential' ? ' selected' : '') + '>🏠 Homes</option><option value="commercial"' + (m === 'commercial' ? ' selected' : '') + '>🏢 Commercial</option></select></label>' +
        '<label>Usual price $ <input class="gcx9-in" type="number" min="0" step="1" inputmode="decimal" data-k="price" value="' + esc(x.price || '') + '" style="width:100px"' + dis + '> / year</label></div>' +
        '<div class="gcx9-row"><span class="gcx9-mut">Fits jobs with:</span><input class="gcx9-in" data-k="kinds" aria-label="Fits jobs with" value="' + esc(arr(x.kinds).join(', ')) + '" placeholder="roof, gutter, siding, deck, water or any" style="width:240px"' + dis + '>' + (ed ? '<button type="button" class="gcx9-btn l" data-del="' + i + '">Remove</button>' : '') + '</div></div>'; }).join('') +
      (ed ? '<div class="gcx9-row"><button type="button" class="gcx9-btn l" data-add="1">＋ Add a plan</button><button type="button" class="gcx9-btn g" data-save="1">Save</button></div>' : '<div class="gcx9-mut">Only an admin or the office changes the plans.</div>');
  }
  function read(){
    var plans = Array.prototype.map.call(O.body.querySelectorAll('.gcx9-plan'), function(el, i){ var q = function(k){ return el.querySelector('[data-k="' + k + '"]'); }, f = /^(yearly|twice|quarterly|winter|once)$/.test(q('freq').value) ? q('freq').value : 'yearly';
      return { id: (arr(st.plans)[i] && st.plans[i].id) || 'plan' + Date.now().toString(36) + i, name: s(q('name').value), freq: f, visits: f === 'quarterly' ? 4 : f === 'twice' ? 2 : 1, market: q('market').value === 'commercial' ? 'commercial' : 'residential', price: num(q('price').value), on: q('on').checked, includes: s(q('includes').value), kinds: s(q('kinds').value).split(/[,\s]+/).map(low).filter(Boolean) }; });
    var offerOn = Array.prototype.filter.call(O.body.querySelectorAll('[data-on]'), function(x){ return x.checked; }).map(function(x){ return x.getAttribute('data-on'); });
    return { plans: plans, offerOn: offerOn, saved: st.saved };
  }
  O.body.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return;
    if (b.hasAttribute('data-mkt')) { st = read(); mkt = b.getAttribute('data-mkt'); paint(); return; }
    if (b.hasAttribute('data-add')) { st = read(); st.plans.push({ id: 'plan' + Date.now().toString(36), name: 'New plan', freq: 'yearly', visits: 1, price: 0, market: mkt === 'commercial' ? 'commercial' : 'residential', on: true, includes: 'What is included, in plain words.', kinds: ['any'] }); paint(); var all = O.body.querySelectorAll('[data-k="name"]'); if (all.length) { all[all.length - 1].focus(); try { all[all.length - 1].select(); } catch (x) {} } return; }
    if (b.hasAttribute('data-del')) { st = read(); st.plans.splice(+b.getAttribute('data-del'), 1); paint(); return; }
    if (b.hasAttribute('data-save')) { var v = read(); if (!v.plans.length || v.plans.some(function(x){ return !x.name; })) { toast('Every plan needs a name.', true); return; } b.disabled = true;
      fn('portal-plus', { body: { action: 'plans', set: v } }).then(function(j){ b.disabled = false; if (!j || !j.ok) { toast((j && j.error) || 'Could not save.', true); return; } st = j.settings; MT.settings = j.settings; toast('Maintenance plans saved'); paint(); paintBars(true); }); }
  });
  paint(); fn('portal-plus', { body: { action: 'plans' } }).then(function(j){ st = j && j.ok ? j.settings : { plans: [], offerOn: [] }; paint(); });
}
""")

once("maint: { open: openMaint, list:", "maint: { open: openMaint, plans: openPlans /* patch MAINTPLANS */, list:")

assert t.count(MARK) >= 1
open(p, 'w', encoding='utf-8').write(t)
print('MAINTPLANS: patched')
