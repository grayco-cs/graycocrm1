// test_QA1027_fn.mjs [build] — patch QA1027 LEADKIND, server side: netlify/functions/_lib/job-auto.js leadKindOf (the lead-type rule
// the page carries word for word, tools/leadkind_core.js) + the GrayCo Photos wording pairs file is well-formed.
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.resolve(process.argv[2] || path.join(HERE, '../..'));
const JA = require(path.join(BUILD, 'netlify/functions/_lib/job-auto.js'));
let P = 0, F = 0; const ok = (c, n, i) => { if (c) P++; else F++; console.log((c ? '  ok   ' : '  FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 300))); };
const K = (l, h) => { const r = JA.leadKindOf(l, h); return r ? r.kind : null; };
console.log('# owner examples: public owners from the Estimate Builder are commercial');
ok(K({ name: 'Fayette County Fire Station', source: 'Estimate Builder', company: 'Fayette County Fire Station', address: 'Arlington, Tn.' }) === 'Commercial', 'Fayette County Fire Station → Commercial');
ok(K({ name: 'Shelby Farms Park Operation Center', source: 'Estimate Builder', company: 'Shelby Farms Park Operation Center', address: '7386 Raleigh Lagrange Rd, Cordova' }) === 'Commercial', 'Shelby Farms Park Operation Center → Commercial');
ok(/public owner/.test(JA.leadKindOf({ name: 'Fayette County Fire Station' }).why), 'the reason says why (public owner)');
console.log('# bid sources, GC invites, the estimate / job behind the lead');
for (const src of ['PlanHub', 'BuildingConnected', 'GC direct', 'Bid invitation (GC direct)', 'City of Memphis', 'SAM.gov', 'Shelby County procurement']) ok(K({ name: 'Roof job', source: src }) === 'Commercial', 'source "' + src + '" → Commercial');
ok(K({ name: 'Roof job', source: 'Referral', gc: 'Pathway Builders' }) === 'Commercial', 'a GC on the lead → Commercial');
ok(K({ name: 'Roof job', source: 'Referral', dueToCompany: 'Summit Ridge Construction' }) === 'Commercial', 'due to a GC → Commercial');
ok(K({ name: 'NWCC Agricultural Center', source: 'Estimate Builder' }, { estGc: 'Evans Taylor Foster Childress' }) === 'Commercial', 'its estimate is for a GC → Commercial');
ok(K({ name: 'Some job', source: 'Estimate Builder' }, { jobGroup: 'commercial' }) === 'Commercial', 'its job is commercial (AUTOCOM) → Commercial');
ok(K({ name: 'Some job', source: 'Estimate Builder', projectType: 'Commercial Reno' }) === 'Commercial', 'job type Commercial Reno → Commercial');
for (const n of ['Memphis City Schools roof', 'Grace Baptist Church', 'Town of Collierville public works', 'Overton Park pavilion roof', 'State of Tennessee DOT shed', 'Federal building annex', 'Tipton County Sheriff office']) ok(K({ name: n, source: 'Referral' }) === 'Commercial', '"' + n + '" → Commercial');
console.log('# program work → insurance');
ok(K({ name: 'Jane', source: 'Contractor Connection program' }) === 'Insurance', 'a program source → Insurance');
ok(K({ name: 'Jane', projectType: 'Program Work' }) === 'Insurance', 'program work type → Insurance');
ok(K({ name: 'Jane', source: 'Referral program' }) === null, 'a referral program is not insurance');
console.log('# never downgrades, never guesses on a homeowner');
ok(K({ name: 'Bid X', source: 'PlanHub', leadKind: 'Insurance' }) === null, 'insurance stays insurance');
ok(K({ name: 'Fayette County Fire Station', leadKind: 'Commercial' }) === null, 'commercial stays (no change needed)');
ok(K({ name: 'Shelby County bid', leadKind: 'Government' }) === null, 'government stays');
for (const n of ['Jim Church', 'Smith - 4500 County Line Rd', 'Jones 12 School St roof', 'First Church Ave reno', 'Oak Park Drive roof', 'Hyde Park Homes reno', 'Sam (neighbor)', 'Jane Homeowner'])
  ok(K({ name: n, source: 'Referral', leadKind: 'Residential' }) === null, '"' + n + '" stays residential');
ok(K({ name: 'Jane Homeowner', source: 'Estimate Builder', projectType: 'Residential Reno' }) === null, 'a homeowner\'s estimate stays residential');
ok(K({ name: 'Jane Homeowner', source: 'Website', websiteLead: true, leadKind: 'Residential' }) === null, 'a website homeowner stays residential');
ok(K({ name: 'Jane Homeowner', source: 'Website (bid request)', websiteLead: true }) === null, 'the word "bid" in a website source does not make a homeowner commercial');
console.log('# jobs and leads agree (AUTOCOM groupOf on the same record)');
for (const l of [{ name: 'x', source: 'PlanHub' }, { name: 'x', source: 'BuildingConnected' }, { name: 'x', projectType: 'Commercial TI' }])
  ok(JA.groupOf({ leadSource: l.source, type: l.projectType || '' }) === 'commercial' && K(l) === 'Commercial', 'job ' + JSON.stringify(l) + ' commercial ⇔ lead Commercial');
console.log('# the page carries the same rule');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8'), core = fs.readFileSync(path.join(BUILD, 'tools/leadkind_core.js'), 'utf8').trim();
ok(html.includes(core) && fs.readFileSync(path.join(BUILD, 'netlify/functions/_lib/job-auto.js'), 'utf8').includes(core), 'tools/leadkind_core.js is in index.html and job-auto.js, word for word');
console.log('# GrayCo Photos wording');
const pairs = JSON.parse(fs.readFileSync(path.join(BUILD, 'tools/qa1027_ccwords.json'), 'utf8'));
ok(pairs.length > 50 && pairs.every(p => p.find && typeof p.new === 'string' && p.count >= 1), 'pairs file is well-formed (' + pairs.length + ')');
ok(pairs.every(p => html.split(p.find).length - 1 === 0 || p.new.includes(p.find)), 'none of the old texts is left in index.html', pairs.filter(p => html.includes(p.find) && !p.new.includes(p.find)).map(p => p.find.slice(0, 60)));
ok(!/Open in CompanyCam|CompanyCam ↗<\/a>(?![^']*token)/.test(html.replace(/1\. Open CompanyCam ↗|>Open CompanyCam ↗<\/a>/g, '')), 'no staff link that opens CompanyCam (the admin token guide keeps its own)');
ok(/'GrayCo Photos \(PM\\'s own\)'/.test(html) && /'companycam \(pm\\'s own\)': 'GrayCo Photos \(PM\\'s own\)'/.test(html), 'lead source label is GrayCo Photos (the old label still reads)');
console.log('# SUBHIDE: the customer / GC portal sign-in note never names the sub portal');
{ const vm = await import('vm');
  const run = (opts, partner) => { const got = []; const el = { querySelector: () => null, appendChild: x => got.push(x.innerHTML) };
    const doc = { createElement: () => ({ setAttribute(){}, style: {}, appendChild(){} }), getElementById: id => id === 'signinBox' ? el : null, querySelector: () => null, documentElement: {}, body: null };
    const win = { document: doc }; win.window = win; if (partner) win.GCPartner = {};
    vm.runInNewContext(fs.readFileSync(path.join(BUILD, 'legal2.js'), 'utf8'), Object.assign(win, { window: win, document: doc }));
    win.GCLegal.boot(opts); return got.join(' '); };
  const cust = run({ base: '' }), sub = run({ base: '', bid: true }), partner = run({ base: '' }, true);
  ok(/Customer Portal Terms of Use/.test(cust) && !/Sub Portal/.test(cust), 'customer portal sign-in: customer terms only, no "Sub Portal"', cust.slice(0, 300));
  ok(/Sub Portal Terms of Use/.test(sub) && !/Customer Portal/.test(sub), 'bid / sub portal sign-in: the sub terms', sub.slice(0, 200));
  ok(/Sub Portal Terms of Use/.test(partner), 'sub portal inside portal.html (GCPartner): the sub terms', partner.slice(0, 200)); }
console.log('\n' + P + ' passed, ' + F + ' failed'); process.exit(F ? 1 : 0);
