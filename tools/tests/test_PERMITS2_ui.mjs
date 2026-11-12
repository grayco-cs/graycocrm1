// test_PERMITS2_ui.mjs <build-dir> — patch PERMITS2 in the browser: 📥 import a permit list (CSV + Excel), 📧 the MSCCE monthly
// records request (Owner setup), Dodge in Integrations (off · later), 📌 pinning an integration to MY left menu, and the "$1M+
// commercial only" filters (kinds of building, "Not matching the filters"). Offline harness; every row is MADE UP.
// PERMITS_SHOTS=<dir> also saves screenshots there.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 400))); };
const SHOTS = process.env.PERMITS_SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (c, name, sel) => { if (!SHOTS) return; const p = c.page(); const f = SHOTS + '/' + name + '.png'; if (sel) { const el = await p.$(sel); if (el) { await el.screenshot({ path: f }); return; } } await p.screenshot({ path: f }); };
resetCloud();
const now = new Date().toISOString(), day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Estimator', active: true }]);
cset('leads', [{ id: 'L0', name: 'Existing Demo Lead', company: 'Existing Demo Lead', type: 'Residential', status: 'new', updatedAt: now }]);
const NASH = { src: 'nashville', area: 'Nashville', areaLong: 'Nashville / Davidson Co., TN', city: 'Nashville', usState: 'TN', zip: '37000', state: 'new', firstSeen: now };
const SRV = { items: [
  Object.assign({}, NASH, { key: 'nashville:H1', id: 'H1', number: 'T2026001001', type: 'Building Commercial - New', subtype: 'Hotel / Motel', desc: 'New 6 story hotel, 140 rooms', value: 22000000, issued: day(2), address: '10 Sample Way', contractor: 'Example Hospitality Builders', reasons: ['🏨 Hotel', 'Commercial new $22M'], hint: 'construction', bucket: 'commercialNew' }),
  Object.assign({}, NASH, { key: 'nashville:S1', id: 'S1', number: 'T2026001002', type: 'Building Commercial - Rehab', subtype: 'Nursing Home', desc: 'Assisted living wing renovation', value: 2400000, issued: day(3), address: '20 Sample Way', contractor: 'Mock Senior Living Contractors', reasons: ['🧓 Senior living', 'Commercial rehab $2.4M'], hint: 'construction', bucket: 'commercialRehab' }),
  Object.assign({}, NASH, { key: 'nashville:K1', id: 'K1', number: 'T2026001003', type: 'Building Residential - Rehab', desc: 'Kitchen remodel', value: 60000, issued: day(4), address: '30 Sample Way', contractor: 'Example Remodelers', reasons: [], hint: 'construction', bucket: 'residentialRehab', filtered: 'not a kind of permit you picked (residentialRehab)' })
], status: { nashville: { on: true, ok: true, lastRun: now, read: 17, matched: 15, added: 2, error: '' }, shovels: { active: false, off: true } },
  settings: { v: 1, include: { commercialNew: true, commercialRehab: true, multifamily: true, residentialRehab: false, residentialNew: false, demolition: false, roofing: false, repair: false }, uses: { senior: true, hospital: true, hotel: true, school: true, mixed: true, multifamily: true, office: true, retail: true, industrial: true, church: true, civic: true }, exclude: ['sign', 'tent'], minValue: 1000000, maxAgeDays: 14, nashville: { on: true }, shovels: { on: false, zips: [] } },
  mscce: { on: false, to: '', from: 'GrayCo Construction Services <office@grayco-cs.com>', replyTo: 'office@grayco-cs.com', sent: {}, replies: [] }, calls: [] };
const INCLUDE = [['commercialNew', 'Commercial — new buildings'], ['commercialRehab', 'Commercial — rehab / remodel / tenant finish / addition'], ['multifamily', 'Multifamily — 3+ units (apartments, condos)'], ['residentialRehab', 'Residential — rehab / remodel / addition'], ['residentialNew', 'Residential — new houses'], ['demolition', 'Demolition (any value)'], ['roofing', 'Roofing (any value)'], ['repair', 'Fire / water / storm … (any value)']];
const USES = [['senior', '🧓 Senior living'], ['hospital', '🏥 Hospital / medical'], ['hotel', '🏨 Hotel'], ['school', '🏫 School / college'], ['mixed', '🏙 Mixed-use'], ['multifamily', '🏘 Multifamily'], ['office', '🏢 Office'], ['retail', '🛍 Retail / restaurant'], ['industrial', '🏭 Industrial / warehouse'], ['church', '⛪ Church'], ['civic', '🏛 Civic / government']];
const LETTER = { subject: 'Public records request — building permits issued November 2026 (Memphis & Shelby County)', text: 'Hello,\n\nUnder the Tennessee Public Records Act (T.C.A. § 10-7-503), GrayCo Construction Services requests a list of the building permits issued … from 11/1/2026 through 11/30/2026.\n\nAn Excel or CSV export is perfect …', month: '2026-11' };
function answer(b){
  SRV.calls.push(b);
  if (b.action === 'list') return { ok: true, items: SRV.items, status: SRV.status, settings: SRV.settings, counts: {}, active: { nashville: true, shovels: false }, shovelsConfigured: false, admin: true };
  if (b.action === 'settings-get') return { ok: true, settings: SRV.settings, defaults: SRV.settings, include: INCLUDE, uses: USES, zipGroups: [], tags: [], admin: true, shovelsConfigured: false, dodgeConfigured: false };
  if (b.action === 'settings-set') { SRV.settings = Object.assign({}, SRV.settings, b.settings); return { ok: true, settings: SRV.settings }; }
  if (b.action === 'import') { const add = b.rows.map(r => Object.assign({}, NASH, { key: 'import:' + b.source + ':' + r.number, src: 'import:' + b.source, id: r.number, number: r.number, type: r.type, desc: r.desc, address: r.address, city: r.city, area: r.city, areaLong: b.source === 'shelby' ? 'Shelby County (Develop 901)' : 'MSCCE records', contractor: r.contractor, contractorPhone: r.phone, value: +String(r.value).replace(/[$,]/g, ''), issued: '2026-10-02', reasons: ['🏥 Hospital / medical', 'Commercial new $9.5M'], hint: 'construction' }));
    add.forEach(x => { if (!SRV.items.some(y => y.key === x.key)) SRV.items.unshift(x); }); return { ok: true, read: b.rows.length, matched: 1, added: add.length, source: b.source === 'shelby' ? 'Shelby County (Develop 901)' : 'MSCCE records' }; }
  if (b.action === 'mscce-get') return { ok: true, cfg: SRV.mscce, preview: LETTER, phone: '901-222-8300', replyInbox: 'permits@in.grayco-cs.com', mailReady: true };
  if (b.action === 'mscce-set') { SRV.mscce = Object.assign({}, SRV.mscce, b.cfg); if (!SRV.mscce.to) SRV.mscce.on = false; return { ok: true, cfg: SRV.mscce }; }
  if (b.action === 'mscce-send') { if (b.confirm !== true) return { ok: false, error: 'confirm' }; SRV.mscce.sent = { '2026-11': { ok: true, to: SRV.mscce.to, at: new Date().toISOString(), by: 'Wesley Johnson', manual: true } }; return { ok: true, sent: SRV.mscce.sent['2026-11'] }; }
  return { ok: false, error: 'Bad request' };
}
const FN = [];
async function rig(c){
  await c.ctx.route(u => /\/\.netlify\/functions\//.test(u), r => { FN.push(new URL(r.request().url()).pathname.split('/').pop()); return r.fallback(); });
  await c.ctx.route(u => /\/\.netlify\/functions\/permit-watch/.test(u), r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(b)) }); });
  await c.ctx.route(u => /\/\.netlify\/functions\/owner-setup/.test(u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, checks: { shovels_key: false, gdrive: false, dodge_key: false } }) }));
}
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
await rig(A);
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
const T0 = Date.now();
await A.ev(() => window._setView('permitjobs')); await sleep(2500);
const rows = () => A.ev(() => [...document.querySelectorAll('#gc-pj tbody tr')].map(r => r.getAttribute('data-k')));
/* $1M+ commercial: what is below the line is kept but not shown */
ok('Jobs shows the $22M hotel and the $2.4M senior living job; the $60k kitchen (filtered on the server) is hidden', JSON.stringify(await rows()) === '["nashville:H1","nashville:S1"]', await rows());
ok('…chips "🏨 Hotel" and "🧓 Senior living"', await A.ev(() => /🏨 Hotel/.test(document.getElementById('gc-pj').innerText) && /🧓 Senior living/.test(document.getElementById('gc-pj').innerText)));
await A.page().selectOption('#gc-pj select[data-pj-f="state"]', 'hidden'); await sleep(400);
ok('"Not matching the filters (kept)" shows the kitchen', JSON.stringify(await rows()) === '["nashville:K1"]', await rows());
await A.page().selectOption('#gc-pj select[data-pj-f="state"]', 'new'); await sleep(300);
await A.page().click('#gc-pj [data-pj-a="filters"]'); await sleep(1000);
const fl = await A.ev(() => { const b = document.getElementById('gc-pj-set'); return b ? { text: b.innerText, uses: b.querySelectorAll('[data-pj-use]').length, min: b.querySelector('[data-pj-set="minValue"]').value, res: b.querySelector('[data-pj-inc="residentialRehab"]').checked, com: b.querySelector('[data-pj-inc="commercialNew"]').checked } : null; });
ok('⚙ Filters: "$1,000,000 and up, no residential" by default; kinds of building (hotel, hospital, senior living …) can be unticked', fl && fl.min === '1000000' && !fl.res && fl.com && fl.uses === 11 && /large commercial jobs only/.test(fl.text), fl);
await A.page().uncheck('#gc-pj-set [data-pj-use="church"]');
await shot(A, '10_filters_large_commercial', '#gc-pj-set');
await A.page().click('#gc-pj-set [data-pj-a="save"]'); await sleep(900);
const sv = SRV.calls.filter(b => b.action === 'settings-set').pop();
ok('…saving sends the kinds of building (church left out) and the $1M minimum', sv && sv.settings.uses.church === false && sv.settings.uses.hotel === true && sv.settings.minValue === 1000000, sv && sv.settings);
/* 📥 import a CSV */
await A.page().click('#gc-pj [data-pj-a="import"]'); await sleep(600);
ok('📥 Import a permit list opens (source: Shelby County (Develop 901) / MSCCE records / other)', await A.ev(() => { const b = document.getElementById('gc-pj-imp'); return !!b && [...b.querySelectorAll('[data-imp-set="source"] option')].map(o => o.textContent).join('|') === 'Shelby County (Develop 901)|MSCCE records|Other list…'; }));
const CSV = 'Shelby County Permits Export\nRecord Number,Record Type,Description,Address,City,Zip,Licensed Professional,Phone,Email,Job Value,Date Issued,Status\n'
  + 'BLDC-2026-0001,Commercial New,"New medical office, 3 floors",100 Example Pkwy,Memphis,38103,Sample General Contractors,555-010-0300,bids@samplegc.example,"$9,500,000",10/02/2026,Issued\n'
  + 'BLDR-2026-0002,Residential Alteration,Bath remodel,5 Mock St,Bartlett,38134,Example Remodel,555-010-0301,,35000,10/05/2026,Issued\n';
await A.page().setInputFiles('#gc-pj-imp [data-imp-set="file"]', { name: 'develop901_export.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) }); await sleep(800);
const mp = await A.ev(() => { const b = document.getElementById('gc-pj-imp'), o = {}; b.querySelectorAll('[data-imp-col]').forEach(s => { o[s.getAttribute('data-imp-col')] = s.value === '' ? '' : s.options[s.selectedIndex].textContent; }); return { o, text: b.innerText }; });
ok('the headings are guessed (Record Number → Permit #, Licensed Professional → Contractor, Job Value → Value, Date Issued → Date …), the title line above them skipped', mp.o.number === 'Record Number' && mp.o.type === 'Record Type' && mp.o.desc === 'Description' && mp.o.address === 'Address' && mp.o.city === 'City' && mp.o.zip === 'Zip' && mp.o.contractor === 'Licensed Professional' && mp.o.phone === 'Phone' && mp.o.email === 'Email' && mp.o.value === 'Job Value' && mp.o.date === 'Date Issued' && mp.o.status === 'Status' && /2 rows/i.test(mp.text), mp.o);
await shot(A, '11_import_mapping', '#gc-pj-imp .bx');
await A.page().click('#gc-pj-imp [data-imp="go"]'); await sleep(1500);
const ic = SRV.calls.filter(b => b.action === 'import').pop();
ok('Import → the server gets the mapped rows (permit #, contractor, phone, e-mail, value, date) for Shelby County (Develop 901)', ic && ic.source === 'shelby' && ic.rows.length === 2 && ic.rows[0].number === 'BLDC-2026-0001' && ic.rows[0].contractor === 'Sample General Contractors' && ic.rows[0].phone === '555-010-0300' && ic.rows[0].email === 'bids@samplegc.example' && ic.rows[0].value === '$9,500,000' && ic.rows[0].date === '10/02/2026' && ic.all === false, ic);
ok('…the imported permit shows in Jobs (area Memphis)', (await rows()).includes('import:shelby:BLDC-2026-0001'), await rows());
/* an Excel file (the Excel reader is stubbed: no internet in this test) */
await A.ev(() => { window.XLSX = { read: () => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }), utils: { sheet_to_json: () => [['Permit #', 'Work Class', 'Location', 'Contractor', 'Contractor Phone', 'Valuation', 'Issued'], ['M-77', 'Commercial Alteration', '7 Pretend Ave', 'Mock Builders', '555-010-0302', '1250000', '2026-10-09']] } }; });
await A.page().click('#gc-pj [data-pj-a="import"]'); await sleep(500);
await A.page().selectOption('#gc-pj-imp [data-imp-set="source"]', 'mscce');
await A.page().setInputFiles('#gc-pj-imp [data-imp-set="file"]', { name: 'mscce_reply.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK fake') }); await sleep(800);
await A.page().check('#gc-pj-imp [data-imp-set="all"]');
await A.page().click('#gc-pj-imp [data-imp="go"]'); await sleep(1200);
const ix = SRV.calls.filter(b => b.action === 'import').pop();
ok('an Excel file (MSCCE records, "import everything"): Location → Address, Contractor Phone → Phone, Valuation → Value', ix && ix.source === 'mscce' && ix.all === true && ix.rows[0].number === 'M-77' && ix.rows[0].address === '7 Pretend Ave' && ix.rows[0].phone === '555-010-0302' && ix.rows[0].value === '1250000' && ix.rows[0].type === 'Commercial Alteration', ix);
/* 🔧 Owner setup → 📧 MSCCE request */
for (let i = 0; i < 8; i++) { await A.ev(() => window._setView('todo')); await sleep(2500); await A.ev(() => { try { window._gcOwnerSetup.refresh(true); window._gcOwnerSetup.paint(); } catch (e) {} }); await sleep(1500); if (await A.ev(() => !!document.getElementById('gc-ot'))) break; }
const ot = await A.ev(() => { const d = document.getElementById('gc-ot'); if (!d) return null; d.open = true; return { text: d.innerText, btn: !!d.querySelector('[data-ot-open="mscce_request"]'), dodge: !!d.querySelector('[data-ot-open="dodge"]') }; });
ok('🔧 Owner setup: "Shelby County permits: the monthly MSCCE records request" (901-222-8300) with Open settings; "Look into Dodge (paid)"', ot && /monthly MSCCE records request/.test(ot.text) && /901-222-8300/.test(ot.text) && ot.btn && /Look into Dodge \(paid\) — get pricing \/ API access/.test(ot.text) && ot.dodge, ot && Object.assign({}, ot, { text: '' }));
await A.page().click('#gc-ot [data-ot-open="mscce_request"]'); await sleep(1200);
const ms = await A.ev(() => { const b = document.getElementById('gc-mscce'); return b ? { text: b.innerText, to: b.querySelector('[data-ms-set="to"]').value, on: b.querySelector('[data-ms-set="on"]').checked, send: b.querySelector('[data-ms="send"]').disabled, from: b.querySelector('[data-ms-set="from"]').value } : null; });
ok('the MSCCE card: off, NO records address (call 901-222-8300), From office@, the e-mail text, Send now disabled', ms && !ms.on && ms.to === '' && /901-222-8300/.test(ms.text) && /office@grayco-cs\.com/.test(ms.from) && /Public records request/.test(ms.text) && /10-7-503/.test(ms.text) && ms.send, ms && Object.assign({}, ms, { text: ms.text.slice(0, 200) }));
await shot(A, '12_mscce_request_off', '#gc-mscce .bx');
await A.page().fill('#gc-mscce [data-ms-set="to"]', 'records@example.gov');
await A.page().check('#gc-mscce [data-ms-set="on"]');
await A.page().click('#gc-mscce [data-ms="save"]'); await sleep(900);
ok('Save → the address and "monthly: on" go to the server', SRV.mscce.to === 'records@example.gov' && SRV.mscce.on === true && await A.ev(() => /Monthly: on/.test(document.querySelector('#gc-mscce [data-ms-pill]').textContent)));
await A.page().click('#gc-mscce [data-ms="send"]'); await sleep(1500);
ok('📤 Send now (after a confirm) → mscce-send with confirm; "✅ sent" shows', SRV.calls.some(b => b.action === 'mscce-send' && b.confirm === true) && await A.ev(() => /✅ sent/.test(document.getElementById('gc-mscce').innerText)));
await shot(A, '13_mscce_request_sent', '#gc-mscce .bx');
await A.ev(() => document.getElementById('gc-mscce').remove());
/* ⚙ Admin settings → Integrations: Dodge next to Shovels */
const sec = await A.ev(() => { const s = (window._gcAdm && window._gcAdm.sections()) || []; const i = s.find(x => x.id === 'integrations'); return i ? i.rows.map(r => r.t) : null; });
const di = sec ? sec.findIndex(t => /Dodge/.test(t)) : -1, si = sec ? sec.findIndex(t => /Shovels/.test(t)) : -1;
ok('⚙ Admin settings → Integrations: "🏗️ Dodge Construction Network — Off · for later (paid)" next to Shovels', di > -1 && si === di + 1 && sec[di] === '🏗️ Dodge Construction Network — Off · for later (paid)', sec);
await A.ev(() => window._gcDodgeOpen()); await sleep(900);
const dg = await A.ev(() => { const b = document.getElementById('gc-dodge'); return b ? b.innerText : ''; });
ok('the Dodge card: off · for later (paid), project leads before permits, bid dates, plan rooms, DODGE_API_KEY', /Off · for later \(paid\)/.test(dg) && /project leads before the permit/.test(dg) && /bid dates/.test(dg) && /plan rooms/.test(dg) && /DODGE_API_KEY/.test(dg), dg.slice(0, 300));
await shot(A, '14_dodge_integration', '#gc-dodge .bx');
await A.ev(() => document.getElementById('gc-dodge').remove());
{ const wrote = [...new Set(A.posts(T0).flatMap(p => p.keys || []))];
  ok('no alerts from any of this: nothing written to the To-Do, Approvals, alerts or the Lead Inbox from the page', !wrote.some(k => /todo|approv|alert|inbox|notif|push|mail|sms/i.test(k)), wrote); }
ok('no page errors (admin)', !errs.length, errs);
try { await A.b.close(); } catch (e) {}
/* 📌 pin an integration to MY menu (an estimator: RoofScout is not in the estimator's menu; QuickBooks is not allowed) */
const B = await computer('sbiffle@grayco-cs.com', { build: process.argv[2] });
await rig(B);
const errsB = []; B.page().on('pageerror', e => errsB.push(String(e.message).slice(0, 200)));
await signIn(B, 'sbiffle@grayco-cs.com', 15000); await sleep(5000);
const menuHas = label => B.ev(l => [...document.querySelectorAll('button[draggable]')].some(b => b.textContent.trim().endsWith(l)), label);
ok('estimator: RoofScout is not in the menu yet; QuickBooks may not be pinned', !(await menuHas('RoofScout')) && await B.ev(() => !window._gcNavPins.allowed('qbimport') && window._gcNavPins.allowed('roofscout')));
await B.ev(() => window._setView('qbimport')); await sleep(2500);
ok('…on QuickBooks (not for this role) there is no 📌 chip', await B.ev(() => { const c = document.getElementById('gc-pin-chip'); return !c || c.style.display === 'none'; }));
await B.ev(() => window._setView('roofscout')); await sleep(2500);
const ch = await B.ev(() => { const c = document.getElementById('gc-pin-chip'); return c && c.style.display !== 'none' ? c.innerText : ''; });
ok('on RoofScout: "📌 Add to my tabs"', /Add to my tabs/.test(ch), ch);
await shot(B, '15_pin_chip', '#gc-pin-chip');
await B.ev(() => document.querySelector('#gc-pin-chip button').click()); await sleep(2500);
ok('pinned → RoofScout is a tab in MY left menu; the chip says "In my tabs · Unpin"', await menuHas('RoofScout') && await B.ev(() => /In my tabs · Unpin/.test(document.getElementById('gc-pin-chip').innerText) && localStorage.getItem('grayco_view') === 'roofscout'));
await sleep(1500);
const cp = cget('gc_navpins__sbiffle@grayco-cs.com');
ok('…saved per person (gc_kv "gc_navpins__<e-mail>", synced)', cp && Array.isArray(cp.pins) && cp.pins.includes('roofscout'), cp);
await shot(B, '16_pinned_menu');
await B.ev(() => document.querySelector('#gc-pin-chip button').click()); await sleep(2500);
ok('Unpin → it leaves my menu', !(await menuHas('RoofScout')) && (cget('gc_navpins__sbiffle@grayco-cs.com') || {}).pins.length === 0);
ok('no page errors (estimator)', !errsB.length, errsB);
try { await B.b.close(); } catch (e) {}
/* the admin's menu is not touched by the estimator's pins */
const n = R.filter(Boolean).length; console.log('PERMITS2_ui ' + n + '/' + R.length);
process.exit(n === R.length ? 0 : 1);
