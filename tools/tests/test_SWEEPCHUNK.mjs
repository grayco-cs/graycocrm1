// test_SWEEPCHUNK.mjs <build-dir> — patch SWEEPCHUNK: a sync reads a chunked list's chunks only when its manifest changed.
// Offline harness, made-up data: "vendors" kept as vendors__manifest + 2 chunks. After sign-in, three forced pulls must not
// read the chunks again; the records from the chunks are on this computer; a changed manifest (a new chunk record) is read
// on the next pull and arrives; with the kill switch (gc_sweepchunk_off) every pull reads them again (the old behaviour).
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, resetCloud, cset, signIn } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_SWEEPCHUNK.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (m, c, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 300) : '')); } };
resetCloud();
cset('users', [{ id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'P1', name: 'Demo Job', client: 'Sample Homeowner', status: 'Active', pm: 'Demo Owner', address: '1 Demo St' }]);
const V = i => ({ id: 'VND' + i, name: 'Demo Vendor ' + i, phone: '', email: 'v' + i + '@example.invalid' });
cset('vendors', [V(0)]);
cset('vendors__chunk0', [V(1), V(2)]); cset('vendors__chunk1', [V(3), V(4)]);
cset('vendors__manifest', { chunked: true, count: 2, total: 4, at: '2026-10-29T01:00:00.000Z' });
const c = await computer('SC', { build });
await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
await signIn(c, 'wjohnson@grayco-cs.com', 25000);
const p = c.page();
const chunkReads = since => c.log.filter(x => x.t >= since && x.method === 'GET' && /vendors__chunk/.test(x.q)).length;
const local = () => p.evaluate(async () => { let v = null; try { v = window.idbGet ? await window.idbGet('vendors') : null; } catch (e) {} if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } const crm = (window._crm && window._crm.vendors) || []; return [...new Set([].concat(v || [], crm).map(x => x && x.id).filter(Boolean))]; });
const pull = () => p.evaluate(async () => { try { window.__GC_SYNC_NOW__ = true; await window._gcPullChanged(); } catch (e) {} finally { window.__GC_SYNC_NOW__ = false; } });
await pull(); await sleep(1500);
const ids0 = await local();
ok('the chunk records are on this computer after sign-in', ['VND1', 'VND2', 'VND3', 'VND4'].every(i => ids0.includes(i)), ids0);
let t = Date.now(); for (let i = 0; i < 3; i++) { await pull(); await sleep(800); }
ok('three forced pulls with an unchanged manifest read no chunk again', chunkReads(t) === 0, chunkReads(t));
const memo = await p.evaluate(() => window.__gcManifestMemo && window.__gcManifestMemo.vendors && { reads: window.__gcManifestMemo.vendors.reads, hits: window.__gcManifestMemo.vendors.hits });
ok('the memo answered those pulls', memo && memo.hits >= 3, memo);
cset('vendors__chunk1', [V(3), V(4), V(5)]); cset('vendors__manifest', { chunked: true, count: 2, total: 5, at: '2026-10-29T02:00:00.000Z' });
t = Date.now(); for (let i = 0; i < 3 && chunkReads(t) < 2; i++) { await pull(); await sleep(1500); }
const memo2 = await p.evaluate(() => window.__gcManifestMemo && window.__gcManifestMemo.vendors && { sig: window.__gcManifestMemo.vendors.sig, reads: window.__gcManifestMemo.vendors.reads });
ok('a changed manifest is read within the next pulls', chunkReads(t) >= 2, { reads: chunkReads(t), memo2 });
const ids1 = await local();
ok('the new chunk record arrived', ids1.includes('VND5'), ids1);
await p.evaluate(() => localStorage.setItem('gc_sweepchunk_off', '1'));
t = Date.now(); await pull(); await sleep(1200);
ok('kill switch gc_sweepchunk_off: the chunks are read again (old behaviour)', chunkReads(t) >= 2, chunkReads(t));
ok('no page errors', c.errs.length === 0, c.errs.slice(0, 3));
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
await c.b.close(); process.exit(fail ? 1 : 0);
