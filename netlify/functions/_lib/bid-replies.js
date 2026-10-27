/* ============================================================================
   GrayCo — A GC'S REPLY TO ONE OF OUR BIDS.   netlify/functions/_lib/bid-replies.js   (patch BIDSEND)

   Owner (10/22): "replies from bids in Glenn's e-mails need to go in the CRM too for notifications, and some are
   urgent when they are asking us to add or take away stuff before bids are due, so make sure to alert Glenn."
   And: "outgoing bids are sent through Glenn but FROM bids@" — every bid the CRM sends (📤 Send bid, the per-GC
   "Bid results?" follow-up) is From "<the estimator's own name> <bids@grayco-cs.com>", Reply-To bids@grayco-cs.com, and
   its subject is the PROJECT as the GC knows it (plus the GC's bid / project #) — owner: "our outbound bids have the
   project / name of the job as the subject, not GrayCo bids".
   bids@ is a Google Group (Glenn, Wesley, Nick, office and bids@in.grayco-cs.com), so a GC's answer reaches the
   people AND this webhook (bid-inbox.js). A copy that comes by the e-mail-history routing rule (mail@in, X9) is
   matched the same way; the same e-mail twice is one entry (Message-ID).

   WHICH LEAD, WHICH GC (match):
     0. In-Reply-To / References carry the Message-ID of the bid we sent (<bid.<lead>.<gc>.<n>@grayco-cs.com>, kept per GC);
     1. the sender is a contact on a lead's "Bidding to" list (gc_kv gc_bid_bidders, else the lead's due-to e-mail);
     2. a reply ("Re: …") whose subject names the project, or the GC's bid / project #;
        the GC row: the sender's company domain, else the GC named in the subject;
     3. the sender's company domain is on exactly one open lead's list.
   URGENT (rules; plus Claude haiku when ANTHROPIC_API_KEY is set — dormant without it): an addendum / revised drawings
   or specs; scope added or taken away (add, remove, delete, include, exclude, alternate, revised scope, value
   engineering); RFI answers / clarifications; the due date or time changed; the bid form changed; a pre-bid meeting
   or walk-through; "please confirm"; anything that comes in within 72 hours of that GC's due date.
   KEPT: gc_kv "gc_bid_replies" (newest 1000) — the lead's GC row, its timeline and Plans read it; attachments are
   stored in crm-files. A due date in the reply is only a SUGGESTION ("📨 Due date changed to … — Review & apply").
   TOLD: the Senior Estimator ALWAYS (+ the lead's own estimator / PM; nobody → the admins) — urgent: an e-mail "⚠️ URGENT bid change:
   <Project> — <GC>: <summary>" with a link to the lead + a push; not urgent: a push only. The CRM adds the
   high-priority To-Do and the red "Bid change" badge until someone marks it reviewed.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const BD = require('./bid-due.js');

const KEY = 'gc_bid_replies', MAX = 1000, TEXT_MAX = 3000;
const OURS = /@(in\.)?grayco-cs\.com$/i;
const FREE = /^(gmail|yahoo|hotmail|outlook|aol|icloud|me|live|msn|comcast|att|bellsouth|protonmail)\.(com|net)$/i;
const RULES = [
  ['addendum', 'Addendum / revised drawings', /\baddend(?:um|a)\b|\brevised\s+(?:drawings?|plans?|specs?|specifications|sheets?|documents?)|\bupdated\s+(?:drawings?|plans?|specs?|specifications)|\bre-?issued?\b/i],
  ['scope', 'Scope added or taken away', /\b(?:add|adding|added|remove|removing|removed|delete|deleted|deleting|include|including|exclude|excluding|alternates?|revised\s+scope|scope\s+change|value\s+engineer(?:ing|ed)?|deduct)\b/i],
  ['rfi', 'RFI answer / clarification', /\bRFIs?\b|\bclarif(?:y|ied|ication|ications)\b|\bresponses?\s+to\s+(?:questions|rfis?)\b/i],
  ['due', 'Due date / time changed', /\b(?:bids?|proposals?|due\s+date|deadline|closing|bid\s+date)\b[^.\n]{0,60}\b(?:changed|moved|extended|postponed|pushed|revised|rescheduled|delayed|now\s+due)\b|\b(?:extend(?:ed|ing)?|postpon(?:e|ed|ing)|mov(?:e|ed|ing)|push(?:ed|ing)?)\b[^.\n]{0,40}\b(?:bid|due\s+date|deadline)\b|\bnew\s+(?:bid\s+)?(?:due\s+)?date\b|\bnow\s+due\b/i],
  ['form', 'Bid form changed', /\b(?:bid|proposal)\s+form\b|\bunit\s+prices?\b|\bbid\s+schedule\b/i],
  ['meeting', 'Pre-bid meeting / walk-through', /\bpre-?\s?bid\b|\bwalk-?\s?through\b|\bsite\s+(?:visit|walk)\b|\bjob\s+walk\b/i],
  ['confirm', 'Asks us to confirm', /\b(?:please|kindly|can\s+you|could\s+you)\s+confirm\b|\bconfirm\s+(?:receipt|that|you|your)\b/i]
];

function make(d){
  const { env, s, low, arr, nowIso, sb } = d;
  const now = () => (typeof d.now === 'function' ? d.now() : Date.now());
  const site = () => (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  const esc = v => s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parse = v => { if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) {} } return v; };
  const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
  const domOf = e => low(s(e).split('@')[1]);
  function stripQuoted(t){ try { return require('./comms.js').stripQuoted(t); } catch (e) { return s(t).split(/\n\s*On [^\n]{4,200}wrote:/)[0]; } }
  function norm(t){ return low(t).replace(/^((re|fw|fwd|aw)\s*:\s*)+/i, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  const STOP = { the: 1, and: 1, for: 1, of: 1, at: 1, a: 1, an: 1, to: 1, in: 1, on: 1, project: 1, bid: 1, bids: 1, new: 1, phase: 1, re: 1, fw: 1, grayco: 1, construction: 1, services: 1 };
  function words(t){ return norm(t).split(' ').filter(w => w.length >= 3 && !STOP[w]); }

  /* ── what the CRM keeps: its lead list, the "Bidding to" lists, the people ── */
  async function context(){
    const o = {};
    try {
      const r = await sb('gc_kv?select=key,value&key=in.(leads,gc_bid_bidders,users,gc_tombstones)');
      if (r.ok) arr(await r.json()).forEach(x => { o[x.key] = parse(x.value); });
    } catch (e) {}
    const unwrap = v => (v && !Array.isArray(v) && Array.isArray(v.v) ? v.v : v);
    const tombs = o.gc_tombstones && typeof o.gc_tombstones === 'object' ? o.gc_tombstones : {};
    const leads = arr(unwrap(o.leads)).filter(l => l && l.id && !l.deleted && !l._deleted && !tombs['leads:' + l.id]);
    return { leads, bidders: o.gc_bid_bidders && typeof o.gc_bid_bidders === 'object' ? o.gc_bid_bidders : {}, users: arr(unwrap(o.users)) };
  }
  function closedLead(l){ return /^(won|lost|dead|deleted|converted|archived)$/i.test(s(l.stage)) || l.converted || l.notBidding; }
  /* the lead's "Bidding to" rows (the CRM's list, else one row from the lead's due-to fields) */
  function biddersOf(ctx, l){
    const rec = ctx.bidders['lead:' + l.id];
    const list = arr(rec && rec.list).filter(b => b && (s(b.company) || s(b.email)));
    if (list.length) return list;
    return s(l.dueToCompany) || s(l.dueToEmail) ? [{ id: 'b1', company: s(l.dueToCompany), contact: s(l.dueToContact), email: low(l.dueToEmail), due: s(l.bidDue) }] : [];
  }
  function dueOf(l, b){ return s(b && b.due) || s(l.bidDue); }
  function rank(l){ const t = Date.parse(s(l.bidDue) || s(l.updatedAt) || 0); return isFinite(t) ? -Math.abs(t - now()) : -1e15; }
  function subjectHits(l, subj){
    const w = words(l.name || l.title).filter((x, i, a) => a.indexOf(x) === i); if (!w.length) return 0;
    const sw = {}; words(subj).forEach(x => { sw[x] = 1; });
    const hit = w.filter(x => sw[x]).length;
    if (norm(subj).indexOf(norm(l.name || l.title)) >= 0 && norm(l.name || l.title).length >= 6) return 100;
    return (hit >= 2 && hit / w.length >= 0.6) || (w.length === 1 && hit === 1 && w[0].length >= 5) ? hit : 0;
  }
  /* the Message-ID our bid went out with (send-email.js mode 'bid'): <bid.<lead token>.<gc id>.<n>@grayco-cs.com> */
  function tok(v){ return s(v).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60).toLowerCase(); }
  function byThread(mail, ctx){
    const H = mail.headers || {}, refs = s(H['in-reply-to']) + ' ' + s(H['references']);
    const ids = refs.match(/<[^<>\s]+>/g) || [];
    for (const m of ids) {
      const x = /^<bid\.([A-Za-z0-9_-]{1,60})\.([A-Za-z0-9_-]{1,20})\.[A-Za-z0-9]+@grayco-cs\.com>$/i.exec(m);
      let lead = null, b = null;
      if (x) { lead = ctx.leads.find(l => tok(l.id) === low(x[1])) || null; if (lead) b = biddersOf(ctx, lead).find(y => low(y.id) === low(x[2])) || null; }
      if (!lead) ctx.leads.forEach(l => { if (lead) return; biddersOf(ctx, l).forEach(y => { if (!lead && arr(y.log).some(g => g && low(g.messageId) === low(m))) { lead = l; b = y; } }); });
      if (lead) return { lead, bidder: b, how: 'thread' };
    }
    return null;
  }
  function bidNoHit(l, list, subj){
    const t = low(subj).replace(/\s+/g, ' ');
    return [s(l.bidNumber)].concat(list.map(b => s(b.bidNo))).map(x => low(x).replace(/\s+/g, ' ')).some(x => x.length >= 4 && t.indexOf(x) >= 0);
  }
  /* opts.isSub(email): a known subcontractor — only our thread, an exact "Bidding to" contact or our own old subject pattern then */
  function match(mail, ctx, opts){
    opts = opts || {};
    const from = low(mail.from && mail.from.email); if (!from || OURS.test(from)) return null;
    const subj = s(mail.subject), dom = domOf(from);
    const loose = /^\s*(re|aw)\s*:/i.test(subj) && !(typeof opts.isSub === 'function' && opts.isSub(from));
    const th = byThread(mail, ctx); if (th) return th;
    const open = ctx.leads.filter(l => !closedLead(l));
    /* 1. a contact on a lead's "Bidding to" list */
    let c = [];
    open.forEach(l => biddersOf(ctx, l).forEach(b => { if (low(b.email) === from) c.push({ lead: l, bidder: b }); }));
    if (c.length) {
      c.sort((a, b) => (subjectHits(b.lead, subj) - subjectHits(a.lead, subj)) || (rank(b.lead) - rank(a.lead)));
      return Object.assign(c[0], { how: 'contact' });
    }
    /* 2. the project in the subject */
    const our = /^(?:(?:re|fw|fwd|aw)\s*:\s*)*(.+?)\s+[—–-]\s+GrayCo Construction Services bid for\s+(.+)$/i.exec(subj);
    let best = null, score = 0, tie = false;
    open.forEach(l => {
      const sc = our && norm(our[1]) === norm(l.name || l.title) ? 1000 : loose && bidNoHit(l, biddersOf(ctx, l), subj) ? 500 : (our || loose) ? subjectHits(l, our ? our[1] : subj) : 0;
      if (sc > score) { best = l; score = sc; tie = false; } else if (sc && sc === score) tie = true;
    });
    if (best && !tie) {
      const list = biddersOf(ctx, best);
      let b = dom && !FREE.test(dom) ? list.find(x => domOf(x.email) === dom) : null;
      if (!b) { const gc = norm(our ? our[2] : subj + ' ' + s(mail.text).slice(0, 600)); b = list.find(x => s(x.company).length >= 3 && gc.indexOf(norm(x.company)) >= 0) || null; }
      return { lead: best, bidder: b, how: 'subject' };
    }
    /* 3. the GC's company domain, on exactly one open lead */
    if (loose && dom && !FREE.test(dom)) {
      c = [];
      open.forEach(l => biddersOf(ctx, l).forEach(b => { if (domOf(b.email) === dom) c.push({ lead: l, bidder: b }); }));
      if (c.length === 1) return Object.assign(c[0], { how: 'domain' });
    }
    return null;
  }

  /* ── urgent? ── */
  function classify(mail, lead, bidder, t){
    const body = stripQuoted(s(mail.text)), hay = s(mail.subject).replace(/^((re|fw|fwd)\s*:\s*)+/i, '') + '\n' + body;
    const reasons = [];
    RULES.forEach(r => { if (r[2].test(hay)) reasons.push(r[0]); });
    if (arr(mail.files).some(f => /addend|revis|rev\s*\d|bulletin|asi\b/i.test(s(f.name))) && reasons.indexOf('addendum') < 0) reasons.push('addendum');
    const due = dueOf(lead, bidder);
    if (due) {
      const at = BD.wallToEpoch(due.length > 10 ? due : due + 'T17:00');
      if (isFinite(at) && t <= at && at - t <= 72 * 3600000) reasons.push('soon');
    }
    /* a new due date in the reply: a suggestion only */
    let dueChange = null;
    if (reasons.indexOf('due') >= 0 || /\bdue\b/i.test(body)) {
      const f = BD.findDue(body, { ref: t });
      if (f && f.due && f.due !== due && (reasons.indexOf('due') >= 0 || (due && f.due.slice(0, 10) !== due.slice(0, 10)))) dueChange = { to: f.due, from: due };
      if (dueChange && reasons.indexOf('due') < 0) reasons.push('due');
    }
    const line = body.replace(/^\s*(hi|hello|hey|good (morning|afternoon))[^\n]*\n/i, '').split(/\n+/).map(x => x.trim()).filter(x => x.length > 8 && !/^(thanks|thank you|regards|best|sincerely)\b/i.test(x))[0] || s(mail.subject);
    return { urgent: reasons.length > 0, reasons, dueChange, summary: line.replace(/\s+/g, ' ').slice(0, 140), text: body.slice(0, TEXT_MAX) };
  }
  const LABEL = {}; RULES.forEach(r => { LABEL[r[0]] = r[1]; }); LABEL.soon = 'Within 72 h of the bid due date'; LABEL.ai = 'Flagged by Claude';
  /* Claude haiku: a second opinion and a better one-line summary (never needed: the rules work alone) */
  async function aiRead(mail, lead, bidder, cls){
    if (!env('ANTHROPIC_API_KEY') || env('BID_REPLY_AI') === '0' || typeof d.callClaude !== 'function') return null;
    const tool = { name: 'bid_reply', description: 'How urgent a general contractor\'s reply about a bid is for the estimator.',
      input_schema: { type: 'object', properties: { urgent: { type: 'boolean', description: 'true when the estimator must act before the bid is due: an addendum, revised drawings/specs, scope added or removed, alternates, value engineering, RFI answers, a due date/time change, a bid form change, a pre-bid meeting / walk-through, or a request to confirm something' },
        summary: { type: 'string', description: 'one plain line, under 120 characters, of what the GC is asking or telling us' }, new_due: { type: 'string', description: 'a new bid due date-time YYYY-MM-DDTHH:MM (Central) if the e-mail changes it, else empty' } }, required: ['urgent', 'summary'] } };
    const prompt = 'Project: ' + s(lead.name || lead.title) + '\nGC: ' + s(bidder && bidder.company) + '\nOur bid is due: ' + s(dueOf(lead, bidder)) + '\nSubject: ' + s(mail.subject) + '\n\n' + cls.text.slice(0, 2500) + '\n\nRead this reply and call bid_reply.';
    const body = { model: env('BID_REPLY_MODEL') || 'claude-haiku-5-5', max_tokens: 400, tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: prompt }] };
    try {
      const r = await d.callClaude(body, parseInt(env('BID_REPLY_AI_MS') || '8000', 10));
      const t = r && r.ok && r.j && arr(r.j.content).find(b => b && b.type === 'tool_use');
      return t && t.input && typeof t.input === 'object' ? t.input : null;
    } catch (e) { return null; }
  }

  /* ── gc_kv gc_bid_replies (read again just before writing; checked after) ── */
  async function readList(){ const r = await sb('gc_kv?select=value&key=eq.' + KEY); if (!r.ok) throw new Error('gc_kv answered ' + r.status); const rows = await r.json(); return arr(parse(rows && rows[0] ? rows[0].value : [])); }
  async function writeList(list){ const w = await sb('gc_kv?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: KEY, value: JSON.stringify(list), updated_at: nowIso() }) }); return w.ok; }
  async function append(entry){
    for (let i = 0; i < 4; i++) {
      const list = await readList();
      if (list.some(x => x && (x.id === entry.id || (entry.mid && x.mid === entry.mid)))) return false;
      if (!(await writeList(list.concat([entry]).slice(-MAX)))) throw new Error('could not write ' + KEY);
      const after = await readList();
      if (after.some(x => x && x.id === entry.id)) return true;
    }
    throw new Error('could not keep the reply');
  }

  /* ── who is told ── */
  function emailOfName(ctx, name){ const u = ctx.users.find(x => x && low(x.name) === low(name)); return u ? low(u.email) : ''; }
  /* owner 10/22: "bids@ replies go automatically to the Senior Estimator" — the Senior Estimator ALWAYS (_lib/estimator.js),
     plus the lead's own estimator / PM when that is someone else */
  const OK_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/;
  async function whoFor(lead, ctx){
    const out = [];
    try { const e = typeof d.estimatorOf === 'function' ? await d.estimatorOf() : null; if (e && OK_EMAIL.test(low(e.email))) out.push({ name: s(e.name), email: low(e.email), head: true }); } catch (e) {}
    [[s(lead.pm), low(lead.pmEmail)], [s(lead.estimator), low(lead.estimatorEmail)], [s(lead.apm), low(lead.apmEmail)]].forEach(p => {
      const em = p[1] || emailOfName(ctx, p[0]);
      if ((p[0] || p[1]) && OK_EMAIL.test(em) && !out.some(x => x.email === em)) out.push({ name: p[0], email: em });
    });
    return out;
  }
  function leadLink(id){ return site() + '/#leads&lead=' + encodeURIComponent(s(id)); }
  function loadWebPush(){ try { return require('web-push'); } catch (e) { return null; } }
  async function push(to, p){
    const pub = env('VAPID_PUBLIC_KEY'), priv = env('VAPID_PRIVATE_KEY');
    if (!pub || !priv) return { sent: 0, why: 'phone push is not set up' };
    const wp = d.webPush || loadWebPush(); if (!wp) return { sent: 0, why: 'web-push is not installed' };
    try { wp.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:office@grayco-cs.com', pub, priv); } catch (e) { return { sent: 0, why: 'bad VAPID keys' }; }
    const payload = JSON.stringify(p); let sent = 0;
    for (const email of to) {
      let subs = [];
      try { const r = await sb('gc_kv?select=value&key=eq.' + encodeURIComponent('gc_push_subs__' + email)); const rows = r.ok ? await r.json() : []; subs = arr(parse(rows && rows[0] ? rows[0].value : [])).filter(x => x && x.endpoint && x.keys); } catch (e) {}
      for (const sub of subs) { try { await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 86400 }); sent++; } catch (e) {} }
    }
    return { sent };
  }
  function alertMail(e){
    const project = e.leadName || 'a bid', gc = e.gc || e.fromName || e.from;
    const subject = ('⚠️ URGENT bid change: ' + project + ' — ' + gc + ': ' + e.summary).slice(0, 250);
    const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#b91c1c;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">⚠️ Urgent bid change — ' + esc(project) + '</div><div style="padding:6px 18px 18px">'
      + '<p><b>' + esc(gc) + '</b>' + (e.fromName && e.fromName !== gc ? ' (' + esc(e.fromName) + ', ' + esc(e.from) + ')' : ' (' + esc(e.from) + ')') + ' answered our bid' + (e.due ? ' — due <b>' + esc(BD.fmtDue(e.due)) + '</b>' : '') + '.</p>'
      + '<p><b>Why it is urgent:</b> ' + esc(e.reasons.map(r => LABEL[r] || r).join(' · ')) + '</p>'
      + (e.dueChange ? '<p style="color:#b91c1c"><b>📨 Due date changed to ' + esc(BD.fmtDue(e.dueChange.to)) + '</b> — review &amp; apply it on the lead (nothing changes by itself).</p>' : '')
      + '<p style="color:#555">Subject: ' + esc(e.subject) + '<br>' + (e.files.length ? e.files.length + ' file(s) kept under Plans: ' + e.files.map(f => esc(f.name)).join(', ') : 'No files attached') + '</p>'
      + (e.text ? '<blockquote style="border-left:3px solid #ddd;margin:8px 0;padding:4px 10px;color:#333">' + esc(e.text.slice(0, 1500)).replace(/\n/g, '<br>') + '</blockquote>' : '')
      + '<p><a href="' + esc(leadLink(e.leadId)) + '" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open this lead in the CRM</a></p>'
      + '<p style="color:#777;font-size:12px">Hit Reply to answer the GC. It stays flagged "Bid change" on the lead until you mark it reviewed.</p></div></div>';
    const text = subject + '\n\n' + e.text.slice(0, 1500) + '\n\nOpen the lead: ' + leadLink(e.leadId);
    return { subject, html, text };
  }
  async function alert(e, lead, ctx){
    const who = await whoFor(lead, ctx);
    let to = who.map(x => x.email);
    if (!to.length && typeof d.recipients === 'function') { try { to = await d.recipients([]); } catch (x) {} }
    if (!to.length) return { ok: false, why: 'nobody to tell' };
    const p = { title: (e.urgent ? '⚠️ URGENT bid change: ' : '📨 Reply on our bid: ') + (e.leadName + ' — ' + (e.gc || e.from)).slice(0, 90), body: s(e.summary).slice(0, 180), tag: 'bid-reply-' + e.id, link: leadLink(e.leadId) };
    const pr = await push(to, p);
    if (!e.urgent) return { ok: true, to, pushed: pr.sent, mail: false };
    const key = env('RESEND_API_KEY'); if (!key) return { ok: false, to, pushed: pr.sent, why: 'RESEND_API_KEY is not set' };
    const m = alertMail(e);
    try {
      const r = await (d.fetch || fetch)('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env('SUB_BID_FROM') || 'GrayCo Bids <bids@grayco-cs.com>', to, reply_to: e.from || undefined, subject: m.subject, html: m.html, text: m.text, headers: { 'X-GrayCo-CRM': 'bid-reply-alert' } }) });
      return { ok: r.ok, to, pushed: pr.sent, mail: r.ok, why: r.ok ? '' : 'Resend answered ' + r.status };
    } catch (x) { return { ok: false, to, pushed: pr.sent, why: 'Resend unreachable' }; }
  }

  /* ── one e-mail: matched → kept → told. null when it is not a reply to one of our bids ── */
  async function handle(mail, opts){
    opts = opts || {};
    const ctx = opts.ctx || await context();
    let hit = null;
    if (opts.force && s(opts.force.leadId)) {   /* someone picked the lead in the CRM (an unsorted bids@ e-mail) */
      const l = ctx.leads.find(x => s(x.id) === s(opts.force.leadId)); if (!l) return { ok: false, why: 'No such lead.' };
      hit = { lead: l, bidder: biddersOf(ctx, l).find(b => s(b.id) === s(opts.force.bidderId)) || null, how: 'picked' };
    } else hit = match(mail, ctx, opts);
    if (!hit) return null;
    const t = now(), lead = hit.lead, b = hit.bidder || null;
    const cls = classify(mail, lead, b, t);
    const ai = await aiRead(mail, lead, b, cls);
    if (ai) {
      if (ai.urgent && !cls.urgent) { cls.urgent = true; cls.reasons.push('ai'); }
      if (s(ai.summary)) cls.summary = s(ai.summary).slice(0, 140);
      if (!cls.dueChange && /^\d{4}-\d\d-\d\d/.test(s(ai.new_due)) && s(ai.new_due) !== dueOf(lead, b)) { cls.dueChange = { to: s(ai.new_due).slice(0, 16), from: dueOf(lead, b) }; if (cls.reasons.indexOf('due') < 0) cls.reasons.push('due'); cls.urgent = true; }
    }
    const mid = s(mail.messageId).slice(0, 200);
    const id = 'br_' + sha(mid || (mail.id || '') + '|' + low(mail.from.email) + '|' + mail.subject + '|' + mail.date).slice(0, 20);
    const files = [];
    for (const f of arr(mail.files)) {
      const meta = { name: s(f.name).slice(0, 150), type: s(f.type), size: f.size || 0, kind: /addend|bulletin|asi\b/i.test(f.name) ? 'addendum' : /spec/i.test(f.name) ? 'specs' : /plan|drawing|sheet|dwg|rev/i.test(f.name) ? 'plans' : 'other' };
      if (/^sb:crm-files\//.test(s(f.ref))) meta.ref = s(f.ref);
      else if (f.buf && typeof d.storeFile === 'function') { try { const st = await d.storeFile(f.buf, f.type, f.name); if (st && st.ref) meta.ref = st.ref; } catch (e) {} }
      files.push(meta);
    }
    const entry = { id, mid, at: nowIso(), via: s(opts.via) || 'bids@', how: hit.how, leadId: s(lead.id), leadName: s(lead.name || lead.title).slice(0, 200),
      bidderId: b ? s(b.id) : '', gc: b ? s(b.company).slice(0, 120) : '', due: dueOf(lead, b), from: low(mail.from.email), fromName: s(mail.from.name).slice(0, 80),
      subject: s(mail.subject).slice(0, 250), text: cls.text, summary: cls.summary, urgent: cls.urgent, reasons: cls.reasons, dueChange: cls.dueChange, files, ai: !!ai,
      results: /^(?:(?:re|fw|fwd)\s*:\s*)*bid results\b/i.test(s(mail.subject)) };
    const added = await append(entry);
    if (!added) return { ok: true, already: true, id, leadId: entry.leadId };
    if (entry.results && typeof d.kvAppendResult === 'function') {
      await d.kvAppendResult({ id: 'ans_' + id, kind: 'answer', lead: low(entry.leadId), leadId: entry.leadId, bidderId: entry.bidderId, at: nowIso(), from: entry.from, fromName: entry.fromName, subject: entry.subject.slice(0, 200), text: entry.text.slice(0, 1500) }).catch(() => false);
    }
    let told = { ok: false };
    try { told = await alert(entry, lead, ctx); } catch (e) { told = { ok: false, why: s(e && e.message) }; }
    return { ok: true, id, leadId: entry.leadId, bidderId: entry.bidderId, gc: entry.gc, how: hit.how, urgent: entry.urgent, reasons: entry.reasons, dueChange: entry.dueChange, files: files.length, told };
  }

  return { handle, match, classify, context, biddersOf, alertMail, KEY, LABEL };
}
module.exports = { make, KEY, RULES };
/* patch LOGOALL (owner 10/23: "should have our logo on it"): every customer / sub / GC e-mail this file sends
   straight to Resend gets the GrayCo shell (centered logo, office line, licenses). Internal @grayco-cs.com mail is untouched. */
try { require('./brand.js').installResend(); } catch (e) {}
