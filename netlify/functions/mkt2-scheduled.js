// netlify/functions/mkt2-scheduled.js — GrayCo Marketing part 2, every hour (patch MKT2; netlify.toml schedule):
//   * once a day (from 6 AM Central): pull Google Ads + Facebook / Instagram numbers into the Marketing records;
//   * this month's newsletter draft (once a month, never over an edited one; Admin can turn it off);
//   * thank-you to-dos: each December the top referrers / partners (gift suggestions + addresses), and partner / customer milestones;
//   * free roof check reminders the day before (only events whose reminders an admin approved; from 9 AM Central).
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const X = require('./_lib/mkt2.js');
function ctHour(){ return +new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }) % 24; }
exports.handler = async function(){
 try { await require('./_lib/brand.js').addressReady(); } catch (e) {}   /* patch ADDRALL: the saved company address before anything is made */
  const out = {};
  try {
    const st = await X.adsStatus(), h = ctHour();
    const due = ['google', 'meta'].some(function(p){ return st[p].connected && (!st[p].lastSync || Date.now() - Date.parse(st[p].lastSync) > 20 * 3600e3); });
    if (due && h >= 6) out.ads = await X.syncAds({ days: 30 });
  } catch (e) { out.adsError = String(e && e.message || e).slice(0, 200); }
  try { out.newsletter = await X.ensureNewsletter({}); } catch (e) { out.newsletterError = String(e && e.message || e).slice(0, 200); }
  try { if (ctHour() >= 10) out.thanks = await X.thankYous({ officeTodo: require('./portal.js')._core.officeTodo }); } catch (e) { out.thanksError = String(e && e.message || e).slice(0, 200); }
  try { if (ctHour() >= 9) out.events = await X.eventReminders(); } catch (e) { out.eventsError = String(e && e.message || e).slice(0, 200); }
  return { statusCode: 200, body: JSON.stringify(out) };
};
