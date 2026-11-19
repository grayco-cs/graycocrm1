'use strict';
/* patch PORTALED (owner 11/19: "If I click customer portal I'd like to open their portal and see what's in it, edit jobs, add
   jobs, tasks, scopes, whatever in the portal, add plans, addendum, ask questions, all in portal").
   The CRM's portal editor keeps four things on the job record (the CRM's own synced "projects" list; nothing new in the
   database) and portal.js buildView() hands them to the customer's page here:
     job.portalSummary     { text, at, by }                         → view.job.summary   ("About your project")
     job.portalTasks       [{ id, text, due, done, doneAt, archived }] → view.checklist   ("Your project checklist")
     job.portalScopes      [{ id, title, text, lines[{area, work, qty, unit}], included, excluded, archived }] → view.scopes
     job.portalMilestones  [{ id, name, date, end, done, archived }] → joined to view.job.steps ("Your schedule")
   Rules (the customer's page is the ONLY reader):
     · archived / hidden rows are never sent (they stay on the job: archive, never delete);
     · never a price, a cost, a note, who made it, or a sub — a scope line carries area / work / qty / unit only;
     · the text staff typed is cleaned: any GrayCo Portal / sub-portal / bid-site link is taken out (a sub's link has the same
       shape as a customer's, so no portal link at all), the job's subs' names become "our trade partner", and the insurance
       carrier words (the job's carrier, its claims' carriers, the common carriers) become "your insurance company" — the owner
       rule: a carrier's name is never shown to a customer. portal.js scrubs the whole view once more after this. */
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function ymd(v){ const t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; }
function rx(w){ return w instanceof RegExp ? new RegExp(w.source, 'gi') : new RegExp(s(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']*(?:[#?&](?:t|s|h|g)=|\/subportal|portal-app|bids\.grayco|portal\.grayco)[^\s<>"']*/gi;
const BARE = /\bportal\.grayco-cs\.com\/?[^\s<>"']*/gi;
function subWords(p){
  const out = [];
  arr(p && p.subs).forEach(function(r){ if (!r) return; [r.name, r.sub, r.vendor, r.company, r.subName].forEach(function(v){ v = s(v); if (v.length >= 4) out.push(v); }); });
  return out;
}
function cleaner(p, carrier){
  const subs = subWords(p).map(rx), car = arr(carrier).filter(function(w){ return w instanceof RegExp || s(w).length >= 3; }).map(rx);
  return function(t, n){
    t = s(t).replace(LINK, '[link removed]').replace(BARE, '[link removed]');
    subs.forEach(function(r){ t = t.replace(r, function(m){ const off = arguments[arguments.length - 2], before = t.slice(0, off); return /(^|[.!?]\s+)$/.test(before) ? 'Our trade partner' : 'our trade partner'; }); });
    car.forEach(function(r){ t = t.replace(r, function(m){ const off = arguments[arguments.length - 2], before = t.slice(0, off); return /(^|[.!?]\s+)$/.test(before) ? 'Your insurance company' : 'your insurance company'; }); });
    return clip(t, n);
  };
}
function live(l){ return arr(l).filter(function(x){ return x && typeof x === 'object' && x.archived !== true && x.hidden !== true && x.deleted !== true; }); }
function num(v){ if (v === '' || v == null) return ''; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : ''; }
/* what the customer's page gets from the editor's fields */
function build(p, carrier){
  p = p || {};
  const c = cleaner(p, carrier);
  const sum = p.portalSummary && typeof p.portalSummary === 'object' ? p.portalSummary.text : p.portalSummary;
  const tasks = live(p.portalTasks).slice(0, 80).map(function(t){ return { id: clip(t.id, 40), text: c(t.text, 300), due: ymd(t.due), done: t.done === true, doneAt: t.done === true ? ymd(t.doneAt) : '' }; })
    .filter(function(t){ return t.text; })
    .sort(function(a, b){ if (a.done !== b.done) return a.done ? 1 : -1; return (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0; });
  const scopes = live(p.portalScopes).slice(0, 20).map(function(x){
    return { id: clip(x.id, 40), title: c(x.title, 120) || 'Scope of work', text: c(x.text, 4000),
      lines: arr(x.lines).slice(0, 200).map(function(l){ return { area: c(l && (l.area || l.section || l.room), 80), work: c(l && (l.work || l.desc), 300), qty: num(l && l.qty), unit: c(l && l.unit, 20) }; }).filter(function(l){ return l.work || l.area; }),
      included: c(x.included, 2000), excluded: c(x.excluded, 2000) };
  }).filter(function(x){ return x.text || x.lines.length || x.included || x.excluded; });
  const miles = live(p.portalMilestones).slice(0, 40).map(function(m){ return { name: c(m.name, 90), date: ymd(m.date), end: ymd(m.end), done: m.done === true }; }).filter(function(m){ return m.name; });
  return { summary: c(sum, 3000), tasks: tasks, scopes: scopes, milestones: miles };
}
/* into the view portal.js made (before its own scrub): the summary, the checklist, the scopes; the milestones join the schedule steps */
function attach(view, p, carrier){
  if (!view || !view.job) return view;
  const x = build(p, carrier);
  if (x.summary) view.job.summary = x.summary;
  view.checklist = x.tasks;
  view.scopes = x.scopes;
  if (x.milestones.length) {
    const t = new Date(Date.now()).toISOString().slice(0, 10);
    const steps = arr(view.job.steps).map(function(y){ const o = Object.assign({}, y); delete o.now; return o; })
      .concat(x.milestones.map(function(m){ const e = m.end || m.date; return { name: m.name, date: m.date, end: m.end, done: m.done || (!!e && e < t) }; }));
    steps.sort(function(a, b){ return (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : 0; });
    const i = steps.findIndex(function(y){ return !y.done; }); if (i >= 0) steps[i].now = true;
    view.job.steps = steps;
  }
  return view;
}
module.exports = { build: build, attach: attach, LINK: LINK };
