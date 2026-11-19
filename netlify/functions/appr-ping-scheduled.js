// netlify/functions/appr-ping-scheduled.js — patch AWAY: every 5 minutes, each NEW approval reaches the phone of the person
// it waits on (bundled, quiet at night; an away admin gets none) — _lib/apprping.js. Netlify runs it on its schedule
// (netlify.toml); it cannot be called by its address in production. Admins use appr-away.js op ping instead.
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first (staff pushes / texts / e-mails pass) */
exports.handler = async function(){
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  try {
    const out = await require('./_lib/apprping.js').run({});
    /* LSAHOLD (owner 11/19): lead texts held after hours go out at 7:00 AM Central on the next open day — this 5-minute run sends them
       (the 10-minute bid-alerts run does too; each held text is taken once) */
    try { out.leadTexts = await require('./_lib/smsalert.js').flushHeld(); } catch (e) { out.leadTexts = { error: String(e && e.message || e).slice(0, 120) }; }
    try { console.log('[appr-ping]', JSON.stringify({ sent: (out.sent || []).length, held: (out.held || []).length, unchanged: !!out.unchanged })); } catch (e) {}
    return { statusCode: out.ok ? 200 : 502, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Could not check the approvals: ' + String(e && e.message || e).slice(0, 160) }) };
  }
};
