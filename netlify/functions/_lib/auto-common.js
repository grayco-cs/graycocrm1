/* netlify/functions/_lib/auto-common.js — shared bits of the owner's automation quick wins (patches AUTO-AR, AUTO-PAY,
   AUTO-LIEN, AUTO-DIGEST, AUTO-SCORE), run by netlify/functions/auto-wins.js every hour.
   Owner rule for all of them: nothing reaches a customer, sub or GC the first time without an approval, and
   ⏸ Data-entry mode pauses every outward step (it is checked before anything is queued or sent).
   once(id): a run claims a marker in gc_kv "gc_autowins_log" before it does a daily / weekly job, so two runs (or two
   function instances) can never do the same morning's job twice. */
'use strict';
const TZ = 'America/Chicago';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2(v){ return Math.round(num(v) * 100) / 100; }
function usd(v){ return '$' + r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function usd0(v){ return '$' + Math.round(num(v)).toLocaleString('en-US'); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function ymd(v){ const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); if (/^\d{10,13}$/.test(t)) { const d = new Date(t.length > 10 ? +t : +t * 1000); return isNaN(d) ? '' : d.toISOString().slice(0, 10); } const d = t ? new Date(t) : null; return d && !isNaN(d) ? d.toISOString().slice(0, 10) : ''; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function pidOf(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function staffEmail(e){ return okEmail(e) && /@([a-z0-9-]+\.)*grayco-cs\.com$/i.test(s(e)); }
function daysBetween(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
function addDays(day, n){ const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* the Central wall clock: { ymd, hour, wd: 'Mon'… } */
function central(now){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now == null ? Date.now() : now));
  const o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
  return { wd: o.weekday, hour: parseInt(o.hour, 10) % 24, ymd: o.year + '-' + o.month + '-' + o.day };
}
function core(){ return require('../portal.js')._core; }
function crmBase(){ return (s(process.env.CRM_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
async function paused(){ try { return !!(await require('./pause.js').isPaused()); } catch (e) { return true; } }   /* fail closed, like pause.js */
const LOG_KEY = 'gc_autowins_log';
/* claim a marker once (true = this run owns it) */
async function once(id){
  const C = core(), at = new Date().toISOString();
  const has = function(l){ return l.some(function(x){ return x && s(x.id) === id; }); };
  let mine = false;
  const r = await C.kvListUpdate(LOG_KEY, function(l){
    if (has(l)) return null;
    mine = true; const next = l.concat([{ id: id, at: at }]).slice(-300);
    return { list: next, check: function(l2){ const z = l2.find(function(x){ return x && s(x.id) === id; }); return !!(z && z.at === at); } };
  });
  return !!(r && r.ok && mine && !r.unchanged);
}
/* a personal to-do (or the shared office one when there is no e-mail), added once */
async function todo(id, label, opts){
  opts = opts || {};
  const C = core(), now = new Date().toISOString();
  const item = { id: s(id), label: s(label), note: s(opts.note), addedBy: s(opts.by) || 'CRM (automatic)', addedAt: now, updatedAt: now, done: false, prio: opts.prio || 'high' };
  if (opts.due) item.due = opts.due;
  if (opts.pid) item.go = { pid: s(opts.pid) };
  if (staffEmail(opts.email)) { item.assignees = [low(opts.email)]; item.assignee = s(opts.name); item.personal = true; item.shared = false; }
  const has = function(l){ return l.some(function(t){ return t && s(t.id) === item.id; }); };
  const r = await C.kvListUpdate('gc_office_tasks', function(l){ return has(l) ? null : { list: l.concat([item]), check: has }; });
  return !!(r && r.ok && !r.unchanged);
}
/* a staff-only e-mail (every address @grayco-cs.com — data-entry mode lets it through) */
async function staffMail(to, subject, html){
  to = (Array.isArray(to) ? to : [to]).map(low).filter(staffEmail);
  if (!to.length) return { ok: false, skipped: 'no staff address' };
  const key = s(process.env.RESEND_API_KEY);
  if (!key || s(process.env.PORTAL_MAIL_OFF) === '1') return { ok: false, skipped: 'e-mail is not set up' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: clip(subject, 200), html: html, headers: { 'X-GrayCo-CRM': 'auto-wins' } }) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: 'no answer' }; }
}
function shell(title, inner){
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#14202E">' +
    '<div style="background:#0F1D2F;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-size:17px;font-weight:bold">' + esc(title) + '</div>' +
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:16px 18px;border-radius:0 0 12px 12px;font-size:14px;line-height:1.5">' + inner + '</div></div>';
}
module.exports = { TZ, s, low, num, r2, usd, usd0, arr, ymd, esc, clip, pidOf, okEmail, staffEmail, daysBetween, addDays, central, core, crmBase, paused, once, todo, staffMail, shell, LOG_KEY };
