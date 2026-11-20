/* ============================================================================
   GrayCo — BID SITE E-MAILS (patch BIDSITE3, owner 11/20).   netlify/functions/_lib/bidmail.js

   The e-mails the bid site sends to subs and suppliers, each with its own on / off switch
   (bid site → Admin → 📧 Bid site e-mails; saved in sp_rows "settings/bidmail"):
     invite       ON   "GrayCo invited you to bid: <project>" — at once when an admin clicks Invite (sub or supplier),
                       with their sign-in / sign-up link (no approval queue)
     accepted     ON   "Your bid was accepted" / "Your quote was accepted"
     wonNotUsed   ON   "We won <project> — we did not use your bid this time"
     lost         OFF  "We did not win <project>" — NEVER sent unless an admin switches it on
     addendum     OFF  "Addendum #n posted: <project>"
     dueReminder  OFF  "Bids due tomorrow: <project>" (bid-alerts.js, the scheduled run)
   Room for more: a new switch is one more row in LIST (and a template + its trigger).

   Sub / supplier e-mails are not customer sends: they go out in ⏸ data-entry mode too (custquiet tag 'trade',
   _lib/pause.js lets an e-mail with that tag through; texts are never tagged). PORTAL_MAIL_OFF still stops them.
   Never a price (GrayCo's or anyone else's), never another bidder's name.
   ========================================================================== */
'use strict';
const LIST = [
  { k: 'invite', on: true, l: 'Invite e-mail', d: 'When an admin invites a sub or supplier to a bid job: "GrayCo invited you to bid: <project>" with their sign-in / sign-up link.' },
  { k: 'accepted', on: true, l: 'Your bid / quote was accepted', d: 'When GrayCo accepts a sub\'s bid or a supplier\'s quote (bid site or the CRM\'s 🏆 Award).' },
  { k: 'wonNotUsed', on: true, l: 'We won the project — your bid was not used', d: 'When a job is marked WON: every other bidder / quoter hears, politely, with no prices or names.' },
  { k: 'lost', on: false, l: 'We did NOT win the project', d: 'When a job is marked LOST: every bidder / quoter hears. Off unless you turn it on.' },
  { k: 'addendum', on: false, l: 'Addendum posted', d: 'When an addendum is published on the bid site: the invited subs and everyone who bid.' },
  { k: 'dueReminder', on: false, l: 'Bid due reminder', d: 'The day before the sub bid due date: invited subs who have not bid yet.' }
];
const DEFAULTS = {}; LIST.forEach(function(x){ DEFAULTS[x.k] = x.on; });
const ROW = 'bidmail';
function s(v){ return v == null ? '' : String(v).trim(); }
function SP(){ return require('../subportal.js')._hub; }

/* the switches (missing → the default; a bad read → the defaults, so "lost" stays off) */
async function cfg(){
  let saved = {};
  try { const r = await SP().getRow('settings', ROW); saved = (r && r.data && r.data.switches) || {}; } catch (e) { saved = {}; }
  const out = {}; LIST.forEach(function(x){ out[x.k] = typeof saved[x.k] === 'boolean' ? saved[x.k] : x.on; });
  return out;
}
function clean(v){ const o = {}; LIST.forEach(function(x){ o[x.k] = v && typeof v[x.k] === 'boolean' ? v[x.k] : DEFAULTS[x.k]; }); return o; }
async function save(switches, by){
  const sw = clean(switches), rec = { id: ROW, switches: sw, updatedAt: new Date().toISOString(), updatedBy: s(by) };
  await SP().upsertRows([{ collection: 'settings', id: ROW, data: rec }], s(by) || 'bid site');
  return sw;
}
/* a send that passes data-entry mode (not a customer send) */
function trade(fn){ try { return require('./custquiet.js').run('trade', fn); } catch (e) { return fn(); } }

/* ── the templates (EN / ES) ── */
function tag(job){ return [s(job.poNumber), s(job.address)].filter(Boolean).join(' · '); }
function title(job){ return s(job.title) || 'GrayCo project'; }
function inviteMail(job, link, es, supplier, hasAccount){
  const H = SP(), t = title(job), due = s(job.bidDueDate) ? s(job.bidDueDate).slice(0, 10) + (s(job.bidDueTime) ? ' ' + s(job.bidDueTime) : '') : '';
  const subject = (es ? 'GrayCo le invitó a ofertar: ' : 'GrayCo invited you to bid: ') + t;
  const lines = es ? [
    'GrayCo Construction Services le invita a ' + (supplier ? 'cotizar los materiales de ' : 'ofertar en ') + '<b>' + H.esc(t) + '</b>' + (s(job.address) ? ' (' + H.esc(job.address) + ')' : '') + '.',
    due ? 'Fecha límite: <b>' + H.esc(due) + '</b>.' : '',
    supplier ? 'La lista de materiales y los planos están en el sitio de licitaciones de GrayCo.' : (s(job.tradesSought) ? 'Oficios: ' + H.esc(job.tradesSought) + '. ' : '') + 'Los planos, el alcance y las especificaciones están en el sitio de licitaciones de GrayCo.',
    hasAccount ? 'Entre con su correo y su contraseña.' : 'Si todavía no tiene cuenta, el enlace la crea ya ligada a este trabajo.'
  ] : [
    'GrayCo Construction Services invites you to ' + (supplier ? 'quote the materials for ' : 'bid ') + '<b>' + H.esc(t) + '</b>' + (s(job.address) ? ' (' + H.esc(job.address) + ')' : '') + '.',
    due ? 'Due: <b>' + H.esc(due) + '</b>.' : '',
    supplier ? 'The material list and the plans are on the GrayCo bid site.' : (s(job.tradesSought) ? 'Trades: ' + H.esc(job.tradesSought) + '. ' : '') + 'Plans, scopes and specs are on the GrayCo bid site.',
    hasAccount ? 'Sign in with your e-mail and password.' : 'No account yet? The link makes one already linked to this job.'
  ];
  return { subject: subject.slice(0, 240), html: H.mailHtml(es ? 'Invitación a ofertar' : 'Invitation to bid', lines.filter(Boolean), { href: link, label: hasAccount ? (es ? 'Entrar y ver el trabajo' : 'Sign in and see the job') : (es ? 'Crear mi cuenta y ver el trabajo' : 'Sign up and see the job') }) };
}
function acceptedMail(job, quote, es){
  const H = SP(), t = title(job);
  const subject = es ? (quote ? 'Su cotización fue aceptada — ' : 'Su oferta fue aceptada — ') + t : (quote ? 'Your quote was accepted — ' : 'Your bid was accepted — ') + t;
  const lines = es ? ['¡Buenas noticias! GrayCo Construction Services aceptó su ' + (quote ? 'cotización de materiales' : 'oferta') + ' para <b>' + H.esc(t) + '</b>' + (tag(job) ? ' (' + H.esc(tag(job)) + ')' : '') + '.', quote ? 'GrayCo le enviará la orden de compra.' : 'Su gerente de proyecto de GrayCo se comunicará con usted con los próximos pasos.']
    : ['Good news! GrayCo Construction Services accepted your ' + (quote ? 'material quote' : 'bid') + ' for <b>' + H.esc(t) + '</b>' + (tag(job) ? ' (' + H.esc(tag(job)) + ')' : '') + '.', quote ? 'GrayCo will send you the purchase order.' : 'Your GrayCo project manager will be in touch with the next steps.'];
  return { subject: subject.slice(0, 240), html: H.mailHtml(es ? '¡Aceptada!' : (quote ? 'Your quote was accepted' : 'Your bid was accepted'), lines, { href: H.PORTAL_ORIGIN + '/', label: es ? 'Abrir el sitio de licitaciones' : 'Open the bid site' }) };
}
function wonNotUsedMail(job, es){
  const H = SP(), t = title(job);
  const subject = es ? 'GrayCo ganó ' + t + ' — gracias por su oferta' : 'We won ' + t + ' — thank you for your bid';
  const lines = es ? ['Gracias por ofertar en <b>' + H.esc(t) + '</b>. GrayCo ganó el proyecto, pero esta vez no usamos su oferta.', 'Apreciamos su tiempo y esperamos trabajar con usted en el próximo.']
    : ['Thank you for bidding <b>' + H.esc(t) + '</b>. GrayCo won the project, but we did not use your bid this time.', 'We appreciate your time and look forward to working with you on the next one.'];
  return { subject: subject.slice(0, 240), html: H.mailHtml(es ? 'Gracias por su oferta' : 'Thank you for your bid', lines) };
}
function lostMail(job, es){
  const H = SP(), t = title(job);
  const subject = es ? 'Actualización: ' + t + ' — no ganamos el proyecto' : 'Bid update: ' + t + ' — we did not win the project';
  const lines = es ? ['Gracias por ofertar en <b>' + H.esc(t) + '</b>. Esta vez GrayCo no ganó el proyecto.', 'Apreciamos su tiempo y esperamos trabajar con usted en el próximo.']
    : ['Thank you for bidding <b>' + H.esc(t) + '</b>. GrayCo did not win this project.', 'We appreciate your time and look forward to working with you on the next one.'];
  return { subject: subject.slice(0, 240), html: H.mailHtml(es ? 'Gracias por su oferta' : 'Thank you for your bid', lines) };
}
function addendumMail(job, a, es){
  const H = SP(), t = title(job), n = s(a && a.num);
  const subject = (es ? 'Adenda #' + n + ' publicada: ' : 'Addendum #' + n + ' posted: ') + t;
  const lines = [(es ? 'GrayCo publicó la adenda #' : 'GrayCo posted addendum #') + H.esc(n) + (s(a && a.title) ? ' — ' + H.esc(a.title) : '') + (es ? ' para ' : ' for ') + '<b>' + H.esc(t) + '</b>.',
    es ? 'Revísela en el sitio de licitaciones y confirme que la recibió.' : 'Please review it on the bid site and acknowledge it.'];
  return { subject: subject.slice(0, 240), html: H.mailHtml(es ? 'Adenda publicada' : 'Addendum posted', lines, { href: H.PORTAL_ORIGIN + '/', label: es ? 'Ver la adenda' : 'See the addendum' }) };
}
function dueMail(job, es){
  const H = SP(), t = title(job), due = s(job.bidDueDate).slice(0, 10) + (s(job.bidDueTime) ? ' ' + s(job.bidDueTime) : '');
  const subject = (es ? 'Las ofertas vencen mañana: ' : 'Bids due tomorrow: ') + t;
  const lines = [(es ? 'Recordatorio: las ofertas para ' : 'A reminder: bids for ') + '<b>' + H.esc(t) + '</b>' + (es ? ' vencen ' : ' are due ') + '<b>' + H.esc(due) + '</b>.'];
  return { subject: subject.slice(0, 240), html: H.mailHtml(es ? 'Recordatorio' : 'Bid due reminder', lines, { href: H.PORTAL_ORIGIN + '/', label: es ? 'Enviar mi oferta' : 'Send my bid' }) };
}

/* one e-mail per person (nobody sees who else got it) → the count sent */
async function sendEach(list, make){
  const H = SP(); let n = 0;
  for (const x of list) { try { const m = make(x); if (await trade(function(){ return H.sendMail(x.email, m.subject, m.html); })) n++; } catch (e) {} }
  return n;
}
/* the people who bid / quoted on a job (their e-mail, language, accepted or not) */
async function biddersOf(jobId){
  const H = SP(), out = {}, users = {};
  (await H.listRows([H.eq('collection', 'users')])).forEach(function(r){ users[s(r.id)] = r.data || {}; });
  const add = function(d, accepted){ const u = users[s(d.userId)] || {}, e = s(d.userEmail || u.email).toLowerCase(); if (!H.okEmail(e)) return; const o = out[e] || (out[e] = { email: e, es: u.lang === 'es', accepted: false }); if (accepted) o.accepted = true; };
  (await H.listRows([H.eq('collection', 'bids'), H.eq('job_id', jobId)])).forEach(function(r){ const d = r.data || {}; add(d, d.accepted === true); });
  (await H.listRows([H.eq('collection', 'mquotes'), H.eq('job_id', jobId)])).forEach(function(r){ const d = r.data || {}; add(d, d.status === 'accepted'); });
  return Object.keys(out).map(function(k){ return out[k]; });
}
async function langOf(email){
  const H = SP(); try { const r = (await H.listRows([H.eq('collection', 'users'), H.eq('email', s(email).toLowerCase())]))[0]; return r && r.data && r.data.lang === 'es'; } catch (e) { return false; }
}
/* won / lost: wonNotUsed → the bidders NOT accepted; lost (only when switched on) → every bidder */
async function result(job, kind){
  const c = await cfg();
  if (kind === 'won' && !c.wonNotUsed) return { sent: 0, off: true };
  if (kind === 'lost' && !c.lost) return { sent: 0, off: true };
  const list = (await biddersOf(job.id)).filter(function(x){ return kind === 'lost' || !x.accepted; });
  return { sent: await sendEach(list, function(x){ return kind === 'won' ? wonNotUsedMail(job, x.es) : lostMail(job, x.es); }) };
}
async function accepted(job, email, quote){
  const c = await cfg(); if (!c.accepted) return { sent: false, off: true };
  const es = await langOf(email), m = acceptedMail(job, quote, es);
  const ok = await trade(function(){ return SP().sendMail(email, m.subject, m.html); });
  return { sent: !!ok };
}
async function addendum(job, a){
  const c = await cfg(); if (!c.addendum) return { sent: 0, off: true };
  const H = SP(), seen = {}, list = [];
  (await H.listRows([H.eq('collection', 'invites'), H.eq('job_id', job.id)])).forEach(function(r){ const e = s(r.email).toLowerCase(); if (H.okEmail(e) && !seen[e]) { seen[e] = 1; list.push({ email: e, es: false }); } });
  (await biddersOf(job.id)).forEach(function(x){ if (!seen[x.email]) { seen[x.email] = 1; list.push(x); } });
  return { sent: await sendEach(list, function(x){ return addendumMail(job, a, x.es); }) };
}
/* the scheduled run (bid-alerts.js): open public / invited jobs due tomorrow (Central) → invited subs with no bid yet, once per job */
async function dueReminders(){
  const c = await cfg(); if (!c.dueReminder) return { sent: 0, off: true };
  const H = SP(), tomorrow = new Date(Date.now() - 6 * 3600e3 + 864e5).toISOString().slice(0, 10);
  let sent = 0;
  for (const r of await H.listRows([H.eq('collection', 'jobs')])) {
    const j = r.data || {};
    if (H.isDraft(j) || H.isGone(j) || /^(closed|won|lost)$/i.test(s(j.status)) || j.biddingClosed || s(j.bidDueDate).slice(0, 10) !== tomorrow || j.dueReminderAt) continue;
    const bidders = {}; (await biddersOf(j.id)).forEach(function(x){ bidders[x.email] = 1; });
    const list = (await H.listRows([H.eq('collection', 'invites'), H.eq('job_id', j.id)])).map(function(x){ return s(x.email).toLowerCase(); }).filter(function(e){ return H.okEmail(e) && !bidders[e]; });
    sent += await sendEach(Array.from(new Set(list)).map(function(e){ return { email: e, es: false }; }), function(x){ return dueMail(j, x.es); });
    await H.upsertRows([H.rowFor('jobs', Object.assign({}, j, { dueReminderAt: new Date().toISOString() }))], 'bid-alerts');
  }
  return { sent: sent };
}
module.exports = { LIST, DEFAULTS, cfg, save, clean, trade, inviteMail, acceptedMail, wonNotUsedMail, lostMail, addendumMail, dueMail, result, accepted, addendum, dueReminders, biddersOf };
