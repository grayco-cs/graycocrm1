// test_SALESBLOCK.mjs — patch SALESBLOCK (offline): sales pitches never page / text / call anyone from any inbound path
// (website form, leads@ e-mail, texts, call transcripts, any new lead), they wait in 🧹 Sales & spam; a blocked number /
// e-mail / domain is dropped silently everywhere (a call is rejected busy); the night rule (7 PM – 7 AM Central) needs the
// customer's own emergency words or "press 1". Real emergencies page exactly as before.
// Mocks: Supabase REST (in-memory gc_kv; gc_lead_inbox_kv missing → gc_kv; /auth/v1/user; gc_staff), Twilio, Resend.
// Usage: node tools/tests/test_SALESBLOCK.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../../netlify/functions'));
const TOKEN = 'fake-twilio-token-sb';
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com', WEBSITE_ZAPIER_KEY: 'zap-test', LEAD_KEY_ROOF_IGNITE: 'ri-test' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'EMERG_OFF', 'ONCALL_OFF', 'LEAD_INTAKE_ALERTS', 'SALESBLOCK_SECRET', 'TWILIO_FROM_ALERTS', 'PORTAL_AUTO_EMAIL', 'WEBSITE_AUTO_REPLY', 'ROOFING_IGNITE_KEY'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }

const KV = new Map(), SMS = [], CALLS = [], MAIL = [];
const USERS_BY_TOKEN = { 'tok-owner': 'owner@grayco-cs.com', 'tok-office': 'office1@grayco-cs.com', 'tok-pm': 'pm@grayco-cs.com' };
const STAFF = { 'owner@grayco-cs.com': 'admin', 'office1@grayco-cs.com': 'admin', 'pm@grayco-cs.com': 'Project Manager' };
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => (KV.get(k) || {}).value;
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const t = String((init.headers || {}).Authorization || '').replace(/^Bearer\s+/, ''); const e = USERS_BY_TOKEN[t]; return e ? J(200, { email: e }) : J(401, {}); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').replace(/^eq\./, ''); return J(200, e ? (STAFF[e] ? [{ email: e, role: STAFF[e], active: true }] : []) : Object.keys(STAFF).map(x => ({ email: x, role: STAFF[x], active: true }))); }
    if (u.pathname === '/rest/v1/gc_kv') {
      const kq = u.searchParams.get('key') || '';
      if (m === 'GET') {
        if (kq.startsWith('in.(')) { const keys = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return J(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k).value, updated_at: KV.get(k).updated_at }))); }
        const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r.value, updated_at: r.updated_at }] : []);
      }
      const body = JSON.parse(init.body || '{}'), key = kq.replace(/^eq\./, '');
      if (m === 'PATCH') { const r = KV.get(key), at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || (at && r.updated_at !== at)) return J(200, []); KV.set(key, { value: body.value, updated_at: body.updated_at }); return J(200, [{ key }]); }
      if (m === 'POST') { KV.set(body.key, { value: body.value, updated_at: body.updated_at || new Date().toISOString() }); return J(201, null); }
    }
    return J(200, []);
  }
  if (u.host === 'api.twilio.com') { const p = Object.fromEntries(new URLSearchParams(init.body)); if (/Calls/.test(u.pathname)) CALLS.push(p); else SMS.push(p); return J(201, { sid: 'SM' + (SMS.length + CALLS.length) }); }
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
const SG = require(path.join(SRC, '_lib/salesguard.js'));
const E = require(path.join(SRC, '_lib/emergency.js'));
/* patch AUTOPANEL: this test checks the text auto-answers (⚡ "Text auto-answers", OFF by default) — switched ON here */
{ const AUTO = require(path.join(SRC, '_lib/automations.js')); const on = AUTO.before(); AUTO._t.setStore({ get: async k => k === AUTO.KEY ? on : null, put: async () => true }); }
const X = require(path.join(SRC, '_lib/x10.js'));
const RT = require(path.join(SRC, '_lib/smsroute.js'));
const MN = require(path.join(SRC, '_lib/smsmenu.js'));
const SA = require(path.join(SRC, '_lib/smsalert.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
const WEB = require(path.join(SRC, 'website-intake.js'));
const BI = require(path.join(SRC, 'bid-inbox.js'));
const SB = require(path.join(SRC, 'salesblock.js'));

/* the clock: 2:25 AM Central on Nov 1 (the alert), 1:05 PM Central on Oct 31 (the real emergency) */
const NIGHT = Date.parse('2026-11-01T08:25:00Z'), DAY = Date.parse('2026-10-31T18:05:00Z');
let T = DAY; const clock = () => T;
SG._now = clock; MC._now = clock; BI._now = clock; SA._D.now = clock;

const TED_PHONE = '3473364175';
const TED = "Hi team,\nI'm Ted from GrowthVector. I build AI agents for businesses like GrayCo Construction Services. On your website, a visitor who asks for a quote at night waits until the next business day. An AI agent can answer in under a minute, ask the right questions and book the job on your calendar. You decide what it says.\nWe also help businesses get more customers from Google search.\nWant me to send details on how it works?\nTed Cadet\nGrowthVector\nProject location: New York";
const PITCHES = [
  'Hi, we can get your website on the first page of Google with our SEO services. Interested?',
  'Business funding: GrayCo Construction Services is pre-approved for up to $250,000 in working capital. Reply STOP to opt out',
  'Never miss a call again! Our AI receptionist answers 24/7 and books appointments for contractors. Book a demo today',
  'Hello, I am a web designer. Your website looks outdated, we do web design for roofing companies at affordable prices.',
  'We generate exclusive roofing leads for your business - pay per lead. Want to try 10 free leads?',
  'Hey there! Do you have time for a quick 15-minute call this week to discuss growing GrayCo Construction Services?',
  'We can lower your credit card processing fees by 40%. Can I send you a free savings analysis?',
  "Our virtual assistants can handle your scheduling and customer calls for $8/hour. Let's book a call.",
  'URGENT: Your business is not showing on Google Maps. We can fix your Google ranking in 30 days.',
  'Hi this is Sam with BrightLeads. We help roofers get more leads. Can I send you info?'
];
const REAL_EMERG = ['I need help I have water everywhere !?', 'roof is leaking into my bedroom', 'tree fell on my house', 'pipe burst', 'fire damage'];
const NOT_SALES = REAL_EMERG.concat(['need an estimate for a roof', 'this is State Farm adjuster about claim', 'Can we set up a call to discuss replacing my roof? My insurance approved it',
  "Hi, I'm Lisa from Keller Williams, I have a client who needs a roof inspection before closing", 'I found your website, are you available for a quick call about my roof leak?', 'what time do you close', 'URGENT please call me back asap',
  "Hi I'm John from Turner Construction, we would like to invite your company to bid on a roofing project, can we schedule a call?", 'storm took shingles off my house, insurance claim filed', 'my house has mold in the basement']);

const NICK = '9015551001', WES = '9015551002';
function world(){
  KV.clear(); SMS.length = 0; CALLS.length = 0; MAIL.length = 0;
  setKv('users', [
    { id: 'u1', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', phone: '(901) 555-1001', active: true },
    { id: 'u2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', cell: '901-555-1002', active: true }]);
  setKv('projects', []); setKv('customers', []); setKv('leads', []); setKv('gc_job_messages', []); setKv('gc_office_tasks', []);
  setKv('gc_x10_oncall', { rotation: [{ email: 'nthomas@grayco-cs.com', name: 'Nick Thomas', phone: NICK }], startDate: '2026-01-05', on: true });
  try { WEB._test.reset(); } catch (e) {}
  SG._reset();
}
const inbox = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const openInbox = () => inbox().filter(x => x.status !== 'dismissed');
const byPhone = ph => openInbox().find(x => (x.contact || {}).phone && x.contact.phone.replace(/\D/g, '').endsWith(ph));
const spam = () => SG.cleanStore(getKv(SG.SKEY));
const held = () => spam().list.filter(x => x.status === 'held');
const listOf = k => { let v = getKv(k); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : (v && (v.list || v.v)) || []; };
const jm = () => listOf('gc_job_messages');
const tasks = () => listOf('gc_office_tasks');
const approvals = () => listOf('gc_approval_queue');
const firstMail = () => approvals().filter(x => x && x.kind === 'lead_first_contact');
const smsTo = d => SMS.filter(x => String(x.To).replace(/\D/g, '').endsWith(d));
const staffSms = () => SMS.filter(x => [NICK, WES].some(d => String(x.To).endsWith(d)));
const emergMail = () => MAIL.filter(x => /EMERGENCY/i.test(x.subject || ''));
let ipN = 0;
const web = b => WEB.handler({ httpMethod: 'POST', headers: { 'x-api-key': 'zap-test', 'x-nf-client-connection-ip': '10.1.0.' + (++ipN) }, queryStringParameters: {}, body: JSON.stringify(b) });
const sms = (from, body, sid) => MC._test.inboundSms({ From: '+1' + from, To: '+19015550000', Body: body, MessageSid: sid || ('SM' + crypto.randomBytes(6).toString('hex')) });
const SITE = 'https://crm.grayco-cs.com/.netlify/functions/missed-call';
function twSign(url, p){ return crypto.createHmac('sha1', TOKEN).update(Buffer.from(url + Object.keys(p).sort().map(k => k + p[k]).join(''), 'utf8')).digest('base64'); }
function twPost(url, p){ const u = new URL(url); return MC.handler({ httpMethod: 'POST', headers: { 'X-Twilio-Signature': twSign(url, p) }, queryStringParameters: Object.fromEntries(u.searchParams), rawUrl: url, body: new URLSearchParams(p).toString() }); }
const call = (from, extra) => twPost(SITE + '?event=voice', Object.assign({ CallSid: 'CA' + crypto.randomBytes(5).toString('hex'), From: '+1' + from, To: '+19015550000', CallStatus: 'ringing' }, extra || {}));
const api = (tok, method, qs, body) => SB.handler({ httpMethod: method, headers: { authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' }, queryStringParameters: qs, body: body ? JSON.stringify(body) : '' }).then(r => Object.assign(JSON.parse(r.body), { __code: r.statusCode }));
const tedForm = o => Object.assign({ type: 'storm', name: 'Ted Cadet', email: 'ted@growthvector.io', phone: '(347) 336-4175', company: 'GrowthVector', service: 'Insurance restoration / water mitigation', city: 'New York', message: TED, page: 'https://grayco-cs.com/contact' }, o || {});
/* the lead exactly as it reached the alerts on 11/01 (prod, read-only): what the website form filed */
const tedLead = { id: 'LI-40569a6f62ec9c86', type: 'insurance', leadKind: 'Insurance', title: 'Storm / insurance damage — Ted Cadet — New York', websiteForm: 'Storm / insurance damage', scope: TED, contact: { name: 'Ted Cadet', email: 'ted@growthvector.io', phone: '(347) 336-4175' },
  notes: ['Storm / insurance damage — from the website form, 2026-11-01 08:25 UTC.', 'Service: Insurance restoration / water mitigation', 'Company: GrowthVector'], leadExtra: { said: { message: TED, company: 'GrowthVector', service: 'Insurance restoration / water mitigation' } },
  detail: ['Storm / insurance damage', '(347) 336-4175', 'ted@growthvector.io', TED.slice(0, 140)].join(' · ') };

(async () => {
  /* ── 1. why Ted was flagged, and the detector ── */
  console.log('— 1. the detector');
  T = NIGHT;
  ok(E.baseEmergency(tedLead) && X.isEmergency(tedLead, { noGate: true }), 'before: Ted\'s lead WAS an emergency (the service drop-down "water mitigation" matched x10 EMERG)');
  ok(!X.isEmergency({ title: TED }, { noGate: true }) && !E.baseEmergency({ title: TED }), 'before: his message alone was not — it was the drop-down');
  ok(SG.isSales(TED, { email: 'ted@growthvector.io', company: 'GrowthVector' }) && /AI agent/.test(SG.why(TED)), 'Ted\'s message is sales', SG.why(TED));
  ok(!E.isEmergency(tedLead) && !X.isEmergency(tedLead), 'after: Ted\'s lead is NOT an emergency (any gate)');
  T = DAY; ok(!E.isEmergency(tedLead) && !X.isEmergency(tedLead), '… not in the daytime either'); T = NIGHT;
  PITCHES.forEach((p, i) => ok(SG.isSales(p), 'pitch ' + (i + 1) + ' is sales: ' + p.slice(0, 50), SG.why(p)));
  NOT_SALES.forEach(t => ok(!SG.isSales(t), 'not sales: ' + t.slice(0, 60), SG.why(t)));
  ok(!SG.isSales('this is State Farm adjuster about claim', { email: 'jane.adjuster@statefarm.com' }), 'a State Farm adjuster is never sales');
  ok(!RT.topics('URGENT: our AI receptionist answers 24/7 — book a demo').emergency && MN.intent('Our AI chatbot handles leak and flood emergency calls for contractors, book a demo') !== '5', 'a pitch with "urgent" / "24/7" / emergency words is never an emergency (smsroute EMERGENCY, smsmenu 5)');

  /* ── 2. the night rule ── */
  console.log('— 2. the night rule (7 PM – 7 AM Central)');
  const dropOnly = { type: 'insurance', websiteForm: 'Storm / insurance damage', service: 'Insurance restoration / water mitigation', scope: 'Please call me about my roof', leadExtra: { said: { message: 'Please call me about my roof', service: 'Insurance restoration / water mitigation' } } };
  T = DAY; ok(E.isEmergency(dropOnly), 'day: the "water mitigation" drop-down alone is still an emergency (as before)');
  T = NIGHT; ok(!E.isEmergency(dropOnly) && !X.isEmergency(dropOnly), 'night: the drop-down alone is not');
  T = DAY; ok(RT.topics('URGENT please call me back asap').emergency, 'day: "urgent" text is urgent (as before)');
  T = NIGHT; ok(!RT.topics('URGENT please call me back asap').emergency, 'night: "urgent" alone never pages');
  T = DAY; ok(E.isEmergency({ title: 'you said you are 24/7, call me' }), 'day: "24/7" (as before)');
  T = NIGHT; ok(!E.isEmergency({ title: 'you said you are 24/7, call me' }), 'night: "24/7" alone never pages');
  ok(!E.isEmergency({ title: 'Text message — Bob', urgency: 'Emergency', leadExtra: { textMessage: true, textBody: 'can someone call me tonight' } }), 'night: an "Emergency" urgency without the words is not');
  ok(E.isEmergency({ title: '🚨 EMERGENCY call — Bob', emergency: true, urgency: 'Emergency', scope: 'Missed call 2026-11-01 08:20 UTC.', leadExtra: { missedCall: true, pressed1: true } }), 'night: the after-hours "press 1" counts');
  REAL_EMERG.forEach(t => { T = NIGHT; const n = E.isEmergency({ title: t }); T = DAY; const d = E.isEmergency({ title: t }); ok(n && d, 'real emergency day + night: ' + t); });
  T = NIGHT; ok(!E.isEmergency({ title: 'need an estimate for a roof' }), '"need an estimate for a roof" is not an emergency');

  /* ── 3. website form (the path Ted used, at 2:25 AM) ── */
  console.log('— 3. website form');
  world(); T = NIGHT;
  let r = await web(tedForm());
  let b = JSON.parse(r.body);
  ok(r.statusCode === 200 && b.ok && b.received, 'Ted\'s form: the visitor sees "received"', b);
  ok(!openInbox().length, 'no lead', inbox().map(x => x.title));
  ok(SMS.length === 0 && CALLS.length === 0, 'no text, no call', SMS);
  ok(MAIL.length === 0, 'no alert e-mail, no auto-reply', MAIL.map(x => x.subject));
  ok(!approvals().length && !firstMail().length, 'no "First e-mail to a new lead" approval card', approvals().map(x => [x.kind, x.jobName]));
  ok(!tasks().some(t => /^EMERG_/.test(t.id)), 'no 🚨 ASAP to-do');
  ok(!(getKv('gc_x10_pages') || []).length && !getKv('gc_emerg_calls'), 'no on-call page, no emergency call');
  let h = held(); ok(h.length === 1 && h[0].via === 'website' && h[0].phone === TED_PHONE && h[0].email === 'ted@growthvector.io' && /AI agent/.test(h[0].why) && h[0].refile && h[0].refile.f, 'held in 🧹 Sales & spam with the reason', h);
  ok(spam().log.some(x => x.decision === 'sales' && x.via === 'website' && /AI agent/.test(x.why)) && spam().counts.sales === 1, 'the decision is logged + counted', spam().log);
  /* a real customer at night through the same form → emergency, exactly as before */
  r = await web({ type: 'storm', name: 'Ann Real', email: 'ann@example.com', phone: '(901) 555-0142', service: 'Insurance restoration / water mitigation', message: 'I need help I have water everywhere !?' });
  let L1 = byPhone('9015550142');
  ok(!!L1, 'a real website emergency → a lead');
  ok(firstMail().some(x => /Ann Real/.test(x.jobName) && x.to === 'ann@example.com'), 'control: a real website lead still gets its first-e-mail approval', approvals().map(x => [x.kind, x.jobName]));
  ok(emergMail().length >= 1, 'real emergency → the 🚨 EMERGENCY e-mail', MAIL.map(x => x.subject));
  ok(tasks().some(t => /^EMERG_/.test(t.id)), 'real emergency → the 🚨 ASAP to-do');
  let st = staffSms(); ok(st.length >= 2 && st.every(x => /^🚨 GrayCo EMERGENCY: Ann Real/.test(x.Body)), 'real emergency → 🚨 text to Nick + Wesley (night)', st.map(x => x.Body));
  const link = (/Block: (https:\/\/\S+)/.exec(st[0] && st[0].Body || '') || [])[1] || '';
  const lm = /\?sgb=(\d{10})\.([A-Za-z0-9]+)$/.exec(link);
  ok(!!lm && lm[1] === '9015550142' && SG.sigOk(lm[1], lm[2]) && !SG.sigOk('9015550143', lm[2]) && st[0].Body.length <= 300, 'the alert text has a signed one-tap block link (≤ 300 chars)', st[0] && st[0].Body);
  /* a normal daytime estimate → a normal lead (no emergency) */
  world(); T = DAY;
  r = await web({ type: 'estimate', name: 'Bo Est', email: 'bo@example.com', phone: '(901) 555-0150', message: 'need an estimate for a roof' });
  ok(!!byPhone('9015550150') && !emergMail().length && firstMail().some(x => x.to === 'bo@example.com'), 'an estimate → a normal lead + its first-e-mail approval, no emergency', { m: MAIL.map(x => x.subject), a: approvals().map(x => x.kind) });

  /* ── 4. leads@ e-mail ── */
  console.log('— 4. leads@ e-mail');
  world(); T = NIGHT;
  r = await WEB.fromEmail({ from: { email: 'ted@growthvector.io', name: 'Ted Cadet' }, subject: 'Quick question', text: 'Name: Ted Cadet\nPhone: 347-336-4175\nEmail: ted@growthvector.io\nMessage: ' + TED.replace(/\n/g, ' '), messageId: '<a1@x>' });
  ok(r.ignored && /salesblock/.test(r.ignored) && !openInbox().length && !MAIL.length && held().some(x => x.via === 'email'), 'a pitch to leads@ → no lead, no alert; held', r);
  r = await WEB.fromEmail({ from: { email: 'kim@example.com', name: 'Kim' }, subject: 'Roof leak', text: 'Name: Kim Lee\nPhone: 901-555-0161\nMessage: roof is leaking into my bedroom', messageId: '<a2@x>' });
  ok(r.lead && byPhone('9015550161') && emergMail().length >= 1, 'a real leads@ emergency still alerts', { r, m: MAIL.map(x => x.subject) });

  /* LSACALL2 (owner 11/10): Google's "New call from a potential customer" e-mail — no caller number, only GrayCo's Customer ID */
  world(); T = DAY; const OE0 = process.env.OWNER_EMAILS; process.env.OWNER_EMAILS = 'nthomas@grayco-cs.com,wjohnson@grayco-cs.com';
  r = await WEB.fromEmail({ from: { email: 'localservices-noreply@google.com', name: 'Local Services by Google' }, subject: 'New call from a potential customer',
    text: 'Local Services By Google\n\nYour Customer ID: 555-434-6278\n\nNew event\n\nNew call from a potential customer\n\nA potential customer called you on 11/10/2026 at 2:31 PM.\n\nView Details', messageId: '<lsacall@x>' });
  const lc = inbox().find(x => /Google LSA caller \(2:31 PM\)/.test(JSON.stringify(x)));
  ok(r.lead && !!lc && !byPhone('5554346278'), 'LSA call e-mail → a lead "Google LSA caller (2:31 PM)", never GrayCo\'s Customer ID as a phone', { r, ids: inbox().map(x => x.title) });
  st = staffSms(); ok(st.length >= 2 && st.every(x => /Google LSA call to the office/.test(x.Body) && /open the LSA app/.test(x.Body) && !/555-?434/.test(x.Body)), 'LSA call → a text to Nick + Wesley right away', { st: st.map(x => x.Body), all: SMS.map(x => [x.To, x.Body]), al: JSON.stringify(r.alerts).slice(0, 1500) });
  process.env.OWNER_EMAILS = OE0;
  /* LSAPHONE (owner 11/10): the office phone logged the call (Twilio) → the caller's number is on the lead and in the text */
  world(); T = DAY; process.env.OWNER_EMAILS = 'nthomas@grayco-cs.com,wjohnson@grayco-cs.com';
  setKv('gc_call_log', { calls: [{ sid: 'CAx', at: '2026-11-10T20:29:00Z', from: '9015550777' }, { sid: 'CAy', at: '2026-11-10T21:31:30Z', from: '9015550778', outcome: 'missed' }, { sid: 'CAz', at: '2026-11-10T21:31:40Z', from: '9015550779' }] });
  r = await WEB.fromEmail({ from: { email: 'wjohnson@grayco-cs.com', name: 'Wesley' }, subject: 'Fwd: New call from a potential customer',
    text: '---------- Forwarded message ---------\nFrom: Local Services by Google <localservices-noreply@google.com>\nDate: Tue, Nov 10, 2026 at 3:33 PM\n\nYour Customer ID: 555-434-6278\nNew call from a potential customer\nA potential customer called you on 11/10/2026 at 3:31 PM.\nView Details', messageId: '<lsacall2@x>' });
  ok(r.lead && !!byPhone('9015550778'), 'LSA call e-mail + the office call log → the lead has the caller\'s number (the nearest call: 3:31:30 PM Central)', { r, ids: inbox().map(x => [x.title, x.phone]) });
  st = staffSms(); ok(st.length >= 2 && st.every(x => /\(901\) 555-0778/.test(x.Body) && /Missed it\? Call them back/.test(x.Body)), 'the text has the number to tap', st.map(x => x.Body));
  process.env.OWNER_EMAILS = OE0;

  /* lead-intake.js (paid lead sources) — the other path that queues a first e-mail */
  const LI = require(path.join(SRC, 'lead-intake.js'));
  const intake = b => LI.handler({ httpMethod: 'POST', headers: { 'x-api-key': 'ri-test', 'content-type': 'application/json' }, queryStringParameters: {}, body: JSON.stringify(b) });
  world(); T = NIGHT;
  r = await intake({ name: 'Ted Cadet', phone: '347-336-4175', email: 'ted@growthvector.io', notes: TED, address: '1 Main St' });
  b = JSON.parse(r.body);
  ok(b.held && !b.stored && !approvals().length && !SMS.length && !MAIL.length, 'lead source: a pitch → no first e-mail / approval / text / alert; held', { b, a: approvals().map(x => x.kind), SMS: SMS.length, M: MAIL.length });
  r = await intake({ name: 'Real Person', phone: '901-555-0190', email: 'real@example.com', notes: 'roof replacement quote please', address: '2 Oak St' });
  b = JSON.parse(r.body);
  ok(!b.held && (firstMail().length >= 1 || MAIL.length >= 1 || SMS.length >= 1), 'control: a real lead-source lead is still contacted', { b, a: approvals().map(x => x.kind) });

  /* ── 5. texts ── */
  console.log('— 5. texts (the "Text us" number)');
  world(); T = NIGHT;
  r = await sms(TED_PHONE, TED);
  ok(r.salesblock && !byPhone(TED_PHONE) && SMS.length === 0 && MAIL.length === 0, 'Ted texting the pitch → no reply, no lead, no alert', { r, SMS, m: MAIL.map(x => x.subject) });
  ok(!jm().some(x => x.smsFrom === TED_PHONE) && !tasks().length, 'not on Job Messages, no to-do');
  ok(held().some(x => x.via === 'sms' && x.phone === TED_PHONE), 'held in 🧹 Sales & spam');
  for (let i = 0; i < PITCHES.length; i++) {
    SMS.length = 0; MAIL.length = 0;
    const ph = '90155520' + String(i).padStart(2, '0');
    r = await sms(ph, PITCHES[i]);
    ok(r.salesblock && SMS.length === 0 && MAIL.length === 0 && !byPhone(ph), 'pitch text ' + (i + 1) + ' → nothing goes out', { r: r.salesblock, SMS });
  }
  /* the real one from 10/31 1:05 PM, and the same at 2:25 AM */
  for (const t of [DAY, NIGHT]) {
    world(); T = t;
    r = await sms('9014941754', 'I need help I have water everywhere !?');
    const lead = byPhone('9014941754');
    ok(!r.salesblock && r.newLead && lead && r.route.urgent, (t === DAY ? 'day' : 'night') + ': "water everywhere" → an urgent lead', r.route);
    ok(smsTo('9014941754').length === 1 && emergMail().length >= 1 && staffSms().some(x => /🚨 GrayCo EMERGENCY/.test(x.Body)), (t === DAY ? 'day' : 'night') + ': the customer is answered, 🚨 e-mail + 🚨 staff texts', { c: smsTo('9014941754').map(x => x.Body), m: MAIL.map(x => x.subject), st: staffSms().map(x => x.Body) });
  }
  for (const [i, t] of REAL_EMERG.slice(1).entries()) {
    world(); T = NIGHT; const ph = '90155530' + i;
    r = await sms(ph, t);
    ok(!r.salesblock && r.newLead && r.route.urgent && emergMail().length >= 1, 'night text "' + t + '" → urgent lead + 🚨 e-mail', { u: r.route, m: MAIL.map(x => x.subject) });
  }
  world(); T = DAY;
  r = await sms('9015553100', 'need an estimate for a roof');
  ok(!r.salesblock && r.newLead && !r.route.urgent && !emergMail().length, '"need an estimate for a roof" → a normal lead', r.route);
  world(); T = DAY;
  r = await sms('9015553101', 'this is State Farm adjuster about claim 55-12');
  ok(!r.salesblock && r.newLead && smsTo('9015553101').length >= 1, 'a State Farm adjuster → not filtered: a lead, answered', r);
  world(); T = NIGHT;
  r = await sms('9015553102', 'URGENT please call me back asap');
  ok(!r.salesblock && !r.route.urgent && !emergMail().length && !staffSms().some(x => /EMERGENCY/.test(x.Body)) && !tasks().some(t => t.prio === 'urgent'), 'night: "urgent" / "call me back" alone → no emergency e-mail, 🚨 text or urgent to-do', { m: MAIL.map(x => x.subject), t: tasks().map(x => x.prio) });

  /* ── 6. calls ── */
  console.log('— 6. calls');
  world(); T = DAY;
  r = await twPost(SITE + '?event=what&c=1', { CallSid: 'CAwhat1', From: '+1' + TED_PHONE, To: '+19015550000', SpeechResult: 'Hi this is Ted from GrowthVector, we build AI agents for businesses like yours, can I book a quick 15 minute call with the owner' });
  ok(/We don&#39;t take sales calls/.test(r.body) && /<Hangup\/>/.test(r.body) && !/<Dial/.test(r.body), 'a caller pitching after "press 1" → "we don\'t take sales calls", nobody rings', r.body);
  ok(held().some(x => x.via === 'call' && x.phone === TED_PHONE), '… held in 🧹 Sales & spam');
  r = await twPost(SITE + '?event=what&c=1', { CallSid: 'CAwhat2', From: '+19015553200', To: '+19015550000', SpeechResult: 'tree fell on my house' });
  ok(/<Dial/.test(r.body), 'a real caller still rings the call order', r.body.slice(0, 200));

  /* ── 7. 🚫 block (CRM) — every path drops a blocked sender ── */
  console.log('— 7. block list');
  world(); T = NIGHT;
  let a = await api('tok-pm', 'POST', { act: 'block' }, { phone: TED_PHONE });
  ok(a.__code === 403, 'a PM cannot block (admins and the office only)', a);
  a = await api('nobody', 'GET', { list: '1' });
  ok(a.__code === 401, 'signed out → 401');
  a = await api('tok-owner', 'POST', { act: 'block' }, { phone: '(347) 336-4175', sig: 'wrongsig12' });
  ok(a.__code === 400, 'a forged alert-text block link is refused', a);
  a = await api('tok-owner', 'POST', { act: 'block' }, { phone: '(347) 336-4175', sig: SG.sig(TED_PHONE) });
  ok(a.ok && a.block.phones.indexOf(TED_PHONE) >= 0, 'the signed link (owner signed in) blocks the number', a);
  a = await api('tok-office', 'POST', { act: 'block' }, { email: 'ted@growthvector.io' });
  ok(a.ok && a.block.emails.indexOf('ted@growthvector.io') >= 0, 'the office blocks an e-mail', a);
  a = await api('tok-owner', 'POST', { act: 'block' }, { domain: 'grayco-cs.com' });
  ok(a.__code === 400, 'GrayCo itself cannot be blocked');
  SMS.length = 0; MAIL.length = 0;
  r = await sms(TED_PHONE, 'hello, can you look at my roof?');
  ok(r.blocked && SMS.length === 0 && MAIL.length === 0 && !byPhone(TED_PHONE) && !jm().length, 'blocked number texts → dropped (no reply, lead, alert, Job Message)', r);
  r = await call(TED_PHONE);
  ok(/<Response><Reject reason="busy"\/><\/Response>/.test(r.body), 'blocked number calls → <Reject reason="busy"/>', r.body);
  r = await MC._test.missed({ From: '+1' + TED_PHONE, CallSid: 'CAst1', CallStatus: 'busy' }, 'status busy');
  ok(/salesblock/.test(r.skipped) && SMS.length === 0, 'its status callback → no text-back / lead', r);
  r = await web(tedForm({ message: 'please call me about my roof', company: '' }));
  ok(r.statusCode === 200 && !openInbox().length && MAIL.length === 0, 'blocked sender\'s website form → ignored');
  r = await WEB.fromEmail({ from: { email: 'ted@growthvector.io', name: 'Ted' }, subject: 'hi', text: 'Name: Ted\nPhone: 646-555-0100\nMessage: roof', messageId: '<b1@x>' });
  ok(/blocked email/.test(r.ignored || '') && !openInbox().length, 'blocked e-mail to leads@ → ignored', r);
  await api('tok-owner', 'POST', { act: 'block' }, { domain: 'growthvector.io' });
  r = await WEB.fromEmail({ from: { email: 'sales@growthvector.io', name: 'Sales' }, subject: 'hi', text: 'Name: Al\nPhone: 646-555-0101\nMessage: roof', messageId: '<b2@x>' });
  ok(/blocked domain/.test(r.ignored || ''), 'a blocked domain → ignored', r);
  /* any other path (a lead filed elsewhere) — the new-lead alert drops it */
  const alertsApi = BI._lib.alertsApi();
  setKv('gc_lead_inbox', [{ id: 'LI-elsewhere1', status: 'new', title: 'Partner lead', contact: { phone: '347-336-4175' }, scope: 'roof leak at 12 Oak' }]);
  MAIL.length = 0;
  r = await alertsApi.notifyNew([{ id: 'LI-elsewhere1', title: 'Partner lead', source: 'Partner API', contact: { name: 'X', phone: '347-336-4175' }, scope: 'roof leak at 12 Oak' }]);
  ok(r.salesblock && /blocked/.test(r.salesblock['LI-elsewhere1']) && MAIL.length === 0 && SMS.length === 0, 'a blocked sender\'s lead from any other source → no alert', r);
  ok(spam().counts.blocked >= 6 && spam().log.filter(x => x.decision === 'blocked').length >= 6, 'every drop is logged and counted', spam().counts);
  /* unblock restores it */
  a = await api('tok-owner', 'POST', { act: 'unblock' }, { phone: TED_PHONE });
  ok(a.ok && a.block.phones.indexOf(TED_PHONE) < 0, 'unblock');
  SMS.length = 0;
  r = await sms(TED_PHONE, 'hello, can you look at my roof?', 'SMunb1');
  ok(!r.blocked && !r.salesblock && r.newLead && smsTo(TED_PHONE).length === 1, 'after unblock: a text → a lead + the answer again', r);
  r = await call(TED_PHONE);
  ok(!/Reject/.test(r.body), 'after unblock: the call is answered', r.body.slice(0, 160));

  /* ── 8. 🧹 Sales & spam: review, not spam → make lead, dismiss ── */
  console.log('— 8. Sales & spam review');
  world(); T = NIGHT;
  await web(tedForm());
  await sms('9015554400', PITCHES[0]);
  await sms('9015554401', PITCHES[4]);
  a = await api('tok-office', 'GET', { list: '1' });
  ok(a.ok && a.held.length === 3 && a.held.every(x => x.canLead && !x.refile) && a.counts.sales === 3, 'the office sees the 3 held (no internals)', a.held && a.held.map(x => [x.via, x.phone]));
  a = await api('tok-pm', 'GET', { count: '1' }); ok(a.__code === 403, 'a PM does not');
  a = await api('tok-owner', 'GET', { count: '1' }); ok(a.ok && a.held === 3, 'the count');
  const tedItem = (await api('tok-owner', 'GET', { list: '1' })).held.find(x => x.via === 'website');
  T = DAY; MAIL.length = 0; SMS.length = 0;
  a = await api('tok-owner', 'POST', { act: 'notspam' }, { id: tedItem.id });
  let made = openInbox().find(x => x.id === a.leadId);
  ok(a.ok && made && made.leadExtra.notSpam === true && a.alerted && !emergMail().length /* LEADROUTE2: an unassigned lead e-mails nobody */, '"Not spam → make lead" files the lead and alerts it normally (not as an emergency)', { a, m: MAIL.map(x => x.subject) });
  ok(SG.cleanBlock(getKv(SG.BKEY)).allowPhones.indexOf(TED_PHONE) >= 0, '… and the sender is never filtered again');
  r = await sms(TED_PHONE, TED, 'SMallow1'); ok(!r.salesblock, 'an allowed sender\'s next pitch passes');
  const smsItem = held().find(x => x.phone === '9015554400');
  a = await api('tok-owner', 'POST', { act: 'block' }, { id: smsItem.id });
  ok(a.ok && a.block.phones.indexOf('9015554400') >= 0 && spam().list.find(x => x.id === smsItem.id).status === 'blocked', '🚫 Block from the list blocks + marks it', a);
  const other = held().find(x => x.phone === '9015554401');
  a = await api('tok-owner', 'POST', { act: 'dismiss' }, { id: other.id });
  ok(a.ok && !held().length, 'dismiss → off the list');
  /* a pitch caught at the new-lead alert (a lead from another source) → off the Lead Inbox, held; not spam → back + alerted */
  world(); T = NIGHT;
  setKv('gc_lead_inbox', [{ id: 'LI-partner2', status: 'new', title: 'Partner lead — Sam', contact: { name: 'Sam', phone: '901-555-0170' }, scope: PITCHES[9] }]);
  r = await alertsApi.notifyNew([{ id: 'LI-partner2', title: 'Partner lead — Sam', source: 'Partner API', type: 'residential', contact: { name: 'Sam', phone: '901-555-0170' }, scope: PITCHES[9] }]);
  ok(r.salesblock && MAIL.length === 0 && SMS.length === 0 && inbox()[0].status === 'dismissed' && held().some(x => x.leadId === 'LI-partner2'), 'a pitch from any other source → no alert, off the Lead Inbox, held', { r, s: inbox()[0].status });
  r = await alertsApi.notifyNew([{ id: 'LI-bid9', title: 'ITB — Fire Station 9 reroof', source: 'bids@ (BuildingConnected)', type: 'commercial', scope: 'You are invited to bid. Unsubscribe from these e-mails. Book a call with our team.' }]);
  ok(!r.salesblock && r.messages >= 1 /* LEADROUTE2: alerted (no office@ e-mail) */, 'a commercial bid invite is never screened as a pitch', r);
  T = DAY; MAIL.length = 0;
  a = await api('tok-owner', 'POST', { act: 'notspam' }, { id: held().find(x => x.leadId === 'LI-partner2').id });
  ok(a.ok && a.restored && inbox().find(x => x.id === 'LI-partner2').status === 'new' && a.alerted /* LEADROUTE2 */, 'not spam → back in the Lead Inbox + alerted', { a, m: MAIL.map(x => x.subject) });
  /* a night "emergency" that the night rule held back is logged with the reason */
  world(); T = NIGHT;
  setKv('gc_lead_inbox', [{ id: 'LI-drop3', status: 'new' }]);
  r = await alertsApi.notifyNew([Object.assign({ id: 'LI-drop3', title: 'Storm / insurance damage — Cy', contact: { name: 'Cy', phone: '901-555-0180' } }, dropOnly)]);
  ok(!emergMail().length && /* LEADROUTE2 (owner 11/9): an unassigned normal lead e-mails nobody (office@ is off) */ spam().log.some(x => x.decision === 'night' && x.id === 'LI-drop3' && /night/.test(x.why)), 'night: drop-down-only → a normal lead alert, the decision logged', { m: MAIL.map(x => x.subject), log: spam().log });

  /* ── 9. owner 11/01: no time promise in any automatic first reply (only an emergency may say "right away") ── */
  console.log('— 9. first replies: no time promise');
  const TIME = /\bwithin\b|\bminutes?\b|\bhours?\b|\btoday\b|\btonight\b|\btomorrow\b|\b24\b(?!\s*\/\s*7)|business\s+day|in\s+the\s+morning|right\s+away|as\s+soon\s+as\s+possible/i;
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ');
  T = DAY;
  const W = WEB._test, LIm = require(path.join(SRC, 'lead-intake.js')), Sm = require(path.join(SRC, '_lib/sms.js')), COm = require(path.join(SRC, '_lib/callorder.js'));
  const nonEm = [];
  ['estimate', 'storm', 'problem', 'roofprice', 'commercial', 'maintenance'].forEach(t => { const m = W.replyFor({ type: t, name: 'Pat Lee', message: 'please call me about my roof', service: '' }, {}); nonEm.push(['website ' + t, m.text], ['website ' + t + ' (html)', plain(m.html)]); });
  nonEm.push(['website: Ted\'s exact form', W.replyFor(Object.assign({}, tedForm()), {}).text]);
  nonEm.push(['lead source first e-mail', LIm._t.firstEmail({ name: 'Al Day', jobType: '' }, {}).text], ['lead source first e-mail (html)', plain(LIm._t.firstEmail({ name: 'Al Day', jobType: 'Gutters' }, { name: 'Sam', phone: '9015550000' }).html)]);
  nonEm.push(['missed-call text-back', MC._test.TEXT], ['after-hours text-back', MC._test.AH_TEXT], ['night call greeting', COm.NIGHT_GREETING], ['day call greeting', COm.GREETING]);
  ['1', '2', '3', '4', 'w'].forEach(c => [{ onFile: true, job: { id: 'j' }, pmFirst: 'Mike', first: 'Ann' }, { onFile: true, job: null }, { onFile: false }].forEach((ctx, i) => nonEm.push(['text menu ' + c + '/' + i, MN.answer(c, ctx)])));
  nonEm.push(['text menu: forwarded', MN.forwarded('Mike')], ['text menu', MN.menuText('Ann', true)], ['text fallback', Sm.FALLBACK || '']);
  (Sm.DEFAULT_RULES || []).filter(r => r.id !== 'emergency').forEach(r => nonEm.push(['text auto-answer "' + r.id + '"', r.answer]));
  nonEm.forEach(([k, t]) => ok(!!t && !TIME.test(t), 'no time promise: ' + k, t));
  /* owner 11/01 follow-up: "don't promise any days in portal or text, just say with you shortly" — the coordinator's regex over
     every customer-facing template (emergency replies and real dates / code expiry / reminder cadence are the only exceptions) */
  const DAYS = /within \d|business day|\b\d+\s*(hours?|days?|minutes?)\b|\btoday\b|\btomorrow\b|end of day/i;
  const FA = require(path.join(SRC, '_lib/fa-core.js'));
  Object.keys(FA.TICKET_STATUS).forEach(k => nonEm.push(['warranty ticket status "' + k + '"', FA.TICKET_STATUS[k]]));
  nonEm.forEach(([k, t]) => ok(!DAYS.test(t), 'no day promise: ' + k, t));
  const portalSrc = fs.readFileSync(path.resolve(SRC, '../../portal.html'), 'utf8');
  const lits = [...portalSrc.matchAll(/'((?:[^'\\\n]|\\.){4,})'|"((?:[^"\\\n]|\\.){4,})"|>([^<>{}\n]{6,})</g)].map(m => m[1] || m[2] || m[3]);
  const FACT = /works for 10 minutes|^Today$|reminder every 15 days|CANCELLATION/;   /* a code's expiry, a label, the reminder cadence, the contract's legal terms */
  const bad = [...new Set(lits.filter(t => DAYS.test(t) && !FACT.test(t)))];
  ok(!bad.length, 'portal.html: no day / time promise in any customer text', bad);
  ok(/Your Project Manager will be with you shortly/.test(portalSrc), 'portal "Report an issue": "will be with you shortly"');
  const html0 = path.resolve(SRC, '../../index.html');
  if (fs.existsSync(html0)) { const ix = fs.readFileSync(html0, 'utf8'); ok(!/your PM will reach out within 2 business days|requests acknowledged within 2 business days/.test(ix), 'CRM: the ticket status + warranty claim form promise no days'); }
  const tedReply = W.replyFor(tedForm(), {}).text;
  ok(!/storm\s*\/\s*insurance\s*damage/i.test(tedReply) && /Thanks for reaching out to GrayCo Construction Services — we received your message/.test(tedReply), 'the reply never assumes the topic from the form type', tedReply);
  ok(/we received your message and someone from our team will call you shortly\./.test(W.replyFor({ type: 'storm', name: 'X', message: 'hi' }, {}).text), 'no topic picked → the general wording');
  ok(/about roof repair and someone/.test(W.replyFor({ type: 'estimate', name: 'X', message: 'hi', service: 'Roof repair' }, {}).text), 'a topic the lead picked (the service) is mentioned');
  ok(!/your roof/.test(LIm._t.firstEmail({ name: 'Al', jobType: '' }, {}).text), 'the lead-source e-mail no longer assumes "your roof"');
  /* emergencies still promise (and still go) */
  ok(/right away/.test(W.replyFor({ type: 'storm', name: 'Ann', message: 'I need help I have water everywhere !?' }, {}).text), 'a website emergency reply: "our on-call team will call you right away"');
  ok(!/within|minutes?|hours?|today|tomorrow/i.test(MN.answer('5', {})) && /582-8255/.test(MN.answer('5', {})), 'the text menu emergency answer: no time promise, the 24/7 emergency line (901) 582-8255 (patch CUSTPORTAL, owner 11/02)');
  ok(COm.clean({ night: { greeting: "Thanks for calling GrayCo Construction Services. Our office is closed. If you have an emergency — water, fire, or storm or tree damage — press 1. For anything else, press 2 and we'll text you and call you back in the morning. For sales, press 3." } }).night.greeting === COm.NIGHT_GREETING
    && COm.clean({ night: { greeting: 'Custom words, call you in the morning.' } }).night.greeting === 'Custom words, call you in the morning.', 'a saved copy of the OLD night greeting follows the new default; custom text is kept');
  /* end to end: the approval card / auto answers that actually went out */
  world(); T = DAY;
  await web({ type: 'storm', name: 'Dee Plain', email: 'dee@example.com', phone: '(901) 555-0195', message: 'Can someone look at my gutters' });
  let fm = firstMail().find(x => x.to === 'dee@example.com');
  ok(fm && !TIME.test(plain(fm.html)) && !/storm/i.test(plain(fm.html)), 'end to end: the "First e-mail to a new lead" card has no time promise, no assumed topic', fm && plain(fm.html));
  await web({ type: 'storm', name: 'Eve Wet', email: 'eve@example.com', phone: '(901) 555-0196', message: 'water everywhere in the kitchen' });
  fm = firstMail().find(x => x.to === 'eve@example.com');
  ok(fm && /right away/.test(plain(fm.html)), 'end to end: an emergency first e-mail keeps "right away"', fm && plain(fm.html));
  SMS.length = 0;
  await sms('9015550197', 'need an estimate for a roof');
  const ans = smsTo('9015550197').map(x => x.Body).join(' | ');
  ok(ans && !TIME.test(ans.replace(/— 24\/7/g, '')), 'end to end: the text auto-answer to a new lead has no time promise', ans);
  SMS.length = 0; T = NIGHT;
  await sms('9015550198', 'pipe burst water everywhere');
  ok(smsTo('9015550198').length === 1 && /within 15 minutes|alerted right now/.test(smsTo('9015550198')[0].Body), 'end to end: an emergency text is still answered at once (with its time)', smsTo('9015550198').map(x => x.Body));

  /* ── 10. the page uses the same rules, verbatim ── */
  const html = path.resolve(SRC, '../../index.html');
  const rules = src => { const a0 = src.indexOf('/* RULES-BEGIN'), b0 = src.indexOf('/* RULES-END */'); return a0 >= 0 && b0 > a0 ? src.slice(a0, b0) : ''; };
  const lib = rules(fs.readFileSync(path.join(SRC, '_lib/salesguard.js'), 'utf8'));
  if (fs.existsSync(html)) {
    const page = fs.readFileSync(html, 'utf8');
    if (page.indexOf('__GC_PATCH_SALESBLOCK__') >= 0) ok(lib.length > 2000 && rules(page) === lib, 'index.html carries the exact same rules block');
    else console.log('  (index.html not patched — rules check skipped)');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
