// test_LSAREC_fn.mjs [worktree] — LSAREC (owner 11/19: "can you transcribe these Google LSA leads to get the info from them, phone numbers
// etc so we know what the leads are, can you also have the recording for us, the voicemail or phone recording from Brittany").
// Node only, everything mocked: the store (in memory), Google Ads (rows handed back by a fake query), Twilio (a fake fetch), the
// transcriber and the summary. Nothing is sent, nothing is written anywhere. Made-up people, numbers and ids.
//   1. Google Ads API → the inbox: an e-mailed LSA call with no number gets the number, job type, length, Google's recording link and
//      lead id (matched by the call time); a Google lead that is not in the inbox becomes a Google LSA lead (texted when recent, filed
//      quietly when old); a second run changes nothing; not set up → a clear "not_configured", nothing breaks;
//   2. the office call log: an LSA lead with no number gets the call that came in 2 min before → 4 min after Google's time;
//   3. Twilio's recording callback: bad ids refused; the recording goes on the call log row and on the call's leads (the missed-call
//      lead by its call id, the LSA lead by the call time); a repeat callback adds nothing;
//   4. transcripts: Twilio's audio fetched with the account key (server side), transcribed, summarised and kept on the lead; no key →
//      a plain "not set up"; Google's link that answers with a web page → "open it in Google"; the pending ones are done automatically;
//   5. call-recording.js: staff only; the card info; ▶ Play only for a recording that belongs to that lead; 📝 Transcribe; the
//      by-hand Google check is admins only;
//   6. missed-call.js: with "Record office-line calls" ON every <Dial> records + the caller hears "This call may be recorded";
//      with "Voicemail on missed calls" ON the goodbye becomes a voicemail <Record>; both OFF (the default) → nothing changes;
//   7. the GrayCo lead text carries the call length + job type when Google gave them (≤ 300 characters).
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WT = path.resolve(process.argv[2] || path.join(HERE, '../..'));
Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'AC' + '1'.repeat(32), TWILIO_AUTH_TOKEN: 'tok-test', TWILIO_FROM: '+19015550999', CRM_URL: 'https://crm.test', OWNER_EMAILS: 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com' });
['GOOGLE_ADS_LSA_CUSTOMER_ID', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_TZ_UTC', 'LSA_ALERT_HOURS', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY', 'ANTHROPIC_API_KEY'].forEach(k => { delete process.env[k]; });
const R = require(path.join(WT, 'netlify/functions/_lib/lsarec.js'));

let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));

/* ── the fakes ── */
const kv = {}; let now = Date.parse('2026-11-18T14:40:00Z');   /* 8:40 AM Central */
const fetches = [], filed = [], alerted = [], transcribed = []; let txKey = 'openai', aiOn = true;
let gConf = true, gConn = true, gRows = { leads: [], conv: [] };
const G = { configured: () => gConf, tokens: async () => (gConn ? { google: { refresh: 'r', customers: [{ id: '5550001111' }] } } : {}), access: async () => 'AT', query: async (at, cid, q) => /FROM local_services_lead_conversation/.test(q) ? gRows.conv : gRows.leads };
let fetchImpl = async () => ({ ok: false, status: 404, headers: { get: () => '' }, arrayBuffer: async () => new ArrayBuffer(0) });
let autoFlags = { lsa_sync: true, call_transcribe: false };   /* transcripts are checked in 4 */
Object.assign(R._D, {
  now: () => now,
  kvGet: async k => clone(kv[k]),
  kvCas: async (k, f) => { const nv = f(clone(kv[k])); if (nv !== undefined) kv[k] = clone(nv); return { ok: true }; },
  isOn: async k => !!autoFlags[k],
  gads: () => G,
  transcriber: () => txKey,
  transcribe: async (b64, mime) => { transcribed.push({ len: Buffer.from(b64, 'base64').length, mime }); return { ok: true, text: 'Hi this is Pat Smith, I have a roof leak over the kitchen at 12 Oak Street in Bartlett, please call me back today.' }; },
  ai: () => ({ ready: () => aiOn, ask: async () => ({ ok: true, text: 'Pat Smith — roof leak over the kitchen, 12 Oak St, Bartlett; wants a call back today.' }) }),
  fetch: (u, o) => { fetches.push({ u, o }); return fetchImpl(u, o); },
  fileLead: async (f, extra) => { const id = 'LI-api-' + (filed.length + 1); const rec = { id, title: extra.title, source: extra.source, contact: { name: f.name, phone: f.phone ? '(' + f.phone.slice(0, 3) + ') ' + f.phone.slice(3, 6) + '-' + f.phone.slice(6) : '', email: f.email }, scope: f.message, notes: [].concat(extra.notes || []), leadExtra: Object.assign({ receivedAt: new Date(now).toISOString() }, extra.leadExtra) };
    filed.push({ f, extra, rec }); kv.gc_lead_inbox = (kv.gc_lead_inbox || []).concat([rec]); return { id, rec, action: 'added' }; },
  alertLead: async rec => { alerted.push(rec.id); return { ok: true }; },
  gmail: () => ({ configured: () => false })
});
const inbox = () => kv.gc_lead_inbox || [];
const byId = id => inbox().find(x => x.id === id);
const RS1 = 'RE' + 'a'.repeat(32), RS2 = 'RE' + 'b'.repeat(32), CA1 = 'CA' + 'c'.repeat(32), CA2 = 'CA' + 'd'.repeat(32);
/* an LSA call lead as Google's e-mail makes it: no number, the call time 8:21 AM Central on 11/18 */
const emailed = () => ({ id: 'LI-mail-1', title: 'Website lead — Google LSA caller (8:21 AM)', source: 'Google LSA', contact: { name: 'Google LSA caller (8:21 AM)', phone: '', email: '' },
  scope: 'A potential customer called the office through Google Local Services on 11/18/2026 at 8:21 AM. Google did not include the number.', notes: [],
  leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, lsaLink: 'https://c.gle/DEMO', receivedAt: '2026-11-18T14:21:40Z', lsaCallAt: '2026-11-18T14:21:00.000Z' } });

(async () => {
  console.log('0. time helpers');
  ok(new Date(R.mdyMs('11/18/2026', '8:21 AM')).toISOString() === '2026-11-18T14:21:00.000Z', '"11/18/2026 at 8:21 AM" is 14:21 UTC (CST)');
  ok(new Date(R.gadsMs('2026-11-18 08:21:36')).toISOString() === '2026-11-18T14:21:36.000Z', 'Google Ads "2026-11-18 08:21:36" (Central) → 14:21:36 UTC');
  ok(R.gadsStamp(Date.parse('2026-11-11T14:40:00Z')) === '2026-11-11 08:40:00', 'the GAQL "since" stamp is Central wall time', R.gadsStamp(Date.parse('2026-11-11T14:40:00Z')));
  ok(R.humanCat('xcat:service_area_business_roofer') === 'Roofer' && R.humanCat('roof_repair') === 'Roof repair', 'Google category / service ids read as words');

  console.log('1. Google Ads API → the inbox');
  kv.gc_lead_inbox = [emailed(), { id: 'LI-web', title: 'Website', source: 'Website', contact: { name: 'Al', phone: '(901) 555-0300' }, leadExtra: { receivedAt: '2026-11-18T12:00:00Z' } }];
  gRows = {
    leads: [
      { localServicesLead: { id: '9001', categoryId: 'xcat:service_area_business_roofer', serviceId: 'roof_repair', contactDetails: { phoneNumber: '+1 901-555-0211', consumerName: 'Pat Smith' }, leadType: 'PHONE_CALL', leadStatus: 'NEW', creationDateTime: '2026-11-18 08:21:30', leadCharged: true } },
      { localServicesLead: { id: '9002', categoryId: 'xcat:service_area_business_roofer', serviceId: 'gutter_repair', contactDetails: { phoneNumber: '9015550222' }, leadType: 'PHONE_CALL', leadStatus: 'NEW', creationDateTime: '2026-11-18 08:35:00', leadCharged: false } },
      { localServicesLead: { id: '9003', categoryId: 'xcat:service_area_business_roofer', serviceId: 'roof_inspection', contactDetails: { phoneNumber: '9015550233' }, leadType: 'PHONE_CALL', leadStatus: 'NEW', creationDateTime: '2026-11-16 10:07:00', leadCharged: true } }
    ],
    conv: [
      { localServicesLeadConversation: { id: 'c1', conversationChannel: 'PHONE_CALL', participantType: 'CONSUMER', lead: 'customers/5550001111/localServicesLeads/9001', eventDateTime: '2026-11-18 08:21:30', phoneCallDetails: { callDurationMillis: '134000', callRecordingUrl: 'https://www.google.com/ads/localservices/recording/DEMO9001' } } },
      { localServicesLeadConversation: { id: 'c2', conversationChannel: 'PHONE_CALL', participantType: 'CONSUMER', lead: 'customers/5550001111/localServicesLeads/9002', eventDateTime: '2026-11-18 08:35:00', phoneCallDetails: { callDurationMillis: '45000' } } }
    ]
  };
  let out = await R.run({});
  const m = byId('LI-mail-1'), mx = (m || {}).leadExtra || {};
  ok(out.api && out.api.ok && out.api.found === 3, 'three Google leads read', out.api);
  ok(m && m.contact.phone === '(901) 555-0211' && mx.lsaPhoneFrom === 'google' && m.contact.name === 'Pat Smith', 'the e-mailed call gets the number + name from Google (matched by the call time)', m && m.contact);
  ok(mx.lsaLeadId === '9001' && mx.lsaJob === 'Roofer — roof repair' && mx.lsaDurSec === 134 && mx.lsaCharged === true && /recording\/DEMO9001$/.test(mx.lsaRecUrl), 'job type, 2m 14s, charged, Google\'s recording link, lead id', mx);
  ok((m.notes || []).some(n => /Google LSA details: Roofer — roof repair · 2m 14s call · \(901\) 555-0211 · charged/.test(n)), 'a note says what Google gave', m.notes);
  ok(!/Google LSA caller/.test(m.title), 'the title names the caller now', m.title);
  ok(filed.length === 2 && filed.every(x => x.extra.source === 'Google LSA' && x.extra.leadExtra.lsaCheck === 'pending' && x.extra.leadExtra.lsaCall === true), 'the two calls Google has but the inbox does not → Google LSA leads (pending check)', filed.map(x => x.extra));
  const f2 = filed.find(x => x.extra.sid === 'lsaapi|9002'), f3 = filed.find(x => x.extra.sid === 'lsaapi|9003');
  ok(f2 && /0:45|45s/.test(f2.f.message) && /Roofer — gutter repair/.test(f2.f.message) && f2.f.phone === '9015550222', 'the new lead says the job + the call length', f2 && f2.f);
  ok(alerted.length === 1 && alerted[0] === f2.rec.id, 'the recent one alerts (the texts / office check); the 11/16 one is filed quietly', alerted);
  ok(f3 && /after the call/.test((f3.extra.notes || [])[0] || ''), 'the old one says it was brought in later', f3 && f3.extra.notes);
  ok(byId(f2.rec.id).leadExtra.lsaLeadId === '9002' && byId(f2.rec.id).leadExtra.lsaDurSec === 45, 'the filed lead carries the Google details too', byId(f2.rec.id).leadExtra);
  ok(byId('LI-web').contact.phone === '(901) 555-0300' && !byId('LI-web').leadExtra.lsaLeadId, 'a website lead is never touched');
  const snap = JSON.stringify(kv.gc_lead_inbox); const fl = filed.length;
  out = await R.run({});
  ok(JSON.stringify(kv.gc_lead_inbox) === snap && filed.length === fl, 'a second run changes nothing and files nothing new', out.api);
  ok(kv[R.STATE_KEY] && kv[R.STATE_KEY].last && kv[R.STATE_KEY].last.api.found === 3, 'the last run is kept (gc_lsa_sync)', kv[R.STATE_KEY]);
  gConf = false; out = await R.run({}); ok(out.api && out.api.ok === false && out.api.why === 'not_configured', 'no developer token → "not_configured", nothing breaks', out.api);
  gConf = true; gConn = false; out = await R.run({}); ok(out.api.why === 'not_connected', 'not signed in to Google Ads → "not_connected"', out.api); gConn = true;
  autoFlags.lsa_sync = false; out = await R.run({}); ok(/off/.test(out.skipped || ''), '⚡ lsa_sync OFF → no Google / mailbox / call log work', out); autoFlags.lsa_sync = true;

  console.log('2. the office call log → an LSA lead with no number');
  gRows = { leads: [], conv: [] };
  kv.gc_lead_inbox = [Object.assign(emailed(), { id: 'LI-mail-2', leadExtra: Object.assign(emailed().leadExtra, { lsaCallAt: '2026-11-17T21:48:00.000Z', receivedAt: '2026-11-17T21:48:40Z' }) })];
  now = Date.parse('2026-11-17T22:10:00Z');
  kv.gc_call_log = { calls: [{ sid: CA2, at: '2026-11-17T21:30:00Z', from: '9015550400', outcome: 'answered' }, { sid: CA1, at: '2026-11-17T21:49:10Z', from: '9015550411', outcome: 'missed', recs: [{ rsid: RS1, kind: 'voicemail', dur: 42, at: '2026-11-17T21:50:30Z' }] }] };
  out = await R.run({});
  const c2 = byId('LI-mail-2');
  ok(c2.contact.phone === '(901) 555-0411' && c2.leadExtra.lsaPhoneFrom === 'office call log' && c2.leadExtra.lsaCallSid === CA1, 'the call 70 s after Google\'s time gives the number + the call id', c2);
  ok((c2.leadExtra.callRecs || []).length === 1 && c2.leadExtra.callRecs[0].rsid === RS1 && c2.leadExtra.callRecs[0].kind === 'voicemail', 'and that call\'s voicemail', c2.leadExtra.callRecs);
  ok(R.callFor(kv.gc_call_log.calls, Date.parse('2026-11-17T21:20:00Z')) === null, 'a call 10 min away is not taken');

  console.log('3. Twilio\'s recording callback');
  kv.gc_lead_inbox = [
    { id: 'LI-missed', title: 'Missed call — (901) 555-0500', source: 'Missed call', contact: { name: 'Caller', phone: '(901) 555-0500' }, leadExtra: { missedCall: true, callSid: CA2, receivedAt: '2026-11-17T21:31:00Z' } },
    Object.assign(emailed(), { id: 'LI-mail-3', leadExtra: Object.assign(emailed().leadExtra, { lsaCallAt: '2026-11-17T21:29:30.000Z', receivedAt: '2026-11-17T21:30:10Z' }) })
  ];
  let r = await R.onRecording({ RecordingSid: 'RE123', CallSid: CA2, RecordingDuration: '30', RecordingStatus: 'completed' }, { p: CA2, k: 'vm' });
  ok(r.ok === false, 'a bad recording id is refused', r);
  r = await R.onRecording({ RecordingSid: RS2, CallSid: 'CA' + 'e'.repeat(32), RecordingDuration: '61', RecordingStatus: 'completed', From: '+19015550500' }, { p: CA2, k: 'call' });
  const row = kv.gc_call_log.calls.find(x => x.sid === CA2);
  ok(r.ok && row && row.recs.length === 1 && row.recs[0].rsid === RS2 && row.recs[0].kind === 'call' && row.recs[0].dur === 61, 'the recording is on the call log row (the parent call id from the signed URL)', row);
  ok((byId('LI-missed').leadExtra.callRecs || [])[0] && byId('LI-missed').leadExtra.callRecs[0].rsid === RS2, 'the missed-call lead of that call has it', byId('LI-missed').leadExtra);
  const l3 = byId('LI-mail-3');
  ok((l3.leadExtra.callRecs || []).some(x => x.rsid === RS2) && l3.contact.phone === '(901) 555-0400', 'the LSA lead whose Google time matches that call gets it + the number', l3);
  await R.onRecording({ RecordingSid: RS2, CallSid: CA2, RecordingDuration: '61', RecordingStatus: 'completed' }, { p: CA2, k: 'call' });
  ok(kv.gc_call_log.calls.find(x => x.sid === CA2).recs.length === 1 && byId('LI-missed').leadExtra.callRecs.length === 1, 'a repeat callback adds nothing');
  r = await R.onRecording({ RecordingSid: 'RE' + '9'.repeat(32), CallSid: CA2, RecordingDuration: '1', RecordingStatus: 'completed' }, { p: CA2, k: 'call' });
  ok(r.skipped === 'too short', 'a 1-second call recording is skipped', r);

  console.log('4. transcripts');
  fetchImpl = async u => ({ ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5]).buffer });
  fetches.length = 0;
  r = await R.transcribeLead('LI-missed', { by: 'Brittany' });
  const twf = fetches[0] || {};
  ok(r.ok && /api\.twilio\.com\/2010-04-01\/Accounts\/AC1{32}\/Recordings\/RE[b]{32}\.mp3$/.test(twf.u) && twf.o.headers.Authorization === 'Basic ' + Buffer.from('AC' + '1'.repeat(32) + ':tok-test').toString('base64'), 'Twilio\'s mp3 is fetched server side with the account key', twf.u);
  const tr = byId('LI-missed').leadExtra.callTranscript || {};
  ok(/roof leak over the kitchen/.test(tr.text) && /Pat Smith — roof leak/.test(tr.summary) && tr.by === 'Brittany' && tr.src === 'twilio' && tr.rsid === RS2, 'the transcript + the short summary are on the lead', tr);
  aiOn = false; delete byId('LI-missed').leadExtra.callTranscript; kv.gc_lead_inbox = kv.gc_lead_inbox.map(x => x.id === 'LI-missed' ? Object.assign({}, x, { leadExtra: Object.assign({}, x.leadExtra, { callTranscript: undefined }) }) : x);
  r = await R.transcribeLead('LI-missed', {}); ok(r.ok && /^Hi this is Pat Smith/.test(r.transcript.summary), 'no Claude key → the first words are the summary', r.transcript); aiOn = true;
  txKey = ''; r = await R.transcribeLead('LI-missed', {}); ok(!r.ok && /OPENAI_API_KEY or DEEPGRAM_API_KEY/.test(r.error), 'no transcription key → says which key is missing', r); txKey = 'openai';
  kv.gc_lead_inbox.push({ id: 'LI-g', source: 'Google LSA', contact: {}, leadExtra: { leadSource: 'Google LSA', lsaRecUrl: 'https://www.google.com/ads/localservices/recording/X', receivedAt: new Date(now).toISOString() } });
  fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, arrayBuffer: async () => new ArrayBuffer(4) });
  r = await R.transcribeLead('LI-g', {}); ok(!r.ok && /open it there/.test(r.error), 'Google\'s link that answers with a page → "open it in Local Services"', r);
  fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => new Uint8Array([9, 9]).buffer });
  r = await R.transcribeLead('LI-g', {}); ok(r.ok && r.transcript.src === 'google' && transcribed[transcribed.length - 1].mime === 'audio/wav', 'Google\'s link that answers with audio is transcribed', r);
  kv.gc_lead_inbox = kv.gc_lead_inbox.map(x => x.id === 'LI-mail-3' ? x : x);
  transcribed.length = 0;
  out = await R.transcribePending(5);
  ok(out.done === 1 && byId('LI-mail-3').leadExtra.callTranscript && transcribed.length === 1, 'the automatic run transcribes the one still waiting (and only it)', out);

  console.log('5. call-recording.js (staff only)');
  const CR = require(path.join(WT, 'netlify/functions/call-recording.js'));
  let who = { ok: false, code: 401, error: 'Sign in to the GrayCo CRM first.' }; CR._test.setAuth(async () => who);
  const call = async (q, m, b) => { const x = await CR.handler({ httpMethod: m || 'GET', queryStringParameters: q, headers: {}, body: b ? JSON.stringify(b) : '' }); return { code: x.statusCode, j: JSON.parse(x.body) }; };
  let h = await call({ lead: 'LI-missed' }); ok(h.code === 401 && !h.j.info, 'not signed in → 401, nothing shown', h);
  who = { ok: false, code: 403, error: 'Not on the GrayCo staff list.' }; h = await call({ lead: 'LI-missed' }); ok(h.code === 403, 'a customer / sub sign-in (not on the staff list) → 403', h);
  who = { ok: true, email: 'brittany@grayco-cs.com', name: 'Brittany', admin: false, office: true };
  h = await call({ lead: 'LI-mail-3' });
  ok(h.code === 200 && h.j.info.phone === '9015550400' && h.j.info.recs.length === 1 && h.j.info.recs[0].id === RS2 && h.j.info.transcript && h.j.status.transcribe === true, 'the card info: number, recording, transcript, what is set up', h.j);
  ok(h.j.status.googleApi.connected === true && h.j.status.recording === false && h.j.status.voicemail === false, 'the switches show (recording / voicemail OFF by default)', h.j.status);
  h = await call({ lead: 'LI-mail-3', play: RS1 }); ok(h.code === 404, '▶ Play of a recording that is not on this lead → 404', h);
  fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new Uint8Array([7, 7, 7]).buffer });
  h = await call({ lead: 'LI-mail-3', play: RS2 }); ok(h.code === 200 && h.j.mime === 'audio/mpeg' && Buffer.from(h.j.b64, 'base64').length === 3, '▶ Play → the audio, through the signed-in function', { code: h.code, mime: h.j.mime });
  h = await call({ lead: 'nope' }); ok(h.code === 404, 'an unknown lead → 404');
  h = await call({ transcribe: '1' }, 'POST', { lead: 'LI-missed' }); ok(h.code === 200 && h.j.ok && h.j.transcript.by === 'Brittany', '📝 Transcribe by hand (who pressed it is kept)', h.j);
  h = await call({ sync: '1' }, 'POST', {}); ok(h.code === 403, 'the by-hand Google check is admins only', h);
  who = Object.assign({}, who, { admin: true }); h = await call({ sync: '1' }, 'POST', {}); ok(h.code === 200 && h.j.ok && h.j.api, 'an admin can run it', h.j);

  console.log('6. missed-call.js: recording + voicemail switches');
  const AUTOP = path.join(WT, 'netlify/functions/_lib/automations.js'); const AUTO = require(AUTOP); const flags = { call_recording: false, call_voicemail: false }; AUTO.isOn = async k => k in flags ? !!flags[k] : true;
  const MC = require(path.join(WT, 'netlify/functions/missed-call.js'))._test;
  const CS = 'CA' + 'f'.repeat(32);
  const ev = e => ({ httpMethod: 'POST', queryStringParameters: { event: e }, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'CallSid=' + CS + '&From=%2B19015550600' });
  const tw = inner => ({ statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: '<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + '</Response>' });
  const DIAL = '<Dial timeout="15" answerOnBridge="true" action="https://crm.test/x" method="POST"><Number>+19015550001</Number></Dial>';
  const GATHER = '<Gather input="dtmf speech" numDigits="1"><Say voice="Polly.Joanna">Hi</Say></Gather>';
  const BYE = '<Say voice="Polly.Joanna">Thanks for calling GrayCo Construction Services. Sorry we missed you. We just sent you a text message, and someone from our team will get back to you shortly. Goodbye.</Say><Hangup/>';
  let x = await MC.recPost(ev('menu'), tw(DIAL)); ok(x.body === tw(DIAL).body, 'both switches OFF (default): the call is not recorded', x.body);
  x = await MC.recPost(ev('dialdone'), tw(BYE)); ok(x.body === tw(BYE).body, 'both OFF: the goodbye stays', x.body);
  flags.call_recording = true;
  x = await MC.recPost(ev('menu'), tw(DIAL));
  ok(/<Dial record="record-from-answer-dual" recordingStatusCallback="https:\/\/crm\.test\/\.netlify\/functions\/missed-call\?event=recording&amp;p=CAf{32}&amp;k=call" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" timeout="15"/.test(x.body), 'recording ON: the <Dial> records both sides and calls back with the parent call id', x.body);
  ok(!/may be recorded/.test(x.body), 'the notice is said once, at the start of the call (not on later hops)');
  x = await MC.recPost(ev('voice'), tw(GATHER)); ok(/<Response><Say voice="Polly\.Joanna">This call may be recorded\.<\/Say><Gather/.test(x.body), 'the caller first hears "This call may be recorded."', x.body);
  x = await MC.recPost(ev('voice'), tw('<Say voice="Polly.Joanna">We don\'t take sales calls</Say><Hangup/>')); ok(!/may be recorded/.test(x.body), 'a sales hang-up gets no notice (nothing is recorded)', x.body);
  x = await MC.recPost(ev('sms'), tw(DIAL)); ok(x.body === tw(DIAL).body, 'texts / other events are never touched');
  flags.call_voicemail = true;
  x = await MC.recPost(ev('dialdone'), tw(BYE));
  ok(/leave a short message after the tone/.test(x.body) && /<Record maxLength="120" timeout="6" playBeep="true" trim="trim-silence" action="https:\/\/crm\.test\/\.netlify\/functions\/missed-call\?event=vmdone" method="POST" recordingStatusCallback="https:\/\/crm\.test\/\.netlify\/functions\/missed-call\?event=recording&amp;p=CAf{32}&amp;k=vm"/.test(x.body) && !/Goodbye\.<\/Say><Hangup\/><\/Response>$/.test(x.body.replace('Thank you. Goodbye.</Say><Hangup/></Response>', '')), 'voicemail ON: nobody answered → the caller can leave a message (2 min), saved by the recording callback', x.body);
  const sv = process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_AUTH_TOKEN; x = await MC.recPost(ev('menu'), tw(DIAL)); ok(x.body === tw(DIAL).body, 'Twilio not set up → nothing changes'); process.env.TWILIO_AUTH_TOKEN = sv;

  console.log('7. the GrayCo lead text has the call length + job type');
  const SA = require(path.join(WT, 'netlify/functions/_lib/smsalert.js'));
  const USERS = [{ name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true }, { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '9015550002', active: true }];
  const sent = [], skv = {};
  Object.assign(SA._D, { now: () => Date.parse('2026-10-29T15:00:00Z'), kvGet: async k => k === 'gc_lead_inbox' ? [] : skv[k], kvCas: async (k, f) => { if (k === 'gc_lead_inbox') return { ok: true }; const nv = f(skv[k] == null ? null : clone(skv[k])); if (nv !== undefined) skv[k] = nv; return { ok: true }; },
    send: async (to, body) => { sent.push({ to, body }); return { ok: true }; }, paused: async () => false, optouts: async () => ({}), consentNo: async () => false, hours: async () => null,
    people: async () => ({ users: USERS, staff: [] }), vetTodo: async () => true, textLog: async () => true, lsaVerified: async () => true, jobs: async () => ({ projects: [], gc_deleted_projects: [] }), postReply: async m => ({ id: m.id }) });
  await SA.leads([{ id: 'LSAX', key: 'LSAX', title: 'Roof', source: 'Google LSA', contact: { name: 'Pat Smith', phone: '(901) 555-0211' } }], { LSAX: { id: 'LSAX', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaDurSec: 134, lsaJob: 'Roofer — roof repair' } } }, () => false);
  const wb = (sent.find(x => x.to === '9015550002') || {}).body || '';
  ok(/from \(901\) 555-0211 Pat Smith \(2m 14s call, Roofer — roof repair\)/.test(wb) && wb.length <= 300, 'the Google LSA lead text to Wesley has the number, length and job type (≤ 300)', wb);
  sent.length = 0;
  await SA.leads([{ id: 'LSAY', key: 'LSAY', title: 'Roof', source: 'Google LSA', contact: { name: 'Jo Doe', phone: '(901) 555-0212' } }], { LSAY: { id: 'LSAY', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending' } } }, () => false);
  const wb2 = (sent.find(x => x.to === '9015550002') || {}).body || '';
  ok(/from \(901\) 555-0212 Jo Doe[. ]/.test(wb2) && !/call,/.test(wb2), 'no Google details → the text is as before', wb2);

  console.log(fail ? 'FAILED ' + pass + '/' + (pass + fail) : 'LSAREC ' + pass + '/' + pass);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
