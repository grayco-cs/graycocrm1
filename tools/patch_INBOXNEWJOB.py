#!/usr/bin/env python3
"""patch INBOXNEWJOB (office 11/05: "The job on the invoice says Enterprise. Need to be able to create a job."; owner: "need on
office profile to be able to create projects for invoices that may come in without projects etc").
 1. tools/inboxnewjob_tail.js after the last </script>: "＋ New job…" form (window._gcNewJobFor) for any job picker with an
    option value "__newjob"; window._gcCanCreateProject (admins / owner / office — not the crew); window._gcNewJobOpt.
 2. patch CC2: window._gcSelfAddJob(o, via) — the "＋ New project" job maker (newJob + ⚡ JA stamp + addJob via _setProjects).
 3. MONEYBOX 📥 Needs a job: the option, the item's PO / job / address on the select, PO → job remembered on Save
    (gc_money_rules "po:<PO>") and used: preselected, and booked by itself when e-mailed invoice auto-booking is on.
 4. the option in 📧 Receipts e-mailed in, the 💳/🏦 statement import and the QuickBooks "needs a home" job pickers.
 5. version 33.166-2026-11-05-r17q25.
usage: python3 tools/patch_INBOXNEWJOB.py [index.html]   (in place; idempotent)"""
import sys, os
H = os.path.dirname(os.path.abspath(__file__))
INDEX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'index.html')
MARK = '/* patch INBOXNEWJOB */'
OLD_V, NEW_V = '33.165-2026-11-05-r17q24', '33.166-2026-11-05-r17q25'
NJ = "(window._gcNewJobOpt ? window._gcNewJobOpt() : '')"
EDITS = [
 # 2. CC2: the job maker, callable
 ("W._gcSelfApptLink = function(e){ return apptLink(e, me(), false).then(function(x){ ensureEntry(x); return x; }); };\n",
  "W._gcSelfApptLink = function(e){ return apptLink(e, me(), false).then(function(x){ ensureEntry(x); return x; }); };\n"
  "W._gcSelfAddJob = function(o, via){ o = o || {}; var m = me(); if (!m.name) return null; var j = newJob(o, m, via || 'inbox'); try { if (W._gcJA && W._gcJA.stamp) j = W._gcJA.stamp(j, 'inbox'); } catch (e) {} if (o.extra) Object.assign(j, o.extra);   " + MARK + "\n"
  "  try { if (W._crm && Array.isArray(W._crm.projects) && !W._crm.projects.some(function(x){ return x && x.id === j.id; })) W._crm.projects = W._crm.projects.concat([j]); } catch (e) {}\n"
  "  return addJob(j); };\n"),
 # 3. MONEYBOX: PO rules
 ("function learn(list){\n  /* list: [{ vendor, category, pid, overhead, how }] → gc_kv \"gc_money_rules\" (merged with what is there) */\n",
  "/* patch INBOXNEWJOB: the PO on a bill → its job (\"po:ENTERPRISE\" in gc_money_rules, or the one open job with that PO) */\n"
  "function poKeyN(v){ return s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }\n"
  "function poRulePid(si){ var k = poKeyN(si && si.read && si.read.po); if (k.length < 3) return '';\n"
  "  var r = R.rules['po:' + k]; if (r && r.pid && proj(r.pid)) return s(r.pid);\n"
  "  var h = projects().filter(function(p){ return poKeyN(poOf(p)) === k; }); return h.length === 1 ? s(h[0].id) : ''; }\n"
  "function learnPO(po, pid){ var k = poKeyN(po); if (k.length < 3 || !pid) return Promise.resolve(R.rules);\n"
  "  R.rules['po:' + k] = { pid: s(pid), po: s(po), at: nowIso(), by: myName() };\n"
  "  return kvGet('gc_money_rules').then(function(cur){ var m = obj(cur); m['po:' + k] = Object.assign({}, m['po:' + k] || {}, R.rules['po:' + k]); R.rules = Object.assign({}, R.rules, m); lsSet('gc_money_rules_cache', JSON.stringify(R.rules)); return kvPut('gc_money_rules', m).then(function(){ return m; }); }); }   " + MARK + "\n"
  "function learn(list){\n  /* list: [{ vendor, category, pid, overhead, how }] → gc_kv \"gc_money_rules\" (merged with what is there) */\n"),
 ("    if (si.route !== 'book' || !si.job || !proj(si.job.pid)) return;\n",
  "    if (si.route === 'match') { var nj = poRulePid(si); if (nj) {   " + MARK + "\n"
  "      if (rec.kind === 'receipt' || si.payee === 'supplier') { if (bookExpense(rec, { pid: nj, why: 'PO ' + s(si.read && si.read.po) + ' (remembered)' })) n++; }\n"
  "      else if (rec.kind === 'client_invoice' || si.payee === 'client') { if (bookClientInvoice(rec, { pid: nj })) n++; }\n"
  "      return; } }\n"
  "    if (si.route !== 'book' || !si.job || !proj(si.job.pid)) return;\n"),
 ("  var o = '<option value=\"\">— pick the job —</option><option value=\"__oh\"' + (sel === '__oh' ? ' selected' : '') + '>Overhead — no job</option>';\n",
  "  var o = '<option value=\"\">— pick the job —</option>' + " + NJ + " + '<option value=\"__oh\"' + (sel === '__oh' ? ' selected' : '') + '>Overhead — no job</option>';   " + MARK + "\n"),
 ("      var sel = it.sg && it.sg.pid ? it.sg.pid : (it.top && it.top[0] && it.top[0].conf >= 60 ? it.top[0].pid : '');\n",
  "      var sel = (it.rec && it.rec.si && poRulePid(it.rec.si)) || (it.sg && it.sg.pid ? it.sg.pid : (it.top && it.top[0] && it.top[0].conf >= 60 ? it.top[0].pid : ''));   " + MARK + "\n"
  "      var rd = (it.rec && it.rec.si && it.rec.si.read) || {}, njA = ' data-gcnj-po=\"' + esc(s(rd.po)) + '\" data-gcnj-name=\"' + esc(s(rd.jobName || rd.job || rd.project) || s(rd.po)) + '\" data-gcnj-addr=\"' + esc(s(rd.jobAddress)) + '\" data-gcnj-from=\"' + esc(it.what + ': ' + it.who + (it.amt ? ' · ' + money(it.amt) : '')) + '\"';\n"),
 ("'<div style=\"display:flex;gap:6px;flex-wrap:wrap;align-items:center\"><select data-m=\"job\" style=\"flex:1;min-width:220px;padding:7px\">'",
  "'<div style=\"display:flex;gap:6px;flex-wrap:wrap;align-items:center\"><select data-m=\"job\"' + njA + ' style=\"flex:1;min-width:220px;padding:7px\">'"),
 ("      if (r === 'ok') { row.innerHTML = '<div style=\"color:#15803d;font-weight:700\">✓ Saved'",
  "      if (r === 'ok' && v !== '__oh' && it.rec && it.rec.si && it.rec.si.read && s(it.rec.si.read.po)) { try { learnPO(it.rec.si.read.po, v); } catch (e) {} }   " + MARK + "\n"
  "      if (r === 'ok') { row.innerHTML = '<div style=\"color:#15803d;font-weight:700\">✓ Saved'"),
 ("W._gcMoney = { parseStatement: parseStatement,", "W._gcMoney = { poRule: poRulePid, learnPO: learnPO, parseStatement: parseStatement,"),
 # 4. the other pickers
 ("  return '<option value=\"\">— pick the job —</option><option value=\"__office\"' + (sel === '__office' ? ' selected' : '')",
  "  return '<option value=\"\">— pick the job —</option>' + " + NJ + " + '<option value=\"__office\"' + (sel === '__office' ? ' selected' : '')"),
 ("  return '<option value=\"\">— pick the job —</option><option value=\"__oh\"' + (sel === '__oh' ? ' selected' : '') + '>Overhead — no job</option><optgroup label=\"Open jobs\">' + list + '</optgroup>';\n",
  "  return '<option value=\"\">— pick the job —</option>' + " + NJ + " + '<option value=\"__oh\"' + (sel === '__oh' ? ' selected' : '') + '>Overhead — no job</option><optgroup label=\"Open jobs\">' + list + '</optgroup>';   " + MARK + "\n"),
 ("<select id=\"_jJob\" style=\"padding:6px;max-width:70%\"><option value=\"\">— link to a job —</option>'+jobs.map",
  "<select id=\"_jJob\" data-gcnj-from=\"QuickBooks: '+esc(q.name||'')+'\" style=\"padding:6px;max-width:70%\"><option value=\"\">— link to a job —</option>'+" + NJ + "+jobs.map"),
 # 5. version
 ('<!-- GrayCo CRM Build: ' + OLD_V + ' -->', '<!-- GrayCo CRM Build: ' + NEW_V + ' -->'),
 ('  console.log("[GC] Build ' + OLD_V + '");', '  console.log("[GC] Build ' + NEW_V + '");'),
 ('  var BUILD_ID = "' + OLD_V + '";', '  var BUILD_ID = "' + NEW_V + '";'),
]
src = open(INDEX, encoding='utf-8').read()
if '__GC_PATCH_INBOXNEWJOB__' in src:
    print('already patched'); sys.exit(0)
for a, b in EDITS:
    n = src.count(a); assert n == 1, ('anchor count', n, a[:90]); src = src.replace(a, b)
tail = open(os.path.join(H, 'inboxnewjob_tail.js'), encoding='utf-8').read().rstrip('\n')
i = src.rfind('</script>'); assert i > 0; i += len('</script>')
src = src[:i] + '\n' + tail + src[i:]
open(INDEX, 'w', encoding='utf-8').write(src)
vt = os.path.join(H, '..', 'version.txt')
if os.path.exists(vt) and os.path.dirname(os.path.abspath(INDEX)) == os.path.dirname(os.path.abspath(vt)):
    open(vt, 'w').write(NEW_V + '\n')
print('patched INBOXNEWJOB')
