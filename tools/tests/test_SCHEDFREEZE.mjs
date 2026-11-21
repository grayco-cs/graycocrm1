// test_SCHEDFREEZE.mjs <build-dir> — patch SCHEDFREEZE (owner 11/20, iPhone, GrayCo Field): "It's frozen here" (📅 My Schedule showed
// only the "📅 My schedule — Today: …" strip, nothing under it, "⏳ Saved on phone, sending…") and, 8:22 PM, "New appointment and
// other buttons don't work" — after a 5G → Wi-Fi switch and a resume of the installed app. Plus: bid dates and bid-portal site walks
// go on My Schedule automatically.
//   A. node: window._gcBidDates — my bids' pre-bid / site walk, questions due, bid due, bid bond, sealed delivery (time + place, linked
//      to the lead / job); not someone else's bid, not a closed bid; a date that already has a real schedule entry (same lead / job +
//      kind + day) is not shown twice; fromBidJob → a real schedule entry for the person who saved it (cleared date → removed).
//   B. the CRM (offline harness, made-up data, iPhone 390 wide, installed app, 4x CPU throttle):
//      1. the network drops mid-load, the app goes to the background and comes back: the Home is not blank, 📅 My Schedule opens from
//         the bar, EVERY control on it is the top element at its centre (elementFromPoint) and opens its screen
//      2. My Schedule renders from what is on the phone; a list that throws → "⚠️ Couldn't load your schedule — ↻ Tap to retry" (never
//         nothing); retry → the list; a list that arrives late while it is open → redrawn by itself
//      3. an invisible full-screen layer left on top does not eat the tap; a button redrawn under the finger (the click lost) still works
//      4. "⏳ Saved on phone, sending…": the upload fails, the network comes back ('online') → sent by itself → "✓ All sent"
//      5. a blank Field Home → "⚠️ Couldn't load your home — ↻ Tap to retry" (not an empty page); retry → the Home
//      6. bid dates on 📅 My Schedule (PM): the lead's pre-bid (10:00 AM, the place) and bid due; a tap opens the lead
//      7. the bid portal's site walk (fromBidJob) → a real schedule entry in the cloud, on My Schedule, assigned to the person who saved it
// Usage: node test_SCHEDFREEZE.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_SCHEDFREEZE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/schedfreeze/';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const ymd = d => new Date(Date.now() + d * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const ago = d => new Date(Date.now() - d * 864e5).toISOString();

/* ── A. node ── */
console.log('A. node');
const T = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
{
  const m = T.match(/<script id="gc-patch-schedfreeze">([\s\S]*?)<\/script>/);
  ok(!!m && (T.match(/__GC_PATCH_SCHEDFREEZE__/g) || []).length === 1, 'the SCHEDFREEZE script is in index.html (one marker)');
  ok(T.includes('function openSched0(o){') && T.includes("schedFail(e)") && T.includes("a === 'sretry'"), 'PMFIELD: My Schedule never opens to nothing (schedFail + ↻ retry)');
  ok(T.includes("W._gcBidDates.list({ name: myName()") && T.includes("W._gcBidDates.list({ name: u.name") && T.includes("W._gcBidDates.list({ name: sc.name") && T.includes('W._gcBidDates.fromBidJob(M.jobId, body, pid)'),
    'bid dates wired into PMFIELD My Schedule, the TIMEOFF strip / sheet, the Desk card, and the bid portal 💾 Save');
  const saved = [];
  const mk = (leads, sched) => { const Wn = { document: { addEventListener(){}, createElement: () => ({ style: {}, setAttribute(){} }), head: { appendChild(){} }, documentElement: {}, querySelector: () => null, getElementById: () => null, body: { children: [] }, hidden: false },
    setTimeout: () => 0, setInterval: () => 0, addEventListener(){}, console: { warn(){}, log(){} }, navigator: { onLine: true }, _crm: { leads, schedule: sched }, _gcMeNow: { name: 'Demo PM' },
    _gcPmField: { saveSched: (up, rm) => { saved.push({ up, rm }); return Promise.resolve(true); } }, localStorage: { getItem: () => null } };
    Wn.window = Wn; Wn.navigator = Wn.navigator; vm.createContext(Wn); vm.runInContext('var navigator = window.navigator;' + m[1], Wn); return Wn; };
  const L = [
    { id: 'LB1', name: 'Sample Library Reroof', pm: 'Demo PM', stage: 'Bidding', address: '5 Demo Way', bidDue: ymd(5) + 'T14:00', preBid: ymd(1) + 'T10:00', preBidLocation: 'Front office', preBidMandatory: true, questionsDue: ymd(3), submitMethod: 'Sealed — hand deliver', submitWhere: '1 City Hall',
      leadExtra: { planRoom: { fields: { bidBond: '5%' } } } },
    { id: 'LB2', name: 'Someone else bid', pm: 'Other PM', stage: 'Bidding', bidDue: ymd(4) },
    { id: 'LB3', name: 'Lost bid', estimator: 'Demo PM', stage: 'Lost', bidDue: ymd(4) },
    { id: 'LB4', name: 'Estimator bid', estimator: 'Demo PM', stage: 'Bidding', planRoom: { fields: { preBid: { date: ymd(2), time: '09:30', place: 'Gym', mandatory: false } } } }];
  const W1 = mk(L, []);
  const ev = W1._gcBidDates.list({ name: 'Demo PM', from: ymd(0), to: ymd(30) });
  const k = ev.map(x => x.leadId + ':' + x.bidKind).sort();
  ok(k.join() === ['LB1:biddue', 'LB1:bond', 'LB1:prebid', 'LB1:questions', 'LB1:sealed', 'LB4:prebid'].sort().join(), 'my bids: pre-bid · questions · bid due · bid bond · sealed delivery; an estimator\'s plan-room pre-bid; not another PM\'s bid, not a lost bid', k);
  const pb = ev.find(x => x.id === 'bid:LB1:prebid');
  ok(pb && pb.time === '10:00 AM' && pb.date === ymd(1) && /MANDATORY/.test(pb.title) && pb.address === 'Front office' && pb.virtual, 'the pre-bid: its time, place, MANDATORY, virtual (never saved)', pb);
  ok((ev.find(x => x.id === 'bid:LB1:sealed') || {}).address === '1 City Hall' && (ev.find(x => x.id === 'bid:LB4:prebid') || {}).time === '9:30 AM', 'the sealed bid\'s delivery address; the plan room pre-bid 9:30 AM');
  const W2 = mk(L, [{ id: 'S1', leadId: 'LB1', type: 'appointment', apptKind: 'Site walk', title: 'Job walk — library', date: ymd(1), assignee: 'Demo PM' }]);
  const ev2 = W2._gcBidDates.list({ name: 'Demo PM', from: ymd(0), to: ymd(30) });
  ok(!ev2.some(x => x.id === 'bid:LB1:prebid') && ev2.some(x => x.id === 'bid:LB1:biddue'), 'a pre-bid that already has a real job-walk entry (same lead, same day) is not shown twice', ev2.map(x => x.id));
  ok(W1._gcBidDates.list({ name: 'Nobody', from: ymd(0), to: ymd(30) }).length === 0 && W1._gcBidDates.list({ all: true, from: ymd(0), to: ymd(30) }).some(x => x.leadId === 'LB2'), 'someone not on any bid: nothing; Everyone: every open bid');
  saved.length = 0;
  const x = await W1._gcBidDates.fromBidJob('BJ7', { title: 'Sample Clinic', address: '9 Clinic Rd', crmLeadId: 'LB1', siteWalk: { date: ymd(2), time: '13:30', location: 'North gate', mandatory: true } }, 'P1');
  ok(saved.length === 1 && saved[0].up[0].id === 'SCHbw-BJ7' && saved[0].up[0].assignee === 'Demo PM' && saved[0].up[0].createdBy === 'Demo PM' && saved[0].up[0].time === '1:30 PM' && saved[0].up[0].address === 'North gate' && saved[0].up[0].pid === 'P1' && saved[0].up[0].leadId === 'LB1' && /Site walk/.test(saved[0].up[0].apptKind),
    'bid portal 💾 Save with a site walk → a real schedule entry (Site walk, 1:30 PM, North gate, the job + lead), assigned to and made by the person who saved it', saved[0]);
  const W3 = mk([], [x]); saved.length = 0;
  await W3._gcBidDates.fromBidJob('BJ7', { title: 'Sample Clinic', siteWalk: { date: '' } }, '');
  ok(saved.length === 1 && saved[0].rm.join() === 'SCHbw-BJ7', 'the site walk date cleared → its schedule entry removed', saved);
}

/* ── B. the CRM ── */
if (process.env.SCHEDFREEZE_NODE_ONLY === '1') { console.log(`SCHEDFREEZE (node only) ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0); }
const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const acct = name => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === name);
const NICK = acct('Nick Gray'), PM = acct('Demo PM');
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
  { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true, phone: '9015550111' }]);
H.cset('projects', [
  { id: 'P1', name: 'Druluck Roof/tree', client: 'Sample Homeowner A', address: '101 Demo St', type: 'Roofing', pm: 'Demo PM', status: 'Active', contractSigned: true, updatedAt: ago(1) },
  { id: 'P2', name: 'Kitchen - Maple', client: 'Sample Homeowner B', address: '202 Demo Ave', type: 'Residential Reno', pm: 'Demo PM', status: 'Active', contractSigned: true, updatedAt: ago(1) },
  { id: 'P3', name: 'Office TI - Elm', client: 'Sample Biz', address: '303 Demo Blvd', type: 'Commercial TI', pm: 'Nick Gray', status: 'Active', contractSigned: true, updatedAt: ago(1) }]);
H.cset('schedule', [
  { id: 'SCH1', pid: 'P1', title: 'End Date', date: ymd(0), time: '8:00 AM', assignee: 'Nick Gray', type: 'work', scope: 'company', updatedAt: ago(1) },
  { id: 'SCH2', pid: 'P2', title: 'Demo cabinets', date: ymd(0), time: '9:00 AM', assignee: 'Demo PM', type: 'work', scope: 'company', updatedAt: ago(1) },
  { id: 'SCH3', pid: 'P3', title: 'Framing', date: ymd(1), time: '7:00 AM', assignee: 'Nick Gray', type: 'work', scope: 'company', updatedAt: ago(1) }]);
H.cset('leads', [
  { id: 'LB1', name: 'Sample Library Reroof', client: 'Sample City', type: 'Commercial', pm: 'Demo PM', stage: 'Bidding', address: '5 Demo Way', bidDue: ymd(4) + 'T14:00', preBid: ymd(1) + 'T10:00', preBidLocation: 'Front office', createdAt: ago(3) },
  { id: 'LB2', name: 'Other bid', client: 'Sample GC', type: 'Commercial', pm: 'Other PM', stage: 'Bidding', bidDue: ymd(2), createdAt: ago(3) }]);
H.cset('invoices', []); H.cset('projectDocs', []); H.cset('punch', []); H.cset('timesheets', []);

const IPHONE = () => { try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); Object.defineProperty(navigator, 'standalone', { get: () => true });
  const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} } : mm(q); } catch (e) {} };
const RX = /supabase\.co|sb\.test|\.netlify\//;
const OPEN = [];
async function phone(email, who, dropMidLoad){
  const c = await H.computer(who, { build, mobile: true, init: IPHONE }); OPEN.push(c);
  const p = c.page();
  const cdp = await c.ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await H.signIn(c, email, 9000);
  if (dropMidLoad) {   /* the network drops while the app loads (5G → Wi-Fi), then the app goes to the background and comes back */
    c.drop = true; await p.route(RX, r => c.drop ? r.abort('failed') : r.fallback());
    await sleep(2500); c.drop = false;
    await c.ev(() => { window.dispatchEvent(new Event('online')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(1500);
    await c.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  }
  await H.waitFor(c, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs[data-ra-bar]'), null, 60000);
  await H.waitFor(c, () => (window._crm && window._crm.schedule || []).length >= 3 && (window._crm.leads || []).length >= 2, null, 30000);
  await sleep(3000);
  return c;
}
/* a real finger: the element at the centre must be the button (or inside it), then a touch tap there */
async function tapAt(c, sel){
  const p = c.page(), L = p.locator(sel).first();
  await L.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const bb = await L.boundingBox().catch(() => null); if (!bb) return 'nobox';
  const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
  const hit = await p.evaluate(({ x, y, sel }) => { const e = document.elementFromPoint(x, y), t = document.querySelector(sel); return t && (e === t || t.contains(e)) ? 'ok' : (e ? String(e.id || e.className || e.tagName).slice(0, 60) : 'none'); }, { x, y, sel });
  await p.touchscreen.tap(x, y); await sleep(900);
  return hit;
}
const shown = c => c.ev(() => ({
  sheets: [...document.querySelectorAll('.gc-ra-sheet,.gc-to-ov')].map(o => (o.getAttribute('data-pmf-sheet') || o.getAttribute('data-to-sheet') || 'to') + '|' + ((o.querySelector('.hd b') || {}).textContent || '').slice(0, 50)),
  toast: [document.getElementById('gc-ra-toast'), document.getElementById('gc-to-toast'), document.getElementById('gc-fh-toast')].filter(x => x && x.style.display !== 'none' && getComputedStyle(x).display !== 'none').map(x => x.textContent.slice(0, 80)).join(' | '),
  view: localStorage.getItem('grayco_view'), home: !!document.querySelector('#_gcJobPick .gc-pmf'), clockSheet: !!document.querySelector('.gc-fh-sheet,._gcSheetOv,.gcfp-sheet') }));
const closeAll = c => c.ev(() => { document.querySelectorAll('.gc-ra-sheet,.gc-to-ov,.gc-fh-sheet,._gcSheetOv,.gcfp-sheet').forEach(o => o.remove()); ['gc-ra-toast', 'gc-to-toast', 'gc-fh-toast'].forEach(id => { const t = document.getElementById(id); if (t) t.style.display = 'none'; }); });

try {
  /* ════ 1. Nick (admin): network drop mid-load + resume ════ */
  console.log('B1. Nick on an iPhone (installed app, 4x CPU): the network drops mid-load, the app is resumed');
  const nk = await phone(NICK, 'Nick', true);
  await H.waitFor(nk, () => !!document.querySelector('#_gcJobPick .fh-wrap'), null, 30000);
  const t0h = Date.now(); await H.waitFor(nk, () => !!document.querySelector('#_gcJobPick .gc-pmf') || !!document.getElementById('gc-sf-homefail'), null, 30000); const homeMs = Date.now() - t0h;
  await sleep(6000); await H.waitFor(nk, () => !!document.querySelector('#_gcJobPick .gc-pmf') || !!document.getElementById('gc-sf-homefail'), null, 30000);   /* and still filled a moment later (the lists re-read redraw it) */
  await nk.page().screenshot({ path: SHOTS + 'nick_after_resume.png' });
  const hm = await nk.ev(() => { const h = document.querySelector('#_gcJobPick'), w = h && h.querySelector('.fh-wrap'); return { home: !!h, ra: h && h.getAttribute('data-ra'), pmf: !!(w && w.querySelector('.gc-pmf')), txt: w ? w.innerText.slice(0, 120) : document.body.innerText.slice(0, 200), fail: !!document.getElementById('gc-sf-homefail'), view: localStorage.getItem('grayco_view'), field: document.documentElement.className.slice(0, 200) }; });
  ok(hm.pmf || hm.fail, 'after the drop + resume the Home fills in by itself once the network answers (the dashboard, or the ↻ retry card) — ' + homeMs + ' ms', hm);
  const lm = await H.waitFor(nk, () => window._gcSF && !window._gcSF.listsMissing() && !!window._gcTimeOff, null, 30000);
  ok(!!lm, 'the lists the drop kept from loading are read again once the network answers (I am on the people list again)', await nk.ev(() => ({ users: (window._crm.users || []).map(u => u.email), log: window._gcSF && window._gcSF.log() })));
  await nk.page().screenshot({ path: SHOTS + 'nick_home.png' });
  const bar = await tapAt(nk, '#gc-fh-tabs [data-t="ra-sched"]');
  const s1 = await shown(nk);
  ok(bar === 'ok' && s1.sheets.some(x => /^sched\|📅 My Schedule/.test(x)), 'the bar\'s 📅 My Schedule is on top at its centre and opens My Schedule', { bar, s1 });
  const it = await nk.ev(() => [...document.querySelectorAll('.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="item"]')].map(b => b.getAttribute('data-id')));
  ok(it.includes('SCH1'), 'My Schedule lists today\'s Druluck 8:00 AM from the phone\'s own data', it);
  await nk.page().screenshot({ path: SHOTS + 'nick_sched.png' });
  /* every control */
  const ctrls = await nk.ev(() => [...document.querySelectorAll('.gc-pmf-sheet[data-pmf-sheet="sched"] button')].map(b => ({ a: b.getAttribute('data-pmf-a') || (b.hasAttribute('data-x') ? 'x' : ''), v: b.getAttribute('data-v') || '', id: b.getAttribute('data-id') || '', t: b.textContent.trim().slice(0, 30) })));
  const EXPECT = { appt: s => s.sheets.some(x => /^form\|📅 New appointment/.test(x)), work: s => s.sheets.some(x => /^form\|🛠 Schedule work/.test(x)), item: s => s.sheets.some(x => /^(form|view)\|/.test(x)),
    v: (s, k) => s.sheets.some(x => k.v === 'week' ? /^sched\|.*week of/.test(x) : /^sched\|📅 My Schedule — (?!week)/.test(x)), w: s => s.sheets.some(x => /^sched\|/.test(x)), prev: s => s.sheets.some(x => /^sched\|/.test(x)), next: s => s.sheets.some(x => /^sched\|/.test(x)), today: s => s.sheets.some(x => /^sched\|/.test(x)),
    to: s => s.sheets.some(x => !/^sched\|/.test(x)), clock: s => !!s.toast || s.clockSheet || s.sheets.length > 0, x: s => !s.sheets.some(x => /^sched\|/.test(x)) };
  const bad = [];
  for (const k of ctrls) {
    await closeAll(nk); await nk.ev(() => window._gcPmField.open({ reset: true })); await sleep(500);
    if (k.a === 'v' || k.a === 'w') await nk.ev(() => window._gcPmField.open({ view: 'day' }));
    const sel = '.gc-pmf-sheet[data-pmf-sheet="sched"] ' + (k.a === 'x' ? '[data-x]' : '[data-pmf-a="' + k.a + '"]' + (k.v ? '[data-v="' + k.v + '"]' : '') + (k.id ? '[data-id="' + k.id + '"]' : ''));
    const hit = await tapAt(nk, sel); const s = await shown(nk);
    const good = hit === 'ok' && (EXPECT[k.a] ? EXPECT[k.a](s, k) : true);
    if (!good) bad.push({ k, hit, s });
  }
  ok(ctrls.length >= 12 && !bad.length, 'every control on My Schedule (' + ctrls.map(k => k.a + (k.v ? ':' + k.v : '')).join(', ') + ') is the top element at its centre and opens its screen', bad);

  /* ════ 2. a list that throws → a visible retry; a late list → redrawn ════ */
  console.log('B2. My Schedule never opens to nothing');
  await closeAll(nk);
  await nk.ev(() => { window.__sfTO = window._gcTimeOff; window._gcTimeOff = new Proxy({}, { get(){ throw new Error('list not loaded'); } }); });
  const bar2 = await tapAt(nk, '#gc-fh-tabs [data-t="ra-sched"]');
  const s2 = await nk.ev(() => { const o = document.querySelector('.gc-pmf-sheet[data-pmf-sheet="sched"]'); return o ? { fail: o.getAttribute('data-sf-fail'), txt: o.innerText.slice(0, 300), retry: !!o.querySelector('[data-pmf-a="sretry"]'), appt: !!o.querySelector('[data-pmf-a="appt"]'), off: !!o.querySelector('[data-pmf-a="to"][data-v="off"]') } : null; });
  ok(bar2 === 'ok' && s2 && s2.fail === '1' && /Couldn.t load your schedule/.test(s2.txt) && s2.retry && s2.appt && s2.off, 'a list that throws: My Schedule still opens — "⚠️ Couldn\'t load your schedule — ↻ Tap to retry", ＋ New appointment and 🏖 Time off still there', s2);
  const ap2 = await tapAt(nk, '.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="appt"]');
  ok(ap2 === 'ok' && (await shown(nk)).sheets.some(x => /^form\|📅 New appointment/.test(x)), 'New appointment works from the "couldn\'t load" screen');
  await closeAll(nk); await nk.ev(() => window._gcPmField.open({ reset: true }));
  await nk.ev(() => { window._gcTimeOff = window.__sfTO; });
  const rt = await tapAt(nk, '.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="sretry"]');
  const s3 = await nk.ev(() => { const o = document.querySelector('.gc-pmf-sheet[data-pmf-sheet="sched"]'); return o ? { fail: o.getAttribute('data-sf-fail'), items: [...o.querySelectorAll('[data-pmf-a="item"]')].map(b => b.getAttribute('data-id')) } : null; });
  ok(rt === 'ok' && s3 && !s3.fail && s3.items.includes('SCH1'), '↻ Tap to retry → the list', s3);
  /* a list that arrives late while My Schedule is open */
  await nk.ev(() => { const d = (window._crm.schedule.find(x => x && x.id === 'SCH1') || {}).date; window._gcPmField.saveSched([{ id: 'SCHlate', pid: 'P3', title: 'Late arrival', date: d, time: '11:00 AM', assignee: 'Nick Gray', type: 'work', scope: 'company', updatedAt: new Date().toISOString() }], []); });
  const late = await H.waitFor(nk, () => [...document.querySelectorAll('.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="item"]')].some(b => b.getAttribute('data-id') === 'SCHlate'), null, 8000);
  ok(!!late, 'a schedule that arrives while My Schedule is open shows by itself (no blank / stale screen)');

  /* ════ 3. an invisible layer; a click lost to a redraw ════ */
  console.log('B3. taps always land');
  await closeAll(nk); await nk.ev(() => window._gcPmField.open({ reset: true })); await sleep(300);
  await nk.ev(() => { const g = document.createElement('div'); g.id = 'sf-test-ghost'; g.style.cssText = 'position:fixed;inset:0;z-index:2147483000;opacity:0;background:#000'; document.body.appendChild(g); });
  const gh = await tapAt(nk, '.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="appt"]');
  const gs = await shown(nk), gm = await nk.ev(() => (document.getElementById('sf-test-ghost') || {}).getAttribute && document.getElementById('sf-test-ghost').getAttribute('data-sf-ghost'));
  ok(gs.sheets.some(x => /^form\|📅 New appointment/.test(x)) && gm === '1', 'an invisible full-screen layer left on top (opacity 0): the tap goes through — New appointment opens; the layer stops taking taps', { gh, gs, gm });
  await nk.ev(() => document.getElementById('sf-test-ghost').remove());
  await closeAll(nk); await nk.ev(() => window._gcPmField.open({ reset: true })); await sleep(300);
  await nk.ev(() => { window.__sfRedraw = 1; document.addEventListener('pointerdown', function f(e){ if (!window.__sfRedraw) return; window.__sfRedraw = 0; if (e.target.closest && e.target.closest('.gc-pmf-sheet')) window._gcPmField.open({}); }, true); });
  await tapAt(nk, '.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="work"]'); await sleep(400);
  ok((await shown(nk)).sheets.some(x => /^form\|🛠 Schedule work/.test(x)), 'the screen redrawn under the finger (the browser drops that click): 🛠 Schedule work still opens', await shown(nk));

  /* ════ 4. "⏳ Saved on phone, sending…" → sent when the network is back ════ */
  console.log('B4. the sending pill');
  await closeAll(nk);
  const p = nk.page();
  await p.route(/rest\/v1\/gc_kv/, r => r.request().method() === 'GET' ? r.fallback() : r.abort('failed'));
  await nk.ev(() => window._gcPmField.saveSched([{ id: 'SCHnet', pid: 'P3', title: 'Saved while the network dropped', date: new Date().toLocaleDateString('en-CA'), time: '3:00 PM', assignee: 'Nick Gray', type: 'work', scope: 'company', by: 'Nick Gray', updatedAt: new Date().toISOString() }], []));
  const waitPill = await H.waitFor(nk, () => { const e = document.getElementById('gc-fh-sync'); return e && e.getAttribute('data-k') === 'wait' ? e.textContent : ''; }, null, 40000);
  ok(/Saved on phone, sending/.test(waitPill || ''), 'the upload fails: "⏳ Saved on phone, sending…"', waitPill);
  const tabs = await tapAt(nk, '#gc-fh-tabs [data-t="ra-sched"]');
  ok(tabs === 'ok' && (await shown(nk)).sheets.some(x => /^sched\|/.test(x)), 'while it is "sending…" the screen still works (📅 My Schedule opens)');
  await closeAll(nk);
  await p.unroute(/rest\/v1\/gc_kv/);
  await nk.ev(() => window.dispatchEvent(new Event('online')));
  const sent = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { if ((H.cget('schedule') || []).some(x => x && x.id === 'SCHnet')) return true; await sleep(500); } return false; })();
  const pill2 = await H.waitFor(nk, () => { const e = document.getElementById('gc-fh-sync'); return e && e.getAttribute('data-k') === 'ok' ? e.textContent : ''; }, null, 20000);
  ok(sent && /All sent/.test(pill2 || ''), 'back online → sent by itself → "✓ All sent"', { sent, pill2, log: await nk.ev(() => window._gcSF.log()) });

  /* ════ 5. a blank Home → a retry card ════ */
  console.log('B5. the Home is never blank');
  await closeAll(nk);
  await nk.ev(() => { window.__sfR = window._gcField.render; window._gcField.render = () => {}; window.__sfMe = window._gcMeNow; window.__sfAdm = window.__GC_AUTH__.isAdmin; window.__GC_AUTH__.isAdmin = () => false; Object.defineProperty(window, '_gcMeNow', { configurable: true, get: () => null, set(){} });   /* the person not known (the lists not in) */
    setTimeout(() => { const st = document.createElement('style'); st.id = 'sf-test-blank'; st.textContent = '#_gcJobPick .fh-wrap > :not(#gc-to-strip):not(#gc-sf-homefail){display:none!important}'; document.head.appendChild(st); }, 7000); });   /* nothing shows on the Home but the strip (the screen in the report) */
  const card = await H.waitFor(nk, () => { const f = document.getElementById('gc-sf-homefail'); return f && f.getClientRects().length ? f.innerText : ''; }, null, 20000);
  ok(/Couldn.t load your home/.test(card || '') && /Tap to retry/.test(card || ''), 'a blank Field Home shows "⚠️ Couldn\'t load your home — ↻ Tap to retry" (not an empty page)', card || await nk.ev(() => { const w = document.querySelector('#_gcJobPick .fh-wrap'); return { kids: w ? [...w.children].map(c => (c.id || c.className) + ':' + Math.round(c.getBoundingClientRect().height)) : null, homes: document.querySelectorAll('#_gcJobPick').length, cls: (document.getElementById('_gcJobPick') || {}).className, hidden: document.hidden, log: window._gcSF.log() }; }));
  await nk.ev(() => { const sb = document.getElementById('sf-test-blank'); if (sb) sb.remove(); delete window._gcMeNow; window._gcMeNow = window.__sfMe; window.__GC_AUTH__.isAdmin = window.__sfAdm; window._gcField.render = window.__sfR; });
  await tapAt(nk, '#gc-sf-homefail [data-sf="homeretry"]');
  const back = await H.waitFor(nk, () => !!document.querySelector('#_gcJobPick .gc-pmf') && !document.getElementById('gc-sf-homefail'), null, 12000);
  ok(!!back, '↻ Tap to retry → the Home comes back');
  ok(!nk.errs.length, 'Nick: no page errors', nk.errs);

  /* ════ 6 + 7. bid dates (PM) ════ */
  console.log('B6. bid dates on My Schedule (PM)');
  const pm = await phone(PM, 'PM', false);
  await pm.ev(() => window._gcPmField.open({ reset: true, view: 'week' }));
  await sleep(500);
  const bd = await pm.ev(() => [...document.querySelectorAll('.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="bidev"]')].map(b => ({ id: b.getAttribute('data-id'), lead: b.getAttribute('data-lead'), t: b.innerText.replace(/\s+/g, ' ') })));
  const pre = bd.find(x => x.id === 'bid:LB1:prebid'), due = bd.find(x => x.id === 'bid:LB1:biddue');
  ok(pre && /10:00 AM/.test(pre.t) && /Pre-bid \/ site walk/.test(pre.t) && /Front office/.test(pre.t) && due && /Bid due/.test(due.t) && !bd.some(x => x.lead === 'LB2'), 'My Schedule (week): my bid\'s 🚶 pre-bid (10:00 AM, Front office) and ⏰ bid due — not another PM\'s bid', bd);
  await pm.ev(() => { window.__sfLead = ''; const f = window._gcOpenLead; window._gcOpenLead = function(id){ window.__sfLead = id; return f && f.apply(this, arguments); }; });
  const bt = await tapAt(pm, '.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="bidev"][data-id="bid:LB1:prebid"]');
  ok(bt === 'ok' && (await pm.ev(() => window.__sfLead)) === 'LB1', 'a tap on the bid date opens its lead', bt);
  const strip = await pm.ev(() => { try { return window._gcTimeOff && window._gcTimeOff.open ? (window._gcTimeOff.open(), [...document.querySelectorAll('.gc-to-ov .gc-to-day .j')].map(e => e.textContent).join(' | ')) : ''; } catch (e) { return String(e); } });
  ok(/Pre-bid \/ site walk — Sample Library Reroof/.test(strip) && /Bid due — Sample Library Reroof/.test(strip), 'the Field "📅 My schedule" sheet (patch TIMEOFF) lists the bid dates too', strip.slice(0, 400));
  await closeAll(pm);
  console.log('B7. the bid portal\'s site walk → the schedule');
  await pm.ev(() => window._gcBidDates.fromBidJob('BJ9', { title: 'Sample Clinic Remodel', address: '9 Clinic Rd', crmLeadId: 'LB1', siteWalk: { date: new Date(Date.now() + 2 * 864e5).toLocaleDateString('en-CA'), time: '13:30', location: 'North gate', mandatory: true } }, 'P1'));
  const cl = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 60000) { const x = (H.cget('schedule') || []).find(y => y && y.id === 'SCHbw-BJ9'); if (x) return x; await sleep(500); } return null; })();
  ok(cl && cl.assignee === 'Demo PM' && cl.createdBy === 'Demo PM' && cl.time === '1:30 PM' && cl.address === 'North gate' && cl.bidJobId === 'BJ9' && cl.source === 'Bid portal', 'the site walk is a real schedule entry in the cloud (on the CRM Schedule and the calendar feed), assigned to the person who saved it', cl);
  await pm.ev(() => window._gcPmField.open({ reset: true, view: 'week' })); await sleep(400);
  const wk = await pm.ev(() => [...document.querySelectorAll('.gc-pmf-sheet[data-pmf-sheet="sched"] [data-pmf-a="item"]')].map(b => b.getAttribute('data-id')));
  ok(wk.includes('SCHbw-BJ9'), 'and on My Schedule', wk);
  ok(!pm.errs.length, 'PM: no page errors', pm.errs);
} catch (e) { fail++; console.log('  ✗ FAIL exception ' + (e && e.stack || e)); }
for (const c of OPEN) { try { await c.close(); } catch (e) {} }
console.log(`SCHEDFREEZE ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
