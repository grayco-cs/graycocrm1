// test_BIDNEW.mjs <build-dir> [shot-dir] — BIDNEW (owner 11/23: "want to be able to enter a project into the portal from here"):
// "＋ New bid job" on the 🏗 Bid portal screen → an inline form → bid-hub op postjob (the 📢 Put on bid portal path) → 📂 Manage.
// Made-up data only.
//   A. the server (no browser): a job posted with no CRM link is made by a person (postedAt / postedBy → postedOnPurpose, never "auto");
//      an admin / estimator may; a PM only with their own lead / job; other staff never.
//   B. the CRM (offline harness, fake bid-hub): the button in the screen's bar (admin; not other staff); the inline form (no popup):
//      checks (title, trade, a public job needs a due date), the lead / job search + link (a linked one already on the bid portal is
//      not overwritten — 📂 Manage it), a Drive / Dropbox link, post → the body, then 📂 Manage opens; a PM sees only their own jobs.
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const req = createRequire(import.meta.url), FN = path.join(BUILD, 'netlify/functions');

/* ════ A. the server ════ */
Object.assign(process.env, { RESEND_API_KEY: 're-test', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test' }); delete process.env.BID_PORTAL_AUTO; process.env.PORTAL_MAIL_OFF = '1';
const BI = req(FN + '/bid-inbox.js'), H = req(FN + '/bid-hub.js')._test, SPM = req(FN + '/subportal.js'), SP = SPM._hub, L = BI._lib;
const ROWS = new Map();
SP.listRows = async filters => { const f = {}; filters.forEach(x => { const m = /^(\w+)=eq\.(.*)$/.exec(x); if (m) f[m[1]] = decodeURIComponent(m[2]); });
  return [...ROWS.values()].filter(r => (!f.collection || r.collection === f.collection) && (!f.job_id || r.job_id === f.job_id)); };
SP.getRow = async (c, id) => ROWS.get(c + '/' + id) || null;
SP.plansOf = async id => { const r = ROWS.get('plans/' + id); return r ? (r.data.items || []) : []; };
SP.upsertRows = async rows => { rows.forEach(r => ROWS.set(r.collection + '/' + r.id, Object.assign({}, r, { data: JSON.parse(JSON.stringify(r.data)) }))); return rows; };
SP.poData = async () => ({ projects: [] });
const CRM = { users: [{ name: 'Pat Planner', email: 'pat@example.com', role: 'Project Manager' }], projects: [{ id: 'P1', name: 'Sample Clinic', pm: 'Pat Planner' }], leads: [] };
SP.kvRead = async keys => { const o = {}; keys.forEach(k => { o[k] = CRM[k] || []; }); return o; };
L.portalApi = () => ({ _copyFile: async f => ({ name: f.name, size: 10, type: 'application/pdf', fileRef: 'staff/crm/' + f.name }) });
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]', arrayBuffer: async () => new ArrayBuffer(0) });
const ADMIN = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', admin: true, estimator: false, canPublic: true, canInvite: true };
const EST = { ok: true, email: 'gus@example.com', name: 'Gus Estimator', admin: false, estimator: true, canPublic: true, canInvite: true };
const PM = { ok: true, email: 'pat@example.com', name: 'Pat Planner', admin: false, estimator: false, canPublic: false, canInvite: false };
const OTHER = { ok: true, email: 'ozzie@example.com', name: 'Ozzie Office', admin: false, estimator: false, canPublic: false, canInvite: false };
const NEW = { op: 'postjob', jobId: '', pid: '', leadId: '', title: 'Sample Warehouse — roof', address: '9 Sample Way, Memphis, TN', visibility: 'private', trades: ['Roofing'], due: '2026-12-10', dueTime: '14:00', scope: 'Tear off and re-roof 12,000 SF.', links: [{ url: 'https://www.dropbox.com/sample-plans', label: 'Plans — Dropbox' }], files: [{ ref: 'sb:crm-files/' + 'b'.repeat(64) + '.pdf', name: 'roof plan.pdf' }] };
let r = await H.postjob(OTHER, NEW); ok('A1 other staff cannot post a new bid job', r.code === 403, r);
r = await H.postjob(PM, NEW); ok('A1 a PM cannot post one with no lead / job of their own', r.code === 403, r);
r = await H.postjob(ADMIN, NEW);
const j = r.jobId && ROWS.get('jobs/' + r.jobId).data;
ok('A1 an admin posts a new bid job with no CRM link: created, private, trades, due + time, scope, Dropbox link, the plan copied', r.ok && r.created && j.visibility === 'private' && j.tradesSought === 'Roofing' && j.bidDueDate === '2026-12-10' && j.bidDueTime === '14:00'
  && j.plansLinks[0].url === 'https://www.dropbox.com/sample-plans' && ROWS.get('plans/' + r.jobId).data.items[0].name === 'roof plan.pdf' && !j.crmProjectId && !j.crmLeadId, j);
ok('A1 it is "put there by a person": postedAt / postedBy, createdBy crm-post → postedOnPurpose, never auto-added', !!j.postedAt && j.postedBy === 'wjohnson@grayco-cs.com' && j.createdBy === 'crm-post' && H.postedOnPurpose(j) && !H.autoAdded(j, { plans: 0, bids: 0, invites: 0, questions: 0 }), j);
const r2 = await H.postjob(EST, Object.assign({}, NEW, { title: 'Second sample job', visibility: 'public', due: '' }));
ok('A1 a public one needs a due date (estimator)', r2.code === 400, r2);
const r3 = await H.postjob(EST, Object.assign({}, NEW, { title: 'Second sample job', visibility: 'public' }));
ok('A1 an estimator may; a second new job is a separate job (no CRM link → never merged)', r3.ok && r3.created && r3.jobId !== r.jobId, r3);
const r4 = await H.postjob(PM, Object.assign({}, NEW, { pid: 'P1', title: 'Sample Clinic — paint' }));
ok('A1 a PM may with their own job linked', r4.ok && r4.created && r4.role === 'pm' && ROWS.get('jobs/' + r4.jobId).data.crmProjectId === 'P1', r4);
const list = await H.jobsList(); const mine = list.find(x => x.id === r.jobId) || {};
ok('A1 the bid job list: not auto, posted by the admin', mine.auto === false || !mine.auto, mine);

/* ════ B. the CRM ════ */
const { computer, signIn, sleep, cset, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png', fullPage: false }); };
const at = new Date(Date.now() - 3 * 864e5).toISOString(), due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'u4', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true }]);
cset('leads', [{ id: 'L1', name: 'Sample Paint Lead', type: 'Residential', stage: 'New Lead', address: '22 Test Ln', city: 'Memphis', state: 'TN', desc: '2,500 SF exterior paint.', createdAt: at, updatedAt: at }]);
cset('projects', [{ id: 'P1', name: 'Sample Clinic Remodel', client: 'Sample Health LLC', address: '100 Sample St', city: 'Memphis', state: 'TN', status: 'estimating', autoPO: 'T101', pm: 'Sam Biffle', createdAt: at, updatedAt: at, files: [] },
  { id: 'P2', name: 'Other Sample Job', client: 'Other Client', address: '5 Other Rd', city: 'Memphis', state: 'TN', status: 'active', autoPO: 'T102', pm: 'Wesley Johnson', createdAt: at, updatedAt: at, files: [] }]);
const JOBS = [{ id: 'J_real', title: 'Sample Office Build-Out', status: 'open', visibility: 'public', due, invited: 2, bids: 1, plans: 1, postedBy: 'wjohnson@grayco-cs.com', crmProjectId: 'P2' }];
const HUB = { posts: [], manage: [] };
const route = async (c, who) => c.ctx.route('**/.netlify/functions/bid-hub*', async rt => {
  const u = new URL(rt.request().url()), q = u.searchParams, J = (b, code) => rt.fulfill({ status: code || 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (rt.request().method() === 'POST') { const b = JSON.parse(rt.request().postData() || '{}');
    if (b.op === 'postjob') { HUB.posts.push(Object.assign({ who }, b)); const id = 'J_new' + HUB.posts.length; JOBS.push({ id, title: b.title, status: 'open', visibility: b.visibility, due: b.due, invited: 0, bids: 0, plans: b.files.length, crmProjectId: b.pid, crmLeadId: b.leadId, postedBy: who, trades: b.trades.join(', ') });
      return J({ ok: true, jobId: id, created: true, visibility: b.visibility, files: b.files.length, notCopied: [] }); }
    return J({ ok: true }); }
  if (q.get('jobs')) return J({ ok: true, jobs: JOBS, me: { email: who, admin: who === 'wjohnson@grayco-cs.com', canInvite: who !== 'office@grayco-cs.com', canPublic: who === 'wjohnson@grayco-cs.com' } });
  if (q.get('manage')) { HUB.manage.push(q.get('manage')); const jj = JOBS.find(x => x.id === q.get('manage')) || {}; return J({ ok: true, job: Object.assign({ trades: [], links: [] }, jj), invites: [], subs: [], bids: [], updates: [], addenda: [], plans: [], questions: [] }); }
  return J({ ok: true, subs: [], bids: [] });
});
const wait = async (c, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
const toBP = async (A, email) => { await A.ev(e => { try { localStorage.setItem('gc_bp_mode:' + e, 'crm'); } catch (x) {} window._setView('bidportal'); }, email); await wait(A, () => document.querySelector('#gc-sys-bp [data-sys="openbids"]')); };

const A = await computer('wjohnson@grayco-cs.com', { build: BUILD, viewport: { width: 1280, height: 900 } });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await route(A, 'wjohnson@grayco-cs.com');
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await toBP(A, 'wjohnson@grayco-cs.com');
const btn = await wait(A, () => { const b = document.querySelector('#gc-sys-bp [data-nb-open]'); return b && { t: b.textContent, inBar: !!b.parentNode.querySelector('[data-sys="openbids"]') }; });
ok('B1 "＋ New bid job" is in the 🏗 Bid portal screen\'s bar (admin)', btn && btn.t === '＋ New bid job' && btn.inBar, btn);
await A.ev(() => document.querySelector('#gc-sys-bp [data-nb-open]').click());
const f0 = await wait(A, () => { const b = document.getElementById('gcnb'); return b && { inScreen: !!b.closest('#gc-sys-bp'), fixed: getComputedStyle(b).position, fields: ['title', 'address', 'due', 'dueTime', 'scope', 'q', 'link'].every(k => !!b.querySelector('[data-nb="' + k + '"]')), vis: b.querySelectorAll('input[name="gcnb-vis"]').length, trades: b.querySelectorAll('[data-nb-a="trade"]').length, up: !!b.querySelector('[data-nb-a="upload"]') && !!b.querySelector('[data-nb-file]') }; });
ok('B2 an inline form in the screen (not a popup): title, address, due date + time, trades, scope, Private / Public, lead / job search, upload + link', f0 && f0.inScreen && f0.fixed !== 'fixed' && f0.fields && f0.vis === 2 && f0.trades > 10 && f0.up, f0);
const save = () => A.ev(() => document.querySelector('#gcnb [data-nb-a="save"]').click());
const err = () => A.ev(() => document.querySelector('#gcnb [data-nb-err]').textContent);
await save(); await sleep(200); ok('B3 no title → "Give the job a title."', /title/.test(await err()) && !HUB.posts.length);
await A.ev(() => { document.querySelector('#gcnb [data-nb="title"]').value = 'Sample Warehouse — roof'; }); await save(); await sleep(200);
ok('B3 no trade → "Pick at least one trade"', /trade/.test(await err()) && !HUB.posts.length);
await A.ev(() => { [...document.querySelectorAll('#gcnb [data-nb-a="trade"]')].find(b => b.textContent === 'Roofing').click(); document.querySelector('#gcnb [data-nb="trade"]').value = 'Sheet metal'; document.querySelector('#gcnb [data-nb-a="addtrade"]').click(); });
await A.ev(() => document.querySelector('#gcnb input[name="gcnb-vis"][value="public"]').click()); await save(); await sleep(200);
ok('B3 🌐 Public with no due date → stopped', /due date/.test(await err()) && !HUB.posts.length);
const kept = await A.ev(() => ({ t: document.querySelector('#gcnb [data-nb="title"]').value, tr: window._gcNewBidJob.state().trades.sort().join() }));
ok('B3 what was typed is kept after adding a trade (title, Roofing + Sheet metal)', kept.t === 'Sample Warehouse — roof' && kept.tr === 'Roofing,Sheet metal', kept);
/* link: a job already on the bid portal → not overwritten */
await A.ev(() => { const q = document.querySelector('#gcnb [data-nb="q"]'); q.value = 'T102'; q.dispatchEvent(new Event('input', { bubbles: true })); });
const h1 = await wait(A, () => [...document.querySelectorAll('#gcnb [data-nb-hits] button')].map(b => b.textContent));
ok('B4 the search finds a CRM job by PO', h1 && h1.length === 1 && /T102/.test(h1[0]), h1);
await A.ev(() => document.querySelector('#gcnb [data-nb-hits] button').click());
const ex = await wait(A, () => { const w = document.querySelector('#gcnb [data-nb-existing]'); return w && { id: w.getAttribute('data-nb-existing'), dis: document.querySelector('#gcnb [data-nb-a="save"]').disabled, t: document.querySelector('#gcnb [data-nb="title"]').value }; });
ok('B4 a job already on the bid portal: "already on the bid portal … 📂 Manage it", 📢 off (never overwritten); the typed title kept', ex && ex.id === 'J_real' && ex.dis && ex.t === 'Sample Warehouse — roof', ex);
await A.ev(() => document.querySelector('#gcnb [data-nb-a="unlink"]').click()); await sleep(200);
await A.ev(() => { const q = document.querySelector('#gcnb [data-nb="q"]'); q.value = 'paint lead'; q.dispatchEvent(new Event('input', { bubbles: true })); });
await wait(A, () => document.querySelector('#gcnb [data-nb-hits] button'));
await A.ev(() => document.querySelector('#gcnb [data-nb-hits] button').click()); await sleep(600);
const lk = await A.ev(() => ({ l: window._gcNewBidJob.state().link, ex: window._gcNewBidJob.state().existing, dis: document.querySelector('#gcnb [data-nb-a="save"]').disabled, addr: document.querySelector('#gcnb [data-nb="address"]').value }));
ok('B4 linking a lead not on the bid portal: linked, 📢 on, the empty address filled from the lead', lk.l && lk.l.kind === 'leadId' && lk.l.id === 'L1' && !lk.ex && !lk.dis && /22 Test Ln/.test(lk.addr), lk);
await A.ev(() => { const l = document.querySelector('#gcnb [data-nb="link"]'); l.value = 'not a link'; document.querySelector('#gcnb [data-nb-a="addlink"]').click(); });
ok('B5 a bad link is refused', /full link/.test(await err()));
await A.ev(() => { const l = document.querySelector('#gcnb [data-nb="link"]'); l.value = 'https://www.dropbox.com/sample-plans'; document.querySelector('#gcnb [data-nb-a="addlink"]').click(); });
await A.ev(d => { document.querySelector('#gcnb [data-nb="due"]').value = d; document.querySelector('#gcnb [data-nb="dueTime"]').value = '14:00'; document.querySelector('#gcnb [data-nb="scope"]').value = 'Tear off and re-roof 12,000 SF.'; }, due);
await shot(A, 'bidnew_01_form_desk');
await save();
await wait(A, () => !document.getElementById('gcnb'));
const ps = HUB.posts[0] || {};
ok('B6 📢 posts through bid-hub op postjob: title, address, 🌐 public, trades, due + time, scope, the Dropbox link, linked to the lead', ps.op === 'postjob' && !ps.jobId && ps.title === 'Sample Warehouse — roof' && /22 Test Ln/.test(ps.address) && ps.visibility === 'public' && ps.trades.sort().join() === 'Roofing,Sheet metal'
  && ps.due === due && ps.dueTime === '14:00' && /12,000 SF/.test(ps.scope) && ps.links.length === 1 && ps.links[0].url === 'https://www.dropbox.com/sample-plans' && ps.leadId === 'L1' && !ps.pid && ps.files.length === 0, ps);
const mg = await wait(A, () => window._gcSys2 && window._gcSys2.state().jobId === 'J_new1' && window._gcSys2.state());
ok('B6 then its 📂 Manage sheet opens (invite subs)', !!mg, mg);
await sleep(800); await shot(A, 'bidnew_02_manage');
const row = await wait(A, () => { try { window._gcSys2.close(); } catch (e) {} return document.querySelector('#gc-sys-bp-mount tr[data-sys-job="J_new1"]'); });
ok('B6 the new job is in the list', !!row);
/* phone */
await A.page().setViewportSize({ width: 390, height: 844 }); await sleep(400);
await A.ev(() => window._gcNewBidJob.open()); await sleep(400);
const ph = await A.ev(() => { const b = document.getElementById('gcnb'); return { w: b.getBoundingClientRect().width, sw: document.documentElement.scrollWidth, vw: window.innerWidth }; });
ok('B7 phone width: the form fits (no sideways scroll)', ph.w <= ph.vw && ph.sw <= ph.vw + 1, ph);
await shot(A, 'bidnew_03_form_phone');
await A.ev(() => window._gcNewBidJob.close());
ok('no page errors (admin)', !errs.length, errs);
await A.close();
/* a PM: only their own lead / job; office: no button */
const P = await computer('sbiffle@grayco-cs.com', { build: BUILD });
const errs2 = []; P.page().on('pageerror', e => errs2.push(String(e.message).slice(0, 200)));
await route(P, 'sbiffle@grayco-cs.com');
await signIn(P, 'sbiffle@grayco-cs.com', 15000); await sleep(6000);
await toBP(P, 'sbiffle@grayco-cs.com');
const pb = await wait(P, () => !!document.querySelector('#gc-sys-bp [data-nb-open]'));
ok('B8 a PM (of a job) sees "＋ New bid job"', pb);
const pmHits = await P.ev(() => ({ own: window._gcNewBidJob.hits('Sample Clinic').map(k => k.id), other: window._gcNewBidJob.hits('Other Sample').map(k => k.id) }));
ok('B8 the PM\'s search offers only their own jobs', pmHits.own.join() === 'P1' && pmHits.other.length === 0, pmHits);
await P.ev(() => { window._gcNewBidJob.open(); document.querySelector('#gcnb [data-nb="title"]').value = 'Sample'; [...document.querySelectorAll('#gcnb [data-nb-a="trade"]')].find(b => b.textContent === 'Paint').click(); document.querySelector('#gcnb [data-nb-a="save"]').click(); });
await sleep(300);
ok('B8 a PM must link one of their own leads / jobs', /own leads or jobs/.test(await P.ev(() => document.querySelector('#gcnb [data-nb-err]').textContent)) && HUB.posts.length === 1);
ok('no page errors (PM)', !errs2.length, errs2);
await P.close();
const O = await computer('office@grayco-cs.com', { build: BUILD });
await route(O, 'office@grayco-cs.com');
await signIn(O, 'office@grayco-cs.com', 15000); await sleep(6000);
await O.ev(() => { window._setView('bidportal'); }); await sleep(3500);
const ob = await O.ev(() => ({ bar: !!document.querySelector('#gc-sys-bp [data-sys="openbids"]'), btn: !!document.querySelector('#gc-sys-bp [data-nb-open]'), may: window._gcNewBidJob.may() }));
ok('B9 other staff (office, not a PM of anything): no "＋ New bid job"', !ob.btn && !ob.may, ob);
await O.close();
const n = R.filter(Boolean).length; console.log('BIDNEW ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
