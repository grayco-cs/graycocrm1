// test_LEADFIX.mjs <build-dir> — patch LEADFIX, no browser, made-up data only.
//   The Lead Inbox import (importItems / fromItem, lifted out of index.html as it is) run on a small list:
//   a new inbox item ahead of an older item with a new revision must not put the older item's bid fields on
//   the CompanyCam / QuickBooks lead next to it; a shared inbox id updates nobody but the item's own lead;
//   a lead from another source is never re-used by name.
//   On r14d (before the patch) the first checks FAIL — that is the bug.
import fs from 'fs';
import path from 'path';
const build = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };

const A = html.indexOf("function leadIdOf(it){ return 'LEADIN-'");
const B = html.indexOf('function normName(t){', A);
const C = html.indexOf('\n', B);
if (A < 0 || B < 0) { console.log('FAILED could not find the Lead Inbox import in index.html'); process.exit(1); }
const seg = html.slice(A, C);

function make(){
  const box = { list: [], toasts: [], acts: [] };
  const win = { _gcBidRole: null, _gcLeadHold: null };
  const f = new Function('box', 'window', `
    var s = function(v){ return v == null ? '' : String(v); }, low = function(v){ return s(v).toLowerCase(); }, arr = function(v){ return Array.isArray(v) ? v : []; };
    var T = Date.UTC(2026, 9, 29, 12); var nowIso = function(){ return new Date(T += 1000).toISOString(); }, today = function(){ return '2026-10-29'; };
    function stamp(r){ r.updatedAt = r.savedAt = nowIso(); return r; }
    var KIND = { commercial: 'Commercial', insurance: 'Insurance', residential: 'Residential', government: 'Government' };
    var PIPE_TYPE = { commercial: 'Commercial Reno', insurance: 'Insurance Claim', residential: 'Residential Reno', government: 'Commercial Reno' };
    var S = { items: [] };
    function setLeads(mut){ var n = mut(box.list.slice()); if (Array.isArray(n)) box.list = n; return Promise.resolve(!!n); }
    function tomb(){ return false; } function later(){} function act(b){ box.acts.push(b); } function heal(){} function addPlansToJob(){}
    function toast(m){ box.toasts.push(m); } function isAdmin(){ return true; } function emit(){} function render(){} function badge(){} function alertNew(){}
    function hydrated(){ return Promise.resolve(); } function readList(){} function lsGet(k, d){ return d; } function lsSet(){} function flushOut(){ return Promise.resolve(); }
    function api(){ return Promise.reject(new Error('no server in this test')); }
    ${seg}
    function leads(){ return box.list; } function myName(){ return 'Demo Admin'; }
    return { importItems: importItems, setItems: function(x){ S.items = x; }, lfPlan: typeof lfPlan === 'function' ? lfPlan : null };`);
  return { box, win, M: f(box, win) };
}
const bidItem = (h, rev, extra) => Object.assign({ id: 'LI-' + h, rev, status: 'imported', title: 'Demo bid ' + h, type: 'government', source: 'BuildingConnected', gc: 'Demo GC ' + h, owner: 'Demo Owner ' + h, city: 'Democity', state: 'TN',
  trades: ['Roofing'], scope: 'demo scope ' + h, contact: { name: 'Demo Estimator', phone: '9015550' + h.slice(0, 3), email: 'est' + h + '@example.com' }, bidDue: '2026-11-10', bidRole: 'sub', dueToCompany: 'Demo GC ' + h,
  plansLinks: [{ url: 'https://example.com/' + h, label: 'plans' }], files: [{ ref: 'sb:demo/' + h + '.pdf', name: h + '.pdf' }], emails: [{ subject: 'Invite ' + h, from: 'x@example.com' }], sources: [{ name: 'BuildingConnected' }] }, extra || {});
const ownLead = (h, rev) => ({ id: 'LEADIN-' + h, name: 'Demo bid ' + h, inboxId: 'LI-' + h, inboxRev: rev, gc: 'Demo GC ' + h, createdBy: 'Lead Inbox', source: 'BuildingConnected', stage: 'New Lead' });
const ccLead = { id: 'LEADmsgdemo1', name: 'Demo Homeowner', source: 'CompanyCam', ccamId: 'cc-demo-1', phone: '', email: '', address: '', stage: 'Contacted' };
const qbLead = { id: 'LQB_QB_demo_1', name: 'Demo Customer', source: 'QuickBooks', qbId: 'qb-demo-1', stage: 'New Lead' };
const BID_FIELDS = ['gc', 'owner', 'city', 'scope', 'inboxId', 'bidDue', 'bidRole', 'dueToCompany', 'plansLinks', 'docs', 'emails', 'sources', 'phone', 'email', 'address'];
const dirty = l => BID_FIELDS.filter(f => { const v = l[f]; return Array.isArray(v) ? v.length > 0 : !!v; });

/* 1. the r14d bug: one new item first (the server's newest-first list), then an older item with a new revision */
{
  const { box, M } = make();
  box.list = [ccLead, ownLead('aaaa1111', 1), qbLead, ownLead('bbbb2222', 1)].map(x => Object.assign({}, x));
  M.setItems([bidItem('cccc3333', 1, { status: 'new' }), bidItem('aaaa1111', 2), bidItem('bbbb2222', 2)]);
  await M.importItems();
  const by = Object.fromEntries(box.list.map(l => [l.id, l]));
  ok(box.list.length === 5 && box.list[0].id === 'LEADIN-cccc3333', 'the new item became one new lead, on top', box.list.map(l => l.id));
  ok(dirty(by.LEADmsgdemo1).length === 0, 'the CompanyCam lead got no bid fields', dirty(by.LEADmsgdemo1).map(f => f + '=' + JSON.stringify(by.LEADmsgdemo1[f]).slice(0, 40)));
  ok(dirty(by.LQB_QB_demo_1).length === 0, 'the QuickBooks lead got no bid fields', dirty(by.LQB_QB_demo_1).map(f => f + '=' + JSON.stringify(by.LQB_QB_demo_1[f]).slice(0, 40)));
  ok(by['LEADIN-aaaa1111'].inboxRev === 2 && by['LEADIN-aaaa1111'].scope === 'demo scope aaaa1111', 'LEADIN-aaaa1111 got its own revision 2', by['LEADIN-aaaa1111']);
  ok(by['LEADIN-bbbb2222'].inboxRev === 2 && by['LEADIN-bbbb2222'].inboxId === 'LI-bbbb2222', 'LEADIN-bbbb2222 got its own revision 2 (and kept its inbox id)', by['LEADIN-bbbb2222']);
  const holders = {}; box.list.forEach(l => { if (l.inboxId) (holders[l.inboxId] = holders[l.inboxId] || []).push(l.id); });
  ok(Object.values(holders).every(v => v.length === 1), 'every inbox id is on exactly one lead', holders);
}
/* 2. many new items (a computer putting 100 leads back) ahead of updates */
{
  const { box, M } = make();
  const base = [];
  for (let i = 0; i < 20; i++) base.push(i % 2 ? ownLead('own' + String(i).padStart(5, '0'), 1) : Object.assign({}, qbLead, { id: 'LQB_QB_demo_' + i, name: 'Demo Customer ' + i }));
  box.list = base.map(x => Object.assign({}, x));
  const items = [];
  for (let i = 0; i < 7; i++) items.push(bidItem('new' + String(i).padStart(5, '0'), 1, { status: i % 2 ? 'imported' : 'new' }));
  for (let i = 1; i < 20; i += 2) items.push(bidItem('own' + String(i).padStart(5, '0'), 3));
  M.setItems(items);
  await M.importItems();
  const qbs = box.list.filter(l => /^LQB_/.test(l.id));
  ok(box.list.length === 27, '7 new leads added, nothing lost', box.list.length);
  ok(qbs.every(l => dirty(l).length === 0), 'none of the 10 QuickBooks leads got bid fields', qbs.filter(l => dirty(l).length).map(l => l.id));
  ok(box.list.filter(l => /^LEADIN-own/.test(l.id)).every(l => l.inboxRev === 3 && l.inboxId === 'LI-' + l.id.slice(7)), 'each of the 10 inbox leads got its own revision 3');
}
/* 3. already contaminated: a shared inbox id updates only the item's own lead, and is flagged */
{
  const { box, M } = make();
  const victim = Object.assign({}, ccLead, { inboxId: 'LI-dddd4444', inboxRev: 1, gc: 'Demo GC dddd4444' });
  box.list = [victim, ownLead('dddd4444', 1)].map(x => Object.assign({}, x));
  M.setItems([bidItem('dddd4444', 2, { scope: 'revised scope' })]);
  await M.importItems();
  const by = Object.fromEntries(box.list.map(l => [l.id, l]));
  ok(by['LEADIN-dddd4444'].scope === 'revised scope' && by['LEADIN-dddd4444'].inboxRev === 2, 'the item\'s own lead is updated');
  ok(by.LEADmsgdemo1.inboxRev === 1 && by.LEADmsgdemo1.scope !== 'revised scope', 'the other lead holding the same inbox id is NOT updated', by.LEADmsgdemo1);
  ok(box.toasts.some(t => /not theirs/.test(t)), 'an admin is told (one toast)', box.toasts);
}
{
  const { box, M } = make();   /* no own lead, two holders -> nobody updated, nothing new made */
  box.list = [Object.assign({}, ccLead, { inboxId: 'LI-eeee5555', inboxRev: 1 }), Object.assign({}, qbLead, { inboxId: 'LI-eeee5555', inboxRev: 1 })];
  M.setItems([bidItem('eeee5555', 2)]);
  await M.importItems();
  ok(box.list.length === 2 && box.list.every(l => l.inboxRev === 1 && !l.scope), 'two leads on one inbox id and no own lead: neither is updated, no lead is made', box.list);
}
{
  const { box, M } = make();   /* another item's LEADIN lead holding this inbox id is not this item's lead */
  box.list = [Object.assign(ownLead('ffff6666', 1), { inboxId: 'LI-gggg7777' })];
  M.setItems([bidItem('gggg7777', 2)]);
  await M.importItems();
  ok(box.list.length === 1 && box.list[0].inboxRev === 1 && box.list[0].gc === 'Demo GC ffff6666', 'LEADIN-ffff6666 is never updated from LI-gggg7777', box.list[0]);
}
/* 4. by name: a CompanyCam / QuickBooks / typed-in lead with the same name is never re-used */
{
  const { box, M } = make();
  box.list = [Object.assign({}, ccLead, { name: 'Demo bid hhhh8888' }), Object.assign({}, qbLead, { name: 'Demo bid iiii9999' }), { id: 'Lmanual1', name: 'Demo bid jjjj0000', createdBy: 'Demo PM' }];
  M.setItems([bidItem('hhhh8888', 1, { status: 'new', city: '' }), bidItem('iiii9999', 1, { status: 'new', city: '' }), bidItem('jjjj0000', 1, { status: 'new', city: '' })]);
  await M.importItems();
  const by = Object.fromEntries(box.list.map(l => [l.id, l]));
  ok(dirty(by.LEADmsgdemo1).length === 0 && dirty(by.LQB_QB_demo_1).length === 0 && !by.Lmanual1.inboxId, 'same-name CompanyCam / QuickBooks / typed-in leads keep their own fields');
  ok(!!by['LEADIN-hhhh8888'] && !!by['LEADIN-iiii9999'] && !!by['LEADIN-jjjj0000'], 'each item got its own lead instead');
}
{
  const { box, M } = make();   /* an older inbox import that lost its link is still re-attached by name */
  box.list = [{ id: 'LEADIN-oldkkkk', name: 'Demo bid kkkk1111', createdBy: 'Lead Inbox', city: 'Democity' }];
  M.setItems([bidItem('kkkk1111', 1, { status: 'new' })]);
  await M.importItems();
  ok(box.list.length === 1 && box.list[0].inboxId === 'LI-kkkk1111' && box.list[0].inboxLinked === 'LI-kkkk1111', 'an older inbox import with the same name is re-linked (no second lead)', box.list);
  M.setItems([bidItem('kkkk1111', 2, { status: 'imported', scope: 'rev 2' })]);
  await M.importItems();
  ok(box.list.length === 1 && box.list[0].scope === 'rev 2', 'and it keeps getting that item\'s revisions', box.list);
}
/* 5. lookups by inbox id (approvals, assign, on-call, the hold run) prefer the item's own lead */
{
  const { win } = make();
  const B = win._gcLeadByInbox, O = win._gcOwnInboxId;
  ok(typeof B === 'function' && typeof O === 'function', 'window._gcLeadByInbox / _gcOwnInboxId exist');
  if (typeof B === 'function') {
    const victim = Object.assign({}, ccLead, { inboxId: 'LI-mmmm1111' }), own = ownLead('mmmm1111', 1);
    ok(B([victim, own], 'LI-mmmm1111') === own && B([own, victim], 'LI-mmmm1111') === own, 'an inbox id finds LEADIN-<hash>, wherever it is in the list');
    ok(B([victim], 'LI-mmmm1111') === null, 'a CompanyCam lead holding the id is never "the" lead for it');
    ok(B([Object.assign(ownLead('nnnn2222', 1), { inboxId: 'LI-mmmm1111' })], 'LI-mmmm1111') === null, 'another item\'s LEADIN lead holding the id is not it either');
    ok(O(victim) === '' && O(own) === 'LI-mmmm1111', 'only the own lead may speak for the inbox item (assign / dismiss / job / publish)');
    ok(B([victim, own], 'LEADmsgdemo1') === victim, 'a lead id still finds that lead');
  }
}
{
  const { createRequire } = await import('module'); const require = createRequire(import.meta.url);
  const LH = require(path.join(build, 'netlify/functions/_lib/lead-hold.js'));
  const t = Date.parse('2026-10-29T23:00:00Z');
  const it = { id: 'LI-pppp3333', status: 'imported', hold: { state: 'held', until: '2026-10-29T22:00:00Z', name: 'Demo PM' } };
  const own = Object.assign(ownLead('pppp3333', 1), { hold: { state: 'held', until: '2026-10-29T22:00:00Z', name: 'Demo PM' } });
  const victim = Object.assign({}, qbLead, { inboxId: 'LI-pppp3333', pm: 'Someone Else' });
  const r = LH.dueItems([it], [own, victim], t);
  ok(r.assign.length === 1 && !r.drop.length, 'the hold run reads the item\'s own lead, not a QuickBooks lead holding its id (_lib/lead-hold.js)', r);
  const P = html.indexOf('/* LEADHOLD-CORE-BEGIN */'), Q = html.indexOf('/* LEADHOLD-CORE-END */');
  const fsrc = fs.readFileSync(path.join(build, 'netlify/functions/_lib/lead-hold.js'), 'utf8');
  const line = l => l.split('\n').find(x => /byInbox\[l\.inboxId\] = l/.test(x));
  ok(P > 0 && line(html.slice(P, Q)) === line(fsrc), 'the page\'s copy of the hold rule has the same line');
}
/* 6. the repair plan (LEADFIX-2): a dry run that gives the contaminated leads back their own values, the true owner untouched */
{
  const { box, win, M } = make();
  ok(typeof M.lfPlan === 'function' && typeof win._gcLeadFixRepair === 'function', 'lfPlan and window._gcLeadFixRepair exist');
  if (typeof M.lfPlan === 'function') {
    const own = Object.assign(ownLead('qqqq1111', 2), { phone: '9015550qqq', email: 'estqqqq1111@example.com', city: 'Democity', dueToCompany: 'Demo GC qqqq1111', bidDue: '2026-11-10', scope: 'demo scope' });
    const clean = Object.assign({}, ccLead, { stage: 'Contacted', city: 'Hometown' });
    const dirtyCC = Object.assign({}, clean, { stage: 'Bidding', inboxId: 'LI-qqqq1111', inboxRev: 2, gc: 'Demo GC qqqq1111', city: 'Democity', phone: '9015550qqq', email: 'estqqqq1111@example.com', dueToCompany: 'Demo GC qqqq1111', bidDue: '2026-11-10', scope: 'demo scope', bidRole: 'sub',
      docs: [{ ref: 'sb:demo/x.pdf' }, { ref: 'sb:demo/mine.pdf', addedBy: 'Demo PM' }], plansLinks: [{ url: 'https://example.com/p' }] });
    const dirtyIn = Object.assign(ownLead('rrrr2222', 1), { inboxId: 'LI-qqqq1111', inboxRev: 2, gc: 'Demo GC qqqq1111', dueToCompany: 'Demo GC qqqq1111', phone: '9015550qqq' });
    box.list = [own, dirtyCC, dirtyIn].map(x => JSON.parse(JSON.stringify(x)));
    const before = JSON.stringify(box.list);
    const P = M.lfPlan(box.list, { base: { LEADmsgdemo1: clean }, first: { LEADmsgdemo1: clean }, baseFrom: { LEADmsgdemo1: 'demo mirror' } });
    const r1 = P.rows.find(r => r.id === 'LEADmsgdemo1'), r2 = P.rows.find(r => r.id === 'LEADIN-rrrr2222');
    ok(P.rows.length === 2 && !P.rows.some(r => r.id === 'LEADIN-qqqq1111'), 'two leads to repair; the item\'s own lead is not touched', P.rows.map(r => r.id));
    const a1 = r1 && r1.after;
    ok(a1 && !a1.inboxId && !a1.gc && !a1.dueToCompany && !a1.bidDue && !a1.bidRole && !a1.scope && !a1.phone && !a1.email && !(a1.plansLinks || []).length, 'the CompanyCam lead: no inbox id, GC, due date, bidRole, scope, plans; the bid contact\'s phone / e-mail gone', a1);
    ok(a1 && a1.city === 'Hometown' && a1.stage === 'Contacted' && (a1.docs || []).length === 1 && a1.docs[0].addedBy, 'its own city and the stage of its clean copy are back; the file a person added stays', a1);
    const a2 = r2 && r2.after;
    ok(a2 && a2.inboxId === 'LI-rrrr2222' && a2.inboxRev === 0 && !a2.gc && !a2.dueToCompany && !a2.phone, 'an inbox lead with no clean copy: back on its own item (re-read on the next pull), the other item\'s values gone', a2);
    ok(r2 && r2.unsure.length > 0, '... and marked "owner to check"');
    ok(JSON.stringify(box.list) === before, 'the plan changes nothing');
    const dry = await win._gcLeadFixRepair({ dryRun: true });
    ok(dry && dry.rows.length === 2 && JSON.stringify(box.list) === before, '_gcLeadFixRepair({ dryRun: true }) only reports');
    let refused = ''; try { await win._gcLeadFixRepair({ dryRun: false }); } catch (e) { refused = e.message; }
    ok(/confirm/.test(refused) && JSON.stringify(box.list) === before, 'a real run needs confirm: "REPAIR 2" (nothing changed without it)', refused);
  }
}
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
