// test_ESTMATH.mjs <build-dir> <mirror.json> — patch ESTMATH on REAL data (read-only mirror of production gc_kv, kept
// outside git: customer data; also GC_MIRROR=<path>). Offline harness (mock Supabase), the owner signed in.
//   1. the owner's two lines (Hyatt Studios, MS job, job margin x1.25): the text names every factor (sales tax, MS
//      contractor tax 3.5%, the margin really used) and its numbers are the line's "Base" and "Charge";
//   2. the margin shown (chip, "Line margin" pulldown, text) is the margin used (effMult), in every mode;
//   3. the summary: category rows, "By type" rows (man-hours too) and the MS row add up to the total = sum of the lines;
//   4. the real saved estimates open unchanged (lines, total), say "Math updated — review", keep their saved record
//      until Save; "Use 66" takes the new count; Save marks an estimate reviewed (a line left keeps its qty: overridden);
//   5. the screws takeoff: sheets × 48 per board ÷ the item's box size (asked once, saved on the item) = boxes, at the
//      price per box; sheets change -> screws follow; a typed qty is "overridden"; screws per board editable;
//   6. "Save & Create Proposal" totals = the builder total (was lineCharge × qty); opening a saved estimate keeps
//      man-hour / equipment lines and the takeoff fields; no page errors.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wN/harness_N.mjs';
const { computer, sleep, cloud, cget, signIn } = await import(pathToFileURL(HARNESS).href);
const { openBuilder } = await import(pathToFileURL(SP + '/wEST/estlib.mjs').href);
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3] || process.env.GC_MIRROR;
if (!BUILD || !MIRROR) { console.error('usage: node test_ESTMATH.mjs <build-dir> <mirror.json>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const arr = v => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return Array.isArray(v) ? v : []; };
const cloudEst = id => arr(cget('estimates')).find(e => e && e.id === id);
const HY = 'mvpngqx4tzo', SR = 'mvpeq88chfk';
const hyBefore = JSON.parse(JSON.stringify(cloudEst(HY) || null)), srBefore = JSON.parse(JSON.stringify(cloudEst(SR) || null));
if (!hyBefore || !srBefore) { console.error('the mirror lacks Hyatt Studios / Studio Res'); process.exit(2); }
const lineSig = L => JSON.stringify((L || []).map(l => [l.id, l.desc, +l.qty, +l.cost, l.type, String(l.mult), l.calcNote || '']));
const money = s => parseFloat(String(s).replace(/[$,]/g, ''));

const c = await computer('EM', { build: BUILD }); c.acceptConfirm = false;
await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
try {
  await signIn(c, 'wjohnson@grayco-cs.com', 15000);
  await sleep(8000);
  await openBuilder(c);
  const p = c.page();
  await p.evaluate(() => { window.__pr = []; window.prompt = (m, d) => { window.__pr.push(String(m)); return window.__prAns === undefined ? null : window.__prAns; }; });
  const rowOf = id => p.evaluate(id => { const r = document.querySelector('#est-lines [data-lineid="' + id + '"]'); if (!r) return null; const sel = r.querySelector('.elb select');
    return { base: (r.querySelector('[data-base]') || {}).textContent, baseLbl: ((r.querySelector('[data-base]') || {}).previousElementSibling || {}).textContent, charge: (r.querySelector('[data-charge]') || {}).textContent,
      chip: (r.querySelector('[data-ml]') || {}).textContent, opt: sel ? sel.options[sel.selectedIndex].text : '', math: (r.querySelector('[data-math]') || {}).textContent || '', tk: (r.querySelector('[data-tk]') || {}).textContent || '' }; }, id);
  const fresh = () => p.evaluate(() => { window.addNewSlot(); return true; }).then(() => sleep(500));

  /* ── 1. the owner's two lines ───────────────────────────────────────────────────────────────────────────── */
  await fresh();
  await p.evaluate(() => {
    settings.jobState = 'MS'; settings.tax = 9.75; settings.msContractorTax = 3.5; useOvr = false; jobMult = 1.25; openSlots[activeSlot].jobMult = 1.25;
    lines = [{ id: 'OW1', desc: 'Drywall [5/8" Type X] 4×12 (48 SF) — All Drywall', qty: 6848, cost: 23.04, type: 'material', cat: 'Drywall', unit: 'sheet', mult: 'type', calcNote: '5/8" Type X pre-tax' },
      { id: 'OW2', desc: 'Drywall screws — All Drywall', qty: 48, cost: 100.14, type: 'material', cat: 'Drywall', unit: 'box', mult: 'type', calcNote: '6,848 sheets × 35 = 239,680 screws ÷ 5,000/box' }];
    openSlots[activeSlot].lines = [...lines]; renderLines(); renderSummary(); });
  await sleep(300);
  const r2 = await rowOf('OW2'), r1 = await rowOf('OW1');
  console.log('   screws line: ' + r2.math); console.log('   sheets line: ' + r1.math);
  ok(r2.base === '$5460.01' && r2.charge === '$6825.02', 'screws: Base $5460.01, Charge $6825.02 (unchanged numbers)', r2);
  ok(r2.math === '48 × $100.14 = $4806.72 · + 9.75% sales tax = $5275.38 · + 3.5% MS contractor tax = $5460.01 · × 1.25 (job margin 20%) = $6825.02', 'screws text names every factor: tax, MS contractor tax 3.5%, job margin x1.25', r2.math);
  ok(/^6,848 × \$23\.04 = \$157777\.92 · \+ 9\.75% sales tax = \$173161\.27 · \+ 3\.5% MS contractor tax = \$179221\.91 · × 1\.25 \(job margin 20%\) = \$224027\.39$/.test(r1.math) && r1.charge === '$224027.39' && r1.base === '$179221.91', 'sheets line: $157777.92 + tax $173161.27 + MS $179221.91 × 1.25 = $224027.39 (= Base, = Charge)', r1);
  const chain = t => { const n = (t.match(/\$[\d.]+|× [\d.]+|\+ [\d.]+%/g) || []); return n; };
  const chk = t => { const parts = t.split(' · '); let v = null, okk = true; for (const s of parts) { const m = s.match(/=\s*\$([\d.]+)$/); const out = m ? +m[1] : NaN;
      if (v === null) { const a = s.match(/^([\d,.]+) × \$([\d.]+)/); v = parseFloat(a[1].replace(/,/g, '')) * +a[2]; }
      else if (/^\+ ([\d.]+)%/.test(s)) v = v * (1 + parseFloat(s.match(/^\+ ([\d.]+)%/)[1]) / 100);
      else if (/^× ([\d.]+)/.test(s)) v = v * parseFloat(s.match(/^× ([\d.]+)/)[1]);
      if (Math.abs(v - out) > 0.015) okk = false; v = out; } return okk; };
  ok(chk(r2.math) && chk(r1.math), 'each step of both texts is the arithmetic of the step before (to the cent)', [r2.math, r1.math]);
  ok(money(r2.base) === money(r2.math.match(/MS contractor tax = (\$[\d.]+)/)[1]) && money(r2.charge) === money(r2.math.match(/= (\$[\d.]+)$/)[1]), 'Base w/tax = the text\'s base, Charge = the text\'s charge');
  ok(/w\/tax \+ MS 3\.5%/.test(r2.baseLbl), 'the Base column says it includes the MS tax ("Base w/tax + MS 3.5%")', r2.baseLbl);

  /* ── 2. the margin shown is the margin used ──────────────────────────────────────────────────────────────── */
  const mnum = s => { const m = String(s).match(/([\d.]+)x/); return m ? +m[1] : NaN; };
  const used = id => p.evaluate(id => Math.round(effMult(lines.find(l => l.id === id)) * 1e4) / 1e4, id);
  ok(r2.chip === '1.25x (job margin 20%)' && r2.opt === 'Job margin (1.25x)' && mnum(r2.chip) === await used('OW2') && /× 1\.25 \(job margin 20%\)/.test(r2.math), 'job margin x1.25: chip "1.25x (job margin 20%)", pulldown "Job margin (1.25x)", text × 1.25 — all = effMult', r2);
  await p.evaluate(() => { jobMult = 'mat'; openSlots[activeSlot].jobMult = 'mat'; renderLines(); }); let m2 = await rowOf('OW2');
  ok(m2.opt === 'Type default (1.4286x)' && m2.chip === '1.4286x (material default)' && mnum(m2.chip) === await used('OW2') && /× 1\.4286 \(material default\)/.test(m2.math), 'By type: "Type default (1.4286x)" = chip = text = used', m2);
  await p.evaluate(() => { useOvr = true; ovrMult = 1.5; renderLines(); }); m2 = await rowOf('OW2');
  ok(m2.opt === 'Override (1.5x)' && m2.chip === '1.5x (override)' && await used('OW2') === 1.5, 'override on: "Override (1.5x)" = chip = used', m2);
  await p.evaluate(() => { ul('OW2', 'mult', '1.35'); }); await sleep(400); m2 = await rowOf('OW2');
  ok(m2.opt === '1.35x' && /^1\.35x \(this line\)$/.test(m2.chip) && /× 1\.35 \(this line\)/.test(m2.math) && await used('OW2') === 1.35, 'a line margin wins over the override: 1.35x everywhere (updated in place)', m2);
  await p.evaluate(() => { useOvr = false; lines.find(l => l.id === 'OW2').mult = 'type'; jobMult = 1.25; openSlots[activeSlot].jobMult = 1.25; renderLines(); renderSummary(); });

  /* ── 3. totals = sum of the lines ───────────────────────────────────────────────────────────────────────── */
  await p.evaluate(() => { lines.push({ id: 'TL1', desc: 'Hang labor', qty: 10, cost: 28, type: 'labor', cat: 'Drywall', mult: 'type' }, { id: 'TS1', desc: 'Paint sub', qty: 1, cost: 12345.67, type: 'sub', cat: 'Paint', mult: '1.42' },
    { id: 'TE1', desc: 'Lift', qty: 3, cost: 410, type: 'equipment', cat: 'General', mult: 'type' }, { id: 'TM1', desc: 'Finisher MH', qty: 16, cost: 44.44, type: 'mh', cat: 'Drywall', mult: 'type' });
    openSlots[activeSlot].lines = [...lines]; renderLines(); renderSummary(); });
  await sleep(300);
  const T = await p.evaluate(() => {
    const sm = document.getElementById('est-summary'), rs = [...sm.querySelectorAll('.sr')].map(r => [r.children[0] && r.children[0].textContent.trim(), r.children[1] && r.children[1].childNodes[0] ? r.children[1].childNodes[0].textContent.trim() : '']);
    const sum = lines.reduce((s, l) => s + lineCharge(l), 0), ms = lines.reduce((s, l) => (l.type === 'mh' ? s : s + lineBaseCost(l) - lineBaseCost(l) / 1.035), 0);
    const cats = [...new Set(lines.map(l => l.cat))];
    const mh = lines.find(l => l.id === 'TM1'), mhr = document.querySelector('#est-lines [data-lineid="TM1"] [data-math]');
    return { rs, sum, ms, cats, shown: lines.map(l => (document.querySelector('#est-lines [data-lineid="' + l.id + '"] [data-charge]') || {}).textContent), mhText: mhr && mhr.textContent, mhCharge: lineCharge(mh) };
  });
  const val = re => { const r = T.rs.find(x => re.test(x[0] || '')); return r ? money(r[1]) : NaN; };
  const total = val(/^Total charge to customer/), catSum = T.cats.reduce((s, k) => s + val(new RegExp('^' + k.replace(/[&]/g, '.') + '$')), 0);
  const typeSum = [/^🔨 Labor/, /^📦 Material/, /^🤝 Subs/, /^🚜 Equipment/, /^⏱ Man-hours/].reduce((s, re) => s + val(re), 0);
  ok(Math.abs(total - T.sum) < 0.006, 'Total charge = sum of the lines (' + total + ')', { total, sum: T.sum });
  ok(Math.abs(catSum - total) < 0.011 * T.cats.length, 'the category rows add up to the total', { catSum, total, cats: T.cats });
  ok(Math.abs(typeSum - total) < 0.03 && !isNaN(val(/^⏱ Man-hours/)), '"By type" rows add up to the total (man-hour lines now have a row)', { typeSum, total });
  ok(Math.abs(val(/^⚠ MS contractor tax/) - T.ms) < 0.006, 'the MS row is the MS tax in the lines (' + val(/^⚠ MS contractor tax/) + '; man-hours carry none)', { row: val(/^⚠ MS contractor tax/), ms: T.ms });
  const shownSum = T.shown.reduce((s, x) => s + money(x), 0);
  ok(Math.abs(shownSum - total) < 0.005 * T.shown.length + 0.001, 'the lines as shown (to the cent) add up to the total within display rounding', { shownSum, total });
  ok(/^16 MH × \$44\.44\/hr cost = \$711\.04 · charged 16 MH × \$75\/hr = \$1200\.00 \(man-hours: hourly rate, no margin, no MS tax\)$/.test(T.mhText || '') && T.mhCharge === 1200, 'man-hour line text: cost, hourly charge, no margin, no MS tax', T.mhText);

  /* proposal from the builder = the builder total */
  const prop = await p.evaluate(() => { let got = null; const o = [window._gcOpenGrayCoProposal, window._gcProposalToPdf, window._gcSaveMasterScope];
    window._gcOpenGrayCoProposal = e => { got = e; }; window._gcProposalToPdf = () => {}; window._gcSaveMasterScope = () => {};
    try { window._gcGenerateMyProposal(); } finally { window._gcOpenGrayCoProposal = o[0]; window._gcProposalToPdf = o[1]; window._gcSaveMasterScope = o[2]; }
    return got && { total: got.totalCharge, lines: got.lines.reduce((s, l) => s + l.charge, 0), want: lines.reduce((s, l) => s + lineCharge(l), 0) }; });
  ok(prop && Math.abs(prop.total - prop.want) < 0.001 && Math.abs(prop.lines - prop.want) < 0.001, '"Save & Create Proposal" total = the builder total (was each line × its qty again)', prop);

  /* ── 4. the real saved estimates: unchanged until saved ─────────────────────────────────────────────────── */
  for (let i = 0; i < 60 && !(await p.evaluate(id => typeof estimates !== 'undefined' && estimates.some(e => e && e.id === id), HY)); i++) await sleep(500);
  await p.evaluate(() => { settings.jobState = 'TN'; });
  const o1 = await p.evaluate(id => { loadEst(id); return { n: lines.length, sig: JSON.stringify(lines.map(l => [l.id, l.desc, +l.qty, +l.cost, l.type, String(l.mult), l.calcNote || ''])), sum: lines.reduce((s, l) => s + lineCharge(l), 0), st: settings.jobState, jm: jobMult }; }, HY);
  await sleep(1500);
  const b1 = await p.evaluate(() => { const b = document.getElementById('gc-estmath-banner'); return b ? b.textContent : ''; });
  const hyS = await rowOf('mvpngoo0sbx');
  console.log('   Hyatt opened: job ' + o1.st + ', margin ' + o1.jm + ', builder total $' + o1.sum.toFixed(2) + ' (saved $' + hyBefore.totalCharge.toFixed(2) + ')');
  console.log('   screws row: ' + hyS.tk);
  ok(o1.sig === lineSig(hyBefore.lines), 'Hyatt opens with its lines exactly as saved (qty 48, $100.14, old note kept)');
  ok(Math.abs(o1.sum - hyBefore.totalCharge) < 0.01, 'Hyatt\'s builder total = its saved total ($' + hyBefore.totalCharge.toFixed(2) + ')', { sum: o1.sum, saved: hyBefore.totalCharge });
  ok(/^Math updated — review\./.test(b1) && /48 screws per board/.test(b1) && /figured at 35/.test(b1) && /Nothing on it was changed/.test(b1), 'banner "Math updated — review" (48 per board now, 35 then, nothing changed)', b1);
  ok(/6,848 sheets × 35 ÷ 5,000\/box = 48 boxes; this line has 48/.test(hyS.tk) && /Now: 6,848 sheets × (48 )?screws\/board = 328,704 screws ÷ 5,000\/box = 66 boxes/.test(hyS.tk.replace(/\s+/g, ' ')) && /Use 66/.test(hyS.tk), 'the screws line shows how its 48 came about (6,848 × 35 ÷ 5,000) and the new count (× 48 = 66 boxes) with "Use 66"', hyS.tk);
  ok(/× 1\.3 \(job margin 23\.1%\)/.test(hyS.math) && /MS contractor tax/.test(hyS.math) && hyS.opt === 'Job margin (1.3x)', 'Hyatt\'s screws text: MS tax and the saved job margin x1.3 (pulldown "Job margin (1.3x)")', hyS);
  const hyCloud = cloudEst(HY);
  ok(hyCloud && lineSig(hyCloud.lines) === lineSig(hyBefore.lines) && hyCloud.totalCharge === hyBefore.totalCharge, 'the saved record (cloud) is unchanged after opening it');
  /* "Use 66" */
  await p.evaluate(() => { const b = document.querySelector('#est-lines [data-lineid="mvpngoo0sbx"] [data-tk-use]'); b.click(); }); await sleep(500);
  const u = await p.evaluate(() => { const l = lines.find(x => x.id === 'mvpngoo0sbx'); return { qty: l.qty, note: l.calcNote, tk: l.takeoff, ov: l.qtyOverride, banner: !!document.getElementById('gc-estmath-banner') }; });
  ok(u.qty === 66 && u.note === '6,848 sheets × 48 = 328,704 screws ÷ 5,000/box = 66 boxes' && u.ov === false && !u.banner && u.tk.srcIds.join() === 'mvpngoo0nj8', '"Use 66": qty 66, note "6,848 sheets × 48 = 328,704 screws ÷ 5,000/box = 66 boxes", linked to the sheets line, banner gone', u);
  await p.evaluate(() => ul('mvpngoo0nj8', 'qty', 6800)); await sleep(600);
  const u2 = await p.evaluate(() => { const l = lines.find(x => x.id === 'mvpngoo0sbx'); return { qty: l.qty, note: l.calcNote }; });
  ok(u2.qty === 66 && u2.note === '6,800 sheets × 48 = 326,400 screws ÷ 5,000/box = 66 boxes', 'sheets 6,848 -> 6,800: the screws line follows (326,400 screws, 66 boxes)', u2);

  /* Studio Res: opened and saved without touching it -> reviewed, qty kept (overridden), total unchanged */
  const o2 = await p.evaluate(id => { loadEst(id); return { sig: JSON.stringify(lines.map(l => [l.id, l.desc, +l.qty, +l.cost, l.type, String(l.mult), l.calcNote || ''])), sum: lines.reduce((s, l) => s + lineCharge(l), 0), banner: (window._gcMathBannerHTML() || '').length > 0 }; }, SR);
  await sleep(800);
  ok(o2.sig === lineSig(srBefore.lines) && Math.abs(o2.sum - srBefore.totalCharge) < 0.01 && o2.banner, 'Studio Res opens as saved (total $' + srBefore.totalCharge.toFixed(2) + ') with the review banner', { sum: o2.sum, saved: srBefore.totalCharge });
  await p.evaluate(() => { document.getElementById('ej-name').value = document.getElementById('ej-name').value || 'Studio Res'; doSave(true); }); await sleep(4000);
  const sv = await p.evaluate(id => { const e = estimates.find(x => x.id === id); const l = e.lines.find(x => x.id === 'mvpeq6ff1xf'), l7 = e.lines.find(x => x.id === 'mvpeq6ffqi0');
    return { tc: e.totalCharge, q: l.qty, ov: l.qtyOverride, note: l.calcNote, tk: !!l.takeoff, q7: l7.qty, ov7: l7.qtyOverride, banner: !!document.getElementById('gc-estmath-banner'), row: (document.querySelector('#est-lines [data-lineid="mvpeq6ff1xf"] [data-tk]') || {}).textContent }; }, SR);
  console.log('   Studio Res after Save: ' + sv.note + ' | ' + sv.row);
  ok(Math.abs(sv.tc - srBefore.totalCharge) < 0.01 && sv.q === 44 && sv.q7 === 7 && sv.tk, 'Save keeps every qty (44 and 7 boxes) and the total ($' + sv.tc.toFixed(2) + ')', sv);
  ok(sv.ov === true && /= 59 boxes · qty overridden to 44$/.test(sv.note) && !sv.banner && /qty overridden/.test(sv.row || '') && /Use 59/.test(sv.row || ''), 'after Save: reviewed (banner gone), 44 shown as "qty overridden" beside the rule\'s 59 boxes', sv);

  /* ── 5. the takeoff from the drywall calculator ─────────────────────────────────────────────────────────── */
  await fresh();
  const k = await p.evaluate(() => {
    settings.jobState = 'TN'; window.__pr.length = 0; window.__prAns = '8000';
    rates.unshift({ id: 'RSCRTEST', desc: 'Drywall screws #6 1-5/8 fine thread box', cost: 100.14, unit: 'box', cat: 'Drywall', type: 'material' });
    dwZones = []; addDwZone(); const z = dwZones[0]; const sz = DW_SIZES.find(s => s.id === z.sizeId) || DW_SIZES[0];
    z.sf = Math.floor(sz.sf * 6800 / 1.05); calcDw(); addCalcToSlot('dw', activeSlot);
    const sc = lines.find(l => /^Drywall screws/.test(l.desc)), bd = lines.find(l => l.unit === 'sheet' && /^Drywall/.test(l.desc));
    return { sheets: bd && bd.qty, q: sc && sc.qty, cost: sc && sc.cost, note: sc && sc.calcNote, tk: sc && sc.takeoff, bd: bd && bd.id, sc: sc && sc.id, asked: window.__pr.slice(), pack: rates.find(r => r.id === 'RSCRTEST').packSize };
  });
  await sleep(500);
  console.log('   calculator: ' + k.note);
  ok(k.sheets === 6800 && k.q === 41 && k.cost === 100.14 && k.note === '6,800 sheets × 48 = 326,400 screws ÷ 8,000/box = 41 boxes', '6,800 sheets × 48 = 326,400 screws ÷ 8,000/box = 41 boxes at $100.14 a box (was: price of ONE box for all)', k);
  ok(k.asked.length === 1 && /How many screws come in one box of "Drywall screws #6 1-5\/8 fine thread box"/.test(k.asked[0]) && k.pack === 8000 && k.tk.packFrom === 'item' && k.tk.srcIds[0] === k.bd, 'no box size on the item: asked once, saved on the item (packSize 8000)', k);
  const k2 = await p.evaluate(() => { window.__pr.length = 0; dwZones = []; addDwZone(); const z = dwZones[0]; z.sf = 4800; z.areaDesc = 'Second'; calcDw(); const n0 = lines.length; addCalcToSlot('dw', activeSlot); const sc = lines.slice(n0).find(l => /^Drywall screws/.test(l.desc)); return { asked: window.__pr.length, note: sc && sc.calcNote }; });
  ok(k2.asked === 0 && /÷ 8,000\/box/.test(k2.note || ''), 'the next takeoff with that item does not ask again (8,000/box from the item)', k2);
  await p.evaluate(id => ul(id, 'qty', 7000), k.bd); await sleep(500);
  let s5 = await p.evaluate(id => { const l = lines.find(x => x.id === id); return { q: l.qty, note: l.calcNote, row: (document.querySelector('#est-lines [data-lineid="' + id + '"] [data-tk]') || {}).textContent }; }, k.sc);
  ok(s5.q === 42 && s5.note === '7,000 sheets × 48 = 336,000 screws ÷ 8,000/box = 42 boxes', 'sheets 6,800 -> 7,000: screws 42 boxes', s5);
  await p.evaluate(id => ul(id, 'qty', 50), k.sc); await sleep(500);
  s5 = await p.evaluate(id => { const l = lines.find(x => x.id === id); return { q: l.qty, ov: l.qtyOverride, note: l.calcNote, row: (document.querySelector('#est-lines [data-lineid="' + id + '"] [data-tk]') || {}).textContent }; }, k.sc);
  ok(s5.q === 50 && s5.ov === true && /qty overridden/.test(s5.row) && /Use 42/.test(s5.row), 'typing 50 boxes is kept and shown "qty overridden" with "Use 42"', s5);
  await p.evaluate(id => ul(id, 'qty', 7200), k.bd); await sleep(500);
  s5 = await p.evaluate(id => { const l = lines.find(x => x.id === id); return { q: l.qty, note: l.calcNote }; }, k.sc);
  ok(s5.q === 50 && /7,200 sheets × 48 = 345,600 screws ÷ 8,000\/box = 44 boxes · qty overridden to 50/.test(s5.note), 'an overridden qty stays when the sheets change (the note shows the rule: 44)', s5);
  await p.evaluate(id => window._gcTkUse(id), k.sc); await sleep(300);
  s5 = await p.evaluate(id => lines.find(x => x.id === id).qty, k.sc);
  ok(s5 === 44, '"Use 44" puts the rule back', s5);
  await p.evaluate(() => { const i = document.querySelector('#est-lines [data-tk-perboard]'); i.value = '32'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(500);
  s5 = await p.evaluate(id => { const l = lines.find(x => x.id === id); return { q: l.qty, note: l.calcNote, pb: openSlots[activeSlot].screwsPerBoard }; }, k.sc);
  ok(s5.q === 29 && s5.note === '7,200 sheets × 32 = 230,400 screws ÷ 8,000/box = 29 boxes' && s5.pb === 32, 'screws per board edited to 32 for this estimate: 230,400 screws, 29 boxes', s5);
  const cg = await p.evaluate(id => { const l = lines.find(x => x.id === id); return [lineBaseCost(l), lineCharge(l), l.qty * l.cost]; }, k.sc);
  ok(Math.abs(cg[0] - 29 * 100.14 * 1.0975) < 1e-6, 'the screws cost is boxes × price per box (+ tax)', cg);

  /* ── 6. opening a saved estimate keeps man-hour / equipment lines and the takeoff fields ───────────────── */
  const o6 = await p.evaluate(() => {
    const ls = [{ id: 'K1', desc: 'Lift rental', qty: 2, cost: 300, type: 'equipment', cat: 'General', mult: 'type' }, { id: 'K2', desc: 'Finisher', qty: 8, cost: 44.44, type: 'mh', cat: 'Drywall', mult: 'type' },
      { id: 'K3', desc: 'Drywall screws — Keep', qty: 3, cost: 50, type: 'material', cat: 'Drywall', mult: 'type', unit: 'box', calcNote: '100 sheets × 48 = 4,800 screws ÷ 2,000/box = 3 boxes', takeoff: { rule: 'dwScrews', srcIds: [], perBoard: 48, perBox: 2000, sheets: 100, packFrom: 'item' } }];
    estimates.push({ id: 'KEEP1', name: 'Keep types', num: 'K1', status: 'Draft', jobMult: 'mat', lines: ls, totalCharge: 0 }); loadEst('KEEP1');
    return lines.map(l => [l.type, l.calcNote || '', !!l.takeoff]); });
  ok(o6[0][0] === 'equipment' && o6[1][0] === 'mh' && o6[2][2] && /= 3 boxes$/.test(o6[2][1]), 'equipment and man-hour lines open as themselves (they came back as taxed materials); takeoff kept', o6);
  await sleep(800);
  ok(c.errs.length === 0, 'no page errors', c.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL test crashed: ' + (e && e.stack || e)); }
console.log(pass + ' passed, ' + fail + ' failed'); await c.b.close(); process.exit(fail ? 1 : 0);
