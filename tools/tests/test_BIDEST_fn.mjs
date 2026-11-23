// test_BIDEST_fn.mjs <build-dir> — patch BIDEST + BIDVIS on the REAL subportal.js (qaa_world's in-memory Supabase; made-up data only; offline).
//   BIDEST: a commercial bid job with no estimator (the Lead Inbox's drafts) shows the Senior Estimator — the CRM's setting (Admin →
//     🧮 Senior Estimator, gc_lead_inbox_settings.estimator), never a name in code — to admins (marked _estAuto, the user marked
//     seniorEstimator) and to subs (with the estimator's phone + e-mail next to the PM's); a save that did not pick one keeps it unset;
//     an explicit pick is kept; a residential job is left alone; a stale estimator id (not staff any more) falls back to the Senior Estimator.
//   BIDVIS: _lib/subvis.js rules; a sub never gets the solicitation link / invitation to bid / bid form (job, plans:<id>, notes lines,
//     sourceLink, leadInbox); plans, addenda, scopes shown; an admin's "Visible to subs" tick wins both ways; admins see everything;
//     portal-access (portal.grayco-cs.com) p-bid-jobs uses the same filter; the Lead Inbox re-sync keeps the ticks.
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, TOK, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
W.install();
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('projects', []); W.H.cset('leads', []); W.H.cset('schedule', []);
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin', phone: '901-555-0100' },
  { id: 'c2', name: 'Est Alpha', email: 'esta@grayco-cs.com', role: 'Estimator', phone: '901-555-0111' },
  { id: 'c3', name: 'Est Beta', email: 'estb@grayco-cs.com', role: 'Estimator', phone: '901-555-0122' }]);
/* two people with the Estimator role → the setting decides (Est Beta) */
DB.lkv.set('gc_lead_inbox_settings', { key: 'gc_lead_inbox_settings', value: { estimator: { name: 'Est Beta', email: 'estb@grayco-cs.com' } }, updated_at: now });
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true }, { email: 'esta@grayco-cs.com', name: 'Est Alpha', role: 'estimator', active: true }, { email: 'estb@grayco-cs.com', name: 'Est Beta', role: 'estimator', active: true });
const staffRow = (id, email, name, phone, title) => putRow('users', id, { id, email, name, phone, title, role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: id, email });
staffRow('st_owner', 'owner@grayco-cs.com', 'Demo Owner', '901-555-0100', 'Owner');
staffRow('st_esta', 'esta@grayco-cs.com', 'Est Alpha', '901-555-0111', 'Estimator');
staffRow('st_estb', 'estb@grayco-cs.com', 'Est Beta', '901-555-0122', 'Commercial Estimator');
putRow('users', 'u_sub', { id: 'u_sub', role: 'sub', approved: true, email: 'sub@demo.test', name: 'Demo Sub', company: 'Demo HVAC', trades: ['HVAC'], authUserId: 'auth-sub' }, { user_id: 'u_sub', email: 'sub@demo.test' });
const SOL = 'https://www.demo-city.test/bids/26-014';
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), pmId: 'st_owner', estimatorId: '', grayCoRole: 'gc', tradesSought: 'HVAC', createdAt: now }, x), { job_id: id });
job('J1', { title: 'Auditorium HVAC Demo', address: 'Demo City, TN', sourceLink: SOL, leadInbox: { id: 'L1', source: 'Demo City bids', type: 'commercial' },
  notes: 'From GrayCo Construction Services — bid # 26-014.\nGovernment: ' + SOL + '\nBid #: 26-014\nPlans: https://files.demo.test/plans',
  plansLinks: [{ url: SOL, label: 'Solicitation & documents (Demo City)', board: 'Government' }, { url: 'https://files.demo.test/plans', label: 'Plans' }, { url: 'https://app.buildingconnected.com/opportunities/x/info', label: 'Open on BuildingConnected', board: 'BuildingConnected', subsVisible: true }],
  plans: [{ name: 'Invitation to Bid.pdf', size: 1000 }, { name: 'M-101 HVAC Plan.pdf', size: 2000 }, { name: 'Bid Form.pdf', size: 500 }, { name: 'Addendum 1.pdf', size: 300 }, { name: 'M-201 Details.pdf', size: 300, subsVisible: false }],
  specDocs: [{ id: 'sd1', name: 'Project Manual.pdf', size: 10 }, { id: 'sd2', name: 'Instructions to Bidders.pdf', size: 10 }],
  scopeDocs: [{ id: 'sc1', name: 'GrayCo HVAC Scope.pdf', size: 10 }],
  tradeScopes: [{ id: 'ts1', trade: 'HVAC', scope: 'Replace RTUs', files: [{ name: 'HVAC scope sheet.pdf', fileRef: 'staff/x/hvac.pdf' }] }],
  addenda: [{ num: 1, title: 'Addendum 1', publishedAt: now, files: [{ name: 'Addendum 1 drawings.pdf', fileRef: 'staff/x/add1.pdf' }] }] });
job('J2', { title: 'Residential Demo', projectType: 'residential' });
job('J3', { title: 'Picked Demo', estimatorId: 'st_esta' });
job('J4', { title: 'Stale Demo', estimatorId: 'st_gone' });
putRow('plans', 'J1', { items: [{ name: 'Invitation to Bid.pdf', fileRef: 'staff/x/itb.pdf' }, { name: 'M-101 HVAC Plan.pdf', fileRef: 'staff/x/m101.pdf' }, { name: 'Bid Form.pdf', fileRef: 'staff/x/bf.pdf' }, { name: 'Addendum 1.pdf', fileRef: 'staff/x/a1.pdf' }, { name: 'M-201 Details.pdf', fileRef: 'staff/x/m201.pdf' }] }, { job_id: 'J1' });
TOK['tk-owner'] = 'owner@grayco-cs.com'; TOK['tk-sub'] = 'sub@demo.test';
W.ACC['owner@grayco-cs.com'] = { pw: 'x', id: 'auth-owner' }; W.ACC['sub@demo.test'] = { pw: 'x', id: 'auth-sub' };
const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }); return { code: r.statusCode, b: JSON.parse(r.body) }; };

/* ═══ _lib/subvis.js ═══ */
const V = require(path.join(BUILD, 'netlify/functions/_lib/subvis.js'));
ok('V1 hidden by default: the solicitation link, a bid board page, the invitation to bid, a bid form, instructions to bidders',
  !V.visible({ url: SOL, label: 'Solicitation & documents (Demo City)', board: 'Government' }, 'link') && !V.visible({ url: 'https://app.buildingconnected.com/o/1', label: 'Open on BuildingConnected' }, 'link')
  && !V.visible({ name: 'Invitation to Bid.pdf' }, 'plan') && !V.visible({ name: 'Bid Form.pdf', category: 'scope' }, 'plan') && !V.visible({ name: 'Instructions to Bidders.pdf' }, 'spec'));
ok('V2 shown by default: plans, a plan set named after the ITB, addenda, specs, a plan room link, GrayCo\'s scope files',
  V.visible({ name: 'M-101 HVAC Plan.pdf' }, 'plan') && V.visible({ name: 'ITB_26-014_Drawings.pdf' }, 'plan') && V.visible({ name: 'Addendum 2.pdf' }, 'plan')
  && V.visible({ name: 'Project Manual.pdf' }, 'spec') && V.visible({ url: 'https://files.demo.test/x', label: 'Plan room' }, 'link') && V.visible({ name: 'Bid Form.pdf' }, 'scope'));
ok('V3 the admin tick wins both ways', V.visible({ name: 'Invitation to Bid.pdf', subsVisible: true }, 'plan') && !V.visible({ name: 'M-1.pdf', subsVisible: false }, 'plan'));

/* ═══ admin load ═══ */
let r = await call('tk-owner', { action: 'load', keys: ['users', 'jobs', 'plans:J1'] });
ok('A0 admin load 200', r.code === 200, r);
const AJ = id => r.b.data.jobs.find(j => j.id === id);
const se = r.b.data.users.filter(u => u.seniorEstimator);
ok('A1 the Senior Estimator (the CRM setting, of two estimators) is marked: Est Beta', se.length === 1 && se[0].id === 'st_estb', se);
ok('A2 a commercial job with no estimator → Est Beta, _estAuto', AJ('J1').estimatorId === 'st_estb' && AJ('J1')._estAuto === true, AJ('J1'));
ok('A3 residential job left alone; a picked estimator kept; a stale id → the Senior Estimator', AJ('J2').estimatorId === '' && AJ('J3').estimatorId === 'st_esta' && !AJ('J3')._estAuto && AJ('J4').estimatorId === 'st_estb');
ok('A4 admins see everything: 3 links, 5 plans, 2 spec docs, the source link, all 5 plan files', AJ('J1').plansLinks.length === 3 && AJ('J1').plans.length === 5 && AJ('J1').specDocs.length === 2 && AJ('J1').sourceLink === SOL && r.b.data['plans:J1'].length === 5);
/* a save that did not pick the estimator keeps it unset; an explicit pick (✎ Edit Job Details: _estAuto false) is kept */
let sv = await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, AJ('J1'), { notes: AJ('J1').notes + '\nmore' })] });
ok('A5 a save with the shown default does not store it (estimatorId stays "")', sv.code === 200 && rowData('jobs/J1').estimatorId === '' && !('_estAuto' in rowData('jobs/J1')), rowData('jobs/J1'));
sv = await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, AJ('J4'), { _estAuto: false, _detailsSave: true })] });
ok('A6 ✎ Edit Job Details save (explicit) stores the Senior Estimator on the job', sv.code === 200 && rowData('jobs/J4').estimatorId === 'st_estb' && !('_estAuto' in rowData('jobs/J4')), rowData('jobs/J4'));

/* ═══ the sub ═══ */
r = await call('tk-sub', { action: 'load', keys: ['users', 'jobs', 'plans:J1'] });
ok('S0 sub load 200', r.code === 200, r);
const SJ = r.b.data.jobs.find(j => j.id === 'J1'), est = r.b.data.users.find(u => u.id === SJ.estimatorId), pm = r.b.data.users.find(u => u.id === SJ.pmId);
ok('S1 the sub sees the estimator (Est Beta) with phone + e-mail next to the PM', est && est.name === 'Est Beta' && est.phone === '901-555-0122' && est.email === 'estb@grayco-cs.com' && pm && pm.phone === '901-555-0100', { est, pm });
ok('S2 no solicitation link; the plan link and the ticked BuildingConnected link are there', SJ.plansLinks.map(l => l.label).join('|') === 'Plans|Open on BuildingConnected', SJ.plansLinks);
ok('S3 plans: no Invitation to Bid, no Bid Form, not the one ticked hidden; M-101 + Addendum 1', SJ.plans.map(p => p.name).join('|') === 'M-101 HVAC Plan.pdf|Addendum 1.pdf', SJ.plans);
ok('S4 plans:J1 (the files) the same two', r.b.data['plans:J1'].map(p => p.name).join('|') === 'M-101 HVAC Plan.pdf|Addendum 1.pdf', r.b.data['plans:J1']);
ok('S5 specs: the project manual, not the instructions to bidders; GrayCo\'s scope doc, the HVAC trade scope file, the addendum files', SJ.specDocs.map(d => d.name).join() === 'Project Manual.pdf' && SJ.scopeDocs.length === 1 && SJ.tradeScopes[0].files.length === 1 && SJ.addenda[0].files.length === 1);
ok('S6 no source link, no lead inbox record, no _estAuto, the solicitation line gone from the notes (the plan link line kept)', !('sourceLink' in SJ) && !('leadInbox' in SJ) && !('_estAuto' in SJ) && SJ.notes.indexOf(SOL) < 0 && /Plans: https:\/\/files\.demo\.test\/plans/.test(SJ.notes) && !/Bid #: 26-014|From GrayCo/.test(SJ.notes) /* NOTESCLEAN: no bid # / "From GrayCo" line for subs */, SJ.notes);
ok('S7 nothing in the sub\'s whole answer names the solicitation URL', JSON.stringify(r.b).indexOf(SOL) < 0);
/* the admin ticks the invitation to bid visible, and hides the plan link */
const j1 = rowData('jobs/J1');
sv = await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, j1, { plans: j1.plans.map(p => p.name === 'Invitation to Bid.pdf' ? Object.assign({}, p, { subsVisible: true }) : p), plansLinks: j1.plansLinks.map(l => l.label === 'Plans' ? Object.assign({}, l, { subsVisible: false }) : l) })] });
r = await call('tk-sub', { action: 'load', keys: ['jobs', 'plans:J1'] });
const SJ2 = r.b.data.jobs.find(j => j.id === 'J1');
ok('S8 after the admin\'s ticks: the invitation to bid shows (job + file), the "Plans" link is gone', SJ2.plans.some(p => p.name === 'Invitation to Bid.pdf') && r.b.data['plans:J1'].some(p => p.name === 'Invitation to Bid.pdf') && !SJ2.plansLinks.some(l => l.label === 'Plans'), SJ2);

/* ═══ portal.grayco-cs.com (portal-access) uses the same plans filter ═══ */
const PA = fs.readFileSync(path.join(BUILD, 'netlify/functions/portal-access.js'), 'utf8');
ok('P1 portal-access p-bid-jobs filters plan files with subPlans and the job with subJobView', /H2\.subPlans\(r\.data && r\.data\.items, sc\.jobs\[s\(r\.id\)\]/.test(PA) && /HUB\(\)\.subJobView\(/.test(PA));
const hub = F.sp._hub;
ok('P2 _hub.subPlans hides the invitation for a job without ticks', hub.subPlans([{ name: 'Invitation to Bid.pdf' }, { name: 'A-1 Plan.pdf' }], { plans: [] }).map(x => x.name).join() === 'A-1 Plan.pdf');
/* the Lead Inbox re-sync keeps the ticks */
const BP = fs.readFileSync(path.join(BUILD, 'netlify/functions/_lib/bid-portal.js'), 'utf8');
ok('P3 the Lead Inbox re-sync keeps an admin\'s ticks (keepVis on plans + specDocs)', /plans: keepVis\(plansMeta, prev && prev\.plans\), specDocs: keepVis\(specs, prev && prev\.specDocs\)/.test(BP));
/* no person's name in the code for the default */
const SP = fs.readFileSync(path.join(BUILD, 'netlify/functions/subportal.js'), 'utf8'), APP = fs.readFileSync(path.join(BUILD, 'subportal-app/src/App.jsx'), 'utf8');
ok('N1 no estimator name in the code (Glenn) — the setting decides', !/glenn/i.test(SP) && !/glenn/i.test(APP) && !/glenn/i.test(fs.readFileSync(path.join(BUILD, 'netlify/functions/_lib/subvis.js'), 'utf8')));
const fails = R.filter(x => !x).length;
console.log(fails ? 'FAILED ' + fails + ' of ' + R.length : 'ALL ' + R.length + ' PASS');
process.exit(fails ? 1 : 0);
