// test_ALLWHITE.mjs <build-dir> — patch ALLWHITE on the real-data mirror, offline (harness_N.mjs):
//   on an iPhone (390x844, touch, GrayCo Field) and on the desk (1462x987) every navy pop-up / sheet / page opens WHITE:
//   no navy surface left, the sheet's background light, every text on the new white ≥ 4.5:1, coloured buttons keep their
//   white text; with the kill switch (gc_allwhite_off) the same screens are navy again (so the test sees the change).
//   Then a sweep of every window._gcOpen* / _gcShow* opener, and the desk tabs. Left dark: the sign-in screen, the desk's
//   top bar + left sidebar, the TVs.
// Usage: node test_ALLWHITE.mjs <dir with index.html>   (GC_HARNESS = harness_N.mjs, MIRROR = mirror.json, SHOTS = dir)
import { pathToFileURL } from 'url'; import fs from 'fs';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/allwhite/';
const ONLY = process.env.ONLY || '';           // 'm' = phone only, 'd' = desk only
const SWEEP = process.env.SWEEP !== '0';
const DOLIST = process.env.LIST !== '0';   // LIST=0: only the sweep (SW_FROM..SW_TO), for a shorter browser hold
const SW_FROM = +(process.env.SW_FROM || 0), SW_TO = +(process.env.SW_TO || 1e9);
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_ALLWHITE.mjs <dir with index.html>'); process.exit(2); }
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
H.resetCloud(); rows.forEach(r => { if (!/^gc_cc_token/.test(r.key)) H.cset(r.key, r.v); });
const REPORT = { converted: [], fails: [], bar: [], deskLogo: [] };

/* in the page: measure what opened since the last mark */
const MEASURE = () => {
  const AW = window._gcAllWhite;
  const rgba = s => { const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
  const lum = c => { const a = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const Y = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const kind = c => AW ? AW.kind(c) : (c && c[3] >= 0.5 && Y(c) < 75 ? 'navy' : null);
  const before = window.__awBefore || new Set();
  const vw = innerWidth, vh = innerHeight;
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return null; return r; };
  const SKIPC = '[class*="toast"],[id*="toast"],[id*="Toast"],[role="status"],aside,#gc-topbar,#gc-otv,#gc-lob,svg';
  const roots = [...document.body.children].filter(el => !before.has(el) && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && vis(el) && !el.matches(SKIPC));
  const out = { roots: roots.map(r => (r.id || r.className || r.tagName).toString().slice(0, 40)), navy: [], fails: [], ourFails: [], btnFails: [], sheetY: null, marked: 0 };
  let best = null;
  const eff = el => { let p = el; while (p && p.nodeType === 1) { const c = rgba(getComputedStyle(p).backgroundColor); if (c && c[3] >= 0.5) return { c, el: p }; p = p.parentElement; } return { c: [255, 255, 255, 1], el: null }; };
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest(SKIPC)) continue;
      const r = vis(el); if (!r) continue;
      const cs = getComputedStyle(el), c = rgba(cs.backgroundColor);
      if (el.hasAttribute('data-aw')) out.marked++;
      const area = r.width * r.height;
      if (c && c[3] >= 0.97 && (!best || area > best.area)) best = { area, c };
      const k = kind(c);
      const fixedSmall = cs.position === 'fixed' && (area < 200 * 110 || r.height < 90);
      if (k === 'navy' && c[3] >= 0.97 && area >= 3000 && !fixedSmall) out.navy.push({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 30), bg: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), t: (el.innerText || '').trim().slice(0, 40) });
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
      if (!/[A-Za-z0-9]/.test(own)) continue;
      const fg = rgba(cs.color); if (!fg) continue;
      const e = eff(el); const bg = e.c;
      const f = [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3])];
      const ratio = cr(f, bg);
      if (ratio < 4.5) {
        const rec = { t: own.slice(0, 40), color: cs.color, bg: 'rgb(' + bg.slice(0, 3).join(',') + ')', ratio: +ratio.toFixed(2), ours: !!(e.el && e.el.hasAttribute('data-aw')) };
        if (ratio < 3 || cs.fontSize && parseFloat(cs.fontSize) < 18.5) out.fails.push(rec);
        if (rec.ours) out.ourFails.push(rec);
      }
    }
  }
  out.sheetY = best ? Math.round(Y(best.c)) : null; out.sheetBg = best ? 'rgb(' + best.c.slice(0, 3).join(',') + ')' : null;
  out.dlogo = roots.some(r => r.querySelector('.gc-aw-dlogo'));
  out.navyN = out.navy.length; out.navy = out.navy.slice(0, 6); out.fails = out.fails.slice(0, 8); out.ourFails = out.ourFails.slice(0, 8);
  return out;
};
const MARK = () => { window.__awBefore = new Set([...document.body.children]); };
const CLEAN = () => { const b = window.__awBefore; if (b) [...document.body.children].forEach(el => { if (!b.has(el) && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && !el.hasAttribute('data-gc-keep')) el.remove(); }); document.querySelectorAll('._gcSheetOv,#_gcJobDash,.gcfp-sheet,.gc-fh-sheet').forEach(o => o.remove()); };

async function device(mobile){
  const c = await H.computer(mobile ? 'PHONE' : 'DESK', { build, mobile });
  await c.ctx.route(u => /\/\.netlify\/functions\//.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
  if (!mobile) await c.page().setViewportSize({ width: 1462, height: 987 });
  return c;
}
/* open → measure (white), the same with the kill switch (navy) → screenshot */
async function screen(c, p, tag, name, code, { must = true } = {}){
  await p.evaluate(CLEAN).catch(() => {}); await H.sleep(300);
  await p.evaluate(MARK);
  await p.evaluate(code).catch(e => console.log('    (' + name + ': ' + e.message.slice(0, 120) + ')'));
  await H.sleep(1400);
  const m = await p.evaluate(MEASURE);
  if (!m.roots.length) { if (must) ok(false, tag + ' ' + name + ' opens', m); return null; }
  const file = SHOTS + tag + '_' + name + '.png';
  await p.screenshot({ path: file });
  await p.evaluate(() => window._gcAllWhite.off(true)); await H.sleep(250);
  const was = await p.evaluate(MEASURE);
  await p.evaluate(() => window._gcAllWhite.off(false)); await H.sleep(400);
  const again = await p.evaluate(MEASURE);
  const converted = was.navyN > 0 || (was.sheetY !== null && was.sheetY < 75);
  const good = m.navyN === 0 && (m.sheetY === null || m.sheetY >= 235) && m.ourFails.length === 0 && again.navyN === 0;
  if (must || converted) {
    ok(good, tag + ' ' + name + ': white' + (converted ? ' (was navy: ' + was.navyN + ' dark surfaces, sheet ' + was.sheetBg + ')' : ' (was already light)') + ' → sheet ' + m.sheetBg + ', 0 navy, text ≥ 4.5:1 on the new white', good ? undefined : { navy: m.navy, ourFails: m.ourFails, sheet: m.sheetBg, afterToggle: again.navyN });
    if (m.fails.length) console.log('      note: low-contrast text not on our white (pre-existing): ' + JSON.stringify(m.fails.slice(0, 3)));
  }
  if (converted) REPORT.converted.push(tag + ' ' + name + ' → ' + file);
  if (!good && (must || converted)) REPORT.fails.push(tag + ' ' + name);
  await p.evaluate(CLEAN).catch(() => {});
  return { was, again, converted };
}

/* the GrayCo bar on Field screens: ‹ Back left, the logo centred, Done right, the title on its own line under it */
const BAR = () => {
  const vw = innerWidth, R = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const shown = el => el && el.isConnected && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const bar = document.getElementById('gc-aw-bar'), head = document.querySelector('#_gcAppHead[data-aw-head]'), dash = document.getElementById('_gcJobDash');
  let kind = '', logo = null, back = null, done = null, barR = null;
  if (shown(bar)) { kind = 'bar'; logo = bar.querySelector('.gc-aw-logo'); back = document.getElementById('_gcNavBk'); done = document.getElementById('gc-aw-done'); barR = R(bar); }
  else if (shown(head)) { kind = 'head'; logo = head.querySelector('.gc-aw-logo'); back = document.getElementById('_gcAppBack'); done = document.getElementById('gc-aw-hdone'); barR = R(back); barR.b = Math.max(R(back).b, R(logo).b); barR.l = 0; barR.r = vw; }
  else if (dash && dash.querySelector('.gc-aw-mid')) { kind = 'dash'; logo = dash.querySelector('.gc-aw-mid'); back = [...dash.querySelectorAll('button,a')].find(b => /^‹/.test((b.innerText || '').trim())); done = [...dash.querySelectorAll('button,a')].find(b => /Camera/.test(b.innerText || '')); barR = R(logo.parentElement); }
  if (!kind) return { kind: '' };
  const lr = R(logo), br = back && shown(back) ? R(back) : null, dr = done && shown(done) ? R(done) : null;
  /* the page title: the biggest text below the bar in the top 320 px */
  const pool = kind === 'head' ? [document.getElementById('_gcAppTitle')] : [...(kind === 'dash' ? dash : document.body).querySelectorAll('*')].filter(e => !e.closest('#gc-aw-bar,#_gcAppTabs') && [...e.childNodes].some(n => n.nodeType === 3 && /[A-Za-z]{3}/.test(n.nodeValue)));
  let title = null, fs = 0;
  for (const e of pool) { if (!e || !shown(e)) continue; const r = e.getBoundingClientRect(); if (r.top < 0 || r.top > 330) continue; const f = parseFloat(getComputedStyle(e).fontSize); if (f > fs) { fs = f; title = e; } }
  const tr = title ? R(title) : null;
  const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const topAtTitle = title ? document.elementFromPoint(Math.min(tr.l + 10, vw - 2), tr.t + tr.h / 2) : null;
  return { kind, logoCx: Math.round(lr.l + lr.w / 2), vw, logoH: Math.round(lr.h), logoOk: logo.complete && logo.naturalWidth > 0, back: br && Math.round(br.l), backTxt: back && back.innerText.trim().replace(/\s+/g, ' '), done: dr && Math.round(vw - dr.r), doneTxt: done && done.innerText.trim(),
    barBg: kind === 'bar' ? getComputedStyle(bar).backgroundColor : kind === 'head' ? getComputedStyle(head).backgroundColor : (() => { let e = logo.parentElement; while (e && getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)') e = e.parentElement; return e ? getComputedStyle(e).backgroundColor : ''; })(),
    title: title && title.innerText.trim().slice(0, 40), titleTop: tr && Math.round(tr.t), barBottom: Math.round(barR.b),
    overlap: !!(title && (hit(tr, br) || hit(tr, lr) || hit(tr, dr) || (kind !== 'dash' && tr.t < barR.b - 1))), titleVisible: !!(topAtTitle && (topAtTitle === title || title.contains(topAtTitle))) };
};
async function barCheck(p, name, code){
  await p.evaluate(CLEAN).catch(() => {}); await H.sleep(300);
  if (code) { await p.evaluate(code).catch(e => console.log('    (' + name + ': ' + e.message.slice(0, 120) + ')')); await H.sleep(1600); }
  const b = await p.evaluate(BAR);
  const file = SHOTS + 'bar_' + name + '.png';
  await p.screenshot({ path: file });
  const good = b.kind && Math.abs(b.logoCx - b.vw / 2) <= 3 && b.logoH >= 26 && b.logoH <= 34 && b.logoOk && b.back !== null && b.back < 70 && b.done !== null && b.done < 70 && /^(rgb\(255, 255, 255\))$/.test(b.barBg) && b.title && !b.overlap && b.titleVisible;
  ok(good, 'phone ' + name + ': GrayCo bar — ‹ Back left, logo centred (' + b.logoCx + '/' + b.vw / 2 + ', ' + b.logoH + ' px), ' + (b.doneTxt || '?') + ' right, white; title “' + b.title + '” on its own line under it (top ' + b.titleTop + ' ≥ bar ' + b.barBottom + '), not covered', good ? undefined : b);
  REPORT.bar.push(name + ' → ' + file);
  return b;
}
async function barChecks(c, p){
  const J = 'window.__P';
  await barCheck(p, 'createdoc', `window._gcJobCreateDoc(${J})`);
  /* Done on the bar = the sheet's own Done (it closes; the job page comes back) */
  const before = await p.evaluate(() => !!document.querySelector('._gcSheetOv'));
  await p.evaluate(() => document.getElementById('gc-aw-done').click()); await H.sleep(900);
  const after = await p.evaluate(() => ({ sheet: !!document.querySelector('._gcSheetOv'), dash: !!document.getElementById('_gcJobDash') }));
  ok(before && !after.sheet, 'phone createdoc: Done on the bar closes it (the sheet\'s own Done ran)', after);
  await barCheck(p, 'jobinfo', `window._gcOpenJobProfile(${J}.id)`);
  await p.evaluate(() => document.getElementById('_gcNavBk').click()); await H.sleep(900);
  ok(await p.evaluate(() => !document.querySelector('[data-gcnav-pad]:not(#_gcJobDash)') || !!document.getElementById('_gcJobDash')), 'phone jobinfo: ‹ Back on the bar closes it');
  await barCheck(p, 'myapprovals', `window._gcOpenPmApprovals()`);
  await barCheck(p, 'jobdocs', `window._gcJobDocsList(${J})`);
  await barCheck(p, 'jobdash', `window._gcJobDashboard(${J}.id)`);
  await barCheck(p, 'leads', `(function(){ document.querySelectorAll('#_gcJobPick,#_gcJobDash,._gcSheetOv').forEach(o => o.remove()); window._setView('leads'); })()`);
  await H.sleep(1500);
  const lw = await p.evaluate(() => { const m = document.querySelector('main'); const cs = getComputedStyle(m); const h = getComputedStyle(document.documentElement).backgroundColor, b = getComputedStyle(document.body).backgroundColor; return { main: cs.backgroundColor, html: h, body: b }; });
  ok(!/rgb\((10, 22, 40|15, 36, 64)\)/.test(lw.main + lw.html + lw.body), 'phone leads: the page behind the Leads hub is light (main/body/html)', lw);
  await p.evaluate(() => { try { window._gcNavBack(); } catch (e) {} }); await H.sleep(1500);
  const home = await p.evaluate(() => ({ home: !!document.querySelector('#_gcJobPick.gc-fh'), bar: (document.getElementById('gc-aw-bar') || { style: {} }).style.display || 'none', logos: document.querySelectorAll('#_gcJobPick .gc-aw-logo').length }));
  ok(home.home && home.bar === 'none' && home.logos === 0, 'phone: Field Home keeps its own logo header (no bar added)', home);
  await p.screenshot({ path: SHOTS + 'bar_home.png' });
}

const W = []; const closeAll = async () => { for (const c of W) await c.b.close().catch(() => {}); };
try {
  for (const mobile of [true, false]) {
    if (ONLY && (ONLY === 'm') !== mobile) continue;
    const tag = mobile ? 'phone' : 'desk';
    console.log('\n══ ' + (mobile ? 'iPhone 390x844, GrayCo Field' : 'Desk 1462x987') + ' ══');
    const c = await device(mobile); W.push(c);
    const p = c.page();
    await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 30000 }); await H.sleep(1200);
    const gate = await p.evaluate(() => ({ marked: document.querySelectorAll('#gc-auth-gate [data-aw],[id^="gc-auth"][data-aw]').length, aw: !!window._gcAllWhite }));
    ok(gate.aw && gate.marked === 0, tag + ': the sign-in screen is left as it is', gate);
    await H.signIn(c, 'wjohnson@grayco-cs.com', 9000);
    await H.waitFor(c, () => (window._crm && (window._crm.projects || []).length > 20 && typeof window._gcJobCreateDoc === 'function') || null, null, 120000, 500);
    await H.sleep(5000);
    await p.evaluate(() => { const P = window._crm.projects; window.__P = P.find(x => /^brad$/i.test(String(x.name || '').trim())) || P.find(x => x.status === 'Active' && x.address && x.po) || P[0]; window.__C = (window._crm.customers || []).find(x => x && x.name) || {}; });
    console.log('    job: ' + await p.evaluate(() => window.__P.name + ' (' + window.__P.id + ')'));
    await p.screenshot({ path: SHOTS + tag + '_start.png' });
    if (mobile) ok(await p.evaluate(() => document.documentElement.classList.contains('_fieldmode') || !!document.querySelector('#_gcJobPick.gc-fh')), 'phone: opens in GrayCo Field');
    const J = 'window.__P';
    const LIST = [
      ['createdoc', `window._gcJobCreateDoc(${J})`],
      ['jobinfo', `window._gcOpenJobProfile(${J}.id)`],
      ['jobdash', `window._gcJobDashboard(${J}.id)`, { must: false }],
      ['jobdocs', `window._gcJobDocsList(${J})`],
      ['jobfin', `window._gcJobFinancials(${J})`],
      ['docshub', `window._gcFieldDocsHub()`],
      ['search', `window._gcUniversalSearch()`],
      ['customer', `window._gcOpenCustomerProfile(window.__C.name || ${J}.client)`],
      ['editcustomer', `window._gcEditCustomer(window.__C, function(){})`],
      ['invoiceform', `window._gcInvoiceForm(${J}, 'client')`],
      ['myfin', `window._gcMyFinancials()`],
      ['expenses', `window._gcOpenExpenseApprovals()`],
      ['fieldsched', `window._gcOpenFieldSchedule(${J}.id)`],
      ['fieldinv', `window._gcOpenFieldInvoices()`],
      ['reminders', `window._gcOpenRemindersList()`],
      ['progress', `window._gcOpenFieldProgress(${J})`],
      ['enterinvoice', `window._gcFieldEnterInvoice(${J})`],
      ['subagreement', `window._gcOpenSubAgreement(${J})`],
      ['subsignup', `window._gcSubSignup()`],
      ['myapprovals', `window._gcOpenPmApprovals()`],
    ];
    if (DOLIST) for (const [name, code, opt] of LIST) await screen(c, p, tag, name, code, opt);
    if (DOLIST && mobile) await barChecks(c, p);
    if (DOLIST) {
    /* coloured buttons on the white sheets keep white text */
    await p.evaluate(MARK); await p.evaluate(`window._gcOpenJobProfile(${J}.id)`); await H.sleep(1200);
    const btns = await p.evaluate(() => [...document.querySelectorAll('#_gcProfileOv button, ._gcSheetOv button, body > div:last-of-type button')].filter(b => { const c = getComputedStyle(b).backgroundColor; return /rgb\((22, 163, 74|37, 99, 235|124, 58, 237)\)/.test(c); }).map(b => ({ t: b.textContent.trim().slice(0, 20), color: getComputedStyle(b).color })));
    ok(btns.length > 0 && btns.every(b => b.color === 'rgb(255, 255, 255)'), tag + ': green/blue/purple buttons on Job Info keep white text', btns.slice(0, 6));
    await p.evaluate(CLEAN);
    if (!mobile) {
      const chrome = await p.evaluate(() => ({ aside: document.querySelectorAll('aside[data-aw], aside [data-aw]').length, top: document.querySelectorAll('#gc-topbar[data-aw], #gc-topbar [data-aw]').length, asideBg: (document.querySelector('aside') ? getComputedStyle(document.querySelector('aside')).backgroundImage.slice(0, 60) : '') }));
      ok(chrome.aside === 0 && chrome.top === 0, 'desk: the left sidebar and the top bar (the app\'s chrome) are left as they are', chrome);
      /* a full-screen desk overlay over the sidebar: a small logo in the middle of its header; a dimmed modal: none */
      const dl = await p.evaluate(async () => {
        const mk = (id, bg) => { const o = document.createElement('div'); o.id = id; o.style.cssText = 'position:fixed;inset:0;z-index:99990;background:' + bg + ';display:flex;flex-direction:column';
          o.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 16px;background:#0f2440;border-bottom:1px solid #1e3a5f"><b style="color:#fff;font-size:18px">Test overlay</b><button style="background:#1e3a5f;color:#cbd5e1;border:none;border-radius:8px;padding:8px 14px">Close</button></div><div style="padding:20px;color:#e2e8f0">Body text</div>';
          document.body.appendChild(o); return o; };
        const a = mk('gc-aw-t1', '#0a1628'); await new Promise(r => setTimeout(r, 600));
        const lg = a.querySelector('.gc-aw-dlogo'), r = lg && lg.getBoundingClientRect(), hr = a.firstElementChild.getBoundingClientRect();
        const res = { logo: !!lg, cx: r && Math.round(r.left + r.width / 2), vw: innerWidth, h: r && Math.round(r.height), inHeader: !!(r && r.top >= hr.top && r.bottom <= hr.bottom), bg: getComputedStyle(a).backgroundColor, head: getComputedStyle(a.firstElementChild).backgroundColor };
        a.remove();
        const b = mk('gc-aw-t2', 'rgba(0,0,0,.6)'); await new Promise(r => setTimeout(r, 600)); res.dimmed = !!b.querySelector('.gc-aw-dlogo'); b.remove();
        return res;
      });
      ok(dl.logo && Math.abs(dl.cx - dl.vw / 2) <= 3 && dl.h >= 22 && dl.h <= 30 && dl.inHeader && dl.bg !== 'rgb(10, 22, 40)' && dl.head === 'rgb(255, 255, 255)' && !dl.dimmed, 'desk: a full-screen overlay that covers the sidebar gets a small logo in the middle of its (now white) header; a dimmed modal does not', dl);
      /* the desk tabs */
      const NAVQ = 'aside nav button, aside nav a, aside nav [role="button"]';
      const views = await p.evaluate(q => [...document.querySelectorAll(q)].map(b => (b.getAttribute('title') || b.getAttribute('aria-label') || (b.innerText || '').trim().split('\n').pop() || '').trim()), NAVQ);
      console.log('    desk tabs: ' + views.join(', '));
      for (let vi = 0; vi < views.length; vi++) {
        const v = views[vi] + '#' + vi;
        if (/drag|reorder/i.test(views[vi])) continue;
        const okc = await p.evaluate(([q, i]) => { const b = document.querySelectorAll(q)[i]; if (b) b.click(); return !!b; }, [NAVQ, vi]); if (!okc) continue;
        await H.sleep(1800);
        const m = await p.evaluate(() => { const M = document.querySelector('main') || document.body; window.__awBefore = new Set([...document.body.children].filter(x => !x.contains(M))); return null; });
        const r = await p.evaluate(MEASURE);
        const bad = r.navyN > 0 || r.ourFails.length > 0;
        const fn = SHOTS + 'desk_tab_' + v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.png';
        if (bad) { ok(false, 'desk tab ' + v + ': no navy, text ≥ 4.5:1', { navy: r.navy, ourFails: r.ourFails }); await p.screenshot({ path: fn }); REPORT.fails.push('desk tab ' + v); }
        else pass++;
        if (r.marked > 0) { REPORT.converted.push('desk tab ' + v + ' (' + r.marked + ' surfaces marked) → ' + fn); await p.screenshot({ path: fn }); }
      }
      console.log('  ✓ desk tabs checked: ' + views.length);
      await p.evaluate(() => { try { window._setView('dashboard'); } catch (e) {} }); await H.sleep(1000);
      await p.evaluate(() => { window.__awBefore = new Set(); });
    }
    }
    if (SWEEP) {
      const fns = await p.evaluate(() => Object.keys(window).filter(k => /^_gc(Open|Show)[A-Z]/.test(k) && typeof window[k] === 'function').sort());
      const SKIPF = /Print|PDF|DocHTML|AdGen|CalendarFeed|PhoneCalPicker|EstimateInBuilder|Onboarding|OfficeHome|JobTab|PayrollTab|AllProjects|QbCsvImport|ImportChecks|ImportCards|Attach|DocUploader/;
      console.log('    sweep: ' + fns.length + ' openers');
      let n = 0, idx = -1;
      for (const f of fns) {
        if (SKIPF.test(f)) continue;
        idx++; if (idx < SW_FROM || idx >= SW_TO) continue;
        n++;
        const sw = await screen(c, p, tag, 'sweep_' + f.replace(/^_gc/, ''), `(function(){ var f = window.${f}; try { f.length ? f(${J}) : f(); } catch (e) { try { f(${J}.id); } catch (x) {} } })()`, { must: false });
        if (sw && sw.again && sw.again.dlogo) REPORT.deskLogo.push(f);
        if (c.pages.length > 1) { for (const x of c.pages.slice(1)) await x.close().catch(() => {}); c.pages.length = 1; }
      }
      console.log('  ✓ sweep done: ' + n + ' openers tried');
    }
    const st = await p.evaluate(() => window._gcAllWhite.stats());
    console.log('    painter: ' + JSON.stringify(st));
    ok(st.maxMs < 250, tag + ': the painter stays quick (longest run ' + Math.round(st.maxMs) + ' ms, ' + Math.round(st.ms) + ' ms over ' + st.runs + ' runs)', st);
    const errs = c.errs.filter(e => /ALLWHITE|allwhite|_gcAllWhite/.test(e));
    ok(errs.length === 0, tag + ': no page errors from ALLWHITE', errs.slice(0, 3));
    await c.b.close(); W.pop();
  }
} catch (e) { fail++; console.log('  ✗ FAIL exception ' + (e && e.stack || e)); }
finally { await closeAll(); }
console.log('\nGrayCo bar screenshots:\n  ' + REPORT.bar.join('\n  '));
if (REPORT.deskLogo.length) console.log('desk overlays that got the small logo: ' + REPORT.deskLogo.join(', '));
console.log('\nconverted (' + REPORT.converted.length + '):\n  ' + REPORT.converted.join('\n  '));
if (REPORT.fails.length) console.log('not white yet: ' + REPORT.fails.join(', '));
fs.writeFileSync(SHOTS + 'report.json', JSON.stringify(REPORT, null, 1));
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
