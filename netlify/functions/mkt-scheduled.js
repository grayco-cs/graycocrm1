// netlify/functions/mkt-scheduled.js — GrayCo 📣 Marketing (patch MKT), every 15 minutes (netlify.toml):
//   1. the approvals list → the marketing records (a rejected draft is marked rejected)
//   2. approved posts whose time came are posted; approved news@ campaigns whose time came are sent
//      (unsubscribed skipped; nothing at all when the unsubscribe list cannot be read)
//   3. Autopilot (when on): this week's posts, this month's e-mail, door-hanger lists for finished jobs, new Google
//      reviews → reply drafts + thank-you posts. Every draft goes to Approvals; nothing goes out by itself.
//   4. once a day: likes / reach / clicks of recent posts.
//   5. patch SOC: Sunday → next week's Mon / Wed / Fri plan (when on); stage 3 → the office's "posting tomorrow" list; Friday → the admins' digest.
// A scheduled function cannot be called by its URL in production.
'use strict';
const L = require('./_lib/mkt.js');
exports.handler = async function(){
  const out = {};
  try { out.due = await L.runDue({ budgetMs: 17000 }); } catch (e) { out.dueError = String(e && e.message || e); }
  try { out.autopilot = await L.autopilot({}); } catch (e) { out.autopilotError = String(e && e.message || e); }
  try { out.soc = await require('./_lib/soc.js').scheduled({}); } catch (e) { out.socError = String(e && e.message || e); }   /* patch SOC: Sunday plan, posting-tomorrow list, Friday digest */
  try { const h = new Date().getUTCHours(), m = new Date().getUTCMinutes(); if (h === 12 && m < 15) out.insights = await L.refreshInsights(); } catch (e) {}
  return { statusCode: 200, body: JSON.stringify(out) };
};
