/* ============================================================================
   GrayCo — 📞 CALL THE CUSTOMER FROM THE GRAYCO NUMBER (patch FIELDCALL).   netlify/functions/_lib/fieldcall.js

   Owner (10/30): Call / Text on the Field job page → "From your own phone" or "From the GrayCo number".
   A call from the GrayCo number is a bridge (Twilio REST Calls API — the same pieces patch EMERGCALL uses):
     1. texts.js?fieldcall=1 (signed-in staff) POST { pid } → Twilio calls the STAFF MEMBER's own phone (their cell on
        the people list — never a number the page sends), From = TWILIO_FROM;
     2. they answer → missed-call.js?event=fcall (signed by Twilio) answers with
        <Dial callerId="TWILIO_FROM"><Number>the customer</Number></Dial> — the customer sees the GrayCo number.
   The customer's number comes from the job (clientPhone / customerPhone / phone) — never from the page.
   Who: an admin, the office, or a person on the job (PM / APM / superintendent / estimator / tech).
   Refused while data-entry mode is on (_lib/pause), when Twilio is not set up, or with no cell on file.
   Texts from the GrayCo number are NOT here: they start after A2P 10DLC registration (the page says so).
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; }
function tidy(v){ const d = phone10(v); return d ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : ''; }
function xmlEsc(v){ return s(v).replace(/[<>&"']/g, function(c){ return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]; }); }

function ready(env){ return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && phone10(env('TWILIO_FROM'))); }
function userOf(users, who){ return arr(users).find(function(u){ return u && low(u.email) === low(who.email) && u.active !== false; }) || null; }
function userPhone(u){ return phone10(u && (u.cell || u.mobile || u.phone)); }
function custPhone(p){ return phone10(p && (p.clientPhone || p.customerPhone || p.phone)); }
function onJob(p, name){ const n = low(name); return !!n && [p.pm, p.apm, p.assistantPm, p.superintendent, p.superName, p.estimator, p.soldBy, p.mitTech, p.tech].some(function(x){ return low(x) === n; }); }
function canCall(who, user, p){ return !!(who && (who.admin || who.office)) || onJob(p, user && user.name); }

/* GET: can this person call from the GrayCo number right now? */
function status(o){
  const u = userOf(o.users, o.who), ph = userPhone(u);
  return { ok: true, ready: ready(o.env), myPhone: tidy(ph), paused: !!o.paused, from: tidy(o.env('TWILIO_FROM')),
    why: o.paused ? 'Data-entry mode is on — no calls go out.' : !ready(o.env) ? 'Calls from the GrayCo number need Twilio set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM on Netlify).' : !ph ? 'Add your cell in My profile — the GrayCo number calls you first.' : '' };
}

/* POST: place the bridge call. o = { who, pid, data: { projects, users }, env, paused, fetch, hookUrl(ev, q) } */
async function start(o){
  if (o.paused) return { code: 409, body: { ok: false, error: 'Data-entry mode is on — no calls go out.' } };
  if (!ready(o.env)) return { code: 503, body: { ok: false, setup: true, error: 'Calls from the GrayCo number are not set up yet (Twilio).' } };
  const pid = s(o.pid); if (!pid) return { code: 400, body: { ok: false, error: 'Open a job first.' } };
  const p = arr(o.data && o.data.projects).find(function(x){ return x && s(x.id) === pid && x.deleted !== true; });
  if (!p) return { code: 404, body: { ok: false, error: 'The job is not in the cloud yet — try again in a minute.' } };
  const u = userOf(o.data && o.data.users, o.who);
  if (!canCall(o.who, u, p)) return { code: 403, body: { ok: false, error: 'Only the people on this job (or an admin / the office) can call its customer from the GrayCo number.' } };
  const me = userPhone(u); if (!me) return { code: 409, body: { ok: false, error: 'Add your cell in My profile — the GrayCo number calls you first.' } };
  const to = custPhone(p); if (!to) return { code: 409, body: { ok: false, error: 'This job has no phone number for the customer.' } };
  if (to === me) return { code: 409, body: { ok: false, error: 'The customer\'s number is your own number.' } };
  const sid = o.env('TWILIO_ACCOUNT_SID'), tok = o.env('TWILIO_AUTH_TOKEN'), from = '+1' + phone10(o.env('TWILIO_FROM'));
  let r, j = {};
  try {
    r = await o.fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Calls.json', { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+1' + me, From: from, Url: o.hookUrl('fcall', { to: to, pid: pid }), Method: 'POST', Timeout: '25' }).toString() });
    try { j = await r.json(); } catch (e) {}
  } catch (e) { return { code: 502, body: { ok: false, error: 'Twilio could not be reached — try again.' } }; }
  if (!r || !r.ok) return { code: 502, body: { ok: false, error: 'Twilio did not place the call' + (r && r.status ? ' (' + r.status + ')' : '') + '.' } };
  return { code: 200, body: { ok: true, sid: s(j.sid), calling: tidy(me), customer: tidy(to), from: tidy(from), job: s(p.name) } };
}

/* the staff member answered → connect the customer, caller ID = the GrayCo number */
function twiml(to, fromEnv){
  const t = phone10(to), f = phone10(fromEnv);
  if (!t || !f) return '<Say voice="Polly.Joanna">Sorry, this call could not be connected.</Say><Hangup/>';
  return '<Say voice="Polly.Joanna">GrayCo. Connecting you to the customer now.</Say><Dial callerId="+1' + xmlEsc(f) + '" timeout="30" answerOnBridge="true"><Number>+1' + xmlEsc(t) + '</Number></Dial>';
}

module.exports = { ready, status, start, twiml, canCall, custPhone, userPhone, phone10, tidy };
