// test_JOBINFO.mjs <build-dir> — patch JOBINFO: the GrayCo Field job page on an iPhone (390x844, iPhone UA, touch), offline
// harness, made-up data. Owner 11/19: "If I update progress to 25% that obviously means the job is active. It should also have
// where I can edit the project info, have customer info, where I can mark active or edit info too."
//   A. node: the block is in index.html (after the scripts it wraps); PMFIELD hands out its schedule writer.
//   B. admin on the phone (real taps):
//      · the job page: ✏️ Job info is tile 1, no "More for this job" toggle, every tile visible, 📄 Documents after the main tiles,
//        a compact customer row on top;
//      · 📈 Update Progress → 25 % on a "bidding" job → status "active" in the cloud (+ statusHistory), "Job marked Active (progress 25%)";
//      · ✏️ Job info: a white page, ‹ Back on top, no photo section; the last button (Sub agreement) scrolls clear of the bottom bar;
//        the job name and the customer's name / phone edited → in the cloud (job + a customer record linked by customerId);
//        a linked customer's phone edited → that customer record in the cloud; ▶ Mark Active works;
//      · a completed job set to 50 % stays completed;
//      · 📄 Documents: a white page with Auto documents + all files + ＋ Add file; 🗄 Archive keeps the file (deleted + archived);
//      · 📅 Schedule & Inspections: a white page with only this job's items, past folded; ＋ Add to schedule → the cloud and the
//        company schedule; editing a date moves it; the add button sits above the bottom bar;
//      · a desk computer (same cloud) shows the edited job name and phone; no page errors.
//   C. a PM on the phone: edits his own job; another PM's job is read only (no Save, no Mark Active, no ＋ Add to schedule).
// Usage: node test_JOBINFO.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; GC_SHOTS = screenshots dir)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/jobinfo/';
const build = process.argv[2];
if (!build) { console.error('usage: node test_JOBINFO.mjs <dir with index.html>'); process.exit(2); }
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

console.log('A. node');
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const iJ = t.indexOf('<script id="gc-patch-jobinfo">'), iP = t.indexOf('<script id="gc-patch-fieldportal">'), iR = t.indexOf('<script id="gc-patch-jobreq">');
ok(iJ > iP && iJ > iR, 'the JOBINFO block is in index.html, after FIELDPORTAL and JOBREQ', { iJ, iP, iR });
ok(/saveSched: saveSched, canEditRec: canEdit/.test(t), 'PMFIELD hands out its schedule writer (window._gcPmField.saveSched)');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), PM = byId('u-pm'), DESK = byId('u-nick');
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u0', name: 'Nick Gray', email: DESK, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true },
    { id: 'u3', name: 'Other PM', role: 'Project Manager', active: true }]);
  H.cset('projects', [
    { id: 'PB', autoPO: 'C846', name: 'Outdoor Entertainment Area', client: '', clientPhone: '', clientEmail: '', address: '100 Demo Vly Dr, Lakeland, TN, 38002', type: 'Residential Reno', pm: 'Demo PM', status: 'bidding', pct: 0, source: 'companycam', contract: 0, updatedAt: ago(3),
      subAgreements: [{ sub: 'Sample Sub', amount: 1200, createdAt: ago(2) }] },
    { id: 'PA', autoPO: 'C850', name: 'Kitchen Demo', client: 'Sample Customer', customerId: 'C1', clientPhone: '9015550123', address: '7 Demo Ct', type: 'Kitchen', pm: 'Demo PM', status: 'estimating', updatedAt: ago(4) },
    { id: 'PO', autoPO: 'C851', name: 'Other PM Job', client: 'Other Customer', address: '9 Demo Ln', type: 'Residential Reno', pm: 'Other PM', status: 'active', pct: 40, updatedAt: ago(5) },
    { id: 'PE', autoPO: 'C860', name: 'Sold Deck', client: 'Deck Customer', address: '11 Demo Rd', type: 'Residential Reno', pm: 'Other PM', status: 'approved', pct: 0, updatedAt: ago(6) },
    { id: 'PF', autoPO: 'C870', name: 'Fence Build', client: 'Fence Customer', address: '21 Demo Pl', type: 'Residential Reno', pm: 'Demo PM', status: 'active', pct: 75, created: day(0), updatedAt: ago(1) },
    { id: 'PG', autoPO: 'C540', name: 'Older Patio', client: 'Patio Customer', address: '22 Demo Pl', type: 'Residential Reno', pm: 'Demo PM', status: 'active', pct: 75, created: '2026-09-01', startDate: '2026-09-15', updatedAt: ago(30) },
    { id: 'PD', autoPO: 'C700', name: 'Done Job', client: 'Done Customer', address: '3 Demo Way', type: 'Bath', pm: 'Demo PM', status: 'completed', pct: 100, completionDate: day(-30), updatedAt: ago(20) }]);
  H.cset('customers', [{ id: 'C1', name: 'Sample Customer', phone: '9015550123', email: 'sample.customer@example.com', address: '7 Demo Ct', type: 'homeowner', updatedAt: ago(9) }]);
  H.cset('subs', [{ id: 'SUB1', name: 'Sample Sub', company: 'Sample Sub LLC', trade: 'Concrete', isSub: true, updatedAt: ago(30) }]);
  H.cset('vendors', []);
  H.cset('schedule', [
    { id: 'S1', pid: 'PB', type: 'work', title: 'Pour footings', date: day(6), vendor: 'Sample Sub', assignee: 'Sample Sub', subId: 'SUB1', by: 'Wesley Johnson', scope: 'company', updatedAt: ago(2) },
    { id: 'S2', pid: 'PO', type: 'work', title: 'Other job item', date: day(7), assignee: 'Other PM', by: 'Other PM', scope: 'company', updatedAt: ago(2) },
    { id: 'S3', pid: 'PB', type: 'work', title: 'Old July item', date: day(-120), assignee: 'Demo PM', by: 'Demo PM', scope: 'company', updatedAt: ago(100) }]);
  H.cset('projectDocs', [{ id: 'D1', pid: 'PB', name: 'Plans.pdf', fileName: 'Plans.pdf', cat: 'document', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0xLjQK', uploadedAt: ago(1), by: 'Wesley Johnson' }]);
  H.cset('punch', []); H.cset('estimates', []); H.cset('invs', []); H.cset('expenses', []); H.cset('leads', []);
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
const ctasks = () => { let v = H.cget('gc_office_tasks'); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } if (v && !Array.isArray(v)) v = v.tasks || v.list || v.items || []; return Array.isArray(v) ? v : []; };
const cproj = id => ((H.cget('projects') || []).find(p => p.id === id) || {});
async function until(fn, ms){ const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 30000)) { v = fn(); if (v) return v; await sleep(400); } return v; }
async function tap(c, sel){ const l = c.page().locator(sel).first(); await l.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {}); await sleep(150); await l.tap({ timeout: 8000 }); }
async function fill(c, sel, v){ const l = c.page().locator(sel).first(); await l.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {}); await l.tap({ timeout: 8000 }).catch(() => {}); await l.fill(v); }
async function openDash(c, pid){
  await c.ev(id => { document.querySelectorAll('.gcji-page,._gcSheetOv,.gcfp-sheet,#_gcJobDash').forEach(o => o.remove()); window._gcJobDashboard(id); }, pid);
  return H.waitFor(c, () => !!document.querySelector('#_gcJobDash .gcfp-grid[data-ji-all]'), null, 15000);
}
const shot = (c, n) => c.page().screenshot({ path: path.join(SHOTS, n + '.png') }).catch(() => {});

const OPEN = [];
try {
  seed();
  if (!process.env.JI_ONLY_C) {
  console.log('B. admin on an iPhone');
  const A = await H.computer('AdminPhone', { build, mobile: true, init: INIT }); OPEN.push(A);
  ok(await H.signIn(A, ADMIN, 20000), 'admin signs in on the phone');
  await H.waitFor(A, () => !!document.querySelector('#_gcJobPick'), null, 45000);
  await H.waitFor(A, () => (window._crm && window._crm.projects || []).length >= 7 && (window._crm.customers || []).length >= 1, null, 30000);
  await sleep(2500);
  const st0 = await A.ev(() => window._gcJobInfo && window._gcJobInfo.state());
  ok(st0 && st0.wrapped.pct && st0.wrapped.dash && st0.wrapped.profile && st0.wrapped.docs && st0.pmSave, 'JOBINFO is wired (progress, job page, job info, documents, PMFIELD writer)', st0);

  if (process.env.JI_DEBUG) await A.ev(() => { window.__rm = []; const mo = new MutationObserver(ms => ms.forEach(m => m.removedNodes.forEach(n => { if (n.nodeType === 1 && n.classList && (n.classList.contains('gcji-page') || n.classList.contains('_gcSheetOv'))) window.__rm.push([n.className, n.getAttribute('data-ji'), new Error().stack.split('\n').slice(1, 9).join(' / ')]); }))); mo.observe(document.body, { childList: true }); const o = Element.prototype.remove; Element.prototype.remove = function(){ if (this.classList && (this.classList.contains('gcji-page') || this.classList.contains('_gcSheetOv'))) window.__rm.push(['remove()', this.getAttribute('data-ji'), new Error().stack.split('\n').slice(1, 9).join(' / ')]); return o.apply(this, arguments); }; });
  // ── the job page ──
  ok(!!(await openDash(A, 'PB')), 'the job page opens (every-tile grid)');
  await sleep(600);
  const g = await A.ev(() => {
    const grid = document.querySelector('#_gcJobDash .gcfp-grid'); const key = b => b.getAttribute('data-fm') || b.getAttribute('data-fp') || b.getAttribute('data-fn') || '';
    const btns = [...grid.children].filter(x => x.tagName === 'BUTTON');
    const hidden = btns.filter(b => { const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return cs.display === 'none' || cs.visibility === 'hidden' || r.height < 40; }).map(key);
    const cc = document.querySelector('#_gcJobDash .gcji-cc');
    return { keys: btns.map(key), first: btns[0] && btns[0].textContent.trim(), more: !!grid.querySelector('[data-fm-more]'), heads: grid.querySelectorAll('.gcfm-k').length, hidden, ovHidden: grid.querySelectorAll('.gcfm-ov').length,
      cc: cc ? { text: cc.textContent.trim(), h: Math.round(cc.getBoundingClientRect().height) } : null, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length };
  });
  console.log('    tiles: ' + g.keys.join(', '));
  ok(g.keys[0] === 'info' && /Job info/.test(g.first) && /✏️/.test(g.first), '✏️ Job info is button 1 (top-left)', g);
  ok(!g.more && !g.ovHidden && !g.hidden.length, 'no "More for this job" toggle; every tile is visible on the phone', g);
  ok(g.cols === 2 && g.heads === 0, 'one continuous 2-column grid', g);
  const iDocs = g.keys.indexOf('docs'), iUpd = g.keys.indexOf('update'), iRec = g.keys.indexOf('receipt');
  ok(iDocs > 0 && iDocs < iUpd && (iRec < 0 || iDocs === iRec + 1), '📄 Documents right after the main tiles (next to Snap a receipt)', { iDocs, iUpd, iRec });
  ok(['progress', 'photo', 'sched', 'docs', 'create', 'update', 'msg', 'money'].every(k => g.keys.includes(k)), 'every existing tile is still there', g.keys);
  ok(g.cc && /No customer yet/.test(g.cc.text) && g.cc.h <= 60, 'a compact customer row on top (one line)', g.cc);
  await shot(A, 'jobinfo_01_job_page');

  // ── progress → active ──
  await tap(A, '#_gcJobDash .gcfp-grid [data-fn="progress"]');
  await H.waitFor(A, () => !!document.getElementById('_fpSave'), null, 8000);
  await tap(A, '._fpQuick[data-v="25"]'); await sleep(200);
  await tap(A, '#_fpSave');
  const act = await until(() => { const p = cproj('PB'); return p.status === 'active' && +p.pct === 25 ? p : null; }, 30000);
  ok(!!act, 'progress 25 % on a "bidding" job → status "active", pct 25 in the cloud', cproj('PB'));
  ok(act && (act.statusHistory || []).some(h => h.from === 'bidding' && h.to === 'active' && /progress 25%/.test(h.via)), 'the change is logged in the job\'s statusHistory', act && act.statusHistory);
  const toast1 = await H.waitFor(A, () => (window._gcJobInfo.state().stats.notes || []).join(' | '), null, 6000);
  ok(/Job marked Active \(progress 25%\)/.test(toast1 || ''), 'the note says "Job marked Active (progress 25%)"', toast1);
  await shot(A, 'jobinfo_02_progress_active');

  // ── ✏️ Job info ──
  await openDash(A, 'PB'); await sleep(400);
  await tap(A, '#_gcJobDash .gcfp-grid [data-fn="info"]');
  ok(!!(await H.waitFor(A, () => !!document.querySelector('.gcji-page[data-ji="info"] .gcji-form'), null, 8000)), '✏️ Job info opens a full page');
  const ji = await A.ev(() => {
    const o = document.querySelector('.gcji-page[data-ji="info"]'), r = o.getBoundingClientRect(), hd = o.querySelector('.gcji-hd');
    const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
    return { bg: getComputedStyle(o).backgroundColor, full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, back: hd && /‹ Back/.test(hd.textContent), title: hd && hd.querySelector('b').textContent,
      photos: vis(document.getElementById('_jpCCBtn')) || vis(document.getElementById('_jpLinkUrl')), close: [...o.querySelectorAll('button')].some(b => /^\s*Close\s*$/.test(b.textContent) && vis(b)),
      scope: vis(document.getElementById('_jpScopeText')), docsLink: !!o.querySelector('[data-ji-a="docs"]'), mark: !!o.querySelector('[data-ji-a="active"]'), status: (o.querySelector('[data-ji-cur]') || {}).textContent,
      fields: [...o.querySelectorAll('.gcji-form [data-f]')].map(x => x.getAttribute('data-f')) };
  });
  ok(ji.bg === 'rgb(255, 255, 255)' && ji.full && ji.back && /Job info · Outdoor Entertainment Area/.test(ji.title), 'white full page, "‹ Back · Job info · <job>" header', ji);
  ok(!ji.photos && !ji.close && ji.scope && ji.docsLink, 'no photo section, no bottom Close; Scope of Work kept; documents → the Documents page', ji);
  ok(['name', 'autoPO', 'address', 'type', 'pm', 'startDate', 'endDate', 'notes', 'client', 'clientPhone', 'clientEmail', 'custAddress'].every(f => ji.fields.includes(f)), 'project + customer fields', ji.fields);
  ok(/Active/.test(ji.status || '') && !ji.mark, 'the status shows Active (set by the progress) — no Mark Active needed', ji);
  await shot(A, 'jobinfo_03_jobinfo_top');
  /* the last button (Sub agreement) scrolls fully clear of the bottom bar */
  const sub = await A.ev(async () => {
    const o = document.querySelector('.gcji-page[data-ji="info"]'), bd = o.querySelector('.gcji-bd'); bd.scrollTop = bd.scrollHeight; await new Promise(r => setTimeout(r, 400));
    const b = document.getElementById('_jpSubAgr'), r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const at = document.elementFromPoint(x, y), nav = document.getElementById('gc-fh-tabs'), nr = nav ? nav.getBoundingClientRect() : null;
    return { hit: at === b || b.contains(at), at: at && (at.id || at.className || at.tagName), bottom: Math.round(r.bottom), navTop: nr ? Math.round(nr.top) : null, vh: innerHeight };
  });
  ok(sub.hit && (sub.navTop == null || sub.bottom <= sub.navTop), 'scrolled to the bottom, elementFromPoint on Sub agreement returns that button (clear of the bottom bar)', sub);
  await shot(A, 'jobinfo_04_jobinfo_bottom');
  await A.ev(() => { const bd = document.querySelector('.gcji-page[data-ji="info"] .gcji-bd'); bd.scrollTop = 0; });
  await fill(A, '.gcji-form [data-f="name"]', 'Outdoor Entertainment Area — Phase 1');
  await fill(A, '.gcji-form [data-f="client"]', 'Sample Homeowner');
  await fill(A, '.gcji-form [data-f="clientPhone"]', '901-555-0199');
  await fill(A, '.gcji-form [data-f="clientEmail"]', 'homeowner@example.com');
  await tap(A, '.gcji-form [data-ji-a="save"]');
  const ed = await until(() => { const p = cproj('PB'); return p.name === 'Outdoor Entertainment Area — Phase 1' && p.clientPhone === '901-555-0199' && p.client === 'Sample Homeowner' ? p : null; }, 30000);
  ok(!!ed, 'the job name and the customer phone reach the cloud', cproj('PB'));
  const cu = await until(() => (H.cget('customers') || []).find(c => c.name === 'Sample Homeowner' && c.phone === '901-555-0199'), 30000);
  ok(!!cu && ed && ed.customerId === cu.id, 'a customer record is made and linked (job.customerId)', { cu, cid: ed && ed.customerId });
  ok(!!ed && !!ed._fe && !!ed._fe.name, 'saved through the CRM\'s person-edit writer (_fe: who changed the name)', ed && ed._fe);
  await sleep(800);
  await shot(A, 'jobinfo_05_jobinfo_saved');
  /* a linked customer's phone → that customer record */
  await A.ev(() => document.querySelectorAll('.gcji-page').forEach(o => o.remove()));
  await openDash(A, 'PA'); await sleep(400);
  const cc2 = await A.ev(() => { const c = document.querySelector('#_gcJobDash .gcji-cc'); return c ? { t: c.textContent, call: !!c.querySelector('a[href^="tel:"]'), mail: !!c.querySelector('a.gcji-cc-mail[href*="mail"]') } : null; });
  ok(cc2 && /Sample Customer/.test(cc2.t) && cc2.call && cc2.mail, 'the customer row: name · 📞 tap to call · ✉️ (from the linked record)', cc2);
  await tap(A, '#_gcJobDash .gcfp-grid [data-fn="info"]');
  await H.waitFor(A, () => !!document.querySelector('.gcji-page[data-ji="info"] .gcji-form'), null, 8000);
  const lk = await A.ev(() => (document.querySelector('[data-ji-linked]') || {}).textContent);
  ok(/Linked to the customer record "Sample Customer"/.test(lk || ''), 'the linked customer record is shown', lk);
  await fill(A, '.gcji-form [data-f="clientPhone"]', '901-555-0177');
  await tap(A, '.gcji-form [data-ji-a="save"]');
  const c1 = await until(() => (H.cget('customers') || []).find(c => c.id === 'C1' && c.phone === '901-555-0177'), 30000);
  await until(() => cproj('PA').clientPhone === '901-555-0177', 30000);
  ok(!!c1 && cproj('PA').clientPhone === '901-555-0177', 'editing the phone updates the linked customer record (C1) and the job', { c1, job: cproj('PA').clientPhone });
  /* ▶ Mark Active */
  await tap(A, '.gcji-form [data-ji-a="active"]');
  const pa = await until(() => cproj('PA').status === 'active' ? cproj('PA') : null, 30000);
  ok(!!pa && (pa.statusHistory || []).some(h => h.from === 'estimating' && h.to === 'active' && /Mark Active/.test(h.via)), '▶ Mark Active → status "active" in the cloud, logged', cproj('PA'));
  await sleep(500); await shot(A, 'jobinfo_06_mark_active');
  await A.ev(() => document.querySelectorAll('.gcji-page').forEach(o => o.remove()));

  // ── a completed job is not downgraded ──
  await A.ev(() => { document.querySelectorAll('.gcji-page,#_gcJobDash').forEach(o => o.remove()); window._gcOpenFieldProgress('PD'); });
  await H.waitFor(A, () => !!document.getElementById('_fpSave'), null, 8000);
  await tap(A, '._fpQuick[data-v="50"]'); await sleep(200); await tap(A, '#_fpSave');
  await until(() => +cproj('PD').pct === 50, 20000); await sleep(2500);
  ok(cproj('PD').status === 'completed', 'a completed job set to 50 % stays completed', cproj('PD'));

  // ── 100 %: no box; the % saves; inline notes; a To-Do for the PM (not on an older job) ──
  for (const [pid, nm, oldJob] of [['PF', 'Fence Build', false], ['PG', 'Older Patio', true]]) {
    await A.ev(() => { document.querySelectorAll('.gcji-page,#_gcJobDash').forEach(o => o.remove()); });
    await openDash(A, pid); await sleep(400);
    await tap(A, '#_gcJobDash .gcfp-grid [data-fn="progress"]');
    await H.waitFor(A, () => !!document.getElementById('_fpSave'), null, 8000);
    await tap(A, '._fpQuick[data-v="100"]'); await sleep(200); await tap(A, '#_fpSave');
    const p100 = await until(() => +cproj(pid).pct === 100 ? cproj(pid) : null, 30000);
    await sleep(3500);
    const box = await A.ev(() => ({ modal: !!document.getElementById('gc-finishphoto'), anyModal: [...document.querySelectorAll('[aria-modal="true"]')].filter(e => e.getClientRects().length).map(e => e.id || e.className) }));
    ok(!!p100 && +cproj(pid).pct === 100 && !box.modal && !box.anyModal.length, `${nm}: 100 % saves with no finish-photo box (no modal)`, { pct: cproj(pid).pct, box });
    await openDash(A, pid); await sleep(600);
    const nt = await A.ev(() => (document.querySelector('#_gcJobDash .gcji-notes') || {}).innerText || '');
    ok(/No finish photos yet — add After photos/.test(nt) && /Mark complete\?/.test(nt), `${nm}: inline notes on the job page: "📷 No finish photos yet — add After photos" and the "Mark complete?" chip`, nt);
    const task = await until(() => (ctasks().find(x => x.id === 'FINISHPHOTO_' + pid)) || (oldJob ? 'none' : null), oldJob ? 4000 : 30000);
    if (oldJob) ok(task === 'none', `${nm} (older job): no finish-photo To-Do`, task);
    else ok(task && task.label === '📷 Add finish photos to Fence Build' && task.assignee === 'Demo PM' && !task.done, 'a To-Do for the job\'s PM: "Add finish photos to Fence Build"', task);
    if (!oldJob) await shot(A, 'jobinfo_06b_finish_notes');
  }
  ok(!A.dialogs.some(d => /updated to|finish photos|cannot be/i.test(d.message)), 'no alert / confirm boxes from the progress flow', A.dialogs.map(d => d.message.slice(0, 80)));

  // ── 📄 Documents ──
  await openDash(A, 'PB'); await sleep(400);
  await tap(A, '#_gcJobDash .gcfp-grid [data-fn="docs"]');
  ok(!!(await H.waitFor(A, () => !!document.querySelector('.gcji-page[data-ji="docs"] .gcji-jd'), null, 8000)), '📄 Documents opens a full page');
  await H.waitFor(A, () => !!document.querySelector('.gcji-page[data-ji="docs"] .gcfp-doc[data-id="D1"]'), null, 15000); await sleep(1200);
  const dp = await A.ev(() => {
    const o = document.querySelector('.gcji-page[data-ji="docs"]'), hd = o.querySelector('.gcji-hd');
    return { bg: getComputedStyle(o).backgroundColor, title: hd && hd.textContent, secs: [...o.querySelectorAll('.gcji-sec')].map(x => x.textContent), add: !!o.querySelector('[data-ji-a="add"]'), create: !!o.querySelector('#_jdlCreate'),
      file: !!o.querySelector('[data-ji-files] .gcfp-doc[data-id="D1"]'), arch: !!o.querySelector('[data-ji-arch="D1"]'), auto: (o.querySelector('.gcji-jd') || {}).textContent || '' };
  });
  ok(dp.bg === 'rgb(255, 255, 255)' && /‹ Back/.test(dp.title) && /Documents · Outdoor Entertainment Area/.test(dp.title), 'white page, "‹ Back · Documents · <job>"', dp);
  ok(dp.secs.some(x => /Auto documents/.test(x)) && dp.secs.some(x => /All files/.test(x)) && dp.add && dp.create && dp.file, 'Auto documents · All files (the job\'s files) · ＋ Add file · Create a Document', dp);
  await shot(A, 'jobinfo_07_documents');
  ok(dp.arch, 'a file has 🗄 Archive', dp);
  if (dp.arch) {
    await tap(A, '[data-ji-arch="D1"]');
    const docRow = () => { const L = H.cget('projectDocs'); const a = Array.isArray(L) ? L.find(d => d.id === 'D1') : null; const b = H.cget('doc:D1'); return a || (b && typeof b === 'object' ? b : null); };
    const d1 = await until(() => { const d = docRow(); return d && d.archived === true && d.deleted === true ? d : null; }, 30000);
    ok(!!d1 && d1.name === 'Plans.pdf', 'archived, not deleted: the file stays in the cloud with archived + deleted flags', docRow());
    await sleep(1500);
    const gone = await A.ev(() => ({ inList: !!document.querySelector('[data-ji-files] .gcfp-doc[data-id="D1"]'), archived: (document.querySelector('[data-ji-archived]') || {}).textContent || '' }));
    if (process.env.JI_DEBUG) console.log('    removals: ' + JSON.stringify(await A.ev(() => window.__rm.slice(-6))));
    if (!/Archived files/.test(gone.archived)) console.log('    debug: ' + JSON.stringify(await A.ev(async () => { const v = await window.idbGet('projectDocs'); return { t: typeof v, isA: Array.isArray(v), n: Array.isArray(v) ? v.length : 0, d1: Array.isArray(v) ? v.find(d => d && d.id === 'D1') : String(v).slice(0, 200), crm: ((window._crm || {}).projectDocs || []).length, g: (window._gcProjectDocs || []).length, slot: !!document.querySelector('[data-ji-archived]'), pages: [...document.querySelectorAll('.gcji-page')].map(o => o.getAttribute('data-ji')), sheets: document.querySelectorAll('._gcSheetOv').length, dash: !!document.getElementById('_gcJobDash'), pick: !!document.getElementById('_gcJobPick'), top: [...document.body.children].slice(-4).map(e => e.id || e.className) }; })));
    ok(!gone.inList && /Archived files \(1\)/.test(gone.archived), 'it leaves the list and shows under 🗄 Archived files', gone);
  }
  await A.ev(() => document.querySelectorAll('.gcji-page').forEach(o => o.remove()));

  // ── 📅 the job's schedule ──
  await openDash(A, 'PB'); await sleep(400);
  await tap(A, '#_gcJobDash .gcfp-grid [data-fp="sched"]');
  ok(!!(await H.waitFor(A, () => !!document.querySelector('.gcji-page[data-ji="sched"] .gcji-ev'), null, 8000)), '📅 Schedule & Inspections opens the job\'s own page');
  const sp = await A.ev(() => {
    const o = document.querySelector('.gcji-page[data-ji="sched"]'), past = o.querySelector('details.gcji-past'), add = o.querySelector('.gcji-addbar [data-ji-a="add"]'), nav = document.getElementById('gc-fh-tabs');
    const ar = add && add.getBoundingClientRect(), nr = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect() : null;
    return { bg: getComputedStyle(o).backgroundColor, title: o.querySelector('.gcji-hd').textContent, text: o.querySelector('.gcji-bd').innerText, pastOpen: past ? past.open : null, pastText: past ? past.textContent : '',
      navy: document.querySelectorAll('[style*="background:#0a1524"]').length, add: ar ? { bottom: Math.round(ar.bottom), w: Math.round(ar.width), navTop: nr ? Math.round(nr.top) : null } : null };
  });
  ok(sp.bg === 'rgb(255, 255, 255)' && /Schedule · Outdoor Entertainment Area/.test(sp.title) && !sp.navy, 'a white page "‹ Back · Schedule · <job>" (not the company-wide navy list)', sp);
  ok(/Pour footings/.test(sp.text) && !/Other job item/.test(sp.text), 'only this job\'s items show', sp.text.slice(0, 300));
  ok(sp.pastOpen === false && /Old July item/.test(sp.pastText), 'past items are folded', sp);
  ok(sp.add && sp.add.w >= 300 && (sp.add.navTop == null || sp.add.bottom <= sp.add.navTop), '＋ Add to schedule: full width, above the bottom bar', sp.add);
  await shot(A, 'jobinfo_08_schedule');
  await tap(A, '.gcji-addbar [data-ji-a="add"]');
  await H.waitFor(A, () => !!document.querySelector('.gcji-sf'), null, 5000);
  await fill(A, '.gcji-sf [data-f="title"]', 'Frame pergola');
  await A.page().locator('.gcji-sf [data-f="date"]').fill(day(10));
  await A.page().locator('.gcji-sf [data-f="sub"]').selectOption('SUB1');
  await shot(A, 'jobinfo_09_schedule_add');
  await tap(A, '.gcji-sf [data-ji-a="ssave"]');
  const added = await until(() => (H.cget('schedule') || []).find(x => x.title === 'Frame pergola' && x.pid === 'PB' && x.date === day(10) && x.subId === 'SUB1'), 30000);
  ok(!!added, '＋ Add to schedule reaches the cloud (job preset, the sub, the date)', added);
  await H.waitFor(A, () => /Frame pergola/.test((document.querySelector('.gcji-page[data-ji="sched"] .gcji-bd') || {}).innerText || ''), null, 8000);
  await H.waitFor(A, () => ((window._crm && window._crm.schedule) || []).some(x => x && x.title === 'Frame pergola'), null, 20000);
  const comp = await A.ev(async () => { window._gcOpenFieldSchedule(); await new Promise(r => setTimeout(r, 900)); const ovs = [...document.querySelectorAll('body>div')].filter(d => d.querySelector && d.querySelector('#_fsAdd')); const txt = ovs.map(d => d.innerText).join(' '); ovs.forEach(d => d.remove()); return txt + ' || crm: ' + ((window._crm && window._crm.schedule) || []).map(x => x && x.title).join(','); });
  ok(/Frame pergola/.test(comp) && /Other job item/.test(comp), 'it shows in the company schedule (with the other jobs\' items)', comp.slice(-400));
  await tap(A, '.gcji-page[data-ji="sched"] [data-ji-sid="S1"]');
  await H.waitFor(A, () => !!document.querySelector('.gcji-sf [data-ji-a="sarch"]'), null, 5000);
  await A.page().locator('.gcji-sf [data-f="date"]').fill(day(8));
  await tap(A, '.gcji-sf [data-ji-a="ssave"]');
  const moved = await until(() => (H.cget('schedule') || []).find(x => x.id === 'S1' && x.date === day(8)), 30000);
  ok(!!moved && moved.subId === 'SUB1' && moved.title === 'Pour footings', 'editing a date moves the item (same sub, same task)', moved);
  await sleep(600); await shot(A, 'jobinfo_10_schedule_after');
  ok(!A.errs.length, 'no page errors (admin phone)', A.errs.slice(0, 5));

  // ── the desk shows the edits ──
  const Dk = await H.computer('Desk', { build }); OPEN.push(Dk);
  ok(await H.signIn(Dk, DESK, 20000), 'a desk computer signs in');
  const dsk = await H.waitFor(Dk, () => { const p = ((window._crm && window._crm.projects) || []).find(x => x.id === 'PB'); const cu = p && ((window._crm.customers || []).find(c => c.id === p.customerId) || {}).name; return p && cu && p.name === 'Outdoor Entertainment Area — Phase 1' && p.clientPhone === '901-555-0199' && p.status === 'active' ? { name: p.name, phone: p.clientPhone, status: p.status, cust: ((window._crm.customers || []).find(c => c.id === p.customerId) || {}).name } : null; }, null, 45000);
  ok(!!dsk && dsk.cust === 'Sample Homeowner', 'the desk shows the new job name, the customer phone, Active and the linked customer', dsk);
  /* the desk's progress box calls the same save: an "approved" job set to 30 % there goes active too */
  await Dk.page().mouse.click(700, 5); await sleep(200);
  await Dk.ev(() => window._gcSetProjectPct('PE', 30));
  const pe = await until(() => cproj('PE').status === 'active' && +cproj('PE').pct === 30 ? cproj('PE') : null, 30000);
  ok(!!pe && (pe.statusHistory || []).some(h => h.from === 'approved' && h.to === 'active'), 'the desk\'s progress save (30 %) on an "approved" job → active too', cproj('PE'));
  ok(!Dk.errs.length, 'no page errors (desk)', Dk.errs.slice(0, 5));
  await Dk.close(); await A.close();
  }

  console.log('C. a PM on an iPhone');
  const P = await H.computer('PMPhone', { build, mobile: true, init: INIT }); OPEN.push(P);
  ok(await H.signIn(P, PM, 20000), 'the PM signs in on the phone');
  await H.waitFor(P, () => !!document.querySelector('#_gcJobPick'), null, 45000);
  await H.waitFor(P, () => (window._crm && window._crm.projects || []).length >= 7 && !!window._gcJobInfo, null, 30000); await sleep(2000);
  /* the phone may reload once more right after the sign-in (a fresh account on this computer): wait for the app again */
  await H.waitFor(P, () => !!window._gcJobInfo && !!document.querySelector('#_gcJobPick') && (window._crm && window._crm.projects || []).length >= 7, null, 45000); await sleep(1500);
  console.log('    PM page: ' + JSON.stringify(await P.ev(() => ({ ji: typeof window._gcJobInfo, flag: !!window.__GC_PATCH_JOBINFO__, n: (window._crm && window._crm.projects || []).length, href: location.href, gate: !!document.getElementById('gc-auth-gate') })), null) + ' errs ' + JSON.stringify(P.errs.slice(0, 3)));
  const own = await P.ev(() => ({ PB: window._gcJobInfo.canEdit('PB'), PA: window._gcJobInfo.canEdit('PA'), PO: window._gcJobInfo.canEdit('PO') }));
  ok(own.PB && own.PA && !own.PO, 'the PM may edit his own jobs, not another PM\'s', own);
  await openDash(P, 'PA'); await sleep(400);
  await tap(P, '#_gcJobDash .gcfp-grid [data-fn="info"]');
  await H.waitFor(P, () => !!document.querySelector('.gcji-page[data-ji="info"] .gcji-form'), null, 8000);
  const pmOwn = await P.ev(() => ({ save: !!document.querySelector('.gcji-form [data-ji-a="save"]'), dis: document.querySelector('.gcji-form [data-f="name"]').disabled, pm: document.querySelector('.gcji-form [data-f="pm"]').disabled }));
  ok(pmOwn.save && !pmOwn.dis && pmOwn.pm, 'his own job: editable (the PM field stays with the office)', pmOwn);
  await fill(P, '.gcji-form [data-f="notes"]', 'Cabinets arrive Monday');
  await tap(P, '.gcji-form [data-ji-a="save"]');
  ok(!!(await until(() => cproj('PA').notes === 'Cabinets arrive Monday', 30000)), 'the PM\'s edit on his own job reaches the cloud', cproj('PA').notes);
  await P.ev(() => { document.querySelectorAll('.gcji-page,#_gcJobDash').forEach(o => o.remove()); window._gcOpenJobProfile('PO'); });
  await H.waitFor(P, () => !!document.querySelector('.gcji-page[data-ji="info"] .gcji-form'), null, 8000);
  const pmOther = await P.ev(() => ({ save: !!document.querySelector('.gcji-form [data-ji-a="save"]'), mark: !!document.querySelector('.gcji-form [data-ji-a="active"],.gcji-form [data-ji-st]'), dis: document.querySelector('.gcji-form [data-f="name"]').disabled, note: (document.querySelector('.gcji-form .gcji-note') || {}).textContent }));
  ok(!pmOther.save && !pmOther.mark && pmOther.dis && /Only the office/.test(pmOther.note || ''), 'another PM\'s job: read only (no Save, no status buttons)', pmOther);
  await shot(P, 'jobinfo_11_pm_readonly');
  await P.ev(() => { document.querySelectorAll('.gcji-page').forEach(o => o.remove()); window._gcJobInfo.sched('PO'); });
  await H.waitFor(P, () => !!document.querySelector('.gcji-page[data-ji="sched"]'), null, 5000);
  ok(!(await P.ev(() => !!document.querySelector('.gcji-page[data-ji="sched"] .gcji-addbar'))), 'another PM\'s job: no ＋ Add to schedule');
  ok(!P.errs.length, 'no page errors (PM phone)', P.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
finally { for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`JOBINFO ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
