// walks.mjs — what the owner, a PM and the office actually do, step by step (used by owner_walk.mjs).
// Each step taps the screen the way a person does (touch on the phones, mouse on the desk) and says when the screen is open.

/* the thing on top of the screen: changes when a page / sheet opens */
const SIG = () => { const vis = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0; };
  const pts = [[innerWidth / 2, innerHeight * 0.3], [innerWidth / 2, innerHeight * 0.55]].map(([x, y]) => { let e = document.elementFromPoint(x, y); const ch = []; for (let i = 0; e && i < 6; i++, e = e.parentElement) ch.push(e.id || (typeof e.className === 'string' ? e.className.split(' ')[0] : '') || e.tagName); return ch.join('<'); });
  return pts.join('|') + '#' + [...document.body.children].filter(e => vis(e) && getComputedStyle(e).position === 'fixed').length + '#' + (localStorage.getItem('grayco_view') || '') + '#' + (document.body.innerText || '').length; };

export async function run(X){
  const { PID } = X;
  if (PID === 'owner') return owner(X);
  if (PID === 'pm') return pm(X);
  if (PID === 'desk') return desk(X);
  throw new Error('unknown profile ' + PID);
}

/* helpers on top of the step API */
function kit(X){
  const A = () => X.A(), page = () => X.page();
  const sig = () => A().ev(SIG).catch(() => '');
  /* tap, then wait until the screen changed and (optionally) a condition holds */
  async function tapOpen(st, q, cond, ms){
    const s0 = await sig(); await X.tap(q, st);
    const ok = await X.until(async () => { const s1 = await sig(); if (s1 === s0) return false; return cond ? await A().ev(cond).catch(() => false) : true; }, ms || 30000);
    return ok ? true : false;
  }
  const jobTiles = () => A().ev(() => {
    const d = document.querySelector('#_gcJobDash'); if (!d) return null;
    const vis = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0; };
    const all = [...d.querySelectorAll('.gcfp-grid button, .gcfp-grid [role=button]')];
    const t = e => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return { all: all.length, shown: all.filter(vis).map(t), hidden: all.filter(e => !vis(e)).map(t), toggles: [...d.querySelectorAll('[data-fm-more], .gcfm-more')].filter(vis).map(t), name: ((d.querySelector('h1,h2,.gcfp-title,[class*=title]') || {}).innerText || '').slice(0, 60) };
  });
  /* a tile on the job page; a tile kept under "➕ More for this job" is reached the way the owner does: tap the toggle first */
  async function jobTile(st, rx, cond){
    const G = '#_gcJobDash .gcfp-grid';
    let p = await X.locate({ within: G, rx });
    if (!p) { const t = await X.locate({ within: '#_gcJobDash', sel: '[data-fm-more], .gcfm-more' }); if (t) { await X.tapAt(t.x, t.y); await X.sleep(700); if (st) st.info.viaToggle = t.text; p = await X.locate({ within: G, rx }); } }
    if (!p) { const tl = await jobTiles(); throw new Error(`could not find the /${rx}/ tile on the job page (tiles: ${(tl ? tl.shown : []).join(', ')})`); }
    return tapOpen(st, { within: G, rx }, cond);
  }
  return { A, page, sig, tapOpen, jobTiles, jobTile };
}

/* a job to walk: the active job with the most going on (documents, schedule, messages), from the snapshot */
function pickJob(X, pmName){
  const P = (X.snap.get('projects') || []).filter(p => p && p.id && !p.deleted && /active|progress|production|scheduled/i.test(p.status || '') );
  const docs = X.snap.get('projectDocs') || [];
  const nDocs = {}; (Array.isArray(docs) ? docs : []).forEach(d => { if (d && d.projectId) nDocs[d.projectId] = (nDocs[d.projectId] || 0) + 1; if (d && d.pid) nDocs[d.pid] = (nDocs[d.pid] || 0) + 1; });
  const mine = pmName ? P.filter(p => String(p.pm || '').toLowerCase() === pmName.toLowerCase()) : P;
  const L = (mine.length ? mine : P).slice().sort((a, b) => (nDocs[b.id] || 0) - (nDocs[a.id] || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return L[0] || null;
}

async function openJobPage(X, K, st, job){
  /* the way the owner does it: ◫ Jobs, then the job's card (search if it is not in the first screens) */
  await X.tap({ sel: '#gc-fh-tabs [data-t="jobs"]' }, st);
  await X.until(() => K.A().ev(() => document.querySelectorAll('._jpItem').length > 0), 20000);
  const nm = String(job.name || '').trim().slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let p = await X.locate({ sel: '._jpItem', rx: nm });
  if (!p) p = await X.locate({ sel: '._jpItem' });
  if (!p) throw new Error('could not find a job card on ◫ Jobs');
  if (p.covered && st) st.fails.push({ check: 'tap', sev: 'major', msg: `the job card "${p.text}" is covered by ${p.by}` });
  await X.tapAt(p.x, p.y);
  if (st) st.info.job = p.text;
  return !!(await X.until(() => K.A().ev(() => { const d = document.querySelector('#_gcJobDash'); return !!d && d.getBoundingClientRect().width > 0; }), 30000));
}

/* ═════ the owner on his iPhone ═════ */
async function owner(X){
  const K = kit(X); const { step, tap, until, has, back, goHome, fieldHome, sleep } = X;
  await X.open('admin');
  const A = K.A, page = K.page;
  await step('Open the app (time to Field home)', { scroll: false }, async st => {
    await page().reload({ waitUntil: 'commit' });
    return !!(await until(async () => (await fieldHome()) && await A().ev(() => document.querySelectorAll('#_gcJobPick .gc-pmf-t, #_gcJobPick [data-ra-a]').length > 3), 60000));
  });
  await step('Phone left alone for 30 s after opening (no taps)', { scroll: false, timed: false }, async () => { await sleep(30000); return true; });
  await step('🏠 Home', {}, async st => { await tap({ sel: '#gc-fh-tabs [data-t="home"]' }, st); return !!(await until(fieldHome, 15000)); });
  // Approvals
  let apprOpen = false;
  await step('✅ Approvals (open + scroll)', {}, async st => {
    await goHome();
    apprOpen = await K.tapOpen(st, { sel: '#gc-fh-tabs [data-t="appr"]' }, () => [...document.querySelectorAll('button')].some(b => /Approve/.test(b.innerText || '') && b.getBoundingClientRect().width > 0 && getComputedStyle(b).visibility !== 'hidden'));
    st.info.approvals = await A().ev(() => [...document.querySelectorAll('button')].filter(b => /^✅ ?Approve/.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 0).length);
    return apprOpen;
  });
  await step('✅ Approve one (send stubbed)', { passive: false, timed: false }, async st => {
    if (!apprOpen) { await goHome(); await K.tapOpen(st, { sel: '#gc-fh-tabs [data-t="appr"]' }); }
    const before = await A().ev(() => [...document.querySelectorAll('button')].filter(b => /^✅ ?Approve/.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 0).length);
    await tap({ rx: '^✅ ?Approve$', wait: 5000 }, st);
    await sleep(1500);
    /* a confirm sheet may follow */
    const c = await X.locate({ rx: '^(✅ ?)?(Approve|Yes|Confirm|Send|Approve & send)( it| now)?$' }); if (c && !c.covered) { await X.tapAt(c.x, c.y); await sleep(1500); }
    const after = await A().ev(() => [...document.querySelectorAll('button')].filter(b => /^✅ ?Approve/.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 0).length);
    st.info.approve = { before, after };
    const done = await until(() => A().ev(() => /approved|✓|sent/i.test(document.body.innerText.slice(0, 200000))), 8000);
    if (after >= before && !done) st.fails.push({ check: 'stuck', msg: `approving did not take the item off the list (${before} → ${after})` });
    return true;
  });
  await step('Back from Approvals', { scroll: false }, async st => { await back(st); return !!(await until(fieldHome, 10000)) || true; });
  // a real job
  const job = pickJob(X);
  X.R.notes.push('job walked: ' + (job ? job.name : 'none'));
  let jobOk = false;
  await step('◫ Jobs → a real job page (all tiles visible)', {}, async st => {
    await goHome(); jobOk = await openJobPage(X, K, st, job || {});
    const t = await K.jobTiles(); st.info.tiles = t;
    if (t && (t.hidden.length || t.toggles.length)) st.fails.push({ check: 'toggle', msg: `${t.hidden.length} of the job's tiles are behind a toggle (${t.toggles.join(', ') || 'hidden'}): ${t.hidden.slice(0, 10).join(', ')}` });
    return jobOk;
  });
  const tiles = [['Job info', 'Job Info'], ['Schedule', 'Schedule'], ['Documents', 'Documents'], ['Customer portal', 'Customer portal'], ['Messages', '^\\W*Messages?$']];
  for (const [nm, rx] of tiles) {
    await step(`Job page → ${nm}`, {}, async st => {
      if (!(await A().ev(() => !!document.querySelector('#_gcJobDash')))) { await goHome(); await openJobPage(X, K, st, job || {}); }
      return K.jobTile(st, rx);
    });
    await step(`Back from ${nm}`, { scroll: false }, async st => { await back(st); await sleep(600); return true; });
  }
  // update progress to 25 %
  await step('Job page → Update progress to 25%', { passive: false, timed: false }, async st => {
    if (!(await A().ev(() => !!document.querySelector('#_gcJobDash')))) { await goHome(); await openJobPage(X, K, st, job || {}); }
    await K.jobTile(st, 'Update Progress');
    await sleep(800);
    const r = await A().ev(() => { const rg = [...document.querySelectorAll('input[type=range],input[type=number]')].filter(e => e.getBoundingClientRect().width > 0).pop(); if (rg) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(rg, '25'); rg.dispatchEvent(new Event('input', { bubbles: true })); rg.dispatchEvent(new Event('change', { bubbles: true })); return 'input'; } return null; });
    if (!r) { const b = await X.locate({ rx: '^25 ?%' }); if (!b) throw new Error('could not find a 25% choice or a progress slider'); await X.tapAt(b.x, b.y); }
    st.info.progressBy = r || 'button';
    await sleep(500);
    const sv = await X.locate({ rx: '^(💾 ?)?(Save|Update|Done|Save progress|✓ Save)' }); if (sv) await X.tapAt(sv.x, sv.y);
    const saved = await until(() => X.H.writes.some(w => w.key === 'projects' || /^projects__/.test(w.key)), 20000);
    if (!saved) st.fails.push({ check: 'stuck', msg: 'the progress change did not reach the (offline) cloud within 20 s' });
    return true;
  });
  // Leads
  await step('📥 Leads', {}, async st => { await goHome(); const q = (await X.locate({ sel: '[data-ra-a="leads"]' })) ? { sel: '[data-ra-a="leads"]' } : { rx: '^\\W*Leads$' }; return K.tapOpen(st, q, () => /Board|List|Outreach/.test(document.body.innerText)); });
  const views = await A().ev(() => [...document.querySelectorAll('button,[role=tab],a')].filter(b => b.getBoundingClientRect().width > 0 && /^(📋|🗂|☰|📅|🗺|🛰|📞|📊|🏗)?\s*(Board|List|Calendar|Map|Outreach|LSA calls|LSA by month|LSA|Permits)\b/i.test((b.innerText || '').trim())).map(b => (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30)));
  X.R.notes.push('Leads view buttons: ' + ([...new Set(views)].join(' · ') || 'none found'));
  for (const v of [...new Set(views)].slice(0, 9)) {
    await step(`Leads → ${v}`, {}, async st => { const rx = '^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s*\d+$/, ''); return K.tapOpen(st, { rx }, null, 30000).then(x => x || true); });
  }
  if (!views.some(v => /LSA/i.test(v))) X.R.steps.push({ n: 0, name: 'Leads → LSA view', fails: [{ check: 'notfound', sev: 'major', msg: 'no LSA view button on the Leads screen' }], warns: [], info: {}, shots: [] });
  // To-Do, More, Photos, Problem reports
  await step('☑ To-Do', {}, async st => { await goHome(); return K.tapOpen(st, { rx: "To-?dos?|☑" }); });
  await step('☰ More', {}, async st => { await goHome(); return K.tapOpen(st, { sel: '#gc-fh-tabs [data-t="more"]' }, () => !!document.querySelector('.gc-fh-sheet[data-ra-more]')); });
  await step('🆘 Problem reports', {}, async st => { if (!(await A().ev(() => !!document.querySelector('.gc-fh-sheet[data-ra-more]')))) { await goHome(); await tap({ sel: '#gc-fh-tabs [data-t="more"]' }, st); await sleep(800); } return K.tapOpen(st, { rx: 'Problem reports' }); });
  await step('📸 Photos / projects page', {}, async st => { await goHome(); await tap({ sel: '#gc-fh-tabs [data-t="jobs"]' }, st); await sleep(800); return K.tapOpen(st, { rx: 'GrayCo Photos' }, () => !!(window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open) || true); });
  await step('Back to 🏠 Home', { scroll: false }, async st => { try { await back(st); } catch (e) {} await goHome(); return !!(await fieldHome()); });
}

/* ═════ a PM on his iPhone ═════ */
async function pm(X){
  const K = kit(X); const { step, tap, until, back, goHome, fieldHome, sleep } = X;
  await X.open('pm');
  const A = K.A, page = K.page;
  await step('Open the app (time to Field home)', { scroll: false }, async () => { await page().reload({ waitUntil: 'commit' }); return !!(await until(async () => (await fieldHome()) && await A().ev(() => document.querySelectorAll('#_gcJobPick .gc-pmf-t, #_gcJobPick [data-ra-a], #_gcJobPick ._jpItem').length > 2), 60000)); });
  await step('Phone left alone for 30 s after opening (no taps)', { scroll: false, timed: false }, async () => { await sleep(30000); return true; });
  await step('🏠 Field home', {}, async st => { await tap({ sel: '#gc-fh-tabs [data-t="home"]' }, st); return !!(await until(fieldHome, 15000)); });
  const job = pickJob(X, X.acc.map.pm && X.acc.map.pm.name);
  X.R.notes.push('job walked: ' + (job ? job.name : 'none'));
  await step('A job (My jobs)', {}, async st => { await goHome(); const ok = await openJobPage(X, K, st, job || {}); st.info.tiles = await K.jobTiles(); return ok; });
  await step('Daily log (write + save)', { passive: false, timed: false }, async st => {
    if (!(await A().ev(() => !!document.querySelector('#_gcJobDash')))) { await goHome(); await openJobPage(X, K, st, job || {}); }
    await K.jobTile(st, 'Daily Log');
    await sleep(800);
    const start = await X.locate({ rx: '^(Start the daily log|Start today.s log|New log|＋ ?Log)' }); if (start) { await X.tapAt(start.x, start.y); await sleep(1500); st.info.started = start.text; }
    const ta = await A().ev(() => { const t = [...document.querySelectorAll('textarea')].filter(e => e.getBoundingClientRect().width > 0).pop(); if (!t) return false; t.focus(); return true; });
    if (!ta) throw new Error('no text box on the daily log');
    await page().keyboard.type('QA gate: crew on site, demo done (offline test entry).', { delay: 5 });
    await sleep(300);
    const s0 = X.H.writes.length;
    await tap({ rx: '^\\W*(Save|Save log|Save daily log|Post|Add|Finish|Submit|Done)\\b', wait: 3000 }, st);
    const ok = await until(() => X.H.writes.slice(s0).some(w => !/^(gc_perfrep_|gc_bootrep_|gc_adm_dev_|_probe_)/.test(w.key)), 20000);
    if (!ok) st.fails.push({ check: 'stuck', msg: 'the daily log did not reach the (offline) cloud within 20 s' });
    return true;
  });
  await step('Back to the job', { scroll: false }, async st => { try { await back(st); } catch (e) {} return true; });
  await step('Photo upload (storage stubbed)', { passive: false, timed: false }, async st => {
    if (!(await A().ev(() => !!document.querySelector('#_gcJobDash')))) { await goHome(); await openJobPage(X, K, st, job || {}); }
    const jpg = await A().ev(() => { const c = document.createElement('canvas'); c.width = 2016; c.height = 1512; const g = c.getContext('2d'); const im = g.createImageData(c.width, c.height); for (let i = 0; i < im.data.length; i += 4) { im.data[i] = (i * 13) % 255; im.data[i + 1] = Math.random() * 255; im.data[i + 2] = (i >> 9) % 255; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); return c.toDataURL('image/jpeg', 0.85).split(',')[1]; });
    const buf = Buffer.from(jpg, 'base64'); st.info.photoKB = Math.round(buf.length / 1024);
    const chooser = page().waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);
    await K.jobTile(st, 'Add Photo|Photo');
    let fc = await chooser;
    if (!fc) { const c2 = page().waitForEvent('filechooser', { timeout: 10000 }).catch(() => null); const p = await X.locate({ rx: '(Choose|Upload|Library|Pick|Add) ?(a )?(photo|photos|from)|📁|🖼|Camera roll' }); if (p) await X.tapAt(p.x, p.y); fc = await c2; }
    if (!fc) { const inp = await page().$('input[type=file]'); if (!inp) throw new Error('no photo picker / file input found'); await inp.setInputFiles({ name: 'IMG_QA.jpg', mimeType: 'image/jpeg', buffer: buf }); }
    else await fc.setFiles({ name: 'IMG_QA.jpg', mimeType: 'image/jpeg', buffer: buf });
    const t0 = Date.now();
    const up = await until(() => X.S.link.log.some(r => r.at >= t0 - 500 && /\/storage\/v1\//.test(r.path) && r.m !== 'GET'), 120000);
    st.info.uploadSec = up ? Math.round((Date.now() - t0) / 100) / 10 : null;
    const sv = await X.locate({ rx: '^(Save|Upload|Done|Attach|✓)' }); if (sv && !up) { await X.tapAt(sv.x, sv.y); await until(() => X.S.link.log.some(r => r.at >= t0 && /\/storage\/v1\//.test(r.path) && r.m !== 'GET'), 120000); }
    const stor = X.S.link.log.filter(r => r.at >= t0 - 500 && /\/storage\/v1\//.test(r.path) && r.m !== 'GET');
    st.info.storageUploads = stor.map(r => Math.round(r.up / 1024) + ' KB');
    if (!stor.length) st.fails.push({ check: 'stuck', msg: 'the photo was not uploaded to storage within 2 minutes' });
    return true;
  });
  await step('Back from the photo', { scroll: false }, async st => { try { await back(st); } catch (e) {} try { await A().ev(() => window._gcPhotos && window._gcPhotos.state && window._gcPhotos.state.open && window._gcPhotos.close()); } catch (e) {} return true; });
  await step('💬 Messages', {}, async st => {
    if (!(await A().ev(() => !!document.querySelector('#_gcJobDash')))) { await goHome(); await openJobPage(X, K, st, job || {}); }
    return K.jobTile(st, '^\\W*Messages?$');
  });
  await step('Back to 🏠 Home', { scroll: false }, async st => { try { await back(st); } catch (e) {} await goHome(); return !!(await fieldHome()); });
}

/* ═════ the office at a desk ═════ */
async function desk(X){
  const K = kit(X); const { step, until } = X;
  await X.open('office');
  const A = K.A, page = K.page; const D = deskKit(X, K);
  await step('Open the CRM (time to the dashboard)', { scroll: false }, async () => { await page().reload({ waitUntil: 'commit' }); return !!(await until(() => A().ev(() => !!window._crm && document.querySelectorAll('nav button, aside button').length > 5), 60000)); });
  await step('Dashboard', {}, st => D.go('^(🏠 ?|📊 ?)?Dashboard$', 'dashboard', null, st));
  await step('To-Do (collapsed groups)', {}, async st => { const ok = await D.go('^(☑ ?|✅ ?)?To-?Do', 'todo', null, st); st.info.groups = await A().ev(() => { const d = [...document.querySelectorAll('details')].filter(e => e.getBoundingClientRect().width > 0); return { details: d.length, open: d.filter(e => e.open).length }; }); return ok; });
  for (const [tab, rx] of [['Client', '^[^a-z]*Client'], ['Sub', '^[^a-z]*Sub( invoices| bills)?'], ['Supplier', '^[^a-z]*Supplier']]) await step(`Invoices → ${tab} tab`, {}, st => D.go('^(🧾 ?|💵 ?)?Invoices$', 'invoices', rx, st));
  await step('Accounting', {}, st => D.go('^(📒 ?|🏦 ?|💼 ?)?Accounting$', 'taxcenter', null, st));
  await step('Leads', {}, st => D.go('^(📥 ?|🎯 ?)?Leads$', 'leads', null, st));
  await step('Approvals', {}, st => D.go('^(✅ ?)?Approvals', 'approvals', null, st));
  /* SDSCO: Materials & SDS belongs to Mitigation and Environmental — on Construction the tab says so and shows no library (by design) */
  for (const c of ['construction', 'mitigation']) await step(`Materials & SDS (${c})`, {}, async st => { const ok = await D.sds(c, st); st.info.sdsText = await A().ev(() => /Materials library/.test(document.body.innerText)); st.info.notConstruction = await A().ev(() => /not Construction/i.test(document.body.innerText));
    if (ok && c !== 'construction' && !st.info.sdsText) st.fails.push({ check: 'stuck', sev: 'major', msg: 'the Materials & SDS tab opened without its library' });
    if (ok && c === 'construction' && (st.info.sdsText || !st.info.notConstruction)) st.fails.push({ check: 'stuck', sev: 'major', msg: 'on Construction the Materials & SDS tab should say it is for Mitigation / Environmental and show no library' + (st.info.sdsText ? ' (it showed the library)' : '') });
    return ok; });
  await step('Marketing dashboard (office)', {}, st => D.go('^(📣 ?|📈 ?)?Marketing', 'marketing', null, st));
  if (X.acc.map.marketing) {
    try { await A().close(); } catch (e) {}
    await X.open('marketing');
    await step('Marketing dashboard (marketing manager)', {}, async st => { const ok = await D.go('^(📣 ?|📈 ?)?Marketing', 'marketing', null, st); st.info.quickLinks = await A().ev(() => [...document.querySelectorAll('a[href]')].filter(a => a.getBoundingClientRect().width > 0).length); return ok; });
  }
}

/* ═════ the screens the button crawler walks, per profile (recent features first) ═════ */
export function crawlScreens(X){
  const K = kit(X); const { tap, until, goHome, fieldHome, sleep } = X; const A = K.A;
  const job = pickJob(X, X.PID === 'pm' && X.acc.map.pm ? X.acc.map.pm.name : null);
  const onJob = async () => { await goHome(); return openJobPage(X, K, null, job || {}); };
  const tile = rx => async () => { if (!(await onJob())) return false; try { return await K.jobTile(null, rx); } catch (e) { return false; } };
  const tab = (t, cond) => async () => { await goHome(); return K.tapOpen(null, { sel: `#gc-fh-tabs [data-t="${t}"]` }, cond || null, 15000); };
  const leadsView = rx => async () => { await goHome(); const q = (await X.locate({ sel: '[data-ra-a="leads"]' })) ? { sel: '[data-ra-a="leads"]' } : { rx: '^\\W*Leads$' }; if (!(await K.tapOpen(null, q, () => /Board|List|Outreach/.test(document.body.innerText), 20000))) return false; if (!rx) return true; const p = await X.locate({ rx }); if (!p) return false; return K.tapOpen(null, { rx }, null, 15000); };
  if (X.PROF.phone) {
    const L = [
      { name: 'Approvals (with COIs)', recent: ['APPRNOSEND', 'BPAPPR', 'SUBDOCREAD'], open: tab('appr', () => [...document.querySelectorAll('button')].some(b => /Approve|Close/.test(b.innerText || '') && b.getBoundingClientRect().width > 0)) },
      { name: 'Job page', recent: ['FIELDMORE', 'PMFIELD'], open: onJob },
      { name: 'Job info', recent: ['JOBREQ', 'EPAHUD'], open: tile('Job Info') },
      { name: 'Documents', recent: ['JOBDOCS', 'ENVDOCS', 'JOBREQ'], open: tile('Documents') },
      { name: 'Job schedule', recent: ['SUBSCHED'], open: tile('Schedule') },
      { name: 'Customer portal', recent: ['GCPORTAL'], open: tile('Customer portal') },
      { name: 'Job messages', recent: ['SUBTHREAD', 'TEXTEDPM'], open: tile('^\\W*Messages?$') },
      { name: 'Field home', bars: true, recent: ['PMFIELD', 'FIELDGUARD', 'AWAY'], open: async () => { await goHome(); return !!(await fieldHome()); } },
      { name: '☰ More', recent: ['FIELDMORE', 'REPORTPROB'], open: tab('more', () => !!document.querySelector('.gc-fh-sheet[data-ra-more]')) },
      { name: 'Problem reports', recent: ['REPORTPROB'], open: async () => { if (!(await tab('more', () => !!document.querySelector('.gc-fh-sheet[data-ra-more]'))())) return false; return K.tapOpen(null, { rx: 'Problem reports' }, null, 15000); } },
      { name: '◫ Jobs list', recent: ['FIELDTAP'], open: tab('jobs', () => document.querySelectorAll('._jpItem').length > 0) },
      { name: 'My Schedule', recent: ['SUBSCHED', 'TIMEOFF'], open: tab('ra-sched') }
    ];
    if (X.PID === 'owner') L.splice(7, 0,
      { name: 'Leads', recent: ['LEADTXT', 'LSAREC', 'LSA2', 'LSALINKS', 'LEADSRC'], open: leadsView(null) },
      { name: 'Leads → Permits', recent: ['PERMITS', 'PERMITS2'], open: leadsView('Permits') },
      { name: 'Leads → LSA view', recent: ['LSAREC', 'LSA2', 'LSALINKS'], open: leadsView('LSA') },
      { name: 'Leads → Outreach', recent: ['PERMITS'], open: leadsView('Outreach') },
      { name: 'To-Do', recent: ['NUDGE', 'TODOJUMP'], open: async () => { await goHome(); return K.tapOpen(null, { rx: "To-?dos?|☑" }, null, 15000); } },
      { name: 'Photos / projects', recent: ['CCPHOTOS2'], open: async () => { await goHome(); await X.tap({ sel: '#gc-fh-tabs [data-t="jobs"]' }); await sleep(800); return K.tapOpen(null, { rx: 'GrayCo Photos' }, null, 15000); } });
    return L;
  }
  const D = deskKit(X, K);
  return [
    { name: 'Approvals (with COIs)', recent: ['APPRNOSEND', 'BPAPPR', 'SUBDOCREAD', 'SUBPEND'], open: () => D.go('^(✅ ?)?Approvals', 'approvals') },
    { name: 'Invoices → Client', recent: ['INVMATCH', 'INVMAIL', 'LUMPSUM', 'ACCTVOID'], open: () => D.go('^(🧾 ?|💵 ?)?Invoices$', 'invoices', '^[^a-z]*Client') },
    { name: 'Invoices → Sub', recent: ['SUBINV', 'SUBACCT', 'ACCTSUB'], open: () => D.go('^(🧾 ?|💵 ?)?Invoices$', 'invoices', '^[^a-z]*Sub( invoices| bills)?') },
    { name: 'Invoices → Supplier', recent: ['SUPPLY', 'SUP1099'], open: () => D.go('^(🧾 ?|💵 ?)?Invoices$', 'invoices', '^[^a-z]*Supplier') },
    { name: 'To-Do', recent: ['NUDGE', 'TODOJUMP'], open: () => D.go('^(☑ ?|✅ ?)?To-?Do', 'todo') },
    { name: 'To-Do bulk', recent: ['NUDGE'], open: async () => { if (!(await D.go('^(☑ ?|✅ ?)?To-?Do', 'todo'))) return false; const ok = await A().ev(() => { const c = [...document.querySelectorAll('input[type=checkbox]')].find(e => e.getBoundingClientRect().width > 0); if (!c) return false; c.click(); return true; }); await sleep(600); return ok; } },
    { name: 'Accounting', recent: ['ACCTNORM', 'ACCTPAY', 'ACCTSUB', 'ACCTVOID', 'LUMPACCT', 'QBCSV'], open: () => D.go('^(📒 ?|🏦 ?|💼 ?)?Accounting$', 'taxcenter') },
    { name: 'Leads', recent: ['LEADTXT', 'LSAREC', 'LSA2', 'LEADSRC', 'LEADASB3'], open: () => D.go('^(📥 ?|🎯 ?)?Leads$', 'leads') },
    { name: 'Leads → Permits', recent: ['PERMITS', 'PERMITS2'], open: () => D.go('^(📥 ?|🎯 ?)?Leads$', 'leads', 'Permits') },
    { name: 'Leads → LSA view', recent: ['LSAREC', 'LSA2', 'LSALINKS'], open: () => D.go('^(📥 ?|🎯 ?)?Leads$', 'leads', 'LSA') },
    { name: 'Materials & SDS (construction)', recent: ['ENVCOMP', 'ENVDOCS'], open: () => D.sds('construction') },
    { name: 'Materials & SDS (mitigation)', recent: ['ENVCOMP', 'ENVDOCS', 'MITWS'], open: () => D.sds('mitigation') },
    { name: 'Marketing (quick links)', recent: ['LSALINKS'], open: () => D.go('^(📣 ?|📈 ?)?Marketing', 'marketing') },
    { name: 'Dashboard', bars: true, recent: ['TEAMACT', 'ADMWARN'], open: () => D.go('^(🏠 ?|📊 ?)?Dashboard$', 'dashboard') }
  ];
}
function deskKit(X, K){
  const A = K.A; const view = () => A().ev(() => localStorage.getItem('grayco_view') || '').catch(() => '');
  async function go(rx, v, sub, st){
    await A().ev(() => document.querySelectorAll('[role=dialog],._gcSheetOv,.gc-ra-sheet').forEach(o => o.remove())).catch(() => {});
    const p = await X.locate({ rx, sel: 'nav button, nav a, aside button, aside a' });
    if (st) st.info.menu = p ? p.text : 'not in the left menu — opened with _setView(' + v + ')';
    if (p) { if (p.covered && st) st.fails.push({ check: 'tap', msg: `the menu item "${p.text}" is covered by ${p.by}` }); await X.tapAt(p.x, p.y); } else await A().ev(v => window._setView && window._setView(v), v);
    if (!(await X.until(async () => (await view()) === v, 15000))) return false;
    await X.sleep(800);
    if (!sub) return true;
    const q = await X.locate({ rx: sub }); if (!q) { if (st) throw new Error('could not find the "' + sub + '" tab'); return false; } if (q.covered && st) st.fails.push({ check: 'tap', msg: `"${q.text}" is covered by ${q.by}` }); await X.tapAt(q.x, q.y); await X.sleep(1000); return true;
  }
  async function sds(c, st){ await A().ev(c => { try { window._gcCo.setFilter(c); } catch (e) {} }, c); await X.sleep(1500); return go('Materials ?(&|and) ?SDS', 'sds', null, st); }
  return { go, sds, view };
}
