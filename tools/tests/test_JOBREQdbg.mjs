// test_JOBREQ.mjs <build-dir> [shot-dir] — patch JOBREQ: ＋ Add a required paper to one job (owner 11/18: "Always be able to add documents to a
// PM's job as a requirement to fill out, as admin or office. PMs can add documents to their jobs too, right?"). Offline harness, fake functions,
// made-up data only (the cloud is the harness mirror; nothing live is written).
//   A. the office on the desk: ＋ Add a required paper → a library form, the customer signs, due before the start, 🔒 Start job waits for it;
//      logged (who / when / why); no "every new job type" box for the office; Start job is held; the final invoice hold.
//   B. the PM on a phone (GrayCo Field job page): sees it, cannot remove the office's paper, 📤 Send… → customer portal (e-sign); the
//      customer signs → done, the hold clears and the job starts; the PM uploads their own document as required; ⏸ data-entry mode holds
//      its send; the PM removes their own unsent paper (archived, in the history).
//   C. overdue → a To-Do for the PM (+ the office at 2+ days late); the office removes the PM's paper (archived); "Also add this to every
//      new <type> job" is for admins only and writes the type table.
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const { computer, signIn, sleep, cset, cget, resetCloud, onFn } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const now = new Date().toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Manager', active: true },
  { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, clientEmail: id.toLowerCase() + '@example.com', clientPhone: '9015550100', address: id + ' Demo St, Memphis, TN 38135', status: 'active', pct: 0, startDate: day(5), endDate: day(30), pm: 'Demo PM', contract: 20000, createdAt: now, updatedAt: now }, o);
cset('projects', [J('PJ', { name: 'Demo kitchen job', type: 'Kitchen' }), J('PK', { name: 'Demo bath job', type: 'Bathroom' }), J('POV', { name: 'Demo late job', type: 'Roofing' })]);
cset('invoices', []);
const QUEUED = [], SIGNREQ = [], SIGNED = [];
onFn('portal', ({ body }) => { if (body && body.action === 'approval') { QUEUED.push(body); return { ok: true, id: 'AP' + QUEUED.length, queued: true }; } return { ok: true }; });
onFn('portal-sign', ({ body }) => { if (body && body.action === 'list') return { ok: true, items: SIGNED.filter(x => x.projectId === body.projectId) }; if (body && body.action === 'request-many') { SIGNREQ.push(body); return { ok: true, made: (body.items || []).length, mailed: true }; } return { ok: false, error: 'test: not here' }; });
const SHARE = 'window.__shared = []; try { Object.defineProperty(navigator, "share", { configurable: true, value: function(d){ window.__shared.push({ title: d.title, files: (d.files || []).length }); return Promise.resolve(); } }); Object.defineProperty(navigator, "canShare", { configurable: true, value: function(){ return true; } }); } catch (e) {}';
const waitOn = async (A0, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A0.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
const jdOf = (A0, pid) => A0.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return p && p.jobDocs ? JSON.parse(JSON.stringify(p.jobDocs)) : null; }, pid);
const tap = (A0) => A0.ev(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));

/* ═══ A · the office on the desk ═══ */
const A = await computer('office@grayco-cs.com', { build: BUILD });
await signIn(A, 'office@grayco-cs.com', 20000);
ok('A0 the CRM is up for the office with ＋ JOBREQ, 📑 JOBDOCS and 🏛 EPAHUD', !!await waitOn(A, () => window._gcJobReq && window._gcJobDocs && window._gcEpaHud && (window._crm.projects || []).length >= 3 && window._gcDocLib && window._gcDocLib.builtins().length > 20, null, 60000));
/* a customer paper from the library that is not on the kitchen job by itself (clientFacing, e-signable by DOCAUTO) */
const DOC = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'PJ'); const have = new Set(window._gcJobDocs.want(p).items.map(x => x.doc)); const NEVER = window._gcDocAuto.NEVER;
  const L = window._gcDocLib.builtins().filter(b => b && /^gcb_/.test(b.id) && b.clientFacing && !have.has(b.id) && !NEVER.test(b.name + ' ' + b.id + ' ' + (b.category || '')) && !/HR|Marketing/i.test(b.category || ''));
  const pref = L.find(b => b.id === 'gcb_hoa_ack') || L.find(b => b.id === 'gcb_antimicrobial_consent') || L[0]; return pref ? { id: pref.id, name: pref.name } : null; });
ok('A1 a library customer paper to add (not on the job by itself)', !!DOC, DOC);
await A.ev(() => { if (window._navToJob) window._navToJob('PJ'); });
let bar = await waitOn(A, () => { const c = document.getElementById('gc-jd'); return c && c.getAttribute('data-pid') === 'PJ' && c.querySelector('[data-jd="xadd"]') && c.innerText; }, null, 20000);
if (!bar) { await A.ev(() => { window._gcOpenProject = { id: 'PJ' }; }); bar = await waitOn(A, () => { const c = document.getElementById('gc-jd'); return c && c.querySelector('[data-jd="xadd"]') && c.innerText; }, null, 8000); }
ok('A2 the job\'s 📑 Paperwork card has "＋ Add a required paper to this job" for the office', bar && /Add a required paper to this job/.test(bar), bar && bar.slice(0, 400));
await A.ev(() => document.querySelector('#gc-jd [data-jd="xadd"]').click());
const sh = await waitOn(A, () => { const o = document.getElementById('gc-xr-sheet'); return o && o.querySelector('[data-xr="doc"] option') && { txt: o.innerText, hold: !!o.querySelector('[data-xr="hold"]'), type: !!o.querySelector('[data-xr="allType"]'), groups: [...o.querySelectorAll('[data-xr="doc"] optgroup')].map(g => g.label) }; }, null, 8000);
ok('A3 the sheet: 📚 library (with the EPA / HUD forms and the job-type papers) / 📁 upload / ✍️ fill-out item, who, due, the hold; no "every new job type" box for the office', sh && /Library/.test(sh.txt) && /Upload/.test(sh.txt) && /Fill-out item/.test(sh.txt) && /Who fills it out or signs it/.test(sh.txt) && /When it is due/.test(sh.txt) && sh.hold && !sh.type && sh.groups.some(g => /EPA \/ HUD/.test(g)) && sh.groups.some(g => /Job-type/.test(g)), sh);
await shot(A, 'A3-add-sheet');
await A.ev(D => { const o = document.getElementById('gc-xr-sheet'), g = n => o.querySelector('[data-xr="' + n + '"]');
  g('q').value = D.name; g('q').dispatchEvent(new Event('input')); g('doc').value = D.id; g('doc').dispatchEvent(new Event('change'));
  g('party').value = 'customer'; g('act').value = 'sign'; g('due').value = 'start'; g('due').dispatchEvent(new Event('change')); g('hold').value = 'start'; g('why').value = 'HOA asks for it before work';
  o.querySelector('[data-xr-save]').click(); }, DOC);
const jA = await waitOn(A, () => { const p = window._crm.projects.find(x => x.id === 'PJ'); const J = p && p.jobDocs; const r = J && (J.extra || []).find(x => x.doc); return r && (J.items || []).some(i => i.k === r.k) && JSON.parse(JSON.stringify(J)); }, null, 10000);
const rA = jA && jA.extra.find(x => x.doc === DOC.id), iA = jA && rA && jA.items.find(x => x.k === rA.k);
ok('A4 saved on the job only (project.jobDocs.extra): the library form, the customer signs, before the start, 🔒 Start job waits; who added it / when / why', rA && rA.kind === 'lib' && rA.party === 'customer' && rA.act === 'sign' && rA.due === 'start' && rA.hold === 'start' && rA.addedBy === 'Office Demo' && rA.addedRole === 'office' && rA.addedAt && /HOA/.test(rA.why) && iA && iA.gate === true && iA.to === 'owner' && iA.doc === DOC.id && (jA.log || []).some(e => e.k === rA.k && e.act === 'added' && e.by === 'Office Demo' && /HOA/.test(e.why)), { rA, iA });
ok('A5 the type table is untouched (per-job only)', cget('gc_jobdocs_table') === undefined && await A.ev(() => !JSON.stringify(window._gcJobDocs.table()).includes('fromXr')));
const card = await waitOn(A, k => { const r = document.querySelector('#gc-jd [data-jk="' + k + '"]'); return r && /Added by Office Demo/.test(r.innerText) && /Start job waits for it/.test(r.innerText) && document.getElementById('gc-jd').innerText; }, rA && rA.k, 8000);
ok('A6 the card: the paper with 🔒, "Added by Office Demo (office)", 📤 Send…, and it counts in "📑 N papers to send"', card && /📑 \d+ papers? to send/.test(card) && await A.ev(k => !!document.querySelector('#gc-jd [data-jk="' + k + '"] [data-ep="menu"]'), rA.k), card && card.slice(0, 700));
await A.ev(() => { const c = document.getElementById('gc-jd'); if (c) c.scrollIntoView({ block: 'start' }); }); await sleep(300); await shot(A, 'A6-card');
const libHtml = await A.ev(d => window._gcDocLib.render(d, 'PJ').then(r => r && r.page), DOC.id);
ok('A7 the library form opens filled in from the job (customer, address) with the company letterhead', libHtml && /Client PJ/.test(libHtml) && /PJ Demo St/.test(libHtml) && /data-gc-logo|grayco-logo|data:image/.test(libHtml) && !/\{[a-z_]+\}/.test(libHtml), libHtml && libHtml.slice(0, 200));
const typeTry = await A.ev(() => { const r = window._gcJobReq.add('PK', { kind: 'fill', label: 'Office try type', party: 'pm', act: 'fill', due: 'start', allType: true, typeKey: 'construction' }); return { ok: r.ok, typeError: r.typeError || '', k: r.k }; });
await sleep(800);
ok('A8 "Also add to every new type" from the office → refused (admins only); the job gets it, the table does not', typeTry.ok && /Only an admin/.test(typeTry.typeError) && cget('gc_jobdocs_table') === undefined, typeTry);
/* 🔒 Start job is held */
await sleep(1500);
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === 'PJ' ? Object.assign({}, p, { pct: 10, updatedAt: new Date().toISOString() }) : p)); });
const gate = await waitOn(A, () => { const d = document.getElementById('gc-la3-gate'); return d && d.textContent; }, null, 8000);
const pct0 = await waitOn(A, () => { const p = window._crm.projects.find(x => x.id === 'PJ'); return (+p.pct || 0) === 0 ? 'zero' : null; }, null, 5000);
ok('A9 🔒 Start job waits for it: the start is taken back and the gate names the paper', gate && gate.includes(rA.label.split(' — ')[0].slice(0, 20)) && pct0 === 'zero', { gate, pct0 });
await shot(A, 'A9-gate');
await A.ev(() => { const d = document.getElementById('gc-la3-gate'); if (d) d.remove(); });
/* 🔒 the final invoice waits (office) */
const fin = await A.ev(() => { const r = window._gcJobReq.add('PK', { kind: 'fill', label: 'Signed punch list', note: 'the walk-through punch list, signed', party: 'customer', act: 'sign', due: 'final', hold: 'final', why: 'owner rule' }); return r.k; });
await sleep(900);
const d0 = A.dialogs.length;
const finInv = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'PK'); const r = window._gcCreateFinalInvoice(p); return { made: !!r, wrapped: !!window._gcCreateFinalInvoice.__gcXr, miss: window._gcJobReq.finalMissing(p).map(x => x.label) }; });
await sleep(400);
ok('A10 🔒 the final invoice waits for its paper (none made, the reason shown)', !finInv.made && finInv.wrapped && finInv.miss.includes('Signed punch list') && A.dialogs.slice(d0).some(d => /final invoice[\s\S]*Signed punch list/.test(d.message)), { finInv, d: A.dialogs.slice(d0) });
console.log('DBG cloud PJ extra', JSON.stringify((cget('projects')||[]).find(p=>p.id==='PJ')?.jobDocs?.extra||null).slice(0,300));
const errsA = A.errs.filter(e => /JobReq|jobreq|_gcJobReq|gc-xr/i.test(e));
await A.close();

/* ═══ B · the PM on a phone ═══ */
const B = await computer('pm@grayco-cs.com', { build: BUILD, mobile: true, init: [SHARE] });
await signIn(B, 'pm@grayco-cs.com', 20000);
ok('B0 the PM\'s phone is up', !!await waitOn(B, () => window._gcJobReq && window._gcEpaHud && (window._crm.projects || []).length >= 3 && typeof window._gcJobDashboard === 'function', null, 60000));
console.log('DBG B PJ', JSON.stringify(await B.ev(()=>{const p=window._crm.projects.find(x=>x.id==='PJ'); return {jd: p.jobDocs ? Object.keys(p.jobDocs):null, extra:(p.jobDocs||{}).extra, pm:p.pm, me: window._gcMeUser && window._gcMeUser(), isPM: window._gcJobReq.isPM(p)};})).slice(0,800));
console.log('DBG cloud PJ extra2', JSON.stringify((cget('projects')||[]).find(p=>p.id==='PJ')?.jobDocs?.extra||null).slice(0,200));
await waitOn(B, () => { if (!document.querySelector('#_gcJobPick.gc-fh') && window._gcField && window._gcField.open) { try { window._gcField.open(); } catch (e) {} } return document.querySelector('#_gcJobPick.gc-fh'); }, null, 30000);
const fh = await waitOn(B, () => { const b = document.getElementById('gc-ep-field'); return b && /papers? to send/.test(b.innerText) && b.innerText; }, null, 20000);
ok('B1 GrayCo Field home: the office\'s paper is in "Needs you · 📑 N papers to send" for the PM', fh && fh.includes(rA.label.split(' — ')[0].slice(0, 20)), fh);
await B.ev(() => { document.querySelectorAll('#_gcJobPick,._gcSheetOv').forEach(o => o.remove()); window._gcJobDashboard('PJ'); });
const fc = await waitOn(B, k => { const c = document.getElementById('gc-jd-f'); return c && c.getAttribute('data-pid') === 'PJ' && c.querySelector('[data-jk="' + k + '"]') && c.innerText; }, rA.k, 20000);
ok('B2 the Field job page has the 📑 Paperwork card with ＋ Add and the office\'s paper (🔒, added by the office)', fc && /Add a required paper to this job/.test(fc) && /Added by Office Demo/.test(fc) && /Start job waits for it/.test(fc), fc && fc.slice(0, 600));
await B.ev(() => { const c = document.getElementById('gc-jd-f'); if (c) c.scrollIntoView({ block: 'start' }); }); await sleep(300); await shot(B, 'B2-field-card');
const noRm = await B.ev(k => ({ btn: !!document.querySelector('#gc-jd-f [data-jk="' + k + '"] [data-jd="xrm"]'), api: window._gcJobReq.remove('PJ', k, 'PM tries') }), rA.k);
await sleep(600);
const stillA = await B.ev(k => { const p = window._crm.projects.find(x => x.id === 'PJ'); const r = (p.jobDocs.extra || []).find(x => x.k === k); return r && !r.removed && p.jobDocs.items.some(i => i.k === k); }, rA.k);
ok('B3 the PM cannot remove the office\'s paper (no 🗄 Remove; refused; still on the job)', !noRm.btn && noRm.api && !noRm.api.ok && /admin or the office/.test(noRm.api.error) && stillA, noRm);
console.log('DBG B PJ later', JSON.stringify(await B.ev(()=>{const p=window._crm.projects.find(x=>x.id==='PJ'); return {extra:(p.jobDocs||{}).extra, items:((p.jobDocs||{}).items||[]).map(i=>i.k), dash: !!document.getElementById('_gcJobDash'), err: window.__gcXrErr};})).slice(0,900));
console.log('DBG cloud3', JSON.stringify((cget('projects')||[]).find(p=>p.id==='PJ')?.jobDocs?.extra||null).slice(0,200));
process.exit(1);
/* 📤 Send… → customer portal (e-sign) */
await B.ev(k => document.querySelector('#gc-jd-f [data-jk="' + k + '"] [data-ep="menu"]').click(), rA.k);
const menu = await waitOn(B, () => { const o = document.getElementById('gc-ep-sheet'); return o && o.innerText; }, null, 6000);
ok('B4 📤 Send… → 👤 customer portal (e-sign) / ✉️ e-mail / 📱 text a link / 📤 share from the phone / ✓ mark done', menu && /Customer portal \(e-sign\)/.test(menu) && /E-mail/.test(menu) && /Text a link/.test(menu) && /Share from this phone/.test(menu) && /Mark it done/.test(menu), menu);
await shot(B, 'B4-send-menu');
await B.ev(() => document.querySelector('#gc-ep-sheet [data-ep-ch="portal"]').click());
const req = await (async () => { for (let i = 0; i < 80; i++) { const r = SIGNREQ.find(b => b.projectId === 'PJ' && (b.items || []).some(it => it.refId === 'dl_' + DOC.id)); if (r) return r; await sleep(250); } return null; })();
const lgB = await waitOn(B, k => { const p = window._crm.projects.find(x => x.id === 'PJ'); return (p.jobDocs.log || []).find(e => e.k === k && e.act === 'sent') || null; }, rA.k, 10000);
ok('B5 → the customer\'s portal to e-sign (a portal-sign request for that paper) and logged on the paper (by the PM)', req && lgB && /portal/.test(lgB.via) && lgB.by === 'Demo PM', { req: req && req.items, lgB });
/* the customer signs → done → the hold clears */
SIGNED.push({ id: 'SR1', projectId: 'PJ', kind: 'doc', refId: 'dl_' + DOC.id, status: 'signed', signedAt: new Date().toISOString(), signed: { name: 'Client PJ' } });
const nS = await B.ev(() => window._gcJobReq.checkSigned('PJ'));
const dn = await waitOn(B, k => { const p = window._crm.projects.find(x => x.id === 'PJ'); const d = (p.jobDocs.done || {})[k]; return d && Object.assign({ miss: window._gcJobDocs.gateMissing(p, []) }, d); }, rA.k, 8000);
ok('B6 the customer\'s e-signature → the paper is done (e-signed in the portal, logged) and Start job no longer waits', nS === 1 && dn && /e-signed/.test(dn.how) && !dn.miss.includes(rA.k) && await B.ev(k => ((window._crm.projects.find(x => x.id === 'PJ').jobDocs.log) || []).some(e => e.k === k && e.act === 'signed' && e.by === 'customer'), rA.k), { nS, dn });
await sleep(1500);
await B.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === 'PJ' ? Object.assign({}, p, { pct: 10, updatedAt: new Date().toISOString() }) : p)); });
await sleep(3500);
const st = await B.ev(() => ({ pct: +window._crm.projects.find(x => x.id === 'PJ').pct || 0, gate: !!document.getElementById('gc-la3-gate') }));
ok('B7 …and the job starts (not taken back, no gate)', st.pct === 10 && !st.gate, st);
/* the PM uploads their own document as required (phone) */
await B.ev(() => { const o = document.getElementById('gc-ep-sheet'); if (o) o.remove(); document.querySelector('#gc-jd-f [data-jd="xadd"]').click(); });
const sB = await waitOn(B, () => { const o = document.getElementById('gc-xr-sheet'); return o && { hold: !!o.querySelector('[data-xr="hold"]'), type: !!o.querySelector('[data-xr="allType"]') }; }, null, 6000);
ok('B8 the PM\'s add sheet: no hold and no "every new job type" (admins / office only)', sB && !sB.hold && !sB.type, sB);
await B.ev(() => document.querySelector('#gc-xr-sheet [data-xr-kind="upload"]').click());
await B.page().setInputFiles('#gc-xr-sheet [data-xr="file"]', { name: 'Demo site safety plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n') });
await B.ev(d => { const o = document.getElementById('gc-xr-sheet'), g = n => o.querySelector('[data-xr="' + n + '"]'); g('label').value = 'Site safety plan (signed by the crew)'; g('party').value = 'crew'; g('act').value = 'sign'; g('due').value = 'date'; g('due').dispatchEvent(new Event('change')); g('dueDate').value = d; g('why').value = 'my job needs it'; }, day(12));
await shot(B, 'B9-upload');
await B.ev(() => document.querySelector('#gc-xr-sheet [data-xr-save]').click());
const up = await waitOn(B, () => { const p = window._crm.projects.find(x => x.id === 'PJ'); const r = (p.jobDocs.extra || []).find(x => x.kind === 'upload'); return r && p.jobDocs.items.some(i => i.k === r.k) && JSON.parse(JSON.stringify(r)); }, null, 15000);
ok('B9 the PM uploaded their own document as required: stored in the company file store, the crew signs, due by a date, added by the PM', up && /^sb:/.test(up.fileRef || '') && up.fileName === 'Demo site safety plan.pdf' && up.party === 'crew' && up.due === 'date' && up.dueDate === day(12) && up.addedBy === 'Demo PM' && up.addedRole === 'PM' && !up.hold, up);
const upRow = await waitOn(B, k => { const r = document.querySelector('#gc-jd-f [data-jk="' + k + '"]'); return r && r.innerText; }, up && up.k, 8000);
ok('B10 on the card: added by the PM, 📁 the file, 🗄 Remove (their own, not sent yet), 📤 Share…', upRow && /Added by Demo PM \(PM\)/.test(upRow) && /Demo site safety plan/.test(upRow) && await B.ev(k => !!document.querySelector('#gc-jd-f [data-jk="' + k + '"] [data-jd="xrm"]') && !!document.querySelector('#gc-jd-f [data-jk="' + k + '"] [data-ep="menu"]'), up.k), upRow);
/* ⏸ data-entry mode holds the send */
await B.ev(() => { window.__realPause = window._gcPause.state; window._gcPause.state = () => ({ paused: true, note: 'until Jan 3' }); });
const n0 = QUEUED.length, s0 = SIGNREQ.length;
const held = await B.ev(k => window._gcEpaHud.sendVia('PJ', k, 'email'), up.k);
await sleep(700);
const lgH = await B.ev(k => ((window._crm.projects.find(x => x.id === 'PJ').jobDocs.log) || []).filter(e => e.k === k).map(e => e.act), up.k);
ok('B11 ⏸ data-entry mode: the send is held (logged "held", nothing queued, nothing to the portal)', held && held.held === true && QUEUED.length === n0 && SIGNREQ.length === s0 && lgH.includes('held'), { held, lgH });
await B.ev(() => { window._gcPause.state = window.__realPause; });
/* the PM removes their own unsent fill-out item → archived */
const fk = await B.ev(() => window._gcJobReq.add('PJ', { kind: 'fill', label: 'Gate code from the customer', party: 'customer', act: 'fill', due: 'start' }).k);
await sleep(900);
await B.ev(() => { window.prompt = () => 'customer gave it by phone'; });
await waitOn(B, k => document.querySelector('#gc-jd-f [data-jk="' + k + '"] [data-jd="xrm"]'), fk, 8000);
await B.ev(k => document.querySelector('#gc-jd-f [data-jk="' + k + '"] [data-jd="xrm"]').click(), fk);
const gone = await waitOn(B, k => { const p = window._crm.projects.find(x => x.id === 'PJ'); const r = (p.jobDocs.extra || []).find(x => x.k === k); return r && r.removed && !p.jobDocs.items.some(i => i.k === k) && JSON.parse(JSON.stringify(r)); }, fk, 8000);
ok('B12 the PM removes their own unsent paper: archived with who / why, off the list, kept in the history', gone && gone.removed.by === 'Demo PM' && /phone/.test(gone.removed.why) && gone.label === 'Gate code from the customer', gone);
const errsB = B.errs.filter(e => /JobReq|jobreq|_gcJobReq|gc-xr/i.test(e));
await B.close();

/* ═══ C · the admin: overdue, removal, every new job of a type ═══ */
const C = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(C, 'wjohnson@grayco-cs.com', 20000);
ok('C0 the admin\'s computer is up', !!await waitOn(C, () => window._gcJobReq && window._gcEpaHud && (window._crm.projects || []).length >= 3 && (window._crm.projects.find(p => p.id === 'PJ').jobDocs || {}).extra, null, 60000));
const ovk = await C.ev(d => window._gcJobReq.add('POV', { kind: 'fill', label: 'Roof deck inspection photos', note: 'photos of the deck before dry-in', party: 'pm', act: 'fill', due: 'date', dueDate: d, why: 'insurance asks' }).k, day(-3));
await sleep(1200);
await C.ev(() => window._gcEpaHud.sweep());
const tk = await waitOn(C, k => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const a = l.find(t => t.id === 'EPAHUD_POV_' + k), b = l.find(t => t.id === 'EPAHUD_ESC_POV_' + k); return a && b && { a, b }; }, ovk, 10000);
ok('C1 overdue → a To-Do for the job\'s PM (OVERDUE) and, 3 days late, the office + admins (high)', tk && tk.a.assignee === 'Demo PM' && /OVERDUE/.test(tk.a.label) && /Roof deck inspection photos/.test(tk.a.label) && tk.b.assignee === 'Office' && tk.b.prio === 'high' && /3 days late/.test(tk.b.label), tk);
await C.ev(() => { if (window._navToJob) window._navToJob('PJ'); });
await waitOn(C, () => { const c = document.getElementById('gc-jd'); return c && c.getAttribute('data-pid') === 'PJ'; }, null, 15000) || await C.ev(() => { window._gcOpenProject = { id: 'PJ' }; });
await waitOn(C, k => document.querySelector('#gc-jd [data-jk="' + k + '"] [data-jd="xrm"]'), up.k, 15000);
await C.ev(() => { window.prompt = () => 'the crew signs the company plan instead'; });
await C.ev(k => document.querySelector('#gc-jd [data-jk="' + k + '"] [data-jd="xrm"]').click(), up.k);
const arch = await waitOn(C, k => { const p = window._crm.projects.find(x => x.id === 'PJ'); const r = (p.jobDocs.extra || []).find(x => x.k === k); return r && r.removed && JSON.parse(JSON.stringify({ r, inItems: p.jobDocs.items.some(i => i.k === k), log: (p.jobDocs.log || []).filter(e => e.k === k).map(e => e.act) })); }, up.k, 8000);
const hist = await waitOn(C, () => { const d = document.querySelector('#gc-jd [data-xr-hist]'); return d && d.textContent; }, null, 8000);
ok('C2 removal archives the paper: who / when / why, off the list, the record + its log kept, shown under 🗄 Removed papers', arch && arch.r.removed.by === 'Wesley Johnson' && arch.r.removed.role === 'admin' && arch.r.removed.at && /company plan/.test(arch.r.removed.why) && !arch.inItems && arch.log.includes('added') && arch.log.includes('removed') && arch.r.fileRef && hist && /Site safety plan/.test(hist) && /Gate code/.test(hist), { arch, hist });
await C.ev(() => { const d = document.querySelector('#gc-jd [data-xr-hist]'); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }); await sleep(300); await shot(C, 'C2-history');
/* every new <type> job — admins */
await C.ev(() => document.querySelector('#gc-jd [data-jd="xadd"]').click());
const sC = await waitOn(C, () => { const o = document.getElementById('gc-xr-sheet'); return o && o.querySelector('[data-xr="allType"]') && o.querySelector('[data-xr="typeKey"]').value; }, null, 6000);
ok('C3 the admin\'s sheet has "Also add this to every new <job type> job" (the job\'s type picked)', sC === 'construction', sC);
await C.ev(() => { const o = document.getElementById('gc-xr-sheet'), g = n => o.querySelector('[data-xr="' + n + '"]'); o.querySelector('[data-xr-kind="fill"]').click(); g('note').value = 'Photos of the finished cabinets, every room'; g('label').value = 'Finish photos (every room)'; g('party').value = 'pm'; g('act').value = 'fill'; g('due').value = 'atdone'; g('allType').checked = true; o.querySelector('[data-xr-save]').click(); });
const tab = await (async () => { for (let i = 0; i < 40; i++) { const t = cget('gc_jobdocs_table'); if (t) return t; await sleep(250); } return null; })();
const row = tab && tab.types.find(t => t.key === 'construction'), ti = row && row.items.find(x => x.label === 'Finish photos (every room)');
ok('C4 …written to the type table through its own save (gc_kv gc_jobdocs_table, by the admin)', ti && ti.fill === 1 && ti.to === 'xpm' && ti.due === 'atdone' && ti.fromXr && tab.by === 'Wesley Johnson', { ti, by: tab && tab.by });
await sleep(1200);
const pjK = await C.ev(() => { const p = window._crm.projects.find(x => x.id === 'PJ'); return p.jobDocs.items.filter(i => /Finish photos/.test(i.label)).map(i => i.k); });
ok('C5 the job it was added on keeps one copy (no double)', pjK.length === 1 && /^xr:/.test(pjK[0]), pjK);
await tap(C);
await C.ev(() => window._setProjects(prev => prev.concat([{ id: 'PNEW', name: 'Demo new kitchen', client: 'New Demo', clientPhone: '9015550199', address: '9 Demo St, Memphis, TN', type: 'Kitchen', status: 'active', pm: 'Demo PM', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])));
const pn = await waitOn(C, () => { const p = window._crm.projects.find(x => x.id === 'PNEW'); return p && p.jobDocs && p.jobDocs.items && p.jobDocs.items.find(i => /Finish photos/.test(i.label)) || null; }, null, 15000);
ok('C6 a new Kitchen job gets it by itself (a fill-out item for the PM, at completion)', pn && pn.fill === 1 && pn.to === 'xpm' && !pn.needsForm, pn);
const typeOff = await C.ev(() => window._gcJobReq.addToType('nosuchtype', { label: 'x', party: 'pm' }));
ok('C7 the type path refuses a type that is not in the table', typeOff && !typeOff.ok, typeOff);
const errsC = C.errs.filter(e => /JobReq|jobreq|_gcJobReq|gc-xr/i.test(e));
ok('Z no JOBREQ page errors', !errsA.length && !errsB.length && !errsC.length, errsA.concat(errsB, errsC));
await C.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
