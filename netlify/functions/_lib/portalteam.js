/* netlify/functions/_lib/portalteam.js — patch PORTALTEAM (owner 11/23: "The portal should be for the company that way everyone that
   signs up the entire company can check out the portal not just the guy that signs up. So let their sign up be for everyone in their
   companies").

   A portal account belongs to a COMPANY. The company is the account that was signed up / approved before this patch (nothing about it
   changes); its people are a TEAM:
     · the PRIMARY contact — the person who signed up (subs: the bid-site profile's e-mail; a CRM-only sub: the CRM sub's e-mail / phone;
       customers: the e-mail / phone on their job). Implicit: no row is ever written for them, so every existing single-user account
       simply reads as a one-member company (no migration, nothing written to live data);
     · MEMBERS — one row each in sp_rows, collection 'team' (service-only; never in the bid site's generic load / save lists):
         key 'team/<id>', user_id = the company key, email = the member's e-mail (or null), data = the member (below).
   Company keys:  'sp:<bid-site profile id>'   a sub / supplier with a bid-site account (bids.grayco-cs.com + portal.grayco-cs.com)
                  'crm:<CRM sub id>'           a sub that only has a portal link from the CRM (portal.grayco-cs.com only)
                  'cu:e:<email>' | 'cu:p:<10-digit phone>'   a customer (residential household or GC / commercial company)
   A member signs in as themselves (their own e-mail / phone, their own password or sign-in code) and sees exactly what the company sees:
   the server treats them as the company (bid site: the company's profile; sub portal: the company's CRM sub; customer portal: the
   holder's jobs). Their own actions are recorded under their own e-mail (updated_by / author).

   Member: { id, company, kind: 'sub' | 'customer', companyName, name, email, phone, status: 'active' | 'removed' | 'requested' | 'denied',
             via: 'team' | 'domain' | 'request' | 'staff', addedAt, addedBy: {email, name, role}, notify: false, notifyAt, notifyBy,
             removedAt, removedBy, restoredAt, restoredBy, decidedAt, decidedBy, invites: [{ at, by, how }], log: [{ at, by, role, op }] }
   Rules (gate by role, never by a person's name):
     · any ACTIVE member (or the primary) of an approved company adds / removes / restores coworkers; customers: a residential account's
       household is managed by the account holder only; a GC / commercial company's by any member;
     · removing never deletes: status 'removed' + who / when (and their signed-in devices end); a member can't remove the last active
       person; staff can (sub-accounts.js);
     · an invite goes only when a person clicks "Send invite" (never by itself); e-mail goes through the customer quiet hours (held
       7 PM – 7 AM, _lib/custquiet.js) and ⏸ data-entry mode (_lib/pause.js) like every outside e-mail; a phone-only coworker gets a
       ready text the member sends from their own phone;
     · notifications: the primary keeps what they get today; a member gets them only after turning "Notify me" on (their own click);
     · every value a person typed / clicked stays until a newer human action changes it (nothing here rewrites a member by itself). */
'use strict';
const crypto = require('crypto');
const COLL = 'team';
/* free-mail domains never auto-join a company (anyone can have one) */
const FREE = ['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aim.com', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'comcast.net', 'xfinity.com', 'verizon.net',
  'charter.net', 'spectrum.net', 'cox.net', 'earthlink.net', 'protonmail.com', 'proton.me', 'pm.me', 'gmx.com', 'gmx.net', 'mail.com', 'zoho.com',
  'yandex.com', 'hey.com', 'fastmail.com', 'tutanota.com', 'inbox.com', 'juno.com', 'netzero.net', 'frontier.com', 'windstream.net', 'q.com',
  'centurylink.net', 'optonline.net', 'roadrunner.com', 'twc.com', 'rr.com', 'mchsi.com', 'suddenlink.net', 'cableone.net', 'yahoo.co.uk', 'hotmail.co.uk'];
const MAX_TEAM = 60;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n) : t; }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s(e)) && s(e).length <= 200; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
function domainOf(e){ const m = /@([^@\s]+)$/.exec(low(e)); return m ? m[1] : ''; }
function isFreeMail(e){ const d = domainOf(e); if (!d) return true; return FREE.indexOf(d) > -1 || /^(yahoo|hotmail|outlook|live|aol|gmx|yandex|icloud|proton)\./.test(d); }
function sameDomain(a, b){ const x = domainOf(a), y = domainOf(b); return !!x && x === y && !isFreeMail(a); }
function keySub(profId){ return 'sp:' + s(profId); }
function keyCrm(subId){ return 'crm:' + s(subId); }
function keyCust(identKey){ return 'cu:' + s(identKey); }
function nowIso(){ return new Date(D.now()).toISOString(); }
const D = { now: function(){ return Date.now(); } };   /* tests */

/* ── the store (sp_rows, service key) ── */
function sbUrl(){ return s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svc(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
function H(extra){ const k = svc(); return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}); }
function Fail(status, message){ const e = new Error(message); e.status = status; return e; }
async function q(qs){
  const r = await fetch(sbUrl() + '/rest/v1/sp_rows?select=key,id,user_id,email,data&collection=eq.' + COLL + (qs ? '&' + qs : '') + '&limit=5000', { headers: H() });
  if (!r.ok) throw Fail(503, 'The portal cannot read the team list just now. Try again in a minute.');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map(function(x){ return x && x.data; }).filter(function(m){ return m && s(m.id) && s(m.company); });
}
function inq(vals){ return 'in.(' + vals.map(function(v){ return '"' + String(v).replace(/["\\]/g, '') + '"'; }).join(',') + ')'; }
async function all(){ return q(''); }
async function ofCompany(keys){ keys = (Array.isArray(keys) ? keys : [keys]).map(s).filter(Boolean); if (!keys.length) return []; return q('user_id=' + encodeURIComponent(inq(keys))); }
/* every team row for this e-mail / phone (any company, any status) */
async function find(ident){
  if (!ident) return [];
  if (ident.kind === 'email') return q('email=eq.' + encodeURIComponent(low(ident.value)));
  const p = phone10(ident.value); if (!p) return [];
  return (await all()).filter(function(m){ return phone10(m.phone) === p; });
}
async function put(m, by){
  const r = await fetch(sbUrl() + '/rest/v1/sp_rows?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ key: COLL + '/' + m.id, collection: COLL, id: m.id, job_id: null, user_id: m.company, email: okEmail(m.email) ? low(m.email) : null, data: m, updated_at: nowIso(), updated_by: clip(by, 200) }]) });
  if (!r.ok) throw Fail(502, 'Could not save the team change (' + r.status + '). Try again.');
  return m;
}
function active(m){ return !!m && m.status === 'active'; }
/* the first ACTIVE row for this sign-in, of the given kind */
async function activeFor(ident, kind){ return (await find(ident)).filter(function(m){ return m.primary !== true && active(m) && (!kind || m.kind === kind); }).sort(function(a, b){ return s(a.addedAt).localeCompare(s(b.addedAt)); })[0] || null; }
function identOfMember(m){ const out = []; if (okEmail(m.email)) out.push('e:' + low(m.email)); if (phone10(m.phone)) out.push('p:' + phone10(m.phone)); return out; }

/* ── the primary contact: implicit (no row) until a person removes / restores them — then one row { primary: true } ── */
function priId(key){ return 'tp_' + crypto.createHash('sha256').update(s(key)).digest('hex').slice(0, 20); }
function priRow(rows){ return arr(rows).find(function(m){ return m.primary === true; }) || null; }
function members(rows){ return arr(rows).filter(function(m){ return m.primary !== true; }); }
function primaryOff(rows){ const p = priRow(rows); return !!p && p.status === 'removed'; }

/* ── what a team member sees of a coworker ── */
function actorOut(a){ return a ? { name: clip(a.name, 80), email: low(a.email), role: s(a.role) } : null; }
function view(m, me){
  return { id: s(m.id), name: clip(m.name, 80), email: low(m.email), phone: clip(m.phone, 40), status: s(m.status), via: s(m.via), addedAt: s(m.addedAt), addedBy: actorOut(m.addedBy),
    removedAt: s(m.removedAt), removedBy: actorOut(m.removedBy), notify: m.notify === true, invitedAt: s((arr(m.invites).slice(-1)[0] || {}).at), mine: !!me && s(me) === s(m.id) };
}
/* primary { name, email, phone } + rows → the team as shown. meId: the viewer's member id, or 'primary' */
function teamOut(primary, rows, meId){
  const list = [], pr = priRow(rows);
  if (primary) list.push({ id: 'primary', name: clip(primary.name, 80), email: low(primary.email), phone: clip(primary.phone, 40), status: pr && pr.status === 'removed' ? 'removed' : 'active', primary: true,
    notify: true, removedAt: pr ? s(pr.removedAt) : '', removedBy: pr ? actorOut(pr.removedBy) : null, mine: meId === 'primary' });
  members(rows).filter(function(m){ return m.status !== 'denied'; }).sort(function(a, b){ return s(a.addedAt).localeCompare(s(b.addedAt)); }).forEach(function(m){ list.push(view(m, meId)); });
  return list;
}
function activeCount(primary, rows){ return (primary && !primaryOff(rows) ? 1 : 0) + members(rows).filter(active).length; }
function logAdd(m, actor, op){ m.log = arr(m.log).concat([{ at: nowIso(), by: low(actor && actor.email), name: clip(actor && actor.name, 80), role: s(actor && actor.role), op: clip(op, 120) }]).slice(-100); }
function newId(){ return 'tm_' + D.now().toString(36) + crypto.randomBytes(4).toString('hex'); }

/* add a coworker. input { name, email, phone }; actor { email, name, role: 'member'|'primary'|'staff'|'signup' }.
   opt { kind, companyName, status, via, taken: async (email, phone) => '' | reason, primary: {email, phone} } */
async function add(keys, input, actor, opt){
  opt = opt || {};
  keys = (Array.isArray(keys) ? keys : [keys]).map(s).filter(Boolean); const key = keys[0];   /* keys[0]: where a new row is written */
  const name = clip(input && input.name, 80), email = low(input && input.email), phone = phone10(input && input.phone);
  if (!name) throw Fail(400, 'Type their name.');
  if (email && !okEmail(email)) throw Fail(400, 'That e-mail does not look right.');
  if (!email && !phone) throw Fail(400, 'Type their e-mail or mobile number.');
  const rows = members(await ofCompany(keys));
  if (rows.length >= MAX_TEAM) throw Fail(400, 'This team is full (' + MAX_TEAM + ' people). Call GrayCo to add more.');
  const pr = opt.primary || {};
  if ((email && low(pr.email) === email) || (phone && phone10(pr.phone) === phone)) throw Fail(409, 'That person is already on the team (the main contact).');
  const same = rows.find(function(m){ return (email && low(m.email) === email) || (phone && phone10(m.phone) === phone); });
  if (same && same.status === 'active') throw Fail(409, s(same.name) + ' is already on the team.');
  if (same && same.status === 'removed') throw Fail(409, s(same.name) + ' was removed from the team — use "Restore" next to their name.');
  if (same && same.status === 'verify' && opt.status !== 'verify') {   /* SECURITY (domain join waiting on its e-mail): a teammate adding them vouches for them */
    same.status = 'active'; same.decidedAt = nowIso(); same.decidedBy = { email: low(actor && actor.email), name: clip(actor && actor.name, 80), role: s(actor && actor.role) };
    delete same.verifyHash; delete same.verifyExp;
    logAdd(same, actor, 'added (was confirming their e-mail)');
    return put(same, actor && actor.email);
  }
  if (same && same.status === 'verify') throw Fail(409, s(same.name) + ' already signed up — they need to tap the confirm link in their e-mail.');
  if (same && same.status === 'requested' && opt.status !== 'requested') {   /* they asked to join; a teammate adding them vouches for them */
    same.status = 'active'; same.decidedAt = nowIso(); same.decidedBy = { email: low(actor && actor.email), name: clip(actor && actor.name, 80), role: s(actor && actor.role) };
    if (!s(same.name)) same.name = name;
    logAdd(same, actor, 'added (was asking to join)');
    return put(same, actor && actor.email);
  }
  if (same && same.status === 'requested') throw Fail(409, s(same.name) + ' already asked to join — GrayCo\'s office will decide.');
  const elsewhere = (email ? await find({ kind: 'email', value: email }) : []).concat(phone ? await find({ kind: 'phone', value: phone }) : [])
    .filter(function(m){ return keys.indexOf(m.company) < 0 && m.primary !== true && (m.status === 'active' || m.status === 'requested' || m.status === 'verify'); });
  if (elsewhere.length) throw Fail(409, 'That ' + (email ? 'e-mail' : 'number') + ' is already on another company\'s portal team. Call GrayCo ' + '901-585-0944' + '.');
  if (opt.taken) { const why = await opt.taken(email, phone); if (why) throw Fail(409, why); }
  const m = { id: newId(), company: key, kind: opt.kind === 'customer' ? 'customer' : 'sub', companyName: clip(opt.companyName, 120), name: name, email: email, phone: phone ? clip(input.phone, 40) : '',
    status: opt.status === 'requested' || opt.status === 'verify' ? opt.status : 'active', via: s(opt.via) || 'team', addedAt: nowIso(), addedBy: { email: low(actor && actor.email), name: clip(actor && actor.name, 80), role: s(actor && actor.role) },
    notify: false, invites: [], log: [] };
  if (same && same.status === 'denied') m.id = same.id;   /* a new request after "not this company": the same record, a new decision */
  if (m.status === 'verify') { const v = verifyToken(); m.verifyHash = v.hash; m.verifyExp = v.exp; m.__token = v.token; }
  logAdd(m, actor, m.status === 'requested' ? 'asked to join' : m.status === 'verify' ? 'signed up (company e-mail domain) — waiting for the e-mail confirm' : 'added');
  if (m.__token) { const tok = m.__token; delete m.__token; await put(m, actor && actor.email); return Object.assign({}, m, { verifyToken: tok }); }
  return put(m, actor && actor.email);
}
async function getOne(key, id){ const m = (await ofCompany(key)).find(function(x){ return s(x.id) === s(id) && x.primary !== true; }); if (!m) throw Fail(404, 'That person is not on this team.'); return m; }
/* op: remove | restore | approve | deny. opt { staff: true, primary: { off } } */
async function setStatus(keys, id, op, actor, opt){
  opt = opt || {};
  keys = (Array.isArray(keys) ? keys : [keys]).map(s).filter(Boolean); const key = keys[0];
  const rows = await ofCompany(keys);
  let m = s(id) === 'primary' ? priRow(rows) : rows.find(function(x){ return s(x.id) === s(id) && x.primary !== true; });
  if (!m && s(id) === 'primary' && opt.primary && (op === 'remove' || op === 'restore')) {   /* the primary's first remove: their row is made now */
    m = { id: priId(key), company: key, primary: true, kind: opt.kind === 'customer' ? 'customer' : 'sub', companyName: clip(opt.companyName, 120), name: clip(opt.primary.name, 80),
      email: low(opt.primary.email), phone: clip(opt.primary.phone, 40), crmSubId: s(opt.crmSubId), status: 'active', via: 'signup', addedAt: '', log: [] };
  }
  if (!m) throw Fail(404, 'That person is not on this team.');
  if (m.primary === true && (op === 'approve' || op === 'deny')) throw Fail(400, 'Bad request');
  const at = nowIso(), by = { email: low(actor && actor.email), name: clip(actor && actor.name, 80), role: s(actor && actor.role) };
  if (op === 'remove') {
    if (m.status === 'removed') return { member: m, unchanged: true };
    if (m.status !== 'active' && m.status !== 'requested' && m.status !== 'verify') throw Fail(400, 'That person is not active.');
    const others = rows.filter(function(x){ return x.id !== m.id; }).concat([Object.assign({}, m, { status: 'removed' })]);
    if (!opt.staff && m.status === 'active' && activeCount(opt.primary, others) < 1) throw Fail(409, 'That is the last active person on this team, so they can\'t be removed. Call GrayCo ' + '901-585-0944' + ' to close the account.');
    m.status = 'removed'; m.removedAt = at; m.removedBy = by; delete m.verifyHash; delete m.verifyExp;
  } else if (op === 'restore') {
    if (m.status === 'active') return { member: m, unchanged: true };
    if (m.status !== 'removed') throw Fail(400, 'Only a removed person can be restored.');
    m.status = 'active'; m.restoredAt = at; m.restoredBy = by;
  } else if (op === 'approve' || op === 'deny') {
    if (!opt.staff) throw Fail(403, 'Only GrayCo\'s office decides a request to join.');
    if (m.status !== 'requested') return { member: m, unchanged: true };
    m.status = op === 'approve' ? 'active' : 'denied'; m.decidedAt = at; m.decidedBy = by;
  } else throw Fail(400, 'Bad request');
  logAdd(m, actor, op);
  await put(m, by.email);
  return { member: m };
}
/* "Notify me" — only the member themselves */
async function setNotify(key, id, on, actor){
  const m = await getOne(key, id);
  if (!active(m)) throw Fail(400, 'That person is not active.');
  m.notify = on === true; m.notifyAt = nowIso(); m.notifyBy = low(actor && actor.email);
  logAdd(m, actor, on === true ? 'notifications on' : 'notifications off');
  await put(m, actor && actor.email);
  return m;
}
async function noteInvite(m, actor, how){ m.invites = arr(m.invites).concat([{ at: nowIso(), by: low(actor && actor.email), how: s(how) }]).slice(-20); logAdd(m, actor, 'invite ' + s(how)); return put(m, actor && actor.email); }
/* e-mails of the members who turned "Notify me" on (never the primary — they already get it) */
async function notifyList(keys){ try { return Array.from(new Set(members(await ofCompany(keys)).filter(function(m){ return active(m) && m.notify === true && okEmail(m.email); }).map(function(m){ return low(m.email); }))); } catch (e) { return []; } }

/* ── SECURITY: a domain auto-join proves the mailbox first (status 'verify' = no access) ──
   A one-time token (only its SHA-256 is stored), good for 24 hours, e-mailed to that address. Using it → 'active'. */
const VERIFY_MS = 24 * 3600e3;
function verifyToken(){ const token = crypto.randomBytes(32).toString('base64url'); return { token: token, hash: crypto.createHash('sha256').update(token).digest('hex'), exp: new Date(D.now() + VERIFY_MS).toISOString() }; }
/* a new token for a 'verify' row (re-sign-up / "send it again") → { member, token } */
async function reVerify(m, by){ if (!m || m.status !== 'verify') throw Fail(400, 'Nothing to confirm.'); const v = verifyToken(); m.verifyHash = v.hash; m.verifyExp = v.exp; logAdd(m, { email: by, role: 'signup' }, 'new confirm link'); await put(m, by); return { member: m, token: v.token }; }
async function confirm(token){
  token = s(token); if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw Fail(400, 'That confirm link is not right. Sign up again to get a new one.');
  const h = crypto.createHash('sha256').update(token).digest('hex');
  const m = (await all()).find(function(x){ return s(x.verifyHash) && crypto.timingSafeEqual(Buffer.from(s(x.verifyHash)), Buffer.from(h)); });
  if (!m) throw Fail(400, 'That confirm link was already used or is not right. Sign in, or sign up again to get a new one.');
  if (m.status !== 'verify') throw Fail(403, 'This sign-up can\'t be confirmed any more. Call GrayCo 901-585-0944.');
  if (Date.parse(s(m.verifyExp)) < D.now()) throw Fail(410, 'That confirm link has run out (24 hours). Sign up again with the same e-mail to get a new one.');
  m.status = 'active'; m.verifiedAt = nowIso(); delete m.verifyHash; delete m.verifyExp;
  logAdd(m, { email: m.email, name: m.name, role: 'signup' }, 'confirmed their e-mail');
  await put(m, m.email);
  return m;
}

/* ── the invite (a person's click) ── */
function mailOff(){ return process.env.PORTAL_MAIL_OFF === '1' || process.env.PORTAL_MAIL_OFF === 'true'; }
/* → { ok, held, paused, why } — tagged 'customer' so the customer quiet hours hold it and data-entry mode skips it */
async function sendEmail(to, subject, html, from){
  const key = s(process.env.RESEND_API_KEY);
  if (!key || mailOff()) return { ok: false, why: 'E-mail is not set up.' };
  const CQ = require('./custquiet.js');
  return CQ.run('customer', async function(){
    let r = null;
    try { r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from || 'GrayCo Portal <portal@grayco-cs.com>', reply_to: s(process.env.REPLY_TO_ADMIN) || 'replies@grayco-cs.com', to: [to], subject: subject, html: html }) }); }
    catch (e) { return { ok: false, why: 'The e-mail service did not answer.' }; }
    let held = null; try { held = CQ.heldOf(r); } catch (e) {}
    let paused = false; try { paused = !!(r && r.headers && r.headers.get && r.headers.get('x-gc-paused') === '1'); } catch (e) {}
    return { ok: !!(r && r.ok) && !paused, held: held, paused: paused, why: paused ? 'GrayCo has sending paused right now.' : (r && r.ok ? '' : 'The e-mail did not go out (' + (r ? r.status : 'no answer') + ').') };
  });
}
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function inviteMail(o){
  /* o { es, toName, byName, company, url, setPw } — the words never name the other portal (a customer never hears of the sub portal) */
  const es = !!o.es, first = s(o.toName).split(/\s+/)[0];
  const subj = es ? (s(o.byName) || 'Su compañía') + ' le agregó al Portal de GrayCo' : (s(o.byName) || 'Your team') + ' added you to the GrayCo Portal';
  const lines = es
    ? ['Hola ' + esc(first || '') + ',', esc(o.byName || 'Un compañero') + ' le agregó al Portal de GrayCo de <b>' + esc(o.company) + '</b>. Ya puede ver lo mismo que su equipo.',
      'Entre en ' + esc(s(o.url).replace(/^https:\/\//, '').replace(/\/$/, '')) + ' con este correo: le enviamos un código para entrar' + (o.setPw ? ', o elija una contraseña con el botón.' : '.')]
    : ['Hi ' + esc(first || 'there') + ',', esc(o.byName || 'A coworker') + ' added you to the GrayCo Portal for <b>' + esc(o.company) + '</b>. You can now see what your team sees.',
      'Sign in at ' + esc(s(o.url).replace(/^https:\/\//, '').replace(/\/$/, '')) + ' with this e-mail — we send you a sign-in code' + (o.setPw ? ', or choose a password with the button.' : '.')];
  const btn = o.setPw ? { href: o.setPw, label: es ? 'Elegir mi contraseña' : 'Choose my password' } : { href: o.url, label: es ? 'Abrir el Portal de GrayCo' : 'Open the GrayCo Portal' };
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A"><div style="background:#0F1D2F;color:#fff;padding:16px 20px;font-weight:700;font-size:16px;text-align:center">GrayCo Portal</div>'
    + '<div style="padding:20px;border:1px solid #EDE9E0;border-top:0">' + lines.map(function(l){ return '<p style="margin:0 0 10px;line-height:1.5">' + l + '</p>'; }).join('')
    + '<p style="margin:18px 0 0"><a href="' + esc(btn.href) + '" style="background:#D4A017;color:#14202E;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:700">' + esc(btn.label) + '</a></p>'
    + (o.setPw ? '<p style="margin:12px 0 0;font-size:13px"><a href="' + esc(o.url) + '">' + esc(o.url) + '</a></p>' : '')
    + '<p style="margin:18px 0 0;font-size:12px;color:#64748B">GrayCo Construction Services, LLC · 901-585-0944</p></div></div>';
  const text = (es ? 'GrayCo: ' + (s(o.byName) || 'Su compañía') + ' le agregó al Portal de GrayCo de ' + s(o.company) + '. Entre en ' : 'GrayCo: ' + (s(o.byName) || 'Your team') + ' added you to the GrayCo Portal for ' + s(o.company) + '. Sign in at ') + s(o.url) + (es ? ' con este número (le enviamos un código).' : ' with this number (we text you a code).');
  return { subject: subj, html: html, text: text };
}
/* send one invite for member m: e-mail when they have one, else a ready text for the clicker's own phone (sms: link).
   deps { url, setPw: async (email) => link|'' , company, byName, es } → { ok, how, sms?, held?, paused?, why? } */
async function invite(m, actor, deps){
  if (!active(m)) throw Fail(400, 'Only an active team member can be invited.');
  const mail = inviteMail({ es: deps.es, toName: m.name, byName: deps.byName || (actor && actor.name), company: deps.company || m.companyName, url: deps.url, setPw: '' });
  let out;
  if (okEmail(m.email)) {
    let setPw = ''; if (deps.setPw) { try { setPw = s(await deps.setPw(m.email)); } catch (e) { setPw = ''; } }
    const mm = setPw ? inviteMail({ es: deps.es, toName: m.name, byName: deps.byName || (actor && actor.name), company: deps.company || m.companyName, url: deps.url, setPw: setPw }) : mail;
    const r = await sendEmail(low(m.email), mm.subject, mm.html);
    out = { ok: r.ok || !!r.held, how: 'email', to: low(m.email), held: r.held || null, paused: !!r.paused, why: r.ok || r.held ? '' : r.why };
    if (!out.ok && phone10(m.phone)) out.sms = 'sms:' + phone10(m.phone) + '?body=' + encodeURIComponent(mail.text);
  } else out = { ok: true, how: 'sms', sms: 'sms:' + phone10(m.phone) + '?body=' + encodeURIComponent(mail.text) };
  if (out.ok) await noteInvite(m, actor, out.how + (out.held ? ' (held for 7 AM)' : ''));
  return out;
}

/* ── a new sign-up's company (subportal.js register) ──
   → { join: <company profile> } (an approved company with the same business e-mail domain — they join it at once),
     { ask: <company profile> } (a free-mail sign-up naming an approved company — the office decides), or {} */
function signupMatch(email, company, profiles, sameCompany, teamRows){
  const approved = profiles.filter(function(u){ return u && (u.role === 'sub' || u.role === 'supplier') && u.approved === true && u.bidsRevoked !== true && u.signinDisabled !== true && okEmail(u.email); });
  if (!isFreeMail(email)) {
    const d = domainOf(email);
    const byDomain = approved.filter(function(u){ return sameDomain(u.email, email) || arr(teamRows).some(function(m){ return m.company === keySub(u.id) && active(m) && domainOf(m.email) === d && m.via !== 'request'; }); })
      .sort(function(a, b){ return s(a.createdAt).localeCompare(s(b.createdAt)); });
    /* the same domain AND the same company name (or DBA) → join; the same domain under another name → the office decides */
    const named = byDomain.filter(function(u){ return sameCompany(company, u.company) || (u.dbaName && sameCompany(company, u.dbaName)); });
    if (named.length) return { join: named[0] };
    if (byDomain.length === 1) return { ask: byDomain[0] };
    return {};
  }
  const byName = approved.filter(function(u){ return sameCompany(company, u.company) || (u.dbaName && sameCompany(company, u.dbaName)); });
  return byName.length === 1 ? { ask: byName[0] } : {};
}

/* ── customers: the company key(s) of a job's customer, and residential vs GC / commercial ── */
function custOf(p, custs){ return arr(custs).find(function(x){ return low(x.name || x.company) === low(p && p.client) && s(p && p.client); }) || {}; }
function custKeys(p, c){
  const out = [];
  [p && p.clientEmail, p && p.email, c && c.email].map(low).filter(okEmail).forEach(function(e){ const k = keyCust('e:' + e); if (out.indexOf(k) < 0) out.push(k); });
  [p && p.clientPhone, p && p.phone, c && c.phone].map(phone10).filter(Boolean).forEach(function(x){ const k = keyCust('p:' + x); if (out.indexOf(k) < 0) out.push(k); });
  return out;
}
function commercial(p, c){
  return !!p && (p.gcJob === true || /commercial|\bgc\b|property|business/i.test(s(p.projectType) + ' ' + s(p.customerType)) || /^(gc|commercial|business|company|pm|property)/i.test(s(c && c.type)));
}
/* the customer company key → the sign-in it stands for ({ kind, value, key } like portal-access identOf) */
function custIdent(key){ const m = /^cu:(e|p):(.+)$/.exec(s(key)); if (!m) return null; return m[1] === 'e' ? { kind: 'email', value: m[2], key: 'e:' + m[2] } : { kind: 'phone', value: m[2], key: 'p:' + m[2] }; }

module.exports = { VERIFY_MS, verifyToken, reVerify, confirm, custOf, custKeys, commercial, custIdent, COLL, FREE, D, priId, priRow, members, primaryOff, domainOf, isFreeMail, sameDomain, keySub, keyCrm, keyCust, all, ofCompany, find, put, active, activeFor, identOfMember,
  view, teamOut, activeCount, add, getOne, setStatus, setNotify, noteInvite, notifyList, sendEmail, inviteMail, invite, signupMatch, phone10, okEmail };
