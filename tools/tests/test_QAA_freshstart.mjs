// test_QAA_freshstart.mjs <build-dir> [shot-dir] — patch QAA (owner 11/12, for the morning): "start fresh — bid portal empty, this as my
// first job for subs to see public". The owner's exact path end to end, on the REAL bid-hub.js + subportal.js (in-memory database), the
// CRM (offline harness) and the built bid site (subportal/) — made-up people, jobs and files only:
//   1. ~200 old auto-added bid jobs (drafts from the Lead Inbox — some with the bid-board files the inbox copied in, some opened
//      "private" by the old automatic sweep, some with a bad due date) → 🧹 Clean up auto-added jobs (an admin, a confirm) →
//      the CRM tab's lists are EMPTY (Open / Private / Public / Drafts 0, 🗄 Archived 200), the bid site's admin list is empty
//      ("🗄 Show archived (200)"), an approved sub sees nothing; the leads no longer say "🏗 draft / private"
//   2. 📢 Put on bid portal from a NEW apartment job: 🌐 Public, 8 trades, due date, scope + specs, the job's plan PDF (48 MB) and its
//      ZIP, a 🔗 Drive link for the big set; a 51 MB file is refused by name ("over 50 MB")
//   3. the bid site admin adds a ZIP of sheets to that job (unpacked)
//   4. an APPROVED sub (papers on file) sees exactly that one job with its plans (PDF, ZIP, the sheets, 🔗 Open plans ↗), opens a plan,
//      asks ❓ a question, bids → the CRM's 📊 Bids & invites shows the bid (Bids 1) and the poster gets "❓ 1 bid question" on To-Do
//   5. an approved sub WITHOUT papers cannot bid (the server refuses); a sub NOT approved sees nothing ("waiting for GrayCo");
//      a brand-new sub signs up (Request Access) and is told to wait for approval
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, STORE, ACC, putRow, rowsOf, rowData, PDF, zipOf } = W;
const { computer, signIn, sleep, cset, cget, resetCloud } = W.H;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || process.env.QAA_SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
W.install();
const F = W.fns(BUILD);
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), now = new Date().toISOString(), ago = new Date(Date.now() - 20 * 864e5).toISOString();

/* ── made-up data ── */
resetCloud();
DB.gc_staff.push({ email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true }, { email: 'pat.demo@grayco-cs.com', name: 'Pat Demo', role: 'staff', active: true }, { email: 'sbiffle@grayco-cs.com', name: 'Glenn Demo', role: 'staff', profile: 'estimator', active: true });
/* subs on the bid site: Zedd (approved, papers on file), Dee (approved, NO papers), Pending Pete (not approved yet) */
const subs = [['u_zedd', 'zedd@zeddframing.test', 'Zedd Sample', 'Zedd Framing & Drywall LLC', ['Framing', 'Drywall'], true, true], ['u_dee', 'dee@deepaint.test', 'Dee Sample', 'Dee Paint Co', ['Paint'], true, false],
  ['u_pete', 'pete@petefloors.test', 'Pete Sample', 'Pete Floors LLC', ['Flooring'], false, true]];
for (const [id, email, name, company, trades, approved, papers] of subs) {
  ACC[email] = { pw: 'Sub-Pass-' + id.slice(2), id: 'auth-' + id };
  putRow('users', id, { id, role: 'sub', approved, email, name, company, phone: '901-555-01' + (10 + subs.findIndex(x => x[0] === id)), trades, createdAt: ago }, { user_id: id, email });
  if (papers) putRow('subdocs', id, { items: [{ id: 'd1', type: 'w9', fileRef: 'u/' + id + '/w9.pdf' }, { id: 'd2', type: 'insurance_general', expirationDate: day(200), fileRef: 'u/' + id + '/gl.pdf' }, { id: 'd3', type: 'insurance_workers_comp', expirationDate: day(150), fileRef: 'u/' + id + '/wc.pdf' }] }, { user_id: id });
}
/* 200 old auto-added jobs, as the old automatic sync left them */
const OLD = [];
for (let i = 0; i < 200; i++) {
  const id = 'j_auto' + String(i).padStart(3, '0'), li = 'LI-' + (1000 + i);
  const kind = i < 110 ? 'draft' : i < 150 ? 'leadfiles' : i < 185 ? 'autoprivate' : 'baddue';
  const j = { id, title: 'Demo bid-board lead #' + i + ' — ' + ['Clinic', 'School', 'Warehouse', 'Church', 'Retail'][i % 5] + ' renovation', address: (100 + i) + ' Demo St, Memphis, TN', createdBy: 'lead-inbox', createdByName: 'CRM Lead Inbox', createdAt: ago, updatedAt: ago,
    leadInbox: { id: li, source: 'Demo Bid Board', type: 'commercial' }, tradesSought: 'General', bidDueDate: kind === 'baddue' ? 'TBD' : day(5 + (i % 30)), status: 'draft', visibility: 'private', draft: true, plans: [], specDocs: [], tradeScopes: [], scopeDocs: [] };
  let plans = [];
  if (kind === 'leadfiles') { plans = [{ name: 'Bid docs ' + i + '.pdf', size: 900000, type: 'application/pdf', fileRef: 'staff/lead-inbox/' + crypto.createHash('sha1').update(id).digest('hex').slice(0, 24) + '-Bid_docs.pdf', kind: 'plans', fromLead: true }];
    j.plans = plans.map(p => ({ name: p.name, size: p.size, type: p.type })); if (i % 2) j.specDocs = [{ name: 'Project manual ' + i + '.pdf', size: 300000, type: 'application/pdf', fileRef: 'staff/lead-inbox/' + crypto.createHash('sha1').update(id + 's').digest('hex').slice(0, 24) + '-Project_manual.pdf' }]; }
  if (kind === 'autoprivate') Object.assign(j, { draft: false, status: 'open', autoPrivate: true, openedPrivateAt: ago, openedBy: 'auto' });
  putRow('jobs', id, j, { job_id: id }); putRow('plans', id, { items: plans }, { job_id: id });
  OLD.push({ id, li, kind });
}
/* one job a person DID post earlier and then took off (stays archived), one deleted 40 days ago (gone) — neither shows */
putRow('jobs', 'j_takenoff', { id: 'j_takenoff', title: 'Demo old posted job', status: 'archived', archivedReason: 'taken off', archivedAt: ago, postedAt: ago, postedBy: 'wjohnson@grayco-cs.com', visibility: 'public', draft: false, bidDueDate: day(-5) }, { job_id: 'j_takenoff' });
/* the CRM */
const at = new Date(Date.now() - 864e5).toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Glenn Demo', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true }, { id: 'u3', name: 'Pat Demo', email: 'pat.demo@grayco-cs.com', role: 'Project Manager', phone: '(901) 555-0188', active: true }]);
cset('leads', OLD.slice(0, 30).map((o, i) => ({ id: 'L' + i, name: 'Demo bid-board lead #' + i, type: 'Commercial', stage: 'New Lead', inboxId: o.li, subPortal: { jobId: o.id, state: o.kind === 'autoprivate' ? 'private' : 'draft', visibility: 'private', at: ago }, createdAt: ago, updatedAt: ago }))
  .concat([{ id: 'LAPT', name: 'Demo Oak Apartments — 12 units', type: 'Commercial', stage: 'New Lead', createdAt: ago, updatedAt: ago,
    docs: [{ ref: 'sb:crm-files/' + crypto.createHash('sha256').update('lead-a').digest('hex') + '.pdf', name: 'Oak Apartments plans.pdf', type: 'application/pdf', size: 3200000 }],
    files: [{ ref: 'sb:crm-files/' + crypto.createHash('sha256').update('lead-b').digest('hex') + '.pdf', name: 'Bid invitation.pdf', kind: 'email' }, { ref: 'sb:crm-files/' + crypto.createHash('sha256').update('lead-c').digest('hex') + '.pdf', name: 'Oak specs.pdf', type: 'application/pdf' }] }]));
const H64 = n => crypto.createHash('sha256').update(n).digest('hex');
const BIG = 48 * 1024 * 1024, HUGE = 51 * 1024 * 1024;
STORE.set('crm-files/' + H64('a1') + '.pdf', PDF('A-set', BIG));
const ZIP1 = zipOf([{ name: 'Structural/S1.1 Foundation.pdf', data: PDF('S1.1') }, { name: 'Structural/S2.1 Framing.pdf', data: PDF('S2.1') }]);
STORE.set('crm-files/' + H64('z1') + '.zip', ZIP1);
STORE.set('crm-files/' + H64('h1') + '.pdf', PDF('huge', HUGE));
cset('projects', [{ id: 'P_APT', name: 'Zedd Flats Apartments — 24 units', client: 'Demo Flats LLC', address: '400 Demo Ave', city: 'Memphis', state: 'TN', status: 'estimating', autoPO: 'T501', pm: 'Pat Demo', companyId: 'construction',
  scope: 'New 3-story, 24-unit apartment building (wood frame over slab), 21,600 SF.', createdAt: at, updatedAt: at, files: [] }]);
cset('estimates', [{ id: 'E_APT', name: 'Zedd Flats Apartments — base bid', status: 'Draft', pid: 'P_APT', lines: [{ id: 'H1', desc: 'General conditions', cost: 40000, qty: 1, cat: 'General', type: 'labor', mult: 'type' }], scope: { text: '24-unit apartment building.' }, settings: {}, jobMult: 'mat', totalCost: 40000, totalCharge: 52000, createdAt: at, savedAt: at, updatedAt: at }]);
cset('projectDocs', [
  { id: 'D1', pid: 'P_APT', cat: 'Plans/Drawings', name: 'Zedd Flats — architectural set.pdf', type: 'application/pdf', size: BIG, data: 'sb:crm-files/' + H64('a1') + '.pdf', ref: 'sb:crm-files/' + H64('a1') + '.pdf', date: at.slice(0, 10) },
  { id: 'D2', pid: 'P_APT', cat: 'Plans/Drawings', name: 'Zedd Flats — structural sheets.zip', type: 'application/zip', size: ZIP1.length, data: 'sb:crm-files/' + H64('z1') + '.zip', ref: 'sb:crm-files/' + H64('z1') + '.zip', date: at.slice(0, 10) },
  { id: 'D3', pid: 'P_APT', cat: 'Plans/Drawings', name: 'Zedd Flats — MEP (huge).pdf', type: 'application/pdf', size: HUGE, data: 'sb:crm-files/' + H64('h1') + '.pdf', ref: 'sb:crm-files/' + H64('h1') + '.pdf', date: at.slice(0, 10) }]);

const shot = async (p, name, full) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }).catch(() => {}); };
const wait = async (c, f, arg, ms = 25000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
const visibleJobsFor = async email => {   /* what the server gives this sub as "jobs" */
  const tok = 't-' + crypto.randomBytes(4).toString('hex'); W.TOK[tok] = email;
  const r = await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tok, origin: 'https://bids.test' }, body: JSON.stringify({ action: 'load', keys: ['jobs', 'plans:' + (POSTED || 'x')] }) });
  return JSON.parse(r.body);
};
let POSTED = '';

/* ═══ 1. the clean-up ═══ */
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await W.wireCrm(A, BUILD, F);
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
/* the owner opens 🏗 Bid portal: it opens on 🧰 Full bid portal (the bid site's admin in a frame) with the 200 old jobs */
await A.ev(() => window._setView('bidportal'));
const frameText = async (re, ms) => { for (let i = 0; i < (ms || 30000) / 400; i++) { const f = A.page().frames().find(x => /\/subportal\/$/.test(x.url())); if (f) { const t = await f.evaluate(() => document.body.innerText).catch(() => ''); if (re.test(t)) return t; } await sleep(400); } return null; };
const old0 = await frameText(/Demo bid-board lead/, 40000);
ok('1 the tab opens on 🧰 Full bid portal: the bid site admin lists the old auto-added jobs', !!old0, null);
await A.ev(() => { const b = document.querySelector('#gc-sys-bp-mount [data-sys="bpmode"][data-m="crm"]'); b && b.click(); });
await wait(A, () => document.querySelector('#gc-sys-bp-mount [data-sys="cleanup"]'), null, 40000);
const before = await A.ev(() => ({ btn: (document.querySelector('#gc-sys-bp-mount [data-sys="cleanup"]') || {}).textContent, f: [...document.querySelectorAll('#gc-sys-bp-mount [data-sys="f"]')].map(b => b.textContent) }));
ok('1 before: "🧹 Clean up auto-added jobs (200)" — every old auto-added job counts (incl. the ones the Lead Inbox copied bid-board files into, and the auto-private ones)', before.btn === '🧹 Clean up auto-added jobs (200)', before);
await shot(A.page(), 'fs01_crm_before_cleanup');
A.acceptConfirm = true;
await A.ev(() => document.querySelector('#gc-sys-bp-mount [data-sys="cleanup"]').click());
await wait(A, () => !document.querySelector('#gc-sys-bp-mount [data-sys-auto]') && /Archived \(\d+\)/.test(document.querySelector('#gc-sys-bp-mount [data-sys-filters]').textContent), null, 30000);
await sleep(800);
const after = await A.ev(() => ({ f: [...document.querySelectorAll('#gc-sys-bp-mount [data-sys="f"]')].map(b => b.textContent), rows: document.querySelectorAll('#gc-sys-bp-mount tr[data-sys-job]').length, txt: document.querySelector('#gc-sys-bp-mount [data-sys-rows]').innerText.slice(0, 200) }));
const fc = k => (after.f.find(x => x.indexOf(k) === 0) || '');
ok('1 after: Open (0), 🔒 Private (0), 🌐 Public (0), 📝 Drafts (0), All (0) — no job rows; 🗄 Archived (201) (the 200 + the one taken off earlier)', fc('Open') === 'Open (0)' && fc('🔒') === '🔒 Private (0)' && fc('🌐') === '🌐 Public (0)' && fc('📝') === '📝 Drafts (0)' && fc('All') === 'All (0)' && fc('🗄') === '🗄 Archived (201)' && after.rows === 0, after);
const arch = rowsOf('jobs').filter(r => r.data.status === 'archived' && r.data.archivedReason === 'auto').length;
ok('1 the server archived all 200 (archived, reason auto — nothing deleted; plans rows kept)', arch === 200 && rowsOf('plans').length === 200 && rowsOf('jobs').length === 201, { arch, plans: rowsOf('plans').length });
await shot(A.page(), 'fs02_crm_after_cleanup');
/* the bid site, as the admin and as an approved sub */
const empty = await visibleJobsFor('zedd@zeddframing.test');
ok('1 an approved sub gets NO jobs from the server', Array.isArray(empty.data && empty.data.jobs) && empty.data.jobs.length === 0, empty);
/* the 🧰 Full bid portal frame (the bid site's own admin, signed in with the CRM sign-in) */
await A.ev(() => { const b = document.querySelector('#gc-sys-bp-mount [data-sys="bpmode"][data-m="full"]'); b && b.click(); });
const frT = await frameText(/No jobs yet/, 15000);
ok('1 back on 🧰 Full bid portal right away (no waiting for its 1-minute refresh): the bid site admin list is EMPTY — "No jobs yet" and "🗄 Show archived (201)"', !!frT && /Show archived \(201\)/.test(frT) && !/Demo bid-board lead/.test(frT), frT && frT.slice(0, 500));
await shot(A.page(), 'fs03_crm_fullportal_empty');
/* the leads no longer say "🏗 draft / private" for the cleaned-up jobs */
await A.ev(() => window._setView('leads')); await wait(A, () => document.querySelector('#gc-leads-hub [data-gcl-v="list"]'), null, 20000);
await A.ev(() => { const b = document.querySelector('#gc-leads-hub [data-gcl-v="board"]'); b && b.click(); }); await sleep(2500);
const chips = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub .gcl-chip')].map(c => c.textContent).filter(t => /^🏗/.test(t)));
await A.ev(() => window._gcLeadsHub.open('L3')); await sleep(1200);
const drw = await A.ev(() => { const d = document.getElementById('gcl-drawer'); return d ? d.innerText : ''; });
ok('1 a cleaned-up lead\'s page: no "Private draft — staff only" / "Private — invited subs only" / "Draft in the bid portal" for the archived job', drw.length > 50 && !/Private draft — staff only|Private — invited subs only|Draft in the bid portal/.test(drw), drw.replace(/\s+/g, ' ').match(/.{0,80}(Private|portal).{0,80}/g));
await A.ev(() => window._gcLeadsHub.close()); await sleep(400);
ok('1 Leads board: no "🏗 draft" / "🏗 private" chips left for the archived jobs (shows 🏗 —)', chips.length > 0 && chips.every(t => t === '🏗 —'), chips.slice(0, 8));

/* ═══ 2. 📢 Put on bid portal from the new apartment job ═══ */
await A.ev(() => { window._gcOpenProject = { id: 'P_APT' }; window._setView('projects'); });
await A.ev(() => { try { if (window._navToJob) window._navToJob('P_APT'); else if (window._gcOpenJobProfile) window._gcOpenJobProfile('P_APT'); } catch (e) {} });
const jb = await wait(A, () => { const b = document.querySelector('#gcbp-job [data-bidpost]'); return b && b.textContent; }, null, 25000);
ok('2 the new job\'s page has "📢 Put on bid portal"', /Put on bid portal/.test(jb || ''), jb);
await A.ev(() => document.querySelector('#gcbp-job [data-bidpost]').click());
await wait(A, () => document.querySelector('#gcbp-modal #gcbp-title'));
const sheet = await A.ev(() => ({ title: document.getElementById('gcbp-title').value, files: [...document.querySelectorAll('#gcbp-modal [data-bp-file]')].map(x => x.parentNode.textContent.trim() + (x.checked ? ' [x]' : '')) }));
ok('2 the sheet: the job title and its 3 plan files offered (ticked)', sheet.title === 'Zedd Flats Apartments — 24 units' && sheet.files.length === 3 && sheet.files.every(f => / \[x\]$/.test(f)), sheet);
const DUE = day(14), TRADES = ['Framing', 'Drywall', 'Paint', 'Flooring', 'Plumbing', 'Electrical', 'HVAC', 'Roofing'];
await A.ev(([due, trades]) => {
  document.querySelector('#gcbp-modal input[name="gcbp-vis"][value="public"]').click();
  [...document.querySelectorAll('#gcbp-modal [data-bp="trade"]')].filter(b => trades.includes(b.textContent)).forEach(b => b.click());
  document.getElementById('gcbp-due').value = due;
  document.getElementById('gcbp-scope').value = 'New 3-story, 24-unit apartment building, 21,600 SF. Price your trade complete per plans and specs.';
  document.getElementById('gcbp-specs').value = 'Walk-through Tuesdays 9 AM. Questions due 3 days before bids. Unit mix: 12 one-bed, 12 two-bed.';
  document.getElementById('gcbp-link').value = 'https://drive.google.com/drive/folders/demo-zedd-flats-full-set';
}, [DUE, TRADES]);
await shot(A.page(), 'fs04_put_on_bid_portal_apartment');
await A.ev(() => document.querySelector('#gcbp-modal [data-bp="post"]').click());
await wait(A, () => !document.getElementById('gcbp-modal'), null, 30000);
const toastT = await A.ev(() => [...document.querySelectorAll('.gcsys-toast')].map(t => t.textContent).join(' | '));
const posted = rowsOf('jobs').map(r => r.data).filter(j => j.crmProjectId === 'P_APT');
POSTED = posted[0] && posted[0].id;
const pj = posted[0] || {}, plansRow = (rowData('plans/' + POSTED) || { items: [] }).items;
ok('2 posted: ONE public job, open, due date, the 8 trades, scope + specs, the 🔗 Drive link, linked to the job (PM Pat Demo)', posted.length === 1 && pj.visibility === 'public' && pj.status === 'open' && pj.draft === false && pj.bidDueDate === DUE
  && pj.tradesSought.split(', ').sort().join() === TRADES.slice().sort().join() && /24-unit/.test(pj.scope) && /Walk-through/.test(pj.specifications) && (pj.plansLinks || []).some(l => /demo-zedd-flats-full-set/.test(l.url)) && pj.pmName === 'Pat Demo', pj);
ok('2 the 48 MB PDF and the ZIP are copied to the bid site; the 51 MB one is refused by name (over 50 MB) and the toast says so', plansRow.map(x => x.name).sort().join('|') === 'Zedd Flats — architectural set.pdf|Zedd Flats — structural sheets.zip' && /not copied: Zedd Flats — MEP \(huge\)\.pdf/.test(toastT)
  && STORE.has('subportal-files/' + plansRow[0].fileRef), { plans: plansRow.map(x => x.name), toastT });
ok('2 … and the job record lists them for the bid site (job.plans — what the bid site shows a sub)', (pj.plans || []).map(x => x.name).sort().join('|') === 'Zedd Flats — architectural set.pdf|Zedd Flats — structural sheets.zip', pj.plans);
await sleep(1500);
/* 📢 from a LEAD that has its plan files stored in the CRM: they are offered too (not the e-mail itself) */
await A.ev(() => window._gcBidPost.open({ leadId: 'LAPT' })); await wait(A, () => document.querySelector('#gcbp-modal #gcbp-title'));
const lsh = await A.ev(() => [...document.querySelectorAll('#gcbp-modal [data-bp-file]')].map(x => x.parentNode.textContent.trim() + (x.checked ? ' [x]' : '')));
ok('2 📢 on a lead: the lead\'s own plan files are offered (ticked) — not the bid e-mail', lsh.length === 2 && lsh.some(t => /Oak Apartments plans\.pdf \[x\]/.test(t)) && lsh.some(t => /Oak specs\.pdf \[x\]/.test(t)), lsh);
await A.ev(() => window._gcBidPost.close());
await A.ev(() => window._setView('bidportal')); await sleep(400);
await A.ev(() => { const b = document.querySelector('#gc-sys-bp-mount [data-sys="bpmode"][data-m="crm"]'); b && b.click(); if (window._gcSys && window._gcSys.bp) window._gcSys.bp.load(true); });
await wait(A, () => document.querySelectorAll('#gc-sys-bp-mount tr[data-sys-job]').length === 1, null, 20000);
const crm1 = await A.ev(() => ({ rows: [...document.querySelectorAll('#gc-sys-bp-mount tr[data-sys-job]')].map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 200)), f: [...document.querySelectorAll('#gc-sys-bp-mount [data-sys="f"]')].map(b => b.textContent) }));
ok('2 the CRM tab: exactly 1 job — 🌐 Public, 📢 posted by Wesley Johnson; Open (1), 🌐 Public (1)', crm1.rows.length === 1 && /Zedd Flats Apartments/.test(crm1.rows[0]) && /Public/.test(crm1.rows[0]) && /posted by Wesley Johnson/.test(crm1.rows[0]) && crm1.f.includes('Open (1)') && crm1.f.includes('🌐 Public (1)'), crm1);
await shot(A.page(), 'fs05_crm_one_public_job');

/* ═══ 3. the bid site admin adds a ZIP of sheets ═══ */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const page = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push('bids: ' + String(e.message).slice(0, 200))); await p.goto('https://bids.test/'); return p; };
ACC['wjohnson@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-w' };
const AD = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
await W.bidsLogin(AD, 'wjohnson@grayco-cs.com', 'Admin-Pass-1');
await AD.waitForSelector('text=Zedd Flats Apartments', { timeout: 30000 });
const adl = await AD.evaluate(() => document.body.innerText);
ok('3 bid site admin: only the new job (+ "🗄 Show archived (201)")', /Zedd Flats Apartments/.test(adl) && /Show archived \(201\)/.test(adl) && !/Demo bid-board lead/.test(adl), adl.slice(0, 400));
await AD.click('text=Zedd Flats Apartments'); await AD.waitForSelector('[data-plans="upload"]', { timeout: 15000 });
await AD.setInputFiles('[data-plans="file"]', [{ name: 'Zedd Flats MEP sheets.zip', mimeType: 'application/zip', buffer: zipOf([{ name: 'Mechanical/M1.1 HVAC plan.pdf', data: PDF('M1.1') }, { name: 'Plumbing/P1.1 Riser.pdf', data: PDF('P1.1') }]) }]);
await AD.waitForFunction(() => /M1\.1 HVAC plan\.pdf/.test(document.body.innerText) && /P1\.1 Riser\.pdf/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
const pl2 = (rowData('plans/' + POSTED) || { items: [] }).items.map(x => x.name);
ok('3 the ZIP is unpacked into its sheets on the same job (the 2 copied files kept)', pl2.length === 4 && pl2.includes('M1.1 HVAC plan.pdf') && pl2.includes('P1.1 Riser.pdf'), pl2);
await shot(AD, 'fs06_bidsite_admin_job_plans');

/* ═══ 4. an approved sub ═══ */
const SC = await W.bidsCtx(browser, BUILD, F, 'desktop'), S = await page(SC);
await W.bidsLogin(S, 'zedd@zeddframing.test', 'Sub-Pass-zedd');
await S.waitForSelector('text=Zedd Flats Apartments', { timeout: 30000 }); await sleep(800);
const sl = await S.evaluate(() => ({ body: document.body.innerText, cards: [...document.querySelectorAll('h3, h4')].map(x => x.textContent.trim()).filter(t => /Zedd Flats|Demo/.test(t)) }));
ok('4 the approved sub sees exactly ONE job (the apartments) — days left · due, 4 plans, its PM Pat Demo as the contact; nothing old', sl.cards.length === 1 && /Zedd Flats Apartments/.test(sl.cards[0]) && /days left/.test(sl.body) && /4 plans/.test(sl.body) && /Pat Demo/.test(sl.body) && !/Demo bid-board lead|Demo old posted/.test(sl.body), sl.cards.concat([sl.body.slice(0, 300)]));
await shot(S, 'fs07_sub_list_one_job');
await S.click('text=Zedd Flats Apartments'); await S.waitForSelector('#bid-planlinks', { timeout: 20000 }).catch(() => {}); await sleep(1500);
const sv = await S.evaluate(() => ({ body: document.body.innerText, links: [...document.querySelectorAll('a[href*="drive.google.com"]')].map(a => a.textContent.trim()) }));
ok('4 the job: the 2 copied files and the unpacked sheets, 🔗 Open plans ↗ (Drive), the trades and the scope', /architectural set\.pdf/.test(sv.body) && /structural sheets\.zip/.test(sv.body) && /M1\.1 HVAC plan\.pdf/.test(sv.body) && sv.links.some(l => /Open plans/.test(l)) && /Framing/.test(sv.body) && /24-unit/.test(sv.body) && !/Trade-Specific Scopes/i.test(sv.body), { links: sv.links, body: sv.body.slice(0, 900) });
await shot(S, 'fs08_sub_job_detail', true);
/* open a plan: a signed link to the real file */
const signReq = []; SC.on('request', r => { if (/\/storage\/v1\/object\/sign\/subportal-files\//.test(r.url())) signReq.push(r.url()); });
await S.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Download|View|Open/.test(x.textContent) && x.closest('div') && /architectural set\.pdf/.test(x.closest('div').parentNode.textContent)); if (b) b.click(); });
await sleep(2500);
ok('4 opening a plan fetches that PDF through a signed link (a new tab), no error', signReq.some(u => /architectural/.test(decodeURIComponent(u))), signReq);
/* ❓ a question */
await S.evaluate(() => { const t = document.querySelector('[data-q="ask"]'); if (t) t.scrollIntoView({ block: 'center' }); });
await S.fill('[data-q="ask"]', 'Are the balcony railings in the framing scope or by others?');
await S.click('[data-q="send"]'); await sleep(2000);
const q1 = rowsOf('questions').map(r => r.data);
ok('4 ❓ the question is saved on the job (from the sub)', q1.length === 1 && q1[0].jobId === POSTED && /balcony railings/.test(q1[0].body) && q1[0].userId === 'u_zedd', q1);
/* the bid */
await S.fill('xpath=//label[starts-with(normalize-space(.), "Bid Amount")]/following-sibling::input', '186500').catch(async () => { await S.locator('input[type=number]').first().fill('186500'); });
await S.locator('textarea').filter({ hasNot: S.locator('[data-q]') }).first().fill('Framing + drywall complete, 3 floors, per plans.').catch(() => {});
await S.click('button:has-text("Submit Bid"), button:has-text("Enter Bid"), button:has-text("Send Bid")').catch(() => {});
await sleep(2500);
const b1 = rowsOf('bids').map(r => r.data);
ok('4 the bid is saved ($186,500, the sub, the job)', b1.length === 1 && b1[0].jobId === POSTED && Number(b1[0].amount) === 186500 && b1[0].userId === 'u_zedd', b1);
await shot(S, 'fs09_sub_bid_sent');
/* the CRM: 📊 Bids & invites + the question To-Do */
await A.ev(() => { if (window._gcSys && window._gcSys.bp) window._gcSys.bp.load(true); }); await sleep(2500);
const crm2 = await A.ev(() => { const r = document.querySelector('#gc-sys-bp-mount tr[data-sys-job]'); return r ? r.innerText.replace(/\s+/g, ' ') : ''; });
ok('4 CRM tab: the job row shows Bids (1)', /📊 Bids \(1\)/.test(crm2), crm2);
await A.ev(id => window._gcBidEst.open(id), POSTED);
const bt = await wait(A, () => { const r = document.querySelector('#gcsys-modal tr[data-be-bid]'); return r && document.querySelector('#gcsys-modal').innerText; }, null, 20000);
ok('4 📊 Bids & invites: the sub\'s bid by trade — Zedd Framing & Drywall LLC $186,500', /Zedd Framing & Drywall LLC/.test(bt || '') && /\$186,500/.test(bt || '') && /Framing/.test(bt || ''), (bt || '').slice(0, 500));
await shot(A.page(), 'fs10_crm_bids_sheet');
/* 🏆 Award → the bid goes into the apartment job's estimate (the job 📢 was posted from) and the sub's bid says awarded */
const bidKey = await A.ev(() => { const r = document.querySelector('#gcsys-modal tr[data-be-bid]'); return r && r.getAttribute('data-be-bid'); });
await A.ev(k => { const b = document.querySelector('#gcsys-modal tr[data-be-bid="' + k + '"] [data-be="award"]'); b && b.click(); }, bidKey);
for (let i = 0; i < 40; i++) { if (await A.ev(() => !!document.querySelector('#gcsys-modal [data-be="cfgo"]'))) break; await sleep(250); }
await A.ev(() => { const b = document.querySelector('#gcsys-modal [data-be="cfgo"]'); b && b.click(); }); await sleep(3500);
const estA = await A.ev(() => { const l = (window._gcEstimatesState && window._gcEstimatesState.length ? window._gcEstimatesState : window._crm.estimates) || []; const e = l.find(x => x && x.id === 'E_APT'); return e ? (e.lines || []).filter(x => x.bidRef).map(x => ({ cost: x.cost, cat: x.cat, aw: x.bidRef.awarded, desc: x.desc })) : null; });
const awardedRow = (rowsOf('bids').find(r => r.data.userId === 'u_zedd') || {}).data || {};
ok('4 🏆 Award: the bid is marked awarded on the bid site and lands as an awarded line on the apartment estimate ($186,500)', awardedRow.accepted === true && Array.isArray(estA) && estA.length === 1 && estA[0].cost === 186500 && estA[0].aw === true, { estA, accepted: awardedRow.accepted, key: bidKey });
await A.ev(() => window._gcBidEst.close && window._gcBidEst.close());
await A.ev(() => window._gcBidPost.jobs(true)); await sleep(800);
const td = await A.ev(() => window._gcBidPost.todo().map(x => x.title));
ok('4 To-Do: "❓ 1 bid question to answer — Zedd Flats Apartments — 24 units"', td.includes('❓ 1 bid question to answer — Zedd Flats Apartments — 24 units'), td);

/* ═══ 5. who may NOT bid / see ═══ */
const tokD = 't-dee'; W.TOK[tokD] = 'dee@deepaint.test';
const dl = JSON.parse((await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tokD, origin: 'https://bids.test' }, body: JSON.stringify({ action: 'load', keys: ['jobs'] }) })).body);
ok('5 an approved sub without papers SEES the public job', (dl.data.jobs || []).length === 1, dl);
const db = await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tokD, origin: 'https://bids.test' }, body: JSON.stringify({ action: 'save', key: 'bids', upsert: [{ id: 'b_dee1', jobId: POSTED, userId: 'u_dee', amount: 42000, submittedAt: now }] }) });
ok('5 … but the server refuses a bid without W-9 / GL / WC on file (says what is missing)', db.statusCode >= 400 && /W-9|missing/i.test(db.body) && !rowsOf('bids').some(r => r.id === 'b_dee1'), { code: db.statusCode, body: db.body.slice(0, 300) });
const P = await page(await W.bidsCtx(browser, BUILD, F, 'phone'));
await W.bidsLogin(P, 'pete@petefloors.test', 'Sub-Pass-pete'); await sleep(4000);
const pv = await P.evaluate(() => ({ body: document.body.innerText, w: document.documentElement.scrollWidth }));
ok('5 a sub NOT approved (phone): the "waiting for GrayCo" banner and NO jobs', /approv/i.test(pv.body) && !/Zedd Flats Apartments/.test(pv.body) && pv.w <= 392, pv.body.slice(0, 400));
await shot(P, 'fs11_unapproved_sub_phone');
const pj5 = JSON.parse((await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer t-pete', origin: 'https://bids.test' }, body: JSON.stringify({ action: 'load', keys: ['jobs'] }) }).then(r => r, () => ({ body: '{}' }))).body || '{}');
W.TOK['t-pete'] = 'pete@petefloors.test';
const pj6 = JSON.parse((await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer t-pete', origin: 'https://bids.test' }, body: JSON.stringify({ action: 'load', keys: ['jobs', 'plans:' + POSTED] }) })).body);
ok('5 … and the server gives them no jobs and no plans', (pj6.data.jobs || []).length === 0 && (pj6.data['plans:' + POSTED] || []).length === 0, pj6);
/* a brand-new sub signs up */
const N = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
await N.waitForSelector('text=Request Access', { timeout: 30000 }); await N.click('text=Request Access');
await N.waitForSelector('[data-su="company"]', { timeout: 15000 });
await N.fill('[data-su="company"]', 'Nova Demo Electric LLC'); await N.fill('[data-su="name"]', 'Nova Sample'); await N.fill('[data-su="email"]', 'nova@novaelectric.test'); await N.fill('[data-su="phone"]', '901-555-0199');
await N.fill('[data-su="city"]', 'Bartlett'); await N.fill('[data-su="state"]', 'TN'); await N.fill('[data-su="crew"]', '5');
await N.click('[data-su-trade="Electrical"]').catch(() => {}); await N.fill('[data-su="area"]', 'Shelby county'); await N.fill('[data-su="pw"]', 'Nova-Pass-123');
await N.check('[data-pp="w9_later"]').catch(() => {}); await N.check('[data-pp="gl_later"]').catch(() => {}); await N.check('[data-pp="wc_later"]').catch(() => {});
await N.click('button:has-text("Request Access") >> nth=-1').catch(() => {});
await sleep(5000);
const nv = await N.evaluate(() => document.body.innerText);
const np = (rowsOf('users').find(r => r.data.email === 'nova@novaelectric.test') || {}).data;
ok('5 a brand-new sub signs up: profile saved NOT approved, and the screen says GrayCo will review / approve it; no jobs shown', !!np && np.approved === false && /approv|review/i.test(nv) && !/Zedd Flats Apartments/.test(nv), { np: np && { approved: np.approved, trades: np.trades }, nv: nv.slice(0, 400) });
await shot(N, 'fs12_new_sub_waiting');

/* 6. a Lead Inbox lead whose old auto-added job was cleaned up, posted again with 📢 (private): its chip / page follow the NEW job */
await A.ev(() => window._setView('leads')); await sleep(1500);
await A.ev(() => window._gcBidPost.open({ leadId: 'L0' })); await wait(A, () => document.querySelector('#gcbp-modal #gcbp-title'));
await A.ev(() => { [...document.querySelectorAll('#gcbp-modal [data-bp="trade"]')].filter(b => b.textContent === 'Paint').forEach(b => b.click()); document.querySelector('#gcbp-modal [data-bp="post"]').click(); });
await wait(A, () => !document.getElementById('gcbp-modal'), null, 30000); await sleep(2500);
await A.ev(ids => { try { localStorage.setItem('gc_ldi_cache_v2', JSON.stringify({ at: new Date().toISOString(), items: ids.map(o => ({ id: o.li, status: 'imported', portal: { jobId: o.id, state: 'draft', at: '2026-10-20T10:00:00Z' } })) })); } catch (e) {} }, OLD.slice(0, 30));
await A.ev(() => { const b = document.querySelector('#gc-leads-hub [data-gcl-v="board"]'); b && b.click(); if (window._gcLeadsHub) window._gcLeadsHub.redraw(); }); await sleep(2000);
const c6 = await A.ev(() => { const card = document.querySelector('#gc-leads-hub [data-gcl-id="L0"]'), card1 = document.querySelector('#gc-leads-hub [data-gcl-id="L1"]'); const ch = e => e ? [...e.querySelectorAll('.gcl-chip')].map(x => x.textContent).filter(t => /^🏗/.test(t)) : null; return { l0: ch(card), l1: ch(card1) }; });
ok('6 the re-posted lead shows "🏗 private" (its new job), a cleaned-up one "🏗 —" — even with the Lead Inbox still pointing at the old drafts', c6.l0 && c6.l0[0] === '🏗 private' && c6.l1 && c6.l1[0] === '🏗 —', c6);
ok('no page errors (CRM + bid site)', !errs.length, errs);
const fnErr = W.CALLS.filter(x => /:5\d\d$/.test(x));
ok('no server 5xx answers', !fnErr.length, fnErr);
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'index-freshstart.txt'), ['test_QAA_freshstart.mjs — the owner\'s "start fresh" bid portal path (made-up data)',
  'fs01 CRM 🏗 Bid portal → 📊 Bids & invites before: 200 old auto-added jobs, 🧹 Clean up (200)', 'fs02 after the clean-up: every list 0, 🗄 Archived (201)',
  'fs03 🧰 Full bid portal (the bid site admin inside the CRM): No jobs yet, 🗄 Show archived (201)', 'fs04 📢 Put on bid portal from the new apartment job: 🌐 Public, 8 trades, due, scope / specs, files, Drive link',
  'fs05 the CRM tab: 1 public job', 'fs06 bid site admin: the job with its plans (copied PDF + ZIP, an unpacked ZIP of sheets)', 'fs07 approved sub: exactly one job', 'fs08 the sub\'s job page: plans, Open plans ↗, scope',
  'fs09 the sub\'s bid sent', 'fs10 CRM 📊 Bids & invites: the bid by trade', 'fs11 a sub not approved yet (phone): waiting, no jobs', 'fs12 a brand-new sub after Request Access: waiting for approval', ''].join('\n'));
await browser.close(); await A.b.close();
const n = R.filter(Boolean).length; console.log('QAA_FRESHSTART ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
