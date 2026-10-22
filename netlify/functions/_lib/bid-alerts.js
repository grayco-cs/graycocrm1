/* ============================================================================
   GrayCo — ADMIN ALERTS FOR NEW LEADS AND BIDS DUE.   netlify/functions/_lib/bid-alerts.js
   (patch LD2, changed by patch LA)

   Owner (10/21): "When new bids get to our bid email or on our lead list we need a notification …
   I don't want 1 e-mail every hour from this. I just want one when I get a new lead, and 1 hour before
   a lead/bid is due if possible. Always mark down when the bid is due on these leads."

   Who: every ACTIVE admin on gc_staff (role 'admin' — the same list the CRM's sign-in uses, SEC2),
        plus OWNER_EMAILS (default Wesley and Nick), plus BID_ALERT_TO (optional extra addresses).
   What (an e-mail, and a phone push when patch TD's push piece is set up):
     1. NEW LEAD — one message per new lead, the moment it arrives (notifyNew):
          · the bids@ inbox (bid-inbox.js): one message per e-mail — an e-mail that brings several bids
            gives ONE message listing them all;
          · the public bid watchers / BuildingConnected API (bid-watch.js): one per new bid;
          · RoofScout → GrayCo lead (bid-alerts.js, every 10 minutes, sweepRoofScout);
          · website / lead-source leads (lead-intake.js).
        (Leads typed into the CRM by hand are not e-mailed: the person adding one already knows.)
        Subject: the title and "Bid due Tue Oct 28 2:00 PM", or "Bid due date: NOT FOUND — add it".
        Each lead is e-mailed once; a send that failed is tried again on the next 10-minute run (24 h).
     2. ONE HOUR BEFORE THE BID IS DUE (remind, bid-alerts.js every 10 minutes): "⏰ Bid due in 1 hour: …"
        for every lead whose bid is due 50–70 minutes from now; a lead with a date and no time gets
        "⏰ Bid due TODAY: …" at 8:00 AM Central that day. Never twice for the same due date (a date
        edited in the CRM is a new due date). Not for leads that are won, lost, deleted, converted or
        marked not bidding (or dismissed in the Lead Inbox). Time zone: America/Chicago.
   There is NO hourly digest any more.
     3. WHO IT IS DUE TO, AND WHO DOES IT (owner, later on 10/21): every message says when the bid is due AND who it
        is due to (the GC / company / agency, contact, how to submit). The lead's assigned estimator / PM (pm, or the
        default estimator for commercial bids — the Estimator role / Leads ⚙) gets the new-lead message, the 1-hour /
        "today" reminder, "⏰ Bid due tomorrow" at 8 AM the day before, "Assigned to you" when a lead is given to
        them (notifyAssigned: the CRM's ?notify=1, and the 10-minute sweep), and once a day "⚠️ Missing due info"
        for bids assigned to them marked "Unknown yet".
     4. SPEED TO LEAD (owner, 10/21: "the admin will assign the lead to a PM, then we get a notification to reach out
        to our lead … after 4 hours and 24 hours if we haven't by then") — for GrayCo's own inbound leads (the website
        form, the instant roof price, leads@grayco-cs.com, Roof Ignite and the other lead sources; never a commercial
        bid), every 10 minutes (speedToLead):
          · not assigned 4 hours after it came in → the admins: "👤 Assign this lead"; still not at 24 hours → again;
          · assigned and nobody has reached out 4 hours after it was assigned → the assigned PM: "⏰ Reach out";
            24 hours → the PM AND the admins.
        "Reached out" = the lead's stage moved past New Lead, the ✅ Contacted button on the Lead Pipeline (patch STL:
        contactedAt), or a call / follow-up / comment logged on it. Each reminder once per lead (and per PM). Quiet
        hours: nothing between 9 PM and 7 AM Central — what came due overnight goes at 7 AM. Leads more than 7 days
        old, and those already waiting when this started, are left alone.
   Nothing here ever writes to a customer or a sub. It sends only to GrayCo admins.
   ========================================================================== */
'use strict';

const BD = require('./bid-due.js');
const KA = 'gc_lead_inbox_alerts';
const RETRY_H = 24, REMIND_EARLY = 50, REMIND_LATE = 70, TODAY_AT = '08:00';
const STL_FIRST_H = 4, STL_SECOND_H = 24, STL_MAX_DAYS = 7, QUIET_FROM = '21:00', QUIET_TO = '07:00';

function make(d){
  const { env, s, low, arr, nowIso, sb, kvCas, kvGet } = d;
  const now = () => (typeof d.now === 'function' ? d.now() : Date.now());
  const off = () => env('BID_ALERTS_OFF') === '1';
  const site = () => (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const fmtDue = due => BD.fmtDue(due);
  const dueTxt = due => due ? 'Bid due ' + fmtDue(due) : 'Bid due date: NOT FOUND — add it';
  /* "Bid due Thu Nov 5 2:00 PM to Montgomery Martin Contractors" (LA: when it is due AND who it is due to) */
  const dueLine = x => dueTxt(x.bidDue) + (x.bidDue && x.dueToCompany ? ' to ' + x.dueToCompany : '');
  const METHOD = { email: 'by e-mail', portal: 'on the portal', sealed: 'sealed bid, delivered', in_person: 'in person', other: '' };
  function cap(t){ t = s(t); return t ? t[0].toUpperCase() + t.slice(1) : ''; }
  /* one lead as the alerts see it */
  function entry(it, o){
    o = o || {};
    const id = s(it.id), key = s(it.key || it.leadId) || (/^LI-/.test(id) ? 'LEADIN-' + id.slice(3) : id);
    const assignee = s(it.pm) || s(it.estimator), assigneeEmail = low(s(it.pm) && s(it.pm) !== s(it.estimator) ? it.pmEmail : (it.pmEmail || it.estimatorEmail));
    return { id, key, title: s(it.title || it.name).slice(0, 200) || 'New lead', source: s(it.source || o.source), type: s(it.type || it.leadKind),
      bidDue: s(it.bidDue), city: s(it.city), state: s(it.state), gc: s(it.gc), detail: s(it.detail).slice(0, 300),
      dueToCompany: s(it.dueToCompany), dueToContact: s(it.dueToContact), dueToEmail: s(it.dueToEmail), dueToPhone: s(it.dueToPhone), submitMethod: s(it.submitMethod), submitWhere: s(it.submitWhere),
      dueUnknown: !!it.dueUnknown, assignee, assigneeEmail: GONE[low(assignee)] || (assigneeEmail && GONE[assigneeEmail]) ? '' : (assigneeEmail || emailOf(assignee)), assignedBy: s(it.assignedBy),   /* patch PMG: never to someone who has left */
      link: s(it.link) || (arr(it.plansLinks)[0] || {}).url || '', files: arr(it.files).length,
      /* patch WEB: a lead from the website form / instant roof price (no bid due date, no "due to") */
      website: isWebsite(it), partner: isPartner(it), form: s(it.websiteForm || (it.leadExtra && it.leadExtra.websiteForm)), contact: it.contact && typeof it.contact === 'object' ? it.contact : null };
  }
  function isWebsite(l){ return !!(l && (s(l.origin) === 'website' || l.websiteLead || (l.leadExtra && l.leadExtra.websiteLead) || /^website\b/i.test(s(l.source)) || isPartner(l))); }
  /* patch API: a lead a partner posted with its GrayCo code (partner-api.js) — handled like a website lead */
  function isPartner(l){ return !!(l && (s(l.origin) === 'partner' || l.partnerLead || (l.leadExtra && l.leadExtra.partnerLead))); }
  /* the people: name → e-mail (the CRM's people list in gc_kv "users", and gc_staff) */
  const PEOPLE = {}, GONE = {};   /* patch PMG: GONE — people turned off / offboarded (by name and by e-mail) */
  function emailOf(name){ return PEOPLE[low(name)] || ''; }
  async function loadPeople(users){
    if (users == null) {   /* the CRM's people list, when the caller did not bring it */
      try { const r = await sb('gc_kv?select=value&key=eq.users'); if (r.ok) { let v = (arr(await r.json())[0] || {}).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; users = arr(v); } } catch (e) {}
    }
    arr(users).forEach(u => { if (!u || !u.name) return; if (require('./people.js').isActive(u)) { if (u.email) PEOPLE[low(u.name)] = low(u.email); } else { GONE[low(u.name)] = 1; if (u.email) GONE[low(u.email)] = 1; } });
    try { const r = await sb('gc_staff?select=email,name,active'); if (r.ok) arr(await r.json()).forEach(x => { if (x && x.name && x.email && x.active !== false && !PEOPLE[low(x.name)]) PEOPLE[low(x.name)] = low(x.email); }); } catch (e) {}
    return PEOPLE;
  }
  function loadState(v){
    const st = Object.assign({ sent: [], retry: [], reminded: {} }, v || {});
    /* the hourly digest's queue (LD2) is gone: what waited in it is not sent now as a late batch */
    if (Array.isArray(st.pending)) { st.sent = arr(st.sent).concat(st.pending.filter(x => x && x.id).map(x => ({ id: x.id, at: nowIso(), how: 'digest-retired' }))); delete st.pending; delete st.lastDigestAt; }
    st.sent = arr(st.sent); st.retry = arr(st.retry); st.reminded = st.reminded && typeof st.reminded === 'object' ? st.reminded : {};
    return st;
  }

  async function recipients(extra){
    const out = [];
    try {
      const r = await sb('gc_staff?select=email,name,role,active&role=eq.admin');
      if (r.ok) arr(await r.json()).forEach(x => { if (x && x.active !== false && low(x.role) === 'admin' && x.email) out.push(low(x.email)); });
    } catch (e) {}
    (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').concat(env('BID_ALERT_TO').split(','))
      .concat(arr(extra)).map(low).filter(x => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x)).forEach(x => out.push(x));
    return Array.from(new Set(out));
  }

  /* ── the messages ─────────────────────────────────────────────────────────── */
  function rowHtml(x){
    if (x.website) return webRowHtml(x);   /* patch WEB */
    const late = x.bidDue && BD.wallToEpoch(x.bidDue.length === 10 ? x.bidDue + 'T23:59' : x.bidDue) - now() < 72 * 3600000;
    return '<tr><td style="padding:8px 10px;border-bottom:1px solid #eee"><b>' + esc(x.title) + '</b><br><span style="color:#555;font-size:13px">'
      + esc([cap(x.type), 'from ' + (x.source || 'the Lead Inbox'), [x.city, x.state].filter(Boolean).join(', '), x.gc && 'GC ' + x.gc].filter(Boolean).join(' · ')) + '</span>'
      + (x.detail ? '<br><span style="color:#555;font-size:13px">' + esc(x.detail) + '</span>' : '')
      + '<br><span style="font-size:13px;color:' + (x.dueToCompany ? '#1b1640' : '#b45309') + '"><b>Due to:</b> ' + (x.dueToCompany ? esc([x.dueToCompany, x.dueToContact, x.dueToEmail, x.dueToPhone].filter(Boolean).join(' · ')) + (x.submitMethod ? ' — ' + esc([METHOD[x.submitMethod] || x.submitMethod, x.submitWhere].filter(Boolean).join(': ')) : '') : 'NOT FOUND — add it') + '</span>'
      + (x.assignee ? '<br><span style="font-size:13px;color:#555"><b>Assigned to:</b> ' + esc(x.assignee) + '</span>' : '')
      + (x.link ? '<br><a href="' + esc(x.link) + '" style="font-size:13px;color:#241968">Plans / details</a>' : '') + '</td>'
      + '<td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;font-weight:700;color:' + (!x.bidDue ? '#b45309' : late ? '#b91c1c' : '#333') + '">'
      + (x.bidDue ? 'Bid due<br>' + esc(fmtDue(x.bidDue)) : 'Bid due date:<br>NOT FOUND — add it') + '</td></tr>';
  }
  /* patch WEB: a website lead — who, how to reach them, what they asked for; no bid-due column */
  function webRowHtml(x){
    const c = x.contact || {};
    return '<tr><td colspan="2" style="padding:8px 10px;border-bottom:1px solid #eee"><b>' + esc(x.title) + '</b><br><span style="color:#555;font-size:13px">'
      + esc([x.form || cap(x.type), 'from ' + (x.source || 'the website'), [x.city, x.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')) + '</span>'
      + ((c.name || c.phone || c.email) ? '<br><span style="font-size:13px"><b>Contact:</b> ' + esc([c.name, c.phone, c.email].filter(Boolean).join(' · ')) + '</span>' : '')
      + (x.detail ? '<br><span style="color:#555;font-size:13px">' + esc(x.detail) + '</span>' : '')
      + '<br><span style="font-size:13px;color:#b45309"><b>Not assigned yet</b> — an admin assigns it to a PM on Leads → 📥 Lead Inbox (Assign PM).</span></td></tr>';
  }
  /* patch HOT1: a link that opens THIS lead in the CRM (#leads&lead=<id>), the button names it */
  function leadLink(key){ return site() + '/#leads&lead=' + encodeURIComponent(s(key)); }
  function linkify(m){
    if (!m || !s(m.leadKey) || m.__hot1) return m;
    const base = site() + '/#leads', ln = leadLink(m.leadKey), out = Object.assign({}, m, { __hot1: true });
    if (out.html) out.html = String(out.html).split(esc(base) + '"').join(esc(ln) + '"').split('>Open Leads in the CRM<').join('>Open this lead in the CRM<');
    if (out.text) out.text = String(out.text).replace(/(https?:\/\/[^\s]*\/#leads)(?![&\w])/g, function(u){ return u === base ? ln : u; });
    if (out.push) out.push = Object.assign({}, out.push, { link: ln });
    return out;
  }
  function frame(head, intro, rows, foot){
    return '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(head) + '</div><div style="padding:6px 18px 18px">'
      + '<p>' + intro + '</p><table style="width:100%;border-collapse:collapse;font:14px Arial">' + rows + '</table>'
      + '<p style="margin-top:18px"><a href="' + esc(site()) + '/#leads" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open Leads in the CRM</a></p>'
      + '<p style="color:#777;font-size:12px">' + foot + '</p></div></div>';
  }
  const FOOT = 'Sent to GrayCo admins only (gc_staff admins and OWNER_EMAILS): one e-mail when a new lead arrives, and one an hour before its bid is due (8 AM Central on the day when only the date is known). The bid due date can be changed on the lead in the CRM (Leads → Bid due).';
  function soonest(list){ return list.filter(x => x.bidDue).sort((a, b) => BD.wallToEpoch(a.bidDue) - BD.wallToEpoch(b.bidDue))[0]; }
  function mailNew(list){
    if (list.length && list.every(x => x.website)) return mailWeb(list);   /* patch WEB */
    const n = list.length, first = soonest(list);
    const subject = (n === 1 ? 'New lead: ' + list[0].title + ' — ' + dueLine(list[0])
      : n + ' new leads: ' + list.map(x => x.title).join(' · ').slice(0, 140) + ' — ' + (first ? dueLine(first) + (list.some(x => !x.bidDue) ? ' (some: NOT FOUND — add it)' : '') : dueTxt(''))).slice(0, 250);
    const src = Array.from(new Set(list.map(x => x.source).filter(Boolean))).join(', ');
    const html = frame('GrayCo — new lead' + (n === 1 ? '' : 's'), (n === 1 ? 'A new lead came in' : n + ' new leads came in together') + (src ? ' (' + esc(src) + ')' : '') + '. It is on the Leads tab in the CRM.'
      + (list.some(x => !x.bidDue) ? ' <b>No bid due date was found' + (n === 1 ? '' : ' for some') + ' — add it on the lead so the 1-hour reminder can go out.</b>' : ''), list.map(rowHtml).join(''), FOOT);
    const text = subject + '\n\n' + list.map(x => '- ' + x.title + ' (' + [x.type, x.source, [x.city, x.state].filter(Boolean).join(', ')].filter(Boolean).join(', ') + ') — ' + dueLine(x) + (x.assignee ? ' — assigned to ' + x.assignee : '') + (x.link ? '\n  ' + x.link : '')).join('\n') + '\n\nOpen Leads: ' + site() + '/#leads';
    const push = { title: (n === 1 ? 'New lead: ' + list[0].title : n + ' new leads: ' + list[0].title + ' + ' + (n - 1) + ' more').slice(0, 100),
      body: list.slice(0, 3).map(x => x.title.slice(0, 60) + ' — ' + dueLine(x)).join('\n').slice(0, 180), tag: 'lead-new-' + list[0].id };
    return { subject, html, text, push, leadKey: n === 1 ? list[0].key : '' };
  }
  function mailRemind(x, kind){
    const clock = fmtDue(x.bidDue).replace(/^\w+ \w+ \d+ /, ''), to = x.dueToCompany ? ' to ' + x.dueToCompany : '';
    const when = kind === 'today' ? 'today (' + fmtDue(x.bidDue) + ', no time given)' : kind === 'eve' ? 'tomorrow, ' + fmtDue(x.bidDue) + (x.bidDue.length > 10 ? ' Central' : '') : 'at ' + clock + ' Central (' + fmtDue(x.bidDue) + ')';
    const subject = (kind === 'today' ? '⏰ Bid due TODAY: ' + x.title + to : kind === 'eve' ? '⏰ Bid due tomorrow: ' + x.title + ' — ' + fmtDue(x.bidDue) + to : '⏰ Bid due in 1 hour: ' + x.title + ' — ' + clock + to).slice(0, 250);
    const html = frame('GrayCo — bid due ' + (kind === 'today' ? 'today' : kind === 'eve' ? 'tomorrow' : 'in 1 hour'), 'The bid for this lead is due <b>' + esc(when) + '</b>' + (to ? ' <b>' + esc(to) + '</b>' : '') + '.', rowHtml(x), FOOT);
    const text = subject + '\n\n' + x.title + ' — bid due ' + when + (x.source ? '\nFrom ' + x.source : '') + (x.link ? '\n' + x.link : '') + '\n\nOpen Leads: ' + site() + '/#leads';
    return { subject, html, text, leadKey: x.key, push: { title: subject.slice(0, 100), body: (x.title + ' — ' + dueTxt(x.bidDue)).slice(0, 180), tag: 'lead-due-' + x.key } };
  }

  async function sendMail(to, m){
    const key = env('RESEND_API_KEY'); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
    if (!to.length) return { ok: false, why: 'no admin e-mail addresses' };
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ from: env('BID_ALERT_FROM') || 'GrayCo Leads <leads@grayco-cs.com>', reply_to: env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com', to, subject: require('./mailtag.js').tag(m.subject, to, m.area || 'bid lead'), html: m.html, text: m.text, headers: { 'X-GrayCo-CRM': 'lead-alert' } }, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(m.replyTo)) ? { reply_to: s(m.replyTo) } : {})) });
      return r.ok ? { ok: true } : { ok: false, why: 'Resend answered ' + r.status };
    } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
  }
  /* patch TD's push piece: present when its keys are set and web-push is installed */
  function loadWebPush(){ try { return require('web-push'); } catch (e) { return null; } }
  async function push(to, p){
    const pub = env('VAPID_PUBLIC_KEY'), priv = env('VAPID_PRIVATE_KEY');
    if (!pub || !priv) return { sent: 0, why: 'phone push is not set up (patch TD)' };
    const wp = d.webPush || loadWebPush(); if (!wp) return { sent: 0, why: 'web-push is not installed' };
    try { wp.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:office@grayco-cs.com', pub, priv); } catch (e) { return { sent: 0, why: 'bad VAPID keys' }; }
    const payload = JSON.stringify({ title: p.title, body: p.body, link: s(p.link) || site() + '/#leads', tag: p.tag });
    let sent = 0;
    for (const email of to) {
      let subs = [];
      try { const r = await sb('gc_kv?select=value&key=eq.' + encodeURIComponent('gc_push_subs__' + email)); const rows = r.ok ? await r.json() : []; let v = rows && rows[0] ? rows[0].value : []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } subs = arr(v).filter(x => x && x.endpoint && x.keys); } catch (e) {}
      for (const sub of subs) { try { await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 86400 }); sent++; } catch (e) {} }
    }
    return { sent };
  }
  /* patch WEB: the new-lead message for website leads (no "Bid due date: NOT FOUND") */
  function mailWeb(list){
    const n = list.length;
    if (list.every(x => x.form === 'Missed call')) {   /* patch AUTO6: the missed-call text-back */
      const subj = (n === 1 ? '📞 Missed call — auto-text sent: ' + list[0].title : '📞 ' + n + ' missed calls — auto-texts sent').slice(0, 250);
      const h = frame('GrayCo — missed call', (n === 1 ? 'Someone called GrayCo and nobody answered' : n + ' calls were not answered') + '. They got the automatic text ("Sorry we missed your call…"). It is a GrayCo lead on the Leads tab, <b>not assigned to anyone yet</b> — assign it to a PM and call them back.', list.map(rowHtml).join(''),
        'Sent to GrayCo admins only (gc_staff admins and OWNER_EMAILS) for every missed call that is not an existing customer.');
      const t = subj + '\n\n' + list.map(x => { const c = x.contact || {}; return '- ' + x.title + (c.phone ? ' · ' + c.phone : '') + (x.detail ? '\n  ' + x.detail : ''); }).join('\n') + '\n\nAssign it to a PM: ' + site() + '/#leads';
      return { area: 'area:Leads', leadKey: n === 1 ? list[0].key : '', replyTo: '', subject: subj, html: h, text: t, push: { title: subj.slice(0, 100), body: list.slice(0, 3).map(x => x.title.slice(0, 80)).join('\n').slice(0, 180), tag: 'lead-new-' + list[0].id } };
    }
    const api = list.every(x => x.partner), from = api ? Array.from(new Set(list.map(x => x.source).filter(Boolean))).join(', ') : '';   /* patch API */
    const subject = (api ? (n === 1 ? '🔌 New lead from ' + from + ': ' + list[0].title : '🔌 ' + n + ' new leads from ' + from + ': ' + list.map(x => x.title).join(' · '))
      : (n === 1 ? '🌐 New website lead: ' + list[0].title : '🌐 ' + n + ' new website leads: ' + list.map(x => x.title).join(' · '))).slice(0, 250);
    const html = frame('GrayCo — new ' + (api ? 'lead' : 'website lead') + (n === 1 ? '' : 's'), (api ? esc(from) + ' sent ' + (n === 1 ? 'a lead' : n + ' leads') + ' through the GrayCo partner API' : n === 1 ? 'Someone filled in a form on grayco-cs.com' : n + ' forms came in from grayco-cs.com') + '. It is a GrayCo lead on the Leads tab, <b>not assigned to anyone yet</b> — assign it to a PM.', list.map(rowHtml).join(''),
      'Sent to GrayCo admins only (gc_staff admins and OWNER_EMAILS) for every ' + (api ? 'lead a partner sends' : 'website lead') + '.');
    const text = subject + '\n\n' + list.map(x => { const c = x.contact || {}; return '- ' + x.title + ' (' + [x.form || x.type, x.source].filter(Boolean).join(', ') + ')' + ((c.phone || c.email) ? '\n  ' + [c.name, c.phone, c.email].filter(Boolean).join(' · ') : '') + (x.detail ? '\n  ' + x.detail : ''); }).join('\n') + '\n\nNot assigned yet — assign it to a PM: ' + site() + '/#leads';
    return { area: 'area:Leads', leadKey: n === 1 ? list[0].key : '', replyTo: n === 1 ? s((list[0].contact || {}).email) : '', subject, html, text, push: { title: subject.slice(0, 100), body: list.slice(0, 3).map(x => x.title.slice(0, 80)).join('\n').slice(0, 180), tag: 'lead-new-' + list[0].id } };
  }
  /* extra: the assigned estimator / PM; only: just these people (not the admins) */
  async function deliver(m, extra, only){
    m = linkify(m);   /* patch HOT1 */
    const to = only ? Array.from(new Set(arr(only).map(low).filter(Boolean))) : await recipients(extra);
    const r = await sendMail(to, m);
    const p = await push(to, m.push);   /* the push goes out even when the e-mail could not */
    return { ok: r.ok, why: r.why, to, pushed: p.sent, pushWhy: p.why };
  }
  async function note(last){ try { await kvCas(KA, v => { const st = loadState(v); st.last = last; return st; }); } catch (e) {} }

  /* ── 1. new leads ──────────────────────────────────────────────────────────── */
  /* items: leads just stored. o.group: one message for all of them (one e-mail that brought several bids);
     otherwise one message per lead. Each lead id is alerted once, ever. */
  async function notifyNew(items, o){
    o = o || {};
    if (off()) return { sent: 0, off: true };
    const fresh = arr(items).filter(it => it && it.id).map(it => entry(it, o));
    if (!fresh.length) return { sent: 0 };
    let mine = [];
    /* claim them first (two runs at once never both send) */
    await kvCas(KA, v => {
      const st = loadState(v);
      const known = {}; st.sent.forEach(x => { if (x && x.id) known[x.id] = 1; }); st.retry.forEach(g => arr(g.list).forEach(x => { known[x.id] = 1; }));
      mine = fresh.filter(x => { if (known[x.id]) return false; known[x.id] = 1; return true; });
      if (!mine.length) return undefined;
      st.sent = st.sent.concat(mine.map(x => ({ id: x.id, at: nowIso(), how: 'claimed' }))).slice(-1500);
      return st;
    });
    if (!mine.length) return { sent: 0, already: fresh.length };
    const groups = o.group ? [mine] : mine.map(x => [x]);
    const out = { sent: 0, messages: 0, failed: 0, to: [] };
    for (const g of groups) {
      const r = await deliver(mailNew(g), g.map(x => x.assigneeEmail));
      out.messages++; out.to = r.to; out.pushed = (out.pushed || 0) + (r.pushed || 0); if (r.pushWhy) out.pushWhy = r.pushWhy;
      if (r.ok) out.sent += g.length; else { out.failed += g.length; out.why = r.why; }
      const at = nowIso();
      await kvCas(KA, v => {
        const st = loadState(v);
        const ids = {}; g.forEach(x => { ids[x.id] = 1; });
        st.sent.forEach(x => { if (x && ids[x.id]) { x.how = r.ok ? 'new' : 'failed'; x.at = at; } });
        st.assigned = st.assigned || {}; g.forEach(x => { if (x.assigneeEmail) st.assigned[x.key + '|' + x.assigneeEmail] = at; });
        if (!r.ok) st.retry = st.retry.filter(x => !arr(x.list).some(y => ids[y.id])).concat([{ at, list: g, tries: 1, why: r.why || '' }]).slice(-100);
        st.last = { at, kind: 'new', n: g.length, ok: r.ok, why: r.why || '', to: r.to.length, pushed: r.pushed || 0, pushWhy: r.pushWhy || '' };
        return st;
      }).catch(() => {});
    }
    /* patch X10: an after-hours emergency (water / fire) pages the person on call (_lib/oncall.js) — never blocks the alert */
    if (env('ONCALL_OFF') !== '1') { try { out.oncall = await require('./oncall.js').make({ env: env, kvGet: kvGet, kvCas: kvCas, now: now, push: push }).maybePage(mine); } catch (e) { out.oncall = { error: s(e && e.message) }; } }
    return out;
  }
  /* a new-lead message that could not be sent: tried again on each 10-minute run, for 24 hours */
  async function retry(){
    if (off()) return { sent: 0, off: true };
    const raw = (await kvGet(KA)) || {}, st = loadState(raw);
    const due = st.retry.filter(g => g && now() - Date.parse(g.at || 0) < RETRY_H * 3600000);
    let sent = 0;
    for (const g of due) {
      const r = await deliver(mailNew(arr(g.list)), arr(g.list).map(x => x.assigneeEmail));
      await kvCas(KA, v => {
        const cur = loadState(v);
        const i = cur.retry.findIndex(x => x && x.at === g.at && arr(x.list).length && arr(g.list).length && x.list[0].id === g.list[0].id);
        if (r.ok) { if (i >= 0) cur.retry.splice(i, 1); const ids = {}; g.list.forEach(x => { ids[x.id] = 1; }); cur.sent.forEach(x => { if (x && ids[x.id]) x.how = 'new (retried)'; }); }
        else if (i >= 0) { cur.retry[i].tries = (cur.retry[i].tries || 1) + 1; cur.retry[i].why = r.why || ''; }
        cur.last = { at: nowIso(), kind: 'retry', n: g.list.length, ok: r.ok, why: r.why || '', to: r.to.length };
        return cur;
      }).catch(() => {});
      if (r.ok) sent += g.list.length;
    }
    /* older than a day: given up (still on the Leads tab) */
    if (st.retry.length !== due.length || Array.isArray(raw.pending)) await kvCas(KA, v => { const cur = loadState(v); cur.retry = cur.retry.filter(g => g && now() - Date.parse(g.at || 0) < RETRY_H * 3600000); return cur; }).catch(() => {});
    return { sent, waiting: due.length };
  }

  /* ── 2. before the bid is due: the day before (8 AM), 1 hour before, "today" (8 AM) ── */
  const CLOSED = /^(won|lost|dead|deleted|converted|declined|not\s*bidding|no\s*bid|pass(ed)?|archived|cancell?ed|closed|dismissed|merged|submitted)$/i;
  function closed(l){
    if (!l) return true;
    if (l.deleted || l._deleted || l.converted || l.notBidding || l.noBid) return true;
    return [l.stage, l.status, l.inboxState, l.bidStatus].some(v => CLOSED.test(s(v)));
  }
  function addDays(day, n){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); return d.toISOString().slice(0, 10); }
  /* which reminders are due now for this bid due date: '1h' (50–70 minutes before), 'today' (a date alone, from
     8 AM Central that day), 'eve' (the day before, from 8 AM Central — for the assigned estimator / PM) */
  function reminderKinds(due, t){
    due = s(due); const out = [], w = BD.epochToWall(t), day = w.slice(0, 10), after8 = w.slice(11) >= TODAY_AT;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(due)) {
      const mins = (BD.wallToEpoch(due) - t) / 60000;
      if (mins >= REMIND_EARLY && mins <= REMIND_LATE) out.push('1h');
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(due) && day === due && after8) out.push('today');
    if (/^\d{4}-\d{2}-\d{2}/.test(due) && after8 && day === addDays(due.slice(0, 10), -1) && BD.wallToEpoch(due.length > 10 ? due : due + 'T23:59') > t) out.push('eve');
    return out;
  }
  function reminderKind(due, t){ return reminderKinds(due, t).filter(k => k !== 'eve')[0] || ''; }
  /* leads: the CRM's lead list (gc_kv "leads": edits made in the CRM, the due date someone typed);
     items: the Lead Inbox (a bid no CRM has collected yet still gets its reminder) */
  function candidates(leads, items, tombs){
    const out = [], have = {}, haveInbox = {};
    arr(leads).forEach(l => { if (l && l.id) { have[l.id] = 1; if (l.inboxId) haveInbox[l.inboxId] = 1; } });
    arr(leads).forEach(l => {
      if (!l || !l.id || !s(l.bidDue) || closed(l)) return;
      out.push(entry(Object.assign({}, l, { key: l.id, title: l.name || l.title, type: l.leadKind || l.type })));
    });
    arr(items).forEach(it => {
      if (!it || it.stub || !s(it.bidDue) || haveInbox[it.id]) return;
      const lid = 'LEADIN-' + s(it.id).replace(/^LI-/, '');
      if (have[lid] || (tombs && tombs['leads:' + lid]) || closed(it) || !/^(new|imported)$/.test(s(it.status) || 'new')) return;
      out.push(entry(Object.assign({}, it, { key: lid })));
    });
    return out;
  }
  async function remind(src){
    if (off()) return { sent: 0, off: true };
    src = src || {};
    const t = now();
    await loadPeople(src.users);
    const want = [];
    candidates(src.leads, src.items, src.tombs).forEach(x => reminderKinds(x.bidDue, t).forEach(k => {
      if (k === 'eve' && !x.assigneeEmail) return;   /* the day-before reminder is the assigned person's */
      want.push(Object.assign({}, x, { kind: k }));
    }));
    let mine = [];
    if (want.length) await kvCas(KA, v => {
      const st = loadState(v);
      mine = want.filter(x => { const k = x.key + '|' + x.bidDue + '|' + x.kind; if (st.reminded[k]) return false; st.reminded[k] = nowIso(); return true; });
      /* forget reminders older than 45 days */
      const cut = new Date(t - 45 * 86400000).toISOString(); Object.keys(st.reminded).forEach(k => { if (s(st.reminded[k]) < cut) delete st.reminded[k]; });
      return mine.length ? st : undefined;
    });
    const out = { sent: 0, failed: 0, list: [] };
    for (const x of mine) {
      /* 1 hour / today: the admins and the assigned person; the day before: the assigned person */
      const r = x.kind === 'eve' ? await deliver(mailRemind(x, x.kind), null, [x.assigneeEmail]) : await deliver(mailRemind(x, x.kind), [x.assigneeEmail]);
      out.list.push({ key: x.key, kind: x.kind, ok: r.ok, why: r.why || '', to: r.to });
      if (r.ok) out.sent++; else out.failed++;
      await kvCas(KA, v => {
        const st = loadState(v);
        const k = x.key + '|' + x.bidDue + '|' + x.kind;
        if (!r.ok) delete st.reminded[k];   /* the next run (10 minutes) tries again while it is still in the window */
        st.last = { at: nowIso(), kind: x.kind === 'today' ? 'due-today' : x.kind === 'eve' ? 'due-tomorrow' : 'due-1h', n: 1, ok: r.ok, why: r.why || '', to: r.to.length, pushed: r.pushed || 0 };
        return st;
      }).catch(() => {});
    }
    try { out.nag = await nag(src, t); } catch (e) { out.nag = { error: s(e && e.message) }; }
    try { out.assigned = await sweepAssigned(src, t); } catch (e) { out.assigned = { error: s(e && e.message) }; }
    try { out.speed = await speedToLead(src, t); } catch (e) { out.speed = { error: s(e && e.message) }; }
    try { out.results = await resultsAsk(src, t); } catch (e) { out.results = { error: s(e && e.message) }; }
    return out;
  }

  /* ── patch AUTO8: "Bid results?" — 7 days after a SUBMITTED bid's due date, still not won / lost: one e-mail from
     the estimator (BID_RESULTS_FROM, else the default estimator — EST4, the Estimator role) to whoever the bid was due
     to (dueToEmail), asking how it came out. The estimator gets a copy (bcc); replies go to them AND to
     results+<lead>@in.grayco-cs.com, where bid-inbox.js files the answer for the CRM (gc_kv gc_bid_results → the lead
     and the estimator's dashboard). A staff member's own e-mail
     to a GC — not a customer — so it goes straight out (no approval), weekdays 9 AM – 4 PM Central only, once per
     lead and due date. BID_RESULTS_OFF=1 turns it off. ─────────────────────────────────────────────────────── */
  const RESULTS_DAYS = 7;
  function resultsWanted(l, t){
    if (!l || !l.id || !isBid(l) || l.deleted || l._deleted || l.converted || l.notBidding || l.noBid) return false;
    if (/^(won|lost|no\s*bid|not\s*bidding|dead|deleted|converted|declined|archived|cancell?ed|closed|dismissed)$/i.test(s(l.bidStatus))) return false;
    if (/^(won|lost|dead|deleted|converted|declined|archived|closed|dismissed)$/i.test(s(l.stage)) || /^(won|lost)$/i.test(s(l.status))) return false;
    if (!(/^submitted$/i.test(s(l.bidStatus)) || s(l.submittedAt))) return false;   /* only a bid GrayCo actually sent in */
    if (!/^\d{4}-\d{2}-\d{2}/.test(s(l.bidDue))) return false;
    const dueAt = BD.wallToEpoch(s(l.bidDue).length > 10 ? s(l.bidDue) : s(l.bidDue) + 'T17:00');
    if (!isFinite(dueAt) || t - dueAt < RESULTS_DAYS * 86400000 || t - dueAt > 60 * 86400000) return false;
    return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(l.dueToEmail));
  }
  function resultsToken(id){ return s(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); }
  function resultsMail(l, fromName){
    const title = s(l.name || l.title) || 'the project', who = s(l.dueToContact).split(/\s+/)[0];
    const due = fmtDue(s(l.bidDue));
    const html = '<div style="font:14px Arial,Helvetica,sans-serif;color:#1b1640;max-width:600px">'
      + '<p>Hi ' + esc(who || 'there') + ',</p>'
      + '<p>Thank you for the chance to bid <b>' + esc(title) + '</b> (bid due ' + esc(due) + '). When you have a moment, could you share the bid results — '
      + 'was it awarded, and if so, where did GrayCo Construction Services land? Any feedback on our number helps us sharpen our next bid for you.</p>'
      + '<p>Thanks again — we appreciate being on your bid list.</p>'
      + '<p>' + esc(fromName) + '<br>Estimator · GrayCo Construction Services<br>' + require('./brand.js').companyAddress() + ' · 901-585-0944</p></div>';
    const text = 'Hi ' + (who || 'there') + ',\n\nThank you for the chance to bid ' + title + ' (bid due ' + due + '). When you have a moment, could you share the bid results — was it awarded, and if so, where did GrayCo Construction Services land? Any feedback on our number helps us sharpen our next bid for you.\n\nThanks again — we appreciate being on your bid list.\n\n' + fromName + '\nEstimator · GrayCo Construction Services\n' + require('./brand.js').companyAddress() + ' · 901-585-0944';
    return { subject: ('Bid results — ' + title).slice(0, 200), html, text };
  }
  async function resultsAsk(src, t){
    if (off() || env('BID_RESULTS_OFF') === '1') return { sent: 0, off: true };
    const w = BD.epochToWall(t), wd = new Date(w.slice(0, 10) + 'T12:00:00Z').getUTCDay(), hm = w.slice(11, 16);
    if (wd === 0 || wd === 6 || hm < '09:00' || hm >= '16:00') return { sent: 0, quiet: true };
    const want = arr(src.leads).filter(l => resultsWanted(l, t) && !(src.tombs && src.tombs['leads:' + l.id]));
    if (!want.length) return { sent: 0 };
    let mine = [];
    await kvCas(KA, v => { const st = loadState(v); mine = want.filter(l => { const k = 'results|' + l.id + '|' + s(l.bidDue); if (st.reminded[k]) return false; st.reminded[k] = nowIso(); return true; }); return mine.length ? st : undefined; });
    const key = env('RESEND_API_KEY'); const out = { sent: 0, failed: 0, list: [] };
    /* patch EST4: from the default estimator (the Estimator role / Leads ⚙), never a name in the code */
    let est = { name: '', email: '' }; try { if (typeof d.estimatorOf === 'function') est = (await d.estimatorOf()) || est; } catch (e) {}
    const fromEmail = low(env('BID_RESULTS_FROM') || est.email || 'leads@grayco-cs.com');
    const fromName = s(env('BID_RESULTS_NAME')) || (est.email && low(est.email) === fromEmail && s(est.name)) || (Object.keys(PEOPLE).filter(n => PEOPLE[n] === fromEmail)[0] || 'GrayCo Estimating').replace(/\b\w/g, c => c.toUpperCase());
    for (const l of mine.slice(0, 10)) {
      const m = resultsMail(l, fromName);
      let ok = false;
      if (key) {
        try {
          const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: fromName + ' — GrayCo Construction Services <' + fromEmail + '>', to: [low(l.dueToEmail)], bcc: [fromEmail],
              reply_to: [fromEmail, 'results+' + resultsToken(l.id) + '@in.grayco-cs.com'], subject: m.subject, html: m.html, text: m.text, headers: { 'X-GrayCo-CRM': 'bid-results' } }) });
          ok = r.ok;
        } catch (e) {}
      }
      out.list.push({ id: l.id, ok });
      if (ok) out.sent++; else { out.failed++; await kvCas(KA, v => { const st = loadState(v); delete st.reminded['results|' + l.id + '|' + s(l.bidDue)]; return st; }).catch(() => {}); }
      if (ok) await kvAppendResult({ id: 'ask_' + resultsToken(l.id) + '_' + s(l.bidDue).slice(0, 10), kind: 'asked', leadId: s(l.id), at: nowIso(), to: low(l.dueToEmail), by: fromEmail }).catch(() => {});
    }
    return out;
  }
  /* the CRM reads gc_kv "gc_bid_results" (asked / answered), newest 500 */
  async function kvAppendResult(item){
    const r = await sb('gc_kv?select=value&key=eq.gc_bid_results'); if (!r.ok) return false;
    const rows = await r.json(); let v = rows && rows[0] ? rows[0].value : []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
    const list = arr(v).filter(x => x && x.id !== item.id).concat([item]).slice(-500);
    const w = await sb('gc_kv?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'gc_bid_results', value: JSON.stringify(list), updated_at: nowIso() }) });
    return w.ok;
  }

  /* ── "Missing due info": the assigned person, once a day from 8 AM Central, for each open bid marked
     "Unknown yet" (or a bid with no due date / no "due to" company) ─────────────────────────────────── */
  function missingDue(l){ return !s(l.bidDue) || !s(l.dueToCompany); }
  function isBid(l){ if (isWebsite(l)) return false;   /* patch WEB: a website lead is not a bid (no "Missing due info") */
    return !!(l.inboxId || l.estimator || l.bidStatus || l.dueUnknown || /commercial|government/i.test(s(l.leadKind || l.type))); }
  async function nag(src, t){
    const w = BD.epochToWall(t); if (w.slice(11) < TODAY_AT) return { sent: 0 };
    const by = {};
    arr(src.leads).forEach(l => {
      if (!l || !l.id || closed(l)) return;
      if (!(l.dueUnknown || (isBid(l) && missingDue(l)))) return;
      const x = entry(Object.assign({}, l, { key: l.id, title: l.name || l.title, type: l.leadKind || l.type }));
      if (!x.assigneeEmail) return;
      (by[x.assigneeEmail] = by[x.assigneeEmail] || []).push(x);
    });
    const people = Object.keys(by); if (!people.length) return { sent: 0 };
    let mine = [];
    await kvCas(KA, v => { const st = loadState(v); mine = people.filter(e => { const k = 'nag|' + e + '|' + w.slice(0, 10); if (st.reminded[k]) return false; st.reminded[k] = nowIso(); return true; }); return mine.length ? st : undefined; });
    let sent = 0;
    for (const e of mine) {
      const list = by[e], n = list.length;
      const subject = '⚠️ Missing due info: ' + (n === 1 ? list[0].title : n + ' bids assigned to you') + ' — add the bid due date and who it is due to';
      const html = frame('GrayCo — missing bid due info', 'These bids are assigned to you and still have no bid due date and/or no "due to" company (marked <b>Unknown yet</b>). Add them on the lead (Leads → the amber <b>Missing due info</b> chip) so the reminders can go out.', list.map(rowHtml).join(''), FOOT);
      const r = await deliver({ subject, html, text: subject + '\n\n' + list.map(x => '- ' + x.title + ' — ' + dueLine(x) + (x.dueToCompany ? '' : ' — due to: NOT FOUND')).join('\n') + '\n\n' + site() + '/#leads',
        push: { title: subject.slice(0, 100), body: list.slice(0, 3).map(x => x.title).join('\n').slice(0, 180), tag: 'lead-nag-' + e } }, null, [e]);
      if (r.ok) sent++; else await kvCas(KA, v => { const st = loadState(v); delete st.reminded['nag|' + e + '|' + w.slice(0, 10)]; return st; }).catch(() => {});
    }
    return { sent, people: people.length };
  }

  /* ── "Assigned to you": a lead given to an estimator / PM (in the CRM, or entered by hand for them) ── */
  function mailAssigned(x){
    const subject = ('Assigned to you: ' + x.title + ' — ' + dueLine(x)).slice(0, 250);
    const html = frame('GrayCo — a lead assigned to you', 'This lead is assigned to you' + (x.assignedBy ? ' by ' + esc(x.assignedBy) : '') + '. ' + (x.bidDue ? 'The bid is due <b>' + esc(fmtDue(x.bidDue)) + '</b>' + (x.dueToCompany ? ' to <b>' + esc(x.dueToCompany) + '</b>' : '') + '.' : '<b>No bid due date yet — add it on the lead.</b>'), rowHtml(x), FOOT);
    return { leadKey: x.key, subject, html, text: subject + '\n\n' + x.title + ' — ' + dueLine(x) + '\n' + site() + '/#leads', push: { title: subject.slice(0, 100), body: (x.title + ' — ' + dueLine(x)).slice(0, 180), tag: 'lead-asg-' + x.key } };
  }
  async function notifyAssigned(lead, o){
    o = o || {};
    if (off()) return { sent: 0, off: true };
    if (!Object.keys(PEOPLE).length) await loadPeople(o.users);
    const x = entry(Object.assign({}, lead, { key: s(lead.id), title: lead.name || lead.title, type: lead.leadKind || lead.type }));
    if (!x.assignee) return { sent: 0, why: 'not assigned' };
    if (!x.assigneeEmail) return { sent: 0, why: 'no e-mail for ' + x.assignee };
    if (o.by && low(o.by) === x.assigneeEmail) return { sent: 0, why: 'assigned to themselves' };
    if (closed(lead)) return { sent: 0, why: 'closed' };
    const k = x.key + '|' + x.assigneeEmail; let claim = false;
    await kvCas(KA, v => { const st = loadState(v); st.assigned = st.assigned || {}; if (st.assigned[k]) return undefined; st.assigned[k] = nowIso(); claim = true; return st; });
    if (!claim) return { sent: 0, already: true };
    const r = await deliver(mailAssigned(x), null, [x.assigneeEmail]);
    if (!r.ok) await kvCas(KA, v => { const st = loadState(v); if (st.assigned) delete st.assigned[k]; return st; }).catch(() => {});
    return { sent: r.ok ? 1 : 0, to: r.to, why: r.why || '' };
  }
  /* every 10 minutes: an assignment nobody's page reported (a phone offline, …). The first run only takes note. */
  async function sweepAssigned(src, t){
    const st0 = loadState(await kvGet(KA));
    const open = arr(src.leads).filter(l => l && l.id && !closed(l)).map(l => ({ l, x: entry(Object.assign({}, l, { key: l.id, title: l.name || l.title })) })).filter(o => o.x.assignee && o.x.assigneeEmail);
    if (!st0.assignedBoot) {
      await kvCas(KA, v => { const st = loadState(v); st.assigned = st.assigned || {}; open.forEach(o => { const k = o.x.key + '|' + o.x.assigneeEmail; if (!st.assigned[k]) st.assigned[k] = 'boot'; }); st.assignedBoot = nowIso(); return st; });
      return { first: true, sent: 0 };
    }
    const asg = st0.assigned || {}; let sent = 0;
    for (const o of open) {
      if (asg[o.x.key + '|' + o.x.assigneeEmail]) continue;
      const when = Date.parse(o.l.assignedAt || o.l.updatedAt || o.l.createdAt || 0);
      if (!isFinite(when) || t - when > 3 * 86400000) continue;
      if (o.x.assignedBy && low(o.x.assignedBy) === low(o.x.assignee)) continue;
      const r = await notifyAssigned(o.l, {}); sent += r.sent || 0;
    }
    return { sent };
  }

  /* ── 4. speed to lead: assign it, then reach out (4 hours, 24 hours) ─────────── */
  const LEAD_SOURCES = /referral|roof\s*ignite|contractor\s*connection|alacrity|sedgwick|leads@|homeadvisor|angi|thumbtack|google\s*(lsa|local)|facebook\s*lead/i;
  function inbound(l){
    if (!l) return false;
    if (l.softLead || (l.leadExtra && l.leadExtra.softLead)) return false;   /* patch MKT2: a guide download is a soft lead — no reach-out clock */
    if (isWebsite(l)) return true;
    if (/commercial|government/i.test(s(l.leadKind || l.type))) return false;
    const src = [s(l.source), s(l.leadSource), s(l.subSource)].join(' ');
    if (!LEAD_SOURCES.test(src)) return false;
    /* a "Referral" typed into the CRM by hand is not inbound; one from the portal / website / referral program is (it came through the Lead Inbox) */
    if (!LEAD_SOURCES.test(src.replace(/referral/ig, ''))) return !!(l.inboxId || l.leadExtra || l.referredById || l.refMember || l.origin);
    return true;
  }
  function ms(v){ if (!v) return NaN; const x = Date.parse(/^\d{4}-\d\d-\d\d$/.test(s(v)) ? s(v) + 'T12:00:00Z' : s(v)); return isFinite(x) ? x : NaN; }
  function bornAt(l){ for (const f of ['createdAt', 'receivedAt', 'created', 'dateAdded']) { const x = ms(l[f]); if (isFinite(x)) return x; } const r = ms(l.leadExtra && l.leadExtra.receivedAt); return isFinite(r) ? r : ms(l.date); }
  const SYS_BY = /lead inbox|system|website|server|crm|auto/i, SYS_KIND = /creat|assign|import|added|system|auto/i;
  /* somebody reached out: the stage moved on, ✅ Contacted, or a person logged a call / follow-up / comment */
  function contacted(l){
    const st = low(l.stage);
    if (st && !/^(new|new lead|lead|unassigned)$/.test(st)) return true;
    for (const f of ['contactedAt', 'lastContact', 'lastContacted', 'lastContactAt', 'followUpDone', 'firstContactAt']) if (s(l[f])) return true;
    for (const f of ['calls', 'followUps', 'activity', 'activities', 'log', 'comments', 'history', 'contactLog']) {
      if (arr(l[f]).some(c => c && typeof c === 'object' && !SYS_BY.test(s(c.by || c.who || c.author)) && !SYS_KIND.test(s(c.type || c.kind || c.action)))) return true;
    }
    return false;
  }
  function quiet(t){ const hm = BD.epochToWall(t).slice(11); return hm >= QUIET_FROM || hm < QUIET_TO; }
  function agoTxt(h){ return h >= 24 ? (Math.floor(h / 24) === 1 ? '1 day' : Math.floor(h / 24) + ' days') : h + ' hours'; }
  function contactLine(x){ const c = x.contact || {}; return [x.contactName || c.name, x.phone || c.phone, x.email || c.email].filter(Boolean).join(' · '); }
  function mailSpeed(x, kind){
    const who = contactLine(x), h = kind === 'unasg24' || kind === 'pm24' ? STL_SECOND_H : STL_FIRST_H;
    let subject, head, intro;
    if (kind === 'unasg' || kind === 'unasg24') {
      subject = '👤 Assign this lead: ' + x.title + ' — came in ' + agoTxt(h) + ' ago, no PM yet';
      head = 'GrayCo — a new lead has no PM'; intro = 'This lead came in <b>' + agoTxt(h) + ' ago</b> and is <b>not assigned to anyone</b>. Assign it to a PM on Leads (📥 Lead Inbox → Assign PM, or the lead\'s PM field) so they can reach out.';
    } else {
      subject = '⏰ Reach out: ' + x.title + ' — assigned ' + agoTxt(h) + ' ago, not contacted yet';
      head = 'GrayCo — reach out to your new lead'; intro = 'This lead was assigned to <b>' + esc(x.assignee) + '</b> ' + agoTxt(h) + ' ago and nobody has reached out yet. Call or e-mail them, then press <b>✅ Contacted</b> on the lead (or move its stage to Contacted).'
        + (kind === 'pm24' ? ' <b>The admins get this one too.</b>' : '');
    }
    subject = subject.slice(0, 250);
    const row = '<tr><td style="padding:8px 10px;border-bottom:1px solid #eee"><b>' + esc(x.title) + '</b>' + (who ? '<br><span style="font-size:13px"><b>Contact:</b> ' + esc(who) + '</span>' : '')
      + (x.address ? '<br><span style="font-size:13px;color:#555">' + esc(x.address) + '</span>' : '') + '<br><span style="font-size:13px;color:#555">' + esc([x.form || cap(x.type), x.source && 'from ' + x.source].filter(Boolean).join(' · ')) + '</span>'
      + (x.assignee ? '<br><span style="font-size:13px"><b>Assigned to:</b> ' + esc(x.assignee) + '</span>' : '<br><span style="font-size:13px;color:#b45309"><b>Not assigned yet</b></span>') + '</td></tr>';
    const html = frame(head, intro, row, 'Speed to lead: the admins hear when a new lead has no PM after 4 and 24 hours; the PM when nobody has reached out 4 hours after it was assigned, and the PM and admins at 24 hours. Nothing between 9 PM and 7 AM Central.');
    const text = subject + '\n\n' + x.title + (who ? '\n' + who : '') + (x.address ? '\n' + x.address : '') + '\n\nOpen Leads: ' + site() + '/#leads';
    return { area: 'area:Leads', leadKey: x.key, replyTo: s(x.email || (x.contact || {}).email), subject, html, text, push: { title: subject.slice(0, 100), body: (x.title + (who ? ' — ' + who : '')).slice(0, 180), tag: 'lead-stl-' + kind + '-' + x.key } };
  }
  function speedCandidates(leads, items, tombs){
    const out = [], haveInbox = {}, have = {};
    arr(leads).forEach(l => { if (l && l.id) { have[l.id] = 1; if (l.inboxId) haveInbox[l.inboxId] = 1; } });
    arr(leads).forEach(l => {
      if (!l || !l.id || closed(l) || !inbound(l)) return;
      const x = entry(Object.assign({}, l, { key: l.id, title: l.name || l.title, type: l.leadKind || l.type }));
      if (x.assignee && low(l.createdBy) === low(x.assignee)) return;   /* a PM's own lead, typed in after talking to them */
      out.push(Object.assign(x, { born: bornAt(l), asgAt: ms(l.assignedAt), contacted: contacted(l), contactName: s(l.contactName), phone: s(l.phone), email: s(l.email), address: s(l.address) }));
    });
    /* a website lead no CRM has collected yet: it is unassigned all the same */
    arr(items).forEach(it => {
      if (!it || it.stub || haveInbox[it.id] || !inbound(it) || closed(it) || !/^(new|imported)$/.test(s(it.status) || 'new')) return;
      const lid = 'LEADIN-' + s(it.id).replace(/^LI-/, ''); if (have[lid] || (tombs && tombs['leads:' + lid])) return;
      const x = entry(Object.assign({}, it, { key: lid }));
      out.push(Object.assign(x, { born: bornAt(it), asgAt: ms(it.assignedAt), contacted: false, address: [s(it.address), s(it.city)].filter(Boolean).join(', ') }));
    });
    return out;
  }
  /* which reminders are due for one lead now (the later one wins when both are: one message, not two) */
  function speedKinds(x, t){
    if (x.contacted || !isFinite(x.born) || t - x.born > STL_MAX_DAYS * 86400000) return [];
    const H = 3600000;
    if (!x.assignee) { const a = (t - x.born) / H; return a >= STL_SECOND_H ? ['unasg24', 'unasg'] : a >= STL_FIRST_H ? ['unasg'] : []; }
    if (!x.assigneeEmail) return [];
    const from = isFinite(x.asgAt) ? x.asgAt : x.born, a = (t - from) / H;
    return a >= STL_SECOND_H ? ['pm24', 'pm4'] : a >= STL_FIRST_H ? ['pm4'] : [];
  }
  function stlKey(x, k){ return 'stl|' + k + '|' + x.key + (/^pm/.test(k) ? '|' + x.assigneeEmail : ''); }
  async function speedToLead(src, t){
    if (off() || env('SPEED_TO_LEAD_OFF') === '1') return { sent: 0, off: true };
    src = src || {}; t = t == null ? now() : t;
    const list = speedCandidates(src.leads, src.items, src.tombs);
    const st0 = loadState(await kvGet(KA));
    /* the first run only takes note: leads already waiting when this was switched on are not e-mailed all at once */
    if (!st0.stlBoot) {
      await kvCas(KA, v => { const st = loadState(v); if (st.stlBoot) return undefined; list.forEach(x => speedKinds(x, t).forEach(k => { st.reminded[stlKey(x, k)] = nowIso(); })); st.stlBoot = nowIso(); return st; });
      return { first: true, sent: 0 };
    }
    if (quiet(t)) return { sent: 0, quiet: true };
    const want = [];
    list.forEach(x => { const ks = speedKinds(x, t); if (ks.length) want.push({ x, kind: ks[0], all: ks }); });
    let mine = [];
    if (want.length) await kvCas(KA, v => {
      const st = loadState(v);
      mine = want.filter(w => { if (st.reminded[stlKey(w.x, w.kind)]) return false; w.all.forEach(k => { st.reminded[stlKey(w.x, k)] = nowIso(); }); return true; });
      return mine.length ? st : undefined;
    });
    const out = { sent: 0, failed: 0, list: [] };
    for (const w of mine) {
      const x = w.x, m = mailSpeed(x, w.kind);
      /* unassigned: the admins; 4 h: the PM; 24 h: the PM and the admins */
      const r = w.kind === 'pm4' ? await deliver(m, null, [x.assigneeEmail]) : w.kind === 'pm24' ? await deliver(m, [x.assigneeEmail]) : await deliver(m);
      out.list.push({ key: x.key, kind: w.kind, ok: r.ok, why: r.why || '', to: r.to });
      if (r.ok) out.sent++; else out.failed++;
      await kvCas(KA, v => {
        const st = loadState(v);
        if (!r.ok) delete st.reminded[stlKey(x, w.kind)];   /* the next run tries again */
        st.last = { at: nowIso(), kind: 'speed-' + w.kind, n: 1, ok: r.ok, why: r.why || '', to: r.to.length, pushed: r.pushed || 0 };
        return st;
      }).catch(() => {});
    }
    return out;
  }

  /* ── RoofScout → GrayCo lead: new rs_leads rows since the last look ───────── */
  async function sweepRoofScout(){
    if (off()) return { sent: 0, off: true };
    const st = loadState(await kvGet(KA));
    if (!st.rsSince) { await kvCas(KA, v => { const c = loadState(v); if (!c.rsSince) c.rsSince = nowIso(); return c; }); return { first: true, sent: 0 }; }
    let rows = [];
    try {
      const r = await sb('rs_leads?select=id,data,created_at&created_at=gt.' + encodeURIComponent(st.rsSince) + '&order=created_at.asc&limit=200');
      if (!r.ok) return { sent: 0, why: 'rs_leads answered ' + r.status };
      rows = arr(await r.json());
    } catch (e) { return { sent: 0, why: 'rs_leads unreachable' }; }
    if (!rows.length) return { sent: 0 };
    const last = rows.map(x => s(x.created_at)).sort().pop();
    const list = rows.filter(x => { const dd = (x && x.data) || {}; return x && x.id && !(dd.demo === true || /^DEMO\s/.test(s(dd.name)) || dd.doNotContact === true || dd.dnc === true); })
      .map(x => { const dd = x.data || {}; const cs = /,\s*([^,]+),\s*([A-Z]{2})\b/.exec(s(dd.address)) || [];
        return { id: 'rs:' + x.id, key: 'LEAD_RS_' + x.id, title: s(dd.name) || s(dd.address) || 'RoofScout lead', source: 'RoofScout', type: s(dd.kind) || 'roofing', bidDue: s(dd.bidDue),
          city: s(cs[1]), state: s(cs[2]), detail: [s(dd.address), dd.areaSqft ? Math.round(+dd.areaSqft).toLocaleString('en-US') + ' ft² roof' : '', dd.owner && dd.owner.company ? 'Owner ' + s(dd.owner.company) : ''].filter(Boolean).join(' · '),
          link: site() + '/roofscout/#lead=' + encodeURIComponent(x.id) }; });
    await kvCas(KA, v => { const c = loadState(v); if (!c.rsSince || last > c.rsSince) c.rsSince = last; return c; });
    /* a scan that saved many at once is one message, not a flood */
    return notifyNew(list, { source: 'RoofScout', group: list.length > 3 });
  }

  async function state(){
    const st = loadState(await kvGet(KA));
    return { mode: 'instant', retrying: st.retry.length, reminders: Object.keys(st.reminded).length, last: st.last || null, remindMinutes: [REMIND_EARLY, REMIND_LATE], todayAt: TODAY_AT };
  }

  return { notifyNew, notifyAssigned, sweepAssigned, nag, retry, remind, sweepRoofScout, speedToLead, resultsAsk, resultsWanted, kvAppendResult, speedKinds, speedCandidates, contacted, inbound, recipients, state, candidates, reminderKind, reminderKinds, closed, loadPeople, _mailNew: mailNew, _mailRemind: mailRemind, KA,
    /* LD2's name for "a new opportunity was stored": now one message per call (bid-inbox: one e-mail) */
    enqueue: (items, o) => notifyNew(items, o) };
}
module.exports = { make, KA };
