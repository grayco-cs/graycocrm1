/* ============================================================================
   GrayCo — THE CLAIM INBOX.   netlify/functions/claim-inbox.js     (patch BB, phase 3)

   "everything in the insurance portal, all submittals, emails etc, need to be automatic, so I need to
    make sure everything can be sent to the CRM or sent out from the CRM as I'm updating certain things"

   claims@grayco-cs.com is a Google Group. Its member claims@in.grayco-cs.com (Resend Receiving, the
   same subdomain and webhook as the bill inbox, patch AA) gets a copy of every e-mail. This function:
     1. checks Resend's signature (Svix, RESEND_INBOUND_SECRET) — or ?token=CLAIM_INBOX_TOKEN;
     2. ignores mail that is not for the claim inbox (so it shares the webhook with bill-inbox), mail the
        CRM sent itself (from claims@ / X-GrayCo-CRM) and auto-replies / bounces;
     3. fetches the e-mail and attachments from Resend, keeps the files in crm-files (sha256 names);
     4. asks Claude (server side, ANTHROPIC_API_KEY) for the key facts — approved amount, depreciation,
        requested items, site-visit date, payment / check # — and what each attachment is;
     5. matches the e-mail to a claim (claim #, DASH / XactAnalysis id, policy #, insured + address, the
        adjuster's e-mail) with a confidence, and
     6. appends it to gc_kv "gc_claim_inbox". The CRM (tail_BB) puts a matched e-mail on the claim's
        journal, imports a Xactimate PDF / ESX as a carrier version and runs the compare; a weak match
        waits in "Claim mail to match". Money fields only change after a person taps a suggestion.
   patch CLAIMLEAD: a mail that matches no claim or job and is a NEW assignment / first notice of loss / request for
   service is also filed as an Insurance lead in the Lead Inbox (_lib/claim-lead.js), pre-assigned to the senior
   insurance PM; it is not left in "Claim mail to match" (status 'lead'). CLAIM_LEAD_OFF=1 turns that off.
   It never sends e-mail (the admins' new-lead alert comes from the shared lead path), so it cannot loop.
   ========================================================================== */
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const KV_KEY = 'gc_claim_inbox', KEEP = 300, MAX_BYTES = 15 * 1024 * 1024, MAX_FILES = 8, AUTO = 0.8;
const OK_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'application/zip': 'esx', 'application/x-zip-compressed': 'esx', 'application/octet-stream': 'bin' };
const EXT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', esx: 'application/zip' };
const GC_SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return (v == null ? '' : String(v)).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){ if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
function sbUrl(){ return (env('SUPABASE_URL') || GC_SB).replace(/\/$/, ''); }
function sbKey(){ return env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY'); }
function hdrs(event){ const h = {}; Object.keys((event && event.headers) || {}).forEach(k => { h[low(k)] = event.headers[k]; }); return h; }
function rawBody(event){ return event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || ''); }
function J(code, body){ return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); if (!a.length || a.length !== b.length) return false; try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; } }
function sha256(b){ return crypto.createHash('sha256').update(b).digest('hex'); }
function addr(v){ let t = v; if (Array.isArray(t)) t = t[0]; if (t && typeof t === 'object') t = t.email || t.address || ''; t = s(t); const m = t.match(/<([^>]+)>/); const email = low(m ? m[1] : t).replace(/^mailto:/, ''); return { name: s(m ? t.slice(0, t.indexOf('<')) : '').replace(/^"|"$/g, ''), email }; }
function list(v){ return (Array.isArray(v) ? v : (v ? String(v).split(',') : [])).map(addr).filter(x => x.email); }
function htmlToText(h){ return s(String(h || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')); }
function headerMap(h){ const o = {}; if (Array.isArray(h)) h.forEach(x => { if (x && x.name) o[low(x.name)] = s(x.value); }); else if (h && typeof h === 'object') Object.keys(h).forEach(k => { o[low(k)] = Array.isArray(h[k]) ? h[k].map(s).join(', ') : s(h[k]); }); return o; }

/* ── 1. Resend's signature (Svix), the same check as the bill inbox ── */
function svixOk(raw, h, secret){
  secret = s(secret); if (!secret) return false;
  const id = s(h['svix-id'] || h['webhook-id']), ts = s(h['svix-timestamp'] || h['webhook-timestamp']), sigs = s(h['svix-signature'] || h['webhook-signature']);
  if (!id || !ts || !sigs) return false;
  const t = parseInt(ts, 10); if (!isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  let key; try { key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); } catch (e) { return false; }
  if (!key.length) return false;
  const want = crypto.createHmac('sha256', key).update(id + '.' + ts + '.' + raw, 'utf8').digest('base64');
  return sigs.split(/\s+/).some(p => { const i = p.indexOf(','); return i > 0 && p.slice(0, i) === 'v1' && same(p.slice(i + 1), want); });
}
function verified(event, raw){
  const h = hdrs(event), qs = event.queryStringParameters || {}, secret = env('RESEND_INBOUND_SECRET'), tok = env('CLAIM_INBOX_TOKEN');
  if (!secret && !tok) return { ok: false, code: 503, why: 'The claim inbox is not set up yet (RESEND_INBOUND_SECRET on Netlify).' };
  if (secret && svixOk(raw, h, secret)) return { ok: true };
  if (tok && same(qs.token, tok)) return { ok: true };
  return { ok: false, code: 401, why: 'Not signed by Resend.' };
}

/* ── 2. routing: only claims@ mail; never our own; never auto-replies ── */
function inboxAddrs(){ return (env('CLAIM_INBOX_TO') || 'claims@in.grayco-cs.com,claims@grayco-cs.com').split(',').map(low).filter(Boolean); }
function forClaims(mail, data){
  const H = mail.headers || {}, want = inboxAddrs();
  const to = list(data.to).concat(list(data.cc), mail.to, mail.cc).map(x => x.email).concat([H['x-forwarded-to'], H['delivered-to'], H['x-original-to'], H['x-google-original-to']].join(',').split(',').map(x => addr(x).email));
  return to.some(x => want.indexOf(x) >= 0);
}
function ownOrAuto(mail){
  const H = mail.headers || {}, mine = (env('CLAIM_IGNORE_FROM') || 'claims@grayco-cs.com,noreply@grayco-cs.com,portal@grayco-cs.com,billing@grayco-cs.com').split(',').map(low);
  if (mine.indexOf(mail.from.email) >= 0) return 'sent by the CRM';
  if (H['x-grayco-crm'] || H['x-grayco-item']) return 'sent by the CRM (header)';
  const a = low(H['auto-submitted']); if (a && a !== 'no') return 'automatic reply';
  if (/^(out of office|automatic reply|auto(matic)?[- ]?reply|undeliverable|delivery status notification|mail delivery)/i.test(mail.subject)) return 'automatic reply';
  if (/^(mailer-daemon|postmaster)@/.test(mail.from.email)) return 'bounce';
  return '';
}

/* ── 3. the mail and its files ── */
async function resendGet(path){ const key = env('RESEND_API_KEY'); if (!key) return null; try { const r = await fetch('https://api.resend.com' + path, { headers: { Authorization: 'Bearer ' + key } }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
function typeOf(a){ let t = low(a.content_type || a.contentType || a.type).split(';')[0]; const ext = low(s(a.filename || a.name).split('.').pop()); if (ext === 'esx') return 'application/zip'; if ((!t || /octet-stream/.test(t)) && EXT_TYPES[ext]) t = EXT_TYPES[ext]; if (t === 'image/jpg') t = 'image/jpeg'; return t; }
async function readMail(data){
  const id = s(data.email_id || data.emailId || data.id);
  let full = id ? await resendGet('/emails/receiving/' + encodeURIComponent(id)) : null; if (full && full.data && !full.subject) full = full.data;
  const m = Object.assign({}, data, full || {});
  let atts = Array.isArray(data.attachments) ? data.attachments.slice() : [];
  if (id) { const al = await resendGet('/emails/receiving/' + encodeURIComponent(id) + '/attachments'); const arr = al && (Array.isArray(al.data) ? al.data : Array.isArray(al) ? al : null); if (arr && arr.length) { const by = {}; atts.forEach(a => { if (a && a.id) by[a.id] = a; }); atts = arr.map(a => Object.assign({}, by[a.id] || {}, a)); } }
  const files = [], skipped = [];
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    const name = s(a.filename || a.name) || 'attachment', type = typeOf(a);
    if (!OK_TYPES[type] || (type === 'application/octet-stream' && !/\.esx$/i.test(name))) { skipped.push({ name, why: 'file type not kept' }); continue; }
    if (files.length >= MAX_FILES) { skipped.push({ name, why: 'too many files' }); continue; }
    let buf = null;
    if (a.content) { try { buf = Buffer.from(String(a.content), 'base64'); } catch (e) {} }
    else if (a.download_url || a.url) { try { const r = await fetch(a.download_url || a.url); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); } catch (e) {} }
    if (!buf || !buf.length || buf.length > MAX_BYTES) { skipped.push({ name, why: 'could not be downloaded or over 15 MB' }); continue; }
    if (type === 'application/pdf' && buf.slice(0, 5).toString('latin1') !== '%PDF-') { skipped.push({ name, why: 'not a real PDF' }); continue; }
    files.push({ name, type, size: buf.length, buf });
  }
  return { id, from: addr(m.from), to: list(m.to), cc: list(m.cc), subject: s(m.subject), text: (s(m.text) || htmlToText(m.html)).slice(0, 20000), date: s(m.created_at), files, skipped, headers: headerMap(m.headers) };
}
async function storeFile(buf, type, name){
  const ext = /\.esx$/i.test(name) ? 'esx' : (OK_TYPES[type] || 'bin'), hash = sha256(buf), path = hash + '.' + ext, ref = 'sb:crm-files/' + path;
  try { const r = await fetch(sbUrl() + '/storage/v1/object/crm-files/' + path, { method: 'POST', headers: { apikey: sbKey(), Authorization: 'Bearer ' + sbKey(), 'Content-Type': ext === 'esx' ? 'application/zip' : type, 'x-upsert': 'false' }, body: buf }); if (r.ok || r.status === 409) return ref; const t = await r.text().catch(() => ''); return r.status === 400 && /exist|duplicate/i.test(t) ? ref : ''; } catch (e) { return ''; }
}
async function kvGet(key){ try { const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: { apikey: sbKey(), Authorization: 'Bearer ' + sbKey() } }); if (!r.ok) return null; const rows = await r.json(); let v = rows && rows[0] && rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; } catch (e) { return null; } }
async function kvPut(key, value){ const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: sbKey(), Authorization: 'Bearer ' + sbKey(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) }); return r.ok; }

/* ── 4. which claim? (claim #, DASH / XA id, policy #, insured + address, the adjuster's address) ── */
function alnum(v){ return low(v).replace(/[^a-z0-9]/g, ''); }
function hasId(hay, id){ id = alnum(id); return id.length >= 5 && hay.indexOf(id) >= 0; }
function matchClaim(mail, claims, projects){
  const subj = s(mail.subject), body = s(mail.text), hayS = alnum(subj), hayB = alnum(body), hay = hayS + ' ' + hayB, words = low(subj + ' ' + body);
  const proj = {}; (Array.isArray(projects) ? projects : []).forEach(p => { if (p && p.id) proj[s(p.id)] = p; });
  const out = [];
  (Array.isArray(claims) ? claims : []).forEach(c => {
    if (!c || c.deleted === true) return;
    const p = proj[s(c.projectId)] || {}, L = c.links || {}, why = []; let sc = 0;
    function hit(v, w, label){ if (v > sc) sc = v; why.push(label); }
    if (hasId(hayS, c.claimNumber)) hit(0.98, 0, 'claim # in the subject'); else if (hasId(hayB, c.claimNumber)) hit(0.95, 0, 'claim # in the e-mail');
    if (hasId(hayS, (L.dash || {}).jobId)) hit(0.95, 0, 'DASH job # in the subject');
    if (hasId(hayS, (L.xa || {}).assignmentId)) hit(0.95, 0, 'XactAnalysis id in the subject');
    if (hasId(hay, c.policyNumber)) hit(0.9, 0, 'policy #');
    const ins = low(c.insured || p.client), adr = low(c.address || p.address).split(',')[0];
    const insHit = ins.length >= 5 && words.indexOf(ins) >= 0, adrHit = adr.length >= 6 && words.indexOf(adr) >= 0;
    if (insHit && adrHit) hit(0.85, 0, 'insured + address'); else if (adrHit) hit(0.7, 0, 'address'); else if (insHit) hit(0.6, 0, 'insured name');
    const adj = [(c.adjuster || {}).email, (c.deskAdjuster || {}).email, (L.email || {}).to, (L.dash || {}).email].join(',').split(/[,;\s]+/).map(low).filter(Boolean);
    if (mail.from.email && adj.indexOf(mail.from.email) >= 0) hit(c.phase === 'Closed' ? 0.5 : 0.72, 0, 'from the adjuster on this claim');
    if (sc > 0) out.push({ claimId: c.id, conf: sc, why: why.join(' · '), title: s(c.title || p.name || c.insured), claimNumber: s(c.claimNumber) });
  });
  out.sort((a, b) => b.conf - a.conf);
  /* two claims equally likely (e.g. one adjuster, two open claims) → nobody wins */
  if (out.length > 1 && out[0].conf - out[1].conf < 0.05) out[0] = Object.assign({}, out[0], { conf: Math.min(out[0].conf, 0.6), why: out[0].why + ' (also matches ' + out[1].title + ')' });
  const best = out[0] || null;
  return { claimId: best && best.conf >= AUTO ? best.claimId : '', conf: best ? best.conf : 0, why: best ? best.why : 'nothing on the e-mail matches a claim', candidates: out.slice(0, 4) };
}

/* ── 5. Claude: the facts and what the attachments are (nothing changes without a tap in the CRM) ── */
const TOOL = { name: 'record_claim_mail', description: 'Key facts from an insurance-claim e-mail to a contractor, and what each attachment is.', input_schema: { type: 'object', properties: {
  summary: { type: 'string', description: 'one plain sentence: what the carrier / adjuster says' },
  approved_amount: { type: ['number', 'null'], description: 'an amount the carrier approved / agreed (RCV), if stated' },
  depreciation: { type: ['number', 'null'], description: 'depreciation amount, if stated' },
  requested_items: { type: 'array', items: { type: 'string' }, description: 'documents or items the adjuster asks the contractor for (photos, invoice, COC …)' },
  site_visit: { type: 'string', description: 'a re-inspection / site visit date-time YYYY-MM-DDTHH:MM, or empty' },
  payment_amount: { type: ['number', 'null'], description: 'a payment / check issued, if stated' },
  check_number: { type: 'string' },
  /* patch X12: the claim's facts too — each one becomes a "Review & apply" update on the claim, never a silent change */
  claim_number: { type: 'string' }, policy_number: { type: 'string' }, carrier: { type: 'string', description: 'the insurance company' },
  adjuster_name: { type: 'string' }, adjuster_phone: { type: 'string' }, adjuster_email: { type: 'string' }, adjuster_company: { type: 'string', description: 'independent adjusting firm, if any' },
  desk_adjuster_name: { type: 'string' }, desk_adjuster_phone: { type: 'string' }, desk_adjuster_email: { type: 'string' },
  inspection_at: { type: 'string', description: 'inspection / re-inspection date-time YYYY-MM-DDTHH:MM, or empty' }, date_of_loss: { type: 'string', description: 'YYYY-MM-DD or empty' },
  rcv: { type: ['number', 'null'] }, acv: { type: ['number', 'null'] }, deductible: { type: ['number', 'null'] },
  supplement_decision: { type: 'string', enum: ['', 'approved', 'denied', 'partial'], description: 'the carrier\'s decision on a supplement, if this e-mail gives one' }, supplement_amount: { type: ['number', 'null'] },
  payment_is_depreciation: { type: 'boolean', description: 'true when the payment issued is the recoverable depreciation' },
  /* patch CLAIMLEAD: is this a NEW claim / assignment (then it also becomes a Lead Inbox lead)? and the insured's own details */
  mail_kind: { type: 'string', enum: ['new_assignment', 'first_notice_of_loss', 'service_request', 'existing_claim_update', 'other'], description: 'new_assignment = a TPA / network / carrier assigns a NEW claim or loss to the contractor; first_notice_of_loss = an insured or adjuster reports a new loss; service_request = an insured / adjuster asks the contractor for service; existing_claim_update = news about a claim already under way (estimate, payment, supplement, request for documents, schedule); other = anything else' },
  insured_name: { type: 'string', description: 'the insured / policyholder / homeowner, if stated' }, insured_phone: { type: 'string' }, insured_email: { type: 'string' },
  loss_address: { type: 'string', description: 'the address of the loss / property, one line' }, loss_type: { type: 'string', description: 'water, fire, wind / hail, roof, mold … if stated' },
  tpa: { type: 'string', description: 'the TPA or contractor network that sent it (Contractor Connection, Sedgwick, Accuserve, Alacrity / Altimeter, Westhill …), if any' },
  attachments: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, kind: { type: 'string', enum: ['xactimate_estimate', 'photo', 'letter', 'invoice', 'other'] } }, required: ['index', 'kind'] } }
}, required: ['summary', 'attachments'] } };
async function readFacts(mail){
  const key = env('ANTHROPIC_API_KEY'); if (!key) return { ok: false, why: 'ANTHROPIC_API_KEY is not set' };
  const content = []; let bytes = 0;
  mail.files.forEach((f, i) => { if (f.type === 'application/pdf' && bytes + f.size < 20e6) { bytes += f.size; content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.buf.toString('base64') } }); } });
  content.push({ type: 'text', text: 'An e-mail about an insurance claim, received by GrayCo Construction Services (the contractor). Record the key facts with record_claim_mail, including mail_kind (is this a NEW claim or request for service, or news about a claim already under way?). Use only what is written; leave out anything not stated. Attachments: ' + (mail.files.map((f, i) => i + ': ' + f.name + ' (' + f.type + ')').join(', ') || 'none') + '\n\nFrom: ' + mail.from.email + '\nSubject: ' + mail.subject + '\n\n' + mail.text.slice(0, 12000) });
  const body = { model: env('CLAIM_AI_MODEL') || env('XACT_MODEL') || 'claude-sonnet-5-5', max_tokens: 1500, tools: [TOOL], tool_choice: { type: 'tool', name: 'record_claim_mail' }, messages: [{ role: 'user', content }] };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), parseInt(env('CLAIM_AI_TIMEOUT_MS') || '60000', 10));
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null); if (!r.ok || !j) return { ok: false, why: 'AI answered ' + r.status };
    const t = (j.content || []).find(b => b && b.type === 'tool_use'); return t ? Object.assign({ ok: true, model: body.model }, t.input) : { ok: false, why: 'no answer' };
  } catch (e) { return { ok: false, why: e && e.name === 'AbortError' ? 'AI timed out' : 'AI unreachable' }; } finally { clearTimeout(timer); }
}
async function staffRows(){ try { const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=email,name,role,profile,active', { headers: { apikey: sbKey(), Authorization: 'Bearer ' + sbKey() } }); return r.ok ? await r.json() : []; } catch (e) { return []; } }   /* patch CLAIMLEAD */
/* what each file is: the AI's word, else the file name / type */
function classify(f, i, facts){
  if (/\.esx$/i.test(f.name)) return 'esx';
  const a = ((facts && facts.attachments) || []).find(x => x && x.index === i);
  if (/^image\//.test(f.type)) return 'photo';
  if (a && a.kind === 'xactimate_estimate') return 'xactimate';
  if (/xactimate|estimate|esti?m?\b|supp(lement)?/i.test(f.name) && f.type === 'application/pdf' && !a) return 'xactimate';
  return a && a.kind === 'invoice' ? 'invoice' : 'letter';
}

/* ── the whole job ── */
async function processEvent(evt, opts){
  if (s(evt && evt.type) && s(evt.type) !== 'email.received') return { status: 200, body: { ok: true, ignored: 'event ' + evt.type } };
  const data = (evt && (evt.data || evt)) || {}, mail = await readMail(data);
  if (!forClaims(mail, data)) return { status: 200, body: { ok: true, ignored: 'not addressed to the claim inbox' } };
  const own = ownOrAuto(mail); if (own) return { status: 200, body: { ok: true, ignored: own } };
  if (!sbKey()) return { status: 503, body: { ok: false, error: 'database not configured' } };
  /* patch SALESSPAM: a vendor's sales pitch to claims@ is never a claim e-mail or an insurance lead (🗑 Filtered, admins) */
  if (!(opts && opts.skipSpam)) { try { const g = await require('./bid-inbox.js')._lib.spamGate(mail, data, 'claims'); if (g) return g; } catch (e) {} }
  const inbox = await kvGet(KV_KEY); const list0 = Array.isArray(inbox) ? inbox : [];
  const id = 'IN-' + (mail.id || sha256(mail.from.email + mail.subject + mail.date + mail.text.slice(0, 500)).slice(0, 24));
  if (list0.some(x => x && x.id === id)) return { status: 200, body: { ok: true, repeat: true, id } };
  const files = [];
  for (const f of mail.files) files.push({ name: f.name, type: f.type, size: f.size, ref: await storeFile(f.buf, f.type, f.name) });
  const ai = await readFacts(mail);
  /* patch X12: plain rules read the same facts (claim #, adjuster, dates, amounts); the AI wins, the rules fill gaps */
  let rules = {}; try { rules = require('./_lib/x12.js').ruleClaimFacts(mail.subject, mail.text); } catch (e) {}
  const facts = Object.keys(rules).length || ai.ok ? Object.assign(require('./_lib/x12.js').mergeFacts(ai.ok ? ai : {}, rules), { ok: true, ai: !!ai.ok }) : ai;
  files.forEach((f, i) => { f.kind = classify(mail.files[i], i, facts); });
  const [claims, projects] = [await kvGet('gc_claims'), await kvGet('projects')];
  const match = matchClaim(mail, claims, projects);
  /* patch CLAIMLEAD: a claims@ e-mail that is a NEW claim (not any claim or job we have) is also a lead in the Lead Inbox. Never sends mail. */
  let leadRes = null;
  if (!match.claimId && env('CLAIM_LEAD_OFF') !== '1') {
    try {
      leadRes = await require('./_lib/claim-lead.js').newClaimLead({ L: require('./bid-inbox.js')._lib, WI: require('./website-intake.js')._lib, kv: kvGet, staff: staffRows },
        { mail, facts, match, files, claims, projects, inboxId: id });
    } catch (e) { leadRes = { made: false, error: s(e && e.message).slice(0, 200) }; }
  }
  const leadId = leadRes && (leadRes.id || ''), isLead = !!(leadRes && (leadRes.made || leadRes.duplicate));
  const item = { id, at: new Date().toISOString(), updatedAt: new Date().toISOString(), from: mail.from, to: mail.to.map(x => x.email), subject: mail.subject, text: mail.text.slice(0, 8000), date: mail.date, files, skipped: mail.skipped, facts: facts.ok ? facts : { ok: false, why: facts.why }, match, status: match.claimId ? 'matched' : isLead ? 'lead' : 'to-match' };
  if (leadRes) item.lead = { id: leadId || '', made: !!leadRes.made, duplicate: !!leadRes.duplicate, why: s(leadRes.why).slice(0, 200), assignedTo: leadRes.assignedTo || null, error: leadRes.error || '' };
  const fresh = await kvGet(KV_KEY), next = (Array.isArray(fresh) ? fresh : list0).filter(x => x && x.id !== id).concat([item]).slice(-KEEP);
  if (!(await kvPut(KV_KEY, next))) return { status: 503, body: { ok: false, error: 'could not store — retry' } };
  return { status: 200, body: { ok: true, id, claimId: match.claimId, conf: match.conf, files: files.length, read: !!facts.ok, lead: leadRes ? { id: leadId || '', made: !!leadRes.made, duplicate: !!leadRes.duplicate, assignedTo: leadRes.assignedTo || null, why: leadRes.why || '' } : undefined } };
}
function handoffSig(ts, body){ return crypto.createHmac('sha256', 'claim-handoff:' + (env('RESEND_INBOUND_SECRET') || env('CLAIM_INBOX_TOKEN'))).update(ts + '.' + body, 'utf8').digest('hex'); }
async function handOff(raw){
  const base = (env('URL') || env('DEPLOY_PRIME_URL')).replace(/\/$/, ''); if (!base || env('CLAIM_INBOX_INLINE') === '1' || raw.length > 200000) return false;
  const ts = String(Date.now());
  try { const r = await fetch(base + '/.netlify/functions/claim-inbox-background', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claim-ts': ts, 'x-claim-handoff': handoffSig(ts, raw) }, body: raw }); return r.status === 202 || r.ok; } catch (e) { return false; }
}
exports.handler = async function(event){
  const qs = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && qs.ping) return J(200, { ok: true, service: 'GrayCo claim inbox', signed: !!env('RESEND_INBOUND_SECRET'), resendApi: !!env('RESEND_API_KEY'), ai: !!env('ANTHROPIC_API_KEY'), database: !!sbKey(), to: inboxAddrs() });
  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });
  const raw = rawBody(event), v = verified(event, raw); if (!v.ok) return J(v.code, { error: v.why });
  let evt; try { evt = JSON.parse(raw || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }); }
  if (s(evt.type) && s(evt.type) !== 'email.received') return J(200, { ok: true, ignored: 'event ' + evt.type });
  if (await handOff(raw)) return J(200, { ok: true, accepted: true });
  const r = await processEvent(evt); return J(r.status, r.body);
};
exports.backgroundHandler = async function(event){
  const raw = rawBody(event), h = hdrs(event), ts = s(h['x-claim-ts']);
  if (!ts || Math.abs(Date.now() - parseInt(ts, 10)) > 120000 || !same(h['x-claim-handoff'], handoffSig(ts, raw))) return J(401, { error: 'Not from the claim inbox.' });
  let evt; try { evt = JSON.parse(raw || '{}'); } catch (e) { return J(400, { error: 'Not JSON.' }); }
  const r = await processEvent(evt); return J(r.status, r.body);
};
exports._test = { svixOk, matchClaim, forClaims, ownOrAuto, classify, readMail, processEvent, TOOL };
