/* ============================================================================
   GrayCo — THE WEBSITE → THE CRM.   netlify/functions/website-intake.js   (patch WEB)

   Owner (10/21): the website (Squarespace, grayco-cs.com) — leads, inquiries, job applications and everything
   else land in the CRM as GrayCo leads, unassigned; the admin assigns them to a PM. And an "instant roof price
   from the address" widget.

   What the public can do (no sign-in; the embeddable form website-form.js, or Zapier):
     GET  ?form=1                 → { token, turnstileSiteKey, types, positions, priced }   (the form asks first)
     POST (body: the form)        → one form: estimate · storm · commercial · maintenance · problem · careers
     POST ?act=roofprice          → the instant roof price: name + phone + e-mail + address FIRST, then the range
     GET  ?ping=1                 → alive, and what is switched on
   Every lead:   one item in the 📥 Lead Inbox (gc_lead_inbox, bid-inbox.js) with source "Website (grayco-cs.com)",
                 NO PM, owner GrayCo (commission source "grayco"); the CRM makes it a lead on the Lead Pipeline
                 (patch LD2 + WEB). The admins get the new-lead e-mail at once (patch LA, _lib/bid-alerts.js).
                 No bid-portal draft, no Senior Estimator.
                 An existing customer (same e-mail, or the same phone number) → the lead says so and the CRM puts a
                 note on that customer's job.
                 The optional instant reply to the customer goes on ✅ Approvals (owner rule: nothing goes to a
                 customer without approval; PORTAL_AUTO_EMAIL=1 sends it straight away, as for every other e-mail).
   leads@:       (patch STL) leads@grayco-cs.com is a Google Group like bids@; its member leads@in.grayco-cs.com reaches
                 the bid-inbox webhook, which hands the e-mail here (fromEmail): a Squarespace form notification
                 ("Name: … Email: … Phone: … Address: … Message: …") or a person writing in becomes the same unassigned
                 GrayCo lead, source "Website / leads@ e-mail" (no instant reply: the PM reaches out). A job application
                 goes to Hiring. Newsletters / bulk mail with no form in them are not leads.
   Applications: the Hiring list (the Hiring board (Admin → Hiring / Payroll → Hiring), gc_kv "candidates", admin-only under SEC2). They wait in the
                 service-only list "gc_website_apps" (gc_lead_inbox_kv) and an admin's CRM files them into Hiring
                 (GET ?list=1, POST ?act=imported, GET ?file=<id> for the résumé). The admins get an e-mail.
   Roof price:   the address → US Census geocoder → Google Solar (solar-lookup.js, RoofScout's key and monthly
                 limit) → roof area and pitch → × the price per square ranges an admin sets (gc_kv "roofPriceRanges";
                 "[PRICE]" placeholders until then, and the widget shows no price — "an estimator will call").
   Admin doors (CRM sign-in): GET ?settings=1 (staff) · POST ?settings=1 {roofPriceRanges} (admins).

   Spam: a honeypot field (silently dropped), a signed form token that must be 3 s – 24 h old, a per-IP rate limit,
   a link / length check, and Cloudflare Turnstile when TURNSTILE_SECRET is set. CORS: grayco-cs.com and www
   (+ WEBSITE_ORIGINS, + the Squarespace editor preview unless WEBSITE_SQSP_PREVIEW=0).

   ENV (Netlify): already set — SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, GOOGLE_SOLAR_API_KEY.
   Optional — TURNSTILE_SITE_KEY + TURNSTILE_SECRET (Cloudflare), WEBSITE_ZAPIER_KEY (Zapier posts with header
   x-api-key), WEBSITE_AUTO_REPLY=0 (no reply to the customer), WEBSITE_ORIGINS, WEBSITE_FORM_SECRET,
   WEBSITE_MIN_SECONDS (3), WEBSITE_RATE (5 forms per IP per 10 min), WEBSITE_ROOF_RATE (4 roof prices per IP per day).
   ========================================================================== */
'use strict';
const crypto = require('crypto');

const SOURCE = 'Website (grayco-cs.com)';
const KV_APPS = 'gc_website_apps', KV_RL = 'gc_website_rl', KV_PRICES = 'roofPriceRanges';
const DEFAULT_ORIGINS = ['https://grayco-cs.com', 'https://www.grayco-cs.com'];
const CRM_ORIGINS = ['https://graycocrm1.netlify.app', 'https://crm.grayco-cs.com'];
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESUME_MAX = 4 * 1024 * 1024;
const RESUME_TYPES = { 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'text/plain': 'txt', 'image/jpeg': 'jpg', 'image/png': 'png' };

/* the six forms: what the visitor picks, how the lead is typed on the Lead Pipeline */
const TYPES = {
  estimate:    { label: 'Free estimate request', kind: 'residential', short: 'Free estimate' },
  storm:       { label: 'Storm / insurance damage', kind: 'insurance', short: 'Storm / insurance damage' },
  commercial:  { label: 'Commercial bid inquiry', kind: 'commercial', short: 'Commercial bid inquiry' },
  maintenance: { label: 'Maintenance plan sign-up', kind: 'residential', short: 'Maintenance plan' },
  problem:     { label: 'Report a problem (existing customer)', kind: 'residential', short: 'Problem report' },
  careers:     { label: 'Job application (careers)', kind: 'careers', short: 'Job application' },
  roofprice:   { label: 'Instant roof price', kind: 'residential', short: 'Instant roof price' },
  referral:    { label: 'Referral program', kind: 'residential', short: 'Referral program' },   /* patch REF: join (and refer a friend) */
  magnet:      { label: 'Free guide download', kind: 'residential', short: 'Guide download' },   /* patch MKT2: lead magnets */
  partner:     { label: 'Referral partner sign-up', kind: 'partner', short: 'Partner sign-up' }   /* patch MKT2: realtors, agents, managers */
};
const POSITIONS = ['Project Manager', 'Superintendent', 'Estimator', 'Carpenter', 'Roofer', 'Laborer', 'Office / Admin', 'Other'];

/* the seed: no prices until an admin types them (Leads → 🌐 Website → Roof prices) */
const PRICE_SEED = {
  unit: 'square', wastePct: 10, note: 'Tear-off and replace, architectural shingles. Ballpark only — the final price comes after a free inspection.',
  tiers: [
    { id: 'low', label: 'Low slope (up to 4/12)', maxRise: 4, min: '[PRICE]', max: '[PRICE]' },
    { id: 'standard', label: 'Standard (5/12 – 7/12)', maxRise: 7, min: '[PRICE]', max: '[PRICE]' },
    { id: 'steep', label: 'Steep (8/12 and up)', maxRise: 99, min: '[PRICE]', max: '[PRICE]' }
  ]
};

/* ── small helpers ─────────────────────────────────────────────────────────── */
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function s(v){ return (v == null ? '' : String(v)).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function nowIso(){ return new Date().toISOString(); }
function clip(v, n){ v = s(v).replace(/\s+\n/g, '\n'); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function digits(v){ return s(v).replace(/[^\d]/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidyPhone(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function isEmail(v){ return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s(v)); }
function hdrs(event){ const h = {}; Object.keys((event && event.headers) || {}).forEach(k => { h[low(k)] = event.headers[k]; }); return h; }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); if (!a.length || a.length !== b.length) return false; try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; } }
function money(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
function L(){ return require('./bid-inbox.js')._lib; }
function core(){ return require('./portal.js')._core; }
function REF(){ return require('./_lib/referral.js'); }   /* patch REF */
function ipOf(event){ const h = hdrs(event); return s(h['x-nf-client-connection-ip'] || s(h['x-forwarded-for']).split(',')[0] || h['client-ip']) || 'unknown'; }

/* ── CORS: the website (and the CRM, for the admin doors) ─────────────────── */
function origins(){ return DEFAULT_ORIGINS.concat(CRM_ORIGINS, env('WEBSITE_ORIGINS').split(','), env('SITE_ORIGIN').split(',')).map(x => s(x).replace(/\/$/, '')).filter(Boolean); }
function originOk(o){
  o = s(o).replace(/\/$/, ''); if (!o) return false;
  if (origins().indexOf(o) >= 0) return true;
  return env('WEBSITE_SQSP_PREVIEW') !== '0' && /^https:\/\/[a-z0-9-]+\.squarespace\.com$/i.test(o);   /* the Squarespace editor's preview */
}
function cors(event){
  const o = s(hdrs(event).origin).replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': originOk(o) ? o : DEFAULT_ORIGINS[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' };
}
function J(event, code, body){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(event)), body: JSON.stringify(body) }; }

/* ── spam: the signed form token, the rate limit, Turnstile ───────────────── */
function secret(){ return env('WEBSITE_FORM_SECRET') || crypto.createHash('sha256').update('grayco-website-form:' + (env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || 'dev')).digest('hex'); }
function sign(x){ return crypto.createHmac('sha256', secret()).update(x).digest('base64url').slice(0, 32); }
function newToken(nowMs){ const x = (nowMs || Date.now()).toString(36) + '.' + crypto.randomBytes(6).toString('base64url'); return x + '.' + sign(x); }
function tokenAge(tok, nowMs){
  const p = s(tok).split('.'); if (p.length !== 3) return { ok: false, why: 'no form token' };
  if (!same(sign(p[0] + '.' + p[1]), p[2])) return { ok: false, why: 'bad form token' };
  const age = ((nowMs || Date.now()) - parseInt(p[0], 36)) / 1000;
  const min = parseFloat(env('WEBSITE_MIN_SECONDS') || '3');
  if (!(age >= min)) return { ok: false, why: 'too fast', fast: true };
  if (age > 24 * 3600) return { ok: false, why: 'form too old', old: true };
  return { ok: true, age };
}
const HITS = new Map();   /* per function instance: ip|bucket → [times] */
function rateLimited(ip, bucket, max, windowMs){
  const k = ip + '|' + bucket, t = Date.now(), list = (HITS.get(k) || []).filter(x => t - x < windowMs);
  if (list.length >= max) { HITS.set(k, list); return true; }
  list.push(t); HITS.set(k, list);
  if (HITS.size > 5000) HITS.delete(HITS.keys().next().value);
  return false;
}
/* the roof price costs a Google lookup: also a per-IP daily cap kept in the database (every instance sees it) */
async function roofQuota(ip){
  const max = parseInt(env('WEBSITE_ROOF_RATE') || '4', 10), day = nowIso().slice(0, 10);
  let ok = true;
  try {
    await L().kvCas(await privKey(KV_RL), v => {
      const st = v && v.day === day ? v : { day, ips: {} };
      const n = st.ips[ip] || 0;
      if (n >= max) { ok = false; return undefined; }
      st.ips[ip] = n + 1; return st;
    });
  } catch (e) { /* the database hiccupped: the in-memory limit still applies */ }
  return ok;
}
async function turnstileOk(tok, ip){
  const sec = env('TURNSTILE_SECRET'); if (!sec) return { ok: true, off: true };
  if (!s(tok)) return { ok: false, why: 'Please complete the "I am human" check.' };
  try {
    const r = await fetch(TURNSTILE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'secret=' + encodeURIComponent(sec) + '&response=' + encodeURIComponent(s(tok)) + (ip && ip !== 'unknown' ? '&remoteip=' + encodeURIComponent(ip) : '') });
    const j = await r.json().catch(() => ({}));
    return j && j.success ? { ok: true } : { ok: false, why: 'The "I am human" check did not pass — please try again.' };
  } catch (e) { return { ok: false, why: 'Could not check the "I am human" box — please try again.' }; }
}
function looksSpammy(f){
  const all = [f.name, f.message, f.company, f.address].join(' ');
  if ((all.match(/https?:\/\//gi) || []).length > 3) return 'too many links';
  if (/\b(viagra|casino|crypto ?currency|seo services|backlinks?|loan offer)\b/i.test(all)) return 'spam words';
  if (/<a\s|\[url=/i.test(all)) return 'html links';
  return '';
}

/* ── what they sent (our form, or Zapier from a Squarespace form with any field names) ── */
function pick(b, names){
  for (const n of names) {
    if (b[n] != null && s(b[n]) !== '') return s(b[n]);
    const hit = Object.keys(b).find(k => low(k).replace(/[_\s-]/g, '') === n.replace(/[_\s-]/g, ''));
    if (hit && s(b[hit]) !== '' && typeof b[hit] !== 'object') return s(b[hit]);
  }
  return '';
}
function typeOf(v, b){
  const t = low(v);
  if (TYPES[t]) return t;
  if (/referr|refer a friend|gift card/.test(t)) return 'referral';   /* patch REF */
  if (/career|job|employ|apply|application|hiring/.test(t)) return 'careers';
  if (/storm|insur|hail|wind|claim/.test(t)) return 'storm';
  if (/commercial|bid|gc|general contractor/.test(t)) return 'commercial';
  if (/mainten|plan|tune/.test(t)) return 'maintenance';
  if (/problem|issue|leak|warranty|service|repair request|existing/.test(t)) return 'problem';
  if (/roof ?price|instant/.test(t)) return 'roofprice';
  return 'estimate';
}
function readForm(b){
  b = b && typeof b === 'object' ? b : {};
  if (b.data && typeof b.data === 'object') b = Object.assign({}, b, b.data);
  const first = pick(b, ['first_name', 'firstname', 'fname']), last = pick(b, ['last_name', 'lastname', 'lname']);
  const f = {
    type: typeOf(pick(b, ['type', 'form', 'formtype', 'inquiry', 'inquirytype', 'subject', 'reason', 'service_type']), b),
    name: pick(b, ['name', 'full_name', 'fullname', 'your_name', 'contact_name']) || [first, last].filter(Boolean).join(' '),
    email: low(pick(b, ['email', 'email_address', 'emailaddress', 'your_email'])),
    phone: pick(b, ['phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'telephone']),
    address: pick(b, ['address', 'street', 'street_address', 'address1', 'property_address', 'job_address']),
    city: pick(b, ['city', 'town']), state: pick(b, ['state', 'region']).toUpperCase().slice(0, 2), zip: pick(b, ['zip', 'zipcode', 'postal_code', 'postcode']),
    message: pick(b, ['message', 'comments', 'notes', 'details', 'description', 'how_can_we_help', 'project_details']),
    company: pick(b, ['company', 'company_name', 'business', 'organization']),
    service: pick(b, ['service', 'services', 'work_type', 'project_type', 'what_do_you_need']),
    property: pick(b, ['property', 'property_type']),
    bestTime: pick(b, ['best_time', 'besttime', 'best_time_to_call', 'preferred_time']),
    damageDate: pick(b, ['damage_date', 'date_of_damage', 'storm_date']),
    carrier: pick(b, ['carrier', 'insurance', 'insurance_company', 'insurance_carrier']),
    claimFiled: pick(b, ['claim_filed', 'claimfiled', 'filed_claim']), claimNumber: pick(b, ['claim_number', 'claim_no', 'claim']),
    project: pick(b, ['project', 'project_name', 'projectname']), bidDue: pick(b, ['bid_due', 'biddue', 'due_date', 'bid_date']), plansLink: pick(b, ['plans', 'plans_link', 'planslink', 'link']),
    buildings: pick(b, ['buildings', 'roof_size', 'size']), plan: pick(b, ['plan', 'plan_type', 'frequency']),
    urgency: pick(b, ['urgency', 'how_urgent']),
    position: pick(b, ['position', 'job', 'role', 'applying_for']), experience: pick(b, ['experience', 'years', 'years_experience']),
    availability: pick(b, ['availability', 'start_date', 'available']),
    hp: s(b.website) || s(b.company_url) || s(b.hp_field), token: s(b.token || b._t), turnstile: s(b.turnstile || b['cf-turnstile-response']),
    resume: b.resume && typeof b.resume === 'object' ? b.resume : null,
    via: s(b.via) || '', page: clip(b.page, 300),
    howHeard: pick(b, ['howheard', 'how_heard', 'how_did_you_hear', 'how_did_you_hear_about_us', 'heard_about', 'hear_about_us', 'referral_source']),   /* patch X9 */
    /* patch REF: a member's referral code (their link ?ref=R-XXXXXX), how they know us, and the friend they refer */
    ref: pick(b, ['ref', 'referral_code', 'member_code', 'refcode']).slice(0, 20), howKnow: clip(pick(b, ['how_know', 'howknow', 'relationship', 'how_do_you_know_us']), 120),
    referred: { name: clip(pick(b, ['referred_name', 'friend_name', 'referral_name']), 80), email: low(pick(b, ['referred_email', 'friend_email'])), phone: pick(b, ['referred_phone', 'friend_phone']),
      address: clip(pick(b, ['referred_address', 'friend_address']), 200), note: clip(pick(b, ['referred_note', 'friend_note', 'referral_note']), 600) },
    /* patch MKT2: where the visitor came from (the website keeps the UTM tags, the ad click ids, a tracked-link code and a partner code) */
    attrib: (function(){ const a = {}; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gc', 'ref'].forEach(k => { const v = s(b[k] || (b.attrib && b.attrib[k])).slice(0, 120); if (v && /^[\w .:\/+-]+$/.test(v)) a[k] = v; }); return a; })(),
    guide: clip(b.guide, 60), partnerType: clip(b.partner_type || b.partnerType, 40)
  };
  if (!f.address && (f.city || f.zip)) f.address = '';
  ['name', 'company', 'project', 'service', 'property', 'position', 'carrier'].forEach(k => { f[k] = clip(f[k], 120); });
  f.message = clip(f.message, 3000); f.address = clip(f.address, 200);
  return f;
}
function fullAddr(f){ return [f.address, [f.city, [f.state, f.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', '); }

/* ── an existing customer? (same e-mail, or the same 10-digit phone) ────────── */
async function findCustomer(f){
  const em = low(f.email), ph = phone10(f.phone);
  if (!em && ph.length !== 10) return null;
  let d = {};
  try { d = await core().kvRead(['projects', 'customers', 'gc_deleted_projects']); } catch (e) { return null; }
  const dead = {}; arr(d.gc_deleted_projects).forEach(x => { dead[s(x)] = 1; });
  const hit = r => {
    const es = [r.clientEmail, r.email, r.customerEmail, r.contactEmail].map(low).filter(Boolean);
    const ps = [r.clientPhone, r.phone, r.customerPhone, r.contactPhone, r.cell].map(phone10).filter(x => x.length === 10);
    if (em && es.indexOf(em) >= 0) return 'email';
    if (ph.length === 10 && ps.indexOf(ph) >= 0) return 'phone';
    return '';
  };
  const jobs = arr(d.projects).filter(p => p && p.id && !dead[s(p.id)] && p.deleted !== true).map(p => ({ p, by: hit(p) })).filter(x => x.by)
    .sort((a, b) => s(b.p.updatedAt || b.p.created).localeCompare(s(a.p.updatedAt || a.p.created)));
  if (jobs.length) { const p = jobs[0].p; return { pid: s(p.id), job: s(p.name), client: s(p.client), pm: s(p.pm), by: jobs[0].by, jobs: jobs.length }; }
  const c = arr(d.customers).find(x => x && hit(x));
  return c ? { pid: '', customerId: s(c.id), client: s(c.name || c.company), by: hit(c), jobs: 0 } : null;
}

/* ── the lead: one Lead Inbox item ─────────────────────────────────────────── */
function leadTitle(f, T){ const where = s(f.address).split(',')[0] || f.city; return [T.short, f.company && f.type === 'commercial' ? f.company : f.name, where].filter(Boolean).join(' — ').slice(0, 200); }
function details(f){
  const out = [];
  const add = (k, v) => { if (s(v)) out.push(k + ': ' + s(v)); };
  add('Service', f.service); add('Property', f.property); add('Best time to call', f.bestTime);
  add('Date of damage', f.damageDate); add('Insurance carrier', f.carrier); add('Claim filed', f.claimFiled); add('Claim #', f.claimNumber);
  add('Company', f.company); add('Project', f.project); add('Bid due', f.bidDue); add('Plans', f.plansLink);
  add('Buildings / size', f.buildings); add('Plan', f.plan); add('Urgency', f.urgency);
  return out;
}
async function fileLead(f, extra){
  extra = extra || {};
  const T = TYPES[f.type] || TYPES.estimate, at = nowIso();
  /* the same person sending the same form the same day is one lead (a double click, a re-send); anyone else is a new one */
  const sid = extra.sid || crypto.createHash('sha256').update([f.type, low(f.email), phone10(f.phone), low(f.address), low(f.company), at.slice(0, 10)].join('|')).digest('hex').slice(0, 24);
  const id = L().itemId('website|' + sid);
  const cust = extra.customer === undefined ? await findCustomer(f) : extra.customer;
  const src = extra.source || SOURCE;
  const notes = [T.label + ' — ' + (extra.how || 'from the website form') + ', ' + at.slice(0, 16).replace('T', ' ') + ' UTC.'].concat(details(f));
  if (cust) notes.push('EXISTING CUSTOMER (same ' + cust.by + ')' + (cust.job ? ': ' + cust.job + (cust.pm ? ' — PM ' + cust.pm : '') : cust.client ? ': ' + cust.client : '') + '.');
  arr(extra.notes).forEach(n => notes.push(n));
  if (f.page) notes.push('Sent from ' + f.page);
  const leadExtra = { websiteLead: true, websiteForm: T.label, websiteType: f.type, leadSource: src, owner: 'GrayCo', commissionSource: 'grayco', grayCoLead: true,
    contactName: f.name, receivedAt: at, unassigned: true };
  if (cust) Object.assign(leadExtra, { existingCustomer: true, customerPid: cust.pid || '', customerJob: cust.job || '', customerName: cust.client || '', customerMatch: cust.by });
  if (extra.roofQuote) leadExtra.roofQuote = extra.roofQuote;
  if (f.howHeard) { try { const MX = require('./_lib/maint.js'); leadExtra.howHeard = MX.heardNorm(f.howHeard); } catch (e) { leadExtra.howHeard = clip(f.howHeard, 60); } }   /* patch X9: "How did you hear about us?" */
  if (f.type === 'commercial' && f.company) leadExtra.company = f.company;
  if (f.attrib && Object.keys(f.attrib).length) {   /* patch MKT2: the ad / link / partner the lead came from */
    const a = f.attrib; leadExtra.attrib = a; if (a.utm_campaign) leadExtra.utmCampaign = a.utm_campaign; if (a.gc) leadExtra.trackCode = a.gc;
    const src = low(a.utm_source), med = low(a.utm_medium);
    const ms = a.gclid || (/google/.test(src) && /cpc|ppc|paid|ads?$/.test(med)) ? 'Google Ads' : a.fbclid || (/facebook|instagram|^fb$|^ig$|meta/.test(src) && /cpc|ppc|paid|ads?$|social_paid/.test(med)) ? 'Facebook/Instagram Ads'
      : /nextdoor/.test(src) ? 'Nextdoor' : /gbp|business.?profile/.test(med + src) ? 'Google Business Profile' : /flyer|door|postcard/.test(med) ? 'Door hanger / postcard' : /sign|truck|shirt|uniform/.test(med) ? 'Yard sign' : src === 'partner' ? 'Referral' : '';
    if (ms && !leadExtra.howHeard) leadExtra.mkSource = ms;
  }
  if (extra.partner) { const p = extra.partner; Object.assign(leadExtra, { partnerCode: p.code, partnerName: p.name, partnerType: p.type, mkSource: 'Referral' }); notes.push('REFERRAL PARTNER: ' + p.name + (p.company ? ', ' + p.company : '') + ' (code ' + p.code + '). Their fee is paid after the job is hired (Marketing → 🤝 Referral partners).'); }
  if (f.type === 'magnet') leadExtra.softLead = true;
  const rec = {
    id, title: leadTitle(f, T), source: src, sourceKind: 'website', sourceRef: T.label, type: T.kind === 'careers' ? 'residential' : T.kind,
    address: f.address, city: f.city, state: f.state, zip: f.zip, bidDue: f.type === 'commercial' && /^\d{4}-\d{2}-\d{2}$/.test(f.bidDue) ? f.bidDue : '',
    scope: clip(f.message, 600), gc: '', owner: '', bidNumber: '',
    contact: { name: f.name, email: low(f.email), phone: tidyPhone(f.phone) },
    plansLinks: /^https?:\/\//.test(f.plansLink) ? [{ url: f.plansLink, label: 'Plans (from the website form)', board: '' }] : [],
    files: [], emails: [], emailIds: [], notes, origin: 'website', websiteForm: T.label, websiteLead: true, leadExtra,
    needsReview: false, dueUnknown: false
  };
  if (extra.formLabel) { rec.websiteForm = extra.formLabel; rec.sourceRef = extra.formLabel; leadExtra.websiteForm = extra.formLabel; }   /* patch AUTO6: "Missed call" */
  if (extra.title) rec.title = clip(extra.title, 200);
  if (extra.leadExtra) Object.assign(leadExtra, extra.leadExtra);
  if (extra.patch) Object.assign(rec, extra.patch);   /* patch AUTO5: a referral is not a website lead */
  let action = '';
  await L().kvCas(L().KV, v => { const o = L().upsert(arr(v), rec); action = o.action; return o.items; });
  if (action === 'added') { try { const p = await L().routeLead(id); if (p) Object.assign(rec, p); } catch (e) {} }   /* patch HOT2: routed by its type (lead roles) */
  return { id, rec, action, customer: cust };
}
/* patch LA's new-lead alert (admins, e-mail + push) — never holds up the visitor's answer */
async function alertLead(rec){
  if (env('LEAD_INTAKE_ALERTS') === '0') return { off: true };
  try {
    const c = rec.contact || {};
    return await L().alertsApi().notifyNew([Object.assign({}, rec, { detail: [rec.websiteForm, c.phone, c.email, rec.leadExtra && rec.leadExtra.existingCustomer ? 'existing customer' : '',
      rec.leadExtra && rec.leadExtra.roofQuote && rec.leadExtra.roofQuote.areaSqft ? 'roof ' + rec.leadExtra.roofQuote.areaSqft.toLocaleString('en-US') + ' sq ft' : '', clip(rec.scope, 140)].filter(Boolean).join(' · ') })], { source: rec.source || SOURCE });
  } catch (e) { return { error: s(e && e.message) }; }
}

/* ── the instant reply to the customer (approvals, owner rule) ─────────────── */
function replyFor(f, extra){
  const first = s(f.name).split(/\s+/)[0];
  const hi = first ? 'Hi ' + first + ',' : 'Hello,';
  let body;
  if (f.type === 'careers') body = 'Thank you for applying to GrayCo Construction Services' + (f.position ? ' for the ' + f.position + ' position' : '') + '. We received your application and our team will review it. If it is a fit, we will reach out to set up a call.';
  else if (f.type === 'problem') body = 'We received your message about a problem at your property. Someone from our office will contact you as soon as possible. If water is coming in right now, please call our office at 901-585-0944.';
  else if (f.type === 'roofprice') body = 'Thanks for using our instant roof price. ' + (extra && extra.priceText ? 'Your ballpark range is ' + extra.priceText + '. ' : '') + 'A GrayCo estimator will contact you to schedule a free inspection and give you an exact price.';
  else body = 'Thank you for contacting GrayCo Construction Services about your ' + (TYPES[f.type] ? TYPES[f.type].short.toLowerCase() : 'project') + '. We received your request and a member of our team will contact you shortly.';
  const text = hi + '\n\n' + body + '\n\nGrayCo Construction Services\n' + require('./_lib/brand.js').companyAddress() + '\n901-585-0944 · office@grayco-cs.com';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;max-width:560px"><p>' + esc(hi) + '</p><p>' + esc(body) + '</p>'
    + '<p style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#666">GrayCo Construction Services<br>' + require('./_lib/brand.js').companyAddress() + '<br>901-585-0944 · office@grayco-cs.com</p></div>';
  return { subject: f.type === 'careers' ? 'GrayCo Construction — we received your application' : 'GrayCo Construction — we received your request', html, text };
}
async function autoReply(f, id, extra){
  if (env('WEBSITE_AUTO_REPLY') === '0') return { off: true };
  if (!isEmail(f.email)) return { why: 'no e-mail address' };
  const m = replyFor(f, extra);
  if (env('PORTAL_AUTO_EMAIL') === '1') {
    const key = env('RESEND_API_KEY'); if (!key) return { why: 'RESEND_API_KEY is not set' };
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'GrayCo Construction Services <office@grayco-cs.com>', to: [f.email], reply_to: (String(process.env.REPLY_TO_ADMIN || '').trim() || 'replies@grayco-cs.com'), subject: m.subject, html: m.html, text: m.text }) });
      return r.ok ? { sent: true } : { why: 'Resend ' + r.status };
    } catch (e) { return { why: 'could not reach Resend' }; }
  }
  try {
    const ok = await core().queueApproval({ id: 'appr_web_' + id, kind: f.type === 'careers' ? 'applicant_reply' : 'lead_first_contact', pid: f.type === 'careers' ? '' : 'LEADIN-' + id.replace(/^LI-/, ''),
      jobName: (f.type === 'careers' ? 'Job application — ' : 'Website lead — ') + f.name, pm: null, to: f.email, subject: m.subject, html: m.html, attachments: [],
      meta: { source: SOURCE, websiteForm: (TYPES[f.type] || {}).label || '', phone: tidyPhone(f.phone), address: fullAddr(f) } });
    return ok ? { queued: true } : { why: 'could not put it on the approvals list' };
  } catch (e) { return { why: 'could not put it on the approvals list' }; }
}

/* ── a job application → the Hiring list (via the admins' CRM) ─────────────── */
async function fileApplication(f){
  const at = nowIso(), id = 'WAPP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex');
  let resume = null;
  if (f.resume && s(f.resume.data)) {
    const type = s(f.resume.type).toLowerCase(), name = clip(f.resume.name, 120) || 'resume';
    let buf = null; try { buf = Buffer.from(s(f.resume.data).replace(/^data:[^,]*,/, ''), 'base64'); } catch (e) {}
    if (buf && buf.length && buf.length <= RESUME_MAX && RESUME_TYPES[type]) {
      const st = await L().storeFile(buf, type, name);
      resume = st.stored ? { ref: st.ref, name, type, size: buf.length } : { name, why: st.why || 'not stored' };
    } else if (buf && buf.length) resume = { name, why: buf.length > RESUME_MAX ? 'larger than 4 MB' : 'file type not accepted' };
  }
  const app = { id, at, status: 'new', name: f.name, email: low(f.email), phone: tidyPhone(f.phone), position: f.position, experience: clip(f.experience, 300), availability: clip(f.availability, 120),
    address: fullAddr(f), message: f.message, resume, source: SOURCE };
  await L().kvCas(await privKey(KV_APPS), v => { const list = arr(v); list.push(app); return list.slice(-500); });
  return app;
}
async function alertApplication(app){
  if (env('LEAD_INTAKE_ALERTS') === '0' || env('BID_ALERTS_OFF') === '1') return { off: true };
  const key = env('RESEND_API_KEY'); if (!key) return { why: 'RESEND_API_KEY is not set' };
  try {
    const to = await L().alertsApi().recipients();
    const site = (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '');
    const subject = ('👷 New job application: ' + app.name + (app.position ? ' — ' + app.position : '')).slice(0, 200);
    const lines = [['Position', app.position], ['Phone', app.phone], ['E-mail', app.email], ['Experience', app.experience], ['Available', app.availability], ['Résumé', app.resume ? app.resume.name + (app.resume.ref ? '' : ' (' + app.resume.why + ')') : 'none'], ['Message', app.message]].filter(x => s(x[1]));
    const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">GrayCo — new job application</div><div style="padding:6px 18px 18px">'
      + '<p>' + esc(app.name) + ' applied on grayco-cs.com. It goes onto <b>the Hiring board (Admin → Hiring / Payroll → Hiring)</b> (stage Applied) the next time an admin opens the CRM.</p><table style="font:14px Arial">'
      + lines.map(x => '<tr><td style="padding:3px 10px 3px 0;color:#555;vertical-align:top">' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>').join('') + '</table>'
      + '<p style="margin-top:18px"><a href="' + esc(site) + '/#payroll" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open Hiring in the CRM</a></p></div></div>';
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('BID_ALERT_FROM') || 'GrayCo Leads <leads@grayco-cs.com>', reply_to: (String(process.env.REPLY_TO_ADMIN || '').trim() || 'replies@grayco-cs.com'), to, subject: require('./_lib/mailtag.js').tag(subject, to, 'hiring'), html, text: subject + '\n\n' + lines.map(x => x[0] + ': ' + x[1]).join('\n') + '\n\n' + site + '/#payroll' }) });
    return { ok: r.ok, to: to.length };
  } catch (e) { return { why: s(e && e.message) }; }
}

/* ── the instant roof price ───────────────────────────────────────────────── */
async function geocode(addr){
  const a = s(addr).replace(/\s+/g, ' ').slice(0, 200); if (a.length < 6) return null;
  try {
    const r = await fetch(CENSUS + '?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(a), { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j && j.result && Array.isArray(j.result.addressMatches) && j.result.addressMatches[0];
    if (m && m.coordinates && isFinite(+m.coordinates.x) && isFinite(+m.coordinates.y)) return { lat: +m.coordinates.y, lng: +m.coordinates.x, matched: s(m.matchedAddress) };
  } catch (e) {}
  return null;
}
function priceNum(v){ if (typeof v === 'number') return v > 0 ? v : NaN; const t = s(v).replace(/[$,\s]/g, ''); return /^\d+(\.\d+)?$/.test(t) && +t > 0 ? +t : NaN; }
async function priceSettings(){
  try { const d = await core().kvRead([KV_PRICES]); const v = d[KV_PRICES]; return v && typeof v === 'object' && Array.isArray(v.tiers) ? v : null; } catch (e) { return null; }
}
function pricesSet(cfg){ return !!(cfg && arr(cfg.tiers).length && arr(cfg.tiers).every(t => isFinite(priceNum(t.min)) && isFinite(priceNum(t.max)) && priceNum(t.max) >= priceNum(t.min))); }
/* roof area (sq ft) + main pitch (rise per 12) → squares with waste → the tier for that pitch → low / high (to $100) */
function quote(areaSqft, pitch, cfg){
  const waste = Math.max(0, Math.min(40, Number(cfg && cfg.wastePct) || 0));
  const squares = Math.round(areaSqft * (1 + waste / 100) / 10) / 10;
  const tiers = arr(cfg && cfg.tiers).slice().sort((a, b) => (Number(a.maxRise) || 99) - (Number(b.maxRise) || 99));
  const rise = pitch == null ? 6 : Number(pitch);
  const tier = tiers.find(t => rise <= (Number(t.maxRise) || 99)) || tiers[tiers.length - 1];
  if (!tier || !pricesSet(cfg)) return { squares, tier: tier ? s(tier.label) : '', priced: false };
  const lo = Math.round(squares * priceNum(tier.min) / 100) * 100, hi = Math.round(squares * priceNum(tier.max) / 100) * 100;
  return { squares, tier: s(tier.label), priced: true, low: lo, high: Math.max(lo, hi) };
}
async function roofPrice(f){
  const addr = fullAddr(f);
  const g = await geocode(addr);
  let m = null, why = '';
  if (!g) why = 'address not found';
  else {
    try { m = await require('./solar-lookup.js')._measure(g.lat, g.lng); } catch (e) { m = { ok: false, code: 'error', error: s(e && e.message) }; }
    if (!m.ok) why = m.code === 'not-connected' ? 'roof measuring is not switched on' : m.code === 'limit' ? 'monthly measuring limit reached' : 'measuring failed';
    else if (!m.found || !(m.areaSqft > 0)) why = 'no roof found at that address';
  }
  const measured = !why;
  const cfg = await priceSettings();
  const q = measured ? quote(m.areaSqft, m.pitch, cfg || PRICE_SEED) : { priced: false };
  const roofQuote = { at: nowIso(), address: addr, matched: g ? g.matched : '', lat: g ? g.lat : null, lng: g ? g.lng : null, measured, why,
    areaSqft: measured ? m.areaSqft : null, pitch: measured ? m.pitch : null, segments: measured ? m.segments : null, imageryDate: measured ? m.imageryDate : null,
    squares: q.squares || null, tier: q.tier || '', priced: !!q.priced, low: q.priced ? q.low : null, high: q.priced ? q.high : null, shownToCustomer: !!q.priced };
  return roofQuote;
}

/* Applicants' details and visitors' IPs are kept where no browser can read them: the Lead Inbox's own table
   (gc_lead_inbox_kv, docs/lead-inbox.sql — service key only). Before that SQL has run they go in gc_kv under a
   "users__" name, which SEC2 (docs/security-data.sql) makes admin-only. */
async function privKey(base){
  let T = 'gc_kv'; try { T = await require('./bid-inbox.js')._test.kvTable(); } catch (e) {}
  return T === 'gc_kv' ? 'users__' + base.replace(/^gc_/, '') : base;
}
async function appsAll(){
  const k = await privKey(KV_APPS), list = arr(await L().kvGet(k));
  if (k === KV_APPS) {   /* applications kept in gc_kv before the private table existed */
    try { const r = await L().sb('gc_kv?select=value&key=eq.users__website_apps'); if (r.ok) { let v = (arr(await r.json())[0] || {}).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } arr(v).forEach(a => { if (a && a.id && !list.some(x => x.id === a.id)) list.push(Object.assign({ legacy: true }, a)); }); } } catch (e) {}
  }
  return list;
}
async function markApps(ids, map, who){
  let n = 0;
  const apply = v => { const list = arr(v); let c = 0; list.forEach(a => { if (a && ids.indexOf(a.id) >= 0 && a.status === 'new') { a.status = 'imported'; a.importedAt = nowIso(); a.importedBy = who; a.candidateId = s(map[a.id]); c++; } }); n += c; return c ? list : undefined; };
  const k = await privKey(KV_APPS);
  await L().kvCas(k, apply);
  if (k === KV_APPS) { try { const r = await L().sb('gc_kv?select=value&key=eq.users__website_apps'); const row = r.ok ? arr(await r.json())[0] : null; if (row) { const nv = apply(row.value); if (nv) await L().sb('gc_kv?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'users__website_apps', value: nv, updated_at: nowIso() }) }); } } catch (e) {} }
  return n;
}

/* ── the admin doors (CRM sign-in) ─────────────────────────────────────────── */
async function staff(event){ return require('./bid-inbox.js')._test.staffAuth(event); }
async function listApps(){ return (await appsAll()).filter(a => a && a.status === 'new'); }

/* ── the handler ─────────────────────────────────────────────────────────── */
exports.handler = async function(event){
  event = event || {};
  const m = event.httpMethod || 'GET', qs = event.queryStringParameters || {}, h = hdrs(event);
  if (m === 'OPTIONS') return { statusCode: 204, headers: cors(event), body: '' };
  const ip = ipOf(event);

  if (m === 'GET' && (qs.ping === '1')) {
    let priced = false; try { priced = pricesSet(await priceSettings()); } catch (e) {}
    return J(event, 200, { ok: true, service: 'GrayCo website intake', database: L().dbReady(), turnstile: !!env('TURNSTILE_SECRET'), roofMeasure: !!env('GOOGLE_SOLAR_API_KEY'), priced, zapier: !!env('WEBSITE_ZAPIER_KEY') });
  }
  if (m === 'GET' && qs.form === '1') {
    let priced = false; try { priced = pricesSet(await priceSettings()); } catch (e) {}
    return J(event, 200, { ok: true, token: newToken(), turnstileSiteKey: env('TURNSTILE_SECRET') ? env('TURNSTILE_SITE_KEY') : '', types: Object.keys(TYPES).filter(k => k !== 'roofprice' && k !== 'referral' && k !== 'magnet' && k !== 'partner').map(k => ({ id: k, label: TYPES[k].label })), positions: POSITIONS, priced });
  }

  /* ── admin doors ── */
  if (qs.settings === '1' || qs.list === '1' || qs.file || qs.act === 'imported') {
    const who = await staff(event);
    if (!who.ok) return J(event, who.code || 401, { ok: false, error: who.error });
    if (qs.settings === '1' && m === 'GET') { const cfg = await priceSettings(); return J(event, 200, { ok: true, roofPriceRanges: cfg || PRICE_SEED, seeded: !cfg, priced: pricesSet(cfg) }); }
    if (!who.admin) return J(event, 403, { ok: false, error: 'Only an owner or admin can do that.' });
    if (qs.settings === '1' && m === 'POST') {
      let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(event, 400, { ok: false, error: 'Body must be JSON.' }); }
      const v = b.roofPriceRanges; if (!v || !Array.isArray(v.tiers) || !v.tiers.length || v.tiers.length > 8) return J(event, 400, { ok: false, error: 'roofPriceRanges.tiers is required.' });
      const clean = { unit: 'square', wastePct: Math.max(0, Math.min(40, Number(v.wastePct) || 0)), note: clip(v.note, 300), updatedBy: who.email, updatedAt: nowIso(),
        tiers: v.tiers.map((t, i) => ({ id: s(t.id) || 't' + i, label: clip(t.label, 60) || 'Tier ' + (i + 1), maxRise: Math.max(0, Math.min(99, Number(t.maxRise) || 99)),
          min: isFinite(priceNum(t.min)) ? priceNum(t.min) : '[PRICE]', max: isFinite(priceNum(t.max)) ? priceNum(t.max) : '[PRICE]' })) };
      const r = await L().sb('gc_kv?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: KV_PRICES, value: clean, updated_at: nowIso() }) });
      if (!r.ok) return J(event, 502, { ok: false, error: 'Could not save (' + r.status + ').' });
      return J(event, 200, { ok: true, roofPriceRanges: clean, priced: pricesSet(clean) });
    }
    if (qs.list === '1') return J(event, 200, { ok: true, apps: (await listApps()).map(a => Object.assign({}, a, { resume: a.resume ? { name: a.resume.name, type: a.resume.type, size: a.resume.size, stored: !!a.resume.ref, why: a.resume.why || '' } : null })) });
    if (qs.file) {
      const a = (await appsAll()).find(x => x && x.id === s(qs.file));
      if (!a || !a.resume || !a.resume.ref) return J(event, 404, { ok: false, error: 'No résumé.' });
      const path = a.resume.ref.replace(/^sb:crm-files\//, '');
      const r = await fetch(L().sbUrl() + '/storage/v1/object/crm-files/' + path, { headers: L().svcH() });
      if (!r.ok) return J(event, 502, { ok: false, error: 'Could not read the résumé (' + r.status + ').' });
      const buf = Buffer.from(await r.arrayBuffer());
      return J(event, 200, { ok: true, name: a.resume.name, type: a.resume.type, dataUrl: 'data:' + a.resume.type + ';base64,' + buf.toString('base64') });
    }
    if (qs.act === 'imported' && m === 'POST') {
      let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
      const ids = arr(b.ids).map(s); const map = b.candidates && typeof b.candidates === 'object' ? b.candidates : {};
      const n = await markApps(ids, map, who.email);
      return J(event, 200, { ok: true, marked: n });
    }
    return J(event, 400, { ok: false, error: 'Unknown request.' });
  }

  if (m !== 'POST') return J(event, 405, { ok: false, error: 'Method not allowed' });

  /* ── a public submission: the website form, the roof price, or Zapier ── */
  const viaZapier = !!env('WEBSITE_ZAPIER_KEY') && same(h['x-api-key'] || s(h.authorization).replace(/^Bearer\s+/i, ''), env('WEBSITE_ZAPIER_KEY'));
  if (!viaZapier && h.origin && !originOk(h.origin)) return J(event, 403, { ok: false, error: 'This form only works on grayco-cs.com.' });
  let body; try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}')); } catch (e) { return J(event, 400, { ok: false, error: 'Something went wrong sending the form — please try again.' }); }
  if (typeof event.body === 'string' && event.body.length > 7 * 1024 * 1024) return J(event, 413, { ok: false, error: 'That file is too large — please attach a résumé under 4 MB.' });
  const f = readForm(body);
  const isRoof = qs.act === 'roofprice' || f.type === 'roofprice';
  if (isRoof) f.type = 'roofprice';

  /* spam: the honeypot is answered like a success, and nothing is kept */
  if (f.hp) return J(event, 200, { ok: true, received: true });
  if (rateLimited(ip, isRoof ? 'roof' : 'form', isRoof ? 3 : parseInt(env('WEBSITE_RATE') || '5', 10), isRoof ? 3600000 : 600000)) return J(event, 429, { ok: false, error: 'Too many requests from this connection — please call us at 901-585-0944.' });
  if (!viaZapier) {
    const t = tokenAge(f.token);
    if (!t.ok) return J(event, 400, { ok: false, error: t.fast ? 'That was very quick — please wait a moment and press Send again.' : t.old ? 'This page was open a long time — please reload it and send again.' : 'Please reload the page and try again.', why: t.why });
    const ts = await turnstileOk(f.turnstile, ip);
    if (!ts.ok) return J(event, 400, { ok: false, error: ts.why });
  }
  const spam = looksSpammy(f); if (spam) return J(event, 200, { ok: true, received: true });

  /* what is required */
  if (!f.name) return J(event, 400, { ok: false, error: 'Please add your name.', field: 'name' });
  if (isRoof) {
    if (phone10(f.phone).length !== 10) return J(event, 400, { ok: false, error: 'Please add a 10-digit phone number.', field: 'phone' });
    if (!isEmail(f.email)) return J(event, 400, { ok: false, error: 'Please add your e-mail address.', field: 'email' });
    if (s(f.address).length < 5 || !(f.zip || f.city)) return J(event, 400, { ok: false, error: 'Please add the street address and ZIP code.', field: 'address' });
  } else {
    if (!isEmail(f.email) && phone10(f.phone).length !== 10) return J(event, 400, { ok: false, error: 'Please add a phone number or an e-mail address so we can reach you.', field: 'phone' });
    if (f.email && !isEmail(f.email)) return J(event, 400, { ok: false, error: 'That e-mail address does not look right.', field: 'email' });
  }
  if (!L().dbReady()) return J(event, 503, { ok: false, error: 'We could not take this right now — please call us at 901-585-0944.' });

  try {
    if (f.type === 'referral') {   /* patch REF: "Join our referral program" (and, optionally, the friend they refer) */
      if (f.referred.email && !isEmail(f.referred.email)) return J(event, 400, { ok: false, error: 'Your friend’s e-mail address does not look right.', field: 'referred_email' });
      if (s(f.referred.name) && !isEmail(f.referred.email) && phone10(f.referred.phone).length !== 10) return J(event, 400, { ok: false, error: 'Add your friend’s phone number or e-mail so we can reach them.', field: 'referred_phone' });
      const j = await REF().join({ name: f.name, email: f.email, phone: f.phone, how: f.howKnow, source: 'website', referred: f.referred });
      return J(event, 200, { ok: true, received: true, kind: 'referral', member: { code: j.member.code, link: j.member.link, name: j.member.name }, referred: !!j.referral,
        message: 'Thank you — you are in the GrayCo referral program!' + (j.referral ? ' We will reach out to ' + s(f.referred.name).split(/\s+/)[0] + ' soon.' : '') + ' Share your link: ' + j.member.link });
    }
    const refM = f.ref ? await REF().memberByCode(f.ref).catch(() => null) : null;   /* patch REF: came in through a member's link */
    const refExtra = refM ? { leadExtra: { referredBy: refM.name, referredByMember: refM.id, referredByCode: refM.code, referralProgram: true }, notes: ['Came in through ' + refM.name + '’s referral link (' + refM.code + ').'] } : {};
    const refNote = async function(lead){ if (refM && lead && lead.action === 'added') { try { await REF().addReferral({ member: refM, name: f.name, email: f.email, phone: f.phone, address: fullAddr(f), leadId: lead.id, via: 'link', note: 'Came in through the referral link.' }); } catch (e) {} } };
    if (f.type === 'careers') {
      const app = await fileApplication(f);
      const [al, rep] = await Promise.all([alertApplication(app), autoReply(f, app.id)]);
      return J(event, 200, { ok: true, received: true, kind: 'application', id: app.id, resume: app.resume ? (app.resume.ref ? 'kept' : app.resume.why) : 'none', reply: rep.queued ? 'waiting for approval' : rep.sent ? 'sent' : 'not sent', alerted: !!(al && al.ok),
        message: 'Thank you — your application was received. We will be in touch if it is a fit.' });
    }
    if (isRoof) {
      if (!(await roofQuota(ip))) return J(event, 429, { ok: false, error: 'You have reached today\'s limit for instant prices — please call us at 901-585-0944.' });
      const rq = await roofPrice(f);
      const priceText = rq.priced ? money(rq.low) + ' – ' + money(rq.high) : '';
      const notes = [rq.measured ? ('Roof measured from satellite (Google Solar' + (rq.imageryDate ? ', imagery ' + rq.imageryDate : '') + '): ' + rq.areaSqft.toLocaleString('en-US') + ' sq ft, main pitch ' + (rq.pitch == null ? '?' : rq.pitch + '/12') + ', ' + rq.squares + ' squares with waste' + (rq.tier ? ' — ' + rq.tier : '') + '.') : ('Roof NOT measured automatically (' + rq.why + ') — measure it.'),
        rq.priced ? 'Range shown to the customer: ' + priceText + '.' : 'No price was shown to the customer' + (rq.measured ? ' (roof prices are not set yet: Leads → 🌐 Website → Roof prices)' : '') + ' — call with a price.'];
      const lead = await fileLead(f, Object.assign({}, refExtra, { roofQuote: rq, notes: notes.concat(refExtra.notes || []) }));
      await refNote(lead);
      await Promise.all([alertLead(lead.rec), autoReply(f, lead.id, { priceText })]);
      return J(event, 200, { ok: true, received: true, kind: 'roofprice', leadId: lead.id, measured: rq.measured, priced: rq.priced,
        low: rq.priced ? rq.low : null, high: rq.priced ? rq.high : null, range: priceText, areaSqft: rq.measured ? rq.areaSqft : null, squares: rq.measured ? rq.squares : null, pitch: rq.measured ? rq.pitch : null,
        message: rq.priced ? 'Your ballpark roof replacement price is ' + priceText + '. A GrayCo estimator will call to schedule a free inspection for an exact price.'
          : rq.measured ? 'Thanks — we measured your roof (' + rq.areaSqft.toLocaleString('en-US') + ' sq ft). A GrayCo estimator will call you with your price shortly.'
          : 'Thanks — we have your address. A GrayCo estimator will measure your roof and call you with a price shortly.' });
    }
    if (f.type === 'partner') {   /* patch MKT2: "Become a referral partner" — a pending partner an admin turns on */
      if (!isEmail(f.email)) return J(event, 400, { ok: false, error: 'Please add your e-mail address.', field: 'email' });
      const pj = await require('./_lib/mkt2.js').partnerJoin(f);
      return J(event, 200, { ok: true, received: true, kind: 'partner', existing: pj.existing, message: pj.existing ? 'You are already signed up — we will be in touch.' : 'Thank you! We will review your sign-up and e-mail you your partner link.' });
    }
    if (f.type === 'magnet') {   /* patch MKT2: a free guide — name + e-mail, joins GrayCo News, a soft lead (no reach-out clock, no alert) */
      if (!isEmail(f.email)) return J(event, 400, { ok: false, error: 'Please add your e-mail address so we can send the guide.', field: 'email' });
      const M2 = require('./_lib/mkt2.js');
      await M2.addSignup({ email: f.email, name: f.name, source: 'guide:' + (f.guide || 'guide'), zip: f.zip });
      const g = await fileLead(f, { title: ('Guide download — ' + f.name + ' (' + (f.guide || 'guide') + ')').slice(0, 200), how: 'downloaded a free guide (' + (f.guide || 'guide') + ')', notes: ['Soft lead: downloaded a free guide and joined GrayCo News (they can unsubscribe any time). No reach-out clock — follow up if it fits.'] });
      const GUIDES = { storm: 'GrayCo-Storm-Damage-Checklist.pdf', hire: 'GrayCo-Before-You-Hire-a-Contractor.pdf' };
      return J(event, 200, { ok: true, received: true, kind: 'magnet', leadId: g.id, file: GUIDES[f.guide] || GUIDES.storm, message: 'Thank you! Your guide is downloading now. You will also get GrayCo News — unsubscribe any time.' });
    }
    let partner = null; if (f.attrib && f.attrib.ref) { try { partner = await require('./_lib/mkt2.js').partnerFor(f.attrib.ref); } catch (e) {} }   /* patch MKT2 */
    const lead = await fileLead(f, partner ? Object.assign({}, refExtra, { partner: partner }) : refExtra);
    await refNote(lead);
    if (lead.action === 'added') await Promise.all([alertLead(lead.rec), autoReply(f, lead.id)]);
    return J(event, 200, { ok: true, received: true, kind: 'lead', leadId: lead.id, existingCustomer: !!lead.customer, duplicate: lead.action !== 'added',
      message: f.type === 'problem' ? 'Thank you — we received your message and will contact you as soon as possible. If water is coming in right now, call 901-585-0944.' : 'Thank you — we received your request and will contact you shortly.' });
  } catch (e) {
    return J(event, 503, { ok: false, error: 'We could not take this right now — please call us at 901-585-0944.', why: s(e && e.message) });
  }
};

/* ── leads@grayco-cs.com (patch STL): one e-mail → one lead ─────────────────── */
const MAIL_SOURCE = 'Website / leads@ e-mail';
const LABEL = /^([A-Za-z][A-Za-z0-9 ?'\/()&.#-]{0,48}?)\s*:\s*(.*)$/;
const MULTI = /^(address|street|street_address|property_address|job_address|message|comments|notes|details|description|how_can_we_help|project_details)$/;
/* "Name: Jane Doe" lines (a Squarespace form notification, or a forwarded form) → { name, email, … } */
function fieldsOf(text){
  const b = {}; let key = '', n = 0;
  String(text || '').split(/\r?\n/).map(x => x.replace(/ /g, ' ').trim()).forEach(line => {
    const m = LABEL.exec(line);
    if (m && !/^https?$/i.test(m[1])) {
      key = low(m[1]).replace(/[?()'.#&]/g, '').replace(/[\s\/-]+/g, '_').replace(/^_+|_+$/g, '');
      if (!key || /^(sent|from|to|date|subject_line|cc|reply_to|sent_via_form_submission_from)$/.test(key)) { key = ''; return; }
      if (b[key] == null) { b[key] = s(m[2]); n++; } else key = '';
      return;
    }
    if (!line) { if (key && !MULTI.test(key)) key = ''; return; }
    if (key && (b[key] === '' || MULTI.test(key)) && !/^\(?sent via |^powered by |^--+$/i.test(line)) b[key] = b[key] ? b[key] + (/address|street/.test(key) ? ', ' : '\n') + line : line;
  });
  return { b, n };
}
function splitAddress(b){
  const a = s(b.address || b.street_address || b.property_address || b.job_address);
  const m = /,\s*([A-Za-z .'-]+?),?\s+([A-Za-z]{2})\b,?\s*(\d{5})?/.exec(a);
  if (m) { if (!b.city) b.city = m[1]; if (!b.state) b.state = m[2]; if (!b.zip && m[3]) b.zip = m[3]; }
  if (a) b.address = a.replace(/,\s*(United States|USA|US)\s*$/i, '');
  return b;
}
function bulk(mail){
  const H = mail.headers || {};
  return !!(H['list-unsubscribe'] || /^(bulk|list|junk)$/i.test(s(H.precedence)) || /^(no-?reply|newsletter|marketing|news|notifications?|info|hello|team|support|billing)@/i.test(s(mail.from && mail.from.email)));
}
const NOT_CUSTOMER = /@(grayco-cs\.com|in\.grayco-cs\.com|squarespace\.(com|info)|wix\.com|googlegroups\.com|google\.com)$/i;
exports.fromEmail = async function(mail){
  mail = mail || {};
  const text = s(mail.text), from = mail.from || {}, H = mail.headers || {};
  const got = fieldsOf(text), b = splitAddress(got.b);
  const lsa = /local services|localservices|google guaranteed|google screened/i.test(s(mail.subject) + ' ' + text.slice(0, 3000));   /* patch MKT2 LSA: a Google Local Services lead e-mail forwarded to leads@ */
  if (lsa) { if (!b.phone) { const m = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/.exec(text); if (m) b.phone = m[1] + m[2] + m[3]; } if (!b.name) { const n = /(?:^|\n)\s*(?:customer|name|lead)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,60})/i.exec(text); if (n) b.name = n[1].trim(); } if (!b.message) b.message = clip(text, 1500); }
  const replyTo = low(s(H['reply-to']).replace(/^.*<([^>]+)>.*$/, '$1'));
  const sender = [low(b.email || b.email_address), replyTo, low(from.email)].find(x => isEmail(x) && !NOT_CUSTOMER.test(x)) || '';
  if (got.n < 2 && !(lsa && (b.phone || b.name))) {   /* a person writing in (or junk): no form fields */
    if (bulk(mail) || !sender) return { ok: true, ignored: 'not a lead (no form, no customer address)' };
    b.message = clip((s(mail.subject) ? s(mail.subject) + '\n\n' : '') + text, 3000);
    b.type = s(mail.subject);
  } else if (!b.type && !b.form && !b.inquiry && !b.subject) b.type = s(mail.subject).replace(/^(fwd?|re):\s*/i, '').replace(/^form submission\s*-?\s*/i, '');
  if (!s(b.name || b.full_name || b.first_name) && s(from.name) && !NOT_CUSTOMER.test(low(from.email))) b.name = s(from.name);
  if (sender && !b.email && !b.email_address) b.email = sender;
  const f = readForm(b);
  if (!f.name && !f.email && !f.phone) return { ok: true, ignored: 'no name, e-mail or phone in it' };
  const spam = looksSpammy(f); if (spam) return { ok: true, ignored: 'spam (' + spam + ')' };
  if (f.type === 'careers') {
    const app = await fileApplication(f); const al = await alertApplication(app);
    return { ok: true, application: app.id, alert: al };
  }
  if (f.type === 'roofprice') f.type = 'estimate';
  const sid = crypto.createHash('sha256').update('leads@|' + (s(mail.messageId) || s(mail.id) || (low(f.email) + '|' + f.phone + '|' + s(mail.subject) + '|' + s(mail.date)))).digest('hex').slice(0, 24);
  const r = await fileLead(f, { sid, source: lsa ? 'Google LSA' : MAIL_SOURCE, leadExtra: lsa ? { mkSource: 'Google Ads', leadSource: 'Google LSA' } : undefined, how: 'from an e-mail to leads@grayco-cs.com' + (s(mail.subject) ? ' ("' + clip(mail.subject, 80) + '")' : ''), notes: mail.rawRef ? ['The e-mail is kept on the lead (Lead Inbox).'] : [] });
  const alerts = r.action === 'added' ? await alertLead(r.rec) : { skipped: r.action };
  return { ok: true, lead: r.id, action: r.action, alerts, type: f.type };
};

/* patch AUTO6: the missed-call text-back (missed-call.js) files its leads the same way */
exports._lib = { fileLead, alertLead, findCustomer, phone10, tidyPhone, SOURCE };

/* patch AUTO5: "Refer a friend" in the customer portal (portal-sign.js refer) — a GrayCo lead on the Lead Inbox,
   assigned to the referring customer's PM (they know the family; the 4 h / 24 h reach-out reminders follow them),
   tagged "Referred by <customer>". The PM gets the e-mail from portal-sign.js; nothing goes to the friend by itself. */
const REF_SOURCE = 'Customer referral';
exports.fromReferral = async function(o){
  o = o || {};
  const f = readForm({ type: 'estimate', name: o.name, email: o.email, phone: o.phone, address: o.address, message: o.note });
  const pm = o.pm && o.pm.name ? o.pm : null, at = nowIso();
  const sid = crypto.createHash('sha256').update('referral|' + s(o.referrerPid) + '|' + low(f.email) + '|' + phone10(f.phone) + '|' + low(f.name) + '|' + at.slice(0, 10)).digest('hex').slice(0, 24);
  const r = await fileLead(f, { sid, source: REF_SOURCE + ' — ' + clip(o.referrer, 80), how: 'referred by ' + clip(o.referrer, 80) + ' (' + clip(o.referrerJob, 80) + ') in their GrayCo Portal',
    notes: ['REFERRED BY: ' + clip(o.referrer, 80) + (o.referrerEmail ? ' (' + low(o.referrerEmail) + ')' : '') + ' — job ' + clip(o.referrerJob, 80) + '. Thank them for the referral (referral program).'],
    leadExtra: { websiteLead: false, websiteForm: '', referral: true, referredBy: clip(o.referrer, 80), referrerPid: s(o.referrerPid), referrerJob: clip(o.referrerJob, 120), leadSource: REF_SOURCE, unassigned: !pm },
    patch: Object.assign({ origin: 'referral', sourceKind: 'referral', websiteLead: false, websiteForm: '', title: ('Referral — ' + f.name + (s(f.address) ? ' — ' + s(f.address).split(',')[0] : '') + ' (from ' + clip(o.referrer, 60) + ')').slice(0, 200) },
      pm ? { pm: pm.name, pmEmail: low(pm.email), assignedAt: at, assignedBy: 'Customer portal referral (the customer\'s PM)' } : {}) });
  return { ok: true, id: r.id, action: r.action };
};

exports._test = { fieldsOf, splitAddress, MAIL_SOURCE, readForm, typeOf, tokenAge, newToken, quote, pricesSet, priceNum, findCustomer, rateLimited, originOk, looksSpammy, replyFor, PRICE_SEED, TYPES, SOURCE, KV_APPS, KV_PRICES,
  reset: () => { HITS.clear(); } };
