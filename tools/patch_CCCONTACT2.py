#!/usr/bin/env python3
"""patch CCCONTACT2 (owner 11/5 "to enter the job in the crm at all a phone number or email has to be in the crm / company cam /
grayco photos"; 11/15 list, item 3):
  a. CompanyCam / GrayCo Photos projects: the 15-minute server sync (companycam-sync.js) no longer makes a job from a project with
     no customer phone or e-mail — it goes on the GrayCo Photos "Waiting for a person" list as "📷 Needs contact info" with a
     Phone / E-mail box; "＋ Save and make the job" (companycam-webhook ?proxy=review act contact) keeps the contact and the next
     sync (a full read, within 15 minutes) makes the job with it. A phone / e-mail added in CompanyCam does the same.
  b. 🚀 Convert to job on a lead with no phone / e-mail stops first and asks for one (saved on the lead), then goes on to Launch
     Job; the money-inbox "＋ New job" form has Phone / E-mail and needs one (a picked customer's counts).
Idempotent. Usage: python3 tools/patch_CCCONTACT2.py [repo-root]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(here)
def edit(fn, pairs):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read(); n0 = src
    for o, n in pairs:
        if n in src: continue
        assert src.count(o) == 1, (fn, src.count(o), o[:90]); src = src.replace(o, n)
    if src != n0: open(p, 'w', encoding='utf-8').write(src)

# ── a. server: the sync
HOLD = "    if (!newJobsOn && !makeIds[p.id]) { heldNew.push(p); R.review.push(revOf(p, 'new', 'a new CompanyCam project — \"Make new jobs\" is OFF in ⚙ Admin → ⚡ Automations, so it waits here. ＋ Make it a new job adds it now.')); continue; }   /* patch AUTOPANEL */\n"
GATE = HOLD + ("    /* patch CCCONTACT2: no customer phone / e-mail → \"📷 Needs contact info\" (not a job) until one is typed on the list or added in CompanyCam */\n"
    "    { const addC = obj(obj(req.contact)[p.id]);\n"
    "      if (!ccHasContact(p.contact) && !ccHasContact(addC)) { R.review.push(revOf(p, 'contact', 'no customer phone or e-mail in CompanyCam. Type one here (or add it in CompanyCam) and it becomes a job on the next sync.')); R.needContact = (R.needContact || 0) + 1; continue; }\n"
    "      if (!ccHasContact(p.contact)) p.contact = Object.assign({}, obj(p.contact), { phone: s(addC.phone), email: s(addC.email) }); }\n")
edit('netlify/functions/companycam-sync.js', [
    (HOLD, GATE),
    ("function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }\n",
     "function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }\n"
     "/* patch CCCONTACT2: a 10-digit phone or an e-mail */\n"
     "function ccHasContact(c){ c = obj(c); let d = s(c.phone).replace(/\\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 || /^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(s(c.email)); }\n")])
# ── a. server: the review action
edit('netlify/functions/companycam-webhook.js', [
    ("!/^(dismiss|make|done|link|notthis)$/.test(act)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'cc and act (make | dismiss | done | link | notthis) are required' }) };",
     "!/^(dismiss|make|done|link|notthis|contact)$/.test(act)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'cc and act (make | dismiss | done | link | notthis | contact) are required' }) };\n"
     "      /* patch CCCONTACT2: \"＋ Save and make the job\" on a 📷 Needs contact info row — the phone / e-mail is kept for the next sync */\n"
     "      let cPh = String(b.phone || '').replace(/\\D/g, ''); if (cPh.length === 11 && cPh[0] === '1') cPh = cPh.slice(1); const cEm = String(b.email || '').trim().slice(0, 160);\n"
     "      if(act === 'contact' && cPh.length !== 10 && !/^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(cEm)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'A 10-digit phone or an e-mail, please.' }) };"),
    ("      if(act === 'make'){ req.make = Object.assign({}, isObj(req.make) ? req.make : {}); req.make[cc] = at;",
     "      if(act === 'contact'){ req.contact = Object.assign({}, isObj(req.contact) ? req.contact : {}); req.contact[cc] = { phone: cPh.length === 10 ? cPh : '', email: /@/.test(cEm) ? cEm : '', at: at, by: who.email || '' }; req.make = Object.assign({}, isObj(req.make) ? req.make : {}); req.make[cc] = at; Object.assign(req, { full: true, at: at, by: who.email || '' }); rows.push({ key: 'gc_cc_sync_request', value: req }); }   /* patch CCCONTACT2 */\n"
     "      if(act === 'make'){ req.make = Object.assign({}, isObj(req.make) ? req.make : {}); req.make[cc] = at;")])

# ── the CRM
P = os.path.join(R, 'index.html')
edit('index.html', [
    # GrayCo Photos review list: the contact row
    ("var KIND = { match: 'Looks like an existing job', ask: 'Same address as a finished job', pm: 'Given to the Senior PM', link: 'Which job is it? (Link it on 📸 GrayCo Photos)' };",
     "var KIND = { match: 'Looks like an existing job', ask: 'Same address as a finished job', pm: 'Given to the Senior PM', link: 'Which job is it? (Link it on 📸 GrayCo Photos)', contact: '📷 Needs contact info' };   /* patch CCCONTACT2 */"),
    ("      + (x.kind === 'pm' ? '<button type=\"button\" data-ccs-act=\"done\"",
     "      + (x.kind === 'contact' ? '<input data-ccs-ph type=\"tel\" inputmode=\"tel\" placeholder=\"Customer phone\" style=\"padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;width:150px\"><input data-ccs-em type=\"email\" placeholder=\"or e-mail\" style=\"padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;width:190px\"><button type=\"button\" data-ccs-act=\"contact\" data-cc=\"' + esc(x.cc) + '\" data-kind=\"contact\" style=\"padding:6px 10px;border-radius:8px;border:0;background:#16a34a;color:#fff;font-weight:700;cursor:pointer\">＋ Save and make the job</button><button type=\"button\" data-ccs-act=\"dismiss\" data-cc=\"' + esc(x.cc) + '\" data-kind=\"contact\" style=\"padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer\">Not a job</button>' : '')   /* patch CCCONTACT2 */\n"
     "      + (x.kind === 'contact' ? '' : x.kind === 'pm' ? '<button type=\"button\" data-ccs-act=\"done\""),
    ("    b.disabled = true;\n    post('review', { cc: cc, act: act, kind: act === 'make' ? '' : kind }).then(function(r){\n      S.msg = r.ok ? (act === 'make' ?",
     "    var cbox = b.parentElement, cph = cbox && cbox.querySelector('[data-ccs-ph]'), cem = cbox && cbox.querySelector('[data-ccs-em]');   /* patch CCCONTACT2 */\n"
     "    if (act === 'contact' && window._gcHasContact && !window._gcHasContact({ clientPhone: cph && cph.value, clientEmail: cem && cem.value })) { S.msg = 'Type the customer\\u2019s 10-digit phone or e-mail first.'; paint(); return; }\n"
     "    b.disabled = true;\n    post('review', { cc: cc, act: act, kind: act === 'make' ? '' : kind, phone: cph ? cph.value : '', email: cem ? cem.value : '' }).then(function(r){\n      S.msg = r.ok ? (act === 'contact' ? 'Saved — it becomes a job with that contact on the next sync (within 15 minutes).' : act === 'make' ?"),
    # money inbox ＋ New job: Phone / E-mail
    ("<datalist id=\"gc-inj-custs\">' +\n        customers().slice(0, 2000).map(function(c){ return '<option value=\"' + esc(c.name || c.company) + '\">'; }).join('') + '</datalist></label>' +",
     "<datalist id=\"gc-inj-custs\">' +\n        customers().slice(0, 2000).map(function(c){ return '<option value=\"' + esc(c.name || c.company) + '\">'; }).join('') + '</datalist></label>' +\n"
     "      '<div style=\"display:flex;gap:8px\"><label style=\"' + L + ';flex:1\">Customer phone<input data-j=\"ph\" type=\"tel\" inputmode=\"tel\" style=\"' + I + '\" autocomplete=\"off\"></label><label style=\"' + L + ';flex:1\">or e-mail<input data-j=\"em\" type=\"email\" style=\"' + I + '\" autocomplete=\"off\"></label></div>' +   /* patch CCCONTACT2: every job needs one */"),
    ("      var c = customers().filter(function(x){ return low(x.name || x.company) === low(cn); })[0];\n      var extra = { autoPO: p || '', createdFrom: s(pre.from) || 'money inbox',",
     "      var c = customers().filter(function(x){ return low(x.name || x.company) === low(cn); })[0];\n"
     "      var cph = s(q('ph') && q('ph').value), cem = s(q('em') && q('em').value);   /* patch CCCONTACT2 */\n"
     "      if (W._gcHasContact && !W._gcHasContact({ clientPhone: cph || (c && c.phone), clientEmail: cem || (c && c.email) })) { q('err').textContent = 'Add the customer\\u2019s phone or e-mail \\u2014 every job needs one (a customer from the list with one counts).'; return; }\n"
     "      var extra = { autoPO: p || '', createdFrom: s(pre.from) || 'money inbox',"),
    ("phone: c ? s(c.phone) : '', email: c ? s(c.email) : '', address: addr, type: TYPES[type] || type, kind: q('status').value === 'active' ? 'active' : '', extra: extra }, 'money inbox');",
     "phone: cph || (c ? s(c.phone) : ''), email: cem || (c ? s(c.email) : ''), address: addr, type: TYPES[type] || type, kind: q('status').value === 'active' ? 'active' : '', extra: extra }, 'money inbox');   /* patch CCCONTACT2 */"),
    # NEWPROJ's ➕ New project form (it is what the money-inbox "＋ New job…" pickers open now)
    ("        customers().slice(0, 3000).map(function(c){ return '<option value=\"' + esc(c.name || c.company) + '\">'; }).join('') + '</datalist></label>' +",
     "        customers().slice(0, 3000).map(function(c){ return '<option value=\"' + esc(c.name || c.company) + '\">'; }).join('') + '</datalist></label>' +\n"
     "      '<div style=\"display:flex;gap:8px\"><label style=\"' + L + ';flex:1\">Customer phone<input data-np=\"ph\" type=\"tel\" inputmode=\"tel\" style=\"' + I + '\" autocomplete=\"off\"></label><label style=\"' + L + ';flex:1\">or e-mail<input data-np=\"em\" type=\"email\" style=\"' + I + '\" autocomplete=\"off\"></label></div>' +   /* patch CCCONTACT2: every job needs one */"),
    ("po: q('po') ? s(q('po').value).toUpperCase() : '' }; }",
     "po: q('po') ? s(q('po').value).toUpperCase() : '', ph: q('ph') ? s(q('ph').value) : '', em: q('em') ? s(q('em').value) : '' }; }   /* patch CCCONTACT2 */"),
    ("      if (!f.name && !f.customer) { q('err').textContent = 'Type the job name (or the customer).'; return; }\n",
     "      if (!f.name && !f.customer) { q('err').textContent = 'Type the job name (or the customer).'; return; }\n"
     "      var cc0 = customers().filter(function(x){ return low(x.name || x.company) === low(f.customer); })[0];   /* patch CCCONTACT2 */\n"
     "      if (W._gcHasContact && !W._gcHasContact({ clientPhone: f.ph || (cc0 && cc0.phone), clientEmail: f.em || (cc0 && cc0.email) })) { q('err').textContent = 'Add the customer\\u2019s phone or e-mail \\u2014 every job needs one (a customer from the list with one counts).'; return; }\n"),
    ("base = { name: name, client: c ? s(c.name || c.company) : f.customer, phone: c ? s(c.phone) : '', email: c ? s(c.email) : '',",
     "base = { name: name, client: c ? s(c.name || c.company) : f.customer, phone: f.ph || (c ? s(c.phone) : ''), email: f.em || (c ? s(c.email) : ''),   /* patch CCCONTACT2 */"),
])
TAG = '<script id="gc-patch-cccontact2">'
js = open(os.path.join(here, 'cccontact2_tail.js'), encoding='utf-8').read(); assert '</script' not in js.lower()
src = open(P, encoding='utf-8').read()
if TAG in src:
    i = src.index(TAG) + len(TAG); j = src.index('</script>', i); src = src[:i] + '\n' + js + src[j:]
else:
    src = src.rstrip('\n') + '\n' + TAG + '\n' + js + '</script>\n'
open(P, 'w', encoding='utf-8').write(src); print('CCCONTACT2 applied')
