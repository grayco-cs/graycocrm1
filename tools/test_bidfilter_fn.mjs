// test_bidfilter_fn.mjs — patch BIDFILTER (offline): the always-on construction gate (_lib/bid-filter.js), the public bid
// watcher with "All public bids" on, the cleanup preview, and the bid-notice e-mail gate.
// Usage: node tools/test_bidfilter_fn.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test' });
const BF = require(path.join(SRC, '_lib/bid-filter.js'));
const BW = require(path.join(SRC, 'bid-watch.js'));
const BI = require(path.join(SRC, 'bid-inbox.js'));
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) pass++; else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i) : '')); } }

const T = [
  ['Compact Track Loader', 0], ['Purchase of One (1) Dump Truck', 0], ['Janitorial Supplies', 0], ['RFQ Strategic Plan Development', 0], ['RFQ for Real Estate Agent', 0],
  ['Roof Replacement – Central Office', 1], ['DCF E Bldg. Reno. PH1', 1], ['HVAC Replacement at Fire Station 3', 1], ['Parking Lot Resurfacing', 1],
  ['Purchase and Installation of Generator', 1], ['Mowing Services', 0], ['ADA Restroom Renovations', 1], ['Asphalt (material purchase)', 0], ['Annual Contract for Concrete Work', 1],
  ['Skid Steer Purchase', 0], ['Excavator Purchase', 0], ['Lease of Copiers', 0], ['Purchase of Police Vehicles', 0], ['Uniform Rental Services', 0], ['Custodial Services - City Hall', 0],
  ['Food Service Management', 0], ['Software License Renewal', 0], ['Audit Services FY2026', 0], ['Legal Services RFQ', 0], ['Banking Services RFP', 0], ['Fuel Purchase - Unleaded and Diesel', 0],
  ['Sand and Salt Purchase', 0], ['PVC Pipe Supply Only', 0], ['Roofing Materials Supply', 0], ['Landscaping Maintenance Services', 0], ['Pest Control Services', 0], ['Security Guard Services', 0],
  ['Towing Services', 0], ['Pharmacy Services', 0], ['Library Books', 0], ['Classroom Furniture Purchase', 0], ['Athletic Equipment', 0], ['Ammunition Purchase', 0], ['Rental of Heavy Equipment', 0],
  ['School Bus Purchase', 0], ['Tractor with Mower Attachment', 0], ['Information Technology Equipment', 0], ['Printing Services', 0], ['Insurance Broker Services', 0],
  ['Reroof of Gymnasium Building', 1], ['Renovation of Fire Station No. 2', 1], ['Construction of New Restroom Facility at Park', 1], ['Plumbing Repairs - City Hall', 1], ['Gym Floor Replacement', 1],
  ['Bleacher Replacement - Football Stadium', 1], ['Storm Shelter Construction', 1], ['Design-Build Services for Police Headquarters', 1], ['CMAR - Library Addition', 1], ['Job Order Contracting (JOC) for Facilities', 1],
  ['Playground Installation at Elementary School', 1], ['Mold Remediation - Courthouse', 1], ['Asbestos Abatement - Old Hospital', 1], ['Window Replacement, Admin Building', 1], ['Fencing Installation - Public Works', 1],
  ['Sidewalk and Drainage Improvements', 1], ['Interior Painting of Community Center', 1], ['Water Damage Restoration', 1], ['Furnish and Install Canopy', 1], ['Fire Truck Garage Renovation', 1],
  ['Replacement of Roof at Senior Center', 1], ['HVAC Equipment Replacement - Library', 1], ['Installation of Copiers', 0], ['Fleet Maintenance Facility Addition', 1], ['Concrete Purchase', 0],
  ['Elevator Modernization', 1], ['Division 07 - Thermal and Moisture Protection', 1], ['Bid 24-117', 0], ['Mechanical Equipment Purchase', 0], ['Pavement Marking and Striping', 1]
];
console.log('title table (' + T.length + ')');
T.forEach(([t, want]) => { const g = BF.check(t); console.log('  ' + (g.ok ? 'LEAD' : 'SKIP') + (!!want === g.ok ? '  ok   ' : '  FAIL ') + t + '   [' + (g.hit || '-') + ']'); ok(!!want === g.ok, t, g); });
ok(T.length >= 40, '40+ titles');

// description is read only when the title is silent
ok(BF.check('Bid 24-117', 'Replace the roof on the library').ok, 'description decides when title silent');
ok(!BF.check('Compact Track Loader', 'new roofing project').ok, 'title wins over description');
// owner words
ok(BF.check('Widget Maintenance Wing', '', { include: ['widget'] }).ok, 'owner include word');
ok(!BF.check('Concrete Work Widgets', '', { exclude: ['widgets'] }).ok && BF.check('Widgets Renovation', '', { exclude: ['widgets'] }).ok, 'owner exclude word is a hard word (a clear construction phrase still wins)');
ok(BF.mergedLists({ keywords: ['mywordkw', 'hardware'], exclude: ['mywordex', 'elevator'] }).keywords.includes('mywordkw') && BF.mergedLists({ keywords: ['mywordkw'] }).keywords.includes('roof'), 'merge keeps owner words + built-ins');
ok(!BF.mergedLists({ exclude: ['elevator', 'supplies'] }).exclude.includes('elevator'), 'legacy words dropped');

// the watcher, "All public bids" ON: the gate still applies
const M = BW._test.matchWords;
const on = { allBids: true }, off = { allBids: false };
ok(!M('Compact Track Loader', on, 'Southaven Compact Track Loader bid opening Nov 4').ok, 'allBids on: loader skipped');
ok(M('Roof Replacement – Central Office', on).ok, 'allBids on: roof lead');
ok(M('Annual Contract for Concrete Work', on).ok, 'allBids on: any trade');
ok(!M('Mowing Services', off).ok && M('Roof Replacement', off).ok, 'allBids off: gate + keyword');
// the exclude list in settings no longer drops a clear construction bid by itself... but owner words work
ok(!M('Dump Truck Purchase', { allBids: true, exclude: ['dump'] }).ok, 'owner exclude');

// testRead-style listing uses the same gate
// cleanup preview
const settings = Object.assign({}, BI._lib.DEFAULT_SETTINGS);
const mk = (id, title, extra) => Object.assign({ id, title, origin: 'watch', status: 'new', scope: '', source: 'Southaven', city: 'Southaven', type: 'government' }, extra);
const items = [mk('a', 'Compact Track Loader', { status: 'imported', leadId: 'LEADIN-a', estimator: 'Glenn Miller' }), mk('b', 'Roof Replacement'), mk('c', 'Purchase of One (1) Dump Truck'), mk('d', 'Janitorial Supplies', { status: 'dismissed' }),
  mk('e', 'Mowing Services', { pid: 'P1' }), mk('f', 'Software', { origin: 'email' }), mk('g', 'Tractor', { status: 'merged' }), { id: 'h', stub: true, title: 'Loader' }, mk('i', 'Strategic Plan RFQ')];
const pick = BI._test.cleanupPick(items, settings, true);
ok(pick.count === 3 && pick.ids.join() === 'a,c,i', 'cleanup preview picks only open watch leads failing the gate (not dismissed / merged / on a job / e-mail)', pick);
ok(pick.items[0].title === 'Compact Track Loader', 'Southaven loader is in the preview');

// the bid-notice e-mail gate: notices are gated, GC invitations are not
const L = (n, extra) => Object.assign({ project_name: n }, extra);
let g = BI._test.noticeGate({ kind: 'public_bid', leads: [L('Compact Track Loader'), L('Roof Replacement – Central Office')] });
ok(g.dropped === 1 && g.leads.length === 1 && /Roof/.test(g.leads[0].project_name), 'public_bid notice: loader dropped, roof kept', g);
g = BI._test.noticeGate({ kind: 'planroom_notice', leads: [L('Janitorial Supplies')] });
ok(g.dropped === 1 && !g.leads.length, 'planroom notice: all dropped');
g = BI._test.noticeGate({ kind: 'invitation', leads: [L('Compact Track Loader')] });
ok(g.dropped === 0 && g.leads.length === 1, 'a GC invitation is never gated');
g = BI._test.noticeGate({ kind: 'gc_direct', leads: [L('Bid 24-117')] });
ok(g.dropped === 0, 'gc_direct is kept');

console.log((fail ? 'FAILED ' : 'PASS ') + pass + ' ok, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
