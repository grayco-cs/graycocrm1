// test_LOBBY.mjs <build-dir> — patch OFFICETV: the 📺 Lobby TV (lobby.html + netlify/functions/lobby.js + lobby-types.js).
//   • the function: no / wrong / turned-off / replaced code → 404 with nothing; the right code → the playlist;
//     unapproved photos never served (shared:false, a Damage photo, a sub's photo nobody approved, a photo not in GrayCo
//     Photos); a customer's name / address, an insurance company, subs, HVAC, a stranger's phone → the line left out;
//     5★ reviews as first name + last initial; offers: pending (marketing, not approved) / ended → not served.
//   • the page: works with NO CRM sign-in (never loads the CRM), every slide type draws with no page errors, it rotates,
//     a revoked code blanks it, no customer name or address from the real-data mirror anywhere in its DOM.
//   • SHOTS: every slide type at 1920×1080 → lobby_<type>.png (preview mode, fed by the function's preview answer on the
//     mirror's real data — the mirror has no customer-visible photos, so photo slides show "your photos here" frames).
// Env: MIRROR (the read-only production mirror; default the scratchpad's loop/mirror.json), SHOTS (default the scratchpad's
//      officetv_shots/), GC_HARNESS (harness_N.mjs).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { lobbyFn } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'lobby_fn_mock.mjs')).href);
const build = process.argv[2] && path.resolve(process.argv[2]);
if (!build) { console.error('usage: node test_LOBBY.mjs <build-dir>'); process.exit(2); }
const MIRROR = process.env.MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/officetv_shots/';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const require = createRequire(import.meta.url);
const TY = require(path.join(build, 'lobby-types.js'));
ok(fs.readFileSync(path.join(build, 'lobby-types.js'), 'utf8') === fs.readFileSync(path.join(build, 'netlify/functions/_lib/lobby-types.js'), 'utf8'), 'the function bundles the same slide library as the page');
ok(TY.types.length >= 30, 'slide library: ' + TY.types.length + ' types');
ok(!TY.types.some(t => /hvac|pressure wash/i.test(JSON.stringify(t))), 'no HVAC / pressure washing anywhere in the library');

/* the mirror (real data, read only) */
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
H.resetCloud(); for (const r of rows) H.cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const V = k => { let v = H.cloud.get(k) && H.cloud.get(k).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const projects = V('projects') || [], customers = V('customers') || [];
/* what must never appear: customers' full names (2+ words) and street addresses (number + street) */
const NAMES = new Set(), STREETS = new Set();
const addN = n => { n = String(n || '').trim().replace(/\s+/g, ' '); if (n.split(' ').length >= 2 && n.length >= 6 && !/grayco|llc|inc\b|church|school|apartments|city of|county/i.test(n)) NAMES.add(n.toLowerCase()); };
const addS = a => { const st = String(a || '').split(',')[0].trim(); if (/^\d+\s+\S+/.test(st) && st.length >= 8) STREETS.add(st.toLowerCase()); };
projects.forEach(p => { if (p) { addN(p.client); addS(p.address); } }); customers.forEach(c => { if (c) { addN(c.name); addS(c.address); } });
console.log('mirror: ' + projects.length + ' jobs, ' + NAMES.size + ' customer names, ' + STREETS.size + ' street addresses to look for');
function leaks(text){ const x = String(text || '').toLowerCase(); const out = []; for (const n of NAMES) if (x.includes(n)) out.push(n); for (const s of STREETS) if (x.includes(s)) out.push(s); return out; }

/* a customer of the mirror (for the cleaning checks) */
const cust = projects.find(p => p && /^[A-Za-z]+ [A-Za-z]+$/.test(String(p.client || '').trim()) && /^\d+ /.test(String(p.address || '')));
const custName = cust ? cust.client.trim() : 'Pat Example', custStreet = cust ? String(cust.address).split(',')[0].trim() : '123 Example Rd';
/* seed: photos (1 approved, 4 not), reviews, offers, the playlist, the link */
const REF = n => 'sb:crm-files/' + n.repeat(64) + '.jpg';
H.cset('gc_photos', [
  { id: 'ph_ok', jobId: cust ? cust.id : 'P1', ref: REF('a'), shared: true, tag: 'After', at: '2026-10-20T10:00:00Z' },
  { id: 'ph_ok2', jobId: cust ? cust.id : 'P1', ref: REF('b'), tag: 'Before', at: '2026-10-19T10:00:00Z' },
  { id: 'ph_hidden', jobId: 'P1', ref: REF('c'), shared: false, at: '2026-10-20T10:00:00Z' },
  { id: 'ph_damage', jobId: 'P1', ref: REF('d'), tag: 'Damage', at: '2026-10-20T10:00:00Z' },
  { id: 'ph_sub', jobId: 'P1', ref: REF('e'), source: 'sub', shared: true, at: '2026-10-20T10:00:00Z' },
  { id: 'ph_del', jobId: 'P1', ref: REF('f'), shared: true, deleted: true, at: '2026-10-20T10:00:00Z' }]);
const mk = V('gc_mkt_v1') || {};
mk.reviews = { r1: { id: 'r1', author: 'Margaret Ellison', rating: 5, text: 'GrayCo replaced our roof after the storm — on time, spotless clean-up and great communication.', date: '2026-10-21' },
  r2: { id: 'r2', author: 'Tom', rating: 5, text: 'Our kitchen looks amazing. Steven kept us updated every day.', date: '2026-10-18' },
  r3: { id: 'r3', author: 'Dana Q', rating: 4, text: 'Good work.', date: '2026-10-17' },
  r4: { id: 'r4', author: 'Leaky Name', rating: 5, text: 'Thanks to ' + custName + ' for recommending you!', date: '2026-10-16' } };
H.cset('gc_mkt_v1', mk);
const TOKEN = 'T'.repeat(20) + 'lobbyTestToken_0123456789abcdef';
H.cset('gc_lobby_access', { on: true, token: TOKEN, at: '2026-10-30T10:00:00Z', by: 'test' });
H.cset('gc_lobby_offers', { offers: {
  of1: { id: 'of1', h: '$100 off GrayCo work', t: 'On projects over $1,000 — one per household.', url: 'https://crm.grayco-cs.com/coupon.html?s=lobby', on: true, src: 'coupon', at: '2026-10-29T00:00:00Z', end: '2026-11-30', fine: 'Not combinable with other coupons or offers. Expires 90 days after it is issued.', label: 'Claim your $100 coupon' },
  of2: { id: 'of2', h: 'Marketing draft offer', on: true, pending: true, at: '2026-10-29T00:00:00Z' },
  of3: { id: 'of3', h: 'Old summer offer', on: true, end: '2020-08-31', at: '2026-10-28T00:00:00Z' },
  of4: { id: 'of4', h: 'Turned off offer', on: false, at: '2026-10-27T00:00:00Z' } } });
const allSlides = TY.types.map(t => ({ id: 's_' + t.k, type: t.k, on: true }));
const S = k => allSlides.find(x => x.type === k);
Object.assign(S('collage'), { photos: ['ph_ok', 'ph_hidden', 'ph_damage', 'ph_sub', 'ph_del', 'ph_nope', 'up:' + REF('9')] });
Object.assign(S('beforeafter'), { pairs: [{ b: 'ph_hidden', a: 'ph_ok', cap: '' }] });
Object.assign(S('announce'), { ok: true, h: 'Welcome ' + custName, sub: 'News', t: 'Meet us at ' + custStreet + ' on Saturday.', photos: [] });
Object.assign(S('askus'), { items: ['Free roof inspections', 'Claims with State Farm', 'Our sub portal', 'HVAC tune-ups', 'Call 901-555-0199', 'Insurance claim help'] });
H.cset('gc_lobby', { v: 1, interval: 12, slides: allSlides, uploads: [] });
const F = lobbyFn(build, H.cloud, tok => { const m = /^utok-(u-[a-z]+)-/.exec(tok); if (!m) return ''; const e = Object.keys(H.ACCOUNTS).find(k => H.ACCOUNTS[k].id === m[1]); return e || ''; });

console.log('— the function');
let r = await F.call('GET', {}); ok(r.status === 404 && !r.json.slides, 'no code → 404, nothing in it', r.status);
r = await F.call('GET', { 'x-lobby-token': 'X'.repeat(43) }); ok(r.status === 404 && !r.json.slides, 'a wrong code → 404', r.status);
r = await F.call('GET', { 'x-lobby-token': TOKEN }); ok(r.status === 200 && r.json.ok && r.json.slides.length > 20, 'the right code → the playlist (' + (r.json && r.json.slides && r.json.slides.length) + ' slides)', r.status);
const live = r.json, txt = JSON.stringify(live);
ok(leaks(txt).length === 0, 'no customer name or street address from the mirror in the answer', leaks(txt).slice(0, 5));
ok(!/state farm|sub portal|hvac|555-0199/i.test(txt), 'insurance carrier / sub portal / HVAC / a stranger\'s phone left out');
ok(/Free roof inspections/.test(txt) && /Insurance claim help/.test(txt), 'the clean lines of the same list kept');
const col = live.slides.find(x => x.type === 'collage');
ok(col && col.photos.length === 1 && col.photos[0].u.includes('a'.repeat(64)), 'collage: only the approved photo is served (hidden / Damage / unapproved sub / deleted / unknown / an upload not made in the editor → never)', col && col.photos);
ok(!['c', 'd', 'e', 'f', '9'].some(ch => txt.includes(ch.repeat(64))), 'no unapproved photo anywhere in the answer');
ok(!live.slides.find(x => x.type === 'beforeafter').pairs.length, 'a before/after pair with an unapproved photo is dropped');
const capOk = !col.photos[0].cap || !leaks(col.photos[0].cap).length; ok(capOk, 'photo caption: the work + the city only ("' + (col.photos[0].cap || '') + '")');
const rv = live.slides.find(x => x.type === 'reviewwall').reviews;
ok(rv.length === 2 && rv.some(x => x.name === 'Margaret E.') && rv.some(x => x.name === 'Tom'), '5★ reviews only, as first name + last initial; a review that names a customer is left out', rv);
const an = live.slides.find(x => x.type === 'announce');
ok(!an.h && !an.t, 'an announcement with a customer\'s name / address is not shown (the default text takes its place)', an);
ok(live.offers.length === 1 && live.offers[0].id === 'of1', 'offers: only the approved, live one (pending marketing / ended / off → never)', live.offers.map(o => o.id));
ok(live.brand.emergency === '(901) 582-8255' && /TN #85034/.test(live.brand.licenses), 'the 24/7 line (call order number) and the licenses');
ok(live.tiers.length === 3 && !/\$/.test(JSON.stringify(live.tiers)) && live.handyman.price === '$349.99', 'tiers without prices; the Handyman Day price (the one that is set)');
ok(!/drawing/i.test(JSON.stringify(live)) && /10% off repairs/.test(JSON.stringify(live.tiers)), 'tiers from the plan catalog (repair discounts, extra calls); never the Gold drawing');
ok(live.slides.every(x => !TY.by[x.type].chk || x.type === 'announce'), 'slides with unchecked default words ("edit me") never play on the lobby', live.slides.filter(x => TY.by[x.type].chk).map(x => x.type));
ok(live.brand.states === 'TN · AR · MS', 'license states from the company brand settings (_lib/brand.js licenses)', live.brand.states);
ok(live.care.plans.length >= 4 && !/hvac|pressure/i.test(JSON.stringify(live.care)) && !/filter|pressure/i.test(JSON.stringify(live.handyman.tasks)), 'GrayCo Care plans + Handyman tasks from the catalog (no HVAC / pressure washing)', live.care.plans);
ok(live.weather && live.weather.days.length === 4, 'weather (Bartlett) for the weather slide');
ok(!/"(amt|amount|contract|balance|ar|collected|revenue|email|phone|address|client)"\s*:/i.test(JSON.stringify({ s: live.slides, o: live.offers })) && Object.keys(live).sort().join() === 'at,brand,care,handyman,interval,offers,ok,referral,slides,tiers,weather', 'no internal numbers / contact fields in the answer');
/* revoke */
H.cset('gc_lobby_access', { on: true, token: 'N'.repeat(43), at: '2026-10-30T11:00:00Z' });
r = await F.call('GET', { 'x-lobby-token': TOKEN }); ok(r.status === 404 && !r.json.slides, 'a replaced link → 404, nothing', r.status);
H.cset('gc_lobby_access', { on: false, token: '', at: '2026-10-30T12:00:00Z' });
r = await F.call('GET', { 'x-lobby-token': TOKEN }); ok(r.status === 404, 'the lobby turned off → 404', r.status);
r = await F.call('POST', {}, { action: 'preview', lobby: { slides: allSlides } }); ok(r.status === 401, 'preview without a CRM sign-in → 401', r.status);
H.cset('gc_lobby_access', { on: true, token: TOKEN, at: '2026-10-30T13:00:00Z' });

if (process.env.NOBROWSER) { console.log('\nLOBBY (function only): ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
console.log('— the page (no CRM sign-in)');
const c = await H.computer('LOBBY', { build });
await c.ctx.route('**/.netlify/functions/lobby*', F.route);
const crmHits = []; c.page().on('request', q => { const u = q.url(); if (/index\.html|\/rest\/v1\/|\/auth\/v1\//.test(u)) crmHits.push(u); });
const p = c.page(); await p.setViewportSize({ width: 1920, height: 1080 });
F.mod._test.reset();
await p.goto('https://app.local/lobby.html#t=' + TOKEN); await p.waitForTimeout(2500);
let st = await p.evaluate(() => window.__lobby.state());
ok(st.live && st.n > 10, 'the lobby page shows the playlist with no sign-in (' + st.n + ' slides on, first: ' + st.type + ')', st);
ok(!crmHits.length && !(await p.$('#gc-auth-email')), 'the lobby never loads the CRM, its sign-in or the database', crmHits.slice(0, 3));
const first = st.at; await p.waitForTimeout(13500); st = await p.evaluate(() => window.__lobby.state());
ok(st.at !== first, 'it rotates (12 s per slide)', st);
/* every slide type, live */
const errs0 = c.errs.length, seenLeak = [];
for (let i = 0; i < st.n; i++) { await p.evaluate(i => window.__lobby.show(i), i); await p.waitForTimeout(250); const t = await p.evaluate(() => document.getElementById('stage').innerText); seenLeak.push(...leaks(t)); }
ok(c.errs.length === errs0, 'every live slide draws with no page errors', c.errs.slice(errs0, errs0 + 3));
ok(seenLeak.length === 0, 'no customer name or address from the mirror in the lobby DOM', seenLeak.slice(0, 5));
/* revoked → blank */
H.cset('gc_lobby_access', { on: true, token: 'Z'.repeat(43), at: '2026-10-30T14:00:00Z' }); F.mod._test.reset();
await p.reload(); await p.waitForTimeout(2000);
st = await p.evaluate(() => ({ s: window.__lobby.state(), sl: document.querySelectorAll('.sl').length, txt: document.getElementById('stage').innerText.trim() }));
ok(!st.s.live && st.sl === 0 && !/welcome|grayco care|referral/i.test(st.txt), 'a revoked link shows nothing', st);
H.cset('gc_lobby_access', { on: true, token: TOKEN, at: '2026-10-30T15:00:00Z' });

console.log('— previews: every slide type, 1920×1080 (the function\'s preview answer on the mirror data)');
/* the editor's preview: the playlist as the office would set it (defaults), with the mirror's real data */
const prevSlides = TY.types.map(t => ({ id: 'p_' + t.k, type: t.k, on: true }));
const ex = prevSlides.find(x => x.type === 'countdown'); ex.end = '2026-12-15';
const tm = prevSlides.find(x => x.type === 'team'); tm.people = [{ name: 'Wesley', role: 'Owner' }, { name: 'Nick', role: 'Owner' }, { name: 'Steven', role: 'Project manager' }, { name: 'Brittany', role: 'Office manager' }];
const rt = prevSlides.find(x => x.type === 'rating'); rt.rating = '';
const prev = await F.call('POST', { authorization: 'Bearer utok-u-w-1' }, { action: 'preview', lobby: { v: 1, interval: 14, slides: prevSlides }, offers: V('gc_lobby_offers'), only: 0 });
ok(prev.status === 200 && prev.json.ok, 'the editor preview answer (a staff sign-in)', prev.status);
const pdata = prev.json.data;
/* the mirror has no 5★ reviews yet: one clearly-marked sample so the review layouts can be seen */
const SAMPLE = { name: 'First L.', stars: 5, text: 'Your newest 5-star Google reviews appear here — first name and last initial only, never an address.' };
await p.goto('https://app.local/lobby.html?preview=1'); await p.waitForTimeout(800);
const e1 = c.errs.length;
for (let i = 0; i < pdata.slides.length; i++) {
  const sl = pdata.slides[i];
  const d = JSON.parse(JSON.stringify(pdata));
  if ((sl.type === 'review' || sl.type === 'reviewwall') && !sl.reviews.length) d.slides[i].reviews = sl.type === 'review' ? [SAMPLE] : [SAMPLE, SAMPLE, SAMPLE];
  await p.evaluate(([d, i]) => window.postMessage({ gcLobby: 'data', data: d, only: i }, location.origin), [d, i]);
  await p.waitForTimeout(1600);
  const t = await p.evaluate(() => document.getElementById('stage').innerText); const lk = leaks(t); if (lk.length) ok(false, 'preview ' + sl.type + ' leaks', lk);
  await p.screenshot({ path: path.join(SHOTS, 'lobby_' + sl.type + '.png') });
}
ok(c.errs.length === e1, 'all ' + pdata.slides.length + ' slide types drawn in preview mode with no page errors', c.errs.slice(e1, e1 + 3));
console.log('  screenshots: ' + SHOTS + 'lobby_<type>.png × ' + pdata.slides.length);
await c.b.close();
console.log('\nLOBBY: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
