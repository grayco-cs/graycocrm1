// test_LSAFWD_fn.mjs [worktree] — LSAFWD + LSADIRECT + LSAHOLD + LSAINTAKE (owner 11/19). Node only; everything is mocked: Supabase REST
// (in-memory gc_kv; gc_lead_inbox_kv missing → gc_kv), Resend (the inbound e-mail is read back from a fixture), Twilio. Made-up people and
// numbers, except the e-mail itself: tools/tests/fixtures/lsa_fwd_1118.eml is Wesley's 11/19 04:06Z Gmail forward of Google's "New call
// from a potential customer" (the real structure and text, quoted-printable, U+202F before "AM", his signature with his cell; Google's
// tracking links and ids replaced). Nothing is sent anywhere.
//   A. the forward → bid-inbox processEvent → website-intake: a NEW Google LSA lead (not folded into the 11/10 TEST lead, never Wesley's
//      cell as the caller's number), the caller's number from the office call log, the call time; after hours its text is HELD;
//      the office "📞 Google call — fill in the lead" To-Do is there at once.
//   B. LSAHOLD: 6:55 AM nothing; 7:00 AM Central on the next open day one text each to Wesley and Nick; two overnight leads → ONE
//      bundled text with both codes; a Saturday call waits for Monday 7 AM; an emergency after hours goes at once; ⚡ "LSA after-hours:
//      hold to 7 AM" OFF → a Google text goes at once.
//   C. LSADIRECT: in hours a Google call texts at once (no office gate) with the call time; the recording / number that arrive later →
//      ONE short follow-up; a second run sends nothing; a text still held is updated instead.
//   D. LSAINTAKE: office → "Send to PM" (default PM = Nick, resolved by e-mail once and stored as his id) → assigned like GOOD <code> <PM>,
//      the PM's text has the number + description, the admins get "Office sent … to PM …"; "Send to admin" → the admins' text; office 👎
//      → BAD pending an admin (pm_bad, no dispute To-Do), the admins are asked to confirm; Nick inactive → no preselection;
//      texts.js ?lsaleads / ?lsaintake: a PM gets 403.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { parseEml } from './lib_eml.mjs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WT = path.resolve(process.argv[2] || path.join(HERE, '../..'));
const SRC = path.join(WT, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'nthomas@grayco-cs.com,wjohnson@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok-lsafwd', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com', CUST_QUIET_OFF: '1' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'EMERG_OFF', 'ONCALL_OFF', 'LEAD_INTAKE_ALERTS', 'SMS_ALERTS_OFF', 'TWILIO_FROM_ALERTS', 'WEBSITE_AUTO_REPLY', 'LSA_DEFAULT_PM_EMAIL', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 1200) : '')); } }

const KV = new Map(), SMS = [], CALLS = [], MAIL = [];
const USERS_BY_TOKEN = { 'tok-office': 'office@grayco-cs.com', 'tok-pm': 'pat@grayco-cs.com', 'tok-wes': 'wjohnson@grayco-cs.com' };
const STAFF = { 'wjohnson@grayco-cs.com': 'admin', 'nthomas@grayco-cs.com': 'admin', 'office@grayco-cs.com': 'office', 'pat@grayco-cs.com': 'Project Manager' };
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => { const v = (KV.get(k) || {}).value; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
let RESEND_MAIL = null;
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const t = String((init.headers || {}).Authorization || '').replace(/^Bearer\s+/, ''); const e = USERS_BY_TOKEN[t]; return e ? J(200, { email: e }) : J(401, {}); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').replace(/^eq\./, ''); const row = x => ({ email: x, role: STAFF[x], active: true, name: x }); return J(200, e ? (STAFF[e] ? [row(e)] : []) : Object.keys(STAFF).map(row)); }
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
  if (u.host === 'api.resend.com' && m === 'GET') { if (/attachments/.test(u.pathname)) return J(200, { data: [] }); return RESEND_MAIL ? J(200, RESEND_MAIL) : J(404, {}); }
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
const AUTO = require(path.join(SRC, '_lib/automations.js'));
let AUTO_ON = AUTO.before(); AUTO._t.setStore({ get: async k => k === AUTO.KEY ? AUTO_ON : null, put: async () => true });
const setAuto = (k, v) => { AUTO_ON = Object.assign({}, AUTO_ON, { [k]: v }); AUTO._t.setStore({ get: async kk => kk === AUTO.KEY ? AUTO_ON : null, put: async () => true }); };
const SA = require(path.join(SRC, '_lib/smsalert.js'));
const WEB = require(path.join(SRC, 'website-intake.js'));
const BI = require(path.join(SRC, 'bid-inbox.js'));
const LR = require(path.join(SRC, '_lib/lsarec.js'));
const TX = require(path.join(SRC, 'texts.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
let T = Date.now(); const clock = () => T;
SA._D.now = clock; BI._now = clock; MC._now = clock; LR._D.now = clock;

const NICK = '9015551001', WES = '9015551002', PAT = '9015551003', WES_REAL_CELL = '901-692-7255';
function world(o){
  o = o || {};
  KV.clear(); SMS.length = 0; CALLS.length = 0; MAIL.length = 0;
  setKv('users', [
    { id: 'u-nick', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', phone: '(901) 555-1001', active: o.nickInactive ? false : true },
    { id: 'u-wes', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', cell: o.wesCell || '901-555-1002', active: true },
    { id: 'u-pat', name: 'Pat Miller', email: 'pat@grayco-cs.com', role: 'Project Manager', phone: '(901) 555-1003', active: true },
    { id: 'u-off', name: 'Office Olivia', email: 'office@grayco-cs.com', role: 'Office', active: true }]);
  setKv('projects', []); setKv('customers', []); setKv('leads', []); setKv('gc_job_messages', []); setKv('gc_office_tasks', []);
  try { WEB._test.reset(); } catch (e) {}
}
const inbox = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const staffSms = () => SMS.filter(x => [NICK, WES, PAT, '9016927255'].some(d => String(x.To).replace(/\D/g, '').endsWith(d)));
const toPh = d => SMS.filter(x => String(x.To).replace(/\D/g, '').endsWith(d));
const tasks = () => { let v = getKv('gc_office_tasks'); return Array.isArray(v) ? v : []; };
const held = () => { const st = getKv('gc_sms_alerts_state') || {}; return st.held || {}; };
const heldN = () => Object.values(held()).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
const TEST_LEAD = () => ({ id: 'LI-f7a62d7c980b59ae', title: 'Problem report — TEST LSA Wesley', source: 'Google LSA', status: 'imported', contact: { name: 'TEST LSA Wesley', phone: '(901) 692-7255' }, lsaCheck: 'good',
  leadExtra: { leadSource: 'Google LSA', lsaCheck: 'good', receivedAt: '2026-11-10T19:41:40Z' }, receivedAt: '2026-11-10T19:41:40Z' });
const raw = fs.readFileSync(path.join(HERE, 'fixtures/lsa_fwd_1118.eml'), 'utf8');
const P = parseEml(raw);
const evt = () => ({ type: 'email.received', data: { email_id: 'em_fwd1118', to: ['leads@in.grayco-cs.com'], from: 'Wesley Johnson <wjohnson@grayco-cs.com>', subject: P.headers.subject } });
const api = (tok, method, qs, body) => TX.handler({ httpMethod: method, headers: { authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' }, queryStringParameters: qs, body: body ? JSON.stringify(body) : '' }).then(r => Object.assign(JSON.parse(r.body), { __code: r.statusCode }));

(async () => {
  console.log('0. the fixture');
  ok(/ AM/.test(P.text) && /called you on 11\/18\/2026 at 8:21/.test(P.text) && /901-692-7255/.test(P.text) && /^-- $/m.test(P.text), 'the forwarded MIME decodes like the real one (U+202F before AM, his signature with his cell)', P.text.slice(0, 200));

  console.log('A. the 04:06Z forward (10:06 PM Central, Wed 11/18)');
  world({ wesCell: WES_REAL_CELL });   /* Wesley's real cell is in the people list, as in production */
  setKv('gc_lead_inbox', [TEST_LEAD()]);
  setKv('gc_call_log', { calls: [{ sid: 'CA' + 'e'.repeat(32), at: '2026-11-18T14:21:25Z', from: '9015550421', outcome: 'answered' }] });
  T = Date.parse('2026-11-19T04:06:40Z');
  RESEND_MAIL = { id: 'em_fwd1118', from: P.headers.from, to: ['leads@in.grayco-cs.com'], subject: P.headers.subject, text: P.text, html: P.html, created_at: '2026-11-19T04:06:36Z', message_id: P.headers['message-id'], headers: P.headers };
  let r = await BI._test.processEvent(evt());
  const lead = inbox().find(x => x.id !== 'LI-f7a62d7c980b59ae');
  ok(r.status === 200 && r.body.inbox === 'leads' && r.body.action === 'added' && !!lead, 'LSAFWD: a NEW lead — before: "merged" into the 11/10 TEST lead (Wesley\'s cell from his signature)', r.body);
  ok(lead && (lead.contact || {}).phone === '(901) 555-0421' && !/692/.test(JSON.stringify(lead.contact)), 'the caller\'s number is the office call log\'s (8:21 AM call), never Wesley\'s own cell', lead && lead.contact);
  ok(lead && lead.leadExtra.lsaCall === true && lead.leadExtra.lsaCallAt === '2026-11-18T14:21:00.000Z' && lead.source === 'Google LSA' && /c\.gle\/AGSJxQzKDEMOviewdetails1118/.test(lead.leadExtra.lsaLink), 'a Google LSA call lead: Google\'s call time 8:21 AM Central, its "View Details" link', lead && lead.leadExtra);
  const test1 = inbox().find(x => x.id === 'LI-f7a62d7c980b59ae');
  ok(!(test1.leadExtra || {}).lsaRepeats && !JSON.stringify(test1.notes || '').includes('Same Google LSA lead again'), 'the TEST lead is untouched');
  ok(staffSms().length === 0 && heldN() === 2, 'LSAHOLD: 10:06 PM → no text yet; held for Wesley and Nick', { sms: staffSms().map(x => x.Body), held: held() });
  const code = SA._lsaCode(lead.id);
  const hb = Object.values(held()).map(l => l[0] && l[0].body);
  ok(hb.every(b => b && b.includes(code) && /\(901\) 555-0421/.test(b) && /Called 8:21 AM/.test(b) && /#leads&lead=/.test(b)), 'the held text has the code, the number, the call time and the lead link', hb);
  const tk = tasks().find(x => x.id === 'LSAIN_' + lead.id);
  ok(tk && tk.kind === 'lsa_intake' && !tk.done && /Google call — fill in the lead/.test(tk.label) && (tk.assignees || []).includes('office'), 'LSAINTAKE: the office To-Do "📞 Google call — fill in the lead" is there at once', tk);
  r = await BI._test.processEvent(evt());
  ok(inbox().length === 2 && heldN() === 2, 'the same e-mail again (Resend retry) → still one lead, nothing more held', { n: inbox().length, r: r.body });

  console.log('B. 7:00 AM');
  T = Date.parse('2026-11-19T12:55:00Z'); let f = await SA.flushHeld();
  ok(staffSms().length === 0 && heldN() === 2, '6:55 AM Central → nothing yet', { f, sms: staffSms().map(x => x.Body) });
  T = Date.parse('2026-11-19T13:00:30Z'); f = await SA.flushHeld();
  ok(toPh(WES).length === 0 && toPh('9016927255').length === 1 && toPh(NICK).length === 1 && heldN() === 0, '7:00 AM → one text each to Wesley and Nick', { f, sms: SMS.map(x => [x.To, x.Body]) });
  ok(SMS.every(x => x.Body.includes(code) && /\(901\) 555-0421/.test(x.Body)), '… with the code and the caller\'s number', SMS.map(x => x.Body));
  f = await SA.flushHeld(); ok(SMS.length === 2, 'a second run sends nothing');
  r = await SA.staffInbound(NICK, 'GOOD ' + code + ' Pat', 'SMg1');
  ok(r && r.lsa === lead.id && r.good === true, 'Nick can answer GOOD <code> <PM> to the 7 AM text', r);

  /* two overnight leads → one bundled text */
  world(); T = Date.parse('2026-11-20T03:30:00Z');   /* Thu 9:30 PM Central */
  const L1 = { id: 'LI-b1', title: 'Google LSA call', source: 'Google LSA', contact: { name: 'Pat Smith', phone: '(901) 555-0211' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, lsaCallAt: '2026-11-20T03:29:00Z' } };
  const L2 = { id: 'LI-b2', title: 'Website lead', source: 'Website (grayco-cs.com)', websiteLead: true, contact: { name: 'Jo Doe', phone: '(901) 555-0212' }, leadExtra: {} };
  setKv('gc_lead_inbox', [L1, L2]);
  await SA.leads([L1], { 'LI-b1': L1 }, () => false); T += 60e3; await SA.leads([L2], { 'LI-b2': L2 }, () => false);
  ok(staffSms().length === 0 && heldN() === 4, 'a Google call + a website lead at 9:30 PM → both held', { held: held(), sms: staffSms().map(x => x.Body) });
  T = Date.parse('2026-11-20T13:01:00Z'); f = await SA.flushHeld();
  const bw = toPh(WES), bn = toPh(NICK);
  ok(bw.length === 1 && bn.length === 1 && /2 leads came in after hours/.test(bw[0].Body) && bw[0].Body.includes(SA._lsaCode('LI-b1')) && bw[0].Body.includes(SA._lsaCode('LI-b2')) && /BAD [A-Z0-9]{4}, GOOD [A-Z0-9]{4} Pat/.test(bw[0].Body), 'LSAHOLD: 7 AM → ONE bundled text each, both codes, one reply answers both', bw.map(x => x.Body));
  r = await SA.staffInbound(WES, 'BAD ' + SA._lsaCode('LI-b1') + ' spam, GOOD ' + SA._lsaCode('LI-b2') + ' Pat', 'SMb1');
  ok(r && r.multi && r.results && r.results.length === 2, 'the several-lead reply works on the bundled text', r);

  /* a Saturday call waits for Monday 7 AM */
  world(); T = Date.parse('2026-11-21T16:00:00Z');   /* Sat 10 AM Central: closed */
  const L3 = { id: 'LI-sat', title: 'Google LSA call', source: 'Google LSA', contact: { name: 'Sam Sat', phone: '(901) 555-0213' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true } };
  setKv('gc_lead_inbox', [L3]); await SA.leads([L3], { 'LI-sat': L3 }, () => false);
  T = Date.parse('2026-11-22T13:30:00Z'); await SA.flushHeld();   /* Sunday 7:30 AM: still closed */
  ok(staffSms().length === 0 && heldN() === 2, 'a Saturday Google call → held through Sunday', staffSms().map(x => x.Body));
  T = Date.parse('2026-11-23T13:00:10Z'); await SA.flushHeld();   /* Monday 7:00 AM */
  ok(toPh(WES).length === 1 && toPh(NICK).length === 1, '… sent Monday 7:00 AM');

  /* an emergency after hours → at once */
  world(); T = Date.parse('2026-11-20T04:00:00Z');
  const L4 = { id: 'LI-em', title: 'Google LSA call', source: 'Google LSA', emergency: true, contact: { name: 'Erin Em', phone: '(901) 555-0214' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true }, scope: 'water pouring through the ceiling' };
  setKv('gc_lead_inbox', [L4]); await SA.leads([L4], { 'LI-em': L4 }, () => true);
  ok(toPh(WES).length === 1 && toPh(NICK).length === 1 && /^🚨/.test(toPh(WES)[0].Body) && heldN() === 0, 'an emergency at 10 PM → texted at once (🚨)', staffSms().map(x => x.Body));

  /* the switch OFF → Google texts go at once at night (as LSA247 did); other leads still wait */
  world(); setAuto('lsa_hold_7am', false); T = Date.parse('2026-11-20T04:10:00Z');
  setKv('gc_lead_inbox', [L1, L2]); await SA.leads([L1], { 'LI-b1': L1 }, () => false); await SA.leads([L2], { 'LI-b2': L2 }, () => false);
  ok(toPh(WES).length === 1 && toPh(NICK).length === 1 && /Google LSA call/.test(toPh(WES)[0].Body) && heldN() === 2, '⚡ "LSA after-hours: hold to 7 AM" OFF → the Google call texts at once; the website lead still waits', { sms: staffSms().map(x => x.Body), held: heldN() });
  setAuto('lsa_hold_7am', true);
  ok(AUTO.defaults().lsa_hold_7am === true, 'the switch is ON by default');

  console.log('C. in hours: straight to the phones, then one follow-up');
  world(); T = Date.parse('2026-11-19T16:05:00Z');   /* Thu 10:05 AM Central */
  const L5 = { id: 'LI-day', title: 'Google LSA caller (10:04 AM)', source: 'Google LSA', contact: { name: 'Google LSA caller (10:04 AM)', phone: '' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, lsaCallAt: '2026-11-19T16:04:00Z', receivedAt: '2026-11-19T16:05:00Z' }, receivedAt: '2026-11-19T16:05:00Z' };
  setKv('gc_lead_inbox', [L5]);
  let out = await SA.leads([L5], { 'LI-day': L5 }, () => false);
  const c5 = SA._lsaCode('LI-day');
  ok(toPh(WES).length === 1 && toPh(NICK).length === 1 && /Called 10:04 AM/.test(toPh(WES)[0].Body) && toPh(WES)[0].Body.includes(c5), 'LSADIRECT: 10:05 AM → Wesley and Nick at once (no office gate), with the call time and the code', { sms: staffSms().map(x => x.Body), out });
  ok(tasks().some(x => x.id === 'LSAIN_LI-day' && !x.done) && !tasks().some(x => /^LSAVET_/.test(x.id)), 'the office intake To-Do; no LSAVET To-Do');
  SMS.length = 0;
  /* the office line's recording callback (the call / voicemail is over) → the number + the recording on the lead → one short text */
  setKv('gc_call_log', { calls: [{ sid: 'CA' + 'f'.repeat(32), at: '2026-11-19T16:04:20Z', from: '9015550555', outcome: 'missed', recs: [{ rsid: 'RE' + 'a'.repeat(32), kind: 'voicemail', dur: 41, at: '2026-11-19T16:06:00Z' }] }] });
  T = Date.parse('2026-11-19T16:07:00Z');
  const m1 = await LR.matchCalls(3);
  const fu = toPh(WES);
  ok(m1.matched === 1 && fu.length === 1 && toPh(NICK).length === 1 && /^GrayCo: [A-Z0-9]{4} .*📞 \(901\) 555-0555 · ▶ voicemail crm\.grayco-cs\.com\/#leads&lead=LI-day&rec=1/.test(fu[0].Body) && fu[0].Body.includes(c5), 'the number + the voicemail arrive later → ONE short follow-up "📞 … · ▶ voicemail …"', { m1, sms: staffSms().map(x => x.Body) });
  SMS.length = 0; await SA.lsaFollowUp('LI-day'); await LR.matchCalls(3);
  ok(staffSms().length === 0, 'nothing new → no second follow-up');
  /* a text still held at night is updated instead of a follow-up */
  world(); T = Date.parse('2026-11-20T04:20:00Z');
  const L6 = { id: 'LI-nite', title: 'Google LSA caller', source: 'Google LSA', contact: { name: 'Google LSA caller (10:19 PM)', phone: '' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, lsaCallAt: '2026-11-20T04:19:00Z' } };
  setKv('gc_lead_inbox', [L6]); await SA.leads([L6], { 'LI-nite': L6 }, () => false);
  const L6b = Object.assign({}, L6, { contact: { name: 'Google LSA caller (901) 555-0666', phone: '(901) 555-0666' } }); setKv('gc_lead_inbox', [L6b]);
  await SA.lsaFollowUp('LI-nite');
  const hb2 = Object.values(held()).map(l => l[0] && l[0].body);
  ok(staffSms().length === 0 && hb2.length === 2 && hb2.every(b => /📞 \(901\) 555-0666/.test(b)), 'at night: the held 7 AM text gets the number — nothing extra goes out', { hb2, sms: staffSms().map(x => x.Body) });
  T = Date.parse('2026-11-20T13:00:30Z'); await SA.flushHeld(); SMS.length = 0; await SA.lsaFollowUp('LI-nite');
  ok(staffSms().length === 0, '… and no follow-up after the 7 AM text (it had the number)');

  console.log('D. the office intake');
  world(); T = Date.parse('2026-11-19T17:00:00Z');
  const L7 = () => ({ id: 'LI-in1', title: 'Google LSA caller', source: 'Google LSA', status: 'new', contact: { name: 'Google LSA caller (901) 555-0777', phone: '(901) 555-0777' }, leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, lsaCallAt: '2026-11-19T16:58:00Z', receivedAt: '2026-11-19T16:59:00Z' }, receivedAt: '2026-11-19T16:59:00Z' });
  setKv('gc_lead_inbox', [L7()]); await SA.leads([L7()], { 'LI-in1': L7() }, () => false); SMS.length = 0;
  let g = await api('tok-office', 'GET', { lsaleads: '1' });
  ok(g.__code === 200 && g.items.length === 1 && g.items[0].code === SA._lsaCode('LI-in1') && g.items[0].check === 'pending' && g.items[0].phone === '9015550777', 'texts.js ?lsaleads: the office sees the Google call with its code and state', g);
  ok(g.defaultPm === 'u-nick' && (getKv('gc_lead_inbox_settings') || {}).lsaDefaultPm === 'u-nick', '⚙ Default PM for Google LSA leads = Nick (resolved by his e-mail once, stored as his user id)', { d: g.defaultPm, set: getKv('gc_lead_inbox_settings') });
  ok(g.pms.some(p => p.email === 'nthomas@grayco-cs.com') && g.pms.some(p => p.email === 'pat@grayco-cs.com') && !g.pms.some(p => p.email === 'office@grayco-cs.com'), 'the PM list: active PMs + admins (Nick), not the office', g.pms);
  g = await api('tok-pm', 'GET', { lsaleads: '1' }); ok(g.__code === 403, 'a PM cannot read it (role gate)');
  r = await api('tok-office', 'POST', { lsaintake: '1' }, { leadId: 'LI-in1', rating: 'good', desc: 'roof leak over the kitchen, 12 Oak St Bartlett, today', name: 'Kim Lee', address: '12 Oak St, Bartlett', action: 'pm', pmEmail: 'pat@grayco-cs.com' });
  const x7 = inbox().find(x => x.id === 'LI-in1');
  ok(r.__code === 200 && r.ok && r.pm === 'Pat Miller' && x7.pm === 'Pat Miller' && x7.lsaCheck === 'good' && (x7.leadExtra.intake || {}).rating === 'good' && x7.contact.name === 'Kim Lee', 'intake → "Send to PM" Pat: assigned like GOOD <code> Pat (the inbox: PM, good, the intake)', { r, x7 });
  const dec = getKv('gc_lsa_decisions') || []; ok(dec.some(d => d.id === 'LI-in1' && d.good && d.pm === 'Pat Miller'), 'gc_lsa_decisions has it (the CRM page marks the lead)', dec);
  const pt = toPh(PAT); ok(pt.length === 1 && /Google LSA lead [A-Z0-9]{4} for you/.test(pt[0].Body) && /\(901\) 555-0777/.test(pt[0].Body) && /roof leak over the kitchen/.test(pt[0].Body), 'Pat gets the lead text with the number and what they need', SMS.map(x => [x.To, x.Body]));
  ok(toPh(WES).some(x => /Office \(.*\) sent [A-Z0-9]{4} Kim Lee to PM Pat Miller/.test(x.Body)) && toPh(NICK).some(x => /to PM Pat Miller/.test(x.Body)), 'the admins get "Office sent <code> to PM Pat Miller"', staffSms().map(x => x.Body));
  ok(tasks().some(x => x.id === 'LSAIN_LI-in1' && x.done), 'the intake To-Do closes');
  /* send to admin */
  world(); T = Date.parse('2026-11-19T17:10:00Z'); setKv('gc_lead_inbox', [L7()]);
  r = await api('tok-office', 'POST', { lsaintake: '1' }, { leadId: 'LI-in1', rating: 'good', desc: 'wants a full re-roof quote', action: 'admin' });
  const ad = toPh(WES)[0];
  ok(r.ok && ad && /^GrayCo: Office: GOOD — [A-Z0-9]{4} .*wants a full re-roof quote.*sent to you to assign\. Reply GOOD [A-Z0-9]{4} <PM>/.test(ad.Body) && toPh(NICK).length === 1, '"Send to admin" → "Office: GOOD — … — sent to you to assign"', staffSms().map(x => x.Body));
  r = await SA.staffInbound(WES, 'GOOD ' + SA._lsaCode('LI-in1') + ' Pat', 'SMadm1');
  ok(r && r.good === true && inbox().find(x => x.id === 'LI-in1').pm === 'Pat Miller', 'Wesley answers GOOD <code> Pat to that text → assigned');
  /* office BAD → pending the admins */
  world(); T = Date.parse('2026-11-19T17:20:00Z'); setKv('gc_lead_inbox', [L7()]);
  r = await api('tok-office', 'POST', { lsaintake: '1' }, { leadId: 'LI-in1', rating: 'bad', desc: 'selling SEO', action: 'pm', pmEmail: 'pat@grayco-cs.com' });
  const xb = inbox().find(x => x.id === 'LI-in1');
  ok(r.ok && xb.lsaCheck === 'pm_bad' && !xb.pm && !tasks().some(t => /^LSADISPUTE_/.test(t.id)) && tasks().some(t => /^LSACHECK_/.test(t.id)), 'office 👎 → BAD pending an admin (pm_bad), not assigned, no dispute To-Do yet', { xb, t: tasks().map(t => t.id) });
  ok(toPh(WES).some(x => /Office \(.*\) says BAD for [A-Z0-9]{4}.*selling SEO.*Reply BAD [A-Z0-9]{4} to confirm/.test(x.Body)), 'the admins are asked to confirm', staffSms().map(x => x.Body));
  /* an admin assigns from the Leads page */
  world(); T = Date.parse('2026-11-19T17:30:00Z'); setKv('gc_lead_inbox', [L7()]);
  r = await api('tok-wes', 'POST', { lsaassign: '1' }, { leadId: 'LI-in1', pmEmail: 'nthomas@grayco-cs.com' });
  ok(r.ok && r.pm === 'Nick Thomas' && inbox().find(x => x.id === 'LI-in1').pm === 'Nick Thomas', 'texts.js ?lsaassign (Leads page ➡ Send to PM) = GOOD <code> Nick', r);
  /* Nick inactive → no preselection */
  world({ nickInactive: true }); g = await api('tok-office', 'GET', { lsaleads: '1' });
  ok(g.__code === 200 && g.defaultPm === '' && !g.pms.some(p => p.email === 'nthomas@grayco-cs.com'), 'Nick inactive → no default PM preselected', { d: g.defaultPm, pms: g.pms });
  world(); setKv('gc_lead_inbox_settings', { lsaDefaultPm: 'u-pat' }); g = await api('tok-office', 'GET', { lsaleads: '1' });
  ok(g.defaultPm === 'u-pat', 'an admin\'s choice in Lead settings wins');
  r = await api('tok-office', 'POST', { lsapm: '1' }, { id: 'u-nick' }); ok(r.__code === 403, 'only an admin changes the default PM');
  r = await api('tok-wes', 'POST', { lsapm: '1' }, { id: 'u-nick' }); ok(r.ok && (getKv('gc_lead_inbox_settings') || {}).lsaDefaultPm === 'u-nick', 'an admin sets it');

  console.log(fail ? 'FAILED ' + pass + '/' + (pass + fail) : 'LSAFWD ' + pass + '/' + pass);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
