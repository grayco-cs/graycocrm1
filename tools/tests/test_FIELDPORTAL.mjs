// test_FIELDPORTAL.mjs <build-dir> — GrayCo Field on a phone (390x844, touch): 👤 Customer portal / 🔧 Sub portal / 📸 Photos /
// 💬 Message on every job, the job page as an app (tiles on top, in the owner's order), 📸 Photos in the bottom bar, the
// message picker, 🧠 in the 💎 menu, job-list order, ⚙ Settings — as the owner, a PM and the office. Offline harness, made-up data.
// Usage: node test_FIELDPORTAL.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDPORTAL.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const sleep = H.sleep;
const D0 = new Date(); const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = ymd(D0), past = ymd(new Date(Date.now() - 6 * 864e5)), soon = ymd(new Date(Date.now() + 5 * 864e5));
const TOK = 'A'.repeat(43), PURL = 'https://app.local/portal.html#t=' + TOK;
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '9015550111' },
  { id: 'u5', name: 'Office Desk', email: 'office@grayco-cs.com', role: 'Office Manager', active: true }]);
H.cset('projects', [
  { id: 'P1', po: 'PO-1001', autoPO: 'PO-1001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', clientPhone: '9015551234', address: '100 Demo St, Bartlett TN', pm: 'Sample PM', status: 'Active', contract: 25000, contractSigned: true, pct: 40, portalUrl: PURL, updatedAt: ago(1),
    subs: [{ id: 'r1', subId: 'S1', name: 'Ace Drywall', trade: 'Drywall', status: 'Awarded' }, { id: 'r2', subId: 'S2', name: 'Best Paint', trade: 'Paint', status: 'Awarded' }],
    fieldInspections: [{ id: 'I1', type: 'Framing', date: past, result: 'Passed', by: 'Sample PM' }, { id: 'I2', type: 'Final', date: soon, result: '', by: 'Sample PM' }] },
  { id: 'P2', po: 'PO-1002', name: 'Other PM Roof', client: 'Second Homeowner', address: '200 Demo Ave, Cordova TN', pm: 'Other PM', status: 'Active', contract: 14000, contractSigned: true, pct: 10, updatedAt: ago(5) },
  { id: 'P3', po: 'PO-1003', name: 'Done Bath', client: 'Third Homeowner', address: '300 Demo Rd', pm: 'Sample PM', status: 'Completed', contract: 9000, contractSigned: true, updatedAt: ago(0.1) },
  { id: 'P4', po: 'PO-1004', name: 'Approved Deck', client: 'Fourth Homeowner', address: '400 Demo Ln', pm: 'Sample PM', status: 'Approved', contract: 7000, contractSigned: true, updatedAt: ago(0.5) },
  { id: 'P5', po: 'PO-1005', name: 'Older Active Siding', client: 'Fifth Homeowner', address: '500 Demo Ct', pm: 'Sample PM', status: 'In Progress', contract: 5000, contractSigned: true, updatedAt: ago(9) }]);
H.cset('subs', [{ id: 'S1', name: 'Ace Drywall', company: 'Ace Drywall', trade: 'Drywall', isSub: true, phone: '9015552000' }, { id: 'S2', name: 'Best Paint', company: 'Best Paint', trade: 'Paint', isSub: true }]);
H.cset('schedule', [
  { id: 'SC1', pid: 'P1', projectId: 'P1', date: today, title: 'Drywall hang', sub: 'Ace Drywall', start: today, end: today },
  { id: 'SC2', pid: 'P2', projectId: 'P2', date: today, title: 'Tear-off', start: today, end: today },
  { id: 'SC3', pid: 'P1', projectId: 'P1', date: soon, title: 'Paint', sub: 'Best Paint' }]);
H.cset('projectDocs', [{ id: 'SPD_1', pid: 'P1', name: 'ace-progress.jpg', type: 'image/jpeg', ref: 'sb:crm-files/' + 'a'.repeat(64) + '.jpg', cat: 'photo', subId: 'S1', subName: 'Ace Drywall', source: 'sub-portal', uploaded: today }]);
H.cset('invs', [{ id: 'INV1', pid: 'P1', type: 'client', num: '1001', amt: 10000, status: 'paid' }, { id: 'INV2', pid: 'P1', type: 'client', num: '1002', amt: 5000, status: 'sent' }]);
H.cset('cos', [{ id: 'CO1', pid: 'P1', desc: 'Extra outlet', amt: 400, status: 'approved' }]);
H.cset('punch', []); H.cset('timesheets', []);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const store = new Map();
const CAP = { sub: [], alerts: [] };
async function mocks(c){
  await c.ctx.route(u => /\/storage\/v1\//.test(u.href || u), async r => {
    const u = new URL(r.request().url()); const m = r.request().method(); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: h });
    const path = u.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/|public\/|sign\/)?/, '');
    if (m === 'POST' || m === 'PUT') { store.set(path, r.request().postDataBuffer() || Buffer.alloc(0)); return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ Key: path }) }); }
    const b = store.get(path); return b ? r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'image/jpeg' }, h), body: b }) : r.fulfill({ status: 404, headers: h, body: '{}' });
  });
  await c.ctx.route(u => /\/\.netlify\/functions\/portal-access/.test(u.href || u), async r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (b.action === 's-send') { CAP.sub.push(b); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'm' + CAP.sub.length }) }); }
    if (b.action === 's-thread') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, messages: CAP.sub.filter(x => x.party === b.party).map((x, i) => ({ id: 'm' + i, mine: true, by: 'GrayCo', at: new Date().toISOString(), text: x.text, files: [] })) }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await c.ctx.route(u => /\/\.netlify\/functions\/texts\?alerts=1/.test(u.href || u), async r => {
    if (r.request().method() === 'POST') { CAP.alerts.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, settings: CAP.alerts.slice(-1)[0].settings }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, settings: { people: { 'nthomas@grayco-cs.com': { on: true, emerg: true } } }, staff: [{ email: 'wjohnson@grayco-cs.com', name: 'Demo Owner', phone: '9015550100' }, { email: 'office@grayco-cs.com', name: 'Office Desk', phone: '9015550122' }] }) });
  });
}
const fh = c => H.waitFor(c, () => { const j = document.querySelector('#_gcJobPick.gc-fh'); return !!j && getComputedStyle(j).display !== 'none' && document.querySelectorAll('#_gcJobPick .fh-job').length > 0; }, null, 40000);
async function home(c){ await c.page().evaluate(() => { try { window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close(); } catch (e) {} document.querySelectorAll('.gc-fh-sheet,.gcfp-sheet,#_gcJobMsgOv,._gcSheetOv,.gcsub-sheet,#gcb-ov').forEach(o => o.remove()); try { window._gcField.open(); } catch (e) {} }); await sleep(700); }
const tap = async (c, sel) => { const l = c.page().locator(sel).first(); await l.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {}); await l.tap({ timeout: 6000 }); await sleep(700); };
const noSideways = c => c.page().evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1);
const SHOTS = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/';
const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const ORDER = ['Update Progress', 'Job Info', 'Customer portal', 'Sub portal', 'Post Update', 'Message', 'Add Photo/File', 'Daily Log', 'Financials, Invoices & COs', 'Schedule & Inspections'];
try {
  // ══════════ OWNER ══════════
  const O = await H.computer('OWN', { build, mobile: true }); W.push(O); await mocks(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await fh(O)), 'owner: the phone opens in GrayCo Field with job cards');
  const card = await O.ev(() => [...document.querySelectorAll('#_gcJobPick .fh-job')].map(j => ({ pid: j.getAttribute('data-job'), b: [...j.querySelectorAll('.fp-row [data-fa]')].map(b => b.getAttribute('data-fa')), h: Math.min(...[...j.querySelectorAll('.fp-row [data-fa]')].map(b => b.getBoundingClientRect().height)) })));
  ok(card.length >= 2 && card.every(x => x.b.join() === 'fp-cust,fp-sub,fp-photos,fp-msg'), 'owner: every job card has 👤 Customer portal · 🔧 Sub portal · 📸 Photos · 💬 Message', card);
  ok(card.every(x => x.h >= 44), 'owner: the four buttons are at least 44 px tall', card.map(x => x.h));
  ok(await noSideways(O), 'owner: no sideways scroll on the Field home');
  await O.page().screenshot({ path: SHOTS + 'fieldportal_home.png' });
  // 👤 Customer portal on P1: post + the staff preview, opened in the tap
  await tap(O, '#_gcJobPick .fh-job[data-job="P1"] [data-fa="fp-cust"]');
  const cs = await O.ev(() => { const s = document.querySelector('.gcfp-sheet'); const a = s && s.querySelector('a[data-c="see"]'); return { open: !!s, post: !!(s && s.querySelector('[data-c="post"]')), href: a && a.getAttribute('href'), target: a && a.target }; });
  ok(cs.open && cs.post && cs.href === PURL + '&p=1' && cs.target === '_blank', '👤 Customer portal (P1): 📣 Post + 👁 See what the customer sees → the job\'s link + &p=1 (staff preview)', cs);
  const np = O.ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await tap(O, '.gcfp-sheet a[data-c="see"]');
  const pg = await np; await sleep(1500);
  ok(!!pg && pg.url().includes('/portal.html#t=' + TOK + '&p=1'), 'the preview opens in a new tab from the tap itself (iPhone-safe)', pg && pg.url());
  if (pg) await pg.close().catch(() => {});
  // 📣 Post to the customer portal → patch Q's post sheet → project.portalPosts in the cloud
  await home(O); await tap(O, '#_gcJobPick .fh-job[data-job="P1"] [data-fa="fp-cust"]'); await tap(O, '.gcfp-sheet [data-c="post"]');
  ok(await O.ev(() => !!document.getElementById('gcq-post-text')), '📣 Post opens the Portal card\'s own post sheet');
  await O.page().locator('#gcq-post-text').fill('FP test: cabinets are in'); await tap(O, '#gcq-post-go');
  const posted = await H.waitFor(O, () => true, null, 1000) && await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { if (JSON.stringify(H.cget('projects') || '').includes('FP test: cabinets are in')) return true; await sleep(500); } return false; })();
  ok(posted, 'the customer-portal post reached the job\'s portal posts in the cloud (portalPosts)');
  // P2: no portal → Make portal (the desk's "by hand" link action)
  await home(O); await tap(O, '#_gcJobPick .fh-job[data-job="P2"] [data-fa="fp-cust"]');
  ok(await O.ev(() => !!document.querySelector('.gcfp-sheet [data-c="make"]') && !document.querySelector('.gcfp-sheet [data-c="see"]')), '👤 a job with no portal offers 🏠 Make portal (no preview link)');
  // 🔧 Sub portal on P1: two subs → pick → what Ace sees → post to Ace
  await home(O); await tap(O, '#_gcJobPick .fh-job[data-job="P1"] [data-fa="fp-sub"]');
  const sl = await O.ev(() => [...document.querySelectorAll('.gcfp-sheet [data-k]')].map(b => b.textContent));
  ok(sl.length === 2 && /Ace Drywall/.test(sl[0]) && /Best Paint/.test(sl[1]), '🔧 Sub portal lists the job\'s two subs to pick from', sl);
  await tap(O, '.gcfp-sheet [data-k="S1"]');
  const sv = await O.ev(() => (document.querySelector('.gcfp-sheet .bd') || {}).innerText || '');
  await O.page().screenshot({ path: SHOTS + 'fieldportal_subportal.png' });
  ok(/100 Demo St/.test(sv) && /PO for materials: \S+/.test(sv) && /today/i.test(sv) && /ace-progress\.jpg/.test(sv) && /phone hidden/.test(sv), '🔧 what Ace sees: the Today card (address, PO, the customer, phone hidden) + their uploads', sv.slice(0, 300));
  await tap(O, '.gcfp-sheet [data-s="post"]');
  ok(await O.ev(() => !!document.getElementById('gcsub-msg')), '💬 Post to Ace opens the staff → sub thread');
  await O.page().locator('#gcsub-msg').fill('FP test: start Thursday'); await tap(O, '#gcsub-send'); await sleep(800);
  ok(CAP.sub.some(x => x.action === 's-send' && x.projectId === 'P1' && x.party === 's:S1' && x.text === 'FP test: start Thursday'), 'the sub post went to the sub portal (portal-access s-send, party s:S1)', CAP.sub);
  // 📸 Photos and 💬 Message on the card
  await home(O); await tap(O, '#_gcJobPick .fh-job[data-job="P1"] [data-fa="fp-photos"]'); await sleep(800);
  const ph = await O.ev(() => { const o = document.getElementById('gcuOv'); return { open: !!o && getComputedStyle(o).display !== 'none', txt: o ? o.innerText.slice(0, 2000) : '' }; });
  ok(ph.open && /Demo Kitchen Remodel/.test(ph.txt), '📸 Photos opens GrayCo Photos on that job', ph.txt.slice(0, 120));
  await home(O); await tap(O, '#_gcJobPick .fh-job[data-job="P1"] [data-fa="fp-msg"]'); await sleep(500);
  const mg = await O.ev(() => { const o = document.getElementById('_gcJobMsgOv'); return o ? o.innerText.slice(0, 400) : ''; });
  ok(/Demo Kitchen Remodel/.test(mg), '💬 Message opens that job\'s message thread directly (no picker)', mg.slice(0, 120));
  // bottom bar: 📸 Photos replaced 💬 Messages
  await home(O);
  const tb = await O.ev(() => [...document.querySelectorAll('#gc-fh-tabs [data-t]')].map(b => b.getAttribute('data-t') + ':' + b.textContent.trim()));
  ok(tb.join('|') === 'home:▣Home|jobs:◫Jobs|appr:✅Approvals|photos:📸Photos|more:☰More', 'bottom bar: Home · Jobs · Approvals · 📸 Photos · More', tb);
  await tap(O, '#gc-fh-tabs [data-t="photos"]'); await sleep(800);
  ok(await O.ev(() => { const o = document.getElementById('gcuOv'); return !!o && getComputedStyle(o).display !== 'none'; }), 'the bar\'s 📸 Photos opens GrayCo Photos');
  // the message picker: the Jobs tab's list; while nothing is loaded it says so and fills itself in
  await home(O);
  const pk = await O.ev(async () => {
    window._gcPickJobForMessages(); const a = document.querySelectorAll('#_jpList [data-pid]').length; document.getElementById('_jpX').click();
    const keep = window._crm.projects; window._crm.projects = [];
    window._gcPickJobForMessages(); const txt = document.getElementById('_jpList').innerText;
    await new Promise(r => setTimeout(r, 1500)); const b = document.querySelectorAll('#_jpList [data-pid]').length;
    window._crm.projects = keep; const x = document.getElementById('_jpX'); if (x) x.click();
    return { a, txt, b };
  });
  ok(pk.a >= 5, 'the message picker lists the owner\'s jobs', pk);
  ok(!/No jobs yet/.test(pk.txt) && pk.b >= 5, 'with the app\'s list still empty it never says "No jobs yet" — it fills in from the phone\'s copy', pk);
  // the Jobs tab: Active / In progress (latest first) · other open stages · Completed
  await tap(O, '#gc-fh-tabs [data-t="jobs"]'); await sleep(800);
  const jo = await O.ev(() => [...document.querySelectorAll('#_gcJobPick ._jpItem')].map(b => b.getAttribute('data-id')));
  await O.page().screenshot({ path: SHOTS + 'fieldportal_jobs.png' });
  const jl = await O.ev(() => ({ bg: getComputedStyle(document.getElementById('_gcJobPick')).backgroundColor, card: getComputedStyle(document.querySelector('#_gcJobPick ._jpItem')).backgroundColor }));
  ok(jl.bg === 'rgb(243, 245, 248)' && jl.card === 'rgb(255, 255, 255)', 'Pick a Job is light: light page, white cards', jl);
  const joT = await O.ev(() => [...document.querySelectorAll('#_gcJobPick ._jpItem')].map(b => { const p = window._crm.projects.find(x => String(x.id) === b.getAttribute('data-id')); return Math.max(Date.parse(p.updatedAt || 0) || 0, Date.parse(p.savedAt || 0) || 0); }));
  ok(jo.slice(0, 3).sort().join() === 'P1,P2,P5' && jo[3] === 'P4' && jo[4] === 'P3' && joT[0] >= joT[1] && joT[1] >= joT[2], 'Jobs list: Active / In progress first (latest activity on top), then Approved, then Completed', { jo, joT });
  // ── the job's field page ──
  await O.ev(() => { document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1500);
  const jp = await O.ev(() => {
    const ov = document.getElementById('_gcJobDash'), head = ov && ov.children[0], body = ov && ov.children[1];
    const tiles = [...ov.querySelectorAll('.gcfp-grid > button')].map(b => (b.children[1] || b).textContent.trim());
    const g = ov.querySelector('.gcfp-grid').getBoundingClientRect(), mail = ov.querySelector('._gcMailBtn'), map = [...ov.querySelectorAll('a')].find(a => /maps/.test(a.href) && /Map/.test(a.textContent));
    const cols = new Set([...ov.querySelectorAll('.gcfp-grid > button')].slice(0, 10).map(b => Math.round(b.getBoundingClientRect().left))).size;
    const h0 = head.getBoundingClientRect().top; body.scrollTop = 900; const h1 = head.getBoundingClientRect().top, st = body.scrollTop;
    const tabs = document.getElementById('gc-fh-tabs').getBoundingClientRect(); body.scrollTop = body.scrollHeight; const last = body.lastElementChild.getBoundingClientRect();
    const brain = document.getElementById('gcb-fieldbtn'), bv = brain ? getComputedStyle(brain).display : 'none';
    const minH = Math.min(...[...ov.querySelectorAll('.gcfp-grid > button')].map(b => b.getBoundingClientRect().height));
    body.scrollTop = 0;
    return { tiles, gridTop: g.top, mailTop: mail ? mail.getBoundingClientRect().top : null, mapTop: map ? map.getBoundingClientRect().top : null, cols, h0, h1, st, lastBottom: last.bottom, tabsTop: tabs.top, bv, minH, nameOne: getComputedStyle(ov.querySelector('.gcfp-name')).whiteSpace, ta: getComputedStyle(ov.querySelector('.gcfp-grid > button')).touchAction };
  });
  ok(JSON.stringify(jp.tiles.slice(0, 10)) === JSON.stringify(ORDER), 'job page: the tiles in the owner\'s order (1–10)', jp.tiles);
  ok(jp.tiles.indexOf('Documents') === 10 && jp.tiles.indexOf('Create Document') === 11, 'then Documents, Create Document and the rest', jp.tiles);
  ok(jp.cols === 2 && jp.minH >= 44, 'tiles: 2 columns × 5 rows, every tile 44 px+', { cols: jp.cols, minH: jp.minH });
  ok(jp.mailTop != null && jp.mapTop != null && jp.gridTop < jp.mailTop && jp.gridTop < jp.mapTop, 'the tiles are above ✉️ E-mail the customer and 📍 Map', jp);
  ok(jp.st > 100 && Math.abs(jp.h1 - jp.h0) < 1, 'the header stays fixed while the content scrolls', { h0: jp.h0, h1: jp.h1, st: jp.st });
  ok(jp.lastBottom <= jp.tabsTop + 1, 'nothing is hidden under the bottom bar (the last card ends above it)', { last: jp.lastBottom, tabs: jp.tabsTop });
  ok(jp.nameOne === 'nowrap' && jp.ta === 'manipulation', 'compact one-line job name; taps have no 300 ms delay (touch-action: manipulation)', jp);
  ok(jp.bv === 'none', 'no floating 🧠 button in Field view');
  ok(await noSideways(O), 'job page: no sideways scroll at 390 px');
  // tiles 3 / 4 on the job page
  await tap(O, '#_gcJobDash .gcfp-t[data-fp="cust"]');
  ok(await O.ev(() => !!document.querySelector('.gcfp-sheet [data-c="post"]')), 'job page tile 👤 Customer portal → post / preview sheet');
  await O.ev(() => document.querySelectorAll('.gcfp-sheet').forEach(o => o.remove()));
  await tap(O, '#_gcJobDash .gcfp-t[data-fp="sub"]');
  ok(await O.ev(() => document.querySelectorAll('.gcfp-sheet [data-k]').length === 2), 'job page tile 🔧 Sub portal → the job\'s subs');
  await O.ev(() => document.querySelectorAll('.gcfp-sheet').forEach(o => o.remove()));
  // the light look (Field only) + screenshots for the owner
  const lt = await O.ev(() => ({ dash: getComputedStyle(document.getElementById('_gcJobDash')).backgroundColor, head: getComputedStyle(document.querySelector('#_gcJobDash .gcfp-head')).backgroundColor, tile: getComputedStyle(document.querySelector('#_gcJobDash .gcfp-grid > button')).backgroundColor, name: getComputedStyle(document.querySelector('#_gcJobDash .gcfp-name')).color }));
  ok(lt.dash === 'rgb(243, 245, 248)' && lt.head === 'rgb(255, 255, 255)' && /^rgb\(255, 2/.test(lt.tile) && lt.name === 'rgb(17, 24, 39)', 'the job page is light: light page, white header and tiles, dark text', lt);
  await O.page().screenshot({ path: SHOTS + 'fieldportal_job.png' });
  await O.ev(() => { document.getElementById('_gcJobDash').children[1].scrollTop = 99999; }); await sleep(300);
  await O.page().screenshot({ path: SHOTS + 'fieldportal_job_bottom.png' });
  await O.ev(() => { document.getElementById('_gcJobDash').children[1].scrollTop = 0; });
  // every Job tool acts on the open job — also when the app's own list loses it after the page opened
  const keepP = await O.ev(() => { window.__fpKeep = window._crm.projects; window._crm.projects = window._crm.projects.filter(p => p.id !== 'P1'); return window._crm.projects.length; });
  const toolRes = {};
  for (const [k, sel] of [['info', '#_gcJobDash ._jdAct[data-fn="info"]'], ['walk', '#_gcJobDash [data-a8b="walkthrough"]'], ['done', '#_gcJobDash [data-a8b="done"]'], ['arrived', '#_gcJobDash [data-a8b="arrived"]'], ['safety', '#_gcJobDash [data-a8b="safety"]'], ['cust', '#_gcJobDash [data-d1cust]'], ['home', '#_gcJobDash .gcx10-jobbar button:nth-of-type(1)'], ['codes', '#_gcJobDash .gcx10-jobbar button:nth-of-type(2)'], ['insp', '#_gcJobDash .gcx10-jobbar button:nth-of-type(3)']]) {
    const n = await H.waitFor(O, s => document.querySelectorAll(s).length, sel, 8000);
    if (!n) { toolRes[k] = 'missing'; continue; }
    await O.ev(() => { window.__fpToasts = []; document.querySelectorAll('.gcd1-ov,.gcfp-sheet,[id^="gc-a8-"]:not(.gc-a8-bar),[class*="gcx10-ov"]').forEach(o => { if (!o.closest('#_gcJobDash')) o.remove(); }); [...document.body.children].filter(e => e.getAttribute('data-fp-mark') === null).forEach(e => e.setAttribute('data-fp-mark', '1')); });
    await O.page().locator(sel).first().evaluate(e => e.click()); await sleep(1300);
    toolRes[k] = await O.ev(() => { const fresh = [...document.body.children].filter(e => !e.hasAttribute('data-fp-mark') && e.offsetParent !== null || (!e.hasAttribute('data-fp-mark') && getComputedStyle(e).position === 'fixed')); const txt = fresh.map(e => e.innerText || '').join(' | '); const bad = /Open a job first|Job Profiles|Customer · 0 jobs/.test(document.body.innerText); return { opened: fresh.length > 0, job: /Demo Kitchen Remodel|Sample Homeowner|100 Demo St|PO-1001/.test(txt), bad, txt: txt.slice(0, 100) }; });
    await O.ev(() => { [...document.body.children].filter(e => !e.hasAttribute('data-fp-mark')).forEach(e => { if (e.id !== '_gcJobDash' && e.id !== 'gc-fh-tabs') e.remove(); }); if (!document.getElementById('_gcJobDash')) window._gcJobDashboard('P1'); });
    await sleep(300);
  }
  await O.ev(() => { window._crm.projects = window.__fpKeep; });
  ok(Object.keys(toolRes).every(k => toolRes[k] !== 'missing' && toolRes[k].opened && !toolRes[k].bad), 'every Job tool opens on the open job (Job Info, walkthrough, crew arrived, done for today, safety, Customer, home / codes / inspections) — no "Open a job first", no list of jobs', toolRes);
  ok(toolRes.info && toolRes.info.job && toolRes.cust && toolRes.cust.job, 'Job Info and 👤 Customer show THIS job / its customer', { info: toolRes.info, cust: toolRes.cust });
  await O.ev(() => { document.querySelectorAll('#_gcJobDash').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1200);
  // 📷 Add Photo/File: a photo → GrayCo Photos (asks "Customer can see?") + the cloud; a PDF → the job's Documents
  let fc = O.page().waitForEvent('filechooser', { timeout: 8000 });
  await tap(O, '#_gcJobDash .gcfp-grid > button[data-fn="photo"]');
  await (await fc).setFiles({ name: 'fp-wall.png', mimeType: 'image/png', buffer: PNG }); await sleep(1200);
  const asked = await O.ev(() => !!document.querySelector('.gc-custq'));
  ok(asked, 'a photo from 📷 Add Photo/File asks "Customer can see?" (GrayCo Photos\' own upload)');
  if (asked) await tap(O, '.gc-custq [data-gc-custq-ok]');
  const inCloud = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 40000) { const v = JSON.stringify(H.cget('gc_photos') || ''); if (v.includes('"jobId":"P1"') && v.includes('"source":"grayco"')) return true; await sleep(700); } return false; })();
  ok(inCloud, 'the photo is in GrayCo Photos for that job and in the cloud (gc_photos, jobId P1)');
  await O.ev(() => { document.querySelectorAll('._gcSheetOv,.gc-custq').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1000);
  await O.ev(() => { const o = window._gcOpenJobProfile; window.__fpDocs = []; window._gcOpenJobProfile = function(){ const r = o.apply(this, arguments); const inp = document.getElementById('_jpFileInput'); if (inp && inp.onchange && !inp.onchange.__fp) { const h = inp.onchange; const w = function(){ window.__fpDocs.push([...(inp.files || [])].map(f => f.name)); return h.apply(this, arguments); }; w.__fp = true; inp.onchange = w; } return r; }; window.__fpRestore = o; });
  fc = O.page().waitForEvent('filechooser', { timeout: 8000 });
  await tap(O, '#_gcJobDash .gcfp-grid > button[data-fn="photo"]');
  await (await fc).setFiles({ name: 'fp-permit.pdf', mimeType: 'application/pdf', buffer: PDF }); await sleep(2500);
  const pdfHanded = await O.ev(() => JSON.stringify(window.__fpDocs || []).includes('fp-permit.pdf'));
  await O.ev(() => { if (window.__fpRestore) window._gcOpenJobProfile = window.__fpRestore; });
  ok(pdfHanded, 'a PDF from 📷 Add Photo/File goes to the job\'s Documents upload (the job profile\'s own file input, as before)');
  const pdfDoc = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { const loc = await O.ev(async () => [].concat((window._crm && window._crm.projectDocs) || [], (await window.idbGet('projectDocs')) || [], JSON.parse(localStorage.getItem('grayco_docs') || '[]')).some(d => d && d.pid === 'P1' && d.name === 'fp-permit.pdf')); if (loc || JSON.stringify(H.cget('projectDocs') || '').includes('fp-permit.pdf')) return true; await sleep(700); } return false; })();
  await O.ev(() => { document.querySelectorAll('._gcSheetOv,[data-gcnav-pad]').forEach(o => { if (!o.closest('#_gcJobDash')) o.remove(); }); });
  if (!pdfDoc) console.log('  · (the CRM\'s own Documents save had not reached the phone store / cloud in 20 s — not part of this patch)');
  // 📒 Daily Log, 💰 Financials, 📅 Schedule & Inspections
  await O.ev(() => { document.querySelectorAll('._gcSheetOv').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(800);
  const before = await O.ev(() => document.body.children.length);
  await tap(O, '#_gcJobDash .gcfp-t[data-fp="log"]'); await sleep(800);
  const lg = await O.ev(() => [...document.querySelectorAll('body > *')].filter(e => getComputedStyle(e).position === 'fixed' && /daily log|site book/i.test(e.innerText || '')).length);
  ok(lg > 0, '📒 Daily Log opens the job\'s Site Book daily log', { before, lg });
  await O.ev(() => { window._gcJobDashboard('P1'); }); await sleep(800);
  await tap(O, '#_gcJobDash .gcfp-t[data-fp="money"]');
  const mo = await O.ev(() => (document.querySelector('.gcfp-sheet .bd') || {}).innerText || '');
  await O.page().screenshot({ path: SHOTS + 'fieldportal_money.png' });
  ok(/Contract\s*\$25,000/.test(mo) && /Change orders\s*\$400/.test(mo) && /Invoiced\s*\$15,000/.test(mo) && /Paid\s*\$10,000/.test(mo) && /Profit/.test(mo) && /Margin/.test(mo) && /1001/.test(mo) && /Extra outlet/.test(mo), '💰 money summary (contract, COs, invoiced, paid, costs, profit/margin for the owner), invoices and change orders', mo.slice(0, 400));
  await O.ev(() => document.querySelectorAll('.gcfp-sheet').forEach(o => o.remove()));
  await tap(O, '#_gcJobDash .gcfp-t[data-fp="sched"]');
  const sc = await O.ev(() => { const b = document.querySelector('.gcfp-sheet .bd'); return { t: b ? b.innerText : '', old: [...document.querySelectorAll('.gcfp-sheet .gcfp-ev.old')].map(e => e.innerText), add: !!document.querySelector('.gcfp-sheet [data-g="task"]') && !!document.querySelector('.gcfp-sheet [data-g="insp"]') }; });
  ok(/Coming up[\s\S]*Drywall hang[\s\S]*Final[\s\S]*Past[\s\S]*Framing/i.test(sc.t) && sc.old.some(x => /Framing/.test(x)) && sc.add, '📅 Schedule & Inspections: one dated list, upcoming on top, past greyed, + Add phase/task / + Add inspection', sc);
  await O.ev(() => document.querySelectorAll('.gcfp-sheet').forEach(o => o.remove()));
  // 💎 menu → 🧠 Business Brain
  const hubBtn = await H.waitFor(O, () => !!document.getElementById('_gcFieldHubBtn'), null, 20000);
  if (hubBtn) { await O.ev(() => document.getElementById('_gcFieldHubBtn').click()); await sleep(600); }
  const bi = await O.ev(() => { if (!document.querySelector('.gc-hub-panel') && window._gcToggleHub) window._gcToggleHub(); const it = [...document.querySelectorAll('.gc-hub-panel .gc-hub-item')].find(e => e.getAttribute('data-label') === 'Business Brain'); if (it) it.click(); return !!it; });
  await sleep(1200);
  ok(bi && await O.ev(() => !!document.getElementById('gcb-ov')), '🧠 Business Brain is in the 💎 menu and opens');
  await O.ev(() => { const o = document.getElementById('gcb-ov'); if (o) o.remove(); });
  // ⚙ Settings (owner)
  await home(O); await O.ev(() => window._gcField.settings()); await sleep(1500);
  await O.page().screenshot({ path: SHOTS + 'fieldportal_settings.png' });
  const st = await O.ev(() => ({ secs: [...document.querySelectorAll('.gc-fh-sheet .gcfp-sec')].map(s => s.getAttribute('data-sec')), sms: (document.querySelector('.gc-fh-sheet a[data-g="shotsms"]') || {}).href || '', guide: (document.querySelector('.gc-fh-sheet a[data-g="guide"]') || {}).href || '', app: /clear data|sign out|version/i.test((document.querySelector('.gc-fh-sheet') || {}).innerText || ''), notif: !!document.querySelector('.gc-fh-sheet [data-n="emerg"]') }));
  ok(st.secs.join(',') === 'profile,notif,oncall,pause,custq,help,admin', 'owner ⚙ Settings: My profile · Notifications · On call · Data-entry mode · Customer photo default · Help · Admin shortcuts', st.secs);
  ok(/^sms:9015550100/.test(st.sms) && /1ETWZczKsUBEbW73tcppcA/.test(st.guide) && !st.app, 'Help: text Wesley a screenshot (his number from the people list) + the getting-started page; no "App" section', st);
  ok(st.notif, 'Notifications: the owner\'s own alert switches (the existing text-alert settings)');
  if (st.notif) { await O.ev(() => { const c = document.querySelector('.gc-fh-sheet [data-n="emerg"]'); c.checked = true; document.querySelector('.gc-fh-sheet [data-n="save"]').click(); }); await sleep(1000); }
  const al = CAP.alerts.slice(-1)[0];
  ok(!!al && al.settings.people['wjohnson@grayco-cs.com'].emerg === true && al.settings.people['nthomas@grayco-cs.com'].on === true, 'saving my alerts changes only my row (others kept)', al);
  await O.ev(() => { const r = document.querySelector('.gc-fh-sheet input[name="gcfp-cq"][value="no"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  ok(await O.ev(() => window._gcCustqDefault() === false), 'Customer photo default: "No" is remembered for this person (the question still asks)');
  await O.ev(() => { const r = document.querySelector('.gc-fh-sheet input[name="gcfp-cq"][value=""]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  ok(await noSideways(O), 'Settings: no sideways scroll');
  ok(!O.errs.length, 'owner: no page errors', O.errs.slice(0, 3));
  await O.b.close(); W.length = 0;

  // ══════════ PM ══════════
  const P = await H.computer('PM', { build, mobile: true }); W.push(P); await mocks(P);
  await H.signIn(P, 'sbiffle@grayco-cs.com', 9000);
  ok(!!(await fh(P)), 'PM: the phone opens in GrayCo Field');
  const pc = await P.ev(() => [...document.querySelectorAll('#_gcJobPick .fh-job')].map(j => ({ pid: j.getAttribute('data-job'), b: [...j.querySelectorAll('.fp-row [data-fa]')].map(b => b.getAttribute('data-fa')) })));
  ok(pc.length >= 1 && pc.every(x => x.pid !== 'P2') && pc.every(x => x.b.join() === 'fp-cust,fp-sub,fp-photos,fp-msg'), 'PM: only his own jobs, each with all four buttons', pc);
  const pp = await P.ev(() => ({ own: window._gcFP.perms('P1'), other: window._gcFP.perms('P2'), run: window._gcFP.run('fp-cust', window._crm.projects.find(p => p.id === 'P2')), sheet: !!document.querySelector('.gcfp-sheet') }));
  ok(pp.own.cust && pp.own.sub && pp.own.photos && pp.own.msg && !pp.other.cust && !pp.other.sub && !pp.other.photos && !pp.other.msg && !pp.run && !pp.sheet, 'PM: the buttons work on his jobs only — another PM\'s job gets none', pp);
  await P.ev(() => { document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._gcJobDashboard('P2'); }); await sleep(1000);
  const p2 = await P.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-t')].map(b => b.getAttribute('data-fp')));
  ok(p2.length === 0, 'PM on another PM\'s job page: no portal / photo / message tiles', p2);
  await P.ev(() => window._gcJobDashboard('P1')); await sleep(1000);
  const p1 = await P.ev(() => [...document.querySelectorAll('#_gcJobDash .gcfp-grid > button')].slice(0, 10).map(b => (b.children[1] || b).textContent.trim()));
  ok(JSON.stringify(p1) === JSON.stringify(ORDER), 'PM on his job page: the same ten tiles in order', p1);
  await tap(P, '#_gcJobDash .gcfp-t[data-fp="money"]');
  const pmo = await P.ev(() => (document.querySelector('.gcfp-sheet .bd') || {}).innerText || '');
  ok(/Contract/.test(pmo) && /Profit/.test(pmo), 'PM sees profit / margin on his own job (the existing rule)', pmo.slice(0, 200));
  await P.ev(() => document.querySelectorAll('.gcfp-sheet').forEach(o => o.remove()));
  await P.ev(() => { document.querySelectorAll('#_gcJobDash').forEach(o => o.remove()); window._gcField.open(); }); await sleep(600);
  await tap(P, '#gc-fh-tabs [data-t="jobs"]'); await sleep(800);
  const pj = await P.ev(() => [...document.querySelectorAll('#_gcJobPick ._jpItem')].map(b => b.getAttribute('data-id')));
  ok(pj.slice(0, 2).sort().join() === 'P1,P5' && pj[2] === 'P4' && pj[3] === 'P3' && pj.length === 4, 'PM Jobs list: his jobs, Active / In progress latest first, Approved, Completed last', pj);
  await home(P); await P.ev(() => window._gcField.settings()); await sleep(800);
  const ps = await P.ev(() => [...document.querySelectorAll('.gc-fh-sheet .gcfp-sec')].map(s => s.getAttribute('data-sec')));
  ok(ps.join(',') === 'profile,notif,oncall,custq,help', 'PM ⚙ Settings: no Data-entry mode and no Admin shortcuts', ps);
  ok(await noSideways(P), 'PM: no sideways scroll');
  ok(!P.errs.length, 'PM: no page errors', P.errs.slice(0, 3));
  await P.b.close(); W.length = 0;

  // ══════════ OFFICE ══════════
  const F = await H.computer('OFF', { build, mobile: true }); W.push(F); await mocks(F);
  await H.signIn(F, 'office@grayco-cs.com', 9000);
  ok(!!(await H.waitFor(F, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 40000)), 'office: the phone opens in GrayCo Field');
  const fp = await F.ev(() => ({ p1: window._gcFP.perms('P1'), p2: window._gcFP.perms('P2') }));
  ok(fp.p1.cust && fp.p2.cust && fp.p2.sub, 'office: the portals on every job', fp);
  await home(F); await F.ev(() => window._gcField.settings()); await sleep(800);
  const fs = await F.ev(() => ({ secs: [...document.querySelectorAll('.gc-fh-sheet .gcfp-sec')].map(s => s.getAttribute('data-sec')), adm: [...document.querySelectorAll('.gc-fh-sheet [data-sec="admin"] [data-g]')].map(b => b.getAttribute('data-g')) }));
  ok(fs.secs.indexOf('admin') >= 0 && fs.secs.indexOf('pause') < 0 && fs.adm.indexOf('callorder') >= 0 && fs.adm.indexOf('texts') >= 0, 'office ⚙ Settings: Admin shortcuts (call order, text auto-answers…), no Data-entry mode', fs);
  ok(!F.errs.length, 'office: no page errors', F.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await close();
console.log(`FIELDPORTAL ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
