# PORTALLINK (owner 11/26, screenshot "The portal link was not made — try again with a signal." on a job that says "no portal yet"):
# the portal server now hands out the short link on the portal's own address (https://portal.grayco-cs.com/#t=<code>), but four
# places in the CRM only took the old crm…/portal.html#t=<code> form — so a link that WAS made was thrown away and the job kept
# saying "no portal yet". Both forms are a portal link now (as the job page's 🏠 Portal frame already allowed).
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'PORTALLINK' not in s
OLD = r"/^https:\/\/[^\s]+\/portal\.html#t=[A-Za-z0-9_-]{43}$/"
NEW = r"/^https:\/\/[^\s]+\/(?:portal\.html)?#t=[A-Za-z0-9_-]{43}$/"
assert s.count(OLD) == 4, s.count(OLD)
s = s.replace(OLD, NEW)
a = "/* ── the customer portal (patch Q's link: /portal.html#t=<43>; the staff preview adds &p=1) ── */"
assert s.count(a) == 1
s = s.replace(a, a + "\n/* patch PORTALLINK: crm…/portal.html#t= or portal.grayco-cs.com/#t= */")
open(p, 'w', encoding='utf-8').write(s); print('PORTALLINK applied')

# PORTALAUTO (owner 11/26: "all customers get a portal i shouldnt have to make one its automatic"): every OPEN job (not lost / dead /
# cancelled / complete / closed / archived / history / record-only, portal not turned off) gets its link by itself — new jobs as
# before (and the link e-mail as before); older open jobs get the link only, nothing is sent to the customer.
s = open(p, encoding='utf-8').read()
assert 'PORTALAUTO' not in s
a = """    if (createdMs(p) < cut) continue;
    attempted[p.id] = 1; todo.push(String(p.id));
  }
  (function next(){ var pid = todo.shift(); if (!pid) return; ensureLink(pid, 'new job').then(function(){ nST(next, 1500); }); })();"""
assert s.count(a) == 1
s = s.replace(a, """    if (createdMs(p) < cut) {   /* patch PORTALAUTO: an older open job gets its link too — the link only, nothing is sent */
      if (p.history || p.recordOnly || p.deleted || p.tombstoned || /complete|closed|archiv|void|history/.test(low(p.status))) continue;
      attempted[p.id] = 1; old.push(String(p.id)); continue;
    }
    attempted[p.id] = 1; todo.push(String(p.id));
  }
  (function next(){ var pid = todo.shift(); if (!pid) return; ensureLink(pid, 'new job').then(function(){ nST(next, 1500); }); })();
  (function nextOld(){ var pid = old.shift(); if (!pid) return; ensureLink(pid, 'auto').then(function(){ nST(nextOld, 2500); }); })();   /* patch PORTALAUTO */""")
a2 = "  var cut = Date.now() - 7 * 86400e3, todo = [];\n  for (var i = 0; i < list.length; i++) {\n    var p = list[i];\n    if (!p || !p.id || attempted[p.id] || linkOf(p) || p.portalOff) continue;"
assert s.count(a2) == 1
s = s.replace(a2, a2.replace("todo = [];", "todo = [], old = [];"))
open(p, 'w', encoding='utf-8').write(s); print('PORTALAUTO applied')
