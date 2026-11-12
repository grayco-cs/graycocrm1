// test_QAB_lobby_fn.mjs <build-dir> — patch QAB (overnight QA 11/12): each company's lobby TV shows only its own jobs' photos, by the job's
// REAL company: GrayCo Construction's lobby never shows a Mitigation / Environmental job's photo, and one of the 5 MISFILED Construction
// jobs (wrongly stamped Mitigation by the old background stamper; read as Construction) stays on Construction's lobby, not Mitigation's.
// Node only (lobby_fn_mock.mjs — in-memory gc_kv, nothing leaves the machine). Made-up data.
import path from 'path';
import { pathToFileURL } from 'url';
const build = path.resolve(process.argv[2] || '.');
const { lobbyFn } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'lobby_fn_mock.mjs')).href);
let pass = 0, fail = 0; const ok = (m, c, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); } };
const cloud = new Map(), set = (k, v) => cloud.set(k, { value: v, updated_at: '2026-11-12T00:00:00Z' });
const H = n => 'sb:crm-files/' + String(n).repeat(64).slice(0, 64) + '.jpg';
const TOK = 'Q'.repeat(43), TOKM = 'M'.repeat(43);
set('projects', [{ id: 'C1', name: 'Conzz deck', companyId: 'construction', city: 'Bartlett' }, { id: 'M1', name: 'Mitzz basement', companyId: 'mitigation' },
  { id: 'PRJMVPFN7MBC7', name: 'Conzz misfiled reno', companyId: 'mitigation' }, { id: 'E1', name: 'Envzz tile', companyId: 'environmental' }]);
set('gc_photos', [{ id: 'pc', jobId: 'C1', ref: H('a'), shared: true }, { id: 'pm', jobId: 'M1', ref: H('b'), shared: true }, { id: 'px', jobId: 'PRJMVPFN7MBC7', ref: H('c'), shared: true }, { id: 'pe', jobId: 'E1', ref: H('d'), shared: true }]);
const slide = { id: 's1', type: 'collage', on: true, h: 'Our work', photos: ['pc', 'pm', 'px', 'pe'] };
set('gc_lobby_access', { on: true, token: TOK, at: '2026-11-12T00:00:00Z' }); set('gc_lobby', { slides: [slide] });
set('gc_lobby_access__mitigation', { on: true, token: TOKM, at: '2026-11-12T00:00:00Z' }); set('gc_lobby__mitigation', { slides: [slide] });
const F = lobbyFn(build, cloud, () => '');
const refsOf = j => JSON.stringify([].concat(...((j && j.slides) || []).map(x => x.photos || [])));
let r = await F.call('GET', { 'x-lobby-token': TOK });
const c = refsOf(r.json);
ok('Construction lobby: its own job\'s photo and the MISFILED Construction job\'s photo', r.status === 200 && /aaaa/.test(c) && /cccc/.test(c), { st: r.status, c: c.slice(0, 300) });
ok('Construction lobby: no Mitigation or Environmental job photo', !/bbbb/.test(c) && !/dddd/.test(c), c.slice(0, 300));
F.mod._test.reset();
r = await F.call('GET', { 'x-lobby-token': TOKM, 'x-lobby-co': 'mitigation' });
const m = refsOf(r.json);
ok('Mitigation lobby: its own job\'s photo only — not the MISFILED Construction job, not Construction / Environmental', r.status === 200 && /bbbb/.test(m) && !/aaaa|cccc|dddd/.test(m), { st: r.status, m: m.slice(0, 300) });
ok('Mitigation lobby: GrayCo Mitigation name and logo', r.json && r.json.brand && /GrayCo Mitigation/.test(r.json.brand.name) && /mitigation-logo/.test(r.json.brand.logo || ''), r.json && r.json.brand);
ok('Mitigation lobby: not GrayCo Construction\'s review link, licenses or "Licensed in" states (none set for Mitigation yet)', r.json && !r.json.brand.reviewUrl && !r.json.brand.licenses && !r.json.brand.states, r.json && r.json.brand);
set('gc_companies', { list: [{ id: 'mitigation', legal: 'GrayCo Mitigation, LLC', license: 'TN #M-123', phone: '(901) 555-0177', marketing: { active: true, accounts: { reviewLink: 'https://g.page/r/demo-mitigation/review' } } }] });
F.mod._test.reset();
r = await F.call('GET', { 'x-lobby-token': TOKM, 'x-lobby-co': 'mitigation' });
ok('Mitigation lobby with its own settings: its review link, license, states and phone', r.json && r.json.brand.reviewUrl === 'https://g.page/r/demo-mitigation/review' && r.json.brand.licenses === 'TN #M-123' && r.json.brand.states === 'TN' && r.json.brand.phone === '(901) 555-0177', r.json && r.json.brand);
F.mod._test.reset();
r = await F.call('GET', { 'x-lobby-token': TOK });
ok('Construction lobby unchanged (its own review link and licenses)', r.json && r.json.brand && !r.json.brand.co && /GrayCo Construction/.test(r.json.brand.name), r.json && r.json.brand);
F.mod._test.reset();
r = await F.call('GET', { 'x-lobby-token': TOK, 'x-lobby-co': 'mitigation' });
ok('Construction\'s link does not open the Mitigation lobby', r.status === 404, r.status);
console.log('QAB_LOBBY ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
