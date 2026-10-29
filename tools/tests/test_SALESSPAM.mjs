// test_SALESSPAM.mjs — patch SALESSPAM (offline): vendor sales pitches to leads@ / bids@ / replies@ / claims@ and texts
// from unknown numbers are filtered BEFORE they become leads, alerts, relays, approvals or Job Messages; kept only in
// 🗑 Filtered (sales/spam) with ↩ Restore and "Always allow"; purged after 30 days; counted on the 🩺 CRM health line.
// Made-up people, companies, numbers (555) and mail only — no production data. Mocks: Supabase REST (in-memory gc_kv;
// gc_lead_inbox_kv missing → gc_kv), Resend (receiving API + sends), Twilio, the Anthropic API (the AI cases).
// Usage: node tools/tests/test_SALESSPAM.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '',
  TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+19015550000', CRM_URL: 'https://crm.grayco-cs.com', BID_INBOX_INLINE: '1' });
['ANTHROPIC_API_KEY', 'TWILIO_RING_TO', 'URL', 'DEPLOY_PRIME_URL', 'SALESSPAM_OFF'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }

/* ── the fake world behind fetch() ── */
const KV = new Map(), SMS = [], MAIL = [], AI_CALLS = [], INBOUND = new Map();
let AI_ANSWER = null;
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from(JSON.stringify(body)) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => { let v = (KV.get(k) || {}).value; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} } return v; };
const USERS = { 'tok-admin': { email: 'owner@grayco-cs.com', role: 'admin' }, 'tok-office': { email: 'office.person@grayco-cs.com', role: 'office' } };
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const t = (/Bearer\s+(\S+)/.exec((init.headers || {}).Authorization || '') || [])[1]; return USERS[t] ? J(200, { email: USERS[t].email }) : J(401, {}); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname === '/rest/v1/gc_staff') { const e = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, '')); const x = Object.values(USERS).find(y => y.email === e);
      return J(200, e ? (x ? [{ email: x.email, name: x.email, role: x.role, active: true }] : []) : [{ email: 'owner@grayco-cs.com', role: 'admin', active: true }]); }
    if (u.pathname === '/rest/v1/gc_kv') {
      const kq = u.searchParams.get('key') || '';
      if (m === 'GET') {
        if (kq.startsWith('in.(')) { const keys = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return J(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k).value, updated_at: KV.get(k).updated_at }))); }
        const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r.value, updated_at: r.updated_at }] : []);
      }
      const body = JSON.parse(init.body || '{}'), key = kq.replace(/^eq\./, '');
      if (m === 'PATCH') { const r = KV.get(key), at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || (at && r.updated_at !== at)) return J(200, []); KV.set(key, { value: body.value, updated_at: body.updated_at || new Date().toISOString() }); return J(200, [{ key }]); }
      if (m === 'POST') { KV.set(body.key, { value: body.value, updated_at: body.updated_at || new Date().toISOString() }); return J(201, null); }
    }
    if (/\/storage\/v1\//.test(u.pathname)) return J(200, { Key: 'x' });
    return J(200, []);
  }
  if (u.host === 'api.resend.com') {
    const mm = /^\/emails\/receiving\/([^/]+)(\/attachments)?/.exec(u.pathname);
    if (mm && m === 'GET') { if (mm[2]) return J(200, { object: 'list', data: [] }); const e = INBOUND.get(decodeURIComponent(mm[1])); return e ? J(200, e) : J(404, { message: 'not found' }); }
    MAIL.push(JSON.parse(init.body || '{}')); return J(200, { id: 'm' + MAIL.length });
  }
  if (u.host === 'api.twilio.com') { SMS.push(Object.fromEntries(new URLSearchParams(init.body))); return J(201, { sid: 'SM' + SMS.length }); }
  if (u.host === 'api.anthropic.com') { const b = JSON.parse(init.body); AI_CALLS.push(b); const a = AI_ANSWER || { verdict: 'unsure', category: 'other_legitimate', confidence: 0.3, reason: 'n/a' };
    return J(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: b.tools && b.tools[0] && b.tools[0].name, input: a }] }); }
  return J(404, {});
};

const BI = require(path.join(SRC, 'bid-inbox.js'));
const SS = require(path.join(SRC, '_lib/salesspam.js'));
const MC = require(path.join(SRC, 'missed-call.js'));
const H13 = require(path.join(SRC, '_lib/health13.js'));

/* ── made-up CRM data ── */
const DATA = {
  customers: [{ id: 'C1', name: 'Dana Testcustomer', email: 'dana.testcustomer@gmail.com', phone: '9015550111' }],
  subs: [{ id: 'S1', name: 'Ridge Line Roofing Test', email: 'estimating@ridgelineroofing-test.com', phone: '9015550122' }],
  vendors: [{ id: 'V1', name: 'Southern Supply Test', email: 'ar@southernsupply-test.com' }],
  projects: [{ id: 'P1', name: 'Testcustomer Roof', client: 'Dana Testcustomer', customerId: 'C1', address: '4410 Oakview Ln, Memphis, TN 38118', autoPO: 'A4410', status: 'Active', customerPhone: '9015550111' }],
  gc_claims: [{ id: 'CL1', projectId: 'P1', adjuster: { name: 'Ann Adjuster', email: 'ann.adjuster@pilotcat.com' }, deskAdjuster: { email: 'desk@acme-adjusting-test.com' } }],
  users: [{ id: 'u1', name: 'Owner Test', email: 'owner@grayco-cs.com', role: 'Admin', active: true }],
  leads: [], schedule: [], gc_deleted_projects: [], gc_job_messages: [], gc_office_tasks: []
};
function world(){
  KV.clear(); SMS.length = 0; MAIL.length = 0; AI_CALLS.length = 0; INBOUND.clear(); AI_ANSWER = null;
  Object.keys(DATA).forEach(k => setKv(k, JSON.parse(JSON.stringify(DATA[k]))));
  delete process.env.ANTHROPIC_API_KEY;
  SS._D.now = () => Date.now();
}
const leadsIn = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const filtered = () => getKv(SS.KV_ITEMS) || [];
const sentTo = () => MAIL.filter(x => x && x.to).map(x => [].concat(x.to).join(','));

/* ── realistic samples ── */
let N = 0;
function mail(o){
  const id = 'em-' + (++N);
  const e = Object.assign({ object: 'email', id, created_at: '2026-10-29T14:0' + (N % 10) + ':00.000Z', cc: [], html: '', headers: {}, message_id: '<msg' + N + '@sender.test>' }, o);
  e.headers = Object.assign({ 'message-id': e.message_id }, e.headers);
  INBOUND.set(id, e);
  return { type: 'email.received', data: { email_id: id, to: e.to, from: e.from, subject: e.subject, created_at: e.created_at } };
}
const PITCH_SOFTWARE = {
  from: 'Brad Kessler <brad@fieldflowhq-test.io>', to: ['replies@in.grayco-cs.com'], subject: 'Quick question about GrayCo scheduling',
  text: 'Hi there,\n\nHope this email finds you well. I came across your website and noticed GrayCo does roofing and restoration across Memphis.\n\n'
    + 'We help roofing contractors replace spreadsheets with one AI-powered field service management platform — scheduling, estimates and invoicing in one app. '
    + 'Teams like yours save 10+ hours a week.\n\nWould you be open to a quick 15-minute call next week? You can grab a time here: https://calendly.com/brad-fieldflow/15min\n\n'
    + 'Best,\nBrad Kessler\nAccount Executive, FieldFlow\n\nIf you\'d rather not hear from me, just let me know.\nhttps://app.apollo.io/unsubscribe/abc123',
  html: '<p>Hope this email finds you well…</p><a href="https://calendly.com/brad-fieldflow/15min">Book a time</a><a href="https://app.apollo.io/unsubscribe/abc123">unsubscribe</a>',
  headers: { 'x-mailer': 'Apollo.io' }
};
const PITCH_LEADGEN = {
  from: 'Tanya Reyes <tanya@stormleadspro-test.com>', to: ['leads@in.grayco-cs.com'], subject: 'Exclusive storm leads for GrayCo',
  text: 'Hi GrayCo team,\n\nAfter the recent hail storms we are delivering exclusive roofing leads to one contractor per ZIP in Memphis. Our partners get 25+ booked appointments per month '
    + 'from homeowners with storm damage.\n\nAre you the right person to talk to about lead generation? Worth a quick chat this week?\n\nTanya\nStormLeads Pro\n\nReply "stop" to opt out. https://lemlist.com/unsubscribe/xyz',
  headers: {}
};
const CUSTOMER_REPLY = {
  from: 'Dana Testcustomer <dana.testcustomer@gmail.com>', to: ['leads@in.grayco-cs.com'], subject: 'Re: your estimate',
  text: 'Hi, thanks for the estimate. Can you give me a quick call tomorrow about the roof? I want to set up a time to go over the shingles.\n\nDana'
};
const HOMEOWNER_NEW = {
  from: 'Chris Newperson <chris.newperson.test@yahoo.com>', to: ['leads@in.grayco-cs.com'], subject: 'Roof leak',
  text: 'Hello, my roof is leaking in the back bedroom after the storm last night. I need an estimate for a repair. My number is 901-555-0177 and I live at 812 Elm Test Dr, Bartlett TN.\n\nChris'
};
const BC_INVITE = {
  from: 'BuildingConnected <noreply@buildingconnected.com>', to: ['leads@in.grayco-cs.com'], subject: 'Invitation to Bid: Collierville Test Clinic Re-Roof',
  text: 'Acme Test Builders has invited you to bid on Collierville Test Clinic Re-Roof.\nBids due: November 12, 2026 2:00 PM CST\nPre-bid meeting: November 4, 2026 10:00 AM\n'
    + 'Trades: Roofing\nView plans and specs: https://app.buildingconnected.com/opportunities/abc123\n\nBook a demo of BuildingConnected Pro to see more projects.',
  html: '<a href="https://app.buildingconnected.com/opportunities/abc123">View Opportunity</a>'
};
const SUPPLIER_INVOICE = {
  from: 'Southern Supply Test AR <ar@southernsupply-test.com>', to: ['invoices@in.grayco-cs.com'], subject: 'Invoice 88123 - PO A4410',
  text: 'Please find attached invoice 88123 for PO A4410. Terms Net 30. Questions? Book a quick call with our AR team.'
};
const ADJUSTER = {
  from: 'Mike Fieldadjuster <mike.fieldadjuster@statefarm.com>', to: ['leads@in.grayco-cs.com'], subject: 'Claim 42-TEST-001 — inspection',
  text: 'Good morning,\n\nI am the field adjuster on claim 42-TEST-001 for the insured at 77 Test Ridge Cv. Are you open to a quick call to schedule the re-inspection? Hope this finds you well.\n\nMike'
};

(async () => {
  /* ═════ 1. the rules (no AI key) ═════ */
  world();
  const ctx0 = { known: SS.knownIndex(DATA), sent: SS.sentIndex([{ dir: 'out', mid: '<crm.abc123@grayco-cs.com>', to: ['pat.prospect.test@acmegc-test.com'] }, { dir: 'out', mid: '<0100019abcdef@email.amazonses.com>', to: [] }]), lists: SS.cleanLists(null) };
  const M = (o, rcpt) => ({ id: 'x', from: { email: /<([^>]+)>/.exec(o.from)[1].toLowerCase(), name: o.from.split('<')[0].trim() }, to: o.to.map(e => ({ email: e })), cc: [], subject: o.subject, text: o.text, html: o.html || '', headers: o.headers || {}, messageId: '<t@x>' });
  const C = (o, extra) => Object.assign({}, ctx0, { rcpt: o.to, route: 'x' }, extra || {});
  let v = await SS.classifyMail(M(PITCH_SOFTWARE), C(PITCH_SOFTWARE));
  ok(v.spam && v.by === 'rules' && v.reasons.some(r => /calendar/.test(r)) && v.reasons.some(r => /sales tool/.test(r)) && v.reasons.some(r => /replies@/.test(r)), 'software pitch to replies@ (Apollo, Calendly, cold) → filtered by the rules', v);
  v = await SS.classifyMail(M(PITCH_LEADGEN), C(PITCH_LEADGEN));
  ok(v.spam, 'lead-gen pitch to leads@ (Lemlist, "storm damage" in it) → filtered', v);
  v = await SS.classifyMail(M(CUSTOMER_REPLY), C(CUSTOMER_REPLY));
  ok(!v.spam && /in the CRM/.test(v.safe), 'known customer\'s reply ("quick call") → never filtered', v);
  v = await SS.classifyMail(M(HOMEOWNER_NEW), C(HOMEOWNER_NEW));
  ok(!v.spam, 'a new homeowner (free mail, roof leak) → not filtered', v);
  v = await SS.classifyMail(M(BC_INVITE), C(BC_INVITE));
  ok(!v.spam && /plan room/.test(v.safe), 'BuildingConnected invitation (even with "Book a demo" in its footer) → never filtered', v);
  v = await SS.classifyMail(M(SUPPLIER_INVOICE), C(SUPPLIER_INVOICE));
  ok(!v.spam && v.safe, 'supplier invoice to invoices@ → never filtered', v);
  v = await SS.classifyMail(M(ADJUSTER), C(ADJUSTER));
  ok(!v.spam && /insurance/.test(v.safe), 'State Farm adjuster ("open to a quick call", "Hope this finds you well") → never filtered', v);
  const deskAdj = Object.assign({}, PITCH_SOFTWARE, { from: 'Desk Adj <someone.else@acme-adjusting-test.com>' });
  v = await SS.classifyMail(M(deskAdj), C(deskAdj));
  ok(!v.spam && /company in the CRM/.test(v.safe), 'any address at an adjusting firm on a claim in the CRM → never filtered (domain)', v);
  const mentionsJob = Object.assign({}, PITCH_SOFTWARE, { text: PITCH_SOFTWARE.text + '\n\nP.S. we noticed your crew at 4410 Oakview Lane last week.' });
  v = await SS.classifyMail(M(mentionsJob), C(mentionsJob));
  ok(!v.spam && /4410 oakview/.test(v.safe), 'names one of our job addresses → never filtered', v);
  const mentionsPo = Object.assign({}, PITCH_SOFTWARE, { subject: 'About PO A4410' });
  v = await SS.classifyMail(M(mentionsPo), C(mentionsPo));
  ok(!v.spam && /PO/.test(v.safe), 'names one of our POs → never filtered', v);
  const ourThread = Object.assign({}, PITCH_SOFTWARE, { headers: { 'in-reply-to': '<crm.abc123@grayco-cs.com>' } });
  v = await SS.classifyMail(M(ourThread), C(ourThread));
  ok(!v.spam && /answers one of our/.test(v.safe), 'a reply to one of our e-mails (In-Reply-To) → never filtered', v);
  const sesThread = Object.assign({}, PITCH_SOFTWARE, { headers: { references: '<0100019abcdef@email.amazonses.com>' } });
  v = await SS.classifyMail(M(sesThread), C(sesThread));
  ok(!v.spam, 'a reply to a CRM e-mail (References: our Resend / SES Message-ID) → never filtered', v);
  const wroteThem = Object.assign({}, PITCH_SOFTWARE, { from: 'Pat Prospect <pat.prospect.test@acmegc-test.com>' });
  v = await SS.classifyMail(M(wroteThem), C(wroteThem));
  ok(!v.spam && /we have e-mailed/.test(v.safe), 'someone we have e-mailed → never filtered', v);
  const subPitch = Object.assign({}, PITCH_SOFTWARE, { from: 'Est <bids@ridgelineroofing-test.com>' });
  v = await SS.classifyMail(M(subPitch), C(subPitch));
  ok(!v.spam, 'a sub\'s company domain in the CRM → never filtered', v);
  /* lists: block filters, allow wins */
  v = await SS.classifyMail(M(HOMEOWNER_NEW), C(HOMEOWNER_NEW, { lists: SS.cleanLists({ block: ['chris.newperson.test@yahoo.com'] }) }));
  ok(v.spam && v.by === 'block', 'block list (address) → filtered', v);
  v = await SS.classifyMail(M(PITCH_SOFTWARE), C(PITCH_SOFTWARE, { lists: SS.cleanLists({ allow: ['fieldflowhq-test.io'], block: ['brad@fieldflowhq-test.io'] }) }));
  ok(!v.spam && /allow list/.test(v.safe), 'allow list (domain) wins over the block list and the rules', v);
  ok(SS.cleanLists({ block: ['gmail.com', '@yahoo.com', 'grayco-cs.com', 'spam-test.io', '(901) 555-0199'] }).block.join(',') === 'spam-test.io,9015550199', 'block list never takes a public mail service or ourselves; phones are kept as 10 digits');
  /* the AI path (ANTHROPIC_API_KEY): strict JSON tool; its answer decides */
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  AI_ANSWER = { verdict: 'legitimate', category: 'customer_or_lead', confidence: 0.9, reason: 'a person asking about a project' };
  v = await SS.classifyMail(M(PITCH_LEADGEN), C(PITCH_LEADGEN));
  ok(!v.spam && v.by === 'ai' && AI_CALLS.length === 1, 'AI says legitimate → not filtered (the AI decides when it answers)', v);
  const tool = AI_CALLS[0].tools[0];
  ok(tool.strict === true && tool.input_schema.additionalProperties === false && tool.input_schema.required.length === 4, 'AI call uses a strict JSON tool schema', tool);
  AI_ANSWER = { verdict: 'vendor_solicitation', category: 'software_saas', confidence: 0.92, reason: 'selling software' };
  const softPitch = { from: 'Lee <lee@quietsaas-test.com>', to: ['leads@in.grayco-cs.com'], subject: 'GrayCo + QuietSaaS', text: 'Hi, we built a platform for roofers. Worth a look?' };
  v = await SS.classifyMail(M(softPitch), C(softPitch));
  ok(v.spam && v.by === 'ai', 'AI says vendor_solicitation on a soft pitch the rules alone would pass → filtered', v);
  AI_CALLS.length = 0;
  v = await SS.classifyMail(M(HOMEOWNER_NEW), C(HOMEOWNER_NEW));
  ok(!v.spam && AI_CALLS.length === 0, 'mail with no sales signal is never sent to the AI', { v, calls: AI_CALLS.length });
  AI_CALLS.length = 0;
  v = await SS.classifyMail(M(BC_INVITE), C(BC_INVITE));
  ok(!v.spam && AI_CALLS.length === 0, 'safe senders are never sent to the AI either');
  delete process.env.ANTHROPIC_API_KEY; AI_ANSWER = null;

  /* ═════ 2. the whole road: Resend webhook → bid-inbox ═════ */
  world();
  let r = await BI._test.processEvent(mail(PITCH_LEADGEN), { inline: true });
  ok(r.status === 200 && r.body.filtered && r.body.route === 'leads', 'leads@ pitch → filtered at the door', r.body);
  ok(leadsIn().length === 0 && MAIL.length === 0 && SMS.length === 0, 'no lead, no alert e-mail, no text', { leads: leadsIn().length, mail: sentTo(), sms: SMS.length });
  ok(filtered().length === 1 && filtered()[0].from === 'tanya@stormleadspro-test.com' && filtered()[0].evt.data.email_id, '… kept only in 🗑 Filtered (with what Restore needs)', filtered());
  ok(!getKv('gc_mail_recv') || !getKv('gc_mail_recv').length, '… not in 📬 Mail received either', getKv('gc_mail_recv'));
  ok(!(getKv('gc_job_messages') || []).length && !(getKv('gc_approval_queue') || []).length, '… no Job Message, no approval');
  const same = mail(PITCH_LEADGEN); INBOUND.get(same.data.email_id).message_id = filtered()[0].evt.data.message_id; INBOUND.get(same.data.email_id).headers['message-id'] = filtered()[0].evt.data.message_id;
  r = await BI._test.processEvent(same, { inline: true });
  ok(r.body.filtered && filtered().length === 1, 'the same e-mail twice is kept once');
  r = await BI._test.processEvent(mail(PITCH_SOFTWARE), { inline: true });
  ok(r.body.filtered && r.body.route === 'replies' && filtered().length === 2, 'replies@ cold software pitch → filtered', r.body);
  r = await BI._test.processEvent(mail(HOMEOWNER_NEW), { inline: true });
  ok(!r.body.filtered && r.body.inbox === 'leads' && leadsIn().length === 1, 'homeowner to leads@ → a lead as before', r.body);
  r = await BI._test.processEvent(mail(CUSTOMER_REPLY), { inline: true });
  ok(!r.body.filtered, 'customer reply to leads@ → processed as before', r.body);
  r = await BI._test.processEvent(mail(BC_INVITE), { inline: true });
  ok(!r.body.filtered && Array.isArray(r.body.leads) && r.body.leads.length >= 1, 'BuildingConnected invite to leads@ → the bid path as before', r.body);
  r = await BI._test.processEvent(mail(ADJUSTER), { inline: true });
  ok(!r.body.filtered, 'adjuster e-mail → processed as before', r.body);
  r = await BI._test.processEvent(mail(SUPPLIER_INVOICE), { inline: true });
  ok(!r.body.filtered && /invoices|sub-invoices/.test(String(r.body.inbox)), 'supplier invoice to invoices@ → the invoice path as before', r.body);
  const nonPitchReplies = mail({ from: 'Someone <someone.test@yahoo.com>', to: ['replies@in.grayco-cs.com'], subject: 'Re: newsletter', text: 'Thanks for the newsletter, our kitchen looks great.' });
  r = await BI._test.processEvent(nonPitchReplies, { inline: true });
  ok(!r.body.filtered && /not addressed/.test(r.body.ignored || ''), 'a plain replies@ note → not filtered (left alone as before)', r.body);
  const claimsPitch = Object.assign({}, PITCH_SOFTWARE, { to: ['claims@in.grayco-cs.com'], subject: 'Faster supplements with AI' });
  r = await require(path.join(SRC, 'claim-inbox.js'))._test.processEvent(mail(claimsPitch));
  ok(r.body.filtered && r.body.route === 'claims' && !(getKv('gc_claim_inbox') || []).length, 'claims@ pitch → filtered, no claim e-mail, no insurance lead', r.body);
  ok(filtered().length === 3, 'three filtered so far');

  /* ═════ 3. admin: list, restore, always allow, lists, purge ═════ */
  const H = tok => ({ authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' });
  const call = (tok, method, body) => BI.handler({ httpMethod: method, headers: H(tok), queryStringParameters: { salesspam: '1' }, body: body ? JSON.stringify(body) : '' }).then(x => ({ status: x.statusCode, body: JSON.parse(x.body) }));
  let g = await call('tok-office', 'GET');
  ok(g.status === 403, 'office cannot see the filtered list (admins only)', g);
  g = await call('tok-admin', 'GET');
  ok(g.status === 200 && g.body.items.length === 3 && g.body.counts.today.e === 3 && g.body.keepDays === 30, 'admin sees the list + today\'s count', g.body.counts);
  const leadgen = g.body.items.find(x => x.from === 'tanya@stormleadspro-test.com');
  const before = leadsIn().length; MAIL.length = 0;
  let p = await call('tok-admin', 'POST', { op: 'restore', id: leadgen.id });
  ok(p.status === 200 && p.body.ok && leadsIn().length === before + 1, '↩ Restore → processed normally (a lead now)', p.body);
  ok(!filtered().some(x => x.id === leadgen.id), '… and it leaves the filtered list');
  ok(p.body.result && p.body.result.body && p.body.result.body.inbox === 'leads' && MAIL.length >= 1, '… with its normal new-lead alert', { result: p.body.result, mail: sentTo() });
  const soft = g.body.items.find(x => x.from === 'brad@fieldflowhq-test.io');
  p = await call('tok-admin', 'POST', { op: 'allow', id: soft.id, scope: 'domain' });
  ok(p.status === 200 && p.body.lists.allow.indexOf('fieldflowhq-test.io') >= 0 && !filtered().some(x => x.id === soft.id), '"Always allow this domain" → on the allow list + restored', p.body);
  r = await BI._test.processEvent(mail(Object.assign({}, PITCH_SOFTWARE, { subject: 'Following up' })), { inline: true });
  ok(!r.body.filtered, 'the next pitch from that domain is let through (allow list wins)', r.body);
  p = await call('tok-admin', 'POST', { op: 'lists', allow: 'fieldflowhq-test.io\nfriend@vendor-test.com', block: ['@yahoo.com', 'pushy-test.io'] });
  ok(p.body.lists.allow.length === 2 && p.body.lists.block.join() === 'pushy-test.io', 'allow / block lists saved (a public mail service is refused on the block list)', p.body);
  r = await BI._test.processEvent(mail({ from: 'Ops <ops@pushy-test.io>', to: ['leads@in.grayco-cs.com'], subject: 'Hello', text: 'Just saying hi.' }), { inline: true });
  ok(r.body.filtered && r.body.by === 'block', 'a blocked domain is filtered', r.body);
  const gmailItem = filtered().find(x => x.from === 'ops@pushy-test.io');
  p = await call('tok-admin', 'POST', { op: 'delete', id: gmailItem.id });
  ok(p.status === 200 && !filtered().some(x => x.id === gmailItem.id), 'delete removes one from the list');
  /* 30-day purge */
  r = await BI._test.processEvent(mail(Object.assign({}, PITCH_LEADGEN, { from: 'Other <other@leadsy-test.com>' })), { inline: true });
  ok(r.body.filtered && filtered().length >= 1, 'one more filtered');
  const real = Date.now(); SS._D.now = () => real + 31 * 86400000;
  ok((await SS.list()).length === 0, 'after 30 days the list is empty (purged on read)');
  r = await BI._test.processEvent(mail(Object.assign({}, PITCH_LEADGEN, { from: 'Third <third@leadsy2-test.com>' })), { inline: true });
  ok(filtered().length === 1 && filtered()[0].from === 'third@leadsy2-test.com', '… and old ones are dropped from the store on the next write', filtered().map(x => x.from));
  SS._D.now = () => Date.now();

  /* ═════ 4. texts from unknown numbers ═════ */
  world();
  const sms = (from, body, sid) => MC._test.inboundSms({ From: '+1' + from, To: '+19015550000', Body: body, MessageSid: sid });
  let t = await sms('9015550188', 'Hi, this is Jake with RoofLeadsPro. We help roofing contractors get 20+ exclusive storm leads per month. Got 10 mins for a quick call this week? calendly.com/jake-rlp Reply STOP to opt out', 'SMspam1');
  ok(t.filtered, 'sales text from an unknown number → filtered', t);
  ok(leadsIn().length === 0 && SMS.length === 0 && MAIL.length === 0 && !(getKv('gc_job_messages') || []).length, '… no lead, no auto-answer, no relay e-mail, no Job Message', { leads: leadsIn().length, sms: SMS.length, mail: MAIL.length });
  ok(filtered().length === 1 && filtered()[0].channel === 'text' && filtered()[0].sms.Body.length > 10, '… kept in 🗑 Filtered');
  t = await sms('9015550111', 'Can you give me a quick call about my roof? Worth a quick chat this week.', 'SMcust1');
  ok(!t.filtered, 'a known customer\'s text is never checked', t);
  t = await sms('9015550166', 'Hi I need an estimate for a roof leak at 55 Test Pine Cv Bartlett', 'SMnew1');
  ok(!t.filtered && t.newLead, 'a new homeowner text → a lead as before', t);
  const tItem = filtered()[0];
  g = await call('tok-admin', 'GET');
  ok(g.body.counts.today.t === 1, 'texts are counted apart', g.body.counts);
  p = await call('tok-admin', 'POST', { op: 'restore', id: tItem.id });
  ok(p.status === 200 && leadsIn().some(x => JSON.stringify(x).indexOf('5550188') >= 0) && !filtered().length, '↩ Restore a text → processed normally (a lead)', p.body);

  /* ═════ 5. the 🩺 CRM health line ═════ */
  world();
  for (let i = 0; i < 7; i++) await BI._test.processEvent(mail(Object.assign({}, PITCH_LEADGEN, { from: 'Rep ' + i + ' <rep' + i + '@leadfarm' + i + '-test.com>' })), { inline: true });
  const c = await SS.counts();
  ok(c.today.e === 7, 'seven filtered today', c);
  ok(/^7 sales e-mails filtered today/.test(SS.healthText(c)), 'health line: "7 sales e-mails filtered today …"', SS.healthText(c));
  const rep = await H13.report();
  const line = rep.items.find(x => x.k === 'salesspam');
  ok(line && /^7 sales e-mails filtered today/.test(line.text) && line.status === 'green', '🩺 CRM health report carries the line', line);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
