// test_MAINTPLANS.mjs <build-dir> — patch MAINTPLANS in a browser (offline harness), with the REAL portal-plus.js server code
// answering /.netlify/functions/portal-plus from an in-memory gc_kv:
//   1) ⚙ 🛠 Maintenance plans: 7 plans, each with how often + usual price; change a price, add a plan, Save → stored
//   2) a job's 🛠 Maintenance: every plan listed with a checkbox and the usual price filled in; tick 2, change one price,
//      Send quote → one maint_quote item on ✅ Approvals listing both plans; both quoted
//   3) the customer portal card (portal-plus.js): "Your maintenance plans" shows both with price + how often
//   4) no page errors
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS } = await import(HARNESS);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const build = process.argv[2] || ROOT, FN = path.join(build, 'netlify/functions'), email = 'wjohnson@grayco-cs.com';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };

/* ── the server: portal-plus.js as is, its storage in memory ── */
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test-key'; process.env.PORTAL_MAIL_OFF = '1';
const KV = { gc_maint: [], users: [] }, APPROVALS = [];
const realFetch = global.fetch;
global.fetch = async function(url, init){
  const u = String(url);
  if (u.startsWith('https://sb.test/rest/v1/gc_kv') && init && init.method === 'POST') { const b = JSON.parse(init.body); KV[b.key] = JSON.parse(b.value); return { ok: true, status: 201, json: async () => ({}), text: async () => '' }; }
  if (u.startsWith('https://sb.test/')) return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
  return realFetch(url, init);
};
const core = require(path.join(FN, 'portal.js'))._core;
Object.assign(core, {
  kvRead: async keys => { const o = {}; keys.forEach(k => { if (KV[k] !== undefined) o[k] = JSON.parse(JSON.stringify(KV[k])); }); return o; },
  kvListUpdate: async (key, mutate) => { const cur = Array.isArray(KV[key]) ? KV[key] : []; const m = mutate(JSON.parse(JSON.stringify(cur))); if (!m || !m.list) return { ok: true, result: m && m.result, list: cur }; KV[key] = m.list; return { ok: true, result: m.result, list: m.list }; },
  queueApproval: async o => { if (!APPROVALS.some(x => x.id === o.id)) APPROVALS.push(o); return true; },
  officeTodo: async () => true,
  findProject: (d, pid) => (d.projects || []).find(p => String(p.id) === String(pid)) || null,
  pmOf: () => ({ name: 'Pat PM', email: 'pat@grayco-cs.com' }), LINK_PH: '{{PORTAL_LINK}}'
});
const X = require(path.join(FN, 'portal-plus.js'))._x9;
const ADMIN = { ok: true, admin: true, email, name: 'Wesley' };
let JOB = null;
async function answer(body){
  if (['list', 'quote', 'quote-many', 'update', 'plans'].includes(body.action)) return (await X.staffAct(body, ADMIN)).out;
  const A = await X.readAll(); const p = A.data.projects[0];
  if (body.action === 'view') return await X.view(A, p);
  return { ok: false, error: 'not in this test' };
}

resetCloud(); seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
const c = await computer('MP', { build }); const p = c.page();
await c.ctx.route('**/.netlify/functions/portal-plus*', async r => {
  let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await answer(body)) });
});
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20 && window._gcX9 && window._gcX9.maint, null, 120000, 300); await sleep(4000);
JOB = await p.evaluate(() => { const l = window._crm.projects.filter(x => x && !x.deleted && /resid/i.test(String(x.type || ''))); return JSON.parse(JSON.stringify(l[0] || window._crm.projects[0])); });
KV.projects = [Object.assign({}, JOB, { clientEmail: 'ann@example.com', insCarrier: 'State Farm' })];

console.log('1. the catalog');
await p.evaluate(() => window._gcX9.maint.plans()); await sleep(1500);
const cat = await p.evaluate(() => { const ov = [...document.querySelectorAll('.gcx9-plan')].filter(el => !el.hidden); return ov.map(el => ({ name: el.querySelector('[data-k="name"]').value, price: el.querySelector('[data-k="price"]').value, freq: el.querySelector('[data-k="freq"]').value })); });
ok(cat.length === 10 && cat.every(x => +x.price > 0) && cat.some(x => x.name === 'HVAC Maintenance') && cat.some(x => x.name === 'Pressure Washing'), '10 home plans, each with a usual price, HVAC + pressure washing among them (' + cat.map(x => x.name + ' $' + x.price + ' ' + x.freq).join('; ') + ')');
ok(cat.filter(x => x.freq === 'twice').length === 3, 'three home plans are twice a year');
ok(await p.evaluate(() => /starting list/.test(document.body.textContent)), 'the prices are shown as a starting list to set');
await p.locator('[data-mkt="commercial"]').click(); await sleep(300);
const com = await p.evaluate(() => [...document.querySelectorAll('.gcx9-plan')].filter(el => !el.hidden).map(el => el.querySelector('[data-k="name"]').value));
ok(com.length === 10 && com.includes('Roof Coating Maintenance') && com.includes('Free Roof Inspection'), 'the 🏢 Commercial switch shows the 10 commercial plans');
await p.locator('[data-mkt="residential"]').click(); await sleep(300);
await p.evaluate(() => { const el = [...document.querySelectorAll('.gcx9-plan')].find(e => e.querySelector('[data-k="name"]').value === 'Roof Check-up'); el.querySelector('[data-k="price"]').value = '310'; });
await p.locator('[data-add]').click(); await sleep(300);
await p.evaluate(() => { const els = document.querySelectorAll('.gcx9-plan'), el = els[els.length - 1]; el.querySelector('[data-k="name"]').value = 'Skylight Care'; el.querySelector('[data-k="price"]').value = '120'; el.querySelector('[data-k="includes"]').value = 'Skylights cleaned and resealed.'; });
await p.locator('[data-save]').click(); await sleep(1200);
ok(KV.gc_maint_plans && KV.gc_maint_plans.plans.length === 21 && KV.gc_maint_plans.plans.find(x => x.id === 'roof').price === 310 && KV.gc_maint_plans.plans.some(x => x.name === 'Skylight Care' && x.price === 120), 'Save stores the catalog (gc_maint_plans): Roof Check-up $310, Skylight Care added');
await p.evaluate(() => document.querySelectorAll('.gcx9-ov, [class*="gcx9-ov"]').forEach(x => x.remove()));
await p.keyboard.press('Escape').catch(() => {});
await p.evaluate(() => { [...document.querySelectorAll('.gcx9-plan')].forEach(el => { let o = el; while (o && o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o && o.parentElement === document.body) o.remove(); }); });

console.log('2. a job: pick 2 plans, Send quote');
await p.evaluate(pid => window._gcX9.maint.open(pid), JOB.id); await sleep(1500);
const rows = await p.evaluate(() => [...document.querySelectorAll('.gcx9-plan[data-plan]')].map(el => ({ id: el.getAttribute('data-plan'), cb: !!el.querySelector('[data-pick]'), price: (el.querySelector('[data-price]') || {}).value })));
ok(rows.length === 11 && rows.every(x => x.cb), 'every home plan is listed with a checkbox (' + rows.length + ')');
ok(rows.find(x => x.id === 'roof').price === '310' && rows.find(x => x.id === 'gutter').price === '240', 'the price is filled in from the plan (roof 310, gutter 240)');
ok(await p.locator('[data-sendq]').isDisabled(), 'Send quote waits for a ticked plan');
await p.locator('[data-pick="roof"]').check(); await p.locator('[data-pick="gutter"]').check(); await sleep(200);
await p.locator('[data-price="gutter"]').fill('260'); await sleep(200);
const btn = await p.locator('[data-sendq]').textContent();
ok(/2 plans/.test(btn), 'the button says 2 plans (' + btn + ')');
await p.locator('[data-sendq]').click(); await sleep(2000);
const q = APPROVALS.filter(a => a.kind === 'maint_quote');
ok(q.length === 1 && q[0].meta.contractIds.length === 2, 'ONE maint_quote item on ✅ Approvals for both plans');
ok(q[0] && /\$310\.00 per year/.test(q[0].html) && /\$260\.00 per year/.test(q[0].html) && !/state\s*farm/i.test(q[0].html + q[0].subject), 'its e-mail lists both prices, no carrier name');
ok(KV.gc_maint.filter(x => x.status === 'quoted').length === 2, 'both plans are quoted for the job');
const after = await p.evaluate(() => [...document.querySelectorAll('.gcx9-plan[data-plan]')].filter(el => /In the portal/.test(el.textContent)).map(el => el.getAttribute('data-plan')));
ok(after.sort().join() === 'gutter,roof', 'the window shows both as "In the portal" (' + after.join() + ')');

console.log('3. the customer portal card');
const pg = await c.ctx.newPage();
await pg.route('https://app.local/portal-test', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="tabs"><nav class="tabs"><button data-tab="home" aria-selected="true">Home</button></nav></div><main id="main"><div class="col-r"><section id="gcsel" class="card">sel</section></div></main><script>window.PID="' + String(JOB.id).replace(/"/g, '') + '"</script><script src="/portal-plus.js"></script>' }));
await pg.goto('https://app.local/portal-test#t=' + 'T'.repeat(43)); await sleep(1500);
const card = await pg.evaluate(() => { const c = document.getElementById('gcpp-maint'); return c ? { h: c.querySelector('h2').textContent, text: c.textContent } : null; });
ok(card && /Your maintenance plans/.test(card.h), 'the portal shows "Your maintenance plans"');
ok(card && /Roof Check-up/.test(card.text) && /\$310\.00 per year/.test(card.text) && /Gutter Clean & Check/.test(card.text) && /\$260\.00 per year/.test(card.text) && /Twice a year/.test(card.text) && /every 6 months/.test(card.text), 'both plans with price and how often');
ok(card && /Other plans we offer/.test(card.text) && !/state\s*farm/i.test(card.text), 'the other plans below; no carrier name');
ok(card && card.text.indexOf('Roof Check-up') < card.text.indexOf('Other plans we offer'), 'the chosen plans come first');

const errs = c.errs.filter(e => !/ResizeObserver/.test(e));
ok(!errs.length, 'no page errors (' + errs.slice(0, 2).join(' | ') + ')');
console.log(`MAINTPLANS ${pass}/${pass + fail}`); await c.b.close().catch(() => {}); process.exit(fail ? 1 : 0);
