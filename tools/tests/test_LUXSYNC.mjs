// test_LUXSYNC.mjs <build> — LUXSYNC: assign on the new Leads screen reaches the cloud within seconds (CAS path); "Filters on" chip + empty state
import { computer, signIn, sleep, waitFor, shareBrowser, seed, stubInbox, ok, done, toLeads, tab, cget } from '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wLEADSUX/lux_env.mjs';
const build = process.argv[2];
const shared = await shareBrowser();
const data = seed({ twoEst: true, extra: [
  a => ({ id: 'T_U1', name: 'Sync Test One', address: '11 Sync Way', phone: '901-555-0101', source: 'Referral', leadKind: 'Residential', createdAt: a.ago(1) }),
  a => ({ id: 'T_U2', name: 'Sync Test Two', address: '12 Sync Way', phone: '901-555-0102', source: 'Referral', leadKind: 'Residential', createdAt: a.ago(1) }),
  a => ({ id: 'T_U3', name: 'Sync Test Three', address: '13 Sync Way', phone: '901-555-0103', source: 'Referral', leadKind: 'Residential', createdAt: a.ago(1) }),
  a => ({ id: 'T_U4', name: 'Sync Test Four', address: '14 Sync Way', phone: '901-555-0104', source: 'Referral', leadKind: 'Residential', createdAt: a.ago(1) }),
  a => ({ id: 'T_EB', name: 'Bid: Est Filter Test', source: 'PlanHub', leadKind: 'Commercial', inboxId: 'IBE1', bidDue: a.inDays(4), estimator: 'Glenn Miller', phone: '901-555-3434' })] });
const A = await computer('A', { build }); await stubInbox(A, data.inbox);
await signIn(A, 'wjohnson@grayco-cs.com', 12000);
await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^Later$/.test(x.textContent.trim())); if (b) b.click(); });
await toLeads(A, '#gc-lux .lux-card'); await sleep(9000);
const q = (fn, a) => A.ev(fn, a);
const cloudL = id => (cget('leads') || []).find(l => l && l.id === id) || {};
const leadsWrites = since => A.log.filter(x => x.t >= since && (x.method === 'POST' || x.method === 'PATCH') && x.path === '/rest/v1/gc_kv' && /"key"\s*:\s*"leads"/.test(x.body.slice(0, 400)));
async function cloudWait(fn, ms = 40000){ const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return Date.now() - t0; await sleep(100); } return -1; }
const cas0 = await q(() => window._gcCasStatus());
// ---- single assign
await A.page().locator('#gc-lux [data-lux=q]').fill('Sync Test One'); await sleep(900);
await q(() => document.querySelector('#gc-lux .lux-card[data-gcl-id="T_U1"] [data-gcl-asg]').click()); await sleep(400);
let t0 = Date.now();
await q(() => document.querySelector('#gcl-asgpick [data-asg-to="Steven Biffle"]').click());
let ms1 = await cloudWait(() => cloudL('T_U1').pm === 'Steven Biffle');
console.log('MEASURE single assign -> cloud ms', ms1);
ok('single assign reaches the cloud within 8 s (' + ms1 + ' ms)', ms1 >= 0 && ms1 <= 8000, ms1);
await A.page().locator('#gc-lux [data-lux=q]').fill(''); await sleep(800);
// ---- bulk assign of 3
await A.page().locator('#gc-lux [data-lux=q]').fill('Sync Way'); await sleep(900);
await q(() => document.querySelector('#gc-lux [data-lux-act=menu]').click()); await sleep(300);
await q(() => document.querySelector('#gc-lux [data-lux-act=bulk]').click()); await sleep(800);
for (const id of ['T_U2', 'T_U3', 'T_U4']) { await q(id => document.querySelector('#gc-lux [data-gcl-pick="' + id + '"]').click(), id); await sleep(300); }
ok('bulk: 3 ticked', await q(() => /\(3\)/.test(document.querySelector('#gc-lux [data-gcl-bulkasg]').textContent)));
await q(() => document.querySelector('#gc-lux [data-gcl-bulkasg]').click()); await sleep(400);
t0 = Date.now();
await q(() => document.querySelector('#gcl-asgpick [data-asg-to="Nick Thomas"]').click());
let ms3 = await cloudWait(() => ['T_U2', 'T_U3', 'T_U4'].every(id => cloudL(id).pm === 'Nick Thomas'));
console.log('MEASURE bulk assign(3) -> cloud ms', ms3);
ok('bulk assign of 3 reaches the cloud within 8 s (' + ms3 + ' ms)', ms3 >= 0 && ms3 <= 8000, ms3);
const w3 = leadsWrites(t0).filter(x => x.t <= t0 + Math.max(ms3, 0) + 50);
console.log('   leads writes until all 3 landed:', w3.map(x => x.method + ' ' + x.q.slice(0, 80) + ' +' + (x.t - t0)));
ok('bulk: one push carries all 3 (no write with only part of them before)', w3.length >= 1 && w3.length <= 2, w3.length);
const cas1 = await q(() => window._gcCasStatus());
ok('the pushes go through compare-and-set (no blind leads write; gated grew)', ((cas1.blindBy || {}).leads || 0) === ((cas0.blindBy || {}).leads || 0) && cas1.gated > cas0.gated, { blind0: cas0.blindBy, blind1: cas1.blindBy, gated: [cas0.gated, cas1.gated] });
await q(() => document.querySelector('#gc-lux [data-lux-act=menu]').click()); await sleep(300);
await q(() => document.querySelector('#gc-lux [data-lux-act=bulk]').click()); await sleep(500);
await A.page().locator('#gc-lux [data-lux=q]').fill(''); await sleep(800);
// ---- stage change / mark contacted push too
t0 = Date.now();
await q(() => window._gcLeadsEngine.markContacted('T_U2'));
let msc = await cloudWait(() => !!cloudL('T_U2').contactedAt);
ok('mark contacted reaches the cloud within 8 s (' + msc + ' ms)', msc >= 0 && msc <= 8000, msc);
t0 = Date.now();
await q(() => window._gcLeadsEngine.moveStage('T_U3', 'Site Visit'));
let mss = await cloudWait(() => cloudL('T_U3').stage === 'Site Visit');
ok('stage change reaches the cloud within 8 s (' + mss + ' ms)', mss >= 0 && mss <= 8000, mss);
// ---- filters chip (admin, Leads)
const fon = () => q(() => { const f = document.querySelector('#gc-lux [data-lux=fon]'); return f && !f.hidden ? f.innerText.replace(/\s+/g, ' ').trim() : ''; });
ok('no filters: no chip', (await fon()) === '', await fon());
await q(() => { const t = document.querySelector('#gc-lux [data-lux-sel=stage]'); t.value = 'Won'; t.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(600);
await q(() => { const e = window._gcLeadsEngine, u = e.ui(); u.un = true; u.due = '7'; e.saveUI(); window._gcLux.dirty('t'); }); await sleep(600);
ok('chip shows "Filters on (3) · Clear all"', /Filters on \(3\)/.test(await fon()) && /Clear all/.test(await fon()), await fon());
const emp = await q(() => { const e = document.querySelector('#gc-lux .lux-empty'); return e ? e.innerText.replace(/\s+/g, ' ').trim() + '|' + !!e.querySelector('button[data-lux-act=clearf]') : ''; });
ok('empty state: "No leads match your filters — Clear filters" with a button', /No leads match your filters/.test(emp) && /Clear filters/.test(emp) && /\|true$/.test(emp), emp);
await q(() => document.querySelector('#gc-lux .lux-empty button[data-lux-act=clearf]').click()); await sleep(800);
ok('Clear filters: chip gone, list back, filters reset', (await fon()) === '' && await q(() => { const u = window._gcLeadsEngine.ui(); return !u.stage && !u.un && !u.due && document.querySelectorAll('#gc-lux .lux-card').length > 5; }));
await A.page().locator('#gc-lux [data-lux=q]').fill('zzzz-nothing'); await sleep(900);
await q(() => document.querySelector('#gc-lux [data-lux-chip=new]').click()); await sleep(600);
ok('search + chip count as filters (2)', /Filters on \(2\)/.test(await fon()), await fon());
await q(() => document.querySelector('#gc-lux [data-lux=fon] [data-lux-act=clearf]').click()); await sleep(800);
ok('chip "Clear all": search box emptied, chip off', (await fon()) === '' && await q(() => document.querySelector('#gc-lux [data-lux=q]').value === '' && !document.querySelector('#gc-lux [data-lux-chip].on')));
// ---- Bids list
await tab(A, 'bidboard'); await waitFor(A, () => !!document.querySelector('#gc-lux-bids .lux-br'), null, 20000, 200);
const bfon = () => q(() => { const f = document.querySelector('#gc-lux-bids [data-lux=bfon]'); return f && !f.hidden ? f.innerText.replace(/\s+/g, ' ').trim() : ''; });
ok('Bids: no filters, no chip', (await bfon()) === '', await bfon());
await q(() => { const s = document.querySelector('#gc-lux-bids [data-lux-bsel=due]'); s.value = 'past'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(400);
await A.page().locator('#gc-lux-bids [data-lux=bq]').fill('zzzz-nothing'); await sleep(900);
ok('Bids: chip "Filters on (2)"', /Filters on \(2\)/.test(await bfon()) && /Clear all/.test(await bfon()), await bfon());
const bemp = await q(() => { const e = document.querySelector('#gc-lux-bids .lux-empty'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
ok('Bids: empty state "No bids match your filters — Clear filters"', /No bids match your filters/.test(bemp) && /Clear filters/.test(bemp), bemp);
await q(() => document.querySelector('#gc-lux-bids .lux-empty [data-lux-bact=clearf]').click()); await sleep(800);
ok('Bids: cleared — rows back, search empty, due reset', (await bfon()) === '' && await q(() => document.querySelectorAll('#gc-lux-bids .lux-br').length > 5 && document.querySelector('#gc-lux-bids [data-lux=bq]').value === '' && document.querySelector('#gc-lux-bids [data-lux-bsel=due]').value === ''));
ok('A: no page errors', A.errs.filter(e => /PAGEERROR/.test(e) && !/unstable_scheduleCallback/.test(e)).length === 0, A.errs.slice(0, 3));
// ---- estimator: saved filters come back -> visible chip
const E = await computer('E', { build }); await stubInbox(E, data.inbox);
await E.ctx.addInitScript(() => { try { if (!sessionStorage.getItem('t_seeded')) { sessionStorage.setItem('t_seeded', '1'); localStorage.setItem('gc_leads_ui_v2:gmiller@grayco-cs.com:est', JSON.stringify({ v: 'list', sort: 'born', dir: -1, preset: 'bids', stage: 'Won', due: 'past', un: true })); } } catch (e) {} });
await signIn(E, 'gmiller@grayco-cs.com', 12000);
await E.ev(() => window._setView('leads')); await waitFor(E, () => !!document.querySelector('#gc-lux-bids'), null, 40000, 200); await sleep(1200);
await E.ev(() => document.querySelector('#gc-leads-tabs [data-gc-tab="leads"]').click()); await waitFor(E, () => !!document.querySelector('#gc-lux [data-lux=body]'), null, 20000, 200); await sleep(2500);
const ef = await E.ev(() => { const f = document.querySelector('#gc-lux [data-lux=fon]'); return f && !f.hidden ? f.innerText.replace(/\s+/g, ' ').trim() : ''; });
ok('estimator: saved filters (stage/due/unassigned) come back -> "Filters on (3)" chip', /Filters on \(3\)/.test(ef), ef);
const ee = await E.ev(() => { const e = document.querySelector('#gc-lux .lux-empty'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
ok('estimator: empty list explains itself', /No leads match your filters/.test(ee), ee);
await E.ev(() => document.querySelector('#gc-lux [data-lux=fon] [data-lux-act=clearf]').click()); await sleep(1000);
ok('estimator: Clear all -> bids back, chip gone, preset stays bids', await E.ev(() => document.querySelectorAll('#gc-lux .lux-card').length > 0 && (document.querySelector('#gc-lux [data-lux=fon]') || {}).hidden !== false && window._gcLeadsEngine.ui().preset === 'bids'));
ok('E: no page errors', E.errs.filter(e => /PAGEERROR/.test(e) && !/unstable_scheduleCallback/.test(e)).length === 0, E.errs.slice(0, 3));
done(shared);
