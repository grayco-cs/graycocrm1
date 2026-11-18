// test_PMFIELD.mjs <build-dir> — patch PMFIELD: GrayCo Field for PMs and the admin, on an iPhone (390x844, iPhone UA, touch).
//   A. node: the bar hook for every role (✅ Approvals bottom-left, 🏠 Home in the middle; 4-button bars keep Home left; Office gets 📸),
//      window._gcPayKind (commission / hourly / salary — PMs and admins are commission), the sections hook.
//   B. the CRM (offline harness, made-up data):
//      · PM: the bar · the home dashboard (Today · quick actions · Needs you · This week, big tap targets) · no 🤒 Call in sick /
//        ⏰ Running late anywhere, no clock nags · 📅 New appointment (a lead) → saved to the cloud schedule → on My Schedule →
//        on the Desk (a second browser, same cloud) → reload keeps it · edit / move · cancel · 🛠 Schedule work (a sub, 4 work days,
//        one group; patch SUBCONFIRM offers the sub) · a PM cannot schedule on / change another PM's job · ✏️ Update job in 3 taps
//        (stage + note saved on the job) · every quick tile and bar button opens something, Home brings the dashboard back.
//      · Nick (admin): the bar, the dashboard (company Today, the admin tiles), This week — the close rate counts jobs made from
//        leads as won and stale clean-ups not as lost; every number opens its list; a payroll / commission approval only under
//        Needs you and only for the admin; schedules work on any job; the job cards say "Customer portal"; 📋 Copy portal link.
//      · a Mitigation PM (limited to GrayCo Mitigation) and an Environmental PM: the same bar, the dashboard with their job-type tiles
//        (💧 Drying logs due · 🌀 Equipment out · 📄 Paperwork due), only their company's jobs and schedule, New appointment / Schedule
//        work / Update job on their jobs (the work carries the job's company).
//      · Office Manager (salary, no commission, limited to Mitigation): 🤒 Call in sick and ⏰ Running late are offered; the schedule
//        she sees is Mitigation's only.
// Usage: node test_PMFIELD.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_PMFIELD.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/pmfield/';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}

/* ── A. node ── */
console.log('A. node');
{
  const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8'); const m = t.match(/<script id="gc-patch-pmfield">([\s\S]*?)<\/script>/);
  ok(!!m, 'the PMFIELD script block is in index.html');
  const el = () => ({ classList: { contains: () => false, toggle(){}, add(){} }, setAttribute(){}, getAttribute(){ return null; }, hasAttribute(){ return false; }, appendChild(){}, style: {}, querySelector: () => null, querySelectorAll: () => [] });
  const D = { documentElement: el(), head: el(), body: el(), createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, hidden: false };
  const Wn = { document: D, setTimeout: () => 0, setInterval: () => 0, console: { log(){}, warn(){} }, localStorage: { getItem: () => null }, _crm: { users: [] } };
  vm.createContext(Wn); vm.runInContext('(function(window){' + m[1] + '})(this)', Wn);
  const BAR = {
    admin: [['home', '▣', 'Home'], ['jobs', '◫', 'Jobs'], ['appr', '✅', 'Approvals'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
    pm: [['home', '▣', 'Home'], ['jobs', '◫', 'My Jobs'], ['appr', '✅', 'Approvals'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
    est: [['home', '▣', 'Home'], ['ra-leads', '📥', 'Leads'], ['ra-estimates', '🧮', 'Estimates'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
    ins: [['home', '▣', 'Home'], ['ra-claims', '🛡', 'Claims'], ['ra-leads', '📥', 'Leads'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
    crew: [['home', '▣', 'Home'], ['ra-today', '📍', 'Today'], ['photos', '📸', 'Photos'], ['msgs', '💬', 'Messages']],
    office: [['home', '▣', 'Home'], ['appr', '✅', 'Approvals'], ['msgs', '💬', 'Messages'], ['more', '☰', 'More']],
    env: [['home', '▣', 'Home'], ['jobs', '◫', 'Jobs'], ['appr', '✅', 'Approvals'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']],
    clean: [['home', '▣', 'Home'], ['jobs', '◫', 'Jobs'], ['photos', '📸', 'Photos'], ['more', '☰', 'More']]
  };
  const bar = (a, w) => Wn._gcRaBarHook(a, JSON.parse(JSON.stringify(BAR[a])), w || 'field').map(b => b[0]).join(',');
  ok(bar('admin') === 'appr,jobs,home,ra-sched,more', 'admin bar: ✅ Approvals · Jobs · 🏠 Home · 📅 My Schedule · More', bar('admin'));
  ok(bar('pm') === 'appr,jobs,home,ra-sched,more', 'PM bar: ✅ Approvals · My Jobs · 🏠 Home · 📅 My Schedule · More', bar('pm'));
  ok(bar('env') === 'appr,jobs,home,ra-sched,more', 'environmental bar: the same', bar('env'));
  ok(bar('office') === 'appr,msgs,home,ra-sched,more', 'office bar: ✅ Approvals · Messages · 🏠 Home · 📅 My Schedule · More', bar('office'));
  ok(bar('est') === 'ra-leads,ra-estimates,home,ra-sched,more' && bar('ins') === 'ra-claims,ra-leads,home,ra-sched,more', 'no-approvals roles: their buttons in order, 🏠 Home in the middle, 📅 My Schedule for Photos', [bar('est'), bar('ins')]);
  ok(bar('crew') === 'home,ra-today,photos,msgs' && bar('clean') === 'home,jobs,photos,more', '4-button bars (crew / cleaning): unchanged', [bar('crew'), bar('clean')]);
  ok(Wn._gcRaBarHook('pm', JSON.parse(JSON.stringify(BAR.pm)), 'field')[3].join() === 'ra-sched,📅,My Schedule', 'the 4th button is 📅 My Schedule');
  ok(bar('admin', 'desk') === 'home,jobs,appr,photos,more', 'the Desk dock is not changed', bar('admin', 'desk'));
  ok(Wn._gcRaBarHook('pm', JSON.parse(JSON.stringify(BAR.pm)), 'field')[2][1] === '🏠', 'the middle button is 🏠');
  const P = Wn._gcPmField.payKind;
  const pk = [[{ payType: 'owner' }, 'commission'], [{ role: 'Admin', payType: 'salary' }, 'commission'], [{ role: 'Project Manager' }, 'commission'], [{ role: 'Project Manager', payType: 'salary' }, 'commission'],
    [{ role: 'Project Manager', payType: 'hourly' }, 'hourly'], [{ payType: 'salary_commission' }, 'commission'], [{ payType: 'revenue_pct' }, 'commission'], [{ role: 'Laborer' }, 'hourly'],
    [{ role: 'Superintendent', payType: 'hourly' }, 'hourly'], [{ role: 'Office Manager', payType: 'salary' }, 'salary']];
  const bad = pk.filter(x => P(x[0]) !== x[1]);
  ok(!bad.length, 'pay kind: owner / admin / PM / any commission plan → commission; hourly → hourly; salary (no commission) → salary', bad);
  // 🏭 Industrial: a job type in the pickers, treated like Commercial
  ok(/nd=\["Residential Reno","Commercial Reno","Commercial TI","New Construction","Industrial",/.test(t) && /var CRM_TYPES = \[[^\]]*'Industrial'/.test(t) && /var TYPES = \[[^\]]*'Commercial', 'Industrial'/.test(t), '🏭 Industrial is in the job-type pickers (new project / lead / job edit, the CRM type list, GrayCo Field ＋ Add job)');
  ok(t.includes("/^(commercial|industrial|new construction)/i.test(ty)") && t.includes('/commerc|industr|gov|public bid|municipal/i') && t.includes("/commerc|industr|gov|public|municipal|federal/"), 'Industrial is treated like Commercial: the job page layout, the close-rate exclusion, the bid / contact rules');
  ok(!t.includes('/^(residential|commercial|industrial|government|insurance)'), 'the estimate builder\'s raw-kind test is left alone');
  ok(JSON.stringify(Wn._gcRaSections('pm', ['jobs', 'approvals', 'estimates', 'commission'])) === '["jobs","estimates","commission"]' && JSON.stringify(Wn._gcRaSections('admin', ['approvals', 'scorecard'])) === '[]' && Wn._gcRaSections('est', ['bids', 'jobs', 'approvals']).length === 3,
    'sections: the PM / admin approvals + scorecard move into the dashboard; other roles unchanged');
}

/* ── B. the CRM ── */
if (process.env.PMFIELD_NODE_ONLY === '1') { console.log(`PMFIELD (node only) ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0); }
const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const acct = name => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === name);
const NICK = acct('Nick Gray'), PM = acct('Demo PM'), OFFICE = acct('Office Demo'), MITPM = acct('Demo Estimator');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const ymd = d => new Date(Date.now() + d * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });   /* the phone's day (the harness browser runs on Chicago time), not the test machine's */
const TOK = 'A'.repeat(43);
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
  { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true, phone: '9015550111' },
  { id: 'u4', name: 'Office Demo', email: OFFICE, role: 'Office Manager', payType: 'salary', active: true, companies: ['mitigation'] },
  { id: 'u3', name: 'Sam Mitig', email: MITPM, role: 'Mitigation Project Manager', payType: 'salary_commission', active: true, companies: ['mitigation'] },
  { id: 'u6', name: 'Molly Tech', role: 'Mitigation Technician', payType: 'hourly', active: true, companies: ['mitigation'] },
  { id: 'u5', name: 'Hourly Helper', role: 'Laborer', payType: 'hourly', active: true }]);
H.cset('projects', [
  { id: 'P1', po: 'PO-3001', name: 'Kitchen - Maple', client: 'Sample Homeowner A', address: '101 Demo St', type: 'Residential Reno', pm: 'Demo PM', status: 'Active', contract: 30000, contractSigned: true, updatedAt: ago(1), portalUrl: 'https://crm.example.test/portal.html#t=' + TOK },
  { id: 'P2', po: 'PO-3002', name: 'Roof - Oak', client: 'Sample Homeowner B', address: '202 Demo Ave', type: 'Roofing', pm: 'Demo PM', status: 'In Progress', contract: 15000, contractSigned: true, updatedAt: ago(2) },
  { id: 'M1', name: 'Water loss - Birch', client: 'Sample Insured M', address: '404 Demo Ct', type: 'Water Damage', companyId: 'mitigation', pm: 'Sam Mitig', mitTech: 'Molly Tech', status: 'active', updatedAt: ago(1) },
  { id: 'M2', name: 'Fire - Cedar', client: 'Sample Insured F', address: '505 Demo Ct', type: 'Fire Damage', companyId: 'mitigation', pm: 'Sam Mitig', status: 'active', updatedAt: ago(2) },
  { id: 'E1', name: 'Lead trim - Pine', client: 'Sample Owner E', address: '606 Demo Ct', type: 'Environmental', companyId: 'environmental', notes: 'House built 1962 — lead paint on the window trim', pm: 'Sam Mitig', status: 'Pending', updatedAt: ago(1) },
  { id: 'P3', po: 'PO-3003', name: 'Office TI - Elm', client: 'Sample Biz', address: '303 Demo Blvd', type: 'Commercial TI', pm: 'Other PM', status: 'Active', contract: 90000, contractSigned: true, updatedAt: ago(3) }]);
H.cset('subs', [{ id: 'S1', name: 'Demo Drywall Co', company: 'Demo Drywall Co', trade: 'Drywall', phone: '9015550200' }, { id: 'S2', name: 'Sample Electric', trade: 'Electrical' }]);
H.cset('schedule', [
  { id: 'SCHa', pid: 'P1', title: 'Demo cabinets', date: ymd(0), time: '8:00 AM', vendor: 'Sample Electric', assignee: 'Sample Electric', type: 'work', scope: 'company', updatedAt: ago(1) },
  { id: 'SCHb', pid: 'P3', title: 'Framing', date: ymd(0), time: '7:00 AM', vendor: 'Sample Electric', type: 'work', scope: 'company', updatedAt: ago(1) },
  { id: 'SCHm', pid: 'M1', title: 'Dehu check', date: ymd(0), time: '9:00 AM', assignee: 'Molly Tech', type: 'work', scope: 'company', companyId: 'mitigation', updatedAt: ago(1) },
  { id: 'SCHe', pid: 'E1', title: 'Containment set-up', date: ymd(1), time: '8:00 AM', assignee: 'Sam Mitig', type: 'work', scope: 'company', companyId: 'environmental', updatedAt: ago(1) },
  { id: 'SCHc', pid: 'P2', title: 'Walkthrough — Sample Homeowner B', date: ymd(2), time: '2:00 PM', assignee: 'Demo PM', type: 'appointment', scope: 'company', updatedAt: ago(1) }]);
H.cset('leads', [
  { id: 'L1', name: 'Bath remodel', client: 'Lead Person A', pm: 'Demo PM', stage: 'New Lead', createdAt: ago(1), followUpDate: ymd(-2), address: '9 Lead Ln' },
  { id: 'L2', name: 'Deck', client: 'Lead Person B', pm: 'Demo PM', stage: 'Won', converted: true, convertedAt: ago(5), createdAt: ago(20) },
  { id: 'L3', name: 'Siding', client: 'Lead Person C', stage: 'Lost', lostAt: ago(3), createdAt: ago(30) },
  { id: 'L4', name: 'Old one', client: 'Lead Person D', stage: 'Lost', lostReason: 'old / stale', lostAt: ago(1), createdAt: ago(300) },
  { id: 'L5', name: 'Porch', client: 'Lead Person E', status: 'converted', converted: true, convertedAt: ago(10), jobId: 'P1', createdAt: ago(40) },
  { id: 'L7', name: 'Biohazard clean-up', client: 'Lead Person G', type: 'Trauma / biohazard', companyId: 'environmental', pm: 'Sam Mitig', stage: 'New Lead', createdAt: ago(0) },
  { id: 'L6', name: 'Warehouse TI bid', client: 'Sample GC Inc.', type: 'Commercial', stage: 'Lost', lostAt: ago(2), createdAt: ago(25) }]);
H.cset('invoices', [{ id: 'INV1', num: '1001', pid: 'P1', client: 'Sample Homeowner A', amt: 10000, date: ymd(-20), status: 'sent', payments: [{ date: ymd(0), amt: 4000 }] }]);
H.cset('projectDocs', []); H.cset('punch', []); H.cset('timesheets', []);
H.cset('gc_claims', [{ id: 'CL1', projectId: 'M1', title: 'Water loss - Birch', phase: 'Work', scope: 'mitigation', jobType: 'water', carrier: 'Sample Carrier', claimNumber: 'D-100', createdAt: ago(2), updatedAt: ago(0),
  equipment: [{ id: 'e1', kind: 'airmover', room: 'Basement', qty: 4, placedAt: ago(2) }, { id: 'e2', kind: 'dehu', room: 'Basement', qty: 1, placedAt: ago(2) }],
  moisture: [{ id: 'm1', room: 'Basement', material: 'Drywall', point: 'N1', reading: 30, goal: 12, date: ymd(-2) }] }]);

const IPHONE = () => { try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); } catch (e) {} };
const OPEN = []; const BAD_TOAST = /not on this|did not open|not part of your profile|Not on this job|is not on this phone/i;
async function phone(email, who){
  const c = await H.computer(who, { build, mobile: true, init: IPHONE }); OPEN.push(c);
  await H.signIn(c, email, 9000);
  await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs[data-ra-bar]'), null, 45000);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 3 && (window._crm.schedule || []).length >= 3, null, 30000);
  await sleep(1500);
  return c;
}
async function tap(c, sel){
  const L = c.page().locator(sel).first();
  await L.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await sleep(150);
  const bb = await L.boundingBox().catch(() => null);
  /* a floating button (🎤 / 💎) over the spot: a person scrolls it clear — the test taps the element itself */
  const free = bb ? await L.evaluate((e, p) => { const h = document.elementFromPoint(p.x, p.y); return !!h && (h === e || e.contains(h)); }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }).catch(() => false) : false;
  if (bb && free) await c.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await L.evaluate(e => e.click()).catch(() => {});
  await sleep(700);
}
const home = async c => { await c.ev(() => { document.querySelectorAll('.gc-ra-sheet,.gc-fh-sheet,.gcfp-sheet,._gcSheetOv,#_gcJobDash').forEach(o => o.remove()); try { if (window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) window._gcPhotos.close(); } catch (e) {} try { if (window._gcClaims && window._gcClaims.close) window._gcClaims.close(); } catch (e) {} document.querySelectorAll('.gcbb-ov,#gc-mws-sheet').forEach(o => o.remove()); });   /* the claims app / MITWS sheets: closed the way their own ✕ does */ await tap(c, '#gc-fh-tabs [data-t="home"]'); await H.waitFor(c, () => !!document.querySelector('#_gcJobPick .gc-pmf'), null, 8000);
  /* something that opened late (a sheet, the 👁 View as list) and still sits over the dashboard: closed, as its own ✕ would */
  await sleep(300); await c.ev(() => { const q = document.querySelector('#_gcJobPick .gc-pmf-q button'); if (!q) return; const r = q.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (!e || e.closest('#_gcJobPick')) return; let top = e; while (top.parentElement && top.parentElement !== document.body) top = top.parentElement; if (top !== document.body && !/^(gc-fh-tabs|_gcJobPick)$/.test(top.id)) top.remove(); }); };
const readBar = c => c.ev(() => { const t = document.getElementById('gc-fh-tabs'); const kids = [...t.querySelectorAll(':scope > [data-t]')]; const h = t.querySelector('[data-t="home"]'), a = t.querySelector('[data-t="appr"]');
  return { keys: kids.map(b => b.getAttribute('data-t')), homeIdx: kids.indexOf(h), homeE: h ? Math.round(h.querySelector('.e').getBoundingClientRect().height) : 0, otherE: Math.round((kids.find(b => b !== h && b !== a) || h).querySelector('.e,.c').getBoundingClientRect().height), apprBadge: !!(a && a.querySelector('#gc-fh-badge')), apprFirst: kids[0] === a, homeIc: h ? h.querySelector('.e').firstChild.textContent.trim() : '' }; });
const dash = c => c.ev(() => { const d = document.querySelector('#_gcJobPick .gc-pmf'); if (!d) return null;
  const secs = [...d.querySelectorAll('.fh-sec > span')].map(x => x.textContent);
  return { app: d.getAttribute('data-pmf-app'), secs, today: [...d.querySelectorAll('.gc-pmf-today [data-pmf-a="item"]')].map(b => b.getAttribute('data-id')),
    quick: [...d.querySelectorAll('.gc-pmf-q [data-pmf-a]')].map(b => b.getAttribute('data-pmf-a')), quickH: Math.min(...[...d.querySelectorAll('.gc-pmf-q button')].map(b => b.getBoundingClientRect().height)),
    extra: [...d.querySelectorAll('.gc-pmf-x [data-ra-a]')].map(b => b.getAttribute('data-ra-a')), nums: [...d.querySelectorAll('.gc-pmf-n')].map(b => b.getAttribute('data-k') + '=' + b.querySelector('b').textContent),
    need: d.querySelector('.gc-pmf-need') ? d.querySelector('.gc-pmf-need').innerText : '', apHtml: (d.querySelector('.gc-pmf-ap') || {}).innerText || '',
    order: ['.gc-pmf-today,.fh-empty', '.gc-pmf-q', '.gc-pmf-need', '.gc-pmf-nums'].map(s => { const e = d.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + d.scrollTop) : -1; }),
    text: document.querySelector('#_gcJobPick .fh-wrap').innerText }; });
const jobPage = async (c, pid) => {
  await c.ev(id => { try { if (window._gcClaims && window._gcClaims.close) window._gcClaims.close(); } catch (e) {} document.querySelectorAll('#_gcJobPick,._gcSheetOv,.gc-ra-sheet,.gcfp-sheet,#_gcJobDash,.gcbb-ov,#gc-mws-sheet').forEach(o => o.remove()); window._gcJobDashboard(id); }, pid);
  await H.waitFor(c, () => !!document.querySelector('#_gcJobDash .gcfp-grid[data-fm-kind]'), null, 10000); await sleep(1500);
  return c.ev(() => { const g = document.querySelector('#_gcJobDash .gcfp-grid'); const key = b => b.getAttribute('data-fm') || b.getAttribute('data-fp') || b.getAttribute('data-fn') || (b.classList.contains('gc-pmf-jt') ? 'pmf:' + (b.getAttribute('data-bid') || b.getAttribute('data-pmf-a')) : b.className);
    return { kind: g.getAttribute('data-fm-kind'), top: [...g.children].filter(x => x.tagName === 'BUTTON' && !x.classList.contains('gcfm-ov') && !x.hasAttribute('data-fm-more')).map(key), label: (g.previousElementSibling || {}).textContent }; });
};
async function tileOpens(c, pid, k){
  await jobPage(c, pid);
  const sel = /^pmf:/.test(k) ? '#_gcJobDash .gc-pmf-jt[data-' + (k === 'pmf:tktype' ? 'pmf-a="tktype"' : 'bid="' + k.slice(4) + '"') + ']' : '#_gcJobDash .gcfp-grid > [data-fm="' + k + '"], #_gcJobDash .gcfp-grid > [data-fp="' + k + '"], #_gcJobDash .gcfp-grid > [data-fn="' + k + '"]';
  await c.ev(() => { window.__pb = new Set([...document.body.children]); window.__pv = localStorage.getItem('grayco_view'); window.__pjd = document.getElementById('_gcJobDash'); const t = document.getElementById('gc-ra-toast'); if (t) t.style.display = 'none'; });
  await tap(c, sel); await sleep(600);
  const r = await c.ev(() => { const t = [document.getElementById('gc-ra-toast'), document.getElementById('gc-fh-toast')].filter(x => x && x.style.display !== 'none').map(x => x.textContent).join(' | ');
    return { add: [...document.body.children].filter(e => !window.__pb.has(e) && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && !/toast/i.test(e.id + ' ' + e.className) && getComputedStyle(e).display !== 'none').map(e => e.id || e.className).slice(0, 3), view: localStorage.getItem('grayco_view') !== window.__pv, gone: !document.body.contains(window.__pjd), photos: !!(window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open), toast: t }; });
  r.ok = (r.add.length > 0 || r.view || r.photos || r.gone) && !/not on this|did not open|not part of your profile|Not on this job|is not on this phone|not on this phone/i.test(r.toast);
  await c.ev(() => { try { if (window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) window._gcPhotos.close(); } catch (e) {} [...document.body.children].forEach(e => { if (!window.__pb.has(e) && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && getComputedStyle(e).position === 'fixed' && !/toast|gc-fh-tabs/.test(e.id)) e.remove(); }); });
  return r;
}
const cloudSched = () => (H.cget('schedule') || []).filter(Boolean);
/* a save reaches the database within seconds (patch SAVES paces uploads of the same list): wait for it, up to 25 s */
const until = async (fn, ms) => { const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 25000)) { try { v = fn(); } catch (e) { v = null; } if (v) return v; await sleep(500); } try { return fn(); } catch (e) { return null; } };
const proj1 = id => (H.cget('projects') || []).find(p => p.id === id) || {};
const visibleSick = c => c.ev(() => [...document.querySelectorAll('[data-to-a="sick"],[data-to-a="late"],[data-pmf-a="to"][data-v="sick"],[data-pmf-a="to"][data-v="late"]')].filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none').length);

try {
  /* ════ PM ════ */
  console.log('B. PM on an iPhone');
  const pm = await phone(PM, 'PM');
  const b1 = await readBar(pm);
  ok(b1.keys.join() === 'appr,jobs,home,ra-sched,more', 'PM bar: ✅ Approvals · My Jobs · 🏠 Home · 📅 My Schedule · More', b1);
  ok(await pm.ev(() => { const b = document.createElement('div'); b.id = 'gcp-banner'; document.body.appendChild(b); const h = getComputedStyle(b).display === 'none'; b.remove(); return h; }), 'the ⏸ Data-entry mode pill is not shown on the phone');
  ok(b1.apprFirst && b1.apprBadge, 'PM: ✅ Approvals is bottom-left and keeps its count badge', b1);
  ok(b1.homeIdx === 2 && b1.homeE >= 56 && b1.homeE > b1.otherE + 20 && b1.homeIc === '🏠', 'PM: 🏠 Home is the big middle button', b1);
  const d1 = await dash(pm);
  console.log('    PM home: ' + JSON.stringify({ secs: d1 && d1.secs, today: d1 && d1.today, quick: d1 && d1.quick, extra: d1 && d1.extra, nums: d1 && d1.nums }));
  ok(d1 && d1.app === 'pm', 'PM: 🏠 Home is the dashboard', d1);
  ok(d1 && d1.today.includes('SCHa') && !d1.today.includes('SCHb'), 'PM Today: the work on my job today, not another PM\'s job', d1 && d1.today);
  ok(d1 && d1.quick.join() === 'appt,work,update,photo,receipt,clock,lead,sched', 'PM quick actions in order: New appointment · Schedule work · Update job · Photo · 🧾 Snap a receipt · Clock · New lead · My Schedule (💬 Messages is on each job page)', d1 && d1.quick);
  ok(d1 && d1.quickH >= 72, 'PM: the quick actions are big tap targets (≥ 72 px)', d1 && d1.quickH);
  ok(d1 && ['log', 'todo'].every(k => d1.extra.includes(k)) && !d1.extra.includes('punch') && !d1.extra.includes('msgs') && !d1.extra.includes('money'), 'PM: 📒 Daily log · ☑ To-dos on Home; ☐ Punch / 💬 Messages are on the job page, not Home', d1 && d1.extra);
  ok(d1 && /Bids due|bids? due/i.test(d1.need), 'PM Needs you: ⏰ Bids due', d1 && d1.need);
  ok(d1 && /Today/.test(d1.secs[0]) && d1.secs.some(x => /Needs you/.test(x)) && d1.secs.some(x => /This week/.test(x)) && d1.order.every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1])), 'PM: Today → quick actions → Needs you → This week, in that order', d1 && { s: d1.secs, o: d1.order });
  ok(d1 && /1 overdue follow-up/.test(d1.need), 'PM Needs you: the overdue lead follow-up', d1 && d1.need);
  ok(d1 && d1.nums.length === 6 && d1.nums.some(x => /^jobs=2$/.test(x)), 'PM This week: my numbers (my 2 active jobs …)', d1 && d1.nums);
  ok(d1 && !/clock in to|haven.?t clocked|log your hours|timesheet (is )?(due|missing|overdue)|forgot to clock/i.test(d1.text) && /Optional/.test(d1.text), 'PM: no clock / hours nag — ⏱ is marked optional', d1 && d1.text.slice(0, 400));
  ok(await pm.ev(() => document.documentElement.classList.contains('gc-pmf-comm')) && (await visibleSick(pm)) === 0, 'PM (commission): no 🤒 Call in sick / ⏰ Running late on Home');
  await pm.page().screenshot({ path: SHOTS + 'pm_home.png' });
  await pm.page().screenshot({ path: SHOTS + 'pm_home_full.png', fullPage: true }).catch(() => {});

  // My Schedule (one place): see, add, time off
  await tap(pm, '.gc-pmf [data-pmf-a="sched"]');
  const ms = await pm.ev(() => { const o = document.querySelector('.gc-pmf-sheet[data-pmf-sheet="sched"]'); return o ? { items: [...o.querySelectorAll('[data-pmf-a="item"]')].map(b => b.getAttribute('data-id')), add: !!o.querySelector('[data-pmf-a="appt"]') && !!o.querySelector('[data-pmf-a="work"]'), to: [...o.querySelectorAll('[data-pmf-a="to"]')].map(b => b.getAttribute('data-v')), clock: (o.querySelector('.gc-pmf-to [data-pmf-a="clock"]') || {}).textContent } : null; });
  ok(ms && ms.items.includes('SCHa') && ms.add, '📅 My Schedule: today\'s list + ＋ New appointment + ＋ Schedule work on one screen', ms);
  ok(ms && ms.to.includes('off') && !ms.to.includes('sick') && !ms.to.includes('late') && /optional/i.test(ms.clock || ''), 'My Schedule (PM): 🏖 Time off, no 🤒 sick / ⏰ late, ⏱ Log my day (optional)', ms);
  await tap(pm, '.gc-pmf-sheet [data-pmf-a="v"][data-v="week"]');
  ok(await pm.ev(() => !!document.querySelector('.gc-pmf-sheet[data-view="week"] [data-id="SCHc"]')), 'My Schedule Week: the walkthrough in 2 days');
  await pm.ev(() => { try { window._gcTimeOff.open(); } catch (e) {} }); await sleep(600);
  ok((await visibleSick(pm)) === 0, 'PM: patch TIMEOFF\'s own My schedule sheet hides 🤒 / ⏰ too');
  await pm.ev(() => document.querySelectorAll('.gc-to-ov,.gc-ra-sheet').forEach(o => o.remove()));

  // 📅 New appointment — from Home, a lead, tomorrow 10:30
  await home(pm);
  await tap(pm, '.gc-pmf [data-pmf-a="appt"]');
  const f1 = await pm.ev(() => { const o = document.querySelector('.gc-pmf-sheet[data-pmf-sheet="form"]'); return o ? { opts: [...o.querySelectorAll('[data-f="with"] option')].map(x => x.value) } : null; });
  ok(f1 && f1.opts.includes('l:L1') && f1.opts.includes('j:P1') && !f1.opts.includes('j:P3'), 'New appointment: my jobs + my leads (not another PM\'s job)', f1);
  ok(await pm.ev(() => !!document.querySelector('.gc-pmf-sheet [data-seg="ak"] [data-v="Site visit"]')), 'New appointment: 📍 Site visit is one of the appointment types');
  await tap(pm, '.gc-pmf-sheet [data-seg="ak"] [data-v="Inspection"]');
  await pm.page().selectOption('.gc-pmf-sheet [data-f="with"]', 'l:L1');
  await pm.page().fill('.gc-pmf-sheet [data-f="date"]', ymd(1));
  await pm.page().fill('.gc-pmf-sheet [data-f="time"]', '10:30');
  await pm.page().fill('.gc-pmf-sheet [data-f="notes"]', 'Bring the moisture meter');
  await pm.page().screenshot({ path: SHOTS + 'pm_new_appt.png' });
  await tap(pm, '.gc-pmf-sheet [data-pmf-a="save"]'); await sleep(1500);
  const ap = await until(() => cloudSched().find(x => x.leadId === 'L1' && x.type === 'appointment'));
  ok(!!ap && ap.date === ymd(1) && ap.time === '10:30 AM' && ap.assignee === 'Demo PM' && /^Inspection — Lead Person A/.test(ap.title) && ap.scope === 'company', 'the appointment is saved to the database (cloud schedule): Inspection — Lead Person A, tomorrow 10:30 AM, for Demo PM', ap);
  ok(await pm.ev(id => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="sched"] [data-id="' + id + '"]'), ap && ap.id), 'after Save, My Schedule opens on that day with it');
  ok(cloudSched().some(x => x.id === 'SCHa') && cloudSched().some(x => x.id === 'SCHb'), 'nothing else on the schedule was lost');

  // the Desk (a second browser, same cloud)
  const desk = await H.computer('DESK', { build }); OPEN.push(desk);
  await H.signIn(desk, NICK, 9000);
  const onDesk = await H.waitFor(desk, id => (window._crm && window._crm.schedule || []).some(x => x && x.id === id), ap && ap.id, 40000);
  ok(!!onDesk, 'the Desk (Nick on a computer) has the appointment on its schedule', ap && ap.id);
  await desk.ev(() => { try { window._setView('schedule'); } catch (e) {} }); await sleep(2500);
  await desk.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /^\s*👁\s*Everything/.test(x.textContent)); if (b) b.click(); }); await sleep(1200);   /* the Desk opens on "My Schedule" (Nick's own); the PM's appointment is under Everything */
  const deskTxt = await desk.ev(() => (document.querySelector('main') || document.body).innerText);
  ok(/Inspection — Lead Person A|Lead Person A/.test(deskTxt), 'the Desk\'s 📅 Schedule screen shows it', deskTxt.slice(0, 300));
  await desk.page().screenshot({ path: SHOTS + 'desk_schedule.png' });

  // edit / move it (+3 days) and cancel another
  await home(pm);
  await pm.ev(id => window._gcPmField.item(id), ap && ap.id); await sleep(500);
  ok(await pm.ev(() => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="form"] [data-pmf-a="cancel"]')), 'tapping my appointment opens it to edit (with 🗑 Cancel)');
  await pm.page().fill('.gc-pmf-sheet [data-f="date"]', ymd(3));
  await pm.page().fill('.gc-pmf-sheet [data-f="time"]', '13:15');
  await tap(pm, '.gc-pmf-sheet [data-pmf-a="save"]'); await sleep(1500);
  const ap2 = await until(() => cloudSched().find(x => ap && x.id === ap.id && x.date === ymd(3)));
  ok(ap2 && ap2.date === ymd(3) && ap2.time === '1:15 PM' && ap2.leadId === 'L1', 'moved: the same item, the new date and time in the database', ap2);
  await pm.ev(() => window._gcPmField.item('SCHc')); await sleep(400);
  await tap(pm, '.gc-pmf-sheet [data-pmf-a="cancel"]'); await sleep(1500);
  ok(await until(() => !cloudSched().some(x => x.id === 'SCHc')), 'cancelled: the walkthrough is off the schedule in the database');

  // 🛠 Schedule work — a sub, 4 work days on my job
  await home(pm);
  await tap(pm, '.gc-pmf [data-pmf-a="work"]');
  const wf = await pm.ev(() => [...document.querySelectorAll('.gc-pmf-sheet [data-f="with"] option')].map(x => x.value));
  ok(wf.includes('j:P1') && wf.includes('j:P2') && !wf.includes('j:P3'), 'Schedule work: only my jobs', wf);
  const start = (() => { let d = 1; while (new Date(ymd(d) + 'T12:00:00').getDay() !== 1) d++; return d; })();   /* next Monday */
  await pm.page().selectOption('.gc-pmf-sheet [data-f="with"]', 'j:P1');
  await pm.page().selectOption('.gc-pmf-sheet [data-f="sub"]', 'S1'); await sleep(200);
  ok((await pm.ev(() => document.querySelector('.gc-pmf-sheet [data-f="title"]').value)) === 'Drywall', 'picking the sub fills its trade as the task');
  await pm.page().fill('.gc-pmf-sheet [data-f="title"]', 'Hang drywall');
  await pm.page().fill('.gc-pmf-sheet [data-f="date"]', ymd(start));
  await pm.page().fill('.gc-pmf-sheet [data-f="end"]', ymd(start + 3));
  await tap(pm, '.gc-pmf-sheet [data-pmf-a="save"]'); await sleep(1600);
  const wk = (await until(() => { const l = cloudSched().filter(x => x.pid === 'P1' && x.subId === 'S1' && x.title === 'Hang drywall'); return l.length === 4 ? l : null; })) || [];
  ok(wk.length === 4 && new Set(wk.map(x => x.groupId)).size === 1 && wk.every(x => x.vendor === 'Demo Drywall Co' && x.type === 'work'), 'the work is saved: 4 work days, one group, the sub as the vendor', wk.map(x => [x.date, x.groupId]));
  const scOf = () => pm.ev(() => { try { return (window._gcSubConfirm.list() || []).map(x => JSON.stringify(x)).join(' '); } catch (e) { return 'ERR ' + e.message; } });
  let sc = await scOf(); for (let i = 0; i < 20 && !/Demo Drywall|"S1"/.test(sc); i++) { await sleep(1000); sc = await scOf(); }
  ok(/P1/.test(sc) && /S1|Demo Drywall/.test(sc), 'patch SUBCONFIRM offers the sub on that job (👷 Confirm list)', sc.slice(0, 300));
  // move all 4 days by one day
  await H.waitFor(pm, () => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="sched"]'), null, 8000);
  await pm.ev(id => window._gcPmField.item(id), wk.sort((a, b) => a.date < b.date ? -1 : 1)[0].id); await sleep(400);
  await H.waitFor(pm, () => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="form"] [data-f="date"]'), null, 8000);
  ok(await pm.ev(() => !!document.querySelector('.gc-pmf-sheet [data-f="allg"]:checked')), 'a multi-day work item: "All 4 days" is offered (ticked)');
  await pm.page().fill('.gc-pmf-sheet [data-f="date"]', ymd(start + 1));
  const FM0 = await pm.ev(() => { const o = document.querySelector('.gc-pmf-sheet[data-pmf-sheet="form"]'); return o ? { n: document.querySelectorAll('.gc-pmf-sheet').length, d: o.querySelector('[data-f="date"]').value, x: o.__pmf && o.__pmf.x && o.__pmf.x.date, g: o.__pmf && o.__pmf.grp ? o.__pmf.grp.map(y => y.date).join(',') : '', allg: (o.querySelector('[data-f="allg"]') || {}).checked } : null; });
  const T_MOVE = Date.now();
  await tap(pm, '.gc-pmf-sheet [data-pmf-a="save"]'); await sleep(1500);
  FM0.after = await pm.ev(() => ({ err: (document.querySelector('.gc-pmf-sheet [data-f="err"]') || {}).textContent, toast: (document.getElementById('gc-ra-toast') || {}).textContent, sheet: (document.querySelector('.gc-pmf-sheet') || { getAttribute: () => '' }).getAttribute('data-pmf-sheet') }));
  const wk2 = (await until(() => { const l = cloudSched().filter(x => wk[0] && x.groupId === wk[0].groupId).map(x => x.date).sort(); return l[0] === ymd(start + 1) ? l : null; })) || cloudSched().filter(x => wk[0] && x.groupId === wk[0].groupId).map(x => x.date).sort();
  ok(wk2.length === 4 && wk2[0] === ymd(start + 1), 'moved: all 4 days moved together', { FM0, wk2, writes: H.writes.filter(w => w.key === 'schedule' && w.at > T_MOVE).map(w => [w.at - T_MOVE, (Array.isArray(w.value) ? w.value : (() => { try { return JSON.parse(w.value); } catch (e) { return []; } })()).filter(x => x && wk[0] && x.groupId === wk[0].groupId).map(x => x.date.slice(5)).join(',')]) });

  // a PM cannot touch another PM's job
  const perm = await pm.ev(() => ({ b: window._gcPmField.canEdit('SCHb'), a: window._gcPmField.canEdit('SCHa') }));
  ok(perm.a === true && perm.b === false, 'a PM changes the items on his jobs, not another PM\'s', perm);
  await pm.ev(() => window._gcPmField.item('SCHb')); await sleep(400);
  ok(await pm.ev(() => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="view"]') && !document.querySelector('.gc-pmf-sheet [data-pmf-a="save"]')), 'another PM\'s item opens read-only');

  // ✏️ Update job in 3 taps
  await home(pm);
  let taps = 0;
  await tap(pm, '.gc-pmf [data-pmf-a="update"]'); taps++;
  if (await pm.ev(() => !!document.querySelector('.gc-ra-sheet [data-pj="P2"]'))) { await tap(pm, '.gc-ra-sheet [data-pj="P2"]'); taps++; }
  ok(await pm.ev(() => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="update"]')), 'Update job: the one screen opens (stage · % · note · photo · next step)');
  await pm.page().selectOption('.gc-pmf-sheet [data-f="stage"]', 'Punch List');
  await pm.page().fill('.gc-pmf-sheet [data-f="note"]', 'Shingles done, gutters next');
  await pm.page().fill('.gc-pmf-sheet [data-f="next"]', 'Gutter install');
  await pm.page().fill('.gc-pmf-sheet [data-f="nextd"]', ymd(4));
  await pm.page().screenshot({ path: SHOTS + 'pm_update_job.png' });
  await tap(pm, '.gc-pmf-sheet [data-pmf-a="usave"]'); taps++; await sleep(2500);
  const p2 = (await until(() => proj1('P2').status === 'Punch List' ? proj1('P2') : null)) || proj1('P2');
  ok(taps <= 3 && p2.status === 'Punch List' && (p2.updates || [])[0] && p2.updates[0].text === 'Shingles done, gutters next' && p2.nextStep === 'Gutter install', 'Update job in ' + taps + ' taps from Home: stage + note + next step saved on the job (database)', { taps, st: p2.status, u: p2.updates, n: p2.nextStep });

  // 🧾 Snap a receipt: Home → the expense form → saved to the database; and on the job page, for that job
  await home(pm); await tap(pm, '.gc-pmf [data-pmf-a="receipt"]');
  ok(!!(await H.waitFor(pm, () => !!document.getElementById('_gcLogExpOv'), null, 6000)), '🧾 Snap a receipt (Home) opens the expense form');
  await pm.ev(() => { const o = document.getElementById('_gcLogExpOv'); const j = o.querySelector('#_leJob'); j.value = 'P1'; j.dispatchEvent(new Event('change', { bubbles: true })); o.querySelector('#_leStore').value = 'Sample Lumber'; o.querySelector('#_lePrice').value = '42.50'; });
  await pm.ev(() => document.querySelector('#_gcLogExpOv #_leSave').click()); await sleep(1500);
  const ex = await until(() => (H.cget('expenses') || []).find(x => x && x.pid === 'P1' && x.vendor === 'Sample Lumber' && +x.amt === 42.5));
  ok(!!ex, '🧾 the receipt is saved on the job (expenses in the database)', (H.cget('expenses') || []).slice(-2));
  await pm.ev(() => document.querySelectorAll('#_gcLogExpOv').forEach(o => o.remove()));
  const jp1 = await jobPage(pm, 'P1');
  ok(jp1.top.includes('receipt'), 'the job page has 🧾 Snap a receipt', jp1.top);
  await tap(pm, '#_gcJobDash .gcfp-grid > [data-fm="receipt"]');
  ok(await H.waitFor(pm, () => { const o = document.getElementById('_gcLogExpOv'); return !!o && o.querySelector('#_leJob').value === 'P1'; }, null, 6000), 'the job page\'s 🧾 opens the expense form on THIS job');
  await pm.ev(() => document.querySelectorAll('#_gcLogExpOv,#_gcJobDash').forEach(o => o.remove()));
  // every quick tile and bar button opens something; Home brings the dashboard back
  const tryOpen = async (sel) => {
    await pm.ev(() => { window.__pv = localStorage.getItem('grayco_view'); window.__pb = new Set([...document.body.children]); const t = document.getElementById('gc-ra-toast'); if (t) t.style.display = 'none'; });
    await tap(pm, sel); await sleep(500);
    const r = await pm.ev(() => { const add = [...document.body.children].filter(e => !window.__pb.has(e) && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && !/toast/i.test(e.id + ' ' + e.className) && getComputedStyle(e).display !== 'none').map(e => e.id || e.className);
      const t = document.getElementById('gc-ra-toast'); return { add, view: localStorage.getItem('grayco_view') !== window.__pv, home: !document.querySelector('#_gcJobPick.gc-fh'), toast: t && t.style.display !== 'none' ? t.textContent : '', photos: !!(window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) }; });
    r.ok = (r.add.length > 0 || r.view || r.photos || r.home) && !BAD_TOAST.test(r.toast);
    await home(pm); return r;
  };
  const tiles = ['appt', 'work', 'update', 'photo', 'receipt', 'clock', 'lead', 'sched'];
  const tr = []; for (const k of tiles) tr.push([k, await tryOpen('.gc-pmf [data-pmf-a="' + k + '"]')]);
  ok(tr.every(x => x[1].ok), 'PM: every quick tile opens its screen (' + tiles.join(', ') + ')', tr.filter(x => !x[1].ok));
  const br = []; for (const k of ['appr', 'jobs', 'ra-sched', 'more']) br.push([k, await tryOpen('#gc-fh-tabs [data-t="' + k + '"]')]);
  await tap(pm, '#gc-fh-tabs [data-t="ra-sched"]');
  ok(await pm.ev(() => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="sched"]')), 'the bar\'s 📅 My Schedule opens My Schedule');
  await home(pm);
  // ☰ More from Home: the less-than-daily things
  await tap(pm, '#gc-fh-tabs [data-t="more"]');
  const mo = await pm.ev(() => { const o = [...document.querySelectorAll('.gc-fh-sheet[data-ra-more]')].pop(); return o ? { less: [...o.querySelectorAll('[data-pmf-a^="m-"]')].map(b => b.getAttribute('data-pmf-a')), grid: !!o.querySelector('.gc-fm-g'), photos: !!o.querySelector('[data-m="photos"]'), rows: [...o.querySelectorAll('.pick > [data-ra-a], .pick > [data-m]')].map(b => b.getAttribute('data-ra-a') || b.getAttribute('data-m')) } : null; });
  console.log('    PM More: ' + JSON.stringify(mo));
  ok(mo && !mo.grid && !mo.photos && ['m-forms', 'm-help'].every(k => mo.less.includes(k)) && !mo.rows.some(k => ['camera', 'sched', 'log', 'punch', 'msgs', 'receipt', 'todo'].includes(k)), 'PM ☰ More: only the less-than-daily things (training · paperwork · help · office rows · settings), nothing that is on Home', mo);
  const lr = []; for (const k of (mo ? mo.less : [])) { await home(pm); await tap(pm, '#gc-fh-tabs [data-t="more"]'); lr.push([k, await tryOpen('.gc-fh-sheet[data-ra-more] [data-pmf-a="' + k + '"]')]); }
  ok(lr.length && lr.every(x => x[1].ok), 'PM: every Less often row opens its screen', lr.filter(x => !x[1].ok));
  ok(br.every(x => x[1].ok), 'PM: every bar button opens its screen; 🏠 Home brings the dashboard back each time', br.filter(x => !x[1].ok));
  ok(await pm.ev(() => !!document.querySelector('#_gcJobPick .gc-pmf') && !document.querySelector('.gc-ra-sheet,.gc-fh-sheet,.gcfp-sheet')), 'PM: no stuck overlay after Home');

  // reload: it is all still there
  await pm.goto(); await H.waitFor(pm, () => !!document.querySelector('#_gcJobPick .gc-pmf'), null, 45000); await sleep(1500);
  const rl = await pm.ev(id => ({ has: (window._crm.schedule || []).some(x => x && x.id === id), gone: !(window._crm.schedule || []).some(x => x && x.id === 'SCHc') }), ap && ap.id);
  ok(rl.has && rl.gone, 'reload: the moved appointment is there, the cancelled one stays gone', rl);
  ok(!pm.errs.length, 'PM: no page errors', pm.errs.slice(0, 4));
  await pm.close();

  if (process.env.PMFIELD_PART === 'pm') throw new Error('stopped after the PM part (PMFIELD_PART=pm)');
  /* ════ Nick (admin) ════ */
  console.log('B. Nick (admin) on an iPhone');
  const nk = await phone(NICK, 'NICK');
  const b2 = await readBar(nk);
  ok(b2.keys.join() === 'appr,jobs,home,ra-sched,more' && b2.apprBadge && b2.homeIdx === 2 && b2.homeE >= 56, 'Nick bar: ✅ Approvals (count) · Jobs · 🏠 Home (big, middle) · 📅 My Schedule · More', b2);
  const d2 = await dash(nk);
  console.log('    Nick home: ' + JSON.stringify({ secs: d2 && d2.secs, today: d2 && d2.today, extra: d2 && d2.extra, nums: d2 && d2.nums }));
  ok(d2 && d2.app === 'admin' && d2.today.includes('SCHa') && d2.today.includes('SCHb'), 'Nick Today: the company\'s day (every job)', d2 && d2.today);
  ok(d2 && ['leads', 'viewas', 'systems'].every(k => d2.extra.includes(k)) && !d2.extra.includes('money'), 'Nick: the admin tiles are on Home (💵 Money is in ☰ More)', d2 && d2.extra);
  const close = d2 && (d2.nums.find(x => /^close=/.test(x)) || '');
  ok(close === 'close=67%', 'Close rate (res + ins): jobs made from leads are won, stale clean-ups and commercial bids are left out (2 won · 1 lost = 67%)', d2 && d2.nums);
  ok(d2 && /Close rate \(res \+ ins\)/i.test(d2.text), 'the tile says the close rate is residential + insurance');
  ok(d2 && !/Make portal/.test(d2.text) && /Customer portal/.test(d2.text), 'job cards: one clear "Customer portal" (no "Make portal")');
  await nk.page().screenshot({ path: SHOTS + 'nick_home.png' });
  // every number opens its list
  const nl = [];
  for (const k of ['newWeek', 'close', 'jobs', 'collected', 'ar', 'bids']) {
    await home(nk); await tap(nk, '.gc-pmf [data-pmf-a="num"][data-k="' + k + '"]');
    nl.push([k, await nk.ev(() => { const o = document.querySelector('.gc-pmf-sheet[data-pmf-sheet="list"]'); return o ? { t: o.querySelector('.hd b').textContent, n: o.querySelectorAll('.gc-ra-item').length } : null; })]);
  }
  console.log('    Nick This week lists: ' + JSON.stringify(nl));
  const nv = Object.fromEntries(nl);
  ok(nv.close && /commercial bids left out/.test(nv.close.t), 'the close-rate list says commercial bids are left out', nv.close);
  ok(nv.collected && nv.ar && /Collected/.test(nv.collected.t) && /Owed to us/.test(nv.ar.t), 'Collected / Owed to us open their invoice lists', [nv.collected, nv.ar]);
  ok(nl.every(x => x[1]) && nv.newWeek.n === 2 && nv.close.n === 3 && nv.jobs.n === 5, 'Nick: every This week number opens the list behind it (counts match)', nl);
  // a payroll / commission approval: under Needs you, admin only
  const PAYSET = () => { window.__gcPmfSet0 = window._gcApprovalSet; window._gcApprovalSet = function(){ var r = window.__gcPmfSet0 ? window.__gcPmfSet0() : null; r = r && typeof r === 'object' ? Object.assign({}, r) : {}; r.groups = Object.assign({}, r.groups || {}, { payroll: [{ id: 'pay:09', title: '09 — commission paid, not earned', sub: 'Demo · $4.00', urgency: 'asap' }] }); return r; }; };
  await nk.ev(PAYSET); await nk.ev(() => { window._gcRA.sync(); }); await home(nk); await sleep(1200);
  const d3 = await dash(nk);
  ok(d3 && /commission paid, not earned/.test(d3.apHtml) && d3.order[2] < d3.order[3], 'Nick: the commission approval is under ⚡ Needs you (above This week, not above everything)', d3 && { ap: d3.apHtml.slice(0, 200), o: d3.order });
  // admin schedules work on any job
  await tap(nk, '.gc-pmf [data-pmf-a="work"]');
  ok((await nk.ev(() => [...document.querySelectorAll('.gc-pmf-sheet [data-f="with"] option')].map(x => x.value))).includes('j:P3'), 'Nick: Schedule work offers every job');
  // 📋 Copy portal link
  await nk.ev(() => { document.querySelectorAll('.gc-ra-sheet').forEach(o => o.remove()); window._gcFP.cust('P1'); }); await sleep(400);
  ok(await nk.ev(() => !!document.querySelector('.gcfp-sheet [data-c="copy"]')), '👤 Customer portal (a job with a link): 📋 Copy portal link');
  // every quick tile + bar button for Nick
  const tryN = async (sel, keep) => { if (!keep) await home(nk); const e0 = nk.errs.length; await nk.ev(() => { window.__pb = new Set([...document.body.children]); window.__pv = localStorage.getItem('grayco_view'); }); await tap(nk, sel); await sleep(500);
    const r = await nk.ev(() => { const t = document.getElementById('gc-ra-toast'); return { add: [...document.body.children].filter(e => !window.__pb.has(e) && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && !/toast/i.test(e.id + ' ' + e.className) && getComputedStyle(e).display !== 'none').length, view: localStorage.getItem('grayco_view') !== window.__pv, home: !document.querySelector('#_gcJobPick.gc-fh'), photos: !!(window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open), toast: t && t.style.display !== 'none' ? t.textContent : '' }; });
    r.ok = (r.add || r.view || r.home || r.photos) && !BAD_TOAST.test(r.toast); await home(nk);
    r.cover = await nk.ev(() => { const b = document.querySelector('#gc-fh-tabs [data-t="more"]'); if (!b) return 'no-more-btn'; const bb = b.getBoundingClientRect(); const e = document.elementFromPoint(bb.x + bb.width / 2, bb.y + bb.height / 2); return e ? (e.closest('#gc-fh-tabs') ? 'ok' : (e.id || e.className || e.tagName) + ' in ' + (((e.parentElement && e.parentElement.closest('[id]')) || {}).id || '')) : 'none'; });
    if (r.cover !== 'ok') console.log('    ⚠ after ' + sel + ' the bar is covered by: ' + r.cover);
    if (nk.errs.length > e0) { r.err = nk.errs.slice(e0); console.log('    ⚠ page error after ' + sel + ': ' + r.err.join(' | ')); }
    return r; };
  const nr = []; for (const k of ['appt', 'work', 'update', 'photo', 'receipt', 'clock', 'lead', 'sched']) nr.push([k, await tryN('.gc-pmf [data-pmf-a="' + k + '"]')]);
  for (const k of (d2 ? d2.extra : [])) nr.push([k, await tryN('.gc-pmf-x [data-ra-a="' + k + '"]')]);
  for (const k of ['appr', 'jobs', 'ra-sched', 'more']) nr.push(['bar:' + k, await tryN('#gc-fh-tabs [data-t="' + k + '"]')]);
  await home(nk); await tap(nk, '#gc-fh-tabs [data-t="more"]');
  if (!(await H.waitFor(nk, () => !!document.querySelector('.gc-fh-sheet[data-pmf-more]'), null, 5000))) { await home(nk); await tap(nk, '#gc-fh-tabs [data-t="more"]'); await H.waitFor(nk, () => !!document.querySelector('.gc-fh-sheet[data-pmf-more]'), null, 5000); }
  const nmo = await nk.ev(() => { const o = [...document.querySelectorAll('.gc-fh-sheet[data-ra-more]')].pop(); return o ? [...o.querySelectorAll('[data-pmf-a^="m-"]')].map(b => b.getAttribute('data-pmf-a')) : []; });
  ok(['m-pause', 'm-help', 'm-money', 'm-jl', 'm-tk'].every(k => nmo.includes(k)), 'Nick ☰ More: Less often has 💵 Money, ⏸ Data-entry mode, 🧩 Job page buttons, 🧪 Environmental job types & buttons, ❓ Help', nmo);
  // the admin edits the environmental types: a new item on the lead checklist
  await home(nk); await nk.ev(() => { document.querySelectorAll('.gc-ra-sheet,.gc-fh-sheet').forEach(o => o.remove()); }); await tap(nk, '#gc-fh-tabs [data-t="more"]'); await tap(nk, '.gc-fh-sheet [data-pmf-a="m-tk"]');
  await nk.ev(() => { const ta = document.querySelector('.gc-pmf-sheet [data-ti="0"] [data-be="items"]'); ta.value += '\nXRF analyzer (rented)'; });
  await tap(nk, '.gc-pmf-sheet [data-pmf-a="tkesave"]'); await sleep(1500);
  const tk = await until(() => H.cget('gc_env_jobtypes'));
  ok(tk && tk.types && tk.types[0].buttons[0].items.some(i => i.t === 'XRF analyzer (rented)') && tk.types.length === 4, 'Nick: the environmental types & buttons are the company\'s list (saved to the database) — a new lead item', tk && tk.types && tk.types[0].buttons[0].items.slice(-2));
  // the admin changes the Mitigation job page's top buttons
  await home(nk); await tap(nk, '#gc-fh-tabs [data-t="more"]'); await tap(nk, '.gc-fh-sheet [data-pmf-a="m-jl"]');
  await nk.ev(() => { const i = document.querySelector('.gc-pmf-sheet [data-jl="mit"]'); i.value = 'photo, dry, equip, log'; });
  await tap(nk, '.gc-pmf-sheet [data-pmf-a="jlsave"]'); await sleep(1200);
  const jl = await until(() => H.cget('gc_field_layouts'));
  ok(jl && jl.kinds && jl.kinds.mit && jl.kinds.mit.top.join() === 'photo,dry,equip,log', 'Nick: 🧩 Job page buttons saves the Mitigation top buttons (database)', jl);
  const jn = await jobPage(nk, 'M1');
  ok(jn.top.slice(0, 4).join() === 'photo,dry,equip,log', 'the Mitigation job page follows the admin\'s order', jn.top);
  await nk.ev(() => window._gcFieldMore && 0); H.cset('gc_field_layouts', null);
  await nk.ev(() => { try { localStorage.removeItem('gc_field_layouts'); } catch (e) {} });
  for (const k of nmo) { await home(nk); await tap(nk, '#gc-fh-tabs [data-t="more"]'); nr.push(['more:' + k, await tryN('.gc-fh-sheet[data-ra-more] [data-pmf-a="' + k + '"]', true)]); }
  ok(nr.every(x => x[1].ok), 'Nick: every Home tile and bar button opens its screen; Home comes back (' + nr.map(x => x[0]).join(', ') + ')', nr.filter(x => !x[1].ok));
  ok(!nk.errs.length, 'Nick: no page errors', nk.errs.slice(0, 4));
  await nk.close();
  // the PM does not see the payroll approval
  const pm2 = await phone(PM, 'PM2');
  await pm2.ev(PAYSET); await pm2.ev(() => { window._gcRA.sync(); }); await home(pm2); await sleep(1200);
  const d4 = await dash(pm2);
  ok(d4 && !/commission paid, not earned/.test(d4.text), 'PM: a payroll / commission approval is never on his Home', d4 && d4.apHtml);
  await pm2.close();

  /* ════ Mitigation PM (limited to GrayCo Mitigation) ════ */
  console.log('B. Mitigation PM on an iPhone');
  const mp = await phone(MITPM, 'MITPM');
  const b5 = await readBar(mp);
  ok(b5.keys.join() === 'ra-claims,jobs,home,ra-sched,more' && b5.homeIdx === 2 && b5.homeE >= 56, 'Mitigation PM bar: 💧 Drying · Jobs · 🏠 Home (big, middle) · 📅 My Schedule · More', b5);
  const d5 = await dash(mp);
  console.log('    Mitigation home: ' + JSON.stringify({ secs: d5 && d5.secs, today: d5 && d5.today, extra: d5 && d5.extra, nums: d5 && d5.nums }));
  ok(d5 && d5.app === 'mit' && d5.quick.join() === 'appt,work,update,photo,receipt,clock,lead,sched', 'Mitigation PM: the same Home dashboard and quick actions', d5 && { app: d5.app, q: d5.quick });
  ok(d5 && ['emerg', 'drying', 'equip', 'tpa'].every(k => d5.extra.includes(k)) && !d5.extra.some(k => /^mws_/.test(k)), 'Mitigation Home: 🚨 Emergency / new losses · 💧 Readings due · 🌀 Equipment out · 📆 TPA dates (the drying tools are on each job page)', d5 && d5.extra);
  const eqN = await mp.ev(() => { const b = document.querySelector('.gc-pmf-x [data-ra-a="equip"] .gc-ra-n'); return b ? +b.textContent : 0; });
  console.log('    Mitigation Home: 🌀 Equipment count badge = ' + eqN + ' (the claims app\'s equipmentOut)');
  ok(d5 && d5.today.includes('SCHm') && !d5.today.includes('SCHa') && !d5.today.includes('SCHb'), 'Mitigation Today: the Mitigation job\'s day only (no Construction work)', d5 && d5.today);
  await tap(mp, '.gc-pmf [data-pmf-a="appt"]');
  const mo5 = await mp.ev(() => [...document.querySelectorAll('.gc-pmf-sheet [data-f="with"] option')].map(x => x.value));
  ok(mo5.includes('j:M1') && mo5.includes('j:M2') && !mo5.includes('j:P1') && !mo5.includes('j:P3') && !mo5.includes('j:E1'), 'Mitigation PM: New appointment offers only his Mitigation jobs', mo5);
  await home(mp); await tap(mp, '.gc-pmf [data-pmf-a="work"]');
  await mp.page().selectOption('.gc-pmf-sheet [data-f="with"]', 'j:M2');
  await tap(mp, '.gc-pmf-sheet [data-seg="who"] [data-v="crew"]');
  await mp.page().selectOption('.gc-pmf-sheet [data-f="crew"]', 'Molly Tech');
  await mp.page().fill('.gc-pmf-sheet [data-f="title"]', 'Soot clean-up');
  await mp.page().fill('.gc-pmf-sheet [data-f="date"]', ymd(1));
  await tap(mp, '.gc-pmf-sheet [data-pmf-a="save"]'); await sleep(1500);
  const mw = await until(() => cloudSched().find(x => x.pid === 'M2' && x.title === 'Soot clean-up'));
  ok(mw && mw.companyId === 'mitigation' && mw.assignee === 'Molly Tech', 'Mitigation work is saved with the job\'s company (Mitigation) and the crew', mw);
  await home(mp); await tap(mp, '.gc-pmf [data-pmf-a="update"]');
  if (await mp.ev(() => !!document.querySelector('.gc-ra-sheet [data-pj="M1"]'))) await tap(mp, '.gc-ra-sheet [data-pj="M1"]');
  await mp.page().fill('.gc-pmf-sheet [data-f="note"]', 'Day 3 readings down');
  await tap(mp, '.gc-pmf-sheet [data-pmf-a="usave"]'); await sleep(2500);
  const m1 = (await until(() => (proj1('M1').updates || []).length ? proj1('M1') : null)) || proj1('M1');
  ok((m1.updates || [])[0] && m1.updates[0].text === 'Day 3 readings down', 'Mitigation: Update job saves the note on the job', m1.updates);
  // the mitigation job pages: the insurance water loss (claim) and the fire job
  const jm1 = await jobPage(mp, 'M1');
  console.log('    M1 job page (' + jm1.kind + '): ' + jm1.top.join(', '));
  ok(jm1.kind === 'mit' && /Mitigation/.test(jm1.label || ''), 'M1 (Mitigation, water, claim): the job page is the 💧 Mitigation layout', jm1);
  ok(['dry', 'equip', 'photo', 'log', 'claim', 'papers', 'sched', 'cust'].every(k => jm1.top.includes(k)) && jm1.top.indexOf('dry') === 0 && jm1.top.includes('tpa'), 'M1 top: 💧 Moisture log · 🌀 Equipment · 📸 Photos · 📒 Daily log · 🛡 Claim info · 📋 Paperwork · 📅 Schedule · 👤 Customer portal · 📆 TPA dates', jm1.top);
  await mp.page().screenshot({ path: SHOTS + 'mit_job_page.png' });
  const mt = []; for (const k of jm1.top) mt.push([k, await tileOpens(mp, 'M1', k)]);
  ok(mt.every(x => x[1].ok), 'M1: every top tile opens its screen (' + jm1.top.join(', ') + ')', mt.filter(x => !x[1].ok));
  await home(mp);
  await tap(mp, '#gc-fh-tabs [data-t="ra-sched"]'); await tap(mp, '.gc-pmf-sheet [data-pmf-a="v"][data-v="week"]');
  const mw5 = await mp.ev(() => [...document.querySelectorAll('.gc-pmf-sheet [data-pmf-a="item"]')].map(b => b.getAttribute('data-id')));
  ok(!mw5.some(id => /^SCH[abc]$/.test(id)), 'Mitigation My Schedule: no Construction items', mw5);
  ok(!mp.errs.length, 'Mitigation PM: no page errors', mp.errs.slice(0, 4));
  await mp.close();

  /* ════ Environmental PM ════ */
  console.log('B. Environmental PM on an iPhone');
  H.cset('users', (H.cget('users') || []).map(u => u.id === 'u3' ? Object.assign({}, u, { name: 'Sam Mitig', role: 'Environmental Project Manager', companies: ['environmental'] }) : u));
  const ep = await phone(MITPM, 'ENVPM');
  const b6 = await readBar(ep);
  ok(b6.keys.join() === 'appr,jobs,home,ra-sched,more' && b6.homeIdx === 2, 'Environmental PM bar: ✅ Approvals · Jobs · 🏠 Home · 📅 My Schedule · More', b6);
  const d6 = await dash(ep);
  console.log('    Environmental home: ' + JSON.stringify({ secs: d6 && d6.secs, today: d6 && d6.today, extra: d6 && d6.extra }));
  const et = await ep.ev(() => [...document.querySelectorAll('.gc-pmf-x [data-pmf-a]')].map(b => b.getAttribute('data-pmf-a')));
  ok(d6 && d6.app === 'env' && d6.extra.includes('emerg') && ['labs', 'papers', 'blocked'].every(k => et.includes(k)) && !d6.extra.some(k => /^ews_/.test(k)), 'Environmental Home: 🚨 Emergency leads · 🧪 Lab results pending · 📋 Paperwork waiting · 🚧 Blocked from starting (the env tools are on each job page)', { x: d6 && d6.extra, et });
  const envBtns = await ep.ev(() => [...document.querySelectorAll('#_gcJobPick .gc-pmf button, #gc-fh-tabs button')].map(b => b.textContent).join(' | '));
  ok(d6 && !/trauma/i.test(envBtns) && /Emergency leads/.test(envBtns), 'Environmental Home: one "🚨 Emergency leads" tile (trauma calls inside it) — no "trauma" button', envBtns.slice(0, 400));
  const emN = await ep.ev(() => { const b = document.querySelector('.gc-pmf-x [data-ra-a="emerg"] .gc-ra-n'); return b ? +b.textContent : 0; });
  ok(emN >= 1, '🚨 Emergency leads counts the biohazard call', emN);
  for (const k of ['labs', 'papers', 'blocked']) { await home(ep); await tap(ep, '.gc-pmf-x [data-pmf-a="' + k + '"]'); ok(await ep.ev(() => !!document.querySelector('.gc-pmf-sheet[data-pmf-sheet="list"]')), 'Environmental Home: ' + k + ' opens its list'); }
  // the environmental job page: its top 10 + the buttons of its type (lead, from the job's notes)
  const je = await jobPage(ep, 'E1');
  console.log('    E1 job page (' + je.kind + '): ' + je.top.join(', '));
  ok(je.kind === 'env' && /Environmental/.test(je.label || ''), 'E1 (Environmental, lead paint): the ☢️ Environmental layout', je);
  ok(['papers', 'samples', 'contain', 'air', 'photo', 'log', 'clear', 'waste', 'cust'].every(k => je.top.includes(k)), 'E1 top: 📋 Paperwork · 🧪 Samples · 🚧 Containment · 🌬 Air log · 📸 Photos · 📒 Daily log · ✅ Clearance · 🗑 Waste · 👤 Customer portal', je.top);
  ok(je.top.includes('pmf:lead_eq') && !je.top.includes('pmf:asb_eq') && je.top.includes('pmf:tktype'), 'E1: the lead job\'s own button (🧪 Lead testing equipment) and 🏷 Job type — not the asbestos one', je.top);
  await ep.page().screenshot({ path: SHOTS + 'env_job_page.png' });
  const etr = []; for (const k of je.top) etr.push([k, await tileOpens(ep, 'E1', k)]);
  ok(etr.every(x => x[1].ok), 'E1: every top tile opens its screen', etr.filter(x => !x[1].ok));
  // the lead checklist: tick 2, save on the job
  await jobPage(ep, 'E1'); await tap(ep, '#_gcJobDash .gc-pmf-jt[data-bid="lead_eq"]');
  await ep.ev(() => { const c = [...document.querySelectorAll('.gc-pmf-sheet [data-tk]')]; c[0].click(); c[1].click(); });
  await tap(ep, '.gc-pmf-sheet [data-pmf-a="tksave"]'); await sleep(2500);
  const e1k = (await until(() => proj1('E1').envTestKit)) || null;
  ok(e1k && Object.keys(e1k.checked || {}).length === 2, '🧪 Lead testing equipment: 2 ticked items are saved on the job (database)', e1k);
  // 🏷 Job type: add asbestos → its button shows
  await jobPage(ep, 'E1'); await tap(ep, '#_gcJobDash .gc-pmf-jt[data-pmf-a="tktype"]');
  await ep.ev(() => { const a = document.querySelector('.gc-pmf-sheet [data-tt="asb"]'); if (a && !a.checked) a.click(); const l = document.querySelector('.gc-pmf-sheet [data-tt="lead"]'); if (l && !l.checked) l.click(); });
  await tap(ep, '.gc-pmf-sheet [data-pmf-a="tktsave"]'); await sleep(2500);
  ok(await until(() => JSON.stringify(proj1('E1').envTypes) === '["lead","asb"]'), '🏷 Job type is saved on the job (lead + asbestos)');
  const je2 = await jobPage(ep, 'E1');
  ok(je2.top.includes('pmf:asb_eq') && je2.top.includes('pmf:lead_eq'), 'the job page now has the asbestos button too', je2.top);
  await home(ep); await tap(ep, '#gc-fh-tabs [data-t="ra-sched"]'); await tap(ep, '.gc-pmf-sheet [data-pmf-a="v"][data-v="week"]');
  const ew = await ep.ev(() => [...document.querySelectorAll('.gc-pmf-sheet [data-pmf-a="item"]')].map(b => b.getAttribute('data-id')));
  ok(ew.includes('SCHe') && !ew.includes('SCHm') && !ew.some(id => /^SCH[abc]$/.test(id)), 'Environmental My Schedule: the Environmental job only', ew);
  await home(ep); await tap(ep, '.gc-pmf [data-pmf-a="update"]');
  if (await ep.ev(() => !!document.querySelector('.gc-ra-sheet [data-pj="E1"]'))) await tap(ep, '.gc-ra-sheet [data-pj="E1"]');
  const hz = await ep.ev(() => { try { return (window._gcHazGate.missing((window._crm.projects || []).find(p => p.id === 'E1')) || []).length; } catch (e) { return -1; } });
  await ep.page().selectOption('.gc-pmf-sheet [data-f="stage"]', 'Active');
  await tap(ep, '.gc-pmf-sheet [data-pmf-a="usave"]'); await sleep(1500);
  const e1 = (H.cget('projects') || []).find(p => p.id === 'E1') || {};
  if (hz > 0) ok(e1.status === 'Pending' && await ep.ev(() => /papers must be in the customer/.test((document.querySelector('.gc-pmf-sheet [data-f="err"]') || {}).textContent || '')), 'Environmental: Update job will not start the job while its hazard papers are missing (the Start-job gate, said up front)', { hz, st: e1.status });
  else ok(e1.status === 'Active', 'Environmental: Update job saves the stage (no hazard papers missing in this world)', { hz, st: e1.status });
  ok(!ep.errs.length, 'Environmental PM: no page errors', ep.errs.slice(0, 4));
  await ep.close();

  /* ════ the Office Manager (salary, no commission) ════ */
  console.log('B. Office Manager on an iPhone');
  const of = await phone(OFFICE, 'OFFICE');
  const b3 = await readBar(of);
  ok(b3.keys.join() === 'appr,msgs,home,ra-sched,more' && b3.homeIdx === 2, 'Office bar: ✅ Approvals · Messages · 🏠 Home · 📅 My Schedule · More', b3);
  ok(!(await of.ev(() => document.documentElement.classList.contains('gc-pmf-comm'))), 'Office Manager (salary): not a commission person');
  await of.ev(() => window._gcPmField.open({})); await sleep(500);
  ok(await of.ev(() => !!document.querySelector('.gc-pmf-sheet [data-pmf-a="to"][data-v="sick"]') && !!document.querySelector('.gc-pmf-sheet [data-pmf-a="to"][data-v="late"]')), 'Office Manager: My Schedule offers 🤒 Call in sick and ⏰ Running late');
  ok(!of.errs.length, 'Office: no page errors', of.errs.slice(0, 4));
  await of.close(); await desk.close();
  /* a company-scoped Office Manager (her record names ONE company: Mitigation) — the office@ login itself is the master office login */
  console.log('B. Mitigation Office Manager (one company) on an iPhone');
  H.cset('users', (H.cget('users') || []).map(u => u.id === 'u3' ? Object.assign({}, u, { name: 'Mia Office', role: 'Office Manager', payType: 'salary', companies: ['mitigation'] }) : u));
  const om = await phone(MITPM, 'MITOM');
  const omAll = await om.ev(d => window._gcPmField.mine(d[0], d[1], true), [ymd(0), ymd(6)]);
  ok(omAll.includes('SCHm') && !omAll.some(id => /^SCH[abce]$/.test(id)), 'Office Manager limited to Mitigation: the schedule she sees is Mitigation\'s only', omAll);
  ok(!om.errs.length, 'Mitigation Office Manager: no page errors', om.errs.slice(0, 4));
  await om.close();
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const c of OPEN) await c.close().catch(() => {});
try { const b = OPEN[0] && OPEN[0].b; if (b) await b.close(); } catch (e) {}
console.log(`PMFIELD ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
