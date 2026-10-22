/* ============================================================================
   GrayCo — 📟 ON-CALL PAGING for after-hours emergencies (patch X10).   netlify/functions/_lib/oncall.js

   Owner 10/21: "On-call rotation … in mitigation profiles and tabs." An after-hours emergency (water / fire) lead from
   any intake (website, missed call, partner API, leads@, the bids@ inbox — they all go through bid-alerts notifyNew)
   pages the person on call this week: e-mail + phone push (+ a text once Twilio is set up), with an ✅ Accept link.
   Nobody accepts in 10 minutes → the next person in the rotation, and so on; after the last one → every admin.
   The rotation lives in gc_lead_inbox_kv "gc_x10_oncall" (set in the CRM: 💧 Mitigation → 📟 On call); the pages in
   "gc_x10_pages". Names and e-mails are data only — nobody is hard-coded.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const X = require('./x10.js');
const KCFG = 'gc_x10_oncall', KPAGES = 'gc_x10_pages';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function make(d){
  const env = function(k){ return s(d.env(k)); };
  const now = function(){ return typeof d.now === 'function' ? d.now() : Date.now(); };
  const nowIso = function(){ return new Date(now()).toISOString(); };
  const site = function(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); };
  function secret(){ return env('ONCALL_SECRET') || crypto.createHash('sha256').update('gc-oncall|' + (env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || 'x')).digest('hex'); }
  function sig(id, email){ return crypto.createHmac('sha256', secret()).update(s(id) + '|' + low(email)).digest('hex').slice(0, 32); }
  function acceptUrl(id, email){ return site() + '/.netlify/functions/x10?accept=' + encodeURIComponent(id) + '&e=' + encodeURIComponent(low(email)) + '&s=' + sig(id, email); }
  async function cfg(){ return X.oncallCfg(await d.kvGet(KCFG)); }
  async function pages(){ const v = await d.kvGet(KPAGES); return Array.isArray(v) ? v : (v && Array.isArray(v.list) ? v.list : []); }
  async function pagesCas(fn){ return d.kvCas(KPAGES, function(v){ const l = Array.isArray(v) ? v.slice() : (v && Array.isArray(v.list) ? v.list.slice() : []); const r = fn(l); return r === undefined ? undefined : r; }); }

  async function mail(to, subject, html, text){
    const key = env('RESEND_API_KEY'); if (!key || !to.length) return { ok: false };
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env('ONCALL_FROM') || 'GrayCo On Call <noreply@grayco-cs.com>', to: to, subject: require('./mailtag.js').tag(subject, to, 'area:Mitigation'), html: html, text: text, headers: { 'X-GrayCo-CRM': 'oncall-page' } }) });
      return { ok: r.ok };
    } catch (e) { return { ok: false }; }
  }
  async function sms(phone10, body){
    const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM');
    if (!sid || !tok || !from || !/^\d{10}$/.test(s(phone10))) return { ok: false, skipped: true };
    try {
      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: '+1' + phone10, From: from, Body: s(body).slice(0, 600) }).toString() });
      return { ok: r.ok };
    } catch (e) { return { ok: false }; }
  }
  function pageMail(pg, who, admins){
    const c = pg.contact || {};
    const lines = [pg.title, pg.detail, [c.name, c.phone, c.email].filter(Boolean).join(' · '), pg.address].filter(Boolean);
    const subject = '🚨 ON CALL — emergency lead: ' + pg.title;
    const btn = function(email){ return '<p><a href="' + esc(acceptUrl(pg.id, email)) + '" style="background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">✅ Accept — I have it</a></p>'; };
    const html = function(email){ return '<div style="font:15px Arial;color:#1b1640;max-width:600px"><div style="background:#b91c1c;color:#fff;padding:14px 18px;font-weight:700;font-size:17px">🚨 After-hours emergency — ' + (admins ? 'nobody on the rotation accepted' : 'you are on call') + '</div><div style="padding:8px 18px">' +
      lines.map(function(x){ return '<p style="margin:6px 0">' + esc(x) + '</p>'; }).join('') +
      (c.phone ? '<p><a href="tel:' + esc(s(c.phone).replace(/[^\d+]/g, '')) + '" style="font-weight:700">📞 Call ' + esc(c.name || 'them') + ' ' + esc(c.phone) + '</a></p>' : '') + btn(email) +
      '<p style="color:#555;font-size:13px">' + (admins ? 'Everyone on the rotation was paged (' + esc(pg.chain.map(function(x){ return x.name || x.email; }).join(', ')) + ') and nobody accepted in time.' : 'Nobody accepts in ' + esc(pg.escalateMin) + ' minutes → it goes to the next person on the rotation, then to the admins.') + '</p>' +
      '<p><a href="' + esc(site()) + '/#leads">Open Leads in the CRM</a></p></div></div>'; };
    return { subject: subject, html: html, text: subject + '\n\n' + lines.join('\n') + '\n\nAccept: ' + acceptUrl(pg.id, who && who.email || '') };
  }
  async function send(pg, people, admins){
    const m = pageMail(pg, people[0], admins);
    let ok = false;
    for (const p of people) {   /* one e-mail each: each person gets their own Accept link */
      const r = await mail([p.email], m.subject, m.html(p.email), m.subject + '\n\n' + [pg.title, pg.detail].filter(Boolean).join('\n') + '\n\nAccept: ' + acceptUrl(pg.id, p.email));
      ok = ok || r.ok;
      if (p.phone) await sms(p.phone, '🚨 GrayCo on call: ' + pg.title + (pg.contact && pg.contact.phone ? ' — call ' + pg.contact.phone : '') + '. Accept: ' + acceptUrl(pg.id, p.email));
    }
    try { if (typeof d.push === 'function') await d.push(people.map(function(p){ return p.email; }), { title: '🚨 On call: ' + pg.title.slice(0, 80), body: (pg.detail || 'Emergency lead — accept it in the e-mail').slice(0, 160), tag: 'oncall-' + pg.id }); } catch (e) {}
    return ok;
  }

  /* called by bid-alerts notifyNew with the new leads (raw items); pages for each after-hours emergency */
  async function maybePage(items){
    const list = (items || []).filter(function(it){ return it && X.isEmergency(it); });
    if (!list.length) return { paged: 0 };
    const c = await cfg(); const t = now();
    if (!c.on || !c.rotation.length) return { paged: 0, why: 'no rotation' };
    if (!X.afterHours(t, c)) return { paged: 0, why: 'business hours' };
    const ch = X.chain(t, c); if (!ch.length) return { paged: 0, why: 'no rotation' };
    let paged = 0;
    for (const it of list) {
      const id = 'OC-' + crypto.createHash('sha256').update(s(it.id || it.key || it.title) + '|' + s(it.key)).digest('hex').slice(0, 16);
      const ct = it.contact && typeof it.contact === 'object' ? it.contact : {};
      const pg = { id: id, leadKey: s(it.key || (/^LI-/.test(s(it.id)) ? 'LEADIN-' + s(it.id).slice(3) : it.id)), leadId: s(it.id), title: s(it.title || it.name).slice(0, 160) || 'Emergency lead', detail: s(it.detail).slice(0, 400),
        source: s(it.source), address: s(it.address).slice(0, 160), contact: { name: s(ct.name).slice(0, 80), phone: s(ct.phone).slice(0, 30), email: s(ct.email).slice(0, 120) },
        chain: ch, step: 0, createdAt: nowIso(), lastSentAt: nowIso(), escalateMin: c.escalateMin, sent: [{ at: nowIso(), to: [ch[0].email] }] };
      let mine = false;
      await pagesCas(function(l){ if (l.some(function(x){ return x.id === id; })) return undefined; mine = true; return l.concat([pg]).slice(-400); });
      if (!mine) continue;
      await send(pg, [ch[0]], false); paged++;
    }
    return { paged: paged };
  }
  /* every few minutes: no accept in time → the next person; after the rotation → all admins */
  async function escalate(adminEmails){
    const c = await cfg(); const t = now();
    const due = (await pages()).map(function(pg){ return { pg: pg, n: X.pageNext(pg, t, c) }; }).filter(function(x){ return x.n; });
    let sent = 0;
    for (const x of due) {
      let claim = false;
      await pagesCas(function(l){ const p = l.find(function(y){ return y.id === x.pg.id; }); if (!p || p.acceptedAt || (p.step || 0) >= x.n.step) return undefined; claim = true; p.step = x.n.step; p.lastSentAt = nowIso();
        if (x.n.admins) { p.adminsAt = nowIso(); p.sent = (p.sent || []).concat([{ at: nowIso(), to: ['admins'] }]); } else p.sent = (p.sent || []).concat([{ at: nowIso(), to: x.n.to.map(function(y){ return y.email; }) }]); return l; });
      if (!claim) continue;
      const people = x.n.admins ? (adminEmails || []).map(function(e){ return { email: low(e), name: '' }; }) : x.n.to;
      if (people.length) { await send(x.pg, people, x.n.admins); sent++; }
    }
    return { sent: sent, open: due.length };
  }
  async function accept(id, email, sg){
    if (!id || !email || !sg || sg.length !== 32) return { ok: false, why: 'bad link' };
    const want = sig(id, email);
    if (!crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sg))) return { ok: false, why: 'bad link' };
    let out = null;
    await pagesCas(function(l){ const p = l.find(function(y){ return y.id === id; }); if (!p) return undefined; out = p; if (p.acceptedAt) return undefined;
      const who = (p.chain || []).find(function(y){ return y.email === low(email); });
      p.acceptedAt = nowIso(); p.acceptedBy = low(email); p.acceptedName = who ? who.name : ''; p.history = (p.history || []).concat([{ at: p.acceptedAt, by: low(email), what: 'accepted' }]); out = p; return l; });
    return out ? { ok: true, page: out } : { ok: false, why: 'not found' };
  }
  return { cfg: cfg, pages: pages, pagesCas: pagesCas, maybePage: maybePage, escalate: escalate, accept: accept, acceptUrl: acceptUrl, sig: sig, KCFG: KCFG, KPAGES: KPAGES };
}
module.exports = { make: make, KCFG: KCFG, KPAGES: KPAGES };
