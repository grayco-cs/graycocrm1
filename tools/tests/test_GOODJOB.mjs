// test_GOODJOB.mjs <build-dir> — patch GOODJOB (owner 11/27: "if i approve a lead its a good lead it should be made a job and go into pipeline
// as bidding"). Offline harness, made-up data only.
//   A. node: the patch is in (LEADWATCH + the Lead Inbox's createJob), no names / e-mails, no second date, no navy, no pop-up in the new code.
//   B. the owner (admin) approves on his own desk, each way → exactly one job, status bidding, in Pipeline (_gcJobBuckets), made on HIS
//      computer right away (lwJob.via "approved here"), the lead stamped GOOD (lwGood: who / when):
//        Lead Inbox Assign PM · ✅ Approve on a held lead (LEADHOLD) · 🔎 Decide ✓ Good (LSACHECK decide) · the PM-card 👍 Good (admin = final)
//        · Leads stage → Won (the drawer's stage list) · Leads drawer Assign · "✅ Create bid job" · an OLD lead (before OLDER_BEFORE) a person
//        approves now. The drawer shows "✅ Job made: <name> — Bidding · Open" (no dialog). 🚀 Convert to job on it opens that job (no 2nd job).
//      Never a job: a BAD lead, a sales pitch, a sub looking for work, an old untouched lead; a lead that has a job already gets no second one.
//   C. the GOOD text (the server's stamp, "(text)") → the admin desk's sweep makes it.
//   D. a PM (role Project Manager) marks 👍 Good on the LSA bar → the job on the PM's own computer; an estimator (role makes no jobs) marks
//      👍 Good → the lead is GOOD, the admin desk makes the job.
//   E. two computers try the same lead at the same moment → one job.
// Usage: node test_GOODJOB.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_GOODJOB.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

console.log('A. node');
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const iL = t.indexOf('<script id="gc-patch-leadwatch">'), blk = t.slice(iL, t.indexOf('</script>', iL));
const g0 = blk.indexOf('/* patch GOODJOB'), g1 = blk.indexOf('SI.call(W, jobSweep, 6000);'), gj = blk.slice(g0, blk.indexOf('/* ── patch FAKEJOB: ONCE', g0));
ok(g0 > 0 && g1 > g0, 'patch GOODJOB is in the LEADWATCH block');
ok(!/wjohnson|nthomas|ngray|Wesley|Nick/i.test(blk), 'no names or e-mails in the block (roles decide)');
ok(!/'20\d\d-\d\d-\d\d'/.test(gj), 'no second date: the cut-off is OLDER_BEFORE');
ok(!/\b(alert|confirm|prompt)\(/.test(gj.replace(/W\.(confirm|prompt)\b/g, 'X')) && !/W\.(alert|confirm|prompt)\(/.test(gj), 'no pop-up in the new code');
ok(!/#(000080|001f3f|0a1f44|1e3a8a|172554|1e293b|0f1e3d|241968)/i.test(gj), 'no navy in the new code');
ok(/if \(name === '_setProjects'\) \{ dead = true; return res\(false\); \}/.test(t), 'the Lead Inbox never adds a job to a disk copy of the project list');
ok(/patch GOODJOB: a job made from this lead already/.test(t), 'createJob links a job already made from the lead (never a second one)');
ok(!/claude|opus|sonnet|haiku|gpt/i.test(gj), 'no model names in the new code');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), ADMIN2 = byId('u-nick'), PM = byId('u-pm'), EST = byId('u-sbiffle'), OFFICE = byId('u-office');
H.onFn('automation-pause', () => ({ paused: false, flag: { on: false } }));
const TEXTS = [];
H.onFn('texts', (r) => { TEXTS.push({ q: r.query, b: r.body }); return { ok: true }; });
const NOW = Date.now(), iso = h => new Date(NOW - h * 3600e3).toISOString(), fut = h => new Date(NOW + h * 3600e3).toISOString();
const PITCH = 'Hi team, we are a digital marketing agency. We can get your business to the first page of Google with our SEO packages. Reply to book a free consultation call.';
const SUBMSG = "Hi GrayCo Construction Services team,\nFollowing up on the note we sent through your website last month. If you have any steel jobs coming up, we'd be glad to help with:\n- Structural and misc. steel shop drawings (stairs, railings, platforms)\n- Steel take-offs and estimates\n- PE-stamped calcs for stairs and railings\nShop drawing samples: https://sampledrafting.test/samples.html\nJust reply to drafter@sampledrafting.test or call (901) 555-0110 and we'll send a price and turnaround the same day.\nThanks,\nSample Drafter\nSample Drafting\nProject location: Brooklyn";
const L = (id, o) => Object.assign({ id, name: 'Lead ' + id, contactName: 'Sample ' + id, phone: '(901) 555-01' + String(10 + (id.length * 7) % 89), source: 'Website (grayco-cs.com)', origin: 'website', websiteLead: true, leadKind: 'Residential', stage: 'New Lead', createdAt: iso(3), companyId: 'construction' }, o);
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u1b', name: 'Nick Gray', email: ADMIN2, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', active: true },
    { id: 'u4', name: 'Demo Estimator', email: EST, role: 'Estimator', active: true },
    { id: 'u3', name: 'Office Demo', email: OFFICE, role: 'Office', active: true }]);
  H.cset('leads', [
    L('G_INB'), L('G_HOLD', { hold: { state: 'held', name: 'Demo PM', email: PM, field: 'pm', label: 'Residential', k: 'res', until: fut(5), at: iso(1) } }),
    L('G_DEC', { source: 'Google LSA', origin: '', websiteLead: false, lsaCheck: 'pending' }),
    L('G_CARD', { source: 'Google LSA', origin: '', websiteLead: false, lsaCheck: 'pending' }),
    L('G_WON', { leadKind: 'Commercial', type: 'Commercial Reno', gc: 'Sample GC LLC', estimator: 'Demo Estimator', origin: 'watch', websiteLead: false, source: 'BuildingConnected', bidRole: 'prime' }),
    L('G_DRW'), L('G_MAKE'),
    L('G_OLD', { createdAt: '2026-10-02T15:00:00.000Z' }),
    L('G_TEXT', { source: 'Google LSA', origin: '', websiteLead: false, lsaCheck: 'pending' }),
    L('G_PMBAR', { source: 'Google LSA', origin: '', websiteLead: false, lsaCheck: 'pending', inboxId: 'LI-pmbar' }),
    L('G_EST', { source: 'Google LSA', origin: '', websiteLead: false, lsaCheck: 'pending' }),
    L('G_TWO'),
    L('B_BAD', { lsaCheck: 'bad', lostReason: 'Not a real lead (spam)', stage: 'Lost' }),
    L('B_SPAM', { sgKind: 'sales', contactName: 'Sample Agency', company: 'Sample SEO Agency', email: 'hello@sampleseo.test', said: { message: PITCH }, message: PITCH }),
    L('B_SUB', { contactName: 'Sample Drafter', company: 'Sample Drafting', email: 'drafter@sampledrafting.test', leadKind: 'Commercial', said: { message: SUBMSG }, message: SUBMSG }),
    L('B_OLDX', { createdAt: '2026-10-02T15:00:00.000Z', pm: 'Demo PM', pmEmail: PM, assignedAt: '2026-10-02T15:00:00.000Z' }),
    L('B_DUP', { pid: 'PDUP' })]);
  H.cset('projects', [
    { id: 'PDUP', name: 'Lead B_DUP', client: 'Sample B_DUP', status: 'bidding', leadId: 'B_DUP', created: '2026-11-25', createdAt: iso(30), contract: 0 },
    { id: 'POLD', name: 'Older Job', client: 'Sample Customer A', status: 'Active', created: '2026-09-08', startDate: '2026-10-01', contract: 9000 }]);
  for (const k of ['customers', 'schedule', 'estimates', 'expenses', 'vendors', 'subs', 'punch', 'projectDocs', 'invs', 'gc_office_tasks']) H.cset(k, []);
  H.cset('gc_epahud_seed_v1', { at: '2026-11-18T00:00:00.000Z' });
}
const INIT = `window.__GC_LWJOB_WAIT__ = 1500; window.__GC_LWJOB_GRACE__ = 6000;`;
const sev = async (A, f, x) => { for (let i = 0; i < 30; i++) { try { return await A.ev(f, x); } catch (e) { if (!/context was destroyed|navigation|Target closed/i.test(String(e))) throw e; await sleep(1000); } } return A.ev(f, x); };
const jobsOf = (A, id) => sev(A, id => (window._crm.projects || []).filter(p => p && p.leadId === id && !/archiv/i.test(p.status || '')).map(p => ({ id: p.id, status: p.status, pm: p.pm, name: p.name, pipe: window._gcJobBuckets([p]).pipeline })), id);
const leadOf = (A, id) => sev(A, id => { const l = (window._crm.leads || []).find(x => x && x.id === id); return l ? { pid: l.pid || '', lwGood: l.lwGood || null, lwJob: l.lwJob || null, lsa: l.lsaCheck || '' } : null; }, id);
const waitJob = (A, id, ms) => H.waitFor(A, id => { const l = (window._crm.leads || []).find(x => x && x.id === id); return !!(l && l.pid && (window._crm.projects || []).some(p => p && p.id === l.pid)); }, id, ms || 30000);
const cloudJobs = id => (H.cget('projects') || []).filter(p => p && p.leadId === id && !/archiv/i.test(p.status || ''));
async function oneJob(A, id, what, via){
  const ok1 = await waitJob(A, id, 30000);
  const J = await jobsOf(A, id), l = await leadOf(A, id);
  ok(ok1 && J.length === 1 && J[0].status === 'bidding' && J[0].pipe === 1 && l.pid === J[0].id, what + ' → exactly one job, status bidding, in Pipeline', { J, l });
  if (via) ok(l && l.lwJob && new RegExp(via).test(l.lwJob.via || ''), what + ' → made ' + via, l && l.lwJob);
  ok(l && l.lwGood && l.lwGood.by && l.lwGood.at, what + ' → the lead is GOOD (who / when)', l && l.lwGood);
  return J[0];
}
const OPEN = [];
try {
  seed();
  console.log('B. the owner approves on his own desk');
  const A = await H.computer('ADMIN', { build, init: [INIT] }); OPEN.push(A);
  await H.signIn(A, ADMIN, 30000);
  await H.waitFor(A, () => window._gcLeadWatch && window._gcLeadWatch.approve && window._gcLeadInbox && (window._crm.leads || []).length >= 15, null, 60000);
  await sleep(8000);   /* the start-up settles */
  ok(await sev(A, () => window._gcLeadWatch.mayMakeJobs()), 'the admin role makes jobs');

  await sev(A, () => window._gcLeadInbox.assign('G_INB', 'Demo PM'));
  const jInb = await oneJob(A, 'G_INB', 'Lead Inbox Assign PM', 'approved here');
  ok(jInb && jInb.pm === 'Demo PM', 'the job has the PM', jInb);

  await sev(A, () => window._gcLeadHold.approve('G_HOLD'));
  await oneJob(A, 'G_HOLD', '✅ Approve on a held lead', 'approved here');

  await sev(A, () => window._gcLsaCheck.decide('G_DEC', true));
  await oneJob(A, 'G_DEC', '🔎 Decide ✓ Good', 'approved here');

  await sev(A, () => { window._gcLsaCheck.decide('G_CARD', true); });   /* an admin's 👍 on the 📥 New lead card is decide(id, true) */
  await oneJob(A, 'G_CARD', '📥 New lead card 👍 Good (admin)', 'approved here');

  /* the Leads drawer: stage → Won (a bid) — the drawer stays open, the confirmation shows in it */
  await sev(A, () => { window._setView('leads'); });
  await sleep(2500);
  A.dialogs.length = 0;
  await sev(A, () => { window._gcLeadsHub.open('G_WON'); });
  await H.waitFor(A, () => !!document.querySelector('#gcl-drawer [data-d="stage"]'), null, 15000);
  const sd = await sev(A, () => { const sel = document.querySelector('#gcl-drawer [data-d="stage"]'); sel.value = 'Won'; sel.dispatchEvent(new Event('change', { bubbles: true })); return { dis: sel.disabled, v: sel.value, open: window._gcLeadsHub.ui().open, opts: [...sel.options].map(o => o.value) }; });
  await sleep(2500);
  const st1 = await sev(A, () => ((window._crm.leads || []).find(x => x.id === 'G_WON') || {}).stage);
  console.log('    (stage select: ' + JSON.stringify(sd) + ' → ' + st1 + ')');
  if (st1 !== 'Won') await sev(A, () => window._gcLeadsHub.moveStage('G_WON', 'Won'));   /* the same moveStage the stage list / the board's drag runs */
  await oneJob(A, 'G_WON', 'Leads stage → Won', 'approved here');
  console.log('    (Won: ' + JSON.stringify(await sev(A, () => { const l = (window._crm.leads || []).find(x => x.id === 'G_WON'); return { stage: l.stage, h: l.stageHistory, appr: window._gcLeadWatch.apprList(l), good: window._gcLeadWatch.goodLead(l), log: window._gcLeadWatch.jobs().log.filter(x => x.id === 'G_WON') }; })).slice(0, 700) + ')');
  const note = await H.waitFor(A, () => { const n = document.querySelector('#gcl-drawer [data-lw-jobmade]'); return n ? n.textContent : ''; }, null, 10000);
  ok(/✅ Job made: .+ — Bidding · Open/.test(note || ''), 'the drawer says "✅ Job made: <name> — Bidding · Open"', note);
  ok(!A.dialogs.length, 'no pop-up', A.dialogs);
  /* 🚀 Convert to job on it: opens that job, no second job, not Launch Job */
  const nJobs0 = await sev(A, () => (window._crm.projects || []).length);
  await sev(A, () => { const b = document.querySelector('#gcl-drawer [data-d="convert"]'); if (b) b.click(); return !!b; });
  await sleep(2000);
  const cv = await sev(A, () => ({ n: (window._crm.projects || []).length, view: localStorage.getItem('grayco_view'), launch: window.__gcX12LaunchLead || '' }));
  ok(cv.n === nJobs0 && cv.launch !== 'G_WON', '🚀 Convert to job on a lead that is a job already opens it — no second job', cv);

  /* the drawer's Assign */
  await sev(A, () => { window._setView('leads'); });
  await sleep(1500);
  await sev(A, () => { window._gcLeadsHub.open('G_DRW'); });
  await H.waitFor(A, () => !!document.querySelector('#gcl-drawer [data-d="assign"]'), null, 15000);
  await sev(A, () => { const sel = document.querySelector('#gcl-drawer [data-d="assign"]'); const o = [...sel.options].find(x => /Demo PM/.test(x.value)); sel.value = o ? o.value : 'Demo PM'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await oneJob(A, 'G_DRW', 'Leads drawer Assign', 'approved here');

  await sev(A, () => window._gcLeadInbox.createJob('G_MAKE'));
  const jm = await jobsOf(A, 'G_MAKE');
  ok(jm.length === 1 && jm[0].status === 'bidding' && jm[0].pipe === 1, '"✅ Create bid job" → one job, bidding, in Pipeline', jm);

  /* an OLD lead (born before OLDER_BEFORE) a person approves now → a job; an old untouched one → none */
  await sev(A, () => window._gcLeadWatch.approve('G_OLD', 'approved'));
  await oneJob(A, 'G_OLD', 'an OLD lead approved now (the approval time counts)', 'approved here');

  /* never a job */
  const nev = await sev(A, () => Promise.all(['B_BAD', 'B_SPAM', 'B_SUB', 'B_DUP'].map(id => window._gcLeadWatch.approve(id, 'approved').then(r => [id, r]))));
  await sev(A, () => window._gcLeadInbox.assign('B_SPAM', 'Demo PM').catch(() => null));
  await sleep(12000);
  for (const id of ['B_BAD', 'B_SPAM', 'B_SUB', 'B_OLDX']) { const J = await jobsOf(A, id); ok(!J.length && !cloudJobs(id).length, id + ' never becomes a job', { J, r: nev }); }
  const dup = await jobsOf(A, 'B_DUP');
  ok(dup.length === 1 && dup[0].id === 'PDUP', 'a lead with a job already gets no second one', dup);
  const st = await sev(A, () => window._gcLeadWatch.inScope((window._crm.leads || []).find(l => l.id === 'B_OLDX'), window._gcPapers.OLDER_BEFORE));
  ok(st === false, 'the old untouched lead is out of scope (born before, no approval since)');

  console.log('C. the GOOD text → the admin desk makes it');
  await sev(A, () => { const at = new Date().toISOString(); window._setLeads(list => list.map(l => l && l.id === 'G_TEXT' ? Object.assign({}, l, { lsaCheck: 'good', lsaDecidedBy: 'Wesley Johnson (text)', lsaDecidedAt: at, lsaVia: 'text', updatedAt: at }) : l)); });
  await oneJob(A, 'G_TEXT', 'the GOOD text');

  console.log('D. a PM on his own computer; an estimator (no jobs)');
  const P = await H.computer('PM', { build, init: [INIT] }); OPEN.push(P);
  await H.signIn(P, PM, 30000);
  await H.waitFor(P, () => window._gcLeadWatch && window._gcLsaPm && (window._crm.leads || []).length >= 15, null, 60000);
  await sleep(6000);
  ok(await sev(P, () => window._gcLeadWatch.mayMakeJobs()), 'the Project Manager role makes jobs');
  await sev(P, () => window._gcLsaPm.mark('G_PMBAR', 'good'));
  await oneJob(P, 'G_PMBAR', 'the LSA bar 👍 Good by the PM', 'approved here');
  console.log('    (PM: ' + JSON.stringify(await sev(P, () => window._gcLeadWatch.jobs().log.slice(-5))).slice(0, 600) + ')');
  ok(TEXTS.some(x => x.q && x.q.lsamark), 'the LSA bar told the server (texts ?lsamark)');

  const E = await H.computer('EST', { build, init: [INIT] }); OPEN.push(E);
  await H.signIn(E, EST, 30000);
  await H.waitFor(E, () => window._gcLeadWatch && window._gcLsaCheck && (window._crm.leads || []).length >= 15, null, 60000);
  await sleep(5000);
  ok(!(await sev(E, () => window._gcLeadWatch.mayMakeJobs())), 'the Estimator role makes no jobs');
  await sev(E, () => window._gcLsaCheck.pm('G_EST', true));
  await sleep(4000);
  const eJ = await jobsOf(E, 'G_EST');
  ok(!eJ.length, 'no job on the estimator\'s computer', eJ);
  /* the estimator's change reaches the admin desk (cloud) */
  const estLead = await sev(E, () => (window._crm.leads || []).find(l => l.id === 'G_EST'));
  await sev(A, l => { window._setLeads(list => list.map(x => x && x.id === l.id ? Object.assign({}, x, l) : x)); }, estLead);
  ok(estLead && estLead.lsaCheck === 'pm_good' && estLead.lwGood && estLead.lwGood.by === 'Demo Estimator', 'the estimator\'s 👍 marks the lead GOOD (who / when)', estLead && { c: estLead.lsaCheck, g: estLead.lwGood });
  await oneJob(A, 'G_EST', 'the estimator\'s 👍 Good → the admin desk', 'admin sweep');
  for (const c of [P, E]) { await c.close().catch(() => {}); OPEN.splice(OPEN.indexOf(c), 1); }

  console.log('E. two computers, the same lead, the same moment → one job');
  const A2 = await H.computer('ADMIN2', { build, init: [INIT] }); OPEN.push(A2);
  await H.signIn(A2, ADMIN2, 30000);
  await H.waitFor(A2, () => window._gcLeadWatch && window._gcLeadInbox && (window._crm.leads || []).length >= 15, null, 60000);
  await sleep(6000);
  const at = new Date().toISOString();
  const mark = l => { window._setLeads(list => list.map(x => x && x.id === 'G_TWO' ? Object.assign({}, x, { lwGood: { by: 'Sample Person', at: l, how: 'approved' }, updatedAt: l }) : x)); };
  await Promise.all([sev(A, mark, at), sev(A2, mark, at)]);
  await Promise.all([A, A2].map(X => H.waitFor(X, () => { const l = (window._crm.leads || []).find(x => x.id === 'G_TWO'); return !!(l && l.lwGood); }, null, 10000)));
  const [r1, r2] = await Promise.all([sev(A, () => window._gcLeadWatch.makeJob('G_TWO', { via: 'test' })), sev(A2, () => window._gcLeadWatch.makeJob('G_TWO', { via: 'test' }))]);
  await sleep(4000);
  const both = [...(await jobsOf(A, 'G_TWO')), ...(await jobsOf(A2, 'G_TWO'))].map(j => j.id).filter((x, i, a) => a.indexOf(x) === i);
  ok(both.length === 1 && [r1, r2].filter(r => r && r.made).length === 1, 'two computers → one job', { both, r1, r2 });
  ok(cloudJobs('G_TWO').length <= 1, 'the cloud holds at most one job for it', cloudJobs('G_TWO').map(p => p.id));
  /* later rounds of both sweeps make no second one */
  await sleep(15000);
  const both2 = [...(await jobsOf(A, 'G_TWO')), ...(await jobsOf(A2, 'G_TWO'))].map(j => j.id).filter((x, i, a) => a.indexOf(x) === i);
  ok(both2.length === 1, 'still one job after both sweeps ran', both2);

  const errs = [...A.errs, ...A2.errs].filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/i.test(e));
  ok(!errs.some(e => /goodjob|lwjob|apprList|makeJob|mineScan|notePaint/i.test(e)), 'no page errors from the new code', errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL ' + String(e && e.stack || e).slice(0, 900)); }
finally { for (const c of OPEN.splice(0)) await c.close().catch(() => {}); }
console.log(fail ? 'FAILED — ' + pass + ' passed, ' + fail + ' failed' : 'ALL PASSED — ' + pass);
process.exit(fail ? 1 : 0);
