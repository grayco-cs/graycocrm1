// test_LSAFLOW2_fn.mjs [worktree] — LSAFLOW2 + OWNERROLE (owner 11/19): the Google LSA lead flow, end to end on the server. Node only;
// everything is mocked (Supabase REST: an in-memory gc_kv, gc_lead_inbox_kv missing → gc_kv; Twilio: recorded, never sent). Made-up
// people, numbers and links. No OWNER_EMAILS: Owner 1 / Owner 2 come from the people list by role (the earliest-created admins).
//   0. OWNERROLE: Owner 1 / Owner 2 by role; Admin → Team roles (?owners) saves them by user id (admins only); the default PM = Owner 2
//   1. a Google call → the owners' GrayCo text (lead details + code, "GOOD <code> <PM>"); the office is never asked to assign
//   2. assign by text "GOOD <code> Pat" → Pat's GrayCo text: name, 📞 number, job type, ▶ recording, notes, the CRM link, "Reply BAD …"
//   3. Pat replies "BAD <code> <reason>" → BAD at once: Pat gets the Google dispute link, both owners "<PM> says BAD for <code> <name>:
//      <reason>. Dispute in Google: <link>", the office a To-Do "Bad lead per <PM> — confirm and dispute by <date>"
//   4. "Disputed in Google ✓" (Pat in the app) closes it for everyone; an owner's "DISPUTED <code>" after that changes nothing
//   5. assign in the CRM → Pat's text; Pat's 👎 in the app → the same three; the office's ✓ Disputed closes the To-Do
//   6. LEADWATCH: the PM must reply — no reply → the reply ladder (office after 1 h …) and the 48-hour alert; his 👍 → "GOOD lead … mark it
//      qualified in Google" to the PM + the owners (Google link + tap link); QUALIFIED <code> closes it
//   7. LEADWATCH: Google's 48 hours — not qualified with < 8 h left (no PM / BAD not disputed / GOOD not marked in Google) → the owners at once
//      (after hours too) + the office To-Do, once; disputed / good + qualified / young → none
//   8. who may: another staff member cannot mark Pat's lead; Pat's ?lsamine lists his own leads only
//   9. staff quiet hours: Pat's text at 10 PM waits for 7 AM; an emergency goes at once
//  10. no text to a customer anywhere
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WT = path.resolve(process.argv[2] || path.join(HERE, '../..'));
const SRC = path.join(WT, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok-lsaflow2', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com', CUST_QUIET_OFF: '1' });
['OWNER_EMAILS', 'ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'EMERG_OFF', 'ONCALL_OFF', 'LEAD_INTAKE_ALERTS', 'SMS_ALERTS_OFF', 'TWILIO_FROM_ALERTS', 'WEBSITE_AUTO_REPLY', 'LSA_DEFAULT_PM_EMAIL', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 1400) : '')); } }

const KV = new Map(), SMS = [], CALLS = [];
const EM = { o1: 'ann.owner@grayco-cs.com', o2: 'ben.owner@grayco-cs.com', pat: 'pat@grayco-cs.com', off: 'olive@grayco-cs.com', est: 'eddie@grayco-cs.com' };
const USERS_BY_TOKEN = { 'tok-o1': EM.o1, 'tok-o2': EM.o2, 'tok-pat': EM.pat, 'tok-off': EM.off, 'tok-est': EM.est };
const STAFF = { [EM.o1]: ['admin', 'Ann Owner'], [EM.o2]: ['admin', 'Ben Owner'], [EM.off]: ['office', 'Olive Office'], [EM.pat]: ['Project Manager', 'Pat Miller'], [EM.est]: ['Estimator', 'Eddie Est'] };
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => { const v = (KV.get(k) || {}).value; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const t = String((init.headers || {}).Authorization || '').replace(/^Bearer\s+/, ''); const e = USERS_BY_TOKEN[t]; return e ? J(200, { email: e }) : J(401, {}); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').replace(/^eq\./, ''); const row = x => ({ email: x, role: STAFF[x][0], active: true, name: STAFF[x][1] }); return J(200, e ? (STAFF[e] ? [row(e)] : []) : Object.keys(STAFF).map(row)); }
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
  if (u.host === 'api.resend.com') return J(200, { id: 'm1' });
  return J(404, {});
};
const AUTO = require(path.join(SRC, '_lib/automations.js'));
const AUTO_ON = Object.assign(AUTO.defaults(), { staff_text_alerts: true });   /* the real defaults: NOCUSTTEXT (no customer texts) and LSAHOLD on */
AUTO._t.setStore({ get: async k => k === AUTO.KEY ? AUTO_ON : null, put: async () => true });
const SA = require(path.join(SRC, '_lib/smsalert.js'));
const TX = require(path.join(SRC, 'texts.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
const BA = require(path.join(SRC, '_lib/bid-alerts.js'));
let T = Date.now(); const clock = () => T;
SA._D.now = clock; MC._now = clock;

const O1 = '9015552001', O2 = '9015552002', PAT = '9015552003', OFF = '9015552004', EST = '9015552005';
const CUST = ['9015557001', '9015557002', '9015557003', '9015557004', '9015557005', '9015557006', '9015557007', '9015557008'];
function world(){
  KV.clear(); SMS.length = 0; CALLS.length = 0;
  setKv('users', [
    { id: 'u-pat', name: 'Pat Miller', email: EM.pat, role: 'Project Manager', cell: PAT, active: true, createdAt: '2022-01-01T12:00:00Z' },
    { id: 'u-ben', name: 'Ben Owner', email: EM.o2, role: 'Admin', cell: O2, active: true, createdAt: '2020-06-01T12:00:00Z' },
    { id: 'u-ann', name: 'Ann Owner', email: EM.o1, role: 'Admin', cell: O1, active: true, createdAt: '2019-01-01T12:00:00Z' },
    { id: 'u-off', name: 'Olive Office', email: EM.off, role: 'Office', cell: OFF, active: true },
    { id: 'u-est', name: 'Eddie Est', email: EM.est, role: 'Estimator', cell: EST, active: true }]);
  setKv('projects', []); setKv('customers', []); setKv('leads', []); setKv('gc_job_messages', []); setKv('gc_office_tasks', []);
}
const DAY = Date.parse('2026-11-19T16:00:00Z');   /* Thu 10:00 AM Central — open */
const iso = ms => new Date(ms).toISOString();
const lead = (id, n, o) => Object.assign({ id, title: 'Google LSA call', source: 'Google LSA', status: 'new', contact: { name: 'Cus Tomer' + n, phone: '(901) 555-' + CUST[n].slice(-4) },
  leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, lsaCallAt: iso(T - 120e3), receivedAt: iso(T - 60e3), lsaJob: 'Roofing — roof repair', lsaLink: 'https://c.gle/DEMOLINK' + n,
    callRecs: [{ rsid: 'RE' + String(n).repeat(32).slice(0, 32).replace(/[^0-9a-f]/g, 'a'), kind: 'call', dur: 95 }] }, receivedAt: iso(T - 60e3) }, o || {});
const inbox = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const item = id => inbox().find(x => x.id === id) || {};
const toPh = d => SMS.filter(x => String(x.To).replace(/\D/g, '').endsWith(d));
const tasks = () => { const v = getKv('gc_office_tasks'); return Array.isArray(v) ? v : []; };
const task = id => tasks().find(x => x.id === id);
const custSms = () => SMS.filter(x => CUST.some(c => String(x.To).replace(/\D/g, '').endsWith(c)));
const api = (tok, method, qs, body) => TX.handler({ httpMethod: method, headers: { authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' }, queryStringParameters: qs, body: body ? JSON.stringify(body) : '' }).then(r => Object.assign(JSON.parse(r.body), { __code: r.statusCode }));
let sid = 0; const txt = (ph, body) => SA.staffInbound(ph, body, 'SMF' + (++sid));
async function arrive(L, em){ const all = inbox().concat([L]); setKv('gc_lead_inbox', all); return SA.leads([L], { [L.id]: L }, () => !!em); }
const ALL_CUST = [];

(async () => {
  console.log('0. Owner 1 / Owner 2 by role');
  world(); T = DAY;
  let own = await SA.loadOwners();
  ok(own.map(o => o.slot + ':' + o.name).join() === '1:Ann Owner,2:Ben Owner', 'no setting → Owner 1 = the earliest-created admin, Owner 2 = the next (not the order of the list)', own);
  let g = await api('tok-o1', 'GET', { owners: '1' });
  ok(g.__code === 200 && g.owners.length === 2 && g.admins.length === 2 && !g.saved, 'Admin → Team roles: ?owners lists the admins and the owners now', g);
  ok((await api('tok-off', 'GET', { owners: '1' })).__code === 403 && (await api('tok-pat', 'POST', { owners: '1' }, { owner1: 'u-ben' })).__code === 403, 'only an admin reads / sets them');
  g = await api('tok-o1', 'POST', { owners: '1' }, { owner1: 'u-ben', owner2: 'u-ann' });
  ok(g.owners.map(o => o.slot + ':' + o.name).join() === '1:Ben Owner,2:Ann Owner' && getKv('gc_owner_roles').owner1 === 'u-ben', 'saved by user id → swapped', g);
  g = await api('tok-o1', 'POST', { owners: '1' }, { owner1: 'u-pat', owner2: '' });
  ok(g.owners.map(o => o.slot + ':' + o.name).join() === '1:Ann Owner,2:Ben Owner' && getKv('gc_owner_roles').owner1 === '', 'a non-admin cannot be an owner (falls back to the role default)', g);
  g = await api('tok-off', 'GET', { lsaleads: '1' });
  ok(g.__code === 200 && g.defaultPm === 'u-ben' && (g.owners || []).map(o => o.name).join() === 'Ann Owner,Ben Owner', 'the default PM for Google leads = Owner 2 (by role, not stored)', { d: g.defaultPm, o: g.owners, set: getKv('gc_lead_inbox_settings') });

  console.log('1. a Google call → the owners\' text');
  world(); T = DAY;
  const L1 = lead('LI-f1', 0); const c1 = SA._lsaCode('LI-f1');
  await arrive(L1);
  ok(toPh(O1).length === 1 && toPh(O2).length === 1 && toPh(PAT).length === 0 && toPh(OFF).length === 0, 'Owner 1 and Owner 2 get it (by role), nobody else', SMS.map(x => [x.To, x.Body]));
  const b0 = toPh(O1)[0].Body;
  ok(b0.includes(c1) && /\(901\) 555-7001/.test(b0) && /Roofing — roof repair/.test(b0) && /▶ crm\.grayco-cs\.com\/#leads&lead=LI-f1&rec=1/.test(b0) && new RegExp('GOOD ' + c1 + ' Pat = PM Pat').test(b0), 'the text: number, job type, ▶ recording, code, "GOOD <code> <PM>"', b0);
  ok(task('LSAIN_LI-f1') && task('LSAIN_LI-f1').prio !== 'high' && /optional/.test(task('LSAIN_LI-f1').label), 'the office gets an optional notes To-Do (not required, not high)', task('LSAIN_LI-f1'));

  console.log('2. assign by text → the PM\'s GrayCo text');
  SMS.length = 0;
  let r = await txt(O1, 'GOOD ' + c1 + ' Pat needs it before the rain');
  ok(r && r.good && r.pm === 'Pat Miller' && item('LI-f1').pm === 'Pat Miller' && item('LI-f1').lsaCheck === 'good', 'GOOD <code> Pat → Pat is the PM', { r, x: item('LI-f1') });
  const pt = toPh(PAT);
  ok(pt.length === 1, 'Pat gets ONE text (the assignment notice does not double it)', pt.map(x => x.Body));
  const pb = pt[0] ? pt[0].Body : '';
  ok(new RegExp('^GrayCo: Google LSA lead ' + c1 + ' for you from Ann: Cus Tomer0 📞 \\(901\\) 555-7001 · Roofing — roof repair ▶ crm\\.grayco-cs\\.com/#leads&lead=LI-f1&rec=1 Notes: needs it before the rain CRM: crm\\.grayco-cs\\.com/#leads&lead=LEADIN-f1 Reply BAD ' + c1 + ' <reason> if it\'s not a real lead\\.$').test(pb), 'Pat\'s text: name, 📞 number, job type, ▶ recording, notes, CRM link, "Reply BAD <code> <reason>"', pb);
  ok(toPh(O1).some(x => /GOOD — PM Pat Miller assigned; Pat is told and the customer is told a PM will reach out shortly\./.test(x.Body)), 'Owner 1\'s confirmation: Pat is told, the customer is told a PM will reach out (CUSTTEXT2)', toPh(O1).map(x => x.Body));
  ok(custSms().length === 1 && /A project manager will reach out to you shortly\.$/.test(custSms()[0].Body) && !/Pat|555-2003/.test(custSms()[0].Body), 'CUSTTEXT2: the customer gets ONE "a PM will reach out shortly" — no PM name or number', custSms());

  console.log('3. Pat replies BAD by text');
  SMS.length = 0; T += 3600e3;
  r = await txt(PAT, 'BAD ' + c1 + ' selling solar panels');
  ok(r && r.byPm && r.good === false && item('LI-f1').lsaCheck === 'bad' && /selling solar panels/.test(item('LI-f1').lsaReason || ''), 'the lead is BAD at once (no approval step)', { r, x: item('LI-f1') });
  ok(toPh(PAT).length === 1 && new RegExp('^GrayCo: ' + c1 + ' Cus Tomer0 marked BAD \\(selling solar panels\\)\\. Dispute it in Google, pick the reason: https://c\\.gle/DEMOLINK0 ').test(toPh(PAT)[0].Body), '(a) Pat gets the Google dispute link for that lead', toPh(PAT).map(x => x.Body));
  ok([O1, O2].every(ph => !toPh(ph).length), '(b) LEADWATCH ladder: the owners are not texted at once (the PM has the link first)', SMS.map(x => [x.To, x.Body]));
  const td = task('LSADISPUTE_LI-f1');
  ok(td && !td.done && (td.assignees || []).includes('office') && /^⚖️ Bad lead per Pat Miller — confirm and dispute by 11\/21, 9:59 AM: Cus Tomer0/.test(td.label) && /https:\/\/c\.gle\/DEMOLINK0/.test(td.note), '(c) the office To-Do "Bad lead per Pat Miller — confirm and dispute by 11/21, 9:59 AM" (LEADWATCH: Google\'s 48 hours from the call)', td);
  const dec = (getKv('gc_lsa_decisions') || []).find(d => d.id === 'LI-f1');
  ok(dec && dec.good === false && dec.byEmail === EM.pat, 'gc_lsa_decisions: BAD by Pat (the CRM page marks the lead)', dec);
  ok(toPh(OFF).length === 0 && !custSms().length, 'no text to the office or the customer yet');
  /* the ladder: 1 hour → the office role; 2 hours → marketing (nobody with a cell) is skipped → the owners */
  SMS.length = 0; T += 30 * 60e3; let es = await SA.lsaEscTick();
  ok(!SMS.length, 'ladder: nothing before the hour', es);
  T += 31 * 60e3; es = await SA.lsaEscTick();
  ok(toPh(OFF).length === 1 && new RegExp('BAD lead ' + c1 + ' Cus Tomer0 \\(selling solar panels, per Pat Miller\\).*https://c\\.gle/DEMOLINK0.*DISPUTED ' + c1).test(toPh(OFF)[0].Body) && !toPh(O1).length, 'ladder step 2 (1 hour later): the office role gets the dispute link', SMS.map(x => [x.To, x.Body]));
  SMS.length = 0; T += 61 * 60e3; es = await SA.lsaEscTick();
  ok(toPh(O1).length === 1 && toPh(O2).length === 1 && /BAD lead .*https:\/\/c\.gle\/DEMOLINK0/.test(toPh(O1)[0].Body), 'ladder: marketing has nobody with a cell → the owners (an hour after the office)', { es, sms: SMS.map(x => [x.To, x.Body]) });

  console.log('4. Disputed in Google ✓ closes it for everyone');
  SMS.length = 0; T += 600e3;
  r = await api('tok-pat', 'POST', { lsamark: '1' }, { leadId: 'LEADIN-f1', verdict: 'disputed' });
  ok(r.__code === 200 && r.ok && !r.already && item('LI-f1').lsaDisputedAt && item('LI-f1').lsaDisputedBy === 'Pat Miller', 'Pat taps ✓ Disputed in Google on the lead', { r, x: item('LI-f1') });
  ok(task('LSADISPUTE_LI-f1').done && /disputed in Google by Pat Miller/.test(task('LSADISPUTE_LI-f1').resolution) && task('LSAIN_LI-f1').done, 'the office\'s To-Dos close', tasks());
  ok((getKv('gc_lsa_decisions') || []).some(d => d.id === 'LI-f1' && d.disputed && d.good === false), 'gc_lsa_decisions says disputed (every CRM page marks it)');
  ok(SMS.length === 0, 'no more texts', SMS);
  r = await txt(O2, 'DISPUTED ' + c1);
  ok(r && r.disputed && r.already && /already marked disputed in Google \(Pat Miller\)/.test((toPh(O2)[0] || {}).Body || ''), 'Owner 2 texts DISPUTED <code> later → "already disputed", nothing changes', { r, sms: SMS });

  console.log('5. assign in the CRM; Pat says BAD in the app; the office disputes');
  world(); T = DAY + 7200e3; SMS.length = 0;
  const L2 = lead('LI-f2', 1); const c2 = SA._lsaCode('LI-f2'); await arrive(L2); SMS.length = 0;
  r = await api('tok-o2', 'POST', { lsaassign: '1' }, { leadId: 'LI-f2', pmEmail: EM.pat, notes: 'gate code 1234' });
  ok(r.ok && r.pm === 'Pat Miller' && toPh(PAT).length === 1 && /for you from Ben: Cus Tomer1 📞 \(901\) 555-7002 .*Notes: gate code 1234 .*Reply BAD [A-Z0-9]{4} <reason>/.test(toPh(PAT)[0].Body), 'Owner 2 assigns Pat in the CRM → Pat\'s GrayCo text', { r, sms: SMS.map(x => [x.To, x.Body]) });
  g = await api('tok-pat', 'GET', { lsamine: '1' });
  ok(g.__code === 200 && g.items.length === 1 && g.items[0].id === 'LI-f2' && g.items[0].code === c2, 'Pat\'s ?lsamine lists his Google lead (the Leads page buttons)', g);
  SMS.length = 0;
  r = await api('tok-pat', 'POST', { lsamark: '1' }, { leadId: 'LEADIN-f2', verdict: 'bad', reason: 'wrong number, never called' });
  ok(r.__code === 200 && r.ok && item('LI-f2').lsaCheck === 'bad', 'Pat taps 👎 Bad in the app', r);
  ok(toPh(PAT).length === 1 && /marked BAD \(wrong number, never called\)\. Dispute it in Google, pick the reason: https:\/\/c\.gle\/DEMOLINK1/.test(toPh(PAT)[0].Body), '(a) Pat gets the dispute link by text', toPh(PAT).map(x => x.Body));
  ok([O1, O2].every(ph => !toPh(ph).some(x => /DEMOLINK1/.test(x.Body))), '(b) the ladder starts with Pat (the owners not at once)', SMS.map(x => [x.To, x.Body]));
  ok(task('LSADISPUTE_LI-f2') && !task('LSADISPUTE_LI-f2').done && /Bad lead per Pat Miller — confirm and dispute by/.test(task('LSADISPUTE_LI-f2').label), '(c) the office To-Do', tasks());
  SMS.length = 0;
  r = await api('tok-off', 'POST', { lsamark: '1' }, { leadId: 'LI-f2', verdict: 'disputed' });
  ok(r.ok && item('LI-f2').lsaDisputedBy === 'Olive Office' && task('LSADISPUTE_LI-f2').done && SMS.length === 0, 'the office taps ✓ Disputed → closed for everyone, no texts', { r, t: tasks() });
  r = await api('tok-o1', 'POST', { lsamark: '1' }, { leadId: 'LI-f2', verdict: 'disputed' });
  ok(r.ok && r.already && item('LI-f2').lsaDisputedBy === 'Olive Office', 'the first one to dispute wins (an owner\'s tap after that changes nothing)', r);
  SMS.length = 0; T += 3 * 3600e3; await SA.lsaEscTick();
  ok(!SMS.some(x => /DEMOLINK1/.test(x.Body)), 'disputed → the ladder stops (no more dispute texts)', SMS.map(x => [x.To, x.Body]));
  ok(custSms().every(x => /A project manager will reach out to you shortly\./.test(x.Body)), 'the customer only ever gets "a PM will reach out shortly"', custSms());

  console.log('6. LEADWATCH (owner 11/19): the PM must reply — silence is not good any more');
  world(); T = DAY; SMS.length = 0;
  const L3 = lead('LI-f3', 2); await arrive(L3); await txt(O1, 'GOOD ' + SA._lsaCode('LI-f3') + ' Pat'); SMS.length = 0;
  T = DAY + 61 * 60e3; let es6 = await SA.lsaEscTick();
  ok(toPh(OFF).some(x => /Pat Miller has not answered the lead text for/.test(x.Body)) && !toPh(O1).length, 'no reply in 1 hour → the reply ladder: the office role is told', { es6, sms: SMS.map(x => [x.To, x.Body]) });
  T = DAY + 41 * 3600e3; let a = await SA.lsaAgeCheck();
  ok(a.alerted.some(x => x.id === 'LI-f3') && !SA._lsaQualified(item('LI-f3')), 'Pat never answered → NOT good: the 48-hour alert fires (8 h left)', a);
  SMS.length = 0; T = DAY + 24 * 3600e3;   /* Fri 10 AM: in hours (the 48-hour check above ran at 2 AM Sat on the clock; the mocks keep no order) */
  r = await api('tok-pat', 'POST', { lsamark: '1' }, { leadId: 'LI-f3', verdict: 'good' });
  ok(r.ok && item('LI-f3').lsaCheck === 'good' && item('LI-f3').pm === 'Pat Miller' && item('LI-f3').pmReplyAt, 'Pat\'s 👍 Good in the app: saved, he stays the PM, it counts as his reply', { r, x: item('LI-f3') });
  ok([O1, O2].every(ph => toPh(ph).some(x => new RegExp('✅ GOOD lead: Cus Tomer2 .*mark it qualified in Google: https://c\\.gle/DEMOLINK2 .*&gq=1 or reply QUALIFIED ' + SA._lsaCode('LI-f3')).test(x.Body))) && toPh(PAT).some(x => /GOOD lead: Cus Tomer2/.test(x.Body)), 'GOOD → the owners and Pat get "GOOD lead … mark it qualified in Google" with the Google link and the tap link', SMS.map(x => [x.To, x.Body]));
  SMS.length = 0; r = await txt(O2, 'QUALIFIED ' + SA._lsaCode('LI-f3'));
  ok(r && r.qualified && item('LI-f3').lsaGoogleOkAt && SA._lsaQualified(item('LI-f3')), 'Owner 2 texts QUALIFIED <code> → marked qualified in Google (qualified now)', { r, x: item('LI-f3') });
  SMS.length = 0; T += 2 * 3600e3; await SA.lsaEscTick();
  ok(!SMS.some(x => /GOOD lead: Cus Tomer2/.test(x.Body)), 'qualified → the GOOD ladder stops', SMS.map(x => x.Body));

  console.log('6b. REPLYOFF (owner 11/24): the owners never get "has not answered"; nothing after hours');
  world(); T = DAY; SMS.length = 0;
  const L9 = lead('LI-f9', 6); await arrive(L9); await txt(O1, 'GOOD ' + SA._lsaCode('LI-f9') + ' Pat'); SMS.length = 0;
  const notAns = ph => toPh(ph).filter(x => /has not answered the lead text/.test(x.Body));
  for (let h = 1; h <= 6; h++) { T = DAY + h * 61 * 60e3; await SA.lsaEscTick(); }   /* Thu 11 AM → 4 PM, open hours: every step it can take */
  ok(notAns(OFF).length >= 1, 'REPLYOFF: the office still gets "Pat Miller has not answered" in open hours', SMS.map(x => [x.To, x.Body.slice(0, 60)]));
  ok(!notAns(O1).length && !notAns(O2).length, 'REPLYOFF: the owners never get "has not answered" (the ladder ends before them)', SMS.map(x => [x.To, x.Body.slice(0, 60)]));
  world(); T = Date.parse('2026-11-23T23:30:00Z'); SMS.length = 0;   /* Mon 5:30 PM Central — assigned just before closing */
  const L10 = lead('LI-f10', 7); await arrive(L10); await txt(O1, 'GOOD ' + SA._lsaCode('LI-f10') + ' Pat');
  SMS.length = 0; T += 61 * 60e3; let e10 = await SA.lsaEscTick(); T += 2 * 3600e3; e10 = await SA.lsaEscTick();   /* 6:31 PM, 8:31 PM: closed */
  ok(!SMS.some(x => /has not answered the lead text/.test(x.Body)), 'REPLYOFF: after hours (6:31 PM, 8:31 PM) no "has not answered" text to anyone', { e10, sms: SMS.map(x => [x.To, x.Body.slice(0, 60)]) });
  T = Date.parse('2026-11-24T13:05:00Z'); e10 = await SA.lsaEscTick();   /* Tue 7:05 AM: open again → the office step goes */
  ok(notAns(OFF).length === 1 && !notAns(O1).length && !notAns(O2).length, 'REPLYOFF: the next morning (open hours) the office step goes, not the owners', { e10, sms: SMS.map(x => [x.To, x.Body.slice(0, 60)]) });
  console.log('6c. MKTNOTEXT (owner 11/24): marketing never gets a lead text — a BAD lead is a To-Do in the CRM for marketing');
  { world(); const MKT = '9015552006', MKE = 'mia.mkt@grayco-cs.com';
    setKv('users', (getKv('users') || []).concat([{ id: 'u-mkt', name: 'Mia Marketing', email: MKE, role: 'Marketing', cell: MKT, active: true }]));
    T = DAY; SMS.length = 0;
    const LB = lead('LI-f11', 3); await arrive(LB); const cB = SA._lsaCode('LI-f11'); await txt(O1, 'GOOD ' + cB + ' Pat');
    T += 3600e3; await txt(PAT, 'BAD ' + cB + ' wrong area');
    for (let h = 1; h <= 3; h++) { T += 61 * 60e3; await SA.lsaEscTick(); }
    ok(!toPh(MKT).length, 'MKTNOTEXT: BAD lead ladder — marketing gets no text', SMS.map(x => [x.To, x.Body.slice(0, 50)]));
    const mt = task('LSABADMKT_LI-f11');
    ok(mt && !mt.done && (mt.assignees || []).includes(MKE) && /Bad Google LSA lead/.test(mt.label), 'MKTNOTEXT: marketing gets a To-Do in the CRM for the BAD lead', mt);
    ok(toPh(O1).some(x => /BAD lead/.test(x.Body)), 'the BAD ladder still reaches the owners after the office', SMS.map(x => [x.To, x.Body.slice(0, 50)]));
    const LR = lead('LI-f12', 4); await arrive(LR); await txt(O1, 'GOOD ' + SA._lsaCode('LI-f12') + ' Pat'); SMS.length = 0;
    for (let h = 1; h <= 4; h++) { T += 61 * 60e3; await SA.lsaEscTick(); }
    ok(!toPh(MKT).length && !task('LSABADMKT_LI-f12'), 'MKTNOTEXT: "has not answered" — nothing to marketing', SMS.map(x => [x.To, x.Body.slice(0, 50)]));
    SMS.length = 0; await txt(PAT, 'DISPUTED ' + cB); const mt2 = task('LSABADMKT_LI-f11');
    ok(mt2 && mt2.done, 'disputed → the marketing To-Do closes too', mt2); }
  console.log('7. Google\'s 48 hours (LEADWATCH: replaces day 25 / 30)');
  world(); SMS.length = 0;
  ok(SA.LSA_DISPUTE_WINDOW_H === 48 && SA.LSA_WARN_LEFT_H === 8, 'LSA_DISPUTE_WINDOW_H = 48, warn with 8 h left (constants)');
  const D0 = Date.parse('2026-12-15T04:00:00Z');   /* Mon 10 PM Central — after hours */
  const H1 = 3600e3, old = (id, n, hours, o) => { T = D0 - hours * H1; const L = lead(id, n, o); return L; };
  const A = old('LI-a', 3, 41), B = old('LI-b', 4, 42, { lsaCheck: 'bad', lsaReason: 'spam' }),
    C = old('LI-c', 5, 43, { lsaCheck: 'bad', lsaDisputedAt: iso(D0 - 20 * H1) }), Dd = old('LI-d', 6, 41, { lsaCheck: 'good', lsaGoogleOkAt: iso(D0 - 30 * H1) }), E = old('LI-e', 7, 20), F = old('LI-f', 0, 49);
  B.leadExtra.lsaCheck = 'bad'; C.leadExtra.lsaCheck = 'bad';
  setKv('gc_lead_inbox', [A, B, C, Dd, E, F]); T = D0;
  a = await SA.lsaAgeCheck();
  ok(a.alerted.map(x => x.id).sort().join() === 'LI-a,LI-b', 'less than 8 h of the 48 left and not qualified: no PM (A), BAD not disputed (B); disputed (C), good + qualified in Google (D), 20 h (E), past 48 h (F) → none', a);
  ok([O1, O2].every(ph => toPh(ph).length === 2) && toPh(O1).some(x => new RegExp('⏰ URGENT — Google LSA lead ' + SA._lsaCode('LI-a') + ' Cus Tomer3 .*not qualified \\(no PM yet\\) and Google\'s 48-hour window ends in about 7 h').test(x.Body)) && toPh(O1).some(x => /BAD, not disputed yet.*Dispute it: https:\/\/c\.gle\/DEMOLINK4/.test(x.Body)), 'after hours (10 PM): the owners are texted at once anyway (the urgent exception to the 7 AM hold)', SMS.map(x => [x.To, x.Body]));
  ok(task('LSA25_LI-a') && task('LSA25_LI-b') && (task('LSA25_LI-a').assignees || []).includes('office') && /qualify by .*\(48 h\)/.test(task('LSA25_LI-a').label), 'the office To-Dos', tasks());
  SMS.length = 0; T += 600e3; a = await SA.lsaAgeCheck();
  ok(!a.alerted.length && SMS.length === 0, 'once: the next run sends nothing', { a, sms: SMS });
  r = await txt(O1, 'GOOD ' + SA._lsaCode('LI-a') + ' Pat');
  ok(r && r.good && task('LSA25_LI-a').done, 'marked good → its To-Do closes', { r, t: task('LSA25_LI-a') });
  ok(/lsaAgeCheck\(\)/.test(require('fs').readFileSync(path.join(SRC, '_lib/bid-alerts.js'), 'utf8')) && /lsaEscTick\(\)/.test(require('fs').readFileSync(path.join(SRC, '_lib/bid-alerts.js'), 'utf8')), 'the 10-minute lead check (bid-alerts remind) runs the window check and the ladder');

  console.log('8. who may');
  world(); T = DAY; const L4 = lead('LI-f4', 1, { pm: 'Pat Miller', pmEmail: EM.pat, lsaCheck: 'good' }); setKv('gc_lead_inbox', [L4]);
  r = await api('tok-est', 'POST', { lsamark: '1' }, { leadId: 'LI-f4', verdict: 'bad', reason: 'x' });
  ok(r.__code === 403 && item('LI-f4').lsaCheck === 'good', 'another staff member cannot mark Pat\'s lead', r);
  g = await api('tok-est', 'GET', { lsamine: '1' }); ok(g.__code === 200 && g.items.length === 0, 'their ?lsamine is empty');

  console.log('9. quiet hours');
  world(); T = Date.parse('2026-11-20T04:00:00Z');   /* Thu 10 PM Central */
  const L5 = lead('LI-f5', 2); setKv('gc_lead_inbox', [L5]); SMS.length = 0;
  r = await api('tok-o1', 'POST', { lsaassign: '1' }, { leadId: 'LI-f5', pmEmail: EM.pat });
  ok(r.ok && toPh(PAT).length === 0, '10 PM: Pat\'s text waits (staff quiet hours)', SMS.map(x => [x.To, x.Body]));
  T = Date.parse('2026-11-20T13:00:30Z'); await SA.flushHeld();
  ok(toPh(PAT).length === 1 && /for you from Ann/.test(toPh(PAT)[0].Body), '7:00 AM: Pat gets it', SMS.map(x => [x.To, x.Body]));
  SMS.length = 0; r = await txt(PAT, 'bad ' + SA._lsaCode('LI-f5') + ' duplicate of another call');
  ok(r && r.good === false && toPh(PAT).length === 1, 'Pat can answer BAD to the 7 AM text', { r, sms: SMS });
  world(); T = Date.parse('2026-11-20T04:30:00Z');
  const L6 = lead('LI-f6', 3, { emergency: true }); setKv('gc_lead_inbox', [L6]); await SA.leads([L6], { 'LI-f6': L6 }, () => true);
  ok(toPh(O1).length === 1 && /^🚨/.test(toPh(O1)[0].Body), 'an emergency at 10:30 PM texts the owners at once', SMS.map(x => [x.To, x.Body]));
  SMS.length = 0; await txt(O1, 'GOOD ' + SA._lsaCode('LI-f6') + ' Pat');
  ok(toPh(PAT).length === 1, '… and the PM at once', SMS.map(x => [x.To, x.Body]));

  console.log('10. never a customer');
  ok(ALL_CUST.every(x => /A project manager will reach out to you shortly\./.test(x.Body) || /^Hi [^,]*, this is GrayCo Construction Services\. We received your request through Google/.test(x.Body)), 'CUSTTEXT2: the only customer texts are the qualify ask and "a PM will reach out shortly" (never a PM\'s name or number)', ALL_CUST);

  console.log(fail ? 'FAILED ' + pass + '/' + (pass + fail) : 'LSAFLOW2 ' + pass + '/' + pass);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
const _push = SMS.push.bind(SMS); SMS.push = function(p){ if (CUST.some(c => String(p.To).replace(/\D/g, '').endsWith(c))) ALL_CUST.push(p); return _push(p); };
