/* GrayCo customer portal — patch X10: 🏠 My home (the home profile) and 💬 "Share a few words" (testimonial).
   Everything goes through /.netlify/functions/portal-home with the same link code (or the signed-in session) as the
   rest of the portal. Both cards sit on Home and survive the page redrawing. Never on the sub portal. */
(function(){
'use strict';
if (window.__GC_PHOME__) return; window.__GC_PHOME__ = true;
var FN = '/.netlify/functions/portal-home', OFFICE = '901-585-0944';
var token = '';
try { var m = /(?:^#|&)t=([A-Za-z0-9_-]{20,80})/.exec(location.hash || ''); if (m) token = m[1]; } catch (e) {}
try { if (!token) token = localStorage.getItem('gc_portal_t') || ''; } catch (e) {}
var PREVIEW = /(?:^#|&)p=1(?:&|$)/.test(location.hash || '');
function sess(){ try { return token ? '' : (localStorage.getItem('gc_portal_s') || ''); } catch (e) { return ''; } }
function pid(){ try { return String(window.PID || ''); } catch (e) { return ''; } }
var D = null, cards = [], started = false, lastPid = '', busy = false, msg = '', keep = { text: '', ok: true, name: '' }, video = null;
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
function load(){ return api({ action: 'home' }).then(function(r){ if (r.data && r.data.ok) { D = r.data; paint(); } }); }
function css(){
  if (document.getElementById('gc-phome-css')) return;
  var st = document.createElement('style'); st.id = 'gc-phome-css';
  st.textContent = '.ph-btn{border:none;background:#0F1D2F;color:#fff;border-radius:10px;padding:12px 18px;font:700 15px Arial,sans-serif;cursor:pointer;min-height:46px}.ph-btn.gold{background:#D4A017;color:#0F1D2F}' +
    '.ph-ov{position:fixed;inset:0;z-index:9000;background:rgba(10,18,30,.6);overflow:auto;padding:14px}.ph-sheet{background:#fff;max-width:720px;margin:0 auto;border-radius:14px;padding:16px 18px 24px;color:#14202E;font:15px/1.5 Arial,sans-serif}' +
    '.ph-sheet h2{margin:0 0 6px;font-size:20px}.ph-sheet h3{margin:18px 0 6px;font-size:16px;border-bottom:1px solid #E2DCCD;padding-bottom:4px}.ph-x{float:right;border:none;background:#eee;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;min-height:44px}' +
    '.ph-row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #f1ede2;padding:7px 0}.ph-row span:first-child{color:#55626F}.ph-ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}.ph-ph img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px}' +
    '.ph-in{width:100%;box-sizing:border-box;border:1px solid #cfc8b6;border-radius:8px;padding:10px;font-size:16px;margin:6px 0}.ph-msg{font-size:14px;margin-top:8px;min-height:1em}';
  document.head.appendChild(st);
}
function sheet(){
  var ov = h('div', { class: 'ph-ov', role: 'dialog', 'aria-label': 'My home' }), sh = h('div', { class: 'ph-sheet' });
  var close = function(){ ov.remove(); };
  sh.appendChild(h('button', { type: 'button', class: 'ph-x', text: 'Close', on: { click: close } }));
  sh.appendChild(h('h2', { text: '🏠 My home' }));
  if (D.address) sh.appendChild(h('div', { style: 'color:#55626F', text: D.address }));
  var f = D.fields || {}, labels = D.labels || [];
  var have = labels.filter(function(l){ return f[l[0]]; });
  sh.appendChild(h('h3', { text: 'What we used' }));
  if (have.length) have.forEach(function(l){ sh.appendChild(h('div', { class: 'ph-row' }, [h('span', { text: l[1] }), h('b', { text: f[l[0]], style: 'text-align:right' })])); });
  else sh.appendChild(h('div', { style: 'color:#55626F', text: 'Your Project Manager fills this in as the job goes — the materials and colors used on your home.' }));
  sh.appendChild(h('h3', { text: 'Warranties' }));
  (D.jobs || []).forEach(function(j){ sh.appendChild(h('div', { class: 'ph-row' }, [h('span', { text: j.name + (j.po ? ' · PO ' + j.po : '') }), h('b', { text: j.warranty ? j.warranty.label + (j.warranty.end ? ' — to ' + dt(j.warranty.end) : ' — starts when the job is complete') : '—' })])); });
  if ((D.plans || []).length) { sh.appendChild(h('h3', { text: 'Maintenance plan' })); D.plans.forEach(function(p){ sh.appendChild(h('div', { class: 'ph-row' }, [h('span', { text: p.name }), h('b', { text: p.nextVisit ? 'Next visit ' + dt(p.nextVisit) : 'Active' })])); }); }
  if ((D.photos || []).length) { sh.appendChild(h('h3', { text: 'Photos' })); sh.appendChild(h('div', { class: 'ph-ph' }, D.photos.map(function(u){ return h('a', { href: u, target: '_blank', rel: 'noopener' }, [h('img', { src: u, alt: 'Job photo', loading: 'lazy' })]); }))); }
  sh.appendChild(h('h3', { text: 'Invoices' }));
  var any = false;
  (D.jobs || []).forEach(function(j){ (j.invoices || []).forEach(function(i){ any = true; sh.appendChild(h('div', { class: 'ph-row' }, [h('span', { text: (i.number || 'Invoice') + ' · ' + dt(i.date) }), h('b', { text: usd(i.amount) + ' · ' + (i.balance > 0 ? 'balance ' + usd(i.balance) : 'paid') })])); }); });
  if (!any) sh.appendChild(h('div', { style: 'color:#55626F', text: 'No invoices yet.' }));
  if ((D.history || []).length) { sh.appendChild(h('h3', { text: 'Service history' })); D.history.forEach(function(x){ sh.appendChild(h('div', { class: 'ph-row' }, [h('span', { text: dt(x.date) }), h('b', { text: x.what })])); }); }
  sh.appendChild(h('p', { style: 'color:#55626F;font-size:13px;margin-top:16px', text: 'Something missing or wrong? Tell your Project Manager or call GrayCo at ' + OFFICE + '. This record stays here for as long as you own your home.' }));
  ov.appendChild(sh); ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
  document.body.appendChild(ov);
}
function homeCard(){
  return h('section', { class: 'card', id: 'gcph-home' }, [h('h2', { text: '🏠 My home' }), h('p', { text: 'Everything about your home in one place: the materials and colors used, warranties, photos, invoices and service history.' }),
    h('button', { type: 'button', class: 'ph-btn', text: 'Open my home record', on: { click: sheet } })]);
}
function testiCard(){
  var T = D.testimonial || {}; if (!T.ask && !T.sent) return null;
  var c = h('section', { class: 'card', id: 'gcph-testi' });
  c.appendChild(h('h2', { text: '💬 Share a few words?' }));
  if (T.sent) { c.appendChild(h('p', { text: 'Thank you for your kind words — it means a lot to our team!' })); return c; }
  c.appendChild(h('p', { text: 'If you were happy with your project, a sentence or two about working with GrayCo helps other families choose us. A short video is welcome too (optional).' }));
  var ta = h('textarea', { class: 'ph-in', rows: '4', maxlength: '1500', placeholder: 'What was it like working with GrayCo?', 'aria-label': 'Your words' }); ta.value = keep.text; ta.addEventListener('input', function(){ keep.text = ta.value; });
  var nm = h('input', { class: 'ph-in', type: 'text', maxlength: '80', placeholder: 'Your name as you would like it shown (e.g. Jane D.)', 'aria-label': 'Your name' }); nm.value = keep.name; nm.addEventListener('input', function(){ keep.name = nm.value; });
  var vf = h('input', { type: 'file', accept: 'video/mp4,video/quicktime,video/webm', 'aria-label': 'Add a short video (optional)' });
  vf.addEventListener('change', function(){ var f = vf.files && vf.files[0]; video = null; if (!f) return; if (f.size > 4 * 1024 * 1024) { note('That video is over 4 MB — try a shorter one (about 30 seconds).', true); vf.value = ''; return; } var r = new FileReader(); r.onload = function(){ video = String(r.result); }; r.readAsDataURL(f); });
  var cb = h('input', { type: 'checkbox', id: 'gcph-ok' }); cb.checked = keep.ok; cb.addEventListener('change', function(){ keep.ok = cb.checked; });
  var m2 = h('div', { class: 'ph-msg', role: 'status' });
  function note(t, bad){ m2.textContent = t; m2.style.color = bad ? '#b91c1c' : '#1f6b33'; }
  var send = h('button', { type: 'button', class: 'ph-btn gold', text: 'Send', on: { click: function(){
    if (busy) return; if (s(ta.value).length < 10) { note('Write a sentence or two — thank you!', true); return; }
    busy = true; send.disabled = true; note('Sending…');
    api({ action: 'testimonial', text: ta.value, name: nm.value, permission: cb.checked, video: video || undefined }).then(function(r){
      busy = false; send.disabled = false;
      if (r.data && r.data.ok) { D.testimonial = { sent: true }; paint(); return; }
      note((r.data && r.data.error) || 'That did not go through — please try again.', true);
    }); } } });
  c.appendChild(ta); c.appendChild(nm);
  c.appendChild(h('div', { style: 'margin:6px 0' }, [h('label', { style: 'font-size:14px' }, ['Video (optional): ', vf])]));
  c.appendChild(h('label', { for: 'gcph-ok', style: 'display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:8px 0' }, [cb, h('span', { text: 'GrayCo may share my words (and video) on its website and social media, with my first name and city.' })]));
  c.appendChild(send); c.appendChild(m2);
  return c;
}
function s(v){ return v == null ? '' : String(v).trim(); }
function paint(){
  if (!D) return; css();
  cards.forEach(function(c){ if (c && c.parentNode) c.parentNode.removeChild(c); });
  cards = [testiCard(), homeCard()].filter(Boolean);
  place();
}
function homeShown(){ var t = document.getElementById('tabs'); if (!t || t.hidden) return false; var b = document.querySelector('nav.tabs button[data-tab="home"]'); return !b || b.getAttribute('aria-selected') === 'true'; }
function place(){
  var main = document.getElementById('main'); if (!main) return;
  if (!cards.length || !homeShown()) { cards.forEach(function(c){ if (c.parentNode) c.parentNode.removeChild(c); }); return; }
  var host = main.querySelector('.col-r') || main;
  cards.forEach(function(c){ if (c.parentNode !== host) host.appendChild(c); });
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
window._gcPortalHome = { reload: load, data: function(){ return D; } };
})();
