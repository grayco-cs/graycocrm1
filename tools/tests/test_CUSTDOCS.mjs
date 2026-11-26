// test_CUSTDOCS.mjs <build-dir> — patch CUSTDOCS (owner 11/26: "general documents for all centers for this job with 5 different places —
// when I send general zips, just make sure that stuff is in the customer's portal; it doesn't have to go to the projects' documents
// unless we do one in each project if needed"). Node only; made-up data; nothing leaves the machine.
//   A. The CRM's 📦 Import ZIP code (tools/zipimport_tail.js, run against a small stand-in page): the pulldowns offer
//      "👤 <customer> — all their jobs (customer portal only)" for customers with 2+ jobs; 2 general files → gc_kv customerDocs
//      (storage refs, portalShare / portalLive), NO projectDocs; "also put a copy on each of their jobs" → one per job; a sub / internal
//      file is left out with the reason; a re-import skips (customer + name + size); other records kept.
//   B. The customer portal (netlify/functions/portal.js, the offline custportal world): every one of that customer's jobs lists them as
//      generalDocs (signed links); another customer's job does not; hidden / archived / another customerId never show.
//   C. portal.html renders "📁 General documents"; Customer 360 shows them with Hide / Archive (staff).
import path from 'path'; import fs from 'fs'; import crypto from 'crypto'; import vm from 'vm'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const W = await import(path.join(build, 'tools/tests/custportal_world.mjs'));
const S = W.S;
W.seedSample({ photos: 4, crmDocs: false }); W.resetCaches();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/* the jobs: Sample Customer now has 2 jobs (each with its portal link); Head Start has 5 */
const jobs = W.get('projects');
const P2 = { id: 'PSAMPLE2', name: 'Sample Customer — Garage', client: S.customer.name, customerId: S.customer.id, address: '125 Sample St, Memphis, TN 38103', pm: S.pm.name, status: 'active', autoPO: 'S1002' };
jobs.find(j => j.id === S.pid).customerId = S.customer.id;
const HS = [1, 2, 3, 4, 5].map(n => ({ id: 'HS' + n, name: 'Head Start - Center ' + n, client: 'Head Start', address: (100 + n) + ' Oak Ave, Memphis, TN', po: 'H20' + n, pm: S.pm.name, status: 'active' }));
W.put('projects', jobs.concat([P2], HS));
const link2 = W.tok(); W.TABLES.gc_portal.push({ token: link2, project_id: 'PSAMPLE2', revoked: false, created_at: '2026-10-02T12:00:00Z' });
W.put('customerDocs', [{ id: 'gdoc_old', customer: 'Somebody Else', name: 'Old.pdf', size: 10, ref: W.storeFile(W.pdfOf('Old'), 'pdf', 'application/pdf'), portalShare: true, updatedAt: '2026-10-01T00:00:00Z' }]);
const pd0 = W.get('projectDocs').length;

/* ═════ A. the ZIP import code against a stand-in page ═════ */
console.log('A. 📦 Import ZIP → "👤 <customer> — all their jobs"');
function el(){ const e = { style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', value: '', disabled: false, firstChild: null,
  appendChild(c){ this.children.push(c); return c; }, insertBefore(c){ return c; }, remove(){}, setAttribute(){}, getAttribute(){ return null; }, addEventListener(){}, closest(){ return null; },
  querySelector(){ return el(); }, querySelectorAll(){ return []; }, getClientRects(){ return []; } }; e.firstChild = { style: {} }; return e; }
const LS = {}; const IDB = { projectDocs: W.get('projectDocs') };
const STORED = [];
const win = {
  __GC_NATIVE_SETTIMEOUT__: (f, ms) => { const t = setTimeout(f, ms); if (t.unref) t.unref(); return t; }, __GC_NATIVE_SETINTERVAL__: () => 0,
  __GC_AUTH__: { email: () => 'office.sample@grayco-cs.com', isAdmin: () => true },
  _crm: { projects: W.get('projects'), users: [{ name: 'Office Demo', email: 'office.sample@grayco-cs.com', role: 'Office' }] },
  idbGet: async k => IDB[k], idbSet: async (k, v) => { IDB[k] = v; },
  _gcStoreFile: async (file, o) => { const b = Buffer.from(await file.arrayBuffer()); const ext = (file.name.split('.').pop() || 'bin').toLowerCase(); STORED.push(file.name); return { ref: W.storeFile(b, ext, file.type), type: file.type || 'application/pdf', size: b.length, hash: sha(b) }; },
  console: { log(){}, warn(){} }
};
win.window = win; win.localStorage = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
LS.grayco_sb_url = W.SB; LS.grayco_sb_key = 'sb_publishable_test_only';
win.document = { hidden: false, head: el(), body: el(), createElement: () => el(), getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], addEventListener(){} };
win.fetch = (u, o) => globalThis.fetch(u, o); win.File = File; win.Blob = Blob; win.Promise = Promise; win.Date = Date; win.JSON = JSON; win.Math = Math;
const ctx = vm.createContext(win);
vm.runInContext(fs.readFileSync(path.join(build, 'tools/zipimport_tail.js'), 'utf8'), ctx);
const ZI = win._gcZipImport;
const groups = ZI.custGroups().map(g => g.name + ':' + g.jobs.length);
ok(groups.includes('Head Start:5') && groups.includes(S.customer.name + ':2') && !groups.some(g => /Other Person/.test(g)), 'customers with 2+ jobs (Head Start: 5, Sample Customer: 2; a 1-job customer is not offered)', groups);
const opts = ZI._t.opts();
ok(/<optgroup label="Customers with several jobs"><option value="__cust:head%20start">👤 Head Start — all their jobs \(customer portal only\)<\/option>/.test(opts) && opts.indexOf('👤') > opts.lastIndexOf('Head Start - Center 5'), 'the pulldown: "👤 Head Start — all their jobs (customer portal only)" under the jobs', opts.slice(-400));
const HSV = ZI._t.custVal(ZI.custGroups().find(g => g.name === 'Head Start'));
const pdf = t => W.pdfOf(t, ['General paper for every center']);
const files = [new File([pdf('Safety plan')], 'Safety plan - all centers.pdf', { type: 'application/pdf' }), new File([pdf('Hours')], 'Center hours letter.pdf', { type: 'application/pdf' }), new File([pdf('W9')], 'W-9 Sample Drywall.pdf', { type: 'application/pdf' })];
ZI.open();
await ZI._t.add(files);
ZI._t.mode(HSV);
let st = ZI.state();
ok(st.rows.length === 3 && st.rows.filter(r => r.pid === HSV).length === 2, 'top pulldown = Head Start: the 2 general files go to the customer', st.rows.map(r => r.name + ':' + r.pid));
const w9 = st.rows.find(r => /W-9/.test(r.name));
ok(w9.pid === '__skip' && /W-9/.test(ZI._t.rowHow(w9.name)) && /nowhere private/.test(ZI._t.rowHow(w9.name)), 'the W-9 (sub paperwork) is left out, the reason on screen', ZI._t.rowHow(w9.name));
ok(/customer portal only \(all 5 jobs\), not on a job/.test(ZI._t.rowHow('Safety plan - all centers.pdf')), 'the row says: customer portal only (all 5 jobs), not on a job', ZI._t.rowHow('Safety plan - all centers.pdf'));
await ZI._t.run();
await new Promise(r => setTimeout(r, 50));
let CD = W.get('customerDocs');
const hsDocs = CD.filter(d => d.customer === 'Head Start');
ok(hsDocs.length === 2 && hsDocs.every(d => /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(d.ref) && d.portalShare === true && d.portalLive === true && d.source === 'zip-import' && d.zipBatch && d.uploadedAt && d.by && d.size > 0 && d.cat), 'gc_kv customerDocs: 2 records for Head Start (storage refs, portalShare + portalLive, zip-import, batch, size, by)', hsDocs);
ok(!JSON.stringify(CD).includes('base64') && CD.every(d => !d.data), 'no base64 in customerDocs');
ok(CD.some(d => d.id === 'gdoc_old'), 'another customer\'s record is kept (read-merge-write)');
ok(W.get('projectDocs').length === pd0 && (IDB.projectDocs || []).length === pd0, 'no projectDocs added (not on any job)', { pd0, n: W.get('projectDocs').length });
ok(!STORED.some(n => /W-9/.test(n)), 'the left-out W-9 was not stored');
const log = W.get('gc_zip_import') || [];
ok(log[0] && log[0].counts.custDocs === 2 && log[0].custDocs[0].customer === 'Head Start', 'the import log counts them', log[0] && log[0].counts);

/* re-import: skipped */
ZI.open(); await ZI._t.add(files.slice(0, 2)); ZI._t.mode(HSV); await ZI._t.run();
CD = W.get('customerDocs');
ok(CD.filter(d => d.customer === 'Head Start').length === 2 && (W.get('gc_zip_import') || [])[0].counts.skipped === 2, 're-import: the 2 files are skipped (customer + name + size)', (W.get('gc_zip_import') || [])[0].counts);

/* Sample Customer: one file with "also put a copy on each of their jobs" */
const SV = ZI._t.custVal(ZI.custGroups().find(g => g.name === S.customer.name));
ZI.open(); await ZI._t.add([new File([pdf('Welcome')], 'Welcome packet.pdf', { type: 'application/pdf' }), new File([pdf('HOA')], 'HOA rules.pdf', { type: 'application/pdf' })]);
ZI._t.mode(SV); ZI._t.copy('Welcome packet.pdf', true); await ZI._t.run();
await new Promise(r => setTimeout(r, 50));
CD = W.get('customerDocs');
const sc = CD.filter(d => d.customer === S.customer.name);
const copies = (IDB.projectDocs || []).filter(d => d.name === 'Welcome packet.pdf');
ok(sc.length === 2 && sc.every(d => d.customerId === S.customer.id), 'Sample Customer: 2 general documents (customerId kept — both jobs share it)', sc.map(d => [d.name, d.customerId]));
ok(copies.length === 2 && copies.map(d => d.pid).sort().join() === [S.pid, 'PSAMPLE2'].sort().join() && copies.every(d => d.portalShare === true && d.customerDocId) && !(IDB.projectDocs || []).some(d => d.name === 'HOA rules.pdf'), '☑ copy on each job → one job document per job (only for that file)', copies.map(d => d.pid));

/* ═════ B. the customer portal ═════ */
console.log('B. the customer portal');
W.put('projectDocs', IDB.projectDocs);
CD = W.get('customerDocs');
CD.push({ id: 'gdoc_hidden', customer: S.customer.name, name: 'Hidden paper.pdf', ref: W.storeFile(pdf('h'), 'pdf'), portalShare: false, updatedAt: 'x' },
  { id: 'gdoc_arch', customer: S.customer.name, name: 'Archived paper.pdf', ref: W.storeFile(pdf('a'), 'pdf'), portalShare: true, archived: true, updatedAt: 'x' },
  { id: 'gdoc_otherid', customer: S.customer.name, customerId: 'CU_SOMEONE_ELSE', name: 'Same name other customer.pdf', ref: W.storeFile(pdf('o'), 'pdf'), portalShare: true, updatedAt: 'x' });
W.put('customerDocs', CD); W.resetCaches();
const view = async t => (await W.handlerCall('portal', { action: 'view' }, { 'x-portal-token': t })).data;
const v1 = await view(S.link), v2 = await view(link2), vo = await view(S.otherLink);
const names = v => (v.generalDocs || []).map(d => d.title).sort().join(' | ');
ok(v1.ok && names(v1) === 'HOA rules.pdf | Welcome packet.pdf' && v1.generalDocs.every(d => /^https:/.test(d.url) && d.type === 'pdf'), 'Sample Customer, job 1: the 2 general documents with signed links', v1.generalDocs);
ok(v2.ok && names(v2) === names(v1), 'Sample Customer, job 2: the same list', v2.generalDocs);
ok(vo.ok && (vo.generalDocs || []).length === 0, 'another customer\'s job: none of them', vo.generalDocs);
ok(!/Hidden|Archived|other customer|Old\.pdf/.test(names(v1)), 'hidden / archived / another customerId / another customer: never shown');
/* a Head Start center (made up link) */
const hl = W.tok(); W.TABLES.gc_portal.push({ token: hl, project_id: 'HS3', revoked: false, created_at: '2026-10-02T12:00:00Z' }); W.resetCaches();
const vh = await view(hl);
ok(vh.ok && names(vh) === 'Center hours letter.pdf | Safety plan - all centers.pdf', 'Head Start Center 3: the 2 Head Start general documents', vh.generalDocs);

/* ═════ C. the pages ═════ */
console.log('C. portal.html + Customer 360');
const html = fs.readFileSync(path.join(build, 'portal.html'), 'utf8');
ok(/function generalBox\(\)/.test(html) && /📁 General documents/.test(html) && /📁 Documentos generales/.test(html) && /docs1\(\)\.concat\(\[generalBox\(\), signedBox\(\)\]\)/.test(html), 'portal.html: "📁 General documents" on Documents (English + Spanish)');
const tail = fs.readFileSync(path.join(build, 'tools/zipimport_tail.js'), 'utf8');
ok(/data-sec="docs"/.test(tail) && /🙈 Hide from portal/.test(tail) && /🗄 Archive/.test(tail) && !/\.delete\(|method: 'DELETE'/.test(tail), 'Customer 360 → 📄 Documents: the general documents with Hide from portal / Archive (never purged)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
