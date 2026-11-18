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
   Off switch: Netlify APPR_PING_OFF=1. */
'use strict';
const A = require('./auto-common.js');
const { s, low, arr, esc, clip, staffEmail } = A;
const STATE = 'gc_appr_ping', FEED = 'gc_appr_feed', AUDIT = 'gc_appr_audit';
const GAP_MS = 10 * 60e3, FULL_MS = 30 * 60e3, FEED_MS = 30 * 60e3, CAME_MS = 14 * 864e5;
const SIG_KEYS = ['gc_approval_queue', 'gc_sub_approvals', 'gc_expense_approvals', 'payrollRuns', 'gc_payroll_approvals', FEED, 'gc_away'];
const FEED_PREFIX = /^(f941:|td:|pay:|inv:|bp:|to:|mat:)/;   /* the CRM-only kinds an admin's page reports (ap2 / sub / exp come from the server lists) */
const D = { now: function(){ return Date.now(); }, collect: function(now){ return require('./auto-digest.js').collect(now); },
  push: function(to, p){ return require('./staffpush.js').send(to, p, { noAway: true, noQuiet: true }); },
  text: function(email, text, link){ return require('./smsalert.js').notify({ type: 'approvals', text: text, link: link, thread: 'apprnew', mine: [email], only: [email] }); },
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
function keyOf(it){ if (it.key) return s(it.key); const r = it.raw || {}; return r.id ? 'ap2:' + s(r.id) : 'x:' + s(it.title); }
function linkOf(it, base){ return s(it.link) || base + '/#apx=' + encodeURIComponent(keyOf(it)); }

/* everything waiting, per person (already routed for away), with a key on each item */
async function gather(now){
  const got = await D.collect(now);
  const base = got.base || A.crmBase(), data = got.data || {};
  const box = {}; Object.keys(got.box || {}).forEach(function(e){ box[low(e)] = (got.box[e] || []).map(function(it){ it.key = keyOf(it); return it; }); });
  let admins = []; try { admins = C().adminEmails(data).filter(staffEmail); } catch (e) {}
  const extra = {}; admins.forEach(function(e){ extra[e] = []; });
  const addAdmins = function(it){ admins.forEach(function(e){ if (!extra[e].some(function(x){ return x.key === it.key; })) extra[e].push(it); }); };
  /* Form 941 waiting on review (admins) */
  let pa = []; try { pa = arr((await C().kvRead(['gc_payroll_approvals'])).gc_payroll_approvals); } catch (e) {}
  pa.forEach(function(x){ if (x && x.kind === 'f941' && x.status === 'waiting') addAdmins({ key: 'f941:' + s(x.id), title: '🧾 Form 941 for Q' + s(x.q) + ' ' + s(x.year) + ': review and approve', sub: 'due ' + s(x.due), raw: { kind: 'f941', createdAt: x.createdAt, urgency: 'soon' } }); });
  /* what admins' open CRM pages reported (fresh only) */
  let feed = {}; try { feed = obj(await kvGet(FEED)); } catch (e) {}
  Object.keys(feed).forEach(function(by){
    const f = obj(feed[by]); if (admins.indexOf(low(by)) < 0 || now - (Date.parse(f.at) || 0) > FEED_MS) return;
    arr(f.items).forEach(function(x){ const k = s(x.key); if (!FEED_PREFIX.test(k)) return; addAdmins({ key: k, title: clip(x.title, 140) || k, sub: clip(x.sub, 80), raw: { kind: s(x.kind) || 'todo', createdAt: x.since } }); });
  });
  /* the server lists win for a key they also have */
  Object.keys(extra).forEach(function(e){ const l = box[e] = box[e] || []; extra[e].forEach(function(it){ if (!l.some(function(x){ return x.key === it.key; })) l.push(it); }); });
  /* away: the away person gets nothing; what waited on them alone → their cover (marked coverFor) */
  let map = {}; try { map = await AW().activeNow(now); } catch (e) {}
  const routed = AW().routeBox(box, map);
  return { box: routed, base: base, map: map, nameOf: got.nameOf || {}, admins: admins };
}
function compose(list, base){
  const n = list.length, cover = list.filter(function(x){ return x.coverFor; })[0];
  const note = cover ? ' (' + s(cover.coverFor).split(/\s+/)[0] + ' is away — you are covering)' : '';
  if (n === 1) return { title: '✅ Approval waiting' + note, body: clip(list[0].title, 120) + (list[0].sub ? ' — ' + clip(list[0].sub, 60) : ''), url: linkOf(list[0], base), count: 1 };
  return { title: '✅ ' + n + ' new approvals' + note, body: list.slice(0, 4).map(function(x){ return clip(x.title, 60); }).join(' · ') + (n > 4 ? ' · +' + (n - 4) + ' more' : ''), url: base + '/#apx=mine', count: n };
}
async function deliver(email, list, base){
  const m = compose(list, base);
  /* QUIET: what was held overnight for this person goes in the same ONE notification */
  let held = []; try { held = (await SQ().take([email]))[email] || []; } catch (e) { held = []; }
  if (held.length) { const d = await SQ().deliver(email, held, list.map(function(x){ return { title: x.title + (x.coverFor ? ' (for ' + s(x.coverFor).split(/\s+/)[0] + ')' : ''), url: linkOf(x, base) }; }), base); return { how: d.how, m: m, held: held.length }; }
  const p = await D.push([email], { title: m.title, body: m.body, url: m.url, tag: 'gc-appr', count: m.count });
  if (p && Array.isArray(p.to) && p.to.map(low).indexOf(email) >= 0) return { how: 'push', m: m };
  let t = null; try { t = await D.text(email, m.title.replace(/^✅ /, '') + ': ' + m.body, m.url); } catch (e) { t = null; }
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
async function run(opts){
  opts = opts || {};
  if (s(process.env.APPR_PING_OFF) === '1') return { ok: true, off: true };
  await A.loadStaff();
  const now = D.now();
  let st = {}; try { st = obj(await kvGet(STATE)); } catch (e) { return { ok: false, error: 'state unreadable' }; }
  ['seen', 'last', 'covered', 'came', 'daily'].forEach(function(k){ st[k] = obj(st[k]); });
  const sg = await sig().catch(function(){ return ''; });
  const anyPending = Object.keys(st.seen).some(function(e){ return Object.keys(obj(st.seen[e])).some(function(k){ return !obj(st.seen[e][k]).n; }); });
  let mapQuick = {}; try { mapQuick = await AW().activeNow(now); } catch (e) {}
  const sumDue = central(now).hour >= 18 && Object.keys(mapQuick).some(function(e){ return mapQuick[e].summary === true && st.daily[e] !== central(now).ymd; });
  const QS = await SQ().settings(), quietNow = quiet(now, QS);
  if (!opts.force && sg && st.sig === sg && !anyPending && !sumDue && now - (Date.parse(st.at) || 0) < FULL_MS) { let mo = null; if (!quietNow) { try { mo = await SQ().flush({ now: now }); } catch (e) {} } return { ok: true, unchanged: true, morning: mo }; }
  const g = await gather(now), first = !st.at, iso = new Date(now).toISOString();
  const rep = { ok: true, first: first, people: 0, sent: [], held: [] };
  const live = {};
  for (const e of Object.keys(g.box)) {
    const items = g.box[e]; if (!items.length || !staffEmail(e)) continue;
    rep.people++;
    const seen = obj(st.seen[e]), nextSeen = {};
    items.forEach(function(it){ live[it.key] = it; const was = seen[it.key]; nextSeen[it.key] = was ? was : { at: iso, n: first ? 1 : 0 }; });
    const fresh = items.filter(function(it){ return !nextSeen[it.key].n; });
    if (fresh.length) {
      const hold = (quietNow && !fresh.some(urgent)) ? 'quiet hours' : ((function(l){ return l <= now && now - l < GAP_MS; })(Date.parse(st.last[e]) || 0) ? 'bundling' : '');
      if (hold) rep.held.push({ email: e, n: fresh.length, why: hold });
      else {
        const d = await deliver(e, fresh, g.base);
        fresh.forEach(function(it){ nextSeen[it.key].n = 1; nextSeen[it.key].how = d.how; });
        st.last[e] = iso; rep.sent.push({ email: e, n: fresh.length, how: d.how, url: d.m.url, title: d.m.title });
      }
    }
    st.seen[e] = nextSeen;
    const cov = {}; items.forEach(function(it){ if (it.coverFor) cov[it.key] = it.coverFor; }); st.covered[e] = cov;
  }
  Object.keys(st.seen).forEach(function(e){ if (!g.box[e] || !g.box[e].length) { delete st.seen[e]; delete st.covered[e]; } });
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
module.exports = { STATE, FEED, AUDIT, SIG_KEYS, FEED_PREFIX, D, run, gather, compose, feed, audit, week, quiet };
