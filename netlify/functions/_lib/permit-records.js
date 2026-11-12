/* netlify/functions/_lib/permit-records.js — patch PERMITS2: building permits for Memphis / Shelby County, which has no free feed.
   (owner 11/12: a weekly office task to download Develop 901's permits, and a monthly public-records e-mail to MSCCE.)
   · weeklyTask(): every Monday one item on the shared 🏢 Office To-Do — "Download new Shelby County permits from Develop 901
     (aca-prod.accela.com/SHELBYCO) and import them into 🏗️ Permitted jobs", with the link and the steps. Once per week (its id).
   · MSCCE (Memphis & Shelby County Code Enforcement) records request — gc_lead_inbox_kv "gc_permit_mscce":
       { on: false, to: '', from, replyTo, sent: { 'YYYY-MM': { at, by, to, ok, held } }, replies: [ … ] }
     OFF and with NO recipient by default (the records address is not known yet: call 901-222-8300 to confirm it). When it is on
     and has an address, the first daily run on the 1st–10th of a month (8–9 AM Central) e-mails ONE polite request for last
     month's permit list (Excel / CSV with the contractor's name and phone). "Send now" sends it at once. Replies go to the office
     and to permits@in.grayco-cs.com — bid-inbox.js hands those to onReply(): an Office To-Do "MSCCE permit list arrived — import it".
     ⏸ Data-entry mode holds the e-mail (pause.js); it is recorded as held and tried again the next day. */
'use strict';
const A = require('./auto-common.js');
const KEY = 'gc_permit_mscce';
const DEVELOP901 = 'https://aca-prod.accela.com/SHELBYCO/Default.aspx';
const REPLY_INBOX = 'permits@in.grayco-cs.com';
const MSCCE_PHONE = '901-222-8300';
const D = {
  kvGet: function(k){ return require('../bid-inbox.js')._lib.kvGet(k); },
  kvCas: function(k, f){ return require('../bid-inbox.js')._lib.kvCas(k, f); },
  todo: function(id, label, opts){ return A.todo(id, label, opts); },
  fetch: function(u, o){ return fetch(u, o); },
  env: function(k){ return process.env[k] == null ? '' : String(process.env[k]).trim(); },
  now: function(){ return Date.now(); }
};
function s(v){ return v == null ? '' : String(v).trim(); }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function arr(v){ return Array.isArray(v) ? v : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function bare(from){ const m = /<([^>]+)>/.exec(s(from)); return s(m ? m[1] : from).toLowerCase(); }

/* ── the weekly Develop 901 office task ── */
function isoWeek(ms){
  const d = new Date(A.central(ms).ymd + 'T12:00:00Z'); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4)); const w = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}
const TASK_STEPS = '1) Open Develop 901: ' + DEVELOP901 + ' (Shelby County\'s Accela portal) → Building → Search Applications. ' +
  '2) Record type: building permits; date range: the last 7 days (issued) → Search. ' +
  '3) Download results (the small "Download results" link above the list) — it saves a CSV / Excel file. ' +
  '4) CRM → 🏗️ Permitted jobs → 📥 Import a permit list → pick the file → source "Shelby County (Develop 901)" → check the columns → Import. ' +
  'Permits already imported are skipped. Nothing is sent to anyone.';
async function weeklyTask(opts){
  opts = opts || {};
  const now = D.now(), c = A.central(now);
  if (!opts.force && c.wd !== 'Mon') return { skipped: 'not Monday' };
  const wk = isoWeek(now), id = 'permits_develop901_' + wk;
  const made = await D.todo(id, '🏗️ Download new Shelby County permits from Develop 901 and import them into 🏗️ Permitted jobs',
    { note: TASK_STEPS, by: '🏗️ Permitted jobs (every Monday, for the office manager)', prio: 'normal' });
  return { id: id, made: !!made };
}

/* ── the MSCCE monthly public-records request ── */
function defaults(){ return { on: false, to: '', from: 'GrayCo Construction Services <office@grayco-cs.com>', replyTo: 'office@grayco-cs.com', sent: {}, replies: [] }; }
function clean(v){
  const d = defaults(); v = obj(v);
  const from = s(v.from) || d.from;
  return { on: v.on === true, to: okEmail(v.to) ? s(v.to).toLowerCase() : '', from: /@grayco-cs\.com>?$/i.test(from) ? clip(from, 120) : d.from,
    replyTo: okEmail(v.replyTo) ? s(v.replyTo).toLowerCase() : d.replyTo, sent: obj(v.sent), replies: arr(v.replies).slice(-30), updatedAt: s(v.updatedAt), updatedBy: s(v.updatedBy) };
}
async function cfg(){ return clean(await D.kvGet(KEY)); }
function lastMonth(ms){
  const c = A.central(ms), y = +c.ymd.slice(0, 4), m = +c.ymd.slice(5, 7);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1, last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const name = new Date(Date.UTC(py, pm - 1, 15)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return { key: py + '-' + String(pm).padStart(2, '0'), name: name + ' ' + py, from: py + '-' + String(pm).padStart(2, '0') + '-01', to: py + '-' + String(pm).padStart(2, '0') + '-' + String(last).padStart(2, '0') };
}
function us(day){ const p = s(day).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) + '/' + p[0] : day; }
function letter(c, ms){
  const lm = lastMonth(ms == null ? D.now() : ms);
  const subject = 'Public records request — building permits issued ' + lm.name + ' (Memphis & Shelby County)';
  const text = [
    'Hello,',
    '',
    'Under the Tennessee Public Records Act (T.C.A. § 10-7-503), GrayCo Construction Services requests a list of the building permits issued by Memphis and Shelby County Code Enforcement from ' + us(lm.from) + ' through ' + us(lm.to) + '.',
    '',
    'An Excel or CSV export is perfect. If possible, please include for each permit: the permit number, issue date, permit type and work description, the job address (with ZIP), the valuation, and the contractor\'s name and phone number.',
    '',
    'If there is a fee for this, please tell us the amount before you prepare it. If this should go to a different office or address, a quick reply with the right contact would be appreciated.',
    '',
    'Thank you,',
    'GrayCo Construction Services',
    '(901) 585-0944 · ' + bare(c.replyTo || defaults().replyTo)
  ].join('\n');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14202E;max-width:640px">' + text.split('\n').map(function(l){ return l ? '<p style="margin:0 0 4px">' + esc(l) + '</p>' : '<div style="height:8px"></div>'; }).join('') + '</div>';
  return { subject: subject, text: text, html: html, month: lm.key, period: lm };
}
async function send(opts){
  opts = opts || {};
  const c = await cfg(), m = letter(c);
  if (!c.to) return { ok: false, error: 'No MSCCE records address yet — call ' + MSCCE_PHONE + ' to confirm it, then enter it.' };
  if (!opts.manual && !c.on) return { ok: false, error: 'The monthly request is off.' };
  const key = D.env('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'E-mail is not set up (RESEND_API_KEY).' };
  let r = null, body = null;
  try {
    r = await D.fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.from, to: [c.to], reply_to: [bare(c.replyTo), REPLY_INBOX], subject: m.subject, text: m.text, html: m.html, headers: { 'X-GrayCo-CRM': 'permit-records' } }) });
    try { body = await r.json(); } catch (e) { body = null; }
  } catch (e) { return { ok: false, error: 'E-mail did not answer.' }; }
  const held = !!(body && body.paused);   /* ⏸ data-entry mode (pause.js) held it */
  const rec = { at: new Date(D.now()).toISOString(), by: clip(opts.by || 'monthly', 80), to: c.to, ok: !!(r && r.ok) && !held, held: held, id: s(body && body.id), status: r ? r.status : 0, manual: !!opts.manual };
  await D.kvCas(KEY, function(v){ v = clean(v); if (rec.ok || opts.manual) v.sent[m.month] = rec; const ks = Object.keys(v.sent).sort(); ks.slice(0, Math.max(0, ks.length - 24)).forEach(function(k){ delete v.sent[k]; }); return v; });
  return held ? { ok: false, held: true, error: '⏸ Data-entry mode is on — the e-mail was held.', sent: rec } : rec.ok ? { ok: true, sent: rec, month: m.month } : { ok: false, error: 'E-mail was not accepted (' + rec.status + ').', sent: rec };
}
async function monthly(){
  const now = D.now(), c = A.central(now), day = +c.ymd.slice(8, 10);
  const conf = await cfg();
  if (!conf.on) return { skipped: 'off' };
  if (!conf.to) return { skipped: 'no address' };
  if (day > 10) return { skipped: 'after the 10th' };
  if (c.hour < 8 || c.hour > 16) return { skipped: 'outside office hours' };
  const m = letter(conf, now), was = conf.sent[m.month];
  if (was && was.ok) return { skipped: 'sent this month' };
  return send({ by: 'monthly' });
}
/* a reply that came to permits@in.grayco-cs.com (bid-inbox.js) */
function isReplyMail(recips){ return arr(recips).map(function(x){ return s(x).toLowerCase(); }).indexOf(REPLY_INBOX) > -1; }
async function onReply(mail){
  mail = mail || {};
  const from = s(mail.from && (mail.from.email || mail.from)), subj = clip(mail.subject, 160), files = arr(mail.files).map(function(f){ return s(f.name); }).filter(Boolean).slice(0, 10);
  const id = 'mscce_reply_' + s(mail.id || mail.messageId || (from + subj)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  const note = 'From ' + (from || 'unknown') + (subj ? ' — "' + subj + '"' : '') + (files.length ? '. Files: ' + files.join(', ') : '. (No file attached — read the e-mail in office@.)') +
    '. Open the e-mail in office@ and save the file, then CRM → 🏗️ Permitted jobs → 📥 Import a permit list → source "MSCCE records" → Import.';
  const made = await D.todo(id, '📥 MSCCE permit list arrived — import it into 🏗️ Permitted jobs', { note: note, by: '🏗️ Permitted jobs (MSCCE reply)', prio: 'normal' });
  try { await D.kvCas(KEY, function(v){ v = clean(v); v.replies = v.replies.concat([{ at: new Date(D.now()).toISOString(), from: clip(from, 120), subject: subj, files: files }]).slice(-30); return v; }); } catch (e) {}
  return { ok: true, todo: id, made: !!made };
}
module.exports = { KEY, DEVELOP901, REPLY_INBOX, MSCCE_PHONE, TASK_STEPS, D, isoWeek, weeklyTask, defaults, clean, cfg, letter, lastMonth, send, monthly, isReplyMail, onReply };
