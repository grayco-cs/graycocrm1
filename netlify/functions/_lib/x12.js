/* ============================================================================
   GrayCo — AUTOMATIC DATA, LITTLE TYPING.   netlify/functions/_lib/x12.js   (patch X12)

   Owner (10/22): "I want every aspect of the CRM in depth and automatic, lots of data collecting, little entries."
   Approved: AI photo tags · voice OR typed visit notes → real fields · adjuster e-mails read automatically ·
   job health score (Admin) · smart defaults on forms (always editable).

   This file holds the pieces the functions share (the page carries its own copy of healthScore, kept in step
   by wAUTO12/patch_X12.py, so the score is the same on the server and in the CRM):
     ruleClaimFacts(subject, text)  — claim #, policy #, adjuster, dates and amounts read with plain rules (no AI);
     mergeFacts(ai, rules)          — the AI's answer wins, the rules fill the gaps;
     normExtract(raw)               — the visit-note answer cleaned to the fields the CRM keeps;
     PHOTO_TOOL / photoTags         — the photo tag vocabulary and how a tag set maps to a checklist stage;
     aiTool(...)                    — one Anthropic tool call (server key only);
     usage helpers                  — the daily photo-tag cap (PHOTO_TAG_DAILY_MAX, default 300).
   ========================================================================== */
'use strict';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function money(v){ if (v == null || v === '') return null; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : null; }

/* ── dates written the way carriers write them → YYYY-MM-DD (and HH:MM when a time is given) ── */
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function pad(n){ return (n < 10 ? '0' : '') + n; }
function dateOf(t, fallbackYear){
  t = s(t); let m, y, mo, d;
  if ((m = /\b(20\d\d)-(\d\d)-(\d\d)\b/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/.exec(t))) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d\d)?\b/i.exec(t))) { mo = MON[low(m[1]).slice(0, 3)]; d = +m[2]; y = m[3] ? +m[3] : fallbackYear; }
  if (!y || !mo || !d || mo > 12 || d > 31) return '';
  let out = y + '-' + pad(mo) + '-' + pad(d);
  const tm = /\b(\d{1,2})(?::(\d\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(t.slice(m.index)) || /\b(\d{1,2}):(\d\d)\b/.exec(t.slice(m.index + m[0].length));
  if (tm) { let h = +tm[1]; const mi = tm[2] ? +tm[2] : 0; if (tm[3]) { const pm = /p/i.test(tm[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; } if (h < 24 && mi < 60) out += 'T' + pad(h) + ':' + pad(mi); }
  return out;
}
/* the line that follows a label: "Claim #: 12-3456-789" */
function after(text, re){ const m = re.exec(text); return m ? s(m[1]).replace(/[.,;]+$/, '') : ''; }
function amountAfter(text, re){ const m = re.exec(text); return m ? money(m[1]) : null; }

/* ── 1. the facts an adjuster's e-mail carries, read with rules (no AI) ── */
function ruleClaimFacts(subject, text, opts){
  opts = opts || {};
  const t = s(subject) + '\n' + s(text), year = +(s(opts.year) || new Date().getFullYear());
  const f = {};
  const claim = after(t, /\bclaim\s*(?:#|no\.?|number|num)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})/i);
  if (claim) f.claim_number = claim;
  const pol = after(t, /\bpolicy\s*(?:#|no\.?|number)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})/i);
  if (pol) f.policy_number = pol;
  const adjName = after(t, /\b(?:field\s+)?adjuster(?:'s)?\s*(?:name)?\s*[:\-]\s*([A-Z][A-Za-z.'\- ]{2,40}?)(?=\s*(?:\n|,|\||phone|tel|cell|e-?mail|$))/i);
  if (adjName) f.adjuster_name = adjName;
  const desk = after(t, /\bdesk\s+adjuster\s*[:\-]\s*([A-Z][A-Za-z.'\- ]{2,40}?)(?=\s*(?:\n|,|\||phone|tel|e-?mail|$))/i);
  if (desk) f.desk_adjuster_name = desk;
  const ph = /\b(?:phone|tel|cell|direct|office)\s*[:\-]?\s*(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})(?:\s*(?:x|ext\.?)\s*\d{1,5})?/i.exec(t);
  if (ph) f.adjuster_phone = s(ph[1]);
  const inspect = /\b(?:inspection|re-?inspection|site visit|appointment|meet(?:ing)? you|scheduled)\b[^\n]{0,60}/i.exec(t);
  if (inspect) { const d = dateOf(inspect[0], year) || dateOf(t.slice(inspect.index, inspect.index + 90).split('\n')[0], year); if (d) f.inspection_at = d; }
  const dol = /\b(?:date of loss|loss date|DOL)\s*[:\-]?\s*([^\n]{4,30})/i.exec(t);
  if (dol) { const d = dateOf(dol[1], year); if (d) f.date_of_loss = d.slice(0, 10); }
  const rcv = amountAfter(t, /\b(?:RCV|replacement cost(?: value)?)\s*(?:of|is|:|=)?\s*\$?\s*([\d,]+(?:\.\d\d)?)/i); if (rcv != null) f.rcv = rcv;
  const acv = amountAfter(t, /\b(?:ACV|actual cash value)\s*(?:of|is|:|=)?\s*\$?\s*([\d,]+(?:\.\d\d)?)/i); if (acv != null) f.acv = acv;
  const dep = amountAfter(t, /\b(?:recoverable\s+)?depreciation\s*(?:of|is|:|=)?\s*\$?\s*([\d,]+(?:\.\d\d)?)/i); if (dep != null) f.depreciation = dep;
  const ded = amountAfter(t, /\bdeductible\s*(?:of|is|:|=)?\s*\$?\s*([\d,]+(?:\.\d\d)?)/i); if (ded != null) f.deductible = ded;
  /* a supplement decision: approved (with an amount) or denied */
  const sup = /\bsupplement[^\n]{0,80}?\b(not approved|approved|accepted|agreed|denied|declined|rejected)\b/i.exec(t) || /\b(approved|denied|declined|rejected)\b[^\n]{0,30}\bsupplement\b/i.exec(t);
  if (sup) { const word = low(sup[1]); f.supplement_decision = /not approved|den|decl|rej/.test(word) ? 'denied' : 'approved'; const a = /\$\s*([\d,]+(?:\.\d\d)?)/.exec(t.slice(sup.index, sup.index + 160).split('\n')[0]); if (a && f.supplement_decision === 'approved') f.supplement_amount = money(a[1]); }
  const pay = /\b(?:payment|check|draft|ACH|EFT)\b[^\n]{0,60}?\b(?:issued|sent|mailed|released|processed)\b[^\n]{0,60}/i.exec(t);
  if (pay) { const a = /\$\s*([\d,]+(?:\.\d\d)?)/.exec(pay[0]) || /\$\s*([\d,]+(?:\.\d\d)?)/.exec(t.slice(pay.index, pay.index + 160)); if (a) f.payment_amount = money(a[1]); const ck = /\b(?:check|draft)\s*(?:#|no\.?|number)\s*[:#]?\s*(\d{3,})/i.exec(t); if (ck) f.check_number = ck[1]; if (/depreciation/i.test(t.slice(Math.max(0, pay.index - 40), pay.index + 160).split('\n').slice(-2).join(' '))) f.payment_is_depreciation = true; }
  return f;
}
/* AI facts win; the rules only fill what the AI left out (or when there is no AI) */
const FACT_KEYS = ['claim_number', 'policy_number', 'carrier', 'adjuster_name', 'adjuster_phone', 'adjuster_email', 'adjuster_company', 'desk_adjuster_name', 'desk_adjuster_phone', 'desk_adjuster_email',
  'inspection_at', 'date_of_loss', 'rcv', 'acv', 'depreciation', 'deductible', 'approved_amount', 'supplement_decision', 'supplement_amount', 'payment_amount', 'check_number', 'payment_is_depreciation', 'site_visit'];
function mergeFacts(ai, rules){
  const out = Object.assign({}, ai && ai.ok !== false ? ai : {});
  FACT_KEYS.forEach(function(k){ const v = out[k]; if ((v == null || v === '') && rules && rules[k] != null && rules[k] !== '') out[k] = rules[k]; });
  if (!out.inspection_at && out.site_visit) out.inspection_at = out.site_visit;
  if (!out.site_visit && out.inspection_at) out.site_visit = out.inspection_at;
  out.rules = Object.keys(rules || {}).length;
  return out;
}

/* ── 2. visit notes → fields: the shape the CRM keeps ── */
const MEAS = ['squares', 'pitch', 'layers', 'drip_edge_lf', 'ridge_lf', 'valley_lf', 'hip_lf', 'rake_lf', 'eave_lf', 'decking_sheets', 'stories', 'roof_age_years', 'sq_ft', 'linear_ft'];
const EXTRACT_TOOL = { name: 'record_visit', description: 'Structured facts from a contractor\'s site-visit notes (dictated or typed).', input_schema: { type: 'object', properties: {
  summary: { type: 'string', description: 'one plain sentence of what the visit found' },
  job_type: { type: 'string', description: 'roofing, water mitigation, fire, remodel, kitchen, bath, flooring, siding, gutters, commercial, other' },
  measurements: { type: 'object', description: 'only numbers that were said: squares, pitch (like "8/12"), layers, drip_edge_lf, ridge_lf, valley_lf, hip_lf, rake_lf, eave_lf, decking_sheets, stories, roof_age_years, sq_ft, linear_ft', additionalProperties: true },
  rooms: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, length_ft: { type: ['number', 'null'] }, width_ft: { type: ['number', 'null'] }, height_ft: { type: ['number', 'null'] }, notes: { type: 'string' } }, required: ['name'] } },
  scope: { type: 'array', items: { type: 'object', properties: { desc: { type: 'string' }, qty: { type: ['number', 'null'] }, unit: { type: 'string' }, trade: { type: 'string' } }, required: ['desc'] }, description: 'work items the notes call for' },
  materials: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: ['number', 'null'] }, unit: { type: 'string' }, color: { type: 'string' } }, required: ['name'] } },
  damage: { type: 'string', description: 'damage noted (hail, wind, water, leaks, rot …)' },
  access: { type: 'string', description: 'access notes: gate, dogs, steep, parking, lockbox (never repeat a code number)' },
  customer_requests: { type: 'string' },
  follow_ups: { type: 'array', items: { type: 'string' } }
}, required: ['summary'] } };
function numOrNull(v){ if (v == null || v === '') return null; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
function normExtract(raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  const m = raw.measurements && typeof raw.measurements === 'object' ? raw.measurements : {}, meas = {};
  Object.keys(m).forEach(function(k){ const key = low(k).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); if (!key) return; if (key === 'pitch') { const p = s(m[k]); if (/^\d{1,2}\s*[\/:]\s*12$/.test(p) || /^\d{1,2}$/.test(p)) meas.pitch = /\//.test(p) ? p.replace(/\s/g, '') : p.replace(':', '/') + (/\//.test(p) ? '' : '/12'); return; } const n = numOrNull(m[k]); if (n != null) meas[key] = n; });
  /* an access code is never kept here (it belongs in the 🔐 access-code vault) */
  const access = s(raw.access).replace(/\b(code|combo|combination|lockbox|gate)\b([^\n.]{0,12}?)\b\d{3,8}\b/gi, '$1$2[code — put it in 🔐 Access codes]');
  return {
    summary: s(raw.summary).slice(0, 400), jobType: s(raw.job_type).slice(0, 40), measurements: meas,
    rooms: arr(raw.rooms).filter(r => r && s(r.name)).slice(0, 30).map(r => ({ name: s(r.name).slice(0, 60), length: numOrNull(r.length_ft), width: numOrNull(r.width_ft), height: numOrNull(r.height_ft), notes: s(r.notes).slice(0, 200) })),
    scope: arr(raw.scope).filter(x => x && s(x.desc)).slice(0, 60).map(x => ({ desc: s(x.desc).slice(0, 200), qty: numOrNull(x.qty), unit: s(x.unit).slice(0, 12), trade: s(x.trade).slice(0, 30) })),
    materials: arr(raw.materials).filter(x => x && s(x.name)).slice(0, 60).map(x => ({ name: s(x.name).slice(0, 120), qty: numOrNull(x.qty), unit: s(x.unit).slice(0, 12), color: s(x.color).slice(0, 40) })),
    damage: s(raw.damage).slice(0, 600), access: access.slice(0, 400), customerRequests: s(raw.customer_requests).slice(0, 600),
    followUps: arr(raw.follow_ups).map(s).filter(Boolean).slice(0, 12)
  };
}

/* ── 3. photo tags ── */
const STAGES = ['before', 'tear-off', 'decking', 'underlayment', 'dry-in', 'install', 'final', 'punch', 'progress', 'other'];
const DAMAGE = ['hail', 'wind', 'water line', 'mold', 'fire', 'soot', 'leak', 'rot', 'none'];
const PHOTO_TOOL = { name: 'tag_photo', description: 'Tags for one construction job-site photo.', input_schema: { type: 'object', properties: {
  stage: { type: 'string', enum: STAGES, description: 'which point of the job the photo shows' },
  damage: { type: 'array', items: { type: 'string', enum: DAMAGE } },
  materials: { type: 'array', items: { type: 'string' }, description: 'visible materials (shingles, OSB decking, synthetic underlayment, ice & water, drywall, vinyl plank …), at most 5' },
  area: { type: 'string', description: 'room or area if obvious (front slope, kitchen, basement …), else empty' },
  moisture_meter: { type: 'boolean' }, equipment: { type: 'boolean', description: 'drying equipment (air movers, dehumidifiers) visible' },
  confidence: { type: 'number', description: '0 to 1' }
}, required: ['stage'] } };
/* the words the soft photo checklist (patch AUTO7) already listens for */
function tagWords(t){
  t = t || {}; const w = [];
  const st = low(t.stage);
  if (st === 'before') w.push('before', 'existing'); if (st === 'tear-off') w.push('tear-off'); if (st === 'decking') w.push('decking'); if (st === 'underlayment') w.push('underlayment');
  if (st === 'dry-in') w.push('underlayment', 'dry-in'); if (st === 'install' || st === 'progress') w.push('during', 'progress'); if (st === 'final') w.push('final', 'after', 'complete'); if (st === 'punch') w.push('punch');
  arr(t.damage).forEach(function(d){ d = low(d); if (d && d !== 'none') w.push('damage', d); });
  if (t.moisture_meter) w.push('moisture reading meter'); if (t.equipment) w.push('equipment dehu air mover');
  arr(t.materials).forEach(function(m){ w.push(low(m)); }); if (t.area) w.push(low(t.area));
  return Array.from(new Set(w)).join(' ');
}
function cleanTag(raw){
  raw = raw || {}; const st = STAGES.indexOf(low(raw.stage)) >= 0 ? low(raw.stage) : 'other';
  return { stage: st, damage: arr(raw.damage).map(low).filter(d => DAMAGE.indexOf(d) >= 0 && d !== 'none'), materials: arr(raw.materials).map(s).filter(Boolean).slice(0, 5), area: s(raw.area).slice(0, 40),
    moisture: !!raw.moisture_meter, equipment: !!raw.equipment, conf: Math.max(0, Math.min(1, +raw.confidence || 0.7)) };
}
/* the customer portal only ever sees the stage, and never a damage word */
const PORTAL_STAGE = { before: 'Before', 'tear-off': 'Tear-off', decking: 'Decking', underlayment: 'Underlayment', 'dry-in': 'Dried in', install: 'In progress', progress: 'In progress', final: 'Finished', punch: 'Final touches' };
function portalLabel(t){ return t && PORTAL_STAGE[low(t.stage)] || ''; }

/* ── one Anthropic tool call ── */
async function aiTool(tool, content, opts){
  opts = opts || {};
  const key = env('ANTHROPIC_API_KEY'); if (!key) return { ok: false, why: 'ANTHROPIC_API_KEY is not set' };
  const body = { model: opts.model || env('X12_AI_MODEL') || 'claude-haiku-5-5', max_tokens: opts.max || 1500, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content }] };
  const ctl = new AbortController(), timer = setTimeout(function(){ ctl.abort(); }, opts.timeout || 22000);
  try {
    const f = opts.fetch || fetch;
    const r = await f('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    const j = await r.json().catch(function(){ return null; });
    if (!r.ok || !j) return { ok: false, why: 'AI answered ' + r.status };
    const t = arr(j.content).find(function(b){ return b && b.type === 'tool_use'; });
    return t ? { ok: true, input: t.input || {}, usage: j.usage || null, model: body.model } : { ok: false, why: 'no answer' };
  } catch (e) { return { ok: false, why: e && e.name === 'AbortError' ? 'AI timed out' : 'AI unreachable' }; }
  finally { clearTimeout(timer); }
}

function dailyMax(){ const n = parseInt(env('PHOTO_TAG_DAILY_MAX') || '300', 10); return isFinite(n) && n >= 0 ? n : 300; }

module.exports = { ruleClaimFacts, mergeFacts, FACT_KEYS, dateOf, EXTRACT_TOOL, normExtract, MEAS, PHOTO_TOOL, STAGES, DAMAGE, tagWords, cleanTag, portalLabel, aiTool, dailyMax };
