/* ============================================================================
   GrayCo — patch INSPECT2: inspections on every job, in every portal.   netlify/functions/_lib/inspect2.js

   Owner: "Make sure in portals or on all jobs we can schedule inspections."

   The ONE store is the CRM's per-job inspections list, gc_kv "gc_job_inspections" ({ pid: [ row, … ] }, the list the
   CRM's alert bar and the permit automation already use). A row (the CRM writes it; index.html patch INSPECT2):
     { id, label, date, done,                                   ← the old fields, still kept in step (3-day reminders)
       v2: 1, type: building|electrical|plumbing|mechanical|framing|final|lead|asbestos|mold|other, from: 'HH:MM', to: 'HH:MM',
       inspector, office, phone, notes, meet,                    ← INTERNAL: never in a portal
       status: scheduled|passed|failed|partial, result, resultNote, photos: [...], archived, trades: [...],
       history: [{ at, by, what: scheduled|rescheduled|result|archived, from: {date, from, to}, to: {…}, result, note }],
       reqId, createdAt, updatedAt }
   Nothing is ever deleted: a removed inspection is archived; a reschedule keeps the old date in history.

   What leaves for a portal (only these words; the job's portal switch p.portalInspections === false hides them all):
     customer → { date, window, type, result: 'Scheduled' | 'Passed' | 'Rescheduled' }   (no notes, inspector, phone, office, who)
     sub      → the job's inspections that touch the sub's trade (all of them when the sub has no trade): date, window, type,
                status — plus their own "Request an inspection" asks (portal-access p-insp-req → the job's PM's To-Do).
   ========================================================================== */
'use strict';
const KEY = 'gc_job_inspections';
const TYPES = [['building', 'Building'], ['electrical', 'Electrical'], ['plumbing', 'Plumbing'], ['mechanical', 'Mechanical'], ['framing', 'Framing'],
  ['final', 'Final'], ['lead', 'Lead clearance'], ['asbestos', 'Asbestos clearance'], ['mold', 'Mold clearance'], ['other', 'Other']];
const NAME = {}; TYPES.forEach(function(t){ NAME[t[0]] = t[1]; });
/* the trades an inspection touches (a sub's trade text is matched against these); final / building touch everyone */
const TRADE_RX = { electrical: /electric|low.?volt|solar/i, plumbing: /plumb|sewer|water.?heat|gas/i, mechanical: /hvac|mechanic|heat|air|duct|refrig/i,
  framing: /fram|carpent|struct|truss/i, lead: /lead|abat|paint/i, asbestos: /asbest|abat/i, mold: /mold|remed|mitig|environ/i };
const ALL_TRADES = { building: 1, final: 1 };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); return t.length > n ? t.slice(0, n) : t; }
function ymd(v){ const m = /^(\d{4}-\d{2}-\d{2})/.exec(s(v)); return m ? m[1] : ''; }
function hhmm(v){ return /^\d{2}:\d{2}$/.test(s(v)) ? s(v) : ''; }

/* the type of an old row (label only: "Framing", "Rough-in electrical", "Final") */
function typeOf(r){
  const t = low(r && r.type);
  if (NAME[t]) return t;
  const l = low((r && (r.type || r.label || r.name || r.title)) || '');
  if (/lead/.test(l)) return 'lead'; if (/asbest/.test(l)) return 'asbestos'; if (/mold|mould/.test(l)) return 'mold';
  if (/electr/.test(l)) return 'electrical'; if (/plumb/.test(l)) return 'plumbing'; if (/mechan|hvac/.test(l)) return 'mechanical';
  if (/fram/.test(l)) return 'framing'; if (/final/.test(l)) return 'final'; if (/build|footing|foundation|insulat|drywall|rough/.test(l)) return 'building';
  return 'other';
}
function typeName(r){ const t = typeOf(r); return t === 'other' ? (clip(s(r && (r.label || r.type)).replace(/\s+inspection$/i, ''), 60) || 'Other') : NAME[t]; }
function statusOf(r){
  const st = low(r && r.status);
  if (/^(scheduled|passed|failed|partial)$/.test(st)) return st;
  if (/pass/.test(low(r && r.result)) || (r && r.done === true)) return 'passed';
  if (/fail/.test(low(r && r.result))) return 'failed';
  return 'scheduled';
}
function rowsOf(store, pid){
  let v = store; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
  const l = v && typeof v === 'object' && !Array.isArray(v) ? arr(v[s(pid)]) : [];
  return l.filter(function(r){ return r.archived !== true && r.deleted !== true; });
}
function shown(p){ return !!p && p.portalInspections !== false; }
function t12(v){ const m = /^(\d{2}):(\d{2})$/.exec(s(v)); if (!m) return ''; let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m[2] === '00' ? '' : ':' + m[2]) + ' ' + ap; }
function windowOf(r){ const a = t12(hhmm(r.from)), b = t12(hhmm(r.to)); return a && b ? a + ' – ' + b : (a || ''); }

/* ── the customer: date, the type and a plain result. Never a note, the inspector, a phone, the office or who meets ── */
function custView(store, p, today){
  if (!shown(p)) return null;
  const out = [];
  rowsOf(store, p.id).forEach(function(r){
    const ty = typeName(r) + ' inspection';
    arr(r.history).forEach(function(h){
      if (h.what !== 'rescheduled' || !h.from || !ymd(h.from.date)) return;
      out.push({ date: ymd(h.from.date), window: '', type: ty, result: 'Rescheduled', past: true });
    });
    const d = ymd(r.date); if (!d) return;
    const st = statusOf(r);
    const res = st === 'passed' ? 'Passed' : st === 'scheduled' ? 'Scheduled' : 'Rescheduled';   /* a fail / partial: "Rescheduled" (plain words) */
    out.push({ date: d, window: st === 'scheduled' ? windowOf(r) : '', type: ty, result: res, past: st !== 'scheduled' || d < today });
  });
  const seen = {};
  const list = out.filter(function(x){ const k = x.date + '|' + x.type + '|' + x.result; if (seen[k]) return false; seen[k] = 1; return true; });
  return { upcoming: list.filter(function(x){ return !x.past; }).sort(function(a, b){ return a.date < b.date ? -1 : 1; }).map(strip),
    past: list.filter(function(x){ return x.past; }).sort(function(a, b){ return a.date < b.date ? 1 : -1; }).slice(0, 30).map(strip) };
}
function strip(x){ return { date: x.date, window: x.window, type: x.type, result: x.result }; }

/* ── a sub: the inspections that touch their trade (all when no trade is set) ── */
function touches(r, trade){
  trade = s(trade); if (!trade) return true;
  const t = typeOf(r); if (ALL_TRADES[t]) return true;
  if (Array.isArray(r.trades) && r.trades.length) return r.trades.some(function(x){ return low(x) && (low(trade).indexOf(low(x)) >= 0 || low(x).indexOf(low(trade)) >= 0); });
  const rx = TRADE_RX[t]; return rx ? rx.test(trade) : t === 'other';
}
function subView(store, p, trade, today){
  return rowsOf(store, p.id).filter(function(r){ return ymd(r.date) && touches(r, trade); }).map(function(r){
    const st = statusOf(r), d = ymd(r.date);
    return { id: clip(r.id, 80), date: d, window: st === 'scheduled' ? windowOf(r) : '', type: typeName(r) + ' inspection', status: st, upcoming: st === 'scheduled' && d >= today };
  }).sort(function(a, b){ return (a.upcoming === b.upcoming) ? (a.upcoming ? (a.date < b.date ? -1 : 1) : (a.date < b.date ? 1 : -1)) : (a.upcoming ? -1 : 1); }).slice(0, 40);
}

/* ── a sub's "Request an inspection" → the job's PM (the superintendent on a commercial job): a To-Do card ── */
function commercial(p){ return /commercial|\bgc\b|tenant|\bti\b/i.test(s(p.type || p.jobType || p.projectType) + ' ' + s(p.division)); }
function ownerOf(p, users){
  const byName = function(n){ return arr(users).find(function(u){ return n && low(u.name) === low(n); }) || null; };
  const sup = s(p.superintendent || p.super), pm = s(p.pm || p.projectManager);
  const who = commercial(p) && sup ? sup : (pm || sup);
  const u = byName(who) || {};
  return { name: who, email: low(u.email), role: who && who === sup && who !== pm ? 'superintendent' : 'PM' };
}
function cleanReq(b, today){
  const type = NAME[low(b.type)] ? low(b.type) : '';
  if (!type) return { error: 'Pick the kind of inspection.' };
  const date = ymd(b.date);
  if (!date || date < today) return { error: 'Pick the day you would like (today or later).' };
  return { type: type, date: date, note: clip(b.note, 500) };
}
function reqTodo(r, p, owner, at){
  const label = '📋 ' + s(r.subName) + ' asks for a ' + NAME[r.type] + ' inspection — ' + clip(p.name, 80);
  return { id: 'insp_req_' + r.id, kind: 'insp_req', label: clip(label, 240),
    note: ['Requested in the sub portal for ' + r.date + '.', r.note ? 'Note: ' + r.note : '', 'Open the job → 📋 Inspections → "Schedule it".'].filter(Boolean).join('\n'),
    assignees: owner && owner.email ? [owner.email] : [], urgency: 'normal', priority: 'normal', pid: s(p.id), subId: s(r.subId), approval: true,
    inspReq: { id: r.id, type: r.type, date: r.date, note: r.note, subId: s(r.subId), subName: s(r.subName), trade: s(r.trade), at: at },
    addedBy: 'Sub portal', addedAt: at, createdAt: at, updatedAt: at, done: false };
}
function taskList(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return arr(v); }
/* their own asks on this job: Requested (waiting) or Scheduled (the PM booked it) */
function reqsFor(tasks, pid, subId){
  return taskList(tasks).filter(function(t){ return t.kind === 'insp_req' && s(t.pid) === s(pid) && s(t.subId) === s(subId) && t.inspReq; }).map(function(t){
    return { id: clip(t.inspReq.id, 60), type: NAME[t.inspReq.type] ? NAME[t.inspReq.type] + ' inspection' : 'Inspection', date: ymd(t.inspReq.date), state: t.done === true ? 'scheduled' : 'requested' };
  }).slice(-20);
}

module.exports = { KEY, TYPES, NAME, typeOf, typeName, statusOf, rowsOf, shown, windowOf, custView, subView, touches, commercial, ownerOf, cleanReq, reqTodo, reqsFor, taskList };
