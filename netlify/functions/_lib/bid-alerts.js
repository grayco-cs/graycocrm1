/* ============================================================================
   GrayCo — ADMIN ALERTS FOR NEW BID OPPORTUNITIES.   netlify/functions/_lib/bid-alerts.js   (patch LD2)

   Owner (10/20): "alert admins about new bid opportunities."

   Who: every ACTIVE admin on gc_staff (role 'admin' — the same list the CRM's sign-in uses, SEC2),
        plus OWNER_EMAILS (default Wesley and Nick), plus BID_ALERT_TO (optional extra addresses).
   What, for every new opportunity the Lead Inbox stores (e-mail, public bid watcher, BuildingConnected API):
     · E-MAIL. Due soon (bid due within BID_ALERT_SOON_HOURS, default 72 h): one e-mail at once.
       Everything else waits in the queue and goes out as ONE digest an hour (bid-alerts.js, scheduled).
       Each opportunity is e-mailed once. Commercial and insurance ones are listed first under
       "Needs a PM" (the owner assigns every lead).
     · PHONE PUSH, when the To-Do tab's push piece (patch TD: notify-push.js, the VAPID keys and the
       web-push module) is present: the same subscriptions it keeps (gc_kv "gc_push_subs__<email>").
       Without it nothing is pushed and nothing fails.
     · IN THE CRM: bid-inbox.js ?list=1 carries the queue's state; the page shows the toast and badges.
   Nothing here ever writes to a customer or a sub. It sends only to GrayCo admins.
   ========================================================================== */
'use strict';

const KA = 'gc_lead_inbox_alerts';

function make(d){
  const { env, s, low, arr, nowIso, sb, kvCas, kvGet } = d;
  const soonH = () => { const n = parseFloat(env('BID_ALERT_SOON_HOURS') || '72'); return isFinite(n) && n > 0 ? n : 72; };
  const off = () => env('BID_ALERTS_OFF') === '1';
  const site = () => (env('CRM_URL') || env('PORTAL_BASE_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function hoursLeft(due){ if (!due) return null; const t = Date.parse(due.length === 10 ? due + 'T23:59:00' : due); return isFinite(t) ? (t - Date.now()) / 3600000 : null; }
  function isSoon(due){ const h = hoursLeft(due); return h != null && h >= -12 && h <= soonH(); }
  function fmtDue(due){
    if (!due) return 'no bid date yet';
    const t = new Date(due.length === 10 ? due + 'T12:00:00' : due); if (isNaN(t)) return due;
    return t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (due.length > 10 ? ' ' + t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
  }
  function entry(it){
    return { id: it.id, title: s(it.title).slice(0, 200), source: s(it.source), type: s(it.type), bidDue: s(it.bidDue), city: s(it.city), state: s(it.state), gc: s(it.gc),
      link: (arr(it.plansLinks)[0] || {}).url || '', files: arr(it.files).length, at: nowIso(), soon: isSoon(it.bidDue) };
  }

  async function recipients(){
    const out = [];
    try {
      const r = await sb('gc_staff?select=email,name,role,active&role=eq.admin');
      if (r.ok) arr(await r.json()).forEach(x => { if (x && x.active !== false && low(x.role) === 'admin' && x.email) out.push(low(x.email)); });
    } catch (e) {}
    (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').concat(env('BID_ALERT_TO').split(','))
      .map(low).filter(x => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x)).forEach(x => out.push(x));
    return Array.from(new Set(out));
  }

  function mail(list, kind){
    const needPm = list.filter(x => /commercial|insurance/.test(low(x.type))), rest = list.filter(x => needPm.indexOf(x) < 0);
    const row = x => '<tr><td style="padding:8px 10px;border-bottom:1px solid #eee"><b>' + esc(x.title) + '</b><br><span style="color:#555;font-size:13px">'
      + esc([x.type && x.type[0].toUpperCase() + x.type.slice(1), 'from ' + (x.source || 'the Lead Inbox'), [x.city, x.state].filter(Boolean).join(', '), x.gc && 'GC ' + x.gc].filter(Boolean).join(' · ')) + '</span></td>'
      + '<td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;color:' + (x.soon ? '#b91c1c' : '#333') + ';font-weight:700">' + esc(fmtDue(x.bidDue)) + '</td></tr>';
    const table = (title, xs) => xs.length ? '<h3 style="margin:18px 0 6px;font:700 15px Arial;color:#241968">' + esc(title) + '</h3><table style="width:100%;border-collapse:collapse;font:14px Arial">' + xs.map(row).join('') + '</table>' : '';
    const n = list.length;
    const subject = kind === 'soon'
      ? 'Bid due soon: ' + list[0].title + (n > 1 ? ' (+' + (n - 1) + ' more)' : '') + ' — ' + fmtDue(list[0].bidDue)
      : n + ' new bid opportunit' + (n === 1 ? 'y' : 'ies') + ' in the Lead Inbox';
    const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">GrayCo Lead Inbox</div><div style="padding:6px 18px 18px">'
      + '<p>' + (kind === 'soon' ? 'A new bid opportunity is due soon.' : 'New bid opportunities came in.') + ' Each one is a lead in the CRM and a <b>draft</b> in the bid portal; nothing is shown to subs until an admin presses <b>Publish to bid portal</b>.</p>'
      + table('Needs a PM — commercial and insurance', needPm) + table(needPm.length ? 'Other opportunities' : 'Opportunities', rest)
      + '<p style="margin-top:18px"><a href="' + esc(site()) + '/#leads" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open the Lead Inbox</a></p>'
      + '<p style="color:#777;font-size:12px">Sent to GrayCo admins only (gc_staff admins and OWNER_EMAILS). Bids due within ' + soonH() + ' hours are sent at once; the rest come as one e-mail an hour.</p></div></div>';
    const text = subject + '\n\n' + list.map(x => '- ' + x.title + ' (' + [x.type, x.source, [x.city, x.state].filter(Boolean).join(', ')].filter(Boolean).join(', ') + ') due ' + fmtDue(x.bidDue)).join('\n') + '\n\nOpen the Lead Inbox: ' + site() + '/#leads';
    return { subject, html, text };
  }

  async function sendMail(to, m){
    const key = env('RESEND_API_KEY'); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
    if (!to.length) return { ok: false, why: 'no admin e-mail addresses' };
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env('BID_ALERT_FROM') || 'GrayCo Lead Inbox <noreply@grayco-cs.com>', to, subject: m.subject, html: m.html, text: m.text, headers: { 'X-GrayCo-CRM': 'lead-inbox-alert' } }) });
      return r.ok ? { ok: true } : { ok: false, why: 'Resend answered ' + r.status };
    } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
  }

  /* patch TD's push piece: present when its keys are set and web-push is installed */
  function loadWebPush(){ try { return require('web-push'); } catch (e) { return null; } }
  async function push(to, list, kind){
    const pub = env('VAPID_PUBLIC_KEY'), priv = env('VAPID_PRIVATE_KEY');
    if (!pub || !priv) return { sent: 0, why: 'phone push is not set up (patch TD)' };
    const wp = d.webPush || loadWebPush(); if (!wp) return { sent: 0, why: 'web-push is not installed' };
    try { wp.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:office@grayco-cs.com', pub, priv); } catch (e) { return { sent: 0, why: 'bad VAPID keys' }; }
    const payload = JSON.stringify({ title: kind === 'soon' ? 'Bid due soon: ' + list[0].title.slice(0, 80) : list.length + ' new bid opportunit' + (list.length === 1 ? 'y' : 'ies'),
      body: list.slice(0, 3).map(x => x.title.slice(0, 60) + ' — ' + fmtDue(x.bidDue)).join('\n').slice(0, 180), link: site() + '/#leads', tag: 'lead-inbox' });
    let sent = 0;
    for (const email of to) {
      let subs = [];
      try { const r = await sb('gc_kv?select=value&key=eq.' + encodeURIComponent('gc_push_subs__' + email)); const rows = r.ok ? await r.json() : []; let v = rows && rows[0] ? rows[0].value : []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } subs = arr(v).filter(x => x && x.endpoint && x.keys); } catch (e) {}
      for (const sub of subs) { try { await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 86400 }); sent++; } catch (e) {} }
    }
    return { sent };
  }

  async function deliver(list, kind){
    const to = await recipients();
    const m = await sendMail(to, mail(list, kind));
    const p = m.ok ? await push(to, list, kind) : { sent: 0 };
    return { ok: m.ok, why: m.why, to, pushed: p.sent, pushWhy: p.why };
  }

  /* new items: queued; the due-soon ones are sent right away */
  async function enqueue(items){
    if (off()) return { queued: 0, off: true };
    const fresh = arr(items).filter(it => it && it.id).map(entry);
    if (!fresh.length) return { queued: 0 };
    let added = [];
    await kvCas(KA, v => {
      const st = Object.assign({ pending: [], sent: [] }, v || {});
      const known = {}; st.pending.concat(st.sent).forEach(x => { if (x && x.id) known[x.id] = 1; });
      added = fresh.filter(x => !known[x.id]);
      if (!added.length) return undefined;
      st.pending = st.pending.concat(added).slice(-300);
      return st;
    });
    const soon = added.filter(x => x.soon);
    let now = null;
    if (soon.length) now = await sendList(soon.map(x => x.id), 'soon');
    return { queued: added.length, soonSent: now };
  }

  /* send these pending ids (or all pending: the hourly digest), then mark them sent */
  async function sendList(ids, kind){
    const st = Object.assign({ pending: [], sent: [] }, (await kvGet(KA)) || {});
    const list = st.pending.filter(x => !ids || ids.indexOf(x.id) >= 0);
    if (!list.length) return { sent: 0 };
    list.forEach(x => { x.soon = isSoon(x.bidDue); });
    const r = await deliver(list, kind || 'digest');
    const at = nowIso();
    await kvCas(KA, v => {
      const cur = Object.assign({ pending: [], sent: [] }, v || {});
      if (r.ok) {
        const done = {}; list.forEach(x => { done[x.id] = 1; });
        cur.pending = cur.pending.filter(x => !done[x.id]);
        cur.sent = cur.sent.concat(list.map(x => ({ id: x.id, at, how: kind || 'digest' }))).slice(-600);
      }
      cur.last = { at, kind: kind || 'digest', n: list.length, ok: r.ok, why: r.why || '', to: r.to.length, pushed: r.pushed || 0, pushWhy: r.pushWhy || '' };
      if ((kind || 'digest') === 'digest') cur.lastDigestAt = at;
      return cur;
    });
    return { sent: r.ok ? list.length : 0, ok: r.ok, why: r.why, to: r.to, pushed: r.pushed };
  }
  async function digest(){ if (off()) return { sent: 0, off: true }; return sendList(null, 'digest'); }
  async function state(){ const st = (await kvGet(KA)) || {}; return { pending: arr(st.pending).length, last: st.last || null, lastDigestAt: st.lastDigestAt || '', soonHours: soonH() }; }

  return { enqueue, digest, sendList, recipients, state, isSoon, _mail: mail, KA };
}
module.exports = { make, KA };
