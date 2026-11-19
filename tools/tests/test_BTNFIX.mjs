// test_BTNFIX.mjs <build-dir> — patch BTNFIX: the dead / broken buttons the QA button crawl found on the release candidate.
// Offline harness (GC_HARNESS), made-up data only; nothing live is read or written. Each check taps the way a person does
// (mouse on the desk, touch on the phone) and, where the bug was "covered", checks what the tap lands on.
//   A. node: the fixes are in index.html.
//   B. admin at a desk:
//      1  🧾 This week's supplier checks → ✕ closes it with no page error (it threw "reading 'getAttribute'").
//      2  📊 LSA by month → ✓ Disputed in Ads: the row says so at once, the lead is marked; Close right after → the panel stays
//         closed (it came back by itself 400 ms later and was left over the next screen).
//      3  an emptied LSA panel (its window taken away) does not cover "🏢 Show All companies" on Materials & SDS (Construction).
//      4  📥 Drop invoices & receipts opens its window; emptied, it does not cover "📒 Vendor accounts" and the button opens it again.
//      5  📒 Vendor accounts → its ✕ is on top and closes it.
//      6  the closed Estimate Notes side panel has no ✕ / Done on the page (the crawler's "way back" tapped that hidden ✕).
//      7  Approvals: each filter chip shows its own rows (the count on the chip); Escalated with none says so.
//      8  Materials & SDS on Construction → 💧 Mitigation → "‹ Back to Construction" takes you back.
//      9  📑 Paperwork by job type (phone size): no paper's form picker sits under the button row.
//   C. a PM on an iPhone, his own jobs:
//      10 ✏️ Job info → 💾 Save job info: saves through _gcxPatchJob, says "✓ Saved" (also with nothing changed).
//      11 📄 Documents → ＋ Add a required paper → 📁 Upload opens the file picker.
//      12 📅 Schedule → ＋ Add inspection → 🏛 City permit checklist opens on top.
//      13 Customer portal with no portal yet → 👁 Customer view says why there is nothing to see.
//      14 Job messages → Send text with an empty box says "Type a message first".
//      15 ☰ More → 🔍 Search opens the search page on top; 🆘 Report a problem → My reports opens the list on top.
// Usage: node test_BTNFIX.mjs <dir with index.html>
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_BTNFIX.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

console.log('A. node');
const T = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(/tr = a && a !== 'close' && t\.closest \? t\.closest\('tr\[data-party\]'\) : null; if \(!tr\) return;/.test(T), 'supplier checks: the sheet\'s ✕ is not taken for a row button');
ok(T.includes("function noEmpty(){ var o = D.getElementById('gc-lsa2-ov');") && T.includes("if (D.body.contains(ov) && D.getElementById('gc-lsa2-ov') === ov) panel();"), 'LSA panel: redrawn only while open; an emptied one is removed');
ok(T.includes('.gc-bd-ov:empty{display:none!important;pointer-events:none!important}') && T.includes("if (OV && D.body.contains(OV) && OV.querySelector('.gc-bd-card')) return OV;"), 'Drop invoices: an emptied window never covers the page; the button makes a new one');
ok(/#gc-est-notes-panel\{[^']*visibility:hidden/.test(T), 'Estimate Notes panel: hidden (not just slid away) when closed');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), PM = byId('u-pm');
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true },
    { id: 'u3', name: 'Other PM', role: 'Project Manager', active: true }]);
  H.cset('projects', [
    { id: 'P1', autoPO: 'C901', name: 'Demo Kitchen', client: 'Sample Customer', clientPhone: '', address: '1 Demo St, Memphis, TN 38117', type: 'Kitchen', pm: 'Demo PM', status: 'active', pct: 20, contract: 18000, updatedAt: ago(30) },
    { id: 'P2', autoPO: 'C902', name: 'Demo Deck', client: 'Deck Customer', address: '2 Demo St, Memphis, TN 38117', type: 'Residential Reno', pm: 'Demo PM', status: 'active', pct: 10, contract: 9000, updatedAt: ago(30) },
    { id: 'P3', autoPO: 'C903', name: 'Demo Bath', client: 'Bath Customer', address: '3 Demo St', type: 'Bath', pm: 'Other PM', status: 'active', contract: 7000, updatedAt: ago(30) },
    { id: 'PM1', autoPO: 'M101', name: 'Demo Ross basement', client: 'Ross Customer', address: '4 Demo St', type: 'Water Damage', companyId: 'mitigation', pm: 'Other PM', status: 'active', updatedAt: ago(30) }]);
  H.cset('customers', []); H.cset('subs', []); H.cset('vendors', []); H.cset('schedule', []); H.cset('projectDocs', []); H.cset('punch', []); H.cset('estimates', []); H.cset('expenses', []);
  H.cset('invs', [{ id: 'B1', pid: 'P1', type: 'supplier', vendor: 'Sample Supply', num: 'S-1', amt: 420, status: 'approved', date: day(-20), dueDate: day(1), updatedAt: ago(40) }]);
  const base = { source: 'Google LSA', leadSource: 'Google LSA' };
  H.cset('leads', [
    Object.assign({ id: 'G3', name: 'Demo Bad', phone: '9015550183', lsaCheck: 'bad', lsaReason: 'Spam', lsaDecidedAt: ago(48), stage: 'Lost', status: 'lost', lostReason: 'LSA — not a real lead (Spam)', createdAt: ago(50), updatedAt: ago(48) }, base),
    Object.assign({ id: 'G2', name: 'Demo Good', phone: '9015550182', lsaCheck: 'good', stage: 'New Lead', status: 'new', createdAt: ago(30), updatedAt: ago(20) }, base)]);
  H.cset('gc_office_tasks', []);
  H.cset('gc_automation_pause', { on: false });
  const now = new Date().toISOString();
  H.cset('gc_approval_queue', JSON.stringify([
    { id: 'q1', kind: 'portal_link', title: 'Portal link — Demo Bath', jobId: 'P3', jobName: 'Demo Bath', pm: 'Other PM', channel: 'email', to: 'bath@example.test', subject: 'Your project page', html: '<p>Hi</p>', text: 'Hi', attachments: [], steps: ['pm'], step: 'pm', approvals: [], status: 'waiting', createdAt: now, updatedAt: now, meta: {} },
    { id: 'q2', kind: 'thank_you', title: 'Thank-you e-mail — Demo Kitchen', jobId: 'P1', jobName: 'Demo Kitchen', pm: 'Demo PM', channel: 'email', to: 'kitchen@example.test', subject: 'Thank you', html: '<p>Thanks</p>', text: 'Thanks', attachments: [],
      steps: ['pm', 'admin'], step: 'admin', approvals: [{ step: 'pm', by: 'Demo PM', role: 'pm', at: ago(30) }], status: 'waiting', adminSince: ago(2), createdAt: ago(3), updatedAt: ago(2), meta: {} }]));
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
const cproj = id => ((H.cget('projects') || []).find(p => p.id === id) || {});
async function until(fn, ms){ const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 15000)) { v = await fn(); if (v) return v; await sleep(250); } return v; }
/* where a tap on the first visible match lands: { x, y, hit (the element itself is on top), by } */
const aim = (c, sel, rx) => c.ev(([sel, rx]) => {
  const L = [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (!rx || new RegExp(rx).test((e.innerText || e.textContent || '').trim())); });
  const e = L[0]; if (!e) return null;
  const onTop = () => { const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); };
  const r0 = e.getBoundingClientRect(); if (r0.top < 0 || r0.bottom > innerHeight || !onTop()) e.scrollIntoView({ block: 'center' });   /* the way a person scrolls it up from under a bar */
  const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y);
  return { x, y, hit: !!h && (h === e || e.contains(h)), by: h ? ((h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className ? '.' + h.className.split(' ')[0] : '') + ' ' + (h.tagName || '')) : '' };
}, [sel, rx || '']);
async function tap(c, sel, rx){ const p = await aim(c, sel, rx); if (!p) return null; if (c.mobile) await c.page().touchscreen.tap(p.x, p.y); else await c.page().mouse.click(p.x, p.y); return p; }
/* what is on top at the middle of an element (or of the screen) */
const topAt = (c, sel) => c.ev(sel => { const e = sel ? document.querySelector(sel) : null; let x = innerWidth / 2, y = innerHeight / 2; if (e) { const r = e.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + Math.min(r.height / 2, 40); } const h = document.elementFromPoint(x, y); return { sel, on: !!(e && h && (e === h || e.contains(h))), by: h ? (h.id || '') + '.' + String(h.className).split(' ')[0] : '' }; }, sel);

const OPEN = [];
try {
  seed();
  console.log('B. admin at a desk');
  const A = await H.computer('Desk', { build }); OPEN.push(A);
  ok(await H.signIn(A, ADMIN, 20000), 'admin signs in');
  await H.waitFor(A, () => !!(window._crm && (window._crm.projects || []).length >= 4 && window._gcLsa2 && window._gcVendorAcct && window._gcBulkDrop && window._gcSdsCo), null, 60000);
  await sleep(4000);
  const go = async v => { await A.ev(v => window._setView(v), v); await sleep(2200); };

  // 1 · 🧾 This week's supplier checks → ✕
  await go('taxcenter');
  let wk = await until(() => aim(A, '[data-lump="week"]'), 15000);
  if (wk) await tap(A, '[data-lump="week"]'); else await A.ev(() => window._gcVendorAcct.week());
  ok(!!(await until(() => A.ev(() => /This week.s supplier checks/.test((document.getElementById('gc-lump') || {}).innerText || '')), 5000)), '1 🧾 This week\'s supplier checks opens' + (wk ? ' (Accounting button)' : ' (API)'));
  const e0 = A.errs.length;
  const x1 = await tap(A, '#gc-lump [data-va="close"]'); await sleep(600);
  ok(x1 && x1.hit && !(await A.ev(() => !!document.getElementById('gc-lump'))) && A.errs.length === e0, '1 … its ✕ closes it with no page error', { x1, errs: A.errs.slice(e0) });

  // 5 · 📒 Vendor accounts → ✕
  const va = await until(() => aim(A, '[data-lump="accts"]'), 8000);
  if (va) await tap(A, '[data-lump="accts"]'); else await A.ev(() => window._gcVendorAcct.list());
  await until(() => A.ev(() => /Vendor accounts/.test((document.getElementById('gc-lump') || {}).innerText || '')), 5000);
  const x5 = await tap(A, '#gc-lump [data-va="close"]'); await sleep(600);
  ok(x5 && x5.hit && !(await A.ev(() => !!document.getElementById('gc-lump'))), '5 📒 Vendor accounts: its ✕ is on top and closes it', x5);

  // 4 · 📥 Drop invoices & receipts
  const db = await until(() => aim(A, '#gc-bulkdrop-acct'), 12000);
  if (db) await tap(A, '#gc-bulkdrop-acct'); else await A.ev(() => window._gcBulkDrop.open());
  ok(!!(await until(() => A.ev(() => { const c = document.querySelector('.gc-bd-ov .gc-bd-card'); return c && c.getBoundingClientRect().height > 50; }), 5000)), '4 📥 Drop invoices & receipts opens its window' + (db ? ' (Accounting button)' : ' (API)'));
  await A.ev(() => document.querySelectorAll('[role=dialog]').forEach(o => o.remove()));   /* what a page cleaner / the crawler's screen change does */
  await sleep(150);
  const v4 = await aim(A, '[data-lump="accts"]');
  ok(v4 && v4.hit, '4 … emptied, it does not cover 📒 Vendor accounts', v4);
  if (db) await tap(A, '#gc-bulkdrop-acct'); else await A.ev(() => window._gcBulkDrop.open());
  ok(!!(await until(() => A.ev(() => !!document.querySelector('.gc-bd-ov .gc-bd-card')), 4000)), '4 … and the button opens it again (it was dead after that)');
  await A.ev(() => window._gcBulkDrop.close()); await sleep(1700);
  ok(await A.ev(() => !document.querySelector('.gc-bd-ov')), '4 … closed, nothing of it is left on the page');

  // 6 · the hidden Estimate Notes panel
  await go('approvals');
  const ghost = await A.ev(() => { const p = document.getElementById('gc-est-notes-panel'); if (!p) return { none: true };
    const vis = [...p.querySelectorAll('button')].filter(b => { const s = getComputedStyle(b), r = b.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2; }).map(b => b.innerText.trim());
    return { vis, cs: getComputedStyle(p).visibility }; });
  ok(ghost.none || (ghost.cs === 'hidden' && !ghost.vis.length), '6 the closed Estimate Notes panel has no ✕ / Done on the page', ghost);
  if (!ghost.none && await A.ev(() => !!(window.gcEstNotes && window.gcEstNotes.open))) {
    await A.ev(() => window.gcEstNotes.open('E1', 'Demo estimate', 'Draft')); await sleep(700);
    const op = await A.ev(() => getComputedStyle(document.getElementById('gc-est-notes-panel')).visibility);
    await A.ev(() => window.gcEstNotes.close()); await sleep(700);
    const cl = await A.ev(() => getComputedStyle(document.getElementById('gc-est-notes-panel')).visibility);
    ok(op === 'visible' && cl === 'hidden', '6 … it still opens (visible) and closes (hidden)', { op, cl });
  }

  // 7 · Approvals filter chips
  await until(() => A.ev(() => document.querySelectorAll('.apx-chip').length >= 3), 10000);
  const chips = await A.ev(() => [...document.querySelectorAll('.apx-chips .apx-chip')].map(b => ({ f: b.getAttribute('data-apx-f'), n: +((b.querySelector('b') || {}).textContent || 0), t: b.innerText.replace(/\s+/g, ' ').trim() })));
  const shown = {};
  for (const ch of chips.filter(c => ['', 'office', 'all'].includes(c.f))) {
    await tap(A, '.apx-chips .apx-chip[data-apx-f="' + ch.f + '"]'); await sleep(500);
    if ((await A.ev(f => (document.querySelector('.apx-chip.on') || {}).getAttribute && document.querySelector('.apx-chip.on').getAttribute('data-apx-f'), ch.f)) !== ch.f && ch.f === '') { /* "Waiting on me" is the default: a second tap on another chip turns it off */ }
    shown[ch.f || 'mine'] = await A.ev(() => ({ rows: [...document.querySelectorAll('.apx-row:not(.done)')].map(r => r.getAttribute('data-k')), esc: document.querySelectorAll('.apx-row.esc:not(.done)').length, empty: (document.querySelector('.apx-empty') || {}).innerText || '', on: (document.querySelector('.apx-chip.on') || { getAttribute: () => '' }).getAttribute('data-apx-f') }));
  }
  console.log('    chips ' + JSON.stringify(chips) + ' shown ' + JSON.stringify(shown));
  const cOf = f => (chips.find(c => c.f === f) || {}).n;
  ok(shown.all && shown.all.rows.length === cOf('all') && shown.all.on === 'all', '7 "All" shows every approval (as many rows as its count)', { n: cOf('all'), s: shown.all });
  ok(shown.office && shown.office.on === 'office' && shown.office.rows.length === cOf('office') && (cOf('office') ? shown.office.esc === shown.office.rows.length : /Nothing is escalated to the office/.test(shown.office.empty)), '7 "Escalated to office" shows only escalated rows' + (cOf('office') ? '' : ' — none: it says "Nothing is escalated to the office"'), { n: cOf('office'), s: shown.office });
  ok(shown.mine && shown.mine.rows.length === cOf('') && shown.all && shown.all.rows.length >= shown.mine.rows.length && shown.all.rows.length > cOf('office'), '7 "Waiting on me" shows its own rows; the chips filter (All ' + cOf('all') + ', Waiting on me ' + cOf('') + ', Escalated ' + cOf('office') + ')', { mine: shown.mine, n: cOf('') });

  // 2 · LSA by month → ✓ Disputed in Ads, then Close
  await go('leads');
  await A.ev(() => window._gcLsa2.panel()); await sleep(600);
  const d0 = await aim(A, '#gc-lsa2-ov [data-lsa2d]');
  ok(!!d0 && d0.hit, '2 📊 LSA by month lists the bad lead with "✓ Disputed in Ads"', d0);
  if (d0) {
    await tap(A, '#gc-lsa2-ov [data-lsa2d]'); await sleep(150);
    const now2 = await A.ev(() => ({ row: (document.querySelector('#gc-lsa2-ov [data-lsa2done]') || {}).textContent || '', lead: !!((window._crm.leads || []).find(l => l.id === 'G3') || {}).lsaDisputedAt }));
    ok(/Disputed — saved/.test(now2.row) && now2.lead, '2 … tapped: the row says "✓ Disputed — saved" at once and the lead is marked', now2);
    await tap(A, '#gc-lsa2-ov [data-lsa2x]'); await sleep(2500);
    ok(await A.ev(() => !document.getElementById('gc-lsa2-ov')), '2 … Close right after: the panel stays closed (it used to come back by itself)');
  }
  // 3 · an emptied LSA panel over Materials & SDS (Construction)
  await A.ev(() => window._gcLsa2.panel()); await sleep(400);
  await A.ev(() => document.querySelectorAll('#gc-lsa2-ov [role=dialog]').forEach(o => o.remove()));
  await A.ev(() => window._gcCo.setFilter('construction')); await sleep(1500);
  await go('sds');
  const s3 = await until(() => aim(A, '.gcsds [data-sds="coall"]'), 8000);
  ok(s3 && s3.hit, '3 Materials & SDS (Construction): "🏢 Show All companies" is not covered by an emptied LSA panel', s3);
  await sleep(1200);
  ok(await A.ev(() => !document.getElementById('gc-lsa2-ov')), '3 … and the emptied panel is gone');

  // 8 · 💧 Mitigation → ‹ Back to Construction
  const m8 = await tap(A, '.gcsds [data-sds="co"][data-sds-co="mitigation"]'); await sleep(1200);
  const st8 = await A.ev(() => ({ co: window._gcCo.filter(), back: (document.querySelector('.gcsds [data-sds="coback"]') || {}).innerText || '', lib: /Materials library/.test((document.querySelector('.gcsds') || {}).innerText || '') }));
  ok(m8 && m8.hit && st8.co === 'mitigation' && st8.lib && /‹ Back to Construction/.test(st8.back), '8 Construction → 💧 Mitigation: the Mitigation page has "‹ Back to Construction"', { m8, st8 });
  const b8 = await tap(A, '.gcsds [data-sds="coback"]'); await sleep(1200);
  const st8b = await A.ev(() => ({ co: window._gcCo.filter(), off: (document.querySelector('.gcsds') || { getAttribute: () => '' }).getAttribute('data-sds-off') }));
  ok(b8 && b8.hit && st8b.co === 'construction' && st8b.off === 'construction', '8 … it takes you back to the Construction page', { b8, st8b });
  await A.ev(() => window._gcCo.setFilter('all')); await sleep(800);

  // 9 · 📑 Paperwork by job type on a phone-size screen
  await A.page().setViewportSize({ width: 390, height: 844 }); await sleep(800);
  await A.ev(() => window._gcJobDocs.openEditor()); await sleep(1500);
  const ed = await A.ev(() => {
    const ov = document.getElementById('gc-jd-ed'); if (!ov) return null;
    const sc = ov.querySelector('[data-jd-scroll]') || ov.firstElementChild, bar = ov.querySelector('[data-e="reset"]').parentElement, br = bar.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    const covered = []; let seen = 0;
    for (let i = 0; i < 6; i++) {   /* scroll the list down: every form picker in view is on top where it is */
      ov.querySelectorAll('select[data-e="src"]').forEach(s => { const r = s.getBoundingClientRect(); if (r.bottom <= sr.top || r.top >= sr.bottom) return; const y = Math.min(r.bottom - 2, Math.max(r.top + 2, (Math.max(r.top, sr.top) + Math.min(r.bottom, sr.bottom)) / 2)); const h = document.elementFromPoint(r.left + Math.min(20, r.width / 2), y); seen++; if (!(h === s || s.contains(h))) covered.push((h && (h.innerText || h.tagName) || '').slice(0, 30)); });
      sc.scrollTop += sc.clientHeight * 0.8;
    }
    return { sep: !sc.contains(bar) && sr.bottom <= br.top + 1, seen, covered: covered.slice(0, 5) };
  });
  ok(ed && ed.sep && ed.seen > 3 && !ed.covered.length, '9 📑 Paperwork by job type (390×844): the list ends above the button row; no form picker sits under "↺ Built-in table"', ed);
  await A.ev(() => { const o = document.getElementById('gc-jd-ed'); if (o) o.remove(); });
  await A.page().setViewportSize({ width: 1440, height: 900 });
  ok(!A.errs.length, 'no page errors (desk)', A.errs.slice(0, 5));
  await A.close();

  console.log('C. a PM on an iPhone');
  const P = await H.computer('PMPhone', { build, mobile: true, init: INIT }); OPEN.push(P); P.mobile = true;
  ok(await H.signIn(P, PM, 20000), 'the PM signs in on the phone');
  await H.waitFor(P, () => !!document.querySelector('#_gcJobPick'), null, 45000);
  await H.waitFor(P, () => !!window._gcJobInfo && !!window._gcJobReq && !!window._gcPortalEd && (window._crm && window._crm.projects || []).length >= 3, null, 45000);
  await sleep(2500);
  await H.waitFor(P, () => !!window._gcJobInfo && !!document.querySelector('#_gcJobPick') && (window._crm && window._crm.projects || []).length >= 3, null, 45000); await sleep(1500);
  const dash = async pid => { await P.ev(id => { document.querySelectorAll('.gcji-page,._gcSheetOv,.gcfp-sheet,#_gcJobDash,#gc-xr-sheet,.gi2-ov,.gcx10-ov,#gcpe').forEach(o => o.remove()); window._gcJobDashboard(id); }, pid); return H.waitFor(P, () => !!document.querySelector('#_gcJobDash .gcfp-grid[data-ji-all]'), null, 15000); };

  // 10 · ✏️ Job info → 💾 Save job info
  await P.ev(() => { window.__btnPx = []; const f = window._gcxPatchJob; window._gcxPatchJob = function(pid, patch, why){ window.__btnPx.push({ pid, patch, why }); return f.apply(this, arguments); }; });
  ok(!!(await dash('P1')), '10 the PM\'s own job page opens');
  await tap(P, '#_gcJobDash .gcfp-grid [data-fn="info"]');
  ok(!!(await H.waitFor(P, () => !!document.querySelector('.gcji-page[data-ji="info"] .gcji-form [data-ji-a="save"]'), null, 8000)), '10 ✏️ Job info: the PM has 💾 Save job info on his own job (not a permission problem)');
  let sv = await tap(P, '.gcji-form [data-ji-a="save"]');
  const said0 = await until(() => P.ev(() => (document.querySelector('.gcji-form [data-ji-err]') || {}).innerText || ''), 6000);
  ok(sv && sv.hit && /✓ Saved/.test(said0 || ''), '10 nothing changed: it still says "✓ Saved" right above the button', { sv, said0 });
  await P.ev(() => { const t = document.querySelector('.gcji-form [data-f="notes"]'); t.value = 'Cabinets on Monday (PM)'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await P.ev(() => { const e = document.querySelector('.gcji-form [data-ji-err]'); if (e) e.textContent = ''; });
  sv = await tap(P, '.gcji-form [data-ji-a="save"]');
  const said1 = await until(() => P.ev(() => { const t = (document.querySelector('.gcji-form [data-ji-err]') || {}).innerText || ''; return /Saved/.test(t) ? t : ''; }), 8000);
  const px = await P.ev(() => window.__btnPx);
  ok(/✓ Saved — the office sees it/.test(said1 || '') && px.some(x => x.pid === 'P1' && x.patch && x.patch.notes === 'Cabinets on Monday (PM)'), '10 an edit: saved through _gcxPatchJob and "✓ Saved — the office sees it on the desk"', { said1, px });
  ok(!!(await until(() => cproj('P1').notes === 'Cabinets on Monday (PM)', 90000)), '10 … and it reaches the cloud', { cloud: cproj('P1').notes, unsent: await P.ev(() => window._gcUnsent ? window._gcUnsent() : null).catch(() => null) });

  // 11 · 📄 Documents → ＋ Add a required paper → 📁 Upload
  await dash('P1');
  await tap(P, '#_gcJobDash .gcfp-grid [data-fn="docs"]');
  const addB = await until(() => aim(P, '.gcji-page button', '＋ Add a required paper'), 8000);
  if (addB) await tap(P, '.gcji-page button', '＋ Add a required paper'); else await P.ev(() => window._gcJobReq.openAdd('P1'));
  await until(() => P.ev(() => !!document.querySelector('#gc-xr-sheet [data-xr-kind="upload"]')), 5000);
  const fcP = P.page().waitForEvent('filechooser', { timeout: 5000 }).then(() => true, () => false);
  const up = await tap(P, '#gc-xr-sheet [data-xr-kind="upload"]');
  const fc = await fcP;
  ok(up && up.hit && fc && await P.ev(() => !document.querySelector('#gc-xr-sheet [data-xr-pane="upload"]').hidden), '11 📁 Upload opens the file picker (and shows the upload field)' + (addB ? '' : ' [sheet opened by API]'), { up, fc });

  // 12 · 📅 Schedule → ＋ Add inspection → 🏛 City permit checklist
  await dash('P1');
  await tap(P, '#_gcJobDash [data-fp="sched"]');
  const ai = await until(() => aim(P, '.gcji-page [data-ji-a="insp"]'), 8000);
  if (ai) await tap(P, '.gcji-page [data-ji-a="insp"]');
  const cityB = await until(() => aim(P, '#gi2-panel [data-gi2-a="city"]'), 8000);
  ok(!!ai && !!cityB, '12 ＋ Add inspection opens the inspections panel with "🏛 City permit checklist"', { ai, cityB });
  if (cityB) {
    await tap(P, '#gi2-panel [data-gi2-a="city"]'); await sleep(1200);
    const t12 = await topAt(P, '.gcx10-ov .gcx10-card h2');
    ok(t12.on, '12 🏛 City permit checklist opens on top (it opened under the inspections panel)', t12);
    await tap(P, '.gcx10-ov .gcx10-x'); await sleep(500);
    ok(await P.ev(() => !document.querySelector('.gcx10-ov') && !!document.getElementById('gi2-panel')), '12 … its Close goes back to the inspections panel');
  }

  // 13 · Customer portal with no portal → 👁 Customer view
  await P.ev(() => { document.querySelectorAll('.gcji-page,.gi2-ov,#_gcJobDash').forEach(o => o.remove()); window._gcPortalEd.open('P2'); });
  await until(() => P.ev(() => !!document.querySelector('#gcpe [data-pe-make]')), 8000);
  const cv = await tap(P, '#gcpe [data-pe="mode"][data-m="cust"]'); await sleep(500);
  const t13 = await P.ev(() => ({ note: (document.querySelector('#gcpe [data-pe-nocust]') || {}).innerText || '', aria: document.querySelector('#gcpe [data-m="cust"]').getAttribute('aria-disabled'), mode: window._gcPortalEd.state().mode }));
  ok(cv && cv.hit && /no portal/.test(t13.note) && /Make the portal first/.test(t13.note) && t13.aria === 'true' && t13.mode === 'edit', '13 no portal yet: 👁 Customer view says why there is nothing to see (it was a dead, disabled button)', { cv, t13 });
  await P.ev(() => window._gcPortalEd.close());

  // 14 · Job messages → Send text with an empty box
  await P.ev(() => window._gcOpenJobMessages('P1'));
  const sb = await until(() => aim(P, '.gctx-bar .gctx-send'), 8000);
  if (sb) {
    await P.ev(() => { const m = document.querySelector('.gctx-bar .gctx-msg'); m.value = ''; m.dispatchEvent(new Event('input', { bubbles: true })); });
    await tap(P, '.gctx-bar .gctx-send'); await sleep(400);
    const t14 = await P.ev(() => { const e = document.querySelector('.gctx-bar .gctx-err'); if (!e) return null; const r = e.getBoundingClientRect(); return { t: e.innerText, vis: r.height > 0, focus: document.activeElement && document.activeElement.classList.contains('gctx-msg') }; });
    ok(sb.hit && t14 && /Type a message first/.test(t14.t) && t14.vis, '14 Send text with an empty box: "Type a message first." in the bar', { sb, t14 });
  } else ok(false, '14 the 📱 Text them bar is on Job messages');
  const jmX = await aim(P, 'button', '^Close$'); if (jmX) await tap(P, 'button', '^Close$'); await sleep(600);   /* Job messages' own Close */

  // 15 · ☰ More → 🔍 Search; 🆘 Report a problem → My reports
  await P.ev(() => document.querySelectorAll('.gcji-page,#gcpe,.gc-fh-sheet,._gcSheetOv').forEach(o => o.remove())); await sleep(500);
  let more = false; for (let i = 0; i < 4 && !more; i++) { await tap(P, '#gc-fh-tabs [data-t="more"]'); more = !!(await until(() => P.ev(() => !!document.querySelector('.gc-fh-sheet [data-m="search"], .gc-fh-sheet [data-ra-a="search"]')), 3000)); }
  if (more) {
    await tap(P, '.gc-fh-sheet [data-m="search"], .gc-fh-sheet [data-ra-a="search"]'); await sleep(1200);
    const t15 = await topAt(P, '#_usInput');
    ok(t15.on, '15 ☰ More → 🔍 Search opens the search page on top', t15);
    await P.ev(() => document.querySelectorAll('._gcSheetOv,.gc-fh-sheet').forEach(o => o.remove()));
  } else ok(false, '15 ☰ More shows 🔍 Search');
  await P.ev(() => window._gcReportProb.open()); await sleep(800);
  const mr = await tap(P, '#gc-rpb-form [data-rp-mine]'); await sleep(1000);
  const t15b = await topAt(P, '#gc-rpb-mine .gc-rpb-hd');
  ok(mr && mr.hit && t15b.on && await P.ev(() => !document.getElementById('gc-rpb-form')), '15 🆘 Report a problem → My reports opens "My problem reports" on top', { mr, t15b });
  ok(!P.errs.length, 'no page errors (PM phone)', P.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
finally { for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`BTNFIX ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
