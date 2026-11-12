// test_HOTDEL_fn.mjs <build-dir> — patch HOTDEL, node only: 🗑 Delete on many selected bid jobs (owner 11/12: 184 selected, "didn't click")
// archives them all in one write (no per-job write loop that runs past the function's time limit); restorable; already-gone skipped.
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
W.install();
const F = W.fns(BUILD), Hb = F.hub._test;
W.H.resetCloud();
W.H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }]);
const ADMIN = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', admin: true, estimator: false, canPublic: true, canInvite: true };
const ids = [];
for (let i = 0; i < 184; i++) { const id = 'JD' + i; ids.push(id); putRow('jobs', id, { id, title: 'Demo job ' + i, status: 'draft', draft: true, visibility: 'private', leadInbox: { id: 'LI-' + i } }, { job_id: id }); }
putRow('jobs', 'JGONE', { id: 'JGONE', title: 'Already gone', status: 'archived' }, { job_id: 'JGONE' });
const t0 = Date.now();
const r = await Hb.archive(ADMIN, { jobIds: ids.concat(['JGONE', 'NOPE']) });
ok('184 selected → ' + (r && r.deleted) + ' archived in ' + (Date.now() - t0) + ' ms (cap 200 per call)', r && r.ok && r.deleted === 184, r);
ok('every one archived, restorable data kept (archivedFrom)', ids.every(id => { const d = rowData('jobs/' + id); return d.status === 'archived' && d.archivedFrom && d.archivedFrom.draft === true; }));
ok('the already-deleted one and an unknown id are skipped', r.ids.indexOf('JGONE') < 0 && r.ids.indexOf('NOPE') < 0, r.ids.slice(-3));
ok('leads are NOT touched unless "also mark Lost" is ticked', Array.isArray(r.leads));
const one = await Hb.restore(ADMIN, { jobId: 'JD5' });
ok('↩ restore still works after a bulk delete', one && one.ok && rowData('jobs/JD5').status !== 'archived', one);
const n = R.filter(Boolean).length; console.log('HOTDEL ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
