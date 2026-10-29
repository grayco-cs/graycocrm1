// netlify/functions/go.js — GrayCo tracked links (patch MKT2): crm.grayco-cs.com/go/<code> (netlify.toml rewrites it here).
//   A link made in Marketing → 🔗 Tracked links & QR → its page with the UTM tags + gc=<code> (so the website form
//   tells the CRM where the lead came from); a referral partner's code → the website with ?ref=<code>.
//   Each human click is counted (service-only store). An unknown code goes to the website's home page.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const X = require('./_lib/mkt2.js');
function home(){ return (process.env.WEBSITE_URL || 'https://grayco-cs.com').replace(/\/$/, '') + '/'; }
exports.handler = async function(event){
  const q = event.queryStringParameters || {};
  let code = String(q.c || '').split('/')[0];
  if (!code) { const m = /\/go\/([^/?#]+)/.exec(String(event.path || event.rawUrl || '')); if (m) code = decodeURIComponent(m[1]); }
  /* patch AUTOC 3: a review-request link (go/rv-<code>) — the click is noted (no reminder then), on to the review page */
  if (/^rv-[A-Za-z0-9]{8,16}$/.test(code)) {
    let page = 'https://grayco-cs.com/review'; try { page = await require('./_lib/reviewreq.js').click(code); } catch (e) {}
    return { statusCode: 302, headers: { Location: page, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' }, body: '' };
  }
  code = X.cleanCode(code);
  let to = home();
  if (code) {
    try {
      const doc = await require('./_lib/mkt.js').readDoc();
      const t = X.linkTarget(doc, code);
      if (t) { to = t.url; try { await X.countClick(code, (event.headers || {})['user-agent'] || ''); } catch (e) {} }
    } catch (e) {}
  }
  return { statusCode: 302, headers: { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' }, body: '' };
};
