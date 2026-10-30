/* ── GrayCo — MARKETING FEATURES (patch MKTFEAT): before / after drafts, the review tracker, the weekly Google ranking
   check, the owner's monthly marketing report. (The fifth one, the lost-lead win-back at 30–90 days, lives in
   _lib/winback.js next to the 6 / 12-month check-ins it extends.)

   Owner (30 Oct 2026, approved): (2) a before / after post draft from every finished job, (3) a review tracker per
   finished job and per PM, (4) a weekly Google ranking check for the main searches, (6) a monthly marketing report
   e-mailed to the owner on the 1st, (7) lost-lead win-back.

   Rules kept (docs/TEAM-ROLES.md "Marketing Manager", docs/MARKETING-PART2.md):
   * The Marketing Manager never gets a customer name, phone, e-mail or street address, a job cost, margin or profit.
     Every answer to him goes through soc.js, which redacts it again (mm.js redact()); the rows built here for him carry
     only the city, the service, the PM and dates.
   * Before / after: only photos the customer can see (shared === true), never a sub's photo, never a Damage photo, and
     only for a job whose customer said yes to marketing (the same rule as the media library). The caption names the
     service and the city — never the customer, the street or the insurance company. ONE draft per job (the post id is
     derived from the job id). It is a DRAFT: it waits in Social posts for the Marketing Manager / the office to edit and
     send for approval; nothing posts by itself.
   * Rankings: Google Search Console's own average position for grayco-cs.com (a read; the service account the e-mail
     reading already uses, GOOGLE_SA_EMAIL / GOOGLE_SA_KEY). Never a made-up number: no data = "not seen this week".
   * The report goes to staff addresses only (@grayco-cs.com): the admins picked in Marketing settings.
   * ⏸ Data-entry mode: no drafts are made while it is on (old jobs typed in would all look "just finished").

   State (service-only store gc_lead_inbox_kv, key "gc_mktfeat_v1", never synced to browsers):
     { ba: { jobs: { <jobId>: { at, postId | skip } } },
       rank: { terms: [..], site, checks: [{ at, from, to, rows: { term: { position, clicks, impressions } | { none } } }], lastError, lastErrorAt, ranAt },
       report: { to: [emails], sent: { 'YYYY-MM': { at, ok, to, tries } } },
       asks: { <jobId>: { at, how, by } } } */
'use strict';
const crypto = require('crypto');
const KS = 'gc_mktfeat_v1';
const TZ = 'America/Chicago';
const DEFAULT_TERMS = ['roof repair memphis', 'roofing bartlett tn', 'water damage restoration memphis', 'storm damage roof memphis'];
const BA_DAYS = 45, BA_PER_RUN = 3, REVIEW_DAYS = 365;
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GSC_API = 'https://www.googleapis.com/webmasters/v3';   /* www.googleapis.com: a read (data-entry mode lets it through) */
let nowFn = function(){ return Date.now(); };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : (v && Array.isArray(v.list) ? v.list : []); }
function num(v){ const n = +v; return isFinite(n) ? n : 0; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n) : v; }
function ymd(v){ const m = /^(\d{4}-\d{2}-\d{2})/.exec(s(v)); return m ? m[1] : ''; }
function hash(v, n){ return crypto.createHash('sha256').update('mktfeat|' + s(v)).digest('hex').slice(0, n || 12); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function staffEmail(e){ return okEmail(e) && /@([a-z0-9-]+\.)*grayco-cs\.com$/i.test(s(e)); }
function nowIso(){ return new Date(nowFn()).toISOString(); }
function central(t){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t == null ? nowFn() : t));
  const o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
  return { wd: o.weekday, hour: parseInt(o.hour, 10) % 24, ymd: o.year + '-' + o.month + '-' + o.day, day: +o.day, month: o.year + '-' + o.month };
}
function prevMonth(m){ const y = +m.slice(0, 4), mo = +m.slice(5, 7); const d = new Date(Date.UTC(y, mo - 2, 15)); return d.toISOString().slice(0, 7); }
function monthLabel(m){ const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 15)); return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
function money(n){ return n == null || !isFinite(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }

/* the libraries around it (each function file is bundled alone: plain requires) */
function L(){ return require('../bid-inbox.js')._lib; }
function M(){ return require('./mkt.js'); }
function MMl(){ return require('./mm.js'); }
function C(){ return require('./mkt-content.js'); }
function SC(){ return require('./soc-content.js'); }
function core(){ return require('../portal.js')._core; }

async function stateGet(){ const v = await L().kvGet(KS); return norm(v); }
function norm(v){ v = v && typeof v === 'object' ? v : {}; v.ba = v.ba || {}; v.ba.jobs = v.ba.jobs || {}; v.rank = v.rank || {}; v.rank.checks = arr(v.rank.checks); v.report = v.report || {}; v.report.sent = v.report.sent || {}; v.asks = v.asks || {}; return v; }
async function stateChange(fn){
  let out;
  const r = await L().kvCas(KS, function(v){ v = norm(v); out = fn(v); return out === false ? undefined : v; });
  if (r && r.ok === false) throw new Error('busy — try again');
  return out;
}
async function paused(){ try { return !!(await require('./pause.js').isPaused()); } catch (e) { return true; } }   /* fail closed, like pause.js */

/* ══════════════ the jobs: finished, service, city ══════════════ */
const DEAD = /lost|dead|cancel|void|declin/i;
function finished(p){
  if (!p || p.deleted === true || p._deleted === true || DEAD.test(s(p.status))) return false;
  return /^(completed?|closed|done|finished|paid)\b/i.test(s(p.status)) || s(p.jobStage) === 'complete' || num(p.pct) >= 100 || num(p.percentComplete) >= 100 || !!(p.closeout && typeof p.closeout === 'object' && (p.closeout.paid || p.closeout.at || p.closeout.done));
}
function finishedAt(p){
  const st = p.jobStageAt && typeof p.jobStageAt === 'object' ? p.jobStageAt.complete : '';
  const co = p.closeout && typeof p.closeout === 'object' ? (p.closeout.at || p.closeout.paid) : '';
  return ymd(p.completedAt) || ymd(p.completionDate) || ymd(st) || ymd(co) || ymd(p.closedAt) || ymd(p.finishedAt) || ymd(p.endDate) || ymd(p.updatedAt) || '';
}
/* the service in plain words: water / fire / storm / roofing / remodel / commercial */
function serviceKey(p){ const v = SC().serviceOf(p); if (v === 'restoration') return SC().restSubOf(p) || 'storm'; return v || 'remodel'; }
const SVC_WORDS = { water: 'water damage restoration', fire: 'fire damage restoration', storm: 'storm damage repair', roofing: 'a new roof', remodel: 'a home remodel', commercial: 'a commercial project' };
const SVC_LABEL = { water: 'Water damage', fire: 'Fire damage', storm: 'Storm damage', roofing: 'Roofing', remodel: 'Remodel', commercial: 'Commercial' };
/* the city only (never the street): the job's city field, else the part after the first comma of the address */
function cityOf(p){
  let c = s(p && p.city) || s(s(p && (p.address || p.jobAddress)).split(',')[1]).replace(/\b(TN|MS|AR)\b.*$/i, '').trim();
  if (!c || /\d/.test(c) || c.length > 40 || C().CARRIER_RE.test(c)) return 'the Memphis area';
  return c.replace(/\s+/g, ' ');
}
function pmOf(p){ return s(p.pm || p.projectManager || p.pmName || p.assignedPm) || 'Unassigned'; }
function permOk(doc, p){ const r = doc && doc.perms && doc.perms['job_' + s(p && p.id)]; return !!((r && !r.del && r.marketing === true) || (p && (p.marketingOk === true || p.mktPhotoOk === true))); }

/* ══════════════ (2) BEFORE / AFTER DRAFTS ══════════════ */
function isSubPhoto(r){ return low(r.source) === 'sub' || !!s(r.subId) || /^sub:/.test(low(r.byKey)) || /\(sub\)\s*$/i.test(s(r.by)) || r.fromSub === true; }
/* the photos the customer can see on this job (shared === true), never a sub's, never a Damage / CompanyCam-flag one, oldest first */
function customerPhotos(data, pid){
  return arr(data.gc_photos).filter(function(r){ return r.deleted !== true && s(r.jobId) === s(pid) && r.shared === true && !isSubPhoto(r) && s(r.ref) && r.source !== 'ccflag' && low(r.tag) !== 'damage'; })
    .sort(function(a, b){ const x = s(a.takenAt || a.at || a.addedAt), y = s(b.takenAt || b.at || b.addedAt); return x < y ? -1 : x > y ? 1 : 0; });
}
/* an early one and the final one: Before / After tags first, else the oldest and the newest; two different pictures */
function pickPair(list){
  if (list.length < 2) return null;
  const before = list.find(function(r){ return low(r.tag) === 'before'; }) || list[0];
  const afters = list.filter(function(r){ return low(r.tag) === 'after' && r !== before; });
  const after = afters.length ? afters[afters.length - 1] : list.slice().reverse().find(function(r){ return r !== before && low(r.tag) !== 'before'; }) || null;
  if (!after || s(after.ref) === s(before.ref)) return null;
  return { before: before, after: after };
}
function baCaption(svc, city){
  const B = C().BRAND;
  return '✨ Before & after: ' + (SVC_WORDS[svc] || 'a home project') + ' in ' + city + '. From the first look to the final walk-through — thank you for trusting GrayCo. 🏡\n\nFree estimates: ' + B.phone + '\n\n' + (B.hashtags || '#GrayCo');
}
function baPostId(pid){ return 'post_ba_' + hash('ba|' + pid); }
/* what each finished job can get: { pid, status: 'ready' | 'drafted' | 'no-ok' | 'photos', pair } */
function baStatus(p, data, doc, st){
  const pid = s(p.id), id = baPostId(pid), have = doc && doc.posts && doc.posts[id];
  const other = M()._recs(doc, 'posts').find(function(x){ return s(x.jobId) === pid && (x.kind === 'job' || x.socType === 'beforeafter' || x.autoBA); });
  if (have || (st && st.ba.jobs[pid] && st.ba.jobs[pid].postId)) return { status: 'drafted', postId: id, post: have && !have.del ? have : null };
  if (other) return { status: 'drafted', postId: s(other.id), post: other };
  if (!permOk(doc, p)) return { status: 'no-ok' };
  const pair = pickPair(customerPhotos(data, pid));
  if (!pair) return { status: 'photos', shared: customerPhotos(data, pid).length };
  return { status: 'ready', pair: pair };
}
/* the daily run: at most BA_PER_RUN new drafts, jobs finished in the last BA_DAYS days, one per job */
async function runBeforeAfter(o){
  o = o || {};
  if (s(process.env.MKTFEAT_BA_OFF) === '1') return { off: true };
  if (!o.ignorePause && await paused()) return { dataEntryMode: true };
  const data = await M().crmData(['projects', 'gc_photos', 'gc_deleted_projects']);
  const dead = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ dead[s(x)] = 1; });
  const doc = await M().readDoc(), st = await stateGet();
  const cut = new Date(nowFn() - BA_DAYS * 864e5).toISOString().slice(0, 10);
  const jobs = arr(data.projects).filter(function(p){ return p.id && !dead[s(p.id)] && finished(p) && (finishedAt(p) || '0000') >= cut; })
    .sort(function(a, b){ return finishedAt(a) < finishedAt(b) ? 1 : -1; });
  const out = { looked: jobs.length, made: [], skipped: {} };
  const A = (M()._cfg(doc).autopilot) || {}, times = arr(A.times);
  for (const p of jobs) {
    if (out.made.length >= (o.max || BA_PER_RUN)) break;
    const b = baStatus(p, data, doc, st);
    if (b.status !== 'ready') { out.skipped[b.status] = (out.skipped[b.status] || 0) + 1; continue; }
    const svc = serviceKey(p), city = cityOf(p), caption = baCaption(svc, city), addr = s(p.address || p.jobAddress);
    if (C().guard(caption, [addr]).length) { out.skipped.guard = (out.skipped.guard || 0) + 1; continue; }   /* never: it names only the service and the city */
    const id = baPostId(p.id), slot = C().nextSlots(nowFn() + 2 * 864e5, 1, times)[0] || '';
    const rec = { id: id, title: 'Before / after — ' + (SVC_LABEL[svc] || 'Job') + ' in ' + city, kind: 'job', src: 'job', socType: 'beforeafter', socService: SC().serviceOf(p) || 'remodel', socSub: /^(water|fire|storm)$/.test(svc) ? svc : '',
      jobId: s(p.id), jobAddresses: addr ? [addr] : [], caption: caption, photoRef: s(b.pair.after.ref), beforeRef: s(b.pair.before.ref), afterRef: s(b.pair.after.ref), photoRefs: [s(b.pair.before.ref), s(b.pair.after.ref)],
      networks: ['facebook', 'instagram'], scheduleAt: slot, status: 'draft', autoBA: true, baCity: city, baService: svc, createdAt: nowIso(), by: 'CRM (before / after)' };
    const w = await M().update(function(d){ if (d.posts && d.posts[id]) return null; return [M()._put(d, 'posts', rec)]; });
    if (!w.ok) { out.error = 'busy'; break; }
    await stateChange(function(v){ v.ba.jobs[s(p.id)] = { at: nowIso(), postId: id }; });
    out.made.push(id);
  }
  return out;
}

/* ══════════════ (3) THE REVIEW TRACKER ══════════════ */
const REVIEWISH = /^(thank_you|review|review_request)$/;
/* when / how the review was asked for, from everything the CRM already records (earliest sent first, else the waiting one) */
function askOf(p, doc, queue, st){
  const pid = s(p.id), c = [];
  const ra = doc && doc.reviewAsks && doc.reviewAsks[pid]; if (ra && !ra.del && ra.at) c.push({ at: ymd(ra.at), how: ra.how === 'text' ? 'text' : ra.how === 'in person' ? 'in person' : 'e-mail', sent: true });
  const mine = st && st.asks && st.asks[pid]; if (mine && mine.at) c.push({ at: ymd(mine.at), how: s(mine.how) || 'recorded', sent: true });
  arr(queue).forEach(function(x){ if (s(x.jobId) !== pid || !REVIEWISH.test(s(x.kind))) return;
    if (x.status === 'sent') c.push({ at: ymd(x.sentAt || x.updatedAt), how: 'e-mail (thank-you + review link)', sent: true });
    else if (x.status === 'waiting' || x.status === 'sending') c.push({ at: ymd(x.createdAt), how: 'e-mail waiting for approval', sent: false }); });
  if (p.reviewRequestedAt || p.mkReviewAskedAt) c.push({ at: ymd(p.reviewRequestedAt || p.mkReviewAskedAt), how: 'recorded on the job', sent: true });
  if (arr(p.apChecklist).some(function(x){ return x.k === 'review' && x.s === 'sent'; })) c.push({ at: '', how: 'job checklist', sent: true });
  const sent = c.filter(function(x){ return x.sent; }).sort(function(a, b){ return (a.at || '9') < (b.at || '9') ? -1 : 1; });
  return sent[0] || c[0] || null;
}
function nameWords(v){ return low(v).replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(function(w){ return w.length >= 1 && !/^(mr|mrs|ms|dr|and|the|llc|inc|roof|water|fire|storm|job|remodel|repair|kitchen|bath)$/.test(w); }); }
/* a Google review by the job's customer: first name the same, and the last name (or its initial) the same; written from 3 days
   before the finish to 120 days after (never shown to the Marketing Manager: only the rating, date and source come out) */
function nameMatch(author, client){
  const a = nameWords(author), c = nameWords(client); if (!a.length || c.length < 2) return false;
  if (a[0].length < 2 || a[0] !== c[0]) return false;
  if (a.length < 2) return false;
  const al = a[a.length - 1].replace(/\.$/, ''), cl = c[c.length - 1];
  return al === cl || (al.length === 1 && cl[0] === al);
}
function reviewsOf(doc){ return M()._recs(doc, 'reviews').map(function(r){ return { id: s(r.id), jobId: s(r.jobId), rating: num(r.rating) || null, date: ymd(r.date || r.createdAt || r.at), source: s(r.source) && !/^added by /i.test(s(r.source)) ? s(r.source) : 'added by hand', author: s(r.author || r.name) }; }); }
function trackerRows(data, doc, queue, st, opt){
  opt = opt || {};
  const cut = new Date(nowFn() - (opt.days || REVIEW_DAYS) * 864e5).toISOString().slice(0, 10);
  const jobs = arr(data.projects).filter(function(p){ return p.id && finished(p) && (finishedAt(p) || '0000') >= cut; }).sort(function(a, b){ return finishedAt(a) < finishedAt(b) ? 1 : -1; });
  const revs = reviewsOf(doc), used = {};
  const rows = jobs.map(function(p){
    const pid = s(p.id), fin = finishedAt(p);
    let rv = revs.find(function(r){ return r.jobId === pid && !used[r.id]; });
    if (!rv) rv = revs.find(function(r){ if (used[r.id] || r.jobId || !/google/i.test(r.source)) return false; if (fin && r.date && (r.date < addDays(fin, -3) || r.date > addDays(fin, 120))) return false; return nameMatch(r.author, p.client || p.clientName || p.customer); });
    if (rv) used[rv.id] = 1;
    const ask = askOf(p, doc, queue, st), ba = baStatus(p, data, doc, st), svc = serviceKey(p);
    const row = { key: 'J-' + hash('job|' + pid, 10), finished: fin, city: cityOf(p), service: svc, serviceLabel: SVC_LABEL[svc] || svc, pm: pmOf(p),
      asked: ask ? { at: ask.at, how: ask.how, sent: !!ask.sent } : null,
      received: rv ? { rating: rv.rating, at: rv.date, source: rv.source, matched: rv.jobId ? 'linked' : 'by name' } : null,
      ba: ba.status, baPost: ba.post ? { id: s(ba.post.id), status: s(ba.post.status) || 'draft' } : null };
    if (opt.full) { row.jobId = pid; row.job = s(p.name); row.client = s(p.client || p.clientName); }
    return row;
  });
  const per = {};
  rows.forEach(function(r){ const x = per[r.pm] = per[r.pm] || { pm: r.pm, jobs: 0, asked: 0, received: 0, stars: 0, rated: 0 }; x.jobs++; if (r.asked && r.asked.sent) x.asked++; if (r.received) { x.received++; if (r.received.rating) { x.stars += r.received.rating; x.rated++; } } });
  const perPm = Object.keys(per).map(function(k){ const x = per[k]; return { pm: x.pm, jobs: x.jobs, asked: x.asked, received: x.received, avg: x.rated ? Math.round(x.stars / x.rated * 10) / 10 : null }; }).sort(function(a, b){ return b.jobs - a.jobs; });
  const tot = rows.reduce(function(t, r){ t.jobs++; if (r.asked && r.asked.sent) t.asked++; if (r.received) t.received++; return t; }, { jobs: 0, asked: 0, received: 0 });
  return { rows: rows, perPm: perPm, totals: tot };
}
function addDays(d, n){ const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
async function tracker(opt){
  const data = await M().crmData(['projects', 'gc_photos']), doc = await M().readDoc(), st = await stateGet();
  let q = []; try { q = ((await core().kvListRead(core().AQ_KEY || 'gc_approval_queue')) || {}).list || []; } catch (e) {}
  return trackerRows(data, doc, q, st, opt);
}
/* "✓ Asked (text / in person)": recorded by the office, an admin or the Marketing Manager (by the row's key — he never has the job id) */
async function markAsked(key, how, who){
  const data = await M().crmData(['projects']);
  const p = arr(data.projects).find(function(x){ return x.id && ('J-' + hash('job|' + s(x.id), 10) === s(key) || s(x.id) === s(key)); });
  if (!p) return { ok: false, error: 'That job is not on the list.' };
  how = /^(text|in person|e-mail|phone call)$/.test(s(how)) ? s(how) : 'text';
  await stateChange(function(v){ v.asks[s(p.id)] = { at: nowIso(), how: how, by: clip(who && (who.name || who.email), 60) }; });
  return { ok: true };
}

/* ══════════════ (4) THE WEEKLY GOOGLE RANKING CHECK (Search Console) ══════════════ */
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function saAccount(){ try { return require('./gmail.js').account(); } catch (e) { return { ok: false }; } }
function gscJwt(acc, nowSec){
  const iat = nowSec || Math.floor(nowFn() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: acc.email, scope: GSC_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: iat, exp: iat + 3600 }));   /* no "sub": the service account itself is a Search Console user */
  return head + '.' + body + '.' + b64u(crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(acc.key));
}
async function gscToken(acc){
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(gscJwt(acc)) });
  const j = await r.json().catch(function(){ return {}; });
  if (!r.ok || !j.access_token) throw Object.assign(new Error('Google did not sign the service account in (' + s(j.error_description || j.error || r.status) + ').'), { code: 'denied' });
  return j.access_token;
}
function cleanTerms(list){
  const seen = {}, out = [];
  (Array.isArray(list) ? list : s(list).split(/\n|,/)).forEach(function(t){ t = low(t).replace(/\s+/g, ' ').replace(/[^a-z0-9 '&.-]/g, '').trim().slice(0, 80); if (t && !seen[t] && out.length < 25) { seen[t] = 1; out.push(t); } });
  return out;
}
function termsOf(st){ const t = cleanTerms(st.rank.terms); return t.length ? t : DEFAULT_TERMS.slice(); }
/* the property: GSC_SITE, else the one the service account can open for grayco-cs.com (the domain property first) */
async function gscSite(tok){
  const want = s(process.env.GSC_SITE);
  const r = await fetch(GSC_API + '/sites', { headers: { Authorization: 'Bearer ' + tok } });
  const j = await r.json().catch(function(){ return {}; });
  if (!r.ok) throw Object.assign(new Error('Search Console answered ' + r.status + (j.error && j.error.message ? ': ' + j.error.message : '') + '.'), { code: r.status === 403 ? 'api_off' : 'error' });
  const sites = arr(j.siteEntry).filter(function(x){ return x.permissionLevel !== 'siteUnverifiedUser'; }).map(function(x){ return s(x.siteUrl); });
  if (want) { if (sites.indexOf(want) >= 0) return want; throw Object.assign(new Error('The service account is not a user of ' + want + ' in Search Console yet.'), { code: 'no_access' }); }
  const pick = sites.find(function(u){ return u === 'sc-domain:grayco-cs.com'; }) || sites.find(function(u){ return /^https?:\/\/(www\.)?grayco-cs\.com\/?$/.test(u); }) || sites.find(function(u){ return /grayco-cs\.com/.test(u); });
  if (!pick) throw Object.assign(new Error('The service account is not a user of the grayco-cs.com property in Search Console yet.'), { code: 'no_access' });
  return pick;
}
/* one week of Search Console data per search: the 7 full days that end 3 days ago (Google needs ~2 days to settle) */
async function runRank(o){
  o = o || {};
  const acc = saAccount();
  const st0 = await stateGet(), terms = termsOf(st0);
  if (!acc.ok) { await stateChange(function(v){ v.rank.lastError = 'not_configured'; v.rank.lastErrorAt = nowIso(); }); return { ok: false, code: 'not_configured' }; }
  const end = new Date(nowFn() - 3 * 864e5).toISOString().slice(0, 10), start = addDays(end, -6);
  try {
    const tok = await gscToken(acc), site = await gscSite(tok), rows = {};
    for (const t of terms) {
      const r = await fetch(GSC_API + '/sites/' + encodeURIComponent(site) + '/searchAnalytics/query', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['query'], dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'equals', expression: t }] }], rowLimit: 5 }) });
      const j = await r.json().catch(function(){ return {}; });
      if (!r.ok) throw Object.assign(new Error('Search Console answered ' + r.status + (j.error && j.error.message ? ': ' + j.error.message : '') + '.'), { code: r.status === 403 ? 'no_access' : 'error' });
      const row = arr(j.rows)[0];
      rows[t] = row && num(row.impressions) > 0 ? { position: Math.round(num(row.position) * 10) / 10, clicks: num(row.clicks), impressions: num(row.impressions) } : { none: true };
    }
    const check = { at: nowIso(), from: start, to: end, site: site, rows: rows };
    await stateChange(function(v){ v.rank.site = site; v.rank.lastError = ''; v.rank.ranAt = check.at; v.rank.checks = arr(v.rank.checks).filter(function(c){ return c.to !== end; }).concat([check]).slice(-60); });
    return { ok: true, check: check };
  } catch (e) {
    const code = e.code || 'error', msg = clip(e && e.message, 300);
    await stateChange(function(v){ v.rank.lastError = code + ': ' + msg; v.rank.lastErrorAt = nowIso(); v.rank.ranAt = nowIso(); });
    return { ok: false, code: code, error: msg };
  }
}
/* the view: the searches, each with its last 8 weeks (oldest → newest), and the set-up state. Never a number Google did not give. */
function rankView(st, admin){
  const acc = saAccount(), terms = termsOf(st), checks = arr(st.rank.checks).slice(-8);
  const err = s(st.rank.lastError), code = err.split(':')[0];
  const connected = acc.ok && !!checks.length && !/^(not_configured|no_access|api_off|denied)$/.test(code);
  const out = { terms: terms, defaults: DEFAULT_TERMS, configured: acc.ok, connected: connected, site: s(st.rank.site), ranAt: s(st.rank.ranAt), problem: code || '', problemText: err.replace(/^[a-z_]+: ?/, ''),
    series: terms.map(function(t){ return { term: t, weeks: checks.map(function(c){ const r = c.rows && c.rows[t]; return { to: c.to, position: r && !r.none ? r.position : null, clicks: r && !r.none ? r.clicks : null, impressions: r && !r.none ? r.impressions : null, seen: !!(r && !r.none), checked: !!r }; }) }; }) };
  if (admin) out.saEmail = s(acc.email);   /* the address the owner adds in Search Console (not a secret; shown to admins) */
  return out;
}

/* ══════════════ (6) THE OWNER'S MONTHLY MARKETING REPORT ══════════════ */
async function adminList(){ try { return (await require('./agency.js').adminEmails()).filter(staffEmail); } catch (e) { return ['wjohnson@grayco-cs.com']; } }
function defaultTo(admins){ const first = s((process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com').split(',')[0]).toLowerCase(); return staffEmail(first) ? [first] : admins.slice(0, 1); }
async function reportTo(st){ st = st || await stateGet(); const t = arr([]).concat(Array.isArray(st.report.to) ? st.report.to : []).map(low).filter(staffEmail); return st.report.to ? t : defaultTo(await adminList()); }
/* the numbers: the dashboard's own (agency.js summary / monthTable = the 📊 Dashboard's lead sources, marketing spend + the
   ad platforms' charges), the reviews and posts of the month, the best / worst campaign (mm.js scorecard) */
async function reportData(month){
  const AG = require('./agency.js');
  const now = central().ymd, m = /^\d{4}-\d{2}$/.test(s(month)) ? s(month) : prevMonth(central().month);
  const S = await AG.summary({ now: now, months: 12 });
  const mt = AG.monthTable(S.sum, S.spend, m, { shareRevenue: true });
  const doc = S.doc, data = await M().crmData(['leads', 'projects', 'users', 'gc_photos']);
  const rows = MMl().myLeads(data, doc, { soldValues: true });
  const sc = MMl().scorecard(rows, { month: m, focus: M()._cfg(doc).socFocus, soldValues: true, reviews: M()._recs(doc, 'reviews'), posts: M()._recs(doc, 'posts'), listings: M()._recs(doc, 'listings') });
  let q = []; try { q = ((await core().kvListRead(core().AQ_KEY || 'gc_approval_queue')) || {}).list || []; } catch (e) {}
  const st = await stateGet(), tr = trackerRows(data, doc, q, st, { days: 400 });
  const asked = tr.rows.filter(function(r){ return r.asked && r.asked.sent && s(r.asked.at).slice(0, 7) === m; }).length;
  const revs = reviewsOf(doc).filter(function(r){ return s(r.date).slice(0, 7) === m; });
  const stars = revs.filter(function(r){ return r.rating; });
  const rv = rankView(st, false);
  return { month: m, label: monthLabel(m), table: mt, scorecard: sc, reviews: { gained: revs.length, avg: stars.length ? Math.round(stars.reduce(function(t, r){ return t + r.rating; }, 0) / stars.length * 10) / 10 : null, asked: asked }, posts: sc.posts, best: sc.best, worst: sc.worst, ranks: rv };
}
function reportHtml(R){
  const th = function(t, r){ return '<th style="text-align:' + (r ? 'right' : 'left') + ';padding:6px 8px;border-bottom:2px solid #0F1D2F;font-size:12px">' + t + '</th>'; };
  const td = function(t, r){ return '<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px' + (r ? ';text-align:right' : '') + '">' + t + '</td>'; };
  const t = R.table, tot = t.totals;
  let h = '<h2 style="margin:0 0 6px;font-size:19px;color:#0F1D2F">Marketing report — ' + esc(R.label) + '</h2>' +
    '<p style="margin:0 0 14px;color:#55626F;font-size:13px">Leads that came in during ' + esc(R.label) + ', by source, with that month\'s marketing spend and ad charges. Jobs won count to the month the lead came in. The same numbers as Marketing → 📊 Dashboard.</p>';
  h += '<table role="presentation" style="border-collapse:collapse;width:100%"><tr>' + th('Source') + th('Leads', 1) + th('Spend', 1) + th('Cost / lead', 1) + th('Jobs won', 1) + th('Sold value', 1) + '</tr>' +
    t.rows.map(function(r){ return '<tr>' + td(esc(r.channel)) + td(r.leads, 1) + td(r.spend ? money(r.spend) : '—', 1) + td(r.cpl != null ? money(r.cpl) : '—', 1) + td(r.won, 1) + td(r.won ? money(r.revenue) : '—', 1) + '</tr>'; }).join('') +
    '<tr style="font-weight:bold">' + td('Total') + td(tot.leads, 1) + td(money(tot.spend), 1) + td(tot.cpl != null ? money(tot.cpl) : '—', 1) + td(tot.won, 1) + td(money(tot.revenue), 1) + '</tr></table>';
  if (!t.rows.length) h += '<p style="color:#55626F">No leads or spend recorded for ' + esc(R.label) + '.</p>';
  const camp = function(c){ return c ? esc(c.campaign || c.source) + ' (' + esc(c.source) + ') — ' + c.leads + ' lead' + (c.leads === 1 ? '' : 's') + ', ' + c.won + ' won' + (c.sold ? ', ' + money(c.sold) + ' sold' : '') : '—'; };
  h += '<h3 style="font-size:15px;margin:20px 0 6px">The month in marketing</h3><table role="presentation" style="border-collapse:collapse;width:100%">' +
    '<tr>' + td('⭐ Reviews gained') + td(R.reviews.gained + (R.reviews.avg ? ' (average ' + R.reviews.avg + '★)' : ''), 1) + '</tr>' +
    '<tr>' + td('📨 Review requests sent') + td(R.reviews.asked, 1) + '</tr>' +
    '<tr>' + td('📱 Posts published') + td(R.posts, 1) + '</tr>' +
    '<tr>' + td('🏆 Top campaign') + td(camp(R.best), 1) + '</tr>' +
    '<tr>' + td('⚠️ Worst campaign') + td(R.worst ? camp(R.worst) : '— (one campaign or none)', 1) + '</tr></table>';
  const rk = R.ranks;
  if (rk && rk.connected) {
    h += '<h3 style="font-size:15px;margin:20px 0 6px">🔎 Google — average position (Search Console)</h3><table role="presentation" style="border-collapse:collapse;width:100%"><tr>' + th('Search') + th('Latest', 1) + th('4 weeks ago', 1) + '</tr>' +
      rk.series.map(function(x){ const w = x.weeks, last = w[w.length - 1], old = w.length > 4 ? w[w.length - 5] : null; const f = function(v){ return v && v.position != null ? '#' + v.position : 'not seen'; };
        return '<tr>' + td(esc(x.term)) + td(f(last), 1) + td(old ? f(old) : '—', 1) + '</tr>'; }).join('') + '</table>';
  } else h += '<p style="color:#55626F;font-size:13px;margin-top:18px">🔎 Google rankings: Search Console is not connected yet (Marketing → 🔎 Google rankings has the steps).</p>';
  h += '<p style="margin-top:18px"><a href="' + esc(require('./brand.js').siteBase()) + '/" style="color:#1E2060;font-weight:bold">Open the CRM → 📣 Marketing →</a></p>';
  return h;
}
async function sendMail(to, subject, html){
  to = Array.from(new Set(arr([]).concat(to || []).map(low).filter(staffEmail)));
  if (!to.length) return { ok: false, error: 'No staff address to send it to.' };
  const key = s(process.env.RESEND_API_KEY); if (!key || s(process.env.PORTAL_MAIL_OFF) === '1') return { ok: false, error: 'E-mail is not set up (RESEND_API_KEY).' };
  const body = require('./brand.js').shell(html, { sender: false, legal: false });
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Marketing <portal@grayco-cs.com>', reply_to: s(process.env.REPLY_TO_ADMIN) || 'replies@grayco-cs.com', to: to, subject: clip(subject, 200), html: body, headers: { 'X-GrayCo-CRM': 'mktfeat-report' } }) });
    return { ok: !!(r && r.ok), status: r && r.status, to: to };
  } catch (e) { return { ok: false, error: 'no answer' }; }
}
async function sendReport(o){
  o = o || {};
  const R = await reportData(o.month), to = o.to || await reportTo();
  const r = await sendMail(to, 'GrayCo marketing — ' + R.label + (o.now ? ' (so far)' : ''), reportHtml(R));
  return Object.assign({ month: R.month }, r);
}
/* the 1st, from 8 AM Central: last month to the picked admins; once a month (a failed send tries again next hour, 3 times) */
async function runReport(o){
  o = o || {};
  const c = central(o.now);
  if (!o.force && (c.day !== 1 || c.hour < 8)) return { skipped: 'not the 1st after 8 AM' };
  const m = prevMonth(c.month);
  let mine = false;
  await stateChange(function(v){ const x = v.report.sent[m]; if (x && (x.ok || num(x.tries) >= 3 || (x.claim && nowFn() - Date.parse(x.claim) < 30 * 60e3))) return false; v.report.sent[m] = Object.assign({}, x || {}, { claim: nowIso(), tries: num(x && x.tries) + 1 }); mine = true; });
  if (!mine) return { skipped: 'done already ' + m };
  const r = await sendReport({ month: m });
  await stateChange(function(v){ v.report.sent[m] = Object.assign({}, v.report.sent[m] || {}, { at: nowIso(), ok: !!r.ok, to: r.to || [], claim: '', error: r.ok ? '' : s(r.error || r.status) });
    const keys = Object.keys(v.report.sent).sort(); keys.slice(0, Math.max(0, keys.length - 24)).forEach(function(k){ delete v.report.sent[k]; }); });
  return r;
}
/* the agency report (agency.js, patch AGY) leaves out the admins who get this one: one marketing e-mail per person on the 1st */
async function ownerReportRecipients(){ try { return await reportTo(); } catch (e) { return []; } }

/* ══════════════ soc.js calls: who may do what ══════════════
   ctx: { marketing, admin, office }. Answers { status, out }; soc.js redacts it again for the Marketing Manager. */
async function op(name, body, who, ctx){
  ctx = ctx || {}; body = body || {};
  const mm = !!ctx.marketing, admin = !!ctx.admin && !mm, office = (!!ctx.office || admin) && !mm;
  const R = function(code, o){ return { status: code, out: o }; };
  if (!mm && !office) return R(403, { ok: false, error: 'The office, an admin or the Marketing Manager.' });
  if (name === 'mf_reviews') { const t = await tracker({ full: !mm }); return R(200, Object.assign({ ok: true, full: !mm }, t)); }
  if (name === 'mf_review_mark') return R(200, await markAsked(body.key, body.how, who));
  if (name === 'mf_rank') { const st = await stateGet(); return R(200, Object.assign({ ok: true, canRun: true }, rankView(st, admin))); }
  if (name === 'mf_rank_terms') {
    const t = cleanTerms(body.terms); if (!t.length) return R(400, { ok: false, error: 'Add at least one search.' });
    await stateChange(function(v){ v.rank.terms = t; v.rank.termsBy = clip(who && (who.name || who.email), 60); v.rank.termsAt = nowIso(); });
    return R(200, Object.assign({ ok: true }, rankView(await stateGet(), admin)));
  }
  if (name === 'mf_rank_run') {
    const st = await stateGet(); if (st.rank.ranAt && nowFn() - Date.parse(st.rank.ranAt) < 10 * 60e3 && body.force !== true) return R(429, { ok: false, error: 'Checked a few minutes ago — try again in 10 minutes.' });
    const r = await runRank({}); return R(200, Object.assign({ ok: r.ok, code: r.code || '', error: r.error || '' }, rankView(await stateGet(), admin)));
  }
  if (name === 'mf_ba_run') { if (mm) return R(403, { ok: false, error: 'An admin or the office does that.' }); return R(200, Object.assign({ ok: true }, await runBeforeAfter({ max: 5 }))); }
  if (!admin) return R(403, { ok: false, error: 'Only an admin does that.' });
  if (name === 'mf_report_cfg') {
    const st = await stateGet(), admins = await adminList();
    if (body.set && Array.isArray(body.set.to)) { const to = body.set.to.map(low).filter(staffEmail).slice(0, 10); await stateChange(function(v){ v.report.to = to; v.report.toBy = s(who && who.email); v.report.toAt = nowIso(); }); }
    const st2 = body.set ? await stateGet() : st, last = Object.keys(st2.report.sent).sort().slice(-1)[0];
    return R(200, { ok: true, to: await reportTo(st2), admins: Array.from(new Set(admins.concat(await reportTo(st2)))), last: last ? Object.assign({ month: last }, st2.report.sent[last]) : null, mailOn: !!s(process.env.RESEND_API_KEY) });
  }
  if (name === 'mf_report_preview') { const D = await reportData(body.month || central().month); return R(200, { ok: true, month: D.month, html: require('./brand.js').shell(reportHtml(D), { sender: false, legal: false }), data: { table: D.table, reviews: D.reviews, posts: D.posts, best: D.best, worst: D.worst } }); }
  if (name === 'mf_report_send') { const r = await sendReport({ month: body.month || central().month, to: [low(who && who.email)], now: !body.month || body.month === central().month }); return R(r.ok ? 200 : 502, Object.assign({ ok: !!r.ok }, r)); }
  return R(400, { ok: false, error: 'Unknown op' });
}

module.exports = { KS, DEFAULT_TERMS, BA_DAYS, finished, finishedAt, serviceKey, cityOf, isSubPhoto, customerPhotos, pickPair, baCaption, baPostId, baStatus, runBeforeAfter,
  askOf, nameMatch, trackerRows, tracker, markAsked, cleanTerms, termsOf, gscJwt, runRank, rankView, reportData, reportHtml, sendReport, runReport, reportTo, ownerReportRecipients, op,
  stateGet, central, prevMonth, _setNow: function(f){ nowFn = f || function(){ return Date.now(); }; } };
