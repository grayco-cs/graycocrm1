// test_BARSTILL.mjs <build-dir> [secs] — patch BARSTILL: the bars above the Leads list stay still.
//   Owner's screenshot (Leads, desktop): "🧹 Sales & spam: nothing waiting [Review]" and "📥 N new leads — not assigned yet …
//   · Checked 11:33 AM" were "lagging back and forth". Both patches (SALESBLOCK's #gcsb-strip, LEADSEE's #gc-leadsee) insisted
//   on sitting DIRECTLY above #gc-leads-hub, so each tick moved one above the other — a swap every 1.5 s.
//   Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), the real-data mirror (MIRROR), signed in
//   as the owner, desktop 1400×900. Opens Leads and records for <secs> (default 60):
//     · the order of the hub's siblings (every 200 ms and every childList mutation of their parent);
//     · every insertBefore / appendChild / before / after / prepend / append that MOVES an element already in that parent
//       (a re-insert of a host that is already in place), with the code that did it;
//     · every content change inside the bars (text before → after);
//     · layout shifts (PerformanceObserver 'layout-shift') and which nodes shifted.
//   Pass: zero position swaps / moves of the bars, zero layout shifts from the bars or the hub, bars' content rewritten only
//   when the visible text changes, both bars present in the fixed order (Sales & spam, then the new-leads banner), no page errors.
//   Browser tests: one at a time, under the shared browser lock.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, cloud, ACCOUNTS } = await import(pathToFileURL(HARNESS).href);
const BUILD = path.resolve(process.argv[2] || ''); if (!process.argv[2]) { console.error('usage: node test_BARSTILL.mjs <build-dir> [secs]'); process.exit(2); }
const SECS = +(process.argv[3] || process.env.SECS || 60);
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

const OWNER = 'wjohnson@grayco-cs.com';
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const c = await computer('owner', { build: BUILD }); c.acceptConfirm = false;
const SB = [];
await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, r => {
  const u = new URL(r.request().url());
  if (/salesblock/.test(u.pathname)) { SB.push(u.search); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u.searchParams.get('count') ? { ok: true, held: 0 } : { ok: true, held: [], done: [], counts: {} }) }); }
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
  /* the recorder: moves of the hub's siblings (who moved them), content changes in the bars, layout shifts */
  const R = window.__BS = { on: false, moves: [], shifts: [], allShifts: 0, html: [], order: [], t0: 0 };
  const BARS = ['gcsb-strip', 'gc-leadsee'];
  const inBar = n => { for (let e = n && (n.nodeType === 1 ? n : n.parentElement); e; e = e.parentElement) if (BARS.includes(e.id)) return e.id; return ''; };
  const where = () => (new Error().stack || '').split('\n').slice(3, 6).map(x => x.trim().replace(/https:\/\/app\.local\/index\.html/, 'index.html')).join(' < ');
  const hubParent = () => { const h = document.getElementById('gc-leads-hub'); return h && h.parentNode; };
  const watch = (proto, name, nodeArg) => {
    const f = proto[name];
    proto[name] = function(){
      if (R.on) { try { const n = arguments[nodeArg]; const hp = hubParent();
        if (n && n.nodeType === 1 && n.id && hp && n.parentNode === hp && n.isConnected) R.moves.push({ t: Date.now() - R.t0, id: n.id, how: name, by: where() });
      } catch (e) {} }
      return f.apply(this, arguments);
    };
  };
  watch(Node.prototype, 'insertBefore', 0); watch(Node.prototype, 'appendChild', 0);
  ['before', 'after', 'prepend', 'append'].forEach(k => {
    const f = Element.prototype[k];
    Element.prototype[k] = function(){ if (R.on) { try { const hp = hubParent(); [].slice.call(arguments).forEach(n => { if (n && n.nodeType === 1 && n.id && hp && n.parentNode === hp && n.isConnected) R.moves.push({ t: Date.now() - R.t0, id: n.id, how: k, by: where() }); }); } catch (e) {} } return f.apply(this, arguments); };
  });
  try {
    new PerformanceObserver(l => { if (!R.on) return; l.getEntries().forEach(e => { if (e.hadRecentInput) return; R.allShifts++;
      const src = (e.sources || []).map(s => { const n = s.node; if (!n) return '?'; const e2 = n.nodeType === 1 ? n : n.parentElement; return (e2 && (e2.id || inBar(e2) || (e2.closest && e2.closest('#gc-leads-hub') ? 'hub>' + e2.tagName : e2.tagName))) || '?'; });
      R.shifts.push({ t: Math.round(e.startTime - R.p0), v: +e.value.toFixed(4), src }); }); }).observe({ type: 'layout-shift', buffered: false });
  } catch (e) {}
  R.start = () => {
    R.t0 = Date.now(); R.p0 = performance.now(); R.on = true;
    const hp = hubParent(), ord = () => [].slice.call(hubParent() ? hubParent().children : []).map(x => x.id || x.tagName).filter(x => BARS.includes(x) || x === 'gc-leads-hub' || /^gc/.test(x)).join(',');
    R.order.push({ t: 0, o: ord() });
    const txt = id => { const e = document.getElementById(id); return e ? e.textContent : null; };
    const last = {}; BARS.forEach(id => { last[id] = txt(id); });
    new MutationObserver(ms => {
      if (!R.on) return;
      const o = ord(); if (o !== R.order[R.order.length - 1].o) R.order.push({ t: Date.now() - R.t0, o });
      const hit = {}; ms.forEach(m => { const b = inBar(m.target); if (b) hit[b] = 1; });
      Object.keys(hit).forEach(id => { const t = txt(id); R.html.push({ t: Date.now() - R.t0, id, same: t === last[id], from: (last[id] || '').slice(0, 120), to: (t || '').slice(0, 120) }); last[id] = t; });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    setInterval(() => { if (!R.on) return; const o = ord(); if (o !== R.order[R.order.length - 1].o) R.order.push({ t: Date.now() - R.t0, o, poll: 1 }); }, 200);
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
ok('Leads open: the hub, 🧹 Sales & spam and 📥 the new-leads banner are all on screen', !!up, await c.ev(() => ({ hub: !!document.getElementById('gc-leads-hub'), sb: !!document.getElementById('gcsb-strip'), ls: !!document.getElementById('gc-leadsee') })));
await sleep(5000);   /* settle: the first paints, the first inbox check */
const before = await c.ev(() => ({ sb: (document.getElementById('gcsb-strip') || {}).textContent, ls: (document.getElementById('gc-leadsee') || {}).textContent }));
console.log('  · bars: ' + JSON.stringify(before).slice(0, 400));
await c.ev(() => window.__BS.start());
console.log('  · recording ' + SECS + ' s on Leads …');
await sleep(SECS * 1000);
const R = await c.ev(() => { const R = window.__BS; R.on = false; const r = (id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top) : null; };
  return { moves: R.moves, shifts: R.shifts, allShifts: R.allShifts, html: R.html, order: R.order, tops: { sb: r('gcsb-strip'), ls: r('gc-leadsee'), hub: r('gc-leads-hub') } }; });
const barMoves = R.moves.filter(m => m.id === 'gcsb-strip' || m.id === 'gc-leadsee');
const byWho = {}; R.moves.forEach(m => { const k = m.id + ' ← ' + m.by.split(' < ')[0]; byWho[k] = (byWho[k] || 0) + 1; });
console.log('  · moves of the hub\'s siblings in ' + SECS + ' s: ' + R.moves.length + ' ' + JSON.stringify(byWho).slice(0, 900));
console.log('  · order changes: ' + (R.order.length - 1) + ' ' + JSON.stringify(R.order.slice(0, 4)).slice(0, 600));
const rew = R.html.filter(h => h.same), chg = R.html.filter(h => !h.same);
console.log('  · bar content rewrites: ' + R.html.length + ' (same text: ' + rew.length + ') ' + JSON.stringify(chg.slice(0, 3)).slice(0, 600));
const barShift = R.shifts.filter(s => s.src.some(x => /^(gcsb-strip|gc-leadsee|gc-leads-hub)$|^hub>/.test(x)));
console.log('  · layout shifts: ' + R.allShifts + ' (bars / hub: ' + barShift.length + ') ' + JSON.stringify(R.shifts.slice(0, 6)).slice(0, 600));
ok('zero position swaps of the bars in ' + SECS + ' s (order never changed)', R.order.length === 1, R.order.slice(0, 6));
ok('no code re-inserted a bar that was already in place', barMoves.length === 0, barMoves.slice(0, 4));
ok('zero layout shifts from the bars or the hub', barShift.length === 0, barShift.slice(0, 6));
ok('a bar\'s content is rewritten only when its visible text changes', rew.length === 0, rew.slice(0, 4));
const ord = R.order[R.order.length - 1].o.split(',');
ok('fixed order: 🧹 Sales & spam, then 📥 the new-leads banner, then the list', ord.indexOf('gcsb-strip') >= 0 && ord.indexOf('gcsb-strip') < ord.indexOf('gc-leadsee') && ord.indexOf('gc-leadsee') < ord.indexOf('gc-leads-hub'), ord);
ok('the bars sit above the list (tops ' + JSON.stringify(R.tops) + ')', R.tops.sb != null && R.tops.sb < R.tops.ls && R.tops.ls < R.tops.hub, R.tops);
ok('the Sales & spam count was asked (not every tick)', SB.filter(q => /count=1/.test(q)).length >= 1 && SB.filter(q => /count=1/.test(q)).length <= 3, SB);
/* still works: a new count / a new inbox text redraws in place, no move */
await c.ev(() => window.__BS.start());
await c.ev(() => { window.__BS.moves.length = 0; });
const re = await c.ev(async () => { const b = document.querySelector('#gc-leadsee [data-gcls="check"]'); if (b) b.click(); await new Promise(r => setTimeout(r, 4000)); return { ls: document.getElementById('gc-leadsee').textContent, moves: window.__BS.moves.filter(m => m.id === 'gcsb-strip' || m.id === 'gc-leadsee').length, ord: [].slice.call(document.getElementById('gc-leads-hub').parentNode.children).map(x => x.id).filter(Boolean).join(',') }; });
ok('↻ Check now still works and nothing moves', /Checked|Lead Inbox|new lead/.test(re.ls) && re.moves === 0 && re.ord.indexOf('gcsb-strip') < re.ord.indexOf('gc-leadsee'), re);
const errs = c.errs.filter(e => !/ResizeObserver loop/.test(e));
ok('no page errors', errs.length === 0, errs.slice(0, 5));
await c.b.close();
console.log((fail ? '✗ ' : '✓ ') + 'BARSTILL: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
