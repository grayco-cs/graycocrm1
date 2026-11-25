// test_SUPERPORTAL.mjs <build-dir> — patch SUPERPORTAL (owner 11/25): "Make sure the superintendent can post updates to the customer or
// sub portal, have on his left tabs the portals." + "superintendent is responsible for all of the paperwork".
//   · a Superintendent (superintendent on job A, PM on job B, nothing on job C): his left menu has 🔨 Sub Portal and 👤 Customer portals;
//     Customer portals lists A and B, not C; 📣 Post to customer on A lands where a PM's post lands (job.portalPosts); 🏠 Make portal;
//     the 📒 Site Book job page has the portal buttons on A, none on C; on the phone A / B cards have 👤 / 🔧, C's job page has none;
//     🔧 Sub portal → 💬 Post to the sub reaches the sub thread (portal-access s-send); phone width: no sideways scroll; no page errors.
//   · paperwork: ＋ Add a required paper on A (not C); the paperwork To-Do goes to the superintendent (PM named as pmCc), the PM when
//     no superintendent is set; the "no daily log" reminder of job A goes to the superintendent, not the PM.
//   · a Crew Lead gets no portal buttons and no Customer portals tab; a PM still works as before (his jobs, the same post).
// Usage: node test_SUPERPORTAL.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs) — made-up data, nothing leaves the machine.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_SUPERPORTAL.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const sleep = H.sleep;
H.ACCOUNTS['super@grayco-cs.com'] = { id: 'u-super', name: 'Demo Super', role: 'staff' };
H.ACCOUNTS['crew@grayco-cs.com'] = { id: 'u-crew', name: 'Demo Crew', role: 'staff' };
const TOKA = 'A'.repeat(43), PURL = 'https://app.local/portal.html#t=' + TOKA, NEWURL = 'https://app.local/portal.html#t=' + 'B'.repeat(43);
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const D0 = new Date(); const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u9', name: 'Demo Super', email: 'super@grayco-cs.com', role: 'Superintendent', active: true },
  { id: 'u8', name: 'Demo Crew', email: 'crew@grayco-cs.com', role: 'Crew Lead', active: true }]);
H.cset('projects', [
  { id: 'PA', po: 'PO-7001', name: 'Job A Kitchen', client: 'Sample Homeowner A', address: '1 Demo St', pm: 'Sample PM', superintendent: 'Demo Super', status: 'Active', startDate: ymd(new Date(Date.now() - 20 * 864e5)), portalUrl: PURL, updatedAt: ago(1),
    subs: [{ id: 'r1', subId: 'S1', name: 'Ace Drywall', trade: 'Drywall', status: 'Awarded' }] },
  { id: 'PB', po: 'PO-7002', name: 'Job B Roof', client: 'Sample Homeowner B', address: '2 Demo St', pm: 'Demo Super', status: 'Active', updatedAt: ago(2) },
  { id: 'PC', po: 'PO-7003', name: 'Job C Deck', client: 'Sample Homeowner C', address: '3 Demo St', pm: 'Sample PM', status: 'Active', startDate: ymd(new Date(Date.now() - 20 * 864e5)), portalUrl: 'https://app.local/portal.html#t=' + 'C'.repeat(43), updatedAt: ago(3) }]);
H.cset('subs', [{ id: 'S1', name: 'Ace Drywall', company: 'Ace Drywall', trade: 'Drywall', isSub: true, phone: '9015552000' }]);
H.cset('schedule', []); H.cset('punch', []); H.cset('leads', []);
const CAP = { sub: [], create: [] };
H.onFn('portal', ({ body }) => { if (body && body.action === 'create') { CAP.create.push(body); return { ok: true, url: NEWURL }; } return { ok: true }; });
async function mocks(c){
  await c.ctx.route(u => /\/\.netlify\/functions\/portal-access/.test(u.href || u), async r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (b.action === 's-send') { CAP.sub.push(b); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'm' + CAP.sub.length }) }); }
    if (b.action === 's-thread') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}
const OPEN = [];
async function desk(email, who, vp){
  const c = await H.computer(who, { build, viewport: vp }); OPEN.push(c); await mocks(c);
  await H.signIn(c, email, 9000);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 3 && !!window._gcSuperPortal && !!window._gcFP, null, 40000);
  await sleep(2500);
  return c;
}
const MENU = c => c.ev(() => [...document.querySelectorAll('aside nav button, nav button')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
const cpJobs = c => c.ev(() => [...document.querySelectorAll('#gc-cpx-mount [data-spx-pid]')].map(e => e.getAttribute('data-spx-pid')));
const posts = pid => { const p = (H.cget('projects') || []).find(x => x && x.id === pid); return (p && p.portalPosts) || []; };
async function waitCloud(fn, ms){ const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { if (fn()) return true; await sleep(500); } return false; }
const noSideways = c => c.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1);
async function postVia(c, pid, text){
  await c.ev(p => { const b = document.querySelector('#gc-cpx-mount [data-spx-a="post"][data-pid="' + p + '"]'); if (b) b.click(); }, pid); await sleep(700);
  const opened = await c.ev(() => !!document.getElementById('gcq-post-text'));
  if (opened) { await c.page().locator('#gcq-post-text').fill(text); await c.ev(() => document.getElementById('gcq-post-go').click()); }
  return opened;
}
try {
  // ══════════ SUPERINTENDENT (desk) ══════════
  const S = await desk('super@grayco-cs.com', 'super');
  const m = await MENU(S); console.log('    super menu: ' + JSON.stringify(m));
  ok(m.some(t => /Sub Portal/.test(t)) && m.some(t => /Customer portals/.test(t)), 'Superintendent: the left menu has 🔨 Sub Portal and 👤 Customer portals', m);
  ok(await S.ev(() => window._gcUx && window._gcUx.Superintendent.indexOf('subportal') >= 0 && window._gcUx.Superintendent.indexOf('custportals') >= 0), 'the role table (saved or built-in) has the new tabs merged in');
  await S.ev(() => window._setView('custportals')); await H.waitFor(S, () => document.querySelectorAll('#gc-cpx-mount [data-spx-pid]').length > 0, null, 15000);
  const sj = await cpJobs(S);
  ok(sj.includes('PA') && sj.includes('PB') && !sj.includes('PC'), '👤 Customer portals lists job A (superintendent) and job B (PM), not job C', sj);
  const ui = await S.ev(() => { const r = document.querySelector('#gc-cpx-mount'); const bg = getComputedStyle(r).backgroundColor; const a = r.querySelector('[data-spx-pid="PA"]'), b = r.querySelector('[data-spx-pid="PB"]');
    return { bg, aSee: a && (a.querySelector('[data-spx-a="see"]') || {}).href, aPost: !!(a && a.querySelector('[data-spx-a="post"]')), aSub: !!(a && a.querySelector('[data-spx-a="sub"]')), bMake: !!(b && b.querySelector('[data-spx-a="make"]')) }; });
  ok(ui.aPost && ui.aSub && ui.aSee === PURL + '&p=1' && ui.bMake, 'job A: 📣 Post · 👁 See what they see (staff preview) · 🔧 Sub portal; job B (no portal): 🏠 Make portal', ui);
  ok(/rgb\((2[3-5]\d), (2[3-5]\d), (2[3-5]\d)\)/.test(ui.bg), 'light page background (no navy)', ui.bg);
  const e0 = S.errs.length;
  ok(await postVia(S, 'PA', 'SP test: super update on A'), '📣 Post to customer opens the Portal card\'s own post sheet (patch Q)');
  ok(await waitCloud(() => posts('PA').some(x => x.text === 'SP test: super update on A')), 'the super\'s post lands in job A\'s portal posts (job.portalPosts), like a PM\'s', posts('PA'));
  await S.ev(() => { const b = document.querySelector('#gc-cpx-mount [data-spx-a="make"][data-pid="PB"]'); if (b) b.click(); });
  ok(await waitCloud(() => CAP.create.some(x => x.projectId === 'PB'), 15000), '🏠 Make portal on job B asks for the link (patch Q\'s own "by hand" link)', CAP.create);
  ok(!!(await H.waitFor(S, () => { const a = document.querySelector('#gc-cpx-mount [data-spx-pid="PB"] [data-spx-a="see"]'); return a && a.href; }, null, 10000)), 'job B then offers 👁 See what they see');
  const refused = await S.ev(() => ({ c: window._gcFP.perms('PC'), run: window._gcFP.run('fp-cust', window._crm.projects.find(p => p.id === 'PC')), sb: window._gcSuperPortal.sbBtns(window._crm.projects.find(p => p.id === 'PC')) }));
  ok(!refused.c.cust && !refused.c.sub && !refused.run && !refused.sb, 'job C: no customer / sub portal powers at all', refused);
  // 📒 Site Book job page
  await S.ev(() => window._setView('sitebook')); await sleep(1500);
  await S.ev(() => { try { window._gcRP.site().open('PA'); } catch (e) {} }); await sleep(1500);
  const sbA = await S.ev(() => [...document.querySelectorAll('[data-spx-sb]')].map(b => b.getAttribute('data-spx-sb') + ':' + b.getAttribute('data-pid')));
  ok(sbA.includes('cust:PA') && sbA.includes('sub:PA'), '📒 Site Book job A: 👤 Customer portal · 🔧 Sub portal in the header', sbA);
  await S.ev(() => document.querySelector('[data-spx-sb="sub"]').click()); await sleep(900);
  ok(await S.ev(() => !!document.querySelector('.gcfp-sheet, .gcsub-sheet, #gcsub-msg')), 'the Site Book 🔧 Sub portal opens the sub portal sheet');
  await S.ev(() => document.querySelectorAll('.gcfp-sheet,.gcsub-sheet,#gcpe,#gcq-post').forEach(o => o.remove()));
  // paperwork
  const pw = await S.ev(() => ({ canA: window._gcJobReq.canAdd(window._crm.projects.find(p => p.id === 'PA')), canC: window._gcJobReq.canAdd(window._crm.projects.find(p => p.id === 'PC')),
    toA: window._gcPaperTo(window._crm.projects.find(p => p.id === 'PA')), ccA: window._gcPaperCc(window._crm.projects.find(p => p.id === 'PA')),
    toC: window._gcPaperTo(window._crm.projects.find(p => p.id === 'PC')), ccC: window._gcPaperCc(window._crm.projects.find(p => p.id === 'PC')),
    ghost: window._gcPaperTo({ id: 'X', pm: 'Sample PM', superintendent: 'Nobody On Team' }) }));
  ok(pw.canA && !pw.canC, 'paperwork: ＋ Add a required paper on his job A, not on job C', pw);
  ok(pw.toA === 'Demo Super' && pw.ccA === 'Sample PM' && pw.toC === 'Sample PM' && pw.ccC === '' && pw.ghost === 'Sample PM', 'paperwork To-Dos: the job\'s superintendent (PM named as pmCc); the PM when no superintendent is set or he is not on the team', pw);
  ok(S.errs.length === e0 && !S.errs.length, 'Superintendent desk: no page errors', S.errs.slice(0, 3));
  // phone width: the Customer portals tab
  await S.page().setViewportSize({ width: 390, height: 844 }); await S.ev(() => window._setView('custportals')); await sleep(1500);
  ok(await noSideways(S) && (await cpJobs(S)).length >= 2, 'phone width (390 px): 👤 Customer portals fits, no sideways scroll');
  await S.close(); OPEN.length = 0;

  // ══════════ SUPERINTENDENT (phone, GrayCo Field) ══════════
  const SP = await H.computer('superphone', { build, mobile: true }); OPEN.push(SP); await mocks(SP);
  await H.signIn(SP, 'super@grayco-cs.com', 9000);
  await H.waitFor(SP, () => (window._crm && window._crm.projects || []).length >= 3 && !!window._gcFP, null, 40000); await sleep(2500);
  const cards = await SP.ev(() => { try { window._gcField && window._gcField.open && window._gcField.open(); } catch (e) {} return [...document.querySelectorAll('#_gcJobPick .fh-job')].map(j => ({ pid: j.getAttribute('data-job'), b: [...j.querySelectorAll('.fp-row [data-fa]')].map(b => b.getAttribute('data-fa')) })); });
  const cA = cards.find(x => x.pid === 'PA'), cB = cards.find(x => x.pid === 'PB'), cC = cards.find(x => x.pid === 'PC');
  ok(!!cA && cA.b.includes('fp-cust') && cA.b.includes('fp-sub') && !!cB && cB.b.includes('fp-cust') && cB.b.includes('fp-sub') && (!cC || (!cC.b.includes('fp-cust') && !cC.b.includes('fp-sub'))), 'Field job cards: 👤 Customer portal + 🔧 Sub portal on A and B, none on C', cards);
  await SP.ev(() => { document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._gcJobDashboard('PA'); }); await sleep(1200);
  const tA = await SP.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-t')].map(b => b.getAttribute('data-fp')));
  ok(tA.includes('cust') && tA.includes('sub'), 'job A field page: 👤 Customer portal and 🔧 Sub portal tiles', tA);
  await SP.ev(() => document.querySelector('#_gcJobDash .gcfp-t[data-fp="sub"]').click()); await sleep(1000);
  await SP.ev(() => { const b = document.querySelector('.gcfp-sheet [data-k="S1"]'); if (b) b.click(); }); await sleep(800);
  await SP.ev(() => { const b = document.querySelector('.gcfp-sheet [data-s="post"]'); if (b) b.click(); }); await sleep(1000);
  const hasMsg = await SP.ev(() => !!document.getElementById('gcsub-msg'));
  if (hasMsg) { await SP.page().locator('#gcsub-msg').fill('SP test: super to Ace'); await SP.ev(() => document.getElementById('gcsub-send').click()); await sleep(1500); }
  ok(hasMsg && CAP.sub.some(x => x.action === 's-send' && x.projectId === 'PA' && x.party === 's:S1' && x.text === 'SP test: super to Ace'), '🔧 Sub portal → 💬 Post to Ace Drywall reaches the sub thread (s-send, party s:S1)', CAP.sub);
  await SP.ev(() => { document.querySelectorAll('.gcfp-sheet,.gcsub-sheet,._gcSheetOv').forEach(o => o.remove()); document.querySelectorAll('#_gcJobDash').forEach(o => o.remove()); window._gcJobDashboard('PC'); }); await sleep(1200);
  const tC = await SP.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-t')].map(b => b.getAttribute('data-fp')));
  ok(!tC.includes('cust') && !tC.includes('sub'), 'job C field page: no portal tiles', tC);
  ok(await noSideways(SP), 'phone: no sideways scroll');
  ok(!SP.errs.length, 'Superintendent phone: no page errors', SP.errs.slice(0, 3));
  await SP.close(); OPEN.length = 0;

  // ══════════ the office board: the "no daily log" reminder ══════════
  const O = await desk('wjohnson@grayco-cs.com', 'owner');
  const bd = await O.ev(() => window._gcOfficeTab.pmBoard().map(r => ({ n: r.name, nolog: r.g.nolog.map(x => x.id) })));
  const sup = bd.find(r => r.n === 'Demo Super') || { nolog: [] }, pm = bd.find(r => r.n === 'Sample PM') || { nolog: [] };
  ok(sup.nolog.includes('PA') && !pm.nolog.includes('PA') && pm.nolog.includes('PC'), '📝 No daily log for 3+ days: job A\'s reminder is the superintendent\'s (not the PM\'s); job C\'s stays the PM\'s', bd);
  const oj = await O.ev(() => window._gcSuperPortal.jobs().map(p => p.id));
  ok(['PA', 'PB', 'PC'].every(x => oj.includes(x)), 'owner: 👤 Customer portals lists every open job', oj);
  ok(!O.errs.length, 'owner: no page errors', O.errs.slice(0, 3));
  await O.close(); OPEN.length = 0;

  // ══════════ CREW LEAD ══════════
  const C = await desk('crew@grayco-cs.com', 'crew');
  const cm = await MENU(C), cp = await C.ev(() => ({ tab: window._gcSuperPortal.canTab(), a: window._gcFP.perms('PA'), c: window._gcFP.perms('PC'), jobs: window._gcSuperPortal.jobs().length }));
  ok(!cm.some(t => /Customer portals/.test(t)) && !cp.tab && !cp.a.cust && !cp.a.sub && !cp.c.cust && !cp.c.sub && cp.jobs === 0, 'a Crew Lead: no 👤 Customer portals tab and no portal buttons', { cm, cp });
  ok(!C.errs.length, 'crew: no page errors', C.errs.slice(0, 3));
  await C.close(); OPEN.length = 0;

  // ══════════ PM (as before) ══════════
  const P = await desk('sbiffle@grayco-cs.com', 'pm');
  const pmm = await MENU(P);
  const pp = await P.ev(() => ({ a: window._gcFP.perms('PA'), b: window._gcFP.perms('PB'), c: window._gcFP.perms('PC') }));
  ok(pp.a.cust && pp.a.sub && pp.c.cust && pp.c.sub && !pp.b.cust && !pp.b.sub, 'PM: portal buttons on his jobs (A, C), none on the super\'s own job B', pp);
  ok(pmm.some(t => /Customer portals/.test(t)), 'PM: 👤 Customer portals in his menu', pmm);
  await P.ev(() => window._setView('custportals')); await H.waitFor(P, () => document.querySelectorAll('#gc-cpx-mount [data-spx-pid]').length > 0, null, 15000);
  const pj = await cpJobs(P);
  ok(pj.includes('PA') && pj.includes('PC') && !pj.includes('PB'), 'PM: Customer portals lists his jobs A and C', pj);
  ok(await postVia(P, 'PC', 'SP test: PM update on C'), 'PM: 📣 Post opens the same post sheet');
  ok(await waitCloud(() => posts('PC').some(x => x.text === 'SP test: PM update on C')), 'PM: the post lands in job C\'s portal posts — the same place as the super\'s', posts('PC'));
  const sameShape = (() => { const a = posts('PA').find(x => /super update/.test(x.text)), c = posts('PC').find(x => /PM update/.test(x.text)); return !!a && !!c && Object.keys(a).sort().join() === Object.keys(c).sort().join(); })();
  ok(sameShape, 'the super\'s post and the PM\'s post are the same record (no other path)');
  ok(!P.errs.length, 'PM: no page errors', P.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of OPEN) await x.close().catch(() => {});
console.log(`SUPERPORTAL ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
