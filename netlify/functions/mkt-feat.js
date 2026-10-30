// netlify/functions/mkt-feat.js — patch MKTFEAT: the marketing features' own clock, every hour (netlify.toml).
//   Each part acts only at its own time (Central) and claims that day's / week's marker first, so it runs once:
//     ba      before / after post DRAFTS from jobs finished in the last 45 days (shared photos only)  every day, first run after 9 AM
//     rank    the Google ranking check (Search Console, average position per search)              Monday, first run after 6 AM
//     report  the owner's monthly marketing report (last month) to the admins picked in Marketing   the 1st, from 8 AM (a failed send retries)
//   Nothing here posts, sends to a customer or spends: drafts wait in 📣 Marketing → Social posts for the Marketing Manager / the office,
//   and go through ✅ Approvals like every post. ⏸ Data-entry mode: no drafts (the report goes to staff addresses only).
//   (The 30–90 day lost-lead follow-ups run with the win-back, netlify/functions/winback.js.)
// A signed-in admin may call it to run one part now: POST { part: 'ba' | 'rank' | 'report', force: true }. GET ?ping=1 → alive.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const F = require('./_lib/mktfeat.js');
function isScheduled(event){ try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; } }
function isoWeek(ymd){ const d = new Date(ymd + 'T12:00:00Z'), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4)); return y + '-W' + String(1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0'); }
const PARTS = [
  { key: 'ba', when: function(c){ return c.hour >= 9 && c.hour < 18; }, marker: function(c){ return 'ba:' + c.ymd; }, run: function(o){ return F.runBeforeAfter(o); } },
  { key: 'rank', when: function(c){ return c.wd === 'Mon' && c.hour >= 6; }, marker: function(c){ return 'rank:' + isoWeek(c.ymd); }, run: function(o){ return F.runRank(o); } },
  { key: 'report', when: function(c){ return c.day === 1 && c.hour >= 8; }, marker: null, run: function(o){ return F.runReport(o); } }   /* runReport keeps its own once-a-month record */
];
/* a marker once (true = this run owns it), kept in the features' own state */
async function once(id){
  let mine = false;
  const L = require('./bid-inbox.js')._lib;
  await L.kvCas(F.KS, function(v){ v = v && typeof v === 'object' ? v : {}; v.marks = v.marks && typeof v.marks === 'object' ? v.marks : {}; if (v.marks[id]) return undefined;
    v.marks[id] = new Date().toISOString(); const ks = Object.keys(v.marks).sort(function(a, b){ return v.marks[a] < v.marks[b] ? -1 : 1; }); ks.slice(0, Math.max(0, ks.length - 120)).forEach(function(k){ delete v.marks[k]; }); mine = true; return v; });
  return mine;
}
async function runParts(opts){
  opts = opts || {};
  const now = opts.now != null ? opts.now : Date.now(), c = F.central(now), out = { at: new Date(now).toISOString(), central: c };
  for (const P of PARTS) {
    if (opts.part && opts.part !== P.key) continue;
    try {
      if (!opts.force) {
        if (!P.when(c)) { out[P.key] = 'not now'; continue; }
        if (P.marker && !(await once(P.marker(c)))) { out[P.key] = 'done already'; continue; }
      }
      out[P.key] = await P.run({ now: now, force: !!opts.force });
    } catch (e) { out[P.key] = { error: String(e && e.message || e).slice(0, 200) }; }
  }
  return out;
}
exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const qs = event.queryStringParameters || {};
  if (qs.ping === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, service: 'GrayCo marketing features' }) };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!isScheduled(event)) {
    const who = await require('./portal.js')._core.gcStaffAuth(event);
    if (!who.ok || who.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
    const out = await runParts({ part: String(body.part || ''), force: body.force === true });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: out }) };
  }
  const out = await runParts({});
  try { console.log('[mkt-feat]', JSON.stringify(out).slice(0, 600)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: out }) };
};
exports._run = runParts;
exports._isoWeek = isoWeek;
