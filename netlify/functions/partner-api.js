/* ============================================================================
   GrayCo — PARTNER API: anyone GrayCo gives a code to can post into the CRM.   netlify/functions/partner-api.js
   (patch API)

   Owner (10/21): "I need to make sure I can add APIs from my CRM so anyone can post jobs, leads etc into my CRM
   once I give them a code."

   The codes are made in the CRM (Admin → Admin settings → 🔑 API access), not on Netlify. Each partner gets its own
   code, limited to what it may post; it is shown once, and only its SHA-256 hash is kept (gc_kv-style row
   "gc_partner_keys" in the service-only gc_lead_inbox_kv table, the Lead Inbox's own store). A code can expire and
   can be revoked at any time. Roofing Ignite and the other LEAD_KEY_<COMPANY> keys on Netlify (lead-intake.js) keep
   working as before.

   PUBLIC (a partner's server; header  x-api-key: gck_…   or   Authorization: Bearer gck_…):
     POST { kind: 'lead', name, phone|email, address, city, state, zip, service, message, external_id }
          → a GrayCo lead in Leads → 📥 Lead Inbox, source = the partner, nobody assigned. The admins get the
            new-lead e-mail at once; the 4-hour / 24-hour "assign / reach out" reminders apply (patch STL).
     POST { kind: 'bid', title, bid_due, due_to, due_to_contact, due_to_email, due_to_phone, submit_method,
            submit_where, address, city, state, type, scope, plans_url, bid_number, external_id }
          → a bid in the Lead Inbox (commercial bids go to the default estimator); the bid-due alerts apply (LA).
            bid_due (YYYY-MM-DD or YYYY-MM-DDTHH:MM, Central) and due_to are required (owner rule).
     POST { kind: 'job', name, client, address, phone, email, type, scope, contract, start_date, notes, external_id }
          → NOT a live job (a job carries money): a "🚀 New job from <partner>" approval on the admins' To-Do
            (the shared to-do list gc_office_tasks, kind partner_job — the office sees it as waiting on the admins). Approving it opens Launch Job filled in; the job is created there
            the normal way (PO number, checklist, estimate, calendar), and the approval clears itself.
     POST { kind: 'note', po, text, author }
          → a message on that job's board (gc_job_messages, the PM tagged) and a to-do for the job's PM.
     → 200 { ok: true, id }   ·   400 missing / bad field (says which)   ·   401 bad code   ·   403 not allowed for
       this code (scope, expired, revoked)   ·   404 no job with that PO   ·   429 too many (per code, per hour)
     GET ?ping=1 → alive (no data).

   ADMIN (CRM sign-in, gc_staff role admin — the same check as the Lead Inbox):
     GET  ?keys=1                       the codes (never the code itself or its hash)
     POST ?act=create { partner, scopes:[lead|bid|job|note], note, expires }   → { key } shown ONCE
     POST ?act=revoke { id }
     GET  ?instructions=<id>            plain-English + curl instructions for that partner (no code in them)

   ENV: nothing new. SUPABASE_URL / SUPABASE_SERVICE_KEY and RESEND_API_KEY are already set.
        Optional PARTNER_API_RATE (posts per code per hour, default 120), PARTNER_API_OFF=1 (refuses every post).
   ========================================================================== */
'use strict';
const crypto = require('crypto');

const KEYS_KV = 'gc_partner_keys';
const SCOPES = ['lead', 'bid', 'job', 'note'];
const SCOPE_LABEL = { lead: 'Leads', bid: 'Bids', job: 'Jobs / work orders', note: 'Notes / updates on a job (by PO)' };
const ENDPOINT_PATH = '/.netlify/functions/partner-api';

let LIB = null, CORE = null;
function L(){ if (!LIB) LIB = require('./bid-inbox.js')._lib; return LIB; }
function core(){ if (!CORE) CORE = require('./portal.js')._core; return CORE; }
function staffAuth(event){ return require('./bid-inbox.js')._test.staffAuth(event); }

function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function nowIso(){ return new Date(exports._now ? exports._now() : Date.now()).toISOString(); }
function now(){ return exports._now ? exports._now() : Date.now(); }
function sha(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); if (!a.length || a.length !== b.length) return false; try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; } }
function isEmail(v){ return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s(v)); }
function digits(v){ return s(v).replace(/\D/g, ''); }
function tidyPhone(v){ const d = digits(v); if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6); if (d.length === 11 && d[0] === '1') return '(' + d.slice(1, 4) + ') ' + d.slice(4, 7) + '-' + d.slice(7); return s(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hdrs(event){ const h = {}; Object.keys((event && event.headers) || {}).forEach(k => { h[low(k)] = event.headers[k]; }); return h; }
function J(code, body){ return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'https://crm.grayco-cs.com', Vary: 'Origin',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, body: JSON.stringify(body) }; }
function site(){ return (env('CRM_URL') || env('PORTAL_BASE_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function endpoint(){ return site() + ENDPOINT_PATH; }

/* every reasonable spelling of a field (partners name them their own way) */
function pick(b, names){
  for (const n of names) {
    if (b[n] != null && typeof b[n] !== 'object' && s(b[n]) !== '') return s(b[n]);
    const k = Object.keys(b).find(x => low(x).replace(/[_\s-]/g, '') === n.replace(/[_\s-]/g, ''));
    if (k && b[k] != null && typeof b[k] !== 'object' && s(b[k]) !== '') return s(b[k]);
  }
  return '';
}

/* ── the codes ─────────────────────────────────────────────────────────────── */
function newKey(){ return 'gck_' + crypto.randomBytes(24).toString('base64').replace(/\+/g, 'A').replace(/\//g, 'B').replace(/=+$/, ''); }
function pub(k){ return { id: k.id, partner: k.partner, scopes: arr(k.scopes), note: s(k.note), expires: s(k.expires), prefix: s(k.prefix), createdBy: s(k.createdBy), createdAt: s(k.createdAt),
  revoked: !!k.revoked, revokedBy: s(k.revokedBy), revokedAt: s(k.revokedAt), lastUsed: s(k.lastUsed), count: k.count || 0, counts: k.counts || {}, lastKind: s(k.lastKind), lastError: s(k.lastError) }; }
async function keyList(){ return arr(await L().kvGet(KEYS_KV)).filter(k => k && k.id && k.hash); }
function expired(k, t){ const e = s(k.expires); if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return false; return t > Date.parse(e + 'T23:59:59-06:00'); }
/* which code was sent: every stored hash is compared (constant time each, no early exit) */
async function whichKey(given){
  given = s(given); if (!/^gck_[A-Za-z0-9_-]{20,}$/.test(given)) return null;
  const h = sha(given); let hit = null;
  (await keyList()).forEach(k => { if (same(k.hash, h) && !hit) hit = k; });
  return hit;
}
/* per code, per hour; and last used / how many — one write after the post */
function rateMax(){ const n = parseInt(env('PARTNER_API_RATE') || '120', 10); return isFinite(n) && n > 0 ? n : 120; }
async function claimRate(id){
  let ok = true; const t = now(), hour = Math.floor(t / 3600000);
  await L().kvCas(KEYS_KV, v => {
    const list = arr(v), k = list.find(x => x && x.id === id); if (!k) return undefined;
    if (k.rlHour !== hour) { k.rlHour = hour; k.rlN = 0; }
    if ((k.rlN || 0) >= rateMax()) { ok = false; return undefined; }
    k.rlN = (k.rlN || 0) + 1; return list;
  });
  return ok;
}
async function noteUse(id, kind, okd, why){
  try {
    await L().kvCas(KEYS_KV, v => {
      const list = arr(v), k = list.find(x => x && x.id === id); if (!k) return undefined;
      k.lastUsed = nowIso(); k.lastKind = kind;
      if (okd) { k.count = (k.count || 0) + 1; k.counts = Object.assign({}, k.counts); k.counts[kind] = (k.counts[kind] || 0) + 1; k.lastError = ''; }
      else k.lastError = clip(why, 160);
      return list;
    });
  } catch (e) {}
}

/* ── kind=lead / kind=bid → the Lead Inbox ─────────────────────────────────── */
function guessKind(t){
  t = low(t);
  if (/insur|claim|storm|hail|wind|mitigat|water damage|fire damage/.test(t)) return 'insurance';
  if (/commercial|government|gc\b|general contractor|municipal|school|county|city of/.test(t)) return 'commercial';
  return 'residential';
}
function dueOk(v){ return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s(v)); }
function readLead(b){
  const first = pick(b, ['first_name', 'firstname']), last = pick(b, ['last_name', 'lastname']);
  return {
    name: pick(b, ['name', 'full_name', 'fullname', 'customer_name', 'contact_name', 'homeowner']) || [first, last].filter(Boolean).join(' '),
    phone: pick(b, ['phone', 'phone_number', 'mobile', 'cell', 'telephone']), email: low(pick(b, ['email', 'email_address'])),
    address: pick(b, ['address', 'street', 'street_address', 'address1', 'property_address', 'job_address']), city: pick(b, ['city', 'town']),
    state: pick(b, ['state', 'region']).toUpperCase().slice(0, 2), zip: pick(b, ['zip', 'zipcode', 'postal_code']),
    service: pick(b, ['service', 'service_type', 'type', 'job_type', 'trade', 'category', 'project_type']),
    message: pick(b, ['message', 'notes', 'note', 'description', 'details', 'comments', 'scope']),
    externalId: pick(b, ['external_id', 'externalid', 'lead_id', 'id', 'reference', 'ref'])
  };
}
async function postLead(key, b){
  const f = readLead(b);
  if (!f.name) return { code: 400, body: { ok: false, error: 'name is required (the customer\'s name).', field: 'name' } };
  if (!isEmail(f.email) && digits(f.phone).length < 10) return { code: 400, body: { ok: false, error: 'A phone number (10 digits) or an e-mail address is required so GrayCo can reach the customer.', field: 'phone' } };
  if (f.email && !isEmail(f.email)) return { code: 400, body: { ok: false, error: 'email does not look like an e-mail address.', field: 'email' } };
  const at = nowIso(), src = key.partner;
  const seed = 'partner|' + key.id + '|' + (f.externalId || [low(f.name), digits(f.phone), f.email, low(f.address), at.slice(0, 10)].join('|'));
  const id = L().itemId(seed), type = guessKind(f.service + ' ' + f.message);
  const where = s(f.address).split(',')[0] || f.city;
  const rec = {
    id, title: [f.service ? clip(f.service, 40) : 'Lead', f.name, where].filter(Boolean).join(' — ').slice(0, 200), source: src, sourceKind: 'partner', sourceRef: f.externalId || 'API',
    type, address: f.address, city: f.city, state: f.state, zip: f.zip, bidDue: '', scope: clip(f.message, 600), gc: '', owner: '', bidNumber: '',
    contact: { name: f.name, email: f.email, phone: tidyPhone(f.phone) }, plansLinks: [], files: [], emails: [], emailIds: [],
    notes: ['Posted by ' + src + ' through the GrayCo partner API, ' + at.slice(0, 16).replace('T', ' ') + ' UTC.'].concat(f.service ? ['Service: ' + f.service] : []).concat(f.externalId ? ['Their reference: ' + f.externalId] : []),
    origin: 'partner', partnerLead: true, partner: src,
    leadExtra: { partnerLead: true, partner: src, leadSource: src, owner: 'GrayCo', grayCoLead: true, contactName: f.name, receivedAt: at, unassigned: true, externalId: f.externalId },
    needsReview: false, dueUnknown: false
  };
  let action = '';
  await L().kvCas(L().KV, v => { const o = L().upsert(arr(v), rec); action = o.action; return o.items; });
  if (action === 'added' && env('LEAD_INTAKE_ALERTS') !== '0') {
    try { const c = rec.contact; await L().alertsApi().notifyNew([Object.assign({}, rec, { detail: [f.service, c.phone, c.email, clip(rec.scope, 140)].filter(Boolean).join(' · ') })], { source: src }); } catch (e) {}
  }
  return { code: 200, body: { ok: true, id, duplicate: action !== 'added' || undefined } };
}
async function postBid(key, b){
  const title = pick(b, ['title', 'project', 'project_name', 'name']);
  const due = pick(b, ['bid_due', 'biddue', 'due', 'due_date', 'bid_date']);
  const dueTo = pick(b, ['due_to', 'dueto', 'due_to_company', 'gc', 'general_contractor', 'owner', 'agency', 'company']);
  if (!title) return { code: 400, body: { ok: false, error: 'title is required (the project name).', field: 'title' } };
  if (!dueOk(due)) return { code: 400, body: { ok: false, error: 'bid_due is required: YYYY-MM-DD, or YYYY-MM-DDTHH:MM (Central time).', field: 'bid_due' } };
  if (!dueTo) return { code: 400, body: { ok: false, error: 'due_to is required (the company the bid goes to).', field: 'due_to' } };
  const at = nowIso(), src = key.partner, ext = pick(b, ['external_id', 'externalid', 'bid_id', 'id', 'reference']);
  const plans = pick(b, ['plans_url', 'plans', 'plans_link', 'link', 'url']);
  const typeIn = low(pick(b, ['type', 'lead_type', 'kind_of_work']));
  const type = /^(commercial|government|residential|insurance)$/.test(typeIn) ? typeIn : 'commercial';
  const id = L().itemId('partner-bid|' + key.id + '|' + (ext || low(title) + '|' + due));
  const method = low(pick(b, ['submit_method', 'method']));
  const rec = {
    id, title: clip(title, 200), source: src, sourceKind: 'partner', sourceRef: ext || 'API', type,
    address: pick(b, ['address', 'street', 'location']), city: pick(b, ['city']), state: pick(b, ['state']).toUpperCase().slice(0, 2), zip: pick(b, ['zip']),
    bidDue: due, scope: clip(pick(b, ['scope', 'description', 'details', 'notes', 'message']), 600), gc: dueTo, owner: '', bidNumber: pick(b, ['bid_number', 'bidnumber', 'rfp', 'number']),
    dueToCompany: clip(dueTo, 120), dueToContact: clip(pick(b, ['due_to_contact', 'contact', 'contact_name']), 80), dueToEmail: low(pick(b, ['due_to_email', 'contact_email'])),
    dueToPhone: tidyPhone(pick(b, ['due_to_phone', 'contact_phone'])), submitMethod: /^(email|portal|sealed|in_person|other)$/.test(method) ? method : (method ? 'other' : ''), submitWhere: clip(pick(b, ['submit_where', 'submit_to']), 200),
    contact: { name: clip(pick(b, ['due_to_contact', 'contact', 'contact_name']), 80), email: low(pick(b, ['due_to_email', 'contact_email'])), phone: tidyPhone(pick(b, ['due_to_phone', 'contact_phone'])) },
    plansLinks: /^https?:\/\//.test(plans) ? [{ url: plans, label: 'Plans (from ' + src + ')', board: '' }] : [], files: [], emails: [], emailIds: [],
    notes: ['Posted by ' + src + ' through the GrayCo partner API, ' + at.slice(0, 16).replace('T', ' ') + ' UTC.'].concat(ext ? ['Their reference: ' + ext] : []),
    origin: 'partner-bid', partner: src, leadExtra: { partner: src, partnerBid: true, leadSource: src, externalId: ext }, needsReview: false, dueUnknown: false
  };
  let action = '', items = [];
  await L().kvCas(L().KV, v => { const o = L().upsert(arr(v), rec); action = o.action; items = o.items; return o.items; });
  try { await L().afterStore([{ id, action }], items, {}); } catch (e) {}
  return { code: 200, body: { ok: true, id, duplicate: action !== 'added' || undefined } };
}

/* ── kind=job → an approval for the admins (To-Do; Launch Job filled in) ───── */
async function adminsTo(){ try { return await L().alertsApi().recipients(); } catch (e) { return []; } }
async function mailAdmins(subject, html, text){
  const key = env('RESEND_API_KEY'); if (!key) return false;
  const to = await adminsTo(); if (!to.length) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to, subject: require('./_lib/mailtag.js').tag(subject, to, 'approval'), html, text, headers: { 'X-GrayCo-CRM': 'partner-api' } }) });
    return r.ok;
  } catch (e) { return false; }
}
async function postJob(key, b){
  const job = {
    name: clip(pick(b, ['name', 'job_name', 'project', 'project_name', 'title']), 120), client: clip(pick(b, ['client', 'customer', 'customer_name', 'homeowner', 'owner']), 120),
    address: clip(pick(b, ['address', 'job_address', 'property_address', 'street']), 200), clientPhone: tidyPhone(pick(b, ['phone', 'client_phone', 'customer_phone'])),
    clientEmail: low(pick(b, ['email', 'client_email', 'customer_email'])), type: clip(pick(b, ['type', 'job_type', 'work_type']), 60), scope: clip(pick(b, ['scope', 'description', 'work', 'details']), 2000),
    contract: (function(){ const n = parseFloat(pick(b, ['contract', 'amount', 'price', 'contract_amount']).replace(/[$,\s]/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : ''; })(),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(pick(b, ['start_date', 'start'])) ? pick(b, ['start_date', 'start']) : '',
    notes: clip(pick(b, ['notes', 'note', 'message', 'comments']), 1000), externalId: clip(pick(b, ['external_id', 'externalid', 'work_order', 'wo', 'id', 'reference']), 80)
  };
  if (!job.name) return { code: 400, body: { ok: false, error: 'name is required (the job name).', field: 'name' } };
  if (!job.client) return { code: 400, body: { ok: false, error: 'client is required (the customer).', field: 'client' } };
  if (!job.address) return { code: 400, body: { ok: false, error: 'address is required (the job address).', field: 'address' } };
  const id = 'PJ_' + sha('job|' + key.id + '|' + (job.externalId || low(job.name) + '|' + low(job.address))).slice(0, 14).toUpperCase();
  const at = nowIso(), src = key.partner;
  const item = { id, kind: 'partner_job', label: '🚀 New job from ' + src + ': ' + job.name, note: [job.client, job.address, job.contract ? '$' + Number(job.contract).toLocaleString('en-US') : '', clip(job.scope, 160)].filter(Boolean).join(' · '),
    partner: src, partnerKeyId: key.id, job, prio: 'high', addedBy: src + ' (API)', addedAt: at, updatedAt: at, done: false };
  const has = l => l.some(t => s(t.id) === id);
  const r = await core().kvListUpdate('gc_office_tasks', l => has(l) ? null : { list: l.concat([item]), check: has });
  if (!r.ok) return { code: 503, body: { ok: false, error: 'The CRM was busy — please send it again in a minute.' } };
  if (!r.unchanged) {
    const subject = '🚀 New job from ' + src + ' waiting for approval: ' + job.name;
    const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(subject) + '</div><div style="padding:6px 18px 18px">'
      + '<p><b>' + esc(src) + '</b> sent a new job through the GrayCo partner API. It is <b>not</b> a job yet: approve it on your To-Do (✅ Needs approval), check it, and create it in Launch Job.</p>'
      + '<p><b>' + esc(job.name) + '</b><br>' + esc(job.client) + '<br>' + esc(job.address) + (job.contract ? '<br>Contract: $' + esc(Number(job.contract).toLocaleString('en-US')) : '') + (job.scope ? '<br><span style="color:#555">' + esc(clip(job.scope, 400)) + '</span>' : '') + '</p>'
      + '<p><a href="' + esc(site()) + '/#todo" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open To-Do in the CRM</a></p></div></div>';
    try { await mailAdmins(subject, html, subject + '\n\n' + [job.name, job.client, job.address, job.scope].filter(Boolean).join('\n') + '\n\n' + site() + '/#todo'); } catch (e) {}
  }
  return { code: 200, body: { ok: true, id, duplicate: r.unchanged || undefined } };
}

/* ── kind=note → the job's message board and its PM's To-Do ───────────────── */
function poOf(p){ return [p.autoPO, p.po, p.poNumber].map(x => low(x)).filter(Boolean); }
async function postNote(key, b){
  const po = pick(b, ['po', 'po_number', 'ponumber', 'job_po']), text = clip(pick(b, ['text', 'note', 'message', 'update', 'body']), 2000), author = clip(pick(b, ['author', 'from', 'by', 'name']), 60);
  if (!po) return { code: 400, body: { ok: false, error: 'po is required (the GrayCo PO number of the job).', field: 'po' } };
  if (!text) return { code: 400, body: { ok: false, error: 'text is required (the note).', field: 'text' } };
  let data = {}; try { data = await core().crmData(true); } catch (e) { return { code: 503, body: { ok: false, error: 'The CRM could not be read — please send it again in a minute.' } }; }
  const dead = {}; arr(data.gc_deleted_projects).forEach(x => { dead[s(x)] = 1; });
  const want = low(po).replace(/^po\s*#?\s*/, '');
  const p = arr(data.projects).find(x => x && x.id && !dead[s(x.id)] && x.deleted !== true && poOf(x).indexOf(want) >= 0);
  if (!p) return { code: 404, body: { ok: false, error: 'No GrayCo job has PO ' + po + '.', field: 'po' } };
  const pm = core().pmOf(data, p), u = pm ? arr(data.users).find(x => x && low(x.name) === low(pm.name)) : null;
  const at = nowIso(), src = key.partner, mid = 'M_API_' + sha(key.id + '|' + p.id + '|' + text + '|' + at.slice(0, 13)).slice(0, 12);
  const msg = { id: mid, pid: s(p.id), authorId: 'api:' + key.id, authorName: src + (author ? ' — ' + author : '') + ' (API)', text: '🔌 ' + text, tags: u ? [s(u.id || u.email || u.name)] : [], at, source: 'api' };
  const hasM = l => l.some(m => s(m.id) === mid);
  const r1 = await core().kvListUpdate('gc_job_messages', l => hasM(l) ? null : { list: l.concat([msg]), check: hasM });
  if (!r1.ok) return { code: 503, body: { ok: false, error: 'The CRM was busy — please send it again in a minute.' } };
  const tid = 'APINOTE_' + mid;
  const task = { id: tid, kind: 'partner_note', label: '📝 Update from ' + src + ' — PO ' + s(p.autoPO || p.po) + ' · ' + s(p.name) + ': ' + clip(text, 90), note: text, pid: s(p.id),
    assignees: pm ? [pm.name] : [], addedBy: src + ' (API)', addedAt: at, updatedAt: at, done: false };
  const hasT = l => l.some(t => s(t.id) === tid);
  try { await core().kvListUpdate('gc_office_tasks', l => hasT(l) ? null : { list: l.concat([task]), check: hasT }); } catch (e) {}
  return { code: 200, body: { ok: true, id: mid } };
}

/* ── instructions for a partner (never the code) ───────────────────────────── */
function instructions(k){
  const url = endpoint(), sc = arr(k.scopes);
  const ex = {
    lead: { kind: 'lead', name: 'Jane Doe', phone: '901-555-1212', email: 'jane@example.com', address: '123 Main St', city: 'Bartlett', state: 'TN', zip: '38135', service: 'Roof replacement', message: 'Leak over the kitchen', external_id: 'YOUR-LEAD-ID' },
    bid: { kind: 'bid', title: 'Collierville Medical Office — Roofing', bid_due: '2026-11-05T14:00', due_to: 'Montgomery Martin Contractors', due_to_contact: 'Pat Smith', due_to_email: 'bids@example.com', submit_method: 'email', address: '1450 W Poplar Ave', city: 'Collierville', state: 'TN', plans_url: 'https://example.com/plans', external_id: 'YOUR-BID-ID' },
    job: { kind: 'job', name: 'Doe Roof Replacement', client: 'Jane Doe', address: '123 Main St, Bartlett, TN 38135', phone: '901-555-1212', email: 'jane@example.com', type: 'Roofing', scope: 'Tear off and replace 28 squares', contract: 14500, start_date: '2026-11-10', external_id: 'YOUR-WORK-ORDER' },
    note: { kind: 'note', po: '26-1042', text: 'Adjuster approved the supplement.', author: 'Pat Smith' }
  };
  const lines = [
    'GrayCo Construction Services — how ' + k.partner + ' sends to the GrayCo CRM',
    '',
    'Send an HTTPS POST with a JSON body to:',
    '  ' + url,
    'Put your GrayCo code in the header:  x-api-key: <your code>',
    '(GrayCo sends the code separately. Keep it secret; it only works for: ' + sc.map(x => SCOPE_LABEL[x] || x).join(', ') + '.)',
    '',
    'Answer: 200 {"ok":true,"id":"…"} when it is in. 400 says which field is missing or wrong. 401 = wrong code. 403 = the code is not allowed to send that, has expired or was turned off. 429 = too many in one hour — wait and send again.',
    ''
  ];
  sc.forEach(x => {
    const need = { lead: 'Required: name, and a phone or an e-mail. Optional: address, city, state, zip, service, message, external_id.',
      bid: 'Required: title, bid_due (YYYY-MM-DD or YYYY-MM-DDTHH:MM, Central time), due_to (the company the bid goes to). Optional: due_to_contact, due_to_email, due_to_phone, submit_method (email / portal / sealed / in_person), submit_where, address, city, state, type, scope, plans_url, bid_number, external_id.',
      job: 'Required: name, client, address. Optional: phone, email, type, scope, contract, start_date (YYYY-MM-DD), notes, external_id. GrayCo reviews each job before it is created.',
      note: 'Required: po (the GrayCo PO number), text. Optional: author.' }[x];
    lines.push('── ' + (SCOPE_LABEL[x] || x) + ' ──', need, 'Example:',
      "curl -X POST '" + url + "' -H 'Content-Type: application/json' -H 'x-api-key: YOUR-GRAYCO-CODE' -d '" + JSON.stringify(ex[x]).replace(/'/g, "'\\''") + "'", '');
  });
  lines.push('Sending the same external_id again updates nothing and makes no duplicate.', 'Questions: GrayCo Construction Services, 901-585-0944.');
  return lines.join('\n');
}

/* ── the handler ───────────────────────────────────────────────────────────── */
exports.handler = async function(event){
  const m = event.httpMethod || 'GET', qs = event.queryStringParameters || {}, h = hdrs(event);
  if (m === 'OPTIONS') return J(204, {});
  if (m === 'GET' && qs.ping === '1') return J(200, { ok: true, service: 'GrayCo partner API', database: L().dbReady(), off: env('PARTNER_API_OFF') === '1' });
  if (!L().dbReady()) return J(503, { ok: false, error: 'The CRM database is not configured.' });

  /* admins, from the CRM */
  if (qs.keys === '1' || qs.act || qs.instructions) {
    const who = await staffAuth(event);
    if (!who.ok) return J(who.code || 401, { ok: false, error: who.error });
    if (!who.admin) return J(403, { ok: false, error: 'Only an owner or admin can manage API codes.' });
    if (m === 'GET' && qs.keys === '1') return J(200, { ok: true, endpoint: endpoint(), scopes: SCOPES.map(x => ({ id: x, label: SCOPE_LABEL[x] })), keys: (await keyList()).map(pub).sort((a, b) => s(b.createdAt).localeCompare(s(a.createdAt))) });
    if (m === 'GET' && qs.instructions) { const k = (await keyList()).find(x => x.id === s(qs.instructions)); if (!k) return J(404, { ok: false, error: 'No such code.' }); return J(200, { ok: true, text: instructions(k) }); }
    if (m !== 'POST') return J(405, { ok: false, error: 'Method not allowed' });
    let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { ok: false, error: 'Body must be JSON.' }); }
    if (qs.act === 'create') {
      const partner = clip(b.partner, 60).replace(/[<>]/g, '');
      const scopes = arr(b.scopes).map(low).filter((x, i, a) => SCOPES.indexOf(x) >= 0 && a.indexOf(x) === i);
      const expires = /^\d{4}-\d{2}-\d{2}$/.test(s(b.expires)) ? s(b.expires) : '';
      if (partner.length < 2) return J(400, { ok: false, error: 'Give the partner a name.', field: 'partner' });
      if (!scopes.length) return J(400, { ok: false, error: 'Tick at least one thing they may send.', field: 'scopes' });
      const key = newKey(), rec = { id: 'PK_' + crypto.randomBytes(5).toString('hex'), partner, scopes, note: clip(b.note, 300), expires, hash: sha(key), prefix: key.slice(0, 8) + '…',
        createdBy: who.name || who.email, createdByEmail: who.email, createdAt: nowIso(), revoked: false, count: 0, counts: {} };
      await L().kvCas(KEYS_KV, v => arr(v).concat([rec]));
      return J(200, { ok: true, key, rec: pub(rec), endpoint: endpoint(), shownOnce: true });
    }
    if (qs.act === 'revoke') {
      let hit = null;
      await L().kvCas(KEYS_KV, v => { const list = arr(v), k = list.find(x => x && x.id === s(b.id)); if (!k || k.revoked) return undefined; k.revoked = true; k.revokedAt = nowIso(); k.revokedBy = who.name || who.email; hit = k; return list; });
      if (!hit) { const k = (await keyList()).find(x => x.id === s(b.id)); if (!k) return J(404, { ok: false, error: 'No such code.' }); return J(200, { ok: true, rec: pub(k), already: true }); }
      return J(200, { ok: true, rec: pub(hit) });
    }
    return J(400, { ok: false, error: 'Unknown request.' });
  }

  /* a partner */
  if (m !== 'POST') return J(405, { ok: false, error: 'POST JSON with your x-api-key.' });
  if (env('PARTNER_API_OFF') === '1') return J(503, { ok: false, error: 'GrayCo is not taking posts right now — please try again later.' });
  const given = s(h['x-api-key']) || s(h.authorization).replace(/^Bearer\s+/i, '');
  const key = await whichKey(given);
  if (!key) return J(401, { ok: false, error: 'Not authorised: check your GrayCo code (header x-api-key).' });
  if (key.revoked) return J(403, { ok: false, error: 'This code was turned off by GrayCo.' });
  if (expired(key, now())) return J(403, { ok: false, error: 'This code expired on ' + key.expires + '.' });
  let body; try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}')); } catch (e) { return J(400, { ok: false, error: 'The body must be JSON.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return J(400, { ok: false, error: 'The body must be one JSON object.' });
  if (s(event.body).length > 200000) return J(413, { ok: false, error: 'Too large.' });
  const kind = low(body.kind || body.type_of_post || qs.kind);
  if (SCOPES.indexOf(kind) < 0) return J(400, { ok: false, error: 'kind is required: lead, bid, job or note.', field: 'kind' });
  if (arr(key.scopes).indexOf(kind) < 0) { await noteUse(key.id, kind, false, 'not allowed: ' + kind); return J(403, { ok: false, error: 'This code may not send ' + (SCOPE_LABEL[kind] || kind).toLowerCase() + '. It may send: ' + arr(key.scopes).map(x => SCOPE_LABEL[x] || x).join(', ') + '.' }); }
  if (!(await claimRate(key.id))) return J(429, { ok: false, error: 'Too many posts this hour — please wait and send again.' });
  let r;
  try {
    const src = Object.assign({}, body, body.data && typeof body.data === 'object' ? body.data : {});
    r = kind === 'lead' ? await postLead(key, src) : kind === 'bid' ? await postBid(key, src) : kind === 'job' ? await postJob(key, src) : await postNote(key, src);
  } catch (e) { r = { code: 503, body: { ok: false, error: 'GrayCo\'s CRM could not take it right now — please send it again in a minute.' } }; console.error('[partner-api] ' + kind + ' failed: ' + (e && e.message)); }
  await noteUse(key.id, kind, r.code === 200, r.body && r.body.error);
  return J(r.code, r.body);
};
exports._test = { instructions, readLead, newKey, sha, expired, whichKey, KEYS_KV, SCOPES };
