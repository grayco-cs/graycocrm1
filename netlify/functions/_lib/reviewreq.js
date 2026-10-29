/* ============================================================================
   GrayCo — REVIEW REQUEST ON COMPLETION (patch AUTOC 3).   netlify/functions/_lib/reviewreq.js

   Owner 10/29 ("yes 16"): when a job is marked complete / the final walkthrough is signed, 2 days later the customer
   gets a text (and an e-mail) with the review page https://grayco-cs.com/review; ONE reminder 5 days later when they
   did not click; never for insurance-dispute or flagged jobs; once per customer per year.
     · Done = completionDate / completedAt, or the signed final walkthrough (walkthrough.signed.at), on a job whose
       status is complete / closed or whose walkthrough is signed. Only jobs finished in the last 45 days (so turning
       this on never mails old customers).
     · Never: a deleted / history / no-send job, a flagged job (flagged, reviewFlag, noReview, doNotContact, a "dispute"
       status), an insurance dispute (job insuranceDispute, or its claim says dispute / appraisal / litigation / denied /
       attorney), a job whose ⚙ Automations turned "reviewRequest" off (commercial jobs are off by default).
     · Once per customer (e-mail, else phone, else name) per 365 days; the reminder does not count as a new ask.
     · The link is GrayCo's tracked link crm.grayco-cs.com/go/rv-<code> → https://grayco-cs.com/review (go.js counts the
       click here, so "no review click" is known). REVIEW_PAGE_URL overrides the page.
     · Text: _lib/custtext.js (mobile + consent 'yes' + not STOP + not data-entry mode + business hours). E-mail: from
       news@ with the unsubscribe footer (_lib/news.js). Business hours only, and nothing at all in data-entry mode
       (the run waits, it does not mark anything sent). REVIEW_REQ_OFF=1 stops it.
   State: gc_lead_inbox_kv "gc_review_req" { jobs: { <pid>: { at, code, cust, text, email, remindAt, clickAt } },
          cust: { <key>: at }, codes: { <code>: pid } }.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const KEY = 'gc_review_req';
const ASK_DAYS = 2, REMIND_DAYS = 5, MAX_AGE_DAYS = 45, YEAR_DAYS = 365, DAY = 864e5;
const DISPUTE = /dispute|apprais|litigat|lawsuit|attorney|denied|denial/i;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function env(k){ return s(process.env[k]); }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function okEmail(v){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(v)); }
function first(n){ const w = s(n).split(/[\s,&]+/)[0] || ''; return /^[A-Za-z][A-Za-z'-]{0,20}$/.test(w) ? w : ''; }
function pageUrl(){ const u = env('REVIEW_PAGE_URL'); return /^https:\/\//.test(u) ? u : 'https://grayco-cs.com/review'; }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function linkFor(code){ return site() + '/go/rv-' + code; }

/* ── deps (tests swap these) ── */
function L(){ return require('../bid-inbox.js')._lib; }
function core(){ return require('../portal.js')._core; }
const _D = {
  now: () => Date.now(),
  kvGet: k => L().kvGet(k),
  kvCas: (k, f) => L().kvCas(k, f),
  paused: async () => { try { return await require('./pause').isPaused(); } catch (e) { return true; } },
  open: async () => { try { const CT = require('./custtext.js'); const h = await CT._D.hours(); return require('./callorder.js').isOpen(_D.now(), h ? { hours: h } : null); } catch (e) { return false; } },
  text: o => require('./custtext.js').send(o),
  mail: async o => { let h = o.html; try { h = await require('./brand.js').shellFor(h, { email: o.pmEmail, name: o.pmName }); } catch (e) {} return require('./news.js').sendNews({ to: o.to, subject: o.subject, html: h, text: o.text }); },
  code: () => crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 12)
};

function loadState(v){ const o = obj(typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch (e) { return {}; } })() : v); return { jobs: obj(o.jobs), cust: obj(o.cust), codes: obj(o.codes) }; }
function ymd(v){ const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const d = Date.parse(t); return isFinite(d) ? new Date(d).toISOString().slice(0, 10) : ''; }
/* when the job was finished ('' = not finished) */
function doneDate(p){
  const wt = obj(p.walkthrough), ws = obj(wt.signed);
  const st = low(p.status), finished = /^(complete|completed|closed|done|finished)$/.test(st) || !!s(ws.at);
  if (!finished) return '';
  return [ymd(p.completionDate), ymd(p.completedAt), ymd(ws.at), ymd(p.closedAt)].filter(Boolean).sort()[0] || '';
}
function claimOf(data, p){ try { return core().insClaim(data, p.id); } catch (e) { return arr(data.gc_claims).find(c => s(c.projectId) === s(p.id) && c.deleted !== true) || null; } }
/* why this job may NOT get a review request ('' = it may) */
function blocked(data, p){
  if (!p || p.deleted === true) return 'deleted';
  if (p.importedHistory === true || p.noSend === true || p.historyOnly === true) return 'history job';
  if (p.flagged === true || p.reviewFlag || p.noReview === true || p.doNotContact === true || /dispute|flag/i.test(s(p.status))) return 'flagged job';
  if (p.insuranceDispute === true || DISPUTE.test(s(p.insStatus || p.claimStatus))) return 'insurance dispute';
  const c = claimOf(data, p);
  if (c && (c.dispute === true || DISPUTE.test([c.status, c.stage, c.state, c.disputeStatus].map(s).join(' ')))) return 'insurance dispute';
  try { if (core().jaAllows && !core().jaAllows(data, p, 'reviewRequest')) return 'review request is off for this job (⚙ Automations)'; } catch (e) {}
  return '';
}
function custOf(data, p){
  const c = arr(data.customers).find(x => low(x.name || x.company) === low(p.client)) || {};
  const email = low(p.clientEmail || p.customerEmail || c.email);
  const CT = require('./custtext.js'), ph = CT.mobileOf(p) || CT.mobileOf(c);
  const key = okEmail(email) ? 'e:' + email : ph ? 'p:' + ph : 'n:' + low(p.client || p.name);
  return { email: okEmail(email) ? email : '', ph, key, name: s(p.client || c.name) };
}
function textBody(p, link, reminder){
  const hi = first(p.client) ? 'Hi ' + first(p.client) + ', ' : 'Hi, ';
  return reminder ? hi + 'a quick reminder: if you were happy with your GrayCo project, a short review would mean a lot to our small team: ' + link
    : hi + 'thank you for choosing GrayCo! If you were happy with the work, would you leave us a quick review? ' + link;
}
function mailHtml(p, link, reminder){
  return '<p>Hi ' + esc(first(p.client) || 'there') + ',</p>' +
    (reminder ? '<p>Just a quick reminder — if you were happy with your GrayCo project, a short review helps a small Memphis business more than you know.</p>'
      : '<p>Thank you for choosing GrayCo Construction Services' + (s(p.address) ? ' for the work at ' + esc(s(p.address).split(',')[0]) : '') + '. We hope you love the result!</p><p>Would you take a minute to leave us a review? It helps neighbors find a contractor they can trust.</p>') +
    '<p style="text-align:center;margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">Leave a review</a></p>' +
    '<p style="font-size:13px;color:#55626F">Anything not right? Reply to this e-mail or call 901-585-0944 — we want to make it right.</p>';
}
/* the work to do now (pure): [{ pid, kind: 'ask'|'remind', p, cust }] */
function due(data, st, nowMs){
  const out = [], today = new Date(nowMs).toISOString().slice(0, 10);
  const dead = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(x => { dead[s(x && typeof x === 'object' ? x.id : x)] = 1; });
  arr(data.projects).forEach(p => {
    if (!p.id || dead[s(p.id)]) return;
    const rec = st.jobs[s(p.id)];
    if (rec) {
      if (!rec.remindAt && !rec.clickAt && !rec.stopped && nowMs - Date.parse(rec.at) >= REMIND_DAYS * DAY && nowMs - Date.parse(rec.at) < (REMIND_DAYS + 10) * DAY && !blocked(data, p))
        out.push({ pid: s(p.id), kind: 'remind', p, cust: custOf(data, p) });
      return;
    }
    const d = doneDate(p); if (!d) return;
    const age = (Date.parse(today + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / DAY;
    if (age < ASK_DAYS || age > MAX_AGE_DAYS) return;
    if (blocked(data, p)) return;
    const cust = custOf(data, p);
    const last = st.cust[cust.key]; if (last && nowMs - Date.parse(last) < YEAR_DAYS * DAY) return;
    out.push({ pid: s(p.id), kind: 'ask', p, cust });
  });
  return out;
}
async function run(o){
  o = o || {};
  if (env('REVIEW_REQ_OFF') === '1') return { off: true };
  if (await _D.paused()) return { skipped: 'data-entry mode' };
  if (!o.force && !(await _D.open())) return { skipped: 'outside business hours' };
  const data = o.data || await core().crmData(true);
  const st0 = loadState(await _D.kvGet(KEY)), list = due(data, st0, _D.now());
  const rep = { due: list.length, asked: 0, reminded: 0, skipped: [] };
  for (const w of list) {
    const nowIso = new Date(_D.now()).toISOString();
    if (!w.cust.email && !w.cust.ph) { rep.skipped.push({ pid: w.pid, why: 'no e-mail or mobile' }); continue; }
    /* claim first (a second run at the same moment finds it taken) */
    let code = '', mine = false;
    await _D.kvCas(KEY, v => {
      const st = loadState(v), rec = st.jobs[w.pid];
      if (w.kind === 'ask') { if (rec) return undefined; const last = st.cust[w.cust.key]; if (last && _D.now() - Date.parse(last) < YEAR_DAYS * DAY) return undefined;
        code = _D.code(); st.jobs[w.pid] = { at: nowIso, code, cust: w.cust.key, sending: true }; st.cust[w.cust.key] = nowIso; st.codes[code] = w.pid; }
      else { if (!rec || rec.remindAt || rec.clickAt) return undefined; code = rec.code; rec.remindAt = nowIso; }
      mine = true; return st;
    });
    if (!mine) continue;
    const link = linkFor(code), reminder = w.kind === 'remind';
    let t = { ok: false, why: 'no mobile' }, m = { ok: false, error: 'no e-mail' };
    if (w.cust.ph) t = await _D.text({ ph: w.cust.ph, text: textBody(w.p, link, reminder), data, pid: w.pid, kind: reminder ? 'review2' : 'review', id: w.pid, who: reminder ? 'review reminder' : 'review request' });
    if (w.cust.email) { const pm = (() => { try { return core().pmOf(data, w.p); } catch (e) { return null; } })();
      m = await _D.mail({ to: w.cust.email, subject: reminder ? 'A quick reminder from GrayCo' : 'Thank you from GrayCo — how did we do?', html: mailHtml(w.p, link, reminder), text: textBody(w.p, link, reminder), pmEmail: pm && pm.email, pmName: pm && pm.name }); }
    const any = !!(t.ok || (m.ok && !m.skipped));
    await _D.kvCas(KEY, v => {
      const st = loadState(v), rec = st.jobs[w.pid]; if (!rec) return undefined;
      if (!reminder) {
        if (!any) { delete st.jobs[w.pid]; delete st.codes[code]; if (st.cust[w.cust.key] === nowIso) delete st.cust[w.cust.key]; return st; }   /* nothing went out: try again later */
        delete rec.sending; rec.text = t.ok ? nowIso : 'no: ' + s(t.why); rec.email = m.ok && !m.skipped ? nowIso : 'no: ' + s(m.skipped || m.error);
      } else { rec.remindText = t.ok ? nowIso : 'no: ' + s(t.why); rec.remindEmail = m.ok && !m.skipped ? nowIso : 'no: ' + s(m.skipped || m.error); }
      return st;
    });
    if (any) { if (reminder) rep.reminded++; else rep.asked++; } else rep.skipped.push({ pid: w.pid, why: 'text: ' + s(t.why) + '; e-mail: ' + s(m.skipped || m.error) });
  }
  return rep;
}
/* go.js: a click on crm.grayco-cs.com/go/rv-<code> → noted (no reminder then) → the review page */
async function click(code){
  code = s(code).replace(/^rv-/i, '');
  if (!/^[A-Za-z0-9]{8,16}$/.test(code)) return pageUrl();
  try { await _D.kvCas(KEY, v => { const st = loadState(v), pid = st.codes[code]; if (!pid || !st.jobs[pid] || st.jobs[pid].clickAt) return undefined; st.jobs[pid].clickAt = new Date(_D.now()).toISOString(); return st; }); } catch (e) {}
  return pageUrl();
}

module.exports = { KEY, ASK_DAYS, REMIND_DAYS, YEAR_DAYS, doneDate, blocked, custOf, due, run, click, textBody, mailHtml, linkFor, pageUrl, loadState, _D };
