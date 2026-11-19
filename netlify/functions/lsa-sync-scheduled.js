// netlify/functions/lsa-sync-scheduled.js — LSAREC, every 10 minutes (netlify.toml):
//   · Google LSA calls / messages → leads with the caller's number, job type, length and Google's recording link (Google Ads
//     API — only once Marketing → 📈 Ads hub is connected and Netlify has GOOGLE_ADS_DEVELOPER_TOKEN + the OAuth client);
//   · Google's call e-mails read from Wesley's mailbox (read-only Gmail — only when GOOGLE_SA_EMAIL / GOOGLE_SA_KEY are set);
//   · LSA leads with no number ← the office line's call log (Twilio), and that call's recordings;
//   · new call recordings / voicemails → a transcript + short summary (OPENAI_API_KEY or DEEPGRAM_API_KEY).
// ⚡ Automations: "Google LSA calls → leads" (lsa_sync, ON) and "Transcribe call recordings" (call_transcribe, ON). LSA_SYNC_OFF=1 stops it all.
// A scheduled function cannot be called by its URL in production; the CRM's "Check Google now" goes through call-recording.js.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
exports.handler = async function(){
  if (String(process.env.LSA_SYNC_OFF || '').trim() === '1') return { statusCode: 200, body: JSON.stringify({ off: true }) };
  let out = {};
  try { out = await require('./_lib/lsarec.js').run({}); } catch (e) { out = { error: String(e && e.message || e).slice(0, 200) }; }
  return { statusCode: 200, body: JSON.stringify(out) };
};
