// test_LEADTXT_fn.mjs [worktree] — patch LEADTXT (owner 11/19: "How do I say good or bad if I get 2-3 or more texts … just say
// bad bad bad good bad, or is there a better way"). Node only: netlify/functions/_lib/smsalert.js with a mocked store and a mocked SMS
// sender (nothing is sent, nothing is written anywhere). Made-up people and leads.
//   1. every lead text (Google LSA, website, text / missed-call, 🚨 emergency, NEW LEAD bid, office-checked LSA call, the PM's SEND text)
//      carries its 4-letter code and "Reply GOOD <code> / BAD <code>" — also after the first month; the mitigation manager and a sub
//      bid's estimator get no GOOD / BAD hint;
//   2. one reply answers several leads: "BAD c1 c2, GOOD c3 Steven", "bad c1 bad c2 good c3", "c1 bad, c2 good", "BAD c1 c2 spam",
//      "bad c1, good" and the bare "bad bad good" (in order to the open leads, oldest first — only when the counts match; otherwise
//      nothing is saved and the reply lists the open leads with code + name);
//   3. a plain GOOD / BAD with no code and no open lead never re-marks an answered lead (asks which lead); one open lead works as before;
//   4. ONE confirmation text, one line per lead; the old single answers (GOOD, BAD why, GOOD code, BAD code why, GOOD Steven, a bare PM
//      name, NA, no answer + notes, SEND, "Good, PM is …", "No problem…" to the customer) still work.
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WT = path.resolve(process.argv[2] || path.join(HERE, '../..'));
Object.assign(process.env, { TWILIO_FROM: '+19015550999', CRM_URL: 'https://crm.test', OWNER_EMAILS: 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com' });
['TWILIO_FROM_ALERTS', 'SMS_ALERTS_OFF', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'].forEach(k => { delete process.env[k]; });
const SA = require(path.join(WT, 'netlify/functions/_lib/smsalert.js'));

let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 900) : '')); } }

const NICK = '9015550001', WES = '9015550002', STEVEN = '9015550003', MO = '9015550004', GLENN = '9015550005';
const USERS = [
  { name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'admin', phone: '901-555-0001', active: true },
  { name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'admin', cell: '(901) 555-0002', active: true },
  { name: 'Steven Hall', email: 'steven@grayco-cs.com', role: 'PM', cell: '9015550003', active: true },
  { name: 'Mo Mit', email: 'mo@grayco-cs.com', role: 'Mitigation Manager', cell: '9015550004', active: true },
  { name: 'Glenn Est', email: 'glenn@grayco-cs.com', role: 'Estimator', cell: '9015550005', active: true }
];
const DAY = Date.parse('2026-10-29T15:00:00Z');   /* a Thursday, 10 AM Central */
const kv = {}, sent = [], decided = [], sends = [], pmbads = [], tlog = [], acks = [];
let t = DAY, inbox = [];
Object.assign(SA._D, {
  now: () => t,
  kvGet: async k => k === 'gc_lead_inbox' ? inbox : kv[k],
  kvCas: async (k, f) => { if (k === 'gc_lead_inbox') return { ok: true }; const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true, value: kv[k] }; },
  send: async (to, body, from) => { sent.push({ to, body, from }); return { ok: true }; },
  paused: async () => false, optouts: async () => ({}), consentNo: async () => false, hours: async () => null,
  people: async () => ({ users: USERS, staff: [] }),
  vetTodo: async () => true, postReply: async m => ({ id: m.id }), textLog: async row => { tlog.push(row); return true; },
  lsaDecide: async d => { decided.push(d); return { inbox: true, list: true, todo: !d.good }; },
  lsaSend: async d => { sends.push(d); return { inbox: true }; },
  lsaPmBad: async d => { pmbads.push(d); return { inbox: true, todo: true }; },
  ack: async (id, why) => { acks.push({ id, why }); return { ok: true }; },
  lsaVerified: async () => true, jobs: async () => ({ projects: [], gc_deleted_projects: [] })
});
const code = id => SA._lsaCode(id);
const to = ph => sent.filter(x => x.to === ph);
function reset(){ Object.keys(kv).forEach(k => { delete kv[k]; }); sent.length = 0; decided.length = 0; sends.length = 0; pmbads.length = 0; tlog.length = 0; acks.length = 0; inbox = []; t = DAY; }
let sid = 0;
const txt = (ph, body) => SA.staffInbound(ph, body, 'SMT' + (++sid));
/* a website lead (the LSA-shape lead text) — `n` people texts later, oldest first */
async function web(id, name, phone){ t += 60000; return SA.leads([{ id, key: id, title: 'Website', source: 'Website', websiteLead: true, contact: { name, phone } }], { [id]: { id, websiteLead: true, leadExtra: { websiteForm: 'Contact' } } }, () => false); }
async function three(){ await web('W1', 'Jo Smith', '9015550111'); await web('W2', 'Al Lee', '9015550122'); await web('W3', 'Ty Ray', '9015550133'); sent.length = 0; t += 60000; }

(async () => {
  console.log('1. every lead text carries the code + the GOOD / BAD hint');
  reset();
  await SA.leads([{ id: 'LSA1', key: 'LSA1', title: 'Roof', source: 'Google LSA', contact: { name: 'Pat Smith', phone: '(901) 555-0211' } }], { LSA1: { id: 'LSA1', source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending' } } }, () => false);
  let b = (to(WES)[0] || {}).body || '';
  ok(b.indexOf('Google LSA lead ' + code('LSA1')) > 0 && b.indexOf('Reply GOOD ' + code('LSA1') + ' / BAD ' + code('LSA1') + '.') > 0 && b.length <= 300, 'Google LSA lead: code + "Reply GOOD <code> / BAD <code>" (≤ 300)', b);
  ok(!to('9015550211').some(x => /Reply GOOD/.test(x.body)), 'the customer never sees the GOOD / BAD hint', to('9015550211'));
  sent.length = 0;
  await web('W0', 'Gina Web', '9015550212');
  b = (to(NICK)[0] || {}).body || '';
  ok(/^GrayCo: GrayCo website lead [A-Z0-9]{4} from/.test(b) && b.indexOf('Reply GOOD ' + code('W0') + ' / BAD ' + code('W0') + '.') > 0, 'website lead: code + hint', b);
  sent.length = 0;
  await SA.leads([{ id: 'T1', key: 'T1', title: 'Text message — Jane', source: 'Text message', contact: { name: 'Jane Doe', phone: '9015550213' } }], { T1: { id: 'T1', leadExtra: { textMessage: true, smsFrom: '9015550213', textBody: 'Roof leak' } } }, () => false);
  b = (to(WES)[0] || {}).body || '';
  ok(/^GrayCo: text lead [A-Z0-9]{4}/.test(b) && b.indexOf('Reply GOOD ' + code('T1') + ' / BAD ' + code('T1')) > 0, 'text lead: code + hint', b);
  /* 🚨 emergency (not LSA) */
  sent.length = 0;
  await SA.leads([{ id: 'E1', key: 'E1', title: 'Burst pipe', contact: { name: 'Bo Em', phone: '9015550214' } }], { E1: { id: 'E1', leadExtra: { said: { message: 'water everywhere' } } } }, () => true);
  const eW = (to(WES)[0] || {}).body || '', eM = (to(MO)[0] || {}).body || '';
  ok(/^🚨 GrayCo EMERGENCY: Bo Em \(901\) 555-0214 — "water everywhere"/.test(eW) && eW.indexOf('Reply GOOD ' + code('E1') + ' / BAD ' + code('E1') + '.') > 0 && eW.length <= 300, '🚨 emergency to an admin: same text + the code hint', eW);
  ok(/^🚨 GrayCo EMERGENCY: Bo Em/.test(eM) && !/Reply GOOD/.test(eM), 'the mitigation manager gets the emergency without the GOOD / BAD hint', eM);
  ok(!(kv[SA.SKEY].lsa[MO] || []).some(x => x.leadId === 'E1') && (kv[SA.SKEY].lsa[WES] || []).some(x => x.leadId === 'E1' && x.codeOnly), 'only the admins\' cells can answer it (by code)', kv[SA.SKEY].lsa[MO]);
  /* NEW LEAD (a prime bid) and a sub bid */
  sent.length = 0;
  await SA.leads([{ id: 'B1', key: 'B1', title: 'Church reroof', source: 'Dodge', type: 'bid', bidDue: '2026-11-20', contact: { name: 'Owner Rep', phone: '9015550215' } }], { B1: { id: 'B1', bidRole: 'prime' } }, () => false);
  b = (to(WES)[0] || {}).body || '';
  ok(/^GrayCo NEW LEAD: Owner Rep/.test(b) && b.indexOf('Reply GOOD ' + code('B1') + ' / BAD ' + code('B1') + '.') > 0, 'NEW LEAD (bid) to an admin: + the code hint', b);
  sent.length = 0;
  await SA.leads([{ id: 'B2', key: 'B2', title: 'School', source: 'BuildingConnected', gc: 'Big GC', type: 'bid', bidDue: '2026-11-20', contact: { name: 'GC PM', phone: '9015550216' } }], { B2: { id: 'B2', bidRole: 'sub' } }, () => false);
  ok(to(GLENN).length === 1 && !/Reply GOOD/.test(to(GLENN)[0].body) && !to(WES).length, 'a sub bid: only the estimator, no GOOD / BAD hint', sent);
  /* office-checked LSA call (lsaVetted) */
  sent.length = 0;
  await SA.lsaVetted({ leadId: 'V1', phone: '9015550217', name: 'Google LSA caller (2:31 PM)', note: 'roof leak', by: 'Office Olivia' });
  b = (to(NICK)[0] || {}).body || '';
  ok(b.indexOf('Reply GOOD ' + code('V1') + ' / BAD ' + code('V1') + '.') > 0, 'office-checked LSA call: code + hint', b);
  /* after the first month: the how-to goes, the short hint stays */
  t += 31 * 864e5; sent.length = 0;
  await web('W9', 'Old Timer', '9015550218');
  b = (to(WES)[0] || {}).body || '';
  ok(new RegExp('^GrayCo: GrayCo website lead ' + code('W9') + ' from \\(901\\) 555-0218 Old Timer\\. crm\\.test/#leads&lead=W9 Reply GOOD ' + code('W9') + ' / BAD ' + code('W9') + '\\.$').test(b), 'after 30 days: no how-to, the short hint stays', b);
  /* SEND → the PM's text */
  sent.length = 0;
  let r = await txt(WES, 'SEND ' + code('W9') + ' Steven');
  const pmB = (to(STEVEN)[0] || {}).body || '';
  ok(r && r.sent === 'Steven Hall' && pmB.indexOf('reply GOOD ' + code('W9') + ', BAD ' + code('W9') + ' + why') > 0, 'the PM\'s SEND text names the code in the reply hint', { r, pmB });

  console.log('2. one reply, several leads');
  reset(); await three();
  const [c1, c2, c3] = ['W1', 'W2', 'W3'].map(code);
  r = await txt(WES, 'BAD ' + c1 + ' ' + c2 + ', GOOD ' + c3 + ' Steven');
  ok(r && r.multi && r.results.length === 3, '"BAD c1 c2, GOOD c3 Steven" → 3 answers', r);
  ok(decided.length === 3 && decided[0].leadId === 'W1' && !decided[0].good && decided[1].leadId === 'W2' && !decided[1].good && decided[2].leadId === 'W3' && decided[2].good && decided[2].pm && decided[2].pm.email === 'steven@grayco-cs.com',
    'W1 BAD, W2 BAD, W3 GOOD with PM Steven', decided.map(d => [d.leadId, d.good, d.pm && d.pm.name, d.reason]));
  ok(decided[0].isLsa === false && decided[0].reason === 'no reason given', 'a website BAD is "not a real lead" (no Google dispute)', decided[0]);
  let conf = to(WES);
  ok(conf.length === 1, 'ONE confirmation text', conf);
  const lines = (conf[0] || { body: '' }).body.split('\n');
  ok(lines[0] === 'GrayCo: 3 leads updated:' && lines[1].indexOf(c1 + ' Jo Smith — BAD') === 0 && lines[2].indexOf(c2 + ' Al Lee — BAD') === 0 && lines[3].indexOf(c3 + ' Ty Ray — GOOD, PM Steven Hall assigned') === 0, 'one line per lead (code + name + result)', lines);
  ok(!/Dispute/.test(conf[0].body), 'no Google dispute line for website leads', conf[0].body);
  ok(tlog.filter(x => x.dir === 'in').map(x => x.leadId + ':' + x.result).join(' ') === 'W1:BAD W2:BAD W3:GOOD', 'the answer is on each lead\'s text log', tlog.filter(x => x.dir === 'in'));
  ok(kv[SA.SKEY].lsa[NICK].every(x => x.done), 'answered on Wesley\'s phone = answered on Nick\'s list too', kv[SA.SKEY].lsa[NICK]);

  reset(); await three();
  r = await txt(NICK, 'bad ' + c1 + ' bad ' + c2 + ' good ' + c3);
  ok(r && r.multi && decided.map(d => d.leadId + (d.good ? '+' : '-')).join(' ') === 'W1- W2- W3+' && to(NICK).length === 1, '"bad c1 bad c2 good c3"', decided.map(d => [d.leadId, d.good]));

  reset(); await three();
  r = await txt(WES, 'bad bad good');
  ok(r && r.multi && decided.map(d => d.leadId + (d.good ? '+' : '-')).join(' ') === 'W1- W2- W3+', '"bad bad good" with 3 open leads → oldest → newest', decided.map(d => [d.leadId, d.good]));
  ok(r.results.every(x => x.mapped) && /3 leads updated/.test(to(WES)[0].body), 'the summary lists them', to(WES));

  reset(); await three();
  r = await txt(WES, '👎👎👍');
  ok(r && r.multi && decided.map(d => d.leadId + (d.good ? '+' : '-')).join(' ') === 'W1- W2- W3+', '👎👎👍 works the same', decided.map(d => [d.leadId, d.good]));

  reset(); await three();
  r = await txt(WES, 'bad good');
  conf = to(WES);
  ok(r && r.lsaAsk === 'count' && decided.length === 0, '2 words, 3 open leads → nothing saved', r);
  ok(conf.length === 1 && /you sent 2 answers but 3 leads are open — nothing saved/.test(conf[0].body) && [c1 + ' Jo Smith', c2 + ' Al Lee', c3 + ' Ty Ray'].every(x => conf[0].body.indexOf(x) > 0) && /e\.g\. BAD /.test(conf[0].body), 'the reply lists the open leads (code + name) and how to answer', conf[0] && conf[0].body);

  reset(); await web('W1', 'Jo Smith', '9015550111'); await web('W2', 'Al Lee', '9015550122'); sent.length = 0; t += 60000;
  r = await txt(WES, 'Bad lead, good luck to them');
  ok(r && r.lsaAsk === 'count' && decided.length === 0 && /put the code before each\. Nothing saved\.$/.test(to(WES)[0].body), '"Bad lead, good luck to them" (2 open) is not guessed: nothing saved, asked for codes', { r, b: to(WES)[0] && to(WES)[0].body });
  sent.length = 0;
  r = await txt(WES, 'bad spam, good Steven');
  ok(r && r.lsaAsk === 'count' && decided.length === 0, '"bad spam, good Steven" without codes: asked, nothing saved', r);
  reset(); await three();
  r = await txt(WES, 'bad bad bad good');
  ok(r && r.lsaAsk === 'count' && decided.length === 0, '4 words, 3 open leads → nothing saved, asked', r);

  reset(); await three();
  r = await txt(WES, c1 + ' bad, ' + c2 + ' good Steven');
  ok(r && r.multi && decided.length === 2 && decided[0].leadId === 'W1' && !decided[0].good && decided[1].leadId === 'W2' && decided[1].good && decided[1].pm && decided[1].pm.name === 'Steven Hall', '"c1 bad, c2 good Steven" (code first)', decided.map(d => [d.leadId, d.good, d.pm && d.pm.name]));

  reset(); await three();
  r = await txt(WES, 'BAD ' + c1 + ' ' + c2 + ' spam calls');
  ok(r && r.multi && decided.length === 2 && decided.every(d => !d.good && d.reason === 'spam calls'), '"BAD c1 c2 spam calls" → both BAD (spam calls)', decided.map(d => [d.leadId, d.reason]));

  reset(); await three();
  r = await txt(WES, 'bad ' + c1 + ' wrong area, good ' + c3 + ' Steven roof is 20 years old');
  ok(r && r.multi && decided[0].reason === 'wrong area' && decided[1].leadId === 'W3' && decided[1].pm && decided[1].pm.name === 'Steven Hall' && decided[1].notes === 'roof is 20 years old', 'reasons / PM / notes per lead', decided.map(d => [d.leadId, d.reason, d.notes]));

  reset(); await web('W1', 'Jo Smith', '9015550111'); await web('W2', 'Al Lee', '9015550122'); sent.length = 0; t += 60000;
  r = await txt(WES, 'bad ' + c1 + ', good');
  ok(r && r.multi && decided.length === 2 && decided[0].leadId === 'W1' && !decided[0].good && decided[1].leadId === 'W2' && decided[1].good, '"bad c1, good" with one other open lead → that one is GOOD', decided.map(d => [d.leadId, d.good]));

  reset(); await three();
  r = await txt(WES, 'bad ' + c1 + ', good');
  ok(r && r.multi && decided.length === 1 && decided[0].leadId === 'W1' && /1 answer had no code and 2 other leads are open — not saved/.test(to(WES)[0].body), '"bad c1, good" with 2 other open leads → c1 saved, the rest asked', { d: decided.map(d => d.leadId), b: to(WES)[0] && to(WES)[0].body });

  reset(); await three();
  r = await txt(WES, 'NA ' + c1 + ', BAD ' + c2 + ' spam, GOOD ' + c3);
  ok(r && r.multi && decided[0].noAnswer && decided[1].reason === 'spam' && decided[2].good && !decided[2].pm, 'NA / BAD / GOOD (no PM) together', decided.map(d => [d.leadId, d.noAnswer, d.good, d.reason]));
  ok(/NO ANSWER, kept open/.test(to(WES)[0].body) && /GOOD, no PM yet/.test(to(WES)[0].body), 'NA and "no PM yet" lines', to(WES)[0].body);
  /* NA kept it open: "bad good" now maps to the 1 open lead? no — 1 open, 2 words → asked */
  r = await txt(WES, 'bad good');
  ok(r && r.lsaAsk === 'count' && /1 lead is open/.test(to(WES).slice(-1)[0].body) && to(WES).slice(-1)[0].body.indexOf(c1 + ' Jo Smith') > 0, 'after it: the NO ANSWER one is still open (listed)', to(WES).slice(-1)[0]);

  /* Google LSA leads in one reply → the dispute link once */
  reset();
  for (const [id, nm, ph] of [['L1', 'Lu One', '9015550311'], ['L2', 'Lu Two', '9015550312']]) { t += 60000; await SA.leads([{ id, key: id, title: 'Roof', source: 'Google LSA', contact: { name: nm, phone: ph } }], { [id]: { id, source: 'Google LSA', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'pending' } } }, () => false); }
  sent.length = 0;
  r = await txt(NICK, 'bad bad');
  ok(r && r.multi && decided.length === 2 && decided.every(d => d.isLsa && !d.good) && /Dispute the BAD Google LSA leads: https:\/\/ads\.google\.com\/localservices\/leads/.test(to(NICK)[0].body), 'two Google LSA BADs → one dispute line', to(NICK)[0] && to(NICK)[0].body);

  /* a PM answers two of his leads at once */
  reset(); await three();
  await txt(WES, 'SEND ' + c1 + ' Steven'); await txt(WES, 'SEND ' + c2 + ' Steven'); sent.length = 0; decided.length = 0;
  r = await txt(STEVEN, 'GOOD ' + c1 + ', BAD ' + c2 + ' just wanted a price');
  ok(r && r.multi && decided.length === 1 && decided[0].leadId === 'W1' && decided[0].keepPm && pmbads.length === 1 && pmbads[0].leadId === 'W2' && pmbads[0].reason === 'just wanted a price', 'a PM: GOOD one, BAD the other (to the admins to approve)', { decided, pmbads });
  ok(to(STEVEN).length === 1 && /2 leads updated/.test(to(STEVEN)[0].body) && /went to the admins to approve/.test(to(STEVEN)[0].body), 'the PM gets one summary', to(STEVEN));
  ok(to(WES).some(x => /Steven Hall says GOOD/.test(x.body)) && to(WES).some(x => /Steven Hall says BAD/.test(x.body)), 'the admins hear both', to(WES));

  console.log('3. no code: never re-marks an answered lead');
  reset(); await web('W1', 'Jo Smith', '9015550111'); sent.length = 0; t += 60000;
  r = await txt(WES, 'GOOD');
  ok(r && r.lsa === 'W1' && r.good === true && decided.length === 1, 'one open lead + "GOOD" → that lead (as before)', r);
  ok(/^GrayCo: [A-Z0-9]{4} Jo Smith marked GOOD — no PM set/.test(to(WES)[0].body) && !/Also open/.test(to(WES)[0].body), 'the old confirmation text', to(WES)[0]);
  sent.length = 0;
  r = await txt(WES, 'BAD');
  ok(r && r.lsaAsk === 'which lead' && decided.length === 1, 'no open lead + "BAD" → NOT re-marked (asked)', { r, decided: decided.length });
  ok(/^GrayCo: which lead\? No open lead on this phone/.test(to(WES)[0].body) && to(WES)[0].body.indexOf(c1) > 0 && /Nothing saved\.$/.test(to(WES)[0].body), 'the reply asks which lead (with a real code as the example)', to(WES)[0]);
  r = await txt(NICK, 'good');
  ok(r && r.lsaAsk === 'which lead' && decided.length === 1, 'Nick\'s plain GOOD: the lead Wesley answered is not re-marked either', r);
  r = await txt(WES, 'BAD ' + c1 + ' changed my mind');
  ok(r && r.lsa === 'W1' && r.good === false && decided.length === 2 && decided[1].reason === 'changed my mind', 'with the code an answered lead CAN be changed', r);
  /* a reply window to a customer is open → "Good morning…" goes to the customer, it is not an answer */
  reset(); await web('W1', 'Jo Smith', '9015550111'); await txt(WES, 'GOOD'); sent.length = 0;
  await SA.inboundText({ ph: '9015550111', body: 'Can you come today?', who: { kind: 'lead', name: 'Jo Smith' }, pid: '' });
  ok(to(WES).length === 1 && kv[SA.SKEY].lsa[WES].find(x => x.leadId === 'W1').done === 'good', 'the customer writes back: Wesley gets it, the lead stays answered', kv[SA.SKEY].lsa[WES]);
  sent.length = 0;
  r = await txt(WES, 'Good morning, we can be there at 2');
  ok(r && r.replied && r.to === '9015550111' && decided.length === 1 && to('9015550111').length === 1, 'reply window open + nothing open → the text goes to the customer (not a second GOOD)', r);
  /* two open leads, no code → the newest (as before) + the other one named */
  reset(); await web('W1', 'Jo Smith', '9015550111'); await web('W2', 'Al Lee', '9015550122'); sent.length = 0; t += 60000;
  r = await txt(WES, 'bad spam call');
  ok(r && r.lsa === 'W2' && r.good === false && r.reason === 'spam call', 'two open + "bad spam call" → the newest, as before', r);
  ok(/marked BAD \(spam call\) — closed, no PM\. Also open: [A-Z0-9]{4} Jo Smith — add the code to answer those\.$/.test(to(WES)[0].body), 'the confirmation names the other open lead', to(WES)[0]);
  /* a lead closed in the CRM (lead inbox 👍 / dismissed) is not open */
  reset(); await web('W1', 'Jo Smith', '9015550111'); await web('W2', 'Al Lee', '9015550122'); sent.length = 0; t += 60000;
  inbox = [{ id: 'W2', lsaCheck: 'good' }, { id: 'W1', status: 'dismissed' }];
  r = await txt(WES, 'bad');
  ok(r && r.lsaAsk === 'which lead' && decided.length === 0, 'both closed in the CRM → asked, nothing re-marked', r);
  inbox = [{ id: 'W2', leadExtra: { lsaCheck: 'good' } }];
  r = await txt(WES, 'bad');
  ok(r && r.lsa === 'W1' && decided.length === 1, 'one closed in the CRM → the other one', r);
  /* SEND with nothing open asks too */
  reset(); await web('W1', 'Jo Smith', '9015550111'); await txt(WES, 'BAD'); sent.length = 0;
  r = await txt(WES, 'SEND Steven');
  ok(r && r.send === 'which lead' && sends.length === 0 && /^GrayCo: which lead\? .*SEND [A-Z0-9]{4} Pat/.test(to(WES)[0].body), 'SEND with no open lead → asked, not sent', { r, b: to(WES)[0] });

  console.log('4. the old single answers');
  reset(); await web('W1', 'Jo Smith', '9015550111'); sent.length = 0; t += 60000;
  r = await txt(WES, 'Good Steven');
  ok(r && r.good && r.pm === 'Steven Hall' && /PM Steven Hall assigned/.test(to(WES)[0].body), '"Good Steven"', r);
  reset(); await web('W1', 'Jo Smith', '9015550111'); sent.length = 0;
  r = await txt(WES, 'Steven');
  ok(r && r.good && r.pm === 'Steven Hall', 'a bare PM name = GOOD + PM', r);
  reset(); await web('W1', 'Jo Smith', '9015550111'); sent.length = 0;
  r = await txt(WES, 'Good, PM is Steven');
  ok(r && r.good && r.pm === 'Steven Hall', '"Good, PM is Steven"', r);
  reset(); await web('W1', 'Jo Smith', '9015550111'); sent.length = 0;
  r = await txt(WES, 'GOOD Steven roof is bad and 20 years old');
  ok(r && r.good && r.pm === 'Steven Hall' && r.notes === 'roof is bad and 20 years old' && !r.multi, 'a note with "bad" in it stays one answer', r);
  reset(); await web('W1', 'Jo Smith', '9015550111'); await web('W2', 'Al Lee', '9015550122'); sent.length = 0;
  r = await txt(WES, 'good ' + c1);
  ok(r && r.lsa === 'W1' && r.good, '"good <code>" (the older one)', r);
  r = await txt(WES, 'BAD ' + c2 + ' wrong service');
  ok(r && r.lsa === 'W2' && r.good === false && r.reason === 'wrong service', '"BAD <code> wrong service"', r);
  reset(); await web('W1', 'Jo Smith', '9015550111'); sent.length = 0;
  r = await txt(WES, 'no answer left a voicemail');
  ok(r && r.noAnswer && decided[0].notes === 'left a voicemail' && /NO ANSWER — kept open/.test(to(WES)[0].body), '"no answer left a voicemail"', r);
  r = await txt(WES, 'NA');
  ok(r && r.noAnswer && r.lsa === 'W1', 'NA again (still open)', r);
  r = await txt(WES, 'BAD ' + c1 + ' no roof needed');
  ok(r && r.good === false && r.reason === 'no roof needed' && !r.multi, '"BAD <code> no roof needed" (one code: one answer)', r);
  /* the customer conversation is untouched */
  reset(); await web('W1', 'Jo Smith', '9015550111');
  await SA.inboundText({ ph: '9015550111', body: 'When can you come?', who: { kind: 'lead', name: 'Jo Smith' }, pid: '' });
  sent.length = 0;
  r = await txt(WES, 'No problem, see you then');
  ok(r && r.replied && !r.lsa && decided.length === 0, '"No problem, see you then" goes to the customer, not BAD', r);
  /* 🚨 emergency: a plain reply goes to the customer, GOOD <code> answers it */
  reset();
  await SA.leads([{ id: 'E1', key: 'E1', title: 'Burst pipe', contact: { name: 'Bo Em', phone: '9015550214' } }], { E1: { id: 'E1', leadExtra: { smsFrom: '9015550214', textMessage: true, said: { message: 'water everywhere' } } } }, () => true);
  sent.length = 0;
  r = await txt(WES, 'Good, on our way');
  ok(r && r.replied && r.to === '9015550214' && decided.length === 0, 'emergency: "Good, on our way" still goes to the customer', r);
  r = await txt(WES, 'GOOD ' + code('E1') + ' Steven');
  ok(r && r.lsa === 'E1' && r.good && r.pm === 'Steven Hall' && decided[0].isLsa === false && acks.some(a => a.id === 'E1'), 'emergency: "GOOD <code> Steven" marks it (and acknowledges it)', r);
  /* the same message twice is handled once */
  reset(); await three();
  r = await SA.staffInbound(WES, 'bad bad good', 'SMDUP'); const r2 = await SA.staffInbound(WES, 'bad bad good', 'SMDUP');
  ok(r && r.multi && r2 && r2.skipped === 'already handled' && decided.length === 3, 'a repeated delivery is handled once', r2);
  /* a sentence that is not an answer is left alone */
  reset(); await three();
  r = await txt(WES, 'on my way to the Smith job');
  ok((!r || !r.lsa) && decided.length === 0, 'an ordinary text is not an answer', r);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
