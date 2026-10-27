// test_VOICESCHED.mjs <build-dir> — patch VOICESCHED: the 🎤 voice note's "📅 Schedule" destination.
// "Marco framing Monday 8am for 3 days" on a picked job → 📅 Schedule is suggested first → the confirm card shows the
// right task / sub / dates → Add to schedule saves 3 work-day entries the way the job's Schedule tab does (on the job's
// Schedule tab, in the schedule list, in the cloud); Cancel saves nothing; a daily-log sentence is not suggested.
// One headless browser, the offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs), seeded
// with made-up demo data (fake owner / staff / sub / jobs) built right here — no customer data.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cget, cset } = await import(pathToFileURL(HARNESS).href);
const { chromium } = createRequire(HARNESS)('playwright');
const build = process.argv[2];
if (!build) { console.error('usage: node test_VOICESCHED.mjs <dir with index.html>'); process.exit(2); }
const shared = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
chromium.launch = async () => ({ newContext: o => shared.newContext(o), close: async () => {} });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };

resetCloud();
/* fake demo data: an owner (the harness admin login), a PM, a staff member to invite, a framing sub, 24 active jobs */
const OWNER = 'Demo Owner', PMN = 'Sample PM', STAFF = 'Nate Sample', SUB = 'Marco Fakesub';
const JOB = 'PRJdemo0001';
cset('users', [{ id: 'u1', name: OWNER, email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: PMN, email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '901-555-0101' },
  { id: 'u3', name: STAFF, email: 'nsample@example.com', role: 'Project Manager', active: true, phone: '901-555-0102' }]);
cset('subs', [{ id: 'SUBdemo1', name: SUB, company: 'Demo Framing LLC', contact: SUB, trade: 'framing/drywall', isSub: true, phone: '901-555-0199', email: 'marco@example.com' },
  { id: 'SUBdemo2', name: 'Sample Roofing Crew', company: 'Sample Roofing Crew', trade: 'roofing', isSub: true }]);
cset('projects', Array.from({ length: 24 }, (_, i) => ({ id: i ? 'PRJdemo' + String(i + 1).padStart(4, '0') : JOB, po: 'PO-' + (2001 + i), name: i ? 'Demo Job ' + (i + 1) : 'Demo Framing Job',
  client: 'Sample Homeowner ' + (i + 1), address: (100 + i) + ' Demo St, Bartlett TN', pm: PMN, status: 'Active', type: 'Residential Reno', contract: 20000 + i * 1000, startDate: '2026-10-01', pct: 20 })));
cset('schedule', []);
const email = 'wjohnson@grayco-cs.com';   /* the harness admin login (named OWNER above) */
const ymdAdd = (y, n) => { const d = new Date(y + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const niceD = y => { const d = new Date(y + 'T12:00:00Z'); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCDate(); };
const dow = y => new Date(y + 'T12:00:00Z').getUTCDay();
const cloudArr = k => { let v = cget(k); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v : []; };
const cloudHist = () => cloudArr('gc_sched_history');
const req = createRequire(import.meta.url);
const FN = new URL('../../netlify/functions', import.meta.url).pathname;
const cloudSched = () => { let v = cget('schedule'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v : []; };

const c = await computer('VS', { build }); const p = c.page();
try {
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20 && window._gcVoiceSched && window._gcAUTAI && typeof window._setSchedule === 'function', null, 120000, 300); await sleep(8000);
  ok(!!(await waitFor(c, () => window._gcSchedHist && window._gcSchedHist.state().armed, null, 40000, 500)), 'the schedule change history is watching');
  const job = await c.ev(id => { const j = (window._crm.projects || []).find(x => x && x.id === id); return j && { name: j.name, po: j.autoPO, pm: j.pm, address: j.address }; }, JOB);
  ok(!!job, 'the test job is in the CRM', JOB);

  /* ── the parser (fixed "today" = Tue 2026-10-27, Central) ── */
  const P = await c.ev(() => { const V = window._gcVoiceSched, T = '2026-10-27';
    return ['Marco framing Monday 8am for 3 days', "have Marco's crew start drywall hang next week Tuesday at 7", 'drywall hang tomorrow at noon through Friday',
      'Nov 3 rough-in plumbing 2 days', 'schedule paint 11/9 8 to 3', 'Crew finished framing today', 'customer called Monday about the leak']
      .map(t => Object.assign(V.parse(t, T), { looks: V.looks(t) })); });
  ok(P[0].title === 'Framing' && /marco/i.test(P[0].who) && P[0].whoKind === 'sub' && P[0].start === '2026-11-02' && P[0].time === '08:00' && P[0].end === '2026-11-04' && P[0].days === 3 && P[0].looks, '"Marco framing Monday 8am for 3 days" → Framing · Marco (sub) · Mon Nov 2 08:00 → Wed Nov 4 (3 work days)', P[0]);
  ok(P[1].title === 'Drywall hang' && /marco/i.test(P[1].who) && P[1].start === '2026-11-03' && P[1].time === '07:00', '"next week Tuesday at 7" → Tue Nov 3 07:00, Drywall hang', P[1]);
  ok(P[2].start === '2026-10-28' && P[2].time === '12:00' && P[2].end === '2026-10-30' && P[2].days === 3, '"tomorrow at noon through Friday" → Wed Oct 28 12:00 → Fri Oct 30', P[2]);
  ok(P[3].start === '2026-11-03' && P[3].end === '2026-11-04' && P[3].title === 'Rough-in plumbing', '"Nov 3 … 2 days" → Nov 3 → Nov 4, Rough-in plumbing', P[3]);
  ok(P[4].start === '2026-11-09' && P[4].time === '08:00' && P[4].endTime === '15:00' && P[4].title === 'Paint', '"11/9 8 to 3" → Nov 9 08:00–15:00', P[4]);
  ok(!P[5].looks && !P[6].looks, 'a daily-log sentence and a "customer called Monday" note are not taken for scheduling', [P[5].looks, P[6].looks]);

  /* ── the panel: pick the job, say it ── */
  const before = await c.ev(id => ((() => { let L = null; try { window._setSchedule(pr => { L = pr; return pr; }); } catch (e) {} return L || window._crm.schedule || []; })()).filter(x => x && x.pid === id).length, JOB);
  await c.ev(id => window._gcAUTAI.mic(id), JOB); await sleep(800);
  ok(await p.locator('#_gcMicDest [data-d="sched"]').count() === 1, 'the "📅 Schedule" chip is in SEND TO');
  ok(await p.locator('#_gcMicJob').inputValue() === JOB, 'the job is picked', await p.locator('#_gcMicJob').inputValue());
  await p.locator('#_gcMicText').fill('Marco framing Monday 8am for 3 days'); await sleep(1500);
  const sug = await c.ev(() => { const ch = [...document.querySelectorAll('#_gcMicDest [data-d]')]; return { first: ch[0] && ch[0].getAttribute('data-d'), on: ch.filter(b => b.classList.contains('on')).map(b => b.getAttribute('data-d')), hint: (document.getElementById('_gcVsHint') || {}).textContent || '' }; });
  ok(sug.first === 'sched' && sug.on.join() === 'sched' && /schedule/i.test(sug.hint), 'smart routing: no chip tapped + a scheduling statement → 📅 Schedule picked and shown first', sug);
  await p.locator('#_gcMicGo').click(); await sleep(800);
  const today = await c.ev(() => window._gcVoiceSched.today());
  let mon = ymdAdd(today, ((1 - dow(today) + 7) % 7) || 7);
  const want = [mon, ymdAdd(mon, 1), ymdAdd(mon, 2)];
  const card = await c.ev(() => { const c = document.querySelector('[data-vs]'); if (!c) return null; const v = k => (c.querySelector('[data-v="' + k + '"]') || {}).value;
    return { title: v('title'), who: v('who'), start: v('start'), time: v('time'), end: v('end'), days: v('days'), job: (c.querySelector('.gcvs-job') || {}).textContent, sum: (c.querySelector('.gcvs-sum') || {}).textContent,
      add: !!c.querySelector('[data-vs-add]'), cancel: !!c.querySelector('[data-vs-cancel]'), post: !!document.getElementById('_gcMicPost') }; });
  ok(!!card && card.add && card.cancel, 'a confirm card with "Add to schedule" / "Cancel" is shown before anything is saved', card);
  ok(card && card.title === 'Framing' && /Marco/.test(card.who) && card.time === '08:00', 'the card: Task Framing · Who Marco · 08:00', card);
  ok(card && card.start === want[0] && card.end === want[2] && card.days === '3', 'the card: start ' + want[0] + ' (Monday) → end ' + want[2] + ', 3 work days', card);
  ok(card && card.job.indexOf(job.name) >= 0, 'the card names the picked job', card && card.job);
  ok(!card.post, 'only the Schedule card — no ✅ Post for other places');
  ok(await c.ev(id => ((() => { let L = null; try { window._setSchedule(pr => { L = pr; return pr; }); } catch (e) {} return L || window._crm.schedule || []; })()).filter(x => x && x.pid === id).length, JOB) === before, 'nothing saved before "Add to schedule"');

  /* ── Add to schedule ── */
  await p.locator('[data-vs-add]').click();
  const res = await waitFor(c, () => { const c = document.querySelector('[data-vs] ._gcARes'); return c && /\S/.test(c.textContent) ? c.textContent : null; }, null, 1300, 50);
  const saved = await waitFor(c, ([id, n]) => { const l = ((() => { let L = null; try { window._setSchedule(pr => { L = pr; return pr; }); } catch (e) {} return L || window._crm.schedule || []; })()).filter(x => x && x.pid === id && x.source === 'voice'); return l.length >= n ? l : null; }, [JOB, 3], 15000, 250);
  const sv = (saved || []).map(x => ({ date: x.date, title: x.title, vendor: x.vendor, time: x.time, endTime: x.endTime, scope: x.scope, groupId: x.groupId, dayNum: x.dayNum, totalDays: x.totalDays, address: x.address, assignee: x.assignee, type: x.type })).sort((a, b) => a.date < b.date ? -1 : 1);
  ok(sv.length === 3 && sv.map(x => x.date).join() === want.join(), 'three work-day entries saved: ' + want.join(', '), sv);
  ok(sv.every(x => x.title === 'Framing' && /Marco/.test(x.vendor) && x.time === '08:00' && x.endTime === '17:00' && x.type === 'work' && x.scope === 'company'), 'each: Framing · vendor Marco · 08:00–17:00 · company schedule (like the Schedule tab)', sv[0]);
  ok(sv.length === 3 && sv[0].groupId && sv.every(x => x.groupId === sv[0].groupId && x.totalDays === 3) && sv.map(x => x.dayNum).join() === '1,2,3', 'one group, day 1 / 2 / 3 of 3', sv);
  ok(sv.length && sv[0].address === (job.address || '') && sv[0].assignee === (job.pm || OWNER), 'the job address and the PM are on the entry', sv[0]);
  ok(/✓/.test(res || ''), 'the card says it was added', res);
  let inCloud = false; for (let i = 0; i < 40 && !inCloud; i++) { await sleep(500); inCloud = cloudSched().filter(x => x && x.pid === JOB && x.title === 'Framing' && x.source === 'voice').length === 3; }
  ok(inCloud, 'the entries reached the cloud (schedule) — they sync to the other computers');
  await sleep(2000);
  ok(!(await p.locator('#_gcMicOv').count()), 'the sheet closes after the add');
  /* the job's Schedule tab */
  async function jobSchedTab(){
    await c.ev(() => window._setView('projects')); await sleep(1500);
    await c.ev(id => { const j = window._crm.projects.find(x => x && x.id === id); window._openJobDetail(j); }, JOB); await sleep(2500);
    await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => /^Schedule \(\d+\)$/.test(x.textContent.trim())); if (b) b.click(); }); await sleep(2500);
  }
  await jobSchedTab();
  const tab = await c.ev(() => { const t = (document.querySelector('main') || document.body).innerText; return { framing: (t.match(/Framing/g) || []).length, add: /Add Schedule Phase/i.test(t), hist: /Schedule change history/.test(t), histAdded: /Added “Framing” \(Marco Fakesub\)/.test(t) && /voice/.test(t) }; });
  ok(tab.add && tab.framing >= 1, "the entry shows on the job's Schedule tab", tab);
  /* the schedule list (the Schedule screen's data and its persisted copy) */
  const disk = await c.ev(() => new Promise(res => { const q = indexedDB.open('grayco_crm'); q.onsuccess = () => { try { const g = q.result.transaction('kv', 'readonly').objectStore('kv').get('schedule'); g.onsuccess = () => { let v = g.result; if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; res((Array.isArray(v) ? v : []).filter(x => x && x.title === 'Framing' && x.source === 'voice').length); }; g.onerror = () => res(-1); } catch (e) { res(-2); } }; q.onerror = () => res(-3); }));
  ok(disk === 3, 'the schedule list on this computer (saved) has the 3 entries', disk);

  /* ── the change history: the voice add ── */
  const h1 = await waitFor(c, id => { const l = window._gcSchedHist.list(id).filter(e => e.kind === 'added' && e.title === 'Framing'); return l.length ? l : null; }, JOB, 15000, 300);
  ok(h1 && h1.length === 1 && h1[0].how === 'voice' && h1[0].by === OWNER && h1[0].text.indexOf(niceD(mon) + ' → ' + niceD(ymdAdd(mon, 2))) >= 0, 'history: one "Added Framing" entry for the 3 days — by the owner, how 🎤 voice', h1);
  let hc = null; for (let i = 0; i < 30 && !hc; i++) { await sleep(500); hc = cloudHist().find(e => e.pid === JOB && e.kind === 'added' && e.title === 'Framing'); }
  ok(!!hc, 'the history entry is in the cloud (gc_sched_history) for every computer');
  await sleep(2000);
  const tab2 = await c.ev(() => { const el = document.getElementById('_gcSchedHist'); return el ? el.innerText : ''; });
  ok(/Schedule change history/.test(tab2) && /Added “Framing” \(Marco Fakesub\)/.test(tab2) && /voice/.test(tab2) && tab2.indexOf(OWNER) >= 0, "the history shows on the job's Schedule tab (who / when / what / how)", tab2.slice(0, 300));

  /* ── a change made on the Schedule screen (the job's "+ Add Schedule Phase / Task") ── */
  const wed = ymdAdd(mon, 9);   /* a Wednesday */
  await p.locator('#_qsTitle').fill('Drywall hang'); await p.locator('#_qsStart').fill(wed); await p.locator('#_qsDays').fill('2'); await p.locator('#_qsVendor').fill(SUB);
  await c.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => x.textContent.trim() === 'Add to Schedule'); b.click(); }); await sleep(500);
  const sAdd = await waitFor(c, id => { let L = null; window._setSchedule(pr => { L = pr; return pr; }); const l = (L || window._crm.schedule || []).filter(x => x && x.pid === id && x.title === 'Drywall hang'); return l.length >= 2 ? l.map(x => x.date).sort() : null; }, JOB, 30000, 250);
  ok(sAdd && sAdd.join() === [wed, ymdAdd(wed, 1)].join(), 'the Schedule screen added Drywall hang ' + wed + ' + 1 day', sAdd);
  const h2 = await waitFor(c, id => { const l = window._gcSchedHist.list(id).filter(e => e.kind === 'added' && e.title === 'Drywall hang'); return l.length ? l : null; }, JOB, 30000, 300);
  ok(h2 && h2.length === 1 && h2[0].how === 'manual' && h2[0].by === OWNER, 'history: the Schedule screen add → "Added Drywall hang", ✍ manual, by the owner', h2);
  /* a move (as a drag on the calendar does: the schedule setter) — Framing one day later */
  await c.ev(() => document.dispatchEvent(new Event('pointerdown'))); await sleep(200);   /* the person is using this computer */
  await c.ev(id => window._setSchedule(prev => prev.map(x => x && x.pid === id && x.title === 'Framing' && x.source === 'voice' ? Object.assign({}, x, { date: (d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + (t.getUTCDay() === 5 ? 2 : 1)); return t.toISOString().slice(0, 10); })(x.date), updatedAt: new Date().toISOString() }) : x)), JOB);
  const h3 = await waitFor(c, id => { const l = window._gcSchedHist.list(id).filter(e => e.kind === 'changed' && e.title === 'Framing'); return l.length ? l : null; }, JOB, 30000, 300);
  ok(h3 && h3.length === 1 && h3[0].how === 'manual' && /Moved “Framing”: date .* → /.test(h3[0].text) && h3[0].changes[0].f === 'date', 'history: the move → "Moved Framing: date old → new", manual', h3);
  const h3b = h3 && h3[0].changes[0];
  ok(h3b && h3b.from.indexOf(niceD(mon)) === 0 && h3b.to.indexOf(niceD(ymdAdd(mon, 1))) === 0, 'the move shows old → new dates (' + niceD(mon) + ' … → ' + niceD(ymdAdd(mon, 1)) + ' …)', h3b);

  /* ── the portals (their own server code, on the cloud copy) ── */
  let movedInCloud = false; for (let i = 0; i < 40 && !movedInCloud; i++) { await sleep(500); movedInCloud = cloudSched().some(x => x && x.pid === JOB && x.title === 'Framing' && x.date === ymdAdd(mon, 3)); }
  ok(movedInCloud, 'the moved dates reached the cloud');
  const PORTAL = req(FN + '/portal.js'), PA = req(FN + '/portal-access.js'), GCP = req(FN + '/_lib/gcp.js');
  PORTAL._core.kvRead = async keys => { const o = {}; keys.forEach(k => { let v = cget(k); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} o[k] = v; }); return o; };
  const gc = await GCP.scheduleOf(JOB);
  ok(gc.some(x => x.title === 'Framing' && x.date === ymdAdd(mon, 1)) && !gc.some(x => x.title === 'Framing' && x.date === mon) && gc.some(x => x.title === 'Drywall hang' && x.date === wed), 'GC portal schedule: the voice entry (moved dates) and the Schedule-screen entry', gc);
  ok(gc.every(x => Object.keys(x).join() === 'title,date,end'), 'GC portal: only task names and dates (no sub, no notes)', gc[0]);
  const subs = (() => { let v = cget('subs'); if (typeof v === 'string') v = JSON.parse(v); return Array.isArray(v) ? v : (v && v.v) || []; })();
  const marco = subs.find(x => /marco/i.test(x.name || ''));
  const projs = cloudArr('projects'), jobRec = projs.find(x => x && x.id === JOB);
  const subRows = PA._sched.schedFor({ schedule: cloudSched() }, [jobRec], marco);
  ok(subRows.filter(x => x.title === 'Framing').map(x => x.date).sort().join() === [ymdAdd(mon, 1), ymdAdd(mon, 2), ymdAdd(mon, 3)].join() && subRows.some(x => x.title === 'Drywall hang'), "Marco's sub portal schedule: Framing (moved) and Drywall hang", subRows);

  /* the customer portal: the job's plan steps follow a templated row */
  const tplDay = ymdAdd(mon, 14);
  await c.ev(([id, d]) => { window._setProjects(l => l.map(q => q && q.id === id ? Object.assign({}, q, { schedPlan: { tpl: 'TT', name: 'Test plan', steps: [{ id: 'tt-roof', name: 'Roof install', date: d, end: d, portal: true }] } }) : q));
    window._setSchedule(prev => prev.concat([{ id: 'SCHtt1', pid: id, title: 'Roof install', date: d, endDate: d, time: '07:00', endTime: '17:00', type: 'work', scope: 'company', tpl: 'TT', tplTask: 'tt-roof', tplName: 'Roof install', portal: true }])); }, [JOB, tplDay]);
  await sleep(4000);
  await c.ev(() => document.dispatchEvent(new Event('pointerdown'))); await sleep(200);   /* the person is using this computer */
  const tplNew = ymdAdd(tplDay, 2);
  await c.ev(([d]) => window._setSchedule(prev => prev.map(x => x && x.id === 'SCHtt1' ? Object.assign({}, x, { date: d, endDate: d }) : x)), [tplNew]);
  const planOk = await waitFor(c, ([id, d]) => { let L = null; window._setProjects(pr => { L = pr; return pr; }); const q = (L || window._crm.projects).find(x => x && x.id === id); const st = q && q.schedPlan && q.schedPlan.steps[0]; return st && st.date === d ? st : null; }, [JOB, tplNew], 30000, 300);
  ok(!!planOk, "the job's customer-portal plan step follows the move (" + tplNew + ')', planOk);
  let custSteps = []; for (let i = 0; i < 40; i++) { await sleep(500); const q = cloudArr('projects').find(x => x && x.id === JOB); custSteps = PORTAL._sched.portalSteps(q || {}); if (custSteps[0] && custSteps[0].date === tplNew) break; }
  ok(custSteps.length === 1 && custSteps[0].date === tplNew && custSteps[0].name === 'Roof install' && Object.keys(custSteps[0]).every(k => ['name', 'date', 'end', 'done', 'now'].includes(k)), 'customer portal payload: "Roof install" on the new date (name + dates only)', custSteps);
  const h4 = await waitFor(c, id => window._gcSchedHist.list(id).filter(e => e.kind === 'changed' && e.title === 'Roof install').length || null, JOB, 30000, 300);
  ok(!!h4, 'history: the templated move is recorded too');

  /* ── Cancel saves nothing ── */
  const n0 = await c.ev(() => ((() => { let L = null; try { window._setSchedule(pr => { L = pr; return pr; }); } catch (e) {} return L || window._crm.schedule || []; })()).length), c0 = cloudSched().length;
  await c.ev(id => window._gcAUTAI.mic(id), JOB); await sleep(800);
  await p.locator('#_gcMicText').fill("have Marco's crew start drywall hang next week Tuesday at 7"); await sleep(1500);
  await p.locator('#_gcMicGo').click(); await sleep(800);
  const card2 = await c.ev(() => { const c = document.querySelector('[data-vs]'); const v = k => (c.querySelector('[data-v="' + k + '"]') || {}).value; return c && { title: v('title'), start: v('start'), time: v('time') }; });
  const tue = ymdAdd(mon, 1);
  ok(card2 && card2.title === 'Drywall hang' && card2.start === tue && card2.time === '07:00', 'second note: card Drywall hang · ' + tue + ' 07:00', card2);
  await p.locator('[data-vs-cancel]').click(); await sleep(3000);
  const after = await c.ev(() => ({ n: ((() => { let L = null; try { window._setSchedule(pr => { L = pr; return pr; }); } catch (e) {} return L || window._crm.schedule || []; })()).length, card: !!document.querySelector('[data-vs]'), msg: (document.getElementById('_gcMicMsg') || {}).textContent }));
  ok(after.n === n0 && !after.card && /nothing was saved/i.test(after.msg), 'Cancel: the card goes, nothing is added to the schedule', after);
  ok(cloudSched().length === c0, 'Cancel: nothing reached the cloud');

  /* ── a tapped chip is the person's choice; a daily-log sentence is not suggested ── */
  await c.ev(() => window._gcAUTAI.closeMic());
  await c.ev(id => window._gcAUTAI.mic(id), JOB); await sleep(800);
  await p.locator('#_gcMicText').fill('Crew finished framing today, 4 guys'); await sleep(1500);
  const s1 = await c.ev(() => [...document.querySelectorAll('#_gcMicDest .on')].map(b => b.getAttribute('data-d')).join());
  ok(s1 === 'note', 'a daily-log sentence keeps Job notes (no Schedule suggestion)', s1);
  await p.locator('#_gcMicDest [data-d="log"]').click(); await sleep(200);
  await p.locator('#_gcMicText').fill('Marco framing Monday 8am for 3 days'); await sleep(1500);
  const s2 = await c.ev(() => [...document.querySelectorAll('#_gcMicDest .on')].map(b => b.getAttribute('data-d')).sort().join());
  ok(s2 === 'log,note', 'after the person taps a chip, the Schedule suggestion does not override it', s2);
  await c.ev(() => window._gcAUTAI.closeMic());

  /* ── 👤 My schedule: an appointment for me (+ an invited staff member) ── */
  const P2 = await c.ev(() => { const V = window._gcVoiceSched, T = '2026-10-27';
    return ['meeting with Nate Thursday 2pm', 'dentist Friday 9 to 10', 'walkthrough with adjuster at 123 Main tomorrow 3pm'].map(t => Object.assign(V.parseMine(t, T), { want: V.want(t) })); });
  ok(P2[0].want === 'mine' && P2[0].title === 'Meeting with Nate' && P2[0].start === '2026-10-29' && P2[0].time === '14:00' && P2[0].endTime === '15:00' && P2[0].invite === STAFF, '"meeting with Nate Thursday 2pm" → Meeting with Nate · Thu Oct 29 14:00–15:00 · invite Nate Sample', P2[0]);
  ok(P2[1].want === 'mine' && P2[1].title === 'Dentist' && P2[1].start === '2026-10-30' && P2[1].time === '09:00' && P2[1].endTime === '10:00', '"dentist Friday 9 to 10" → Dentist · Fri Oct 30 09:00–10:00', P2[1]);
  ok(P2[2].want === 'mine' && /walkthrough/i.test(P2[2].title) && P2[2].start === '2026-10-28' && P2[2].time === '15:00' && P2[2].where === '123 Main', '"walkthrough with adjuster at 123 Main tomorrow 3pm" → Wed Oct 28 15:00 at 123 Main', P2[2]);
  await c.ev(id => window._gcAUTAI.mic(id), JOB); await sleep(800);
  await p.locator('#_gcMicText').fill('meeting with Nate Thursday 2pm'); await sleep(1500);
  const s3 = await c.ev(() => { const ch = [...document.querySelectorAll('#_gcMicDest [data-d]')]; return { first: ch[0].getAttribute('data-d'), on: ch.filter(b => b.classList.contains('on')).map(b => b.getAttribute('data-d')).join() }; });
  ok(s3.first === 'mine' && s3.on === 'mine', 'smart routing: an appointment → 👤 My schedule picked and first', s3);
  await p.locator('#_gcMicGo').click(); await sleep(800);
  const card3 = await c.ev(() => { const c = document.querySelector('[data-vs][data-vk="mine"]'); const v = k => (c.querySelector('[data-v="' + k + '"]') || {}).value; return c && { title: v('title'), start: v('start'), time: v('time'), endTime: v('endTime'), invite: v('invite') }; });
  const thu = ymdAdd(today, ((4 - dow(today) + 7) % 7) || 7);
  ok(card3 && card3.title === 'Meeting with Nate' && card3.start === thu && card3.time === '14:00' && card3.endTime === '15:00' && card3.invite === STAFF, 'the 👤 card: Meeting with Nate · ' + thu + ' 14:00–15:00 · invite Nate Sample', card3);
  const hBefore = await c.ev(() => window._gcSchedHist.list().length);
  await p.locator('[data-vs-add]').click();
  const mine = await waitFor(c, () => { let L = null; window._setSchedule(pr => { L = pr; return pr; }); const l = (L || window._crm.schedule || []).filter(x => x && x.title === 'Meeting with Nate' && x.source === 'voice'); return l.length >= 2 ? l.map(x => ({ by: x.by, assignee: x.assignee, scope: x.scope, private: x.private, date: x.date, time: x.time, endTime: x.endTime, pid: x.pid, invitedBy: x.invitedBy })) : null; }, null, 30000, 250);
  if (!mine) console.log('    card says: ' + await c.ev(() => { const r = document.querySelector('[data-vk="mine"] ._gcARes'); return r && r.textContent; }));
  ok(mine && mine.every(x => x.scope === 'personal' && x.private === true && x.date === thu && x.time === '14:00' && x.endTime === '15:00' && !x.pid), 'saved as 🔒 personal items (Schedule screen "Personal"), not on the job', mine);
  ok(mine && mine.some(x => x.by === OWNER && x.assignee === OWNER) && mine.some(x => x.by === STAFF && x.assignee === STAFF && x.invitedBy === OWNER), "on my schedule and on Nate's (invited)", mine);
  let mc = false; for (let i = 0; i < 30 && !mc; i++) { await sleep(500); mc = cloudSched().filter(x => x && x.title === 'Meeting with Nate').length === 2; }
  ok(mc, 'the appointment reached the cloud (calendar feed / Google Calendar read it from there)');
  await sleep(3000);
  ok(await c.ev(n => window._gcSchedHist.list().length === n, hBefore), 'a personal appointment is not written in any job history');
  const gc2 = await GCP.scheduleOf(JOB), sub2 = PA._sched.schedFor({ schedule: cloudSched() }, [jobRec], marco);
  ok(!gc2.concat(sub2).some(x => /Meeting with Nate/.test(x.title)), 'never on the GC or sub portal');

  /* ── GrayCo Field: the 📅 Schedule tool in each job's grid ── */
  const ft = await c.ev(() => window._gcFieldTools && window._gcFieldTools.list().find(t => t.id === 'vsched'));
  ok(ft && ft.label === 'Schedule' && ft.needsSigned === false, "GrayCo Field: a 📅 Schedule tool is in each job's tool grid", ft);
  await c.ev(id => window._gcFieldTools.run('vsched', id), JOB); await sleep(800);
  const fo = await c.ev(() => ({ job: (document.getElementById('_gcMicJob') || {}).value, on: [...document.querySelectorAll('#_gcMicDest .on')].map(b => b.getAttribute('data-d')).join() }));
  ok(fo.job === JOB && fo.on === 'sched', 'the tool opens the voice sheet on that job with 📅 Schedule picked', fo);
  await c.ev(() => window._gcAUTAI.closeMic());
  ok(!c.errs.some(e => /vs[A-Z]|VOICESCHED|SCHEDHIST|_gcVoiceSched|_gcSchedHist/.test(e)), 'no page errors from the patch', c.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await shared.close();
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
