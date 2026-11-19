// test_BIDPO_fn.mjs <build-dir> — patch BIDPO, node only: the bid site's PO is the CRM's PO, everywhere (owner 11/19: "Should auto-fill in
// POs, match or use the job's PO. Always have the same PO throughout, but shouldn't have to enter one here.") + the site walk on ✎ Edit.
// The REAL subportal.js / bid-hub.js / _lib/bidpo.js on the in-memory Supabase of qaa_world.mjs (gc_kv = the CRM). Made-up data only.
//   A. the rules (_lib/bidpo.js): street number + street name (Ct = Court), city, the CRM's numbering
//   B. load (admin): linked → the CRM job's PO (+ "from the CRM"); address → linked + saved; ambiguous → no PO, candidates; same address +
//      same title → that one; title + city; the lead → its CRM job; nothing → a new PO the CRM's way, kept on the next load
//   C. a PO changed in the CRM follows (poHistory); a CRM job later made from the lead with the bid job's PO → linked, PO unchanged
//   D. save: a PO typed by hand is ignored; a new job gets its PO on save; 🔗 po-link (pick / none of these / match again)
//   E. a sub: sees the PO, never the candidates / history; a sub's load never hands out a PO
//   F. the site walk on ✎ Edit Job Details: saved clean, subs get the update the confirm way; the CRM's site walk shows when the bid site has none
//   G. the CRM tab (bid-hub): the list's po, 📢 postjob, 🏆 award PO / e-mail
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
W.install();
const F = W.fns(BUILD), SPH = F.sp._hub, Hb = F.hub._test;
const B = require(path.join(BUILD, 'netlify/functions/_lib/bidpo.js'));
const PO_RE = /^[A-Z]\d{3}$/;

/* ── A. the rules ── */
ok('A1 "2817 Los Gatos Ct" = "2817 Los Gatos Court, Memphis, TN 38117" (number + name, Ct = Court)', B.sameStreet('2817 Los Gatos Ct', '2817 Los Gatos Court, Memphis, TN 38117'));
ok('A2 no suffix on one side still matches; another number / another suffix does not', B.sameStreet('2817 Los Gatos', '2817 Los Gatos Ct') && !B.sameStreet('2819 Los Gatos Ct', '2817 Los Gatos Ct') && !B.sameStreet('500 Demo St', '500 Demo Ave'));
ok('A3 an address with no street number never matches', !B.street('Los Gatos Ct') && !B.sameStreet('Los Gatos Ct', 'Los Gatos Ct'));
ok('A4 the city: the part after the street; a state is not a city', B.cityOf({}, '9 Oak Rd, Germantown, TN 38138') === 'germantown' && B.cityOf({ city: 'Memphis' }) === 'memphis' && B.cityOf({}, '9 Oak Rd, TN') === '');
{ const seq = [0, 0, 0, 0, 0.5, 0.5]; let i = 0; const rnd = () => seq[i++ % seq.length];
  const po = B.nextPO({ projects: [{ id: 'x', autoPO: 'A100' }], leads: [] }, [], rnd);
  ok('A5 the CRM\'s numbering: a letter + 3 digits, never one a CRM job already has (A100 taken → the next try)', po === 'N550', po); }
{ const po = B.nextPO({ projects: [{ id: 'x', autoPO: 'A100' }], leads: [{ id: 'l', jobPO: 'B200' }] }, [{ poNumber: 'C300' }]);
  ok('A6 … any random one is A–Z + 100–999', PO_RE.test(po) && !['A100', 'B200', 'C300'].includes(po), po); }

/* ── the made-up CRM and bid site ── */
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PROJECTS = [
  { id: 'P_LINK', name: 'Demo Linked Kitchen', address: '10 Demo Ln, Memphis, TN', autoPO: 'C846', status: 'In Progress', client: 'Dee Demo' },
  { id: 'P_FIRE', name: 'Demo Apartment Fire', address: '2817 Los Gatos Ct', autoPO: 'H138', status: 'estimating', client: 'Demo Roofs' },
  { id: 'P_FIRE_OLD', name: 'Demo Apartment Fire - Plans', address: '2817 Los Gatos Ct', autoPO: 'Y202', status: 'lost', archived: true, client: 'Demo Roofs' },
  { id: 'P_AMB1', name: 'Demo Unit A', address: '500 Demo Ave', autoPO: 'K111', status: 'bidding' },
  { id: 'P_AMB2', name: 'Demo Unit B', address: '500 Demo Avenue, Memphis', autoPO: 'K222', status: 'bidding' },
  { id: 'P_T1', name: 'Demo Warehouse Reroof', address: '77 Demo Pkwy', autoPO: 'T777', status: 'bidding' },
  { id: 'P_T2', name: 'Demo Something Else', address: '77 Demo Pkwy', autoPO: 'T778', status: 'bidding' },
  { id: 'P_CITY', name: 'Demo Church Addition', address: 'Main campus, Germantown, TN', city: 'Germantown', autoPO: 'G500', status: 'bidding' },
  { id: 'P_LEAD', name: 'Demo From Lead', address: '1 Lead Way', autoPO: 'L123', status: 'bidding', leadId: 'LD1' },
  { id: 'P_DEL', name: 'Demo Deleted', address: '3 Gone St', autoPO: 'D333', status: 'bidding', deleted: true }];
W.H.resetCloud();
W.H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }]);
W.H.cset('projects', PROJECTS);
W.H.cset('leads', [{ id: 'LD1', name: 'Demo From Lead' }, { id: 'LD2', name: 'Demo Lead No Job Yet', subPortal: { jobId: 'J_LEAD2' } }]);
W.H.cset('schedule', [{ id: 'S1', pid: 'P_LINK', date: DAY(4), time: '09:30', type: 'meeting', title: 'Mandatory site walk — Demo Linked Kitchen', address: '10 Demo Ln, Memphis, TN' }]);
DB.gc_staff.push({ email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true });
W.TOK['t-adm'] = 'wjohnson@grayco-cs.com';
const job = (id, x) => putRow('jobs', id, Object.assign({ id, title: 'Demo job ' + id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(10), createdAt: now }, x || {}), { job_id: id });
job('J_LINK', { title: 'Demo Linked Kitchen', crmProjectId: 'P_LINK', address: '10 Demo Ln' });
job('J_FIRE', { title: 'Apartment Fire', address: '2817 Los Gatos Ct', poNumber: '' });
job('J_AMB', { title: 'Demo Unit C', address: '500 Demo Ave' });
job('J_T', { title: 'Demo Warehouse Re-roof', address: '77 Demo Parkway' });
job('J_TT', { title: 'Demo Warehouse Reroof', address: '77 Demo Parkway' });
job('J_CITY', { title: 'Demo Church Addition', address: 'Germantown, TN' });
job('J_LEAD', { title: 'Demo From Lead (bid)', crmLeadId: 'LD1', address: '' });
job('J_LEAD2', { title: 'Demo Lead No Job Yet', address: '44 Nowhere Rd' });
job('J_NONE', { title: 'Demo Brand New', address: '9 Nobody St, Memphis' });
job('J_LEGACY', { title: 'Demo Typed PO Long Ago', address: '8 Old Rd', poNumber: 'PO-2026-0001' });
job('J_ARCH', { title: 'Demo Archived', address: '2817 Los Gatos Ct', status: 'archived', archivedAt: now });
job('J_GONEP', { title: 'Demo Deleted', crmProjectId: 'P_DEL', address: '3 Gone St' });

const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tok, origin: 'https://bids.test' }, body: JSON.stringify(body) }); return { code: r.statusCode, body: JSON.parse(r.body || '{}') }; };
const loadJobs = async tok => { SPH.poCacheClear(); const r = await call(tok, { action: 'load', keys: ['jobs'] }); return Object.fromEntries((r.body.data.jobs || []).map(j => [j.id, j])); };
const stored = id => rowData('jobs/' + id) || {};

/* ── B. load (admin) ── */
let J = await loadJobs('t-adm');
ok('B1 linked (crmProjectId) → the CRM job\'s PO C846, "from the CRM"', J.J_LINK.poNumber === 'C846' && J.J_LINK.poSource === 'crm' && J.J_LINK._po.state === 'linked' && stored('J_LINK').poNumber === 'C846', J.J_LINK);
ok('B2 "Apartment Fire, 2817 Los Gatos Ct" → the ONE open CRM job there (the lost / archived one is not a match) → PO H138, linked and saved', J.J_FIRE.poNumber === 'H138' && J.J_FIRE.crmProjectId === 'P_FIRE' && J.J_FIRE._po.how === 'address' && stored('J_FIRE').crmProjectId === 'P_FIRE' && stored('J_FIRE').poNumber === 'H138', J.J_FIRE);
ok('B3 ambiguous (two open CRM jobs at 500 Demo Ave, neither title) → no PO, nothing linked, both offered to an admin', !J.J_AMB.poNumber && !J.J_AMB.crmProjectId && J.J_AMB._po.state === 'ambiguous' && J.J_AMB._po.cands.map(c => c.pid).sort().join() === 'P_AMB1,P_AMB2' && J.J_AMB._po.cands.every(c => c.po && c.address && !('client' in c)), J.J_AMB._po);
ok('B4 same address, two CRM jobs, one with the same title → that one (T777)', J.J_TT.poNumber === 'T777' && J.J_TT._po.how === 'address+title', J.J_TT._po);
ok('B5 … "Re-roof" vs "Reroof" is not the same title → ambiguous, no PO', !J.J_T.poNumber && J.J_T._po.state === 'ambiguous', J.J_T._po);
ok('B6 no street number: same title + same city → G500', J.J_CITY.poNumber === 'G500' && J.J_CITY._po.how === 'title+city', J.J_CITY._po);
ok('B7 the bid job\'s CRM lead became a CRM job → its PO L123', J.J_LEAD.poNumber === 'L123' && J.J_LEAD._po.how === 'lead' && J.J_LEAD.crmProjectId === 'P_LEAD', J.J_LEAD._po);
const newPo = J.J_NONE.poNumber;
ok('B8 no CRM job at all → a new PO the CRM\'s way (letter + 3 digits), not any CRM job\'s, saved', PO_RE.test(newPo) && J.J_NONE.poSource === 'assigned' && !PROJECTS.some(p => p.autoPO === newPo) && stored('J_NONE').poNumber === newPo, J.J_NONE);
const lead2Po = J.J_LEAD2.poNumber;
ok('B9 a lead with no CRM job yet → its own PO too (assigned), lead remembered', PO_RE.test(lead2Po) && J.J_LEAD2.poSource === 'assigned' && J.J_LEAD2._po.lead === 'LD2' && lead2Po !== newPo, J.J_LEAD2);
ok('B10 a PO given on the bid site long ago with no CRM job is kept (subs may have it)', J.J_LEGACY.poNumber === 'PO-2026-0001' && J.J_LEGACY.poSource === 'bid-site', J.J_LEGACY);
ok('B11 an archived bid job is left alone', !J.J_ARCH || !J.J_ARCH.poNumber, J.J_ARCH);
ok('B12 a link to a CRM job deleted since → treated as no link (its own PO), never the deleted job\'s PO', J.J_GONEP.poNumber !== 'D333' && PO_RE.test(J.J_GONEP.poNumber), J.J_GONEP);
J = await loadJobs('t-adm');
ok('B13 the next load: the same POs (nothing handed out twice)', J.J_NONE.poNumber === newPo && J.J_LEAD2.poNumber === lead2Po && J.J_FIRE.poNumber === 'H138', [J.J_NONE.poNumber, newPo]);

/* ── C. CRM changes follow ── */
W.H.cset('projects', PROJECTS.map(p => p.id === 'P_LINK' ? Object.assign({}, p, { autoPO: 'C847' }) : p));
J = await loadJobs('t-adm');
ok('C1 the PO changed in the CRM (C846 → C847) → the bid job follows, saved, the old one in poHistory', J.J_LINK.poNumber === 'C847' && stored('J_LINK').poNumber === 'C847' && (stored('J_LINK').poHistory || []).some(h => h.from === 'C846' && h.to === 'C847'), stored('J_LINK').poHistory);
W.H.cset('projects', PROJECTS.map(p => p.id === 'P_LINK' ? Object.assign({}, p, { autoPO: 'C847' }) : p).concat([{ id: 'P_FROM_LD2', name: 'Demo Lead No Job Yet', address: '44 Nowhere Rd', autoPO: lead2Po, status: 'bidding', leadId: 'LD2' }]));
J = await loadJobs('t-adm');
ok('C2 the CRM job made later from the lead kept the bid job\'s PO (index.html BIDPO) → linked to it, PO unchanged', J.J_LEAD2.poNumber === lead2Po && J.J_LEAD2.crmProjectId === 'P_FROM_LD2' && J.J_LEAD2.poSource === 'crm' && !(stored('J_LEAD2').poHistory || []).length, J.J_LEAD2);

/* ── D. save + 🔗 link ── */
const fire = Object.assign({}, J.J_FIRE, { poNumber: 'HACK1', crmProjectId: 'P_AMB1', notes: 'edited', _po: { state: 'x' } });
let r = await call('t-adm', { action: 'save', key: 'jobs', upsert: [fire], del: [] });
ok('D1 an admin\'s save with a PO / CRM link typed in → ignored: still H138 / P_FIRE (the edit itself saved, _po never stored)', r.code === 200 && stored('J_FIRE').poNumber === 'H138' && stored('J_FIRE').crmProjectId === 'P_FIRE' && stored('J_FIRE').notes === 'edited' && !('_po' in stored('J_FIRE')), stored('J_FIRE'));
r = await call('t-adm', { action: 'save', key: 'jobs', upsert: [{ id: 'J_NEW1', title: 'Demo New On Bid Site', address: '2817 Los Gatos Court, Memphis, TN 38117', status: 'open', visibility: 'public', poNumber: 'PO-2026-0099', createdAt: now }], del: [] });
ok('D2 a job added on the bid site at an address whose CRM job is already another bid job\'s → not matched by itself (an admin decides), the typed PO-… ignored', !stored('J_NEW1').poNumber && !stored('J_NEW1').crmProjectId, stored('J_NEW1'));
r = await call('t-adm', { action: 'po-link', jobId: 'J_NEW1', projectId: 'P_FIRE' });
ok('D2b … 🔗 linked by an admin → the same PO H138 as the other bid job of that CRM job', r.code === 200 && stored('J_NEW1').poNumber === 'H138', stored('J_NEW1'));
r = await call('t-adm', { action: 'save', key: 'jobs', upsert: [{ id: 'J_NEW2', title: 'Demo Nothing Like It', address: '1 Zzz Rd', status: 'open', createdAt: now }], del: [] });
ok('D3 … no CRM job → a new PO on save', PO_RE.test(stored('J_NEW2').poNumber) && stored('J_NEW2').poSource === 'assigned', stored('J_NEW2'));
r = await call('t-adm', { action: 'po-cands', jobId: 'J_AMB', q: 'demo unit' });
ok('D4 🔗 candidates: the ambiguous ones + a search', r.code === 200 && ['P_AMB1', 'P_AMB2'].every(p => r.body.cands.some(c => c.pid === p)), r.body);
r = await call('t-adm', { action: 'po-link', jobId: 'J_AMB', projectId: 'P_AMB2' });
ok('D5 an admin picks Demo Unit B → linked, PO K222, logged', r.code === 200 && r.body.job.poNumber === 'K222' && stored('J_AMB').crmProjectId === 'P_AMB2' && stored('J_AMB').crmProjectAuto === 'admin' && /Linked to the CRM job/.test(JSON.stringify(stored('J_AMB').log)), r.body);
r = await call('t-adm', { action: 'po-link', jobId: 'J_AMB', projectId: '__none' });
ok('D6 "none of these" → its own new PO (not K222), no link, and it stays unmatched on the next load', r.code === 200 && PO_RE.test(stored('J_AMB').poNumber) && stored('J_AMB').poNumber !== 'K222' && !stored('J_AMB').crmProjectId && stored('J_AMB').poNoMatch === true, stored('J_AMB'));
const own = stored('J_AMB').poNumber; J = await loadJobs('t-adm');
ok('D7 … still its own PO after a load', J.J_AMB.poNumber === own && J.J_AMB._po.state === 'none', J.J_AMB);
r = await call('t-adm', { action: 'po-link', jobId: 'J_AMB', projectId: 'P_NOPE' });
ok('D8 a CRM job that is not there → 404, nothing changed', r.code === 404 && stored('J_AMB').poNumber === own, r);
W.TOK['t-zz'] = 'zz@demo.test';
putRow('users', 'u_zz', { id: 'u_zz', role: 'sub', approved: true, email: 'zz@demo.test', name: 'Zz Demo', company: 'Zz Framing', trades: ['Framing'] }, { user_id: 'u_zz', email: 'zz@demo.test' });
r = await call('t-zz', { action: 'po-link', jobId: 'J_AMB', projectId: 'P_AMB1' });
ok('D9 a sub cannot link / pick', r.code === 403 && stored('J_AMB').poNumber === own, r);

/* ── E. the sub ── */
job('J_SUBONLY', { title: 'Demo Sub First', address: '9 Fresh St' });
job('J_SUBLINK', { title: 'Demo Linked Kitchen 2', crmProjectId: 'P_LINK', address: '10 Demo Ln', poNumber: 'OLD1' });
SPH.poCacheClear();
r = await call('t-zz', { action: 'load', keys: ['jobs'] });
const SJ = Object.fromEntries((r.body.data.jobs || []).map(j => [j.id, j]));
ok('E1 the sub sees the job\'s PO (the CRM\'s), synced on their load', SJ.J_FIRE && SJ.J_FIRE.poNumber === 'H138' && SJ.J_SUBLINK && SJ.J_SUBLINK.poNumber === 'C847' && stored('J_SUBLINK').poNumber === 'C847', [SJ.J_FIRE && SJ.J_FIRE.poNumber, SJ.J_SUBLINK && SJ.J_SUBLINK.poNumber]);
ok('E2 … never the candidates, the PO history, who linked it', Object.values(SJ).every(j => !('_po' in j) && !('poHistory' in j) && !('crmProjectBy' in j) && !('poNoMatch' in j)), Object.keys(SJ.J_LINK || {}));
ok('E3 a sub\'s load never hands out a new PO (the next admin load / save does)', SJ.J_SUBONLY && !SJ.J_SUBONLY.poNumber && !stored('J_SUBONLY').poNumber, stored('J_SUBONLY'));

/* ── F. the site walk ── */
ok('F1 the CRM\'s site walk (its schedule: "Mandatory site walk …") comes to an admin with the job', J.J_LINK._po.crmSiteWalk && J.J_LINK._po.crmSiteWalk.date === DAY(4) && J.J_LINK._po.crmSiteWalk.time === '09:30' && J.J_LINK._po.crmSiteWalk.mandatory === true && J.J_LINK._po.crmSiteWalk.from === 'schedule', J.J_LINK._po);
ok('F2 … and to the sub when the bid site has none (date, time, place, mandatory — nothing else)', SJ.J_LINK && SJ.J_LINK.siteWalk && SJ.J_LINK.siteWalk.date === DAY(4) && SJ.J_LINK.siteWalk.mandatory === true && JSON.stringify(Object.keys(SJ.J_LINK.siteWalk).sort()) === '["date","location","mandatory","time"]', SJ.J_LINK && SJ.J_LINK.siteWalk);
putRow('invites', 'inv1', { id: 'inv1', jobId: 'J_FIRE', email: 'zz@demo.test' }, { job_id: 'J_FIRE', email: 'zz@demo.test' });
const before = DB.sp_rows.filter(x => x.collection === 'messages').length;
const f1 = Object.assign({}, stored('J_FIRE'), { siteWalk: { date: DAY(3), time: '10:00', location: '', mandatory: true, junk: 'x' }, questionsDue: DAY(5) });
r = await call('t-adm', { action: 'save', key: 'jobs', upsert: [f1], del: [] });
const msgs1 = DB.sp_rows.filter(x => x.collection === 'messages').length;
ok('F3 saved some other way (no ✎ Edit marker) → stored clean, no update to subs', r.code === 200 && stored('J_FIRE').siteWalk.date === DAY(3) && stored('J_FIRE').siteWalk.mandatory === true && !('junk' in stored('J_FIRE').siteWalk) && stored('J_FIRE').questionsDue === DAY(5) && msgs1 === before, { sw: stored('J_FIRE').siteWalk, before, msgs1 });
const f2 = Object.assign({}, stored('J_FIRE'), { siteWalk: { date: DAY(6), time: '08:00', location: '2817 Los Gatos Ct — meet at the leasing office', mandatory: true }, _detailsSave: true });
r = await call('t-adm', { action: 'save', key: 'jobs', upsert: [f2], del: [] });
const upd = DB.sp_rows.filter(x => x.collection === 'messages' && x.data && x.data.jobId === 'J_FIRE' && x.data.kind === 'update');
const posts = stored('J_FIRE').posts || [];
ok('F4 ✎ Edit Job Details changed the site walk → the sub gets the update on the bid site; the e-mail is queued for approval (or held), never sent here', r.code === 200 && upd.length === 1 && /Site walk \/ pre-bid meeting: .*08:00.*\(mandatory\)/.test(upd[0].data.body) && posts.length === 1 && /^(waiting|held)$/.test(posts[0].notice && posts[0].notice.status), { upd: upd.map(x => x.data.body), notice: posts[0] && posts[0].notice });
ok('F5 … logged on the job; the marker is not stored', /Details changed on the bid site/.test(JSON.stringify(stored('J_FIRE').log)) && !('_detailsSave' in stored('J_FIRE')), stored('J_FIRE').log);
r = await call('t-adm', { action: 'save', key: 'jobs', upsert: [Object.assign({}, stored('J_FIRE'), { notes: 'again', _detailsSave: true })], del: [] });
ok('F6 saved again with the same site walk → no second update', DB.sp_rows.filter(x => x.collection === 'messages' && x.data && x.data.jobId === 'J_FIRE' && x.data.kind === 'update').length === 1);
const draft = putRow('jobs', 'J_DRAFT', { id: 'J_DRAFT', title: 'Demo Draft', status: 'draft', draft: true, visibility: 'private', address: '1 Draft Rd', createdAt: now }, { job_id: 'J_DRAFT' }); void draft;
r = await call('t-adm', { action: 'save', key: 'jobs', upsert: [Object.assign({}, stored('J_DRAFT'), { siteWalk: { date: DAY(2), time: '', location: '', mandatory: false }, _detailsSave: true })], del: [] });
ok('F7 a draft (not posted) → saved, nobody told', stored('J_DRAFT').siteWalk.date === DAY(2) && !DB.sp_rows.some(x => x.collection === 'messages' && x.data && x.data.jobId === 'J_DRAFT'));

/* ── G. the CRM tab ── */
const list = await Hb.jobsList();
ok('G1 the CRM\'s 🏗 Bid portal list shows the same PO as the bid site', (list.find(x => x.id === 'J_FIRE') || {}).po === 'H138' && (list.find(x => x.id === 'J_LINK') || {}).po === 'C847', list.map(x => x.id + ':' + x.po));
const ADMIN = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', admin: true, estimator: false, canPublic: true, canInvite: true };
const pj = await Hb.postjob(ADMIN, { pid: 'P_T1', title: 'Demo Warehouse Reroof', visibility: 'private', trades: ['Roofing'], po: 'ZZ999' });
ok('G2 📢 Put on bid portal from a CRM job → the bid job has that job\'s PO (T777), whatever PO was sent', pj.ok && stored(pj.jobId).poNumber === 'T777' && stored(pj.jobId).poSource === 'crm', stored(pj.jobId));
putRow('bids', 'b1', { id: 'b1', jobId: 'J_FIRE', userId: 'u_zz', userEmail: 'zz@demo.test', userCompany: 'Zz Framing', amount: 1000 }, { job_id: 'J_FIRE', user_id: 'u_zz' });
const aw = await Hb.award(ADMIN, { jobId: 'J_FIRE', source: 'portal', id: 'b1', on: true, mail: false });
const b1 = rowData('bids/b1') || {};
ok('G3 🏆 award: the sub\'s bid carries the job\'s PO (H138) even when the CRM sent none', aw.ok && b1.awardPo === 'H138', { aw, b1 });
const m = Hb.awardMail({ job: stored('J_FIRE'), trade: 'Framing', amount: 1000, pm: {}, exclusions: [], po: 'H138' }, false);
ok('G4 … and the award e-mail says "Job PO: H138"', /Job PO: <b>H138<\/b>/.test(m.html), m.html.slice(0, 300));

/* ── H. no CRM → nothing handed out ── */
W.H.cset('projects', []); job('J_NOCRM', { title: 'Demo While CRM Down', address: '5 Down St' });
J = await loadJobs('t-adm');
ok('H1 the CRM\'s job list did not come back → no PO handed out, nothing changed', !J.J_NOCRM.poNumber && J.J_FIRE.poNumber === 'H138', J.J_NOCRM);

const n = R.filter(Boolean).length; console.log('BIDPO_fn ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
