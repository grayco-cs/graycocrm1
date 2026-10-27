/* ============================================================================
   GrayCo — CUSTOMER TEXT MENU (patch SMSROUTE).   netlify/functions/_lib/smsmenu.js

   Owner 10/24: customer texting should cut down the questions the office answers. On the Customers number (or the one
   default number), a customer's first text, or HELP / MENU, gets:
     Hi <first>, this is GrayCo. Reply:
     1 – my job's status & next visit · 2 – my customer portal link · 3 – my balance / invoices
     4 – talk to my PM · 5 – emergency (leak, water, fire)
     Or just type your question.
   1–3 (and the warranty) answer from CRM data, only to the phone on file for that job's customer. 4 → the PM gets an
   urgent call-back to-do. 5 → on call + the PM, ASAP. A question that is not clearly one of these goes to the PM, and the
   customer hears "<PM> has your message". Never an AI-written answer: a small model may only CLASSIFY into 1–5.
   Pure functions: missed-call.js reads the data and sends.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function money(n){ n = Math.round((Number(n) || 0) * 100) / 100; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const MENU_WORD = /^\s*(menu|options|help|info|\?)\s*[.!?]*\s*$/i;
function menuText(first, compliance){
  return 'Hi' + (first ? ' ' + first : '') + ', this is GrayCo. Reply:\n1 – my job\'s status & next visit\n2 – my customer portal link\n3 – my balance / invoices\n4 – talk to my PM\n5 – emergency (leak, water, fire)\nOr just type your question.'
    + (compliance ? '\nMsg & data rates may apply. Reply STOP to opt out.' : '');
}
/* "1", "1.", "#1", "option 1", "one" → '1' … */
function choice(body){
  const t = low(body).replace(/[.!)#]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(?:option |press |reply )?([1-5])$/.exec(t); if (m) return m[1];
  const w = { one: '1', two: '2', three: '3', four: '4', five: '5' }[t]; return w || '';
}
const IN = {
  emergency: /\b(emergency|leak|leaking|leaks|flood|flooding|flooded|water (is )?(coming|everywhere|in)|burst|pipe broke|fire|smoke|sewage)\b/i,
  status: /\b(when (are|is|will|do)|what time|coming (today|tomorrow|out)|on (the|your) way|status|schedule|start date|next visit|how('s| is) (my|the) (job|project|roof|work)|progress|update on)\b/i,
  link: /\b(link|portal|website|login|log in|my page|project page)\b/i,
  balance: /\b(owe|balance|invoice|invoices|bill|how much (do|is)|amount due|pay(ment)?|paid)\b/i,
  pm: /\b(call me|call back|callback|talk to|speak (to|with)|my pm|project manager|reach (him|her|someone))\b/i,
  warranty: /\b(warrant(y|ies)|guarantee)\b/i
};
/* a free-text question → '5' / '1' / '2' / '3' / '4' / 'w' when it clearly is one; else '' */
function intent(body){
  const t = s(body);
  if (IN.emergency.test(t)) return '5';
  try { if (require('./emergency.js').isEmergency({ title: t })) return '5'; } catch (e) {}   /* patch EMERG: the same words as every lead source */
  const hits = ['status', 'link', 'balance', 'pm', 'warranty'].filter(k => IN[k].test(t));
  if (hits.length !== 1) return '';   /* none, or more than one kind → a person answers */
  return { status: '1', link: '2', balance: '3', pm: '4', warranty: 'w' }[hits[0]];
}
/* the existing approved answers' ids a small model may pick → the menu choice */
const RULE_TO = { status: '1', payment: '3', emergency: '5' };

function shortDay(iso){
  const d = s(iso).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; }
}
function pct(job){
  const v = [job && job.progress, job && job.pct, job && job.percentComplete, job && job.percent, job && job.completion].map(Number).find(x => isFinite(x) && x >= 0);
  return v == null ? null : Math.max(0, Math.min(100, Math.round(v)));
}
/* ctx: { first, pmFirst, job, jobName, onFile, visitDate, link, balance, openCount, warrantyYears } → the text back */
function answer(c, ctx){
  ctx = ctx || {};
  const who = ctx.pmFirst || 'your project manager', hi = 'Hi' + (ctx.first ? ' ' + ctx.first : '') + '! ';
  if (c === '5') return 'We\'re on it — someone will call you within 15 minutes. If it\'s safe, shut off the main water valve. Call (901) 585-0944 any time — 24/7.';
  if (c === '4') return (ctx.pmFirst ? ctx.pmFirst + ' will' : 'Your project manager will') + ' call you back today.';
  if (!ctx.onFile) return 'Please text from the number we have on file for your job, or ask your project manager. Thank you!';
  if (!ctx.job) return hi + 'We don\'t see an open job for this number. ' + (ctx.pmFirst ? ctx.pmFirst : 'Our office') + ' will text you back shortly.';
  if (c === '1') {
    const p = pct(ctx.job), d = shortDay(ctx.visitDate);
    return hi + (ctx.jobName ? 'Your job (' + ctx.jobName + ')' : 'Your job') + (p != null ? ' is ' + p + '% complete.' : ' is on our schedule.')
      + (d ? ' Our next visit is ' + d + '.' : ' ' + (ctx.pmFirst ? ctx.pmFirst : 'Your project manager') + ' will confirm the next visit.')
      + (ctx.link ? ' Photos and updates: ' + ctx.link : '');
  }
  if (c === '2') return ctx.link ? hi + 'Here is your GrayCo customer portal: ' + ctx.link : hi + who[0].toUpperCase() + who.slice(1) + ' will send your portal link shortly.';
  if (c === '3') {
    if (ctx.balance == null) return hi + 'Our office will text you your balance shortly.';
    return (ctx.balance > 0 ? hi + 'Your open balance is ' + money(ctx.balance) + (ctx.openCount ? ' (' + ctx.openCount + ' invoice' + (ctx.openCount === 1 ? '' : 's') + ')' : '') + '.' : hi + 'You\'re all paid up — thank you!')
      + (ctx.link ? ' See your invoices: ' + ctx.link : '');
  }
  if (c === 'w') return hi + (ctx.link ? 'Your warranty is in your customer portal: ' + ctx.link : who[0].toUpperCase() + who.slice(1) + ' will send your warranty details shortly.');
  return '';
}
function forwarded(pmFirst){ return 'Thanks — ' + (pmFirst ? pmFirst + ' has' : 'our team has') + ' your message and will reply soon.'; }
/* the job's open customer invoices (same rules as the portal) */
function balanceOf(invoices, job, isCustomerInvoice, invBalance){
  const pid = s(job && job.id), nm = low(job && job.name);
  const mine = (Array.isArray(invoices) ? invoices : []).filter(r => r && (s(r.pid || r.projectId || r.jobId || r.project_id) ? s(r.pid || r.projectId || r.jobId || r.project_id) === pid : (nm && low(r.projectName || r.project || r.jobName) === nm)))
    .filter(r => { try { return isCustomerInvoice(r); } catch (e) { return false; } });
  let total = 0, open = 0;
  mine.forEach(r => { const b = Number(invBalance(r)) || 0; if (b > 0.004) { total += b; open++; } });
  return { balance: Math.round(total * 100) / 100, openCount: open };
}
module.exports = { MENU_WORD, menuText, choice, intent, answer, forwarded, balanceOf, RULE_TO, pct, shortDay };
