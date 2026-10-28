/* ============================================================================
   GrayCo — 🚨 EMERGENCY ESCALATION CALLS (patch EMERGCALL).   netlify/functions/_lib/emergcall.js

   Owner (10/28): "for emergency water or fire tree damages make sure you make a phone call to who is on call / order of
   call after 15 min of no answering a text".

   An EMERGENCY lead (emergency.js: water / flood / leak, fire / smoke, a tree on the house / roof, storm damage) is
   alerted as before (e-mail, push, texts — bid-alerts.js emergency()). It is also registered here. If nobody has
   ACKNOWLEDGED it within N minutes (Admin → 📞 Call order → "Emergency escalation calls after [15] min", default on),
   the CRM PHONES people, one at a time (Twilio REST Calls API, from TWILIO_FROM, ~25 s ring each):
     1. this week's on-call person (💧 Mitigation → 📟 On call), then
     2. the 📞 Call order list, in order (anyone already called / with no phone is skipped).
   The call says "GrayCo emergency. A customer reported <water damage / a fire / a tree on the house> at <city>, <N>
   minutes ago, and nobody has answered yet. Press 1 to be connected to the customer now. Press 2 to accept and call them
   yourself." 1 → <Dial> the customer (caller ID = the GrayCo number); 2 → accepted, the details go to them by text.
   No key / a voicemail → the next person. The first key pressed stops it. The whole list once more 10 minutes later,
   then the admins are e-mailed "nobody answered".
   Acknowledged = ack() was called (the on-call page ✅ Accept, a reply to the alert text — claude/smsalert hooks in
   here), or the lead was assigned / contacted / its stage moved in the CRM, or a staff member texted / e-mailed the
   customer after it came in. Quiet hours do not apply; data-entry mode (_lib/pause) does — no calls while it is on.
   State: gc_lead_inbox_kv "gc_emerg_calls". Webhooks: missed-call.js ?event=ecall | ecallkey | ecallstatus (signed).
   Ticked every 2 minutes by x10-scheduled.js.
   ========================================================================== */
'use strict';
const KEY = 'gc_emerg_calls';
const RING_S = 25, RETRY_MIN = 10, KEEP_DAYS = 7;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; }
function tidy(v){ const d = phone10(v); return d ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }

/* what happened, in words for the call */
function kindOf(it){
  const t = [it.title, it.detail, it.message, it.scope, it.type, it.leadKind, it.service, it.contact && it.contact.message].map(s).join(' ');
  if (/\b(fire|smoke|soot|burn)/i.test(t)) return 'a fire';
  if (/\btree\b/i.test(t)) return 'a tree on the house';
  if (/water|flood|leak|burst|pipe|sewage|mou?ld/i.test(t)) return 'water damage';
  if (/storm|hail|wind/i.test(t)) return 'storm damage';
  return 'an emergency';
}
function cityOf(it){
  if (s(it.city)) return s(it.city);
  const a = s(it.address).split(',').map(s).filter(Boolean);
  return a.length >= 2 ? a[a.length - 2].replace(/\s+\d{5}.*$/, '').replace(/\s+[A-Z]{2}$/, '') : '';
}
function settingsOf(order){ const e = order && order.emerg && typeof order.emerg === 'object' ? order.emerg : {}; const m = parseInt(e.minutes, 10); return { on: e.on !== false, minutes: isFinite(m) ? Math.max(5, Math.min(120, m)) : 15 }; }

/* acknowledged? (pure) — rec: our record; ctx: { inbox (Lead Inbox item), lead (CRM lead), pages (on-call pages), lastOut (gc_sms_state.lastOut), msgs (gc_job_messages) } */
const SYS_BY = /lead inbox|system|website|server|crm|auto|twilio|emergency/i;
function ackReason(rec, ctx){
  ctx = ctx || {};
  if (rec.ackAt) return rec.ackWhy || 'acknowledged';
  const t0 = s(rec.createdAt), after = v => !!s(v) && s(v) > t0;
  const it = ctx.inbox || {};
  if (after(it.assignedAt) && s(it.assignedBy)) return 'assigned in the CRM' + (it.pm ? ' to ' + s(it.pm) : '');
  if (/^(dismissed|merged)$/i.test(s(it.status)) && after(it.updatedAt)) return 'dismissed in the Lead Inbox';
  const l = ctx.lead || null;
  if (l) {
    const st = low(l.stage);
    if (st && !/^(new|new lead|lead|unassigned)$/.test(st)) return 'stage moved to ' + s(l.stage);
    for (const f of ['contactedAt', 'lastContact', 'lastContacted', 'lastContactAt', 'firstContactAt']) if (s(l[f])) return 'marked contacted';
    for (const f of ['calls', 'followUps', 'activity', 'comments', 'contactLog']) if (arr(l[f]).some(c => c && typeof c === 'object' && after(c.at || c.date) && !SYS_BY.test(s(c.by || c.who || c.author)))) return 'a call / note logged';
  }
  const pg = arr(ctx.pages).find(p => p && p.acceptedAt && (s(p.leadId) === s(rec.leadId) || (rec.leadKey && s(p.leadKey) === s(rec.leadKey))));
  if (pg) return 'accepted on the on-call page by ' + (pg.acceptedName || pg.acceptedBy);
  const ph = phone10(rec.contact && rec.contact.phone);
  if (ph) {
    const lo = ctx.lastOut && ctx.lastOut[ph];
    if (lo && after(lo.at)) return 'texted by ' + (lo.name || lo.email || 'staff');
    if (arr(ctx.msgs).some(m => m && m.dir === 'out' && phone10(m.smsTo) === ph && after(m.at) && !/auto/i.test(s(m.authorId)))) return 'texted by staff';
  }
  return '';
}

function make(d){
  const env = k => s(d.env(k));
  const now = () => typeof d.now === 'function' ? d.now() : Date.now();
  const nowIso = () => new Date(now()).toISOString();
  const site = () => (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  const hook = (ev, q) => site() + '/.netlify/functions/missed-call?event=' + ev + Object.keys(q).map(k => '&' + k + '=' + encodeURIComponent(String(q[k]))).join('');
  async function cas(fn){
    let out;
    await d.kvCas(KEY, v => {
      v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; v.list = arr(v.list);
      const cut = new Date(now() - KEEP_DAYS * 864e5).toISOString(); v.list = v.list.filter(x => x && s(x.createdAt) >= cut);
      out = fn(v.list); return out === false ? undefined : v;
    });
    return out;
  }
  async function list(){ const v = await d.kvGet(KEY); return arr(v && v.list); }
  async function get(id){ return (await list()).find(x => x && x.id === id) || null; }
  const hist = (r, what) => { r.history = arr(r.history).concat([{ at: nowIso(), what }]).slice(-60); };

  /* a new emergency lead (bid-alerts.js emergency(), once per lead) */
  async function register(x, raw){
    const it = Object.assign({}, raw || {}, x || {}), c = it.contact && typeof it.contact === 'object' ? it.contact : {};
    const id = 'EC-' + s(it.id || it.key).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    if (id === 'EC-') return { skipped: 'no id' };
    return cas(l => {
      if (l.some(r => r.id === id)) return false;
      l.push({ id, leadId: s(it.id), leadKey: s(it.key), title: s(it.title).slice(0, 160), kind: kindOf(it), city: cityOf(it).slice(0, 60),
        contact: { name: s(c.name || it.contactName).slice(0, 80), phone: phone10(c.phone || it.phone) }, createdAt: nowIso(), state: 'waiting', round: 0, step: -1, called: [], history: [{ at: nowIso(), what: 'registered' }] });
      return { registered: id };
    }).then(r => r || { skipped: 'already registered' });
  }
  /* someone has it (the on-call page Accept, a reply to the alert text, …) */
  async function ack(leadIdOrKey, why){
    const k = s(leadIdOrKey);
    return cas(l => { let n = 0; l.forEach(r => { if ((r.leadId === k || r.leadKey === k || r.id === k) && !r.ackAt && !/^(connected|accepted|gaveup)$/.test(r.state)) { r.ackAt = nowIso(); r.ackWhy = s(why) || 'acknowledged'; if (r.state === 'waiting' || r.state === 'retry') r.state = 'acked'; hist(r, 'acknowledged: ' + r.ackWhy); n++; } }); return n ? { acked: n } : false; }).then(r => r || { acked: 0 });
  }

  /* who to call: this week's on-call person, then the 📞 Call order (no repeats, no empty numbers) */
  async function chainNow(){
    const out = [], seen = {};
    const add = (label, name, ph) => { ph = phone10(ph); if (!ph || seen[ph] || ph === phone10(env('TWILIO_FROM'))) return; seen[ph] = 1; out.push({ label, name: s(name), phone: ph }); };
    try { const X = require('./x10.js'), c = X.oncallCfg(await d.kvGet('gc_x10_oncall')); const o = c.on && c.rotation.length ? X.onCallNow(now(), c) : null;
      if (o) { let ph = o.phone; if (!phone10(ph)) { try { const u = arr(d.users ? await d.users() : []).find(x => low(x.email) === low(o.email)); if (u) ph = u.phone || u.cell || u.mobile; } catch (e) {} } add('On call', o.name || o.email, ph); } } catch (e) {}
    try { const CO = require('./callorder.js'); const raw = await d.kvGet(CO.KEY); const cfg = raw && typeof raw === 'object' ? CO.clean(raw) : CO.defaults();
      const data = d.crm ? await d.crm() : {}; CO.resolve(cfg, data, { ours: [env('TWILIO_FROM')] }).list.forEach(x => add(x.label, x.name, x.number)); } catch (e) {}
    return out;
  }
  async function placeCall(rec, step){
    const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM'), who = rec.chain[step];
    if (!sid || !tok || !from || !who) return { ok: false, why: 'not set up' };
    try {
      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Calls.json', { method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: '+1' + who.phone, From: from, Url: hook('ecall', { id: rec.id, step }), Method: 'POST', Timeout: String(RING_S),
          StatusCallback: hook('ecallstatus', { id: rec.id, step }), StatusCallbackMethod: 'POST', StatusCallbackEvent: 'completed' }).toString() });
      let j = {}; try { j = await r.json(); } catch (e) {}
      return { ok: r.ok, sid: s(j.sid), status: r.status };
    } catch (e) { return { ok: false, why: 'Twilio unreachable' }; }
  }
  async function paused(){ try { return await require('./pause').isPaused(); } catch (e) { return true; } }
  /* call step `step` of rec (claimed first, so a tick and a status callback never both call) */
  async function callStep(id, step, round){
    let rec = null;
    await cas(l => { const r = l.find(x => x.id === id); if (!r || /^(connected|accepted|acked|gaveup)$/.test(r.state) || (r.round === round && r.step >= step)) return false;
      r.state = 'calling'; r.round = round; r.step = step; r.lastCallAt = nowIso(); r.called = arr(r.called).concat([{ at: nowIso(), round, step, to: r.chain[step] && r.chain[step].label }]); hist(r, 'calling ' + (r.chain[step] ? r.chain[step].label + ' ' + r.chain[step].name : '?')); rec = JSON.parse(JSON.stringify(r)); return true; });
    if (!rec) return { skipped: true };
    const c = await placeCall(rec, step);
    if (c.ok) await cas(l => { const r = l.find(x => x.id === id); if (!r) return false; r.callSid = c.sid; return true; });
    else await cas(l => { const r = l.find(x => x.id === id); if (!r) return false; hist(r, 'call failed: ' + (c.why || c.status)); return true; });
    return { called: rec.chain[step], ok: c.ok };
  }
  /* the call to step `step` ended without a key → the next one / the retry / give up */
  async function advance(id, step){
    const r = await get(id); if (!r || r.state !== 'calling' || r.step !== step) return { skipped: true };
    if (r.ackAt) { await cas(l => { const x = l.find(y => y.id === id); if (!x || x.state !== 'calling') return false; x.state = 'acked'; hist(x, 'stopped: ' + x.ackWhy); return true; }); return { acked: true }; }
    if (await paused()) return { paused: true };
    if (step + 1 < arr(r.chain).length) return callStep(id, step + 1, r.round);
    if (r.round < 2) { await cas(l => { const x = l.find(y => y.id === id); if (!x || x.state !== 'calling') return false; x.state = 'retry'; x.retryAt = new Date(now() + RETRY_MIN * 60000).toISOString(); hist(x, 'nobody pressed a key — once more in ' + RETRY_MIN + ' min'); return true; }); return { retry: true }; }
    let mine = false;
    await cas(l => { const x = l.find(y => y.id === id); if (!x || x.state === 'gaveup') return false; x.state = 'gaveup'; hist(x, 'nobody answered — admins e-mailed'); mine = true; return true; });
    if (mine && typeof d.mailAdmins === 'function') { try { await d.mailAdmins('🚨 Nobody answered the emergency calls: ' + r.title, r); } catch (e) {} }
    return { gaveup: true };
  }
  /* every 2 minutes (x10-scheduled.js) */
  async function tick(){
    let order = null; try { order = await d.kvGet(require('./callorder.js').KEY); } catch (e) {}
    const set = settingsOf(order);
    const all = await list(), open = all.filter(r => /^(waiting|calling|retry)$/.test(r.state));
    if (!open.length) return { open: 0 };
    if (!set.on) return { open: open.length, off: true };
    if (await paused()) return { open: open.length, paused: true };
    const ctx = d.ackCtx ? await d.ackCtx() : {};
    const out = { open: open.length, calls: 0, acked: 0 };
    for (const r of open) {
      const why = ackReason(r, { inbox: (ctx.inbox || {})[r.leadId], lead: (ctx.leads || {})[r.leadId] || (ctx.leads || {})[r.leadKey], pages: ctx.pages, lastOut: ctx.lastOut, msgs: ctx.msgs });
      if (why) { await ack(r.leadId || r.id, why); out.acked++; continue; }   /* during a call: the next person is not called (advance) */
      if (r.state === 'waiting' && now() - Date.parse(r.createdAt) >= set.minutes * 60000) {
        const ch = await chainNow();
        if (!ch.length) { await cas(l => { const x = l.find(y => y.id === r.id); if (!x) return false; x.state = 'gaveup'; hist(x, 'nobody to call (no on-call phone, empty call order)'); return true; }); continue; }
        await cas(l => { const x = l.find(y => y.id === r.id); if (!x || x.state !== 'waiting') return false; x.chain = ch; return true; });
        const c = await callStep(r.id, 0, 1); if (c.called) out.calls++;
      } else if (r.state === 'retry' && now() >= Date.parse(r.retryAt)) {
        const c = await callStep(r.id, 0, 2); if (c.called) out.calls++;
      } else if (r.state === 'calling' && now() - Date.parse(r.lastCallAt) > 4 * 60000) {
        await advance(r.id, r.step);   /* the status callback never came */
      }
    }
    return out;
  }
  /* ── the call itself (missed-call.js, signed webhooks) ── */
  function say(t){ return '<Say voice="Polly.Joanna">' + t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</Say>'; }
  function message(r){
    const min = Math.max(1, Math.round((now() - Date.parse(r.createdAt)) / 60000));
    return 'GrayCo emergency. A customer reported ' + r.kind + (r.city ? ' at ' + r.city : '') + ', ' + min + ' minutes ago, and nobody has answered yet. '
      + (r.contact && r.contact.phone ? 'Press 1 to be connected to the customer now. ' : '') + 'Press 2 to accept and call them yourself.';
  }
  async function twimlCall(id, step){
    const r = await get(id);
    if (!r || /^(connected|accepted|acked|gaveup)$/.test(r.state)) return say('This GrayCo emergency has been taken care of. Thank you.') + '<Hangup/>';
    const m = message(r), act = hook('ecallkey', { id, step }).replace(/&/g, '&amp;');
    return '<Gather numDigits="1" timeout="8" action="' + act + '" method="POST">' + say(m) + '<Pause length="1"/>' + say(m) + '</Gather><Hangup/>';
  }
  async function key(id, step, digits, by){
    const r0 = await get(id); if (!r0) return '<Hangup/>';
    const k = s(digits);
    if (k !== '1' && k !== '2') return '<Hangup/>';
    let first = false;
    await cas(l => { const r = l.find(x => x.id === id); if (!r || /^(connected|accepted)$/.test(r.state)) return false; first = true; r.state = k === '1' && r.contact.phone ? 'connected' : 'accepted';
      r.acceptedAt = nowIso(); r.acceptedBy = (r.chain && r.chain[step] ? r.chain[step].label + ' ' + r.chain[step].name : tidy(by)).trim(); hist(r, (r.state === 'connected' ? 'pressed 1 — connected to the customer: ' : 'pressed 2 — accepted: ') + r.acceptedBy); return true; });
    if (!first) return say('Someone else already has this emergency. Thank you.') + '<Hangup/>';
    try { if (typeof d.onAccepted === 'function') await d.onAccepted(r0, r0.chain && r0.chain[step]); } catch (e) {}
    if (k === '1' && r0.contact.phone) return say('Connecting you to the customer now.') + '<Dial callerId="' + env('TWILIO_FROM') + '" timeout="30"><Number>+1' + r0.contact.phone + '</Number></Dial>';
    const who = r0.chain && r0.chain[step];
    if (who && who.phone && typeof d.sms === 'function') {
      try { await d.sms(who.phone, '🚨 GrayCo emergency (you accepted): ' + r0.kind + (r0.city ? ' at ' + r0.city : '') + ' — ' + [r0.contact.name, r0.contact.phone ? tidy(r0.contact.phone) : ''].filter(Boolean).join(' ') + '. ' + r0.title + ' · ' + site() + '/#leads'); } catch (e) {}
    }
    return say('Thank you. The details are on their way by text. Goodbye.') + '<Hangup/>';
  }
  return { register, ack, tick, advance, callStep, chainNow, twimlCall, key, list, get, message, KEY };
}
module.exports = { make, KEY, kindOf, cityOf, ackReason, settingsOf, RING_S, RETRY_MIN };
