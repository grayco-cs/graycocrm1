/* netlify/functions/_lib/vacation.js — patch AWAY (owner 11/16: "When you are away have an automatic email to customers or
   clients in my email reaching out to me that I am away from the office and to reach out to office@grayco-cs.com or
   nthomas — and same for other admin").
   When an admin turns 🏖 Away on, their own Gmail auto-reply (vacation responder) is turned on for the same days; turning
   Away off turns it off. With an end date Gmail stops it by itself after that day (endTime).
   How: Gmail API users.settings.updateVacation (PUT /gmail/v1/users/me/settings/vacation, scope gmail.settings.basic)
   with that person's own "Connect Google" sign-in (gcal-oauth.js — the scope was added there 11/16; a sign-in made before
   that cannot set it: the answer is needReconnect and the Away screen shows "Reconnect Google"). Sent to
   www.googleapis.com (allowed in data-entry mode: Gmail itself sends the auto-replies — the owner asked for that).
   Everyone who writes gets it (restrictToContacts / restrictToDomain false).
   Default words (editable on the Away screen, never a carrier or the sub portal):
     "Thanks for your e-mail. I'm away from the office until <end date>. For anything you need, please contact our office
      at office@grayco-cs.com or <the other admin> at <their e-mail>." */
'use strict';
const SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';
const API = 'https://www.googleapis.com/gmail/v1/users/me/settings/vacation';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OFFICE = 'office@grayco-cs.com';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
const D = { fetch: function(u, o){ return globalThis.fetch(u, o); }, gtok: function(){ return require('./gtok.js'); } };   /* tests swap these */

function longDay(d){ try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } }
/* the words: other = { name, email } (the cover, else the other admin) */
function defaultText(rec, other){
  const until = s(rec && rec.to) ? 'until ' + longDay(rec.to) : 'right now';
  const o = other && s(other.email) ? ' or ' + (s(other.name) || s(other.email)) + ' at ' + low(other.email) : '';
  return 'Thanks for your e-mail. I\'m away from the office ' + until + '. For anything you need, please contact our office at ' + OFFICE + o + '.';
}
function subject(rec){ return 'Away from the office' + (s(rec && rec.to) ? ' until ' + longDay(rec.to) : ''); }
/* the first moment of a Central day, in ms (Gmail wants epoch ms) */
function centralStart(d){
  for (const off of [5, 6]) { const t = Date.parse(d + 'T0' + off + ':00:00Z'); const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date(t)), 10) % 24; if (h === 0) return t; }
  return Date.parse(d + 'T06:00:00Z');
}
function nextDay(d){ const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); }
function body(rec, other, on){
  if (!on) return { enableAutoReply: false };
  const b = { enableAutoReply: true, responseSubject: subject(rec), responseBodyPlainText: s(rec.replyText) || defaultText(rec, other), restrictToContacts: false, restrictToDomain: false };
  if (s(rec.from)) b.startTime = String(centralStart(rec.from));
  if (s(rec.to)) b.endTime = String(centralStart(nextDay(rec.to)));
  return b;
}
/* that person's own Google sign-in (by e-mail, else by CRM name) */
async function tokenFor(email, name){
  const G = D.gtok();
  let t = null;
  try { const all = await G.list(); const hit = all.filter(function(x){ return x && x.value && low(x.value.email) === low(email); })[0] || all.filter(function(x){ return x && low(x.user) === low(name); })[0]; t = hit ? { user: hit.user, value: hit.value } : null; } catch (e) { t = null; }
  if (!t && s(name)) { try { const v = await G.get(name); if (v) t = { user: name, value: v }; } catch (e) {} }
  return t;
}
async function access(t){
  const v = t.value || {};
  if (s(v.access_token) && +v.expiry > Date.now() + 60e3) return s(v.access_token);
  if (!s(v.refresh_token) || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return '';
  const r = await D.fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: v.refresh_token, grant_type: 'refresh_token' }).toString() });
  const j = await r.json().catch(function(){ return {}; });
  if (!j.access_token) return '';
  try { await D.gtok().set(t.user, Object.assign({}, v, { access_token: j.access_token, expiry: Date.now() + (+j.expires_in || 3600) * 1000, scope: s(j.scope) || s(v.scope) })); } catch (e) {}
  if (s(j.scope) && j.scope.indexOf(SCOPE) < 0) return 'NOSCOPE';
  return j.access_token;
}
const RECONNECT = 'Reconnect Google to turn on the e-mail auto-reply (one time: Connect Google, allow "Gmail settings").';
/* set(rec, other, on) → { ok, on, needReconnect?, error? } */
async function set(rec, other, on){
  const t = await tokenFor(rec.email, rec.name);
  if (!t) return { ok: false, needReconnect: true, error: RECONNECT };
  if (s(t.value.scope) && t.value.scope.indexOf(SCOPE) < 0) return { ok: false, needReconnect: true, error: RECONNECT };
  let tok = ''; try { tok = await access(t); } catch (e) { tok = ''; }
  if (tok === 'NOSCOPE') return { ok: false, needReconnect: true, error: RECONNECT };
  if (!tok) return { ok: false, needReconnect: true, error: 'Google did not accept the saved sign-in. ' + RECONNECT };
  let r; try { r = await D.fetch(API, { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body(rec, other, on)) }); } catch (e) { return { ok: false, error: 'Google could not be reached.' }; }
  if (r.status === 401 || r.status === 403) return { ok: false, needReconnect: true, error: RECONNECT };
  if (!r.ok) return { ok: false, error: 'Google answered ' + r.status + '.' };
  return { ok: true, on: !!on };
}
module.exports = { SCOPE, API, OFFICE, D, defaultText, subject, body, set, centralStart, RECONNECT };
