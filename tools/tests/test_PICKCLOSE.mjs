// test_PICKCLOSE.mjs <build> — every searchable job dropdown closes after typing "600": on a click on the header nav, a switch
// to ◫ Projects, Escape and a click outside; it is never left on the page, and picking a job still works.
// Needs the scratch harness S/wN/harness_N.mjs (playwright from S/node_modules) and S/GrayCo_CLEAN_DATA_2026-10-16.json.
const S0 = process.env.GC_SCRATCH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS, cset } = await import(S0 + '/wN/harness_N.mjs');
const build = process.argv[2], email = 'wjohnson@grayco-cs.com';
resetCloud(); const bk = seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
/* an unsorted text (Messages) and an expense with no job (Expenses to Approve / To Match) */
cset('gc_job_messages', JSON.stringify([{ id: 'm-pc-1', pid: '', text: 'Can you come look at the porch?', authorName: 'Texter', at: '2026-10-29T15:00:00Z', dir: 'in', smsFrom: '6015550123' }]));
{ const idb = bk.idb || bk.data || bk; const ex = (Array.isArray(idb.expenses) ? idb.expenses : []).concat([{ id: 'EXP-PC-1', amt: 123.45, amount: 123.45, payee: 'Lowes', description: 'PICKCLOSE lumber', category: 'Materials', date: '2026-10-29', createdAt: '2026-10-29T12:00:00Z' }]); cset('expenses', ex); }
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
const c = await computer('PC', { build }); const p = c.page(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 120000, 300); await sleep(6000);

const pickers = () => p.evaluate(() => [...document.querySelectorAll('#_gcOnePicker,._gcSelPop')].filter(e => e.isConnected && getComputedStyle(e).display !== 'none').map(e => (e.querySelector('input') || {}).value || ''));
const clean = () => p.evaluate(() => { document.querySelectorAll('._gcSheetOv,.gc-aip-pick,#gc-dl-overlay').forEach(e => e.remove()); try { window.gcDocLib && window.gcDocLib.close && window.gcDocLib.close(); } catch (e) {} });
/* each place that opens a searchable job list: how to get there, and its <select> */
const PLACES = [
  { name: 'Messages — "Unsorted — pick a job"', sel: 'select[data-qa-pick]', go: async () => { await p.evaluate(() => window._setView('messages')); await sleep(2500); } },
  { name: 'Expenses to Approve — "Charge this expense to job"', sel: 'select._eaJobSel', go: async () => { await p.evaluate(() => { window._setView('dashboard'); window._gcOpenExpenseApprovals(); }); await sleep(1500); } },
  { name: 'To Match — "No job matched — charge this expense to job"', sel: 'select.gc-aip-sel', go: async () => { await p.evaluate(() => { window._setView('dashboard'); window._gcOpenExpenseApprovals(); const b = document.querySelector('._eaApprove[data-id="EXP-PC-1"]') || document.querySelector('._eaApprove'); if (b && window._gcExpApproveHere) window._gcExpApproveHere(b.getAttribute('data-id'), b); }); await sleep(1200); } },
  { name: 'Document library — job', sel: 'select.gc-dl-job-sel', go: async () => { await p.evaluate(() => { window._setView('dashboard'); window.gcDocLib.open(''); }); await sleep(1800); } },
];
async function openAndType(pl){
  if ((await pickers()).length) { await p.keyboard.press('Escape'); await sleep(200); }
  await clean(); await pl.go();
  const loc = p.locator(pl.sel).filter({ visible: true }).first();
  if (!(await loc.count())) return false;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click(); await sleep(350);
  await p.keyboard.type('600', { delay: 30 }); await sleep(300);
  const pk = await pickers();
  return pk.length === 1 && pk[0] === '600';
}
async function navBtn(re){ return p.evaluate(src => { const re = new RegExp(src); const b = [...document.querySelectorAll('nav button, header button, nav a, header a')].filter(x => x.offsetParent).find(x => re.test((x.innerText || '').replace(/\s+/g, ' '))); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, re.source); }
const CLOSERS = [
  ['a click on the header nav (Dashboard)', async () => { const b = await navBtn(/Dashboard/); if (b) await p.mouse.click(b.x, b.y); }],
  ['a switch to ◫ Projects (nav)', async () => { const b = await navBtn(/◫ Projects/); if (b) await p.mouse.click(b.x, b.y); }],
  ['a switch of screen by _setView (no click)', async () => { const r = await p.evaluate(() => { const a = localStorage.getItem('grayco_view'), to = a === 'projects' ? 'dashboard' : 'projects'; window._setView(to); return a + ' → ' + to + ' = ' + localStorage.getItem('grayco_view'); }); console.log('    (' + r + ')'); }, 900],   /* no click: noticed from the page changing (the browser's own MutationObserver) */
  ['Escape', async () => { await p.keyboard.press('Escape'); }],
  ['a click outside', async () => { await p.mouse.click(5, 895); }],
];
for (const pl of PLACES) {
  console.log('• ' + pl.name);
  const o = await openAndType(pl); ok(o, 'the searchable list opens with "600" typed');
  if (!o) continue;
  for (const [what, act, wait] of CLOSERS) {
    if (!(await openAndType(pl))) { ok(false, 'reopen before ' + what); continue; }
    await act(); await sleep(wait || 700);
    const left = await pickers(); ok(left.length === 0, 'gone after ' + what + (left.length ? ' (still: ' + JSON.stringify(left) + ' ' + await p.evaluate(() => [...document.querySelectorAll('#_gcOnePicker,._gcSelPop')].map(e => e.id + '/' + e.className).join() + ' view=' + localStorage.getItem('grayco_view')) + ')' : ''));
    await sleep(500); ok((await pickers()).length === 0, '… and it stays gone');
  }
  /* picking still works: type 600, pick the first match */
  await openAndType(pl);
  const want = await p.evaluate(() => { const pk = document.getElementById('_gcOnePicker'); const row = pk && [...pk.querySelectorAll('div')].find(d => d._pick); return row ? row._pick.value : null; });
  const row = p.locator('#_gcOnePicker div').filter({ hasText: '600' }).last();
  await row.click(); await sleep(600);
  const got = await p.evaluate(s => { const el = [...document.querySelectorAll(s)].find(x => x.offsetParent); return el ? el.value : null; }, pl.sel);
  ok(!!want && got === want, 'picking a "600" job sets the select (' + got + ')');
  ok((await pickers()).length === 0, 'the list is gone after the pick');
  await p.mouse.click(5, 895); await sleep(300);
}
/* the general picker on a long select that is not a job list closes on a scroll that takes the select off the screen */
await clean(); await p.evaluate(() => window._setView('messages')); await sleep(1500);
if (await openAndType(PLACES[0])) { await p.evaluate(() => { const s = document.querySelector('select[data-qa-pick]'); let n = s.parentElement; while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) break; n = n.parentElement; } (n && n !== document.body ? n : document.scrollingElement).scrollBy(0, 5000); window.scrollBy(0, 5000); }); await sleep(800);
  const off = await p.evaluate(() => { const s = document.querySelector('select[data-qa-pick]'); const r = s.getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight; });
  if (off) ok((await pickers()).length === 0, 'gone once its select is scrolled off the screen'); else console.log('  (select could not be scrolled off — skipped)'); }
ok(!errs.filter(e => !/Quota/.test(e)).length, 'no page errors (' + errs.slice(0, 2).join(' | ') + ')');
console.log(`PICKCLOSE ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
