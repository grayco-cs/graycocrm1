/* ── GrayCo — the MARKETING MANAGER profile, server side (patch MM) ──────────────────────────────────────────────
   Owner (22 Oct 2026): "he needs strictly marketing stuff in his profile, doesn't need to see company data, but I want
   him to see how his leads are playing out … he will use our CRM to grow our business … have all tools we have."

   WHO: data, never a name. A gc_staff row with profile 'marketing' and mkt_active = true (docs/marketing-role.sql).
   Such a row is ALWAYS active = false and role 'staff' (a database check enforces it), so every staff rule in the
   database (gc_is_staff, storage, the gc_kv rules) and every staff check in the Netlify functions refuses him by
   construction: default deny. He gets in only where a function asks for him on purpose: auth() below.

   WHAT HE GETS (all through netlify/functions/soc.js, never the raw tables):
   * the marketing document, redacted (no customer address, name, e-mail or phone) — kvRead / kvWrite: his edits are
     merged record by record; he can never approve, post, send, change the approval stage or his own settings;
   * the jobs as a marketing projection (no customer, no money; street name without the house number), and only the
     photos of jobs whose customer said yes; picture links signed one at a time for those files only;
   * "My leads": every lead with a marketing source — date, source / campaign, service, city, stage, lost reason,
     days to contact, the assigned ROLE; never the customer's name, phone, e-mail or street; sold value per campaign
     only while the admin setting "Marketing Manager sees sold values" is on (default on). No costs, margins, profit;
   * his own To-Dos (and Today's plan), the marketing approvals he may decide (stage 2+: the drafts the office could
     approve, never a flagged one, never paid ads — setting "Marketing Manager approves at stage 2", default on).
   Settings: gc_kv "gc_mkt_admin" (admins write; docs/marketing-role.sql) — { mm: { soldValues, approvesStage2 } }. */
'use strict';
const crypto = require('crypto');
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : (v && Array.isArray(v.list) ? v.list : []); }
function env(k){ return s(process.env[k]); }
const GC_SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';   /* the PUBLIC anon key (already in index.html — not a secret) */
function sbUrl(){ return (env('SUPABASE_URL') || GC_SB).replace(/\/$/, ''); }
function svc(){ return env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'); }
function svcH(extra){ const k = svc(); const jwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k); return Object.assign(jwt ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }, { 'Content-Type': 'application/json' }, extra || {}); }
let nowFn = function(){ return Date.now(); };
function nowIso(){ return new Date(nowFn()).toISOString(); }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? s(h[k]) : ''; }

/* ── 1. who: a Marketing Manager sign-in (the row: profile marketing, mkt_active, never active staff) ── */
function isMarketingRow(row){ return !!row && low(row.profile) === 'marketing' && row.mkt_active === true && row.active === false && low(row.role || 'staff') !== 'admin'; }
async function auth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization'));
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first.' };
  let user = null;
  try { const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: env('SUPABASE_ANON_KEY') || ANON, Authorization: 'Bearer ' + m[1] } }); if (r.ok) user = await r.json(); }
  catch (e) { return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service.' }; }
  const email = low(user && user.email);
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  if (!svc()) return { ok: false, statusCode: 500, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' };
  let row = null;
  try { const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=*&email=eq.' + encodeURIComponent(email), { headers: svcH() }); if (r.ok) row = (await r.json())[0] || null; } catch (e) {}
  if (!isMarketingRow(row)) return { ok: false, statusCode: 403, error: 'This account is not on the GrayCo staff list.' };
  return { ok: true, email: email, name: s(row.name), role: 'marketing', marketing: true };
}
/* a staff function's check said "not staff" (403): is it the Marketing Manager? */
async function orStaff(staffWho, event){
  if (staffWho && staffWho.ok) return staffWho;
  if (!staffWho || (staffWho.statusCode || staffWho.code) !== 403) return staffWho;
  const m = await auth(event);
  return m.ok ? m : staffWho;
}

/* ── 2. settings (admins write gc_mkt_admin; the marketing document's cfg is NOT trusted for these) ── */
async function kvGet(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: svcH() });
  if (!r.ok) throw new Error('gc_kv read ' + r.status);
  const rows = await r.json(); let v = rows && rows[0] ? rows[0].value : null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v;
}
async function kvPut(key, value){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: svcH({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) });
  if (!r.ok) throw new Error('gc_kv write ' + r.status);
}
const ADMIN_KEY = 'gc_mkt_admin';
function settingsOf(v){ const m = (v && v.mm) || {}; return { soldValues: m.soldValues !== false, approvesStage2: m.approvesStage2 !== false }; }
async function settings(){ try { return settingsOf(await kvGet(ADMIN_KEY)); } catch (e) { return settingsOf(null); } }
async function adminDoc(){ try { return (await kvGet(ADMIN_KEY)) || {}; } catch (e) { return {}; } }
async function setSettings(patch, who){
  const cur = await adminDoc(), mm = Object.assign({}, cur.mm || {});
  if (patch.soldValues != null) mm.soldValues = patch.soldValues === true;
  if (patch.approvesStage2 != null) mm.approvesStage2 = patch.approvesStage2 === true;
  mm.by = low(who && who.email); mm.at = nowIso();
  await kvPut(ADMIN_KEY, Object.assign({}, cur, { mm: mm }));
  return settingsOf({ mm: mm });
}

/* ── 3. redaction ── */
const PII_KEYS = /^(email|e_?mail|phone|tel|cell|mobile|address|street|addr|jobaddress|jobaddresses|address1|address2|zip(code)?|client|clientname|clientemail|clientphone|customer|customername|customeremail|customerphone|owner|ownername|homeowner|contact|names|jobname|signature|ssn|ein|dob|birthday|notes?|referrer|referred|referrername|referredname|referreremail|referredemail|membername|winner|winnername|toname)$/i;   /* patch MKTFIX2: + the customer referral / giveaway names */
const EMAIL_RE = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi, PHONE_RE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, HOUSE_RE = /\b\d{2,6}[A-Za-z]?\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9'.-]+\s+){0,4}(?:st|street|rd|road|ave|avenue|blvd|dr|drive|ln|lane|ct|court|cv|cove|pl|place|pkwy|cir|circle|way|ter|trl|trail|hwy|loop|run|pass|sq)\b\.?/gi;
function scrubText(t){ return String(t).replace(EMAIL_RE, function(m){ return /@grayco-cs\.com$/i.test(m) ? m : '[e-mail hidden]'; }).replace(PHONE_RE, function(m){ return m.replace(/\D/g, '').slice(-10) === '9015850944' ? m : '[phone hidden]'; })
  .replace(HOUSE_RE, function(m){ return /^(4007|4014)\s+broadway/i.test(m) ? m : m.replace(/^\s*\d+[A-Za-z]?\s+/, ''); }); }
/* deep copy without customer contact data: PII keys out, e-mails / phones / house numbers in text masked */
function redact(v, depth){
  depth = depth || 0; if (depth > 12) return null;
  if (Array.isArray(v)) return v.map(function(x){ return redact(x, depth + 1); });
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(function(k){ if (PII_KEYS.test(k)) return; o[k] = redact(v[k], depth + 1); }); return o; }
  if (typeof v === 'string') return scrubText(v);
  return v;
}
/* the marketing document as he sees it: the guard fields (job addresses, customer names) out, every text scrubbed;
   the money / customer collections (payouts, sends) out */
const DOC_HIDDEN = { payouts: 1, sendlog: 1 };
function redactDoc(doc){
  const out = {};
  Object.keys(doc || {}).forEach(function(c){ if (DOC_HIDDEN[c]) return; const m = doc[c]; if (!m || typeof m !== 'object' || Array.isArray(m)) return; out[c] = {};
    Object.keys(m).forEach(function(id){ out[c][id] = redact(m[id]); }); });
  if (out.cfg && out.cfg.main) { delete out.cfg.main.apprStage; delete out.cfg.main.mm; }
  return out;
}
/* his save, merged into the real document: newest record wins; what he cannot see is kept from the real record;
   he can never approve, post, send, or touch the approval stage / admin settings */
const STATUS_FREE = { draft: 1, '': 1 };
const APPR_COLLS = { posts: 1, campaigns: 1, neighbors: 1, socweeks: 1, addrafts: 1, adchanges: 1, payouts: 1, giveaways: 1, citypages: 1, outreach: 1, roofevents: 1, experiments: 1, features: 1 };
/* 💡 experiments: Idea → (an admin approves) → Running → Results → Keep / Kill. He never makes one approved himself, and runs only an approved one. */
const EXP_ORDER = { idea: 0, approved: 1, running: 2, results: 3, keep: 4, kill: 4 };
function expStage(was, want){ was = was || 'idea'; if (!(want in EXP_ORDER) || want === was) return was; if (want === 'approved') return was; if (EXP_ORDER[was] === 0 && EXP_ORDER[want] > 0) return was; if (want === 'idea' && EXP_ORDER[was] > 0) return was; return want; }
const PROTECTED_ST = /^(approved|posted|posting|sent|sending|waiting|active|paid|applied|live|published)$/;
const LOCKED_FIELDS = ['apprId', 'approvedBy', 'approvedEmail', 'approvedAt', 'autoApproved', 'vetoUntil', 'claim', 'claimAt', 'postedAt', 'sentAt', 'stats', 'submits', 'submittedBy', 'weekApproved', 'apprStage', 'mm'];
const MM_COLLS_RO = { cfg: 0 };   /* cfg: only some fields (below) */
const CFG_OK = ['gs', 'socPlan', 'socNetworks', 'socTimes', 'reviewLink', 'autopilot', 'pixels', 'trackNumbers', 'news', 'nlAuto'];
function mergeWrite(real, mine, ctx){
  ctx = ctx || {}; const changed = [];
  Object.keys(mine || {}).forEach(function(c){
    if (DOC_HIDDEN[c]) return; const m = mine[c]; if (!m || typeof m !== 'object' || Array.isArray(m)) return;
    Object.keys(m).forEach(function(id){
      const inc = m[id], cur = real[c] && real[c][id]; if (!inc || typeof inc !== 'object') return;
      if (cur && s(inc.at) <= s(cur.at)) return;
      let rec;
      if (c === 'cfg') {
        rec = Object.assign({}, cur || { id: id });
        CFG_OK.forEach(function(k){ if (k in inc) rec[k] = inc[k]; });
        rec.at = s(inc.at) || nowIso(); rec.by = s(ctx.name) || 'Marketing Manager';
      } else {
        rec = Object.assign({}, cur || {}, redact(inc));
        Object.keys(cur || {}).forEach(function(k){ if (PII_KEYS.test(k)) rec[k] = cur[k]; });   /* what he never saw stays */
        LOCKED_FIELDS.forEach(function(k){ if (cur && k in cur) rec[k] = cur[k]; else delete rec[k]; });
        /* status: drafts are his; approved ⇄ paused, and "posted by hand" (results) on an approved post */
        const was = s(cur && cur.status), want = s(inc.status);
        if (!cur) { if (APPR_COLLS[c]) rec.status = 'draft'; else if (PROTECTED_ST.test(want)) delete rec.status; }   /* a new record of his: a draft; never born approved / active / paid */
        else if (want !== was) {
          const ok = APPR_COLLS[c]
            ? (STATUS_FREE[want] && (STATUS_FREE[was] || was === 'rejected' || was === 'waiting' || was === 'approved' || was === 'paused')) ||
              (want === 'paused' && was === 'approved') || (want === 'approved' && was === 'paused') || (want === 'posted' && was === 'approved' && c === 'posts')
            : !PROTECTED_ST.test(want);   /* other records: any status but approved / active / paid … (e.g. a partner he cannot make active) */
          rec.status = ok ? want : was;
          if (want === 'draft' && /^(waiting|approved|paused)$/.test(was)) { delete rec.apprId; rec.weekApproved = false; }
        }
        if (c === 'experiments') rec.stage = cur ? expStage(s(cur.stage), s(inc.stage)) : 'idea';
        if (c === 'experiments' && rec.stage === 'approved' && rec.status === 'draft') rec.stage = 'idea';   /* changed back to a draft: an admin approves it again */
        if (c === 'posts' && cur && cur.results) {   /* results: only "marked posted by hand" may be added */
          const res = Object.assign({}, cur.results); Object.keys(inc.results || {}).forEach(function(n){ const x = inc.results[n]; if (x && x.manualDone && !(res[n] && res[n].ok)) res[n] = { ok: true, manualDone: true, url: /^https?:\/\//.test(s(x.url)) ? s(x.url).slice(0, 400) : '', at: nowIso(), by: s(ctx.name) }; }); rec.results = res;
        } else if (c === 'posts' && !cur) rec.results = {};
        if (c === 'posts' && s(rec.jobId) && ctx.jobAddr && ctx.jobAddr[s(rec.jobId)]) rec.jobAddresses = ctx.jobAddr[s(rec.jobId)].slice();   /* the guard's addresses come from the server */
        if (c === 'posts' && s(rec.jobId) && ctx.jobNames && ctx.jobNames[s(rec.jobId)]) rec.names = ctx.jobNames[s(rec.jobId)].slice();
        rec.by = s(ctx.name) || 'Marketing Manager';
      }
      (real[c] = real[c] || {})[id] = rec; changed.push([c, id]);
    });
  });
  return changed;
}

/* ── 4. the jobs as a marketing projection, and the photos he may use ── */
function streetName(a){ return s(a).split(',')[0].replace(/^\s*\d+[A-Za-z]?\s+/, '').trim(); }
function cityOf(p){ const a = s(p.address || p.jobAddress).split(','); return s(p.city) || s(a[1]).replace(/\b(TN|MS|AR)\b.*$/i, '').trim(); }
function stateZip(p){ const a = s(p.address || p.jobAddress).split(','); return s(a.slice(2).join(',')); }
function permOk(doc, p){ const r = doc && doc.perms && doc.perms['job_' + s(p && p.id)]; return !!((r && !r.del && r.marketing === true) || (p && (p.marketingOk === true || p.mktPhotoOk === true))); }
const SC = function(){ return require('./soc-content.js'); };
function jobs(data, doc){
  return arr(data.projects).filter(function(p){ return p && p.deleted !== true; }).map(function(p){
    const svc = SC().serviceOf(p) || 'remodel', city = cityOf(p);
    const label = ({ restoration: 'Restoration', roofing: 'Roofing', remodel: 'Remodel', commercial: 'Commercial' })[svc] + ' — ' + (city || 'Memphis area') + ' · ' + s(p.id).slice(-5);
    return { id: s(p.id), name: label, address: [streetName(p.address || p.jobAddress), city, stateZip(p)].filter(Boolean).join(', '), city: city, type: s(p.type || p.jobType || p.projectType), jobType: s(p.jobType),
      status: s(p.status), completedAt: s(p.completedAt || p.completionDate || p.endDate || p.closedAt || p.finishedAt), createdAt: s(p.createdAt), isInsurance: p.isInsurance === true,
      marketingOk: permOk(doc, p), mktPhotoOk: permOk(doc, p), service: svc };
  });
}
function photos(data, doc){
  const ok = {}; arr(data.projects).forEach(function(p){ if (p && permOk(doc, p)) ok[s(p.id)] = 1; });
  return arr(data.gc_photos).filter(function(r){ return r && r.deleted !== true && r.source !== 'ccflag' && ok[s(r.jobId)] && s(r.ref) && r.shared !== false && s(r.tag) !== 'Damage'; })
    .map(function(r){ return { id: s(r.id), jobId: s(r.jobId), ref: s(r.ref), thumbRef: s(r.thumbRef), tag: s(r.tag), at: s(r.at || r.takenAt), source: s(r.source) }; });
}
/* the files he may open: those photos, the marketing document's own pictures, approved testimonial videos */
function allowedRefs(data, doc, testi){
  const set = {};
  photos(data, doc).forEach(function(p){ set[p.ref] = 1; if (p.thumbRef) set[p.thumbRef] = 1; });
  ['media', 'posts', 'events', 'reels', 'portfolio', 'flyers'].forEach(function(c){ const m = (doc && doc[c]) || {}; Object.keys(m).forEach(function(id){ const r = m[id] || {};
    ['ref', 'photoRef', 'beforeRef', 'afterRef', 'videoRef'].forEach(function(k){ if (s(r[k])) set[s(r[k])] = 1; }); arr(r.photoRefs).concat(arr(r.photos).map(function(x){ return x && x.ref; })).forEach(function(x){ if (s(x)) set[s(x)] = 1; }); }); });
  arr(testi).forEach(function(t){ if (t && t.permission === true && t.status === 'approved' && t.video && t.video.ref) set[s(t.video.ref)] = 1; });
  return set;
}

/* ── 5. "My leads": every lead with a marketing source, redacted ── */
const STAGES = ['New Lead', 'Contacted', 'Site Visit', 'Estimate Sent', 'Won', 'Lost'];
function stageOf(l, won){
  if (won) return 'Won';
  const t = low(l.stage || l.status);
  if (/lost|dead|declin|no.?go|cancel/.test(t)) return 'Lost';
  if (/won|sold|signed|contract/.test(t)) return 'Won';
  if (/estimate|proposal|bid sent|quote|negotiat/.test(t)) return 'Estimate Sent';
  if (/visit|inspect|appoint|measure/.test(t)) return 'Site Visit';
  if (/contact|called|reached|follow/.test(t) || s(l.contactedAt)) return 'Contacted';
  return 'New Lead';
}
/* the marketing source of a lead, or null (bid boards, GC invites, a PM's own lead, RoofScout canvassing are not marketing) */
function sourceOf(l){
  const a = l.attrib || {}, src = low(a.utm_source || l.utmSource), camp = s(a.utm_campaign || l.utmCampaign), med = low(a.utm_medium);
  const kind = low(l.sourceKind), t = low([l.source, l.mkSource, l.howHeard, l.sourceRef].join(' '));
  if (l.leadType === 'pm' || /bid|board|inbox|gc invite|buildingconnected|planhub|roofscout|canvass/.test(kind + ' ' + low(l.source))) { if (!src && !l.mkSource) return null; }
  const pick = function(label){ return { source: label, campaign: camp || s(a.gc || l.trackCode) || '' }; };
  if (src) {
    if (/gbp|business.?profile|gmb/.test(src + med)) return pick('Google Business');
    if (a.gclid || (/google/.test(src) && /cpc|ppc|paid|ads?$/.test(med))) return pick('Google Ads');
    if (a.fbclid || (/facebook|instagram|meta|^fb$|^ig$/.test(src) && /cpc|ppc|paid|ads?$|paid_social/.test(med))) return pick('Facebook / Instagram ads');
    if (/facebook|^fb$/.test(src)) return pick('Facebook post'); if (/instagram|^ig$/.test(src)) return pick('Instagram post');
    if (/tiktok/.test(src)) return pick('TikTok'); if (/linkedin/.test(src)) return pick('LinkedIn');
    if (/news|email/.test(src + med)) return pick('Newsletter'); if (/door|flyer|postcard/.test(src + med)) return pick('Door hanger / flyer');
    if (/partner|referral/.test(src)) return pick('Referral');
    return pick('Campaign link (' + src + ')');
  }
  if (a.gclid) return pick('Google Ads'); if (a.fbclid) return pick('Facebook / Instagram ads');
  if (l.partnerCode) return { source: 'Referral partner', campaign: 'partner-' + low(l.partnerCode) };
  if (s(l.ref) || s(a.ref) || /referral program|refer a friend/.test(t)) return { source: 'Referral program', campaign: s(l.ref || a.ref) };
  if (l.mkSource) return { source: s(l.mkSource), campaign: camp };
  if (/newsletter|grayco news/.test(t)) return { source: 'Newsletter', campaign: '' };
  if (/door|flyer|postcard|yard sign|truck|giveaway|coupon/.test(t)) return { source: /giveaway/.test(t) ? 'Giveaway' : /coupon/.test(t) ? 'Coupon' : /yard|truck/.test(t) ? 'Yard sign / truck' : 'Door hanger / flyer', campaign: '' };
  if (/google business|gbp|google maps/.test(t)) return { source: 'Google Business', campaign: '' };
  if (/facebook|instagram|tiktok|linkedin|nextdoor|social/.test(t)) return { source: cap1((t.match(/facebook|instagram|tiktok|linkedin|nextdoor|social/) || ['social'])[0]), campaign: '' };
  if (kind === 'website' || /website|grayco-cs\.com|web form|google search|online/.test(t)) return { source: 'Website', campaign: s(l.sourceRef) };
  return null;
}
/* the customer's own name words out of free text ("call Jane at …" → "call the customer at …") */
function noNames(text, names){ let out = String(text); arr(names).map(s).join(' ').split(/[^A-Za-z'-]+/).filter(function(w){ return w.length >= 3 && !/^(the|and|llc|inc|roof|water|fire|storm|job|lead|website|company)$/i.test(w); }).forEach(function(w){ out = out.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), 'the customer'); }); return out; }
function cap1(x){ return x.charAt(0).toUpperCase() + x.slice(1); }
function serviceType(l){ const svc = SC().serviceOf(l); if (svc === 'restoration') return SC().restSubOf(l) || 'storm'; return svc || ''; }
function daysBetween(a, b){ const x = Date.parse(a || 0), y = Date.parse(b || 0); return x && y && y >= x ? Math.round((y - x) / 864e5 * 10) / 10 : null; }
function roleOfPerson(users, who){
  const n = low(who); if (!n) return 'Unassigned';
  const u = arr(users).find(function(x){ return x && (low(x.name) === n || low(x.email) === n); });
  const r = s(u && u.role) || 'Staff';
  return /admin|owner/i.test(r) ? 'Owner / admin' : /estimat/i.test(r) ? 'Estimator' : /assistant|apm/i.test(r) ? 'Assistant PM' : /project|pm/i.test(r) ? 'Project Manager' : /office/i.test(r) ? 'Office' : /insur/i.test(r) ? 'Insurance' : /mitig/i.test(r) ? 'Mitigation' : r;
}
function myLeads(data, doc, opt){
  opt = opt || {};
  const users = arr(data.users), projects = arr(data.projects).filter(function(p){ return p && p.deleted !== true; });
  const byLead = {}; projects.forEach(function(p){ [p.leadId, p.fromLeadId].forEach(function(id){ if (s(id)) byLead[s(id)] = p; }); });
  const rows = [];
  arr(data.leads).forEach(function(l){
    if (!l || l.deleted || l.softLead) return;
    const src = sourceOf(l); if (!src) return;
    const job = byLead[s(l.id)] || projects.find(function(p){ return s(l.projectId || l.jobId) && s(p.id) === s(l.projectId || l.jobId); }) || null;
    const won = !!job && !/^(lost|cancel|dead)/i.test(s(job.status));
    const created = s(l.createdAt || l.receivedAt || l.created || l.date);
    const row = { id: 'L-' + crypto.createHash('sha256').update('mm|' + s(l.id)).digest('hex').slice(0, 10), date: created.slice(0, 10), source: src.source, campaign: src.campaign,
      service: serviceType(l), city: s(l.city) || cityOf(l), stage: stageOf(l, won), lostReason: stageOf(l, won) === 'Lost' ? noNames(scrubText(s(l.lostReason || l.lossReason)), [l.name, l.contact && l.contact.name, l.client, l.customer, l.company]).slice(0, 120) : '',
      daysToContact: daysBetween(created, l.contactedAt || l.firstContactAt), assigned: roleOfPerson(users, l.pm || l.estimator || l.assignedTo || l.owner) };
    if (won) { row.won = true; if (opt.soldValues) row.sold = Math.round(+(job.contract || job.contractAmount || job.contractValue || job.value || l.wonAmount || 0) || 0); }
    rows.push(row);
  });
  rows.sort(function(a, b){ return a.date < b.date ? 1 : -1; });
  return rows;
}
/* the funnel by source and by service, the campaigns (won count, sold, ad spend → cost per lead), restoration vs the focus */
function funnel(rows, adcamps, focus, opt){
  opt = opt || {};
  const by = function(key){ const o = {}; rows.forEach(function(r){ const k = r[key] || '—'; const x = o[k] = o[k] || { leads: 0 }; STAGES.forEach(function(st){ x[st] = x[st] || 0; }); x.leads++; x[r.stage]++;
    if (r.stage !== 'New Lead' && r.stage !== 'Lost') x.reached = (x.reached || 0) + 1; }); return o; };
  const camps = {};
  rows.forEach(function(r){ const k = r.campaign || r.source; const c = camps[k] = camps[k] || { campaign: k, source: r.source, leads: 0, won: 0, sold: 0 }; c.leads++; if (r.won) { c.won++; if (opt.soldValues) c.sold += r.sold || 0; } });
  arr(adcamps).forEach(function(a){ if (!a || a.del) return; const keys = [s(a.campaignId), low(a.name)];
    const k = Object.keys(camps).find(function(x){ return keys.indexOf(low(x)) >= 0 || keys.indexOf(x) >= 0; });
    const c = k ? camps[k] : (camps[s(a.name)] = { campaign: s(a.name), source: a.platform === 'google' ? 'Google Ads' : 'Facebook / Instagram ads', leads: 0, won: 0, sold: 0 });
    c.spend = (c.spend || 0) + (+a.spend30 || 0); });
  Object.keys(camps).forEach(function(k){ const c = camps[k]; c.cpl = c.spend && c.leads ? Math.round(c.spend / c.leads) : null; if (!opt.soldValues) delete c.sold; if (opt.soldValues && c.spend) c.roi = c.sold ? Math.round(c.sold / c.spend * 10) / 10 : 0; });
  const svcGroup = function(v){ return /^(water|fire|storm)$/.test(v) ? 'restoration' : v || ''; };
  const f = SC().focusOf(focus), tot = rows.filter(function(r){ return svcGroup(r.service); }).length, rest = rows.filter(function(r){ return svcGroup(r.service) === 'restoration'; }).length;
  return { bySource: by('source'), byService: by('service'), campaigns: Object.keys(camps).map(function(k){ return camps[k]; }).sort(function(a, b){ return b.leads - a.leads; }),
    restoration: { leads: rest, share: tot ? Math.round(rest / tot * 1000) / 10 : 0, target: f.restoration }, stages: STAGES };
}

/* ── 7. 💡 Ideas & experiments: a running card's results come from My leads (the same rows: no names, no money unless allowed) ──
   exp.measure = { campaign: 'utm_campaign value' } or { source: 'a source label / tag' }; the dates bound the leads counted. */
function expMatch(exp, r){
  const m = (exp && exp.measure) || {}, camp = low(m.campaign), src = low(m.source);
  if (camp) return low(r.campaign) === camp;
  if (src) return low(r.source) === src || low(r.campaign) === src;
  return false;
}
function expResults(exp, rows, adcamps, opt){
  opt = opt || {}; exp = exp || {};
  const m = exp.measure || {}; if (!s(m.campaign) && !s(m.source)) return null;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(s(exp.start)) ? s(exp.start) : '', to = /^\d{4}-\d{2}-\d{2}$/.test(s(exp.end)) ? s(exp.end) : '9999-12-31';
  const mine = arr(rows).filter(function(r){ return expMatch(exp, r) && (!from || r.date >= from) && r.date <= to; });
  const out = { leads: mine.length, won: mine.filter(function(r){ return r.won; }).length, restoration: mine.filter(function(r){ return /^(water|fire|storm)$/.test(r.service); }).length };
  if (opt.soldValues) out.sold = mine.reduce(function(t, r){ return t + (r.won ? +r.sold || 0 : 0); }, 0);
  let spend = 0; const camp = low(m.campaign);
  if (camp) arr(adcamps).forEach(function(a){ if (a && !a.del && (low(a.campaignId) === camp || low(a.name) === camp)) spend += +a.spend30 || 0; });
  out.spend = Math.round(spend || +exp.actualCost || +exp.cost || 0);
  out.cpl = out.spend && out.leads ? Math.round(out.spend / out.leads) : null;
  return out;
}
/* the monthly scorecard: leads by source and service, restoration share vs the focus, reviews gained, posts published,
   listings fixed, the best and worst campaign. month = 'YYYY-MM'. */
function scorecard(rows, o){
  o = o || {}; const month = /^\d{4}-\d{2}$/.test(s(o.month)) ? s(o.month) : new Date().toISOString().slice(0, 7);
  const inM = function(v){ return s(v).slice(0, 7) === month; };
  const mr = arr(rows).filter(function(r){ return inM(r.date); });
  const count = function(key){ const x = {}; mr.forEach(function(r){ const k = r[key] || '—'; x[k] = (x[k] || 0) + 1; }); return x; };
  const fn = funnel(mr, [], o.focus, { soldValues: !!o.soldValues });
  const camps = fn.campaigns.filter(function(c){ return c.leads > 0; }).map(function(c){ return { campaign: c.campaign, source: c.source, leads: c.leads, won: c.won, sold: c.sold }; });
  const score = function(c){ return c.won * 100 + c.leads; };
  camps.sort(function(a, b){ return score(b) - score(a); });
  return { month: month, leads: mr.length, won: mr.filter(function(r){ return r.won; }).length, bySource: count('source'), byService: count('service'),
    restoration: fn.restoration,
    reviews: arr(o.reviews).filter(function(r){ return r && !r.del && inM(r.date || r.createdAt); }).length,
    posts: arr(o.posts).filter(function(p){ return p && !p.del && p.status === 'posted' && inM(p.postedAt); }).length,
    listingsFixed: arr(o.listings).filter(function(l){ return l && inM(l.fixedAt); }).length,
    best: camps[0] || null, worst: camps.length > 1 ? camps[camps.length - 1] : null };
}

/* ── 6. his To-Dos (the shared To-Do store holds everyone's: he only ever gets his own) ── */
function mine(t, email){ return !!t && !t.deleted && (arr(t.assignees).map(low).indexOf(email) >= 0 || low(t.assignee) === email || low(t.assigneeEmail) === email || low(t.owner) === email || low(t.addedByEmail) === email && t.personal); }   /* patch MMTABS: + assigneeEmail (voice / AI to-dos) */
function myTasks(list, email){ return arr(list).filter(function(t){ return mine(t, email); }).map(function(t){ return { id: s(t.id), label: scrubText(s(t.label)), note: scrubText(s(t.note)).slice(0, 600), due: s(t.due), done: !!t.done, by: scrubText(s(t.addedBy)).slice(0, 60), self: low(t.addedByEmail) === email || !!t.self /* patch MMTABS */, priority: s(t.priority), plan: !!(t.plan || t.kind === 'plan' || /^plan_/.test(s(t.id))), items: arr(t.items).map(function(i){ return { id: s(i.id), label: scrubText(s(i.label)), done: !!i.done }; }) }; }); }

module.exports = { expMatch, expResults, scorecard, expStage, auth, orStaff, isMarketingRow, settings, setSettings, settingsOf, ADMIN_KEY, redact, redactDoc, scrubText, mergeWrite, jobs, photos, allowedRefs, sourceOf, stageOf, myLeads, funnel, myTasks, mine, STAGES, PII_KEYS,
  _setNow: function(f){ nowFn = f || function(){ return Date.now(); }; } };
