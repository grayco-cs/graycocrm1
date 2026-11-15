// test_CCCONTACT2.mjs <build-dir> [shot-dir] — patch CCCONTACT2 (owner 11/5 "to enter the job in the crm at all a phone number or email
// has to be in the crm / company cam / grayco photos"; 11/15 list, item 3). Made-up data only; mocks; nothing leaves the machine.
//   A. companycam-sync: a new 2026 CompanyCam project with a phone / an e-mail → a job; with neither → "📷 Needs contact info" on the
//      review list, NOT a job; the contact typed on the list (webhook ?proxy=review act contact) → the next sync makes the job with it;
//      a bad contact is refused.
//   B. the CRM: the GrayCo Photos review row has Phone / E-mail and "＋ Save and make the job" (posts act contact with the phone);
//      🚀 Convert to job on a lead with no phone / e-mail stops with the box, saves it on the lead and goes on to Launch Job; a lead
//      with a phone goes straight on; the money-inbox ＋ New job (NEWPROJ's ➕ New project, a data-entry form) only notes a missing phone / e-mail — "Save without" goes on (owner 11/15).
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const FN = path.join(BUILD, 'netlify/functions');

/* ════ A ════ */
{
  Object.assign(process.env, { COMPANYCAM_TOKEN: 'X'.repeat(40), SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', CC_BACKOFF_MS: '0' });
  const T = s => Math.floor(Date.parse(s) / 1000);
  const CC = [
    { id: 7101, name: 'Zedd Porch', address: { street_address_1: '101 Zedd Ln', city: 'Memphis', state: 'TN' }, created_at: T('2026-10-02T00:00:00Z'), status: 'active', primary_contact: { name: 'Zed Demo', phone_number: '(901) 555-0161' } },
    { id: 7102, name: 'Demo Fence', address: { street_address_1: '102 Demo Ave', city: 'Memphis', state: 'TN' }, created_at: T('2026-10-03T00:00:00Z'), status: 'active' },
    { id: 7103, name: 'Demo Deck', address: { street_address_1: '103 Demo Ct', city: 'Memphis', state: 'TN' }, created_at: T('2026-10-04T00:00:00Z'), status: 'active', primary_contact: { name: 'Dee Demo', email: 'dee@demo.test' } }];
  const KV = { projects: [], leads: [], customers: [], users: [], gc_epoch: { epoch: 'e1' } };
  global.fetch = async function(url, init){
    const u = String(url);
    const J = (b, st) => ({ ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
    if (u.includes('/auth/v1/user')) return J({ email: 'boss@grayco.test' });
    if (u.includes('/rest/v1/gc_staff')) return J([{ email: 'boss@grayco.test', role: 'admin', active: true }]);
    if (u.startsWith('https://api.companycam.com/v2/company')) return J({ id: 1, name: 'Demo Co' });
    if (u.startsWith('https://api.companycam.com/v2/projects')) { const pg = +(new URL(u).searchParams.get('page') || 1); return J(pg === 1 ? CC : []); }
    if (u.startsWith('https://api.companycam.com/v2/users')) return J({}, 404);
    if (u.startsWith('https://sb.test/rest/v1/gc_kv')) {
      if (init && init.method === 'POST') { JSON.parse(init.body).forEach(r => { KV[r.key] = r.value; }); return J([], 201); }
      const m = /key=in\.\(([^)]*)\)/.exec(decodeURIComponent(u)), m2 = /key=eq\.([^&]*)/.exec(decodeURIComponent(u)); const keys = m ? m[1].split(',').map(x => x.replace(/"/g, '')) : m2 ? [m2[1]] : [];
      return J(keys.filter(k => KV[k] !== undefined).map(k => ({ key: k, value: KV[k] })));
    }
    if (u.startsWith('https://sb.test/rest/v1/')) return J([]);
    return J({}, 404);
  };
  const SYNC = require(path.join(FN, 'companycam-sync.js'));
  const r1 = await SYNC._t.run({ person: true });
  const P = id => KV.projects.find(p => p.id === id);
  ok('A1 the project with a phone and the one with an e-mail become jobs (contact on the job)', P('PRJcc_7101') && P('PRJcc_7101').clientPhone === '(901) 555-0161' && P('PRJcc_7103') && P('PRJcc_7103').clientEmail === 'dee@demo.test', { ok: r1.ok, ids: KV.projects.map(p => p.id), err: r1.error });
  ok('A1 the one with neither is NOT a job', !P('PRJcc_7102'));
  const row = (KV.gc_cc_review || []).find(x => x.cc === '7102');
  ok('A1 …it is on the list as 📷 Needs contact info (kind contact)', row && row.kind === 'contact' && /no customer phone or e-mail/.test(row.why), KV.gc_cc_review);
  const WH = require(path.join(FN, 'companycam-webhook.js'));
  const call = b => WH.handler({ httpMethod: 'POST', queryStringParameters: { proxy: 'review' }, headers: { authorization: 'Bearer t', origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(b) });
  const bad = await call({ cc: '7102', act: 'contact', phone: '555-01', email: 'nope' });
  ok('A2 a bad contact is refused (400)', bad.statusCode === 400, bad.body);
  const good = JSON.parse((await call({ cc: '7102', act: 'contact', phone: '901-555-0162', kind: 'contact' })).body);
  ok('A2 the typed phone is kept for the next sync (and a full read asked)', good.ok && KV.gc_cc_sync_request.contact['7102'].phone === '9015550162' && KV.gc_cc_sync_request.make['7102'] && KV.gc_cc_sync_request.full === true && !(KV.gc_cc_review || []).some(x => x.cc === '7102'), KV.gc_cc_sync_request);
  await SYNC._t.run({ person: true });
  ok('A3 the next sync makes the job with that phone', P('PRJcc_7102') && P('PRJcc_7102').clientPhone === '9015550162', P('PRJcc_7102'));
  ok('A3 and its 📷 Needs contact info row is gone', !(KV.gc_cc_review || []).some(x => x.cc === '7102' && x.kind === 'contact'), KV.gc_cc_review);
}

/* ════ B ════ */
const { computer, signIn, sleep, cset, resetCloud, onFn } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 864e5).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'P1', name: 'Zedd Demo Job', client: 'Zedd Demo', clientPhone: '9015550111', address: '1 Demo St', status: 'active', createdAt: at, updatedAt: at }]);
cset('customers', [{ id: 'C1', name: 'Demo Customer LLC', phone: '9015550170', createdAt: at, updatedAt: at }]);
cset('leads', [{ id: 'L1', name: 'Zedd No Contact', stage: 'New Lead', status: 'new', source: 'Website', createdAt: at, updatedAt: at },
  { id: 'L2', name: 'Demo Has Phone', phone: '(901) 555-0172', stage: 'New Lead', status: 'new', source: 'Website', createdAt: at, updatedAt: at }]);
const REV = [];
onFn('companycam-webhook', ({ query, body }) => { if (query.proxy === 'review') { REV.push(body); return { ok: true }; } return { ok: true, review: [{ cc: '7102', kind: 'contact', name: 'Demo Fence', address: '102 Demo Ave', why: 'no customer phone or e-mail in CompanyCam. Type one here (or add it in CompanyCam) and it becomes a job on the next sync.' }], state: {} }; });
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('B0 the CRM is up', !!await wait(() => window._gcLeadContact && window._gcLeadsHub && (window._crm.leads || []).length >= 2, null, 60000));
/* B1 the review row — the KIND / row / handler code drawn the same way the ccsync card does it */
const src = await A.ev(() => [].map.call(document.querySelectorAll('script'), s => s.textContent).join('\n').indexOf("data-ccs-act=\"contact\"") >= 0);
ok('B1 the GrayCo Photos list has the 📷 Needs contact info row (Phone / E-mail / ＋ Save and make the job)', src === true);
/* B2 Convert to job */
await A.ev(() => { if (window._setView) window._setView('leads'); });
await sleep(2500);
await A.ev(() => window._gcLeadsHub.open('L1'));
await wait(() => document.querySelector('#gcl-drawer [data-d="convert"]'));
await A.ev(() => document.querySelector('#gcl-drawer [data-d="convert"]').click());
let box = await wait(() => { const o = document.getElementById('gc-lc-ov'); return o && o.textContent; }, null, 6000);
ok('B2 Convert on a lead with no phone / e-mail → "📇 Add the customer\'s phone or e-mail first"', /Add the customer's phone or e-mail first/.test(box || ''), box);
ok('B2 …and it did NOT go to Launch Job yet', await A.ev(() => (window._crm && window._crm.view) !== 'launchjob' && !/Launch Job/.test((document.querySelector('main h1, main h2') || {}).textContent || '')));
await shot(A, 'b2_convert');
await A.page().fill('#gc-lc-ov [data-lc="ph"]', '901-55');
await A.ev(() => document.querySelector('#gc-lc-ov [data-lc="ok"]').click());
ok('B2 a short number is refused', /10-digit/.test(await A.ev(() => document.querySelector('#gc-lc-ov [data-lc="err"]').textContent)));
await A.page().fill('#gc-lc-ov [data-lc="ph"]', '(901) 555-0171');
await A.ev(() => document.querySelector('#gc-lc-ov [data-lc="ok"]').click());
const saved = await wait(() => { const l = window._crm.leads.find(x => x.id === 'L1'); return l && l.phone; });
ok('B2 the phone is saved on the lead', saved === '(901) 555-0171', saved);
const lj = await wait(() => { const v = localStorage.getItem('grayco_view') || ''; return /launchjob/.test(v) || !!document.querySelector('[data-gc-launch], #gc-launch') || /Launch Job/.test(document.body.innerText.slice(0, 4000)) ? 'yes' : null; }, null, 8000);
ok('B2 …then it goes on to Launch Job', lj === 'yes');
/* a lead with a phone: straight on, no box */
await A.ev(() => { if (window._setView) window._setView('leads'); }); await sleep(2000);
await A.ev(() => window._gcLeadsHub.open('L2')); await wait(() => document.querySelector('#gcl-drawer [data-d="convert"]'));
await A.ev(() => document.querySelector('#gcl-drawer [data-d="convert"]').click()); await sleep(1200);
ok('B3 a lead with a phone converts with no box', !await A.ev(() => !!document.getElementById('gc-lc-ov')));
/* B4 the money inbox ＋ New job */
const nj = await A.ev(() => { const sel = document.createElement('select'); sel.setAttribute('data-gcnj-name', 'Enterprise Demo'); document.body.appendChild(sel); window.__zzNJ = window._gcNewJobFor(sel); return true; });
await wait(() => document.querySelector('[data-np="ph"]'));
await A.page().fill('[data-np="name"]', 'Zedd Enterprise Demo'); await A.page().selectOption('[data-np="status"]', 'completed').catch(() => {}); await sleep(400);
await A.ev(() => document.querySelector('[data-np="ok"]').click());
const note = await A.ev(() => ({ err: (document.querySelector('[data-np="err"]') || {}).textContent, btn: (document.querySelector('[data-np="ok"]') || {}).textContent }));
ok('B4 ➕ New project (invoice / money data entry) with no phone / e-mail → a note "No phone or e-mail — add one if you have it" + "Save without" (not a block)', /No phone or e-mail — add one if you have it/.test(note.err || '') && note.btn === 'Save without', note);
for (let i = 0; i < 2; i++) { await A.ev(() => { const b = document.querySelector('[data-np="ok"]'); if (b) b.click(); }); await sleep(900); }   /* Save without (and past "Did you mean…?" if it shows) */
const made0 = await wait(() => { const p = window._crm.projects.find(x => x.name === 'Zedd Enterprise Demo'); return p ? { ph: p.clientPhone || '', em: p.clientEmail || '' } : null; });
ok('B4 Save without → the job is made with no contact (data entry never blocked)', made0 && !made0.ph && !made0.em, made0);
await A.ev(() => { const sel = document.createElement('select'); sel.setAttribute('data-gcnj-name', 'Demo Church Roof'); document.body.appendChild(sel); window._gcNewJobFor(sel); });
await wait(() => document.querySelector('[data-np="ph"]'));
await A.page().fill('[data-np="name"]', 'Zedd Church Roof Demo');
await A.page().fill('[data-np="cust"]', 'Demo Customer LLC'); await A.page().selectOption('[data-np="status"]', 'completed').catch(() => {}); await sleep(600);
for (let i = 0; i < 2; i++) { await A.ev(() => { const b = document.querySelector('[data-np="ok"]'); if (b) b.click(); }); await sleep(900); }
const made = await wait(() => { const p = window._crm.projects.find(x => x.name === 'Zedd Church Roof Demo'); return p ? { ph: p.clientPhone || p.phone } : null; });
ok('B4 a customer from the list with a phone → no note, the job carries that phone', made && String(made.ph).replace(/\D/g, '') === '9015550170', made);
ok('B5 no page errors', A.errs.length === 0, A.errs);
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
