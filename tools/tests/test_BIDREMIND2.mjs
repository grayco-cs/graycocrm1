// test_BIDREMIND2.mjs <build-dir> [--no-browser] — patch ADDEDIT (+ BIDREMIND2), offline. The REAL subportal.js (bid site), portal-access.js
// (sub portal), bid-hub.js (the CRM's 🏗 Bid portal) on qaa_world's in-memory Supabase; the built subportal/ and the CRM (offline harness) in
// Chromium. Made-up people, jobs and files only; e-mail captured where it would reach Resend — nothing leaves the machine.
//   A. ✎ Edit a posted addendum (owner 11/23: "I need to be able to edit an addendum there too"):
//      title / date / what changed / files +/− / the bid due date; the history (who, when, old text, a removed file kept); subs who acknowledged
//      are asked again ("Updated <date>"); the optional e-mail waits on ✅ Approvals (held in ⏸ data-entry mode); who may; the sub portal; the
//      bid site and the CRM screens.
//   R. bid-due reminders (BIDREMIND2, owner 11/23): who (✋ bidding / opened / asked for plans; never bid / 🚫 not bidding), when (3 days
//      before + the due day, mornings Central), once per step per person per job, a moved due date starts over, never draft / closed /
//      bidding-closed / deleted, the switch, data-entry mode, the 🔔 notice on the bid site and the sub portal, ✋ / 🚫 on both sites.
//   S. the bid due date stays in sync (Edit Job Details / Manage → Details / addendum → job, list, sub portal, CRM, reminders; a Lead
//      Inbox re-sync keeps a person's date; subs are told on a date change, the e-mail on ✅ Approvals).
import path from 'path'; import fs from 'fs'; import crypto from 'crypto'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, TOK, STORE, putRow, rowData, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] && !/^--/.test(process.argv[2]) ? process.argv[2] : '.');
const NOB = process.argv.includes('--no-browser');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(250); } return false; };
const DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const now = new Date().toISOString();
W.install();
/* e-mail captured; the sub portal's own tables (sessions, links) in memory */
const MAIL = [], OUT = []; const f0 = globalThis.fetch;
const T = { gc_portal_lock: [], gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal: [], gc_portal_code: [] };
const sres = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)); init = init || {};
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return sres(200, { id: 'm' + MAIL.length }); }
  const tm = u.host === 'sb.test' && /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm && T[tm[1]]) {
    const tb = T[tm[1]], m = (init.method || 'GET').toUpperCase(), q = u.searchParams, val = v => decodeURIComponent(String(v)).replace(/^eq\./, '');
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => tb.push(Object.assign({ created_at: new Date().toISOString() }, r))); return sres(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) { if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue; if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k] == null ? '' : r[k]) === val(v)); else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > decodeURIComponent(v.slice(3))); }
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return sres(200, rows); }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return sres(204, ''); }
    return sres(200, JSON.parse(JSON.stringify(rows)));
  }
  if (u.host !== 'sb.test') OUT.push(u.host);
  return f0(url, init);
};
Object.assign(process.env, { RESEND_API_KEY: 'test-mail-key', CUST_QUIET_OFF: '1' }); delete process.env.PORTAL_MAIL_OFF;
['OWNER_EMAILS', 'SUBPORTAL_NOTIFY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].forEach(k => delete process.env[k]);
const F = W.fns(BUILD);
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));

/* ── the world ── */
const OWN = 'wjohnson@grayco-cs.com', EVE = 'eve@grayco-cs.com', PAT = 'pm@grayco-cs.com';
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('gc_automation_pause', { on: false });
W.H.cset('users', [{ id: 'u-wesley', name: 'Demo Owner', email: OWN, role: 'Admin', active: true }, { id: 'u-eve', name: 'Eve Estimator', email: EVE, role: 'Estimator', active: true }, { id: 'u-pm', name: 'Demo PM', email: PAT, role: 'Project Manager', active: true }]);
W.H.cset('projects', []);
W.H.cset('vendors', [{ id: 'SA', name: 'Alpha Drywall LLC', company: 'Alpha Drywall LLC', contact: 'Al Alpha', email: 'al@alpha.test', isSub: true, trade: 'Drywall' }]);
DB.gc_staff.push({ email: OWN, name: 'Demo Owner', role: 'admin', active: true }, { email: EVE, name: 'Eve Estimator', role: 'staff', profile: 'estimator', active: true }, { email: PAT, name: 'Demo PM', role: 'staff', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: OWN, name: 'Demo Owner', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: OWN });
putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'al@alpha.test', name: 'Al Alpha', company: 'Alpha Drywall LLC', trades: ['Drywall'], authUserId: 'auth-u_a' }, { user_id: 'u_a', email: 'al@alpha.test' });
putRow('users', 'u_b', { id: 'u_b', role: 'sub', approved: true, email: 'bo@bravo.test', name: 'Bo Bravo', company: 'Bravo Walls', trades: ['Drywall'], authUserId: 'auth-u_b' }, { user_id: 'u_b', email: 'bo@bravo.test' });
ACC[OWN] = { pw: 'Admin-Pass-1', id: 'auth-owner' }; ACC['al@alpha.test'] = { pw: 'Sub-Pass-1', id: 'auth-u_a' }; ACC['bo@bravo.test'] = { pw: 'Sub-Pass-2', id: 'auth-u_b' };
[OWN, EVE, PAT, 'al@alpha.test', 'bo@bravo.test'].forEach(e => { TOK['tok-' + e] = e; });
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(8), bidDueTime: '14:00', tradesSought: 'Drywall', createdAt: now }, x), { job_id: id });
job('JA', { title: 'Addenda Edit Demo', address: '9 Addenda Way' });
/* the sub portal: Alpha's session */
const SESS = 'S'.repeat(43), sha = b => crypto.createHash('sha256').update(b).digest('hex');
T.gc_portal_session.push({ id: sha(SESS), kind: 'partner', sub_id: 'SA', links: ['a'.repeat(43)], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now });
T.gc_sub_link.push({ token: 'a'.repeat(43), sub_id: 'SA', revoked: false });
const putStaff = (name, buf) => { const ref = 'staff/2026-11/' + crypto.randomBytes(4).toString('hex') + '-' + name.replace(/[^A-Za-z0-9._-]+/g, '_'); STORE.set('subportal-files/' + ref, buf); return ref; };

let ipN = 0; const ip = () => '10.9.' + Math.floor(++ipN / 250) + '.' + (ipN % 250);
const bid = async (email, action, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.grayco-cs.com', authorization: 'Bearer tok-' + email, 'x-nf-client-connection-ip': ip() }, body: JSON.stringify(Object.assign({ action }, body || {})) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { code: r.statusCode, j, raw: r.body }; };
const hub = async (email, body) => { const r = await F.hub.handler({ httpMethod: 'POST', headers: { origin: 'https://app.local', authorization: 'Bearer tok-' + email }, queryStringParameters: {}, body: JSON.stringify(body) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { code: r.statusCode, j, raw: r.body }; };
const portal = async (action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': SESS, 'x-nf-client-connection-ip': ip() }, body: JSON.stringify(Object.assign({ action }, body || {})) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { code: r.statusCode, j, raw: r.body }; };
const ja = () => rowData('jobs/JA');
const ad = n => (ja().addenda || []).find(a => Number(a.num) === n);
const queue = () => { let v = W.H.cget ? W.H.cget('gc_approval_queue') : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return Array.isArray(v) ? v : (v && Array.isArray(v.v) ? v.v : []); };

/* ═══════════════════ A. ✎ Edit a posted addendum ═══════════════════ */
console.log('\nA. ✎ Edit a posted addendum');
const f1 = putStaff('Addendum 1 - doors.pdf', W.PDF(1, 1200)), f2 = putStaff('Addendum 1 - doors REV.pdf', W.PDF(2, 1300));
let r = await bid(OWN, 'addendum-post', { jobId: 'JA', num: 1, title: 'Rough ins', date: DAY(0), text: 'Door hardware set 4.', files: [{ name: 'Addendum 1 - doors.pdf', size: 1200, type: 'application/pdf', fileRef: f1 }], newDue: DAY(10), notify: false });
ok('A1 posted Addendum #1 (due moved to ' + DAY(10) + ')', r.code === 200 && ad(1) && ja().bidDueDate === DAY(10) && ad(1).dueTo === DAY(10) + ' 14:00' && ad(1).dueFrom === DAY(8) + ' 14:00', r.raw);
r = await bid('al@alpha.test', 'save', { key: 'acks', upsert: [{ id: 'JA__a1__u_a', jobId: 'JA', num: 1 }] });
const ack0 = rowData('acks/JA__a1__u_a');
ok('A2 the sub acknowledges #1', r.code === 200 && ack0 && ack0.at, r.raw);
await sleep(20);
const q0 = queue().length;
r = await bid(OWN, 'addendum-edit', { jobId: 'JA', num: 1, title: 'Rough ins — revised', date: DAY(0), text: 'Door hardware set 4 and 5.', files: [{ name: 'Addendum 1 - doors REV.pdf', size: 1300, type: 'application/pdf', fileRef: f2 }], notify: false });
const a1 = ad(1);
ok('A3 bid site ✎ Edit: title, what changed and files (one off, one on) saved; the e-mail is off unless ticked (nothing on ✅ Approvals)', r.code === 200 && a1.title === 'Rough ins — revised' && a1.text === 'Door hardware set 4 and 5.' && a1.files.length === 1 && a1.files[0].fileRef === f2 && r.j.notice.status === 'not sent' && queue().length === q0 && MAIL.length === 0, { r: r.raw, a1 });
ok('A4 the history keeps the old version: who, when, the old title / text and the file taken off (still in storage)', (a1.history || []).length === 1 && a1.history[0].title === 'Rough ins' && a1.history[0].text === 'Door hardware set 4.' && a1.history[0].files[0].fileRef === f1 && a1.history[0].replacedBy === OWN && !!a1.history[0].replacedAt && STORE.has('subportal-files/' + f1), a1.history);
ok('A5 updatedAt / updatedBy on the addendum; the 🗂 Activity log says what changed', !!a1.updatedAt && a1.updatedBy === OWN && (ja().log || []).some(l => /✎ Addendum #1 edited: title · what changed · files/.test(l.what)), (ja().log || []).slice(-2));
let s = await bid('al@alpha.test', 'load', { keys: ['jobs', 'acks'] });
let sj = (s.j.data.jobs || []).find(x => x.id === 'JA'), sa = sj && sj.addenda.find(x => x.num === 1);
ok('A6 the sub sees the edited addendum with "Updated", never its history or who edited it', sa && sa.title === 'Rough ins — revised' && sa.updatedAt === a1.updatedAt && !('history' in sa) && !('updatedBy' in sa) && sa.files.length === 1 && !/history|replacedBy/.test(s.raw), sa);
ok('A7 the sub\'s earlier acknowledgement is older than the edit (asked again)', s.j.data.acks.find(k => k.id === 'JA__a1__u_a').at < sa.updatedAt);
r = await bid('al@alpha.test', 'save', { key: 'acks', upsert: [{ id: 'JA__a1__u_a', jobId: 'JA', num: 1 }] });
const ack1 = rowData('acks/JA__a1__u_a');
ok('A8 acknowledging again is saved (new time, the first time kept)', r.code === 200 && ack1.at > a1.updatedAt && ack1.firstAt === ack0.at, ack1);
await bid('al@alpha.test', 'save', { key: 'acks', upsert: [{ id: 'JA__a1__u_a', jobId: 'JA', num: 1 }] });
ok('A9 a second acknowledgement without a new edit changes nothing', rowData('acks/JA__a1__u_a').at === ack1.at);
r = await bid(OWN, 'addendum-edit', { jobId: 'JA', num: 1, newDue: DAY(12), notify: true });
const a1b = ad(1), qi = queue().find(x => x.id === (r.j.notice || {}).apprId);
ok('A10 the edit moves the bid due date: the job is due ' + DAY(12) + ' 14:00; the addendum says changed to it (was the date before the addendum)', r.code === 200 && ja().bidDueDate === DAY(12) && ja().bidDueTime === '14:00' && a1b.dueTo === DAY(12) + ' 14:00' && a1b.dueFrom === DAY(8) + ' 14:00' && a1b.history.length === 2, { r: r.raw, a1b });
ok('A11 "E-mail the subs" ticked → waits on ✅ Approvals ("Addendum #1 updated", both subs, acknowledge again); nothing e-mailed yet', r.j.notice.status === 'waiting' && qi && /Addendum #1 updated/.test(qi.subject) && /again/.test(qi.html) && qi.meta.to.length === 2 && MAIL.length === 0, { n: r.j.notice, qi: qi && [qi.subject, qi.meta.to] });
r = await bid(OWN, 'addendum-edit', { jobId: 'JA', num: 1, title: a1b.title, text: a1b.text });
ok('A12 saving with nothing changed is "Nothing changed" (no history line, no new updatedAt)', r.code === 200 && r.j.unchanged === true && ad(1).history.length === 2 && ad(1).updatedAt === a1b.updatedAt, r.raw);
const deny = await Promise.all([bid('al@alpha.test', 'addendum-edit', { jobId: 'JA', num: 1, text: 'x' }), hub(PAT, { op: 'addendumedit', jobId: 'JA', num: 1, text: 'x' }), bid(OWN, 'addendum-edit', { jobId: 'JA', num: 9, text: 'x' }), bid(OWN, 'addendum-edit', { jobId: 'JA', num: 1, title: '', text: '', files: [] }), bid(OWN, 'addendum-edit', { jobId: 'JA', num: 1, newDue: 'soon' })]);
ok('A13 who may: a sub 403, the PM (not admin / estimator / office) 403; no such addendum 404; an empty addendum 400; a bad date 400', JSON.stringify(deny.map(x => x.code)) === '[403,403,404,400,400]' && ad(1).title === a1b.title, deny.map(x => x.code + ' ' + x.j.error));
r = await hub(EVE, { op: 'addendumedit', jobId: 'JA', num: 1, text: 'Door hardware sets 4, 5 and 6.' });
ok('A14 the CRM (bid-hub op addendumedit) as the estimator: saved, history 3', r.code === 200 && ad(1).text === 'Door hardware sets 4, 5 and 6.' && ad(1).history.length === 3 && ad(1).updatedBy === EVE, r.raw);
W.H.cset('gc_automation_pause', { on: true, why: 'data entry (test)' });
r = await hub(OWN, { op: 'addendumedit', jobId: 'JA', num: 1, text: 'Door hardware sets 4–6 (final).', notify: true });
ok('A15 ⏸ data-entry mode: the e-mail about the update is held (nothing queued, nothing sent)', r.code === 200 && r.j.notice.status === 'held' && MAIL.length === 0, r.raw);
W.H.cset('gc_automation_pause', { on: false });
const pb = await portal('p-bidjobs');
const pj = pb.j.jobs && pb.j.jobs.find(x => x.id === 'JA'), pad = pj && pj.addenda.find(x => x.num === 1);
ok('A16 the sub portal 📋 Jobs to bid: the new due date and the edited addendum with its "Updated" time', pb.code === 200 && pj.bidDueDate === DAY(12) && pad.text === 'Door hardware sets 4–6 (final).' && pad.updatedAt === ad(1).updatedAt && !/history/.test(pb.raw), pb.raw.slice(0, 600));
const m = await F.hub.handler({ httpMethod: 'GET', headers: { origin: 'https://app.local', authorization: 'Bearer tok-' + OWN }, queryStringParameters: { manage: 'JA' } });
const mj = JSON.parse(m.body);
ok('A17 the CRM\'s 📂 Manage sees the history (staff only)', m.statusCode === 200 && mj.job.addenda[0].history.length === 4, m.body.slice(0, 300));

/* ── the screens ── */
if (!NOB) {
  const { chromium } = require(path.join(process.env.NODE_PATH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const errs = [], OPEN = [];
  const page = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); p.on('dialog', d => d.accept().catch(() => {})); await p.goto('https://bids.test/'); return p; };
  try {
    /* the bid site, admin (desk) */
    const A = await page(await W.bidsCtx(browser, BUILD, F, 'desktop'));
    await W.bidsLogin(A, OWN, 'Admin-Pass-1');
    await A.waitForSelector('h3:has-text("Addenda Edit Demo")', { timeout: 30000 }); await A.click('h3:has-text("Addenda Edit Demo")');
    await A.waitForSelector('[data-addedit-open="1"]', { timeout: 15000 });
    ok('B1 bid site (admin): the Addendum #1 card has ✎ Edit, "✎ Updated", and the history (4)', await A.$('[data-addupd="1"]') && /\(4\)/.test(await A.textContent('[data-addhist="1"] summary')));
    await A.click('[data-addedit-open="1"]');
    await A.waitForSelector('[data-addedit="form"]', { timeout: 5000 });
    ok('B2 the edit form is filled with the addendum (title, text, its file)', (await A.inputValue('[data-addedit="title"]')) === ad(1).title && (await A.inputValue('[data-addedit="text"]')) === ad(1).text && (await A.$$('[data-addedit="file"]')).length === 1);
    await A.fill('[data-addedit="text"]', 'Door hardware sets 4–6; frames HM.');
    await A.click('[data-addedit="rmfile"]');
    await A.setInputFiles('[data-addedit="pick"]', [{ name: 'Addendum 1 - frames.pdf', mimeType: 'application/pdf', buffer: W.PDF(3, 1500) }]);
    await A.waitForSelector('[data-addedit="file"]:has-text("frames")', { timeout: 15000 });
    await A.click('[data-addedit="save"]');
    ok('B3 💾 Save → saved on the server (text, the new file in, the old one in the history only)', await until(() => { const a = ad(1); return a.text === 'Door hardware sets 4–6; frames HM.' && a.files.length === 1 && /frames/.test(a.files[0].name) && a.history.length === 5 && a.history[4].files.some(f => f.fileRef === f2); }, 20000), ad(1));
    const b4 = await until(async () => /frames HM/.test(await A.textContent('[data-addendum="1"]').catch(() => '')) && !(await A.$('[data-addedit="form"]')), 15000);
    ok('B4 the form closes and the card shows the new text', b4, b4 ? '' : await A.textContent('[data-addendum="1"]').catch(e => e.message));
    /* "Now due": the job's date moved after the addendum (📂 Manage → 📝 Details) */
    await hub(OWN, { op: 'details', jobId: 'JA', due: DAY(14), dueTime: '14:00' });
    await A.reload(); await A.waitForSelector('h3:has-text("Addenda Edit Demo")', { timeout: 30000 }).catch(() => {}); await A.click('h3:has-text("Addenda Edit Demo")').catch(() => {});
    ok('B5 the card keeps "Bid due date changed to ' + DAY(12) + ' 14:00" as history and adds "Now due: ' + DAY(14) + ' 14:00"', await A.waitForSelector('[data-nowdue="1"]', { timeout: 15000 }).then(async () => /Now due:\s*/.test(await A.textContent('[data-nowdue="1"]')) && (await A.textContent('[data-nowdue="1"]')).includes(DAY(14)) && (await A.textContent('[data-addendum="1"]')).includes(DAY(12) + ' 14:00'), () => false));
    /* the sub (phone): asked to acknowledge again */
    const S = await page(await W.bidsCtx(browser, BUILD, F, 'phone'));
    await W.bidsLogin(S, 'al@alpha.test', 'Sub-Pass-1');
    await S.waitForSelector('h3:has-text("Addenda Edit Demo")', { timeout: 30000 }); await S.click('h3:has-text("Addenda Edit Demo")');
    ok('B6 bid site (sub, phone): "Updated", "please acknowledge again" and the ✍️ button; no ✎ Edit and no history', await S.waitForSelector('[data-reack="1"]', { timeout: 15000 }).then(() => true, () => false) && !!(await S.$('[data-addupd="1"]')) && !!(await S.$('[data-ack="1"]')) && !(await S.$('[data-addedit-open="1"]')) && !(await S.$('[data-addhist="1"]')));
    const before = rowData('acks/JA__a1__u_a').at;
    await S.click('[data-ack="1"]');
    ok('B7 ✍️ acknowledge again → saved with a new time; the page shows ✓ Acknowledged', await until(() => rowData('acks/JA__a1__u_a').at > ad(1).updatedAt && rowData('acks/JA__a1__u_a').at !== before) && await S.waitForSelector('[data-addendum="1"]:has-text("Acknowledged")', { timeout: 10000 }).then(() => true, () => false));
    ok('B8 no sideways scroll on the phone', !(await S.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    ok('B9 no page errors (bid site)', errs.length === 0, errs);
    /* the CRM: 📂 Manage → 📎 Addenda */
    const C = await W.H.computer(OWN, { build: BUILD }); OPEN.push(C);
    C.page().on('dialog', d => d.accept().catch(() => {}));
    await W.wireCrm(C, BUILD, F);
    ok('C1 the admin signs in to the CRM', await W.H.signIn(C, OWN, 60000));
    await W.H.waitFor(C, () => !!window._gcSys2, null, 60000);
    await C.ev(() => window._gcSys2.open('JA', 'addenda'));
    const card = await W.H.waitFor(C, () => { const c = document.querySelector('#gcsys2 [data-addendum="1"]'); return c && c.querySelector('[data-a="aedit"]') ? c.innerText : null; }, null, 20000);
    ok('C2 📎 Addenda: ✎ Edit, "✎ Updated", "📅 Now due", "acknowledged" and the History', !!card && /✎ Updated/.test(card) && /Now due: /.test(card) && card.includes(DAY(14)) && /History \(5\)/.test(card), card);
    await C.ev(() => document.querySelector('#gcsys2 [data-a="aedit"][data-n="1"]').click());
    await W.H.waitFor(C, () => !!document.querySelector('#gcsys2 [data-addedit="1"]'), null, 5000);
    await C.ev(() => { const t = document.querySelector('#gcsys2 [data-k="aetext1"]'); t.value = 'Door hardware sets 4–6; frames HM; closers.'; document.querySelector('#gcsys2 [data-a="aerm"]').click(); });
    await sleep(300);
    const kept = await C.ev(() => document.querySelector('#gcsys2 [data-k="aetext1"]').value);
    await C.ev(() => document.querySelector('#gcsys2 [data-a="aesave"]').click());
    ok('C3 ✎ Edit → 💾 Save (a file taken off; the typed text kept through the redraw) → bid-hub op addendumedit saved it', kept === 'Door hardware sets 4–6; frames HM; closers.' && await until(() => ad(1).text === 'Door hardware sets 4–6; frames HM; closers.' && ad(1).files.length === 0 && ad(1).history.length === 6, 20000), { kept, a: ad(1) });
    const ack = await W.H.waitFor(C, () => { const x = document.querySelector('#gcsys2 [data-acks="1"]'); return x && /before the update/.test(x.innerText) && !document.querySelector('#gcsys2 [data-addedit="1"]') ? x.innerText : null; }, null, 20000);
    ok('C4 the form closes; Alpha\'s acknowledgement (made before this edit) shows as "before the update (asked again)"', !!ack, ack);
    ok('C5 no page errors (CRM)', !C.errs.length, C.errs.slice(0, 5));
  } finally { for (const c of OPEN) await c.close().catch(() => {}); await browser.close(); }
}

/* ═══════════════════ R. bid-due reminders ═══════════════════ */
console.log('\nR. bid-due reminders (3 days before + the due day)');
const BM = require(path.join(BUILD, 'netlify/functions/_lib/bidmail.js'));
const BA = require(path.join(BUILD, 'netlify/functions/bid-alerts.js'));   /* installs the ⏸ data-entry guard, as in production */
const TODAY = BM.chiDay(Date.now()), D3 = BM.addDays(TODAY, 3);
const mk = (id, role, extra) => { const e = id + '@subs.test'; putRow('users', id, Object.assign({ id, role, approved: true, email: e, name: 'Name ' + id, company: 'Co ' + id, trades: ['Drywall'], authUserId: 'auth-' + id }, extra || {}), { user_id: id, email: e }); ACC[e] = { pw: 'Pw-' + id, id: 'auth-' + id }; TOK['tok-' + e] = e; return e; };
const E = { yes: mk('u_yes', 'sub'), view: mk('u_view', 'sub'), plans: mk('u_plans', 'sub'), bid: mk('u_bid', 'sub'), no: mk('u_no', 'sub'), none: mk('u_none', 'sub'), sup: mk('u_sup', 'supplier', { trades: [] }), es: mk('u_es', 'sub', { lang: 'es' }) };
job('JR3', { title: 'Reminder Three Day Demo', bidDueDate: D3, bidDueTime: '14:00', suppliersCanQuote: true });
job('JR0', { title: 'Reminder Due Today Demo', bidDueDate: TODAY, bidDueTime: '23:59' });
job('JR5', { title: 'Reminder Five Day Demo', bidDueDate: BM.addDays(TODAY, 5) });
job('JRD', { title: 'Reminder Draft Demo', bidDueDate: D3, status: 'draft', draft: true, visibility: 'private' });
job('JRC', { title: 'Reminder Closed Bidding Demo', bidDueDate: D3, biddingClosed: true });
job('JRX', { title: 'Reminder Closed Job Demo', bidDueDate: D3, status: 'closed' });
job('JRG', { title: 'Reminder Deleted Demo', bidDueDate: D3, status: 'archived', archivedAt: now });
const view = async (email, jobId) => (await bid(email, 'save', { key: 'activity', upsert: [{ id: 'a_' + crypto.randomBytes(4).toString('hex'), jobId, kind: 'view' }] })).code;
let rr = await bid(E.yes, 'bid-intent', { jobId: 'JR3', intent: 'yes' });
ok('R1 bid site ✋ I\'m bidding is saved (intents row)', rr.code === 200 && (rowData('intents/JR3__u_yes') || {}).intent === 'yes', rr.raw);
const vc = [await view(E.view, 'JR3'), await view(E.view, 'JR0'), await view(E.es, 'JR3'), await view(E.no, 'JR3'), await view(E.bid, 'JR3')];
await bid(E.no, 'bid-intent', { jobId: 'JR3', intent: 'no' });
await bid(E.bid, 'bid-intent', { jobId: 'JR3', intent: 'yes' });
putRow('bids', 'b_rb', { id: 'b_rb', jobId: 'JR3', userId: 'u_bid', userEmail: E.bid, amount: 5000 }, { job_id: 'JR3', user_id: 'u_bid' });
putRow('planreqs', 'JR3__u_plans', { id: 'JR3__u_plans', jobId: 'JR3', userId: 'u_plans', email: E.plans, at: now, status: 'open' }, { job_id: 'JR3', user_id: 'u_plans', email: E.plans });
putRow('activity', 'a_sup', { id: 'a_sup', jobId: 'JR3', userId: 'u_sup', kind: 'view', at: now }, { job_id: 'JR3', user_id: 'u_sup' });
for (const j of ['JRD', 'JRC', 'JRX', 'JRG', 'JR5']) { putRow('intents', j + '__u_yes', { id: j + '__u_yes', jobId: j, userId: 'u_yes', intent: 'yes' }, { job_id: j, user_id: 'u_yes' }); putRow('activity', 'a_v_' + j, { id: 'a_v_' + j, jobId: j, userId: 'u_view', kind: 'view', at: now }, { job_id: j, user_id: 'u_view' }); }
ok('R2 bid-site views are logged for the subs who opened the jobs', vc.every(c => c === 200) && rowsOf('activity').filter(r => r.job_id === 'JR3' && r.data.kind === 'view').length >= 4, vc);
MAIL.length = 0;
W.H.cset('gc_automation_pause', { on: true, why: 'data entry (test)' });   /* trade e-mails go in data-entry mode too */
let dr = await BM.dueReminders({ today: TODAY });
const to = e => MAIL.filter(m => [].concat(m.to).includes(e));
ok('R3 3 days before: ✋ bidding, opened, asked for plans, the supplier who opened it (quotes open) and the Spanish sub get "Bid due in 3 days" — in data-entry mode too', [E.yes, E.view, E.plans, E.sup].every(e => to(e).some(m => m.subject === 'Bid due in 3 days: Reminder Three Day Demo')) && to(E.es).some(m => /vence en 3 días: Reminder Three Day Demo/.test(m.subject)), { dr, mails: MAIL.map(m => [m.to, m.subject]) });
ok('R4 never the sub who already bid, the one who said 🚫 Not bidding, or one who never showed interest', !to(E.bid).length && !to(E.no).length && !to(E.none).length, MAIL.map(m => [m.to, m.subject]));
const m3 = to(E.yes)[0] || { html: '' };
ok('R5 the e-mail has the due date + time and a link straight to the job', m3.html.includes(D3 + ' 14:00') && /\?open=JR3/.test(m3.html), m3.html.slice(0, 400));
ok('R6 the due day: "Bid due today" to the sub who opened JR0', to(E.view).some(m => m.subject === 'Bid due today: Reminder Due Today Demo'), to(E.view).map(m => m.subject));
ok('R7 nothing for a draft, ⏸ bidding-closed, closed or deleted job, or one due in 5 days', !MAIL.some(m => /Draft Demo|Closed Bidding|Closed Job|Deleted Demo|Five Day/.test(m.subject)), MAIL.map(m => m.subject));
const nNotes = rowsOf('duenotes').length, nMail = MAIL.length;
dr = await BM.dueReminders({ today: TODAY });
ok('R8 once: the second run the same day sends nothing new', MAIL.length === nMail && rowsOf('duenotes').length === nNotes && dr.notes === 0, dr);
W.H.cset('gc_automation_pause', { on: false });
/* the notice on both sites */
let st = await bid(E.yes, 'my-bidstate', {});
const nt = (st.j.notes || []).find(n => n.jobId === 'JR3');
ok('R9 bid site 🔔: the reminder is the sub\'s notice (title, due), and their ✋ answer', st.code === 200 && nt && nt.title === 'Bid due in 3 days: Reminder Three Day Demo' && /14:00/.test(nt.body) && !nt.readAt && st.j.intents.JR3 === 'yes', st.raw.slice(0, 500));
T.gc_portal_session.push({ id: sha('Y'.repeat(43)), kind: 'partner', sub_id: 'SY', links: ['y'.repeat(43)], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now });
T.gc_sub_link.push({ token: 'y'.repeat(43), sub_id: 'SY', revoked: false });
W.H.cset('vendors', [{ id: 'SA', name: 'Alpha Drywall LLC', company: 'Alpha Drywall LLC', email: 'al@alpha.test', isSub: true, trade: 'Drywall' }, { id: 'SY', name: 'Co u_yes', company: 'Co u_yes', email: E.yes, isSub: true, trade: 'Drywall' }]);
const portalAs = async (sess, action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': sess, 'x-nf-client-connection-ip': ip() }, body: JSON.stringify(Object.assign({ action }, body || {})) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { code: r.statusCode, j, raw: r.body }; };
let pp = await portalAs('Y'.repeat(43), 'p-bidjobs');
const pj3 = pp.j.jobs && pp.j.jobs.find(x => x.id === 'JR3');
ok('R10 sub portal 📋 Jobs to bid: the 🔔 reminder on top and on the job, ✋ "bidding", the due date and time', pp.code === 200 && (pp.j.reminders || []).some(n => n.jobId === 'JR3') && pj3 && pj3.reminder && pj3.reminder.jobId === 'JR3' && pj3.intent === 'yes' && pj3.bidDueDate === D3 && pj3.bidDueTime === '14:00', pp.raw.slice(0, 600));
rr = await portalAs('Y'.repeat(43), 'p-bid-note-read', { ids: [nt.id] });
st = await bid(E.yes, 'my-bidstate', {});
ok('R11 dismissed in the sub portal → read on the bid site too (one notice, both sites)', rr.code === 200 && rr.j.read === 1 && st.j.notes.find(n => n.id === nt.id).readAt, rr.raw);
rr = await portalAs('Y'.repeat(43), 'p-bid-view', { jobId: 'JR5' });
const rr2 = await portalAs('Y'.repeat(43), 'p-bid-intent', { jobId: 'JR5', intent: 'no' });
const rr3 = await portalAs('Y'.repeat(43), 'p-bid-intent', { jobId: 'JRD', intent: 'yes' });
ok('R12 sub portal: opening a job logs a view; 🚫 Not bidding is saved; a job they cannot see is refused', rr.code === 200 && rowsOf('activity').some(r => r.job_id === 'JR5' && r.user_id === 'u_yes' && r.data.via === 'portal') && rr2.code === 200 && rowData('intents/JR5__u_yes').intent === 'no' && rr3.code === 403, [rr.raw, rr2.raw, rr3.raw]);
/* patch LATEBID: a view carries the server's time (a past-due job stays on the sub's list only when it was opened BEFORE the due date) */
{ const vw = rowsOf('activity').filter(r => r.data && r.data.kind === 'view'); const t0 = Date.now();
  ok('R12b LATEBID: every logged view (bid site and sub portal) has its time, set by the server', vw.length > 0 && vw.every(r => { const x = Date.parse(r.data.at); return x > t0 - 3600e3 && x <= t0 + 1000; }), vw.map(r => r.data.at)); }
/* a moved due date starts over */
putRow('jobs', 'JR3', Object.assign({}, rowData('jobs/JR3'), { bidDueDate: BM.addDays(TODAY, 4) }), { job_id: 'JR3' });
const n0 = MAIL.length; await BM.dueReminders({ today: TODAY });
ok('R13 due date moved to 4 days out: nothing today', MAIL.length === n0);
await BM.dueReminders({ today: BM.addDays(TODAY, 1) });
ok('R14 the next morning (3 days before the NEW date): "Bid due in 3 days" again to the same people (the step follows the date)', to(E.yes).filter(m => /Three Day Demo/.test(m.subject)).length === 2 && to(E.view).filter(m => /Three Day Demo/.test(m.subject)).length === 2 && !to(E.bid).length, MAIL.slice(n0).map(m => [m.to, m.subject]));
/* the switch */
let sw = await bid(OWN, 'bidmail-cfg', { op: 'get' });
ok('R15 📧 Bid site e-mails: "Bid due reminders" is a switch, ON by default', sw.code === 200 && sw.j.switches.dueSoon === true && (sw.j.list || []).some(x => x.k === 'dueSoon'), sw.raw.slice(0, 400));
await bid(OWN, 'bidmail-cfg', { op: 'set', switches: Object.assign({}, sw.j.switches, { dueSoon: false }) });
putRow('jobs', 'JR0b', { id: 'JR0b', title: 'Reminder Switch Demo', status: 'open', visibility: 'public', bidDueDate: TODAY, bidDueTime: '23:59', tradesSought: 'Drywall' }, { job_id: 'JR0b' });
putRow('activity', 'a_sw', { id: 'a_sw', jobId: 'JR0b', userId: 'u_view', kind: 'view', at: now }, { job_id: 'JR0b', user_id: 'u_view' });
const n1 = MAIL.length; dr = await BM.dueReminders({ today: TODAY });
ok('R16 switched off → nothing sent', dr.off === true && MAIL.length === n1, dr);
await bid(OWN, 'bidmail-cfg', { op: 'set', switches: Object.assign({}, sw.j.switches, { dueSoon: true }) });
const tomlTxt = fs.readFileSync(path.join(BUILD, 'netlify.toml'), 'utf8');
const hourAt = (utc) => BA._dueHour(Date.parse(utc));
ok('R17 the scheduled run: bid-alerts every 10 minutes; the reminders run from 8 to 11:59 AM Central (CST and CDT), not before or after', /\[functions\."bid-alerts"\]\s*\n\s*schedule = "\*\/10 \* \* \* \*"/.test(tomlTxt) && hourAt('2026-12-01T14:05:00Z') && !hourAt('2026-12-01T13:55:00Z') && !hourAt('2026-12-01T18:05:00Z') && hourAt('2026-07-01T13:05:00Z') && !hourAt('2026-07-01T12:55:00Z') && /dueHour\(\)\) out\.dueReminders/.test(fs.readFileSync(path.join(BUILD, 'netlify/functions/bid-alerts.js'), 'utf8')));

/* ═══════════════════ S. the bid due date stays in sync ═══════════════════ */
console.log('\nS. the bid due date stays in sync');
const MS = MAIL.length, Q0 = queue().length;
job('JS', { title: 'Sync Demo', bidDueDate: BM.addDays(TODAY, 10), bidDueTime: '14:00', crmProjectId: '' });
await bid('al@alpha.test', 'save', { key: 'activity', upsert: [{ id: 'a_js1', jobId: 'JS', kind: 'view' }] });
r = await bid(OWN, 'addendum-post', { jobId: 'JS', num: 1, title: 'Rough ins', text: 'Rough-in changes.', newDue: BM.addDays(TODAY, 11), notify: false });
/* ✎ Edit Job Details on the bid site (the page saves the whole job record) */
const page0 = Object.assign({}, rowData('jobs/JS'), { bidDueDate: BM.addDays(TODAY, 13), _detailsSave: true });
r = await bid(OWN, 'save', { key: 'jobs', upsert: [page0] });
const js = rowData('jobs/JS');
ok('S1 ✎ Edit Job Details → the job\'s bid due date is the new one; stamped as set by a person', r.code === 200 && js.bidDueDate === BM.addDays(TODAY, 13) && !!js.dueSetAt && js.dueSetBy === OWN, { r: r.raw, d: js.bidDueDate });
const msgs = rowsOf('messages').filter(x => x.job_id === 'JS' && /Bid due date changed to/.test(x.data.body));
const qS = queue().slice(Q0).find(x => x.meta && x.meta.jobId === 'JS');
ok('S2 the subs who can see the job are told: "Bid due date changed to … (was …)" on the bid site at once; the e-mail waits on ✅ Approvals (nothing e-mailed)', msgs.length >= 1 && msgs[0].data.body.includes(BM.addDays(TODAY, 13)) && msgs[0].data.body.includes('was ' + BM.addDays(TODAY, 11)) && !!qS && MAIL.length === MS, { msgs: msgs.map(x => x.data.body), q: qS && qS.subject });
s = await bid('al@alpha.test', 'load', { keys: ['jobs'] });
sj = s.j.data.jobs.find(x => x.id === 'JS'); sa = sj.addenda[0];
ok('S3 the sub\'s bid site: the job header date is new; the addendum keeps its history ("changed to ' + BM.addDays(TODAY, 11) + '") — the page adds "Now due"', sj.bidDueDate === BM.addDays(TODAY, 13) && sa.dueTo === BM.addDays(TODAY, 11) + ' 14:00');
const pb2 = await portal('p-bidjobs'); const pjs = pb2.j.jobs.find(x => x.id === 'JS');
const hl = await F.hub.handler({ httpMethod: 'GET', headers: { origin: 'https://app.local', authorization: 'Bearer tok-' + OWN }, queryStringParameters: { jobs: '1' } }); const hj = (JSON.parse(hl.body).jobs || []).find(x => x.id === 'JS');
ok('S4 the sub portal 📋 Jobs to bid and the CRM\'s 🏗 Bid portal list show the new date', pjs && pjs.bidDueDate === BM.addDays(TODAY, 13) && hj && hj.due === BM.addDays(TODAY, 13), { p: pjs && pjs.bidDueDate, h: hj && hj.due });
/* the Lead Inbox re-sync (bid-portal.js) no longer puts the lead's date back */
const BPm = require(path.join(BUILD, 'netlify/functions/_lib/bid-portal.js'));
const BPI = BPm.make({ env: () => '', s: v => v == null ? '' : String(v).trim(), low: v => (v == null ? '' : String(v)).trim().toLowerCase(), arr: v => Array.isArray(v) ? v : [], nowIso: () => new Date().toISOString(), sbUrl: () => 'https://sb.test', svcH: x => Object.assign({ apikey: 'svc', Authorization: 'Bearer svc' }, x || {}), kvCas: async () => [], kvGet: async () => [] });
const item = { id: 'LI_sync', title: 'Lead Sync Demo', bidDue: BM.addDays(TODAY, 9) + 'T10:00', address: '1 Lead Rd', files: [] };
let d1 = await BPI.draft(item); const ljId = d1.jobId;
putRow('jobs', ljId, Object.assign({}, rowData('jobs/' + ljId), { draft: false, status: 'open', visibility: 'public' }), { job_id: ljId });
await bid(OWN, 'save', { key: 'jobs', upsert: [Object.assign({}, rowData('jobs/' + ljId), { bidDueDate: BM.addDays(TODAY, 15), _detailsSave: true })] });
await BPI.draft(Object.assign({}, item, { rev: 2, bidDue: BM.addDays(TODAY, 9) + 'T10:00', notes: ['a new e-mail about the job'] }));
ok('S5 root cause: a Lead Inbox update (a new e-mail on the lead) used to put the lead\'s date back on the bid job — the date a person set now stays', d1.ok && rowData('jobs/' + ljId).bidDueDate === BM.addDays(TODAY, 15), { d1, now: rowData('jobs/' + ljId).bidDueDate });
ok('S6 a lead job nobody changed by hand still follows the lead\'s date', await (async () => { const it2 = { id: 'LI_follow', title: 'Lead Follow Demo', bidDue: BM.addDays(TODAY, 9), files: [] }; const x = await BPI.draft(it2); await BPI.draft(Object.assign({}, it2, { bidDue: BM.addDays(TODAY, 12) })); return rowData('jobs/' + x.jobId).bidDueDate === BM.addDays(TODAY, 12); })());
/* the addendum edit that moves the date with "E-mail the subs" NOT ticked is not silent */
const q1 = queue().length;
r = await bid(OWN, 'addendum-edit', { jobId: 'JS', num: 1, newDue: BM.addDays(TODAY, 14), notify: false });
const msg2 = rowsOf('messages').filter(x => x.job_id === 'JS' && /addendum #1 was updated/.test(x.data.body));
ok('S7 ✎ Edit addendum moves the due date without the e-mail ticked → the same automatic "Bid due date changed" update (bid site now, e-mail on ✅ Approvals)', r.code === 200 && r.j.dueNotice && r.j.dueNotice.status === 'waiting' && msg2.length >= 1 && queue().length === q1 + 1 && rowData('jobs/JS').bidDueDate === BM.addDays(TODAY, 14), { r: r.raw, m: msg2.length });

if (!NOB) {
  const { chromium } = require(path.join(process.env.NODE_PATH || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const errs = [];
  try {
    const ctx = await W.bidsCtx(browser, BUILD, F, 'phone'); const P = await ctx.newPage(); P.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await P.goto('https://bids.test/?open=JR3'); await W.bidsLogin(P, E.view, 'Pw-u_view');
    ok('D1 bid site (sub, phone): the reminder e-mail\'s link (?open=JR3) opens the job; it shows its 🔔 reminder and ✋ I\'m bidding / 🚫 Not bidding', await P.waitForSelector('[data-bidintent="JR3"]', { timeout: 30000 }).then(() => true, () => false) && /Bid due in 3 days/.test(await P.textContent('[data-bidintent="JR3"]')) && !!(await P.$('[data-bidintent-yes="JR3"]')));
    await P.click('[data-bidintent-no="JR3"]');
    ok('D2 🚫 Not bidding → saved (no more reminders for this job)', await until(() => (rowData('intents/JR3__u_view') || {}).intent === 'no') && await P.waitForSelector('[data-bidintent-is="no"]', { timeout: 10000 }).then(() => true, () => false));
    await P.click('button:has-text("Back")').catch(() => {});
    ok('D3 the job list shows 🔔 Reminders (the due-today one) with Open / Dismiss', await P.waitForSelector('[data-bidreminders] [data-bidreminder]', { timeout: 20000 }).then(() => true, () => false) && /Bid due today: Reminder Due Today Demo/.test(await P.textContent('[data-bidreminders]')));
    const nid = await P.getAttribute('[data-bidreminders] [data-bidreminder]:has-text("Due Today")', 'data-bidreminder');
    await P.click('[data-bidreminder-x="' + nid + '"]');
    ok('D4 Dismiss → read on the server and gone from the list', await until(() => !!(rowData('duenotes/' + nid) || {}).readAt) && await until(async () => !(await P.$('[data-bidreminder="' + nid + '"]'))));
    ok('D5 no sideways scroll; no page errors', !(await P.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) && errs.length === 0, errs);
  } finally { await browser.close(); }
}
ok('Z nothing left the machine (e-mail only captured: the reminders)', OUT.length === 0 && MAIL.every(m => /^(Bid due (in 3 days|today)|La oferta vence)/.test(m.subject)), { OUT, MAIL: MAIL.map(x => x.subject) });
const n = R.filter(Boolean).length; console.log('BIDREMIND2 ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
