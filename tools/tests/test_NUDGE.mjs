// test_NUDGE.mjs <build-dir> [shots-dir] — owner 11/12: "be able to click here as admin to nudge that job knocked off the list etc
// and be able to put todos in anyone's todo list as admin and office". Made-up people, leads and jobs only.
//   A. admin: Leads list → the Assigned chip → "👉 Nudge Gary" on top of the assign picker (the people list = Reassign) → sent:
//      ONE gc_office_tasks To-Do for Gary; again → the same To-Do, ×2; "👉 nudged … by Wesley" on the row and the drawer.
//   B. Gary (his own sign-in): the nudge is on his To-Do (from Wesley, Open lead) with the notice card; he moves the lead's
//      stage → the nudge To-Do completes itself, on his screen and in the cloud.
//   C. the office: ➕ To-Do for someone → Gary, linked to a job → on Gary's To-Do; he checks it off → "Given by me" says done.
//   D. a job: the job page's "👉 Nudge" and the Projects list's PM cell; E. an estimator sees none of the buttons.
import fs from 'fs';
import { computer, signIn, sleep, cset, cget, resetCloud, ACCOUNTS, waitFor, mclick } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2] || '.', SHOTS = process.argv[3] || '';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
const shot = async (c, name) => {   /* a 2× picture of the screen as it is (CDP capture at scale 2) */
  if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const p = c.page(), vp = p.viewportSize() || { width: 1400, height: 900 };
  const cdp = await p.context().newCDPSession(p);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: vp.width, height: vp.height, scale: 2 } });
  fs.writeFileSync(SHOTS + '/' + name, Buffer.from(r.data, 'base64')); await cdp.detach().catch(() => {}); };
const GZ = 'gzedmore@grayco-cs.com'; ACCOUNTS[GZ] = { pw: 'Correct-Horse-5', id: 'u-gz', role: 'staff' };
resetCloud(); const at = new Date(Date.now() - 3 * 864e5).toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'GrayCo Office', email: 'office@grayco-cs.com', role: 'Office', active: true },
  { id: 'u3', name: 'Sam Testbid', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true },
  { id: 'u4', name: 'Gary Zedmore', email: GZ, role: 'Project Manager', active: true }]);
const L = (id, o) => Object.assign({ id, client: o.name, stage: 'New Lead', createdAt: at, updatedAt: at, phone: '(901) 555-0142', address: '12 Test Cove, Memphis, TN' }, o);
cset('leads', [L('LZ1', { name: 'Zedd Kitchen Remodel', pm: 'Gary Zedmore', scope: 'Kitchen remodel' }), L('LZ2', { name: 'Zedd Porch Repair', pm: 'Gary Zedmore', scope: 'Porch boards' })]);
cset('projects', [{ id: 'PZ1', name: 'Zedd Office Remodel', client: 'Zedd Test Client', pm: 'Gary Zedmore', status: 'active', companyId: 'construction', createdAt: at, updatedAt: at }]);
cset('gc_office_tasks', []);
const tasks = () => { let v = cget('gc_office_tasks'); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return (Array.isArray(v) ? v : []).filter(t => t && /^(nudge|given)$/.test(t.kind)); };
const errsOf = c => c.errs.filter(e => !/ResizeObserver/.test(e));
const leadsReady = c => waitFor(c, () => (window._crm && window._crm.leads || []).length >= 2 && (window._crm.users || []).length >= 4, null, 60000, 500);

/* A. the admin nudges Gary from the Leads list */
const Adm = await computer('admin', { build });
await signIn(Adm, 'wjohnson@grayco-cs.com', 12000); await leadsReady(Adm); await sleep(3000);
await Adm.ev(() => window._setView('leads')); await waitFor(Adm, () => !!document.querySelector('#gc-leads-hub [data-gcl-asg="LZ1"]'), null, 30000, 400);
await mclick(Adm.page(), '#gc-leads-hub [data-gcl-asg="LZ1"]'); await sleep(900);
let m = await Adm.ev(() => { const p = document.getElementById('gcl-asgpick'); if (!p) return null; return { sec: !!p.querySelector('.gcn-sec'), h: (p.querySelector('.gcn-h') || {}).textContent || '', reasons: [...p.querySelectorAll('[data-gcn-r]')].map(b => b.textContent), people: [...p.querySelectorAll('[data-asg-to]')].map(b => b.getAttribute('data-asg-to')), re: /Reassign to/.test(p.textContent) }; });
ok('Leads list: the Assigned chip opens "👉 Nudge Gary" on top of the assign picker', m && m.sec && /Nudge Gary/.test(m.h), m);
ok('…with the four quick reasons', m && ['Bid it or pass on it', 'Call the customer', 'Update the stage', 'Get this off your list — mark Lost / not bidding'].every(x => m.reasons.includes(x)), m && m.reasons);
ok('…and "Reassign to…" is the existing picker\'s people list', m && m.re && m.people.length >= 2, m && m.people);
await mclick(Adm.page(), '#gcl-asgpick [data-gcn-r="Bid it or pass on it"]'); await sleep(300);
await shot(Adm, '1_nudge_menu_leads.png');
await mclick(Adm.page(), '#gcl-asgpick [data-gcn-go]'); await sleep(2500);
let T = tasks();
ok('sent: ONE To-Do for Gary in the cloud (gc_office_tasks), kind nudge, from Wesley', T.length === 1 && T[0].kind === 'nudge' && T[0].assignees[0] === GZ && T[0].addedBy === 'Wesley Johnson' && /Bid it or pass on it — Zedd Kitchen Remodel/.test(T[0].label) && T[0].due === new Date().toLocaleDateString('en-CA'), T.map(t => [t.id, t.label, t.assignees, t.due]));
ok('the picker closed', !(await Adm.ev(() => !!document.getElementById('gcl-asgpick'))));
await sleep(1500);
let tag = await Adm.ev(() => { const r = document.querySelector('#gc-leads-hub tr.gcl-lr[data-gcl-id="LZ1"] .gcn-tag'); return r ? r.textContent : ''; });
ok('the row shows "👉 nudged just now by Wesley"', /👉 nudged just now by Wesley/.test(tag), tag);
/* again, with a note and tomorrow */
await mclick(Adm.page(), '#gc-leads-hub [data-gcl-asg="LZ1"]'); await sleep(900);
await mclick(Adm.page(), '#gcl-asgpick [data-gcn-r="Call the customer"]');
await Adm.page().locator('#gcl-asgpick [data-gcn-note]').fill('They asked for a call back today');
const tom = await Adm.ev(() => { const b = document.querySelectorAll('#gcl-asgpick [data-gcn-d]')[1]; return b && b.getAttribute('data-gcn-d'); });
await mclick(Adm.page(), '#gcl-asgpick [data-gcn-d="' + tom + '"]');
await mclick(Adm.page(), '#gcl-asgpick [data-gcn-go]'); await sleep(2500);
T = tasks();
ok('nudged again: still ONE To-Do, the count is 2, the newest reason / note / due', T.length === 1 && T[0].repeats === 2 && T[0].nudges.length === 2 && /Call the customer/.test(T[0].label) && T[0].due === tom && /call back/.test(T[0].nudges[1].note), T.map(t => [t.repeats, t.label, t.due]));
await sleep(1500);
tag = await Adm.ev(() => { const r = document.querySelector('#gc-leads-hub tr.gcl-lr[data-gcl-id="LZ1"] .gcn-tag'); return r ? r.textContent : ''; });
ok('the row: "×2"', /×2/.test(tag), tag);
/* the drawer */
await Adm.ev(() => window._gcLeadsHub.open('LZ1')); await sleep(2000);
const dr = await Adm.ev(() => { const d = document.getElementById('gcl-drawer'); if (!d) return null; const b = d.querySelector('[data-gcn-open="lead|LZ1"]'); const t = d.querySelector('.gcn-dr .gcn-tag'); return { btn: b ? b.textContent : '', tag: t ? t.textContent : '' }; });
ok('the lead drawer: "👉 Nudge Gary" + "nudged … by Wesley · ×2"', dr && /Nudge Gary/.test(dr.btn) && /by Wesley · ×2/.test(dr.tag), dr);
await mclick(Adm.page(), '#gcl-drawer [data-gcn-open="lead|LZ1"]'); await sleep(700);
const mm = await Adm.ev(() => { const m = document.getElementById('gcn-menu'); return m ? { sec: !!m.querySelector('.gcn-sec'), re: !!m.querySelector('[data-gcn-re]') } : null; });
ok('…which opens the same menu (with "👤 Reassign…")', mm && mm.sec && mm.re, mm);
await Adm.ev(() => { const m = document.getElementById('gcn-menu'); if (m) m.remove(); window._gcLeadsHub.close(); });
await sleep(800);
/* the admin's own To-Do: Given by me */
await Adm.ev(() => window._setView('todo')); await sleep(4000);
let gv = await Adm.ev(() => { const g = document.querySelector('.gcn-given'); return g ? g.innerText : ''; });
ok('the admin\'s To-Do: "📤 Given by me" lists it as open, to Gary', /Given by me/.test(gv) && /Zedd Kitchen Remodel/.test(gv) && /to Gary Zedmore/.test(gv) && /Open/.test(gv), gv.slice(0, 300));
ok('the admin sees "➕ To-Do for someone"', await Adm.ev(() => !!document.querySelector('[data-gcn-sheet]')));

/* B. Gary's own sign-in */
const G = await computer('gary', { build });
await signIn(G, GZ, 12000); await leadsReady(G); await sleep(4000);
await G.ev(() => window._setView('todo')); await sleep(5000);
let gt = await G.ev(() => { const rows = [...document.querySelectorAll('.td2-row[data-k]')].filter(r => /Zedd Kitchen Remodel/.test(r.textContent)); return rows.map(r => ({ t: r.innerText.replace(/\s+/g, ' '), act: (r.querySelector('.td2-act') || {}).textContent || '' })); });
ok('Gary\'s To-Do has the nudge: "Call the customer — Zedd Kitchen Remodel", from Wesley, 2 reminders, Open lead', gt.length === 1 && /Call the customer — Zedd Kitchen Remodel/.test(gt[0].t) && /from Wesley/.test(gt[0].t) && /2 reminders/.test(gt[0].t) && gt[0].act === 'Open lead', gt);
let card = await G.ev(() => { const c = document.getElementById('gcn-card'); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
ok('…and the in-app notice: "👉 Wesley nudged you (×2)"', /Wesley nudged you \(×2\)/.test(card) && /Zedd Kitchen Remodel/.test(card), card);
const cnt = await G.ev(() => window._gcTD2.counts().todos);
ok('it counts as a To-Do (the To-Do number), not a lead line', cnt >= 1, cnt);
await shot(G, '2_gary_todo_with_nudge.png');
await mclick(G.page(), '#gcn-card [data-gcn-seen]'); await sleep(2500);
ok('✓ Got it → the card goes, and Wesley can see it was seen', !(await G.ev(() => !!document.getElementById('gcn-card'))) && !!tasks()[0].seenAt, tasks()[0].seenAt);
/* Gary moves the stage */
await G.ev(() => window._setView('leads')); await sleep(2500);
const mv = await G.ev(() => window._gcLeadsHub.moveStage('LZ1', 'Contacted'));
await sleep(7000);
T = tasks();
ok('Gary moves the lead to Contacted → the nudge To-Do completes itself (cloud)', mv && T[0].done === true && /stage changed to Contacted/.test(T[0].autoDone || ''), T.map(t => [t.done, t.autoDone]));
await G.ev(() => window._setView('todo')); await sleep(3000);
gt = await G.ev(() => [...document.querySelectorAll('.td2-row[data-k]')].filter(r => /Zedd Kitchen Remodel/.test(r.textContent)).length);
ok('…and it is off his To-Do', gt === 0, gt);

/* C. the office gives Gary a To-Do */
const O = await computer('office', { build });
await signIn(O, 'office@grayco-cs.com', 12000); await leadsReady(O); await sleep(3000);
await O.ev(() => window._setView('todo')); await sleep(4000);
ok('the office sees "➕ To-Do for someone"', await O.ev(() => !!document.querySelector('[data-gcn-sheet]')));
await mclick(O.page(), '[data-gcn-sheet]'); await sleep(700);
const opts = await O.ev(() => [...document.querySelectorAll('#gcn-sheet [data-gcn-f="who"] option')].map(o => o.textContent));
ok('the sheet: the person picker lists the staff', opts.some(x => /Gary Zedmore/.test(x)) && opts.some(x => /Sam Testbid/.test(x)), opts);
await O.page().locator('#gcn-sheet [data-gcn-f="who"]').selectOption(GZ);
await O.page().locator('#gcn-sheet [data-gcn-f="title"]').fill('Order the Zedd tile samples');
await O.page().locator('#gcn-sheet [data-gcn-f="note"]').fill('Two boxes, the grey one');
await mclick(O.page(), '#gcn-sheet [data-gcn-seg="prio"] [data-v="high"]');
await O.page().locator('#gcn-sheet [data-gcn-f="q"]').fill('Zedd Office');
await sleep(400);
await waitFor(O, () => !!document.querySelector('#gcn-sheet [data-gcn-hit="0"]'), null, 5000, 200); await sleep(300);
for (let i = 0; i < 2; i++) { await mclick(O.page(), '#gcn-sheet [data-gcn-hit="0"]'); await sleep(400); if (await O.ev(() => !!document.querySelector('#gcn-sheet [data-gcn-linkbox] .chip'))) break; }
const chip = await O.ev(() => (document.querySelector('#gcn-sheet [data-gcn-linkbox]') || {}).textContent || '');
ok('…the link search finds the job', /Zedd Office Remodel/.test(chip), chip);
await shot(O, '3_todo_for_someone_sheet.png');
await mclick(O.page(), '#gcn-sheet [data-gcn-a="go"]'); await sleep(2500);
let given = tasks().filter(t => t.kind === 'given');
ok('the office\'s To-Do is in the cloud: for Gary, from the office, high, linked to the job', given.length === 1 && given[0].assignees[0] === GZ && /Office/.test(given[0].addedBy) && given[0].prio === 'high' && given[0].pid === 'PZ1' && /from (GrayCo|Office) — Two boxes/.test(given[0].note), given.map(t => [t.label, t.assignees, t.addedBy, t.pid, t.note]));
await sleep(1500);
gv = await O.ev(() => { const g = document.querySelector('.gcn-given'); return g ? g.innerText : ''; });
ok('the office\'s "Given by me": open, to Gary', /Order the Zedd tile samples/.test(gv) && /to Gary Zedmore/.test(gv) && /Open/.test(gv), gv.slice(0, 300));
/* Gary gets it (his next pull), checks it off */
await G.page().reload(); await sleep(3000); await leadsReady(G); await sleep(4000);
await G.ev(() => window._setView('todo')); await sleep(5000);
gt = await G.ev(() => [...document.querySelectorAll('.td2-row[data-k]')].filter(r => /Order the Zedd tile samples/.test(r.textContent)).map(r => ({ k: r.getAttribute('data-k'), t: r.innerText.replace(/\s+/g, ' '), act: (r.querySelector('.td2-act') || {}).textContent || '' })));
ok('Gary\'s To-Do: "Order the Zedd tile samples" from the office, on the job, Open job', gt.length === 1 && /from (GrayCo|Office)/.test(gt[0].t) && gt[0].act === 'Open job', gt);
card = await G.ev(() => { const c = document.getElementById('gcn-card'); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
ok('…the notice: "📋 New To-Do from" the office', /New To-Do from (GrayCo|Office)/.test(card), card);
if (gt[0]) { await mclick(G.page(), `.td2-row[data-k="${gt[0].k}"] .td2-ck`); await sleep(3500); }
given = tasks().filter(t => t.kind === 'given');
ok('Gary checks it off → done in the cloud, by Gary', given[0] && given[0].done === true && given[0].doneBy === 'Gary Zedmore', given.map(t => [t.done, t.doneBy]));
await O.page().reload(); await sleep(3000); await leadsReady(O); await sleep(4000);
await O.ev(() => window._setView('todo')); await sleep(4000);
await O.ev(() => { const d = document.querySelector('details.gcn-given'); if (d) d.open = true; });
gv = await O.ev(() => { const g = document.querySelector('.gcn-given'); return g ? g.innerText : ''; });
ok('the office\'s "Given by me" now says ✓ Done by Gary', /Order the Zedd tile samples/.test(gv) && /Done/.test(gv) && /by Gary/.test(gv), gv.slice(0, 300));

/* D. a job: the job page and the Projects list */
await Adm.ev(() => window._navToJob('PZ1')); await sleep(3500);
await waitFor(Adm, () => !!document.querySelector('.gcn-job [data-gcn-open]'), null, 8000, 300);
const jb = await Adm.ev(() => { const b = document.querySelector('.gcn-job [data-gcn-open="job|PZ1"]'); return b ? b.textContent : ''; });
ok('the job page: "👉 Nudge Gary" by the PM line', /Nudge Gary/.test(jb), jb);
await mclick(Adm.page(), '.gcn-job [data-gcn-open="job|PZ1"]'); await sleep(700);
const jr = await Adm.ev(() => [...document.querySelectorAll('#gcn-menu [data-gcn-r]')].map(b => b.textContent));
ok('…its menu: the job reasons (no bid / lost ones) and Reassign', jr.includes('Call the customer') && jr.includes('Update the stage') && !jr.some(x => /Bid it/.test(x)) && await Adm.ev(() => !!document.querySelector('#gcn-menu [data-gcn-re]')), jr);
await mclick(Adm.page(), '#gcn-menu [data-gcn-r="Update the stage"]'); await mclick(Adm.page(), '#gcn-menu [data-gcn-go]'); await sleep(2500);
T = tasks().filter(t => t.nudgeKind === 'job');
ok('job nudge: a To-Do for Gary on the job (Open job)', T.length === 1 && T[0].pid === 'PZ1' && T[0].assignees[0] === GZ && !T[0].done, T.map(t => [t.label, t.pid]));
await sleep(1500);
const jt = await Adm.ev(() => { const t = document.querySelector('.gcn-job .gcn-tag'); return t ? t.textContent : ''; });
ok('…the job page shows "👉 nudged just now by Wesley"', /nudged just now by Wesley/.test(jt), jt);
await Adm.ev(() => { try { window._openJobDetail(null); } catch (e) {} window._setView('projects'); }); await sleep(3000);
const pc = await Adm.ev(() => { const e = document.querySelector('[data-gcn-pm="PZ1"]'); return e ? e.textContent : ''; });
ok('the Projects list: the PM cell can be tapped (and shows 👉)', /Gary Zedmore/.test(pc) && /👉/.test(pc), pc);
if (pc) { await mclick(Adm.page(), '[data-gcn-pm="PZ1"]'); await sleep(700); }
ok('…tapping it opens the nudge menu (not the job)', await Adm.ev(() => !!document.querySelector('#gcn-menu .gcn-sec[data-gcn-sec="job"]')));
await Adm.ev(() => { const m = document.getElementById('gcn-menu'); if (m) m.remove(); });
const sv = await Adm.ev(async () => { const ok1 = await window._gcxPatchJob('PZ1', { status: 'on_hold' }, 'test'); await new Promise(r => setTimeout(r, 6000)); return ok1; });
T = tasks().filter(t => t.nudgeKind === 'job');
ok('the job\'s status changes → the job nudge clears itself', sv && T[0].done === true && /status changed/.test(T[0].autoDone || ''), T.map(t => [t.done, t.autoDone]));

/* E. an estimator sees none of it */
const E = await computer('est', { build });
await signIn(E, 'sbiffle@grayco-cs.com', 12000); await leadsReady(E); await sleep(3000);
await E.ev(() => window._setView('todo')); await sleep(4000);
const es = await E.ev(() => ({ sheet: !!document.querySelector('[data-gcn-sheet]'), given: !!document.querySelector('.gcn-given'), can: window._gcNudge.canGive(), send: window._gcNudge.send('lead', 'LZ2', { reason: 'Call the customer' }) }));
ok('an estimator: no "➕ To-Do for someone", no "Given by me", cannot nudge', !es.sheet && !es.given && !es.can && !es.send, es);
await E.ev(() => window._setView('leads')); await sleep(3000);
await E.ev(() => window._gcLeadsHub.open('LZ2')); await sleep(2000);
const ed = await E.ev(() => ({ nudge: !!document.querySelector('[data-gcn-open]'), chip: document.querySelectorAll('#gc-leads-hub [data-gcl-asg]').length }));
ok('…and no 👉 Nudge on the Leads page or the drawer', !ed.nudge, ed);
await E.ev(() => window._setView('projects')); await sleep(2500);
ok('…and the Projects list PM cell is plain text', !(await E.ev(() => !!document.querySelector('[data-gcn-pm]'))));
ok('no stray nudges were written', tasks().filter(t => t.nudgeId === 'LZ2').length === 0);

for (const [n, c] of [['admin', Adm], ['Gary', G], ['office', O], ['estimator', E]]) ok('no page errors (' + n + ')', !errsOf(c).length, errsOf(c).slice(0, 3));
const n = R.filter(Boolean).length; console.log('NUDGE ' + n + '/' + R.length);
for (const c of [Adm, G, O, E]) { try { await c.b.close(); } catch (e) {} }
process.exit(n === R.length ? 0 : 1);
