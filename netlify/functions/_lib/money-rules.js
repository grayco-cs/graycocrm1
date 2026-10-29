/* netlify/functions/_lib/money-rules.js — patch AUTOMONEY: the server side of the owner's three money rules (10/29).
   The rules themselves are in ./money-core.js (the same file runs in the CRM page).
     1. DEPOSIT BEFORE SCHEDULING — the CRM page blocks crew / sub days on a job whose deposit is not paid (job type
        setting ⚡ Automation defaults → "💰 Deposit before scheduling": on for residential, off for insurance /
        commercial / program). The job's PM (or an admin) may press "Schedule anyway — reason": recorded here
        (gc_kv "gc_deposit_overrides"), a To-Do note for the office and each admin, a phone push to them, and a line in
        the next 7 AM digest e-mail (auto-digest.js → digestNotes()).
     2. SUB LIEN WAIVERS — see ./lien.js (requiredFor) and money-core.js (payHold).
     3. JOB PROFIT ALERT — the CRM page computes each open job's costs vs its budget (patch DEPTH2's job costing) and
        reports a crossing here; this file claims it ONCE per job and level (gc_autowins_log marker), then pushes and
        e-mails the job's PM and the admins, and keeps the notice for the job page (gc_kv "gc_profit_alerts").
        Levels: ⚙ Admin → 💰 Money rules (gc_kv "gc_money_rules" { warnPct: 80, overPct: 100 }).
   Staff only: nothing here goes to a customer or a sub. */
'use strict';
const A = require('./auto-common.js');
const MC = require('./money-core.js');
const { s, low, num, arr, esc, clip, usd0, staffEmail } = A;
const SET_KEY = 'gc_money_rules', OVR_KEY = 'gc_deposit_overrides', PROF_KEY = 'gc_profit_alerts';

function sbUrl(){ return (process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svc(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function H(extra){ const k = svc(); return Object.assign(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }, { 'Content-Type': 'application/json' }, extra || {}); }

async function settings(){
  let v = null; try { v = (await A.core().kvRead([SET_KEY]))[SET_KEY]; } catch (e) {}
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  v = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const L = MC.levels(v);
  return { warnPct: L[0], overPct: L[1], updatedAt: s(v.updatedAt), by: s(v.by) };
}
async function saveSettings(b, who){
  const w = Math.round(num(b.warnPct)), o = Math.round(num(b.overPct));
  if (!(w >= 10 && w <= 300) || !(o >= 10 && o <= 300) || w >= o) return { ok: false, error: 'The first alert must be lower than the second (for example 80 and 100).' };
  const next = { warnPct: w, overPct: o, updatedAt: new Date().toISOString(), by: s(who && (who.name || who.email)) };
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key: SET_KEY, value: JSON.stringify(next), updated_at: next.updatedAt }) });
  return r.ok ? { ok: true, settings: next } : { ok: false, error: 'Not saved — try again.' };
}
async function listOf(key){ const cur = await A.core().kvListRead(key); return cur ? cur.list : []; }
async function state(){
  return { ok: true, settings: await settings(), overrides: (await listOf(OVR_KEY)).slice(-300), alerts: (await listOf(PROF_KEY)).slice(-400), since: MC.SINCE };
}
function userOf(data, who){ return arr(data.users).find(function(u){ return low(u.email) === low(who.email); }) || null; }
function pmPerson(data, p){
  const n = s(p && (p.pm || p.projectManager || p.pmName)); if (!n) return null;
  const u = arr(data.users).find(function(x){ return low(x.name) === low(n); });
  return { name: n, email: low((u && u.email) || p.pmEmail || '') };
}
function isAdmin(data, who){ if (low(who.role) === 'admin') return true; const u = userOf(data, who); return !!(u && (/^admin$/i.test(s(u.role)) || low(u.payType) === 'owner')); }

/* ── 1 · "Schedule anyway — reason" ── */
async function override(b, who){
  const C = A.core(), data = await C.crmData(true);
  const p = C.findProject(data, s(b.pid));
  if (!p) return { ok: false, status: 404, error: 'That job is not in the cloud yet — try again in a minute.' };
  const reason = MC.cleanReason(b.reason);
  if (!reason) return { ok: false, status: 400, error: 'Type the reason (a few words).' };
  const u = userOf(data, who), me = s((u && u.name) || who.name), admin = isAdmin(data, who), pm = pmPerson(data, p);
  if (!MC.canOverride({ admin: admin, me: me, pm: pm && pm.name })) return { ok: false, status: 403, error: 'Only the job’s PM (' + ((pm && pm.name) || 'no PM set') + ') or an admin can schedule before the deposit.' };
  const now = new Date().toISOString(), id = 'DOV_' + s(p.id) + '_' + Date.now().toString(36);
  const rec = { id: id, pid: s(p.id), jobName: s(p.name), po: s(p.autoPO || p.po), by: me || who.email, byEmail: low(who.email), role: admin ? 'admin' : 'pm', reason: reason, at: now, items: clip(b.what, 160) };
  const r = await C.kvListUpdate(OVR_KEY, function(l){ return { list: l.concat([rec]).slice(-500), check: function(l2){ return l2.some(function(x){ return x && x.id === id; }); } }; });
  if (!r.ok) return { ok: false, status: 502, error: 'Not saved — try again.' };
  /* the note: the office's shared To-Do + each admin's own (never the person who pressed it) */
  const label = '💰 Scheduled before the deposit — ' + (rec.po ? rec.po + ' · ' : '') + rec.jobName;
  const note = rec.by + ' (' + (admin ? 'admin' : 'PM') + ') scheduled crew / sub days with no deposit recorded. Reason: “' + reason + '”. Check the deposit invoice.';
  await A.todo('dep_ovr_' + id, label, { pid: rec.pid, by: 'CRM (deposit rule)', note: note, prio: 'normal' });
  const admins = C.adminEmails(data).filter(staffEmail).filter(function(e){ return e !== low(who.email); });
  for (const e of admins) await A.todo('dep_ovr_' + id + '_' + e, label, { pid: rec.pid, by: 'CRM (deposit rule)', note: note, email: e, prio: 'normal' });
  const office = C.officeEmails(data).filter(staffEmail).filter(function(e){ return e !== low(who.email); });
  try { await C.pushTo(admins.concat(office.filter(function(e){ return admins.indexOf(e) < 0; })), { title: label, body: clip(note, 160), tag: 'dep-ovr-' + rec.pid }); } catch (e) {}
  return { ok: true, override: rec };
}
/* lines for the 7 AM digest: overrides and profit alerts of the last 24 hours (staff e-mail only) */
async function digestNotes(now){
  now = now != null ? now : Date.now();
  const since = new Date(now - 24 * 3600e3).toISOString();
  const ov = (await listOf(OVR_KEY)).filter(function(x){ return s(x.at) >= since; });
  const al = (await listOf(PROF_KEY)).filter(function(x){ return s(x.at) >= since; });
  return {
    office: ov.map(function(x){ return '💰 ' + (x.po ? x.po + ' · ' : '') + x.jobName + ' — scheduled before the deposit by ' + x.by + ': “' + x.reason + '”'; }),
    admins: ov.map(function(x){ return '💰 ' + (x.po ? x.po + ' · ' : '') + x.jobName + ' — scheduled before the deposit by ' + x.by + ': “' + x.reason + '”'; })
      .concat(al.map(function(x){ return (x.over ? '🔴 ' : '🟠 ') + (x.po ? x.po + ' · ' : '') + x.jobName + ' — costs at ' + x.pct + '% of budget (' + usd0(x.actual) + ' of ' + usd0(x.budget) + ')'; }))
  };
}

/* ── 3 · profit alert (reported by the CRM page; claimed once per job and level) ── */
async function profit(b, who){
  const C = A.core(), data = await C.crmData(true);
  const p = C.findProject(data, s(b.pid));
  if (!p) return { ok: false, status: 404, error: 'Job not found.' };
  const set = await settings(), have = await listOf(PROF_KEY), fired = {};
  have.forEach(function(x){ if (x && s(x.pid) === s(p.id)) arr(x.mark).concat([x.level]).forEach(function(l){ fired[l] = true; }); });
  const chk = MC.profitCheck({ actual: b.actual, budget: b.budget, set: set, fired: fired });
  if (!chk.fire) return { ok: true, fired: false, pct: chk.pct };
  if (!(await A.once('profit:' + s(p.id) + ':' + chk.fire))) return { ok: true, fired: false, already: true };
  const now = new Date().toISOString(), pm = pmPerson(data, p);
  const rec = { id: 'PA_' + s(p.id) + '_' + chk.fire, pid: s(p.id), jobName: s(p.name), po: s(p.autoPO || p.po), level: chk.fire, mark: chk.mark, over: !!chk.over, pct: chk.pct,
    actual: Math.round(num(b.actual)), budget: Math.round(num(b.budget)), noEstimate: b.noEstimate === true, at: now, by: s(who && (who.name || who.email)) };
  await C.kvListUpdate(PROF_KEY, function(l){ return l.some(function(x){ return x && x.id === rec.id; }) ? null : { list: l.concat([rec]).slice(-600), check: function(l2){ return l2.some(function(x){ return x && x.id === rec.id; }); } }; });
  const to = C.adminEmails(data).filter(staffEmail); if (pm && staffEmail(pm.email) && to.indexOf(pm.email) < 0) to.push(pm.email);
  const head = (rec.over ? '🔴 Over budget' : '🟠 ' + chk.fire + '% of budget') + ' — ' + (rec.po ? rec.po + ' · ' : '') + rec.jobName;
  const body = 'Costs so far ' + usd0(rec.actual) + ' of the ' + usd0(rec.budget) + ' budget' + (rec.noEstimate ? ' (no estimate: contract less the target margin)' : '') + ' — ' + rec.pct + '%.';
  let pushed = 0; try { pushed = (await C.pushTo(to, { title: head, body: body, tag: 'profit-' + rec.pid })).sent || 0; } catch (e) {}
  const html = A.shell(head, '<p>' + esc(body) + '</p><p>Costs are job costs, sub invoices, expenses and materials posted to the job (Accounting → 📊 Job costing). PM: ' + esc((pm && pm.name) || '—') + '.</p>' +
    '<p><a href="' + esc(A.crmBase() + '/#todo') + '">Open the CRM</a></p><p style="font-size:12px;color:#55626F">Sent once per job at each level (⚙ Admin → 💰 Money rules: ' + set.warnPct + '% and ' + set.overPct + '%).</p>');
  const m = await A.staffMail(to, head + ' — GrayCo CRM', html);
  await A.todo('profit_' + rec.id, head, { pid: rec.pid, by: 'CRM (profit alert)', note: body, email: pm && staffEmail(pm.email) ? pm.email : '', name: pm && pm.name });
  return { ok: true, fired: true, alert: rec, pushed: pushed, mailed: !!m.ok };
}
module.exports = { settings, saveSettings, state, override, digestNotes, profit, SET_KEY, OVR_KEY, PROF_KEY };
