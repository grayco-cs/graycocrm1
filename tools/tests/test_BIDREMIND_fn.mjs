// test_BIDREMIND_fn.mjs <build-dir> — patch BIDSITE3 item I: the bid requirement reminder ladder (_lib/bidremind.js) on the REAL code,
// offline (made-up bid with a 5% bid bond, a MANDATORY pre-bid, a SEALED hand-delivered bid, pre-qualification paperwork, a questions
// deadline; the clock, the store, the texts and the To-Dos are stubs — nothing is sent, no network).
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), FN = path.join(BUILD, 'netlify/functions');
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' });   /* no network */
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test';
const BR = require(path.join(FN, '_lib/bidremind.js')), BD = require(path.join(FN, '_lib/bid-due.js')), PR = require(path.join(FN, '_lib/planroom.js'));
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const addDays = (d, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10); };
const D = addDays(BD.nowWall().slice(0, 10), 20);            /* the bid due day, 20 days out */
const at = (day, hm) => BD.wallToEpoch(day + 'T' + hm);
const F = { bidDue: D + 'T14:00', bidBond: '5%', bonds: ['A bid bond or certified check for 5% of the bid must accompany each bid.'],
  preBid: { date: addDays(D, -5), time: '10:00', place: 'Demo State Univ. Bldg 12, Room 101', mandatory: true },
  delivery: 'Sealed bid, opened publicly; delivered to 100 Demo Plaza, Suite 2, Jackson, MS', questionsDue: addDays(D, -4) + 'T17:00',
  prequal: ['Bidders must be pre-qualified with the Owner (statement of qualifications) by ' + new Date(addDays(D, -6) + 'T12:00:00Z').toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + '.'] };
const lead = { id: 'L_BOND', name: 'Demo State Univ. Lab Renovation', stage: 'Bidding', bidDue: F.bidDue, estimator: 'Demo Estimator', estimatorEmail: 'est@grayco-cs.com', dueToCompany: 'Demo State Univ.', bidRole: 'prime',
  leadExtra: { planRoom: { fields: F, checklist: PR.checklist(F, []) } } };
const OWNERS = [{ slot: 1, email: 'owner1@grayco-cs.com', name: 'Demo Owner One' }, { slot: 2, email: 'owner2@grayco-cs.com', name: 'Demo Owner Two' }];
let STORE = {}, NOW = 0; const TEXTS = [], TODOS = [];
const deps = { now: () => NOW, kvCas: async (k, f) => { const v = f(JSON.parse(JSON.stringify(STORE[k] || null))); if (v !== undefined) STORE[k] = v; return v; },
  people: async () => ({ users: [], staff: [] }), owners: async () => OWNERS, tasks: async () => TODOS.filter(t => t.done),
  notify: async o => { TEXTS.push(o); return { sent: o.only.length, to: o.only }; }, todo: async (x, to) => { TODOS.push({ id: x.tid, to, step: x.st.k, done: false }); return true; } };
const runAt = async (day, hm, leads) => { NOW = at(day, hm); const n0 = TEXTS.length; await BR.run({ leads: leads || [lead], items: [] }, deps); return TEXTS.slice(n0); };
const kinds = l => l.map(x => x.key.split('|')[1] + ':' + x.step).sort();

/* ── what the bid needs ── */
const its = BR.itemsOf({ key: lead.id, title: lead.name, bidDue: lead.bidDue, planRoom: lead.leadExtra.planRoom, dueToCompany: lead.dueToCompany });
const k = {}; its.forEach(x => { k[x.kind] = x; });
ok('1 the requirements: bid bond (5% of the bid), pre-bid, sealed delivery, prequal paperwork, questions deadline, the bid due', ['bond', 'prebid', 'sealed', 'prequal', 'questions', 'biddue'].every(x => k[x]) && /5% of the bid/.test(k.bond.text) && /surety/.test(k.bond.text), its.map(x => x.kind));
ok('2 the pre-bid is flagged MANDATORY, with the time and the place', k.prebid.mandatory === true && /^MANDATORY pre-bid/.test(k.prebid.text) && /Bldg 12/.test(k.prebid.text) && k.prebid.due === addDays(D, -5) + 'T10:00');
ok('3 the sealed bid: deliver by hand to the address by the due time, allow travel', /deliver it by hand to 100 Demo Plaza, Suite 2, Jackson, MS by .*\(allow travel time\)/.test(k.sealed.text), k.sealed.text);
ok('4 the prequal deadline is read from its own sentence (6 days before the bid)', k.prequal.due === addDays(D, -6), k.prequal);
ok('5 the bid card\'s checklist has a box for each (bond, pre-bid, sealed, prequal, questions, the bid due)', ['bond', 'prebid', 'sealed', 'prequal', 'questions', 'biddue'].every(x => lead.leadExtra.planRoom.checklist.some(c => c.kind === x)), lead.leadExtra.planRoom.checklist.map(c => c.kind + ': ' + c.label));

/* ── the ladder ── */
let got = await runAt(addDays(D, -7), '07:55');
const earlyKinds = kinds(got.map(o => ({ key: o.key, step: o.step })));
ok('6 7 days before, before 8 AM: each item gets only the step it is in now (pre-bid / prequal: 3 days, questions: 7 days)', JSON.stringify(earlyKinds) === JSON.stringify(['prebid:d3', 'prequal:d3', 'questions:d7']), earlyKinds);
got = await runAt(addDays(D, -7), '08:05');
ok('7 7 days before at 8 AM: the bond, the sealed delivery and the bid due (7 days); prequal moves to 1 day, questions to 3 days', JSON.stringify(kinds(got.map(o => ({ key: o.key, step: o.step })))) === JSON.stringify(['biddue:d7', 'bond:d7', 'prequal:d1', 'questions:d3', 'sealed:d7']), got.map(o => o.key + ' ' + o.step));
ok('8 to the assigned estimator AND Owner 1 / Owner 2 (staff only)', got.length === 5 && got.every(o => o.only.join() === 'est@grayco-cs.com,owner1@grayco-cs.com,owner2@grayco-cs.com'), got.map(o => o.only));
ok('9 the text: what, the bid, when, and a ✓ Done link', /^GrayCo ⏰ in 7 days: BID BOND — order it from the surety \(5% of the bid\)/.test(got.find(o => /\|bond$/.test(o.key)).text) && got.every(o => /✓ Done: https:\/\/\S+bidremind_done=/.test(o.text)), got.map(o => o.text));
const n9 = TEXTS.length; await runAt(addDays(D, -7), '09:15'); await runAt(addDays(D, -6), '12:00');
ok('10 once only per step: later runs the same / next day send nothing new (no repeats)', TEXTS.length === n9 + 0 + (TEXTS.slice(n9).length) && !TEXTS.slice(n9).some(o => /\|(bond|sealed|biddue)$/.test(o.key)), TEXTS.slice(n9).map(o => o.key + ' ' + o.step));
ok('11 a CRM To-Do with every text (for the same people)', TODOS.length === TEXTS.length && TODOS.every(t => t.to.length === 3));

/* ✓ Done from the text link → that item stops */
const link = TEXTS.find(o => /\|sealed$/.test(o.key)).text.split('✓ Done: ')[1];
const tok = decodeURIComponent(/bidremind_done=([^\s]+)/.exec(link)[1]);
ok('12 the ✓ Done link is signed (a changed one is refused)', BR.checkToken(tok) === 'L_BOND|sealed' && !BR.checkToken(tok.replace(/.$/, c => c === 'a' ? 'b' : 'a')) && !BR.checkToken('L_BOND|bond.000000000000000000000000'));
await BR.markDone(BR.checkToken(tok), 'Demo Estimator', { kvCas: deps.kvCas, noTodo: true });
/* the bond box ticked on the bid card */
lead.leadExtra.planRoom.checklist = lead.leadExtra.planRoom.checklist.map(c => c.kind === 'bond' ? Object.assign({}, c, { done: true, doneBy: 'Demo Estimator' }) : c);
got = await runAt(addDays(D, -3), '08:05');
ok('13 3 days before: the bid due goes on; the sealed delivery (✓ Done tapped) and the bond (box ticked) stop', JSON.stringify(kinds(got.map(o => ({ key: o.key, step: o.step })))) === JSON.stringify(['biddue:d3']), got.map(o => o.key + ' ' + o.step));
/* the To-Do ticked done stops it too */
TODOS.filter(t => /questions/.test(t.id)).forEach(t => { t.done = true; });
got = await runAt(addDays(D, -5), '07:00');
ok('14 a To-Do ticked done stops that item (the questions deadline); the MANDATORY pre-bid gets its morning-of at 7 AM', JSON.stringify(kinds(got.map(o => ({ key: o.key, step: o.step })))) === JSON.stringify(['prebid:day']) && /^GrayCo ⏰ TODAY: MANDATORY pre-bid/.test(got[0].text), got.map(o => o.key + ' ' + o.step));
await runAt(addDays(D, -1), '08:05');
got = await runAt(D, '06:55');
ok('15 the bid due day before 7 AM: nothing (the morning-of waits for 7)', got.length === 0, got.map(o => o.key));
got = await runAt(D, '07:00');
ok('16 the bid due day at 7 AM: "TODAY: the BID is due" once', got.length === 1 && /\|biddue$/.test(got[0].key) && /TODAY: the BID is due to Demo State Univ\./.test(got[0].text), got.map(o => o.text));
got = await runAt(D, '15:00');
ok('17 after the due time: nothing', got.length === 0);

/* a bid that came in late: no catch-up burst; a closed bid: nothing */
const late = JSON.parse(JSON.stringify(lead)); late.id = 'L_LATE'; late.leadExtra.planRoom.checklist = PR.checklist(F, []);
got = await runAt(addDays(D, -2), '08:05', [late]);
ok('18 a bid added 2 days before: only the 3-day step for the bond / sealed / bid due (not the 7-day one too)', got.filter(o => /\|(bond|sealed|biddue)$/.test(o.key)).every(o => o.step === 'd3') && got.filter(o => /\|(bond|sealed|biddue)$/.test(o.key)).length === 3, got.map(o => o.key + ' ' + o.step));
const closed = JSON.parse(JSON.stringify(lead)); closed.id = 'L_LOST'; closed.stage = 'Lost';
got = await runAt(addDays(D, -1), '08:05', [closed]);
ok('19 a lost / closed bid gets nothing', got.length === 0);
const plain = { id: 'L_PLAIN', name: 'No requirements', bidDue: F.bidDue, estimatorEmail: 'est@grayco-cs.com' };
got = await runAt(addDays(D, -1), '08:05', [plain]);
ok('20 a bid with no plan room requirements gets no ladder (its usual bid-due reminders stay as they are)', got.length === 0);

/* the real send path: a staff text (smsalert), held through staff quiet hours */
const fs = require('fs'), SRC = fs.readFileSync(path.join(FN, '_lib/bidremind.js'), 'utf8');
ok('21 sent as a staff text: smsalert.notify, only GrayCo staff, held through staff quiet hours (hold + sqOnly)', /SA\(\)\.notify\(\{ type: 'bidreq'[^}]*only: to[^}]*hold: true, sqOnly: true/.test(SRC) && /@\(in\\\.\)\?grayco-cs\\\.com\$/.test(SRC));
const BA = fs.readFileSync(path.join(FN, 'bid-alerts.js'), 'utf8'), BI = fs.readFileSync(path.join(FN, 'bid-inbox.js'), 'utf8');
ok('22 wired: bid-alerts (every 10 minutes) runs the ladder; bid-inbox ?bidremind_done answers the ✓ Done link', /bidremind\.js'\)\.run\(/.test(BA) && /qs\.bidremind_done/.test(BI));
const fails = R.filter(x => !x).length;
console.log(fails ? 'FAILED ' + fails + ' of ' + R.length : 'ALL ' + R.length + ' PASS');
process.exit(fails ? 1 : 0);
