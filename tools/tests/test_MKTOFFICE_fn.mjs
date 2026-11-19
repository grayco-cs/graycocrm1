// test_MKTOFFICE_fn.mjs <build-dir> — patch MKTOFFICE, server side (node; made-up data, every dependency swapped — nothing is sent).
//   A. _lib/mmmsg.js (soc.js mmmsg_*): an admin → the Marketing Manager (the marketing ROLE: gc_staff profile 'marketing' +
//      mkt_active): stored in his thread, a text to the cell on his CRM people record (his e-mail is outside @grayco-cs.com — the
//      staff push cannot reach him, the answer says so), throttled 5 min, a retried id never twice, customer phones masked in the
//      text, held in quiet hours and sent after (a 🚨 message goes at once), STOP respected; no cell → "in the CRM only";
//      he sees only his own thread; he replies → the admins who wrote him get the JOBMSG push + staff text; a PM is refused.
//   B. _lib/calllead.js (soc.js mm_call_lead): the Marketing Manager's phone call → a NEW Lead Inbox item, source "Phone call",
//      howHeard / mkChannel kept, nothing sent; "How did you hear?" is required (Did not ask = '').
//   C. _lib/mktmath.js: each "How did you hear?" answer of the form lands on the right Dashboard channel; a call with no answer
//      → "Phone call (source not asked)"; a "Google LSA" answer counts at once (not held for the LSA good / bad mark).
//   D. soc.js routes the ops; _lib/smsalert.js lsaIntake keeps howHeard.
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const MSG = require(path.join(build, 'netlify/functions/_lib/mmmsg.js'));
const CL = require(path.join(build, 'netlify/functions/_lib/calllead.js'));
const MM = require(path.join(build, 'netlify/functions/_lib/mktmath.js'));

/* ── the made-up world ── */
const ADMIN = 'owner1@grayco-cs.com', ADMIN2 = 'owner2@grayco-cs.com', MKT = 'mktdemo@example.net', PM = 'pmdemo@grayco-cs.com';
const KV = new Map(); let NOW = Date.parse('2026-11-19T16:00:00Z'), QUIET = false;
const SMS = [], PUSH = [], TEXT = [];
let PEOPLE = { users: [
  { id: 'u1', name: 'Owner One', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Owner Two', email: ADMIN2, role: 'Admin', active: true },
  { id: 'u3', name: 'Demo Marketing', email: MKT, role: 'Marketing Manager', cell: '(901) 555-0177', active: true },
  { id: 'u4', name: 'Demo PM', email: PM, role: 'Project Manager', active: true }],
  staff: [{ email: MKT, name: 'Demo Marketing', role: 'staff', active: false, profile: 'marketing', mkt_active: true }, { email: ADMIN, role: 'admin', active: true }, { email: PM, role: 'staff', active: true }] };
Object.assign(MSG._D, {
  now: () => NOW,
  kvGet: async k => KV.has(k) ? JSON.parse(JSON.stringify(KV.get(k))) : null,
  kvCas: async (k, f) => { const v = f(KV.has(k) ? JSON.parse(JSON.stringify(KV.get(k))) : null); if (v !== undefined) KV.set(k, v); return v; },
  people: async () => JSON.parse(JSON.stringify(PEOPLE)),
  quiet: async () => QUIET,
  optouts: async () => OPT,
  sms: async (to, body) => { SMS.push({ to, body }); return { ok: true }; },
  push: async (emails, payload) => { PUSH.push({ emails, payload }); return { to: emails.slice() }; },
  text: async o => { TEXT.push(o); return { to: o.only.slice(), sent: o.only.length }; }
});
let OPT = {};
const adminWho = { ok: true, email: ADMIN, name: 'Owner One' }, mmWho = { ok: true, email: MKT, name: 'Demo Marketing', marketing: true };

console.log('A. admin ⇄ the Marketing Manager (_lib/mmmsg.js)');
let r = await MSG.op('mmmsg_list', {}, adminWho, { admin: true });
ok(r.status === 200 && r.out.threads.length === 1 && r.out.threads[0].email === MKT && r.out.threads[0].cell === true, 'the admin\'s list: one Marketing Manager (by the marketing profile), his cell is on file', r.out);
r = await MSG.op('mmmsg_send', { text: 'Can you boost the roof ad this week? Customer at 4410 Demo Cove called (901) 555-0123.', id: 'MMtest000001' }, adminWho, { admin: true });
ok(r.status === 200 && r.out.ok && r.out.to.length === 1, 'admin sends', r.out);
const t1 = r.out.to[0];
ok(t1.texted && SMS.length === 1 && SMS[0].to === '9015550177', 'the Marketing Manager gets a text on his CRM cell', { t1, SMS });
ok(/^GrayCo: Owner \(admin\): /.test(SMS[0].body) && /crm\.grayco-cs\.com\/\?mmmsg=1$/.test(SMS[0].body) && SMS[0].body.length <= 300, 'the text: "GrayCo: Owner (admin): …" + the CRM link, ≤ 300 characters', SMS[0].body);
ok(!/555-0123/.test(SMS[0].body) && !/4410 Demo/.test(SMS[0].body), 'a customer phone / house number typed in the message is masked in the text', SMS[0].body);
ok(!t1.pushed && /not on the staff push list/.test(t1.pushWhy), 'no staff phone push for him (e-mail outside the company domain) — the answer says so', t1);
const st0 = KV.get(MSG.KEY);
ok(st0.msgs.length === 1 && st0.msgs[0].thread === MKT && st0.msgs[0].fromRole === 'admin' && /555-0123/.test(st0.msgs[0].text), 'stored in his thread (the CRM copy keeps the full text)', st0);
r = await MSG.op('mmmsg_send', { text: 'retry', id: 'MMtest000001' }, adminWho, { admin: true });
ok(r.out.dup && SMS.length === 1, 'the same message id again (a retry): not stored or texted twice', r.out);
NOW += 60e3; r = await MSG.op('mmmsg_send', { text: 'One more thing', id: 'MMtest000002' }, adminWho, { admin: true });
ok(r.out.to[0].throttled && SMS.length === 1, 'a second message within 5 minutes: in the CRM, no second text', r.out);
NOW += 6 * 60e3; r = await MSG.op('mmmsg_send', { text: 'Third', id: 'MMtest000003' }, adminWho, { admin: true });
ok(r.out.to[0].texted && SMS.length === 2 && /^GrayCo \(\+1 more\):/.test(SMS[1].body), 'after 5 minutes: the next text says (+1 more)', SMS[1]);
/* he reads his thread */
r = await MSG.op('mmmsg_list', {}, mmWho, { marketing: true });
ok(r.status === 200 && r.out.msgs.length === 3 && r.out.unread === 3 && r.out.msgs.every(m => !('thread' in m) && !('from' in m)), 'the Marketing Manager sees his thread (3, unread), no e-mails in his answer', r.out);
r = await MSG.op('mmmsg_read', {}, mmWho, { marketing: true });
r = await MSG.op('mmmsg_list', {}, mmWho, { marketing: true });
ok(r.out.unread === 0, 'read → 0 unread');
r = await MSG.op('mmmsg_list', {}, adminWho, { admin: true });
ok(r.out.msgs[0].seen === true, 'the admin sees "seen" on his message', r.out.msgs[0]);
/* he replies → the admin who wrote him */
r = await MSG.op('mmmsg_send', { text: 'Yes — I will raise it to $40/day.', id: 'MMtest000004' }, mmWho, { marketing: true });
ok(r.status === 200 && r.out.ok, 'the Marketing Manager replies', r.out);
const lastT = TEXT[TEXT.length - 1], lastP = PUSH[PUSH.length - 1];
ok(lastT && lastT.only.length === 1 && lastT.only[0] === ADMIN && lastT.sqOnly && lastT.hold && /^Demo \(marketing\)/.test(lastT.text), 'his reply: a staff text to the admin who wrote him (JOBMSG rules: quiet hours held)', lastT);
ok(lastP && lastP.emails[0] === ADMIN && /mmmsg=/.test(lastP.payload.url), 'and a phone push to that admin', lastP);
ok(r.out.to[0].pushed && r.out.to[0].texted, 'the answer: text + phone', r.out.to);
r = await MSG.op('mmmsg_list', {}, adminWho, { admin: true });
ok(r.out.threads[0].unread === 1, 'the admin\'s list counts 1 new reply', r.out.threads);
/* quiet hours */
QUIET = true; NOW += 10 * 60e3; const n0 = SMS.length;
r = await MSG.op('mmmsg_send', { text: 'Tomorrow: the photo shoot', id: 'MMtest000005' }, adminWho, { admin: true });
ok(r.out.to[0].held && SMS.length === n0, 'inside the staff quiet hours: no text now (held)', r.out.to);
NOW += 10 * 60e3; r = await MSG.op('mmmsg_send', { text: '🚨 The ad is spending 10x — pause it', id: 'MMtest000006' }, adminWho, { admin: true });
ok(r.out.to[0].texted && SMS.length === n0 + 1, 'a 🚨 message goes at once, quiet hours or not', r.out.to);
QUIET = false; NOW += 3 * 3600e3;
await MSG.op('mmmsg_list', {}, adminWho, { admin: true });
ok(SMS.length === n0 + 2 && /photo shoot/.test(SMS[SMS.length - 1].body), 'after the quiet hours, the held text goes with the next call', SMS[SMS.length - 1]);
/* opt-out, no cell */
OPT = { '9015550177': true }; NOW += 10 * 60e3;
r = await MSG.op('mmmsg_send', { text: 'opt-out check', id: 'MMtest000007' }, adminWho, { admin: true });
ok(r.out.to[0].optout && SMS.length === n0 + 2, 'he texted STOP: no text (in the CRM only)', r.out.to);
OPT = {}; PEOPLE.users[2].cell = ''; NOW += 10 * 60e3;
r = await MSG.op('mmmsg_send', { text: 'no cell check', id: 'MMtest000008' }, adminWho, { admin: true });
ok(r.out.to[0].noPhone && !r.out.to[0].texted, 'no cell on his CRM record: in the CRM only, the answer says so', r.out.to);
PEOPLE.users[2].cell = '(901) 555-0177';
r = await MSG.op('mmmsg_list', {}, { ok: true, email: PM, name: 'Demo PM' }, {});
ok(r.status === 403, 'a PM is refused');
r = await MSG.op('mmmsg_send', { text: 'x' }, { ok: true, email: 'someone@example.org', name: 'X', marketing: true }, { marketing: true });
ok(r.status === 200 && KV.get(MSG.KEY).msgs.filter(m => m.thread === 'someone@example.org').length === 1 && KV.get(MSG.KEY).msgs.filter(m => m.thread === MKT).length === 8, 'another marketing sign-in writes only to its own thread', null);

console.log('B. the Marketing Manager\'s phone call lead (_lib/calllead.js)');
const INBOX = []; CL._D.kvCas = async (k, f) => { const v = f(INBOX.slice()); if (v !== undefined) { INBOX.length = 0; v.forEach(x => INBOX.push(x)); } return v; };
let c = await CL.add({ name: 'Pat Caller', phone: '901-555-0142', need: 'kitchen remodel', service: 'Remodel / renovation', type: 'Residential Reno', companyId: 'construction', address: '1 Demo St', howHeard: 'Nextdoor', mkChannel: 'Nextdoor' }, mmWho);
ok(c.ok && /^LEADIN-CALL/.test(c.leadId) && INBOX.length === 1, 'filed in the Lead Inbox (the CRM imports it as LEADIN-…)', c);
const it = INBOX[0];
ok(it.status === 'new' && it.source === 'Phone call' && it.origin === 'phone' && it.leadExtra.howHeard === 'Nextdoor' && it.leadExtra.mkChannel === 'Nextdoor' && it.leadExtra.sourceChannel === 'phone' && it.contact.phone === '(901) 555-0142', 'source "Phone call", howHeard, the channel, the caller\'s number', it);
c = await CL.add({ name: 'No Answer' }, mmWho);
ok(!c.ok && /How did you hear/.test(c.error), '"How did you hear?" is required (Did not ask is an answer)', c);
c = await CL.add({ name: 'Did Not Ask', howHeard: '' }, mmWho);
ok(c.ok && !('howHeard' in INBOX[1].leadExtra), '"Did not ask" → no howHeard (the Dashboard: Phone call, source not asked)', INBOX[1].leadExtra);

console.log('C. the Dashboard channel of each answer (_lib/mktmath.js)');
/* Marketing's normalizer (patch MK) from index.html */
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const mk = /function normSource\(v\)\{[\s\S]*?\n\}/.exec(html.slice(html.indexOf("var CHANNELS = ['Google Ads'")));
const pre = html.slice(html.indexOf("var CHANNELS = ['Google Ads'"), html.indexOf('function normSource(v){'));
const norm = new Function(pre.replace(/^/, '') + '\nfunction s(v){ return v == null ? "" : String(v).trim(); } function low(v){ return s(v).toLowerCase(); }\n' + mk[0] + '\nreturn normSource;')();
const EXP = { 'Google search': 'Google organic', 'Google LSA': 'Google LSA', 'Google Maps / Business Profile': 'Google Business Profile', 'Facebook / Instagram': 'Facebook/Instagram Ads', 'Website': 'Website', 'Referral': 'Referral',
  'Repeat customer': 'Repeat customer', 'Yard sign / truck': 'Yard sign', 'Angi': 'Angi/HomeAdvisor', 'HomeAdvisor': 'Angi/HomeAdvisor', 'Nextdoor': 'Nextdoor', 'Yelp': 'Other', 'Thumbtack': 'Thumbtack', 'Billboard on I-40': 'Other' };
const got = {}; Object.keys(EXP).forEach(k => { got[k] = MM.channelOf(k, norm); });
ok(Object.keys(EXP).every(k => got[k] === EXP[k]), 'every answer → its channel (with Marketing\'s normalizer)', got);
const now = MM.ctDay(NOW), lead = (id, o) => Object.assign({ id, name: 'Caller ' + id, source: 'Phone call', leadSource: 'Phone call', sourceChannel: 'phone', origin: 'phone', type: 'Residential Reno', stage: 'New Lead', createdAt: new Date(NOW).toISOString(), phone: '(901) 555-01' + id.slice(-2) }, o);
const R = MM.compute({ now, normSource: norm, leads: [lead('C01', { howHeard: 'Google search' }), lead('C02', { howHeard: '' }), lead('C03', { howHeard: 'Google LSA' }), lead('C04', { howHeard: 'Referral', referredBy: 'A Neighbor' }), lead('C05', { howHeard: 'Nextdoor' }), lead('C06', { howHeard: 'Facebook / Instagram', type: 'Build-out', sector: 'Commercial' })] });
const ch = Object.fromEntries(R.channels.map(c2 => [c2.channel, c2.thisMonth]));
ok(ch['Google organic'] === 1 && ch['Phone call (source not asked)'] === 1 && ch['Google LSA'] === 1 && ch['Referral'] === 1 && ch['Nextdoor'] === 1 && ch['Facebook/Instagram Ads'] === 1, 'the Dashboard counts each logged call under its channel this month', ch);
ok(R.lsa.leads === 0 && !(R.excluded.lsaWait), 'a "Google LSA" answer on a phone call counts now (it is not an LSA-tracked lead waiting for a mark)', { lsa: R.lsa.leads, ex: R.excluded });
ok(R.totals.thisMonth === 6 && !R.bids.n, 'all 6 are marketing leads (a commercial build-out caller is not a bid)', { t: R.totals.thisMonth, bids: R.bids.n });

console.log('D. wiring');
const soc = fs.readFileSync(path.join(build, 'netlify/functions/soc.js'), 'utf8');
ok(/mmmsg_[\s\S]*_lib\/mmmsg\.js'\)\.op\(op, body, who, \{ marketing: true \}\)/.test(soc) && /if \(!admin\) return reply\(403, headers, \{ ok: false, error: 'Messages to marketing: admins\.' \}\)/.test(soc) && /mm_call_lead/.test(soc), 'soc.js: the Marketing Manager (his thread, redacted), admins only on the staff side, mm_call_lead');
const sa = fs.readFileSync(path.join(build, 'netlify/functions/_lib/smsalert.js'), 'utf8');
ok(/const heard = clip\(d\.howHeard, 60\)/.test(sa) && /heard about us: ' \+ heard/.test(sa), 'smsalert lsaIntake keeps the office\'s "How did you hear?" (intake + note)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
