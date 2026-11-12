/* patch PERMITS tests: node tools/tests/test_PERMITS.js — 🏗️ Permits (netlify/functions/permit-watch.js + _lib/permits.js).
   Fully offline: fetch, the database and the sign-in are mocked. Every permit below is MADE UP (no real owners or addresses). */
'use strict';
const path = require('path');
const P = require(path.join(__dirname, '../../netlify/functions/_lib/permits.js'));
const W = require(path.join(__dirname, '../../netlify/functions/permit-watch.js'));
const OS = require(path.join(__dirname, '../../netlify/functions/owner-setup.js'));
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 400))); };

const NOW = Date.parse('2026-11-12T14:00:00Z');
const daysAgo = n => NOW - n * 864e5;
const isoAgo = n => new Date(daysAgo(n)).toISOString().slice(0, 10);
/* ── made-up Nashville rows (ArcGIS "attributes") ── */
let oid = 1;
function nash(o){ return { attributes: Object.assign({ Permit__: 'T2026' + String(oid).padStart(6, '0'), ObjectId: oid++, Permit_Type_Description: 'Building Residential - Rehab', Permit_Subtype_Description: 'Single Family Residence', Parcel: '000 00 0 000.00',
  Date_Entered: daysAgo(5), Date_Issued: daysAgo(2), Const_Cost: 50000, Address: '100 TEST LANE', City: 'NASHVILLE', State: 'TN', ZIP: '37000', Contact: 'Example Builders LLC', Purpose: 'interior remodel', Lat: 36.1, Lon: -86.7 }, o) }; }
const NASH_ROWS = [
  nash({ Permit_Type_Description: 'Building Commercial - Rehab', Permit_Subtype_Description: 'General Office, Professional Services', Const_Cost: 480000, Address: '1 SAMPLE PLAZA', Purpose: 'interior renovation of 2nd floor offices' }),   // 0 commercial rehab
  nash({ Permit_Type_Description: 'Building Commercial - Fire Damage', Permit_Subtype_Description: 'Restaurant (Full Service)', Const_Cost: 9000, Address: '2 DEMO AVE', Purpose: 'repair fire damage to kitchen and dining room' }),   // 1 fire (any value)
  nash({ Permit_Type_Description: 'Building Demolition Permit', Permit_Subtype_Description: 'Demolition Permit - Residential', Const_Cost: 8000, Address: '3 FAKE ST', Purpose: 'demolish existing single family residence. not to be burned on lot.' }),   // 2 demolition (no fire)
  nash({ Permit_Type_Description: 'Building Sign Permit', Permit_Subtype_Description: 'Sign - Ground /  Wall Signs', Const_Cost: 60000, Purpose: 'new wall sign' }),   // 3 sign → out
  nash({ Permit_Type_Description: 'Building Residential - Rehab', Permit_Subtype_Description: 'Accessory Structure, Decks', Const_Cost: 30000, Purpose: 'new deck at rear' }),   // 4 deck → out
  nash({ Permit_Type_Description: 'Building Residential - Rehab', Const_Cost: 12000, Purpose: 'kitchen remodel' }),   // 5 under $25k → out
  nash({ Permit_Type_Description: 'Building Residential - New', Const_Cost: 350000, Purpose: 'construct new single family residence' }),   // 6 residential new → out by default
  nash({ Permit_Type_Description: 'Building Residential - Rehab', Const_Cost: 4000, Purpose: 'water damage repair after pipe burst, replace drywall' }),   // 7 water (any value)
  nash({ Permit_Type_Description: 'Building Residential - Roofing / Siding', Const_Cost: 14000, Purpose: 'reroof, tear off and replace shingles' }),   // 8 roof
  nash({ Permit_Type_Description: 'Building Commercial - New', Permit_Subtype_Description: 'Multifamily, Apt / Twnhome > 5 Unit Bldg', Const_Cost: 2100000, Purpose: 'new 24 unit apartment building' }),   // 9 multifamily
  nash({ Permit_Type_Description: 'Building Commercial - Rehab', Const_Cost: 900000, Date_Issued: daysAgo(40), Date_Entered: daysAgo(50), Purpose: 'tenant finish out' }),   // 10 too old
  nash({ Permit_Type_Description: 'Building Commercial - Rehab', Permit_Subtype_Description: 'Safety Services, Fire & Police Station', Const_Cost: 300000, Purpose: 'install new fire alarm and sprinkler system with interior alterations' }),   // 11 NOT fire damage
  nash({ Permit_Type_Description: 'Building Residential - Rehab', Const_Cost: 3000, Purpose: 'tree fell on house during storm, repair roof framing' }),   // 12 storm
  nash({ Permit_Type_Description: 'Building Commercial - Rehab', Const_Cost: 70000, Purpose: 'asbestos abatement and replace ceiling tiles' }),   // 13 env words
  nash({ Permit_Type_Description: 'Building Commercial - New', Permit_Subtype_Description: 'Warehouse, Storage S-1', Const_Cost: 5200000, Purpose: 'new warehouse shell building, flood-proofing per code in the event of a flood' }),   // 14 commercial new, NOT flood
  nash({ Permit_Type_Description: 'Building Commercial - Rehab', Const_Cost: 150000, Purpose: 'replace rooftop units and ductwork' })   // 15 rooftop HVAC: commercial rehab, not "Roof"
];
/* ── made-up Shovels permits ── */
function shov(o){ return Object.assign({ id: 'SHV' + (oid++), number: 'BLD-' + oid, description: 'remodel', jurisdiction: 'Example City', job_value: 6000000, type: 'Building', subtype: 'Alteration', status: 'active',
  file_date: isoAgo(6), issue_date: isoAgo(3), start_date: isoAgo(6), contractor_id: 'C1', tags: ['remodel'], address: { street_no: '10', street: 'MOCK RD', city: 'MEMPHIS', zip_code: '38117', state: 'TN', latlng: [35.1, -89.9] },
  property_type: 'residential', property_legal_owner: 'SAMPLE OWNER TRUST', property_year_built: 1999 }, o); }
const SHOV = {
  '38117': [shov({ description: 'kitchen and bath remodel', job_value: 8500000 }), shov({ description: 'replace roof after hail', job_value: 1500000, tags: ['roofing'] }), shov({ description: 'pool', tags: ['pool_and_hot_tub'], job_value: 9000000 })],
  '38671': [shov({ description: 'demolition of existing commercial building', type: 'Demolition', job_value: 2000000, property_type: 'commercial', property_year_built: 1965, address: { street_no: '20', street: 'PRETEND BLVD', city: 'SOUTHAVEN', zip_code: '38671', state: 'MS' } }),
    shov({ description: 'electrical service upgrade', tags: ['electrical'], type: 'Electrical', job_value: 3000000 })],
  '72201': [shov({ description: 'interior remodel', job_value: 4000000, property_year_built: 1950, contractor_id: 'C2', address: { street_no: '30', street: 'EXAMPLE ST', city: 'LITTLE ROCK', zip_code: '72201', state: 'AR' } })]
};

/* ── the rig: an in-memory database + mocked fetch ── */
function rig(o){
  o = o || {};
  const kv = {}; const calls = []; let clock = NOW;
  const D = W._test.D;
  D.now = () => clock;
  D.env = k => (o.env && o.env[k] != null ? String(o.env[k]) : '');
  D.kvGet = async k => (k in kv ? JSON.parse(JSON.stringify(kv[k])) : null);
  D.kvCas = async (k, f) => { const n = f(k in kv ? JSON.parse(JSON.stringify(kv[k])) : null); if (n !== undefined) kv[k] = JSON.parse(JSON.stringify(n)); return { ok: true, value: kv[k] }; };
  D.staffAuth = async e => { const t = ((e.headers || {}).authorization || '').replace(/^Bearer /, ''); return t === 'admin' ? { ok: true, email: 'admin@example.com', name: 'Ada Admin', admin: true } : t === 'staff' ? { ok: true, email: 'pm@example.com', name: 'Pat PM', admin: false } : { ok: false, code: 401, error: 'Sign in' }; };
  const st = { shovelsStatus: o.shovelsStatus || 200, usage: o.usage || { credits_used: 120, credit_limit: 5000, is_over_limit: false }, nash: o.nash || NASH_ROWS, shov: o.shov || SHOV };
  D.fetch = async (u, init) => {
    const url = new URL(u); calls.push({ host: url.host, path: url.pathname, q: url.search, key: init && init.headers && init.headers['X-API-Key'] });
    const J = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
    if (url.host === 'services2.arcgis.com') {
      if (o.nashDown) return J(500, null);
      const off = +url.searchParams.get('resultOffset') || 0, n = +url.searchParams.get('resultRecordCount') || 1000;
      return J(200, { features: st.nash.slice(off, off + n) });
    }
    if (url.host === 'api.shovels.ai') {
      if (url.pathname === '/v2/usage') return J(o.usageStatus || 200, st.usage);
      if (url.pathname === '/v2/contractors') return J(200, { items: url.searchParams.getAll('id').map(id => ({ id, business_name: id === 'C1' ? 'Example Roofing Co' : 'Sample Contractors Inc' })) });
      if (url.pathname === '/v2/permits/search') {
        if (st.shovelsStatus !== 200) return J(st.shovelsStatus, { detail: 'nope' });
        const z = url.searchParams.get('geo_id'); const items = st.shov[z] || [];
        const size = +url.searchParams.get('size'); const cur = +url.searchParams.get('cursor') || 0;
        const page = items.slice(cur, cur + size);
        return J(200, { items: page, size: page.length, next_cursor: cur + size < items.length ? String(cur + size) : null });
      }
    }
    return J(404, null);
  };
  return { kv, calls, D, st, tick: ms => { clock += ms; }, setClock: t => { clock = t; } };
}
function ev(token, body){ return { httpMethod: 'POST', headers: { authorization: 'Bearer ' + token, origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(body) }; }
async function act(token, body){ const r = await W.handler(ev(token, body)); return { code: r.statusCode, body: JSON.parse(r.body) }; }

(async () => {
  /* ── 1. the filter, one permit at a time ── */
  const S = P.defaults();
  const c = i => P.classify(P.fromNashville(NASH_ROWS[i]), S, NOW);
  ok('the adapter reads a Nashville row (permit #, type, value, issued day, address, contractor, link)', (() => { const p = P.fromNashville(NASH_ROWS[0]); return p.src === 'nashville' && p.number === NASH_ROWS[0].attributes.Permit__ && p.value === 480000 && p.issued === isoAgo(2) && p.address === '1 Sample Plaza' && p.contractor === 'Example Builders LLC' && /Permit__/.test(decodeURIComponent(p.link)); })());
  ok('commercial rehab $480k matches → "Commercial rehab $480k", Construction', c(0).match && c(0).reasons.includes('Commercial rehab $480k') && c(0).hint === 'construction', c(0));
  ok('fire damage under the minimum still matches → 🔥 chip, Mitigation', c(1).match && c(1).reasons.includes('🔥 fire/smoke words') && c(1).hint === 'mitigation', c(1));
  ok('a demolition (even "not to be burned") → "Demolition — pre-1978? (Environmental)", Environmental, no fire chip', c(2).match && c(2).reasons[0] === 'Demolition — pre-1978? (Environmental)' && c(2).hint === 'environmental' && !c(2).reasons.some(r => /fire/.test(r)), c(2));
  ok('sign permit → out', !c(3).match && /excluded/.test(c(3).why), c(3));
  ok('deck → out', !c(4).match, c(4));
  ok('a $12k remodel → out (under $25,000)', !c(5).match && /under/.test(c(5).why), c(5));
  ok('a new house → out by default (Residential new is off)', !c(6).match, c(6));
  ok('water damage $4k → 💧, Mitigation', c(7).match && c(7).reasons.includes('💧 water/flood words') && c(7).hint === 'mitigation', c(7));
  ok('reroof $14k → "Roof $14k" (roofs at any value)', c(8).match && c(8).reasons[0] === 'Roof $14k' && c(8).bucket === 'roofing', c(8));
  ok('24-unit apartments → "Multifamily $2.1M"', c(9).match && c(9).reasons[0] === 'Multifamily $2.1M', c(9));
  ok('40 days old → out (max age 14 days)', !c(10).match && /older/.test(c(10).why), c(10));
  ok('"fire alarm / sprinkler" at a fire station is NOT fire damage (Construction)', c(11).match && !c(11).reasons.some(r => /fire\/smoke/.test(r)) && c(11).hint === 'construction', c(11));
  ok('"tree fell on house during storm" $3k → 🌪, Mitigation', c(12).match && c(12).reasons.includes('🌪 storm/hail/wind words') && c(12).hint === 'mitigation', c(12));
  ok('asbestos abatement → ☣, Environmental', c(13).match && c(13).reasons.includes('☣ mold/asbestos/lead words') && c(13).hint === 'environmental', c(13));
  ok('"in the event of a flood" on a new warehouse is not a flood → Commercial new $5.2M', c(14).match && c(14).reasons[0] === 'Commercial new $5.2M' && !c(14).reasons.some(r => /water/.test(r)), c(14));
  ok('"replace rooftop units" is HVAC work in a commercial rehab, not a roof', c(15).match && c(15).bucket === 'commercialRehab' && !c(15).reasons.some(r => /^Roof/.test(r)), c(15));
  const sp = P.fromShovels(SHOV['38671'][0], '38671'), sc = P.classify(sp, S, NOW);
  ok('Shovels adapter: cents → dollars, address object, owner, year built, area', sp.value === 20000 && sp.address === '20 Pretend Blvd' && sp.city === 'Southaven' && sp.state === 'MS' && sp.zip === '38671' && sp.owner === 'SAMPLE OWNER TRUST' && sp.yearBuilt === 1965 && /DeSoto/.test(sp.areaLong), sp);
  ok('Shovels demolition built 1965 → "Demolition — built 1965 (Environmental)"', sc.match && sc.reasons[0] === 'Demolition — built 1965 (Environmental)' && sc.hint === 'environmental', sc);
  const lr = P.classify(P.fromShovels(SHOV['72201'][0], '72201'), S, NOW);
  ok('a remodel in a 1950 house → "Built 1950 (pre-1978 …)" chip, Environmental hint', lr.match && lr.reasons.some(r => /^Built 1950/.test(r)) && lr.hint === 'environmental', lr);
  ok('Shovels electrical-only (tags) → out', !P.classify(P.fromShovels(SHOV['38671'][1], '38671'), S, NOW).match);
  ok('Shovels pool → out', !P.classify(P.fromShovels(SHOV['38117'][2], '38117'), S, NOW).match);
  const S2 = P.clean({ include: { residentialNew: true }, minValue: 100000, exclude: ['remodel'] });
  ok('settings: a new house is in when Residential new is ticked', P.classify(P.fromNashville(NASH_ROWS[6]), S2, NOW).match);
  ok('settings: an excluded word in the type / subtype takes the permit out', !P.classify({ src: 'x', id: '1', type: 'Remodel', desc: '', value: 900000, issued: isoAgo(1) }, S2, NOW).match);
  ok('settings: a higher minimum value takes the $50k-style remodel out', !P.classify(P.fromNashville(NASH_ROWS[5]), P.clean({ minValue: 100000 }), NOW).match);
  ok('settings clean: ZIP list from text, bad ZIPs dropped, numbers clamped', (() => { const x = P.clean({ shovels: { zips: '38117, 3811, abcde 72201 38117', maxPerRun: 999999 }, maxAgeDays: 0 }); return x.shovels.zips.join() === '38117,72201' && x.shovels.maxPerRun === 2000 && x.maxAgeDays === 1; })());
  ok('the default ZIP list covers Shelby Co. TN, DeSoto Co. MS, Little Rock / NLR and Jonesboro', ['38103', '38138', '38017', '38016', '38002', '38053', '38671', '38654', '38637', '38632', '72201', '72116', '72401'].every(z => P.DEFAULT_ZIPS.includes(z)) && !P.DEFAULT_ZIPS.some(z => /^37/.test(z)));

  /* ── 2. a run: Nashville only (no key) ── */
  let g = rig();
  let r = await W.run({ by: 'test' });
  const st1 = g.kv.gc_permit_status, items1 = g.kv.gc_permit_leads;
  ok('no SHOVELS_API_KEY → Shovels not called, status "Not connected — add SHOVELS_API_KEY in Netlify"', !g.calls.some(x => x.host === 'api.shovels.ai') && st1.shovels.active === false && /SHOVELS_API_KEY/.test(st1.shovels.note), st1.shovels);
  const want1 = [0, 1, 2, 7, 8, 9, 11, 12, 13, 14, 15].length;
  ok('Nashville status: read ' + NASH_ROWS.length + ', matched ' + want1 + ', no error', st1.nashville.ok && st1.nashville.read === NASH_ROWS.length && st1.nashville.matched === want1 && !st1.nashville.error, st1.nashville);
  ok('the Nashville query asks for the last 14 days, newest first, no geometry', (() => { const q = new URLSearchParams(g.calls.find(x => x.host === 'services2.arcgis.com').q); return /Date_Issued >= TIMESTAMP '\d{4}-\d{2}-\d{2} 00:00:00'/.test(q.get('where')) && q.get('orderByFields') === 'Date_Issued DESC' && q.get('returnGeometry') === 'false' && q.get('f') === 'json'; })());
  ok('stored: one per permit, all "new", newest issued first, each with reasons + hint', items1.length === want1 && items1.every(x => x.state === 'new' && x.key === 'nashville:' + x.id && x.reasons.length && x.hint) && items1.every((x, i) => i === 0 || items1[i - 1].issued >= x.issued), items1.map(x => x.issued));
  ok('nothing went into the Lead Inbox', !('gc_lead_inbox' in g.kv));
  ok('run result: added counts', r.ok && r.added.nashville === want1 && r.added.shovels === 0, r);
  /* the same run again → no duplicates, a person's choice kept */
  g.kv.gc_permit_leads[0].state = 'dismissed';
  g.tick(3 * 60e3);
  r = await W.run({ by: 'test' });
  ok('a second run adds nothing new (dedupe by source + permit id) and keeps "dismissed"', g.kv.gc_permit_leads.length === want1 && r.added.nashville === 0 && g.kv.gc_permit_leads[0].state === 'dismissed', r.added);
  /* a third run with one more permit */
  g.st.nash = NASH_ROWS.concat([nash({ Permit_Type_Description: 'Building Commercial - Rehab', Const_Cost: 260000, Purpose: 'remodel retail suite', Date_Issued: daysAgo(0) })]);
  g.tick(3 * 60e3);
  r = await W.run({ by: 'test' });
  ok('a new permit on a later run is added once, at the top', r.added.nashville === 1 && g.kv.gc_permit_leads.length === want1 + 1 && g.kv.gc_permit_leads[0].issued === isoAgo(0), r.added);
  ok('Nashville down → its error is in the status, nothing lost', await (async () => { const g2 = rig({ nashDown: true }); await W.run({}); const s2 = g2.kv.gc_permit_status.nashville; return !s2.ok && /500/.test(s2.error); })());
  /* the list keeps the newest 1500 */
  ok('the list keeps the newest ' + W._test.KEEP, await (async () => { const g3 = rig(); g3.kv.gc_permit_leads = Array.from({ length: 1600 }, (_, i) => ({ key: 'nashville:OLD' + i, id: 'OLD' + i, src: 'nashville', issued: '2026-01-01', firstSeen: '2026-01-01T00:00:00Z', state: 'new', reasons: ['x'] })); await W.run({}); const l = g3.kv.gc_permit_leads; return l.length === 1500 && l[0].issued > '2026-10-01' && !l.some(x => x.id === 'OLD1599' && false); })());

  /* ── 3. Shovels with a key ── */
  g = rig({ env: { SHOVELS_API_KEY: 'test-key-123' } });
  await D_settings(g, { shovels: { zips: ['38117', '38671', '72201'], maxPerRun: 300 } });
  r = await W.run({ by: 'test' });
  let ss = g.kv.gc_permit_status.shovels;
  const sCalls = g.calls.filter(x => x.host === 'api.shovels.ai');
  ok('with SHOVELS_API_KEY → active: /usage, then /permits/search per ZIP with the X-API-Key header', ss.active === true && sCalls.length >= 4 && sCalls.every(x => x.key === 'test-key-123') && sCalls[0].path === '/v2/usage' && ['38117', '38671', '72201'].every(z => sCalls.some(x => x.path === '/v2/permits/search' && new URLSearchParams(x.q).get('geo_id') === z)), sCalls);
  ok('Shovels search asks permit_from / permit_to (first run = the 14-day window)', (() => { const q = new URLSearchParams(sCalls.find(x => x.path === '/v2/permits/search').q); return q.get('permit_from') === W._test.centralDay(NOW - 14 * 864e5) && q.get('permit_to') === W._test.centralDay(NOW) && +q.get('size') <= 100; })());
  ok('Shovels status: read 6, matched 4 (pool + electrical out), credits shown, ZIPs 3/3, day done', ss.read === 6 && ss.matched === 4 && ss.credits.used === 120 && ss.zipsToday === 3 && ss.dayDone === true && !ss.error, ss);
  const shItems = g.kv.gc_permit_leads.filter(x => x.src === 'shovels');
  ok('Shovels matches stored with the contractor names (one /contractors call)', shItems.length === 4 && shItems.some(x => x.contractor === 'Example Roofing Co') && shItems.some(x => x.contractor === 'Sample Contractors Inc') && sCalls.filter(x => x.path === '/v2/contractors').length === 1, shItems.map(x => x.contractor));
  ok('the hail roof in Memphis → Mitigation, "Roof $15k" + 🌪', shItems.some(x => x.hint === 'mitigation' && x.reasons.includes('Roof $15k') && x.reasons.includes('🌪 storm/hail/wind words')), shItems.map(x => x.reasons));
  /* one run a day */
  const before = g.calls.filter(x => x.host === 'api.shovels.ai').length;
  g.tick(2 * 3600e3);
  r = await W.run({ by: 'test' });
  ss = g.kv.gc_permit_status.shovels;
  ok('a second run the same day does not call Shovels again (credits) and says so', g.calls.filter(x => x.host === 'api.shovels.ai').length === before && ss.skipped === true && /Already ran today/.test(ss.note), ss);
  g.setClock(NOW + 864e5);
  r = await W.run({ by: 'test' });
  ss = g.kv.gc_permit_status.shovels;
  ok('the next day it runs again, with the shorter look-back (7 days), and adds no duplicates', !ss.skipped && ss.window.startsWith(W._test.centralDay(NOW + 864e5 - 7 * 864e5)) && r.added.shovels === 0 && g.kv.gc_permit_leads.filter(x => x.src === 'shovels').length === 4, ss);
  /* the cap */
  g = rig({ env: { SHOVELS_API_KEY: 'k' } });
  await D_settings(g, { shovels: { zips: ['38117', '38671', '72201'], maxPerRun: 10 } });
  g.st.shov = { '38117': Array.from({ length: 30 }, (_, i) => shov({ description: 'remodel ' + i })) };
  await W.run({});
  ss = g.kv.gc_permit_status.shovels;
  ok('max per run is respected (10 read, then it stops; next day starts at the next ZIP)', ss.readToday === 10 && ss.read === 10 && ss.dayDone === true && ss.nextZip === 1, ss);
  /* stop on 401 / 402 / 429 */
  for (const code of [401, 402, 429]) {
    const gx = rig({ env: { SHOVELS_API_KEY: 'k' }, shovelsStatus: code });
    await D_settings(gx, { shovels: { zips: ['38117', '38671', '72201'] } });
    await W.run({});
    const sx = gx.kv.gc_permit_status.shovels;
    const searches = gx.calls.filter(x => x.path === '/v2/permits/search').length;
    ok('Shovels ' + code + ' → stops after the first call, the reason is in the status, Nashville still ran', searches === 1 && sx.code === code && sx.error === W._test.STOP[code] && sx.dayDone === true && gx.kv.gc_permit_status.nashville.ok, { searches, sx });
  }
  { const gx = rig({ env: { SHOVELS_API_KEY: 'k' }, usageStatus: 401 }); await W.run({}); const sx = gx.kv.gc_permit_status.shovels;
    ok('a 401 on /usage stops before any search', sx.code === 401 && !gx.calls.some(x => x.path === '/v2/permits/search')); }
  { const gx = rig({ env: { SHOVELS_API_KEY: 'k' }, usage: { credits_used: 5000, credit_limit: 5000, is_over_limit: true, available_at: '2026-12-01' } }); await W.run({}); const sx = gx.kv.gc_permit_status.shovels;
    ok('credits used up (/usage over the limit) → nothing searched, "until 2026-12-01"', /until 2026-12-01/.test(sx.error) && !gx.calls.some(x => x.path === '/v2/permits/search'), sx); }
  { const gx = rig({ env: { SHOVELS_API_KEY: 'k' } }); await D_settings(gx, { shovels: { on: false } }); await W.run({}); const sx = gx.kv.gc_permit_status.shovels;
    ok('Shovels turned off in ⚙ Filters → not called, "Turned off"', !gx.calls.some(x => x.host === 'api.shovels.ai') && /Turned off/.test(sx.note)); }
  { const gx = rig(); gx.kv.gc_permit_status = { running: { at: new Date(NOW - 30e3).toISOString(), by: 'x' } }; const rr = await W.run({});
    ok('two runs at once: the second one waits ("running right now")', rr.busy === true && !gx.calls.length); }

  /* ── 4. the CRM's calls ── */
  g = rig({ env: { SHOVELS_API_KEY: 'k' } });
  await D_settings(g, { shovels: { zips: ['38117'] } });
  ok('no sign-in → 401', (await act('nobody', { action: 'list' })).code === 401);
  let a = await act('staff', { action: 'run' });
  ok('staff: Run now runs both sources', a.code === 200 && a.body.ok && a.body.status.nashville.ok && a.body.status.shovels.active, a.body);
  a = await act('staff', { action: 'list' });
  ok('staff: list → items, status per source, settings, Shovels active', a.code === 200 && a.body.items.length === want1 + 2 && a.body.status.nashville && a.body.active.shovels === true && a.body.shovelsConfigured === true && a.body.counts.new === want1 + 2, { n: a.body.items && a.body.items.length, active: a.body.active });
  a = await act('staff', { action: 'settings-set', settings: { minValue: 1 } });
  ok('staff cannot change the filters (403)', a.code === 403);
  a = await act('admin', { action: 'settings-set', settings: { minValue: 75000, maxAgeDays: 30, include: { residentialNew: true, multifamily: false }, exclude: ['sign', 'pool'], shovels: { zips: '38117 38138', maxPerRun: 120 } } });
  ok('admin: settings-set is cleaned and stored (who + when)', a.code === 200 && g.kv.gc_permit_settings.minValue === 75000 && g.kv.gc_permit_settings.include.multifamily === false && g.kv.gc_permit_settings.shovels.zips.join() === '38117,38138' && g.kv.gc_permit_settings.updatedBy === 'Ada Admin', g.kv.gc_permit_settings);
  a = await act('staff', { action: 'settings-get' });
  ok('settings round trip: settings-get gives back what was saved + the defaults and the labels', a.body.ok && a.body.settings.minValue === 75000 && a.body.settings.maxAgeDays === 30 && a.body.settings.include.residentialNew === true && a.body.settings.shovels.maxPerRun === 120 && a.body.defaults.minValue === 25000 && a.body.include.length === P.INCLUDE.length, a.body.settings);
  const k0 = g.kv.gc_permit_leads[1].key;
  a = await act('staff', { action: 'set-state', id: k0, state: 'lead', leadId: 'LPMT_abc' });
  ok('set-state lead → state, who, the lead id', a.code === 200 && g.kv.gc_permit_leads[1].state === 'lead' && g.kv.gc_permit_leads[1].leadId === 'LPMT_abc' && g.kv.gc_permit_leads[1].stateBy === 'Pat PM', g.kv.gc_permit_leads[1]);
  a = await act('staff', { action: 'set-state', id: k0, state: 'dismissed' });
  ok('set-state dismissed', a.code === 200 && g.kv.gc_permit_leads[1].state === 'dismissed');
  a = await act('staff', { action: 'set-state', id: k0, state: 'new' });
  ok('set-state new (undo) clears the lead id', a.code === 200 && g.kv.gc_permit_leads[1].state === 'new' && !g.kv.gc_permit_leads[1].leadId);
  ok('set-state with a bad state → 400; unknown id → 404', (await act('staff', { action: 'set-state', id: k0, state: 'won' })).code === 400 && (await act('staff', { action: 'set-state', id: 'nashville:NOPE', state: 'lead' })).code === 404);
  g.tick(5 * 60e3);
  await act('staff', { action: 'run' });
  ok('a later run keeps the person\'s state and does not double the list', g.kv.gc_permit_leads.filter(x => x.key === k0).length === 1 && g.kv.gc_permit_leads.find(x => x.key === k0).state === 'new');
  ok('GET ?ping=1 answers without a sign-in', JSON.parse((await W.handler({ httpMethod: 'GET', queryStringParameters: { ping: '1' }, headers: {} })).body).ok === true);

  /* ── 5. 🔧 Owner setup sees the keys ── */
  const keep = {}; ['SHOVELS_API_KEY', 'GDRIVE_SA_JSON', 'GDRIVE_ROOT_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].forEach(k => { keep[k] = process.env[k]; delete process.env[k]; });
  OS._test.D.sb = async () => ({ ok: false, status: 503, json: async () => null }); OS._test.D.kvGet = async () => null; OS._test.D.fetch = async () => ({ status: 503 });
  let ch = await OS._test.checks();
  ok('owner-setup: shovels_key / gdrive are false without the keys', ch.shovels_key === false && ch.gdrive === false, ch);
  process.env.SHOVELS_API_KEY = 'x'; process.env.GDRIVE_SA_JSON = '{"client_email":"a"}';
  ch = await OS._test.checks();
  ok('owner-setup: shovels_key true with SHOVELS_API_KEY; gdrive needs BOTH GDRIVE_SA_JSON and GDRIVE_ROOT_ID', ch.shovels_key === true && ch.gdrive === false, ch);
  process.env.GDRIVE_ROOT_ID = 'abc';
  ch = await OS._test.checks();
  ok('owner-setup: gdrive true with both', ch.gdrive === true);
  Object.keys(keep).forEach(k => { if (keep[k] == null) delete process.env[k]; else process.env[k] = keep[k]; });
  /* netlify.toml has the daily schedule */
  const toml = require('fs').readFileSync(path.join(__dirname, '../../netlify.toml'), 'utf8');
  ok('netlify.toml schedules permit-watch-scheduled once a day, early morning Central', /\[functions\."permit-watch-scheduled"\]\s*\n\s*schedule = "23 11 \* \* \*"/.test(toml));

  const n = R.filter(Boolean).length; console.log('PERMITS ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
async function D_settings(g, v){ g.kv.gc_permit_settings = P.clean(v); }
