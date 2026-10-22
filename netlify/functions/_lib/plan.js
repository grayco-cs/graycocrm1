/* ============================================================================
   GrayCo — THE NIGHTLY "📅 TODAY'S PLAN" (patch PLAN).   netlify/functions/_lib/plan.js

   Owner (10/22): "To-do list for every profile needs to update every night 2 am with things they can do the next
   day on CRM."

   Pure functions (no fetch, no storage): build(src, opts) → { email: { name, roles, items[] } }, and
   merge(list, plans, opts) → the new gc_office_tasks list. The scheduled function plan-nightly.js reads the data,
   calls these and writes the list; the CRM's Admin button shows the same plans as a dry run.

   ONE record per person in the shared To-Do store (gc_office_tasks — the TD2 list every computer syncs):
     { id: 'plan_<hash(email)>', kind: 'daily_plan', label: '📅 Today's plan — Thu, Oct 23', assignees: [email],
       personal: true, due: <plan day>, prio: 'high', planDay, items: [{ id: 'plan_<h>_<source key>', label, done,
       go: { pid | lead | claim | tab }, carried }] }
   The item ids come from the record each line is about (a job, a lead, an invoice, an approval …), so running it
   twice changes nothing; a line ticked today stays ticked on a re-run; an open line from an earlier day that is
   still open is kept and marked "carried over"; a line whose problem is gone is dropped. Manual to-dos are never
   touched. Money only for people who may see it (admins, owners, office).
   ========================================================================== */
'use strict';
const FA = require('./fa-core.js');
const TZ = 'America/Chicago';
const PLAN_KIND = 'daily_plan';
const MAX_ITEMS = 40;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function ymd(v){ return FA.ymd(v); }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function okEmail(e){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(e)); }
function money(n){ return '$' + Math.round(num(n)).toLocaleString('en-US'); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function hash(t){ t = String(t || ''); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function pidOf(x){ return s(x && (x.pid || x.projectId || x.jobId || x.project_id || x.job)); }

/* ── time: the Central wall clock ── */
function central(d){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
  return { wd: o.weekday, hour: parseInt(o.hour, 10) % 24, ymd: o.year + '-' + o.month + '-' + o.day };
}
function addDays(day, n){ const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function wdOf(day){ return new Date(day + 'T12:00:00Z').getUTCDay(); }   /* 0 Sun … 6 Sat */
/* the day a plan made at `now` is for: run at 2 AM, it is for that same calendar day (the coming workday) */
function planDay(now){ return central(new Date(now)).ymd; }
function niceDay(day){ return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }
/* the scheduled function runs at 07:00 and 08:00 UTC; only the run that lands on 2 AM Central acts (CDT/CST) */
function isTwoAm(now){ return central(new Date(now)).hour === 2; }

/* ── people and roles ── */
function people(src, opts){
  opts = opts || {};
  const by = {};
  const owners = (opts.owners || []).map(low);
  const put = function(email, name, role, profile, active){
    email = low(email); if (!okEmail(email)) return;
    const p = by[email] || (by[email] = { email: email, name: '', role: '', profile: '', active: true });
    if (name && !p.name) p.name = s(name);
    if (role) p.role = p.role ? p.role + ' ' + s(role) : s(role);
    if (profile && !p.profile) p.profile = low(profile);
    if (active === false) p.active = false;
  };
  arr(src.staff).forEach(function(r){ if (r) put(r.email, r.name, r.role, r.profile, r.active !== false); });
  arr(src.users).forEach(function(u){ if (u) put(u.email, u.name, u.role || u.title, u.profile, !(u.active === false || u.offboarded || u.deactivated || u.archived)); });
  return Object.keys(by).map(function(k){
    const p = by[k], r = low(p.role), pr = p.profile;
    const roles = {
      admin: /\badmin|owner/.test(r) || owners.indexOf(p.email) >= 0,
      pm: pr === 'pm' || /project manager|\bpm\b/.test(r) && !/assistant|apm/.test(r),
      apm: pr === 'apm' || /assistant pm|assistant project|\bapm\b/.test(r),
      super: pr === 'super' || /superintendent|^super\b/.test(r),
      estimator: pr === 'estimator' || /estimat/.test(r),
      insurance: pr === 'insurance' || /insurance|claims?/.test(r),
      mitigation: pr === 'mitigation' || /mitigation/.test(r),
      office: pr === 'office' || /office/.test(r) || /^office@/.test(p.email)
    };
    if (!p.name) p.name = p.email.split('@')[0];
    p.roles = roles;
    p.money = roles.admin || roles.office;
    return p;
  }).filter(function(p){ return p.active; });
}
function samePerson(v, p){
  const t = low(v); if (!t || !p) return false;
  if (t === p.email) return true;
  const n = low(p.name); if (!n) return false;
  if (t === n) return true;
  const first = n.split(/\s+/)[0];
  return first.length >= 3 && t.split(/\s+/)[0] === first && (t.split(/\s+/).length === 1 || t.indexOf(n.split(/\s+/).slice(-1)[0]) >= 0);
}

/* ── the records ── */
const CLOSED_LEAD = /^(won|lost|dead|deleted|converted|declined|not\s*bidding|no\s*bid|pass(ed)?|archived|cancell?ed|closed|dismissed|merged)$/i;
function leadClosed(l){ return !l || l.deleted || l._deleted || l.converted || l.notBidding || l.noBid || [l.stage, l.status, l.inboxState, l.bidStatus].some(function(v){ return CLOSED_LEAD.test(s(v)); }); }
function leadTitle(l){ return clip(s(l.name || l.title || l.project) || 'Lead', 70); }
function leadWho(l){ return [l.pm, l.estimator, l.assignee, l.assignedTo, l.owner].map(s).filter(Boolean); }
function isBid(l){
  if (/commercial|government|gov\b/i.test(s(l.leadKind || l.type || l.kind))) return true;
  return !!(l.inboxId || l.bidDue || l.estimator || l.bidStatus) && !/residential|insurance|website/i.test(s(l.leadKind || l.type));
}
function contacted(l){
  const st = low(l.stage);
  if (st && !/^(new|new lead|lead|unassigned)$/.test(st)) return true;
  return ['contactedAt', 'lastContact', 'lastContacted', 'lastContactAt', 'firstContactAt'].some(function(f){ return !!s(l[f]); });
}
/* PO · job name · street — the street tells apart a GC's look-alike jobs (owner 10/22) */
function jobTag(p){ const st = s(p.address || p.jobAddress).split(',')[0].trim(); return [s(p.autoPO || p.po) ? 'PO ' + s(p.autoPO || p.po) : '', clip(p.name, 50), st && low(p.name).indexOf(low(st)) < 0 ? st : ''].filter(Boolean).join(' · '); }
function invNo(i){ return s(i.number || i.invNumber || i.num || i.id); }
function invTotal(i){ return num(i.amount != null ? i.amount : (i.total != null ? i.total : i.amt)); }
function invPaid(i){ return num(i.paid != null ? i.paid : i.amountPaid) + arr(i.payments).reduce(function(a, p){ return a + num(p && p.amount); }, 0); }
function invBal(i){ if (i.balance != null) return num(i.balance); return Math.max(0, invTotal(i) - invPaid(i)); }
function invClosed(i){ return !i || i.deleted || /void|cancel|paid/i.test(s(i.status)) || i.paidInFull === true; }

/* ── build every person's plan ── */
function build(src, opts){
  opts = opts || {};
  const now = opts.now || Date.now();
  const day = opts.day || planDay(now);
  const soon = addDays(day, 3), weekAgo = addDays(day, -7);
  const team = people(src, opts);
  const jobs = arr(src.projects).filter(function(p){ return p && p.id && p.deleted !== true; });
  const activeJobs = jobs.filter(FA.isActiveJob);
  const jobBy = {}; jobs.forEach(function(p){ jobBy[s(p.id)] = p; });
  const leads = arr(src.leads).filter(function(l){ return l && l.id && !leadClosed(l); });
  const invoices = arr(src.invoices).length ? arr(src.invoices) : arr(src.invs);
  const out = {};
  const headEst = low(opts.headEstimator);

  team.forEach(function(me){
    const R = me.roles, items = [], seen = {};
    const add = function(key, cat, label, go){ key = s(key); if (!key || seen[key]) return; seen[key] = 1; items.push({ key: key, cat: cat, label: clip(label, 160), go: go || null }); };
    const myJob = function(p){ return samePerson(p.pm, me) || samePerson(p.apm, me) || samePerson(p.assistantPm, me) || samePerson(p.projectManager, me); };
    const superJob = function(p){ return samePerson(p.superintendent || p.super, me); };

    /* everyone: approvals waiting on me */
    arr(src.gc_approval_queue).forEach(function(q){
      if (!q || !/^(waiting|sending)$/.test(s(q.status))) return;
      const atAdmin = s(q.step) === 'admin', mine = s(q.step) === 'pm' && (low(q.pmEmail) === me.email || samePerson(q.pm, me));
      const escalated = atAdmin && q.adminSince && (now - Date.parse(q.adminSince)) > 24 * 3600e3;
      if (mine || (atAdmin && R.admin) || (escalated && R.office && !R.admin)) add('appr:' + s(q.id), 'appr', '✅ Approve: ' + clip(q.title || q.subject || q.kind, 90) + (q.jobName ? ' — ' + clip(q.jobName, 40) : ''), { tab: 'approvals' });
    });
    /* everyone: my to-dos due by today (overdue included) — not the plans themselves */
    arr(src.gc_office_tasks).forEach(function(t){
      if (!t || t.done || t.deleted || t.kind === PLAN_KIND || !t.id) return;
      const due = ymd(t.due || t.dueDate || t.forDate); if (!due || due > day) return;
      const who = arr(t.assignees).map(low);
      const forMe = who.indexOf(me.email) >= 0 || (!who.length && (R.office || R.admin)) || (t.shared && who.indexOf(me.email) >= 0);
      if (!forMe) return;
      add('todo:' + s(t.id), 'todo', (due < day ? '⏰ Overdue to-do: ' : '📌 Due today: ') + clip(t.label, 100), t.pid ? { pid: s(t.pid) } : { tab: 'todo' });
    });
    /* everyone: open warranty tickets on my jobs */
    arr(src.gc_warranty_tickets).forEach(function(w){
      if (!w || /closed|resolved|done/i.test(s(w.status))) return;
      const p = jobBy[pidOf(w)] || {};
      if (myJob(p) || (R.admin && !p.pm)) add('warr:' + s(w.id), 'cust', '🛠 Warranty ticket: ' + clip(w.title || w.desc || w.description, 70) + (p.name ? ' — ' + jobTag(p) : ''), pidOf(w) ? { pid: pidOf(w) } : null);
    });
    /* customer "we need from you" items open more than 3 days on my jobs (office: all) */
    arr(src.gc_cust_needs).forEach(function(n){
      if (!n || s(n.status || 'open') !== 'open') return;
      const age = (now - Date.parse(n.createdAt || 0)) / 864e5; if (!(age >= 3)) return;
      const p = jobBy[s(n.pid)] || {};
      if (myJob(p) || R.office) add('need:' + s(n.id), 'cust', '📎 Chase the customer for: ' + clip(n.label, 60) + (p.name ? ' — ' + jobTag(p) : ''), { pid: s(n.pid) });
    });

    /* PM / APM */
    if (R.pm || R.apm || R.admin) {
      const mineJobs = activeJobs.filter(myJob);
      const sched = arr(src.schedule).filter(function(x){ return x && !x.deleted && ymd(x.date) <= day && ymd(x.endDateSch || x.endDate || x.date) >= day && !/cancel/i.test(s(x.status)); });
      mineJobs.forEach(function(p){
        const pid = s(p.id), rows = sched.filter(function(x){ return FA.pidOf(x) === pid; });
        if (rows.length) add('sched:' + pid + ':' + day, 'jobs', '🏗 On the schedule: ' + jobTag(p) + ' — ' + clip(rows.map(function(x){ return s(x.title || x.type || 'work'); }).join(', '), 60) + (s(p.address) ? ' · ' + clip(p.address, 50) : ''), { pid: pid });
        const punch = arr(src.punch).filter(function(x){ return x && FA.pidOf(x) === pid && !x.deleted && !/complete|done|closed/i.test(s(x.status)); });
        if (punch.length) add('punch:' + pid, 'jobs', '📋 ' + punch.length + ' open punch item' + (punch.length > 1 ? 's' : '') + ' — ' + jobTag(p), { pid: pid });
      });
      if (R.pm || R.apm) {
        leads.forEach(function(l){
          if (!leadWho(l).some(function(w){ return samePerson(w, me); }) || contacted(l)) return;
          add('lead:' + s(l.id), 'leads', '📞 Reach out to new lead: ' + leadTitle(l), { lead: s(l.id) });
        });
        arr(src.estimates).forEach(function(e){
          if (!e || e.deleted || !/sent|submitted/i.test(s(e.status)) || /sign|won|lost|declin/i.test(s(e.status))) return;
          const p = jobBy[pidOf(e)] || {}; if (!myJob(p) && !samePerson(e.estimator || e.pm || e.createdBy, me)) return;
          const sent = ymd(e.sentAt || e.submittedAt || e.updatedAt); if (!sent || sent > addDays(day, -2)) return;
          add('estfu:' + s(e.id), 'leads', '✉️ Follow up the estimate: ' + clip(e.name || e.title || p.name, 60) + ' (sent ' + sent + ')', pidOf(e) ? { pid: pidOf(e) } : { tab: 'estimates' });
        });
        arr(src.cos).concat(arr(src.changeOrders)).forEach(function(c){
          if (!c || c.deleted || !/sent|pending|awaiting|to sign/i.test(s(c.status || c.signStatus)) || /signed|approved|declin|void/i.test(s(c.status))) return;
          const p = jobBy[pidOf(c)] || {}; if (!myJob(p)) return;
          add('co:' + s(c.id), 'jobs', '✍️ Change order waiting to be signed — ' + jobTag(p), { pid: pidOf(c) });
        });
        invoices.forEach(function(i){
          if (!i || invClosed(i) || !/draft|ready|not sent|unsent/i.test(s(i.status))) return;
          const p = jobBy[pidOf(i)] || {}; if (!myJob(p)) return;
          add('invsend:' + invNo(i), 'money', '🧾 Invoice ready to send — ' + jobTag(p) + (me.money ? ' (' + money(invTotal(i)) + ')' : ''), { pid: pidOf(i) });
        });
        /* insurance on my jobs: stuck mortgage checks, closeouts with something open */
        arr(src.gc_claims).forEach(function(c){
          if (!c || c.deleted) return; const p = jobBy[pidOf(c)] || {}; if (!myJob(p)) return;
          FA.mtgChecks(c, now).filter(function(x){ return x.stuck; }).forEach(function(x){ add('mtg:' + s(c.id) + ':' + x.id, 'ins', '🏦 Mortgage check stuck at "' + x.stageName + '" ' + x.daysStill + ' days — ' + jobTag(p), { pid: s(p.id) }); });
        });
      }
    }

    /* superintendent: tomorrow's (today's) jobs, safety sign-in */
    if (R.super) {
      const jobsToday = FA.dispatchFor(me.name, { schedule: src.schedule, projects: jobs, customers: src.customers, punch: src.punch }, day, { orders: arr(src.gc_orders), sitebook: {} });
      jobsToday.forEach(function(j){
        add('dsp:' + j.pid + ':' + day, 'jobs', '🏗 ' + clip(j.job, 50) + (j.address ? ' — ' + clip(j.address, 50) : '') + (j.tasks.length ? ': ' + clip(j.tasks.join(', '), 60) : ''), { pid: j.pid });
        if (j.materials.length) add('mat:' + j.pid + ':' + day, 'jobs', '🚚 Deliveries at ' + clip(j.job, 40) + ': ' + clip(j.materials.join(' · '), 80), { pid: j.pid });
      });
      if (jobsToday.length) add('safety:' + day, 'jobs', '🦺 Safety sign-in before work starts (' + jobsToday.length + ' job' + (jobsToday.length > 1 ? 's' : '') + ')', { tab: 'sitebook' });
      activeJobs.filter(superJob).forEach(function(p){
        const n = arr(src.punch).filter(function(x){ return x && FA.pidOf(x) === s(p.id) && !x.deleted && !/complete|done|closed/i.test(s(x.status)); }).length;
        if (n) add('punch:' + s(p.id), 'jobs', '📋 ' + n + ' open punch item' + (n > 1 ? 's' : '') + ' — ' + jobTag(p), { pid: s(p.id) });
      });
    }

    /* estimator: bids due soon (priority, then due), bids missing info, sub bids, results to chase */
    if (R.estimator) {
      const isHead = headEst && headEst === me.email;
      const mineBids = leads.filter(function(l){ return isBid(l) && (leadWho(l).some(function(w){ return samePerson(w, me); }) || (isHead && !leadWho(l).length)); });
      mineBids.filter(function(l){ const d = ymd(l.bidDue); return d && d >= day && d <= soon && !/submitted/i.test(s(l.stage || l.bidStatus)); })
        .sort(function(a, b){ return (num(b.priority) - num(a.priority)) || (ymd(a.bidDue) < ymd(b.bidDue) ? -1 : 1); })
        .forEach(function(l){ add('bid:' + s(l.id), 'leads', '📐 Bid due ' + ymd(l.bidDue) + (s(l.bidDue).length > 10 ? ' ' + s(l.bidDue).slice(11, 16) : '') + (num(l.priority) ? ' · P' + num(l.priority) : '') + ' — ' + leadTitle(l) + (l.dueToCompany ? ' (to ' + clip(l.dueToCompany, 30) + ')' : ''), { lead: s(l.id) }); });
      mineBids.filter(function(l){ return !ymd(l.bidDue) || !s(l.dueToCompany); }).slice(0, 10)
        .forEach(function(l){ add('bidinfo:' + s(l.id), 'leads', '⚠️ Add the ' + (!ymd(l.bidDue) ? 'bid due date' : 'company it is due to') + ' — ' + leadTitle(l), { lead: s(l.id) }); });
      mineBids.filter(function(l){ return /submitted/i.test(s(l.stage || l.bidStatus)) && ymd(l.bidDue) && ymd(l.bidDue) <= weekAgo; }).slice(0, 10)
        .forEach(function(l){ add('bidres:' + s(l.id), 'leads', '🏆 Ask for the bid results — ' + leadTitle(l), { lead: s(l.id) }); });
      const sb = arr(src.gc_sub_bids_email).filter(function(x){ return x && (x.status === 'unmatched' || x.status === 'matched'); });
      if (sb.length && (isHead || !headEst)) add('subbids:' + day, 'leads', '📨 ' + sb.length + ' sub bid' + (sb.length > 1 ? 's' : '') + ' to review (Leads → 📨 Sub bids)', { tab: 'leads' });
    }

    /* insurance / mitigation: closeouts with something open, equipment on site too long */
    if (R.insurance || R.mitigation) {
      arr(src.gc_claims).forEach(function(c){
        if (!c || c.deleted) return; const p = jobBy[pidOf(c)] || {};
        if (!(samePerson(c.pm || c.owner || c.assignee, me) || myJob(p) || (!c.pm && !p.pm))) return;
        let st = null; try { st = FA.closeoutState(c, p, { now: now }); } catch (e) {}
        if (st && st.open) {
          const what = !st.suppDone ? 'supplement check' : st.suppOpen ? 'supplement follow-up' : st.depOpen ? (st.depRequested ? 'depreciation follow-up' : 'depreciation release') : '';
          if (what) add('close:' + s(c.id), 'ins', '🛡 ' + what[0].toUpperCase() + what.slice(1) + ' — ' + (jobTag(p) || clip(c.claimNumber || c.id, 40)), { claim: s(c.id), pid: s(p.id) });
        }
        arr(c.dontForget || c.checklist).forEach(function(x){
          if (!x || x.done || !ymd(x.due) || ymd(x.due) > day) return;
          add('df:' + s(c.id) + ':' + s(x.id || x.k || x.label), 'ins', '✅ ' + clip(x.label || x.l, 60) + ' — ' + (jobTag(p) || 'claim'), { claim: s(c.id), pid: s(p.id) });
        });
      });
      arr(src.gc_equipment).forEach(function(e){
        if (!e || e.deleted || ymd(e.removedAt || e.pickedUp || e.off)) return;
        const placed = ymd(e.placedAt || e.delivered || e.on || e.date); if (!placed) return;
        const days = Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(placed + 'T12:00:00Z')) / 864e5);
        const p = jobBy[pidOf(e)] || {}; if (days < (opts.equipDays || 5) || !(myJob(p) || R.mitigation)) return;
        add('equip:' + s(e.id), 'ins', '💨 ' + clip(e.type || e.kind || 'Equipment', 30) + ' on site ' + days + ' days — ' + (jobTag(p) || 'job'), pidOf(e) ? { pid: pidOf(e) } : null);
      });
    }

    /* office: overdue invoices to call, invoices to send, unmatched orders / sub bids */
    if (R.office || R.admin) {
      invoices.filter(function(i){ return i && !invClosed(i) && !/draft/i.test(s(i.status)) && invBal(i) > 0 && ymd(i.dueDate || i.due) && ymd(i.dueDate || i.due) < day; })
        .sort(function(a, b){ return ymd(a.dueDate || a.due) < ymd(b.dueDate || b.due) ? -1 : 1; }).slice(0, 12)
        .forEach(function(i){ const p = jobBy[pidOf(i)] || {}; add('ar:' + invNo(i), 'money', '💵 Overdue invoice #' + invNo(i) + ' — ' + (jobTag(p) || clip(i.client || i.customer, 40)) + (me.money ? ' · ' + money(invBal(i)) + ' open since ' + ymd(i.dueDate || i.due) : ''), pidOf(i) ? { pid: pidOf(i) } : { tab: 'invoices' }); });
      const uo = arr(src.gc_orders).filter(function(o){ return o && !o.deleted && o.status === 'unmatched'; });
      if (uo.length && R.office) add('orders:' + day, 'office', '🚚 ' + uo.length + ' supplier order' + (uo.length > 1 ? 's' : '') + ' to match to a job', { tab: 'todo' });
    }

    /* admin: leads with nobody on them or no priority */
    if (R.admin) {
      const un = leads.filter(function(l){ return !leadWho(l).length; });
      if (un.length) add('unassigned:' + day, 'leads', '👤 ' + un.length + ' lead' + (un.length > 1 ? 's' : '') + ' waiting to be assigned', { tab: 'leads' });
      const np = leads.filter(function(l){ return !num(l.priority); });
      if (np.length) add('noprio:' + day, 'leads', '⭐ ' + np.length + ' lead' + (np.length > 1 ? 's' : '') + ' need a priority (1–10)', { tab: 'leads' });
    }

    out[me.email] = { name: me.name, email: me.email, roles: Object.keys(R).filter(function(k){ return R[k]; }), items: items.slice(0, MAX_ITEMS), more: Math.max(0, items.length - MAX_ITEMS) };
  });
  return { day: day, plans: out };
}

/* is there anything to plan for this day? Weekends only for people with scheduled work */
function skipWeekend(day, plan){
  const wd = wdOf(day); if (wd !== 0 && wd !== 6) return false;
  return !arr(plan && plan.items).some(function(i){ return /^(sched|dsp):/.test(i.key); });
}

/* ── write into the To-Do list ── */
function planId(email){ return 'plan_' + hash(low(email)); }
function merge(list, built, opts){
  opts = opts || {};
  const day = built.day, now = opts.nowIso || new Date().toISOString();
  const keep = arr(list).filter(function(t){ return !(t && t.kind === PLAN_KIND && t.id && built.plans[low(arr(t.assignees)[0])]); });
  const old = {}; arr(list).forEach(function(t){ if (t && t.kind === PLAN_KIND) old[s(t.id)] = t; });
  let changed = 0;
  Object.keys(built.plans).forEach(function(email){
    const pl = built.plans[email], id = planId(email), prev = old[id];
    if (skipWeekend(day, pl) || !pl.items.length) {
      if (prev && !prev.deleted && !prev.done) { const z = Object.assign({}, prev, { done: true, autoDone: true, updatedAt: now, label: prev.label }); keep.push(z); changed++; }
      else if (prev) keep.push(prev);
      return;
    }
    const prevItems = {}; arr(prev && prev.items).forEach(function(i){ if (i && i.id) prevItems[i.id] = i; });
    const sameDay = prev && prev.planDay === day;
    const items = pl.items.map(function(i){
      const iid = id + '_' + hash(i.key), was = prevItems[iid];
      const carried = !!(was && !was.done && !sameDay) || !!(was && was.carried && sameDay);
      return { id: iid, label: i.label + (carried ? ' (carried over)' : ''), done: !!(sameDay && was && was.done), go: i.go || null, cat: i.cat, carried: carried || undefined };
    });
    const rec = Object.assign({}, prev && !prev.deleted ? prev : {}, {
      id: id, kind: PLAN_KIND, label: "📅 Today's plan — " + niceDay(day), assignees: [email], assignee: pl.name, personal: true, shared: false,
      due: day, planDay: day, prio: 'high', addedBy: 'CRM (nightly plan)', addedAt: (prev && prev.addedAt) || now, updatedAt: now,
      done: items.length > 0 && items.every(function(x){ return x.done; }), deleted: false, note: pl.more ? '+' + pl.more + ' more in the CRM' : '', items: items
    });
    delete rec.autoDone; delete rec.doneBy;
    const sig = function(x){ return JSON.stringify([x.label, x.due, x.done, arr(x.items).map(function(i){ return [i.id, i.label, i.done]; })]); };
    if (!prev || sig(prev) !== sig(rec)) changed++;
    keep.push(rec);
  });
  return { list: keep, changed: changed };
}

module.exports = { build: build, merge: merge, people: people, central: central, planDay: planDay, isTwoAm: isTwoAm, planId: planId, skipWeekend: skipWeekend, PLAN_KIND: PLAN_KIND, hash: hash, niceDay: niceDay };
