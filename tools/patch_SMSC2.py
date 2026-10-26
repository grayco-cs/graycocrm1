#!/usr/bin/env python3
"""Idempotent patch SMSC2 (Twilio A2P error 30913): marketing and informational text consent are SEPARATE.

    python3 tools/patch_SMSC2.py [repo-root]      (default: the current directory)

Builds on patch SMSCONSENT (tools/patch_SMSCONSENT.py, which must already be applied). Splits the one combined checkbox into
  1. Job texts  (smsConsent  — unchanged meaning: job / transactional texts)
  2. Offers     (smsMarketing {status, at, via, phone} — optional, separate, promotional texts only)
Both boxes are unchecked by default, separate controls, neither required.
Touches: index.html, portal.html,
         netlify/functions/{texts,missed-call,portal-sign}.js, netlify/functions/_lib/smsconsent.js.
Every find-string must match exactly once; a file that already carries the SMSC2 marker is left alone.
"""
import os, sys, json

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
MARK = 'SMSC2'

OLD = ("I agree to receive text messages from GrayCo Construction Services about my job (scheduling, updates, estimates, invoices) "
       "and occasional service offers. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. "
       "Consent is not a condition of purchase.")
JOB = ("I agree to receive text messages from GrayCo Construction Services about my job (appointment and crew scheduling, job updates, "
       "estimates and invoices). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. "
       "Consent is not a condition of purchase.")
MKT = ("I also agree to receive occasional promotional text messages from GrayCo Construction Services (seasonal service offers, "
       "up to 4 per month). Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.")
JOB_LABEL = 'Job texts:'
MKT_LABEL = 'Offers (optional, separate):'
h = lambda t: t.replace('&', '&amp;')


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
        assert n == 1, (rel, 'find-string matched %d times' % n, find[:90])
        src = src.replace(find, repl)
    wr(rel, src)
    print('patched:', rel)


# ───────────────────────────── the shared server library ─────────────────────────────
def lib():
    edit('netlify/functions/_lib/smsconsent.js', [
        ("   When several records match one phone the newest wins; on a tie 'no' wins.\n",
         "   When several records match one phone the newest wins; on a tie 'no' wins.\n"
         "   patch SMSC2 (Twilio 30913): marketing consent is a SEPARATE record, smsMarketing { status, at, via, phone } (same shape, same\n"
         "   newest-wins rule; in the SMS state: \"marketing\" by 10-digit phone). smsConsent stays JOB-text consent.\n"
         "     · job / transactional texts: exactly as before (only an explicit job 'no' blocks them);\n"
         "     · a marketing / promotional text needs smsMarketing = 'yes' — job-text 'yes' is NOT enough;\n"
         "     · texting us first records JOB consent only, never marketing; STOP still wins over everything.\n"),
        ("const CONSENT_TEXT = " + json.dumps(OLD) + ";",
         "const CONSENT_TEXT = " + json.dumps(JOB) + ";\nconst MARKETING_TEXT = " + json.dumps(MKT) + ";"),
        ("const NEEDS_YES = \"Marketing texts need the customer's text consent (Texts: Yes) — it is not recorded for this number.\";",
         "const DECLINED_MKT = 'This customer declined promotional texts (Offers: No).';\n"
         "const NEEDS_YES = \"Promotional texts need the customer's separate Offers consent (Offers: Yes) — job-text consent is not enough, and it is not recorded for this number.\";"),
        ("r.smsConsent && r.smsConsent.phone]", "r.smsConsent && r.smsConsent.phone, r.smsMarketing && r.smsMarketing.phone]"),
        ("function recordFor(data, ph, reg){\n  const d = phone10(ph); if (d.length !== 10) return null;\n  data = data || {};\n  const list = [];\n"
         "  arr(data.customers).concat(arr(data.projects), arr(data.leads)).forEach(r => { if (r.smsConsent && r.deleted !== true && phonesOf(r).indexOf(d) >= 0) list.push(r.smsConsent); });",
         "function recordFor(data, ph, reg, field){\n  const d = phone10(ph); if (d.length !== 10) return null;\n  data = data || {};\n  const f = field || 'smsConsent', list = [];\n"
         "  arr(data.customers).concat(arr(data.projects), arr(data.leads)).forEach(r => { if (r[f] && r.deleted !== true && phonesOf(r).indexOf(d) >= 0) list.push(r[f]); });"),
        ("function statusFor(data, ph, reg){ const r = recordFor(data, ph, reg); return r ? r.status : ''; }",
         "function statusFor(data, ph, reg){ const r = recordFor(data, ph, reg); return r ? r.status : ''; }\n"
         "/* patch SMSC2: the separate marketing record (smsMarketing on the customer / job / lead; reg = the SMS state's \"marketing\" map) */\n"
         "function marketingRecordFor(data, ph, reg){ return recordFor(data, ph, reg, 'smsMarketing'); }\n"
         "function marketingStatusFor(data, ph, reg){ const r = marketingRecordFor(data, ph, reg); return r ? r.status : ''; }"),
        ("function refusal(status, marketing){\n  if (status === 'no') return DECLINED;\n  if (marketing && status !== 'yes') return NEEDS_YES;\n  return '';\n}",
         "/* status = JOB-text consent, mktStatus = marketing consent. A marketing send looks ONLY at mktStatus (yes → goes); a job text only at status. */\n"
         "function refusal(status, marketing, mktStatus){\n"
         "  if (marketing) return mktStatus === 'yes' ? '' : mktStatus === 'no' ? DECLINED_MKT : NEEDS_YES;\n"
         "  if (status === 'no') return DECLINED;\n  return '';\n}"),
        ("/* a status for callers that hold nothing but a phone",
         "async function registryMarketing(){ try { const st = await require('../missed-call.js')._test.stateGet(); return st && st.marketing && typeof st.marketing === 'object' ? st.marketing : {}; } catch (e) { return {}; } }\n"
         "/* a status for callers that hold nothing but a phone"),
        ("async function record(rec, extraPhones){\n",
         "async function liveMarketing(ph){\n"
         "  try {\n    const core = require('../portal.js')._core; let D = {};\n"
         "    try { D = await core.kvRead(['customers', 'projects', 'leads']); } catch (e) {}\n"
         "    return marketingStatusFor(D, ph, await registryMarketing());\n  } catch (e) { return ''; }\n}\n"
         "/* kind 'marketing' writes the separate marketing record (SMS state \"marketing\"); default is the job-text record */\n"
         "async function record(rec, extraPhones, kind){\n  const key = kind === 'marketing' ? 'marketing' : 'consent';\n"),
        ("await MCt.stateCas(st => { st.consent = st.consent && typeof st.consent === 'object' ? st.consent : {}; phones.forEach(d => { st.consent[d] = Object.assign({}, c, { phone: d }); }); return true; });",
         "await MCt.stateCas(st => { st[key] = st[key] && typeof st[key] === 'object' ? st[key] : {}; phones.forEach(d => { st[key][d] = Object.assign({}, c, { phone: d }); }); return true; });"),
        ("module.exports = { CONSENT_TEXT, NOTICE, DECLINED, NEEDS_YES, clean, newest, recordFor, statusFor, refusal, registry, live, record, phone10 };",
         "module.exports = { CONSENT_TEXT, MARKETING_TEXT, NOTICE, DECLINED, DECLINED_MKT, NEEDS_YES, clean, newest, recordFor, statusFor, marketingRecordFor, marketingStatusFor, refusal, registry, registryMarketing, live, liveMarketing, record, phone10 };"),
    ])


# ───────────────────────────── the senders / the e-sign function ─────────────────────────────
def server():
    lib()
    # the SMS state carries the marketing map too (an inbound text NEVER writes to it)
    edit('netlify/functions/missed-call.js', [
        ("  ['calls', 'texted', 'optout', 'owner', 'consent', 'welcomed'].forEach(k =>",
         "  /* patch SMSC2: marketing consent by phone — written only by the e-sign function / staff, NEVER by an inbound text */\n  ['calls', 'texted', 'optout', 'owner', 'consent', 'welcomed', 'marketing'].forEach(k =>"),   # patch SMSC2 (see the comment added in the file)
    ])
    edit('netlify/functions/texts.js', [
        ("if (!isSub) { const cst = SC.statusFor(CD || {}, to, st.consent), why = SC.refusal(cst, marketing); if (why) return { code: 409, body: { ok: false, consent: cst || 'unknown', error: why } }; }",
         "/* patch SMSC2: a marketing / promotional send needs the SEPARATE smsMarketing = yes (job-text yes is not enough) */\n"
         "    if (!isSub) { const cst = SC.statusFor(CD || {}, to, st.consent), mst = SC.marketingStatusFor(CD || {}, to, st.marketing), why = SC.refusal(cst, marketing, mst);\n"
         "      if (why) return { code: 409, body: { ok: false, consent: cst || 'unknown', marketingConsent: mst || 'unknown', error: why } }; }"),
    ])
    edit('netlify/functions/portal-sign.js', [
        ("  const T = scrubber(p), ip = ipOf(event), at = new Date().toISOString(), sigId",
         "  /* patch SMSC2: the separate, optional OFFERS box (promotional texts) — its own tick, its own record (smsMarketing) */\n"
         "  let smsM = null;\n"
         "  if ((r.kind === 'contract' || r.kind === 'estimate') && body.smsMarketing && typeof body.smsMarketing === 'object') {\n"
         "    const ph = SC.phone10(body.smsMarketing.phone), yes = body.smsMarketing.agree === true;\n"
         "    if (yes && ph.length !== 10) return { status: 400, out: { ok: false, error: 'Please enter the 10-digit mobile number for texts, or leave the offers box unticked.' } };\n"
         "    smsM = { status: yes ? 'yes' : 'no', at: new Date().toISOString(), via: 'contract', phone: ph.length === 10 ? ph : '' };\n"
         "  }\n"
         "  const T = scrubber(p), ip = ipOf(event), at = new Date().toISOString(), sigId"),
        ("ref: sigId, sms: smsC });", "ref: sigId, sms: smsC, smsM: smsM });"),
        ("  if (o.sms) {   /* patch SMSCONSENT */\n"
         "    b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Text messages' }, { t: 'p', text: 'Mobile number for texts: ' + (o.sms.phone ? require('./_lib/sms.js').tidy(o.sms.phone) : '(none given)') },\n"
         "      { t: 'p', text: (o.sms.status === 'yes' ? '[X]  ' : '[  ]  ') + require('./_lib/smsconsent.js').CONSENT_TEXT, size: 9 },\n"
         "      { t: 'p', text: o.sms.status === 'yes' ? 'The customer ticked this box themselves.' : 'The customer did not tick this box — GrayCo will not send them text messages.', size: 9, muted: true });\n"
         "  }\n",
         "  if (o.sms || o.smsM) {   /* patch SMSCONSENT + SMSC2: two separate boxes, each shown ticked or not */\n"
         "    const SCx = require('./_lib/smsconsent.js'), so = o.sms || o.smsM;\n"
         "    b.push({ t: 'gap', h: 6 }, { t: 'h', text: 'Text messages' }, { t: 'p', text: 'Mobile number for texts: ' + (so.phone ? require('./_lib/sms.js').tidy(so.phone) : '(none given)') });\n"
         "    if (o.sms) b.push({ t: 'p', text: (o.sms.status === 'yes' ? '[X]  ' : '[  ]  ') + '" + JOB_LABEL + " ' + SCx.CONSENT_TEXT, size: 9 },\n"
         "      { t: 'p', text: o.sms.status === 'yes' ? 'The customer ticked this box themselves.' : 'The customer did not tick this box — GrayCo will not send them job text messages.', size: 9, muted: true });\n"
         "    if (o.smsM) b.push({ t: 'p', text: (o.smsM.status === 'yes' ? '[X]  ' : '[  ]  ') + '" + MKT_LABEL + " ' + SCx.MARKETING_TEXT, size: 9 },\n"
         "      { t: 'p', text: o.smsM.status === 'yes' ? 'The customer ticked this box themselves.' : 'The customer did not tick this box — GrayCo will not send them promotional text messages.', size: 9, muted: true });\n"
         "  }\n"),
        ("  if (smsC) signedRec.smsConsent = smsC;   /* patch SMSCONSENT */",
         "  if (smsC) signedRec.smsConsent = smsC;   /* patch SMSCONSENT */\n  if (smsM) signedRec.smsMarketing = smsM;   /* patch SMSC2 */"),
        ("  if (smsC) { try { await SC.record(smsC, [p.clientPhone, p.phone, p.customerPhone]); } catch (e) {} }",
         "  if (smsC) { try { await SC.record(smsC, [p.clientPhone, p.phone, p.customerPhone]); } catch (e) {} }\n"
         "  if (smsM) { try { await SC.record(smsM, [p.clientPhone, p.phone, p.customerPhone], 'marketing'); } catch (e) {} }   /* patch SMSC2 */"),
    ])


# ───────────────────────────── portal.html (customer e-sign page) ─────────────────────────────
def portal_page():
    edit('portal.html', [
        ("    box.appendChild(h('label', { class: 'sel-agree' }, [smsBox, h('span', { text: ' " + OLD + "' })]));\n  }\n",
         "    box.appendChild(h('label', { class: 'sel-agree' }, [smsBox, h('span', {}, [h('strong', { text: '" + JOB_LABEL + "' }), ' " + JOB + "'])]));\n"
         "    /* patch SMSC2: the separate, optional OFFERS box — unchecked by default, never required */\n"
         "    mktBox = kept(h('input', { type: 'checkbox', id: 'gcesign-mkt-' + x.id, 'data-gc-mkt': '1' }), 'm_' + x.id, true);\n"
         "    box.appendChild(h('label', { class: 'sel-agree' }, [mktBox, h('span', {}, [h('strong', { text: '" + MKT_LABEL + "' }), ' " + MKT + "'])]));\n  }\n"),
        ("  var smsPh = null, smsBox = null;\n", "  var smsPh = null, smsBox = null, mktBox = null;\n"),
        ("smsConsent: smsBox ? { agree: !!smsBox.checked, phone: smsPh.value } : undefined })",
         "smsConsent: smsBox ? { agree: !!smsBox.checked, phone: smsPh.value } : undefined, smsMarketing: mktBox ? { agree: !!mktBox.checked, phone: smsPh.value } : undefined })"),
    ])


# (the public sms-consent / terms / privacy pages were split separately in commit 94e039f — not touched here)


# ───────────────────────────── index.html ─────────────────────────────
LS = '{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['


def old_box(v, x, setter):
    return ('window._gcSmsC&&e.jsx(re,{l:"📱 Text consent",s:3,children:e.jsxs("label",{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['
            'e.jsx("input",{type:"checkbox","data-gc-smsbox":"1",checked:!!(@V@.smsConsent&&@V@.smsConsent.status==="yes"),onChange:@X@=>@SET@({...@V@,smsConsent:window._gcSmsC.rec(@X@.target.checked,null,"intake",@V@.clientPhone)})}),'
            'e.jsx("span",{children:window._gcSmsC.text})]})}),').replace('@V@', v).replace('@X@', x).replace('@SET@', setter)


def new_box(v, x, setter):
    job = ('window._gcSmsC&&e.jsx(re,{l:"📱 Job texts",s:3,children:e.jsxs("label",{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['
           'e.jsx("input",{type:"checkbox","data-gc-smsbox":"1",checked:!!(@V@.smsConsent&&@V@.smsConsent.status==="yes"),onChange:@X@=>@SET@({...@V@,smsConsent:window._gcSmsC.rec(@X@.target.checked,null,"intake",@V@.clientPhone)})}),'
           'e.jsxs("span",{children:[e.jsx("b",{children:"' + JOB_LABEL + ' "}),window._gcSmsC.text]})]})}),')
    mkt = ('window._gcSmsC&&e.jsx(re,{l:"📱 Offers (optional, separate)",s:3,children:e.jsxs("label",{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['
           'e.jsx("input",{type:"checkbox","data-gc-mktbox":"1",checked:!!(@V@.smsMarketing&&@V@.smsMarketing.status==="yes"),onChange:@X@=>@SET@({...@V@,smsMarketing:window._gcSmsC.rec(@X@.target.checked,null,"intake",@V@.clientPhone)})}),'
           'e.jsxs("span",{children:[e.jsx("b",{children:"' + MKT_LABEL + ' "}),window._gcSmsC.mtext]})]})}),')
    return (job + mkt).replace('@V@', v).replace('@X@', x).replace('@SET@', setter)


OLD_CUST = ('window._gcSmsC&&e.jsx(re,{l:"📱 Texts",children:e.jsxs("div",{children:[e.jsx("div",{"data-gc-smsline":"1",style:{fontSize:12,fontWeight:700,marginBottom:4},children:window._gcSmsC.line(z)}),'
            '(E&&E.id)?((sr.role==="Admin"||/office/i.test(sr.role||""))&&e.jsx("button",{type:"button","data-gc-smstoggle":"1",style:{...ot,fontSize:11,padding:"3px 10px"},'
            'onClick:()=>De({...z,smsConsent:window._gcSmsC.rec(window._gcSmsC.status(z)!=="yes",z.smsConsent,"staff",z.phone,!0)}),'
            'children:window._gcSmsC.status(z)==="yes"?"Record: customer does NOT want texts":"Record: customer agreed to texts"})):'
            'e.jsxs("label",{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['
            'e.jsx("input",{type:"checkbox","data-gc-smsbox":"1",checked:!!(z.smsConsent&&z.smsConsent.status==="yes"),onChange:Ve=>De({...z,smsConsent:window._gcSmsC.rec(Ve.target.checked,null,"intake",z.phone)})}),'
            'e.jsx("span",{children:window._gcSmsC.text})]})]})}),')

LBL = '{style:{display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.4,fontWeight:400},children:['
NEW_CUST = ('window._gcSmsC&&e.jsx(re,{l:"📱 Texts",children:e.jsxs("div",{children:[e.jsx("div",{"data-gc-smsline":"1",style:{fontSize:12,fontWeight:700,marginBottom:4},children:window._gcSmsC.line(z)}),'
            '(E&&E.id)?((sr.role==="Admin"||/office/i.test(sr.role||""))&&e.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap"},children:['
            'e.jsx("button",{type:"button","data-gc-smstoggle":"1",style:{...ot,fontSize:11,padding:"3px 10px"},'
            'onClick:()=>De({...z,smsConsent:window._gcSmsC.rec(window._gcSmsC.status(z)!=="yes",z.smsConsent,"staff",z.phone,!0)}),'
            'children:window._gcSmsC.status(z)==="yes"?"Record: customer does NOT want job texts":"Record: customer agreed to job texts"}),'
            'e.jsx("button",{type:"button","data-gc-mkttoggle":"1",style:{...ot,fontSize:11,padding:"3px 10px"},'
            'onClick:()=>De({...z,smsMarketing:window._gcSmsC.rec(window._gcSmsC.mstatus(z)!=="yes",z.smsMarketing,"staff",z.phone,!0)}),'
            'children:window._gcSmsC.mstatus(z)==="yes"?"Record: customer does NOT want offers":"Record: customer agreed to offers"})]})):'
            'e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8},children:['
            'e.jsxs("label",' + LBL +
            'e.jsx("input",{type:"checkbox","data-gc-smsbox":"1",checked:!!(z.smsConsent&&z.smsConsent.status==="yes"),onChange:Ve=>De({...z,smsConsent:window._gcSmsC.rec(Ve.target.checked,null,"intake",z.phone)})}),'
            'e.jsxs("span",{children:[e.jsx("b",{children:"' + JOB_LABEL + ' "}),window._gcSmsC.text]})]}),'
            'e.jsxs("label",' + LBL +
            'e.jsx("input",{type:"checkbox","data-gc-mktbox":"1",checked:!!(z.smsMarketing&&z.smsMarketing.status==="yes"),onChange:Ve=>De({...z,smsMarketing:window._gcSmsC.rec(Ve.target.checked,null,"intake",z.phone)})}),'
            'e.jsxs("span",{children:[e.jsx("b",{children:"' + MKT_LABEL + ' "}),window._gcSmsC.mtext]})]})]})]})}),')

TAIL = r'''<script id="gc-patch-smsconsent">
/* ============================================================================
   patch SMSCONSENT (A2P 10DLC) + patch SMSC2 (Twilio 30913) — text-message consent on the customer and the job.
   TWO separate records, each { status:'yes'|'no', at:ISO, via:'contract'|'intake'|'text'|'staff', phone }:
     · smsConsent   = JOB texts (appointment / crew scheduling, job updates, estimates, invoices);
     · smsMarketing = OFFERS: optional promotional texts, a separate box — never implied by the job-text box.
     · the contract (printed / PDF + the portal e-sign page) and the intake forms carry BOTH boxes, unchecked by default;
     · a signed contract writes both answers onto the job (patch AUTO5 applyContract); this file copies a job's newest
       answers onto the customer record with the same name / phone;
     · 📱 Texts: Job texts: Yes/No/Not recorded · Offers: Yes/No/Not recorded shows on the customer record, with admin-only toggles (via 'staff').
   The server (texts.js, missed-call.js, portal-sign.js …) enforces it: job 'no' → no job text; a marketing text needs Offers = Yes.
   Console: _gcSmsC.status(customer)  _gcSmsC.mstatus(customer)  _gcSmsC.reconcile()
   ========================================================================== */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_SMSCONSENT__) return; W.__GC_PATCH_SMSCONSENT__ = true;
var TEXT = @@JOB@@;
var MTEXT = @@MKT@@;
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
/* the newest answer for this customer / job (field = 'smsConsent' | 'smsMarketing'): its own, plus the jobs and customers with the same name or phone */
function related(r, field){
  field = field || 'smsConsent'; r = r || {}; var out = []; if (r[field]) out.push(r[field]);
  var nm = low(r.name || r.client || r.company), ph = d10(r.phone || r.clientPhone);
  arr(crm().projects).forEach(function(p){ if (!p || p === r || p.deleted || !p[field]) return; if ((nm && low(p.client) === nm) || (ph && d10(p.clientPhone) === ph)) out.push(p[field]); });
  arr(crm().customers).forEach(function(c){ if (!c || c === r || c.deleted || !c[field]) return; if ((nm && low(c.name || c.company) === nm) || (ph && d10(c.phone) === ph)) out.push(c[field]); });
  return newest(out);
}
function status(r){ var c = related(r, 'smsConsent'); return c ? c.status : ''; }
function mstatus(r){ var c = related(r, 'smsMarketing'); return c ? c.status : ''; }
var VIA = { contract: 'on the contract', intake: 'at intake', text: 'they texted us first', staff: 'set by staff' };
function word(st){ return st === 'yes' ? 'Yes' : st === 'no' ? 'No' : 'Not recorded'; }
function part(c){ var st = c ? c.status : ''; return word(st) + (c ? ' (' + (VIA[c.via] || c.via || 'recorded') + (c.at ? ', ' + c.at.slice(0, 10) : '') + ')' : ''); }
function line(r){ return '📱 Texts — Job texts: ' + part(related(r, 'smsConsent')) + ' · Offers: ' + part(related(r, 'smsMarketing')); }
function myUser(){ var m = ''; try { m = localStorage.getItem('grayco_user') || ''; } catch (e) {} return arr(crm().users).filter(function(x){ return x && (x.email === m || x.name === m); })[0]; }
function isAdmin(){ var u = myUser(); return !!(u && (low(u.payType) === 'owner' || u.role === 'Admin' || /office/i.test(u.role || ''))); }

/* the phone-width customer sheet (_gcEditCustomer) */
function sheetHtml(cust){
  cust = cust || {}; var st = status(cust), ms = mstatus(cust), lab = '<label style="color:#8fa8c4;font-size:12px;font-weight:700;display:block;margin-bottom:5px;">📱 Texts</label>';
  var bs = 'margin-top:8px;margin-right:6px;padding:10px 14px;border-radius:10px;border:1px solid #1e3a5f;background:#0f2440;color:#cbd5e1;font-weight:700;font-size:13px';
  if (!cust.id) return '<div style="margin-bottom:14px;">' + lab +
    '<label style="display:flex;gap:10px;align-items:flex-start;color:#cbd5e1;font-size:13px;line-height:1.4"><input type="checkbox" id="_ecSms" data-gc-smsbox="1" style="width:22px;height:22px;margin-top:2px;flex:none"><span><b>Job texts:</b> ' + esc(TEXT) + '</span></label>' +
    '<label style="display:flex;gap:10px;align-items:flex-start;color:#cbd5e1;font-size:13px;line-height:1.4;margin-top:10px"><input type="checkbox" id="_ecMkt" data-gc-mktbox="1" style="width:22px;height:22px;margin-top:2px;flex:none"><span><b>Offers (optional, separate):</b> ' + esc(MTEXT) + '</span></label></div>';
  return '<div style="margin-bottom:14px;">' + lab + '<div id="_ecSmsLine" style="color:#fff;font-size:14px;font-weight:700">' + esc(line(cust)) + '</div>' +
    (isAdmin() ? '<button type="button" id="_ecSmsBtn" data-v="" data-st="' + st + '" style="' + bs + '">' + (st === 'yes' ? 'Record: customer does NOT want job texts' : 'Record: customer agreed to job texts') + '</button>' +
    '<button type="button" id="_ecMktBtn" data-v="" data-st="' + ms + '" style="' + bs + '">' + (ms === 'yes' ? 'Record: customer does NOT want offers' : 'Record: customer agreed to offers') + '</button>' : '') + '</div>';
}
function sheetRead(cust){
  cust = cust || {}; var ph = (D.getElementById('_ecPhone') || {}).value || cust.phone;
  if (!cust.id) { var b = D.getElementById('_ecSms'); return b && b.checked ? rec(true, null, 'intake', ph) : cust.smsConsent; }
  var btn = D.getElementById('_ecSmsBtn'); if (btn && btn.getAttribute('data-v')) return rec(btn.getAttribute('data-v') === 'yes', cust.smsConsent, 'staff', ph, true);
  return cust.smsConsent;
}
function sheetReadM(cust){
  cust = cust || {}; var ph = (D.getElementById('_ecPhone') || {}).value || cust.phone;
  if (!cust.id) { var b = D.getElementById('_ecMkt'); return b && b.checked ? rec(true, null, 'intake', ph) : cust.smsMarketing; }
  var btn = D.getElementById('_ecMktBtn'); if (btn && btn.getAttribute('data-v')) return rec(btn.getAttribute('data-v') === 'yes', cust.smsMarketing, 'staff', ph, true);
  return cust.smsMarketing;
}
D.addEventListener('click', function(ev){
  var t = ev.target && ev.target.closest ? ev.target.closest('#_ecSmsBtn,#_ecMktBtn') : null; if (!t) return;
  var next = t.getAttribute('data-st') === 'yes' ? 'no' : 'yes'; t.setAttribute('data-v', next); t.setAttribute('data-st', next);
  t.textContent = '✓ Will record: ' + (t.id === '_ecMktBtn' ? 'Offers ' : 'Job texts ') + (next === 'yes' ? 'Yes' : 'No') + ' — tap Save Customer';
}, true);

/* a job's newest answers → the customer record with the same name / phone (so "the customer" shows them too).
   Reads the saved customer list from this computer's store (window._crm.customers can be an older snapshot) and writes it back the way the sheet above does. */
var busy = false, FIELDS = ['smsConsent', 'smsMarketing'];
function reconcile(){
  if (busy) return Promise.resolve(0); busy = true;
  return Promise.resolve(W.idbGet ? W.idbGet('customers') : null).catch(function(){ return null; }).then(function(idb){
    var cs = Array.isArray(idb) && idb.length ? idb : arr(crm().customers), ps = arr(crm().projects); if (!cs.length || !ps.length) return 0;
    var changed = 0, next = cs.map(function(c){
      if (!c || c.deleted) return c; var nm = low(c.name || c.company), ph = d10(c.phone), out = c, hit = false;
      FIELDS.forEach(function(f){
        var list = [];
        ps.forEach(function(p){ if (p && !p.deleted && p[f] && ((nm && low(p.client) === nm) || (ph && d10(p.clientPhone) === ph))) list.push(p[f]); });
        var best = newest(list); if (!best) return; var cur = clean(c[f]); if (cur && cur.at >= best.at) return;
        var o = {}; o[f] = best; out = Object.assign({}, out, o); hit = true;
      });
      if (hit) changed++; return out;
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
W._gcSmsC = { text: TEXT, mtext: MTEXT, rec: rec, status: status, mstatus: mstatus, line: line, isAdmin: isAdmin, sheetHtml: sheetHtml, sheetRead: sheetRead, sheetReadM: sheetReadM, reconcile: reconcile };
try { console.log('[GC] Text-message consent ready (patch SMSCONSENT + SMSC2: job texts and offers are separate)'); } catch (e) {}
})();
</script>
'''.replace('@@JOB@@', json.dumps(JOB)).replace('@@MKT@@', json.dumps(MKT))
TAIL_START = '<script id="gc-patch-smsconsent">'


def index_page():
    rel = 'index.html'
    src = rd(rel)
    if MARK in src:
        print('already patched:', rel)
        return
    ca = lambda t: t.replace("'", "\\'")
    pairs = [
        # React forms: New Project (y/j/T), Launch Job (Le/y/dn), the Customer modal
        (old_box('y', 'j', 'T'), '/*SMSC2*/' + new_box('y', 'j', 'T')),
        (old_box('Le', 'y', 'dn'), new_box('Le', 'y', 'dn')),
        (OLD_CUST, NEW_CUST),
        ('smsConsent:Le.smsConsent/*SMSCONSENT*/,notes:B,', 'smsConsent:Le.smsConsent/*SMSCONSENT*/,smsMarketing:Le.smsMarketing,notes:B,'),
        ('email:Le.clientEmail||"",smsConsent:Le.smsConsent/*SMSCONSENT*/,address:Le.address', 'email:Le.clientEmail||"",smsConsent:Le.smsConsent/*SMSCONSENT*/,smsMarketing:Le.smsMarketing,address:Le.address'),
        # phone-width sheet save
        ("smsConsent:(window._gcSmsC?window._gcSmsC.sheetRead(cust):cust.smsConsent), updatedAt",
         "smsConsent:(window._gcSmsC?window._gcSmsC.sheetRead(cust):cust.smsConsent), smsMarketing:(window._gcSmsC?window._gcSmsC.sheetReadM(cust):cust.smsMarketing), updatedAt"),
        # printed contract (Forms library): two unchecked boxes
        ("'</span> " + h(OLD) + "</td></tr></table>',",
         "'</span> <b>" + JOB_LABEL + "</b> " + h(JOB) + "</td></tr>'+/*SMSC2*/\n"
         "      '<tr><td style=\"font-size:10px\"><span style=\"font-size:15px\">'+(j.smsMarketing&&j.smsMarketing.status==='yes'?'&#9746;':'&#9744;')+'</span> <b>" + MKT_LABEL + "</b> " + h(MKT) + "</td></tr></table>',"),
        # the uploaded-template overlay
        ("<td colspan=\"2\" style=\"padding:6px;font-size:11px;color:#444\">&#9744; " + h(OLD) + "</td></tr>'+",
         "<td colspan=\"2\" style=\"padding:6px;font-size:11px;color:#444\">&#9744; <b>" + JOB_LABEL + "</b> " + h(JOB) + "</td></tr>'+/*SMSC2*/\n"
         "            '<tr><td colspan=\"2\" style=\"padding:6px;font-size:11px;color:#444\">&#9744; <b>" + MKT_LABEL + "</b> " + h(MKT) + "</td></tr>'+"),
        # the auto contract PDF, section 7
        ("    P.txt('[    ]  ' + " + json.dumps(OLD) + ");",
         "    P.txt('[    ]  " + JOB_LABEL + " ' + " + json.dumps(JOB) + ");   /* patch SMSC2: two separate boxes */\n"
         "    P.txt('[    ]  " + MKT_LABEL + " ' + " + json.dumps(MKT) + ");"),
        # a signed contract / estimate in the portal → the job
        ("via: 'contract', phone: s(r.signed.smsConsent.phone) };   /* patch SMSCONSENT */",
         "via: 'contract', phone: s(r.signed.smsConsent.phone) };   /* patch SMSCONSENT */\n"
         "    if (r.signed.smsMarketing && /^(yes|no)$/.test(s(r.signed.smsMarketing.status))) q.smsMarketing = { status: s(r.signed.smsMarketing.status), at: s(r.signed.smsMarketing.at) || s(r.signed.at), via: 'contract', phone: s(r.signed.smsMarketing.phone) };   /* patch SMSC2 */"),
    ]
    for find, repl in pairs:
        n = src.count(find)
        assert n == 1, (rel, 'find-string matched %d times' % n, find[:100])
        src = src.replace(find, repl)
    # the client-side module (its own <script> block) is replaced as a whole
    assert src.count(TAIL_START) == 1, 'smsconsent module marker'
    i = src.index(TAIL_START)
    j = src.index('</script>\n', i) + len('</script>\n')
    assert src[i:j].count('<script') == 1, 'smsconsent module block not isolated'
    src = src[:i] + TAIL + src[j:]
    wr(rel, src)
    print('patched:', rel)


if __name__ == '__main__':
    server()
    portal_page()
    index_page()
