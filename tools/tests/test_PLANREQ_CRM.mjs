// test_PLANREQ_CRM.mjs <build-dir> [shot-dir] — patch PLANREQ + PLANREQ-A/B/C in the CRM (offline harness, a fake bid-hub / subportal with the REAL
// trade guess (_lib/tradeguess.js); made-up people, jobs and files only).
//   Owner 11/12: "on bid portal if I don't have plans have where sub can request plans or more info and it emails and messages the PM or estimator";
//   "need to click private/public, make sure I can add all types of files, I have scopes I can't add in scopes, … put them in scopes by trade".
//   1. 🏗 Bid portal list: the 🔒 Private / 🌐 Public pill is a one-click switch (public asks first; a 📝 Draft → "Post it" private); "📩 1 request"
//   2. 📂 Manage → 💬 Q&A: the sub's request (needs, note, contact, who was told) with ↩ Reply / ✅ Mark sent (bid-hub op planreq)
//   3. 📐 Plans & specs: any file type; each file is shown with its guessed kind + trade ("📎 Electrical scope.pdf → 📝 Scope · ⚡ Electrical ▾"),
//      changed with the ▾, then 💾 Save → plans-import with the picks; 📝 Scope: a trade's "📎 Add scope files" and its files listed
//   4. the PM's 🔔 For you shows the 📩 Job Messages post the bid site wrote (the notify list names him) and the To-Do is on his list
import { createRequire } from 'module'; import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const G = require(path.join(BUILD, 'netlify/functions/_lib/tradeguess.js'));
const { computer, signIn, sleep, cset, resetCloud } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 864e5).toISOString(), due = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), now = new Date().toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'u4', name: 'Gus Estimator', email: 'gestimator@grayco-cs.com', role: 'Estimator', phone: '901-555-0144', active: true }]);
cset('estimates', [{ id: 'E9', name: 'Dorm — base bid', leadId: 'L3', estimator: 'Gus Estimator', status: 'Draft', lines: [{ id: 'x1', desc: 'Framing', cost: 1, qty: 1 }], updatedAt: at, savedAt: at, date: at.slice(0, 10) }]);   /* patch PLANREQ-J */
cset('leads', [{ id: 'L1', name: 'Sample Clinic Remodel', type: 'Commercial', stage: 'Bidding', bidDue: '2026-11-23T14:00', createdAt: at, updatedAt: at },
  { id: 'L3', name: 'New Female Dormitory', type: 'Commercial', stage: 'Bidding', address: '1 Sample Way', createdAt: at, updatedAt: at },
  { id: 'L2', name: 'Sample Gym Refresh', type: 'Commercial', stage: 'Bidding', bidDue: '2026-11-30T15:30', address: '9 Sample Rd', createdAt: at, updatedAt: at }]);   /* patch PLANREQ-F: our due dates (a Monday each) */
cset('projects', [{ id: 'P1', name: 'Sample Clinic Remodel', client: 'Sample Health LLC', address: '100 Sample St', status: 'estimating', autoPO: 'T101', pm: 'Sam Biffle', createdAt: at, updatedAt: at }]);
/* what subportal.js requestPlans writes (the same shape — test_PLANREQ_fn checks the server side) */
const MSG = { id: 'M_PR_sample1', pid: 'P1', authorId: 'bidsite:u_sam', authorName: 'Sample Drywall LLC (bid site)', text: '📩 @Sam Biffle @Gus Estimator — Sample Drywall LLC (Sam Sample · 901-555-0141 · sam@sampledrywall.test) asked for plans, site walk / access on the bid portal job "Sample Clinic Remodel": “Need the full set.” Answer in 🏗 Bid portal → 📂 Manage → 💬 Q&A (↩ Reply / ✅ Mark sent), or add the plans there — everyone who asked is told.',
  tags: ['u3', 'u4'], mentions: [{ id: 'u3', e: 'sbiffle@grayco-cs.com', n: 'Sam Biffle' }, { id: 'u4', e: 'gestimator@grayco-cs.com', n: 'Gus Estimator' }],
  notify: [{ id: 'u3', e: 'sbiffle@grayco-cs.com', n: 'Sam Biffle', why: 'mention' }, { id: 'u4', e: 'gestimator@grayco-cs.com', n: 'Gus Estimator', why: 'mention' }], at: now, source: 'bidsite', bidJobId: 'J1', planReqId: 'J1__u_sam' };
cset('gc_job_messages', JSON.stringify([MSG]));
cset('vendors', [{ id: 'V1', name: 'Sample Roof Supply', trade: '5 tool, shingles, shingle roof', isSub: true }, { id: 'V2', name: 'Sample Masonry', trade: 'cmu, Brick', isSub: true }]);   /* patch PLANREQ-H: junk trade words on vendor records */
cset('gc_office_tasks', JSON.stringify([{ id: 'planreq_J1__u_sam', kind: 'planreq', label: '📩 Sample Drywall LLC asked for plans — Sample Clinic Remodel', note: 'Plans, Site walk / access', pid: 'P1', bidJobId: 'J1', planReqId: 'J1__u_sam',
  assignees: ['sbiffle@grayco-cs.com', 'gestimator@grayco-cs.com'], assignee: 'Sam Biffle, Gus Estimator', personal: false, shared: true, prio: 'high', due: now.slice(0, 10), addedBy: 'Bid site', addedAt: now, updatedAt: now, done: false }]));

const JOBS = [
  { id: 'J1', title: 'Sample Clinic Remodel', status: 'open', visibility: 'private', due, ourDue: '2026-11-20', ourDueTime: '14:00', crmLeadId: 'L1', invited: 2, bids: 0, plans: 0, openReq: 1, postedBy: 'wjohnson@grayco-cs.com', postedByName: 'Wesley Johnson', crmProjectId: 'P1', trades: 'Drywall, Electrical' },
  { id: 'J2', title: 'Sample Apartment Fire', status: 'draft', visibility: 'draft', due: '', invited: 0, bids: 0, plans: 0, auto: false, address: '2817 Sample Ct' },
  { id: 'J4', title: 'Sample Past Due Job', status: 'open', visibility: 'public', due: '2026-05-13', invited: 0, bids: 0, plans: 0 }];
const REQ = { id: 'J1__u_sam', company: 'Sample Drywall LLC', name: 'Sam Sample', phone: '901-555-0141', email: 'sam@sampledrywall.test', trade: 'Drywall', needs: ['plans', 'sitewalk'], note: 'Need the full set.', at: now, open: true,
  to: [{ name: 'Sam Biffle', roles: ['PM'] }, { name: 'Gus Estimator', roles: ['Estimator'] }] };
const MAN = () => ({ ok: true, paused: false, job: { id: 'J1', title: 'Sample Clinic Remodel', address: '100 Sample St', po: 'T101', due: JOBS[0].due, dueTime: JOBS[0].dueTime || '', ourDue: JOBS[0].ourDue, ourDueTime: JOBS[0].ourDueTime, visibility: JOBS[0].visibility, deleted: false, trades: JOBS[0].trades,
  siteWalk: DET.siteWalk || null, bidForm: DET.bidForm || [], requirements: DET.requirements || {}, internalNotes: DET.internalNotes || '', crmProjectId: 'P1',
  tradeScopes: TS, plansLinks: [], addenda: [], posts: [], log: [] }, plans: PLANS, planreqs: [REQ], questions: [], acks: [], activity: [], audience: [{ email: 'sam@sampledrywall.test', company: 'Sample Drywall LLC', trades: ['Drywall'], how: 'invited', account: true }] });
const DET = {}; let TS = [{ id: 'ts1', trade: 'Drywall', scope: 'Hang and finish.', files: [] }], PLANS = [];
const POSTS = [], SP = [];
async function routes(c, who){
  await c.ctx.route('**/.netlify/functions/bid-hub*', async rt => {
    const u = new URL(rt.request().url()), q = u.searchParams, J = (b, code) => rt.fulfill({ status: code || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (rt.request().method() === 'POST') { const b = JSON.parse(rt.request().postData() || '{}'); POSTS.push(Object.assign({ who }, b));
      if (b.op === 'visibility') { const j = JOBS.find(x => x.id === b.jobId); if (j) { j.visibility = b.mode; j.status = 'open'; } return J({ ok: true, jobId: b.jobId, visibility: b.mode }); }
      if (b.op === 'planreq') { REQ.open = false; if (b.act === 'reply') { REQ.closedHow = 'answered'; REQ.reply = b.text; REQ.repliedByName = 'Wesley Johnson'; } else { REQ.closedHow = 'sent'; REQ.sentNote = b.text; } JOBS[0].openReq = 0; return J({ ok: true, mail: 'sent' }); }
      if (b.op === 'details' && !JOBS.find(x => x.id === b.jobId)) return J({ ok: true, jobId: b.jobId, changed: ['contacts'], notice: { status: 'nobody' } });
      if (b.op === 'details') { const j = JOBS.find(x => x.id === b.jobId); if (Array.isArray(b.trades)) { j.trades = b.trades.join(', '); b.trades.forEach(tr => { if (!TS.some(x => x.trade === tr)) TS.push({ id: 'ts_' + tr, trade: tr, scope: '', files: [] }); }); }
        if (b.due !== undefined) { j.due = b.due; j.dueTime = b.dueTime; } if (b.ourDue !== undefined) { j.ourDue = b.ourDue; j.ourDueTime = b.ourDueTime; } Object.assign(DET, { siteWalk: b.siteWalk, bidForm: (b.bidForm || []).map((x, i) => Object.assign({ id: 'bf' + i }, x)), requirements: b.requirements, internalNotes: b.internalNotes });
        return J({ ok: true, jobId: b.jobId, changed: ['trades', 'bid due', 'site walk', 'bid form'], notice: { status: 'waiting', n: 1 } }); }
      if (b.op === 'duplicate') { JOBS.push({ id: 'J3', title: b.title, status: 'open', visibility: 'private', due: '', invited: 0, bids: 0, plans: 0, trades: JOBS[0].trades }); return J({ ok: true, jobId: 'J3', title: b.title }); }
      if (b.op === 'bidding') { JOBS.find(x => x.id === b.jobId).biddingClosed = b.close; return J({ ok: true, biddingClosed: b.close }); }
      if (b.op === 'scope') { TS = b.tradeScopes.map(x => Object.assign({ id: x.id || 'ts_' + Math.random().toString(36).slice(2, 6) }, x)); return J({ ok: true, tradeScopes: TS }); }
      return J({ ok: true }); }
    if (q.get('jobs')) return J({ ok: true, jobs: JOBS, me: { email: who, admin: who === 'wjohnson@grayco-cs.com', canInvite: true, canPublic: who === 'wjohnson@grayco-cs.com' } });
    if (q.get('manage') === 'J5') return J({ ok: true, paused: false, job: { id: 'J5', title: 'New Female Dormitory', address: '1 Sample Way', due: '', visibility: 'private', deleted: false, trades: '', tradesSuggested: 'Prefabricated Wood Trusses, Standing Seam Metal Roofing, Flashing & Trim', tradeScopes: [{ id: 'tsa', trade: 'Prefabricated Wood Trusses', scope: '', files: [] }], plansLinks: [], addenda: [], posts: [], log: [], contacts: {} }, plans: [], planreqs: [], questions: [], acks: [], activity: [], audience: [] });
    if (q.get('manage')) return J(MAN());
    return J({ ok: true, subs: [], bids: [] });
  });
  await c.ctx.route('**/.netlify/functions/subportal*', async rt => {
    const b = JSON.parse(rt.request().postData() || '{}'), J = v => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) }); SP.push(b);
    if (b.action === 'upload') return J({ path: 'staff/2026-11/abc-' + b.name.replace(/[^A-Za-z0-9._-]+/g, '_'), url: 'https://crm.test-upload.invalid/put/' + encodeURIComponent(b.name) });
    if (b.action === 'plans-guess') { const g = G.guess(b.name, ''); return J({ ok: true, zip: false, files: [{ key: b.name, name: b.name, folder: '', size: b.size, kind: g.kind, trades: g.trades, why: g.why }] }); }
    if (b.action === 'plans-import') { const out = { name: b.name, kind: b.kind, trades: b.trades || [] };
      if (b.kind === 'scope' && out.trades.length) { out.trades.forEach(tr => { let t = TS.find(x => x.trade === tr); if (!t) { t = { id: 'ts_' + tr, trade: tr, scope: '', files: [] }; TS.push(t); } t.files.push({ name: b.name, size: b.size, fileRef: 'staff/x/' + b.name }); }); return J({ ok: true, added: [], scoped: [out] }); }
      PLANS.push({ name: b.name, size: b.size, type: '', fileRef: 'staff/x/' + b.name, category: b.kind === 'specs' ? 'Specs' : 'Plans', trades: out.trades }); return J({ ok: true, added: [out], scoped: [] }); }
    return J({ ok: true, data: {} });
  });
  await c.ctx.route('https://crm.test-upload.invalid/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}
const wait = async (c, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };

/* ── the admin ── */
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
const DLG = []; A.acceptConfirm = true; A.page().on('dialog', d => { DLG.push(d.message()); d.accept().catch(() => {}); });
await routes(A, 'wjohnson@grayco-cs.com');
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => { try { localStorage.setItem('gc_bp_mode:wjohnson@grayco-cs.com', 'crm'); } catch (e) {} window._setView('bidportal'); });
await wait(A, () => document.querySelector('#gc-sys-bp-mount tr[data-sys-job="J1"]'));
await A.ev(() => [...document.querySelectorAll('#gc-sys-bp-mount [data-sys="f"]')].find(b => b.getAttribute('data-f') === 'all').click()); await sleep(400);
const l1 = await A.ev(() => ({ pill: (document.querySelector('tr[data-sys-job="J1"] [data-sys="togvis"]') || {}).textContent, to: (document.querySelector('tr[data-sys-job="J1"] [data-sys="togvis"]') || { getAttribute(){ return ''; } }).getAttribute('data-to'),
  draft: (document.querySelector('tr[data-sys-job="J2"] [data-sys="togvis"]') || {}).textContent, req: (document.querySelector('[data-sys-req="J1"]') || {}).textContent }));
ok('1 the list: "🔒 Private ⇄" is a button (→ public), the draft says "📝 Draft · Post it ▸", and "📩 1 request"', /🔒 Private ⇄/.test(l1.pill) && l1.to === 'public' && /Post it/.test(l1.draft) && /📩 1 request/.test(l1.req), l1);
await shot(A, 'crm01_bidportal_list_pill_toggle');
await A.ev(() => document.querySelector('tr[data-sys-job="J1"] [data-sys="togvis"]').click());
await wait(A, () => /🌐 Public ⇄/.test((document.querySelector('tr[data-sys-job="J1"] [data-sys="togvis"]') || {}).textContent || ''));
ok('1 one click → 🌐 Public (after "every approved sub will see it"), the same op visibility', POSTS.some(p => p.op === 'visibility' && p.jobId === 'J1' && p.mode === 'public') && DLG.some(m => /PUBLIC/.test(m) && /Every approved sub/.test(m)), { POSTS, DLG });
const d0 = DLG.length;
await A.ev(() => document.querySelector('tr[data-sys-job="J1"] [data-sys="togvis"]').click());
await wait(A, () => /🔒 Private ⇄/.test((document.querySelector('tr[data-sys-job="J1"] [data-sys="togvis"]') || {}).textContent || ''));
ok('1 one click back → 🔒 Private, no question asked', POSTS.filter(p => p.op === 'visibility' && p.mode === 'private').length === 1 && DLG.length === d0, DLG.slice(d0));
await A.ev(() => document.querySelector('tr[data-sys-job="J2"] [data-sys="togvis"]').click());
await wait(A, () => /🔒 Private ⇄/.test((document.querySelector('tr[data-sys-job="J2"] [data-sys="togvis"]') || {}).textContent || ''));
ok('1 a draft: "Post it" → posted private (invited subs only)', POSTS.some(p => p.op === 'visibility' && p.jobId === 'J2' && p.mode === 'private'));
/* 2. 📂 Manage → Q&A */
await A.ev(() => window._gcSys2.open('J1', 'qa'));
await wait(A, () => document.querySelector('#gcsys2 [data-planreq="J1__u_sam"]'));
const q2 = await A.ev(() => ({ card: document.querySelector('#gcsys2 [data-planreq="J1__u_sam"]').innerText, tab: [...document.querySelectorAll('#gcsys2 [data-a="tab"]')].map(b => b.textContent).find(x => /Q&A/.test(x)), vis: (document.querySelector('#gcsys2 [data-a="vis"]') || {}).textContent }));
ok('2 💬 Q&A (· 📩 1): Sample Drywall LLC — Needs: Plans, Site walk / access — the note, phone, e-mail, who was told; ↩ Reply / ✅ Mark sent', /📩 1/.test(q2.tab) && /Sample Drywall LLC/.test(q2.card) && /Plans, Site walk \/ access/.test(q2.card) && /Need the full set/.test(q2.card) && /901-555-0141/.test(q2.card) && /Sam Biffle \(PM\)/.test(q2.card) && /Reply/.test(q2.card) && /Mark sent/.test(q2.card), q2);
ok('2 the drawer header has the one-click switch too', /🌐 Make public/.test(q2.vis), q2.vis);
await shot(A, 'crm02_manage_qa_plan_request');
await A.ev(() => { document.querySelector('#gcsys2 [data-k="pr_J1__u_sam"]').value = 'Plans go up Friday; site walk Tuesday 9 AM.'; document.querySelector('#gcsys2 [data-a="prreply"]').click(); });
await wait(A, () => /replied/.test((document.querySelector('#gcsys2 [data-planreq="J1__u_sam"]') || {}).textContent || ''));
ok('2 ↩ Reply → op planreq (reply, the text); the card says replied', POSTS.some(p => p.op === 'planreq' && p.id === 'J1__u_sam' && p.act === 'reply' && /site walk Tuesday/.test(p.text)));
/* 3. 📐 Plans & specs: any type, sorted by trade before saving */
await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-a="tab"]')].find(b => b.getAttribute('data-t') === 'plans').click()); await sleep(300);
await A.ev(() => document.querySelector('#gcsys2 [data-a="pick"]').click()); await sleep(300);
const acc = await A.ev(() => (document.getElementById('gcsys2-file') || {}).accept || '');
ok('3 the file picker takes every common type', ['.docx', '.xlsx', '.pptx', '.csv', '.txt', '.heic', '.dwg', '.zip', '.pdf'].every(x => acc.indexOf(x) > -1), acc);
const pdf = Buffer.from('%PDF-1.4 sample\n%%EOF');
await A.page().setInputFiles('#gcsys2-file', [{ name: 'Electrical scope.pdf', mimeType: 'application/pdf', buffer: pdf }, { name: 'E-101 Power plan.pdf', mimeType: 'application/pdf', buffer: pdf },
  { name: 'Plumbing fixture schedule.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('xlsx') }, { name: 'Div 09 Finishes.docx', mimeType: 'application/msword', buffer: Buffer.from('docx') }]);
await wait(A, () => document.querySelectorAll('#gcsys2 [data-review] tr[data-rv]').length === 4);
const rv = await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-review] tr[data-rv]')].map(r => r.querySelector('b').textContent + '=' + r.querySelector('[data-rvk]').value + ':' + r.querySelector('[data-rvt]').value));
ok('3 each file is shown with its guess before saving: Electrical scope → 📝 Scope ⚡ Electrical; E-101 → 📐 Plans Electrical; Plumbing fixture schedule.xlsx → Scope Plumbing; Div 09 → 📘 Specs Drywall/Paint/…', rv.join(' ; ') === 'Electrical scope.pdf=scope:Electrical ; E-101 Power plan.pdf=plans:Electrical ; Plumbing fixture schedule.xlsx=scope:Plumbing ; Div 09 Finishes.docx=specs:Drywall|Paint|Flooring|Tile|Ceilings', rv);
await shot(A, 'crm03_manage_upload_sorted_by_trade');
await A.ev(() => { const s = document.querySelector('#gcsys2 tr[data-rv="3:0"] [data-rvt]'); s.value = 'Paint'; s.dispatchEvent(new Event('change', { bubbles: true })); const k = document.querySelector('#gcsys2 tr[data-rv="3:0"] [data-rvk]'); k.value = 'scope'; k.dispatchEvent(new Event('change', { bubbles: true })); });
await A.ev(() => document.querySelector('#gcsys2 [data-a="rvsave"]').click());
await wait(A, () => SP.filter(x => x.action === 'plans-import').length === 4 && !document.querySelector('#gcsys2 [data-review]'));
const imp = SP.filter(x => x.action === 'plans-import').map(x => x.name + '=' + x.kind + ':' + (x.trades || []).join('|'));
ok('3 💾 Save sends each file with its kind + trade (the ▾ change wins: Div 09 → Scope · Paint)', imp.join(' ; ') === 'Electrical scope.pdf=scope:Electrical ; E-101 Power plan.pdf=plans:Electrical ; Plumbing fixture schedule.xlsx=scope:Plumbing ; Div 09 Finishes.docx=scope:Paint', imp);
await sleep(800);
const pl = await A.ev(() => [...document.querySelectorAll('#gcsys2 tr[data-plan]')].map(r => r.textContent));
ok('3 the plan sheet is listed with its trade (⚡ Electrical)', pl.some(t => /E-101 Power plan\.pdf/.test(t) && /⚡ Electrical/.test(t)), pl);
await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-a="tab"]')].find(b => b.getAttribute('data-t') === 'scope').click()); await sleep(400);
const sc = await A.ev(() => ({ trades: [...document.querySelectorAll('#gcsys2 [data-ti="trade"]')].map(x => x.value), files: [...document.querySelectorAll('#gcsys2 [data-tsfile]')].map(x => x.getAttribute('data-tsfile')), add: [...document.querySelectorAll('#gcsys2 [data-a="tsfiles"]')].map(b => b.textContent) }));
ok('3 📝 Scope: each trade has its scope files (Electrical, Plumbing, Paint made from the files) and "📎 Add scope files for <trade>"', ['Drywall', 'Electrical', 'Plumbing', 'Paint'].every(t => sc.trades.indexOf(t) > -1) && ['Electrical scope.pdf', 'Plumbing fixture schedule.xlsx', 'Div 09 Finishes.docx'].every(f => sc.files.indexOf(f) > -1) && sc.add.some(x => /Add scope files for Drywall/.test(x)), sc);
await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-a="tsfiles"]')].find(b => /Drywall/.test(b.textContent)).click()); await sleep(300);
await A.page().setInputFiles('#gcsys2-file', [{ name: 'Drywall notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Level 4 finish') }]);
await wait(A, () => [...document.querySelectorAll('#gcsys2 [data-tsfile]')].some(x => x.getAttribute('data-tsfile') === 'Drywall notes.txt'));
ok('3 "📎 Add scope files for Drywall" (a .txt) → straight onto the Drywall scope', SP.some(x => x.action === 'plans-import' && x.name === 'Drywall notes.txt' && x.kind === 'scope' && x.trades.join() === 'Drywall'));
await shot(A, 'crm04_manage_scopes_with_files');
await A.ev(() => window._gcSys2.close());
/* 5. patch PLANREQ-T/D/E: trades in the list, the full ⋯ Actions menu, 📂 Manage → 📝 Details */
await A.ev(() => window._gcSys.bp.load(true)); await sleep(800);
const rt = await A.ev(() => (document.querySelector('[data-row-trades="J1"]') || {}).textContent || '');
ok('5 the list row says the trades: "🔨 Trades: Drywall · Electrical"', /Trades: Drywall · Electrical/.test(rt), rt);
await A.ev(() => document.querySelector('tr[data-sys-job="J1"] [data-sys="menu"]').click()); await sleep(300);
const mi = await A.ev(() => [...document.querySelectorAll('#gcsys-menu [role=menuitem]')].map(b => b.textContent));
ok('5 ⋯ Actions: Edit details · Public/Private · Due date · Invite (by trade) · Post update · Addendum · Add plans/specs/scopes · Plan-room link · Answer questions · Bids · Duplicate · Link to CRM · Close bidding · Archive · Delete',
  ['📝 Edit details', '✏️ Due date', '✉️ Invite subs (by trade)', '📣 Post update', '📎 Post addendum', '📎 Add plans / specs / scopes', '🔗 Add plan-room link', '📊 Bids (compare / award)', '📋 Duplicate job', '🔗 Link to CRM lead / project', '⏸ Close bidding', '🗄 Archive', '🗑 Delete…'].every(x => mi.indexOf(x) > -1) && mi.some(x => /Make public|Make private/.test(x)) && mi.some(x => /Answer questions/.test(x)), mi);
await shot(A, 'crm05_actions_menu');
await A.ev(() => [...document.querySelectorAll('#gcsys-menu [role=menuitem]')].find(b => /Close bidding/.test(b.textContent)).click());
await wait(A, () => /bidding closed/.test((document.querySelector('tr[data-sys-job="J1"]') || {}).textContent || ''));
ok('5 ⏸ Close bidding (a confirm) → op bidding; the row says "⏸ bidding closed"', POSTS.some(p => p.op === 'bidding' && p.close === true));
await A.ev(() => { document.querySelector('tr[data-sys-job="J1"] [data-sys="menu"]').click(); }); await sleep(200);
await A.ev(() => [...document.querySelectorAll('#gcsys-menu [role=menuitem]')].find(b => /Edit details/.test(b.textContent)).click());
await wait(A, () => document.querySelector('#gcsys2 [data-details]'));
const hd = await A.ev(() => ({ chips: [...document.querySelectorAll('#gcsys2 [data-hdr-trades] [data-trade-chip]')].map(x => x.getAttribute('data-trade-chip')), due: (document.querySelector('#gcsys2 [data-hdr-due]') || {}).textContent, tab: document.querySelector('#gcsys2 .tabs button.on').textContent }));
ok('5 📝 Edit details opens 📂 Manage on 📝 Details; the header shows the trades (chips + ✏️ Trades) and "⏰ Bid due …" (✏️ Due)', hd.chips.join() === 'Drywall,Electrical' && /Subs due .* · Our bid due 2026-11-20 14:00/.test(hd.due) && /Details/.test(hd.tab), hd);
await A.ev(() => { [...document.querySelectorAll('#gcsys2 [data-a="dtrade"]')].find(b => b.getAttribute('data-t') === 'Paint').click(); });
await A.ev(nd => { const set = (k, v) => { const x = document.querySelector('#gcsys2 [data-d="' + k + '"]'); if (x.type === 'checkbox') x.checked = v; else x.value = v; };
  set('due', nd); set('dueTime', '14:00'); set('walkDate', nd); set('walkTime', '09:00'); set('walkLocation', 'Front gate'); set('walkMandatory', true); set('rq_bond', true); set('rq_coi', true); set('rq_coiGl', '$1M/$2M'); set('internalNotes', 'Margin note — staff only'); },
  new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10));
await A.ev(() => document.querySelector('#gcsys2 [data-a="bfadd"]').click()); await sleep(200);
await A.ev(() => { const x = document.querySelector('#gcsys2 [data-bf="item"][data-i="0"]'); x.value = 'Hang + finish walls'; });
const kept = await A.ev(() => document.querySelector('#gcsys2 [data-d="walkLocation"]').value);
ok('5 typing survives a redraw (+ Add a line item kept the site-walk place)', kept === 'Front gate', kept);
await A.ev(() => { const d = document.querySelector('#gcsys2 [data-details]'); d.scrollTop = 0; document.querySelector('#gcsys2 .bd').scrollTop = 0; });
await shot(A, 'crm06_manage_details_tab');
await A.ev(() => document.querySelector('#gcsys2 [data-a="dsave"]').click());
await wait(A, () => POSTS.some(p => p.op === 'details'));
const dp = POSTS.find(p => p.op === 'details') || {};
ok('5 💾 Save details → op details: trades + Paint, the new due date / time, site walk, requirements, the bid form line, internal notes', dp.trades && dp.trades.join() === 'Drywall,Electrical,Paint' && dp.dueTime === '14:00' && dp.siteWalk.location === 'Front gate' && dp.siteWalk.mandatory === true && dp.requirements.bond === true && dp.requirements.coiGl === '$1M/$2M' && dp.bidForm[0].item === 'Hang + finish walls' && dp.internalNotes === 'Margin note — staff only', dp);
await wait(A, () => [...document.querySelectorAll('#gcsys2 [data-hdr-trades] [data-trade-chip]')].length === 3);
await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-a="tab"]')].find(b => b.getAttribute('data-t') === 'scope').click()); await sleep(300);
const sc2 = await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-ti="trade"]')].map(x => x.value));
ok('5 📝 Scope: one box per trade we are bidding (Paint added)', sc2.indexOf('Paint') > -1 && sc2.indexOf('Drywall') > -1 && sc2.indexOf('Electrical') > -1, sc2);
await A.ev(() => window._gcSys2.close());
await A.ev(() => document.querySelector('tr[data-sys-job="J1"] [data-sys="menu"]').click()); await sleep(200);
await A.ev(() => { window.__p0 = window.prompt; window.prompt = (m, d) => d; [...document.querySelectorAll('#gcsys-menu [role=menuitem]')].find(b => /Duplicate/.test(b.textContent)).click(); });
await wait(A, () => POSTS.some(p => p.op === 'duplicate'));
ok('5 📋 Duplicate job → op duplicate (asks the new title: "Copy of …")', POSTS.some(p => p.op === 'duplicate' && p.jobId === 'J1' && p.title === 'Copy of Sample Clinic Remodel'), POSTS.filter(p => p.op === 'duplicate'));
await A.ev(() => { try { window._gcSys2.close(); } catch (e) {} });
/* 6. patch PLANREQ-F: the due date in the list row; two dates (subs / ours); the lead's due date change is OFFERED, never silent; 📢 prefills sub due = our due − 1 day */
await A.ev(() => window._gcSys.bp.load(true)); await sleep(800);
const dc = await A.ev(() => ({ j1: (document.querySelector('[data-sys-duecell="J1"]') || {}).textContent, past: !!document.querySelector('[data-sys-duecell="J4"] [data-pastdue]'), pastColor: getComputedStyle(document.querySelector('[data-sys-duecell="J4"] [data-pastdue]')).color }));
ok('6 the list row: "Subs due … ✏️" and "Our bid due 11/20/26 14:00"; a past due date is red', /Subs due .* ✏️/.test(dc.j1) && /Our bid due 11\/20\/26 14:00/.test(dc.j1) && dc.past && /185, 28, 28/.test(dc.pastColor), dc);
await A.ev(() => document.querySelector('[data-sys-duecell="J4"] [data-sys="dueedit"]').click()); await sleep(200);
await A.ev(() => { const f = document.querySelector('[data-sys-dueform="J4"]'); f.querySelector('[data-k=due]').value = '2026-12-04'; f.querySelector('[data-k=duet]').value = '10:00'; });
await shot(A, 'crm07_list_due_inline_edit');
await A.ev(() => document.querySelector('[data-sys-dueform="J4"] [data-sys="duesave"]').click());
await wait(A, () => /Subs due 12\/4\/26 10:00/.test((document.querySelector('[data-sys-duecell="J4"]') || {}).textContent || ''));
ok('6 click the date → date + time → Save: op details (due, dueTime) — the same op / rule / automatic update as 📂 Manage; the row shows it', POSTS.some(p => p.op === 'details' && p.jobId === 'J4' && p.due === '2026-12-04' && p.dueTime === '10:00'));
const off = await wait(A, () => document.querySelector('#gcbp-dueoffer') ? document.querySelector('#gcbp-dueoffer').innerText : null);
ok('6 our bid due on the lead (Mon 11/23) ≠ the one the job was posted with (11/20) → an OFFER: "Also move the sub due date to 11/20?" (Friday: the day before is a weekend… Sunday) — nothing moved yet', !!off && /changed to 11\/23 14:00/.test(off) && /Also move the sub due date to 11\/20/.test(off) && !POSTS.some(p => p.op === 'details' && p.jobId === 'J1' && p.ourDue === '2026-11-23'), off);
await shot(A, 'crm08_lead_due_change_offer');
await A.ev(() => document.querySelector('#gcbp-dueoffer [data-dueoffer="move"]').click());
await wait(A, () => POSTS.some(p => p.op === 'details' && p.jobId === 'J1' && p.ourDue === '2026-11-23'));
const mv = POSTS.find(p => p.op === 'details' && p.jobId === 'J1' && p.ourDue === '2026-11-23');
ok('6 "Move it" → op details: our due 11/23 14:00 and the sub due 11/20 14:00', mv.ourDueTime === '14:00' && mv.due === '2026-11-20' && mv.dueTime === '14:00', mv);
const sd = await A.ev(() => [window._gcSubDue('2026-11-25T09:00'), window._gcSubDue('2026-11-23'), window._gcSubDue('2026-11-22T08:00')]);
ok('6 sub due = our due − 1 day, same time; a weekend → the Friday before (Wed 11/25 → Tue 11/24; Mon 11/23 → Fri 11/20; Sun 11/22 → Fri 11/20)', JSON.stringify(sd) === JSON.stringify([{ date: '2026-11-24', time: '09:00' }, { date: '2026-11-20', time: '' }, { date: '2026-11-20', time: '08:00' }]), sd);
await A.ev(() => window._gcBidPost.open({ leadId: 'L2' })); await wait(A, () => document.querySelector('#gcbp-modal #gcbp-due'));
const pf = await A.ev(() => ({ due: document.getElementById('gcbp-due').value, t: document.getElementById('gcbp-duet').value, our: (document.querySelector('#gcbp-modal [data-bp-ourdue]') || {}).textContent }));
ok('6 📢 Put on bid portal from a lead (our due Mon 11/30 15:30): the sub due is prefilled Fri 11/27 15:30 — "Our bid due: 11/30 15:30 — subs due 1 day before our due date"', pf.due === '2026-11-27' && pf.t === '15:30' && /Our bid due: 11\/30 15:30/.test(pf.our) && /1 day before our due date/.test(pf.our), pf);
await shot(A, 'crm09_put_on_bid_portal_sub_due_prefill');
await A.ev(() => { const m = document.getElementById('gcbp-modal'); if (m) m.remove(); });
/* 7. patch PLANREQ-H: an invite's trades are SUGGESTED, never pre-selected; a clean list (no "5 tool" / "shingles"); the 💾 Save footer never covers a field */
await A.ev(() => window._gcSys2.open('J5', 'details'));
await wait(A, () => document.querySelector('#gcsys2 [data-trades-picker]'));
const tp = await A.ev(() => ({ sel: [...document.querySelectorAll('#gcsys2 [data-tp-sel] [data-a="dtrade"]')].map(b => b.getAttribute('data-t')), sugg: [...document.querySelectorAll('#gcsys2 [data-tp-sugg] [data-a="dtrade"]')].map(b => b.getAttribute('data-t') + ':' + b.getAttribute('aria-pressed')),
  all: [...document.querySelectorAll('#gcsys2 [data-tp-rest] [data-a="dtrade"]')].map(b => b.getAttribute('data-t')), hdr: (document.querySelector('#gcsys2 [data-hdr-sugg]') || {}).textContent || '' }));
ok('7 nothing pre-selected; "💡 Suggested from the invite" lists the invite\'s 3 trades (not pressed); the header says so', tp.sel.length === 0 && tp.sugg.join() === 'Prefabricated Wood Trusses:false,Standing Seam Metal Roofing:false,Flashing & Trim:false' && /3 suggested from the invite/.test(tp.hdr), tp);
ok('7 "All trades" is the standard list — no "5 tool", "shingles", "cmu" from vendor records', tp.all.indexOf('Drywall') > -1 && !tp.all.some(t => /5 tool|shingle|^cmu$|^brick$/i.test(t)), tp.all);
const lay = await A.ev(() => { const bd = document.querySelector('#gcsys2 .bd').getBoundingClientRect(), ft = document.querySelector('#gcsys2 [data-details-foot]'), fr = ft && ft.getBoundingClientRect(); return { foot: !!ft, parent: ft && ft.parentNode.id, bdBottom: Math.round(bd.bottom), ftTop: fr && Math.round(fr.top) }; });
ok('7 💾 Save details is a footer under the scrolling sheet (it never sits over a field)', lay.foot && lay.parent === 'gcsys2' && lay.bdBottom <= lay.ftTop, lay);
await shot(A, 'crm11_details_trades_suggested_footer');
await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-tp-sugg] [data-a="dtrade"]')].find(b => b.getAttribute('data-t') === 'Flashing & Trim').click()); await sleep(200);
const tp2 = await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-tp-sel] [data-a="dtrade"]')].map(b => b.getAttribute('data-t')));
ok('7 tapping a suggestion selects it', tp2.join() === 'Flashing & Trim', tp2);
await A.ev(() => { const q = document.querySelector('#gcsys2 [data-k=dtradeq]'); q.value = 'plumb'; q.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(200);
const tp3 = await A.ev(() => [...document.querySelectorAll('#gcsys2 [data-tp-rest] [data-a="dtrade"]')].map(b => b.getAttribute('data-t')));
ok('7 🔍 find a trade filters the list', tp3.join() === 'Plumbing', tp3);
await A.ev(() => window._gcSys2.close());
/* 8. patch PLANREQ-J: the CRM lead is found and preselected; contacts fill themselves (estimator doing the estimate; no PM → the estimator is the main contact);
   a staff pick fills phone + e-mail; one person as PM and estimator shows once; "📐 Estimating" in the header; a new estimate's estimator = the person working it */
await A.ev(() => window._gcSys2.open('J5', 'details'));
await wait(A, () => document.querySelector('#gcsys2 [data-d="estName"]'));
const af = await A.ev(() => { const v = k => (document.querySelector('#gcsys2 [data-d="' + k + '"]') || {}).value; return { lead: v('crmLeadId'), guessed: !!document.querySelector('#gcsys2 [data-crm-guessed]'), pm: v('pmName'), est: v('estName'), estPhone: v('estPhone'), estEmail: v('estEmail'),
  main: !!document.querySelector('#gcsys2 [data-contacts-main]'), auto: !!document.querySelector('#gcsys2 [data-contacts-auto]'), hdr: (document.querySelector('#gcsys2 [data-hdr-estimating]') || {}).textContent || '', pmIsSelect: document.querySelector('#gcsys2 [data-d="pmName"]').tagName }; });
ok('8 the lead is found by its title and preselected ("Found in the CRM…"); the estimator doing its estimate fills in with phone + e-mail; no PM → "the estimator is the main contact"; header "📐 Estimating: Gus Estimator"',
  af.lead === 'L3' && af.guessed && af.pm === '' && af.est === 'Gus Estimator' && af.estPhone === '901-555-0144' && af.estEmail === 'gestimator@grayco-cs.com' && af.main && af.auto && /Estimating: Gus Estimator/.test(af.hdr) && af.pmIsSelect === 'SELECT', af);
await A.ev(() => { const x = document.querySelector('#gcsys2 [data-d="pmName"]'); x.value = 'Gus Estimator'; x.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
const af2 = await A.ev(() => ({ pmEmail: document.querySelector('#gcsys2 [data-d="pmEmail"]').value, pmPhone: document.querySelector('#gcsys2 [data-d="pmPhone"]').value, same: (document.querySelector('#gcsys2 [data-contacts-same]') || {}).textContent || '' }));
ok('8 picking the PM from the staff list fills phone + e-mail; the same person as estimator → "PM & estimator: Gus Estimator"', af2.pmEmail === 'gestimator@grayco-cs.com' && af2.pmPhone === '901-555-0144' && /PM & estimator: Gus Estimator/.test(af2.same), af2);
await A.ev(() => { const d = document.querySelector('#gcsys2 [data-contacts-same]'); if (d) d.scrollIntoView({ block: 'center' }); }); await shot(A, 'crm12_details_contacts_autofill');
await A.ev(() => document.querySelector('#gcsys2 [data-a="dsave"]').click());
await wait(A, () => POSTS.some(p => p.op === 'details' && p.jobId === 'J5'));
const sv = POSTS.find(p => p.op === 'details' && p.jobId === 'J5') || {};
ok('8 💾 Save sends the contacts and the CRM lead', sv.contacts && sv.contacts.pmName === 'Gus Estimator' && sv.contacts.estEmail === 'gestimator@grayco-cs.com' && sv.crmLeadId === 'L3' && sv.trades === undefined, sv);
await A.ev(() => window._gcSys2.close());
const ep = await A.ev(() => { const sel = document.createElement('select'); sel.innerHTML = '<option>Gus Estimator</option>'; window._gcSetEstPick(sel, ''); return sel.value; });
ok('8 a new estimate with no estimator gets the person working it (Wesley Johnson)', ep === 'Wesley Johnson', ep);
ok('8 window._gcEstimatorFor({ leadId: L3 }) → Gus Estimator (who is doing that estimate)', (await A.ev(() => window._gcEstimatorFor({ leadId: 'L3' }))) === 'Gus Estimator');
ok('no page errors (admin)', !errs.length, errs);
/* 4. the PM: 🔔 For you + the To-Do */
const P = await computer('sbiffle@grayco-cs.com', { build: BUILD });
const errs2 = []; P.page().on('pageerror', e => errs2.push(String(e.message).slice(0, 200)));
await routes(P, 'sbiffle@grayco-cs.com');
await signIn(P, 'sbiffle@grayco-cs.com', 15000); await sleep(6000);
const fy = await wait(P, () => { const l = window._gcJobMsgForMe ? window._gcJobMsgForMe() : []; return l.length ? l.map(x => ({ id: x.m.id, mention: x.mention })) : null; });
ok('4 the PM: the bid site\'s 📩 post is under 🔔 For you, as an @mention', !!fy && fy.some(x => x.id === 'M_PR_sample1' && x.mention), fy);
const html = await P.ev(() => window._gcJobMsgForYouHtml ? window._gcJobMsgForYouHtml() : '');
ok('4 "🔔 For you" says it: Sample Drywall LLC asked for plans', /For you/.test(html) && /Sample Drywall LLC/.test(html), html.slice(0, 300));
const td = await P.ev(() => { try { return JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => t.id === 'planreq_J1__u_sam').map(t => ({ hidden: window._gcTaskHidden ? window._gcTaskHidden(t) : null, label: t.label })); } catch (e) { return String(e); } });
ok('4 the To-Do "📩 Sample Drywall LLC asked for plans — Sample Clinic Remodel" is on the PM\'s list (not hidden from him)', Array.isArray(td) && td.length === 1 && td[0].hidden === false, td);
ok('no page errors (PM)', !errs2.length, errs2);
if (SHOTS) fs.writeFileSync(SHOTS + '/index-planreq-crm.txt', ['CRM screenshots (test_PLANREQ_CRM.mjs) — made-up data',
  'crm01  🏗 Bid portal list: 🔒 Private ⇄ / 📝 Draft · Post it ▸ one-click pills, 📩 1 request', 'crm02  📂 Manage → 💬 Q&A: the plan request with ↩ Reply / ✅ Mark sent',
  'crm03  📐 Plans & specs: 4 files of different types, each with its guessed kind + trade ▾ before 💾 Save', 'crm04  📝 Scope: each trade with its files + 📎 Add scope files',
  'crm05  ⋯ Actions: the full menu', 'crm07  the list row: click the sub due date → date + time → Save (past dates red)', 'crm08  the lead\'s due date changed → "Also move the sub due date to …?"', 'crm09  📢 Put on bid portal from a lead: sub due prefilled 1 day before our due (Friday for a weekend)', 'crm11  📝 Details on an invite job: nothing pre-selected, 💡 suggested trades, clean list, Save footer', 'crm12  📝 Details contacts filled from the CRM (lead found, estimator doing the estimate, PM & estimator once)', 'crm06  📂 Manage → 📝 Details: trades picker, dates, site walk, requirements, bid form, contacts, CRM link, internal notes; header trades + due', ''].join('\n'));
const n = R.filter(Boolean).length; console.log('PLANREQ_CRM ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
