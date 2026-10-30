/* GrayCo — the CompanyCam photo index's long half (patch CCPHOTOS). A Netlify BACKGROUND function: answers 202 at once and
   may run up to 15 minutes, so the first backfill (every page of every linked project) and an admin's "⟳ Index all photos now"
   finish in one go instead of 18 seconds every 15 minutes. It only accepts work handed to it by companycam-photos or by the
   CRM's companycam-webhook (?proxy=photoindex, admins / office) — signed with a key made from SUPABASE_SERVICE_KEY.
   It works ~13 minutes, keeps its place in gc_kv ccidx_state, and the next scheduled run hands it the rest. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const CP = require('./_lib/cc-photos.js');

exports.handler = async function(event){
  if (!event || event.httpMethod !== 'POST' || !CP.handoffOk(event.headers || {})) return { statusCode: 401, body: JSON.stringify({ error: 'Not from the CompanyCam photo index.' }) };
  try {
    const r = await CP.run({ who: 'background', budgetMs: 13 * 60 * 1000 });
    try { console.log('[companycam-photos-background] ' + JSON.stringify({ ok: r.ok, skipped: r.skipped, projects: r.projects, photos: r.photos, calls: r.calls, queue: r.queue, stop: r.stop })); } catch (e) {}
    return { statusCode: 200, body: JSON.stringify({ ok: r.ok !== false, projects: r.projects, queue: r.queue }) };
  } catch (e) {
    console.log('[companycam-photos-background] failed: ' + String(e && e.message || e).replace(/Bearer\s+\S+/gi, 'Bearer ...').slice(0, 200));
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }
};
