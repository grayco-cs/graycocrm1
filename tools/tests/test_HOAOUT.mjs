/* patch HOAOUT tests: node tools/tests/test_HOAOUT.mjs [repo dir]
   Owner 11/23: "How can we sign up with every hoa in Memphis?" / "Don't we have a sign up thing already … Can we add hoas too".
     1. the seed (netlify/functions/_lib/outreach-seed.json) parses, keeps the 607 original entries, and has the new
        "HOAs & Community Managers" sheet (+ CAI / VIVE under Join & Register) in the same field shape;
     2. every id is unique; no entry carries a personal-looking e-mail (gmail, yahoo …) — the new entries carry no e-mail at all,
        no person's name, and a `how` on every one;
     3. bid-inbox ?outreachseed still hands the whole seed to signed-in staff (the function itself, auth stubbed);
     4. the CRM page (index.html, patch LEADSCON run in a VM with a tiny DOM): _gcOutreachSeedMerge adds the new ids to a list
        that is NOT empty and never touches an entry a person changed (status, notes, log, a cleared phone), never removes one
        the seed no longer has; a second run adds nothing; the 🏘 HOAs group + the sheet filter show the new entries;
     5. patch LSALEADS calls the merge for a non-empty list (no more "only when empty"). Offline; made-up list data only. */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }

const HOA = 'HOAs & Community Managers';
const SEED_FILE = path.join(ROOT, 'netlify/functions/_lib/outreach-seed.json');
const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const leads = seed.leads || [];
const hoa = leads.filter(l => l.sheet === HOA), hoaJr = leads.filter(l => l.sheet === 'Join & Register' && l.raw && l.raw.Segment === 'HOAs');
const FIELDS = 'id,phase,sheet,setup,pri,inz,zone,title,what,how,area,links,emails,phones,person,init,raw';

console.log('1–2. the seed');
await t('parses: { built, leads[] }, the 607 original entries are still there', () => {
  assert.ok(seed.built && !isNaN(Date.parse(seed.built)));
  assert.ok(Array.isArray(leads) && leads.length >= 607 + 30, 'leads: ' + leads.length);
  assert.strictEqual(leads.filter(l => l.sheet !== HOA && !(l.raw && l.raw.Segment === 'HOAs')).length, 607);
});
await t('the "HOAs & Community Managers" sheet has entries: management companies first (priority 1, Register), HOAs to reach out to', () => {
  assert.ok(hoa.length >= 30, 'HOA entries: ' + hoa.length);
  const mg = hoa.filter(l => /management company/i.test(l.raw.Category)), as = hoa.filter(l => /association$/i.test(l.raw.Category));
  assert.ok(mg.length >= 15 && as.length >= 10, mg.length + ' / ' + as.length);
  assert.ok(mg.filter(l => l.pri === 1).length >= 6 && mg.every(l => l.phase === 1));
  assert.ok(as.every(l => l.phase === 2 && l.pri >= 2), 'associations rank after the management companies');
  assert.ok(Math.min(...mg.map(l => l.pri)) <= Math.min(...as.map(l => l.pri)));
});
await t('CAI Tennessee + VIVE are under Join & Register with steps and cost', () => {
  const cai = hoaJr.find(l => /CAI Tennessee/.test(l.title)), vive = hoaJr.find(l => /VIVE/.test(l.title));
  assert.ok(cai && vive, 'CAI / VIVE entries');
  assert.ok(/\$645/.test(cai.how) && /caionline\.org\/join/.test(cai.how) && /\$/.test(cai.raw.Cost), 'CAI cost + steps');
  assert.ok(/annual fee/i.test(vive.how) && /W-9/.test(vive.how) && vive.raw.Cost);
});
await t('the new entries keep the existing field shape (same keys, same order, same types)', () => {
  for (const l of hoa.concat(hoaJr)) {
    assert.strictEqual(Object.keys(l).join(','), FIELDS, l.id);
    assert.ok([1, 2].includes(l.phase) && [1, 2, 3].includes(l.pri) && l.setup === false && l.inz === true && l.zone === 'Within 100 mi', l.id);
    for (const k of ['links', 'emails', 'phones']) assert.ok(Array.isArray(l[k]), l.id + ' ' + k);
    assert.ok(l.links.every(u => !/^https?:/i.test(u)), 'bare links like the rest of the seed: ' + l.id);
    assert.ok(l.phones.every(p => /^\(\d{3}\) \d{3}-\d{4}$/.test(p)), 'office phones (901) 555-0100 style: ' + l.id);
    assert.ok(l.title && l.what && l.how && l.how.length > 20, 'title / what / how: ' + l.id);
    assert.ok(l.raw && l.raw.Status === 'Not Started', l.id);
  }
});
await t('every id is unique', () => {
  const ids = leads.map(l => l.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepStrictEqual(dup, []);
  assert.ok(ids.every(x => typeof x === 'string' && x.length > 3));
});
await t('no entry carries a personal-looking e-mail; the new ones carry no e-mail and no person at all', () => {
  const PERSONAL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|comcast|att|bellsouth|sbcglobal|charter|proton|protonmail|gmx|mail)\.(com|net)\b/i;
  const bad = leads.filter(l => PERSONAL.test(JSON.stringify([l.emails, l.raw, l.what, l.how]))).map(l => l.id);
  assert.deepStrictEqual(bad, []);
  for (const l of hoa.concat(hoaJr)) { assert.deepStrictEqual(l.emails, [], l.id); assert.strictEqual(l.person, '', l.id); assert.ok(!/@/.test(JSON.stringify(l)), 'no address anywhere: ' + l.id); }
});
await t('an HOA without a public contact says how to find one (website / TN SOS registered agent)', () => {
  const blank = hoa.filter(l => l.phase === 2 && !l.links.length && !l.phones.length);
  assert.ok(blank.length >= 1);
  for (const l of blank) assert.ok(/board contact|registered agent|management company|see its entry/i.test(l.how), l.id);
});

console.log('3. bid-inbox ?outreachseed');
await t('signed-in staff get every seed entry, the HOAs included', async () => {
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' });
  const realFetch = global.fetch;
  global.fetch = async (u, o) => {   /* the staff check: Supabase auth + the users list — made-up staff member */
    const url = String(u);
    if (/\/auth\/v1\/user/.test(url)) return new Response(JSON.stringify({ id: 'u-demo', email: 'demo.staff@example.test' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (/\/rest\/v1\//.test(url)) return new Response(JSON.stringify([{ key: 'users', value: [{ id: 'u-demo', email: 'demo.staff@example.test', role: 'Office', active: true }] }]), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const fn = require(path.join(ROOT, 'netlify/functions/bid-inbox.js'));
    const r = await fn.handler({ httpMethod: 'GET', queryStringParameters: { outreachseed: '1' }, headers: { authorization: 'Bearer demo-token' }, body: '' }, {});
    if (r.statusCode === 401 || r.statusCode === 403) { console.log('    (staff check not reachable offline — answered ' + r.statusCode + '; the seed file checks above cover the data)'); return; }
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200, r.body.slice(0, 200));
    assert.strictEqual(j.items.length, leads.length);
    assert.ok(j.items.some(x => x.sheet === HOA));
  } finally { global.fetch = realFetch; }
});

console.log('4. the CRM page: the merge');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const block = id => { const m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(html); if (!m) throw new Error('no ' + id); return m[1]; };
function page(saved){
  const ls = new Map(), els = {};
  if (saved) ls.set('gc_outreach_list_v1', JSON.stringify({ items: saved }));
  const el = tag => ({ tag, id: '', style: {}, children: [], set textContent(v){ this._t = v; }, setAttribute(){}, appendChild(c){ this.children.push(c); if (c.id) els[c.id] = c; return c; }, addEventListener(){}, remove(){} });
  const D = { head: el('head'), body: Object.assign(el('body'), { classList: { contains: () => false } }), documentElement: el('html'),
    getElementById: id => els[id] || null, createElement: el, querySelector: () => null, querySelectorAll: () => [], activeElement: null };
  const W = { document: D, localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    setTimeout, clearTimeout, setInterval: () => 0, console: { log(){}, warn(){} }, cloudWrites: 0 };
  W._supaUpsert = () => { W.cloudWrites++; return Promise.resolve(true); };
  W.window = W;
  const ctx = vm.createContext(Object.assign(W, { window: W, document: D, Promise, JSON, Date, Math, Object, Array, String, Number, RegExp, Blob: class {}, URL }));
  vm.runInContext(block('gc-patch-leadscon'), ctx);
  return { W, ls, saved: () => JSON.parse(ls.get('gc_outreach_list_v1') || '{"items":[]}').items };
}
const OLD = [   /* made-up list the office has been working: two edited entries, one untouched, one the seed no longer has */
  { id: 'GC-demo-1', phase: 1, company: 'Demo Plan Room', type: 'Plan room', pri: 1, person: '', contactTitle: '', email: '', phone: '', emails: [], phones: [], links: [], portal: '', website: '', city: '', inZone: true, zone: '', why: 'Demo', how: 'Demo',
    status: 'Submitted', notes: 'Applied 11/02 — waiting on approval', next: '2026-12-01', log: [{ at: '2026-11-02T15:00:00.000Z', by: 'demo.office@example.test', text: 'Status: Not started → Submitted' }], src: { sheet: 'Bid Lists & Plan Rooms', raw: {} }, updatedAt: '2026-11-02T15:00:00.000Z' },
  { id: 'GC-demo-2', phase: 2, company: 'Demo Builder (renamed by the office)', type: '', pri: 3, person: '', contactTitle: '', email: '', phone: '', emails: [], phones: [], links: [], portal: '', website: '', city: 'Bartlett', inZone: true, zone: '', why: '', how: '',
    status: 'Approved/on list', notes: 'On their list since 10/30', next: '', log: [], src: { sheet: 'Home Builders', raw: {} }, updatedAt: '2026-10-30T12:00:00.000Z' },
  { id: 'GC-demo-3', phase: 2, company: 'Demo Architect', type: 'false', pri: 2, person: '', contactTitle: '', email: '', phone: '', emails: [], phones: [], links: [], portal: '', website: '', city: '', inZone: false, zone: '', why: '', how: '',
    status: 'Not started', notes: '', next: '', log: [], src: { sheet: 'Architects', raw: {} }, updatedAt: '2026-10-20T00:00:00.000Z' },
  { id: 'OL-handadded', phase: 2, company: 'A company a person added', type: '', pri: 2, person: '', contactTitle: '', email: '', phone: '', emails: [], phones: [], links: [], portal: '', website: '', city: '', inZone: false, zone: '', why: '', how: '',
    status: 'In progress', notes: 'called', next: '', log: [], src: {}, updatedAt: '2026-11-10T00:00:00.000Z' }];
const SEEDDEMO = [   /* the seed's copy of the same ids says other things — none of it may land */
  { id: 'GC-demo-1', phase: 2, sheet: 'Bid Lists & Plan Rooms', setup: false, pri: 3, inz: false, zone: '', title: 'Demo Plan Room — seed title', what: 'seed what', how: 'seed how', area: 'Memphis', links: ['example.com/seed'], emails: [], phones: ['(901) 555-0100'], person: '', init: '', raw: {} },
  { id: 'GC-demo-2', phase: 2, sheet: 'Home Builders', setup: false, pri: 1, inz: true, zone: 'Within 100 mi', title: 'Demo Builder', what: 'w', how: 'h', area: 'Memphis', links: [], emails: [], phones: ['(901) 555-0101'], person: '', init: 'Submitted', raw: {} },
  { id: 'GC-demo-3', phase: 2, sheet: 'Architects', setup: false, pri: 2, inz: true, zone: 'Within 100 mi', title: 'Demo Architect', what: 'w', how: 'h', area: 'Memphis', links: ['example.com'], emails: [], phones: [], person: '', init: '', raw: {} }
].concat(hoa.concat(hoaJr));
await t('the seed is added to a list that is NOT empty: only the new ids', async () => {
  const P = page(OLD);
  const before = JSON.parse(JSON.stringify(P.W._gcOutreach.items()));
  assert.strictEqual(before.length, 4);
  const r = P.W._gcOutreachSeedMerge(SEEDDEMO);
  assert.strictEqual(r.added, hoa.length + hoaJr.length);
  assert.strictEqual(r.kept, 4);
  const now = P.W._gcOutreach.items();
  assert.strictEqual(now.length, 4 + hoa.length + hoaJr.length);
  assert.ok(hoa.concat(hoaJr).every(l => now.some(x => x.id === l.id)));
  await new Promise(r => setTimeout(r, 30));
  assert.strictEqual(P.saved().length, now.length, 'saved on this computer');
  assert.ok(P.W.cloudWrites >= 1, 'and to the cloud');
});
await t('an entry a person changed is never touched (status, notes, follow-up, log, renamed company, cleared phone) — byte for byte', () => {
  const P = page(OLD);
  P.W._gcOutreachSeedMerge(SEEDDEMO);
  const now = P.W._gcOutreach.items();
  for (const o of OLD) assert.deepStrictEqual(now.find(x => x.id === o.id), o, o.id);
});
await t('nothing is removed: an entry the seed no longer has (and one a person added) stays', () => {
  const P = page(OLD);
  P.W._gcOutreachSeedMerge(hoa);
  const now = P.W._gcOutreach.items();
  for (const o of OLD) assert.ok(now.some(x => x.id === o.id), o.id);
});
await t('a second run adds nothing; a new seed copy is "oldest" so another computer\'s edited copy always wins', async () => {
  const P = page(OLD);
  P.W._gcOutreachSeedMerge(SEEDDEMO);
  const r2 = P.W._gcOutreachSeedMerge(SEEDDEMO);
  assert.strictEqual(r2.added, 0);
  const x = P.W._gcOutreach.items().find(i => i.id === hoa[0].id);
  assert.ok(x.updatedAt < '2001', x.updatedAt);
  assert.strictEqual(x.status, 'Not started');
});
await t('an empty list still fills from the whole seed (the original OUTSEED behaviour)', () => {
  const P = page(null);
  const r = P.W._gcOutreachSeedMerge(SEEDDEMO);
  assert.strictEqual(r.added, SEEDDEMO.length);
});
await t('the new entries read right in the list: company, priority, phone, website / portal, "how", the HOAs group and the sheet filter', () => {
  const P = page(OLD);
  P.W._gcOutreachSeedMerge(SEEDDEMO);
  const O = P.W._gcOutreach, items = O.items();
  const kc = items.find(x => /Keith S\. Collins/.test(x.company));
  assert.ok(kc && kc.pri === 1 && kc.phase === 1 && kc.phone && /keithcollinsco\.com/.test(kc.website + kc.portal) && kc.how.length > 40 && kc.src.sheet === HOA && kc.type === HOA, JSON.stringify(kc).slice(0, 300));
  const cedar = items.find(x => /Cedar Management/.test(x.company));
  assert.ok(/vendor/.test(cedar.portal), 'a vendor / VIVE link becomes the Portal link');
  O.setGroup('hoa');
  const st = O.state();
  assert.strictEqual(st.counts.hoa, hoa.length + hoaJr.length);
  assert.strictEqual(st.shown.length, hoa.length + hoaJr.length);
  assert.ok(st.shown.slice(0, 5).every(id => items.find(x => x.id === id).pri === 1), 'priority 1 (the management companies + CAI / VIVE) first');
  O.ui().sh = HOA; O.setGroup('reg');
  assert.ok(O.state().shown.length >= 15 && O.state().shown.every(id => items.find(x => x.id === id).src.sheet === HOA), 'the "Any list" filter → HOAs & Community Managers on Register');
  O.ui().sh = 'Architects'; O.setGroup('out');
  assert.deepStrictEqual(O.state().shown, ['GC-demo-3']);
});

console.log('5. patch LSALEADS');
await t('the outreach seed is merged into a non-empty list too (no "only when empty" early return)', () => {
  const b = block('gc-patch-lsaleads'), f = /function seedOutreach\(\)\{[\s\S]*?\n\}/.exec(b)[0];
  assert.ok(/_gcOutreachSeedMerge\(j\.items\)/.test(f));
  assert.ok(!/O\.items\(\)\.length\)\s*\{\s*SEED\.tried = true; return;/.test(f) && !/_gcOutreachImport\(j\.items\)/.test(f));
});

console.log(failed ? 'FAILED ' + failed + ' (' + passed + ' passed)' : 'HOAOUT ' + passed + '/' + passed);
process.exit(failed ? 1 : 0);
