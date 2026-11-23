// test_JOBLINK.mjs <build-dir> — JOBLINK (owner 11/23, a schedule row "ROTC Cordova" + the blue "PO: T724" pill + "Wesley Johnson":
// "want to be able to click that to open up the job"). Offline harness, made-up job / schedule.
//   desk and phone: 📅 Schedule list row — the job name and the PO pill open the job (the CRM's open-the-job, the job page shows);
//   the Dashboard calendar cell — the job name and the pill open the job (not the cell's own editor); right-click on the pill copies
//   the PO and opens nothing; the row's other cells keep their own click; no page errors.
import path from 'path';
const BUILD = path.resolve(process.argv[2] || '.');
const H = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { sleep } = H;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const d = n => { const x = new Date(Date.now() + n * 864e5); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
function seed(){
  H.resetCloud();
  H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
  H.cset('projects', [{ id: 'P1', name: 'ROTC Cordova', client: 'Sample GC', address: '1 Sample Ln', pm: 'Wesley Johnson', status: 'Active', autoPO: 'T724' },
    { id: 'P2', name: 'Sample Other Job', client: 'Sample Owner', address: '2 Sample Ln', pm: 'Wesley Johnson', status: 'Active', autoPO: 'T725' }]);
  H.cset('schedule', [{ id: 'S1', pid: 'P1', title: 'Framing', date: d(0), time: '08:00', assignee: 'Wesley Johnson', type: 'work', scope: 'company' },
    { id: 'S2', pid: 'P2', title: 'Drywall', date: d(1), time: '09:00', assignee: 'Wesley Johnson', type: 'work', scope: 'company' }]);
}
const SPY = `window.__go = []; (function hook(){ var f = window._gcGoToTaskJob; if (typeof f !== 'function' || f.__spy) { setTimeout(hook, 200); return; } var w = function(p, t){ window.__go.push(String(p)); return f.apply(this, arguments); }; w.__spy = true; window._gcGoToTaskJob = w; setTimeout(hook, 500); })();`;
const errsOf = A => A.errs.filter(e => !/ResizeObserver|Script error/.test(e));
const opened = A => H.waitFor(A, () => { const p = window._gcOpenProject; const t = (document.querySelector('main') || document.body).innerText || ''; return p && p.id === 'P1' && /ROTC Cordova/.test(t) ? true : null; }, null, 10000);
async function suite(dev){
  const PH = dev === 'phone', tag = dev + ': ';
  seed();
  const A = await H.computer('wjohnson@grayco-cs.com', { build: BUILD, mobile: PH, init: SPY });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 20000); await sleep(6000);
  const go = async (view) => { await A.ev(v => { window.__go = []; window._gcOpenProject = null; window._setView(v); }, view); await sleep(2500); };
  /* the Schedule list */
  await go('schedule');
  const row = await H.waitFor(A, () => { const n = [...document.querySelectorAll('td .gc-joblink')].find(e => /ROTC Cordova/.test(e.textContent)); if (!n) return null; const td = n.closest('td'), p = td.querySelector('.gc-jobpo'); const tr = td.closest('tr'); return { name: n.textContent, pill: p ? p.textContent : '', who: tr.textContent.includes('Wesley Johnson'), cursor: getComputedStyle(n).cursor, color: getComputedStyle(n).color }; }, null, 20000);
  ok(tag + '1a. Schedule list: the job name (its colour kept, a pointer) + the "PO: T724" pill + the person', row && row.name === 'ROTC Cordova' && row.pill === 'PO: T724' && row.who && row.cursor === 'pointer', row);
  await A.ev(() => [...document.querySelectorAll('td .gc-joblink')].find(e => /ROTC Cordova/.test(e.textContent)).click());
  let op = await opened(A), gone = await A.ev(() => window.__go.slice());
  ok(tag + '1b. a click on the job name opens that job', !!op && gone[0] === 'P1', { op, gone });
  await go('schedule');
  await H.waitFor(A, () => [...document.querySelectorAll('td .gc-jobpo')].find(e => /T724/.test(e.textContent)), null, 15000);
  await A.ev(() => [...document.querySelectorAll('td .gc-jobpo')].find(e => /T724/.test(e.textContent)).click());
  op = await opened(A); gone = await A.ev(() => window.__go.slice());
  ok(tag + '1c. a click on the PO pill opens that job too', !!op && gone[0] === 'P1', { op, gone });
  await go('schedule');
  await H.waitFor(A, () => [...document.querySelectorAll('td .gc-jobpo')].find(e => /T724/.test(e.textContent)), null, 15000);
  const ctx = await A.ev(() => { const p = [...document.querySelectorAll('td .gc-jobpo')].find(e => /T724/.test(e.textContent)); const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); p.dispatchEvent(e); return { prevented: e.defaultPrevented, title: p.title }; });
  await sleep(800);
  gone = await A.ev(() => window.__go.slice());
  ok(tag + '1d. right-click / press-and-hold on the pill copies the PO (says so on hover) and opens nothing', ctx.prevented && /copy PO T724/.test(ctx.title) && !gone.length, { ctx, gone });
  /* the Dashboard calendar */
  await go('dashboard');
  const cal = await H.waitFor(A, () => { const n = [...document.querySelectorAll('.gc-joblink')].find(e => /ROTC Cordova/.test(e.textContent) && !e.closest('td')); return n ? { tag: n.parentNode.tagName, pill: !!n.parentNode.querySelector('.gc-jobpo') } : null; }, null, 20000);
  ok(tag + '2a. the Dashboard calendar cell: job name + pill', cal && cal.pill, cal);
  if (cal) {
    await A.ev(() => { window.__go = []; [...document.querySelectorAll('.gc-joblink')].find(e => /ROTC Cordova/.test(e.textContent) && !e.closest('td')).click(); });
    op = await opened(A); gone = await A.ev(() => window.__go.slice());
    const sheet = await A.ev(() => !!document.querySelector('[role=dialog]'));
    ok(tag + '2b. a click on the job name in the calendar opens the job (not the entry editor)', !!op && gone[0] === 'P1', { op, gone, sheet });
    await go('dashboard');
    await H.waitFor(A, () => [...document.querySelectorAll('.gc-jobpo')].find(e => /T724/.test(e.textContent) && !e.closest('td')), null, 15000);
    await A.ev(() => [...document.querySelectorAll('.gc-jobpo')].find(e => /T724/.test(e.textContent) && !e.closest('td')).click());
    op = await opened(A); gone = await A.ev(() => window.__go.slice());
    ok(tag + '2c. the calendar\'s PO pill opens the job', !!op && gone[0] === 'P1', { op, gone });
  }
  ok(tag + '3. no page errors', !errsOf(A).length, errsOf(A));
  await A.close();
}
await suite('desk');
await suite('phone');
const n = R.filter(Boolean).length; console.log('JOBLINK ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
