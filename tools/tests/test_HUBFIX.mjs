// test_HUBFIX.mjs <build-dir> — patch HUBFIX: every button on the 💎 menu works, for the owner (admin) and the office.
//   For each profile the 💎 menu is opened the way a person does it and EVERY item (ours and the ones later patches add) is
//   clicked with the mouse: the menu closes; the item does something (a screen, a dialog, a download, a file picker, a tab, a
//   notice); no page error; no "not loaded" dialog; the screen is still there 3 s later (not swept away); it closes (Esc, or its
//   own ✕ / Close / ‹ Back); after that nothing is left on the screen and nothing invisible blocks clicks
//   (document.elementFromPoint at five points is what it was before); the 💎 menu opens again, on screen.
//   Also: the menu's own ✕, Esc, outside click and a second 💎 tap close it; it opens on screen from the top toolbar and from
//   the desk ("💎 The 💎 menu"); payroll items only for admins and the Office Manager (owner rule), not Office / PM.
// Usage: node test_HUBFIX.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)  HUB_ONLY=<label part> narrows.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_HUBFIX.mjs <dir with index.html>'); process.exit(2); }
const ONLY = process.env.HUB_ONLY || '';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const sleep = H.sleep;
const mail = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const PAYROLL = ['Payroll', 'Payroll Check', 'Employee Pay', 'State Tax', 'PM Pay (type & source)', 'Pay Structures', 'Pay Structure Templates'];
const BAD_DIALOG = /not loaded|hard-refresh|still loading|not ready|try again in a moment|only admins and the office manager can/i;
/* a button the menu shows you, that then says it is not for you, is a dead button */
const REFUSED = /is for owners|for owners only|owners only|only (the )?owners|admins only|only admins|is for admins|not for your (role|profile)|you do not have access|no permission/i;

function world(officeRole){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: mail('u-wesley'), role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Nick Gray', email: mail('u-nick'), role: 'Admin', payType: 'owner', active: true },
    { id: 'u3', name: 'Office Demo', email: mail('u-office'), role: officeRole || 'Office', active: true },
    { id: 'u4', name: 'Demo PM', email: mail('u-pm'), role: 'Project Manager', active: true }]);
  H.cset('projects', [
    { id: 'P1', po: 'PO-1001', name: 'Demo Roof Job', client: 'Demo Client A', address: '1 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'Active', contract: 18000, contractSigned: true, createdAt: ago(20), updatedAt: ago(1) },
    { id: 'P2', po: 'PO-1002', name: 'Demo Kitchen', client: 'Demo Client B', address: '2 Demo St', type: 'Remodel', pm: 'Wesley Johnson', status: 'Active', contract: 42000, createdAt: ago(30), updatedAt: ago(2) },
    { id: 'P3', po: 'PO-1003', name: 'Demo Done Job', client: 'Demo Client C', address: '3 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'completed', contract: 9000, createdAt: ago(90), updatedAt: ago(40) }]);
  H.cset('leads', [{ id: 'L1', name: 'Demo Lead', phone: '9015550101', stage: 'New Lead', status: 'new', pm: 'Demo PM', source: 'Website', createdAt: ago(1), updatedAt: ago(1) }]);
  H.cset('invs', [{ id: 'I1', projectId: 'P1', num: 'INV-1', amount: 5000, status: 'sent', date: ago(10).slice(0, 10), createdAt: ago(10) }]);
  H.cset('expenses', [{ id: 'E1', projectId: 'P1', vendor: 'Demo Supply', amount: 1200, date: ago(5).slice(0, 10), status: 'approved' }]);
  H.cset('subs', [{ id: 'S1', name: 'Demo Sub LLC', trade: 'Roofing', phone: '9015550199', active: true }]);
  H.cset('schedule', [{ id: 'SC1', pid: 'P1', projectId: 'P1', project: 'Demo Roof Job', title: 'Tear-off', date: new Date().toISOString().slice(0, 10), crew: 'Demo Sub LLC' }]);
  H.cset('customers', [{ id: 'C1', name: 'Demo Client A', phone: '9015550111' }]);
}

async function boot(who, acct){
  const A = await H.computer(who, { build, viewport: { width: 1440, height: 900 } });
  A.acceptConfirm = false;                                     /* every "are you sure?" is answered Cancel — nothing destructive runs */
  A.downloads = []; A.page().on('download', d => A.downloads.push(d.suggestedFilename()));
  A.choosers = 0; A.page().on('filechooser', () => { A.choosers++; });
  A.popups = []; A.ctx.on('page', p => { A.popups.push(p.url()); p.close().catch(() => {}); });
  const signed = await H.signIn(A, mail(acct), 20000);
  await H.waitFor(A, () => !!(window._crm && (window._crm.projects || []).length >= 3 && document.getElementById('gc-hub-btn') && window._gcToggleHub), null, 90000);
  await sleep(9000);                                           /* the later patches arm their 💎 items */
  await A.ev(() => { try { window._gcRA && window._gcRA.hide && window._gcRA.hide(); } catch (e) {} try { window._setView && window._setView('dashboard'); } catch (e) {} });
  await sleep(1200);
  ok(signed, who + ': signed in');
  return A;
}

/* ── the page side ── */
const PAGE_LIB = () => {
  if (window.__hub) return;
  const vis = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 2 && r.height > 2; };
  const area = e => { const r = e.getBoundingClientRect(); return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)); };
  const owner = e => { if (!e) return 'none'; const root = document.getElementById('root'); if (root && root.contains(e)) { const m = e.closest('.fixed.inset-0,[style*="position: fixed"]'); return m && root.contains(m) ? 'root-modal' : 'root'; } let t = e; while (t.parentElement && t.parentElement !== document.body) t = t.parentElement; return t; };
  const name = t => typeof t === 'string' ? t : (t.id || String(t.className || '').slice(0, 30) || t.tagName);
  const PTS = [[200, 300], [720, 450], [1300, 250], [720, 820], [100, 120]];
  window.__hub = {
    vis, area,
    panel(){ return [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop() || null; },
    snap(){ this.base = new Set([...document.body.children].filter(vis)); this.all = new Set([...document.body.children]); this.view = localStorage.getItem('grayco_view'); this.views = []; this.opens = []; this.hit0 = PTS.map(([x, y]) => owner(document.elementFromPoint(x, y))); this.ovf = document.body.style.overflow + '|' + document.documentElement.style.overflow; },
    layers(){   /* what is on screen now that was not before: body children, and React modals */
      const out = [...document.body.children].filter(e => !this.base.has(e) && !/^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(e.tagName) && !e.classList.contains('gc-hub-panel') && vis(e));
      document.querySelectorAll('#root .fixed.inset-0').forEach(e => { if (vis(e) && area(e) > 0.3 * innerWidth * innerHeight) out.push(e); });
      return out;
    },
    big(e){ return this.area(e) >= 0.08 * innerWidth * innerHeight; },
    desc(e){ const r = e.getBoundingClientRect(); return (e.id || String(e.className || '').slice(0, 30) || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' “' + (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50) + '”'; },
    blockers(){   /* a point that now lands on something that was not there before */
      return PTS.map(([x, y], i) => { const o = owner(document.elementFromPoint(x, y)); const o0 = this.hit0[i]; return o === o0 || o === 'root' || (typeof o !== 'string' && this.base.has(o)) ? null : name(o) + '@' + x + ',' + y; }).filter(Boolean);
    },
    /* the close control of a layer: its own ✕ / Close / Done / Cancel / ‹ Back / Turn OFF, top-most first */
    closer(e){
      const rx = /^(✕|✖|×|⨯|x)$|^(✕|×)?\s*close\s*(✕|×)?$|^done$|^cancel$|^(‹|←|❮)\s*back$|^back$|^turn off$/i;
      const c = [...e.querySelectorAll('button,[role=button],a,span,div,[data-x],[data-cp="close"],[data-gd-x],[data-ra-close]')].filter(b => vis(b) && (b.children.length <= 2) &&
        (rx.test((b.textContent || '').replace(/\s+/g, ' ').trim()) || /^(close|back)/i.test(b.getAttribute('aria-label') || '') || b.matches('[data-x],[data-cp="close"],[data-gd-x],[data-ra-close]')));
      c.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const b = c[0]; if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: (b.textContent || '').trim().slice(0, 12) || b.getAttribute('aria-label'), top: (() => { const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === b || b.contains(h) || h.contains(b)); })() };
    }
  };
  if (typeof window._setView === 'function' && !window._setView.__hubSpy) { const f = window._setView; const w = function(v){ window.__hub.views.push(v); return f.apply(this, arguments); }; Object.keys(f).forEach(k => { w[k] = f[k]; }); w.__hubSpy = true; window._setView = w; }
  const wo = window.open; window.open = function(u){ window.__hub.opens.push(String(u || '')); return null; };
};

async function openHub(A, how){
  await A.ev(() => { if (window.__hub.panel() && window._gcCloseHub) window._gcCloseHub(); });
  if (how === 'topbar') await A.page().locator('#gc-topbar [data-tb="hub"]').click({ timeout: 4000 }).catch(() => A.ev(() => document.getElementById('gc-hub-btn').click()));
  else {
    const vis = await A.ev(() => { const b = document.getElementById('gc-hub-btn'); return !!(b && b.getClientRects().length && getComputedStyle(b).display !== 'none'); });
    if (vis) await A.page().locator('#gc-hub-btn').click({ timeout: 4000 }).catch(() => A.ev(() => document.getElementById('gc-hub-btn').click()));
    else await A.page().locator('#gc-topbar [data-tb="hub"]').click({ timeout: 4000 }).catch(() => A.ev(() => document.getElementById('gc-hub-btn').click()));
  }
  await sleep(450);
  return A.ev(() => { const p = window.__hub.panel(); if (!p) return 'no panel'; const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.width > 200 ? 'ok' : 'off screen ' + JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round)); });
}
const readItems = A => A.ev(() => { const p = window.__hub.panel(); if (!p) return null; let sec = ''; const out = [];
  [...p.querySelectorAll('.gc-hub-sec, .gc-hub-item')].forEach(e => { if (e.classList.contains('gc-hub-sec')) { sec = e.textContent; return; }
    out.push({ key: e.id ? '#' + e.id : 'L:' + (e.getAttribute('data-label') || ''), label: e.getAttribute('data-label') || e.textContent.replace(/\s+/g, ' ').trim(), sec: e.id ? 'added' : sec }); });
  return out; });

/* one item: open the menu, click it, judge it, close what it opened, check the screen is usable again */
async function tryItem(A, it, who){
  const P = A.page(); const tag = who + ' 💎 ' + it.label;
  await A.ev(() => window.__hub.snap());
  const e0 = A.errs.length, d0 = A.dialogs.length, dl0 = A.downloads.length, fc0 = A.choosers, pu0 = A.popups.length;
  const where = await openHub(A);
  if (where !== 'ok') { ok(false, tag + ': the 💎 menu opens on screen', where); return; }
  /* the items other patches add can arrive a moment after the menu opens */
  let found = false; for (let i = 0; i < 12 && !found; i++) { found = await A.ev(k => !![...window.__hub.panel().querySelectorAll('.gc-hub-item')].find(e => (e.id ? '#' + e.id : 'L:' + (e.getAttribute('data-label') || '')) === k), it.key); if (!found) await sleep(300); }
  if (!found) { ok(false, tag + ': the item is on the menu when it is opened again', it.key); return; }
  const loc = P.locator(it.key.startsWith('#') ? '.gc-hub-panel ' + it.key : '.gc-hub-panel .gc-hub-item[data-label="' + it.key.slice(2).replace(/"/g, '\\"') + '"]').last();
  let clicked = true; try { await loc.scrollIntoViewIfNeeded({ timeout: 3000 }); await loc.click({ timeout: 4000 }); } catch (e) { clicked = String(e.message).slice(0, 160); }
  await sleep(700);
  const early = await A.ev(() => window.__hub.layers().filter(e => window.__hub.big(e)).map(e => window.__hub.desc(e)));
  await sleep(2000);   /* past the 2-second notice sweeper: a screen it takes away shows up here */
  const st = await A.ev(() => { const h = window.__hub; const L = h.layers();
    L.sort((a, b) => h.area(b) - h.area(a));
    return { panel: !!h.panel(), layers: L.map(e => h.desc(e)), big: L.filter(e => h.big(e)).length, views: h.views.slice().concat(localStorage.getItem('grayco_view') !== h.view ? ['→' + localStorage.getItem('grayco_view')] : []), opens: h.opens.slice(),
      alertPanel: (() => { const p = document.getElementById('_alertPanel'); return !!(p && h.vis(p)); })() }; });
  const dlg = A.dialogs.slice(d0), errs = A.errs.slice(e0);
  const did = st.layers.length || dlg.length || A.downloads.length > dl0 || A.choosers > fc0 || A.popups.length > pu0 || st.views.length || st.opens.length || st.alertPanel;
  const bad = dlg.filter(d => BAD_DIALOG.test(d.message) || REFUSED.test(d.message));
  const probs = [];
  if (clicked !== true) probs.push('click: ' + clicked);
  if (st.panel) probs.push('the 💎 menu stayed open');
  if (!did) probs.push('nothing happened');
  if (bad.length) probs.push('dialog: ' + bad.map(d => d.message.slice(0, 90)).join(' / '));
  if (errs.length) probs.push('page error: ' + errs.join(' / ').slice(0, 300));
  if (early.length && !st.big && !dlg.length && !st.views.length) probs.push('its screen vanished by itself: ' + early.join(', '));
  /* close it */
  const how = [];
  for (let round = 0; round < 4; round++) {
    const left = await A.ev(() => window.__hub.layers().filter(e => window.__hub.big(e)).length);
    if (!left) break;
    if (round === 0) { await P.keyboard.press('Escape'); how.push('Esc'); await sleep(700); continue; }
    const c = await A.ev(() => { const h = window.__hub; const L = h.layers().filter(e => h.big(e)); L.sort((a, b) => (+getComputedStyle(a).zIndex || 0) - (+getComputedStyle(b).zIndex || 0)); const top = L.pop(); return top ? h.closer(top) : null; });
    if (!c) { how.push('no close button'); break; }
    if (!c.top) probs.push('its close button “' + c.t + '” is covered by something');
    await P.mouse.click(c.x, c.y); how.push('“' + c.t + '”'); await sleep(900);
  }
  await sleep(1100);   /* the ‹ Back helper and timers settle */
  const after = await A.ev(() => { const h = window.__hub; return { left: h.layers().filter(e => h.big(e)).map(e => h.desc(e)), block: h.blockers(), ovf: document.body.style.overflow + '|' + document.documentElement.style.overflow, ovf0: h.ovf, panel: !!h.panel() }; });
  if (after.left.length) probs.push('still on screen after ' + how.join(' → ') + ': ' + after.left.join(', '));
  if (after.block.length) probs.push('something invisible blocks clicks: ' + after.block.join(', '));
  if (after.ovf !== after.ovf0 && /hidden/.test(after.ovf)) probs.push('page scroll left locked');
  if (after.panel) probs.push('the 💎 menu is open again by itself');
  const lateErr = A.errs.slice(e0 + errs.length); if (lateErr.length) probs.push('page error while closing: ' + lateErr.join(' / ').slice(0, 300));
  const what = st.layers.length ? st.layers[0] : dlg.length ? dlg[0].type + ': ' + dlg[0].message.replace(/\s+/g, ' ').slice(0, 60) : A.downloads.length > dl0 ? 'download ' + A.downloads[A.downloads.length - 1] : A.choosers > fc0 ? 'file picker' : st.views.length ? 'tab ' + st.views.join(',') : st.alertPanel ? 'notifications panel' : st.opens.length ? 'opens ' + st.opens[0] : '—';
  ok(!probs.length, tag + ' → ' + what + (how.length ? '  [closed: ' + how.join(' → ') + ']' : ''), probs);
  /* put the CRM back for the next item, whatever happened */
  await A.ev(() => { const h = window.__hub; h.layers().forEach(e => { if (!h.all.has(e)) { try { e.remove(); } catch (x) {} } else { e.classList.remove('visible', 'open', 'show', 'on'); if (h.vis(e)) e.style.display = 'none'; } });
    try { if (document.getElementById('_gcLearnPanel') && window._gcToggleExplain) window._gcToggleExplain(); } catch (x) {}
    if (localStorage.getItem('grayco_view') !== h.view || h.views.length) { try { window._setView(h.view || 'dashboard'); } catch (x) {} } });
  await sleep(300);
}

async function profileRun(who, acct, opts){
  console.log('== ' + who);
  const A = await boot(who, acct);
  try {
    await A.ev(PAGE_LIB);
    const cover = await A.ev(() => (window._gcNavLayers ? window._gcNavLayers() : []).map(e => (e.id || String(e.className).slice(0, 30)) + ' “' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 60) + '”'));
    ok(!cover.length, who + ': the CRM opens with no screen over it', cover);
    await A.ev(() => window.__hub.snap());
    const where = await openHub(A); ok(where === 'ok', who + ': the 💎 menu opens, on screen', where);
    await sleep(2500);   /* items other patches add */
    const items = (await readItems(A)) || [];
    const labels = items.map(i => i.label);
    console.log('   ' + items.length + ' items: ' + labels.join(' · '));
    ok(items.length > (opts.min || 20), who + ': the menu has its items (' + items.length + ')');
    const dupes = labels.filter((l, i) => labels.indexOf(l) !== i); ok(!dupes.length, who + ': no item is listed twice', dupes);
    const pay = PAYROLL.filter(l => labels.indexOf(l) >= 0);
    if (opts.payroll) ok(pay.length === PAYROLL.length, who + ': payroll items are there (' + pay.join(', ') + ')', PAYROLL.filter(l => labels.indexOf(l) < 0));
    else ok(!pay.length, who + ': no payroll item (payroll is for admins and the Office Manager only)', pay);
    if (opts.notThere) { const nt = opts.notThere.filter(l => labels.indexOf(l) >= 0); ok(!nt.length, who + ': owner-only items are not shown', nt); }
    if (opts.mustHave) { const mh = opts.mustHave.filter(l => !labels.some(x => x.indexOf(l) >= 0)); ok(!mh.length, who + ': has ' + opts.mustHave.join(', '), mh); }
    if (opts.panelChecks) {
      /* the items other patches put at the TOP are there the moment it opens (they used to pop in seconds later, under the pointer) */
      await A.ev(() => window._gcCloseHub && window._gcCloseHub()); await A.page().mouse.move(300, 300); await A.page().mouse.move(900, 500);
      await openHub(A); await A.page().mouse.move(1200, 600);
      const top = await A.ev(() => { const p = window.__hub.panel(); return ['#gc-hub-projhub-link', '#gc-emailq-hub-link', '#gc-clean-hub'].filter(k => !p.querySelector(k)); });
      ok(!top.length, who + ': Project Hubs, Email Queue, Clean up the job list are in the menu the moment it opens', top);
      /* the menu's own controls */
      await A.page().locator('.gc-hub-panel .gc-hub-x').click(); await sleep(300);
      ok(!(await A.ev(() => !!window.__hub.panel())), who + ': the menu’s own ✕ closes it');
      await openHub(A); await A.page().keyboard.press('Escape'); await sleep(300);
      ok(!(await A.ev(() => !!window.__hub.panel())), who + ': Esc closes the menu');
      await openHub(A); await A.page().mouse.click(600, 450); await sleep(300);
      ok(!(await A.ev(() => !!window.__hub.panel())), who + ': a click outside closes the menu');
      await openHub(A); await A.ev(() => { const b = document.getElementById('gc-hub-btn'); b.click(); }); await sleep(300);
      ok(!(await A.ev(() => !!window.__hub.panel())), who + ': a second 💎 tap closes the menu');
      await A.ev(() => { window._gcToggleHub(); document.querySelectorAll('.gc-hub-panel').forEach(p => p.remove()); });   /* another script takes the panel away */
      await A.ev(() => document.getElementById('gc-hub-btn').click()); await sleep(300);
      ok(!!(await A.ev(() => !!window.__hub.panel())), who + ': after the panel was removed by other code, the next 💎 tap opens it (no stale "close" tap)');
      await A.ev(() => window._gcCloseHub && window._gcCloseHub());
    }
    if (opts.click) {
      for (const it of items) {
        if (ONLY && it.label.indexOf(ONLY) < 0) continue;
        if (/^🚪?\s*Sign out/.test(it.label)) { ok(true, who + ' 💎 ' + it.label + ' (present; not clicked — it signs out)'); continue; }
        await tryItem(A, it, who);
      }
    }
    if (opts.desk) {
      console.log('== ' + who + ': the toolbar and the desk');
      const tb = await A.ev(() => !!document.querySelector('#gc-topbar [data-tb="hub"]') && document.querySelector('#gc-topbar [data-tb="hub"]').getClientRects().length > 0);
      if (tb) { const w = await openHub(A, 'topbar'); ok(w === 'ok', who + ': 💎 from the top toolbar opens on screen', w); await A.ev(() => window._gcCloseHub()); }
      else ok(true, who + ': (no top toolbar on this profile)');
      const desk = await A.ev(() => { try { if (window._gcRA && window._gcRA.more) { window._gcRA.more(); return true; } } catch (e) {} return false; });   /* the desk ☰ More sheet: “💎 The 💎 menu” */
      await sleep(1200);
      const btn = await A.ev(() => { const b = [...document.querySelectorAll('[data-ra-a="hub"]')].filter(x => x.getClientRects().length)[0]; return !!b; });
      if (desk && btn) {
        await A.page().locator('[data-ra-a="hub"]').first().click(); await sleep(600);
        const w = await A.ev(() => { const p = window.__hub.panel(); if (!p) return 'no panel'; const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.width > 200 ? 'ok' : 'off screen ' + JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round)); });
        ok(w === 'ok', who + ': desk ☰ More → “💎 The 💎 menu” opens the menu on screen', w);
        const first = await A.ev(() => { const p = window.__hub.panel(); const e = p && p.querySelector('.gc-hub-item[data-label="Help Center"]'); return !!e; });
        if (first) { await A.page().locator('.gc-hub-panel .gc-hub-item[data-label="Help Center"]').click(); await sleep(900);
          ok(await A.ev(() => !window.__hub.panel() && !!document.getElementById('_gcHelpOv')), who + ': an item picked from the desk-opened menu opens (Help Center) and the menu closes');
          await A.page().keyboard.press('Escape'); await sleep(600); }
      } else ok(true, who + ': (no desk launcher on this profile)');
    }
    const errs = A.errs.filter(e => /HUBFIX|toggleHub|closeHub/.test(e)); ok(!errs.length, who + ': no page error from the menu code', errs);
  } finally { await A.close(); }
}

const OWNER_ONLY = ['Cash Position', 'P&L (auto)', 'Team Status'];
try {
  const RUN = (process.env.HUB_PROFILES || 'admin,office,office-manager,pm').split(',');
  if (RUN.indexOf('admin') >= 0) { world('Office');
  await profileRun('admin', 'u-wesley', { click: true, panelChecks: true, desk: true, payroll: true, min: 100, mustHave: ['Team access', 'View as', 'Data-entry mode', 'Cash Position', 'Payroll'] }); }
  {
    if (RUN.indexOf('office') >= 0) { world('Office');
    await profileRun('office', 'u-office', { click: true, panelChecks: true, desk: true, payroll: false, min: 60 }); }
    if (RUN.indexOf('office-manager') >= 0 && !ONLY) { world('Office Manager');
    await profileRun('office-manager', 'u-office', { payroll: true, min: 60 }); }
    if (RUN.indexOf('pm') >= 0 && !ONLY) { world('Office');
    await profileRun('pm', 'u-pm', { payroll: false, notThere: OWNER_ONLY, min: 20, mustHave: ['Job Messages', 'Help Center'] }); }
  }
} catch (e) { fail++; console.log('  ✗ FAIL the run stopped: ' + (e && e.stack || e)); }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
