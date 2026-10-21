// netlify/functions/weekly-update.js — patch AUTAI, automation #10: THE WEEKLY CUSTOMER UPDATE, DRAFTED FOR THE PM.
//
// Every Friday at 2 PM Central (netlify.toml runs it at 19:00 and 20:00 UTC on Fridays; it only works in the run
// that is 2 PM in Memphis, so daylight saving never matters), for each ACTIVE job with the customer portal on and the
// job's weekly-update switch on (project.auto.weeklyUpdate; a job without its own choice follows Admin → Automation
// defaults, gc_kv "jobAutoDefaults", and is ON by default), it drafts a friendly progress update from:
//   · this week's GrayCo Photos (the customer-visible ones: how many, and up to 6 go on the post),
//   · the schedule (done this week, coming next week) and % complete (and the change since last week's update),
//   · the week's daily logs (gc_kv "logs"),
//   · the next steps.
// Claude (ANTHROPIC_API_KEY, _lib/ai.js) writes 3–5 warm sentences from those facts only; without the key a plain
// template is used. A job with nothing new this week is skipped.
// It is NEVER sent by itself: it waits on the approvals list (gc_approval_queue) as kind "weekly_update" for the
// job's PM — one tap. Approved, it goes on the customer's portal page (with the photos) and is e-mailed when the job's
// e-mail switch allows it (project.auto.weeklyEmail / progressPosts, and a customer e-mail on file), and texted when
// the job's text switch is on (project.auto.weeklyText) and texting is set up (portal settings "text" + a provider).
// One draft per job per week (id appr_weekly_<job>_<friday>), so a second run changes nothing.
// Netlify does not let anyone call a scheduled function by its URL in production; as a second lock any call that is
// not the scheduler must come from a signed-in admin ({ force: true } runs it now, { projectId } one job).
'use strict';
const portal = require('./portal.js');
const AI = require('./_lib/ai.js');

const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const DAY = 86400e3, TZ = 'America/Chicago';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[%$,\s]/g, '')); return isFinite(n) ? n : null; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function first(v){ return s(v).split(/\s+/)[0] || ''; }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }

/* the same admin check as portal-reminders.js / approval-escalate.js */
async function isAdmin(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return false;
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return false;
    const u = await r.json(); const email = low(u && u.email);
    if (!email || !svc) return false;
    const q = await fetch(url + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc } });
    if (!q.ok) return false;
    const rows = await q.json();
    return !!(rows && rows[0] && rows[0].active !== false && low(rows[0].role) === 'admin');
  } catch (e) { return false; }
}
function scheduledBody(event){ try { const b = JSON.parse((event && event.body) || '{}'); return b && typeof b === 'object' ? b : {}; } catch (e) { return {}; } }

/* Memphis time: weekday + hour + the date */
function central(d){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
  return { wd: o.weekday, hour: parseInt(o.hour, 10) % 24, ymd: o.year + '-' + o.month + '-' + o.day };
}
function isRunTime(d){ const c = central(d); return c.wd === 'Fri' && c.hour === 14; }

/* ── the job's switches (patch JA's table, read the same way; weeklyUpdate is new and ON by default) ── */
function groupOf(p){
  const t = s(p.type) + ' ' + s(p.jobType);
  if (p.isInsurance === true || (p.isInsurance !== false && /insurance|claim|fire damage|water damage|storm|restoration|mitigation/i.test(t))) return 'insurance';
  if (/program/i.test(t)) return 'program';
  if (/commercial|\bTI\b|tenant|church|school/i.test(t)) return 'commercial';
  return 'residential';
}
function sw(p, key, defs, dflt){
  const own = p.auto && typeof p.auto === 'object' ? p.auto : null;
  if (own && typeof own[key] === 'boolean') return own[key];
  const g = defs && defs[groupOf(p)];
  if (g && typeof g[key] === 'boolean') return g[key];
  return dflt;
}
function isActive(p){
  const st = low(p.status);
  if (p.deleted === true || /complete|closed|cancel|lost|bidding|estimate|lead|hold|archiv|warranty/.test(st)) return false;
  return /active|progress|started|underway|production|approved|scheduled/.test(st) || (num(p.pct) > 0 && num(p.pct) < 100);
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/* ── the facts for one job this week ── */
function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }
function dayOf(v){ const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
function shared(r){ return r.shared === true || (r.shared == null && s(r.tag) !== 'Damage'); }
function factsFor(p, d, now, prevPct){
  const pid = s(p.id), since = new Date(now - 7 * DAY).toISOString().slice(0, 10), today = new Date(now).toISOString().slice(0, 10), nextEnd = new Date(now + 9 * DAY).toISOString().slice(0, 10);
  const photos = arr(d.gc_photos).filter(function(r){ return r.deleted !== true && r.source !== 'ccflag' && s(r.jobId) === pid && shared(r) && dayOf(r.at) >= since && /^sb:crm-files\//.test(s(r.annotatedRef || r.ref)); });
  const seen = {}, uniq = photos.filter(function(r){ const k = s(r.hash) || s(r.ref); if (seen[k]) return false; seen[k] = 1; return true; })
    .sort(function(a, b){ return s(a.at) < s(b.at) ? -1 : 1; });
  /* 3–6 to show: spread over the week, the "after"/"progress" tags first */
  const ranked = uniq.slice().sort(function(a, b){ return (/damage|before/i.test(s(a.tag)) ? 1 : 0) - (/damage|before/i.test(s(b.tag)) ? 1 : 0); });
  const step = Math.max(1, Math.floor(ranked.length / 6));
  const pick = []; for (let i = 0; i < ranked.length && pick.length < 6; i += step) pick.push(ranked[i]);
  const sched = arr(d.schedule).filter(function(x){ return pidOf(x) === pid && x.deleted !== true; });
  const doneWeek = sched.filter(function(x){ const end = dayOf(x.endDateSch || x.endDate || x.date); return end >= since && end <= today && !/cancel/i.test(s(x.status)); });
  const next = sched.filter(function(x){ const st = dayOf(x.date); return st > today && st <= nextEnd && !/cancel/i.test(s(x.status)); })
    .sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : 1; });
  const logs = arr(d.logs).filter(function(x){ return pidOf(x) === pid && dayOf(x.date) >= since && dayOf(x.date) <= today && x.deleted !== true; })
    .sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : 1; });
  const updates = arr(p.updates).filter(function(u){ return dayOf(u.at) >= since; });
  const pct = num(p.pct);
  return {
    job: s(p.name), customer: first(p.client), pm: s(p.pm),
    pct: pct, pctChange: pct != null && prevPct != null ? Math.round(pct - prevPct) : null,
    photoCount: uniq.length, photos: pick.map(function(r){ return { ref: s(r.annotatedRef || r.ref), name: clip(r.tag || 'photo', 40) + '.jpg', type: 'image/jpeg' }; }),
    doneThisWeek: doneWeek.map(function(x){ return clip(x.title || x.type || 'work', 80) + ' (' + dayOf(x.endDateSch || x.date) + ')'; }).slice(0, 8),
    nextSteps: next.map(function(x){ return clip(x.title || x.type || 'work', 80) + ' — ' + dayOf(x.date); }).slice(0, 6),
    dailyLogs: logs.map(function(x){ return dayOf(x.date) + ': ' + clip(x.work, 220) + (s(x.weather) && !/clear/i.test(x.weather) ? ' (weather: ' + s(x.weather) + ')' : ''); }).slice(0, 7),
    pmNotes: updates.map(function(u){ return clip(u.text, 200); }).slice(0, 4)
  };
}
function hasNews(f){ return f.photoCount > 0 || f.doneThisWeek.length > 0 || f.dailyLogs.length > 0 || f.pmNotes.length > 0 || (f.pctChange != null && f.pctChange !== 0); }

const TOOL = { name: 'weekly_update', description: 'The friendly weekly progress update for the customer.',
  input_schema: { type: 'object', properties: { summary: { type: 'string', description: '3-5 warm, plain sentences about this week' }, next_steps: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'next_steps'] } };
async function writeUp(f){
  if (AI.ready()) {
    const r = await AI.ask({ tool: TOOL, maxTokens: 1200, content: [{ type: 'text', text:
      'You write the Friday progress update a residential/commercial contractor (GrayCo Construction Services, Memphis) sends a customer. ' +
      'Use ONLY the facts below — never invent work, dates, prices or problems; leave out anything internal (pay, costs, sub names, blame, insurance details). ' +
      'Friendly and plain, first person plural ("we"), no greeting and no sign-off (they are added), no emojis. Call the weekly_update tool once: ' +
      'summary = 3 to 5 sentences about this week; next_steps = up to 4 short items for next week (from the schedule; empty if none).\n\nFacts (JSON):\n' + JSON.stringify(Object.assign({}, f, { photos: undefined })) }] });
    const o = r.ok && r.out;
    if (o && s(o.summary)) return { summary: clip(o.summary, 1200), next: (Array.isArray(o.next_steps) ? o.next_steps : []).filter(function(x){ return typeof x === 'string' && s(x); }).map(function(x){ return clip(x, 140); }).slice(0, 4), ai: true };
  }
  const bits = [];
  if (f.doneThisWeek.length) bits.push('This week we finished ' + f.doneThisWeek.map(function(x){ return x.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, ''); }).join(', ') + '.');
  else if (f.dailyLogs.length) bits.push('Our crew was on site ' + f.dailyLogs.length + ' day' + (f.dailyLogs.length === 1 ? '' : 's') + ' this week.');
  if (f.pct != null) bits.push('Your project is about ' + Math.round(f.pct) + '% complete' + (f.pctChange ? ' (up ' + f.pctChange + '% this week)' : '') + '.');
  if (f.photoCount) bits.push('We added ' + f.photoCount + ' new photo' + (f.photoCount === 1 ? '' : 's') + ' to your project page.');
  return { summary: bits.join(' ') || 'Here is where your project stands this week.', next: f.nextSteps.slice(0, 4), ai: false };
}
/* the body only: the approval's send (portal.js aqSend) wraps it in the GrayCo shell (_lib/brand.js: logo, the PM's
   signature, the office line and the licenses) */
function mailHtml(f, w, link){
  return '<p style="margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:.06em;color:#D4A017">YOUR WEEKLY UPDATE · ' + esc(f.job) + '</p>' +
    '<p>Hi ' + esc(f.customer || 'there') + ',</p>' +
    '<p>' + esc(w.summary) + '</p>' +
    (f.pct != null ? '<p><b>' + Math.round(f.pct) + '% complete</b>' + (f.photoCount ? ' · ' + f.photoCount + ' new photo' + (f.photoCount === 1 ? '' : 's') + ' on your project page' : '') + '</p>' : '') +
    (w.next.length ? '<p style="margin-bottom:4px"><b>Coming up next</b></p><ul style="margin-top:0">' + w.next.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
    '<p style="margin:20px 0"><a href="' + link + '" style="display:inline-block;background:#0F1D2F;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">See the photos on my GrayCo project page</a></p>';
}
function postText(f, w){
  return w.summary + (w.next.length ? '\n\nComing up next:\n' + w.next.map(function(x){ return '• ' + x; }).join('\n') : '');
}

/* ── one run ── */
async function run(opts){
  opts = opts || {};
  const C = portal._core, now = opts.now || Date.now();
  const friday = central(new Date(now)).ymd;
  const d = await C.kvRead(['projects', 'users', 'schedule', 'logs', 'gc_photos', 'jobAutoDefaults', 'gc_deleted_projects', 'customers']);
  const defs = obj(d.jobAutoDefaults);
  const del = (Array.isArray(d.gc_deleted_projects) ? d.gc_deleted_projects : arr(d.gc_deleted_projects)).map(String);
  const settings = await C.settingsGet();
  const qNow = await C.kvListRead(C.AQ_KEY);
  const queue = qNow ? qNow.list : [];
  const rep = { ok: true, friday: friday, queued: 0, skipped: [], details: [] };
  for (const p of arr(d.projects)) {
    const pid = s(p.id);
    if (!pid || del.indexOf(pid) >= 0) continue;
    if (opts.projectId && pid !== s(opts.projectId)) continue;
    if (!isActive(p)) continue;
    const why = function(w){ rep.skipped.push({ project: pid, why: w }); };
    if (!sw(p, 'weeklyUpdate', defs, true)) { why('weekly update switched off'); continue; }
    if (sw(p, 'portalLink', defs, true) === false) { why('portal switched off'); continue; }
    let row = null; try { row = await C.activeFor(pid); } catch (e) { row = null; }
    if (!row) { why('no active portal link'); continue; }
    const qid = 'appr_weekly_' + pid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) + '_' + friday;
    if (queue.some(function(x){ return s(x.id) === qid; })) { why('already drafted this week'); continue; }
    const prev = queue.filter(function(x){ return x && x.kind === 'weekly_update' && s(x.jobId) === pid && (x.meta || {}).pct != null; }).sort(function(a, b){ return s(a.createdAt) < s(b.createdAt) ? 1 : -1; })[0];
    const f = factsFor(p, d, now, prev ? num(prev.meta.pct) : null);
    if (!hasNews(f)) { why('nothing new this week'); continue; }
    const w = await writeUp(f);
    const cust = arr(d.customers).find(function(c){ return low(c.name || c.company) === low(p.client); }) || {};
    const email = s(p.clientEmail || p.customerEmail || cust.email), phone = s(p.clientPhone || p.customerPhone || cust.phone);
    const wantMail = sw(p, 'weeklyEmail', defs, true) && sw(p, 'progressPosts', defs, true) && EMAIL_RE.test(email);
    const wantText = sw(p, 'weeklyText', defs, false) && settings.text === true && /\d{7,}/.test(phone.replace(/\D/g, ''));
    const pmU = await C.pmByName(p.pm);
    const text = postText(f, w);
    const ok = await C.queueApproval({ id: qid, kind: 'weekly_update', pid: pid, jobName: p.name, pm: pmU, to: wantMail ? email : 'Customer portal — ' + (s(p.client) || 'customer'),
      channel: wantMail ? 'email' : 'portal', title: '📰 Weekly update — ' + s(p.name), subject: 'Your weekly update — ' + clip(p.name, 80),
      html: mailHtml(f, w, C.LINK_PH), attachments: f.photos.map(function(x){ return { name: x.name, kind: 'portal' }; }),
      meta: { postText: text, photos: f.photos, pct: f.pct, photoCount: f.photoCount, week: friday, ai: w.ai, by: s(p.pm) || 'GrayCo',
        sms: wantText ? { to: phone, text: 'GrayCo weekly update for ' + clip(p.name, 60) + ': ' + clip(w.summary, 300) + ' See photos: ' + C.LINK_PH } : null } });
    if (ok) { rep.queued++; rep.details.push({ project: pid, id: qid, channel: wantMail ? 'email' : 'portal', text: wantText, photos: f.photoCount, ai: w.ai }); }
    else why('could not write the approvals list');
  }
  return rep;
}

exports.handler = async function (event) {
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const b = scheduledBody(event);
  const sched = !!b.next_run;
  if (!sched && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  if (sched && !isRunTime(new Date())) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, notNow: true }) };
  if (!sched && !b.force && !b.projectId && !isRunTime(new Date())) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, notNow: true, hint: 'send { "force": true } to draft now' }) };
  try {
    const rep = await run({ projectId: s(b.projectId) });
    try { console.log('[weekly-update]', JSON.stringify({ queued: rep.queued, skipped: rep.skipped.length })); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(rep) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Could not draft the weekly updates: ' + (e && e.message || e) }) };
  }
};
exports._test = { run: run, isRunTime: isRunTime, central: central, factsFor: factsFor, hasNews: hasNews, writeUp: writeUp, isActive: isActive, sw: sw };
