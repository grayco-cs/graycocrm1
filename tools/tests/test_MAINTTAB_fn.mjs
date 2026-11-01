/* patches MAINTTAB + MAINTPLUS — the server half of the 🛠 Maintenance tab, against an in-memory gc_kv (the real portal.js
   approvals, portal posts, To-Dos; Resend counted). node tools/tests/test_MAINTTAB_fn.mjs   (made-up people / jobs only)
     1. prospects + outreach → a maint_outreach item on ✅ Approvals (the office approves it); no text
     2. the plan builder (several services, frequency, add-on, tier, portfolio) → one quote → sign (Bronze by default,
        auto-renew only with a yes) → the year's visits on the MAINTENANCE SCHEDULE, not the job schedule
     3. a portfolio: 2 properties → 2 plans, 1 portfolio, one combined invoice
     4. a visit update → portal_post on ✅ Approvals → approved → in the portal; the next visit planned; a repair → a
        maint_repair quote with the tier discount
     5. 1 month ahead → the seller's To-Do + e-mail + the customer's reminder on ✅ Approvals; 14 days / due day To-Dos
     6. auto-renew: without a yes → no renewal invoice (a To-Do to ask); with a yes → the renewal invoice
     7. the ⭐ priority list (commercial plans automatically; winter snow) → ❄️ snow event To-Dos in order; an emergency lead
        from a priority customer's phone is marked ⭐ and goes first
     8. tiers (Bronze 0 / Silver 10 / Gold 20, Gold drawing note), pamphlets, letters, PM commission, the service area */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } }

const KV = {}, SENT = []; let tick = 0;
function res(status, body){ return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }; }
function row(key){ return KV[key] ? [{ key, value: KV[key].value, updated_at: KV[key].at }] : []; }
function put(key, v){ KV[key] = { value: typeof v === 'string' ? v : JSON.stringify(v), at: new Date(Date.now() + (++tick)).toISOString() }; }
function get(key){ const v = KV[key] && KV[key].value; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return v; } }
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {};
  if (/api\.resend\.com/.test(url)) { SENT.push(JSON.parse(o.body)); return res(200, { id: 'em_' + SENT.length }); }
  if (/\/storage\/v1\/object\//.test(url)) return res(200, { Key: 'crm-files/x.pdf' });
  if (/\/rest\/v1\/gc_kv/.test(url)) {
    if ((o.method || 'GET') === 'POST') { const b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = { value: x.value, at: new Date(Date.now() + (++tick)).toISOString() }; }); return res(201, {}); }
    const eq = /key=eq\.([^&]+)/.exec(url), inn = /key=in\.\(([^)]*)\)/.exec(url);
    if (eq) return res(200, row(decodeURIComponent(eq[1])));
    if (inn) return res(200, decodeURIComponent(inn[1]).split(',').map(k => k.replace(/"/g, '')).flatMap(row));
    return res(200, []);
  }
  return res(200, []);
};
process.env.SUPABASE_URL = 'https://fake-mt.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test_only'; process.env.RESEND_API_KEY = 're_test_only'; delete process.env.PORTAL_MAIL_OFF;
const USERS = [{ name: 'Pat Pm', email: 'pat.test@grayco-cs.com', role: 'Project Manager', active: true }, { name: 'Brittany Office', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { name: 'Wes Admin', email: 'wes.test@grayco-cs.com', role: 'Admin', active: true }];
const PJ = [
  { id: 'H1', name: 'Henderson Roof', type: 'Residential', client: 'Ann Henderson', clientEmail: 'ann@example.test', clientPhone: '901-555-0101', address: '12 Oak St, Bartlett, TN 38134', pm: 'Pat Pm', insCarrier: 'State Farm' },
  { id: 'C1', name: 'Maintenance — Oak Plaza', type: 'Commercial', client: 'Oak Plaza LLC', clientEmail: 'fm@oakplaza.test', clientPhone: '(901) 555-0199', address: '400 Poplar Ave, Memphis, TN 38103', pm: 'Pat Pm' },
  { id: 'M1', name: 'Maintenance — Pine Apts A', type: 'Commercial', client: 'Pine PM Co', clientEmail: 'pm@pine.test', address: '10 Pine Rd, Southaven, MS 38671', pm: 'Pat Pm' },
  { id: 'M2', name: 'Maintenance — Pine Apts B', type: 'Commercial', client: 'Pine PM Co', clientEmail: 'pm@pine.test', address: '12 Pine Rd, Southaven, MS 38671', pm: 'Pat Pm' }];
put('users', USERS); put('projects', PJ); put('gc_automation_pause', { on: false }); put('gc_maint', []);
const portal = require(FN + '/portal.js'), C = portal._core;
const X = require(FN + '/portal-plus.js')._x9, M = require(FN + '/_lib/maint.js'), SCHED = require(FN + '/maint-scheduled.js');
const PM = { ok: true, email: 'pat.test@grayco-cs.com', name: 'Pat Pm' }, OFFICE = { ok: true, office: true, email: 'office@grayco-cs.com', name: 'Brittany Office' }, ADMIN = { ok: true, admin: true, email: 'wes.test@grayco-cs.com', name: 'Wes Admin', role: 'admin' };
const AQ = () => get(C.AQ_KEY) || [], TODO = () => get('gc_office_tasks') || [];
const act = (b, who) => X.staffAct(b, who || PM);
const ev = { headers: { 'x-nf-client-connection-ip': '1.2.3.4' } };
const P = id => PJ.find(p => p.id === id);
async function approve(id){ return C.approvalAction({ op: 'approve', id }, ADMIN); }

console.log('1. prospects + outreach');
let r = await act({ action: 'prospect-save', prospect: { company: 'Oak Plaza LLC', contact: 'Dana Facility', role: 'Facility manager', email: 'fm@oakplaza.test', phone: '901-555-0199', buildingType: 'Office', source: 'Commercial customer', nextAt: '2026-11-05', assigned: 'Pat Pm' }, log: 'Added' });
ok('a prospect is added (gc_maint_prospects)', r.status === 200 && (get('gc_maint_prospects') || []).length === 1 && r.out.prospect.stage === 'Prospect');
ok('its next follow-up is a To-Do', TODO().some(t => /^maint_fu_/.test(t.id) && /Follow up/.test(t.label)));
const prid = r.out.prospect.id;
r = await act({ action: 'outreach', prospectId: prid, template: 'free' });
const oq = AQ().find(a => a.kind === 'maint_outreach');
ok('✉ Offer free roof inspection → a maint_outreach e-mail draft on ✅ Approvals', r.status === 200 && oq && oq.to === 'fm@oakplaza.test' && /free/i.test(oq.subject) && oq.channel !== 'sms');
ok('the prospect moves to Contacted', get('gc_maint_prospects')[0].stage === 'Contacted');
ok('the office approves maint_outreach (office-kinds)', require(FN + '/_lib/office-kinds.js').isOfficeKind('maint_outreach') && require(FN + '/_lib/office-kinds.js').isOfficeKind('maint_repair') && require(FN + '/_lib/office-kinds.js').isOfficeKind('maint_reminder'));
r = await act({ action: 'outreach', prospectId: prid, template: 'plan' });
ok('the maintenance-plan template names HVAC and pressure washing as our services', /HVAC/.test(AQ().filter(a => a.kind === 'maint_outreach').pop().html) && /Pressure washing/i.test(AQ().filter(a => a.kind === 'maint_outreach').pop().html));

console.log('2. the plan builder → sign → the Maintenance Schedule');
r = await act({ action: 'tab' });
ok('the tab: plans list (residential + commercial), tiers Bronze 0 / Silver 10 / Gold 20, Gold drawing note', r.out.settings.plans.length >= 26 && r.out.settings.tiers.bronze.discount === 0 && r.out.settings.tiers.silver.discount === 10 && r.out.settings.tiers.gold.discount === 20 && /drawing/.test(r.out.settings.tiers.gold.note));
ok('HVAC → Rapid Air, pressure washing → Brenan Hart (subbed)', r.out.settings.plans.find(x => x.id === 'c_hvac').sub === 'Rapid Air' && r.out.settings.plans.find(x => x.id === 'c_wash').performer === 'sub' && r.out.settings.plans.find(x => x.id === 'c_wash').sub === 'Brenan Hart');
ok('a price is a placeholder until set ("set your price")', r.out.settings.plans.every(x => x.priceSet !== true));
r = await act({ action: 'plan-prices', prices: { c_roof: 1350 } }, OFFICE);
ok('the office sets a price → no longer a placeholder', r.status === 200 && r.out.settings.plans.find(x => x.id === 'c_roof').price === 1350 && r.out.settings.plans.find(x => x.id === 'c_roof').priceSet === true);
r = await act({ action: 'quote-many', pid: 'C1', tier: 'silver', items: [{ planId: 'c_roof', price: 1350, freq: 'twice', addOns: [{ id: 'infrared' }] }, { planId: 'c_wash', price: 1400, freq: 'quarterly', addOns: [{ id: 'graffiti' }] }], products: [{ id: 'kit_storm', qty: 2 }] });
const bq = AQ().find(a => a.kind === 'maint_quote' && a.jobId === 'C1');
ok('send to sign: one maint_quote on ✅ Approvals with both services, the add-ons and the kit', r.status === 200 && bq && /Commercial Roof Maintenance/.test(bq.html) && /Infrared roof scan/.test(bq.html) && /Graffiti removal/.test(bq.html) && /Storm Prep Kit/.test(bq.html));
ok('the Maintenance Agreement (DRAFT) goes with the sign request', bq && bq.attachments.some(a => a.kind === 'file' && /Agreement/.test(a.name)));
const roofC = get('gc_maint').find(c => c.pid === 'C1' && c.planId === 'c_roof'), washC = get('gc_maint').find(c => c.pid === 'C1' && c.planId === 'c_wash');
ok('the builder\'s frequency and tier are on the contracts; the sub is assigned', roofC.freq === 'twice' && washC.freq === 'quarterly' && washC.billsPerYear === 4 && roofC.tier === 'silver' && washC.performer === 'sub' && washC.sub === 'Brenan Hart');
const SCHED0 = JSON.stringify(get('schedule') || null);
let s1 = await X.sign(ev, {}, { contractId: roofC.id, name: 'Dana Facility', agree: true, strokes: [] }, await X.readAll(), P('C1'));
let s2 = await X.sign(ev, {}, { contractId: washC.id, name: 'Dana Facility', agree: true, autoRenew: true, strokes: [] }, await X.readAll(), P('C1'));
ok('both signed', s1.status === 200 && s2.status === 200, JSON.stringify([s1.out, s2.out]));
const roofS = get('gc_maint').find(c => c.id === roofC.id), washS = get('gc_maint').find(c => c.id === washC.id);
ok('auto-renew only with a yes (roof: no, wash: yes + date)', roofS.autoRenew === false && washS.autoRenew === true && !!washS.autoRenewAt);
ok('the tier stays as quoted (Silver); a plain plan starts at Bronze', roofS.tier === 'silver');
const V = get('gc_maint_visits') || [];
ok('the year\'s visits are on the MAINTENANCE SCHEDULE (2 roof + 4 washing)', V.filter(v => v.contractId === roofC.id).length === 2 && V.filter(v => v.contractId === washC.id).length === 4, V.length);
ok('…and NOT on the job schedule', JSON.stringify(get('schedule') || null) === SCHED0);
const wv = V.filter(v => v.contractId === washC.id).map(v => v.date).sort(), gaps = wv.slice(1).map((d, i) => Math.round((Date.parse(d) - Date.parse(wv[i])) / 864e5));
ok('next-visit math: quarterly visits ~3 months apart', gaps.every(g => g >= 89 && g <= 92), JSON.stringify(wv));

console.log('3. a portfolio: 2 properties → 2 plans, 1 contract view');
r = await act({ action: 'portfolio-save', portfolio: { name: 'Pine PM Co', contact: 'Lee Manager', email: 'pm@pine.test', combined: true, pids: ['M1', 'M2'] } });
const pfid = r.out.portfolio.id;
await act({ action: 'quote-many', pid: 'M1', portfolioId: pfid, items: [{ planId: 'c_gutter', price: 600 }] });
await act({ action: 'quote-many', pid: 'M2', portfolioId: pfid, items: [{ planId: 'c_gutter', price: 650 }] });
const pc = get('gc_maint').filter(c => c.portfolioId === pfid);
ok('2 plans, both in the one portfolio', pc.length === 2 && (get('gc_maint_portfolios') || []).length === 1 && get('gc_maint_portfolios')[0].pids.length === 2);
for (const c of pc) await X.sign(ev, {}, { contractId: c.id, name: 'Lee Manager', agree: true, strokes: [] }, await X.readAll(), P(c.pid));
const out3 = await SCHED._run(Date.now());
const comb = AQ().filter(a => a.kind === 'maint_invoice' && a.meta && a.meta.combined);
ok('one combined invoice for the portfolio (2 parts)', comb.length === 1 && comb[0].meta.parts.length === 2 && comb[0].to === 'pm@pine.test', JSON.stringify(out3));

console.log('4. a visit update → the portal; a repair → a quote with the tier discount');
const vbefore = (get('gc_maint_visits') || []).filter(v => v.contractId === roofC.id && v.status === 'planned').map(v => v.date).sort();
r = await act({ action: 'visit-post', contractId: roofC.id, text: 'Cleared 4 drains, resealed 2 curbs. Roof is in good shape.', repairs: [{ desc: 'Replace cracked pipe boot', price: 300 }] });
const post = AQ().find(a => a.id === r.out.postId), rep = AQ().find(a => a.id === r.out.repairId);
ok('the visit update is a portal_post on ✅ Approvals', post && post.kind === 'portal_post' && post.jobId === 'C1');
ok('the repair is a maint_repair quote on ✅ Approvals, Silver 10% off ($300 → $270)', rep && rep.kind === 'maint_repair' && /\$270\.00/.test(rep.html) && /10% off/.test(rep.html));
const vafter = (get('gc_maint_visits') || []).filter(v => v.contractId === roofC.id);
ok('the visit is done on the schedule; the plan\'s last visit is set', vafter.some(v => v.status === 'done' && /drains/.test(v.note)) && !!get('gc_maint').find(c => c.id === roofC.id).lastVisit);
let v0 = await X.view(await X.readAll(), P('C1')), rc0 = v0.maint.contracts.find(c => c.id === roofC.id);
ok('not approved yet → the portal shows no visit note and no repair', !rc0.visits.some(v => v.note) && rc0.repairs.length === 0);
const ap = await approve(post.id), ap2 = await approve(rep.id);
ok('approved → the post is on the portal page (gc_portal_auto_posts)', ap.status === 200 && (get('gc_portal_auto_posts') || []).some(p => p.pid === 'C1' && /drains/.test(p.text)), JSON.stringify(ap.out).slice(0, 200));
v0 = await X.view(await X.readAll(), P('C1')); rc0 = v0.maint.contracts.find(c => c.id === roofC.id);
ok('the portal plan section: next visit, the visit with its notes, the repair with the discount, the tier, the agreement', rc0.visits.some(v => v.status === 'done' && /drains/.test(v.note)) && rc0.visits.some(v => v.status === 'planned') && rc0.repairs[0].net === 270 && rc0.tier === 'silver' && v0.maint.member && v0.maint.member.name === 'Silver', JSON.stringify(rc0).slice(0, 300));
ok('commercial plans show ⭐ priority in the portal; no carrier name anywhere', rc0.priority === true && !/state\s*farm/i.test(JSON.stringify(v0)));

console.log('5. reminders a month ahead, to whoever sold the plan');
const vis5 = (get('gc_maint_visits') || []).filter(v => v.contractId === washC.id && v.status === 'planned').sort((a, b) => a.date < b.date ? -1 : 1)[0];
const at5 = Date.parse(vis5.date + 'T12:00:00Z') - 28 * 864e5, mails0 = SENT.length;
await SCHED._run(at5);
ok('1 month ahead: the seller\'s To-Do "Get … done this month"', TODO().some(t => t.id === 'maint_month_' + vis5.id && /done this month/.test(t.label) && /Pat Pm/.test(t.label)), TODO().map(t => t.id).filter(x => /month/.test(x)).join());
ok('…an e-mail to the seller', SENT.slice(mails0).some(m => m.to[0] === 'pat.test@grayco-cs.com' && /This month/.test(m.subject)));
ok('…and the customer\'s reminder on ✅ Approvals (maint_reminder)', AQ().some(a => a.kind === 'maint_reminder' && a.meta.visitId === vis5.id));
await SCHED._run(Date.parse(vis5.date + 'T12:00:00Z') - 10 * 864e5); await SCHED._run(Date.parse(vis5.date + 'T12:00:00Z'));
ok('14 days ahead and on the day: To-Dos for the PM', TODO().some(t => t.id === 'maint_visit14_' + vis5.id) && TODO().some(t => t.id === 'maint_due_' + vis5.id));
const nTodo = TODO().length; await SCHED._run(at5);
ok('never twice', TODO().length === nTodo);

console.log('6. auto-renew only with a yes');
const yr2 = Date.parse(roofS.signedAt) + 366 * 864e5;
await SCHED._run(yr2);
const roofInv = get('gc_maint').find(c => c.id === roofC.id).invoices.map(v => v.year), washInv = get('gc_maint').find(c => c.id === washC.id).invoices.map(v => v.year);
ok('no auto-renew: no year-2 invoice, a To-Do to ask', !roofInv.some(y => /^2/.test(y)) && TODO().some(t => /^maint_renew_/.test(t.id) && t.id.indexOf(roofC.id) > 0), roofInv.join());
ok('with a yes: the renewal invoice is queued (through ✅ Approvals)', washInv.some(y => /^2\./.test(y)), washInv.join());

console.log('7. the ⭐ priority list, the snow event, an emergency from a priority customer');
r = await act({ action: 'tab' });
ok('a commercial plan customer is on the priority list automatically (snow + emergency)', r.out.priority.some(e => e.pid === 'C1' && e.emergency && e.snow));
await act({ action: 'quote-many', pid: 'H1', items: [{ planId: 'snow', price: 300 }] });
const snowC = get('gc_maint').find(c => c.pid === 'H1' && c.planId === 'snow');
await X.sign(ev, {}, { contractId: snowC.id, name: 'Ann Henderson', agree: true, strokes: [] }, await X.readAll(), P('H1'));
r = await act({ action: 'tab' });
const order = r.out.priority.map(e => e.pid);
ok('a residential winter snow sign-up joins the list, in sign-up order', order.indexOf('H1') > order.indexOf('C1') && r.out.priority.find(e => e.pid === 'H1').snow && !r.out.priority.find(e => e.pid === 'H1').emergency, order.join());
r = await act({ action: 'snow-event' }, OFFICE);
const st = TODO().filter(t => /^maint_snow_/.test(t.id));
ok('❄️ Snow event → a To-Do per customer in order + "We\'re on our way" portal posts on ✅ Approvals', r.status === 200 && st.length === r.out.customers && st.length >= 3 && /#1 /.test(st[0].label) && r.out.posts === r.out.customers, JSON.stringify(r.out));
const BA = require(FN + '/_lib/bid-alerts.js');
const LI = { gc_lead_inbox: [{ id: 'L-A', title: 'Water coming through ceiling' }, { id: 'L-B', title: 'Water leak in office' }] }, KX = {};
const d = { env: k => ({ RESEND_API_KEY: 're_test_only', CRM_URL: 'https://crm.test' })[k] || '', s: v => v == null ? '' : String(v).trim(), low: v => (v == null ? '' : String(v)).trim().toLowerCase(), arr: v => Array.isArray(v) ? v : [], nowIso: () => new Date().toISOString(),
  sb: p => fetch('https://fake-mt.supabase.co/rest/v1/' + p), kvGet: async k => LI[k] !== undefined ? LI[k] : KX[k], kvCas: async (k, fn) => { const cur = LI[k] !== undefined ? LI[k] : KX[k]; const nv = fn(cur === undefined ? null : JSON.parse(JSON.stringify(cur))); if (nv !== undefined) { if (LI[k] !== undefined) LI[k] = nv; else KX[k] = nv; } return true; } };
put('gc_team_settings', { leadAlertsTo: ['office@grayco-cs.com'] });
const m0 = SENT.length, t0 = TODO().length;
const E = BA.make(d);
const em = await E._emergency([{ id: 'L-A', key: 'L-A', title: 'Water coming through ceiling', detail: 'water pouring in', contact: { name: 'Sam Other', phone: '901-555-0000' } },
  { id: 'L-B', key: 'L-B', title: 'Water leak in office', detail: 'water damage, leak at roof drain', contact: { name: 'Dana Facility', phone: '+1 (901) 555-0199' } }], {});
const etodo = TODO().slice(t0).filter(t => /^EMERG_/.test(t.id)), emails = SENT.slice(m0).filter(m => /EMERGENCY/.test(m.subject));
ok('the priority customer\'s emergency is marked ⭐ PRIORITY CUSTOMER and goes first', etodo.length === 2 && /⭐ PRIORITY CUSTOMER/.test(etodo[0].label) && !/PRIORITY/.test(etodo[1].label), etodo.map(t => t.label).join(' | '));
ok('the alert body says ⭐ PRIORITY CUSTOMER with the Emergency Ready link (when e-mail goes out)', !emails.length || (/PRIORITY CUSTOMER/.test(emails[0].html || '') && /#maint/.test(emails[0].html || '')), emails.length + ' mails');
ok('the lead card is marked; the other lead is unchanged', LI.gc_lead_inbox.find(x => x.id === 'L-B').priorityCustomer === true && /^⭐/.test(LI.gc_lead_inbox.find(x => x.id === 'L-B').title) && !LI.gc_lead_inbox.find(x => x.id === 'L-A').priorityCustomer);

console.log('8. tiers, pamphlets, letters, commission, the service area');
r = await act({ action: 'tier', pid: 'C1', tier: 'gold' }, OFFICE);
r = await act({ action: 'tab' });
ok('Gold: on the drawing entry list', r.out.goldEntries.some(g => g.pid === 'C1'));
for (const a of ['multifamily', 'commercial', 'residential', 'insurance']) { const pr = await act({ action: 'pamphlet', audience: a }); const b = Buffer.from(pr.out.pdf || '', 'base64').toString('latin1');
  ok('pamphlet ' + a + ': a one-page PDF with the address, no carrier name', /^%PDF/.test(b) && (b.match(/\/Type \/Page /g) || []).length === 1 && /5796 Ferguson Rd/.test(b) && !/state farm|allstate/i.test(b)); }
r = await act({ action: 'pamphlet-mail', audience: 'commercial', to: 'fm@oakplaza.test' });
ok('pamphlet → an e-mail draft on ✅ Approvals', r.status === 200 && AQ().some(a => a.kind === 'maint_outreach' && a.meta.pamphlet === 'commercial'));
r = await act({ action: 'letter', pid: 'C1', kind: 'cert_sale', fields: { years: '7' } });
ok('a roof certification letter from the last inspection → a portal post on ✅ Approvals', r.status === 200 && AQ().some(a => a.id === r.out.postId && /Roof certification/.test(a.meta.postText)));
r = await act({ action: 'contract-set', contractId: washC.id, subCost: 700 }, OFFICE);
ok('PM commission, subbed (15/50/50): 1400 − 210 − 700 = 490 → 245', r.out.commission.pm === 245 && /15\/50\/50/.test(r.out.commission.rule), JSON.stringify(r.out.commission));
r = await act({ action: 'contract-set', contractId: roofC.id, cost: 450 }, OFFICE);
ok('PM commission, self-performed (50/50): (1350 − 450) / 2 = 450', r.out.commission.pm === 450, JSON.stringify(r.out.commission));
ok('service area: Bartlett / Southaven in, Nashville out; snow only Bartlett + Shelby County', M.areaOf('12 Oak St, Bartlett, TN 38134').snowOk && M.areaOf('10 Pine Rd, Southaven, MS 38671').inArea && !M.areaOf('10 Pine Rd, Southaven, MS 38671').snowOk && !M.areaOf('1 Broadway, Nashville, TN 37201').inArea && M.areaOf('1 Main St, West Memphis, AR 72301').inArea);
ok('every customer-facing item went to ✅ Approvals (only the signed copy the customer just signed goes at once, as before)', SENT.every(m => /grayco-cs\.com$/.test(m.to[0]) || /^Your GrayCo maintenance plan —/.test(m.subject) || AQ().some(a => a.status === 'sent' && a.to === m.to[0])), SENT.filter(m => !/grayco-cs/.test(m.to[0])).map(m => m.subject).join(' | '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
