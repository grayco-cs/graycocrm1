// test_INQUIRY.mjs — patch INQUIRY: a website contact that is not a lead → ONE shared To-Do for the admins and the office
// (gc_office_tasks, kind "web_inquiry", no assignee), + one "New website inquiry" e-mail to the lead-alert list.
// Real leads stay leads, careers stay on Hiring, the leads@ e-mail path follows the same rule.
// Run: node tools/tests/test_INQUIRY.mjs [repoDir]   (offline: fake_inquiry.mjs fakes Supabase, Resend, Anthropic)
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { W, install, reset, kvset, kvget } from './fake_inquiry.mjs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '../..')); const SRC = path.join(BUILD, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test-key', RESEND_API_KEY: 're-test-key', ANTHROPIC_API_KEY: 'ak-test-key',
  SITE_ORIGIN: 'https://crm.grayco-cs.com', OWNER_EMAILS: 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com' });
['PORTAL_AUTO_EMAIL', 'TURNSTILE_SECRET', 'WEBSITE_ZAPIER_KEY', 'LEAD_INTAKE_ALERTS', 'BID_ALERTS_OFF', 'INQUIRY_AI', 'AUT_AI_TIMEOUT_MS'].forEach(k => delete process.env[k]);
install();
let pass = 0, fail = 0; const fails = [];
function ok(c, m, info){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; fails.push(m); console.log('  FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } }
const web = require(path.join(SRC, 'website-intake.js'));
const core = require(path.join(SRC, 'portal.js'))._core;
const WT = web._test;
let ipN = 1;
function ev(method, { qs = {}, body, auth } = {}){
  return { httpMethod: method, queryStringParameters: qs, body: body == null ? undefined : JSON.stringify(body),
    headers: Object.assign({ origin: 'https://www.grayco-cs.com', 'x-nf-client-connection-ip': '10.2.0.' + (ipN++) }, auth ? { authorization: 'Bearer ' + auth } : {}) };
}
async function post(body){ const r = await web.handler(ev('POST', { body: Object.assign({ token: WT.newToken(Date.now() - 10000) }, body) })); return { status: r.statusCode, j: JSON.parse(r.body || 'null') }; }
const inbox = () => (kvget('gc_lead_inbox') || []);
const tasks = () => (kvget('gc_office_tasks') || []).filter(t => t && t.kind === 'web_inquiry');
const apps = () => (kvget('gc_website_apps') || []);
const inqMail = () => W.sent.filter(m => /New website inquiry/.test(m.subject));
const leadMail = () => W.sent.filter(m => /New website lead|New lead/i.test(m.subject));
function seed(){
  reset(); core._reset(); WT.reset();
  kvset('users', [{ id: 'U1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }, { id: 'U4', name: 'Brittany Pucket', email: 'office@grayco-cs.com', role: 'Office Admin' }, { id: 'U2', name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager' }]);
  kvset('gc_office_tasks', [{ id: 'T_OLD', label: 'An older office to-do', done: false }]);
  kvset('projects', []); kvset('customers', []);
}
const base = { name: 'Dana Fakename', company: 'Fakeco Drywall LLC', email: 'dana@fakeco.test', phone: '901-555-0123', location: 'Bartlett, TN', page: 'https://www.grayco-cs.com/contact' };
/* the CRM's To-Do (patch TODO srcStored): no assignee → vis "company" → every admin and every office user */
const visibleTo = (t, role) => { const who = (t.assignees || []).filter(Boolean); return who.length ? false : /^(admin|office)/i.test(role); };

console.log('# the rule: which picks are inquiries');
ok(WT.inquiryHint('sub') === 'sub' && WT.inquiryHint('Becoming a GrayCo subcontractor') === 'sub', '"sub" / "Becoming a GrayCo subcontractor" → sub inquiry');
ok(WT.inquiryHint('other') === 'open' && WT.inquiryHint('Something else') === 'open' && WT.inquiryHint('') === 'open', '"other" / "Something else" / nothing → classify');
ok(['project', 'restoration', 'div9', 'Div 9 sub bid opportunity', 'estimate', 'storm', 'commercial', 'maintenance', 'problem', 'career', 'careers'].every(x => WT.inquiryHint(x) === ''), 'project, restoration, div9, estimate, storm, commercial, maintenance, problem, careers → the form type decides (lead / Hiring)');
ok(WT.ruleKind({ rawType: 'other', message: 'We offer SEO and marketing services for contractors. Book a demo!' }) === 'inquiry', 'rules: a sales pitch → inquiry');
ok(WT.ruleKind({ rawType: 'other', message: 'Our roof was damaged in the storm, can you give us an estimate?' }) === 'lead', 'rules: roof damage / estimate → lead');
ok(WT.ruleKind({ rawType: 'other', message: 'Question about my last invoice for the roof repair' }) === 'inquiry', 'rules: a billing question → inquiry');
ok(WT.ruleKind({ rawType: 'other', message: 'What are your office hours?' }) === 'inquiry', 'rules: a general question → inquiry');

console.log('# the website form');
seed();
let r = await post(Object.assign({ type: 'sub', message: 'We are a drywall and ACT crew and would like to bid your commercial jobs.' }, base));
let t = tasks();
ok(r.status === 200 && r.j.kind === 'inquiry' && t.length === 1, 'sub → an inquiry (one To-Do)', r.j);
ok(!inbox().length, 'sub → NOT a lead');
ok(t[0] && t[0].label === 'Inquiry: Becoming a GrayCo subcontractor — Dana Fakename, Fakeco Drywall LLC', 'title "Inquiry: <topic> — <name, company>"', t[0] && t[0].label);
ok(t[0] && !(t[0].assignees || []).length && visibleTo(t[0], 'Admin') && visibleTo(t[0], 'Office Admin') && !visibleTo(t[0], 'Project Manager'), 'shared: on every admin\'s AND every office user\'s To-Do (not a PM\'s)');
ok(t[0] && t[0].inquiry.kind === 'sub' && t[0].phone === '(901) 555-0123' && t[0].email === 'dana@fakeco.test' && t[0].done === false, 'sub kind (the CRM offers "Invite to sub onboarding"), phone + e-mail for Call / Reply');
ok(t[0] && ['From: Dana Fakename', 'Company: Fakeco Drywall LLC', 'E-mail: dana@fakeco.test', 'Phone: (901) 555-0123', 'Location: Bartlett, TN', 'Message: We are a drywall', 'Sent from: https://www.grayco-cs.com/contact', 'Received: '].every(x => t[0].note.indexOf(x) >= 0), 'the note: name, company, e-mail, phone, location, message, source page, received time', t[0] && t[0].note);
ok((kvget('gc_office_tasks') || []).some(x => x.id === 'T_OLD'), 'the office\'s other to-dos are kept');
ok(inqMail().length === 1 && JSON.stringify(inqMail()[0].to) === '["office@grayco-cs.com"]' && /New website inquiry: Becoming a GrayCo subcontractor/.test(inqMail()[0].subject) && !leadMail().length, 'one short "New website inquiry" e-mail to the lead-alert list (office@), no lead alert', W.sent.map(m => [m.to, m.subject]));
r = await post(Object.assign({ type: 'sub', message: 'We are a drywall and ACT crew and would like to bid your commercial jobs.' }, base));
ok(tasks().length === 1 && inqMail().length === 1 && r.j.duplicate === true, 'the same form twice the same day → still one To-Do, one e-mail');

seed();   /* "I'm reaching out about" as the field name */
r = await post(Object.assign({ "I'm reaching out about": 'sub', message: 'Painting contractor here.' }, base, { name: 'Lou Madeup', company: '' }));
ok(r.j.kind === 'inquiry' && tasks().length === 1 && /— Lou Madeup$/.test(tasks()[0].label), '"I\'m reaching out about: sub" (the live form\'s field) is read', r.j);

seed();   /* other + a vendor pitch: the AI is not scripted (500) → the word rules */
r = await post(Object.assign({}, base, { type: 'other', name: 'Sam Pitchman', company: 'Rankfast SEO', message: 'We help contractors get more leads with SEO and marketing. Can we book a quick demo?' }));
t = tasks();
ok(r.j.kind === 'inquiry' && t.length === 1 && t[0].label === 'Inquiry: Vendor / sales pitch — Sam Pitchman, Rankfast SEO' && t[0].inquiry.kind === 'other' && !inbox().length, 'other + vendor pitch → inquiry "Vendor / sales pitch", not a lead', t[0] && t[0].label);
ok(W.ai.length === 1, 'the AI was asked once (it failed → the word rules)');

seed();   /* other + the AI says inquiry with its own topic */
W.aiQ.push({ content: [{ type: 'text', text: '{"kind":"inquiry","topic":"Warranty paperwork request"}' }], stop_reason: 'end_turn' });
r = await post(Object.assign({}, base, { type: 'other', name: 'Ann Testerly', company: '', message: 'Can you send me a copy of the warranty you gave us last year?' }));
ok(r.j.kind === 'inquiry' && tasks().length === 1 && tasks()[0].label === 'Inquiry: Warranty paperwork request — Ann Testerly' && tasks()[0].inquiry.by === 'ai', 'other → the AI\'s topic', tasks()[0] && tasks()[0].label);
ok(W.ai[0] && W.ai[0].body.max_tokens <= 400 && JSON.stringify(W.ai[0].body.messages).length < 4000, 'a short prompt, a small answer');

seed();   /* other + the AI says lead → a lead as before */
W.aiQ.push({ content: [{ type: 'text', text: '{"kind":"lead","topic":"Church roof"}' }], stop_reason: 'end_turn' });
r = await post(Object.assign({}, base, { type: 'other', name: 'Rev Imaginary', company: '', message: 'Our church needs someone to look at the roof.' }));
ok(r.j.kind === 'lead' && inbox().length === 1 && !tasks().length, 'other + the AI says lead → a lead, no To-Do', r.j);

seed();   /* other + a work request, AI down → rules → lead */
r = await post(Object.assign({}, base, { type: 'other', name: 'Max Notreal', company: '', message: 'We had hail damage and need a repair estimate.' }));
ok(r.j.kind === 'lead' && inbox().length === 1 && !tasks().length && !inqMail().length, 'other + "hail damage … estimate" (rules) → a lead', r.j);

for (const ty of ['project', 'restoration', 'div9', 'estimate', 'storm', 'commercial']) {
  seed();
  r = await post(Object.assign({}, base, { type: ty, name: 'Lead ' + ty + ' Person', address: '12 Fake St', city: 'Bartlett', zip: '38135', message: 'Please call me.' }));
  ok(r.j.kind === 'lead' && inbox().length === 1 && !tasks().length && !inqMail().length && W.ai.length === 0, ty + ' → a lead, unchanged (no To-Do, no AI)', [r.j, inbox().map(x => x.title)]);
}
seed();
r = await post(Object.assign({}, base, { type: 'careers', name: 'Jo Applicant', position: 'Carpenter', message: 'I would like to apply.' }));
ok(r.j.kind === 'application' && apps().length === 1 && !inbox().length && !tasks().length, 'careers → Hiring, unchanged (no lead, no To-Do)', r.j);

console.log('# convert to lead (the To-Do\'s button)');
seed();
await post(Object.assign({ type: 'sub', message: 'Roofing sub looking for work.' }, base));
const tid = tasks()[0].id;
let c = await web.handler(ev('POST', { qs: { act: 'inquiry-lead' }, body: { id: tid } }));
ok(c.statusCode === 401 && !inbox().length, 'no sign-in → 401');
c = await web.handler(ev('POST', { qs: { act: 'inquiry-lead' }, body: { id: tid }, auth: 'tok-office' }));
let cj = JSON.parse(c.body);
const conv = inbox()[0], doneT = (kvget('gc_office_tasks') || []).find(x => x.id === tid);
ok(c.statusCode === 200 && cj.ok && conv && conv.contact.name === 'Dana Fakename' && conv.contact.email === 'dana@fakeco.test' && conv.websiteLead, 'office: Convert to lead → a website lead with the contact', cj);
ok(doneT && doneT.done === true && doneT.leadId === cj.leadId && doneT.doneBy, 'the To-Do is marked done, with the lead id', doneT);
c = await web.handler(ev('POST', { qs: { act: 'inquiry-lead' }, body: { id: tid }, auth: 'tok-office' }));
ok(JSON.parse(c.body).ok && inbox().length === 1, 'twice → still one lead');
c = await web.handler(ev('POST', { qs: { act: 'inquiry-lead' }, body: { id: 'nope' }, auth: 'tok-admin' }));
ok(c.statusCode === 400, 'an unknown id → 400');

console.log('# leads@ e-mail (fromEmail): the same rule');
const nf = (type, extra) => ({ from: { email: 'formresponses@netlify.com', name: 'Netlify' }, subject: '[Netlify] New form submission from contact', headers: {}, messageId: '<nf-' + type + '-' + (extra || '') + '@netlify.com>',
  text: 'Name: Kit Inventedname\nCompany: Inventco Ceilings\nEmail: kit@inventco.test\nPhone: (901) 555-0177\n' + (type ? "I'm reaching out about: " + type + '\n' : '') + 'Location: Memphis, TN\nMessage: ' + (extra || 'Hello there.') + '\n' });
seed();
let e = await web.fromEmail(nf('sub', 'We install acoustical ceilings and want to work with you.'));
t = tasks();
ok(e.ok && e.inquiry && t.length === 1 && t[0].label === 'Inquiry: Becoming a GrayCo subcontractor — Kit Inventedname, Inventco Ceilings' && !inbox().length, 'e-mail "I\'m reaching out about: sub" → inquiry, not a lead', [e, t[0] && t[0].label]);
ok(t[0] && /Sent from: an e-mail to leads@grayco-cs\.com/.test(t[0].note) && /Location: Memphis, TN/.test(t[0].note) && t[0].inquiry.via === 'email', 'e-mail inquiry: source = leads@ e-mail, location kept', t[0] && t[0].note);
ok(inqMail().length === 1, 'e-mail inquiry → one "New website inquiry" e-mail');
e = await web.fromEmail(nf('sub', 'We install acoustical ceilings and want to work with you.'));
ok(tasks().length === 1 && inqMail().length === 1, 'the same e-mail again → still one To-Do');
seed();
e = await web.fromEmail(Object.assign(nf('', ''), { text: 'Name: Kit Inventedname\nEmail: kit@inventco.test\nPhone: (901) 555-0177\nType: sub\nMessage: Sub here.\n' }));
ok(e.inquiry && tasks().length === 1, 'e-mail "Type: sub" → inquiry', e);
seed();
e = await web.fromEmail(nf('other', 'We sell lead generation software for roofers. Free demo this week!'));
ok(e.inquiry && tasks().length === 1 && /Vendor \/ sales pitch/.test(tasks()[0].label) && !inbox().length, 'e-mail other + sales pitch → inquiry', e);
seed();
e = await web.fromEmail(nf('project', 'New office buildout, need a bid.'));
ok(e.lead && inbox().length === 1 && !tasks().length, 'e-mail project → a lead, unchanged', e);
seed();
e = await web.fromEmail(nf('restoration', 'Water damage in our kitchen.'));
ok(e.lead && inbox().length === 1 && !tasks().length, 'e-mail restoration → a lead', e);
seed();
e = await web.fromEmail(nf('career', 'I am a carpenter looking for work.'));
ok(e.application && !inbox().length && !tasks().length, 'e-mail careers → Hiring, unchanged', e);
seed();
e = await web.fromEmail({ from: { email: 'bob@fakehome.test', name: 'Bob Pretend' }, subject: 'Need a roof quote', headers: {}, messageId: '<b1@x>', text: 'Hi, I need a quote for a new roof at 55 Oak Ln, Arlington. Call me 901-555-0177.' });
ok(e.lead && !tasks().length, 'a person writing in for a roof quote → a lead (as before)', e);
seed();
e = await web.fromEmail({ from: { email: 'pat@pretendvendor.test', name: 'Pat Pretend' }, subject: 'Partnership opportunity', headers: {}, messageId: '<p1@x>', text: 'Hi, we would love to explore a partnership with GrayCo. Let me know a good time to talk. 901-555-0188' });
ok(e.inquiry && tasks().length === 1 && /^Inquiry: Partnership — Pat Pretend$/.test(tasks()[0].label), 'a partnership e-mail → inquiry "Partnership"', [e, tasks()[0] && tasks()[0].label]);
seed();
e = await web.fromEmail({ from: { email: 'office@grayco-cs.com', name: 'Office' }, subject: 'Fwd: call from Lee', headers: {}, messageId: '<s1@x>', text: 'Lee Fictional called, wants us to call back 901-555-0199 about something.' });
ok(e.lead && !tasks().length, 'a lead a GrayCo person sends in stays a lead', e);

console.log('\n' + (fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed' + (fail ? '\nFAILED: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
