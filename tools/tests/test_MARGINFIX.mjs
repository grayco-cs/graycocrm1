// test_MARGINFIX.mjs <build> — commercial default margins by size (cost over $375k = large), drywall hang on the job margin,
// the suggestion banner on saved commercial drafts (Apply / Keep my margin), sent estimates untouched, the rule line on the summary.
import { computer, signIn, sleep, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import { openBuilder } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wEST/estlib.mjs';
const build = process.argv[2];
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
resetCloud();
const A = await computer('A', { build }); await signIn(A, 'wjohnson@grayco-cs.com', 10000);
await openBuilder(A); const p = A.page();
const st = () => p.evaluate(() => { const h = document.getElementById('ej-large-hint'), b = document.getElementById('ej-margin-banner'), r = document.getElementById('ej-margin-rule');
  let tc = 0, tch = 0; lines.forEach(l => { tc += lineBaseCost(l); tch += lineCharge(l); });
  return { jm: jobMult, hint: h && h.style.display !== 'none' ? h.textContent : '', banner: b ? b.textContent : '', apply: !!document.getElementById('ej-margin-apply'), rule: r ? r.textContent : '', margin: tch ? Math.round((tch - tc) / tch * 1000) / 10 : 0 }; });
const fresh = async () => { await p.evaluate(() => { window.addNewSlot(); }); await sleep(600); };
const add = async (desc, cost, type = 'sub') => { await p.evaluate(({ desc, cost, type }) => { document.getElementById('nl-desc').value = desc; document.getElementById('nl-cost').value = String(cost); document.getElementById('nl-qty').value = '1'; const t = document.getElementById('nl-type'); if (t) t.value = type; window.addLine(); }, { desc, cost, type }); await sleep(300); };
const setType = async t => { await p.evaluate(t => window._gcSetJobType(t, true), t); await sleep(400); };
const pct = m => Math.round((1 - 1 / parseFloat(m)) * 1000) / 10;

/* 1. new / untouched estimates */
await fresh(); await setType('Commercial'); await add('c', 380000); let s = await st();
ok('commercial cost $380k (price $506k at 25%) -> 20% + hint "cost over $375k"', pct(s.jm) === 20 && /judged by cost over \$375k/.test(s.hint), s);
ok('summary rule line: "Default margin: Commercial over $500k → 20%"', s.rule === 'Default margin: Commercial over $500k → 20%', s.rule);
await fresh(); await setType('Commercial'); await add('c', 300000); s = await st();
ok('commercial cost $300k -> 25%, no hint', pct(s.jm) === 25 && !s.hint && s.rule === 'Default margin: Commercial $500k or less → 25%', s);
await add('c2', 75000); s = await st(); ok('cost exactly $375k -> still 25%', pct(s.jm) === 25, s);
await add('c3', 1); s = await st(); ok('cost $375,001 -> 20%', pct(s.jm) === 20, s);
await p.evaluate(() => { lines.pop(); renderLines(); renderSummary(); }); await sleep(300); s = await st(); ok('back under -> 25% (follows cost only)', pct(s.jm) === 25, s);
await fresh(); await setType('Residential'); await add('r', 10000); s = await st();
ok('residential 30%', s.jm === 'mat' && s.margin === 30 && s.rule === 'Default margin: Residential → 30%', s);
await fresh(); await setType('Insurance'); await add('i', 800000); s = await st();
ok('insurance 30%', s.jm === 'mat' && s.margin === 30 && s.rule === 'Default margin: Insurance → 30%', s);

/* 2. drywall hang labor at the zone's Default margin = the job margin */
await fresh(); await setType('Commercial');
const dw = await p.evaluate(() => { dwZones = []; addDwZone(); dwZones[0].sf = 4000; calcDw(); const ls = (cc2.dw && cc2.dw.lines) || []; const hang = ls.find(l => /^Drywall hang labor/.test(l.desc));
  dwZones[0].mult = '1.5'; calcDw(); const hang2 = ((cc2.dw && cc2.dw.lines) || []).find(l => /^Drywall hang labor/.test(l.desc)); dwZones = [];
  return { n: ls.length, mult: hang && hang.mult, eff: hang && effMult(hang), others: ls.filter(l => l !== hang).map(l => effMult(l)), job: parseFloat(jobMult), mult2: hang2 && hang2.mult }; });
ok('drywall hang at Default zone margin follows the job margin (no x1.6)', dw.mult === 'type' && Math.abs(dw.eff - dw.job) < 1e-9 && dw.others.every(m => Math.abs(m - dw.job) < 1e-9), dw);
ok('an explicit zone margin still wins on the hang line', dw.mult2 === '1.5', dw);

/* 3. saved commercial draft at 28% (Hyatt): banner, Apply -> 20% */
const mkSaved = (id, status, extra) => p.evaluate(({ id, status, extra }) => {
  const ls = [{ id: id + 'a', desc: 'Framing sub', cost: 300000, qty: 1, cat: 'Framing', type: 'sub', mult: 'type' },
    { id: id + 'b', desc: 'Drywall hang labor 5/8 Type X 4x12', cost: 100000, qty: 1, cat: 'Drywall', type: 'labor', mult: '1.6' },
    { id: id + 'c', desc: 'Owner-set line', cost: 1000, qty: 1, cat: 'Misc', type: 'labor', mult: '1.9' }];
  const e = Object.assign({ id, name: 'Hyatt ' + id, num: id, jobType: 'Commercial', status, jobMult: 'mat', useOvr: false, lines: ls, totalCharge: 300000 / 0.75 + 160000 + 1900, totalCost: 401000, savedAt: new Date().toISOString() }, extra || {});
  estimates = estimates.filter(x => x.id !== id); estimates.push(e); loadEst(id); return true; }, { id, status, extra });
await mkSaved('HY1', 'Draft'); await sleep(500); s = await st();
ok('saved draft opens unchanged at ~28% (nothing silent)', s.margin > 27.5 && s.margin < 29, s);
ok('banner: "Large commercial (over $500k): default margin is 20%" + Apply 20%', /^Large commercial \(over \$500k\): default margin is 20%/.test(s.banner) && /Apply 20%/.test(s.banner) && s.apply, s.banner);
await p.evaluate(() => document.getElementById('ej-margin-apply').click()); await sleep(500); s = await st();
const lp = await p.evaluate(() => lines.map(l => [l.mult, Math.round(effMult(l) * 1e4) / 1e4]));
ok('Apply -> job margin 20%, banner gone', pct(s.jm) === 20 && !s.banner, s);
ok('Apply resets only the old forced hang x1.6; explicit per-line margin kept', lp[1][0] === 'type' && lp[1][1] === 1.25 && lp[2][0] === '1.9' && lp[0][1] === 1.25, lp);
ok('saved record not changed until Save', await p.evaluate(() => { const e = estimates.find(x => x.id === 'HY1'); return e.jobMult === 'mat' && e.lines[1].mult === '1.6'; }));

/* 4. sent estimate: info only, Apply refuses */
await mkSaved('HY2', 'Submitted'); await sleep(500); s = await st();
ok('sent estimate: info line, no Apply button', /default margin is 20%/.test(s.banner) && /already sent/.test(s.banner) && !s.apply, s.banner);
const before = await p.evaluate(() => JSON.stringify([jobMult, lines.map(l => l.mult)]));
ok('sent estimate: Apply refused, lines unchanged', await p.evaluate(() => window._gcApplyRuleMargin()) === false && await p.evaluate(() => JSON.stringify([jobMult, lines.map(l => l.mult)])) === before);
await mkSaved('HY3', 'Won', { signedAt: '2026-10-01' }); await sleep(400); s = await st();
ok('won/signed estimate: no Apply', !s.apply && /already sent/.test(s.banner), s.banner);

/* 5. estimator's own margin: Keep my margin dismisses for good */
await mkSaved('HY4', 'Draft', { jobMult: 1.5385 }); await sleep(400); s = await st();
ok('draft at estimator 35%: suggestion shown, margin kept', pct(s.jm) === 35 && /Apply 20%/.test(s.banner), s);
await p.evaluate(() => document.getElementById('ej-margin-keep').click()); await sleep(400); s = await st();
ok('Keep my margin: banner gone, margin still 35%', !s.banner && pct(s.jm) === 35, s);
await p.evaluate(() => loadEst('HY4')); await sleep(400); s = await st();
ok('reopened: banner does not come back', !s.banner && pct(s.jm) === 35, s);
/* small saved commercial */
await p.evaluate(() => { estimates.push({ id: 'SM1', name: 'Small', num: 'SM1', jobType: 'Commercial', status: 'Draft', jobMult: 1.4286, lines: [{ id: 's1', desc: 'x', cost: 100000, qty: 1, cat: 'X', type: 'sub', mult: 'type' }], totalCharge: 142860 }); loadEst('SM1'); }); await sleep(400); s = await st();
ok('saved small commercial at 30%: "Commercial ($500k or less): default margin is 25%" Apply 25%', /^Commercial \(\$500k or less\): default margin is 25%/.test(s.banner) && /Apply 25%/.test(s.banner), s.banner);
await p.evaluate(() => { estimates.push({ id: 'OK1', name: 'OnDef', num: 'OK1', jobType: 'Commercial', status: 'Draft', jobMult: 1.3333, lines: [{ id: 'o1', desc: 'x', cost: 100000, qty: 1, cat: 'X', type: 'sub', mult: 'type' }], totalCharge: 133330 }); loadEst('OK1'); }); await sleep(400); s = await st();
ok('saved commercial already on its default: no banner', !s.banner && /25%/.test(s.rule), s);
await sleep(500);
ok('no page errors', A.errs.length === 0, A.errs.slice(0, 3));
console.log(R.filter(Boolean).length + '/' + R.length + (R.every(Boolean) ? ' ALL PASS' : ' SOME FAIL')); await A.b.close(); process.exit(R.every(Boolean) ? 0 : 1);
