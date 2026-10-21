/* ============================================================================
   GrayCo — BID-DUE REMINDERS AND LEAD ALERTS, EVERY 10 MINUTES.   netlify/functions/bid-alerts.js
   (patch LD2, changed by patch LA: there is no hourly digest any more)

   A Netlify SCHEDULED function (netlify.toml: every 10 minutes). Each run:
     1. "⏰ Bid due in 1 hour: …" — one e-mail (+ phone push) for every lead whose bid is due 50–70
        minutes from now, and "⏰ Bid due TODAY: …" at 8:00 AM Central for a lead with a date and no
        time. It reads the CRM's own lead list (gc_kv "leads": the due date someone typed on the lead,
        won / lost / deleted / converted / not bidding) and the Lead Inbox (bids no CRM has collected
        yet). Recorded, so each is sent once (_lib/bid-alerts.js remind);
        The assigned estimator / PM gets these too, and "⏰ Bid due tomorrow" at 8 AM the day before;
        "⚠️ Missing due info" once a day for bids assigned to them marked "Unknown yet" (patch LA);
        "Assigned to you" for a lead given to someone in the CRM that no page reported yet;
     2. RoofScout → GrayCo lead: new RoofScout leads since the last run — one e-mail each (a scan that
        saved more than 3 at once: one e-mail listing them);
     3. a new-lead e-mail that could not be sent (Resend down) is tried again, for 24 hours;
     4. creates the bid-portal drafts that waited because the portal was not set up yet (_lib/bid-portal.js).
   New leads from bids@, the bid watchers and the website are e-mailed the moment they arrive, by
   bid-inbox.js / bid-watch.js / lead-intake.js — not here. Nothing due → nothing sent.
   A scheduled function cannot be called by its URL in production.
   ========================================================================== */
'use strict';
const L = require('./bid-inbox.js')._lib;

function parse(v){ if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) {} } return v; }
/* the CRM's lead list and its delete marks (gc_kv, written by the CRM's sync) */
async function crmLeads(){
  try {
    const r = await L.sb('gc_kv?select=key,value&key=in.(leads,gc_tombstones,users)');
    if (!r.ok) return { leads: [], tombs: {}, why: 'gc_kv answered ' + r.status };
    const rows = await r.json(); const o = {};
    (Array.isArray(rows) ? rows : []).forEach(x => { o[x.key] = parse(x.value); });
    let leads = o.leads; if (leads && !Array.isArray(leads) && Array.isArray(leads.v)) leads = leads.v;
    let users = o.users; if (users && !Array.isArray(users) && Array.isArray(users.v)) users = users.v;
    return { leads: Array.isArray(leads) ? leads : [], tombs: o.gc_tombstones && typeof o.gc_tombstones === 'object' ? o.gc_tombstones : {}, users: Array.isArray(users) ? users : [] };
  } catch (e) { return { leads: [], tombs: {}, why: 'gc_kv unreachable' }; }
}
async function run(){
  const out = { at: L.nowIso() };
  const A = L.alertsApi();
  try {
    const crm = await crmLeads(), items = await L.kvGet(L.KV);
    out.remind = await A.remind({ leads: crm.leads, items: Array.isArray(items) ? items : [], tombs: crm.tombs, users: crm.users });
    if (crm.why) out.remind.crmWhy = crm.why;
  } catch (e) { out.remind = { error: L.s(e && e.message) }; }
  try { out.roofscout = await A.sweepRoofScout(); } catch (e) { out.roofscout = { error: L.s(e && e.message) }; }
  try { out.retry = await A.retry(); } catch (e) { out.retry = { error: L.s(e && e.message) }; }
  out.portalQueue = await L.flushPortal();
  return out;
}
exports.handler = async function(){
  if (!L.dbReady()) return { statusCode: 500, body: JSON.stringify({ error: 'Supabase is not configured on Netlify.' }) };
  const out = await run();
  console.log('[bid-alerts] ' + JSON.stringify({ reminders: out.remind && out.remind.sent, roofscout: out.roofscout && out.roofscout.sent, retried: out.retry && out.retry.sent,
    drafts: out.portalQueue && out.portalQueue.created, waiting: out.portalQueue && out.portalQueue.left }));
  return { statusCode: 200, body: JSON.stringify(out) };
};
exports.run = run;
exports._crmLeads = crmLeads;
