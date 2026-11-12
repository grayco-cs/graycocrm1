// test_PERMITS_ui.mjs <build-dir> — patch PERMITS: the 🏗️ Permitted jobs tab in the browser. Offline harness; every permit, company,
// phone and address below is MADE UP. PERMITS_SHOTS=<dir> also saves screenshots there.
import { computer, signIn, sleep, cset, cget, resetCloud, cloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 400))); };
const SHOTS = process.env.PERMITS_SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (c, name, sel) => { if (!SHOTS) return; const p = c.page(); const f = SHOTS + '/' + name + '.png'; if (sel) { const el = await p.$(sel); if (el) { await el.screenshot({ path: f }); return; } } await p.screenshot({ path: f }); };
resetCloud();
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('leads', [{ id: 'L0', name: 'Existing Demo Lead', company: 'Existing Demo Lead', type: 'Residential', status: 'new', updatedAt: now }]);
const NASH = { src: 'nashville', area: 'Nashville', areaLong: 'Nashville / Davidson Co., TN', city: 'Nashville', usState: 'TN', zip: '37000' };
const SRV = { items: [
  Object.assign({}, NASH, { key: 'nashville:T2026000901', id: 'T2026000901', number: 'T2026000901', type: 'Building Commercial - Fire Damage', subtype: 'Restaurant (Full Service)', desc: 'Repair fire damage to kitchen and dining room', value: 9000, issued: day(1), address: '2 Demo Ave', contractor: 'Example Builders LLC', link: 'https://example.invalid/permit/T2026000901', reasons: ['🔥 fire/smoke words'], hint: 'mitigation', bucket: 'commercialRehab', state: 'new', firstSeen: now }),
  Object.assign({}, NASH, { key: 'nashville:T2026000902', id: 'T2026000902', number: 'T2026000902', type: 'Building Commercial - Rehab', subtype: 'General Office, Professional Services', desc: 'Interior renovation of 2nd floor offices', value: 480000, issued: day(2), address: '1 Sample Plaza', contractor: 'Example Builders LLC', reasons: ['Commercial rehab $480k'], hint: 'construction', bucket: 'commercialRehab', state: 'new', firstSeen: now }),
  Object.assign({}, NASH, { key: 'nashville:T2026000903', id: 'T2026000903', number: 'T2026000903', type: 'Building Demolition Permit', subtype: 'Demolition Permit - Commercial', desc: 'Demolish existing one story commercial building', value: 20000, issued: day(3), address: '20 Pretend Blvd', contractor: 'Mock Wrecking Co', reasons: ['Demolition — pre-1978? (Environmental)'], hint: 'environmental', bucket: 'demolition', state: 'new', firstSeen: now }),
  Object.assign({}, NASH, { key: 'nashville:T2026000800', id: 'T2026000800', number: 'T2026000800', type: 'Building Residential - Rehab', desc: 'Kitchen remodel', value: 60000, issued: day(9), address: '9 Old Test Rd', contractor: 'Example Remodelers', reasons: ['Residential remodel $60k'], hint: 'construction', bucket: 'residentialRehab', state: 'new', firstSeen: now })
], status: { nashville: { on: true, ok: true, lastRun: now, read: 412, matched: 4, added: 3, error: '' }, shovels: { active: false, configured: true, off: true, note: 'Off · for later (⚙ Admin settings → Integrations → 🏗️ Shovels).' } },
  settings: { v: 1, include: { commercialNew: true, commercialRehab: true, multifamily: true, residentialRehab: true, demolition: true, roofing: true, repair: true, residentialNew: false }, exclude: ['sign', 'fence', 'pool'], minValue: 25000, maxAgeDays: 14, nashville: { on: true }, shovels: { on: false, auto: false, zips: ['38117', '38671', '72201'], tags: ['-solar', '-pool_and_hot_tub', '-hvac', '-water_heater'], q: '', minJobValue: 0, windowDays: 14, perRun: 25, budget: 500 } },
  calls: [] };
const SHV1 = { key: 'shovels:SHV1', src: 'shovels', area: 'Southaven, MS', areaLong: 'DeSoto Co., MS (Southaven, Olive Branch, Horn Lake, Hernando)', id: 'SHV1', number: 'BLD-1001', type: 'Demolition', desc: 'Demolition of existing commercial building', value: 20000, issued: day(3), address: '40 Pretend Blvd', city: 'Southaven', usState: 'MS', zip: '38600',
    contractor: '', contractorId: 'C9',
    owner: 'Sample Owner Trust', yearBuilt: 1965, propertyType: 'commercial', reasons: ['Demolition — built 1965 (Environmental)'], hint: 'environmental', bucket: 'demolition', state: 'new', firstSeen: now };
const ZIPG = [['Memphis / Shelby Co., TN', ['38103', '38117'], true], ['DeSoto Co., MS (Southaven, Olive Branch, Horn Lake, Hernando)', ['38671', '38654'], true], ['Little Rock / North Little Rock, AR (Pulaski Co.)', ['72201'], true], ['Nashville / Davidson Co., TN — free from Metro already', ['37201'], false]];
const TAGS = [['new_construction', 'New construction'], ['roofing', 'Roofing'], ['solar', 'Solar'], ['hvac', 'HVAC'], ['water_heater', 'Water heater'], ['pool_and_hot_tub', 'Pool / hot tub']];
const INCLUDE = [['commercialNew', 'Commercial — new buildings'], ['commercialRehab', 'Commercial — rehab / remodel / tenant finish'], ['multifamily', 'Multifamily (apartments, condos, townhomes)'], ['residentialRehab', 'Residential — rehab / remodel / addition'], ['demolition', 'Demolition (asbestos survey → Environmental)'], ['roofing', 'Roofing'], ['repair', 'Fire / water / storm / mold / asbestos / repair words (any value)'], ['residentialNew', 'Residential — new houses']];
function answer(b){
  SRV.calls.push(b);
  if (b.action === 'list') return { ok: true, items: SRV.items, status: SRV.status, settings: SRV.settings, active: { nashville: true, shovels: !!SRV.settings.shovels.on }, shovelsConfigured: true, admin: true };
  if (b.action === 'run') { SRV.status.nashville.lastRun = new Date().toISOString(); SRV.status.nashville.added = 0; return { ok: true, status: SRV.status, added: { nashville: 0, shovels: 0 } }; }
  if (b.action === 'settings-get') return { ok: true, settings: SRV.settings, defaults: SRV.settings, include: INCLUDE, zipGroups: ZIPG, tags: TAGS, admin: true, shovelsConfigured: true };
  if (b.action === 'settings-set') { SRV.settings = Object.assign({}, SRV.settings, b.settings, { shovels: Object.assign({}, SRV.settings.shovels, b.settings.shovels || {}) }); if (SRV.settings.shovels.on) SRV.status.shovels = { active: true, configured: true, manualOnly: true, spent30: 0, budget: SRV.settings.shovels.budget, note: 'Pulls are manual.' }; return { ok: true, settings: SRV.settings }; }
  if (b.action === 'shovels-preview') return { ok: true, configured: true, maxCredits: Math.min(SRV.settings.shovels.perRun, 500), perRun: SRV.settings.shovels.perRun, budget: SRV.settings.shovels.budget, spent30: 0, left: SRV.settings.shovels.budget, usage: null, zips: SRV.settings.shovels.zips.slice(0, 3).map(z => ({ zip: z, from: day(14), to: day(0) })), upToDate: 0, search: { tags: SRV.settings.shovels.tags, q: '', minJobValue: 0 } };
  if (b.action === 'shovels-pull') { if (b.confirm !== true) return { ok: false, error: 'confirm' }; if (!SRV.items.some(x => x.key === SHV1.key)) SRV.items.unshift(Object.assign({}, SHV1)); SRV.status.shovels = { active: true, configured: true, ok: true, lastRun: new Date().toISOString(), lastPull: new Date().toISOString(), read: 6, matched: 1, spentRun: 6, spent30: 6, budget: 500, left: 494, added: 1, manualOnly: true }; return { ok: true, status: SRV.status, added: { shovels: 1 } }; }
  if (b.action === 'contractor-lookup') { const c = { name: 'Mock Wrecking Co', phone: '(555) 010-0199', email: 'office@mockwrecking.example', website: 'mockwrecking.example', license: 'MS-00000', address: '5 Nowhere Rd Southaven MS 38600' }; SRV.items.forEach(x => { if (x.contractorId === b.contractorId) Object.assign(x, { contractor: c.name, contractorPhone: c.phone, contractorEmail: c.email, contractorWebsite: c.website, contractorLicense: c.license, contractorAddress: c.address, contractorLooked: true }); }); return { ok: true, contractor: c, spent: 1, permits: 1 }; }
  if (b.action === 'set-state') { const x = SRV.items.find(y => y.key === b.id); if (!x) return { ok: false, error: 'gone' }; x.state = b.state; x.leadId = b.leadId || undefined; x.stateBy = 'Wesley Johnson'; x.stateAt = new Date().toISOString(); return { ok: true, item: x }; }
  return { ok: false, error: 'Bad request' };
}
const FN_CALLS = [];
async function rig(c){
  await c.ctx.route(u => /\/\.netlify\/functions\//.test(u), r => { const u = new URL(r.request().url()); FN_CALLS.push({ who: c.name, fn: u.pathname.split('/').pop(), t: Date.now() }); return r.fallback(); });
  await c.ctx.route(u => /\/\.netlify\/functions\/permit-watch/.test(u), r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {} FN_CALLS.push({ who: c.name, fn: 'permit-watch', t: Date.now() }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(b)) }); });
  await c.ctx.route(u => /\/\.netlify\/functions\/owner-setup/.test(u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, checks: { shovels_key: false, gdrive: true } }) }));
}
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
await rig(A);
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
const rows = () => A.ev(() => [...document.querySelectorAll('#gc-pj tbody tr')].map(r => r.getAttribute('data-k') || r.getAttribute('data-who')));
const menuBtn = await A.ev(() => [...document.querySelectorAll('button')].filter(e => /Permitted jobs/.test(e.textContent || '') && (e.textContent || '').length < 40).map(e => e.textContent.trim()));
ok('the left menu has its own "🏗️ Permitted jobs" tab (admin), with no count / badge on it', menuBtn.length >= 1 && menuBtn.every(t => /^🏗️\s*Permitted jobs$/.test(t)), menuBtn);
const order = await A.ev(() => { const t = [...document.querySelectorAll('button')].filter(e => (e.textContent || '').length < 40).map(e => e.textContent.trim()); const i = t.findIndex(x => /Permitted jobs$/.test(x)); return t.slice(Math.max(0, i - 1), i + 1); });
ok('…right after 📈 Leads', /Leads/.test(order[0] || ''), order);
const t0 = Date.now(); const keys0 = new Set(cloud.keys());
await A.ev(() => { const b = [...document.querySelectorAll('button')].find(e => /Permitted jobs$/.test((e.textContent || '').trim()) && (e.textContent || '').length < 40); b.click(); }); await sleep(2500);   /* the menu button (a desk card can sit over it in the 1400px window) */
const p1 = await A.ev(() => { const el = document.getElementById('gc-pj'); return el ? { view: localStorage.getItem('grayco_view'), rows: el.querySelectorAll('tbody tr').length, text: el.innerText, src: [...el.querySelectorAll('[data-pj-src]')].map(x => x.innerText), more: (el.querySelector('[data-pj-more]') || {}).innerText || '', btns: [...el.querySelectorAll('button')].map(b => b.textContent.trim()) } : null; });
ok('the tab opens its own view (permitjobs) with the 4 new Nashville permits', p1 && p1.view === 'permitjobs' && p1.rows === 4, p1 && { view: p1.view, rows: p1.rows });
ok('Jobs: date, area, type, address, value, who pulled it, description, reasons, company fit', p1 && /Example Builders LLC/.test(p1.text) && /\$480,000/.test(p1.text) && /🔥 fire\/smoke words/.test(p1.text) && /Mitigation/.test(p1.text) && /Environmental/.test(p1.text) && /Mock Wrecking Co/.test(p1.text) && /Interior renovation/.test(p1.text) && /20 Pretend Blvd, Nashville, TN 37000/.test(p1.text));
ok('status: Nashville only (✅ 412 read · 4 matched); no Shovels line or button while Shovels is off', p1 && p1.src.length === 1 && /✅ last run/.test(p1.src[0]) && /412 read/.test(p1.src[0]) && /4 matched/.test(p1.src[0]) && !/Shovels/.test(p1.text) && !p1.btns.some(b => /Shovels|Pull/.test(b)), p1 && { src: p1.src, btns: p1.btns });
ok('…the note: "More areas: Memphis / Shelby, DeSoto and Little Rock have no free permit feed — available later through … Integrations"', p1 && /More areas: Memphis \/ Shelby, DeSoto and Little Rock have no free permit feed/.test(p1.more) && /Integrations/.test(p1.more), p1 && p1.more);
await shot(A, '1_permitted_jobs', '#gc-pj');
/* filters */
await A.page().selectOption('#gc-pj select[data-pj-f="co"]', 'environmental'); await sleep(400);
ok('company-fit filter: Environmental → only the demolition', JSON.stringify(await rows()) === '["nashville:T2026000903"]', await rows());
await A.page().selectOption('#gc-pj select[data-pj-f="co"]', ''); await A.page().fill('#gc-pj input[data-pj-f="min"]', '100000'); await sleep(400);
ok('min value $100,000 → only the $480k rehab', JSON.stringify(await rows()) === '["nashville:T2026000902"]', await rows());
await A.page().fill('#gc-pj input[data-pj-f="min"]', ''); await A.page().selectOption('#gc-pj select[data-pj-f="reason"]', 'fire'); await sleep(400);
ok('reason filter 🔥 → only the fire damage', JSON.stringify(await rows()) === '["nashville:T2026000901"]', await rows());
await A.page().selectOption('#gc-pj select[data-pj-f="reason"]', ''); await A.page().fill('#gc-pj input[data-pj-f="q"]', 'wrecking'); await sleep(400);
ok('search finds the company that pulled it', JSON.stringify(await rows()) === '["nashville:T2026000903"]', await rows());
await A.page().fill('#gc-pj input[data-pj-f="q"]', ''); await A.page().selectOption('#gc-pj select[data-pj-f="sort"]', 'value'); await sleep(400);
ok('sort: biggest value first', (await rows())[0] === 'nashville:T2026000902');
await A.page().selectOption('#gc-pj select[data-pj-f="sort"]', 'new'); await sleep(300);
/* the detail sheet */
await A.page().click('#gc-pj tr[data-k="nashville:T2026000903"] td:nth-child(3)'); await sleep(800);
const sh = await A.ev(() => { const s = document.getElementById('gc-pj-sheet'); return s ? { text: s.innerText, look: !!s.querySelector('a[href*="google.com/search"]'), credit: /credit/.test(s.innerText), map: !!s.querySelector('a[href*="google.com/maps/search/?api=1&query=20%20Pretend%20Blvd"]'), link: !!s.querySelector('a[href^="https://services2.arcgis.com"],a[href^="https://example.invalid"]') } : null; });
ok('a row opens the detail sheet: who pulled it (Mock Wrecking Co) with 🔎 Look up their phone (no paid button)', sh && /Who pulled it/i.test(sh.text) && /Mock Wrecking Co/.test(sh.text) && sh.look && !sh.credit, sh);
ok('…the permit (#, type, description, value, issued) and the map link', sh && /T2026000903/.test(sh.text) && /Building Demolition Permit/.test(sh.text) && /Demolish existing one story commercial building/.test(sh.text) && /\$20,000/.test(sh.text) && sh.map, sh && sh.text.slice(0, 300));
await shot(A, '2_detail_sheet', '#gc-pj-sheet .bx');
/* ➕ Make it a lead (from the sheet) */
await A.page().click('#gc-pj-sheet [data-pj-a="lead"]'); await sleep(2500);
const lE = await A.ev(() => { const l = (window._crm.leads || []).find(x => x.permitKey === 'nashville:T2026000903'); return l ? { id: l.id, companyId: l.companyId, type: l.type, source: l.source, note: l.note, state: l.state, co: window._gcCo ? window._gcCo.ofLead(l) : '' } : null; });
ok('➕ Make it a lead → an 🌿 Environmental lead, source "Building permit — Nashville", TN on the lead', lE && /^LPMT_/.test(lE.id) && lE.companyId === 'environmental' && lE.co === 'environmental' && lE.type === 'Environmental' && lE.source === 'Building permit — Nashville' && lE.state === 'TN', lE);
ok('…the contractor and the permit # are in the notes', lE && /Contractor on the permit: Mock Wrecking Co/.test(lE.note) && /Permit #T2026000903/.test(lE.note), lE && lE.note);
ok('…the server was told (set-state lead + the lead id); the sheet says ✓ Made a lead', SRV.calls.some(b => b.action === 'set-state' && b.id === 'nashville:T2026000903' && b.state === 'lead' && b.leadId === (lE && lE.id)) && await A.ev(() => /Made a lead/.test(document.getElementById('gc-pj-sheet').innerText)));
await A.page().click('#gc-pj-sheet [data-pj-a="sheetclose"]'); await sleep(400);
await A.ev(() => { const r = document.querySelector('#gc-pj tr[data-k="nashville:T2026000901"] [data-pj-a="lead"]'); r && r.click(); }); await sleep(2500);
const ld = await A.ev(() => { const l = (window._crm.leads || []).find(x => x.permitKey === 'nashville:T2026000901'); return l ? { id: l.id, source: l.source, companyId: l.companyId, type: l.type, note: l.note, address: l.address } : null; });
ok('➕ Lead in the row → 💧 Mitigation, Restoration – Fire, contractor + permit link in the notes', ld && ld.source === 'Building permit — Nashville' && ld.companyId === 'mitigation' && ld.type === 'Restoration – Fire' && ld.address === '2 Demo Ave' && /Contractor on the permit: Example Builders LLC/.test(ld.note) && /example\.invalid\/permit/.test(ld.note), ld);
await A.ev(() => { const r = document.querySelector('#gc-pj tr[data-k="nashville:T2026000902"] [data-pj-a="lead"]'); r && r.click(); }); await sleep(2000);
const ld3 = await A.ev(() => { const l = (window._crm.leads || []).find(x => x.permitKey === 'nashville:T2026000902'); return l ? { companyId: l.companyId, type: l.type, co: window._gcCo ? window._gcCo.ofLead(l) : '' } : null; });
ok('a commercial rehab (Construction fit) → a Commercial lead with no companyId (Construction)', ld3 && !ld3.companyId && ld3.type === 'Commercial' && ld3.co === 'construction', ld3);
await A.ev(k => window._gcPermitJobs.makeLead(k), 'nashville:T2026000901'); await sleep(800);
ok('pressing it twice never makes a second lead', await A.ev(() => (window._crm.leads || []).filter(x => x.permitKey === 'nashville:T2026000901').length === 1));
await sleep(2500);
ok('the manual-save window closes again', await A.ev(() => window.__GC_MANUAL_SAVE__ !== true));
const cl = cget('leads');
ok('the leads reached the cloud (gc_kv leads), the old lead kept', Array.isArray(cl) && cl.some(x => x.id === (ld && ld.id) && x.companyId === 'mitigation') && cl.some(x => x.permitKey === 'nashville:T2026000903') && cl.some(x => x.id === 'L0'), Array.isArray(cl) ? cl.map(x => x.id) : cl);
/* Dismiss */
await A.page().click('#gc-pj tr[data-k="nashville:T2026000800"] td:nth-child(3)'); await sleep(600);
await A.page().click('#gc-pj-sheet [data-pj-a="dismiss"]'); await sleep(1000);
ok('Dismiss: the server is told and it leaves the New list', SRV.calls.some(b => b.action === 'set-state' && b.id === 'nashville:T2026000800' && b.state === 'dismissed') && !(await rows()).includes('nashville:T2026000800'));
await A.page().click('#gc-pj-sheet [data-pj-a="sheetclose"]').catch(() => {}); await sleep(300);
await A.page().selectOption('#gc-pj select[data-pj-f="state"]', 'all'); await sleep(400);
ok('…still under "All", dimmed', await A.ev(() => { const r = document.querySelector('#gc-pj tr[data-k="nashville:T2026000800"]'); return !!r && r.classList.contains('dis'); }));
/* Companies */
await A.page().click('#gc-pj [data-pj-v="companies"]'); await sleep(600);
const co = await A.ev(() => [...document.querySelectorAll('#gc-pj tbody tr[data-who]')].map(r => ({ who: r.getAttribute('data-who'), cells: [...r.children].map(td => td.innerText.trim()), look: !!r.querySelector('a[href*="google.com/search"]') })));
const eb = co.find(c => /Example Builders/.test(c.cells[0]));
ok('Companies: who pulls the permits — Example Builders LLC first: 2 permits, $489,000, 🔎 Look up for the phone', co.length === 3 && eb && eb.cells[4] === '2' && eb.cells[5] === '$489,000' && eb.look && co[0] === eb, co.map(c => c.cells.slice(0, 6)));
await shot(A, '3_companies', '#gc-pj');
await A.page().click('#gc-pj tr[data-who] td:nth-child(5)'); await sleep(600);
ok('a company row → its permits (Jobs, "Pulled by: Example Builders LLC")', await A.ev(() => { const r = [...document.querySelectorAll('#gc-pj tbody tr')]; return window._gcPermitJobs.state().v === 'jobs' && r.length === 2 && r.every(x => /Example Builders LLC/.test(x.innerText)) && /Pulled by: Example Builders LLC/.test(document.getElementById('gc-pj').innerText); }));
await A.page().click('#gc-pj [data-pj-a="nowho"]'); await sleep(300);
/* ↻ Run now and ⚙ Filters */
await A.page().click('#gc-pj [data-pj-a="run"]'); await sleep(1200);
ok('↻ Run now calls the server', SRV.calls.some(b => b.action === 'run'));
await A.page().click('#gc-pj [data-pj-a="filters"]'); await sleep(1000);
const setv = await A.ev(() => { const b = document.getElementById('gc-pj-set'); return b ? { inc: b.querySelectorAll('[data-pj-inc]').length, min: b.querySelector('[data-pj-set="minValue"]').value, shovels: /Shovels/.test(b.innerText) || !!b.querySelector('[data-pj-set="zips"]') } : null; });
ok('⚙ Filters (admin): the kinds of permit and the minimum value — no Shovels settings here', setv && setv.inc === 8 && setv.min === '25000' && !setv.shovels, setv);
await A.page().fill('#gc-pj-set [data-pj-set="minValue"]', '40000');
await A.page().check('#gc-pj-set [data-pj-inc="residentialNew"]');
await shot(A, '4_filters', '#gc-pj-set');
await A.page().click('#gc-pj-set [data-pj-a="save"]'); await sleep(1000);
const ss = SRV.calls.filter(b => b.action === 'settings-set').pop();
ok('Save filters sends the new minimum and kinds (and nothing of Shovels)', ss && ss.settings.minValue === 40000 && ss.settings.include.residentialNew === true && ss.settings.include.commercialRehab === true && !ss.settings.shovels, ss && ss.settings);
/* NO ALERTS */
const fnUsed = [...new Set(FN_CALLS.filter(x => x.t >= t0).map(x => x.fn))];
ok('no alerts: while using the tab no mail / push / text / inbox / approvals function was called', !fnUsed.some(f => /mail|push|sms|text|notify|alert|bid-inbox|approv|comms|resend|twilio/i.test(f)) && fnUsed.includes('permit-watch'), fnUsed);
const newKeys = [...cloud.keys()].filter(k => !keys0.has(k));
const wrote = [...new Set(A.posts(t0).flatMap(p => p.keys || []))];
ok('no alerts: nothing written to the To-Do, Approvals, alerts or the Lead Inbox — only the leads a person made', !wrote.concat(newKeys).some(k => /todo|approv|alert|inbox|notif|push|mail|sms/i.test(k)) && wrote.includes('leads'), { wrote, newKeys });
ok('Shovels was never asked while it is off', !SRV.calls.some(b => /^shovels-|contractor-lookup|zip-search/.test(b.action)));
/* ⚙ Admin settings → Integrations → 🏗️ Shovels — Off · for later */
const sec = await A.ev(() => { const s = (window._gcAdm && window._gcAdm.sections()) || []; const i = s.find(x => x.id === 'integrations'); return i ? i.rows.filter(r => /Shovels/.test(r.t)) : null; });
ok('⚙ Admin settings → Integrations lists "🏗️ Shovels (building permits API) — Off · for later" (opens its card)', sec && sec.length === 1 && sec[0].t === '🏗️ Shovels (building permits API) — Off · for later' && sec[0].have === true, sec);
await A.ev(() => window._gcShovelsOpen()); await sleep(1500);
const m1 = await A.ev(() => { const b = document.getElementById('gc-shv'); return b ? { text: b.innerText, pill: (b.querySelector('[data-shv-pill]') || {}).textContent, on: b.querySelector('[data-shv-set="on"]').checked, auto: b.querySelector('[data-shv-set="auto"]').checked, budget: b.querySelector('[data-shv-set="budget"]').value, per: b.querySelector('[data-shv-set="perRun"]').value, groups: b.querySelectorAll('[data-shv-grp]').length, pull: b.querySelector('[data-shv="pull"]').disabled, est: b.querySelector('[data-shv="estimate"]').disabled } : null; });
ok('the Shovels card: "Off · for later", switch off, daily pull off, budget 500, 25 per pull, the county ZIP list, Pull disabled', m1 && m1.pill === 'Off · for later' && !m1.on && !m1.auto && m1.budget === '500' && m1.per === '25' && m1.groups === 4 && m1.pull && m1.est && /500 credits per 30 days/.test(m1.text), m1 && Object.assign({}, m1, { text: '' }));
await shot(A, '7_integrations_shovels_off', '#gc-shv .bx');
await A.page().check('#gc-shv [data-shv-set="on"]');
await A.page().fill('#gc-shv [data-shv-set="perRun"]', '20');
await A.page().selectOption('#gc-shv [data-shv-tag="roofing"]', 'in');
await A.page().click('#gc-shv [data-shv="save"]'); await sleep(1200);
const s2 = SRV.calls.filter(b => b.action === 'settings-set').pop();
ok('switch on + Save → only the Shovels part is sent: on, manual, budget 500, 20 per pull, ZIPs from the picked counties, tags', s2 && s2.settings.shovels && s2.settings.shovels.on === true && s2.settings.shovels.auto === false && s2.settings.shovels.budget === 500 && s2.settings.shovels.perRun === 20 && s2.settings.shovels.zips.join() === '38117,38671,72201' && s2.settings.shovels.tags.join() === 'roofing,-solar,-hvac,-water_heater,-pool_and_hot_tub' && !('include' in s2.settings), s2 && s2.settings);
await A.page().click('#gc-shv [data-shv="estimate"]'); await sleep(1000);
const est = await A.ev(() => ({ t: (document.querySelector('#gc-shv [data-shv-est]') || {}).innerText || '', pull: document.querySelector('#gc-shv [data-shv="pull"]').disabled }));
ok('Estimate (free) → "uses at most 20 credits", the ZIPs and dates; Pull now becomes available', /at most 20 credits/.test(est.t) && /38117/.test(est.t) && !est.pull && SRV.calls.some(b => b.action === 'shovels-preview'), est);
await shot(A, '8_integrations_shovels_on_estimate', '#gc-shv .bx');
await A.page().click('#gc-shv [data-shv="pull"]'); await sleep(2500);
ok('🔌 Pull from Shovels now (after a confirm) → the server pull with confirm', SRV.calls.some(b => b.action === 'shovels-pull' && b.confirm === true));
await A.page().click('#gc-shv [data-shv="close"]'); await sleep(800);
const p2 = await A.ev(() => { const el = document.getElementById('gc-pj'); return { src: [...el.querySelectorAll('[data-pj-src]')].map(x => x.innerText), btn: [...el.querySelectorAll('button')].some(b => /Shovels/.test(b.textContent)), more: !!el.querySelector('[data-pj-more]'), rows: [...el.querySelectorAll('tbody tr')].map(r => r.getAttribute('data-k')) }; });
ok('switched on: the tab shows the Shovels status line and a 🔌 Shovels… button; the pulled permit is listed', p2.src.length === 2 && /Shovels/.test(p2.src[1]) && /6 read/.test(p2.src[1]) && p2.btn && !p2.more && p2.rows.includes('shovels:SHV1'), p2);
await A.page().click('#gc-pj tr[data-k="shovels:SHV1"] td:nth-child(3)'); await sleep(800);
ok('the Shovels permit\'s sheet offers "📇 Get phone / e-mail (1 credit)" (asked only when pressed)', await A.ev(() => !!document.querySelector('#gc-pj-sheet [data-pj-a="lookup"][data-cid="C9"]')) && !SRV.calls.some(b => b.action === 'contractor-lookup'));
await A.page().click('#gc-pj-sheet [data-pj-a="lookup"]'); await sleep(1200);
const sh2 = await A.ev(() => { const s = document.getElementById('gc-pj-sheet'); return { tel: [...s.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute('href')), mail: [...s.querySelectorAll('a[href^="mailto:"]')].map(a => a.getAttribute('href')), text: s.innerText, btn: !!s.querySelector('[data-pj-a="lookup"]') }; });
ok('…pressed: one contractor-lookup; the sheet shows 📞 call, ✉ e-mail, license, the owner of record', SRV.calls.filter(b => b.action === 'contractor-lookup' && b.contractorId === 'C9').length === 1 && sh2.tel.includes('tel:5550100199') && sh2.mail.includes('mailto:office@mockwrecking.example') && /MS-00000/.test(sh2.text) && /Sample Owner Trust/.test(sh2.text) && !sh2.btn, sh2);
await shot(A, '9_shovels_permit_sheet', '#gc-pj-sheet .bx');
await A.page().click('#gc-pj-sheet [data-pj-a="sheetclose"]'); await sleep(300);
/* the made lead in Leads */
if (SHOTS) {
  await A.ev(() => window._setView('leads')); await sleep(3500);
  await A.ev(id => { try { window._gcLeadsHub.open(id); } catch (e) {} }, ld && ld.id); await sleep(2000);
  const dr = await A.page().$('#gcl-drawer'); if (dr) await dr.screenshot({ path: SHOTS + '/5_made_lead.png' }); else await A.page().screenshot({ path: SHOTS + '/5_made_lead.png' });
  await A.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} }); await sleep(600);
}
/* 🔧 Owner setup */
await A.ev(() => window._setView('todo')); await sleep(4000);
await A.ev(() => { try { window._gcOwnerSetup.refresh(true); } catch (e) {} }); await sleep(2500);
const ot = await A.ev(() => { const d = document.getElementById('gc-ot'); if (!d) return null; d.open = true; return d.innerText; });
const og = await A.ev(() => { const O = window._gcOwnerSetup; const g = id => (O.items.find(i => i.id === id) || {}).g; return { sh: g('permits_shovels'), f: g('permits_filters'), d: g('gdrive') }; });
ok('🔧 Owner setup: "Optional, later: Shovels permit data for Memphis / DeSoto / Little Rock" under When you can, pointing at Integrations → Shovels', ot && /Optional, later: Shovels permit data for Memphis \/ DeSoto \/ Little Rock/.test(ot) && /Integrations → 🏗️ Shovels/.test(ot) && /500 credits/.test(ot) && og.sh === 'later', { og, ot: ot && ot.slice(0, 200) });
ok('…"Pick which permits you want in 🏗️ Permitted jobs" and "Google Drive for big plan sets (files over 50 MB)"', ot && /Pick which permits you want in 🏗️ Permitted jobs/.test(ot) && /Google Drive for big plan sets \(files over 50 MB\)/.test(ot) && /GDRIVE_SA_JSON/.test(ot) && /GDRIVE_ROOT_ID/.test(ot) && og.f === 'soon' && og.d === 'soon');
ok('…Google Drive ticks itself (owner-setup: gdrive true)', await A.ev(() => { const O = window._gcOwnerSetup; const st = O.stateOf(O.items.find(i => i.id === 'gdrive')); return st.done && st.how === 'auto'; }));
if (SHOTS) {
  await A.ev(() => { const d = document.getElementById('gc-ot'); const r = [...d.querySelectorAll('.ot-r')].find(x => /Pick which permits/.test(x.innerText)); if (r) r.scrollIntoView({ block: 'center' }); }); await sleep(500);
  for (const [name, re] of [['6_owner_setup_items', /Pick which permits|Google Drive for big plan/], ['6b_owner_setup_later', /Optional, later: Shovels/]]) {
    await A.ev(src => { const re = new RegExp(src); const d = document.getElementById('gc-ot'); const r = [...d.querySelectorAll('.ot-r')].find(x => re.test(x.innerText)); if (r) r.scrollIntoView({ block: 'center' }); }, re.source); await sleep(400);
    const el = await A.page().$('#gc-ot'); if (!el) continue; const bb = await el.boundingBox();
    const box = await A.ev(src => { const re = new RegExp(src); const d = document.getElementById('gc-ot'); const r = [...d.querySelectorAll('.ot-r')].filter(x => re.test(x.innerText)); const a = r[0].getBoundingClientRect(), b = r[r.length - 1].getBoundingClientRect(); return { y: a.top - 30, h: b.bottom - a.top + 40 }; }, re.source);
    await A.page().screenshot({ path: SHOTS + '/' + name + '.png', clip: { x: bb.x, y: Math.max(0, box.y), width: bb.width, height: Math.min(box.h, 880) } });
  }
}
ok('no page errors (admin)', !errs.length, errs);
try { await A.b.close(); } catch (e) {}
/* a PM does not get the tab */
const B = await computer('sbiffle@grayco-cs.com', { build: process.argv[2] });
await rig(B);
const errsB = []; B.page().on('pageerror', e => errsB.push(String(e.message).slice(0, 200)));
await signIn(B, 'sbiffle@grayco-cs.com', 15000); await sleep(5000);
const bm = await B.ev(() => ({ menu: [...document.querySelectorAll('button')].some(e => /Permitted jobs/.test(e.textContent || '') && (e.textContent || '').length < 40), can: window._gcPermitJobs.canSee() }));
ok('a Project Manager has no 🏗️ Permitted jobs tab', !bm.menu && !bm.can, bm);
ok('no page errors (PM)', !errsB.length, errsB);
try { await B.b.close(); } catch (e) {}
const n = R.filter(Boolean).length; console.log('PERMITS_ui ' + n + '/' + R.length);
process.exit(n === R.length ? 0 : 1);
