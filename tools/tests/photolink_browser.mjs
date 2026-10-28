/* patch PHOTOLINK — the browser half of test_PHOTOLINK.mjs (offline harness, demo data, a mock CompanyCam).
   Needs the scratch harness S/wN/harness_N.mjs + S/wDEMO/seed.mjs (made-up people / jobs). */
const S = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { computer, signIn, sleep, cset, cget, waitFor } = await import(S + '/wN/harness_N.mjs');
const { seedDemo } = await import(S + '/wDEMO/seed.mjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

function photos(pid, n){
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: pid * 1000 + i, project_id: pid, captured_at: Math.floor(Date.parse('2026-09-01T12:00:00Z') / 1000) + i * 60, creator_name: 'Sample PM',
    uris: [{ type: 'thumbnail', uri: 'https://img.companycam.com/t/' + pid + '/' + i + '.png' }, { type: 'web', uri: 'https://img.companycam.com/w/' + pid + '/' + i + '.png' }] });
  return out;
}
const PH = { 7001: photos(7001, 55), 7002: photos(7002, 2), 7003: photos(7003, 4) };

export async function browserCheck(build){
  const out = [];
  seedDemo();
  const P = cget('projects');
  P.push({ id: 'P6', po: 'PO-1006', name: 'Demo Porch 2026', client: 'Sample Owner', address: '600 Demo Porch Rd, Bartlett TN', pm: 'Sample PM', status: 'Active', contract: 12000,
    createdAt: '2026-03-01T10:00:00Z', ccProjectId: '7001', ccMoreIds: ['7002'], ccLinkedBy: 'companycam-sync' });
  cset('projects', P);
  const c = await computer('PL', { build });
  const reqs = [];   /* every photo / CompanyCam request that left the page */
  const photoReq = u => /companycam-webhook|photo-report|photo-tag|sub-photos|api\.companycam\.com|img\.companycam\.com/.test(u) || /gc_kv.*key=(eq\.|in\.\(.*)gc_photos/.test(decodeURIComponent(u));
  c.ctx.on('request', r => { const u = r.url(); if (photoReq(u)) reqs.push({ t: Date.now(), u: decodeURIComponent(u).slice(0, 200) }); });
  const posts = [];
  await c.ctx.route(u => new URL(u).host === 'img.companycam.com', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await c.ctx.route(u => /\/\.netlify\/functions\/companycam-webhook/.test(u), async r => {
    const u = new URL(r.request().url()), q = u.searchParams, px = q.get('proxy'), J = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    await sleep(120);   /* a server's answer is never instant */
    if (px === 'status') return J({ ok: true, verified: true, reason: 'ok', source: 'env', status: 200 });
    if (px === 'sync') return J({ ok: true, tokenSet: true, health: { at: new Date().toISOString(), ok: true, read: 3 },
      review: [{ cc: '7003', kind: 'link', name: 'Roof job', address: '22 Sample Ave, Cordova TN', created: '2026-05-01', why: 'looks like 2 jobs', jobs: [{ id: 'P2', name: 'Demo Roof Replacement', address: '22 Sample Ave, Cordova TN' }, { id: 'P3', name: 'Demo Bath Refresh' }] }] });
    if (px === 'recent') return J({ ok: true, projects: [
      { id: '7001', name: 'Porch', address: '600 Demo Porch Rd', status: 'active', photo_count: 55, thumb: 'https://img.companycam.com/t/7001/0.png', updated_at: 1780000000 },
      { id: '7002', name: 'Porch 2', address: '600 Demo Porch Rd', status: 'active', photo_count: 2, thumb: 'https://img.companycam.com/t/7002/0.png', updated_at: 1780000000 },
      { id: '7003', name: 'Roof job', address: '22 Sample Ave', status: 'active', photo_count: 4, thumb: '', updated_at: 1780000000 }] });
    if (px === 'review') { posts.push(JSON.parse(r.request().postData() || '{}')); return J({ ok: true }); }
    if (px === 'api') {
      const ep = q.get('endpoint') || '', per = +q.get('per_page') || 50, pg = +q.get('page') || 1;
      if (ep === 'photos') return J(PH[7001].slice(0, 10));
      const m = /^projects\/(\d+)\/photos$/.exec(ep);
      if (m) return J((PH[m[1]] || []).slice((pg - 1) * per, pg * per));
      return J([]);
    }
    return J({});
  });
  await signIn(c, 'wjohnson@grayco-cs.com', 12000);
  const p = c.page();
  await p.evaluate(() => { try { window._setView('dashboard'); } catch (e) {} });
  /* 1. Dashboard + To-Do for 2 minutes: nothing photo */
  const t0 = Date.now();
  const IDLE = process.env.PL_QUICK ? 3000 : 60000;   /* PL_QUICK=1: a quick look while debugging (not the 2-minute proof) */
  await sleep(IDLE);
  await p.evaluate(() => { try { window._setView('todo'); } catch (e) {} });
  await sleep(IDLE);
  const idle = reqs.filter(x => x.t >= t0);
  out.push(['2 min on Dashboard / To-Do: zero photo or CompanyCam requests', idle.length === 0, idle.slice(0, 5).map(x => x.u).join(' | ')]);
  /* 2. GrayCo Photos: first screen, the linked 2026 job's cover + count, the link list */
  const t1 = Date.now();
  await p.evaluate(() => window._setView('allphotos'));
  const first = await waitFor(c, () => !!document.querySelector('#gcuOv .pv-card'), null, 30000, 100);
  out.push(['GrayCo Photos first screen (' + (Date.now() - t1) + ' ms)', !!first && Date.now() - t1 < 15000]);
  const card = await waitFor(c, () => { const b = document.querySelector('#gcuOv .pv-grid .pv-card[data-id="P6"]'); return b && /57 photos/.test(b.textContent) ? b.textContent.slice(0, 120) : null; }, null, 20000, 250);
  const dbg = card ? '' : await p.evaluate(() => { const b = document.querySelector('#gcuOv .pv-grid .pv-card[data-id="P6"]'); return (b ? b.textContent.slice(0, 120) : 'no card') + ' | cc: ' + localStorage.getItem('gcu_ccprojects') + ' | ' + JSON.stringify(window._gcCCStatus && window._gcCCStatus().state); });
  out.push(['the CRM-made 2026 job shows its photo count from both linked projects', !!card, card || dbg]);
  const lk = await waitFor(c, () => { const x = document.querySelector('#pv-link'); return x && x.querySelectorAll('[data-a="lklink"]').length === 2 ? 1 : null; }, null, 20000, 250);
  out.push(['"Link these photo projects" lists the unsure project with its 2 jobs', !!lk]);
  /* 3. tap Link → the job carries it at once, the server is told */
  await p.click('#pv-link [data-a="lklink"][data-id="P2"]').catch(() => {});
  const linked = await waitFor(c, () => { const j = (window._crm.projects || []).find(x => x.id === 'P2'); return j && j.ccProjectId === '7003' ? 1 : null; }, null, 15000, 250);
  await sleep(1500);
  out.push(['Link: the job gets the project at once; the server list is told', !!linked && posts.some(x => x.act === 'link' && x.cc === '7003' && x.job === 'P2'), JSON.stringify(posts)]);
  /* 4. the job's photos: both projects, all pages */
  await p.click('#gcuOv .pv-card[data-id="P6"]').catch(() => {});
  const tiles = await waitFor(c, () => { const n = document.querySelectorAll('#gcuOv [data-src-kind="cc"]').length; return n >= 57 ? n : null; }, null, 30000, 250);
  out.push(['the job page shows every photo of both projects (55 + 2)', tiles === 57, String(tiles)]);
  const lazy = await p.evaluate(() => Array.from(document.querySelectorAll('#gcuOv [data-src-kind="cc"] img')).every(i => i.getAttribute('loading') === 'lazy' && /\/t\//.test(i.getAttribute('data-src') || i.src)));
  out.push(['thumbnails are the small size, loading=lazy', lazy]);
  /* 5. leave: nothing more */
  await p.evaluate(() => window._setView('dashboard'));
  await sleep(4000);
  const gone = await p.evaluate(() => !document.querySelector('#gcuOv'));
  const t2 = Date.now();
  await sleep(process.env.PL_QUICK ? 5000 : 60000);
  const after = reqs.filter(x => x.t >= t2);
  out.push(['after leaving GrayCo Photos: screen gone, zero photo requests for 60 s', gone && after.length === 0, after.slice(0, 5).map(x => x.u).join(' | ')]);
  const errs = c.errs.filter(e => /gcu|Photo|PHOTOLINK|ccLoad|linkHtml/i.test(e));
  out.push(['no page errors from GrayCo Photos', errs.length === 0, errs.slice(0, 3).join(' | ')]);
  await c.b.close();
  return out;
}
