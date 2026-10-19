// Printable documents: the friendly flyer and the full proposal.
// Both render into #print-root; the browser's Print → "Save as PDF" makes the file.
(function (root) {
  'use strict';
  var esc = U.esc, money = U.money, num = U.num;

  function licenseLine(co) {
    var tn = co.licTN ? 'TN License #' + esc(co.licTN) : 'Licensed in Tennessee';
    var ar = co.licAR ? 'AR License #' + esc(co.licAR) : 'Licensed in Arkansas';
    return tn + ' · ' + ar + ' · ' + esc(co.insurance);
  }

  function contactCard(sender, co) {
    return '<div class="doc-contact">' +
      '<div class="doc-contact-label">Your GrayCo contact</div>' +
      '<div class="doc-contact-name">' + esc(sender.name) + '</div>' +
      '<div>' + esc(sender.title || '') + '</div>' +
      '<div>Direct: <b>' + esc(sender.phone || co.phone) + '</b></div>' +
      '<div>' + esc(sender.email) + '</div>' +
      '<div class="muted">Office: ' + esc(co.phone) + ' · ' + esc(co.website) + '</div>' +
    '</div>';
  }

  // What a roof with no specific issues listed should say, by grade.
  function noIssuesText(lead) {
    var g = U.grade(lead.condition).cls;
    if (g === 'good') return 'Your roof looks to be in decent shape. A quick on-site check will confirm it.';
    if (g === 'fair') return 'Your roof is showing normal signs of age and wear. A close-up look will tell us how much life it has left.';
    return 'Your roof is showing significant wear. We recommend an on-site inspection soon, before small problems become leaks.';
  }

  function measuredFrom(lead) {
    return lead.source === 'scan' ? 'aerial imagery' : 'preliminary measurements';
  }

  function demoStamp(lead) {
    return lead.demo ? '<div class="doc-demo">DEMO DATA — sample only, not a real property</div>' : '';
  }

  // ctx: { lead, settings, sender, roofType, quote, coating (or null) }
  function flyer(ctx) {
    var l = ctx.lead, co = ctx.settings.company, q = ctx.quote, rt = ctx.roofType;
    var g = U.grade(l.condition);
    var saw = (l.issues && l.issues.length)
      ? '<ul>' + l.issues.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'
      : '<p>' + noIssuesText(l) + '</p>';
    var coat = ctx.coating
      ? '<div class="flyer-coat"><b>Budget-friendly option:</b> a restorative metal roof coating, about ' +
        money(ctx.coating.low) + ' – ' + money(ctx.coating.high) + '. It extends roof life at a fraction of replacement cost.</div>'
      : '';

    return '<article class="doc flyer">' + demoStamp(l) +
      '<header class="flyer-head">' +
        '<div class="logo logo-white" role="img" aria-label="' + esc(co.name) + '"></div>' +
        '<h1>Hi there, neighbor!</h1>' +
        '<p>We took a friendly look at the roof at <b>' + esc(l.name) + '</b> and put together a quick snapshot for you.</p>' +
      '</header>' +
      '<section class="flyer-cards">' +
        '<div class="flyer-card"><div class="k">Roof type</div><div class="v">' + esc(rt.name) + '</div></div>' +
        '<div class="flyer-card"><div class="k">Approx. size</div><div class="v">' + num(l.areaSqft) + ' ft²</div></div>' +
        '<div class="flyer-card"><div class="k">Condition</div><div class="v cond-' + g.cls + '">' + g.label + '</div></div>' +
      '</section>' +
      '<section class="flyer-body">' +
        '<div><h2>What we noticed</h2>' + saw + '</div>' +
        '<div class="flyer-est"><h2>Ballpark investment</h2>' +
          '<div class="flyer-range">' + money(q.low) + ' – ' + money(q.high) + '</div>' +
          '<p class="muted">Estimated from ' + measuredFrom(l) + '. Your free on-site inspection gives you an exact number, with no pressure and no obligation.</p>' +
        '</div>' +
      '</section>' + coat +
      '<section class="flyer-foot">' +
        contactCard(ctx.sender, co) +
        '<div class="badges">' +
          '<span class="badge">✔ Licensed TN &amp; AR</span>' +
          '<span class="badge">✔ Bonded &amp; Insured</span>' +
          '<span class="badge">✔ Local to Bartlett</span>' +
          '<span class="badge">★ 5-Star Service</span>' +
        '</div>' +
      '</section>' +
      '<footer class="doc-foot">' + esc(co.name) + ' · ' + esc(co.address) + ' · ' + esc(co.phone) + '<br>' + licenseLine(co) + '</footer>' +
    '</article>';
  }

  function scopeFor(rt) {
    var id = rt.id;
    if (id === 'tpo') return ['Remove existing roofing down to the deck where required', 'Replace wet or damaged insulation', 'Install new insulation board and cover board', 'Install a new mechanically attached or fully adhered TPO membrane with heat-welded seams', 'New flashing at walls, curbs and penetrations', 'New edge metal and drains as needed'];
    if (id === 'epdm') return ['Remove existing roofing where required', 'Replace wet or damaged insulation', 'Install a new fully adhered EPDM membrane', 'Seam tape and flashing at all penetrations and curbs', 'New edge metal and drains as needed'];
    if (id === 'metal') return ['Inspect and secure all panels', 'Replace failed fasteners and closures', 'Seal seams, laps and penetrations', 'Replace damaged panels and flashing', 'Optional: full restorative coating system'];
    if (id === 'shingle') return ['Tear off existing shingles down to the deck', 'Replace damaged decking', 'Install synthetic underlayment and ice/water shield at valleys', 'Install new architectural shingles, ridge vent and drip edge', 'New pipe boots and flashing'];
    if (id === 'bur') return ['Remove existing built-up roofing where required', 'Replace wet or damaged insulation', 'Install a new multi-ply built-up or modified-bitumen system', 'New flashing at walls, curbs and penetrations', 'New edge metal and drains as needed'];
    return ['Remove existing roofing where required', 'Replace damaged substrate', 'Install a new ' + rt.name + ' roofing system', 'New flashing, edge metal and drains as needed'];
  }

  function proposal(ctx) {
    var l = ctx.lead, co = ctx.settings.company, q = ctx.quote, rt = ctx.roofType;
    var g = U.grade(l.condition);
    var owner = l.owner || {};
    var to = [owner.name, owner.company].filter(Boolean).map(esc).join('<br>') || 'Property owner / manager';
    var issues = (l.issues && l.issues.length)
      ? '<ul>' + l.issues.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'
      : '<p>' + noIssuesText(l) + '</p>';
    var coatRow = ctx.coating
      ? '<h2>Alternative: Restorative Coating</h2><p>For metal roofs still structurally sound, a restorative coating system can add years of service for much less than replacement: ' +
        '<b>' + money(ctx.coating.low) + ' – ' + money(ctx.coating.high) + '</b> (' + num(ctx.coating.squares) + ' squares).</p>'
      : '';
    var pid = 'GC-' + String(l.id || '').replace(/\D/g, '') + '-' + new Date().getFullYear();

    function tier(name, sub, price, items) {
      return '<div class="tier"><div class="tier-name">' + name + '</div><div class="tier-sub">' + sub + '</div>' +
        '<div class="tier-price">' + money(price) + '</div><ul>' +
        items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div>';
    }

    return '<article class="doc proposal">' + demoStamp(l) +
      '<header class="prop-head">' +
        '<div class="logo logo-navy" role="img" aria-label="' + esc(co.name) + '"></div>' +
        '<div class="prop-meta"><div class="prop-title">Roofing Proposal</div>' +
          '<div>Proposal ' + esc(pid) + '</div><div>' + U.today() + '</div></div>' +
      '</header>' +
      '<section class="prop-parties">' +
        '<div><div class="k">Prepared for</div>' + to + '<br>' + esc(l.name) + '<br>' + esc(l.address) + '</div>' +
        '<div><div class="k">Prepared by</div>' + esc(ctx.sender.name) + ', ' + esc(ctx.sender.title || '') + '<br>' +
          esc(ctx.sender.phone || co.phone) + '<br>' + esc(ctx.sender.email) + '</div>' +
      '</section>' +
      '<h2>1. Roof Assessment</h2>' +
      '<table class="prop-table"><tr><th>Roof type</th><td>' + esc(rt.name) + '</td><th>Approx. area</th><td>' + num(l.areaSqft) + ' ft²</td></tr>' +
        '<tr><th>Condition</th><td>' + g.label + ' (' + l.condition + '/100)</td><th>Property type</th><td>' + (l.kind === 'residential' ? 'Residential' : 'Commercial') + '</td></tr></table>' +
      '<h3>Observations</h3>' + issues +
      '<p class="muted">Measurements are from ' + measuredFrom(l) + ' and will be verified on site before work begins.</p>' +
      '<h2>2. Scope of Work</h2><ul>' + scopeFor(rt).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
        '<li>Full cleanup, debris haul-off and final walk-through with you</li></ul>' +
      '<h2>3. Investment Options</h2>' +
      '<div class="tiers">' +
        tier('Good', 'Essential replacement', q.low, ['Scope of work above', 'Manufacturer standard warranty', 'GrayCo workmanship warranty']) +
        tier('Better', 'Recommended', q.mid, ['Everything in Good', 'Upgraded materials and detailing', 'Extended workmanship warranty']) +
        tier('Best', 'Premium, longest life', q.high, ['Everything in Better', 'Premium system and extended manufacturer warranty', 'Longest workmanship warranty']) +
      '</div>' + coatRow +
      '<h2>4. Terms &amp; Warranty</h2><ul>' +
        String(ctx.settings.terms || '').split('\n').filter(function (t) { return t.trim(); })
          .map(function (t) { return '<li>' + esc(t.trim()) + '</li>'; }).join('') +
        '<li>' + esc(co.insurance) + '. Certificates of insurance available on request.</li>' +
      '</ul>' +
      '<h2>5. Acceptance</h2>' +
      '<p>Selected option: &nbsp;☐ Good &nbsp; ☐ Better &nbsp; ☐ Best' + (ctx.coating ? ' &nbsp; ☐ Coating' : '') + '</p>' +
      '<div class="sign"><div><div class="line"></div>Owner / authorized signature &amp; date</div>' +
        '<div><div class="line"></div>' + esc(co.name) + ' &amp; date</div></div>' +
      '<footer class="doc-foot">' + esc(co.name) + ' · ' + esc(co.address) + ' · ' + esc(co.phone) + ' · ' + esc(co.website) + '<br>' + licenseLine(co) + '</footer>' +
    '</article>';
  }

  root.Docs = { flyer: flyer, proposal: proposal };
})(this);
