// test_LEADWATCH.mjs <build-dir> — patch LEADWATCH in the CRM page (offline harness, made-up data; the real snapshot only read, part D).
//   A. node: the rule is inlined word for word (window._gcLeadWatchCore = netlify/functions/_lib/lead-watch.js); the TD2 hook sits after
//      PAPERS'; the "from now on" day is PAPERS' OLDER_BEFORE (one constant, no second date in the block).
//   B. the owner (admin role) on the desk: Leads → "🚨 Leads at risk" lists the website lead with no PM for 6 h, the phone lead Pat has not
//      contacted for 30 h and the Mitigation lead (the Leads page's "Construction leads" view hides it — the card does not, and the
//      company filter lets it through); not the bid invite, not the contacted lead, not the 2-hour-old lead; Open opens the lead.
//      The To-Do (Leads & bids) has the leads at risk. A PM sees no card; the PM's own late lead is his To-Do.
//   C. To-Do only from now on (stubbed day 11/20): an auto To-Do about an older job / an older lead / an old setup seed / a "↩ Fix and
//      resend" from before 11/19 is not shown; kept: a new job's To-Do, an overdue invoice, an approval, a sub's COI, a hand-written
//      To-Do from October, a lead at risk; the desk note says how many are not shown; the admin's "Show them" brings them back.
//   E. GOOD (or assigned, no BAD) → a job in Projects, status bidding, the lead's PO; BAD → never a job, a job already made is archived as
//      "bad lead"; leads from before OLDER_BEFORE are left alone; #job=<id> opens the job.
//   D. the real snapshot (when the scratchpad has it): the owner's phone Field home shows the card; the admin / office / PM To-Do counts.
// Usage: node test_LEADWATCH.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; GC_SNAP = a snapshot dir)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SNAP = process.env.GC_SNAP || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qa/snap/2026-11-19T05-08-16';
const build = process.argv[2];
if (!build) { console.error('usage: node test_LEADWATCH.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

console.log('A. node');
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(build, 'netlify/functions/_lib/lead-watch.js'), 'utf8').replace(/\n+$/, '');
const iP = t.indexOf('<script id="gc-patch-papers">'), iL = t.indexOf('<script id="gc-patch-leadwatch">');
ok(iP > 0 && iL > iP, 'the LEADWATCH block is in index.html, after PAPERS', { iP, iL });
const a = t.indexOf('/* __LEADWATCH_CORE_BEGIN__'), b = t.indexOf('/* __LEADWATCH_CORE_END__ */');
const inl = t.slice(t.indexOf('\n', a) + 1, b).replace(/\n+$/, '');
ok(a > 0 && b > a && inl === core, 'lead-watch.js is inlined word for word', { a, b, len: [inl.length, core.length] });
const blk = t.slice(iL, t.indexOf('</script>', iL));
ok(/W\._gcPapers && W\._gcPapers\.OLDER_BEFORE/.test(blk) && !/20\d\d-\d\d-\d\d'/.test(blk.slice(blk.indexOf('(function(W){', b - iL))), 'the cut-off is PAPERS\' OLDER_BEFORE (no second date)');
const hp = t.indexOf('/* PAPERS: an older job\'s auto To-Dos are off */'), hl = t.indexOf('W._gcLeadWatch.filterRaw(raw, proj)');
ok(hp > 0 && hl > hp && hl - hp < 400, 'TD2 runs the LEADWATCH filter right after PAPERS\'');
ok(!/wjohnson|nthomas|Wesley|Nick/i.test(blk), 'no names or e-mails in the block (roles decide)');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const PM = byId('u-pm'), ADMIN = byId('u-wesley'), OFFICE = byId('u-office');
H.onFn('automation-pause', () => ({ paused: false, flag: { on: false } }));
const NOW = Date.parse('2026-11-20T17:00:00Z');   /* Fri 11/20, 11:00 AM Central */
const iso = h => new Date(NOW - h * 3600e3).toISOString();
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', active: true },
    { id: 'u3', name: 'Office Demo', email: OFFICE, role: 'Office', active: true }]);
  H.cset('leads', [
    { id: 'LW_WEB', name: 'Website lead — Sample Home A', contactName: 'Sample Home A', phone: '(901) 555-0101', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(6), leadKind: 'Residential', companyId: 'construction' },
    { id: 'LW_PH', name: 'Johnson', contactName: 'Sample Home B', phone: '(901) 555-0102', source: 'Phone call', stage: 'New Lead', createdAt: iso(40), pm: 'Demo PM', pmEmail: PM, assignedAt: iso(30), leadKind: 'Residential', companyId: 'construction' },
    { id: 'LW_MIT', name: 'Water in the basement', contactName: 'Sample Home C', phone: '(901) 555-0103', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(5), leadKind: 'Residential', type: 'Water Damage', companyId: 'mitigation' },
    { id: 'LW_OK', name: 'Contacted already', contactName: 'Sample Home D', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(50), pm: 'Demo PM', pmEmail: PM, assignedAt: iso(49), contactedAt: iso(48), companyId: 'construction' },
    { id: 'LW_NEW', name: 'Just came in', contactName: 'Sample Home E', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, stage: 'New Lead', createdAt: iso(2), companyId: 'construction' },
    { id: 'LEADIN-bid1', name: 'Generator-Animal Shelter', source: 'City of Bartlett', origin: 'watch', leadKind: 'Government', bidRole: 'prime', stage: 'New Lead', createdAt: iso(60), bidDue: '2026-12-03T14:00', companyId: 'construction' },
    { id: 'LW_G', name: 'Google lead marked good', contactName: 'Sample Home G', source: 'Google LSA', lsaCheck: 'good', stage: 'New Lead', createdAt: iso(3), pm: 'Demo PM', pmEmail: PM, assignedAt: iso(2), contactedAt: iso(1), companyId: 'construction', autoPO: 'Q123' },
    { id: 'LW_B', name: 'Bad lead with a job', contactName: 'Sample Home H', source: 'Google LSA', lsaCheck: 'bad', lostReason: 'LSA — not a real lead (spam)', stage: 'Lost', createdAt: iso(4), pid: 'PBAD', companyId: 'construction' },
    { id: 'LW_B2', name: 'Bad lead, no job', contactName: 'Sample Home I', source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, lsaCheck: 'bad', lostReason: 'Not a real lead (spam)', stage: 'Lost', createdAt: iso(4), pm: 'Demo PM', pmEmail: PM, companyId: 'construction' },
    { id: 'LOLD1', name: 'Old lead', contactName: 'Sample Old', source: 'Phone call', stage: 'New Lead', createdAt: '2026-10-02T15:00:00.000Z', pm: 'Demo PM', pmEmail: PM, assignedAt: '2026-10-02T15:00:00.000Z', companyId: 'construction' }]);
  H.cset('projects', [
    { id: 'POLD', name: 'Older Job', client: 'Sample Customer A', status: 'Active', pm: 'Demo PM', created: '2026-09-08', startDate: '2026-10-01', contract: 9000 },
    { id: 'PBAD', name: 'Bad lead with a job', client: 'Sample Home H', status: 'bidding', leadId: 'LW_B', created: '2026-11-20', contract: 0 },
    { id: 'PNEW', name: 'New Job', client: 'Sample Customer B', status: 'Active', pm: 'Demo PM', created: '2026-11-20', startDate: '2026-11-23', contract: 5000 }]);
  H.cset('invs', [{ id: 'IVOLD', pid: 'POLD', num: 'INV-7', amt: 1200, status: 'sent', type: 'client', date: '2026-09-01', dueDate: '2026-09-15' }]);
  const T = (id, o) => Object.assign({ id, addedAt: '2026-10-20T15:00:00.000Z', updatedAt: '2026-10-20T15:00:00.000Z', done: false }, o);
  H.cset('gc_office_tasks', [
    T('TOLDJOB', { kind: 'datacheck', pid: 'POLD', label: 'Update progress: Older Job (0%)', addedBy: 'CRM' }),
    T('TNEWJOB', { kind: 'datacheck', pid: 'PNEW', label: 'Update progress: New Job (0%)', addedBy: 'CRM', addedAt: '2026-11-20T15:00:00.000Z' }),
    T('EMERG_LOLD1', { kind: 'emergency_lead', label: '🚨 Emergency — call now: Sample Old', addedBy: 'Emergency lead' }),
    T('adm_seed_demo_v1', { kind: 'admin_seed', label: 'Sign up for the demo board', addedBy: 'Admin (setup)' }),
    T('DENYdemo1', { label: '↩ Fix and resend: 👤 Assign this lead: Sample Old — CompanyCam', addedBy: 'Wesley Johnson', _deny: { key: 'td:hot1:asg:LOLD1', by: 'Wesley Johnson', at: '2026-10-20T15:00:00.000Z' } }),
    T('HANDOLD', { kind: 'quick', label: 'Call the roofer about the deck color', addedBy: 'Wesley Johnson' }),
    T('COI_REQ_SUBx_2026', { kind: 'coi_request', label: '🛡 COI expiring: Sample Sub — 2026-11-18', addedBy: 'GrayCo CRM', sub: 'Sample Sub' }),
    T('appr_esc_demo', { label: '⏫ Approve: portal docs — Older Job', addedBy: 'Customer portal' })]);
  for (const k of ['customers', 'schedule', 'estimates', 'expenses', 'vendors', 'subs', 'punch', 'projectDocs']) H.cset(k, []);
  H.cset('gc_epahud_seed_v1', { at: '2026-11-18T00:00:00.000Z' });
}
const INIT = `window.__GC_LW_NOW__ = ${NOW}; window.__GC_PAPERS_TODAY__ = '2026-11-20';`;
const sev = async (A, f, x) => { for (let i = 0; i < 30; i++) { try { return await A.ev(f, x); } catch (e) { if (!/context was destroyed|navigation|Target closed/i.test(String(e))) throw e; await sleep(1000); } } return A.ev(f, x); };
const OPEN = [];
try {
  seed();
  console.log('B. the owner on the desk: Leads → 🚨 Leads at risk');
  const A = await H.computer('ADMIN', { build, init: [INIT] }); OPEN.push(A);
  await H.signIn(A, ADMIN, 30000);
  await H.waitFor(A, () => window._gcLeadWatch && (window._crm.leads || []).length >= 7, null, 60000);
  await sev(A, () => { try { localStorage.setItem('gc_co_leads_all', '0'); } catch (e) {} window._setView('leads'); });
  await H.waitFor(A, () => !!document.getElementById('gc-lw-card'), null, 20000);
  const card = await sev(A, () => { const c = document.getElementById('gc-lw-card'); return c ? { ids: [...c.querySelectorAll('[data-lw-row]')].map(r => r.getAttribute('data-lw-row')), text: c.innerText, afterTop: !!(c.previousElementSibling && c.previousElementSibling.classList.contains('gclu-top')) } : null; });
  ok(card && card.ids.slice().sort().join() === 'LW_MIT,LW_PH,LW_WEB' && card.afterTop, 'the card lists the website lead (no PM 6 h), Pat\'s phone lead (30 h) and the Mitigation lead — not the bid, the contacted one, the 2-hour-old one', card);
  ok(/No PM — came in 6 h ago/.test(card.text) && /Not contacted — Demo PM has had it 30 h/.test(card.text) && /📞 \(901\) 555-0101/.test(card.text), 'each row says what is late and how to call', card.text);
  const pass2 = await sev(A, () => ({ mit: window._gcCo.passLead((window._crm.leads || []).find(l => l.id === 'LW_MIT'), 'construction'), new1: window._gcCo.passLead({ id: 'x', companyId: 'mitigation', stage: 'Won' }, 'construction') }));
  ok(pass2.mit === true && pass2.new1 === false, 'the company filter lets the Mitigation lead at risk through (only leads at risk)', pass2);
  await sev(A, () => document.querySelector('#gc-lw-card [data-lw-open="LW_WEB"]').click());
  const opened = await H.waitFor(A, () => { const d = document.getElementById('gcl-drawer'); return d && d.getClientRects().length && /Sample Home A|Website lead/.test(d.innerText); }, null, 10000);
  ok(!!opened, 'Open opens the lead');
  console.log('C. To-Do only from now on');
  await sev(A, () => window._gcTD2.paint());
  await H.waitFor(A, () => window._gcTD2 && window._gcTD2.state && window._gcTD2.state().items.length > 0, null, 30000); await sleep(2500);
  const td = await sev(A, () => { window._gcTD2.paint(); const st = window._gcTD2.state(); return { titles: st.items.map(x => x.title), hidden: window._gcLeadWatch.hidden() }; });
  const has = rx => td.titles.some(x => rx.test(x));
  ok(has(/Lead at risk: Sample Home A/) && has(/Lead at risk: Sample Home B/), 'the leads at risk are To-Dos (Leads & bids)', td.titles);
  ok(has(/Update progress: New Job/) && has(/Approve: portal docs/) && has(/COI|Sample Sub/) && has(/deck color/), 'kept: the new job\'s To-Do, the approval, the sub\'s COI, the hand-written one from October', td.titles);
  const kp = await sev(A, () => { const L = window._gcLeadWatch; return { ar: L.keep({ thing: 'ar|IVOLD', src: 'tab', title: 'Overdue invoice' }), roll: L.keep({ roll: 'ar-old', thing: 'roll|ar-old' }), coll: L.keep({ src: 'st', rec: { id: 'x10_call_2026-11_p:P1', label: '📞 Call X — $1 over 60 days' } }),
    drop: L.todoDrop({ src: 'tab', thing: 'ar|IVOLD', pid: 'POLD', title: 'Overdue invoice' }) }; });
  ok(kp.ar && kp.roll && kp.coll && kp.drop === false, 'money owed is always kept: an overdue invoice on an older job, the 30+ days roll-up, the collections call', kp);
  ok(!has(/Update progress: Older Job/) && !has(/Emergency — call now: Sample Old/) && !has(/demo board/) && !has(/Fix and resend/), 'not shown: the older job\'s, the old lead\'s, the old setup seed, the old "↩ Fix and resend"', td.titles);
  ok(td.hidden.n >= 3, 'the count of what is not shown (the old lead\'s, the setup seed, the Fix and resend; the older job\'s is PAPERS\')', td.hidden);
  const note = await sev(A, () => { window._setView('todo'); return new Promise(r => setTimeout(() => { const n = document.querySelector('.lw-old'); r(n ? n.innerText : ''); }, 2500)); });
  ok(/automatic To-Dos? about records from before 11\/19 (is|are) not shown/.test(note), 'the desk note says how many are not shown', note);
  await sev(A, () => window._gcLeadWatch.showOld(true)); await sleep(800);
  const shown = await sev(A, () => { window._gcTD2.paint(); return window._gcTD2.state().items.map(x => x.title); });
  ok(shown.some(x => /Emergency — call now: Sample Old/.test(x)) && shown.some(x => /demo board/.test(x)), '"Show them" brings them back (this page session; PAPERS\' older-job drops stay PAPERS\')', shown);
  await sev(A, () => window._gcLeadWatch.showOld(false));

  console.log('E. GOOD → a job in Projects (bidding); BAD → never a job');
  const jobs = await H.waitFor(A, () => { const L = window._crm.leads || [], P = window._crm.projects || []; const g = L.find(l => l.id === 'LW_G'), ph = L.find(l => l.id === 'LW_PH');
    return g && g.pid && ph && ph.pid ? { g: P.find(p => p.id === g.pid), ph: P.find(p => p.id === ph.pid), bad: P.find(p => p.id === 'PBAD'), b2: L.find(l => l.id === 'LW_B2'), old: L.find(l => l.id === 'LOLD1'), n: P.length } : null; }, null, 60000);
  ok(jobs && jobs.g && /^bidding$/i.test(jobs.g.status) && jobs.g.leadId === 'LW_G' && jobs.g.autoPO === 'Q123', 'the GOOD Google lead → a job in Projects, status bidding, keeping the lead\'s PO', jobs && jobs.g);
  ok(jobs && jobs.ph && /^bidding$/i.test(jobs.ph.status), 'the assigned phone lead (no BAD) → a job too', jobs && jobs.ph);
  ok(jobs && jobs.bad && /archiv/i.test(jobs.bad.status) && jobs.bad.archivedWhy === 'bad lead', 'the BAD lead\'s job is archived as "bad lead" (not deleted)', jobs && jobs.bad);
  ok(jobs && jobs.b2 && !jobs.b2.pid && jobs.old && !jobs.old.pid, 'a BAD lead never becomes a job; a lead from before 11/19 is left alone (only from now on)', jobs && { b2: jobs.b2.pid, old: jobs.old.pid });
  await sev(A, () => { location.hash = '#job=' + ((window._crm.leads || []).find(l => l.id === 'LW_G') || {}).pid; });
  ok(!!(await H.waitFor(A, () => window.__gcLwJobOpened, null, 20000)), 'the #job=<id> link in the PM\'s texts opens the job');

  console.log('B2. the PM');
  const P = await H.computer('PM', { build, init: [INIT] }); OPEN.push(P);
  await H.signIn(P, PM, 30000);
  await H.waitFor(P, () => window._gcLeadWatch && (window._crm.leads || []).length >= 7, null, 60000);
  await sev(P, () => window._setView('leads')); await sleep(3000);
  const pm = await sev(P, () => ({ card: !!document.getElementById('gc-lw-card'), todo: (window._gcTD2 && window._gcTD2.state ? (window._gcTD2.paint(), window._gcTD2.state().items.map(x => x.title)) : []) }));
  ok(!pm.card, 'a PM sees no "Leads at risk" card (owners only)', pm);
  ok(pm.todo.some(x => /Lead at risk: Sample Home B/.test(x)) && !pm.todo.some(x => /Sample Home A/.test(x)), 'the PM\'s own late lead is his To-Do (not the others)', pm.todo);
  for (const c of OPEN.splice(0)) await c.close().catch(() => {});

  if (fs.existsSync(path.join(SNAP, 'rows.ndjson'))) {
    console.log('D. the real snapshot (read only, offline)');
    const Q = await import(pathToFileURL(path.join(build, 'tools/qa/qa_lib.mjs')).href);
    const snap = Q.readSnap(SNAP); Q.loadIntoHarness(H, snap);
    H.onFn('automation-pause', () => ({ paused: true, flag: { on: true } }));
    const users = (snap.get('users') || []).filter(u => u && u.email && u.active !== false);
    for (const k of Object.keys(H.ACCOUNTS)) delete H.ACCOUNTS[k];
    users.forEach(u => { H.ACCOUNTS[String(u.email).toLowerCase()] = { id: 'u-' + String(u.id || u.email).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20), name: u.name, role: /^admin$/i.test(u.role) ? 'admin' : /office/i.test(u.role) ? 'office' : 'staff' }; });
    const who = { admin: users.find(u => /^admin$/i.test(u.role)), office: users.find(u => /office/i.test(u.role)), pm: users.find(u => /project manager/i.test(u.role)) };
    const SNOW = Date.parse(JSON.parse(fs.readFileSync(path.join(SNAP, 'meta.json'), 'utf8')).at);
    const counts = {};
    for (const r of ['admin', 'office', 'pm']) {
      const C = await H.computer(r, { build, init: [`window.__GC_LW_NOW__ = ${SNOW};`] }); OPEN.push(C);
      await H.signIn(C, who[r].email.toLowerCase(), 30000);
      await H.waitFor(C, () => window._gcTD2 && window._gcLeadWatch && (window._crm.projects || []).length > 50, null, 120000);
      let last = null; for (let i = 0; i < 6; i++) { await sleep(8000); try { last = await sev(C, () => { window._gcTD2.paint(); const st = window._gcTD2.state(), by = {}; st.items.forEach(x => { const k = x.waiting ? 'waiting' : (x.cat || '?'); by[k] = (by[k] || 0) + 1; }); return { items: st.items.length, by, hidden: window._gcLeadWatch.hidden(), risk: window._gcLeadWatch.state().atRisk }; }); } catch (e) {} }
      counts[r] = last; console.log('   ' + r + ' (' + who[r].role + '): ' + JSON.stringify(last));
      await C.close().catch(() => {}); OPEN.pop();
    }
    ok(counts.admin && counts.admin.items <= 60 && counts.admin.hidden.n > 50, 'the admin\'s desk To-Do is a short list (was about 162 with PAPERS)', counts.admin);
    ok(counts.admin && counts.admin.risk.length >= 1 && counts.admin.risk.every(z => z.kind !== 'bid'), 'the snapshot\'s customer lead past its time is at risk; no bid invite is', counts.admin && counts.admin.risk);
    ok(counts.office && counts.pm && counts.office.items <= counts.admin.items + 10 && counts.pm.items <= 30, 'the office and the PM lists are short too', { office: counts.office && counts.office.items, pm: counts.pm && counts.pm.items });
    /* the owner's phone: the Field home card */
    const IPH = () => { try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); } catch (e) {} };
    const F = await H.computer('OWNERPHONE', { build, mobile: true, init: [IPH, `window.__GC_LW_NOW__ = ${SNOW};`] }); OPEN.push(F);
    await H.signIn(F, who.admin.email.toLowerCase(), 30000);
    const fh = await H.waitFor(F, () => { const c = document.querySelector('#_gcJobPick.gc-fh .fh-wrap #gc-lw-field'); return c ? c.innerText : ''; }, null, 90000);
    ok(/🚨 Leads at risk/.test(fh || ''), 'the owner\'s phone: 🚨 Leads at risk on the Field home', fh);
  } else console.log('D. skipped — no snapshot at ' + SNAP);
} catch (e) { fail++; console.log('  ✗ FAIL ' + String(e && e.stack || e).slice(0, 900)); }
for (const c of OPEN) await c.close().catch(() => {});
console.log((fail ? 'FAILED' : 'ALL PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
