// test_BIDREMIND2.mjs <build-dir> [--no-browser] — patch ADDEDIT (+ BIDREMIND2), offline. The REAL subportal.js (bid site), portal-access.js
// (sub portal), bid-hub.js (the CRM's 🏗 Bid portal) on qaa_world's in-memory Supabase; the built subportal/ and the CRM (offline harness) in
// Chromium. Made-up people, jobs and files only; e-mail captured where it would reach Resend — nothing leaves the machine.
//   A. ✎ Edit a posted addendum (owner 11/23: "I need to be able to edit an addendum there too"):
//      title / date / what changed / files +/− / the bid due date; the history (who, when, old text, a removed file kept); subs who acknowledged
//      are asked again ("Updated <date>"); the optional e-mail waits on ✅ Approvals (held in ⏸ data-entry mode); who may; the sub portal; the
//      bid site and the CRM screens.
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
ok('Z nothing left the machine; no e-mail sent', OUT.length === 0 && MAIL.length === 0, { OUT, MAIL: MAIL.map(x => x.subject) });
const n = R.filter(Boolean).length; console.log('BIDREMIND2 ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
