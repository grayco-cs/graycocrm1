/* patch JOBSETUP — "What the customer gets": node tools/tests/test_JOBSETUP.mjs [--no-browser]
   Owner 11/03: "choose what the customer gets and the automations we will use for this job — if it's default just say OK".
   NODE (custportal_world.mjs: fake Supabase, the real functions):
     1 automations.js: a job's own choice (job.autoOverrides) beats the ⚡ switch for that job only, both ways; a run over many
       jobs is not held while one job has it switched on for itself
     2 the portal: view.sections from the defaults (homeowner all on; GC variant no Care / Warranty-My home) + job.portalSections;
       a section switched off is not sent (photos, documents, updates, payments) and its action answers nothing
     3 each automation follows the job: portal invite e-mail, weekly update, payment reminders, review request, referral gift
     4 the CRM patch: applied, idempotent, the anchors (JA after() / save / the portal card line)
   BROWSER (needs the browser lock — the caller takes it):
     5 the CRM (offline harness <scratch>/wN/harness_N.mjs): a job is made → the Job setup sheet opens → "✓ Use defaults (OK)" →
       job.setupConfirmed { by, at, defaults } is stored (also in the cloud copy); Change… → untick Photos + tick Weekly update →
       job.portalSections { photos:false } / job.autoOverrides { weekly_update:true }; the card line "Customer gets: …"; an old job
       shows "Confirm job setup"
     6 the portal of that job: no Photos tab; the defaults job keeps it
   Made-up data only. Screenshots → <scratch>/preview/jobsetup/. */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import * as W from './custportal_world.mjs';
const require = createRequire(import.meta.url);
const SHOTS = process.env.JOBSETUP_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/preview/jobsetup';
let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const C = require(W.FNDIR + '/portal.js')._core;
const AUTO = require(W.FNDIR + '/_lib/automations.js');
const call = W.handlerCall, S = W.S, L = () => ({ 'x-portal-token': S.link });
const PM = { authorization: 'Bearer good-admin' };
const sw = row => { W.put('gc_automations', row); try { AUTO._t.reset(); } catch (e) {} W.resetCaches(); };
const setJob = (pid, f) => { const pj = W.get('projects'); const p = pj.find(x => x.id === pid); f(p); W.put('projects', pj); W.resetCaches(); return p; };
const fresh = () => { for (const k of Object.keys(W.KV)) delete W.KV[k]; W.seedSample({ crmDocs: false }); W.setDay(); W.resetCaches(); try { AUTO._t.reset(); } catch (e) {} };

console.log('NODE');
await t('automations.js: the job\'s own choice beats the ⚡ switch for that job only (both ways); a run is not held while one job has it on', async () => {
  fresh(); sw({ weekly_update: false, referral_credits: true });
  const on = { autoOverrides: { weekly_update: true } }, off = { autoOverrides: { referral_credits: false } }, plain = {};
  assert.strictEqual(await AUTO.forJob('weekly_update', on), true);
  assert.strictEqual(await AUTO.forJob('weekly_update', plain), false);
  assert.strictEqual(await AUTO.forJob('referral_credits', off), false);
  assert.strictEqual(await AUTO.forJob('referral_credits', plain), true);
  assert.strictEqual(AUTO.forJobSync('weekly_update', on, false), true);
  assert.strictEqual(AUTO.forJobSync('weekly_update', { autoOverrides: { weekly_update: 'yes' } }, false), false, 'only true / false count');
  assert.strictEqual(await AUTO.gateJobs('weekly_update', [plain, on]), null, 'one job switched on → the run goes');
  const h = await AUTO.gateJobs('weekly_update', [plain]); assert.ok(h && h.held === 'weekly_update', JSON.stringify(h));
  assert.strictEqual(await AUTO.gateJobs('referral_credits', [off]), null, 'switch on → the run goes (that job skips itself)');
});

await t('the portal: sections from the defaults + the job\'s choice; a section that is off is not sent', async () => {
  fresh();
  let v = (await call('portal', { action: 'view' }, L())).data; assert.ok(v.ok, JSON.stringify(v).slice(0, 200));
  assert.deepStrictEqual(v.sections, { photos: true, docs: true, updates: true, payments: true, messages: true, requests: true, care: true, home: true });
  assert.ok(v.money.invoices.length > 0 && v.docs.length > 0, 'the sample has invoices and papers');
  setJob(S.pid, p => { p.portalSections = { photos: false, payments: false, docs: false, updates: false, home: false }; });
  v = (await call('portal', { action: 'view' }, L())).data;
  assert.ok(!v.sections.photos && !v.sections.payments && !v.sections.docs && !v.sections.updates && !v.sections.home && v.sections.messages && v.sections.care);
  assert.ok(v.money.invoices.length === 0 && v.money.payments.length === 0 && v.money.finalInvoice === null, 'no invoices / payments');
  assert.ok(v.docs.length === 0 && v.posts.length === 0 && v.warranty === null, 'no papers / updates / warranty');
  const ph = (await call('portal', { action: 'photos' }, L())).data; assert.ok(ph.ok && ph.off && ph.photos.length === 0, JSON.stringify(ph).slice(0, 200));
  const add = await call('portal', { action: 'photo-add', name: 'x.jpg', data: 'data:image/jpeg;base64,/9j/' }, L()); assert.strictEqual(add.status, 403);
  const inv = await call('portal', { action: 'invoice', id: 'INVS2' }, L()); assert.strictEqual(inv.status, 404);
  /* the GC variant's defaults: no GrayCo Care, no Warranty / My home (its own choice still wins) */
  assert.deepStrictEqual(C.sectionsOf({}, true), { photos: true, docs: true, updates: true, payments: true, messages: true, requests: true, care: false, home: false });
  assert.strictEqual(C.sectionsOf({ portalSections: { care: true } }, true).care, true);
  setJob(S.pid, p => { p.portalStyle = 'gc'; delete p.portalSections; });
  v = (await call('portal', { action: 'view' }, L())).data;
  if (v.variant === 'gc' || typeof C.portalStyle === 'function') assert.ok(v.sections.care === false && v.sections.home === false, 'GC job → no Care / My home: ' + JSON.stringify(v.sections));
  else assert.ok(v.sections.care === false, 'portalStyle gc → GC defaults: ' + JSON.stringify(v.sections));
});

await t('the portal invite e-mail follows the job: OFF company-wide but ON for this job → queued; ON company-wide, OFF for this job → held', async () => {
  fresh();
  setJob(S.pid, p => { p.created = new Date(Date.now()).toISOString().slice(0, 10); p.createdAt = new Date(Date.now()).toISOString(); });
  sw({ portal_invite_email: false });
  let r = (await call('portal', { action: 'send-link', projectId: S.pid }, PM)).data;
  assert.ok(r.held === 'portal_invite_email' || /switched off/.test(String(r.skipped)), JSON.stringify(r));
  setJob(S.pid, p => { p.autoOverrides = { portal_invite_email: true }; });
  r = (await call('portal', { action: 'send-link', projectId: S.pid }, PM)).data;
  assert.ok(r.ok && (r.approval || r.todo) && !r.held, JSON.stringify(r));
  assert.ok((W.get(C.AQ_KEY) || []).some(a => a.id === 'appr_link_' + S.pid), 'queued on ✅ Approvals (never sent by itself)');
  assert.strictEqual(W.RESEND.length, 0, 'nothing sent');
  sw({ portal_invite_email: true }); setJob(S.pid, p => { p.autoOverrides = { portal_invite_email: false }; });
  r = (await call('portal', { action: 'send-link', projectId: S.pid }, PM)).data;
  assert.ok(r.held === 'portal_invite_email' || /switched off/.test(String(r.skipped)), JSON.stringify(r));
});

await t('weekly update / payment reminders / review request / referral gift follow the job (that job only)', async () => {
  fresh();
  const WU = require(W.FNDIR + '/weekly-update.js')._test;
  const pj = W.get('projects'); const other = Object.assign({}, pj.find(x => x.id === S.pid), { id: 'PJS2', name: 'Second sample job' }); pj.push(other); W.put('projects', pj); W.resetCaches();
  setJob(S.pid, p => { p.autoOverrides = { weekly_update: true }; });
  const rep = await WU.run({ globalOn: false });
  const mine = rep.skipped.filter(x => x.project === S.pid).map(x => x.why), theirs = rep.skipped.filter(x => x.project === 'PJS2').map(x => x.why);
  assert.ok(!mine.some(w => /job setup/.test(w)), 'the job switched on is not held: ' + JSON.stringify(mine));
  if (!theirs.some(w => /switched off|not active|no news|nothing new/i.test(w))) assert.ok(false, 'the other job is held: ' + JSON.stringify(theirs));
  const wsrc = fs.readFileSync(path.join(W.FNDIR, 'weekly-update.js'), 'utf8');
  assert.ok(/gateJobs\('weekly_update', pjs\)/.test(wsrc) && /globalOn: globalOn/.test(wsrc), 'the scheduled run uses the per-job gate');
  /* payment reminders: off company-wide, on for this job → runReminders takes this job and skips the other */
  { const iv = W.get('invs'); iv.push({ id: 'INVJS1', pid: S.pid, po: 'S1001', invNum: '1003', type: 'client', drawType: 'Final invoice', isFinal: true, final: true, amt: 2500, status: 'Sent', date: '2026-10-31', dueDate: '2026-11-14' }); W.put('invs', iv); W.resetCaches(); }
  sw({ final_invoice_reminders: false });
  const r1 = await C.runReminders({ projectId: S.pid }); const offAll = r1.off || 0;
  assert.strictEqual(offAll, 1, 'the job is off with the switch: ' + JSON.stringify(r1).slice(0, 200));
  setJob(S.pid, p => { p.autoOverrides = { final_invoice_reminders: true }; });
  const r2 = await C.runReminders({ projectId: S.pid });
  assert.strictEqual((r2.off || 0), offAll - 1, 'one job fewer is off: ' + offAll + ' → ' + (r2.off || 0));
  assert.strictEqual(W.RESEND.length, 0, 'nothing sent here (the reminders go on ✅ Approvals / follow their own rules)');
  assert.ok(/gateJobs\('final_invoice_reminders', pjs\)/.test(fs.readFileSync(path.join(W.FNDIR, 'portal-reminders.js'), 'utf8')));
  /* review request: "Review request / thank-you" off for this job → no review ask in its portal */
  assert.strictEqual(C.jaAllows({}, { autoOverrides: { thank_you_queue: false } }, 'reviewRequest'), false);
  assert.strictEqual(C.jaAllows({}, { type: 'Residential' }, 'reviewRequest'), C.JA.allows({ type: 'Residential' }, 'reviewRequest', false));
  /* referral gift: the sweep skips a job switched off for itself, and takes one switched on while the ⚡ switch is off */
  const rsrc = fs.readFileSync(path.join(W.FNDIR, '_lib/referral.js'), 'utf8'), ssrc = fs.readFileSync(path.join(W.FNDIR, 'referral-scheduled.js'), 'utf8');
  assert.ok(/forJobSync\('referral_credits', p, opt\.globalOn\)/.test(rsrc) && /gateJobs\('referral_credits', pjs\)/.test(ssrc) && /_hourly\(\{ globalOn: globalOn \}\)/.test(ssrc));
  sw({ referral_credits: false });
  const h = JSON.parse((await require(W.FNDIR + '/referral-scheduled.js').handler()).body); assert.ok(h.held === 'referral_credits', JSON.stringify(h));
  setJob(S.pid, p => { p.autoOverrides = { referral_credits: true }; });
  const h2 = JSON.parse((await require(W.FNDIR + '/referral-scheduled.js').handler()).body); assert.ok(h2.held !== 'referral_credits', JSON.stringify(h2));
});

await t('the CRM: tools/patch_JOBSETUP.py applied and idempotent; the job-setup hook, the save and the card line', async () => {
  const html = fs.readFileSync(path.join(W.ROOT, 'index.html'), 'utf8');
  assert.strictEqual(html.split('__GC_PATCH_JOBSETUP__').length - 1, 1);
  assert.ok(/W\._gcJobSetupConfirm\.CTX\[ctx\]/.test(html) && /doSave: function\(pid, change\)/.test(html) && /window\._gcJobSetupLine\(p\)/.test(html));
  const tmp = path.join(W.SP, 'jobsetup_idem.html'); fs.writeFileSync(tmp, html);
  try { assert.ok(/already patched/.test(execFileSync('python3', [path.join(W.ROOT, 'tools/patch_JOBSETUP.py'), tmp]).toString())); } finally { fs.unlinkSync(tmp); }
});

/* ═════════ BROWSER ═════════ */
if (!process.argv.includes('--no-browser')) {
  console.log('BROWSER');
  fs.mkdirSync(SHOTS, { recursive: true });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const HARNESS = process.env.GC_HARNESS || W.SP + '/wN/harness_N.mjs';
  const H = await import(pathToFileURL(HARNESS).href);
  const { computer, waitFor, cset, cget, signIn, cloud } = H;
  fresh(); cloud.clear();
  for (const k of Object.keys(W.KV)) { let v = W.KV[k].value; try { v = JSON.parse(v); } catch (e) {} cset(k, v); }
  cset('users', (W.get('users') || []).concat([{ id: 'UW', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true }]));
  const old = new Date(Date.now() - 3600e3).toISOString(); for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: old }));
  let CR = null, made = null;
  for (const kind of ['desktop', 'phone']) {
    await t(kind + ' CRM: a new job → the Job setup sheet → "✓ Use defaults (OK)" stores who / when; Change… stores this job\'s own choice', async () => {
      const Cx = CR = await computer('owner-' + kind, { build: W.ROOT, mobile: kind === 'phone' });
      try {
        const p = Cx.page(); if (kind === 'desktop') await p.setViewportSize({ width: 1366, height: 768 });
        await signIn(Cx, 'wjohnson@grayco-cs.com', 9000);
        assert.ok(await waitFor(Cx, () => !!(window._gcJobSetupConfirm && window._gcJA && window._crm && (window._crm.projects || []).some(x => x.id === 'PSAMPLE1')), null, 60000), 'CRM ready');
        /* a person makes a job (a real click first: the sheet opens only for a job a person just made) */
        await p.mouse.click(5, 300);
        const pid = 'PJOBSETUP_' + kind;
        await p.evaluate(pid => {
          const j = { id: pid, name: 'Job setup test — ' + pid, client: 'Pat Sample', address: '9 Sample Way', type: 'Residential', status: 'active', createdAt: new Date().toISOString() };
          window._gcJA.stamp(j, 'proj');
          window._setProjects(prev => (prev || []).concat([j]));
        }, pid);
        await p.waitForSelector('#gc-jobsetup', { timeout: 8000 });
        await sleep(400); await p.screenshot({ path: path.join(SHOTS, kind + '_01_new_job_sheet.png') });
        const txt = await p.textContent('#gc-jobsetup');
        for (const w of ['Portal sections', 'Photos', 'Documents', 'Updates', 'Payments / invoices', 'Messages', 'Requests', 'Maintenance plans (GrayCo Care)', 'Warranty / My home',
          'Customer automations for this job', 'Weekly customer update', 'Portal invite e-mail', 'Review request', 'Payment reminders', 'Referral gift', '✓ Use defaults (OK)', 'Change…'])
          assert.ok(txt.includes(w), 'the sheet shows ' + w);
        await p.click('#gc-jobsetup [data-a="ok"]');
        const st = await waitFor(Cx, pid => { const j = (window._crm.projects || []).find(x => x.id === pid); return j && j.setupConfirmed ? JSON.parse(JSON.stringify({ c: j.setupConfirmed, s: j.portalSections || null, o: j.autoOverrides || null })) : null; }, pid, 10000);
        assert.ok(st && st.c.defaults === true && /wjohnson|Wesley/i.test(st.c.by) && st.c.at && !st.s && !st.o, JSON.stringify(st));
        await sleep(2500);
        const inCloud = (cget('projects') || []).find(x => x && x.id === pid);
        assert.ok(inCloud && inCloud.setupConfirmed && inCloud.setupConfirmed.defaults === true, 'in the cloud copy: ' + JSON.stringify(inCloud && inCloud.setupConfirmed));
        /* Change… : no Photos, Weekly update ON for this job */
        await p.evaluate(pid => window._gcJobSetupConfirm(pid, { edit: true }), pid);
        await p.waitForSelector('#gc-jobsetup input[data-k="photos"]', { timeout: 5000 });
        const wu0 = await p.isChecked('#gc-jobsetup input[data-k="weekly_update"]');
        await p.click('#gc-jobsetup input[data-k="photos"]');
        if (!wu0) await p.click('#gc-jobsetup input[data-k="weekly_update"]'); else await p.click('#gc-jobsetup input[data-k="referral_credits"]');
        await p.screenshot({ path: path.join(SHOTS, kind + '_02_change.png') });
        await p.click('#gc-jobsetup [data-a="save"]');
        const st2 = await waitFor(Cx, pid => { const j = (window._crm.projects || []).find(x => x.id === pid); return j && j.portalSections ? JSON.parse(JSON.stringify({ c: j.setupConfirmed, s: j.portalSections, o: j.autoOverrides || null })) : null; }, pid, 10000);
        assert.ok(st2 && st2.s.photos === false && Object.keys(st2.s).length === 1 && st2.c.defaults === false, JSON.stringify(st2));
        assert.ok(st2.o && (wu0 ? st2.o.referral_credits !== undefined : st2.o.weekly_update === true), JSON.stringify(st2.o));
        await sleep(2500);
        const c2 = (cget('projects') || []).find(x => x && x.id === pid);
        assert.ok(c2 && c2.portalSections && c2.portalSections.photos === false, 'the cloud copy has the choice');
        if (kind === 'desktop') made = c2;
        /* the card line */
        const line = await p.evaluate(pid => { const j = (window._crm.projects || []).find(x => x.id === pid), o = (window._crm.projects || []).find(x => x.id === 'PSAMPLE1');
          const d = document.createElement('div'); d.innerHTML = window._gcJobSetupLine(j) + window._gcJobSetupLine(o); return d.textContent; }, pid);
        assert.ok(/Customer gets: custom — no Photos/.test(line) && /Edit/.test(line) && /Confirm job setup/.test(line), line);
        assert.deepStrictEqual(Cx.errs.filter(e => /jobsetup|JobSetup/i.test(e)), []);
      } finally { await Cx.b.close().catch(() => {}); }
    });
  }
  await t('the portal of that job: no Photos tab; the defaults job keeps it', async () => {
    assert.ok(made, 'the job from the CRM');
    fresh(); const pj = W.get('projects'); pj.push(Object.assign({}, pj.find(x => x.id === S.pid), { id: made.id, name: made.name, portalSections: made.portalSections, autoOverrides: made.autoOverrides, setupConfirmed: made.setupConfirmed }));
    W.put('projects', pj); const tk = W.tok(); W.TABLES.gc_portal.push({ token: tk, project_id: made.id, revoked: false }); W.resetCaches();
    const srv = await W.startServer(), browser = await W.launch();
    try {
      for (const [tok, photos, name] of [[tk, false, '03_portal_custom'], [S.link, true, '04_portal_defaults']]) {
        const ctx = await W.context(browser, 'phone'), pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
        await pg.goto(srv.ORIGIN + '/#t=' + tok); await pg.waitForSelector('#track', { timeout: 30000 }); await sleep(2500);
        assert.strictEqual(await pg.isVisible('nav.tabs button[data-tab="photos"]'), photos, name + ': Photos tab ' + (photos ? 'shown' : 'hidden'));
        assert.ok(await pg.isVisible('nav.tabs button[data-tab="docs"]'));
        await pg.screenshot({ path: path.join(SHOTS, 'phone_' + name + '.png') });
        assert.deepStrictEqual(errs, []); await ctx.close();
      }
    } finally { await browser.close(); await srv.close(); }
  });
}
console.log((failed ? 'FAILED ' : 'OK ') + passed + '/' + (passed + failed) + (process.argv.includes('--no-browser') ? '' : '   screenshots: ' + SHOTS));
process.exit(failed ? 1 : 0);
