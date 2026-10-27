// test_BIDROLE.mjs <build-dir> — patch PRIMESUB: 🏛 PRIME (we bid to the owner) / 🔧 SUB (we bid to a GC) on every bid.
//   Part 1 (no browser): the one rule (_lib/bid-role.js) on made-up senders / subjects / sources, the copy inlined in
//   index.html is the same file word for word and answers the same, and the Lead Inbox stores it on a new bid (upsert).
//   Part 2 (offline harness, made-up demo data, admin): the badges on the Leads board / list / Bids tab, the Prime & sub
//   filter with counts, a tap on the badge saves that one lead, no other lead is re-saved, nothing errors.
//   GC_NO_BROWSER=1 runs part 1 only.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
const require = createRequire(import.meta.url);
const build = process.argv[2];
if (!build) { console.error('usage: node test_BIDROLE.mjs <dir with index.html and netlify/functions>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };

/* ── part 1: the rule ── */
const LIB = path.join(build, 'netlify/functions/_lib/bid-role.js');
const BR = require(LIB);
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const m = /\/\* PRIMESUB-CORE-BEGIN \*\/\n([\s\S]*?)\/\* PRIMESUB-CORE-END \*\//.exec(html);
ok(!!m && m[1] === fs.readFileSync(LIB, 'utf8'), 'the page carries _lib/bid-role.js word for word');
const box = { window: {} }; box.window.window = box.window; vm.createContext(box);
vm.runInContext('(function(){' + (m ? m[1] : '') + '}).call(window)', box);
const PAGE = box.window._gcBidRoleCore;
ok(!!PAGE && typeof PAGE.roleOf === 'function', 'window._gcBidRoleCore on the page');

const ml = (from, fromName, subject) => [{ from, fromName, subject, date: '2026-10-20T15:00:00Z' }];
const CASES = [
  // prime: public owners
  ['City of Memphis bid (public bid watcher)', { source: 'City of Memphis', origin: 'watch', type: 'government', title: 'Fire Station 12 Reroof' }, 'prime'],
  ['City of Memphis e-mail from memphistn.gov', { source: 'Other', type: 'commercial', emails: ml('purchasing@memphistn.gov', 'City of Memphis Purchasing', 'RFQ 51234 Roof Repairs') }, 'prime'],
  ['Shelby County Schools from scsk12.org', { source: 'Other', emails: ml('procurement@scsk12.org', 'Procurement Services', 'ITB 26-114 Gym Floor Replacement') }, 'prime'],
  ['Memphis-Shelby County Schools via Ion Wave', { source: 'Other', emails: ml('noreply@ionwave.net', 'MSCS e-Bid', 'New bid posted: Window Replacement') }, 'prime'],
  ['Bartlett City Schools (watcher)', { source: 'Bartlett City Schools', origin: 'watch', type: 'government' }, 'prime'],
  ['Bartlett City Schools e-mail (k12)', { source: 'Other', emails: ml('purchasing@bartlett.k12.tn.us', 'Bartlett City Schools', 'Request for Bids - HVAC') }, 'prime'],
  ['University of Memphis (memphis.edu)', { source: 'Other', emails: ml('bids@memphis.edu', 'University of Memphis Procurement', 'Invitation to Bid: Library Roof') }, 'prime'],
  ['MLGW (mlgw.org)', { source: 'Other', emails: ml('bidnotify@mlgw.org', 'MLGW Contracted Services', 'Bid notification 5100-123') }, 'prime'],
  ['MLGW as the source', { source: 'MLGW', type: 'commercial' }, 'prime'],
  ['MSCAA airport', { source: 'Memphis Airport (MSCAA)', origin: 'watch', type: 'government' }, 'prime'],
  ['SAM.gov (federal)', { source: 'SAM.gov (federal)', origin: 'watch', type: 'government', sourceKind: 'public_bid' }, 'prime'],
  ['State of TN STREAM', { source: 'State of TN (STREAM)', origin: 'watch', type: 'government' }, 'prime'],
  ['Shelby County (source Government)', { source: 'Government', type: 'government', owner: 'Shelby County Government' }, 'prime'],
  ['DeSoto County via Central Bidding', { source: 'Other', emails: ml('notices@centralbidding.com', 'Central Bidding', 'DeSoto County: Courthouse Annex Repairs') }, 'prime'],
  ['owner is a public body, no GC', { source: 'Other', type: 'commercial', owner: 'Town of Collierville', dueToCompany: 'Town of Collierville' }, 'prime'],
  ['bid due to the housing authority', { source: 'Other', type: 'commercial', dueToCompany: 'Memphis Housing Authority' }, 'prime'],
  ['public-bid notice (AI kind)', { source: 'Other', sourceKind: 'public_bid' }, 'prime'],
  ['plans on a public site only', { source: 'Other', plansLinks: [{ url: 'https://www.shelbycountytn.gov/bids/123', board: 'Government' }] }, 'prime'],
  ['a government lead with nothing else', { source: 'Other', leadKind: 'Government' }, 'prime'],
  // sub: plan rooms and GCs
  ['BuildingConnected invite from a GC', { source: 'BuildingConnected', type: 'commercial', gc: 'Sample Builders LLC', emails: ml('no-reply@buildingconnected.com', 'Sample Builders via BuildingConnected', 'Invitation to Bid: Clinic Renovation') }, 'sub'],
  ['BuildingConnected API', { source: 'BuildingConnected', origin: 'api', type: 'commercial' }, 'sub'],
  ['BuildingConnected even when the owner is a school', { source: 'BuildingConnected', leadKind: 'Government', owner: 'Shelby County Schools' }, 'sub'],
  ['PlanHub', { source: 'PlanHub', leadKind: 'Commercial' }, 'sub'],
  ['PlanHub e-mail with source Other', { source: 'Other', emails: ml('projects@planhub.com', 'PlanHub', 'New project in your area') }, 'sub'],
  ['A&B Planroom', { source: 'A&B Planroom', type: 'commercial' }, 'sub'],
  ['A&B Planroom by its address', { source: 'Other', emails: ml('noreply@aandbplanroom.com', 'A&B Planroom', 'Bid invite') }, 'sub'],
  ['RKA Planroom', { source: 'RKA Planroom', type: 'commercial' }, 'sub'],
  ['iSqFt / ConstructConnect', { source: 'iSqFt / ConstructConnect', type: 'commercial' }, 'sub'],
  ['Dodge', { source: 'Other', emails: ml('alerts@construction.com', 'Dodge Construction Network', 'Project lead') }, 'sub'],
  ['GC direct (bid inbox source)', { source: 'GC direct', type: 'commercial' }, 'sub'],
  ['Bid invitation (GC direct) (Leads source list)', { source: 'Bid invitation (GC direct)', leadKind: 'Commercial' }, 'sub'],
  ['a GC e-mail "invitation to bid"', { source: 'Other', type: 'commercial', emails: ml('estimating@samplebuilders.com', 'Sample Builders Estimating', 'Invitation to Bid - Collierville Office Building') }, 'sub'],
  ['a GC e-mail, construction in the domain', { source: 'Other', emails: ml('bids@demoxconstruction.com', 'Jane Doe', 'ITB: Warehouse Expansion') }, 'sub'],
  ['a GC named on the lead', { source: 'Other', leadKind: 'Commercial', gc: 'Demo General Contractors Inc', owner: 'City of Germantown' }, 'sub'],
  ['bid due to a contractor', { source: 'Other', dueToCompany: 'Example Construction Co.' }, 'sub'],
  ['plan room notice (AI kind)', { source: 'Other', sourceKind: 'planroom_notice' }, 'sub'],
  ['plans only on BuildingConnected', { source: 'Other', plansLinks: [{ url: 'https://app.buildingconnected.com/opportunities/1', board: 'BuildingConnected' }] }, 'sub'],
  ['a contractor named "County Line Builders" is not a county', { source: 'Other', dueToCompany: 'County Line Builders LLC' }, 'sub'],
  // no badge
  ['a homeowner (website)', { source: 'Website', type: 'residential', websiteLead: true, emails: ml('owner@example.com', 'Sample Homeowner', 'Kitchen remodel') }, ''],
  ['a homeowner (Residential lead)', { source: 'Referral', type: 'Residential' }, ''],
  ['an insurance claim', { source: 'Contractor Connection', type: 'insurance', isInsurance: true, claimNumber: 'CLM-0001' }, ''],
  ['an insurance claim from a .gov adjuster address', { source: 'Other', type: 'insurance', emails: ml('adjuster@state.tn.us', 'State Adjuster', 'Claim 123') }, ''],
  ['water mitigation', { source: 'Phone call', leadKind: 'Mitigation' }, ''],
  ['commercial, nothing known', { source: 'Other', leadKind: 'Commercial' }, ''],
  ['commercial from gmail, "please quote"', { source: 'Other', type: 'commercial', emails: ml('someone@gmail.com', 'Sample Person', 'Please quote our roof') }, ''],
  ['our own forwarded e-mail only', { source: 'Other', emails: ml('wjohnson@grayco-cs.com', 'Demo Owner', 'Fwd: bid') }, ''],
  ['RoofScout', { source: 'RoofScout', type: 'Roofing' }, ''],
  ['empty', {}, ''],
  // a person's choice
  ['a person marked it sub', { source: 'City of Memphis', origin: 'watch', bidRole: 'sub', bidRoleManual: true, bidRoleBy: 'Demo Owner' }, 'sub'],
  ['a person marked it "no badge"', { source: 'PlanHub', bidRole: 'none', bidRoleManual: true }, ''],
  ['a stored non-manual value is not a person\'s choice (the rule decides)', { source: 'PlanHub', bidRole: 'prime' }, 'sub']
];
console.log('the rule (' + CASES.length + ' made-up leads)');
CASES.forEach(([name, x, want]) => {
  const r = BR.roleOf(x), p = PAGE ? PAGE.roleOf(x) : {};
  ok(r.role === want && p.role === want && r.why === p.why, (want || 'none').padEnd(5) + ' ' + name + '  [' + r.why + ']', { got: r, page: p });
});

/* the Lead Inbox stores it when a bid comes in (bid-inbox upsert: e-mail, the public bid watcher, BuildingConnected) */
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test' });
const L = require(path.join(build, 'netlify/functions/bid-inbox.js'))._lib;
let o = L.upsert([], { id: 'LI-t1', title: 'Demo Gym Roof', source: 'Bartlett City Schools', origin: 'watch', type: 'government', sourceKind: 'public_bid', emails: [], plansLinks: [] });
let it = o.items.find(x => x.id === 'LI-t1');
ok(o.action === 'added' && it.bidRole === 'prime' && /public/.test(it.bidRoleWhy), 'a new public bid is stored as prime', it);
o = L.upsert([], { id: 'LI-t2', title: 'Demo Clinic', source: 'PlanHub', type: 'commercial', sourceKind: 'invitation', emails: [], plansLinks: [] });
ok(o.items.find(x => x.id === 'LI-t2').bidRole === 'sub', 'a new PlanHub bid is stored as sub');
o = L.upsert([], { id: 'LI-t3', title: 'Water in basement', source: 'Other', type: 'insurance', emails: [], plansLinks: [] });
ok(!('bidRole' in o.items.find(x => x.id === 'LI-t3')), 'an insurance item gets no bidRole');
const old = { id: 'LI-t4', title: 'Demo Library Reroof', source: 'City of Memphis', origin: 'watch', type: 'government', status: 'new', rev: 3, receivedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', sources: [{ name: 'City of Memphis' }], emails: [], plansLinks: [], files: [], emailIds: [], watchKeys: ['w:x:1'], trades: [], notes: [], alsoOn: [] };
o = L.upsert([Object.assign({}, old)], Object.assign({}, old, { id: 'LI-t4' }));
it = o.items.find(x => x.id === 'LI-t4');
ok(it.bidRole === 'prime' && it.rev === 3 && o.action === 'same', 'an older item seen again gets it quietly (no new revision, no re-draft)', { action: o.action, rev: it.rev, role: it.bidRole });

/* ── part 2: the page ── */
if (process.env.GC_NO_BROWSER) { console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); }
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, cset, cget, signIn, mclick } = await import(pathToFileURL(HARNESS).href);
const { seedDemo } = await import(pathToFileURL(process.env.GC_DEMO_SEED || SP + '/wDEMO/seed.mjs').href);
seedDemo();
const ago = h => new Date(Date.now() - h * 3600e3).toISOString(), inDays = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const LD = (id, o) => Object.assign({ id, name: id, stage: 'New Lead', status: 'new', createdAt: ago(30), updatedAt: ago(30) }, o);
cset('leads', [
  LD('L_city', { name: 'Demo Fire Station Reroof', source: 'City of Memphis', origin: 'watch', leadKind: 'Government', inboxId: 'LI-city', inboxRev: 1, bidDue: inDays(9) }),
  LD('L_school', { name: 'Demo Gym Floor', source: 'Bartlett City Schools', origin: 'watch', leadKind: 'Government', inboxId: 'LI-school', inboxRev: 1, bidDue: inDays(12) }),
  LD('L_bc', { name: 'Demo Office Build-out', source: 'BuildingConnected', leadKind: 'Commercial', gc: 'Sample Builders LLC', inboxId: 'LI-bc', inboxRev: 1, bidDue: inDays(6) }),
  LD('L_ph', { name: 'Demo Clinic Roof', source: 'PlanHub', leadKind: 'Commercial', inboxId: 'LI-ph', inboxRev: 1, bidDue: inDays(7) }),
  LD('L_unk', { name: 'Demo Warehouse Bid', source: 'Other', leadKind: 'Commercial', inboxId: 'LI-unk', inboxRev: 1, bidDue: inDays(10) }),
  LD('L_res', { name: 'Demo Kitchen Remodel Lead', source: 'Website', type: 'Residential', websiteLead: true, phone: '901-555-0190' }),
  LD('L_ins', { name: 'Demo Water Loss Lead', source: 'Phone call', type: 'Insurance', isInsurance: true, phone: '901-555-0191' })
]);
const ITEMS = [{ id: 'LI-new', status: 'new', title: 'Demo Parking Deck Repairs', type: 'commercial', source: 'A&B Planroom', origin: 'email', bidRole: 'sub', bidRoleWhy: 'came from A&B Planroom (a plan room / GC)', bidDue: inDays(14), receivedAt: ago(1), rev: 1, emails: [], plansLinks: [], files: [] }];
const lead = id => { let v = cget('leads'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return (Array.isArray(v) ? v : []).find(l => l && l.id === id) || null; };
const c = await computer('BR', { build });
await c.ctx.route(/\/\.netlify\/functions\/bid-inbox/, r => r.request().method() === 'POST' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: ITEMS, settings: {}, notices: [] }) }));
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 12000);
  const p = c.page();
  await p.evaluate(() => window._setView && window._setView('leads'));
  const up = await waitFor(c, () => document.querySelectorAll('#gc-leads-hub .gcl-card').length >= 5 && !!window._gcPrimeSub, null, 60000);
  ok(!!up, 'Leads board drawn with the demo leads');
  const badges = () => p.evaluate(() => { const o = {}; document.querySelectorAll('#gc-leads-hub .gcl-card').forEach(c => { const b = c.querySelector('.gc-role'); o[c.getAttribute('data-gcl-id')] = b ? b.className.replace('gc-role ', '') + '|' + b.textContent : ''; }); return o; });
  let B = await badges();
  ok(/gc-role-prime\|🏛 PRIME/.test(B.L_city) && /gc-role-prime/.test(B.L_school), 'city and school bids: 🏛 PRIME', B);
  ok(/gc-role-sub\|🔧 SUB/.test(B.L_bc) && /gc-role-sub/.test(B.L_ph), 'BuildingConnected and PlanHub bids: 🔧 SUB', B);
  ok(B.L_res === '' && B.L_ins === '', 'homeowner and insurance leads: no badge', B);
  ok(/gc-role-unset/.test(B.L_unk), 'a bid nobody can place: no prime / sub, only a "＋ Prime / Sub" chip for the admin', B);
  const opts = await p.evaluate(() => Array.from(document.querySelectorAll('#gc-leads-hub select[data-gcl-f="role"] option')).map(o => o.value + '=' + o.textContent));
  ok(opts.length === 4 && /prime=.*\(2\)/.test(opts[1]) && /sub=.*\(2\)/.test(opts[2]) && /unset=.*\(1\)/.test(opts[3]), 'the Prime & sub filter, with counts, next to Source / Type', opts);
  const srcAt = await p.evaluate(() => { const s = Array.from(document.querySelectorAll('#gc-leads-hub .gcl-fil select')).map(x => x.getAttribute('data-gcl-f')); return s.indexOf('role') - s.indexOf('type'); });
  ok(srcAt === 1, 'it sits right after the Type filter');
  await p.selectOption('#gc-leads-hub select[data-gcl-f="role"]', 'prime'); await sleep(800);
  let ids = await p.evaluate(() => Array.from(document.querySelectorAll('#gc-leads-hub .gcl-card')).map(c => c.getAttribute('data-gcl-id')).sort());
  ok(JSON.stringify(ids) === '["L_city","L_school"]', 'Prime: only the city and school bids', ids);
  await p.selectOption('#gc-leads-hub select[data-gcl-f="role"]', 'sub'); await sleep(800);
  ids = await p.evaluate(() => Array.from(document.querySelectorAll('#gc-leads-hub .gcl-card')).map(c => c.getAttribute('data-gcl-id')).sort());
  ok(ids.includes('L_bc') && ids.includes('L_ph') && !ids.includes('L_city') && !ids.includes('L_res'), 'Sub: the plan room bids', ids);
  await p.selectOption('#gc-leads-hub select[data-gcl-f="role"]', ''); await sleep(800);
  /* the list view */
  await mclick(p, '#gc-leads-hub [data-gcl-v="list"]'); await sleep(800);
  const rows = await p.evaluate(() => { const o = {}; document.querySelectorAll('#gc-leads-hub tr[data-gcl-id]').forEach(r => { const b = r.querySelector('.gc-role'); o[r.getAttribute('data-gcl-id')] = b ? b.textContent : ''; }); return o; });
  ok(rows.L_city === '🏛 PRIME' && rows.L_bc === '🔧 SUB' && rows.L_res === '', 'List rows show the badge too', rows);
  await mclick(p, '#gc-leads-hub [data-gcl-v="board"]'); await sleep(800);
  /* remembered: a redraw reads the memo, it does not work it out again */
  const memo0 = await p.evaluate(() => window._gcPrimeSub._memo());
  await p.evaluate(() => { for (let i = 0; i < 5; i++) window._gcLeadsHub.redraw(); });
  const memo1 = await p.evaluate(() => window._gcPrimeSub._memo());
  ok(memo1 === memo0, 'five redraws: nothing worked out again (memo per lead id + updatedAt)', { memo0, memo1 });
  /* tap the badge: Prime / Sub / No badge / Automatic, saved on that one lead */
  const t0 = Date.now();
  await mclick(p, '#gc-leads-hub .gcl-card[data-gcl-id="L_unk"] .gc-role');
  const menu = await waitFor(c, () => { const m = document.getElementById('gc-role-menu'); return m && m.getBoundingClientRect().width > 0 ? Array.from(m.querySelectorAll('button')).map(b => b.textContent) : null; }, null, 5000);
  ok(Array.isArray(menu) && menu.length === 4 && /Prime/.test(menu[0]) && /Sub/.test(menu[1]), 'a tap on the badge opens Prime / Sub / No badge / Automatic', menu);
  ok(await p.evaluate(() => !document.getElementById('gcl-drawer') || document.getElementById('gcl-drawer').offsetParent === null || window._gcLeadsHub.ui().open !== 'L_unk'), '…and does not open the lead');
  await mclick(p, '#gc-role-menu [data-r="prime"]');
  let saved = null; for (let i = 0; i < 40 && !saved; i++) { await sleep(500); const l = lead('L_unk'); if (l && l.bidRole === 'prime' && l.bidRoleManual) saved = l; }
  ok(!!saved && saved.bidRoleBy && /Prime/.test(JSON.stringify(saved.activity || [])), 'saved on the lead in the cloud: bidRole prime, by whom, in its activity', saved && { r: saved.bidRole, by: saved.bidRoleBy });
  B = await badges(); ok(/gc-role-prime/.test(B.L_unk), 'the card now shows 🏛 PRIME', B.L_unk);
  /* the server's value comes in with a new bid */
  const nl = await waitFor(c, () => { const L = (window._crm && window._crm.leads) || []; const x = window._gcLeadsHubKit.all().find(l => l && l.inboxId === 'LI-new'); return x ? { role: x.bidRole, show: window._gcPrimeSub.of(x) } : null; }, null, 100000, 1000);
  ok(nl && nl.role === 'sub' && nl.show === 'sub', 'a new bid from the Lead Inbox carries the server\'s 🔧 SUB', nl);
  /* no mass re-save: the other leads in the cloud have no bidRole written on them */
  const others = ['L_city', 'L_school', 'L_bc', 'L_ph', 'L_res', 'L_ins'].map(lead).filter(l => l && 'bidRole' in l).map(l => l.id);
  ok(others.length === 0, 'worked out on screen: no other lead was re-saved with a bidRole', others);
  /* the Bids tab (Lead Inbox cards) */
  await mclick(p, '#gc-leads-tabs [data-gc-tab="bidboard"]');
  const ib = await waitFor(c, () => { const r = document.getElementById('gc-ldi'); if (!r || r.offsetParent === null) return null; const sel = r.querySelector('select[data-f="show"]'); if (sel && sel.value !== 'open') { sel.value = 'open'; sel.dispatchEvent(new Event('change', { bubbles: true })); return null; } const o = {}; r.querySelectorAll('.card[data-id]').forEach(c => { const b = c.querySelector('.gc-role'); o[c.getAttribute('data-id')] = b ? b.textContent : ''; }); return Object.keys(o).length >= 4 ? o : null; }, null, 30000, 500);
  ok(ib && ib.L_city === '🏛 PRIME' && ib.L_bc === '🔧 SUB' && ib.L_unk === '🏛 PRIME', 'Bids tab cards show the badge', ib);
  const io = await p.evaluate(() => Array.from(document.querySelectorAll('#gc-ldi select[data-f="role"] option')).map(o => o.value + '=' + o.textContent));
  ok(io.length === 4 && /prime=.*\(3\)/.test(io[1]), 'Bids tab: the Prime & sub filter with counts', io);
  await p.selectOption('#gc-ldi select[data-f="role"]', 'sub'); await sleep(800);
  const iv = await p.evaluate(() => Array.from(document.querySelectorAll('#gc-ldi .card[data-id]')).map(c => c.getAttribute('data-id')).sort());
  ok(iv.length >= 2 && iv.every(id => /^(L_bc|L_ph)$/.test(id) || /LI-new|new/i.test(id)), 'Bids tab, Sub: only the plan room bids', iv);
  await p.selectOption('#gc-ldi select[data-f="role"]', '');
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
  console.log('  (' + Math.round((Date.now() - t0) / 1000) + ' s after the tap)');
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
