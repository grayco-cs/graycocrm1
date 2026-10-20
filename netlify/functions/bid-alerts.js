/* ============================================================================
   GrayCo — THE ADMINS' HOURLY BID DIGEST.   netlify/functions/bid-alerts.js   (patch LD2)

   A Netlify SCHEDULED function (netlify.toml: every hour at :11). It:
     1. e-mails the admins ONE digest of the new bid opportunities that are still waiting
        (bids due soon were already e-mailed the moment they arrived — _lib/bid-alerts.js);
     2. creates the bid-portal drafts that waited because the portal was not set up yet
        (_lib/bid-portal.js; once docs/subportal-setup.sql has run they appear within the hour).
   Nothing waiting → nothing sent. A scheduled function cannot be called by its URL in production.
   ========================================================================== */
'use strict';
const L = require('./bid-inbox.js')._lib;

async function run(){
  const out = { at: L.nowIso() };
  try { out.digest = await L.alertsApi().digest(); } catch (e) { out.digest = { error: L.s(e && e.message) }; }
  out.portalQueue = await L.flushPortal();
  return out;
}
exports.handler = async function(){
  if (!L.dbReady()) return { statusCode: 500, body: JSON.stringify({ error: 'Supabase is not configured on Netlify.' }) };
  const out = await run();
  console.log('[bid-alerts] ' + JSON.stringify({ sent: out.digest && out.digest.sent, why: out.digest && out.digest.why, drafts: out.portalQueue && out.portalQueue.created, waiting: out.portalQueue && out.portalQueue.left }));
  return { statusCode: 200, body: JSON.stringify(out) };
};
exports.run = run;
