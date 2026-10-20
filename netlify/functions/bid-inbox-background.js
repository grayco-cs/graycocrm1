/* GrayCo — the bid inbox's slow half (patch LD). A Netlify BACKGROUND function (the name ends in
   -background): it answers 202 at once and may run for up to 15 minutes, so reading a long set of
   plans with Claude never makes Resend time out and retry, and a by-hand run of the public bid
   watcher can take its time. It only accepts work handed to it by bid-inbox.js (signed with the
   inbox secret). All the code is in bid-inbox.js and bid-watch.js. */
'use strict';
exports.handler = require('./bid-inbox.js').backgroundHandler;
