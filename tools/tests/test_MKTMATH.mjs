// test_MKTMATH.mjs <build-dir> — patch MKTMATH: 📣 Marketing → 📊 Dashboard numbers (owner 11/19: "It's not doing the right math").
//   A. node: tools/mktmath_core.js on made-up data asserts every formula — what is a marketing lead (bids, tests, merged,
//      deleted, cleaned-up, imported copies, LSA bad / not marked left out), the arrival day in Memphis time, close rate =
//      won ÷ decided, revenue by contract / invoiced / paid, cost per lead / per job only with spend ("no spend data" otherwise),
//      LSA good / bad / waiting + cost per good lead, bids by platform, imported duplicates, won work outside marketing.
//      The same core text is in index.html.
//   B. browser (offline harness, the same data in the cloud): an admin opens Marketing → Dashboard and sees those numbers, a "?"
//      on each, "no spend data", the Bids / LSA / Left-out cards, the basis switch (Invoiced → the invoiced total); the old
//      "Monthly by source" table built on the old math is gone; no page errors.
// Usage: node test_MKTMATH.mjs <dir with index.html>   (PARTS=A to skip the browser; GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
const PARTS = process.env.PARTS || 'A,B';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const MM = require(path.join(build, 'tools/mktmath_core.js'));

/* ── the made-up data, dated around the current month (Memphis) ── */
const NOW = MM.ctDay(Date.now()), TM = NOW.slice(0, 7), LM = MM.monthAdd(TM, -1), M3 = MM.monthAdd(TM, -3), OLD = MM.monthAdd(TM, -14);
const at = (m, d, hz) => `${m}-${String(d).padStart(2, '0')}T${hz || '15:00:00'}Z`;
const STAFF_PHONE = '(901) 555-0199', QB_PHONE = '(901) 555-0142';
function fixture(){
  const leads = [
    { id: 'L_web', name: 'Free estimate — Pat Doe', source: 'Website (grayco-cs.com)', leadSource: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, leadKind: 'Residential', stage: 'New Lead', createdAt: at(TM, 1), date: NOW },
    { id: 'L_ref', name: 'Rhea Ref', source: 'Referral', stage: 'Won', pid: 'P_ref', createdAt: at(LM, 10), type: 'Residential Reno' },
    { id: 'L_tz', name: 'Late Night Lou', howHeard: 'Google search', stage: 'Lost', status: 'lost', lostReason: 'went with another contractor', createdAt: at(TM, 1, '03:00:00') },   /* 9 PM in Memphis the day before → last month */
    { id: 'L_clean', name: 'Old Fiona', source: 'Facebook', stage: 'Lost', lostReason: 'stale — clean-up', createdAt: at(M3, 12) },
    { id: 'L_bid1', name: 'School gym — ITB', source: 'PlanHub', leadKind: 'Commercial', origin: 'email', stage: 'New Lead', createdAt: at(TM, 1, '16:00:00'), date: NOW },
    { id: 'L_bid2', name: 'County garage', source: 'BuildingConnected', leadKind: 'Government', origin: 'email', stage: 'New Lead', createdAt: at(LM, 5) },
    { id: 'L_test', name: 'TEST lead Wesley', source: 'Website (grayco-cs.com)', websiteLead: true, origin: 'website', leadKind: 'Residential', createdAt: at(TM, 1) },
    { id: 'L_staff', name: 'Somebody', phone: STAFF_PHONE, source: 'Referral', createdAt: at(TM, 1) },
    { id: 'L_merged', name: 'Pat Doe', source: 'Website (grayco-cs.com)', mergedInto: 'L_web', createdAt: at(TM, 1) },
    { id: 'L_del', name: 'Gone Gary', source: 'Referral', deleted: true, createdAt: at(TM, 1) },
    { id: 'LQB_QB_2', name: 'Imported Ivy', source: 'QuickBooks', fromProjectId: 'QB_2', stage: 'Lost', created: LM + '-20' },
    { id: 'L_lsa_good', name: 'Google LSA caller 1', source: 'Google LSA', leadSource: 'Google LSA', mkSource: 'Google Ads', lsaCheck: 'good', createdAt: at(TM, 1, '17:00:00') },
    { id: 'L_lsa_bad', name: 'Google LSA caller 2', source: 'Google LSA', lsaCheck: 'bad', stage: 'Lost', status: 'lost', lostReason: 'LSA — not a real lead (spam)', createdAt: at(TM, 1) },
    { id: 'L_lsa_pend', name: 'Google LSA caller 3', source: 'Google LSA', lsaCheck: 'pending', createdAt: at(TM, 1) },
    { id: 'L_dism', name: 'Ned Nextdoor', source: 'Nextdoor', dismissed: true, archivedWhy: 'cleanup', createdAt: at(LM, 3) },
    { id: 'L_phone', name: 'Carl Caller', phone: QB_PHONE, source: 'Phone call', stage: 'New Lead', createdAt: at(TM, 1, '18:00:00') },
    { id: 'L_old', name: 'Long Ago', source: 'Referral', stage: 'Won', createdAt: at(OLD, 10) }
  ];
  const projects = [
    { id: 'P_ref', name: 'Ref kitchen', client: 'Rhea Ref', status: 'Active', contract: 20000, type: 'Residential Reno', source: 'grayco', leadSource: 'GrayCo', created: LM + '-12', createdAt: at(LM, 12), contractSignedAt: at(LM, 14) },
    { id: 'P_direct', name: 'Water job typed in', client: 'Dee Direct', status: 'completed', contract: 8000, type: 'Insurance Claim', source: 'grayco', leadSource: 'Repeat customer', created: M3 + '-15', createdAt: at(M3, 15), completedAt: M3 + '-28' },
    { id: 'QB_1', name: 'Carl Caller', client: 'Carl Caller', phone: QB_PHONE, status: 'Active', contract: 0, type: 'Residential Reno', source: 'QuickBooks', leadSource: 'GrayCo', created: M3 + '-01' },
    { id: 'QB_2', name: 'Imported Ivy porch', client: 'Imported Ivy', status: 'completed', contract: 0, type: 'Residential Reno', source: 'QuickBooks', created: LM + '-20' },
    { id: 'QB_3', name: 'Imported Ivy porch', client: 'Imported Ivy', status: 'completed', contract: 0, type: 'Residential Reno', source: 'quickbooks', created: TM + '-01' },
    { id: 'P_bid', name: 'Office build-out', client: 'Big GC LLC', status: 'approved', contract: 50000, type: 'Commercial TI', source: 'grayco', created: LM + '-03', createdAt: at(LM, 3), approvedAt: at(LM, 9) },
    { id: 'P_sample', name: 'Acme (Sample Customer)', client: 'Acme (Sample Customer)', status: 'Active', contract: 100, type: 'Residential Reno', source: 'QuickBooks', created: TM + '-01' },
    { id: 'P_pm', name: 'PM reroof', client: 'Rita Roof', status: 'lost', contract: 0, type: 'Residential Reno', source: 'grayco', leadSource: 'Demo PM ', created: OLD + '-01', createdAt: at(OLD, 1) },
    { id: 'P_del', name: 'Deleted job', status: 'Active', contract: 900, deleted: true, created: TM + '-01' }
  ];
  const invs = [
    { id: 'I1', pid: 'P_ref', type: 'client', amt: 15000, status: 'sent', date: LM + '-20', payments: [{ amt: 10000, date: LM + '-25' }] },
    { id: 'I2', pid: 'QB_2', type: 'client', amt: 5000, status: 'paid', date: M3 + '-10' },
    { id: 'I3', pid: 'QB_3', type: 'client', amt: 5000, status: 'paid', date: M3 + '-10' },
    { id: 'I4', pid: 'P_ref', type: 'sub', amt: 7000, status: 'paid', date: LM + '-21' },
    { id: 'I5', pid: 'P_ref', type: 'client', amt: 999, status: 'void', date: LM + '-21' }
  ];
  const users = [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: STAFF_PHONE },
    { id: 'u2', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }];
  return { leads, projects, invs, users };
}

if (PARTS.includes('A')) {
  console.log('A. node — the formulas');
  const F = fixture();
  const r = MM.compute(Object.assign({}, F, { spend: [], now: NOW }));
  const ch = n => r.channels.find(c => c.channel === n) || {};
  const t = r.totals;
  ok(JSON.stringify(r.excluded) === JSON.stringify({ deleted: 2, test: 3, merged: 1, imported: 1, cleanup: 1, duplicate: 1, lsaBad: 1, lsaWait: 1 }) ||
    (r.excluded.deleted === 2 && r.excluded.test === 3 && r.excluded.merged === 1 && r.excluded.imported === 1 && r.excluded.cleanup === 1 && r.excluded.duplicate === 1 && r.excluded.lsaBad === 1 && r.excluded.lsaWait === 1),
    'left out: 2 deleted, 3 tests (TEST name, staff phone, Sample Customer), 1 merged, 1 imported copy, 1 clean-up, 1 imported duplicate, 1 LSA bad, 1 LSA waiting', r.excluded);
  ok(t.thisMonth === 3, 'this month = 3 marketing leads (website, LSA good, phone call) — not the bid, the tests, the merged copy, the LSA bad / waiting', { t: t.thisMonth, list: r.leads.filter(o => o.month === TM && !o.bid).map(o => o.id) });
  ok(t.lastMonth === 2 && ch('Google organic').lastMonth === 1, 'last month = 2 (referral + the 9 PM lead: its UTC day is this month, its Memphis day is last month)', { lm: t.lastMonth, go: ch('Google organic') });
  ok(r.leads.find(o => o.id === 'L_web').date === TM + '-01', 'a lead is dated by the day it arrived, not by its re-stamped "date" field', r.leads.find(o => o.id === 'L_web'));
  ok(t.leads === 7, '12 months = 7 marketing leads (the 3 + 2 above, the one the clean-up closed, the job typed in with no lead; the 14-month-old lead is out)', t.leads);
  ok(t.won === 2 && t.lost === 1 && t.decided === 3 && t.closeRate === 66.67 && t.winRate === 28.57, 'close rate = won ÷ decided = 2 ÷ 3 = 66.67 % (the clean-up close is not a loss); won ÷ all 7 leads = 28.57 %', t);
  ok(ch('Facebook/Instagram Ads').closeRate === null && ch('Facebook/Instagram Ads').closeRateWhy === 'no won or lost leads yet', 'a source with nothing decided: close rate null, "no won or lost leads yet" (not 0 %)', ch('Facebook/Instagram Ads'));
  ok(!r.leads.find(o => o.id === 'L_phone').won && ch('Phone call (source not asked)').thisMonth === 1, 'a new caller with the same phone as an old imported customer is NOT a won job (no lead → job link by phone)', r.leads.find(o => o.id === 'L_phone'));
  ok(t.revenue === 28000 && ch('Referral').revenue === 20000 && ch('Repeat customer').revenue === 8000, 'revenue (contract) = 20,000 + 8,000 = 28,000 by source', { t: t.revenue, ref: ch('Referral').revenue, rep: ch('Repeat customer').revenue });
  const ri = MM.compute(Object.assign({}, F, { spend: [], now: NOW, basis: 'invoiced' })), rp = MM.compute(Object.assign({}, F, { spend: [], now: NOW, basis: 'paid' }));
  ok(ri.totals.revenue === 15000 && rp.totals.revenue === 10000, 'revenue (invoiced) = 15,000 (sub bill and void invoice left out); (paid) = 10,000', [ri.totals.revenue, rp.totals.revenue]);
  ok(['Website', 'Google LSA', 'Phone call (source not asked)', 'Referral', 'Google organic', 'Facebook/Instagram Ads', 'Repeat customer'].every(n => r.channels.some(c => c.channel === n)) && !r.channels.some(c => c.channel === 'Google Ads' || c.channel === 'Other'),
    'sources normalized: Website, Google LSA (not "Google Ads"), Phone call, Referral, Google organic, Facebook, Repeat customer — nothing in "Other"', r.channels.map(c => c.channel));
  ok(r.leads.find(o => o.id === 'p:P_pm').channel === 'PM self-generated', 'a PM\'s own name as the job\'s lead source → "PM self-generated" (not "Other")', r.leads.find(o => o.id === 'p:P_pm'));
  ok(t.spend === 0 && t.cpl === null && t.cplWhy === 'no spend data' && t.cplThisMonth === null && t.costPerJob === null && ch('Referral').roas === null && ch('Referral').roasWhy === 'no spend data' && !r.spend.any,
    'no spend: cost per lead / per job / revenue ÷ spend are null with "no spend data" (never 0 or Infinity)', t);
  ok(r.bids.thisMonth === 1 && r.bids.lastMonth === 2 && r.bids.n === 3 && r.bids.won === 1, 'bids apart: this month 1 (PlanHub), last month 2 (BuildingConnected + a commercial job), 1 won', r.bids);
  ok(['PlanHub', 'BuildingConnected', 'Commercial jobs (no bid source)'].every(p => r.bids.platforms.some(x => x.platform === p)), 'bids by platform', r.bids.platforms);
  ok(r.lsa.leads === 3 && r.lsa.good === 1 && r.lsa.bad === 1 && r.lsa.pending === 1 && r.lsa.costPerGood === null && r.lsa.costPerGoodWhy === 'no spend data' && ch('Google LSA').leads === 1, 'LSA: 3 leads, 1 good, 1 bad, 1 waiting; only the good one is a marketing lead; no spend → "no spend data"', r.lsa);
  ok(r.other.bidWon === 1 && r.other.bidRevenue === 50000 && r.other.importedWon === 1 && r.other.importedRevenue === 5000, 'won work outside marketing: 1 bid job 50,000; 1 imported job 5,000 (its duplicate and the $0 imported customer are not won jobs)', r.other);
  const sp = [{ channel: 'Google LSA', month: TM, amount: 300 }, { channel: 'Website', month: TM, amount: 200 }, { channel: 'Referral', month: LM, amount: 100 }, { channel: 'Nextdoor', month: TM, amount: 50 }, { channel: 'Website', month: OLD, amount: 999 }, { channel: 'Website', month: TM, amount: 0 }];
  const s2 = MM.compute(Object.assign({}, F, { spend: sp, now: NOW })), c2 = n => s2.channels.find(c => c.channel === n) || {};
  ok(c2('Website').cplThisMonth === 200 && c2('Website').spend === 200 && c2('Google LSA').cpl === 300 && s2.lsa.spend === 300 && s2.lsa.costPerGood === 300, 'with spend: Website 200 ÷ 1 lead = $200; LSA 300 ÷ 1 good lead = $300; spend older than 12 months left out', [c2('Website'), s2.lsa]);
  ok(c2('Referral').costPerJob === 100 && c2('Referral').roas === 200 && c2('Referral').roi === 19900, 'cost per job won = 100 ÷ 1; revenue ÷ spend = 20,000 ÷ 100 = 200×', c2('Referral'));
  ok(c2('Nextdoor').cpl === null && c2('Nextdoor').cplWhy === 'spend but no leads', 'spend with no leads: "spend but no leads", not Infinity', c2('Nextdoor'));
  ok(s2.totals.cplThisMonth === Math.round(550 / 3 * 100) / 100, 'all marketing, this month: 550 ÷ 3 leads', s2.totals.cplThisMonth);
  const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8'), core = fs.readFileSync(path.join(build, 'tools/mktmath_core.js'), 'utf8'), tail = fs.readFileSync(path.join(build, 'tools/mktmath_tail.js'), 'utf8');
  ok(html.includes('<script id="gc-patch-mktmath-core">\n' + core + '</script>') && html.includes('<script id="gc-patch-mktmath">\n' + tail + '</script>'), 'index.html carries the same core and Dashboard blocks as tools/');
  const rv = MM.reviews([{ id: 'a', rating: 5, source: 'Google' }, { id: 'b', rating: 4, source: 'added by Wesley' }, { id: 'c', del: true, rating: 1 }]), r0 = MM.reviews([]);
  ok(rv.n === 2 && rv.google === 1 && rv.avg === 4.5 && r0.avg === null && r0.avgWhy === 'no reviews in the CRM yet', 'reviews: count, from Google vs by hand, average; none → "no reviews in the CRM yet"', [rv, r0]);
}

if (PARTS.includes('B')) {
  console.log('B. browser — the admin\'s Dashboard');
  const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
  const H = await import(pathToFileURL(HARNESS).href), sleep = H.sleep;
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(300); } return false; };
  const F = fixture();
  H.resetCloud();
  H.cset('leads', F.leads); H.cset('projects', F.projects); H.cset('invs', F.invs); H.cset('users', F.users);
  ['customers', 'schedule', 'estimates', 'expenses', 'punch', 'projectDocs', 'vendors', 'subs'].forEach(k => H.cset(k, []));
  H.cset('gc_mkt_v1', { cfg: { main: { id: 'main', at: new Date().toISOString(), gs: { gs_fb: true, gs_gbp: true, gs_review: true, gs_ads: true, gs_news: true, gs_social: true } } } });
  const ADMIN = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-wesley');
  let c, tries = 0; for (;;) { try { c = await H.computer('wesley', { build }); break; } catch (e) { if (++tries > 4) throw e; await sleep(5000); } }
  const p = c.page(), errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
  await H.signIn(c, ADMIN, 14000);
  ok(await until(() => p.evaluate(() => !!(window._gcMktExt && window.__gcMktMath && window._gcMktExt.VIEWS.dashboard.__gmm)), 90000), 'the MKTMATH Dashboard is installed');
  await until(() => p.evaluate(() => (window._crm && (window._crm.projects || []).length >= 8)), 60000);
  await until(() => p.evaluate(() => { if (document.querySelector('.gmt[data-gmt-sec]')) return true; try { window._setView('marketing'); } catch (e) {} return false; }), 60000);
  await p.evaluate(() => window._gcMkt.go('dashboard')); await sleep(1500);
  const K = k => p.evaluate(k => { const e = document.querySelector('[data-gmm-k="' + k + '"] b'); return e ? e.innerText.trim() : null; }, k);
  const got = await until(async () => { const v = await K('tm'); return v === '3' ? v : null; }, 40000);
  ok(got === '3', 'marketing leads this month: 3', [await K('tm'), await p.evaluate(() => window._gcMktMathUI.result() && window._gcMktMathUI.result().excluded)]);
  ok(await K('lm') === '2', 'last month: 2', await K('lm'));
  ok(await K('close') === '66.7%', 'close rate 66.7 % (2 won ÷ 3 decided)', await K('close'));
  ok(await K('rev') === '$28,000', 'revenue won (contract): $28,000', await K('rev'));
  ok(/no spend data/.test(await K('cpl') || ''), 'cost per lead this month: "no spend data"', await K('cpl'));
  ok(/none in the CRM/.test(await K('reviews') || ''), 'reviews: "none in the CRM" with the reason behind its "?"', await K('reviews'));
  const ui = await p.evaluate(() => ({ q: document.querySelectorAll('[data-gmm] .gmm-q, [data-gmm-k] .gmm-q').length, rows: [...document.querySelectorAll('[data-gmm="sources"] tr[data-gmm-ch]')].map(tr => tr.getAttribute('data-gmm-ch')),
    bids: (document.querySelector('[data-gmm="bids"]') || {}).innerText || '', lsa: (document.querySelector('[data-gmm="lsa"]') || {}).innerText || '', ex: (document.querySelector('[data-gmm="excluded"]') || {}).innerText || '',
    nospend: !!document.querySelector('[data-gmm="nospend"]'), x9: !!document.getElementById('gc-x9-monthly'), inf: /Infinity|NaN/.test((document.querySelector('.gmt-body') || {}).innerText || ''),
    wide: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  ok(ui.q >= 15, 'every number has a "?" (' + ui.q + ')', ui.q);
  ok(['Website', 'Google LSA', 'Phone call (source not asked)', 'Referral', 'Google organic'].every(n => ui.rows.includes(n)) && !ui.rows.includes('Other') && !ui.rows.includes('Google Ads'), 'sources table rows', ui.rows);
  ok(/All bids\s+1\s+2\s+3\s+1/.test(ui.bids) && /PlanHub/.test(ui.bids), 'Bids card: 1 this month, 2 last month, 3 in 12 months, 1 won', ui.bids.slice(0, 400));
  ok(/did not reach the CRM/.test(ui.lsa) && /localservices/.test(await p.evaluate(() => document.querySelector('[data-gmm="lsa"]').innerHTML)), 'LSA card says why the numbers are near zero and links to Google LSA', ui.lsa.slice(0, 300));
  ok(/tests/.test(ui.ex) && /merged/.test(ui.ex) && /imported/.test(ui.ex), 'Left-out card lists tests / merged / imported', ui.ex.slice(0, 300));
  ok(ui.nospend && !ui.inf, '"No ad spend in the CRM yet" banner; no Infinity / NaN anywhere', ui);
  await sleep(1500);
  ok(!(await p.evaluate(() => !!document.getElementById('gc-x9-monthly'))), 'the old "Monthly by source" table (old math) is not shown');
  await p.evaluate(() => document.querySelector('[data-a="gmm-basis"][data-b="invoiced"]').click()); await sleep(800);
  ok(await K('rev') === '$15,000', 'basis Invoiced: $15,000', await K('rev'));
  await p.evaluate(() => document.querySelector('[data-a="gmm-basis"][data-b="paid"]').click()); await sleep(800);
  ok(await K('rev') === '$10,000', 'basis Paid: $10,000', await K('rev'));
  await p.evaluate(() => document.querySelector('[data-a="gmm-basis"][data-b="contract"]').click()); await sleep(500);
  /* spend entered by hand → cost per lead */
  await p.evaluate(tm => { document.getElementById('gmt-sp-m').value = tm; document.getElementById('gmt-sp-c').value = 'Google LSA'; document.getElementById('gmt-sp-a').value = '300'; document.querySelector('[data-a="spend-add"]').click(); }, TM);
  const cpl = await until(async () => { const v = await K('cpl'); return /\$100\.00/.test(v || '') ? v : null; }, 15000);
  ok(!!cpl, 'after $300 of LSA spend this month: cost per lead $100.00 (300 ÷ 3)', await K('cpl'));
  const lsaT = await p.evaluate(() => document.querySelector('[data-gmm="lsa"]').innerText);
  ok(/\$300\.00/.test(lsaT), 'cost per good LSA lead $300.00', lsaT.slice(0, 300));
  /* phone width */
  await p.setViewportSize({ width: 390, height: 800 }); await sleep(800);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(wide <= 2, 'no sideways page scroll at phone width (tables scroll inside their card)', wide);
  ok(!errs.length, 'no page errors', errs.slice(0, 5));
  try { await c.close(); } catch (e) {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
