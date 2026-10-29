// test_TEXTLEAD.mjs — patch TEXTLEAD (offline): texts build the lead (phone, name, address, work), the whole
// conversation is kept on the lead, it is copied to the job when the lead becomes one, and a customer's text lands in
// the job's 💬 timeline. Mocks: Supabase REST (in-memory gc_kv; gc_lead_inbox_kv missing → gc_kv), Twilio, Resend.
// Usage: node tools/tests/test_TEXTLEAD.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }
const KV = new Map(), SMS = [], MAIL = [];
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
  if (u.host === 'api.twilio.com') { SMS.push(Object.fromEntries(new URLSearchParams(init.body))); return J(201, { sid: 'SM' + SMS.length }); }
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
const MC = require(path.join(SRC, 'missed-call.js'));
const TL = require(path.join(SRC, '_lib/textlead.js'));
const TX = require(path.join(SRC, 'texts.js'));
const leads = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const byPhone = ph => leads().find(x => (x.contact || {}).phone && x.contact.phone.replace(/\D/g, '').endsWith(ph));
const comms = pid => { const v = getKv('gc_comms__' + pid); return Array.isArray(v) ? v : (v && (v.items || v.list)) || []; };
const jm = () => { let v = getKv('gc_job_messages'); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : (v && (v.list || v.v)) || []; };
function world(){
  KV.clear(); SMS.length = 0; MAIL.length = 0;
  setKv('users', [{ id: 'u1', name: 'Nick Thomas', email: 'nick@grayco-cs.com', role: 'Admin', active: true }]);
  setKv('projects', []); setKv('customers', []); setKv('leads', []); setKv('gc_job_messages', []); setKv('gc_office_tasks', []);
}
const sms = (from, body, sid) => MC._test.inboundSms({ From: '+1' + from, To: '+19015550000', Body: body, MessageSid: sid });

(async () => {
  /* ── extraction rules ── */
  let e = TL.extract('Hi this is Maria Lopez, 455 Oak St Bartlett TN 38135, water heater leaked');
  ok(e.name === 'Maria Lopez' && e.address === '455 Oak St' && e.city === 'Bartlett' && e.state === 'TN' && e.zip === '38135' && /water/.test(e.work), 'regex: name / address / city / state / ZIP / work', e);
  e = TL.extract('my name is john smith, roof leaking at 1200 N. Main Street Memphis. email me john@x.com ASAP. State Farm claim');
  ok(e.name === 'John Smith' && e.address === '1200 N. Main Street' && e.city === 'Memphis' && e.email === 'john@x.com' && e.urgency === 'ASAP' && e.insurance && e.carrier === 'State Farm', 'regex: lower-case name, e-mail, urgency, insurance', e);
  ok(!TL.extract("I'm having a leak in the kitchen").name, 'no false name from "I\'m having"');
  ok(TL.extract('Can you look at my roof?\n- Bob Jones').name === 'Bob Jones', 'signature line');

  /* ── 1. an unknown number → a lead at once, with the phone; the facts filled ── */
  world();
  let r = await sms('9015551234', 'Hi this is Maria Lopez, 455 Oak St Bartlett TN 38135, water heater leaked', 'SM1');
  let L1 = byPhone('9015551234');
  ok(!!L1 && r.newLead === L1.id, 'unknown number → a lead', r);
  ok(L1 && L1.contact.name === 'Maria Lopez' && L1.address === '455 Oak St' && L1.city === 'Bartlett' && L1.zip === '38135' && L1.state === 'TN', 'name + address filled from the text', L1 && { c: L1.contact, a: L1.address, city: L1.city });
  ok(L1 && L1.title === 'Text message — Maria Lopez', 'titled by the name', L1 && L1.title);
  ok(L1 && /water/.test(L1.leadExtra.workType), 'type of work', L1 && L1.leadExtra.workType);
  ok(L1 && L1.notes.some(n => /^📱 From text .*name Maria Lopez, address 455 Oak St, city Bartlett/.test(n)), 'the auto-fill is noted on the lead', L1 && L1.notes);
  ok(L1 && L1.leadExtra.textLog.length >= 1 && L1.leadExtra.textLog[0].dir === 'in' && /Maria Lopez/.test(L1.leadExtra.textLog[0].text), 'the text is on the lead conversation');
  ok(L1 && L1.notes.some(n => /^💬 .* — Customer: Hi this is Maria/.test(n)), 'conversation line in the notes');
  /* any text from an unknown number is a lead (not only estimate words) */
  r = await sms('9015552222', 'what time do you close', 'SM2');
  const L2 = byPhone('9015552222');
  ok(!!L2 && /\(901\) 555-2222/.test(L2.title), 'a plain question from a new number → lead titled by the phone', L2 && L2.title);
  ok(L2 && L2.leadExtra.textLog.some(x => x.dir === 'out' && x.who === 'automatic answer'), 'the automatic answer is on the conversation', L2 && L2.leadExtra.textLog);

  /* ── 2. staff typed a name: never overwritten; follow-ups appended; empty fields still filled ── */
  const items = getKv('gc_lead_inbox'); const it = items.find(x => x.id === L1.id); it.contact.name = 'Maria L. (per Nick)'; setKv('gc_lead_inbox', items);
  await sms('9015551234', 'this is Mary Smith again, also 99 Pine St. email maria@example.com', 'SM3');
  L1 = byPhone('9015551234');
  ok(L1.contact.name === 'Maria L. (per Nick)', 'staff-typed name kept', L1.contact.name);
  ok(L1.address === '455 Oak St', 'address already there: kept');
  ok(L1.contact.email === 'maria@example.com', 'empty e-mail filled from the follow-up', L1.contact);
  ok(L1.leadExtra.textLog.filter(x => x.dir === 'in').length === 2, 'follow-up appended to the conversation', L1.leadExtra.textLog);
  await sms('9015551234', 'this is Mary Smith again, also 99 Pine St. email maria@example.com', 'SM3');
  ok(byPhone('9015551234').leadExtra.textLog.filter(x => x.dir === 'in').length === 2, 'a Twilio retry is not logged twice');
  /* a staff reply from the CRM → on the lead conversation */
  const sr = await TX._t.send({ email: 'nick@grayco-cs.com', name: 'Nick Thomas' }, { to: '9015551234', text: 'We can come Tuesday at 9', noSign: true });
  ok(sr.code === 200, 'staff text sent', sr);
  ok(byPhone('9015551234').leadExtra.textLog.some(x => x.dir === 'out' && x.who === 'Nick Thomas' && /Tuesday at 9/.test(x.text)), 'staff reply logged on the lead');
  /* a carrier never shows in the notes */
  await sms('9015553333', 'tree hit my house, my name is Al Green, Allstate claim', 'SM4');
  const L3 = byPhone('9015553333');
  ok(L3 && L3.leadExtra.carrierInternal === 'Allstate' && L3.leadExtra.insuranceClaim === true && !L3.notes.some(n => /Allstate/.test(n.replace(/^💬.*$/, ''))), 'carrier kept internal only', L3 && L3.notes);

  /* ── 3. a missed call: the caller's words + the automatic text on the lead ── */
  r = await MC._test.missed({ From: '+19015554444', CallSid: 'CAm1' }, 'test', { what: 'my basement is flooding, this is Tom Hardy' });
  const L4 = byPhone('9015554444');
  ok(L4 && L4.leadExtra.textLog.some(x => x.dir === 'call' && /basement/.test(x.text)) && L4.leadExtra.textLog.some(x => x.dir === 'out' && /Sorry we missed your call/.test(x.text)), 'missed call: words + auto-text on the lead', L4 && L4.leadExtra.textLog);
  ok(L4 && L4.contact.name === 'Tom Hardy', 'missed call: name from the spoken words', L4 && L4.contact);

  /* ── 4. the lead becomes a job → the conversation + notes are copied once ── */
  setKv('projects', [{ id: 'P1', name: 'Lopez water', client: 'Maria Lopez', clientPhone: '(901) 555-1234', leadId: L1.id, created: new Date().toISOString() }]);
  let s1 = await TL.syncConverted();
  ok(s1.copied === 1 && s1.jobs[0] === 'P1', 'copied to the job', s1);
  const c1 = comms('P1');
  ok(c1.filter(x => x.kind === 'text').length >= 4 && c1.some(x => /Hi this is Maria/.test(x.text)) && c1.some(x => /Tuesday at 9/.test(x.text)), 'job 💬 timeline has the whole conversation', c1.map(x => x.kind + ':' + String(x.text).slice(0, 30)));
  ok(c1.some(x => x.kind === 'note' && /From text/.test(x.text)), 'lead notes on the job');
  ok(jm().some(m => m.pid === 'P1' && /From the lead/.test(m.text) && /Hi this is Maria/.test(m.text)), 'a "📋 From the lead" post on Job Messages');
  s1 = await TL.syncConverted();
  ok(s1.copied === 0 && comms('P1').length === c1.length, 'copied once only');
  /* later texts from that number → the job */
  await sms('9015551234', 'is the crew still coming?', 'SM5');
  ok(comms('P1').some(x => /crew still coming/.test(x.text)) && jm().some(m => m.pid === 'P1' && /crew still coming/.test(m.text)), 'a later text goes to the job (timeline + Job Messages)');

  /* ── 5. an existing customer texts about a job → the job's notes / timeline, no lead ── */
  setKv('projects', getKv('projects').concat([{ id: 'P2', name: 'Kline roof', client: 'Ken Kline', clientPhone: '901-555-5555', status: 'In Progress' }]));
  const nLeads = leads().length;
  await sms('9015555555', 'the gutter guys left a mess', 'SM6');
  ok(comms('P2').some(x => /gutter guys/.test(x.text)), 'customer text → job timeline');
  ok(leads().length === nLeads, 'no lead for an existing customer');
  /* a staff phone in the alerts table never becomes a lead */
  const n2 = leads().length;
  setKv('gc_sms_alerts', { at: 'x', people: { 'nick@grayco-cs.com': { on: true, phone: '9015556666', newAll: true } } });
  await sms('9015556666', 'hello estimate please', 'SM7');
  ok(leads().length === n2, 'staff cell → no lead');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
