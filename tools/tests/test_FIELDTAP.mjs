// test_FIELDTAP.mjs <build-dir> — GrayCo Field on an iPhone (390x844, touch): the whole job card opens the job (the
// sub-line, the empty right edge), the card's own buttons (📸 Photos, 👤 Customer portal) keep their action and do not
// open the job; Find a job rows, Field Documents rows and To-Do rows are whole-row taps of at least 44 px.
// Usage: node test_FIELDTAP.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDTAP.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const sleep = H.sleep;
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/fieldmore/';
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550100' }]);
H.cset('projects', [
  { id: 'P1', po: 'PO-1001', name: 'ROTC Cordova', client: 'A & B Construction Co., Inc.', address: 'Somerville TN', pm: 'Demo Owner', status: 'active', contract: 25000, contractSigned: true, updatedAt: ago(1) },
  { id: 'P2', name: 'Fire claim- Jackson', client: 'Mid south Restoration', address: '89 comanche trail', pm: 'Demo Owner', status: 'on_hold', contractSigned: true, updatedAt: ago(2) }]);
H.cset('projectDocs', [{ id: 'D1', pid: 'P1', name: 'Signed contract.pdf', cat: 'Contracts', type: 'application/pdf', ref: 'sb:crm-files/' + '1'.repeat(64) + '.pdf', uploadedAt: ago(3) }]);
H.cset('gc_office_tasks', [{ id: 'T1', text: 'Call the inspector about ROTC', done: false, createdAt: ago(1), assignee: 'Demo Owner', pid: 'P1' }]);
const W = [];
try {
  const O = await H.computer('OWN', { build, mobile: true }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await H.waitFor(O, () => !!document.querySelector('#_gcJobPick.gc-fh .fh-job[data-job="P1"]'), null, 40000)), 'the phone opens GrayCo Field with the job cards');
  const pg = O.page();
  const reset = async () => { await O.ev(() => { document.querySelectorAll('#_gcJobDash,._gcSheetOv,.gcfp-sheet,#gcuOv').forEach(o => o.remove()); try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {} if (!document.querySelector('#_gcJobPick.gc-fh')) window._gcField.open(); }); await H.waitFor(O, () => !!document.querySelector('#_gcJobPick.gc-fh .fh-job[data-job="P1"]'), null, 15000); await sleep(400); };
  const card = () => pg.locator('#_gcJobPick.gc-fh .fh-job[data-job="P1"]').first();
  const opened = () => O.ev(() => !!document.getElementById('_gcJobDash') && (window._gcCurrentJob || {}).id === 'P1');
  // the card's look
  const cs = await O.ev(() => { const c = document.querySelector('#_gcJobPick.gc-fh .fh-job[data-job="P1"]'); const r = c.getBoundingClientRect(); return { cur: getComputedStyle(c).cursor, h: r.height }; });
  ok(cs.cur === 'pointer' && cs.h >= 44, 'the job card: cursor pointer, at least 44 px tall', cs);
  await pg.screenshot({ path: SHOTS + 'fieldtap_home.png' });
  // 1. the sub-line
  await card().locator('.fh-a').tap(); await sleep(1200);
  ok(await opened(), 'tap the card\'s sub-line ("Somerville TN · A & B …") → the job opens');
  await reset();
  // 2. the empty right edge (next to the title)
  const bb = await card().boundingBox();
  await pg.touchscreen.tap(bb.x + bb.width - 10, bb.y + 22); await sleep(1200);
  ok(await opened(), 'tap the card\'s empty right edge → the job opens');
  await reset();
  // 3. the title still opens it
  await card().locator('.fh-n').tap(); await sleep(1200);
  ok(await opened(), 'tap the bold title → the job opens (as before)');
  await reset();
  // 4. 📸 Photos: GrayCo Photos, not the job page
  await card().locator('[data-fa="fp-photos"]').tap(); await sleep(1500);
  const ph = await O.ev(() => ({ dash: !!document.getElementById('_gcJobDash'), photos: !!(window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) }));
  ok(!ph.dash && ph.photos, 'tap 📸 Photos → GrayCo Photos opens, the job page does not', ph);
  await reset();
  // 5. 👤 Customer portal: its own sheet, not the job page
  const cp = card().locator('[data-fa="fp-cust"]');
  if (await cp.count()) { await cp.tap(); await sleep(1200); const r = await O.ev(() => ({ dash: !!document.getElementById('_gcJobDash'), sheet: !!document.querySelector('.gcfp-sheet') })); ok(!r.dash && r.sheet, 'tap 👤 Customer portal → its own sheet, the job page does not open', r); await reset(); }
  // 6. the gap between the four buttons: nothing opens
  const g = await O.ev(() => { const row = document.querySelector('#_gcJobPick.gc-fh .fh-job[data-job="P1"] .fp-row'); const b = row.children; const r1 = b[0].getBoundingClientRect(), r2 = b[1].getBoundingClientRect(); return { x: (r1.right + r2.left) / 2, y: r1.top + r1.height / 2, gap: r2.left - r1.right }; });
  if (g.gap > 1) { await pg.touchscreen.tap(g.x, g.y); await sleep(900); ok(!(await opened()), 'a tap in the gap between the buttons does not open the job'); await reset(); }
  // pressed state
  const pr = await O.ev(async () => { const c = document.querySelector('#_gcJobPick.gc-fh .fh-job[data-job="P1"]'), a = c.querySelector('.fh-a'); a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise(r => setTimeout(r, 300)); const on = c.classList.contains('fh-press'); const bg = getComputedStyle(c).backgroundColor; a.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); return { on, bg, after: c.classList.contains('fh-press') }; });
  ok(pr.on && pr.bg !== 'rgb(255, 255, 255)' && !pr.after, 'the card shows a pressed state while it is held (and lets go)', pr);
  // Find a job rows: whole buttons ≥ 44 px
  await O.ev(() => { window.__gcFhAll = true; window._gcJobPicker(); }); await H.waitFor(O, () => !!document.querySelector('#_gcJobPick ._jpItem'), null, 15000);
  const fj = await O.ev(() => [...document.querySelectorAll('#_gcJobPick ._jpItem')].map(b => ({ tag: b.tagName, h: b.getBoundingClientRect().height })));
  ok(fj.length >= 2 && fj.every(x => x.tag === 'BUTTON' && x.h >= 44), 'Find a job / Jobs list: every row is one button, ≥ 44 px', fj);
  await pg.locator('#_gcJobPick ._jpItem[data-id="P1"] div').nth(1).tap(); await sleep(1200);
  ok(await opened(), 'Find a job: tap the row\'s second line → the job opens');
  // Documents rows
  await O.ev(() => { document.querySelectorAll('._gcSheetOv').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1000);
  await pg.locator('#_gcJobDash ._jdAct[data-fn="docs"]').first().evaluate(e => e.click());
  await H.waitFor(O, () => !!document.querySelector('.gcfp-docs .gcfp-doc'), null, 15000);
  const dr = await O.ev(() => [...document.querySelectorAll('.gcfp-docs .gcfp-doc')].map(b => ({ tag: b.tagName, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })));
  ok(dr.length && dr.every(x => (x.tag === 'BUTTON' || x.tag === 'A') && x.h >= 44 && x.w > 300), 'Documents: every row is one full-width button / link, ≥ 44 px', dr);
  await O.ev(() => document.querySelectorAll('._gcSheetOv,#_gcJobDash').forEach(o => o.remove()));
  // To-Do rows
  await O.ev(() => window._gcTD2 && window._gcTD2.openField()); await H.waitFor(O, () => !!document.querySelector('#_gcTD2Ov .td2-row[data-k]'), null, 15000); await sleep(600);
  const tr = await O.ev(() => [...document.querySelectorAll('#_gcTD2Ov .td2-row[data-k]')].slice(0, 8).map(r => ({ h: r.getBoundingClientRect().height, cur: getComputedStyle(r).cursor })));
  ok(tr.length && tr.every(x => x.h >= 44 && x.cur === 'pointer'), 'To-Do rows: ≥ 44 px, the whole row is tappable', tr);
  const todo = await O.ev(() => {
    const r = [...document.querySelectorAll('#_gcTD2Ov .td2-row[data-k]')].find(x => /inspector about ROTC/.test(x.textContent)); if (!r) return { none: true, rows: [...document.querySelectorAll('#_gcTD2Ov .td2-row')].map(x => x.textContent.slice(0, 40)) };
    (r.querySelector('.td2-dot') || r).click(); return { k: r.getAttribute('data-k') };
  });
  await sleep(1500);
  todo.changed = await O.ev(() => !document.getElementById('_gcTD2Ov') || !!document.getElementById('_gcJobDash') || !!document.querySelector('.gc-jd,.gcjd,main'));
  todo.ov = await O.ev(() => !!document.getElementById('_gcTD2Ov'));
  ok(todo.changed, 'To-Do: a tap on the row (not the title) opens the to-do', todo);
  // FIELDTAP2: one money tile; the full money page from it; no floating ⚙ on the job page
  await O.ev(() => { document.querySelectorAll('#_gcTD2Ov,._gcSheetOv,.gcfp-sheet,#_gcJobDash').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1200);
  const jt = await O.ev(() => ({ jobfin: !!document.querySelector('#_gcJobDash ._jdAct[data-fn="jobfin"]'), money: !!document.querySelector('#_gcJobDash .gcfp-t[data-fp="money"]'),
    tiles: [...document.querySelectorAll('#_gcJobDash .gcfp-grid > button')].map(b => b.textContent.trim()), gear: (() => { const g = document.getElementById('gc-br-settings'); return g ? getComputedStyle(g).display : 'none'; })() }));
  ok(!jt.jobfin && jt.money && jt.tiles.filter(x => /Financials/.test(x)).length === 1, 'job page: one money tile (💰 Financials, Invoices & COs); 💰 Job Financials is gone', jt.tiles);
  ok(jt.gear === 'none', 'job page: the desk\'s floating ⚙ CRM Settings is not over the Field tiles', jt.gear);
  await pg.locator('#_gcJobDash .gcfp-t[data-fp="money"]').first().evaluate(b => b.click()); await sleep(900);
  const full = await O.ev(() => !!document.querySelector('.gcfp-sheet [data-g="full"]'));
  ok(full, 'Financials, Invoices & COs has "💰 The job\'s full money page" (what Job Financials opened)');
  if (full) {
    await O.ev(() => { window.__fmJF = 0; const f = window._gcJobFinancials; window._gcJobFinancials = function(){ window.__fmJF++; return f.apply(this, arguments); }; document.querySelector('.gcfp-sheet [data-g="full"]').click(); }); await sleep(900);
    const jf = await O.ev(() => ({ n: window.__fmJF, body: document.body.innerText.slice(-1500) }));
    ok(jf.n === 1, 'tapping it opens the job\'s full money page (_gcJobFinancials)', jf.n);
  }
  await pg.screenshot({ path: SHOTS + 'fieldtap2_job.png' });
  ok(!O.errs.length, 'no page errors', O.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const c of W) await c.b.close().catch(() => {});
console.log(`FIELDTAP ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
