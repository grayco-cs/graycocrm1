// test_TENTPOST.mjs <build-dir> — patch TENTPOST (owner 11/25): "when I change a job to active and it has a tentative schedule, ask if
// we want to post that as the schedule or edit it before posting the schedule."
//   · a person sets a job with 3 tentative items Active → the card (✅ Post · ✏️ Edit first · Later); ✅ Post → no longer tentative,
//     the job's scheduleHistory has the line; ✏️ Edit first → 📅 Schedule on 📋 Tentative filtered to the job, "✅ Post all" works;
//     Later → a To-Do for the job's superintendent; no tentative items → no card; a status that came by sync → no card;
//     the desk job page's save holds the items for the question (no silent post); once per activation; no page errors; phone width.
// Usage: node test_TENTPOST.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs) — made-up data, nothing leaves the machine.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_TENTPOST.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
const D0 = new Date(); const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const day = n => ymd(new Date(Date.now() + n * 864e5));
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u9', name: 'Demo Super', email: 'super@grayco-cs.com', role: 'Superintendent', active: true }]);
const job = (id, name, extra) => Object.assign({ id, po: 'PO-' + id, name, client: 'Sample Homeowner ' + id, address: id + ' Demo St', pm: 'Sample PM', status: 'bidding', contract: 10000, updatedAt: ago(3), created: '2026-11-20' }, extra || {});
H.cset('projects', [job('J1', 'Tent One Kitchen'), job('J2', 'Tent Two Bath'), job('J3', 'Tent Three Roof', { superintendent: 'Demo Super' }), job('J4', 'No Tent Deck'),
  job('J5', 'Synced Siding'), job('J6', 'Desk Save Porch'), job('J7', 'Phone Fence')]);
const tent = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: 'T_' + pid + '_' + i, pid, title: pid + ' phase ' + (i + 1), date: day(3 + i), time: '08:00', endTime: '17:00', type: 'work', scope: 'tentative', tentative: true, by: 'Sample PM', notes: 'Tentative from proposal' }));
H.cset('schedule', [].concat(tent('J1', 3), tent('J2', 2), tent('J3', 2), tent('J5', 2), tent('J6', 2), tent('J7', 2),
  [{ id: 'C_J4', pid: 'J4', title: 'J4 real day', date: day(4), scope: 'company', type: 'work' }]));
H.cset('leads', []); H.cset('punch', []);
const OPEN = [];
async function open(email, who, opt){
  const c = await H.computer(who, Object.assign({ build }, opt || {})); OPEN.push(c);
  await H.signIn(c, email, 9000);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 7 && (window._crm.schedule || []).length >= 13 && !!window._gcTentPost && !!window._gcxPatchJob, null, 40000);
  await sleep(2500);
  return c;
}
const setStatus = (c, pid, st) => c.ev(([p, v]) => window._gcxPatchJob(p, { status: v }, 'job status'), [pid, st]);
const dock = c => c.ev(() => { const d = document.getElementById('gc-tp-dock'); if (!d) return null; const r = d.getBoundingClientRect(); return { pid: d.getAttribute('data-pid'), mode: d.getAttribute('data-mode'), txt: d.innerText.replace(/\s+/g, ' ').trim(), btn: [...d.querySelectorAll('[data-tp]')].map(b => b.getAttribute('data-tp')), r: { l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight } }; });
const tentLeft = (c, pid) => c.ev(p => (window._crm.schedule || []).filter(x => x && x.pid === p && (x.tentative === true || x.scope === 'tentative')).length, pid);
const cloudTent = pid => (H.cget('schedule') || []).filter(x => x && x.pid === pid && (x.tentative === true || x.scope === 'tentative')).length;
async function waitCloud(fn, ms){ const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (fn()) return true; await sleep(500); } return false; }
const tasksC = () => { let v = H.cget('gc_office_tasks'); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return Array.isArray(v) ? v : (v && Array.isArray(v.list) ? v.list : (v && Array.isArray(v.items) ? v.items : [])); };
const click = (c, sel) => c.ev(s => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel);
try {
  const A = await open('wjohnson@grayco-cs.com', 'owner');
  const e0 = A.errs.length;
  // 1 · J1: a person sets it Active → the card → ✅ Post
  await setStatus(A, 'J1', 'active');
  const d1 = await H.waitFor(A, () => { const d = document.getElementById('gc-tp-dock'); return d && d.getAttribute('data-pid') === 'J1' ? d.innerText : null; }, null, 10000);
  const k1 = await dock(A);
  ok(!!d1 && /Tent One Kitchen/.test(k1.txt) && /3 tentative schedule items/.test(k1.txt) && k1.btn.join() === 'post,edit,later', 'a person sets J1 (3 tentative items) Active → the inline card: ✅ Post as the schedule · ✏️ Edit first · Later', k1);
  ok(await A.ev(() => !document.querySelector('[role=dialog][aria-modal=true]') && getComputedStyle(document.getElementById('gc-tp-dock')).position === 'fixed' && document.getElementById('gc-tp-dock').getBoundingClientRect().height < innerHeight / 3), 'not a popup: a strip at the bottom, the screen stays usable');
  await sleep(2000);
  ok((await tentLeft(A, 'J1')) === 3 && cloudTent('J1') === 3, 'activated, not posted yet: J1\'s 3 rows are still tentative (no automatic move to the company schedule)', { page: await tentLeft(A, 'J1'), cloud: cloudTent('J1') });
  await click(A, '#gc-tp-dock [data-tp="post"]');
  ok(!!(await H.waitFor(A, () => (window._crm.schedule || []).filter(x => x.pid === 'J1' && (x.tentative || x.scope === 'tentative')).length === 0, null, 8000)), '✅ Post: J1\'s items are the schedule now (not tentative)', await tentLeft(A, 'J1'));
  ok(await waitCloud(() => cloudTent('J1') === 0 && (H.cget('schedule') || []).filter(x => x.pid === 'J1' && x.scope === 'company' && x.postedBy).length === 3), 'the posted items reach the cloud, scope company, stamped postedBy', (H.cget('schedule') || []).filter(x => x.pid === 'J1'));
  ok(await waitCloud(() => { const p = (H.cget('projects') || []).find(x => x.id === 'J1'); return !!p && (p.scheduleHistory || []).some(h => /Posted the tentative schedule \(3 items\)/.test(h.what)); }, 30000), 'the job\'s scheduleHistory has "Posted the tentative schedule (3 items)"', { page: await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'J1'); return p && { sh: p.scheduleHistory, st: p.status }; }), cloud: ((H.cget('projects') || []).find(x => x.id === 'J1') || {}).scheduleHistory, errs: await A.ev(() => window._gcTentPost.state().stats.errs) });
  ok(!(await dock(A)), 'the card is gone after ✅ Post');
  // 2 · J2: ✏️ Edit first → the Tentative tab, filtered → ✅ Post all
  await setStatus(A, 'J2', 'active');
  await H.waitFor(A, () => { const d = document.getElementById('gc-tp-dock'); return d && d.getAttribute('data-pid') === 'J2'; }, null, 10000);
  await click(A, '#gc-tp-dock [data-tp="edit"]'); await sleep(2000);
  const sv = await A.ev(() => ({ view: localStorage.getItem('grayco_view'), setter: typeof window._gcSchedSet, txt: (document.querySelector('main') || document.body).innerText, dock: (document.getElementById('gc-tp-dock') || {}).innerText || '' }));
  ok(sv.view === 'schedule' && sv.setter === 'function', '✏️ Edit first opens 📅 Schedule', { view: sv.view, setter: sv.setter });
  ok(/J2 phase 1/.test(sv.txt) && !/J3 phase 1/.test(sv.txt) && !/J5 phase 1/.test(sv.txt), 'the Schedule shows J2\'s tentative items only (📋 Tentative tab, filtered to the job)', sv.txt.slice(0, 400));
  ok(/Post all for Tent Two Bath/.test(sv.dock), 'a "✅ Post all for <job>" strip is on the Schedule', sv.dock);
  ok((await tentLeft(A, 'J2')) === 2, '✏️ Edit first leaves J2\'s rows tentative until ✅ Post all', await tentLeft(A, 'J2'));
  await click(A, '#gc-tp-dock [data-tp="postall"]');
  ok(!!(await H.waitFor(A, () => (window._crm.schedule || []).filter(x => x.pid === 'J2' && (x.tentative || x.scope === 'tentative')).length === 0, null, 8000)) && await waitCloud(() => cloudTent('J2') === 0), '✅ Post all: J2\'s items are the schedule now');
  await A.ev(() => window._setView('dashboard')); await sleep(800);
  // 3 · J3: Later → a To-Do for the job's superintendent
  await setStatus(A, 'J3', 'active');
  await H.waitFor(A, () => { const d = document.getElementById('gc-tp-dock'); return d && d.getAttribute('data-pid') === 'J3'; }, null, 10000);
  await click(A, '#gc-tp-dock [data-tp="later"]');
  const tdOk = t => t.id === 'TENTPOST_J3' && t.assignee === 'Demo Super' && t.pmCc === 'Sample PM' && !t.done && /Post the tentative schedule for Tent Three Roof/.test(t.label);
  const local = await A.ev(() => { try { return JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => t && /TENTPOST/.test(t.id)); } catch (e) { return []; } });
  ok(local.some(tdOk), 'Later: a To-Do "📅 Post the tentative schedule for <job>" for the job\'s superintendent (PM named)', local);
  ok(await waitCloud(() => tasksC().some(tdOk)), 'the To-Do reaches the shared To-Do list (cloud)', { raw: typeof H.cget('gc_office_tasks'), n: tasksC().length });
  await sleep(4000);
  ok(!(await dock(A)) && (await tentLeft(A, 'J3')) === 2, 'Later: the card goes and does not come back (once per activation); J3 stays tentative', await dock(A));
  // 4 · J4: nothing tentative → no card
  await setStatus(A, 'J4', 'active'); await sleep(4500);
  ok(!(await dock(A)), 'a job with no tentative items → no card');
  // 5 · J5: a status that arrived by sync (no person stamp) → no card
  await A.ev(() => { const old = new Date(Date.now() - 5 * 60e3).toISOString(); window._setProjects(prev => prev.map(p => p.id === 'J5' ? Object.assign({}, p, { status: 'active', updatedAt: old }) : p)); }); await sleep(4500);
  ok(!(await dock(A)) && (await tentLeft(A, 'J5')) === 2, 'a status changed by sync (not a person here) → no card, nothing posted', await A.ev(() => ((window._crm.projects.find(p => p.id === 'J5') || {})._fe || null)));
  // 6 · J6: the desk job page's save (it used to post the tentative items silently) → held for the question
  await A.ev(() => window._gcSyncScheduleToStatus('J6', 'active')); await sleep(2500);
  const k6 = await dock(A);
  ok(!!k6 && k6.pid === 'J6' && (await tentLeft(A, 'J6')) === 2, 'the desk job page\'s save to Active: the items are held and the card asks (no silent post)', { k6, left: await tentLeft(A, 'J6') });
  await click(A, '#gc-tp-dock [data-tp="post"]');
  ok(!!(await H.waitFor(A, () => (window._crm.schedule || []).filter(x => x.pid === 'J6' && (x.tentative || x.scope === 'tentative')).length === 0, null, 8000)), 'J6: ✅ Post works from that card too');
  ok(await A.ev(() => { let n = 0; const f = window._gcSyncScheduleToStatus; return typeof f === 'function'; }), 'other statuses still go through the old schedule sync');
  ok(A.errs.length === e0 && !A.errs.length, 'owner: no page errors', A.errs.slice(0, 3));
  await A.close(); OPEN.length = 0;

  // 7 · phone width
  const P = await open('wjohnson@grayco-cs.com', 'phone', { mobile: true });
  await setStatus(P, 'J7', 'active');
  await H.waitFor(P, () => { const d = document.getElementById('gc-tp-dock'); return d && d.getAttribute('data-pid') === 'J7'; }, null, 10000);
  const k7 = await dock(P);
  ok(!!k7 && k7.r.l >= 0 && k7.r.r <= k7.r.w && k7.r.b <= k7.r.h && await P.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1), 'phone (390 px): the card fits on screen, no sideways scroll', k7);
  const bh = await P.ev(() => Math.min(...[...document.querySelectorAll('#gc-tp-dock [data-tp]')].map(b => b.getBoundingClientRect().height)));
  ok(bh >= 40, 'phone: the buttons are big enough to tap', bh);
  ok(!P.errs.length, 'phone: no page errors', P.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of OPEN) await x.close().catch(() => {});
console.log(`TENTPOST ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
