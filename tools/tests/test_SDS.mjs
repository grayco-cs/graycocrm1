// test_SDS.mjs <build-dir> — owner 11/11: 🧪 Materials & SDS in Mitigation and Environmental — the library by work type (typical SDS
// information), materials added by hand, the materials picked for a job, the customer's "Chemical & Product Use Consent" (Approve / Do not
// use on each product, signed in the portal) and the warnings until then. Offline harness, made-up data.
// SDS_SHOTS=<dir> → screenshots (1440×900): sds_mitigation_tab, sds_environmental_tab, sds_material_detail, sds_job_picker, sds_consent_paper.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
const SHOT = process.env.SDS_SHOTS || '';
resetCloud();
const now = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'u3', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true }]);
cset('projects', [
  { id: 'M1', name: 'Demo Ross basement', client: 'Demo Ross', status: 'active', type: 'Water Damage', companyId: 'mitigation', isInsurance: true, insCarrier: 'State Farm', notes: 'Sewage backup in the basement, cat 3', contract: 8000, pm: 'Sam Biffle', updatedAt: now },
  { id: 'M2', name: 'Demo Cox kitchen leak', client: 'Demo Cox', status: 'active', type: 'Water Damage', companyId: 'mitigation', updatedAt: now },
  { id: 'M3', name: 'Demo Old dry-out', client: 'Demo Old', status: 'Completed', type: 'Water Damage', companyId: 'mitigation', pm: 'Sam Biffle', updatedAt: now },
  { id: 'E1', name: 'Demo Kline trim', client: 'Demo Kline', status: 'active', type: 'Environmental', companyId: 'environmental', notes: 'House built 1962 — lead paint on the window trim', pm: 'Nick Thomas', updatedAt: now },
  { id: 'C1', name: 'Demo Smith deck', client: 'Demo Smith', status: 'active', type: 'Residential Reno', contract: 12000, pm: 'Sam Biffle', updatedAt: now },
  { id: 'C2', name: 'Demo Wade water', client: 'Demo Wade', status: 'active', type: 'Water Damage', notes: 'mold and sewage', pm: 'Sam Biffle', updatedAt: now }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
if (SHOT) await A.page().setViewportSize({ width: 1440, height: 900 });
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(8000);
/* 0. 🧰 materials & equipment needed → the PM of every Mitigation / Environmental job */
const tasksOf = () => A.ev(() => { let l = []; try { l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); } catch (e) {} return l.filter(x => x && x.kind === 'sds_needed'); });
await sleep(6000);
let TK = await tasksOf();
const tM1 = TK.filter(x => x.pid === 'M1'), tE1 = TK.filter(x => x.pid === 'E1');
ok('🧰 Mitigation job with a PM → ONE To-Do for that PM (assignees = their e-mail) "Materials & equipment needed — Demo Ross basement"', tM1.length === 1 && tM1[0].assignees.join() === 'sbiffle@grayco-cs.com' && /^🧰 Materials & equipment needed — Demo Ross basement$/.test(tM1[0].label) && tM1[0].assignee === 'Sam Biffle', tM1.map(x => ({ a: x.assignee, as: x.assignees, l: x.label })));
const it1 = (tM1[0] || {}).items || [];
ok('… its checklist: the typical water + sewage materials (quat disinfectant, bleach) and the equipment (LGR dehumidifiers, air movers, moisture meter, extraction, PPE) — no lead / asbestos items', ['Quaternary ammonium', 'Sodium hypochlorite', 'Dehumidifiers (LGR)', 'Air movers', 'Moisture meter', 'Extraction unit', 'PPE'].every(w => it1.some(i => i.label.includes(w))) && !it1.some(i => /Lead|asbestos/i.test(i.label)), it1.map(i => i.label));
ok('🧰 Environmental lead job → its PM\'s To-Do with lead materials + HEPA vacuum, poly, wet-cleaning, P100, signs', tE1.length === 1 && tE1[0].assignees.join() === 'nthomas@grayco-cs.com' && ['Lead encapsulant', 'HEPA vacuum', '6-mil poly', 'Wet-cleaning supplies', 'P100', 'warning signs'].every(w => tE1[0].items.some(i => i.label.includes(w))), tE1[0] && tE1[0].items.map(i => i.label));
ok('no PM yet → the office\'s To-Do ("No PM yet"); a finished job and Construction jobs (even a water / mold one) → nothing', TK.filter(x => x.pid === 'M2').length === 1 && TK.find(x => x.pid === 'M2').assignee === 'office' && /No PM yet/.test(TK.find(x => x.pid === 'M2').note) && !TK.some(x => ['M3', 'C1', 'C2'].includes(x.pid)), TK.map(x => x.pid + ':' + x.assignee));
await sleep(3000);
const bc = (() => { let v = cget('gc_pm_broadcasts'); if (typeof v === 'string') v = JSON.parse(v); return (v || []).filter(x => x && x.source === 'sds'); })();
ok('… and an Alert for each PM (gc_pm_broadcasts, target = the PM); none for the no-PM job', bc.some(x => x.target === 'Sam Biffle' && x.pid === 'M1' && /Materials & equipment needed — Demo Ross basement/.test(x.msg)) && bc.some(x => x.target === 'Nick Thomas' && x.pid === 'E1') && !bc.some(x => x.pid === 'M2'), bc.map(x => x.target + ':' + x.pid));
const ct = (() => { let v = cget('gc_office_tasks'); if (typeof v === 'string') v = JSON.parse(v); return (v || []).filter(x => x && x.kind === 'sds_needed').length; })();
ok('the To-Dos reach the cloud (gc_office_tasks)', ct === 3, ct);
await sleep(9000);
TK = await tasksOf();
ok('no duplicates on the next checks (one per job)', TK.length === 3, TK.map(x => x.id));

const nav = () => A.ev(() => [...document.querySelectorAll('nav button, aside button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ').trim()).join('|'));
const setCo = async c => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(2500); };

/* 1. the tab, per company */
await setCo('mitigation');
await A.ev(() => window._setView('sds')); await sleep(2500);
let n = await nav();
ok('Mitigation picked: 🧪 Materials & SDS in the left menu (after 💧 Mitigation; no 🌿 Environmental, no RoofScout)', /Materials & SDS/.test(n) && n.indexOf('Materials & SDS') > n.indexOf('💧 Mitigation') && !/Environmental/.test(n) && !/RoofScout/.test(n), n.slice(0, 500));
let t = await A.ev(() => (document.querySelector('.gcsds') || {}).innerText || '');
ok('the tab opens: library, the "Typical — always follow the product\'s own SDS and label" note, the jobs card', /Materials library/.test(t) && /Typical — always follow the product's own SDS and label/.test(t) && /Jobs — materials/.test(t), t.slice(0, 300));
if (SHOT) await A.page().screenshot({ path: SHOT + '/sds_mitigation_tab.png' });
await setCo('environmental');
await A.ev(() => window._setView('sds')); await sleep(2000);
n = await nav();
ok('Environmental picked: 🧪 Materials & SDS in the left menu too (after 🌿 Environmental; no 💧 Mitigation, no RoofScout)', /Materials & SDS/.test(n) && n.indexOf('Materials & SDS') > n.indexOf('Environmental') && !/RoofScout/.test(n), n.slice(0, 500));
await A.ev(() => document.querySelector('.gcsds [data-sds-g="lead"]').click()); await sleep(600);
if (SHOT) await A.page().screenshot({ path: SHOT + '/sds_environmental_tab.png' });
const who = await A.ev(() => { const u0 = window._gcMeUser, a0 = window.__GC_AUTH__.isAdmin, f0 = localStorage.getItem('gc_co_filter');
  window.__GC_AUTH__.isAdmin = () => false; window._gcMeUser = () => ({ name: 'Pat PM', role: 'Project Manager' });
  const r = {}; window._gcCo.setFilter('all'); r.pmAll = window._gcSdsCanSee(); window._gcCo.setFilter('mitigation'); r.pmMit = window._gcSdsCanSee(); window._gcCo.setFilter('construction'); r.pmCon = window._gcSdsCanSee();
  window._gcMeUser = () => ({ name: 'Mo', role: 'Mitigation Manager' }); r.mitMgr = window._gcSdsCanSee();
  window._gcMeUser = u0; window.__GC_AUTH__.isAdmin = a0; window._gcCo.setFilter('environmental'); r.admin = window._gcSdsCanSee(); return r; });
ok('who: admins; anyone while Mitigation / Environmental is picked; the mitigation manager; not a construction PM on Construction', who.admin && who.pmMit && who.mitMgr && !who.pmCon && !who.pmAll, who);
await sleep(1500); await A.ev(() => window._setView('sds')); await sleep(2000);
await A.ev(() => document.querySelector('.gcsds [data-sds-g="lead"]').click()); await sleep(600);

/* 2. built-ins by work type */
const g = await A.ev(() => { const L = window._gcSds.list(), by = k => L.filter(m => m.groups.includes(k)).map(m => m.name);
  return { n: L.length, water: by('water'), mold: by('mold'), fire: by('fire'), sewage: by('sewage'), lead: by('lead'), asbestos: by('asbestos'), general: by('general'),
    full: L.every(m => m.use && m.hazards && m.donts.length && m.dos.length && m.cust !== undefined && 'sdsUrl' in m), brands: L.map(m => m.name).filter(x => /®|™/.test(x)) }; });
ok('built-in library: every work type has its materials (water, mold, fire, sewage, lead, asbestos, general), every one with use / hazards / do\'s / don\'ts / SDS field, no brand marks', g.n >= 18 && ['water', 'mold', 'fire', 'sewage', 'lead', 'asbestos', 'general'].every(k => g[k].length >= 2) && g.full && !g.brands.length, { n: g.n, lead: g.lead, asb: g.asbestos });
t = await A.ev(() => document.getElementById('gc-sds-grid').innerText);
ok('🧪 Lead filter: lead encapsulant + phosphate-free detergent shown, ozone not', /Lead encapsulant/.test(t) && /Phosphate-free lead cleaning detergent/.test(t) && !/Ozone generator/.test(t), t.slice(0, 300));
await A.ev(() => document.querySelector('.gcsds [data-sds-g="fire"]').click()); await sleep(500);
t = await A.ev(() => document.getElementById('gc-sds-grid').innerText);
ok('🔥 Fire filter: soot sponge, thermal fogging, shellac primer, ozone', /Dry chemical soot sponge/.test(t) && /Thermal fogging deodorizer/.test(t) && /Shellac-based/.test(t) && /Ozone generator/.test(t), t.slice(0, 300));
await A.ev(() => { const q = document.getElementById('gc-sds-q'); q.value = 'bleach'; q.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(600);
t = await A.ev(() => document.getElementById('gc-sds-grid').innerText);
ok('search "bleach" (Fire filter on) → nothing; All + "bleach" → the bleach solution', !/Sodium hypochlorite/.test(t), t.slice(0, 120));
await A.ev(() => document.querySelector('.gcsds [data-sds-g="all"]').click()); await sleep(500);
t = await A.ev(() => document.getElementById('gc-sds-grid').innerText);
ok('… All + "bleach" → Sodium hypochlorite (bleach) solution', /Sodium hypochlorite \(bleach\) solution/.test(t), t.slice(0, 200));
await A.ev(() => document.querySelector('.gcsds [data-sds-mat="bleach_solution"]').click()); await sleep(600);
let d = await A.ev(() => (document.getElementById('gc-sds-detail') || {}).innerText || '');
ok('material detail: typical note, hazards, PPE, do / don\'t ("NEVER mix with ammonia"), re-entry, first aid, customer cautions, SDS link field', /Typical — always follow/.test(d) && /NEVER mix with ammonia/.test(d) && /PPE/.test(d) && /Re-entry/.test(d) && /First aid/.test(d) && /Customer cautions/.test(d) && /Manufacturer SDS/.test(d), d.slice(0, 300));
await A.ev(() => document.querySelector('[data-sds="close"]').click());
await A.ev(() => { const q = document.getElementById('gc-sds-q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(400);
await A.ev(() => document.querySelector('.gcsds [data-sds-mat="ozone_generator"]').click()); await sleep(600);
d = await A.ev(() => (document.getElementById('gc-sds-detail') || {}).innerText || '');
ok('ozone: never with people, pets or plants in the space', /NEVER run with people, pets or plants in the space/.test(d), d.slice(0, 200));
if (SHOT) await A.page().screenshot({ path: SHOT + '/sds_material_detail.png' });
await A.ev(() => document.querySelector('[data-sds="close"]').click()); await sleep(300);

/* 3. add a material by hand */
await A.ev(() => document.querySelector('.gcsds [data-sds="add"]').click()); await sleep(500);
await A.ev(() => { const f = k => document.querySelector('#gc-sds-edit [data-sds-f="' + k + '"]');
  f('name').value = 'Demo citrus solvent cleaner'; f('use').value = 'Removing adhesive residue'; f('hazards').value = 'Flammable; skin irritant';
  f('donts').value = 'No flames nearby\nDo not mix with bleach'; f('sdsUrl').value = 'https://example.com/demo-sds.pdf';
  document.querySelectorAll('#gc-sds-edit [data-sds-grp]').forEach(c => { c.checked = c.getAttribute('data-sds-grp') === 'fire'; });
  document.querySelector('#gc-sds-edit [data-sds-save]').click(); }); await sleep(1500);
const kv = cget('gc_sds_materials');
const added = await A.ev(() => window._gcSds.list().find(m => /Demo citrus/.test(m.name)));
ok('➕ a material added by hand is saved for everyone (gc_kv gc_sds_materials) and listed under its work type', kv && kv.list && kv.list.some(m => m.name === 'Demo citrus solvent cleaner' && m.sdsUrl === 'https://example.com/demo-sds.pdf') && added && added.groups.join() === 'fire' && !added.builtin && added.donts.length === 2, { kv: kv && kv.list && kv.list.map(m => m.name), added });
await A.ev(() => document.querySelector('.gcsds [data-sds-mat="quat_disinfectant"]').click()); await sleep(400);
await A.ev(() => document.querySelector('#gc-sds-detail [data-sds-edit]').click()); await sleep(400);
await A.ev(() => { document.querySelector('#gc-sds-edit [data-sds-f="sdsUrl"]').value = 'https://example.com/quat-sds.pdf'; document.querySelector('#gc-sds-edit [data-sds-save]').click(); }); await sleep(1500);
const ed = await A.ev(() => { const m = window._gcSds.byId('quat_disinfectant'); return { url: m.sdsUrl, edited: m.edited, n: window._gcSds.list().length }; });
ok('✏️ editing a built-in (adding its SDS link) keeps it in place, marked Edited', ed.url === 'https://example.com/quat-sds.pdf' && ed.edited && ed.n === g.n + 1, ed);

/* 4. materials for a job */
await setCo('mitigation');
await A.ev(() => window._setView('sds')); await sleep(1500);
await A.ev(() => window._gcSds.open('M1')); await sleep(600);
const pk = await A.ev(() => ({ t: document.getElementById('gc-sds-job').innerText, ids: [...document.querySelectorAll('#gc-sds-job [data-sds-pick]')].map(i => i.getAttribute('data-sds-pick')) }));
ok('job picker for the sewage water job: suggests water + sewage materials (quat, bleach, biohazard bags), not lead / asbestos ones', pk.ids.includes('quat_disinfectant') && pk.ids.includes('bleach_solution') && pk.ids.includes('biohazard_bags') && !pk.ids.includes('lead_encapsulant') && !pk.ids.includes('amended_water'), pk.ids);
await A.ev(() => ['quat_disinfectant', 'bleach_solution', 'ozone_generator'].forEach(id => { const i = document.querySelector('#gc-sds-job [data-sds-pick="' + id + '"]'); if (i) i.checked = true; }));
if (SHOT) await A.page().screenshot({ path: SHOT + '/sds_job_picker.png' });
await A.ev(() => document.querySelector('#gc-sds-job [data-sds="savepick"]').click()); await sleep(2500);
const jm = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'M1'); return { m: (p.materials || []).map(x => x.id + ':' + x.status), w: window._gcSds.warnings(p).map(x => x.t) }; });
ok('the job keeps the picked materials (planned) — job.materials', jm.m.sort().join() === 'bleach_solution:planned,ozone_generator:planned,quat_disinfectant:planned', jm);
ok('⚠ until the customer signs: "Customer has not signed the materials consent"', jm.w.some(x => /Customer has not signed the materials consent/.test(x)), jm.w);
const pushed = await A.ev(() => new Promise(r => setTimeout(() => r(true), 900))) && (cget('projects') || []).find(p => p.id === 'M1');
ok('the job\'s materials reach the cloud', pushed && (pushed.materials || []).length === 3, pushed && pushed.materials);

/* 5. the customer's consent paper */
await A.ev(() => document.querySelector('#gc-sds-job [data-sds="preview"]').click()); await sleep(2500);
const paper = await A.ev(() => { const v = document.getElementById('gc-viewer'); if (!v) return ''; const f = v.querySelector('iframe'); try { if (f && f.contentDocument) return f.contentDocument.documentElement.outerHTML; } catch (e) {} return (f && f.getAttribute('srcdoc')) || v.innerHTML; });
ok('📄 consent paper: the job\'s products with what each is for, cautions, ☐ Approve / ☐ Do not use, the SDS line', /Chemical &amp; Product Use Consent|Chemical & Product Use Consent/.test(paper) && /Quaternary ammonium disinfectant/.test(paper) && /Sodium hypochlorite/.test(paper) && /Ozone generator/.test(paper) && /Do not use/.test(paper) && /Safety Data Sheet/.test(paper) && /Demo Ross/.test(paper), paper.length);
ok('the customer copy never names the insurance company and shows no price', !/State Farm/i.test(paper) && !/\$\s?\d/.test(paper.replace(/<style[\s\S]*?<\/style>/g, '')), (paper.match(/State Farm|\$\s?\d[\d,]*/gi) || []).slice(0, 5));
if (SHOT) await A.page().screenshot({ path: SHOT + '/sds_consent_paper.png' });
await A.ev(() => { const c = document.querySelector('#gc-viewer [data-gv="close"]') || [...document.querySelectorAll('#gc-viewer button')].find(b => /close|✕|×/i.test(b.innerText || b.getAttribute('aria-label') || '')); if (c) c.click(); else { const v = document.getElementById('gc-viewer'); v && v.remove(); } }); await sleep(400);
const lib = await A.ev(() => { const b = window._gcDocLib.builtins().find(x => x.id === 'gcb_materials_consent'); return b && { cf: b.clientFacing, name: b.name }; });
ok('the paper is in 📚 the document library (client-facing) as "Chemical and Product Use Consent"', lib && lib.cf === true && lib.name === 'Chemical and Product Use Consent', lib);

/* 6. ✍️ send for signature → portal-sign (kind doc, one choice per product) */
await A.ev(() => { const f0 = window.fetch; window.__sdsCalls = []; window.fetch = function(u, o){ if (String(u).indexOf('/.netlify/functions/portal-sign') >= 0) { window.__sdsCalls.push(JSON.parse((o && o.body) || '{}')); return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 'sr_M1_doc_sds_M1', queued: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })); } return f0.apply(this, arguments); }; });
await A.ev(() => window._gcSds.send('M1')); await sleep(2500);
const call = await A.ev(() => (window.__sdsCalls || []).find(b => b.action === 'request'));
ok('✍️ Send: one portal paper, kind doc, refId sds_M1, a choice per product (name, what for, cautions) — no prices, no carrier', call && call.kind === 'doc' && call.refId === 'sds_M1' && call.choices.length === 3 && call.choices.every(c => c.id && c.n && c.u) && !/State Farm|\$\d/.test(JSON.stringify(call)), call);
const sent = await A.ev(() => (window._crm.projects.find(x => x.id === 'M1').materialsConsent || {}));
ok('the job records the consent as sent (waiting in the portal)', sent.status === 'sent' && sent.reqId === 'sr_M1_doc_sds_M1' && sent.items.length === 3, sent);

/* 7. the customer signs in the portal: ozone → Do not use */
cset('gc_sign_requests', [{ id: 'sr_M1_doc_sds_M1', pid: 'M1', kind: 'doc', refId: 'sds_M1', title: 'Chemical & product use consent', status: 'signed', createdAt: now, updatedAt: now, choices: call.choices,
  signed: { name: 'Demo Ross', at: new Date().toISOString(), sigId: 'ps_demo1', picks: { quat_disinfectant: 'yes', bleach_solution: 'yes', ozone_generator: 'no' }, sens: 'Daughter has asthma' } }]);
await A.ev(() => window._gcAuto5.pull(true)); await sleep(1500); await A.ev(() => window._gcAuto5.pull(true)); await sleep(4000);
const af = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'M1'); return { m: (p.materials || []).map(x => x.id + ':' + x.status).sort(), c: p.materialsConsent, w: window._gcSds.warnings(p).map(x => x.t) }; });
ok('signed in the portal → each product approved / refused as the customer marked; consent signed with their note', af.m.join() === 'bleach_solution:approved,ozone_generator:refused,quat_disinfectant:approved' && af.c.status === 'signed' && af.c.signedBy === 'Demo Ross' && /asthma/.test(af.c.sens), af);
ok('⛔ refused material flagged: "Refused: Ozone generator (equipment) — do not use, use an alternative"', af.w.some(x => /Refused: Ozone generator \(equipment\) — do not use, use an alternative/.test(x)) && !af.w.some(x => /has not signed/.test(x)), af.w);
await A.ev(() => window._setView('sds')); await sleep(2500);
t = await A.ev(() => (document.querySelector('.gcsds [data-sds-jobrow="M1"]') || {}).innerText || '');
ok('the tab\'s job row shows the refusal (DO NOT USE)', /Refused: Ozone generator/.test(t) && /DO NOT USE/.test(t), t.slice(0, 300));
await A.ev(() => { window._gcSds.open('M1'); const i = document.querySelector('#gc-sds-job [data-sds-pick="hepa_vacuum"]') || document.querySelector('#gc-sds-job [data-sds-pick="drying_equipment"]'); i.checked = true; document.querySelector('#gc-sds-job [data-sds="savepick"]').click(); }); await sleep(2500);
const nw = await A.ev(() => window._gcSds.warnings(window._crm.projects.find(x => x.id === 'M1')).map(x => x.t));
ok('a product added after the signature → "Not in the signed consent … send the consent again"', nw.some(x => /Not in the signed consent/.test(x)), nw);
await A.ev(() => { const o = document.getElementById('gc-sds-ov'); o && o.remove(); });

/* 8. the job's 🧪 Materials window (the same card is drawn on the job page, under Job tools — the offline harness cannot open a
   made-up job's page, so the window is checked here): the 🧰 needed list with tick-boxes */
await A.ev(() => window._setView('sds')); await sleep(1500);
await A.ev(() => window._gcSds.open('M1')); await sleep(800);
await A.ev(() => { document.querySelector('#gc-sds-job .gcsds-need').open = true; });
const nd = await A.ev(() => { const c = document.querySelector('#gc-sds-job .gcsds-need'); return c ? { t: c.innerText, n: c.querySelectorAll('[data-sds-need]').length } : null; });
ok('🧪 Materials (job): 🧰 Materials & equipment needed list with tick-boxes (planned materials + the job\'s equipment), "sent to Sam Biffle\'s To-Do"', nd && /Materials & equipment needed/.test(nd.t) && /Sam Biffle/.test(nd.t) && /Ozone generator/.test(nd.t) && /DO NOT USE/.test(nd.t) && /Dehumidifiers \(LGR\)/.test(nd.t) && nd.n >= 8, nd && nd.t.slice(0, 300));
await A.ev(() => { const i = document.querySelector('#gc-sds-job [data-sds-need^="e:dehumidifiers"]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(2500);
const tk = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'M1'); const t = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').find(x => x.kind === 'sds_needed' && x.pid === 'M1'); return { job: Object.keys(p.materialsChecklist || {}), item: (t.items.find(i => /^e:dehumid/.test(i.id)) || {}).done }; });
ok('ticking an item: saved on the job (job.materialsChecklist) and on the PM\'s To-Do item', tk.job.some(k => /^e:dehumidifiers/.test(k)) && tk.item === true, tk);
await A.ev(() => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const t = l.find(x => x.kind === 'sds_needed' && x.pid === 'M1'); const it = t.items.find(i => /^e:air_movers/.test(i.id)); it.done = true; t.updatedAt = new Date().toISOString(); localStorage.setItem('gc_office_tasks', JSON.stringify(l)); }); await sleep(4000);
const tk2 = await A.ev(() => Object.keys(window._crm.projects.find(x => x.id === 'M1').materialsChecklist || {}));
ok('… and a tick on the PM\'s To-Do comes back to the job', tk2.some(k => /^e:air_movers/.test(k)) && tk2.some(k => /^e:dehumidifiers/.test(k)), tk2);
await A.ev(() => window._gcSds.open('M1')); await sleep(800);
if (SHOT) { await A.ev(() => { const c = document.querySelector('#gc-sds-job .gcsds-need'); if (c) c.open = true; c && c.scrollIntoView({ block: 'start' }); }); await sleep(400); await A.page().screenshot({ path: SHOT + '/sds_pm_alert_job.png' }); }
await A.ev(() => { const o = document.getElementById('gc-sds-ov'); o && o.remove(); });
await A.ev(() => window._setProjects(prev => prev.map(p => p.id === 'M2' ? Object.assign({}, p, { pm: 'Sam Biffle', updatedAt: new Date().toISOString() }) : p))); await sleep(11000);
TK = await tasksOf();
ok('a PM is put on the no-PM job → a new To-Do for that PM (once)', TK.filter(x => x.pid === 'M2' && x.assignee === 'Sam Biffle').length === 1 && TK.length === 4, TK.map(x => x.pid + ':' + x.assignee));
await A.page().reload(); await sleep(16000);
TK = await tasksOf();
ok('reload: still one To-Do per job and PM (no duplicates)', TK.length === 4 && new Set(TK.map(x => x.id)).size === 4, TK.map(x => x.id));
/* the PM's own computer */
const B = await computer('sbiffle@grayco-cs.com', { build: process.argv[2] });
if (SHOT) await B.page().setViewportSize({ width: 1440, height: 900 });
await signIn(B, 'sbiffle@grayco-cs.com', 15000); await sleep(9000);
await B.ev(() => window._setView('todo')); await sleep(4000);
let pmv = await B.ev(() => (document.querySelector('#root main') || document.body).innerText);
ok('the PM\'s To-Do (📌 Yours) shows "🧰 Materials & equipment needed — Demo Ross basement" with the ticks done so far (2/N)', /Materials & equipment needed — Demo Ross basement\s*2\/\d+/.test(pmv), pmv.slice(pmv.indexOf('📌'), pmv.indexOf('📌') + 300));
await B.ev(() => { const lab = [...document.querySelectorAll('#root main *')].filter(e => /Materials & equipment needed — Demo Ross basement/.test(e.textContent || '') && /▾/.test(e.textContent || '')).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  const car = lab && [...lab.querySelectorAll('*')].reverse().find(e => /^\s*(\d+\/\d+\s*)?▾\s*$/.test(e.textContent || '')); (car || lab).click(); }); await sleep(1200);
pmv = await B.ev(() => (document.querySelector('#root main') || document.body).innerText);
ok('… opened: its checklist (LGR dehumidifiers, air movers, the job\'s products)', /Dehumidifiers \(LGR\)/.test(pmv) && /Air movers/.test(pmv) && /Quaternary ammonium/.test(pmv), pmv.slice(pmv.indexOf('📌'), pmv.indexOf('📌') + 600));
if (SHOT) { await B.ev(() => { const x = [...document.querySelectorAll('#root main *')].find(e => e.children.length === 0 && /Materials & equipment needed — Demo Ross basement/.test(e.textContent || '')); x && x.scrollIntoView({ block: 'center' }); }); await sleep(600); await B.page().screenshot({ path: SHOT + '/sds_pm_alert.png' }); }
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'SDS ' + R.length + '/' + R.length); process.exit(f ? 1 : 0);
