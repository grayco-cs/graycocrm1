// test_QAB_crawl.mjs <build-dir> [combo,combo…] — QA B (overnight release test, patch QAB): click-crawl of GrayCo MITIGATION and
// GrayCo ENVIRONMENTAL per role × company, desktop and phone. For each combo: sign in, (desk app → its tiles, then ☰ full CRM),
// pick the company, open every left-menu tab, click every visible non-destructive button on it (≤ CRAWL_MAX per tab), close what it
// opens, and record page errors, console errors, blank views, overlays left open, buttons that do nothing and COMPANY LEAKS
// (made-up "Conzz" = Construction, "Mitzz" = Mitigation, "Envzz" = Environmental data showing under another company).
// Phone combos: GrayCo Field tiles, the bottom bar, the header logo, job pickers.
// Out: QAB_OUT (default scratchpad qab/crawl) <combo>.json + summary lines; screenshots of anything broken → QAB_SHOTS.
import fs from 'fs';
const H = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, resetCloud } = H;
const BUILD = process.argv[2];
const SP = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const OUT = process.env.QAB_OUT || SP + '/qab/crawl', SHOTS = process.env.QAB_SHOTS || SP + '/qab_shots';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const MAXB = +(process.env.CRAWL_MAX || 14);
const DESTRUCT = /delete|remove|trash|archive|sign ?out|log ?out|\bsend\b|e-?mail|\btext\b|\bpay\b|submit|approve|reject|\bvoid\b|merge|reset|cancel subscription|deactivat|disconnect|wipe|erase|clear all|restore|import|upload|📤|🗑|✉|print|download|📥|export|backup|install|call\b|📞|sms|refund|activate|publish|post\b|award/i;
const now = new Date(), iso = d => new Date(Date.now() - d * 864e5).toISOString(), day = d => iso(d).slice(0, 10);
const T = day(0);

/* ═══ made-up people and data, one set for every combo ═══ */
const ACC = {
  'mitmgr.demo@grayco-cs.com': 'Mitigation Manager', 'mitpm.demo@grayco-cs.com': 'Mitigation PM', 'mittech.demo@grayco-cs.com': 'Mitigation Technician',
  'envpm.demo@grayco-cs.com': 'Environmental PM', 'envsup.demo@grayco-cs.com': 'Environmental Supervisor', 'envtech.demo@grayco-cs.com': 'Environmental Technician',
  'abate.demo@grayco-cs.com': 'Abatement Technician', 'ins.demo@grayco-cs.com': 'Insurance PM', 'mkt.demo@grayco-cs.com': 'Marketing Manager', 'offmgr.demo@grayco-cs.com': 'Office Manager' };
let n = 50; for (const e of Object.keys(ACC)) if (!H.ACCOUNTS[e]) H.ACCOUNTS[e] = { pw: 'Correct-Horse-' + (n++), id: 'u-' + e.split('.')[0], role: 'staff' };
const NAMES = { 'mitmgr.demo@grayco-cs.com': 'Mia Mitzzmgr', 'mitpm.demo@grayco-cs.com': 'Max Mitzzpm', 'mittech.demo@grayco-cs.com': 'Molly Mitzztech', 'envpm.demo@grayco-cs.com': 'Ed Envzzpm',
  'envsup.demo@grayco-cs.com': 'Sue Envzzsup', 'envtech.demo@grayco-cs.com': 'Eve Envzztech', 'abate.demo@grayco-cs.com': 'Abe Envzzabate', 'ins.demo@grayco-cs.com': 'Ina Insdemo', 'mkt.demo@grayco-cs.com': 'Kim Mktdemo', 'offmgr.demo@grayco-cs.com': 'Olive Offdemo' };
const COS = { 'Mitigation Manager': ['mitigation'], 'Mitigation PM': ['mitigation'], 'Mitigation Technician': ['mitigation'], 'Environmental PM': ['environmental'], 'Environmental Supervisor': ['environmental'],
  'Environmental Technician': ['environmental'], 'Abatement Technician': ['environmental'], 'Insurance PM': ['construction', 'mitigation'] };
export function seed(){
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u-o', name: 'Office Desk', email: 'office@grayco-cs.com', role: 'Office', active: true },
    { id: 'u-c', name: 'Carl Conzzpm', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, companies: ['construction'] },
    ...Object.keys(ACC).map((e, i) => Object.assign({ id: 'ux' + i, name: NAMES[e], email: e, role: ACC[e], active: true }, COS[ACC[e]] ? { companies: COS[ACC[e]] } : {}))]);
  cset('projects', [
    { id: 'C1', name: 'Conzz Smith deck', client: 'Conzz Smith', address: '1 Conzz St', status: 'active', type: 'Residential Reno', contract: 77777, pm: 'Carl Conzzpm', companyId: 'construction', createdAt: iso(9), updatedAt: iso(1) },
    { id: 'C2', name: 'Conzz Fire rebuild', client: 'Conzz Burns', address: '2 Conzz St', status: 'active', type: 'Fire Damage', contract: 55555, pm: 'Carl Conzzpm', createdAt: iso(9), updatedAt: iso(1) },
    { id: 'M1', name: 'Mitzz Ross basement', client: 'Mitzz Ross', address: '1 Mitzz Rd', status: 'active', type: 'Water Damage', companyId: 'mitigation', pm: 'Max Mitzzpm', mitTech: 'Molly Mitzztech', contract: 8000, createdAt: iso(3), updatedAt: iso(0.2) },
    { id: 'M2', name: 'Mitzz Cox kitchen leak', client: 'Mitzz Cox', address: '2 Mitzz Rd', status: 'active', type: 'Water Damage', companyId: 'mitigation', pm: 'Mia Mitzzmgr', createdAt: iso(2), updatedAt: iso(0.3) },
    { id: 'E1', name: 'Envzz Kline trim', client: 'Envzz Kline', address: '1 Envzz Ave', status: 'active', type: 'Environmental', companyId: 'environmental', notes: 'House built 1962 — lead paint on the window trim', pm: 'Ed Envzzpm', envTech: 'Eve Envzztech', createdAt: iso(4), updatedAt: iso(0.4) }]);
  cset('leads', [{ id: 'LC1', name: 'Conzz roof lead', client: 'Conzz Roofer', type: 'Roofing', stage: 'New Lead', phone: '9015550101', createdAt: iso(1), updatedAt: iso(1) },
    { id: 'LM1', name: 'Mitzz water emergency', client: 'Mitzz Flood', type: 'Water Damage', companyId: 'mitigation', stage: 'New Lead', emergency: true, phone: '9015550102', createdAt: iso(0.05), updatedAt: iso(0.05) },
    { id: 'LE1', name: 'Envzz asbestos lead', client: 'Envzz Tile', type: 'Environmental', companyId: 'environmental', stage: 'New Lead', phone: '9015550103', createdAt: iso(0.5), updatedAt: iso(0.5) }]);
  cset('customers', [{ id: 'CU1', name: 'Conzz Smith', phone: '9015550111', companyId: 'construction' }, { id: 'CU2', name: 'Mitzz Ross', phone: '9015550112', companyId: 'mitigation' }, { id: 'CU3', name: 'Envzz Kline', phone: '9015550113', companyId: 'environmental' }]);
  cset('invs', [{ id: 'IC1', type: 'client', pid: 'C1', client: 'Conzz Smith', invNum: '7001', amt: 7777, date: day(5), dueDate: day(-10), status: 'sent' },
    { id: 'IM1', type: 'client', pid: 'M1', client: 'Mitzz Ross', invNum: '8001', amt: 2222, date: day(2), dueDate: day(-12), status: 'sent' },
    { id: 'IE1', type: 'client', pid: 'E1', client: 'Envzz Kline', invNum: '9001', amt: 3333, date: day(2), dueDate: day(-12), status: 'sent' }]);
  cset('estimates', [{ id: 'EC1', name: 'Conzz Smith deck — estimate', status: 'Draft', pid: 'C1', lines: [], totalCost: 100, totalCharge: 150, createdAt: iso(3), updatedAt: iso(3) },
    { id: 'EM1', name: 'Mitzz Ross basement — estimate', status: 'Draft', pid: 'M1', lines: [], totalCost: 100, totalCharge: 150, createdAt: iso(3), updatedAt: iso(3) }]);
  cset('expenses', [{ id: 'XC1', pid: 'C1', amt: 1234.56, date: T, vendor: 'Conzz Lumber', status: 'approved' }, { id: 'XM1', pid: 'M1', amt: 222.22, date: T, vendor: 'Mitzz Rental', status: 'approved' }]);
  cset('schedule', [{ id: 'SC1', pid: 'C1', projectId: 'C1', date: T, start: T, end: T, title: 'Conzz deck framing' }, { id: 'SM1', pid: 'M1', projectId: 'M1', date: T, start: T, end: T, title: 'Mitzz drying check' },
    { id: 'SE1', pid: 'E1', projectId: 'E1', date: T, start: T, end: T, title: 'Envzz clearance test' }]);
  cset('gc_office_tasks', [{ id: 'TC1', text: 'Conzz call the inspector', done: false, createdAt: iso(1), assignee: 'Wesley Johnson', pid: 'C1' },
    { id: 'TM1', text: 'Mitzz call the adjuster', done: false, createdAt: iso(1), assignee: 'Wesley Johnson', pid: 'M1' }]);
  const ap = (id, kind, pid, nm) => ({ id, kind, title: kind + ' — ' + nm, jobId: pid, jobName: nm, pm: 'Wesley Johnson', pmEmail: 'wjohnson@grayco-cs.com', channel: 'email', to: 'demo@example.test', subject: 'Demo', html: '<p>Hi</p>', text: 'Hi', attachments: [], steps: ['pm'], step: 'pm', approvals: [], status: 'waiting', createdAt: iso(1), updatedAt: iso(1), meta: {} });
  cset('gc_approval_queue', JSON.stringify([ap('APC1', 'thank_you', 'C1', 'Conzz Smith deck'), ap('APC2', 'portal_link', 'C2', 'Conzz Fire rebuild'), ap('APM1', 'thank_you', 'M1', 'Mitzz Ross basement')]));
  cset('gc_job_messages', JSON.stringify([{ id: 'MSC1', pid: 'C1', at: iso(0.1), text: 'Conzz deck message', authorName: 'Carl Conzzpm', authorId: 'u-c' }, { id: 'MSM1', pid: 'M1', at: iso(0.1), text: 'Mitzz basement message', authorName: 'Max Mitzzpm', authorId: 'ux1' }]));
  cset('timesheets', [{ id: 'TS1', employee: 'Carl Conzzpm', date: T, hours: 8, pid: 'C1' }, { id: 'TS2', employee: 'Molly Mitzztech', date: T, hours: 6, pid: 'M1' }]);
  cset('gc_claims', [{ id: 'CL1', projectId: 'M1', title: 'Mitzz Ross basement', phase: 'Work', scope: 'mitigation', jobType: 'water', carrier: 'Demo Mutual', claimNumber: 'D-100', createdAt: iso(2), updatedAt: iso(0.2),
    adjusterMeetingAt: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16),
    equipment: [{ id: 'e1', kind: 'airmover', room: 'Basement', qty: 4, placedAt: iso(2) }, { id: 'e2', kind: 'dehu', room: 'Basement', qty: 1, placedAt: iso(2) }],
    moisture: [{ id: 'm1', room: 'Basement', material: 'Drywall', point: 'N1', reading: 30, goal: 12, date: day(2) }] },
    /* a Construction insurance job (fire rebuild) with its own claim — must never show under Mitigation */
    { id: 'CL2', projectId: 'C2', title: 'Conzz Fire rebuild', phase: 'Work', scope: 'rebuild', jobType: 'fire', carrier: 'Conzz Mutual', claimNumber: 'C-200', createdAt: iso(5), updatedAt: iso(0.5),
      equipment: [{ id: 'e3', kind: 'airmover', room: 'Kitchen', qty: 2, placedAt: iso(4) }], moisture: [{ id: 'm2', room: 'Kitchen', material: 'Subfloor', point: 'K1', reading: 25, goal: 12, date: day(1) }] }]);
}
/* who is what */
const COMBOS = {
  admin_mit: { email: 'wjohnson@grayco-cs.com', co: 'mitigation' }, admin_env: { email: 'wjohnson@grayco-cs.com', co: 'environmental' },
  office_mit: { email: 'office@grayco-cs.com', co: 'mitigation' }, office_env: { email: 'office@grayco-cs.com', co: 'environmental' },
  offmgr_mit: { email: 'offmgr.demo@grayco-cs.com', co: 'mitigation' }, offmgr_env: { email: 'offmgr.demo@grayco-cs.com', co: 'environmental' },
  mitmgr: { email: 'mitmgr.demo@grayco-cs.com' }, mitpm: { email: 'mitpm.demo@grayco-cs.com' }, mittech: { email: 'mittech.demo@grayco-cs.com' },
  envpm: { email: 'envpm.demo@grayco-cs.com' }, envsup: { email: 'envsup.demo@grayco-cs.com' }, envtech: { email: 'envtech.demo@grayco-cs.com' }, abate: { email: 'abate.demo@grayco-cs.com' },
  ins_mit: { email: 'ins.demo@grayco-cs.com', co: 'mitigation' }, mkt_mit: { email: 'mkt.demo@grayco-cs.com', co: 'mitigation' }, mkt_env: { email: 'mkt.demo@grayco-cs.com', co: 'environmental' },
  /* phones */
  p_mitmgr: { email: 'mitmgr.demo@grayco-cs.com', mobile: true }, p_mitpm: { email: 'mitpm.demo@grayco-cs.com', mobile: true }, p_mittech: { email: 'mittech.demo@grayco-cs.com', mobile: true },
  p_envpm: { email: 'envpm.demo@grayco-cs.com', mobile: true }, p_envtech: { email: 'envtech.demo@grayco-cs.com', mobile: true }, p_abate: { email: 'abate.demo@grayco-cs.com', mobile: true },
  p_ins: { email: 'ins.demo@grayco-cs.com', mobile: true }, p_admin_mit: { email: 'wjohnson@grayco-cs.com', mobile: true, co: 'mitigation' }
};
const LEAK = { mitigation: /Conzz|Envzz/, environmental: /Conzz|Mitzz/ };
const coOfEmail = e => { const r = ACC[e]; if (!r) return null; if (/Mitigation/.test(r)) return 'mitigation'; if (/Environmental|Abatement/.test(r)) return 'environmental'; return null; };

async function crawlDesktop(key, cfg){
  const A = await computer(cfg.email, { build: BUILD, mobile: !!cfg.mobile });
  if (cfg.co) await A.ctx.addInitScript(co => { try { if (!sessionStorage.getItem('qab_co')) { localStorage.setItem('gc_co_filter', co); sessionStorage.setItem('qab_co', '1'); } } catch (e) {} }, cfg.co);   /* they picked this company last time */
  const rec = { combo: key, email: cfg.email, role: ACC[cfg.email] || (cfg.email.startsWith('wjohnson') ? 'Admin' : 'Office'), co: cfg.co || coOfEmail(cfg.email), mobile: !!cfg.mobile, tabs: [], problems: [], leaks: [], desk: null, field: null, errs: [], cons: [], fns: {} };
  A.page().on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/net::ERR|Failed to load resource|blockedbyclient|favicon/i.test(t)) rec.cons.push(t.slice(0, 220)); } });
  A.page().on('request', r => { const u = r.url(); const m = u.match(/\/\.netlify\/functions\/([^?#/]+)/); if (m) rec.fns[m[1]] = (rec.fns[m[1]] || 0) + 1; });
  const errAt = () => A.errs.length;
  const shot = async name => { const f = SHOTS + '/' + key + '_' + name.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) + '.png'; await A.page().screenshot({ path: f }).catch(() => {}); return f.split('/').pop(); };
  await signIn(A, cfg.email, 14000); await sleep(6000);
  const leakRe = () => { const co = rec.co; return co ? LEAK[co] : null; };
  /* the desk app (computer) */
  const desk = await A.ev(() => { const d = document.getElementById('gc-ra-desk'); if (!d || !d.offsetParent && getComputedStyle(d).display === 'none') return null; return { tiles: [...d.querySelectorAll('[data-ra-a]')].filter(b => b.offsetParent).map(b => b.getAttribute('data-ra-a') + ':' + b.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)), txt: d.innerText.slice(0, 600) }; });
  rec.desk = desk;
  if (desk && !cfg.mobile) {
    const lr = leakRe(); if (lr && lr.test(desk.txt)) rec.leaks.push({ where: 'desk home', txt: (desk.txt.match(new RegExp('.{0,60}(' + lr.source + ').{0,60}')) || [''])[0], shot: await shot('desk_leak') });
    for (const t of desk.tiles) {
      const a = t.split(':')[0]; if (a === 'full' || /signout|logout/.test(a)) continue;
      const e0 = errAt();
      await A.ev(a => { const b = document.querySelector('#gc-ra-desk [data-ra-a="' + a + '"]'); b && b.click(); }, a); await sleep(900);
      const st = await A.ev(() => ({ v: localStorage.getItem('grayco_view'), sheet: !!document.querySelector('.gc-ra-sheet,#gc-mws-sheet,[role=dialog]'), desk: !!document.getElementById('gc-ra-desk') }));
      if (A.errs.length > e0) rec.problems.push({ where: 'desk tile ' + t, err: A.errs.slice(e0), shot: await shot('desk_' + a) });
      await closeAll(A);
      if (!st.desk || !(await A.ev(() => !!document.getElementById('gc-ra-desk')))) { await A.ev(() => { try { window._gcRA && window._gcRA.home && window._gcRA.home(); } catch (e) {} }); await sleep(600); }
    }
    await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); b && b.click(); }); await sleep(1200);
  }
  if (cfg.mobile) { await fieldCrawl(A, rec, shot); return finish(A, rec); }
  /* pick the company: through the visible switch when there is one */
  const sw = await A.ev(() => !!(document.querySelector('[data-gc-co-brand]') || document.getElementById('gc-co-sw')));
  rec.switcher = sw;
  if (cfg.co) {
    if (sw) { await A.ev(() => (document.querySelector('[data-gc-co-brand]') || document.querySelector('#gc-co-sw [data-co-menu]') || document.getElementById('gc-co-sw')).click()); await sleep(700);
      const okp = await A.ev(c => { const b = [...document.querySelectorAll('#gc-co-pop [data-co-f]')].find(x => x.getAttribute('data-co-f') === c); if (b) b.click(); return !!b; }, cfg.co); await sleep(1800);
      if (!okp) { rec.problems.push({ where: 'company switch', err: 'no ' + cfg.co + ' in the switch' }); await A.ev(c => window._gcCo.setFilter(c), cfg.co); await sleep(1800); }
    } else { rec.problems.push({ where: 'company switch', err: 'no visible switch for this role (set by code)' }); await A.ev(c => window._gcCo.setFilter(c), cfg.co); await sleep(1800); }
  } else if (sw) {
    rec.note = 'switch visible for a role that should be locked to its company';
  }
  rec.filter = await A.ev(() => window._gcCo && window._gcCo.filter());
  rec.brand = await A.ev(() => { const b = document.querySelector('[data-gc-co-brand]') || document.getElementById('gc-co-sw'); const i = b && b.querySelector('img'); return { txt: b ? b.innerText.replace(/\s+/g, ' ').trim().slice(0, 60) : '', img: i ? i.getAttribute('src') : '' }; });
  const nav = await A.ev(() => [...document.querySelectorAll('aside nav button, aside button, nav button')].filter(b => b.offsetParent && !b.closest('#gc-ra-dock,#gc-fh-tabs')).map(b => b.innerText.replace(/\s+/g, ' ').trim()).filter(x => x && x !== '☰' && !/^Sign Out$/i.test(x)));
  rec.nav = nav;
  await A.page().screenshot({ path: SHOTS + '/' + key + '_menu.png' }).catch(() => {});
  for (const label of nav) {
    if (/sign out|log out/i.test(label)) continue;
    await A.page().mouse.move(700 + Math.random() * 50, 400).catch(() => {});   /* a person at the computer (the idle pacing slows the timers) */
    const e0 = errAt(), c0 = rec.cons.length;
    const clicked = await A.ev(l => { const b = [...document.querySelectorAll('aside nav button, aside button, nav button')].find(x => x.offsetParent && x.innerText.replace(/\s+/g, ' ').trim() === l); if (b) { b.click(); return true; } return false; }, label);
    await sleep(1600);
    const st = await A.ev(() => { const m = document.querySelector('#root main') || document.querySelector('main') || document.body; const v = localStorage.getItem('grayco_view');
      const vis = el => !!(el.offsetParent || el.getClientRects().length);
      const ov = [...document.querySelectorAll('body > div')].filter(d => { const cs = getComputedStyle(d); return vis(d) && (cs.position === 'fixed') && +cs.zIndex >= 50 && d.offsetWidth > 300 && d.offsetHeight > 300 && !/gc-ra-dock|gc-fh-tabs|gc-co-|toast/.test(d.id || ''); }).map(d => d.id || d.className.slice(0, 30));
      return { v, len: (m.innerText || '').trim().length, txt: (document.body.innerText || ''), ov }; });
    const tab = { label, view: st.v, len: st.len, clicked, errs: A.errs.slice(e0), cons: rec.cons.slice(c0), btns: [] };
    if (st.len < 40) { tab.blank = true; rec.problems.push({ where: 'tab ' + label, err: 'blank view (' + st.len + ' chars)', shot: await shot('blank_' + label) }); }
    const lr = leakRe();
    if (lr && lr.test(st.txt)) { const m = st.txt.split('\n').filter(x => lr.test(x)).slice(0, 6); rec.leaks.push({ where: 'tab ' + label + ' (' + st.v + ')', lines: m, shot: await shot('leak_' + label) }); }
    if (tab.errs.length) rec.problems.push({ where: 'tab ' + label, err: tab.errs, shot: await shot('err_' + label) });
    /* the buttons on it */
    const cand = await A.ev(re => { const R = new RegExp(re, 'i'); const m = document.querySelector('#root main') || document.body; const seen = {};
      const all = [...document.querySelectorAll('#root main button, #root main [role=button], #root main a[href="#"], #gc-mws-mount button, #gc-leads-hub button')];
      return all.filter(b => b.offsetParent && !b.disabled && !b.closest('aside,nav,#gc-ra-dock')).map(b => (b.innerText || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim()).filter(t => t && t.length < 60 && !R.test(t) && !seen[t] && (seen[t] = 1)); }, DESTRUCT.source);
    for (const bt of cand.slice(0, MAXB)) {
      const b0 = errAt(), cc0 = rec.cons.length;
      const r0 = await A.ev(t => {
        const all = [...document.querySelectorAll('#root main button, #root main [role=button], #root main a[href="#"], #gc-mws-mount button, #gc-leads-hub button')].filter(b => b.offsetParent && !b.disabled && !b.closest('aside,nav'));
        const b = all.find(x => (x.innerText || x.getAttribute('aria-label') || x.title || '').replace(/\s+/g, ' ').trim() === t); if (!b) return { gone: true };
        try { window.__qabMO && window.__qabMO.disconnect(); } catch (e) {}
        window.__qabM = 0; const mo = new MutationObserver(l => { window.__qabM += l.length; }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); window.__qabMO = mo;
        window.__qabV0 = localStorage.getItem('grayco_view') + '|' + location.hash;
        try { b.click(); } catch (e) { return { err: String(e) }; }
        return {};
      }, bt).catch(e => ({ err: String(e).slice(0, 120) }));
      await sleep(700);
      const r = r0.gone || r0.err ? r0 : await A.ev(() => { try { window.__qabMO.disconnect(); } catch (e) {} const v = localStorage.getItem('grayco_view') + '|' + location.hash; return { muts: window.__qabM, v: localStorage.getItem('grayco_view'), moved: v !== window.__qabV0 }; }).catch(e => ({ err: String(e).slice(0, 120) }));
      const br = { t: bt, muts: r.muts, moved: r.moved };
      if (r.err) br.err = r.err;
      if (A.errs.length > b0) { br.pageerr = A.errs.slice(b0); rec.problems.push({ where: 'tab ' + label + ' → ' + bt, err: br.pageerr, shot: await shot('err_' + label + '_' + bt) }); }
      if (rec.cons.length > cc0) br.cons = rec.cons.slice(cc0);
      if (!r.gone && !r.err && r.muts === 0 && !r.moved) br.nothing = true;
      /* a leak in what it opened */
      const lr2 = leakRe();
      if (lr2) { const tx = await A.ev(() => document.body.innerText).catch(() => ''); if (lr2.test(tx)) { const lines = tx.split('\n').filter(x => lr2.test(x)).slice(0, 4); if (!rec.leaks.some(l => l.where.startsWith('tab ' + label))) rec.leaks.push({ where: 'tab ' + label + ' → ' + bt, lines, shot: await shot('leak_' + label + '_' + bt) }); } }
      const left = await closeAll(A);
      if (left) { br.overlayLeft = left; rec.problems.push({ where: 'tab ' + label + ' → ' + bt, err: 'overlay left open after Escape / ✕: ' + left, shot: await shot('ov_' + label + '_' + bt) }); await A.ev(() => document.querySelectorAll('.gc-ra-sheet,#gc-mws-sheet').forEach(x => x.remove())); }
      tab.btns.push(br);
      /* back to the tab */
      const vNow = await A.ev(() => localStorage.getItem('grayco_view')).catch(() => null);
      if (vNow !== st.v || (await A.ev(() => !!document.getElementById('gc-ra-desk')).catch(() => false))) {
        await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); b && b.click(); }).catch(() => {});
        await A.ev(v => window._setView(v), st.v).catch(() => {}); await sleep(900);
      }
    }
    rec.tabs.push(tab);
  }
  return finish(A, rec);
}
/* Escape, then ✕ / Close buttons of what is open; returns what is still open */
async function closeAll(A){
  for (let i = 0; i < 3; i++) {
    const open = await A.ev(() => { const vis = el => !!(el.offsetParent || el.getClientRects().length);
      return [...document.querySelectorAll('body > div, .gc-ra-sheet, #gc-mws-sheet, [role=dialog]')].filter(d => { if (!vis(d)) return false; const cs = getComputedStyle(d); return (cs.position === 'fixed') && (+cs.zIndex >= 100) && d.offsetWidth > 280 && d.offsetHeight > 200 && !/gc-ra-dock|gc-fh-tabs|gc-ra-desk|gc-co-sw|toast|gc-adm-warns|gcnav/.test((d.id || '') + ' ' + String(d.className || '')); }).map(d => d.id || String(d.className || '').slice(0, 40) || d.tagName); }).catch(() => []);
    if (!open.length) return '';
    await A.page().keyboard.press('Escape').catch(() => {}); await sleep(250);
    await A.ev(() => { const vis = el => !!(el.offsetParent || el.getClientRects().length);
      const xs = [...document.querySelectorAll('button, [role=button], span, div')].filter(b => vis(b) && b.children.length === 0 && /^(✕|×|✖)$|^(✕|×|✖)?\s*(close|done|cancel|not now|later|skip|ok|got it|‹ back|back)$/i.test((b.innerText || '').trim()));
      const top = xs.filter(b => { const cs = getComputedStyle(b.closest('[style*="fixed"], .gc-ra-sheet, #gc-mws-sheet, [role=dialog]') || b); return true; });
      if (top.length) top[top.length - 1].click(); }).catch(() => {});
    await sleep(350);
    if (i === 2) return open.join(',');
  }
  return '';
}
async function fieldCrawl(A, rec, shot){
  await sleep(4000);
  const f = await A.ev(() => ({ app: window._gcRA && window._gcRA.state && window._gcRA.state(), q: [...document.querySelectorAll('#_gcJobPick .gc-ra-q [data-ra-a]')].map(b => b.getAttribute('data-ra-a') + ':' + b.innerText.replace(/\s+/g, ' ').trim()),
    bar: [...document.querySelectorAll('#gc-fh-tabs [data-t]')].map(b => b.getAttribute('data-t') + ':' + b.innerText.replace(/\s+/g, ' ').trim()),
    logo: [...document.querySelectorAll('img.fh-logo, #_gcJobPick img, #gc-fh-head img, header img')].filter(i => i.offsetParent).map(i => i.getAttribute('src')).slice(0, 3),
    txt: document.body.innerText.slice(0, 1500), pick: !!document.getElementById('_gcJobPick') }));
  rec.field = f;
  await A.page().screenshot({ path: SHOTS + '/' + rec.combo + '_field_home.png' }).catch(() => {});
  const lr = rec.co ? LEAK[rec.co] : null;
  if (lr && lr.test(f.txt)) rec.leaks.push({ where: 'field home', lines: f.txt.split('\n').filter(x => lr.test(x)).slice(0, 5), shot: await shot('field_leak') });
  /* imgs that fail to load */
  rec.brokenImgs = await A.ev(() => [...document.images].filter(i => i.offsetParent && i.complete && !i.naturalWidth).map(i => i.getAttribute('src')).slice(0, 8));
  for (const t of f.q) {
    const a = t.split(':')[0]; const e0 = A.errs.length;
    await A.ev(a => { const b = document.querySelector('#_gcJobPick .gc-ra-q [data-ra-a="' + a + '"]'); b && b.click(); }, a); await sleep(1300);
    const st = await A.ev(() => { const s = document.querySelector('.gc-ra-sheet'); return { sheet: s ? s.innerText.slice(0, 500) : '', jobs: s ? [...s.querySelectorAll('[data-pj]')].map(b => b.innerText.replace(/\s+/g, ' ').trim().slice(0, 50)) : [], ov: !!document.getElementById('gcbb-ov'), mws: !!document.getElementById('gc-mws-sheet'), v: localStorage.getItem('grayco_view') }; });
    const tr = { tile: t, picker: st.jobs, opened: st };
    if (lr && st.jobs.some(j => lr.test(j))) rec.leaks.push({ where: 'field tile ' + t + ' job picker', lines: st.jobs, shot: await shot('picker_leak_' + a) });
    /* choose the first job in the picker */
    if (st.jobs.length) { await A.ev(() => { const b = document.querySelector('.gc-ra-sheet [data-pj]'); b && b.click(); }); await sleep(1500);
      tr.after = await A.ev(() => ({ ov: !!document.getElementById('gcbb-ov'), mws: document.getElementById('gc-mws-sheet') ? document.getElementById('gc-mws-sheet').innerText.slice(0, 200) : '', v: localStorage.getItem('grayco_view'), sheet: (document.querySelector('.gc-ra-sheet') || {}).innerText?.slice(0, 200) || '' })); }
    if (A.errs.length > e0) { tr.errs = A.errs.slice(e0); rec.problems.push({ where: 'field tile ' + t, err: tr.errs, shot: await shot('field_err_' + a) }); }
    await A.page().screenshot({ path: SHOTS + '/' + rec.combo + '_tile_' + a + '.png' }).catch(() => {});
    (rec.tiles = rec.tiles || []).push(tr);
    await A.ev(() => { const o = document.getElementById('gcbb-ov'); o && o.remove(); document.querySelectorAll('.gc-ra-sheet,#gc-mws-sheet').forEach(x => x.remove()); });
    await A.page().keyboard.press('Escape').catch(() => {}); await sleep(300);
    await A.ev(() => { try { window._gcRA && window._gcRA.home && window._gcRA.home(); } catch (e) {} const h = document.querySelector('#gc-fh-tabs [data-t="home"]'); h && h.click(); }); await sleep(900);
  }
  for (const t of f.bar) {
    const k = t.split(':')[0]; const e0 = A.errs.length;
    await A.ev(k => { const b = document.querySelector('#gc-fh-tabs [data-t="' + k + '"]'); b && b.click(); }, k); await sleep(1500);
    const st = await A.ev(() => ({ v: localStorage.getItem('grayco_view'), txt: document.body.innerText.slice(0, 2500), len: document.body.innerText.length }));
    const br = { bar: t, v: st.v, len: st.len };
    if (lr && lr.test(st.txt)) rec.leaks.push({ where: 'field bar ' + t, lines: st.txt.split('\n').filter(x => lr.test(x)).slice(0, 5), shot: await shot('bar_leak_' + k) });
    if (A.errs.length > e0) { br.errs = A.errs.slice(e0); rec.problems.push({ where: 'field bar ' + t, err: br.errs, shot: await shot('bar_err_' + k) }); }
    await A.page().screenshot({ path: SHOTS + '/' + rec.combo + '_bar_' + k + '.png' }).catch(() => {});
    (rec.bars = rec.bars || []).push(br);
    await closeAll(A);
  }
}
async function finish(A, rec){
  rec.errs = A.errs.slice(); rec.dialogs = A.dialogs.slice();
  await A.b.close().catch(() => {});
  fs.writeFileSync(OUT + '/' + rec.combo + '.json', JSON.stringify(rec, null, 1));
  const nothing = [].concat(...rec.tabs.map(t => t.btns.filter(b => b.nothing).map(b => t.label + ' → ' + b.t)));
  const nb = rec.tabs.reduce((a, t) => a + t.btns.length, 0);
  console.log((rec.problems.length || rec.leaks.length || rec.errs.length ? 'FAIL ' : 'PASS ') + rec.combo + ' (' + rec.role + (rec.co ? ' / ' + rec.co : '') + (rec.mobile ? ' / phone' : '') + '): ' + rec.tabs.length + ' tabs, ' + nb + ' buttons, ' + (rec.tiles || []).length + ' tiles, ' + (rec.bars || []).length + ' bar; problems ' + rec.problems.length + ', leaks ' + rec.leaks.length + ', page errors ' + rec.errs.length + ', console errors ' + rec.cons.length + ', did-nothing ' + nothing.length);
  rec.leaks.forEach(l => console.log('   LEAK ' + l.where + ' :: ' + JSON.stringify(l.lines || l.txt).slice(0, 300) + (l.shot ? '  [' + l.shot + ']' : '')));
  rec.problems.forEach(p => console.log('   PROB ' + p.where + ' :: ' + JSON.stringify(p.err).slice(0, 300) + (p.shot ? '  [' + p.shot + ']' : '')));
  if (nothing.length) console.log('   NOTHING ' + nothing.slice(0, 25).join(' | '));
  return rec;
}
const want = (process.argv[3] || 'admin_mit').split(',');
for (const k of want) {
  if (!COMBOS[k]) { console.log('unknown combo ' + k); continue; }
  seed();
  try { await crawlDesktop(k, COMBOS[k]); } catch (e) { console.log('FAIL ' + k + ' crashed: ' + String(e && e.stack || e).slice(0, 400)); }
}
process.exit(0);
