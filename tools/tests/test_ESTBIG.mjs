// test_ESTBIG.mjs <build-dir> <mirror.json> — patch ESTBIG on REAL data (a read-only mirror of production gc_kv, kept
// outside git: customer data; also GC_MIRROR=<path>). Offline harness (mock Supabase), the owner signed in.
//   1. opening the 6,440-line estimate the way the office does (Estimates -> open) never blocks the page over 1 s
//      (MAXTASK, default 1000 ms), and "Show more" does not either;
//   2. the duplicate sweep's merge no longer appends one record's lines to another's;
//   3. _gcEstDedupe({ dryRun: true }) reports the right counts (the same as tools/estbig_repair_offline.mjs);
//   4. a wrong confirm writes nothing; confirm "DEDUPE <n>" leaves one copy of each different line (order kept, first
//      copy kept, same total), a backup row in gc_kv, the owner-to-check estimate untouched;
//   5. the estimate heal does not bring the bloated copy back over the cleaned one; the cleaned estimate opens fast;
//   6. no page errors.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url'; import { execFileSync } from 'child_process';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, cloud, cget, signIn } = await import(pathToFileURL(HARNESS).href);
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3] || process.env.GC_MIRROR;
if (!BUILD || !MIRROR) { console.error('usage: node test_ESTBIG.mjs <build-dir> <mirror.json>   (or GC_MIRROR=<mirror.json>)'); process.exit(2); }
const MAXTASK = +(process.env.MAXTASK || 1000), ID = 'mst75wl8bjx', WHO = 'wjohnson@grayco-cs.com';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const arr = v => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return Array.isArray(v) ? v : []; };
const cloudEst = id => arr(cget('estimates')).find(e => e && e.id === id);
const before = JSON.parse(JSON.stringify(cloudEst(ID) || null)), seflId = 'mvjw3ml1jho', seflBefore = JSON.stringify(cloudEst(seflId) || null);
if (!before) { console.error('the mirror has no estimate ' + ID); process.exit(2); }

/* expected numbers, from the offline planner (the same plan() the page runs) */
let offline = null;
try {
  const tmp = path.join(os.tmpdir(), 'estbig_plan_' + process.pid + '.json');
  execFileSync('node', [path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'estbig_repair_offline.mjs'), MIRROR, '--html', path.join(BUILD, 'index.html'), '--json', tmp], { stdio: 'ignore' });
  offline = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.rmSync(tmp, { force: true });
} catch (e) { offline = null; }
const lineKey = l => JSON.stringify([String(l.desc == null ? '' : l.desc).replace(/\s+/g, ' ').trim(), parseFloat(l.qty) || 0, parseFloat(l.cost) || 0, String(l.type || 'labor'), String(l.cat || 'General'), String(l.mult || 'type')]);
const firstKeys = L => { const s = new Set(), o = []; L.forEach(l => { const k = lineKey(l); if (!s.has(k)) { s.add(k); o.push(k); } }); return o; };

const c = await computer('EB', { build: BUILD }); c.acceptConfirm = false;
const LT = []; await c.ctx.exposeBinding('__ebLT', (s, at, d) => LT.push({ at, d }));
await c.ctx.addInitScript(() => {
  try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
  try { new PerformanceObserver(l => l.getEntries().forEach(e => { try { window.__ebLT(Math.round(performance.timeOrigin + e.startTime), Math.round(e.duration)); } catch (x) {} })).observe({ type: 'longtask', buffered: true }); } catch (e) {}
});
const race = (p, ms) => Promise.race([p.then(v => ({ v }), e => ({ e: String(e && e.message || e) })), sleep(ms).then(() => ({ timeout: true }))]);
/* run fn in the page, then watch WATCH ms: the longest task and the slowest answer of the page */
async function watch(fn, arg, ms = 12000, until){
  const p = c.page(); const t0 = Date.now(); let hb = 0, doneAt = 0;
  const run = p.evaluate(fn, arg);
  while (Date.now() - t0 < ms || (until && !doneAt && Date.now() - t0 < 60000)) {
    if (until && !doneAt && await race(p.evaluate(until), 5000).then(x => x.v)) doneAt = Date.now();
    if (doneAt && Date.now() - doneAt > 4000 && Date.now() - t0 >= Math.min(ms, 6000)) break; const a = Date.now(); const x = await race(p.evaluate(() => 1), 90000); hb = Math.max(hb, Date.now() - a); if (x.timeout) { hb = 90000; break; } await sleep(100); }
  const r = await race(run, 60000);
  const lt = LT.filter(x => x.at >= t0 - 20).map(x => x.d).sort((a, b) => b - a);
  return { ret: r.v, err: r.e, lt: lt[0] || 0, hb };
}
try {
  await signIn(c, WHO, 15000);
  const p = c.page();
  await sleep(15000);
  await watch(() => { window._setView('estimates'); }, null, 8000);

  /* 1. open it the way the office does: Estimates -> the estimate (EST3 -> Estimate Builder) */
  const drawn = () => document.querySelectorAll('#est-lines .el[data-lineid]').length > 0;
  const o1 = await watch(id => { window._gcOpenEstimateDetail(id); return 1; }, ID, 15000, drawn);
  let s1 = await p.evaluate(() => ({ rows: document.querySelectorAll('#est-lines .el[data-lineid]').length, more: !!document.getElementById('gc-estbig-more'), moreText: ((document.getElementById('gc-estbig-more') || {}).textContent || '').slice(0, 160) }));
  if (!s1.rows) {   /* the builder was still loading ("try again in a moment"): open it again, as a person would */
    const why = await p.evaluate(() => ({ view: document.body.innerText.match(/still loading[^\n]*|not on this computer[^\n]*/i) && document.body.innerText.match(/still loading[^\n]*|not on this computer[^\n]*/i)[0], ov: !!document.getElementById('_gcEstDetailOv') }));
    console.log('   first open drew nothing: ' + JSON.stringify(why) + ' — opening again');
    const o1b = await watch(id => { window._gcOpenEstimateDetail(id); return 1; }, ID, 15000, drawn);
    o1.lt = Math.max(o1.lt, o1b.lt); o1.hb = Math.max(o1.hb, o1b.hb);
    s1 = await p.evaluate(() => ({ rows: document.querySelectorAll('#est-lines .el[data-lineid]').length, more: !!document.getElementById('gc-estbig-more'), moreText: ((document.getElementById('gc-estbig-more') || {}).textContent || '').slice(0, 160) }));
  }
  console.log('   open: longest task ' + o1.lt + ' ms, slowest page answer ' + o1.hb + ' ms, lines drawn ' + s1.rows + ' — ' + s1.moreText);
  ok(o1.lt <= MAXTASK, 'opening the 6,440-line estimate never blocks the page over ' + MAXTASK + ' ms (longest task ' + o1.lt + ' ms; was 24,000+ ms)', o1);
  ok(s1.rows > 0 && s1.rows <= 100 && s1.more, 'the builder draws the first 100 lines and offers "Show more"', s1);
  const o2 = await watch(() => { const b = document.querySelector('#gc-estbig-more button'); if (b) b.click(); return !!b; }, null, 8000);
  const s2 = await p.evaluate(() => document.querySelectorAll('#est-lines .el[data-lineid]').length);
  ok(o2.ret === true && s2 === 200 && o2.lt <= MAXTASK, '"Show 100 more" draws 200 lines, longest task ' + o2.lt + ' ms', { o2, s2 });
  const tot = await p.evaluate(() => { const t = document.getElementById('est-summary') || document.querySelector('[id*="summary"]'); return t ? t.textContent.replace(/\s+/g, ' ') : ''; });
  const big = Math.max(0, ...(tot.match(/\$[\d,]+(\.\d+)?/g) || []).map(x => parseFloat(x.replace(/[$,]/g, ''))));
  ok(big > 5e6, 'the summary still counts every line, not only the ones drawn (largest figure $' + Math.round(big).toLocaleString('en-US') + ')', tot.slice(-400));

  /* 2. the sweep's merge no longer appends one record's lines to another's */
  const m2 = await p.evaluate(async () => {
    const mk = (id, n) => ({ id, desc: 'ESTBIG merge probe', date: '2026-01-15', pid: 'PEB1', lines: [1, 2, 3].map(i => ({ id: id + '_l' + i, desc: 'line ' + i, qty: i, cost: 10 })), mats: [{ id: id + '_m', name: 'mat', qty: 1, uc: 5 }], updatedAt: '2026-10-0' + n });
    const old = await window.idbGet('scopes');
    await window.idbSet('scopes', [mk('EBA', 1), mk('EBB', 2)]);
    await window._gcSweepEverything(true);
    const got = await window.idbGet('scopes');
    await window.idbSet('scopes', Array.isArray(old) ? old : []);
    const probe = (got || []).filter(r => r && r.desc === 'ESTBIG merge probe');
    return { kept: probe.length, lines: probe.map(r => (r.lines || []).length), mats: probe.map(r => (r.mats || []).length) };
  });
  ok(m2.kept === 1 && m2.lines[0] === 3 && m2.mats[0] === 1, 'merging two copies keeps one record with its own 3 lines (was 6: both copies\' lines appended)', m2);

  /* 3. dry run */
  const tD = Date.now();
  const d = await p.evaluate(() => window._gcEstDedupe({ dryRun: true }));
  const dWrites = c.log.filter(x => x.t >= tD && x.method === 'POST' && x.path === '/rest/v1/gc_kv' && /gc_estbig|^estimates$/.test((x.keys || []).join(' ') + ' ' + (x.key1 || ''))).length;
  const dS = (d.estimates || []).find(x => x.id === 'mst75wl8bjx'), dF = (d.estimates || []).find(x => x.id === 'mvjw3ml1jho');
  const keys0 = firstKeys(before.lines);
  ok(/^dry run/.test(d.result) && dS && dS.lines[0] === 6440 && dS.lines[1] === keys0.length && dS.lines[1] === 116 && dS.mats.join() === '5100,100' && dS.labor.join() === '765,15',
    'dry run: Shelby 6,440 -> 116 lines, mats 5,100 -> 100, labor 765 -> 15', { result: d.result, dS });
  ok(dS && !dS.totalChanges && Math.abs(dS.totalAfter.charge - before.totalCharge) < 0.05 && dS.willChange, 'dry run: Shelby\'s stored total ($232,515.78) is one copy\'s total — no change, will be cleaned', dS && { stored: dS.totalStored, after: dS.totalAfter });
  ok(dF && dF.ownerToCheck && !dF.willChange && d.n === 1 && d.confirmWith === 'DEDUPE 1', 'dry run: SEFL (one repeated $18 kit line) changes its total -> owner to check, left alone; confirm "DEDUPE 1"', { dF, n: d.n });
  if (offline) ok(JSON.stringify(offline.estimates.map(x => [x.id, x.lines, x.mats, x.labor, x.totalChanges])) === JSON.stringify((d.estimates || []).map(x => [x.id, x.lines, x.mats, x.labor, x.totalChanges])), 'the page\'s dry run and tools/estbig_repair_offline.mjs report the same counts');
  ok(dWrites === 0 && arr(cloudEst(ID).lines).length === 6440, 'the dry run wrote nothing', dWrites);

  /* 4. real run (what the cloud holds now: opening it in the builder may have re-stamped it) */
  const pre = JSON.parse(JSON.stringify(cloudEst(ID))), seflPre = JSON.stringify((cloudEst(seflId) || {}).lines || null);
  ok(pre.totalCharge === before.totalCharge && pre.lines.length === 6440, 'opening it did not change its total or lines', { tc: pre.totalCharge, n: pre.lines.length });
  const bad = await p.evaluate(() => window._gcEstDedupe({ confirm: 'DEDUPE 5' }));
  ok(/^stopped: confirm/.test(bad.result) && arr(cloudEst(ID).lines).length === 6440, 'a wrong confirm stops it and writes nothing', bad.result);
  const real = await p.evaluate(() => window._gcEstDedupe({ confirm: 'DEDUPE 1' }));
  const after = cloudEst(ID);
  console.log('   real run: ' + real.result + ' · saved by ' + real.saved + ' · backups ' + (real.backups || []).join(', '));
  ok(/^cleaned 1/.test(real.result) && after && after.lines.length === 116 && after.mats.length === 100 && after.labor.length === 15, 'the real run leaves 116 lines (100 mats, 15 labor) in the cloud', { result: real.result, n: after && after.lines.length });
  ok(after && JSON.stringify(after.lines.map(lineKey)) === JSON.stringify(firstKeys(pre.lines)), 'one copy of each different line, in the original order (first copies)');
  ok(after && after.lines.every((l, i) => i >= 115 || l.id === pre.lines[i].id), 'the kept lines are the first copies (same ids as the first block)');
  ok(after && after.totalCharge === before.totalCharge && after.totalCost === before.totalCost && after._linesDeduped && after._linesDeduped.lines.join() === '6440,116', 'the stored total is unchanged and the record says what was cleaned', after && after._linesDeduped);
  const bkKey = (real.backups || [])[0], bk = bkKey && cget(bkKey);
  ok(bk && bk.estimate && bk.estimate.lines.length === 6440 && JSON.stringify(bk.estimate) === JSON.stringify(pre), 'a full backup of the estimate is in gc_kv (' + bkKey + ')');
  ok(JSON.stringify((cloudEst(seflId) || {}).lines || null) === seflPre && arr(cloudEst(seflId).lines).length === 69, 'the owner-to-check estimate (SEFL) is untouched (69 lines)');
  ok(real.saved === 'estimate save path', 'saved through the estimate save path (not the direct-write fallback)', real.saved);

  /* 5. the heal keeps the cleaned copy; the cleaned estimate opens fast */
  const h = await p.evaluate(async ([id, old]) => {
    const v2 = (window.storage && await window.storage.get('gc_ests_v2')) || null; let b = []; try { b = JSON.parse(v2 && v2.value || '[]'); } catch (e) {}
    b = b.filter(e => e && e.id !== id); b.push(old);                         /* a computer that still has the bloated (older) copy */
    await window.storage.set('gc_ests_v2', JSON.stringify(b));
    const r = await window._gcHealEstimates({ force: true });
    const crm = await window.idbGet('estimates'); const e = (crm || []).find(x => x && x.id === id);
    return { heal: r, lines: e && e.lines.length };
  }, [ID, before]);
  ok(h.lines === 116, 'the estimate heal keeps the cleaned copy over an older bloated one (' + h.lines + ' lines)', h);
  await sleep(2000);
  const o3 = await watch(id => { window._gcOpenEstimateDetail(id); return 1; }, ID, 10000, drawn);
  const s3 = await p.evaluate(() => ({ rows: document.querySelectorAll('#est-lines .el[data-lineid]').length, more: !!document.getElementById('gc-estbig-more') }));
  ok(s3.rows === 116 && !s3.more && o3.lt <= MAXTASK, 'the cleaned estimate opens with all 116 lines, longest task ' + o3.lt + ' ms', { s3, lt: o3.lt });

  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await race(c.b.close(), 20000);
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
