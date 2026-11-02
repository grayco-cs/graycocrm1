// probe_BIDMERGE.mjs <build-dir> — patch BIDMERGE in the real page (offline harness, made-up leads, the owner = admin):
//   * Lead Inbox: the project's one row reads "UrgentVet - Memphis · 2 GCs · 9 trades"; its detail panel lists both GCs with
//     their trades, due dates, contacts and links;
//   * Leads → ⋯ More → "🔗 Merge duplicate bid leads (1)" → the dry run (1 group of 3 leads, nothing changed yet) → Merge
//     selected → the confirm → Yes: one lead (both GCs), the 2 copies in 🗑 Recently deleted, the inbox told; ↩ Undo puts all
//     back; a phone-width look at the dry run (no sideways scroll); no page errors.
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs). Browser tests: one at a time.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset, cget } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2]; if (!build) { console.error('usage: node probe_BIDMERGE.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.GC_SHOTS || '';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });

resetCloud();
const now = Date.now(), ago = h => new Date(now - h * 3600e3).toISOString(), inD = (d, hm) => new Date(now + d * 864e5).toISOString().slice(0, 10) + 'T' + (hm || '12:00');
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u4', name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', profile: 'estimator', active: true }]);
cset('projects', []);
const base = { stage: 'New Lead', status: 'new', leadKind: 'Commercial', type: 'Commercial Reno', city: 'Memphis', state: 'TN', inboxState: 'new', origin: 'email', bidRole: 'sub' };
const GCS = [{ key: 'loberg', name: 'Loberg Construction', contact: 'Dana Whitfield', email: 'estimating@lobergconstruction.com', phone: '(847) 392-4300', due: inD(2), trades: ['Acoustical Ceilings', 'Drywall & Framing', 'Painting', 'Membrane Roofing', 'Doors, Frames & Hardware'], packages: ['Bid Package 08'], link: 'https://app.buildingconnected.com/opportunities/64f0a1b2c3d4e5f6a7b8c9d0/info', source: 'BuildingConnected', at: ago(30) },
  { key: 'brasfield and gorrie', name: 'Brasfield & Gorrie, LLC', contact: 'Marcus Hale', email: 'mhale@brasfieldgorrie.com', phone: '(901) 555-0142', due: inD(3, '14:00'), trades: ['Flooring', 'Toilet Accessories', 'Signage', 'Storefront & Glazing', 'Acoustical Ceilings'], packages: [], link: 'https://app.planhub.com/project/details/5d1b2c3a-7e44', source: 'PlanHub', at: ago(20) }];
const L = (id, o) => Object.assign({ id, inboxId: 'LI-' + id.replace(/^LEADIN-/, ''), inboxRev: 1, createdAt: ago(10), inboxAt: ago(10), updatedAt: ago(10) }, base, o);
const SEED = [
  L('LEADIN-one1', { name: 'UrgentVet - Memphis', source: 'BuildingConnected', address: '8050 Dexter Road, Suite 103, Memphis, TN 38016', bidDue: inD(2), dueToCompany: 'Loberg Construction', gcs: GCS, trades: GCS[0].trades.concat(GCS[1].trades.slice(0, 4)), createdAt: ago(30), inboxAt: ago(30),
    activity: [{ type: 'bidmerge', at: ago(20), by: 'Lead Inbox', text: '+1 GC: Brasfield & Gorrie, LLC (Flooring)' }] }),
  L('LEADIN-dup1', { name: 'Rothys - Nashville, TN: Drywall & Framing', source: 'BuildingConnected', city: 'Nashville', address: '2126 Abbott Martin Road, Space E211, Nashville, TN 37215', bidDue: inD(4), dueToCompany: 'Elder-Jones, Inc.', trades: ['Drywall & Framing'], estimator: 'Glenn Miller', createdAt: ago(48), inboxAt: ago(48) }),
  L('LEADIN-dup2', { name: 'Rothys - Nashville, TN: Painting', source: 'BuildingConnected', city: 'Nashville', address: '2126 Abbott Martin Rd, Nashville, TN', bidDue: inD(4), dueToCompany: 'Elder-Jones, Inc.', trades: ['Painting'], createdAt: ago(40), inboxAt: ago(40) }),
  L('LEADIN-dup3', { name: 'Rothys Nashville', source: 'PlanHub', city: 'Nashville', address: 'Nashville, TN 37215', bidDue: inD(5, '10:00'), dueToCompany: 'Hoar Construction', dueToContact: 'Kim Lee', trades: ['Acoustical Ceilings'], createdAt: ago(30), inboxAt: ago(30) }),
  L('LEADIN-oth1', { name: 'Equipment Share-Little Rock - OPEN SHOP', source: 'BuildingConnected', city: 'Little Rock', address: '7620 Fluid Drive, Little Rock, AR 72206', bidDue: inD(4, '16:00'), dueToCompany: 'Elder-Jones, Inc.', trades: ['Drywall & Framing'] })
];
cset('leads', SEED);
const ACTS = [];
/* the inbox items as the server keeps them (static, rev 1 = the leads' inboxRev): the Lead Inbox has nothing to re-import while the probe works */
const ITEMS = SEED.map(l => ({ id: l.inboxId, status: 'imported', rev: 1, title: l.name, leadId: l.id, receivedAt: l.inboxAt, source: l.source, type: 'commercial', city: l.city, state: l.state, bidDue: l.bidDue,
  dueToCompany: l.dueToCompany, trades: l.trades, gcs: l.gcs, history: l.id === 'LEADIN-one1' ? [{ at: ago(20), type: 'bidmerge', text: '+1 GC: Brasfield & Gorrie, LLC (Flooring)' }] : undefined, portal: { state: 'draft', jobId: 'BJ-' + l.id } }));
const items = () => ITEMS;
async function route(c){
  await c.ctx.route(/\/\.netlify\/functions\/bid-inbox/, async r => {
    const m = r.request().method();
    if (m === 'POST') { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {} ACTS.push(b); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: items(), settings: {}, notices: [], portal: { ready: true }, me: { email: 'wjohnson@grayco-cs.com', admin: true }, at: new Date().toISOString() }) });
  });
  await c.ctx.addInitScript(() => { try { localStorage.setItem('gc_ldi_ui_v1', JSON.stringify({ show: 'open', open: true })); } catch (e) {} window.__ERR = []; window.addEventListener('error', e => window.__ERR.push(String(e.message))); });
}
const email = 'wjohnson@grayco-cs.com';
async function boot(c){
  const p = c.page(); p.on('pageerror', e => { (c.__perr = c.__perr || []).push(String(e.message)); });
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
  await waitFor(c, () => window._gcLeadInbox && (window._gcLeadInbox._test.peek('_setLeads') || []).length >= 5, null, 150000, 500);
  await sleep(5000);
}
const leadsNow = p => p.evaluate(() => (window._gcLeadsHub.kit.all() || []).map(l => ({ id: l.id, gcs: (l.gcs || []).length, name: l.name, trades: (l.trades || []).length })).sort((a, b) => a.id < b.id ? -1 : 1));
const fullNow = p => p.evaluate(() => JSON.parse(JSON.stringify((window._gcLeadsHub.kit.all() || []).filter(l => /^LEADIN-/.test(l.id)))));
/* the list read twice 2 s apart, the same both times (background syncs settled) */
async function stable(p){ let a = JSON.stringify(await fullNow(p)); for (let i = 0; i < 10; i++) { await sleep(2000); const b = JSON.stringify(await fullNow(p)); if (a === b) return JSON.parse(b); a = b; } return JSON.parse(a); }
/* the fields a merge writes (an assignment the Leads screen makes by itself in the background is not one of them) */
const WATCH = {}; ('name title nameWas gcs trades docs files plansLinks emails contacts coAssignees stageHistory matchNotes sources alsoOn address city state zip gc owner bidNumber dueToCompany dueToContact dueToEmail '
  + 'dueToPhone submitMethod submitWhere contactName phone email scope preBid rawEmailRef estVal estValue notes note bidDue bidDueWas receivedAt activity mergedFrom bidMerge archived mergedInto stage').split(' ').forEach(k => { WATCH[k] = 1; });
const SKIP = new Proxy({}, { get: (o, k) => !WATCH[k] });
const blank = v => v == null || v === '' || v === false || v === 0 || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
function diff(A, B){ const out = []; const by = {}; B.forEach(l => { by[l.id] = l; });
  A.forEach(a => { const b = by[a.id]; if (!b) { out.push(a.id + ': missing'); return; }
    Object.keys(Object.assign({}, a, b)).forEach(k => { if (SKIP[k]) return; const x = a[k], y = b[k]; if (blank(x) && blank(y)) return; if (JSON.stringify(x) !== JSON.stringify(y)) out.push(a.id + '.' + k + ': ' + JSON.stringify(x).slice(0, 80) + ' → ' + JSON.stringify(y).slice(0, 80)); }); });
  B.forEach(b => { if (!A.some(a => a.id === b.id)) out.push(b.id + ': new'); }); return out; }
/* every write the page makes while the dry run is open: the lead list setters, Recently deleted, the inbox, gc_kv */
const spyOn = p => p.evaluate(() => { const W = window; W.__BMW = []; const wrap = (o, k, tag) => { if (!o || typeof o[k] !== 'function' || o[k].__bmspy) return; const f = o[k]; o[k] = function(){ (W.__BMW || []).push(tag); return f.apply(this, arguments); }; o[k].__bmspy = 1; };
  wrap(W._gcLeadsHubKit, 'setLeads', 'kit.setLeads');   /* (not React's own setter: other parts of the page save leads in the background) */ wrap(W._gcLDEL, 'remove', 'LDEL.remove'); wrap(W._gcLDEL, 'restore', 'LDEL.restore'); wrap(W._gcLeadInbox, 'act', 'inbox.act');
  const f = W.fetch; W.fetch = function(u, o){ if (W.__BMW && o && /POST|PATCH|PUT|DELETE/i.test(o.method || '') && (/bid-inbox/.test(String(u)) || /gc_bidmerge_log/.test(String(o.body || '')))) W.__BMW.push('fetch ' + o.method + ' ' + String(u).slice(0, 60)); return f.apply(this, arguments); }; });
const spyOff = p => p.evaluate(() => { const w = window.__BMW || []; window.__BMW = []; return w; });
try {
  const c = await computer('BM', { build }); const p = c.page();
  await p.setViewportSize({ width: 1440, height: 900 });
  await route(c); await boot(c);
  /* 1. the Lead Inbox: one row, "· 2 GCs · 9 trades"; the panel lists the GCs */
  await p.evaluate(() => window._setView('leads')); await sleep(2500);
  await waitFor(c, () => !!document.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"]'), null, 30000, 300);
  await p.evaluate(() => document.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"]').click());
  await waitFor(c, () => !!document.querySelector('#gc-ldi .lx-row[data-id="LEADIN-one1"]'), null, 60000, 400); await sleep(800);
  const row = await p.evaluate(() => { const r = document.querySelector('#gc-ldi .lx-row[data-id="LEADIN-one1"] .c-nm'); return r ? r.textContent.trim() : ''; });
  ok(row === 'UrgentVet - Memphis · 2 GCs · 9 trades', 'Lead Inbox row: "UrgentVet - Memphis · 2 GCs · 9 trades"', row);
  await p.locator('#gc-ldi .lx-row[data-id="LEADIN-one1"]').first().click(); await sleep(900);
  const pane = await p.evaluate(() => { const s = document.querySelector('#gc-ldi .lx-pane .bm-sec'); return s ? { h: s.querySelector('h4').textContent.trim(), gcs: [...s.querySelectorAll('.bm-gc')].map(g => g.textContent.replace(/\s+/g, ' ').trim()), hist: (s.querySelector('.bm-hist') || {}).textContent || '' } : null; });
  ok(pane && pane.h === '2 GCs invited us · 9 trades' && pane.gcs.length === 2, 'the detail panel: "2 GCs invited us · 9 trades" with both GCs', pane);
  ok(pane && /Loberg Construction.*BuildingConnected.*due.*Acoustical Ceilings, Drywall & Framing.*Dana Whitfield.*Open on BuildingConnected/.test(pane.gcs[0]) && /Brasfield & Gorrie, LLC.*PlanHub.*Flooring.*Marcus Hale.*\(901\) 555-0142/.test(pane.gcs[1]), 'each GC: board, due, trades / packages, contact, link', pane && pane.gcs);
  ok(pane && /\+1 GC: Brasfield & Gorrie, LLC \(Flooring\)/.test(pane.hist), 'the quiet "+1 GC" history line', pane && pane.hist);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/bidmerge_inbox_pane.png' });
  /* 2. Leads → ⋯ More → 🔗 Merge duplicate bid leads (1) */
  await p.evaluate(() => { const b = document.querySelector('#gc-leads-tabs [data-gc-tab]:not([data-gc-tab="bidboard"])') || [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Lead Pipeline'); if (b) b.click(); });
  await waitFor(c, () => !!document.querySelector('#gc-leads-hub [data-gclu-more]') || !!document.querySelector('#gc-leads-hub [data-gcl-bidmerge]'), null, 40000, 300); await sleep(800);
  const cnt = await p.evaluate(() => window._gcBidMerge.count());
  ok(cnt === 1, 'one duplicate group (the three Rothys leads; Equipment Share — same GC — is not in it)', cnt);
  const name = await p.evaluate(() => { const r = document.querySelector('#gc-leads-hub tr[data-gcl-id="LEADIN-one1"] .c-name'); return r ? r.textContent.replace(/\s+/g, ' ') : ''; });
  ok(/🔗 2 GCs · 9 trades/.test(name), 'Leads list: the name shows "🔗 2 GCs · 9 trades"', name);
  await p.evaluate(() => { const m = document.querySelector('#gc-leads-hub [data-gclu-more]'); if (m) m.click(); }); await sleep(500);
  const item = await p.evaluate(() => { const b = document.querySelector('#gc-leads-hub [data-gcl-bidmerge]'); return b ? b.textContent.trim() : ''; });
  ok(item === '🔗 Merge duplicate bid leads (1)', 'the menu item "🔗 Merge duplicate bid leads (1)"', item);
  const before = await leadsNow(p), full0 = await stable(p);
  await spyOn(p);
  await p.locator('#gc-leads-hub [data-gcl-bidmerge]').first().click(); await sleep(700);
  const dry = await p.evaluate(() => { const o = document.getElementById('gc-bidmerge'); return o ? { h: o.querySelector('h3').textContent, grp: o.querySelectorAll('.grp').length, rows: [...o.querySelectorAll('.grp .row')].map(r => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)), note: o.querySelector('.note').textContent.slice(0, 40), btn: (o.querySelector('[data-bm="merge"]') || {}).textContent } : null; });
  ok(dry && dry.grp === 1 && dry.rows.length === 3 && /^★ Kept/.test(dry.rows[0]) && /A dry run/.test(dry.note) && dry.btn === '🔗 Merge selected (1)', 'the dry run: 1 group, 3 leads, the kept one first; "Merge selected (1)"', dry);
  const writes = await spyOff(p), full1 = await stable(p), d1 = diff(full0, full1);
  ok(!writes.length, 'the dry run writes nothing (no lead save, no Recently deleted, no inbox action, no gc_kv write)', writes);
  ok(!d1.length, 'opening it changed nothing (every field of every lead the same)', d1);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/bidmerge_dryrun.png' });
  await p.locator('#gc-bidmerge [data-bm="merge"]').click(); await sleep(300);
  const ask = await p.evaluate(() => document.querySelector('#gc-bidmerge .act').textContent.replace(/\s+/g, ' '));
  ok(/Merge 1 project\? 2 leads go to 🗑 Recently deleted/.test(ask), 'it asks first: "Merge 1 project? 2 leads go to 🗑 Recently deleted"', ask);
  await p.locator('#gc-bidmerge [data-bm="yes"]').click();
  await waitFor(c, () => !document.getElementById('gc-bidmerge'), null, 20000, 200); await sleep(2500);
  const after = await leadsNow(p), kept = after.find(l => l.id === 'LEADIN-dup1');
  const fullMerged = await fullNow(p);
  ok(after.length === before.length - 2 && kept && kept.gcs === 2 && kept.name === 'Rothys - Nashville, TN', 'merged: one Rothys lead (2 GCs, named for the project), the other two gone from the list', { after, kept });
  const del = await p.evaluate(() => window._gcLDEL.status().deleted);
  ok(del >= 2, '…and in 🗑 Recently deleted', del);
  await sleep(1500);
  ok(ACTS.filter(a => a.op === 'merged' && a.into === 'LI-dup1').length === 2, 'the Lead Inbox was told (merged into the kept lead\'s item)', ACTS);
  /* 3. ↩ Undo */
  await p.evaluate(() => window._gcBidMerge.open()); await sleep(800);
  const hasUndo = await p.evaluate(() => !!document.querySelector('#gc-bidmerge [data-bm="undo"]'));
  ok(hasUndo, '"↩ Undo last merge" is offered');
  if (hasUndo) { await p.locator('#gc-bidmerge [data-bm="undo"]').click(); await waitFor(c, () => !document.getElementById('gc-bidmerge'), null, 20000, 200); await sleep(3000); }
  const back = await leadsNow(p), full2 = await stable(p), d2 = diff(full0.filter(l => /dup/.test(l.id)), full2.filter(l => /dup/.test(l.id)));
  ok(back.length === before.length && back.find(l => l.id === 'LEADIN-dup1').gcs === 0 && !!back.find(l => l.id === 'LEADIN-dup3'), 'undo: the three leads are back as they were', back);
  ok(!d2.length, 'undo: every field of the three leads as before the merge (the kept lead\'s gcs, name, trades, mergedFrom …)', { d2, merged: fullMerged.filter(l => l.id === 'LEADIN-dup1').map(l => ({ gcs: (l.gcs || []).length, name: l.name })) });
  ok(ACTS.filter(a => a.op === 'unmerge').length === 2, 'the Lead Inbox was told (unmerge)', ACTS.filter(a => a.op === 'unmerge'));
  const perr = (c.__perr || []).concat(await p.evaluate(() => window.__ERR || []));
  ok(!perr.some(e => /BidMerge|bidmerge|_gcBidMerge|gcs/.test(e)), 'no page errors from this patch', perr);
  /* 4. phone */
  const m = await computer('BMp', { build, mobile: true }); const mp = m.page(); await route(m); await boot(m);
  await mp.evaluate(() => window._setView('leads')); await sleep(2500);
  await mp.evaluate(() => window._gcBidMerge.open()); await sleep(800);
  const ph = await mp.evaluate(() => { const o = document.getElementById('gc-bidmerge'); return o ? { sw: document.documentElement.scrollWidth, vw: window.innerWidth, box: Math.round(o.querySelector('.box').getBoundingClientRect().width), grp: o.querySelectorAll('.grp').length } : null; });
  ok(ph && ph.grp === 1 && ph.sw <= ph.vw + 1 && ph.box <= ph.vw, 'phone: the dry run fits the screen (no sideways scroll)', ph);
  if (SHOTS) await mp.screenshot({ path: SHOTS + '/bidmerge_phone.png' });
} catch (e) { fail++; console.log('  ✗ FAIL ' + (e && e.stack || e)); }
await shared.close();
console.log(fail ? 'FAILED ' + pass + '/' + (pass + fail) : 'OK ' + pass + '/' + pass);
process.exit(fail ? 1 : 0);
