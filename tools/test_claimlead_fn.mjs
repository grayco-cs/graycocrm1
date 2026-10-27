// test_claimlead_fn.mjs — patch CLAIMLEAD on the server (offline): a claims@ e-mail for a NEW claim is also a Lead Inbox
// lead, assigned to the configured insurance PM; the same e-mail again, or the same claim from another e-mail, makes no
// second lead; mail for an existing claim is journaled as before and makes no lead; auto-replies are ignored; nothing is
// ever sent to the sender. Mocks: Supabase REST + storage (an in-memory gc_kv), Resend (receiving API + sending), Anthropic.
// Usage: node tools/test_claimlead_fn.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', CLAIM_INBOX_TOKEN: 'tok', CLAIM_INBOX_INLINE: '1',
  RESEND_API_KEY: 're-test', ANTHROPIC_API_KEY: 'an-test', OWNER_EMAILS: 'owner@grayco-cs.com', BID_ALERT_TO: '' });
delete process.env.URL; delete process.env.DEPLOY_PRIME_URL;
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); } }

/* ── the world ── */
const KV = new Map(), STAFF = [], SENT = [], MAILS = {}, AI = { facts: {} }, STORED = [];
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const setKv = (k, v) => KV.set(k, { value: v, updated_at: new Date(Date.now() - 1000).toISOString() });
const getKv = k => (KV.get(k) || {}).value;
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname.startsWith('/storage/')) { STORED.push(u.pathname); return J(200, {}); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });   /* the inbox's own table is not there: gc_kv */
    if (u.pathname === '/rest/v1/gc_staff') return J(200, STAFF);
    if (u.pathname === '/rest/v1/gc_kv') {
      const key = (u.searchParams.get('key') || '').replace(/^eq\./, '');
      if (m === 'GET') { const r = KV.get(key); return J(200, r ? [{ value: r.value, updated_at: r.updated_at }] : []); }
      const body = JSON.parse(init.body || '{}');
      if (m === 'PATCH') { const r = KV.get(key), at = (u.searchParams.get('updated_at') || '').replace(/^eq\./, ''); if (!r || (at && r.updated_at !== at)) return J(200, []); KV.set(key, { value: body.value, updated_at: body.updated_at }); return J(200, [{ key }]); }
      if (m === 'POST') { KV.set(body.key, { value: body.value, updated_at: body.updated_at || new Date().toISOString() }); return J(201, null); }
    }
    return J(200, []);
  }
  if (u.host === 'api.resend.com') {
    if (m === 'POST' && u.pathname === '/emails') { SENT.push(JSON.parse(init.body)); return J(200, { id: 'sent' + SENT.length }); }
    const mm = /^\/emails\/receiving\/([^/]+)(\/attachments)?$/.exec(u.pathname);
    if (mm && MAILS[mm[1]]) return J(200, mm[2] ? { data: MAILS[mm[1]].attachments || [] } : MAILS[mm[1]]);
    return J(404, {});
  }
  if (u.host === 'api.anthropic.com') return J(200, { content: [{ type: 'tool_use', name: 'record_claim_mail', input: Object.assign({ summary: 'x', attachments: [] }, AI.facts) }] });
  if (u.host === 'dl.test') return Object.assign(J(200, {}), { arrayBuffer: async () => Buffer.from('%PDF-1.4 test') });
  return J(404, {});
};
const claim = require(path.join(SRC, 'claim-inbox.js'));
const bid = require(path.join(SRC, 'bid-inbox.js'));
const call = (id) => claim.handler({ httpMethod: 'POST', headers: {}, queryStringParameters: { token: 'tok' }, body: JSON.stringify({ type: 'email.received', data: { email_id: id, to: ['claims@in.grayco-cs.com'] } }) });
const leads = () => (getKv('gc_lead_inbox') || []).filter(x => x && !x.stub);
const inbox = () => getKv('gc_claim_inbox') || [];
function mail(id, o){ MAILS[id] = Object.assign({ id, from: 'Sam Adjuster <intake@cc-network.test>', to: ['claims@in.grayco-cs.com'], subject: 'New assignment', text: '', created_at: new Date().toISOString(), headers: {}, attachments: [{ id: 'a1', filename: 'assignment.pdf', content_type: 'application/pdf', download_url: 'https://dl.test/a1' }] }, o); }

const PM = { name: 'Pat Insurance', email: 'pat@grayco-cs.com' }, OTHER = { name: 'Ollie Other', email: 'ollie@grayco-cs.com' };
function world(){
  KV.clear(); STAFF.length = 0; SENT.length = 0; STORED.length = 0;
  setKv('users', [{ id: 'u1', name: PM.name, email: PM.email, role: 'Project Manager', active: true }, { id: 'u2', name: OTHER.name, email: OTHER.email, role: 'Staff', active: true }, { id: 'u0', name: 'Owner', email: 'owner@grayco-cs.com', role: 'Admin', active: true }]);
  setKv('gc_team_settings', { leadRoles: { insurancePm: { email: PM.email, name: PM.name } } });
  setKv('gc_claims', [{ id: 'CL1', claimNumber: 'CLM-55-0001', insured: 'Eva Existing', address: '9 Old Rd, Memphis, TN', projectId: 'P1', phase: 'Open' }]);
  setKv('projects', [{ id: 'P1', name: 'Existing job', client: 'Eva Existing', address: '9 Old Rd, Memphis, TN' }]);
  setKv('gc_lead_inbox', []);
  AI.facts = {};
}
const NEWCLAIM = { mail_kind: 'new_assignment', claim_number: 'CC-778899', carrier: 'Acme Mutual', tpa: 'Contractor Connection', insured_name: 'Nora Newman', insured_phone: '(901) 555-0142',
  loss_address: '412 Elm Street, Bartlett, TN 38134', loss_type: 'Water damage', date_of_loss: '2026-10-20', summary: 'New assignment: water loss at 412 Elm Street.' };
const NEWTEXT = 'You have a new assignment. Insured: Nora Newman. Phone: (901) 555-0142. Loss address: 412 Elm Street, Bartlett, TN 38134. Claim # CC-778899.';

console.log('# a new assignment becomes one insurance lead, assigned to the configured PM');
world(); AI.facts = NEWCLAIM; mail('m1', { text: NEWTEXT });
let r = await call('m1'), body = JSON.parse(r.body);
ok(r.statusCode === 200 && body.ok && body.lead && body.lead.made, 'the e-mail is accepted and a lead is made', body);
let L = leads();
ok(L.length === 1, 'exactly one lead in the Lead Inbox', L.length);
const l = L[0] || {};
ok(l.type === 'insurance' && l.source === 'Claims e-mail (claims@)', 'type Insurance, source "Claims e-mail (claims@)"', [l.type, l.source]);
ok(l.pm === PM.name && l.pmEmail === PM.email && l.leadRole === 'insurance', 'assigned to the Senior Insurance PM from the lead roles (the default)', [l.pm, l.pmEmail]);
ok(l.contact && l.contact.name === 'Nora Newman' && /901/.test(l.contact.phone), 'insured name and phone', l.contact);
ok(/412 Elm Street/.test(l.address) && l.city === 'Bartlett' && l.state === 'TN' && l.zip === '38134', 'address split into street / city / state / zip', [l.address, l.city, l.state, l.zip]);
ok(l.claimNumber === 'CC-778899' && l.carrier === 'Acme Mutual' && l.tpa === 'Contractor Connection' && l.lossType === 'Water damage' && l.dateOfLoss === '2026-10-20', 'claim #, carrier, TPA, loss type and date of loss', [l.claimNumber, l.carrier, l.tpa, l.lossType, l.dateOfLoss]);
ok(l.emails && l.emails[0] && l.emails[0].subject === 'New assignment' && l.emailIds[0] === 'm1' && /^IN-/.test(l.claimInboxId || ''), 'the e-mail is linked (subject, id, claim-inbox id)', l.emails);
ok(l.files && l.files.length === 1 && /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(l.files[0].ref), 'the attachment is linked from crm-files', l.files);
ok(l.status === 'new', 'it shows in the Lead Inbox as new (admins can reassign)', l.status);
const item = inbox()[0] || {};
ok(item.status === 'lead' && item.lead && item.lead.id === l.id, 'the claim inbox item points at the lead and is not left in "Claim mail to match"', item.status);
const alerts = SENT.filter(x => /owner@grayco-cs\.com/.test(JSON.stringify(x.to)));
ok(alerts.length >= 1, 'the shared lead path sent the admins\' new-lead alert (not claim-inbox itself)', SENT.map(x => x.subject));
ok(SENT.every(x => !JSON.stringify(x.to).includes('cc-network.test')), 'nothing was sent to the sender (no auto-reply)', SENT.map(x => x.to));

console.log('# the same e-mail again, and the same claim from another e-mail: no duplicate');
r = await call('m1'); body = JSON.parse(r.body);
ok(body.repeat === true && leads().length === 1, 'the very same e-mail again: repeat, still one lead', body);
const sentBefore = SENT.length;
mail('m2', { subject: 'Reminder: please call the insured', text: NEWTEXT });
r = await call('m2'); body = JSON.parse(r.body);
ok(body.ok && body.lead && body.lead.duplicate && !body.lead.made && leads().length === 1, 'another e-mail for the same claim # / phone / address: no second lead', body);
ok(SENT.length === sentBefore, 'and no second alert', SENT.length - sentBefore);
ok((leads()[0].emails || []).length === 2, 'the second e-mail is added to the lead', (leads()[0].emails || []).length);
AI.facts = Object.assign({}, NEWCLAIM, { claim_number: 'CC-111222' }); mail('m3', { subject: 'Another one', text: 'Insured: Nora N. Phone (901) 555-0142', attachments: [] });
r = await call('m3'); body = JSON.parse(r.body);
ok(leads().length === 1 && body.lead && body.lead.duplicate, 'a different claim # with the same phone / address is still the same lead', body.lead);

console.log('# who gets it');
world(); setKv('gc_lead_inbox_settings', { claimsTo: { name: OTHER.name, email: OTHER.email } }); AI.facts = NEWCLAIM; mail('s1', { text: NEWTEXT });
await call('s1'); ok(leads()[0] && leads()[0].pmEmail === OTHER.email, 'Lead settings "Insurance claims go to" wins over the lead roles', leads()[0] && leads()[0].pmEmail);
world(); setKv('gc_team_settings', {}); setKv('users', [{ name: 'Sally Senior', email: 'sally@grayco-cs.com', role: 'Senior Insurance PM', active: true }, { name: 'Bob', email: 'bob@grayco-cs.com', role: 'Staff', active: true }]); AI.facts = NEWCLAIM; mail('s2', { text: NEWTEXT });
await call('s2'); ok(leads()[0] && leads()[0].pmEmail === 'sally@grayco-cs.com', 'no lead-roles mapping: the person whose role says senior insurance PM', leads()[0] && leads()[0].pmEmail);
world(); setKv('gc_team_settings', {}); AI.facts = NEWCLAIM; mail('s3', { text: NEWTEXT });
await call('s3'); ok(leads().length === 1 && !leads()[0].pm && leads()[0].leadExtra.unassigned === true && /Set the senior insurance PM in Lead settings/.test((leads()[0].notes || []).join(' ') + leads()[0].leadExtra.needsPm), 'nobody found: unassigned, says "Set the senior insurance PM in Lead settings"', leads()[0] && leads()[0].notes);
world(); setKv('users', [{ name: PM.name, email: PM.email, role: 'Project Manager', active: false }, { name: 'Owner', email: 'owner@grayco-cs.com', role: 'Admin', active: true }]); AI.facts = NEWCLAIM; mail('s4', { text: NEWTEXT });
await call('s4'); ok(leads().length === 1 && !leads()[0].pm, 'a turned-off PM is not assigned', leads()[0] && leads()[0].pm);
// the settings door keeps the picker
const bad = bid._lib; ok(bad && bad.KV_SET === 'gc_lead_inbox_settings', 'bid-inbox exposes the settings key');

console.log('# a mail for an existing claim: journaled as before, no lead');
world(); AI.facts = { mail_kind: 'existing_claim_update', claim_number: 'CLM-55-0001', summary: 'Estimate approved.', approved_amount: 5000 };
mail('e1', { from: 'Adj <adj@carrier.test>', subject: 'Claim CLM-55-0001 estimate approved', text: 'Claim # CLM-55-0001 for Eva Existing at 9 Old Rd: estimate approved.', attachments: [] });
r = await call('e1'); body = JSON.parse(r.body);
ok(body.ok && body.claimId === 'CL1' && leads().length === 0, 'matched to the claim; no lead', body);
ok(inbox()[0] && inbox()[0].status === 'matched' && inbox()[0].match.claimId === 'CL1' && !inbox()[0].lead, 'journaled as before (status matched, no lead)', inbox()[0] && inbox()[0].status);
// even if the AI calls an existing claim's mail "new", the matched claim wins
world(); AI.facts = Object.assign({}, NEWCLAIM, { claim_number: 'CLM-55-0001' });
mail('e2', { subject: 'New assignment CLM-55-0001', text: 'Claim # CLM-55-0001 Eva Existing 9 Old Rd' , attachments: [] });
await call('e2'); ok(leads().length === 0 && inbox()[0].status === 'matched', 'a matched claim makes no lead even when the wording says "new"', inbox()[0] && inbox()[0].status);
// weak match, clearly about an existing claim: waits in "Claim mail to match"
world(); AI.facts = { mail_kind: 'existing_claim_update', summary: 'Please send photos.', requested_items: ['photos'] };
mail('e3', { from: 'Adj <adj@carrier.test>', subject: 'Photos needed', text: 'Please send photos for the loss at 9 Old Rd.', attachments: [] });
await call('e3'); ok(leads().length === 0 && inbox()[0].status === 'to-match', 'weak match about an existing claim: stays in "Claim mail to match", no lead', inbox()[0] && inbox()[0].status);
world(); AI.facts = Object.assign({}, NEWCLAIM, { claim_number: 'CLM-55-0001' });   /* AI says new, but the claim # is one we hold, in the body only, weakly worded */
mail('e4', { subject: 'Assignment', text: 'ref CLM-55-0001', attachments: [] });
await call('e4'); ok(leads().length === 0, 'a claim # we hold never makes a lead', inbox()[0] && inbox()[0].status);
// not a new claim, no match: to-match, no lead
world(); AI.facts = { mail_kind: 'other', summary: 'A newsletter-ish note.' };
mail('e5', { subject: 'Hello', text: 'Thanks for your time last week.', attachments: [] });
await call('e5'); ok(leads().length === 0 && inbox()[0].status === 'to-match', 'an e-mail that is not a new claim waits in "Claim mail to match", no lead', inbox()[0] && inbox()[0].status);

console.log('# the loop guards');
for (const [id, o] of [['g1', { headers: { 'auto-submitted': 'auto-replied' } }], ['g2', { subject: 'Automatic reply: New assignment' }], ['g3', { from: 'claims@grayco-cs.com' }], ['g4', { headers: { 'x-grayco-crm': '1' } }], ['g5', { from: 'MAILER-DAEMON@x.test', subject: 'Undeliverable' }]]) {
  world(); AI.facts = NEWCLAIM; mail(id, Object.assign({ text: NEWTEXT }, o));
  r = await call(id); body = JSON.parse(r.body);
  ok(body.ignored && leads().length === 0 && inbox().length === 0 && SENT.length === 0, 'ignored: ' + body.ignored + ' (' + id + ')', body);
}
world(); AI.facts = NEWCLAIM; mail('g6', { text: NEWTEXT, headers: { 'list-unsubscribe': '<mailto:x@y.z>' } });
await call('g6'); ok(leads().length === 0, 'bulk / list mail makes no lead');
world(); AI.facts = NEWCLAIM; mail('g7', { to: ['someone@in.grayco-cs.com'], text: NEWTEXT });
r = await claim.handler({ httpMethod: 'POST', headers: {}, queryStringParameters: { token: 'tok' }, body: JSON.stringify({ type: 'email.received', data: { email_id: 'g7', to: ['someone@in.grayco-cs.com'] } }) });
ok(JSON.parse(r.body).ignored && leads().length === 0, 'mail not for the claim inbox is ignored');
process.env.CLAIM_LEAD_OFF = '1'; world(); AI.facts = NEWCLAIM; mail('o1', { text: NEWTEXT }); await call('o1');
ok(leads().length === 0 && inbox()[0].status === 'to-match', 'CLAIM_LEAD_OFF=1 restores the old behaviour'); delete process.env.CLAIM_LEAD_OFF;
world(); AI.facts = {}; delete process.env.ANTHROPIC_API_KEY; mail('r1', { subject: 'New assignment - water loss', text: 'Insured: Rita Rules\nPhone: 901-555-0199\nLoss address: 77 Pine Ave, Memphis, TN 38104\nClaim # RL-445566' }); await call('r1');
process.env.ANTHROPIC_API_KEY = 'an-test';
ok(leads().length === 1 && leads()[0].contact.name === 'Rita Rules' && leads()[0].claimNumber === 'RL-445566' && leads()[0].pmEmail === PM.email, 'with no AI, plain rules still read a new assignment', leads()[0]);

console.log(fail ? '\n' + fail + ' FAILED, ' + pass + ' passed' : '\nall ' + pass + ' passed');
process.exit(fail ? 1 : 0);
