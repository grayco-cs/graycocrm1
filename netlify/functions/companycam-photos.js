/* ── CompanyCam photos → the GrayCo Photos index, on the server, every 15 minutes (patch CCPHOTOS) ─────────────────────
   "make sure all company cam photos that come in are very low storage small files and they are all in my grayco photos by
   the morning". Every photo of every CompanyCam project a CRM job or lead is linked to is listed in gc_kv (ccidx:<project>,
   the summary ccidx) with CompanyCam's own small links — no picture is copied. See _lib/cc-photos.js.
   This scheduled run has ~18 seconds; when more is waiting (the first backfill after a deploy, a big project, an admin's
   "⟳ Index all photos now") it hands the rest to companycam-photos-background (up to ~13 minutes), which keeps its place in
   gc_kv ccidx_state. CompanyCam is read only (data-entry mode does not stop reads). Needs COMPANYCAM_TOKEN and
   SUPABASE_SERVICE_KEY. Never logs or stores the token. Answers only its schedule. */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const CP = require('./_lib/cc-photos.js');

exports.handler = async function(){
  let r = null;
  try {
    r = await CP.run({ who: 'schedule', budgetMs: Math.min(18000, +process.env.CC_PHOTO_SCHED_MS || 18000) });
    if (r.more && !r.waiting && !r.busy && !r.skipped && r.ok !== false) r.handedOff = await CP.kickBackground('schedule');
    try { console.log('[companycam-photos] ' + JSON.stringify({ ok: r.ok, skipped: r.skipped, projects: r.projects, photos: r.photos, calls: r.calls, queue: r.queue, stop: r.stop, handedOff: r.handedOff })); } catch (e) {}
    return { statusCode: 200, body: JSON.stringify({ ok: r.ok !== false, projects: r.projects, photos: r.photos, queue: r.queue, handedOff: !!r.handedOff }) };
  } catch (e) {
    console.log('[companycam-photos] failed: ' + String(e && e.message || e).replace(/Bearer\s+\S+/gi, 'Bearer ...').slice(0, 200));
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }
};
exports._t = { run: CP.run };
