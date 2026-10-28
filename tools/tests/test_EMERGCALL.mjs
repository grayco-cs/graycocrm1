// test_EMERGCALL.mjs — patch EMERGCALL (offline): an emergency lead nobody acknowledged in 15 minutes → the CRM phones
// this week's on-call person, then the 📞 Call order, one at a time; 1 connects to the customer, 2 accepts (details by
// text); no key → the next; whole list again 10 min later, then the admins are e-mailed. Mocks: Supabase REST (in-memory
// gc_kv), Twilio REST (Calls + Messages recorded, nothing placed), Resend. Webhooks signed with a fake TWILIO_AUTH_TOKEN.
// Usage: node tools/tests/test_EMERGCALL.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../../netlify/functions'));
const TOKEN = 'fake-twilio-token-456';
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com' });
['TWILIO_RING_TO', 'TWILIO_RING_SECONDS', 'X10_OFF', 'URL', 'DEPLOY_PRIME_URL'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); } }

const KV = new Map(), CALLS = [], SMS = [], MAIL = [];
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => (KV.get(k) || {}).value;
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') return J(200, [{ email: 'owner@grayco-cs.com', role: 'admin', active: true }]);
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
  if (u.host === 'api.twilio.com') {
    const b = Object.fromEntries(new URLSearchParams(init.body));
    if (/Calls\.json$/.test(u.pathname)) { CALLS.push(b); return J(201, { sid: 'CAout' + CALLS.length }); }
    SMS.push(b); return J(201, { sid: 'SM' + SMS.length });
  }
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
const MC = require(path.join(SRC, 'missed-call.js'));
const X10S = require(path.join(SRC, 'x10-scheduled.js'));
const PAUSE = require(path.join(SRC, '_lib/pause.js'));
const T0 = Date.parse('2026-10-28T02:00:00Z');   /* a weeknight, 9 PM Central — quiet hours must not matter */
let T = T0; MC._now = () => T; X10S._now = () => T;
const min = n => { T = T0 + n * 60000; };

const ONCALL = '9015559999', OFFICE = '9015850944', NICK = '9015551001', WES = '9015551002', SENIOR = '9015551003', CUST = '9015553333';
function world(o = {}){
  KV.clear(); CALLS.length = 0; SMS.length = 0; MAIL.length = 0; PAUSE.reset(); T = T0;
  setKv('users', [
    { id: 'u1', name: 'Nick Thomas', email: 'nick@grayco-cs.com', role: 'Admin', phone: NICK, active: true },
    { id: 'u2', name: 'Wesley Johnson', email: 'wesley@grayco-cs.com', role: 'Admin', phone: WES, active: true },
    { id: 'u3', name: 'Sam Senior', email: 'sam@grayco-cs.com', role: 'Project Manager', phone: SENIOR, active: true }]);
  setKv('gc_senior_pm', { email: 'sam@grayco-cs.com', id: 'u3' });
  setKv('gc_x10_oncall', { on: true, weekends: true, startDate: '2026-01-05', rotation: [{ email: 'olive@grayco-cs.com', name: 'Olive OnCall', phone: ONCALL }] });
  setKv('gc_lead_inbox', [{ id: 'LI-1', title: 'Water pouring through the ceiling', status: 'new', createdAt: new Date(T0).toISOString() }]);
  setKv('leads', []); setKv('gc_job_messages', []);
  if (o.order) setKv('gc_call_order', o.order);
  if (o.pause) setKv('gc_automation_pause', { on: true });
}
const SITE = 'https://crm.grayco-cs.com/.netlify/functions/missed-call';
function sign(url, p, token){ return crypto.createHmac('sha1', token || TOKEN).update(Buffer.from(url + Object.keys(p).sort().map(k => k + p[k]).join(''), 'utf8')).digest('base64'); }
function post(url, p, o = {}){
  const u = new URL(url), qs = Object.fromEntries(u.searchParams);
  const headers = o.noSig ? {} : { 'X-Twilio-Signature': sign(o.signUrl || url, p) };
  return MC.handler({ httpMethod: 'POST', headers, queryStringParameters: qs, rawUrl: url, body: new URLSearchParams(p).toString() });
}
const EC = () => MC._test.EC();
const rec = () => (getKv('gc_emerg_calls') || { list: [] }).list[0] || null;
const tick = () => X10S._test.run();
const lead = { id: 'LI-1', key: 'LEADIN-1', title: 'Water pouring through the ceiling', city: 'Bartlett', contact: { name: 'Ann Customer', phone: '(901) 555-3333' }, detail: 'Pipe burst, water everywhere' };
/* our outbound call, answered: the TwiML it plays, then a key (or the status callback) */
const answer = (c) => post(c.Url, { CallSid: 'CAout', To: c.To, From: c.From, CallStatus: 'in-progress' });
const press = (c, twimlBody, digits) => { const a = /action="([^"]+)"/.exec(twimlBody)[1].replace(/&amp;/g, '&'); return post(a, { CallSid: 'CAout', To: c.To, From: c.From, Digits: digits }); };
const ended = (c, status) => post(c.StatusCallback, { CallSid: 'CAout', To: c.To, From: c.From, CallStatus: status || 'no-answer' });

console.log('EMERGCALL — register, wait 15 min, call on call');
{
  world();
  const r = await EC().register(lead);
  ok(r.registered && rec().kind === 'water damage' && rec().contact.phone === CUST && rec().state === 'waiting', 'an emergency lead is registered (water damage, customer phone kept)', rec());
  ok((await EC().register(lead)).skipped, 'registered once per lead');
  min(10); await tick();
  ok(CALLS.length === 0, '10 minutes, nobody acknowledged → no call yet');
  min(16); await tick();
  ok(CALLS.length === 1 && CALLS[0].To === '+1' + ONCALL && CALLS[0].From === '+19015550000' && CALLS[0].Timeout === '25', '16 minutes, no acknowledgement → the CRM phones this week\'s on-call person (from the GrayCo number, 25 s)', CALLS);
  ok(/event=ecall&id=EC-LI-1&step=0/.test(CALLS[0].Url) && /event=ecallstatus/.test(CALLS[0].StatusCallback), 'the call\'s TwiML and status callback point at our signed webhook');
  const a = await answer(CALLS[0]);
  ok(/GrayCo emergency\. A customer reported water damage at Bartlett, 16 minutes ago, and nobody has answered yet\. Press 1 to be connected to the customer now\. Press 2 to accept and call them yourself\./.test(a.body) && /<Gather numDigits="1"/.test(a.body), 'the message: water damage at Bartlett, 16 minutes ago, press 1 / press 2', a.body);
  ok(SMS.length === 0, 'no texts were sent by the escalation itself');
  await ended(CALLS[0], 'no-answer');
  ok(CALLS.length === 2 && CALLS[1].To === '+1' + OFFICE, 'no key (no answer) → the next: the 📞 Call order\'s first line (Office)', CALLS.map(c => c.To));
  const a2 = await answer(CALLS[1]);
  await ended(CALLS[1], 'completed');   /* a voicemail took it: completed, nobody pressed */
  ok(CALLS.length === 3 && CALLS[2].To === '+1' + NICK, 'a voicemail (completed, no key) → the next: Owner 1', CALLS.map(c => c.To));
  const a3 = await answer(CALLS[2]);
  const k = await press(CALLS[2], a3.body, '1');
  ok(/Connecting you to the customer/.test(k.body) && /<Dial callerId="\+19015550000"[^>]*><Number>\+19015553333<\/Number><\/Dial>/.test(k.body), 'press 1 → <Dial> the customer, caller ID = the GrayCo number', k.body);
  ok(rec().state === 'connected' && /Owner 1/.test(rec().acceptedBy), 'state: connected, by Owner 1', rec());
  await ended(CALLS[2], 'completed'); min(30); await tick();
  ok(CALLS.length === 3, 'the first key stops the escalation: nobody else is called');
}
console.log('EMERGCALL — press 2');
{
  world(); await EC().register(lead); min(15); await tick();
  const a = await answer(CALLS[0]); const k = await press(CALLS[0], a.body, '2');
  ok(/details are on their way by text/.test(k.body) && /<Hangup\/>/.test(k.body) && rec().state === 'accepted', 'press 2 → accepted, hang up', k.body);
  ok(SMS.length === 1 && SMS[0].To === '+1' + ONCALL && /Ann Customer/.test(SMS[0].Body) && /\(901\) 555-3333/.test(SMS[0].Body), 'press 2 → the details go to that person by text', SMS);
  await ended(CALLS[0], 'completed'); min(40); await tick();
  ok(CALLS.length === 1, 'accepted → nobody else is called');
  const late = await answer({ Url: SITE + '?event=ecall&id=EC-LI-1&step=1', To: '+1' + OFFICE, From: '+19015550000' });
  ok(/has been taken care of/.test(late.body), 'a late answer elsewhere hears "taken care of"');
}
console.log('EMERGCALL — acknowledged in the CRM, paused, off');
{
  world(); await EC().register(lead);
  min(10); setKv('gc_lead_inbox', [{ id: 'LI-1', title: 'x', status: 'imported', pm: 'Sam Senior', assignedBy: 'office@grayco-cs.com', assignedAt: new Date(T).toISOString() }]);
  min(16); await tick();
  ok(CALLS.length === 0 && rec().state === 'acked' && /assigned/.test(rec().ackWhy), 'assigned in the CRM at 10 min → no call at 15', rec());
  world(); await EC().register(lead); min(5);
  setKv('gc_sms_state', { calls: {}, texted: {}, optout: {}, owner: {}, lastOut: { [CUST]: { email: 'sam@grayco-cs.com', name: 'Sam', at: new Date(T).toISOString() } } });
  min(16); await tick();
  ok(CALLS.length === 0 && /texted by Sam/.test(rec().ackWhy), 'a staff member texted the customer → acknowledged, no call', rec());
  world(); await EC().register(lead);
  setKv('gc_x10_pages', [{ id: 'OC-1', leadId: 'LI-1', acceptedAt: new Date(T0 + 60000).toISOString(), acceptedName: 'Olive OnCall' }]);
  min(16); await tick();
  ok(CALLS.length === 0 && /on-call page/.test(rec().ackWhy), '✅ Accept on the on-call page → no call');
  world(); await EC().register(lead); await EC().ack('LI-1', 'replied to the alert text');
  min(16); await tick();
  ok(CALLS.length === 0 && rec().state === 'acked', 'ack() (a reply to the alert text — claude/smsalert hooks here) → no call');
  world({ pause: true }); await EC().register(lead); min(16); await tick();
  ok(CALLS.length === 0 && rec().state === 'waiting', 'data-entry mode on → no calls (still waiting)');
  world({ order: { slots: [{ id: 'office', kind: 'company' }], emerg: { on: false } } }); await EC().register(lead); min(30); await tick();
  ok(CALLS.length === 0, 'escalation calls turned off in the card → no calls');
  world({ order: { slots: [{ id: 'office', kind: 'company' }], emerg: { on: true, minutes: 30 } } }); await EC().register(lead); min(20); await tick();
  ok(CALLS.length === 0, 'minutes set to 30 → nothing at 20 min'); min(31); await tick();
  ok(CALLS.length === 1 && CALLS[0].To === '+1' + ONCALL, '… a call at 31 min');
}
console.log('EMERGCALL — nobody presses: once more after 10 min, then the admins');
{
  world({ order: { slots: [{ id: 'office', kind: 'company' }, { id: 'owner1', kind: 'person', person: 'u1' }] } });
  await EC().register(lead); min(15); await tick();
  const walk = async () => { for (let i = 0; i < 10; i++) { const c = CALLS[CALLS.length - 1], n = CALLS.length; await ended(c, 'no-answer'); if (CALLS.length === n) break; } };
  await walk();
  ok(CALLS.map(c => c.To.slice(2)).join() === [ONCALL, OFFICE, NICK].join() && rec().state === 'retry', 'round 1: on call → Office → Owner 1, then "once more in 10 min"', CALLS.map(c => c.To));
  min(20); await tick(); ok(CALLS.length === 3, 'not before 10 minutes');
  min(26); await tick(); ok(CALLS.length === 4 && CALLS[3].To === '+1' + ONCALL, 'round 2 starts with on call again');
  await walk();
  ok(CALLS.length === 6 && rec().state === 'gaveup', 'round 2 done → gave up', rec());
  ok(MAIL.some(m => /Nobody answered the emergency calls/.test(m.subject)), 'the admins are e-mailed "nobody answered"', MAIL.map(m => m.subject));
  min(60); await tick(); ok(CALLS.length === 6, 'and nothing more');
}
console.log('EMERGCALL — signatures');
{
  world(); await EC().register(lead); min(15); await tick();
  const c = CALLS[0];
  ok((await post(c.Url, { CallSid: 'CAout' }, { noSig: true })).statusCode === 403, 'ecall without signature → 403');
  ok((await post(SITE + '?event=ecallkey&id=EC-LI-1&step=0', { CallSid: 'CAout', Digits: '1' }, { noSig: true })).statusCode === 403 && rec().state === 'calling', 'ecallkey without signature → 403, nothing changes');
  ok((await post(SITE + '?event=ecallkey&id=EC-LI-1&step=0', { CallSid: 'CAout', Digits: '1' }, { signUrl: SITE + '?event=ecallkey&id=EC-OTHER&step=0' })).statusCode === 403, 'ecallkey signed for another id → 403');
  ok((await post(c.StatusCallback, { CallSid: 'CAout', CallStatus: 'no-answer' }, { noSig: true })).statusCode === 403 && CALLS.length === 1, 'ecallstatus without signature → 403, no next call');
}
console.log('EMERGCALL — the lead alert registers it');
{
  world();
  const E = require(path.join(SRC, '_lib/emergency.js'));
  ok(E.isEmergency({ title: 'Tree fell on my house', detail: '' }) && require(path.join(SRC, '_lib/emergcall.js')).kindOf({ title: 'Tree fell on my house' }) === 'a tree on the house', 'a tree on the house is an emergency and is said as "a tree on the house"');
  ok(require(path.join(SRC, '_lib/emergcall.js')).kindOf({ title: 'Kitchen fire, smoke everywhere' }) === 'a fire', 'fire → "a fire"');
  const src = require('fs').readFileSync(path.join(SRC, '_lib/bid-alerts.js'), 'utf8');
  ok(/require\('\.\/emergcall\.js'\)\.make\(\{ env, now, kvGet, kvCas \}\)\.register\(x, raw\[x\.id\]\)/.test(src), 'bid-alerts emergency() registers each emergency lead (once per lead, after its claim)');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
