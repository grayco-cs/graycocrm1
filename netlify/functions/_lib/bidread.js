// netlify/functions/_lib/bidread.js — patch SUBSIMPLE (owner 11/20): "they also have to type in the price when they enter pdf so my
// system can make sure to at minimum read the price but i want to read the entire pdf too and extract info from it to make sure all
// inclusions or exclusions are noted in our bid".
// A sub's bid PDF is read with the same document reader the CRM uses for W-9s / COIs (_lib/ai.js, as sub-doc-read.js): the total,
// what is included / not included, the scope items, alternates / options, clarifications / qualifications, how long the price is good
// for, and the schedule / lead time. The read total is compared with the price the sub typed: a difference is FLAGGED for GrayCo
// (never blocks the sub). A failed read keeps the bid ("Not read yet — 📄 Read" for staff in the CRM).
// What is read is GrayCo's: it goes on the bid record (the CRM's 📨 Sub bids) — never to another sub.
'use strict';
const AI = require('./ai.js');

function s(v){ return v == null ? '' : String(v).trim(); }
function clip(v, n){ const t = s(v).replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function money(v){ if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, '')); return isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null; }
function list(v, n){ return (Array.isArray(v) ? v : s(v) ? [v] : []).map(function(x){ return x && typeof x === 'object' ? [x.item || x.desc || x.description || x.text || '', money(x.amount) != null ? '$' + money(x.amount).toLocaleString('en-US') : ''].filter(Boolean).join(' — ') : x; })
  .map(function(x){ return clip(x, 300); }).filter(Boolean).slice(0, n || 40); }

const LISTS = ['inclusions', 'exclusions', 'scopeItems', 'alternates', 'clarifications'];
const TOOL = { name: 'read_sub_bid', description: 'What a subcontractor\'s bid / proposal / quote PDF says.',
  input_schema: { type: 'object', properties: {
    total: { type: ['number', 'null'], description: 'The bid\'s total / base bid price in US dollars (null when the document has none).' },
    inclusions: { type: 'array', items: { type: 'string' }, description: 'Everything the bid says is INCLUDED.' },
    exclusions: { type: 'array', items: { type: 'string' }, description: 'Everything the bid says is NOT included / excluded / by others.' },
    scopeItems: { type: 'array', items: { type: 'string' }, description: 'The line items / scope of work, with quantity and price when shown.' },
    alternates: { type: 'array', items: { type: 'string' }, description: 'Alternates, options, add / deduct prices, unit prices.' },
    clarifications: { type: 'array', items: { type: 'string' }, description: 'Clarifications, qualifications, assumptions, conditions, payment terms.' },
    validity: { type: 'string', description: 'How long the price is good for / the expiration date, as written.' },
    schedule: { type: 'string', description: 'Schedule, duration, start availability or material lead time, as written.' } },
    required: ['total', 'inclusions', 'exclusions'] } };
const PROMPT = 'This is a subcontractor\'s bid for a construction job. Read the WHOLE document and call read_sub_bid with what it says. ' +
  'Copy each inclusion, exclusion, alternate and clarification as its own short item, in the document\'s words. Do not invent anything; leave a list empty when the document has none.';

/* the read → the record kept on the bid */
function normalize(out, typed){
  const o = out && typeof out === 'object' ? out : {};
  const r = { status: 'read', at: new Date().toISOString(), total: money(o.total), validity: clip(o.validity, 200), schedule: clip(o.schedule, 300) };
  LISTS.forEach(function(k){ r[k] = list(o[k]); });
  Object.assign(r, compare(r.total, typed));
  return r;
}
/* "⚠ Price on the PDF $X ≠ typed $Y" — more than a dollar apart (cents and rounding are not a difference) */
function compare(pdfTotal, typed){
  const a = money(pdfTotal), b = money(typed);
  if (a == null) return { mismatch: false, noTotal: true, typed: b };
  return { mismatch: b != null && Math.abs(a - b) > 1, typed: b };
}
function flagText(r){ return r && r.mismatch ? '⚠ Price on the PDF $' + r.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ≠ typed $' + (r.typed || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; }

/* buf = the PDF; typed = the price the sub typed. Never throws: { status: 'read', … } or { status: 'failed', why } */
async function read(buf, typed, opt){
  opt = opt || {};
  if (!buf || !buf.length) return { status: 'failed', at: new Date().toISOString(), why: 'The PDF is empty.' };
  if (buf.length > 20 * 1024 * 1024) return { status: 'failed', at: new Date().toISOString(), why: 'The PDF is over 20 MB.' };
  if (!AI.ready()) return { status: 'failed', at: new Date().toISOString(), why: 'The document reader is not set up (ANTHROPIC_API_KEY).' };
  const r = await AI.ask({ tool: TOOL, maxTokens: 3000, effort: 'low', timeoutMs: opt.timeoutMs || 15000,
    content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }, { type: 'text', text: PROMPT }] });
  if (!r.ok || !r.out) return { status: 'failed', at: new Date().toISOString(), why: clip(r.why || 'The reader gave no answer.', 200) };
  return Object.assign(normalize(r.out, typed), { file: clip(opt.name, 160) });
}

module.exports = { read: read, normalize: normalize, compare: compare, flagText: flagText, TOOL: TOOL, LISTS: LISTS };
