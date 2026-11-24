/* ============================================================================
   GrayCo — a 6-digit code by GrayCo text (patch LATECODE).   netlify/functions/_lib/codetext.js

   Owner 11/24: "i liked earlier the code was sent from grayco text for confirmation also thats how ch plumbing signed up".
   A sub / supplier who signs up (bid site register → SIGNUPVERIFY) or asks for a sub portal sign-in code (portal-access.js) and has a
   cell number gets the code by text too, from the GrayCo subs number (smsroute 'subs' → TWILIO_FROM_SUBS, else TWILIO_FROM), the same
   Twilio account the staff alerts use. The e-mail goes exactly as before; the text is extra.

   Rules (every one checked here, whoever calls):
     · only when the person just asked for it (the caller decides: a sign-up, a "send me a code", a resend) — never unprompted;
     · only to the number they typed or the number on THEIR record (the caller passes it) — a 10-digit US number, never one of ours;
     · never to a phone that texted STOP (missed-call.js's opt-out list, the same one smsalert respects) or that declined texts
       (_lib/smsconsent.js); if that list cannot be read, no text (the e-mail still goes);
     · at most one text a minute and five an hour per number (this instance; the callers keep their own per-address limits);
     · tagged custquiet 'reply' — what they asked for this moment (a sign-in code goes at night too, as the e-mailed one does);
     · Twilio not set up (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM) or PORTAL_MAIL_OFF → nothing is texted.
   The code never goes in a log; the result says only sent / skipped (why).
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function env(k){ return s(process.env[k]); }
function ready(){ return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM')) && !(env('PORTAL_MAIL_OFF') === '1' || env('PORTAL_MAIL_OFF') === 'true'); }
function cell(v){ const p = phone10(v); return /^[2-9]\d{2}[2-9]\d{6}$/.test(p) ? p : ''; }
function ours(p){ return ['TWILIO_FROM', 'TWILIO_FROM_SUBS', 'TWILIO_FROM_ALERTS', 'TWILIO_FROM_CUSTOMERS', 'TWILIO_FROM_LEADS', 'TWILIO_FROM_BILLING', 'TWILIO_FROM_INSURANCE'].some(function(k){ return phone10(env(k)) === p; }); }
const MIN_GAP = 60e3, HOUR_MAX = 5;
const SENT = new Map();   /* phone → [times] (this instance) */

/* ── dependencies (tests swap these) ── */
function MC(){ return require('../missed-call.js')._test; }
const _D = {
  now: function(){ return Date.now(); },
  optedOut: async function(p){
    const st = MC().loadState((await require('../bid-inbox.js')._lib.kvRead(MC().KS)).v);   /* the STOP list; unreadable → throws → no text */
    if (st.optout[p]) return true;
    try { return (await require('./smsconsent.js').live(p)) === 'no'; } catch (e) { return false; }
  },
  from: async function(){
    try { const S0 = require('./sms.js'), L = require('../bid-inbox.js')._lib; return s(require('./smsroute.js').fromFor('subs', S0.settings(await L.kvGet(S0.SETTINGS_KEY)), env)); } catch (e) { return ''; }
  },
  send: function(p, body, from){ return require('./custquiet.js').run('reply', function(){ return MC().sendSms(p, body, from); }); }
};

function bodyOf(code, o){
  o = o || {};
  const min = Number(o.min) || 10;
  if (o.lang === 'es') return 'GrayCo: su código es ' + code + (o.what === 'signup' ? ' para confirmar su registro' : '') + '. Sirve ' + min + ' minutos. No lo comparta. Responda STOP para no recibir textos.';
  return 'GrayCo: your code is ' + code + (o.what === 'signup' ? ' to confirm your sign-up' : '') + '. It works for ' + min + ' minutes. Do not share it. Reply STOP to stop texts.';
}
/* → { ok: true } | { ok: false, skipped: 'not-set-up' | 'no-cell' | 'ours' | 'too-soon' | 'opted-out' | 'send-failed' } */
async function sendCode(phone, code, o){
  if (!ready()) return { ok: false, skipped: 'not-set-up' };
  if (!/^\d{6}$/.test(s(code))) return { ok: false, skipped: 'bad-code' };
  const p = cell(phone); if (!p) return { ok: false, skipped: 'no-cell' };
  if (ours(p)) return { ok: false, skipped: 'ours' };
  const t = _D.now(), list = (SENT.get(p) || []).filter(function(x){ return t - x < 3600e3; });
  if ((list.length && t - list[list.length - 1] < MIN_GAP) || list.length >= HOUR_MAX) return { ok: false, skipped: 'too-soon' };
  let out = true; try { out = await _D.optedOut(p); } catch (e) { out = true; }
  if (out) return { ok: false, skipped: 'opted-out' };
  list.push(t); SENT.set(p, list); if (SENT.size > 5000) SENT.clear();
  let r = null; try { r = await _D.send(p, bodyOf(s(code), o), await _D.from()); } catch (e) { r = null; }
  return r && r.ok ? { ok: true } : { ok: false, skipped: 'send-failed' };
}
module.exports = { sendCode, ready, cell, bodyOf, _D, _reset: function(){ SENT.clear(); } };
