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
     dueSoon      ON   "Bid due in 3 days / Bid due today: <project>" (bid-alerts.js, the scheduled run, mornings Central) — patch
                       BIDREMIND2 (owner 11/23: "on jobs people click yes to bidding on or if they open a project at all send follow up
                       notifications and emails when its within 3 days of being due and the day its being due"): every sub / supplier who
                       said ✋ I'm bidding, opened / downloaded from the job, or asked for its plans — not one who already bid / quoted or
                       said 🚫 Not bidding. An e-mail + a notification on the bid site (🔔) and the sub portal (📋 Jobs to bid). Once per
                       step per person per job and due date (a moved due date starts the steps over). Never a draft, closed, deleted,
                       bidding-closed or past-due job. (Replaces the old OFF "Bids due tomorrow" to invited subs — key dueReminder.)
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
  { k: 'dueSoon', on: true, l: 'Bid due reminders (3 days before + the due day)', d: 'Mornings, 3 days before the sub bid due date and on the day: every sub or supplier who said "I\'m bidding", opened the job or asked for its plans — not those who already bid or said "Not bidding". An e-mail and a 🔔 notice on the bid site and the sub portal.' }   /* patch BIDREMIND2 */
];
const DEFAULTS = {}; LIST.forEach(function(x){ DEFAULTS[x.k] = x.on; });
const ROW = 'bidmail';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }   /* patch BIDREMIND2 */
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
/* patch BIDREMIND2: the scheduled run (bid-alerts.js, mornings Central) — "Bid due in 3 days" / "Bid due today" to the interested subs and
   suppliers of every open job due in 3 days / today (see the dueSoon switch above). Each reminder is a 'duenotes' row (sp_rows) keyed
   job + person + step + due date: it is the "once" record AND the notification the bid site (🔔) and the sub portal show. */
const STEPS = { d3: 3, d0: 0 };
function chiDay(ms){ return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
function addDays(d, n){ const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function dueKey(job){ return s(job.bidDueDate).slice(0, 10) + (s(job.bidDueTime) ? ' ' + s(job.bidDueTime) : ''); }
function noteText(job, step, es){
  const t = title(job), due = dueKey(job);
  if (es) return { title: (step === 'd0' ? 'La oferta vence hoy: ' : 'La oferta vence en 3 días: ') + t, body: 'Fecha límite: ' + due + '.' };
  return { title: (step === 'd0' ? 'Bid due today: ' : 'Bid due in 3 days: ') + t, body: 'Due ' + due + '.' };
}
function jobLink(job){ return SP().PORTAL_ORIGIN + '/?open=' + encodeURIComponent(s(job.id)); }
function dueSoonMail(job, step, es, supplier){
  const H = SP(), t = title(job), n = noteText(job, step, es);
  const lines = es ? [(step === 'd0' ? 'Recordatorio: hoy vence ' : 'Recordatorio: en 3 días vence ') + (supplier ? 'la cotización de materiales para ' : 'la oferta para ') + '<b>' + H.esc(t) + '</b>' + (s(job.address) ? ' (' + H.esc(job.address) + ')' : '') + '.',
      'Fecha límite: <b>' + H.esc(dueKey(job)) + '</b>.', 'Si ya no va a ofertar, márquelo en el sitio ("No voy a ofertar") y no le enviaremos más recordatorios.']
    : ['A reminder: ' + (supplier ? 'material quotes' : 'bids') + ' for <b>' + H.esc(t) + '</b>' + (s(job.address) ? ' (' + H.esc(job.address) + ')' : '') + (step === 'd0' ? ' are due <b>today</b>.' : ' are due in <b>3 days</b>.'),
      'Due: <b>' + H.esc(dueKey(job)) + '</b>.', 'Not bidding after all? Tap "Not bidding" on the job and the reminders stop.'];
  return { subject: n.title.slice(0, 240), html: H.mailHtml(es ? 'Recordatorio de fecha límite' : (step === 'd0' ? 'Bid due today' : 'Bid due in 3 days'), lines, { href: jobLink(job), label: es ? 'Abrir el trabajo' : (supplier ? 'Open the job and quote' : 'Open the job and bid') }) };
}
function openForReminders(H, j){
  return !!j && !H.isDraft(j) && !H.isGone(j) && !/^(closed|won|lost|awarded|archived|deleted|draft)$/i.test(s(j.status)) && !j.biddingClosed && !(H.dueOver && H.dueOver(j));
}
async function dueReminders(opts){
  opts = opts || {};
  const c = await cfg(); if (!c.dueSoon) return { sent: 0, notes: 0, off: true };
  const H = SP(), today = s(opts.today) || chiDay(Date.now()), want = {};
  Object.keys(STEPS).forEach(function(k){ want[addDays(today, STEPS[k])] = k; });
  const jobs = (await H.listRows([H.eq('collection', 'jobs')])).map(function(r){ return r.data || {}; })
    .filter(function(j){ return want[s(j.bidDueDate).slice(0, 10)] && openForReminders(H, j); });
  if (!jobs.length) return { sent: 0, notes: 0, jobs: 0 };
  const users = {}; (await H.listRows([H.eq('collection', 'users')])).forEach(function(r){ users[s(r.id)] = r.data || {}; });
  let sent = 0, notes = 0; const out = [];
  for (const j of jobs) {
    const step = want[s(j.bidDueDate).slice(0, 10)], dk = dueKey(j);
    const rows = async function(col){ try { return await H.listRows([H.eq('collection', col), H.eq('job_id', j.id)]); } catch (e) { return []; } };
    const [acts, ints, bids, mqs, reqs, invs, done] = await Promise.all(['activity', 'intents', 'bids', 'mquotes', 'planreqs', 'invites', 'duenotes'].map(rows));
    const want1 = {}, no = {};
    acts.forEach(function(r){ want1[s(r.user_id || (r.data || {}).userId)] = 'viewed'; });
    reqs.forEach(function(r){ want1[s(r.user_id || (r.data || {}).userId)] = 'asked for plans'; });
    ints.forEach(function(r){ const d = r.data || {}, u = s(r.user_id || d.userId); if (d.intent === 'yes') want1[u] = 'bidding'; else if (d.intent === 'no') no[u] = 1; });
    bids.forEach(function(r){ no[s(r.user_id || (r.data || {}).userId)] = 1; });   /* already bid */
    mqs.forEach(function(r){ no[s(r.user_id || (r.data || {}).userId)] = 1; });    /* already quoted */
    const had = {}; done.forEach(function(r){ had[s(r.id)] = 1; });
    const invited = {}; invs.forEach(function(r){ invited[low(r.email || (r.data || {}).email)] = 1; });
    for (const uid of Object.keys(want1)) {
      const u = users[uid]; if (!uid || no[uid] || !u) continue;
      if (!/^(sub|supplier)$/.test(s(u.role)) || !u.approved || !H.okEmail(low(u.email))) continue;
      if (s(j.visibility || 'public') !== 'public' && !invited[low(u.email)]) continue;   /* a private job: only the invited */
      if (u.role === 'supplier' && j.suppliersCanQuote !== true && !invited[low(u.email)]) continue;
      const id = (s(j.id) + '__' + uid + '__' + step + '__' + dk).replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 180);
      if (had[id]) continue;
      const es = u.lang === 'es', m = dueSoonMail(j, step, es, u.role === 'supplier'), nt = noteText(j, step, es);
      let mailed = false; try { mailed = !!(await trade(function(){ return H.sendMail(low(u.email), m.subject, m.html); })); } catch (e) { mailed = false; }
      const rec = { id: id, jobId: s(j.id), userId: uid, email: low(u.email), step: step, due: dk, why: want1[uid], title: nt.title, body: nt.body, at: new Date().toISOString(), mailed: mailed, readAt: '' };
      await H.upsertRows([H.rowFor('duenotes', rec)], 'bid-alerts');
      notes++; if (mailed) sent++; out.push({ jobId: rec.jobId, userId: uid, step: step, mailed: mailed });
    }
  }
  return { sent: sent, notes: notes, jobs: jobs.length, list: out.slice(0, 50) };
}
module.exports = { LIST, DEFAULTS, cfg, save, clean, trade, inviteMail, acceptedMail, wonNotUsedMail, lostMail, addendumMail, dueSoonMail, noteText, chiDay, addDays, result, accepted, addendum, dueReminders, biddersOf };
