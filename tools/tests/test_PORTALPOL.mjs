// test_PORTALPOL.mjs <build-dir> — patch PORTALPOL (owner 11/19), the CRM side in a browser. Offline harness (GC_HARNESS, made-up
// data); the ⚡ Automations function is the REAL automations.js / _lib/golive.js over custportal_world.mjs's in-memory Supabase
// (nothing leaves the machine).
//   A. "Keep drying logs on mit only": on a phone (admin), the Field job page of a Construction job with water / fire words is NOT the
//      💧 Mitigation layout and has no 💧 Moisture / drying log or 🌀 Equipment tile (a Construction insurance claim job neither); a
//      job filed under GrayCo Mitigation still is (💧 + 🌀 on top).
//   B. "Keep cons PMs using claim board": a Construction PM with Construction picked has 💧 Mitigation in the menu and the board
//      lists his job's claim.
//   C. Admin → ⚡ Automations: "🚀 Go-live: Jan 1, 2027 — these switch on" with the list (lead_qualify_text …); an admin changes
//      the date and cancels / plans it again (the server's state follows); the office sees it read-only; the portal links for the
//      active jobs line with Undo.
//   D. the 🏠 Portal card: a paper switched on there is marked live (portalLive) — no "⏳ Waiting for approval" for it.
//   No page errors.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = path.resolve(process.argv[2] || '.');
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/portalpol/';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const W = await import(pathToFileURL(path.join(build, 'tools/tests/custportal_world.mjs')).href);
const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), PM = byId('u-pm'), OFFICE = byId('u-office');
const now = new Date().toISOString();

H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true },
  { id: 'u4', name: 'Office Demo', email: OFFICE, role: 'Office Manager', active: true }]);
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, address: id + ' Demo St, Memphis, TN 38135', status: 'active', pm: 'Demo PM', contract: 9000, createdAt: now, updatedAt: now }, o);
H.cset('projects', [
  J('PC1', { name: 'Demo Wade water', type: 'Water Damage', notes: 'mold and sewage, drying needed', services: ['Water damage', 'Fire / smoke'] }),
  J('PC2', { name: 'Demo Lane fire rebuild', type: 'Fire Damage', isInsurance: true, claimNo: 'F-200', insCarrier: 'Sample Carrier' }),
  J('PM1', { name: 'Demo Ross basement', type: 'Water Damage', companyId: 'mitigation', notes: 'Sewage backup, cat 3' }),
  J('PK1', { name: 'Demo Smith deck', type: 'Residential Reno' })]);
H.cset('gc_claims', [{ id: 'CLC', projectId: 'PC2', title: 'Demo Lane fire rebuild', phase: 'Work', scope: 'mitigation', jobType: 'fire', causeOfLoss: 'Fire', carrier: 'Sample Carrier', claimNumber: 'F-200', createdAt: now, updatedAt: now }]);
H.cset('projectDocs', [{ id: 'doc_card1', pid: 'PK1', name: 'Deck drawing.pdf', cat: 'Plans', ref: 'sb:crm-files/deck.pdf', type: 'application/pdf', uploaded: now.slice(0, 10), uploadedAt: now, portalShare: false }]);
H.cset('invoices', []); H.cset('schedule', []);

/* the ⚡ Automations function → the REAL handler over the world's fake Supabase */
W.put('gc_automations', { _log: [] }); W.put('gc_golive', { backfill: { state: 'done', n: 3, at: '2026-11-19T20:05:00.000Z', made: ['A', 'B', 'C'] }, log: [{ at: '2026-11-19T20:05:00.000Z', what: 'Portal links made for 3 active jobs that had none — nothing was sent.', by: 'CRM (scheduled)' }] });
W.TABLES.gc_portal = (W.TABLES.gc_portal || []).concat(['A', 'B', 'C'].map(p => ({ token: W.tok(), project_id: p, created_by: require(path.join(W.FNDIR, '_lib/golive.js')).BACKFILL_TAG, revoked: false })));
W.TABLES.gc_staff = (W.TABLES.gc_staff || []).concat([{ email: 'admin.sample@grayco-cs.com', name: 'Avery Admin', role: 'admin', active: true }, { email: 'pm.sample@grayco-cs.com', name: 'Dana Rivers', role: 'staff', active: true }]);
let ipn = 0;
async function wireAuto(c, tok){
  await c.ctx.route(u => /\/\.netlify\/functions\/automations(\?|$)/.test(String(u.href || u)), async route => {
    const rq = route.request(); const u = new URL(rq.url());
    const hd = Object.assign({}, rq.headers()); hd.authorization = tok; hd.origin = 'https://crm.grayco-cs.com'; hd['x-forwarded-for'] = '10.9.' + (++ipn % 250) + '.1';
    let out; try { out = await require(path.join(W.FNDIR, 'automations.js')).handler({ httpMethod: rq.method(), headers: hd, body: rq.postData() || '', queryStringParameters: Object.fromEntries(u.searchParams), path: u.pathname }); }
    catch (e) { out = { statusCode: 500, body: JSON.stringify({ error: String(e && e.message) }) }; }
    return route.fulfill({ status: out.statusCode || 200, contentType: 'application/json', body: out.body || '{}' });
  });
}
const IPHONE = () => { try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1' }); } catch (e) {} };
const OPEN = [];
const jobPage = async (c, pid) => {
  await c.ev(id => { document.querySelectorAll('._gcSheetOv,.gc-ra-sheet,.gcfp-sheet,#_gcJobDash,.gcbb-ov,#gc-mws-sheet,#gcpe').forEach(o => o.remove()); window._gcJobDashboard(id); }, pid);
  await H.waitFor(c, () => !!document.querySelector('#_gcJobDash .gcfp-grid[data-fm-kind]'), null, 12000); await sleep(1500);
  return c.ev(() => { const g = document.querySelector('#_gcJobDash .gcfp-grid'); if (!g) return null;
    const all = [...document.querySelectorAll('#_gcJobDash [data-fm], #_gcJobDash [data-fp], #_gcJobDash [data-fn]')].map(b => b.getAttribute('data-fm') || b.getAttribute('data-fp') || b.getAttribute('data-fn'));
    return { kind: g.getAttribute('data-fm-kind'), tiles: all, text: document.getElementById('_gcJobDash').innerText }; });
};
try {
  console.log('A. drying logs on Mitigation jobs only (Field job page, admin on an iPhone)');
  const P = await H.computer('AdminPhone', { build, mobile: true, init: IPHONE }); OPEN.push(P);
  ok(await H.signIn(P, ADMIN, 20000), 'admin signs in on the phone');
  await H.waitFor(P, () => !!window._gcFieldMore && !!window._gcJobDashboard && !!window._gcPmKind && (window._crm && window._crm.projects || []).length >= 4, null, 45000); await sleep(2500);
  const k = await P.ev(() => { const pr = id => window._crm.projects.find(p => p.id === id); return { c1: window._gcFieldMore.kind(pr('PC1')), c2: window._gcFieldMore.kind(pr('PC2')), m1: window._gcFieldMore.kind(pr('PM1')) }; });
  ok(k.c1 !== 'mit' && k.c2 !== 'mit' && k.m1 === 'mit', 'kind: a Construction water / fire job is not 💧 mit (its words no longer decide); the Mitigation job is', k);
  const c1 = await jobPage(P, 'PC1');
  ok(c1 && c1.kind !== 'mit' && !c1.tiles.includes('dry') && !c1.tiles.includes('equip') && !/Moisture \/ drying log|Equipment placed/.test(c1.text), 'Construction water job page: no 💧 drying log / 🌀 equipment tiles', c1 && { kind: c1.kind, tiles: c1.tiles });
  await P.page().screenshot({ path: SHOTS + 'A1_construction_water_job.png' });
  const c2 = await jobPage(P, 'PC2');
  ok(c2 && c2.kind === 'ins' && !c2.tiles.includes('dry') && !c2.tiles.includes('equip'), 'Construction insurance (fire) claim job page: 🛡 insurance layout, no drying log', c2 && { kind: c2.kind, tiles: c2.tiles });
  const m1 = await jobPage(P, 'PM1');
  ok(m1 && m1.kind === 'mit' && m1.tiles.includes('dry') && m1.tiles.includes('equip'), 'Mitigation job page: 💧 Mitigation layout with 💧 drying log + 🌀 equipment', m1 && { kind: m1.kind, tiles: m1.tiles });
  await P.page().screenshot({ path: SHOTS + 'A2_mitigation_job.png' });
  ok(!P.errs.length, 'no page errors (phone)', P.errs.slice(0, 5));
  await P.close();

  console.log('B. a Construction PM keeps the 💧 Mitigation claims board with Construction picked');
  const M = await H.computer('PMDesk', { build }); OPEN.push(M);
  ok(await H.signIn(M, PM, 20000), 'the PM signs in (desk)');
  await H.waitFor(M, () => !!window._gcCo && (window._crm && window._crm.projects || []).length >= 4 && !!(window._gcClaims && window._gcClaims.visible), null, 45000); await sleep(3000);
  await M.ev(() => { try { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); } catch (e) {} }); await sleep(1200);
  await M.ev(() => window._gcCo.setFilter('construction')); await sleep(3000);
  const navOf = () => M.ev(() => [...document.querySelectorAll('aside nav button, aside button')].filter(b => b.offsetParent && !b.closest('#gc-ra-dock,#gc-fh-tabs')).map(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim()));
  let n = await navOf();
  const vis = await M.ev(() => (window._gcClaims.visible() || []).map(c => c.id));
  ok(n.some(x => /Mitigation/.test(x)), 'Construction picked: the PM\'s menu has 💧 Mitigation', { n, vis });
  const btn = n.find(x => /Mitigation/.test(x));
  if (btn) {
    await M.ev(l => { const b = [...document.querySelectorAll('aside nav button, aside button')].find(b => b.offsetParent && b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim() === l); if (b) b.click(); }, btn); await sleep(3500);
    const t = await M.ev(() => ((document.querySelector('#root main') || document.querySelector('main') || {}).innerText || '').replace(/\s+/g, ' '));
    ok(/Demo Lane fire rebuild|F-200/.test(t), 'the 💧 Mitigation board opens and lists his Construction job\'s claim', t.slice(0, 400));
    await M.page().screenshot({ path: SHOTS + 'B1_pm_claims_board.png' });
  }
  ok(!M.errs.length, 'no page errors (PM)', M.errs.slice(0, 5));
  await M.close();

  console.log('C. Admin → ⚡ Automations: the go-live card');
  const A = await H.computer('AdminDesk', { build }); OPEN.push(A);
  await wireAuto(A, 'Bearer good-admin');
  ok(await H.signIn(A, ADMIN, 20000), 'admin signs in (desk)');
  await H.waitFor(A, () => !!window._gcAutoPanel && !!window._gcAutomations && !!window._gcAutomations.golive, null, 45000); await sleep(2000);
  await A.ev(() => window._gcAutoPanel.open());
  await H.waitFor(A, () => !!document.querySelector('#gcap-ov [data-gl="card"]'), null, 20000);
  const card = await A.ev(() => { const c = document.querySelector('#gcap-ov [data-gl="card"]'); return c ? { head: c.querySelector('[data-gl="head"]').innerText, date: c.getAttribute('data-gl-date'), st: c.getAttribute('data-gl-state'), keys: [...c.querySelectorAll('[data-gl-key]')].map(x => x.getAttribute('data-gl-key')), text: c.innerText, ctl: !!c.querySelector('[data-gl="date"]') && !!c.querySelector('[data-gl-act="cancel"]'), undo: !!c.querySelector('[data-gl-act="undo-backfill"]'), first: c.closest('.gcap').firstElementChild.hasAttribute('data-gcap-golive') } : null; });
  ok(card && /Go-live: Jan 1, 2027 — these switch on/.test(card.head) && card.date === '2027-01-01' && card.st === 'planned' && card.first, '"🚀 Go-live: Jan 1, 2027 — these switch on" at the top of ⚡ Automations', card && { head: card.head, date: card.date });
  ok(card && card.keys.includes('lead_qualify_text') && card.keys.includes('final_invoice_reminders') && card.keys.length === require(path.join(W.FNDIR, '_lib/golive.js')).SWITCH.length, 'the list of what switches on (Automatic texts to new leads, …)', card && card.keys);
  ok(card && /data-entry mode OFF/i.test(card.text) && /portal link for every open job/i.test(card.text) && /announcement/i.test(card.text) && /Jan 3/.test(card.text), 'what happens: portals, data-entry mode off, the switches, the staff announcement; replaces the Jan 3 plan', card && card.text.slice(0, 500));
  ok(card && card.ctl && card.undo && /3 portal links made for active jobs/.test(card.text), 'admin: change date / cancel; the active-job portals line (3 made, nothing sent) with Undo', card && card.text.slice(-400));
  await A.page().screenshot({ path: SHOTS + 'C1_golive_card.png' });
  A.acceptConfirm = true; A.page().on('dialog', d => d.accept().catch(() => {}));
  await A.ev(() => { document.querySelector('#gcap-ov [data-gl="date"]').value = '2027-01-04'; document.querySelector('#gcap-ov [data-gl-act="date"]').click(); });
  ok(!!(await H.waitFor(A, () => { const c = document.querySelector('#gcap-ov [data-gl="card"]'); return c && c.getAttribute('data-gl-date') === '2027-01-04'; }, null, 15000)) && W.get('gc_golive').plan.date === '2027-01-04', 'Change date → Jan 4 (the server\'s plan)', W.get('gc_golive').plan);
  await A.ev(() => document.querySelector('#gcap-ov [data-gl-act="cancel"]').click());
  ok(!!(await H.waitFor(A, () => { const c = document.querySelector('#gcap-ov [data-gl="card"]'); return c && c.getAttribute('data-gl-state') === 'cancelled' && !!c.querySelector('[data-gl-act="resume"]'); }, null, 15000)) && W.get('gc_golive').plan.cancelled === true, 'Cancel go-live → "cancelled — nothing switches on by itself", Plan it again');
  await A.ev(() => { document.querySelector('#gcap-ov [data-gl="date"]').value = '2027-01-01'; document.querySelector('#gcap-ov [data-gl-act="date"]').click(); });
  ok(!!(await H.waitFor(A, () => { const c = document.querySelector('#gcap-ov [data-gl="card"]'); return c && c.getAttribute('data-gl-state') === 'planned' && c.getAttribute('data-gl-date') === '2027-01-01'; }, null, 15000)) && W.get('gc_golive').plan.cancelled === false, 'back to Jan 1, planned');
  await A.ev(() => document.querySelector('#gcap-ov [data-gl-act="undo-backfill"]').click());
  ok(!!(await H.waitFor(A, () => { const c = document.querySelector('#gcap-ov [data-gl="backfill"]'); return c && c.getAttribute('data-gl-bf') === 'undone'; }, null, 15000)) && W.TABLES.gc_portal.filter(x => x.created_by === require(path.join(W.FNDIR, '_lib/golive.js')).BACKFILL_TAG).every(x => x.revoked), 'Undo → those 3 links are off (and the card says so)');
  ok(W.RESEND.length === 0, 'nothing was e-mailed');

  console.log('D. the 🏠 Portal card: switching a paper on makes it live');
  const d0 = await A.ev(() => { try { document.getElementById('gcap-ov') && document.getElementById('gcap-ov').remove(); const p = window._crm.projects.find(x => x.id === 'PK1'); return !!(window._gcPortal && window._gcPortal.docs) ; } catch (e) { return String(e); } });
  if (d0 === true) {
    await A.ev(() => window._gcPortal.docs('PK1')); await sleep(1500);
    const cb = await A.ev(() => { const c = [...document.querySelectorAll('input[type="checkbox"][data-id="doc_card1"]')][0]; if (!c) return false; c.click(); return true; });
    if (cb) {
      const live = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { const d = (H.cget('projectDocs') || []).find(x => x.id === 'doc_card1'); if (d && d.portalShare === true && d.portalLive === true && d.portalLiveAt) return d; await sleep(400); } return null; })();
      ok(!!live, 'the portal card\'s switch-on marks the paper live (portalLive) — the server shows it at once', (H.cget('projectDocs') || []).find(x => x.id === 'doc_card1'));
      ok(await A.ev(() => window._gcPortalEd.staffLive((window._crm.projectDocs || window._gcProjectDocs || []).find(x => x.id === 'doc_card1') || { id: 'doc_card1', portalShare: true, portalLive: true }, null)), 'and the CRM counts it live (no "⏳ Waiting for approval")');
    } else ok(false, 'the portal card lists the paper with its switch');
  } else ok(false, 'the 🏠 Portal card\'s file list is there', d0);
  ok(!A.errs.length, 'no page errors (admin desk)', A.errs.slice(0, 5));
  await A.close();

  console.log('E. the office sees the go-live card read-only');
  const O = await H.computer('OfficeDesk', { build }); OPEN.push(O);
  await wireAuto(O, 'Bearer good-pm');
  ok(await H.signIn(O, OFFICE, 20000), 'the office signs in');
  await H.waitFor(O, () => !!window._gcAutoPanel && !!window._gcAutomations, null, 45000); await sleep(1500);
  await O.ev(() => window._gcAutoPanel.open());
  await H.waitFor(O, () => !!document.querySelector('#gcap-ov [data-gl="card"]'), null, 20000);
  const oc = await O.ev(() => { const c = document.querySelector('#gcap-ov [data-gl="card"]'); return c ? { head: c.querySelector('[data-gl="head"]').innerText, ctl: !!c.querySelector('[data-gl-act]'), t: c.innerText } : null; });
  ok(oc && /Go-live: Jan 1, 2027/.test(oc.head) && !oc.ctl && /Only an admin/.test(oc.t), 'office: the card and the list, no date / cancel / undo controls', oc);
  ok(!O.errs.length, 'no page errors (office)', O.errs.slice(0, 5));
  await O.close();
} catch (e) { fail++; console.log('  ✗ FAIL exception ' + (e && e.stack || e)); }
finally { for (const c of OPEN) { try { await c.close(); } catch (e) {} } }
console.log(`PORTALPOL ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
