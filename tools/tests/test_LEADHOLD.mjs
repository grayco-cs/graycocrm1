// test_LEADHOLD.mjs <build-dir> — patch LEADHOLD: hold-then-assign for new leads + the PM's own lead.
//   Part 1 (no browser, made-up data, a fake Supabase / Resend / CompanyCam): the rule (_lib/lead-hold.js) and its copy
//   in index.html; held until 5 PM; after hours → next work day 5 PM; weekend → Monday 5 PM; emergency not held; the
//   server's routing (bid-inbox routeLead) holds; an admin's approve / reassign in the CRM ends the server hold; the
//   10-minute server run (bid-alerts.js, fake clock) assigns at the deadline and sends the notice; GrayCo Photos
//   (companycam-sync) → the PM's own lead (own-lead pay tag, no hold); PM / office / first-in / RoofScout / /go/ rules.
//   Part 2 (offline harness, demo data, admin): the chip, the ONE grouped approval card, the Leads routing pass holds a
//   new lead / releases a due one / routes an emergency at once, Approve, Pick someone else, own-lead chip.
//   GC_NO_BROWSER=1 runs part 1 only.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('usage: node test_LEADHOLD.mjs <dir with index.html and netlify/functions>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const F = p => path.join(build, 'netlify/functions', p);

/* ── a fake Supabase (gc_kv + the Lead Inbox table), Resend and CompanyCam ── */
const DB = { gc_kv: new Map(), gc_lead_inbox_kv: new Map() }, MAIL = [], CC = { projects: [] };
let tick = 0; const stamp = () => new Date(Date.UTC(2026, 0, 1) + (++tick) * 1000).toISOString();
const put = (t, key, value) => DB[t].set(key, { key, value, updated_at: stamp() });
const resp = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => 'application/json' } });
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.RESEND_API_KEY = 'k'; process.env.COMPANYCAM_TOKEN = 'cc-test-token';
global.fetch = async (url, init) => {
  init = init || {}; const u = String(url), M = (init.method || 'GET').toUpperCase();
  if (/api\.resend\.com/.test(u)) { MAIL.push(JSON.parse(init.body)); return resp(200, { id: 'm' + MAIL.length }); }
  if (/api\.companycam\.com\/v2\/company/.test(u)) return resp(200, { id: 1, name: 'GrayCo' });
  if (/api\.companycam\.com\/v2\/projects/.test(u)) { const pg = +(/[?&]page=(\d+)/.exec(u) || [0, 1])[1]; return resp(200, pg === 1 ? CC.projects : []); }
  if (/api\.companycam\.com/.test(u)) return resp(404, {});
  const m = /\/rest\/v1\/([a-z_]+)(\?(.*))?$/.exec(u); if (!m) return resp(404, {});
  const t = m[1], q = new URLSearchParams(m[3] || '');
  if (!DB[t]) return resp(200, []);
  const T = DB[t], keyEq = (q.get('key') || '').replace(/^eq\./, ''), keyIn = /^in\.\((.*)\)$/.exec(q.get('key') || '');
  if (M === 'GET') {
    if (keyIn) return resp(200, keyIn[1].split(',').map(k => k.replace(/^"|"$/g, '')).filter(k => T.has(k)).map(k => T.get(k)));
    if (keyEq) return resp(200, T.has(keyEq) ? [T.get(keyEq)] : []);
    return resp(200, []);
  }
  if (M === 'PATCH') { const at = (q.get('updated_at') || '').replace(/^eq\./, ''), cur = T.get(keyEq); if (!cur || cur.updated_at !== at) return resp(200, []); const b = JSON.parse(init.body); T.set(keyEq, { key: keyEq, value: b.value, updated_at: stamp() }); return resp(200, [T.get(keyEq)]); }
  if (M === 'POST') { let b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => T.set(r.key, { key: r.key, value: r.value, updated_at: stamp() })); return resp(201, []); }
  return resp(200, []);
};

/* ── part 1: the rule ── */
console.log('Part 1 — the rule, the server');
const LIB = F('_lib/lead-hold.js');
const H = require(LIB);
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const mm = /\/\* LEADHOLD-CORE-BEGIN \*\/\n([\s\S]*?)\/\* LEADHOLD-CORE-END \*\//.exec(html);
ok(!!mm && mm[1] === fs.readFileSync(LIB, 'utf8'), 'the page carries _lib/lead-hold.js word for word');
const box = { window: {}, Intl, Date }; box.window.window = box.window; vm.createContext(box);
vm.runInContext('(function(){' + (mm ? mm[1] : '') + '}).call(window)', box);
const PAGE = box.window._gcLeadHoldCore;
ok(!!PAGE && PAGE.holdUntil(Date.parse('2026-10-28T15:00:00Z')) === H.holdUntil(Date.parse('2026-10-28T15:00:00Z')), 'window._gcLeadHoldCore on the page answers the same');
const CT = (s) => Date.parse(s);   /* the times below are written in UTC; Central = UTC-5 (CDT) until Nov 1, UTC-6 (CST) after */
const WED10 = CT('2026-10-28T15:00:00Z'), WED19 = CT('2026-10-29T00:00:00Z'), FRI1730 = CT('2026-10-30T22:30:00Z'), SAT = CT('2026-10-31T16:00:00Z');
ok(H.holdUntil(WED10) === '2026-10-28T22:00:00.000Z', 'a lead at 10 AM Wednesday → held until 5:00 PM Wednesday (Central)', H.holdUntil(WED10));
ok(H.holdUntil(WED19) === '2026-10-29T22:00:00.000Z', 'after hours (7 PM Wednesday) → 5:00 PM Thursday', H.holdUntil(WED19));
ok(H.holdUntil(FRI1730) === '2026-11-02T23:00:00.000Z', 'Friday 5:30 PM → 5:00 PM Monday (CST after the clock change)', H.holdUntil(FRI1730));
ok(H.holdUntil(SAT) === '2026-11-02T23:00:00.000Z', 'weekend (Saturday) → 5:00 PM Monday', H.holdUntil(SAT));
ok(H.whenLabel(H.holdUntil(WED10), WED10) === '5:00 PM today' && /^5:00 PM Mon 11\/2$/.test(H.whenLabel(H.holdUntil(SAT), SAT)), 'labels: "5:00 PM today" / "5:00 PM Mon 11/2"');
ok(H.noHoldWhy({ title: 'EMERGENCY water pouring in the kitchen', type: 'insurance' }, WED10) === 'emergency / mitigation', 'emergency / water lead: not held');
ok(H.noHoldWhy({ title: 'House fire smoke damage', type: 'residential' }, WED10) === 'emergency / mitigation', 'fire lead: not held');
ok(H.noHoldWhy({ title: 'Roof replacement quote', type: 'roofing' }, WED10) === '', 'a roofing quote: held');
ok(/admin/.test(H.noHoldWhy({ title: 'Roof quote', holdSkip: true }, WED10)), 'a lead an admin made / assigned by hand: not held');
ok(/bid is due/.test(H.noHoldWhy({ title: 'School reroof', type: 'commercial', bidDue: '2026-10-29' }, WED10)), 'a bid due tomorrow: not held (the estimator needs it now)');

/* own lead vs GrayCo lead */
const PM = { name: 'Pat PM', email: 'pat@grayco-cs.com', kind: 'pm' }, OFF = { name: 'Olive Office', email: 'office@grayco-cs.com', kind: 'admin' };
let d = H.decideSource({ id: 'L1', name: 'Smith roof', address: '12 Elm St, Bartlett TN', createdAt: '2026-10-28T15:00:00Z' }, { creator: PM });
ok(d && d.source === 'self' && d.pm === 'Pat PM', 'a PM enters a lead by hand → his own lead', d);
d = H.decideSource({ id: 'L2', name: 'Jones', address: '13 Elm St', createdAt: '2026-10-28T15:00:00Z' }, { creator: OFF });
ok(d && d.source === 'company', 'the office enters it → GrayCo lead', d);
const web = { id: 'LEADIN-w1', name: 'Website lead', address: '44 Oak Cove, Cordova TN', websiteLead: true, createdAt: '2026-10-27T15:00:00Z', source: 'Website' };
d = H.decideSource({ id: 'P9', name: 'Oak job', address: '44 Oak Cv, Cordova', createdAt: '2026-10-28T15:00:00Z' }, { creator: PM, others: [web] });
ok(d && d.source === 'company' && /first in/.test(d.why), 'a website lead first, then a PM enters the same address → stays a GrayCo lead', d);
d = H.decideSource({ id: 'LRS', name: 'RS', rsLeadId: 'rs1', source: 'RoofScout', address: '1 A St' }, { creator: PM });
ok(d && d.source === 'company' && /RoofScout/.test(d.why), 'a PM creates a lead from RoofScout → GrayCo lead', d);
d = H.decideSource({ id: 'LGO', name: 'Go', source: 'Tracked link /go/spring', trackCode: 'spring', address: '2 B St' }, { creator: PM });
ok(d && d.source === 'company', 'a lead from a /go/ marketing link → GrayCo lead (even when a PM saved it)', d);
d = H.decideSource({ id: 'LCCR_77', name: 'CC', ccamId: '77', source: 'CompanyCam', address: '3 C St' }, { ccPm: 'Pat PM' });
ok(d && d.source === 'self' && d.pm === 'Pat PM', 'a lead from a PM’s GrayCo Photos project → his own lead', d);
ok(H.decideSource({ id: 'X', leadSourceOverride: { source: 'company' } }, { creator: PM }) === null, 'an admin’s own choice is never changed');

/* the SRC rule (jobs, the pay engines' source) with the new fields */
const LS = require(F('_lib/leadsource.js'));
const rec = { kind: 'lead', id: web.id, name: web.name, address: web.address, at: web.createdAt };
let c = LS.classify({ id: 'PRJ1', name: 'New project', address: '9 Pine Rd', pm: 'Pat PM', createdBy: 'Pat PM', createdByKind: 'pm', leadOwner: 'Pat PM', createdAt: '2026-10-28T15:00:00Z' }, { records: [rec] });
ok(c.source === 'self' && c.pm === 'Pat PM', 'SRC: a PM enters New Project → his own lead', c);
c = LS.classify({ id: 'PRJ2', name: 'Run by Sam', address: '10 Pine Rd', pm: 'Sam Super', createdBy: 'Pat PM', createdByKind: 'pm', leadOwner: 'Pat PM', createdAt: '2026-10-28T15:00:00Z' }, { records: [] });
ok(c.source === 'self' && c.pm === 'Pat PM', 'SRC: a PM enters it for someone else to run → still his own lead (he brought it in)', c);
c = LS.classify({ id: 'PRJ3', name: 'Office job', address: '11 Pine Rd', pm: 'Pat PM', createdBy: 'Olive Office', createdByKind: 'admin', createdAt: '2026-10-28T15:00:00Z' }, { records: [] });
ok(c.source === 'company', 'SRC: the office enters it → GrayCo lead', c);
c = LS.classify({ id: 'PRJ4', name: 'Oak job', address: '44 Oak Cove', pm: 'Pat PM', createdBy: 'Pat PM', createdByKind: 'pm', leadOwner: 'Pat PM', createdAt: '2026-10-28T15:00:00Z' }, { records: [rec] });
ok(c.source === 'company', 'SRC: a website lead first, then a PM enters the same address → GrayCo lead', c);
c = LS.classify({ id: 'PRJ5', name: 'RS job', address: '5 Elm', pm: 'Pat PM', createdBy: 'Pat PM', rsLeadId: 'rs9', source: 'RoofScout' }, { records: [] });
ok(c.source === 'company', 'SRC: a RoofScout job a PM made → GrayCo lead', c);
c = LS.classify({ id: 'PRJ6', name: 'Converted', address: '6 Elm', pm: 'Pat PM', leadId: 'L1', ownLead: true, leadIsMine: true, leadOwner: 'Pat PM', createdAt: '2026-10-28T15:00:00Z' }, { records: [] });
ok(c.source === 'self', 'SRC: a job converted from a PM’s own lead stays his own', c);
ok(LS.storedOf(Object.assign({ id: 'x' }, H.ownFields('Pat PM', 'why'))) === 'self' && LS.storedOf(Object.assign({ id: 'y' }, H.companyFields('why'))) === 'company', 'ownFields / companyFields are what the pay engines read (self / company)');

/* the server: routing holds; the 10-minute run assigns at the deadline */
const users = [{ name: 'Wesley Admin', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true }, { name: 'Ray Roofer', email: 'ray@grayco-cs.com', role: 'Project Manager', active: true },
  { name: 'Ina Insurance', email: 'ina@grayco-cs.com', role: 'Project Manager', active: true }, { name: 'Pat PM', email: 'pat@grayco-cs.com', role: 'Project Manager', active: true, ccName: 'Pat PM' }];
const team = { leadRoles: { roofingMgr: { email: 'ray@grayco-cs.com', name: 'Ray Roofer' }, insurancePm: { email: 'ina@grayco-cs.com', name: 'Ina Insurance' } } };
['gc_kv', 'gc_lead_inbox_kv'].forEach(t => { put(t, 'users', users); put(t, 'gc_team_settings', team); });
const BI = require(F('bid-inbox.js')), L = BI._lib;
const item = (id, o) => Object.assign({ id, status: 'new', title: id, source: 'Website', origin: 'website', websiteLead: true, type: 'residential', rev: 1, receivedAt: '2026-10-28T15:00:00Z', contact: { name: 'Zed', phone: '901-555-0100' } }, o);
put('gc_lead_inbox_kv', 'gc_lead_inbox', [
  item('LI-roof', { title: 'Roof replacement quote', scope: 'Need a new roof, shingles are old' }),
  item('LI-late', { title: 'Re-roof estimate', scope: 'roof is old' }),
  item('LI-wknd', { title: 'Roof repair', scope: 'missing shingles' }),
  item('LI-emerg', { title: 'EMERGENCY water pouring through ceiling', type: 'insurance', scope: 'water coming in now' }),
  item('LI-appr', { title: 'Roof quote (admin approves)', scope: 'roof' }),
  item('LI-re', { title: 'Roof quote (admin reassigns)', scope: 'roof' })]);
const inbox = () => DB.gc_lead_inbox_kv.get('gc_lead_inbox').value, it = id => inbox().find(x => x.id === id);
let NOW = WED10; BI._now = () => NOW;
await L.routeLead('LI-roof');
let x = it('LI-roof');
ok(x.hold && x.hold.state === 'held' && x.hold.name === 'Ray Roofer' && !x.pm && x.hold.until === '2026-10-28T22:00:00.000Z', 'routeLead: a roofing lead at 10 AM is HELD for Ray Roofer until 5:00 PM, not assigned', x.hold);
NOW = WED19; await L.routeLead('LI-late');
ok(it('LI-late').hold && it('LI-late').hold.until === '2026-10-29T22:00:00.000Z' && !it('LI-late').pm, 'routeLead after 5 PM → held until 5:00 PM the next work day', it('LI-late').hold);
NOW = SAT; await L.routeLead('LI-wknd');
ok(it('LI-wknd').hold && it('LI-wknd').hold.until === '2026-11-02T23:00:00.000Z', 'routeLead on Saturday → held until 5:00 PM Monday', it('LI-wknd').hold);
NOW = WED10; await L.routeLead('LI-emerg');
ok(!it('LI-emerg').hold && it('LI-emerg').pm === 'Ina Insurance', 'an emergency water lead is NOT held: assigned to the Senior Insurance PM at once', { pm: it('LI-emerg').pm, hold: it('LI-emerg').hold });
await L.routeLead('LI-appr'); await L.routeLead('LI-re');
/* the CRM: an admin approved one and picked someone else for the other (the CRM's copies in gc_kv "leads") */
put('gc_kv', 'leads', [
  { id: 'LEADIN-appr', inboxId: 'LI-appr', name: 'Roof quote', pm: 'Ray Roofer', pmEmail: 'ray@grayco-cs.com', assignedBy: 'Wesley Admin', assignConfirmed: true, hold: Object.assign({}, it('LI-appr').hold, { state: 'approved' }) },
  { id: 'LEADIN-re', inboxId: 'LI-re', name: 'Roof quote 2', pm: 'Pat PM', pmEmail: 'pat@grayco-cs.com', assignedBy: 'Wesley Admin', hold: it('LI-re').hold },
  { id: 'L-crm', name: 'Roof Ignite lead (CRM only)', source: 'Roof Ignite', hold: { state: 'held', name: 'Ray Roofer', email: 'ray@grayco-cs.com', field: 'pm', label: 'Senior Roofing PM', k: 'roofing', until: '2026-10-28T22:00:00.000Z', at: '2026-10-28T15:00:00.000Z' } }]);
const BA = require(F('bid-alerts.js'));
NOW = CT('2026-10-28T21:55:00Z');   /* 4:55 PM: nothing yet */
let out = await BA.run();
ok(out.holds && !out.holds.error && out.holds.assigned.length === 0 && !it('LI-roof').pm, 'the 10-minute run at 4:55 PM: nothing assigned yet', out.holds);
ok(it('LI-appr').hold.state === 'approved' && it('LI-re').hold.state === 'manual' && it('LI-re').pm === 'Pat PM', 'the admin’s approve / reassign in the CRM ends the server hold (the reassigned one goes to Pat PM, not the suggestion)', { a: it('LI-appr').hold.state, r: it('LI-re').hold.state, pm: it('LI-re').pm });
MAIL.length = 0; NOW = CT('2026-10-28T22:05:00Z');   /* 5:05 PM */
out = await BA.run();
x = it('LI-roof');
ok(x.pm === 'Ray Roofer' && x.pmEmail === 'ray@grayco-cs.com' && x.hold.state === 'auto' && /Auto/.test(x.assignedBy) && x.rev > 1, 'the run at 5:05 PM (fake clock): nobody acted → assigned to the suggested Ray Roofer', { pm: x.pm, by: x.assignedBy, hold: x.hold && x.hold.state });
ok(!it('LI-late').pm && it('LI-late').hold.state === 'held', '…the after-hours one waits for tomorrow 5 PM');
const toRay = MAIL.filter(m => arr(m.to).includes('ray@grayco-cs.com'));
ok(toRay.length >= 1 && toRay.some(m => /assign/i.test(m.subject)), 'Ray gets the normal "assigned to you" notice', MAIL.map(m => ({ to: m.to, s: m.subject })));
ok(!MAIL.some(m => arr(m.to).includes('pat@grayco-cs.com')), 'nobody is told about the leads the admins already handled');
ok(out.holds.crmOnly === 1, 'a CRM-only held lead past its deadline: its notice goes out from the server too', out.holds);
const n0 = MAIL.length; out = await BA.run();
ok(MAIL.length === n0 && out.holds.assigned.length === 0, 'the next run sends nothing twice', { before: n0, after: MAIL.length });
function arr(v){ return Array.isArray(v) ? v : []; }

/* GrayCo Photos (companycam-sync): a PM's project → his own lead, the own-lead pay tag, no hold */
put('gc_kv', 'projects', []);
const nowSec = Math.floor(Date.now() / 1000);
CC.projects = [{ id: 880011, name: 'Demo Porch Repair', address: { street_address_1: '77 Maple Dr', city: 'Bartlett', state: 'TN' }, creator_id: 'cc5', creator_name: 'Pat PM', created_at: nowSec - 600, updated_at: nowSec - 600, status: 'active' }];
const CCS = require(F('companycam-sync.js'));
const r = await CCS._t.run({});
const job = (DB.gc_kv.get('projects').value || []).find(j => j && j.id === 'PRJcc_880011');
ok(r.ok && job && job.pm === 'Pat PM', 'GrayCo Photos: Pat’s CompanyCam project → a job with Pat as PM', { ok: r.ok, made: r.made, job: job && job.pm });
ok(job && job.commissionSource === 'self' && job.leadIsMine === true && job.ownLead === true && job.leadOwner === 'Pat PM' && LS.storedOf(job) === 'self', 'tagged as Pat’s OWN lead (commissionSource self · leadIsMine · ownLead · leadOwner) — the own-lead pay structure', job && { cs: job.commissionSource, mine: job.leadIsMine, owner: job.leadOwner });
ok(job && !job.hold && H.noHoldWhy(job, WED10) === 'a PM’s own lead', 'never held');

/* ── part 2: the page ── */
if (process.env.GC_NO_BROWSER) { console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); }
console.log('Part 2 — the page (offline harness, demo data)');
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, cset, cget, signIn, mclick } = await import(pathToFileURL(HARNESS).href);
const { seedDemo } = await import(pathToFileURL(process.env.GC_DEMO_SEED || SP + '/wDEMO/seed.mjs').href);
seedDemo();
const ago = m => new Date(Date.now() - m * 60e3).toISOString(), inMin = m => new Date(Date.now() + m * 60e3).toISOString();
const hold = (until, o) => Object.assign({ state: 'held', name: 'Sample Roofer', email: 'roof@grayco-cs.com', field: 'pm', label: 'Senior Roofing PM', k: 'roofing', until, at: ago(30) }, o || {});
const LD = (id, o) => Object.assign({ id, name: id, stage: 'New Lead', status: 'new', createdAt: ago(30), updatedAt: ago(30), source: 'Roof Ignite', type: 'Roofing' }, o);
cset('gc_team_settings', { leadRoles: { roofingMgr: { email: 'roof@grayco-cs.com', name: 'Sample Roofer' }, insurancePm: { email: 'ins@grayco-cs.com', name: 'Sample Insurance' } } });
cset('leads', [
  LD('L_h1', { name: 'Demo Held Roof A', inboxId: 'LI-h1', inboxRev: 1, hold: hold(inMin(240)) }),
  LD('L_h2', { name: 'Demo Held Roof B', hold: hold(inMin(240)) }),
  LD('L_due', { name: 'Demo Held Roof Due', hold: hold(ago(2)) }),
  LD('L_new', { name: 'Demo New Roof Quote', createdAt: ago(5), updatedAt: ago(5), scope: 'roof replacement' }),
  LD('L_em', { name: 'Demo EMERGENCY water in kitchen', type: 'Insurance', isInsurance: true, createdAt: ago(5), updatedAt: ago(5) }),
  LD('L_own', { name: 'Demo Pat Own Lead', pm: 'Sample PM', commissionSource: 'self', ownLead: true, leadIsMine: true, leadOwner: 'Sample PM', leadSourceWhy: 'Sample PM’s own lead — entered by hand' })
]);
const POSTS = [];
const lead = id => { let v = cget('leads'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return (Array.isArray(v) ? v : []).find(l => l && l.id === id) || null; };
const cpu = await computer('LH', { build });
await cpu.ctx.route(/\/\.netlify\/functions\/bid-inbox/, rq => { if (rq.request().method() === 'POST') { POSTS.push({ url: rq.request().url(), body: rq.request().postData() }); return rq.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  return rq.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [] }) }); });
try {
  await signIn(cpu, 'wjohnson@grayco-cs.com', 12000);
  const p = cpu.page();
  await p.evaluate(() => window._setView && window._setView('leads'));
  const up = await waitFor(cpu, () => document.querySelectorAll('#gc-leads-hub .gcl-card').length >= 5 && !!window._gcLeadHold, null, 60000);
  ok(!!up, 'Leads board drawn; window._gcLeadHold loaded');
  const chipOf = id => p.evaluate(i => { const c = document.querySelector('#gc-leads-hub .gcl-card[data-gcl-id="' + i + '"]'); return c ? c.textContent : ''; }, id);
  ok(/⏳ Suggested: Sample Roofer — assigns at \d+:\d\d (AM|PM)/.test(await chipOf('L_h1')), 'the card shows "⏳ Suggested: Sample Roofer — assigns at …"', await chipOf('L_h1'));
  ok(/Sample PM’s own lead/.test(await chipOf('L_own')), 'a PM’s own lead shows "👤 Sample PM’s own lead"', await chipOf('L_own'));
  /* the Leads routing pass: hold the new one, release the due one, route the emergency at once */
  await p.evaluate(() => window._gcLeadsHub.autoAssign(true));
  let st = null; for (let i = 0; i < 30 && !(st && st.due && st.due.pm); i++) { await sleep(500); st = { nw: lead('L_new'), due: lead('L_due'), em: lead('L_em') }; }
  ok(st.nw && st.nw.hold && st.nw.hold.state === 'held' && st.nw.hold.name === 'Sample Roofer' && !st.nw.pm, 'a NEW roofing lead is held for Sample Roofer (not assigned)', st.nw && { hold: st.nw.hold, pm: st.nw.pm });
  ok(st.due && st.due.pm === 'Sample Roofer' && st.due.hold.state === 'auto', 'a held lead past 5 PM is assigned to its suggestion', st.due && { pm: st.due.pm, hold: st.due.hold && st.due.hold.state });
  ok(st.em && st.em.pm === 'Sample Insurance' && !st.em.hold, 'an EMERGENCY water lead is routed at once (not held)', st.em && { pm: st.em.pm, hold: st.em.hold });
  ok(!!lead('L_h1').hold && !lead('L_h1').pm, 'a held lead before its deadline is left alone');
  /* ✅ Approvals: ONE grouped card */
  /* (patch HOT1 reads this computer's saved copy every 1.5 s: give it a moment to see the hold) */
  const ap = (await waitFor(cpu, () => { const a = (window._gcHot1Approvals() || []).map(x => ({ id: x.id, t: x.title })); return a.some(x => /hot1:asg:L_new/.test(x.id)) ? null : a; }, null, 15000)) || await p.evaluate(() => (window._gcHot1Approvals() || []).map(x => ({ id: x.id, t: x.title })));
  const grp = ap.filter(x => x.id === 'td:leadhold'), single = ap.filter(x => /hot1:asg:(L_h1|L_h2|L_new)/.test(x.id));
  ok(grp.length === 1 && /3 new leads waiting to be assigned/.test(grp[0].t) && single.length === 0, 'Approvals: ONE card "⏳ 3 new leads waiting to be assigned", no per-lead flood', ap);
  await p.evaluate(() => window._gcLeadHold.open());
  const rows = await waitFor(cpu, () => { const o = document.getElementById('gclh-ov'); return o ? o.querySelectorAll('[data-gclh-approve]').length : 0; }, null, 5000);
  ok(rows === 3, 'its short list: each with ✅ Approve / 👤 Pick someone else', rows);
  /* approve one */
  POSTS.length = 0;
  await mclick(p, '#gclh-ov [data-gclh-approve="L_h1"]');
  let a1 = null; for (let i = 0; i < 30 && !(a1 && a1.pm); i++) { await sleep(400); a1 = lead('L_h1'); }
  ok(a1 && a1.pm === 'Sample Roofer' && a1.hold.state === 'approved' && a1.assignConfirmed, 'Approve → assigned to the suggestion now (hold approved)', a1 && { pm: a1.pm, hold: a1.hold && a1.hold.state });
  await sleep(600);
  ok(POSTS.some(x => /act=1/.test(x.url) && /"op":"assigned"/.test(x.body) && /LI-h1/.test(x.body)) && POSTS.some(x => /notify=1/.test(x.url)), 'the Lead Inbox is told (its hold ends) and the person gets the notice', POSTS.map(x => x.url));
  await p.evaluate(() => { const o = document.getElementById('gclh-ov'); if (o) o.remove(); });
  /* pick someone else in the panel */
  await p.evaluate(() => window._gcLeadsHub.open('L_h2'));
  const box0 = await waitFor(cpu, () => { const b = document.querySelector('#gcl-drawer [data-gclh-box]'); return b ? b.textContent : null; }, null, 8000);
  ok(/Suggested: Sample Roofer/.test(box0 || '') && /Approve suggestion/.test(box0 || ''), 'the lead panel says "Suggested: Sample Roofer — assigns at …" with ✅ Approve suggestion', box0);
  await p.selectOption('#gcl-drawer select[data-d="assign"]', 'Sample PM');
  let a2 = null; for (let i = 0; i < 30 && !(a2 && a2.pm); i++) { await sleep(400); a2 = lead('L_h2'); }
  ok(a2 && a2.pm === 'Sample PM' && !window0(a2), 'picking someone else assigns now — the hold is over', a2 && { pm: a2.pm, hold: a2.hold && a2.hold.state });
  const ap2 = await p.evaluate(() => (window._gcHot1Approvals() || []).filter(x => x.id === 'td:leadhold').map(x => x.title));
  ok(ap2.length === 1 && /1 new lead waiting/.test(ap2[0]), 'the card now counts the one left', ap2);
  ok(!cpu.errs.length, 'no page errors', cpu.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
function window0(l){ return !!(l && l.hold && l.hold.state === 'held' && !(l.pm || l.estimator)); }
await cpu.b.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
