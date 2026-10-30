/* ============================================================================
   GrayCo — SUBS WORK THROUGH THEIR PORTAL, WITH PHOTOS (patch SUBPHOTOS).   netlify/functions/_lib/subwork.js

   Owner (10/30): "require subs to enter jobs in their portal and photos into their portal and those photos will go to
   the jobs photos grayco photos". Revised the same day: the check-in, the daily photos and "done for today" are all
   OPTIONAL. The ONE rule is at invoice time:

     A sub can send an invoice for a job only when that job has enough photos FROM THAT SUB:
       need = max(minimum, number of days the sub was scheduled there up to today)
       minimum = 5 by default; an admin changes it (gc_kv gc_sub_portal_settings.invPhotoMin, 0–50).

   Their photos are counted from both places a portal photo can land:
     · GrayCo Photos records (gc_kv gc_photos, source 'sub', subId = the sub, jobId = the job, not deleted);
     · the portal's own sent files (gc_sub_event photos / progress / punch, image files) — the ones GrayCo Photos has not
       filed yet. The same picture twice (same file fingerprint) counts once.

   Also here (pure, so the Node tests drive it):
     · today(): the sub's jobs on the schedule today (Central) with the address, the Maps link, the customer's name and
       phone (only jobs the sub is assigned to — the caller passes only those) and the CRM PO (the CRM's _gcJobLabel field:
       autoPO || poNumber || po);
     · firstDayDue(): the owner's "first day" text — one text per sub per job, on the morning of the FIRST scheduled day.
   Nothing here reads or writes storage.
   ========================================================================== */
'use strict';
const TZ = 'America/Chicago';
const DEFAULT_MIN = 5, MAX_MIN = 50, MAX_DAYS = 120;
const FIRST_FROM_MIN = 7 * 60, FIRST_TO_MIN = 12 * 60;   /* the first-day text: from 7 AM; a missed 7 AM run still sends by noon */

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function ymd(v){
  if (!v) return '';
  if (typeof v === 'number') { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function addDays(d, n){ const t = new Date(ymd(d) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function central(ms){
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    .formatToParts(new Date(ms)).forEach(function(p){ o[p.type] = p.value; });
  return { ymd: o.year + '-' + o.month + '-' + o.day, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10), wd: o.weekday };
}
/* the CRM's PO for a job — exactly the field _gcJobLabel shows ("PO …" = autoPO || poNumber || po) */
function poOf(p){ return s(p && (p.autoPO || p.poNumber || p.po)); }
function mapsOf(addr){ return s(addr) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s(addr)) : ''; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }

/* ── the same sub? (a schedule row / a job's sub row names the sub by id, or by company / contact name) ── */
function sameName(name, sub){
  const n = low(name); if (!n || !sub) return false;
  return [sub.company, sub.name, sub.contact].map(low).filter(Boolean).some(function(x){ return x === n || (x.length > 4 && (n.indexOf(x) >= 0 || x.indexOf(n) >= 0)); });
}
function rowIsSub(x, sub){
  if (!x || !sub) return false;
  const id = s(x.subId || x.vendorId);
  if (id) return id === s(sub.id);
  return sameName(x.vendor || x.sub || x.subName || x.assignee, sub);
}
function pidOf(x){ return s(x && (x.pid || x.projectId || x.jobId)); }
function rowLive(x){ return x && x.deleted !== true && x.private !== true && x.scope !== 'personal' && x.tentative !== true && !/tentative|cancel/i.test(s(x.status)); }

/* every day (YYYY-MM-DD) this sub is on the schedule at this job — a row with an end date covers each day */
function schedDays(schedule, sub, pid){
  const out = {};
  arr(schedule).forEach(function(x){
    if (!rowLive(x) || pidOf(x) !== s(pid) || !rowIsSub(x, sub)) return;
    const a = ymd(x.date); if (!a) return;
    let b = ymd(x.endDateSch || x.endDate) || a; if (b < a) b = a;
    for (let d = a, n = 0; d <= b && n < MAX_DAYS; d = addDays(d, 1), n++) out[d] = 1;
  });
  return Object.keys(out).sort();
}

/* ── the sub's photos on one job ── */
function refKey(f){
  const m = /^sb:crm-files\/([0-9a-f]{64})\.[a-z0-9]{1,8}$/.exec(s(f && f.ref));
  return s(f && (f.hash || f.srcHash)) || (m ? m[1] : '') || s(f && f.ref) || s(f && f.id);
}
function photoCount(gcPhotos, events, sub, pid){
  const seen = {}; let n = 0;
  arr(gcPhotos).forEach(function(r){
    if (r.deleted === true || r.source !== 'sub' || s(r.jobId) !== s(pid) || s(r.subId) !== s(sub.id)) return;
    const k = refKey(r); if (!k || seen[k]) return; seen[k] = 1; n++;
  });
  arr(events).forEach(function(e){
    if (['photos', 'progress', 'punch'].indexOf(s(e.kind)) < 0 || s(e.project_id) !== s(pid) || s(e.sub_id) !== s(sub.id)) return;
    arr((e.data || {}).files).forEach(function(f){
      if (!/^image\//.test(s(f.type))) return;
      const k = refKey(f); if (!k || seen[k]) return; seen[k] = 1; n++;
    });
  });
  return n;
}
function minOf(settings){
  const v = settings && settings.invPhotoMin;
  if (v === undefined || v === null || v === '') return DEFAULT_MIN;
  const n = Math.round(Number(v)); return isFinite(n) ? Math.max(0, Math.min(MAX_MIN, n)) : DEFAULT_MIN;
}
/* how many photos the sub needs on this job before an invoice: max(minimum, scheduled days up to today) */
function photoNeed(schedule, sub, pid, settings, todayYmd){
  const days = schedDays(schedule, sub, pid).filter(function(d){ return !todayYmd || d <= todayYmd; }).length;
  return { need: Math.max(minOf(settings), days), days: days, min: minOf(settings) };
}
function gateMessage(jobName, need, have){
  return 'Add at least ' + need + ' photo' + (need === 1 ? '' : 's') + ' of your work on ' + (s(jobName) || 'this job') + ' before sending this invoice (you have ' + have + ').';
}
/* → { ok, need, have, days, min, message? } */
function invoiceGate(o){
  o = o || {};
  const p = o.job || {}, sub = o.sub || {};
  const nd = photoNeed(o.schedule, sub, p.id, o.settings, o.today);
  const have = photoCount(o.gcPhotos, o.events, sub, p.id);
  const out = { ok: have >= nd.need, need: nd.need, have: have, days: nd.days, min: nd.min };
  if (!out.ok) out.message = gateMessage(p.name, nd.need, have);
  return out;
}

/* ── the sub's jobs on the schedule today (the caller passes only the jobs the sub is assigned to) ── */
function today(jobs, schedule, sub, todayYmd){
  const out = [];
  arr(jobs).forEach(function(p){
    const days = schedDays(schedule, sub, p.id);
    if (days.indexOf(todayYmd) < 0) return;
    const row = arr(schedule).filter(function(x){ return rowLive(x) && pidOf(x) === s(p.id) && rowIsSub(x, sub) && ymd(x.date) <= todayYmd && (ymd(x.endDateSch || x.endDate) || ymd(x.date)) >= todayYmd; })[0] || {};
    out.push(jobCard(p, { time: clip(row.time, 10), title: clip(row.title, 120), day: todayYmd }));
  });
  return out;
}
/* what a sub sees about a job they are on: never the insurance carrier, the claim or any price */
function jobCard(p, extra){
  const addr = s(p.address || p.jobAddress);
  return Object.assign({ id: s(p.id), name: clip(p.name, 120), address: addr, maps: mapsOf(addr), po: poOf(p),
    customer: { name: clip(p.client || p.customerName, 80), phone: s(p.clientPhone || p.phone) } }, extra || {});
}

/* ── the owner's first-day text: "subs get a sub portal text anytime they are scheduled for a job, first day" ──
   One text per sub per job, at 7 AM Central on the FIRST scheduled day (any weekday: the sub was scheduled then).
   ON by default for every sub with a 10-digit mobile; an admin turns it off for one sub (gc_sub_texts subs[id].firstOff).
   Sent once: state[sub|job] = { day, at }. Not again for later days, nor for a reschedule — unless the first day moved and
   the sub is no longer on the schedule on the day the text was sent for. */
function firstKey(subId, pid){ return s(subId) + '|' + s(pid); }
function firstText(o){
  const lines = ['GrayCo: Hi ' + (s(o.greet) || 'there') + ', you start ' + (s(o.job) || 'a GrayCo job') + ' today' + (o.start ? ' (' + o.start + ')' : '') + '.'];
  if (o.address) lines.push('Address: ' + o.address);
  if (o.po) lines.push('PO for materials: ' + o.po);
  lines.push('Your GrayCo portal: ' + o.link);
  lines.push('Add photos of your work in your portal.');
  lines.push('Reply STOP to opt out.');
  return lines.join('\n');
}
function jobOk(p){
  if (!p || p.deleted === true) return false;
  if (/complete|closed|lost|cancel|dead|archived|void|spam|duplicate/i.test(s(p.status))) return false;
  if (/bid|lead|estimate|proposal|tentative|prospect/i.test(s(p.status))) return false;
  return true;
}
/* → [{ key, subId, pid, day, phone, sub, job, po, address, greet, start }] — what is due now */
function firstDayDue(data, set, state, nowMs){
  const c = central(nowMs), out = [];
  if (c.min < FIRST_FROM_MIN || c.min >= FIRST_TO_MIN) return out;
  const subs = arr(data.subs).concat(arr(data.vendors)).filter(function(x){ return x.id && x.deleted !== true; });
  const dead = {}; arr(data.gc_deleted_projects).forEach(function(x){ dead[s(x && typeof x === 'object' ? x.id : x)] = 1; });
  (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ if (typeof x !== 'object') dead[s(x)] = 1; });
  const jobs = {}; arr(data.projects).forEach(function(p){ if (p.id && !dead[s(p.id)] && jobOk(p)) jobs[s(p.id)] = p; });
  const firsts = {};   /* sub|job → first day */
  arr(data.schedule).forEach(function(x){
    if (!rowLive(x)) return;
    const pid = pidOf(x); if (!jobs[pid]) return;
    const d = ymd(x.date); if (!d) return;
    const sub = s(x.subId || x.vendorId) ? subs.find(function(sb){ return s(sb.id) === s(x.subId || x.vendorId); }) : subs.find(function(sb){ return sameName(x.vendor || x.sub || x.subName || x.assignee, sb); });
    if (!sub) return;
    const k = firstKey(sub.id, pid);
    if (!firsts[k] || d < firsts[k].day || (d === firsts[k].day && s(x.time) && !firsts[k].time)) firsts[k] = { day: d, sub: sub, pid: pid, time: clip(x.time, 10) };
  });
  const st = (state && state.sent) || {}, cfg = (set && set.subs) || {};
  Object.keys(firsts).forEach(function(k){
    const f = firsts[k];
    if (f.day !== c.ymd) return;
    const sc = cfg[s(f.sub.id)] || {};
    if (sc.firstOff === true) return;
    const prev = st[k];
    if (prev) {
      if (prev.day === f.day) return;                                   /* sent for this first day */
      if (schedDays(data.schedule, f.sub, f.pid).indexOf(prev.day) >= 0) return;   /* the sub WAS on that day: a later day, not a move */
    }
    const ph = phone10(sc.phone || f.sub.cell || f.sub.mobile || f.sub.phone || (f.sub.contact && f.sub.contact.phone));
    if (ph.length !== 10) return;
    const p = jobs[f.pid];
    out.push({ key: k, subId: s(f.sub.id), pid: f.pid, day: f.day, phone: ph, sub: s(f.sub.company || f.sub.name), job: clip(p.name, 80), po: poOf(p),
      address: s(p.address || p.jobAddress), greet: s(f.sub.contact && typeof f.sub.contact === 'string' ? f.sub.contact : f.sub.name).split(/\s+/)[0], start: f.time });
  });
  return out;
}

module.exports = { DEFAULT_MIN, s, low, arr, ymd, addDays, central, poOf, mapsOf, phone10, rowIsSub, schedDays, photoCount, minOf, photoNeed,
  gateMessage, invoiceGate, today, jobCard, firstKey, firstText, firstDayDue };
