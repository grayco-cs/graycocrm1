// netlify/functions/auto-wins.js — the owner's automation quick wins, run every hour (netlify.toml).
//   Each part acts only at its own time (Central) and claims that morning's marker first, so it runs once:
//     AUTO-AR      past-due reminders → the approvals list            every day, first run after 7 AM
//     AUTO-PAY     payroll draft check: is Friday's draft there? (the CRM makes it from 6 AM)   Thursday 10 AM
//     AUTO-LIEN    sub lien waivers, only for subs / jobs turned ON (default off)              every run
//     AUTO-DIGEST  each approver's e-mail + phone push: what waits on them (links open the CRM)  Mon–Sat, first run after 7 AM
//     AUTO-SCORE   the owner scorecard e-mail to Wesley and Nick (last week)                  Monday, first run after 7 AM
//     APPR-NOON    approvals still waiting + 📋 Approvals not opened today → push, e-mail, ASAP To-Do  Mon–Fri, first run after 12 PM
//     TAXALERTS    tax deadlines: 7 days before, the due day, daily while overdue → e-mail + push (+ text)   every day, first run after 8 AM
//   (more parts are added below as they are built). Nothing here sends to a customer, sub or GC by itself.
// A signed-in admin may call it to run one part now: POST { part: 'ar', force: true }.
// patch OFFICEFIX: the hourly schedule is auto-wins-scheduled.js (netlify.toml). A scheduled function cannot be called by
//   its URL in production — Netlify answered every CRM call here 403 (the 📋 Approvals "opened today" stamp and the
//   office's "who checked Approvals today" never reached this code). This file has no schedule now, so the CRM's calls
//   arrive, and every call needs a CRM sign-in (no "scheduled" door by URL).
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const A = require('./_lib/auto-common.js');
const PARTS = [
  { key: 'ar', lib: './_lib/auto-ar.js', when: function(c){ return c.hour >= 7 && c.hour < 13; }, marker: function(c){ return 'ar:' + c.ymd; } },
  { key: 'pay', lib: './_lib/auto-pay.js', when: function(c){ return c.wd === 'Thu' && c.hour >= 10 && c.hour < 16; }, marker: function(c){ return 'pay:' + c.ymd; } },
  { key: 'lien', lib: './_lib/lien.js', when: function(){ return true; }, marker: null },
  { key: 'digest', lib: './_lib/auto-digest.js', when: function(c){ return c.wd !== 'Sun' && c.hour >= 7 && c.hour < 12; }, marker: function(c){ return 'digest:' + c.ymd; } },
  { key: 'score', lib: './_lib/auto-score.js', when: function(c){ return c.wd === 'Mon' && c.hour >= 7 && c.hour < 12; }, marker: function(c){ return 'score:' + c.ymd; } },
  /* patch SUBPHOTOS: 12 PM business days — approvals still waiting and 📋 Approvals not opened today → push + e-mail + ASAP To-Do */
  { key: 'apprnoon', lib: './_lib/appr-noon.js', when: function(c){ return /^(Mon|Tue|Wed|Thu|Fri)$/.test(c.wd) && c.hour >= 12 && c.hour < 17; }, marker: function(c){ return 'apprnoon:' + c.ymd; } },
  /* patch TAXALERTS: every day, the first run at / after 8 AM Central (8:19) — tax deadlines 7 days before, on the day, and every day
     while overdue, to the admins + the office (an owner's own estimated tax: admins only). Each stage once (_lib/taxalerts.js). */
  { key: 'tax', lib: './_lib/taxalerts.js', when: function(c){ return c.hour >= 8 && c.hour < 20; }, marker: function(c){ return 'taxrun:' + c.ymd; } }
  /* AUTO-PARTS */
];
/* patch AUTOPANEL: the ⚡ Automations switch of each part (an admin's forced run is a person's action) */
const AUTO_KEY = { ar: 'ar_reminders', pay: 'payroll_check', lien: 'lien_waiver_requests', digest: 'approvals_digest', score: 'approvals_digest', apprnoon: 'approvals_digest', tax: 'tax_alerts' };
async function runParts(opts){
  opts = opts || {};
  await A.loadStaff();   /* patch OFFICEFIX: staff e-mail = @grayco-cs.com or a gc_staff staff e-mail (one read per run) */
  const now = opts.now != null ? opts.now : Date.now(), c = A.central(now), out = { at: new Date(now).toISOString(), central: c };
  for (const P of PARTS) {
    if (opts.part && opts.part !== P.key) continue;
    try {
      if (!opts.force) {
        if (!P.when(c)) { out[P.key] = 'not now'; continue; }
        { const h = await require('./_lib/automations.js').gate(AUTO_KEY[P.key] || 'approvals_digest'); if (h) { out[P.key] = h; continue; } }   /* patch AUTOPANEL */
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
  {
    const who = await A.core().gcStaffAuth(event);
    /* patch AUTHFIX: a sign-in problem answers as itself — no token / expired 401, sign-in service down 503, not staff 403.
       Before, every one of them came back "403 Admins only." (an expired token on the owner's computer read as a refusal) */
    if (!who.ok) return { statusCode: who.statusCode || 401, headers, body: JSON.stringify({ ok: false, error: who.error || 'Sign in to the GrayCo CRM first.' }) };
    const SR = require('./_lib/staff-role.js'), admin = SR.isAdmin(who);   /* the one rule: an owner counts as an admin */
    /* patch SUBPHOTOS: any staff member stamps "I opened 📋 Approvals"; the office / admins read who checked today */
    if (body.action === 'appr-seen') { await A.loadStaff(); return { statusCode: 200, headers, body: JSON.stringify({ ok: await require('./_lib/appr-noon.js').stamp(who.email) }) }; }
    if (body.action === 'appr-seen-list') {
      /* patch OFFICEFIX: the one rule (_lib/office-access.js officeOrAdmin → staff-role.isOfficeOrAdmin) */
      let office = false; try { office = await require('./_lib/office-access.js').officeOrAdmin(who); } catch (e) { office = admin; }
      if (!office) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Only the office and the admins see who checked 📋 Approvals today.' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: await require('./_lib/appr-noon.js').seenRows({}) }) };
    }
    if (!admin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Only an admin runs the automations by hand.' }) };
    const out = await runParts({ part: A.s(body.part), force: body.force === true });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: out }) };
  }
};
exports._run = runParts;
