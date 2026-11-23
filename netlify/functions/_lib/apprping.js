/* netlify/functions/_lib/apprping.js — patch AWAY: "I want approval notifications on my phone" (owner 11/16).
   Every 5 minutes (appr-ping-scheduled.js): each NEW approval waiting on a person reaches their phone soon after it
   arrives, and a tap opens that exact approval (crm.grayco-cs.com/#apx=<key> — index.html patch AWAY; a customer e-mail /
   text opens its own card through the older #appr=<id>).
     Who gets what: the approvals list's own rule (_lib/auto-digest.js collect: the job's PM for a PM step, the admins for
     an admin step, the office for her kinds, job costs to the PM …) + a Form 941 waiting on review (admins) + the
     approvals only the CRM page knows (To-Do approvals: contract overrides, checks to sign, change orders, cost reviews,
     bid e-mails, QuickBooks confirms, lead assignments …), which an admin's open CRM reports (gc_kv "gc_appr_feed",
     op feed in appr-away.js — admins only; these go to the admins).
     Away (_lib/away.js): an away admin gets nothing; what waited on them alone goes to their cover (marked).
     Quiet bundling: what arrives together is ONE notification ("3 new approvals: …"); at most one per person every
     10 minutes (the rest wait for the next run, bundled). QUIET (owner 11/16: "From 9 [PM] – 6 [AM] only call-outs and
     emergency notifications go through; all else wait until 7 AM"): inside the staff quiet window (_lib/staffquiet.js — default
     9 PM → 7 AM Central, an admin setting) approvals wait; at 7:00 each person gets ONE notification with their new approvals
     AND whatever else was held overnight for them (escalations, lead / bid alerts, staff e-mails). The first run ever only takes note of what is already waiting (no flood of old items).
     Channel: the phone push when that person turned it on (GrayCo Field → 🔔 card / ⚙ Settings); otherwise one staff text (the 📱 text
     alerts number, staff tag — passes data-entry mode; business hours only); otherwise one staff e-mail (@grayco-cs.com —
     passes data-entry mode).
   Cheap: a run first reads only the "last changed" times of the approval keys; nothing changed and nothing waiting to go
   → done (a full read at least every 30 minutes).
   State: gc_kv "gc_appr_ping" = { sig, at, seen: { email: { key: { at, n } } }, last: { email: iso }, covered: { email: { key: name } },
     came: { key: { at, title, kind, to: [emails], goneAt? } } (14 days — the 📊 Approvals this week view), daily: { email: ymd } }
   Off switch: Netlify APPR_PING_OFF=1.
   APPRONCE (owner 11/19: "I don't need 3 reminders for this stuff" — the same items came as "new" at 10:25, 10:35 and 1:25):
     · an approval is texted ONCE, when it first appears (bundled with what came within the same few minutes), never again as
       "new". The cause: the "seen" list kept only what was in the list on that run, and the CRM-only approvals (an admin's open
       CRM page reports them; that report counts for 30 minutes) drop out whenever the page is closed / hidden or one report
       leaves an item out — when it came back it was "new" again. Now what was sent is remembered by item for 30 days after it
       is gone, under a STEADY key (ck: a Form 941 is one item whether the server list or the page reports it; a page alert
       that carries a count — "2 new job messages", "(8)" — is one item whatever the count; the page's "Payroll waiting on your
       approval" alert is the payroll run itself when that run is in the list).
     · what is still waiting: ONE reminder a day, the first run from 8 AM Central (8:00–8:59) — "Still waiting on you: N
       approvals" + the link, when something texted on an earlier day still waits — Monday–Friday (a weekend only for an urgent one); new items due at that moment ride along in it.
       The 7 AM digest (_lib/auto-digest.js) no longer texts while these pings are on (this 8 AM text is the one).
     · never two digests to a person within 10 minutes; a run holds a lease (gc_kv "gc_appr_ping_lock", 4 minutes) so two
       overlapping runs can never both send. */
'use strict';
const A = require('./auto-common.js');
const { s, low, arr, esc, clip, staffEmail } = A;
const STATE = 'gc_appr_ping', FEED = 'gc_appr_feed', AUDIT = 'gc_appr_audit', LOCK = 'gc_appr_ping_lock';
const GAP_MS = 10 * 60e3, FULL_MS = 30 * 60e3, FEED_MS = 30 * 60e3, CAME_MS = 14 * 864e5;
const KEEP_MS = 30 * 864e5, FEED_REMIND_MS = 24 * 3600e3, LEASE_MS = 4 * 60e3, REMIND_H = 8;   /* APPRONCE */
const SIG_KEYS = ['gc_approval_queue', 'gc_sub_approvals', 'gc_expense_approvals', 'payrollRuns', 'gc_payroll_approvals', FEED, 'gc_away'];
const FEED_PREFIX = /^(f941:|td:|pay:|inv:|bp:|to:|mat:)/;   /* the CRM-only kinds an admin's page reports (ap2 / sub / exp come from the server lists) */
const D = { now: function(){ return Date.now(); }, collect: function(now){ return require('./auto-digest.js').collect(now); },
  push: function(to, p){ return require('./staffpush.js').send(to, p, { noAway: true, noQuiet: true }); },
  text: function(email, text, link, em){ return require('./smsalert.js').notify({ type: 'approvals', text: text, link: link, thread: 'apprnew', mine: [email], only: [email], emergency: !!em }); },   /* QUIETSUN: em = an urgent one is in it (goes on a quiet weekend day) */
  mail: function(to, subject, html, o){ return A.staffMail(to, subject, html, o); } };   /* tests swap these */
function AW(){ return require('./away.js'); }
function C(){ return A.core(); }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

async function kvGet(key){
  const r = await fetch(C().sbUrl() + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: C().H() });
  if (!r || !r.ok) throw new Error('gc_kv read ' + (r && r.status));
  const rows = await r.json(); return rows && rows[0] ? rows[0].value : null;
}
async function kvSet(key, value){
  const r = await fetch(C().sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: C().H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: value, updated_at: new Date(D.now()).toISOString() }) });
  if (!r || !r.ok) throw new Error('gc_kv write ' + (r && r.status));
}
async function sig(){
  const r = await fetch(C().sbUrl() + '/rest/v1/gc_kv?select=key,updated_at&key=in.(' + SIG_KEYS.map(function(k){ return '"' + k + '"'; }).join(',') + ')', { headers: C().H() });
  if (!r || !r.ok) return '';
  const rows = await r.json(); if (!Array.isArray(rows)) return '';
  return rows.map(function(x){ return s(x && x.key) + '=' + s(x && x.updated_at); }).sort().join('|');
}
function central(now){ return A.central(now); }
function SQ(){ return require('./staffquiet.js'); }
function quiet(now, set){ return SQ().quiet(now, set || SQ().DEF); }
/* an approval is never a call-out; only one marked emergency goes inside the quiet window */
function urgent(it){ const r = (it && it.raw) || {}; return r.emergency === true || !!(r.meta && r.meta.emergency === true); }
/* APPRONCE: the steady key an item is remembered by (the link still uses its own key) */
function ck(k){
  k = s(k);
  if (/^td:f941:/.test(k)) return k.slice(3);   /* the page's Form 941 = the server's */
  if (/^(td:otd:alert_|x:)/.test(k)) return low(k).replace(/\(\s*\d+\s*\)/g, '').replace(/\d+/g, '#').replace(/\b(\w{3,}?)s\b/g, '$1').replace(/\s+/g, ' ').trim();   /* a count is not a new item */
  return k;
}
/* APPRONCE: one person's list for notifications — one per steady key; the page's "Payroll waiting …" alert is the payroll run when that is in the list */
/* patch SUBPITCH (owner 11/19): a new lead's first-contact approval is never its own text — the NEW LEAD text already went out;
   it stays in the CRM's approvals list (only the ping skips it) */
function quietKind(it){ const r = (it && it.raw) || {}; return s(r.kind) === 'lead_first_contact'; }
function noteList(items){
  const out = [], have = {}, pay = items.some(function(x){ return /^pay:/.test(s(x.key)); });
  items.forEach(function(it){ const c = ck(it.key); if (have[c] || quietKind(it)) return; if (pay && /^td:otd:alert_.*payroll/.test(c)) return; have[c] = 1; it.ck = c; out.push(it); });
  return out;
}
function keyOf(it){ if (it.key) return s(it.key); const r = it.raw || {}; return r.id ? 'ap2:' + s(r.id) : 'x:' + s(it.title); }
function linkOf(it, base){ return s(it.link) || base + '/#apx=' + encodeURIComponent(keyOf(it)); }

/* everything waiting, per person (already routed for away), with a key on each item */
async function gather(now, o){
  o = o || {};
  const got = await D.collect(now);
  const base = got.base || A.crmBase(), data = got.data || {};
  const box = {}; Object.keys(got.box || {}).forEach(function(e){ box[low(e)] = (got.box[e] || []).map(function(it){ it.key = keyOf(it); return it; }); });
  let admins = []; try { admins = C().adminEmails(data).filter(staffEmail); } catch (e) {}
  const extra = {}, stale = {}; admins.forEach(function(e){ extra[e] = []; stale[e] = []; });
  const addAdmins = function(it, to){ to = to || extra; admins.forEach(function(e){ if (!to[e].some(function(x){ return x.key === it.key; })) to[e].push(it); }); };
  /* Form 941 waiting on review (admins) */
  let pa = []; try { pa = arr((await C().kvRead(['gc_payroll_approvals'])).gc_payroll_approvals); } catch (e) {}
  pa.forEach(function(x){ if (x && x.kind === 'f941' && x.status === 'waiting') addAdmins({ key: 'f941:' + s(x.id), title: '🧾 Form 941 for Q' + s(x.q) + ' ' + s(x.year) + ': review and approve', sub: 'due ' + s(x.due), raw: { kind: 'f941', createdAt: x.createdAt, urgency: 'soon' } }); });
  /* what admins' open CRM pages reported (fresh only) */
  let feed = {}; try { feed = obj(await kvGet(FEED)); } catch (e) {}
  Object.keys(feed).forEach(function(by){
    const f = obj(feed[by]), age = now - (Date.parse(f.at) || 0); if (admins.indexOf(low(by)) < 0 || age > FEED_REMIND_MS) return;
    /* APPRONCE: a report 30 min – 24 h old only counts in the 8 AM "still waiting" number (the page is closed overnight) */
    arr(f.items).forEach(function(x){ const k = s(x.key); if (!FEED_PREFIX.test(k)) return; addAdmins({ key: k, title: clip(x.title, 140) || k, sub: clip(x.sub, 80), raw: { kind: s(x.kind) || 'todo', createdAt: x.since } }, age > FEED_MS ? stale : extra); });
  });
  /* the server lists win for a key they also have */
  const has = function(l, it){ return l.some(function(x){ return x.key === it.key || ck(x.key) === ck(it.key); }); };   /* APPRONCE: a Form 941 from both = one */
  Object.keys(extra).forEach(function(e){ const l = box[e] = box[e] || []; extra[e].forEach(function(it){ if (!has(l, it)) l.push(it); }); });
  const boxAll = {}; Object.keys(box).forEach(function(e){ boxAll[e] = box[e].slice(); });
  Object.keys(stale).forEach(function(e){ const l = boxAll[e] = boxAll[e] || []; stale[e].forEach(function(it){ if (!has(l, it)) l.push(Object.assign({}, it, { stale: true })); }); });
  /* away: the away person gets nothing; what waited on them alone → their cover (marked coverFor) */
  let map = {}; try { map = await AW().activeNow(now); } catch (e) {}
  const routed = AW().routeBox(box, map), routedAll = AW().routeBox(boxAll, map);
  return { box: routed, all: routedAll, base: base, map: map, nameOf: got.nameOf || {}, admins: admins };
}
function compose(list, base, o){
  if (o && o.remind) { const nn = o.remind; return { title: 'Still waiting on you: ' + nn + ' approval' + (nn === 1 ? '' : 's'), body: list.slice(0, 3).map(function(x){ return clip(x.title, 60); }).join(' · ') + (list.length > 3 ? ' · +' + (list.length - 3) + ' more' : ''), url: base + '/#apx=mine', count: nn, remind: true }; }   /* APPRONCE: the 8 AM reminder */
  const n = list.length, cover = list.filter(function(x){ return x.coverFor; })[0];
  const note = cover ? ' (' + s(cover.coverFor).split(/\s+/)[0] + ' is away — you are covering)' : '';
  if (n === 1) return { title: '✅ Approval waiting' + note, body: clip(list[0].title, 120) + (list[0].sub ? ' — ' + clip(list[0].sub, 60) : ''), url: linkOf(list[0], base), count: 1 };
  return { title: '✅ ' + n + ' new approvals' + note, body: list.slice(0, 4).map(function(x){ return clip(x.title, 60); }).join(' · ') + (n > 4 ? ' · +' + (n - 4) + ' more' : ''), url: base + '/#apx=mine', count: n };
}
async function deliver(email, list, base, o){
  const m = compose(list, base, o);
  /* QUIET: what was held overnight for this person goes in the same ONE notification */
  let held = []; try { held = (await SQ().take([email]))[email] || []; } catch (e) { held = []; }
  if (held.length) { const d = await SQ().deliver(email, held, list.map(function(x){ return { title: x.title + (x.coverFor ? ' (for ' + s(x.coverFor).split(/\s+/)[0] + ')' : ''), url: linkOf(x, base) }; }), base); return { how: d.how, m: m, held: held.length }; }
  const p = await D.push([email], { title: m.title, body: m.body, url: m.url, tag: 'gc-appr', count: m.count });
  if (p && Array.isArray(p.to) && p.to.map(low).indexOf(email) >= 0) return { how: 'push', m: m };
  let t = null; try { t = await D.text(email, m.remind ? m.title : m.title.replace(/^✅ /, '') + ': ' + m.body, m.url, list.some(urgent)); } catch (e) { t = null; }
  if (t && t.sent) return { how: 'text', m: m };
  const html = A.shell(m.title, '<ul style="padding-left:18px">' + list.slice(0, 30).map(function(x){ return '<li style="margin:4px 0"><a href="' + esc(linkOf(x, base)) + '" style="color:#0F1D2F;font-weight:bold">' + esc(clip(x.title, 140)) + '</a>' + (x.sub ? ' <span style="color:#55626F">— ' + esc(x.sub) + '</span>' : '') + (x.coverFor ? ' <i>(for ' + esc(x.coverFor) + ')</i>' : '') + '</li>'; }).join('') + '</ul><p>Tap one to open it in the CRM (you may be asked to sign in). Nothing is approved from this e-mail.</p><p style="font-size:12px;color:#55626F">Want these on your phone instead? GrayCo Field → the green 🔔 card (or ☰ More → ⚙ Settings → 🔔 Phone notifications).</p>');
  const r = await D.mail(email, m.title + ' — GrayCo CRM', html);
  return { how: r && r.ok ? 'email' : 'none', m: m };
}
/* the away person's optional 6 PM e-mail: what was approved / declined for them today (gc_appr_audit) */
async function summaries(st, map, now, base){
  const c = central(now); if (c.hour < 18) return [];
  const want = Object.keys(map).filter(function(e){ return map[e] && map[e].summary === true && st.daily[e] !== c.ymd; });
  if (!want.length) return [];
  let audit = []; try { audit = arr(await kvGet(AUDIT)); } catch (e) {}
  const today = audit.filter(function(a){ return a && A.central(Date.parse(a.at) || 0).ymd === c.ymd; });
  const out = [];
  for (const e of want) {
    const mine = today.filter(function(a){ return low(a.email) !== e; });
    const html = A.shell('While you were away today — ' + mine.length + ' approval' + (mine.length === 1 ? '' : 's') + ' handled',
      (mine.length ? '<ul style="padding-left:18px">' + mine.slice(0, 60).map(function(a){ return '<li>' + esc(a.decision === 'denied' ? '✖ Not approved' : '✅ Approved') + ' — ' + esc(clip(a.title, 120)) + ' <span style="color:#55626F">by ' + esc(a.by) + ' (' + esc(a.device || '?') + '), ' + esc(new Date(a.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })) + '</span></li>'; }).join('') + '</ul>' : '<p>Nothing was approved today.</p>') +
      '<p><a href="' + esc(base + '/#apx=week') + '">📊 Approvals this week</a></p><p style="font-size:12px;color:#55626F">You asked for this daily summary while away (🏖 Away). Nothing else is sent to you until you are back.</p>');
    const r = await D.mail(e, '🏖 Away summary — ' + mine.length + ' handled today — GrayCo CRM', html, { noAway: true });   /* staffMail itself would redirect an away person: send straight */
    st.daily[e] = c.ymd; out.push({ email: e, ok: !!(r && r.ok), n: mine.length });
  }
  return out;
}
/* APPRONCE: the run's lease — gc_kv "gc_appr_ping_lock" (an insert that is ignored when the row is there; an expired one is
   taken over by a conditional update; then read back: ours or not). Two overlapping runs: only one sends. */
async function lease(id){
  const now = D.now(), stamp = new Date(now).toISOString(), val = { owner: id, at: stamp };
  const mine = async function(){ try { return obj(await kvGet(LOCK)).owner === id; } catch (e) { return false; } };
  const r = await fetch(C().sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: C().H({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), body: JSON.stringify({ key: LOCK, value: val, updated_at: stamp }) });
  if (!r || !r.ok) return { ok: false };
  if (await mine()) return { ok: true, stamp: stamp };
  const cut = new Date(now - LEASE_MS).toISOString();
  await fetch(C().sbUrl() + '/rest/v1/gc_kv?key=eq.' + LOCK + '&updated_at=lt.' + encodeURIComponent(cut), { method: 'PATCH', headers: C().H({ Prefer: 'return=minimal' }), body: JSON.stringify({ value: val, updated_at: stamp }) }).catch(function(){});
  return (await mine()) ? { ok: true, stamp: stamp } : { ok: false };
}
async function unlease(id, stamp){
  try { await fetch(C().sbUrl() + '/rest/v1/gc_kv?key=eq.' + LOCK + '&updated_at=eq.' + encodeURIComponent(stamp), { method: 'PATCH', headers: C().H({ Prefer: 'return=minimal' }), body: JSON.stringify({ value: { owner: '', was: id, at: stamp }, updated_at: new Date(0).toISOString() }) }); } catch (e) {}
}
/* APPRONCE: the seen list by steady key (an older state's keys are folded in: what was sent stays sent) */
function seenOf(v){
  const out = {}; Object.keys(obj(v)).forEach(function(k){ const x = obj(v[k]), c = ck(k), was = out[c];
    if (!was) out[c] = Object.assign({}, x); else { if (x.n) was.n = 1; if (s(x.at) && (!was.at || s(x.at) < s(was.at))) was.at = x.at; if (!x.gone) delete was.gone; } });
  return out;
}
async function run(opts){
  opts = opts || {};
  if (s(process.env.APPR_PING_OFF) === '1') return { ok: true, off: true };
  const id = 'R' + D.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const L = await lease(id).catch(function(){ return { ok: false }; });
  if (!L.ok) return { ok: true, busy: true };   /* another run is on it */
  try { return await run1(opts); } finally { await unlease(id, L.stamp); }
}
async function run1(opts){
  await A.loadStaff();
  const now = D.now();
  let st = {}; try { st = obj(await kvGet(STATE)); } catch (e) { return { ok: false, error: 'state unreadable' }; }
  ['seen', 'last', 'covered', 'came', 'daily', 'remind'].forEach(function(k){ st[k] = obj(st[k]); });
  Object.keys(st.seen).forEach(function(e){ st.seen[e] = seenOf(st.seen[e]); });
  const sg = await sig().catch(function(){ return ''; });
  const anyPending = Object.keys(st.seen).some(function(e){ return Object.keys(st.seen[e]).some(function(k){ const x = obj(st.seen[e][k]); return !x.n && !x.gone; }); });
  let mapQuick = {}; try { mapQuick = await AW().activeNow(now); } catch (e) {}
  const cN = central(now);
  const sumDue = cN.hour >= 18 && Object.keys(mapQuick).some(function(e){ return mapQuick[e].summary === true && st.daily[e] !== cN.ymd; });
  const QS = await SQ().settings(), quietNow = quiet(now, QS);
  const wkndOnly = quietNow && !quiet(now, Object.assign({}, QS, { sat: false, sun: false }));   /* QUIETSUN: quiet only because it is Saturday / Sunday (not night) — the 8 AM reminder still runs, for an urgent one only (below) */
  const remindHour = (!quietNow || wkndOnly) && cN.hour === REMIND_H, remindDue = remindHour && Object.keys(st.seen).some(function(e){ return st.remind[e] !== cN.ymd; });
  if (!opts.force && sg && st.sig === sg && !anyPending && !sumDue && !remindDue && now - (Date.parse(st.at) || 0) < FULL_MS) { let mo = null; if (!quietNow) { try { mo = await SQ().flush({ now: now }); } catch (e) {} } return { ok: true, unchanged: true, morning: mo }; }
  const g = await gather(now), first = !st.at, iso = new Date(now).toISOString();
  const rep = { ok: true, first: first, people: 0, sent: [], held: [] };
  const live = {};
  const gapped = function(e){ const l = Date.parse(st.last[e]) || 0; return l <= now && now - l < GAP_MS; };
  const gAll = obj(g.all), who = Object.keys(g.box).concat(Object.keys(gAll).filter(function(e){ return !g.box[e]; }));
  for (const e of who) {
    const items = noteList(g.box[e] || []); if ((!items.length && !(gAll[e] || []).length) || !staffEmail(e)) continue;
    rep.people++;
    const seen = st.seen[e] = obj(st.seen[e]), here = {};
    items.forEach(function(it){ live[it.key] = it; here[it.ck] = 1; const was = seen[it.ck];
      if (!was) seen[it.ck] = { at: iso, n: first ? 1 : 0 }; else if (was.gone) delete was.gone; });   /* APPRONCE: back again = not new */
    const fresh = items.filter(function(it){ return !seen[it.ck].n; });
    /* APPRONCE: the one morning reminder (what was sent on an earlier day and still waits); new ones due now ride along */
    let reminded = false;
    if (remindHour && st.remind[e] !== cN.ymd) {
      const all = noteList(gAll[e] || items);
      const old = all.filter(function(it){ const x = seen[ck(it.key)]; return x && x.n && central(Date.parse(x.sent || x.at) || now).ymd < cN.ymd; });   /* sent on an earlier day and still waiting */
      const wk = !/^(Sat|Sun)$/.test(cN.wd);
      if (!old.length || !(wk || all.some(urgent))) st.remind[e] = cN.ymd;   /* nothing already sent still waits / a weekend (none urgent): no reminder today */
      else if (gapped(e)) rep.held.push({ email: e, n: all.length, why: 'bundling' });
      else {
        const d = await deliver(e, all, g.base, { remind: all.length });
        fresh.forEach(function(it){ seen[it.ck].n = 1; seen[it.ck].how = d.how; seen[it.ck].sent = iso; });
        st.remind[e] = cN.ymd; st.last[e] = iso; reminded = true;
        rep.sent.push({ email: e, n: all.length, how: d.how, url: d.m.url, title: d.m.title, remind: true });
      }
    }
    if (fresh.length && !reminded) {
      const hold = (quietNow && !fresh.some(urgent)) ? 'quiet hours' : (gapped(e) ? 'bundling' : '');
      if (hold) rep.held.push({ email: e, n: fresh.length, why: hold });
      else {
        const d = await deliver(e, fresh, g.base);
        fresh.forEach(function(it){ seen[it.ck].n = 1; seen[it.ck].how = d.how; seen[it.ck].sent = iso; });
        st.last[e] = iso; rep.sent.push({ email: e, n: fresh.length, how: d.how, url: d.m.url, title: d.m.title });
      }
    }
    Object.keys(seen).forEach(function(k){ if (!here[k] && !seen[k].gone) seen[k].gone = iso; });
    const cov = {}; items.forEach(function(it){ if (it.coverFor) cov[it.key] = it.coverFor; }); st.covered[e] = cov;
  }
  /* APPRONCE: what is gone is remembered 30 days (it may come back: not new then) */
  Object.keys(st.seen).forEach(function(e){
    const m = st.seen[e], none = !g.box[e] || !noteList(g.box[e]).length;
    if (none) { delete st.covered[e]; Object.keys(m).forEach(function(k){ if (!m[k].gone) m[k].gone = iso; }); }
    Object.keys(m).forEach(function(k){ if (m[k].gone && now - (Date.parse(m[k].gone) || now) > KEEP_MS) delete m[k]; });
    if (!Object.keys(m).length) delete st.seen[e];
  });
  if (remindHour) Object.keys(st.seen).forEach(function(e){ if (who.indexOf(e) < 0) st.remind[e] = cN.ymd; });   /* nothing waiting on them */
  Object.keys(st.remind).forEach(function(e){ if (st.remind[e] < A.central(now - 7 * 864e5).ymd) delete st.remind[e]; });
  /* came in / done (the week view) */
  Object.keys(live).forEach(function(k){
    const it = live[k], c = st.came[k];
    const to = Object.keys(g.box).filter(function(e){ return g.box[e].some(function(x){ return x.key === k; }); });
    if (!c || c.goneAt) st.came[k] = { at: c && !c.goneAt ? c.at : (s(it.raw && it.raw.createdAt) && !first ? s(it.raw.createdAt) : iso), title: clip(it.title, 140), kind: s(it.raw && it.raw.kind), to: to, seenAt: iso };
    else { c.to = to; c.title = clip(it.title, 140); }
  });
  Object.keys(st.came).forEach(function(k){ const c = st.came[k]; if (!live[k] && !c.goneAt) c.goneAt = iso; if (now - (Date.parse(c.goneAt || c.at) || now) > CAME_MS) delete st.came[k]; });
  try { rep.summaries = await summaries(st, g.map, now, g.base); } catch (e) { rep.summaries = { error: s(e && e.message) }; }
  if (!quietNow) { try { rep.morning = await SQ().flush({ now: now, base: g.base }); } catch (e) { rep.morning = { error: s(e && e.message) }; } }   /* QUIET: the 7 AM bundle for everyone else held overnight */
  st.sig = sg; st.at = iso;
  try { await kvSet(STATE, st); } catch (e) { rep.ok = false; rep.error = 'state not saved'; }
  return rep;
}
/* the page's report of the CRM-only approvals waiting on admins (appr-away.js op feed; admins only) */
async function feed(email, items){
  const list = arr(items).slice(0, 120).map(function(x){ return { key: clip(x.key, 160), title: clip(x.title, 160), sub: clip(x.sub, 100), kind: clip(x.kind, 40), since: clip(x.since, 40) }; }).filter(function(x){ return FEED_PREFIX.test(x.key); });
  const sigNew = JSON.stringify(list.map(function(x){ return x.key; }).sort());
  let cur = {}; try { cur = obj(await kvGet(FEED)); } catch (e) {}
  const mine = obj(cur[low(email)]);
  if (mine.sig === sigNew && D.now() - (Date.parse(mine.at) || 0) < 10 * 60e3) return { ok: true, unchanged: true };
  Object.keys(cur).forEach(function(k){ if (D.now() - (Date.parse(obj(cur[k]).at) || 0) > 2 * FEED_MS) delete cur[k]; });
  cur[low(email)] = { at: new Date(D.now()).toISOString(), sig: sigNew, items: list };
  await kvSet(FEED, cur);
  return { ok: true, n: list.length };
}
/* one approval decision → gc_appr_audit (≤ 2000, 60 days); a second report of the same decision within 2 minutes is the same one */
async function audit(rec){
  const at = new Date(D.now()).toISOString();
  const r0 = { id: 'A' + D.now().toString(36) + Math.random().toString(36).slice(2, 6), key: clip(rec.key, 160), src: clip(rec.src, 20), kind: clip(rec.kind, 40), title: clip(rec.title, 160), job: clip(rec.job, 120),
    decision: rec.decision === 'denied' ? 'denied' : rec.decision === 'recorded' ? 'recorded' : 'approved', by: clip(rec.by, 60), email: low(rec.email), role: clip(rec.role, 20),
    device: /^(phone|tablet|computer)$/.test(low(rec.device)) ? low(rec.device) : 'unknown', at: at, since: clip(rec.since, 40), coverFor: clip(rec.coverFor, 60) };
  if (r0.since && !isNaN(Date.parse(r0.since))) r0.waitedMin = Math.max(0, Math.round((D.now() - Date.parse(r0.since)) / 60e3));
  const cut = new Date(D.now() - 60 * 864e5).toISOString();
  const r = await C().kvListUpdate(AUDIT, function(l){
    if (l.some(function(x){ return x && x.key === r0.key && x.decision === r0.decision && low(x.email) === r0.email && D.now() - (Date.parse(x.at) || 0) < 120e3; })) return null;
    return { list: l.filter(function(x){ return x && s(x.at) >= cut; }).concat([r0]).slice(-2000), check: function(l2){ return l2.some(function(x){ return x && x.id === r0.id; }); }, result: r0 };
  });
  return { ok: !!(r && r.ok), rec: r && r.result, dup: !!(r && r.unchanged) };
}
/* 📊 Approvals this week (admins): what came in, who handled it, how long it waited, anything waiting 24 h+ */
async function week(now){
  now = now == null ? D.now() : now;
  const since = now - 7 * 864e5;
  let st = {}, au = []; try { st = obj(await kvGet(STATE)); } catch (e) {} try { au = arr(await kvGet(AUDIT)); } catch (e) {}
  const came = obj(st.came), done = au.filter(function(a){ return (Date.parse(a.at) || 0) >= since; }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); });
  const inList = Object.keys(came).map(function(k){ return Object.assign({ key: k }, came[k]); }).filter(function(c){ return (Date.parse(c.goneAt || c.at) || now) >= since; });
  const waiting = inList.filter(function(c){ return !c.goneAt; }).map(function(c){ c.waitH = Math.round((now - (Date.parse(c.at) || now)) / 36e5); return c; });
  let away = []; try { away = AW().upcoming(await AW().load(true), now); } catch (e) {}
  return { ok: true, at: new Date(now).toISOString(), came: inList.length, handled: done, waiting: waiting, stuck: waiting.filter(function(c){ return c.waitH >= 24; }), away: away, covered: obj(st.covered), pings: Object.keys(obj(st.last)).map(function(e){ return { email: e, last: st.last[e] }; }) };
}
module.exports = { STATE, FEED, AUDIT, LOCK, SIG_KEYS, FEED_PREFIX, D, run, gather, compose, feed, audit, week, quiet, ck, noteList };
