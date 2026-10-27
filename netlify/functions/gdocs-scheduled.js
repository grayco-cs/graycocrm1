// netlify/functions/gdocs-scheduled.js — patch GDOCS: every 15 minutes (netlify.toml) — the new Google Docs in every
// staff member's Drive since their last read (netlify/functions/_lib/gdocs.js). Read only. Does nothing until Google is
// connected (docs/GDOCS.md). A scheduled function has no public URL.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
exports.handler = async function(){
  try {
    const r = await require('./_lib/gdocs').run({ budgetMs: 22000 });
    return { statusCode: 200, body: JSON.stringify({ ok: r.ok, added: r.added || 0, off: !!r.off }) };
  } catch (e) { return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
