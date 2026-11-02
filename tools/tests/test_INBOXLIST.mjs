// test_INBOXLIST.mjs <build-dir> — patch INBOXLIST (owner 11/01: "I want to click and then it show that info from a list,
//   make it simpler"): Leads → 📥 Lead Inbox is a compact list + a detail panel.
//   On the read-only real-data mirror (MIRROR=<gc_kv mirror .json>; customer data: read at run time, never written, never
//   committed) + 80 made-up copies of its inbox leads (so 100+ rows), as the owner (admin), desktop 1440×900:
//     * one ~44 px row per lead with type / project / GC / city / due / status / assigned, sorted by due then newest;
//       unread (new, never opened here) rows bold, plain once opened;
//     * a row opens the panel on the right with the card's fields (chips, title, GC, address, due + Fix, actions,
//       details, links, why-this-date, plans note); ↑ / ↓ move, Esc / ✕ close;
//     * links de-duplicated: one "Open on BuildingConnected", one PlanHub, Bid documents (Dropbox) shown; unsubscribe /
//       tracking / homepages under "More links";
//     * every action still works from the panel: Create bid job, Assign, Not interested, ✏️ Fix (due), ✉ E-mail,
//       Publish to bid portal, Merge (dialog);
//     * Filters (the 5 selects behind one button) and the search box;
//     * phone 390×844: two-line rows, no sideways scroll, the panel full screen (a patch NAV layer: the phone Back closes it);
//     * no page errors; no long task over 200 ms while working the list; list / panel builds are cheap.
//   GC_SHOTS=<dir> saves screenshots (inboxlist_<tag>_*.png, GC_SHOT_TAG, default "after"); GC_SHOTS_ONLY=1 only takes
//   them (used on the old build for the "before" pictures).
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs). Browser tests: one at a time.
import fs from 'fs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset, cget } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2], MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
if (!build || !fs.existsSync(MIRROR)) { console.error('usage: MIRROR=<mirror .json> node test_INBOXLIST.mjs <dir with index.html>'); process.exit(2); }
const SHOTS = process.env.GC_SHOTS || '', TAG = process.env.GC_SHOT_TAG || 'after', ONLY = !!process.env.GC_SHOTS_ONLY;
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/inboxlist_${TAG}_${name}.png` }).catch(e => console.log('  (shot failed ' + e.message + ')')); };
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });

/* ── the cloud: the mirror + 80 copies of its inbox leads ── */
resetCloud();
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
for (const r of rows) cset(r.key, r.value !== undefined ? r.value : r.v);
const leads0 = (cget('leads') || []).slice();
const inbox0 = leads0.filter(l => l && l.inboxId && l.stage !== 'Won' && l.stage !== 'Lost');
const now = Date.now(), inD = d => { const t = new Date(now + d * 864e5); return t.toISOString().slice(0, 10) + 'T' + ['09:00', '14:30', '12:00'][Math.abs(Math.round(d * 3)) % 3]; };
const copies = [];
for (let i = 0; i < 80; i++) {
  const b = inbox0[i % inbox0.length];
  copies.push(Object.assign(JSON.parse(JSON.stringify(b)), { id: 'LEADIN-tst' + i, inboxId: 'LI-tst' + i, name: b.name + ' (test copy ' + i + ')', bidDue: i % 9 === 0 ? '' : inD((i % 23) - 2 + i / 100),
    createdAt: new Date(now - i * 3600e3).toISOString(), inboxState: i % 4 ? 'new' : 'assigned', pm: '', pid: '' }));
}
cset('leads', copies.concat(leads0));
const DUE_LEAD = copies[1].id;
console.log('  mirror: ' + leads0.length + ' leads, ' + inbox0.length + ' open inbox leads; + ' + copies.length + ' test copies');

/* the bid-inbox function: every inbox lead's item (already imported; the portal state for the chips), publish / act */
const ACTS = [];
const items = () => (cget('leads') || []).filter(l => l && l.inboxId).map((l, i) => ({ id: l.inboxId, status: 'imported', rev: 0, title: l.name, leadId: l.id, receivedAt: l.inboxAt || l.createdAt,
  portal: { state: +((String(l.inboxId).match(/tst(\d+)$/) || [])[1]) % 6 === 0 ? 'published' : 'draft', jobId: 'BJ' + i } }));   /* test copies 0, 6, 12… are live on the portal */
async function routeInbox(c){
  await c.ctx.route(/\/\.netlify\/functions\/bid-inbox/, async r => {
    const u = r.request().url(), m = r.request().method();
    if (m === 'POST') { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {} ACTS.push(b); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'BJ-pub' }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: items(), settings: {}, notices: [], watch: { lastRun: { at: new Date(now - 3 * 3600e3).toISOString() } }, portal: { ready: true }, me: { email: 'wjohnson@grayco-cs.com', admin: true }, at: new Date().toISOString() }) });
  });
  await c.ctx.addInitScript(() => {
    try { localStorage.setItem('gc_ldi_ui_v1', JSON.stringify({ show: 'open', open: true })); } catch (e) {}
    window.__LT = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__LT.push({ s: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  });
}
const email = 'wjohnson@grayco-cs.com';
async function boot(c){
  const p = c.page();
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await waitFor(c, () => window._gcLeadInbox && (window._gcLeadInbox._test.peek('_setLeads') || []).length > 150, null, 150000, 500);
  await sleep(6000);
  await p.evaluate(() => window._setView('leads')); await sleep(2500);
  await waitFor(c, () => !!document.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"]'), null, 30000, 300);
  await p.evaluate(() => document.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"]').click());
  await waitFor(c, () => { const r = document.getElementById('gc-ldi'); return r && r.getClientRects().length && (r.querySelectorAll('.lx-row').length > 100 || r.querySelectorAll('.card[data-id]').length > 20); }, null, 60000, 500);
  await sleep(1500);
}
const lead = (p, id) => p.evaluate(id => (window._gcLeadInbox._test.peek('_setLeads') || []).find(l => l && l.id === id) || null, id);
const LX = p => p.evaluate(() => { const x = window._gcLeadInbox._test.lx ? window._gcLeadInbox._test.lx() : null; return x && { open: x.open, ids: x.ids, q: x.q, lim: x.lim, t: x.t }; });
const paneInfo = p => p.evaluate(() => {
  const pn = document.querySelector('#gc-ldi .lx-pane'); if (!pn || !pn.getClientRects().length) return null;
  const r = pn.getBoundingClientRect(), q = s => pn.querySelector(s), tx = s => (q(s) && q(s).textContent || '').trim();
  const L = document.querySelector('#gc-ldi .lx-list').getBoundingClientRect();
  return { id: pn.getAttribute('data-id'), card: pn.classList.contains('card'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), listX: Math.round(L.left), listW: Math.round(L.width),
    title: tx('.ttl'), chips: [...pn.querySelectorAll('.tags > *')].map(e => e.textContent.trim()), subs: [...pn.querySelectorAll('.px-top .sub')].map(e => e.textContent.trim()), due: tx('.due'), fix: !!q('[data-a="editdue"]'),
    acts: [...pn.querySelectorAll(':scope > .acts > *')].map(e => (e.getAttribute('data-a') || (e.tagName === 'A' ? 'a:' : '') + e.textContent.trim())),
    dts: [...pn.querySelectorAll('.px-dl dt')].map(e => e.textContent.trim()), main: [...pn.querySelectorAll('.px-sec .docs:not(.px-more .docs) > a')].map(e => e.textContent.trim()),
    more: [...pn.querySelectorAll('.px-more .docs > a')].map(e => e.textContent.trim()), why: tx('.px-why'), note: [...pn.querySelectorAll(':scope > .note')].map(e => e.textContent.trim().slice(0, 60)), drop: !!q('.drop'),
    focusIn: pn.contains(document.activeElement) };
});
const ltSince = (p, t0) => p.evaluate(t0 => (window.__LT || []).filter(x => x.s >= t0), t0);
const perfNow = p => p.evaluate(() => Math.round(performance.now()));
const clickRow = (p, id) => p.locator(`#gc-ldi .lx-row[data-id="${id}"]`).first().click();

try {
  /* ═════ desktop ═════ */
  const c = await computer('IL', { build }); const p = c.page();
  await p.setViewportSize({ width: 1440, height: 900 });
  await routeInbox(c); await boot(c);
  if (ONLY) {
    await shot(p, 'desktop_list');
    const m = await computer('ILm', { build, mobile: true }); await routeInbox(m); await boot(m); await shot(m.page(), 'phone_list');
    console.log('  screenshots only'); await shared.close(); process.exit(0);
  }
  const t0 = await perfNow(p);
  /* 1. the list */
  const L1 = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#gc-ldi .lx-row')], x = window._gcLeadInbox._test.lx(), L = window._gcLeadInbox._test.peek('_setLeads');
    const by = {}; L.forEach(l => { if (l) by[l.id] = l; });
    const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
    const r0 = rows[0];
    return { n: rows.length, ids: x.ids.length, hs: rows.slice(0, 30).map(r => Math.round(r.getBoundingClientRect().height)),
      cells: r0 ? ['.c-ty', '.c-nm', '.c-gc', '.c-ci', '.c-du', '.c-st', '.c-as'].map(s => vis(r0.querySelector(s))) : [],
      head: [...document.querySelectorAll('#gc-ldi .lx-head > span')].map(e => e.textContent),
      due: rows.map(r => { const l = by[r.getAttribute('data-id')] || {}; return { d: l.bidDue || '', c: l.createdAt || '' }; }),
      firstTxt: r0 ? [...r0.children].filter(vis).map(e => e.textContent.trim()) : [],
      hd: (document.querySelector('#gc-ldi .hd') || {}).textContent, hdH: Math.round(document.querySelector('#gc-ldi .hd').getBoundingClientRect().height),
      selects: document.querySelectorAll('#gc-ldi .lx-fl select').length, flShown: vis(document.querySelector('#gc-ldi .lx-fl')), search: vis(document.querySelector('#gc-ldi .lx-q')),
      cards: document.querySelectorAll('#gc-ldi .card').length };
  });
  ok(L1.n >= 100 && L1.n === L1.ids, 'the inbox is a list: ' + L1.n + ' rows (one per lead, 100+)', L1.n + '/' + L1.ids);
  ok(L1.hs.every(h => h >= 40 && h <= 48), 'rows ~44 px tall', L1.hs.slice(0, 8));
  ok(L1.cells.every(Boolean) && /Type.*Project.*GC.*City.*Due.*Status.*Assigned/.test(L1.head.join('|')), 'columns: type · project · GC / source · city · due · status · assigned', { cells: L1.cells, head: L1.head });
  console.log('    first row: ' + L1.firstTxt.join(' | '));
  ok(L1.cards === 0, 'no cards until a lead is opened', L1.cards);
  const key = d => { if (!d) return 9e15; const t = Date.parse(d.length === 10 ? d + 'T23:59:00' : d); return isFinite(t) && t >= Date.now() - 864e5 ? t : 9e15; };
  const badSort = L1.due.map((x, i, a) => i && (key(a[i - 1].d) > key(x.d) || (key(a[i - 1].d) === key(x.d) && a[i - 1].c < x.c)) ? i : -1).filter(i => i > 0);
  ok(!badSort.length, 'sorted by due date (soonest first), then newest', badSort.slice(0, 5).map(i => [L1.due[i - 1], L1.due[i]]));
  ok(/Lead Inbox/.test(L1.hd) && /Check now/.test(L1.hd) && /Checked/.test(L1.hd) && /⚙/.test(L1.hd) && L1.hdH <= 48, 'slim header keeps ↻ Check now, ⚙ and "Checked …" (' + L1.hdH + ' px)', L1.hd);
  ok(L1.search && !L1.flShown, 'one search box; the filters are folded behind "Filters"', L1);
  const dueCol = await p.evaluate(() => [...document.querySelectorAll('#gc-ldi .lx-row .c-du')].slice(0, 40).map(e => ({ t: e.textContent.trim(), c: e.className, col: getComputedStyle(e).color, dot: getComputedStyle(e.querySelector('.dot')).backgroundColor })));
  const hot = dueCol.filter(x => /hot/.test(x.c));
  ok(dueCol.some(x => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) [A-Z][a-z]{2} \d{1,2}( · \d{1,2}(:\d\d)? (AM|PM))?/.test(x.t)) && hot.length && hot.every(x => /rgb\(185, 28, 28\)/.test(x.col) && /220, 38, 38/.test(x.dot)), 'due: a colour dot + "Tue Nov 3 · 12 PM", red within 2 days', dueCol.slice(0, 4));
  /* unread bold */
  const un = await p.evaluate(() => { const r = document.querySelector('#gc-ldi .lx-row.un'); return r ? { id: r.getAttribute('data-id'), fw: +getComputedStyle(r.querySelector('.c-nm')).fontWeight } : null; });
  const rd = await p.evaluate(() => { const r = document.querySelector('#gc-ldi .lx-row:not(.un)'); return r ? +getComputedStyle(r.querySelector('.c-nm')).fontWeight : null; });
  ok(un && un.fw >= 700 && rd != null && rd < 700, 'new rows not opened yet are bold, the others are not', { un, rd });
  await shot(p, 'desktop_list');

  /* 2. a row opens the panel with everything the card had (the real Eyemart lead: PlanHub + 9 BuildingConnected e-mails) */
  const EYE = 'LEADIN-0f25e8a261a105a7', VET = (inbox0.find(l => (l.plansLinks || []).some(x => /Dropbox/.test(x.label || ''))) || {}).id;
  await p.locator('#gc-ldi .lx-q').fill(''); await sleep(200);
  await clickRow(p, un.id); await sleep(500);
  const unAfter = await p.evaluate(id => { const r = document.querySelector(`#gc-ldi .lx-row[data-id="${id}"]`); return r ? { un: r.classList.contains('un'), on: r.classList.contains('on'), fw: +getComputedStyle(r.querySelector('.c-nm')).fontWeight } : null; }, un.id);
  ok(unAfter && !unAfter.un && unAfter.on && unAfter.fw < 700, 'opening a bold row makes it plain and highlights it', unAfter);
  await clickRow(p, EYE); await sleep(600);
  const P1 = await paneInfo(p), eye = await lead(p, EYE);
  ok(P1 && P1.id === EYE && P1.card, 'clicking a row opens its panel (a .card[data-id] for the blocks that decorate inbox cards)', P1 && P1.id);
  ok(P1 && P1.x >= P1.listX + P1.listW - 2 && P1.w >= 360 && P1.x > 700, 'desktop: the panel sits on the right, the list stays on the left', P1 && { x: P1.x, w: P1.w, listX: P1.listX, listW: P1.listW });
  ok(P1 && P1.title === eye.name && P1.subs.some(s => s.includes(eye.gc)) && P1.subs.some(s => s.includes('Oxford')) && /Due|due/.test(P1.due) && P1.fix, 'top: title, GC, address, due with ✏️ Fix', P1 && { t: P1.title, subs: P1.subs, due: P1.due });
  ok(P1 && P1.chips.some(t => /PlanHub/.test(t)) && P1.chips.some(t => /Commercial/.test(t)) && P1.chips.some(t => /also on BuildingConnected/.test(t)) && P1.chips.some(t => /bid portal/i.test(t)), 'chips: source, type, bid portal, also on…', P1 && P1.chips);
  ok(P1 && ['job', 'assign', 'publish', 'dismiss', 'a:✉ E-mail', 'merge'].every(a => P1.acts.includes(a)) && P1.acts[0] === 'job', 'actions in one row: ✅ Create bid job first, Assign, Publish, Not interested, ✉ E-mail, Merge', P1 && P1.acts);
  ok(P1 && ['Trades', 'Contact'].every(d => P1.dts.includes(d)), 'details: trades, contact (bid # when there is one)', P1 && P1.dts);
  const bc = P1 ? P1.main.filter(t => /BuildingConnected/.test(t)).length : -1, ph = P1 ? P1.main.filter(t => /PlanHub/.test(t)).length : -1;
  ok(bc === 1 && ph === 1, 'links de-duplicated: one "Open on BuildingConnected" (of ' + (eye.plansLinks || []).filter(x => x.board === 'BuildingConnected').length + '), one "Open on PlanHub"', P1 && P1.main);
  ok(P1 && !P1.main.some(t => /unsubscribe|url3665|www\.|^BuildingConnected ↗$/i.test(t)) && P1.more.some(t => /unsubscribe/i.test(t)) && P1.more.some(t => /url3665/i.test(t)), 'unsubscribe / tracking / homepage links only under "More links"', P1 && { main: P1.main, more: P1.more.slice(0, 6) });
  ok(P1 && P1.note.some(t => /Plans are behind the board/.test(t)) && P1.drop, 'the plans note and the drop zone', P1 && P1.note);
  const LK = await p.evaluate(id => window._gcLeadInbox._test.lx().links(id), VET);
  ok(VET && LK && LK.main.some(x => /Bid documents \(Dropbox\)/.test(x.label)) && LK.main.filter(x => /BuildingConnected/.test(x.label)).length === 1, 'Bid documents (Dropbox) is a main link; one BuildingConnected', LK && LK.main.map(x => x.label));
  /* why this due date: a lead with the e-mail's words */
  const snip = inbox0.find(l => l.dueSnippet);
  if (snip) {
    await clickRow(p, snip.id); await sleep(500);
    const w = await p.evaluate(() => { const d = document.querySelector('#gc-ldi .lx-pane .px-why'); return d ? { open: d.open, sum: d.querySelector('summary').textContent, txt: d.textContent } : null; });
    ok(w && !w.open && /Why this due date/.test(w.sum) && /found in the e-mail/.test(w.txt), '"found in the e-mail" is folded under "Why this due date"', w);
  }
  await clickRow(p, EYE); await sleep(400);
  await shot(p, 'desktop_panel');
  /* ↑ / ↓ / Esc / ✕ */
  let x = await LX(p); const ix = x.ids.indexOf(EYE);
  await p.keyboard.press('ArrowDown'); await sleep(300); x = await LX(p);
  ok(x.open === x.ids[ix + 1], '↓ opens the next lead', { open: x.open, want: x.ids[ix + 1] });
  await p.keyboard.press('ArrowUp'); await sleep(300); x = await LX(p);
  ok(x.open === EYE, '↑ goes back', x.open);
  await p.keyboard.press('Escape'); await sleep(300);
  ok(!(await paneInfo(p)) && !(await LX(p)).open, 'Esc closes the panel', null);
  await clickRow(p, EYE); await sleep(300); await p.locator('#gc-ldi .lx-pane .px-x').click(); await sleep(300);
  ok(!(await paneInfo(p)), '✕ closes the panel');
  const tim = (await LX(p)).t;
  ok(tim.list < 60 && tim.pane < 60, 'list built in ' + tim.list + ' ms (' + tim.n + ' rows), panel in ' + tim.pane + ' ms', tim);

  /* 3. every action from the panel */
  // ✏️ Fix the due date (LA's editor)
  await clickRow(p, DUE_LEAD); await sleep(400);
  await p.locator('#gc-ldi .lx-pane [data-a="editdue"]').click(); await sleep(500);
  const pop = await p.evaluate(() => !!document.querySelector('.gc-la-pop'));
  ok(pop, '✏️ Fix opens the bid-due editor');
  if (pop) {
    const nd = new Date(now + 12 * 864e5).toISOString().slice(0, 10);
    await p.fill('.gc-la-pop .gc-la-d', nd); await p.fill('.gc-la-pop .gc-la-t', '10:30'); await p.fill('.gc-la-pop .gc-la-co', 'Test GC Co');
    await p.locator('.gc-la-pop [data-save]').click();
    const got = await waitFor(c, ([id, nd]) => { let L = null; try { window._setLeads(prev => { L = prev; return prev; }); } catch (e) {} const l = (L || []).find(x => x && x.id === id); return l && l.bidDue === nd + 'T10:30' ? l.bidDue : null; }, [DUE_LEAD, nd], 8000, 300);   /* React's own list (LA saves there) */
    if (!got) console.log('    (editor: ' + JSON.stringify(await p.evaluate(() => ({ pop: !!document.querySelector('.gc-la-pop'), err: (document.querySelector('.gc-la-pop .err') || {}).textContent || '', log: window._gcLA.status().log.slice(-3) }))) + ')');
    ok(!!got, '… and saving it changes the lead\'s bid due (' + got + ')');
    await sleep(800);
    const dueTxt = await p.evaluate(() => (document.querySelector('#gc-ldi .lx-pane .due') || {}).textContent || '');
    ok(/10:30/.test(dueTxt), 'the panel shows the new due right away', dueTxt);
  }
  // ✉ E-mail: the bid e-mail opens through the CRM's file links
  await p.evaluate(() => { window.__mail = null; window.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#gc-ldi .lx-pane .acts a[data-name]'); if (a) { window.__mail = { href: a.getAttribute('href'), handled: e.defaultPrevented }; e.preventDefault(); } }, true); });
  await clickRow(p, EYE); await sleep(400);
  const nPages = c.ctx.pages().length;
  await p.locator('#gc-ldi .lx-pane .acts a', { hasText: 'E-mail' }).click(); await sleep(800);
  const mail = await p.evaluate(() => window.__mail);
  ok(mail && mail.href === eye.rawEmailRef && mail.handled, '✉ E-mail opens the bid e-mail (the CRM\'s file-link handler took the click)', mail);
  for (const pg of c.ctx.pages().slice(nPages)) await pg.close().catch(() => {});
  // Assign
  const asgId = x.ids.find(id => id.startsWith('LEADIN-tst') && id !== DUE_LEAD);
  await clickRow(p, asgId); await sleep(400);
  await p.locator('#gc-ldi .lx-pane [data-a="assign"]').click(); await sleep(500);
  const pm = await p.evaluate(() => { const s = document.querySelector('#ldi-pm'); const o = s && [...s.options].find(o => o.value); if (o) s.value = o.value; return o ? o.value : null; });
  ok(!!pm, 'Assign opens the assign dialog', pm);
  if (pm) {
    await p.locator('.gc-ldi-dlg .df button.pri').click();
    const as = await waitFor(c, ([id, pm]) => { const l = (window._gcLeadInbox._test.peek('_setLeads') || []).find(x => x && x.id === id); return l && (l.pm === pm || l.estimator === pm) ? (l.pm || l.estimator) : null; }, [asgId, pm], 8000, 300);
    ok(!!as, '… and assigns the lead (' + pm + ')');
    ok(ACTS.some(a => a.op === 'assigned' && a.id === 'LI-' + asgId.replace('LEADIN-', '')), '… and tells the server, as before', ACTS.slice(-3));
  }
  // Publish to bid portal
  const pubId = x.ids.find(id => /^LEADIN-tst\d+$/.test(id) && +id.slice(10) % 6 !== 0 && id !== asgId && id !== DUE_LEAD);
  await clickRow(p, pubId); await sleep(400);
  if (await p.locator('#gc-ldi .lx-pane [data-a="publish"]').count()) {
    await p.locator('#gc-ldi .lx-pane [data-a="publish"]').click(); await sleep(400); await p.locator('.gc-ldi-dlg .df button.pri').click(); await sleep(1500);
    ok(ACTS.some(a => a.op === 'publish'), 'Publish to bid portal: the dialog publishes it', ACTS.slice(-2));
  } else ok(false, 'Publish button on a draft lead');
  // Merge: the dialog
  await p.locator('#gc-ldi .lx-pane [data-a="merge"]').click(); await sleep(400);
  ok(await p.evaluate(() => /^Merge/.test((document.querySelector('.gc-ldi-dlg .dh span') || {}).textContent || '')), 'Merge with… opens its dialog');
  await p.keyboard.press('Escape'); await sleep(300);
  ok(!!(await paneInfo(p)), 'Esc in a dialog closes the dialog, not the panel');
  // Not interested
  const disId = x.ids.filter(id => id.startsWith('LEADIN-tst') && ![asgId, pubId, DUE_LEAD].includes(id))[2];
  await clickRow(p, disId); await sleep(400);
  await p.locator('#gc-ldi .lx-pane [data-a="dismiss"]').click(); await sleep(400); await p.locator('.gc-ldi-dlg .df button.pri').click();
  const gone = await waitFor(c, id => !(window._gcLeadInbox._test.peek('_setLeads') || []).some(x => x && x.id === id) && !document.querySelector(`#gc-ldi .lx-row[data-id="${id}"]`), disId, 8000, 300);
  ok(!!gone && !(await paneInfo(p)), 'Not interested removes the lead (row and panel gone)', disId);
  const LT1 = (await ltSince(p, t0)).filter(x => x.d > 200);
  // Create bid job (the main action)
  const jobId = x.ids.filter(id => id.startsWith('LEADIN-tst') && ![asgId, pubId, DUE_LEAD, disId].includes(id))[3];
  await clickRow(p, jobId); await sleep(400);
  await p.locator('#gc-ldi .lx-pane [data-a="job"]').click(); await sleep(400);
  ok(await p.evaluate(() => /Create a bid job/.test((document.querySelector('.gc-ldi-dlg .dh span') || {}).textContent || '')), '✅ Create bid job opens its dialog');
  await p.locator('.gc-ldi-dlg .df button.pri').click();
  const job = await waitFor(c, id => { const l = (window._gcLeadInbox._test.peek('_setLeads') || []).find(x => x && x.id === id); const pid = l && l.pid; return pid && (window._crm.projects || []).some(p => p && p.id === pid) ? pid : null; }, jobId, 10000, 300);
  ok(!!job, '… and makes the Bidding job, linked on the lead (' + job + ')');
  await sleep(2500);
  for (let i = 0; i < 4 && await p.evaluate(() => !!document.querySelector('#gcja-job, .gcja-ov')); i++) { await p.evaluate(() => { try { window._gcNavBack(); } catch (e) {} }); await sleep(800); }   /* the job it opened */
  await p.evaluate(() => { document.querySelectorAll('#gcja-job, .gcja-ov').forEach(e => e.remove()); window._setView('leads'); }); await sleep(1500);
  await p.evaluate(() => document.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"]').click()); await sleep(1500);
  await clickRow(p, jobId); await sleep(400);
  ok((await paneInfo(p) || {}).acts?.[0] === 'openjob', 'that lead\'s panel now leads with "Open bid job"');
  await p.keyboard.press('Escape');

  /* 4. Filters + search */
  const t1 = await perfNow(p);
  await p.locator('#gc-ldi .lx-fbtn').click(); await sleep(300);
  const F = await p.evaluate(() => ({ shown: document.querySelector('#gc-ldi .lx-fl').getClientRects().length > 0, sel: [...document.querySelectorAll('#gc-ldi .lx-fl select')].map(s => s.getAttribute('data-f')) }));
  ok(F.shown && ['show', 'src', 'type', 'role', 'due'].every(f => F.sel.includes(f)), 'Filters opens the five filters', F);
  await p.selectOption('#gc-ldi select[data-f="type"]', 'Government'); await sleep(500);
  const g = await p.evaluate(() => { const L = window._gcLeadInbox._test.peek('_setLeads'); const ids = [...document.querySelectorAll('#gc-ldi .lx-row')].map(r => r.getAttribute('data-id')); return { n: ids.length, want: window._gcLeadInbox._test.filtered().length, kinds: [...new Set(ids.map(id => (L.find(l => l.id === id) || {}).leadKind))], btn: document.querySelector('#gc-ldi .lx-fbtn').textContent }; });
  ok(g.n > 0 && g.n === g.want && g.kinds.join() === 'Government' && /Filters · 1/.test(g.btn), 'type filter: only Government (' + g.n + '), the button counts it', g);
  await p.selectOption('#gc-ldi select[data-f="type"]', ''); await p.selectOption('#gc-ldi select[data-f="role"]', 'sub'); await sleep(500);
  const sb = await p.evaluate(() => [...document.querySelectorAll('#gc-ldi .lx-row .c-ty')].map(e => e.textContent.trim()));
  ok(sb.length && sb.every(t => /SUB/.test(t)), 'prime / sub filter: only 🔧 SUB rows (' + sb.length + ')', [...new Set(sb)]);
  await p.selectOption('#gc-ldi select[data-f="role"]', ''); await p.selectOption('#gc-ldi select[data-f="due"]', '7'); await sleep(500);
  const d7 = await p.evaluate(() => [...document.querySelectorAll('#gc-ldi .lx-row .c-du')].map(e => e.className));
  ok(d7.length && d7.every(c => /hot|warm/.test(c)), 'due filter: due in 7 days (' + d7.length + ')', d7.slice(0, 5));
  const fcl = await p.evaluate(() => { const b = document.querySelector('#gc-ldi [data-a="fclear"]'); return b ? '' : ((document.querySelector('#gc-ldi .lx-fl') || {}).outerHTML || 'no .lx-fl').slice(0, 600) + ' fbtn=' + (document.querySelector('#gc-ldi .lx-fbtn') || {}).textContent; });
  ok(!fcl, '"Clear filters" is there while a filter is on', fcl);
  if (!fcl) await p.locator('#gc-ldi [data-a="fclear"]').click(); else await p.evaluate(() => { const u = JSON.parse(localStorage.getItem('gc_ldi_ui_v1') || '{}'); ['src', 'type', 'role', 'due'].forEach(k => u[k] = ''); u.show = 'open'; localStorage.setItem('gc_ldi_ui_v1', JSON.stringify(u)); });
  await sleep(400);
  await p.locator('#gc-ldi .lx-q').fill('eyemart'); await sleep(500);
  const s1 = await p.evaluate(() => [...document.querySelectorAll('#gc-ldi .lx-row .c-nm')].map(e => e.textContent));
  ok(s1.length >= 1 && s1.every(t => /eyemart/i.test(t)), 'search "eyemart": only its rows (' + s1.length + ')', s1.slice(0, 4));
  await p.locator('#gc-ldi .lx-q').fill('oxford roofing'); await sleep(500);
  const s2 = await p.evaluate(() => document.querySelectorAll('#gc-ldi .lx-row').length);
  ok(s2 >= 1, 'search matches city + trade words together (' + s2 + ')');
  await p.locator('#gc-ldi .lx-q').fill('zzqqxx'); await sleep(500);
  ok(await p.evaluate(() => !document.querySelector('#gc-ldi .lx-row') && /No lead matches/.test(document.querySelector('#gc-ldi .lx-list').textContent)), 'no match: says so');
  await p.locator('#gc-ldi .lx-q').fill(''); await sleep(500);
  ok((await p.evaluate(() => document.querySelectorAll('#gc-ldi .lx-row').length)) >= 100, 'clearing the search brings every row back');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('lx-q')), 'typing in the search keeps the focus in the box');
  /* the old cards come back with the kill switch */
  /* long tasks while working the list */
  const LT = LT1.concat((await ltSince(p, t1)).filter(x => x.d > 200));
  ok(!LT.length, 'no long task over 200 ms while working the list (opening, ↑ ↓, actions, filters, search; not the job page "Create bid job" opens)', LT);
  ok(!c.errs.length, 'desktop: no page errors', c.errs.slice(0, 5));

  /* ═════ phone ═════ */
  const m = await computer('ILm', { build, mobile: true }); const q = m.page();
  await routeInbox(m); await boot(m);
  const q0 = await perfNow(q);
  const M1 = await q.evaluate(() => {
    const rows = [...document.querySelectorAll('#gc-ldi .lx-row')], r = rows[0], vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
    const b = s => r.querySelector(s).getBoundingClientRect();
    return { n: rows.length, h: Math.round(r.getBoundingClientRect().height), mt: vis(r.querySelector('.c-mt')), hidden: ['.c-gc', '.c-ci', '.c-st', '.c-as', '.c-ty'].every(s => !vis(r.querySelector(s))),
      nmTop: Math.round(b('.c-nm').top), duTop: Math.round(b('.c-du').top), mtTop: Math.round(b('.c-mt').top), mt: r.querySelector('.c-mt').textContent.trim(),
      sw: document.scrollingElement.scrollWidth, ldiW: Math.round(document.getElementById('gc-ldi').getBoundingClientRect().width) };
  });
  ok(M1.n >= 100 && M1.mt && M1.hidden && Math.abs(M1.nmTop - M1.duTop) < 6 && M1.mtTop > M1.nmTop + 8, 'phone: two lines per row (name + due; GC · city · type)', M1);
  ok(M1.sw <= 391, 'phone: no sideways scroll', { sw: M1.sw, w: M1.ldiW });
  await shot(q, 'phone_list');
  const firstId = await q.evaluate(() => document.querySelector('#gc-ldi .lx-row').getAttribute('data-id'));
  await q.locator(`#gc-ldi .lx-row[data-id="${firstId}"]`).tap(); await sleep(800);
  const MP = await q.evaluate(() => { const pn = document.querySelector('#gc-ldi-ph .lx-pane'); if (!pn) return null; const r = pn.getBoundingClientRect(), bk = pn.querySelector('.px-back');
    return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, back: !!bk && bk.getClientRects().length > 0, layer: (window._gcNavLayers ? window._gcNavLayers() : []).some(x => x === pn || x.contains(pn)), acts: pn.querySelectorAll(':scope > .acts > *').length, sw: document.scrollingElement.scrollWidth }; });
  ok(MP && MP.x === 0 && MP.y === 0 && Math.round(MP.w) === MP.vw && Math.round(MP.h) === MP.vh && MP.back, 'phone: the panel is full screen with ‹ Back', MP);
  ok(MP && MP.layer, 'phone: patch NAV sees it as a screen (the phone Back closes it)', MP);
  await shot(q, 'phone_panel');
  await q.locator('#gc-ldi-ph .lx-pane [data-a="editdue"]').tap({ timeout: 8000 }); await sleep(600);
  ok(await q.evaluate(() => { const p = document.querySelector('.gc-la-pop'); if (!p) return false; const b = p.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + 20); return !!e && p.contains(e); }), 'phone: ✏️ Fix opens the due editor above the panel');
  await q.keyboard.press('Escape'); await sleep(400);
  await q.evaluate(() => history.back()); await sleep(1200);
  ok(!(await q.evaluate(() => { const pn = document.querySelector('.lx-pane'); return pn && pn.getClientRects().length; })), 'phone Back closes the panel');
  ok(await q.evaluate(() => { const r = document.querySelector('#gc-ldi .lx-row'); if (!r) return false; const b = r.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 20)); return !!e && r.contains(e); }), '… and only the panel: the Lead Inbox list is still there');
  const cover = await q.evaluate(id => { const r = document.querySelector(`#gc-ldi .lx-row[data-id="${id}"]`); if (!r) return 'no row'; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); const path = []; for (let x = e; x && path.length < 8; x = x.parentElement) path.push(x.tagName + (x.id ? '#' + x.id : '') + (x.className && typeof x.className === 'string' ? '.' + x.className.split(' ')[0] : '')); return r.contains(e) ? '' : path.join(' < ') + ' state=' + JSON.stringify(history.state) + ' @' + Math.round(b.top) + ' view ' + (window._setView && document.title); }, firstId);
  if (cover) { console.log('    (after Back the row is covered by: ' + cover + ')'); if (process.env.GC_DBG_SHOT) await q.screenshot({ path: process.env.GC_DBG_SHOT }); }
  await q.locator(`#gc-ldi .lx-row[data-id="${firstId}"]`).tap({ timeout: 8000 }); await sleep(500);
  await q.locator('#gc-ldi-ph .lx-pane .px-back').tap({ timeout: 8000 }); await sleep(500);
  ok(!(await q.evaluate(() => !!document.querySelector('.lx-pane'))), '‹ Back closes it');
  const LTm = (await ltSince(q, q0)).filter(x => x.d > 200);
  ok(!LTm.length, 'phone: no long task over 200 ms while working the list', LTm);
  ok(!m.errs.length, 'phone: no page errors', m.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
