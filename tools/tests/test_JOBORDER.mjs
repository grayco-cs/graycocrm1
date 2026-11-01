// test_JOBORDER.mjs <build-dir> <mirror.json> — patch JOBORDER on a READ-ONLY mirror of the production data (customer data:
// keep it OUTSIDE git), offline harness. Five jobs for the PM (Steven Biffle) are added to the mirror's copy in memory, one per
// group, with the status in mixed case ("Active", "on_hold", "Bidding", "completed", "lost").
//   PM: Projects (All, the default tab) runs active → bidding → finished, the finished rows folded under "▸ Finished (n)"
//       (open on a click), no lost job anywhere (Projects, Field "Pick a Job", the message picker, the drop-down helper);
//       his dashboard card lists active → bidding → finished; Pick a Job is in the same order with Finished folded.
//   admin: Projects All in the same order, lost jobs only after "Show lost (n)" at the very bottom; the React job
//       drop-downs list lost jobs last; the role apps' sort hook uses the same order.
// Env: GC_HARNESS (default wN/harness_N.mjs).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_JOBORDER.mjs <build-dir> <mirror.json>'); process.exit(2); }
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const now = Date.now(), iso = h => new Date(now - h * 3600e3).toISOString();
const JOBS = [
  { id: 'PRJJO_LOST', name: 'JOTEST Lost job', pm: 'Steven Biffle', status: 'lost', updatedAt: iso(1) },
  { id: 'PRJJO_DONE', name: 'JOTEST Done job', pm: 'Steven Biffle', status: 'completed', updatedAt: iso(2) },
  { id: 'PRJJO_BID', name: 'JOTEST Bidding job', pm: 'Steven Biffle', status: 'Bidding', updatedAt: iso(3) },
  { id: 'PRJJO_HOLD', name: 'JOTEST On hold job', pm: 'Steven Biffle', status: 'on_hold', updatedAt: iso(30) },
  { id: 'PRJJO_ACT', name: 'JOTEST Active job', pm: 'Steven Biffle', status: 'Active', updatedAt: iso(4) }];
const RANK = { active: 0, bidding: 1, other: 2, finished: 3, lost: 4 };
function loadCloud(){ cloud.clear(); for (const r of rows) { let v = r.value !== undefined ? r.value : r.v; if (r.key === 'projects' && Array.isArray(v)) v = v.concat(JOBS); cloud.set(r.key, { key: r.key, value: v, updated_at: r.updated_at }); } }
let pass = 0, fail = 0;
function ok(cond, name, info){ if (cond) { pass++; console.log('PASS ' + name + (info ? '  ' + info : '')); } else { fail++; console.log('FAIL ' + name + (info ? '  ' + info : '')); } }
const nondecr = l => l.every((x, i) => !i || RANK[x] >= RANK[l[i - 1]]);

async function boot(email){
  loadCloud();
  const c = await computer(email.slice(0, 2), { build: BUILD });
  await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
  const p = c.page(); await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 120000 }); await sleep(1500);
  await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click();
  await waitFor(c, () => (window._crm && window._crm.projects || []).some(p => p.id === 'PRJJO_ACT') && document.querySelector('aside nav button'), null, 180000, 500);
  await sleep(10000);
  await c.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a=full]'); if (b && b.offsetParent) b.click(); }); await sleep(800);
  return c;
}
/* the Projects table as seen: each visible row's group and name, the fold rows */
const projects = c => c.ev(() => {
  const tb = document.querySelector('#root tbody > tr[data-gc-jo]') && document.querySelector('#root tbody > tr[data-gc-jo]').parentElement; if (!tb) return null;
  const vis = e => e.getClientRects().length > 0;
  const rows = [...tb.children].map(r => ({ head: r.getAttribute('data-gc-jo-head'), k: r.getAttribute('data-gc-jo'), name: (r.querySelector('b') || {}).textContent || r.textContent.trim(), vis: vis(r) }));
  return { rows, shown: rows.filter(r => r.vis && !r.head), heads: rows.filter(r => r.head).map(r => ({ k: r.head, t: r.name, vis: r.vis })), lastIsLost: rows.length && rows[rows.findIndex(r => r.head === 'lost')] ? rows.slice(rows.findIndex(r => r.head === 'lost') + 1).every(r => r.k === 'lost') : null };
});
async function openProjects(c){ await c.ev(() => { try { localStorage.removeItem('gc_proj_subtab'); } catch (e) {} window._setView('dashboard'); }); await sleep(800); await c.ev(() => window._setView('projects')); await waitFor(c, () => !!document.querySelector('#root tbody > tr[data-gc-jo]'), null, 30000, 300); await sleep(1500); }
async function clickHead(c, k){ await c.ev(k => { const h = document.querySelector('[data-gc-jo-head="' + k + '"]'); if (h) h.click(); }, k); await sleep(600); }

/* ═════ PM ═════ */
let c = await boot('sbiffle@grayco-cs.com');
await openProjects(c);
let P = await projects(c);
ok(P && P.shown.length > 0, 'PM: the Projects table is drawn (default tab All)', P ? P.shown.length + ' rows' : 'none');
ok(P && nondecr(P.shown.map(r => r.k)), 'PM: Projects order active → bidding → … (visible rows)', P ? JSON.stringify(P.shown.slice(0, 12).map(r => r.k + ':' + r.name.slice(0, 20))) : '');
ok(P && P.shown.length && P.shown[0].name === 'JOTEST Active job' || (P && P.shown[0].k === 'active'), 'PM: an active job is on top', P && P.shown[0] && P.shown[0].name);
ok(P && !P.rows.some(r => r.k === 'lost') && !P.heads.some(h => h.k === 'lost'), 'PM: no lost job, no "Show lost"');
ok(P && P.heads.some(h => h.k === 'finished' && h.vis && /Finished \(\d+\)/.test(h.t)) && !P.shown.some(r => r.k === 'finished'), 'PM: finished jobs folded under "▸ Finished (n)"', P && JSON.stringify(P.heads));
await clickHead(c, 'finished'); P = await projects(c);
ok(P && P.shown.some(r => r.name === 'JOTEST Done job') && nondecr(P.shown.map(r => r.k)), 'PM: a click on Finished shows them, still at the bottom');
const tabs = await c.ev(() => document.querySelector('main') ? document.querySelector('main').innerText.slice(0, 1500) : '');
/* the dashboard card */
await c.ev(() => window._setView('dashboard')); await sleep(2500);
const card = await c.ev(() => { const j = document.querySelector('[data-gc-jobs]'); if (!j) return null; const P = {}; (window._crm.projects || []).forEach(p => { P[p.name] = p; }); return [...j.querySelectorAll('b[style]')].map(b => b.textContent).filter(n => P[n]).map(n => window._gcJOCls(P[n]) + ':' + n); });
ok(card && card.some(x => x === 'bidding:JOTEST Bidding job') && !card.some(x => /^lost:/.test(x)) && nondecr(card.map(x => x.split(':')[0])), 'PM: dashboard card active → bidding → finished, no lost', JSON.stringify((card || []).slice(0, 8)));
/* Field "Pick a Job" */
await c.ev(() => window._gcJobPicker && window._gcJobPicker()); await sleep(1500);
const pick = await c.ev(() => { const ov = document.getElementById('_gcJobPick'); if (!ov) return null; const P = {}; (window._crm.projects || []).forEach(p => { P[p.id] = p; });
  const kids = [...ov.querySelectorAll('._jpItem[data-id], [data-gc-jo-head]')]; return { items: kids.filter(k => k.hasAttribute('data-id')).map(k => ({ k: window._gcJOCls(P[k.getAttribute('data-id')]), id: k.getAttribute('data-id'), vis: k.getClientRects().length > 0 })), heads: kids.filter(k => k.hasAttribute('data-gc-jo-head')).map(k => k.textContent) }; });
ok(pick && pick.items.length && nondecr(pick.items.map(x => x.k)), 'PM: Pick a Job in the same order', pick && JSON.stringify(pick.items.slice(0, 8).map(x => x.k)));
ok(pick && !pick.items.some(x => x.k === 'lost'), 'PM: Pick a Job has no lost job');
ok(pick && (!pick.items.some(x => x.k === 'finished') || (pick.heads.some(h => /Finished/.test(h)) && !pick.items.some(x => x.k === 'finished' && x.vis))), 'PM: Pick a Job folds finished jobs', pick && JSON.stringify(pick.heads));
await c.ev(() => { const o = document.getElementById('_gcJobPick'); if (o) o.remove(); });
/* the message picker + the helpers */
await c.ev(() => window._gcPickJobForMessages && window._gcPickJobForMessages()); await sleep(1200);
const msg = await c.ev(() => { const P = {}; (window._crm.projects || []).forEach(p => { P[p.id] = p; }); const l = [...document.querySelectorAll('#_jpList [data-pid]')].map(r => window._gcJOCls(P[r.getAttribute('data-pid')])); const x = document.getElementById('_jpX'); if (x) x.click(); return l; });
ok(msg.length && !msg.includes('lost') && nondecr(msg), 'PM: message picker in the same order, no lost job', JSON.stringify(msg.slice(0, 8)));
const helpers = await c.ev(() => ({ vis: window._gcJOVisible((window._crm.projects || []).filter(p => /^JOTEST/.test(p.name))).map(p => p.id), fp: window._gcFPSort((window._crm.projects || []).filter(p => /^JOTEST/.test(p.name))).map(p => p.id) }));
ok(!helpers.vis.includes('PRJJO_LOST') && helpers.fp.join() === 'PRJJO_ACT,PRJJO_HOLD,PRJJO_BID,PRJJO_DONE', 'PM: Field / role-app sort hook: active (latest first) → bidding → finished, no lost', JSON.stringify(helpers));
ok(!c.errs.length, 'PM: no page errors', c.errs.slice(0, 3).join(' | '));
await c.b.close();

/* ═════ admin ═════ */
c = await boot('wjohnson@grayco-cs.com');
await openProjects(c);
P = await projects(c);
ok(P && nondecr(P.shown.map(r => r.k)), 'admin: Projects All in the same order', P && JSON.stringify(P.shown.slice(0, 6).map(r => r.k)));
const lostHead = P && P.heads.find(h => h.k === 'lost');
ok(P && lostHead && /Show lost \(\d+\)/.test(lostHead.t) && !P.shown.some(r => r.k === 'lost') && P.lastIsLost, 'admin: lost jobs only behind "Show lost (n)" at the very bottom', lostHead && lostHead.t);
await clickHead(c, 'finished'); await clickHead(c, 'lost'); P = await projects(c);
ok(P && P.shown.some(r => r.name === 'JOTEST Lost job') && P.shown[P.shown.length - 1].k === 'lost', 'admin: after "Show lost" the lost jobs show, last');
const pk = await c.ev(() => { const l = window._gcJOPick(window._crm.projects); const k = l.map(p => window._gcJOCls(p)); const R = { active: 0, bidding: 1, other: 2, finished: 3, lost: 4 }; return { n: l.length, sorted: k.every((x, i) => !i || R[x] >= R[k[i - 1]]), lastLost: k[k.length - 1] === 'lost', same: window._gcJOPick(window._crm.projects) === l }; });
ok(pk.sorted && pk.lastLost && pk.same, 'admin: job drop-downs list the same order, lost last (one cached copy)', JSON.stringify(pk));
/* a rendered React drop-down (the expenses' job picker), if this screen has one */
await c.ev(() => window._setView('expenses')); await sleep(2500);
const dd = await c.ev(() => { const P = {}; (window._crm.projects || []).forEach(p => { P[p.id] = p; }); const sel = [...document.querySelectorAll('#root select')].find(s => [...s.options].filter(o => P[o.value]).length > 20); if (!sel) return null; const k = [...sel.options].filter(o => P[o.value]).map(o => window._gcJOCls(P[o.value])); const R = { active: 0, bidding: 1, other: 2, finished: 3, lost: 4 }; return { n: k.length, sorted: k.every((x, i) => !i || R[x] >= R[k[i - 1]]) }; });
if (dd) ok(dd.sorted, 'admin: a rendered job drop-down is in the same order, lost last', JSON.stringify(dd)); else console.log('note: no job drop-down on the Expenses screen without opening a form');
ok(!c.errs.length, 'admin: no page errors', c.errs.slice(0, 3).join(' | '));
await c.b.close();
console.log(`JOBORDER ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
