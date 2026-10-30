// test_LEADBULK.mjs <build-dir> — patch LEADBULK (owner 10/30: "need to be able to mass delete leads by clicking each one
//   and deleting, and need to change this from residential to commercial").
//   A (admin, desktop): ☐ Select on the List → tick 3 leads by tapping them + a lead that is already a job → the bar says
//     "4 selected · 1 already a job — skipped"; the delete asks (the count, the names, Undo in Admin → Recycle bin → Restore);
//     3 deleted through the CRM's lead delete (gc_tombstones, the shared deleted record); the job is not; they stay gone
//     after an older copy of the list comes back from the cloud, after the same lead is brought in again (the Lead Inbox
//     import's way: the same inboxId, a new id) and after a reload; ⋯ More → 🗑 Recently deleted lists them.
//     Board: ☐ Select ticks a card; Cancel leaves Select.
//     The lead panel of a residential CompanyCam lead (like "Ramble on Summer"): no ⏰ Bid, no 🏢 Bidding to; a bid lead has
//     them. Type menu → Commercial: saved (leadKind, leadKindManual, the cloud), kept after a reload and after an older copy
//     of the list comes back; still no Bid section (not a bid source).
//   B (office): Select all shown (searched) → 3 deleted.
//   C (PM): ticks only his own leads (🔒 on another PM's), cannot delete another PM's lead, deletes his own.
// Offline harness (GC_HARNESS, default the session scratchpad's wME/harness.mjs), made-up demo data by default.
// GC_MIRROR=<mirror.json> also loads the read-only real-data mirror into the in-memory cloud first (it is read here,
// never written, never committed). GC_SHOTS=<dir> saves screenshots.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wME/harness.mjs';
const Hm = await import(pathToFileURL(HARNESS).href);
const { computer, sleep, waitFor, cset, cget, signIn, mclick, broadcast, cloud, ACCOUNTS } = Hm;
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_LEADBULK.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.GC_SHOTS || '';
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

/* ── the world: made-up people and leads (+ the real mirror when asked) ── */
const parse = v => { if (typeof v === 'string') try { return JSON.parse(v); } catch (e) {} return v; };
let USERS = [
  { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u1b', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true },
  { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Manager', profile: 'office', active: true },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u4', name: 'Other PM', email: 'opm@example.invalid', role: 'Project Manager', active: true }];
let LEADS0 = [];
if (process.env.GC_MIRROR) {
  const rows = JSON.parse(fs.readFileSync(process.env.GC_MIRROR, 'utf8'));
  for (const r of rows) if (r && r.key) cset(r.key, 'v' in r ? r.v : r.value);
  const u = parse(cget('users')); if (Array.isArray(u)) { const have = new Set(u.map(x => String(x.email || '').toLowerCase())); USERS = u.map(x => /^sbiffle@/i.test(x.email || '') ? Object.assign({}, x, { role: 'Project Manager' }) : x).concat(USERS.filter(x => !have.has(x.email))); }
  LEADS0 = (parse(cget('leads')) || []).filter(Boolean);
  console.log('mirror: ' + rows.length + ' rows, ' + LEADS0.length + ' leads');
}
const PMN = (USERS.find(x => /^sbiffle@/i.test(x.email || '')) || {}).name || 'Sample PM';
cset('users', USERS);
if (!cget('projects')) cset('projects', [{ id: 'PJ1', po: 'PO-9001', name: 'Bulk Demo Job', client: 'Demo Client', address: '1 Demo Way', pm: 'Other PM', status: 'Active', type: 'Residential Reno', contract: 1000 }]);
const H = 3600e3, now = Date.now(), ago = h => new Date(now - h * H).toISOString();
const LD = (id, o) => Object.assign({ id, name: id, stage: 'New Lead', status: 'new', source: 'Website', type: 'Residential', websiteLead: true, createdAt: ago(30), updatedAt: ago(30) }, o);
const MINE = [
  LD('LB_a1', { name: 'Bulk Admin One', pm: 'Other PM' }), LD('LB_a2', { name: 'Bulk Admin Two', pm: 'Other PM' }), LD('LB_a3', { name: 'Bulk Admin Three', pm: 'Other PM', inboxId: 'LI-bulk3', inboxRev: 1, source: 'Lead Inbox' }),
  LD('LB_job', { name: 'Bulk Admin Job', pm: 'Other PM', pid: 'PJ1', stage: 'Contacted', contactedAt: ago(20) }),
  LD('LB_keep', { name: 'Bulk Admin Keep', pm: 'Other PM' }),
  LD('LCC_PRJbulkdemo', { name: 'Bulk Ramble Demo', company: 'Bulk Ramble Demo', source: 'CompanyCam', type: undefined, websiteLead: undefined, projectType: 'Residential Reno', stage: 'Estimate Sent', status: 'new', ccamId: '990001', fromProjectId: 'PRJbulkdemo', created: '2026-10-23', contactedAt: ago(50), subPortal: { at: ago(40), jobId: 'j_ldbdemo', state: 'draft', visibility: 'private' }, priority: 'Medium' }),
  LD('LB_bid', { name: 'Bulk Bid Clinic', source: 'BuildingConnected', type: 'Commercial Reno', leadKind: 'Commercial', websiteLead: undefined, inboxId: 'LI-bulkbid', estimator: 'Other PM', bidDue: new Date(now + 5 * 24 * H).toISOString().slice(0, 10), dueToCompany: 'Demo GC Inc' }),
  LD('LB_o1', { name: 'Bulk Office One', pm: 'Other PM' }), LD('LB_o2', { name: 'Bulk Office Two', pm: 'Other PM' }), LD('LB_o3', { name: 'Bulk Office Three', pm: 'Other PM' }),
  LD('LB_p1', { name: 'Bulk PM Own One', pm: PMN }), LD('LB_p2', { name: 'Bulk PM Own Two', pm: PMN }),
  LD('LB_px', { name: 'Bulk PM Not His', pm: 'Other PM', apm: PMN }),
];
for (let i = 0; i < 40; i++) MINE.push(LD('LBF' + i, { name: 'Filler Lead ' + i, pm: i % 2 ? 'Other PM' : '', createdAt: ago(200 + i), updatedAt: ago(200 + i) }));
const ALL = LEADS0.concat(MINE);
cset('leads', ALL);
const cloudLeads = () => { const v = parse(cget('leads')); return Array.isArray(v) ? v : []; };
const tomb = id => { const v = parse(cget('gc_tombstones')); return !!(v && v['leads:' + id]); };
const cl = id => cloudLeads().find(l => l && l.id === id);
const errsOf = c => c.errs.filter(e => !/ResizeObserver/.test(e) && !/unstable_scheduleCallback.*react-dom\.production/.test(e));
const rows = c => c.ev(() => [...document.querySelectorAll('#gc-leads-hub tr.gcl-lr[data-gcl-id]')].map(r => r.getAttribute('data-gcl-id')));
const has = (c, id) => c.ev(id => window._gcLeadsHubKit.all().some(l => l.id === id), id);
const bar = c => c.ev(() => { const b = document.getElementById('gclb-bar'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : ''; });
const drawerOpen = c => c.ev(() => { const d = document.getElementById('gcl-drawer'); return !!(d && d.getBoundingClientRect().width > 0); });
const pushOld = (list, from) => { const row = cset('leads', list); broadcast(row, from || 'old-computer'); };
async function search(c, q){ await c.page().locator('#gc-leads-hub .gclu-q').fill(q); await sleep(900); }
async function toLeads(c){
  await c.ev(() => window._setView && window._setView('leads'));
  await waitFor(c, () => !!document.querySelector('#gc-leads-hub tr.gcl-lr[data-gcl-id]'), null, 60000);
  await waitFor(c, () => window._gcLeadsHubKit.all().some(l => l.id === 'LB_p2'), null, 60000, 500);
  await sleep(1200);
  return c.page();
}
async function rowClick(c, id){ const p = c.page(); const loc = p.locator('#gc-leads-hub tr.gcl-lr[data-gcl-id="' + id + '"] td.c-stage'); await loc.scrollIntoViewIfNeeded().catch(() => {}); const bb = await loc.boundingBox(); if (!bb) return false; await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(250); return true; }
async function openLead(c, id){ await c.ev(id => window._gcLeadsHub.open(id), id); await waitFor(c, () => !!document.getElementById('gcl-drawer'), null, 8000); await sleep(600); }
const drawerInfo = c => c.ev(() => { const d = document.getElementById('gcl-drawer'); if (!d) return null; const h4 = [...d.querySelectorAll('section > h4')].map(h => h.textContent.trim()); const bs = d.querySelector('section[data-gcbs]');
  return { h4, bid: h4.some(t => /⏰ Bid/.test(t)), bidding: !!(bs && bs.offsetParent), kind: (d.querySelector('select[data-d="kind"]') || {}).value || null, head: (d.querySelector('.hd') || {}).innerText || '', notFound: /NOT FOUND/.test(d.innerText), plans: !!d.querySelector('.gclu-plans') }; });
async function prep(c){ await c.ctx.addInitScript(() => { try { localStorage.setItem('gc_phone_desk', '1'); ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} }); }

try {
  /* ── A: the owner (admin), desktop ── */
  const A = await computer('A', { build }); await prep(A);
  await signIn(A, 'wjohnson@grayco-cs.com', 12000);
  const pa = await toLeads(A);
  ok(await A.ev(() => !!document.querySelector('#gc-leads-hub [data-gclb-sel]')), 'List: a "☐ Select" button in the header');
  ok(await A.ev(() => !document.querySelector('#gc-leads-hub .gclb-chk')), '… no tick boxes until Select is on');
  await search(A, 'Bulk Admin');
  await mclick(pa, '#gc-leads-hub [data-gclb-sel]'); await sleep(500);
  const s0 = await A.ev(() => ({ chk: document.querySelectorAll('#gc-leads-hub tr.gcl-lr .gclb-chk').length, rows: document.querySelectorAll('#gc-leads-hub tr.gcl-lr').length, all: !!document.querySelector('#gc-leads-hub [data-gclb-all]'), bar: !!document.getElementById('gclb-bar'), job: !!document.querySelector('#gc-leads-hub tr[data-gcl-id="LB_job"] .gclb-job') }));
  ok(s0.chk === s0.rows && s0.rows >= 5 && s0.all && s0.bar && s0.job, 'Select on: a tick box on every row, "Select all shown", the bar; the job-linked lead is marked "🏗 job"', s0);
  for (const id of ['LB_a1', 'LB_a2', 'LB_a3']) await rowClick(A, id);
  ok(!(await drawerOpen(A)), 'tapping a row in Select ticks it (the lead does not open)');
  await mclick(pa, '#gc-leads-hub tr[data-gcl-id="LB_job"] .gclb-chk'); await sleep(300);
  let bt = await bar(A);
  ok(/^4 selected/.test(bt) && /1 already a job — skipped/.test(bt) && /🗑 Delete selected \(3\)/.test(bt) && /Cancel/.test(bt), 'the bar: "4 selected · 1 already a job — skipped · 🗑 Delete selected (3) · Cancel"', bt);
  ok(JSON.stringify((await A.ev(() => window._gcLeadBulk.selected())).sort()) === JSON.stringify(['LB_a1', 'LB_a2', 'LB_a3', 'LB_job']), '… the 4 ticked');
  await mclick(pa, '#gclb-bar [data-gclb-a="del"]'); await sleep(400);
  const q = await A.ev(() => { const o = document.getElementById('gcl-delq'); return o ? o.innerText.replace(/\s+/g, ' ') : ''; });
  ok(/Delete 3 leads\?/.test(q) && /Bulk Admin One/.test(q) && /Bulk Admin Two/.test(q) && /Bulk Admin Three/.test(q) && /Skipped — already a job: Bulk Admin Job/.test(q) && /Admin → Recycle bin → Restore/.test(q), 'the delete asks: "Delete 3 leads?", the names, the skipped job, Undo in Admin → Recycle bin → Restore', q);
  if (SHOTS) await pa.screenshot({ path: SHOTS + '/bulk_confirm.png' });
  await mclick(pa, '#gcl-delq [data-a="delete"]'); await sleep(800);
  const r1 = await rows(A);
  ok(!r1.includes('LB_a1') && !r1.includes('LB_a2') && !r1.includes('LB_a3') && r1.includes('LB_job') && r1.includes('LB_keep'), 'deleted: the 3 rows are gone, the job-linked lead and the rest stay', r1);
  ok(await A.ev(() => !window._gcLeadBulk.on() && !document.getElementById('gclb-bar')), '… and Select ends');
  ok(await A.ev(() => /3 leads deleted/.test((document.getElementById('gcx-ldel-toast') || {}).innerText || '')), '… the CRM\'s delete says "3 leads deleted" with its Undo');
  let gone = false; for (let i = 0; i < 40 && !gone; i++) { await sleep(500); gone = ['LB_a1', 'LB_a2', 'LB_a3'].every(id => tomb(id) && !cl(id)); }
  ok(gone, 'the cloud: on the delete list (gc_tombstones) and off the cloud\'s lead list', ['LB_a1', 'LB_a2', 'LB_a3'].map(id => [id, tomb(id), !!cl(id)]));
  const del = parse(cget('gc_leads_deleted'));
  ok(!!(del && del.leads && ['LB_a1', 'LB_a2', 'LB_a3'].every(id => del.leads[id] && del.leads[id].deletedAt)), 'the shared deleted record (gc_leads_deleted, Recently deleted) has all 3');
  ok(!!cl('LB_job') && !tomb('LB_job'), 'the job-linked lead was not deleted');
  /* an older copy of the list comes back from the cloud (another computer that had not heard of the delete) */
  pushOld(ALL.map(l => Object.assign({}, l)), 'old-computer'); await sleep(7000);
  ok(!(await has(A, 'LB_a1')) && !(await has(A, 'LB_a2')) && !(await has(A, 'LB_a3')) && !(await rows(A)).some(id => /^LB_a[123]$/.test(id)), 'an older copy from the cloud does not bring them back');
  /* the Lead Inbox import's way: the same inbox item, under a new lead id */
  await A.ev(() => window._setLeads(prev => (prev || []).concat([{ id: 'LEADIN-bulk3', name: 'Bulk Admin Three', inboxId: 'LI-bulk3', source: 'Lead Inbox', leadKind: 'Residential', stage: 'New Lead', updatedAt: new Date().toISOString() }, { id: 'LB_a1', name: 'Bulk Admin One', stage: 'New Lead', updatedAt: new Date().toISOString() }])));
  await sleep(3000);
  ok(!(await has(A, 'LEADIN-bulk3')) && !(await has(A, 'LB_a1')), 'brought in again (the same inbox item under a new id, or the same id): blocked', await A.ev(() => window._gcLeadsHubKit.all().filter(l => /bulk3|LB_a1/.test(l.id)).map(l => l.id)));
  /* ⋯ More → 🗑 Recently deleted */
  await mclick(pa, '#gc-leads-hub [data-gclu-more]'); await sleep(300);
  ok(await A.ev(() => !!document.querySelector('#gc-leads-hub .gclu-menu [data-gclb-trash]')), '⋯ More has "🗑 Recently deleted"');
  await mclick(pa, '#gc-leads-hub .gclu-menu [data-gclb-trash]'); await sleep(1200);
  const tr = await A.ev(() => { const o = document.getElementById('gcx-ldel-trash'); return o ? o.innerText : ''; });
  ok(/Recently deleted leads/.test(tr) && /Bulk Admin One/.test(tr) && /Bulk Admin Three/.test(tr) && /Restore/.test(tr), '… it opens the CRM\'s Recently deleted (with Restore)', tr.slice(0, 200));
  await A.ev(() => { const o = document.getElementById('gcx-ldel-trash'); if (o) o.remove(); });
  ok(await A.ev(() => !!document.querySelector('[data-a="trash"]')), 'Admin → Recycle bin\'s link target (the Leads page\'s [data-a="trash"]) is on the Leads screen');
  /* the board */
  await search(A, 'Bulk Office');
  await mclick(pa, '#gc-leads-hub [data-gcl-v="board"]'); await sleep(800);
  ok(await A.ev(() => !!document.querySelector('#gc-leads-hub [data-gclb-sel]')), 'Board: "☐ Select" too');
  await mclick(pa, '#gc-leads-hub [data-gclb-sel]'); await sleep(500);
  const bc = await A.ev(() => ({ cards: document.querySelectorAll('#gc-leads-hub .gcl-card').length, chk: document.querySelectorAll('#gc-leads-hub .gcl-card .gclb-chk').length, drag: [...document.querySelectorAll('#gc-leads-hub .gcl-card')].every(c => c.getAttribute('draggable') === 'false') }));
  ok(bc.cards >= 3 && bc.chk === bc.cards && bc.drag, 'Board in Select: a tick box on every card (no dragging)', bc);
  { const loc = pa.locator('#gc-leads-hub .gcl-card[data-gcl-id="LB_o1"] .t'); const bb = await loc.boundingBox(); await pa.mouse.click(bb.x + 20, bb.y + bb.height / 2); await sleep(300); }
  bt = await bar(A);
  ok(/^1 selected/.test(bt) && !(await drawerOpen(A)) && await A.ev(() => document.querySelector('#gc-leads-hub .gcl-card[data-gcl-id="LB_o1"]').classList.contains('gclb-on')), 'tapping a card ticks it', bt);
  if (SHOTS) await pa.screenshot({ path: SHOTS + '/bulk_board.png' });
  await mclick(pa, '#gclb-bar [data-gclb-a="cancel"]'); await sleep(400);
  ok(await A.ev(() => !window._gcLeadBulk.on() && !document.getElementById('gclb-bar') && !document.querySelector('#gc-leads-hub .gclb-chk')), 'Cancel: Select ends, the tick boxes go');
  ok(!!cl('LB_o1'), '… nothing deleted');
  await mclick(pa, '#gc-leads-hub [data-gcl-v="list"]'); await sleep(500);
  await search(A, '');
  /* the lead panel: Bid only on a bid; the type menu */
  await openLead(A, 'LCC_PRJbulkdemo');
  let di = await drawerInfo(A);
  ok(di && di.kind === 'residential' && /Estimate Sent/.test(di.head) && /CompanyCam/.test(di.head), 'the panel header: "Estimate Sent · 🏠 [Residential ▾] · CompanyCam" — the type is a menu', di);
  ok(di && !di.bid && !di.bidding && !di.notFound && di.plans, 'a residential CompanyCam lead: no ⏰ Bid (no "Due: NOT FOUND"), no 🏢 Bidding to; its plans are under "More"', di);
  if (SHOTS) await pa.screenshot({ path: SHOTS + '/panel_residential.png' });
  await A.ev(() => window._gcLeadsHub.close()); await openLead(A, 'LB_bid');
  const dbid = await drawerInfo(A);
  ok(dbid && dbid.bid && dbid.kind === 'commercial', 'a Lead Inbox / BuildingConnected bid: ⏰ Bid shows', dbid);
  await A.ev(() => window._gcLeadsHub.close()); await openLead(A, 'LCC_PRJbulkdemo');
  await pa.locator('#gcl-drawer select[data-d="kind"]').selectOption('commercial'); await sleep(1500);
  di = await drawerInfo(A);
  ok(di && di.kind === 'commercial' && /🏢/.test(di.head), 'Type → Commercial: the panel shows 🏢 Commercial at once', di && di.head);
  ok(di && !di.bid && !di.bidding, '… still no ⏰ Bid (a CompanyCam lead is not a bid invitation)', di);
  let c1 = null; for (let i = 0; i < 30; i++) { await sleep(500); c1 = cl('LCC_PRJbulkdemo'); if (c1 && c1.leadKind === 'Commercial') break; }
  ok(c1 && c1.leadKind === 'Commercial' && c1.leadKindManual === true && /Wesley/.test(c1.leadKindSetBy || '') && c1.projectType === 'Commercial Reno' && c1.updatedAt > ago(0.1) && (c1.activity || []).some(a => a.type === 'type' && /Residential → Commercial/.test(a.text)), 'saved to the cloud: leadKind Commercial, leadKindManual, who / when, the pipeline type in step, logged', c1 && { k: c1.leadKind, m: c1.leadKindManual, by: c1.leadKindSetBy, pt: c1.projectType, u: c1.updatedAt });
  ok(await A.ev(() => window._gcLeadsUI.kind(window._gcLeadsHubKit.all().find(l => l.id === 'LCC_PRJbulkdemo')) !== 'res'), 'the list counts it as commercial now (not under 🏠 Residential)');
  await A.ev(() => window._gcLeadsHub.close());
  /* an older copy comes back from the cloud: the person's choice stays */
  const older = cloudLeads().map(l => l.id === 'LCC_PRJbulkdemo' ? Object.assign({}, MINE.find(x => x.id === 'LCC_PRJbulkdemo')) : l);
  pushOld(older, 'old-computer-2'); await sleep(8000);
  const k2 = await A.ev(() => (window._gcLeadsHubKit.all().find(l => l.id === 'LCC_PRJbulkdemo') || {}).leadKind);
  ok(k2 === 'Commercial', 'an older copy (residential) from the cloud does not flip it back', k2);
  /* reload */
  await pa.reload(); await sleep(9000); await toLeads(A);
  ok(!(await has(A, 'LB_a1')) && !(await has(A, 'LB_a2')) && !(await has(A, 'LB_a3')) && (await has(A, 'LB_job')), 'after a reload: the 3 stay deleted, the job-linked lead is there');
  await openLead(A, 'LCC_PRJbulkdemo');
  di = await drawerInfo(A);
  ok(di && di.kind === 'commercial' && !di.bid, 'after a reload: still Commercial (and no Bid section)', di);
  await A.ev(() => window._gcLeadsHub.close());
  await sleep(4000);
  c1 = cl('LCC_PRJbulkdemo');
  ok(c1 && c1.leadKind === 'Commercial' && c1.leadKindManual === true, 'the cloud still has Commercial', c1 && c1.leadKind);
  ok(errsOf(A).length === 0, 'A: no page errors', errsOf(A).slice(0, 4));
  await A.ctx.close().catch(() => {});

  /* ── B: the office ── */
  const B = await computer('B', { build }); await prep(B);
  await signIn(B, 'office@grayco-cs.com', 12000);
  const pb = await toLeads(B);
  ok(await B.ev(() => !!document.querySelector('#gc-leads-hub [data-gclb-sel]') && window._gcLeadBulk.allowed()), 'office: "☐ Select" is there');
  await search(B, 'Bulk Office');
  await mclick(pb, '#gc-leads-hub [data-gclb-sel]'); await sleep(500);
  await mclick(pb, '#gc-leads-hub [data-gclb-all]'); await sleep(300);
  bt = await bar(B);
  ok(/^3 selected/.test(bt) && JSON.stringify((await B.ev(() => window._gcLeadBulk.selected())).sort()) === JSON.stringify(['LB_o1', 'LB_o2', 'LB_o3']), 'office: "Select all shown" ticks the 3 shown', bt);
  await mclick(pb, '#gclb-bar [data-gclb-a="del"]'); await sleep(400);
  ok(/Delete 3 leads\?/.test(await B.ev(() => (document.getElementById('gcl-delq') || {}).innerText || '')), 'office: the delete asks');
  await mclick(pb, '#gcl-delq [data-a="delete"]'); await sleep(800);
  gone = false; for (let i = 0; i < 40 && !gone; i++) { await sleep(500); gone = ['LB_o1', 'LB_o2', 'LB_o3'].every(id => tomb(id) && !cl(id)); }
  ok(gone && !(await rows(B)).some(id => /^LB_o/.test(id)), 'office: the 3 are deleted (screen, delete list, cloud)');
  /* the delete's own Undo brings them back on the screen and in the cloud; then deleted again */
  await mclick(pb, '#gcx-ldel-toast [data-a="undo"]');
  let back = false; for (let i = 0; i < 70 && !back; i++) { await sleep(500); back = ['LB_o1', 'LB_o2', 'LB_o3'].every(id => !!cl(id)); if (back) back = (await rows(B)).filter(id => /^LB_o/.test(id)).length === 3; }
  ok(back, 'office: Undo (the CRM\'s own) brings the 3 back — on the screen and in the cloud', { rows: await rows(B), cloud: ['LB_o1', 'LB_o2', 'LB_o3'].map(id => [id, !!cl(id), tomb(id)]), rec: (parse(cget('gc_leads_deleted')) || { leads: {} }).leads.LB_o1 && { d: parse(cget('gc_leads_deleted')).leads.LB_o1.deletedAt, r: parse(cget('gc_leads_deleted')).leads.LB_o1.restoredAt } });
  await sleep(6000); const still = (await rows(B)).filter(id => /^LB_o/.test(id)).length === 3 && ['LB_o1', 'LB_o2', 'LB_o3'].every(id => !!cl(id));
  ok(still, 'office: … and they stay back (the CRM\'s "brought back" note; nothing removes them again)');
  await B.ev(() => { window._gcLeadBulk.start(); window._gcLeadBulk.select(['LB_o1', 'LB_o2', 'LB_o3']); }); await sleep(300);
  await mclick(pb, '#gclb-bar [data-gclb-a="del"]'); await sleep(400); await mclick(pb, '#gcl-delq [data-a="delete"]');
  gone = false; for (let i = 0; i < 40 && !gone; i++) { await sleep(500); gone = ['LB_o1', 'LB_o2', 'LB_o3'].every(id => tomb(id) && !cl(id)); }
  ok(gone && !(await rows(B)).some(id => /^LB_o/.test(id)), 'office: deleted again');
  ok(errsOf(B).length === 0, 'B: no page errors', errsOf(B).slice(0, 4));
  await B.ctx.close().catch(() => {});

  /* ── C: a PM ── */
  const C = await computer('C', { build }); await prep(C);
  await signIn(C, 'sbiffle@grayco-cs.com', 12000);
  const pc = await toLeads(C);
  await search(C, 'Bulk PM');
  await mclick(pc, '#gc-leads-hub [data-gclb-sel]'); await sleep(500);
  const cs = await C.ev(() => ({ own: !!document.querySelector('#gc-leads-hub tr[data-gcl-id="LB_p1"] .gclb-chk'), other: !!document.querySelector('#gc-leads-hub tr[data-gcl-id="LB_px"] .gclb-chk'), lock: !!document.querySelector('#gc-leads-hub tr[data-gcl-id="LB_px"] .gclb-no'), rows: [...document.querySelectorAll('#gc-leads-hub tr.gcl-lr')].map(r => r.getAttribute('data-gcl-id')) }));
  ok(cs.own && !cs.other && cs.lock, 'PM: a tick box on his own lead, 🔒 (none) on another PM\'s lead he can see', cs);
  await mclick(pc, '#gc-leads-hub [data-gclb-all]'); await sleep(300);
  ok(!(await C.ev(() => window._gcLeadBulk.selected())).includes('LB_px'), 'PM: "Select all shown" leaves another PM\'s lead out');
  const rx = await C.ev(() => window._gcLeadBulk.del(['LB_px']));
  await sleep(1500);
  ok(rx && !rx.deleted && !!cl('LB_px') && !tomb('LB_px'), 'PM: cannot delete another PM\'s lead (even asked directly)', rx);
  await C.ev(() => { window._gcLeadBulk.stop(); window._gcLeadBulk.start(); window._gcLeadBulk.select(['LB_p1']); });
  await sleep(300);
  await mclick(pc, '#gclb-bar [data-gclb-a="del"]'); await sleep(400);
  await mclick(pc, '#gcl-delq [data-a="delete"]'); await sleep(800);
  gone = false; for (let i = 0; i < 40 && !gone; i++) { await sleep(500); gone = tomb('LB_p1') && !cl('LB_p1'); }
  ok(gone && !!cl('LB_p2') && !!cl('LB_px'), 'PM: deletes his own lead (only that one)');
  ok(errsOf(C).length === 0, 'C: no page errors', errsOf(C).slice(0, 4));
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
await shared.close().catch(() => {});
process.exit(fail ? 1 : 0);
