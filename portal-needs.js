/* GrayCo customer portal — patch AUTO11: 📎 "We need from you". The PM / office asks for papers (insurance policy,
   adjuster info, HOA approval letter, colors, a door / gate code, signed forms, photos…); the customer uploads a photo
   or a PDF, or types the answer. A door / gate code goes straight to the job's private access-code vault and is never
   shown again. Everything goes through /.netlify/functions/cust-care with the same link code (or signed-in session) as
   the rest of the portal; the server checks every input. Shown at the top of Home while something is waiting, a small
   "all sent ✓" note after. Never on the sub portal. */
(function(){
'use strict';
if (window.__GC_PNEEDS__) return; window.__GC_PNEEDS__ = true;
var FN = '/.netlify/functions/cust-care', OFFICE = '901-585-0944', MAX = 4 * 1024 * 1024;
var token = '';
try { var m = /(?:^#|&)t=([A-Za-z0-9_-]{20,80})/.exec(location.hash || ''); if (m) token = m[1]; } catch (e) {}
try { if (!token) token = localStorage.getItem('gc_portal_t') || ''; } catch (e) {}
var PREVIEW = /(?:^#|&)p=1(?:&|$)/.test(location.hash || '');
function sess(){ try { return token ? '' : (localStorage.getItem('gc_portal_s') || ''); } catch (e) { return ''; } }
function pid(){ try { return String(window.PID || ''); } catch (e) { return ''; } }
var D = null, card = null, started = false, lastPid = '', busy = {}, msg = {};

function h(tag, attrs, kids){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    var v = attrs[k]; if (v == null || v === false) return;
    if (k === 'text') el.textContent = v;
    else if (k === 'on') Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); });
    else el.setAttribute(k, v === true ? '' : String(v));
  });
  (kids || []).forEach(function(c){ if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function api(body){
  return fetch(FN, { method: 'POST', headers: sess() ? { 'Content-Type': 'application/json', 'x-portal-session': sess() } : { 'Content-Type': 'application/json', 'x-portal-token': token },
    body: JSON.stringify(Object.assign(PREVIEW ? { preview: true } : {}, sess() ? { projectId: pid() || undefined } : {}, body)), cache: 'no-store', credentials: 'omit' })
    .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { status: r.status, data: j || {} }; }); }, function(){ return { status: 0, data: { error: 'No connection — check your signal and try again.' } }; });
}
function load(){ return api({ action: 'needs' }).then(function(r){ if (r.data && r.data.ok) { D = r.data; paint(); } }); }
function css(){
  if (document.getElementById('gc-pneeds-css')) return;
  var st = document.createElement('style'); st.id = 'gc-pneeds-css';
  st.textContent = '.pn-it{border:1px solid #E2DCCD;border-radius:12px;padding:12px 14px;margin:10px 0;background:#fffdf7}.pn-it b{display:block;font-size:16px}.pn-it p{margin:6px 0;font-size:14px;line-height:1.45}' +
    '.pn-in{width:100%;box-sizing:border-box;border:1px solid #cfc8b6;border-radius:8px;padding:10px;font:15px Arial,sans-serif;min-height:44px;margin:6px 0}.pn-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px}' +
    '.pn-file{display:inline-flex;align-items:center;gap:6px;border:1px dashed #b8b0a0;border-radius:10px;padding:10px 14px;min-height:44px;cursor:pointer;font:600 14px Arial,sans-serif;color:#0F1D2F;background:#fff}.pn-file input{display:none}' +
    '.pn-ok{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;background:#E3F5EC;color:#1F7A3A}.pn-msg{font-size:14px;margin-top:6px;min-height:1em}';
  document.head.appendChild(st);
}
/* a big photo is made smaller before it goes up (a PDF goes as it is, up to 4 MB) */
function readFile(f){
  return new Promise(function(res, rej){
    if (!f) return rej('none');
    var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
    if (isPdf) { if (f.size > MAX) return rej('That PDF is over 4 MB — send a smaller one, or a photo of each page.'); var r = new FileReader(); r.onload = function(){ res({ data: String(r.result).replace(/^data:[^;]*;/, 'data:application/pdf;'), name: f.name }); }; r.onerror = function(){ rej('Could not read that file.'); }; r.readAsDataURL(f); return; }
    if (!/^image\//.test(f.type || '') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || '')) return rej('Send a photo or a PDF.');
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function(){
      var k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); var d = c.toDataURL('image/jpeg', 0.82);
      if (d.length * 0.75 > MAX) return rej('That photo is too big — try another one.');
      res({ data: d, name: (f.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg' });
    };
    img.onerror = function(){ URL.revokeObjectURL(url); if (f.size <= MAX && f.type) { var r2 = new FileReader(); r2.onload = function(){ res({ data: r2.result, name: f.name }); }; r2.readAsDataURL(f); } else rej('Could not read that photo.'); };
    img.src = url;
  });
}
function itemBox(x){
  var box = h('div', { class: 'pn-it', 'data-id': x.id });
  box.appendChild(h('b', { text: x.label }));
  if (x.note) box.appendChild(h('p', { text: x.note }));
  if (x.status === 'done') {
    box.appendChild(h('span', { class: 'pn-ok', text: '✓ Sent — thank you' }));
    if (x.answer && x.kind !== 'codes') box.appendChild(h('p', { text: x.answer }));
    if (x.files) box.appendChild(h('p', { text: x.files + ' file' + (x.files === 1 ? '' : 's') + ' sent' }));
    return box;
  }
  var isCode = x.kind === 'codes', ta = isCode ? h('input', { class: 'pn-in', type: 'text', autocomplete: 'off', placeholder: 'Type the code (we keep it private)', maxlength: '60' }) : h('textarea', { class: 'pn-in', rows: '2', placeholder: 'Type your answer (or add a file below)', maxlength: '2000' });
  var label = isCode ? h('input', { class: 'pn-in', type: 'text', placeholder: 'Which door / gate? (optional)', maxlength: '60' }) : null;
  var fi = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true });
  var picked = [], list = h('div', { class: 'pn-msg' }), m = h('div', { class: 'pn-msg', text: msg[x.id] || '' });
  fi.addEventListener('change', function(){ Array.prototype.forEach.call(fi.files || [], function(f){ if (picked.length < 4) picked.push(f); }); fi.value = ''; list.textContent = picked.length ? picked.map(function(f){ return '📎 ' + f.name; }).join('  ') : ''; });
  var send = h('button', { class: 'btn', type: 'button', text: 'Send' });
  send.addEventListener('click', function(){
    if (busy[x.id]) return; var text = ta.value.trim();
    if (!text && !picked.length) { m.textContent = isCode ? 'Type the code first.' : 'Add a file or type your answer.'; return; }
    busy[x.id] = true; send.disabled = true; m.textContent = 'Sending…';
    var files = picked.slice(), first = true;
    function next(){
      if (!files.length && !first) return done({ data: { ok: true } });
      var f = files.shift();
      var p = f ? readFile(f) : Promise.resolve(null);
      p.then(function(d){
        var b = { action: 'needs-answer', id: x.id, files: d ? [d] : [] };
        if (first) { b.text = text; if (label) b.label = label.value.trim(); }
        first = false;
        return api(b).then(function(r){ if (!(r.data && r.data.ok)) return done(r); return files.length ? next() : done(r); });
      }, function(err){ done({ data: { error: typeof err === 'string' ? err : 'Could not read that file.' } }); });
    }
    function done(r){
      busy[x.id] = false; send.disabled = false;
      if (r.data && r.data.ok) { msg[x.id] = ''; return load(); }
      m.textContent = (r.data && r.data.error) || ('That did not work — please call ' + OFFICE + '.');
    }
    next();
  });
  box.appendChild(ta); if (label) box.appendChild(label);
  var row = h('div', { class: 'pn-row' }, [isCode ? null : h('label', { class: 'pn-file' }, ['📷 Add a photo or PDF', fi]), send]);
  box.appendChild(row); box.appendChild(list); box.appendChild(m);
  return box;
}
function paint(){
  if (!D) return; css();
  if (card && card.parentNode) card.parentNode.removeChild(card); card = null;
  var items = (D.items || []), open = items.filter(function(x){ return x.status === 'open'; });
  if (!items.length) return;
  card = h('section', { class: 'card', id: 'gcpn-needs' });
  card.appendChild(h('h2', { text: open.length ? '📎 We need from you' : '📎 We need from you — all sent ✓' }));
  if (open.length) card.appendChild(h('p', { class: 'muted', text: 'To keep your project moving, please send these. A photo from your phone is fine.' }));
  (open.length ? open.concat(items.filter(function(x){ return x.status !== 'open'; })) : items).forEach(function(x){ card.appendChild(itemBox(x)); });
  card.appendChild(h('div', { class: 'muted', text: 'Questions? Call your Project Manager or the office at ' + OFFICE + '.' }));
  place();
}
function homeShown(){ var t = document.getElementById('tabs'); if (!t || t.hidden) return false; var b = document.querySelector('nav.tabs button[data-tab="home"]'); return !b || b.getAttribute('aria-selected') === 'true'; }
function place(){
  var main = document.getElementById('main'); if (!main || !card) return;
  if (!homeShown()) { if (card.parentNode) card.parentNode.removeChild(card); return; }
  var host = main.querySelector('.col-r') || main;
  if (card.parentNode === host) return;
  var first = host.firstElementChild; while (first && first.classList && first.classList.contains('jobbar')) first = first.nextElementSibling;
  host.insertBefore(card, first || null);
}
function start(){
  if (window.GCPartner) return;   /* the sub portal never shows this */
  if (started && sess() && pid() !== lastPid) { lastPid = pid(); D = null; if (card && card.parentNode) card.parentNode.removeChild(card); card = null; load(); return; }
  if (started || !(token || sess())) return; var t = document.getElementById('tabs'); if (!t || t.hidden) return;
  started = true; lastPid = pid(); load();
}
try {
  new MutationObserver(function(){ start(); place(); }).observe(document.getElementById('main'), { childList: true, subtree: false });
  var tb = document.getElementById('tabs'); if (tb) new MutationObserver(function(){ start(); place(); }).observe(tb, { attributes: true, subtree: true, attributeFilter: ['hidden', 'aria-selected'] });
} catch (e) {}
start();
window._gcPortalNeeds = { reload: load, data: function(){ return D; } };
})();
