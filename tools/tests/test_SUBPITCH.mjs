// test_SUBPITCH.mjs — patch SUBPITCH (offline; made-up contacts, mocked Supabase / Twilio / Resend — nothing leaves the machine).
// Owner 11/19 (two website-form pitches came as "GrayCo NEW LEAD" texts + an "Approval waiting: lead_first_contact" text each):
//   · a sub / supplier looking for work (a steel sub: "if you have any steel jobs coming up, we'd be glad to help") is WANTED
//     but no customer lead → Leads → 🤝 Subs & suppliers (CRM only: no text, approval or lead-watch; 📨 Invite to bid site)
//   · a sales pitch ("interested in the offer … set it up for free, then you can test it out") is blocked: no text, never in the
//     CRM's lists — only the audit log (?audit=1), from which "Not spam → make lead" still works
//   · real customers and bid invitations are unchanged; a lead's first-contact approval is never its own text (apprping)
// Usage: node tools/tests/test_SUBPITCH.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'fake-twilio-token-sp', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com', WEBSITE_ZAPIER_KEY: 'zap-test' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'LEAD_INTAKE_ALERTS', 'TWILIO_FROM_ALERTS', 'PORTAL_AUTO_EMAIL', 'WEBSITE_AUTO_REPLY'].forEach(k => delete process.env[k]);
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
const WEB = require(path.join(SRC, 'website-intake.js'));
const BI = require(path.join(SRC, 'bid-inbox.js'));
const SB = require(path.join(SRC, 'salesblock.js'));
const AP = require(path.join(SRC, '_lib/apprping.js'));
const DAY = Date.parse('2026-11-19T17:05:00Z'); const clock = () => DAY;
SG._now = clock; BI._now = clock;

/* the two messages of 11/19 (the texts cut them; the rest is a realistic ending) */
const WILSON = "Hi GrayCo Construction Services,\nFollowing up on the note we sent through your website last month. If you have any steel jobs coming up, we'd be glad to help with: structural steel, misc. metals, stairs and railings. Licensed and insured, we can send our capabilities.";
const LANE = "Hi, just checking in one more time to see if you're interested in the offer. I could set it up for free, then you can test it out, close a few projects and decide if you want to keep it.";
const SUBS = [WILSON,
  'Hello, we are a licensed drywall and framing subcontractor based in Southaven. Please add us to your bid list.',
  "If you have any concrete projects coming up we would be happy to bid them. Our crews do flatwork, footings and slabs.",
  'SUBCONTRACTOR INQUIRY. We do commercial painting and wallcovering in the Memphis area.',
  "We're a roofing supplier and distributor in Memphis — we'd be glad to quote your next commercial roof project."];
const SALES = [LANE,
  'Following up one last time — are you still interested in the offer? We will set it up at no cost so you can try it out.',
  'We help contractors like you get more leads with Google ads and SEO. Can I send you a free audit?',
  'Offer your customers financing with our contractor financing program — approvals in minutes, no fees to you. Can I send you the details?',
  'We are a staffing agency with skilled laborers ready this week. Temporary workers for your jobs at $22/hr.',
  'Our software automates your estimates and scheduling. Free trial, set it up for free today.',
  "Hi, we are a steel fabricator. If you have any jobs coming up, our SEO agency partner can get you more leads too."];
const REAL = ['I need a quote for a kitchen remodel', 'There is water in my basement after the storm, can someone come look?',
  'Hi, we are ABC Builders, a general contractor. We would like to invite you to bid on the Oak Street church renovation, bids due 12/5, plans and specs attached.',
  "I'm interested in the offer on your website for a free roof inspection — my roof is leaking in the hall.",
  'Just checking in again on my estimate from last week, any update?', 'I would like to price out a new metal roof for my shop',
  'We would love to work with you on our home addition, when can you come out?', 'this is State Farm adjuster about claim 12-3456, we are happy to help schedule the inspection'];

const inbox = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub && x.status !== 'dismissed');
const store = () => SG.cleanStore(getKv(SG.SKEY));
const listOf = k => { let v = getKv(k); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : (v && (v.list || v.v)) || []; };
const approvals = () => listOf('gc_approval_queue');
let ipN = 0;
const web = b => WEB.handler({ httpMethod: 'POST', headers: { 'x-api-key': 'zap-test', 'x-nf-client-connection-ip': '10.2.0.' + (++ipN) }, queryStringParameters: {}, body: JSON.stringify(b) });
const api = (tok, method, qs, b) => SB.handler({ httpMethod: method, headers: { authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' }, queryStringParameters: qs, body: b ? JSON.stringify(b) : '' }).then(r => Object.assign(JSON.parse(r.body), { __code: r.statusCode }));
function world(){
  KV.clear(); SMS.length = 0; CALLS.length = 0; MAIL.length = 0;
  setKv('users', [{ id: 'u1', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', phone: '(901) 555-1001', active: true }]);
  setKv('projects', []); setKv('customers', []); setKv('leads', []);
  try { WEB._test.reset(); } catch (e) {}
  SG._reset();
}
const nothingSent = () => !SMS.length && !CALLS.length && !MAIL.length && !approvals().length && !inbox().length;

(async () => {
  console.log('— 1. why the two passed, and the classifier');
  SUBS.forEach(t => { const c = SG.classify(t, {}); ok(c.kind === 'sub', 'sub / supplier: ' + t.slice(0, 60), c); });
  SALES.forEach(t => { const c = SG.classify(t, {}); ok(c.kind === 'sales', 'sales pitch: ' + t.slice(0, 60), c); });
  REAL.forEach(t => { const c = SG.classify(t, {}); ok(c.kind === '', 'a real customer / bid invite: ' + t.slice(0, 60), c); });

  console.log('— 2. website form: David Wilson (steel sub) → 🤝 Subs & suppliers, nobody texted');
  world();
  let r = await web({ type: 'estimate', name: 'David Wilson', phone: '(323) 286-0872', email: 'dwilson@example-steel.test', message: WILSON, page: 'https://grayco-cs.com/contact' });
  ok(r.statusCode === 200 && JSON.parse(r.body).received, 'the visitor sees "received"');
  ok(nothingSent(), 'no NEW LEAD text, no approval (lead_first_contact), no lead, no e-mail', { sms: SMS.map(x => x.Body), a: approvals().map(x => x.kind), i: inbox().length });
  let st = store(), it = st.list[0];
  ok(st.list.length === 1 && it.kind === 'sub' && it.status === 'sub' && !it.hidden && it.refile && st.counts.subs === 1, 'kept as a sub / supplier (status sub, visible)', it);
  let a = await api('tok-owner', 'GET', { list: '1' });
  ok(a.ok && a.subs.length === 1 && a.subs[0].name === 'David Wilson' && a.subs[0].canLead && !a.held.length, 'the CRM list shows it under subs (not held as spam)', a);
  a = await api('tok-owner', 'GET', { count: '1' }); ok(a.ok && a.subs === 1 && a.held === 0, 'the count: 1 sub, 0 to review', a);
  a = await api('tok-owner', 'POST', { act: 'notspam' }, { id: it.id });
  ok(a.ok && inbox().some(x => x.id === a.leadId), '"Actually a customer lead" → files the lead (the normal flow)', a);

  console.log('— 3. website form: Gregory Lane (sales pitch) → blocked, hidden, audit only');
  world();
  r = await web({ type: 'estimate', name: 'Gregory Lane', phone: '(478) 606-2782', email: 'glane@example.test', message: LANE, page: 'https://grayco-cs.com/contact' });
  ok(r.statusCode === 200 && nothingSent(), 'no text, no approval, no lead, no e-mail', { sms: SMS.map(x => x.Body), a: approvals().map(x => x.kind) });
  st = store(); it = st.list[0];
  ok(st.list.length === 1 && it.kind === 'sales' && it.hidden === true && st.counts.sales === 1, 'kept (never purged) as a hidden sales pitch', it);
  a = await api('tok-owner', 'GET', { list: '1' });
  ok(a.ok && !a.held.length && !a.subs.length && !a.done.length && a.hiddenN === 1 && !a.hidden, 'never in the CRM\'s lists', a);
  a = await api('tok-owner', 'GET', { list: '1', audit: '1' });
  ok(a.ok && a.hidden.length === 1 && a.hidden[0].name === 'Gregory Lane', 'the audit log (⚙ Admin → 🚫 Blocked) has it', a.hidden);

  console.log('— 4. real customers and bid invitations still flow');
  world();
  r = await web({ type: 'estimate', name: 'Mary Real', phone: '(901) 555-0111', email: 'mary@example.test', message: 'I need a quote for a kitchen remodel', city: 'Bartlett', page: 'https://grayco-cs.com/contact' });
  ok(inbox().length === 1 && approvals().some(x => x.kind === 'lead_first_contact') && !store().list.length, 'a kitchen remodel quote → a lead with its first-contact approval', { i: inbox().length, a: approvals().map(x => x.kind) });
  world();
  r = await web({ type: 'commercial', name: 'Pat GC', company: 'ABC Builders', phone: '(901) 555-0112', email: 'pat@abcbuilders.test', message: REAL[2], page: 'https://grayco-cs.com/commercial' });
  ok(inbox().length === 1 && !store().list.length, 'a GC inviting us to bid → still a lead (its own routing)', { i: inbox().map(x => x.title), s: store().list });
  world();
  setKv('gc_lead_inbox', [{ id: 'LI-sub7', status: 'new', title: 'Partner lead — Joe', contact: { name: 'Joe', phone: '901-555-0177' }, scope: SUBS[2] }]);
  r = await BI._lib.alertsApi().notifyNew([{ id: 'LI-sub7', title: 'Partner lead — Joe', source: 'Partner API', type: 'residential', contact: { name: 'Joe', phone: '901-555-0177' }, scope: SUBS[2] }]);
  ok(r.salesblock && !SMS.length && !MAIL.length && store().list.some(x => x.kind === 'sub' && x.status === 'sub' && x.leadId === 'LI-sub7') && !inbox().length, 'a sub from another lead source → no alert, off the Lead Inbox, kept under subs', { r, s: store().list });

  console.log('— 5. "Approval waiting: lead_first_contact" is never its own text');
  const items = [{ key: 'ap2:appr_web_LI-c799184c68d5838c', title: 'lead_first_contact', sub: 'Website lead — David Wilson', raw: { id: 'appr_web_LI-c799184c68d5838c', kind: 'lead_first_contact' } },
    { key: 'ap2:appr_x1', title: 'Change order', raw: { id: 'appr_x1', kind: 'change_order' } }];
  const nl = AP.noteList(items);
  ok(nl.length === 1 && nl[0].key === 'ap2:appr_x1', 'apprping skips lead_first_contact (other approvals still ping)', nl.map(x => x.key));

  console.log('— 6. patch SUBSEEK: a website "Commercial bid inquiry" from a sub (11/21 David Wilson / Swiss Drafting) — any source, old ones too');
  const SWISS = "Hi GrayCo Construction Services team,\nFollowing up on the note we sent through your website last month. If you have any steel jobs coming up, we'd be glad to help with:\n- Structural and misc. steel shop drawings (stairs, railings, platforms)\n- Steel take-offs and estimates\nJust reply to david@example-drafting.test and we'll send a price and turnaround the same day.\nThanks,\nDavid Wilson\nExample Drafting\nProject location: Brooklyn";
  world();
  r = await web({ type: 'commercial', name: 'David Wilson', company: 'Example Drafting', phone: '(323) 555-0872', email: 'david@example-drafting.test', message: SWISS, city: 'Brooklyn', page: 'https://grayco-cs.com/contact' });
  ok(r.statusCode === 200 && nothingSent() && store().list.some(x => x.kind === 'sub' && x.status === 'sub'), 'the website commercial form → 🤝 Subs & suppliers, no lead, nobody texted', { sms: SMS.map(x => x.Body), i: inbox().map(x => x.title), s: store().list });
  world();
  const LIW = { id: 'LI-sw1', status: 'new', title: 'Commercial bid inquiry — Example Drafting — Brooklyn', type: 'commercial', source: 'Website (grayco-cs.com)', contact: { name: 'David Wilson', phone: '(323) 555-0872', email: 'david@example-drafting.test' }, leadExtra: { said: { message: SWISS, company: 'Example Drafting' }, websiteLead: true, websiteForm: 'Commercial bid inquiry' } };
  setKv('gc_lead_inbox', [LIW]);
  r = await BI._lib.alertsApi().notifyNew([LIW]);
  ok(r.salesblock && !SMS.length && !inbox().length && store().list.some(x => x.kind === 'sub' && x.leadId === 'LI-sw1'), 'notifyNew re-check: a commercial-type website lead is no longer skipped as a "bid" — a sub is taken off', { r, s: store().list, i: inbox() });
  world();
  setKv('gc_lead_inbox', [{ id: 'LI-gc1', status: 'new', title: 'ABC Builders', type: 'commercial', source: 'Website (grayco-cs.com)', contact: { name: 'Pat GC', phone: '(901) 555-0112' }, scope: REAL[2] }]);
  r = await BI._lib.alertsApi().notifyNew([{ id: 'LI-gc1', title: 'ABC Builders', type: 'commercial', source: 'Website (grayco-cs.com)', contact: { name: 'Pat GC', phone: '(901) 555-0112' }, scope: REAL[2] }]);
  ok(!r.salesblock && inbox().length === 1 && !store().list.length, 'a GC inviting us to bid (commercial) is still not taken', { r, s: store().list });
  const LWm = require(path.join(SRC, '_lib/lead-watch.js'));
  ['Google LSA', 'Text message', 'Missed call', 'leads@grayco-cs.com', 'Roof Ignite'].forEach(src => { const l = { id: 'LX', source: src, stage: 'New Lead', textBody: SUBS[2], leadExtra: { lsaCheck: /LSA/.test(src) ? 'pending' : '' } };
    ok(LWm.kindOf(l) === 'sub' && !LWm.isCustomer(l), 'lead-watch: a sub from "' + src + '" is no customer lead', LWm.kindOf(l)); });
  ok(LWm.kindOf({ source: 'Google LSA', textBody: SUBS[2], notSpam: true }) === 'lsa', '"Actually a customer lead" (notSpam) → a customer lead again');
  ok(LWm.kindOf({ source: 'BuildingConnected', gc: 'Big GC', bidDue: '2026-12-01', scope: SUBS[2] }) === 'bid', 'a GC\'s bid invitation is never a sub\'s pitch');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
