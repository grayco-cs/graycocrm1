// test_COMBO_flow.mjs <build-dir> [shot-dir] — the six pending branches TOGETHER (AWAY, APPRNOSEND, PMFIELD, ENVDOCS (+ENVCOMP),
// EPAHUD (+JOBDOCS), WHITE): the paperwork and the flows end to end, in ONE made-up world, as the PM on a phone and as the office /
// admin on the desk. Offline harness (harness_N), fake functions, made-up people / jobs / customers; nothing leaves the machine.
//   a) a new lead-RRP Construction job (pre-1978): its papers appear by themselves ("📑 N papers to send"), filled (customer, address,
//      year built, PM, firm cert, renovator), GrayCo Construction letterhead, "Levels: 2026 v.3"; the PM sends one by portal, one by
//      e-mail, one by text in data-entry mode (held + logged), one by the phone's share sheet (a PDF); each logged, Sent on the paper;
//      an overdue paper → a To-Do for the PM.
//   b) an Environmental mold job: the mold disclosure gates Start job; a Mitigation emergency water job is never blocked; the
//      Environmental logo on the mold job's papers, the Mitigation logo on the water job's papers.
//   c) an asbestos job: Asbestos 01 gates Start job; asbestos work defaults to a licensed sub; the sub's information is asked for.
//   d) a lead abatement job: the 🛡 Compliance panel; the Employee Protection Plan (≥ 20 sections, the Environmental logo); blood 52 →
//      the removal-with-pay form; a clearance sill wipe 45 fails; TCLP 6 → hazardous with the storage clock; an uncertified worker on
//      the schedule is blocked, an admin override is logged; an emergency job only warns.
//   e) approvals: a final invoice can be approved without sending; a sub sign-up makes an approval card; Away: the cover admin sees the
//      note only on the owner-only item; quiet hours / bundling / Away routing on the server (test_AWAY_fn.mjs, run here).
//   f) GrayCo Field: the bar is Approvals | Jobs | Home (center) | My Schedule | More; 🧾 Snap a receipt; white on every screen
//      visited; pop-ups are pages on the phone and right-side panels on the desk; Back returns; no page errors.
//   g) every PDF made here can be saved / shared / sent (the jsPDF / html2pdf libraries are served from a local copy of the exact
//      versions the CRM asks cdnjs for: GC_PDFCDN = a folder with the two npm packages unpacked).
// The sign-in accounts come from the harness (H.ACCOUNTS, by id) — no addresses are written here.
import path from 'path'; import fs from 'fs'; import { spawnSync } from 'child_process'; import { fileURLToPath } from 'url';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const H = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, cget, resetCloud, onFn } = H;
const PDFCDN = process.env.GC_PDFCDN || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/combo/pdfcdn';
const JSPDF = path.join(PDFCDN, 'x_jspdf-2.5.1/package/dist/jspdf.umd.min.js'), H2P = path.join(PDFCDN, 'x_html2pdf.js-0.10.1/package/dist/html2pdf.bundle.min.js');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }).catch(() => {}); };
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); };
const now = new Date().toISOString();
const sect = async (name, f) => { try { await f(); } catch (e) { ok(name + ' — ran to the end', false, String(e && e.stack || e).slice(0, 600)); } };
const EM = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const OWN = EM('u-wesley'), NICK = EM('u-nick'), OFF = EM('u-office'), PMA = EM('u-pm'), EST = EM('u-sbiffle');

/* ═════ the world ═════ */
resetCloud();
const ALL3 = ['construction', 'mitigation', 'environmental'];
cset('users', [
  { id: 'u1', name: 'Wesley Johnson', email: OWN, role: 'Admin', payType: 'owner', active: true, companies: ALL3, phone: '(901) 555-0111' },
  { id: 'u2', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true, companies: ALL3 },
  { id: 'u3', name: 'Office Demo', email: OFF, role: 'Office Manager', active: true, companies: ALL3 },
  { id: 'u5', name: 'Demo PM', email: PMA, role: 'Project Manager', active: true, companies: ALL3 },
  { id: 'u6', name: 'Demo Estimator', email: EST, role: 'Environmental Tech', active: true, companies: ['environmental'] },
  { id: 'u7', name: 'Wes Worker', email: 'wworker@example.com', role: 'Abatement Worker', active: true },
  { id: 'u8', name: 'Dan Crew', email: 'dan@example.com', role: 'Laborer', active: true }]);
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, clientEmail: id.toLowerCase() + '@example.com', clientPhone: '9015550100', address: id + ' Demo St, Memphis, TN 38135', status: 'active', pct: 0, startDate: day(6), endDate: day(20), pm: 'Demo PM', createdAt: now, updatedAt: now }, o);
cset('projects', [
  J('PRRP', { name: 'Demo porch repaint', client: 'Rita Renov', type: 'Residential Reno', companyId: 'construction', leadAsb: { yearBuilt: 1962, disturbsPaint: true } }),
  J('POVR', { name: 'Demo finished paint job', client: 'Otto Over', type: 'Residential Reno', companyId: 'construction', leadAsb: { yearBuilt: 1958, disturbsPaint: true }, epahud: { events: { completedOn: day(-40) } } }),
  J('PMOLD', { name: 'Demo mold remediation', client: 'Mo Mold', type: 'Mold Remediation', companyId: 'environmental' }),
  /* the crew does the asbestos-adjacent work on this emergency job (with ENVDOCS the default is a licensed sub, and the crew is then held to nothing) */
  J('PWAT', { name: 'Demo burst pipe', client: 'Wanda Water', type: 'Water Damage', companyId: 'mitigation', description: 'Burst pipe — asbestos ceiling texture found', envComp: { asbBy: 'crew' } }),
  J('PASB', { name: 'Demo floor tile abatement', client: 'Abe Asb', type: 'Asbestos abatement', companyId: 'environmental', startDate: day(4) }),
  J('PLA', { name: 'Demo lead abatement', client: 'Cy Demo', type: 'Lead abatement', companyId: 'environmental', address: '23 Demo Rd, Little Rock, AR 72201', pct: 20, startDate: day(-3), abatementSupervisor: 'Demo Estimator', crew: ['Wes Worker'] })]);
cset('gc_certs', { list: [
  { id: 'C1', holderType: 'company', holder: 'company', tpl: 'epa_rrp_firm', ckind: 'rrp_firm', name: 'EPA RRP Lead-Safe Certified Firm (TN & AR)', number: 'NAT-F123456-1', state: 'TN/AR', expires: '2030-05-01' },
  { id: 'C2', holderType: 'company', holder: 'company', ckind: 'lead_abate_firm', name: 'Lead-based paint abatement firm', number: 'AR-LF-77', state: 'AR', expires: '2030-05-01' },
  { id: 'C3', holderType: 'person', holder: PMA, holderName: 'Demo PM', ckind: 'rrp_renovator', name: 'Lead Renovator (RRP)', number: 'R-555', expires: day(900) },
  { id: 'C4', holderType: 'person', holder: EST, holderName: 'Demo Estimator', ckind: 'lead_supervisor', name: 'Lead Abatement Supervisor', number: 'LS-1', state: 'AR', expires: day(300) },
  { id: 'C5', holderType: 'person', holder: 'wworker@example.com', holderName: 'Wes Worker', ckind: 'lead_worker', name: 'Lead Abatement Worker', number: 'LW-1', state: 'AR', expires: day(300) },
  { id: 'C6', holderType: 'person', holder: OWN, holderName: 'Wesley Johnson', ckind: 'lead_supervisor', name: 'Lead Abatement Supervisor', number: 'LS-2', state: 'AR', expires: day(364) }], updatedAt: now });
cset('gc_epahud_seed_v1', { at: now });
cset('schedule', [{ id: 'S1', pid: 'PLA', date: day(2), assignee: 'Wes Worker' }]);
cset('gc_office_tasks', []);
const Q = (id, o) => Object.assign({ id, kind: 'final_invoice', title: '🧾 Final invoice — Demo porch repaint', jobId: 'PRRP', jobName: 'Demo porch repaint', pm: null, to: 'prrp@example.com', subject: 'Your invoice', html: '<p>Invoice</p>', text: 'Invoice', channel: 'email', steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: now, updatedAt: now, adminSince: now, meta: { invoiceId: 'INV1', amount: '$5,000.00' } }, o || {});
cset('gc_approval_queue', JSON.stringify([Q('AQF'), Q('AQO', { kind: 'thank_you', title: 'Sample thank-you (owner job)', pm: 'Wesley Johnson', pmEmail: OWN, steps: ['pm'], step: 'pm', meta: {} })]));

/* the server, answered here */
const QUEUED = [], SIGN = [], APPR = [], SSYNC = [];
onFn('portal', ({ body }) => {
  if (body && body.action === 'approval' && body.op === 'list') return { ok: true, items: JSON.parse(cget('gc_approval_queue') || '[]').filter(x => x.status === 'waiting') };
  if (body && body.action === 'approval' && /^(approve|deny|decide|reject)$/.test(body.op || '')) { APPR.push(body); if (body.op === 'approve') { const L = JSON.parse(cget('gc_approval_queue') || '[]').map(x => x.id === body.id ? Object.assign({}, x, { status: body.noSend ? 'recorded' : 'sent', noSend: !!body.noSend }) : x); cset('gc_approval_queue', JSON.stringify(L)); } return { ok: true, sent: !body.noSend, noSend: !!body.noSend }; }
  if (body && body.action === 'approval') { QUEUED.push(body); return { ok: true, id: 'AP' + QUEUED.length, queued: true }; }
  return { ok: true };
});
onFn('portal-sign', ({ body }) => { if (body && body.action === 'list') return { ok: true, items: [] }; SIGN.push(body); return { ok: true, made: ((body && body.items) || []).length, ids: ((body && body.items) || []).map((x, i) => 'SR' + i) }; });
onFn('envcomp', ({ body }) => (body && body.op === 'mine' ? { ok: true, rec: { name: 'Wesley Johnson', summary: [], notices: [], visits: [], exposures: [] } } : { ok: true, removals: [], rec: {}, people: {} }));
onFn('portal-access', ({ body }) => {
  if (body && body.action === 's-sync') { SSYNC.push(1); return { ok: true, events: [], unread: 0, links: [], waiting: [], codes: [], text: false, admin: true, me: { email: 'x' }, at: now,
    bids: [{ id: 'u_su1', company: 'Sample Gutter Pros', name: 'Gus Sample', email: 'gus@sample-gutter.test', crmSubId: '', at: now, phone: '', trades: ['Gutters'], selfSignup: true, claimed: null, city: 'Memphis', state: 'TN', area: '', crew: null, vet: false, invited: false }] }; }
  return { ok: true };
});
onFn('bid-hub', () => ({ ok: true, jobs: [], subs: [] }));
const VKEY = Buffer.alloc(65, 7); VKEY[0] = 4; const KEY = VKEY.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let AWAYREC = null, COVERED = {};
onFn('appr-away', ({ body, A }) => {
  const op = body && body.op, admins = [{ email: OWN, name: 'Wesley Johnson' }, { email: NICK, name: 'Nick Gray' }];
  if (op === 'state') return { ok: true, me: { email: A.name, admin: A.name === OWN || A.name === NICK }, today: day(0), mine: AWAYREC && AWAYREC.email === A.name ? AWAYREC : null, away: AWAYREC ? [AWAYREC] : [], admins,
    push: { ready: true, key: KEY, devices: 0, on: false, list: [] }, covered: A.name === NICK ? COVERED : {}, defaultText: 'Away' };
  return { ok: true };
});

/* the PDF libraries (cdnjs, blocked offline) from the local copy of the same versions; the phone's share sheet recorded */
async function pdfLibs(A){
  await A.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js/, r => r.fulfill({ path: JSPDF, contentType: 'application/javascript' }));
  await A.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/html2pdf\.js\/0\.10\.1\/html2pdf\.bundle\.min\.js/, r => r.fulfill({ path: H2P, contentType: 'application/javascript' }));
}
const SHARE = 'window.__shared = []; try { Object.defineProperty(navigator, "share", { configurable: true, value: function(d){ window.__shared.push({ title: d.title, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }); return Promise.resolve(); } }); Object.defineProperty(navigator, "canShare", { configurable: true, value: function(){ return true; } }); } catch (e) {}';
const IPHONE = 'try { Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" }); } catch (e) {}';
const wait = async (A, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
const errsOf = A => A.errs.filter(e => !/ResizeObserver|Script error/.test(e));
const lightBg = c => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(c || ''); if (!m) return false; if (m[4] !== undefined && +m[4] < 0.05) return 'transparent'; return +m[1] >= 235 && +m[2] >= 235 && +m[3] >= 235; };
const logoSrc = h => { const m = /<img[^>]*data-gc-logo-img="1"[^>]*src="([^"]*)"/.exec(h || '') || /<img[^>]*src="([^"]*)"[^>]*data-gc-logo-img="1"/.exec(h || '') || /<img[^>]*src="([^"]*(?:logo)[^"]*)"/i.exec(h || ''); return m ? m[1] : ''; };
const ENVLOGO = '/img/grayco-environmental-logo.png', MITLOGO = '/img/grayco-mitigation-logo.png';
const PDFS = [];   /* every PDF made: [what, how it can leave the device] */

/* ═════ DESK — the admin / office (the owner's account) ═════ */
const A = await computer(OWN, { build: BUILD, init: [SHARE] }); await pdfLibs(A);
await signIn(A, OWN, 20000);
ok('0 the desk is up with every branch (JOBDOCS, EPAHUD, ENVCOMP, ENVDOCS, AWAY, APPRNOSEND, WHITE)', !!await wait(A, () => window._gcJobDocs && window._gcEpaHud && window._gcEnvComp && window._gcEnvDocs && window._gcLeadLevels && window._gcAway && window._gcApprNoSend && window._gcWhite && (window._crm.projects || []).length >= 6 && typeof window._navToJob === 'function', null, 60000));
await A.ev(() => { try { window._gcEnvComp.pullCerts(); } catch (e) {} try { window._gcEpaHud.pullCerts(); } catch (e) {} });
await wait(A, () => ['PRRP', 'PMOLD', 'PWAT', 'PASB', 'PLA'].every(id => { const p = window._crm.projects.find(x => x.id === id); return p && p.jobDocs && p.jobDocs.items; }), null, 30000);

/* ── a) the lead-RRP Construction job ── */
await sect('a desk', async () => {
  const K = await A.ev(() => window._crm.projects.find(p => p.id === 'PRRP').jobDocs.items.map(x => x.k));
  ok('a1 the RRP job got its papers by itself (Lead 01 🔒, Lead 03, Lead 08, Lead 11 + the construction set)', ['gcb_lead_01', 'gcb_lead_03', 'gcb_lead_08', 'gcb_lead_11', 'gcb_contract'].every(k => K.includes(k)) && new Set(K).size === K.length, K);
  await A.ev(() => window._navToJob('PRRP'));
  const card = await wait(A, () => { const c = document.getElementById('gc-jd'); return c && c.getAttribute('data-pid') === 'PRRP' && /papers? to send/.test(c.innerText) && c.innerText; }, null, 20000);
  const nTo = card && +(/📑 (\d+) papers? to send/.exec(card) || [])[1];
  ok('a2 the desk job page: "📑 N papers to send" on the 📑 Paperwork card', nTo > 0, card && card.slice(0, 500));
  await shot(A, 'a2_desk_card');
  const r = await A.ev(() => window._gcDocLib.render('gcb_lead_01', 'PRRP').then(r => r && r.page));
  const t = (r || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  ok('a3 Lead 01 is filled: customer, address, year built, PM, firm cert #, renovator (+ #)', /Rita Renov/.test(t) && /PRRP Demo St/.test(t) && /1962/.test(t) && /Demo PM/.test(t) && /NAT-F123456-1/.test(t) && /R-555/.test(t) && !/\{[a-z_]+\}/.test(r || ''), t.slice(0, 900));
  /* only a paper that cites a level carries the stamp (EPAHUD: "stamped on every sent / printed copy that cites a level, and on the paper's log");
     the RRP set (Lead 01 / 03 / 08 / 11) cites none — Lead 15 (evaluation results vs the levels) does */
  const r3 = await A.ev(() => window._gcDocLib.render('gcb_lead_15', 'PRRP').then(r => r && r.page));
  const lc = logoSrc(r);
  ok('a4 GrayCo Construction letterhead (its logo + name, the TN / AR / MS license line)', !!lc && !/environmental|mitigation/i.test(lc) && /GrayCo Construction/i.test(r) && /85034/.test(r), { lc: lc.slice(0, 80) });
  ok('a5 a paper that cites a level says "Levels: 2026 v.3" (Lead 15, filled for this job)', /Levels: 2026 v\.3/.test(r3 || ''), (r3 || '').replace(/<[^>]+>/g, ' ').slice(-300));
});
/* the overdue paper → the PM's To-Do */
await sect('a overdue', async () => {
  await A.ev(() => window._gcEpaHud.sweep()); await sleep(1500);
  const tk = await wait(A, () => { const L = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const t = L.find(x => x && x.id === 'EPAHUD_POVR_gcb_lead_03'); return t ? { a: t.assignee, l: t.label, p: t.prio } : null; }, null, 15000);
  ok('a9 an overdue paper (Lead 03, 30 days after completion) → a To-Do for the job\'s PM', tk && tk.a === 'Demo PM' && /(OVERDUE|suggested by .* not sent yet)/.test(tk.l), tk);
});

/* ── b) mold gates, emergency water never blocked, the logos ── */
const start = pid => A.ev(pid => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === pid ? Object.assign({}, p, { pct: 10, updatedAt: new Date().toISOString() }) : p)); }, pid);
const pct = pid => A.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return p ? +p.pct || 0 : -1; }, pid);
const gateTxt = () => wait(A, () => { const d = document.getElementById('gc-la3-gate'); return d && d.textContent; }, null, 8000);
const closeGate = () => A.ev(() => { const d = document.getElementById('gc-la3-gate'); if (d) d.remove(); });
await sect('b', async () => {
  await A.ev(() => window._setView('projects')); await sleep(800);
  await start('PMOLD'); const g = await gateTxt(); await sleep(1500);
  ok('b1 Environmental mold job: Start job waits for the mold disclosure (put back to 0 %)', /Mold disclosure/.test(g || '') && await pct('PMOLD') === 0, { g, pct: await pct('PMOLD') });
  await shot(A, 'b1_mold_gate'); await closeGate(); await sleep(3000);
  await start('PWAT'); await sleep(3000);
  ok('b2 Mitigation emergency water job: never blocked (starts, no gate)', await pct('PWAT') === 10 && !await A.ev(() => !!document.getElementById('gc-la3-gate')), await pct('PWAT'));
  await closeGate();
  const pg = await A.ev(async () => { const out = {}; for (const [id, k] of [['PMOLD', 'gcb_mold'], ['PWAT', 'gcb_water_emergency_auth'], ['PRRP', 'gcb_lead_11']]) { const r = await window._gcDocLib.render(k, id); out[id] = r && r.page || ''; } return out; });
  const le = logoSrc(pg.PMOLD), lm = logoSrc(pg.PWAT), lc = logoSrc(pg.PRRP);
  ok('b3 the mold job\'s paper: GrayCo Environmental\'s name and logo', /GrayCo Environmental/i.test(pg.PMOLD) && !!le && le !== lc && le !== lm, { le: le.slice(0, 80) });
  ok('b4 the water job\'s paper: GrayCo Mitigation\'s name and logo', /GrayCo Mitigation/i.test(pg.PWAT) && !!lm && lm !== lc, { lm: lm.slice(0, 80) });
});

/* ── c) asbestos ── */
await sect('c', async () => {
  await sleep(3000); await start('PASB'); const g = await gateTxt(); await sleep(1500);
  ok('c1 asbestos job: Start job waits for Asbestos 01', /Asbestos 01/.test(g || '') && await pct('PASB') === 0, { g, pct: await pct('PASB') });
  await closeGate();
  const E = await A.ev(() => { const e = window._gcEnvComp.evaluate(window._crm.projects.find(x => x.id === 'PASB')); return { by: e.asbBy, sub: e.items.filter(i => i.sec === 'sub').map(i => i.id + ':' + i.st + ':' + i.label) }; });
  ok('c2 asbestos work defaults to a licensed abatement sub', E.by === 'sub', E);
  ok('c3 the sub\'s information is asked for (the sub firm / license / papers are open items)', E.sub.length > 0 && E.sub.some(x => /^sub-firm:(block|due)/.test(x)), E.sub);
});

/* ── d) lead abatement ── */
await sect('d', async () => {
  await A.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(800); await A.ev(() => window._navToJob('PLA'));
  const pan = await wait(A, () => { const c = document.getElementById('gc-ec'); return c && c.getAttribute('data-pid') === 'PLA' && c.querySelector('[data-ed-sec="plan"]') ? c.textContent : null; }, null, 25000);
  ok('d1 the 🛡 Compliance panel is on the lead abatement job (with 7 · Employee Protection Plan)', !!pan && /Employee Protection Plan/.test(pan), pan && pan.slice(0, 300));
  await A.ev(() => document.querySelector('#gc-ec [data-ed="plan"]').click());
  const plan = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'PLA'); const L = (p.envLog || []).filter(r => r.kind === 'epp'); return L.length && window.__gcEdPlan ? { n: L[0].plan.sections.length, html: window.__gcEdPlan.html, id: L[0].id } : null; }, null, 15000);
  ok('d2 the Employee Protection Plan generates with 20 sections and the Environmental logo + name', !!plan && plan.n >= 20 && plan.html.includes(ENVLOGO) && !plan.html.includes(MITLOGO) && /GrayCo Environmental/.test(plan.html), plan && { n: plan.n });
  console.log('    (plan sections: ' + (plan && plan.n) + ')');
  await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
  /* the plan as a PDF (jsPDF → a download) */
  if (plan) {
    const dl = A.page().waitForEvent('download', { timeout: 20000 }).catch(() => null);
    const pr = await A.ev(id => window._gcEnvDocs.planPdf('PLA', id), plan.id);
    const d = await dl; PDFS.push(['Employee Protection Plan', pr && pr.pdf ? 'saved (download ' + (d ? d.suggestedFilename() : '?') + ')' : 'NOT made']);
    ok('g1 the plan PDF is made and saved (download)', !!pr && pr.pdf === true && !!d && /\.pdf$/.test(d.suggestedFilename()), { pr, f: d && d.suggestedFilename() });
  }
  await A.ev(() => { window.confirm = () => true; window._gcEnvComp._x.bloodStep({ email: 'wworker@example.com', name: 'Wes Worker' }, '52', null); });
  const rmf = await wait(A, () => { const m = document.getElementById('gc-ec-modal'); const r = m && m.querySelector('[data-f="reason"]'); return r ? { reason: r.value, title: m.querySelector('h3').textContent } : null; });
  ok('d3 blood lead 52 → the medical removal (pay protection) form opens, filled from Levels 2026 v.3', !!rmf && /Medical removal/.test(rmf.title) && /52 µg\/dL — Removal From Work at 50 \(Levels: 2026 v\.3\)/.test(rmf.reason), rmf);
  await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
  await A.ev(() => window._gcEnvComp.logAir('PLA', { rule: 'la-clear', atype: 'clearance', date: window._gcEnvCompCore.today(), method: 'Lead dust wipe (µg/ft²)', surface: 'Interior window sills', task: 'kitchen sill', result: '45', sampler: 'Demo Estimator', lab: 'Demo Lab', files: {} }));
  const wipe = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'PLA'); return (p.envLog || []).find(r => r.kind === 'air' && r.result === '45') || null; });
  ok('d4 a clearance sill wipe of 45 µg/ft² → clearance FAILS (DLAL 40), stamped Levels: 2026 v.3', !!wipe && wipe.pass === 'Fail' && /clearance FAILS/.test(wipe.levelText) && wipe.levels === 'Levels: 2026 v.3', wipe);
  await A.ev(() => window._gcEnvDocs.logTclp('PLA', { stream: 'Lead paint chips / debris', date: window._gcEnvCompCore.addDays(window._gcEnvCompCore.today(), -10), sampler: 'Demo Estimator', containers: 'B-01', lab: 'Demo Lab', coc: 'COC-1', result: '6', files: {} }));
  const w = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'PLA'); const e = window._gcEnvComp.evaluate(p); const i = e.items.find(i => /^waste:/.test(i.id)); return i && /HAZARDOUS/.test(i.label) ? { label: i.label, note: i.note, clock: i.clock } : null; }, null, 12000);
  ok('d5 TCLP 6 mg/L → HAZARDOUS waste with the storage clock (day N of 180)', !!w && /HAZARDOUS/.test(w.label) && !!w.clock && /day \d+ of 180/.test(JSON.stringify(w.clock)), w);
  /* the schedule: Dan (no lead certification) put on the lead abatement job → ⛔; an admin override is logged; an emergency job only warns */
  await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setSchedule(prev => prev.map(x => x.id === 'S1' ? Object.assign({}, x, { assignee: 'Wes Worker, Dan Crew' }) : x)); });
  const blk = await wait(A, () => { const o = document.getElementById('gc-ep-sheet'); return o && /not certified/i.test(o.getAttribute('aria-label') || '') && o.querySelector('[data-ep-block="block"]') && o.innerText; }, null, 15000);
  ok('d6 an uncertified worker (Dan) scheduled on the lead abatement job → ⛔ with the reason', !!blk && /Dan Crew/.test(blk) && /lead/i.test(blk), blk);
  await shot(A, 'd6_block');
  await A.ev(() => { window.prompt = () => 'Certified supervisor on site; Dan does clean-up outside containment'; const b = document.querySelector('#gc-ep-sheet [data-epb="over"]'); if (b) b.click(); });
  const ov = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'PLA'); return p && p.epahud && (p.epahud.overrides || []).find(o => o.who === 'Dan Crew') || null; }, null, 10000);
  ok('d7 the admin override → Dan stays on; logged on the job with who / why / when', !!ov && ov.by === 'Wesley Johnson' && /supervisor/.test(ov.why) && ov.at, ov);
  await A.ev(() => { const o = document.getElementById('gc-ep-sheet'); if (o) o.remove(); }); await sleep(1200);
  await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setSchedule(prev => prev.concat([{ id: 'S2', pid: 'PWAT', date: new Date().toISOString().slice(0, 10), assignee: 'Dan Crew' }])); });
  const wn = await wait(A, () => { const o = document.getElementById('gc-ep-sheet'); return o && o.querySelector('[data-ep-block="warn"]') && o.innerText; }, null, 15000);
  await sleep(1200);
  const s2 = await A.ev(() => { const L = (window._gcEnvComp && window._gcEnvComp._sched ? window._gcEnvComp._sched().list : null) || window._crm.schedule || []; return (L.find(x => x.id === 'S2') || {}).assignee || ''; });
  ok('d8 the emergency mitigation job → a warning only; Dan stays on it', !!wn && !/Take them off/.test(wn) && s2 === 'Dan Crew', { wn, s2 });
  await A.ev(() => { const o = document.getElementById('gc-ep-sheet'); if (o) o.remove(); });
  /* the record package PDF */
  const dl2 = A.page().waitForEvent('download', { timeout: 20000 }).catch(() => null);
  const rp = await A.ev(() => Promise.resolve(window._gcEnvComp.recordPackage('PLA')).then(r => r ? { ok: r.ok, pdf: r.pdf } : null));
  const d2 = await dl2; PDFS.push(['Compliance record package', d2 ? 'saved (download ' + d2.suggestedFilename() + ')' : 'NOT saved ' + JSON.stringify(rp)]);
  ok('g2 the compliance record package PDF is made and saved (download)', !!d2 && /\.pdf$/.test(d2.suggestedFilename()), rp);
});

/* ── e) approvals on the desk ── */
await sect('e desk', async () => {
  await A.ev(() => { try { window._gcApprovalsRefresh(); } catch (e) {} try { window._gcSubsBids.sync(); } catch (e) {} try { window._gcBpAppr.refresh(); } catch (e) {} window._setView('approvals'); });
  const btns = await H.waitFor(A, () => { const r = document.querySelector('.apx-row[data-k="ap2:AQF"]'); return r && r.querySelector('.gc-nosend') ? [...r.querySelectorAll('button')].map(b => b.textContent.trim()) : null; }, null, 40000);
  ok('e1 the final invoice card has ✅ Approve — don\'t send next to Approve & send', !!btns && btns.some(t => /Approve — don.t send/.test(t)), btns);
  await shot(A, 'e1_approvals');
  await A.ev(() => { const b = document.querySelector('.apx-row[data-k="ap2:AQF"] .gc-nosend'); if (b) b.click(); });
  await H.waitFor(A, () => !document.querySelector('.apx-row[data-k="ap2:AQF"]'), null, 15000);
  const call = APPR.find(c => c.id === 'AQF' && c.op === 'approve');
  ok('e2 the click → one approve with noSend (nothing sent)', !!call && call.noSend === true, APPR);
  const su = await H.waitFor(A, () => { const r = document.querySelector('.apx-row[data-k^="bp:su:"]'); return r && r.textContent.slice(0, 200); }, null, 30000);
  ok('e3 a sub sign-up made an approval card ("New sub signed up: Sample Gutter Pros")', /New sub signed up: Sample Gutter Pros/.test(su || ''), { su, ssync: SSYNC.length });
});

/* ── f) desk: pop-ups are right-side panels; white; no page errors ── */
await sect('f desk', async () => {
  await A.ev(() => { try { window._gcOpenPmApprovals(); } catch (e) {} }); await sleep(1500);
  const dp = await A.ev(() => { const L = window._gcNavLayers ? window._gcNavLayers() : []; const t = L[L.length - 1]; const cd = t && t.querySelector(':scope>[data-w-card]'); const r = cd && cd.getBoundingClientRect(); return { ov: t && t.getAttribute('data-w-ov'), right: r && Math.round(innerWidth - r.right), h: r && Math.round(r.height), bg: cd && getComputedStyle(cd).backgroundColor }; });
  ok('f1 desk: a pop-up (My Approvals) is a right-side panel, full height, white', dp.ov === 'panel' && dp.right <= 1 && dp.h >= 890 && lightBg(dp.bg) === true, dp);
  await A.ev(() => { const b = document.getElementById('_gcNavBk'); if (b) b.click(); }); await sleep(800);
  ok('f2 desk: ✕ Close returns (no layer left)', !(await A.ev(() => (window._gcNavLayers ? window._gcNavLayers() : []).filter(e => e.id !== '_gcJobPick').length)));
  const bg = await A.ev(() => ({ body: getComputedStyle(document.body).backgroundColor, root: getComputedStyle(document.getElementById('root') || document.body).backgroundColor }));
  ok('f3 desk: the page is white / light', lightBg(bg.body) === true || lightBg(bg.root) === true, bg);
});
const errsA = errsOf(A);
ok('f4 desk: no page errors through all of it', !errsA.length, errsA.slice(0, 6));
await A.close();

/* ── e) the cover admin while the owner is away: the note only on the owner-only item ── */
await sect('e away', async () => {
  AWAYREC = { id: 'AW1', email: OWN, name: 'Wesley Johnson', from: day(0), to: day(1), cover: NICK, coverName: 'Nick Gray', summary: false, sentence: 'Wesley is away until tomorrow — Nick is covering' };
  COVERED = { 'ap2:AQO': 'Wesley Johnson' };
  const N = await computer(NICK, { build: BUILD });
  await signIn(N, NICK, 20000);
  await H.waitFor(N, () => !!window._crm && !!window._gcAPX && !!window._gcAway, null, 30000);
  await sleep(4000); await N.ev(() => window._gcAway.refresh(true)); await N.ev(() => window._gcAPX.open('all'));
  await H.waitFor(N, () => !!document.querySelector('[data-gcaway-cov]'), null, 20000);
  const notes = await N.ev(() => [...document.querySelectorAll('[data-gcaway-cov]')].map(e => [e.closest('.apx-row') ? e.closest('.apx-row').getAttribute('data-k') : '', e.textContent]));
  ok('e4 Away: the cover admin sees "Wesley is away — Nick is covering" only on the owner-only item', notes.length === 1 && notes[0][0] === 'ap2:AQO' && /Wesley is away — Nick is covering/.test(notes[0][1]), notes);
  ok('e4b the cover admin\'s desk: no page errors', !errsOf(N).length, errsOf(N).slice(0, 4));
  await N.close();
});
/* the server side of Away / quiet hours / bundling: the AWAY function tests, run on this build */
await sect('e server', async () => {
  const r = spawnSync(process.execPath, [path.join(HERE, 'test_AWAY_fn.mjs'), BUILD], { cwd: BUILD, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const passed = re => out.split('\n').some(l => /✓/.test(l) && re.test(l));
  ok('e5 server: while away the away admin gets nothing; any-admin items unchanged; the owner-only item → the cover, marked', passed(/while away: NO ping to the away admin/) && passed(/pure: routeBox/), out.split('\n').filter(l => /✗/.test(l)).slice(0, 4));
  ok('e6 server: quiet hours hold non-urgent notices and bundle them into ONE 7 AM notification; a call-out still goes', passed(/the default is 9 PM/) && passed(/7:00 AM: ONE bundled notification/) && passed(/bundling: another item 3 minutes later/) && passed(/a sub call-out at 2 AM is urgent/), out.split('\n').filter(l => /✗/.test(l)).slice(0, 4));
  ok('e7 server: the whole AWAY function suite passes on this build', r.status === 0, out.split('\n').slice(-4));
});

/* ═════ PHONE — the PM in GrayCo Field ═════ */
await sect('phone', async () => {
  const B = await computer(PMA, { build: BUILD, mobile: true, init: [IPHONE, SHARE] }); await pdfLibs(B);
  await signIn(B, PMA, 20000);
  await H.waitFor(B, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs[data-ra-bar]'), null, 60000);
  await H.waitFor(B, () => window._gcEpaHud && (window._crm.projects || []).length >= 6, null, 30000); await sleep(2000);
  /* f) the bar */
  const bar = await B.ev(() => { const t = document.getElementById('gc-fh-tabs'); const kids = [...t.querySelectorAll(':scope > [data-t]')]; return { keys: kids.map(b => b.getAttribute('data-t')), labels: kids.map(b => b.textContent.trim()), home: kids.findIndex(b => b.getAttribute('data-t') === 'home') }; });
  ok('f5 Field bar: Approvals | Jobs | Home (center) | My Schedule | More', bar.keys.join() === 'appr,jobs,home,ra-sched,more' && bar.home === 2, bar);
  const wh = await B.ev(() => ({ pick: getComputedStyle(document.getElementById('_gcJobPick')).backgroundColor, bar: getComputedStyle(document.getElementById('gc-fh-tabs')).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
  ok('f6 Field Home and the bar are white / light', [wh.pick, wh.bar].every(c => lightBg(c) !== false), wh);
  await shot(B, 'f5_field_home');
  /* a) "Needs you · 📑 N papers to send" */
  const fh = await wait(B, () => { const b = document.getElementById('gc-ep-field'); return b && b.innerText; }, null, 25000);
  ok('a6 the PM\'s Field Home: "Needs you · 📑 N papers to send"', !!fh && /📑 \d+ papers? to send/i.test(fh), fh);
  /* the 📤 Send sheet is a full-screen white page on the phone (WHITE over EPAHUD's sheet) with a way back */
  await B.ev(() => window._gcEpaHud.menu('PRRP', 'gcb_lead_01'));
  const sh = await wait(B, () => { const o = document.getElementById('gc-ep-sheet'); if (!o || !o.querySelector('[data-ep-ch]')) return null; const r = o.getBoundingClientRect(); return { ov: o.getAttribute('data-w-ov'), full: Math.round(r.width) >= innerWidth - 1 && Math.round(r.height) >= innerHeight - 1, ch: [...o.querySelectorAll('[data-ep-ch]')].map(b => b.getAttribute('data-ep-ch')), bg: getComputedStyle(o).backgroundColor }; }, null, 8000);
  ok('f7 phone: the 📤 Send pop-up is a full-screen page (no dimmed backdrop) with portal / e-mail / text / share', !!sh && sh.ov === 'page' && sh.full && ['portal', 'email', 'sms', 'share'].every(c => sh.ch.includes(c)) && lightBg(sh.bg) !== false, sh);
  await shot(B, 'f7_send_page');
  await B.ev(() => { try { window._gcNavBack(); } catch (e) {} }); await sleep(800);
  ok('f8 phone: Back from the 📤 Send page returns to Field Home', !(await B.ev(() => !!document.getElementById('gc-ep-sheet'))) && await B.ev(() => !!document.querySelector('#_gcJobPick.gc-fh')));
  /* the four sends */
  const LOG = k => B.ev(k => ((window._crm.projects.find(x => x.id === 'PRRP').jobDocs || {}).log || []).filter(e => e.k === k).map(e => ({ act: e.act, via: e.via, by: e.by, at: !!e.at, levels: e.levels })), k);
  const q0 = QUEUED.length, s0 = SIGN.length;
  const rp = await B.ev(() => window._gcEpaHud.sendVia('PRRP', 'gcb_lead_01', 'portal')); await sleep(1500);
  const l1 = await LOG('gcb_lead_01');
  ok('a7 📤 portal: Lead 01 goes to the customer\'s portal (or ✅ Approvals) and is logged sent by the PM', !!rp && rp.ok !== false && (SIGN.length > s0 || QUEUED.length > q0) && l1.some(e => e.act === 'sent' && e.by === 'Demo PM' && e.at), { rp, l1, sign: SIGN.length - s0, q: QUEUED.length - q0 });
  const q1 = QUEUED.length;
  const re = await B.ev(() => window._gcEpaHud.sendVia('PRRP', 'gcb_lead_08', 'email')); await sleep(1200);
  const l2 = await LOG('gcb_lead_08'); const qe = QUEUED[QUEUED.length - 1] || {};
  ok('a8 ✉️ e-mail: Lead 08 → ✅ Approvals (e-mail, this job, the filled paper), logged sent', !!re && re.ok && QUEUED.length === q1 + 1 && qe.channel === 'email' && qe.projectId === 'PRRP' && /Rita Renov|PRRP/.test(qe.html || '') && l2.some(e => e.act === 'sent'), { re, l2, qe: Object.assign({}, qe, { html: (qe.html || '').slice(0, 120) }) });
  await B.ev(() => { window.__realPause = window._gcPause.state; window._gcPause.state = () => ({ paused: true, note: 'test' }); });
  const q2 = QUEUED.length;
  const rt = await B.ev(() => window._gcEpaHud.sendVia('PRRP', 'gcb_lead_11', 'sms')); await sleep(800);
  const l3 = await LOG('gcb_lead_11');
  ok('a9b 📱 text in data-entry mode: held (nothing queued) and logged "held"', !!rt && rt.held === true && QUEUED.length === q2 && l3.some(e => e.act === 'held'), { rt, l3 });
  await B.ev(() => { window._gcPause.state = window.__realPause; });
  const rs = await B.ev(() => window._gcEpaHud.sendVia('PRRP', 'gcb_lead_03', 'share'));
  const shared = await wait(B, () => (window.__shared || []).length && window.__shared[window.__shared.length - 1], null, 25000);
  const l4 = await LOG('gcb_lead_03');
  ok('a10 📤 phone share: the share sheet gets the paper as a PDF; logged shared', !!rs && rs.ok && !!shared && shared.files.length === 1 && shared.files[0].type === 'application/pdf' && shared.files[0].size > 1000 && l4.some(e => e.act === 'shared'), { rs, shared, l4 });
  PDFS.push(['EPA / HUD paper (Lead 03) from the phone', shared && shared.files.length ? 'shared as PDF (' + shared.files[0].size + ' bytes)' : 'NOT shared as PDF']);
  const rows = await B.ev(() => { const p = window._crm.projects.find(x => x.id === 'PRRP'); const J = p.jobDocs || {}; return { sent: Object.keys(J.sent || {}), html: window._gcJobDocs.html(p) }; });
  const rowSent = k => { const m = new RegExp('data-jk="' + k + '"[\\s\\S]{0,4000}?(Sent|E-signed|Shared)').exec(rows.html); return !!m; };
  ok('a11 the papers show Sent on the job (portal / e-mail / share); the held text does not', ['gcb_lead_01', 'gcb_lead_08', 'gcb_lead_03'].every(k => rows.sent.includes(k)) && !rows.sent.includes('gcb_lead_11') && ['gcb_lead_01', 'gcb_lead_08'].every(rowSent), rows.sent);
  ok('a12 each send is logged with the levels version used', [...l1, ...l2, ...l4].filter(e => e.act === 'sent' || e.act === 'shared').every(e => /2026 v\.3/.test(e.levels || '')), [...l1, ...l2, ...l4]);
  /* f) 🧾 Snap a receipt from Home; More is a page; Back returns */
  await B.ev(() => { document.querySelectorAll('.gc-ra-sheet,.gc-fh-sheet,.gcfp-sheet,#_gcJobDash').forEach(o => o.remove()); const h = document.querySelector('#gc-fh-tabs [data-t="home"]'); if (h) h.click(); }); await sleep(1200);
  await B.ev(() => { const b = document.querySelector('.gc-pmf [data-pmf-a="receipt"]'); if (b) b.click(); });
  ok('f9 🧾 Snap a receipt is on Field Home and opens the expense form', !!await H.waitFor(B, () => !!document.getElementById('_gcLogExpOv'), null, 8000));
  await B.ev(() => document.querySelectorAll('#_gcLogExpOv').forEach(o => o.remove())); await sleep(400);
  await B.ev(() => document.querySelector('#gc-fh-tabs [data-t="more"]').click());
  const mp = await wait(B, () => { const o = document.querySelector('.gc-fh-sheet[data-ra-more]'); if (!o) return null; const r = o.getBoundingClientRect(); return { ov: o.getAttribute('data-w-ov'), full: Math.round(r.width) >= innerWidth - 1, bg: getComputedStyle(o).backgroundColor }; }, null, 8000);
  ok('f10 ☰ More is a full-screen white page', !!mp && mp.ov === 'page' && mp.full && lightBg(mp.bg) !== false, mp);
  await B.ev(() => { try { window._gcNavBack(); } catch (e) {} }); await sleep(800);
  ok('f11 Back from ☰ More returns to Field Home', !(await B.ev(() => !!document.querySelector('.gc-fh-sheet[data-ra-more]'))) && await B.ev(() => !!document.querySelector('#_gcJobPick.gc-fh')));
  for (const k of ['appr', 'ra-sched', 'jobs']) { await B.ev(k => document.querySelector('#gc-fh-tabs [data-t="' + k + '"]').click(), k); await sleep(1000); await B.ev(() => { for (let i = 0; i < 4; i++) { try { window._gcNavBack(); } catch (e) {} } }); await B.ev(() => document.querySelector('#gc-fh-tabs [data-t="home"]').click()); await sleep(700); }
  ok('f12 every bar button and Back / Home leaves Field Home showing (nothing stuck on top)', await B.ev(() => !!document.querySelector('#_gcJobPick .gc-pmf')));
  /* the job page in Field: the paperwork card, white */
  await B.ev(() => window._gcJobDashboard('PRRP')); await sleep(2500);
  const jp = await B.ev(() => { const d = document.getElementById('_gcJobDash'); return d ? { bg: getComputedStyle(d).backgroundColor, papers: /Paperwork|papers? to send/.test(d.innerText) } : null; });
  ok('f13 the Field job page is white / light', !!jp && lightBg(jp.bg) !== false, jp);
  console.log('    (info: the Field job page ' + (jp && jp.papers ? 'shows' : 'does NOT show') + ' a 📑 Paperwork card — on the phone the papers are on Field Home, "Needs you · 📑 N papers to send")');
  await shot(B, 'f13_field_job');
  const eB = errsOf(B);
  ok('f14 phone: no page errors anywhere', !eB.length, eB.slice(0, 6));
  await B.close();
});

console.log('\n  PDFs made:'); PDFS.forEach(p => console.log('    · ' + p[0] + ' — ' + p[1]));
const pass = R.filter(Boolean).length; console.log(`\nCOMBO flow ${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
