/* patch PORTALSEE — the server half: what a customer's portal shows (netlify/functions/_lib/portalshow.js, portal.js, portal-plus.js).
   node tools/tests/test_PORTALSEE_fn.mjs            (made-up jobs / customers only; no network)
     1. GrayCo Care plans: OFF company-wide by default → no plans data at all; ON → a residential job gets them, a commercial job does not
     2. the job's own switch: Show on a commercial job → the commercial plans ("property"); Hide on a residential job → nothing sent
     3. 🙋 How did you hear: kept on a commercial job; Hide → not sent
     4. portal.js: a hidden review / Payments / Documents section is taken out of the view; the 👷 Superintendent: commercial only,
        name + work phone + work e-mail only; the job's switch shows it on a residential job */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 300) : '')); } }
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-test-key';
process.env.PORTAL_MAIL_OFF = '1';
const KV = {};
global.fetch = async function(url, init){
  const u = String(url);
  const m = /\/rest\/v1\/gc_kv\?select=value&key=eq\.([A-Za-z0-9_]+)/.exec(u);
  if (m && (!init || !init.method || init.method === 'GET')) { const v = KV[m[1]]; return { ok: true, status: 200, json: async () => (v === undefined ? [] : [{ value: v }]), text: async () => '' }; }
  if (u.startsWith('https://sb.test/rest/v1/gc_kv') && init && init.method === 'POST') { const b = JSON.parse(init.body); KV[b.key] = b.value; return { ok: true, status: 201, json: async () => ({}), text: async () => '' }; }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const RES = { id: 'R1', name: 'Smith Roof', type: 'Residential', jobType: 'Residential', status: 'Completed', client: 'Ann Smith', clientEmail: 'ann@example.com', address: '12 Oak St', pm: 'Pat PM', superintendent: 'Sam Super' };
const COM = { id: 'C1', name: 'Warehouse Roof', type: 'Roofing', status: 'Completed', client: 'Acme Property Management LLC', clientEmail: 'pm@acme.example', address: '9 Dock Rd', pm: 'Pat PM', superintendent: 'Sam Super' };
KV.projects = [RES, COM];
KV.users = [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'Project Manager', phone: '901-555-0100' },
  { name: 'Sam Super', email: 'sam@grayco-cs.com', role: 'Superintendent', phone: '901-555-0111', homeAddress: '1 Private Ln', payRate: 41, ssn: '000-00-0000', notes: 'internal' }];
KV.customers = []; KV.leads = [];
const core = require(path.join(FN, 'portal.js'))._core;
Object.assign(core, {
  kvRead: async function(keys){ const o = {}; keys.forEach(function(k){ if (KV[k] !== undefined) o[k] = JSON.parse(JSON.stringify(KV[k])); }); return o; },
  findProject: function(d, pid){ return (d.projects || []).find(function(p){ return String(p.id) === String(pid); }) || null; },
  pmOf: function(){ return { name: 'Pat PM', email: 'pat@grayco-cs.com' }; }
});
const PS = require(path.join(FN, '_lib/portalshow.js'));
const X = require(path.join(FN, 'portal-plus.js'))._x9;
function job(id, extra){ const p = KV.projects.find(function(x){ return x.id === id; }); Object.keys(p).forEach(function(k){ if (k === 'portalShow') delete p[k]; }); Object.assign(p, extra || {}); return p; }
async function view(id){ const A = await X.readAll(); return X.view(A, A.data.projects.find(function(p){ return p.id === id; })); }

console.log('1. GrayCo Care plans: company switch + residential only');
ok('the commercial test: Acme Property Management LLC is commercial, Ann Smith (Residential) is not', PS.commercial(COM) === true && PS.commercial(RES) === false);
let v = await view('R1');
ok('switch OFF (the default): a residential job gets no plans at all (no plans, tiers, contracts or prices sent)', v.maint && v.maint.offered === false && !('plans' in v.maint) && !('tiers' in v.maint) && !('contracts' in v.maint), v.maint);
KV.gc_portal_settings = { autoSend: true, plans: true };
v = await view('R1');
ok('switch ON: the residential job is offered the residential plans', v.maint.offered === true && v.maint.plans.length > 0 && v.maint.market === 'residential', { offered: v.maint.offered, n: (v.maint.plans || []).length });
v = await view('C1');
ok('switch ON: the commercial job still gets no plans (Automatic = residential only)', v.maint.offered === false && !('plans' in v.maint), v.maint);
ok('the commercial job is marked commercial (the page says "property")', v.commercial === true);

console.log('2. the job\'s own switch overrides');
job('C1', { portalShow: { plans: 'on' } });
v = await view('C1');
ok('Show on the commercial job: the commercial plans, market commercial ("Protect your property")', v.maint.offered === true && v.maint.market === 'commercial' && v.maint.plans.length > 0, { offered: v.maint.offered, market: v.maint.market });
KV.gc_portal_settings = { plans: false };
v = await view('C1');
ok('Show wins even with the company switch OFF', v.maint.offered === true);
job('C1');
job('R1', { portalShow: { plans: 'off' } }); KV.gc_portal_settings = { plans: true };
v = await view('R1');
ok('Hide on the residential job (switch ON): nothing of the plans is sent', v.maint.offered === false && !('plans' in v.maint) && !('alacarte' in v.maint));
job('R1');

console.log('3. 🙋 How did you hear about us');
v = await view('C1');
ok('kept on a commercial job (Automatic)', !!(v.heard && Array.isArray(v.heard.opts) && v.heard.opts.length));
job('C1', { portalShow: { heard: 'off' } });
v = await view('C1');
ok('Hide: not sent (heard null)', v.heard === null);
job('C1');

console.log('4. portal.js: the view of a hidden section, 👷 Superintendent');
const data = { projects: KV.projects, users: KV.users, customers: [], leads: [] };
let sh = await core.portalShowFor(data, job('R1', { portalShow: { review: 'off', pay: 'off', docs: 'off' } }));
const V0 = { showReview: true, review: { google: 'https://g.example/r' }, money: { contract: 12000, invoices: [{ id: 'i1', amount: 500 }], payments: [{ amount: 500 }], paid: 500, due: 0 }, docs: [{ title: 'Contract' }], payCard: { url: 'https://pay.example' } };
core.showApply(V0, sh);
ok('review hidden: no review links sent', V0.showReview === false && V0.review === null);
ok('Payments hidden: no invoices, payments, contract or pay link', V0.money.invoices.length === 0 && V0.money.payments.length === 0 && V0.money.contract === 0 && V0.payCard === null);
ok('Documents hidden: no documents', V0.docs.length === 0);
ok('the page is told (show.pay / docs / review false, photos true)', V0.show.pay === false && V0.show.docs === false && V0.show.review === false && V0.show.photos === true);
sh = await core.portalShowFor(data, job('R1'));
ok('👷 Automatic: not on a residential job', sh.super === false);
sh = await core.portalShowFor(data, job('C1'));
ok('👷 Automatic: shown on a commercial job', sh.super === true);
const su = PS.superOf(job('C1'), KV.users);
ok('👷 only the name, work phone and work e-mail are sent', JSON.stringify(Object.keys(su).sort()) === '["email","name","phone"]' && su.name === 'Sam Super' && su.phone === '901-555-0111' && su.email === 'sam@grayco-cs.com', su);
ok('👷 no superintendent on the job: no card', PS.superOf(Object.assign({}, COM, { superintendent: '' }), KV.users) === null);
sh = await core.portalShowFor(data, job('R1', { portalShow: { super: 'on' } }));
ok('👷 the job\'s Show puts it on a residential job', sh.super === true);
sh = await core.portalShowFor(data, job('C1', { portalStyle: 'gc' }));
ok('a GC job (portalStyle gc): no plans, no "how did you hear", superintendent shown', sh.plans === false && sh.heard === false && sh.super === true);
job('C1'); delete job('C1').portalStyle; job('R1');
ok('the job\'s picks are cleaned (only on / off kept)', JSON.stringify(PS.norm({ plans: 'on', heard: 'weird', x: 'off', pay: 'OFF' })) === '{"plans":"on","pay":"off"}');

console.log('5. "dont have lead in these": the customer\'s steps start at Estimate sent (commercial: Contract signed)');
const ST = ['Lead', 'Contacted', 'Appointment booked', 'Estimate sent', 'Contract signed + scheduled', 'In progress', 'Punch list', 'Final invoice', 'Closed'];
const mk = st => ({ job: { stages: ST.slice(), stage: st, stageName: ST[st] } });
let cv = core.custStages(mk(5), false).job;
ok('residential, In progress: Estimate sent … Closed, "now" still In progress', cv.stages[0] === 'Estimate sent' && cv.stages.length === 6 && cv.stages[cv.stage] === 'In progress' && cv.stageName === 'In progress', cv);
cv = core.custStages(mk(5), true).job;
ok('commercial, In progress: starts at Contract signed + scheduled, "now" still In progress', cv.stages[0] === 'Contract signed + scheduled' && cv.stages[cv.stage] === 'In progress', cv);
cv = core.custStages(mk(3), true).job;
ok('commercial while the estimate is out: starts at Estimate sent', cv.stages[0] === 'Estimate sent' && cv.stage === 0, cv);
cv = core.custStages(mk(1), false).job;
ok('a job still at Contacted: nothing "now", "Getting your estimate ready", no sales step listed', cv.stage === -1 && cv.stageName === 'Getting your estimate ready' && !cv.stages.some(x => /Lead|Contacted|Appointment/.test(x)), cv);
ok('the My home job list never says Lead', core.custStageName('Lead') === 'Getting your estimate ready' && core.custStageName('In progress') === 'In progress');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
