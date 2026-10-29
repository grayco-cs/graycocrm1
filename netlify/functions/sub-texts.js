// netlify/functions/sub-texts.js — patch SUBTXT: 📱 schedule texts for subs (the rules are in _lib/subtxt.js).
//   GET  ?list=1          → staff: every sub with its switch, the number texts go to, and whether texting is set up
//   POST ?set=1           → staff: { subId, on, phone? } — turn schedule texts on / off for one sub (the switch is the
//                           approval for these operational texts)
//   GET  ?confirm=1[&pid=] → staff: today's and tomorrow's confirmations (✓ Confirmed / waiting / ⚠ problem)
//   POST ?run=1           → admins: run the clock now ({ force } ignores nothing — the same checks as the schedule)
// The clock is sub-texts-scheduled.js (every 15 minutes). Replies come in through missed-call.js?event=sms → handleReply;
// the sub portal's "Can't make it / running late" comes in through portal-access.js (p-late) → portalLate.
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const U = require('./_lib/subtxt.js');
const s = U.s, low = U.low, arr = U.arr, clip = U.clip;
function env(k){ return s(process.env[k]); }
function L(){ return require('./bid-inbox.js')._lib; }
function T(){ return require('./bid-inbox.js')._test; }
function MC(){ return require('./missed-call.js')._test; }
function core(){ return require('./portal.js')._core; }
function now(){ return typeof exports._now === 'function' ? exports._now() : Date.now(); }
function nowIso(){ return new Date(now()).toISOString(); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function J(code, body, extra){ return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(body) }; }
function cors(event){
  const allowed = (env('SITE_ORIGIN') || 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
  const h = (event && event.headers) || {}, k = Object.keys(h).find(x => x.toLowerCase() === 'origin'), origin = s(k ? h[k] : '').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
async function getSettings(){ try { return U.settings(await L().kvGet(U.SETTINGS_KEY)); } catch (e) { return U.settings(null); } }
async function getState(){ try { return U.loadState(await L().kvGet(U.STATE_KEY)); } catch (e) { return U.loadState(null); } }
async function patchState(fn){ return L().kvCas(U.STATE_KEY, v => { const st = U.prune(U.loadState(v), now()); const r = fn(st); return r === undefined ? undefined : st; }); }
async function paused(){ try { return await require('./_lib/pause').isPaused(); } catch (e) { return true; } }
async function crm(){ try { return await core().kvRead(['projects', 'schedule', 'subs', 'vendors', 'users', 'gc_deleted_projects', 'gc_senior_pm']); } catch (e) { return {}; } }

/* ── telling the PM: phone push + a 🔴 ASAP To-Do + an e-mail (office copied) + the job's messages + the sub's portal thread ── */
async function alertPm(rec, words, how, data){
  data = data || await crm();
  const at = nowIso(), p = arr(data.projects).find(x => s(x.id) === s(rec.pid)) || { id: rec.pid, name: rec.job, pm: rec.pm };
  let pm = null; try { pm = core().pmOf(data, p); } catch (e) {}
  let office = []; try { office = core().officeEmails(data) || []; } catch (e) {}
  const noShow = how === 'noshow';   /* patch AUTOC 2 */
  const noReply = how === 'noreply' || noShow;
  const head = noShow ? '🚨 ' + rec.sub + ' has not checked in' : noReply ? '⏰ ' + rec.sub + ' hasn\'t confirmed' : '⚠️ ' + rec.sub + ': "' + clip(words, 120) + '"';
  const line = (noShow ? rec.sub + ' has not checked in at ' : noReply ? rec.sub + ' has not answered the schedule text for ' : rec.sub + (how === 'portal' ? ' (sub portal)' : ' (text)') + ' about ') + (rec.job || 'the job') + ' — ' + U.dayWord(rec.day) + ' ' + U.hhmm(rec.start) + (rec.title ? ' (' + rec.title + ')' : '') + '.' + (noShow ? ' (No-show alert: no portal check-in, no "here" text, nobody marked the crew arrived.)' : '');
  const out = {};
  const id = 'subalert_' + crypto.createHash('sha1').update(rec.key + '|' + how + '|' + (noReply ? '' : clip(words, 200))).digest('hex').slice(0, 20);
  const task = { id, kind: 'sub_alert', label: head + ' — ' + (rec.job || ''), note: line + (noReply ? '' : '\n\nThey said: ' + clip(words, 1200)) + (rec.phone ? '\n📞 ' + U.tidy(rec.phone) : ''),
    assignees: pm && pm.email ? [low(pm.email)] : [], urgency: 'asap', priority: 'asap', pid: s(rec.pid), addedBy: 'Sub schedule texts', addedAt: at, createdAt: at, updatedAt: at, done: false };
  const has = l => l.some(t => t && s(t.id) === id);
  try { out.todo = (await core().kvListUpdate('gc_office_tasks', l => has(l) ? null : { list: l.concat([task]), check: has })).ok; } catch (e) { out.todo = false; }
  if (pm && pm.email) { try { out.push = await core().pushTo([low(pm.email)], { title: head, body: line, tag: id }); } catch (e) {} }
  if (noShow) out.pmText = await pmText(pm, data, head + ' — ' + (rec.job || '') + ' ' + U.hhmm(rec.start) + '. ' + site() + '/?jobmsg=' + encodeURIComponent(s(rec.pid)));
  if (!noReply) {
    const mid = 'SUBT_' + id;
    const msg = { id: mid, pid: s(rec.pid), authorId: 'sub:' + s(rec.subId), authorName: (how === 'portal' ? '🧰 ' : '📱 ') + rec.sub + (how === 'portal' ? ' (sub portal)' : ' (text)'), text: clip(words, 1600), tags: [], at, source: how === 'portal' ? 'subportal' : 'sms', channel: how === 'portal' ? 'subportal' : 'sms', dir: 'in' };
    const hasM = l => l.some(m => m && s(m.id) === mid);
    try { await core().kvListUpdate('gc_job_messages', l => hasM(l) ? null : { list: l.concat([msg]), check: hasM }); } catch (e) {}
    if (how === 'sms') {   /* the text also lands in that sub's thread in the sub portal (never a customer's) */
      try { await require('./portal-access.js')._core.msgInsert(s(rec.pid), 's:' + s(rec.subId), 'them', rec.sub + ' (text)', '📱 ' + clip(words, 3900), []); out.thread = true; } catch (e) { out.thread = false; }
    }
  }
  const key = env('RESEND_API_KEY'), to = Array.from(new Set([pm && pm.email].concat(office).map(low).filter(x => /@grayco-cs\.com$/.test(x))));
  if (key && to.length) {
    const link = site() + '/?jobmsg=' + encodeURIComponent(s(rec.pid));
    const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:' + (noReply ? '#b45309' : '#b91c1c') + ';color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + U.esc(head) + '</div><div style="padding:6px 18px 18px">'
      + '<p>' + U.esc(line) + '</p>' + (noReply ? '' : '<blockquote style="border-left:3px solid #d4a017;margin:0;padding:6px 12px;white-space:pre-wrap">' + U.esc(clip(words, 1600)) + '</blockquote>')
      + (rec.phone ? '<p>📞 ' + U.esc(U.tidy(rec.phone)) + '</p>' : '') + '<p><a href="' + U.esc(link) + '" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open the job in the CRM</a></p></div></div>';
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env('SMS_RELAY_FROM') || 'GrayCo Texts <leads@grayco-cs.com>', reply_to: env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com', to, subject: head + ' — ' + (rec.job || ''), html, text: head + '\n\n' + line + (noReply ? '' : '\n\n' + words), headers: { 'X-GrayCo-CRM': 'sub-texts' } }) });
      out.mail = r.ok;
    } catch (e) { out.mail = false; }
  }
  return out;
}

/* patch AUTOC 2: the no-show text to the PM's own cell (their CRM people record) — staff, so no consent needed;
   never in data-entry mode (the pause guard skips Twilio anyway), never to a number that texted STOP */
async function pmText(pm, data, text){
  if (!pm) return { ok: false, why: 'no PM' };
  const u = arr(data && data.users).find(x => low(x.email) === low(pm.email) || low(x.name) === low(pm.name)) || {};
  const ph = U.phone10(u.cell || u.mobile || u.cellPhone || u.phone || pm.phone); if (ph.length !== 10) return { ok: false, why: 'no PM cell' };
  if (await paused()) return { ok: false, why: 'data-entry mode' };
  try { const st = await MC().stateGet(); if (st && st.optout && st.optout[ph]) return { ok: false, why: 'STOP' }; } catch (e) {}
  if (!MC().ready()) return { ok: false, why: 'texting not set up' };
  const from = env('TWILIO_FROM_ALERTS') || env('TWILIO_FROM');
  try { const r = await MC().sendSms(ph, 'GrayCo: ' + clip(text, 280), from); return { ok: !!(r && r.ok) }; } catch (e) { return { ok: false, why: 'Twilio' }; }
}

/* ── the clock ── */
async function run(opts){
  opts = opts || {};
  const set = await getSettings();
  if (!Object.keys(set.subs).some(k => set.subs[k].on || set.subs[k].noShow)) return { skipped: 'no sub has schedule texts or the no-show alert on' };
  const data = await crm(), st = await getState(), list = U.due(data, set, st, now());
  const out = { due: list.length, sent: 0, alerts: 0, skipped: [] };
  if (!list.length) return out;
  const isPaused = await paused();
  let optout = {}; try { optout = (await MC().stateGet()).optout || {}; } catch (e) {}
  for (const d of list) {
    if (d.kind === 'noreply') {
      await patchState(st2 => { const r = st2.rows[d.key]; if (!r || r.noReplyAt || r.status !== 'sent') return undefined; r.noReplyAt = nowIso(); return true; });
      await alertPm(Object.assign({ key: d.key }, d.rec), '', 'noreply', data); out.alerts++; continue;
    }
    if (d.kind === 'noshow') {   /* patch AUTOC 2: claim, tell the PM (always), then ONE text to the sub (when allowed) */
      let mine = false;
      await patchState(st2 => { const r = st2.rows[d.key] = Object.assign({}, d.rec, st2.rows[d.key] || {}); if (r.nsAt) return undefined; r.nsAt = nowIso(); if (!r.status) r.status = 'sent'; mine = true; return true; });
      if (!mine) continue;
      out.noShow = (out.noShow || 0) + 1;
      await alertPm(Object.assign({ key: d.key }, d.rec), '', 'noshow', data);
      if (!d.text || !d.rec.phone) continue;
      if (isPaused) { out.skipped.push(d.key + ': data-entry mode'); continue; }
      if (optout[d.rec.phone]) { out.skipped.push(d.key + ': STOP'); continue; }
      if (!MC().ready()) { out.skipped.push(d.key + ': texting not set up'); continue; }
      let subFrom0 = ''; try { const S0 = require('./_lib/sms.js'); subFrom0 = require('./_lib/smsroute.js').fromFor('subs', S0.settings(await L().kvGet(S0.SETTINGS_KEY)), env); } catch (e) {}
      const r0 = await MC().sendSms(d.rec.phone, d.text, subFrom0);
      if (r0 && r0.ok) out.sent++; else out.skipped.push(d.key + ': Twilio ' + ((r0 && (r0.status || r0.why)) || 'failed'));
      continue;
    }
    if (isPaused) { out.skipped.push(d.key + ': data-entry mode'); continue; }
    if (optout[d.rec.phone]) { out.skipped.push(d.key + ': STOP'); continue; }
    if (!U.quietOk(d.kind, now())) { out.skipped.push(d.key + ': quiet hours'); continue; }
    if (!MC().ready()) { out.skipped.push(d.key + ': texting not set up'); continue; }
    /* mark first (a second run at the same moment then finds it taken), send, and undo the mark if Twilio said no */
    let mine = false;
    await patchState(st2 => { const r = st2.rows[d.key] = Object.assign({}, d.rec, st2.rows[d.key] || {}); const f = d.kind === 'evening' ? 'eveAt' : 'mornAt'; if (r[f]) return undefined; r[f] = nowIso(); if (!r.status || r.status === 'sent') r.status = 'sent'; mine = true; return true; });
    if (!mine) continue;
    /* patch SMSROUTE: from the Subs number (TWILIO_FROM_SUBS / Admin → 💬 Our numbers), else the default */
    let subFrom = ''; try { const S0 = require('./_lib/sms.js'); subFrom = require('./_lib/smsroute.js').fromFor('subs', S0.settings(await L().kvGet(S0.SETTINGS_KEY)), env); } catch (e) {}
    const r = await MC().sendSms(d.rec.phone, d.text, subFrom);
    if (r.ok) {
      out.sent++;
      const mid = 'SUBTO_' + crypto.createHash('sha1').update(d.key + '|' + d.kind).digest('hex').slice(0, 16), has = l => l.some(x => x && s(x.id) === mid);
      const msg = { id: mid, pid: d.rec.pid, authorId: 'sms:auto', authorName: '🤖 GrayCo schedule text → ' + d.rec.sub, text: d.text, tags: [], at: nowIso(), source: 'sms', channel: 'sms', dir: 'out', smsTo: d.rec.phone };
      try { await core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has }); } catch (e) {}
    } else {
      await patchState(st2 => { const x = st2.rows[d.key]; if (!x) return undefined; delete x[d.kind === 'evening' ? 'eveAt' : 'mornAt']; return true; });
      out.skipped.push(d.key + ': Twilio ' + (r.status || r.why || 'failed'));
    }
  }
  return out;
}

/* ── a text in from a number we sent a schedule text to (missed-call.js) → { handled } ── */
async function handleReply(ph, body, at){
  ph = U.phone10(ph); if (ph.length !== 10) return { handled: false };
  const st = await getState(), open = U.openFor(st, ph, now());
  if (!open) return hereText(ph, body, at);   /* patch AUTOC 2: "here" from a no-show-alert sub with no open text = a check-in */
  if (U.isYes(body)) {
    await patchState(st2 => { const r = st2.rows[open.key]; if (!r) return undefined; r.status = 'confirmed'; r.confirmedAt = at || nowIso(); if (r.subId && (r.nsAt || r.mornAt || U.HERE.test(s(body)))) { st2.checkins[r.subId + '|' + U.central(now()).ymd] = { at: at || nowIso(), via: 'text', pid: r.pid }; } return true; });
    return { handled: true, confirmed: true, key: open.key };
  }
  await patchState(st2 => { const r = st2.rows[open.key]; if (!r) return undefined; r.status = 'issue'; r.issueAt = at || nowIso(); r.reply = clip(body, 600); return true; });
  const a = await alertPm(open, body, 'sms');
  return { handled: true, issue: true, key: open.key, alert: a };
}
/* patch AUTOC 2: a check-in (sub portal "📍 I'm here", or a "here" text) — one per sub and day */
async function checkIn(subId, pid, via, at){
  const day = U.central(now()).ymd, k = s(subId) + '|' + day; let first = false;
  await patchState(st2 => { if (st2.checkins[k]) return undefined; st2.checkins[k] = { at: at || nowIso(), via: s(via), pid: s(pid) }; first = true; return true; });
  return { ok: true, day, first };
}
async function hereText(ph, body, at){
  if (!U.HERE.test(s(body))) return { handled: false };
  const set = await getSettings(), data = await crm();
  const subs = arr(data.subs).concat(arr(data.vendors)).filter(x => x && x.id && (set.subs[s(x.id)] || {}).noShow && U.subPhone(x, set) === ph);
  if (!subs.length) return { handled: false };
  for (const sb of subs) await checkIn(sb.id, '', 'text', at);
  return { handled: true, confirmed: true, checkin: true, key: 'checkin|' + s(subs[0].id) };
}
/* ── the sub portal's "Can't make it / running late" (portal-access.js p-late; the sub is already checked there) ── */
async function portalLate(sub, p, b){
  const kind = ({ cant: 'Can\'t make it', late: 'Running late', other: 'Message' })[s(b.kind)] || 'Message';
  const words = (kind !== 'Message' ? kind + (s(b.text) ? ': ' : '') : '') + clip(b.text, 1200);
  if (!s(words)) return { ok: false, error: 'Type what is going on.' };
  const day = U.ymd(b.day) || U.central(now()).ymd;
  const st = await getState();
  const key = Object.keys(st.rows).find(k => st.rows[k].subId === s(sub.id) && st.rows[k].pid === s(p.id) && st.rows[k].day === day) || ('portal|' + s(sub.id) + '|' + s(p.id) + '|' + day);
  const base = st.rows[key] || { subId: s(sub.id), sub: s(sub.company || sub.name), pid: s(p.id), job: s(p.name), day, start: U.parseTime(b.time) == null ? U.parseTime(U.DEFAULT_START) : U.parseTime(b.time), title: clip(b.title, 80), phone: U.phone10(sub.phone) };
  await patchState(st2 => { const r = st2.rows[key] = Object.assign({}, base, st2.rows[key] || {}); r.status = 'issue'; r.issueAt = nowIso(); r.reply = clip(words, 600); r.via = 'portal'; return true; });
  const a = await alertPm(Object.assign({ key }, base), words, 'portal');
  return { ok: true, words, alert: a };
}

exports.handler = async function(event){
  event = event || {};
  const C = cors(event), qs = event.queryStringParameters || {}, m = s(event.httpMethod).toUpperCase();
  if (m === 'OPTIONS') return J(200, {}, C);
  const who = await T().staffAuth(event); if (!who.ok) return J(who.code || 401, { ok: false, error: who.error }, C);
  try {
    if (m === 'GET' && qs.list) {
      const set = await getSettings(), data = await crm();
      const subs = arr(data.subs).concat(arr(data.vendors)).filter(x => x.id && x.deleted !== true).map(x => { const c = set.subs[s(x.id)] || {}; return { id: s(x.id), name: s(x.company || x.name), on: c.on === true, noShow: c.noShow === true, phone: U.subPhone(x, set) }; });
      return J(200, { ok: true, ready: MC().ready(), subs }, C);
    }
    if (m === 'POST' && qs.set) {
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      const id = s(b.subId); if (!/^[A-Za-z0-9_.:-]{1,90}$/.test(id)) return J(400, { ok: false, error: 'Bad sub id.' }, C);
      const ph = U.phone10(b.phone); if (b.phone != null && s(b.phone) && ph.length !== 10) return J(400, { ok: false, error: 'A 10-digit mobile number is needed.' }, C);
      let saved = null;
      await L().kvCas(U.SETTINGS_KEY, v => { const set = U.settings(v); const cur = set.subs[id] || {}; set.subs[id] = Object.assign({}, cur, { on: b.on === true, phone: ph || cur.phone || '', by: low(who.email), at: nowIso() }); saved = set.subs[id]; return set; });
      return J(200, { ok: true, sub: Object.assign({ id }, saved) }, C);
    }
    if (m === 'POST' && qs.noshow) {   /* patch AUTOC 2: { subId, on } — the no-show alert switch (default off) */
      let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return J(400, { ok: false, error: 'Not JSON.' }, C); }
      const id = s(b.subId); if (!/^[A-Za-z0-9_.:-]{1,90}$/.test(id)) return J(400, { ok: false, error: 'Bad sub id.' }, C);
      let saved = null;
      await L().kvCas(U.SETTINGS_KEY, v => { const set = U.settings(v); const cur = set.subs[id] || { on: false, phone: '' }; set.subs[id] = Object.assign({}, cur, { noShow: b.on === true, nsBy: low(who.email), nsAt: nowIso() }); saved = set.subs[id]; return set; });
      return J(200, { ok: true, sub: Object.assign({ id }, saved) }, C);
    }
    if (m === 'GET' && qs.confirm) {
      const st = await getState(), c = U.central(now()), days = [c.ymd, U.central(now() + 86400000).ymd];
      const pid = s(qs.pid);
      const rows = Object.keys(st.rows).map(k => Object.assign({ key: k }, st.rows[k])).filter(r => days.indexOf(r.day) > -1 && (!pid || r.pid === pid))
        .map(r => ({ key: r.key, sub: r.sub, subId: r.subId, pid: r.pid, job: r.job, day: r.day, time: U.hhmm(r.start), title: r.title, status: r.status || 'sent', reply: r.reply || '', confirmedAt: r.confirmedAt || '', issueAt: r.issueAt || '', noReply: !!r.noReplyAt }));
      return J(200, { ok: true, rows }, C);
    }
    if (m === 'POST' && qs.run) {
      if (!who.admin) return J(403, { ok: false, error: 'Admins only.' }, C);
      return J(200, { ok: true, report: await run({}) }, C);
    }
    return J(400, { ok: false, error: 'Unknown request.' }, C);
  } catch (e) { return J(500, { ok: false, error: s(e && e.message) || 'Something went wrong.' }, C); }
};
exports._lib = { run, handleReply, portalLate, alertPm, getSettings, getState, checkIn, hereText, pmText };
