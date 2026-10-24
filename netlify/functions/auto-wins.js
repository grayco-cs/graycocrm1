// netlify/functions/auto-wins.js — the owner's automation quick wins, run every hour (netlify.toml).
//   Each part acts only at its own time (Central) and claims that morning's marker first, so it runs once:
//     AUTO-AR      past-due reminders → the approvals list            every day, first run after 7 AM
//     AUTO-PAY     payroll draft check: is Friday's draft there? (the CRM makes it from 6 AM)   Thursday 10 AM
//     AUTO-LIEN    sub lien waivers, only for subs / jobs turned ON (default off)              every run
//     AUTO-DIGEST  each approver's e-mail + phone push: what waits on them (links open the CRM)  Mon–Sat, first run after 7 AM
//     AUTO-SCORE   the owner scorecard e-mail to Wesley and Nick (last week)                  Monday, first run after 7 AM
//   (more parts are added below as they are built). Nothing here sends to a customer, sub or GC by itself.
// A signed-in admin may call it to run one part now: POST { part: 'ar', force: true }.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const A = require('./_lib/auto-common.js');
const PARTS = [
  { key: 'ar', lib: './_lib/auto-ar.js', when: function(c){ return c.hour >= 7 && c.hour < 13; }, marker: function(c){ return 'ar:' + c.ymd; } },
  { key: 'pay', lib: './_lib/auto-pay.js', when: function(c){ return c.wd === 'Thu' && c.hour >= 10 && c.hour < 16; }, marker: function(c){ return 'pay:' + c.ymd; } },
  { key: 'lien', lib: './_lib/lien.js', when: function(){ return true; }, marker: null },
  { key: 'digest', lib: './_lib/auto-digest.js', when: function(c){ return c.wd !== 'Sun' && c.hour >= 7 && c.hour < 12; }, marker: function(c){ return 'digest:' + c.ymd; } },
  { key: 'score', lib: './_lib/auto-score.js', when: function(c){ return c.wd === 'Mon' && c.hour >= 7 && c.hour < 12; }, marker: function(c){ return 'score:' + c.ymd; } }
  /* AUTO-PARTS */
];
function isScheduled(event){ try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; } }
async function runParts(opts){
  opts = opts || {};
  const now = opts.now != null ? opts.now : Date.now(), c = A.central(now), out = { at: new Date(now).toISOString(), central: c };
  for (const P of PARTS) {
    if (opts.part && opts.part !== P.key) continue;
    try {
      if (!opts.force) {
        if (!P.when(c)) { out[P.key] = 'not now'; continue; }
        if (P.marker && !(await A.once(P.marker(c)))) { out[P.key] = 'done already'; continue; }
      }
      out[P.key] = await require(P.lib).run({ now: now });
    } catch (e) { out[P.key] = { error: String(e && e.message || e) }; }
  }
  return out;
}
exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!isScheduled(event)) {
    const who = await A.core().gcStaffAuth(event);
    if (!who.ok || who.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
    const out = await runParts({ part: A.s(body.part), force: body.force === true });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: out }) };
  }
  const out = await runParts({});
  try { console.log('[auto-wins]', JSON.stringify(out).slice(0, 600)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: out }) };
};
exports._run = runParts;
