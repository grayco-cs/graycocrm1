// netlify/functions/plan-nightly.js — patch PLAN: every night at 2 AM Central each person's To-Do gets
// "📅 Today's plan — <day>": the things they can do that day in the CRM, by role (_lib/plan.js builds it).
//
//   The schedule is plan-scheduled.js (netlify.toml: 07:00 and 08:00 UTC; only the run that lands on 2 AM Central
//   acts, CDT or CST) — a scheduled function cannot be called by its URL in production, so this one has no schedule.
//   Calls (Bearer = a CRM sign-in; only a gc_staff admin may run it, anyone else previews only their own plan):
//     POST { run: true }                  → build and write everyone's plan now
//     POST { dry: true, email?: '…' }     → the plans it would write (nothing is changed)
//   The optional 6 AM e-mail summary is a per-person choice (gc_kv "gc_plan_prefs" { email: { email: true } }),
//   off for everybody until a person turns it on in My Profile; plan-scheduled sends it from the 11:00 / 12:00 UTC runs.
//   PLAN_OFF=1 turns the whole thing off.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const portal = require('./portal.js');
const PLAN = require('./_lib/plan.js');
const C = portal._core;
const PREFS = 'gc_plan_prefs';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function site(){ return (process.env.CRM_URL || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }

/* the deps a test can swap */
const D = {
  now: function(){ return Date.now(); },
  staff: async function(){
    try { const r = await fetch(C.sbUrl() + '/rest/v1/gc_staff?select=email,name,role,profile,active', { headers: C.keyHeaders(C.svcKey()) }); if (r.ok) return arr(await r.json()); } catch (e) {}
    try { const r = await fetch(C.sbUrl() + '/rest/v1/gc_staff?select=email,name,role,active', { headers: C.keyHeaders(C.svcKey()) }); if (r.ok) return arr(await r.json()); } catch (e) {}
    return [];
  },
  kv: function(keys){ return C.kvRead(keys); },
  crm: function(){ return C.crmData(true); },
  svc: async function(key){ try { return await require('./bid-inbox.js')._lib.kvGet(key); } catch (e) { return null; } },
  listUpdate: function(key, fn){ return C.kvListUpdate(key, fn); },
  mail: async function(o){
    const key = s(process.env.RESEND_API_KEY); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
    try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(o) }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, why: 'no answer' }; }
  }
};
function owners(){ return (process.env.OWNER_EMAILS || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').map(low).filter(Boolean); }

async function gather(){
  const data = await D.crm();
  const more = await D.kv(['schedule', 'gc_orders', 'gc_approval_queue', 'gc_office_tasks', 'gc_warranty_tickets', 'gc_equipment', 'users', PREFS, 'gc_sitebook', 'gc_job_inspections']);   /* patch AUTOCLAIMS: + Site Book, job inspections */
  const staff = await D.staff();
  const needs = arr(await D.svc('gc_cust_needs')), subbids = arr(await D.svc('gc_sub_bids_email'));
  let head = '';
  try { const setv = obj(await D.svc('gc_lead_inbox_settings')); const est = require('./_lib/estimator.js').decide(staff.concat(arr(data.users || more.users)), setv.estimator || null); head = low(est && est.email); } catch (e) {}
  const src = Object.assign({}, data, {
    users: arr(data.users).length ? data.users : more.users, staff: staff, schedule: more.schedule, gc_orders: more.gc_orders,
    gc_approval_queue: more.gc_approval_queue, gc_office_tasks: more.gc_office_tasks, gc_warranty_tickets: more.gc_warranty_tickets,
    gc_equipment: more.gc_equipment, gc_cust_needs: needs, gc_sub_bids_email: subbids, gc_sitebook: more.gc_sitebook, gc_job_inspections: more.gc_job_inspections
  });
  return { src: src, head: head, prefs: obj(more[PREFS]) };
}

async function runPlan(o){
  o = o || {};
  const now = D.now();
  if (!o.force && !PLAN.isTwoAm(now)) return { notNow: true };
  if (s(process.env.PLAN_OFF) === '1' && !o.force) return { off: true };
  const g = await gather();
  const built = PLAN.build(g.src, { now: now, owners: owners(), headEstimator: g.head });
  if (o.dry) {
    const one = low(o.email);
    const plans = one ? (built.plans[one] ? { [one]: built.plans[one] } : {}) : built.plans;
    return { day: built.day, dry: true, plans: plans };
  }
  let changed = 0;
  const r = await D.listUpdate('gc_office_tasks', function(l){
    const m = PLAN.merge(l, built, { nowIso: new Date(now).toISOString() });
    changed = m.changed;
    if (!m.changed) return null;
    const ids = {}; m.list.forEach(function(t){ if (t && t.kind === PLAN.PLAN_KIND) ids[t.id] = t.updatedAt; });
    return { list: m.list, check: function(a){ return Object.keys(ids).every(function(id){ return a.some(function(t){ return t && t.id === id && t.updatedAt === ids[id]; }); }); } };
  });
  return { ok: r.ok !== false, day: built.day, people: Object.keys(built.plans).length, items: Object.keys(built.plans).reduce(function(a, k){ return a + built.plans[k].items.length; }, 0), changed: changed, error: r.error };
}

/* ── the optional 6 AM summary e-mail (off unless the person turned it on) ── */
async function runMail(o){
  o = o || {};
  const now = D.now(), c = PLAN.central(new Date(now));
  if (!o.force && c.hour !== 6) return { notNow: true };
  const g = await gather();
  const list = arr(g.src.gc_office_tasks).filter(function(t){ return t && t.kind === PLAN.PLAN_KIND && !t.deleted && t.planDay === c.ymd; });
  let sent = 0;
  for (const t of list) {
    const email = low(arr(t.assignees)[0]); if (!email || !(obj(g.prefs[email]).email === true)) continue;
    const open = arr(t.items).filter(function(i){ return !i.done; }); if (!open.length || t.mailed === c.ymd) continue;
    /* claim the e-mail on the record first, so a second run the same morning never sends it twice */
    const claim = await D.listUpdate('gc_office_tasks', function(l){
      const x = l.find(function(r){ return r && r.id === t.id; }); if (!x || x.mailed === c.ymd) return null;
      x.mailed = c.ymd;
      return { list: l, result: true, check: function(a){ return a.some(function(r){ return r && r.id === t.id && r.mailed === c.ymd; }); } };
    });
    if (!claim || claim.ok === false || claim.result !== true) continue;
    const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(t.label) + '</div><div style="padding:6px 18px 18px"><ul>' +
      open.map(function(i){ return '<li style="margin:4px 0">' + esc(i.label) + '</li>'; }).join('') + '</ul><p><a href="' + site() + '/#todo" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open my To-Do</a></p>' +
      '<p style="color:#777;font-size:12px">You get this because "E-mail me my plan" is on in My Profile.</p></div></div>';
    const subject = require('./_lib/mailtag.js').tag(t.label + ' — ' + open.length + ' thing' + (open.length > 1 ? 's' : ''), [email], 'area:CRM');
    const r = await D.mail({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: [email], subject: subject, html: html, headers: { 'X-GrayCo-CRM': 'daily-plan' } });
    if (r.ok) sent++;
  }
  return { sent: sent };
}

async function whoIs(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim()); if (!m) return null;
  try {
    const r = await fetch(C.sbUrl() + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON, Authorization: 'Bearer ' + m[1] } }); if (!r.ok) return null;
    const email = low((await r.json()).email); if (!email) return null;
    const q = await fetch(C.sbUrl() + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: C.keyHeaders(C.svcKey()) });
    const row = q.ok ? ((await q.json()) || [])[0] : null;
    return row && row.active !== false ? { email: email, admin: low(row.role) === 'admin' } : null;
  } catch (e) { return null; }
}

exports.handler = async function(event){
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) {}
  if (!C.svcKey()) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  const who = await whoIs(event);
  if (!who) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Sign in first.' }) };
  /* anyone may preview their own plan; admins any plan, and only admins may write */
  if (b.dry) {
    const email = who.admin ? low(b.email) : who.email;
    const rep = await runPlan({ force: true, dry: true, email: email });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: rep }) };
  }
  if (!who.admin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  const rep = await runPlan({ force: true });
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report: rep }) };
};
exports._run = { plan: runPlan, mail: runMail };
exports._test = { D: D, runPlan: runPlan, runMail: runMail, gather: gather };
