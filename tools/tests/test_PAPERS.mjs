// test_PAPERS.mjs <build-dir> — patch PAPERS: papers to send — older jobs keep only the basics, papers are suggested, the PM first.
// Owner 11/19: his phone said "Needs you · 📑 285 papers to send", every one "OVERDUE", mostly on jobs from before the papers existed.
//   A. node: the block is in index.html after JOBREQ; one cut-off date and the escalation days are constants; the hooks are in.
//   B. the PM on an iPhone (made-up data, the date stubbed to 11/20): the new job's papers are in Needs you ("suggested", never
//      "OVERDUE"); the older job shows only its basic (the construction agreement), not its scope / permit / selection sheet.
//   C. the office on an iPhone: nothing at 11/20 (1 business day); the other PM's new-job papers at 11/23 (2 business days), tagged office.
//   D. the admin on an iPhone: 40 older jobs + 2 new ones → a handful; the other PM's papers only at 11/26 (5 business days);
//      ⏸ data-entry mode → nothing reaches the admin at all.
//   E. the admin on the desk: the older job's 📑 Paperwork lists the dropped papers as "Not needed (older job)" (kept, not deleted),
//      the agreement as "Suggested by"; ↩ Turn them back on (admin) brings them back and is logged on the job; the To-Dos follow the
//      same routing and an old "escalated" To-Do of a dropped paper is ticked off with the reason, not removed.
// Usage: node test_PAPERS.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_PAPERS.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

console.log('A. node');
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const iR = t.indexOf('<script id="gc-patch-jobreq">'), iP = t.indexOf('<script id="gc-patch-papers">');
ok(iR > 0 && iP > iR, 'the PAPERS block is in index.html, after JOBREQ', { iR, iP });
ok(/var OLDER_BEFORE = '2026-11-19';/.test(t) && /var ESC_OFFICE_BD = 2;/.test(t) && /var ESC_ADMIN_BD = 5;/.test(t), 'one cut-off date and the escalation days are constants');
ok(/W\._gcPapers && W\._gcPapers\.itemState\(p, x\)/.test(t) && /W\._gcPapers\.fieldModel\(\)/.test(t) && /W\._gcPapers\.wanted\(\)/.test(t), 'the JOBDOCS / EPAHUD hooks are in');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const PM = byId('u-pm'), OFFICE = byId('u-office'), ADMIN = byId('u-wesley');
let PAUSED = false;
H.onFn('automation-pause', () => ({ paused: PAUSED, flag: { on: PAUSED } }));
H.onFn('portal-sign', ({ body }) => (body && body.action === 'list' ? { ok: true, items: [] } : { ok: false }));
/* the new jobs start 11/20 → their "before work starts" papers are suggested by 11/19 */
const NEWJ = (id, pm) => ({ id, name: 'New Job ' + id, client: 'Sample Customer ' + id, address: '10 Demo St, Memphis, TN 38135', type: 'Residential Reno', status: 'Active', pm, created: '2026-11-20', startDate: '2026-11-20', contract: 5000, updatedAt: '2026-11-18T12:00:00.000Z' });
function seed(){
  H.resetCloud();
  const projects = [
    { id: 'OLD1', name: 'Older Job One', client: 'Sample Customer A', address: '1 Demo St, Memphis, TN 38135', type: 'Residential Reno', status: 'Active', pm: 'Demo PM', created: '2026-09-08', startDate: '2026-10-01', contract: 9000, updatedAt: '2026-10-01T12:00:00.000Z' },
    { id: 'OLD2', name: 'Older Commercial', client: 'Sample Customer B', address: '2 Demo St, Memphis, TN 38135', type: 'Commercial TI', status: 'Active', pm: 'Other PM', created: '2026-03-17', startDate: '2026-08-01', contract: 50000, updatedAt: '2026-10-01T12:00:00.000Z' },
    NEWJ('NEW1', 'Demo PM'), NEWJ('NEW2', 'Other PM')];
  for (let i = 0; i < 40; i++) projects.push({ id: 'OLDX' + i, name: 'Older Demo ' + i, client: 'Sample Customer ' + i, address: (100 + i) + ' Demo St, Memphis, TN 38135', type: i % 4 ? 'Residential Reno' : 'Commercial TI', status: i === 5 ? 'Completed' : 'Active', pm: 'Other PM', created: '2026-0' + (3 + (i % 6)) + '-1' + (i % 9), startDate: '2026-0' + (4 + (i % 6)) + '-0' + (1 + (i % 8)), contract: 1000 + i, updatedAt: '2026-10-01T12:00:00.000Z' });
  H.cset('projects', projects);
  H.cset('invs', [{ id: 'IV1', pid: 'OLD2', num: 'INV-1', amt: 1000, status: 'sent', type: 'client', date: '2026-09-01' }]);
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', active: true },
    { id: 'u3', name: 'Office Demo', email: OFFICE, role: 'Office', active: true },
    { id: 'u4', name: 'Other PM', role: 'Project Manager', active: true }]);
  /* an old To-Do from before the rule: the office was told about the older job's scope of work */
  const at = '2026-11-18T20:00:00.000Z', T = (id, o) => Object.assign({ id, addedAt: at, updatedAt: at, done: false }, o);
  H.cset('gc_office_tasks', [
    /* the CRM's own To-Dos about jobs (older and new), a person's own To-Do, and an open older job with no phone / e-mail */
    T('TNOPM_OLD1', { kind: 'datacheck', pid: 'OLD1', label: 'Check the permit: Older Job One', addedBy: 'CRM' }),
    T('TNOC_OLD1', { pid: 'OLD1', label: 'No scope written: Older Job One', addedBy: 'System' }),
    T('TPROG_OLDX3', { kind: 'datacheck', pid: 'OLDX3', label: 'Update progress: Older Demo 3 (0%)', addedBy: 'CRM' }),
    T('TNOPM_NEW2', { kind: 'datacheck', pid: 'NEW2', label: 'Check the permit: New Job NEW2', addedBy: 'CRM' }),
    T('TNOC_NEW2', { pid: 'NEW2', label: 'No scope written: New Job NEW2', addedBy: 'System' }),
    T('HAND_OLD1', { kind: 'quick', pid: 'OLD1', label: 'Call Sample Customer A about the deck color', addedBy: 'Wesley Johnson' }),
    T('TCONT_OLD1', { kind: 'datacheck', pid: 'OLD1', label: 'Older Job One: no customer phone or e-mail', addedBy: 'CRM' }),
    T('TCONT_OLDX5', { kind: 'datacheck', pid: 'OLDX5', label: 'Older Demo 5: no customer phone or e-mail', addedBy: 'CRM' }),
    { id: 'EPAHUD_ESC_OLD1_gcb_scope', kind: 'epahud', pid: 'OLD1', label: '⚠ Older Job One: Scope of work is 48 days late — PM Demo PM (office + admins)', assignee: 'Office', prio: 'high', addedBy: 'CRM', addedAt: '2026-11-18T20:00:00.000Z', updatedAt: '2026-11-18T20:00:00.000Z', done: false }]);
  H.cset('gc_epahud_seed_v1', { at: '2026-11-18T00:00:00.000Z' });
  for (const k of ['customers', 'schedule', 'estimates', 'expenses', 'leads', 'vendors', 'subs', 'punch', 'projectDocs']) H.cset(k, []);
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
const PHONE = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
/* page.evaluate that survives the CRM's own reload */
const sev = async (A, f, a) => { for (let i = 0; i < 30; i++) { try { return await A.ev(f, a); } catch (e) { if (!/context was destroyed|navigation|Target closed/i.test(String(e))) throw e; await sleep(1000); } } return A.ev(f, a); };
const DAY = d => `window.__GC_PAPERS_TODAY__ = ${JSON.stringify(d)};`;
const setDay = (A, d) => sev(A, x => { window.__GC_PAPERS_TODAY__ = x; try { window._gcEpaHud._reset(); window._gcEpaHud.fieldPaint(); } catch (e) {} }, d);
const model = A => sev(A, () => window._gcPapers.fieldModel().map(z => ({ pid: z.p.id, k: z.x.k, date: z.d.date, esc: z.esc || '' })));
const home = async A => { for (let i = 0; i < 40; i++) { const v = await sev(A, () => { const b = document.getElementById('gc-ep-field'); return b ? b.innerText : ''; }); if (v && /papers? to send/.test(v)) return v; await sleep(500); } return await sev(A, () => (document.getElementById('gc-ep-field') || {}).innerText || ''); };
const ready = A => H.waitFor(A, () => window._gcPapers && window._gcEpaHud && window._gcJobDocs && (window._crm.projects || []).length >= 44, null, 60000);

const OPEN = [];
try {
  seed();
  console.log('B. the PM on an iPhone (11/20)');
  const pm = await H.computer('PM', { build, mobile: true, init: [PHONE, DAY('2026-11-20')] }); OPEN.push(pm);
  ok(await H.signIn(pm, PM, 20000), 'PM signs in');
  ok(!!await ready(pm), 'the CRM is up with PAPERS, EPAHUD and JOBDOCS');
  const st0 = await sev(pm, () => window._gcPapers.state());
  ok(st0.older === 42 && st0.jobs === 44, 'older jobs: the 42 made / started before 11/19 (the 2 new ones are not)', st0);
  const ob = await sev(pm, () => { const P = id => window._crm.projects.find(p => p.id === id); return { o1: window._gcPapers.older(P('OLD1')), n1: window._gcPapers.older(P('NEW1')) }; });
  ok(ob.o1 === true && ob.n1 === false, 'OLD1 (made 9/8) is older, NEW1 (made 11/20) is not', ob);
  const mp = await model(pm);
  const newK = mp.filter(z => z.pid === 'NEW1').map(z => z.k), oldK = mp.filter(z => z.pid === 'OLD1').map(z => z.k);
  ok(['gcb_contract', 'gcb_scope', 'gcb_permit_auth', 'gcb_selections'].every(k => newK.includes(k)), 'the PM sees the new job\'s papers (agreement, scope, permit, selection sheet)', newK);
  ok(oldK.length === 1 && oldK[0] === 'gcb_contract', 'the older job: only its basic (the construction agreement) — scope / permit / selections are off', oldK);
  ok(!mp.some(z => z.pid === 'NEW2' || z.pid === 'OLD2' || /^OLDX/.test(z.pid)), 'nobody else\'s job is in the PM\'s list', mp.filter(z => z.pid !== 'NEW1' && z.pid !== 'OLD1'));
  const fh = await home(pm);
  ok(/Needs you · 📑 \d+ papers? to send \(suggested\)/i.test(fh) && /Suggested by/.test(fh) && !/OVERDUE/.test(fh), 'GrayCo Field home: "Needs you · 📑 N papers to send (suggested)", "Suggested by …", never "OVERDUE"', fh.slice(0, 600));
  ok(!pm.errs.length, 'no page errors (PM)', pm.errs.slice(0, 5));
  await pm.close();

  console.log('C. the office on an iPhone');
  seed();
  const of = await H.computer('Office', { build, mobile: true, init: [PHONE, DAY('2026-11-20')] }); OPEN.push(of);
  ok(await H.signIn(of, OFFICE, 20000), 'office signs in');
  await ready(of); await H.waitFor(of, () => window._gcIsOfficeFull && window._gcIsOfficeFull(), null, 20000);
  const o1 = await model(of);
  ok(!o1.some(z => /^NEW/.test(z.pid)), '11/20 (1 business day after the date): the new jobs\' papers are still the PMs\' only', o1);
  await setDay(of, '2026-11-23');
  const o2 = await model(of);
  const n2 = o2.filter(z => z.pid === 'NEW2');
  ok(n2.length >= 4 && n2.every(z => z.esc === 'office'), '11/23 (2 business days, a weekend in between): the other PM\'s new-job papers reach the office', o2.slice(0, 8));
  ok(o2.filter(z => /^OLD/.test(z.pid)).every(z => z.k === 'gcb_contract' || z.k === 'gcb_pay_app'), 'older jobs reach the office only with their basics', o2.filter(z => /^OLD/.test(z.pid)).slice(0, 6));
  const fo = await home(of);
  ok(/business days — office/.test(fo), 'the office\'s rows say why they are there ("not sent 2+ business days — office")', fo.slice(0, 500));
  ok(!of.errs.length, 'no page errors (office)', of.errs.slice(0, 5));
  await of.close();

  console.log('D. the admin on an iPhone');
  seed();
  const ad = await H.computer('AdminPhone', { build, mobile: true, init: [PHONE, DAY('2026-11-23')] }); OPEN.push(ad);
  ok(await H.signIn(ad, ADMIN, 20000), 'admin signs in');
  await ready(ad); await H.waitFor(ad, () => window.__GC_AUTH__ && window.__GC_AUTH__.isAdmin && window.__GC_AUTH__.isAdmin(), null, 20000);
  const a1 = await model(ad);
  const all = await ad.ev(() => { let n = 0; window._crm.projects.forEach(p => { n += window._gcEpaHud.toSend(p).length; }); return n; });
  ok(a1.length === 0, '11/23: nothing is in the admin\'s Needs you yet (the PM has it, then the office) — 44 jobs, ' + all + ' papers still to send', a1);
  await setDay(ad, '2026-11-26');
  const a2 = await model(ad);
  ok(a2.length > 0 && a2.length <= 10 && a2.every(z => /^NEW/.test(z.pid) && z.esc === 'admin'), '11/26 (5 business days): only the 2 new jobs\' unsent papers reach the admin — a handful (' + a2.length + ')', a2);
  ok(!a2.some(z => /^OLD/.test(z.pid)), 'no older job ever goes up to the admin', a2);
  const fa = await home(ad);
  ok(/Needs you · 📑 \d+ papers? to send \(suggested\)/i.test(fa) && !/OVERDUE/.test(fa) && /admins/.test(fa), 'the admin\'s Needs you: suggested papers, "— admins", no OVERDUE', fa.slice(0, 500));
  PAUSED = true; await ad.ev(() => window._gcPause.refresh()); await H.waitFor(ad, () => window._gcPause.state().paused, null, 8000);
  const a3 = await model(ad);
  ok(a3.length === 0, '⏸ data-entry mode: nothing escalates to the admin at all', a3);
  const wq = await ad.ev(() => Object.entries(window._gcPapers.wanted()).filter(([k]) => /^EPAHUD_ESC_NEW2_/.test(k)).map(([k, w]) => w.label));
  ok(wq.length && wq.every(l => /\(office\)$/.test(l)), '⏸ data-entry mode: the To-Do stays with the office (not "office + admins")', wq);
  PAUSED = false; await ad.ev(() => window._gcPause.refresh());
  ok(!ad.errs.length, 'no page errors (admin phone)', ad.errs.slice(0, 5));
  await ad.close();

  console.log('E. the admin on the desk');
  seed();
  const dk = await H.computer('AdminDesk', { build, init: [DAY('2026-11-26')] }); OPEN.push(dk);
  ok(await H.signIn(dk, ADMIN, 20000), 'admin signs in (desk)');
  await ready(dk); await H.waitFor(dk, () => window.__GC_AUTH__ && window.__GC_AUTH__.isAdmin && window.__GC_AUTH__.isAdmin(), null, 20000);
  /* the job's 📑 Paperwork card, as the desk job page paints it (window._gcJobDocs.html) */
  const card = id => sev(dk, x => { const p = window._crm.projects.find(q => q.id === x); const d = document.createElement('div'); d.className = 'gc-jd'; d.setAttribute('data-pid', x); d.id = 'pp-test-card'; d.innerHTML = window._gcJobDocs.html(p); const o = document.getElementById('pp-test-card'); if (o) o.remove(); document.body.appendChild(d); return d.innerText; }, id);
  const c1 = await card('OLD1');
  const rowTxt = k => dk.ev(x => { const r = document.querySelector('#pp-test-card [data-jk="' + x + '"]'); return r ? r.innerText : null; }, k);
  const rs = { scope: await rowTxt('gcb_scope'), permit: await rowTxt('gcb_permit_auth'), sel: await rowTxt('gcb_selections'), contract: await rowTxt('gcb_contract') };
  ok(rs.scope && /Not needed \(older job\)/.test(rs.scope) && /Not needed \(older job\)/.test(rs.permit || '') && /Not needed \(older job\)/.test(rs.sel || '') && !/Undo/.test(rs.scope), 'the older job\'s 📑 Paperwork keeps scope / permit / selection sheet, marked "Not needed (older job)"', rs);
  ok(rs.contract && /Suggested (by|before)/.test(rs.contract) && !/OVERDUE|Not needed|Was due/.test(rs.contract), 'its construction agreement stays: "Suggested before …", no OVERDUE / "Was due"', rs.contract);
  ok(/Older job/.test(c1) && /papers? to send \(suggested\)/.test(c1) && /Turn them back on/.test(c1) && !/OVERDUE/.test(c1), 'the card: 🗂 Older job — only the basics … ↩ Turn them back on (admin); "N papers to send (suggested)"', c1.slice(0, 700));
  const wt = await dk.ev(() => Object.keys(window._gcPapers.wanted()));
  ok(!wt.some(k => /^EPAHUD_(ESC_)?OLD1_gcb_(scope|permit_auth|selections)$/.test(k)), 'To-Dos: the dropped papers have none (PM, office or admins)', wt.filter(k => /OLD1/.test(k)));
  ok(wt.includes('EPAHUD_NEW2_gcb_scope') && wt.includes('EPAHUD_ESC_NEW2_gcb_scope'), 'To-Dos: the new job\'s paper → its PM, and 5 business days later the office (+ admins)', wt.filter(k => /NEW2/.test(k)));
  await dk.ev(() => window._gcEpaHud.sweep());
  const tk = await H.waitFor(dk, () => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const x = l.find(y => y.id === 'EPAHUD_ESC_OLD1_gcb_scope'); return x && x.done ? x : null; }, null, 10000);
  ok(tk && tk.done && /not needed \(older job\)/.test(tk.resolution || ''), 'the old "escalated" To-Do of the older job\'s scope of work is ticked off with the reason, still on the list (not removed)', tk);
  // ↩ Turn them back on (admin) → the papers come back, logged on the job; the rule wrote nothing to the job before
  const before = (H.cget('projects') || []).find(p => p.id === 'OLD1') || {};
  ok(!before.jobDocs, 'the rule itself wrote nothing to the older job (no data migration)', before.jobDocs);
  await dk.ev(() => { const b = document.querySelector('#pp-test-card [data-pp="on"]'); if (b) b.click(); });   /* the button on the card (confirm is accepted) */
  let back = null; for (let i = 0; i < 30 && !back; i++) { await sleep(500); await card('OLD1'); back = await dk.ev(() => { const r = document.querySelector('#pp-test-card [data-jk="gcb_scope"]'); return r && !/Not needed/.test(r.innerText) && /Suggested (by|before)/.test(r.innerText) ? r.innerText : null; }); }
  ok(!!back, '↩ Turn them back on: the scope of work is a paper to send again', back);
  const on = await H.waitFor(dk, () => { const p = window._crm.projects.find(x => x.id === 'OLD1'); const J = p && p.jobDocs || {}; return J.olderOn && J.olderOn.on && (J.olderLog || []).length ? { on: J.olderOn, log: J.olderLog } : null; }, null, 10000);
  ok(on && on.on.by && on.log[0].act === 'turned back on', 'the switch is kept on the job (who / when, jobDocs.olderLog)', on);
  let cl = null; for (let i = 0; i < 60 && !cl; i++) { await sleep(500); const p = (H.cget('projects') || []).find(x => x.id === 'OLD1'); if (p && p.jobDocs && p.jobDocs.olderOn && p.jobDocs.olderOn.on) cl = p.jobDocs; }
  ok(!!cl, 'the admin\'s switch reaches the cloud');
  ok(await dk.ev(() => window._gcPapers.fieldModel().some(z => z.p.id === 'OLD1' && z.x.k === 'gcb_scope' && z.esc === 'admin')), 'turned back on, the job follows the full chain: its months-old scope of work now reaches the admin');

  console.log('F. the desk To-Do (admin): older jobs\' auto To-Dos are off, groups start collapsed, ✓ Not needed archives');
  const tdItems = () => sev(dk, () => { const st = window._gcTD2.state(); return st.items.concat(st.snoozed || []).map(x => ({ key: x.key, pid: x.pid || '', title: x.title, src: x.src, kids: (x.children || []).map(c => ({ pid: c.pid || '', title: c.title })) })); });
  await sev(dk, () => { window._gcTD2.paint(); });
  let L = []; for (let i = 0; i < 20; i++) { L = await tdItems(); if (L.some(x => /NEW2/.test(x.title))) break; await sleep(1000); }
  const tl = re => L.filter(x => re.test(x.title));
  ok(tl(/New Job NEW2/).length >= 2, 'a new job\'s auto To-Dos are there ("Check the permit", "No scope written")', L.filter(x => /NEW2/.test(x.title + x.pid)).map(x => x.title));
  ok(!tl(/^Check the permit: Older Job One|^No scope written: Older Job One|^Upload the signed contract$/).filter(x => x.pid === 'OLD1').length && !tl(/Update progress: Older Demo 3/).length, 'an older job\'s auto To-Dos are off ("Check the permit", "No scope written", "Update progress", the signed contract)', L.filter(x => /OLD1|OLDX3/.test(x.pid)).map(x => x.title));
  ok(tl(/about the deck color/).length === 1, 'a To-Do a person wrote by hand on an older job stays', tl(/deck/));
  ok(tl(/Older Job One: no customer phone or e-mail/).length === 1, 'an OPEN older job with no phone / e-mail keeps that To-Do', L.filter(x => x.pid === 'OLD1').map(x => x.title));
  ok(!tl(/Older Demo 5: no customer phone/).length, 'a finished older job gets none at all', tl(/Older Demo 5/));
  const badRoll = L.filter(x => !/phone|e-?mail|subs? /i.test(x.title) && (x.kids || []).some(k => /^OLD/.test(k.pid) && !/phone|e-?mail/i.test(k.title)));
  ok(!badRoll.length, 'roll-ups count newer jobs only (an older job is only in the open-job phone / e-mail one)', L.filter(x => x.kids.length).map(x => [x.title, x.kids.length]));
  // the desk To-Do opens with every group collapsed
  await sev(dk, () => { if (window._setView) window._setView('todo'); });
  let root = await H.waitFor(dk, () => { const r = [...document.querySelectorAll('[data-td2-host]')].find(x => x.offsetParent && x.querySelector('.td2-sec')); return r ? r.getAttribute('data-td2-host') : null; }, null, 20000);
  if (!root) { await sev(dk, () => window._gcTD2.open()); root = await H.waitFor(dk, () => { const r = [...document.querySelectorAll('[data-td2-host]')].find(x => x.offsetParent && x.querySelector('.td2-sec')); return r ? r.getAttribute('data-td2-host') : null; }, null, 20000); }
  const R = '[data-td2-host="' + root + '"]';
  const secs = () => sev(dk, r => [...document.querySelectorAll(r + ' .td2-body > .td2-sec, ' + r + ' .td2-body > div > .td2-sec')].map(x => ({ s: x.getAttribute('data-s'), col: x.classList.contains('col'), n: (x.querySelector('.td2-n') || {}).textContent, t: ((x.querySelector('.td2-st') || {}).textContent || '').slice(0, 40) })), R);
  const s1 = await secs();
  ok(root && s1.length >= 2 && s1.every(x => x.col) && s1.every(x => /^\d+$/.test(x.n || '')), 'the desk To-Do opens with every group collapsed, each with its count (' + s1.map(x => x.t.trim() + ' ' + x.n).join(' · ') + ')', s1);
  const first = s1[0] && s1[0].s;
  await sev(dk, a => { const b = document.querySelector(a.r + ' .td2-sec[data-s="' + a.s + '"] > .td2-sh'); if (b) b.click(); }, { r: R, s: first });
  await sev(dk, () => window._gcTD2.paint()); await sleep(400);
  const s2 = await secs();
  ok(s2.find(x => x.s === first) && !s2.find(x => x.s === first).col, 'a click opens one group, and it stays open while the CRM is open', s2.find(x => x.s === first));
  // ☑ Select → Select all in this group → ✓ Not needed (archived, kept)
  await sev(dk, r => { const b = document.querySelector(r + ' .pp-bar [data-pp-b="sel"]'); if (b) b.click(); }, R);
  await sleep(500);
  const target = L.find(x => x.title === 'Check the permit: New Job NEW2');
  const secOf = await sev(dk, a => { const row = document.querySelector(a.r + ' .td2-row[data-k="' + a.k + '"]'); const sec = row && row.closest('.td2-sec'); return sec ? sec.getAttribute('data-s') : ''; }, { r: R, k: target && target.key });
  ok(!!secOf && await sev(dk, r => document.querySelectorAll(r + ' .pp-sel').length > 0 && !!document.querySelector(r + ' .pp-selall'), R), '☑ Select: a box on every row and "Select all in this group" on every group (admin, desk)', secOf);
  await sev(dk, a => { const b = document.querySelector(a.r + ' .pp-selall[data-pp-all="' + a.s + '"]'); if (b) b.click(); }, { r: R, s: secOf });
  await sleep(800);
  const nsel = await sev(dk, () => Object.keys(window._gcPapers.sel.keys).filter(k => window._gcPapers.sel.keys[k]));
  ok(nsel.includes(target.key), 'Select all in this group picked the group\'s rows (' + nsel.length + ')', nsel);
  await sev(dk, r => { const b = document.querySelector(r + ' .pp-bar [data-pp-b="na"]'); if (b) b.click(); }, R);
  const gone = await H.waitFor(dk, () => !window._gcTD2.state().items.some(x => x.title === 'Check the permit: New Job NEW2'), null, 10000);
  const rec = await sev(dk, () => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').find(t => t.id === 'TNOPM_NEW2'));
  ok(gone && rec && rec.archived === true && rec.done === true && rec.notNeeded && rec.notNeeded.by, '✓ Not needed: off the list, the record is kept (archived, who / when) — not deleted', rec);
  // the generator does not bring it back (it opens it again → still archived)
  await sev(dk, () => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const t = l.find(x => x.id === 'TNOPM_NEW2'); t.done = false; t.updatedAt = new Date().toISOString(); localStorage.setItem('gc_office_tasks', JSON.stringify(l)); window._gcTD2.paint(); });
  await sleep(600);
  ok(!(await tdItems()).some(x => x.title === 'Check the permit: New Job NEW2'), 'a generator that opens it again does not bring it back (archived wins)');
  // 🗄 Show archived → ↩ Restore
  await sev(dk, r => { const b = document.querySelector(r + ' .pp-bar [data-pp-b="arch"]'); if (b) b.click(); }, R);
  const arch = await H.waitFor(dk, r => { const a = document.querySelector(r + ' .pp-arch'); return a && /Check the permit: New Job NEW2/.test(a.innerText) ? a.innerText : null; }, R, 8000);
  ok(!!arch, '🗄 Show archived lists it, with ↩ Restore', arch);
  await sev(dk, r => { const row = [...document.querySelectorAll(r + ' .pp-ar')].find(x => /Check the permit: New Job NEW2/.test(x.innerText)); if (row) row.querySelector('[data-pp-b="restore"]').click(); }, R);
  const back2 = await H.waitFor(dk, () => window._gcTD2.state().items.some(x => x.title === 'Check the permit: New Job NEW2'), null, 10000);
  ok(!!back2, '↩ Restore puts it back on the list');
  // the row ⋯ menu has "✓ Not needed" too
  const mk = await sev(dk, a => { const row = document.querySelector(a.r + ' .td2-row[data-k="' + a.k + '"]'); const m = row && row.querySelector('[data-td2="more"]'); if (m) m.click(); const menu = document.querySelector('.td2-menu'); return menu ? menu.innerText : ''; }, { r: R, k: target.key });
  ok(/Not needed/.test(mk) && /Delete/.test(mk), 'the row\'s ⋯ menu keeps "✓ Not needed (archive)" (and Delete)', mk.slice(0, 300));
  await sev(dk, () => { const m = document.querySelector('.td2-menu [data-m="na"]'); if (m) m.click(); });
  ok(await H.waitFor(dk, () => !window._gcTD2.state().items.some(x => x.title === 'Check the permit: New Job NEW2'), null, 8000), '⋯ → ✓ Not needed archives it too');
  // a fresh open of the CRM: collapsed again
  await dk.page().reload({ waitUntil: 'domcontentloaded' }); await ready(dk);
  await sev(dk, () => { if (window._setView) window._setView('todo'); });
  await H.waitFor(dk, r => !!document.querySelector(r + ' .td2-sec'), R, 20000);
  const s3 = await secs();
  ok(s3.length && s3.every(x => x.col), 'a fresh open: every group collapsed again', s3);
  ok(!dk.errs.length, 'no page errors (desk)', dk.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
finally { for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`PAPERS ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
