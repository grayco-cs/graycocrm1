#!/usr/bin/env python3
"""Idempotent patch CUSTALL (owner 10/30): "If any customer goes into our system in any way they get entered into our
customer database". And: "Some customers have multiple jobs or multiple addresses — make sure that doesn't combine,
it just goes under that customer's jobs etc."

  * ONE rule: netlify/functions/_lib/custall.js (who a record's customer is, who is not a customer, the match, the
    fill-only-empty merge, the hashed id). This patch inlines that file word for word (window._gcCustAllCore) and
    tools/custall_client.js (the page side).
  * The CRM's own save step (ma(key, value): local, cloud, live) hands every saved list to window._gcCustAllSaw. Every
    job / lead / invoice / estimate that is new or changed after loading (typed here, or synced in: texts, missed calls,
    the website, Lead Inbox, CompanyCam, QuickBooks, MONEY, referrals, partners) puts its customer on the list
    (through window._setCustomers, the list's normal save) and links the job (customerId). No timer.
  * The Customers screen: "👥 Add every missing customer (N)" (admin / office): a dry run list first, then one tap.
  * The customer profile from a job shows the job's customer (phone, e-mail, address) before it is on the list, and
    "＋ Add to Customers" uses the same rule (match first) and links the job.
Usage: python3 tools/patch_CUSTALL.py [index.html]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_CUSTALL__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('CUSTALL: already patched'); sys.exit(0)
core = open(os.path.join(ROOT, 'netlify', 'functions', '_lib', 'custall.js'), encoding='utf-8').read()
client = open(os.path.join(HERE, 'custall_client.js'), encoding='utf-8').read()
assert '</script' not in core and '</script' not in client

def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('CUSTALL: anchor count != 1', label, n)
    return s.replace(old, new)

# 1. the rule + the page side
src = once(src, '<script id="gc-patch-primesub">',
  '<script id="gc-patch-custall">\n/* ' + MARK + ' (patch CUSTALL) — netlify/functions/_lib/custall.js, inlined word for word: */\n'
  + '/* CUSTALL-CORE-BEGIN */\n' + core + '/* CUSTALL-CORE-END */\n' + client + '</script>\n<script id="gc-patch-primesub">', 'script')

# 2. the save step: every list the CRM saves
src = once(src, 'ma=(t,a)=>{if(du.has(t)){',
  'ma=(t,a)=>{try{window._gcCustAllSaw&&window._gcCustAllSaw(t,a)}catch(_ca){}/* patch CUSTALL */if(du.has(t)){', 'ma')

# 2b. the customer list's setter of the CRM as it is drawn now (like window._setProjects; window._setCustomers keeps the first one)
src = once(src, 'window._setCustomers=window._setCustomers||Jt;',
  'window._setCustomers=window._setCustomers||Jt;window.__gcSetCustomersNow=Jt;/* patch CUSTALL */', 'setter now')

# 3. the Customers screen button
src = once(src, 'e.jsx("button",{style:{...ht,background:u.acc,color:"#fff"},onClick:()=>_({...Z}),children:"+ New Customer"})]})',
  'e.jsxs("div",{style:{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"},children:[window._gcCustAllOpen&&window._gcCustAllCan&&window._gcCustAllCan()?e.jsx("button",{"data-gc-custall":"1",style:{...ht,background:"#d4a017",color:"#14213d"},onClick:()=>window._gcCustAllOpen(),children:"👥 Add every missing customer ("+window._gcCustAllCount()+")"}):null,'
  'e.jsx("button",{style:{...ht,background:u.acc,color:"#fff"},onClick:()=>_({...Z}),children:"+ New Customer"})]})]})', 'customers screen')

# 4. the profile (patch D1's 👤 sheet): the job's customer before it is on the list; "＋ Add to Customers" by the rule
src = once(src, "      if (!c) c = { name: s(p.client) || 'Customer', phone: s(p.clientPhone || p.customerPhone), email: s(p.clientEmail || p.customerEmail), address: s(p.address), _pseudo: true };",
  "      if (!c) c = { name: s(p.client) || 'Customer', phone: s(p.clientPhone || p.customerPhone || p.phone), email: s(p.clientEmail || p.customerEmail), address: s(p.address), _pseudo: true, _pid: s(p.id) };   /* patch CUSTALL: + the job */", 'd1 pseudo')
src = once(src, "  if (!c && looksId(k)) c = custFromId(k, list);",
  "  if (!c && looksId(k)) c = custFromId(k, list);\n"
  "  if (!c && k && typeof W._gcCustFromJob === 'function') { try { c = W._gcCustFromJob(k) || null; } catch (e) {} }   /* patch CUSTALL: a job's customer by name, with the job's phone / e-mail / address */", 'd1 by name')
src = once(src, "    else if (a === 'create') { c = ensureCustomer({ name: name, phone: s(c.phone), email: s(c.email), address: s(c.address) }); sh.ov.remove(); W._gcCustomer360(c.id); toast('Added to Customers'); }",
  "    else if (a === 'create') { c = (typeof W._gcCustAllAdd === 'function' ? W._gcCustAllAdd(c) : null) || ensureCustomer({ name: name, phone: s(c.phone), email: s(c.email), address: s(c.address) }); if (Array.isArray(CUST) && !CUST.some(function(x){ return x && String(x.id) === String(c.id); })) CUST = CUST.concat([c]); sh.ov.remove(); W._gcCustomer360(c.id, { rec: c }); toast('Added to Customers'); }   /* patch CUSTALL: match first, link the job */", 'd1 create')

# 4b. patch AUT1's job ↔ customer carry: no customerId on a name-only match (a person checks those in the backfill)
src = once(src, "  want('customerId', c && c.id);",
  "  want('customerId', c && c.id && (typeof W._gcCustAllLinkable !== 'function' || W._gcCustAllLinkable(p, c)) ? c.id : '');   /* patch CUSTALL: not on a name alone */", 'aut1 carry')
src = once(src, "        if (!q.customerId) q.customerId = cid;",
  "        if (!q.customerId && (typeof W._gcCustAllLinkable !== 'function' || W._gcCustAllLinkable(q, c))) q.customerId = cid;   /* patch CUSTALL: not on a name alone */", 'aut1 csync')

# 5. the phone profile (window._gcOpenCustomerProfile): the same
src = once(src, "    if(!cust){ cust={name:idOrName}; }",
  "    if(!cust){ try{ cust=(window._gcCustFromJob&&window._gcCustFromJob(idOrName))||null; }catch(_e){} if(!cust) cust={name:idOrName}; }   /* patch CUSTALL: the job's customer data before it is on the list */", 'field profile')
src = once(src, "    var jobs=(crm.projects||[]).filter(function(p){ return p && norm(p.client)===norm(cname); });",
  "    var jobs=(crm.projects||[]).filter(function(p){ return p && (norm(p.client)===norm(cname) || (cust.id && String(p.customerId||'')===String(cust.id))); });   /* patch CUSTALL: + linked jobs */", 'field jobs')

open(path, 'w', encoding='utf-8').write(src)
print('CUSTALL: patched')
