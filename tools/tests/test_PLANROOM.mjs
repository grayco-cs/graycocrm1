// test_PLANROOM.mjs <build-dir> [shot-dir] — patch PLANROOM, the CRM page (browser): the 📐 Plan room details card.
// The server's answer is the REAL reader (_lib/planroom.js) run here on the saved MR plan room pages of the Jackson State Community College
// Student Center Updates (tools/tests/fixtures/planroom, names / phones redacted), handed to the page through a fake bid-inbox ?planroom=1.
//   1. an admin opens a Lead from MR plan room: the card is in the lead panel, visible; "📐 Read plan room" → the fields (pre-bid Nov 30 10:30,
//      Conference Room 113, bid due Dec 16, 5 % bid bond, licensing, scope, the plain-reader note), the documents, the source words
//   2. the lead itself: leadExtra.planRoom, preBid 2026-11-30T10:30 + place, bidDue 2026-12-16, a log line; a bid due a person typed stays
//   3. the checklist: ticking a box saves (op save) and stays ticked; ✏️ Edit → MANDATORY → the lead's preBidMandatory
//   4. a BuildingConnected lead: "🔒 Needs a sign-in — not read" + what to do (forward the invitation / paste the PDF)
//   5. 📋 Paste PDF / text sends the text (op read, text)
//   6. the To-Do: questions due within 3 days → one item for the lead's estimator
//   7. the bid job (🏗 Bid portal → 📂 Manage → 📝 Details): the same card, its plan room details
//   8. no page errors; nothing sent anywhere but bid-inbox / bid-hub
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const PR = require(path.join(BUILD, 'netlify/functions/_lib/planroom.js'));
const FX = path.join(BUILD, 'tools/tests/fixtures/planroom'), fx = n => fs.readFileSync(path.join(FX, n), 'utf8');
const JSU_URL = 'https://www.mrplanroom.com/projects/11447/details/jackson-state-community-college-student-center-updates';
const MAP = { '/details/jackson': 'mr_11447_details.html', '/addenda/jackson': 'mr_11447_addenda.html', '/specs/jackson': 'mr_11447_specs.html', '/plans/jackson': 'mr_11447_plans.html' };
const fake = async u => { u = String(u); const body = /robots\.txt$/.test(u) ? fx('robots_reproconnect.txt') : (Object.keys(MAP).find(k => u.includes(k)) ? fx(MAP[Object.keys(MAP).find(k => u.includes(k))]) : null);
  const b = Buffer.from(body || 'nf'); return { ok: !!body, status: body ? 200 : 404, url: u, headers: { get: k => /type/i.test(k) ? 'text/html' : '' }, arrayBuffer: async () => b }; };
const JPR = await PR.read(JSU_URL, { fetch: fake, pauseMs: 0, ai: { ready: () => false } });
ok('server side (the real reader on the saved pages): pre-bid 2026-11-30 10:30 and bid due 2026-12-16 found', JPR.fields.preBid && JPR.fields.preBid.date === '2026-11-30' && JPR.fields.bidDue === '2026-12-16', JPR.fields);
const BC = await PR.read('https://app.buildingconnected.com/projects/abc123/bid-packages', { fetch: fake, pauseMs: 0 });

const { computer, signIn, sleep, cset, cget, resetCloud, onFn } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const at = new Date(Date.now() - 864e5).toISOString(), soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Glenn Sample', email: 'sbiffle@grayco-cs.com', role: 'Estimator', payType: 'revenue_pct', active: true }]);
cset('leads', [
  { id: 'LPR1', name: 'Jackson State Community College - Student Center Updates', type: 'Commercial Reno', leadKind: 'Government', stage: 'New Lead', source: 'MR plan room', estimator: 'Glenn Sample', notes: 'Found on Memphis Reprographics — public plan room (mrplanroom.com).',
    plansLinks: [{ url: JSU_URL, label: 'Solicitation & documents (MR plan room)', board: 'Government' }], createdAt: at, updatedAt: at },
  { id: 'LPR2', name: 'Sample Clinic — BuildingConnected invite', type: 'Commercial Reno', leadKind: 'Commercial', stage: 'New Lead', source: 'BuildingConnected', bidDue: '2026-12-01T14:00', bidDueManual: true,
    plansLinks: [{ url: 'https://app.buildingconnected.com/projects/abc123/bid-packages', label: 'View project', board: 'BuildingConnected' }], createdAt: at, updatedAt: at },
  { id: 'LPR3', name: 'Sample Library Reroof', type: 'Commercial Reno', leadKind: 'Commercial', stage: 'New Lead', estimator: 'Glenn Sample', createdAt: at, updatedAt: at,
    leadExtra: { planRoom: { v: 1, fetchedAt: at, url: 'https://www.mrplanroom.com/projects/1/details/x', board: 'MR plan room', reader: 'plain', fields: { projectName: 'Sample Library Reroof', questionsDue: soon + 'T17:00' }, checklist: [], docs: [], sourceLinks: [], sourceSnippets: {} } }, questionsDue: soon + 'T17:00' }]);
const POSTS = [];
onFn('bid-inbox', async ({ query, body, method }) => {
  if (!query.planroom) return { ok: true, items: [], lite: true, leads: [] };
  if (method === 'GET') return { ok: true, read: null };
  POSTS.push(body);
  if (body.op === 'read') { if (body.text) return { ok: true, planRoom: Object.assign({}, JPR, { kind: 'pasted', reader: 'ai' }) }; return { ok: true, planRoom: /buildingconnected/.test(body.url) ? BC : JPR, applied: { item: null, jobs: [] } }; }
  if (body.op === 'save') return { ok: true, planRoom: body.planRoom };
  return { ok: true };
});
const JOB = { id: 'J_JSU', title: 'Jackson State Community College - Student Center Updates', address: '33 Presidents Way, Jackson, TN 38301', due: '2026-12-15', visibility: 'private', trades: '', tradesSuggested: '', plansLinks: [{ url: JSU_URL, label: 'MR plan room' }], log: [], posts: [], addenda: [], tradeScopes: [],
  siteWalk: { date: '2026-11-30', time: '10:30', location: 'Conference Room 113', mandatory: false }, requirements: { bond: true }, contacts: {}, crmLeadId: 'LPR1', planRoom: JPR };
onFn('bid-hub', async ({ query, body, method }) => {
  if (query.manage) return { ok: true, paused: false, resort: 0, planreqs: [], job: JOB, plans: [], questions: [], acks: [], activity: [], audience: [] };
  if (query.jobs) return { ok: true, jobs: [{ id: 'J_JSU', title: JOB.title, crmLeadId: 'LPR1', visibility: 'private' }], me: { email: 'wjohnson@grayco-cs.com', admin: true, canInvite: true, canPublic: true } };
  return { ok: true };
});
const wait = async (c, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
const C = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(C, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await C.ev(() => { try { window._setView('leads'); } catch (e) {} }); await sleep(1500);

/* 1. the card on the MR plan room lead */
await C.ev(() => window._gcLeadsHub.open('LPR1'));
const card = await wait(C, () => { const x = document.querySelector('#gcl-drawer #gcpr-lead'); if (!x) return null; const b = x.querySelector('[data-pr="read"]'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { txt: x.textContent, btn: b.textContent, vis: r.width > 0 && r.height > 0, onTop: !!top && (top === b || b.contains(top)), url: (x.querySelector('[data-pr-url]') || {}).value }; });
ok('1a the 📐 Plan room details card is in the lead panel, "📐 Read plan room" visible with nothing on top, the plan room link filled in', !!card && /Plan room details/.test(card.txt) && /Read plan room/.test(card.btn) && card.vis && card.onTop && card.url === JSU_URL, card);
await C.ev(() => document.querySelector('#gcpr-lead [data-pr="read"]').click());
const f = await wait(C, () => { const x = document.querySelector('#gcpr-lead [data-prfields]'); return x && /Pre-bid/.test(x.textContent) ? document.querySelector('#gcpr-lead').textContent : null; });
ok('1b read: pre-bid Mon Nov 30, 2026 10:30 AM at Conference Room 113 (mandatory? not stated), bid due Wed Dec 16, 2026 (time TBD), bid bond 5%, licensing, scope (TPO roof), owner', !!f && /Mon Nov 30, 2026 10:30 AM/.test(f) && /Conference Room 113/.test(f) && /not stated/.test(f) && /Wed Dec 16, 2026/.test(f) && /TBD/.test(f) && /Bid bond \/ security 5%/.test(f) && /licensed and qualified/.test(f) && /TPO roof/.test(f) && /State of Tennessee/.test(f), (f || '').slice(0, 900));
ok('1c "Plain reader" and why (the site asks for no AI input); the documents and source links are there', !!f && /Plain reader/.test(f) && /ai-input=no/.test(f) && /Plan room documents \(/.test(f) && /Project page/.test(f), (f || '').slice(0, 300));
const post1 = POSTS.find(p => p.op === 'read');
ok('1d the read asked the server with the lead, its bid job (from the bid portal list) and the plan room link', !!post1 && post1.leadId === 'LPR1' && post1.url === JSU_URL, post1);
const src = await C.ev(() => { const d = document.querySelector('#gcpr-lead [data-prf="preBid"] details.src'); if (!d) return null; d.open = true; return d.textContent; });
ok('1e "where it says so" shows the plan room\'s own words for the pre-bid', /PRE-BID CONFERENCE AT/.test(src || ''), src);
if (SHOTS) { await C.ev(() => { const x = document.getElementById('gcpr-lead'); if (x) x.scrollIntoView({ block: 'start' }); }); await sleep(300); await C.page().screenshot({ path: SHOTS + '/planroom_lead_card.png' }); }

/* 2. the lead */
const L1 = await wait(C, () => { const l = (window._gcLeadsHubKit.all() || []).find(x => x.id === 'LPR1'); return l && l.leadExtra && l.leadExtra.planRoom ? { preBid: l.preBid, loc: l.preBidLocation, bidDue: l.bidDue, act: (l.activity || []).map(a => a.text).join(' | '), pr: !!l.leadExtra.planRoom.fields } : null; });
ok('2a the lead: leadExtra.planRoom, pre-bid 2026-11-30T10:30 + place, bid due 2026-12-16 (its reminders follow), a "📐 Plan room read" log line', !!L1 && L1.pr && L1.preBid === '2026-11-30T10:30' && /Conference Room 113/.test(L1.loc) && L1.bidDue === '2026-12-16' && /📐 Plan room read/.test(L1.act), L1);
let s1 = null; for (let i = 0; i < 40 && !(s1 && s1.preBid === '2026-11-30T10:30'); i++) { await sleep(500); const sv = cget('leads'); s1 = (Array.isArray(sv) ? sv : []).find(x => x && x.id === 'LPR1') || null; }
if (!s1) { const { writes } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs'); console.log('writes:', JSON.stringify(writes.slice(-8))); }
ok('2b … saved to the cloud (the leads list), not only on screen', !!s1 && s1.preBid === '2026-11-30T10:30' && !!(s1.leadExtra && s1.leadExtra.planRoom), s1 && { preBid: s1.preBid });

/* 3. the checklist, ✏️ Edit */
const n0 = POSTS.length;
await C.ev(() => { const b = document.querySelector('#gcpr-lead input[data-prck]'); b.click(); });
const ck = await wait(C, () => { const l = (window._gcLeadsHubKit.all() || []).find(x => x.id === 'LPR1'); const c = l && l.leadExtra.planRoom.checklist; return c && c[0] && c[0].done ? c : null; });
ok('3a ticking "Bid bond / bid security 5%" saves it on the lead (done, by whom)', !!ck && ck[0].done === true && /Wesley Johnson|wjohnson/.test(ck[0].doneBy), ck);
await C.ev(() => document.querySelector('#gcpr-lead [data-pr="edit"]').click());
await wait(C, () => document.querySelector('#gcpr-lead select[data-pre="pbM"]'));
await C.ev(() => { const s = document.querySelector('#gcpr-lead select[data-pre="pbM"]'); s.value = 'yes'; document.querySelector('#gcpr-lead [data-pr="save"]').click(); });
const ed = await wait(C, () => { const l = (window._gcLeadsHubKit.all() || []).find(x => x.id === 'LPR1'); return l && l.preBidMandatory === true ? { m: l.preBidMandatory, by: l.leadExtra.planRoom.editedBy, card: document.querySelector('#gcpr-lead').textContent } : null; });
ok('3b ✏️ Edit → MANDATORY → saved: the lead\'s pre-bid is mandatory, the card says so, edited by the person', !!ed && ed.m === true && /MANDATORY/.test(ed.card) && !!ed.by, ed && { m: ed.m, by: ed.by });
ok('3c the box ticked before the edit is still ticked', await C.ev(() => { const l = (window._gcLeadsHubKit.all() || []).find(x => x.id === 'LPR1'); return !!(l.leadExtra.planRoom.checklist[0] || {}).done; }));
await C.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} }); await sleep(500);

/* 4. BuildingConnected */
await C.ev(() => window._gcLeadsHub.open('LPR2'));
await wait(C, () => document.querySelector('#gcpr-lead [data-pr="read"]'));
await C.ev(() => document.querySelector('#gcpr-lead [data-pr="read"]').click());
const bc = await wait(C, () => { const x = document.querySelector('#gcpr-lead [data-prwhy]'); return x ? x.textContent : null; });
ok('4a a BuildingConnected lead: "🔒 Needs a sign-in — not read" and what to do (forward the invitation e-mail to bids@, or paste the PDF)', /Needs a sign-in/.test(bc || '') && /bids@grayco-cs\.com/.test(bc || '') && /paste|drop/i.test(bc || ''), bc);
ok('4b its bid due (typed by a person) is unchanged', await C.ev(() => ((window._gcLeadsHubKit.all() || []).find(x => x.id === 'LPR2') || {}).bidDue === '2026-12-01T14:00'));
/* 5. paste */
await C.ev(() => document.querySelector('#gcpr-lead [data-pr="paste"]').click());
await wait(C, () => document.querySelector('#gcpr-lead [data-pr-text]'));
const n1 = POSTS.length;
await C.ev(() => { document.querySelector('#gcpr-lead [data-pr-text]').value = 'INVITATION TO BID … PRE-BID CONFERENCE AT: … On November 30th, 2026'; document.querySelector('#gcpr-lead [data-pr="pasteread"]').click(); });
await wait(C, () => true, null, 300); await sleep(1500);
const pp = POSTS.slice(n1).find(p => p.op === 'read');
ok('5 📋 Paste PDF / text sends the pasted words to the reader (op read, text)', !!pp && /INVITATION TO BID/.test(pp.text) && pp.leadId === 'LPR2', pp);
if (SHOTS) await C.page().screenshot({ path: SHOTS + '/planroom_buildingconnected.png' });
await C.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} }); await sleep(400);

/* 6. To-Do */
const td = await C.ev(() => window._gcPlanRoom.todo().map(x => ({ key: x.key, title: x.title, who: x.who })));
ok('6 To-Do: "❓ Questions / RFIs due …" for the lead whose questions are due in 2 days, for its estimator', td.some(x => x.key === 'planroom:q:LPR3' && /Questions \/ RFIs due/.test(x.title) && x.who.includes('Glenn Sample')), td);

/* 7. the bid job */
await C.ev(() => window._gcSys2.open('J_JSU', 'details'));
const jc = await wait(C, () => { const x = document.querySelector('#gcsys2 [data-details] #gcpr-job'); return x && /Pre-bid/.test(x.textContent) ? x.textContent : null; });
ok('7 🏗 Bid portal → 📂 Manage → 📝 Details: the 📐 Plan room details card with the job\'s plan room details and ↻ Re-read', !!jc && /Plan room details/.test(jc) && /Mon Nov 30, 2026 10:30 AM/.test(jc) && /Re-read plan room/.test(jc), (jc || '').slice(0, 300));
if (SHOTS) await C.page().screenshot({ path: SHOTS + '/planroom_bid_job.png' });
const sent = C.fn.filter(x => !/^(bid-inbox|bid-hub)$/.test(x.name) && x.method === 'POST' && /sms|text|send|mail|notify/i.test(x.name)).map(x => x.name);
ok('8a nothing texted or e-mailed from these clicks', !sent.length, sent);
ok('8b no page errors', !C.errs.length, C.errs);
const n = R.filter(Boolean).length; console.log('PLANROOM ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
