// test_SATSKIP.mjs <build-dir> — SATSKIP (owner 11/23, the Schedule add form's END DATE (MULTI-DAY): "16 work days (Mon-Sat) will be
// created" — "want to be able to delete Saturdays if I want to on here"). Offline harness, a made-up job; desk and phone.
//   1. the count under END DATE says Mon-Sat, with a ☐ Skip Saturdays box right there;
//   2. ticked: "15 work days (Mon-Fri) will be created", # Work Days (Mon-Fri) counts 15, the 5-days button ends on Friday;
//   3. Save creates exactly those days (no Saturday, no Sunday), one entry per day (Day 1/15 … 15/15);
//   4. the choice is remembered for this person (the next add form starts ticked); unticking → Mon-Sat again (17);
//   5. one created day can still be deleted by itself (🗑), the others stay; no page errors.
import path from 'path';
const BUILD = path.resolve(process.argv[2] || '.');
const H = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { sleep } = H;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const ymd = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
const mon = new Date(); mon.setHours(12, 0, 0, 0); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7));   /* next Monday */
const plus = n => { const x = new Date(mon); x.setDate(x.getDate() + n); return ymd(x); };
const START = ymd(mon), END = plus(18);   /* Mon … the Friday of week 3: Mon-Sat 17 days, Mon-Fri 15 */
const errsOf = A => A.errs.filter(e => !/ResizeObserver|Script error/.test(e));
const FORM = () => {
  window.__set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  window.__dates = () => [...document.querySelectorAll('input[type=date]')].filter(e => e.offsetParent);
  window.__txt = () => { const t = [...document.querySelectorAll('div')].find(d => /^\d+ work days \(Mon-(Sat|Fri)\) will be created$/.test(d.textContent.trim())); return t ? t.textContent.trim() : ''; };
  window.__box = () => document.querySelector('input[data-gc-satskip]');
  window.__wd = () => { const n = document.querySelector('input[type=number][placeholder="#"]'); const lab = [...document.querySelectorAll('div,label,span')].find(e => /^# Work Days \(Mon-(Sat|Fri)\)$/.test(e.textContent.trim())); return { n: n ? n.value : null, label: lab ? lab.textContent.trim() : '' }; };
};
async function suite(dev){
  const PH = dev === 'phone', tag = dev + ': ';
  H.resetCloud();
  H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
  H.cset('projects', [{ id: 'P1', name: 'ROTC Cordova', client: 'Sample GC', address: '1 Sample Ln', pm: 'Wesley Johnson', status: 'Active', autoPO: 'T724' }]);
  H.cset('schedule', []);
  const A = await H.computer('wjohnson@grayco-cs.com', { build: BUILD, mobile: PH });
  await H.signIn(A, 'wjohnson@grayco-cs.com', 20000); await sleep(6000);
  await A.ev(() => { try { Object.keys(localStorage).filter(k => /^gc_sched_skipsat:/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {} window._setView('schedule'); }); await sleep(2500);
  const openForm = async () => { await A.ev(() => [...document.querySelectorAll('main button')].find(b => b.textContent.trim() === '+ Add').click()); await sleep(1200); await A.ev(FORM); };
  await openForm();
  await A.ev(([s, e]) => { const d = window.__dates(); window.__set(d[0], s); }, [START, END]); await sleep(300);
  await A.ev(([s, e]) => { const d = window.__dates(); window.__set(d[1], e); }, [START, END]); await sleep(400);
  let st = await A.ev(() => ({ t: window.__txt(), box: !!window.__box(), on: window.__box() ? window.__box().checked : null, wd: window.__wd(), lab: window.__box() ? window.__box().parentNode.textContent : '' }));
  ok(tag + '1. END DATE set: "17 work days (Mon-Sat) will be created" and a ☐ Skip Saturdays box right there (off)', st.t === '17 work days (Mon-Sat) will be created' && st.box && st.on === false && /Skip Saturdays/.test(st.lab) && st.wd.n === '17', st);
  await A.ev(() => window.__box().click()); await sleep(400);
  st = await A.ev(() => ({ t: window.__txt(), on: window.__box().checked, wd: window.__wd(), every: document.body.innerText.includes('Creates an entry for every Mon-Fri between start and end') }));
  ok(tag + '2a. ticked: "15 work days (Mon-Fri) will be created", # Work Days (Mon-Fri) = 15, "Creates an entry for every Mon-Fri"', st.t === '15 work days (Mon-Fri) will be created' && st.on === true && st.wd.n === '15' && st.wd.label === '# Work Days (Mon-Fri)' && st.every, st);
  await A.ev(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '5 days' && b.offsetParent).click()); await sleep(400);
  st = await A.ev(() => ({ t: window.__txt(), end: window.__dates()[1].value }));
  ok(tag + '2b. the "5 days" button counts Mon-Fri: ends on that Friday', st.t === '5 work days (Mon-Fri) will be created' && st.end === plus(4), st);
  await A.ev(e => window.__set(window.__dates()[1], e), END); await sleep(300);
  const filled = await A.ev(() => { const byL = l => { const e = [...document.querySelectorAll('label,div,span,b')].find(x => x.children.length === 0 && x.textContent.trim() === l && x.offsetParent); return e ? e.parentNode.querySelector('input,select,textarea') : null; };
    const t = byL('Title'); if (t) window.__set(t, 'Sample Framing');
    const sel = [...document.querySelectorAll('select')].filter(e => e.offsetParent).find(x => [...x.options].some(o => o.value === 'P1')); if (sel) window.__set(sel, 'P1');
    return { t: !!t, p: !!sel }; });
  await sleep(300);
  const sv = await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /^🚀 Create All Days$/.test(x.textContent.trim()) && x.offsetParent); if (b) { b.click(); return true; } return [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.textContent.trim().slice(0, 20)).slice(-25); });
  if (sv !== true) console.log('  (no Save button)', JSON.stringify(sv));
  const ROWS = () => { const all = [...document.querySelectorAll('main button')].find(b => b.textContent.trim() === 'All' && b.offsetParent); if (all && !all.__c) { all.__c = 1; all.click(); }
    return [...document.querySelectorAll('tbody tr')].filter(r => /Sample Framing/.test(r.textContent)).map(r => { const sp = [...r.querySelectorAll('span')].find(x => /^Day \d+\/\d+$/.test(x.textContent.trim())); const m = sp ? /Day (\d+)\/(\d+)/.exec(sp.textContent) : null; const b = r.querySelector('td b'); return { d: b ? b.textContent : '', n: m ? +m[1] : 0, t: m ? +m[2] : 0 }; }); };
  const made = await H.waitFor(A, (src) => { const l = (new Function('return ' + src))()(); return l.length >= 15 ? l : null; }, ROWS.toString(), 10000);
  const ymdOf = t => { const x = new Date(t + ' 12:00'); return isNaN(x) ? '' : x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  (made || []).forEach(x => { x.d = ymdOf(x.d); });
  (made || []).sort((a, b) => a.n - b.n);
  const days = (made || []).map(x => new Date(x.d + 'T12:00:00').getDay());
  ok(tag + '3. Save creates the 15 Mon–Fri days (no Saturday, no Sunday), one entry each (Day 1/15 … 15/15)', made && made.length === 15 && !days.includes(6) && !days.includes(0) && made.every(x => x.t === 15) && new Set(made.map(x => x.n)).size === 15 && made[0].d === START && made[14].d === END, made && made.map(x => x.d));
  const pref = await A.ev(() => Object.keys(localStorage).filter(k => /^gc_sched_skipsat:/.test(k)).map(k => k + '=' + localStorage.getItem(k)));
  await openForm();
  await A.ev(([s, e]) => window.__set(window.__dates()[0], s), [START, END]); await sleep(300);
  await A.ev(([s, e]) => window.__set(window.__dates()[1], e), [START, END]); await sleep(400);
  st = await A.ev(() => ({ t: window.__txt(), on: window.__box() && window.__box().checked }));
  ok(tag + '4a. remembered for this person: the next add form starts with Skip Saturdays ticked (Mon-Fri)', pref.length === 1 && /=1$/.test(pref[0]) && /wjohnson@grayco-cs\.com/.test(pref[0]) && st.on === true && st.t === '15 work days (Mon-Fri) will be created', { pref, st });
  await A.ev(() => window.__box().click()); await sleep(400);
  st = await A.ev(() => ({ t: window.__txt(), on: window.__box().checked, p: Object.keys(localStorage).filter(k => /^gc_sched_skipsat:/.test(k)).map(k => localStorage.getItem(k)) }));
  ok(tag + '4b. unticked: Mon-Sat again (17) and remembered off', st.t === '17 work days (Mon-Sat) will be created' && st.on === false && st.p[0] === '0', st);
  await A.ev(() => { const c = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel' && b.offsetParent); if (c) c.click(); }); await sleep(600);
  /* one created day removed by itself */
  const n0 = (await A.ev((src) => (new Function('return ' + src))()(), ROWS.toString())).length;
  A.acceptConfirm = true;
  const del = await A.ev(() => { const tr = [...document.querySelectorAll('tbody tr')].find(r => /Sample Framing/.test(r.textContent) && [...r.querySelectorAll('span')].some(x => x.textContent.trim() === 'Day 2/15') && r.querySelector('button[title="Delete"]')); if (!tr) return null; tr.querySelector('button[title="Delete"]').click(); return tr.textContent.slice(0, 60); });
  const left = await H.waitFor(A, ([src, n]) => { const l = (new Function('return ' + src))()(); return l.length === n - 1 ? l : null; }, [ROWS.toString(), n0], 8000);
  ok(tag + '5a. one created day can still be deleted by itself (🗑): 14 left, the others untouched', !!del && n0 === 15 && Array.isArray(left) && left.length === 14 && !left.some(x => x.n === 2) && left.every(x => x.t === 15), { del, n0, left: left && left.length });
  ok(tag + '5b. no page errors', !errsOf(A).length, errsOf(A));
  await A.close();
}
await suite('desk');
await suite('phone');
const n = R.filter(Boolean).length; console.log('SATSKIP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
