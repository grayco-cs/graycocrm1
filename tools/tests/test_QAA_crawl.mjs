// test_QAA_crawl.mjs <build-dir> [out-dir] — patch QAA click-crawl (owner 11/12: "test every button, no mistakes"), GrayCo CONSTRUCTION
// and All companies. Per role (ROLES=admin,office,... env; default all) × company: the full CRM on a computer — every left-menu tab, and in
// each tab every visible button / sub-tab that is not destructive (skips delete / send / pay / approve / … unless asked), each modal it
// opens closed again (Escape / ✕). Records page errors, console errors, failed requests (4xx/5xx other than 401/403), blank views,
// overlays left open, and buttons that did nothing (info only). PHONE=1: GrayCo Field on a phone (390×844, touch) — every tile / tab.
// Writes <out-dir>/crawl_<role>_<co>.json + prints a summary. Offline harness, made-up data. MAXB = buttons per tab (default 14).
import fs from 'fs'; import path from 'path';
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset } = H;
const BUILD = path.resolve(process.argv[2] || '.'), OUT = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qaa_shots/crawl';
fs.mkdirSync(OUT, { recursive: true });
const MAXB = +(process.env.MAXB || 14), PHONE = process.env.PHONE === '1';
const ago = d => new Date(Date.now() - d * 864e5).toISOString(), today = new Date().toISOString().slice(0, 10), inDays = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const PEOPLE = {
  admin:  { email: 'wjohnson@grayco-cs.com', role: 'Admin', name: 'Wesley Johnson', cos: ['construction', 'all'] },
  office: { email: 'office@grayco-cs.com', role: 'Office Manager', name: 'Office Desk', cos: ['construction', 'all'] },
  om:     { email: 'om.demo@grayco-cs.com', pw: 'Correct-Horse-51', role: 'Office Manager', name: 'Olive Demo', cos: ['construction', 'all'] },
  pm:     { email: 'sbiffle@grayco-cs.com', role: 'Project Manager', name: 'Sample PM', cos: ['construction'] },
  roof:   { email: 'roof.demo@grayco-cs.com', pw: 'Correct-Horse-52', role: 'Project Manager', title: 'Roofing PM', name: 'Rex Demo', cos: ['construction'] },
  est:    { email: 'est.demo@grayco-cs.com', pw: 'Correct-Horse-53', role: 'Estimator', name: 'Glenn Demo', cos: ['construction'] },
  super:  { email: 'crew.demo@grayco-cs.com', pw: 'Correct-Horse-54', role: 'Superintendent', name: 'Demo Super', cos: ['construction'] },
  mkt:    { email: 'mkt.demo@grayco-cs.com', pw: 'Correct-Horse-55', role: 'Marketing Manager', name: 'Demo Marketing', cos: ['construction', 'all'] },
  ins:    { email: 'ins.demo@grayco-cs.com', pw: 'Correct-Horse-56', role: 'Insurance PM', name: 'Demo Insurance', cos: ['construction'] },
  apm:    { email: 'apm.demo@grayco-cs.com', pw: 'Correct-Horse-57', role: 'Assistant PM', name: 'Andy Demo', cos: ['construction'] }
};
for (const k of Object.keys(PEOPLE)) { const p = PEOPLE[k]; if (p.pw && !H.ACCOUNTS[p.email]) H.ACCOUNTS[p.email] = { pw: p.pw, id: 'u-q' + k, role: 'staff' }; }
const ROLES = (process.env.ROLES || Object.keys(PEOPLE).join(',')).split(',').filter(r => PEOPLE[r]);
function seed(){
  H.resetCloud();
  cset('users', Object.keys(PEOPLE).map((k, i) => ({ id: 'u' + (i + 1), name: PEOPLE[k].name, email: PEOPLE[k].email, role: PEOPLE[k].role, title: PEOPLE[k].title || '', active: true, phone: '90155501' + String(10 + i), payType: k === 'admin' ? 'owner' : 'hourly' })));
  cset('projects', [
    { id: 'P1', po: 'T2001', autoPO: 'T2001', name: 'Demo Kitchen Remodel', client: 'Zedd Homeowner', clientPhone: '9015551234', clientEmail: 'zedd@demo.test', address: '100 Demo St', city: 'Bartlett', state: 'TN', pm: 'Sample PM', superintendent: 'Demo Super', estimator: 'Glenn Demo', apm: 'Andy Demo', status: 'Active', contract: 25000, contractSigned: true, pct: 40, type: 'Residential Reno', updatedAt: ago(1),
      subs: [{ id: 'r1', subId: 'S1', name: 'Ace Demo Drywall', trade: 'Drywall', status: 'Awarded' }] },
    { id: 'P2', po: 'T2002', autoPO: 'T2002', name: 'Demo Roof Replacement', client: 'Demo Roof Client', address: '200 Demo Ave', city: 'Cordova', state: 'TN', pm: 'Rex Demo', status: 'Active', contract: 14000, contractSigned: true, pct: 10, type: 'Roofing', updatedAt: ago(5) },
    { id: 'P3', po: 'T2003', autoPO: 'T2003', name: 'Demo Storm Claim', client: 'Demo Claim Client', address: '300 Demo Rd', pm: 'Demo Insurance', status: 'In Progress', contract: 9000, contractSigned: true, type: 'Insurance', insurance: true, updatedAt: ago(0.2) },
    { id: 'P4', po: 'T2004', autoPO: 'T2004', name: 'Demo Done Bath', client: 'Demo Bath Client', address: '400 Demo Ln', pm: 'Sample PM', status: 'Completed', contract: 7000, contractSigned: true, updatedAt: ago(0.5) },
    { id: 'M1', name: 'Demo Mit basement', client: 'Demo Mit Client', status: 'active', type: 'Water Damage', companyId: 'mitigation', pm: 'Sample PM', updatedAt: ago(1) }]);
  cset('subs', [{ id: 'S1', name: 'Ace Demo Drywall', company: 'Ace Demo Drywall', trade: 'Drywall', isSub: true, phone: '9015552000', email: 'ace@demo.test' }]);
  cset('vendors', [{ id: 'V1', name: 'Demo Lumber Supply', cat2: 'Lumber', phone: '9015552100' }]);
  cset('schedule', [{ id: 'SC1', pid: 'P1', projectId: 'P1', date: today, title: 'Drywall hang', sub: 'Ace Demo Drywall', start: today, end: today }]);
  cset('leads', [
    { id: 'L1', name: 'Bid — demo warehouse', client: 'Demo Warehouse Co', type: 'Commercial', leadKind: 'Commercial', stage: 'New Lead', bidDue: inDays(3), estimator: 'Glenn Demo', pm: 'Glenn Demo', createdAt: ago(2), updatedAt: ago(2) },
    { id: 'L2', name: 'Demo website lead — deck', client: 'Demo Web Lead', type: 'Residential', stage: 'New Lead', source: 'Website', phone: '9015553333', email: 'web@demo.test', createdAt: ago(0.05), updatedAt: ago(0.05) },
    { id: 'L3', name: 'Roof estimate', client: 'Demo Roof Lead', type: 'Roofing', stage: 'Estimate Sent', pm: 'Rex Demo', estimator: 'Glenn Demo', createdAt: ago(1), updatedAt: ago(1) },
    { id: 'L4', name: 'Demo water emergency', client: 'Demo Flood', type: 'Water Damage', companyId: 'mitigation', stage: 'New Lead', createdAt: ago(1), updatedAt: ago(1) }]);
  cset('estimates', [{ id: 'E1', name: 'Demo Kitchen Remodel — base', status: 'Draft', pid: 'P1', lines: [{ id: 'H1', desc: 'Cabinets', cost: 6000, qty: 1, cat: 'Cabinets', type: 'material', mult: 'type' }], scope: { text: 'Kitchen remodel.' }, settings: {}, totalCost: 6000, totalCharge: 9000, createdAt: ago(3), savedAt: ago(3), updatedAt: ago(3) }]);
  cset('invs', [{ id: 'INV1', pid: 'P1', type: 'client', num: '2001', amt: 10000, status: 'paid', date: ago(10).slice(0, 10) }, { id: 'INV2', pid: 'P1', type: 'client', num: '2002', amt: 5000, status: 'sent', date: ago(2).slice(0, 10) }]);
  cset('cos', [{ id: 'CO1', pid: 'P1', num: 1, title: 'Add pantry', amt: 1200, status: 'pending', date: ago(1).slice(0, 10) }]);
  cset('punch', [{ id: 'PU1', pid: 'P1', text: 'Touch up paint', done: false }]); cset('timesheets', []);
}
const SKIP = /delete|remove|trash|archive|sign ?out|log ?out|send|e-?mail|\btext\b|\bpay\b|pay now|submit|approve|reject|void|merge|reset|cancel subscription|clean up|publish|make public|wipe|erase|disconnect|revoke|deactivate|fire|terminate|import|restore|mark (as )?(lost|won|paid)|close out|run now|check now|refund|charge|print|download|export|call\b|📞|☎/i;
const results = [];
async function closeOverlays(c){
  const p = c.page();
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press('Escape').catch(() => {}); await sleep(150);
    const left = await c.ev(() => {
      const big = [...document.querySelectorAll('body > *')].filter(e => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || !e.getClientRects().length) return false; if (!/fixed|absolute/.test(cs.position)) return false; const r = e.getBoundingClientRect(); return r.width * r.height > innerWidth * innerHeight * 0.45 && +cs.zIndex >= 50 && !/gc-ra-dock|gc-fh-tabs|gc-auth/.test(e.id || ''); });
      for (const e of big) { const x = [...e.querySelectorAll('button,[role=button],a')].find(b => /^(✕|×|x|close|cancel|done|back|‹ back|← back)$/i.test((b.textContent || b.getAttribute('aria-label') || '').trim()) || /close/i.test(b.getAttribute('aria-label') || '')); if (x) { x.click(); return 'closed:' + (e.id || e.className).toString().slice(0, 40); } }
      return big.map(e => (e.id || String(e.className)).slice(0, 50));
    }).catch(() => []);
    if (Array.isArray(left) && !left.length) return [];
    if (i === 2) return Array.isArray(left) ? left : [];
    await sleep(300);
  }
  return [];
}
async function crawlRole(key, co){
  const P = PEOPLE[key]; seed();
  const c = await computer(key + '-' + co, { build: BUILD, mobile: PHONE });
  c.acceptConfirm = false; c.prompts = [];
  const rec = { role: key, co, phone: PHONE, tabs: [], pageErrors: [], consoleErrors: [], failedRequests: [], popups: 0 };
  c.page().on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::ERR_|favicon|blockedbyclient|ERR_BLOCKED/i.test(t)) rec.consoleErrors.push({ tab: rec.cur || '', t: t.slice(0, 220) }); } });
  c.page().on('response', r => { const u = r.url(); if (/app\.local/.test(u) && r.status() >= 400 && ![401, 403].includes(r.status()) && !/favicon/.test(u)) rec.failedRequests.push({ tab: rec.cur || '', u: u.replace('https://app.local', '').slice(0, 120), s: r.status() }); });
  c.ctx.on('page', pg => { rec.popups++; later(() => pg.close().catch(() => {}), 500); });
  function later(f, ms){ setTimeout(f, ms); }
  await c.ctx.route(u => /\/\.netlify\/functions\/(bid-inbox|texts|portal-access)/.test(u.href || u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], settings: {}, notices: [], staff: [] }) }));
  await signIn(c, P.email, 12000); await sleep(5000);
  if (co !== 'construction') { await c.ev(cc => { try { window._gcCo.setFilter(cc); } catch (e) {} }, co); await sleep(1500); }
  const e0 = c.errs.length;
  if (PHONE) {
    /* GrayCo Field: every tile, home button and bottom tab */
    await c.ev(() => { try { window._gcField && window._gcField.open && window._gcField.open(); } catch (e) {} }); await sleep(1500);
    const tiles = await c.ev(() => [...document.querySelectorAll('#_gcJobPick button, #_gcJobPick [data-t], #gc-fh-tabs [data-t]')].filter(b => b.getClientRects().length).map((b, i) => ({ i, t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) })).filter(x => x.t));
    rec.fieldButtons = tiles.map(x => x.t);
    for (const t of tiles.slice(0, 40)) {
      if (SKIP.test(t.t)) continue;
      rec.cur = 'field:' + t.t; const before = c.errs.length;
      const r = await c.ev(i => { const b = [...document.querySelectorAll('#_gcJobPick button, #_gcJobPick [data-t], #gc-fh-tabs [data-t]')].filter(b => b.getClientRects().length)[i]; if (!b) return 'gone'; b.click(); return 'ok'; }, t.i).catch(e => 'err ' + e.message);
      await sleep(1100);
      const blank = await c.ev(() => (document.body.innerText || '').trim().length < 40);
      const left = await closeOverlays(c);
      await c.ev(() => { try { window._gcField && window._gcField.open && window._gcField.open(); } catch (e) {} }); await sleep(600);
      rec.tabs.push({ tab: 'field:' + t.t, click: r, errors: c.errs.slice(before), blank, overlayLeft: left });
    }
  } else {
    await c.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); }); await sleep(1200);
    const navLabels = await c.ev(() => [...document.querySelectorAll('aside nav button, aside button')].filter(b => b.offsetParent && !b.closest('#gc-ra-dock,#gc-fh-tabs')).map(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim()).filter(x => x && x !== '☰' && !/sign out/i.test(x)));
    rec.menu = navLabels;
    for (const lab of navLabels) {
      rec.cur = lab; const before = c.errs.length;
      const clicked = await c.ev(l => { const b = [...document.querySelectorAll('aside nav button, aside button')].filter(b => b.offsetParent && !b.closest('#gc-ra-dock,#gc-fh-tabs')).find(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim() === l); if (!b) return false; b.click(); return true; }, lab);
      await sleep(1800);
      const view = await c.ev(() => localStorage.getItem('grayco_view'));
      const info = await c.ev(() => { const m = document.querySelector('#root main') || document.querySelector('main') || document.body; const t = (m.innerText || '').trim(); return { len: t.length, head: t.slice(0, 80).replace(/\s+/g, ' ') }; });
      const tabRec = { tab: lab, view, clicked, blank: info.len < 60, head: info.head, buttons: [], errors: [], overlayLeft: [] };
      /* the tab's buttons (top area first), skipping the destructive ones */
      const btns = await c.ev(([skip, max]) => {
        const re = new RegExp(skip, 'i'); const m = document.querySelector('#root main') || document.querySelector('main') || document.body;
        const seen = {}; const out = [];
        [...m.querySelectorAll('button, [role=tab], a[href^="#"], a[data-v], [data-sys], [data-gcl-v]')].forEach(b => {
          if (!b.getClientRects().length || b.closest('aside, nav, #gc-ra-dock, #gc-fh-tabs, .gc-chat, #gc-ask')) return; const r = b.getBoundingClientRect(); if (r.top > innerHeight * 1.4 || r.width < 8) return;
          const t = (b.innerText || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 50); if (!t || seen[t] || re.test(t) || b.disabled) return; seen[t] = 1;
          b.setAttribute('data-qaa-b', String(out.length)); out.push(t); });
        return out.slice(0, max);
      }, [SKIP.source, MAXB]);
      for (let i = 0; i < btns.length; i++) {
        const be = c.errs.length;
        const snap = await c.ev(() => ({ v: localStorage.getItem('grayco_view'), n: document.body.innerHTML.length, k: document.querySelectorAll('body > *').length }));
        const r = await c.ev(i => { const b = document.querySelector('[data-qaa-b="' + i + '"]'); if (!b || !b.isConnected || !b.getClientRects().length) return 'gone'; b.click(); return 'ok'; }, i).catch(e => 'err ' + String(e.message).slice(0, 80));
        await sleep(650);
        const aft = await c.ev(() => ({ v: localStorage.getItem('grayco_view'), n: document.body.innerHTML.length, k: document.querySelectorAll('body > *').length }));
        const nothing = r === 'ok' && aft.v === snap.v && aft.n === snap.n && aft.k === snap.k;
        const left = await closeOverlays(c);
        const errs = c.errs.slice(be);
        tabRec.buttons.push({ b: btns[i], r, nothing, view: aft.v !== snap.v ? aft.v : undefined, errs: errs.length ? errs : undefined, overlayLeft: left.length ? left : undefined });
        if (errs.length && !fs.existsSync(path.join(OUT, 'err_' + key + '_' + co + '_' + lab.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) + '.png'))) await c.page().screenshot({ path: path.join(OUT, 'err_' + key + '_' + co + '_' + lab.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) + '.png') }).catch(() => {});
        if (left.length) tabRec.overlayLeft.push({ b: btns[i], left });
        /* a button that changed the screen: back to the tab */
        if (aft.v !== snap.v || r !== 'ok') { await c.ev(l => { const b = [...document.querySelectorAll('aside nav button, aside button')].filter(b => b.offsetParent).find(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim() === l); if (b) b.click(); }, lab); await sleep(1200);
          await c.ev(([skip, max]) => { const re = new RegExp(skip, 'i'); const m = document.querySelector('#root main') || document.querySelector('main') || document.body; const seen = {}; let n = 0;
            document.querySelectorAll('[data-qaa-b]').forEach(x => x.removeAttribute('data-qaa-b'));
            [...m.querySelectorAll('button, [role=tab], a[href^="#"], a[data-v], [data-sys], [data-gcl-v]')].forEach(b => { if (!b.getClientRects().length || b.closest('aside, nav, #gc-ra-dock, #gc-fh-tabs, .gc-chat, #gc-ask')) return; const r = b.getBoundingClientRect(); if (r.top > innerHeight * 1.4 || r.width < 8) return;
              const t = (b.innerText || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 50); if (!t || seen[t] || re.test(t) || b.disabled) return; seen[t] = 1; b.setAttribute('data-qaa-b', String(n++)); }); }, [SKIP.source, MAXB]); }
      }
      tabRec.errors = c.errs.slice(before);
      if (tabRec.blank) await c.page().screenshot({ path: path.join(OUT, 'blank_' + key + '_' + co + '_' + lab.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) + '.png') }).catch(() => {});
      rec.tabs.push(tabRec);
    }
  }
  rec.pageErrors = c.errs.slice(e0);
  await c.b.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, 'crawl_' + key + '_' + co + (PHONE ? '_phone' : '') + '.json'), JSON.stringify(rec, null, 1));
  const nb = rec.tabs.reduce((n, t) => n + (t.buttons ? t.buttons.length : 1), 0);
  const blanks = rec.tabs.filter(t => t.blank).map(t => t.tab), stuck = rec.tabs.filter(t => (t.overlayLeft || []).length).map(t => t.tab), nothing = rec.tabs.reduce((a, t) => a.concat((t.buttons || []).filter(b => b.nothing).map(b => t.tab + ' › ' + b.b)), []);
  console.log(`${key} × ${co}${PHONE ? ' (phone)' : ''}: ${rec.tabs.length} tabs, ${nb} clicks, page errors ${rec.pageErrors.length}, console errors ${rec.consoleErrors.length}, failed requests ${rec.failedRequests.length}, blank ${blanks.length}, overlays left ${stuck.length}, did-nothing ${nothing.length}`);
  if (rec.pageErrors.length) console.log('   PAGE ERRORS: ' + JSON.stringify([...new Set(rec.pageErrors)]).slice(0, 1200));
  if (blanks.length) console.log('   BLANK: ' + blanks.join(' | '));
  if (stuck.length) console.log('   OVERLAY LEFT: ' + JSON.stringify(rec.tabs.filter(t => (t.overlayLeft || []).length).map(t => [t.tab, t.overlayLeft])).slice(0, 800));
  if (rec.failedRequests.length) console.log('   FAILED REQ: ' + JSON.stringify(rec.failedRequests.slice(0, 12)));
  if (rec.consoleErrors.length) console.log('   CONSOLE: ' + JSON.stringify([...new Set(rec.consoleErrors.map(x => x.tab + ': ' + x.t))].slice(0, 12)).slice(0, 1500));
  results.push(rec);
}
for (const r of ROLES) for (const co of (PHONE ? ['construction'] : PEOPLE[r].cos)) {
  try { await crawlRole(r, co); } catch (e) { console.log('CRASH ' + r + ' × ' + co + ': ' + String(e && e.stack || e).slice(0, 400)); results.push({ role: r, co, crash: String(e && e.message) }); }
}
const bad = results.filter(r => r.crash || (r.pageErrors || []).length);
console.log('QAA_CRAWL ' + (results.length - bad.length) + '/' + results.length + ' role × company runs without page errors');
process.exit(bad.length ? 1 : 0);
