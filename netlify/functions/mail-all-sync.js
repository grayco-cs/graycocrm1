// netlify/functions/mail-all-sync.js — patch MAILALL: every 15 minutes (netlify.toml) — the new e-mail in every GrayCo
// mailbox since the last look (Gmail historyId), metadata only, into the "🌐 All GrayCo e-mail" index. Does nothing until
// GOOGLE_SA_EMAIL / GOOGLE_SA_KEY are set (docs/EMAIL-ALL.md). A scheduled function has no public URL.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
exports.handler = async function(){
  try {
    const r = await require('./mail-all.js').runSync({ budgetMs: 22000 });
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (e) { return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) }; }
};
