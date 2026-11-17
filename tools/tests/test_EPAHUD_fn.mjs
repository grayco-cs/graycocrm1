// test_EPAHUD_fn.mjs <build-dir> — node-only (no browser) checks of patch EPAHUD (the EPA / HUD lead & asbestos papers to the PM).
// Runs index.html's own script blocks (LEADASB, JOBSTEPS, LEADASB3, JOBDOCS, DOCLIB, ENVCOMP, EPAHUD) + epahud-core.js + envcomp-core.js in a vm
// with a tiny DOM stand-in. Made-up data only; nothing leaves the machine.
//   1. the timing rules (EPA / HUD / NESHAP / state) — 2. each job type gets the right EPA / HUD papers (HUD, abatement, common area, NESHAP)
//   3. an admin's saved table picks up the new papers; one the admin took off stays off — 4. auto-fill (merge fields + blank rows)
//   5. the PM's "papers to send", the send channels (portal / e-mail / text / share / filed), data-entry hold, the log
//   6. overdue → PM → office — 7. scheduling: expired cert blocks, admin override logged, emergency warns only — 8. cert expiry alerts 60/30/7
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const block = id => { const i = html.indexOf('<script id="' + id + '">'); if (i < 0) return ''; const st = html.indexOf('>', i) + 1; return html.slice(st, html.indexOf('</script>', st)); };
const SRC = [['epahud-core.js', fs.readFileSync(path.join(BUILD, 'epahud-core.js'), 'utf8')], ['envcomp-core.js', fs.readFileSync(path.join(BUILD, 'envcomp-core.js'), 'utf8')]]
  .concat(['gc-patch-doclib', 'gc-patch-leadasb', 'gc-patch-jobsteps', 'gc-patch-leadasb3', 'gc-patch-jobdocs', 'gc-patch-envcomp', 'gc-patch-epahud'].map(id => [id, block(id)]));
ok('0 index.html has DOCLIB, JOBDOCS, ENVCOMP and EPAHUD; the cores are there', SRC.every(([, s]) => s.length > 2000), SRC.map(([k, s]) => [k, s.length]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const day = n => ymd(new Date(Date.now() + n * 864e5));

/* ── a tiny DOM + window ── */
function el(tag){ const e = { tagName: String(tag).toUpperCase(), style: {}, attrs: {}, children: [], innerHTML: '', textContent: '', parentElement: null, listeners: {},
  setAttribute(k, v){ this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }, getAttribute(k){ return this.attrs[k] == null ? null : this.attrs[k]; }, hasAttribute(k){ return k in this.attrs; }, removeAttribute(k){ delete this.attrs[k]; },
  appendChild(c){ c.parentElement = this; this.children.push(c); return c; }, insertBefore(c){ return this.appendChild(c); }, remove(){ if (this.parentElement) { const l = this.parentElement.children; l.splice(l.indexOf(this), 1); this.parentElement = null; } },
  addEventListener(t, f){ (this.listeners[t] = this.listeners[t] || []).push(f); }, querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, contains(){ return false; }, focus(){}, click(){} }; return e; }
const LIS = {}, IV = [];
const D = { hidden: false, body: el('body'), head: el('head'), documentElement: { classList: { contains: () => false } }, activeElement: null,
  addEventListener(t, f){ (LIS[t] = LIS[t] || []).push(f); }, getElementById(id){ return D.body.children.find(c => c.id === id) || D.head.children.find(c => c.id === id) || null; },
  querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementsByTagName(){ return []; }, createElement: el };
const store = {}; const LS = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const KV = {}, FETCH = [], PROMPT_ANS = [];
let ADMIN = true, PAUSED = false, SHARED = null;
const W = { document: D, localStorage: LS, sessionStorage: LS, console, JSON, Date, Math, Promise, Object, Array, String, Number, RegExp, Error, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, Intl, btoa: s => Buffer.from(s, 'binary').toString('base64'), unescape, escape,
  __GC_NATIVE_SETTIMEOUT__: (f, ms) => { IV.push({ f, ms, once: true }); return IV.length; }, __GC_NATIVE_SETINTERVAL__: (f, ms) => { IV.push({ f, ms }); return IV.length; },
  setTimeout: (f, ms) => { IV.push({ f, ms, once: true }); return 0; }, setInterval: (f, ms) => { IV.push({ f, ms }); return 0; }, clearInterval: () => {}, clearTimeout: () => {},
  __GC_AUTH__: { isAdmin: () => ADMIN, email: () => (ADMIN ? 'wjohnson@grayco-cs.com' : 'pm@grayco-cs.com') },
  _ehSb: k => Promise.resolve(KV[k] === undefined ? [] : JSON.parse(JSON.stringify(KV[k]))), _supaUpsertNow: (k, v) => { KV[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(true); },
  prompt: (m, d) => (PROMPT_ANS.length ? PROMPT_ANS.shift() : d), alert: () => {}, confirm: () => true,
  fetch: (u, o) => { const b = o && o.body ? JSON.parse(o.body) : {}; FETCH.push({ u, b }); return Promise.resolve({ ok: true, json: () => Promise.resolve(/portal-sign/.test(u) ? { ok: true, items: [] } : { ok: true, id: 'AP' + FETCH.length, queued: true }), text: () => Promise.resolve('{"ok":true}') }); },
  navigator: { share: d => { SHARED = d; return Promise.resolve(); } },
  _gcPause: { state: () => ({ paused: PAUSED, note: 'until Jan 3' }) },
  _gcCo: { ofJob: p => (p && ['construction', 'mitigation', 'environmental'].includes(p.companyId) ? p.companyId : 'construction') },
  _gcJobIsInsurance: p => !!(p && p.claimNo), _gcJobKind: p => (/commercial/i.test((p && p.type) || '') || (p && p.isCommercial) ? 'commercial' : 'residential'),
  _gcViewer: { open: o => { W.__viewed = o; } } };
W.window = W; W.self = W;
W._crm = { projects: [], projectDocs: [], users: [], schedule: [] };
let WRITES = 0;
W._setProjects = f => { WRITES++; W._crm.projects = typeof f === 'function' ? f(W._crm.projects) : f; };
W._setSchedule = f => { W._crm.schedule = typeof f === 'function' ? f(W._crm.schedule) : f; };
store.grayco_user = JSON.stringify({ name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner' });
vm.createContext(W);
for (const [id, s] of SRC) { try { vm.runInContext(s, W, { filename: id }); } catch (e) { ok('load ' + id, false, String(e.stack || e).slice(0, 500)); } }
const EP = W._gcEpaHudCore, JD = W._gcJobDocs, H = W._gcEpaHud, DL = W._gcDocLib, ECX = W._gcEnvComp;
ok('0 the cores, 📑 JOBDOCS, 📚 DOCLIB, 🛡 ENVCOMP and 🏛 EPAHUD are up', !!EP && !!JD && !!H && !!DL && !!ECX);
const flush = async (n = 3) => { for (let i = 0; i < n; i++) { const once = IV.filter(x => x.once); IV.splice(0, IV.length, ...IV.filter(x => !x.once)); once.forEach(x => { try { x.f(); } catch (e) {} }); await new Promise(r => setTimeout(r, 5)); } };

/* ═ 1 · the timing rules ═ */
const P0 = { id: 'X', address: '1 Demo St, Memphis, TN 38135', startDate: '2026-12-07' };   /* a Monday */
ok('1a pamphlet by mail: the certificate of mailing 7 days before the start', EP.due(P0, { due: 'start-7' }).date === '2026-11-30');
ok('1b NESHAP: 10 working days before (weekends skipped)', EP.due(P0, { due: 'wd10' }).date === '2026-11-23');
ok('1c state lead abatement notice: TN 5 business days, MS 6 working days, AR 10 (confirm)', EP.due(P0, { due: 'state-abate' }).date === '2026-11-30' && EP.due(Object.assign({}, P0, { address: '1 Demo St, Southaven, MS 38671' }), { due: 'state-abate' }).date === '2026-11-27' && EP.due(Object.assign({}, P0, { address: '1 Demo St, West Memphis, AR 72301' }), { due: 'state-abate' }).date === '2026-11-23');
const PC = Object.assign({}, P0, { epahud: { events: { completedOn: '2026-12-10', finalInvoice: '2026-12-20', evalReport: '2026-11-02', ebllNotice: '2026-11-01', envReport: '2026-11-10', wasteAccepted: '2026-12-11' } } });
ok('1d RRP records: the final invoice when it is sooner than 30 days', EP.due(PC, { due: 'final30' }).date === '2026-12-20' && EP.due(Object.assign({}, PC, { epahud: { events: { completedOn: '2026-12-10', finalInvoice: '2027-02-01' } } }), { due: 'final30' }).date === '2027-01-09');
ok('1e HUD: hazard-reduction notice 15 days after completion; evaluation notice 15 days after the report', EP.due(PC, { due: 'done15' }).date === '2026-12-25' && EP.due(PC, { due: 'eval15' }).date === '2026-11-17');
ok('1f HUD EBLL: investigation 15 days, hazard reduction 30 days; NESHAP WSR follow-up at 35 days', EP.due(PC, { due: 'ebll15' }).date === '2026-11-16' && EP.due(PC, { due: 'ebll30' }).date === '2026-12-10' && EP.due(PC, { due: 'wsr35' }).date === '2027-01-15');
ok('1g no clock date yet → it says what to enter (never a made-up date)', EP.due({ id: 'Y' }, { due: 'done15' }).date === '' && /completion date/.test(EP.due({ id: 'Y' }, { due: 'done15' }).wait));

/* ═ 2 · each job gets the right EPA / HUD papers ═ */
const now = new Date().toISOString();
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, clientEmail: id.toLowerCase() + '@example.com', clientPhone: '9015550100', address: id + ' Demo St, Memphis, TN 38135', status: 'active', pct: 0, startDate: day(10), pm: 'Demo PM', createdAt: now, updatedAt: now }, o);
W._crm.users = [{ name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }, { name: 'Dan Crew', email: 'dan@grayco-cs.com', role: 'Laborer', active: true }];
W._crm.projects = [
  J('PRRP', { type: 'Residential Reno', leadAsb: { yearBuilt: 1962, disturbsPaint: true } }),
  J('PHUD', { type: 'Residential Reno', leadAsb: { yearBuilt: 1955, disturbsPaint: true, hud: true }, epahud: { facts: { tenantOccupied: true }, occupant: { name: 'Tess Tenant', email: 'tess@example.com', phone: '9015550111' } } }),
  J('PAB', { type: 'Environmental', companyId: 'environmental', description: 'Lead paint abatement', leadAsb: { yearBuilt: 1940, abatement: true } }),
  J('PCOM', { type: 'Residential Reno', leadAsb: { yearBuilt: 1970, disturbsPaint: true }, epahud: { facts: { commonArea: true } } }),
  J('PASBC', { type: 'Asbestos abatement', companyId: 'environmental', isCommercial: true, address: '9 Demo Plaza, Memphis, TN 38103' }),
  J('PASBR', { type: 'Asbestos abatement', companyId: 'environmental' }),
  J('PWATER', { type: 'Water Damage', companyId: 'mitigation', description: 'Pipe burst — asbestos ceiling texture found' })];
const P = id => W._crm.projects.find(p => p.id === id);
const K = id => ((P(id).jobDocs || {}).items || []).map(x => x.k);
const has = (id, ...ks) => ks.every(k => K(id).includes(k));
const item = (id, k) => ((P(id).jobDocs || {}).items || []).find(x => x.k === k);
JD.sweep();
ok('2a RRP job (not HUD): Lead 01 + Lead 08 proof of mailing + Lead 11 cleaning verification + Lead 03; no HUD / abatement papers', has('PRRP', 'gcb_lead_01', 'gcb_lead_08', 'gcb_lead_11', 'gcb_lead_03') && !K('PRRP').some(k => /hud_|lead_1[345]/.test(k)), K('PRRP'));
ok('2b HUD-assisted job: HUD 01 evaluation notice, HUD 02 hazard reduction, HUD 03 relocation, HUD 04 clearance, HUD 05 maintenance, Lead 15 evaluation, Lead 12 occupant copy (tenants)', has('PHUD', 'gcb_hud_01', 'gcb_hud_02', 'gcb_hud_03', 'gcb_hud_04', 'gcb_hud_05', 'gcb_lead_15', 'gcb_lead_12') && !has('PHUD', 'gcb_hud_06'), K('PHUD'));
ok('2c …the old "needs a form" HUD line is now the real HUD 02 form', !(P('PHUD').jobDocs.items || []).some(x => x.needsForm && /HUD/.test(x.label)));
ok('2d abatement job: Lead 13 abatement report, Lead 14 state notice checklist, HUD 03 occupant protection, Lead 15, HUD 04 clearance; no RRP cleaning verification', has('PAB', 'gcb_lead_13', 'gcb_lead_14', 'gcb_hud_03', 'gcb_lead_15', 'gcb_hud_04') && !has('PAB', 'gcb_lead_11'), K('PAB'));
ok('2e common-area job: Lead 09 notice to every unit, Lead 10 statement of the steps, Lead 12 posting', has('PCOM', 'gcb_lead_09', 'gcb_lead_10', 'gcb_lead_12'), K('PCOM'));
ok('2f commercial asbestos: Asbestos 03 inspection, 04 NESHAP tracking, 05 sub coordination, 06 occupant notice; residential asbestos: no NESHAP tracking', has('PASBC', 'gcb_asb_03', 'gcb_asb_04', 'gcb_asb_05', 'gcb_asb_06') && has('PASBR', 'gcb_asb_03', 'gcb_asb_05') && !has('PASBR', 'gcb_asb_04'), { c: K('PASBC'), r: K('PASBR') });
ok('2g each paper carries who it goes to, its timing and its rule', item('PHUD', 'gcb_hud_02').to === 'occupant' && item('PHUD', 'gcb_hud_02').due === 'done15' && /35\.125\(b\)/.test(item('PHUD', 'gcb_hud_02').cite) && item('PASBC', 'gcb_asb_04').to === 'agency' && item('PRRP', 'gcb_lead_03').due === 'final30' && item('PRRP', 'gcb_lead_01').to === 'owner+occupant');
const libIds = DL.builtins().map(b => b.id);
const NEW = ['lead_08', 'lead_09', 'lead_10', 'lead_11', 'lead_12', 'lead_13', 'lead_14', 'lead_15', 'hud_01', 'hud_02', 'hud_03', 'hud_04', 'hud_05', 'hud_06', 'asb_03', 'asb_04', 'asb_05', 'asb_06'].map(x => 'gcb_' + x);
ok('2h all 18 new papers are in the 📚 library, and every EPAHUD row of the table points at one', NEW.every(id => libIds.includes(id)) && Object.values(EP.ITEMS).flat().every(x => libIds.includes(x.doc)), NEW.filter(id => !libIds.includes(id)));
ok('2i every new paper says what it is based on and to confirm it (no legal text presented as authoritative)', NEW.every(id => { const b = DL.builtins().find(x => x.id === id).body; return /Based on /.test(b) && /confirm the current rule with your state program/.test(b); }));

/* ═ 3 · an admin's saved table (from before EPAHUD) gets the new papers; one taken off stays off ═ */
const oldT = JSON.parse(JSON.stringify(JD.DEFAULT)); oldT.types.forEach(t => { t.items = t.items.filter(x => !x.ep); }); oldT.at = '2026-11-16T10:00:00Z';
store.gc_jobdocs_table_v1 = JSON.stringify(oldT);
const fresh = () => { vm.runInContext('void 0', W); };
// re-load JOBDOCS' table from this computer
W.__GC_PATCH_JOBDOCS__ = false; vm.runInContext(block('gc-patch-jobdocs'), W, { filename: 'jobdocs2' });
const JD2 = W._gcJobDocs;
ok('3a a table saved before EPAHUD gets the EPA / HUD papers (lead + asbestos)', JD2.table().types.find(t => t.key === 'lead').items.some(x => x.doc === 'gcb_hud_02') && JD2.table().types.find(t => t.key === 'asbestos').items.some(x => x.doc === 'gcb_asb_03'));
const t2 = JSON.parse(JSON.stringify(JD2.table())); const lead = t2.types.find(t => t.key === 'lead'); lead.items = lead.items.filter(x => x.doc !== 'gcb_lead_08');
const sv = await JD2.saveTable(t2);
ok('3b the admin takes Lead 08 off → saved with it in "dropped"; it is not added back', sv.ok && (KV.gc_jobdocs_table.dropped || []).includes('gcb_lead_08') && !JD2.table().types.find(t => t.key === 'lead').items.some(x => x.doc === 'gcb_lead_08'));
ok('3c the editor keeps who it goes to / due / the rule (the saved rows still have them)', KV.gc_jobdocs_table.types.find(t => t.key === 'lead').items.find(x => x.doc === 'gcb_hud_02').due === 'done15');
const t3 = JSON.parse(JSON.stringify(KV.gc_jobdocs_table)); delete t3.dropped; t3.types.find(t => t.key === 'lead').items = JD.DEFAULT.types.find(t => t.key === 'lead').items; await JD2.saveTable(t3);
W._gcJobDocs = JD;   /* back to the first copy for the rest */

/* ═ 4 · auto-fill ═ */
KV.gc_certs = { list: [
  { id: 'C1', holderType: 'company', holder: 'company', tpl: 'epa_rrp_firm', name: 'EPA RRP Lead-Safe Certified Firm (TN & AR)', number: 'NAT-F123456-1', state: 'TN/AR', expires: '2030-05-01' },
  { id: 'C2', holderType: 'person', holder: 'wjohnson@grayco-cs.com', holderName: 'Wesley Johnson', tpl: 'rrp_renovator', ckind: 'rrp_renovator', name: 'EPA RRP Certified Renovator', number: 'R-777', issued: '2026-11-06', expires: '2031-11-06', state: 'TN/AR' }] };
await H.pullCerts();
W._crm.projects = W._crm.projects.map(p => p.id === 'PHUD' ? Object.assign({}, p, { epahud: Object.assign({}, p.epahud, { events: { completedOn: day(-20) } }) }) : p);
const f = H.fields(P('PHUD'));
ok('4a the CRM fills: year built, start date, completion date, HUD notice due date, the firm # and the certified renovator + # (from 📜 Certifications)', f.year_built === '1955' && /20\d\d/.test(f.start_date) && /20\d\d/.test(f.completion_date) && /20\d\d/.test(f.hud_reduction_by) && /NAT-F123456-1/.test(f.rrp_firm_no) && f.renovator === 'Wesley Johnson' && /R-777/.test(f.renovator_no) && f.occupant === 'Tess Tenant', f);
const r1 = await DL.render('gcb_hud_02', 'PHUD');
ok('4b HUD 02 renders filled in: customer, address, completion date, the due date — no "{…}" left', r1 && /Client PHUD/.test(r1.body) && /PHUD Demo St/.test(r1.body) && r1.body.includes(f.completion_date) && r1.body.includes(f.hud_reduction_by) && !/\{[a-z_]+\}/.test(r1.body), r1 && r1.body.slice(0, 400));
const r2 = await DL.render('gcb_lead_03', 'PHUD');
ok('4c an OLD paper (Lead 03) gets its blank rows filled too: Year built, Planned start date, Completion date, the firm #', r2 && />1955</.test(r2.body.replace(/<b>|<\/b>/g, '')) && r2.body.includes(f.start_date) && r2.body.includes(f.completion_date) && r2.body.includes('NAT-F123456-1'), r2 && r2.body.slice(0, 1500));
const r3 = await DL.render('gcb_lead_13', 'PAB');
ok('4d no number GrayCo does not have is made up (no supervisor cert on file → the row stays blank)', r3 && !/undefined|null/.test(r3.body) && /Supervisor certification no\.<\/td><td[^>]*><b><span style="display:inline-block;min-width:120px/.test(r3.body), r3 && r3.body.slice(0, 800));

const r4 = await DL.render('gcb_hud_04', 'PHUD');
ok('4e the clearance levels come from the "Lead levels" record (built-in v.3 until it loads): floors 5 / sills 40 / troughs 100', r4 && /floors 5 µg\/ft², sills 40 µg\/ft², troughs 100 µg\/ft²/.test(r4.body) && /2026 v\.3/.test(r4.body), r4 && (r4.body.match(/Clearance levels[^<]*/) || [''])[0]);
KV.gc_lead_levels = { name: 'Lead levels 2026', year: 2026, version: 'v.4', levels: { dlal: { floor: 4, sill: 40, trough: 100 }, blood: { cdcChild: 3.5 } }, _history: [] };
await H.pullLevels();
const r5 = await DL.render('gcb_hud_04', 'PHUD'), r6 = await DL.render('gcb_hud_02', 'PHUD');
ok('4f an admin edits the record (floors 4, v.4) → the papers follow; the occupant notice shows the CDC child level 3.5', /floors 4 µg\/ft²/.test(r5.body) && /Lead levels 2026 v\.4/.test(r5.body) && /3\.5 µg\/dL/.test(r6.body), (r5.body.match(/Clearance levels[^<]*/) || [''])[0]);
/* ═ 5 · the PM's papers to send, the channels, the log ═ */
await flush();
const L = H.toSend(P('PHUD'));
ok('5a "papers to send" on the HUD job: outgoing ones only (not the crew\'s file papers), sorted by due date, HUD 02 overdue (completed 20 days ago)', L.length >= 5 && L.every(z => !['file', 'sub'].includes(EP.meta(z.x).to)) && L.find(z => z.x.k === 'gcb_hud_02').d.over === true, L.map(z => [z.x.k, z.d.date, z.d.over]));
ok('5b the card top says how many and how many are late; the due line cites the rule', /📑 \d+ papers to send/.test(H.cardTop(P('PHUD'))) && /overdue/.test(H.cardTop(P('PHUD'))) && /OVERDUE — was due .*24 CFR 35\.125\(b\)\(1\)/.test(H.dueHtml(P('PHUD'), item('PHUD', 'gcb_hud_02'))));
FETCH.length = 0;
await H.sendVia('PHUD', 'gcb_hud_02', 'email'); await flush();
let q = FETCH.find(x => /functions\/portal$/.test(x.u));
const sent5c = q && q.b.html;
ok('5c ✉️ e-mail → the approvals queue (kind document, channel email) to the OCCUPANT (HUD notice) with the filled paper', q && q.b.kind === 'document' && q.b.channel === 'email' && q.b.recipient === 'occupant' && /NOTICE OF LEAD HAZARD REDUCTION/.test(q.b.html), q && q.b);
FETCH.length = 0;
await H.sendVia('PHUD', 'gcb_hud_01', 'sms'); await flush();
q = FETCH.find(x => /functions\/portal$/.test(x.u));
ok('5d 📱 text → channel sms with a link to the portal (no paper body in a text)', q && q.b.channel === 'sms' && /portal\.grayco-cs\.com/.test(q.b.html) && !/<table/.test(q.b.html), q && q.b);
FETCH.length = 0; W._gcDocAuto = { active: () => true, run: (pid, o) => { W.__da = { pid, o }; return Promise.resolve({ ok: true, made: 1 }); } };
await H.sendVia('PRRP', 'gcb_lead_01', 'portal'); await flush();
ok('5e 👤 portal on a signed paper (Lead 01) → DOCAUTO portal e-sign for that paper', W.__da && W.__da.pid === 'PRRP' && W.__da.o.ids[0] === 'gcb_lead_01');
await H.sendVia('PHUD', 'gcb_hud_03', 'share'); await flush();
ok('5f 📤 share from the phone → navigator.share with the paper', SHARED && /HUD 03/.test(SHARED.title));
PAUSED = true; FETCH.length = 0;
const held = await H.sendVia('PHUD', 'gcb_hud_05', 'email'); await flush();
ok('5g ⏸ data-entry mode: e-mail is HELD (nothing queued, logged as held); share still works', held.held === true && !FETCH.some(x => /functions\/portal$/.test(x.u)) && (await H.sendVia('PHUD', 'gcb_hud_05', 'share')).ok === true);
PAUSED = false; await flush();
PROMPT_ANS.push(day(-1), 'TDEC-CONF-42');
H.filed('PASBC', 'gcb_asb_04'); await flush();
const LOG = id => ((P(id).jobDocs || {}).log || []);
ok('5h 🏛 Filed (agency) → date + confirmation # → done, logged', LOG('PASBC').some(e => e.k === 'gcb_asb_04' && e.act === 'filed' && /TDEC-CONF-42/.test(e.via)) && P('PASBC').jobDocs.done.gcb_asb_04);
ok('5i every send / share / hold is logged on the paper with who / when / how (kept on the job)', ['sent', 'shared', 'held'].every(a => LOG('PHUD').some(e => e.act === a && e.by && e.at && e.via)) && LOG('PHUD').filter(e => e.k === 'gcb_hud_02' && e.act === 'sent').length === 1, LOG('PHUD'));
ok('5j a sent paper leaves the "to send" list (it waits for approval / signature)', !H.toSend(P('PHUD')).some(z => z.x.k === 'gcb_hud_02'));
const chHud = EP.channels(item('PHUD', 'gcb_hud_02')), chNes = EP.channels(item('PASBC', 'gcb_asb_04')), chFile = EP.channels(item('PRRP', 'gcb_lead_11'));
ok('5k channels by recipient: occupant notice → portal / e-mail / text / share; NESHAP → filed only; a crew record → share only', JSON.stringify(chHud) === '["portal","email","text","share"]' && JSON.stringify(chNes) === '["filed"]' && JSON.stringify(chFile) === '["share"]');

ok('5l the sent copy is stamped with the levels version it used ("Levels: 2026 v.4") and so is its log line', /Levels: 2026 v\.4/.test(sent5c) && LOG('PHUD').find(e => e.k === 'gcb_hud_02' && e.act === 'sent').levels === '2026 v.4');
KV.gc_lead_levels = Object.assign({}, KV.gc_lead_levels, { version: 'v.5', levels: { dlal: { floor: 3, sill: 40, trough: 100 } }, _history: [{ version: 'v.4' }] });
await H.pullLevels();
const r7 = await DL.render('gcb_hud_02', 'PHUD');
ok('5m the admin changes the levels (v.5, floors 3) → a NEW paper uses them; the copy already sent keeps v.4', /Levels: 2026 v\.5/.test(r7.body) && /floors 3 \//.test(r7.body) && /Levels: 2026 v\.4/.test(sent5c) && !/v\.5/.test(sent5c) && /floors 4 \//.test(sent5c));
ok('5n the 📏 Lead levels card is on a lead job\'s paperwork (from the record) and not on an asbestos-only job', /data-ep-levels="2026 v\.5"/.test(H.cardTop(P('PHUD'))) && /floors 3/.test(H.cardTop(P('PHUD'))) && !/data-ep-levels/.test(H.cardTop(P('PASBR'))));
const rx = await DL.render('gcb_asb_05', 'PASBR');
ok('5o a paper that cites no level carries no levels stamp', rx && !/data-gc-levels/.test(rx.body));
/* ═ 6 · overdue → the PM, then the office / admins ═ */
store.gc_office_tasks = '[]';
W._crm.projects = W._crm.projects.map(p => p.id === 'PRRP' ? Object.assign({}, p, { epahud: { events: { completedOn: day(-40) } } }) : p);
H.sweep();
const TT = () => JSON.parse(store.gc_office_tasks || '[]').filter(t => t.kind === 'epahud');
let tk = TT();
ok('6a an overdue paper → a To-Do for the job\'s PM (high)', tk.some(t => t.id === 'EPAHUD_PRRP_gcb_lead_03' && t.assignee === 'Demo PM' && t.prio === 'high' && /OVERDUE/.test(t.label)), tk.map(t => [t.id, t.assignee]));
ok('6b 2+ days late → also the office + admins', tk.some(t => t.id === 'EPAHUD_ESC_PRRP_gcb_lead_03' && t.assignee === 'Office' && /office \+ admins/.test(t.label)));
JD.markDone('PRRP', 'gcb_lead_03', 'signed'); await flush();
H.sweep(); tk = TT();
ok('6c handled → both To-Dos close', tk.filter(t => /PRRP_gcb_lead_03$/.test(t.id)).every(t => t.done));

/* ═ 7 · scheduling a person checks their certifications ═ */
W._crm.schedule = [{ id: 'S1', pid: 'PASBR', date: day(2), assignee: 'Wesley Johnson' }];
H._reset(); H.schedCheck(W._crm.schedule);   /* first look */
W._crm.schedule = [{ id: 'S1', pid: 'PASBR', date: day(2), assignee: 'Wesley Johnson, Dan Crew' }];
const hits = H.schedCheck(W._crm.schedule);
let dlg = D.getElementById('gc-ep-sheet');
ok('7a Dan (no asbestos worker license) put on the asbestos job → ⛔ with the reason', hits.length === 1 && hits[0].who === 'Dan Crew' && /asbestos/i.test(hits[0].why.join(' ')) && dlg && /Crew not certified/.test(dlg.attrs['aria-label']) && /data-ep-block="block"/.test(dlg.innerHTML), hits);
const click = (o, sel) => { const t = { getAttribute: k => (k === 'data-epb' ? sel : null), closest: s => (/data-epb/.test(s) ? t : null) }; (o.listeners.click || []).forEach(fn => fn({ target: t })); };
click(dlg, 'off');
ok('7b "Take them off" → Dan is off the schedule entry, Wesley stays', W._crm.schedule[0].assignee === 'Wesley Johnson', W._crm.schedule);
KV.gc_certs.list.push({ id: 'C3', holderType: 'person', holder: 'dan@grayco-cs.com', holderName: 'Dan Crew', name: 'Asbestos abatement worker', ckind: 'asb_worker', number: 'AW-1', expires: day(-3), state: 'TN' });
await H.pullCerts();
W._crm.schedule = [{ id: 'S1', pid: 'PASBR', date: day(2), assignee: 'Wesley Johnson, Dan Crew' }];
const h2 = H.schedCheck(W._crm.schedule); dlg = D.getElementById('gc-ep-sheet');
ok('7c an EXPIRED card still blocks (the reason says expired)', h2.length === 1 && /expired/i.test(h2[0].why.join(' ')), h2);
PROMPT_ANS.push('State confirmed his renewal is in process — supervisor on site');
click(dlg, 'over'); await flush();
ok('7d admin override → stays on, logged with who / why on the job and in gc_epahud_overrides', W._crm.schedule[0].assignee === 'Wesley Johnson, Dan Crew' && (P('PASBR').epahud.overrides || []).some(o => o.who === 'Dan Crew' && /renewal/.test(o.why) && o.by === 'Wesley Johnson' && o.at) && (KV.gc_epahud_overrides.list || []).length === 1);
W._crm.schedule = W._crm.schedule.concat([{ id: 'S2', pid: 'PWATER', date: day(1), assignee: 'Dan Crew' }]);
const h3 = H.schedCheck(W._crm.schedule); dlg = D.getElementById('gc-ep-sheet');
ok('7e emergency mitigation job (asbestos found) → a warning only, never taken off', h3.length === 1 && h3[0].em === true && /data-ep-block="warn"/.test(dlg.innerHTML) && W._crm.schedule.some(x => x.id === 'S2' && x.assignee === 'Dan Crew'), h3);
ok('7f the job card shows "✗ Crew certified" with the problem', /✗ Crew certified/.test(H.crewLine(P('PASBR'))));

/* ═ 8 · company / people certificates: the types, the drafts, 60 / 30 / 7 day alerts ═ */
const tpl = EP.certTemplates;
ok('8a 📜 the EPA / HUD / AHERA / OSHA types are there (lead supervisor / worker / inspector / risk assessor / designer / dust sampling, AHERA worker / supervisor / inspector / planner / designer, O&M, OSHA 10, fit test, med clearance, HazCom, AMRT, WRT, asbestos license, NESHAP account, pollution insurance, mold license)', ['lead_sup_ind', 'lead_worker_ind', 'lead_inspector_ind', 'lead_risk_ind', 'lead_designer_ind', 'dust_tech_ind', 'asb_worker_ind', 'asb_sup_ind', 'asb_inspector_ind', 'asb_planner_ind', 'asb_designer_ind', 'asb_om_ind', 'osha10_ind', 'fit_ind', 'resp_med_ind', 'hazcom_ind', 'amrt_ind', 'wrt_ind', 'asb_contractor_co', 'neshap_acct_co', 'pollution_co', 'mold_lic_co'].every(t => tpl.some(x => x.t === t)) && tpl.every(x => x.warnDays === 60 && x.leadDays === 0));
ok('8b the owner\'s two certificates are drafts with NO number (Seagull: RRP renovator 11/6 Arlington TN, lead abatement supervisor 11/16 Atlanta)', EP.drafts.length === 2 && EP.drafts.every(d => !d.number && d.holder === 'wjohnson@grayco-cs.com') && EP.drafts.some(d => d.issued === '2026-11-06' && /Arlington, TN/.test(d.courseCity)) && EP.drafts.some(d => d.issued === '2026-11-16' && /Atlanta/.test(d.courseCity) && /ADH|Arkansas/.test(d.notes)));
KV.gc_certs = { list: [] }; delete KV.gc_epahud_seed_v1;
const sd = await H.seedDrafts();
const sd2 = await H.seedDrafts();
ok('8c an admin\'s computer adds the drafts once (marked draft, no number, no expiry made up)', sd.added === 2 && KV.gc_certs.list.length === 2 && KV.gc_certs.list.every(c => c.draft && c.number === '' && c.expires === '') && sd2.skipped === true);
let gcp = null; try { gcp = require(path.join(BUILD, 'netlify/functions/_lib/gcp.js')); } catch (e) {}
if (gcp && gcp.certStep) {
  const c = Object.assign({ id: 'X', expires: '2027-03-01' }, tpl.find(x => x.t === 'asb_worker_ind'));
  const st = d => (gcp.certStep(c, d) || {}).step;
  ok('8d the daily reminder (admins + office) fires 60, 30 and 7 days before expiry, then expired', st('2026-12-31') === '60d' && st('2027-01-30') === '30d' && st('2027-02-22') === '7d' && st('2027-03-02') === 'expired' && !st('2026-12-15'), [st('2026-12-31'), st('2027-01-30'), st('2027-02-22'), st('2027-03-02')]);
} else ok('8d (gcp.js loads in node)', false, 'gcp.js did not load');
const R0 = W._gcEnvCompCore.rules();
ok('8e 🛡 ENVCOMP has the new people rules (MS firm by MDEQ, OSHA 10, O&M awareness, pollution insurance) and the state notice days (TN 5, MS 6, AR 10 — confirm)', ['rrp-firm-ms', 'all-osha10', 'asb-om-aware', 'co-pollution'].every(id => R0.people.some(x => x.id === id)) && R0.notices.find(n => n.id === 'la-notice-tn').daysBefore === 5 && R0.notices.find(n => n.id === 'la-notice-ms').daysBefore === 6 && R0.notices.find(n => n.id === 'rrp-notice-ms'));
ok('Z no EPAHUD / JOBDOCS / ENVCOMP errors', !W.__gcEpErr && !W.__gcJdErr && !W.__gcEcErr, [W.__gcEpErr, W.__gcJdErr, W.__gcEcErr]);
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
