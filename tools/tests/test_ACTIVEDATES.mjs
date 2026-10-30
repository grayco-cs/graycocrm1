// test_ACTIVEDATES.mjs <build-dir> — patch ACTIVEDATES: a job goes Active with its dates. Offline harness, made-up data.
//   · a residential roofing job set Active (job page ✏️ Edit Project) asks Start + Estimated finish, refuses a finish
//     before the start, then saves dates + Active together (no save ever has it Active without its dates);
//   · an insurance job asks only the actual construction start (with the TPA hint), no finish;
//   · Cancel keeps the old status; the board path (Projects list status select) is guarded;
//   · an admin's "Skip for now" (Find a job → Make Active helper) sets Active and gives the PM the To-Do;
//   · the schedule's automatic Start / Finish rows follow the new dates, one each (no copies);
//   · the box fits a phone.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wME/harness.mjs';
const { computer, sleep, waitFor, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_ACTIVEDATES.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
resetCloud();
const base = { client: 'Sample Homeowner', address: '100 Demo St, Bartlett TN', pm: 'Pat Manager', contract: 12000, contractStatus: 'signed', drawSchedule: '50/50', depositPaid: true, startDate: '', endDate: '', source: 'grayco', created: new Date().toISOString().slice(0, 10) };
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Pat Manager', email: 'sbiffle@grayco-cs.com', role: 'PM', active: true }]);
cset('projects', [
  Object.assign({}, base, { id: 'P1', name: 'Demo Roof Replacement', type: 'Roofing', status: 'approved', autoPO: 'A101' }),
  Object.assign({}, base, { id: 'P2', name: 'Demo Storm Claim', type: 'Roofing', status: 'approved', isInsurance: true, claimNumber: 'CLM-0001', autoPO: 'A102' }),
  Object.assign({}, base, { id: 'P3', name: 'Demo Kitchen Remodel', type: 'Residential Reno', status: 'approved', autoPO: 'A103' }),
  Object.assign({}, base, { id: 'P4', name: 'Demo Commercial Reroof', type: 'Commercial', status: 'approved', autoPO: 'A104' }),
  Object.assign({}, base, { id: 'P5', name: 'Demo Porch', type: 'Residential Reno', status: 'active', autoPO: 'A105' })]);
/* P1 already has automatic bookends from an earlier date, one of them copied */
cset('schedule', [
  { id: 'SCHa1', pid: 'P1', title: 'Start — Demo Roof Replacement', date: '2026-09-01', time: '08:00', endTime: '17:00', assignee: 'Pat Manager', vendor: '', type: 'milestone', address: base.address, notes: 'Project start (auto)', scope: 'company', by: 'Auto', _autoBookend: 'start' },
  { id: 'SCHa2', pid: 'P1', title: 'Start — Demo Roof Replacement', date: '2026-09-01', time: '08:00', endTime: '17:00', assignee: 'Pat Manager', vendor: '', type: 'milestone', address: base.address, notes: 'Project start (auto)', scope: 'company', by: 'Auto', _autoBookend: 'start' },
  { id: 'SCHa3', pid: 'P1', title: 'Finish — Demo Roof Replacement', date: '2026-09-20', time: '08:00', endTime: '17:00', assignee: 'Pat Manager', vendor: '', type: 'milestone', address: base.address, notes: 'Project finish (auto)', scope: 'company', by: 'Auto', _autoBookend: 'finish' },
  { id: 'S9', pid: 'P3', title: 'Cabinet install', date: '2026-11-03', address: base.address }]);
cset('gc_office_tasks', []);
const c = await computer('AD', { build });
const proj = id => c.ev(id => { const p = (window._crm.projects || []).find(x => x && x.id === id); return p ? JSON.parse(JSON.stringify(p)) : null; }, id);
const box = () => c.ev(() => { const b = document.getElementById('gc-ad-box'); if (!b) return null; return { sd: !!b.querySelector('#gc-ad-sd'), ed: !!b.querySelector('#gc-ad-ed'), hint: (b.querySelector('[data-ad-hint]') || {}).textContent || '', err: (b.querySelector('[data-ad-err]') || {}).textContent || '', skip: !!b.querySelector('[data-ad=skip]'), sdv: (b.querySelector('#gc-ad-sd') || {}).value || '', text: b.innerText }; });
const setDate = (sel, v) => c.ev(([sel, v]) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
const press = a => c.ev(a => { const b = document.querySelector('#gc-ad-box [data-ad=' + a + ']'); b && b.click(); return !!b; }, a);
/* every projects value this computer sent to the cloud */
const sentProjects = () => c.log.filter(x => x.method === 'POST' && /"key":"projects"/.test((x.body || '').slice(0, 40))).map(x => { try { const b = JSON.parse(x.body); const r = Array.isArray(b) ? b[0] : b; return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (e) { return null; } }).filter(Array.isArray);
const sched = () => c.ev(() => { let L = null; window._setSchedule(pr => { L = pr; return pr; }); return JSON.parse(JSON.stringify(L || [])); });
/* the Projects list (the job board) on screen, every job listed */
const ensureList = async () => { for (let i = 0; i < 8; i++) {
  const n = await c.ev(() => [...document.querySelectorAll('main tr')].filter(r => /Demo /.test(r.innerText)).length).catch(() => 0);
  if (n >= 5) return true;
  await c.ev(() => { try { window._openJobDetail(null); } catch (e) {} if (window._setView) window._setView('projects'); }); await sleep(900);
  await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /🏢 All$/.test(x.innerText.replace(/\s+/g, ' ').trim())); b && b.click(); }); await sleep(900);
} return false; };
const rowSelect = async (pid, val) => { await ensureList(); return c.ev(([pid, val]) => {
  const name = window._crm.projects.find(x => x.id === pid).name;
  const tr = [...document.querySelectorAll('main tr')].find(r => r.innerText.includes(name)); if (!tr) return 'no row';
  const sel = [...tr.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'on_hold')); if (!sel) return 'no select';
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, val);
  sel.dispatchEvent(new Event('change', { bubbles: true })); return 'ok';
}, [pid, val]); };
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 15000);
  const p = c.page(); await p.setViewportSize({ width: 1366, height: 860 }); await sleep(4000);
  ok(await c.ev(() => !!window._gcAD), 'the ACTIVEDATES rules are loaded');

  /* ── 1. residential roofing, job page ✏️ Edit Project → status active → Save ── */
  console.log('1. roofing job (job page Edit Project)');
  await c.ev(() => window._setView('projects')); await sleep(1500);
  await c.ev(() => { const j = window._crm.projects.find(x => x && x.id === 'P1'); window._openJobDetail(j); }); await sleep(2000);
  await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /Edit Project/.test(x.textContent)); b && b.click(); }); await sleep(800);
  const chose = await c.ev(() => { const sel = [...document.querySelectorAll('main select')].find(s => [...s.options].some(o => o.value === 'on_hold') && s.value === 'approved'); if (!sel) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, 'active'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; });
  ok(chose, 'Edit Project: Status set to active'); await sleep(400);
  const sent0 = c.log.length;
  await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => x.textContent.trim() === 'Save'); b && b.click(); }); await sleep(700);
  let bx = await box();
  ok(bx && bx.sd && bx.ed && !bx.hint, 'Save asks for the Start date AND the Estimated finish date', bx);
  ok(bx && bx.skip, 'an admin sees "Skip for now"');
  ok((await proj('P1')).status === 'approved', 'nothing is saved while the box is open');
  await setDate('#gc-ad-sd', '2026-11-10'); await setDate('#gc-ad-ed', '2026-11-05'); await press('save'); await sleep(400);
  bx = await box();
  ok(bx && /can.t be before the start/.test(bx.err), 'a finish before the start is refused', bx && bx.err);
  ok((await proj('P1')).status === 'approved', '…and the job is still not Active');
  await setDate('#gc-ad-ed', '2026-11-20'); await press('save');
  const p1 = await waitFor(c, () => { const p = window._crm.projects.find(x => x.id === 'P1'); return p && p.status === 'active' ? JSON.parse(JSON.stringify(p)) : null; }, null, 8000);
  ok(!(await box()), 'the box closes');
  ok(p1 && p1.startDate === '2026-11-10' && p1.endDate === '2026-11-20', 'the job is Active with Start 11/10 and finish 11/20', p1 && { st: p1.status, sd: p1.startDate, ed: p1.endDate });
  await sleep(3500);
  const sends = sentProjects().map(l => l.find(x => x && x.id === 'P1')).filter(Boolean);
  ok(sends.some(x => x.status === 'active' && x.startDate === '2026-11-10' && x.endDate === '2026-11-20'), 'the cloud got the job Active with its dates', sends.map(x => x.status + ' ' + x.startDate + '→' + x.endDate));
  ok(!sends.some(x => x.status === 'active' && !(x.startDate && x.endDate)), 'no save ever sent it Active without its dates');

  /* ── 6. the schedule bookends follow (one Start, one Finish, on the new dates) ── */
  console.log('2. schedule bookends');
  await c.ev(() => { window.__GC_IS_TYPING__ = false; window.__GC_IS_ACTIVE__ = false; try { window._gcSyncBookends(); } catch (e) {} }); await sleep(2500);
  let bk = await waitFor(c, () => { let L = null; window._setSchedule(pr => { L = pr; return pr; }); const r = (L || []).filter(x => x && x.pid === 'P1' && x._autoBookend);
    const st = r.filter(x => x._autoBookend === 'start'), fi = r.filter(x => x._autoBookend === 'finish');
    return st.length === 1 && fi.length === 1 && st[0].date === '2026-11-10' && fi[0].date === '2026-11-20' ? { st: st.map(x => x.date), fi: fi.map(x => x.date) } : null; }, null, 20000, 500);
  const sc = await sched();
  const s1 = sc.filter(x => x && x.pid === 'P1' && x._autoBookend);
  ok(!!bk, 'the Start / Finish bookends moved to 11/10 and 11/20, one of each (the copy is gone)', s1.map(x => x._autoBookend + ' ' + x.date + ' ' + x.id));
  ok(sc.some(x => x && x.id === 'S9'), 'other schedule rows are untouched');

  /* ── 2. insurance job, on the board (Projects list status select) ── */
  console.log('3. insurance job (Projects list / board select)');
  await c.ev(() => window._openJobDetail(null)); await sleep(600);
  await c.ev(() => window._setView('projects')); await sleep(1500);
  await c.ev(() => window._openJobDetail(null)); await sleep(1200);
  await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /🏢 All$/.test(x.innerText.replace(/\s+/g, ' ').trim())); b && b.click(); }); await sleep(1200);
  await c.ev(() => window._openJobDetail(null)); await sleep(800);
  let r = await rowSelect('P2', 'active'); ok(r === 'ok', 'the board row select set to active', r); await sleep(700);
  bx = await box();
  ok(bx && bx.sd && !bx.ed, 'an insurance job asks only for the construction start (no finish date)', bx);
  ok(bx && /Follow the TPA.s schedule; log the actual start date of construction\./.test(bx.hint), 'with the hint "Follow the TPA’s schedule; log the actual start date of construction."', bx && bx.hint);
  ok(bx && /Actual construction start date/.test(bx.text), 'the field is "Actual construction start date"');
  ok((await proj('P2')).status === 'approved', 'the board change waits for the box');
  await press('save'); await sleep(300);
  bx = await box(); ok(bx && /construction start/.test(bx.err), 'an empty start is refused', bx && bx.err);
  await setDate('#gc-ad-sd', '2026-11-12'); await press('save');
  const p2 = await waitFor(c, () => { const p = window._crm.projects.find(x => x.id === 'P2'); return p && p.status === 'active' ? JSON.parse(JSON.stringify(p)) : null; }, null, 8000);
  ok(p2 && p2.startDate === '2026-11-12' && p2.constructionStart === '2026-11-12' && !p2.endDate, 'the insurance job is Active with its construction start, and no finish date', p2 && { st: p2.status, sd: p2.startDate, cs: p2.constructionStart, ed: p2.endDate });
  await sleep(3000);
  const sends2 = sentProjects().map(l => l.find(x => x && x.id === 'P2')).filter(Boolean);
  ok(sends2.some(x => x.status === 'active' && x.constructionStart === '2026-11-12') && !sends2.some(x => x.status === 'active' && !x.constructionStart), 'the board save sent it Active with its construction start (never without)', sends2.map(x => x.status + ' ' + x.constructionStart));

  /* ── 3. Cancel keeps the old status ── */
  console.log('4. Cancel');
  r = await rowSelect('P3', 'active'); await sleep(700);
  bx = await box(); ok(bx && bx.sd && bx.ed, 'a residential job on the board asks for both dates');
  await press('cancel'); await sleep(1200);
  const p3 = await proj('P3');
  ok(!(await box()) && p3.status === 'approved' && !p3.startDate, 'Cancel: the job keeps its old status (approved), nothing saved', p3 && p3.status);
  await ensureList();
  const selVal = await c.ev(() => { const tr = [...document.querySelectorAll('main tr')].find(r => r.innerText.includes('Demo Kitchen Remodel')); const sel = tr && [...tr.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'on_hold')); return sel ? sel.value : null; });
  ok(selVal === 'approved', 'the board select shows approved again', selVal);
  /* other statuses and jobs already Active are not asked */
  r = await rowSelect('P3', 'on_hold'); await sleep(900);
  ok(!(await box()) && (await proj('P3')).status === 'on_hold', 'another status (on hold) is not asked');
  const p5ask = await c.ev(() => window._gcAD.block(window._crm.projects.find(x => x.id === 'P5'), 'active', function(){}, {}));
  ok(p5ask === false && !(await box()), 'a job that is already Active is not asked');

  /* ── 4. admin "Skip for now" → Active + the PM's To-Do ── */
  console.log('5. admin Skip for now (Find a job → Make Active)');
  const mk = c.ev(() => window._gcMakeJobActive('P4').then(x => !!x));
  await sleep(800);
  bx = await box(); ok(bx && bx.skip, 'Make Active asks too, with Skip for now for an admin');
  await press('skip');
  ok(await mk, 'Make Active finished');
  const p4 = await waitFor(c, () => { const p = window._crm.projects.find(x => x.id === 'P4'); return p && p.status === 'active' ? JSON.parse(JSON.stringify(p)) : null; }, null, 8000);
  ok(p4 && p4.activeDatesSkipped && !p4.endDate, 'the job is Active (skipped, no dates)', p4 && { st: p4.status, sk: p4.activeDatesSkipped });
  const td = await waitFor(c, () => { let l = []; try { l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); } catch (e) {} const t = l.find(x => x && x.label === 'Add start/finish dates for Demo Commercial Reroof'); return t ? t : null; }, null, 8000);
  ok(td && td.pid === 'P4' && (td.assignees || []).includes('sbiffle@grayco-cs.com') && td.assignee === 'Pat Manager' && !td.done, 'the PM has the To-Do "Add start/finish dates for Demo Commercial Reroof"', td);
  /* the voice path / any setter: a direct helper call on a job that needs dates is guarded too */
  const vb = await c.ev(() => { const j = window._crm.projects.find(x => x.id === 'P3'); return !!window._gcAD.needs(j) && window._gcAD.isActive('In Progress'); });
  ok(vb, '"In Progress" counts as Active and P3 still needs its dates');

  /* ── New Project created with Status = active (the form's own select) ── */
  console.log('6. + New Project with Status active');
  await ensureList();
  await p.getByText('+ New Project', { exact: true }).first().click(); await sleep(1000);
  const nf = await c.ev(() => { const lab = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && /^NAME$/i.test((e.textContent || '').trim())); const inp = lab && lab.parentElement.querySelector('input'); if (inp) inp.focus(); return !!inp; });
  if (nf) await p.keyboard.type('Demo New Roof', { delay: 5 });
  const nsel = await c.ev(() => { const sel = [...document.querySelectorAll('main select')].find(s => [...s.options].some(o => o.value === 'on_hold') && !s.closest('tr')); if (!sel) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, 'active'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; });
  ok(nf && nsel, 'the new-project form: name typed, Status set to active'); await sleep(400);
  await c.ev(() => { const b = [...document.querySelectorAll('main button')].filter(x => x.offsetParent).find(x => /^create\b/i.test((x.innerText || '').trim())); b && b.click(); }); await sleep(700);
  bx = await box(); ok(bx && bx.sd && bx.ed, 'Create asks for both dates first');
  ok(!(await c.ev(() => window._crm.projects.some(x => x && x.name === 'Demo New Roof'))), '…and nothing is created yet');
  await setDate('#gc-ad-sd', '2026-12-01'); await setDate('#gc-ad-ed', '2026-12-09'); await press('save');
  const np = await waitFor(c, () => { const x = window._crm.projects.find(x => x && x.name === 'Demo New Roof'); return x ? JSON.parse(JSON.stringify(x)) : null; }, null, 8000);
  ok(np && np.status === 'active' && np.startDate === '2026-12-01' && np.endDate === '2026-12-09', 'the new job is created Active with its dates', np && { st: np.status, sd: np.startDate, ed: np.endDate });

  /* ── 5. phone width ── */
  console.log('7. phone width');
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(500);
  c.ev(() => window._gcAD.ask({ id: 'X', name: 'A job with a long name for a phone screen', type: 'Roofing' }));
  await sleep(500);
  const ph = await c.ev(() => { const b = document.getElementById('gc-ad-box'); const r = b.getBoundingClientRect(); const ins = [...b.querySelectorAll('input,button')].map(x => x.getBoundingClientRect()); return { l: r.left, r: r.right, w: innerWidth, sw: document.documentElement.scrollWidth, inOk: ins.every(x => x.left >= r.left - 1 && x.right <= r.right + 1) }; });
  ok(ph.l >= 15 && ph.r <= ph.w - 15 && ph.inOk && ph.sw <= ph.w, 'the box fits a 390-px phone with a 16-px gutter', ph);
  await press('cancel');

  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await c.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
