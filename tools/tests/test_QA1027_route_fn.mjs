// test_QA1027_route_fn.mjs <functionsDir> — QA of LEADROUTE / LEADMAIL / ALERTTO on the e-mail intake (bid-inbox.js + website-intake.js),
// offline with the STL fakes: a homeowner mail to leads@ AND bids@ is a lead; through our Google Group it is not bulk;
// a staff-forwarded lead counts; a newsletter through the group does not; the new-lead alert goes to office@ only.
// Offline: Supabase / Resend / Claude / web-push faked (wLD2/tests/fake_cloud.mjs), the clock too (BI._now).
//   STL_FN=<functions dir> node test_STL_fn.mjs
import { createRequire } from 'module'; import path from 'path';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { makeCloud, signed } = await import(SP + '/wLD2/tests/fake_cloud.mjs');
const require = createRequire(import.meta.url);
const FN = path.resolve(process.argv[2] || process.env.STL_FN || "netlify/functions");
const SECRET = 'whsec_' + Buffer.from('grayco-test-inbound-secret-123456').toString('base64');
Object.assign(process.env, { RESEND_INBOUND_SECRET: SECRET, RESEND_API_KEY: 're_test', ANTHROPIC_API_KEY: 'sk-ant-test', SUPABASE_URL: 'https://ieeonhpfahmwwecizdut.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc-key', SUPABASE_SERVICE_KEY: 'svc-key', BID_INBOX_INLINE: '1', URL: '', VAPID_PUBLIC_KEY: 'BPub', VAPID_PRIVATE_KEY: 'priv' });
const C = makeCloud();
const CRM = { leads: [], tombs: {}, users: [{ name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com' }, { name: 'Bobby Ray', email: 'bray@grayco-cs.com' }] }; C.rs = [];
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.pathname === '/rest/v1/gc_kv' && /^in\./.test(u.searchParams.get('key') || '')) {
    return new Response(JSON.stringify([{ key: 'leads', value: CRM.leads }, { key: 'gc_tombstones', value: CRM.tombs }, { key: 'users', value: CRM.users }]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.pathname === '/rest/v1/gc_kv' && u.searchParams.get('key') === 'eq.users') return new Response(JSON.stringify([{ value: CRM.users }]), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.pathname === '/rest/v1/rs_leads') return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  return C.fetch(url, opts);
};
const BI = require(path.join(FN, 'bid-inbox.js')), BA = require(path.join(FN, 'bid-alerts.js')), BD = require(path.join(FN, '_lib', 'bid-due.js'));
const WI = require(path.join(FN, 'website-intake.js'));
const pushed = []; BI._webPush = { setVapidDetails(){}, async sendNotification(sub, payload){ pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); } };
C.kv.set('gc_push_subs__wjohnson@grayco-cs.com', { key: 'gc_push_subs__wjohnson@grayco-cs.com', value: [{ endpoint: 'https://push.test/w1', keys: { p256dh: 'x', auth: 'y' } }], updated_at: new Date().toISOString() });
let NOW = Date.now(); BI._now = () => NOW;
const at = wall => { NOW = BD.wallToEpoch(wall); return NOW; };
const iso = wall => new Date(BD.wallToEpoch(wall)).toISOString();
let pass = 0, fail = 0; const out = [];
function ok(c, msg, info){ if (c) { pass++; out.push('  ok   ' + msg); } else { fail++; out.push('  FAIL ' + msg + (info !== undefined ? '  :: ' + JSON.stringify(info).slice(0, 500) : '')); } }
const strip = x => String(x || '').replace(/^\[GrayCo CRM · [^\]]+\] /, '');
const alerts = () => C.sent.filter(m => m.headers && m.headers['X-GrayCo-CRM'] === 'lead-alert');
const inbox = () => C.kvGet('gc_lead_inbox') || [];
let n = 0;
function mail(o){ const id = 'em_' + (++n); C.mails[id] = Object.assign({ id, created_at: '2026-10-21T14:00:00Z', to: ['leads@grayco-cs.com'], headers: [] }, o, { id }); return { type: 'email.received', created_at: new Date().toISOString(), data: { email_id: id, from: o.from, to: o.to || ['leads@grayco-cs.com'], subject: o.subject, attachments: [] } }; }
async function deliver(evt){ const r = await BI.handler(signed(SECRET, evt)); return { code: r.statusCode, body: JSON.parse(r.body || '{}') }; }
C.claudeAnswer = text => /Bid Invite/.test(text) ? { kind: 'invitation', leads: [{ source_board: 'BuildingConnected', project_name: 'Cordova Retail Reroof', city: 'Cordova', state: 'TN', bid_due_date: '2026-11-20', bid_due_time: '14:00', lead_type: 'commercial' }] } : { kind: 'not_a_lead', leads: [] };
const T = WI._test;
out.push('== LEADMAIL: our own Google Group is not a mailing list');
const G = [{ name: 'List-Id', value: '<leads.grayco-cs.com>' }, { name: 'List-Unsubscribe', value: '<mailto:leads+unsubscribe@grayco-cs.com>' }, { name: 'Precedence', value: 'list' }];
const H = hs => { const o = {}; hs.forEach(h => { o[h.name.toLowerCase()] = h.value; }); return o; };
ok(T.bulk({ from: { email: 'pat@example.com' }, headers: H(G) }) === false, 'a customer via leads@ group is not bulk');
ok(T.bulk({ from: { email: 'newsletter@vendor.com' }, headers: H(G) }) === true && T.bulk({ from: { email: 'pat@example.com' }, headers: { 'list-unsubscribe': '<mailto:x@shop.com>', precedence: 'bulk' } }) === true, 'a newsletter via the group still is (and a real mailing list is)');
ok(T.staffLead({ from: { email: 'sbiffle@grayco-cs.com' } }, 'Lead for you\nMary Jones 901-555-0188\nroof leak') === true, 'a GrayCo person typing a lead with a phone counts');
ok(T.staffLead({ from: { email: 'sbiffle@grayco-cs.com' } }, 'lunch at noon?') === false, 'a GrayCo chat with no customer does not');
const f = T.readForm(T.splitAddress(T.fieldsOf('Name - Mary Jones\nPhone - 901-555-0188\nAddress - 12 Elm St, Bartlett\nRoof leaks over the kitchen').b));
ok(f.name === 'Mary Jones' && /5550188|555-0188/.test(f.phone), '"Name - …" / "Phone - …" typed by hand are read', f);

out.push('== LEADROUTE: to BOTH leads@ and bids@');
at('2026-10-22T09:00');
{ const l0 = inbox().length;
  const r = await deliver(mail({ from: 'Pat Homeowner <pat.h@example.com>', to: ['leads@grayco-cs.com', 'bids@grayco-cs.com'], subject: 'Need a roof estimate', text: 'Hi, I need an estimate for a roof replacement at 44 Oak Cv, Bartlett. Call me 901-555-0177. Pat' }));
  const it = inbox().find(x => x && x.contact && x.contact.email === 'pat.h@example.com');
  ok(r.code === 200 && r.body.inbox === 'leads' && it, 'a homeowner mail to leads@ + bids@ is a lead (not dropped on the bid path)', r.body);
  const a = alerts().filter(x => /Pat|Need a roof/.test(JSON.stringify(x)));
  ok(a.length >= 1 && a.every(x => x.to.length === 1 && x.to[0] === 'office@grayco-cs.com'), 'ALERTTO: the new-lead alert goes to office@ only', a.map(x => x.to)); }
{ const r = await deliver(mail({ from: 'Estimating <bids@keystonegc.com>', to: ['bids@grayco-cs.com'], subject: 'Bid Invite: Cordova Retail Reroof', text: 'Bid Invite — Cordova Retail Reroof, bids due 11/20 2 PM' }));
  ok(r.code === 200 && r.body.inbox !== 'leads', 'a GC invitation to bids@ only stays on the bid path', r.body); }
console.log(out.join('\n') + '\n\n' + (fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
