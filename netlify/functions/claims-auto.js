// netlify/functions/claims-auto.js — patch AUTOCLAIMS: the claim & field automations that run on a clock
// (netlify.toml: every hour at :23; each part runs once a day at its hour, with its own once-marks in gc_kv "gc_claims_auto").
//
//   • 7 AM Central — 🔎 PERMITS & INSPECTIONS (Site Book "Codes & permits" + the job inspections list):
//       – an inspection TOMORROW → the job's PM gets one e-mail + phone push (once per inspection and date);
//       – an inspection whose date PASSED with no answer → "Passed / Failed / Rescheduled?" push + e-mail to the PM
//         (once per inspection and date; the CRM asks again on the To-Do until it is answered);
//       – a FAILED inspection with no re-inspection booked → a To-Do for the PM "🔧 Fix + reschedule" (gc_office_tasks,
//         the same id the CRM uses when the PM answers Failed there, so there is never a second one).
//   • 7 AM Central — 💧 DRYING: a drying job (equipment on site, drying not complete) that missed a day of readings →
//     the PM / mitigation tech get one push + e-mail (once a day). The daily "Take moisture readings + photos (Day N)"
//     is on the To-Do in the CRM and in the 2 AM "Today's plan" (the morning digest, plan.js).
//   • 9 AM Central (Mon–Fri) — 🛡 CLAIM NUDGES: a claim with no adjuster reply / status change for N days (the
//     Insurance "Nudge the adjuster after" setting, default 5) → a polite follow-up to the adjuster is DRAFTED into
//     ✅ Approvals (kind claim_nudge, the PM approves). Never sent by itself; one waiting draft per claim; a draft
//     (sent or not) restarts the N days. Never in data-entry mode.
// Netlify does not let anyone call a scheduled function by its URL in production; any other call must be an admin
// ({ run: 'inspections' | 'drying' | 'nudges', force: true }). CLAIMS_AUTO_OFF=1 stops all of it.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const AC = require('./_lib/auto-claims.js');
function P(){ return require('./portal.js')._core; }
const STATE = 'gc_claims_auto';
const TZ = 'America/Chicago';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return AC.arr(v); }
function esc(v){ return AC.esc(v); }
function okEmail(e){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(e)); }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function site(){ return (process.env.CRM_URL || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function central(d){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
  return { wd: o.weekday, hour: parseInt(o.hour, 10) % 24, ymd: o.year + '-' + o.month + '-' + o.day };
}

/* the deps a test can swap */
const D = {
  now: function(){ return Date.now(); },
  crm: function(){ return P().crmData(true); },
  kv: function(keys){ return P().kvRead(keys); },
  listRead: function(key){ return P().kvListRead(key); },
  listUpdate: function(key, fn){ return P().kvListUpdate(key, fn); },
  queue: function(o){ return P().queueApproval(o); },
  aqKey: function(){ return P().AQ_KEY; },
  findProject: function(data, id){ return P().findProject(data, id); },
  pmOf: function(data, p){ return P().pmOf(data, p); },
  admins: function(data){ try { return P().adminEmails(data || {}); } catch (e) { return []; } },
  push: function(emails, p){ return P().pushTo(emails, p).catch(function(){ return { sent: 0 }; }); },
  paused: async function(){ try { const v = (await P().kvRead(['gc_automation_pause'])).gc_automation_pause; return !!(v && (v.on === true || (typeof v === 'string' && /"on"\s*:\s*true/.test(v)))); } catch (e) { return true; } },
  mail: async function(o){
    const key = s(process.env.RESEND_API_KEY); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
    try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(o) }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, why: 'no answer' }; }
  }
};
function frame(head, body){
  return '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(head) + '</div><div style="padding:6px 18px 18px">' + body + '</div></div>';
}
function btn(href, label){ return '<p><a href="' + esc(href) + '" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">' + esc(label) + '</a></p>'; }
async function staffMail(to, subject, html, hint){
  to = (to || []).map(low).filter(okEmail);
  if (!to.length) return { ok: false, why: 'no address' };
  return D.mail({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: require('./_lib/mailtag.js').tag(subject, to, hint), html: html, headers: { 'X-GrayCo-CRM': 'claims-auto' } });
}

/* ── once-marks (claimed first: two runs at once never both act) ── */
async function stateUpdate(fn){
  return D.listUpdate(STATE, function(l){
    const st = l.find(function(x){ return x.id === 'state'; }) || { id: 'state' };
    const before = JSON.stringify(st); const r = fn(st);
    if (r === false || JSON.stringify(st) === before) return null;
    st.updatedAt = new Date(D.now()).toISOString();
    return { list: l.filter(function(x){ return x.id !== 'state'; }).concat([st]), check: function(a){ return a.some(function(x){ return x.id === 'state' && x.updatedAt === st.updatedAt; }); } };
  });
}
async function claimOnce(k){
  let mine = false; const cut = new Date(D.now() - 120 * 864e5).toISOString();
  const r = await stateUpdate(function(st){ st.done = st.done || {}; if (st.done[k]) return false; Object.keys(st.done).forEach(function(x){ if (s(st.done[x]) < cut) delete st.done[x]; }); st.done[k] = new Date(D.now()).toISOString(); mine = true; });
  return mine && r && r.ok !== false;
}
async function unclaim(k){ await stateUpdate(function(st){ if (!st.done || !st.done[k]) return false; delete st.done[k]; }); }

function pmFor(data, p){ const u = p ? D.pmOf(data, p) : null; return u && okEmail(u.email) ? u : null; }
function peopleFor(data, p, extraNames){
  const out = {}, users = arr(data.users), add = function(e){ e = low(e); if (okEmail(e)) out[e] = 1; };
  const pm = pmFor(data, p); if (pm) add(pm.email);
  (Array.isArray(extraNames) ? extraNames : []).forEach(function(n){ const u = users.find(function(x){ return low(x.name) === low(n) || low(x.email) === low(n); }); if (u && u.active !== false) add(u.email); });
  if (!Object.keys(out).length) D.admins(data).forEach(add);
  return Object.keys(out);
}

/* ── 🔎 permits & inspections ── */
async function runInspections(o){
  o = o || {}; const now = D.now(), c = central(new Date(now));
  if (!o.force && c.hour !== 7) return { notNow: true };
  const data = await D.crm(), more = await D.kv(['gc_sitebook', 'gc_job_inspections']);
  const P0 = {}; arr(data.projects).forEach(function(p){ if (p && p.id) P0[s(p.id)] = p; });
  const list = AC.inspections({ sitebook: more.gc_sitebook, jobInspections: more.gc_job_inspections });
  const act = AC.inspActions(list, c.ymd), rep = { remind: 0, ask: 0, fix: 0, skipped: [] };
  const live = function(i){ const p = P0[i.pid]; return p && !(p.importedHistory === true || p.historyOnly === true) ? p : null; };
  for (const i of act.remind) {
    const p = live(i); if (!p || AC.jobClosed(p)) continue;
    const k = 'insp-remind|' + i.key + '|' + i.date; if (!(await claimOnce(k))) continue;
    const to = peopleFor(data, p), when = AC.niceDay(i.date) + (i.time ? ' ' + i.time : '');
    const r = await staffMail(to, '🔎 Tomorrow: ' + i.type + ' inspection — ' + s(p.name), frame('GrayCo — inspection tomorrow', '<p><b>' + esc(p.name) + '</b>' + (p.address ? ' · ' + esc(p.address) : '') + '</p><p>The <b>' + esc(i.type) + '</b> inspection is <b>' + esc(when) + '</b>.</p><p>Make sure the work is ready, the permit card is posted and someone can let the inspector in.</p>' + btn(site() + '/#sitebook', 'Open the Site Book')), 'area:Schedule');
    await D.push(to, { title: '🔎 Inspection tomorrow', body: AC.clip(i.type + ' — ' + p.name, 150), tag: 'insp-' + i.key });
    if (!r.ok && r.why !== 'RESEND_API_KEY is not set') { await unclaim(k); continue; }
    rep.remind++;
  }
  for (const i of act.ask) {
    const p = live(i); if (!p) continue;
    const k = 'insp-ask|' + i.key + '|' + i.date; if (!(await claimOnce(k))) continue;
    const to = peopleFor(data, p);
    const r = await staffMail(to, '🔎 Did it pass? ' + i.type + ' inspection — ' + s(p.name), frame('GrayCo — how did the inspection go?', '<p><b>' + esc(p.name) + '</b>: the <b>' + esc(i.type) + '</b> inspection was ' + esc(AC.niceDay(i.date)) + '.</p><p>Answer <b>Passed / Failed / Rescheduled</b> in the CRM (To-Do, or Site Book → Codes & permits). A fail gets a to-do to fix it and book the re-inspection.</p>' + btn(site() + '/#todo', 'Answer in the To-Do')), 'area:Schedule');
    await D.push(to, { title: '🔎 Passed / Failed / Rescheduled?', body: AC.clip(i.type + ' inspection — ' + p.name + ' (' + AC.niceDay(i.date) + ')', 150), tag: 'inspask-' + i.key });
    if (!r.ok && r.why !== 'RESEND_API_KEY is not set') { await unclaim(k); continue; }
    rep.ask++;
  }
  if (act.fix.length) {
    const add = [];
    act.fix.forEach(function(i){ const p = live(i); if (!p) return; const pm = pmFor(data, p); add.push(AC.fixTodo(i, p, pm && pm.email, c.ymd)); });
    if (add.length) {
      const at = new Date(now).toISOString(); let made = 0;
      const r = await D.listUpdate('gc_office_tasks', function(l){
        const have = {}; l.forEach(function(t){ if (t && t.id) have[s(t.id)] = 1; });
        const fresh = add.filter(function(t){ return !have[t.id]; }).map(function(t){ return Object.assign({}, t, { addedAt: at, updatedAt: at }); });
        made = fresh.length; if (!fresh.length) return null;
        return { list: l.concat(fresh), check: function(a){ return fresh.every(function(t){ return a.some(function(x){ return x && x.id === t.id; }); }); } };
      });
      if (r && r.ok !== false) rep.fix += made;
    }
  }
  return rep;
}

/* ── 💧 drying: a missed day → the PM / mitigation tech, once a day ── */
async function runDrying(o){
  o = o || {}; const now = D.now(), c = central(new Date(now));
  if (!o.force && c.hour !== 7) return { notNow: true };
  const data = await D.crm(), rep = { active: 0, missed: 0, told: 0 };
  const P0 = {}; arr(data.projects).forEach(function(p){ if (p && p.id) P0[s(p.id)] = p; });
  for (const cl of arr(data.gc_claims)) {
    const d = AC.dryingOf(cl, c.ymd); if (!d) continue;
    rep.active++;
    if (d.missed.indexOf(AC.addDays(c.ymd, -1)) < 0) continue;   /* only a day missed YESTERDAY is news (older ones are on the job and in the digest) */
    rep.missed++;
    const p = P0[d.pid] || {}, k = 'dry-missed|' + d.claimId + '|' + c.ymd; if (!(await claimOnce(k))) continue;
    const to = peopleFor(data, p, AC.dryingWho(cl, p));
    await staffMail(to, '💧 No drying readings yesterday — ' + s(p.name || cl.insured), frame('GrayCo — drying log missed', '<p><b>' + esc(p.name || cl.insured) + '</b> (Day ' + d.day + ' of drying, ' + d.onsite + ' piece' + (d.onsite === 1 ? '' : 's') + ' of equipment on site).</p><p>' + esc(AC.missedText(d)) + '.</p><p>Take today\'s moisture readings and photos; if yesterday\'s were taken, add them with yesterday\'s date.</p>' + btn(site() + '/#mitigation', 'Open the drying log')), 'area:Insurance');
    await D.push(to, { title: '💧 Drying readings missed', body: AC.clip((p.name || cl.insured) + ' — Day ' + d.day + ': no readings ' + AC.niceDay(AC.addDays(c.ymd, -1)), 150), tag: 'dry-' + d.claimId });
    rep.told++;
  }
  return rep;
}

/* ── 🛡 claim nudges → ✅ Approvals (never sent by themselves) ── */
async function runNudges(o){
  o = o || {}; const now = D.now(), c = central(new Date(now));
  if (!o.force && (c.hour !== 9 || /Sat|Sun/.test(c.wd))) return { notNow: true };
  if (await D.paused()) return { paused: true };   /* data-entry mode: nothing is queued */
  const data = await D.crm(), more = await D.kv(['gc_integration_settings']);
  const st = AC.obj(more.gc_integration_settings), days = Math.max(1, AC.num((st.ins4 || {}).nudgeDays) || AC.num(process.env.CLAIM_NUDGE_DAYS) || 5);
  const q = await D.listRead(D.aqKey()), queue = arr(q && q.list);
  const rep = { days: days, queued: 0, waiting: 0, skipped: [] };
  for (const cl of arr(data.gc_claims)) {
    if (!cl || cl.deleted || !cl.id) continue;
    const mine = queue.filter(function(x){ return x.kind === 'claim_nudge' && s((x.meta || {}).claimId) === s(cl.id); });
    if (mine.some(function(x){ return /^(waiting|sending)$/.test(s(x.status)); })) { rep.waiting++; continue; }
    const lastNudge = mine.map(function(x){ return s(x.sentAt || x.rejectedAt || x.createdAt); }).filter(Boolean).sort().pop() || '';
    const due = AC.nudgeDue(cl, now, { days: days, lastNudge: lastNudge });
    if (!due.due) { if (!/^quiet/.test(s(due.why))) rep.skipped.push({ claim: cl.id, why: due.why }); continue; }
    const p = D.findProject(data, cl.projectId) || {};
    if (p.importedHistory === true || p.noSend === true || p.historyOnly === true) { rep.skipped.push({ claim: cl.id, why: 'history job' }); continue; }
    const pm = pmFor(data, p), dr = AC.nudgeDraft(cl, p, pm, { days: due.days });
    const qid = 'appr_cnudge_' + s(cl.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) + '_' + c.ymd.replace(/-/g, '');
    const k = 'nudge|' + cl.id + '|' + c.ymd; if (!(await claimOnce(k))) continue;
    const ok = await D.queue({ id: qid, kind: 'claim_nudge', pid: s(p.id || cl.projectId), jobName: s(p.name || cl.insured), pm: pm ? { name: pm.name, email: pm.email } : null,
      to: dr.to, channel: 'email', title: '🛡 Adjuster follow-up — ' + AC.clip(p.name || cl.insured || ('claim ' + s(cl.claimNumber)), 80), subject: dr.subject, html: dr.html,
      meta: { claimId: s(cl.id), claimNumber: s(cl.claimNumber), days: due.days, since: due.since, note: 'No adjuster reply or status change for ' + due.days + ' days. Drafted automatically — nothing is sent until you approve. Edit it, or Don\'t send.' } });
    if (!ok) { await unclaim(k); continue; }
    rep.queued++;
  }
  return rep;
}

async function isAdmin(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim()); if (!m) return false;
  try {
    const C = P(); const r = await fetch(C.sbUrl() + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON, Authorization: 'Bearer ' + m[1] } }); if (!r.ok) return false;
    const email = low((await r.json()).email); if (!email) return false;
    const q = await fetch(C.sbUrl() + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: C.keyHeaders(C.svcKey()) });
    const row = q.ok ? ((await q.json()) || [])[0] : null;
    return !!(row && row.active !== false && low(row.role) === 'admin');
  } catch (e) { return false; }
}
const RUNS = { inspections: runInspections, drying: runDrying, nudges: runNudges };
async function runAll(o){
  const out = {};
  for (const k of Object.keys(RUNS)) { if (o.run && o.run !== k) continue; try { out[k] = await RUNS[k](o); } catch (e) { out[k] = { error: s(e && e.message || e) }; } }
  return out;
}
exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) {}
  const sched = !!b.next_run;
  if (s(process.env.CLAIMS_AUTO_OFF) === '1') return { statusCode: 200, headers, body: JSON.stringify({ ok: true, off: true }) };
  if (!sched && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!P().svcKey()) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  const rep = await runAll(sched ? {} : { run: s(b.run), force: b.force === true });
  try { console.log('[claims-auto]', JSON.stringify(rep).slice(0, 600)); } catch (e) {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: rep }) };
};
exports._test = { D: D, central: central, runInspections: runInspections, runDrying: runDrying, runNudges: runNudges, runAll: runAll, STATE: STATE };
