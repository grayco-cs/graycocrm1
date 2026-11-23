// test_NOTESCLEAN.mjs <build-dir> — patch NOTESCLEAN (owner 11/23: "take this out and let me edit notes too, but take out they are GC").
// The REAL bid-site function + the built bid site on qaa_world's in-memory Supabase. Made-up data only; nothing leaves the machine.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, TOK, ACC, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
W.install(); process.env.PORTAL_MAIL_OFF = '1';
const F = W.fns(BUILD);
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('gc_automation_pause', { on: false });
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }]);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true });
putRow('users', 'st_owner', { id: 'st_owner', email: 'owner@grayco-cs.com', name: 'Demo Owner', phone: '901-555-0100', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: 'st_owner', email: 'owner@grayco-cs.com' });
putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'a@sub.test', name: 'Alex Alpha', company: 'Alpha Plumbing', trades: ['Plumbing'], authUserId: 'auth-u_a' }, { user_id: 'u_a', email: 'a@sub.test' });
TOK['tk-owner'] = 'owner@grayco-cs.com'; TOK['tk-a'] = 'a@sub.test'; ACC['owner@grayco-cs.com'] = { pw: 'Admin-Pass-1', id: 'auth-owner' }; ACC['a@sub.test'] = { pw: 'Sub-Pass-1', id: 'auth-u_a' };
const NOTES = 'From GrayCo Construction Services.\nGC: Demo Roofs Inc\nOwner: Demo School District\nBid #: 2026-77\nPre-bid: 2026-12-01 10:00 at the site\nBring your own ladder.';
putRow('jobs', 'J1', { id: 'J1', title: 'Demo Dorm Rough-ins', status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(10), pmId: 'st_owner', estimatorId: 'st_owner', grayCoRole: 'sub', tradesSought: 'Plumbing', notes: NOTES, createdAt: now }, { job_id: 'J1' });
const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer ' + tok, 'x-nf-client-connection-ip': '10.7.' + Math.floor(Math.random() * 200) + '.1' }, body: JSON.stringify(body) }); return { code: r.statusCode, b: JSON.parse(r.body) }; };
const subJob = async () => (((await call('tk-a', { action: 'load', keys: ['jobs'] })).b.data || {}).jobs || []).find(j => j.id === 'J1') || {};

/* A. server: what a sub reads */
let j = await subJob();
ok('A1 the sub never reads the GC / owner / bid # / "From GrayCo" lines', !/Demo Roofs|Demo School|2026-77|From GrayCo|GC:|Owner:/.test(j.notes || ''), j.notes);
ok('A2 … the useful lines stay (pre-bid, the job note)', /Pre-bid: 2026-12-01/.test(j.notes || '') && /Bring your own ladder/.test(j.notes || ''), j.notes);
/* B. the Lead Inbox's refresh: an opened job's notes never name the GC; a hand-typed note is kept */
const BP = require(path.join(BUILD, 'netlify/functions/_lib/bid-portal.js'));
const src = require('fs').readFileSync(path.join(BUILD, 'netlify/functions/_lib/bid-portal.js'), 'utf8');
ok('B1 bid-portal.js: opened jobs get no GC / owner / From GrayCo line; typed notes are kept', /patch NOTESCLEAN/.test(src) && /prev\.notesEditedAt\) \? s\(prev\.notes\)/.test(src) && /if \(!job\.notesEditedAt\) job\.notes =/.test(src));

/* C. the bid site: the admin edits the notes, the sub sees them */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
const page = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); p.on('dialog', d => d.accept().catch(() => {})); await p.goto('https://bids.test/'); return p; };
try {
  for (const kind of ['desktop', 'phone']) {
    putRow('jobs', 'J1', Object.assign({}, rowData('jobs/J1'), { notes: NOTES, notesEditedAt: undefined }), { job_id: 'J1' });   /* each run starts from the Lead Inbox's notes */
    const A = await page(await W.bidsCtx(browser, BUILD, F, kind));
    await W.bidsLogin(A, 'owner@grayco-cs.com', 'Admin-Pass-1');
    await A.waitForSelector('h3:has-text("Demo Dorm Rough-ins")', { timeout: 30000 }); await A.click('h3:has-text("Demo Dorm Rough-ins")');
    await A.waitForSelector('[data-notes-card]', { timeout: 15000 });
    const shown = await A.textContent('[data-notes-card]');
    ok('C1 ' + kind + ': the admin\'s Notes card hides the GC / owner / From GrayCo lines', !/Demo Roofs|Demo School|From GrayCo/.test(shown) && /Bring your own ladder/.test(shown), shown);
    await A.click('[data-notes-edit]');
    const pre = await A.inputValue('[data-notes-input]');
    ok('C2 ' + kind + ': ✎ Edit notes opens with the clean text', !/GC:|Owner:|From GrayCo/.test(pre) && /Bring your own ladder/.test(pre), pre);
    const txt = 'Rough-in only — no stub-ups at the units. (' + kind + ')';
    await A.fill('[data-notes-input]', txt); await A.click('[data-notes-save]');
    const saved = await (async () => { for (let i = 0; i < 40; i++) { const d = rowData('jobs/J1'); if (d && d.notes === txt) return d; await new Promise(r => setTimeout(r, 250)); } return rowData('jobs/J1'); })();
    ok('C3 ' + kind + ': saved, marked as typed by a person', saved && saved.notes === txt && !!saved.notesEditedAt, saved && { notes: saved.notes, at: saved.notesEditedAt });
    j = await subJob();
    ok('C4 ' + kind + ': the sub reads the new notes', (j.notes || '') === txt, j.notes);
    await A.context().close();
  }
  ok('C5 no page errors', errs.length === 0, errs);
} finally { await browser.close(); }
const n = R.filter(Boolean).length; console.log('NOTESCLEAN ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
