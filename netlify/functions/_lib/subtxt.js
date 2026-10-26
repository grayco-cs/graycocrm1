// netlify/functions/_lib/subtxt.js — patch SUBTXT: schedule confirmations by text for subs.
// Owner 10/24: "when we send notifications to sub portal they are scheduled for job at 8am etc and they have to cancel or
// tell us their car broke down whatever — let them text back our text message, but also let them message that in their
// portal. I want text messages turned on or off for a sub, to know if they are at job or not, auto text message,
// anything other than Y → notification to the PM with what they say."
//
//   Settings (server-only store, gc_lead_inbox_kv "gc_sub_texts"): { subs: { <subId>: { on, phone, by, at } } }
//     Off for every sub until someone on the staff turns it on for that sub — that switch is the approval for these
//     operational texts (they carry no prices and nothing about customers).
//   State (gc_lead_inbox_kv "gc_sub_confirm"): { rows: { <rowId>|<day>: { subId, sub, pid, job, title, day, start,
//     phone, eveAt, mornAt, status: 'sent'|'confirmed'|'issue', confirmedAt, issueAt, reply, noReplyAt } } }
//   Texts (Central time; sub-texts-scheduled.js every 15 minutes):
//     · 6 PM the evening before a sub's FIRST day of a schedule row: "you're scheduled at <address> tomorrow <time>…"
//     · about an hour before the start time on EVERY scheduled day: "Are you on your way / at the job? Reply Y."
//     · no reply by the start time → the job's PM (phone push + 🔴 ASAP To-Do + e-mail, office copied), once.
//   Never: a tentative row, a cancelled row, a job that is not signed / active, an opted-out number (STOP), while
//   ⏸ Data-entry mode is on, or 8 PM–7 AM (the morning check may go before 7 AM — it is about that morning).
//   Replies (missed-call.js?event=sms → handleReply): Y / yes / 👍 → ✓ Confirmed. Anything else → the PM at once.
//   The sub portal's "Can't make it / running late" (portal-access.js p-late) → the same PM alert.
'use strict';
const SETTINGS_KEY = 'gc_sub_texts', STATE_KEY = 'gc_sub_confirm', TZ = 'America/Chicago';
const DEFAULT_START = '08:00', MORNING_LEAD_MIN = 60, WINDOW_MIN = 20, REPLY_HOURS = 36, KEEP_DAYS = 10;
const YES = /^\s*(y|ye|yes|yep|yup|yeah|ya|ok|okay|k|confirm(ed)?|on my way|omw|here|i'?m here|at (the )?job|👍|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿|✅|✔️?)\s*[.!]*\s*$/i;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function ymd(v){ const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
function addDays(d, n){ const t = new Date(ymd(d) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* Central wall clock for a moment: { ymd, min (minutes since midnight), wd } */
function central(ms){
  const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    .formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
  return { ymd: o.year + '-' + o.month + '-' + o.day, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10), wd: o.weekday };
}
/* "8", "8am", "8:30 AM", "08:00", "13:15", "7.30" → minutes since midnight (null when unreadable) */
function parseTime(t){
  t = low(t).replace(/\s+/g, ''); if (!t) return null;
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(a|am|p|pm)?$/.exec(t); if (!m) return null;
  let h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || mi > 59) return null;
  if (m[3] && /p/.test(m[3]) && h < 12) h += 12;
  if (m[3] && /a/.test(m[3]) && h === 12) h = 0;
  if (!m[3] && h >= 1 && h <= 5) h += 12;   /* "3" on a work schedule is 3 PM */
  return h * 60 + mi;
}
function hhmm(min){ const h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12; return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ap; }
function dayWord(d){ try { return new Date(ymd(d) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } }

function settings(v){
  const o = v && typeof v === 'object' ? v : {};
  const subs = {};
  Object.keys(o.subs && typeof o.subs === 'object' ? o.subs : {}).forEach(id => {
    const x = o.subs[id] || {}; if (!/^[A-Za-z0-9_.:-]{1,90}$/.test(id)) return;
    subs[id] = { on: x.on === true, phone: phone10(x.phone).length === 10 ? phone10(x.phone) : '', by: s(x.by).slice(0, 120), at: s(x.at).slice(0, 40) };
  });
  return { subs };
}
function loadState(v){
  const st = v && typeof v === 'object' ? v : {};
  const rows = st.rows && typeof st.rows === 'object' ? st.rows : {};
  return { rows };
}
function prune(st, nowMs){
  const cut = central(nowMs - KEEP_DAYS * 86400000).ymd;
  Object.keys(st.rows).forEach(k => { if (s(st.rows[k] && st.rows[k].day) < cut) delete st.rows[k]; });
  return st;
}

/* the same sub? (schedule rows name a sub by id, or by company / contact name) */
function sameSub(name, sub){
  const n = low(name); if (!n || !sub) return false;
  return [sub.company, sub.name, sub.contact].map(low).filter(Boolean).some(x => x === n || (x.length > 4 && (n.indexOf(x) >= 0 || x.indexOf(n) >= 0)));
}
function subOfRow(x, subs){
  const id = s(x.subId);
  if (id) { const hit = subs.find(sb => s(sb.id) === id); if (hit) return hit; }
  const nm = s(x.vendor || x.sub || x.subName || x.assignee);
  return nm ? subs.find(sb => sameSub(nm, sb)) || null : null;
}
function subPhone(sub, set){ const c = set.subs[s(sub && sub.id)] || {}; const p = phone10(c.phone || (sub && (sub.cell || sub.mobile || sub.phone || (sub.contact && sub.contact.phone)))); return p.length === 10 ? p : ''; }
function rowKey(x){ return s(x.id) || ('r' + require('crypto').createHash('sha1').update([s(x.pid), ymd(x.date), s(x.title), s(x.vendor || x.sub || x.subName || x.assignee)].join('|')).digest('hex').slice(0, 16)); }
function pidOf(x){ return s(x && (x.pid || x.projectId || x.jobId)); }

/* signed and active: work may happen on this job (PM3's contract gate; tentative / bidding jobs never get texts) */
function jobSigned(p){
  if (!p || p.deleted === true) return false;
  if (/complete|closed|lost|cancel|dead|archived/i.test(s(p.status))) return false;
  if (/bid|lead|estimate|proposal|tentative|pending|prospect/i.test(s(p.status))) return false;
  if (p.contractSigned === false && !(p.signOverride || p.contractOverride)) return false;
  return true;
}
function rowLive(x){ return x && !x.deleted && x.tentative !== true && !/tentative|cancel|done|complete/i.test(s(x.status)); }

/* what is due now: [{ kind: 'evening'|'morning'|'noreply', key, rec, text? }] — pure, so the tests can drive it */
function due(data, set, st, nowMs){
  const out = [], c = central(nowMs), today = c.ymd, tomorrow = addDays(today, 1);
  const subs = arr(data.subs).concat(arr(data.vendors));
  const jobs = {}; arr(data.projects).forEach(p => { if (p.id) jobs[s(p.id)] = p; });
  const dead = {}; arr(data.gc_deleted_projects).forEach(x => { dead[s(x.id || x)] = 1; });
  arr(data.schedule).filter(rowLive).forEach(x => {
    const pid = pidOf(x), p = jobs[pid]; if (!p || dead[pid] || !jobSigned(p)) return;
    const sub = subOfRow(x, subs); if (!sub) return;
    const cfg = set.subs[s(sub.id)]; if (!cfg || !cfg.on) return;
    const phone = subPhone(sub, set); if (!phone) return;
    const first = ymd(x.date), last = ymd(x.endDateSch || x.endDate || x.date) || first; if (!first) return;
    const start = parseTime(x.time); const startMin = start == null ? parseTime(DEFAULT_START) : start;
    const base = { subId: s(sub.id), sub: s(sub.company || sub.name), pid, job: s(p.name), address: s(p.address || p.jobAddress).split(',')[0], title: clip(s(x.title || x.type || 'work'), 80), phone, start: startMin, pm: s(p.pm || p.projectManager) };
    /* evening before the FIRST day (6 PM hour) */
    if (first === tomorrow && c.min >= 18 * 60 && c.min < 19 * 60) {
      const key = rowKey(x) + '|' + first, rec = st.rows[key] || {};
      if (!rec.eveAt) out.push({ kind: 'evening', key, rec: Object.assign({}, base, { day: first }),
        text: 'GrayCo: you\'re scheduled at ' + (base.address || base.job) + ' tomorrow ' + hhmm(startMin) + ' for ' + base.title + '. Reply Y to confirm, or text us if anything changes. Reply STOP to opt out.' });   /* patch LEGAL3: STOP wording on every schedule text */
    }
    /* every scheduled day: the morning check about an hour before the start, then the no-reply alert at the start */
    if (today >= first && today <= last) {
      const key = rowKey(x) + '|' + today, rec = st.rows[key] || {};
      const sendAt = startMin - MORNING_LEAD_MIN;
      if (!rec.mornAt && rec.status !== 'confirmed' && rec.status !== 'issue' && c.min >= sendAt && c.min < startMin)
        out.push({ kind: 'morning', key, rec: Object.assign({}, base, { day: today }),
          text: 'GrayCo: ' + (base.address || base.job) + ' today at ' + hhmm(startMin) + '. Are you on your way / at the job? Reply Y. Reply STOP to opt out.' });   /* patch LEGAL3 */
      if ((rec.mornAt || rec.eveAt) && rec.status === 'sent' && !rec.noReplyAt && c.min >= startMin && c.min < startMin + 120)
        out.push({ kind: 'noreply', key, rec: Object.assign({}, base, rec, { day: today }) });
    }
  });
  return out;
}
/* evening texts wait for 7 AM–8 PM; the morning check may go earlier (it is about that morning) */
function quietOk(kind, nowMs){ const m = central(nowMs).min; return kind === 'morning' || (m >= 7 * 60 && m < 20 * 60); }
function isYes(t){ return YES.test(s(t)); }
/* the open confirmation this number is answering (a text sent in the last 36 hours), newest first */
function openFor(st, ph, nowMs){
  const cut = nowMs - REPLY_HOURS * 3600000;
  return Object.keys(st.rows).map(k => Object.assign({ key: k }, st.rows[k])).filter(r => r.phone === ph && [r.eveAt, r.mornAt].some(t => t && Date.parse(t) >= cut))
    .sort((a, b) => s(b.mornAt || b.eveAt).localeCompare(s(a.mornAt || a.eveAt)))[0] || null;
}

module.exports = { SETTINGS_KEY, STATE_KEY, DEFAULT_START, YES, s, low, arr, clip, phone10, tidy, ymd, esc, central, parseTime, hhmm, dayWord, settings, loadState, prune,
  sameSub, subOfRow, subPhone, rowKey, jobSigned, rowLive, due, quietOk, isYes, openFor };
