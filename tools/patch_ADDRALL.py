#!/usr/bin/env python3
"""patch ADDRALL — the ONE company address on everything (owner: "if I ever switch the address for any reason in the CRM,
make sure it always updates my address on everything — brochures etc, everything in the CRM, all contracts etc.").

  python3 tools/patch_ADDRALL.py [index.html]      (idempotent: a second run changes nothing)

index.html:
  1. the inlined gc-address.js = the file (window._gcCompanyAddress.ready, the "gc:company-address" event, the history
     of earlier addresses: a paper dated before a change keeps the address it was made with).
  2. the built-in contracts (residential / commercial / insurance / roofing / mold): the notice-of-cancellation and the
     notices clause print the company address from the setting when the contract is made (no 4007 in the text).
  3. the document library: {company_address} is a merge field; the LEGAL2 templates (lien notices, E-SIGN, portal and sub
     portal terms, privacy, MSA, the TN / MS / AR riders) and the LEGAL3 ones use it, filled when the paper is made.
  4. a saved / signed paper is never rewritten (the old "a saved paper shows today's address" swap is gone).
  5. pay stubs, the e-mail ask for a W-9 / COI, the marketing privacy filter, the Facebook post, the W-9 row, the
     listings checklist and the training text follow the setting.
  6. ⚙ Admin → 🏢 Company address: saving a NEW address (or switch date) first shows what changes and what keeps the old
     address, then adds the To-Dos for what the CRM cannot change (website, Google, printed stock, bank / insurance /
     suppliers, licenses, Secretary of State / IRS / tax, vehicles, bonding, bid platforms, listings) for Wesley + Nick.
  7. 🖨 Print pack: the PDFs carry the address they were built with (print/manifest.json). When the company address is
     different, Print / Copy link / E-mail / Text open the HTML print versions (print/<slug>.html, same pages, the new
     address), the page says "PDFs being rebuilt with the new address" and the admins get the To-Do
     "Rebuild print PDFs (address changed)" (tools/printpack/rebuild.sh). Back to the PDFs by itself when they match.
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_ADDRALL__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)


def once(s, a, b, what, n=1):
    c = s.count(a)
    assert c == n, '%s: expected %d, found %d' % (what, n, c)
    return s.replace(a, b)


ADDR0 = '4007 Broadway Rd, Bartlett, TN 38135'

# ── 1. the inlined gc-address.js ──
old_ga = open(os.path.join(ROOT, 'tools', 'addrall', 'gc-address.before.js'), encoding='utf-8').read().strip()
new_ga = open(os.path.join(ROOT, 'gc-address.js'), encoding='utf-8').read().strip()
src = once(src, old_ga, new_ga, 'inline gc-address.js')

# ── 2. the built-in contracts (template literals inside the proposal / contract maker; one jsPDF copy) ──
lines = src.split('\n')
n_cancel = n_notice_tl = n_notice_js = 0
CANCEL = 'deliver, mail or e-mail it to GrayCo Construction Services, LLC, ' + ADDR0 + ', office@'
NOTICE = 'at the mailing address shown at the top of this Agreement (Bartlett, TN 38135)'
for i, l in enumerate(lines):
    if CANCEL in l:
        assert l.lstrip()[:1].isdigit(), 'cancel clause outside a template literal: line %d' % (i + 1)
        lines[i] = l.replace(CANCEL, 'deliver, mail or e-mail it to GrayCo Construction Services, LLC, ${window._gcCompanyAddress()}, office@'); n_cancel += 1
    if NOTICE in l:
        if l.lstrip().startswith("L.push('15. NOTICE"):
            lines[i] = l.replace(NOTICE, "at the mailing address shown at the top of this Agreement (' + window._gcCompanyAddress() + ')"); n_notice_js += 1
        else:
            assert l.startswith('15. NOTICE'), 'notices clause outside a template literal: line %d' % (i + 1)
            lines[i] = l.replace(NOTICE, 'at the mailing address shown at the top of this Agreement (${window._gcCompanyAddress()})'); n_notice_tl += 1
assert (n_cancel, n_notice_tl, n_notice_js) == (5, 2, 1), (n_cancel, n_notice_tl, n_notice_js)
src = '\n'.join(lines)

# ── 3. the document library: {company_address} ──
lines = src.split('\n')
n_l2 = 0
for i, l in enumerate(lines):
    if l.startswith('T("') and ', l2([' in l and ADDR0 in l:
        n_l2 += l.count(ADDR0); lines[i] = l.replace(ADDR0, '{company_address}')
assert n_l2 == 12, n_l2
src = '\n'.join(lines)
src = once(src, "var FIELDS = ['customer', 'gc', 'job_name', 'job_address', 'po', 'date', 'contract_amount', 'pm', 'office_phone', 'billing_email', 'license'];",
           "var FIELDS = ['customer', 'gc', 'job_name', 'job_address', 'po', 'date', 'contract_amount', 'pm', 'office_phone', 'billing_email', 'license', 'company_address', 'company_street'];   /* + patch ADDRALL */", 'doclib FIELDS')
src = once(src, "    license: s(B.licenses) || 'TN #85034 BCB'\n  };",
           "    license: s(B.licenses) || 'TN #85034 BCB',\n"
           "    /* patch ADDRALL: the company address from the ONE setting, on the day the paper is made */\n"
           "    company_address: (function(){ try { return s(W._gcCompanyAddress()); } catch (e) { return s(B.address); } })(),\n"
           "    company_street: (function(){ try { return s(W._gcCompanyStreet()); } catch (e) { return s(B.street); } })()\n  };", 'doclib fieldsFor')
src = once(src, """function fill(html, f){
  return String(html || '').replace(/\\{([a-z_]+)\\}/g, function(m, k){""",
           """function fill(html, f){
  /* patch ADDRALL: a template (built in, or edited and saved by an admin) that still has an earlier company address in its
     text gets today's; papers already made / signed are never filled again, so they keep theirs */
  try { var ca = s(f.company_address), cfg = W._gcCompanyAddress.config(), olds = [cfg.current, cfg.next, '""" + ADDR0 + """', '4014 Broadway Rd, Bartlett, TN 38135'].concat((cfg.history || []).map(function(x){ return x.address; }));
    if (ca) olds.forEach(function(o){ o = s(o); if (o && o !== ca) html = String(html || '').split(o).join('{company_address}'); }); } catch (e) {}
  return String(html || '').replace(/\\{([a-z_]+)\\}/g, function(m, k){""", 'doclib fill')
src = once(src, "body: d.body.replace(/\\{company_address\\}/g, esc(addr())),", "body: d.body,   /* patch ADDRALL: {company_address} is filled when the paper is made (doc library fill) */", 'LEGAL3 add')

# ── 4. no rewriting of saved / signed papers ──
src = once(src, "    .replace(/\\b(40(?:07|14)) Broadway Rd\\.,/g, '$1 Broadway Rd,')\n", '', 'brandHtml 1')
src = once(src, "    .replace(/\\b40(?:07|14) Broadway Rd,? Bartlett,? TN 38135/g, B.address);   /* patch ADDR2: a saved paper shows today's address */",
           "    ;   /* patch ADDRALL: a saved or signed paper keeps the company address it was made with (no swap here any more) */", 'brandHtml 2')

# the letterhead added to a window with no logo: never on a paper that carries an earlier company address (made before)
src = once(src, "    var added = false;\n    if (!hasHeader(d)) {\n      var box = d.createElement('div'); box.innerHTML = W._gcDocHeader({});",
           "    var added = false;\n"
           "    /* patch ADDRALL: a paper made before an address change keeps its own address — no letterhead with today's on top */\n"
           "    try { var tx = d.body.innerText || d.body.textContent || '', cur = W._gcCompanyAddress(), cf = W._gcCompanyAddress.config();\n"
           "      if (tx.indexOf(cur) < 0 && [cf.current, cf.next, '" + ADDR0 + "', '4014 Broadway Rd, Bartlett, TN 38135'].concat((cf.history || []).map(function(x){ return x.address; })).some(function(o){ return o && o !== cur && tx.indexOf(o) >= 0; })) { root.setAttribute('data-gc-logo-done', 'earlier-address'); return false; } } catch (e) {}\n"
           "    if (!hasHeader(d)) {\n      var box = d.createElement('div'); box.innerHTML = W._gcDocHeader({});", 'logo injector')

# ── 5. the rest that still named the address ──
src = once(src, '"GrayCo Construction Services, LLC\\n" + window._gcCompanyStreet() + "\\nBartlett, TN 38135\\n\\n" +',
           '"GrayCo Construction Services, LLC\\n" + window._gcCompanyAddress().replace(/,\\s*/, "\\n") + "\\n\\n" +', 'W-9/COI request letter')
src = once(src, "'Our own W-9 with the new address (' + window._gcCompanyAddress.config().next + '), signed",
           "'Our own W-9 with the company address (' + window._gcCompanyAddress() + ', ⚙ Admin → 🏢 Company address), signed", 'W-9 row')
src = once(src, "name / address / phone checked — the 4014 Broadway move", "name / address / phone checked against ⚙ Admin → 🏢 Company address", 'listings row')
src = once(src, "GrayCo Construction here (we are on Broadway Rd in Bartlett).",
           "GrayCo Construction here (we are on ' + window._gcCompanyStreet().replace(/^\\d+[A-Za-z]?\\s+/, '') + ' in ' + ((window._gcCompanyAddress().split(',')[1] || 'Bartlett').trim()) + ').", 'facebook post')
src = once(src, "The move from 4007 to 4014 Broadway Rd on Oct 29, everywhere at once", "The ONE company address (and a scheduled move), everywhere at once", 'training text')
src = once(src, "esc(s.companyAddr||'')", "esc((function(){ try { return window._gcCompanyAddress(); } catch (e) { return s.companyAddr || ''; } })())", 'pay stub address')
src = once(src, "row('companyAddr','Company address on stubs',s.companyAddr,'')", "row('companyAddr','Company address on stubs (stubs use ⚙ Admin → 🏢 Company address)',s.companyAddr,'')", 'pay settings row')
CO_JS = ("(function(x){ x = String(x || '').trim().toLowerCase(); try { var c = window._gcCompanyAddress.config(); return [c.current, c.next, '4007 Broadway Rd', '4014 Broadway Rd'].concat((c.history || []).map(function(h){ return h.address; }))"
         ".some(function(a){ var st = String(a || '').split(',')[0].trim().toLowerCase(); var m = /^(\\d+[a-z]?)\\s+(\\S+)/.exec(st); return !!m && x.indexOf(m[1] + ' ' + m[2]) === 0; }); } catch (e) { return /^(4007|4014) broadway/.test(x); } })")
src = once(src, "if (m && !/^(4007|4014) broadway/.test(low(m[0])) && low(m[0]).indexOf('12060 donelson') < 0)",
           "if (m && !" + CO_JS + "(m[0]) && low(m[0]).indexOf('12060 donelson') < 0)", 'mkt privacy flag')
src = once(src, "if (/^(4007 broadway|4014 broadway|12060 donelson)/i.test(m)) return m;",
           "if (/^12060 donelson/i.test(m) || " + CO_JS + "(m)) return m;", 'mkt privacy scrub')

# the listings checker (Marketing → 📍 Listings): the street NAME comes from the setting, not "Broadway"
src = once(src, "function napCheck(row, addr, today){\n",
           "function stNameA(x){ var m = /^\\s*\\d+[A-Za-z]?\\s+([^,\\s]+)/.exec(s(x)); return m ? m[1].toLowerCase() : ''; }   /* patch ADDRALL */\n"
           "function sameStreetA(a, b){ var n = stNameA(b); return !!n && s(a).toLowerCase().indexOf(n) >= 0; }\n"
           "function napCheck(row, addr, today){\n", 'napCheck helpers')
src = once(src, "if (no && no === streetNo(expect) && /broadway/i.test(a)) { /* right */ }", "if (no && no === streetNo(expect) && sameStreetA(a, expect)) { /* right */ }", 'napCheck right')
src = once(src, "else if (no && other && no === streetNo(other) && /broadway/i.test(a)) {", "else if (no && other && no === streetNo(other) && sameStreetA(a, other)) {", 'napCheck other')
src = once(src, "'Still shows ' + no + ' Broadway — change it to '", "'Still shows ' + s(other).split(',')[0] + ' — change it to '", 'napCheck msg 1')
src = once(src, "'Shows ' + no + ' Broadway — that is the NEW address, live on '", "'Shows ' + s(other).split(',')[0] + ' — that is the NEW address, live on '", 'napCheck msg 2')
src = once(src, "fix: true, move: /broadway/i.test(a) });", "fix: true, move: sameStreetA(a, expect) || sameStreetA(a, other) });", 'napCheck move')
src = once(src, "Check the 4014 address.", "Check the company address (⚙ Admin → 🏢 Company address).", 'bing row')

# ── 6. ⚙ Admin → 🏢 Company address: confirm + history + To-Dos ──
src = once(src, "    b.disabled = true; A.set(v); addrChanged();\n    kvWrite(AKEY, v).then(function(ok){ b.disabled = false; box.querySelector('#gca-msg').textContent = ok ? '✓ Saved for everyone' : 'Saved on this computer — not reached the cloud yet'; var n = box.querySelector('#gca-now'); if (n) n.innerHTML = esc(summary()) + '<br><small>Showing today: <b>' + esc(A()) + '</b></small>'; });\n  };\n}\n",
           "    /* patch ADDRALL: what changes, the earlier address kept for papers made before today, the outside To-Dos */\n"
           "    var prev = A.config(), AX = W._gcADDRALL;\n"
           "    try { if (AX && AX.prepare) AX.prepare(prev, v); } catch (e) { warn(e); }\n"
           "    var save = function(){\n"
           "    b.disabled = true; A.set(v); addrChanged();\n"
           "    try { if (AX && AX.afterSave) AX.afterSave(prev, v); } catch (e) { warn(e); }\n"
           "    kvWrite(AKEY, v).then(function(ok){ b.disabled = false; box.querySelector('#gca-msg').textContent = ok ? '✓ Saved for everyone' : 'Saved on this computer — not reached the cloud yet'; var n = box.querySelector('#gca-now'); if (n) n.innerHTML = esc(summary()) + '<br><small>Showing today: <b>' + esc(A()) + '</b></small>'; });\n"
           "    };\n"
           "    if (AX && AX.confirm) { b.disabled = true; AX.confirm(prev, v).then(function(ok){ b.disabled = false; if (ok) save(); else box.querySelector('#gca-msg').textContent = 'Not saved.'; }, function(e){ b.disabled = false; warn(e); }); return; }\n"
           "    save();\n  };\n}\n", 'ADDR2 save')
src = once(src, "newsSlug: newsSlug };", "newsSlug: newsSlug, tasks: tasks, saveTasks: saveTasks, whoLabel: whoLabel, isAdmin: isAdmin, myEmail: myEmail, kvRead: kvRead };   /* + patch ADDRALL */", 'ADDR2 exports')

# ── 7. 🖨 Print pack: the HTML print versions while the PDFs carry another address ──
src = once(src, "function variant(p, v){ return v === 'shop' && p.shop ? { file: p.slug + '-printshop.pdf', how: p.shop, label: 'PRINTSHOP' } : { file: p.slug + '.pdf', how: p.office, label: 'OFFICE' }; }",
           "function variant(p, v){ var x = v === 'shop' && p.shop ? { file: p.slug + '-printshop.pdf', how: p.shop, label: 'PRINTSHOP' } : { file: p.slug + '.pdf', how: p.office, label: 'OFFICE' };\n"
           "  /* patch ADDRALL: the PDFs were built with another company address → the HTML print version (same pages, today's address) */\n"
           "  try { if (W._gcPPAddr && W._gcPPAddr.stale()) { x.file = x.file.replace(/\\.pdf$/, '.html'); x.html = true; } } catch (e) {}\n"
           "  return x; }", 'printpack variant')
src = once(src, "  var h = '<div class=\"gmt-card\"><h2>🖨 Print pack</h2><div>Every GrayCo brochure",
           "  var h = (W._gcPPAddr && W._gcPPAddr.banner ? W._gcPPAddr.banner() : '') + '<div class=\"gmt-card\"><h2>🖨 Print pack</h2><div>Every GrayCo brochure", 'printpack banner')
src = once(src, "ACT['pp-print'] = function(b){ var w = W.open(rel(b.getAttribute('data-f')), '_blank'); if (!w) toast('Allow pop-ups to open the PDF.', true); };",
           "ACT['pp-print'] = function(b){ var f = b.getAttribute('data-f'); var w = W.open(rel(f) + (/\\.html$/.test(f) ? '?print=1' : ''), '_blank'); if (!w) toast('Allow pop-ups to open the PDF.', true); };", 'printpack print')

# ── the ADDRALL script (end of the page) ──
JS = open(os.path.join(ROOT, 'tools', 'addrall', 'addrall.js'), encoding='utf-8').read()
assert MARK in JS
END = "})();\n</script>\n"
assert src.endswith(END), 'the page does not end with a script'
src = src + '<script id="gc-patch-addrall">\n' + JS.strip() + '\n</script>\n'
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
