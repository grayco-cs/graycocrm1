// test_BARSTILL.mjs <build-dir> [secs] — patches BARSTILL + BARSTILL2: nothing jumps on the Leads page, and no card sits
//   above the Leads header.
//   Owner's screenshots (Leads, desktop): "🧹 Sales & spam: nothing waiting [Review]" and "📥 N new leads — not assigned
//   yet … · Checked 11:33 AM" were "lagging back and forth" (both patches re-inserted their bar directly above #gc-leads-hub
//   every 1.5 s, so they swapped) "and why is it up here". BARSTILL2: two small chips in ONE fixed slot of the Leads header
//   row (#gc-leads-chips): "🧹 2 to review" (only when something waits) and "📥 30 new · 3 held [Open]" + a ↻ icon (the
//   checked time is its tooltip).
//   Part 1 (no browser): the chip-slot helper from index.html on a tiny fake DOM (order, never moved when in place, off,
//   mount after a redraw) and the source (the slot in the hub's header, no insert above the hub for these bars).
//   Part 2 (offline harness GC_HARNESS, the real-data mirror MIRROR, owner, 1400×900): opens Leads and records <secs>
//   (default 60): the chips' order / place, every insert that MOVES a chip already on the page (and the code that did
//   it), every content change inside the chips, layout shifts (PerformanceObserver 'layout-shift'). Then Review / Open /
//   ↻ Check now, and "nothing waiting → no 🧹 chip". GC_NO_BROWSER=1 runs part 1 only.
//   Browser tests: one at a time, under the shared browser lock.
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const BUILD = path.resolve(process.argv[2] || ''); if (!process.argv[2]) { console.error('usage: node test_BARSTILL.mjs <build-dir> [secs]'); process.exit(2); }
const SECS = +(process.argv[3] || process.env.SECS || 60);
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

/* ── Part 1: no browser ── */
console.log('Part 1 — the chip slot (no browser)');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const helper = (/<script id="gc-patch-barstill">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
ok(/\/\* patch BARSTILL \*\//.test(helper) && /\/\* patch BARSTILL2 \*\//.test(helper), 'index.html carries patch BARSTILL + BARSTILL2 (the helpers)');
/* a tiny DOM: elements with ids, children, insertBefore / remove / querySelector('#id') */
class El {
  constructor(id, tag){ this.id = id || ''; this.tagName = (tag || 'SPAN').toUpperCase(); this.children = []; this.parentNode = null; this.moves = 0; }
  get firstElementChild(){ return this.children[0] || null; }
  get nextElementSibling(){ const p = this.parentNode; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; }
  get previousElementSibling(){ const p = this.parentNode; if (!p) return null; return p.children[p.children.indexOf(this) - 1] || null; }
  get isConnected(){ let e = this; while (e.parentNode) e = e.parentNode; return e === DOC.root; }
  insertBefore(n, ref){ if (n.parentNode) { if (n.isConnected) n.moves++; n.remove(); } const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentNode = this; return n; }
  appendChild(n){ return this.insertBefore(n, null); }
  remove(){ const p = this.parentNode; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
  querySelector(sel){ const id = sel.replace(/^#/, ''); for (const c of this.children) { if (c.id === id) return c; const r = c.querySelector(sel); if (r) return r; } return null; }
}
const DOC = { root: new El('', 'html'), head: null, getElementById(id){ return id ? DOC.root.querySelector('#' + id) : null; }, createElement(t){ return new El('', t); } };
DOC.head = new El('head', 'head'); DOC.root.appendChild(DOC.head);
DOC.documentElement = DOC.root;
const main = new El('main', 'main'); DOC.root.appendChild(main);
function drawHub(){   /* the hub draws its header: a NEW slot each time (innerHTML) */
  let hub = DOC.getElementById('gc-leads-hub'); if (!hub) { hub = new El('gc-leads-hub', 'div'); main.appendChild(hub); }
  hub.children.forEach(c => { c.parentNode = null; }); hub.children = [];
  const top = new El('top', 'div'); hub.appendChild(top); top.appendChild(new El('views')); top.appendChild(new El('gc-leads-chips')); top.appendChild(new El('more'));
  return hub;
}
const W = { document: DOC }; W.window = W;
try { vm.runInNewContext(helper, W); } catch (e) { ok(false, 'the helper script runs', String(e)); }
const CH = W._gcLeadsChips;
ok(!!CH && typeof CH.on === 'function' && typeof CH.mount === 'function', 'window._gcLeadsChips is there');
if (CH) {
  let hub = drawHub();
  const sb = new El('gcsb-strip'), ls = new El('gc-leadsee');
  CH.on(ls, hub); CH.on(sb, hub);
  const ids = () => hub.querySelector('#gc-leads-chips').children.map(c => c.id).join(',');
  ok(ids() === 'gcsb-strip,gc-leadsee', 'fixed order in the header slot: 🧹 then 📥 (whoever came first)', ids());
  sb.moves = 0; ls.moves = 0;
  for (let i = 0; i < 200; i++) { CH.on(ls, hub); CH.on(sb, hub); }
  ok(sb.moves + ls.moves === 0 && ids() === 'gcsb-strip,gc-leadsee', '200 ticks of both painters: no chip moved', { sb: sb.moves, ls: ls.moves });
  ok(!main.children.some(c => c.id === 'gcsb-strip' || c.id === 'gc-leadsee'), 'nothing placed above the hub');
  hub = drawHub(); CH.mount(hub);
  ok(ids() === 'gcsb-strip,gc-leadsee', 'a hub redraw: the same chip elements back in the new slot, same order', ids());
  CH.off(sb); ok(ids() === 'gc-leadsee' && !sb.parentNode, 'off(): the 🧹 chip is gone (nothing waiting)', ids());
  hub = drawHub(); CH.mount(hub); ok(ids() === 'gc-leadsee', 'and stays gone after a redraw', ids());
  CH.on(sb, hub); ok(ids() === 'gcsb-strip,gc-leadsee', 'back on: first again', ids());
  hub.children = []; CH.on(ls, hub); ok(!ls.parentNode, 'no header slot (another tab): the chip is nowhere, never above the header');
}
const leadsee = (/<script id="gc-patch-leadsee">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
const salesP = (/<script id="gc-patch-salesblock">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
ok(/<span id="gc-leads-chips"/.test(html) && /W\._gcLeadsChips\.mount\(hub\)/.test(html), 'the Leads hub header has the slot and puts the chips back in the same step as a redraw');
ok(!/insertBefore\(el, hub\)/.test(leadsee) && !/insertBefore\(el, hub\)/.test(salesP) && !/_gcLeadsBar\.place/.test(leadsee + salesP), 'neither bar is inserted above the Leads list any more');
ok(/CH\.off\(el\)/.test(salesP) && /to review<\/button>/.test(salesP), 'SALESBLOCK: nothing when nothing waits, "🧹 N to review" when something does');
ok(/' new<\/b>'/.test(leadsee) && /held until 5 PM for an admin/.test(leadsee) && /class="ic" data-gcls="check"/.test(leadsee) && /data-gcls="open"/.test(leadsee), 'LEADSEE: "📥 N new · H held [Open]" chip (hold text in its tooltip) + ↻ icon');

if (process.env.GC_NO_BROWSER) { console.log((fail ? '✗ ' : '✓ ') + 'BARSTILL (part 1): ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

/* ── Part 2: the page ── */
console.log('Part 2 — Leads on the real-data mirror (offline harness, owner)');
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, cloud, ACCOUNTS } = await import(pathToFileURL(HARNESS).href);
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const OWNER = 'wjohnson@grayco-cs.com';
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const c = await computer('owner', { build: BUILD }); c.acceptConfirm = false;
const SB = []; let HELD = 2;
await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, r => {
  const u = new URL(r.request().url());
  if (/salesblock/.test(u.pathname)) { SB.push(u.search); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u.searchParams.get('count') ? { ok: true, held: HELD } : { ok: true, held: [], done: [], counts: {} }) }); }
  if (/bid-inbox/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [] }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access|gc_admin_kv)/.test(u), async r => {
  const u = new URL(r.request().url()), m = r.request().method();
  const J = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
  if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname.endsWith('/gc_staff')) return J(200, [{ email: OWNER, role: 'admin', active: true, name: '', payroll: true }]);
  if (u.pathname.endsWith('/gc_my_access')) return J(200, { email: OWNER, staff: true, admin: true, payroll: true, office: false, sec2: 1 });
  return m === 'GET' ? J(200, []) : J(201, '');
});
await c.ctx.addInitScript(() => {
  try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
  /* the recorder: moves of a chip already on the page (who moved it), content changes in the chips, layout shifts */
  const R = window.__BS = { on: false, moves: [], shifts: [], allShifts: 0, html: [], order: [], t0: 0 };
  const BARS = ['gcsb-strip', 'gc-leadsee'];
  const inBar = n => { for (let e = n && (n.nodeType === 1 ? n : n.parentElement); e; e = e.parentElement) if (BARS.includes(e.id)) return e.id; return ''; };
  const where = () => (new Error().stack || '').split('\n').slice(3, 6).map(x => x.trim().replace(/https:\/\/app\.local\/index\.html/, 'index.html')).join(' < ');
  const rec = (n, how) => { if (R.on && n && n.nodeType === 1 && BARS.includes(n.id) && n.isConnected) R.moves.push({ t: Date.now() - R.t0, id: n.id, how, by: where() }); };
  ['insertBefore', 'appendChild'].forEach(k => { const f = Node.prototype[k]; Node.prototype[k] = function(n){ try { rec(n, k); } catch (e) {} return f.apply(this, arguments); }; });
  ['before', 'after', 'prepend', 'append'].forEach(k => { const f = Element.prototype[k]; Element.prototype[k] = function(){ try { [].slice.call(arguments).forEach(n => rec(n, k)); } catch (e) {} return f.apply(this, arguments); }; });
  try {
    new PerformanceObserver(l => { if (!R.on) return; l.getEntries().forEach(e => { if (e.hadRecentInput) return; R.allShifts++;
      const src = (e.sources || []).map(s => { const n = s.node; if (!n) return '?'; const e2 = n.nodeType === 1 ? n : n.parentElement; return (e2 && (e2.id || inBar(e2) || (e2.closest && e2.closest('#gc-leads-hub') ? 'hub>' + e2.tagName : e2.tagName))) || '?'; });
      R.shifts.push({ t: Math.round(e.startTime - R.p0), v: +e.value.toFixed(4), src }); }); }).observe({ type: 'layout-shift', buffered: false });
  } catch (e) {}
  /* where the chips are: above the hub (a card — must not happen), in the header slot (in order), or elsewhere */
  R.where = () => { const hub = document.getElementById('gc-leads-hub'); if (!hub) return 'nohub';
    const above = [].slice.call(hub.parentNode.children).slice(0, [].indexOf.call(hub.parentNode.children, hub)).map(x => x.id).filter(x => BARS.includes(x));
    const sl = document.getElementById('gc-leads-chips'); const inSlot = sl ? [].slice.call(sl.children).map(x => x.id) : null;
    const inTop = !!(sl && sl.closest('.gclu-top') && hub.contains(sl));
    return 'above:' + above.join('+') + '|slot' + (inTop ? '@header' : '@?') + ':' + (inSlot ? inSlot.join('+') : 'none'); };
  R.start = () => {
    R.t0 = Date.now(); R.p0 = performance.now(); R.on = true; R.moves.length = 0; R.html.length = 0; R.shifts.length = 0; R.allShifts = 0; R.order.length = 0;
    R.order.push({ t: 0, o: R.where() });
    const txt = id => { const e = document.getElementById(id); return e ? e.textContent : null; };
    const last = {}; BARS.forEach(id => { last[id] = txt(id); });
    if (!R.mo) { R.mo = new MutationObserver(ms => {
      if (!R.on) return;
      const o = R.where(); if (o !== R.order[R.order.length - 1].o) R.order.push({ t: Date.now() - R.t0, o });
      const hit = {}; ms.forEach(m => { const b = inBar(m.target); if (b) hit[b] = 1; });
      Object.keys(hit).forEach(id => { const t = txt(id); R.html.push({ t: Date.now() - R.t0, id, same: t === last[id], from: (last[id] || '').slice(0, 120), to: (t || '').slice(0, 120) }); last[id] = t; });
    }); R.mo.observe(document.body, { subtree: true, childList: true, characterData: true }); }
    if (!R.iv) R.iv = setInterval(() => { if (!R.on) return; const o = R.where(); if (o !== R.order[R.order.length - 1].o) R.order.push({ t: Date.now() - R.t0, o, poll: 1 }); }, 200);
  };
});
const p = c.page(); await p.setViewportSize({ width: 1400, height: 900 });
await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(OWNER); await p.locator('#gc-auth-password').fill(ACCOUNTS[OWNER].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === OWNER) break; }
const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await waitFor(c, () => document.querySelectorAll('aside nav button, aside button[draggable="true"]').length > 5 && !document.getElementById('gc-auth-email'), null, 90000, 500);
await sleep(4000);
await c.ev(() => window._setView('leads'));
const up = await waitFor(c, () => !!(document.getElementById('gc-leads-hub') && document.getElementById('gcsb-strip') && document.getElementById('gc-leadsee')), null, 90000, 400);
ok(!!up, 'Leads open: the hub and both chips (🧹 2 waiting, 📥 new leads) are on screen', await c.ev(() => window.__BS.where()));
await sleep(5000);   /* settle: the first paints, the first inbox check */
const first = await c.ev(() => {
  const hub = document.getElementById('gc-leads-hub'), top = hub && hub.querySelector('.gclu-top'), sb = document.getElementById('gcsb-strip'), ls = document.getElementById('gc-leadsee');
  const r = e => e ? e.getBoundingClientRect() : null;
  const above = hub ? [].slice.call(hub.parentNode.children).slice(0, [].indexOf.call(hub.parentNode.children, hub)).filter(x => x.offsetHeight > 0 && x.getBoundingClientRect().width > 300 && /gcsb|leadsee|lead|inbox|spam/i.test(x.id + ' ' + x.className + ' ' + x.textContent.slice(0, 200))).map(x => x.id || x.className) : ['nohub'];
  const ic = ls && ls.querySelector('button.ic');
  return { where: window.__BS.where(), sb: sb && sb.textContent, ls: ls && ls.textContent, lsTip: ls && (ls.querySelector('.c') || {}).title, icTip: ic && ic.title, above,
    sbH: sb && Math.round(r(sb).height), lsH: ls && Math.round(r(ls).height), topH: top && Math.round(r(top).height), sbW: sb && Math.round(r(sb).width), lsW: ls && Math.round(r(ls).width) };
});
console.log('  · ' + JSON.stringify(first).slice(0, 700));
ok(/^above:\|slot@header:gcsb-strip\+gc-leadsee$/.test(first.where), 'both chips in the Leads header row, fixed order 🧹 then 📥, nothing above the header', first.where);
ok(first.above.length === 0, 'no card sits above the Leads header', first.above);
ok(/^🧹 2 to review$/.test((first.sb || '').trim()), '🧹 chip: "🧹 2 to review"', first.sb);
ok(/^📥 \d+ new( · \d+ held)? Open↻$/.test((first.ls || '').trim()) || /^↻$/.test((first.ls || '').trim()), '📥 chip: "📥 N new · H held [Open]" + ↻ (or just ↻ with no new leads)', first.ls);
ok(/Check now · (Checked|Not checked|Checking)/.test(first.icTip || ''), '↻ has the checked time as its tooltip', first.icTip);
ok(!/\d+ new/.test(first.ls || '') || /not assigned yet/.test(first.lsTip || ''), 'the chip\'s tooltip keeps the long text (not assigned yet / held until 5 PM)', first.lsTip);
ok(first.sbH <= 34 && first.lsH <= 34 && first.sbW < 300 && first.lsW < 360, 'they are small chips, not cards', first);
await c.ev(() => window.__BS.start());
console.log('  · recording ' + SECS + ' s on Leads …');
await sleep(SECS * 1000);
const R = await c.ev(() => { const R = window.__BS; R.on = false; return { moves: R.moves, shifts: R.shifts, allShifts: R.allShifts, html: R.html, order: R.order, where: R.where() }; });
const byWho = {}; R.moves.forEach(m => { const k = m.id + ' ← ' + m.by.split(' < ')[0]; byWho[k] = (byWho[k] || 0) + 1; });
console.log('  · chip moves in ' + SECS + ' s: ' + R.moves.length + ' ' + JSON.stringify(byWho).slice(0, 900));
console.log('  · place changes: ' + (R.order.length - 1) + ' ' + JSON.stringify(R.order.slice(0, 4)).slice(0, 600));
const rew = R.html.filter(h => h.same), chg = R.html.filter(h => !h.same);
console.log('  · chip content changes: ' + R.html.length + ' (same text: ' + rew.length + ') ' + JSON.stringify(chg.slice(0, 3)).slice(0, 600));
const barShift = R.shifts.filter(s => s.src.some(x => /^(gcsb-strip|gc-leadsee|gc-leads-chips|gc-leads-hub)$|^hub>/.test(x)));
console.log('  · layout shifts: ' + R.allShifts + ' (chips / hub: ' + barShift.length + ') ' + JSON.stringify(R.shifts.slice(0, 6)).slice(0, 600));
ok(R.order.length === 1, 'zero position swaps / place changes of the chips in ' + SECS + ' s', R.order.slice(0, 6));
ok(R.moves.length === 0, 'no code re-inserted a chip that was already in place', R.moves.slice(0, 4));
ok(barShift.length === 0, 'zero layout shifts from the chips or the hub', barShift.slice(0, 6));
ok(rew.length === 0, 'a chip\'s content is rewritten only when its visible text changes', rew.slice(0, 4));
ok(/^above:\|slot@header:gcsb-strip\+gc-leadsee$/.test(R.where), 'still in the header, same order, after ' + SECS + ' s', R.where);
ok(SB.filter(q => /count=1/.test(q)).length >= 1 && SB.filter(q => /count=1/.test(q)).length <= 3, 'the Sales & spam count was asked (not every tick)', SB);
/* the actions: ↻ Check now, Open, Review → (the list says nothing waits) → the 🧹 chip goes, nothing above the header */
await c.ev(() => window.__BS.start());
const re = await c.ev(async () => { const b = document.querySelector('#gc-leadsee button.ic'); if (b) b.click(); const w = b && b.textContent; await new Promise(r => setTimeout(r, 4000)); const ic = document.querySelector('#gc-leadsee button.ic');
  return { w, after: ic && ic.textContent, tip: ic && ic.title, moves: window.__BS.moves.length, where: window.__BS.where() }; });
ok(re.w === '…' && re.after === '↻' && /Check now/.test(re.tip || '') && re.moves === 0 && /slot@header:gcsb-strip\+gc-leadsee$/.test(re.where), '↻ Check now still works (… while checking), nothing moves', re);
const op = await c.ev(async () => { const b = document.querySelector('#gc-leadsee [data-gcls="open"]'); if (!b) return 'no-open'; b.click(); await new Promise(r => setTimeout(r, 1500)); const t = document.getElementById('gc-leads-tabs'); const tab = t && t.getAttribute('data-tab');
  const back = t && t.querySelector('[data-gc-tab="leads"]'); if (back) back.click(); await new Promise(r => setTimeout(r, 2500)); return tab; });
ok(op === 'bidboard' || op === 'no-open', 'Open → the Lead Inbox tab', op);
await waitFor(c, () => !!document.getElementById('gcsb-strip'), null, 15000, 300);
HELD = 0;
const rv = await c.ev(async () => { const b = document.querySelector('#gcsb-strip [data-gcsb="open"]'); if (!b) return { err: 'no 🧹 chip' }; b.click(); await new Promise(r => setTimeout(r, 2000));
  const ov = !!document.getElementById('gcsb-ov'); const x = document.querySelector('#gcsb-ov [data-a="close"]'); if (x) x.click(); await new Promise(r => setTimeout(r, 2500));
  return { ov, chip: !!document.getElementById('gcsb-strip'), where: window.__BS.where() }; });
ok(rv.ov, 'Review (the 🧹 chip) opens the Sales & spam list', rv);
ok(!rv.chip && /^above:\|slot@header:gc-leadsee$/.test(rv.where), 'nothing waiting: no 🧹 chip at all (and nothing above the header)', rv);
const errs = c.errs.filter(e => !/ResizeObserver loop/.test(e));
ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
await c.b.close();
console.log((fail ? '✗ ' : '✓ ') + 'BARSTILL: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
