/* ============================================================================
   GrayCo — ONE DOOR FOR AUTOMATIC CUSTOMER TEXTS (patch AUTOC).   netlify/functions/_lib/custtext.js

   Owner 10/29 approved automations that text customers by themselves: the estimate follow-up on day 5 (portal-sign.js),
   the review request after a finished job (_lib/reviewreq.js), the referral thank-you (_lib/referral.js) and
   speed-to-lead (_lib/speedlead.js). Every one of them goes through check() + send() here, so the rules live in ONE place:
     · a 10-digit mobile number (the number the customer gave for texts first — smsConsent.phone —, then cell / mobile,
       then the main phone; a record marked phoneType / clientPhoneType 'landline' never gets a text);
     · SMS consent: the customer's JOB-text consent must be 'yes' (_lib/smsconsent.js — the contract / intake tick box, or
       they texted us first). Legacy "not recorded" is NOT enough for these automatic texts;
     · never to a number on the STOP list (gc_sms_state optout) — STOP always wins;
     · never while ⏸ Data-entry mode is on (_lib/pause) — checked here, so nothing is marked "sent" when it was skipped;
     · business hours only: the 📞 Call order business hours (_lib/callorder.js isOpen; default Mon–Fri 7 AM–6 PM Central,
       holidays closed). opts.anyHour lets an emergency through (speed-to-lead only);
     · A2P 10DLC: every text starts with the business name "GrayCo Construction Services" and ends with "Reply STOP to opt
       out." (added here when the wording does not already carry them); never an insurance carrier's name (scrubbed);
     · sent from the Customers number (Admin → 💬 Our numbers; else TWILIO_FROM), logged on the job's 💬 Communication
       timeline + Job Messages when there is a job, and on the lead's conversation (TEXTLEAD) when the number has a lead.
   ========================================================================== */
'use strict';
const BRAND = 'GrayCo Construction Services';
const STOP_LINE = 'Reply STOP to opt out.';
const CARRIERS = /\b(state farm|allstate|usaa|farmers( insurance)?|liberty mutual|nationwide|progressive|travelers|erie|shelter insurance|auto[- ]owners|american family|geico|chubb|tennessee farmers|farm bureau|metlife|safeco|the hartford|homesite|assurant|universal property|american strategic)\b/gi;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function env(k){ return s(process.env[k]); }

/* ── deps (tests swap these) ── */
function MC(){ return require('../missed-call.js')._test; }
function L(){ return require('../bid-inbox.js')._lib; }
function core(){ return require('../portal.js')._core; }
const _D = {
  now: () => Date.now(),
  paused: async () => { try { return await require('./pause').isPaused(); } catch (e) { return true; } },
  smsState: async () => { try { return await MC().stateGet(); } catch (e) { return null; } },
  hours: async () => { try { const CO = require('./callorder.js'); const raw = await L().kvGet(CO.KEY); return (raw && typeof raw === 'object' ? CO.clean(raw) : CO.defaults()).hours; } catch (e) { return null; } },
  ready: () => { try { return MC().ready(); } catch (e) { return false; } },
  from: async () => { try { const S = require('./sms.js'); return require('./smsroute.js').fromFor('customers', S.settings(await L().kvGet(S.SETTINGS_KEY)), env); } catch (e) { return ''; } },
  send: (to10, body, from) => MC().sendSms(to10, body, from),
  jobLog: async (pid, msg) => {
    const has = l => l.some(x => x && s(x.id) === msg.id);
    try { await core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has }); } catch (e) {}
    try { await require('./comms.js').addMessage(pid, { id: 'sms_' + msg.id, kind: 'text', dir: 'out', at: msg.at, from: 'GrayCo (automatic)', fromName: msg.authorName, to: [msg.smsTo], text: msg.text }); } catch (e) {}
  },
  leadLog: async o => { try { return await require('./textlead.js').onOutbound(o); } catch (e) { return { ok: false }; } }
};

/* the number a customer gave for texts: consent phone → cell / mobile → main phone (landlines never) */
function mobileOf(rec){
  rec = rec || {};
  const land = /land/i.test(s(rec.phoneType || rec.clientPhoneType || rec.customerPhoneType));
  const c = rec.smsConsent && typeof rec.smsConsent === 'object' ? phone10(rec.smsConsent.phone) : '';
  if (c.length === 10) return c;
  for (const v of [rec.cell, rec.mobile, rec.cellPhone, rec.clientCell, rec.clientMobile]) { const d = phone10(v); if (d.length === 10) return d; }
  if (land) return '';
  for (const v of [rec.clientPhone, rec.customerPhone, rec.phone, rec.contact && rec.contact.phone]) { const d = phone10(v); if (d.length === 10) return d; }
  return '';
}
/* A2P wording: the business name first, the STOP line last, no carrier names, one segment-friendly length */
function compose(text){
  let t = s(text).replace(CARRIERS, 'your insurance company').replace(/\s+/g, ' ');
  if (!/GrayCo Construction Services/i.test(t)) t = BRAND + ': ' + t;   /* the business name, once (the speed-to-lead wording carries it inside) */
  if (!/reply stop to opt out/i.test(t)) t = t.replace(/\s*$/, '') + ' ' + STOP_LINE;
  return t.slice(0, 600);
}
/* may this automatic text go to this phone right now? → '' (yes) or the reason it may not.
   data = { customers, projects, leads } (consent records); o = { anyHour, needConsent (default true), consent: true (given just now) } */
async function check(ph, data, o){
  o = o || {};
  const d = phone10(ph); if (d.length !== 10) return 'no mobile number';
  if (!_D.ready()) return 'texting is not set up';
  if (await _D.paused()) return 'data-entry mode';
  const st = await _D.smsState();
  if (!st) return 'the STOP list cannot be read';
  if (st.optout && st.optout[d]) return 'STOP';
  if (o.needConsent !== false && o.consent !== true) {
    let status = '';
    try { status = require('./smsconsent.js').statusFor(data || {}, d, st.consent || {}); } catch (e) { status = ''; }
    if (status !== 'yes') return status === 'no' ? 'declined texts' : 'no SMS consent on file';
  }
  if (!o.anyHour) {
    const hours = await _D.hours();
    let open = false;
    try { open = require('./callorder.js').isOpen(_D.now(), hours ? { hours } : null); } catch (e) { open = false; }
    if (!open) return 'outside business hours';
  }
  return '';
}
/* send one automatic text. o = { ph, text, data, pid, leadId, kind, id, anyHour, consent, who } → { ok, why, body } */
async function send(o){
  o = o || {};
  const ph = phone10(o.ph), why = await check(ph, o.data, o);
  if (why) return { ok: false, why };
  const body = compose(o.text), at = new Date(_D.now()).toISOString();
  let r; try { r = await _D.send(ph, body, await _D.from()); } catch (e) { r = { ok: false, why: s(e && e.message) }; }
  if (!r || !r.ok) return { ok: false, why: 'Twilio ' + s(r && (r.status || r.why) || 'failed'), body };
  const id = 'AUTO_' + s(o.kind || 'text') + '_' + s(o.id || at).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  if (o.pid) await _D.jobLog(o.pid, { id, pid: s(o.pid), authorId: 'sms:auto', authorName: '🤖 GrayCo automatic text (' + s(o.who || o.kind || 'automation') + ')', text: body, tags: [], at, source: 'sms', channel: 'sms', dir: 'out', smsTo: ph });
  await _D.leadLog({ ph, leadId: s(o.leadId), text: body, who: 'automatic text — ' + s(o.who || o.kind || 'automation'), id, at });
  return { ok: true, body, at, ph };
}

module.exports = { BRAND, STOP_LINE, mobileOf, compose, check, send, phone10, _D };
