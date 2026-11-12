// test_QAA_BIDCLEAN_fn.mjs <build-dir> — patch QAA, node only (no browser): the bid-hub server rules behind "start fresh".
//   1. 🧹 Clean up: an auto-added job whose only files are the bid-board files the Lead Inbox copied in (fromLead / staff/lead-inbox/…)
//      IS auto-added (archived); one with a plan a person uploaded on the bid site, a bid, an invite, a question, or posted on purpose is NOT
//   2. 📢 postjob with CRM files: the copied files are in the plans row AND listed on the job (job.plans — what the bid site shows)
//   3. the bid site shows the sub that job WITH its plans (subportal load jobs + plans:<id>)
import path from 'path'; import crypto from 'crypto';
const W = await import('./qaa_world.mjs');
const { DB, STORE, putRow, rowData, PDF } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
W.install();
const F = W.fns(BUILD), Hb = F.hub._test;
W.H.resetCloud();
W.H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }, { id: 'u3', name: 'Pat Demo', email: 'pat.demo@grayco-cs.com', role: 'Project Manager' }]);
W.H.cset('projects', [{ id: 'P1', name: 'Demo Apartments', pm: 'Pat Demo' }]);
const ADMIN = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', admin: true, estimator: false, canPublic: true, canInvite: true };
const lead = (id, extra) => putRow('jobs', id, Object.assign({ id, title: 'Demo lead ' + id, status: 'draft', draft: true, visibility: 'private', createdBy: 'lead-inbox', leadInbox: { id: 'LI-' + id } }, extra || {}), { job_id: id });
lead('J_lp'); putRow('plans', 'J_lp', { items: [{ name: 'Bid docs.pdf', fileRef: 'staff/lead-inbox/abc123-Bid_docs.pdf', fromLead: true }] }, { job_id: 'J_lp' });
lead('J_ls', { specDocs: [{ name: 'Manual.pdf', fileRef: 'staff/lead-inbox/def456-Manual.pdf' }] }); putRow('plans', 'J_ls', { items: [] }, { job_id: 'J_ls' });
lead('J_path'); putRow('plans', 'J_path', { items: [{ name: 'Old copy.pdf', fileRef: 'staff/lead-inbox/0a0b-Old_copy.pdf' }] }, { job_id: 'J_path' });
lead('J_person'); putRow('plans', 'J_person', { items: [{ name: 'A1.pdf', fileRef: 'staff/lead-inbox/abc-Bid.pdf', fromLead: true }, { name: 'Uploaded by Glenn.pdf', fileRef: 'staff/2026-11/ffee-A1.pdf' }] }, { job_id: 'J_person' });
lead('J_pspec', { specDocs: [{ name: 'Specs Glenn added.pdf', fileRef: 'staff/2026-11/aa11-Specs.pdf' }] });
lead('J_bid'); putRow('bids', 'b1', { id: 'b1', jobId: 'J_bid', userId: 'u_x', amount: 10 }, { job_id: 'J_bid', user_id: 'u_x' });
lead('J_inv'); putRow('invites', 'i1', { id: 'i1', jobId: 'J_inv', email: 'x@demo.test' }, { job_id: 'J_inv', email: 'x@demo.test' });
lead('J_q'); putRow('questions', 'q1', { id: 'q1', jobId: 'J_q', userId: 'u_x', body: '?' }, { job_id: 'J_q', user_id: 'u_x' });
lead('J_posted', { status: 'open', draft: false, visibility: 'public', postedAt: '2026-11-10', postedBy: 'wjohnson@grayco-cs.com' });
lead('J_autopriv', { status: 'open', draft: false, autoPrivate: true, openedBy: 'auto', openedPrivateAt: '2026-11-01' });
const dry = await Hb.cleanup(ADMIN, { dry: true });
ok('1 clean-up (dry): the auto-added jobs incl. those holding only Lead-Inbox bid-board files (fromLead / staff/lead-inbox/ path, plans or specs) and the auto-private one', dry.count === 4 && ['Demo lead J_lp', 'Demo lead J_ls', 'Demo lead J_path', 'Demo lead J_autopriv'].every(t => dry.sample.includes(t)), dry);
const done = await Hb.cleanup(ADMIN, {});
const st = id => rowData('jobs/' + id).status;
ok('1 … archived (reason auto); a plan / spec a PERSON added, a bid, an invite, a question, a job posted on purpose → kept', done.archived === 4 && ['J_lp', 'J_ls', 'J_path', 'J_autopriv'].every(id => st(id) === 'archived')
  && ['J_person', 'J_pspec', 'J_bid', 'J_inv', 'J_q', 'J_posted'].every(id => st(id) !== 'archived'), { done, st: ['J_lp', 'J_ls', 'J_path', 'J_person', 'J_pspec', 'J_bid', 'J_inv', 'J_q', 'J_posted', 'J_autopriv', 'J_draft'].map(id => id + ':' + (rowData('jobs/' + id) || {}).status) });
const list = await Hb.jobsList();
ok('1 the list: the lead-file job still counts its plans (1) but is archived, not auto', (() => { const j = list.find(x => x.id === 'J_lp'); return j && j.plans === 1 && j.archived && !j.auto; })(), list.find(x => x.id === 'J_lp'));
/* 2. postjob with CRM files */
const H64 = n => crypto.createHash('sha256').update(n).digest('hex');
STORE.set('crm-files/' + H64('a') + '.pdf', PDF('A', 5000)); STORE.set('crm-files/' + H64('z') + '.zip', Buffer.from('PK\x05\x06' + '\0'.repeat(18), 'binary'));
const r = await Hb.postjob(ADMIN, { pid: 'P1', title: 'Demo Apartments', visibility: 'public', due: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10), trades: ['Framing', 'Drywall'],
  files: [{ ref: 'sb:crm-files/' + H64('a') + '.pdf', name: 'Arch set.pdf', type: 'application/pdf', size: 5000, category: 'Plans/Drawings' }, { ref: 'sb:crm-files/' + H64('z') + '.zip', name: 'Sheets.zip', type: 'application/zip', size: 22 }], links: [{ url: 'https://drive.google.com/demo-set', label: 'Full set' }] });
const job = rowData('jobs/' + r.jobId), pl = (rowData('plans/' + r.jobId) || { items: [] }).items;
ok('2 📢 postjob: 2 files copied into the plans row', r.ok && r.files === 2 && pl.length === 2 && pl.every(x => STORE.has('subportal-files/' + x.fileRef)), { r, pl });
ok('2 … and listed on the job (job.plans: names, sizes, types) — the bid site no longer says "No plans yet"', Array.isArray(job.plans) && job.plans.map(x => x.name).join('|') === 'Arch set.pdf|Sheets.zip' && job.plans[0].size === 5000 && job.plans[0].type === 'application/pdf', job.plans);
const r2 = await Hb.postjob(ADMIN, { jobId: r.jobId, pid: 'P1', title: 'Demo Apartments', visibility: 'public', trades: ['Framing'], files: [{ ref: 'sb:crm-files/' + H64('a') + '.pdf', name: 'Arch set.pdf' }] });
ok('2 posting again: no copy twice; job.plans kept', r2.ok && r2.files === 0 && rowData('jobs/' + r.jobId).plans.length === 2 && (rowData('plans/' + r.jobId)).items.length === 2, rowData('jobs/' + r.jobId).plans);
/* 3. the sub's view */
putRow('users', 'u_zz', { id: 'u_zz', role: 'sub', approved: true, email: 'zz@demo.test', name: 'Zz Demo', company: 'Zz Framing', trades: ['Framing'] }, { user_id: 'u_zz', email: 'zz@demo.test' });
DB.gc_staff.push({ email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true });
W.TOK['t-zz'] = 'zz@demo.test';
const L = JSON.parse((await F.sp.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer t-zz', origin: 'https://bids.test' }, body: JSON.stringify({ action: 'load', keys: ['jobs', 'plans:' + r.jobId] }) })).body);
const sj = (L.data.jobs || []).find(j => j.id === r.jobId), sp = L.data['plans:' + r.jobId] || [];
ok('3 the approved sub gets the job with its plans listed and a signed link for each file', !!sj && (sj.plans || []).length === 2 && sp.length === 2 && sp.every(x => /^https:\/\/sb\.test\/storage\/v1\/object\/sign\/subportal-files\//.test(x.dataUrl || '')), { sj: sj && sj.plans, sp });
ok('3 none of the archived auto-added jobs reach the sub', !(L.data.jobs || []).some(j => /^J_(lp|ls|path|autopriv)$/.test(j.id)), (L.data.jobs || []).map(j => j.id));
const n = R.filter(Boolean).length; console.log('QAA_BIDCLEAN ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
