// netlify/functions/_lib/portalsignup.js — patch PORTALSIGNUP (owner 11/23: "also be able to tell customers to sign up on
// portal.grayco-cs.com and their name will match to what we already have in our CRM system for their job address etc and that's a
// way they can sign up or we send them a link too, let them choose customer, subcontractor, supplier and other as choices").
//
// The public sign-up on portal.grayco-cs.com ("New here? Sign up" → I am a: 🏠 Customer · 🔨 Subcontractor · 🧱 Supplier · ✉️ Other).
// Subcontractor / Supplier use the bid site's register (subportal.js, with its own e-mail confirm) — nothing here. This file is the
// Customer and Other paths, the staff's signed job link, and the ✅ Approvals card. portal-access.js wires the doors and hands its
// helpers in (D); portal.js calls onApproved / onRejected for the card (kind 'portal_signup').
//
//   start   {kind:'customer'|'other', name, email, phone, address, zip, po, contractName, message, job, lang}
//           → ALWAYS the same answer ("check your e-mail"); a one-time confirm link (only its SHA-256 kept, 24 h) goes to that address
//             (tagged 'reply': it is what they just asked for — same quiet-hours / data-entry rule as the sign-in code e-mail).
//             Limits: per address (portal-access, 'signup') and per e-mail (3 an hour, one e-mail a minute — quietly).
//   confirm {token} → the e-mail is theirs. Then, for a customer:
//             1. their e-mail is already on a job (customerMatch, as sign-in does today) → signed in to it;
//             2. they came through a staff link (signed, one job, 30 days) and their name matches that job's customer → in, that job only;
//             3. name + (address or PO) match a job, but the e-mail is not on it → NOT in: a ✅ Approvals card for the office / admins and
//                the job's PM with the evidence (a link with a name that does not match lands here too);
//             4. nothing matches → an office To-Do with what they typed.
//             The person sees the same "Thanks — GrayCo will connect your account…" for 3 and 4 (never whether a name / address exists).
//           For Other: an office To-Do with their message.
//   Grants: an approved / link sign-in keeps { pid, keys } on its row in gc_kv 'gc_portal_signups'; customerMatch (portal-access) adds
//           those jobs for that e-mail (and, when a person approved it, phone) — one job, never the customer's other jobs, and never a
//           change to anything a person typed on the job or the customer. 🗄 Remove access archives the grant (kept, who / when).
//   patch PORTALJOBS (owner 11/26: a customer with several jobs — Head Start, 5 jobs — "whoever signs in … must get linked to their jobs,
//           and if they aren't matched maybe they can request to be matched and admin can match them"): a PERSON picks, never the server.
//           • the ✅ Approvals card lists the customer's other jobs (same customerId / client name); the approver ticks ☑ this job (default),
//             ☐ all of <customer>'s jobs (N) or single jobs → s-su-decide {op:'approve', pids} → every ticked job is granted.
//           • the office To-Do for "no job matched" (kind portal_signup_match) → 🔗 Match to jobs… (office / admin picks jobs) → s-su-match.
//           The grant keeps its shape ({ pid, keys, via, at, by }) + pids (the list); grantPids reads pids (or pid on older grants).
//   patch PORTALJOBS2 (owner 11/26): the sign-up asks "What is the job address (or addresses) we are working on for you?" (one or
//           more: addresses[]); matching also uses the COMPANY e-mail domain (never a free-mail one: gmail, yahoo, outlook …) and the
//           customer / company name (e.g. "Head Start"). A domain or name match is a ✅ Approvals card with ALL the matched customer's
//           jobs offered and pre-ticked in the CRM — one tap; never an automatic grant (only the exact e-mail on a job lets in by itself).
'use strict';
const crypto = require('crypto');

const KEY = 'gc_portal_signups';
const VERIFY_MS = 24 * 3600e3, LINK_DAYS = 30, PER_HOUR = 3, MAIL_GAP_MS = 60e3;
const KIND = 'portal_signup';
const MSG = {
  en: { check: 'Check your e-mail — tap the link we sent to confirm it (it works for 24 hours). No e-mail? Check spam, or tap "Send it again".',
        wait: 'Thanks — GrayCo will connect your account to your job, usually within one business day. We will e-mail you when it is ready.',
        other: 'Thanks — GrayCo got your message and will get back to you, usually within one business day.' },
  es: { check: 'Revise su correo — toque el enlace que le enviamos para confirmarlo (sirve por 24 horas). ¿No le llegó? Revise el spam o toque "Enviar otra vez".',
        wait: 'Gracias — GrayCo conectará su cuenta con su trabajo, normalmente en un día hábil. Le enviaremos un correo cuando esté listo.',
        other: 'Gracias — GrayCo recibió su mensaje y le responderá, normalmente en un día hábil.' }
};
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); return t.length > n ? t.slice(0, n) : t; }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function okEmail(e){ return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s(e)) && s(e).length <= 200; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
function L(v){ return low(v) === 'es' ? 'es' : 'en'; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sha(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function nowIso(){ return new Date().toISOString(); }
function Fail(status, message, extra){ const e = new Error(message); e.status = status; e.extra = extra; return e; }

/* ── matching ─────────────────────────────────────────────────────────────── */
/* patch PORTALJOBS2: a company e-mail domain matches; a free-mail one never does */
const FREEMAIL = /^(gmail|googlemail|yahoo|ymail|rocketmail|outlook|hotmail|live|msn|icloud|me|mac|aol|aim|comcast|att|sbcglobal|bellsouth|verizon|charter|cox|earthlink|protonmail|proton|pm|gmx|mail|zoho|yandex|fastmail|hey|tutanota|frontier|windstream|centurylink|optonline|juno|netzero|q|inbox|email)\./;
function domainOf(e){ const m = /@([a-z0-9.-]+\.[a-z]{2,})$/.exec(low(e)); if (!m) return ''; const d = m[1].replace(/^(mail|email|smtp)\./, ''); return FREEMAIL.test(d) ? '' : d; }
function addrsOf(row){ const l = (Array.isArray(row.addresses) && row.addresses.length ? row.addresses : [row.address]).map(s).filter(Boolean); return l.filter(function(a, i){ return l.indexOf(a) === i; }); }
const NAME_SKIP = { and: 1, mr: 1, mrs: 1, ms: 1, dr: 1, jr: 1, sr: 1, ii: 1, iii: 1, the: 1, llc: 1, inc: 1, co: 1, family: 1 };
function nameTokens(v){ return low(v).replace(/&/g, ' ').replace(/[^a-z\s'-]/g, ' ').replace(/['-]/g, '').split(/\s+/).filter(function(w){ return w && !NAME_SKIP[w]; }); }
/* "Jane Smith" matches "John & Jane Smith" and "Smith, Jane"; not "John Smith" (that one goes to a person) */
function nameMatch(typed, target){
  const a = nameTokens(typed), b = nameTokens(target);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  if (a.length >= 2) return b.indexOf(a[0]) > -1 && b.indexOf(a[a.length - 1]) > -1;
  return false;
}
const STREET_SKIP = { st: 1, street: 1, ave: 1, av: 1, avenue: 1, rd: 1, road: 1, dr: 1, drive: 1, ln: 1, lane: 1, ct: 1, court: 1, cv: 1, cove: 1, blvd: 1, boulevard: 1, pl: 1, place: 1, pkwy: 1, parkway: 1,
  cir: 1, circle: 1, way: 1, ter: 1, terrace: 1, hwy: 1, highway: 1, trl: 1, trail: 1, n: 1, s: 1, e: 1, w: 1, north: 1, south: 1, east: 1, west: 1, ne: 1, nw: 1, se: 1, sw: 1, apt: 1, unit: 1, suite: 1, ste: 1 };
function addrParts(v){
  const t = low(v).replace(/[#.,]/g, ' ');
  const zip = (/[a-z,]\s*(\d{5})(?:-\d{4})?\s*$/.exec(t) || [])[1] || '';
  const first = low(v).split(',')[0].replace(/[#.]/g, ' ');
  const num = (/^\s*(\d{1,6})[a-z]?\b/.exec(first) || [])[1] || '';
  const words = first.replace(/^\s*\d{1,6}[a-z]?\b/, ' ').split(/\s+/).filter(function(w){ return w && /[a-z]/.test(w) && !STREET_SKIP[w] && !/^\d/.test(w); });
  return { num: num, words: words, zip: zip };
}
/* the same house: house number + a street word in common, or house number + ZIP */
function addrMatch(typed, typedZip, target){
  const a = addrParts(typed), b = addrParts(target), zip = s(typedZip).replace(/\D/g, '').slice(0, 5) || a.zip;
  if (!a.num || !b.num || a.num !== b.num) return false;
  if (a.words.some(function(w){ return b.words.indexOf(w) > -1; })) return true;
  return !!(zip && b.zip && zip === b.zip);
}
function normPo(v){ return low(v).replace(/^(po|job|#)\s*/, '').replace(/[^a-z0-9]/g, ''); }
function custOf(data, p){
  const custs = arr(data.customers), id = s(p.customerId || p.clientId || p.custId);
  return (id && custs.find(function(c){ return s(c.id) === id; })) || custs.find(function(c){ return s(p.client) && low(c.name || c.company) === low(p.client); }) || {};
}
function evidenceFor(data, p, row){
  const c = custOf(data, p), why = [];
  const names = [p.client, p.customerName, p.customer, c.name, c.company, [c.firstName, c.lastName].filter(Boolean).join(' ')].filter(function(x){ return s(x); });
  const hitName = names.find(function(n){ return nameMatch(row.name, n) || (row.contractName && nameMatch(row.contractName, n)); });
  const hitCo = row.contractName ? names.find(function(n){ return nameMatch(row.contractName, n); }) : '';   /* patch PORTALJOBS2: the company / contract name they typed */
  if (hitName) why.push({ k: 'name', typed: nameMatch(row.name, hitName) ? row.name : row.contractName, crm: s(hitName) });
  const addrs = [p.address, p.jobAddress, c.address].filter(function(x){ return s(x); });
  let hitAddr = '', hitTyped = '';
  addrsOf(row).some(function(t, i){ const z = i === 0 ? row.zip : ''; const a = addrs.find(function(x){ return addrMatch(t, z, x); }); if (a) { hitAddr = a; hitTyped = [t, z].filter(Boolean).join(' '); } return !!a; });   /* patch PORTALJOBS2: any of the addresses they typed */
  if (hitAddr) why.push({ k: 'address', typed: hitTyped, crm: s(hitAddr) });
  const pos = [p.autoPO, p.po, p.jobNumber, p.jobNo].map(normPo).filter(Boolean);
  if (row.po && pos.indexOf(normPo(row.po)) > -1) why.push({ k: 'po', typed: row.po, crm: s(p.autoPO || p.po || p.jobNumber || p.jobNo) });
  const emails = [p.clientEmail, p.email, c.email].map(low).filter(Boolean), phones = [p.clientPhone, p.phone, c.phone].map(phone10).filter(Boolean);
  if (row.email && emails.indexOf(low(row.email)) > -1) why.push({ k: 'email', typed: row.email, crm: row.email });
  const dom = domainOf(row.email);   /* patch PORTALJOBS2: the same company e-mail domain (never free-mail) */
  if (dom && !why.some(function(x){ return x.k === 'email'; })) { const hit = emails.find(function(e){ return domainOf(e) === dom; }); if (hit) why.push({ k: 'domain', typed: '@' + dom, crm: hit.replace(/^[^@]*/, '…') }); }
  if (phone10(row.phone) && phones.indexOf(phone10(row.phone)) > -1) why.push({ k: 'phone', typed: row.phone, crm: row.phone, note: 'not confirmed — typed by them' });
  const has = function(k){ return why.some(function(x){ return x.k === k; }); };
  return { why: why, name: has('name'), addr: has('address'), po: has('po'), phone: has('phone'), domain: has('domain'), company: !!hitCo, score: (has('name') ? 4 : 0) + (has('address') ? 3 : 0) + (has('po') ? 3 : 0) + (has('domain') ? 3 : 0) + (has('phone') ? 1 : 0) };
}
/* patch PORTALJOBS: the same customer's live jobs (customerId, else the client name) — what the approver may tick */
function custJobs(live, p){
  const cid = s(p.customerId || p.clientId || p.custId), nm = low(p.client);
  return live.filter(function(x){ const xc = s(x.customerId || x.clientId || x.custId); return (cid && xc === cid) || (nm && low(x.client) === nm && (!cid || !xc)); });
}
function jobBrief(p){ return { id: s(p.id), name: s(p.name), address: s(p.address || p.jobAddress), po: s(p.autoPO || p.po), client: s(p.client), pm: s(p.pm || p.projectManager) }; }

/* ── the staff link token: v1.<pid b64url>.<exp secs>.<sig> (HMAC with the server key — one job, expiring) ── */
function linkSign(D, pid, expSec){ return D.hmac('psu|' + pid + '|' + expSec).slice(0, 40); }
function linkMakeToken(D, pid, days){
  const exp = Math.floor(Date.now() / 1000) + (days || LINK_DAYS) * 86400;
  return 'v1.' + Buffer.from(String(pid)).toString('base64url') + '.' + exp + '.' + linkSign(D, pid, exp);
}
function linkRead(D, tok){
  const m = /^v1\.([A-Za-z0-9_-]{1,160})\.(\d{9,11})\.([0-9a-f]{40})$/.exec(s(tok));
  if (!m) return { ok: false, why: 'bad' };
  let pid = ''; try { pid = Buffer.from(m[1], 'base64url').toString('utf8'); } catch (e) { return { ok: false, why: 'bad' }; }
  const good = linkSign(D, pid, m[2]);
  if (!crypto.timingSafeEqual(Buffer.from(good), Buffer.from(m[3]))) return { ok: false, why: 'bad' };
  if (+m[2] * 1000 < Date.now()) return { ok: false, why: 'expired', pid: pid };
  return { ok: true, pid: pid, exp: new Date(+m[2] * 1000).toISOString() };
}

/* ── the rows (gc_kv 'gc_portal_signups', the CRM's own safe list writer from portal.js) ── */
async function rows(D){ const r = await D.core().kvListRead(KEY); return r ? r.list : []; }
async function upd(D, id, fn){
  const r = await D.core().kvListUpdate(KEY, function(l){ const x = l.find(function(y){ return s(y.id) === s(id); }); if (!x) return null; const out = fn(x); if (out === false) return { list: null, result: x }; x.updatedAt = nowIso(); return { list: l, result: x, check: function(l2){ return l2.some(function(y){ return s(y.id) === s(id) && y.updatedAt === x.updatedAt; }); } }; });
  if (!r.ok) throw Fail(503, 'The sign-up list is busy — try again in a moment.');
  return r.result;
}
function log(x, what, by){ x.history = (Array.isArray(x.history) ? x.history : []).concat([{ at: nowIso(), what: clip(what, 200), by: by ? { email: low(by.email), name: s(by.name), role: s(by.role) } : null }]).slice(-30); }

/* ── public: start ─────────────────────────────────────────────────────────── */
async function start(body, ip, D){
  const lang = L(body.lang), kind = s(body.kind) === 'other' ? 'other' : 'customer';
  const email = low(body.email), name = clip(body.name, 80);
  if (!name) throw Fail(400, lang === 'es' ? 'Escriba su nombre.' : 'Enter your name.');
  if (!okEmail(email)) throw Fail(400, lang === 'es' ? 'Escriba un correo válido.' : 'Enter a valid e-mail address.');
  const phone = clip(body.phone, 40);
  const addresses = [body.address].concat(Array.isArray(body.addresses) ? body.addresses : []).map(function(a){ return clip(a, 160); }).filter(Boolean).filter(function(a, i, l){ return l.indexOf(a) === i; }).slice(0, 10);   /* patch PORTALJOBS2 */
  if (kind === 'customer') {
    if (!phone10(phone)) throw Fail(400, lang === 'es' ? 'Escriba su número de celular (10 dígitos).' : 'Enter your mobile number (10 digits).');
    if (!addresses.length) throw Fail(400, lang === 'es' ? 'Escriba la dirección del trabajo.' : 'Enter the job address.');
  } else if (!s(body.message)) throw Fail(400, lang === 'es' ? 'Escriba su mensaje.' : 'Type your message.');
  const same = { ok: true, sent: true, verify: true, message: MSG[lang].check };
  const t = Date.now(), list = await rows(D);
  const mine = list.filter(function(x){ return low(x.email) === email && Date.parse(x.createdAt) > t - 3600e3; });
  if (mine.length >= PER_HOUR) return same;                                 /* quietly: the same answer, nothing sent */
  if (mine.some(function(x){ return Date.parse(x.mailedAt || x.createdAt) > t - MAIL_GAP_MS; })) return same;
  const jt = s(body.job) ? linkRead(D, body.job) : null;
  const token = crypto.randomBytes(32).toString('base64url');
  const row = { id: 'SU' + t.toString(36) + crypto.randomBytes(4).toString('hex'), kind: kind, status: 'unconfirmed', lang: lang, name: name, email: email, phone: phone,
    address: addresses[0] || '', addresses: addresses, zip: clip(s(body.zip).replace(/[^0-9-]/g, ''), 10), po: clip(body.po, 40), contractName: clip(body.contractName, 120), message: clip(body.message, 2000),
    link: jt ? (jt.ok ? { pid: jt.pid, exp: jt.exp } : { bad: jt.why }) : null, verifyHash: sha(token), verifyExp: new Date(t + VERIFY_MS).toISOString(),
    ipKey: D.hmac('ip|' + ip).slice(0, 16), createdAt: nowIso(), updatedAt: nowIso(), mailedAt: nowIso(), history: [] };
  log(row, 'signed up on the portal (' + kind + ')' + (jt ? (jt.ok ? ' through a GrayCo sign-up link' : ' with a ' + jt.why + ' sign-up link') : ''));
  const has = function(l){ return l.some(function(x){ return x.id === row.id; }); };
  const w = await D.core().kvListUpdate(KEY, function(l){ return has(l) ? null : { list: l.concat([row]), check: has }; });
  if (!w.ok) throw Fail(503, lang === 'es' ? 'Intente otra vez en un momento.' : 'Please try again in a moment.');
  const url = D.portalBase() + '/?signup-confirm=' + encodeURIComponent(token);
  const es = lang === 'es';
  await require('./custquiet.js').run('reply', function(){ return D.sendMail(email, es ? 'Confirme su correo — Portal GrayCo' : 'Confirm your e-mail — GrayCo Portal',
    D.mailHtml(es ? 'Confirme su correo' : 'Confirm your e-mail',
      es ? 'Hola ' + name.split(/\s+/)[0] + ', toque el botón para confirmar su correo y terminar su registro en el Portal GrayCo. Sirve una vez, por 24 horas. Si usted no se registró, ignore este correo.'
         : 'Hi ' + name.split(/\s+/)[0] + ', tap the button to confirm your e-mail and finish signing up for the GrayCo Portal. It works once, for 24 hours. If you did not sign up, ignore this e-mail — nothing happens.',
      '', { href: url, label: es ? 'Confirmar mi correo' : 'Confirm my e-mail' })); });   /* what they just asked for: like the sign-in code */
  return same;
}

/* ── public: confirm ───────────────────────────────────────────────────────── */
async function confirm(body, ip, D){
  const tok = s(body.token);
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(tok)) throw Fail(400, 'That confirm link is not right. Sign up again to get a new one.');
  const h = sha(tok), list = await rows(D);
  const row0 = list.find(function(x){ return s(x.verifyHash).length === 64 && crypto.timingSafeEqual(Buffer.from(s(x.verifyHash)), Buffer.from(h)); });
  if (!row0 || row0.status !== 'unconfirmed') throw Fail(400, 'That confirm link was already used or is not right. Sign in, or sign up again.');
  if (Date.parse(row0.verifyExp) < Date.now()) throw Fail(410, 'That confirm link has run out (24 hours). Sign up again to get a new one.');
  /* one use: the hash goes, the row is confirmed (a second tap finds nothing) */
  const nonce = crypto.randomBytes(8).toString('hex');
  const row = await upd(D, row0.id, function(x){ if (x.status !== 'unconfirmed' || x.verifyHash !== row0.verifyHash) return false; x.status = 'confirmed'; x.confirmedAt = nowIso(); x.confirmNonce = nonce; delete x.verifyHash; delete x.verifyExp; log(x, 'confirmed the e-mail'); });
  if (!row || row.confirmNonce !== nonce) throw Fail(400, 'That confirm link was already used. Sign in, or sign up again.');
  const lang = L(row.lang);
  if (row.kind === 'other') {
    await D.core().officeTodo('psu_' + row.id, '✉️ Portal sign-up (Other): ' + row.name + ' — ' + row.email + (row.phone ? ' · ' + row.phone : ''),
      'Signed up on portal.grayco-cs.com as "Other" (e-mail confirmed).\nMessage: ' + row.message + '\nReply to them by e-mail or phone. If they are a customer, open the job → 🏠 Portal → 🔗 Portal sign-up link and send it to them.');
    await upd(D, row.id, function(x){ x.status = 'todo'; x.outcome = 'other'; log(x, 'office To-Do'); });
    return { ok: true, done: true, message: MSG[lang].other };
  }
  const data = await D.crmData(true);
  const idE = { kind: 'email', value: row.email, key: 'e:' + row.email };
  /* 1. their (now confirmed) e-mail is already on a job: signed in, as sign-in does today */
  const m = await D.customerMatch(data, idE);
  if (m && m.links && m.links.length) {
    await upd(D, row.id, function(x){ x.status = 'in'; x.outcome = 'email-on-job'; x.pids = m.pids || []; log(x, 'signed in — the e-mail is on the job'); });
    return { ok: true, in: true, kind: 'customer', session: await D.sessionCreate('customer', D.hmac(idE.key), null, m.links) };
  }
  const live = D.liveProjects(data);
  /* 2. the staff link: that job, the name on it */
  if (row.link && row.link.pid) {
    const p = live.find(function(x){ return s(x.id) === s(row.link.pid); });
    if (p) {
      const ev = evidenceFor(data, p, row);
      if (ev.name) {
        const g = await grant(D, data, row.id, p, ['e:' + row.email], null, 'link-name');
        if (g.links.length) return { ok: true, in: true, kind: 'customer', session: await D.sessionCreate('customer', D.hmac(idE.key), null, g.links) };
      }
      await card(D, data, row, p, ev, 'came through GrayCo\'s sign-up link for this job, but the name does not match the job\'s customer');
      return { ok: true, waiting: true, message: MSG[lang].wait };
    }
  }
  /* 3. name + address (or PO): a person decides */
  const cands = live.map(function(p){ return { p: p, ev: evidenceFor(data, p, row) }; }).filter(function(c){ return c.ev.score > 0; }).sort(function(a, b){ return b.ev.score - a.ev.score; });
  const strong = cands.filter(function(c){ return c.ev.name && (c.ev.addr || c.ev.po); });
  if (strong.length) {
    const how = 'matched by name + ' + (strong[0].ev.addr && strong[0].ev.po ? 'address + PO' : strong[0].ev.addr ? 'address' : 'PO');
    await card(D, data, row, strong[0].p, strong[0].ev, how, strong.slice(1, 4).map(function(c){ return jobBrief(c.p); }), strong.slice(1).map(function(c){ return c.p; }));
    return { ok: true, waiting: true, message: MSG[lang].wait };
  }
  /* patch PORTALJOBS2: the company e-mail domain, the customer / company name, or address + PO / phone → a person decides (all of them offered) */
  const company = cands.filter(function(c){ return c.ev.domain || c.ev.company || (c.ev.addr && (c.ev.po || c.ev.phone)); });   /* a person's name alone stays with the office (To-Do) */
  if (company.length) {
    const e0 = company[0].ev, how = 'matched by ' + [e0.domain ? 'company e-mail domain' : '', e0.company ? 'customer / company name' : '', e0.addr ? 'address' : '', e0.po ? 'PO' : '', e0.phone ? 'phone' : ''].filter(Boolean).join(' + ');
    await card(D, data, row, company[0].p, e0, how + (company.length > 1 ? ' (' + company.length + ' jobs)' : ''), [], company.slice(1).map(function(c){ return c.p; }));
    return { ok: true, waiting: true, message: MSG[lang].wait };
  }
  /* 4. no match: the office */
  const weak = cands.slice(0, 3).map(function(c){ return '• ' + [c.p.name, c.p.address].filter(Boolean).join(' — ') + ' (' + c.ev.why.map(function(w){ return w.k; }).join(', ') + ')'; }).join('\n');
  await D.core().officeTodo('psu_' + row.id, '🏠 Portal sign-up — no job match: ' + row.name + ' (' + row.email + ')',
    'A customer signed up on portal.grayco-cs.com (e-mail confirmed) and no job matched their name + address.\n'
    + 'Name: ' + row.name + '\nE-mail: ' + row.email + '\nMobile: ' + row.phone + '\nJob address' + (addrsOf(row).length > 1 ? 'es: ' : ': ') + addrsOf(row).map(function(a, i){ return i === 0 ? [a, row.zip].filter(Boolean).join(' ') : a; }).join(' / ')
    + (row.po ? '\nPO / job #: ' + row.po : '') + (row.contractName ? '\nName on the contract: ' + row.contractName : '')
    + (weak ? '\nClose (not enough to match):\n' + weak : '')
    + '\nTo connect them: tap 🔗 Match to jobs… and pick their job(s) (one or several) — or open their job → 🏠 Portal → 🔗 Portal sign-up link, and send it to them (they sign up again through it). They were told: "GrayCo will connect your account to your job, usually within one business day."',
    { kind: 'portal_signup_match', signupId: row.id });   /* patch PORTALJOBS: the To-Do's action is 🔗 Match to jobs… */
  await upd(D, row.id, function(x){ x.status = 'todo'; x.outcome = 'no-match'; log(x, 'no job matched — office To-Do'); });
  return { ok: true, waiting: true, message: MSG[lang].wait };
}

/* ── the ✅ Approvals card ─────────────────────────────────────────────────── */
async function card(D, data, row, p, ev, how, others, matched){
  const C = D.core(), j = jobBrief(p), qid = 'appr_psu_' + row.id;
  const rel0 = custJobs(D.liveProjects(data), p).concat(Array.isArray(matched) ? matched : []);   /* patch PORTALJOBS(2): the customer's jobs + every job that matched */
  const related = rel0.filter(function(x, i){ return s(x.id) !== s(p.id) && rel0.findIndex(function(y){ return s(y.id) === s(x.id); }) === i; }).slice(0, 60).map(jobBrief);
  const title = row.name + ' asks for portal access to ' + (j.name || 'a job') + (j.address ? ' (' + j.address + ')' : '') + ' — ' + how;
  const tr = function(k, v){ return '<tr><td style="color:#55626F;padding:2px 10px 2px 0;vertical-align:top">' + esc(k) + '</td><td style="padding:2px 0">' + v + '</td></tr>'; };
  const html = '<p><b>' + esc(title) + '</b></p><table style="font-size:14px">'
    + tr('They typed', esc([row.name, row.email + ' (confirmed)', row.phone + ' (not confirmed)', addrsOf(row).map(function(a, i){ return i === 0 ? [a, row.zip].filter(Boolean).join(' ') : a; }).join(' / '), row.po ? 'PO ' + row.po : '', row.contractName ? 'contract: ' + row.contractName : ''].filter(Boolean).join(' · ')))
    + tr('The job', esc([j.po ? (/^po\b/i.test(j.po) ? j.po : 'PO ' + j.po) : '', j.name, j.address, j.client ? 'customer: ' + j.client : ''].filter(Boolean).join(' · ')))
    + tr('Matched', esc(ev.why.map(function(w){ return w.k + ': "' + w.typed + '" = "' + w.crm + '"' + (w.note ? ' (' + w.note + ')' : ''); }).join(' · ') || 'nothing but the link'))
    + (related.length ? tr('Their other jobs (' + related.length + ')', esc(related.map(function(o){ return o.name; }).join(' · ')) + ' — all ticked on the card in the CRM (untick any that are not theirs)') : '')
    + (others && others.length ? tr('Also close', esc(others.map(function(o){ return [o.name, o.address].filter(Boolean).join(' — '); }).join(' · '))) : '')
    + '</table><p style="font-size:13px;color:#55626F">Approve: their e-mail and mobile become an extra portal contact on this job (nothing on the job or the customer record is changed) and they get a "you are connected" e-mail. Not this job: pick the right job, or deny.</p>';
  await C.queueApproval({ id: qid, kind: KIND, pid: s(p.id), jobName: j.name, pm: C.pmOf(data, p), title: title, to: row.email, subject: title, html: html, attachments: [],
    meta: { signupId: row.id, pid: s(p.id), how: how, evidence: ev.why, typed: { name: row.name, email: row.email, phone: row.phone, address: row.address, addresses: addrsOf(row), zip: row.zip, po: row.po, contractName: row.contractName }, others: others || [], related: related } });
  await upd(D, row.id, function(x){ x.status = 'approval'; x.outcome = 'card'; x.apprId = qid; x.pid = s(p.id); x.relatedIds = related.map(function(r){ return r.id; }); log(x, '✅ Approvals card (' + how + ')'); });
}

/* a grant: this person may open these jobs (e-mail, and phone when a person approved it) — each job's link made if it is missing.
   patch PORTALJOBS: ps = one job or the list a person ticked; the record keeps pid (the first) + pids (all). */
async function grant(D, data, id, ps, keys, by, via){
  const C = D.core(), list = (Array.isArray(ps) ? ps : [ps]).filter(Boolean);
  const links = [];
  for (const p of list) { try { const t = p.portalOff ? '' : await C.createFor(s(p.id), 'portal sign-up'); if (t) links.push(t); } catch (e) {} }
  const pids = list.map(function(p){ return s(p.id); });
  await upd(D, id, function(x){ x.status = 'granted'; x.outcome = via; x.pid = pids[0]; x.grant = { pid: pids[0], pids: pids, keys: keys, via: via, at: nowIso(), by: by ? { email: low(by.email), name: s(by.name), role: s(by.role) } : null };
    log(x, via === 'link-name' ? 'signed in — GrayCo\'s link + the name on the job' : (via === 'matched' ? 'matched by the office to ' : 'approved for ') + list.map(function(p){ return s(p.name); }).join(', '), by); });
  return { links: links, pids: pids };
}
function grantList(g){ return g ? (Array.isArray(g.pids) && g.pids.length ? g.pids : [g.pid]).map(s).filter(Boolean) : []; }
/* for customerMatch: the jobs granted to this e-mail / phone (the jobs a person picked; archived grants never count) */
async function grantPids(D, id){
  let list = []; try { list = await rows(D); } catch (e) { return { pids: [], email: '' }; }
  const out = { pids: [], email: '' };
  list.forEach(function(x){ if (x.status === 'granted' && x.grant && Array.isArray(x.grant.keys) && x.grant.keys.indexOf(id.key) > -1 && grantList(x.grant).length) { grantList(x.grant).forEach(function(pid){ if (out.pids.indexOf(pid) < 0) out.pids.push(pid); }); out.email = out.email || low(x.email); } });
  return out;
}
async function grantKeysForIdent(D, identHmac){
  let list = []; try { list = await rows(D); } catch (e) { return []; }
  const x = list.find(function(r){ return r.status === 'granted' && r.grant && (r.grant.keys || []).some(function(k){ return D.hmac(k) === identHmac; }); });
  return x ? x.grant.keys.slice() : [];
}

/* portal.js aqSend: the card was approved (the PM, the office or an admin) → the grant + the "you are connected" e-mail (the click sent it) */
async function onApproved(item, now, D){
  const m = item.meta || {}, id = s(m.signupId), pid = s(item.jobId || m.pid);
  const data = await D.crmData(true);
  const p = D.liveProjects(data).find(function(x){ return s(x.id) === pid; });
  if (!p) return { ok: false, error: 'That job is not active any more — pick another job (Not this job).' };
  const row = (await rows(D)).find(function(x){ return s(x.id) === id; });
  if (!row) return { ok: false, error: 'The sign-up is not on the list any more.' };
  const by = (item.approvals || []).slice(-1)[0] || null;
  /* patch PORTALJOBS: the jobs the approver ticked (this job + the customer's other jobs) — checked again: live and the same customer */
  const live = D.liveProjects(data), relIds = (Array.isArray(m.related) ? m.related : []).map(function(r){ return s(r && r.id); }), same = custJobs(live, p).concat(live.filter(function(x){ return relIds.indexOf(s(x.id)) > -1; }));
  const picked = [p].concat((Array.isArray(m.pick) ? m.pick : []).map(s).filter(function(x){ return x !== s(p.id); }).map(function(x){ return same.find(function(j){ return s(j.id) === x; }); }).filter(Boolean));
  const keys = ['e:' + low(row.email)].concat(phone10(row.phone) ? ['p:' + phone10(row.phone)] : []);
  const g = await grant(D, data, id, picked, keys, by ? { email: by.email, name: by.by, role: by.role } : null, 'approved');
  const sent = await connectedMail(D, row, picked);
  return { ok: true, granted: true, jobs: g.pids.length, linkOn: g.links.length > 0, mailed: !!(sent && sent.ok) };
}
/* "Your GrayCo Portal is ready" (the approver's / matcher's click sent it) */
async function connectedMail(D, row, ps){
  const es = L(row.lang) === 'es', first = s(row.name).split(/\s+/)[0], p = ps[0] || {}, n = ps.length;
  const where = n > 1 ? (es ? 'sus ' + n + ' proyectos' : 'your ' + n + ' projects') : (es ? 'su proyecto' + (p.address ? ' en ' + s(p.address) : '') : 'your project' + (p.address ? ' at ' + s(p.address) : ''));
  return D.sendMail(row.email, es ? 'Su Portal GrayCo está listo' : 'Your GrayCo Portal is ready',
    D.mailHtml(es ? 'Ya está conectado' : 'You are connected',
      es ? 'Hola ' + first + ', GrayCo conectó su cuenta con ' + where + '. Entre en ' + D.portalBase().replace(/^https:\/\//, '') + ' con ' + row.email + ' — toque "¿Olvidó su contraseña?" para recibir un código.'
         : 'Hi ' + first + ', GrayCo connected your account to ' + where + '. Sign in at ' + D.portalBase().replace(/^https:\/\//, '') + ' with ' + row.email + ' — tap "Forgot password?" to get a sign-in code.',
      '', { href: D.portalBase() + '/', label: es ? 'Abrir mi Portal GrayCo' : 'Open my GrayCo Portal' },
      es ? 'Consejo: agréguelo a la pantalla de inicio de su teléfono y funciona como una app — iPhone: Compartir → Agregar a inicio; Android: ⋮ → Instalar app.' : "Tip: add it to your phone's home screen and it works like an app — iPhone: Share → Add to Home Screen; Android: ⋮ → Install app."));   /* patch A2HS: the home-screen tip */
}
async function onRejected(item, me, D){
  const id = s((item.meta || {}).signupId); if (!id) return;
  await upd(D, id, function(x){ x.status = 'denied'; x.decidedAt = nowIso(); x.decidedBy = me ? { email: low(me.email), name: s(me.by), role: s(me.role) } : null; log(x, 'not approved (no access)', me ? { email: me.email, name: me.by, role: me.role } : null); });
}

/* the jobs the card offers besides its own: the customer's jobs + the ones the sign-up matched (kept on the card), live only */
function relatedFor(D, data, x, p){
  const live = D.liveProjects(data), out = custJobs(live, p);
  (Array.isArray(x.relatedIds) ? x.relatedIds : []).forEach(function(id){ const j = live.find(function(y){ return s(y.id) === s(id); }); if (j) out.push(j); });
  return out.filter(function(j, i){ return s(j.id) !== s(p.id) && out.findIndex(function(y){ return s(y.id) === s(j.id); }) === i; }).slice(0, 60).map(jobBrief);
}
/* ── staff ─────────────────────────────────────────────────────────────────── */
/* the approval list's answer → this door's: its own status (403 not yours, 409 already decided …) */
function aqOut(r){ const o = (r && r.out) || {}; if (!r || r.status >= 400) throw Fail(r ? r.status : 502, s(o.error) || 'Could not do that — try again.'); return Object.assign({}, o, { item: undefined }); }
function isOfficeOrAdmin(D, who){ return D.isAdmin(who) || /office/.test(low(who.role)) || who.office === true; }
async function staff(action, body, who, D){
  const C = D.core();
  if (action === 's-su-link') {   /* 🔗 Portal sign-up link for one job (any GrayCo staff; sending is their own click) */
    const data = await D.crmData(true), pid = s(body.projectId);
    const p = D.liveProjects(data).find(function(x){ return s(x.id) === pid; });
    if (!p) throw Fail(404, 'That job is not active (or not in the cloud yet).');
    const tok = linkMakeToken(D, pid, LINK_DAYS), url = D.portalBase() + '/?signup=customer&job=' + tok;
    const list = (await rows(D)).filter(function(x){ return s(x.pid) === pid || s(x.link && x.link.pid) === pid; }).map(function(x){
      return { id: x.id, name: x.name, email: x.email, phone: x.phone, status: x.status, via: x.outcome || '', at: x.updatedAt, by: x.grant && x.grant.by ? x.grant.by.name || x.grant.by.email : '', removedBy: x.removedBy ? x.removedBy.name || x.removedBy.email : '' }; });
    const c = custOf(data, p), first = s(p.client).split(/\s+/)[0];
    return { ok: true, url: url, expires: new Date(Date.now() + LINK_DAYS * 86400e3).toISOString(), linkOn: !p.portalOff, email: low(p.clientEmail || p.email || c.email), phone: s(p.clientPhone || p.phone || c.phone),
      message: 'Hi ' + (first || 'there') + ', this is GrayCo. Sign up for your GrayCo Portal here (your project page: updates, photos, documents and payments): ' + url + ' — it works for ' + LINK_DAYS + ' days.', signups: list, canRemove: isOfficeOrAdmin(D, who) };
  }
  if (action === 's-su-get') {
    const x = (await rows(D)).find(function(r){ return s(r.id) === s(body.id) || s(r.apprId) === s(body.id); });
    if (!x) throw Fail(404, 'That sign-up is not on the list.');
    const data = await D.crmData(false), p = x.pid ? D.liveProjects(data).find(function(j){ return s(j.id) === s(x.pid); }) : null;
    return { ok: true, signup: { id: x.id, kind: x.kind, status: x.status, name: x.name, email: x.email, phone: x.phone, address: x.address, addresses: addrsOf(x), zip: x.zip, po: x.po, contractName: x.contractName, link: x.link || null, createdAt: x.createdAt, confirmedAt: x.confirmedAt, history: x.history || [] },
      job: p ? jobBrief(p) : null, evidence: p ? evidenceFor(data, p, x).why : [], canMove: isOfficeOrAdmin(D, who),
      customer: p ? s(p.client) : '', related: p ? relatedFor(D, data, x, p) : [],   /* patch PORTALJOBS(2) */
      granted: x.status === 'granted' ? grantList(x.grant) : [], canMatch: x.kind === 'customer' && x.status === 'todo' && isOfficeOrAdmin(D, who) };
  }
  if (action === 's-su-decide') {   /* ✅ Approve · ↪ Not this job → another job · ✖ Deny — the approval list's own rules (role: the job's PM, office, admin) */
    const op = s(body.op), list = await rows(D), x = list.find(function(r){ return s(r.id) === s(body.id) || s(r.apprId) === s(body.id); });
    if (!x || !x.apprId) throw Fail(404, 'That sign-up is not waiting on a decision.');
    if (op === 'approve') {
      /* patch PORTALJOBS: ☑ this job (always) + the customer's other jobs the approver ticked — saved on the card, then the card's own approve */
      const want = (Array.isArray(body.pids) ? body.pids : []).map(s).filter(function(v){ return v && v !== s(x.pid); });
      const pick = want.filter(function(v, i){ return want.indexOf(v) === i; }).slice(0, 60);
      const q0 = await C.kvListRead(C.AQ_KEY), it0 = q0 ? q0.list.find(function(y){ return s(y.id) === x.apprId; }) : null;
      const had = it0 && it0.meta && Array.isArray(it0.meta.pick) ? it0.meta.pick : [];
      if (it0 && it0.status === 'waiting' && JSON.stringify(had) !== JSON.stringify(pick)) {   /* what THIS approver ticked is what is granted (an earlier tick never rides along) */
        if (!(isOfficeOrAdmin(D, who) || low(it0.pmEmail) === low(who.email) || await C.isOffice(who))) throw Fail(403, 'Only the job\'s PM, the office or an admin approves this.');
        if (pick.length) {
          const data = await D.crmData(true), live = D.liveProjects(data), p0 = live.find(function(j){ return s(j.id) === s(x.pid); });
          if (!p0) throw Fail(404, 'That job is not active.');
          const same = custJobs(live, p0).map(function(j){ return s(j.id); }).concat(((it0.meta && it0.meta.related) || []).map(function(r){ return s(r && r.id); }));   /* + the jobs the card offered (PORTALJOBS2) */
          if (pick.some(function(v){ return same.indexOf(v) < 0; })) throw Fail(400, 'Only this customer\'s own jobs can be ticked.');
        }
        const sv = await C.kvListUpdate(C.AQ_KEY, function(l){ const it = l.find(function(y){ return s(y.id) === x.apprId; }); if (!it || it.status !== 'waiting') return { list: null, result: it };
          it.meta = Object.assign({}, it.meta || {}, { pick: pick, pickedBy: low(who.email) }); it.updatedAt = nowIso();
          return { list: l, result: it, check: function(l2){ return l2.some(function(y){ return s(y.id) === x.apprId && y.meta && JSON.stringify(y.meta.pick) === JSON.stringify(pick); }); } }; });
        if (!sv.ok || !sv.result || sv.result.status !== 'waiting') throw Fail(409, 'That card was already decided — look again.');
      }
      return aqOut(await C.approvalAction({ op: 'approve', id: x.apprId }, who));
    }
    if (op === 'deny') return aqOut(await C.approvalAction({ op: 'reject', id: x.apprId, reason: clip(body.reason, 300) || 'Not this job — no access' }, who));
    if (op === 'move') {
      if (!isOfficeOrAdmin(D, who) && !(await C.isOffice(who))) throw Fail(403, 'Only the office or an admin picks another job.');
      const data = await D.crmData(true), p = D.liveProjects(data).find(function(j){ return s(j.id) === s(body.pid); });
      if (!p) throw Fail(404, 'That job is not active.');
      const pm = C.pmOf(data, p);
      const mv = await C.kvListUpdate(C.AQ_KEY, function(l){ const it = l.find(function(y){ return s(y.id) === x.apprId; }); if (!it || it.status !== 'waiting') return { list: null, result: it };
        it.jobId = s(p.id); it.jobName = s(p.name); it.pm = pm ? pm.name : ''; it.pmEmail = pm ? pm.email : ''; it.meta = Object.assign({}, it.meta || {}, { pid: s(p.id), movedFrom: s(x.pid), movedBy: low(who.email), pick: [] }); it.updatedAt = nowIso();
        return { list: l, result: it, check: function(l2){ return l2.some(function(y){ return s(y.id) === x.apprId && s(y.jobId) === s(p.id); }); } }; });
      if (!mv.ok || !mv.result || s(mv.result.jobId) !== s(p.id)) throw Fail(409, 'That card was already decided — look again.');
      await upd(D, x.id, function(r){ r.pid = s(p.id); log(r, 'office picked another job: ' + s(p.name), { email: who.email, name: who.name, role: who.role }); });
      return Object.assign(aqOut(await C.approvalAction({ op: 'approve', id: x.apprId }, who)), { moved: true });
    }
    throw Fail(400, 'Bad request');
  }
  if (action === 's-su-match') {   /* patch PORTALJOBS: 🔗 Match to jobs… on the "no job matched" To-Do — the office / an admin picks the job(s) */
    if (!isOfficeOrAdmin(D, who) && !(await C.isOffice(who))) throw Fail(403, 'Only the office or an admin matches a sign-up to jobs.');
    const x = (await rows(D)).find(function(r){ return s(r.id) === s(body.id); });
    if (!x || x.kind !== 'customer' || x.status !== 'todo') throw Fail(404, 'That sign-up is not waiting to be matched.');
    const want = (Array.isArray(body.pids) ? body.pids : []).map(s).filter(Boolean);
    if (!want.length) throw Fail(400, 'Pick at least one job.');
    const data = await D.crmData(true), live = D.liveProjects(data);
    const ps = want.filter(function(v, i){ return want.indexOf(v) === i; }).slice(0, 60).map(function(v){ return live.find(function(j){ return s(j.id) === v; }); });
    if (ps.some(function(p){ return !p; })) throw Fail(404, 'One of those jobs is not active.');
    const keys = ['e:' + low(x.email)].concat(phone10(x.phone) ? ['p:' + phone10(x.phone)] : []);
    const g = await grant(D, data, x.id, ps, keys, { email: who.email, name: who.name, role: who.role }, 'matched');
    const sent = await connectedMail(D, x, ps);
    try { const tid = 'psu_' + x.id; await C.kvListUpdate('gc_office_tasks', function(l){ const t = l.find(function(y){ return y && s(y.id) === tid; }); if (!t || t.done) return null; t.done = true; t.doneAt = t.updatedAt = nowIso(); t.resolution = 'matched to ' + ps.map(function(p){ return s(p.name); }).join(', ') + ' by ' + (s(who.name) || low(who.email));
      return { list: l, check: function(l2){ return l2.some(function(y){ return y && s(y.id) === tid && y.done; }); } }; }); } catch (e) {}
    return { ok: true, matched: true, jobs: g.pids.length, linkOn: g.links.length > 0, mailed: !!(sent && sent.ok) };
  }
  if (action === 's-su-remove') {   /* 🗄 Remove access (archived: who / when kept; their devices signed out) */
    if (!isOfficeOrAdmin(D, who) && !(await C.isOffice(who))) throw Fail(403, 'Only the office or an admin removes portal access.');
    const x = (await rows(D)).find(function(r){ return s(r.id) === s(body.id); });
    if (!x || x.status !== 'granted') throw Fail(404, 'That person has no portal access from a sign-up.');
    const keys = (x.grant && x.grant.keys) || [];
    await upd(D, x.id, function(r){ r.status = 'removed'; r.removedAt = nowIso(); r.removedBy = { email: low(who.email), name: s(who.name), role: s(who.role) }; log(r, 'portal access removed', who); });
    try { await D.revokeIdents(keys.map(function(k){ return D.hmac(k); })); } catch (e) {}
    return { ok: true, removed: true };
  }
  throw Fail(400, 'Bad request');
}

module.exports = { connectedMail, KEY, KIND, MSG, start, confirm, staff, grantPids, grantKeysForIdent, onApproved, onRejected, linkMakeToken, linkRead, nameMatch, addrMatch, evidenceFor };
