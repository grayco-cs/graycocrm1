/* GrayCo — AI photo tags, every 20 minutes (patch X12). Dormant without ANTHROPIC_API_KEY. See _lib/phototag.js. */
'use strict';
const PT = require('./_lib/phototag.js');
exports.handler = async function(){ try { const r = await PT.run({}); console.log('[photo-tag]', JSON.stringify(r)); } catch (e) { console.log('[photo-tag] failed', e && e.message); } return { statusCode: 200, body: 'ok' }; };
