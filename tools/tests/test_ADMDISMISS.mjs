// test_ADMDISMISS.mjs <build-dir> — patch ADMDISMISS on the real-data mirror, in the offline two-device harness:
//  • a ✕ on a ⚙ Admin card stays dismissed after a reload and on a second computer (gc_kv "gc_adm_dismiss__<e-mail>");
//  • it comes back only on new content (fewer items keep it hidden; a new failing invoice / a different pair brings it back);
//  • 🔕 7 days; "Show again";
//  • the old nightly data-check card is hidden while DATAFULL's 🧾 Missing job data board is on ("Open list" → the board);
//  • the pay check reads the invoice's sub field, not its file name (the invoice-22902 case), "Pick the sub" when none is set,
//    "＋ Add to Subs list" / "Mark as supplier" for a name not on the Subs list;
//  • the navy ⚙ Admin rows are white now (screenshot: SHOT, default the scratchpad's admdismiss_rows.png).
// Usage: node test_ADMDISMISS.mjs <dir with index.html>. NOBROWSER=1: the offline part only (Node vm, the page's own scripts).
// The browser part: run it alone, under the scratchpad's browser_lock.sh.
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { pathToFileURL } from 'url';
const build = path.resolve(process.argv[2] || '.');
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SHOT = process.env.SHOT || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/admdismiss_rows.png';
const SHOT2 = SHOT.replace(/\.png$/, '_top.png');
const EMAIL = 'wjohnson@grayco-cs.com', KEY = 'gc_adm_dismiss__' + EMAIL;
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const section = t => console.log('== ' + t);

/* ═══ offline (Node vm, no browser): the page's own scripts — AUTO6 (as patched) and the ADMDISMISS helper ═══ */
const PAGE = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const scriptById = id => { const i = PAGE.indexOf('<script id="' + id + '">'); if (i < 0) return null; const a = PAGE.indexOf('>', i) + 1; return PAGE.slice(a, PAGE.indexOf('</script>', a)); };
const offRows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const offVal = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
const offGet = k => offVal((offRows.find(r => r.key === k) || {}).v);
function fakeWindow(ls, extra){
  const el = () => ({ style: {}, setAttribute(){}, appendChild(){}, remove(){}, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } });
  const D = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, addEventListener(){}, head: el(), body: el(), documentElement: el(), hidden: false };
  const store = ls || new Map();
  const W = Object.assign({ document: D, console, JSON, Math, Date, Promise, Object, Array, String, Number, RegExp, Error, isFinite, parseFloat, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, setInterval: () => 0, clearInterval(){}, getComputedStyle: () => ({}), location: { origin: 'https://app.local', hash: '' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }, confirm: () => true, fetch: () => Promise.reject(new Error('offline')) }, extra || {});
  W.window = W; return W;
}
section('offline: the pay check on the real-data mirror (AUTO6 as patched)');
{
  const subs = offGet('subs'), invs = offGet('invs');
  const extra = [{ id: 'INVOFFNOSUB', type: 'sub', pid: 'PRJ0evqm2s6m36', sub: 'invoice-40404', fileName: 'invoice-40404.pdf', desc: 'Uploaded: invoice-40404.pdf', amt: 99, status: 'received' }];
  const q = offGet('gc_sub_approvals').concat([{ id: 'invId:INVOFFNOSUB', invId: 'INVOFFNOSUB', sub: 'invoice-40404', amt: 99, pid: 'PRJ0evqm2s6m36', status: 'pending_pm' }]);
  const ls = new Map([['gc_sub_approvals', JSON.stringify(q)]]);
  const W = fakeWindow(ls, { _crm: { invoices: invs.concat(extra), subs, vendors: [], projects: offGet('projects') || [], users: offGet('users') } });
  vm.runInNewContext(scriptById('gc-patch-auto6'), W);
  const r1 = W._gcSubPayCheck('INV0cn960fkw35'), r2 = W._gcSubPayCheck('INVOFFNOSUB');
  console.log('    invoice-22902.pdf → ' + JSON.stringify({ sub: r1.sub, subId: r1.subId, problems: r1.problems }));
  ok(/^Rapid Air/.test(r1.sub) && r1.subId === 'SUBfk2webh' && !r1.problems.some(p => /invoice-22902/.test(p)), 'mirror: invoice-22902.pdf (invs: sub "invoice-22902", subId SUBfk2webh) is checked as the picked sub, Rapid Air — not as "invoice-22902"', r1);
  ok(r2.noSub && /^Pick the sub — this invoice has no sub set \(only its file name, “invoice-40404\.pdf”\)\.$/.test(r2.problems[0]), 'no sub set: "Pick the sub …", not "\'invoice-40404\' is not on the Subs list"', r2.problems);
  const ws = []; (W._gcAdmExtraWarnings || []).forEach(f => { try { (f() || []).forEach(x => ws.push(x)); } catch (e) {} });
  const sp = ws.find(x => x.id === 'sub-pay-check');
  ok(sp && /Rapid Air/.test(sp.text) && /Sub not picked/.test(sp.text) && !/invoice-22902[^<]*is not on the Subs list/.test(sp.text) && sp.fixes[0].label === 'Pick the sub', 'the Admin card: the sub by name, "Sub not picked", a "Pick the sub" button', sp && { text: sp.text.slice(0, 300), fixes: sp.fixes.map(f => f.label) });
  ok(sp && Array.isArray(sp.items) && sp.items.every(x => /^inv:[^|]+$/.test(x)), 'its content is one item per failing invoice (for the ✕)', sp && sp.items);
  const cantor = "Cantor Property Services LLC (America's Best Carpet & Tile)";
  W._crm.invoices.push({ id: 'INVOFFCAN', type: 'sub', pid: 'PRJ0evqm2s6m36', sub: cantor, amt: 1020.96, status: 'received' });
  q.push({ id: 'invId:INVOFFCAN', invId: 'INVOFFCAN', sub: cantor, amt: 1020.96, status: 'pending_pm' }); ls.set('gc_sub_approvals', JSON.stringify(q));
  const ws2 = []; W._gcAdmExtraWarnings.forEach(f => { try { (f() || []).forEach(x => ws2.push(x)); } catch (e) {} });
  const sp2 = ws2.find(x => x.id === 'sub-pay-check'), labels = sp2 ? sp2.fixes.map(f => f.label) : [];
  ok(labels.some(l => /^＋ Add “Cantor Property Servic.*” to Subs list$/.test(l)) && labels.some(l => /^Mark “Cantor Property Servic.*” as supplier$/.test(l)) && /“Cantor Property Services LLC \(America&#39;s Best Carpet &amp; Tile\)” is not on the Subs list/.test(sp2.text), 'a name not on the Subs list stays flagged, with "＋ Add to Subs list" / "Mark as supplier"', labels);
  /* the old nightly card vs DATAFULL */
  const tasks = offVal(offGet('gc_office_tasks')); ls.set('gc_office_tasks', JSON.stringify(tasks));
  const oldOn = () => { const o = []; W._gcAdmExtraWarnings.forEach(f => { try { (f() || []).forEach(x => o.push(x)); } catch (e) {} }); return o.find(x => x.id === 'data-check') || null; };
  const without = oldOn(); W._gcDataFull = { state: () => ({ canSee: true }), open(){ W.__boardOpened = (W.__boardOpened || 0) + 1; } };
  const withDf = oldOn(); const lst = W._gcOpenDataCheck();
  ok(without && /found 150 things/.test(without.title) && withDf === null, 'the old "Last night’s data check found 150 things" card: shown without DATAFULL, not shown with its board (mirror has no duplicate customers)', { without: without && without.title, with: withDf && withDf.title });
  ok(lst === null && W.__boardOpened === 1, '"Open list" opens the 🧾 Missing job data board');
}
section('offline: the dismissal helper (two computers, one cloud)');
{
  const cloud = new Map();
  const fetchFor = () => async (url, o) => { const u = new URL(url); if ((o && o.method) === 'POST') { const b = JSON.parse(o.body); cloud.set(b.key, b.value); return { ok: true, json: async () => [] }; }
    const k = decodeURIComponent((u.searchParams.get('key') || '').replace(/^eq\./, '')); return { ok: true, json: async () => cloud.has(k) ? [{ value: cloud.get(k) }] : [] }; };
  const SRC = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'admdismiss.js'), 'utf8');
  const comp = (ls) => { ls = ls || new Map([['grayco_sb_key', 'anon'], ['grayco_view', 'dashboard']]); const W = fakeWindow(ls, { __GC_AUTH__: { email: () => EMAIL }, fetch: fetchFor() }); vm.runInNewContext(SRC, W); return { W, ls }; };
  const flush = () => new Promise(f => setTimeout(f, 30));
  /* the clock: +ms from now (the helper reads Date.now) */
  const real = Date.now; let shift = 0; Date.now = () => real() + shift; const later = ms => { shift += ms; };
  try {
    const pay = (ids, loading) => ({ id: 'sub-pay-check', key: 'subpay', level: 'red', title: ids.length + ' sub invoices fail the pay check', text: '', items: ids.map(i => 'inv:' + i), loading: !!loading });
    const dup = (a, b, e) => ({ id: 'dup-email', key: e, title: a + ' and ' + b + ' both use ' + e, text: 'for example <b>x' + Math.random() + '@grayco-cs.com</b>' });
    const sp = { id: 'name-spaces', key: 'U1', title: '“Steven Biffle ” has extra spaces in the name', text: 'EDIT → Name' };
    const store = { id: undefined, title: '💾 File storage is 82% full', text: 'Admin → 💾 Storage' };
    const A1 = comp(); await flush();
    const HA = () => A1.W._gcAdmDismiss;
    HA().dismiss(pay(['I1', 'I2']), 0); HA().dismiss(dup('Brittany Pucket', 'Office', 'office@grayco-cs.com'), 0); HA().dismiss(sp, 0); HA().dismiss(store, 0);
    ok(HA().hidden(pay(['I1', 'I2', 'I0'])), 'right after the ✕ the card is still loading: what shows up then is part of what was dismissed');
    later(100000); await flush(); await flush(); await new Promise(f => setTimeout(f, 3200)); await flush();
    const row = offVal(cloud.get('gc_adm_dismiss__' + EMAIL));
    ok(row && Object.keys(row.cards).length === 4 && row.email === EMAIL && row.cards['sub-pay-check:subpay'].h.length === 3, 'saved in the cloud per person: gc_kv gc_adm_dismiss__<e-mail>, one entry per card (with what loaded after the ✕)', row && Object.keys(row.cards).map(k => k + ':' + (row.cards[k].h || []).length));
    const A2 = comp(A1.ls); await flush();
    ok(A2.W._gcAdmDismiss.hidden(pay(['I1', 'I2', 'I0'])) && A2.W._gcAdmDismiss.hidden(sp), 'a reload (same computer): still hidden');
    const B1 = comp(); await B1.W._gcAdmDismiss.pull();
    const H = B1.W._gcAdmDismiss;
    ok(H.hidden(pay(['I2', 'I0', 'I1'])) && H.hidden(sp) && H.hidden(dup('Brittany Pucket', 'Office', 'office@grayco-cs.com')), 'a second computer (empty storage): hidden, from the cloud (any order)');
    ok(H.hidden(pay(['I2'])), 'fewer items: stays hidden');
    ok(H.hidden(pay(['I1', 'I2', 'I3'])), 'a new failing invoice that just showed up: not yet (the lists may still be loading)');
    later(20000); ok(H.hidden(pay(['I1', 'I2', 'I3'], true)), 'while the card says it is loading: never new');
    later(30000); ok(!H.hidden(pay(['I1', 'I2', 'I3'])), 'a new failing invoice that stayed 45 s: back');
    ok(H.hidden(pay(['I1', 'I4'])), 'one that only flickered in: not back');
    ok(!H.hidden(dup('Nick Thomas', 'Steven Biffle', 'sbiffle@grayco-cs.com')) && H.hidden(dup('Office', 'Brittany Pucket', 'office@grayco-cs.com')), 'a different pair on one e-mail shows (no ✕ on it); the same pair in the other order stays hidden');
    ok(H.hidden({ id: undefined, title: '💾 File storage is 85% full', text: 'Admin → 💾 Storage' }), 'a number changing on a card is not new content');
    H.dismiss(pay(['I3']), 7); later(100000); await new Promise(f => setTimeout(f, 3200)); await flush();
    ok(H.hidden(pay(['I0', 'I1', 'I2', 'I3'])), 'dismissing again keeps what was dismissed before (I0–I2) and adds I3');
    let d3, d8, newIn7;
    const base = shift;
    shift = base + 3 * 864e5; d3 = H.hidden(pay(['I1', 'I2', 'I3'])); H.hidden(pay(['I1', 'I5'])); shift += 50000; newIn7 = H.hidden(pay(['I1', 'I5']));
    shift = base + 8 * 864e5; d8 = H.hidden(pay(['I1', 'I2', 'I3'])); shift = base;
    ok(d3 && !d8 && !newIn7, '🔕 7 days: hidden on day 3, back on day 8, back sooner on new content', { d3, d8, newIn7 });
    await A2.W._gcAdmDismiss.pull();
    ok(A2.W._gcAdmDismiss.until(pay(['I1'])) !== '' && A2.W._gcAdmDismiss.hidden(pay(['I0', 'I1', 'I2', 'I3'])), 'the first computer picks the 7-day hide up from the cloud (newest change per card wins)');
    H.restore(H.keyOf(sp)); await flush(); await flush(); await A2.W._gcAdmDismiss.pull();
    ok(!A2.W._gcAdmDismiss.hidden(sp), '"Show again" on one computer shows it on the other');
  } finally { Date.now = real; }
}
if (process.env.NOBROWSER === '1') { console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
const H = await import(pathToFileURL(HARNESS).href);

/* ── the mirror + two test sub invoices (only in the test cloud). The rest of the pay check's list is the real data's:
   the test reads what the page says fails (window._gcSubPayFails) and checks the card against that. ── */
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const val = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
H.resetCloud(); rows.forEach(r => { if (!/^gc_cc_token/.test(r.key)) H.cset(r.key, r.v); });
const get = k => val((rows.find(r => r.key === k) || {}).v);
const PID = (get('invs') || []).find(x => x.id === 'INV0cn960fkw35').pid;
const PAYEE = 'Zzyzx Test Payee LLC';   /* on no list, anywhere */
const extraInv = [
  { id: 'INVADMDNOSUB1', type: 'sub', pid: PID, sub: 'invoice-31337', desc: 'Uploaded: invoice-31337.pdf', fileName: 'invoice-31337.pdf', amt: 1500, status: 'received', source: 'upload', recvDate: '2026-11-01', updatedAt: '2026-11-01T12:00:00.000Z' },
  { id: 'INVADMDPAYEE', type: 'sub', pid: PID, sub: PAYEE, desc: 'E-mailed invoice', amt: 1020.96, status: 'received', source: 'email', recvDate: '2026-11-01', updatedAt: '2026-11-01T12:00:00.000Z' }];
const extraRows = extraInv.map(iv => ({ id: 'invId:' + iv.id, invId: iv.id, sub: iv.sub, amt: iv.amt, pid: PID, desc: iv.desc, status: 'pending_pm', pmName: 'Nick Thomas', createdAt: Date.now(), updatedAt: '2026-11-01T12:00:00.000Z' }));
['invs', 'invoices'].forEach(k => H.cset(k, (get(k) || []).concat(extraInv)));
H.cset('gc_sub_approvals', extraRows.concat(get('gc_sub_approvals') || []));
const dcItem = (val(get('gc_office_tasks')) || []).find(t => t.id === 'DATACHECK_NIGHTLY');
console.log('    mirror: DATACHECK_NIGHTLY refs ' + (dcItem ? dcItem.refs.length : 'none') + ' · note “' + (dcItem ? dcItem.note.slice(0, 80) : '') + '”');

async function device(name){
  const c = await H.computer(name, { build });
  await c.ctx.route(u => /\/\.netlify\/functions\//.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
  await c.page().setViewportSize({ width: 1366, height: 900 });
  return c;
}
const fails = c => c.ev(() => window._gcSubPayFails());
/* signed in, ⚙ Admin open, the cloud dismissals pulled, and the pay check's lists settled (loaded, the approvals queue
   rebuilt, the same failing invoices on two reads 6 s apart) */
async function ready(c){
  await H.waitFor(c, () => (window._crm && (window._crm.projects || []).length > 20 && typeof window._gcSubPayFails === 'function' && window._gcAdmDismiss && typeof window._gcAdmPaintTop === 'function') || null, null, 120000, 500);
  await c.ev(() => { try { window._gcRA && window._gcRA.hide(); } catch (e) {} window._setView('admin'); });
  await H.waitFor(c, () => { const t = document.getElementById('gc-adm-top'); return t && t.querySelector('.gc-adm-roles') ? true : null; }, null, 60000, 400);
  await H.waitFor(c, () => { try { return window._gcAdmDismiss.state().pulledAt > 0 && !window._gcSubPayLoading() && JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]').some(a => a.invId === 'INVADMDPAYEE') || null; } catch (e) { return null; } }, null, 90000, 500);
  let prev = '', same = 0;
  for (let i = 0; i < 20 && same < 1; i++) { const ids = (await fails(c)).map(x => x.id).sort().join(','); if (ids === prev) same++; else { same = 0; prev = ids; } await H.sleep(6000); }
  await c.ev(() => window._gcAdmPaintTop()); await H.sleep(600);
}
const cards = c => c.ev(() => [...document.querySelectorAll('#gc-adm-warns .gc-adm-warn')].map(el => ({ id: el.getAttribute('data-adm-warn'), text: el.textContent, btns: [...el.querySelectorAll('button')].map(b => b.textContent) })));
const card = async (c, id) => (await cards(c)).find(x => x.id === id) || null;
const clickIn = (c, id, label) => c.ev(([id, label]) => { const el = document.querySelector('#gc-adm-warns [data-adm-warn="' + id + '"]'); const b = el && [...el.querySelectorAll('button')].find(x => x.textContent.trim() === label || x.textContent.indexOf(label) === 0); if (b) b.click(); return !!b; }, [id, label]);
const cloudCards = () => { const v = val(H.cget(KEY)); return v && v.cards ? v.cards : {}; };
async function waitCloud(fn, ms = 20000){ const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn(cloudCards())) return true; await H.sleep(400); } return false; }
/* past the 45 s a new item has to stay before a card comes back, repainting */
async function settledCards(c, ms = 52000){ await H.sleep(ms); await c.ev(() => window._gcAdmPaintTop()); await H.sleep(400); return cards(c); }
const short = n => n.length > 26 ? n.slice(0, 25) + '…' : n;

const A = await device('A'); let B = null;
try {
  section('sign in (admin) → ⚙ Admin');
  await H.signIn(A, EMAIL, 9000); await ready(A);

  section('the pay check reads the invoice\'s sub field, not its file name');
  const pc = await A.ev(() => ['INV0cn960fkw35', 'INVADMDNOSUB1', 'INVADMDPAYEE'].map(id => { const r = window._gcSubPayCheck(id); return { id, sub: r.sub, subId: r.subId, ok: r.ok, noSub: !!r.noSub, notListed: !!r.notListed, problems: r.problems }; }));
  console.log('    ' + JSON.stringify(pc).slice(0, 600));
  ok(/rapid air/i.test(pc[0].sub) && pc[0].subId === 'SUBfk2webh' && !pc[0].problems.some(p => /invoice-22902/.test(p)), 'invoice-22902.pdf (picked sub: Rapid Air, subId) is checked as Rapid Air — its own COI / W-9 — not as “invoice-22902”', pc[0]);
  ok(pc[1].noSub && pc[1].sub === '' && /^Pick the sub/.test(pc[1].problems[0]) && !pc[1].problems.some(p => /is not on the Subs list/.test(p)), 'an uploaded invoice with no sub set: “Pick the sub”, not “‘invoice-31337’ is not on the Subs list”', pc[1]);
  ok(pc[2].notListed && pc[2].problems[0] === '“' + PAYEE + '” is not on the Subs list — no COI or W-9 on file.', 'a name on no list still says so', pc[2]);
  const so = await A.ev(() => window._gcSubOfInvoice('INV0cn960fkw35'));
  ok(so.subId === 'SUBfk2webh' && so.file === 'invoice-22902.pdf', 'the file name is known as the file, the sub by its id', so);

  section('the cards at the top of ⚙ Admin (checked against what the page says fails)');
  let all = await cards(A);
  const F = await fails(A);
  console.log('    cards: ' + all.map(x => x.id).join(', ') + ' · failing: ' + F.map(x => (x.noSub ? '(no sub)' : x.sub) + (x.notListed ? ' [not listed]' : '')).join(' | ').slice(0, 400));
  ok(F.some(x => x.id === 'INVADMDNOSUB1') && F.some(x => x.id === 'INVADMDPAYEE'), 'the two test invoices are among the failing ones', F.map(x => x.id));
  ok(!F.some(x => x.notListed && /^invoice[-_ ]?\d+$/i.test(x.sub)), 'no failing invoice uses a file name as its sub', F.filter(x => x.notListed).map(x => x.sub));
  const sp = all.find(x => x.id === 'sub-pay-check');
  const first4 = F.slice(0, 4), unl = []; F.forEach(x => { if (x.notListed && x.sub && unl.indexOf(x.sub) < 0) unl.push(x.sub); });
  ok(sp && new RegExp('^⛔' + F.length + ' sub invoices? fail the pay check').test(sp.text), 'the pay check card counts them (' + F.length + ')', sp && sp.text.slice(0, 60));
  ok(sp && first4.every(x => x.noSub ? /Sub not picked/.test(sp.text) : sp.text.indexOf(x.sub) >= 0) && !/invoice-\d+” is not on the Subs list/.test(sp.text), 'it lists the first four by the sub’s name (“Sub not picked” when there is none) — never “invoice-… is not on the Subs list”', sp && sp.text.slice(0, 400));
  const wantBtns = [F.some(x => x.noSub) ? 'Pick the sub' : 'Open approvals'].concat(...unl.slice(0, 2).map(n => ['＋ Add “' + short(n) + '” to Subs list', 'Mark “' + short(n) + '” as supplier']), ['🔕 7 days', '✕']);
  ok(sp && JSON.stringify(sp.btns) === JSON.stringify(wantBtns), 'its buttons: ' + wantBtns.join(' · '), sp && sp.btns);
  const dupC = all.find(x => x.id === 'dup-email' && /both use \S+@/.test(x.text));
  ok(dupC && all.some(x => x.id === 'name-spaces' && /Steven Biffle/.test(x.text)), 'the two-people-one-e-mail and extra-spaces cards are there (real data)', dupC && dupC.text.slice(0, 120));

  section('no duplicate data-check cards');
  ok(await A.ev(() => window._gcDataFull.state().canSee) === true, 'the 🧾 Missing job data board (DATAFULL) is on for this admin');
  ok(!all.some(x => x.id === 'data-check' && /Last night’s data check found/.test(x.text)), 'the old “🧹 Last night’s data check found 150 things” card is not shown while the board is on', all.filter(x => x.id === 'data-check'));
  const old = await A.ev(() => { const F = window._gcDataFull, st = F.state; F.state = function(){ return Object.assign(st(), { canSee: false }); }; window._gcAdmPaintTop(); const el = document.querySelector('#gc-adm-warns [data-adm-warn="data-check"]'); const t = el ? el.textContent : null; F.state = st; window._gcAdmPaintTop(); return t; });
  ok(old && /Last night’s data check found \d+ thing/.test(old) && /Open list/.test(old), 'without the board (DATAFULL off) the old card is still there, as before', old && old.slice(0, 160));
  const brd = await A.ev(async () => { const r = window._gcOpenDataCheck(); await new Promise(f => setTimeout(f, 800)); const ov = document.getElementById('gc-df-ov'); const old6 = document.querySelector('.gc-a6-ov'); const out = { board: !!ov, oldList: !!old6, ret: r === null }; try { window._gcDataFull.close(); } catch (e) {} if (old6) old6.remove(); return out; });
  ok(brd.board && !brd.oldList, '“Open list” (the Office To-Do item’s too) opens the 🧾 Missing job data board', brd);
  await A.page().screenshot({ path: SHOT2 });

  section('✕ stays dismissed: reload, second computer');
  ok(await clickIn(A, 'name-spaces', '✕') && await clickIn(A, 'dup-email', '✕'), '✕ on “Steven Biffle has extra spaces” and on “… both use …@”');
  await H.sleep(300);
  ok(await clickIn(A, 'sub-pay-check', '✕'), '✕ on “' + F.length + ' sub invoices fail the pay check”');
  await H.sleep(800);
  all = await cards(A);
  ok(!all.some(x => ['name-spaces', 'dup-email', 'sub-pay-check'].includes(x.id)), 'gone at once (the three cards)', all.map(x => x.id));
  const foot = await A.ev(() => { const f = document.querySelector('#gc-adm-top .gc-adm-hidden'); return f ? f.textContent : ''; });
  ok(/🔕 3 hidden cards/.test(foot), 'under the cards: “🔕 3 hidden cards”', foot);
  ok(await waitCloud(cc => ['name-spaces:', 'dup-email:', 'sub-pay-check:subpay'].every(k => Object.keys(cc).some(x => x.indexOf(k) === 0))), 'saved in the cloud for this person (gc_kv ' + KEY + ')', Object.keys(cloudCards()));
  const rec = cloudCards()['sub-pay-check:subpay'];
  ok(rec && Array.isArray(rec.h) && rec.h.length >= F.length && rec.by === EMAIL && !rec.until, 'the record: one hash per failing invoice (' + F.length + '), who, no end date', rec);
  all = await settledCards(A);
  ok(!all.some(x => ['name-spaces', 'dup-email', 'sub-pay-check'].includes(x.id)), 'a minute later: still gone', all.map(x => x.id));
  await A.page().reload(); await H.sleep(3000);
  if (await A.page().locator('#gc-auth-email').count() && await A.page().locator('#gc-auth-email').isVisible()) await H.signIn(A, EMAIL, 9000);
  await ready(A); all = await settledCards(A);
  ok(!all.some(x => ['name-spaces', 'dup-email', 'sub-pay-check'].includes(x.id)), 'after a reload (lists settled, + a minute): still gone', all.map(x => x.id));

  B = await device('B');
  await H.signIn(B, EMAIL, 9000); await ready(B);
  const bLocal = await B.ev(() => { try { return JSON.parse(localStorage.getItem('gc_adm_dismiss_local') || '{}'); } catch (e) { return 'err'; } });
  const FB = await fails(B);
  all = await settledCards(B);
  ok(!all.some(x => ['name-spaces', 'dup-email', 'sub-pay-check'].includes(x.id)), 'on a second computer (from the cloud; lists settled, + a minute): still gone',
    { cards: all.map(x => x.id), failingA: F.map(x => x.id), failingB: FB.map(x => x.id), localB: Object.keys(bLocal || {}) });

  section('it comes back only on new content');
  const fewer = await B.ev(() => { const q = JSON.parse(localStorage.getItem('gc_sub_approvals')); localStorage.setItem('gc_sub_approvals', JSON.stringify(q.filter(a => a.invId !== 'INVADMDNOSUB1'))); window._gcAdmPaintTop(); const hid = !document.querySelector('#gc-adm-warns [data-adm-warn="sub-pay-check"]'); localStorage.setItem('gc_sub_approvals', JSON.stringify(q)); window._gcAdmPaintTop(); return hid; });
  ok(fewer, 'one failing invoice fewer: the pay check card stays hidden');
  const pair = await B.ev(() => { const C = window._crm, keep = C.users; C.users = keep.map(u => u.name === 'Nick Thomas' ? Object.assign({}, u, { email: 'sbiffle@grayco-cs.com' }) : u); window._gcAdmPaintTop();
    const t = [...document.querySelectorAll('#gc-adm-warns [data-adm-warn="dup-email"]')].map(x => x.querySelector('b.h').textContent); C.users = keep; window._gcAdmPaintTop(); return t; });
  ok(pair.length === 1 && /both use sbiffle@grayco-cs.com/.test(pair[0]), 'a different pair on one e-mail shows (the dismissed pair stays hidden)', pair);
  const addNew = () => B.ev(() => { const C = window._crm; if (!C.invoices.some(x => x.id === 'INVADMDNEW1')) C.invoices = C.invoices.concat([{ id: 'INVADMDNEW1', type: 'sub', pid: C.invoices.find(x => x.id === 'INV0cn960fkw35').pid, sub: 'Brand New Sub Co', amt: 777, status: 'received' }]);
    const q = JSON.parse(localStorage.getItem('gc_sub_approvals')); if (!q.some(a => a.invId === 'INVADMDNEW1')) { q.unshift({ id: 'invId:INVADMDNEW1', invId: 'INVADMDNEW1', sub: 'Brand New Sub Co', amt: 777, pid: C.invoices.find(x => x.id === 'INV0cn960fkw35').pid, status: 'pending_pm' }); localStorage.setItem('gc_sub_approvals', JSON.stringify(q)); }
    window._gcAdmPaintTop(); const el = document.querySelector('#gc-adm-warns [data-adm-warn="sub-pay-check"]'); return el ? el.textContent : null; });
  const soon = await addNew();
  ok(!soon, 'a NEW failing invoice that just showed up: not yet (it has to stay 45 s)');
  let back = null; for (let i = 0; i < 14 && !back; i++) { await H.sleep(5000); back = await addNew(); }
  ok(back && /Brand New Sub Co/.test(back), 'it stayed: the pay check card is back', back && back.slice(0, 200));
  all = await cards(B);
  ok(!all.some(x => x.id === 'name-spaces' || (x.id === 'dup-email' && !/sbiffle/.test(x.text))), 'the others stay hidden');

  section('＋ Add to Subs list / Mark as supplier');
  B.acceptConfirm = true;
  const lbl = 'Mark “' + short(PAYEE) + '” as supplier';
  const viaBtn = await clickIn(B, 'sub-pay-check', lbl);
  if (!viaBtn) await B.ev(n => window._gcAddPayee(n, true), PAYEE);   /* two other names on the real list come first */
  ok(true, (viaBtn ? 'clicked ' : 'called window._gcAddPayee for ') + lbl + ' (confirm: OK)');
  const sup = await H.waitFor(B, () => { const r = window._gcSubPayCheck('INVADMDPAYEE'); return r.ok && r.supplier ? r : null; }, null, 15000, 500);
  ok(sup && sup.ok && sup.supplier, 'its invoice now passes as a supplier’s (SUPPLIERPAY rule)', sup);
  ok(B.dialogs.some(d => d.indexOf('confirm: Mark “' + PAYEE) === 0), 'only after a confirm', B.dialogs.slice(-2));

  section('🔕 Hide for 7 days');
  await B.ev(() => window._gcAdmPaintTop()); await H.sleep(300);
  ok(await clickIn(B, 'sub-pay-check', '🔕 7 days'), '🔕 7 days on the pay check card');
  await H.sleep(500);
  ok(!(await card(B, 'sub-pay-check')), 'hidden');
  ok(await waitCloud(cc => cc['sub-pay-check:subpay'] && cc['sub-pay-check:subpay'].until && Date.parse(cc['sub-pay-check:subpay'].until) - Date.now() > 6.9 * 864e5), 'saved with an end date 7 days out', cloudCards()['sub-pay-check:subpay']);
  const snz = cloudCards()['sub-pay-check:subpay'];
  ok(snz && rec && rec.h.every(x => snz.h.indexOf(x) >= 0), 'and it keeps what was dismissed on the first computer (the content only grows)');
  const t3 = await B.ev(() => { const n0 = Date.now; Date.now = () => n0() + 3 * 864e5; try { window._gcAdmPaintTop(); return !!document.querySelector('#gc-adm-warns [data-adm-warn="sub-pay-check"]'); } finally { Date.now = n0; } });
  const t8 = await B.ev(() => { const n0 = Date.now; Date.now = () => n0() + 8 * 864e5; try { window._gcAdmPaintTop(); return !!document.querySelector('#gc-adm-warns [data-adm-warn="sub-pay-check"]'); } finally { Date.now = n0; window._gcAdmPaintTop(); } });
  ok(!t3 && t8, 'still hidden 3 days later; back after 7 days', { day3: t3, day8: t8 });
  const a7 = await A.ev(async () => { await window._gcAdmDismiss.pull(); window._gcAdmPaintTop(); const st = window._gcAdmDismiss.state().cards['sub-pay-check:subpay']; return { hidden: !document.querySelector('#gc-adm-warns [data-adm-warn="sub-pay-check"]'), until: st && st.until }; });
  ok(a7.hidden && a7.until, 'the first computer picks the 7-day hide up from the cloud', a7);

  section('Show again');
  const sh = await A.ev(async () => { document.querySelector('#gc-adm-top [data-adm-showhid]').click(); await new Promise(f => setTimeout(f, 200));
    const rows = [...document.querySelectorAll('#gc-adm-top .gc-adm-hrow2')]; const i = rows.findIndex(r => /Steven Biffle/.test(r.textContent)); if (i < 0) return { rows: rows.map(r => r.textContent) };
    rows[i].querySelector('[data-adm-unhide]').click(); await new Promise(f => setTimeout(f, 300)); return { back: !!document.querySelector('#gc-adm-warns [data-adm-warn="name-spaces"]'), rows: rows.map(r => r.textContent.slice(0, 60)) }; });
  ok(sh.back, '“🔕 N hidden” lists them; “Show again” brings “Steven Biffle” back', sh);
  ok(await waitCloud(cc => Object.keys(cc).some(k => k.indexOf('name-spaces:') === 0 && cc[k].clr)), 'and for every computer (the cloud record says so)');

  section('the ⚙ Admin rows are white');
  const rowsSt = await H.waitFor(A, () => { const ids = ['gc-aut3-admin', 'gc-auto5-admin', 'gc-ja-admin', 'gc-x9-admin']; const els = ids.map(i => document.getElementById(i)); if (els.slice(0, 2).some(e => !e || !e.classList.contains('gc-admd-white'))) return null;
    const st = e => { const cs = getComputedStyle(e), b = e.querySelector('button'), bs = b ? getComputedStyle(b) : null; return { bg: cs.backgroundColor, color: cs.color, btn: bs && bs.backgroundColor, btnColor: bs && bs.color, text: e.textContent.slice(0, 120) }; };
    const mr = [...document.querySelectorAll('main details.gc-mailrecv')].map(e => getComputedStyle(e).backgroundColor);
    return { sched: st(els[0]), arch: st(els[1]), ja: els[2] && st(els[2]), x9: els[3] && st(els[3].firstElementChild), mail: mr }; }, null, 20000, 500);
  console.log('    ' + JSON.stringify(rowsSt).slice(0, 700));
  const white = x => x && x.bg === 'rgb(255, 255, 255)' && x.color === 'rgb(15, 23, 42)' && x.btn !== 'rgb(212, 160, 23)' && x.btnColor === 'rgb(255, 255, 255)';
  ok(rowsSt && white(rowsSt.sched) && white(rowsSt.arch), '🗓 Schedule templates and 🗄 Year-end archive: white card, dark text, a colored button with white text (no navy / gold)', rowsSt);
  ok(rowsSt && rowsSt.mail.every(b => b === 'rgb(255, 255, 255)'), '📬 Mail received on ⚙ Admin: white too', rowsSt && rowsSt.mail);
  ok(rowsSt && /Schedule templates · picked by a person when making a job’s schedule/.test(rowsSt.sched.text) && !/when it is signed/.test(rowsSt.sched.text), 'Schedule templates: “picked by a person when making a job’s schedule”', rowsSt && rowsSt.sched.text);
  const navyLeft = await A.ev(() => { const h1 = [...document.querySelectorAll('main h1')].find(x => x.textContent.trim() === 'Admin'); return [...h1.parentNode.querySelectorAll(':scope > [id^="gc-"], :scope > details')].filter(e => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(e).backgroundColor); return m && (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 80 && +m[3] > +m[1]; }).map(e => e.id || e.className); });
  ok(navyLeft.length === 0, 'no navy row left on ⚙ Admin', navyLeft);
  await A.ev(() => { const e = document.getElementById('gc-aut3-admin'); e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
  await H.sleep(500);
  await A.page().screenshot({ path: SHOT });
  const sz = fs.statSync(SHOT).size;
  ok(sz > 20000, 'screenshot of the rows: ' + SHOT + ' (' + sz + ' bytes)');

  const errs = A.errs.concat(B.errs).filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::|Load failed/i.test(e));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
} finally {
  await A.b.close().catch(() => {}); if (B) await B.b.close().catch(() => {});
}
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
