/* ============================================================================
   GrayCo — SPEED-TO-LEAD TEXT (patch SPEEDLEAD).   netlify/functions/_lib/speedlead.js

   Owner 10/29 (item 7, approved): a NEW lead from the website form or a leads@ e-mail gets ONE text from the GrayCo
   number about a minute after it arrives:
     "Thanks for contacting GrayCo Construction Services — we will call you soon. Reply here with any photos or
      questions. Reply STOP to opt out."
   Rules:
     · only website-form leads and leads@ e-mail leads (website-intake.js queues them with enqueue()) — never missed calls
       or texts (they already get their own automatic text), never plan-room / bid-board / bids@ leads, never a staff
       number (Admin → 📱 Text alerts people, or a CRM user's phone);
     · a 10-digit mobile number AND SMS consent: the website form's explicit opt-in box (smsConsent: true / sms_job — never
       pre-ticked), or job-text consent already on file ('yes', e.g. they texted us first). A leads@ e-mail has no consent
       of its own;
     · business hours only (📞 Call order hours, _lib/callorder.js isOpen). After hours nothing is sent (the morning team
       calls) — EXCEPT an emergency lead (_lib/emergency.js), which is texted on the next tick, any hour;
     · never to STOP, never in ⏸ Data-entry mode (a lead that arrives then is not texted later);
     · once per phone number per 30 days;
     · logged on the lead's conversation (TEXTLEAD leadExtra.textLog) — _lib/custtext.js does the sending.
   Queue + "sent" marks: gc_lead_inbox_kv "gc_speedlead" { queue: [{ leadId, ph, at, emergency, consent, source }],
   sent: { <10 digits>: ISO } }. The clock is x10-scheduled.js (every 2 minutes): an entry ≥ 60 s old is decided, an
   entry older than 2 hours is dropped. SPEED_LEAD_TEXT_OFF=1 stops it.
   ========================================================================== */
'use strict';
const KEY = 'gc_speedlead';
const TEXT = 'Thanks for contacting GrayCo Construction Services — we will call you soon. Reply here with any photos or questions. Reply STOP to opt out.';
const WAIT_MS = 60 * 1000, STALE_MS = 2 * 3600e3, ONCE_MS = 30 * 864e5;

function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function env(k){ return s(process.env[k]); }

/* ── deps (tests swap these) ── */
function L(){ return require('../bid-inbox.js')._lib; }
const _D = {
  now: () => Date.now(),
  kvGet: k => L().kvGet(k),
  kvCas: (k, f) => L().kvCas(k, f),
  data: async () => { try { return await require('../portal.js')._core.kvRead(['customers', 'projects', 'leads', 'users']); } catch (e) { return {}; } },
  staffPhone: async ph => { try { return await require('./smsalert.js').isStaffPhone(ph); } catch (e) { return false; } },
  send: o => require('./custtext.js').send(o),
  check: (ph, data, o) => require('./custtext.js').check(ph, data, o)
};
function loadState(v){ const o = obj(v); const sent = obj(o.sent), cut = _D.now() - ONCE_MS; Object.keys(sent).forEach(k => { if (!(Date.parse(sent[k]) >= cut)) delete sent[k]; }); return { queue: arr(o.queue).slice(-300), sent }; }

/* which new leads qualify at all (pure): a website-form / leads@ lead, not a missed call / text / bid board */
function eligibleSource(rec){
  rec = rec || {}; const le = obj(rec.leadExtra);
  if (le.missedCall || le.textMessage || le.smsFrom || rec.smsFrom || rec.missedCall) return false;
  if (/missed call|text message|call screening/i.test(s(rec.websiteForm) + ' ' + s(rec.source))) return false;
  if (/bid|plan ?room|planhub|buildingconnected|isqft|dodge|construct ?connect|bid ?board/i.test(s(rec.source) + ' ' + s(rec.sourceKind) + ' ' + s(rec.type) + ' ' + s(le.leadSource))) return false;
  if (rec.type === 'commercial' && /bid/i.test(s(rec.title))) return false;
  if (le.softLead || /guide download|application/i.test(s(rec.title))) return false;
  return rec.origin === 'website' || rec.sourceKind === 'website' || /website|leads@/i.test(s(rec.source));
}
/* website-intake.js → after a NEW lead is filed. o = { consent: true when the form's opt-in box was ticked } */
async function enqueue(rec, o){
  o = o || {};
  if (env('SPEED_LEAD_TEXT_OFF') === '1') return { off: true };
  if (!rec || !eligibleSource(rec)) return { skipped: 'not a website / leads@ lead' };
  const ph = phone10(obj(rec.contact).phone || rec.phone);
  if (ph.length !== 10) return { skipped: 'no mobile number' };
  let emergency = false; try { emergency = require('./emergency.js').isEmergency(rec); } catch (e) {}
  const item = { leadId: s(rec.id), ph, at: new Date(_D.now()).toISOString(), emergency: !!emergency, consent: o.consent === true, source: s(rec.source).slice(0, 60) };
  let added = false;
  await _D.kvCas(KEY, v => { const st = loadState(v); if (st.queue.some(x => x.leadId === item.leadId)) return undefined; st.queue.push(item); added = true; return st; });
  return { queued: added, emergency: item.emergency };
}
/* decide one queued entry (pure part): 'wait' | 'drop:<why>' | 'send' (+ anyHour) — the custtext check does consent / STOP / pause / hours */
function ready(item, st, nowMs){
  const age = nowMs - Date.parse(item.at);
  if (!(age >= 0)) return 'drop:bad time';
  if (age > STALE_MS) return 'drop:too old';
  if (!item.emergency && age < WAIT_MS) return 'wait';
  if (st.sent[item.ph] && nowMs - Date.parse(st.sent[item.ph]) < ONCE_MS) return 'drop:already texted in the last 30 days';
  return 'send';
}
/* the clock (x10-scheduled.js, every 2 minutes) */
async function tick(){
  if (env('SPEED_LEAD_TEXT_OFF') === '1') return { off: true };
  const st0 = loadState(await _D.kvGet(KEY));
  if (!st0.queue.length) return { queue: 0 };
  const out = { sent: 0, dropped: [], waiting: 0 }, nowMs = _D.now();
  let data = null;
  for (const item of st0.queue) {
    const r = ready(item, st0, nowMs);
    if (r === 'wait') { out.waiting++; continue; }
    let why = r.indexOf('drop:') === 0 ? r.slice(5) : '';
    if (!why && await _D.staffPhone(item.ph)) why = 'a staff number';
    if (!why) {
      data = data || await _D.data();
      if (arr(data.users).some(u => [u.phone, u.cell, u.mobile, u.cellPhone].map(phone10).indexOf(item.ph) >= 0)) why = 'a staff number';
    }
    const opt = { anyHour: item.emergency, consent: item.consent === true ? true : undefined };
    if (!why) why = await _D.check(item.ph, data, opt);
    /* claim the phone (once per 30 days), then send; a failed send gives the claim back */
    let mine = false;
    await _D.kvCas(KEY, v => {
      const st = loadState(v); const i = st.queue.findIndex(x => x.leadId === item.leadId); if (i < 0) return undefined;
      st.queue.splice(i, 1);
      if (!why) { if (st.sent[item.ph]) { why = 'already texted in the last 30 days'; return st; } st.sent[item.ph] = new Date(_D.now()).toISOString(); mine = true; }
      return st;
    });
    if (!mine) { out.dropped.push({ leadId: item.leadId, why: why || 'taken' }); continue; }
    const res = await _D.send({ ph: item.ph, text: TEXT, data, leadId: item.leadId, kind: 'speedlead', id: item.leadId, who: 'speed-to-lead', anyHour: item.emergency, consent: opt.consent });
    if (res.ok) out.sent++;
    else { out.dropped.push({ leadId: item.leadId, why: res.why }); await _D.kvCas(KEY, v => { const st = loadState(v); delete st.sent[item.ph]; return st; }).catch(() => {}); }
  }
  return out;
}

module.exports = { KEY, TEXT, WAIT_MS, ONCE_MS, eligibleSource, enqueue, ready, tick, loadState, _D };
