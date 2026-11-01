// test_MAINTTAB.mjs <build-dir> — patches MAINTTAB + MAINTPLUS in a browser (offline harness). /.netlify/functions/portal-plus
// is answered by the REAL server code (portal-plus.js → _lib/maint-tab.js → portal.js approvals) over an in-memory gc_kv.
//   1) the 🛠 Maintenance tab: in the menu for an admin, the office and a PM; not for a crew member or the Marketing Manager
//   2) add a prospect; ✉ Offer free roof inspection → a maint_outreach draft on ✅ Approvals
//   3) Plans & prices: residential / commercial lists, "set your price", save a price
//   4) Active plans: a signed plan with an overdue visit is red, one due within 14 days amber; the Maintenance Schedule lists them
//   5) no page errors
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS, cget, cset } = await import(HARNESS);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const build = process.argv[2] || ROOT, FN = path.join(build, 'netlify/functions');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };

/* ── the server, with its own in-memory gc_kv ── */
const KV = {}; let tick = 0;
function res(status, body){ return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }; }
function row(key){ return KV[key] ? [{ key, value: KV[key].value, updated_at: KV[key].at }] : []; }
function put(key, v){ KV[key] = { value: typeof v === 'string' ? v : JSON.stringify(v), at: new Date(Date.now() + (++tick)).toISOString() }; }
function get(key){ const v = KV[key] && KV[key].value; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return v; } }
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {};
  if (/api\.resend\.com/.test(url)) return res(200, { id: 'x' });
  if (/\/rest\/v1\/gc_kv/.test(url)) {
    if ((o.method || 'GET') === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = { value: x.value, at: new Date(Date.now() + (++tick)).toISOString() }; }); return res(201, {}); }
    const eq = /key=eq\.([^&]+)/.exec(url), inn = /key=in\.\(([^)]*)\)/.exec(url);
    if (eq) return res(200, row(decodeURIComponent(eq[1])));
    if (inn) return res(200, decodeURIComponent(inn[1]).split(',').map(k => k.replace(/"/g, '')).flatMap(row));
  }
  return res(200, []);
};
process.env.SUPABASE_URL = 'https://fake-mtb.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test_only'; process.env.PORTAL_MAIL_OFF = '1';
const X = require(path.join(FN, 'portal-plus.js'))._x9, C = require(path.join(FN, 'portal.js'))._core;
const ADMIN = { ok: true, admin: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson' };

resetCloud(); seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
const users = cget('users'); put('users', users); put('gc_automation_pause', { on: false });
async function session(email, name){
  const c = await computer(name, { build }); const p = c.page();
  await c.ctx.route('**/.netlify/functions/portal-plus*', async r => { let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    const out = (await X.staffAct(body, ADMIN)).out; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }); });
  await p.goto('https://app.local/index.html'); await sleep(2500);
  await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click();
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 120000, 300); await sleep(4000);
  return c;
}
const menuHas = c => c.page().evaluate(() => [...document.querySelectorAll('button, a')].some(b => /^\s*🛠\s*Maintenance\s*$/.test(b.textContent || '')));

console.log('1. who sees the tab');
const A = await session('wjohnson@grayco-cs.com', 'MTA'); const p = A.page();
ok(await menuHas(A), 'admin: 🛠 Maintenance is in the menu');
/* the job the tests use: a real project from the backup, with a signed plan and two visits (one overdue, one in 10 days) */
const JOB = await p.evaluate(() => JSON.parse(JSON.stringify(window._crm.projects.find(x => x && !x.deleted && x.address) || window._crm.projects[0])));
put('projects', [Object.assign({}, JOB, { clientEmail: 'cust@example.test', type: 'Commercial' })]);
const d0 = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10), d1 = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
put('gc_maint', [{ id: 'mt_t1', pid: String(JOB.id), planId: 'c_roof', planName: 'Commercial Roof Maintenance', status: 'signed', price: 1200, freq: 'twice', market: 'commercial', tier: 'bronze', signedAt: new Date(Date.now() - 200 * 864e5).toISOString(), soldBy: 'sbiffle@grayco-cs.com', performer: 'self', cost: 400 },
  { id: 'mt_t2', pid: String(JOB.id), planId: 'c_wash', planName: 'Pressure Washing', status: 'signed', price: 1400, freq: 'quarterly', market: 'commercial', tier: 'bronze', signedAt: new Date(Date.now() - 80 * 864e5).toISOString(), performer: 'sub', sub: 'Brenan Hart', subCost: 700 }]);
put('gc_maint_visits', [{ id: 'mv_a', contractId: 'mt_t1', pid: String(JOB.id), planName: 'Commercial Roof Maintenance', property: s(JOB.address), date: d0, status: 'planned', pm: 'Steven' },
  { id: 'mv_b', contractId: 'mt_t2', pid: String(JOB.id), planName: 'Pressure Washing', property: s(JOB.address), date: d1, status: 'planned' }]);
function s(v){ return v == null ? '' : String(v); }
await p.evaluate(() => window._setView('maint')); await sleep(2500);
ok(await p.evaluate(() => !!document.getElementById('gcmt') && /Due this month/.test(document.getElementById('gcmt').textContent)), 'the tab opens with "Due this month"');

console.log('2. prospects + outreach');
await p.locator('#gcmt [data-sec="pros"]').click(); await sleep(500);
await p.locator('#gcmt [data-a="p-add"]').click(); await sleep(300);
await p.locator('.gcmt-ov [data-pf="company"]').fill('Oak Plaza LLC'); await p.locator('.gcmt-ov [data-pf="contact"]').fill('Dana Facility'); await p.locator('.gcmt-ov [data-pf="email"]').fill('fm@oakplaza.test'); await p.locator('.gcmt-ov [data-pf="role"]').fill('Facility manager');
await p.locator('.gcmt-ov [data-ok]').click(); await sleep(1500);
ok((get('gc_maint_prospects') || []).some(x => x.company === 'Oak Plaza LLC') && await p.evaluate(() => /Oak Plaza LLC/.test(document.getElementById('gcmt').textContent)), '＋ Add prospect saves it and lists it');
await p.locator('#gcmt [data-pr] [data-a="o-free"]').first().click(); await sleep(400);
ok(await p.evaluate(() => /free roof inspection/i.test(document.querySelector('.gcmt-ov [data-s]').value) && /Dana/.test(document.querySelector('.gcmt-ov [data-b]').value)), 'the template opens filled in and editable');
await p.locator('.gcmt-ov [data-ok]').click(); await sleep(1500);
const aq = get(C.AQ_KEY) || [];
ok(aq.some(a => a.kind === 'maint_outreach' && a.to === 'fm@oakplaza.test'), 'the outreach e-mail draft is on ✅ Approvals (maint_outreach)');
ok((get('gc_maint_prospects') || [])[0].stage === 'Contacted', 'the prospect moved to Contacted');

console.log('3. plans & prices');
await p.locator('#gcmt [data-sec="plans"]').click(); await sleep(500);
const pl = await p.evaluate(() => ({ rows: document.querySelectorAll('#gcmt tr[data-pp]').length, unset: document.querySelectorAll('#gcmt [data-unset]').length, coat: /Roof Coating Maintenance/.test(document.getElementById('gcmt').textContent) }));
ok(pl.rows >= 15 && pl.coat && pl.unset > 0, 'the commercial plans list, each price marked "set your price" (' + pl.rows + ' plans, ' + pl.unset + ' unset)');
await p.locator('#gcmt [data-mkt="residential"]').click(); await sleep(300);
ok(await p.evaluate(() => /HVAC Maintenance/.test(document.getElementById('gcmt').textContent) && /Dryer Vent/.test(document.getElementById('gcmt').textContent)), 'the residential switch shows the home plans');
await p.locator('#gcmt [data-price="roof"]').fill('325'); await p.locator('#gcmt [data-a="saveprices"]').click(); await sleep(1500);
ok(get('gc_maint_plans').plans.find(x => x.id === 'roof').price === 325 && get('gc_maint_plans').plans.find(x => x.id === 'roof').priceSet === true, 'Save prices stores it and it is no longer a placeholder');

console.log('4. active plans + the Maintenance Schedule');
await p.locator('#gcmt [data-sec="active"]').click(); await sleep(600);
const act = await p.evaluate(() => [...document.querySelectorAll('#gcmt .card[data-cid]')].map(c => ({ id: c.getAttribute('data-cid'), cls: c.className, t: c.textContent })));
ok(act.length === 2 && act[0].id === 'mt_t1' && /\bred\b/.test(act[0].cls) && /overdue/.test(act[0].t), 'the overdue visit is first and red');
ok(act[1] && /\bamb\b/.test(act[1].cls), 'the visit within 14 days is amber');
ok(act[1] && /Brenan Hart/.test(act[1].t) && /PM commission/.test(act[1].t), 'the sub and the PM commission show on the plan');
ok(await p.evaluate(() => /PM commission on plans/.test(document.getElementById('gcmt').textContent)), 'the PM commission summary shows');
await p.locator('#gcmt [data-sec="sched"]').click(); await sleep(600);
ok(await p.evaluate(() => document.querySelectorAll('#gcmt [data-vid]').length === 2 && /not on the job schedule/.test(document.getElementById('gcmt').textContent)), 'the Maintenance Schedule lists both visits (its own list)');
const errA = A.errs.filter(e => !/ResizeObserver/.test(e)); await A.b.close().catch(() => {});

const O = await session('office@grayco-cs.com', 'MTO');
ok(await menuHas(O), 'the office: 🛠 Maintenance is in the menu'); const errO = O.errs.slice(); await O.b.close().catch(() => {});
const PMs = await session('sbiffle@grayco-cs.com', 'MTP');
ok(await menuHas(PMs), 'a PM: 🛠 Maintenance is in the menu');
ok(await PMs.page().evaluate(() => { window._gcIsMM = function(){ return true; }; return window._gcMaintCanSee() === false; }), 'the Marketing Manager: not shown');
const errP = PMs.errs.slice(); await PMs.b.close().catch(() => {});
cset('users', users.map(u => /sbiffle/i.test(u.email) ? Object.assign({}, u, { role: 'Crew' }) : u));
const CR = await session('sbiffle@grayco-cs.com', 'MTC');
ok(!(await menuHas(CR)) && !(await CR.page().evaluate(() => window._gcMaintCanSee())), 'a crew member: not shown');
const errC = CR.errs.slice(); await CR.b.close().catch(() => {});
const errs = errA.concat(errO, errP, errC).filter(e => !/ResizeObserver/.test(e));
ok(!errs.length, 'no page errors (' + errs.slice(0, 2).join(' | ') + ')');
console.log(`MAINTTAB ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
