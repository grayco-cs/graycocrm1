/* GrayCo customer portal — patch X9: "How did you hear about us?" (one tap) and 🛠 Maintenance plans.
   Everything goes through /.netlify/functions/portal-plus with the same link code (or the signed-in session) as the
   rest of the portal; the server checks every input. Both cards sit on Home, under "Your selections", and survive
   the page redrawing. Never on the sub portal. */
(function(){
'use strict';
if (window.__GC_PPLUS__) return; window.__GC_PPLUS__ = true;
var FN = '/.netlify/functions/portal-plus', OFFICE = '901-585-0944';
var token = '';
try { var m = /(?:^#|&)t=([A-Za-z0-9_-]{20,80})/.exec(location.hash || ''); if (m) token = m[1]; } catch (e) {}
try { if (!token) token = localStorage.getItem('gc_portal_t') || ''; } catch (e) {}
var PREVIEW = /(?:^#|&)p=1(?:&|$)/.test(location.hash || '');
function sess(){ try { return token ? '' : (localStorage.getItem('gc_portal_s') || ''); } catch (e) { return ''; } }
function pid(){ try { return String(window.PID || ''); } catch (e) { return ''; } }
var D = null, cards = [], started = false, lastPid = '', busy = false, pad = null, note = { heard: '', maint: '' }, open = {}, keep = { name: '', ok: false, who: '' };

function h(tag, attrs, kids){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    var v = attrs[k]; if (v == null || v === false) return;
    if (k === 'text') el.textContent = v;
    else if (k === 'on') Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); });
    else if ((k === 'href' || k === 'src') && !/^https:\/\//i.test(String(v))) return;
    else el.setAttribute(k, v === true ? '' : String(v));
  });
  (kids || []).forEach(function(c){ if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function usd(n){ n = Number(n) || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function dt(s){ var d = new Date(String(s).length === 10 ? s + 'T12:00:00' : s); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
function api(body){
  return fetch(FN, { method: 'POST', headers: sess() ? { 'Content-Type': 'application/json', 'x-portal-session': sess() } : { 'Content-Type': 'application/json', 'x-portal-token': token },
    body: JSON.stringify(Object.assign(PREVIEW ? { preview: true } : {}, sess() ? { projectId: pid() || undefined } : {}, body)), cache: 'no-store', credentials: 'omit' })
    .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { status: r.status, data: j || {} }; }); }, function(){ return { status: 0, data: { error: 'No connection — check your signal and try again.' } }; });
}
function load(){ return api({ action: 'view' }).then(function(r){ if (r.data && r.data.ok) { D = r.data; paint(); } }); }
function css(){
  if (document.getElementById('gc-pplus-css')) return;
  var st = document.createElement('style'); st.id = 'gc-pplus-css';
  st.textContent = '.pp-opts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.pp-opt{border:1px solid #E2DCCD;background:#fff;border-radius:999px;padding:9px 14px;font:600 14px Arial,sans-serif;color:#0F1D2F;cursor:pointer;min-height:44px}' +
    '.pp-opt.on{background:#0F1D2F;color:#fff;border-color:#0F1D2F}.pp-plan{border:1px solid #E2DCCD;border-radius:12px;padding:12px 14px;margin:10px 0;background:#fffdf7}.pp-plan b{display:block;font-size:16px}' +
    '.pp-plan p{margin:6px 0;font-size:14px;line-height:1.45}.pp-price{font:800 20px Arial,sans-serif;color:#0F1D2F;margin:6px 0}.pp-msg{font-size:14px;margin-top:8px;min-height:1em}.pp-in{width:100%;box-sizing:border-box;border:1px solid #cfc8b6;border-radius:8px;padding:10px;font-size:16px;margin:6px 0}' +
    '.pp-pad{display:block;width:100%;max-width:600px;aspect-ratio:3/1;border:1px dashed #b8b0a0;border-radius:8px;background:#fff;touch-action:none;margin:6px 0}.pp-st{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;background:#eef6ee;color:#1f6b33}.pp-st.now{background:#fff4e0;color:#8a5a00}' +
    '.pp-freq{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:#e8eef6;color:#0F1D2F;margin-top:4px}.pp-sub{font-size:15px;margin:16px 0 4px;color:#0F1D2F}';   /* patch MAINTPLANS */
  document.head.appendChild(st);
}
function makePad(){
  var cv = h('canvas', { class: 'pp-pad', width: '600', height: '200', 'aria-label': 'Draw your signature here' });
  var ctx = cv.getContext('2d'), strokes = [], cur = null;
  function pt(e){ var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(600, (e.clientX - r.left) * 600 / r.width)), Math.max(0, Math.min(200, (e.clientY - r.top) * 200 / r.height))]; }
  function redraw(){ ctx.clearRect(0, 0, 600, 200); ctx.strokeStyle = '#0F1D2F'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach(function(st){ ctx.beginPath(); st.forEach(function(p, i){ if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); if (st.length === 1) ctx.lineTo(st[0][0] + 1, st[0][1]); ctx.stroke(); }); }
  cv.addEventListener('pointerdown', function(e){ if (strokes.length >= 38) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} cur = [pt(e)]; strokes.push(cur); redraw(); });
  cv.addEventListener('pointermove', function(e){ if (!cur || cur.length >= 590) return; e.preventDefault(); var p = pt(e), l = cur[cur.length - 1]; if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) < 2) return; cur.push(p); redraw(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ cv.addEventListener(n, function(){ cur = null; }); });
  return { el: cv, strokes: function(){ return strokes.map(function(st){ return st.map(function(p){ return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; }); }); }, clear: function(){ strokes = []; cur = null; redraw(); } };
}

/* ── 🙋 How did you hear about us? (shown until answered, then a thank-you) ── */
function heardCard(){
  var H = D.heard || {}, c = h('section', { class: 'card', id: 'gcpp-heard' });
  if (H.answer && !note.heard) return null;
  c.appendChild(h('div', { class: 'row' }, [h('h2', { text: '🙋 How did you hear about us?' })]));
  if (note.heard) { c.appendChild(h('div', { class: 'pp-msg', text: note.heard })); return c; }
  c.appendChild(h('div', { class: 'muted', text: 'One tap helps a small local business a lot — thank you!' }));
  var g = h('div', { class: 'pp-opts', role: 'group', 'aria-label': 'How did you hear about us?' }), msg = h('div', { class: 'pp-msg', role: 'status' });
  var whoIn = h('input', { class: 'pp-in', type: 'text', maxlength: '80', placeholder: 'Who referred you? (so we can thank them)', id: 'gcpp-who' }); whoIn.value = keep.who; whoIn.addEventListener('input', function(){ keep.who = whoIn.value; });
  var whoBox = h('div', { hidden: true }, [whoIn, h('button', { type: 'button', class: 'btn gold', text: 'Send', on: { click: function(){ send('A friend or neighbor (referral)', whoIn.value); } } })]);
  function send(ans, who){
    if (busy || PREVIEW) { if (PREVIEW) msg.textContent = 'Preview — only the customer can answer.'; return; }
    busy = true; msg.textContent = 'Saving…';
    api({ action: 'heard', answer: ans, who: who || '' }).then(function(r){ busy = false; if (r.data && r.data.ok) { note.heard = '✓ Thank you!' + (r.data.who ? ' We will thank ' + r.data.who + ' too.' : ''); D.heard.answer = r.data.answer; paint(); setTimeout(function(){ note.heard = ''; paint(); }, 6000); } else msg.textContent = (r.data && r.data.error) || 'That did not work — please try again.'; });
  }
  (H.opts || []).forEach(function(o){
    g.appendChild(h('button', { type: 'button', class: 'pp-opt', 'data-heard': o, text: o, on: { click: function(){ if (/referral/i.test(o)) { whoBox.hidden = false; whoIn.focus(); return; } send(o); } } }));
  });
  c.appendChild(g); c.appendChild(whoBox); c.appendChild(msg);
  return c;
}

/* ── 🛠 Maintenance plans ── */
function maintCard(){
  var M = D.maint || {}; if (!M.offered) return null;
  var cs = M.contracts || [], byPlan = {}; cs.forEach(function(x){ if (!byPlan[x.planId] || byPlan[x.planId].status === 'declined') byPlan[x.planId] = x; });   /* an open plan wins over an old "No thanks" */
  var c = h('section', { class: 'card', id: 'gcpp-maint' });
  var signed = cs.filter(function(x){ return x.status === 'signed'; });
  /* patch MAINTPLANS: the plans GrayCo picked and priced for this home (and the ones signed) first, under "Your maintenance
     plans", each with its price and how often; the other plans below, to ask for a quote */
  var chosen = cs.filter(function(x){ return /^(requested|quoted|signed)$/.test(x.status); });
  c.appendChild(h('div', { class: 'row' }, [h('h2', { text: '🛠 Your maintenance plans' }), signed.length ? h('span', { class: 'pill ok', text: 'You are covered' }) : null]));
  c.appendChild(h('div', { class: 'muted', text: signed.length ? 'Thank you for letting GrayCo take care of your home.' : chosen.length ? 'Your Project Manager picked ' + (chosen.length === 1 ? 'this plan' : 'these plans') + ' for your home. Sign up for any or all of them — no obligation.' : 'Keep your home and the work we did in top shape with a visit from GrayCo. Prices are set for your home — ask for a quote, no obligation.' }));
  if (PREVIEW) c.appendChild(h('div', { class: 'muted', text: 'Preview — only the customer can ask or sign.' }));
  var all = (M.plans || []).slice(), info = {};
  all.forEach(function(p){ info[p.id] = p; });
  var list = chosen.map(function(x){ var p = info[x.planId] || {}; return { id: x.planId, name: x.planName || p.name, includes: x.includes || p.includes || '', freqLabel: x.freqLabel || p.freqLabel || '', priority: !!x.priority }; })
    .concat(all.filter(function(p){ return !chosen.some(function(x){ return x.planId === p.id; }); }));
  var otherHead = false;
  list.forEach(function(p){
    var k = byPlan[p.id];
    if (!(k && /^(requested|quoted|signed)$/.test(k.status)) && !otherHead) { otherHead = true; if (chosen.length) c.appendChild(h('h3', { class: 'pp-sub', text: 'Other plans we offer' })); }
    var box = h('div', { class: 'pp-plan', 'data-plan': p.id }, [h('b', { text: p.name }), p.freqLabel ? h('span', { class: 'pp-freq', text: p.freqLabel }) : null, p.priority ? h('span', { class: 'pp-freq', style: 'margin-left:6px;background:#fef3c7;color:#92400e', text: '⭐ Priority: snow + emergency' }) : null, p.includes ? h('p', { text: p.includes }) : null]);
    if (!k || k.status === 'declined') {
      var ask = h('button', { type: 'button', class: 'btn gold', 'data-ask': p.id, text: k ? 'Ask for a quote again' : 'Request a quote' }), msg = h('div', { class: 'pp-msg', role: 'status' });
      ask.disabled = PREVIEW;
      ask.addEventListener('click', function(){ if (busy) return; busy = true; ask.disabled = true; msg.textContent = 'Sending…';
        api({ action: 'maint-request', planId: p.id }).then(function(r){ busy = false; if (r.data && r.data.ok) { note.maint = '✓ Thank you — your Project Manager will price it for your home and it will show here.'; load(); } else { msg.textContent = (r.data && r.data.error) || 'That did not work — please call ' + OFFICE + '.'; ask.disabled = false; } }); });
      box.appendChild(ask); box.appendChild(msg);
    } else if (k.status === 'requested') {
      box.appendChild(h('span', { class: 'pp-st now', text: '⏳ Quote requested ' + dt(k.requestedAt) + ' — your Project Manager will price it for your home' }));
    } else if (k.status === 'quoted') {
      box.appendChild(h('div', { class: 'pp-price', text: usd(k.price) + ' per year' }));
      if (k.billsPerYear > 1) box.appendChild(h('div', { class: 'muted', text: 'Billed ' + k.billsPerYear + ' times a year: ' + usd(Math.round(k.price * 100 / k.billsPerYear) / 100) + ' every ' + (12 / k.billsPerYear) + ' months.' }));
      if (!open[k.id]) {
        box.appendChild(h('button', { type: 'button', class: 'btn gold', 'data-signopen': k.id, text: 'Sign up', on: { click: function(){ open[k.id] = 1; paint(); } } }));
        box.appendChild(h('button', { type: 'button', class: 'btn', style: 'margin-left:8px', text: 'No thanks', on: { click: function(){ if (busy || PREVIEW) return; busy = true; api({ action: 'maint-decline', contractId: k.id }).then(function(){ busy = false; load(); }); } } }));
      } else {
        if (!pad) pad = makePad();
        var nm = h('input', { type: 'text', class: 'pp-in', id: 'gcpp-name', maxlength: '80', autocomplete: 'name', placeholder: 'Type your full name' }); nm.value = keep.name; nm.addEventListener('input', function(){ keep.name = nm.value; });
        var ag = h('input', { type: 'checkbox', id: 'gcpp-agree' }); ag.checked = keep.ok; ag.addEventListener('change', function(){ keep.ok = ag.checked; });
        var go = h('button', { type: 'button', class: 'btn gold', id: 'gcpp-signbtn', text: 'Sign up — ' + usd(k.price) + ' / year' }), sm = h('div', { class: 'pp-msg', role: 'status' });
        go.disabled = PREVIEW;
        box.appendChild(h('label', { class: 'muted', for: 'gcpp-name', text: 'Your full name' })); box.appendChild(nm);
        box.appendChild(h('div', { class: 'muted', text: 'Draw your signature (or leave it blank to sign with your typed name):' })); box.appendChild(pad.el);
        box.appendChild(h('button', { type: 'button', class: 'btn', text: 'Clear signature', on: { click: function(){ pad.clear(); } } }));
        box.appendChild(h('label', { class: 'sel-agree' }, [ag, h('span', { text: ' I sign up for the ' + (k.planName || 'plan') + ' at ' + usd(k.price) + ' per year' + (k.billsPerYear > 1 ? ' (billed ' + usd(Math.round(k.price * 100 / k.billsPerYear) / 100) + ' every ' + (12 / k.billsPerYear) + ' months)' : '') + '. It renews each year; I can end it by e-mail before the next invoice.' })]));
        box.appendChild(go); box.appendChild(sm);
        go.addEventListener('click', function(){
          if (busy) return; if (!nm.value.trim()) { sm.textContent = 'Please type your full name.'; nm.focus(); return; } if (!ag.checked) { sm.textContent = 'Please tick the box to agree.'; return; }
          busy = true; go.disabled = true; sm.textContent = 'Signing…';
          api({ action: 'maint-sign', contractId: k.id, name: nm.value, agree: true, strokes: pad.strokes() }).then(function(r){
            busy = false;
            if (r.data && r.data.ok) { keep.ok = false; delete open[k.id]; pad.clear(); note.maint = '✓ Thank you — you are signed up. First visit: ' + dt(r.data.nextVisit) + '. Your signed copy is below' + (r.data.emailed ? ' and in your e-mail.' : '.'); return load(); }
            sm.textContent = (r.data && r.data.error) || 'That did not work — please call ' + OFFICE + '.'; go.disabled = false;
          });
        });
      }
    } else if (k.status === 'signed') {
      box.appendChild(h('span', { class: 'pp-st', text: '✓ Signed by ' + (k.signName || 'you') + ' on ' + dt(k.signedAt) + ' · ' + usd(k.price) + ' / year' + (k.billsPerYear > 1 ? ' (' + usd(Math.round(k.price * 100 / k.billsPerYear) / 100) + ' every ' + (12 / k.billsPerYear) + ' months)' : '') }));
      if (k.nextVisit) box.appendChild(h('p', { text: 'Next visit: ' + dt(k.nextVisit) + ' — we will call before we come.' }));
      if (k.doc) box.appendChild(h('a', { class: 'btn', href: k.doc, target: '_blank', rel: 'noopener', text: '📄 Your signed plan' }));
    }
    c.appendChild(box);
  });
  if (note.maint) c.appendChild(h('div', { class: 'pp-msg', text: note.maint }));
  c.appendChild(h('div', { class: 'muted', text: 'Questions about a plan? Call your Project Manager or the office at ' + OFFICE + '.' }));
  return c;
}

function paint(){
  if (!D) return; css();
  cards.forEach(function(c){ if (c && c.parentNode) c.parentNode.removeChild(c); });
  cards = [heardCard(), maintCard()].filter(Boolean);
  place();
}
function homeShown(){ var t = document.getElementById('tabs'); if (!t || t.hidden) return false; var b = document.querySelector('nav.tabs button[data-tab="home"]'); return !b || b.getAttribute('aria-selected') === 'true'; }
function place(){
  var main = document.getElementById('main'); if (!main) return;
  if (!cards.length || !homeShown()) { cards.forEach(function(c){ if (c.parentNode) c.parentNode.removeChild(c); }); return; }
  var host = main.querySelector('.col-r') || main;
  var anchor = document.getElementById('gcsel');
  var after = anchor && anchor.parentNode === host ? anchor.nextSibling : null;
  if (!after) { var first = host.firstElementChild; while (first && first.classList && first.classList.contains('jobbar')) first = first.nextElementSibling; after = first ? first.nextSibling : null; }
  cards.forEach(function(c){ if (c.parentNode === host) return; host.insertBefore(c, after); after = c.nextSibling; });
}
function start(){
  if (window.GCPartner) return;   /* the sub portal never shows these */
  if (started && sess() && pid() !== lastPid) { lastPid = pid(); D = null; cards.forEach(function(c){ if (c.parentNode) c.parentNode.removeChild(c); }); cards = []; load(); return; }
  if (started || !(token || sess())) return; var t = document.getElementById('tabs'); if (!t || t.hidden) return;
  started = true; lastPid = pid(); load();
}
try {
  new MutationObserver(function(){ start(); place(); }).observe(document.getElementById('main'), { childList: true, subtree: false });
  var tb = document.getElementById('tabs'); if (tb) new MutationObserver(function(){ start(); place(); }).observe(tb, { attributes: true, subtree: true, attributeFilter: ['hidden', 'aria-selected'] });
} catch (e) {}
start();
window._gcPortalPlus = { reload: load, data: function(){ return D; } };
})();
