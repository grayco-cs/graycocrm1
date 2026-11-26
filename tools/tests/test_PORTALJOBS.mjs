/* patch PORTALJOBS tests: node tools/tests/test_PORTALJOBS.mjs [shots-dir]
   A made-up customer with 5 jobs ("Sample Head Start"; one e-mail on all 5, each with a portal link and 3 papers shared to the portal
   the way the ZIP import shares them: portalShare + portalLive). Offline (custportal_world.mjs). Browser at 1280×800 and 390×844:
   one sign-in lists ALL 5 jobs · tapping a job opens THAT job (info, schedule, update post, Documents) · "All projects" goes back ·
   a sub paper (portalShare false) never shows · another customer sees none of them. Node: the CRM's 👤 Customer portals / Field
   portal link test accepts both link forms (crm…/portal.html#t= and portal.grayco-cs.com/#t=). Needs the browser lock. */
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import * as W from './custportal_world.mjs';
const OUT = process.argv[2] || '';
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const shot = (pg, name, o) => OUT ? pg.screenshot(Object.assign({ path: path.join(OUT, name) }, o || {})) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EMAIL = 'rramos@demo.test';
const JOBS = [['HS1', 'Brinkley - CDI', '101 Demo Ave, Brinkley, AR 72021'], ['HS2', 'Clarendon - CSI', '202 Sample St, Clarendon, AR 72029'],
  ['HS3', 'De Valls Bluff - CDI', '303 Test Rd, De Valls Bluff, AR 72041'], ['HS4', 'Des Arc - CDI', '404 Example Ln, Des Arc, AR 72040'], ['HS5', 'Phillips - CDI', '505 Mock Blvd, Helena, AR 72342']];
const LINKS = {};
function seed(){
  for (const k of Object.keys(W.KV)) delete W.KV[k];
  for (const k of Object.keys(W.TABLES)) delete W.TABLES[k];
  const docs = [], projects = [];
  const at = '2026-10-28T15:00:00.000Z';
  JOBS.forEach(([id, name, addr], i) => {
    const p = { id, name, client: 'Sample Head Start', clientEmail: EMAIL, clientPhone: '870-555-01' + (10 + i), address: addr, autoPO: 'HS' + (2601 + i), pm: 'Dana Rivers', status: 'active', type: 'Commercial', contract: 100000 + i * 5000, created: '2026-10-01', startDate: '2026-10-20', progress: 20 + i * 10 };
    if (id === 'HS2') {
      p.schedPlan = { steps: [{ id: 's1', name: 'Mobilize and site protection', date: '2026-10-26', portal: true, done: true }, { id: 's2', name: 'Classroom demolition', date: '2026-11-03', end: '2026-11-06', portal: true },
        { id: 's3', name: 'Framing and drywall', date: '2026-11-09', end: '2026-11-20', portal: true }, { id: 's4', name: 'Flooring and paint', date: '2026-11-30', end: '2026-12-08', portal: true }, { id: 's5', name: 'Final walkthrough', date: '2026-12-15', portal: true }] };
      p.portalPosts = [{ id: 'hsp1', at: '2026-10-30T16:10:00.000Z', by: 'Dana Rivers', text: 'Site protection is up and the crew starts classroom demolition on Tuesday. The playground side stays open.' }];
    }
    projects.push(p);
    const mk = (n, nm, cat) => { const ref = W.storeFile(W.pdfOf(nm, ['Job: ' + name, 'Address: ' + addr, 'Made-up sample document']), 'pdf', 'application/pdf');
      docs.push({ id: 'zd_' + id + '_' + n, pid: id, name: nm + '.pdf', cat, ref, type: 'application/pdf', uploaded: at.slice(0, 10), uploadedAt: at, by: 'Office', source: 'zip-import', zipBatch: 'zb1', zipPath: name + '/' + nm + '.pdf', portalShare: true, portalLive: true, portalLiveAt: at, portalLiveBy: 'Office' }); };
    mk('c', 'Contract - ' + name, 'Contracts'); mk('s', 'Construction schedule - ' + name, 'Schedules'); mk('n', 'Notice to proceed - ' + name, 'Notices');
    /* a sub paper that must NOT show */
    docs.push({ id: 'zd_' + id + '_sub', pid: id, name: 'Subcontract - Ridgeline Framing.pdf', cat: 'Sub Agreements', ref: W.storeFile(W.pdfOf('Subcontract', ['internal']), 'pdf', 'application/pdf'), type: 'application/pdf', uploadedAt: at, source: 'zip-import', portalShare: false });
    LINKS[id] = W.tok();
  });
  projects.push({ id: 'OT1', name: 'Other Customer - Office', client: 'Other Customer', clientEmail: 'other@demo.test', address: '9 Elsewhere Rd, Memphis, TN 38103', autoPO: 'OT1', pm: 'Dana Rivers', status: 'active' });
  LINKS.OT1 = W.tok();
  W.put('users', [{ id: 'U1', name: 'Dana Rivers', email: 'pm.sample@grayco-cs.com', phone: '901-555-0142', role: 'Project Manager', active: true }]);
  W.put('customers', [{ id: 'CUHS', name: 'Sample Head Start', company: 'Sample Head Start', email: EMAIL, phone: '870-555-0110', address: '100 Main St, Brinkley, AR 72021' }, { id: 'CUOT', name: 'Other Customer', email: 'other@demo.test' }]);
  W.put('projects', projects); W.put('projectDocs', docs); W.put('estimates', []); W.put('invs', []); W.put('cos', []); W.put('changeOrders', []);
  W.put('schedule', projects.find(x => x.id === 'HS2').schedPlan.steps.map((x, i) => ({ id: 'hsc' + i, pid: 'HS2', tplTask: x.id, task: x.name, date: x.date, end: x.end }))); W.put('gc_photos', []); W.put('gc_sign_requests', []); W.put('gc_portal_gate', [{ id: '_meta', since: '2026-10-01T00:00:00Z', gf: {} }]);
  W.put('gc_automation_pause', { on: false }); W.put('gc_claims', []); W.put('punch', []); W.put('leads', []);
  Object.keys(LINKS).forEach(id => (W.TABLES.gc_portal = W.TABLES.gc_portal || []).push({ token: LINKS[id], project_id: id, revoked: false, created_at: '2026-10-02T12:00:00Z' }));
  W.resetCaches();
}
seed();
const results = [];
const ok = (c, m) => { results.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

/* node checks: one login lists all 5; the other customer none of them */
const srv = await W.startServer();
const browser = await W.launch();
async function signIn(pg, email, pw){
  await pg.goto(srv.ORIGIN + '/'); await pg.waitForSelector('#siLogin', { timeout: 20000 });
  await pg.fill('#siEmail', email); await pg.fill('#siPw', pw); await pg.click('#siLogin');
}
const ERRS = [];
for (const kind of ['desktop', 'phone']) {
  seed();
  const ctx = await W.context(browser, kind, { wide: { width: 1280, height: 800 } });
  if (kind === 'desktop') { await ctx.close(); }
  const c2 = kind === 'desktop' ? await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, serviceWorkers: 'block' }) : ctx;
  if (kind === 'desktop') {
    await c2.route(W.SB + '/**', r => { const u = new URL(r.request().url()); const f = W.FILES[u.pathname.replace(/^.*\/crm-files\//, '')]; return f ? r.fulfill({ status: 200, contentType: 'application/pdf', body: f.bytes }) : r.fulfill({ status: 404, body: '' }); });
    await c2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await c2.addInitScript(() => { try { localStorage.setItem('gc_pwa_dismiss', String(Date.now())); } catch (e) {} });
  }
  const pg = await c2.newPage();
  pg.on('pageerror', e => ERRS.push(kind + ' pageerror: ' + e.message));
  await signIn(pg, EMAIL, 'Sample');
  await pg.waitForSelector('.jobrow, #track, #ownPwCard', { timeout: 25000 }); await sleep(1500);
  /* the starter password may show "Make your own password" first — the list is behind it? */
  const rows = await pg.$$eval('.jobrow[data-job]', els => els.map(e => e.getAttribute('data-job') + '|' + e.innerText.replace(/\s+/g, ' ')));
  ok(rows.length === 5, kind + ': one login lists all 5 jobs (' + rows.map(r => r.split('|')[1]).join('; ') + ')');
  ok(!rows.some(r => /Other Customer/.test(r)), kind + ': no other customer job in the list');
  await shot(pg, (kind === 'desktop' ? 'a_desktop' : 'b_phone') + '_portal_home_all_jobs.png');
  if (kind === 'desktop') await shot(pg, 'a_desktop_portal_home_all_jobs_full.png', { fullPage: true });
  await pg.click('.jobrow[data-job="HS2"]');
  await pg.waitForSelector('#track', { timeout: 20000 }); await sleep(2000);
  try { const nn = await pg.$('#ownPwCard button:has-text("Not now")'); if (nn) { await nn.click(); await sleep(500); } } catch (e) {}
  const txt = await pg.innerText('#main');
  ok(/Clarendon - CSI/.test(await pg.innerText('#jobName')), kind + ': tapping Clarendon opens Clarendon');
  ok(/Classroom demolition/.test(txt) && /Final walkthrough/.test(txt), kind + ': Clarendon schedule shown');
  ok(/Site protection is up/.test(txt), kind + ': Clarendon update post shown');
  ok(!!(await pg.$('#allJobs')), kind + ': "All projects" back button shown');
  if (kind === 'desktop') { await shot(pg, 'c_desktop_job_clarendon.png'); await shot(pg, 'c_desktop_job_clarendon_full.png', { fullPage: true }); }
  else { await shot(pg, 'c_phone_job_clarendon.png'); await shot(pg, 'c_phone_job_clarendon_full.png', { fullPage: true }); }
  await pg.click('nav.tabs button[data-tab="docs"]'); await sleep(1500);
  const dt = await pg.innerText('#main');
  ok(/Contract - Clarendon - CSI/.test(dt) && /Construction schedule - Clarendon - CSI/.test(dt) && /Notice to proceed - Clarendon - CSI/.test(dt), kind + ': Clarendon Documents show the 3 ZIP-imported papers');
  ok(!/Brinkley/.test(dt), kind + ': no other job\'s papers in Clarendon Documents');
  ok(!/Subcontract/.test(dt), kind + ': the sub paper (portalShare false) is not shown');
  await shot(pg, (kind === 'desktop' ? 'd_desktop' : 'd_phone') + '_job_documents.png', { fullPage: kind === 'phone' });
  await pg.click('#allJobs'); await sleep(800);
  ok((await pg.$$('.jobrow[data-job]')).length === 5, kind + ': back returns to the list of 5');
  await pg.click('.jobrow[data-job="HS4"]'); await pg.waitForSelector('#track', { timeout: 20000 }); await sleep(800);
  ok(/Des Arc - CDI/.test(await pg.innerText('#jobName')), kind + ': a second job (Des Arc) opens after going back');
  await c2.close();
}
/* the other customer */
{
  seed();
  const c3 = await W.context(browser, 'phone'); const pg = await c3.newPage();
  await signIn(pg, 'other@demo.test', 'Other');
  await pg.waitForSelector('.jobrow, #track, #ownPwCard', { timeout: 25000 }); await sleep(1500);
  const t = await pg.innerText('body');
  ok(!/Brinkley|Clarendon|De Valls|Des Arc|Phillips/.test(t), 'other customer sees none of the Head Start jobs');
  ok(/Other Customer - Office/.test(t), 'other customer sees their own job');
  await c3.close();
}
await browser.close(); await srv.close();
/* the CRM's link test (👤 Customer portals tab · Field portal): both link forms count as "has a portal" */
for (const f of ['tools/superportal.js', 'tools/fieldportal.js']) {
  const m = /var LINK = (\/.*?\/), MADE/.exec(fs.readFileSync(path.join(W.ROOT, f), 'utf8')); const re = m && eval(m[1]);
  const t43 = 'A'.repeat(43);
  ok(!!re && re.test('https://crm.grayco-cs.com/portal.html#t=' + t43) && re.test('https://portal.grayco-cs.com/#t=' + t43) && !re.test('https://portal.grayco-cs.com/#t=short') && !re.test('http://portal.grayco-cs.com/#t=' + t43), f + ': a portal link in either form counts (no "no portal yet" for /#t= links)');
}
ok(!ERRS.length, 'no page errors' + (ERRS.length ? ': ' + ERRS.join(' | ') : ''));
console.log(results.join('\n'));
const nf = results.filter(r => r.startsWith('FAIL')).length;
console.log('\nPORTALJOBS ' + (results.length - nf) + '/' + results.length + ' passed' + (nf ? ' — ' + nf + ' FAILED' : ''));
process.exit(nf ? 1 : 0);
