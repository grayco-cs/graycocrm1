#!/usr/bin/env python3
"""patch APEMAILS (owner 11/27): several client e-mails and several accounts-payable e-mails per customer; money mail
(invoices, statements, past-due reminders, pay apps) goes TO every accounts-payable address with the client in CC.

"make sure i can put client emails and on the account for a customer i can also put accounts [payable] sometimes its
more than 1 so when i submit for invoice on my system i also email their accounts payable our invoices etc"

index.html
  · Customers → Edit Customer: "📧 E-mail for this customer" (Client e-mails / Accounts payable e-mails: ＋, ✕, a label
    each, inline check) — window._gcAMEditor; the old Email / Billing Email boxes are row 0 of their list
    (window._gcAMSet1); Save keeps the lists tidy and stamps the record (window._gcAMNorm) on the normal save (So).
  · ✏️ Edit Project: the account's lists read-only + "✏️ Edit on the customer" + more client e-mails for this job
    (moreClientEmails via window._gcxPatchJob; added to SYNC-A's person-edit fields).
  · the CRM invoice e-mail sends its CC and several To; the ✅ Approvals e-mail preview shows / edits several To.
  · tools/apemails_tail.js appended (window._gcAcctMail, the compose-time rule on top of SUBAP).
netlify/functions
  · _lib/apmail.js (new, the server copy of the rule) — portal.js queueApproval addresses money items, aqSend and the
    approved-reminder resend re-check the account at send time (a removed address never goes), approver edits take
    several To; queueInvoiceMail / runReminders / auto-ar / offfeat / x10 statements find the AP address when the job
    has no client e-mail.
Usage: python3 tools/patch_APEMAILS.py [repo root]
"""
import sys, os
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
if ROOT.endswith('index.html'): ROOT = os.path.dirname(ROOT) or '.'
TAG = 'patch APEMAILS'

def load(rel):
    return open(os.path.join(ROOT, rel), encoding='utf-8').read()
def save(rel, s):
    open(os.path.join(ROOT, rel), 'w', encoding='utf-8').write(s)
def rep(s, old, new, rel):
    n = s.count(old)
    assert n == 1, (rel, n, old[:120])
    return s.replace(old, new)

# ───────────────────────────── index.html ─────────────────────────────
rel = 'index.html'
s = load(rel)
if '__GC_APEMAILS__' in s:
    print('index.html already patched')
else:
    # the old single boxes are row 0 of their list
    s = rep(s, 'value:z.email,onChange:Ve=>De({...z,email:Ve.target.value}),placeholder:"client@email.com"',
               'value:z.email,onChange:Ve=>De(window._gcAMSet1?window._gcAMSet1(z,"client",Ve.target.value):{...z,email:Ve.target.value})/* patch APEMAILS */,placeholder:"client@email.com"', rel)
    s = rep(s, 'value:z.gcInfo.billingEmail,onChange:Ve=>De({...z,gcInfo:{...z.gcInfo,billingEmail:Ve.target.value}}),placeholder:"ap@theircompany.com"',
               'value:z.gcInfo.billingEmail,onChange:Ve=>De(window._gcAMSet1?window._gcAMSet1(z,"ap",Ve.target.value):{...z,gcInfo:{...z.gcInfo,billingEmail:Ve.target.value}})/* patch APEMAILS */,placeholder:"ap@theircompany.com"', rel)
    # Save: the lists tidied, a real save stamp — the CRM's normal customer save (So → the customers list setter)
    s = rep(s, 'So({...z,id:z.id||$t("CUS")}),q(z)',
               '(function(_r){_r=window._gcAMNorm?window._gcAMNorm(_r):_r;So(_r);window._gcAMLive&&window._gcAMLive(_r)})({...z,id:z.id||$t("CUS")})/* patch APEMAILS */,q(z)', rel)
    # the two lists, before Notes (every customer type)
    s = rep(s, 'e.jsx(re,{l:"Notes",children:e.jsx("textarea",{style:{...R,minHeight:60},value:z.notes,onChange:Ve=>De({...z,notes:Ve.target.value}),placeholder:"Internal notes about this customer..."',
               'window._gcAMEditor?window._gcAMEditor(e,z,De):null/* patch APEMAILS */,e.jsx(re,{l:"Notes",children:e.jsx("textarea",{style:{...R,minHeight:60},value:z.notes,onChange:Ve=>De({...z,notes:Ve.target.value}),placeholder:"Internal notes about this customer..."', rel)
    # ✏️ Edit Project: who gets this job's e-mail
    s = rep(s, 'e.jsx(re,{l:"Client Email",children:e.jsx("input",{style:R,value:z.clientEmail||"",onChange:G=>De({...z,clientEmail:G.target.value}),placeholder:"client@email.com"})})',
               'e.jsx(re,{l:"Client Email",children:e.jsx("input",{style:R,value:z.clientEmail||"",onChange:G=>De({...z,clientEmail:G.target.value}),placeholder:"client@email.com"})}),window._gcAMJobPanel?window._gcAMJobPanel(e,re,z,De):null/* patch APEMAILS */', rel)
    # the CRM invoice e-mail: several To, its CC really sent
    s = rep(s, "body: JSON.stringify({ to: to, subject: subject, html: html, from: _fromKey, fromName: 'GrayCo Construction Services', replyTo: _fromEmail })",
               "body: JSON.stringify({ to: (String(to).indexOf(',') >= 0 ? String(to).split(/\\s*,\\s*/).filter(Boolean) : to), cc: (opts.cc ? String(opts.cc).split(/\\s*,\\s*/).filter(Boolean) : undefined), subject: subject, html: html, from: _fromKey, fromName: 'GrayCo Construction Services', replyTo: _fromEmail })   /* patch APEMAILS: every AP address, the client in CC */", rel)
    s = rep(s, "        + 'To: ' + to + '\\n'\n",
               "        + 'To: ' + to + '\\n' + (opts.cc ? 'CC: ' + opts.cc + '\\n' : '')   /* patch APEMAILS */\n", rel)
    # ✅ Approvals e-mail preview: To shows (and edits) every address
    s = rep(s, "'<label style=\"' + LB + '\">To</label><input class=\"_ap2PvTo\" style=\"' + IN + '\" value=\"' + esc(x.to) + '\"' + ro + '>' +",
               "'<label style=\"' + LB + '\">To</label><input class=\"_ap2PvTo\" style=\"' + IN + '\" value=\"' + esc([x.to].concat(x.toMore || []).filter(Boolean).join(', ')) + '\"' + ro + '>' +   /* patch APEMAILS */", rel)
    s = rep(s, "    if(to && s(to.value) !== s(x.to)){ e.to = s(to.value); n++; }",
               "    if(to && s(to.value) !== [x.to].concat(x.toMore || []).filter(Boolean).join(', ')){ e.to = s(to.value); n++; }   /* patch APEMAILS */", rel)
    # SYNC-A: the job's extra client e-mails are a person's edit
    s = rep(s, "          'portalShow'];",
               "          'portalShow',\n          /* patch APEMAILS: more client e-mails for this job (✏️ Edit Project) */\n          'moreClientEmails'];", rel)
    tail = open(os.path.join(ROOT, 'tools', 'apemails_tail.js'), encoding='utf-8').read()
    assert '</script>' not in tail
    s = s.rstrip('\n') + '\n<script>\n' + tail.rstrip('\n') + '\n</script>\n'
    save(rel, s)
    print('index.html patched')

# ───────────────────────────── netlify ─────────────────────────────
rel = 'netlify/functions/portal.js'
s = load(rel)
if TAG in s:
    print(rel, 'already patched')
else:
    s = rep(s, "const JA = require('./_lib/job-auto.js');   /* patch JA: the job's automations (project.auto) */",
               "const JA = require('./_lib/job-auto.js');   /* patch JA: the job's automations (project.auto) */\n"
               "function AM(){ return require('./_lib/apmail.js'); }   /* patch APEMAILS: money mail TO accounts payable, the client in CC */", rel)
    # queue time: a money item is addressed to the account's AP list
    s = rep(s, "  const now = new Date().toISOString();\n  const steps = stepsFor(o.kind, o.pm);",
               "  if (o && AM().isMoneyKind(o.kind) && o.channel !== 'sms' && (o.pid || (o.meta && o.meta.customer))) {   /* patch APEMAILS */\n"
               "    try { const d = await crmData(false), jp = o.pid ? findProject(d, o.pid) : null, cu = jp ? null : AM().custOf(d, null, o.meta && o.meta.customer); if (jp || cu) o = AM().addressItem(d, jp, o, cu); } catch (e) {}\n"
               "  }\n"
               "  const now = new Date().toISOString();\n  const steps = stepsFor(o.kind, o.pm);", rel)
    s = rep(s, "  if (o.officeOk === true) item.officeOk = true;",
               "  if (Array.isArray(o.toMore) && o.toMore.length) item.toMore = o.toMore.slice(0, 10);   /* patch APEMAILS: the other AP addresses */\n"
               "  if (Array.isArray(o.cc) && o.cc.length) item.cc = o.cc.slice(0, 10);\n"
               "  if (o.apAuto) item.apAuto = o.apAuto;\n"
               "  if (o.officeOk === true) item.officeOk = true;", rel)
    # send time: the account as it is now
    s = rep(s, "  if (Array.isArray(item.cc) && item.cc.length) payload.cc = item.cc.slice(0, 5);   /* patch AP2: an approver's CC */",
               "  if (Array.isArray(item.cc) && item.cc.length) payload.cc = item.cc.slice(0, 5);   /* patch AP2: an approver's CC */\n"
               "  if (Array.isArray(item.toMore) && item.toMore.length) payload.to = [item.to].concat(item.toMore).filter(Boolean);   /* patch APEMAILS */\n"
               "  if (AM().isMoneyKind(item.kind) && (item.jobId || (item.meta && item.meta.customer))) {   /* patch APEMAILS: a removed address never goes */\n"
               "    let am = null; try { const dj = await crmData(false), pj = item.jobId ? findProject(dj, item.jobId) : null, cu = pj ? null : AM().custOf(dj, null, item.meta.customer); if (pj || cu) am = AM().atSend(dj, pj, item, cu); } catch (e) {}\n"
               "    if (am) { if (!am.to.length) return { ok: false, error: 'No address left to send to (removed from the customer) — type one in \"To\".' }; payload.to = am.to; if (am.cc.length) payload.cc = am.cc; else delete payload.cc; }\n"
               "  }", rel)
    s = rep(s, "  if (Array.isArray(tpl.cc) && tpl.cc.length) payload.cc = tpl.cc.slice(0, 5);",
               "  if (Array.isArray(tpl.cc) && tpl.cc.length) payload.cc = tpl.cc.slice(0, 5);\n"
               "  if (Array.isArray(tpl.toMore) && tpl.toMore.length) payload.to = [tpl.to].concat(tpl.toMore).filter(Boolean);   /* patch APEMAILS */\n"
               "  try { const dj = await crmData(false), pj = findProject(dj, pid); if (pj) { const am = AM().atSend(dj, pj, tpl); if (!am.to.length) return { ok: false, error: 'no address (removed from the customer)' }; payload.to = am.to; if (am.cc.length) payload.cc = am.cc; else delete payload.cc; } } catch (e) {}", rel)
    # approver edits: several To
    s = rep(s, "  if (edit.to != null && s(edit.to) && !EMAIL_RE.test(s(edit.to)) && !/^\\+?[0-9 ()-]{7,20}$/.test(s(edit.to))) return 'The \"To\" address does not look right.';",
               "  if (edit.to != null && s(edit.to) && AM().split(edit.to).length > 1) {   /* patch APEMAILS: several To (accounts payable) */\n"
               "    const tl = AM().split(edit.to), bad = tl.filter(function(e){ return !EMAIL_RE.test(e); });\n"
               "    if (bad.length) return 'To: ' + bad[0] + ' does not look right.'; if (tl.length > 10) return 'At most 10 \"To\" addresses.';\n"
               "  } else if (edit.to != null && s(edit.to) && !EMAIL_RE.test(s(edit.to)) && !/^\\+?[0-9 ()-]{7,20}$/.test(s(edit.to))) return 'The \"To\" address does not look right.';", rel)
    s = rep(s, "  if (edit.to != null && s(edit.to) && low(edit.to) !== low(x.to)) { x.to = clip(edit.to, 200); ch.push('to'); }",
               "  if (edit.to != null && s(edit.to)) {   /* patch APEMAILS: the first To, the rest in toMore */\n"
               "    const tl = x.channel === 'sms' ? [s(edit.to)] : AM().split(edit.to), cur = [s(x.to)].concat(x.toMore || []).filter(Boolean).map(low).join(',');\n"
               "    if (tl.map(low).join(',') !== cur) { x.to = clip(tl[0] || edit.to, 200); if (tl.length > 1) x.toMore = tl.slice(1, 10).map(low); else delete x.toMore; ch.push('to'); }\n"
               "  }", rel)
    # no client e-mail on the job, AP on the account
    s = rep(s, "  const view = await buildView(data, p);\n  const to = s(view.customer.email);\n  if (!/^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: 'No customer e-mail on this job.' } };",
               "  const view = await buildView(data, p);\n  const to = s(view.customer.email) || AM().firstTo(data, p, '');   /* patch APEMAILS: or the account's accounts payable */\n  if (!/^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(to)) return { status: 200, out: { ok: false, noEmail: true, error: 'No customer e-mail on this job.' } };", rel)
    s = rep(s, "      const to = s(view.customer.email);\n      const okEmail = ",
               "      const to = s(view.customer.email) || AM().firstTo(data, p, '');   /* patch APEMAILS */\n      const okEmail = ", rel)
    save(rel, s)
    print(rel, 'patched')

for rel, old, new in [
    ('netlify/functions/_lib/auto-ar.js',
     "  return c && okEmail(c.email) ? low(c.email) : '';\n}",
     "  if (c && okEmail(c.email)) return low(c.email);\n  try { return require('./apmail.js').firstTo(data, p, ''); } catch (e) { return ''; }   /* patch APEMAILS: or the account's accounts payable */\n}"),
    ('netlify/functions/_lib/offfeat.js',
     "  return c && okEmail(c.email) ? low(c.email) : '';\n}",
     "  if (c && okEmail(c.email)) return low(c.email);\n  try { return require('./apmail.js').firstTo(data, p, ''); } catch (e) { return ''; }   /* patch APEMAILS: or the account's accounts payable */\n}"),
    ('netlify/functions/x10-scheduled.js',
     "email: s(p.clientEmail || p.customerEmail || p.email), name: s(p.client || p.clientName || p.customer), number: C().invNumber(r)",
     "email: s(p.clientEmail || p.customerEmail || p.email) || require('./_lib/apmail.js').firstTo(data, p, '') /* patch APEMAILS */, name: s(p.client || p.clientName || p.customer), number: C().invNumber(r)"),
]:
    s = load(rel)
    if TAG in s: print(rel, 'already patched'); continue
    s = rep(s, old, new, rel)
    save(rel, s)
    print(rel, 'patched')
