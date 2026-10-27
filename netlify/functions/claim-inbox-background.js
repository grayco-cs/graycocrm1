/* GrayCo — the claim inbox's slow half (patch BB). A Netlify BACKGROUND function: answers 202 at once and may
   run up to 15 minutes, so reading a long estimate PDF with Claude never makes Resend time out and retry.
   It only accepts work handed to it by claim-inbox.js (signed with the inbox secret). */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
exports.handler = require('./claim-inbox.js').backgroundHandler;
