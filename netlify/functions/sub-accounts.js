// netlify/functions/sub-accounts.js
// GrayCo — 🔐 SUB PORTAL ACCOUNTS (patch SUBACCT). Owner 11/13: "make sure as admin I can look up all password logins and
// profiles and reset passwords, delete accounts etc in sub portal, make sure I have a sub portal tab in systems or somewhere in CRM".
//
// Every bid-site / sub-portal account of a subcontractor = a Supabase sign-in (auth.users, made by subportal.js register)
// + its profile row in sp_rows (collection users, role 'sub'). This function lets the CRM's Admin → 🔐 Sub portal accounts
// list them all and act on one. Nothing here answers anyone but GrayCo staff:
//   · an admin (Wesley / Nick — _lib/staff-role.js isAdmin, the one admin rule) may do everything;
//   · the office (_lib/office-access.js) may only LOOK (list / get / log) — passwords and accounts stay with the owners;
//   · anyone else on the staff list gets 403.
//
// POST { action, … } with the CRM sign-in (Authorization: Bearer <CRM access token>):
//   list      { q?, filter?: all|pending|approved|denied|disabled|unlinked|orphan, page?, per? } → { accounts, total, counts, canEdit }
//   get       { id }                     → { account, profile, auth, crm, link, sessions, papers, canEdit }
//   update    { id, set: { name, company, phone, trades, businessAddress, businessCity, businessState, businessZip, lang,
//               contactTitle, dbaName } }                                  (contact fields only — never e-mail, role, approval)
//   reset-link    { id }                 → e-mails a one-time "choose a new password" link (the same mail as the bid site's
//                                          "Forgot password?", patch RESETMAIL) from portal@grayco-cs.com
//   set-password  { id, password? | generate:true, mustChange? } → sets it on the Supabase sign-in (admin API); generated →
//                                          the answer carries it ONCE (never stored, never logged); every old sign-in ends;
//                                          mustChange → the bid site asks them to pick their own (profile suggestPasswordChange)
//   approve   { id, approve: true|false }→ the same s-bids-approve as Subs → 🔨 Bid site requests (portal-access.js)
//   disable / enable { id }              → Supabase ban (no password sign-in anywhere) + profile.signinDisabled (the bid site's
//                                          server refuses the account) + the CRM sub in gc_kv gc_sub_signin_off (the sub portal
//                                          refuses link, code and session) + every signed-in device ended
//   signout-all { id }                   → every sub-portal device session ended (gc_portal_session) and remembered phones
//                                          forgotten; the bid site refuses any sign-in made before now (profile.signedOutAt)
//   link      { id, crmSubId | '' }      → the CRM sub this account belongs to (profile.crmSubId — the strong link the portal and
//                                          the Subs sync honor, patch SUBSYNC); '' unlinks
//   portal-link { id, on: true|false }   → the sub portal link of that CRM sub (or the bid-only sub) on / off
//   delete    { id, confirm, papers?: 'delete', linkOff?: true } → confirm = the company name (or the e-mail when there is no
//                                          company). Deletes the Supabase sign-in + the profile row (+ their My Documents row
//                                          when asked). The CRM Subs record, its files, and their bids stay.
//   log       {}                         → the audit list (who did what, when — never a password)
// Passwords are never readable: Supabase keeps only a hash. Nothing here returns a hash, a token or a reset link.
// Every change is written to the audit list gc_kv "gc_sub_acct_log" (newest first, last 500).
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
/* the PUBLIC anon key (it is already in index.html — not a secret) */
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const GC_DEFAULT_ORIGINS = 'https://graycocrm1.netlify.app,https://crm.grayco-cs.com';
const OFFICE_PHONE = '901-585-0944';
const LOG_KEY = 'gc_sub_acct_log', OFF_KEY = 'gc_sub_signin_off', LOG_MAX = 500;
const BAN = '876000h';   /* 100 years — Supabase's "banned until" (ban_duration 'none' lifts it) */
const EDIT_FIELDS = { name: 80, company: 120, phone: 40, contactTitle: 80, dbaName: 120, businessAddress: 200, businessCity: 80, businessState: 2, businessZip: 10 };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n) : t; }
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(e)) && s(e).length <= 200; }
function okId(v){ return /^[A-Za-z0-9_.:-]{1,80}$/.test(s(v)); }
function digits(v){ return s(v).replace(/\D/g, ''); }
function norm(v){ return low(v).replace(/[^a-z0-9@.\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcKey(){ return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function H(extra){ const k = svcKey(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function Fail(status, message){ const e = new Error(message); e.status = status; return e; }
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? String(h[k] == null ? '' : h[k]) : ''; }
function cors(event){
  const allowed = (process.env.SITE_ORIGIN || GC_DEFAULT_ORIGINS).split(',').map(function(x){ return x.trim().replace(/\/$/, ''); }).filter(Boolean);
  const origin = hdr(event, 'origin').replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': allowed.indexOf(origin) > -1 ? origin : allowed[0], Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
}
function SP(){ return require('./subportal.js')._hub; }
function PA(){ return require('./portal-access.js')._acct; }
function SR(){ return require('./_lib/staff-role.js'); }

/* ── who is asking: a CRM sign-in on the GrayCo staff list (the same check as portal-access.js gcStaffAuth) ── */
async function staffAuth(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return { ok: false, statusCode: 401, error: 'Sign in to the GrayCo CRM first.' };
  let user = null;
  try { const r = await fetch(sbUrl() + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON, Authorization: 'Bearer ' + m[1] } }); if (r.ok) user = await r.json(); }
  catch (e) { return { ok: false, statusCode: 503, error: 'Could not reach the sign-in service. Try again.' }; }
  const email = low(user && user.email);
  if (!email) return { ok: false, statusCode: 401, error: 'Your sign-in has expired. Sign in again.' };
  let role = null, name = '', listed = false, row = null;
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=*&email=eq.' + encodeURIComponent(email), { headers: H() });
    if (r.ok) { listed = true; const rows = await r.json(); row = Array.isArray(rows) && rows[0]; if (row && row.active !== false) { role = low(row.role || 'staff'); name = s(row.name); } }
  } catch (e) {}
  if (!listed && s(process.env.STAFF_EMAILS).split(',').map(low).indexOf(email) > -1) role = 'staff';
  if (!role) return { ok: false, statusCode: 403, error: 'This account (' + email + ') is not on the GrayCo staff list.' };
  const who = { ok: true, email: email, role: role, name: name, profile: row ? s(row.profile) : '', mkt_active: !!(row && row.mkt_active) };
  who.admin = SR().isAdmin(who);
  who.office = false;
  if (!who.admin) { try { who.office = await require('./_lib/office-access.js').officeOrAdmin(who, { row: row || null }); } catch (e) { who.office = false; } }
  return who;
}
function needAdmin(who){ if (!who.admin) throw Fail(403, 'Only an owner (Wesley or Nick) changes sub portal accounts. The office can look them up.'); }

/* ── the data ── */
async function kvGet(key){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: H() });
  if (!r.ok) throw Fail(502, 'The CRM records could not be read (' + r.status + ').');
  const rows = await r.json(); let v = Array.isArray(rows) && rows[0] ? rows[0].value : null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} }
  return v;
}
async function kvPut(key, value){
  const at = new Date().toISOString();
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: value, updated_at: at }) });
  if (!r.ok) throw Fail(502, 'Could not save (' + r.status + ').');
}
async function audit(who, action, prof, detail){
  const e = { at: new Date().toISOString(), by: who.email, byName: who.name || '', action: action, id: s(prof && prof.id), company: clip(prof && (prof.company || prof.name), 120), email: low(prof && prof.email), detail: clip(detail, 300) };
  try { const cur = await kvGet(LOG_KEY); const list = Array.isArray(cur) ? cur : []; await kvPut(LOG_KEY, [e].concat(list).slice(0, LOG_MAX)); }
  catch (er) { console.warn('[sub-accounts] audit', er && er.message); }
  return e;
}
async function profiles(){ return (await SP().listRows([SP().eq('collection', 'users')])).map(function(r){ return r.data || {}; }).filter(function(u){ return u.role === 'sub' && s(u.id); }); }
async function profileOf(id){
  if (!okId(id)) throw Fail(400, 'Pick an account.');
  const row = await SP().getRow('users', s(id));
  if (!row || !row.data || row.data.role !== 'sub') throw Fail(404, 'That account is gone.');
  return row.data;
}
async function saveProfile(prof, who){ await SP().upsertRows([SP().rowFor('users', prof)], who.email); }
/* every Supabase sign-in (paged by the admin API). Only what the list needs — never a hash, a token or identities. */
function authOut(u){ return u ? { id: s(u.id), email: low(u.email), phone: s(u.phone), createdAt: s(u.created_at), lastSignInAt: s(u.last_sign_in_at), confirmedAt: s(u.email_confirmed_at || u.confirmed_at),
  bannedUntil: s(u.banned_until), updatedAt: s(u.updated_at), portal: s(u.user_metadata && u.user_metadata.portal) } : null; }
async function authUsers(){
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const r = await fetch(sbUrl() + '/auth/v1/admin/users?page=' + page + '&per_page=1000', { headers: H() });
    if (!r.ok) throw Fail(502, 'The sign-in list could not be read (' + r.status + ').');
    const j = await r.json().catch(function(){ return {}; });
    const list = Array.isArray(j) ? j : arr(j && j.users);
    list.forEach(function(u){ out.push(authOut(u)); });
    if (list.length < 1000) break;
  }
  return out;
}
async function authUser(id){
  if (!s(id)) return null;
  const r = await fetch(sbUrl() + '/auth/v1/admin/users/' + encodeURIComponent(s(id)), { headers: H() });
  if (r.status === 404) return null;
  if (!r.ok) throw Fail(502, 'The sign-in could not be read (' + r.status + ').');
  return authOut(await r.json().catch(function(){ return null; }));
}
async function authPut(id, body){
  const r = await fetch(sbUrl() + '/auth/v1/admin/users/' + encodeURIComponent(s(id)), { method: 'PUT', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text().catch(function(){ return ''; });
    if (body.password && (r.status === 422 || /password/i.test(t))) throw Fail(400, 'That password was refused as too weak. Use at least 8 characters with letters and numbers.');
    throw Fail(502, 'The sign-in service refused the change (' + r.status + ').');
  }
}
async function staffEmails(){
  try { const r = await fetch(sbUrl() + '/rest/v1/gc_staff?select=email', { headers: H() }); if (r.ok) return (await r.json()).map(function(x){ return low(x && x.email); }); } catch (e) {}
  return [];
}
async function papersAll(){
  const by = {};
  try { (await SP().listRows([SP().eq('collection', 'subdocs')])).forEach(function(r){ by[s(r.id)] = arr(r.data && r.data.items); }); } catch (e) {}
  return by;
}
function papersOut(items){
  const today = new Date().toISOString().slice(0, 10);
  const one = function(type){ const have = arr(items).filter(function(d){ return d.type === type; }); if (!have.length) return null;
    const cur = have.some(function(d){ return !s(d.expirationDate) || s(d.expirationDate).slice(0, 10) >= today || d.wcExempt === true; });
    const exp = have.map(function(d){ return s(d.expirationDate).slice(0, 10); }).filter(Boolean).sort().pop() || '';
    return { ok: cur, exp: exp }; };
  return { w9: one('w9'), gl: one('insurance_general'), wc: one('insurance_workers_comp'), license: one('license'), n: arr(items).length };
}
function offMap(v){ return v && typeof v === 'object' && !Array.isArray(v) && v.ids && typeof v.ids === 'object' ? v : { ids: {} }; }

/* the CRM sub an account belongs to (portal-access's SUBSYNC rule) and the id its sub portal runs under */
function crmOf(data, prof){ const c = PA().crmSubOf(data, prof); return c ? { id: s(c.id), name: s(c.name || c.company), email: low(c.email), phone: s(c.phone) } : null; }
function portalIdOf(data, prof){
  const c = PA().crmSubOf(data, prof); if (c) return s(c.id);
  return okEmail(low(prof.email)) && prof.approved === true && prof.bidsRevoked !== true ? PA().bidSubId(prof.email) : '';
}
function idsOf(data, prof){ const out = []; const p = portalIdOf(data, prof); if (p) out.push(p); if (okEmail(low(prof.email))) { const a = PA().bidSubId(prof.email); if (out.indexOf(a) < 0) out.push(a); } return out; }
function statusOf(prof, auth, off){
  const banned = !!(auth && auth.bannedUntil && Date.parse(auth.bannedUntil) > Date.now());
  if (prof.signinDisabled === true || banned || off) return 'disabled';
  if (prof.bidsRevoked === true) return 'denied';
  if (prof.approved === true) return 'approved';
  return 'pending';
}
function rowOut(prof, auth, data, links, papers, off){
  const crm = crmOf(data, prof), pid = portalIdOf(data, prof), ln = pid ? links[pid] : null;
  return { id: s(prof.id), authUserId: s(prof.authUserId || (auth && auth.id)), email: low(prof.email), name: s(prof.name), company: s(prof.company), phone: s(prof.phone),
    trades: (Array.isArray(prof.trades) ? prof.trades : []).map(s).filter(Boolean).slice(0, 12), status: statusOf(prof, auth, off), crm: crm, portalId: pid,
    link: { on: !!ln, viewed: ln ? s(ln.last_viewed_at) : '', created: ln ? s(ln.created_at) : '' }, lastSignInAt: auth ? auth.lastSignInAt : '', createdAt: s(prof.createdAt) || (auth ? auth.createdAt : ''),
    hasLogin: !!auth, papers: papersOut(papers), mustChange: prof.suggestPasswordChange === true, lang: s(prof.lang) === 'es' ? 'es' : 'en' };
}
async function linksActive(){
  const by = {};
  try { const r = await fetch(sbUrl() + '/rest/v1/gc_sub_link?select=sub_id,created_at,last_viewed_at&revoked=eq.false&limit=5000', { headers: H() }); if (r.ok) (await r.json()).forEach(function(l){ by[s(l.sub_id)] = l; }); } catch (e) {}
  return by;
}
async function everything(){
  const [profs, auths, data, links, papers, off, staff] = await Promise.all([profiles(), authUsers(), PA().crmData(true), linksActive(), papersAll(), kvGet(OFF_KEY).catch(function(){ return null; }), staffEmails()]);
  const om = offMap(off), byAuthId = {}, byEmail = {};
  auths.forEach(function(a){ if (a.id) byAuthId[a.id] = a; if (a.email) byEmail[a.email] = a; });
  const used = {};
  const rows = profs.map(function(p){
    const a = (s(p.authUserId) && byAuthId[s(p.authUserId)]) || byEmail[low(p.email)] || null; if (a) used[a.id] = 1;
    return rowOut(p, a, data, links, papers[s(p.id)], !!om.ids[s(p.id)]);
  });
  /* a sub sign-in with no profile (a sign-up that broke half way) — listed so it can be deleted */
  auths.filter(function(a){ return !used[a.id] && a.portal === 'sub' && staff.indexOf(a.email) < 0; }).forEach(function(a){
    rows.push({ id: 'auth:' + a.id, authUserId: a.id, email: a.email, name: '', company: '', phone: '', trades: [], status: 'orphan', crm: null, portalId: '', link: { on: false, viewed: '', created: '' },
      lastSignInAt: a.lastSignInAt, createdAt: a.createdAt, hasLogin: true, papers: papersOut([]), mustChange: false, lang: 'en' });
  });
  return { rows: rows, data: data, links: links, off: om, byAuthId: byAuthId, byEmail: byEmail };
}
function matches(r, q){
  if (!q) return true;
  const hay = norm([r.company, r.name, r.email, r.phone, r.trades.join(' '), r.crm ? r.crm.name : ''].join(' ')), d = digits(q);
  return norm(q).split(' ').every(function(w){ return hay.indexOf(w) > -1; }) || (d.length >= 4 && digits(r.phone).indexOf(d) > -1);
}
const FILTERS = {
  all: function(){ return true; }, pending: function(r){ return r.status === 'pending'; }, approved: function(r){ return r.status === 'approved'; },
  denied: function(r){ return r.status === 'denied'; }, disabled: function(r){ return r.status === 'disabled'; }, unlinked: function(r){ return r.status !== 'orphan' && !r.crm; },
  orphan: function(r){ return r.status === 'orphan'; }
};

/* ── the actions ── */
function profileOut(p){
  const keep = ['id', 'authUserId', 'email', 'role', 'approved', 'bidsRevoked', 'bidsRevokedAt', 'bidsApprovedAt', 'bidsApprovedBy', 'bidsRequestedAt', 'name', 'phone', 'contactTitle', 'company', 'dbaName',
    'businessAddress', 'businessCity', 'businessState', 'businessZip', 'website', 'yearsInBusiness', 'numEmployees', 'unionAffiliation', 'serviceArea', 'licenseNumbers', 'einLast4', 'trades', 'lang',
    'crmSubId', 'createdAt', 'papersClaimed', 'signinDisabled', 'signinDisabledAt', 'signinDisabledBy', 'signedOutAt', 'signedOutBy', 'suggestPasswordChange', 'tempPasswordAt', 'tempPasswordBy', 'invitedJobId'];
  const o = {}; keep.forEach(function(k){ if (p[k] !== undefined) o[k] = p[k]; }); return o;
}
async function getOne(id){
  const prof = await profileOf(id);
  const [auth, data, links, off, docs] = await Promise.all([authUser(prof.authUserId).catch(function(){ return null; }), PA().crmData(true), linksActive(), kvGet(OFF_KEY).catch(function(){ return null; }), SP().getRow('subdocs', s(prof.id)).catch(function(){ return null; })]);
  const auth2 = auth || null;
  const items = arr(docs && docs.data && docs.data.items);
  const ids = idsOf(data, prof);
  let sessions = 0, lastSeen = '';
  if (ids.length) { try { const r = await fetch(sbUrl() + '/rest/v1/gc_portal_session?select=last_seen_at,created_at,expires_at&kind=eq.partner&revoked=eq.false&sub_id=in.(' + ids.map(function(x){ return '"' + x.replace(/"/g, '') + '"'; }).join(',') + ')&limit=200', { headers: H() });
    if (r.ok) (await r.json()).forEach(function(x){ if (Date.parse(x.expires_at) > Date.now()) { sessions++; const t = s(x.last_seen_at || x.created_at); if (t > lastSeen) lastSeen = t; } }); } catch (e) {} }
  return { row: rowOut(prof, auth2, data, links, items, !!offMap(off).ids[s(prof.id)]), profile: profileOut(prof), auth: auth2, sessions: sessions, portalLastSeen: lastSeen,
    papers: items.map(function(d){ return { type: s(d.type), label: s(d.label), fileName: s(d.fileName), exp: s(d.expirationDate).slice(0, 10), at: s(d.uploadedAt).slice(0, 10), exempt: d.wcExempt === true }; }), data: data };
}
async function endSessions(data, prof){
  const ids = idsOf(data, prof); if (!ids.length) return 0;
  const inq = 'in.(' + ids.map(function(x){ return '"' + x.replace(/"/g, '') + '"'; }).join(',') + ')';
  const r = await fetch(sbUrl() + '/rest/v1/gc_portal_session?kind=eq.partner&revoked=eq.false&sub_id=' + inq, { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ revoked: true }) });
  let n = 0; if (r.ok) { const j = await r.json().catch(function(){ return []; }); n = Array.isArray(j) ? j.length : 0; }
  await fetch(sbUrl() + '/rest/v1/gc_sub_device?sub_id=' + inq, { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify({ verified_at: null }) }).catch(function(){});
  return n;
}
async function setOff(prof, data, on, who){
  const cur = offMap(await kvGet(OFF_KEY).catch(function(){ return null; }));
  const ids = cur.ids;
  /* by profile id (the list) and by every id their sub portal runs under (portal-access.js checks those) */
  Object.keys(ids).forEach(function(k){ if (ids[k] && s(ids[k].profileId) === s(prof.id)) delete ids[k]; });
  if (on) { const e = { profileId: s(prof.id), at: new Date().toISOString(), by: who.email }; ids[s(prof.id)] = e; idsOf(data, prof).forEach(function(x){ ids[x] = e; }); }
  await kvPut(OFF_KEY, { ids: ids, updatedAt: new Date().toISOString() });
}
const WORDS = ['River', 'Steel', 'Cobalt', 'Falcon', 'Anvil', 'Quartz', 'Timber', 'Slate', 'Cedar', 'Ember', 'Ridge', 'Onyx', 'Iron', 'Bison', 'Hawk', 'Forge', 'Basalt', 'Copper', 'Willow', 'Granite', 'Beacon', 'Maple', 'Harbor', 'Summit'];
function genPassword(){ const w = function(){ return WORDS[crypto.randomInt(0, WORDS.length)]; }; return w() + '-' + w() + '-' + String(crypto.randomInt(1000, 10000)); }
function checkPassword(pw){
  if (typeof pw !== 'string' || pw.length < 8) throw Fail(400, 'Use at least 8 characters.');
  if (pw.length > 72) throw Fail(400, 'Use 72 characters or fewer.');
  if (/^\s|\s$/.test(pw)) throw Fail(400, 'The password cannot start or end with a space.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw Fail(400, 'Use letters and at least one number.');
  return pw;
}
async function resetLink(prof){
  const email = low(prof.email); if (!okEmail(email)) throw Fail(400, 'This account has no e-mail to send to.');
  const back = (function(){ const v = s(process.env.BIDS_URL).replace(/\/$/, ''); return (/^https:\/\//.test(v) ? v : 'https://bids.grayco-cs.com') + '/'; })();
  let link = '';
  const r = await fetch(sbUrl() + '/auth/v1/admin/generate_link', { method: 'POST', headers: H(), body: JSON.stringify({ type: 'recovery', email: email, redirect_to: back }) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  link = s(j.action_link || (j.properties && j.properties.action_link));
  if (!r.ok || !link) throw Fail(502, 'The sign-in service could not make a reset link (' + r.status + '). Use "Set a temporary password" instead.');
  const es = s(prof.lang) === 'es', H2 = SP();
  const subj = es ? 'Cambie su contraseña de GrayCo Bids' : 'Reset your GrayCo Bids password';
  const html = H2.mailHtml(es ? 'Cambiar la contraseña' : 'Reset your password', es
    ? ['GrayCo le envía un enlace para elegir una contraseña nueva para ' + H2.esc(email) + ' (bids.grayco-cs.com y el portal de GrayCo).', 'Toque el botón para elegir una contraseña nueva. El enlace sirve una sola vez.', '¿Preguntas? Llame a GrayCo ' + OFFICE_PHONE + '.']
    : ['GrayCo sent you a link to choose a new password for ' + H2.esc(email) + ' (bids.grayco-cs.com and the GrayCo Portal).', 'Tap the button to choose a new password. The link works once.', 'Questions? Call GrayCo ' + OFFICE_PHONE + '.'],
    { href: link, label: es ? 'Elegir una contraseña nueva' : 'Choose a new password' });
  const ok = await require('./_lib/custquiet.js').run('reply', function(){ return H2.sendMail(email, subj, html); });
  if (!ok) throw Fail(502, 'The e-mail could not be sent (is e-mail set up / data-entry mode on?). Use "Set a temporary password" and tell them by phone.');
  return true;
}

async function act(action, body, who, event){
  if (action === 'list') {
    const all = await everything();
    const q = clip(body.q, 100), f = FILTERS[s(body.filter)] ? s(body.filter) : 'all';
    const counts = {}; Object.keys(FILTERS).forEach(function(k){ counts[k] = all.rows.filter(FILTERS[k]).length; });
    const hits = all.rows.filter(function(r){ return FILTERS[f](r) && matches(r, q); })
      .sort(function(a, b){ const o = { pending: 0, orphan: 1, disabled: 2, approved: 3, denied: 4 }; return (o[a.status] - o[b.status]) || low(a.company || a.email).localeCompare(low(b.company || b.email)); });
    const per = Math.max(10, Math.min(200, parseInt(body.per, 10) || 50)), page = Math.max(1, parseInt(body.page, 10) || 1);
    return { ok: true, accounts: hits.slice((page - 1) * per, page * per), total: hits.length, page: page, per: per, counts: counts, canEdit: !!who.admin, me: who.email };
  }
  if (action === 'log') return { ok: true, log: (await kvGet(LOG_KEY).catch(function(){ return []; }) || []).slice(0, Math.max(1, Math.min(500, parseInt(body.n, 10) || 60))), canEdit: !!who.admin };
  if (action === 'crm-subs') {   /* the picker for 🔗 Link to CRM sub */
    const data = await PA().crmData(true);
    return { ok: true, subs: PA().crmSubs(data).map(function(r){ return { id: s(r.id), name: s(r.name || r.company), email: low(r.email), phone: s(r.phone), trade: s(r.trade) }; }).filter(function(r){ return r.id && r.name; }).sort(function(a, b){ return low(a.name).localeCompare(low(b.name)); }) };
  }
  /* an orphan sign-in (no profile): only look at it or delete it */
  if (/^auth:/.test(s(body.id))) {
    const aid = s(body.id).slice(5); if (!/^[A-Za-z0-9-]{3,64}$/.test(aid)) throw Fail(400, 'Pick an account.');
    const a = await authUser(aid); if (!a) throw Fail(404, 'That sign-in is gone.');
    if (action === 'get') return { ok: true, account: { id: 'auth:' + a.id, authUserId: a.id, email: a.email, status: 'orphan', lastSignInAt: a.lastSignInAt, createdAt: a.createdAt, hasLogin: true, trades: [], papers: papersOut([]), link: { on: false } }, profile: null, auth: a, sessions: 0, papers: [], canEdit: !!who.admin };
    if (action !== 'delete') throw Fail(409, 'This sign-in has no profile — it can only be deleted.');
    needAdmin(who);
    if (low(body.confirm) !== a.email) throw Fail(400, 'Type the e-mail ' + a.email + ' to confirm.');
    const r = await fetch(sbUrl() + '/auth/v1/admin/users/' + encodeURIComponent(a.id), { method: 'DELETE', headers: H() });
    if (!r.ok && r.status !== 404) throw Fail(502, 'The sign-in could not be deleted (' + r.status + ').');
    await audit(who, 'delete', { id: 'auth:' + a.id, email: a.email }, 'sign-in without a profile deleted');
    return { ok: true, deleted: true };
  }
  if (action === 'get') { const g = await getOne(body.id); delete g.data; return Object.assign({ ok: true, account: g.row, canEdit: !!who.admin }, { profile: g.profile, auth: g.auth, sessions: g.sessions, portalLastSeen: g.portalLastSeen, papers: g.papers }); }

  needAdmin(who);
  const prof = await profileOf(body.id);
  const label = s(prof.company || prof.name || prof.email);
  if (action === 'update') {
    const set = body.set && typeof body.set === 'object' ? body.set : {};
    const next = Object.assign({}, prof), changed = [];
    Object.keys(EDIT_FIELDS).forEach(function(k){ if (set[k] === undefined) return; let v = clip(set[k], EDIT_FIELDS[k]); if (k === 'businessState') v = v.toUpperCase(); if (v !== s(prof[k])) { next[k] = v; changed.push(k); } });
    if (set.lang !== undefined) { const l = s(set.lang) === 'es' ? 'es' : 'en'; if (l !== (s(prof.lang) === 'es' ? 'es' : 'en')) { next.lang = l; changed.push('lang'); } }
    if (set.trades !== undefined) { const t = (Array.isArray(set.trades) ? set.trades : s(set.trades).split(',')).map(function(x){ return clip(x, 60); }).filter(Boolean).slice(0, 30);
      if (JSON.stringify(t) !== JSON.stringify(prof.trades || [])) { next.trades = t; changed.push('trades'); } }
    if (!s(next.company) && !s(next.name)) throw Fail(400, 'Keep a company or a contact name.');
    if (!changed.length) return { ok: true, changed: [] };
    next.updatedAt = new Date().toISOString();
    await saveProfile(next, who);
    await audit(who, 'update', next, 'changed ' + changed.join(', '));
    return { ok: true, changed: changed };
  }
  if (action === 'reset-link') {
    await resetLink(prof);
    await audit(who, 'reset-link', prof, 'reset link e-mailed to ' + low(prof.email));
    return { ok: true, sent: true, to: low(prof.email) };
  }
  if (action === 'set-password') {
    if (!s(prof.authUserId)) throw Fail(409, 'This account has no sign-in to set a password on.');
    const gen = body.generate === true, pw = gen ? genPassword() : checkPassword(body.password);
    await authPut(prof.authUserId, { password: pw });
    const now = new Date().toISOString();
    const next = Object.assign({}, prof, { suggestPasswordChange: body.mustChange !== false, tempPasswordAt: now, tempPasswordBy: who.email, signedOutAt: now, signedOutBy: who.email });
    await saveProfile(next, who);
    let ended = 0; try { ended = await endSessions(await PA().crmData(true), prof); } catch (e) {}
    await audit(who, 'set-password', prof, (gen ? 'temporary password generated' : 'temporary password typed by staff') + (next.suggestPasswordChange ? ' · asked to change it' : '') + ' · old sign-ins ended');
    const out = { ok: true, set: true, mustChange: next.suggestPasswordChange, ended: ended };
    if (gen) out.password = pw;   /* shown ONCE in the CRM; never stored or logged */
    return out;
  }
  if (action === 'approve') {
    const r = await require('./portal-access.js').handler({ httpMethod: 'POST', headers: { authorization: hdr(event, 'authorization'), origin: hdr(event, 'origin') }, body: JSON.stringify({ action: 's-bids-approve', id: prof.id, approve: body.approve !== false }) });
    let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (e) {}
    if (r.statusCode !== 200 || !j.ok) throw Fail(r.statusCode >= 400 ? r.statusCode : 502, j.error || 'Not saved.');
    await audit(who, body.approve !== false ? 'approve' : 'deny', prof, body.approve !== false ? 'approved for the bid site (approval e-mail sent)' : 'denied / bid site access revoked');
    return { ok: true, approved: j.approved };
  }
  if (action === 'disable' || action === 'enable') {
    const on = action === 'disable', now = new Date().toISOString();
    if (s(prof.authUserId)) { try { await authPut(prof.authUserId, { ban_duration: on ? BAN : 'none' }); } catch (e) { if (!on) throw e; console.warn('[sub-accounts] ban', e.message); } }
    const next = Object.assign({}, prof, on ? { signinDisabled: true, signinDisabledAt: now, signinDisabledBy: who.email, signedOutAt: now, signedOutBy: who.email } : { signinDisabled: false, signinDisabledAt: null, signinDisabledBy: null });
    await saveProfile(next, who);
    const data = await PA().crmData(true);
    await setOff(prof, data, on, who);
    let ended = 0; if (on) { try { ended = await endSessions(data, prof); } catch (e) {} }
    await audit(who, action, prof, on ? 'sign-in turned off (bid site + sub portal) · ' + ended + ' device(s) signed out' : 'sign-in turned back on');
    return { ok: true, disabled: on, ended: ended };
  }
  if (action === 'signout-all') {
    const now = new Date().toISOString();
    await saveProfile(Object.assign({}, prof, { signedOutAt: now, signedOutBy: who.email }), who);
    const ended = await endSessions(await PA().crmData(true), prof);
    await audit(who, 'signout-all', prof, ended + ' sub-portal device(s) signed out · bid-site sign-ins before now refused');
    return { ok: true, ended: ended };
  }
  if (action === 'link') {
    const data = await PA().crmData(true);
    const to = s(body.crmSubId);
    if (to && !okId(to)) throw Fail(400, 'Pick a CRM sub.');
    const rec = to ? PA().subById(data, to) : null;
    if (to && !rec) throw Fail(404, 'That sub is not in the CRM.');
    const next = Object.assign({}, prof, { crmSubId: to || null, crmLinkedAt: new Date().toISOString(), crmLinkedBy: who.email });
    await saveProfile(next, who);
    await audit(who, to ? 'link' : 'unlink', prof, to ? 'linked to CRM sub ' + s(rec.name || rec.company) + ' (' + to + ')' : 'unlinked from the CRM sub');
    return { ok: true, crm: rec ? { id: s(rec.id), name: s(rec.name || rec.company) } : null };
  }
  if (action === 'portal-link') {
    const data = await PA().crmData(true);
    const pid = portalIdOf(data, prof);
    if (!pid) throw Fail(409, 'This account has no sub portal yet: link it to a CRM sub (🔗) or approve it first.');
    const on = body.on !== false;
    const rec = PA().subById(data, pid);
    if (on) { const l = await PA().subLinkCreate(pid, s(rec ? rec.name : label), who.name || who.email); await audit(who, 'portal-link-on', prof, 'sub portal link turned on (' + pid + ')'); return { ok: true, on: true, url: PA().linkFor(l.token) }; }
    await PA().subLinkRevoke(pid);
    await audit(who, 'portal-link-off', prof, 'sub portal link turned off (' + pid + ') · every device signed out');
    return { ok: true, on: false };
  }
  if (action === 'delete') {
    const want = norm(prof.company) || low(prof.email);
    if (!want || norm(body.confirm) !== want) throw Fail(400, 'Type the company name exactly (' + (s(prof.company) || low(prof.email)) + ') to confirm.');
    const data = await PA().crmData(true);
    if (s(prof.authUserId)) {
      const r = await fetch(sbUrl() + '/auth/v1/admin/users/' + encodeURIComponent(s(prof.authUserId)), { method: 'DELETE', headers: H() });
      if (!r.ok && r.status !== 404) throw Fail(502, 'The sign-in could not be deleted (' + r.status + '). Nothing was removed.');
    }
    let ended = 0; try { ended = await endSessions(data, prof); } catch (e) {}
    const keys = ['users/' + s(prof.id)].concat(body.papers === 'delete' ? ['subdocs/' + s(prof.id)] : []);
    const d = await fetch(sbUrl() + '/rest/v1/sp_rows?key=in.(' + keys.map(function(k){ return '"' + k.replace(/"/g, '') + '"'; }).join(',') + ')', { method: 'DELETE', headers: H({ Prefer: 'return=minimal' }) });
    if (!d.ok) throw Fail(502, 'The sign-in was deleted but the profile could not be (' + d.status + '). Try Delete again.');
    let linkOff = false;
    if (body.linkOff === true) { const pid = portalIdOf(data, prof); if (pid) { try { await PA().subLinkRevoke(pid); linkOff = true; } catch (e) {} } }
    else { const sbp = okEmail(low(prof.email)) ? PA().bidSubId(prof.email) : ''; if (sbp && !PA().subById(data, sbp) && !PA().crmSubOf(data, prof)) { try { await PA().subLinkRevoke(sbp); linkOff = true; } catch (e) {} } }   /* a bid-only sub's portal has nothing left behind it */
    try { await setOff(prof, data, false, who); } catch (e) {}
    await audit(who, 'delete', prof, 'account deleted (sign-in + profile' + (body.papers === 'delete' ? ' + My Documents' : '') + ')' + (linkOff ? ' · sub portal link off' : '') + ' · CRM sub record kept');
    return { ok: true, deleted: true, ended: ended, linkOff: linkOff };
  }
  throw Fail(400, 'Unknown action.');
}

exports.handler = async function(event){
  event = event || {};
  const headers = cors(event);
  const reply = function(code, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
  if (!svcKey()) return reply(500, { ok: false, error: 'Server setting missing: SUPABASE_SERVICE_KEY.' });
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, { ok: false, error: 'Bad request' }); }
  const action = s(body.action);
  try {
    const who = await staffAuth(event);
    if (!who.ok) return reply(who.statusCode, { ok: false, error: who.error });
    if (!who.admin && !who.office) return reply(403, { ok: false, error: 'Only an owner (Wesley or Nick) — or the office, to look — opens sub portal accounts.' });
    return reply(200, await act(action, body, who, event));
  } catch (e) {
    if (e && e.status) return reply(e.status, { ok: false, error: e.message });
    console.error('[sub-accounts]', action, e);
    return reply(500, { ok: false, error: 'Something went wrong. Try again.' });
  }
};
exports._t = { genPassword: genPassword, checkPassword: checkPassword, statusOf: statusOf, papersOut: papersOut, FILTERS: FILTERS };
