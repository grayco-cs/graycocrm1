// test_BADWHY_fn.mjs [worktree] — patch BADWHY (owner 11/26: "when we comment bad lead for lsa we can type bad, didnt want to schedule
// appointment or whatever reason and marketing or office sees that when they qualify the lead"), the server side. Node only; the fake cloud
// and made-up people of test_LSAFLOW2_fn.mjs (Supabase REST in memory, Twilio recorded, never sent).
//   the PM's 👎 with a reason in the app → the reason on the Lead Inbox item with who and when (+ gc_lsa_decisions), the office's
//   "⚖️ Bad lead per …" To-Do and marketing's To-Dos (the LSAMKT "call came in" one, and the LSABADMKT dispute one of the ladder) say
//   "Reason (paste into Google's dispute form): …"; 📞 Google calls (?lsaleads) lists the reason, who and when; a BAD by text too;
//   no text to a customer.
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
  if (/^https:\/\/c\.gle\//.test(String(url))) return new Response('', { status: 302, headers: { location: String(url).replace('https://c.gle/', 'https://ads.google.com/lsa/') } });   /* LSAACCT: Google's short link → the lead's page */
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
    { id: 'u-est', name: 'Eddie Est', email: EM.est, role: 'Estimator', cell: EST, active: true },
    { id: 'u-mkt', name: 'Mia Marketing', email: 'mia@grayco-cs.com', role: 'Marketing Manager', active: true }]);
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

(async () => {
  console.log('1. the PM taps 👎 and picks "Didn\'t want to schedule an appointment"');
  world(); T = DAY;
  const L1 = lead('LI-w1', 0, { pm: 'Pat Miller', pmEmail: EM.pat, lsaCheck: 'good' }); L1.leadExtra.lsaCheck = 'good';
  setKv('gc_lead_inbox', [L1]);
  setKv('gc_office_tasks', [{ id: 'LSAMKT_LI-w1', kind: 'lsa_mkt', leadId: 'LI-w1', assignees: ['mia@grayco-cs.com'], label: '📞 Google LSA call came in X: Cus Tomer0', note: 'For marketing: a Google Local Services call just came in.', done: false }]);
  const WHY = "Didn't want to schedule an appointment";
  let r = await api('tok-pat', 'POST', { lsamark: '1' }, { leadId: 'LEADIN-w1', verdict: 'bad', reason: WHY });
  ok(r.__code === 200 && r.ok, 'Pat 👎 with the reason → saved', r);
  const x = item('LI-w1');
  ok(x.lsaCheck === 'bad' && x.lsaReason === WHY && x.lsaReasonBy === 'Pat Miller' && x.lsaReasonByEmail === EM.pat && x.lsaReasonAt === iso(T), 'on the lead: the reason, who (Pat Miller) and when', { r: x.lsaReason, by: x.lsaReasonBy, at: x.lsaReasonAt });
  ok(x.leadExtra && x.leadExtra.badReason && x.leadExtra.badReason.text === WHY && x.leadExtra.badReason.by === 'Pat Miller', '…and in leadExtra.badReason', x.leadExtra && x.leadExtra.badReason);
  const row = (getKv('gc_lsa_decisions') || []).find(d => d.id === 'LI-w1');
  ok(row && row.reason === WHY && row.by === 'Pat Miller' && row.at, 'gc_lsa_decisions carries it to every CRM page (reason, by, at)', row);
  const td = task('LSADISPUTE_LI-w1');
  ok(td && td.label.indexOf('"' + WHY + '"') > 0 && td.note.indexOf('Reason (paste into Google\'s dispute form): "' + WHY + '" — Pat Miller') === 0 && td.badReason === WHY && td.badBy === 'Pat Miller', 'the office\'s dispute To-Do: the reason in the title and first in the note, ready to paste', td);
  const mk = task('LSAMKT_LI-w1');
  ok(mk && /^👎 BAD: Didn't want to schedule an appointment · 📞 Google LSA call came in/.test(mk.label) && mk.note.indexOf('Reason (paste into Google\'s dispute form): "' + WHY + '"') === 0 && mk.badReason === WHY && !mk.done, 'marketing\'s "call came in" To-Do shows the reason too', mk);
  console.log('2. the ladder reaches marketing → their dispute To-Do has the reason');
  for (let i = 0; i < 4 && !task('LSABADMKT_LI-w1'); i++) { T += 3600e3 + 1000; await SA.lsaEscTick(); }
  const bm = task('LSABADMKT_LI-w1');
  ok(bm && bm.label.indexOf(WHY) > 0 && bm.note.indexOf('Reason (paste into Google\'s dispute form): "' + WHY + '" — Pat Miller') === 0 && bm.badReason === WHY && (bm.assignees || []).includes('mia@grayco-cs.com'), 'LSABADMKT (marketing, by role): the reason first, ready to paste', bm || tasks().map(t => t.id));
  console.log('3. 📞 Google calls (the office / owners qualify there)');
  const g = await api('tok-off', 'GET', { lsaleads: '1' });
  const it = (g.items || []).find(y => y.id === 'LI-w1');
  ok(g.__code === 200 && it && it.reason === WHY && it.reasonBy === 'Pat Miller' && it.reasonAt === x.lsaReasonAt, 'the list gives the reason, who and when', it);
  console.log('4. a BAD by text keeps the reason the same way');
  world(); T = DAY;
  const L2 = lead('LI-w2', 1); await arrive(L2);
  const c2 = SA._lsaCode('LI-w2');
  await txt(O1, 'GOOD ' + c2 + ' Pat'); T += 600e3;
  await txt(PAT, 'BAD ' + c2 + ' price shopping only');
  const x2 = item('LI-w2');
  ok(x2.lsaCheck === 'bad' && /price shopping only/i.test(x2.lsaReason) && x2.lsaReasonBy === 'Pat Miller' && x2.lsaReasonAt, 'text "BAD <code> price shopping only" → reason, who and when', { r: x2.lsaReason, by: x2.lsaReasonBy, at: x2.lsaReasonAt });
  ok(/Reason \(paste into Google's dispute form\): "price shopping only"/i.test((task('LSADISPUTE_LI-w2') || {}).note || ''), '…and the office To-Do has it to paste', task('LSADISPUTE_LI-w2'));
  ok(custSms().every(x => /A project manager will reach out to you shortly\.$/.test(x.Body)) && !custSms().some(x => /bad|reason|price shopping/i.test(x.Body)), 'the customer never hears about the BAD or its reason (only the existing "a PM will reach out shortly" from the GOOD assignment)', custSms());
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
