// test_DIAMOND.mjs <build-dir> — patch DIAMOND (owner 11/28): the 💎 menu cleaned up.
//   For an admin, the office and a PM (offline harness, made-up people and jobs, nothing leaves this computer):
//   1. the 💎 opens; every removed item is gone (the CompanyCam imports, the red recovery / test tools, the duplicates, Clean up
//      the job list, Email Queue, Project Hubs, Backup & Restore (exact), Data / System Health Check); 📷 New in CompanyCam and
//      the CompanyCam manager are still there; Daily Backups is still there;
//   2. the "Shortcuts" group sits before Daily Work, with the shortcuts each role may use — admin / office: all six; PM:
//      👤 Customer portals and ✉ Customer e-mails & texts only; none for Sales & spam, deleted leads, lead settings or taxes;
//   3. each shortcut is clicked with the mouse and opens its screen (Customer portals tab, the customer e-mail / text approval
//      list, the Bid portal tab, ⚙ Admin → CRM health / Cloud saves / Duplicates) and the menu closes;
//   4. ⚙ Admin → CRM health shows 🩺 Job health (opens ⚙ Admin → Job health), 📋 Data health and 🖥 System check (they open);
//      ⚙ Admin → Data has no "Make the cloud the truth";
//   5. the job page: "📸 Open in GrayCo Photos" is there, "Every photo of this job" is not;
//   6. the test-data purge with nothing to remove writes nothing to the cloud; with one test row it pushes only that list;
//   7. no page errors.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_DIAMOND.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const sleep = H.sleep;
const mail = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ago = d => new Date(Date.now() - d * 864e5).toISOString();

const GONE = ['Import CompanyCam Jobs', 'Re-import ALL CompanyCam jobs', 'Map CompanyCam → PM (lead credit)', 'Email Queue', 'Project Hubs', 'Clean up the job list',
  'Recover My Data', 'Deep Scan Recovery', 'Recover Deleted Jobs', 'Restore Schedule (this device)', 'UN-HIDE All Estimates', 'Merge Duplicate Jobs', 'Recover Approvals',
  'Test the CRM', 'Purge Test Data', 'Force-Clean Cloud', 'Download Schedule PDF', 'Restore from Backup', 'Download Backup', 'Download Full Backup (all data)',
  'Backup & Restore (exact)', 'Delete Job by PO/Title', 'Duplicates', 'Duplicate check', 'P&L by Job', 'Business Brain (issues)', 'Contract & Doc Templates',
  'Remove Duplicates', 'Data Health Check (read-only)', 'System Health Check'];
const GONE_IDS = ['#gc-clean-hub', '#gc-emailq-hub-link', '#gc-hub-projhub-link', '#gc-backup-hub-link'];
const NOT_ADDED = /sales\s*&\s*spam|recently deleted|deleted leads|lead settings|tax deadline/i;
const SC = { portals: '#gc-dm-portals', mail: '#gc-dm-custmail', bid: '#gc-dm-bidportal', health: '#gc-dm-crmhealth', syncq: '#gc-dm-syncq', dedupe: '#gc-dm-dedupe' };

function world(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: mail('u-wesley'), role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Nick Gray', email: mail('u-nick'), role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Office Demo', email: mail('u-office'), role: 'Office Admin', active: true },
    { id: 'u4', name: 'Demo PM', email: mail('u-pm'), role: 'Project Manager', active: true }]);
  H.cset('projects', [
    { id: 'P1', po: 'PO-1001', name: 'Demo Roof Job', client: 'Demo Client A', address: '1 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'Active', contract: 18000, contractSigned: true, createdAt: ago(20), updatedAt: ago(1) },
    { id: 'P2', po: 'PO-1002', name: 'Demo Kitchen', client: 'Demo Client B', address: '2 Demo St', type: 'Remodel', pm: 'Wesley Johnson', status: 'Active', contract: 42000, createdAt: ago(30), updatedAt: ago(2) },
    { id: 'P3', po: 'PO-1003', name: 'Demo Done Job', client: 'Demo Client C', address: '3 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'completed', contract: 9000, createdAt: ago(90), updatedAt: ago(40) }]);
  H.cset('leads', [{ id: 'L1', name: 'Demo Lead', phone: '9015550101', stage: 'New Lead', status: 'new', pm: 'Demo PM', source: 'Website', createdAt: ago(1), updatedAt: ago(1) }]);
  H.cset('customers', [{ id: 'C1', name: 'Demo Client A', phone: '9015550111' }]);
}

async function boot(who, acct, access){
  const A = await H.computer(who, { build, viewport: { width: 1440, height: 900 } });
  if (access) await A.ctx.route(u => /\/rest\/v1\/rpc\/gc_my_access/.test(String(u.href || u)), r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(Object.assign({ sec2: true, admin: false, payroll: false, office: false }, access)) }));
  A.acceptConfirm = false;                                     /* every "are you sure?" is answered Cancel */
  A.ctx.on('page', p => { p.close().catch(() => {}); });
  const signed = await H.signIn(A, mail(acct), 20000);
  await H.waitFor(A, () => !!(window._crm && (window._crm.projects || []).length >= 3 && document.getElementById('gc-hub-btn') && window._gcToggleHub && window._gcDiamond), null, 90000);
  await sleep(9000);
  await A.ev(() => { try { window._gcRA && window._gcRA.hide && window._gcRA.hide(); } catch (e) {} try { window._setView && window._setView('dashboard'); } catch (e) {} });
  await sleep(1200);
  ok(signed, who + ': signed in');
  return A;
}
const panel = A => A.ev(() => { const p = [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop(); return !!p; });
async function openHub(A){
  await A.ev(() => { if (window._gcCloseHub) window._gcCloseHub(); });
  const vis = await A.ev(() => { const b = document.getElementById('gc-hub-btn'); return !!(b && b.getClientRects().length && getComputedStyle(b).display !== 'none'); });
  if (vis) await A.page().locator('#gc-hub-btn').click({ timeout: 4000 }).catch(() => A.ev(() => document.getElementById('gc-hub-btn').click()));
  else await A.page().locator('#gc-topbar [data-tb="hub"]').click({ timeout: 4000 }).catch(() => A.ev(() => document.getElementById('gc-hub-btn').click()));
  await sleep(700);
  return panel(A);
}
const readHub = A => A.ev(() => {
  const p = [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop(); if (!p) return null;
  const items = [...p.querySelectorAll('.gc-hub-item')].map(e => ({ id: e.id || '', label: (e.getAttribute('data-label') || e.textContent).replace(/\s+/g, ' ').trim() }));
  const secs = [...p.querySelectorAll('.gc-hub-sec')].map(e => e.textContent.trim());
  const box = p.querySelector('#gc-dm-shortcuts'), daily = [...p.querySelectorAll('.gc-hub-sec')].find(e => e.textContent.trim() === 'Daily Work');
  return { items, secs, html: p.innerText, ids: [...p.querySelectorAll('[id]')].map(e => '#' + e.id),
    sc: box ? [...box.querySelectorAll('.gc-hub-item')].map(e => '#' + e.id) : null,
    before: !!(box && daily && (box.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING)) };
});

/* click one shortcut with the mouse and say what opened */
async function clickSc(A, sel){
  await openHub(A);
  await A.ev(() => { window.__dmV = localStorage.getItem('grayco_view'); });
  const loc = A.page().locator('.gc-hub-panel ' + sel).last();
  try { await loc.scrollIntoViewIfNeeded({ timeout: 3000 }); await loc.click({ timeout: 4000 }); } catch (e) { return { err: String(e.message).slice(0, 160) }; }
  await sleep(2500);
  return A.ev(() => ({ panel: [...document.querySelectorAll('.gc-hub-panel')].some(x => x.getClientRects().length), view: localStorage.getItem('grayco_view'),
    sec: (window._gcAdm && window._gcAdm.state().sec) || null, appr: !!document.getElementById('_gcApprOv'),
    cpx: !!document.getElementById('gc-cpx-mount') || /Customer portals/.test((document.querySelector('main') || document.body).innerText.slice(0, 3000)),
    bp: !!document.getElementById('gc-sys-bp-mount') }));
}
const reset = A => A.ev(() => { try { const o = document.getElementById('_gcApprOv'); if (o) o.remove(); } catch (e) {} try { window._gcAdm && window._gcAdm.back && window._gcAdm.back(); } catch (e) {} try { window._setView('dashboard'); } catch (e) {} });

async function run(who, acct, access, want){
  console.log('== ' + who);
  const A = await boot(who, acct, access);
  try {
    ok(await openHub(A), who + ': the 💎 menu opens');
    await sleep(1500);
    const h = await readHub(A);
    const labels = h.items.map(i => i.label);
    console.log('   ' + labels.length + ' items: ' + labels.join(' · '));
    const INJ = ['Email Queue', 'Project Hubs', 'Clean up the job list', 'Backup & Restore (exact)'];   /* no data-label: their text has the icon in front */
    const left = GONE.filter(l => labels.some(x => x === l || (INJ.indexOf(l) >= 0 && x.indexOf(l) >= 0)));
    ok(!left.length, who + ': every removed item is gone (' + GONE.length + ' labels)', left);
    ok(!GONE_IDS.some(k => h.ids.indexOf(k) >= 0), who + ': no Clean up the job list / Email Queue / Project Hubs / Backup & Restore (exact) element', GONE_IDS.filter(k => h.ids.indexOf(k) >= 0));
    ok(labels.indexOf('CompanyCam') >= 0 && labels.indexOf('Daily Backups') >= 0, who + ': the CompanyCam manager and Daily Backups are still there');
    const keys = Object.keys(SC).filter(k => want.indexOf(k) >= 0).map(k => SC[k]);
    ok(JSON.stringify(h.sc || []) === JSON.stringify(keys), who + ': Shortcuts = ' + want.join(', '), { got: h.sc, want: keys });
    if (keys.length) ok(h.before && h.secs[0] === 'Shortcuts', who + ': the Shortcuts group is above Daily Work', h.secs.slice(0, 3));
    ok(!labels.some(l => NOT_ADDED.test(l)), who + ': no Sales & spam / deleted leads / lead settings / tax deadlines item', labels.filter(l => NOT_ADDED.test(l)));
    const dupes = labels.filter((l, i) => labels.indexOf(l) !== i); ok(!dupes.length, who + ': no item twice', dupes);
    await A.ev(() => window._gcCloseHub && window._gcCloseHub());

    for (const k of want) {
      const r = await clickSc(A, SC[k]);
      const good = !r.err && !r.panel && (k === 'portals' ? r.view === 'custportals' && r.cpx : k === 'mail' ? r.appr : k === 'bid' ? r.view === 'bidportal' && r.bp
        : r.view === 'admin' && r.sec === { health: 'crmhealth', syncq: 'syncq', dedupe: 'dedupe' }[k]);
      ok(good, who + ': 💎 ' + SC[k] + ' opens its screen and the menu closes', r);
      if (k === 'health' && good) {
        await sleep(800);
        const st = await A.ev(() => { const s = document.getElementById('gc-dm-health'); return s ? [...s.querySelectorAll('[data-gcdm-h]')].map(b => b.textContent) : null; });
        ok(st && st.length === 3 && /Job health/.test(st[0]) && /Data health/.test(st[1]) && /System check/.test(st[2]), who + ': CRM health shows Job health, Data health and System check', st);
        await A.page().locator('#gc-dm-health [data-gcdm-h="data"]').click(); await sleep(1200);
        const dh = await A.ev(() => [...document.body.children].filter(e => e.getClientRects().length && /Data Health|data health/i.test((e.innerText || '').slice(0, 300)) && getComputedStyle(e).position === 'fixed').length);
        ok(dh > 0, who + ': 📋 Data health opens', dh);
        await A.page().keyboard.press('Escape'); await sleep(400);
        await A.ev(() => { [...document.body.children].forEach(e => { if (getComputedStyle(e).position === 'fixed' && /Data Health/i.test((e.innerText || '').slice(0, 300))) e.remove(); }); });
        if (!(await A.ev(() => !!document.getElementById('gc-dm-health')))) await A.ev(() => window._gcAdm.open('crmhealth'));
        await sleep(500);
        await A.page().locator('#gc-dm-health [data-gcdm-h="sys"]').click(); await sleep(800);
        ok(await A.ev(() => /System Health Check/.test(document.body.innerText)), who + ': 🖥 System check opens');
        await A.ev(() => { document.querySelectorAll('.gc-modal-bg').forEach(e => e.remove()); });
        await A.page().locator('#gc-dm-health [data-gcdm-h="job"]').click(); await sleep(900);
        ok(await A.ev(() => window._gcAdm.state().sec === 'health'), who + ': 🩺 Job health opens ⚙ Admin → Job health');
        const data = await A.ev(() => (window._gcAdm.sections().find(x => x.id === 'data') || { rows: [] }).rows.map(r => r.t));
        ok(data.length && !data.some(t => /cloud the truth/i.test(t)), who + ': ⚙ Admin → Data has no "Make the cloud the truth"', data);
      }
      await reset(A); await sleep(600);
    }

    /* the job page */
    await A.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(1200);
    await A.ev(() => window._navToJob && window._navToJob('P1'));
    const row = await H.waitFor(A, () => { const r = document.getElementById('_gcCCLinkRow'); return r ? r.innerText : null; }, null, 15000);
    ok(row && /Open in GrayCo Photos/.test(row) && !/Every photo of this job/.test(row), who + ': the job page has “Open in GrayCo Photos” without the caption', row);
    ok(!(await A.ev(() => document.body.innerText.indexOf('Every photo of this job') >= 0)), who + ': “Every photo of this job” is nowhere on the page');

    const errs = A.errs.filter(e => !/ResizeObserver/.test(e));
    ok(!errs.length, who + ': no page errors', errs.slice(0, 4));
    return A;
  } catch (e) { fail++; console.log('  ✗ FAIL ' + who + ' stopped: ' + (e && e.stack || e)); return A; }
}

try {
  world();
  const A = await run('admin', 'u-wesley', null, ['portals', 'mail', 'bid', 'health', 'syncq', 'dedupe']);
  /* the test-data purge writes only what it removed (run on this offline computer; nothing real) */
  const p = await A.ev(async () => {
    const W = []; const orig = window._supaUpsertNow; window._supaUpsertNow = function(k){ W.push(k); };
    const r0 = await window._gcPurgeTestData(); const n0 = W.length;
    try { const l = JSON.parse(localStorage.getItem('grayco_schedule') || '[]'); l.push({ id: '__TEST__sch_x', title: '__TEST__ row' }); localStorage.setItem('grayco_schedule', JSON.stringify(l)); } catch (e) {}
    const r1 = await window._gcPurgeTestData(); window._supaUpsertNow = orig;
    return { r0: r0.totalRemoved, n0, r1: r1.totalRemoved, w1: W.slice(n0) };
  });
  ok(p.r0 === 0 && p.n0 === 0, 'purge: nothing to remove → nothing written to the cloud', p);
  ok(p.r1 >= 1 && p.w1.join(',') === 'schedule', 'purge: one test row in the schedule → only the schedule goes up', p);
  await A.close();
  world();
  await (await run('office', 'u-office', { office: true, payroll: true }, ['portals', 'mail', 'bid', 'health', 'syncq', 'dedupe'])).close();
  world();
  await (await run('pm', 'u-pm', null, ['portals', 'mail'])).close();
} catch (e) { fail++; console.log('  ✗ FAIL the run stopped: ' + (e && e.stack || e)); }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
