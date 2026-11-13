// test_INBOXNEWJOB.mjs <build-dir> [mirror.json] — patch INBOXNEWJOB (office 11/05: "The job on the invoice says Enterprise.
// Need to be able to create a job."). The office (office@grayco-cs.com) on the read-only mirror + one unplaced supplier bill
// (Farrell Calhoun Paint, $93.11, PO "ENTERPRISE"):
//   1. 📥 Needs a job lists it; its job picker has "＋ New job…";
//   2. picking it opens the form prefilled (name "Enterprise", PO "ENTERPRISE", Active); Create job → the job is selected;
//   3. Save books the bill on the new job; the job exists (on the screen and in the cloud) with PO ENTERPRISE, Active;
//   4. the PO is remembered: the next ENTERPRISE bill goes to that job; the crew may not make jobs.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs). Run under the scratchpad's browser_lock.sh.
import path from 'path'; import fs from 'fs'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud } = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

resetCloud(); for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const V = k => { const v = (cloud.get(k) || {}).value; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) {} } return v; };
const put = (k, v) => cloud.set(k, { key: k, value: v, updated_at: new Date().toISOString() });
const bill = (id, amt) => ({ id, kind: 'supplier_invoice', at: '2026-11-04T15:00:00.000Z', from: 'billing@fcpaint.example', fromName: 'Farrell Calhoun Paint', subject: 'Invoice ' + id, files: [],
  si: { payee: 'supplier', route: 'match', why: 'no job matched (PO "ENTERPRISE" is not a CRM job)', top: [], read: { vendor: 'Farrell Calhoun Paint', total: amt, po: 'ENTERPRISE', invoiceDate: '2026-11-04', invoiceNumber: id } } });
const B1 = bill('MM-inj0000000000001', 93.11);
put('gc_mail_money', JSON.stringify([B1])); put('gc_mail_money_done', {});
put('projects', (V('projects') || []).filter(p => !(p && /^enterprise$/i.test(String(p.autoPO || p.po || '')))));

const c = await computer('OFF', { build }); const p = c.page(); await p.setViewportSize({ width: 1280, height: 800 });
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill('office@grayco-cs.com'); await p.locator('#gc-auth-password').fill(ACCOUNTS['office@grayco-cs.com'].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
await sleep(15000);
ok(await p.evaluate(() => window._gcCanCreateProject()), 'the office may create projects (_gcCanCreateProject)');
let inList = await waitFor(c, id => (window._gcMoney.needs() || []).some(x => x.id === id) || null, B1.id, 30000, 1000).catch(() => null);
if (!inList) { console.log('   (the mail list had not loaded the seeded bill: handing it to MONEYBOX directly)'); await p.evaluate(b => window._gcMoney.process([b], {}), B1); }
ok(await p.evaluate(id => (window._gcMoney.needs() || []).some(x => x.id === id), B1.id), '📥 Needs a job lists the Farrell Calhoun Paint bill');

/* 1–2. the picker and the form */
await p.evaluate(() => window._gcMoney.openNeeds()); await sleep(800);
const ri = await p.locator('.gc-money-ov [data-i]').filter({ hasText: 'Farrell Calhoun Paint' }).first().getAttribute('data-i');
const row = p.locator('.gc-money-ov [data-i="' + ri + '"]');
const sel = row.locator('select[data-m="job"]');
const opts = await sel.evaluate(s => [...s.options].slice(0, 3).map(o => o.value + '|' + o.textContent));
ok(opts[1] === '__newjob|➕ New project…', 'the job picker offers "➕ New project…" first (patch NEWPROJ\'s form)', opts);
await sel.selectOption('__newjob');
await p.waitForSelector('#gc-np-ov', { timeout: 5000 });
const pre = await p.evaluate(() => { const q = k => document.querySelector('#gc-np-ov [data-np="' + k + '"]'); return { name: q('name').value, po: q('po').value, status: q('status').value, type: q('type').value, custs: document.querySelectorAll('#gc-np-custs option').length }; });
ok(pre.name === 'Enterprise' && pre.po === 'ENTERPRISE' && pre.status === 'active', 'the form: name "Enterprise", PO "ENTERPRISE", Active', pre);
ok(pre.custs > 0, 'the customer field searches the existing customers', pre.custs);
await p.locator('#gc-np-ov [data-np="ok"]').click(); await sleep(800);
if (await p.locator('#gc-np-ov [data-np="ok"]').count()) { await p.locator('#gc-np-ov [data-np="ok"]').click(); await sleep(800); }   /* a close match: the second click */
const pid = await p.evaluate(() => ((window._crm.projects || []).find(x => x && x.name === 'Enterprise' && x.createdVia === 'invoice-entry') || {}).id || '');
ok(/^PRJ/.test(pid) && !(await p.locator('#gc-np-ov').count()), 'Create → the new job is made and chosen', pid);

/* 3. booked at once (patch NEWPROJ presses the row's Save) */
await sleep(1500);
const saved = (await row.innerText()).trim();
ok(/✓ Saved on Enterprise/.test(saved), 'Save → "✓ Saved on Enterprise"', saved);
const st = await p.evaluate(([pid, mid]) => { const j = (window._crm.projects || []).find(x => x.id === pid) || null; const e = (window._crm.expenses || []).find(x => x.mailId === mid) || null;
  return { j: j && { name: j.name, autoPO: j.autoPO, po: j.po, status: j.status, pm: j.pm || '', needsPm: !!j.needsPm, createdBy: j.createdBy, auto: !!j.auto }, e: e && { pid: e.pid, amt: e.amt, po: e.po, vendor: e.vendor } }; }, [pid, B1.id]);
ok(st.j && st.j.name === 'Enterprise' && st.j.autoPO === 'ENTERPRISE' && /active/i.test(st.j.status) && st.j.createdBy && st.j.auto, 'the job exists: Enterprise · PO ENTERPRISE · Active (made like "＋ New project": stamped, ⚡ automations)', st.j);
ok(st.j && !st.j.pm && st.j.needsPm, 'the office making it: no PM forced (needs a PM, the owners assign it)', st.j);
ok(st.e && st.e.pid === pid && st.e.amt === 93.11 && st.e.po === 'ENTERPRISE', 'the bill is an expense on the Enterprise job ($93.11)', st.e);
await sleep(9000);
const cj = (V('projects') || []).find(x => x && x.id === pid), ce = (V('expenses') || []).find(x => x && x.mailId === B1.id), rules = V('gc_money_rules') || {};
ok(cj && cj.name === 'Enterprise', 'the cloud has the new job', cj && cj.name);
ok(ce && ce.pid === pid, 'the cloud has the expense on it', ce && ce.pid);
ok(rules['po:ENTERPRISE'] && rules['po:ENTERPRISE'].pid === pid, 'the PO is remembered (gc_money_rules po:ENTERPRISE)', rules['po:ENTERPRISE']);
const done = V('gc_mail_money_done') || {};
ok(done[B1.id] && done[B1.id].done, 'the bill is done in the inbox', done[B1.id]);

/* 4. the next ENTERPRISE bill → that job; the crew may not make jobs */
const B2 = bill('MM-inj0000000000002', 41.5);
const nx = await p.evaluate(b => { const pr = window._gcMoney.poRule(b.si); const n = window._gcMoney.process([b], {}); const e = (window._crm.expenses || []).find(x => x.mailId === b.id); return { pr, n, e: e && e.pid, auto: window._gcAutoOn ? window._gcAutoOn('mailed_invoice_booking') : null }; }, B2);
ok(nx.pr === pid && (nx.auto === false || nx.e === pid), 'the next ENTERPRISE bill goes to the Enterprise job (booked by itself when auto-booking is on, else preselected)', nx);
const crew = await p.evaluate(() => { const f = window._gcMeUser, a = window.__GC_AUTH__, o = window._gcIsOfficeFull; window._gcMeUser = () => ({ name: 'Crew Guy', role: 'Crew Lead' }); window.__GC_AUTH__ = null; window._gcIsOfficeFull = () => false;
  const r = window._gcCanCreateProject(), opt = window._gcNewJobOpt(); window._gcMeUser = f; window.__GC_AUTH__ = a; window._gcIsOfficeFull = o; return { r, opt }; });
ok(crew.r === false && crew.opt === '', 'the crew may not make jobs (no "➕ New project…")', crew);
const errs = c.errs.filter(e => /PAGEERROR/.test(e));
ok(!errs.length, 'no page errors', errs.slice(0, 5));
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
await c.b.close(); process.exit(fail ? 1 : 0);
