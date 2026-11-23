// test_HOAOUT_ui.mjs <build-dir> — patch HOAOUT in the browser (offline harness, made-up list data): a cloud outreach list that is NOT empty
// + the seed → the HOA entries are added, the person-edited entry is untouched (also in the cloud), the 🏘 HOAs tab and the "Any list" filter, desk and phone.
import fs from 'fs';
import { computer, signIn, sleep, cset, cget, resetCloud, waitFor, onFn, ACCOUNTS } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const ADMIN = Object.keys(ACCOUNTS).find(e => ACCOUNTS[e].role === 'admin');
const seed = JSON.parse(fs.readFileSync(build + '/netlify/functions/_lib/outreach-seed.json', 'utf8'));
const NEW = seed.leads.filter(l => l.sheet === 'HOAs & Community Managers' || (l.raw && l.raw.Segment === 'HOAs'));
const OUT = [{ id: 'GC-demo-1', phase: 1, sheet: 'Demo sheet', title: 'Demo Company 1', pri: 1, what: 'Demo', how: 'Demo', links: [], emails: [], phones: [], person: '', raw: {} }].concat(NEW);
const EDITED = { id: 'GC-demo-1', phase: 1, company: 'Demo Company 1 (edited)', type: 'Demo sheet', pri: 2, person: '', contactTitle: '', email: '', phone: '', emails: [], phones: [], links: [], portal: '', website: '', city: '', inZone: true, zone: '', why: '', how: '', status: 'Submitted', notes: 'applied', next: '', log: [], src: { sheet: 'Demo sheet', raw: {} }, updatedAt: '2026-11-01T00:00:00.000Z' };
onFn('bid-inbox', ({ query }) => query.outreachseed ? { ok: true, built: 'x', items: OUT } : { ok: true, items: [] });
onFn('texts', () => ({ ok: true, items: [] }));
const OPEN = [];
try {
  for (const mobile of [false, true]) {
    resetCloud();
    cset('users', [{ id: ACCOUNTS[ADMIN].id, name: 'Demo Admin', email: ADMIN, role: 'Admin', active: true }]);
    cset('gc_outreach_list', { items: [EDITED], updatedAt: '2026-11-01T00:00:00.000Z' });
    const A = await computer('A', { build, mobile }); OPEN.push(A);
    ok((mobile ? 'phone' : 'desk') + ': signs in', await signIn(A, ADMIN, 20000));
    await sleep(3000);
    await A.ev(() => window._setView && window._setView('leads')); await sleep(2500);
    await A.ev(() => { const b = [...document.querySelectorAll('#gc-leads-hub button')].find(b => /Outreach/.test(b.textContent)); if (b) b.click(); });
    await waitFor(A, n => window._gcOutreach && window._gcOutreach.items().length >= n, 1 + NEW.length, 20000);
    const st = await A.ev(() => { const it = window._gcOutreach.items(); return { n: it.length, ed: it.find(x => x.id === 'GC-demo-1'), tab: [...document.querySelectorAll('#gc-ol .ol-tab')].map(b => b.textContent) }; });
    ok('non-empty list + seed → the HOA entries are added (' + NEW.length + ')', st.n === 1 + NEW.length, st.n);
    ok('the edited entry is untouched', JSON.stringify(st.ed) === JSON.stringify(EDITED), st.ed);
    ok('a 🏘 HOAs tab with the count', st.tab.some(t => t === '🏘 HOAs (' + NEW.length + ')'), st.tab);
    await A.page().click('#gc-ol [data-ol-g="hoa"]'); await sleep(500);
    const rows = await A.ev(() => [...document.querySelectorAll('#gc-ol .ol-it summary')].slice(0, 3).map(s => s.textContent));
    ok('HOAs tab lists the management companies first', rows.length === 3 && /Keith|Wright|Weichert|CAI|VIVE|EZR|Crye|Faith|Community Management|FirstService/.test(rows[0]), rows);
    await A.page().selectOption('#gc-ol [data-ol-fsh]', 'HOAs & Community Managers'); await sleep(500);
    const f = await A.ev(() => ({ n: document.querySelectorAll('#gc-ol .ol-it').length, sw: document.documentElement.scrollWidth, vw: innerWidth }));
    ok('the "Any list" filter picks the sheet', f.n > 10, f);
    ok('fits the screen (no sideways scroll)', f.sw <= f.vw + 1, f);
    for (let i = 0; i < 20 && !((cget('gc_outreach_list') || {}).items || []).length > 1; i++) { await sleep(1000); if (((cget('gc_outreach_list') || {}).items || []).length > 1) break; }
    const cl = cget('gc_outreach_list');
    ok('saved to the cloud', cl && cl.items.length === 1 + NEW.length && JSON.stringify(cl.items.find(x => x.id === 'GC-demo-1')) === JSON.stringify(EDITED), cl && cl.items.length);
    ok('no page errors', !A.errs.length, A.errs);
    await A.close(); OPEN.length = 0;
  }
} catch (e) { ok('crash ' + (e && e.stack), false); }
for (const x of OPEN) { try { await x.close(); } catch (e) {} }
const nF = R.filter(x => !x).length; console.log(nF ? 'FAILED ' + nF : 'HOAOUT_ui ' + R.length + '/' + R.length); process.exit(nF ? 1 : 0);
