/* ============================================================================
   GrayCo — TEXTS BUILD THE LEAD (patch TEXTLEAD).   netlify/functions/_lib/textlead.js

   Owner 10/28: "all text threads chats and notes about jobs from leads like this need to go in jobs notes and when a
   lead comes in needs to be auto entered by phone number as lead at the very least, if they say a name add the name
   too and address if they say that and any info they also state in the texts".

   · Every text from an unknown number is a lead at once (missed-call.js), titled by the name when known, else the phone.
   · Each text in (the first and every follow-up) is read for: a name ("this is John", "my name is…", a signature line),
     a street address / city / state / ZIP, an e-mail, the kind of work (water / fire / roof / storm / mold / remodel …),
     urgency, an insurance-claim mention. With ANTHROPIC_API_KEY a small model reads it (strict JSON tool schema; the
     regex rules fill whatever it missed); without a key the regex rules alone.
     ONLY EMPTY lead fields are filled (an auto placeholder such as "Texter (901) 555-0100" counts as empty) — never
     what staff typed. Each fill is written to the lead's notes: "📱 From text 10/28 4:21 PM: name John Smith, …".
     An insurance carrier is kept only in an internal field (leadExtra.carrierInternal) — never in a note or a text.
   · The conversation: every text in / out on the lead (customer texts, staff replies from the CRM or from a cell,
     automatic answers, the missed-call text-back, the caller's words from call screening) is kept on the lead
     (leadExtra.textLog, newest 200) and as a line in the lead's notes ("💬 10/28 4:21 PM — Customer: …").
   · When the lead becomes a job (the job has the lead's id, or the customer's phone), the whole conversation and the
     lead's notes are copied once into that job's 💬 Communication timeline + one "📋 From the lead" post on Job
     Messages (syncConverted(), every 15 minutes from approval-escalate.js, and at once when the number texts again).
   Store: the Lead Inbox (gc_lead_inbox_kv "gc_lead_inbox", service key only).
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(x => x != null) : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function clip(v, n){ v = s(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
const LOG_MAX = 200;

/* ── deps (tests swap these) ── */
function L(){ return require('../bid-inbox.js')._lib; }
function core(){ return require('../portal.js')._core; }
const _D = {
  now: () => Date.now(),
  kvCasLeads: f => L().kvCas(L().KV, f),
  kvGetLeads: async () => arr(await L().kvGet(L().KV)),
  projects: async () => { try { return arr((await core().kvRead(['projects'])).projects); } catch (e) { return []; } },
  ai: () => { try { return require('./ai.js'); } catch (e) { return null; } },
  commsAdd: async (pid, o) => { try { await require('./comms.js').addMessage(pid, o); return true; } catch (e) { return false; } },
  jobMsg: async msg => { const has = l => l.some(m => m && s(m.id) === msg.id); try { return await core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has }); } catch (e) { return { ok: false }; } }
};
function central(ms){
  try { return new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', ''); }
  catch (e) { return new Date(ms).toISOString().slice(5, 16).replace('T', ' ') + ' UTC'; }
}

/* ── reading a text ── */
const STATES = { tn: 'TN', tennessee: 'TN', ms: 'MS', mississippi: 'MS', ar: 'AR', arkansas: 'AR', al: 'AL', alabama: 'AL', ky: 'KY', kentucky: 'KY', mo: 'MO', missouri: 'MO', ga: 'GA', georgia: 'GA' };
const CITIES = ['Memphis', 'Bartlett', 'Germantown', 'Collierville', 'Cordova', 'Arlington', 'Lakeland', 'Millington', 'Southaven', 'Olive Branch', 'Horn Lake', 'Hernando', 'Atoka', 'Munford',
  'Covington', 'Oakland', 'West Memphis', 'Marion', 'Eads', 'Brighton', 'Somerville', 'Byhalia', 'Walls', 'Rossville', 'Piperton', 'Southaven'];
const SUFFIX = 'St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Cv|Cove|Ct|Court|Cir|Circle|Pkwy|Parkway|Pl|Place|Way|Ter|Terrace|Trl|Trail|Hwy|Highway|Pike|Loop|Run|Sq|Square|Xing|Crossing|Bnd|Bend|Holw|Hollow|Pt|Point';
const NOT_NAME = /^(having|calling|texting|looking|interested|needing|not|so|just|here|home|out|at|in|on|the|a|an|your|with|from|sure|ok|okay|good|fine|sorry|trying|getting|wondering|ready|available|still|also|back|done|going|flooded|leaking|told|from|homeowner|owner|tenant|renter)$/i;
const STOPW = /^(and|my|the|at|from|with|i|we|is|in|on|of|to|need|needs|have|has|our|a|an|calling|about|here|roof|house|home|water|for|please|can|could|would|im|i'm)$/i;
const CARRIERS = /\b(state farm|allstate|usaa|farmers|liberty mutual|nationwide|progressive|travelers|erie|shelter|auto[- ]owners|american family|geico|chubb|tennessee farmers|farm bureau|metlife|safeco|hartford|homesite|assurant|universal property|american strategic|asi)\b/i;
function capName(n){ return s(n).split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' '); }
function extract(text){
  const t = s(text).replace(/\r/g, ''), one = t.replace(/\s+/g, ' ');
  const o = {};
  /* name */
  let m = /\b(?:this is|my name is|my name's|name is|i am|i'm|im|it's|its)\s+([A-Za-z][a-z'’-]+(?:\s+[A-Za-z][a-z'’-]+){0,2})/i.exec(one);
  if (m) { const w = m[1].split(/\s+/), explicit = /my name|name is|this is/i.test(m[0]), keep = [];
    for (let i = 0; i < w.length; i++) { if (STOPW.test(w[i]) || (i && !explicit && !/^[A-Z]/.test(w[i]))) break; keep.push(w[i]); }
    if (keep.length && !NOT_NAME.test(keep[0]) && (/^[A-Z]/.test(keep[0]) || explicit)) o.name = capName(keep.join(' ')); }
  if (!o.name) { const lines = t.split('\n').map(s).filter(Boolean); const last = lines[lines.length - 1] || '';
    const sg = /^(?:[-–—~]\s*|thanks,?\s+|thank you,?\s+|regards,?\s+)([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2})\.?$/.exec(last); if (sg && lines.length > 1 && !NOT_NAME.test(sg[1])) o.name = sg[1]; }
  /* street address */
  m = new RegExp('\\b(\\d{2,6}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9\'’.]+\\s+){0,4}?(?:' + SUFFIX + ')\\b\\.?)', 'i').exec(one);
  if (m) o.address = m[1].replace(/\s+/g, ' ').replace(/\.$/, '');
  /* city / state / ZIP */
  const after = m ? one.slice(m.index + m[0].length) : one;
  const cs = /^[\s,]*([A-Za-z][A-Za-z. ]{1,28}?)[\s,]+(TN|MS|AR|AL|KY|MO|GA|Tennessee|Mississippi|Arkansas|Alabama|Kentucky|Missouri|Georgia)\b\.?[\s,]*(\d{5})?/i.exec(after);
  if (cs) { o.city = capName(low(cs[1])); o.state = STATES[low(cs[2])] || cs[2].toUpperCase(); if (cs[3]) o.zip = cs[3]; }
  if (!o.city) { const c = CITIES.find(x => new RegExp('\\b' + x + '\\b', 'i').test(one)); if (c) o.city = c; }
  if (!o.zip) { const z = /\b(3[0-9]{4}|38[0-9]{3}|72[0-9]{3})\b/.exec(one.replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '')); if (z && (o.address || o.city)) o.zip = z[1]; }
  if (!o.state && o.zip) o.state = /^3[78]/.test(o.zip) ? 'TN' : /^38[6-9]/.test(o.zip) ? 'MS' : /^72/.test(o.zip) ? 'AR' : '';
  if (!o.state) delete o.state;
  /* e-mail */
  m = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(one); if (m) o.email = low(m[0]);
  /* the work */
  const W = [['water', /\b(water|leak(s|ing|ed)?|flood(ed|ing)?|pipe|burst|water heater|sewage|plumbing|drip(ping)?)\b/i], ['fire', /\b(fire|smoke|burn(ed|t)?)\b/i],
    ['mold', /\bmold\b/i], ['roof', /\b(roof|shingles?|hail)\b/i], ['storm', /\b(storm|tree (fell|down|on)|wind)\b/i],
    ['remodel', /\b(remodel(ing)?|renovat\w*|kitchen|bathroom|bath|addition|cabinets?|flooring|drywall|paint(ing)?)\b/i]];
  const kinds = W.filter(x => x[1].test(one)).map(x => x[0]); if (kinds.length) o.work = kinds.slice(0, 3).join(', ');
  if (/\b(emergency|asap|urgent|right now|immediately|today|tonight|everywhere|coming in)\b/i.test(one)) o.urgency = 'ASAP';
  if (/\b(insurance|claim|adjuster|adjustor|deductible)\b/i.test(one)) o.insurance = true;
  m = CARRIERS.exec(one); if (m) { o.insurance = true; o.carrier = capName(low(m[1])); }
  return o;
}
/* the small model reads it (only reads: strict schema); null when not set up or unsure */
async function aiExtract(text){
  const ai = _D.ai(); if (!ai || !ai.ready || !ai.ready()) return null;
  const tool = { name: 'lead_facts', description: 'Facts the customer stated in this text message. Leave a field empty when it is not clearly stated.',
    input_schema: { type: 'object', additionalProperties: false, properties: {
      name: { type: 'string' }, address: { type: 'string', description: 'street number and street only' }, city: { type: 'string' }, state: { type: 'string', description: '2-letter' }, zip: { type: 'string' },
      email: { type: 'string' }, work: { type: 'string', description: 'kind of work, a few words: water damage, roof, fire, mold, remodel …' }, urgency: { type: 'string', enum: ['', 'ASAP', 'soon', 'routine'] },
      insurance: { type: 'boolean' }, carrier: { type: 'string' } }, required: ['name', 'address', 'city', 'state', 'zip', 'email', 'work', 'urgency', 'insurance', 'carrier'] } };
  try {
    const r = await ai.ask({ model: process.env.SMS_AI_MODEL || 'claude-haiku-5-5', maxTokens: 300, effort: false, timeoutMs: 8000, tool,
      content: [{ type: 'text', text: 'A customer texted a construction / restoration company. Call lead_facts with only what they stated.\n\nText:\n"""' + clip(text, 1500) + '"""' }] });
    const o = r && r.ok ? obj(r.out) : null; if (!o) return null;
    const out = {};
    ['name', 'address', 'city', 'state', 'zip', 'email', 'work', 'urgency', 'carrier'].forEach(k => { if (s(o[k])) out[k] = clip(o[k], 120); });
    if (o.insurance === true) out.insurance = true;
    if (out.state) out.state = (STATES[low(out.state)] || out.state.toUpperCase()).slice(0, 2);
    if (out.zip && !/^\d{5}$/.test(out.zip)) delete out.zip;
    if (out.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(out.email)) delete out.email;
    return out;
  } catch (e) { return null; }
}
async function read(text){ const rx = extract(text), a = await aiExtract(text); return a ? Object.assign({}, rx, a) : rx; }

/* ── the lead ── */
function placeholderName(n, ph){ n = s(n); return !n || /^(texter|caller|unknown)\b/i.test(n) || phone10(n) === ph || /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(n); }
/* fill only what is empty; returns the list of "field value" phrases filled */
function fill(it, ex, ph){
  it.contact = obj(it.contact); it.leadExtra = obj(it.leadExtra);
  const le = it.leadExtra, done = [];
  if (ex.name && placeholderName(it.contact.name, ph)) {
    it.contact.name = ex.name; le.contactName = ex.name; done.push('name ' + ex.name);
    if (/^text message — /i.test(s(it.title)) && placeholderName(s(it.title).replace(/^text message — /i, ''), ph)) it.title = 'Text message — ' + ex.name;
    if (/^missed call — /i.test(s(it.title)) && /missed call — (\(\d{3}\)|caller)/i.test(s(it.title))) it.title = 'Missed call — ' + ex.name;
  }
  if (ex.address && !s(it.address)) { it.address = ex.address; done.push('address ' + ex.address); }
  if (ex.city && !s(it.city)) { it.city = ex.city; done.push('city ' + ex.city); }
  if (ex.state && !s(it.state)) { it.state = ex.state; }
  if (ex.zip && !s(it.zip)) { it.zip = ex.zip; done.push('ZIP ' + ex.zip); }
  if (ex.email && !s(it.contact.email)) { it.contact.email = ex.email; done.push('e-mail ' + ex.email); }
  if (ex.work && !s(le.workType)) { le.workType = ex.work; done.push('work ' + ex.work); }
  if (ex.urgency && !s(le.urgency)) { le.urgency = ex.urgency; done.push('urgency ' + ex.urgency); }
  if (ex.insurance && !le.insuranceClaim) { le.insuranceClaim = true; done.push('insurance claim mentioned'); }
  if (ex.carrier && !s(le.carrierInternal)) le.carrierInternal = ex.carrier;   /* internal only — never in a note */
  if (!phone10(it.contact.phone) && ph) it.contact.phone = tidy(ph);
  return done;
}
function logLine(e){ return '💬 ' + central(Date.parse(e.at)) + ' — ' + (e.dir === 'out' ? 'GrayCo' + (e.who ? ' (' + e.who + ')' : '') : e.dir === 'call' ? 'Caller said' : 'Customer') + ': ' + clip(e.text, 1000); }
function addLog(it, e){
  it.leadExtra = obj(it.leadExtra);
  const log = arr(it.leadExtra.textLog);
  if (e.id && log.some(x => x.id === e.id)) return false;
  log.push({ id: s(e.id), at: e.at, dir: e.dir, who: clip(e.who, 60), text: clip(e.text, 2000) });
  it.leadExtra.textLog = log.slice(-LOG_MAX);
  it.notes = arr(it.notes).concat([logLine(e)]).slice(-120);
  it.updatedAt = e.at; it.lastTextAt = e.at;
  return true;
}
const CLOSED = /^(won|lost|dead|deleted|converted|declined|archived|closed|dismissed|merged)$/i;
function findLead(items, o){
  if (o.leadId) { const hit = items.find(x => x && x.id === o.leadId); if (hit) return hit; }
  const ph = phone10(o.ph); if (ph.length !== 10) return null;
  return items.filter(x => x && !x.deleted && !CLOSED.test(s(x.status)) && (phone10(obj(x.leadExtra).smsFrom) === ph || phone10(obj(x.contact).phone) === ph))
    .sort((a, b) => s(b.updatedAt || b.createdAt).localeCompare(s(a.updatedAt || a.createdAt)))[0] || null;
}

/* a text in on a lead (new or follow-up): log it + fill the empty fields */
async function onInbound(o){
  o = o || {};
  const at = o.at || new Date(_D.now()).toISOString(), ph = phone10(o.ph);
  const ex = await read(o.body);
  let res = { ok: false };
  await _D.kvCasLeads(v => {
    const items = arr(v); const it = findLead(items, o); if (!it) { res = { ok: false, why: 'no lead' }; return undefined; }
    const logged = addLog(it, { id: o.id || '', at, dir: 'in', who: '', text: o.body });
    const done = fill(it, ex, ph);
    if (done.length) it.notes = arr(it.notes).concat(['📱 From text ' + central(Date.parse(at)) + ': ' + done.join(', ')]).slice(-120);
    res = { ok: true, id: it.id, filled: done, logged, item: JSON.parse(JSON.stringify(it)) };
    return logged || done.length ? items : undefined;
  });
  return res;
}
/* a text out to a number that has a lead (staff reply, cell reply, automatic answer, missed-call text-back) */
async function onOutbound(o){
  o = o || {};
  const at = o.at || new Date(_D.now()).toISOString();
  let res = { ok: false };
  await _D.kvCasLeads(v => { const items = arr(v); const it = findLead(items, o); if (!it) return undefined;
    const logged = addLog(it, { id: o.id || '', at, dir: 'out', who: o.who || '', text: o.text }); res = { ok: true, id: it.id, logged }; return logged ? items : undefined; });
  return res;
}
/* a missed-call lead: the caller's words (call screening) + the automatic text */
async function onMissed(o){
  o = o || {};
  const at = o.at || new Date(_D.now()).toISOString();
  const ex = s(o.said) ? await read(o.said) : {};
  let res = { ok: false };
  await _D.kvCasLeads(v => { const items = arr(v); const it = findLead(items, o); if (!it) return undefined;
    let ch = false;
    if (s(o.said)) { ch = addLog(it, { id: 'call_' + s(o.callSid), at, dir: 'call', text: o.said }) || ch; const done = fill(it, ex, phone10(o.ph)); if (done.length) { it.notes = arr(it.notes).concat(['📞 From the call ' + central(Date.parse(at)) + ': ' + done.join(', ')]); ch = true; } }
    if (s(o.autoText)) ch = addLog(it, { id: 'mc_' + s(o.callSid), at, dir: 'out', who: 'automatic text', text: o.autoText }) || ch;
    res = { ok: true, id: it.id }; return ch ? items : undefined; });
  return res;
}

/* ── the lead became a job: copy the conversation + notes once ── */
function jobFor(projects, it){
  const ids = [s(it.id), s(it.key), 'LEADIN-' + s(it.id).replace(/^LI-/, '')].filter(Boolean);
  const ph = phone10(obj(it.leadExtra).smsFrom || obj(it.contact).phone);
  const live = arr(projects).filter(p => p && p.id && p.deleted !== true);
  return live.find(p => [p.leadId, p.fromLeadId, p.inboxId, p.leadInboxId, p.convertedFrom].map(s).some(x => x && ids.indexOf(x) >= 0))
    || (ph.length === 10 ? live.filter(p => [p.clientPhone, p.phone, p.customerPhone, p.contactPhone, p.cell].map(phone10).indexOf(ph) >= 0)
      .filter(p => s(p.created || p.createdAt || p.startDate || '9') >= s(it.createdAt || it.receivedAt || obj(it.leadExtra).receivedAt || '').slice(0, 10))
      .sort((a, b) => s(b.created || b.createdAt).localeCompare(s(a.created || a.createdAt)))[0] : null) || null;
}
async function copyToJob(it, p){
  const pid = s(p.id), le = obj(it.leadExtra), log = arr(le.textLog);
  let n = 0;
  for (const e of log) {
    const ok = await _D.commsAdd(pid, { id: 'tl_' + s(it.id) + '_' + (s(e.id) || s(e.at)), kind: 'text', dir: e.dir === 'out' ? 'out' : 'in', at: e.at,
      from: e.dir === 'out' ? 'GrayCo' + (e.who ? ' (' + e.who + ')' : '') : tidy(le.smsFrom || obj(it.contact).phone), fromName: e.dir === 'out' ? s(e.who) : s(obj(it.contact).name), text: e.text, fromLead: s(it.id) });
    if (ok) n++;
  }
  const notes = arr(it.notes).map(x => typeof x === 'string' ? x : s(x && (x.text || x.note))).filter(Boolean).filter(x => !/^💬 /.test(x));   /* the 💬 lines are the conversation above */
  if (notes.length) await _D.commsAdd(pid, { id: 'tl_notes_' + s(it.id), kind: 'note', dir: '', at: new Date(_D.now()).toISOString(), from: 'Lead notes', fromName: 'Lead', text: clip(notes.join('\n'), 7900), fromLead: s(it.id) });
  const body = '📋 From the lead "' + clip(it.title, 80) + '" — the texts and notes before this became a job:\n\n' + log.map(logLine).join('\n') + (notes.length ? '\n\n📝 Lead notes:\n' + notes.join('\n') : '');
  await _D.jobMsg({ id: 'TLJOB_' + s(it.id) + '_' + pid, pid, authorId: 'sms:lead', authorName: '📋 Lead history', text: clip(body, 8000), tags: [], at: new Date(_D.now()).toISOString(), source: 'lead', fromLead: s(it.id) });
  return n;
}
/* every 15 minutes (approval-escalate.js) and when the number texts again: leads with a conversation that became jobs */
async function syncConverted(opts){
  opts = opts || {};
  const items = await _D.kvGetLeads();
  const want = items.filter(x => x && arr(obj(x.leadExtra).textLog).length && !obj(x.leadExtra).copiedTo && (!opts.ph || phone10(obj(x.leadExtra).smsFrom || obj(x.contact).phone) === phone10(opts.ph)));
  if (!want.length) return { copied: 0 };
  const projects = await _D.projects();
  const out = { copied: 0, jobs: [] };
  for (const it of want) {
    const p = jobFor(projects, it); if (!p) continue;
    let claim = false;
    await _D.kvCasLeads(v => { const l = arr(v), x = l.find(y => y && y.id === it.id); if (!x || obj(x.leadExtra).copiedTo) return undefined; x.leadExtra = obj(x.leadExtra); x.leadExtra.copiedTo = s(p.id); x.leadExtra.copiedAt = new Date(_D.now()).toISOString(); claim = true; return l; });
    if (!claim) continue;
    const fresh = (await _D.kvGetLeads()).find(y => y && y.id === it.id) || it;
    await copyToJob(fresh, p); out.copied++; out.jobs.push(s(p.id));
  }
  return out;
}

module.exports = { extract, aiExtract, read, fill, addLog, findLead, onInbound, onOutbound, onMissed, jobFor, copyToJob, syncConverted, placeholderName, logLine, central, _D };
