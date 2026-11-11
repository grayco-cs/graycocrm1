/* ============================================================================
   GrayCo — 🚨 EMERGENCY ESCALATION CALLS (patch EMERGCALL).   netlify/functions/_lib/emergcall.js

   Owner (10/28): "for emergency water or fire tree damages make sure you make a phone call to who is on call / order of
   call after 15 min of no answering a text".

   An EMERGENCY lead (emergency.js: water / flood / leak, fire / smoke, a tree on the house / roof, storm damage) is
   alerted as before (e-mail, push, texts — bid-alerts.js emergency()). It is also registered here. If nobody has
   ACKNOWLEDGED it within N minutes (Admin → 📞 Call order → "Emergency escalation calls after [15] min", default on),
   the CRM PHONES people, one at a time (Twilio REST Calls API, from TWILIO_FROM, ~25 s ring each):
     1. this week's on-call person (💧 Mitigation → 📟 On call), then
     2. the 📞 Call order list, in order (after hours: the after-hours order — Mitigation manager → Nick → Wesley;
        anyone already called / with no phone is skipped).
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
/* PERSIST (owner 11/11: "emergency on call gets a text and phone call, phone call every 2 minutes for 10 minutes until they answer, then go
   to the next on deck"): each person is texted once and called right away, then again every REDIAL_MIN until PER_PERSON_MIN have passed
   without a key pressed; then the next person in line gets the same. The first call goes out on the first tick (no waiting). */
const REDIAL_MIN = 2, PER_PERSON_MIN = 10;
/* ONCALL2 (owner 11/11): "mit manager gets the call to say we got it and on the way, if the mit manager doesn't answer it goes to the
   foreman" · "if emergency calls do not get answered in 15 minutes call the insurance lead manager and then the owners, Wesley first, but
   that is last resort and people are going to be punished somehow if emergency calls get all the way back to the owners"
   → the CREW (Mitigation Manager → this week's on-call foreman → the rest of the 📞 Call order, owners taken out) has DEADLINE_MIN;
     nobody pressed a key by then → the LAST RESORT: the insurance lead manager, then the owners (in their set order).
     Reaching the last resort is logged against everyone in the crew who was called and did not answer (MISS_KEY, 📟 On call → 🚩).
   The on-call TECH is texted once (after hours) to get ready to go — the Mitigation Manager sends them. */
const DEADLINE_MIN = 15, MISS_KEY = 'gc_emerg_misses';
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
function settingsOf(order){ const e = order && order.emerg && typeof order.emerg === 'object' ? order.emerg : {}; const m = parseInt(e.minutes, 10); return { on: e.on !== false, minutes: 0, savedMinutes: isFinite(m) ? m : null }; }   /* PERSIST: the on-call person is texted + called at once (the old "after N min" wait is no longer used) */

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
    return cas(l => { let n = 0; l.forEach(r => { if ((r.leadId === k || r.leadKey === k || r.id === k) && !r.ackAt && !/^(connected|accepted|gaveup)$/.test(r.state)) { r.ackAt = nowIso(); r.ackWhy = s(why) || 'acknowledged'; if (r.state === 'waiting' || r.state === 'retry' || r.state === 'redial') r.state = 'acked'; hist(r, 'acknowledged: ' + r.ackWhy); n++; } }); return n ? { acked: n } : false; }).then(r => r || { acked: 0 });
  }

  /* who to call (ONCALL2): the crew — the Mitigation Manager, this week's on-call foreman, the rest of the 📞 Call order —
     then the last resort — the insurance lead manager, then the owners. No repeats, no empty numbers. */
  async function chainNow(){
    const out = [], seen = {};
    const add = (label, name, ph, tier, role) => { ph = phone10(ph); if (!ph || seen[ph] || ph === phone10(env('TWILIO_FROM'))) return; seen[ph] = 1; out.push({ label, name: s(name), phone: ph, tier: tier || 'crew', role: role || '' }); };
    let X = null, c = null, data = {}, users = [];
    try { X = require('./x10.js'); c = X.oncallCfg(await d.kvGet('gc_x10_oncall')); } catch (e) {}
    try { data = d.crm ? await d.crm() : {}; } catch (e) {}
    users = arr(data && data.users); if (!users.length) { try { users = arr(d.users ? await d.users() : []); } catch (e) {} }
    const P = require('./people.js');
    const userOf = p => p ? (users.find(x => x && p.email && low(x.email) === low(p.email)) || (p.name ? P.findUser(users, p.name) : null)) : null;
    const phoneOf = p => { if (!p) return ''; const u = userOf(p); if (u && P.isActive && !P.isActive(u)) return ''; return phone10(p.phone) || (u ? phone10(u.phone || u.cell || u.mobile) : ''); };
    /* the last resort, worked out first so the owners are taken out of the crew */
    const last = [];
    try { let h = require('./lead-roles.js').holder('insurance', data && data.gc_team_settings, users);   /* the insurance lead manager: Admin → lead roles → Senior Insurance PM, else the Senior PM */
      if (!h) { const u = P.seniorPm ? P.seniorPm(users, data && data.gc_senior_pm) : null; if (u) h = { name: s(u.name), email: low(u.email) }; }
      if (h) last.push({ label: 'Insurance lead manager', name: h.name, phone: phoneOf(h), role: 'insurance' }); } catch (e) {}
    const owners = c && c.owners && c.owners.length ? c.owners : ['Wesley Johnson', 'Nick Thomas'].map(n => { const u = P.findUser(users, n); return u ? { email: low(u.email), name: s(u.name) } : null; }).filter(Boolean);
    owners.forEach(o => last.push({ label: 'Owner', name: o.name || o.email, phone: phoneOf(o), role: 'owner' }));
    const lastPh = {}; last.forEach(x => { if (x.phone) lastPh[x.phone] = 1; });
    const crew = (label, name, ph) => { if (!lastPh[phone10(ph)]) add(label, name, ph, 'crew'); };
    /* the crew */
    if (c && c.mitManager) crew('Mitigation manager', c.mitManager.name || c.mitManager.email, phoneOf(c.mitManager));
    let fore = null; try { fore = c && c.on && c.rotation.length ? X.onCallNow(now(), c) : null; } catch (e) {}
    try { const CO = require('./callorder.js');
      const d1 = Object.assign({}, data, { oncallNow: fore ? { name: s(fore.name), email: s(fore.email), phone: phoneOf(fore) } : null });
      const lead = CO.clean({ slots: [{ id: 'x_mit', label: 'Mitigation manager', on: true, kind: 'mitigation' }, { id: 'x_oncall', label: 'On-call foreman', on: true, kind: 'oncall' }] });
      CO.resolve(lead, d1, { ours: [env('TWILIO_FROM')] }).list.forEach(x => crew(x.label, x.name, x.number));
      const raw = await d.kvGet(CO.KEY); const cfg = raw && typeof raw === 'object' ? CO.clean(raw) : CO.defaults();
      if (!CO.isOpen(now(), cfg)) cfg.slots = cfg.night.slots;   /* patch AFTERHOURS: after hours → the after-hours order */
      CO.resolve(cfg, d1, { ours: [env('TWILIO_FROM')] }).list.forEach(x => crew(x.label, x.name, x.number)); } catch (e) {}
    last.forEach(x => add(x.label, x.name, x.phone, 'last', x.role));
    return out;
  }
  /* ONCALL2: the on-call tech — one text, after hours: get ready, the Mitigation Manager sends you */
  async function textTech(rec){
    try { const X = require('./x10.js'), c = X.oncallCfg(await d.kvGet('gc_x10_oncall')); if (!c.on || !X.afterHours(now(), c)) return { skipped: 'business hours' };
      const t = X.onCallTechNow(now(), c); if (!t) return { skipped: 'no on-call tech' };
      let ph = phone10(t.phone); if (!ph) { try { const u = arr(d.users ? await d.users() : []).find(x => low(x.email) === low(t.email)); if (u) ph = phone10(u.phone || u.cell || u.mobile); } catch (e) {} }
      if (!ph || typeof d.sms !== 'function') return { skipped: 'no phone' };
      await d.sms(ph, '🚨 GrayCo on-call TECH: emergency ' + rec.kind + (rec.city ? ' at ' + rec.city : '') + '. Get ready to go — the Mitigation Manager will call you with the address and what to bring. Reply OK.');
      return { ok: true, to: s(t.name || t.email), phone: ph };
    } catch (e) { return { ok: false }; }
  }
  /* ONCALL2 (owner 11/11): "state to the customer we are going through our on-call list and be patient, someone will answer asap" —
     one text when the calls start, one more at the 15-minute mark (never insurance carrier names; quiet hours do not hold an emergency) */
  async function textCustomer(rec, which){
    const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM'), ph = phone10(rec.contact && rec.contact.phone);
    if (!sid || !tok || !from || !ph) return { ok: false };
    const body = which === 'morning'
      ? 'GrayCo Construction Services: thank you — our on-call team reviewed your call. This can safely wait, so our office will call you first thing in the morning. If it gets worse (water coming in, fire, or your home is open to the weather), call us back and press 1. If anyone is in danger, call 911.'
      : which === 'late'
      ? 'GrayCo Construction Services: thank you for your patience. We are still reaching our on-call team and a manager is being called now. Someone will call you as soon as possible. If anyone is in danger, call 911.'
      : 'GrayCo Construction Services: we got your emergency. We are going through our on-call list now — please be patient, someone will call you as soon as possible. If anyone is in danger, call 911.';
    try { const r = await require('./custquiet.js').run('emergency', () => fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: '+1' + ph, From: from, Body: body }).toString() }));
      return { ok: !!(r && r.ok) }; } catch (e) { return { ok: false }; }
  }
  /* ONCALL2: the crew ran past DEADLINE_MIN → the first last-resort step after `step` (or -1) */
  function lastIdx(r, step){
    if (!r || (r.round || 1) >= 2 || now() - Date.parse(r.createdAt) < DEADLINE_MIN * 60000) return -1;   /* round 2 (the whole list once more) walks everyone */
    const ch = arr(r.chain); if (ch[step] && ch[step].tier === 'last') return -1;
    for (let k = Math.max(0, step + 1); k < ch.length; k++) if (ch[k].tier === 'last') return k;
    return -1;
  }
  /* ONCALL2: it reached the last resort → log who was called and did not answer (once per emergency, once more for the owners) */
  async function logMiss(rec, who){
    const tierKey = who.role === 'owner' ? 'owner' : 'insurance';
    let mine = false;
    await cas(l => { const r = l.find(x => x.id === rec.id); if (!r) return false; const f = tierKey === 'owner' ? 'ownersAt' : 'lastResortAt'; if (r[f]) return false; r[f] = nowIso(); mine = true; hist(r, tierKey === 'owner' ? '🚩 reached the OWNERS — logged' : '🚩 nobody answered in ' + DEADLINE_MIN + ' min — last resort'); return true; });
    if (!mine) return { skipped: true };
    if (tierKey === 'insurance' || !rec.lastResortAt) { try { await textCustomer(rec, 'late'); } catch (e) {} }   /* ONCALL2: the 15-minute reassurance */
    const missed = [], seen = {}, ch = arr(rec.chain);   /* everyone on the crew who was called and did not press a key */
    arr(rec.called).forEach(c => { const p = ch[c.step]; if (!p || p.tier !== 'crew' || seen[p.phone]) return; seen[p.phone] = 1; missed.push({ label: p.label, name: p.name, phone: p.phone }); });
    try { await d.kvCas(MISS_KEY, v => { const l = arr(v && v.list ? v.list : v).filter(x => x && Date.parse(x.at) > now() - 400 * 864e5);
      l.push({ at: nowIso(), id: rec.id, title: s(rec.title), kind: s(rec.kind), city: s(rec.city), reached: tierKey, minutes: Math.round((now() - Date.parse(rec.createdAt)) / 60000), missed }); return { list: l.slice(-500) }; }); } catch (e) {}
    if (tierKey === 'owner' && typeof d.mailAdmins === 'function') { try { await d.mailAdmins('🚩 Emergency reached the owners — nobody on call answered: ' + rec.title, Object.assign({}, rec, { missed })); } catch (e) {} }
    return { logged: tierKey, missed };
  }
  /* PERSIST: the emergency text to the person about to be called (once per person) */
  async function textPerson(rec, step){
    const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM_ALERTS') || env('TWILIO_FROM'), who = rec.chain[step];
    if (!sid || !tok || !from || !who || !who.phone) return { ok: false };
    const body = 'GrayCo EMERGENCY: ' + rec.kind + (rec.city ? ' at ' + rec.city : '') + (rec.contact && rec.contact.phone ? ' — customer ' + tidy(rec.contact.phone) : '') + '. Calling you now — answer and press 1 (connect) or 2 (I have it). We call again every 2 min for 10 min, then the next person.';
    const r = await require('./custquiet.js').run('emergency', () => fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+1' + who.phone, From: from, Body: body.slice(0, 320) }).toString() }));
    return { ok: !!(r && r.ok) };
  }
  async function placeCall(rec, step){
    const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM'), who = rec.chain[step];
    if (!sid || !tok || !from || !who) return { ok: false, why: 'not set up' };
    try {
      const r = await require('./custquiet.js').run('emergency', () => fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Calls.json', { method: 'POST',   /* patch AUTOPANEL: tagged emergency — goes in data-entry mode */
        headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: '+1' + who.phone, From: from, Url: hook('ecall', { id: rec.id, step }), Method: 'POST', Timeout: String(RING_S),
          StatusCallback: hook('ecallstatus', { id: rec.id, step }), StatusCallbackMethod: 'POST', StatusCallbackEvent: 'completed' }).toString() }));
      let j = {}; try { j = await r.json(); } catch (e) {}
      return { ok: r.ok, sid: s(j.sid), status: r.status };
    } catch (e) { return { ok: false, why: 'Twilio unreachable' }; }
  }
  /* patch AUTOPANEL: the emergency line keeps working in ⏸ data-entry mode (its calls are tagged 'emergency'); it stops only
     when "Emergency line" is switched off in ⚡ Automations */
  async function paused(){ try { return !(await require('./automations.js').isOn('emergency_line')); } catch (e) { return false; } }
  /* call step `step` of rec (claimed first, so a tick and a status callback never both call) */
  async function callStep(id, step, round){
    let rec = null;
    let first = false;
    await cas(l => { const r = l.find(x => x.id === id); if (!r || /^(connected|accepted|acked|gaveup|notemerg)$/.test(r.state) || (r.state !== 'redial' && r.round === round && r.step >= step)) return false;
      first = r.state !== 'redial'; if (first) r.pStart = nowIso(); r.tries = first ? 1 : (r.tries || 0) + 1;
      r.state = 'calling'; r.round = round; r.step = step; r.lastCallAt = nowIso(); r.called = arr(r.called).concat([{ at: nowIso(), round, step, to: r.chain[step] && r.chain[step].label }]); hist(r, 'calling ' + (r.chain[step] ? r.chain[step].label + ' ' + r.chain[step].name : '?')); rec = JSON.parse(JSON.stringify(r)); return true; });
    if (!rec) return { skipped: true };
    if (first) { try { await textPerson(rec, step); } catch (e) {} }   /* PERSIST: a text with the call, once per person */
    if (first && rec.chain[step] && rec.chain[step].tier === 'last') { try { await logMiss(rec, rec.chain[step]); } catch (e) {} }   /* ONCALL2 */
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
    { const k = lastIdx(r, step); if (k >= 0) return callStep(id, k, r.round); }   /* ONCALL2: 15 min and nobody on the crew answered → the last resort */
    if (r.pStart && now() - Date.parse(r.pStart) < PER_PERSON_MIN * 60000) {   /* PERSIST: same person again in 2 minutes */
      await cas(l => { const x = l.find(y => y.id === id); if (!x || x.state !== 'calling') return false; x.state = 'redial'; x.redialAt = new Date(Date.parse(x.lastCallAt || nowIso()) + REDIAL_MIN * 60000).toISOString(); hist(x, 'no answer — calling ' + (x.chain[step] ? x.chain[step].label : '') + ' again at ' + x.redialAt.slice(11, 16) + ' UTC'); return true; });
      return { redial: true };
    }
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
    const all = await list(), open = all.filter(r => /^(waiting|calling|retry|redial)$/.test(r.state));
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
        try { const tc = await textCustomer(r, 'start'); if (tc.ok) await cas(l => { const x = l.find(y => y.id === r.id); if (!x) return false; x.custTextedAt = nowIso(); hist(x, 'texted the customer: going through the on-call list'); return true; }); } catch (e) {}   /* ONCALL2 */
        const c = await callStep(r.id, 0, 1); if (c.called) out.calls++;
      } else if (r.state === 'redial' && lastIdx(r, r.step) >= 0) {   /* ONCALL2: past 15 min → the last resort now, not another redial of the crew */
        const k = lastIdx(r, r.step); await cas(l => { const x = l.find(y => y.id === r.id); if (!x || x.state !== 'redial') return false; x.state = 'calling'; return true; });
        const c = await callStep(r.id, k, r.round); if (c.called) out.calls++;
      } else if (r.state === 'redial' && now() >= Date.parse(r.redialAt)) {   /* PERSIST */
        const c = await callStep(r.id, r.step, r.round); if (c.called) out.calls++;
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
      + (r.contact && r.contact.phone ? 'Press 1 to be connected to the customer now. ' : '') + 'Press 2 to say you have it and are on the way — we text you the details. Press 3 if it is not a real emergency and can wait until morning.';
  }
  async function twimlCall(id, step){
    const r = await get(id);
    if (!r || /^(connected|accepted|acked|gaveup|notemerg)$/.test(r.state)) return say('This GrayCo emergency has been taken care of. Thank you.') + '<Hangup/>';
    const m = message(r), act = hook('ecallkey', { id, step }).replace(/&/g, '&amp;');
    return '<Gather numDigits="1" timeout="8" action="' + act + '" method="POST">' + say(m) + '<Pause length="1"/>' + say(m) + '</Gather><Hangup/>';
  }
  async function key(id, step, digits, by){
    const r0 = await get(id); if (!r0) return '<Hangup/>';
    const k = s(digits);
    if (k === '3') {   /* ONCALL2 (owner 11/11: "these have to be like 911 SOS emergencies"): not a real emergency → stop, morning call-back, no miss logged */
      let mine3 = false;
      await cas(l => { const r = l.find(x => x.id === id); if (!r || /^(connected|accepted|notemerg)$/.test(r.state)) return false; mine3 = true; r.state = 'notemerg'; r.ackAt = nowIso(); r.ackWhy = 'not a real emergency';
        r.notEmergencyBy = (r.chain && r.chain[step] ? r.chain[step].label + ' ' + r.chain[step].name : tidy(by)).trim(); hist(r, 'pressed 3 — not a real emergency (' + r.notEmergencyBy + '): morning call-back'); return true; });
      if (!mine3) return say('Someone else already has this emergency. Thank you.') + '<Hangup/>';
      try { await d.kvCas(MISS_KEY, v => { const l = arr(v && v.list ? v.list : v); const n = l.filter(x => x && x.id !== id); return n.length === l.length ? undefined : { list: n }; }); } catch (e) {}
      try { await textCustomer(r0, 'morning'); } catch (e) {}
      try { if (typeof d.onNotEmergency === 'function') await d.onNotEmergency(r0, r0.chain && r0.chain[step]); } catch (e) {}
      return say('Thank you. The calls are stopped and the customer gets a text that we will call them in the morning. Goodbye.') + '<Hangup/>';
    }
    if (k !== '1' && k !== '2') return '<Hangup/>';
    let first = false;
    await cas(l => { const r = l.find(x => x.id === id); if (!r || /^(connected|accepted)$/.test(r.state)) return false; first = true; r.state = k === '1' && r.contact.phone ? 'connected' : 'accepted';
      r.acceptedAt = nowIso(); r.acceptedBy = (r.chain && r.chain[step] ? r.chain[step].label + ' ' + r.chain[step].name : tidy(by)).trim(); hist(r, (r.state === 'connected' ? 'pressed 1 — connected to the customer: ' : 'pressed 2 — accepted: ') + r.acceptedBy); return true; });
    if (!first) return say('Someone else already has this emergency. Thank you.') + '<Hangup/>';
    try { if (typeof d.onAccepted === 'function') await d.onAccepted(r0, r0.chain && r0.chain[step]); } catch (e) {}
    if (k === '1' && r0.contact.phone) { try { await textTech(r0); } catch (e) {} }   /* ONCALL2: connected → the on-call tech gets ready too */
    if (k === '1' && r0.contact.phone) return say('Connecting you to the customer now.') + '<Dial callerId="' + env('TWILIO_FROM') + '" timeout="30"><Number>+1' + r0.contact.phone + '</Number></Dial>';
    const who = r0.chain && r0.chain[step];
    if (who && who.phone && typeof d.sms === 'function') {
      let tech = ''; try { const tt = await textTech(r0); if (tt && tt.ok) tech = ' On-call tech ' + tt.to + (tt.phone ? ' ' + tidy(tt.phone) : '') + ' was texted to get ready — call them with the address.'; } catch (e) {}   /* ONCALL2: the tech only on a real one */
      try { await d.sms(who.phone, '🚨 GrayCo emergency (you accepted): ' + r0.kind + (r0.city ? ' at ' + r0.city : '') + ' — ' + [r0.contact.name, r0.contact.phone ? tidy(r0.contact.phone) : ''].filter(Boolean).join(' ') + '. ' + r0.title + ' · ' + site() + '/#leads' + tech); } catch (e) {}
    }
    return say('Thank you. The details are on their way by text. Goodbye.') + '<Hangup/>';
  }
  return { register, ack, tick, advance, callStep, chainNow, textTech, textCustomer, lastIdx, logMiss, twimlCall, key, list, get, message, KEY };
}
module.exports = { make, KEY, MISS_KEY, DEADLINE_MIN, kindOf, cityOf, ackReason, settingsOf, RING_S, RETRY_MIN, REDIAL_MIN, PER_PERSON_MIN };
