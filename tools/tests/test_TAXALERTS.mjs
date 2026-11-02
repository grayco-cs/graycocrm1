/* test_TAXALERTS.mjs [build-dir] [--no-browser] — patch TAXALERTS (🧾 tax deadlines), with a fake clock.
   Part A — the server (netlify/functions/_lib/taxcal.js + _lib/taxalerts.js through auto-wins.js), in memory, no network:
     1. due dates: monthly / quarterly / yearly rules, the weekend and federal-holiday shift (MLK Day, D.C. Emancipation Day)
     2. 7 days before and on the due day: e-mail + push to the admins + the office, each exactly once
     3. overdue: again every day until ✓ Paid; Paid stops it
     4. an admin's edit applies (a new due day); a switched-off item never alerts
     5. the owners' quarterly estimated tax: only the admins (each his own, or both) — never the office; the estimate from
        Payroll on the payroll items, the owner's fixed amount on his; nothing at night
   Part B — the page (offline harness, real index.html): the admin's ⚙ Admin → 🧾 Tax deadlines, edits, switch-off, the 🧾 Taxes
     card, To-Do alerts with ✓ Paid (amount, confirmation #, receipt into the file storage); the office sees the company list
     only — never the owner items or their amounts — and never asks for gc_admin_kv; no page errors.
   node tools/tests/test_TAXALERTS.mjs [build]       (GC_HARNESS = the offline browser harness, as test_MAINTTAB) */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const build = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : ROOT, FN = path.join(build, 'netlify/functions');
const NO_BROWSER = process.argv.includes('--no-browser'), ONLY_BROWSER = process.argv.includes('--browser-only');
let pass = 0, fail = 0; const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };

/* ═════════════════════════ PART A — the server ═════════════════════════ */
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test_only'; process.env.RESEND_API_KEY = 're_test';
process.env.SMS_ALERTS_OFF = '1'; delete process.env.PORTAL_MAIL_OFF; delete process.env.TAXALERTS_OFF;
const KV = {}, ADM = {}, MAILS = [], PUSH = [];
const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {};
  if (url.startsWith('https://api.resend.com/')) { MAILS.push(JSON.parse(o.body)); return res(200, { id: 'm' + MAILS.length }); }
  const m = /\/rest\/v1\/(gc_kv|gc_admin_kv)\?/.exec(url);
  if (m) {
    const store = m[1] === 'gc_kv' ? KV : ADM;
    if ((o.method || 'GET') === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => { store[x.key] = typeof x.value === 'string' ? JSON.parse(x.value) : x.value; }); return res(201, {}); }
    const eq = /key=eq\.([^&]+)/.exec(url); const k = eq && decodeURIComponent(eq[1]);
    return res(200, k && store[k] !== undefined ? [{ key: k, value: m[1] === 'gc_kv' ? JSON.stringify(store[k]) : store[k] }] : []);
  }
  return res(404, {});
};
const T = require(path.join(FN, '_lib/taxcal.js'));
const W_ = 'wjohnson@grayco-cs.com', N_ = 'nthomas@grayco-cs.com', OF = 'office@grayco-cs.com', PM = 'sbiffle@grayco-cs.com';
const USERS = [{ id: 'u1', name: 'Wesley Johnson', email: W_, role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Nick Thomas', email: N_, role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Office Gal', email: OF, role: 'Office Manager', active: true }, { id: 'u4', name: 'Steven Biffle', email: PM, role: 'Project Manager', active: true }];
const line = (o) => Object.assign({ status: 'ok', gross: 1000, fed: 100, ss: 62, med: 14.5, addlMed: 0, futa: 6, suta: 27, state: 0, net: 800 }, o || {});
const RUNS = [{ id: 'r1', status: 'paid', payDate: '2026-10-09', lines: [line(), line()] }, { id: 'r2', status: 'approved', payDate: '2026-12-18', lines: [line()] },
  { id: 'r3', status: 'pending', payDate: '2026-12-24', lines: [line()] }, { id: 'r4', status: 'paid', payDate: '2027-01-15', lines: [line({ fed: 50 })] }];

function centralAt(ymd, hour){   /* the UTC instant that is <hour>:19 in Memphis on <ymd> (daylight saving or not) */
  for (const off of [5, 6]) { const p = ymd.split('-').map(Number), t = Date.UTC(p[0], p[1] - 1, p[2], hour + off, 19); const c = require(path.join(FN, '_lib/auto-common.js')).central(t); if (c.ymd === ymd && c.hour === hour) return t; }
  throw new Error('no instant for ' + ymd + ' ' + hour);
}

if (!ONLY_BROWSER) {
  const core = require(path.join(FN, 'portal.js'))._core;
  const LISTS = {};
  Object.assign(core, {
    kvRead: async keys => { const o = {}; keys.forEach(k => { if (KV[k] !== undefined) o[k] = JSON.parse(JSON.stringify(KV[k])); }); return o; },
    kvListUpdate: async (key, mutate) => { const cur = LISTS[key] || []; const m = mutate(JSON.parse(JSON.stringify(cur))); if (!m || !m.list) return { ok: true, unchanged: true, list: cur }; LISTS[key] = m.list; return { ok: true, list: m.list, result: m.result }; },
    crmData: async () => ({ users: USERS }),
    pushTo: async (emails, p) => { emails.forEach(e => PUSH.push({ to: e, title: p.title })); return { sent: emails.length }; }
  });
  const AW = require(path.join(FN, 'auto-wins.js'));
  const TX = require(path.join(FN, '_lib/taxalerts.js'));
  const runDay = async (ymd, hour) => { const before = MAILS.length; const out = await AW._run({ part: 'tax', now: centralAt(ymd, hour == null ? 8 : hour) }); return { out: out.tax, mails: MAILS.slice(before) }; };
  const again = async (ymd) => { const before = MAILS.length; const out = await TX.run({ now: centralAt(ymd, 9) }); return { out, mails: MAILS.slice(before) }; };
  const to = (mails, email) => mails.filter(m => m.to.indexOf(email) >= 0);
  const subj = (mails) => mails.map(m => m.subject + ' :: ' + m.html.replace(/<[^>]+>/g, ' ')).join(' | ');

  console.log('1. due dates (weekend / federal holiday → next business day)');
  const C0 = T.merge(null, 'company'), O0 = T.merge(null, 'owner'), it = id => C0.items.concat(O0.items).find(x => x.id === id);
  const nd = (id, from, n) => T.nextDue(it(id), from, n || 1).map(o => o.due + '/' + o.label);
  ok(nd('941dep', '2026-11-01', 3).join(' ') === '2026-11-16/Oct 2026 2026-12-15/Nov 2026 2027-01-15/Dec 2026', '941 deposits: the 15th for last month; Sun Nov 15 2026 → Mon Nov 16', nd('941dep', '2026-11-01', 3));
  ok(nd('941q', '2026-11-03', 2).join(' ') === '2027-02-01/Q4 2026 2027-04-30/Q1 2027', 'Form 941: Q4 2026 due Jan 31 2027 (a Sunday) → Mon Feb 1', nd('941q', '2026-11-03', 2));
  ok(nd('suta', '2027-05-01')[0] === '2027-08-02/Q2 2027', 'TN SUTA: the last day of the month after the quarter (Sat Jul 31 2027 → Mon Aug 2)', nd('suta', '2027-05-01'));
  ok(nd('est_wj', '2027-12-01', 2).join(' ') === '2028-01-18/Q4 2027 2028-04-18/Q1 2028', 'estimated tax: Sat Jan 15 2028 → Tue Jan 18 (Mon = MLK Day); Sat Apr 15 2028 → Tue Apr 18 (Mon = D.C. Emancipation Day observed)', nd('est_wj', '2027-12-01', 2));
  ok(T.shiftDue('2023-04-15') === '2023-04-18' && T.shiftDue('2022-04-15') === '2022-04-18', 'the IRS dates of 2022 / 2023 (Apr 18 both years) come out right');
  ok(nd('941dep', '2029-01-01')[0] === '2029-01-16/Dec 2028', 'a Monday holiday: Jan 15 2029 is MLK Day → Tue Jan 16', nd('941dep', '2029-01-01'));
  ok(T.shiftDue('2027-07-05') === '2027-07-06' && T.holidayName('2027-07-05') === 'Independence Day', 'Independence Day on a Sunday → observed Monday Jul 5 2027');
  ok(T.nextDue(Object.assign({}, it('941q'), { shift: 'none' }), '2026-11-03')[0].due === '2027-01-31', 'shift “keep the date” keeps a Sunday');
  ok(nd('fae_est', '2026-11-01', 2).join(' ') === '2026-12-15/Q4 2026 2027-04-15/Q1 2027' && nd('940', '2026-11-01')[0] === '2027-02-01/2026' && nd('tnsales', '2026-11-01')[0] === '2026-11-20/Oct 2026', 'F&E estimates (Dec 15), Form 940 for last year, TN sales tax by the 20th');
  ok(C0.items.filter(x => x.on).map(x => x.id).join(',') === '941dep,941q,suta,futa,940,w2,1099' && C0.items.filter(x => !x.on).map(x => x.id).join(',') === 'tnsales,fae_est,fae,tnbiz', 'defaults: payroll items ON; sales / use, F&E, business tax OFF', C0.items.map(x => x.id + ':' + x.on));
  ok(C0.items.concat(O0.items).every(x => x.cpa === true), 'every default is marked “Confirm with CPA”');
  ok(O0.items.map(x => x.name).join(' | ') === 'Wesley Johnson — quarterly estimated tax | Nick Thomas — quarterly estimated tax' && O0.items.every(x => x.dates.join(',') === '04-15,06-15,09-15,01-15'), 'one owner item per owner — Apr 15, Jun 15, Sep 15, Jan 15');

  console.log('2. 7 days before and the due day — admins + office, exactly once');
  KV.gc_tax_calendar = { v: 1, startedAt: '2027-01-18', items: [] }; KV.gc_tax_paid = []; KV.payrollRuns = RUNS;
  ADM.gc_tax_owner = { v: 1, startedAt: '2027-03-01', items: [{ id: 'est_wj', amount: 12500 }, { id: 'est_nt', amount: 9000, who: 'admins' }] };
  let r = await runDay('2027-01-24');
  ok(r.out.ok && r.out.sent === 0 && r.mails.length === 0, '8 days before Feb 1: nothing', r.out);
  r = await runDay('2027-01-25');
  const t25 = r.out.to[OF] || [];
  ok(r.out.sent === 5 && t25.length === 5, '7 days before: Form 941 Q4, TN SUTA Q4, Form 940, W-2s, 1099-NEC (all due Mon Feb 1)', r.out);
  ok(t25.indexOf('🧾 Due in 7 days: Form 941 Q4 2026 — Feb 1') >= 0, 'the line reads “🧾 Due in 7 days: Form 941 Q4 2026 — Feb 1”', t25);
  ok([W_, N_, OF].every(e => to(r.mails, e).length === 1) && to(r.mails, PM).length === 0 && r.mails.length === 3, 'ONE e-mail each to Wesley, Nick and the office; none to a PM', r.mails.map(m => m.to));
  ok(PUSH.filter(p => p.title.indexOf('5 tax deadlines') >= 0).length === 3, 'one phone push each', PUSH);
  ok(/Estimated from Payroll: \$759\.00/.test(subj(to(r.mails, OF))), 'Form 941 Q4: the estimate from the approved Payroll runs of the quarter ($759.00 = 3 lines × $253; a pending run not counted)', subj(to(r.mails, OF)).slice(0, 400));
  ok(/TN unemployment \(SUTA\) Q4 2026/.test(subj(to(r.mails, OF))) && /jobs4tn|eftps|irs\.gov/i.test(to(r.mails, OF)[0].html), 'the pay / file link is in the e-mail');
  ok(/not tax advice/i.test(to(r.mails, OF)[0].html), 'the CPA note is in the e-mail');
  r = await again('2027-01-25');
  ok(r.out.sent === 0 && r.mails.length === 0, 'a second run the same day sends nothing (exactly once)', r.out);
  r = await runDay('2027-01-26');
  ok(r.out.sent === 0 && r.mails.length === 0, 'the next day: nothing new (the 7-day alert is once)', r.out);
  r = await runDay('2027-02-01');
  ok(r.out.sent === 5 && (r.out.to[OF] || []).every(x => /^🧾 Due today: /.test(x)) && to(r.mails, OF).length === 1 && to(r.mails, W_).length === 1, 'the due day: “🧾 Due today: …” to the admins + office', r.out.to[OF]);
  r = await again('2027-02-01');
  ok(r.out.sent === 0, 'the due-day alert is once too');

  console.log('3. overdue — every day until ✓ Paid');
  KV.gc_tax_paid = [{ key: '941q|2027-01-31', itemId: '941q', paidOn: '2027-02-01', amount: 759, confirm: 'EFT-1', by: 'Office Gal' }, { key: 'w2|2027-01-31', itemId: 'w2', paidOn: '2027-01-29', amount: 0, none: true, by: 'Office Gal' }];
  r = await runDay('2027-02-02');
  let lines2 = r.out.to[OF] || [];
  ok(r.out.sent === 3 && lines2.every(x => /^🧾 OVERDUE 1 day: /.test(x)) && !lines2.some(x => /Form 941 Q4|W-2/.test(x)), 'Feb 2: SUTA, Form 940, 1099-NEC overdue; Form 941 and W-2s paid → not sent', lines2);
  r = await runDay('2027-02-03');
  ok(r.out.sent === 3 && (r.out.to[W_] || []).every(x => /OVERDUE 2 days/.test(x)), 'Feb 3: overdue again (daily)', r.out.to[W_]);
  r = await again('2027-02-03');
  ok(r.out.sent === 0, '… once a day');
  KV.gc_tax_paid.push({ key: 'suta|2027-01-31', paidOn: '2027-02-03', amount: 27 }, { key: '940|2027-01-31', paidOn: '2027-02-03', amount: 30 }, { key: '1099|2027-01-31', paidOn: '2027-02-03', amount: 0, none: true });
  r = await runDay('2027-02-04');
  ok(r.out.sent === 0 && r.mails.length === 0, 'all marked paid → Feb 4: nothing', r.out);

  console.log('4. an admin edit applies; a switched-off item never alerts');
  r = await runDay('2027-02-05');
  ok(r.out.sent === 0, 'Feb 5: the Jan 941 deposit is due Feb 16 → not yet');
  KV.gc_tax_calendar = { v: 1, startedAt: '2027-01-18', items: [{ id: '941dep', day: 12 }, { id: 'tnsales', on: false }] };
  r = await runDay('2027-02-06');
  ok(r.out.sent === 1 && (r.out.to[OF] || [])[0] === '🧾 Due in 6 days: 941 deposit Jan 2027 — Feb 12', 'the admin moved 941 deposits to the 12th → Feb 6: “Due in 6 days … Feb 12” (inside the 7 days)', r.out.to[OF]);
  ok(/Estimated from Payroll: \$203\.00/.test(subj(to(r.mails, OF))), 'its estimate: January’s Payroll (fed + both halves of FICA) = $203.00', subj(to(r.mails, OF)).slice(0, 300));
  KV.gc_tax_calendar.items.push({ id: 'futa', on: false }, { id: 'suta', who: 'admins' });
  const all = []; for (const d of ['2027-04-23', '2027-04-30', '2027-05-01', '2027-05-02']) { const x = await runDay(d); all.push(...Object.values(x.out.to || {}).flat()); }
  ok(!all.some(x => /FUTA deposit|TN sales/.test(x)), 'switched off: FUTA deposit (due Apr 30) and TN sales tax never alert', all);
  ok(all.some(x => /TN unemployment \(SUTA\) Q1 2027/.test(x)), 'the other items still do (SUTA Q1)');
  ok(Object.keys(MAILS.slice(-8).reduce((a, m) => { if (/SUTA/.test(m.html)) m.to.forEach(e => { a[e] = 1; }); return a; }, {})).every(e => e !== OF), 'SUTA set to “admins only” → the office is not e-mailed about it');

  console.log('5. the owners\' quarterly estimated tax — admins only, never the office');
  KV.gc_tax_paid.push({ key: '941dep|2027-03-12', paidOn: '2027-03-10', amount: 1 }, { key: '941dep|2027-04-12', paidOn: '2027-04-10', amount: 1 });
  const b0 = MAILS.length;
  r = await runDay('2027-04-08');
  const own = Object.entries(r.out.to || {}).map(([e, l]) => [e, l.filter(x => /estimated tax/.test(x))]).filter(x => x[1].length);
  ok(own.length === 2 && own.every(([e]) => e === W_ || e === N_), 'Apr 8 (7 days before Apr 15): the estimated tax alerts go to the admins only', own);
  ok((r.out.to[W_] || []).filter(x => /estimated tax/.test(x)).length === 2 && (r.out.to[N_] || []).filter(x => /Wesley/.test(x)).length === 0 && (r.out.to[N_] || []).filter(x => /Nick/.test(x)).length === 1,
    'Wesley’s goes to Wesley only (“his own”); Nick’s is set to “both admins” → Wesley and Nick', r.out.to);
  ok(!MAILS.slice(b0).some(m => m.to.indexOf(OF) >= 0 && /estimated tax|12,500|9,000/.test(m.html + m.subject)), 'the office is never e-mailed an owner item or its amount');
  ok(/Amount: \$12,500\.00/.test(subj(to(r.mails, W_))), 'the owner’s e-mail shows his fixed quarterly number', subj(to(r.mails, W_)).slice(0, 300));
  ok(!JSON.stringify(LISTS.gc_autowins_log || []).match(/est_wj|est_nt|Wesley|Nick/), 'the shared send log carries no owner names (hashed markers)');
  ok(!JSON.stringify(KV).match(/est_wj|est_nt|12500|quarterly estimated/), 'nothing about the owners is written to gc_kv (staff-readable)');
  ADM.gc_tax_owner.paid = [{ key: 'est_wj|2027-04-15', paidOn: '2027-04-14', amount: 12500, confirm: 'DP-77' }];
  r = await runDay('2027-04-16');
  ok(!(r.out.to[W_] || []).some(x => /Wesley/.test(x)) && (r.out.to[N_] || []).some(x => /OVERDUE 1 day: Nick Thomas/.test(x)), 'Wesley paid his → no more; Nick’s is overdue → Nick (and Wesley) only', r.out.to);
  ok(!(r.out.to[OF] || []).some(x => /estimated/.test(x)), 'still never the office');

  console.log('6. never at night; Paid record shape');
  const night = await AW._run({ part: 'tax', now: centralAt('2027-04-17', 3) }), eve = await AW._run({ part: 'tax', now: centralAt('2027-04-17', 21) });
  ok(night.tax === 'not now' && eve.tax === 'not now', 'the alert run never runs at night (3 AM / 9 PM → not now)', [night.tax, eve.tax]);
  const am = await AW._run({ part: 'tax', now: centralAt('2027-04-17', 8) }), am2 = await AW._run({ part: 'tax', now: centralAt('2027-04-17', 10) });
  ok(am.tax && am.tax.ok && am2.tax === 'done already', 'the first run at / after 8 AM Central does it; later runs that day: done already', [am.tax && am.tax.sent, am2.tax]);
  const src = fs.readFileSync(path.join(FN, 'auto-wins.js'), 'utf8');
  ok(/require\('\.\/_lib\/pause'\)\.install\(\)/.test(src), 'auto-wins.js still installs the data-entry-mode guard first');
}

/* ═════════════════════════ PART B — the page ═════════════════════════ */
if (!NO_BROWSER) {
  const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
  const { computer, sleep, waitFor, resetCloud, cset, cget, ACCOUNTS } = await import(HARNESS);
  console.log('7. the page — admin');
  resetCloud();
  cset('users', USERS);
  cset('gc_senior_pm', { none: true, setBy: W_, setAt: '2026-10-01T00:00:00Z' });
  cset('projects', [{ id: 'p1', name: 'Test roof', status: 'In Progress', pm: 'Steven Biffle', address: '1 Main St' }]);
  cset('gc_tax_calendar', JSON.stringify({ v: 1, startedAt: '2027-01-18', items: [] }));
  cset('gc_tax_paid', '[]');
  cset('payrollRuns', JSON.stringify(RUNS));
  const ADMKV = { gc_tax_owner: { v: 1, startedAt: '2027-01-01', items: [{ id: 'est_wj', amount: 12500 }, { id: 'est_nt', amount: 9000 }] } };
  const CLOCK = Date.UTC(2027, 0, 25, 18, 0);   /* Mon Jan 25 2027, noon in Memphis */
  async function session(email, name){
    const c = await computer(name, { build });
    c.adminKv = [];
    await c.ctx.addInitScript(ms => { window.__gcTaxClock = ms; }, CLOCK);
    await c.ctx.route(u => /\/rest\/v1\/gc_admin_kv/.test(String(u)), async rt => {
      const req = rt.request(), m = req.method(), auth = req.headers().authorization || '';
      c.adminKv.push(m + ' ' + req.url().replace(/^https:\/\/[^/]+/, ''));
      const H = { 'access-control-allow-origin': '*' };
      if (m === 'OPTIONS') return rt.fulfill({ status: 200, headers: Object.assign({ 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, H) });
      const admin = /utok-u-[wn]-/.test(auth);   /* the database: gc_staff role 'admin' only */
      if (m === 'GET') { const k = (new URL(req.url()).searchParams.get('key') || '').replace(/^eq\./, ''); const rows = admin ? Object.keys(ADMKV).filter(x => !k || x === k).map(x => ({ key: x, value: ADMKV[x], updated_at: new Date().toISOString() })) : [];
        return rt.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(rows) }); }
      if (!admin) return rt.fulfill({ status: 403, contentType: 'application/json', headers: H, body: '{"message":"denied"}' });
      try { const b = JSON.parse(req.postData() || '[]'); (Array.isArray(b) ? b : [b]).forEach(x => { if (x && x.key) ADMKV[x.key] = typeof x.value === 'string' ? JSON.parse(x.value) : x.value; }); } catch (e) {}
      return rt.fulfill({ status: 201, headers: H, body: '' });
    });
    const p = c.page();
    await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 60000 }); await sleep(1500);
    await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300);
    const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await waitFor(c, () => !!(window._gcTax && window._gcTax.state().at), null, 90000, 400);
    await sleep(3000);
    return c;
  }
  const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
  const A = await session(W_, 'admin');
  const ev = (f, a) => A.page().evaluate(f, a);
  let st = await ev(() => window._gcTax.state());
  ok(st.canSee && st.seesOwner && st.canEdit && st.today === '2027-01-25', 'admin: sees the calendar, the owner items, can edit; the fake clock says Jan 25 2027', st);
  ok(st.owner && st.owner.join(',') === 'est_wj,est_nt' && st.runs === 4, 'admin: the owners-only list read from gc_admin_kv; the Payroll runs read for the estimates', st);
  let td = await ev(() => window._gcTax.todo().map(x => x.title + ' | ' + x.vis + ' | ' + x.sub));
  ok(td.filter(x => /^🧾 Due in 7 days: /.test(x)).length === 5 && td.some(x => x.indexOf('🧾 Due in 7 days: Form 941 Q4 2026 — Feb 1 | company | Form 941') === 0), 'To-Do: the five “Due in 7 days” lines, for the admins + office', td);
  ok(td.some(x => /^🧾 OVERDUE 10 days: Wesley Johnson — quarterly estimated tax \(Q4 2026\) — was due Jan 15 \| who \| .*amount \$12,500\.00/.test(x)), 'To-Do: Wesley’s Q4 estimated tax (Jan 15) overdue, admins only, with his amount', td);
  ok(td.some(x => /est\. \$759\.00/.test(x)), 'Form 941 Q4: the Payroll estimate on the To-Do line');
  await waitFor(A, () => window._gcTD2 && window._gcTD2.state().items.some(x => /^🧾 Due in 7 days: Form 941 Q4/.test(x.title)), null, 20000, 500);
  const vis = await ev(() => window._gcTD2.state().items.filter(x => /^🧾/.test(x.title)).map(x => x.title + ' | ' + (x.act && x.act.l)));
  ok(vis.length === 6 && vis.every(x => /\| ✓ Paid$/.test(x)) && vis.some(x => /Wesley Johnson — quarterly/.test(x)) && !vis.some(x => /Nick Thomas/.test(x)),
    'the real To-Do shows Wesley 6 tax lines, each with ✓ Paid: the 5 payroll ones + his own estimated tax (Nick’s goes to Nick)', vis);
  /* owner 11/02 (patch FIELDDESK): no 🧾 Taxes card on top of the admin's Desk home or the dashboard — ⚙ Admin and the To-Do only */
  await ev(() => { if (window._gcRA && window._gcRA.open) window._gcRA.open(); }); await sleep(3500);
  let card = await ev(() => ({ desk: !!document.getElementById('gc-ra-desk') && getComputedStyle(document.getElementById('gc-ra-desk')).display !== 'none', tax: !!(document.querySelector('#gc-ra-desk [data-card="taxes"]') || document.getElementById('gc-tax-dash') || document.getElementById('gc-tax-om')) }));
  ok(card.desk && !card.tax, 'no 🧾 Taxes card on the admin\'s Desk home', card);
  await ev(() => { if (window._gcRA && window._gcRA.hide) window._gcRA.hide(); window._setView('dashboard'); }); await sleep(2500);
  card = await ev(() => !!(document.getElementById('gc-tax-dash') || document.querySelector('[data-card="taxes"]')));
  ok(!card, 'no 🧾 Taxes card on top of the admin\'s dashboard', card);
  /* ⚙ Admin → 🧾 Tax deadlines */
  await ev(() => { window._setView('admin'); }); await sleep(2500);
  await ev(() => window._gcAdm.open('taxes')); await sleep(1500);
  let cal = await ev(() => { const c = document.querySelector('#gc-adm-hub [data-tax-cal]'); return c ? { text: c.innerText, rows: c.querySelectorAll('tr[data-tax-item]').length, edits: c.querySelectorAll('[data-tax-a="edit"]').length, toggles: c.querySelectorAll('input[data-tax-a="toggle"]').length } : null; });
  ok(cal && cal.rows === 13 && cal.edits === 13 && cal.toggles === 13, '⚙ Admin → 🧾 Tax deadlines: 11 company + 2 owner items, each with a switch and Edit', cal && { rows: cal.rows, edits: cal.edits });
  ok(cal && /Confirm with CPA/.test(cal.text) && /reminders, not tax advice/i.test(cal.text) && /Owners — quarterly estimated tax/.test(cal.text) && /EFTPS|eftps/i.test(cal.text), 'the “Confirm with CPA” marks, the owners’ part and the not-tax-advice note in the footer', cal && cal.text.slice(-300));
  /* edit: 941 deposits move to the 12th */
  await A.page().locator('#gc-adm-hub [data-tax-a="edit"][data-id="941dep"]').click(); await sleep(400);
  await A.page().locator('#gc-adm-hub .gctx-ed input[data-f="day"]').fill('12');
  await A.page().locator('#gc-adm-hub .gctx-ed [data-tax-a="save"]').click(); await sleep(1500);
  let saved = parse(cget('gc_tax_calendar'));
  ok(saved && saved.items.find(x => x.id === '941dep').day === 12 && saved.startedAt === '2027-01-18', 'Edit → Save: gc_tax_calendar has the 941 deposit on the 12th (start day kept)', saved && saved.items.find(x => x.id === '941dep'));
  await ev(ms => window._gcTax.setClock(ms), Date.UTC(2027, 1, 6, 18, 0));
  td = await ev(() => window._gcTax.todo().map(x => x.title));
  ok(td.indexOf('🧾 Due in 6 days: 941 deposit Jan 2027 — Feb 12') >= 0, 'the edit applies: Feb 6 → “🧾 Due in 6 days: 941 deposit Jan 2027 — Feb 12”', td);
  /* switch off */
  await A.page().locator('#gc-adm-hub input[data-tax-a="toggle"][data-id="suta"]').evaluate(el => { el.click(); }); await sleep(1500);
  saved = parse(cget('gc_tax_calendar'));
  td = await ev(() => window._gcTax.todo().map(x => x.title));
  ok(saved.items.find(x => x.id === 'suta').on === false && !td.some(x => /SUTA/.test(x)), 'the switch turns TN SUTA off: saved, and no alert for it (it was overdue)', td);
  ok(!td.some(x => /TN sales|F&E|business tax/.test(x)), 'items that are off by default never alert');
  /* ✓ Paid with a receipt */
  await ev(ms => window._gcTax.setClock(ms), Date.UTC(2027, 1, 2, 18, 0));
  await ev(() => window._gcTax.paidDialog('company', '941q|2027-01-31')); await sleep(500);
  const pre = await ev(() => document.getElementById('gctx-p-amt').value);
  ok(pre === '759.00', 'the ✓ Paid window fills in the Payroll estimate', pre);
  await A.page().locator('#gctx-p-conf').fill('EFT-941-Q4');
  await A.page().locator('#gctx-p-file').setInputFiles({ name: 'eftps-receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
  await A.page().locator('#gctx-p-save').click(); await sleep(2500);
  const paid = parse(cget('gc_tax_paid')) || [];
  const p941 = paid.find(x => x.key === '941q|2027-01-31');
  ok(p941 && p941.amount === 759 && p941.confirm === 'EFT-941-Q4' && p941.paidOn === '2027-02-02' && /Wesley/.test(p941.by) && p941.receipt && /^sb:/.test(p941.receipt.ref) && p941.receipt.name === 'eftps-receipt.pdf',
    '✓ Paid records date, amount, confirmation #, who, and the receipt in the file storage', p941);
  td = await ev(() => window._gcTax.todo().map(x => x.title));
  ok(!td.some(x => /Form 941 Q4/.test(x)) && td.some(x => /OVERDUE 1 day: Form 940/.test(x)), 'Paid stops it; the unpaid ones are still overdue', td);
  const ptp = parse(cget('payrollTaxPayments')) || [];
  ok(ptp.some(x => x.kind === '941' && x.amount === 759 && x.taxKey === '941q|2027-01-31'), 'also recorded in Payroll → Withholding & taxes (kind 941)', ptp);
  /* the owner's Paid stays in gc_admin_kv */
  await ev(() => window._gcTax.paidDialog('owner', 'est_wj|2027-01-15')); await sleep(400);
  const preO = await ev(() => document.getElementById('gctx-p-amt').value);
  await A.page().locator('#gctx-p-conf').fill('DP-2027-Q4'); await A.page().locator('#gctx-p-save').click(); await sleep(1500);
  ok(preO === '12500.00' && (ADMKV.gc_tax_owner.paid || []).some(x => x.key === 'est_wj|2027-01-15' && x.amount === 12500 && x.confirm === 'DP-2027-Q4'), 'an owner’s ✓ Paid (his quarterly number filled in) is kept in gc_admin_kv', ADMKV.gc_tax_owner.paid);
  const gk = JSON.stringify([...['gc_tax_calendar', 'gc_tax_paid', 'payrollTaxPayments', 'gc_office_tasks', 'gc_admin_tasks'].map(k => cget(k))]);
  ok(!/est_wj|est_nt|12500|DP-2027-Q4|estimated tax/.test(gk), 'nothing of the owners’ goes into gc_kv (no expense, no to-do record)');
  ok(!A.errs.length, 'admin: no page errors', A.errs.slice(0, 3));
  await A.b.close().catch(() => {});

  console.log('8. the page — the office');
  const O = await session(OF, 'office');
  const eo = (f, a) => O.page().evaluate(f, a);
  st = await eo(() => window._gcTax.state());
  ok(st.canSee && !st.seesOwner && !st.canEdit && st.owner === null, 'office: sees the company calendar, not the owner items, cannot edit', st);
  ok(O.adminKv.length === 0, 'office: never asks for gc_admin_kv', O.adminKv);
  await eo(ms => window._gcTax.setClock(ms), Date.UTC(2027, 1, 2, 18, 0));
  td = await eo(() => window._gcTax.todo().map(x => x.title));
  ok(td.some(x => /OVERDUE 1 day: Form 940/.test(x)) && !td.some(x => /estimated tax|Wesley|Nick/.test(x)) && !td.some(x => /Form 941 Q4/.test(x)), 'office To-Do: the payroll items (Form 941 Q4 paid by the admin is gone) — never an owner item', td);
  await eo(() => window._gcTax.open()); await sleep(1200);
  const oc = await eo(() => { const c = document.querySelector('#gctx-calov [data-tax-cal]'); return c ? { text: c.innerText, edits: c.querySelectorAll('[data-tax-a="edit"]').length, toggles: c.querySelectorAll('input[data-tax-a="toggle"]').length, rows: c.querySelectorAll('tr[data-tax-item]').length } : null; });
  ok(oc && oc.rows === 11 && oc.edits === 0 && oc.toggles === 0 && /Only an admin changes this list/.test(oc.text), 'office: the calendar read-only (11 company items, no switches, no Edit)', oc && { rows: oc.rows, edits: oc.edits });
  ok(oc && !/Owners|estimated tax|Wesley Johnson —|12,500|9,000|DP-2027-Q4/.test(oc.text) && /not tax advice/i.test(oc.text), 'office: no owner item, amount or payment anywhere on the calendar; the CPA note is there', oc && oc.text.slice(0, 200));
  await eo(() => { const x = document.getElementById('gctx-calov'); if (x) x.remove(); });
  ok(!/12,500|9,000|quarterly estimated tax/.test(await eo(() => document.body.innerText)), 'office: nothing about the owners anywhere on the page');
  /* the office marks a payroll item paid */
  await eo(() => window._gcTax.paidDialog('company', '940|2027-01-31')); await sleep(400);
  await O.page().locator('#gctx-p-amt').fill('42'); await O.page().locator('#gctx-p-conf').fill('EFT-940'); await O.page().locator('#gctx-p-save').click(); await sleep(1500);
  const p940 = (parse(cget('gc_tax_paid')) || []).find(x => x.key === '940|2027-01-31');
  ok(p940 && p940.amount === 42 && /Office/.test(p940.by), 'the office can mark a payroll tax paid', p940);
  const ow = await eo(() => window._gcTax.paidDialog('owner', 'est_nt|2027-01-15'));
  ok(ow === null && !(await eo(() => !!document.getElementById('gctx-paid'))), 'the office cannot open an owner item’s ✓ Paid');
  await eo(() => { window._setView('dashboard'); }); await sleep(3000);
  await eo(() => { if (window._gcRA && window._gcRA.open) window._gcRA.open(); }); await sleep(3000);
  const oCard = await eo(() => ({ desk: !!document.getElementById('gc-ra-desk') && getComputedStyle(document.getElementById('gc-ra-desk')).display !== 'none', tax: !!(document.querySelector('#gc-ra-desk [data-card="taxes"]') || document.getElementById('gc-tax-om') || document.getElementById('gc-tax-dash')) }));
  ok(oCard.desk && !oCard.tax, 'no 🧾 Taxes card on the office\'s Desk home or Office page (owner 11/02: the To-Do has the lines)', oCard);
  ok(O.adminKv.length === 0, 'office: still never asked for gc_admin_kv', O.adminKv);
  ok(!O.errs.length, 'office: no page errors', O.errs.slice(0, 3));
  await O.b.close().catch(() => {});
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
