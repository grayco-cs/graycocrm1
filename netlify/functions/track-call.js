// netlify/functions/track-call.js — GrayCo tracking phone numbers (patch MKT2).
//   Each source (a Google ad, a truck, a flyer …) can have its own Twilio number. Twilio sends the call here; the CRM
//   logs it (which number = which source, the time, the caller's number) and forwards it to the office line
//   (TRACK_FORWARD_TO, or Admin → Marketing settings, or 901-585-0944). Signed by Twilio (X-Twilio-Signature) — anything
//   else is refused. Does nothing until TWILIO_AUTH_TOKEN is set on Netlify.
//   Twilio console → the number → "A call comes in" → Webhook, POST: https://crm.grayco-cs.com/.netlify/functions/track-call
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const X = require('./_lib/mkt2.js');
function s(v){ return v == null ? '' : String(v).trim(); }
function env(k){ return s(process.env[k]); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function header(event, name){ const h = event.headers || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name); return k ? s(h[k]) : ''; }
function params(event){ const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : s(event.body); const p = {}; raw.split('&').filter(Boolean).forEach(kv => { const i = kv.indexOf('='); const k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, ' ')); p[k] = decodeURIComponent((i < 0 ? '' : kv.slice(i + 1)).replace(/\+/g, ' ')); }); return p; }
function signed(event, p){
  const got = header(event, 'x-twilio-signature'), token = env('TWILIO_AUTH_TOKEN'); if (!got || !token) return false;
  const urls = [s(event.rawUrl), site() + '/.netlify/functions/track-call'].filter(Boolean);
  return urls.some(u => { const want = crypto.createHmac('sha1', token).update(Buffer.from(u + Object.keys(p).sort().map(k => k + p[k]).join(''), 'utf8')).digest('base64'); return want.length === got.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got)); });
}
function xml(inner, code){ return { statusCode: code || 200, headers: { 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' }, body: '<?xml version="1.0" encoding="UTF-8"?><Response>' + (inner || '') + '</Response>' }; }
exports.handler = async function(event){
  if (!env('TWILIO_AUTH_TOKEN')) return { statusCode: 503, headers: { 'Content-Type': 'text/plain' }, body: 'Tracking numbers are not set up (TWILIO_AUTH_TOKEN).' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  const p = params(event);
  if (!signed(event, p)) return { statusCode: 403, body: 'Bad signature' };
  let doc = {}; try { doc = await require('./_lib/mkt.js').readDoc(); } catch (e) {}
  const tn = X.trackNumber(doc, p.To), fwd = X.forwardTo(doc);
  try { await X.logCall({ at: new Date().toISOString(), sid: s(p.CallSid).slice(0, 40), to: X.e164(p.To), from: X.e164(p.From) || 'unknown', source: tn ? s(tn.source) : 'unknown', code: tn ? s(tn.code) : '' }); } catch (e) {}
  return xml('<Dial answerOnBridge="true" timeout="25"><Number>' + fwd + '</Number></Dial>');
};
