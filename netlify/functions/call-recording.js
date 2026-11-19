// netlify/functions/call-recording.js — LSAREC: a lead's call details, recordings and transcript for the CRM's lead card.
// Staff only (signed in AND on the GrayCo staff list — never a customer, a sub or the public). Nothing is sent from here.
//   GET  ?lead=<inbox id>              → { ok, info: number, Google time, length, job type, Google lead id, recordings, transcript },
//                                         status: what is set up (Google Ads API, Twilio, transcription, the switches)
//   GET  ?lead=<inbox id>&play=<RE…>   → { ok, mime, b64 } — that recording's audio from Twilio (only a recording that belongs
//                                         to this lead; Twilio's key never leaves the server)
//   POST ?transcribe=1 { lead, rsid? } → transcribe the lead's recording (Twilio, or Google's when it can be fetched) → { ok, transcript }
//   POST ?sync=1                       → admins: run the Google LSA / call log / transcript check now (_lib/lsarec.js run)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const R = require('./_lib/lsarec.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function env(k){ return s(process.env[k]); }
function T(){ return require('./bid-inbox.js')._test; }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
const MAX_AUDIO = 4 * 1024 * 1024;   /* a Netlify answer is at most 6 MB; base64 adds a third */
let _auth = null;   /* tests swap the sign-in check */
async function auth(event){ return _auth ? _auth(event) : T().staffAuth(event); }
async function leadOf(id){ id = s(id); if (!id || id.length > 120) return null; const list = await R._D.kvGet(R.INBOX); return (Array.isArray(list) ? list : []).find(x => x && s(x.id) === id && !x.deleted) || null; }
async function status(){
  let api = { configured: false, connected: false, customers: [] }; try { api = await R.apiStatus(); } catch (e) {}
  const on = async k => { try { return await R._D.isOn(k); } catch (e) { return false; } };
  let tr = ''; try { tr = R._D.transcriber(); } catch (e) {}
  let last = null; try { const st = await R._D.kvGet(R.STATE_KEY); last = st && st.last ? { at: s(st.last.at), api: st.last.api ? { ok: !!st.last.api.ok, why: s(st.last.api.why), found: +st.last.api.found || 0 } : null } : null; } catch (e) {}
  return { googleApi: { configured: !!api.configured, connected: !!api.connected, customer: api.customers.length > 0 }, twilio: !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN')),
    transcribe: !!tr, recording: await on('call_recording'), voicemail: await on('call_voicemail'), sync: await on('lsa_sync'), last };
}
exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase();
  if (m === 'OPTIONS') return J(200, {}, C);
  const who = await auth(event); if (!who || !who.ok) return J((who && who.code) || 401, { ok: false, error: (who && who.error) || 'Sign in first.' }, C);
  try {
    if (m === 'GET' && qs.lead) {
      const x = await leadOf(qs.lead); if (!x) return J(404, { ok: false, error: 'Lead not found.' }, C);
      const info = R.cardInfo(x);
      if (qs.play) {
        const rsid = s(qs.play);
        if (!info.recs.some(r => r.id === rsid)) return J(404, { ok: false, error: 'That recording is not on this lead.' }, C);
        const a = await R.twilioAudio(rsid); if (!a.ok) return J(502, { ok: false, error: a.error }, C);
        if (a.buf.length > MAX_AUDIO) return J(413, { ok: false, error: 'This recording is too long to play here — open it in Twilio (Monitor → Call recordings).' }, C);
        return J(200, { ok: true, mime: a.mime, b64: a.buf.toString('base64') }, C);
      }
      return J(200, { ok: true, info, status: await status() }, C);
    }
    if (m === 'POST' && qs.transcribe) {
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      const x = await leadOf(b.lead); if (!x) return J(404, { ok: false, error: 'Lead not found.' }, C);
      const r = await R.transcribeLead(x.id, { rsid: s(b.rsid) || undefined, by: s(who.name) || s(who.email) });
      return J(200, r, C);
    }
    if (m === 'POST' && qs.sync) {
      if (!who.admin) return J(403, { ok: false, error: 'Only an admin can run the Google LSA check by hand.' }, C);
      return J(200, Object.assign({ ok: true }, await R.run({ force: true })), C);
    }
    return J(400, { ok: false, error: 'Bad request' }, C);
  } catch (e) { return J(500, { ok: false, error: 'The call recording hit a problem: ' + s(e && e.message).slice(0, 120) }, C); }
};
exports._test = { setAuth: f => { _auth = f; }, status, leadOf };
