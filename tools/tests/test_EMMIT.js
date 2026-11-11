// test_EMMIT.js — owner 11/11: "Mitigation will do all emergency board-ups and emergency calls": a NEW emergency lead or board-up /
// tarp work is filed under GrayCo Mitigation (companyId 'mitigation'); an ordinary lead stays Construction; a lead already on file is never moved.
const path = require('path');
const BI = require(path.join(__dirname, '../../netlify/functions/bid-inbox.js'))._lib;
const kv = {}; let items = [];
BI.kvCas = async (k, f) => { const nv = f(JSON.parse(JSON.stringify(items))); if (nv !== undefined) items = nv; return { ok: true }; };
BI.routeLead = async () => null;
const WI = require(path.join(__dirname, '../../netlify/functions/website-intake.js'))._lib;
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
const f = (name, msg) => ({ name, phone: '9015550111', email: '', message: msg || '' });
(async () => {
  const of = id => (items.find(x => x && x.id === id) || {}).companyId || '';
  let r = await WI.fileLead(f('Ann', 'kitchen remodel quote'), { sid: 's1', source: 'Website', title: 'Website — Ann' });
  ok('an ordinary new lead stays Construction (no company set)', !of(r.id), of(r.id));
  r = await WI.fileLead(f('Bob', 'pipe burst'), { sid: 's2', source: 'Missed call', title: '🚨 EMERGENCY call — Bob', patch: { emergency: true, urgency: 'Emergency' } });
  ok('a new emergency call → GrayCo Mitigation', of(r.id) === 'mitigation', of(r.id));
  r = await WI.fileLead(f('Cy', 'need a board up after break-in'), { sid: 's3', source: 'Website', title: 'Website — Cy — board-up' });
  ok('board-up work → GrayCo Mitigation', of(r.id) === 'mitigation', of(r.id));
  r = await WI.fileLead(f('Ann', 'kitchen remodel quote'), { sid: 's1', source: 'Website', title: 'Website — Ann — EMERGENCY', patch: { emergency: true } });
  ok('a lead already on file is never moved', !of(r.id), of(r.id));
  const n = R.filter(Boolean).length; console.log('EMMIT ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
