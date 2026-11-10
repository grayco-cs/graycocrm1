/* patch LSATEXT tests: node tools/tests/test_LSATEXT.js — Google LSA lead → Wesley's and Nick's cells; they text back GOOD / BAD (mocked; nothing sent) */
'use strict';
const assert = require('assert');
const path = require('path');
process.env.TWILIO_FROM = '+19015550999'; process.env.CRM_URL = 'https://crm.test';
const SA = require(path.join(__dirname, '../../netlify/functions/_lib/smsalert.js'));
const USERS = [{ name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '(901) 555-0002', active: true },
  { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM', cell: '9015550003', active: true }];
const NIGHT = Date.parse('2026-10-29T08:00:00Z');   /* 3 AM Central: an LSA text still goes */
const kv = {}, sent = [], decided = [];
let t = NIGHT;
Object.assign(SA._D, { now: () => t, kvGet: async k => kv[k], kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true, value: kv[k] }; },
  send: async (to, body) => { sent.push({ to, body }); return { ok: true }; }, paused: async () => false, optouts: async () => ({}), consentNo: async () => false,
  people: async () => ({ users: USERS, staff: [] }), postReply: async m => ({ id: m.id }), hours: async () => null, lsaDecide: async d => { decided.push(d); return { inbox: true, list: true, todo: !d.good }; } });
(async () => {
  const lead = { id: 'LSA1', key: 'LSA1', title: 'Roof replacement', source: 'Google LSA', contact: { name: 'Pat Smith', phone: '(901) 555-0111' } };
  await SA.leads([lead], { LSA1: { id: 'LSA1', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', said: { message: 'Need a new roof' } } } }, () => false);
  const code = SA._lsaCode('LSA1');
  assert.deepStrictEqual(sent.map(x => x.to).filter(x => x !== '9015550111').sort(), ['9015550001', '9015550002'], 'Nick and Wesley get it (even at 3 AM), not the PM');
  assert.ok(sent.some(x => x.to === '9015550111' && /Reply YES/.test(x.body)), 'the customer gets the qualify text (LSAFLOW; held to 7 AM by custquiet in production)');
  sent.splice(0, sent.length, ...sent.filter(x => x.to !== '9015550111'));
  assert.ok(new RegExp('^GrayCo: Google LSA lead ' + code + ' from \\(901\\) 555-0111 Pat Smith says "Need a new roof"\\. Reply GOOD \\+ PM name \\(e\\.g\\. GOOD Pat\\), SEND \\+ PM name \\(the PM calls first\\), BAD \\+ why, or NA if no answer\\.').test(sent.find(x => x.to === '9015550001').body) && sent[0].body.length <= 320, sent.find(x => x.to === '9015550001').body);
  sent.length = 0;
  /* Wesley texts "bad spam call" (no code: the newest LSA lead sent to his phone) */
  let r = await SA.staffInbound('9015550002', 'Bad spam call', 'SM1');
  assert.ok(r && r.lsa === 'LSA1' && r.good === false && r.reason === 'spam call', JSON.stringify(r));
  assert.ok(decided[0].good === false && decided[0].reason === 'spam call' && decided[0].byEmail === 'wjohnson@grayco-cs.com');
  assert.ok(/marked BAD \(spam call\) — closed, no PM\. Dispute it in Google: https:\/\/ads\.google\.com\/localservices\/leads/.test(sent[0].body) && sent[0].to === '9015550002', 'he gets a confirmation with the Google link: ' + sent[0].body);
  assert.ok(/^https:\/\/ads\.google\.com\/localservices\//.test(decided[0].link), 'the To-Do gets the link');
  /* Nick texts "GOOD <code>" */
  sent.length = 0; t += 60000;
  r = await SA.staffInbound('9015550001', 'good ' + code, 'SM2');
  assert.ok(r && r.lsa === 'LSA1' && r.good === true && decided[1].good === true, JSON.stringify(r));
  /* the same message twice is handled once */
  r = await SA.staffInbound('9015550001', 'good ' + code, 'SM2');
  assert.ok(r && r.skipped === 'already handled');
  /* some other text from a staff phone is not an LSA answer */
  r = await SA.staffInbound('9015550001', 'on my way', 'SM3');
  assert.ok(!r || !r.lsa, 'not an LSA answer');
  /* after 72 h the code is gone */
  t += 73 * 3600e3;
  r = await SA.staffInbound('9015550002', 'GOOD', 'SM4');
  assert.ok(!r || !r.lsa, 'expired');
  /* a normal lead still goes the normal way */
  sent.length = 0; t = Date.parse('2026-10-28T15:00:00Z');
  await SA.leads([{ id: 'N1', key: 'N1', title: 'Kitchen', contact: { name: 'Al', phone: '9015550122' } }], { N1: { id: 'N1' } }, () => false);
  assert.ok(sent.length && /^GrayCo: new lead [A-Z0-9]{4} from \(901\) 555-0122 Al\./.test(sent[0].body), sent[0] && sent[0].body);   /* LEADTEXT */
  sent.length = 0;
  await SA.leads([{ id: 'W1', key: 'W1', title: 'Website', source: 'Website', websiteLead: true, contact: { name: 'Jo Web', phone: '9015550133' } }], { W1: { id: 'W1', websiteLead: true, leadExtra: { websiteForm: 'Contact' }, said: { message: 'Need gutters' } } }, () => false);
  assert.ok(/^GrayCo: GrayCo website lead [A-Z0-9]{4} from \(901\) 555-0133 Jo Web/.test(sent[0].body) && !sent.some(x => x.to === '9015550133'), 'a website lead: the shape, and no qualify text to the customer: ' + sent[0].body);
  sent.length = 0;
  await SA.leads([{ id: 'B1', key: 'B1', title: 'School reroof', source: 'BuildingConnected', type: 'bid', bidDue: '2026-11-20', contact: { name: 'GC', phone: '9015550144' } }], { B1: { id: 'B1' } }, () => false);
  assert.ok(!sent.some(x => /GOOD \+ PM name/.test(x.body)), 'a bid invite keeps the old path');
  /* ── LSAFLOW: the qualify text to the customer, their YES, the PM text ── */
  sent.length = 0; t = Date.parse('2026-10-28T15:00:00Z'); let verified = [];
  SA._D.lsaVerified = async id => { verified.push(id); return true; };
  await SA.leads([{ id: 'LSA2', key: 'LSA2', title: 'Water damage', source: 'Google LSA', contact: { name: 'Ann Lee', phone: '9015550144' } }], { LSA2: { id: 'LSA2', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending', service: 'Water damage' } } }, () => false);
  const ask = sent.find(x => x.to === '9015550144');
  assert.ok(ask && /^Hi Ann, this is GrayCo Construction Services\. We received your request through Google about water damage\. Reply YES/.test(ask.body), ask && ask.body);
  sent.length = 0;
  let c = await SA.lsaCustomer('9015550144', 'Yes please');
  assert.ok(c && c.lsaVerified === 'LSA2' && verified[0] === 'LSA2', JSON.stringify(c));
  assert.ok(sent.some(x => x.to === '9015550144' && /you're confirmed/.test(x.body)), 'the customer is thanked');
  assert.ok(sent.some(x => x.to === '9015550001' && /confirmed by text \(YES\)/.test(x.body)) && sent.some(x => x.to === '9015550002'), 'Nick and Wesley are told');
  assert.strictEqual(await SA.lsaCustomer('9015550144', 'yes'), null, 'a second YES does nothing more');
  assert.strictEqual(await SA.lsaCustomer('9015550199', 'yes'), null, 'a stranger\'s YES is not an LSA answer');
  sent.length = 0;
  let pmr = await SA.lsaPmText({ id: 'LSA2', source: 'Google LSA', lsaCheck: 'good', contact: { name: 'Ann Lee', phone: '9015550144' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(pmr && pmr.sent && /^Hi Ann, your GrayCo project manager is Pat PM — \(901\) 555-0003\. They will be calling you shortly\./.test(sent[0].body), sent[0] && sent[0].body);
  pmr = await SA.lsaPmText({ id: 'LSA2', source: 'Google LSA', lsaCheck: 'good', contact: { name: 'Ann Lee', phone: '9015550144' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(pmr && pmr.skipped === 'already sent');
  pmr = await SA.lsaPmText({ id: 'LSA3', source: 'Google LSA', lsaCheck: 'bad', contact: { name: 'X', phone: '9015550155' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(pmr && pmr.skipped === 'marked bad');
  pmr = await SA.lsaPmText({ id: 'N9', source: 'Website', contact: { name: 'X', phone: '9015550155' } }, { assignee: 'Pat PM' });
  assert.strictEqual(pmr, null, 'not an LSA lead');
  /* ── LSAPM: "GOOD, PM is Pat" assigns the PM · LSANA: "no answer" keeps it open ── */
  decided.length = 0; sent.length = 0; t = Date.parse('2026-10-28T15:00:00Z');
  await SA.leads([{ id: 'LSA5', key: 'LSA5', title: 'Fire damage', source: 'Google LSA', contact: { name: 'Bo Roe', phone: '9015550166' } }], { LSA5: { id: 'LSA5', source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } } }, () => false);
  let g = await SA.staffInbound('9015550002', 'Good, PM is Pat', 'SM10');
  assert.ok(g && g.good && g.pm === 'Pat PM' && decided[0].pm && decided[0].pm.email === 'pat@grayco-cs.com', JSON.stringify(g));
  assert.ok(sent.some(x => x.to === '9015550002' && /PM Pat PM assigned/.test(x.body)), 'Wesley is told the PM is set');
  g = await SA.staffInbound('9015550002', 'good zed', 'SM11');
  assert.ok(g && g.good && !g.pm && g.notes === 'zed' && sent.some(x => /no PM set/.test(x.body)), JSON.stringify(g));
  let na = await SA.staffInbound('9015550001', 'no answer', 'SM12');
  assert.ok(na && na.noAnswer && decided.slice(-1)[0].noAnswer === true && sent.some(x => x.to === '9015550001' && /NO ANSWER — kept open/.test(x.body)), JSON.stringify(na));
  na = await SA.staffInbound('9015550001', 'NA', 'SM13');
  assert.ok(na && na.noAnswer, 'NA works too');
  /* ── LSAMSG: a text from the LSA lead → the admins' cells, answerable from the cell ── */
  sent.length = 0; t += 5 * 60000;
  const it = await SA.inboundText({ ph: '9015550166', body: 'What time can you come?', who: { kind: 'lead', name: 'Bo Roe' }, pid: '' });
  assert.ok(it && it.sent === 2 && sent.every(x => /^GrayCo: LSA lead .* Bo Roe \(901\) 555-0166 texted: "What time can you come\?"/.test(x.body) || /LSA lead/.test(x.body)), JSON.stringify(sent));
  sent.length = 0;
  const rr = await SA.staffInbound('9015550002', 'Tomorrow at 10 works', 'SM20');
  assert.ok(rr && rr.replied && rr.to === '9015550166' && sent.some(x => x.to === '9015550166' && /Tomorrow at 10 works/.test(x.body)), JSON.stringify(rr));
  sent.length = 0; t += 60000;
  const np = await SA.staffInbound('9015550002', 'No problem, see you then', 'SM21');
  assert.ok(np && np.replied && !np.lsa && sent.some(x => x.to === '9015550166'), 'a "No problem…" reply goes to the customer, it is not BAD: ' + JSON.stringify(np));
  const WI = require(path.join(__dirname, '../../netlify/functions/website-intake.js'))._lib;
  assert.strictEqual(WI.lsaLinkOf('<a href="https://ads.google.com/localservices/lead/123456?hl=en&amp;x=1">View lead</a> https://support.google.com/localservices'), 'https://ads.google.com/localservices/lead/123456?hl=en&x=1');
  assert.strictEqual(WI.lsaLinkOf('no link here'), '');
  /* LSANAME: just the PM's name = GOOD + that PM */
  decided.length = 0; sent.length = 0; t += 60000;
  await SA.leads([{ id: 'LSA7', key: 'LSA7', title: 'Storm', source: 'Google LSA', contact: { name: 'Cy Doe', phone: '9015550177' } }], { LSA7: { id: 'LSA7', source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } } }, () => false);
  const pn = await SA.staffInbound('9015550001', 'Pat', 'SM30');
  assert.ok(pn && pn.good && pn.pm === 'Pat PM' && decided[0].leadId === 'LSA7', JSON.stringify(pn));
  const nn = await SA.staffInbound('9015550001', 'Pat will call you', 'SM31');
  assert.ok(!nn || !nn.lsa, 'a sentence is not a PM name');
  /* LSANOTES: the rest of the text is a note */
  decided.length = 0; t += 60000;
  await SA.leads([{ id: 'LSA8', key: 'LSA8', title: 'Roof', source: 'Google LSA', contact: { name: 'Di Ray', phone: '9015550188' } }], { LSA8: { id: 'LSA8', source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } } }, () => false);
  let nt = await SA.staffInbound('9015550002', 'GOOD Pat roof is 20 years old', 'SM40');
  assert.ok(nt && nt.pm === 'Pat PM' && nt.notes === 'roof is 20 years old' && decided[0].notes === 'roof is 20 years old', JSON.stringify(nt));
  nt = await SA.staffInbound('9015550002', 'no answer left a voicemail', 'SM41');
  assert.ok(nt && nt.noAnswer && decided[1].notes === 'left a voicemail', JSON.stringify(decided[1]));
  nt = await SA.staffInbound('9015550002', 'bad wanted a free inspection only', 'SM42');
  assert.ok(nt && nt.good === false && decided[2].notes === 'wanted a free inspection only', JSON.stringify(decided[2]));
  /* ── LSASEND: "SEND Pat" → Pat's text; Pat's GOOD / BAD ── */
  const sends = [], pmbads = [];
  SA._D.lsaSend = async d => { sends.push(d); return { inbox: true }; };
  SA._D.lsaPmBad = async d => { pmbads.push(d); return { inbox: true, todo: true }; };
  decided.length = 0; sent.length = 0; t += 60000;
  await SA.leads([{ id: 'LSA9', key: 'LSA9', title: 'Leak', source: 'Google LSA', contact: { name: 'Ed Fox', phone: '9015550199' } }], { LSA9: { id: 'LSA9', source: 'Google LSA', leadExtra: { lsaCheck: 'pending', said: { message: 'Ceiling stain in hallway' } } } }, () => false);
  sent.length = 0;
  let sd = await SA.staffInbound('9015550002', 'send lead to Pat call after 3', 'SM50');
  assert.ok(sd && sd.sent === 'Pat PM' && sends[0].pm.email === 'pat@grayco-cs.com' && sends[0].notes === 'call after 3', JSON.stringify(sd));
  const pmMsg = sent.find(x => x.to === '9015550003');
  assert.ok(pmMsg && /sent to you by Wesley: \(901\) 555-0199 Ed Fox says "Ceiling stain in hallway" Note: call after 3\. Call them, then reply GOOD, BAD \+ why, or NA/.test(pmMsg.body), pmMsg && pmMsg.body);
  assert.ok(sent.some(x => x.to === '9015550002' && /sent to Pat PM \(texted\)/.test(x.body)), 'Wesley is told');
  /* Pat says BAD → not final, the admins are asked */
  sent.length = 0;
  let pb = await SA.staffInbound('9015550003', 'bad just wanted a price for insurance', 'SM51');
  assert.ok(pb && pb.byPm && pb.pmBad === 'just wanted a price for insurance' && pmbads[0].reason === 'just wanted a price for insurance' && decided.length === 0, JSON.stringify(pb));
  assert.ok(sent.some(x => x.to === '9015550001' && /Pat PM says BAD for .* Reply BAD .* to confirm/.test(x.body)) && sent.some(x => x.to === '9015550002'), 'Nick and Wesley are asked to approve');
  /* Wesley confirms BAD → final */
  let wb = await SA.staffInbound('9015550002', 'BAD', 'SM52');
  assert.ok(wb && wb.lsa === 'LSA9' && wb.good === false && decided[0].good === false && decided[0].reason === 'just wanted a price for insurance' || (wb && wb.good === false), JSON.stringify(wb));
  /* another lead: Pat says GOOD → his, admins told */
  decided.length = 0; sent.length = 0; t += 60000;
  await SA.leads([{ id: 'LSA10', key: 'LSA10', title: 'Roof', source: 'Google LSA', contact: { name: 'Fay Gee', phone: '9015550200' } }], { LSA10: { id: 'LSA10', source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } } }, () => false);
  await SA.staffInbound('9015550001', 'SEND Pat', 'SM53');
  sent.length = 0;
  let pg = await SA.staffInbound('9015550003', 'good 2 story house needs full roof', 'SM54');
  assert.ok(pg && pg.byPm && pg.good && decided[0].pm.email === 'pat@grayco-cs.com' && decided[0].keepPm && decided[0].notes === '2 story house needs full roof', JSON.stringify(pg));
  assert.ok(sent.some(x => x.to === '9015550001' && /Pat PM says GOOD/.test(x.body)), 'the admins hear it');
  /* a PM cannot SEND */
  const ps = await SA.staffInbound('9015550003', 'send to Mo', 'SM55');
  assert.ok(!ps || !ps.sent, 'a PM cannot send leads');
  /* PMSAID / PMCHANGE */
  decided.length = 0; sent.length = 0; t += 60000;
  await SA.leads([{ id: 'LSA11', key: 'LSA11', title: 'Roof', source: 'Google LSA', contact: { name: 'Gil Hu', phone: '9015550211' } }], { LSA11: { id: 'LSA11', source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } } }, () => false);
  let ws = await SA.staffInbound('9015550001', 'Good Wesley is pm', 'SM60');
  assert.ok(ws && ws.pm === 'Wesley Johnson' && !ws.notes, 'no "is pm" note: ' + JSON.stringify(ws));
  await SA.leads([{ id: 'LSA12', key: 'LSA12', title: 'Roof', source: 'Google LSA', contact: { name: 'Hal Ive', phone: '9015550212' } }], { LSA12: { id: 'LSA12', source: 'Google LSA', leadExtra: { lsaCheck: 'pending' } } }, () => false);
  ws = await SA.staffInbound('9015550001', 'Wesley is pm', 'SM61');
  assert.ok(ws && ws.good && ws.pm === 'Wesley Johnson', '"Wesley is pm" = GOOD + Wesley: ' + JSON.stringify(ws));
  sent.length = 0;
  let ch = await SA.lsaPmText({ id: 'LSA12', source: 'Google LSA', lsaCheck: 'good', contact: { name: 'Hal Ive', phone: '9015550212' } }, { assignee: 'Wesley Johnson', assigneeEmail: 'wjohnson@grayco-cs.com' });
  assert.ok(ch && ch.sent && /project manager is Wesley Johnson/.test(sent[0].body));
  ch = await SA.lsaPmText({ id: 'LSA12', source: 'Google LSA', lsaCheck: 'good', contact: { name: 'Hal Ive', phone: '9015550212' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(ch && ch.sent && /project manager is now Pat PM — \(901\) 555-0003/.test(sent[1].body), sent[1] && sent[1].body);
  ch = await SA.lsaPmText({ id: 'LSA12', source: 'Google LSA', lsaCheck: 'good', contact: { name: 'Hal Ive', phone: '9015550212' } }, { assignee: 'Pat PM', assigneeEmail: 'pat@grayco-cs.com' });
  assert.ok(ch && ch.skipped, 'the same PM again: nothing');
  /* LEADNUM: lead texts from the main number; other alerts from TWILIO_FROM_ALERTS */
  process.env.TWILIO_FROM_ALERTS = '+19015550888';
  const sentFrom = []; const send0 = SA._D.send; SA._D.send = async (to, body, from) => { sentFrom.push({ to, body, from }); return { ok: true }; };
  t = Date.parse('2026-10-28T15:00:00Z') + 9e6;
  await SA.leads([{ id: 'N55', key: 'N55', title: 'Kitchen', contact: { name: 'Lu', phone: '9015550255' } }], { N55: { id: 'N55' } }, () => false);
  await SA.notify({ type: 'missed', text: 'missed call from Mo', link: 'https://crm.test', only: ['nthomas@grayco-cs.com'], thread: 'p:9015550266' });
  assert.ok(sentFrom.filter(x => /new lead/.test(x.body)).every(x => x.from === '+19015550999') && sentFrom.some(x => /missed call/.test(x.body) && x.from === '+19015550888'), JSON.stringify(sentFrom.map(x => [x.from, x.body.slice(0, 30)])));
  SA._D.send = send0; delete process.env.TWILIO_FROM_ALERTS;
  /* JOBNOTE: "S251 note" → the job's notes */
  const notes = []; SA._D.jobs = async () => ({ projects: [{ id: 'P1', name: 'Smith Roof', autoPO: 'S251', pm: 'Pat PM' }, { id: 'P2', name: 'Jones Bath', autoPO: 'B300', pm: 'Mo Mit' }], gc_deleted_projects: [] });
  SA._D.textNote = async row => { notes.push(row); return true; };
  sent.length = 0; t += 60000;
  let jn = await SA.staffInbound('9015550002', 'S251 dumpster pulled, final walk Friday', 'SM70');
  assert.ok(jn && jn.jobNote === 'added' && notes[0].pid === 'P1' && notes[0].text === 'dumpster pulled, final walk Friday' && sent.some(x => /added to S251 Smith Roof notes/.test(x.body)), JSON.stringify(jn));
  jn = await SA.staffInbound('9015550002', '#b300: tile delivered', 'SM71');
  assert.ok(jn && jn.jobNote === 'added' && notes[1].pid === 'P2' && notes[1].text === 'tile delivered', 'an admin: any job');
  jn = await SA.staffInbound('9015550003', 'B300 not mine', 'SM72');
  assert.ok(jn && jn.jobNote === 'not yours' && notes.length === 2, 'a PM: only his own jobs');
  jn = await SA.staffInbound('9015550003', 'S251 shingles on site', 'SM73');
  assert.ok(jn && jn.jobNote === 'added', 'Pat on his own job');
  jn = await SA.staffInbound('9015550002', 'X999 not a job', 'SM74');
  assert.ok(!jn || !jn.jobNote, 'no such PO: not a job note');
  const users0 = SA._D.people; SA._D.people = async () => ({ users: USERS.concat([{ name: 'Ray Super', email: 'ray@grayco-cs.com', role: 'Superintendent', cell: '9015550222', active: true }]), staff: [] });
  const jd = await SA._D.jobs(); SA._D.jobs = async () => ({ projects: jd.projects.concat([{ id: 'P3', name: 'Lee Deck', autoPO: 'D410', superintendent: 'Ray Super' }]), gc_deleted_projects: [] });
  jn = await SA.staffInbound('9015550222', 'D410 railing installed', 'SM75');
  assert.ok(jn && jn.jobNote === 'added' && notes.slice(-1)[0].pid === 'P3', 'a staff cell not on the alert list can add a job note: ' + JSON.stringify(jn));
  jn = await SA.staffInbound('9015550222', 'hello there', 'SM76');
  assert.strictEqual(jn, null, 'anything else from him goes the normal way');
  SA._D.people = users0;
  /* HOWTO: after 30 days the how-to tail is gone */
  sent.length = 0; t += 31 * 864e5;
  await SA.leads([{ id: 'N77', key: 'N77', title: 'Gutters', contact: { name: 'Ty', phone: '9015550277' } }], { N77: { id: 'N77' } }, () => false);
  const old = sent.find(x => x.to === '9015550002');
  assert.ok(old && /^GrayCo: new lead [A-Z0-9]{4} from \(901\) 555-0277 Ty\.$/.test(old.body), 'no how-to after a month: ' + (old && old.body));
  console.log('LSATEXT tests: all passed');
})().catch(e => { console.error(e); process.exit(1); });
