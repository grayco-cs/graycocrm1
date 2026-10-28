#!/usr/bin/env python3
"""Idempotent patch CUSTNAME: 👤 Customer profile never shows an internal id as the customer's name (owner 10/27: the profile
opened as "LCC_PRJmtszw0eyy637", 0 jobs, contact "LCC_PRJmtszw0eyy637 Primary").

When the profile is asked for something that is not on the Customers list, it used that text as the name — and some
screens pass the record's id (a CompanyCam / QuickBooks lead "LCC_<job id>" / "LQB_…", a lead "LGN_…", a job "PRJ…").
Now an id is looked up first: a lead with that id (or LCC_/LQB_ + a job id) → that lead's customer (contact / client /
company / name, phone, e-mail, address); a job with that id → the job's client (and the job itself, so Jobs is right);
then the Customers list is searched again with that real name. An id is never shown as a name ("Customer" at worst),
and "＋ Add to Customers" saves the real name. Usage: python3 tools/patch_CUSTNAME.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CUSTNAME'
if MARK in src:
    print('CUSTNAME: already patched'); sys.exit(0)
OLD = """      if (!c) c = { name: s(p.client) || 'Customer', phone: s(p.clientPhone || p.customerPhone), email: s(p.clientEmail || p.customerEmail), address: s(p.address), _pseudo: true };
    }
  }
  return c || { name: k || 'Customer', _pseudo: true };
}"""
NEW = """      if (!c) c = { name: s(p.client) || 'Customer', phone: s(p.clientPhone || p.customerPhone), email: s(p.clientEmail || p.customerEmail), address: s(p.address), _pseudo: true };
    }
  }
  if (!c && looksId(k)) c = custFromId(k, list);
  if (c && c._pseudo && looksId(c.name)) c = Object.assign({}, c, { name: 'Customer' });
  return c || { name: k || 'Customer', _pseudo: true };
}
""" + MARK + """: an id (LCC_ / LQB_ / LGN_ / PRJ… / cust_…) is looked up, never shown as a name */
function looksId(v){ v = s(v).trim(); return !!v && !/\\s/.test(v) && (/^(LCC|LQB|LCCR|LGN|LDUP|LEAD|L)_/i.test(v) || /^PRJ[a-z0-9]{6,}$/i.test(v) || /^cust_?[0-9a-z]{6,}$/i.test(v) || /_PRJ[a-z0-9]{6,}$/i.test(v)); }
function custFromId(k, list){
  var pid = (k.match(/(PRJ[a-z0-9]+)$/i) || [])[1] || '';
  var l = leads().filter(function(x){ return x && String(x.id) === k; })[0];
  var p = projects().filter(function(x){ return x && (String(x.id) === k || (pid && String(x.id) === pid) || (l && l.fromProjectId && String(x.id) === String(l.fromProjectId))); })[0];
  var nm = s(l && (l.contactName || l.client || (typeof l.contact === 'string' ? l.contact : '') || l.company)) || s(p && p.client) || s(l && l.name) || '';
  if (looksId(nm) || /^(CompanyCam lead|QuickBooks customer)$/i.test(nm)) nm = s(p && p.client) || s(l && l.name) || '';
  if (!nm && !p) return null;
  var em = low((l && l.email) || (p && (p.clientEmail || p.customerEmail))), ph = digits((l && l.phone) || (p && (p.clientPhone || p.customerPhone)));
  var hit = list.filter(function(x){ return x && ((nm && norm(x.name) === norm(nm)) || (em && low(x.email) === em) || (ph.length === 10 && digits(x.phone) === ph)); })[0];
  if (hit) return hit;
  return { name: nm || 'Customer', phone: s((l && l.phone) || (p && (p.clientPhone || p.customerPhone))), email: s((l && l.email) || (p && (p.clientEmail || p.customerEmail))), address: s((l && l.address) || (p && p.address)), _pseudo: true, _pid: p ? s(p.id) : '' };
}"""
assert src.count(OLD) == 1, ('CUSTNAME find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
# Jobs count: a pseudo customer found from a job id also counts that job
OLD2 = """  var jobs = projects().filter(function(p){ return matchesCust(k, p.client, p.clientEmail || p.customerEmail, p.clientPhone || p.customerPhone, p.customerId); });"""
NEW2 = """  var jobs = projects().filter(function(p){ return (c._pid && String(p.id) === c._pid) || matchesCust(k, p.client, p.clientEmail || p.customerEmail, p.clientPhone || p.customerPhone, p.customerId); });   /* patch CUSTNAME: + the job it was found from */"""
assert src.count(OLD2) == 1, ('CUSTNAME find-string 2 count != 1', src.count(OLD2))
src = src.replace(OLD2, NEW2)
open(path, 'w', encoding='utf-8').write(src)
print('CUSTNAME: patched', path)
