// test_PERMITS_ui.mjs <build-dir> — patch PERMITS: Leads → 🏗️ Permits in the browser. Offline harness; every permit is MADE UP.
// PERMITS_SHOTS=<dir> also saves screenshots there.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 400))); };
const SHOTS = process.env.PERMITS_SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (c, name, sel) => { if (!SHOTS) return; const p = c.page(); const f = SHOTS + '/' + name + '.png'; if (sel) { const el = await p.$(sel); if (el) { await el.screenshot({ path: f }); return; } } await p.screenshot({ path: f }); };
resetCloud();
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('leads', [{ id: 'L0', name: 'Existing Demo Lead', company: 'Existing Demo Lead', type: 'Residential', status: 'new', updatedAt: now }]);
/* the made-up server */
const SRV = { items: [
  { key: 'nashville:T2026000901', src: 'nashville', area: 'Nashville', areaLong: 'Nashville / Davidson Co., TN', id: 'T2026000901', number: 'T2026000901', type: 'Building Commercial - Fire Damage', subtype: 'Restaurant (Full Service)', desc: 'Repair fire damage to kitchen and dining room', value: 9000, issued: day(1), address: '2 Demo Ave', city: 'Nashville', state: 'TN', zip: '37000', contractor: 'Example Builders LLC', link: 'https://example.invalid/permit/T2026000901', reasons: ['🔥 fire/smoke words'], hint: 'mitigation', bucket: 'commercialRehab', state: 'new', firstSeen: now },
  { key: 'nashville:T2026000902', src: 'nashville', area: 'Nashville', areaLong: 'Nashville / Davidson Co., TN', id: 'T2026000902', number: 'T2026000902', type: 'Building Commercial - Rehab', subtype: 'General Office, Professional Services', desc: 'Interior renovation of 2nd floor offices', value: 480000, issued: day(2), address: '1 Sample Plaza', city: 'Nashville', state: 'TN', zip: '37000', contractor: 'Sample Contractors Inc', reasons: ['Commercial rehab $480k'], hint: 'construction', bucket: 'commercialRehab', state: 'new', firstSeen: now },
  { key: 'shovels:SHV1', src: 'shovels', area: 'Southaven, MS', areaLong: 'DeSoto Co., MS (Southaven, Olive Branch, Horn Lake, Hernando)', id: 'SHV1', number: 'BLD-1001', type: 'Demolition', desc: 'Demolition of existing commercial building', value: 20000, issued: day(3), address: '20 Pretend Blvd', city: 'Southaven', state: 'MS', zip: '38600', contractor: 'Mock Wrecking Co', owner: 'Sample Owner Trust', yearBuilt: 1965, reasons: ['Demolition — built 1965 (Environmental)'], hint: 'environmental', bucket: 'demolition', state: 'new', firstSeen: now },
  { key: 'nashville:T2026000800', src: 'nashville', area: 'Nashville', areaLong: 'Nashville / Davidson Co., TN', id: 'T2026000800', number: 'T2026000800', type: 'Building Residential - Rehab', desc: 'Kitchen remodel', value: 60000, issued: day(9), address: '9 Old Test Rd', city: 'Nashville', state: 'TN', zip: '37000', contractor: 'Example Remodelers', reasons: ['Residential remodel $60k'], hint: 'construction', bucket: 'residentialRehab', state: 'new', firstSeen: '2026-01-01T00:00:00.000Z' }
], status: { nashville: { on: true, ok: true, lastRun: now, read: 412, matched: 4, added: 3, error: '' }, shovels: { active: false, configured: false, note: 'Not connected — add SHOVELS_API_KEY in Netlify.' } },
  settings: { v: 1, include: { commercialNew: true, commercialRehab: true, multifamily: true, residentialRehab: true, demolition: true, roofing: true, repair: true, residentialNew: false }, exclude: ['sign', 'fence', 'pool'], minValue: 25000, maxAgeDays: 14, nashville: { on: true }, shovels: { on: true, zips: ['38117', '38671', '72201'], maxPerRun: 300, lookbackDays: 7, contractorNames: true } },
  calls: [] };
const INCLUDE = [['commercialNew', 'Commercial — new buildings'], ['commercialRehab', 'Commercial — rehab / remodel / tenant finish'], ['multifamily', 'Multifamily (apartments, condos, townhomes)'], ['residentialRehab', 'Residential — rehab / remodel / addition'], ['demolition', 'Demolition (asbestos survey → Environmental)'], ['roofing', 'Roofing'], ['repair', 'Fire / water / storm / mold / asbestos / repair words (any value)'], ['residentialNew', 'Residential — new houses']];
function answer(b){
  SRV.calls.push(b);
  if (b.action === 'list') return { ok: true, items: SRV.items, status: SRV.status, settings: SRV.settings, active: { nashville: true, shovels: false }, shovelsConfigured: false, admin: true };
  if (b.action === 'run') { SRV.status.nashville.lastRun = new Date().toISOString(); SRV.status.nashville.added = 0; return { ok: true, status: SRV.status, added: { nashville: 0, shovels: 0 } }; }
  if (b.action === 'settings-get') return { ok: true, settings: SRV.settings, defaults: SRV.settings, include: INCLUDE, admin: true, shovelsConfigured: false };
  if (b.action === 'settings-set') { SRV.settings = Object.assign({}, SRV.settings, b.settings); return { ok: true, settings: SRV.settings }; }
  if (b.action === 'set-state') { const x = SRV.items.find(y => y.key === b.id); if (!x) return { ok: false, error: 'gone' }; x.state = b.state; x.leadId = b.leadId || undefined; x.stateBy = 'Wesley Johnson'; return { ok: true, item: x }; }
  return { ok: false, error: 'Bad request' };
}
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
await A.ctx.route(u => /\/\.netlify\/functions\/permit-watch/.test(u), r => { let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(b)) }); });
await A.ctx.route(u => /\/\.netlify\/functions\/owner-setup/.test(u), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, checks: { shovels_key: false, gdrive: true } }) }));
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await A.page().addInitScript(() => { try { localStorage.setItem('gc_permits_seen', '2026-06-01T00:00:00.000Z'); } catch (e) {} });
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(5000);
await A.ev(() => window._setView('leads')); await sleep(6000);
const chip = await A.ev(() => { const c = document.getElementById('gc-permits-chip'); return c ? { inHeader: !!c.closest('#gc-leads-chips'), near: !!c.closest('#gc-leads-hub') || !!(document.getElementById('gc-leads-hub') || {}).parentNode, txt: c.innerText } : null; });
ok('Leads shows the 🏗️ Permits chip in the Leads header with the new count (3 new since the last look)', chip && chip.inHeader && /🏗️ Permits/.test(chip.txt) && /3 new/.test(chip.txt), chip);
await A.page().click('#gc-permits-chip button'); await sleep(1500);
const p1 = await A.ev(() => { const ov = document.getElementById('gc-pm-ov'); return ov ? { rows: ov.querySelectorAll('tbody tr').length, text: ov.innerText, src: [...ov.querySelectorAll('[data-pm-src]')].map(x => x.innerText) } : null; });
ok('the panel lists the matched permits (4 new) with date, area, type, address, value, contractor, reasons, company', p1 && p1.rows === 4 && /Example Builders LLC/.test(p1.text) && /\$480,000/.test(p1.text) && /🔥 fire\/smoke words/.test(p1.text) && /Mitigation/.test(p1.text) && /Environmental/.test(p1.text) && /Southaven, MS/.test(p1.text), p1 && { rows: p1.rows });
ok('status strip: Nashville ✅ last run · 412 read · 4 matched; Shovels "Not connected — add SHOVELS_API_KEY"', p1 && /✅ last run/.test(p1.src[0]) && /412 read/.test(p1.src[0]) && /4 matched/.test(p1.src[0]) && /Not connected/.test(p1.src[1]) && /SHOVELS_API_KEY/.test(p1.src[1]), p1 && p1.src);
ok('the map link is a Google Maps search for the address', await A.ev(() => /google\.com\/maps\/search\/\?api=1&query=2%20Demo%20Ave/.test(document.querySelector('#gc-pm-ov tr[data-k="nashville:T2026000901"] a[href*="google.com/maps"]').href)));
await shot(A, '1_permits_panel', '#gc-pm-ov .bx');
/* filters */
await A.page().selectOption('#gc-pm-ov select[data-pm-f="co"]', 'environmental'); await sleep(600);
ok('company filter: Environmental → only the demolition', await A.ev(() => { const r = [...document.querySelectorAll('#gc-pm-ov tbody tr')]; return r.length === 1 && r[0].getAttribute('data-k') === 'shovels:SHV1'; }));
await A.page().selectOption('#gc-pm-ov select[data-pm-f="co"]', ''); await A.page().fill('#gc-pm-ov input[data-pm-f="min"]', '100000'); await sleep(800);
ok('min value $100,000 → only the $480k rehab', await A.ev(() => { const r = [...document.querySelectorAll('#gc-pm-ov tbody tr')]; return r.length === 1 && r[0].getAttribute('data-k') === 'nashville:T2026000902'; }));
await A.page().fill('#gc-pm-ov input[data-pm-f="min"]', ''); await A.page().selectOption('#gc-pm-ov select[data-pm-f="reason"]', 'fire'); await sleep(600);
ok('reason filter 🔥 → only the fire damage', await A.ev(() => { const r = [...document.querySelectorAll('#gc-pm-ov tbody tr')]; return r.length === 1 && r[0].getAttribute('data-k') === 'nashville:T2026000901'; }));
await A.page().selectOption('#gc-pm-ov select[data-pm-f="reason"]', ''); await A.page().fill('#gc-pm-ov input[data-pm-f="q"]', 'wrecking'); await sleep(800);
{ const q = await A.ev(() => ({ n: document.querySelectorAll('#gc-pm-ov tbody tr').length, keys: [...document.querySelectorAll('#gc-pm-ov tbody tr')].map(r => r.getAttribute('data-k')), f: window._gcPermitLeads.state().f }));
  ok('search "wrecking" finds the contractor', q.n === 1 && q.keys[0] === 'shovels:SHV1', q); }
await A.page().fill('#gc-pm-ov input[data-pm-f="q"]', ''); await sleep(600);
/* ➕ Make it a lead */
await A.page().click('#gc-pm-ov tr[data-k="nashville:T2026000901"] [data-pm-a="lead"]'); await sleep(2500);
const ld = await A.ev(() => { const l = (window._crm.leads || []).find(x => x.permitKey === 'nashville:T2026000901'); return l ? { id: l.id, source: l.source, companyId: l.companyId, type: l.type, note: l.note, address: l.address, estValue: l.estValue, name: l.name, co: window._gcCo ? window._gcCo.ofLead(l) : '' } : null; });
ok('➕ Make it a lead → a CRM lead: source "Building permit — Nashville", 💧 Mitigation, Restoration – Fire, address', ld && /^LPMT_/.test(ld.id) && ld.source === 'Building permit — Nashville' && ld.companyId === 'mitigation' && ld.co === 'mitigation' && ld.type === 'Restoration – Fire' && ld.address === '2 Demo Ave', ld);
ok('…the contractor, the permit # and link and the description are in the notes', ld && /Contractor on the permit: Example Builders LLC/.test(ld.note) && /Permit #T2026000901/.test(ld.note) && /example\.invalid\/permit/.test(ld.note) && /Repair fire damage/.test(ld.note), ld && ld.note);
ok('…the server was told: set-state lead with the lead id', SRV.calls.some(b => b.action === 'set-state' && b.id === 'nashville:T2026000901' && b.state === 'lead' && b.leadId === (ld && ld.id)));
ok('…and the row now says ✓ Lead (left the New list on the next filter)', await A.ev(() => { const r = document.querySelector('#gc-pm-ov tr[data-k="nashville:T2026000901"]'); return !r || /✓ Lead/.test(r.innerText); }));
await sleep(3000);
ok('the manual-save window closes again after the lead is saved', await A.ev(() => window.__GC_MANUAL_SAVE__ !== true));
const cl = cget('leads');
ok('the lead reached the cloud (gc_kv leads), the old lead kept', Array.isArray(cl) && cl.some(x => x.id === (ld && ld.id) && x.companyId === 'mitigation') && cl.some(x => x.id === 'L0'), Array.isArray(cl) ? cl.map(x => x.id) : cl);
await A.page().click('#gc-pm-ov tr[data-k="shovels:SHV1"] [data-pm-a="lead"]'); await sleep(1500);
const ld2 = await A.ev(() => { const l = (window._crm.leads || []).find(x => x.permitKey === 'shovels:SHV1'); return l ? { companyId: l.companyId, type: l.type, source: l.source, company: l.company, sector: l.sector } : null; });
ok('a Shovels demolition → Environmental lead, source "Building permit — Southaven, MS", the owner as the company', ld2 && ld2.companyId === 'environmental' && ld2.type === 'Environmental' && ld2.source === 'Building permit — Southaven, MS' && ld2.company === 'Sample Owner Trust', ld2);
await A.page().click('#gc-pm-ov tr[data-k="nashville:T2026000902"] [data-pm-a="lead"]'); await sleep(1500);
const ld3 = await A.ev(() => { const l = (window._crm.leads || []).find(x => x.permitKey === 'nashville:T2026000902'); return l ? { companyId: l.companyId, type: l.type, co: window._gcCo ? window._gcCo.ofLead(l) : '' } : null; });
ok('a commercial rehab (Construction hint) → a Commercial lead with no companyId (Construction)', ld3 && !ld3.companyId && ld3.type === 'Commercial' && ld3.co === 'construction', ld3);
await A.page().click('#gc-pm-ov tr[data-k="nashville:T2026000901"] [data-pm-a="lead"]').catch(() => {});
ok('pressing it twice never makes a second lead', await A.ev(() => (window._crm.leads || []).filter(x => x.permitKey === 'nashville:T2026000901').length === 1));
/* Dismiss */
await A.page().selectOption('#gc-pm-ov select[data-pm-f="state"]', 'new'); await sleep(500);
await A.page().click('#gc-pm-ov tr[data-k="nashville:T2026000800"] [data-pm-a="dismiss"]'); await sleep(1200);
ok('Dismiss hides it from the New list and tells the server', await A.ev(() => !document.querySelector('#gc-pm-ov tr[data-k="nashville:T2026000800"]')) && SRV.calls.some(b => b.action === 'set-state' && b.id === 'nashville:T2026000800' && b.state === 'dismissed'));
await A.page().selectOption('#gc-pm-ov select[data-pm-f="state"]', 'all'); await sleep(500);
ok('…it is still under "All" (dimmed), with Undo', await A.ev(() => { const r = document.querySelector('#gc-pm-ov tr[data-k="nashville:T2026000800"]'); return !!r && r.classList.contains('dis') && !!r.querySelector('[data-pm-a="undo"]'); }));
/* ↻ Run now */
await A.page().click('#gc-pm-ov [data-pm-a="run"]'); await sleep(1500);
ok('↻ Run now calls the server', SRV.calls.some(b => b.action === 'run'));
/* ⚙ Filters */
await A.page().click('#gc-pm-ov [data-pm-a="filters"]'); await sleep(1200);
const setv = await A.ev(() => { const b = document.getElementById('gc-pm-set'); return b ? { inc: b.querySelectorAll('[data-pm-inc]').length, zips: b.querySelector('[data-pm-set="zips"]').value, min: b.querySelector('[data-pm-set="minValue"]').value } : null; });
ok('⚙ Filters (admin) shows the kinds of permit, the minimum value and the Shovels ZIP list', setv && setv.inc === 8 && setv.min === '25000' && /38117, 38671, 72201/.test(setv.zips), setv);
await A.page().fill('#gc-pm-set [data-pm-set="minValue"]', '40000');
await A.page().fill('#gc-pm-set [data-pm-set="zips"]', '38117, 38138, 72201');
await A.page().check('#gc-pm-set [data-pm-inc="residentialNew"]');
await shot(A, '2_permits_filters', '#gc-pm-ov .bx');
await A.page().click('#gc-pm-set [data-pm-a="save"]'); await sleep(1200);
const ss = SRV.calls.filter(b => b.action === 'settings-set').pop();
ok('Save filters sends the new minimum, ZIP codes and kinds', ss && ss.settings.minValue === 40000 && ss.settings.shovels.zips.join() === '38117,38138,72201' && ss.settings.include.residentialNew === true && ss.settings.include.commercialRehab === true, ss && ss.settings);
await A.ev(() => window._gcPermitLeads.close()); await sleep(800);
ok('after looking, the chip shows no "new" count', await A.ev(() => !/new/.test((document.getElementById('gc-permits-chip') || {}).innerText || 'x new')));
/* the made lead in the Leads list */
if (SHOTS) {
  await A.ev(id => { try { window._gcLeadsHub.open(id); } catch (e) {} }, ld && ld.id); await sleep(2000);
  const dr = await A.page().$('#gcl-drawer'); if (dr) await dr.screenshot({ path: SHOTS + '/3_made_lead.png' }); else await A.page().screenshot({ path: SHOTS + '/3_made_lead.png' });
  await A.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} }); await sleep(800);
}
/* 🔧 Owner setup */
await A.ev(() => window._setView('todo')); await sleep(4000);
await A.ev(() => { try { window._gcOwnerSetup.refresh(true); } catch (e) {} }); await sleep(2500);
const ot = await A.ev(() => { const d = document.getElementById('gc-ot'); if (!d) return null; d.open = true; return d.innerText; });
ok('🔧 Owner setup lists "Building permits … (paid data: Shovels)" with the Netlify SHOVELS_API_KEY steps', ot && /Building permits for Memphis, DeSoto, Little Rock \(paid data: Shovels\)/.test(ot) && /SHOVELS_API_KEY/.test(ot) && /Trigger deploy/.test(ot) && /Pulaski Co/.test(ot), ot && ot.slice(0, 300));
ok('…"Pick which permits you want in 🏗️ Permits" and "Google Drive for big plan sets"', ot && /Pick which permits you want in 🏗️ Permits/.test(ot) && /Google Drive for big plan sets \(files over 50 MB\)/.test(ot) && /GDRIVE_SA_JSON/.test(ot) && /GDRIVE_ROOT_ID/.test(ot));
ok('…Google Drive ticks itself (owner-setup: gdrive true), Shovels says "not done yet"', await A.ev(() => { const st = window._gcOwnerSetup.stateOf(window._gcOwnerSetup.items.find(i => i.id === 'gdrive')); const sh = window._gcOwnerSetup.stateOf(window._gcOwnerSetup.items.find(i => i.id === 'permits_shovels')); return st.done && st.how === 'auto' && !sh.done && sh.auto === false; }));
if (SHOTS) {
  await A.ev(() => { const d = document.getElementById('gc-ot'); if (d) { d.open = true; const r = [...d.querySelectorAll('.ot-r')].find(x => /Building permits for Memphis/.test(x.innerText)); if (r) r.scrollIntoView({ block: 'center' }); } }); await sleep(600);
  const el = await A.page().$('#gc-ot'); if (el) { const bb = await el.boundingBox(); const rows = await A.ev(() => { const d = document.getElementById('gc-ot'); const r = [...d.querySelectorAll('.ot-r')].filter(x => /Building permits for Memphis|Pick which permits|Google Drive for big plan/.test(x.innerText)); const a = r[0].getBoundingClientRect(), b = r[r.length - 1].getBoundingClientRect(); return { y: a.top - 30, h: b.bottom - a.top + 40 }; });
    await A.page().screenshot({ path: SHOTS + '/4_owner_setup_items.png', clip: { x: bb.x, y: Math.max(0, rows.y), width: bb.width, height: Math.min(rows.h, 880) } }); }
}
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('PERMITS_ui ' + n + '/' + R.length);
try { await A.b.close(); } catch (e) {}
process.exit(n === R.length ? 0 : 1);
