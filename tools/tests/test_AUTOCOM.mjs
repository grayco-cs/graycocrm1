// test_AUTOCOM.mjs <build> — commercial / bid jobs start with commercial automation defaults; residential / insurance / roof unchanged.
import { createRequire } from 'module';
import { chromium } from 'playwright';
import { computer, signIn, sleep, cset, cget, waitFor, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
const require = createRequire(import.meta.url);
const JA = require(build + '/netlify/functions/_lib/job-auto.js');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };

/* the old table (what every type did before) */
const OLD = {}; JA.OPTS.forEach(o => { OLD[o[0]] = o[2]; });
const oldFor = g => { const out = {}; for (const k in OLD) { const d = OLD[k]; out[k] = (d && typeof d === 'object') ? (g in d ? !!d[g] : !!d.other) : !!d; } return out; };
const COMM_EXPECT = Object.assign(oldFor('commercial'), { gdoc: false, portalLink: false, portalInvite: false, showCarrier: false, portalSelections: false,
  welcome: false, scheduleUpdates: false, apptAuto: false, progressPosts: false, docsNotice: false, invoiceEmail: false, paymentReminders: false,
  finalReminders: false, thankYou: false, reviewRequest: false, yearlyCheckup: false, contractSign: false, faqPacket: false, newsletter: false });
const same = (a, b) => JA.KEYS.every(k => !!a[k] === !!b[k]);
const diff = (a, b) => JA.KEYS.filter(k => !!a[k] !== !!b[k]);

const now = Date.now(), ago = h => new Date(now - h * 3600e3).toISOString();
const J = (id, o) => Object.assign({ id, name: id, status: 'active', pm: 'Nick Thomas', autoPO: 'X' + id.slice(-3), createdAt: ago(48) }, o);
const ALLON = {}; JA.KEYS.forEach(k => { ALLON[k] = true; }); ALLON.updatedAt = ago(30); ALLON.by = 'Glenn Miller'; ALLON.via = 'lead';
const FIX = {
  hyatt: J('P_hyatt', { name: 'Hyatt Studios', autoPO: 'S251', type: 'Roofing', client: 'Hyatt Studios', estimator: 'Glenn Miller', leadId: 'L_hy', leadSource: 'City of Memphis', bidDue: '2026-10-30T14:00', bidNumber: 'RFB 26-118', auto: ALLON }),
  bidWon: J('P_bidwon', { type: 'New Construction', client: 'Westco', fromBid: true }),
  bc: J('P_bc', { type: 'Other', client: 'Some Person', leadSource: 'BuildingConnected' }),
  ph: J('P_ph', { type: '', client: 'Pat', leadSource: 'PlanHub' }),
  comm: J('P_comm', { type: 'Commercial Reno', client: 'Acme Bank' }),
  ti: J('P_ti', { type: 'Commercial TI', client: 'Joe' }),
  gcNew: J('P_gcnew', { type: 'New Construction', client: 'Northwind Holdings' }),
  gcCo: J('P_gcco', { type: 'Other', client: 'Jim', company: 'Contoso Construction Group, LLC' }),
  res: J('P_res', { type: 'Residential Reno', client: 'Jane Homeowner', leadSource: 'Website' }),
  resGc: J('P_resgc', { type: 'Residential Reno', client: 'Fabrikam Construction' }),
  roof: J('P_roof', { type: 'Roofing', client: 'Tom Roofowner', leadSource: 'Referral' }),
  ins: J('P_ins', { type: 'Insurance Claim', client: 'Ann Claimant', isInsurance: true }),
  water: J('P_water', { type: 'Water Damage', client: 'Delta Restoration Services, LLC' }),
  insBid: J('P_insbid', { type: 'Fire Damage', client: 'Blue Roofs', bidDue: '2026-11-01' }),
  newRes: J('P_newres', { type: 'New Construction', client: 'Lou' }),
  prog: J('P_prog', { type: 'Program Work', client: 'Program TPA' }),
  sam: J('P_sam', { type: 'Kitchen', client: 'Sam Jones', leadSource: 'Sam (neighbor)' }),
  legacyComm: J('P_legc', { type: 'Commercial Reno', client: 'Old GC Inc' })
};
const EXP_G = { hyatt: 'commercial', bidWon: 'commercial', bc: 'commercial', ph: 'commercial', comm: 'commercial', ti: 'commercial', gcNew: 'commercial', gcCo: 'commercial',
  res: 'residential', resGc: 'residential', roof: 'residential', ins: 'insurance', water: 'insurance', insBid: 'insurance', newRes: 'residential', prog: 'program', sam: 'residential', legacyComm: 'commercial' };

/* ── 1. server lib ── */
for (const k in FIX) ok('server group ' + k + ' → ' + EXP_G[k], JA.groupOf(FIX[k]) === EXP_G[k], JA.groupOf(FIX[k]));
ok('server: new commercial defaults = the commercial table', same(JA.defaultsFor('commercial', null), COMM_EXPECT), diff(JA.defaultsFor('commercial', null), COMM_EXPECT));
for (const g of ['residential', 'insurance', 'program']) ok('server: ' + g + ' defaults unchanged', same(JA.defaultsFor(g, null), oldFor(g)), diff(JA.defaultsFor(g, null), oldFor(g)));
ok('server: residential is all-on (but the switches that were off)', JA.KEYS.filter(k => !JA.defaultsFor('residential', null)[k]).sort().join() === ['apptAuto', 'claimFile', 'equipment', 'gcPortalInvite', 'gcPortalLink', 'showCarrier', 'teamAlert', 'w9'].sort().join());
const OLDADM = { residential: Object.assign({}, oldFor('residential'), { welcome: false }), commercial: oldFor('commercial'), updatedAt: ago(100), by: 'Wesley' };
ok('server: an old saved residential map still applies', JA.defaultsFor('residential', OLDADM).welcome === false);
ok('server: an old saved commercial map does not reach new commercial jobs', same(JA.defaultsFor('commercial', OLDADM), COMM_EXPECT));
ok('server: a legacy commercial job (no own choices) keeps doing what it did', JA.allows(FIX.legacyComm, 'portalLink', OLDADM) && JA.allows(FIX.legacyComm, 'invoiceEmail', OLDADM));
const NEWADM = Object.assign({}, OLDADM, { commercialV: 2, commercialPre: OLDADM.commercial, commercial: Object.assign({}, COMM_EXPECT, { welcome: true }) });
ok('server: a commercial map saved after AUTOCOM applies to new commercial jobs', JA.defaultsFor('commercial', NEWADM).welcome === true && JA.defaultsFor('commercial', NEWADM).portalLink === false);
ok('server: a stamped commercial job follows its own choices', !JA.allows(Object.assign({}, FIX.comm, { auto: Object.assign({}, COMM_EXPECT, { updatedAt: ago(1) }) }), 'portalInvite', OLDADM));
ok('server: blockedKind welcome for a new commercial job', JA.blockedKind(Object.assign({}, FIX.comm, { auto: Object.assign({}, COMM_EXPECT, { updatedAt: ago(1) }) }), 'welcome', null) === 'welcome');

/* ── 2. the page ── */
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
process.on('exit', () => { try { shared.close(); } catch (e) {} });
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u4', name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', profile: 'estimator', active: true }]);
cset('projects', Object.values(FIX));
cset('customers', [{ id: 'C1', name: 'Pat Q', type: 'gc', email: 'x@y.z', phone: '', address: '' }]);
cset('jobAutoDefaults', OLDADM);
const A = await computer('A', { build });
try {
await signIn(A, 'wjohnson@grayco-cs.com', 12000);
const ready = await waitFor(A, () => !!(window._gcJA && (window._crm || {}).projects && window._crm.projects.length >= 18 && window._gcJA.state().admin), null, 90000, 500);
ok('page ready (JA + projects + saved defaults)', !!ready);
const pg = await A.ev(ids => { const P = window._crm.projects; const out = {}; for (const k in ids) { const p = P.find(x => x.id === ids[k]); out[k] = p ? window._gcJA.groupOf(p) : 'missing'; } return out; }, Object.fromEntries(Object.entries(FIX).map(([k, v]) => [k, v.id])));
for (const k in FIX) ok('page group ' + k + ' → ' + EXP_G[k], pg[k] === EXP_G[k], pg[k]);
await waitFor(A, () => ((window._crm || {}).customers || []).some(c => c && c.name === 'Pat Q'), null, 30000, 400);
await sleep(15500);   /* the page's hint memo lives 15 s */
ok('page: a customer record typed GC makes the job commercial', await A.ev(() => window._gcJA.groupOf({ id: 'tmp1', type: 'Other', client: 'Pat Q' })) === 'commercial', await A.ev(() => ((window._crm || {}).customers || []).map(c => c.name + ':' + c.type)));

/* new jobs: stamp */
const st = await A.ev(() => {
  const J = window._gcJA, mk = (o, ctx) => { const p = Object.assign({ id: 'NEW_' + Math.random().toString(36).slice(2), name: 'x', createdAt: new Date().toISOString() }, o); J.stamp(p, ctx); return p; };
  const pick = p => { const o = {}; J.KEYS.forEach(k => { o[k] = p.auto[k]; }); return o; };
  const bid = mk({ type: 'Roofing', client: 'Hyatt Studios' }, 'bid'), lead = mk({ type: 'Roofing', client: 'Hyatt Studios', leadSource: 'City of Memphis', bidDue: '2026-10-30', bidNumber: 'RFB 1', estimator: 'Glenn Miller' }, 'lead');
  return { bid: pick(bid), bidFlag: bid.fromBid, lead: pick(lead), comm: pick(mk({ type: 'Commercial TI', client: 'Joe' }, 'proj')),
    res: pick(mk({ type: 'Residential Reno', client: 'Jane' }, 'proj')), roof: pick(mk({ type: 'Roofing', client: 'Tom' }, 'roofscout')),
    ins: pick(mk({ type: 'Insurance Claim', client: 'Ann', isInsurance: true }, 'proj')), prog: pick(mk({ type: 'Program Work', client: 'Al' }, 'proj')) };
});
ok('new job from Bids → Won (type Roofing) gets commercial defaults + fromBid', same(st.bid, COMM_EXPECT) && st.bidFlag === true, diff(st.bid, COMM_EXPECT));
ok('new job from a public-bid lead gets commercial defaults', same(st.lead, COMM_EXPECT), diff(st.lead, COMM_EXPECT));
ok('new commercial TI job gets commercial defaults', same(st.comm, COMM_EXPECT), diff(st.comm, COMM_EXPECT));
ok('new residential job: unchanged (old table + the admin\'s saved residential map)', same(st.res, Object.assign(oldFor('residential'), { welcome: false })), diff(st.res, Object.assign(oldFor('residential'), { welcome: false })));
ok('new roof job: unchanged', same(st.roof, Object.assign(oldFor('residential'), { welcome: false })), diff(st.roof, oldFor('residential')));
ok('new insurance job: unchanged all-on', same(st.ins, oldFor('insurance')), diff(st.ins, oldFor('insurance')));
ok('new program job: unchanged', same(st.prog, oldFor('program')), diff(st.prog, oldFor('program')));
const lg = await A.ev(() => window._gcJA.effective(window._crm.projects.find(p => p.id === 'P_legc')));
ok('page: an old commercial job with no choices keeps doing what it did', lg.portalLink === true && lg.invoiceEmail === true && lg.welcome === true);

/* the box: Hyatt Studios (stamped all-on as Residential) → label + Reset */
const box = async pid => { await A.ev(id => window._gcJA.open(id), pid); await sleep(400);
  return A.ev(() => { const sh = document.querySelector('#gcja-job .gcja-sheet'); if (!sh) return null; const v = {}; sh.querySelectorAll('input[type=checkbox][data-k]').forEach(i => { v[i.getAttribute('data-k')] = i.checked; }); return { sub: (sh.querySelector('.gcja-sub') || {}).textContent, h2: sh.querySelector('h2').textContent, v }; }); };
let b = await box('P_hyatt');
ok('Hyatt Studios box says "Commercial job · from a bid" (was "Residential job")', b && /^Commercial job · from a bid$/.test(b.sub) && /PO S251/.test(b.h2), b && b.sub);
ok('Hyatt keeps its saved all-on choices until reset', b && b.v.welcome === true && b.v.portalLink === true);
await A.ev(() => document.querySelector('#gcja-job [data-ja="reset"]').click()); await sleep(300);
b = await A.ev(() => { const v = {}; document.querySelectorAll('#gcja-job input[type=checkbox][data-k]').forEach(i => { v[i.getAttribute('data-k')] = i.checked; }); return v; });
const shown = k => k !== 'claimFile';
const expC = {}; JA.KEYS.filter(shown).forEach(k => { expC[k] = COMM_EXPECT[k]; });
ok('Reset to my defaults on a commercial/bid job → commercial defaults', JA.KEYS.filter(shown).every(k => b[k] === expC[k]), JA.KEYS.filter(shown).filter(k => b[k] !== expC[k]));
await A.ev(() => document.querySelector('#gcja-job .gcja-save').click());
await waitFor(A, () => !document.getElementById('gcja-job'), null, 15000, 300);
const saved = await waitFor(A, () => { const p = window._crm.projects.find(x => x.id === 'P_hyatt'); return p && p.auto && p.auto.welcome === false ? p.auto : null; }, null, 20000, 400);
ok('saved for Hyatt: portal / welcome / invoices off; photos / calendar / checklist / sub scopes on', saved && !saved.portalLink && !saved.portalInvite && !saved.welcome && !saved.invoiceEmail && saved.photos && saved.calendar && saved.checklist && saved.subScopes && !saved.gdoc, saved);

/* residential: the user turns some off, Reset puts the residential defaults back */
b = await box('P_res');
ok('residential box says "Residential job"', b && b.sub === 'Residential job', b && b.sub);
await A.ev(() => document.querySelector('#gcja-job [data-ja="off"]').click()); await sleep(200);
await A.ev(() => document.querySelector('#gcja-job [data-ja="reset"]').click()); await sleep(300);
b = await A.ev(() => { const v = {}; document.querySelectorAll('#gcja-job input[type=checkbox][data-k]').forEach(i => { v[i.getAttribute('data-k')] = i.checked; }); return v; });
const expR = Object.assign(oldFor('residential'), { welcome: false });
ok('Reset on a residential job → residential defaults (all on but the admin\'s choice)', JA.KEYS.filter(shown).every(k => b[k] === expR[k]), JA.KEYS.filter(shown).filter(k => b[k] !== expR[k]));
await A.ev(() => document.querySelector('#gcja-job .gcja-cancel').click());
b = await box('P_ins');
ok('insurance box says "Insurance job"', b && b.sub === 'Insurance job', b && b.sub);
await A.ev(() => document.querySelector('#gcja-job .gcja-cancel').click());

/* admin defaults: saving stamps commercialV and keeps the old map for the old jobs */
await A.ev(() => window._gcJobAutoDefaults.set('commercial', Object.assign({}, window._gcJA.defaultsFor('commercial'), { pmPush: false })));
await sleep(800);
const adm = cget('jobAutoDefaults') || {};
ok('saving the commercial defaults stamps commercialV 2 and keeps the old map as commercialPre', adm.commercialV === 2 && adm.commercialPre && adm.commercialPre.portalLink === true && adm.commercial.pmPush === false && adm.commercial.portalLink === false, adm);
const after = await A.ev(() => ({ n: window._gcJA.defaultsFor('commercial'), l: window._gcJA.effective(window._crm.projects.find(p => p.id === 'P_legc')), r: window._gcJA.defaultsFor('residential') }));
ok('after saving: new commercial = the saved map; old commercial job unchanged; residential map unchanged', after.n.pmPush === false && after.n.portalLink === false && after.l.portalLink === true && after.r.welcome === false, after);
ok('server agrees with the saved map', JA.defaultsFor('commercial', JA.parseAdmin(adm)).pmPush === false && JA.allows(FIX.legacyComm, 'portalLink', JA.parseAdmin(adm)));
ok('no page errors', A.errs.filter(e => /AUTOCOM|gcja|_gcJA|groupOf|hintsFor/.test(e)).length === 0, A.errs.slice(0, 5));
} finally { try { await shared.close(); } catch (e) {} }
const pass = R.filter(Boolean).length; console.log('RESULT ' + pass + '/' + R.length);
process.exit(pass === R.length ? 0 : 1);
