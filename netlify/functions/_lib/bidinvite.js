/* ============================================================================
   GrayCo — BID INVITES AND SIGN-UP LINKS TO SUBS / SUPPLIERS (patch BIDINVITE, owner 11/20).   netlify/functions/_lib/bidinvite.js
   Owner: "I need to be able to send links right now to subs to sign up for the portal, with data entry still on — just from bid
   portal invites."
   · Invite on a bid job (the bid site's Invite, the CRM's ✉️ Invite subs) → each sub / supplier gets the e-mail AT ONCE:
     "GrayCo invited you to bid: <project>" with their link — a sign-up link with the invite token (approved on sign-up, linked to the
     job; ?as=supplier for a supplier) or, with an account already, the sign-in link. No approval queue.
   · 📨 Send sign-up link (an admin / the office, for one sub not on a job yet): e-mail and / or a text from the GrayCo number with a
     sign-up link (an invite to "signup" — no job: approved on sign-up, sees the public bid jobs).
   · These are sub / supplier sends, not customer sends: tagged custquiet.run('trade', …) so ⏸ data-entry mode lets them go
     (_lib/pause.js). PORTAL_MAIL_OFF still stops the e-mail; a texting opt-out (STOP) is honoured. Every send is logged where the
     CRM logs all e-mail / texts (_lib/pause.js logSend, smsalert's text log) and stamped on the invite row (mailedAt / textedAt).
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const SIGNUP = 'signup';   /* the invite "job" of a plain sign-up link */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function SP(){ return require('../subportal.js')._hub; }
function trade(fn){ try { return require('./custquiet.js').run('trade', fn); } catch (e) { return fn(); } }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }

function inviteMail(job, link, es, supplier, hasAccount){
  const H = SP(), t = s(job && job.title) || 'GrayCo project', due = s(job && job.bidDueDate) ? s(job.bidDueDate).slice(0, 10) + (s(job.bidDueTime) ? ' ' + s(job.bidDueTime) : '') : '';
  const subject = ((es ? 'GrayCo le invitó a ofertar: ' : 'GrayCo invited you to bid: ') + t).slice(0, 240);
  const lines = es ? [
    'GrayCo Construction Services le invita a ' + (supplier ? 'cotizar los materiales de ' : 'ofertar en ') + '<b>' + H.esc(t) + '</b>' + (s(job && job.address) ? ' (' + H.esc(job.address) + ')' : '') + '.',
    due ? 'Fecha límite: <b>' + H.esc(due) + '</b>.' : '',
    'Los planos, el alcance y las especificaciones están en el sitio de licitaciones de GrayCo (bids.grayco-cs.com).',
    hasAccount ? 'Entre con su correo y su contraseña.' : 'Si todavía no tiene cuenta, el enlace la crea ya aprobada y ligada a este trabajo.'
  ] : [
    'GrayCo Construction Services invites you to ' + (supplier ? 'quote the materials for ' : 'bid ') + '<b>' + H.esc(t) + '</b>' + (s(job && job.address) ? ' (' + H.esc(job.address) + ')' : '') + '.',
    due ? 'Due: <b>' + H.esc(due) + '</b>.' : '',
    'Plans, scopes and specs are on the GrayCo bid site (bids.grayco-cs.com).',
    hasAccount ? 'Sign in with your e-mail and password.' : 'No account yet? The link makes one — approved and linked to this job.'
  ];
  return { subject, html: H.mailHtml(es ? 'Invitación a ofertar' : 'Invitation to bid', lines.filter(Boolean), { href: link, label: hasAccount ? (es ? 'Entrar y ver el trabajo' : 'Sign in and see the job') : (es ? 'Crear mi cuenta' : 'Sign up and see the job') }) };
}
function signupMail(link, es, name){
  const H = SP(), first = s(name).split(/\s+/)[0];
  const subject = es ? 'Su enlace para el sitio de licitaciones de GrayCo' : 'Your sign-up link for the GrayCo bid site';
  const lines = es ? [(first ? 'Hola ' + H.esc(first) + ', ' : '') + 'GrayCo Construction Services le invita al sitio de licitaciones de GrayCo (bids.grayco-cs.com): los trabajos abiertos, los planos y sus ofertas.', 'Toque el botón para crear su cuenta — queda aprobada.']
    : [(first ? 'Hi ' + H.esc(first) + ', ' : '') + 'GrayCo Construction Services invites you to the GrayCo bid site (bids.grayco-cs.com): open jobs, plans and your bids in one place.', 'Tap the button to make your account — it is approved.'];
  return { subject, html: H.mailHtml(es ? 'Únase a la lista de licitaciones de GrayCo' : 'Join GrayCo\'s bid list' /* MAILHEAD */, lines, { href: link, label: es ? 'Crear mi cuenta' : 'Make my account' }) };
}
function link(inv, hasAccount, supplier){
  const O = SP().PORTAL_ORIGIN;
  return hasAccount ? O + '/' : O + '/?invite=' + inv.token + '&job=' + encodeURIComponent(inv.jobId) + (supplier ? '&as=supplier' : '');
}
async function accounts(){ const out = {}; (await SP().listRows([SP().eq('collection', 'users')])).forEach(r => { const d = r.data || {}; if (d.role === 'sub' || d.role === 'supplier') out[low(r.email)] = d; }); return out; }
function newInvite(jobId, email, by, via){ return { id: 'i_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'), jobId, email: low(email), token: crypto.randomBytes(16).toString('hex'), createdAt: new Date().toISOString(), createdBy: s(by), via: via }; }
async function sendMail(to, m){ let ok = false; try { ok = !!(await trade(() => SP().sendMail(to, m.subject, m.html))); } catch (e) { ok = false; } return ok; }

/* 📨 Send sign-up link — one sub, by e-mail and / or text. o = { email, phone, name, lang, as, via: ['email','sms'], by } */
async function signupLink(o, deps){
  o = o || {}; deps = deps || {};
  const email = low(o.email), ph = phone10(o.phone), via = Array.isArray(o.via) && o.via.length ? o.via : ['email'];
  const wantMail = via.indexOf('email') > -1, wantText = via.indexOf('sms') > -1;
  if (wantMail && !SP().okEmail(email)) return { code: 400, error: 'Enter the sub\'s e-mail address.' };
  if (wantText && ph.length !== 10) return { code: 400, error: 'Enter the sub\'s cell number (10 digits).' };
  if (!wantMail && !wantText) return { code: 400, error: 'E-mail, text, or both?' };
  const acct = email ? (await accounts())[email] : null;
  if (acct) return { ok: true, already: true, approved: acct.approved === true, role: acct.role, note: 'That e-mail already has a bid-site account' + (acct.approved === true ? ' (approved)' : ' (waiting for approval — approve it in 🔐 Sub portal accounts)') + '.' };
  const key = email || ('sms:' + ph);
  const have = (await SP().listRows([SP().eq('collection', 'invites'), SP().eq('job_id', SIGNUP)])).find(r => low(r.email) === key && !(r.data && r.data.usedAt));
  const inv = Object.assign({}, have ? have.data : newInvite(SIGNUP, key, o.by, 'signup-link'), { name: s(o.name).slice(0, 120), phone: ph, as: s(o.as) === 'supplier' ? 'supplier' : 'sub' });
  const es = s(o.lang) === 'es', url = link(inv, false, inv.as === 'supplier'), out = { ok: true, link: url, mailed: false, texted: false };
  if (wantMail) { const m = signupMail(url, es, o.name); out.mailed = await sendMail(email, m); if (out.mailed) inv.mailedAt = new Date().toISOString(); else out.mailWhy = 'the e-mail could not be sent (e-mail off, or the provider refused)'; }
  if (wantText) {
    const SA = require('./smsalert.js');
    let opt = {}; try { opt = await (deps.optouts ? deps.optouts() : SA._D.optouts()); } catch (e) { opt = {}; }
    if (opt[ph]) out.textWhy = 'that number texted STOP — no text';
    else {
      const body = (es ? 'GrayCo: le invitamos al sitio de licitaciones de GrayCo. Cree su cuenta (queda aprobada): ' : 'GrayCo: you are invited to the GrayCo bid site. Make your account (it is approved): ') + url + (es ? ' Responda STOP para no recibir más.' : ' Reply STOP to opt out.');
      let r = null; try { r = deps.sendText ? await deps.sendText(ph, body) : await SA.sendC(ph, body, 'trade', { who: s(o.name) || key, kind: 'signup-link' }); } catch (e) { r = { ok: false, error: s(e && e.message) }; }
      out.texted = !!(r && r.ok); if (out.texted) inv.textedAt = new Date().toISOString(); else out.textWhy = s(r && (r.error || r.why)) || 'the text could not be sent';
    }
  }
  inv.sends = (Array.isArray(inv.sends) ? inv.sends : []).concat([{ at: new Date().toISOString(), by: s(o.by), email: out.mailed, text: out.texted }]).slice(-20);
  await SP().upsertRows([SP().rowFor('invites', inv)], s(o.by) || 'signup-link');
  return out;
}
module.exports = { SIGNUP, inviteMail, signupMail, link, accounts, newInvite, sendMail, signupLink, trade };
