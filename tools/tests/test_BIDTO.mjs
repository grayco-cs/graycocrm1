// test_BIDTO.mjs <build> [--no-browser] — one bid, every GC that invited us (patch BIDTO). Made-up names only.
import { createRequire } from 'module';
const build = process.argv[2];
const noBrowser = process.argv.includes('--no-browser');
const require = createRequire(import.meta.url);
process.env.ANTHROPIC_API_KEY = '';
const BI = require(build + '/netlify/functions/bid-inbox.js');
const T = BI._test;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };

/* ── 1. who counts as a GC address ── */
ok('gcEmail keeps a GC estimator', T.gcEmail('Dana@PathwayBuilders.com') === 'dana@pathwaybuilders.com');
ok('gcEmail keeps a GC bids@ box', T.gcEmail('bids@keystonegc.com') === 'bids@keystonegc.com');
for (const bad of ['team@buildingconnected.com', 'noreply@planhub.com', 'no-reply@keystonegc.com', 'donotreply@summitridgecc.com', 'gmiller@grayco-cs.com', 'bids@grayco-cs.com', 'leads@in.grayco-cs.com', 'x@reply.buildingconnected.com', 'bounce@sendgrid.net', 'not an email'])
  ok('gcEmail drops ' + bad, T.gcEmail(bad) === '');
ok('gcCompany drops GrayCo and the platforms', T.gcCompany('GrayCo Construction Services') === '' && T.gcCompany('BuildingConnected') === '' && T.gcCompany('Keystone General Contractors') === 'Keystone General Contractors');
ok('the AI schema asks for the inviting GC', !!(T.LEAD_TOOL.input_schema.properties.leads.items.properties.invited_by_email && T.LEAD_TOOL.input_schema.properties.leads.items.properties.invited_by_company));

/* ── 2. three GCs invite us to one project (one by BuildingConnected) ── */
const mailOf = (o) => Object.assign({ id: 'em_' + Math.random().toString(36).slice(2), messageId: '', subject: '', text: '', html: '', files: [], skipped: [], headers: {}, date: '2026-10-26T15:00:00Z' }, o, { from: Object.assign({ name: '', email: '', domain: '' }, o.from) });
const lead = (o) => Object.assign({ project_name: 'Harbor Point Hotel Murfreesboro', city: 'Murfreesboro', state: 'TN', lead_type: 'commercial', trades: ['roofing'] }, o);
const ai = (L, kind) => ({ ok: true, kind: kind || 'invitation', leads: [L] });
const M1 = mailOf({ subject: 'Invitation to Bid: Harbor Point Hotel Murfreesboro', from: { name: 'Dana Eckert', email: 'dana@pathwaybuilders.com', domain: 'pathwaybuilders.com' },
  text: 'Pathway Builders invites you to bid Harbor Point Hotel Murfreesboro. Bids due 11/10/2026 2:00 PM. Dana Eckert, Estimator, (615) 555-0101' });
const A1 = ai(lead({ source_board: 'GC direct', gc_name: 'Pathway Builders', bid_due_date: '2026-11-10', bid_due_time: '14:00', invited_by_company: 'Pathway Builders', invited_by_contact: 'Dana Eckert', invited_by_email: 'dana@pathwaybuilders.com', invited_by_phone: '615-555-0101' }));
const M2 = mailOf({ subject: 'Summit Ridge Construction has invited you to bid: Harbor Point Hotel Murfreesboro', from: { name: 'BuildingConnected', email: 'team@buildingconnected.com', domain: 'buildingconnected.com' },
  html: '<p>Summit Ridge Construction has invited you to bid.</p><a href="https://app.buildingconnected.com/opportunities/abc123">View bid</a><p>Marco Lopez · mlopez@summitridgecc.com · (615) 555-0202</p>',
  text: 'Summit Ridge Construction has invited you to bid. Harbor Point Hotel Murfreesboro. Due Nov 10, 2026 5:00 PM. Marco Lopez mlopez@summitridgecc.com (615) 555-0202 https://app.buildingconnected.com/opportunities/abc123' });
const A2 = ai(lead({ source_board: 'BuildingConnected', gc_name: 'Summit Ridge Construction', bid_due_date: '2026-11-10', bid_due_time: '17:00', contact_email: 'team@buildingconnected.com', submit_to_email: 'bids@grayco-cs.com',
  invited_by_company: 'Summit Ridge Construction', invited_by_contact: 'Marco Lopez', invited_by_email: 'mlopez@summitridgecc.com', invited_by_phone: '(615) 555-0202' }));
const M3 = mailOf({ subject: 'ITB - Harbor Point Hotel Murfreesboro', from: { name: 'Gloria Miles', email: 'gmiller@grayco-cs.com', domain: 'grayco-cs.com' },
  text: '---------- Forwarded message ---------\nFrom: Kim Ortega <kortega@keystonegc.com>\nKeystone General Contractors — bids due Nov 7 2026 10:00 AM. Harbor Point Hotel Murfreesboro.' });
const A3 = ai(lead({ source_board: 'GC direct', gc_name: 'Keystone General Contractors', bid_due_date: '2026-11-07', bid_due_time: '10:00', contact_email: 'gmiller@grayco-cs.com',
  invited_by_company: 'Keystone General Contractors', invited_by_contact: 'Kim Ortega', invited_by_email: 'kortega@keystonegc.com', invited_by_phone: '901 555 0303' }));
const M4 = mailOf({ subject: 'Reminder: Harbor Point Hotel Murfreesboro bids due', from: { name: 'Dana Eckert', email: 'dana@pathwaybuilders.com', domain: 'pathwaybuilders.com' }, text: 'Reminder from Pathway Builders: bids due 11/10/2026 2:00 PM.' });
const A4 = ai(lead({ source_board: 'GC direct', gc_name: 'Pathway Builders', bid_due_date: '2026-11-10', bid_due_time: '14:00', invited_by_company: 'Pathway Builders', invited_by_email: 'dana@pathwaybuilders.com' }), 'reminder_or_update');

const recs = (m, a) => T.recordsFrom(m, a, T.linksOf(m), T.sourceHint(m, T.linksOf(m)), [], 'raw_' + m.id);
let items = [];
const r1 = recs(M1, A1)[0];
ok('invite 1 → one GC row (Pathway Builders, Dana, e-mail, phone, due)', r1.bidTo.length === 1 && r1.bidTo[0].company === 'Pathway Builders' && r1.bidTo[0].email === 'dana@pathwaybuilders.com' && r1.bidTo[0].contact === 'Dana Eckert' && /555-0101/.test(r1.bidTo[0].phone) && r1.bidTo[0].due === '2026-11-10T14:00' && r1.bidTo[0].emailId === M1.id, r1.bidTo);
let o = T.upsert(items, r1); items = o.items;
ok('invite 1 → added', o.action === 'added' && !o.newGc);
const r2 = recs(M2, A2)[0];
ok('BuildingConnected invite → the GC (Summit Ridge, Marco Lopez, his own e-mail), never team@ / bids@grayco', r2.bidTo.length === 1 && r2.bidTo[0].company === 'Summit Ridge Construction' && r2.bidTo[0].email === 'mlopez@summitridgecc.com' && r2.bidTo[0].contact === 'Marco Lopez' && r2.dueToEmail === 'mlopez@summitridgecc.com' && /buildingconnected/.test(r2.bidTo[0].inviteLink), r2.bidTo);
o = T.upsert(items, r2); items = o.items;
const id = items[0].id;
ok('invite 2 merges into the same lead and reports the new GC', o.action === 'merged' && o.id === id && o.newGc && o.newGc.length === 1 && o.newGc[0].company === 'Summit Ridge Construction', { a: o.action, n: o.newGc });
ok('the first GC stays "due to" (its due is earlier)', items[0].dueToCompany === 'Pathway Builders' && items[0].bidDue === '2026-11-10T14:00', items[0]);
const r3 = recs(M3, A3)[0];
ok('a GrayCo forward → the GC inside (Keystone), never the GrayCo forwarder', r3.bidTo.length === 1 && r3.bidTo[0].email === 'kortega@keystonegc.com' && r3.bidTo[0].company === 'Keystone General Contractors', r3.bidTo);
o = T.upsert(items, r3); items = o.items;
const it = items.find(x => x.id === id);
ok('invite 3 merges: 3 GCs on the lead', o.action === 'merged' && it.bidTo.length === 3 && it.bidTo.map(g => g.company).join('|') === 'Pathway Builders|Summit Ridge Construction|Keystone General Contractors', it.bidTo.map(g => g.company));
ok('the earliest-due GC (Keystone, Nov 7) is now "due to" and the lead\'s bid due', it.dueToCompany === 'Keystone General Contractors' && it.dueToEmail === 'kortega@keystonegc.com' && it.bidDue === '2026-11-07T10:00' && it.bidDueWas === '2026-11-10T14:00', { c: it.dueToCompany, d: it.bidDue });
ok('each GC keeps its own due date', it.bidTo[0].due === '2026-11-10T14:00' && it.bidTo[1].due === '2026-11-10T17:00' && it.bidTo[2].due === '2026-11-07T10:00');
const r4 = recs(M4, A4)[0];
o = T.upsert(items, r4); items = o.items;
ok('the same GC again (a reminder) adds no row and no "also invited"', items.find(x => x.id === id).bidTo.length === 3 && !o.newGc, { a: o.action, n: o.newGc });
const ALL = JSON.stringify(items.find(x => x.id === id).bidTo);
ok('no GrayCo / platform / no-reply address anywhere in bidTo', !/grayco-cs\.com|buildingconnected\.com"|planhub\.com|noreply|no-reply|team@/i.test(ALL.replace(/"inviteLink":"[^"]*"/g, '')), ALL);
ok('sources name both boards', items.find(x => x.id === id).alsoOn.indexOf('BuildingConnected') >= 0);

/* an old lead (no bidTo) is seeded from its dueTo* fields, then the next GC joins */
let old = [{ id: 'LI-old1', status: 'new', title: 'Cedar Lane Clinic Reroof', city: 'Bartlett', bidDue: '2026-11-12', source: 'GC direct', origin: 'email', dueToCompany: 'Oakline Builders', dueToContact: 'Ray Fox', dueToEmail: 'ray@oaklinebuilders.com', dueToPhone: '', sources: [{ name: 'GC direct' }], rev: 1, receivedAt: '2026-10-20T10:00:00Z' }];
const r5 = recs(mailOf({ subject: 'Cedar Lane Clinic Reroof', from: { name: 'Lee Park', email: 'lee@birchwoodco.com', domain: 'birchwoodco.com' }, text: 'Birchwood Co invites you to bid Cedar Lane Clinic Reroof due 11/12/2026' }),
  ai({ project_name: 'Cedar Lane Clinic Reroof', city: 'Bartlett', source_board: 'GC direct', bid_due_date: '2026-11-12', gc_name: 'Birchwood Co' }))[0];
ok('a GC writing directly → its sender is the contact', r5.bidTo[0] && r5.bidTo[0].email === 'lee@birchwoodco.com' && r5.bidTo[0].contact === 'Lee Park', r5.bidTo);
o = T.upsert(old, r5); old = o.items;
ok('an old lead: its dueTo GC becomes row 1, the new GC row 2, "also invited" names the new one', old[0].bidTo.length === 2 && old[0].bidTo[0].company === 'Oakline Builders' && old[0].bidTo[1].company === 'Birchwood Co' && o.newGc && o.newGc[0].company === 'Birchwood Co', old[0].bidTo);

/* ── 3. the alerts: "Also invited by", and reminders at the earliest open due date ── */
const AL = require(build + '/netlify/functions/_lib/bid-alerts.js');
const sentMail = []; const kv = {};
global.fetch = async (url, opt) => { if (/resend\.com/.test(url)) { sentMail.push(JSON.parse(opt.body)); return { ok: true, status: 200, json: async () => ({ id: 'r1' }) }; } return { ok: false, status: 404, json: async () => ({}) }; };
const env = k => ({ RESEND_API_KEY: 'test' })[k] || '';
const s = v => (v == null ? '' : String(v)).trim(), low = v => s(v).toLowerCase(), arr = v => Array.isArray(v) ? v : [];
const api = AL.make({ env, s, low, arr, nowIso: () => new Date().toISOString(), sb: async () => ({ ok: false, json: async () => [] }), kvCas: async (k, f) => { const n = f(kv[k]); if (n !== undefined) kv[k] = n; return kv[k]; }, kvGet: async k => kv[k], now: () => Date.parse('2026-10-26T15:00:00Z') });
const hp = items.find(x => x.id === id);
let ra = await api.notifyAlso([{ it: hp, gcs: [hp.bidTo[2]] }]);
ok('"Also invited by" alert goes out once, to office@ (the alert list)', ra.sent === 1 && sentMail.length === 1 && /Also invited by Keystone General Contractors/.test(sentMail[0].subject) && sentMail[0].to.indexOf('office@grayco-cs.com') >= 0, { ra, s: sentMail[0] && sentMail[0].subject, to: sentMail[0] && sentMail[0].to });
ok('the alert says the GC was added (now 3 GCs)', /now 3 GCs/.test(sentMail[0].text) && /kortega@keystonegc\.com/.test(sentMail[0].text), sentMail[0].text);
ra = await api.notifyAlso([{ it: hp, gcs: [hp.bidTo[2]] }]);
ok('never twice for the same lead and GC', ra.sent === 0 && sentMail.length === 1, ra);
const leadL = { id: 'LEADIN-x', name: 'Harbor Point Hotel Murfreesboro', bidDue: '2026-11-07T10:00', dueToCompany: 'Keystone General Contractors',
  bidTo: [{ company: 'Pathway Builders', email: 'dana@pathwaybuilders.com', due: '2026-11-10T14:00', status: 'not sent' }, { company: 'Summit Ridge Construction', email: 'mlopez@summitridgecc.com', due: '2026-11-10T17:00', status: 'not sent' }, { company: 'Keystone General Contractors', email: 'kortega@keystonegc.com', due: '2026-11-07T10:00', status: 'sent', sentAt: '2026-11-06T15:00:00Z' }] };
const cand = api.candidates([leadL], [], {})[0];
ok('reminder uses the earliest due of the GCs not sent yet (Pathway, Nov 10 2 PM), "to" that GC', cand && cand.bidDue === '2026-11-10T14:00' && cand.dueToCompany === 'Pathway Builders', cand && { d: cand.bidDue, c: cand.dueToCompany });
const rm = api._mailRemind(cand, '1h');
ok('the reminder names the GCs not sent yet', /Not sent yet to: Pathway Builders, Summit Ridge Construction/.test(rm.text) && /sent to Keystone/.test(rm.text), rm.text);

/* ── 4. the page ── */
if (!noBrowser) {
  const { chromium } = await import('playwright');
  const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
  const { computer, signIn, sleep, cset, cget, waitFor, resetCloud } = H;
  const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u4', name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', profile: 'estimator', active: true }]);
  const L1 = { id: 'L_hp', name: 'Harbor Point Hotel Murfreesboro', stage: 'New Lead', leadKind: 'Commercial', type: 'Commercial Reno', source: 'GC direct', estimator: 'Glenn Miller', bidDue: '2026-11-10T14:00',
    dueToCompany: 'Pathway Builders', dueToContact: 'Dana Eckert', dueToEmail: 'dana@pathwaybuilders.com', dueToPhone: '(615) 555-0101', createdAt: '2026-10-26T10:00:00Z', updatedAt: '2026-10-26T10:00:00Z',
    bidTo: [{ company: 'Pathway Builders', contact: 'Dana Eckert', email: 'dana@pathwaybuilders.com', phone: '(615) 555-0101', due: '2026-11-10T14:00', source: 'GC direct' },
      { company: 'Summit Ridge Construction', contact: 'Marco Lopez', email: 'mlopez@summitridgecc.com', phone: '(615) 555-0202', due: '2026-11-10T17:00', source: 'BuildingConnected', inviteLink: 'https://app.buildingconnected.com/opportunities/abc123' }] };
  const L2 = { id: 'L_old', name: 'Cedar Lane Clinic Reroof', stage: 'New Lead', leadKind: 'Commercial', type: 'Commercial Reno', source: 'GC direct', bidDue: '2026-11-12', dueToCompany: 'Oakline Builders', dueToContact: 'Ray Fox', dueToEmail: 'ray@oaklinebuilders.com', createdAt: '2026-10-20T10:00:00Z' };
  cset('leads', [L1, L2]);
  /* the old BIDSEND list already had Pathway (row b1): the third GC arrives later by e-mail */
  cset('gc_bid_bidders', { 'lead:L_hp': { list: [{ id: 'b1', company: 'Pathway Builders', contact: 'Dana Eckert', email: 'dana@pathwaybuilders.com', phone: '', due: '2026-11-10T14:00', method: 'email', status: 'not sent', notes: '', price: '', log: [] }], at: '2026-10-26T10:00:00Z', by: 'x' } });
  const A = await computer('A', { build });
  try {
    await signIn(A, 'wjohnson@grayco-cs.com', 12000);
    const ready = await waitFor(A, async () => !!(window._gcBidSend && window._gcBidToMerge && window.idbGet && ((await window.idbGet('leads')) || []).length >= 2), null, 90000, 500);
    ok('page ready', !!ready);
    await A.ev(() => window._gcBidSend.refresh(true)); await sleep(800);
    /* a third GC comes in through the Lead Inbox import */
    const merged = await A.ev(async () => window._gcBidToMerge(((await window.idbGet('leads')) || []).find(l => l.id === 'L_hp'), { bidTo: [{ company: 'Keystone General Contractors', contact: 'Kim Ortega', email: 'kortega@keystonegc.com', phone: '901 555 0303', due: '2026-11-07T10:00' }, { company: 'Summit Ridge Construction, LLC', email: 'mlopez@summitridgecc.com' }] }));
    ok('Lead Inbox import: the new GC joins lead.bidTo, the known one is not doubled', merged && merged.length === 3 && merged[2].company === 'Keystone General Contractors', merged);
    await A.ev(m => { window._setLeads(p => p.map(l => l.id === 'L_hp' ? Object.assign({}, l, { bidTo: m }) : l)); }, merged); await sleep(1500);
    await A.ev(() => window._gcBidSend.pullLeads()); await sleep(500);
    const list = await A.ev(() => window._gcBidSend.list('lead:L_hp'));
    ok('Bidding to: the saved GC + both invited GCs = 3 rows, one each', list.length === 3 && list.map(b => b.company).join('|') === 'Pathway Builders|Summit Ridge Construction|Keystone General Contractors' && new Set(list.map(b => b.id)).size === 3, list.map(b => b.id + ':' + b.company));
    const oldList = await A.ev(() => window._gcBidSend.list('lead:L_old'));
    ok('an old lead (dueTo* only) shows its GC', oldList.length === 1 && oldList[0].company === 'Oakline Builders' && oldList[0].email === 'ray@oaklinebuilders.com', oldList);
    /* the side panel */
    await A.ev(() => window._setView('leads')); await sleep(2500);
    await A.ev(() => window._gcLeadsHub.open('L_hp')); await sleep(2500);
    const sec = await waitFor(A, () => { const s = document.querySelector('#gcl-drawer section[data-gcbs]'); return s && /Bidding to \(3 GCs\)/.test(s.textContent) ? { t: s.innerText, boxes: [...s.querySelectorAll('input[data-gcbt-pick]')].map(i => i.checked) } : null; }, null, 20000, 400);
    ok('side panel: "Bidding to (3 GCs)" with company, person, e-mail, phone, due and a checked box each', sec && sec.boxes.length === 3 && sec.boxes.every(Boolean) && /Marco Lopez · mlopez@summitridgecc\.com · \(615\) 555-0202/.test(sec.t) && /Keystone General Contractors/.test(sec.t) && /due /.test(sec.t), sec);
    await A.ev(() => { const i = document.querySelector('#gcl-drawer input[data-gcbt-pick="' + window._gcBidSend.list('lead:L_hp')[1].id + '"]'); i.click(); }); await sleep(600);
    const pk = await A.ev(() => window._gcBidSend.picked('L_hp').length);
    ok('unticking a GC leaves it out of Send bid', pk === 2, pk);
    await A.ev(() => window._gcBidSend.pick('L_hp', window._gcBidSend.list('lead:L_hp')[1].id, true));
    /* send: one e-mail per GC, each its own, same attachment kind */
    const res = await A.ev(async () => {
      window.__GC_BIDSEND_NO_H2P__ = true;
      window._gcEstimatesState = [{ id: 'E_hp', leadId: 'L_hp', name: 'Harbor Point Hotel Murfreesboro', lines: [{ desc: 'Roofing', charge: 100000 }], totalCharge: 100000, updatedAt: '2026-10-26T12:00:00Z' }];
      const calls = []; const of = window.fetch;
      window.fetch = function(u, o){ if (/send-email/.test(String(u))) { const b = JSON.parse(o.body); calls.push(b); return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 'rs_' + calls.length, messageId: '<m' + calls.length + '>', from: 'bids@grayco-cs.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } })); } return of.apply(this, arguments); };
      const out = await window._gcBidSend.sendAll('lead:L_hp', { ids: window._gcBidSend.picked('L_hp') });
      window.fetch = of;
      return { out, calls: calls.map(c => ({ to: c.to, subject: c.subject, html: c.html, att: (c.attachments || []).map(a => a.filename), avoid: c.avoid, gc: c.gc })) };
    });
    ok('Send bid: 3 separate e-mails, one per GC', res.calls.length === 3 && res.out.every(r => r.ok) && res.calls.map(c => c.to).join('|') === 'dana@pathwaybuilders.com|mlopez@summitridgecc.com|kortega@keystonegc.com', res.calls.map(c => c.to));
    ok('each e-mail goes to ONE address (no other GC visible)', res.calls.every(c => typeof c.to === 'string' && !/[,;]/.test(c.to)));
    const names = ['Pathway Builders', 'Summit Ridge Construction', 'Keystone General Contractors'];
    ok('each e-mail is personalized for its GC and never names another', res.calls.every((c, i) => c.html.indexOf(names[i]) >= 0 && names.filter((n, j) => j !== i).every(n => c.html.indexOf(n) < 0 && c.subject.indexOf(n) < 0)) && /Hi Dana/.test(res.calls[0].html) && /Hi Marco/.test(res.calls[1].html) && /Hi Kim/.test(res.calls[2].html), res.calls.map(c => c.html.slice(0, 200)));
    ok('each e-mail has the proposal attached (its own PDF)', res.calls.every((c, i) => c.att.length === 1 && c.att[0].indexOf(names[i]) >= 0), res.calls.map(c => c.att));
    await sleep(1500);
    const after = await A.ev(async () => ({ list: window._gcBidSend.list('lead:L_hp'), lead: ((await window.idbGet('leads')) || []).find(l => l.id === 'L_hp') }));
    ok('per-GC sent status and time kept on the list', after.list.every(b => b.status === 'sent' && b.sentAt), after.list.map(b => b.status + ':' + b.sentAt));
    ok('…and on the lead (lead.bidTo), which is Submitted', after.lead && after.lead.bidTo && after.lead.bidTo.length === 3 && after.lead.bidTo.every(g => g.status === 'sent' && g.sentAt) && after.lead.bidStatus === 'submitted', after.lead && { bt: after.lead.bidTo, st: after.lead.bidStatus });
    ok('"due to" on the lead = the earliest-due GC (Keystone)', after.lead && after.lead.dueToCompany === 'Keystone General Contractors' && after.lead.bidDue === '2026-11-07T10:00', after.lead && [after.lead.dueToCompany, after.lead.bidDue]);
    const sec2 = await waitFor(A, () => { const s = document.querySelector('#gcl-drawer section[data-gcbs]'); return s && (s.innerText.match(/✓ sent to /g) || []).length === 3 ? s.innerText : null; }, null, 15000, 400);
    ok('side panel shows "✓ sent to <GC> <time>" for each', !!sec2 && /✓ sent to Summit Ridge Construction/.test(sec2), sec2);
    /* the Send bid dialog: Gmail instead, one per GC */
    await A.ev(() => window._gcBidSend.openSend('lead:L_hp')); await sleep(1200);
    const dlg = await A.ev(() => { const p = document.getElementById('gcbs-pop'); return p ? { gm: [...p.querySelectorAll('[data-gcbt-gm] button[data-gm]')].map(b => b.textContent), sent: (p.innerText.match(/✓ sent /g) || []).length } : null; });
    ok('Send bid dialog: "Open in Gmail instead" is one compose per GC, and shows ✓ sent', dlg && dlg.gm.length === 3 && dlg.sent >= 3, dlg);
    await A.ev(() => { const p = document.getElementById('gcbs-pop'); if (p) p.remove(); });
    /* removing a GC keeps it removed; adding one by hand works */
    await A.ev(() => { const l = window._gcBidSend.list('lead:L_hp').filter(b => b.company !== 'Summit Ridge Construction'); l.push({ id: 'b9', company: 'Northgate Partners', contact: 'Ann Lee', email: 'ann@northgatepartners.com', phone: '', due: '2026-11-11', method: 'email', status: 'not sent', notes: '', price: '', log: [] }); return window._gcBidSend.setList('lead:L_hp', l); }); await sleep(1500);
    await A.ev(() => window._gcBidSend.pullLeads()); await sleep(400);
    const l3 = await A.ev(async () => ({ list: window._gcBidSend.list('lead:L_hp').map(b => b.company), lead: ((await window.idbGet('leads')) || []).find(l => l.id === 'L_hp') }));
    ok('a GC removed by hand stays removed (even though lead.bidTo had it); one added by hand stays', l3.list.join('|') === 'Pathway Builders|Keystone General Contractors|Northgate Partners' && (l3.lead.bidToRemoved || []).indexOf('e:mlopez@summitridgecc.com') >= 0, l3.list);
    const again = await A.ev(async () => { const l = ((await window.idbGet('leads')) || []).find(x => x.id === 'L_hp'); return window._gcBidToMerge(l, { bidTo: [{ company: 'Summit Ridge Construction', email: 'mlopez@summitridgecc.com' }] }).map(g => g.company); });
    ok('a later invite from the removed GC does not bring it back', again.indexOf('Summit Ridge Construction') < 0, again);
    ok('no page errors from BIDSEND / BIDTO', A.errs.filter(e => /BIDSEND|BIDTO|gcbs|gcbt|_gcBidSend|_gcBidToMerge|withInvites|sameGc/.test(e)).length === 0, A.errs.slice(0, 5));
  } finally { try { await shared.close(); } catch (e) {} }
}
const pass = R.filter(Boolean).length; console.log('RESULT ' + pass + '/' + R.length);
process.exit(pass === R.length ? 0 : 1);
