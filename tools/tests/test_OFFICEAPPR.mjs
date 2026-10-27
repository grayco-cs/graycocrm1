// test_OFFICEAPPR.mjs <build> [server|browser|all] — patch OFFICEAPPR: the office approves everything except payroll;
// 🚗 employee mileage log → ✅ Approvals → payroll. Made-up names only, no network (in-memory Supabase / Resend; the
// harness's gc_kv is the same store the page and the portal function use).
//  server : the office approves a $10,000 change order, an estimate (PM → admin steps, at the PM step) and a customer
//           e-mail at the PM step; payroll is refused to the office and to a PM (admin only); who / as what is recorded
//  browser: office signed in — the 📋 Approvals tab shows Approve on those items, a customer-facing one asks once, the
//           approval goes through the portal function; no payroll row / approve button; payroll run + week refused;
//           mileage: 2 trips → weekly total at $0.70 → Approvals (not the office's own) → admin approves → payroll line
//           + pay stub "Mileage reimbursement (not taxed)" → marked paid; admin changes the rate; late fees: none added
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { chromium } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright/index.mjs';
import { computer, signIn, sleep, cset, cget, cloud, waitFor, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
const MODE = process.argv[3] || 'all';
const F = path.join(build, 'netlify/functions');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test-key', RESEND_API_KEY: 're-test-key', PORTAL_BASE_URL: 'https://portal.grayco-cs.com', SITE_ORIGIN: 'https://crm.grayco-cs.com,https://app.local', OWNER_EMAILS: 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com' });
delete process.env.PORTAL_MAIL_OFF; delete process.env.PORTAL_AUTO_EMAIL;

const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };

/* ── the fake world ── */
const W = { t: {}, sent: [] };
function tbl(n){ return W.t[n] || (W.t[n] = []); }
function J(status, body){ return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from(JSON.stringify(body)) }; }
function filt(rows, qs){
  for (const [k, v] of qs) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) { const x = decodeURIComponent(v.slice(3)); rows = rows.filter(r => String(r[k]) === x); }
    else if (v.startsWith('in.(')) { const xs = decodeURIComponent(v.slice(4, -1)).split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => xs.includes(String(r[k]))); }
  }
  return rows;
}
const STAFF = [{ email: 'wjohnson@grayco-cs.com', role: 'admin', name: 'Wesley Johnson' }, { email: 'nthomas@grayco-cs.com', role: 'staff', name: 'Nick Thomas' }, { email: 'office@grayco-cs.com', role: 'staff', name: 'Olive Office' }];
global.fetch = async function(url, init = {}){
  const u = new URL(url); const m = (init.method || 'GET').toUpperCase(); const hd = init.headers || {};
  let body = null; try { body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
  if (u.host === 'sb.test') {
    if (hd.apikey !== 'svc-test-key') return J(401, { message: 'no service key' });
    const qs = [...u.searchParams.entries()];
    if (u.pathname === '/rest/v1/gc_staff') return J(200, filt(STAFF.map(x => Object.assign({ active: true }, x)), qs));
    const mt = /^\/rest\/v1\/([a-z_0-9]+)$/.exec(u.pathname); if (!mt) return J(404, {});
    const name = mt[1];
    if (name === 'gc_kv') {
      const rows = [...cloud.values()];
      if (m === 'GET') return J(200, filt(rows, qs).map(x => ({ key: x.key, value: x.value, updated_at: x.updated_at })));
      if (m === 'POST') { (Array.isArray(body) ? body : [body]).forEach(r => cset(r.key, r.value)); return J(201, []); }
      if (m === 'PATCH') { const rs = filt(rows, qs); rs.forEach(r => cset(r.key, body.value !== undefined ? body.value : r.value)); return J(200, rs.map(r => ({ key: r.key, value: cget(r.key), updated_at: cloud.get(r.key).updated_at }))); }
      return J(405, {});
    }
    const rows = tbl(name);
    if (m === 'GET') return J(200, filt(rows, qs).map(x => Object.assign({}, x)));
    if (m === 'POST') { (Array.isArray(body) ? body : [body]).forEach(r => rows.push(Object.assign({}, r))); return J(201, []); }
    if (m === 'PATCH') { const rs = filt(rows, qs); rs.forEach(r => Object.assign(r, body)); return J(200, rs.map(x => Object.assign({}, x))); }
    return J(405, {});
  }
  if (u.host === 'api.resend.com') { W.sent.push(body); return J(200, { id: 'em' + W.sent.length }); }
  if (u.host === 'push.test') return J(201, {});
  throw new Error('BLOCKED network call in a test: ' + url);
};
const CORE = require(path.join(F, 'portal.js'))._core;
const OA = require(path.join(F, '_lib/office-appr.js'));
CORE._webPush = { setVapidDetails(){}, sendNotification: async () => {} };
const queue = () => { const v = cget('gc_approval_queue'); return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const qItem = id => queue().find(x => x.id === id);
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const WHO = { admin: { email: 'wjohnson@grayco-cs.com', role: 'admin', name: 'Wesley Johnson' }, pm: { email: 'nthomas@grayco-cs.com', role: 'staff', name: 'Nick Thomas' }, office: { email: 'office@grayco-cs.com', role: 'staff', name: 'Olive Office' } };
function item(id, kind, steps, extra){
  return Object.assign({ id, kind, title: kind + ' ' + id, jobId: 'J1', jobName: 'Rita Kitchen', pm: 'Nick Thomas', pmEmail: 'nthomas@grayco-cs.com', channel: 'email', to: 'rita@example.com',
    subject: 'About your project', html: '<p>Hello Rita</p>', text: 'Hello Rita', attachments: [], steps, step: steps[0], approvals: [], status: 'waiting', createdAt: ago(1), updatedAt: ago(1), meta: {} }, extra || {});
}
function seed(){
  resetCloud(); W.t = {}; W.sent = [];
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Project Manager', active: true },
    { id: 'u4', name: 'Olive Office', email: 'office@grayco-cs.com', role: 'Office Admin', payType: 'hourly', hourlyRate: 20, active: true },
    { id: 'u3', name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true }]);
  cset('projects', [{ id: 'J1', name: 'Rita Kitchen', client: 'Rita Homeowner', clientEmail: 'rita@example.com', pm: 'Nick Thomas', autoPO: 'R201', type: 'Residential Reno', status: 'active', created: '2026-10-01' },
    { id: 'J2', name: 'Oak Street Roof', client: 'Sam Oak', pm: 'Nick Thomas', autoPO: 'R202', type: 'Residential Roof', status: 'active', created: '2026-10-02' }]);
  cset('cos', [{ id: 'CO10K', pid: 'J1', amt: 10000, desc: 'Add a pantry wall', status: 'pending', created: '2026-10-26', createdAt: ago(2), requiresOwnerApproval: true, requiresSignature: true }]);
  cset('gc_approval_queue', JSON.stringify([
    item('Q_CO', 'sign_change_order', ['pm'], { title: '✍️ Sign change order — Add a pantry wall ($10,000.00)', subject: 'Please sign: change order $10,000', meta: { amount: 10000, coId: 'CO10K', fromPm: true } }),
    item('Q_EST', 'sign_contract', ['pm', 'admin'], { title: '✍️ Sign estimate — Rita Kitchen ($48,000.00)', subject: 'Your estimate to sign', meta: { amount: 48000, estId: 'E1', fromPm: true } }),
    item('Q_MAIL', 'estimate_followup', ['pm'], { title: 'Estimate follow-up e-mail to Rita', subject: 'Checking in on your estimate' }),
    item('Q_PAY', 'payroll_run', ['admin'], { title: 'Payroll run — Oct 30', to: '', jobId: '', meta: { payroll: true } })
  ]));
  cset('gc_office_tasks', JSON.stringify([]));
}

/* ═════════════ 1. the server ═════════════ */
async function serverPart(){
  console.log('── 1. the portal function (approvalAction)');
  seed();
  ok('rule: payroll kinds are payroll; change orders / estimates / e-mails are not', OA.isPayrollKind('payroll_run') && OA.isPayrollKind('pay_stub') && OA.isPayrollItem({ kind: 'x', meta: { payroll: true } }) && !OA.isPayrollKind('sign_change_order') && !OA.isPayrollKind('sign_contract') && !OA.isPayrollKind('estimate_followup'));
  ok('rule: "Office Admin" is the office; "Admin" and "Project Manager" are not', OA.isOfficeUser([{ email: 'o@x', role: 'Office Admin' }], { email: 'o@x', role: 'staff' }) && !OA.isOfficeUser([{ email: 'a@x', role: 'Admin' }], { email: 'a@x', role: 'staff' }) && !OA.isOfficeUser([{ email: 'p@x', role: 'Project Manager' }], { email: 'p@x', role: 'staff' }));
  const act = async (id, who, op) => { CORE._reset(); return CORE.approvalAction({ action: 'approval', op: op || 'approve', id }, who); };
  let r = await act('Q_CO', WHO.office);
  let x = qItem('Q_CO');
  ok('office approves the $10,000 change order (signature e-mail) at the PM step → sent', r.status === 200 && r.out.ok && r.out.sent && x.status === 'sent', [r, x && x.status]);
  ok('… recorded as the office: who, role "office", when', x.approvals.length === 1 && x.approvals[0].role === 'office' && x.approvals[0].email === 'office@grayco-cs.com' && x.approvals[0].by === 'Olive Office' && !!x.approvals[0].at && x.approvals[0].step === 'pm', x.approvals);
  r = await act('Q_EST', WHO.office); x = qItem('Q_EST');
  ok('office approves an estimate (PM → admin steps) at the PM step → done in one approval, like an admin', r.status === 200 && r.out.ok && x.status === 'sent' && x.approvals.length === 1 && x.approvals[0].role === 'office', [r.status, r.out.error, x.status, x.approvals]);
  r = await act('Q_MAIL', WHO.office); x = qItem('Q_MAIL');
  ok('office approves a customer e-mail waiting on the PM (no 24 h wait) → sent to the customer', r.status === 200 && x.status === 'sent' && W.sent.some(m => (m.to || []).includes('rita@example.com') && /Checking in on your estimate/.test(m.subject)), [r.status, r.out.error, x.status]);
  r = await act('Q_PAY', WHO.office); x = qItem('Q_PAY');
  ok('office CANNOT approve payroll: 403 "Wesley or Nick only", nothing recorded', r.status === 403 && /Wesley or Nick only/.test(r.out.error) && x.status === 'waiting' && !x.approvals.length, [r, x.status]);
  r = await act('Q_PAY', WHO.office, 'reject'); ok('… nor stop it (reject) or edit it', r.status === 403 && qItem('Q_PAY').status === 'waiting', r);
  r = await act('Q_PAY', WHO.pm); ok('a PM cannot approve payroll either', r.status === 403 && qItem('Q_PAY').status === 'waiting', r);
  r = await act('Q_PAY', WHO.admin, 'reject'); ok('an admin can (decides the payroll item)', r.status === 200 && qItem('Q_PAY').status === 'rejected' && qItem('Q_PAY').rejectedEmail === 'wjohnson@grayco-cs.com', r);
  /* a PM still approves only his own step; the office's earlier 24-hour rule is gone, the record-only shortcut stays admin */
  seed();
  r = await act('Q_EST', WHO.pm); x = qItem('Q_EST');
  ok('the PM approving the estimate still sends it on to the admin step (unchanged)', r.status === 200 && x.status === 'waiting' && x.step === 'admin', [r, x.step]);
  r = await act('Q_EST', WHO.office); x = qItem('Q_EST');
  ok('the office takes the admin step at once (no 24 h wait) → sent; chain PM → office', r.status === 200 && x.status === 'sent' && x.approvals.map(a => a.role).join('>') === 'pm>office' && !x.escalated, [r.status, r.out.error, x.approvals]);
  CORE._reset(); r = await CORE.approvalAction({ op: 'record', id: 'Q_CO' }, WHO.office);
  ok('"approve as record-only" stays admin-only', r.status === 403, r);
  /* portal-access: a scope to a sub, the office too */
  const PA = fs.readFileSync(path.join(F, 'portal-access.js'), 'utf8');
  ok('portal-access: the office approves a sub scope and the bid site (office-appr check in both places)', (PA.match(/office-appr\.js'\)\.isOfficeUser/g) || []).length === 2);
}

/* ═════════════ 2. the CRM page ═════════════ */
async function browserPart(){
  console.log('── 2. the CRM page');
  seed();
  const mon = (() => { const d = new Date(); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return d.toISOString().slice(0, 10); })();
  const dToday = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  cset('payrollRuns', [{ id: 'RUN1', status: 'pending', from: mon, to: dToday, payDate: dToday, createdAt: ago(3), lines: [{ name: 'Steven Biffle', gross: 1000, net: 800, status: 'pending' }], totals: { net: 800 } }]);
  const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
  process.on('exit', () => { try { shared.close(); } catch (e) {} });
  const route = who => async rt => {
    const req = rt.request(); let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
    if (b.action === 'approval' && b.op !== 'escalate') { CORE._reset(); const a = await CORE.approvalAction(b, WHO[who]); return rt.fulfill({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.out) }); }
    return rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  };
  const O = await computer('O', { build });
  await O.ctx.route(u => new URL(u).pathname === '/.netlify/functions/portal', route('office'));
  try {
    await signIn(O, 'office@grayco-cs.com', 12000);
    const ready = await waitFor(O, () => !!(window._gcOA && window._gcMileage && window._gcAPX && window._gcCustApprovals && (window._crm || {}).users && window._crm.users.length >= 4 && window._gcCustApprovals().all.length >= 4), null, 90000, 500);
    ok('office page ready (OFFICEAPPR + APX + the approvals list)', !!ready);
    const who = await O.ev(() => ({ office: window._gcOA.office(), approver: window._gcOA.approver(), co: window._gcCanApprove({ amt: 10000, createdAt: Date.now() }, 'gc_co_approvals'), inv: window._gcCanApprove({ amt: 90000, createdAt: Date.now() }, 'gc_invoice_approvals'), pay: window._gcCanApprove({ amt: 10 }, 'gc_payroll_approvals') }));
    ok('the office is recognised ("Office Admin"); the old queues: a $10,000 change order and a $90,000 invoice — yes; payroll — no', who.office && who.approver && who.co && who.inv && !who.pay, who);
    await O.ev(() => { window._setView('approvals'); });
    await waitFor(O, () => window._gcAPX.rows().filter(r => /^ap2:/.test(r.key)).length >= 3, null, 30000, 500);
    const rows = await O.ev(() => window._gcAPX.rows());
    const rk = k => rows.find(r => r.key === 'ap2:' + k) || {};
    ok('📋 Approvals (office): Approve on the $10k change order, the estimate and the PM-step e-mail', rk('Q_CO').approve && rk('Q_EST').approve && rk('Q_MAIL').approve, rows.map(r => [r.key, r.approve, r.step]));
    ok('… and NO approve on the payroll item; no payroll-run row', !rk('Q_PAY').approve && !rows.some(r => r.src === 'pay'), rows.map(r => [r.key, r.src, r.approve]));
    /* click Approve on the customer e-mail: it asks once ("This sends it to …"), then approves through the function */
    await O.page().locator('[data-apx-f="pm"]').first().click().catch(() => null);
    const sel = '.apx-row[data-k="ap2:Q_MAIL"] [data-apx-act$="|approve"]';
    await O.page().waitForSelector(sel, { timeout: 20000 }).catch(() => null);
    await O.page().locator(sel).first().click().catch(() => null);
    const conf = await waitFor(O, () => { const c = document.querySelector('.apx-row[data-k="ap2:Q_MAIL"] .apx-conf'); return c ? c.textContent : null; }, null, 8000, 200);
    ok('customer-facing: it asks once — "This sends it to rita@example.com"', /This sends it to rita@example\.com/.test(conf || ''), conf);
    ok('… nothing sent before the yes', qItem('Q_MAIL').status === 'waiting');
    await O.page().locator('.apx-row[data-k="ap2:Q_MAIL"] [data-apx-conf="yes"]').first().click().catch(() => null);
    await waitFor(O, () => true, null, 100); const t0 = Date.now(); while (Date.now() - t0 < 15000 && qItem('Q_MAIL').status !== 'sent') await sleep(300);
    ok('Yes → approved by the office through the portal function, sent', qItem('Q_MAIL').status === 'sent' && qItem('Q_MAIL').approvals[0].role === 'office', qItem('Q_MAIL'));
    const j = await O.ev(() => window._gcApprovalAct('Q_CO', 'approve'));
    ok('office approves the $10k change order from the page → sent', j && j.ok && qItem('Q_CO').status === 'sent', j);
    const jp = await O.ev(() => window._gcApprovalAct('Q_PAY', 'approve'));
    ok('payroll from the page → the server refuses it (403)', jp && !jp.ok && jp.__status === 403 && qItem('Q_PAY').status === 'waiting', jp);
    const pr = await O.ev(() => ({ now: window._gcCanApprovePayrollNow({ status: 'pending', payDate: '2026-01-02', lines: [{ net: 1 }] }), week: (function(){ try { return window._gcApprovePayrollWeek ? window._gcApprovePayrollWeek() : 'none'; } catch (e) { return 'err ' + e.message; } })() }));
    ok('payroll run: the office may not approve it, even on payday; the week sign-off refuses her too', pr.now && pr.now.ok === false && /Wesley or Nick only/.test(pr.now.why) && pr.week === null, pr);

    console.log('── 3. 🚗 mileage');
    const add1 = await O.ev(async ([mon]) => {
      window._gcMileage.open();
      const f = (id, v) => { const e = document.getElementById(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; };
      f('gcmi-date', mon); f('gcmi-from', 'Office'); f('gcmi-to', 'Ferguson supply'); f('gcmi-purpose', 'Pick up fittings'); f('gcmi-miles', '12.5'); f('gcmi-rt', true); f('gcmi-pid', 'J1');
      document.querySelector('[data-mi-add]').click();
      for (let i = 0; i < 40 && !/Logged/.test((document.querySelector('.gcmi-msg') || {}).textContent || '') && !document.querySelector('.gcmi-err'); i++) await new Promise(r => setTimeout(r, 200));
      return { msg: (document.querySelector('.gcmi-msg') || {}).textContent || '', err: (document.querySelector('.gcmi-err') || {}).textContent || '' };
    }, [mon]);
    ok('trip 1 logged on the screen: 12.5 mi round trip = 25 mi × $0.70 = $17.50', /Logged 25 mi = \$17\.50/.test(add1.msg), add1);
    const e2 = await O.ev(([d]) => window._gcMileage.add({ date: d, purpose: 'Bank deposit', odoStart: '1000', odoEnd: '1021.4' }).then(e => e, e => ({ err: e.message })), [dToday]);
    ok('trip 2 by odometer: 1000 → 1021.4 = 21.4 mi = $14.98', e2.miles === 21.4 && e2.amount === 14.98 && e2.rate === 0.7, e2);
    const bad = await O.ev(() => window._gcMileage.add({ purpose: 'x', miles: '' }).then(() => 'saved', e => e.message));
    ok('no miles → refused with a plain message', /Type the miles/.test(bad), bad);
    const wk = await O.ev(async () => { window._gcMileage.close(); window._gcMileage.open(); await new Promise(r => setTimeout(r, 400)); return { now: (document.querySelector('.gcmi-now') || {}).textContent || '', st: window._gcMileage.state() }; });
    const myWeek = (wk.st.weeks || []).find(w => w.emp === 'office@grayco-cs.com' && w.status === 'pending');
    ok('weekly total: 46.4 mi · $32.48 (screen + the week record)', /46\.4 mi · \$32\.48/.test(wk.now) && myWeek && myWeek.miles === 46.4 && myWeek.amount === 32.48 && myWeek.trips === 2, [wk.now, myWeek]);
    const cm = cget('gc_mileage'), cmv = typeof cm === 'string' ? JSON.parse(cm) : cm;
    ok('saved in the cloud (gc_kv gc_mileage): 2 trips, 1 week, the job on trip 1', cmv && cmv.entries.filter(e => !e.deleted).length === 2 && cmv.weeks.length === 1 && cmv.entries.some(e => e.pid === 'J1'), cmv);
    const own = await O.ev(async (id) => ({ items: window._gcMileage.items().length, rows: window._gcAPX.rows().filter(r => /mileage/.test(r.key)).length, err: await window._gcMileage.approve(id).then(() => 'approved!', e => e.message) }), myWeek && myWeek.id);
    ok('the office does NOT get her own mileage to approve, and cannot approve it', own.items === 0 && own.rows === 0 && /approved by an admin/.test(own.err), own);
    await O.ctx.close();

    const A = await computer('A', { build });
    await A.ctx.route(u => new URL(u).pathname === '/.netlify/functions/portal', route('admin'));
    await signIn(A, 'wjohnson@grayco-cs.com', 12000);
    await waitFor(A, () => !!(window._gcMileage && window._gcAPX && (window._crm || {}).users && window._crm.users.length >= 4), null, 90000, 500);
    await A.ev(() => window._gcMileage.load());
    await A.ev(() => { window._setView('approvals'); });
    const arow = await waitFor(A, () => window._gcAPX.rows().find(r => /mileage:/.test(r.key)), null, 30000, 500);
    ok('✅ Approvals (admin): "🚗 Mileage reimbursement — Olive Office, week of …: 46.4 mi = $32.48" with Approve', arow && arow.approve && /Mileage reimbursement — Olive Office, week of .*46\.4 mi = \$32\.48/.test(arow.title), arow);
    const setN = await A.ev(() => (window._gcApprovalSet().groups.other || []).filter(x => /^mileage:/.test(x.id)).length);
    ok('… counted in the one approval set (To-Do chip = APPROVE badge = the tab)', setN === 1, setN);
    await A.page().locator('.apx-row[data-k^="td:mileage:"] [data-apx-act$="|approve"], .apx-row[data-k^="mileage:"] [data-apx-act$="|approve"]').first().click().catch(() => null);
    const t1 = Date.now(); let wv; while (Date.now() - t1 < 15000) { const c = cget('gc_mileage'); wv = (typeof c === 'string' ? JSON.parse(c) : c).weeks[0]; if (wv.status === 'approved') break; await sleep(300); }
    ok('admin approves it (tap Approve in the tab) — logged: Wesley Johnson, admin, when, $32.48', wv.status === 'approved' && wv.approvedBy === 'Wesley Johnson' && wv.approvedRole === 'admin' && !!wv.approvedAt && wv.approvedAmount === 32.48 && wv.log.length === 1, wv);
    const pay = await A.ev(async ([from, to]) => {
      const P = window.__GC_PAY, set = await P.settings();
      const prof = Object.assign(P.blankProfile({ id: 'u4', name: 'Olive Office', email: 'office@grayco-cs.com' }), { payType: 'hourly', hourlyRate: 20 });
      const other = Object.assign({}, prof, { userId: 'zz', name: 'Nobody Else', email: 'nobody@x' });
      const ytd = { gross: 0, ssWages: 0, medWages: 0 };
      const L = await P.computeLine(prof, from, to, set, ytd, 800, {}), L0 = await P.computeLine(other, from, to, set, ytd, 800, {});
      const stub = window._gcPayStubFromLine({ id: 'RUN2', from, to, payDate: to }, L, set, [prof]);
      return { mi: L.mileage, re: L.reimbursement, gross: L.gross, g0: L0.gross, net: L.net, n0: L0.net, fed: L.fed, f0: L0.fed, ss: L.ss, s0: L0.ss, earn: stub.earnings, weeks: L.mileageWeeks, trace: (L.trace || []).map(t => t.label), L };
    }, [mon, dToday]);
    ok('payroll: Olive\'s line carries "Mileage reimbursement" $32.48, not taxed (same gross / taxes, net + $32.48)', pay.mi === 32.48 && pay.re === 32.48 && pay.gross === pay.g0 && pay.fed === pay.f0 && pay.ss === pay.s0 && Math.abs(pay.net - pay.n0 - 32.48) < 0.005 && pay.trace.includes('Mileage reimbursement (not taxed)'), Object.assign({}, pay, { L: undefined }));
    ok('pay stub: "Mileage reimbursement (not taxed)" $32.48 (no second "Reimbursement" line)', pay.earn.some(e => e.label === 'Mileage reimbursement (not taxed)' && e.amount === 32.48) && !pay.earn.some(e => e.label === 'Reimbursement (not taxed)'), pay.earn);
    /* the run is approved by an admin → the week is marked paid (never paid twice) */
    await A.ev(async ([L, d]) => { const runs = [{ id: 'RUN2', status: 'approved', from: d, to: d, payDate: d, lines: [Object.assign({}, L, { status: 'approved', checkNo: '1042' })] }]; window._crm.payrollRuns = runs; window.__GC_RUNS_CACHE__ = runs; window._gcMileage.markPaid(); }, [pay.L, dToday]);
    const t2 = Date.now(); while (Date.now() - t2 < 10000) { const c = cget('gc_mileage'); wv = (typeof c === 'string' ? JSON.parse(c) : c).weeks[0]; if (wv.paidRunId) break; await sleep(300); }
    const again = await A.ev(async (d) => { const P = window.__GC_PAY; const prof = Object.assign(P.blankProfile({ id: 'u4', name: 'Olive Office', email: 'office@grayco-cs.com' }), { payType: 'hourly' }); const L = await P.computeLine(prof, d, d, await P.settings(), { gross: 0 }, 800, {}); return L.mileage || 0; }, dToday);
    ok('approved run → the week is marked paid (run RUN2, check 1042); the next run does not pay it again', wv.paidRunId === 'RUN2' && wv.paidCheckNo === '1042' && again === 0, [wv, again]);

    console.log('── 4. the rate (admin setting, every computer)');
    const rr = await A.ev(() => window._gcMileage.setRate('0.75').then(v => v.rate, e => e.message));
    const cs = cget('gc_mileage_settings');
    ok('admin changes the rate to $0.75 — saved for every computer, logged (from 0.7)', rr === 0.75 && cs.rate === 0.75 && cs.updatedBy === 'Wesley Johnson' && cs.log[0].from === 0.7, [rr, cs]);
    await A.ctx.close();
    const O2 = await computer('O2', { build });
    await O2.ctx.route(u => new URL(u).pathname === '/.netlify/functions/portal', route('office'));
    await signIn(O2, 'office@grayco-cs.com', 12000);
    await waitFor(O2, () => !!(window._gcMileage && (window._crm || {}).users && window._crm.users.length >= 4), null, 90000, 500);
    const o2 = await O2.ev(async (d) => { await window._gcMileage.load(); const e = await window._gcMileage.add({ date: d, from: 'Office', to: 'Post office', miles: '10' }); const r = await window._gcMileage.setRate('0.99').then(() => 'changed!', e => e.message); return { rate: window._gcMileage.rate(), e, r, st: window._gcMileage.state() }; }, dToday);
    ok('the office\'s computer reads $0.75; a new trip uses it (10 mi = $7.50); her old trips keep $0.70', o2.rate === 0.75 && o2.e.amount === 7.5 && o2.st.entries.filter(e => e.rate === 0.7 && !e.deleted).length === 2, o2);
    ok('the office cannot change the rate (admins only)', /Only Wesley or Nick/.test(o2.r), o2.r);
    const fld = await O2.ev(() => { try { window._gcSetFieldMode && window._gcSetFieldMode(true); } catch (e) {} return null; });
    void fld;
    const hub = await O2.ev(async () => { const p = document.createElement('div'); p.className = 'gc-hub-panel'; p.style.cssText = 'position:fixed;top:0;left:0;width:200px;height:200px;background:#fff;z-index:5'; document.body.appendChild(p); document.body.click(); await new Promise(r => setTimeout(r, 2200)); const it = p.querySelector('#gc-mileage-hub'); const t = it && it.textContent; if (it) it.click(); await new Promise(r => setTimeout(r, 300)); const open = !!document.getElementById('gcmi-ov'); p.remove(); window._gcMileage.close(); return { t, open }; });
    ok('💎 menu: "🚗 My mileage" opens the mileage screen', /My mileage/.test(hub.t || '') && hub.open, hub);
    ok('no page errors (office, admin)', !O.errs.concat(O2.errs).filter(e => /OFFICEAPPR|gcmi|_gcMileage|_gcOA/.test(e)).length, O.errs.concat(O2.errs).slice(0, 5));
    await O2.ctx.close();
  } finally { try { await shared.close(); } catch (e) {} }
}

/* ═════════════ 3. static checks ═════════════ */
function staticPart(){
  console.log('── 5. static');
  const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
  ok('the field app\'s More sheet has "🚗 My mileage"', html.includes("row('\\uD83D\\uDE97','My mileage','mileage')") && html.includes("else if(a==='mileage'){ if(window._gcMileage) window._gcMileage.open(); }"));
  ok('the estimate builder travel calculator (mrate) is untouched by OFFICEAPPR', !/mrate[^\n]*OFFICEAPPR/.test(html));
  /* C. late fees: wording only — nothing adds a late fee / late charge line or amount to an invoice */
  const files = [html].concat(fs.readdirSync(F).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(F, f), 'utf8')))
    .concat(fs.readdirSync(path.join(F, '_lib')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(F, '_lib', f), 'utf8')));
  const adds = files.flatMap(t => t.match(/(desc|label|title|description|name)\s*:\s*['"`][^'"`\n]{0,40}late (fee|charge)[^'"`\n]{0,40}['"`]\s*,\s*(amt|amount|cost|price)\s*:/gi) || [])
    .concat(files.flatMap(t => t.match(/(lateFee|late_fee|lateCharge|late_charge)\s*[:=]\s*[^'"\s]/g) || []));
  ok('late fees: nothing in the CRM or the functions adds a late fee / late charge (wording only)', !adds.length, adds.slice(0, 5));
}

if (MODE === 'server' || MODE === 'all') await serverPart();
if (MODE === 'browser' || MODE === 'all') await browserPart();
staticPart();
const n = R.filter(Boolean).length;
console.log('\n' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
