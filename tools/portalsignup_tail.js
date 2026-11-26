/* __GC_PATCH_PORTALSIGNUP__ (patch PORTALSIGNUP, owner 11/23: "also be able to tell customers to sign up on portal.grayco-cs.com and their
   name will match to what we already have in our CRM system for their job address etc and that's a way they can sign up or we send them a
   link too, let them choose customer, subcontractor, supplier and other as choices"). The CRM's side (server: netlify/functions/portal-access.js
   s-su-* + _lib/portalsignup.js):
   1. 🔗 Portal sign-up link on the job's 🏠 Portal card (desk and Field): a signed link for THIS job (expires in 30 days) — 📋 Copy · ✉️ E-mail
      it · 💬 Text it (the person's own mail / text app; nothing is sent by itself). A customer who signs up through it, confirms their e-mail
      and whose name matches the job's customer is let in to this job; otherwise it is a ✅ Approvals card. The strip also lists this job's
      portal sign-ups (waiting / let in / removed) with 🗄 Remove access (office / admin; archived — who and when are kept).
   2. ✅ Approvals card "<name> asks for portal access to <job> (<address>) — matched by name + address" (kind portal_signup): the evidence
      (what they typed, the job, what matched) and ✅ Approve — let them in · ↪ Not this job (office / admin: pick another job, or ✖ Deny).
      Who may decide is the approval list's own rule (the job's PM, the office, an admin) — checked on the server.
   (PORTALJOBS2: all the offered jobs start ticked — the customer's jobs and every job the sign-up matched by company e-mail / name.)
   3. patch PORTALJOBS (owner 11/26, a customer with several jobs): the card lists the customer's other jobs — ☑ this job (always),
      ☐ All of <customer>'s jobs (N) and one tick per job; ✅ Approve grants every ticked job. The office To-Do "no job match" gets
      🔗 Match to jobs… (office / admin): find and tick one or several jobs → they are let in to those. A person always picks.
   No pop-ups on the card: everything opens inline. Console: _gcPortalSignup.state(). */
(function(){
'use strict';
var W = window, D = document; if (W.__gcPortalSignupUi) return; W.__gcPortalSignupUi = 1;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || setTimeout;
var FN = '/.netlify/functions/portal-access';
var JOB = {}, OPEN = {}, NOTE = {}, CARD = {}, PICK = {}, ARM = {}, TICK = {};   /* TICK[aq] = { pid: 1 } the customer's other jobs ticked (PORTALJOBS) */
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[PORTALSIGNUP]', e && e.message || e); } catch (x) {} }
function token(){
  var A = W.__GC_AUTH__;
  if (!A || typeof A.fresh !== 'function') return Promise.reject(new Error('Sign in to the CRM first.'));
  return Promise.resolve(A.fresh()).then(function(x){ if (!x || !x.access_token) throw new Error('Sign in to the CRM first.'); return x.access_token; });
}
function api(body){
  return token().then(function(t){ return W.fetch(FN, { method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { error: 'The server answered ' + r.status + '.' }; } if (!j.ok && !j.error) j.error = 'The server answered ' + r.status + '.'; return j; }); }, function(e){ return { ok: false, error: e.message }; });
}
function copy(text){
  try { if (navigator.clipboard && W.isSecureContext) return navigator.clipboard.writeText(text).then(function(){ return true; }, function(){ return fb(); }); } catch (e) {}
  return Promise.resolve(fb());
  function fb(){ try { var ta = D.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:-100px;opacity:0'; D.body.appendChild(ta); ta.select(); var ok = D.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
}
function css(){
  if (D.getElementById('gcps-css')) return;
  var st = D.createElement('style'); st.id = 'gcps-css';
  st.textContent = '._ap2Card[data-id^="appr_psu_"] ._ap2Yes,._ap2Card[data-id^="appr_psu_"] ._ap2No,._ap2Card[data-id^="appr_psu_"] ._ap2Prev,'
    + '._apCard[data-id^="appr_psu_"] ._apApprove,._apCard[data-id^="appr_psu_"] ._apEditBtn,._apCard[data-id^="appr_psu_"] ._apRejBtn,'
    + '.apx-row[data-k^="ap2:appr_psu_"] [data-apx-act$="|approve"],.apx-row[data-k^="ap2:appr_psu_"] [data-apx-act$="|deny"],.apx-row[data-k^="ap2:appr_psu_"] [data-apx-act$="|edit"],.apx-row[data-k^="ap2:appr_psu_"] [data-apx-act$="|sendedit"]{display:none!important}'
    + '.gcps-strip{margin-top:8px;border-top:1px dashed #E2DCCD;padding-top:8px;font:14px Inter,-apple-system,Arial,sans-serif;color:#14202E;text-align:left}'
    + '.gcps-strip button,.gcps-card button{min-height:44px;border-radius:10px;font:700 14px Inter,-apple-system,Arial,sans-serif;cursor:pointer;padding:6px 12px;border:1px solid #1A3A5F;background:#fff;color:#1A3A5F}'
    + '.gcps-strip a.gcps-a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:10px;font:700 14px Inter,-apple-system,Arial,sans-serif;padding:6px 12px;border:1px solid #1A3A5F;background:#fff;color:#1A3A5F;text-decoration:none;box-sizing:border-box}'
    + '.gcps-bs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.gcps-bs>*{flex:1 1 130px}'
    + '.gcps-url{width:100%;box-sizing:border-box;min-height:40px;border:1px solid #C9C2B2;border-radius:8px;padding:6px 8px;font:13px ui-monospace,Menlo,monospace;color:#14202E;background:#FAF8F3;margin-top:8px}'
    + '.gcps-m{font-size:12.5px;color:#55626F;margin-top:6px;line-height:1.4}.gcps-n{margin-top:6px;font-weight:700;color:#0f766e}.gcps-n.bad{color:#b91c1c}'
    + '.gcps-row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between;border-top:1px solid #EFEAE0;padding:6px 0}.gcps-row>div{min-width:0;flex:1 1 200px;overflow-wrap:anywhere}'
    + '.gcps-card{margin-top:8px;border-top:1px dashed #cbd5e1;padding-top:8px;font:14px Inter,-apple-system,Arial,sans-serif;color:#0f172a;text-align:left;cursor:default}'
    + '.gcps-card dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;margin:0 0 8px}.gcps-card dt{color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding-top:2px}.gcps-card dd{margin:0;overflow-wrap:anywhere}'
    + '.gcps-card .ok{background:#16a34a;color:#fff;border-color:#16a34a}.gcps-card .no{color:#b91c1c;border-color:#b91c1c}'
    + '.gcps-pick{display:flex;flex-direction:column;gap:6px;margin-top:8px}.gcps-pick input{min-height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:6px 10px;font:15px Arial;box-sizing:border-box;width:100%}'
    + '.gcps-res{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto}.gcps-res button{text-align:left;font-weight:600}';
  (D.head || D.documentElement).appendChild(st);
}
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects).filter(function(p){ return p && p.id && !/lost|dead|cancel/.test(low(p.status)); }); }
function poL(v){ v = s(v); return !v ? '' : /^po\b/i.test(v) ? v : 'PO ' + v; }
function when(iso){ var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

/* ══ 1. the job's 🏠 Portal card: 🔗 Portal sign-up link ══ */
var ST_LABEL = { unconfirmed: '✉️ confirming their e-mail', confirmed: 'confirmed', approval: '⏳ waiting on ✅ Approvals', granted: '🟢 let in', in: '🟢 signed in (e-mail on the job)', denied: '⛔ not approved', removed: '🗄 access removed', todo: '📝 office To-Do' };
function stripHtml(pid){
  var j = JOB[pid], h = '<button type="button" data-gcps="link" aria-expanded="' + (OPEN[pid] ? 'true' : 'false') + '">🔗 Portal sign-up link</button>';
  if (!OPEN[pid]) return h;
  if (!j) return h + '<div class="gcps-m">Making the link…</div>';
  if (j.error) return h + '<div class="gcps-n bad">⚠ ' + esc(j.error) + '</div>';
  var mail = 'mailto:' + encodeURIComponent(j.email || '').replace(/%40/g, '@') + '?subject=' + encodeURIComponent('Sign up for your GrayCo Portal') + '&body=' + encodeURIComponent(j.message);
  var sms = 'sms:' + s(j.phone).replace(/[^0-9+]/g, '') + '?&body=' + encodeURIComponent(j.message);
  h += '<input class="gcps-url" data-gcps-url readonly value="' + esc(j.url) + '" aria-label="Portal sign-up link">'
    + '<div class="gcps-bs"><button type="button" data-gcps="copy">📋 Copy link</button><a class="gcps-a" data-gcps="mail" href="' + esc(mail) + '">✉️ E-mail it</a><a class="gcps-a" data-gcps="sms" href="' + esc(sms) + '">💬 Text it</a></div>'
    + '<div class="gcps-m">For this job only · works until ' + esc(when(j.expires)) + '. They confirm their e-mail; if their name matches this job\'s customer they are let in, otherwise it comes to ✅ Approvals. Nothing is sent unless you send it.'
    + (j.linkOn ? '' : ' <b>The job\'s portal link is off</b> — turn it on so they can get in.') + '</div>';
  var L = arr(j.signups);
  if (L.length) {
    h += '<div style="margin-top:8px;font-weight:800;font-size:12px;color:#8A5A00">PORTAL SIGN-UPS FOR THIS JOB</div>';
    L.forEach(function(x){
      h += '<div class="gcps-row" data-gcps-su="' + esc(x.id) + '"><div><b>' + esc(x.name) + '</b> <span class="gcps-m">' + esc([x.email, x.phone].filter(Boolean).join(' · ')) + '</span><div class="gcps-m">' + esc(ST_LABEL[x.status] || x.status) + (x.by ? ' · by ' + esc(x.by) : '') + (x.removedBy ? ' · removed by ' + esc(x.removedBy) : '') + (x.at ? ' · ' + esc(when(x.at)) : '') + '</div></div>'
        + (x.status === 'granted' && j.canRemove ? '<button type="button" data-gcps="remove" data-id="' + esc(x.id) + '">' + (ARM['rm' + x.id] ? 'Tap again to remove' : '🗄 Remove access') + '</button>' : '') + '</div>';
    });
  }
  if (NOTE[pid]) h += '<div class="gcps-n' + (/^⚠/.test(NOTE[pid]) ? ' bad' : '') + '">' + esc(NOTE[pid]) + '</div>';
  return h;
}
function paintStrip(el, pid){ var st = el.querySelector(':scope > .gcps-strip'); if (!st) return; var sig = JSON.stringify([OPEN[pid], JOB[pid], NOTE[pid], ARM]); if (st.__sig === sig) return; st.__sig = sig; st.innerHTML = stripHtml(pid); }
function loadJob(pid){ JOB[pid] = null; repaint(pid); api({ action: 's-su-link', projectId: pid }).then(function(j){ JOB[pid] = j.ok ? j : { error: j.error }; repaint(pid); }); }
function repaint(pid){ D.querySelectorAll('.gcq-card[data-pid]').forEach(function(el){ if (el.getAttribute('data-pid') === String(pid)) paintStrip(el, pid); }); }
function decorateJobs(){
  D.querySelectorAll('.gcq-card[data-pid]').forEach(function(el){
    var pid = el.getAttribute('data-pid'); if (!pid) return;
    var st = el.querySelector(':scope > .gcps-strip');
    if (!st) { css(); st = D.createElement('div'); st.className = 'gcps-strip'; st.setAttribute('data-gcps-pid', pid); el.appendChild(st); wireStrip(st); }
    paintStrip(el, pid);
  });
}
function wireStrip(st){
  st.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-gcps]'); if (!b) return;
    var pid = st.getAttribute('data-gcps-pid'), a = b.getAttribute('data-gcps');
    e.stopPropagation();
    if (a === 'link') { OPEN[pid] = !OPEN[pid]; NOTE[pid] = ''; if (OPEN[pid]) loadJob(pid); else repaint(pid); return; }
    if (a === 'copy' && JOB[pid] && JOB[pid].url) { copy(JOB[pid].url).then(function(ok){ NOTE[pid] = ok ? '✓ Link copied — paste it in a text or e-mail.' : '⚠ Could not copy — select the link above.'; repaint(pid); }); return; }
    if (a === 'mail' && JOB[pid] && !JOB[pid].email) { NOTE[pid] = 'No customer e-mail on the job — type their address in your mail app.'; repaint(pid); return; }
    if (a === 'sms' && JOB[pid] && !JOB[pid].phone) { NOTE[pid] = 'No customer phone on the job — type their number in your text app.'; repaint(pid); return; }
    if (a === 'remove') {
      var id = b.getAttribute('data-id');
      if (!ARM['rm' + id]) { ARM['rm' + id] = 1; repaint(pid); ST.call(W, function(){ delete ARM['rm' + id]; repaint(pid); }, 6000); return; }
      delete ARM['rm' + id]; NOTE[pid] = 'Removing…'; repaint(pid);
      api({ action: 's-su-remove', id: id }).then(function(j){ NOTE[pid] = j.ok ? '🗄 Access removed (kept on record).' : '⚠ ' + j.error; api({ action: 's-su-link', projectId: pid }).then(function(x){ if (x.ok) JOB[pid] = x; repaint(pid); }); });
    }
  });
}

/* ══ 2. the ✅ Approvals card ══ */
/* patch PORTALJOBS2: until the approver changes them, ALL the jobs the card offers are ticked (one tap lets them in to all) */
function ticks(aq){ if (TICK[aq]) return TICK[aq]; var d = CARD[aq] && CARD[aq].d, o = {}; arr(d && d.related).forEach(function(r){ o[r.id] = 1; }); return o; }
var HOW = { name: 'Name', address: 'Address', po: 'PO / job #', email: 'E-mail', phone: 'Phone', domain: 'Company e-mail' };
function hosts(){
  var out = [];
  D.querySelectorAll('._ap2Card[data-id^="appr_psu_"],._apCard[data-id^="appr_psu_"]').forEach(function(el){ out.push({ el: el, aq: el.getAttribute('data-id') }); });
  D.querySelectorAll('.apx-row[data-k^="ap2:appr_psu_"]').forEach(function(el){ out.push({ el: el, aq: el.getAttribute('data-k').slice(4) }); });
  return out;
}
function loadCard(aq, force){
  if (CARD[aq] && (CARD[aq].busy || (!force && Date.now() - CARD[aq].at < 60e3))) return;
  CARD[aq] = { busy: 1, at: Date.now() };
  api({ action: 's-su-get', id: aq }).then(function(j){ CARD[aq] = { at: Date.now(), d: j.ok ? j : null, err: j.ok ? '' : j.error }; decorateCards(); });
}
function cardHtml(aq){
  var c = CARD[aq], d = c && c.d;
  if (!c || c.busy) return '<div class="gcps-m">Loading the sign-up…</div>';
  if (!d) return '<div class="gcps-n bad">⚠ ' + esc(c.err || 'Could not load the sign-up.') + '</div>';
  var u = d.signup, j = d.job || {}, h = '<dl>';
  var row = function(k, v){ if (s(v)) h += '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>'; };
  row('They typed', [u.name, u.email + ' (confirmed)', u.phone ? u.phone + ' (not confirmed)' : '', (arr(u.addresses).length ? u.addresses : [u.address]).map(function(a, i){ return i === 0 ? [a, u.zip].filter(Boolean).join(' ') : a; }).join(' / '), u.po ? 'PO ' + u.po : '', u.contractName ? 'contract: ' + u.contractName : ''].filter(Boolean).join(' · '));
  row('Job', [poL(j.po), j.name, j.address, j.client ? 'customer: ' + j.client : ''].filter(Boolean).join(' · '));
  arr(d.evidence).forEach(function(w){ row('✓ ' + (HOW[w.k] || w.k), '"' + w.typed + '" = "' + w.crm + '"' + (w.note ? ' (' + w.note + ')' : '')); });
  if (u.link && u.link.pid) row('Link', 'came through GrayCo\'s 🔗 sign-up link for this job');
  if (u.link && u.link.bad) row('Link', 'a ' + u.link.bad + ' sign-up link (ignored)');
  h += '</dl>';
  if (u.status !== 'approval') { h += '<div class="gcps-n">' + esc(ST_LABEL[u.status] || u.status) + '</div>'; return h + (NOTE[aq] ? '<div class="gcps-n">' + esc(NOTE[aq]) + '</div>' : ''); }
  var rel = arr(d.related), tk = ticks(aq), nT = rel.filter(function(r){ return tk[r.id]; }).length;
  if (rel.length) {   /* patch PORTALJOBS: which of the customer's jobs they get */
    h += '<div class="gcps-jobs" style="margin:6px 0 2px"><div style="font-weight:800;font-size:12px;color:#8A5A00">LET THEM IN TO</div>'
      + '<label style="display:flex;gap:8px;align-items:center;min-height:40px"><input type="checkbox" checked disabled style="width:20px;height:20px"> <span><b>This job</b> — ' + esc(j.name) + '</span></label>'
      + '<label style="display:flex;gap:8px;align-items:center;min-height:40px"><input type="checkbox" data-gcps-all' + (nT === rel.length ? ' checked' : '') + ' style="width:20px;height:20px"> <span><b>All of ' + esc(d.customer || 'the customer') + '\'s jobs (' + (rel.length + 1) + ')</b></span></label>'
      + rel.map(function(r){ return '<label style="display:flex;gap:8px;align-items:center;min-height:40px;margin-left:22px"><input type="checkbox" data-gcps-tick="' + esc(r.id) + '"' + (tk[r.id] ? ' checked' : '') + ' style="width:20px;height:20px"> <span>' + esc([poL(r.po), r.name, r.address].filter(Boolean).join(' · ')) + '</span></label>'; }).join('') + '</div>';
  }
  h += '<div class="gcps-bs"><button type="button" class="ok" data-gcps-c="approve">✅ Approve — let them in' + (nT ? ' (' + (nT + 1) + ' jobs)' : '') + '</button><button type="button" data-gcps-c="other" aria-expanded="' + (PICK[aq] ? 'true' : 'false') + '">↪ Not this job</button></div>'
    + '<div class="gcps-m">Approve adds their e-mail and mobile as an extra portal contact on this job' + (rel.length ? ' and every job you ticked' : '') + ' (nothing on the job or the customer record is changed) and e-mails them that they are connected.</div>';
  if (PICK[aq]) {
    var qv = s(PICK[aq].q), res = [];
    if (qv.length >= 2) { var ql = low(qv); res = projects().filter(function(p){ return String(p.id) !== String(j.id) && low([p.name, p.address, p.client, p.autoPO, p.po].join(' ')).indexOf(ql) > -1; }).slice(0, 12); }
    h += '<div class="gcps-pick">' + (d.canMove ? '<input type="search" data-gcps-q placeholder="Find the right job: name, address, customer or PO" value="' + esc(qv) + '">'
      + '<div class="gcps-res">' + res.map(function(p){ return '<button type="button" data-gcps-c="move" data-pid="' + esc(p.id) + '">' + esc([poL(p.autoPO || p.po), p.name, p.address, p.client].filter(Boolean).join(' · ')) + '</button>'; }).join('') + (qv.length >= 2 && !res.length ? '<div class="gcps-m">No job matches “' + esc(qv) + '”.</div>' : '') + '</div>'
      : '<div class="gcps-m">The office or an admin picks another job.</div>')
      + '<button type="button" class="no" data-gcps-c="deny">' + (ARM['dn' + aq] ? 'Tap again to deny (no access)' : '✖ Deny — no access') + '</button></div>';
  }
  if (NOTE[aq]) h += '<div class="gcps-n' + (/^⚠/.test(NOTE[aq]) ? ' bad' : '') + '">' + esc(NOTE[aq]) + '</div>';
  return h;
}
function decorateCards(){
  try {
    var hs = hosts(); if (!hs.length) return; css();
    hs.forEach(function(x){
      var blk = x.el.querySelector(':scope > .gcps-card');
      loadCard(x.aq);
      var sig = JSON.stringify([CARD[x.aq] && CARD[x.aq].at, CARD[x.aq] && CARD[x.aq].busy, PICK[x.aq], NOTE[x.aq], ARM['dn' + x.aq], TICK[x.aq]]);
      if (blk && blk.__sig === sig) return;
      var focused = blk && D.activeElement && blk.contains(D.activeElement) && D.activeElement.hasAttribute('data-gcps-q');
      if (!blk) { blk = D.createElement('div'); blk.className = 'gcps-card'; blk.setAttribute('data-gcps-aq', x.aq); x.el.appendChild(blk); wireCard(blk, x.aq); }
      blk.innerHTML = cardHtml(x.aq); blk.__sig = sig;
      if (focused) { var qi = blk.querySelector('[data-gcps-q]'); if (qi) { qi.focus(); try { qi.setSelectionRange(qi.value.length, qi.value.length); } catch (e) {} } }
    });
  } catch (e) { warn(e); }
}
function after(aq, j, okMsg){
  NOTE[aq] = j.ok ? (j.scheduled ? '⏰ Approved — it goes at 7:00 AM (customers get nothing 7 PM–7 AM).' : okMsg) : '⚠ ' + (j.error || 'Try again.');
  PICK[aq] = j.ok ? null : PICK[aq];
  loadCard(aq, true);
  try { if (W._gcApprovalsRefresh) ST.call(W, function(){ Promise.resolve(W._gcApprovalsRefresh()).then(decorateCards, function(){}); }, 400); } catch (e) {}
}
function wireCard(blk, aq){
  blk.addEventListener('click', function(e){
    e.stopPropagation();   /* the card around it opens its preview on a tap — not for these */
    var b = e.target.closest && e.target.closest('[data-gcps-c]'); if (!b) return;
    var a = b.getAttribute('data-gcps-c');
    if (a === 'approve') { var tk0 = ticks(aq), pids = Object.keys(tk0).filter(function(k){ return tk0[k]; }); NOTE[aq] = 'Approving…'; decorateCards(); return api({ action: 's-su-decide', id: aq, op: 'approve', pids: pids }).then(function(j){ after(aq, j, '✅ Approved' + (pids.length ? ' for ' + (pids.length + 1) + ' jobs' : '') + ' — they can sign in now; their "you are connected" e-mail went out.'); }); }
    if (a === 'other') { PICK[aq] = PICK[aq] ? null : { q: '' }; NOTE[aq] = ''; return decorateCards(); }
    if (a === 'move') { NOTE[aq] = 'Linking to that job…'; decorateCards(); return api({ action: 's-su-decide', id: aq, op: 'move', pid: b.getAttribute('data-pid') }).then(function(j){ after(aq, j, '✅ Linked to the job you picked — they can sign in now.'); }); }
    if (a === 'deny') {
      if (!ARM['dn' + aq]) { ARM['dn' + aq] = 1; decorateCards(); ST.call(W, function(){ delete ARM['dn' + aq]; decorateCards(); }, 6000); return; }
      delete ARM['dn' + aq]; NOTE[aq] = 'Recording…'; decorateCards();
      return api({ action: 's-su-decide', id: aq, op: 'deny' }).then(function(j){ after(aq, j, '✖ Denied — no access; nothing was sent to them.'); });
    }
  });
  blk.addEventListener('input', function(e){ if (e.target && e.target.hasAttribute('data-gcps-q')) { PICK[aq] = { q: e.target.value }; decorateCards(); } });
  blk.addEventListener('change', function(e){   /* patch PORTALJOBS: the ticks */
    var t = e.target; if (!t) return; var d = CARD[aq] && CARD[aq].d; if (!d) return;
    if (t.hasAttribute('data-gcps-all')) { var o = {}; if (t.checked) arr(d.related).forEach(function(r){ o[r.id] = 1; }); TICK[aq] = o; return decorateCards(); }
    if (t.hasAttribute('data-gcps-tick')) { var o2 = Object.assign({}, ticks(aq)); if (t.checked) o2[t.getAttribute('data-gcps-tick')] = 1; else delete o2[t.getAttribute('data-gcps-tick')]; TICK[aq] = o2; decorateCards(); }
  });
  blk.addEventListener('keydown', function(e){ e.stopPropagation(); });
}

/* ══ 3. patch PORTALJOBS: 🔗 Match to jobs… (the office To-Do "Portal sign-up — no job match"; office / admin) ══ */
W._gcPortalSignupMatch = function(id){
  css(); var old = D.getElementById('gcps-match'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gcps-match'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100250;background:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
  var st = { d: null, err: '', q: '', sel: {}, busy: false, msg: '' };
  var box = D.createElement('div'); box.className = 'gcps-card'; box.style.cssText = 'background:#fff;border-radius:14px;max-width:560px;width:100%;padding:16px;box-sizing:border-box;margin-top:24px';
  ov.appendChild(box); D.body.appendChild(ov);
  function paint(){
    var h = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:17px">🔗 Match to jobs</b><button type="button" data-m="x">✕ Close</button></div>';
    if (!st.d) h += st.err ? '<div class="gcps-n bad">⚠ ' + esc(st.err) + '</div>' : '<div class="gcps-m">Loading the sign-up…</div>';
    else {
      var u = st.d.signup;
      h += '<dl style="margin-top:8px"><dt>They typed</dt><dd>' + esc([u.name, u.email + ' (confirmed)', u.phone ? u.phone + ' (not confirmed)' : '', [u.address, u.zip].filter(Boolean).join(' '), u.po ? 'PO ' + u.po : '', u.contractName ? 'contract: ' + u.contractName : ''].filter(Boolean).join(' · ')) + '</dd></dl>';
      if (!st.d.canMatch) h += '<div class="gcps-n">' + esc(u.status === 'granted' ? '🟢 Already let in.' : 'Only the office or an admin matches a sign-up to jobs, while it is waiting.') + '</div>';
      else {
        var ql = low(st.q), sel = Object.keys(st.sel), res = ql.length >= 2 ? projects().filter(function(p){ return low([p.name, p.address, p.client, p.autoPO, p.po].join(' ')).indexOf(ql) > -1; }).slice(0, 30) : [];
        h += '<div class="gcps-pick"><input type="search" data-m-q placeholder="Find their job(s): customer, name, address or PO" value="' + esc(st.q) + '">';
        if (ql.length >= 2 && res.length > 1) h += '<button type="button" data-m="all">☑ Tick all ' + res.length + ' shown</button>';
        h += '<div class="gcps-res">' + res.map(function(p){ return '<label style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" data-m-pid="' + esc(p.id) + '"' + (st.sel[p.id] ? ' checked' : '') + ' style="width:20px;height:20px"> <span>' + esc([poL(p.autoPO || p.po), p.name, p.address, p.client].filter(Boolean).join(' · ')) + '</span></label>'; }).join('')
          + (ql.length >= 2 && !res.length ? '<div class="gcps-m">No job matches “' + esc(st.q) + '”.</div>' : '') + '</div>';
        if (sel.length) h += '<div class="gcps-m"><b>Picked (' + sel.length + '):</b> ' + esc(sel.map(function(pid){ var p = projects().find(function(x){ return String(x.id) === pid; }); return p ? p.name : pid; }).join(' · ')) + '</div>';
        h += '<button type="button" class="ok" data-m="go"' + (sel.length && !st.busy ? '' : ' disabled') + '>' + (st.busy ? 'Matching…' : '🔗 Let them in to ' + sel.length + ' job' + (sel.length === 1 ? '' : 's')) + '</button>'
          + '<div class="gcps-m">Their e-mail and mobile become an extra portal contact on each job you pick (nothing on the jobs or the customer is changed) and they get a "you are connected" e-mail.</div></div>';
      }
    }
    if (st.msg) h += '<div class="gcps-n' + (/^⚠/.test(st.msg) ? ' bad' : '') + '">' + esc(st.msg) + '</div>';
    var f = D.activeElement && D.activeElement.hasAttribute && D.activeElement.hasAttribute('data-m-q');
    box.innerHTML = h;
    if (f) { var qi = box.querySelector('[data-m-q]'); if (qi) { qi.focus(); try { qi.setSelectionRange(qi.value.length, qi.value.length); } catch (e) {} } }
  }
  ov.addEventListener('click', function(e){
    if (e.target === ov) { ov.remove(); return; }
    var b = e.target.closest && e.target.closest('[data-m]'); if (!b) return; var a = b.getAttribute('data-m');
    if (a === 'x') { ov.remove(); return; }
    if (a === 'all') { [].forEach.call(box.querySelectorAll('[data-m-pid]'), function(x){ st.sel[x.getAttribute('data-m-pid')] = 1; }); return paint(); }
    if (a === 'go') { var pids = Object.keys(st.sel); if (!pids.length) return; st.busy = true; st.msg = ''; paint();
      api({ action: 's-su-match', id: id, pids: pids }).then(function(j){ st.busy = false; if (j.ok) { st.msg = '✅ Matched to ' + j.jobs + ' job' + (j.jobs === 1 ? '' : 's') + ' — they can sign in now; their "you are connected" e-mail went out.'; st.d.canMatch = false; st.d.signup.status = 'granted'; } else st.msg = '⚠ ' + (j.error || 'Try again.'); paint(); }); }
  });
  ov.addEventListener('input', function(e){ if (e.target && e.target.hasAttribute('data-m-q')) { st.q = e.target.value; paint(); } });
  ov.addEventListener('change', function(e){ var t = e.target; if (t && t.hasAttribute('data-m-pid')) { if (t.checked) st.sel[t.getAttribute('data-m-pid')] = 1; else delete st.sel[t.getAttribute('data-m-pid')]; paint(); } });
  ov.addEventListener('keydown', function(e){ e.stopPropagation(); if (e.key === 'Escape') ov.remove(); });
  paint();
  api({ action: 's-su-get', id: id }).then(function(j){ if (j.ok) { st.d = j; var u = j.signup || {}; st.q = s(u.contractName || u.name).split(/\s+/).slice(-1)[0] || ''; } else st.err = j.error; paint(); });
  return true;
};
function tick(){ try { decorateJobs(); } catch (e) { warn(e); } decorateCards(); }
var q = false;
try { new MutationObserver(function(){ if (q) return; q = true; Promise.resolve().then(function(){ q = false; tick(); }); }).observe(D.documentElement, { childList: true, subtree: true }); } catch (e) { warn(e); }
tick();
W._gcPortalSignup = { tick: tick, state: function(){ return { jobs: Object.keys(JOB).length, cards: Object.keys(CARD).length, open: OPEN }; } };
try { console.log('[GC] 🔗 Portal sign-up link + the sign-up ✅ Approvals card (patch PORTALSIGNUP) — _gcPortalSignup'); } catch (e) {}
})();
