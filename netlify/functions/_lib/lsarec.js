/* ============================================================================
   GrayCo — LSAREC: every Google LSA call becomes a lead with the caller's number, time, length, job type, the call
   recording and its transcript.   netlify/functions/_lib/lsarec.js

   Owner (11/19): "can you transcribe these Google LSA leads to get the info from them, phone numbers etc so we know what
   the leads are, can you also have the recording for us, the voicemail or phone recording from Brittany".

   What Google's "New call from a potential customer" e-mail has: the date and time, GrayCo's Google customer ID and a
   "View Details" link (c.gle). No caller number, no length, no job type, no recording. So the details come from:

   1. GOOGLE ADS API (Local Services) — the same Google Ads sign-in as Marketing → 📈 Ads hub (_lib/mkt2.js: developer token,
      OAuth client, the refresh token in the service-only gc_ads_tokens). local_services_lead gives the caller's number,
      name (when Google has it), category / service, lead type (call / message / booking), status, charged or not and the
      time; local_services_lead_conversation gives each call's length and Google's call recording link (only when call
      recording is turned on in the Local Services settings). Each lead is matched to the lead inbox (by Google lead id,
      then by number, then by the call time ±3 min); a call that is not there yet becomes a Google LSA lead (so an LSA call
      is a lead even when Google's e-mail never reaches leads@). Read-only: the CRM never changes anything in Google.
   2. THE OFFICE LINE'S CALL LOG (Twilio, gc_lead_inbox_kv "gc_call_log", missed-call.js) — an LSA lead with no number gets
      the call that came in from 2 minutes before to 4 minutes after Google's time (as website-intake.js lsaCaller does),
      re-checked every run, so a lead filed before the call log row was written still gets it.
   3. WESLEY'S MAILBOX (read-only Gmail, _lib/gmail.js, only when GOOGLE_SA_EMAIL / GOOGLE_SA_KEY are set): Google's call
      e-mails are read straight from the mailbox (LSA_MAILBOX, default wjohnson@grayco-cs.com) and filed like a forward
      to leads@ — no Gmail filter needed.
   4. RECORDINGS (Twilio) — when ⚡ Automations "Record office-line calls" / "Voicemail on missed calls" are ON
      (both OFF by default), missed-call.js asks Twilio to record; Twilio's recording callback lands in onRecording():
      the recording id goes on the call log row and on the lead(s) of that call (the missed-call lead, the LSA lead
      matched to that call). The audio stays in Twilio; staff play it through call-recording.js (signed in, staff only).
   5. TRANSCRIPTS — voice-intake.js's transcriber (OPENAI_API_KEY or DEEPGRAM_API_KEY). Automatic for new recordings when a
      key is set (⚡ "Transcribe call recordings", ON by default), and a 📝 Transcribe button on the lead. A short
      summary (Claude, when ANTHROPIC_API_KEY is set; else the first words) shows on the lead card.

   Staff only: nothing here is ever shown to a customer, a sub or the public; the recordings are fetched only by a signed-in
   staff member (call-recording.js) and only for a recording that belongs to that lead.
   State: gc_lead_inbox_kv "gc_lsa_sync" (last run, what Google answered, the Gmail ids already read).
   ========================================================================== */
'use strict';
const crypto = require('crypto');

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function L(){ return require('../bid-inbox.js')._lib; }
function WI(){ return require('../website-intake.js'); }
function VI(){ return require('../voice-intake.js'); }

const STATE_KEY = 'gc_lsa_sync', LOG_KEY = 'gc_call_log', INBOX = 'gc_lead_inbox';
const RSID = /^RE[0-9a-f]{32}$/;
const WIN_BEFORE = 120e3, WIN_AFTER = 240e3;   /* the office call log: 2 min before to 4 min after Google's time */
const MATCH_MS = 180e3;                       /* Google API lead ↔ an inbox lead by time: ±3 min */

/* everything outside this file goes through _D (the tests swap it) */
const _D = {
  now: () => Date.now(),
  env: k => s(process.env[k]),
  fetch: (u, o) => globalThis.fetch(u, o),
  kvGet: k => L().kvGet(k),
  kvCas: (k, f) => L().kvCas(k, f),
  isOn: k => require('./automations.js').isOn(k),
  gads: () => require('./mkt2.js')._g,
  transcriber: () => VI()._transcriber(),
  transcribe: (b64, mime) => VI()._transcribe(b64, mime),
  ai: () => require('./ai.js'),
  fileLead: (f, extra) => WI()._lib.fileLead(f, extra),
  alertLead: rec => WI()._lib.alertLead(rec),
  gmail: () => require('./gmail.js'),
  fromEmail: mail => WI().fromEmail(mail)
};

/* ── time ── */
/* a wall-clock time in Central (America/Chicago) → ms */
function centralMs(y, mo, d, h, mi, sec){
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(sec || 0));
  let off = 6; try { const z = new Date(guess).toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false, hour: '2-digit' }); off = ((+h - parseInt(z, 10)) % 24 + 24) % 24; } catch (e) {}
  return guess + off * 3600e3;
}
/* "11/18/2026" + "8:21 AM" → ms (Central) */
function mdyMs(dmy, hm){
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s(dmy)), h = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(s(hm).replace(/\s+/g, ' '));
  if (!d || !h) return NaN;
  let hr = parseInt(h[1], 10) % 12; if (/p/i.test(h[3])) hr += 12;
  return centralMs(d[3], d[1], d[2], hr, h[2]);
}
/* Google Ads "2026-11-18 08:21:36" (the account's time zone — Central for GrayCo; GOOGLE_ADS_TZ_UTC=1 if it is UTC) → ms */
function gadsMs(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s(v)); if (!m) return NaN;
  if (_D.env('GOOGLE_ADS_TZ_UTC') === '1') return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return centralMs(m[1], m[2], m[3], m[4], m[5], m[6]);
}
function gadsStamp(ms){   /* ms → "YYYY-MM-DD HH:MM:SS" Central, for a GAQL WHERE */
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day + ' ' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute + ':' + p.second;
}
function ctLabel(ms){ try { return new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return new Date(ms).toISOString(); } }
function durLabel(sec){ sec = Math.round(+sec || 0); if (!sec) return ''; return sec < 60 ? sec + 's' : Math.floor(sec / 60) + 'm ' + String(sec % 60).padStart(2, '0') + 's'; }

/* ── what an inbox lead is ── */
function isLsa(x){ const ex = obj(x && x.leadExtra); return /google\s*lsa|local\s*services/i.test([x && x.source, ex.leadSource, ex.mkSource === 'Google LSA' ? 'google lsa' : ''].map(s).join(' ')) || !!ex.lsaCheck || !!ex.lsaLeadId; }
function leadPhone(x){ return phone10(obj(x && x.contact).phone || (x && x.phone)); }
function leadAt(x){ const t = Date.parse(obj(x && x.leadExtra).receivedAt || (x && (x.receivedAt || x.created || x.createdAt)) || ''); return isFinite(t) ? t : NaN; }
/* Google's call time on an LSA lead: leadExtra.lsaCallAt, else "on 11/18/2026 at 8:21 AM" in its text */
function callAtOf(x){
  const ex = obj(x && x.leadExtra); const t0 = Date.parse(s(ex.lsaCallAt)); if (isFinite(t0)) return t0;
  const txt = [x && x.scope, x && x.message, x && x.title].concat(arr(x && x.notes)).map(s).join('\n');
  const m = /\bon\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(txt);
  return m ? mdyMs(m[1], m[2]) : NaN;
}

/* ── 1. Google Ads API: Local Services leads ── */
function humanCat(v){
  v = s(v).replace(/^xcat:/i, '').replace(/^service_area_business_/i, '').replace(/^(home_services|hs)_/i, '').replace(/_/g, ' ').trim();
  return v ? v[0].toUpperCase() + v.slice(1) : '';
}
function lsaCustomers(tokens){
  const fixed = (_D.env('GOOGLE_ADS_LSA_CUSTOMER_ID') || _D.env('GOOGLE_ADS_CUSTOMER_ID')).split(',').map(digits).filter(x => x.length >= 8);
  if (fixed.length) return fixed;
  return arr(obj(obj(tokens).google).customers).map(c => digits(c && c.id)).filter(x => x.length >= 8).slice(0, 10);
}
async function apiStatus(){
  let G = null; try { G = _D.gads(); } catch (e) { G = null; }
  if (!G) return { configured: false, connected: false, customers: [] };
  const conf = !!G.configured(); let t = {}; try { t = await G.tokens(); } catch (e) { t = {}; }
  return { configured: conf, connected: conf && !!obj(obj(t).google).refresh, customers: lsaCustomers(t) };
}
const Q_LEADS = 'SELECT local_services_lead.id, local_services_lead.category_id, local_services_lead.service_id, local_services_lead.contact_details, local_services_lead.lead_type, local_services_lead.lead_status, local_services_lead.creation_date_time, local_services_lead.lead_charged FROM local_services_lead WHERE local_services_lead.creation_date_time >= \'%S\'';
const Q_CONV = 'SELECT local_services_lead_conversation.id, local_services_lead_conversation.conversation_channel, local_services_lead_conversation.participant_type, local_services_lead_conversation.lead, local_services_lead_conversation.event_date_time, local_services_lead_conversation.phone_call_details.call_duration_millis, local_services_lead_conversation.phone_call_details.call_recording_url, local_services_lead_conversation.message_details.text FROM local_services_lead_conversation WHERE local_services_lead_conversation.event_date_time >= \'%S\'';
/* rows from Google → [{ id, customer, type, category, service, job, phone, name, email, status, charged, at, calls: [{ at, durSec, recUrl }], texts: [] }] */
function shapeLeads(cid, leadRows, convRows){
  const by = {};
  arr(leadRows).forEach(r => { const x = obj(r.localServicesLead), c = obj(x.contactDetails), id = s(x.id); if (!id) return;
    const cat = humanCat(x.categoryId), svc = humanCat(x.serviceId);
    by[id] = { id, customer: cid, type: s(x.leadType), category: cat, service: svc, job: [cat, svc && low(svc) !== low(cat) ? svc.toLowerCase() : ''].filter(Boolean).join(' — '),
      phone: phone10(c.phoneNumber), name: s(c.consumerName), email: low(c.email), status: s(x.leadStatus), charged: x.leadCharged === true, at: gadsMs(x.creationDateTime), calls: [], texts: [] }; });
  arr(convRows).forEach(r => { const v = obj(r.localServicesLeadConversation), id = s(v.lead).split('/').pop(); const L0 = by[id]; if (!L0) return;
    const ch = s(v.conversationChannel), at = gadsMs(v.eventDateTime);
    if (ch === 'PHONE_CALL') { const pc = obj(v.phoneCallDetails), u = s(pc.callRecordingUrl); L0.calls.push({ at, durSec: Math.round((+pc.callDurationMillis || 0) / 1000), recUrl: /^https:\/\//.test(u) ? u : '' }); }
    else if (s(obj(v.messageDetails).text) && s(v.participantType) === 'CONSUMER') L0.texts.push(clip(obj(v.messageDetails).text, 400)); });
  return Object.keys(by).map(k => by[k]).sort((a, b) => (a.at || 0) - (b.at || 0));
}
async function apiPull(days){
  const st = await apiStatus();
  if (!st.configured) return { ok: false, why: 'not_configured', leads: [] };
  if (!st.connected) return { ok: false, why: 'not_connected', leads: [] };
  if (!st.customers.length) return { ok: false, why: 'no_customer', leads: [] };
  const G = _D.gads(), at = await G.access(), since = gadsStamp(_D.now() - Math.max(1, Math.min(30, days || 7)) * 864e5), out = [], errors = [];
  for (const cid of st.customers) {
    try {
      const lr = await G.query(at, cid, Q_LEADS.replace('%S', since));
      let cr = []; try { cr = await G.query(at, cid, Q_CONV.replace('%S', since)); } catch (e) { errors.push(cid + ' calls: ' + clip(e && e.message, 160)); }
      shapeLeads(cid, lr, cr).forEach(x => out.push(x));
    } catch (e) { errors.push(cid + ': ' + clip(e && e.message, 200)); }
  }
  return { ok: !errors.length || out.length > 0, leads: out, errors };
}
/* the Google lead's best call (longest) */
function bestCall(g){ return arr(g.calls).slice().sort((a, b) => (b.durSec || 0) - (a.durSec || 0))[0] || null; }
/* which inbox lead is this Google lead: the same Google id → the same number (2 days) → the call time ±3 min (an LSA call lead) */
function matchInbox(list, g){
  const live = arr(list).filter(x => x && !x.deleted && !x.mergedInto);
  let hit = live.find(x => s(obj(x.leadExtra).lsaLeadId) === g.id); if (hit) return hit;
  if (g.phone.length === 10) { hit = live.find(x => isLsa(x) && leadPhone(x) === g.phone && Math.abs((leadAt(x) || g.at) - (g.at || 0)) < 2 * 864e5); if (hit) return hit; }
  if (isFinite(g.at)) { hit = live.find(x => { if (!isLsa(x) || s(obj(x.leadExtra).lsaLeadId)) return false; const t = callAtOf(x); return isFinite(t) && Math.abs(t - g.at) <= MATCH_MS; }); if (hit) return hit; }
  return null;
}
/* put Google's details on an inbox lead (in place); → true when something changed */
function enrich(x, g){
  const ex = Object.assign({}, obj(x.leadExtra)), before = JSON.stringify([x.contact, ex, x.title]);
  const c = bestCall(g);
  Object.assign(ex, { lsaLeadId: g.id, lsaLeadType: g.type, lsaStatus: g.status, lsaCharged: g.charged, lsaCustomer: g.customer });
  if (g.category) ex.lsaCategory = g.category; if (g.service) ex.lsaService = g.service; if (g.job) ex.lsaJob = g.job;
  if (isFinite(g.at) && !s(ex.lsaCallAt)) ex.lsaCallAt = new Date(g.at).toISOString();
  if (c) { if (c.durSec) ex.lsaDurSec = c.durSec; if (c.recUrl) ex.lsaRecUrl = c.recUrl; }
  if (g.texts.length) ex.lsaTexts = g.texts.slice(-5);
  if (g.type === 'PHONE_CALL' && !ex.lsaCall) ex.lsaCall = true;
  const contact = Object.assign({}, obj(x.contact));
  if (g.phone.length === 10 && phone10(contact.phone).length !== 10) { contact.phone = tidy(g.phone); ex.lsaPhoneFrom = 'google'; }
  if (g.name && (!s(contact.name) || /^Google LSA caller/i.test(s(contact.name)))) { contact.name = g.name; ex.contactName = g.name; if (/Google LSA caller/i.test(s(x.title))) x.title = clip(s(x.title).replace(/Google LSA caller(?: \([^)]*\)| \(\d{3}\) \d{3}-\d{4})?/i, g.name), 200); }
  if (!s(contact.email) && g.email) contact.email = g.email;
  x.contact = contact; x.leadExtra = ex;
  const changed = JSON.stringify([x.contact, ex, x.title]) !== before;
  if (changed) { const line = '📍 Google LSA details: ' + [g.job, c && c.durSec ? durLabel(c.durSec) + ' call' : '', g.phone ? tidy(g.phone) : '', g.charged ? 'charged' : ''].filter(Boolean).join(' · ') + '.';
    if (!arr(x.notes).some(n => s(n) === line)) x.notes = arr(x.notes).concat([line]).slice(-60); x.updatedAt = new Date(_D.now()).toISOString(); }
  return changed;
}
function newLeadForm(g){
  const c = bestCall(g), when = isFinite(g.at) ? ctLabel(g.at) : '';
  const msg = (g.type === 'PHONE_CALL' ? 'A potential customer called the office through Google Local Services' : g.type === 'MESSAGE' ? 'A potential customer messaged GrayCo through Google Local Services' : 'A Google Local Services ' + low(g.type || 'lead'))
    + (when ? ' on ' + when + ' (Central)' : '') + '.' + (g.job ? ' Job: ' + g.job + '.' : '') + (c && c.durSec ? ' Call length: ' + durLabel(c.durSec) + '.' : '') + (g.texts.length ? ' They wrote: “' + clip(g.texts[0], 300) + '”.' : '');
  return { type: 'estimate', name: g.name || (g.phone ? 'Google LSA caller ' + tidy(g.phone) : 'Google LSA caller (' + (when.split(', ')[1] || when) + ')'), email: g.email, phone: g.phone, address: '', city: '', state: '', zip: '',
    message: msg, company: '', service: g.job, property: '', bestTime: '', damageDate: '', carrier: '', claimFiled: '', claimNumber: '', project: '', bidDue: '', plansLink: '', buildings: '', plan: '', urgency: '' };
}
/* Google's leads → the inbox: enrich the ones we have, file the ones we do not (a new one texts the admins / goes to the office check
   like an e-mailed LSA call — only when it is recent: an older one is filed quietly, its note says so) */
async function applyApi(gl){
  const out = { enriched: 0, filed: 0, alerted: 0, skipped: 0, ids: [] };
  const todo = [];
  await _D.kvCas(INBOX, v => {
    const list = arr(v); let changed = false; todo.length = 0; out.enriched = 0; out.ids = [];
    gl.forEach(g => { const x = matchInbox(list, g); if (x) { if (enrich(x, g)) { changed = true; out.enriched++; out.ids.push(s(x.id)); } } else todo.push(g); });
    return changed ? list : undefined;
  });
  const recentMs = (+(_D.env('LSA_ALERT_HOURS')) || 6) * 3600e3;
  for (const g of todo) {
    if (!/^(PHONE_CALL|MESSAGE|BOOKING)$/.test(g.type) && g.type) { out.skipped++; continue; }
    const recent = isFinite(g.at) && _D.now() - g.at < recentMs;
    const r = await _D.fileLead(newLeadForm(g), { sid: 'lsaapi|' + g.id, source: 'Google LSA', how: 'from Google Local Services (Google Ads API)', title: 'Google LSA ' + (g.type === 'MESSAGE' ? 'message' : 'call') + ' — ' + (g.name || (g.phone ? tidy(g.phone) : 'caller')) + (g.job ? ' — ' + g.job : ''),
      notes: recent ? [] : ['Brought in from Google Local Services after the call (no text went out for it — it is older than ' + Math.round(recentMs / 3600e3) + ' hours).'],
      leadExtra: Object.assign({ mkSource: 'Google Ads', leadSource: 'Google LSA', lsaCheck: 'pending', lsaFromApi: true }, g.type === 'PHONE_CALL' ? { lsaCall: true } : {}, isFinite(g.at) ? { lsaCallAt: new Date(g.at).toISOString() } : {}) });
    if (!r || !r.id) continue;
    await _D.kvCas(INBOX, v => { const list = arr(v), x = list.find(y => y && s(y.id) === s(r.id)); if (!x) return undefined; return enrich(x, g) ? list : undefined; });
    if (r.action === 'added') { out.filed++; out.ids.push(s(r.id)); if (recent) { try { await _D.alertLead(Object.assign({}, r.rec)); out.alerted++; } catch (e) {} } }
    else if (r.action === 'merged') { out.enriched++; out.ids.push(s(r.id)); }
  }
  return out;
}

/* ── 2. the office line's call log → LSA leads with no number ── */
async function callLog(){ try { const v = await _D.kvGet(LOG_KEY); return v && Array.isArray(v.calls) ? v.calls : []; } catch (e) { return []; } }
function callFor(calls, t){
  let best = null, bd = Infinity;
  arr(calls).forEach(c => { const ph = phone10(c && c.from), at = Date.parse(c && c.at); if (ph.length !== 10 || !isFinite(at)) return; const dd = at - t; if (dd < -WIN_BEFORE || dd > WIN_AFTER) return; if (Math.abs(dd) < bd) { bd = Math.abs(dd); best = c; } });
  return best;
}
function recsOf(row){ return arr(row && row.recs).filter(r => r && RSID.test(s(r.rsid))); }
/* put a call log row on a lead (number, call sid, recordings) — in place; → changed */
function applyCall(x, row, how){
  const ex = Object.assign({}, obj(x.leadExtra)), before = JSON.stringify([x.contact, ex]), ph = phone10(row.from);
  if (ph.length === 10 && leadPhone(x).length !== 10) { x.contact = Object.assign({}, obj(x.contact), { phone: tidy(ph) }); ex.lsaPhoneFrom = how || 'office call log';
    if (/^Google LSA caller/i.test(s(obj(x.contact).name))) x.contact.name = 'Google LSA caller ' + tidy(ph); }
  if (s(row.sid) && !s(ex.callSid) && !s(ex.lsaCallSid)) ex.lsaCallSid = s(row.sid);
  if (s(row.outcome) && !s(ex.lsaCallOutcome)) ex.lsaCallOutcome = clip(row.outcome, 80);
  const have = arr(ex.callRecs), add = recsOf(row).filter(r => !have.some(h => h && h.rsid === r.rsid));
  if (add.length) ex.callRecs = have.concat(add.map(r => ({ rsid: r.rsid, kind: s(r.kind) || 'call', dur: +r.dur || 0, at: s(r.at) }))).slice(-5);
  x.leadExtra = ex;
  return JSON.stringify([x.contact, ex]) !== before;
}
async function matchCalls(days){
  const calls = await callLog(); if (!calls.length) return { matched: 0 };
  const since = _D.now() - (days || 3) * 864e5; let n = 0;
  await _D.kvCas(INBOX, v => {
    const list = arr(v); let changed = false; n = 0;
    list.forEach(x => {
      if (!x || x.deleted || x.mergedInto || !isLsa(x) || !(leadAt(x) >= since)) return;
      const ex = obj(x.leadExtra), sid = s(ex.lsaCallSid || ex.callSid);
      let row = sid ? calls.find(c => c && c.sid === sid) : null;
      if (!row && leadPhone(x).length !== 10) { const t = callAtOf(x); if (isFinite(t)) row = callFor(calls, t); }
      if (row && applyCall(x, row)) { changed = true; n++; }
    });
    return changed ? list : undefined;
  });
  return { matched: n };
}

/* ── 3. Wesley's mailbox (read-only Gmail) ── */
async function mailPoll(state){
  let G = null; try { G = _D.gmail(); } catch (e) { G = null; }
  if (!G || !G.configured()) return { ok: false, why: 'gmail_not_set_up' };
  const box = low(_D.env('LSA_MAILBOX') || 'wjohnson@grayco-cs.com');
  const seen = obj(state.seen), out = { ok: true, read: 0, filed: 0, box };
  const ids = (await G.listIds(box, { q: 'from:localservices-noreply@google.com subject:"potential customer" newer_than:3d', max: 25 })).ids;
  for (const id of ids) {
    if (seen[id]) continue;
    try {
      const m = await G.full(box, id), row = m.row || {}, body = m.body || {};
      const r = await _D.fromEmail({ subject: s(row.subject), text: s(body.text) || s(body.html).replace(/<[^>]+>/g, ' '), html: s(body.html), from: { email: s(row.from), name: s(row.fromName) }, headers: {}, messageId: s(row.mid) || 'gmail:' + id, id, date: s(row.at) });
      seen[id] = new Date(_D.now()).toISOString(); out.read++; if (r && r.lead) out.filed++;
    } catch (e) { out.error = clip(e && e.message, 200); }
  }
  const cut = _D.now() - 10 * 864e5; Object.keys(seen).forEach(k => { if (Date.parse(seen[k]) < cut) delete seen[k]; });
  state.seen = seen;
  return out;
}

/* ── 4. recordings (Twilio's recording callback, missed-call.js ?event=recording) ── */
async function onRecording(p, qs){
  p = p || {}; qs = qs || {};
  const rsid = s(p.RecordingSid), callSid = s(qs.p) || s(p.CallSid), kind = s(qs.k) === 'vm' ? 'voicemail' : 'call';
  if (!RSID.test(rsid) || !/^CA[0-9a-f]{32}$/.test(callSid)) return { ok: false, why: 'bad ids' };
  if (s(p.RecordingStatus) && !/^completed$/i.test(s(p.RecordingStatus))) return { ok: true, skipped: s(p.RecordingStatus) };
  const rec = { rsid, kind, dur: Math.max(0, parseInt(p.RecordingDuration, 10) || 0), at: new Date(_D.now()).toISOString() };
  if (kind === 'call' && rec.dur < 3) return { ok: true, skipped: 'too short' };
  let row = null;
  await _D.kvCas(LOG_KEY, v => {
    v = v && typeof v === 'object' ? v : {}; const l = Array.isArray(v.calls) ? v.calls : [];
    row = l.find(x => x && x.sid === callSid);
    if (!row) { row = { sid: callSid, at: rec.at, from: phone10(p.From), outcome: kind === 'voicemail' ? 'voicemail' : 'recorded' }; l.push(row); }
    if (recsOf(row).some(r => r.rsid === rsid)) return undefined;
    row.recs = recsOf(row).concat([rec]).slice(-4); row.upd = rec.at;
    v.calls = l.slice(-200); return v;
  });
  const leads = await attachRow(row || { sid: callSid, from: phone10(p.From), at: rec.at, recs: [rec] });
  return { ok: true, rsid, kind, leads };
}
/* a call log row → its leads: the lead that names this call, else an LSA lead whose Google time matches this call */
async function attachRow(row){
  const ids = [], at = Date.parse(row.at), ph = phone10(row.from);
  await _D.kvCas(INBOX, v => {
    const list = arr(v); let changed = false; ids.length = 0;
    list.forEach(x => {
      if (!x || x.deleted || x.mergedInto) return; const ex = obj(x.leadExtra);
      let mine = s(ex.callSid) === row.sid || s(ex.lsaCallSid) === row.sid;
      if (!mine && isLsa(x) && isFinite(at)) { const t = callAtOf(x); mine = isFinite(t) && at - t >= -WIN_BEFORE && at - t <= WIN_AFTER && (leadPhone(x).length !== 10 || leadPhone(x) === ph); }
      if (mine && applyCall(x, row, 'office call log')) { changed = true; ids.push(s(x.id)); }
    });
    return changed ? list : undefined;
  });
  return ids;
}
/* the audio of a Twilio recording (mp3) → { ok, buf, mime } — the account's key, server side only */
async function twilioAudio(rsid){
  const sid = _D.env('TWILIO_ACCOUNT_SID'), tok = _D.env('TWILIO_AUTH_TOKEN');
  if (!sid || !tok) return { ok: false, error: 'Twilio is not set up (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).' };
  if (!RSID.test(s(rsid))) return { ok: false, error: 'Bad recording id.' };
  const r = await _D.fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Recordings/' + rsid + '.mp3', { headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64') } });
  if (!r.ok) return { ok: false, error: 'Twilio answered ' + r.status + (r.status === 404 ? ' (the recording was deleted in Twilio)' : '') };
  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, buf, mime: 'audio/mpeg' };
}
/* Google's call recording link: fetched only when it answers with audio (signed in as the Ads account when needed) */
async function googleAudio(url){
  if (!/^https:\/\/[a-z0-9.-]*google(apis|usercontent)?\.com\//i.test(s(url))) return { ok: false, error: 'Not a Google link.' };
  const tryOne = async h => { try { const r = await _D.fetch(url, { headers: h || {} }); const ct = low(r.headers && r.headers.get ? r.headers.get('content-type') : ''); if (!r.ok || !/^audio\/|octet-stream/.test(ct)) return null; return { ok: true, buf: Buffer.from(await r.arrayBuffer()), mime: /^audio\//.test(ct) ? ct.split(';')[0] : 'audio/mpeg' }; } catch (e) { return null; } };
  let a = await tryOne();
  if (!a) { try { const G = _D.gads(); a = await tryOne({ Authorization: 'Bearer ' + await G.access() }); } catch (e) { a = null; } }
  return a || { ok: false, error: 'Google keeps this recording in Local Services — open it there (🔗 Listen).' };
}

/* ── 5. transcripts ── */
async function summarize(text){
  text = s(text); if (!text) return '';
  let AI = null; try { AI = _D.ai(); } catch (e) { AI = null; }
  if (AI && AI.ready()) {
    try { const r = await AI.ask({ maxTokens: 300, content: [{ type: 'text', text: 'A phone call to a construction / restoration company (GrayCo). In one or two short sentences for the office: who called, what work they need, where, and how urgent. No insurance company names. Transcript:\n\n' + clip(text, 8000) }] });
      if (r && r.ok && s(r.text)) return clip(s(r.text).replace(/\s+/g, ' '), 300); } catch (e) {}
  }
  return clip(text.replace(/\s+/g, ' '), 240);
}
async function transcribeAudio(a){
  if (!_D.transcriber()) return { ok: false, error: 'Transcription is not set up (Netlify OPENAI_API_KEY or DEEPGRAM_API_KEY).' };
  if (!a || !a.ok) return a || { ok: false, error: 'No recording.' };
  if (a.buf.length > 24 * 1024 * 1024) return { ok: false, error: 'The recording is too long to transcribe here.' };
  const t = await _D.transcribe(a.buf.toString('base64'), a.mime);
  if (!t || !t.ok) return { ok: false, error: s(t && t.error) || 'Transcription failed.' };
  return { ok: true, text: s(t.text) };
}
/* transcribe a lead's recording (the newest Twilio one, else Google's) and keep it on the lead → { ok, transcript } */
async function transcribeLead(leadId, o){
  o = o || {};
  const list = arr(await _D.kvGet(INBOX)), x = list.find(y => y && s(y.id) === s(leadId)); if (!x) return { ok: false, error: 'Lead not found.' };
  const ex = obj(x.leadExtra), recs = arr(ex.callRecs);
  const pick = o.rsid ? recs.find(r => r && r.rsid === o.rsid) : recs.slice().sort((a, b) => (b.dur || 0) - (a.dur || 0))[0];
  let a, src;
  if (pick) { a = await twilioAudio(pick.rsid); src = { src: 'twilio', rsid: pick.rsid, kind: s(pick.kind) }; }
  else if (s(ex.lsaRecUrl)) { a = await googleAudio(ex.lsaRecUrl); src = { src: 'google' }; }
  else return { ok: false, error: 'This lead has no recording yet.' };
  const t = await transcribeAudio(a); if (!t.ok) return t;
  const tr = Object.assign({ text: clip(t.text, 12000), summary: await summarize(t.text), at: new Date(_D.now()).toISOString(), by: s(o.by) || 'automatic' }, src);
  await _D.kvCas(INBOX, v => { const l = arr(v), y = l.find(z => z && s(z.id) === s(leadId)); if (!y) return undefined; y.leadExtra = Object.assign({}, obj(y.leadExtra), { callTranscript: tr }); return l; });
  return { ok: true, transcript: tr };
}
/* new recordings with no transcript yet (scheduled; a few per run) */
async function transcribePending(max){
  if (!_D.transcriber()) return { skipped: 'no transcription key' };
  const list = arr(await _D.kvGet(INBOX)), since = _D.now() - 3 * 864e5, out = { done: 0, failed: 0 };
  const want = list.filter(x => { if (!x || x.deleted || x.mergedInto || !(leadAt(x) >= since)) return false; const ex = obj(x.leadExtra); if (ex.callTranscript || +ex.callTxTries >= 2) return false; return arr(ex.callRecs).length > 0 || !!s(ex.lsaRecUrl); }).slice(0, max || 3);
  for (const x of want) {
    const r = await transcribeLead(x.id, { by: 'automatic' });
    if (r.ok) out.done++; else { out.failed++; await _D.kvCas(INBOX, v => { const l = arr(v), y = l.find(z => z && s(z.id) === s(x.id)); if (!y) return undefined; y.leadExtra = Object.assign({}, obj(y.leadExtra), { callTxTries: (+obj(y.leadExtra).callTxTries || 0) + 1, callTxError: clip(r.error, 160) }); return l; }); }
  }
  return out;
}

/* ── the whole run (lsa-sync-scheduled.js every 10 minutes; "Check Google now" on a lead) ── */
async function run(o){
  o = o || {};
  const out = { at: new Date(_D.now()).toISOString() };
  let state = {}; try { state = obj(await _D.kvGet(STATE_KEY)); } catch (e) { state = {}; }
  const syncOn = o.force || await _D.isOn('lsa_sync');
  if (syncOn) {
    try { out.mail = await mailPoll(state); } catch (e) { out.mail = { ok: false, error: clip(e && e.message, 200) }; }
    try { const p = await apiPull(+_D.env('LSA_SYNC_DAYS') || 7); out.api = { ok: p.ok, why: p.why || '', found: p.leads.length, errors: arr(p.errors).slice(0, 3) }; if (p.leads.length) Object.assign(out.api, await applyApi(p.leads)); }
    catch (e) { out.api = { ok: false, error: clip(e && e.message, 200) }; }
    try { out.calls = await matchCalls(3); } catch (e) { out.calls = { error: clip(e && e.message, 200) }; }
  } else out.skipped = 'lsa_sync is off in ⚡ Automations';
  if (o.force || await _D.isOn('call_transcribe')) { try { out.transcribe = await transcribePending(3); } catch (e) { out.transcribe = { error: clip(e && e.message, 200) }; } }
  await _D.kvCas(STATE_KEY, v => Object.assign(obj(v), { seen: state.seen || obj(obj(v).seen), last: { at: out.at, api: out.api || null, mail: out.mail ? { ok: out.mail.ok, why: out.mail.why || '', read: out.mail.read || 0, filed: out.mail.filed || 0 } : null, calls: out.calls || null, transcribe: out.transcribe || null } })).catch(() => {});
  return out;
}

/* what the lead card shows (call-recording.js ?lead=) — staff only */
function cardInfo(x){
  const ex = obj(x.leadExtra), c = obj(x.contact), t = callAtOf(x);
  return {
    id: s(x.id), name: s(c.name), phone: phone10(c.phone), phoneFrom: s(ex.lsaPhoneFrom), lsa: isLsa(x),
    callAt: isFinite(t) ? new Date(t).toISOString() : '', callAtLabel: isFinite(t) ? ctLabel(t) : '', durSec: +ex.lsaDurSec || 0, dur: durLabel(ex.lsaDurSec), job: s(ex.lsaJob), leadType: s(ex.lsaLeadType),
    googleId: s(ex.lsaLeadId), status: s(ex.lsaStatus), charged: ex.lsaCharged === true, outcome: s(ex.lsaCallOutcome), texts: arr(ex.lsaTexts),
    recs: arr(ex.callRecs).filter(r => r && RSID.test(s(r.rsid))).map(r => ({ id: r.rsid, kind: s(r.kind) || 'call', dur: +r.dur || 0, durLabel: durLabel(r.dur), at: s(r.at) })),
    google: s(ex.lsaRecUrl) ? { url: s(ex.lsaRecUrl) } : null,
    transcript: ex.callTranscript ? { summary: s(ex.callTranscript.summary), text: s(ex.callTranscript.text), at: s(ex.callTranscript.at), by: s(ex.callTranscript.by), src: s(ex.callTranscript.src) } : null,
    txError: s(ex.callTxError)
  };
}

module.exports = { _D, run, apiStatus, apiPull, shapeLeads, matchInbox, enrich, applyApi, matchCalls, callFor, applyCall, onRecording, attachRow, twilioAudio, googleAudio, transcribeLead, transcribePending, summarize, mailPoll,
  cardInfo, callAtOf, isLsa, mdyMs, gadsMs, gadsStamp, humanCat, durLabel, ctLabel, newLeadForm, STATE_KEY, LOG_KEY, INBOX, RSID, Q_LEADS, Q_CONV };
