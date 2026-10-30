/* patch MAINTPLANS — the server half (portal-plus.js, maint-scheduled.js, _lib/maint.js), with an in-memory gc_kv.
   node tools/tests/test_MAINTPLANS_fn.mjs            (made-up job / customer only; no network)
     1. the catalog: 7 plans with a usual price and how often; a list saved before the catalog gets the new plans once;
        what an admin / the office saves is the list (a removed plan stays removed); a PM cannot change it
     2. several plans quoted at once (quote-many): one maint_quote item on ✅ Approvals, every plan in its e-mail
     3. the portal (view): every quoted plan with its price, how often and its words; no carrier name anywhere
     4. the customer signs two plans; maint-scheduled queues one maint_invoice per plan (the twice-a-year plan: half the
        price, then the second half 6 months on), never twice; the approved invoice is sent with its own number */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } }

process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_KEY = 'svc-test-key';
process.env.RESEND_API_KEY = 're_test';
delete process.env.PORTAL_MAIL_OFF;

const KV = {}, APPROVALS = [], TODOS = [], MAILS = [];
global.fetch = async function(url, init){
  const u = String(url);
  if (u.startsWith('https://sb.test/rest/v1/gc_kv') && init && init.method === 'POST') { const b = JSON.parse(init.body); KV[b.key] = JSON.parse(b.value); return { ok: true, status: 201, json: async () => ({}), text: async () => '' }; }
  if (u.indexOf('/rest/v1/gc_kv?select=value&key=eq.gc_automation_pause') >= 0) return { ok: true, status: 200, json: async () => [], text: async () => '[]' };   /* not paused */
  if (u.startsWith('https://api.resend.com/')) { MAILS.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: 'm' + MAILS.length }), text: async () => '{}' }; }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const P = { id: 'job1', name: 'Henderson Roof — State Farm', type: 'Residential', status: 'Completed', client: 'Ann Henderson', clientEmail: 'ann@example.com', address: '12 Oak St', autoPO: 'GC-2201', pm: 'Pat PM', insCarrier: 'State Farm' };
KV.projects = [P];
KV.users = [{ name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'PM' }];
KV.gc_maint = [];
const core = require(path.join(FN, 'portal.js'))._core;
Object.assign(core, {
  kvRead: async function(keys){ const o = {}; keys.forEach(function(k){ if (KV[k] !== undefined) o[k] = JSON.parse(JSON.stringify(KV[k])); }); return o; },
  kvListUpdate: async function(key, mutate){ const cur = Array.isArray(KV[key]) ? KV[key] : []; const m = mutate(JSON.parse(JSON.stringify(cur))); if (!m || !m.list) return { ok: true, result: m && m.result, list: cur, unchanged: true }; KV[key] = m.list; return { ok: true, result: m.result, list: m.list }; },
  queueApproval: async function(o){ if (APPROVALS.some(function(x){ return x.id === o.id; })) return true; APPROVALS.push(o); return true; },
  officeTodo: async function(id, label, note){ TODOS.push({ id, label, note }); return true; },
  findProject: function(d, pid){ return (d.projects || []).find(function(p){ return String(p.id) === String(pid); }) || null; },
  pmOf: function(){ return { name: 'Pat PM', email: 'pat@grayco-cs.com' }; },
  LINK_PH: '{{PORTAL_LINK}}'
});
const M = require(path.join(FN, '_lib/maint.js'));
const PX = require(path.join(FN, 'portal-plus.js'));
const SCHED = require(path.join(FN, 'maint-scheduled.js'));
const X = PX._x9;
const ADMIN = { ok: true, admin: true, email: 'wesley@grayco-cs.com', name: 'Wesley' }, OFFICE = { ok: true, office: true, email: 'office@grayco-cs.com', name: 'Office' }, PM = { ok: true, email: 'pat@grayco-cs.com', name: 'Pat PM' };

console.log('1. the catalog');
let r = await X.staffAct({ action: 'plans' }, PM);
const ids = r.out.settings.plans.map(function(x){ return x.id; });
const res = r.out.settings.plans.filter(function(x){ return x.market === 'residential'; }).map(function(x){ return x.id; }), com = r.out.settings.plans.filter(function(x){ return x.market === 'commercial'; });
ok('10 residential plans by default (HVAC + pressure washing are GrayCo services; winter snow)', res.join(',') === 'home,roof,gutter,storm,deck,water,hvac,wash,snow,whole', res.join(','));
ok('10 commercial plans (roof, free inspection, coating, water, storm, gutter, envelope, RTU HVAC, winter snow, pressure washing)', com.length === 10 && com.find(function(x){ return x.id === 'c_snow'; }).freq === 'winter' && com.some(function(x){ return x.id === 'c_coat'; }) && com.find(function(x){ return x.id === 'c_hvac'; }).freq === 'quarterly', com.map(function(x){ return x.id; }).join(','));
ok('every billed plan has a usual price and how often; the free inspection is a one-time $0 offer', r.out.settings.plans.every(function(x){ return (x.freq === 'once' ? x.price === 0 : x.price > 0) && /^(yearly|twice|quarterly|winter|once)$/.test(x.freq) && x.name && x.includes; }) && com.find(function(x){ return x.id === 'c_free'; }).freq === 'once');
ok('twice a year: gutter, HVAC, whole-home (+ commercial roof, gutter)', r.out.settings.plans.filter(function(x){ return x.freq === 'twice'; }).map(function(x){ return x.id; }).join(',') === 'gutter,hvac,whole,c_roof,c_gutter');
ok('a home job is offered home plans only; a commercial job commercial plans only (never the one-time offer)', M.plansFor({ type: 'Residential' }, r.out.settings).every(function(x){ return x.market === 'residential'; }) && M.plansFor({ type: 'Commercial' }, r.out.settings).every(function(x){ return x.market === 'commercial' && x.freq !== 'once'; }));
KV.gc_maint_plans = { plans: [{ id: 'home', name: 'Home Exterior Check-up', includes: 'A walk-around. Price: [PRICE] per year.', visits: 1, on: true, kinds: ['any'] }], offerOn: ['residential'] };
r = await X.staffAct({ action: 'plans' }, PM);
ok('a list saved before the catalog gets the new plans (once)', r.out.settings.plans.length === 20 && r.out.settings.plans[0].price === 250, r.out.settings.plans.length);
r = await X.staffAct({ action: 'plans', set: { plans: r.out.settings.plans, offerOn: ['residential', 'insurance'] } }, PM);
ok('a PM cannot change the plans', r.status === 403);
const edited = (await X.staffAct({ action: 'plans' }, PM)).out.settings.plans.filter(function(x){ return x.id !== 'deck'; }).map(function(x){ return x.id === 'roof' ? Object.assign({}, x, { price: 325, name: 'Roof Check-up Plus' }) : x; });
edited.push({ id: 'planx', name: 'Skylight Care', freq: 'yearly', price: 120, includes: 'Skylights cleaned and resealed.', on: true, kinds: ['any'] });
r = await X.staffAct({ action: 'plans', set: { plans: edited, offerOn: ['residential', 'insurance'] } }, OFFICE);
ok('the office saves the catalog', r.status === 200 && r.out.ok);
r = await X.staffAct({ action: 'plans' }, PM);
const st = r.out.settings;
ok('the saved list is exactly what was saved (deck removed, new plan, new price)', !st.plans.some(function(x){ return x.id === 'deck'; }) && st.plans.find(function(x){ return x.id === 'roof'; }).price === 325 && st.plans.some(function(x){ return x.id === 'planx' && x.price === 120; }));
ok('stored in gc_kv "gc_maint_plans" with catalog 2', KV.gc_maint_plans && KV.gc_maint_plans.catalog === 2);

console.log('2. several plans quoted at once');
r = await X.staffAct({ action: 'quote-many', pid: 'job1', items: [{ planId: 'roof', price: 300 }, { planId: 'gutter', price: 260 }, { planId: 'storm', price: 0 }] }, PM);
ok('a plan without a price is refused', r.status === 400);
r = await X.staffAct({ action: 'quote-many', pid: 'job1', items: [{ planId: 'c_free', price: 10 }] }, PM);
ok('the one-time Free Roof Inspection is not quoted as a plan', r.status === 400 && KV.gc_maint.length === 0);
r = await X.staffAct({ action: 'quote-many', pid: 'job1', items: [{ planId: 'roof', price: 300 }, { planId: 'gutter', price: 260 }, { planId: 'water', price: 195 }] }, PM);
ok('three plans quoted', r.status === 200 && r.out.contracts.length === 3 && KV.gc_maint.filter(function(c){ return c.status === 'quoted'; }).length === 3);
const qs = APPROVALS.filter(function(a){ return a.kind === 'maint_quote'; });
ok('ONE maint_quote item on Approvals', qs.length === 1, qs.length);
ok('the e-mail lists every plan with its price', /Roof Check-up Plus/.test(qs[0].html) && /\$300\.00 per year/.test(qs[0].html) && /Gutter Clean &amp; Check/.test(qs[0].html) && /twice a year/.test(qs[0].html) && /Water &amp; Moisture Check/.test(qs[0].html));
ok('no carrier name in the quote e-mail', !/state\s*farm/i.test(qs[0].html + qs[0].subject));
ok('the gutter contract bills twice a year', KV.gc_maint.find(function(c){ return c.planId === 'gutter'; }).billsPerYear === 2);
r = await X.staffAct({ action: 'quote-many', pid: 'job1', items: [{ planId: 'roof', price: 300 }, { planId: 'gutter', price: 260 }, { planId: 'water', price: 195 }] }, PM);
ok('the same quote again: the same contracts, no second item', KV.gc_maint.length === 3 && APPROVALS.filter(function(a){ return a.kind === 'maint_quote'; }).length === 1);
r = await X.staffAct({ action: 'quote', pid: 'job1', planId: 'whole', price: 900 }, PM);
ok('the single-plan quote still works', r.status === 200 && APPROVALS.filter(function(a){ return a.kind === 'maint_quote'; }).length === 2);

console.log('3. the portal');
let A = await X.readAll();
let v = await X.view(A, A.data.projects[0]);
const qc = v.maint.contracts.filter(function(c){ return c.status === 'quoted'; });
ok('the portal shows every quoted plan', qc.length === 4 && v.maint.offered);
const g = qc.find(function(c){ return c.planId === 'gutter'; });
ok('with price, how often and the words', g.price === 260 && g.freqLabel === 'Twice a year' && g.billsPerYear === 2 && /twice a year/i.test(g.includes));
ok('no carrier name, nothing internal (quotedBy, history)', !/state\s*farm/i.test(JSON.stringify(v)) && !/quotedBy|history|pat@grayco/.test(JSON.stringify(v.maint)));

console.log('4. sign, then the invoices on schedule');
const ev = { headers: { 'x-nf-client-connection-ip': '1.2.3.4' } };
const roof = KV.gc_maint.find(function(c){ return c.planId === 'roof'; }), gut = KV.gc_maint.find(function(c){ return c.planId === 'gutter'; });
let s1 = await X.sign(ev, {}, { contractId: roof.id, name: 'Ann Henderson', agree: true, strokes: [] }, await X.readAll(), P);
let s2 = await X.sign(ev, {}, { contractId: gut.id, name: 'Ann Henderson', agree: true, strokes: [] }, await X.readAll(), P);
ok('both plans signed', s1.status === 200 && s2.status === 200 && KV.gc_maint.filter(function(c){ return c.status === 'signed'; }).length === 2, JSON.stringify([s1.out, s2.out]));
ok('the twice-a-year plan: first visit in 6 months', (function(){ const c = KV.gc_maint.find(function(x){ return x.planId === 'gutter'; }); const m = (Date.parse(c.nextVisit) - Date.parse(c.signedAt)) / 864e5; return m > 170 && m < 190; })());
v = await X.view(await X.readAll(), P);
ok('the portal shows the signed plans', v.maint.contracts.filter(function(c){ return c.status === 'signed'; }).length === 2);
const before = APPROVALS.length;
let out = await SCHED._run(Date.now());
let inv = APPROVALS.slice(before).filter(function(a){ return a.kind === 'maint_invoice'; });
ok('one maint_invoice per signed plan', inv.length === 2 && out.invoices === 2, JSON.stringify(out));
const ri = inv.find(function(a){ return a.meta.contractId === roof.id; }), gi = inv.find(function(a){ return a.meta.contractId === gut.id; });
ok('the roof plan bills the year (300)', ri && ri.meta.amount === 300 && ri.meta.year === '1');
ok('the gutter plan bills half (130), period 1.1', gi && gi.meta.amount === 130 && gi.meta.year === '1.1');
out = await SCHED._run(Date.now());
ok('never twice', out.invoices === 0 && APPROVALS.filter(function(a){ return a.kind === 'maint_invoice'; }).length === 2);
out = await SCHED._run(Date.now() + 175 * 864e5);
inv = APPROVALS.filter(function(a){ return a.kind === 'maint_invoice'; });
ok('6 months on: the gutter plan\'s second half (1.2), the roof plan nothing', out.invoices === 1 && inv[2].meta.year === '1.2' && inv[2].meta.contractId === gut.id, JSON.stringify(out));
const sent = await X.maintInvoiceSend(Object.assign({}, gi, { to: 'ann@example.com' }), new Date().toISOString());
const sent2 = await X.maintInvoiceSend(Object.assign({}, ri, { to: 'ann@example.com' }), new Date().toISOString());
const nums = KV.gc_maint.filter(function(c){ return c.status === 'signed'; }).map(function(c){ return (c.invoices.find(function(x){ return x.status === 'sent'; }) || {}).number; });
ok('the approved invoices go out, each with its own number', sent.ok && sent2.ok && nums[0] && nums[1] && nums[0] !== nums[1], JSON.stringify(nums));
ok('no carrier name in the e-mails (the invoices went out)', MAILS.length >= 2 && MAILS.every(function(m){ return !/state\s*farm/i.test(m.subject + m.html); }));

ok('a winter plan signed in June is on call from December 1st; in January, at once', M.firstVisit('winter', '2026-06-10T12:00:00Z') === '2026-12-01' && M.firstVisit('winter', '2027-01-15T12:00:00Z') === '2027-01-15' && M.firstVisit('quarterly', '2026-06-10T12:00:00Z') === '2026-09-10');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
