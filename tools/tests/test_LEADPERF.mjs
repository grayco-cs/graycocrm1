// test_LEADPERF.mjs <build-dir> — patch LEADPERF (owner 11/13: "It's lagging really bad on Leads").
// The Leads page on an INVENTED dataset the size of the live CRM (≈217 leads incl. Lead Inbox LEADIN-* bid leads, 550 jobs ≈ 0.7 MB,
// 130 subs, 190 vendors, 300 invoices …; tools/tests/leadperf_world.mjs), signed in as an admin on a 1440×900 desk, in Chromium through
// the offline harness (GC_HARNESS, default scratchpad wN/harness_N.mjs). Measured by tools/tests/leadperf_measure.mjs.
// Budgets: Leads opens (sidebar click → rows painted) < 1.5 s with no task over 200 ms; filter chips answer (Event Timing, input →
// next paint) < 150 ms; row → lead drawer < 1 s; typing in the search box < 150 ms; scrolling has no frame over 50 ms; sitting on
// Leads: no long task over 200 ms, and after a minute untouched the main thread is close to idle. Made-up data only; nothing is sent.
// The first run makes the settled world once (≈2½ min, cached in LEADPERF_CACHE / the scratchpad). Env: LEADPERF_IDLELONG=0 skips the
// one-minute-untouched check (saves ~80 s).
import path from 'path';
const { measure } = await import('./leadperf_measure.mjs');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
const build = path.resolve(process.argv[2] || '.');
const idleLong = process.env.LEADPERF_IDLELONG === '0' ? 0 : 15;
let M = await measure(build, { idle: 10, idleLong });
/* a busy CI box can make one interaction slow by chance: one fresh measurement before calling it a failure */
const chipsOk = m => { const v = m.chips.filter(c => !c.missing).map(c => c.inpMs).sort((a, b) => a - b); return v.length >= 5 && v[v.length - 1] < 150 && m.chips.every(c => c.missing || c.blockedMs < 250); };
const firstOk = m => m.open.rowsPaintedMs > 0 && m.open.rowsPaintedMs < 1500 && m.open.longestMs < 200 && chipsOk(m) && m.idle.longestMs < 200;
if (!firstOk(M)) { console.log('(re-measuring once)', JSON.stringify({ open: M.open, chips: M.chips, idle: M.idle })); M = await measure(build, { idle: 10, idleLong }); }
console.log(JSON.stringify(M));
ok('signed in as the admin; the live-size data is loaded (≥ 200 leads, 550 jobs)', M.signedIn && M.leads >= 200 && M.projects >= 500, { leads: M.leads, projects: M.projects });
ok('Leads opens from the menu: rows painted < 1.5 s', M.open.rowsPaintedMs > 0 && M.open.rowsPaintedMs < 1500 && M.open.rows > 0, M.open);
ok('…and no task over 200 ms while it opens', M.open.longestMs < 200, M.open);
ok('filter chips (Bids, Residential, Prime, Sub, Unassigned, Due this week, All): every click < 150 ms to the next paint', chipsOk(M), M.chips);
ok('…a chip filters the list (Bids → fewer rows than All)', (() => { const b = M.chips.find(c => c.label === 'Bids'), a = M.chips.find(c => c.label === 'All'); return b && a && b.rows > 0 && b.rows <= a.rows; })(), M.chips.map(c => [c.label, c.rows]));
ok('a row → the lead drawer in < 1 s, the click < 200 ms', M.drawer && M.drawer.shownMs > 0 && M.drawer.shownMs < 1000 && M.drawer.inpMs < 200, M.drawer);
ok('typing in the search box: every key < 150 ms, and it filters', M.search && M.search.inpMs < 150 && M.search.rows > 0, M.search);
ok('scrolling the list: no frame over 50 ms', M.scroll && M.scroll.gapsOver50 === 0, M.scroll);
ok('sitting on Leads (just used): no long task over 200 ms', M.idle.longestMs < 200, M.idle);
if (idleLong) ok('…a minute untouched: the main thread is close to idle (< 10 % busy, no task over 100 ms)', M.idleLong.cpuBusyPct < 10 && M.idleLong.longestMs < 100, M.idleLong);
ok('no page errors', !M.errors.length, M.errors);
console.log('LEADPERF ' + R.filter(Boolean).length + '/' + R.length);
process.exit(R.every(Boolean) ? 0 : 1);
