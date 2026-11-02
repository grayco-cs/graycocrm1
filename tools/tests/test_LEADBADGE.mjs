// test_LEADBADGE.mjs <build-dir> — patch LEADBADGE (owner 11/01: the menu said "Leads 41", the Leads page's boxes
//   "0 Needs assigning · 5 Due in 7 days · 29 Not contacted": "should left tab be going down when this does").
//   On the read-only real-data mirror (MIRROR=<gc_kv mirror .json>; read at run time, never written, never committed) +
//   three made-up leads, as the owner (admin):
//     * the Leads menu shows ONE number = Needs assigning ∪ Not contacted (a lead in both once) = the page's boxes;
//       its hover says "N not contacted · M need(s) assigning";
//     * ✅ Contacted on a lead (Leads → Board) drops it by one at once; assigning an inbox lead (Lead Inbox panel →
//       Assign) drops it by one; Not interested on an inbox lead drops it by one — no reload;
//     * the other menu numbers match their pages: Approvals (the Approvals page's own count), Accounting (the
//       "to match / review" count of its page), and none of them is left stale after the item is handled;
//     * no page errors.
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs). Browser tests: one at a time.
import fs from 'fs';
import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset, cget } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2], MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
if (!build || !fs.existsSync(MIRROR)) { console.error('usage: MIRROR=<mirror .json> node test_LEADBADGE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

resetCloud();
for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cset(r.key, r.value !== undefined ? r.value : r.v);
const nowIso = new Date().toISOString(), soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) + 'T10:00';
const T = (id, o) => Object.assign({ id, stage: 'New Lead', createdAt: nowIso, updatedAt: nowIso, savedAt: nowIso, leadKind: 'Commercial', type: 'Commercial Reno', city: 'Memphis', state: 'TN', bidDue: soon }, o);
const extra = [
  T('LBADGE-NC', { name: 'Badge test — assigned, not contacted', estimator: 'Glenn Miller', source: 'Phone' }),
  T('LEADIN-badgeA', { name: 'Badge test — inbox, contacted, nobody on it', inboxId: 'LI-badgeA', inboxState: 'new', source: 'BuildingConnected', contactedAt: nowIso, createdBy: 'Lead Inbox', gc: 'Test GC A' }),
  T('LEADIN-badgeD', { name: 'Badge test — inbox to dismiss', inboxId: 'LI-badgeD', inboxState: 'new', source: 'PlanHub', createdBy: 'Lead Inbox', gc: 'Test GC D' }),
];
cset('leads', extra.concat(cget('leads') || []));

const c = await computer('LB', { build }); const p = c.page();
await p.setViewportSize({ width: 1440, height: 900 });
await c.ctx.route(/\/\.netlify\/functions\/bid-inbox/, r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().method() === 'POST' ? '{"ok":true}' : JSON.stringify({ items: [], settings: {}, notices: [], portal: { ready: true }, me: { email: 'wjohnson@grayco-cs.com', admin: true }, at: nowIso }) }));
await c.ctx.addInitScript(() => { try { localStorage.setItem('gc_ldi_ui_v1', JSON.stringify({ show: 'open', open: true })); } catch (e) {} });
const email = 'wjohnson@grayco-cs.com';
const badge = () => p.evaluate(() => {
  const nav = [...document.querySelectorAll('aside nav button, nav button, aside button, [role=navigation] button')].filter(b => /^Leads$/.test(b.textContent.replace(/(\s*\d+\+?)+$/, '').replace(/^[^A-Za-z]+/, '').trim()) && !b.closest('#gc-ldi'));
  const b = nav[0]; if (!b) return null;
  const nums = [...b.querySelectorAll('span')].filter(s => /^\s*\d+\+?\s*$/.test(s.textContent) && s.getClientRects().length);
  const nb = b.querySelector('.gcl-nb');
  return { n: nb ? +nb.textContent : 0, title: nb ? nb.title : '', count: nums.length, classes: nums.map(s => s.className), na: window._gcLeadsNeedAction ? window._gcLeadsNeedAction() : null };
});
const tiles = () => p.evaluate(() => { const g = k => { const e = document.querySelector(`[data-gclu-cnt="${k}"] b`); return e ? +e.textContent : null; }; return { un: g('un'), d7: g('d7'), nc: g('nc'), model: window._gcLeadsUI ? window._gcLeadsUI.model().cnt : null }; });
try {
  await p.goto('https://app.local/index.html'); await sleep(2500);
  await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click();
  await waitFor(c, () => (window._crm && window._crm.leads || []).length > 100, null, 150000, 500); await sleep(20000);
  await p.evaluate(() => window._setView('leads')); await sleep(5000);
  const B0 = await badge(), T0 = await tiles();
  console.log('    menu: ' + B0.n + ' "' + B0.title + '" · boxes: ' + JSON.stringify(T0));
  ok(B0 && B0.count === 1 && B0.classes[0] === 'gcl-nb', 'one number on the Leads menu (no second / third badge)', B0 && B0.classes);
  ok(T0.un != null && T0.nc != null && B0.na && B0.n === T0.un + T0.nc - B0.na.both && B0.na.un === T0.un && B0.na.nc === T0.nc, 'the menu number = Needs assigning ∪ Not contacted of the page\'s boxes (' + T0.un + ' + ' + T0.nc + ' − ' + (B0.na && B0.na.both) + ' in both = ' + B0.n + ')', { B0, T0 });
  ok(new RegExp('^' + T0.nc + ' not contacted · ' + T0.un + ' needs? assigning').test(B0.title), 'hover explains it: "' + B0.title + '"');
  ok(B0.na && ['LBADGE-NC', 'LEADIN-badgeA', 'LEADIN-badgeD'].every(id => B0.na.ids.includes(id)), 'the three test leads are counted', B0.na && B0.na.ids.filter(id => /badge/i.test(id)));
  /* ✅ Contacted (Leads → Board) */
  await p.locator('[data-gcl-v="board"]').first().click().catch(() => {}); await sleep(1500);
  await p.locator('.gclu-q').fill('Badge test — assigned'); await sleep(1500);
  const cb = p.locator('[data-gcl-contact="LBADGE-NC"]').first();
  ok(await cb.count() > 0, 'Board: the ✅ Contacted button on the test lead');
  if (await cb.count()) {
    const n0 = (await badge()).n; await cb.click();
    const n1 = await waitFor(c, n0 => { const v = window._gcLeadsNeedAction(); const b = document.querySelector('.gcl-nb'); return b && +b.textContent === n0 - 1 ? v.n : null; }, n0, 4000, 200);
    ok(n1 === n0 - 1, '✅ Contacted drops the menu number by one at once (' + n0 + ' → ' + n1 + ')', { n0, now: (await badge()).n });
    const T1 = await tiles(); ok(T1.nc === T0.nc - 1, '… and the Not contacted box with it (' + T0.nc + ' → ' + T1.nc + ')', T1);
  }
  await p.locator('.gclu-q').fill(''); await sleep(500);
  /* assign an inbox lead from the Lead Inbox panel */
  await p.evaluate(() => document.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"]').click()); await sleep(2500);
  const nA = (await badge()).n;
  await p.locator('#gc-ldi .lx-row[data-id="LEADIN-badgeA"]').click(); await sleep(500);
  await p.locator('#gc-ldi .lx-pane [data-a="assign"]').click(); await sleep(500);
  await p.evaluate(() => { const s = document.querySelector('#ldi-pm'); const o = [...s.options].find(o => o.value); s.value = o.value; });
  await p.locator('.gc-ldi-dlg .df button.pri').click();
  const nA1 = await waitFor(c, n0 => { const b = document.querySelector('.gcl-nb'); return b && +b.textContent === n0 - 1 ? n0 - 1 : null; }, nA, 3000, 200);
  ok(nA1 === nA - 1, 'assigning a lead (Lead Inbox → Assign) drops the menu number by one at once (' + nA + ' → ' + (await badge()).n + ')');
  /* Not interested on an inbox lead */
  const nD = (await badge()).n;
  await p.locator('#gc-ldi .lx-row[data-id="LEADIN-badgeD"]').click(); await sleep(500);
  await p.locator('#gc-ldi .lx-pane [data-a="dismiss"]').click(); await sleep(400); await p.locator('.gc-ldi-dlg .df button.pri').click();
  const nD1 = await waitFor(c, n0 => { const b = document.querySelector('.gcl-nb'); return b && +b.textContent === n0 - 1 ? n0 - 1 : null; }, nD, 3000, 200);
  ok(nD1 === nD - 1, 'Not interested on an inbox lead drops it by one at once (' + nD + ' → ' + (await badge()).n + ')');
  /* the Lead Inbox keeps its own count on its tab only */
  const tabN = await waitFor(c, () => { const t = document.querySelector('#gc-leads-tabs [data-gc-tab="bidboard"] .gcls-badge'); const n = t ? +t.textContent : 0; return n === window._gcLeadInbox.count() ? String(n) : null; }, null, 5000, 250);
  ok(tabN != null, 'the Lead Inbox tab keeps its own new count (' + tabN + ')');
  /* ═══ To-Do: one number, only what has no tab of its own ═══ */
  const navNums = label => p.evaluate(label => { const re = new RegExp('^' + label + '$', 'i');
    const b = [...document.querySelectorAll('aside nav button, nav button, aside button, [role=navigation] button')].find(x => re.test(x.textContent.replace(/(\s*\d+\+?)+$/, '').replace(/^[^A-Za-z]+/, '').trim()) && !x.closest('#gc-ldi'));
    if (!b) return null; const nums = [...b.querySelectorAll('span')].filter(x => /^\s*\d+\+?\s*$/.test(x.textContent) && x.getClientRects().length);
    return nums.map(x => ({ cls: x.className || x.id, n: +x.textContent || +(x.getAttribute('data-n') || 0), title: x.title || '' })).concat([...b.querySelectorAll('[data-n]')].filter(x => x.getClientRects().length).map(x => ({ cls: x.id || x.className, n: +x.getAttribute('data-n'), title: x.title || '' }))); }, label);
  await p.evaluate(() => window._setView('todo')); await sleep(6000);
  let TD = await navNums('To-?Do');
  const pg = await p.evaluate(() => { const e = document.querySelector('[data-td2-count]'); const c = window._gcTD2.counts(); const st = window._gcTD2.state();
    return { page: e ? +e.getAttribute('data-td2-count') : null, title: e ? e.title : '', c: { todos: c.todos, leadRows: c.leadRows, msgRows: c.msgRows, appr: c.appr, old30: c.old30, byDue: c.byDue }, leadsOnPage: st.items.filter(g => g.cat === 'leads').length }; });
  console.log('    To-Do: menu ' + JSON.stringify(TD) + ' · page ' + JSON.stringify(pg));
  ok(TD && TD.length === 1 && TD[0].cls === 'gc-td-nb', 'To-Do shows ONE number (the yellow Lead Inbox count is gone)', TD);
  ok(TD && TD[0] && TD[0].n === pg.page && pg.page === pg.c.todos, 'the To-Do number = the number on the To-Do page (' + pg.page + ')', { TD, pg });
  ok(TD && TD[0] && /to-dos?/.test(TD[0].title) && /approvals are on Approvals/.test(TD[0].title) && (!pg.c.leadRows || /on Leads/.test(TD[0].title)), 'its hover breaks it down: "' + (TD && TD[0] && TD[0].title) + '"');
  ok(pg.c.leadRows >= 0 && pg.leadsOnPage >= pg.c.leadRows, 'lead & bid lines stay on the page but are not counted (' + pg.c.leadRows + ')', pg);
  /* live: a new to-do adds one, ticking it off takes it away */
  const n0 = TD[0].n;
  await p.locator('.td2-qin').first().fill('LEADBADGE test to-do — call the roofer'); await p.locator('.td2-add').first().click();
  const up = await waitFor(c, n0 => { const b = document.querySelector('.gc-td-nb'); return b && +b.textContent === n0 + 1 ? n0 + 1 : null; }, n0, 6000, 250);
  ok(up === n0 + 1, 'adding a to-do raises the To-Do number at once (' + n0 + ' → ' + up + ')');
  const key = await p.evaluate(() => { const x = window._gcTD2.state().items.find(g => /LEADBADGE test to-do/.test(g.title)); return x && x.key; });
  await p.evaluate(k => window._gcTD2.complete(k, true), key);
  const dn = await waitFor(c, n0 => { const b = document.querySelector('.gc-td-nb'); return b && +b.textContent === n0 ? n0 : null; }, n0, 6000, 250);
  ok(dn === n0, 'ticking it off takes it away at once (' + up + ' → ' + dn + ')');
  /* ═══ Approvals and Accounting: the menu number = the page, with a breakdown ═══ */
  const AP = await navNums('Approvals'), apN = await p.evaluate(() => Math.max(0, (window._gcApprovalCount ? window._gcApprovalCount() : 0) - (window._gcApprovalPending ? window._gcApprovalPending() : 0)));
  ok((!AP || !AP.length) ? apN === 0 : AP.length === 1 && AP[0].n === apN && (!apN || /waiting on you: /.test(AP[0].title)), 'Approvals: one number = the Approvals set (' + apN + '), hover "' + (AP && AP[0] && AP[0].title) + '"', AP);
  const RA = await p.evaluate(() => { const b = document.getElementById('gc-ra-badge'); return b && b.getClientRects().length ? { n: +b.textContent, title: b.title } : null; });
  ok(!RA || (RA.n === apN && /waiting on you/.test(RA.title)), 'the role bar\'s ✅ Approvals number = the menu\'s, with the same hover', RA);
  const AC = await navNums('Accounting'), acN = await p.evaluate(() => { try { return window._gcAcctMatchTotal ? window._gcAcctMatchTotal() : null; } catch (e) { return null; } });
  ok(!AC || !AC.length || (AC.length === 1 && /to match \/ review in Accounting/.test(AC[0].title) && (acN == null || AC[0].n === acN)), 'Accounting: one number, hover "' + (AC && AC[0] && AC[0].title) + '"', { AC, acN });
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
