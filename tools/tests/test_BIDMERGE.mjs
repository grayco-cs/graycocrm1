/* patch BIDMERGE tests: node tools/tests/test_BIDMERGE.mjs [repo dir] [mirror.json]
   One project, many invitations → ONE lead, ONE alert, every GC and trade on it.
     1. the server, end to end (the leads@ webhook's slow half: Resend's receiving API, the AI's answer, gc_lead_inbox, the
        admins' alert e-mail — all mocked at fetch()): 11 realistic invitation e-mails for "UrgentVet - Memphis" from 2 GCs
        across 9 trades (BuildingConnected per-trade invites, a reminder, the PlanHub copy, the GC's BuildingConnected copy)
        → 1 inbox item, exactly 1 new-lead e-mail, the GC / trade list right, quiet "+1 GC" history;
     2. two different projects from the same GC stay two leads (and two alerts);
     3. a later invitation with an EARLIER bid due → one "📅 moved sooner" note, never twice; later dues → nothing;
     4. SALESBLOCK: a pitch is never folded in; a portal / website lead matches only by its own id;
     5. the inbox's merged / unmerge actions (the merge tool's undo on the server);
     6. the CRM page: the hooks, the rules copied verbatim, the merge tool's dry run → apply → Recently deleted → undo;
     7. the real-data mirror: how many duplicate groups exist today (read only). */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const FN = path.join(ROOT, 'netlify/functions');
const MIRRORS = [process.argv[3], process.env.MIRROR, '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wUPG/mirror/rows.json',
  '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json'].filter(Boolean);

let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }

Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', RESEND_API_KEY: 're_test', ANTHROPIC_API_KEY: 'sk-test', BID_INBOUND_SECRET: 'handoff-test',
  PLANS_FETCH: '0', BID_PORTAL_DRAFTS: '0', ONCALL_OFF: '1', EMERG_OFF: '1' });
const BM = require(FN + '/_lib/bid-merge.js');
const BI = require(FN + '/bid-inbox.js');
const LEAD_TOOL = BI._lib.LEAD_TOOL || { name: 'record_bid_leads' };

/* ── realistic invitations: UrgentVet - Memphis, 8050 Dexter Road, Suite 103 — 2 GCs, 9 trades ── */
const ADDR = '8050 Dexter Road, Suite 103 104', BC = 'team@buildingconnected.com', PH = 'projectnotifications@planhub.com';
const LOB = { gc_name: 'Loberg Construction', submit_to_company: 'Loberg Construction', contact_name: 'Dana Whitfield', contact_email: 'estimating@lobergconstruction.com', contact_phone: '(847) 392-4300', submit_to_email: 'estimating@lobergconstruction.com' };
const BAG = { gc_name: 'Brasfield & Gorrie, LLC', submit_to_company: 'Brasfield & Gorrie, LLC', contact_name: 'Marcus Hale', contact_email: 'mhale@brasfieldgorrie.com', contact_phone: '(901) 555-0142', submit_to_email: 'mhale@brasfieldgorrie.com' };
const UV = { address: ADDR, city: 'Memphis', state: 'TN', zip: '38016', scope_summary: 'Renovation of an existing tenant space for UrgentVet (urgent care for pets).', submit_method: 'portal' };
const bcLink = id => ({ url: 'https://app.buildingconnected.com/opportunities/' + id + '/info', label: 'View Opportunity' });
const phLink = { url: 'https://app.planhub.com/project/details/5d1b2c3a-7e44', label: 'View Project' };
function mail(id, from, fromName, subject, text, lead, kind){ return { id, from, fromName, subject, text, ai: { kind: kind || 'invitation', leads: [Object.assign({}, UV, lead)] } }; }
const bcText = (gc, trade, due) => gc + ' has invited you to bid on UrgentVet - Memphis.\nBid Package: ' + trade + '\nBids Due: ' + due + '\nLocation: ' + ADDR + ', Memphis, TN 38016\nView Opportunity: https://app.buildingconnected.com/opportunities/64f0a1b2c3d4e5f6a7b8c9d0/info\nUnsubscribe';
const UVMAIL = [
  mail('uv-1', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis - Acoustical Ceilings', bcText('Loberg Construction', 'Acoustical Ceilings', 'Nov 3, 2026 12:00 PM CST'),
    Object.assign({ project_name: 'UrgentVet - Memphis - Acoustical Ceilings', trades: ['Acoustical Ceilings'], bid_due_date: '2026-11-03', bid_due_time: '12:00', bid_number: 'B26-0243', source_board: 'BuildingConnected', plans_links: [bcLink('64f0a1b2c3d4e5f6a7b8c9d0')] }, LOB)),
  mail('uv-2', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis - Drywall & Framing', bcText('Loberg Construction', 'Drywall & Framing', 'Nov 3, 2026 12:00 PM CST'),
    Object.assign({ project_name: 'UrgentVet - Memphis - Drywall & Framing', trades: ['Drywall & Framing'], bid_due_date: '2026-11-03', bid_due_time: '12:00', bid_number: 'B26-0243', source_board: 'BuildingConnected', plans_links: [bcLink('64f0a1b2c3d4e5f6a7b8c9d1')] }, LOB)),
  mail('uv-3', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis - Painting', bcText('Loberg Construction', 'Painting', 'Nov 3, 2026 12:00 PM CST'),
    Object.assign({ project_name: 'UrgentVet - Memphis (Painting)', trades: ['Painting'], bid_due_date: '2026-11-03', bid_due_time: '12:00', bid_number: 'B26-0243', source_board: 'BuildingConnected', plans_links: [bcLink('64f0a1b2c3d4e5f6a7b8c9d2')] }, LOB)),
  mail('uv-4', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis - Membrane Roofing', bcText('Loberg Construction', 'Membrane Roofing', 'Nov 3, 2026 12:00 PM CST'),
    Object.assign({ project_name: 'UrgentVet - Memphis - Membrane Roofing', trades: ['Membrane Roofing'], bid_due_date: '2026-11-03', bid_due_time: '12:00', bid_number: 'B26-0243', source_board: 'BuildingConnected', plans_links: [bcLink('64f0a1b2c3d4e5f6a7b8c9d3')] }, LOB)),
  mail('uv-5', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis - Bid Package 08 - Doors, Frames & Hardware', bcText('Loberg Construction', 'BP-08 Doors, Frames & Hardware', 'Nov 3, 2026 12:00 PM CST'),
    Object.assign({ project_name: 'UrgentVet - Memphis - Bid Package 08 - Doors, Frames & Hardware', trades: ['Doors, Frames & Hardware'], bid_due_date: '2026-11-03', bid_due_time: '12:00', bid_number: 'BP-08', source_board: 'BuildingConnected', plans_links: [bcLink('64f0a1b2c3d4e5f6a7b8c9d4')] }, LOB)),
  mail('uv-6', BC, 'BuildingConnected', 'Reminder to bid - UrgentVet - Memphis - UrgentVet - Memphis', 'Reminder: bids for UrgentVet - Memphis are due Nov 3, 2026 12:00 PM CST.\nLoberg Construction\nView Opportunity: https://app.buildingconnected.com/opportunities/64f0a1b2c3d4e5f6a7b8c9d0/info',
    Object.assign({ project_name: 'UrgentVet - Memphis', trades: ['Acoustical Ceilings', 'Drywall & Framing', 'Painting'], bid_due_date: '2026-11-03', bid_due_time: '12:00', source_board: 'BuildingConnected', plans_links: [bcLink('64f0a1b2c3d4e5f6a7b8c9d0')] }, LOB), 'reminder'),
  /* the second GC: PlanHub (project page), then its own BuildingConnected invitations — due a day LATER (no "sooner" note) */
  mail('uv-7', PH, 'PlanHub', 'New Project Invitation: UrgentVet Memphis TN - Flooring', 'Brasfield & Gorrie, LLC invited you to bid.\nProject: UrgentVet Memphis TN\nTrades: Flooring\nBid Date: 11/04/2026 2:00 PM\nAddress: 8050 Dexter Rd, Memphis, TN 38016\nView Project: https://app.planhub.com/project/details/5d1b2c3a-7e44',
    Object.assign({ project_name: 'UrgentVet Memphis TN', trades: ['Flooring'], bid_due_date: '2026-11-04', bid_due_time: '14:00', source_board: 'PlanHub', plans_links: [phLink], address: '8050 Dexter Rd' }, BAG)),
  mail('uv-8', PH, 'PlanHub', 'New Project Invitation: UrgentVet Memphis TN - Toilet Accessories, Signage', 'Brasfield & Gorrie, LLC invited you to bid.\nProject: UrgentVet Memphis TN\nTrades: Toilet Accessories, Signage\nBid Date: 11/04/2026 2:00 PM\nView Project: https://app.planhub.com/project/details/5d1b2c3a-7e44',
    Object.assign({ project_name: 'UrgentVet Memphis TN', trades: ['Toilet Accessories', 'Signage'], bid_due_date: '2026-11-04', bid_due_time: '14:00', source_board: 'PlanHub', plans_links: [phLink], address: '' }, BAG)),
  mail('uv-9', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis: Storefront & Glazing', bcText('Brasfield & Gorrie, LLC', 'Storefront & Glazing', 'Nov 4, 2026 2:00 PM CST'),
    Object.assign({ project_name: 'UrgentVet - Memphis: Storefront & Glazing', trades: ['Storefront & Glazing'], bid_due_date: '2026-11-04', bid_due_time: '14:00', source_board: 'BuildingConnected', plans_links: [bcLink('650aa1b2c3d4e5f6a7b8c9e0')] }, BAG)),
  mail('uv-10', 'mhale@brasfieldgorrie.com', 'Marcus Hale', 'RE: UrgentVet - Memphis - bid invite (Flooring)', 'Marcus here — following up on the PlanHub invite for UrgentVet Memphis, flooring. Bids due 11/4 by 2 PM. Thanks, Marcus Hale, Brasfield & Gorrie',
    Object.assign({ project_name: 'UrgentVet - Memphis', trades: ['Flooring'], bid_due_date: '2026-11-04', bid_due_time: '14:00', source_board: 'GC direct' }, BAG), 'gc_direct'),
  mail('uv-11', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis - Acoustical Ceilings', bcText('Brasfield & Gorrie, LLC', 'Acoustical Ceilings', 'Nov 4, 2026 2:00 PM CST'),
    Object.assign({ project_name: 'UrgentVet - Memphis - Acoustical Ceilings', trades: ['Acoustical Ceilings'], bid_due_date: '2026-11-04', bid_due_time: '14:00', source_board: 'BuildingConnected', plans_links: [bcLink('650aa1b2c3d4e5f6a7b8c9e1')] }, BAG))
];
const NINE = ['Acoustical Ceilings', 'Drywall & Framing', 'Painting', 'Membrane Roofing', 'Doors, Frames & Hardware', 'Flooring', 'Toilet Accessories', 'Signage', 'Storefront & Glazing'];

/* ── the fake world behind fetch() ── */
function world(mails){
  const tables = { gc_kv: {}, gc_lead_inbox_kv: {} }, byId = {}, sent = [], calls = [];
  mails.forEach(m => { byId[m.id] = m; });
  const put = (T, k, v) => { tables[T][k] = { key: k, value: v, updated_at: new Date(Date.now() + Math.random()).toISOString() }; };
  put('gc_kv', 'users', JSON.stringify([{ name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', active: true }]));
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => (typeof body === 'string' ? JSON.parse(body || 'null') : body), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), arrayBuffer: async () => new ArrayBuffer(0) });
  const fetchImpl = async (u, o) => {
    o = o || {}; const m = (o.method || 'GET').toUpperCase(); u = String(u); calls.push(m + ' ' + u);
    let mm;
    if ((mm = /api\.resend\.com\/emails\/receiving\/([^/?]+)\/attachments/.exec(u))) return res(200, { object: 'list', data: [] });
    if ((mm = /api\.resend\.com\/emails\/receiving\/([^/?]+)$/.exec(u))) { const x = byId[decodeURIComponent(mm[1])]; if (!x) return res(404, {}); return res(200, { object: 'email', id: x.id, created_at: x.at || '2026-11-02T15:00:00.000Z', from: (x.fromName ? x.fromName + ' ' : '') + '<' + x.from + '>', to: ['leads@in.grayco-cs.com'], cc: [], subject: x.subject, text: x.text, html: '', headers: {}, attachments: [] }); }
    if (/api\.resend\.com\/emails$/.test(u) && m === 'POST') { const b = JSON.parse(o.body); sent.push(b); return res(200, { id: 'sent_' + sent.length }); }
    if (/api\.anthropic\.com\/v1\/messages/.test(u)) {
      const b = JSON.parse(o.body), txt = b.messages[0].content.map(c => c.text || '').join('\n'), sub = (/\nSubject: (.*)\n/.exec(txt) || [])[1];
      const x = mails.find(y => y.subject === sub && txt.includes(y.text.slice(0, 120))); if (!x) return res(500, {});
      return res(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: LEAD_TOOL.name, input: x.ai }] });
    }
    if (/\/storage\/v1\/object\//.test(u)) return res(200, { Key: 'x' });
    mm = /\/rest\/v1\/([a-z_]+)\?(.*)$/.exec(u) || /\/rest\/v1\/([a-z_]+)$/.exec(u);
    if (mm && tables[mm[1]]) {
      const T = mm[1], q = new URLSearchParams(mm[2] || '');
      if (m === 'GET') { const k = q.get('key') || ''; if (/^eq\./.test(k)) { const r = tables[T][decodeURIComponent(k.slice(3))]; return res(200, r ? [r] : []); } return res(200, Object.values(tables[T]).slice(0, 1)); }
      if (m === 'POST') { const b = JSON.parse(o.body); put(T, b.key, b.value); return res(201, ''); }
      if (m === 'PATCH') { const k = decodeURIComponent((q.get('key') || '').slice(3)), at = decodeURIComponent((q.get('updated_at') || '').slice(3)); const r = tables[T][k]; if (!r || r.updated_at !== at) return res(200, []); put(T, k, JSON.parse(o.body).value); return res(200, [tables[T][k]]); }
    }
    if (mm) return res(200, []);
    return res(404, 'no route');
  };
  const kv = k => { for (const T of ['gc_lead_inbox_kv', 'gc_kv']) { const r = tables[T][k]; if (r) return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } return null; };
  return { tables, sent, calls, fetchImpl, kv, mails, byId };
}
async function deliver(W, m){
  const evt = { type: 'email.received', created_at: '2026-11-02T15:00:01.000Z', data: { email_id: m.id, created_at: '2026-11-02T15:00:00.000Z', from: m.from, to: ['leads@in.grayco-cs.com'], subject: m.subject, attachments: [] } };
  const of = globalThis.fetch; globalThis.fetch = W.fetchImpl; const ol = console.log, ow = console.warn, oe = console.error; const logs = []; console.log = console.warn = console.error = (...a) => logs.push(a.join(' '));
  let r; try { BI._test.resetKvTable(); r = await BI._test.processEvent(evt, { inline: true }); } finally { globalThis.fetch = of; console.log = ol; console.warn = ow; console.error = oe; }
  return Object.assign(r, { logs });
}
const live = W => (W.kv('gc_lead_inbox') || []).filter(x => x && !x.stub && x.status !== 'merged' && x.status !== 'dismissed');
const newLeadMails = W => W.sent.filter(b => /New lead|new leads/.test(b.subject));
const soonMails = W => W.sent.filter(b => /moved sooner/.test(b.subject));

console.log('BIDMERGE — the server, end to end (11 invitation e-mails, 2 GCs, 9 trades)');
const W1 = world(UVMAIL);
const R1 = [];
for (const m of UVMAIL) R1.push(await deliver(W1, m));
await t('every e-mail is read and stored (200, the bid path)', () => {
  R1.forEach((r, i) => { assert.strictEqual(r.status, 200, UVMAIL[i].id + ' ' + JSON.stringify(r.body)); assert.ok(Array.isArray(r.body.leads), UVMAIL[i].id + ' not the bid path: ' + JSON.stringify(r.body)); });
  assert.strictEqual(R1[0].body.leads[0].action, 'added'); R1.slice(1).forEach((r, i) => assert.ok(/^(merged|same)$/.test(r.body.leads[0].action), UVMAIL[i + 1].id + ' ' + r.body.leads[0].action));
});
await t('ONE lead: the 11 invitations are one inbox item, named for the project (not its first trade)', () => { const L = live(W1); assert.strictEqual(L.length, 1, JSON.stringify(L.map(x => x.title))); assert.strictEqual(L[0].title, 'UrgentVet - Memphis'); assert.strictEqual(L[0].titleRaw, 'UrgentVet - Memphis - Acoustical Ceilings'); });
await t('exactly ONE alert e-mail (no new lead / e-mail / to-do for the 10 later invitations)', () => {
  assert.strictEqual(newLeadMails(W1).length, 1, W1.sent.map(b => b.subject).join(' | ')); assert.strictEqual(W1.sent.length, 1, W1.sent.map(b => b.subject).join(' | '));
  assert.match(newLeadMails(W1)[0].subject, /New lead: UrgentVet - Memphis — Bid due Tue Nov 3 12:00 PM to Loberg Construction$/);
});
const IT = live(W1)[0] || {};
await t('the GC list: Loberg (5 trades, due Nov 3 noon) and Brasfield & Gorrie (5 trades incl. flooring, due Nov 4 2 PM)', () => {
  assert.strictEqual(IT.gcs.length, 2, JSON.stringify(IT.gcs));
  const lob = IT.gcs.find(g => /Loberg/.test(g.name)), bag = IT.gcs.find(g => /Brasfield/.test(g.name));
  assert.deepStrictEqual(lob.trades.slice().sort(), ['Acoustical Ceilings', 'Doors, Frames & Hardware', 'Drywall & Framing', 'Membrane Roofing', 'Painting']);
  assert.deepStrictEqual(bag.trades.slice().sort(), ['Acoustical Ceilings', 'Flooring', 'Signage', 'Storefront & Glazing', 'Toilet Accessories']);
  assert.strictEqual(lob.due, '2026-11-03T12:00'); assert.strictEqual(bag.due, '2026-11-04T14:00');
  assert.strictEqual(lob.contact, 'Dana Whitfield'); assert.strictEqual(lob.email, 'estimating@lobergconstruction.com'); assert.strictEqual(bag.phone, '(901) 555-0142');
  assert.match(lob.link, /buildingconnected\.com\/opportunities\//); assert.ok(bag.link, 'a link for B&G');
  assert.ok(lob.packages.some(p => /Bid Package 08/.test(p)), 'the bid package is kept: ' + JSON.stringify(lob.packages));
});
await t('9 trades on the lead, the earliest bid due, both boards, every e-mail kept', () => {
  assert.deepStrictEqual(BM.tradesOf(IT).slice().sort(), NINE.slice().sort());
  assert.strictEqual(IT.bidDue, '2026-11-03T12:00'); assert.strictEqual(IT.flag || '', '');
  assert.ok(IT.sources.some(x => x.name === 'PlanHub') && IT.sources.some(x => x.name === 'BuildingConnected'), JSON.stringify(IT.sources));
  assert.strictEqual(IT.emailIds.length, 11);
  assert.strictEqual(BM.summary(IT).text, '2 GCs · 9 trades');
});
await t('quiet history: "+1 GC: Brasfield & Gorrie, LLC (Flooring)" once, and "+ Loberg …" lines for its new trades', () => {
  const h = IT.history.map(x => x.text);
  assert.strictEqual(h.filter(x => /^\+1 GC: Brasfield & Gorrie, LLC \(Flooring\)$/.test(x)).length, 1, JSON.stringify(h));
  assert.ok(h.some(x => /^\+ Loberg Construction \(Painting\)$/.test(x)), JSON.stringify(h));
  assert.ok(h.every(x => !/^\+1 GC: Loberg/.test(x)), 'the first GC is not "+1"');
});

console.log('BIDMERGE — different projects from the same GC stay separate');
const OTHER = [
  mail('lb-1', BC, 'BuildingConnected', 'Invitation to Bid: Equipment Share - Little Rock - Drywall & Framing', 'Loberg Construction has invited you to bid.', Object.assign({}, LOB, { project_name: 'Equipment Share-Little Rock - OPEN SHOP', address: '7620 Fluid Drive', city: 'Little Rock', state: 'AR', trades: ['Drywall & Framing'], bid_due_date: '2026-11-05', bid_due_time: '16:00', source_board: 'BuildingConnected' })),
  mail('lb-2', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Germantown - Painting', 'Loberg Construction has invited you to bid.', Object.assign({}, LOB, { project_name: 'UrgentVet - Germantown', address: '7850 Poplar Ave', city: 'Germantown', state: 'TN', trades: ['Painting'], bid_due_date: '2026-11-03', bid_due_time: '12:00', source_board: 'BuildingConnected' })),
  mail('lb-3', PH, 'PlanHub', 'Maintenance Shop Construction at GE Patterson Pointe', 'Memphis Housing Authority invitation', { project_name: 'Maintenance Shop Construction at GE Patterson Pointe', gc_name: 'Memphis Housing Authority', submit_to_company: 'Memphis Housing Authority', address: '920 Latham Street', city: 'Memphis', state: 'TN', bid_number: 'CI 26 B 00783', bid_due_date: '2026-11-18', bid_due_time: '18:59', source_board: 'PlanHub' }),
  mail('lb-4', PH, 'PlanHub', 'Maintenance Shop Construction at Kefauver Terrace', 'Memphis Housing Authority invitation', { project_name: 'Maintenance Shop Construction at Kefauver Terrace', gc_name: 'Memphis Housing Authority', submit_to_company: 'Memphis Housing Authority', address: '', city: 'Memphis', state: 'TN', bid_number: 'CI 27 B 00784', bid_due_date: '2026-11-20', bid_due_time: '18:59', source_board: 'PlanHub' })
];
const W2 = world(UVMAIL.slice(0, 1).concat(OTHER));
for (const m of W2.mails) await deliver(W2, m);
await t('Loberg\'s three projects (UrgentVet Memphis, UrgentVet Germantown, Equipment Share) are three leads, three alerts', () => {
  const L = live(W2); assert.strictEqual(L.filter(x => /Loberg/.test(JSON.stringify(x.gcs))).length, 3, JSON.stringify(L.map(x => x.title)));
  assert.strictEqual(L.length, 5); assert.strictEqual(newLeadMails(W2).length, 5);
});
await t('Memphis Housing Authority: Patterson Pointe and Kefauver Terrace (different bid #s) stay two leads', () => {
  const L = live(W2).filter(x => /Maintenance Shop/.test(x.title)); assert.strictEqual(L.length, 2);
  assert.ok(BM.same(L[0], L[1]).no || !BM.same(L[0], L[1]).ok);
});

console.log('BIDMERGE — the earliest bid due moving sooner: one short note');
const SOON = [UVMAIL[0], UVMAIL[6],
  mail('sn-1', BC, 'BuildingConnected', 'Invitation to Bid: UrgentVet - Memphis - Painting', bcText('Montgomery Martin Contractors', 'Painting', 'Nov 2, 2026 3:00 PM CST'), Object.assign({}, { gc_name: 'Montgomery Martin Contractors', submit_to_company: 'Montgomery Martin Contractors', contact_email: 'bids@mmcontractors.com' },
    { project_name: 'UrgentVet - Memphis - Painting', trades: ['Painting'], bid_due_date: '2026-11-02', bid_due_time: '15:00', source_board: 'BuildingConnected' })),
  mail('sn-2', BC, 'BuildingConnected', 'Reminder to bid - UrgentVet - Memphis', 'Reminder: Montgomery Martin Contractors — due Nov 2, 2026 3:00 PM', Object.assign({}, { gc_name: 'Montgomery Martin Contractors', submit_to_company: 'Montgomery Martin Contractors' },
    { project_name: 'UrgentVet - Memphis', trades: ['Painting', 'Drywall & Framing'], bid_due_date: '2026-11-02', bid_due_time: '15:00', source_board: 'BuildingConnected' }), 'reminder')];
const W3 = world(SOON);
const R3 = []; for (const m of SOON) R3.push(await deliver(W3, m));
await t('a later GC due Nov 4 sends nothing; a third GC due Nov 2 3 PM (sooner than Nov 3 noon) → ONE "📅 moved sooner" note; its reminder → nothing', () => {
  assert.strictEqual(live(W3).length, 1);
  assert.strictEqual(newLeadMails(W3).length, 1); assert.strictEqual(soonMails(W3).length, 1, W3.sent.map(b => b.subject).join(' | ')); assert.strictEqual(W3.sent.length, 2);
  assert.match(soonMails(W3)[0].subject, /UrgentVet - Memphis — now Mon Nov 2 3:00 PM \(was Tue Nov 3 12:00 PM\)/);
  assert.ok(!R3[1].body.sooner && R3[2].body.sooner && R3[2].body.sooner.sent === 1, JSON.stringify(R3.map(r => r.body.sooner)));
  const it = live(W3)[0]; assert.strictEqual(it.bidDue, '2026-11-02T15:00'); assert.strictEqual(it.bidDueWas, '2026-11-03T12:00'); assert.strictEqual(it.gcs.length, 3);
});
await t('the same sooner date again (a re-run of that e-mail) is never a second note', async () => {
  await deliver(W3, SOON[2]); assert.strictEqual(soonMails(W3).length, 1);
});
await t('a date a person typed on the lead stays (no sooner note, no change)', () => {
  const up = BI._test.upsert, rec = (id, due, gc) => ({ id, origin: 'email', source: 'BuildingConnected', title: 'Clinic X - Memphis', city: 'Memphis', bidDue: due, dueToCompany: gc, trades: ['Painting'], plansLinks: [], files: [], emails: [], emailIds: [id], notes: [], contact: {}, addendum: 0 });
  let o = up([], rec('a', '2026-11-10', 'GC A')); o.items[0].bidDue = '2026-11-12'; o.items[0].bidDueManual = true;
  o = up(o.items, rec('b', '2026-11-08', 'GC B')); assert.ok(!o.sooner); assert.strictEqual(o.items[0].bidDue, '2026-11-12'); assert.strictEqual(o.items[0].gcs.length, 2);
});

await t('an invitation whose GC the AI missed is not counted as a second GC (it takes the board\'s one named GC)', () => {
  let r = BM.addGc([BM.gcOf({ title: 'X', source: 'BuildingConnected', trades: ['Painting'] })], BM.gcOf({ title: 'X', source: 'BuildingConnected', dueToCompany: 'Loberg Construction', trades: ['Drywall'] }));
  assert.strictEqual(r.gcs.length, 1); assert.strictEqual(r.gcs[0].name, 'Loberg Construction'); assert.strictEqual(r.gcs[0].trades.join('|'), 'Painting|Drywall');
  r = BM.addGc(r.gcs, BM.gcOf({ title: 'X', source: 'BuildingConnected', dueToCompany: 'Brasfield & Gorrie', trades: ['Tile'] }));
  r = BM.addGc(r.gcs, BM.gcOf({ title: 'X', source: 'BuildingConnected', trades: ['Roofing'] }));
  assert.strictEqual(r.gcs.length, 3, 'two named GCs on the board: an unnamed one stays apart');
});

console.log('BIDMERGE — SALESBLOCK and the Lead Inbox\'s own-id matching');
await t('a sales pitch with the project\'s name is never folded into the lead (added on its own → the Sales & spam filter)', () => {
  const up = BI._test.upsert;
  let items = up([], { id: 'LI-p1', origin: 'email', source: 'BuildingConnected', title: 'UrgentVet - Memphis', city: 'Memphis', bidDue: '2026-11-03', dueToCompany: 'Loberg', trades: [], plansLinks: [], files: [], emails: [], emailIds: ['p1'], notes: [], contact: {}, addendum: 0 }).items;
  const pitch = { id: 'LI-p2', origin: 'email', source: 'Other', title: 'UrgentVet - Memphis', city: 'Memphis', bidDue: '', trades: [], plansLinks: [], files: [], emailIds: ['p2'], notes: [], contact: {}, addendum: 0,
    emails: [{ from: 'growth@leadgenius-marketing.com', subject: 'UrgentVet - Memphis', snippet: 'Hi, I\'m Kyle from LeadGenius. We help contractors like yours get more leads for your business with our AI agents. Can I send details? Book a 15-minute call.' }] };
  const o = up(items, pitch); assert.strictEqual(o.action, 'added'); assert.strictEqual(o.items.filter(x => x.status === 'new').length, 2);
  assert.strictEqual(o.items[0].gcs.length, 1);
});
await t('a portal request and a website lead match only by their own id (never folded into a bid)', () => {
  const up = BI._test.upsert, base = { origin: 'email', source: 'BuildingConnected', title: 'Roof repair - Memphis', city: 'Memphis', bidDue: '2026-11-03', dueToCompany: 'GC', trades: [], plansLinks: [], files: [], emails: [], emailIds: [], notes: [], contact: {}, addendum: 0 };
  let items = up([], Object.assign({ id: 'LI-b1' }, base)).items;
  let o = up(items, Object.assign({}, base, { id: 'LI-portal1', origin: 'portal' })); assert.strictEqual(o.action, 'added');
  o = up(o.items, Object.assign({}, base, { id: 'LI-web1', origin: 'website' })); assert.strictEqual(o.action, 'added'); assert.strictEqual(o.items.length, 3);
  o = up(o.items, Object.assign({}, base, { id: 'LI-portal1', origin: 'portal', scope: 'more' })); assert.strictEqual(o.id, 'LI-portal1');
});

console.log('BIDMERGE — the inbox\'s merged / unmerge (the merge tool\'s undo on the server)');
await t('merged: the target gets every GC, trade, link and e-mail; unmerge takes them off again', () => {
  const up = BI._test.upsert, A = BI._test.applyAct, who = { email: 'office@grayco-cs.com' };
  const rec = (id, title, gc, trade, due, city) => ({ id, origin: 'email', source: 'BuildingConnected', title, city: city || 'Murfreesboro', address: '', bidDue: due, dueToCompany: gc, trades: [trade], plansLinks: [{ url: 'https://app.buildingconnected.com/opportunities/' + id + 'aaaaaaaaaaaa/info' }], files: [], emails: [{ id: 'm' + id, subject: title }], emailIds: ['m' + id], notes: [], contact: {}, addendum: 0 });
  let items = up([], rec('h1', 'Hollister #30684 - Flooring', 'GGC National Contractors', 'Flooring', '2026-11-10')).items;
  items = up(items, rec('h2', 'The Avenue Murfreesboro AW-KK: Stucco', 'Axxys Construction', 'Stucco', '2026-11-09', 'Nashville')).items;   /* filed apart (different city typed) */
  assert.strictEqual(items.length, 2);
  const before = JSON.parse(JSON.stringify(items.find(x => x.id === 'LI-h1') || items[0]));
  const ids = items.map(x => x.id), tgt = ids[0], src = ids[1];
  let r = A(items, { id: src, op: 'merged', into: tgt }, who); assert.ok(!r.err, r.err);
  let T = r.items.find(x => x.id === tgt); assert.strictEqual(T.gcs.length, 2); assert.deepStrictEqual(T.trades.slice().sort(), ['Flooring', 'Stucco']); assert.strictEqual(T.bidDue, '2026-11-09'); assert.strictEqual(T.plansLinks.length, 2);
  assert.ok(T.history.some(h => /Merged/.test(h.text)));
  r = A(r.items, { id: src, op: 'unmerge' }, who); assert.ok(!r.err, r.err);
  T = r.items.find(x => x.id === tgt); const S = r.items.find(x => x.id === src);
  assert.strictEqual(S.status, 'new'); assert.ok(!S.mergedInto);
  assert.strictEqual(T.gcs.length, 1); assert.deepStrictEqual(T.trades, before.trades); assert.strictEqual(T.bidDue, before.bidDue); assert.strictEqual(T.plansLinks.length, 1); assert.deepStrictEqual(T.emailIds, before.emailIds);
});

console.log('BIDMERGE — the CRM page');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const LIB = fs.readFileSync(path.join(FN, '_lib/bid-merge.js'), 'utf8');
await t('the patch is in once, the rules are the server\'s copied verbatim, the hooks are there', () => {
  assert.strictEqual(HTML.split('<script id="gc-patch-bidmerge">').length, 2);
  const core = LIB.slice(LIB.indexOf('/* CORE-BEGIN'), LIB.indexOf('/* CORE-END */') + 14); assert.ok(HTML.includes(core), 'core verbatim');
  assert.strictEqual(HTML.split('/* patch BIDMERGE */').length - 1, 9);
  ['window._gcBidMerge.fromItem(l, it, prev)', 'act: act,', 'window._gcBidMerge.rowTag(l)', 'window._gcBidMerge.paneHtml(l)', "arr(l.gcs).forEach(function(g){ add(g && g.name); })", 'W._gcBidMerge.chip(l)', "it('data-gcl-bidmerge'", 'data-gcl-bidmerge title='].forEach(h => assert.ok(HTML.includes(h), h));
});
/* the page script in a small fake browser: the Leads hub kit, 🗑 Recently deleted (_gcLDEL), the Lead Inbox, gc_kv */
function page(leads, opt){
  opt = opt || {};
  const i = HTML.indexOf('<script id="gc-patch-bidmerge">'), code = HTML.slice(HTML.indexOf('>', i) + 1, HTML.indexOf('</script>', i));
  const noop = () => {}, store = {}, acts = [], trash = {};
  const el = () => ({ style: {}, setAttribute: noop, getAttribute: () => null, appendChild: noop, remove: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], classList: { add: noop, remove: noop, contains: () => false } });
  const doc = { addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelector: () => null, createElement: el, head: el(), body: el(), documentElement: el() };
  let LIST = leads.slice();
  const W = { document: doc, console: { log: noop, warn: noop }, setTimeout: () => 0, clearTimeout: noop, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); } }, Date, JSON, Math, Promise, Object, Array, String, Number, RegExp, isFinite, isNaN, parseInt, encodeURIComponent };
  W.window = W;
  const kv = {};
  W.fetch = async (u, o) => { u = String(u); o = o || {};
    if (/gc_kv\?key=eq\./.test(u)) { const k = decodeURIComponent(/key=eq\.([^&]+)/.exec(u)[1]); return { ok: true, json: async () => (kv[k] ? [{ value: kv[k] }] : []) }; }
    if (/gc_kv\?on_conflict/.test(u)) { const b = JSON.parse(o.body); kv[b.key] = b.value; return { ok: true }; }
    return { ok: false, status: 404, json: async () => ({}) }; };
  W._gcLeadsHubKit = { all: () => LIST.filter(l => !trash[l.id]), setLeads: mut => { const n = mut(LIST.slice()); if (Array.isArray(n)) { LIST = n; return Promise.resolve(true); } return Promise.resolve(false); }, me: () => 'Office Person' };
  W._gcLeadsHub = { kit: W._gcLeadsHubKit, redraw: noop };
  W._gcLDEL = { who: () => ({ all: opt.role !== 'pm', email: 'office@grayco-cs.com' }),
    remove: async ids => { ids.forEach(id => { trash[id] = LIST.find(l => l.id === id); }); LIST = LIST.filter(l => !trash[l.id]); return { ok: true, deleted: ids.length, ids }; },
    restore: async ids => { const back = ids.map(id => trash[id]).filter(Boolean); ids.forEach(id => { delete trash[id]; }); LIST = LIST.concat(back); return { ok: true, restored: back.length }; } };
  W._gcLeadInbox = { act: b => { acts.push(b); return Promise.resolve(); } };
  vm.createContext(W); vm.runInContext(code, W);
  return { W, B: W._gcBidMerge, list: () => LIST, trash, acts, kv };
}
const FAKE = [
  { id: 'LEADIN-aaa1', inboxId: 'LI-aaa1', name: 'UrgentVet - Memphis - Drywall & Framing', source: 'BuildingConnected', city: 'Memphis', address: '8050 Dexter Road, Suite 103, Memphis, TN 38016', bidDue: '2026-11-03T12:00', dueToCompany: 'Loberg Construction', email: 'estimating@lobergconstruction.com', phone: '(847) 392-4300', contactName: 'Dana Whitfield', trades: ['Drywall & Framing'], estimator: 'Glenn Miller', docs: [{ ref: 'sb:crm-files/a.pdf', name: 'A1.pdf', hash: 'a' }], notes: 'Plans in A1', activity: [{ type: 'note', text: 'called Dana', at: '2026-10-30T15:00:00Z', by: 'Glenn' }], inboxAt: '2026-10-29T18:51:00Z', stage: 'New Lead', leadKind: 'Commercial' },
  { id: 'LEADIN-aaa2', inboxId: 'LI-aaa2', name: 'UrgentVet - Memphis (Painting)', source: 'BuildingConnected', city: 'Memphis', address: '8050 Dexter Rd, Memphis, TN', bidDue: '2026-11-03T12:00', dueToCompany: 'Loberg Construction', trades: ['Painting'], docs: [{ ref: 'sb:crm-files/b.pdf', name: 'Spec.pdf', hash: 'b' }], inboxAt: '2026-10-29T19:00:00Z', stage: 'New Lead', leadKind: 'Commercial' },
  { id: 'LEADIN-aaa3', inboxId: 'LI-aaa3', name: 'UrgentVet Memphis TN', source: 'PlanHub', city: 'Memphis', address: 'Memphis, TN 38016', bidDue: '2026-11-04T14:00', dueToCompany: 'Brasfield & Gorrie, LLC', dueToContact: 'Marcus Hale', dueToPhone: '(901) 555-0142', trades: ['Flooring', 'Signage'], notes: 'B&G wants alternates', plansLinks: [{ url: 'https://app.planhub.com/project/details/5d1b2c3a-7e44', board: 'PlanHub' }], inboxAt: '2026-10-30T10:00:00Z', stage: 'New Lead', leadKind: 'Commercial' },
  { id: 'LEADIN-bbb1', inboxId: 'LI-bbb1', name: 'Equipment Share-Little Rock - OPEN SHOP', source: 'BuildingConnected', city: 'Little Rock', address: '7620 Fluid Drive, Little Rock, AR 72206', bidDue: '2026-11-05T16:00', dueToCompany: 'Loberg Construction', trades: ['Drywall & Framing'], inboxAt: '2026-10-28T10:00:00Z', stage: 'New Lead', leadKind: 'Commercial' },
  { id: 'LEADIN-ccc1', inboxId: 'LI-ccc1', name: 'Maintenance Shop Construction at GE Patterson Pointe', source: 'PlanHub', city: 'Memphis', address: '920 Latham Street, Memphis, TN 38106', bidDue: '2026-11-18T18:59', dueToCompany: 'Memphis Housing Authority', bidNumber: 'CI 26 B 00783', stage: 'New Lead' },
  { id: 'LEADIN-ccc2', inboxId: 'LI-ccc2', name: 'Maintenance Shop Construction at Kefauver Terrace', source: 'PlanHub', city: 'Memphis', address: 'Memphis, TN 38106', bidDue: '2026-11-20T18:59', dueToCompany: 'Memphis Housing Authority', bidNumber: 'CI 27 B 00784', stage: 'New Lead' },
  { id: 'LW1', name: 'UrgentVet - Memphis', websiteLead: true, origin: 'website', source: 'Website (grayco-cs.com)', city: 'Memphis', stage: 'New Lead' }
];
await t('dry run: one group (the 3 UrgentVet leads), nothing changed; same-GC and same-owner projects are not grouped; a website lead never', () => {
  const P = page(FAKE);
  const g = P.B.groups(); assert.strictEqual(g.length, 1, JSON.stringify(g.map(x => x.ids)));
  assert.strictEqual(JSON.stringify(g[0].ids.slice().sort()), JSON.stringify(['LEADIN-aaa1', 'LEADIN-aaa2', 'LEADIN-aaa3'])); assert.strictEqual(g[0].keeper, 'LEADIN-aaa1');
  assert.strictEqual(g[0].gcs.length, 2); assert.strictEqual(g[0].due, '2026-11-03T12:00'); assert.ok(g[0].why.length);
  assert.strictEqual(P.B.count(), 1); assert.strictEqual(P.B.label(), '🔗 Merge duplicate bid leads (1)');
  assert.strictEqual(P.list().length, FAKE.length); assert.strictEqual(JSON.stringify(P.list()), JSON.stringify(FAKE)); assert.strictEqual(P.acts.length, 0);
});
await t('a PM does not get the tool', () => { const P = page(FAKE, { role: 'pm' }); assert.strictEqual(P.B.can(), false); assert.strictEqual(P.B.count(), 0); });
await t('merge: the kept lead lists both GCs and every trade, contact, file, link, note and history line; the copies go to Recently deleted; the inbox is told', async () => {
  const P = page(FAKE);
  const g = P.B.groups(); const r = await P.B.apply(g.map(x => ({ keeper: x.keeper, ids: x.ids })));
  assert.ok(r && r.ok, JSON.stringify(r)); assert.strictEqual(r.groups, 1); assert.strictEqual(JSON.stringify(r.folded.slice().sort()), JSON.stringify(['LEADIN-aaa2', 'LEADIN-aaa3']));
  const K = P.list().find(l => l.id === 'LEADIN-aaa1');
  assert.strictEqual(P.list().length, FAKE.length - 2); assert.ok(P.trash['LEADIN-aaa2'] && P.trash['LEADIN-aaa3'], 'in Recently deleted');
  assert.strictEqual(K.gcs.length, 2); assert.strictEqual(BM.tradesOf(K).slice().sort().join('|'), 'Drywall & Framing|Flooring|Painting|Signage');
  const bg = K.gcs.find(x => /Brasfield/.test(x.name)); assert.strictEqual(bg.contact, 'Marcus Hale'); assert.strictEqual(bg.phone, '(901) 555-0142'); assert.strictEqual(bg.due, '2026-11-04T14:00');
  assert.strictEqual(K.docs.map(d => d.name).sort().join('|'), 'A1.pdf|Spec.pdf'); assert.strictEqual(K.plansLinks.length, 1); assert.match(K.notes, /Plans in A1/); assert.match(K.notes, /B&G wants alternates/);
  assert.ok(K.activity.some(a => a.text === 'called Dana')); assert.ok(K.activity.some(a => a.type === 'bidmerge' && /Merged 2 duplicate bid leads/.test(a.text)));
  assert.strictEqual(K.estimator, 'Glenn Miller'); assert.strictEqual(K.bidDue, '2026-11-03T12:00'); assert.strictEqual(K.mergedFrom.slice().sort().join('|'), 'LEADIN-aaa2|LEADIN-aaa3');
  assert.strictEqual(P.acts.map(a => a.op + ':' + a.id + '>' + a.into).sort().join('|'), 'merged:LI-aaa2>LI-aaa1|merged:LI-aaa3>LI-aaa1');
  assert.strictEqual(P.kv.gc_bidmerge_log.entries.length, 1);
  assert.match(P.B.rowTag(K), /2 GCs · 4 trades/); assert.match(P.B.paneHtml(K), /2 GCs invited us · 4 trades/); assert.match(P.B.paneHtml(K), /Marcus Hale/);
  assert.strictEqual(P.B.count(), 0, 'nothing left to merge');
  /* undo */
  const u = await P.B.undo(); assert.strictEqual(u, true);
  assert.strictEqual(P.list().length, FAKE.length);
  const K2 = P.list().find(l => l.id === 'LEADIN-aaa1'); assert.ok(!K2.gcs && !K2.bidMerge, 'the kept lead is as it was'); assert.strictEqual(K2.trades.join('|'), 'Drywall & Framing');
  assert.ok(P.list().find(l => l.id === 'LEADIN-aaa3'), 'the copy is back');
  assert.strictEqual(P.acts.slice(2).map(a => a.op + ':' + a.id).sort().join('|'), 'unmerge:LI-aaa2|unmerge:LI-aaa3');
  assert.ok(P.kv.gc_bidmerge_log.entries[0].undone); assert.strictEqual(P.B.count(), 1);
});
await t('fromItem: the inbox item\'s GC list and "+1 GC" lines reach the lead (once)', () => {
  const P = page([]), l = { id: 'LEADIN-x', activity: [] };
  P.B.fromItem(l, IT); P.B.fromItem(l, IT);
  assert.strictEqual(l.gcs.length, 2); assert.strictEqual(l.trades.length, 9); assert.strictEqual(l.activity.filter(a => /^\+1 GC/.test(a.text)).length, 1);
  assert.match(P.B.rowTag(l), /· 2 GCs · 9 trades/);
});

console.log('BIDMERGE — the real-data mirror (read only)');
await t('duplicate bid lead groups in the mirror today', () => {
  const f = MIRRORS.find(p => { try { return fs.statSync(p).size > 0; } catch (e) { return false; } });
  if (!f) { console.log('    (no mirror file found — skipped)'); return; }
  const rows = JSON.parse(fs.readFileSync(f, 'utf8')), row = rows.find(r => r && r.key === 'leads');
  let L = row ? (row.v !== undefined ? row.v : row.value) : []; if (typeof L === 'string') L = JSON.parse(L);
  const bids = L.filter(l => BM.liveLead(l) && BM.isBidLead(l)), g = BM.groups(L);
  console.log('    mirror ' + f + ' (' + (row && row.updated_at) + '): ' + L.length + ' leads, ' + bids.length + ' open bid leads, ' + g.length + ' duplicate group(s), ' + g.reduce((t, x) => t + x.ids.length - 1, 0) + ' extra lead(s)');
  g.forEach(x => console.log('      · ' + x.leads.map(l => '"' + l.name + '"').join(' + ') + '  [' + x.why.join('; ') + ']  GCs: ' + x.gcs.map(y => y.name).join(', ')));
  /* never: the two Memphis Housing Authority projects */
  assert.ok(!g.some(x => x.leads.some(l => /Patterson/.test(l.name)) && x.leads.some(l => /Kefauver/.test(l.name))), 'MHA projects stay apart');
  g.forEach(x => { for (let i = 0; i < x.leads.length; i++) for (let j = i + 1; j < x.leads.length; j++) assert.ok(!BM.same(x.leads[i], x.leads[j]).no, 'no hard conflict inside a group'); });
});

console.log(failed ? 'FAILED ' + passed + '/' + (passed + failed) : 'OK ' + passed + '/' + passed);
process.exit(failed ? 1 : 0);
