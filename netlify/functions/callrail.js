/* ============================================================================
   GrayCo — CALLRAIL → THE CRM.   netlify/functions/callrail.js   (patch AGY)

   Owner (10/23): CallRail the month Google Ads starts, and its calls in the CRM next to the Twilio ones.

   CallRail → Settings → Integrations → Webhooks → "Post-Call webhook":
       https://crm.grayco-cs.com/.netlify/functions/callrail?key=<CALLRAIL_WEBHOOK_KEY>
   (docs/CALLRAIL.md). DORMANT until CALLRAIL_WEBHOOK_KEY is set on Netlify: before that every call answers 503.

   Each call:
   * is logged with the Twilio tracking calls (gc_mkt_calls, callrail: true): source, keyword, campaign, length,
     answered, first call — Marketing → 🔗 numbers in the CRM and the agency portal's 📞 Calls tab.
   * a FIRST-TIME caller who is not already a customer becomes an unassigned GrayCo lead in the 📥 Lead Inbox (source
     "CallRail — <source>", the ad / keyword / landing page in the notes, the CallRail recording link for staff),
     and the admins get the new-lead e-mail. An unanswered call lands on the same lead as the missed-call text-back
     (missed-call.js) for that number and day, so one caller is one lead.
   * a call from an existing customer makes no lead (the missed-call text-back still handles unanswered ones).

   ENV: CALLRAIL_WEBHOOK_KEY (required; any long random string, also pasted into the webhook address),
        CALLRAIL_SIGNING_KEY (optional, recommended: CallRail's webhook signing key — then every call must carry a
        valid "Signature" header: base64 HMAC-SHA1 of the body), CALLRAIL_LEADS=0 (log calls only, no leads).
   ========================================================================== */
'use strict';
const crypto = require('crypto');

function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function nowIso(){ return new Date(typeof exports._now === 'function' ? exports._now() : Date.now()).toISOString(); }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }
function X(){ return require('./_lib/mkt2.js'); }
function WI(){ return require('./website-intake.js')._lib; }
function C(){ return require('./_lib/mkcalc.js'); }
function J(code, o){ return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(o) }; }
function hdr(event, name){ const h = event.headers || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name); return k ? s(h[k]) : ''; }

/* CallRail sends JSON (or, on older accounts, a form) — the same names either way */
function readBody(event){
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : s(event.body);
  let b = null;
  if (/^\s*\{/.test(raw)) { try { b = JSON.parse(raw); } catch (e) { b = null; } }
  if (!b) { b = {}; raw.split('&').filter(Boolean).forEach(kv => { const i = kv.indexOf('='); const k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, ' ')); b[k] = decodeURIComponent((i < 0 ? '' : kv.slice(i + 1)).replace(/\+/g, ' ')); }); }
  if (b.resource && typeof b.resource === 'object') b = Object.assign({}, b, b.resource);
  return { raw, b };
}
function pick(b, keys){ for (const k of keys) { const v = b[k]; if (v != null && s(v) !== '') return typeof v === 'object' ? v : s(v); } return ''; }
function bool(v){ if (v === true || v === false) return v; const t = low(v); return t === 'true' || t === '1' || t === 'yes' ? true : t === 'false' || t === '0' || t === 'no' ? false : null; }

function readCall(b){
  const c = {
    id: s(pick(b, ['resource_id', 'id', 'call_id', 'callercall_id'])).slice(0, 60),
    from: phone10(pick(b, ['customer_phone_number', 'callernum', 'caller_number', 'formatted_customer_phone_number'])),
    to: phone10(pick(b, ['tracking_phone_number', 'trackingnum', 'tracking_number'])),
    business: phone10(pick(b, ['business_phone_number', 'destinationnum'])),
    name: s(pick(b, ['customer_name', 'callername', 'caller_name'])),
    city: s(pick(b, ['customer_city', 'callercity'])), state: s(pick(b, ['customer_state', 'callerstate'])).slice(0, 2), zip: s(pick(b, ['customer_zip', 'callerzip'])),
    source: s(pick(b, ['source_name', 'source', 'tracker_name'])), medium: s(pick(b, ['medium', 'utm_medium'])),
    campaign: s(pick(b, ['campaign', 'utm_campaign'])), keyword: s(pick(b, ['keywords', 'keyword', 'utm_term'])),
    landing: s(pick(b, ['landing_page_url', 'landingpage', 'landing_page'])), referrer: s(pick(b, ['referring_url', 'referrer', 'referrer_domain'])),
    gclid: s(pick(b, ['gclid'])), fbclid: s(pick(b, ['fbclid'])),
    utm: { utm_source: s(pick(b, ['utm_source'])), utm_medium: s(pick(b, ['utm_medium'])), utm_campaign: s(pick(b, ['utm_campaign'])), utm_term: s(pick(b, ['utm_term'])), utm_content: s(pick(b, ['utm_content'])) },
    duration: parseInt(pick(b, ['duration', 'call_duration']), 10), answered: bool(pick(b, ['answered'])), firstCall: bool(pick(b, ['first_call', 'firstcall'])),
    direction: low(pick(b, ['direction'])) || 'inbound', voicemail: bool(pick(b, ['voicemail'])),
    recording: s(pick(b, ['recording_player', 'recording'])), at: s(pick(b, ['start_time', 'created_at', 'datetime'])) || nowIso()
  };
  if (!isFinite(c.duration)) c.duration = null;
  if (c.answered == null && c.duration != null) c.answered = c.duration > 0 && c.voicemail !== true;
  return c;
}
/* the CRM's channel for the call (same names as Marketing → Dashboard) */
function channelOf(c){
  const t = low([c.source, c.medium, c.utm.utm_source, c.utm.utm_medium].join(' '));
  if (/local services|\blsa\b/.test(t)) return 'Google Ads';
  if (c.gclid || /google ?ads|adwords|google paid|\bcpc\b|\bppc\b/.test(t)) return 'Google Ads';
  if (/my business|business profile|\bgmb\b|\bgbp\b|google maps/.test(t)) return 'Google Business Profile';
  if (/google organic|organic search|google search|\borganic\b/.test(t) && /google/.test(t)) return 'Google organic';
  if (c.fbclid || /facebook|instagram|\bmeta\b/.test(t)) return 'Facebook/Instagram Ads';
  return C().normSource(c.source) || '';
}

exports.handler = async function(event){
  event = event || {};
  const q = event.queryStringParameters || {};
  if (!env('CALLRAIL_WEBHOOK_KEY')) return J(503, { ok: false, error: 'CallRail is not set up (CALLRAIL_WEBHOOK_KEY).' });
  if (q.ping === '1' && same(q.key, env('CALLRAIL_WEBHOOK_KEY'))) return J(200, { ok: true, service: 'GrayCo CallRail webhook', signed: !!env('CALLRAIL_SIGNING_KEY'), leads: env('CALLRAIL_LEADS') !== '0' });
  if (event.httpMethod !== 'POST') return J(405, { ok: false });
  if (!same(q.key, env('CALLRAIL_WEBHOOK_KEY'))) return J(403, { ok: false, error: 'Bad key' });
  const { raw, b } = readBody(event);
  if (env('CALLRAIL_SIGNING_KEY')) {
    const want = crypto.createHmac('sha1', env('CALLRAIL_SIGNING_KEY')).update(raw, 'utf8').digest('base64');
    if (!same(hdr(event, 'signature'), want)) return J(403, { ok: false, error: 'Bad signature' });
  }
  const c = readCall(b);
  if (!c.id && !c.from) return J(200, { ok: true, skipped: 'not a call' });
  if (c.direction === 'outbound') return J(200, { ok: true, skipped: 'outbound' });
  const out = { ok: true };
  try {
    const sid = 'cr_' + (c.id || crypto.createHash('sha256').update(c.from + '|' + c.at).digest('hex').slice(0, 16));
    const already = (await X().calls()).some(x => x && x.sid === sid);
    const ch = channelOf(c);
    if (!already) {
      await X().logCall({ at: /^\d{4}-\d{2}-\d{2}T/.test(c.at) ? new Date(c.at).toISOString() : nowIso(), sid, to: X().e164(c.to), from: X().e164(c.from) || 'unknown',
        source: clip('CallRail — ' + (c.source || ch || 'unknown'), 80), code: '', callrail: true, channel: ch, duration: c.duration, answered: c.answered, firstCall: c.firstCall,
        keyword: clip(c.keyword, 80), campaign: clip(c.campaign || c.utm.utm_campaign, 80) });
    }
    out.logged = !already;
    if (already) return J(200, Object.assign(out, { skipped: 'already handled' }));
    if (env('CALLRAIL_LEADS') === '0') return J(200, Object.assign(out, { lead: 'off' }));
    if (c.firstCall === false || phone10(c.from).length !== 10) return J(200, Object.assign(out, { lead: c.firstCall === false ? 'repeat caller' : 'no number' }));
    let cust = null; try { cust = await WI().findCustomer({ phone: c.from, email: '' }); } catch (e) {}
    if (cust && (cust.pid || cust.client)) return J(200, Object.assign(out, { lead: 'existing customer' }));

    const day = new Date(Date.parse(c.at) || Date.now()).toISOString().slice(0, 10);
    /* unanswered: the missed-call text-back's lead for the same number and day (one caller = one lead) */
    const leadSid = crypto.createHash('sha256').update((c.answered === false ? 'missed|' : 'callrail|') + c.from + '|' + day).digest('hex').slice(0, 24);
    const who = c.name && !/^(wireless caller|unknown|anonymous|unavailable)/i.test(c.name) ? c.name.replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) : '';
    const where = [c.city, c.state].filter(Boolean).join(', ');
    const attrib = {}; Object.keys(c.utm).forEach(k => { if (c.utm[k]) attrib[k] = clip(c.utm[k], 120); }); if (c.gclid) attrib.gclid = clip(c.gclid, 120); if (c.fbclid) attrib.fbclid = clip(c.fbclid, 120);
    const notes = ['CallRail: ' + (c.source || 'unknown source') + (c.campaign ? ' · campaign ' + c.campaign : '') + (c.keyword ? ' · keyword "' + c.keyword + '"' : '') + '.',
      (c.answered === false ? 'NOT ANSWERED' : 'Answered') + (c.duration != null ? ', ' + Math.round(c.duration / 60) + ' min' : '') + (c.voicemail ? ', left a voicemail' : '') + '.'];
    if (c.landing) notes.push('Landing page: ' + clip(c.landing, 200));
    if (c.recording) notes.push('Recording (CallRail sign-in): ' + clip(c.recording, 300));
    const f = { type: 'estimate', name: who || 'Caller ' + tidy(c.from), email: '', phone: c.from, address: '', city: c.city, state: c.state, zip: c.zip,
      message: 'Phone call ' + c.at.slice(0, 16).replace('T', ' ') + (where ? ' (caller ID area: ' + where + ')' : '') + ' to the ' + (c.source || 'CallRail') + ' number.',
      company: '', service: '', property: '', bestTime: '', damageDate: '', carrier: '', claimFiled: '', claimNumber: '', project: '', bidDue: '', plansLink: '', buildings: '', plan: '', urgency: '',
      attrib: Object.keys(attrib).length ? attrib : null };
    const r = await WI().fileLead(f, { sid: leadSid, source: clip('CallRail — ' + (c.source || 'phone call'), 80), how: 'a call to a CallRail tracking number', formLabel: 'Phone call (CallRail)', customer: null, notes,
      title: (c.answered === false ? 'Missed call — ' : 'Phone call — ') + (who || tidy(c.from)) + (where ? ' — ' + where : '') + (c.source ? ' (' + c.source + ')' : ''),
      leadExtra: Object.assign({ callrail: true, callrailId: c.id, websiteLead: false, phoneLead: true }, ch ? { mkSource: ch } : {}, c.campaign ? { utmCampaign: c.campaign } : {}) });
    out.lead = r.id; out.action = r.action;
    out.alerts = r.action === 'added' ? await WI().alertLead(r.rec) : { skipped: r.action };
    /* the lead id on the call */
    try { await require('./bid-inbox.js')._lib.kvCas('gc_mkt_calls', v => { v = Array.isArray(v) ? v : []; const x = v.find(y => y && y.sid === sid); if (!x) return undefined; x.leadId = r.id; return v; }); } catch (e) {}
    return J(200, out);
  } catch (e) { return J(500, { ok: false, error: String(e && e.message || e).slice(0, 200) }); }
};
exports._test = { readBody, readCall, channelOf };
