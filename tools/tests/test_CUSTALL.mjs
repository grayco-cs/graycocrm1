// test_CUSTALL.mjs <build-dir> — patch CUSTALL: every customer that enters the CRM goes on the Customers list.
// Each entry path (new job, a lead typed here, a lead synced in from a server function, a client invoice, an estimate)
// creates or links exactly one customer; a known phone / e-mail links the existing one; only empty fields are filled;
// a returning customer at a new address = same customer, new property (2 jobs, untouched); a new owner at an old
// address = a new customer; a name-only match is not auto-linked; subs, GCs on bid leads, staff and test names are
// skipped; the backfill's dry run, then the real run; no page errors.
// One headless browser, the offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), made-up data.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, cset, cget, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_CUSTALL.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

resetCloud();
const now = '2026-09-01T15:00:00.000Z';   /* the records already in the CRM are older than 3 days: they wait for the backfill */
cset('users', [{ id: 'u1', name: 'Wes Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sarah Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '901-555-0101' }]);
cset('subs', [{ id: 'S1', name: 'Ace Drywall LLC', phone: '901-555-0300', email: 'ace@example.com', trade: 'Drywall' }]);
cset('customers', [
  { id: 'CU1', name: 'Hannah Brooks', phone: '901-555-0111', email: 'hannah@example.com', address: '100 Oak St, Bartlett TN', source: 'QuickBooks', savedAt: now, updatedAt: now },
  { id: 'CU2', name: 'Marcus Lee', phone: '', email: '', address: '', company: '', source: 'QuickBooks', savedAt: now, updatedAt: now },
  { id: 'CU3', name: 'Dana Fox', phone: '(901) 555-0177', email: '', address: '9 Elm St, Memphis TN', source: 'QuickBooks', savedAt: now, updatedAt: now }]);
cset('projects', [
  { id: 'P1', po: 'PO-1', name: 'Brooks Kitchen', client: 'Hannah Brooks', customerId: 'CU1', clientPhone: '901-555-0111', address: '100 Oak St, Bartlett TN', status: 'Active', type: 'Residential Reno', contract: 20000, savedAt: now, updatedAt: now },
  { id: 'P0', po: 'PO-0', name: 'Old Deck', client: 'Olivia Old', clientPhone: '901-555-0190', address: '3 Birch Ln, Arlington TN', status: 'completed', type: 'Residential Reno', contract: 9000, savedAt: now, updatedAt: now },
  { id: 'P0b', po: 'PO-0b', name: 'Fox Rental Roof', client: 'Dana Fox', address: '55 Pine Rd, Lakeland TN', status: 'completed', type: 'Residential Reno', contract: 7000, savedAt: now, updatedAt: now },
  { id: 'P0c', po: 'PO-0c', name: 'Untitled', client: '', address: '1 Nowhere', status: 'bidding', type: 'Residential Reno', savedAt: now, updatedAt: now }]);
cset('leads', [
  { id: 'L0', name: 'Victor Vale', phone: '901-555-0191', address: '8 Cedar Cv, Cordova TN', source: 'Referral', status: 'new', savedAt: now, updatedAt: now },
  { id: 'L0b', name: 'Big School Reno', source: 'PlanHub', company: 'Turner Construction', dueToCompany: 'Turner Construction', bidDue: '2026-11-20', leadKind: 'Commercial', savedAt: now, updatedAt: now }]);
cset('invs', [{ id: 'I0', pid: 'P0', type: 'client', client: 'Olivia Old', amt: 9000, status: 'Paid', savedAt: now, updatedAt: now },
  { id: 'I0s', pid: 'P0', type: 'sub', sub: 'Ace Drywall LLC', client: 'Ace Drywall LLC', amt: 1200, status: 'Pending', savedAt: now, updatedAt: now }]);

const c = await computer('CA', { build }); const p = c.page();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
if (process.env.CA_DEBUG) p.on('console', m => { if (/reload|epoch|FLOOR|version|refresh/i.test(m.text())) console.log('    LOG ' + m.text().slice(0, 240)); });
let crashed = false; p.on('crash', () => { crashed = true; console.log('    (the page crashed)'); });
if (process.env.CA_DEBUG) { p.on('request', r => { if (r.isNavigationRequest()) console.log('    NAVREQ ' + r.url().slice(0, 120) + ' main=' + (r.frame() === p.mainFrame())); }); p.on('requestfailed', r => { if (r.isNavigationRequest()) console.log('    NAVFAIL ' + r.url().slice(0, 120) + ' ' + (r.failure() || {}).errorText); }); }
let navs = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) { navs++; if (process.env.CA_DEBUG) console.log('    (page loaded ' + new Date().toISOString().slice(11, 19) + ')'); } });
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await waitFor(c, () => window._gcCustAllCore && window._gcCustAllSaw && (window._crm && window._crm.projects || []).length >= 4, null, 60000)), 'the CRM loads with the rule');
  for (let last = -1, t0 = Date.now(); last !== navs && Date.now() - t0 < 90000; ) { last = navs; await sleep(8000); }   /* the first sign-in reloads the page a few times: wait until it has settled */
  await waitFor(c, () => window._gcCustAllSaw && typeof window._setCustomers === 'function' && (window._crm && window._crm.projects || []).length >= 4, null, 60000); await sleep(2500);
  /* the CRM's own lists, read through its setters; the harness page sometimes reloads itself: wait for it and read again */
  const ready = () => waitFor(c, () => window._gcCustAllSaw && typeof window._setCustomers === 'function' && (window._crm && window._crm.projects || []).length >= 4, null, 60000);
  const read = async name => { for (let i = 0; ; i++) { try { return await c.ev(n => new Promise(r => { const set = (n === '_setCustomers' ? window.__gcSetCustomersNow : null) || window[n]; set(prev => { r(JSON.parse(JSON.stringify(prev || []))); return prev; }); }), name); } catch (e) { if (crashed || i > 6 || !/context was destroyed|navigation/i.test(String(e))) throw e; await sleep(4000); await ready(); await sleep(2000); } } };
  const custs = () => read('_setCustomers'), jobs = () => read('_setProjects');
  const n0 = (await custs()).length;
  ok(n0 === 3, 'loading adds nothing by itself (old records wait for the backfill)', n0);

  /* 1. a new job (desktop / Field / Activate all save through the job list) */
  const add = async (key, recs) => { await c.ev(([k, rs]) => { const set = { projects: window._setProjects, leads: window._setLeads, invs: window._setInvoices, estimates: window._gcSetEstimates }[k]; set(prev => (prev || []).concat(rs)); }, [key, recs]); await sleep(1800); };
  await add('projects', [{ id: 'P2', po: 'PO-2', name: 'New Bath', client: 'Rita New', clientPhone: '(901) 555-0200', clientEmail: 'Rita@Example.com', address: '1 Maple Ave, Germantown TN', status: 'Active', type: 'Residential Reno', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  let cs = await custs(), js = await jobs();
  const rita = cs.filter(x => x.name === 'Rita New');
  const idRita = await c.ev(() => window._gcCustAllCore.idFor({ email: 'rita@example.com' }));
  if (process.env.CA_DEBUG) console.log('    state', JSON.stringify(await c.ev(() => window._gcCustAllState())));
  ok(rita.length === 1 && rita[0].id === idRita && rita[0].phone === '(901) 555-0200' && rita[0].email === 'rita@example.com', 'a new job adds one customer with a hashed id (the same on every computer)', rita);
  ok(js.find(x => x.id === 'P2').customerId === idRita, 'the job is linked to it (customerId)');

  /* 2. returning customer, new address (same e-mail, other name spelling): same customer, a new property, 2 jobs untouched */
  await add('projects', [{ id: 'P3', po: 'PO-3', name: 'Lake House Deck', client: 'Hannah B.', clientEmail: 'HANNAH@example.com', address: '200 Lake Rd, Cordova TN', status: 'Active', type: 'Residential Reno', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  cs = await custs(); js = await jobs();
  const h = cs.filter(x => x.id === 'CU1')[0];
  ok(cs.length === n0 + 1 && h.address === '100 Oak St, Bartlett TN' && h.name === 'Hannah Brooks' && (h.properties || []).length === 1 && /200 Lake Rd/.test(h.properties[0].address), 'same e-mail → the existing customer; the new address is a second property, the customer’s own address stays', h);
  const p1 = js.find(x => x.id === 'P1'), p3 = js.find(x => x.id === 'P3');
  ok(p1.address === '100 Oak St, Bartlett TN' && p1.name === 'Brooks Kitchen' && p3.address === '200 Lake Rd, Cordova TN' && p3.client === 'Hannah B.' && p3.customerId === 'CU1' && js.length === 6, 'both jobs stay separate and untouched (only the customerId link)', { p1, p3 });
  const prof = await c.ev(() => window._gcCustomer360('CU1').then(() => { const ov = document.querySelector('.gcd1-ov'); const t = ov ? ov.innerText : ''; if (ov) ov.remove(); return t; }));
  ok(/Brooks Kitchen/.test(prof) && /Lake House Deck/.test(prof) && /100 Oak St/.test(prof) && /200 Lake Rd/.test(prof), 'her profile shows both jobs and both properties');

  /* 3. a phone match fills only empty fields */
  await add('projects', [{ id: 'P5', po: 'PO-5', name: 'Fox Porch', client: 'Dana Fox', clientPhone: '901.555.0177', clientEmail: 'dana@example.com', address: '77 New St, Memphis TN', status: 'Active', type: 'Residential Reno', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  cs = await custs();
  const dn = cs.find(x => x.id === 'CU3');
  ok(cs.length === n0 + 1 && dn.email === 'dana@example.com' && dn.phone === '(901) 555-0177' && dn.address === '9 Elm St, Memphis TN' && /77 New St/.test(JSON.stringify(dn.properties)), 'same phone → the empty e-mail is filled; the typed phone and address are kept', dn);

  /* 4. a name-only match is not linked; 5. a new owner at an old address is a new customer */
  await add('projects', [{ id: 'P4', po: 'PO-4', name: 'Lee Fence', client: 'Marcus Lee', address: '5 Ash Ct, Bartlett TN', status: 'Active', type: 'Residential Reno', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'P6', po: 'PO-6', name: 'Oak St Paint', client: 'Greg Newowner', address: '100 Oak St, Bartlett TN', status: 'Active', type: 'Residential Reno', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  cs = await custs(); js = await jobs();
  ok(!js.find(x => x.id === 'P4').customerId && cs.filter(x => /Marcus Lee/.test(x.name)).length === 1 && !cs.find(x => x.id === 'CU2').address, 'a name-only match is not auto-linked (and nothing is copied onto that customer)');
  const g = cs.filter(x => x.name === 'Greg Newowner');
  ok(g.length === 1 && g[0].id !== 'CU1' && js.find(x => x.id === 'P6').customerId === g[0].id, 'a different person at a known address (a new owner) is a new customer', g);

  /* 6. not customers: a sub, staff, a test name, a GC on a bid lead */
  const before = (await custs()).length;
  await add('projects', [{ id: 'P7', name: 'x', client: 'Ace Drywall LLC', address: '1 A St', status: 'Active', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'P8', name: 'x', client: 'Sarah Biffle', address: '2 B St', status: 'Active', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'P9', name: 'x', client: 'Thomas Family Construction LLC (Sample Customer)', address: '3 C St', status: 'bidding', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  await add('leads', [{ id: 'L9', name: 'Airport Hangar Reno', source: 'BuildingConnected', company: 'Flintco LLC', contactName: 'Pat Estimator', dueToCompany: 'Flintco LLC', bidDue: '2026-12-01', leadKind: 'Commercial', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  ok((await custs()).length === before, 'subs, staff, test names and GCs / contacts on bid leads are skipped');

  /* 7. leads: typed here, and synced in from server functions (website form, a text message) — one customer for both */
  await add('leads', [{ id: 'LW1', title: 'Kitchen remodel — Wendy Web', name: 'Kitchen remodel — Wendy Web', source: 'Website (grayco-cs.com)', websiteLead: true, inboxId: 'website|abc', contact: { name: 'Wendy Web', email: 'wendy@example.com', phone: '901-555-0222' }, address: '12 Vine St, Collierville TN', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  await add('leads', [{ id: 'LS1', name: 'Text from 901-555-0222', source: 'Text message', inboxId: 'website|def', websiteLead: true, contactName: 'Wendy W', phone: '9015550222', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  cs = await custs();
  const wen = cs.filter(x => /^Wendy/.test(x.name));
  ok(wen.length === 1 && wen[0].name === 'Wendy Web' && wen[0].phone === '901-555-0222', 'a website lead adds the customer; a text from the same phone links to it (no second one)', wen);
  await add('leads', [{ id: 'LM1', name: 'Missed call', source: 'Missed call', websiteLead: true, contactName: 'Caller', phone: '901-555-0444', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  ok(!(await custs()).some(x => /0444/.test(x.phone || '')), 'a missed call with no name is not a customer yet (no junk names)');

  /* 8. a client invoice for the new job links to its customer; an estimate adds its customer */
  const n8 = (await custs()).length;
  await add('invs', [{ id: 'I2', pid: 'P2', type: 'client', client: 'Rita New', amt: 5000, status: 'Draft', savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  ok((await custs()).length === n8, 'a client invoice for a linked job adds no second customer');
  await add('estimates', [{ id: 'E1', name: 'Garage', client: 'Evan Est', clientPhone: '901-555-0233', address: '4 Dogwood Dr, Bartlett TN', lines: [], savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  ok((await custs()).filter(x => x.name === 'Evan Est').length === 1, 'a saved estimate adds its customer');

  /* 9. idempotent: the same job saved again (another computer, a sync) adds nothing */
  const n9 = (await custs()).length;
  await c.ev(() => window._setProjects(prev => prev.map(x => x.id === 'P2' ? Object.assign({}, x, { status: 'completed', updatedAt: new Date().toISOString() }) : x))); await sleep(900);
  ok((await custs()).length === n9, 'saving the job again adds nothing');

  /* 10. the backfill: dry run first, then one tap */
  await c.ev(() => window._setView('customers')); await sleep(1500);
  const btn = await c.ev(() => { const b = document.querySelector('[data-gc-custall]'); return b ? b.textContent : ''; });
  ok(/Add every missing customer \(\d+\)/.test(btn), 'the Customers screen has the button: ' + btn);
  const n10 = (await custs()).length;
  const dry = await c.ev(() => { document.querySelector('[data-gc-custall]').click(); const ov = document.getElementById('gc-custall'); return { txt: ov ? ov.innerText : '', checks: ov ? ov.querySelectorAll('select[data-ck]').length : 0 }; });
  ok(/Dry run/.test(dry.txt) && /Olivia Old/.test(dry.txt) && /Victor Vale/.test(dry.txt) && /possible same customer/.test(dry.txt) && !/Ace Drywall|Turner|Big School|Sample Customer/.test(dry.txt), 'the dry run lists the old customers (new / matched / check), not subs, GCs or test names', dry.txt.slice(0, 900));
  ok((await custs()).length === n10, 'the dry run saves nothing');
  await c.ev(() => document.querySelector('#gc-custall [data-go]').click()); await sleep(1000);
  cs = await custs(); js = await jobs();
  const ol = cs.filter(x => x.name === 'Olivia Old'), vv = cs.filter(x => x.name === 'Victor Vale');
  ok(ol.length === 1 && vv.length === 1 && js.find(x => x.id === 'P0').customerId === ol[0].id, 'one tap adds them (one Olivia for her job + invoice, Victor from his lead) and links the old job', { ol, vv });
  ok(!js.find(x => x.id === 'P0b').customerId && !js.find(x => x.id === 'P4').customerId, 'same-name rows a person left alone stay unlinked', { P0b: js.find(x => x.id === 'P0b'), P4: js.find(x => x.id === 'P4') });
  const again = await c.ev(() => window._gcCustAllPlan().tally.newCustomers);
  ok(again === 0, 'after the run nothing new is missing', again);
  ok(!errs.length, 'no page errors', errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
await c.b.close();
console.log(`CUSTALL ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
