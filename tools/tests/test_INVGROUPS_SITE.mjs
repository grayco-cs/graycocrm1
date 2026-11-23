// test_INVGROUPS_SITE.mjs <build-dir> [shot-dir] — patch INVGROUPS (owner 11/23 "have we this where I can invite all subs, or recent invitees
// too, or if I have a special group of who I usually invite let them be group 1"): the bid site's ✉️ Invite Subs → 👥 Pick several:
//   · quick picks: All subs · This job's trades · ⭐ Preferred · 🕘 Recent invitees (other bid jobs, last 90 days, newest first)
//   · ⛔ Do not use never listed, never sent (even inside a saved group: a note instead); already invited to this job greyed + ticked
//   · 💾 Save as group ("Group 1") → stored server-side (settings/invite_groups) → reload → the chip selects the same people;
//     rename / edit / delete (archived, never purged)
//   · send = one inline "Invite N subs?" step, then chunks of ≤100 (130 → 2 calls, 130 invites, 130 e-mails); no browser confirm()
//   · desk and phone; no page errors
// Made-up data only, on qaa_world's in-memory Supabase; e-mail captured, nothing leaves.
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, CALLS, putRow, rowData, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false }).catch(() => {}); };
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(250); } return false; };
W.install();
const MAIL = []; const f0 = globalThis.fetch;
globalThis.fetch = async (url, init) => { if (String(url).indexOf('api.resend.com') > -1) { MAIL.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'm' + MAIL.length }), text: async () => '{}' }; } return f0(url, init); };
process.env.RESEND_API_KEY = 'test-mail-key'; delete process.env.PORTAL_MAIL_OFF; process.env.CUST_QUIET_OFF = '1';
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), AGO = n => new Date(Date.now() - n * 864e5).toISOString();
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('gc_automation_pause', { on: false });
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
/* the CRM's subs: 3 ⭐ preferred, 1 ⛔ do-not-use, 1 without an e-mail, 125 others over five trades */
const TR = ['Drywall', 'Electrical', 'Plumbing', 'Painting', 'Concrete'];
const SUBS = [
  { id: 'S_p1', name: 'Volt Pros', company: 'Volt Pros', email: 'bids@voltpros.test', trade: 'Electrical', subFlag: 'preferred' },
  { id: 'S_p2', name: 'Bright Wire', company: 'Bright Wire', email: 'est@brightwire.test', trade: 'Electrical', subFlag: 'preferred' },
  { id: 'S_p3', name: 'Smooth Walls', company: 'Smooth Walls', email: 'office@smoothwalls.test', trade: 'Drywall', subFlag: 'preferred' },
  { id: 'S_dnu', name: 'Bad Apple Painting', company: 'Bad Apple Painting', email: 'bad@dnu.test', trade: 'Painting', subFlag: 'dnu' },
  { id: 'S_nomail', name: 'No Mail Masonry', company: 'No Mail Masonry', email: '', trade: 'Masonry' },
];
for (let i = 0; i < 125; i++) SUBS.push({ id: 'S_f' + i, name: 'Filler ' + String(i).padStart(3, '0') + ' ' + TR[i % 5], company: 'Filler ' + String(i).padStart(3, '0') + ' ' + TR[i % 5], email: 'f' + i + '@fill.test', trade: TR[i % 5] });
W.H.cset('subs', SUBS);
W.H.cset('projects', [{ id: 'P1', name: 'Demo Clinic Remodel', address: '1 Demo Rd', autoPO: 'Q601', status: 'active' }]);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', phone: '901-555-0100', title: 'Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'a@sub.test', name: 'Alex Alpha', company: 'Alpha Drywall', trades: ['Drywall'], authUserId: 'auth-u_a' }, { user_id: 'u_a', email: 'a@sub.test' });
putRow('users', 'u_sup', { id: 'u_sup', role: 'supplier', approved: true, email: 'q@supply.test', name: 'Sam Supply', company: 'Demo Supply', authUserId: 'auth-u_sup' }, { user_id: 'u_sup', email: 'q@supply.test' });
ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' };
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'private', draft: false, bidDueDate: DAY(20), pmId: 'st_owner', estimatorId: 'st_owner', grayCoRole: 'gc', createdAt: now }, x), { job_id: id });
job('J_PRIV', { title: 'Private Fit-out Demo', tradesSought: 'Electrical, Plumbing' });
job('J_PHONE', { title: 'Phone Warehouse Demo', tradesSought: 'Drywall' });
job('J_OLD', { title: 'Earlier Demo Job', status: 'closed' });
const inv = (id, jobId, email, at, x) => putRow('invites', id, Object.assign({ id, jobId, email, token: 'tok' + id, createdAt: at, createdBy: 'owner@grayco-cs.com', as: 'sub' }, x || {}), { job_id: jobId, email });
inv('i_here', 'J_PRIV', 'f0@fill.test', AGO(1));                 /* already invited to this job */
inv('i_ph', 'J_PHONE', 'f3@fill.test', AGO(1));
inv('i_r1', 'J_OLD', 'f5@fill.test', AGO(3));                    /* recent: newest first f3 (the other job above), f5, walkin, f6 */
inv('i_r1b', 'J_OLD', 'f5@fill.test', AGO(60));
inv('i_r2', 'J_OLD', 'walkin@recent.test', AGO(10), { company: 'Walk-in Roofing' });
inv('i_r3', 'J_OLD', 'f6@fill.test', AGO(40));
inv('i_old', 'J_OLD', 'stale@old.test', AGO(200));               /* over 90 days: not recent */
inv('i_rdnu', 'J_OLD', 'bad@dnu.test', AGO(5));                  /* recent but ⛔ */
/* a group someone saved earlier, holding a ⛔ sub */
putRow('settings', 'invite_groups', { id: 'invite_groups', groups: [{ id: 'g_usual', name: 'Usual crew', members: [{ email: 'bad@dnu.test', name: 'Bad Apple Painting', company: 'Bad Apple Painting' }, { email: 'f10@fill.test', name: '', company: 'Filler 010 Drywall' }, { email: 'f11@fill.test', name: '', company: 'Filler 011 Electrical' }], createdAt: AGO(20), createdBy: 'owner@grayco-cs.com' }] });
/* who may be picked for J_PRIV (subs with an e-mail, not ⛔, not already invited): u_a + 3 preferred + 124 fillers + walk-in = 129 … + f0 invited */
const ALL_SUBS = 1 + 3 + 125 + 1 - 1;   /* = 129 */
const TRADES_JOB = 2 + SUBS.filter(x => /^S_f/.test(x.id) && /Electrical|Plumbing/.test(x.trade) && x.email !== 'f0@fill.test').length;

const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [], dialogs = [];
const page = async (ctx, url) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); p.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); }); await p.goto(url || 'https://bids.test/'); return p; };
const count = p => p.$eval('[data-ig-count]', e => +e.getAttribute('data-ig-count')).catch(() => -1);
const checked = p => p.$$eval('[data-ig-check]', l => l.filter(x => x.checked && !x.disabled).map(x => x.getAttribute('data-ig-check')).sort());
const openJob = async (p, title) => {
  await p.waitForSelector(`h3:has-text("${title}")`, { timeout: 30000 }); await p.click(`h3:has-text("${title}")`);
  await p.waitForSelector('[data-ig-open]', { timeout: 15000 }); await p.click('[data-ig-open]');
  await p.waitForSelector('[data-ig-row="bids@voltpros.test"]', { timeout: 15000 });
};
const groupsRow = () => (rowData('settings/invite_groups') || {}).groups || [];
try {
  /* ── desk ── */
  const A = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
  await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await openJob(A, 'Private Fit-out Demo');
  ok('1 👥 Pick several lists the known subs, grouped by trade, ⭐ first in its trade', await A.evaluate(() => { const rows = [...document.querySelectorAll('[data-ig-row]')].map(r => r.getAttribute('data-ig-row')); return rows.indexOf('bids@voltpros.test') > -1 && rows.indexOf('a@sub.test') > -1 && rows.indexOf('bids@voltpros.test') < rows.indexOf('f1@fill.test'); }));
  ok('2 ⛔ Do not use and no-e-mail subs are not listed; suppliers not in the subs list', !(await A.$('[data-ig-row="bad@dnu.test"]')) && !(await A.$('[data-ig-row="q@supply.test"]')) && !(await A.evaluate(() => document.querySelector('[data-ig-list]').innerText.includes('No Mail Masonry'))));
  ok('3 already invited to this job: greyed, ticked, locked', await A.$eval('[data-ig-check="f0@fill.test"]', e => e.checked && e.disabled && getComputedStyle(e.closest('label')).opacity < 0.8).catch(() => false));
  await A.click('[data-ig-quick="all"]');
  ok('4 All subs → every sub with an e-mail (' + ALL_SUBS + ')', (await count(A)) === ALL_SUBS, await count(A));
  await A.click('[data-ig-quick="trades"]');
  ok('5 This job\'s trades (Electrical, Plumbing) → ' + TRADES_JOB, (await count(A)) === TRADES_JOB && (await checked(A)).every(e => !/^f\d+@/.test(e) || [1, 2].includes(+e.match(/\d+/)[0] % 5)), [await count(A)]);
  await A.click('[data-ig-quick="preferred"]');
  ok('6 ⭐ Preferred → the 3 preferred', JSON.stringify(await checked(A)) === JSON.stringify(['bids@voltpros.test', 'est@brightwire.test', 'office@smoothwalls.test'].sort()), await checked(A));
  await A.click('[data-ig-quick="recent"]');
  const rec = await A.$$eval('[data-ig-row]', l => l.map(r => r.getAttribute('data-ig-row')));
  ok('7 🕘 Recent invitees → other jobs in the last 90 days, newest first, no ⛔, not the 200-day-old one', JSON.stringify(rec) === JSON.stringify(['f3@fill.test', 'f5@fill.test', 'walkin@recent.test', 'f6@fill.test']) && (await count(A)) === 4, rec);
  await shot(A, 'invg_recent');
  /* the saved group with a ⛔ member: the chip selects the two others and says why */
  await A.waitForSelector('[data-ig-chip="Usual crew"]', { timeout: 10000 });
  await A.click('[data-ig-chip="Usual crew"]');
  ok('8 a group holding a ⛔ sub: chip selects the others, a note says the ⛔ one is not invited', (await count(A)) === 2 && /Do not use/.test(await A.$eval('[data-ig-note]', e => e.innerText).catch(() => '')), [await count(A)]);
  /* 💾 Save as group → Group 1 */
  await A.click('[data-ig-quick="preferred"]');
  await A.fill('[data-ig-q]', 'Filler 004'); await A.click('[data-ig-check="f4@fill.test"]'); await A.fill('[data-ig-q]', '');
  ok('9 ticking one more → 4 selected', (await count(A)) === 4, await count(A));
  await A.click('[data-ig-save]');
  ok('10 the name box offers "Group 1"', (await A.inputValue('[data-ig-name]')) === 'Group 1', await A.inputValue('[data-ig-name]'));
  await A.click('[data-ig-save-ok]');
  ok('11 Group 1 saved server-side with e-mail + name/company', await until(() => groupsRow().some(g => g.name === 'Group 1' && g.members.length === 4 && g.members.some(m => m.email === 'f4@fill.test' && m.company === 'Filler 004 Concrete'))), groupsRow());
  await A.waitForSelector('[data-ig-chip="Group 1"]', { timeout: 10000 });
  const g1 = (await checked(A));
  /* reload → the chip selects the same people */
  await A.reload(); await openJob(A, 'Private Fit-out Demo');
  await A.waitForSelector('[data-ig-chip="Group 1"]', { timeout: 10000 });
  ok('12 after a reload nothing is selected', (await count(A)) === 0);
  await A.click('[data-ig-chip="Group 1"]');
  ok('13 the Group 1 chip selects the same 4 people', JSON.stringify(await checked(A)) === JSON.stringify(g1) && g1.length === 4, [await checked(A), g1]);
  /* rename / edit (remove one) */
  await A.click('[data-ig-edit="Group 1"]');
  await A.fill('[data-ig-rename]', 'Electric regulars');
  await A.click('[data-ig-check="office@smoothwalls.test"]');
  await A.click('[data-ig-update]');
  ok('14 rename + remove one → saved as "Electric regulars" with 3', await until(() => groupsRow().some(g => g.name === 'Electric regulars' && g.members.length === 3 && !g.members.some(m => m.email === 'office@smoothwalls.test')) && !groupsRow().some(g => g.name === 'Group 1')), groupsRow());
  ok('15 the chip shows the new name', await A.waitForSelector('[data-ig-chip="Electric regulars"]', { timeout: 10000 }).then(() => true, () => false) && !(await A.$('[data-ig-chip="Group 1"]')));
  /* delete "Usual crew" → gone from the chips, kept (archived) in the row */
  await A.click('[data-ig-edit="Usual crew"]'); await A.click('[data-ig-del]');
  ok('16 delete → chip gone, the group is archived (kept), not purged', await until(async () => !(await A.$('[data-ig-chip="Usual crew"]'))) && groupsRow().some(g => g.id === 'g_usual' && g.archivedAt && g.archivedBy === 'owner@grayco-cs.com'), groupsRow());
  ok('17 nothing was sent by picking, saving or deleting', MAIL.length === 0 && !CALLS.some(c => /invite-send/.test(c)), MAIL.length);
  /* send to all 130: add a manual one so All subs = 130 → 2 chunks */
  putRow('users', 'u_b', { id: 'u_b', role: 'sub', approved: true, email: 'b@sub.test', name: 'Bea Beta', company: 'Beta Concrete', trades: ['Concrete'] }, { user_id: 'u_b', email: 'b@sub.test' });
  await A.reload(); await openJob(A, 'Private Fit-out Demo');
  await A.click('[data-ig-quick="all"]');
  ok('18 All subs → 130', (await count(A)) === 130, await count(A));
  await A.click('[data-ig-send]');
  const cf = await A.$eval('[data-ig-confirm]', e => e.innerText).catch(() => '');
  ok('19 one inline confirm step: "Invite 130 subs? They each get the e-mail now"', /Invite 130 subs\?/.test(cf) && /e-mail now/.test(cf) && MAIL.length === 0 && dialogs.length === 0, cf);
  await shot(A, 'invg_confirm');
  const c0 = CALLS.length;
  await A.click('[data-ig-yes]');
  ok('20 progress line, then done 130 / 130', await A.waitForSelector('[data-ig-progress="done"]', { timeout: 60000 }).then(() => true, () => false) && /130 \/ 130/.test(await A.$eval('[data-ig-progress]', e => e.innerText)), await A.$eval('[data-ig-progress]', e => e.innerText).catch(() => ''));
  const sends = CALLS.slice(c0).filter(c => /invite-send/.test(c));
  const privInv = rowsOf('invites').map(r => r.data).filter(r => r.jobId === 'J_PRIV');
  ok('21 sent in 2 chunks (≤100 each) → 130 new invites + the 1 already there, 130 e-mails', sends.length === 2 && privInv.length === 131 && MAIL.length === 130, [sends, privInv.length, MAIL.length]);
  ok('22 ⛔ never invited or e-mailed; the already-invited one not e-mailed again', !privInv.some(r => r.email === 'bad@dnu.test') && !MAIL.some(m => [].concat(m.to).includes('bad@dnu.test') || [].concat(m.to).includes('f0@fill.test')));
  ok('23 the invited are now greyed and ticked', await A.$eval('[data-ig-check="f77@fill.test"]', e => e.checked && e.disabled).catch(() => false) && (await count(A)) === 0);
  ok('24 no browser confirm() / alert used', dialogs.length === 0, dialogs);
  /* the server never invites a ⛔ sub in a bulk send even when asked */
  const sv = await F.sp._hub.inviteSend({ isAdmin: true, email: 'owner@grayco-cs.com' }, { jobId: 'J_PHONE', emails: ['bad@dnu.test'], as: 'sub', skipDnu: true });
  ok('25 server: a bulk send skips a ⛔ e-mail', sv.skippedDnu === 1 && !rowsOf('invites').some(r => r.data.jobId === 'J_PHONE' && r.data.email === 'bad@dnu.test'), sv);
  /* the old single invite still works */
  await A.fill('[data-invite-company]', 'Brand New Roofing Co'); await A.fill('[data-invite-email]', 'hello@newroof.test'); await A.click('[data-invite-send]');
  ok('26 the single invite (company + e-mail) still works', await until(() => rowsOf('invites').map(r => r.data).some(r => r.jobId === 'J_PRIV' && r.email === 'hello@newroof.test' && r.company === 'Brand New Roofing Co')));

  /* ── phone ── */
  const P = await page(await W.bidsCtx(browser, BUILD, F, 'phone'));
  await W.bidsLogin(P, 'owner@grayco-cs.com', 'Admin-Pass-1');
  await openJob(P, 'Phone Warehouse Demo');
  const fits = () => P.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('[data-ig] button, [data-ig] input, [data-ig] select')].every(e => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= innerWidth + 1); }));
  ok('P1 phone: the picker fits the screen, no sideways scroll', await fits());
  await shot(P, 'invg_phone');
  ok('P2 phone: already invited greyed + ticked', await P.$eval('[data-ig-check="f3@fill.test"]', e => e.checked && e.disabled).catch(() => false));
  await P.click('[data-ig-quick="all"]');
  ok('P3 phone: All subs (130 + the hand-typed recent invitee − 1 already invited here)', (await count(P)) === 131, await count(P));
  await P.click('[data-ig-quick="trades"]');
  const dw = 1 + 1 + SUBS.filter(x => /^S_f/.test(x.id) && x.trade === 'Drywall').length;   /* u_a + Smooth Walls + 25 fillers */
  ok('P4 phone: This job\'s trades (Drywall) → ' + dw, (await count(P)) === dw, await count(P));
  await P.click('[data-ig-quick="preferred"]');
  ok('P5 phone: ⭐ Preferred → 3', (await count(P)) === 3);
  await P.click('[data-ig-quick="recent"]');
  const prec = await P.$$eval('[data-ig-row]', l => l.map(r => r.getAttribute('data-ig-row')));
  ok('P6 phone: 🕘 Recent invitees now include the 130 invited to the other job, ⛔ excluded', prec.length > 100 && !prec.includes('bad@dnu.test') && (await count(P)) === prec.filter(e => e !== 'f3@fill.test').length, [prec.length, await count(P)]);
  await P.waitForSelector('[data-ig-chip="Electric regulars"]', { timeout: 10000 }); await P.click('[data-ig-chip="Electric regulars"]');
  ok('P7 phone: the saved group chip selects its 3 people', JSON.stringify(await checked(P)) === JSON.stringify(['bids@voltpros.test', 'est@brightwire.test', 'f4@fill.test'].sort()), await checked(P));
  ok('P8 phone: ⛔ never listed', !(await P.$('[data-ig-row="bad@dnu.test"]')));
  const m0 = MAIL.length;
  await P.click('[data-ig-send]'); await P.click('[data-ig-cancel]');
  ok('P9 phone: Cancel on the confirm sends nothing', MAIL.length === m0 && !(await P.$('[data-ig-confirm]')));
  await P.click('[data-ig-send]'); await P.click('[data-ig-yes]');
  ok('P10 phone: sending the group → 3 invites e-mailed', await until(() => rowsOf('invites').map(r => r.data).filter(r => r.jobId === 'J_PHONE').length === 4 && MAIL.length === m0 + 3), [MAIL.length - m0]);
  ok('P11 phone: still no sideways scroll', await fits());
  ok('27 no page errors', errs.length === 0, errs);
} catch (e) { ok('no crash', false, String(e && e.stack || e)); }
await browser.close();
const n = R.filter(Boolean).length; console.log(`\n${n} passed, ${R.length - n} failed`); process.exit(R.every(Boolean) ? 0 : 1);
