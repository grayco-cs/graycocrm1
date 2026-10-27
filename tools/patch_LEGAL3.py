#!/usr/bin/env python3
"""Idempotent patch LEGAL3 (counsel review, Part B): the missing marketing / collections / HR / bond documents + the consistency fixes in index.html.

    python3 tools/patch_LEGAL3.py [index.html]        (default: ./index.html)

What it changes in index.html (server functions and public pages are edited directly, not here):
  1. LATE FEE, one policy everywhere: "1.5% per month (18% annual percentage rate), or the maximum rate allowed by law, whichever is less".
     contracts (Residential / Commercial / generated contract text), the printed contract, both print invoices, the Commercial proposal,
     the GrayCo-format proposal (also: attorney fees now MUTUAL - prevailing party), the short-form contract, the library contract and
     Payment Terms. The conflicting "10% per annum ... TN Code 47-14-103" wording is removed.
  2. NEW library documents (📚 Company Documents), from tools/legal3_docs.py, each ending "Form rev. 10/26/2026":
       Marketing & Referrals: Referral Program Terms, Referral Partner Agreement, $100 Coupon Terms, Giveaway Official Rules, Giveaway Winner Affidavit
       Collections: Notice of Intent to Lien (TN / MS / AR), Final Demand Letter (office-send only; nothing sends them automatically)
       HR (ADMIN ONLY): Employee Handbook, Confidentiality & Non-Solicitation Agreement, Independent Contractor (1099) Agreement
       Bonds & Surety: Surety Bond Request Letter, Bid Bond Request Form
     Admin-only note "DRAFT — pending attorney review (sent 10/26)" on each (Company Documents list + template editor; never printed / sent).
     The HR category is hidden from everyone who is not an admin (document list, job document pack, template fetch).
  3. Giveaway (Marketing → 🎁 Giveaway): the default Official Rules replace [ELIGIBILITY] / [DATES] with the full text; dates and prize value are
     owner-editable fields; saved old rules that still hold the placeholders fall back to the new default.
  4. Coupons (Marketing → 🎟 Coupons): "expires after N days" setting (default 90) and the expiry shown on a coupon check.
  5. The Invitation-to-Bid text: "Licensed General Contractor (TN & MS)" -> "(TN · MS · AR)".
Every find-string must occur the stated number of times (once unless noted). Re-running changes nothing.
"""
import sys, os, re, json, html, subprocess, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import legal3_docs as L3
import legal3_rules as R3

ipath = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(ipath, encoding='utf-8').read()
MARK = 'LEGAL3-patch'
if MARK in src:
    print('already patched'); sys.exit(0)


def once(old, new, label, n=1):
    global src
    c = src.count(old)
    assert c == n, ('anchor count != %d' % n, label, c)
    src = src.replace(old, new)


# ------------------------------------------------------------------------------------------------ 1. LATE FEE
CORE = "1.5% per month (18% annual percentage rate), or the maximum rate allowed by law, whichever is less"
LATE = "a late charge of 1.5% per month (18% annual percentage rate) on the past-due balance, or the maximum rate allowed by law, whichever is less"

# contracts: Residential, Commercial and the contract generator (three copies of the same sentence)
once("Unpaid invoices accrue interest at 1.5% per month (18% annually).", "Unpaid invoices accrue " + LATE + ".", 'late-contract', 3)
# printed contract (section 4)
once("Invoices not paid within 30 days accrue interest at 1.5% per month (18% annually).", "Invoices not paid within 30 days accrue " + LATE + ".", 'late-print-contract')
# print invoice 1 and 2
once("'Balances unpaid after 30 days accrue interest at 1.5% per month (18% annually). ',", "'Balances unpaid after 30 days accrue " + LATE + ". ',", 'late-invoice-1')
once("'Late balances accrue 1.5%/month (18% annually). ',", "'Balances unpaid after 30 days accrue " + LATE + ". ',", 'late-invoice-2')
# Commercial proposal (was "10% per annum ... TN Code 47-14-103")
once("Late payments are subject to 10% per annum, the maximum permitted under Tennessee law (TN Code 47-14-103), accruing from the original due date.",
     "A late charge of " + CORE + ", applies to late payments from the original due date.", 'late-commercial-proposal')
# Residential proposal notes (had no late-fee line)
once('Payment terms: Net 30 from invoice date unless otherwise agreed in writing.","Changes to scope',
     'Payment terms: Net 30 from invoice date unless otherwise agreed in writing.","Unpaid balances accrue ' + LATE + '.","Changes to scope', 'late-residential-proposal')
# GrayCo-format proposal: attorney fees MUTUAL, late payment one wording
once("<b>LEGAL FEES:</b> In the event that litigation arises concerning this contract between GrayCo Construction Services, LLC and the customer, and GrayCo Construction Services, LLC is determined to be the prevailing party or is found to be without fault, the customer shall be held responsible for the reimbursement of any and all legal fees and costs incurred as a result of said litigation.",
     "<b>LEGAL FEES:</b> In the event that litigation arises concerning this contract between GrayCo Construction Services, LLC and the customer, the prevailing party shall be entitled to recover its reasonable attorney\\'s fees, court costs and related expenses from the non-prevailing party.", 'fees-grayco-proposal')
once("<b>LATE PAYMENT:</b> Accounts not paid within the specified 30-day period are subject to ten percent (10%) per annum, which is the maximum rate permitted under Tennessee Law (Tennessee code 47-14-103). Interest charges will accrue from the original due date until payment is received in full.",
     "<b>LATE PAYMENT:</b> Accounts not paid within the specified 30-day period accrue " + LATE + ", from the original due date until payment is received in full.", 'late-grayco-proposal')
# short-form contract (had NO payment / late-fee terms)
once(": 'As invoiced per the accepted proposal.');",
     ": 'As invoiced per the accepted proposal.');\n    P.txt('Payment is due within 30 days of each invoice. Unpaid invoices accrue " + LATE + ".');   /* LEGAL3-patch: the one late-fee wording */", 'late-shortform')
# library contract + Payment Terms
once("Invoices are due on receipt unless the proposal says otherwise. Questions about invoices: {billing_email}.",
     "Invoices are due on receipt unless the proposal says otherwise. Unpaid balances accrue " + LATE + ". Questions about invoices: {billing_email}.", 'late-lib-contract')
once("Past-due balances may delay scheduling of remaining work. Final payment is due at substantial completion.",
     "Past-due balances may delay scheduling of remaining work, and accrue " + LATE + ". Final payment is due at substantial completion.", 'late-lib-payterms')

# ------------------------------------------------------------------------------------------------ 5. ITB licence line
once("Licensed General Contractor (TN & MS)", "Licensed General Contractor (TN \\u00b7 MS \\u00b7 AR)", 'itb-license')

# ------------------------------------------------------------------------------------------------ 3. GIVEAWAY editor (Marketing → Giveaway)
txt = R3.rules_text()
parts = txt.split('{company_address}')
js_rules = "'" + "' + window._gcCompanyAddress() + '".join(p.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') for p in parts) + "'"
i = src.index("var RULES = 'NO PURCHASE NECESSARY.")
assert src.count("var RULES = 'NO PURCHASE NECESSARY.") == 1
j = src.index("Facebook, Instagram or Google.';", i) + len("Facebook, Instagram or Google.';")
src = (src[:i] + "var RULES = " + js_rules + ";   /* LEGAL3-patch: full Official Rules; [START DATE] [END DATE] [DRAW DATE] [PRIZE] [PRIZE VALUE] come from the fields above the box */" + src[j:])
DIS = "(admin() ? '' : ' disabled')"
once("""'<label>Official rules (fill [DATES] and [ELIGIBILITY])</label><textarea id="gw-rules" rows="7"' + (admin() ? '' : ' disabled') + '>' + esc(g.rules || RULES) + '</textarea>'""",
     """'<label>Entry period starts</label><input id="gw-start" type="date" value="' + esc(g.startDate || new Date().toISOString().slice(0, 7) + '-01') + '"' + (admin() ? '' : ' disabled') + '><label>Entry period ends</label><input id="gw-end" type="date" value="' + esc(g.endDate || (function(){ var d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); })()) + '"' + (admin() ? '' : ' disabled') + '><label>Prize value (approximate retail value, $)</label><input id="gw-value" placeholder="e.g. 75" value="' + esc(g.prizeValue || '') + '"' + (admin() ? '' : ' disabled') + '>' +
    '<label>Official rules (the dates, prize and prize value above are filled in on the public page — edit the wording here if counsel changes it)</label><textarea id="gw-rules" rows="12"' + (admin() ? '' : ' disabled') + '>' + esc(g.rules && !/\\[ELIGIBILITY\\]|\\[DATES\\]/.test(g.rules) ? g.rules : RULES) + '</textarea>'""", 'gw-editor')
once("{ prize: s(D.getElementById('gw-prize').value) || 'a FREE handyman hour', status: D.getElementById('gw-status').value, rules: D.getElementById('gw-rules').value }));",
     "{ prize: s(D.getElementById('gw-prize').value) || 'a FREE handyman hour', status: D.getElementById('gw-status').value, rules: D.getElementById('gw-rules').value, startDate: s(D.getElementById('gw-start').value), endDate: s(D.getElementById('gw-end').value), prizeValue: s(D.getElementById('gw-value').value).replace(/^\\$/, '') }));   /* LEGAL3-patch */", 'gw-save')
once("toast('Saved.'); };\nACT['gw-draw']", "toast(s(D.getElementById('gw-value').value) ? 'Saved.' : 'Saved. Tip: add the prize value — the Official Rules show it.'); };\nACT['gw-draw']", 'gw-save-toast')
once("Every entrant joins GrayCo News (unsubscribe any time) and is a soft lead.",
     "An entrant joins GrayCo News only if they tick the optional box (unchecked by default); every entrant is a soft lead. The winner e-mail asks for the signed affidavit (📚 Company Documents → Giveaway Winner Affidavit).", 'gw-note')

# ------------------------------------------------------------------------------------------------ 4. COUPONS editor
once("""</label><span class="gmt-muted">GrayCo referral credit is always OK with it.</span>""",
     """</label><label style="margin:0;display:flex;gap:6px;align-items:center">Expires <input type="number" id="cp-days" min="1" max="730" style="width:70px" value="' + esc(String(c.days || 90)) + '"' + (admin() ? '' : ' disabled') + '> days after it is issued</label><span class="gmt-muted">GrayCo referral credit is always OK with it.</span>""", 'cp-days-input')
once("combinable: D.getElementById('cp-comb').checked, min: 1000 }",
     "combinable: D.getElementById('cp-comb').checked, min: 1000, days: Math.max(1, Math.min(730, parseInt(D.getElementById('cp-days').value, 10) || 90)) }", 'cp-days-save')
once("CP.check = { ok: !!(j && j.ok && !j.redeemed), msg:", "CP.check = { ok: !!(j && j.ok && !j.redeemed && !j.expired), msg:", 'cp-check-ok')
once("'Valid — ' + j.name + ', from ' + j.source + ', claimed ' + s(j.claimedAt).slice(0, 10))",
     "(j.expired ? 'EXPIRED ' + s(j.expires) + ' — ' + j.name + ', from ' + j.source : 'Valid — ' + j.name + ', from ' + j.source + ', claimed ' + s(j.claimedAt).slice(0, 10) + (j.expires ? ', expires ' + s(j.expires) : ' (no expiration date — claimed before expirations)')))", 'cp-check-msg')


# ------------------------------------------------------------------------------------------------ 2. NEW library documents
def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\[\[(.*?)\]\]', lambda m: '<span style="background:#fff3bf;border-radius:2px;padding:0 2px">[' + m.group(1) + ']</span>', t)
    return t.replace('\n', '<br>')


def render(d):
    out = ['<h2 style="text-align:center;font-size:15pt;margin:4px 0 2px;color:#0f2440;letter-spacing:.3px">' + html.escape(d['name']) + '</h2>' +
           ('<div style="text-align:center;font-size:9.5pt;color:#555;margin-bottom:10px">' + html.escape(d['subtitle']) + '</div>' if d['subtitle'] else '<div style="height:8px"></div>')]
    line = lambda label: '<td style="padding:22px 8px 4px;vertical-align:bottom;width:50%"><div style="border-top:1px solid #333;padding-top:3px;font-size:9pt;color:#444">' + label + '</div></td>'
    for b in d['blocks']:
        k = b[0]
        if k == 'h':
            out.append('<h3 style="font-size:12pt;margin:16px 0 6px;color:#0f2440">' + inline(b[1]) + '</h3>')
        elif k == 'p':
            out.append('<p style="margin:0 0 10px;line-height:1.55">' + inline(b[1]) + '</p>')
        elif k == 'note':
            out.append('<p style="margin:0 0 10px;font-size:9pt;color:#555;font-style:italic">' + inline(b[1]) + '</p>')
        elif k == 'ul':
            out.append('<ul style="margin:0 0 10px 20px;padding:0;line-height:1.5">' + ''.join('<li style="margin:0 0 5px">' + inline(x) + '</li>' for x in b[1]) + '</ul>')
        elif k == 'info':
            out.append('<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:6px 0 12px">' + ''.join(
                '<tr><td style="padding:4px 6px;width:34%;color:#555;border-bottom:1px solid #e5e7eb">' + inline(r[0]) + '</td><td style="padding:4px 6px;border-bottom:1px solid #e5e7eb"><b>' + inline(r[1]) + '</b></td></tr>' for r in b[1]) + '</table>')
        elif k == 'sigs':
            out.append('<table style="width:100%;border-collapse:collapse;margin-top:18px"><tr>' + line(b[1] + ' — signature') + line(b[2] + ' — signature') + '</tr><tr>' + line('Printed name / title') + line('Printed name / title') + '</tr><tr>' + line('Date') + line('Date') + '</tr></table>')
        else:
            raise ValueError(k)
    out.append('<p style="margin:18px 0 0;font-size:8.5pt;color:#777;text-align:right" data-gc-formrev="1">' + L3.REV + '</p>')
    return ''.join(out)


def esc_js(s):
    return json.dumps(s, ensure_ascii=False).replace('</', '<\\/').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


calls = []
for d in L3.DOCS:
    scope = 'project' if d['category'] in ('Collections',) else 'company'
    calls.append("add({ id: %s, name: %s, category: %s, scope: %s, jobTypes: %s, clientFacing: %s, adminOnly: %s, officeSend: %s, flags: %s, body: %s });" % (
        esc_js(d['id']), esc_js(d['name']), esc_js(d['category']), esc_js(scope), json.dumps(d['jobtypes']), 'true' if d['client'] else 'false', 'true' if d['admin_only'] else 'false',
        'true' if d['category'] == 'Collections' else 'false', esc_js(d['flags']), esc_js(render(d))))

SCRIPT = r"""<script id="gc-patch-legal3">
/* __GC_PATCH_LEGAL3__ — counsel review Part B: the missing marketing, collections, HR and bond documents, added to the 📚 Company Documents library
   (window._gcDocLib.builtins(), patch DOCLIB). Every one is a DRAFT: an admin-only note "DRAFT — pending attorney review (sent 10/26)" shows beside it in
   the Company Documents list and in the template editor (never on a printed / e-mailed copy); every document ends "Form rev. 10/26/2026".
     • HR documents (category "HR": Employee Handbook, Confidentiality & Non-Solicitation, Independent Contractor 1099) are ADMIN ONLY — hidden from the
       document list, a job's document pack and the template fetch for anyone who is not an admin.
     • Collections letters (Notice of Intent to Lien TN / MS / AR, Final Demand) are office-send only: 📧 Send goes through ✅ Approvals; nothing in the CRM
       or its scheduled functions sends them on its own.
   The text lives in tools/legal3_docs.py. API: window._gcLegal3 = { docs, ids, note } */
(function(){
'use strict';
if (window.__GC_PATCH_LEGAL3__) return; window.__GC_PATCH_LEGAL3__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var NOTE = %%NOTE%%;
var LIB = W._gcDocLib, L = LIB && LIB.builtins && LIB.builtins();
if (!L) { try { console.warn('[GC] LEGAL3: the document library is not loaded'); } catch (e) {} return; }
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function me(){ try { return JSON.parse(localStorage.getItem('grayco_user') || '{}') || {}; } catch (e) { return {}; } }
function isAdmin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} var u = me(); return /admin|owner/i.test(s(u.role)) || s(u.payType).toLowerCase() === 'owner'; }
function addr(){ try { return W._gcCompanyAddress ? W._gcCompanyAddress() : '4007 Broadway Rd, Bartlett, TN 38135'; } catch (e) { return '4007 Broadway Rd, Bartlett, TN 38135'; } }
var IDS = {}, DOCS = [];
function add(d){
  var id = 'gcb_' + d.id; if (IDS[id]) return;
  var t = { id: id, file: id + '.html', name: d.name, category: d.category, scope: d.scope, jobTypes: d.jobTypes, clientFacing: d.clientFacing, editable: true, builtin: true, kind: 'html',
    body: d.body.replace(/\{company_address\}/g, esc(addr())), adminOnly: !!d.adminOnly, officeSend: !!d.officeSend, flags: d.flags || [], l3: true };
  if (!L.some(function(x){ return x && x.id === id; })) L.push(t);
  IDS[id] = t; DOCS.push(t);
}
%%CALLS%%
/* ── HR is admin only ── */
function isHr(x){ return !!(x && (x.adminOnly || (IDS[x.id] && IDS[x.id].adminOnly))); }   /* only the documents added here; nothing the CRM already had is hidden */
var prevIdx = W._fetchDocIndex;
W._fetchDocIndex = function(){
  var r = prevIdx ? prevIdx.apply(this, arguments) : Promise.resolve([]);
  return Promise.resolve(r).then(function(t){ if (isAdmin()) return t; var out = (t || []).filter(function(x){ return !isHr(x); }); W._docIndex = out; return out; });
};
var prevOne = W._fetchOneTpl;
W._fetchOneTpl = function(id){ var b = IDS[id]; if (b && isHr(b) && !isAdmin()) return Promise.resolve(null); return prevOne ? prevOne.apply(this, arguments) : Promise.resolve(null); };
/* ── the admin-only DRAFT note: Company Documents list + template editor (never printed, never sent) ── */
function chip(txt){
  var e = D.createElement('span'); e.setAttribute('data-gc-admin-note', 'legal3'); e.textContent = txt;
  e.style.cssText = 'display:inline-block;margin-top:3px;font-size:10.5px;font-weight:600;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:2px 6px';
  return e;
}
function decorateList(n){
  var body = D.getElementById('_docLibBody');
  if (!body || !body.querySelector('[onclick*="_dlTplData"]')) { if (n < 40) ST.call(W, function(){ decorateList(n + 1); }, 150); return; }
  if (!isAdmin()) return;
  [].slice.call(body.querySelectorAll('[onclick*="_dlTplData"]')).forEach(function(b){
    var m = /_dlTplData\('([^']+)'\)/.exec(b.getAttribute('onclick') || ''), d = m && IDS[m[1]]; if (!d) return;
    var row = b.parentElement && b.parentElement.parentElement; if (!row || row.querySelector('[data-gc-admin-note="legal3"]')) return;
    var nm = row.firstElementChild; if (!nm) return;
    nm.appendChild(D.createElement('br')); nm.appendChild(chip(NOTE + (d.officeSend ? ' · office-send only, never automatic' : '') + (isHr(d) ? ' · admins only' : '')));
  });
}
var prevLib = W._docLibrary;
W._docLibrary = function(){ watch(); var r = prevLib ? prevLib.apply(this, arguments) : null; decorateList(0); return r; };
function decorateEdit(ov){
  if (!isAdmin() || ov.querySelector('[data-gc-admin-note="legal3"]')) return;
  var head = ov.querySelector('b'), nm = head ? head.textContent.replace(/^\s*\S+\s/, '').replace(/\(edited\)\s*$/, '').trim() : '';
  var d = DOCS.filter(function(x){ return x.name === nm; })[0] || DOCS.filter(function(x){ return nm.indexOf(x.name) >= 0; })[0]; if (!d) return;
  var box = [].slice.call(ov.querySelectorAll('div')).filter(function(x){ return /^Admin note \(never printed\)/.test(x.textContent || ''); })[0]; if (!box) return;
  box.appendChild(D.createElement('br')); box.appendChild(chip(NOTE));
  if (d.officeSend) { box.appendChild(D.createElement('br')); box.appendChild(chip('Office use: never sent automatically — 📧 Send waits in ✅ Approvals.')); }
  if (d.flags && d.flags.length) { var f = D.createElement('div'); f.setAttribute('data-gc-admin-note', 'legal3'); f.style.cssText = 'margin-top:4px;font-size:10.5px;color:#92400e'; f.textContent = 'For counsel: ' + d.flags.join(' • '); box.appendChild(f); }
}
var obs = null, obsBody = null;
function watch(){   /* the editor overlay is appended straight to <body>; (re)attach to the body that is there now */
  try {
    if (!D.body || obsBody === D.body) return;
    if (obs) obs.disconnect();
    obs = new MutationObserver(function(ms){ ms.forEach(function(m){ [].slice.call(m.addedNodes || []).forEach(function(n){ if (n && n.id === '_dlEditOv') ST.call(W, function(){ decorateEdit(n); }, 0); }); }); });
    obs.observe(D.body, { childList: true }); obsBody = D.body;
  } catch (e) {}
}
if (D.body) watch(); else D.addEventListener('DOMContentLoaded', watch);
var prevEdit = LIB.edit;
LIB.edit = function(id){ watch(); var r = prevEdit ? prevEdit.apply(this, arguments) : null; if (IDS[id]) ST.call(W, function(){ var ov = D.getElementById('_dlEditOv'); if (ov) decorateEdit(ov); }, 600); return r; };
W._gcLegal3 = { docs: function(){ return DOCS.slice(); }, ids: IDS, note: NOTE, decorateEdit: decorateEdit, decorateList: decorateList };
try { console.log('[GC] ⚖️ Part B drafts (patch LEGAL3): ' + DOCS.length + ' documents in 📚 Company Documents — _gcLegal3'); } catch (e) {}
})();
</script>"""
SCRIPT = SCRIPT.replace('%%NOTE%%', esc_js(L3.DRAFT_NOTE)).replace('%%CALLS%%', '\n'.join(calls))

# syntax-check the new script (when node is around)
try:
    body = SCRIPT[len('<script id="gc-patch-legal3">'):-len('</script>')]
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(body); tmp = f.name
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    os.unlink(tmp)
    assert r.returncode == 0, r.stderr
except FileNotFoundError:
    pass

# the unified Documents list (patch DOCS3) shows a fixed set of groups; our categories map onto it: Marketing / Client (collections letters) / HR / Commercial (bonds)
GROUP_OF = {'Marketing & Referrals': 'Marketing', 'Collections': 'Client', 'HR': 'HR', 'Bonds & Surety': 'Commercial'}
tplg = ', '.join("gcb_%s: '%s'" % (d['id'], GROUP_OF[d['category']]) for d in L3.DOCS)
once("var TPL_GROUP = { gcb_scope: 'Client',", "var TPL_GROUP = { " + tplg + ", gcb_scope: 'Client',", 'tplgroup')

ANCHOR = "try { console.log('[GC] 📚 Built-in document library (patch DOCLIB): ' + L.length + ' documents — _gcDocLib'); } catch (e) {}\n})();\n</script>"
once(ANCHOR, ANCHOR + "\n" + SCRIPT + "\n<!-- " + MARK + " -->", 'script-after-doclib')

open(ipath, 'w', encoding='utf-8').write(src)
print('patched LEGAL3:', ipath, '(%d documents)' % len(L3.DOCS))
