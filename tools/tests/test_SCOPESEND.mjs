// test_SCOPESEND.mjs <build-dir> [shot-dir] — patch SCOPESEND (owner 11/12: "Make sure when you make a scope without numbers you also make
// one with budget numbers and delete all roofignite, also when you make a scope let you edit it to send to sub or send in sub portal and
// what sub on the job do I send it to."). Made-up data only (Zedd / Demo), offline harness, fake functions.
//   A. the server (no browser): lead-intake answers a Roof Ignite post 200 "ignored" and files / sends / alerts nothing; another lead
//      company is still taken; ROOF_IGNITE_INTAKE=1 turns Roof Ignite back on; the CRM's collector never gets a Roof Ignite lead.
//   B. the CRM: 📐 Scope by trade → "Save master to job" makes the 📋 sub scope (no prices) AND its 💲 budget twin (internal, linked, $
//      per line from the estimate's cost / the Price Book / blank to fill); ✏️ edit → the other side follows (the budget keeps its $);
//      ↻ regenerate after hand edits asks first; 📤 send: the job's subs first (awarded), 🔎 any sub; ✉️ e-mail through send-email.js
//      (mode personal — the CRM's own path, ⏸ held shows as held) with only the sub scope; 🔨 sub portal: posted to THAT sub's job
//      thread (s-send, party s:<sub>), a sub not on the job is added as Bidding first; with a total → s-scope-save submit (waits for the
//      PM); every send written on the scope; the budget can never be sent; 👷 Subs & portal + 📋 Scopes tab buttons.
//   C. ⚙ Admin → 🗑 Roof Ignite records: lists ONLY the Roof Ignite jobs / leads / customers, deletes them through the CRM's own
//      deletes (job delete list, 🗑 Recently deleted leads), nothing else.
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const req = createRequire(import.meta.url), FN = path.join(BUILD, 'netlify/functions');

/* ════ A. lead-intake ════ */
{
  const keep = {}; ['LEAD_KEY_ROOF_IGNITE', 'LEAD_KEY_CONTRACTOR_CONNECTION', 'ROOFING_IGNITE_KEY', 'ROOF_IGNITE_INTAKE', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RESEND_API_KEY', 'CRM_DRAIN_TOKEN', 'LEAD_INTAKE_ALERTS', 'PORTAL_AUTO_EMAIL'].forEach(k => { keep[k] = process.env[k]; });
  Object.assign(process.env, { LEAD_KEY_ROOF_IGNITE: 'ri-key-test', LEAD_KEY_CONTRACTOR_CONNECTION: 'cc-key-test', ROOFING_IGNITE_KEY: 'old-ri-key', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', CRM_DRAIN_TOKEN: 'drain-test', LEAD_INTAKE_ALERTS: '0' });
  delete process.env.ROOF_IGNITE_INTAKE; delete process.env.PORTAL_AUTO_EMAIL;
  const LI = req(FN + '/lead-intake.js');
  try { req(FN + '/_lib/automations.js').gate = async () => null; } catch (e) {}
  try { const SG = req(FN + '/_lib/salesguard.js'); const d = SG.def; SG.def = () => ({ screenText: async () => null }); } catch (e) {}
  const CALLS = []; let PENDING = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o) => { const u = String(url); CALLS.push({ u, m: (o && o.method) || 'GET', b: o && o.body });
    if (/ri_pending_leads/.test(u) && (o && o.method) === 'DELETE') return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
    if (/ri_pending_leads\?select/.test(u)) return { ok: true, status: 200, json: async () => PENDING, text: async () => JSON.stringify(PENDING) };
    if (/gc_automation_pause/.test(u)) return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    return { ok: true, status: 201, json: async () => ([]), text: async () => '[]' }; };
  const post = (key, b) => LI.handler({ httpMethod: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, queryStringParameters: {}, body: JSON.stringify(b) });
  const lead = { name: 'Zedd Homeowner', phone: '9015550101', email: 'zedd.home@example.com', address: '1 Demo St, Memphis, TN', job_type: 'Roof replacement', notes: 'Demo only' };
  CALLS.length = 0;
  let r = await post('ri-key-test', lead), b = JSON.parse(r.body);
  ok('A1 a Roof Ignite post (LEAD_KEY_ROOF_IGNITE) → 200 "ignored", nothing stored', r.statusCode === 200 && b.ok === true && b.ignored === true && b.stored === false && b.receivedFrom === 'Roof Ignite', b);
  ok('A1 …and nothing at all happens: no store, no e-mail / approval, no alert (no outside call)', CALLS.filter(c => !/gc_automation_pause/.test(c.u)).length === 0, CALLS.map(c => c.m + ' ' + c.u));
  CALLS.length = 0; r = await post('old-ri-key', lead); b = JSON.parse(r.body);
  ok('A1 the old ROOFING_IGNITE_KEY → ignored the same way (200, so they do not retry)', r.statusCode === 200 && b.ignored === true && !CALLS.some(c => /ri_pending_leads/.test(c.u)), b);
  CALLS.length = 0; r = await post('cc-key-test', lead); b = JSON.parse(r.body);
  ok('A2 another lead company (Contractor Connection) is still taken: filed and its first e-mail queued', !b.ignored && b.receivedFrom === 'Contractor Connection' && CALLS.some(c => /ri_pending_leads/.test(c.u) && c.m === 'POST'), { b, c: CALLS.map(c => c.m + ' ' + c.u) });
  process.env.ROOF_IGNITE_INTAKE = '1'; CALLS.length = 0; r = await post('ri-key-test', lead); b = JSON.parse(r.body);
  ok('A3 kill switch ROOF_IGNITE_INTAKE=1 → Roof Ignite taken again', !b.ignored && b.receivedFrom === 'Roof Ignite' && CALLS.some(c => /ri_pending_leads/.test(c.u) && c.m === 'POST'), b);
  delete process.env.ROOF_IGNITE_INTAKE;
  PENDING = [{ id: 1, lead: { id: 'RIa', name: 'Zedd A', leadSource: 'Roof Ignite' } }, { id: 2, lead: { id: 'CCb', name: 'Demo B', leadSource: 'Contractor Connection' } }];
  CALLS.length = 0; r = await LI.handler({ httpMethod: 'GET', headers: { 'x-crm-token': 'drain-test' }, queryStringParameters: { drain: '1' } }); b = JSON.parse(r.body);
  ok('A4 the CRM collector never gets a Roof Ignite lead (it is still taken off the waiting table)', b.leads.length === 1 && b.leads[0].id === 'CCb' && CALLS.some(c => c.m === 'DELETE' && /in\.\(1,2\)/.test(c.u)), { b, c: CALLS.map(c => c.m + ' ' + c.u) });
  const ping = JSON.parse((await LI.handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { ping: '1' } })).body);
  ok('A5 ping still answers', ping.ok === true);
  globalThis.fetch = real;
  Object.keys(keep).forEach(k => { if (keep[k] == null) delete process.env[k]; else process.env[k] = keep[k]; });
  const auto = fs.readFileSync(FN + '/_lib/automations.js', 'utf8'), mk = fs.readFileSync(FN + '/_lib/mkcalc.js', 'utf8');
  ok('A6 the automations label and the lead-services list no longer name Roof Ignite', !/Roof Ignite/.test(auto) && !/LEAD_SERVICES = \[[^\]]*Roof Ignite/.test(mk));
}

/* ════ B + C. the CRM ════ */
const { computer, signIn, sleep, cset, cget, resetCloud } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 3 * 864e5).toISOString(), day = at.slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Pat Planner', email: 'pat@example.com', phone: '(901) 555-0142', role: 'Project Manager', active: true }]);
cset('projects', [
  { id: 'P1', name: 'Zedd Demo Clinic', client: 'Demo Health LLC', address: '100 Demo St', status: 'active', autoPO: 'T101', pm: 'Pat Planner', createdAt: at, updatedAt: at,
    subs: [{ name: 'Zedd Drywall LLC', trade: 'Drywall', status: 'Awarded', subId: 'S1' }, { name: 'Old Paint Co', trade: 'Paint', status: 'Bidding', subId: 'S3' }] },
  { id: 'P2', name: 'Zedd Ignite Roof', client: 'Zedd Homeowner', address: '1 Demo St', status: 'bidding', autoPO: 'T102', source: 'grayco', leadSource: 'Roof Ignite', riLeadId: 'RIx1', needsOwnerReview: true, createdAt: at, updatedAt: at },
  { id: 'P3', name: 'Demo Claim Roof', client: 'Demo Person', address: '2 Demo St', status: 'bidding', autoPO: 'T103', source: 'grayco', leadSource: 'Contractor Connection', riLeadId: 'CCx1', createdAt: at, updatedAt: at },
  { id: 'P4', name: 'Demo Website Job', client: 'Demo Other', address: '3 Demo St', status: 'active', autoPO: 'T104', leadSource: 'Website', notes: 'Customer said a Roof Ignite rep called them once', createdAt: at, updatedAt: at }]);
cset('vendors', [{ id: 'S1', name: 'Zedd Drywall LLC', email: 'zedd.drywall@example.com', trade: 'Drywall', isSub: true },
  { id: 'S2', name: 'Demo Electric', email: 'demo.electric@example.com', trade: 'Electrical', isSub: true },
  { id: 'S3', name: 'Old Paint Co', email: 'oldpaint@example.com', trade: 'Paint', isSub: true }]);
cset('leads', [{ id: 'L1', name: 'Zedd Ignite Lead', stage: 'New Lead', status: 'new', source: 'Roof Ignite', createdAt: at, updatedAt: at },
  { id: 'L2', name: 'Demo Website Lead', stage: 'New Lead', status: 'new', source: 'Website', createdAt: at, updatedAt: at }]);
cset('customers', [{ id: 'C1', name: 'Zedd Homeowner', source: 'Roof Ignite', createdAt: at, updatedAt: at }, { id: 'C2', name: 'Demo Health LLC', source: 'Referral', createdAt: at, updatedAt: at }]);
cset('customProducts', [{ id: 'CP1', name: 'Zedd test widget', cost: 25, unit: 'ea', cat: 'Electrical', v: 'V1', sku: '' }]);
const LINES = [{ id: 'l1', desc: 'Hang 1/2 in drywall', cat: 'Drywall', qty: 120, unit: 'sheets', uc: 14.5, type: 'material' },
  { id: 'l2', desc: 'Tape and finish level 4', cat: 'Drywall', qty: 1, cost: 4200, type: 'labor' },
  { id: 'l3', desc: 'Zedd test widget', cat: 'Electrical', qty: 3, unit: 'ea', type: 'material' }];
cset('estimates', [{ id: 'E1', name: 'Zedd Demo Clinic — base bid', gc: 'Demo Health LLC', estimator: 'Wesley Johnson', date: day, status: 'Draft', pid: 'P1', lines: LINES,
  totalCost: 6000, totalCharge: 8600, createdAt: at, firstSavedAt: at, savedAt: at, updatedAt: at, versions: [], versionNo: 1 }]);

const MAILS = [], PORTAL = []; let PAUSED = false;
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await A.ctx.route('**/.netlify/functions/send-email*', async rt => { const b = JSON.parse(rt.request().postData() || '{}'); MAILS.push(b);
  return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, paused: PAUSED, entry: { id: 'em' + MAILS.length } }) }); });
await A.ctx.route('**/.netlify/functions/portal-access*', async rt => { const b = JSON.parse(rt.request().postData() || '{}'); PORTAL.push(b);
  const J = o => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (b.action === 's-send') return J({ ok: true, id: 'M' + PORTAL.length });
  if (b.action === 's-scope-save') return J({ ok: true, id: 'SSC' + PORTAL.length, version: 1, status: b.submit ? 'waiting' : 'draft' });
  if (b.action === 's-scopes') return J({ ok: true, scopes: [] });
  if (b.action === 's-sync') return J({ ok: true, events: [], unread: {}, links: {}, waiting: [], bids: [], codes: [], admin: true, me: 'Wesley Johnson' });
  return J({ ok: true }); });
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
const ready = await wait(() => window._gcScopeSend && window._gcOpenScopeByTrade && (window._crm.projects || []).length >= 4 && (window._crm.subs || []).length >= 3, null, 60000);
ok('B0 the CRM is up (projects, subs, the scope tools)', !!ready);

/* the Price Book: the estimate builder's rate book on this computer gets a made-up item */
await A.ev(() => window.storage.get('gc_rates_v3', true).then(r => { let v = r && r.value; if (typeof v === 'string') v = JSON.parse(v); v = Array.isArray(v) ? v : []; v.push({ id: 'zr1', desc: 'Zedd test widget', cost: 25, unit: 'ea', cat: 'Electrical', type: 'material' }); return window.storage.set('gc_rates_v3', JSON.stringify(v), true); }));
/* B1 📐 Scope by trade → Save master to job → the pair */
await A.ev(() => { const e = (window._gcEST && window._gcEST.all ? window._gcEST.all() : window._gcEstimatesState || []).find(x => x.id === 'E1'); window._gcOpenScopeByTrade(e, 'P1'); });
await wait(() => document.querySelector('#_scSave'));
await A.ev(() => document.querySelector('#_scSave').click());
const pair = await wait(() => { const L = window._gcScopeSend.list('P1'); return L.length >= 2 ? L : null; }, null, 20000);
const sub = (pair || []).find(x => x.kind === 'sub'), bud = (pair || []).find(x => x.kind === 'budget');
ok('B1 "Save master to job" made the 📋 sub scope AND the 💲 budget scope, linked to each other, on the job', sub && bud && sub.pairId === bud.id && bud.pairId === sub.id && sub.pid === 'P1' && bud.pid === 'P1', pair);
ok('B1 the budget is internal, the sub scope is not', bud && bud.internal === true && sub && sub.internal === false);
ok('B1 same lines / sections on both (3 lines: Drywall ×2, Electrical)', sub && bud && sub.lines.length === 3 && JSON.stringify(sub.lines.map(l => [l.k, l.sec, l.desc])) === JSON.stringify(bud.lines.map(l => [l.k, l.sec, l.desc])), { s: sub && sub.lines, b: bud && bud.lines });
const bl = k => (bud.lines.find(l => /l\d/.test(l.k) && l.k.endsWith(k)) || {});
ok('B1 budget $ per line: the estimate\'s own cost (120 × 14.50 = 1,740; 4,200) and the Price Book × qty (3 × 25 = 75)', bl('l1').budget === 1740 && bl('l2').budget === 4200 && bl('l3').budget === 75 && bl('l3').bsrc === 'pricebook', bud.lines);
ok('B1 the sub scope carries no money at all (no budget field, no $, no cost numbers)', sub.lines.every(l => !('budget' in l) && !('srcCost' in l)) && !/\$|1,?740|4,?200|14\.5/.test(JSON.stringify(sub)), sub);
const sentSafe = await A.ev(id => { const h = window._gcScopeSend.html(window._gcScopeSend.all().find(x => x.id === id)); return h; }, sub.id);
ok('B1 the printable / e-mailed page of the sub scope has the work and quantities, no prices', /Hang 1\/2 in drywall/.test(sentSafe) && /120 sheets/.test(sentSafe) && !/\$|1,?740|4,?200/.test(sentSafe));
const budThrow = await A.ev(id => { try { window._gcScopeSend.html(window._gcScopeSend.all().find(x => x.id === id)); return 'no'; } catch (e) { return 'threw'; } }, bud.id);
ok('B1 the budget scope cannot be turned into a page for a sub (throws)', budThrow === 'threw');
/* a text scope with a line nothing matches → a blank $ box */
const tx = await A.ev(() => window._gcScopeSend.make({ pid: 'P1', title: 'Demo text scope', text: 'PAINT:\n• Prime and paint the lobby walls\n• Zedd test widget', src: { kind: 'jobscope' } }).then(r => ({ s: r.sub.lines, b: r.budget.lines })));
ok('B2 a text scope: the budget fills what it can (Price Book) and leaves a blank $ box for the rest', tx.b.length === 2 && tx.b[0].budget === '' && tx.b[1].budget === 25 && tx.s[0].sec === 'PAINT', tx);

/* B3 ✏️ edit the sub scope → the budget follows, keeps its $ */
await A.ev(() => window._gcScopeSend.open('P1'));
await wait(() => document.querySelector('#gcss-job [data-ssd]'));
await shot(A, '01_job_scopes');
await A.ev(id => document.querySelector('#gcss-job [data-ssd="' + id + '"] [data-ss=edit]').click(), sub.id);
await wait(() => document.querySelector('#gcss-edit .gcss-lines'));
await A.ev(() => { const r = document.querySelectorAll('#gcss-edit .gcss-lines .gcss-ln'); r[1].querySelector('[data-f=desc]').value = 'Tape, mud and finish level 4 (Zedd)'; document.querySelector('#gcss-edit [data-e=add]').click(); });
await A.ev(() => { const r = document.querySelectorAll('#gcss-edit .gcss-lines .gcss-ln'); const last = r[r.length - 1]; last.querySelector('[data-f=desc]').value = 'Demo corner bead $300'; last.querySelector('[data-f=qty]').value = '40'; last.querySelector('[data-f=unit]').value = 'LF'; document.querySelector('#gcss-edit [data-e=save]').click(); });
const ed = await wait(id => { const S = window._gcScopeSend, s = S.all().find(x => x.id === id); return s && s.version === 2 ? { s, b: S.pairOf(id) } : null; }, sub.id);
ok('B3 Save → the sub scope is v2, 4 lines, edited by hand; the typed "$300" was taken out', ed && ed.s.lines.length === 4 && ed.s.edited === true && /Tape, mud and finish/.test(ed.s.lines[1].desc) && !/\$|300/.test(ed.s.lines[3].desc), ed && ed.s.lines);
ok('B3 the 💲 budget followed: same 4 lines, the renamed line keeps its 4,200, the new line has an empty $ box', ed && ed.b.lines.length === 4 && ed.b.lines[1].budget === 4200 && /Tape, mud/.test(ed.b.lines[1].desc) && ed.b.lines[3].budget === '' && ed.b.lines[3].qty === 40, ed && ed.b.lines);
/* the budget side */
await A.ev(() => document.querySelector('#gcss-edit [data-e=other]').click());
await wait(() => document.querySelector('#gcss-edit [data-f=budget]'));
const bwarn = await A.ev(() => document.querySelector('#gcss-edit').innerText);
ok('B4 the budget editor says "budget — internal" and never sent to subs; it flags the line with no $', /budget — internal/.test(bwarn) && /Never sent to subs/.test(bwarn) && /1 line has no budget yet/.test(bwarn), bwarn.slice(0, 400));
await shot(A, '02_budget_editor');
await A.ev(() => { const r = document.querySelectorAll('#gcss-edit .gcss-lines .gcss-ln'); r[3].querySelector('[data-f=budget]').value = '360'; document.querySelector('#gcss-edit [data-e=save]').click(); });
const ed2 = await wait(id => { const S = window._gcScopeSend, s = S.all().find(x => x.id === id), b = S.pairOf(id); return b && b.lines[3] && b.lines[3].budget === 360 ? { s, b } : null; }, sub.id);
ok('B4 a $ typed on the budget stays on the budget only; the sub scope still has no money and stays v2', ed2 && ed2.s.version === 2 && !/360/.test(JSON.stringify(ed2.s.lines)) && ed2.s.lines.length === 4, ed2);
await A.ev(() => { const x = document.querySelector('#gcss-edit [data-x]'); if (x) x.click(); });

/* B5 ↻ regenerate after hand edits → it asks first */
A.dialogs.length = 0; A.acceptConfirm = false;
await A.ev(id => window._gcScopeSend.regen(id), sub.id); await sleep(800);
const rg = await A.ev(id => window._gcScopeSend.all().find(x => x.id === id), sub.id);
ok('B5 ↻ Regenerate on an edited scope asks first ("edited by hand"); Cancel keeps the edits (and adds only new lines)', A.dialogs.some(d => /edited by hand/.test(d)) && rg.lines.length === 4 && /Tape, mud/.test(rg.lines[1].desc), { d: A.dialogs, l: rg.lines.map(l => l.desc) });
A.acceptConfirm = true;

/* B6 📤 send: who — the job's subs first */
await A.ev(() => window._gcScopeSend.open('P1')); await wait(() => document.querySelector('#gcss-job [data-ssd]'));
await A.ev(id => document.querySelector('#gcss-job [data-ssd="' + id + '"] [data-ss=send]').click(), sub.id);
await wait(() => document.querySelector('#gcss-send [data-pick]'));
const who = await A.ev(() => [...document.querySelectorAll('#gcss-send [data-pick]')].map(x => x.closest('.gcss-sub').innerText.replace(/\s+/g, ' ')));
ok('B6 the job\'s subs come first — the awarded one on top (Zedd Drywall · On the job · Awarded), then the bidding one', who.length === 2 && /Zedd Drywall LLC/.test(who[0]) && /Awarded/.test(who[0]) && /Old Paint Co/.test(who[1]), who);
await A.ev(() => { const q = document.querySelector('#gcss-send [data-s=q]'); q.value = 'demo elec'; q.dispatchEvent(new Event('input', { bubbles: true })); });
const found = await wait(() => { const r = [...document.querySelectorAll('#gcss-send [data-s=res] [data-pick]')]; return r.length ? r.map(x => x.getAttribute('data-pick')) : null; });
ok('B6 🔎 search all subs finds Demo Electric (not on the job)', JSON.stringify(found) === '["i:S2"]', found);
await shot(A, '03_send_sheet');
/* ✉️ e-mail to the awarded job sub */
await A.ev(() => { const c = document.querySelector('#gcss-send [data-pick="i:S1"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#gcss-send [data-s=pdf]').checked = false; document.querySelector('#gcss-send [data-s=go]').click(); });
await wait(() => document.querySelector('#gcss-send [data-sent]'));
const m1 = MAILS[0] || {};
ok('B7 ✉️ one e-mail, through send-email.js (mode personal — the CRM\'s own send path), to the picked sub only, logged on the job', MAILS.length === 1 && m1.mode === 'personal' && m1.to === 'zedd.drywall@example.com' && m1.pid === 'P1' && m1.about === 'scope', MAILS);
ok('B7 the e-mail has the sub scope (v2 lines) and never a budget number', /Tape, mud and finish level 4/.test(m1.html) && /Demo corner bead/.test(m1.html) && !/1,?740|4,?200|\b360\b|\$/.test(m1.html), (m1.html || '').replace(/<[^>]+>/g, ' ').slice(0, 600));
let rec = await wait(id => { const s = window._gcScopeSend.all().find(x => x.id === id); return s && (s.sends || []).length ? s.sends : null; }, sub.id);
ok('B7 the send is written on the scope: who, when, which version, how, sent', rec && rec.length === 1 && rec[0].subId === 'S1' && rec[0].version === 2 && rec[0].via === 'email' && rec[0].status === 'sent' && rec[0].by === 'Wesley Johnson' && !!rec[0].at, rec);
/* ⏸ data-entry mode: the server holds it — shown as held */
PAUSED = true;
await A.ev(() => document.querySelector('#gcss-send [data-s=go]').click());
rec = await wait(id => { const s = window._gcScopeSend.all().find(x => x.id === id); return s && s.sends.length === 2 ? s.sends : null; }, sub.id);
ok('B8 while ⏸ data-entry mode is on the server holds it, and the scope says "held"', rec && /held/.test(rec[1].status), rec);
PAUSED = false;
await A.ev(() => { const x = document.querySelector('#gcss-send [data-x]'); if (x) x.click(); });
/* 🔨 sub portal to a sub NOT on the job */
PORTAL.length = 0; A.dialogs.length = 0;
await A.ev(id => window._gcScopeSend.send(id), sub.id); await wait(() => document.querySelector('#gcss-send [data-s=q]'));
await A.ev(() => { const q = document.querySelector('#gcss-send [data-s=q]'); q.value = 'Demo Electric'; q.dispatchEvent(new Event('input', { bubbles: true })); });
await wait(() => document.querySelector('#gcss-send [data-pick="i:S2"]'));
await A.ev(() => { const c = document.querySelector('#gcss-send [data-pick="i:S2"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#gcss-send [data-s=email]').checked = false; document.querySelector('#gcss-send [data-s=portal]').checked = true; document.querySelector('#gcss-send [data-s=pdf]').checked = false; document.querySelector('#gcss-send [data-s=go]').click(); });
await wait(() => document.querySelector('#gcss-send [data-sent]'), null, 20000);
const sendCalls = PORTAL.filter(x => x.action === 's-send');
ok('B9 🔨 a sub not on the job → asked first, then added to the job as Bidding', A.dialogs.some(d => /not on this job yet/.test(d)) && await A.ev(() => (window._crm.projects.find(p => p.id === 'P1').subs || []).some(r => r.subId === 'S2' && r.status === 'Bidding')), A.dialogs);
ok('B9 …and the scope is posted to THAT sub\'s job thread only (s-send, party s:S2, job P1), no budget numbers', sendCalls.length === 1 && sendCalls[0].party === 's:S2' && sendCalls[0].projectId === 'P1' && /Tape, mud and finish/.test(sendCalls[0].text) && !/1,?740|4,?200|\b360\b|\$/.test(sendCalls[0].text) && !MAILS.slice(2).length, sendCalls);
/* 🔨 with the sub's total → a sub agreement to sign, waiting for the PM */
PORTAL.length = 0;
await A.ev(() => { document.querySelector('#gcss-send [data-s=total]').value = '5000'; document.querySelector('#gcss-send [data-s=go]').click(); });
const ag = await wait(() => null, null, 100) || await (async () => { for (let i = 0; i < 40; i++) { if (PORTAL.some(x => x.action === 's-scope-save')) break; await sleep(250); } return PORTAL.find(x => x.action === 's-scope-save'); })();
ok('B10 with the sub\'s total → s-scope-save submit (waits for the PM\'s approval): the lines, ONE total, no line prices', ag && ag.submit === true && ag.scope.subId === 'S2' && ag.scope.projectId === 'P1' && ag.scope.total === 5000 && ag.scope.lines.length === 4 && ag.scope.lines.every(l => !('budget' in l) && !('price' in l)) && !/1,?740|4,?200|\b360\b/.test(JSON.stringify(ag.scope)), ag);
rec = await wait(id => { const s = window._gcScopeSend.all().find(x => x.id === id); return s && s.sends.length >= 4 ? s.sends : null; }, sub.id);
ok('B10 both portal sends written on the scope (portal / portal-agreement "waiting for the PM\'s approval")', rec && rec[2].via === 'portal' && rec[2].ok && rec[3].via === 'portal-agreement' && /waiting for the PM/.test(rec[3].status), rec && rec.slice(2));
await A.ev(() => { const x = document.querySelector('#gcss-send [data-x]'); if (x) x.click(); });
/* the budget can never be sent */
const nb = await A.ev(id => { const S = window._gcScopeSend; return S.deliver(S.all().find(x => x.id === id), [{ id: 'S1', name: 'Zedd', email: 'zedd.drywall@example.com' }], { email: true }, 'x', 'y').then(() => 'sent', e => 'refused: ' + e.message); }, bud.id);
const nMail = MAILS.length;
ok('B11 the 💲 budget can never be sent (refused) — and nothing went out', /^refused/.test(nb) && MAILS.length === nMail, nb);
await A.ev(id => window._gcScopeSend.send(id), bud.id); await sleep(500);
const redirected = await A.ev(() => (document.querySelector('#gcss-send .gcss-hd b') || {}).textContent || '');
ok('B11 📤 on the budget opens its 📋 sub scope instead', /Send "Scope of work/.test(redirected) && !/Budget/.test(redirected), redirected);
await A.ev(() => { const x = document.querySelector('#gcss-send [data-x]'); if (x) x.click(); });
/* history in the job sheet */
await A.ev(() => window._gcScopeSend.open('P1')); await wait(() => document.querySelector('#gcss-job [data-ss-hist]'));
const hist = await A.ev(() => document.querySelector('#gcss-job [data-ss-hist]').textContent);
ok('B12 🕘 Sent on the job: each send with the sub, how, the version', /Zedd Drywall LLC/.test(hist) && /Demo Electric/.test(hist) && /v2/.test(hist) && /e-mail/.test(hist) && /sub portal/.test(hist), hist.slice(0, 500));
await A.ev(() => { const d = document.querySelector('#gcss-job details'); if (d) d.open = true; }); await shot(A, '04_sent_history');
await A.ev(() => { const x = document.querySelector('#gcss-job [data-x]'); if (x) x.click(); });
/* entry points */
await A.ev(() => window._gcSubHub && window._gcSubHub.open('P1'));
const hubBtn = await wait(() => document.querySelector('#gcsub-hub .gcss-hubrow [data-gcss-hub]'));
ok('B13 👷 Subs & portal on the job has "📋 Scopes & 💲 budgets — edit · 📤 send to a sub"', !!hubBtn);
await A.ev(() => { document.querySelector('#gcsub-hub [data-gcss-hub]').click(); });
ok('B13 …which opens the job\'s scopes', !!await wait(() => document.querySelector('#gcss-job [data-ssd]')));
await A.ev(() => { const x = document.querySelector('#gcss-job [data-x]'); if (x) x.click(); const h = document.getElementById('gcsub-hub'); if (h) h.remove(); });
await A.ev(() => window._setView('scopes'));
const tabBtn = await wait(() => { const b = document.querySelector('.gcss-tabbtn[data-gcss-pid="P1"]'); return b ? b.textContent : null; });
ok('B14 📋 Scopes tab: the job\'s card has the "📋 Sub scopes + 💲 budgets" button', /Sub scopes \+ 💲 budgets \(2\)/.test(tabBtn || ''), tabBtn);
/* the Scopes tab text: EDIT → Save makes / updates its pair */
const beforeN = await A.ev(() => window._gcScopeSend.list('P4').length);
await A.ev(() => { document.body.click(); const P = window._crm.projects.map(p => p.id === 'P4' ? Object.assign({}, p, { scope: 'DRYWALL:\n• Patch demo wall\n• Paint demo wall', updatedAt: new Date().toISOString() }) : p); window._setProjects(P); window._crm.projects = P; });
const viaTab = await wait(() => { const L = window._gcScopeSend.list('P4'); return L.length === 2 ? L : null; }, null, 15000);
ok('B15 a job\'s scope text saved on the 📋 Scopes tab → its 📋 sub scope + 💲 budget are made too', beforeN === 0 && viaTab && viaTab.some(x => x.kind === 'budget' && x.internal) && viaTab.find(x => x.kind === 'sub').lines.length === 2, viaTab);

/* ════ C. 🗑 Roof Ignite records ════ */
const f = await A.ev(() => window._gcRoofIgniteClean.find().then(f => ({ p: f.projects.map(x => x.id), l: f.leads.map(x => x.id), c: f.customers.map(x => x.id) })));
ok('C1 the list has ONLY the Roof Ignite job / lead / customer (not the Contractor Connection job, not a note that mentions it)', JSON.stringify(f) === JSON.stringify({ p: ['P2'], l: ['L1'], c: ['C1'] }), f);
await A.ev(() => window._gcAdm && window._gcAdm.open('roofignite'));
let delBtn = await wait(() => { const b = document.querySelector('[data-ri-del]'); return b ? b.textContent : null; }, null, 15000);
if (!delBtn) { await A.ev(() => { const d = document.createElement('div'); d.id = 'ri-test-box'; document.body.appendChild(d); window._gcRoofIgniteClean.render(d); }); delBtn = await wait(() => { const b = document.querySelector('[data-ri-del]'); return b ? b.textContent : null; }); }
ok('C2 ⚙ Admin → 🗑 Roof Ignite records: "🗑 Delete all Roof Ignite records (3)"', /Delete all Roof Ignite records \(3\)/.test(delBtn || ''), delBtn);
await A.ev(() => { const b = document.querySelector('[data-ri-del]'); b.scrollIntoView({ block: 'center' }); }); await shot(A, '05_roofignite_admin');
A.dialogs.length = 0;
await A.ev(() => document.querySelector('[data-ri-del]').click());
const gone = await wait(() => { const P = (window._crm.projects || []).map(p => p.id); return !P.includes('P2') ? P : null; }, null, 20000);
await sleep(1500);
const st = await A.ev(() => ({ P: (window._crm.projects || []).map(p => p.id), L: (window.__gcLeadsLive || window._crm.leads || []).map(l => l.id), C: (window._graycoCustomers || []).map(c => c.id),
  deadP: !!(window._gcxDead && window._gcxDead('projects', 'P2')), trash: (window._gcLDEL && window._gcLDEL.trash ? (window._gcLDEL.trash() || []) : []).map(x => x.id || (x.rec && x.rec.id)) }));
ok('C3 one confirm listing what goes', A.dialogs.some(d => /Delete 3 Roof Ignite record/.test(d) && /Job: Zedd Ignite Roof/.test(d) && /Lead: Zedd Ignite Lead/.test(d)), A.dialogs);
ok('C3 the Roof Ignite job is deleted through the job delete (on the delete list); P1 / P3 / P4 stay', gone && !st.P.includes('P2') && ['P1', 'P3', 'P4'].every(x => st.P.includes(x)) && st.deadP, st);
ok('C3 the Roof Ignite lead is deleted the leads\' way (🗑 Recently deleted); the other lead stays', !st.L.includes('L1') && st.L.includes('L2') && JSON.stringify(st.trash).indexOf('L1') > -1, st);
ok('C3 the Roof Ignite customer is gone, the other customer stays', !st.C.includes('C1') && st.C.includes('C2'), st.C);
const cloudP = (cget('projects') || []).map(p => p.id);
ok('C3 the cloud copy of the jobs no longer has it (the normal save path)', !cloudP.includes('P2') && cloudP.includes('P3'), cloudP);
const after = await A.ev(() => window._gcRoofIgniteClean.find().then(f => f.projects.length + f.leads.length + f.customers.length));
ok('C4 nothing Roof Ignite left', after === 0, after);

const bad = errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e));
ok('no page errors', !bad.length, bad);
await A.b.close();
const passed = R.filter(Boolean).length;
console.log('\n' + passed + '/' + R.length + ' passed');
process.exit(passed === R.length ? 0 : 1);
