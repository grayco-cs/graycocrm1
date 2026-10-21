// netlify/functions/portal-reminders.js
// GrayCo — FINAL INVOICE E-MAIL + THE FRIENDLY REMINDER EVERY 15 DAYS (patch Q). Estimate follow-ups (patch AUTO5).
// Scheduled in netlify.toml ([functions."portal-reminders"], every hour). Also sends the
// "new papers in your portal" e-mails that are still waiting (see notifyDocs in portal.js).
//
// For every job with a FINAL invoice that is not paid:
//   • the first time: e-mail the customer once — "your final invoice is ready" + the portal link
//     (the invoice is already in the portal by itself);
//   • then every 15 days while it is unpaid: a friendly reminder;
//   • it stops by itself the day the invoice is paid;
//   • a job with "Pause reminders" switched on (project.portalRemindersPaused) is left alone;
//   • no customer e-mail on file, or e-mail not set up (RESEND_API_KEY): no e-mail — ONE Office
//     to-do instead ("Send the final invoice by hand").
// Every send is recorded first in gc_portal_mail (last_reminder_at) and only goes out if this run
// was the one that recorded it, so two runs can never send the same reminder twice.
// PORTAL_MAIL_OFF=1 on Netlify stops every e-mail (to-dos still appear).
// Patch AP2: first, every client invoice made in the CRM (not a draft) gets an "Invoice #… $… to <customer>"
// item on the approvals list: approved, it is e-mailed with the invoice PDF attached.
//
// Netlify does not let anyone call a scheduled function by its URL in production. As a second
// lock, any call that is not the scheduler must come from a signed-in admin.
const portal = require('./portal.js');

const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
function hdr(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* the same staff check as every function, admins only */
async function isAdmin(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return false;
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return false;
    const u = await r.json();
    const email = String((u && u.email) || '').trim().toLowerCase();
    if (!email || !svc) return false;
    const s = await fetch(url + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc } });
    if (!s.ok) return false;
    const rows = await s.json();
    return !!(rows && rows[0] && rows[0].active !== false && String(rows[0].role || '').toLowerCase() === 'admin');
  } catch (e) { return false; }
}
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}

exports.handler = async function (event) {
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!isScheduled(event) && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  try {
    /* patch AP2: every new client invoice gets its PDF e-mail on the approvals list first (a final one then
       counts as the final-invoice e-mail, and the 15-day reminders follow it) */
    let invoiceMail = null;
    try { invoiceMail = await portal._core.queueNewInvoices({}); } catch (e) { invoiceMail = { error: String(e && e.message || e) }; }
    const rep = await portal._core.runReminders({});
    rep.invoiceMail = invoiceMail;
    try { rep.notices = await portal._core.notifyAll({}); } catch (e) { rep.notices = { error: String(e && e.message || e) }; }
    /* patch AUTO5: estimate follow-ups — day 2 (approval), day 5 and day 10 (the approved text, by themselves) */
    try { rep.estFollowups = await require('./portal-sign.js')._ps.runFollowups({}); } catch (e) { rep.estFollowups = { error: String(e && e.message || e) }; }
    try { console.log('[portal-reminders]', JSON.stringify({ sent: rep.sent, reminded: rep.reminded, todos: rep.todos, skipped: rep.skipped, paused: rep.paused })); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(rep) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Could not run the reminders: ' + (e && e.message || e) }) };
  }
};
