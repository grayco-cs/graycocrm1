# INVALL (owner 11/23: "be able to click all at once here"): the CRM's ✉️ Invite subs picker — ☑ Select all shown (the trades picked)
# and ☐ Clear above the list. Never ticks someone already invited (their box stays greyed).
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'INVALL' not in s
a = "    + '<div class=\"list\">' + (list.length ? list.map(function(x){"
assert s.count(a) == 1
s = s.replace(a, """    /* INVALL: tick / untick everyone shown */
    + (list.filter(function(x){ return !x.invited; }).length ? '<div class="bar" style="margin:6px 0"><button type="button" class="b" data-sys="pickall">☑ Select all shown (' + list.filter(function(x){ return !x.invited; }).length + ')</button>' + (n ? '<button type="button" class="b" data-sys="picknone">☐ Clear (' + n + ')</button>' : '') + '</div>' : '')
""" + a)
b = "  if (a === 'trade') { var k = t.getAttribute('data-t'); if (INV.trades[k]) delete INV.trades[k]; else INV.trades[k] = 1; return drawInvite(); }"
assert s.count(b) == 1
s = s.replace(b, b + """
  if (a === 'pickall') { invShown().forEach(function(x){ if (!x.invited && x.email) INV.pick[x.email] = true; }); return drawInvite(); }   /* INVALL */
  if (a === 'picknone') { INV.pick = {}; return drawInvite(); }   /* INVALL */""")
open(p, 'w', encoding='utf-8').write(s); print('INVALL applied')
