#!/usr/bin/env python3
"""Idempotent patch SMSCONSENT (A2P 10DLC): text-message consent on the contract, the intake forms, the portal e-sign page,
inbound opt-in, and enforcement on outbound customer texts.

    python3 tools/patch_SMSCONSENT.py [repo-root]      (default: the current directory)

Touches: index.html, portal.html, netlify/functions/{missed-call,texts,portal-sign,field-ops,portal-access}.js,
netlify/functions/_lib/mkt2.js, and creates netlify/functions/_lib/smsconsent.js.
Every find-string must match exactly once; a file that already carries the SMSCONSENT marker is left alone.
"""
import os, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
MARK = 'SMSCONSENT'

CONSENT = ("I agree to receive text messages from GrayCo Construction Services about my job (scheduling, updates, estimates, invoices) "
           "and occasional service offers. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. "
           "Consent is not a condition of purchase.")
CONSENT_HTML = CONSENT.replace('&', '&amp;')
NOTICE = "GrayCo Construction Services: you're subscribed to job texts. Msg freq varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out."


def rd(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def wr(rel, txt):
    with open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(txt)


def edit(rel, pairs):
    src = rd(rel)
    if MARK in src:
        print('already patched:', rel)
        return
    for find, repl in pairs:
        n = src.count(find)
        assert n == 1, (rel, 'find-string matched %d times' % n, find[:80])
        src = src.replace(find, repl)
    wr(rel, src)
    print('patched:', rel)


# ───────────────────────────── the shared server library ─────────────────────────────
LIB = r'''/* ============================================================================
   GrayCo — TEXT-MESSAGE CONSENT (patch SMSCONSENT, A2P 10DLC).   netlify/functions/_lib/smsconsent.js

   A customer's consent is one record { status: 'yes'|'no', at: ISO, via: 'contract'|'intake'|'text'|'staff', phone }.
   It lives on the customer and the job (the CRM's own records) and, for a customer who texted us first or signed in the
   portal, in the SMS state ("consent", by 10-digit phone) so the functions can enforce it at once.
     · 'no'              → no customer text goes out (staff reply, automatic answer, crew text, welcome text).
     · '' (not recorded) → legacy customers: job / transactional texts still go out.
     · marketing / promotional texts need 'yes'.
     · STOP (the SMS state's "optout") always wins over everything — it is checked before this.
   When several records match one phone the newest wins; on a tie 'no' wins.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }

const CONSENT_TEXT = @@CONSENT@@;
const NOTICE = @@NOTICE@@;
const DECLINED = 'This customer declined texts on their contract.';
const NEEDS_YES = "Marketing texts need the customer's text consent (Texts: Yes) — it is not recorded for this number.";

function phonesOf(r){ return [r.clientPhone, r.phone, r.customerPhone, r.contactPhone, r.cell, r.mobile, r.homePhone, r.ownerPhone, r.contact && r.contact.phone, r.smsConsent && r.smsConsent.phone].map(phone10).filter(x => x.length === 10); }
function clean(c){
  if (!c || typeof c !== 'object') return null;
  const st = low(c.status); if (st !== 'yes' && st !== 'no') return null;
  return { status: st, at: s(c.at), via: s(c.via), phone: phone10(c.phone) };
}
/* the newest record wins; same time → 'no' */
function newest(list){
  let best = null;
  list.map(clean).filter(Boolean).forEach(c => { if (!best || c.at > best.at || (c.at === best.at && c.status === 'no')) best = c; });
  return best;
}
/* data = { customers, projects, leads } as portal.js kvRead returns them; reg = the SMS state's "consent" map (by 10 digits) */
function recordFor(data, ph, reg){
  const d = phone10(ph); if (d.length !== 10) return null;
  data = data || {};
  const list = [];
  arr(data.customers).concat(arr(data.projects), arr(data.leads)).forEach(r => { if (r.smsConsent && r.deleted !== true && phonesOf(r).indexOf(d) >= 0) list.push(r.smsConsent); });
  if (reg && typeof reg === 'object' && reg[d]) list.push(reg[d]);
  return newest(list);
}
function statusFor(data, ph, reg){ const r = recordFor(data, ph, reg); return r ? r.status : ''; }
/* the message for staff when one outbound customer text must not go: '' = fine */
function refusal(status, marketing){
  if (status === 'no') return DECLINED;
  if (marketing && status !== 'yes') return NEEDS_YES;
  return '';
}
/* the SMS state's consent map (a customer who texted us first / signed in the portal) */
async function registry(){ try { const st = await require('../missed-call.js')._test.stateGet(); return st && st.consent && typeof st.consent === 'object' ? st.consent : {}; } catch (e) { return {}; } }
/* a status for callers that hold nothing but a phone: reads the CRM's customers / jobs / leads and the registry. Unreadable → '' */
async function live(ph){
  try {
    const core = require('../portal.js')._core; let D = {};
    try { D = await core.kvRead(['customers', 'projects', 'leads']); } catch (e) {}
    return statusFor(D, ph, await registry());
  } catch (e) { return ''; }
}
async function record(rec, extraPhones){
  const MCt = require('../missed-call.js')._test, c = clean(rec); if (!c) return false;
  const phones = new Set(); if (c.phone) phones.add(c.phone);
  if (c.status === 'no') (extraPhones || []).map(phone10).filter(x => x.length === 10).forEach(x => phones.add(x));
  if (!phones.size) return false;
  await MCt.stateCas(st => { st.consent = st.consent && typeof st.consent === 'object' ? st.consent : {}; phones.forEach(d => { st.consent[d] = Object.assign({}, c, { phone: d }); }); return true; });
  return true;
}

module.exports = { CONSENT_TEXT, NOTICE, DECLINED, NEEDS_YES, clean, newest, recordFor, statusFor, refusal, registry, live, record, phone10 };
'''
import json
LIB = LIB.replace('@@CONSENT@@', json.dumps(CONSENT)).replace('@@NOTICE@@', json.dumps(NOTICE))


def write_lib():
    rel = 'netlify/functions/_lib/smsconsent.js'
    p = os.path.join(ROOT, rel)
    if os.path.exists(p) and open(p, encoding='utf-8').read() == LIB:
        print('already patched:', rel)
        return
    wr(rel, LIB)
    print('wrote:', rel)


# ───────────────────────────── server edits ─────────────────────────────
def server():
    write_lib()
    # inbound opt-in + the first-reply notice + no automatic text to a customer who declined
    edit('netlify/functions/missed-call.js', [
        ("['calls', 'texted', 'optout', 'owner'].forEach(k =>",
         "['calls', 'texted', 'optout', 'owner', 'consent', 'welcomed'].forEach(k =>"),   # patch SMSCONSENT: consent by phone, who got the one-time notice
        ("  const out = { how };\n  if (textIt) {",
         "  const out = { how };\n"
         "  /* patch SMSCONSENT: a customer who declined texts on their contract gets no automatic text (STOP is already handled above) */\n"
         "  if (textIt) { try { const SC = require('./_lib/smsconsent.js'), D0 = await core().kvRead(['customers', 'projects', 'leads']), s0 = await stateGet();\n"
         "    if (SC.statusFor(D0, ph, s0.consent) === 'no') { textIt = false; out.consent = 'declined'; } } catch (e) {} }\n"
         "  if (textIt) {"),
        ("  /* 6) one automatic answer",
         "  /* patch SMSCONSENT: texting us first is consent (via 'text') — only when nothing is recorded yet, never over STOP, never for subs / staff;\n"
         "     the first reply to that number carries the subscription notice, once (prepended to the automatic answer, never a second text) */\n"
         "  let noticeNow = false;\n"
         "  try {\n"
         "    const SC = require('./_lib/smsconsent.js'), dataOk = Array.isArray(data.customers) || Array.isArray(data.projects);\n"
         "    if (dataOk && !optedOut && !(who && (who.kind === 'sub' || who.kind === 'staff'))) {\n"
         "      let rec = SC.recordFor(data, ph, st0.consent);\n"
         "      if (!rec) {\n"
         "        const mine = { status: 'yes', at, via: 'text', phone: ph }; rec = mine;\n"
         "        await stateCas(st => { st.consent = st.consent && typeof st.consent === 'object' ? st.consent : {}; if (st.consent[ph]) { rec = st.consent[ph]; return undefined; } st.consent[ph] = mine; return true; });\n"
         "        out.consent = 'yes (texted first)';\n"
         "      }\n"
         "      noticeNow = !!rec && rec.status === 'yes' && rec.via === 'text' && !(st0.welcomed && st0.welcomed[ph]);\n"
         "    }\n"
         "  } catch (e) { out.consentError = s(e && e.message); }\n"
         "  /* 6) one automatic answer"),
        ("  if (reply) {\n    out.reply = await sendSms(ph, reply,",
         "  if (noticeNow && !paused && !optedOut) reply = reply ? SMS().NOTICE_PREFIX + ' ' + reply : SMS().NOTICE_PREFIX;   /* patch SMSCONSENT */\n"
         "  else noticeNow = false;\n"
         "  if (reply) {\n    out.reply = await sendSms(ph, reply,"),
        ("    if (out.reply.ok) {\n      const rid = 'SMSA_' + sid;",
         "    if (out.reply.ok && noticeNow) { out.notice = true; await stateCas(st => { st.welcomed = st.welcomed && typeof st.welcomed === 'object' ? st.welcomed : {}; st.welcomed[ph] = at; return true; }).catch(() => {}); }   /* patch SMSCONSENT */\n"
         "    if (out.reply.ok) {\n      const rid = 'SMSA_' + sid;"),
    ])
    # sms.js: the notice text (one place)
    edit('netlify/functions/_lib/sms.js', [
        ("const HELP = /^\\s*(help|info)\\s*[.!?]*\\s*$/i;",
         "const HELP = /^\\s*(help|info)\\s*[.!?]*\\s*$/i;\n"
         "/* patch SMSCONSENT: the one-time subscription notice for a brand-new texter (prepended to the first reply) */\n"
         "const NOTICE_PREFIX = " + json.dumps(NOTICE) + ";"),
        ("module.exports = { SETTINGS_KEY,", "module.exports = { NOTICE_PREFIX, SETTINGS_KEY,"),
    ])
    # staff sends
    edit('netlify/functions/texts.js', [
        ("  let purpose = s(b.purpose) ? RT.normPurpose(b.purpose) : '';\n"
         "  if (!purpose) { try { purpose = RT.purposeFor(await core().kvRead(['subs', 'vendors', 'projects', 'customers', 'leads']), to); } catch (e) { purpose = 'customers'; } }",
         "  let purpose = s(b.purpose) ? RT.normPurpose(b.purpose) : '';\n"
         "  let CD = null; try { CD = await core().kvRead(['subs', 'vendors', 'projects', 'customers', 'leads']); } catch (e) {}   /* patch SMSCONSENT: read once — the line and the consent check both use it */\n"
         "  if (!purpose) { try { purpose = CD ? RT.purposeFor(CD, to) : 'customers'; } catch (e) { purpose = 'customers'; } }"),
        ("  if (st.optout[to]) return",
         "  /* patch SMSCONSENT: STOP (below) wins over everything; then a customer who declined on the contract is refused; marketing needs Yes; subs are not customers */\n"
         "  if (!st.optout[to]) {\n"
         "    const SC = require('./_lib/smsconsent.js'), marketing = b.marketing === true || (!!s(b.purpose) && RT.normPurpose(b.purpose) === 'leads');\n"
         "    let isSub = false; try { isSub = !!CD && RT.purposeFor(CD, to) === 'subs'; } catch (e) {}\n"
         "    if (!isSub) { const cst = SC.statusFor(CD || {}, to, st.consent), why = SC.refusal(cst, marketing); if (why) return { code: 409, body: { ok: false, consent: cst || 'unknown', error: why } }; }\n"
         "  }\n"
         "  if (st.optout[to]) return"),
    ])
    # the crew text / the welcome text / the roof-check reminder
    edit('netlify/functions/field-ops.js', [
        ("  if (p.textOptOut === true || p.smsOptOut === true) return",
         "  try { if (await require('./_lib/smsconsent.js').live(p.clientPhone || p.phone || p.customerPhone) === 'no') return { status: 200, out: { ok: true, sms: false, why: 'This customer declined texts on their contract.' } }; } catch (e) {}   /* patch SMSCONSENT */\n"
         "  if (p.textOptOut === true || p.smsOptOut === true) return"),
    ])
    edit('netlify/functions/portal-access.js', [
        ("      if (phone && textReady() && body.via !== 'pm-phone') {",
         "      let smsNo = false; try { const SC = require('./_lib/smsconsent.js'); smsNo = SC.statusFor({ projects: [p] }, phone, await SC.registry()) === 'no' || (await SC.live(phone)) === 'no'; } catch (e) {}   /* patch SMSCONSENT: declined → the PM sends it from their own phone */\n"
         "      if (phone && textReady() && !smsNo && body.via !== 'pm-phone') {"),
    ])
    edit('netlify/functions/_lib/mkt2.js', [
        ("      if (env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM') && require('../website-intake.js')._lib.phone10(su.phone).length === 10) {",
         "      let smsNo = false; try { smsNo = (await require('./smsconsent.js').live(su.phone)) === 'no'; } catch (e) {}   /* patch SMSCONSENT: a declined number gets no text reminder */\n"
         "      if (!smsNo && env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM') && require('../website-intake.js')._lib.phone10(su.phone).length === 10) {"),
    ])
    # the portal e-sign function
    edit('netlify/functions/portal-sign.js', [
        ("declined: x.status === 'declined' && x.declined ? { at: s(x.declined.at) } : null };",
         "declined: x.status === 'declined' && x.declined ? { at: s(x.declined.at) } : null,\n"
         "      sms: (x.kind === 'contract' || x.kind === 'estimate') && x.status === 'pending' ? { phone: require('./_lib/sms.js').tidy(p.clientPhone || p.phone || p.customerPhone || '') } : null };   /* patch SMSCONSENT */"),
        ("const T = scrubber(p), ip = ipOf(event), at = new Date().toISOString(), sigId",
         "/* patch SMSCONSENT: the text-message box on a contract / estimate — its own tick, never part of the agreement */\n"
         "  const SC = require('./_lib/smsconsent.js'); let smsC = null;\n"
         "  if ((r.kind === 'contract' || r.kind === 'estimate') && body.smsConsent && typeof body.smsConsent === 'object') {\n"
         "    const ph = SC.phone10(body.smsConsent.phone), yes = body.smsConsent.agree === true;\n"
         "    if (yes && ph.length !== 10) return { status: 400, out: { ok: false, error: 'Please enter the 10-digit mobile number for texts, or leave the text-message box unticked.' } };\n"
         "    smsC = { status: yes ? 'yes' : 'no', at: new Date().toISOString(), via: 'contract', phone: ph.length === 10 ? ph : '' };\n"
         "  }\n"
         "  const T = scrubber(p), ip = ipOf(event), at = new Date().toISOString(), sigId"),
        ("amount: r.amount, docName: T(r.docName), name: name, strokes: cs.strokes, at: at, ip: ip, ref: sigId });",
         "amount: r.amount, docName: T(r.docName), name: name, strokes: cs.strokes, at: at, ip: ip, ref: sigId, sms: smsC });"),
        ("  b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Signature' }",
         "  if (o.sms) {   /* patch SMSCONSENT */\n"
         "    b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Text messages' }, { t: 'p', text: 'Mobile number for texts: ' + (o.sms.phone ? require('./_lib/sms.js').tidy(o.sms.phone) : '(none given)') },\n"
         "      { t: 'p', text: (o.sms.status === 'yes' ? '[X]  ' : '[  ]  ') + require('./_lib/smsconsent.js').CONSENT_TEXT, size: 9 },\n"
         "      { t: 'p', text: o.sms.status === 'yes' ? 'The customer ticked this box themselves.' : 'The customer did not tick this box — GrayCo will not send them text messages.', size: 9, muted: true });\n"
         "  }\n"
         "  b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Signature' }"),
        ("docName: docName, sigId: sigId };",
         "docName: docName, sigId: sigId };\n  if (smsC) signedRec.smsConsent = smsC;   /* patch SMSCONSENT */"),
        ("  /* tell the people: the office (a to-do), the PM (an e-mail), the customer (their copy, at once — owner rule) */",
         "  /* patch SMSCONSENT: the answer is enforced at once (the SMS state); the CRM also writes it onto the job and the customer when it applies this signature */\n"
         "  if (smsC) { try { await SC.record(smsC, [p.clientPhone, p.phone, p.customerPhone]); } catch (e) {} }\n"
         "  /* tell the people: the office (a to-do), the PM (an e-mail), the customer (their copy, at once — owner rule) */"),
    ])


# ───────────────────────────── client: portal.html (customer e-sign page) ─────────────────────────────
def portal_page():
    edit('portal.html', [
        ("  box.appendChild(h('div', { class: 'es-btns' }, [go, no])); box.appendChild(msg);",
         "  /* patch SMSCONSENT: contract / estimate — the mobile number for texts (prefilled) and its OWN checkbox, unchecked by default */\n"
         "  var smsPh = null, smsBox = null;\n"
         "  if (x.sms) {\n"
         "    smsPh = kept(h('input', { type: 'tel', class: 'sel-name', maxlength: '30', autocomplete: 'tel', placeholder: 'Mobile number for texts', 'aria-label': 'Mobile number for texts', id: 'gcesign-smsphone-' + x.id }), 'p_' + x.id);\n"
         "    if (keep['p_' + x.id] === undefined) { smsPh.value = x.sms.phone || ''; keep['p_' + x.id] = smsPh.value; }\n"
         "    smsBox = kept(h('input', { type: 'checkbox', id: 'gcesign-sms-' + x.id, 'data-gc-sms': '1' }), 's_' + x.id, true);\n"
         "    box.appendChild(h('label', { class: 'muted', text: 'Mobile number for texts' })); box.appendChild(smsPh);\n"
         "    box.appendChild(h('label', { class: 'sel-agree' }, [smsBox, h('span', { text: ' " + CONSENT.replace("'", "\\'") + "' })]));\n"
         "  }\n"
         "  box.appendChild(h('div', { class: 'es-btns' }, [go, no])); box.appendChild(msg);"),
        ("api({ action: 'sign', id: x.id, name: nm.value, agree: true, strokes: pad.strokes() })",
         "api({ action: 'sign', id: x.id, name: nm.value, agree: true, strokes: pad.strokes(), smsConsent: smsBox ? { agree: !!smsBox.checked, phone: smsPh.value } : undefined })"),
    ])


# ───────────────────────────── client: index.html ─────────────────────────────
TAIL = r'''
<script id="gc-patch-smsconsent">
/* ============================================================================
   patch SMSCONSENT (A2P 10DLC) — text-message consent on the customer and the job.
   A record is { status:'yes'|'no', at:ISO, via:'contract'|'intake'|'text'|'staff', phone }.
     · the contract (printed / PDF + the portal e-sign page) and the intake forms carry the checkbox, unchecked by default;
     · a signed contract writes the answer onto the job (patch AUTO5 applyContract); this file copies a job's newest answer
       onto the customer record with the same name / phone;
     · 📱 Texts: Yes / No / Not recorded shows on the customer record, with an admin-only toggle (via 'staff').
   The server (texts.js, missed-call.js, portal-sign.js …) enforces it: 'no' → no customer text; unknown → job texts still go.
   Console: _gcSmsC.status(customer)  _gcSmsC.reconcile()
   ========================================================================== */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_SMSCONSENT__) return; W.__GC_PATCH_SMSCONSENT__ = true;
var TEXT = @@CONSENT@@;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function d10(v){ var d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function clean(c){ if (!c || typeof c !== 'object') return null; var st = low(c.status); if (st !== 'yes' && st !== 'no') return null; return { status: st, at: s(c.at), via: s(c.via), phone: d10(c.phone) }; }
function newest(list){ var best = null; list.map(clean).filter(Boolean).forEach(function(c){ if (!best || c.at > best.at || (c.at === best.at && c.status === 'no')) best = c; }); return best; }
/* a record for the tick: ticked → yes. Unticked → no only when a record already exists (or force); a brand-new form just stays "not recorded" */
function rec(checked, prev, via, phone, force){
  if (!checked && !force && !(prev && prev.status)) return undefined;
  return { status: checked ? 'yes' : 'no', at: new Date().toISOString(), via: via, phone: d10(phone) };
}
/* the newest answer for this customer / job: its own, plus the jobs and customers with the same name or phone */
function related(r){
  r = r || {}; var out = []; if (r.smsConsent) out.push(r.smsConsent);
  var nm = low(r.name || r.client || r.company), ph = d10(r.phone || r.clientPhone);
  arr(crm().projects).forEach(function(p){ if (!p || p === r || p.deleted || !p.smsConsent) return; if ((nm && low(p.client) === nm) || (ph && d10(p.clientPhone) === ph)) out.push(p.smsConsent); });
  arr(crm().customers).forEach(function(c){ if (!c || c === r || c.deleted || !c.smsConsent) return; if ((nm && low(c.name || c.company) === nm) || (ph && d10(c.phone) === ph)) out.push(c.smsConsent); });
  return newest(out);
}
function status(r){ var c = related(r); return c ? c.status : ''; }
var VIA = { contract: 'on the contract', intake: 'at intake', text: 'they texted us first', staff: 'set by staff' };
function line(r){
  var c = related(r), st = c ? c.status : '';
  var det = c ? ' — ' + (VIA[c.via] || c.via || 'recorded') + (c.at ? ', ' + c.at.slice(0, 10) : '') : '';
  return '📱 Texts: ' + (st === 'yes' ? 'Yes' : st === 'no' ? 'No' : 'Not recorded') + det;
}
function myUser(){ var m = ''; try { m = localStorage.getItem('grayco_user') || ''; } catch (e) {} return arr(crm().users).filter(function(x){ return x && (x.email === m || x.name === m); })[0]; }
function isAdmin(){ var u = myUser(); return !!(u && (low(u.payType) === 'owner' || u.role === 'Admin' || /office/i.test(u.role || ''))); }

/* the phone-width customer sheet (_gcEditCustomer) */
function sheetHtml(cust){
  cust = cust || {}; var st = status(cust), lab = '<label style="color:#8fa8c4;font-size:12px;font-weight:700;display:block;margin-bottom:5px;">📱 Texts</label>';
  if (!cust.id) return '<div style="margin-bottom:14px;">' + lab + '<label style="display:flex;gap:10px;align-items:flex-start;color:#cbd5e1;font-size:13px;line-height:1.4"><input type="checkbox" id="_ecSms" data-gc-smsbox="1" style="width:22px;height:22px;margin-top:2px;flex:none"><span>' + esc(TEXT) + '</span></label></div>';
  return '<div style="margin-bottom:14px;">' + lab + '<div id="_ecSmsLine" style="color:#fff;font-size:14px;font-weight:700">' + esc(line(cust)) + '</div>' +
    (isAdmin() ? '<button type="button" id="_ecSmsBtn" data-v="" data-st="' + st + '" style="margin-top:8px;padding:10px 14px;border-radius:10px;border:1px solid #1e3a5f;background:#0f2440;color:#cbd5e1;font-weight:700;font-size:13px">' + (st === 'yes' ? 'Record: customer does NOT want texts' : 'Record: customer agreed to texts') + '</button>' : '') + '</div>';
}
function sheetRead(cust){
  cust = cust || {}; var ph = (D.getElementById('_ecPhone') || {}).value || cust.phone;
  if (!cust.id) { var b = D.getElementById('_ecSms'); return b && b.checked ? rec(true, null, 'intake', ph) : cust.smsConsent; }
  var btn = D.getElementById('_ecSmsBtn'); if (btn && btn.getAttribute('data-v')) return rec(btn.getAttribute('data-v') === 'yes', cust.smsConsent, 'staff', ph, true);
  return cust.smsConsent;
}
D.addEventListener('click', function(ev){
  var t = ev.target && ev.target.closest ? ev.target.closest('#_ecSmsBtn') : null; if (!t) return;
  var next = t.getAttribute('data-st') === 'yes' ? 'no' : 'yes'; t.setAttribute('data-v', next);
  t.textContent = '✓ Will record: ' + (next === 'yes' ? 'Yes' : 'No') + ' — tap Save Customer';
}, true);

/* a job's newest answer → the customer record with the same name / phone (so "the customer" shows it too).
   Reads the saved customer list from this computer's store (window._crm.customers can be an older snapshot) and writes it back the way the sheet above does. */
var busy = false;
function reconcile(){
  if (busy) return Promise.resolve(0); busy = true;
  return Promise.resolve(W.idbGet ? W.idbGet('customers') : null).catch(function(){ return null; }).then(function(idb){
    var cs = Array.isArray(idb) && idb.length ? idb : arr(crm().customers), ps = arr(crm().projects); if (!cs.length || !ps.length) return 0;
    var changed = 0, next = cs.map(function(c){
      if (!c || c.deleted) return c; var nm = low(c.name || c.company), ph = d10(c.phone), list = [];
      ps.forEach(function(p){ if (p && !p.deleted && p.smsConsent && ((nm && low(p.client) === nm) || (ph && d10(p.clientPhone) === ph))) list.push(p.smsConsent); });
      var best = newest(list); if (!best) return c; var cur = clean(c.smsConsent); if (cur && cur.at >= best.at) return c;
      changed++; return Object.assign({}, c, { smsConsent: best });
    });
    if (!changed) return 0;
    try { if (W._crm) W._crm.customers = next; } catch (e) {}
    try { if (W.idbSet) W.idbSet('customers', next); } catch (e) {}
    try { if (W._supaUpsert) W._supaUpsert('customers', next); } catch (e) {}
    try { if (W._gcApplySync) W._gcApplySync('customers', next); } catch (e) {}
    return changed;
  }).then(function(n){ busy = false; return n; }, function(){ busy = false; return 0; });
}
W.setTimeout(function(){ reconcile(); W.setInterval(reconcile, 45000); }, 25000);
W._gcSmsC = { text: TEXT, rec: rec, status: status, line: line, isAdmin: isAdmin, sheetHtml: sheetHtml, sheetRead: sheetRead, reconcile: reconcile };
try { console.log('[GC] Text-message consent ready (patch SMSCONSENT)'); } catch (e) {}
})();
</script>
'''.replace('@@CONSENT@@', json.dumps(CONSENT))

BOX_NP = ('window._gcSmsC&&e.jsx(re,{l:"📱 Text consent",s:3,children:e.jsxs("label",{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['
          'e.jsx("input",{type:"checkbox","data-gc-smsbox":"1",checked:!!(@V@.smsConsent&&@V@.smsConsent.status==="yes"),onChange:@X@=>@SET@({...@V@,smsConsent:window._gcSmsC.rec(@X@.target.checked,null,"intake",@V@.clientPhone)})}),'
          'e.jsx("span",{children:window._gcSmsC.text})]})}),')


def box(v, x, setter):
    return BOX_NP.replace('@V@', v).replace('@X@', x).replace('@SET@', setter)


CUST_BOX = ('window._gcSmsC&&e.jsx(re,{l:"📱 Texts",children:e.jsxs("div",{children:[e.jsx("div",{"data-gc-smsline":"1",style:{fontSize:12,fontWeight:700,marginBottom:4},children:window._gcSmsC.line(z)}),'
            '(E&&E.id)?((sr.role==="Admin"||/office/i.test(sr.role||""))&&e.jsx("button",{type:"button","data-gc-smstoggle":"1",style:{...ot,fontSize:11,padding:"3px 10px"},'
            'onClick:()=>De({...z,smsConsent:window._gcSmsC.rec(window._gcSmsC.status(z)!=="yes",z.smsConsent,"staff",z.phone,!0)}),'
            'children:window._gcSmsC.status(z)==="yes"?"Record: customer does NOT want texts":"Record: customer agreed to texts"})):'
            'e.jsxs("label",{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['
            'e.jsx("input",{type:"checkbox","data-gc-smsbox":"1",checked:!!(z.smsConsent&&z.smsConsent.status==="yes"),onChange:Ve=>De({...z,smsConsent:window._gcSmsC.rec(Ve.target.checked,null,"intake",z.phone)})}),'
            'e.jsx("span",{children:window._gcSmsC.text})]})]})}),')


def index_page():
    rel = 'index.html'
    src = rd(rel)
    if MARK in src:
        print('already patched:', rel)
        return
    pairs = [
        # 1) Customers → New / Edit Customer (React modal): the tick for a new customer; the status line + admin toggle for an existing one
        ('placeholder:"Internal notes about this customer..."})}),e.jsxs("div",{style:{display:"flex",gap:8,marginTop:12}',
         'placeholder:"Internal notes about this customer..."})}),/*SMSCONSENT*/' + CUST_BOX + 'e.jsxs("div",{style:{display:"flex",gap:8,marginTop:12}'),
        # 2) Projects → + New Project (React form)
        ('onChange:j=>T({...y,clientEmail:j.target.value}),placeholder:"email@example.com"})}),',
         'onChange:j=>T({...y,clientEmail:j.target.value}),placeholder:"email@example.com"})}),/*SMSCONSENT*/' + box('y', 'j', 'T')),
        # 3) 🚀 Launch Job
        ('onBlur:y=>dn({...Le,clientEmail:y.target.value}),placeholder:"client@email.com"})}),',
         'onBlur:y=>dn({...Le,clientEmail:y.target.value}),placeholder:"client@email.com"})}),/*SMSCONSENT*/' + box('Le', 'y', 'dn')),
        ('clientPhone:Le.clientPhone,clientEmail:Le.clientEmail,notes:B,ccamUrl:Le.ccamUrl',
         'clientPhone:Le.clientPhone,clientEmail:Le.clientEmail,smsConsent:Le.smsConsent/*SMSCONSENT*/,notes:B,ccamUrl:Le.ccamUrl'),
        ('phone:Le.clientPhone||"",email:Le.clientEmail||"",address:Le.address||"",company:"",type:"homeowner"',
         'phone:Le.clientPhone||"",email:Le.clientEmail||"",smsConsent:Le.smsConsent/*SMSCONSENT*/,address:Le.address||"",company:"",type:"homeowner"'),
        # 4) the phone-width customer sheet
        ("      field('_ecAddress','Address',cust.address||cust.jobAddress,'Street, City, State ZIP')+",
         "      field('_ecAddress','Address',cust.address||cust.jobAddress,'Street, City, State ZIP')+(window._gcSmsC?window._gcSmsC.sheetHtml(cust):'')+/*SMSCONSENT*/"),
        ("notes:v('_ecNotes'), updatedAt:new Date().toISOString() });",
         "notes:v('_ecNotes'), smsConsent:(window._gcSmsC?window._gcSmsC.sheetRead(cust):cust.smsConsent), updatedAt:new Date().toISOString() });"),
        # 5) the printed contract (Forms library) — number + unchecked box
        ("        row2('Client Email',j.clientEmail||'','Project Manager',jPM),\n      '</table>',",
         "        row2('Client Email',j.clientEmail||'','Project Manager',jPM),\n      '</table>',\n"
         "      /* patch SMSCONSENT */'<table><tr><td><b>Mobile number for texts:</b> '+esc((j.smsConsent&&j.smsConsent.phone)||j.clientPhone||'')+' <span style=\"color:#666;font-size:9px\">(from the client phone &mdash; correct it if different)</span></td></tr>"
         "<tr><td style=\"font-size:10px\"><span style=\"font-size:15px\">'+(j.smsConsent&&j.smsConsent.status==='yes'?'&#9746;':'&#9744;')+'</span> " + CONSENT_HTML.replace("'", "\\'") + "</td></tr></table>',"),
        ("            '<tr><td style=\"padding:6px;font-weight:700;\">PM</td><td style=\"padding:6px;\">'+esc(jPM)+'</td></tr>'+",
         "            '<tr><td style=\"padding:6px;font-weight:700;border-bottom:1px solid #eee;\">PM</td><td style=\"padding:6px;border-bottom:1px solid #eee;\">'+esc(jPM)+'</td></tr>'+\n"
         "            /* patch SMSCONSENT */'<tr><td style=\"padding:6px;font-weight:700;\">Mobile number for texts</td><td style=\"padding:6px;\">'+esc((j.smsConsent&&j.smsConsent.phone)||j.clientPhone||'')+'</td></tr>'+\n"
         "            '<tr><td colspan=\"2\" style=\"padding:6px;font-size:11px;color:#444\">&#9744; " + CONSENT_HTML.replace("'", "\\'") + "</td></tr>'+"),
        # 6) the auto-made contract PDF
        ("    P.sigs('Owner signature / date', 'GrayCo representative / date');",
         "    P.txt('7. TEXT MESSAGES', 11, true); P.txt('Mobile number for texts: ' + (s(job.smsConsent && job.smsConsent.phone) || s(job.clientPhone || job.phone) || '____________________'));   /* patch SMSCONSENT */\n"
         "    P.txt('[    ]  ' + " + json.dumps(CONSENT) + ");\n"
         "    P.sigs('Owner signature / date', 'GrayCo representative / date');"),
        # 7) a signed contract / estimate in the portal → the job
        ("q.contractStatus = 'signed'; q.contractSignedAt = q.contractSignedAt || s(r.signed.at);",
         "q.contractStatus = 'signed'; q.contractSignedAt = q.contractSignedAt || s(r.signed.at);\n"
         "    if (r.signed.smsConsent && /^(yes|no)$/.test(s(r.signed.smsConsent.status))) q.smsConsent = { status: s(r.signed.smsConsent.status), at: s(r.signed.smsConsent.at) || s(r.signed.at), via: 'contract', phone: s(r.signed.smsConsent.phone) };   /* patch SMSCONSENT */"),
    ]
    for find, repl in pairs:
        n = src.count(find)
        assert n == 1, (rel, 'find-string matched %d times' % n, find[:90])
        src = src.replace(find, repl)
    assert src.endswith('</script>\n'), 'index.html tail changed'
    src += TAIL.lstrip('\n')
    wr(rel, src)
    print('patched:', rel)


if __name__ == '__main__':
    server()
    portal_page()
    index_page()
