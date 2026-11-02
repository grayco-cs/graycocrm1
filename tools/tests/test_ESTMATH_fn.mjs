// test_ESTMATH_fn.mjs [build-dir] [mirror.json] — patch ESTMATH, offline (node, no browser): runs the Estimate Builder's
// own math (taxed / effMult / lineBaseCost / lineCharge and the ESTMATH block, cut out of index.html) and the saved-line
// normalizer on the owner's lines and, when a mirror is given, on every saved estimate in it.
//   1. the owner's two lines (MS job, job margin x1.25): the text names every factor and ends on Base and Charge;
//   2. the margin named on the chip / pulldown / text = effMult, in each mode;
//   3. the screws takeoff (6,800 sheets × 48 ÷ 8,000/box = 41 boxes, price per box), follow / override / per board;
//      a box size is asked once and saved on the item;
//   4. old screws lines are left alone (banner + "Use N"); Save keeps their qty as "overridden";
//   5. every saved estimate in the mirror: opening keeps each line (fields, type) and its builder total is unchanged.
// The browser steps (rendering, Save, the calculator) are in test_ESTMATH.mjs.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const BUILD = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || process.env.GC_MIRROR || '';
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('anchor not found: ' + a.slice(0, 60)); return html.slice(i, j); };
const MATH = cut('function taxed(cost){', '// ─── INIT ');
const NORM = cut('/* ===== Normalize estimate line items from any format', '</script>');
ok(/patch ESTMATH/.test(MATH), 'the build carries patch ESTMATH');

const prompts = [];
const ctx = {
  console, window: {}, settings: { tax: 9.75, matMult: 1.4286, labMult: 1.4286, subMult: 1.4286, eqMult: 1.4286, mhCharge: 75, mhCost: 44.44, jobState: 'MS', msContractorTax: 3.5 },
  lines: [], jobMult: 1.25, useOvr: false, ovrMult: 1.5, openSlots: [{ lines: [] }], activeSlot: 0, rates: [],
  fmt: n => '$' + (parseFloat(n) || 0).toFixed(2), fmtN: n => Math.round(n || 0).toLocaleString(),
  setTimeout: () => 0, renderLines(){}, renderSummary(){}, saveRatesDB(){ ctx.__ratesSaved = (ctx.__ratesSaved || 0) + 1; }, _gcPersistLineEdit(){},
};
ctx.window.prompt = (m, d) => { prompts.push(m); return ctx.__ans === undefined ? null : ctx.__ans; };
vm.createContext(ctx);
vm.runInContext(MATH.replace(/^function daysSince[\s\S]*?\n}\nfunction stalenessLabel[\s\S]*?\n}\n/m, ''), ctx);
vm.runInContext(NORM, ctx);
const W = ctx.window, run = src => vm.runInContext(src, ctx);
const set = o => { for (const k in o) { ctx.__v = o[k]; run(k + ' = __v'); } };

/* 1. the owner's two lines */
set({ lines: [{ id: 'OW1', desc: 'Drywall [5/8" Type X] 4×12 (48 SF) — All Drywall', qty: 6848, cost: 23.04, type: 'material', unit: 'sheet', mult: 'type', calcNote: '5/8" Type X pre-tax' },
  { id: 'OW2', desc: 'Drywall screws — All Drywall', qty: 48, cost: 100.14, type: 'material', unit: 'box', mult: 'type', calcNote: '6,848 sheets × 35 = 239,680 screws ÷ 5,000/box' }] });
const L = id => run('lines').find(l => l.id === id), F = n => '$' + n.toFixed(2);
const t2 = W._gcLineMathText(L('OW2')), t1 = W._gcLineMathText(L('OW1'));
console.log('   screws: ' + t2); console.log('   sheets: ' + t1);
ok(F(ctx.lineBaseCost(L('OW2'))) === '$5460.01' && F(ctx.lineCharge(L('OW2'))) === '$6825.02', 'screws: Base $5460.01, Charge $6825.02 (the numbers the owner saw — unchanged)');
ok(t2 === '48 × $100.14 = $4806.72 · + 9.75% sales tax = $5275.38 · + 3.5% MS contractor tax = $5460.01 · × 1.25 (job margin 20%) = $6825.02', 'screws text: every factor — sales tax, MS contractor tax 3.5%, job margin ×1.25', t2);
ok(t1 === '6,848 × $23.04 = $157777.92 · + 9.75% sales tax = $173161.27 · + 3.5% MS contractor tax = $179221.91 · × 1.25 (job margin 20%) = $224027.39' && F(ctx.lineCharge(L('OW1'))) === '$224027.39', 'sheets text: $157777.92 + tax + MS $179221.91 × 1.25 = $224027.39', t1);
const chk = t => { let v = null; return t.split(' · ').every(s => { const out = +s.match(/=\s*\$([\d.]+)$/)[1];
  if (v === null) { const a = s.match(/^([\d,.]+) × \$([\d.]+)/); v = parseFloat(a[1].replace(/,/g, '')) * +a[2]; }
  else if (/^\+ ([\d.]+)%/.test(s)) v *= 1 + parseFloat(s.match(/^\+ ([\d.]+)%/)[1]) / 100; else v *= parseFloat(s.match(/^× ([\d.]+)/)[1]);
  const good = Math.abs(v - out) <= 0.015; v = out; return good; }); };
ok(chk(t1) && chk(t2), 'every step is the arithmetic of the step before it (to the cent)');
set({ settings: Object.assign({}, ctx.settings, { jobState: 'TN' }) });
ok(W._gcLineMathText(L('OW2')) === '48 × $100.14 = $4806.72 · + 9.75% sales tax = $5275.38 · × 1.25 (job margin 20%) = $6594.22' && F(ctx.lineCharge(L('OW2'))) === '$6594.22', 'not in MS: no MS step, 5275.38 × 1.25 = 6594.22 (the owner\'s own arithmetic)', W._gcLineMathText(L('OW2')));
set({ settings: Object.assign({}, ctx.settings, { jobState: 'MS' }) });

/* 2. the margin named = the margin used */
const num = s => +String(s).match(/([\d.]+)x/)[1];
const same = l => { const used = Math.round(ctx.effMult(l) * 1e4) / 1e4, chip = run('_gcMultChip')(l), opt = run('_gcTypeOptLabel')(l), txt = W._gcLineMathText(l).match(/× ([\d.]+) \(([^)]+)\) = \$[\d.]+$/);
  return { used, chip, opt, txt: txt && txt[1] + ' ' + txt[2] }; };
let s = same(L('OW2'));
ok(s.used === 1.25 && s.chip === '1.25x (job margin 20%)' && s.opt === 'Job margin (1.25x)' && s.txt === '1.25 job margin 20%', 'job margin: chip "1.25x (job margin 20%)", pulldown "Job margin (1.25x)" (was "Type default (1.4286x)"), text × 1.25', s);
set({ jobMult: 'mat' }); s = same(L('OW2'));
ok(s.used === 1.4286 && s.chip === '1.4286x (material default)' && s.opt === 'Type default (1.4286x)' && s.txt === '1.4286 material default', 'by type: 1.4286 everywhere', s);
set({ useOvr: true }); s = same(L('OW2'));
ok(s.used === 1.5 && s.chip === '1.5x (override)' && s.opt === 'Override (1.5x)', 'override on: 1.5 everywhere', s);
L('OW2').mult = '1.35'; s = same(L('OW2'));
ok(s.used === 1.35 && s.chip === '1.35x (this line)' && s.txt === '1.35 this line', 'a line margin wins over the override: 1.35 everywhere', s);
L('OW2').mult = 'type'; set({ useOvr: false, jobMult: 1.25 });
const mh = { id: 'M1', desc: 'Finisher', qty: 16, cost: 44.44, type: 'mh', mult: 'type' };
ok(W._gcLineMathText(mh) === '16 MH × $44.44/hr cost = $711.04 · charged 16 MH × $75/hr = $1200.00 (man-hours: hourly rate, no margin, no MS tax)', 'man-hour line: cost, hourly charge, no margin, no MS tax', W._gcLineMathText(mh));

/* totals: the MS row = the MS tax in the lines */
set({ lines: run('lines').concat([mh, { id: 'S1', desc: 'sub', qty: 1, cost: 1000, type: 'sub', mult: 'type' }]) });
const msWant = run('lines').filter(l => l.type !== 'mh').reduce((a, l) => { const b = ctx.lineBaseCost(l); return a + b - b / 1.035; }, 0);
ok(Math.abs(W._gcMsTaxTotal() - msWant) < 1e-6 && Math.abs(W._gcMsTaxTotal() - (5460.0133 - 5275.3752 + 179221.9116 - 173161.2672 + 35)) < 0.01, 'MS row = MS tax in the lines ($' + W._gcMsTaxTotal().toFixed(2) + '; none on man-hours)');

/* 4. old screws line: left alone, "Use N" */
set({ lines: run('lines').filter(l => l.id === 'OW1' || l.id === 'OW2') });
const ban = W._gcMathBannerHTML(), c0 = W._gcTkCompute(L('OW2'));
ok(/Math updated — review\./.test(ban) && /48 screws per board/.test(ban) && /figured at 35/.test(ban) && L('OW2').qty === 48, 'old 35/board line: banner "Math updated — review", qty untouched (48)', ban.replace(/<[^>]+>/g, ''));
ok(c0.legacy && c0.sheets === 6848 && c0.boxes === 66 && c0.srcIds.join() === 'OW1', 'the 48 was ceil(6,848 × 35 ÷ 5,000); the new rule says 6,848 × 48 ÷ 5,000 = 66 boxes (linked to the sheets line)', c0);
const tkRow = run('_gcTkLineHTML')(L('OW2')).replace(/<input[^>]*>/g, '[48]').replace(/<[^>]+>/g, '');
ok(/6,848 sheets × 35 ÷ 5,000\/box = 48 boxes; this line has 48\)\. Now: 6,848 sheets × \[48\] screws\/board = 328,704 screws ÷ 5,000\/box = 66 boxesUse 66/.test(tkRow), 'the line shows the old figure and the new one with "Use 66"', tkRow);
ok(W._gcTkOnEdit(L('OW1'), 'qty') === true && L('OW2').qty === 48, 'changing the sheets does not change an old screws line by itself');
W._gcTkUse('OW2');
ok(L('OW2').qty === 66 && L('OW2').calcNote === '6,848 sheets × 48 = 328,704 screws ÷ 5,000/box = 66 boxes' && !W._gcMathBannerHTML(), '"Use 66": qty 66 with the formula; banner gone', L('OW2'));
L('OW1').qty = 6800; W._gcTkOnEdit(L('OW1'), 'qty');
ok(L('OW2').qty === 66 && L('OW2').calcNote === '6,800 sheets × 48 = 326,400 screws ÷ 5,000/box = 66 boxes', 'now it follows the sheets (6,800)', L('OW2').calcNote);
/* Save without using: qty kept, overridden */
set({ lines: [{ id: 'B1', desc: 'Drywall [5/8" Type X] 4×12 (48 SF) — All 5/8 type X', qty: 6143, cost: 23.04, type: 'material', unit: 'sheet', mult: 'type' },
  { id: 'B2', desc: 'Drywall screws — All 5/8 type X', qty: 44, cost: 100.14, type: 'material', unit: 'box', mult: 'type', calcNote: '6,143 sheets × 35 = 215,005 screws ÷ 5,000/box' }] });
const before = run('lines').reduce((a, l) => a + ctx.lineCharge(l), 0);
W._gcMathOnSave();
ok(L('B2').qty === 44 && L('B2').qtyOverride === true && L('B2').calcNote === '6,143 sheets × 48 = 294,864 screws ÷ 5,000/box = 59 boxes · qty overridden to 44' && !W._gcMathBannerHTML()
  && Math.abs(run('lines').reduce((a, l) => a + ctx.lineCharge(l), 0) - before) < 1e-9, 'Save = reviewed: 44 kept, "qty overridden" beside the rule\'s 59, total unchanged', L('B2'));

/* 3. a new takeoff (the calculator's lines) */
set({ rates: [{ id: 'RS', desc: 'Drywall screws #6 1-5/8 box', cost: 100.14, unit: 'box', cat: 'Drywall' }], lines: [], openSlots: [{ lines: [] }] });
const calcLines = () => [{ id: 'N1', desc: 'Drywall 4×12 — A', qty: 6800, cost: 23.04, type: 'material', unit: 'sheet', mult: 'type', tkSrc: 'dwz:1' },
  { id: 'N2', desc: 'Drywall screws — A', qty: 1, cost: 100.14, type: 'material', unit: 'box', mult: 'type', takeoff: { rule: 'dwScrews', src: 'dwz:1', perBoard: 48, perBox: 5000, packFrom: 'assumed', itemId: 'RS', itemDesc: 'Drywall screws #6 1-5/8 box' } }];
ctx.__ans = '8000';
let nl = W._gcTkLink(calcLines());
ok(prompts.length === 1 && /How many screws come in one box of "Drywall screws #6 1-5\/8 box"/.test(prompts[0]) && run('rates')[0].packSize === 8000 && ctx.__ratesSaved === 1, 'no box size on the item: asked once, saved on the item (8,000)', { prompts, rate: run('rates')[0] });
ok(nl[1].qty === 41 && nl[1].cost === 100.14 && nl[1].calcNote === '6,800 sheets × 48 = 326,400 screws ÷ 8,000/box = 41 boxes' && nl[1].takeoff.srcIds.join() === 'N1' && !nl[0].tkSrc, '6,800 sheets × 48 = 326,400 screws ÷ 8,000/box = 41 boxes at $100.14 a box', nl[1]);
set({ lines: nl });
L('N1').qty = 7000; W._gcTkOnEdit(L('N1'), 'qty'); ok(L('N2').qty === 42, 'sheets 7,000 -> 42 boxes', L('N2').calcNote);
L('N2').qty = 50; W._gcTkOnEdit(L('N2'), 'qty'); L('N1').qty = 7200; W._gcTkOnEdit(L('N1'), 'qty');
ok(L('N2').qty === 50 && L('N2').qtyOverride && /= 44 boxes · qty overridden to 50$/.test(L('N2').calcNote) && /qty overridden/.test(run('_gcTkLineHTML')(L('N2'))), 'a typed 50 is kept as "overridden" when the sheets change (rule: 44)', L('N2').calcNote);
W._gcTkUse('N2'); ok(L('N2').qty === 44 && !L('N2').qtyOverride, '"Use 44" puts the rule back');
W._gcTkSetPerBoard(32); ok(L('N2').qty === 29 && L('N2').calcNote === '7,200 sheets × 32 = 230,400 screws ÷ 8,000/box = 29 boxes' && run('openSlots')[0].screwsPerBoard === 32, 'screws per board 32 for this estimate: 29 boxes', L('N2').calcNote);
prompts.length = 0; ctx.__ans = undefined;
const c2 = calcLines(); c2[1].takeoff.packFrom = 'item'; c2[1].takeoff.perBox = 8000; W._gcTkLink(c2);
ok(prompts.length === 0, 'an item with a box size is not asked again');

/* 5. the saved line normalizer keeps a builder line's fields and type */
const n = W._gcNormalizeEstLines({ lines: [{ id: 'a', desc: 'lift', qty: 2, cost: 300, type: 'equipment', mult: 'type' }, { id: 'b', desc: 'fin', qty: 8, cost: 44.44, type: 'mh', mult: 'type' }, { id: 'c', desc: 'Drywall screws — X', qty: 3, cost: 9, type: 'material', mult: 'type', calcNote: 'n', takeoff: { rule: 'dwScrews' }, qtyOverride: true }] });
ok(n[0].type === 'equipment' && n[1].type === 'mh' && n[2].calcNote === 'n' && n[2].takeoff && n[2].qtyOverride === true, 'opening keeps equipment / man-hour types (they came back as taxed materials) and calcNote / takeoff', n);

if (MIRROR && fs.existsSync(MIRROR)) {
  const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
  const val = k => { const r = rows.find(x => x.key === k); let v = r && (r.value !== undefined ? r.value : r.v); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; };
  const seen = new Set(), ests = [];   /* the builder's own store and the CRM's list */
  for (const e of val('__est__gc_ests_v2').concat(val('estimates'))) { if (e && e.id && !seen.has(e.id)) { seen.add(e.id); ests.push(e); } }
  let n0 = 0, same = 0, legacy = 0; const bad = [];
  for (const e of ests || []) {
    if (!e || !Array.isArray(e.lines) || !e.lines.length) continue; n0++;
    const L2 = W._gcNormalizeEstLines(e);
    const keep = L2.every((l, i) => { const o = e.lines[i]; return o && l.id === o.id && l.desc === (o.desc || '') && l.calcNote === o.calcNote && l.type === o.type && +l.qty === (+o.qty || 1) && +l.cost === +o.cost; });
    if (keep) same++; else bad.push(e.id);
    set({ lines: L2 }); legacy += L2.filter(l => run('_gcLegacyScrew')(l)).length;
  }
  ok(n0 > 0 && same === n0, 'mirror: all ' + n0 + ' saved estimates open with every line as saved (id, desc, qty, cost, type, note)', bad.slice(0, 5));
  console.log('   mirror: ' + legacy + ' drywall-screws lines figured at the old 35/board — each shows "Math updated — review", none changed');
  const hy = (ests || []).find(e => e && e.id === 'mvpngqx4tzo');
  if (hy) {
    set({ settings: Object.assign({}, ctx.settings, hy.settings, { jobState: 'MS' }), jobMult: hy.jobMult, useOvr: !!hy.useOvr, lines: W._gcNormalizeEstLines(hy) });
    const tot = run('lines').reduce((a, l) => a + ctx.lineCharge(l), 0);
    ok(Math.abs(tot - hy.totalCharge) < 0.01, 'Hyatt Studios: builder total with its saved margin x' + hy.jobMult + ' = saved total $' + hy.totalCharge.toFixed(2), { tot });
    const sc = run('lines').find(l => l.id === 'mvpngoo0sbx'); console.log('   Hyatt screws today: ' + W._gcLineMathText(sc));
  }
}
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
