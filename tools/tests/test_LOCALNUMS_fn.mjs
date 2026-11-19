// test_LOCALNUMS_fn.mjs — patch LOCALNUMS: local text numbers (owner 11/19: "more Twilio numbers for Mississippi area codes and Arkansas
// area codes so the right text number texts them, and then those texts route to our cell phones").
// Offline: Supabase REST (in-memory gc_kv), Twilio and Resend are fakes; made-up people, jobs and 555 numbers only; nothing leaves
// this computer and no real text is sent. Covers: area-code picking, the fallback, the per-customer sticky number, an inbound text on a
// local number relayed to the right cells "via (662)" (+ a PM's reply going back on the same local number), STOP / consent across
// numbers, the admin endpoint (admins only, numbers only), the "Sending from" answer, and that nothing texts a customer by itself.
// Usage: node tools/tests/test_LOCALNUMS_fn.mjs [worktree]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(HERE, '../..');
const SRC = path.join(ROOT, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'wes.test@grayco-cs.com,nick.test@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok-test', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'CUST_QUIET_OFF', 'PORTAL_MAIL_OFF', 'TWILIO_FROM_ALERTS', 'TWILIO_FROM_SUBS', 'TWILIO_FROM_CUSTOMERS', 'TWILIO_LOCAL_NUMBERS', 'SMS_ALERTS_OFF'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }

/* ── the fake clock: Wednesday 2026-11-18 10:00 Central (business hours, not customer quiet hours) ── */
const realNow = Date.now;
let NOW = Date.parse('2026-11-18T16:00:00Z');
Date.now = () => NOW;

/* ── the fake cloud ── */
const KV = new Map(), SMS = [], MAIL = [];
let tick = 0;
const stamp = () => new Date(realNow() + (++tick)).toISOString();
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: stamp() });
const getKv = k => { let v = (KV.get(k) || {}).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  if (u.host === 'sb.test') {
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') return J(200, []);
    if (u.pathname === '/rest/v1/gc_kv') {
      const kq = u.searchParams.get('key') || '';
      if (m === 'GET') {
        if (kq.startsWith('in.(')) { const keys = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return J(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k).value, updated_at: KV.get(k).updated_at }))); }
        const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r.value, updated_at: r.updated_at }] : []);
      }
      const body = JSON.parse(init.body || '{}'), key = kq.replace(/^eq\./, '');
      if (m === 'PATCH') { const r = KV.get(key), uat = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || (uat && r.updated_at !== uat)) return J(200, []); KV.set(key, { value: body.value, updated_at: body.updated_at || stamp() }); return J(200, [{ key }]); }
      if (m === 'POST') { const rows = Array.isArray(body) ? body : [body]; rows.forEach(b => KV.set(b.key, { value: b.value, updated_at: stamp() })); return J(201, null); }
    }
    return J(200, []);
  }
  if (u.host === 'api.twilio.com') { SMS.push(Object.assign({ at: NOW }, Object.fromEntries(new URLSearchParams(init.body)))); return J(201, { sid: 'SM' + SMS.length }); }
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
require(path.join(SRC, '_lib/pause.js')).install();
const AUTO = require(path.join(SRC, '_lib/automations.js'));
{ const _on = AUTO.isOn; AUTO.isOn = async function(k, o){ return k === 'staff_text_alerts' ? true : _on.call(AUTO, k, o); }; }   /* the staff cell alerts are on; every customer automation keeps its own default */
const LN = require(path.join(SRC, '_lib/localnums.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
const TX = require(path.join(SRC, 'texts.js'));
const SA = require(path.join(SRC, '_lib/smsalert.js'));
const BI = require(path.join(SRC, 'bid-inbox.js'));
const fs = require('fs');

const MS_NUM = '6625550101', AR_NUM = '8705550102', TN_NUM = '7315550103', MAIN = '9015550000';
const USERS = [
  { id: 'u1', name: 'Wes Owner', email: 'wes.test@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, cell: '9015550100' },
  { id: 'u2', name: 'Nick Owner', email: 'nick.test@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, cell: '9015550101' },
  { id: 'u3', name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true, cell: '9015550111' },
  { id: 'u4', name: 'Other Pm', email: 'other.test@grayco-cs.com', role: 'Project Manager', active: true, cell: '9015550122' }];
const PM = { email: 'steven.test@grayco-cs.com', role: 'pm', name: 'Steven Park', ok: true };
const ADMIN = { email: 'wes.test@grayco-cs.com', role: 'admin', name: 'Wes Owner', admin: true, ok: true };
const CUST_MS = '6625551234', CUST_AR = '8705552345', CUST_TX = '2145553456', CUST_TN901 = '9015554567', SUB_MS = '6625559999';
function world(o){
  o = o || {};
  KV.clear(); SMS.length = 0; MAIL.length = 0;
  setKv('users', USERS);
  setKv('projects', [
    { id: 'PJ1', name: 'Oxford Reroof', pm: 'Steven Park', client: 'Molly Sample', clientPhone: CUST_MS },
    { id: 'PJ2', name: 'Jonesboro Siding', pm: 'Steven Park', client: 'Art Sample', clientPhone: CUST_AR },
    { id: 'PJ3', name: 'Dallas Gutter', pm: 'Steven Park', client: 'Tex Sample', clientPhone: CUST_TX },
    { id: 'PJ4', name: 'Memphis Deck', pm: 'Other Pm', client: 'Tina Sample', clientPhone: CUST_TN901 },
    { id: 'PJ5', name: 'No Text Job', pm: 'Steven Park', client: 'Ned Sample', clientPhone: '6625557777', smsConsent: { status: 'no', at: '2026-11-01T00:00:00Z', via: 'contract', phone: '6625557777' } }]);
  setKv('subs', [{ id: 'S1', company: 'Hernando Roofing Sub', phone: SUB_MS }]);
  setKv('customers', []); setKv('leads', []); setKv('vendors', []); setKv('schedule', []); setKv('gc_job_messages', '[]'); setKv('gc_office_tasks', '[]');
  setKv('gc_automation_pause', { on: false });
  /* 📱 Text alerts: the owners get every customer text, each PM the texts on their own jobs (the existing relay rules) */
  setKv(SA.KEY, { at: '2026-11-01T00:00:00Z', by: 'wes.test@grayco-cs.com', people: {
    'wes.test@grayco-cs.com': { on: true, cust: 'all', qOff: true }, 'nick.test@grayco-cs.com': { on: true, cust: 'all', qOff: true },
    'steven.test@grayco-cs.com': { on: true, cust: 'mine', qOff: true }, 'other.test@grayco-cs.com': { on: true, cust: 'mine', qOff: true } } });
  if (o.local !== false) setKv(LN.KEY, { list: [
    { state: 'MS', codes: ['662', '601', '769', '228'], number: MS_NUM, label: 'North MS' },
    { state: 'AR', codes: ['870', '501', '479'], number: AR_NUM, label: 'Arkansas' }] });
  try { require(path.join(SRC, '_lib/pause.js')).reset(); } catch (e) {}
}
const toCust = n => SMS.filter(x => x.To === '+1' + n);
const isNotice = x => /you're subscribed to job texts/.test(x.Body) && /STOP to opt out/.test(x.Body);
const send = (who, b) => TX._t.send(who, b);
let N = 0; const inbound = (from, to, body) => MC._test.inboundSms({ From: '+1' + from, To: '+1' + to, Body: body, MessageSid: 'SMin' + (++N) });
/* sign-in for the endpoint checks (the real one asks Supabase Auth) */
let WHO = ADMIN; BI._test.staffAuth = async () => WHO;
const call = async (method, qs, body) => { const r = await TX.handler({ httpMethod: method, queryStringParameters: qs, headers: { authorization: 'Bearer t', origin: 'https://crm.grayco-cs.com' }, body: body ? JSON.stringify(body) : '' }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { code: r.statusCode, j }; };

console.log('— picking a number (pure) —');
{
  const list = LN.clean([{ state: 'ms', codes: '662, 601 / 769', number: '+1 (662) 555-0101', label: 'North MS <b>' }, { state: 'AR', codes: ['870', '501', '479', '12', 'abc'], number: AR_NUM }, { state: 'XX', codes: ['999'], number: '123' }, { state: 'MS', codes: ['228'], number: MS_NUM }]);
  ok(list.length === 2 && list[0].state === 'MS' && list[0].number === MS_NUM && list[0].codes.join() === '662,601,769' && list[0].label === 'North MS b' && list[1].codes.join() === '870,501,479', 'clean: state upper-cased, area codes from "662, 601 / 769", bad codes / numbers dropped, a number only once, no markup in the label', list);
  const P = (ph, o) => LN.pick(ph, Object.assign({ list, fallback: '+1' + MAIN }, o || {}));
  ok(P(CUST_MS).from === '+1' + MS_NUM && P(CUST_MS).why === 'area', 'a 662 customer → the MS number');
  ok(P('6015550000').from === '+1' + MS_NUM && P('7695550000').from === '+1' + MS_NUM, '601 and 769 → the MS number too');
  ok(P(CUST_AR).from === '+1' + AR_NUM && P('5015550000').from === '+1' + AR_NUM && P('4795550000').from === '+1' + AR_NUM, '870 / 501 / 479 → the AR number');
  ok(P(CUST_TX).from === '+1' + MAIN && P(CUST_TX).why === 'main' && !P(CUST_TX).local, 'no match (214) → the main GrayCo number (fallback)');
  ok(P(CUST_TX, { list: [] }).from === '+1' + MAIN, 'no local numbers at all → the main number');
  ok(P(CUST_TX, { sticky: { number: MS_NUM } }).from === '+1' + MS_NUM && P(CUST_TX, { sticky: { number: MS_NUM } }).why === 'sticky', 'sticky beats the area code (a 214 customer who is on the 662 number stays on it)');
  ok(P(CUST_MS, { sticky: { number: MAIN }, ours: [MAIN] }).from === '+1' + MAIN, 'sticky on the main number (they texted it) → stays on main');
  ok(P(CUST_MS, { sticky: { number: '6625550199' }, ours: [MAIN] }).from === '+1' + MS_NUM, 'a sticky number that is no longer ours is ignored → the area code');
  const envL = LN.fromEnv(k => k === 'TWILIO_LOCAL_NUMBERS' ? JSON.stringify([{ state: 'TN', codes: ['731'], number: TN_NUM }, { state: 'MS', codes: ['662'], number: '6625550199' }]) : '');
  ok(envL.length === 2 && envL[0].number === TN_NUM, 'TWILIO_LOCAL_NUMBERS (JSON array) is read', envL);
  const envO = LN.fromEnv(k => k === 'TWILIO_LOCAL_NUMBERS' ? '{"AR":{"codes":"870","number":"8705550177"}}' : '');
  ok(envO.length === 1 && envO[0].state === 'AR' && envO[0].codes[0] === '870', 'TWILIO_LOCAL_NUMBERS as { "AR": { codes, number } } is read', envO);
  ok(LN.fromEnv(k => k === 'TWILIO_LOCAL_NUMBERS' ? 'not json' : '').length === 0, 'bad JSON in Netlify → no local numbers (not an error)');
  const merged = LN.list(list, k => k === 'TWILIO_LOCAL_NUMBERS' ? JSON.stringify([{ state: 'TN', codes: ['731'], number: TN_NUM }, { state: 'MS', codes: ['662'], number: MS_NUM }]) : '');
  ok(merged.length === 3 && merged[2].number === TN_NUM && merged[2].src === 'netlify' && merged[0].src === 'crm', 'the admin list first; Netlify adds the numbers that are not on it', merged);
  ok(LN.pick('6625551111', { list: LN.list([], k => k === 'TWILIO_LOCAL_NUMBERS' ? JSON.stringify([{ state: 'MS', codes: ['662'], number: MS_NUM }]) : ''), fallback: MAIN }).from === '+1' + MS_NUM, 'Netlify fallback alone (no admin list) picks too');
  ok(LN.label({ number: MS_NUM, local: { state: 'MS', label: 'North MS' }, why: 'area' }) === 'Sending from (662) 555-0101 · MS North MS local number' && /main GrayCo number/.test(LN.label({ number: MAIN, why: 'main' })) && LN.via(MS_NUM) === '(662)', 'the label and "via (662)"');
  const big = {}; for (let i = 0; i < 5100; i++) big['90155' + String(10000 + i).slice(-5)] = { number: MS_NUM, at: new Date(NOW - i * 1000).toISOString() };
  big.old = { number: MS_NUM, at: '2024-01-01T00:00:00Z' };
  const pr = LN.pruneSticky(big, NOW);
  ok(Object.keys(pr).length === 5000 && !pr.old, 'the sticky map stays small (older than a year dropped, 5000 newest kept)');
}

console.log('— a person texts a customer from the CRM (📱 Text them / templates / the PM\'s texts) —');
world();
{
  let r = await send(PM, { to: CUST_MS, text: 'Crew is on the way', pid: 'PJ1' });
  ok(r.code === 200 && toCust(CUST_MS).length === 1 && toCust(CUST_MS)[0].From === '+1' + MS_NUM, '662 customer → sent From the MS local number', { r: r.body, sms: SMS });
  ok(r.body.message && r.body.message.smsFromNum === MS_NUM && r.body.message.viaLocal === '(662)', 'the Job Message records the number it went out on', r.body.message);
  ok((getKv(LN.STICKY_KEY) || {})[CUST_MS] && getKv(LN.STICKY_KEY)[CUST_MS].number === MS_NUM, 'sticky: the customer is now on the MS number', getKv(LN.STICKY_KEY));
  r = await send(PM, { to: CUST_AR, text: 'Siding delivered', pid: 'PJ2' });
  ok(r.code === 200 && toCust(CUST_AR)[0].From === '+1' + AR_NUM, '870 customer → the AR number');
  r = await send(PM, { to: CUST_TX, text: 'Gutter guards tomorrow', pid: 'PJ3' });
  ok(r.code === 200 && toCust(CUST_TX)[0].From === '+1' + MAIN, '214 customer (no local number) → the main GrayCo number');
  ok(!(getKv(LN.STICKY_KEY) || {})[CUST_TX], 'a main-number fallback is not made sticky (they move to a local number once one is added)');
  r = await send(PM, { to: SUB_MS, text: 'Can you start Monday?' });
  ok(r.code === 200 && toCust(SUB_MS)[0].From === '+1' + MAIN, 'a sub with a 662 phone keeps the subs / main number (not the local one)', toCust(SUB_MS));
  r = await send(ADMIN, { to: '9015550111', text: 'call me' });
  ok(r.code === 200 && toCust('9015550111')[0].From === '+1' + MAIN, 'a text to a staff cell is not a customer text → the main number');
  /* sticky: the MS entry stops listing 662 (e.g. a second MS number for 662 later) — Molly stays on the number she knows */
  setKv(LN.KEY, { list: [{ state: 'MS', codes: ['601'], number: MS_NUM }, { state: 'MS', codes: ['662'], number: '6625550202' }, { state: 'AR', codes: ['870'], number: AR_NUM }] });
  SMS.length = 0;
  r = await send(PM, { to: CUST_MS, text: 'Second note', pid: 'PJ1' });
  ok(r.code === 200 && toCust(CUST_MS)[0].From === '+1' + MS_NUM, 'sticky: once texted from a number, the customer keeps getting that number', toCust(CUST_MS));
  r = await send(PM, { to: '6625558888', text: 'Hello new 662' });
  ok(toCust('6625558888')[0].From === '+16625550202', '…while a new 662 customer gets the new 662 number');
  /* the number is removed from the list → the sticky one is ignored */
  setKv(LN.KEY, { list: [{ state: 'AR', codes: ['870'], number: AR_NUM }] });
  SMS.length = 0;
  r = await send(PM, { to: CUST_MS, text: 'Third note', pid: 'PJ1' });
  ok(toCust(CUST_MS)[0].From === '+1' + MAIN, 'the MS number removed → back to the main number (a number no longer ours is never used)');
}

console.log('— Netlify TWILIO_LOCAL_NUMBERS fallback —');
world({ local: false });
{
  process.env.TWILIO_LOCAL_NUMBERS = JSON.stringify([{ state: 'AR', codes: ['870', '501', '479'], number: AR_NUM }]);
  const r = await send(PM, { to: CUST_AR, text: 'From Netlify', pid: 'PJ2' });
  ok(r.code === 200 && toCust(CUST_AR)[0].From === '+1' + AR_NUM, 'no admin list → the Netlify list picks the AR number');
  delete process.env.TWILIO_LOCAL_NUMBERS;
}

console.log('— a reply to a local number: same webhook, matched to the job, relayed to the right cells "via (662)" —');
world();
{
  const r = await inbound(CUST_MS, MS_NUM, 'Is the crew still coming today?');
  const jm = (getKv('gc_job_messages') || []).find(m => m.dir === 'in' && m.smsFrom === CUST_MS);
  ok(jm && jm.pid === 'PJ1' && jm.smsTo === MS_NUM && jm.viaLocal === '(662)' && /via \(662\)/.test(jm.authorName), 'on the job thread (Oxford Reroof), marked "via (662)"', jm);
  const cells = SMS.filter(x => /^\+1901555/.test(x.To) && /text from/.test(x.Body));
  const to = cells.map(x => x.To).sort();
  ok(JSON.stringify(to) === JSON.stringify(['+19015550100', '+19015550101', '+19015550111']), 'relayed to the job\'s PM and both owners (per the 📱 Text alerts rules) — not the other PM', cells.map(x => [x.To, x.Body.slice(0, 80)]));
  ok(cells.every(x => /text from Molly Sample \(662\) 555-1234 via \(662\)/.test(x.Body)), 'each cell text says "via (662)"', cells.map(x => x.Body));
  ok(cells.every(x => x.From === '+1' + MAIN), 'the staff alerts come from the GrayCo alerts / main number (not the customer\'s local one)');
  /* the one carrier-required "you're subscribed … Reply STOP" notice to someone who texted us first is the existing SMSCONSENT behaviour
     (the same on the main number); it goes out on the number they texted. Nothing else goes to the customer. */
  const custGot = toCust(CUST_MS);
  ok(custGot.every(x => isNotice(x)) && custGot.length <= 1, 'NOCUSTTEXT: no automatic text to the customer (only the existing one-time STOP/HELP subscription notice)', custGot);
  ok(custGot.every(x => x.From === '+1' + MS_NUM), '…and that notice answers from the 662 number they texted, not the main one', custGot);
  ok(r.route && r.route.via === '(662)' && (getKv(LN.STICKY_KEY) || {})[CUST_MS].number === MS_NUM, 'sticky: the customer texted the 662 number', r.route);
  /* the PM answers from his cell within 30 minutes → it goes to the customer FROM the 662 number */
  const pr = await SA.staffInbound('9015550111', 'Yes, by 2 PM', 'SMpm1');
  const back = toCust(CUST_MS).filter(x => !isNotice(x));
  ok(pr && pr.replied && back.length === 1 && back[0].From === '+1' + MS_NUM && /Yes, by 2 PM/.test(back[0].Body), 'the PM\'s reply from his cell goes back to the customer on the same 662 number', { pr, back });
  /* a 214 customer who texts the MS number is answered from it next time */
  SMS.length = 0;
  await inbound(CUST_TX, MS_NUM, 'question about my gutters');
  const s2 = await send(PM, { to: CUST_TX, text: 'Answering you', pid: 'PJ3' });
  ok(s2.code === 200 && toCust(CUST_TX)[0].From === '+1' + MS_NUM, 'a customer who texted a local number is answered from that number (sticky beats area code)', toCust(CUST_TX));
  /* the main number still works the same */
  SMS.length = 0;
  await inbound(CUST_TN901, MAIN, 'hi from memphis');
  const c2 = SMS.filter(x => /text from Tina/.test(x.Body));
  ok(c2.length && c2.every(x => !/via \(/.test(x.Body)) && c2.map(x => x.To).sort().join() === '+19015550100,+19015550101,+19015550122', 'a text to the main number: no "via", relayed to that job\'s PM and the owners as before', c2.map(x => [x.To, x.Body]));
}

console.log('— STOP and consent are per customer, across every number —');
world();
{
  let r = await inbound(CUST_MS, MS_NUM, 'STOP');
  ok(r.optout && getKv(MC._test.KS).optout[CUST_MS], 'STOP to the 662 number opts the customer out');
  SMS.length = 0;
  r = await send(PM, { to: CUST_MS, text: 'still there?', pid: 'PJ1' });
  ok(r.code === 409 && toCust(CUST_MS).length === 0, '…and no number can text them (the 662, the main, any)', r.body);
  SMS.length = 0;
  r = await inbound(CUST_MS, MAIN, 'START');
  ok(r.optin && !getKv(MC._test.KS).optout[CUST_MS], 'START on the main number undoes it for every number');
  r = await send(PM, { to: CUST_MS, text: 'welcome back', pid: 'PJ1' });
  ok(r.code === 200 && toCust(CUST_MS).length === 1, 'texting works again after START');
  /* STOP on the main number blocks the local one too */
  await inbound(CUST_AR, MAIN, 'stop');
  SMS.length = 0;
  r = await send(PM, { to: CUST_AR, text: 'siding?', pid: 'PJ2' });
  ok(r.code === 409 && toCust(CUST_AR).length === 0, 'STOP to the main number also blocks the AR local number');
  /* a customer who declined texts on the contract: refused whatever number would be used */
  r = await send(PM, { to: '6625557777', text: 'hi', pid: 'PJ5' });
  ok(r.code === 409 && toCust('6625557777').length === 0 && /declined/i.test(r.body.error), 'declined on the contract → refused (the 662 number does not get around consent)', r.body);
  /* the relayed PM reply respects STOP across numbers too */
  world(); await inbound(CUST_MS, MS_NUM, 'call me'); await inbound(CUST_MS, MAIN, 'STOP'); SMS.length = 0;
  const pr = await SA.staffInbound('9015550111', 'ok calling', 'SMpm2');
  ok(toCust(CUST_MS).length === 0 && pr && /STOP/.test(pr.notSent || ''), 'a PM\'s cell reply to a customer who texted STOP (on another number) is not sent', pr);
}

console.log('— the admin endpoint, "Sending from", and no automatic customer texts —');
world({ local: false });
{
  WHO = PM;
  let r = await call('GET', { localnums: '1' });
  ok(r.code === 403, 'a PM cannot open 📱 Local text numbers (admins only, by role)');
  r = await call('POST', { localnums: '1' }, { list: [{ state: 'MS', codes: ['662'], number: MS_NUM }] });
  ok(r.code === 403 && !getKv(LN.KEY), '…or save it');
  WHO = ADMIN;
  r = await call('POST', { localnums: '1' }, { list: [{ state: 'MS', codes: '662, 601, 769, 228', number: '(662) 555-0101', label: 'North MS', token: 'should-not-be-kept', sid: 'ACnope' }, { state: 'AR', codes: '870 501 479', number: AR_NUM }] });
  const saved = getKv(LN.KEY);
  ok(r.code === 200 && saved.list.length === 2 && saved.list[0].codes.join() === '662,601,769,228' && saved.by === 'wes.test@grayco-cs.com', 'an admin saves MS 662/601/769/228 and AR 870/501/479', saved);
  ok(!/should-not-be-kept|ACnope|tok-test/.test(JSON.stringify(saved)) && Object.keys(saved.list[0]).sort().join() === 'codes,label,number,state', 'only { state, codes, number, label } are stored — no key, token or SID', saved.list[0]);
  ok(/sender pool/.test(r.j.a2p) && /missed-call\?event=sms/.test(r.j.webhook) && r.j.main === '(901) 555-0000', 'the answer carries the A2P 10DLC sender-pool note and the webhook to copy', { a2p: r.j.a2p, hook: r.j.webhook });
  ok(!/tok-test|ACtest/.test(JSON.stringify(r.j)), 'the answer never has the Twilio SID or token');
  r = await call('POST', { localnums: '1' }, { list: [{ state: 'MS', codes: '', number: MS_NUM }] });
  ok(r.code === 400 && /area code/.test(r.j.error), 'a number with no area code is refused');
  WHO = PM;
  r = await call('GET', { fromfor: '1', to: '(662) 555-1234' });
  ok(r.code === 200 && r.j.number === '(662) 555-0101' && r.j.local && r.j.state === 'MS' && /^Sending from \(662\) 555-0101/.test(r.j.label), '"Sending from (662) 555-0101 · MS North MS local number" for a 662 customer (any staff member)', r.j);
  r = await call('GET', { fromfor: '1', to: CUST_TX });
  ok(r.j.number === '(901) 555-0000' && !r.j.local && /main GrayCo number/.test(r.j.label), '…the main number for a 214 customer', r.j);
  r = await call('GET', { fromfor: '1', to: SUB_MS });
  ok(r.j.number === '(901) 555-0000' && !r.j.local, '…the subs / main number for a sub');
  ok(SMS.length === 0 && !getKv(LN.STICKY_KEY), 'saving the list and asking "Sending from" texts nobody and changes no customer');
  /* nothing texts customers on its own: a new number on the list, then a day of inbound texts, sends no customer text */
  for (const [from, to] of [[CUST_MS, MS_NUM], [CUST_AR, AR_NUM], ['6015550001', MS_NUM]]) await inbound(from, to, 'hello there');
  const custTexts = SMS.filter(x => !/^\+1901555/.test(x.To) && !isNotice(x));
  ok(custTexts.length === 0, 'NOCUSTTEXT: inbound texts on the local numbers → staff cells only, never an automatic text to a customer', custTexts);
  const staffT = SMS.filter(x => /^\+1901555/.test(x.To));
  ok(staffT.length > 0 && staffT.every(x => x.From === '+1' + MAIN), '…(the cells were told, from the main number)', staffT.length);
  ok(SMS.filter(isNotice).every(x => x.From === (x.To === '+1' + CUST_AR ? '+1' + AR_NUM : '+1' + MS_NUM)), '…the subscription notices answer from the number each one texted');
}

console.log('— source checks —');
{
  const lib = fs.readFileSync(path.join(SRC, '_lib/localnums.js'), 'utf8'), tx = fs.readFileSync(path.join(SRC, 'texts.js'), 'utf8');
  ok(!/fetch\(|Messages\.json|sendSms/.test(lib), 'localnums.js never sends anything (it only picks a From)');
  ok(/if \(!who\.admin\) return J\(403, \{ ok: false, error: 'Only an admin can change the local text numbers\.' \}/.test(tx), 'the admin endpoint is gated by role (who.admin), not by names');
  const os = require(path.join(SRC, 'owner-setup.js'));
  os._test.D.kvGet = async k => k === LN.KEY ? { list: [{ state: 'MS', codes: ['662'], number: MS_NUM }, { state: 'AR', codes: ['870'], number: AR_NUM }] } : null;
  os._test.D.sb = async () => ({ ok: false, status: 404, json: async () => null }); os._test.D.fetch = async () => ({ ok: false, status: 404 });
  let c = await os._test.checks();
  ok(c.local_numbers === true, 'Owner setup ticks "📱 Add local text numbers" once an MS and an AR number are saved');
  os._test.D.kvGet = async k => k === LN.KEY ? { list: [{ state: 'MS', codes: ['662'], number: MS_NUM }] } : null;
  c = await os._test.checks();
  ok(c.local_numbers === false, '…not with MS only');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
