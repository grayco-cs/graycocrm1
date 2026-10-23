// netlify/functions/gc-portal.js
// GrayCo — THE GC / OWNER PORTAL, company documents, and the customer-portal extras (patch GCP).
// The rules and the stores are in _lib/gcp.js (read that first).
//
// PUBLIC — a GC's link (portal.grayco-cs.com/#g=<code>; the page sends the code in the x-gc-token header):
//   POST {action:'gc-view'}                       → the job, schedule, updates, pay apps, change orders, RFIs, company documents
//   POST {action:'gc-photos'}                     → the photos the customer may see too (same rules as the customer portal)
//   POST {action:'gc-doc', id}                    → a short-lived download link for a current company document (COI, W-9 …)
//   POST {action:'gc-payapp-file', id}            → the pay app's PDF
//   POST {action:'gc-approve-pay', id, name, note}
//   POST {action:'gc-co-request', title, description, name}
//   POST {action:'gc-co-sign', id, name, title, agree:true}
//   POST {action:'gc-rfi-answer', id, answer, name}
//   An unknown or turned-off code gets "This link is not active — call GrayCo 901-585-0944" (per-address rate limit).
// PUBLIC — a customer's portal link (x-portal-token / x-portal-session, exactly like portal.js):
//   POST {action:'cust-extras'}                   → { checkin:{show,done}, registry:{show,…} }
//   POST {action:'cust-checkin', mood:'happy'|'ok'|'unhappy', note}
//   POST {action:'cust-registry'}                 → the warranty registry PDF (after closeout)
// PUBLIC — the seasonal inspection offer: GET ?inspect=<code> (a page with a button) → POST {action:'inspect-accept', code, note}
// STAFF (CRM sign-in + gc_staff):
//   gcp-state {projectId} · gcp-link {projectId, op:create|revoke|regenerate} · gcp-send-link {projectId}
//   gcp-payapp-add {projectId, number, period, amount, retainage, retainagePct, ref, fileName, note, source}
//   gcp-payapp-status {projectId, id, status:paid|void|approved, amount} · gcp-co-price {projectId, id?, title, description, amount}
//   gcp-co-void {projectId, id} · gcp-signed {} (signed GC change orders the CRM has not taken in yet) · gcp-co-imported {projectId, ids, map}
//   gcp-rfi-new {projectId, subject, question, due, to} · gcp-rfi-answer {projectId, id, answer}
//   docs-list · docs-url {id} · docs-add {kind, title, ref, name, type, expires, replaces, sendToGcs} (admins) · docs-remove {id} (admins)
//   gcp-contacts-all {} → every active GC contact (for Admin)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const G = require('./_lib/gcp.js');
let CORE = null;
function core(){ if (!CORE) CORE = require('./portal.js')._core; return CORE; }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function reply(code, headers, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; }
const STAFF = ['gcp-state', 'gcp-link', 'gcp-send-link', 'gcp-payapp-add', 'gcp-payapp-status', 'gcp-co-price', 'gcp-co-void', 'gcp-signed', 'gcp-co-imported', 'gcp-rfi-new', 'gcp-rfi-answer',
  'docs-list', 'docs-url', 'docs-add', 'docs-remove', 'gcp-contacts-all'];
const GCPUB = ['gc-view', 'gc-photos', 'gc-doc', 'gc-payapp-file', 'gc-approve-pay', 'gc-co-request', 'gc-co-sign', 'gc-rfi-answer'];
const CUST = ['cust-extras', 'cust-checkin', 'cust-registry'];

function inspectPage(code){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>GrayCo — free roof inspection</title>'
    + '<style>body{margin:0;background:#F6F3EC;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#14202E}header{background:#0F1D2F;padding:18px;text-align:center}header img{width:180px;max-width:60vw}'
    + 'main{max-width:520px;margin:0 auto;padding:22px 18px}.c{background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.06)}h1{font-size:22px;margin:0 0 10px}textarea{width:100%;box-sizing:border-box;min-height:80px;border:1px solid #cbd5e1;border-radius:9px;padding:10px;font:15px inherit}'
    + 'button{margin-top:14px;width:100%;min-height:50px;border:none;border-radius:10px;background:#D4A017;color:#14202E;font:700 17px inherit;cursor:pointer}.m{color:#55626F;font-size:14px}</style></head><body>'
    + '<header><img src="/portal-logo.png" alt="GrayCo Construction Services"></header><main><div class="c" id="c"><h1>Your free roof inspection</h1><p>Tap the button and your GrayCo Project Manager will call you to pick a time.</p>'
    + '<label class="m" for="n">Anything we should know? (optional)</label><textarea id="n" maxlength="800" placeholder="e.g. best time to call, a leak you noticed"></textarea>'
    + '<button id="b" type="button">Yes — schedule my free inspection</button><p class="m">Or call us: <a href="tel:9015850944">(901) 585-0944</a></p></div></main>'
    + '<script>(function(){var b=document.getElementById("b");b.onclick=function(){b.disabled=true;b.textContent="Sending…";fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"inspect-accept",code:' + JSON.stringify(code) + ',note:document.getElementById("n").value})}).then(function(r){return r.json();}).then(function(j){document.getElementById("c").innerHTML=j.ok?"<h1>Thank you"+(j.first?", "+j.first.replace(/[<>&]/g,""):"")+"!</h1><p>We got it. Your Project Manager will call you soon to set a time.</p>":"<h1>Hmm</h1><p>"+String(j.error||"That did not work.").replace(/[<>&]/g,"")+" Please call us at <a href=\\"tel:9015850944\\">(901) 585-0944</a>.</p>";},function(){b.disabled=false;b.textContent="Try again";});};})();</script></body></html>';
}

exports.handler = async function(event){
  event = event || {};
  const C = core(), t0 = Date.now();
  const headers = Object.assign(C.gcCors(event, 'GET, POST, OPTIONS', 'x-gc-token, x-portal-token, x-portal-session'), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  const qs = event.queryStringParameters || {}, ip = C.ipOf(event);
  if (event.httpMethod === 'GET') {
    if (qs.ping === '1') return reply(200, headers, { ok: true, service: 'GrayCo GC portal' });
    if (qs.inspect) {
      if (C.limited(ip)) return { statusCode: 429, headers: { 'Content-Type': 'text/plain' }, body: 'Too many tries.' };
      return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' }, body: inspectPage(G.TOKEN_RE.test(s(qs.inspect)) ? s(qs.inspect) : '') };
    }
    return reply(405, headers, { ok: false, error: 'Method not allowed' });
  }
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const action = s(b.action);
  const notActive = async function(){ C.noteBad(ip); const w = C.MIN_FAIL_MS + Math.floor(Math.random() * 60) - (Date.now() - t0); if (w > 0) await sleep(w); return reply(404, headers, { ok: false, error: 'This link is not active — call GrayCo ' + C.OFFICE_PHONE }); };
  try {
    if (action === 'inspect-accept') {
      if (C.limited(ip)) return reply(429, headers, { ok: false, error: 'Too many tries.' });
      const r = await G.inspectAccept(s(b.code), b); if (!r.ok) C.noteBad(ip);
      return reply(r.ok ? 200 : 404, headers, r);
    }

    /* ── STAFF ── */
    if (STAFF.indexOf(action) >= 0) {
      const who = await C.gcStaffAuth(event);
      if (!who.ok) return reply(who.statusCode || 401, headers, { ok: false, error: who.error });
      const admin = low(who.role) === 'admin';
      const data = await C.crmData(true);
      if (action === 'docs-list') return reply(200, headers, { ok: true, docs: (await G.companyDocs(admin)).map(function(d){ return Object.assign(G.docOut(d), { current: d.current !== false && !d.removed, removed: !!d.removed, by: d.by, name: d.name }); }), kinds: G.DOC_KINDS });
      if (action === 'docs-url') { const d = (await G.companyDocs(true)).find(function(x){ return x.id === s(b.id); }); if (!d) return reply(404, headers, { ok: false, error: 'No such document.' }); return reply(200, headers, { ok: true, url: await G.docSigned(d.ref), name: d.name }); }
      if (action === 'gcp-contacts-all') return reply(200, headers, { ok: true, contacts: G.activeGcContacts(data) });
      if (action === 'gcp-signed') {
        const all = {}; const st = await (async function(){ const out = []; const jobs = await require('./bid-inbox.js')._lib.kvGet(G.K_JOBS); Object.keys(jobs || {}).forEach(function(pid){ (jobs[pid].cos || []).forEach(function(c){ if (c.status === 'signed' && !c.importedAt) out.push(Object.assign({ pid: pid }, G.coOut(c), { amount: c.amount })); }); }); return out; })();
        return reply(200, headers, { ok: true, signed: st });
      }
      if (action === 'docs-add' || action === 'docs-remove') {
        if (!admin) return reply(403, headers, { ok: false, error: 'Only an admin can change the company documents.' });
        const r = action === 'docs-add' ? await G.docAdd(data, b, who) : await G.docRemove(b, who);
        return reply(r.code, headers, r.out);
      }
      const pid = s(b.projectId);
      if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(pid)) return reply(400, headers, { ok: false, error: 'Open a job first.' });
      const p = C.findProject(data, pid);
      if (!p) return reply(404, headers, { ok: false, error: 'That job is not in the cloud yet — wait a minute and try again.' });
      if (action === 'gcp-state') {
        const link = await G.linkFor(pid);
        const view = await G.gcView(data, p, { staff: true });
        return reply(200, headers, { ok: true, isGcJob: G.isGcJob(data, p), company: view.company, contacts: view.contacts, state: view.state, docs: view.docs,
          link: link ? { active: true, url: G.gcLink(link.token), lastViewed: link.lastViewed || null, at: link.at } : { active: false } });
      }
      if (action === 'gcp-link') {
        const op = s(b.op);
        if (op === 'revoke' || op === 'regenerate') await G.revokeLink(pid, who.email);
        if (op === 'revoke') return reply(200, headers, { ok: true, active: false });
        const tok = await G.createLink(pid, who.email);
        return reply(200, headers, { ok: true, active: true, url: G.gcLink(tok) });
      }
      if (action === 'gcp-send-link') {
        const list = G.contactsOf(data, p); if (!list.length) return reply(400, headers, { ok: false, error: 'Add the GC contacts on this job first.' });
        await G.createLink(pid, who.email);
        const pm = C.pmOf(data, p);
        const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.55"><p>Hello' + (G.gcCompany(data, p) ? ' ' + esc(G.gcCompany(data, p)) : '') + ',</p>'
          + '<p>Here is your project page for <b>' + esc(p.name) + '</b> with GrayCo Construction Services. It always has the schedule, updates and photos, our pay applications and change orders (approve or sign right there), RFIs, and our current certificate of insurance, W-9 and licenses to download.</p>'
          + '<p style="margin:18px 0"><a href="{{GC_PORTAL_LINK}}" style="background:#D4A017;color:#14202E;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Open the project page</a></p>'
          + '<p>Everything also comes to you by e-mail, so you never have to log in if you’d rather not. Bookmark the link — it works on any phone or computer.</p></div>';
        const ok = await C.queueApproval({ id: 'appr_gcp_link_' + pid + '_' + new Date().toISOString().slice(0, 10), kind: 'gcp_link', title: '🏗 GC project page → ' + list[0].email, pid: pid, jobName: p.name, pm: pm,
          to: list[0].email, channel: 'email', subject: 'Your GrayCo project page — ' + (p.name || ''), html: html, meta: { gcp: 'link', pid: pid, cc: list.slice(1, 5).map(function(x){ return x.email; }) } });
        return reply(200, headers, { ok: true, queued: !!ok });
      }
      const fn = { 'gcp-payapp-add': function(){ return G.payappAdd(data, p, b, who); }, 'gcp-payapp-status': function(){ return G.payappStatus(p, b, who); }, 'gcp-co-price': function(){ return G.coPrice(data, p, b, who); },
        'gcp-co-void': function(){ return G.coVoid(p, b, who); }, 'gcp-co-imported': function(){ return G.coImported(p, b, who); }, 'gcp-rfi-new': function(){ return G.rfiNew(data, p, b, who); },
        'gcp-rfi-answer': function(){ return G.rfiAnswer(p, b, (who.name || who.email) + ' (typed in by GrayCo)', 'staff'); } }[action];
      const r = await fn();
      return reply(r.code, headers, r.out);
    }

    /* ── PUBLIC: a GC link ── */
    if (GCPUB.indexOf(action) >= 0) {
      if (C.limited(ip)) { await sleep(C.MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries. Please call GrayCo ' + C.OFFICE_PHONE + '.' }); }
      const tok = s(C.gcHeader(event, 'x-gc-token') || b.g);
      const row = await G.linkByToken(tok);
      if (!row) return notActive();
      const data = await C.crmData(false), p = C.findProject(data, row.pid);
      if (!p) return notActive();
      if (action === 'gc-view') { const v = await G.gcView(data, p); if (b.preview !== true) await G.touchLink(row.token); return reply(200, headers, v); }
      if (action === 'gc-photos') {
        const recs = await C.grayCoRecords(), hide = C.ccHidden(recs), ccId = C.ccIdOf(p);
        const cc = (ccId ? await C.ccPhotos(ccId) : []).filter(function(x){ return !hide[String(x.id).replace(/^cc_/, '')]; });
        const list = (await C.grayCoPhotos(p.id, recs || [])).concat(cc).sort(function(a, x){ return a.at < x.at ? 1 : -1; });
        return reply(200, headers, { ok: true, photos: list });
      }
      if (action === 'gc-doc') {
        const d = (await G.companyDocs()).find(function(x){ return x.id === s(b.id); });
        if (!d) return reply(404, headers, { ok: false, error: 'That document is not available.' });
        return reply(200, headers, { ok: true, url: await G.docSigned(d.ref), name: d.name || d.title });
      }
      if (action === 'gc-payapp-file') {
        const st = await G.jobState(p.id), pa = st.payapps.find(function(x){ return x.id === s(b.id) && x.ref && !/void|draft|waiting/.test(x.status); });
        if (!pa) return reply(404, headers, { ok: false, error: 'That pay app has no PDF.' });
        return reply(200, headers, { ok: true, url: await G.docSigned(pa.ref), name: pa.fileName || ('Pay app ' + pa.number + '.pdf') });
      }
      const r = action === 'gc-approve-pay' ? await G.gcApprovePay(data, p, b, ip) : action === 'gc-co-request' ? await G.gcRequestCo(data, p, b) : action === 'gc-co-sign' ? await G.gcSignCo(data, p, b, ip)
        : await G.rfiAnswer(p, b, clip(s(b.name).replace(/[<>]/g, ''), 80) ? clip(s(b.name).replace(/[<>]/g, ''), 80) + ' (GC)' : 'The GC', 'portal');
      if (action === 'gc-rfi-answer' && r.code === 200) {
        try { const pm = C.pmOf(data, p); const to = pm && pm.email ? [pm.email] : await G.staffEmails(data, 'admins');
          const html = '<p><b>' + esc(r.out.rfi.answeredBy) + '</b> answered <b>RFI #' + esc(r.out.rfi.number) + ' — ' + esc(r.out.rfi.subject) + '</b> on ' + esc(p.name) + ':</p><p>' + esc(r.out.rfi.answer).replace(/\n/g, '<br>') + '</p>';
          const k = s(process.env.RESEND_API_KEY); if (k && process.env.PORTAL_MAIL_OFF !== '1') await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to: to, subject: require('./_lib/mailtag.js').tag('💬 RFI #' + r.out.rfi.number + ' answered — ' + (p.name || ''), to, 'gc portal'), html: html }) });
        } catch (e) {}
      }
      return reply(r.code, headers, r.out);
    }

    /* ── PUBLIC: a customer's portal link ── */
    if (CUST.indexOf(action) >= 0) {
      if (C.limited(ip)) { await sleep(C.MIN_FAIL_MS); return reply(429, headers, { ok: false, error: 'Too many tries.' }); }
      const token = s(C.gcHeader(event, 'x-portal-token') || b.t), sess = s(C.gcHeader(event, 'x-portal-session'));
      let row = null;
      if (!C.TOKEN_RE.test(token) && C.TOKEN_RE.test(sess)) row = await C.sessionRow(sess, s(b.projectId)).catch(function(){ return null; });
      else if (C.TOKEN_RE.test(token)) row = await C.tokenRow(token).catch(function(){ return null; });
      if (!row || row.revoked === true) return notActive();
      const data = await C.crmData(false), p = C.findProject(data, row.project_id);
      if (!p) return notActive();
      if (action === 'cust-extras') return reply(200, headers, await G.custExtras(data, p));
      if (action === 'cust-checkin') { if (b.preview === true) return reply(200, headers, { ok: true, preview: true }); const r = await G.custCheckin(data, p, b, ip); return reply(r.code, headers, r.out); }
      const ex = await G.custExtras(data, p);
      if (!ex.registry.show) return reply(404, headers, { ok: false, error: 'Your warranty registry is ready when the job is finished.' });
      const pdf = await G.registryPdf(data, p);
      return reply(200, headers, { ok: true, filename: 'GrayCo warranty registry - ' + clip(s(p.name).replace(/[^A-Za-z0-9 .,&-]/g, ''), 60) + '.pdf', pdf: pdf.toString('base64') });
    }
    return reply(400, headers, { ok: false, error: 'Bad request' });
  } catch (e) {
    return reply(500, headers, { ok: false, error: 'The GC portal hit a problem: ' + clip(e && e.message || e, 140) });
  }
};
exports._G = G;
