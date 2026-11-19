// test_PHONEUI.mjs <build-dir> — patch PHONEUI: GrayCo Field on a phone looks and works like an app.
//   A. node: the block is the last script in index.html; the patch is idempotent.
//   B. owner (admin) on an iPhone (390x844, iPhone UA, touch) in Field, with a simulated 47 px status bar (--gc-sat, the
//      variable the block reads env(safe-area-inset-top) through):
//      · Field home: the 🔔 notifications card sits under the GrayCo Field header, below the status bar;
//      · notes (toast, amber "Saved on this phone", ☁ note, COI / W-9 pill) do not overlap each other or the bottom bar;
//      · Leads (from the Field home): no desk top bar (company switcher / global search), no 💬 bubble; the header stays
//        (sampled for 5 s); ‹ Back and the title do not overlap, the title is whole, below the status bar; content starts
//        right under the header; each view button ≥ 44 px tall, inside the screen, label not cut; the filter chips wrap
//        (no sideways scroll); the COI pill rides in the header;
//      · panels (Approvals, My Schedule, ☰ More, Job Info, the Schedule page, Problem reports, Away & notifications, a
//        lead's details, Customer portal …): a full-screen light page (no dim backdrop, no card edge), a Back / Close
//        below the status bar, ≥ 44 x 44 that elementFromPoint reaches, text contrast ≥ 4.5:1 (colored buttons aside),
//        scrolled to the end the last button is above the bottom bar and tappable, the bottom bar is there; Back closes it;
//      · the Schedule page's "+ Add to Schedule" is at the bottom above the bottom bar, not over the list;
//      · an update bar ("A newer version …") is below the status bar.
//   C. a PM on an iPhone: Leads views / chips / header the same; Approvals a light page.
//   D. the desk (admin, 1400 px computer): unchanged — the top bar is there, no phone classes, Leads views a strip.
//   E. no page errors.
// Screenshots (deviceScaleFactor 2): GC_SHOTS (default scratchpad/phoneui/). PHONEUI_TAG names them (before / after).
// Usage: node test_PHONEUI.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_PHONEUI.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/phoneui/';
const TAG = process.env.PHONEUI_TAG || 'after';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const SAT = 47;

console.log('A. node');
{
  const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
  const i = t.indexOf('<script id="gc-patch-phoneui">');
  ok(i > 0 && t.indexOf('<script', i + 10) < 0, 'the PHONEUI block is the last script in index.html', i);
  ok((t.match(/__GC_PATCH_PHONEUI__/g) || []).length >= 1 && t.split('<script id="gc-patch-phoneui">').length === 2, 'it is there once');
}

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), PM = byId('u-pm');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
function seed(){
  H.resetCloud();
  H.cset('users', [{ id: 'u1', name: 'Demo Owner', email: ADMIN, role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', active: true }]);
  H.cset('projects', [{ id: 'P1', po: 'PO-1', name: 'Demo Job', client: 'Sample Customer', address: '1 Demo St', pm: 'Demo PM', status: 'Active', type: 'Remodel', contract: 1000, contractSigned: true, updatedAt: ago(1) }]);
  const leads = []; for (let i = 0; i < 8; i++) leads.push({ id: 'L' + i, name: 'Lead ' + i, client: 'Person ' + i, stage: 'New Lead', source: i === 0 ? 'Google LSA' : 'Website', createdAt: ago(i), updatedAt: ago(i) });
  H.cset('leads', leads);
  const sch = []; for (let i = 0; i < 14; i++) sch.push({ id: 'SC' + i, pid: 'P1', date: new Date(Date.now() + i * 864e5).toISOString().slice(0, 10), title: 'Demo task ' + i, time: '08:00', who: 'Demo PM' });
  H.cset('schedule', sch);
  H.cset('vendors', [{ id: 'V1', name: 'Sample Sub', isSub: true, w9: true, updatedAt: ago(5) }]); H.cset('subs', []);
  H.cset('projectDocs', []); H.cset('punch', []); H.cset('timesheets', []);
}
H.onFn('appr-away', ({ body }) => (body && body.op === 'state') ? { ok: true, me: { email: 'owner@example.invalid', name: 'Demo Owner', admin: true }, push: { on: false, ready: false, devices: [] }, away: { on: false }, covering: [], devices: [] } : { ok: true });
H.onFn('sub-doc-read', () => ({ ok: true, items: [{ ref: 'r1', name: 'coi-sample.pdf', subId: 'V1', kind: 'coi' }, { ref: 'r2', name: 'w9-sample.pdf', subId: 'V1', kind: 'w9' }] }));
const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const INIT = `(() => { try { Object.defineProperty(navigator, 'userAgent', { get: () => ${JSON.stringify(IPH)} }); } catch (e) {}
  const add = () => { if (document.getElementById('__satsim')) return; const s = document.createElement('style'); s.id = '__satsim'; s.textContent = ':root{--gc-sat:${SAT}px!important}'; (document.head || document.documentElement).appendChild(s); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add); })()`;

/* ── in-page helpers ── */
const LIB = `window.__pu = (() => {
  const cs = e => getComputedStyle(e), txt = e => String((e && (e.innerText || e.textContent)) || '').replace(/\\s+/g, ' ').trim();
  const shown = e => { if (!e || !e.isConnected) return false; const s = cs(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0; };
  const rgb = s => { const m = String(s || '').match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+%?))?/); if (!m) return null; return [+m[1], +m[2], +m[3], m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4])]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hsl = c => { const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); } return [0, s, l]; };
  const colored = c => { const q = hsl(c); return q[1] > 0.35 && q[2] > 0.28 && q[2] < 0.72; };
  const bgOf = e => { for (let x = e; x; x = x.parentElement) { const c = rgb(cs(x).backgroundColor); if (c && c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
  const sat = () => { const p = document.getElementById('gc-pu-sat'); return p ? Math.round(p.getBoundingClientRect().top) : 0; };
  const CLOSE = /^(✕|✖|×|⨯|x|close|done|‹|‹ ?back|back|← ?back|‹ ?jobs)$/i;
  const closeish = b => CLOSE.test(txt(b)) || /^(close|back)$/i.test(b.getAttribute('aria-label') || '') || b.hasAttribute('data-x');
  const hits = b => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === b || b.contains(h)); };
  const box = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), r: Math.round(r.right) }; };
  function top(){
    const vw = innerWidth, vh = innerHeight;
    const L = [...document.body.children].filter(e => !/^(SCRIPT|STYLE|LINK)$/.test(e.tagName) && !/^(gc-fh-tabs|_gcNavBk|gc-pu-sat|_gcFieldHubBtn|_gcMicBtn)$/.test(e.id) && cs(e).position === 'fixed' && shown(e)).filter(e => { const r = e.getBoundingClientRect(); return r.width * Math.min(r.height, vh) >= 0.45 * vw * vh; });
    L.sort((a, b) => (+cs(a).zIndex || 0) - (+cs(b).zIndex || 0) || ([...document.body.children].indexOf(a) - [...document.body.children].indexOf(b)));
    return L[L.length - 1] || null;
  }
  function panel(L){
    L = L || top(); if (!L) return null;
    const S = sat(), tabs = document.getElementById('gc-fh-tabs'), tTop = tabs && shown(tabs) ? tabs.getBoundingClientRect().top : innerHeight;
    const btns = [...L.querySelectorAll('button,a,[role=button]')].filter(shown);
    const backs = btns.filter(b => closeish(b) && b.getBoundingClientRect().top < S + 140 && b.getBoundingClientRect().bottom > 0).map(b => ({ t: txt(b).slice(0, 10), ...box(b), hit: hits(b), on: hits(b) ? '' : (() => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h ? h.tagName + '#' + h.id + '.' + String(h.className).slice(0, 30) : 'none'; })() }));
    const bgc = rgb(cs(L).backgroundColor);
    /* contrast: every visible text with its own text node, against what is under it; colored buttons as they are */
    const bad = []; let n = 0;
    L.querySelectorAll('*').forEach(e => {
      let d = ''; for (let c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) d += c.nodeValue; d = d.replace(/\\s+/g, ' ').trim();
      if (!d || !/[A-Za-z0-9]/.test(d) || !shown(e)) return; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      if (cs(e).opacity === '0') return;
      const fg = rgb(cs(e).color), bg = bgOf(e); if (!fg) return; if (colored(bg)) return; n++;
      const k = ratio(fg, bg); if (k < 4.5) bad.push({ t: d.slice(0, 30), k: Math.round(k * 100) / 100, fg: cs(e).color, bg: 'rgb(' + bg.slice(0, 3).join(',') + ')' });
    });
    const main = [...L.children].filter(c => shown(c) && !c.classList.contains('gc-pu-bar')).sort((x, y) => { const a = x.getBoundingClientRect(), b = y.getBoundingClientRect(); return b.width * b.height - a.width * a.height; })[0];
    const cards = main ? [{ rad: cs(main).borderTopLeftRadius, w: Math.round(main.getBoundingClientRect().width), vw: innerWidth }] : [];
    const titleOk = (() => { const h = [...L.querySelectorAll('*')].filter(e => { if (!shown(e) || e.closest('button')) return false; let d = ''; for (let c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) d += c.nodeValue; return /[A-Za-z]{3}/.test(d) && parseFloat(cs(e).fontSize) >= 17 && e.getBoundingClientRect().height > 0; })[0]; return h ? { t: txt(h).slice(0, 40), y: Math.round(h.getBoundingClientRect().top) } : null; })();
    const tabsHit = tabs && shown(tabs) ? (() => { const r = tabs.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width * 0.3, r.top + r.height / 2); return !!h && tabs.contains(h); })() : null;
    return { id: L.id, cls: String(L.className).slice(0, 60), bg: cs(L).backgroundColor, bgLum: bgc ? Math.round(lum(bgc) * 100) / 100 : null, bgA: bgc ? bgc[3] : 0, backs, nText: n, bad: bad.slice(0, 8), nBad: bad.length, cards, title: titleOk, tabsHit, S, tTop: Math.round(tTop) };
  }
  function scrollEnd(L){
    L = L || top(); if (!L) return null;
    const sc = [L, ...L.querySelectorAll('*')].filter(e => { const s = cs(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2; });
    sc.forEach(e => { e.scrollTop = e.scrollHeight; });
    return sc.length;
  }
  function lastBtn(L){
    L = L || top(); if (!L) return null;
    const tabs = document.getElementById('gc-fh-tabs'), tTop = tabs && shown(tabs) ? tabs.getBoundingClientRect().top : innerHeight;
    const b = [...L.querySelectorAll('button,a[href],[role=button]')].filter(x => shown(x) && !x.closest('.gc-pu-bar') && x.getBoundingClientRect().width > 0 && !x.classList.contains('gc-pu-fab')).pop();
    if (!b) return { none: true };
    return { t: txt(b).slice(0, 24), ...box(b), tTop: Math.round(tTop), above: b.getBoundingClientRect().bottom <= tTop + 0.5, hit: hits(b) };
  }
  return { panel, scrollEnd, lastBtn, top, sat, box, hits, txt, shown, ratio, rgb, closeish };
})();`;

const OPEN = [];
async function phone(who, email){
  const c = await H.computer(who, { build, mobile: true, init: INIT }); OPEN.push(c);
  ok(await H.signIn(c, email, 20000), `${who}: signs in`);
  ok(!!(await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs [data-t]'), null, 45000)), `${who}: the iPhone opens GrayCo Field`);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 1, null, 30000);
  await sleep(2500); await c.ev(LIB);
  await c.ev(() => document.querySelectorAll('#gc-update-bar,#gc-bw-update').forEach(o => o.remove()));   /* the offline harness's "newer version" bar (tested on its own below) */
  return c;
}
const shot = (c, n) => c.page().screenshot({ path: SHOTS + `phoneui_${n}_${TAG}.png` }).catch(() => {});
async function home(c){
  await c.ev(() => {
    document.querySelectorAll('.gc-ra-sheet,.gc-fh-sheet,.gc-rpb-ov,.gc-pu-page,#_gcJobDash,.gc-away-modal,#gc-update-bar,#gc-bw-update').forEach(o => o.remove());
    if (window.__pu) {} if (!document.querySelector('#_gcJobPick.gc-fh') && window._gcField) window._gcField.open();
  });
  await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 8000); await sleep(600);
}
async function tap(c, sel){
  const loc = c.page().locator(sel).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await sleep(300);
  const bb = await loc.boundingBox().catch(() => null);
  if (bb && bb.width > 0) await c.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await loc.evaluate(e => e.click()).catch(() => {});
}
/* a panel: open, check, screenshot, scroll to the end, Back closes it */
async function checkPanel(c, who, name, open, opt = {}){
  await home(c);
  const before = await c.ev(() => window.__pu.top());
  try { await open(); } catch (e) { ok(false, `${who} ${name}: opens`, String(e).slice(0, 200)); return null; }
  await sleep(opt.wait || 2800);
  const p = await c.ev(() => window.__pu.panel());
  if (!p || (opt.cls && !new RegExp(opt.cls).test(p.cls + ' ' + p.id))) { ok(false, `${who} ${name}: opens a panel`, p); return null; }
  await shot(c, `${who.toLowerCase()}_${name}`);
  console.log(`    ${who} ${name}: ${p.cls || p.id} bg=${p.bg} backs=${JSON.stringify(p.backs)} title=${JSON.stringify(p.title)} texts=${p.nText} lowContrast=${p.nBad}`);
  if (TAG === 'before') return p;
  ok(p.bgLum >= 0.85 && p.bgA >= 0.95, `${who} ${name}: a light, full page (no dim backdrop) — background ${p.bg}`, p.bg);
  ok(p.cards.every(x => x.rad === '0px' && x.w >= x.vw - 1), `${who} ${name}: no floating card edge (the main card is square, full width)`, p.cards);
  const bk = p.backs.filter(b => b.y >= p.S - 0.5 && b.w >= 44 && b.h >= 44 && b.hit);
  ok(bk.length > 0, `${who} ${name}: a ‹ Back / ✕ Close below the status bar (y ≥ ${p.S}), ≥ 44 x 44, that a tap reaches`, p.backs);
  ok(!p.backs.some(b => b.y < p.S - 0.5 && b.hit), `${who} ${name}: no Back / Close under the status bar`, p.backs);
  ok(p.title && p.title.y >= p.S - 1, `${who} ${name}: the title is below the status bar`, p.title);
  ok(p.nText >= 3 && p.nBad === 0, `${who} ${name}: text contrast ≥ 4.5:1 (${p.nText} texts; colored buttons aside)`, p.bad);
  if (p.tabsHit !== null) ok(p.tabsHit, `${who} ${name}: the bottom bar is there and tappable`);
  await c.ev(() => window.__pu.scrollEnd()); await sleep(500);
  const lb = await c.ev(() => window.__pu.lastBtn());
  if (lb && !lb.none) ok(lb.above && lb.hit, `${who} ${name}: scrolled to the end, the last button ("${lb.t}") is above the bottom bar and tappable`, lb);
  await shot(c, `${who.toLowerCase()}_${name}_end`);
  if (!opt.noBack) {
    /* Back closes it */
    await c.ev(() => { const L = window.__pu.top(); L && [L, ...L.querySelectorAll('*')].forEach(e => { e.scrollTop = 0; }); }); await sleep(300);
    const sel = await c.ev(() => { const L = window.__pu.top(); const S = window.__pu.sat(); const b = [...L.querySelectorAll('button,a,[role=button]')].filter(x => window.__pu.shown(x) && window.__pu.closeish(x) && x.getBoundingClientRect().top >= S - 1 && x.getBoundingClientRect().top < S + 140 && window.__pu.hits(x))[0]; if (!b) return null; b.setAttribute('data-pu-back-test', '1'); return '[data-pu-back-test]'; });
    if (sel) { const L0 = await c.ev(() => { const L = window.__pu.top(); L.setAttribute('data-pu-l', '1'); return true; }); await tap(c, sel); await sleep(1200);
      ok(await c.ev(() => { const L = document.querySelector('[data-pu-l]'); return !L || !window.__pu.shown(L) || window.__pu.top() !== L; }), `${who} ${name}: ‹ Back / Close closes it`); }
  }
  return p;
}

try {
  seed();
  console.log('B. owner (admin) on an iPhone, Field, 47 px status bar');
  const a = await phone('OWNER', ADMIN);
  /* Field home + the 🔔 card (as the AWAY patch puts it: first thing in the home) */
  await c_homeCard(a);
  async function c_homeCard(c){
    const real = await c.ev(() => { try { localStorage.removeItem('gc_away_push_later'); } catch (e) {} try { return !!(window._gcAway && window._gcAway.refresh(true)); } catch (e) { return false; } });
    if (real) await H.waitFor(c, () => !!document.getElementById('gc-away-pushcard'), null, 8000);
    console.log('    the 🔔 card from the AWAY patch itself: ' + (await c.ev(() => !!document.getElementById('gc-away-pushcard'))));
    await c.ev(() => { if (document.getElementById('gc-away-pushcard')) return; const h = document.querySelector('#_gcJobPick.gc-fh'); const d = document.createElement('div'); d.id = 'gc-away-pushcard'; d.setAttribute('data-gc-keep', '1'); d.style.cssText = 'background:#ecfdf5;border:1px solid #10b981;border-radius:12px;padding:10px 12px;margin:8px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font:13.5px Inter,Arial,sans-serif;color:#064e3b'; d.innerHTML = '<span>🔔</span><span style="flex:1"><b>Get your approvals on this phone</b><br><span>A notification for each new approval</span></span><button type="button">Turn on</button><button type="button">Later</button>'; h.insertBefore(d, h.firstChild); });
    await sleep(1600);
    const r = await c.ev(() => { const d = document.getElementById('gc-away-pushcard'), t = document.querySelector('#_gcJobPick .fh-top'); const S = window.__pu.sat(); return { S, card: d && window.__pu.box(d), head: t && window.__pu.box(t), after: !!(t && d && (t.compareDocumentPosition(d) & 4)), headText: t && (() => { const e = t.querySelector('b,h1,h2,div'); return e ? window.__pu.box(e) : null; })() }; });
    ok(r.after && r.card && r.card.y >= r.S && r.head && r.card.y >= r.head.b - 1, 'Field home: the 🔔 "Get your approvals" card is under the GrayCo Field header, below the status bar', r);
    ok(r.head && r.head.y + 4 < r.S + 30 && r.headText && r.headText.y >= r.S - 1, 'Field home: the header text is below the status bar, no blank gap above it', r);
    await shot(c, 'owner_home');
  }
  /* notes stack */
  {
    await a.ev(() => {
      const mk = (id, cls, css, t) => { const d = document.createElement('div'); if (id) d.id = id; if (cls) d.className = cls; d.setAttribute('data-gc-keep', '1'); d.style.cssText = css; d.textContent = t; document.body.appendChild(d); };
      mk('gc-unsent-note', '', 'position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147482000;background:#92400e;color:#fff;padding:8px 12px;border-radius:10px;font:600 12.5px Arial,sans-serif;max-width:80vw;pointer-events:none', '⏳ Saved on this phone — not sent to the office yet (the database did not answer). It keeps trying by itself.');
      document.querySelectorAll('#gc-unsent-note').forEach(e => e.remove());
      mk('', 'gc-away-toast', 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:#0f2440;color:#fff;padding:10px 16px;border-radius:10px;z-index:2147483600;font:600 14px Inter,Arial,sans-serif;max-width:92vw', '⚠ Phone notifications are not set up on the server yet. Texts / e-mails still come.');
    });
    await a.ev(() => window._gcAUTAI && window._gcAUTAI.scanSubDocs && window._gcAUTAI.scanSubDocs());
    await H.waitFor(a, () => !!document.getElementById('_gcSubDocPill'), null, 9000);
    await sleep(800);
    await a.ev(() => { if (!document.getElementById('gc-unsent-note')) { const d = document.createElement('div'); d.id = 'gc-unsent-note'; d.setAttribute('data-gc-keep', '1'); d.style.cssText = 'position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147482000;background:#92400e;color:#fff;padding:8px 12px;border-radius:10px;font:600 12.5px Arial,sans-serif;max-width:80vw;pointer-events:none'; d.textContent = '⏳ Saved on this phone — not sent to the office yet. It keeps trying by itself.'; document.body.appendChild(d); } });
    await sleep(350);
    const r = await a.ev(() => {
      const tabs = document.getElementById('gc-fh-tabs'), tt = tabs.getBoundingClientRect().top;
      const els = ['#gc-unsent-note', '.gc-away-toast', '#gc-save-note', '#_gcSubDocPill', '#_gcPayPill'].map(s => document.querySelector(s)).filter(e => e && window.__pu.shown(e));
      const bx = els.map(e => ({ id: e.id || e.className, ...window.__pu.box(e) }));
      const over = []; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const p = bx[i], q = bx[j]; if (p.x < q.r && q.x < p.r && p.y < q.b && q.y < p.b) over.push([p.id, q.id]); }
      return { tt: Math.round(tt), bx, over, under: bx.filter(b => b.b > tt + 0.5).map(b => b.id) };
    });
    await shot(a, 'owner_notes');
    ok(r.bx.length >= 3, 'notes: the toast, the amber note and the COI / W-9 pill are on screen', r.bx);
    ok(!r.over.length, 'notes: none overlaps another', r.over);
    ok(!r.under.length, 'notes: all above the bottom bar', r);
    await a.ev(() => document.querySelectorAll('#gc-unsent-note,.gc-away-toast').forEach(e => e.remove()));
  }
  /* Leads from the Field home */
  async function leads(c, who){
    await home(c);
    const lt = await c.ev(() => !!document.querySelector('#_gcJobPick [data-pmf-a="leads"],#_gcJobPick [data-ra-a="leads"]'));
    if (lt) await tap(c, '#_gcJobPick [data-pmf-a="leads"],#_gcJobPick [data-ra-a="leads"]'); else await c.ev(() => window._setView('leads'));
    ok(!!(await H.waitFor(c, () => !!document.querySelector('#gc-leads-hub .gclu-views button') && !document.querySelector('#_gcJobPick'), null, 15000)), `${who}: Leads opens from the Field home`);
    await sleep(2500);
    if (await c.ev(() => !!document.querySelector('#_gcJobPick') || !document.querySelector('#gc-leads-hub'))) { console.log('    (the Field home came back over Leads by itself — opening Leads again)'); await c.ev(() => { document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._setView('leads'); }); await sleep(2500); }
    const samples = [];
    for (let i = 0; i < 10; i++) { samples.push(await c.ev(() => { const h = document.getElementById('_gcAppHead'); return !!h && window.__pu.shown(h); })); await sleep(500); }
    const r = await c.ev(() => {
      const P = window.__pu, S = P.sat(), q = s => document.querySelector(s);
      const ms = q('#_masterSearch'), co = q('#gc-co-sw'), fab = q('#_gcJobMsgFab'), nb = q('#_gcNavBk');
      const hd = q('#_gcAppHead'), bk = q('#_gcAppBack'), ti = q('#_gcAppTitle');
      const views = [...document.querySelectorAll('#gc-leads-hub .gclu-views > button')].map(b => ({ t: P.txt(b), ...P.box(b), sw: b.scrollWidth, cw: b.clientWidth, on: b.classList.contains('on'), bg: getComputedStyle(b).backgroundColor }));
      const vs = q('#gc-leads-hub .gclu-views'), ch = q('#gc-leads-hub .gclu-chips');
      const chips = ch ? [...ch.children].filter(P.shown).map(b => ({ t: P.txt(b).slice(0, 20), ...P.box(b), sw: b.scrollWidth, cw: b.clientWidth })) : [];
      document.querySelectorAll('#gc-update-bar,#gc-bw-update').forEach(o => o.remove());
      const first = q('#gc-leads-hub') && [...document.querySelectorAll('main *')].filter(e => P.shown(e) && e.getBoundingClientRect().height > 10 && e.children.length === 0)[0];
      return { S, vw: innerWidth, ms: !!ms && P.shown(ms), co: !!co && P.shown(co), fab: !!fab && P.shown(fab), nb: !!nb && P.shown(nb) ? P.box(nb) : null,
        hd: hd && P.box(hd), bk: bk && P.box(bk), bkHit: bk && P.hits(bk), bkOn: bk && (() => { const r = bk.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h ? h.tagName + '#' + h.id + '.' + String(h.className).slice(0, 30) : 'none'; })(), ti: ti && { ...P.box(ti), t: P.txt(ti), sw: ti.scrollWidth, cw: ti.clientWidth },
        views, vsw: vs && vs.scrollWidth, vcw: vs && vs.clientWidth, chips, chsw: ch && ch.scrollWidth, chcw: ch && ch.clientWidth, first: first && { t: P.txt(first).slice(0, 30), ...P.box(first) },
        pill: (() => { const p = q('#_gcSubDocPill'); return p ? { inHead: !!hd && hd.contains(p), ...P.box(p) } : null; })() };
    });
    await shot(c, `${who.toLowerCase()}_leads`);
    console.log(`    ${who} leads: header ${JSON.stringify(r.hd)} back ${JSON.stringify(r.bk)} title ${JSON.stringify(r.ti)} views ${r.views.map(v => v.t + ' ' + v.w + 'x' + v.h).join(' | ')}`);
    if (TAG === 'before') return r;
    ok(!r.ms && !r.co, `${who} Leads: no desk top bar (🏢 company switcher, "Search jobs, subs, invoices…")`, r);
    ok(!r.fab, `${who} Leads: no red 💬 bubble up top (Messages is on each job page)`);
    ok(samples.every(Boolean), `${who} Leads: the app header stays on screen (sampled 10 times over 5 s)`, samples);
    ok(r.bk && r.ti && (r.bk.r <= r.ti.x || r.ti.r <= r.bk.x), `${who} Leads: ‹ Back and the title do not overlap`, { bk: r.bk, ti: r.ti });
    ok(!r.nb || !(r.nb.x < r.ti.r && r.ti.x < r.nb.r && r.nb.y < r.ti.b && r.ti.y < r.nb.b), `${who} Leads: no floating Back pill over the title`, r.nb);
    ok(r.ti && r.ti.t === 'Leads' && r.ti.sw <= r.ti.cw && r.ti.r <= r.vw && r.ti.y >= r.S - 1, `${who} Leads: the title "Leads" is whole and below the status bar`, r.ti);
    ok(r.bk && r.bk.h >= 44 && r.bk.y >= r.S - 1 && r.bkHit, `${who} Leads: ‹ Back is ≥ 44 px, below the status bar, tappable`, { bk: r.bk, on: r.bkOn });
    ok(r.first && r.hd && r.first.y >= r.hd.b - 1 && r.first.y - r.hd.b <= 40, `${who} Leads: the page starts right under the header`, { first: r.first, hd: r.hd });
    ok(r.views.length >= 6 && r.views.every(v => v.h >= 44 && v.x >= 0 && v.r <= r.vw && v.sw <= v.cw), `${who} Leads: every view button ≥ 44 px tall, inside the screen, its label whole`, r.views);
    ok(r.vsw <= r.vcw && new Set(r.views.map(v => v.y)).size >= 2, `${who} Leads: the views wrap into rows (no sideways strip)`, { sw: r.vsw, cw: r.vcw });
    ok(r.views.filter(v => v.on).length === 1 && /rgb\(36, 25, 104\)/.test(r.views.find(v => v.on).bg), `${who} Leads: the chosen view is dark`, r.views.filter(v => v.on));
    ok(r.chips.length >= 4 && r.chsw <= r.chcw && r.chips.every(b => b.r <= r.vw && b.h >= 44 && b.sw <= b.cw), `${who} Leads: the filter chips wrap, each ≥ 44 px, inside the screen`, { sw: r.chsw, cw: r.chcw, chips: r.chips.filter(b => !(b.r <= r.vw && b.h >= 44)) });
    if (r.pill && TAG !== 'before') ok(r.pill.inHead, `${who} Leads: the COI / W-9 pill rides in the header, not over the page`, r.pill);
    return r;
  }
  await leads(a, 'OWNER');
  /* a lead's details */
  await checkPanel(a, 'OWNER', 'lead', async () => { await a.ev(() => { const r = document.querySelector('#gc-leads-hub .gcl-lr td.c-name, #gc-leads-hub .gcl-lr'); r && r.click(); }); }, { noBack: false });

  /* panels */
  const P = [];
  P.push(await checkPanel(a, 'OWNER', 'approvals', () => tap(a, '#gc-fh-tabs [data-t="appr"]')));
  P.push(await checkPanel(a, 'OWNER', 'myschedule', () => tap(a, '#gc-fh-tabs [data-t="ra-sched"],#gc-fh-tabs [data-t="sched"]')));
  P.push(await checkPanel(a, 'OWNER', 'more', () => tap(a, '#gc-fh-tabs [data-t="more"]')));
  const job = async k => { await a.ev(() => { document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await H.waitFor(a, () => !!document.querySelector('#_gcJobDash .gcfp-grid'), null, 10000); await sleep(800); await a.ev(k => { const b = document.querySelector(`#_gcJobDash [data-fm="${k}"],#_gcJobDash [data-fp="${k}"],#_gcJobDash [data-fn="${k}"]`); if (b) b.click(); }, k); };
  P.push(await checkPanel(a, 'OWNER', 'jobinfo', () => job('info')));
  P.push(await checkPanel(a, 'OWNER', 'money', () => job('money')));
  P.push(await checkPanel(a, 'OWNER', 'schedulepage', () => a.ev(() => window._gcOpenFieldSchedule())));
  {
    const f = await a.ev(() => { const b = document.getElementById('_fsAdd'); if (!b) return null; const tabs = document.getElementById('gc-fh-tabs'); const tt = tabs.getBoundingClientRect().top; const P = window.__pu; const L = P.top(); L && (L.scrollTop = 0); const r = b.getBoundingClientRect(); return { ...P.box(b), tt: Math.round(tt), hit: P.hits(b) }; });
    await a.ev(() => window._gcOpenFieldSchedule()); await sleep(1500);
    const f2 = await a.ev(() => { const b = document.getElementById('_fsAdd'); if (!b) return null; const tabs = document.getElementById('gc-fh-tabs'); const tt = tabs.getBoundingClientRect().top; const P = window.__pu; return { ...P.box(b), tt: Math.round(tt), hit: P.hits(b), rows: [...document.querySelectorAll('._fsRow')].length }; });
    await shot(a, 'owner_schedulepage_fab');
    if (TAG !== 'before') ok(f2 && f2.b <= f2.tt && f2.b >= f2.tt - 110 && f2.hit, 'the Schedule page: "+ Add to Schedule" sits at the bottom just above the bottom bar (not mid-screen), tappable', f2);
  }
  P.push(await checkPanel(a, 'OWNER', 'problemreports', () => a.ev(() => window._gcReportProb.list()), { cls: 'gc-rpb', cardOk: true }));
  P.push(await checkPanel(a, 'OWNER', 'away', () => a.ev(() => window._gcAway.open())));
  P.push(await checkPanel(a, 'OWNER', 'portal', async () => { await home(a); await a.ev(() => { const b = [...document.querySelectorAll('#_gcJobPick button')].find(x => /Customer portal/.test(x.textContent)); b && b.click(); }); }));
  const done = P.filter(Boolean);
  if (TAG !== 'before') ok(done.length >= 8, `panels checked: ${done.length} (≥ 8)`, done.map(p => p.cls || p.id));
  /* an update bar */
  {
    await home(a);
    await a.ev(() => { const bar = document.createElement('div'); bar.id = 'gc-update-bar'; bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#2563eb;color:#fff;padding:10px 20px;text-align:center;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:12px'; bar.innerHTML = '🔄 A newer version of the CRM is ready (33.999-test) — <button id="gc-update-now" style="background:#fff;color:#2563eb;border:none;border-radius:5px;padding:4px 14px;font-weight:700">Yes, update</button><button id="gc-update-later" style="background:transparent;color:#fff;border:1px solid #fff;border-radius:5px;padding:4px 14px;font-weight:700">Not now</button>'; document.body.prepend(bar); });
    await sleep(1600);
    const u = await a.ev(() => { const P = window.__pu, S = P.sat(); const t = document.getElementById('gc-update-now'), l = document.getElementById('gc-update-later'); const tx = document.createRange(); tx.selectNodeContents(document.getElementById('gc-update-bar').firstChild); const tr = tx.getBoundingClientRect(); return { S, now: P.box(t), later: P.box(l), text: Math.round(tr.top), hit: P.hits(t) && P.hits(l) }; });
    await shot(a, 'owner_updatebar');
    if (TAG !== 'before') ok(u.now.y >= u.S && u.later.y >= u.S && u.text >= u.S && u.hit, 'the "A newer version of the CRM is ready" bar: text and buttons below the status bar, tappable', u);
    await a.ev(() => document.getElementById('gc-update-bar').remove());
  }
  ok(!a.errs.length, 'OWNER: no page errors', a.errs);

  console.log('C. PM on an iPhone');
  const pm = await phone('PM', PM);
  await leads(pm, 'PM');
  await checkPanel(pm, 'PM', 'approvals', () => tap(pm, '#gc-fh-tabs [data-t="appr"]'));
  ok(!pm.errs.length, 'PM: no page errors', pm.errs);

  console.log('D. the desk (admin, 1400 px computer)');
  const d = await H.computer('DESK', { build, viewport: { width: 1400, height: 900 } }); OPEN.push(d);
  ok(await H.signIn(d, ADMIN, 20000), 'DESK: signs in');
  await H.waitFor(d, () => !!document.querySelector('#_masterSearch'), null, 30000);
  await d.ev(() => window._setView && window._setView('leads')); await H.waitFor(d, () => !!document.querySelector('#gc-leads-hub .gclu-views'), null, 20000); await sleep(1000);
  const dk = await d.ev(() => { const ms = document.getElementById('_masterSearch'), v = document.querySelector('#gc-leads-hub .gclu-views'); const H = document.documentElement.classList; return { ms: !!ms && getComputedStyle(ms).display !== 'none' && ms.getBoundingClientRect().height > 20, cls: ['gc-pu', 'gc-pu-app', 'gc-pu-head'].filter(c => H.contains(c)), field: H.contains('_fieldmode'), views: v && getComputedStyle(v).display, input: !!(ms && ms.querySelector('input')) }; });
  await d.page().screenshot({ path: SHOTS + `phoneui_desk_leads_${TAG}.png` }).catch(() => {});
  if (TAG !== 'before') {
    ok(dk.ms && dk.input && !dk.field, 'DESK: the top bar (search) is there as before', dk);
    ok(!dk.cls.length, 'DESK: no phone classes on the page', dk.cls);
    ok(dk.views && dk.views !== 'grid', 'DESK: the Leads views are the same strip as before (not the phone grid)', dk.views);
  }
  ok(!d.errs.length, 'DESK: no page errors', d.errs);
} catch (e) {
  ok(false, 'the test ran to the end', String(e && e.stack || e).slice(0, 600));
} finally {
  for (const c of OPEN) await c.close().catch(() => {});
}
console.log(`\nPHONEUI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
