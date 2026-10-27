/* GrayCo — patch SENTLOG: Resend's e-mail events (delivered · bounced · complained · delayed) → the status on the CRM's
   "📤 Sent by the CRM" list, and a bounced request on the follow-up list ("📬 E-mail bounced" on the Office To-Do).
   Set up once (docs/SENT-MAIL.md): Resend → Webhooks → Add endpoint https://crm.grayco-cs.com/.netlify/functions/mail-events,
   events email.delivered, email.bounced, email.complained, email.delivery_delayed → copy its signing secret into Netlify
   as RESEND_EVENTS_SECRET → Trigger deploy. Every call must be signed by Resend (Svix); nothing here sends anything. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
function s(v){ return v == null ? '' : String(v).trim(); }
function hdrs(event){ const h = (event && event.headers) || {}, o = {}; Object.keys(h).forEach(k => { o[k.toLowerCase()] = h[k]; }); return o; }
function same(a, b){ const x = Buffer.from(s(a)), y = Buffer.from(s(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function svixOk(raw, h, secret){
  secret = s(secret); if (!secret) return false;
  const id = s(h['svix-id'] || h['webhook-id']), ts = s(h['svix-timestamp'] || h['webhook-timestamp']), sigs = s(h['svix-signature'] || h['webhook-signature']);
  if (!id || !ts || !sigs) return false;
  const t = parseInt(ts, 10); if (!isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  let key; try { key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); } catch (e) { return false; }
  if (!key.length) return false;
  const want = crypto.createHmac('sha256', key).update(id + '.' + ts + '.' + raw, 'utf8').digest('base64');
  return sigs.split(/\s+/).some(p => { const i = p.indexOf(','); return i > 0 && p.slice(0, i) === 'v1' && same(p.slice(i + 1), want); });
}
function J(code, body){ return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }; }
exports._svixOk = svixOk;
exports.handler = async function(event){
  event = event || {};
  const qs = event.queryStringParameters || {};
  if (s(event.httpMethod).toUpperCase() === 'GET' && qs.ping === '1') return J(200, { ok: true, service: 'GrayCo e-mail delivery events', signed: !!s(process.env.RESEND_EVENTS_SECRET) });
  if (s(event.httpMethod).toUpperCase() !== 'POST') return J(405, { ok: false, error: 'POST only.' });
  const raw = event.isBase64Encoded ? Buffer.from(s(event.body), 'base64').toString('utf8') : s(event.body);
  const secret = s(process.env.RESEND_EVENTS_SECRET);
  if (!secret) return J(503, { ok: false, error: 'Not set up yet (RESEND_EVENTS_SECRET on Netlify).' });
  if (!svixOk(raw, hdrs(event), secret)) return J(401, { ok: false, error: 'Not signed by Resend.' });
  let evt; try { evt = JSON.parse(raw); } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }); }
  try { return J(200, await require('./_lib/sentlog.js').onDelivery(evt)); }
  catch (e) { return J(503, { ok: false, error: 'Busy — retry (' + s(e && e.message) + ').' }); }
};
