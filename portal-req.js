/* GrayCo portal — patch PORTALREQ: "➕ Request a change", "🏗 Request a new project" and "My requests".
   On the customer portal's Home (a property manager signs in the same way and picks from their buildings) and on the GC's
   project page (#g=…). Everything goes through /.netlify/functions/portal-req with the page's own link code or signed-in
   session; the server checks every input (only their own jobs and properties, 10 requests a day, 4 photos / PDFs of 4 MB).
   Nothing here promises a price or a time: "Someone from our team will be with you shortly." Never on the sub portal. */
(function(){
'use strict';
if (window.__GC_PREQ__) return; window.__GC_PREQ__ = true;
var FN = '/.netlify/functions/portal-req', OFFICE = '901-585-0944', MAX = 4 * 1024 * 1024, MAXF = 4;
var SHORTLY = 'Someone from our team will be with you shortly.';
var D = null, card = null, loading = false, lastKey = '', showAll = false, busy = false;

function $(id){ return document.getElementById(id); }
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
function ls(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function dt(v){ var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

/* ── which page, which door ── */
function gcTok(){ var m = /(?:^#|&)g=([A-Za-z0-9_-]{43})(?:&|$)/.exec(location.hash || ''); return m ? m[1] : ls('gc_portal_g'); }
function mode(){
  if (window.GCPartner) return '';
  if (window.GCGc && window.GCGc.data && window.GCGc.data()) return 'gc';
  try { var c = window.GCPortalMain && window.GCPortalMain.cur(); if (c && c.shown) return 'customer'; } catch (e) {}
  return '';
}
function cur(){ try { return (window.GCPortalMain && window.GCPortalMain.cur()) || {}; } catch (e) { return {}; } }
function preview(){ return /(?:^#|&)p=1(?:&|$)/.test(location.hash || ''); }
function api(body){
  var hd = { 'Content-Type': 'application/json' }, m = mode(), extra = {};
  if (m === 'gc') hd['x-gc-token'] = gcTok();
  else { var c = cur(); if (c.session && !c.token) hd['x-portal-session'] = c.session; else hd['x-portal-token'] = c.token || ''; if (c.pid) extra.projectId = c.pid; }
  if (preview()) extra.preview = true;
  return fetch(FN, { method: 'POST', headers: hd, body: JSON.stringify(Object.assign(extra, body)), cache: 'no-store', credentials: 'omit' })
    .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { status: r.status, data: j || {} }; }); }, function(){ return { status: 0, data: { error: 'No connection — check your signal and try again.' } }; });
}
function load(){
  if (loading) return Promise.resolve(); loading = true;
  return api({ action: 'mine' }).then(function(r){ loading = false; if (r.data && r.data.ok) { D = r.data; paint(); } });
}

/* ── styles (the portal's own tokens) ── */
function css(){
  if ($('gcpr-css')) return;
  var st = document.createElement('style'); st.id = 'gcpr-css';
  st.textContent = '#gcpr-card .gcpr-acts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#gcpr-card .gcpr-acts .btn{min-height:52px;font-size:15px;white-space:normal;line-height:1.2;padding:8px 10px}'
    + '@media (max-width:360px){#gcpr-card .gcpr-acts{grid-template-columns:1fr}}'
    + '.gcpr-it{border-top:1px solid var(--rule,#EFEAE0);padding:10px 0;display:flex;flex-direction:column;gap:5px}.gcpr-it:first-of-type{border-top:0}'
    + '.gcpr-row{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}.gcpr-row b{font-size:15px;overflow-wrap:anywhere;min-width:0}'
    + '.gcpr-st{flex:0 0 auto;font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;background:#FCF0CF;color:#7A5A00;white-space:nowrap}.gcpr-st.co_sent{background:#E3F5EC;color:#1F7A3A}.gcpr-st.declined{background:#EEE9DF;color:#55626F}.gcpr-st.pricing,.gcpr-st.reviewing{background:#E6EEF7;color:#1C3D63}'
    + '.gcpr-m{font-size:13px;color:var(--mute,#55626F);overflow-wrap:anywhere}.gcpr-rep{background:var(--goldBg,#FCF0CF);border-radius:10px;padding:8px 10px;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.gcpr-rep.no{background:#F1EEE7}'
    + '.gcpr-f{display:flex;flex-direction:column;gap:6px}.gcpr-f label{font-size:14px;font-weight:700}.gcpr-f .opt{font-weight:400;color:var(--mute,#55626F)}'
    + '.gcpr-in{width:100%;box-sizing:border-box;min-height:46px;border:1px solid #C9C2B2;border-radius:10px;padding:10px;font:16px inherit;font-family:inherit;background:#fff;color:inherit}textarea.gcpr-in{min-height:96px;resize:vertical}'
    + '.gcpr-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gcpr-seg button{min-height:46px;border:2px solid var(--edge,#E2DCCD);background:#fff;border-radius:10px;font:600 15px inherit;font-family:inherit;cursor:pointer;color:inherit}'
    + '.gcpr-seg button[aria-pressed=true]{border-color:var(--gold,#D4A017);background:var(--goldBg,#FCF0CF)}.gcpr-seg button.em[aria-pressed=true]{border-color:#B42318;background:#FDECEC;color:#8a1c1c}'
    + '.gcpr-file{display:flex;align-items:center;justify-content:center;gap:6px;border:1px dashed #B8B0A0;border-radius:10px;min-height:48px;cursor:pointer;font:600 15px inherit;font-family:inherit;background:#fff;color:var(--navy,#0F1D2F)}.gcpr-file input{display:none}'
    + '.gcpr-chips{display:flex;flex-wrap:wrap;gap:6px}.gcpr-chip{display:inline-flex;align-items:center;gap:4px;font-size:13px;border-radius:999px;background:#F1EEE7;padding:4px 4px 4px 10px;max-width:100%}.gcpr-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}.gcpr-chip button{border:0;background:transparent;font-size:16px;min-width:32px;min-height:32px;cursor:pointer}'
    + '.gcpr-em{background:#FDECEC;color:#8a1c1c;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:600}.gcpr-em a{color:#8a1c1c}'
    + '.gcpr-err{color:#8a1c1c;font-size:14px;font-weight:600;min-height:1em}.gcpr-ok{background:#E3F5EC;color:#1F5E33;border-radius:12px;padding:14px;font-size:16px;line-height:1.45}'
    + '.gcpr-note{font-size:13px;color:var(--mute,#55626F)}#gcpr-sheet .sheet-in{max-height:92vh}@media (min-width:700px){#gcpr-sheet{align-items:center}#gcpr-sheet .sheet-in{border-radius:16px}}';
  document.head.appendChild(st);
}

/* ── the card on Home / on the GC page ── */
function statusPill(r){ return h('span', { class: 'gcpr-st ' + r.status, text: r.statusLabel }); }
function itemEl(r){
  var it = h('div', { class: 'gcpr-it', 'data-preq': r.id });
  it.appendChild(h('div', { class: 'gcpr-row' }, [h('b', { text: (r.kind === 'project' ? '🏗 ' : '➕ ') + r.title }), statusPill(r)]));
  it.appendChild(h('div', { class: 'gcpr-m', text: [dt(r.at), r.kind === 'project' ? r.workType : r.job, r.urgency !== 'normal' ? r.urgencyLabel : '', r.files ? r.files + ' file' + (r.files === 1 ? '' : 's') : ''].filter(Boolean).join(' · ') }));
  if (r.next) it.appendChild(h('div', { class: 'gcpr-m', text: r.next }));
  if (r.status === 'declined' && r.note) it.appendChild(h('div', { class: 'gcpr-rep no', text: 'Not possible: ' + r.note }));
  (r.replies || []).forEach(function(x){ it.appendChild(h('div', { class: 'gcpr-rep' }, [h('div', { class: 'gcpr-m', text: x.by + ' · ' + dt(x.at) }), x.text])); });
  return it;
}
function paint(){
  css();
  var m = mode(); if (!m || !D) { if (card && card.parentNode) card.parentNode.removeChild(card); return; }
  var c = h('section', { class: 'card', id: 'gcpr-card' });
  c.appendChild(h('h2', { text: m === 'gc' ? '🛠 Changes & new work' : D.portal === 'pm' ? '🛠 Requests for your properties' : '🛠 Need something?' }));
  c.appendChild(h('div', { class: 'gcpr-acts' }, [
    h('button', { type: 'button', class: 'btn gold', id: 'gcpr-change', text: '➕ Request a change', on: { click: function(){ open('change'); } } }),
    h('button', { type: 'button', class: 'btn', id: 'gcpr-project', text: '🏗 Request a new project', on: { click: function(){ open('project'); } } })]));
  var list = D.requests || [];
  c.appendChild(h('h3', { style: 'margin:6px 0 0;font-size:15px', text: 'My requests' + (list.length ? ' (' + list.length + ')' : '') }));
  if (!list.length) c.appendChild(h('div', { class: 'gcpr-note', text: 'Nothing yet. Ask for a change on this job, or for new work at any of your properties.' }));
  var box = h('div', { id: 'gcpr-list' }); (showAll ? list : list.slice(0, 4)).forEach(function(r){ box.appendChild(itemEl(r)); }); c.appendChild(box);
  if (list.length > 4 && !showAll) c.appendChild(h('button', { type: 'button', class: 'btn', text: 'Show all ' + list.length, on: { click: function(){ showAll = true; paint(); } } }));
  if (card && card.parentNode) card.parentNode.replaceChild(c, card); card = c;
  place();
}
function homeShown(){ var t = $('tabs'); if (!t || t.hidden) return false; var b = document.querySelector('nav.tabs button[data-tab="home"]'); return !b || b.getAttribute('aria-selected') === 'true'; }
function place(){
  var main = $('main'), m = mode(); if (!main || !card) return;
  if (m === 'customer' && !homeShown()) { if (card.parentNode) card.parentNode.removeChild(card); return; }
  var host = m === 'gc' ? main : (main.querySelector('.col-r') || main);
  if (card.parentNode === host) return;
  /* after the first card (the job's progress / the GC contact) — near the top, never above "We need from you" */
  var cards = Array.prototype.filter.call(host.children, function(x){ return x.classList && x.classList.contains('card') && x.id !== 'gcpr-card'; });
  var after = $('gcpn-needs') && $('gcpn-needs').parentNode === host ? $('gcpn-needs') : cards[0] || null;
  host.insertBefore(card, after ? after.nextSibling : host.firstChild);
}

/* ── the forms ── */
function readFile(f){
  return new Promise(function(res, rej){
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
function close(){ var s = $('gcpr-sheet'); if (s) s.remove(); try { document.body.style.overflow = ''; } catch (e) {} }
function field(label, el, opt){ var id = el.id || (el.querySelector && (el.querySelector('input,select,textarea') || {}).id) || null; return h('div', { class: 'gcpr-f' }, [h('label', { for: id }, [label, opt ? h('span', { class: 'opt', text: ' (optional)' }) : null]), el]); }
function open(kind){
  if (!D) { load().then(function(){ if (D) open(kind); }); return; }
  css(); close();
  var m = mode(), c = cur(), F = { urgency: 'normal', files: [] };
  var sheet = h('div', { class: 'sheet', id: 'gcpr-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': kind === 'project' ? 'Request a new project' : 'Request a change' });
  var inner = h('div', { class: 'sheet-in' }), body = h('div', { class: 'sheet-body' });
  inner.appendChild(h('div', { class: 'sheet-top' }, [h('span', { style: 'width:44px' }), h('b', { text: kind === 'project' ? '🏗 Request a new project' : '➕ Request a change' }), h('button', { type: 'button', class: 'x', 'aria-label': 'Close', text: '✕', on: { click: close } })]));
  inner.appendChild(body); sheet.appendChild(inner);
  sheet.addEventListener('click', function(e){ if (e.target === sheet) close(); });
  var err = h('div', { class: 'gcpr-err', role: 'alert' });
  var job = m === 'gc' ? ((window.GCGc.data() || {}).job || {}) : null;
  if (kind === 'change') body.appendChild(h('div', { class: 'gcpr-note', text: 'For this job' + (m === 'gc' && job.name ? ' — ' + job.name : '') + '. Tell us what you would like changed; we will look at it and, if it changes the work, send you a change order to sign.' }));
  else body.appendChild(h('div', { class: 'gcpr-note', text: 'New work at one of your properties. ' + SHORTLY }));
  var prop = null, wt = null;
  if (kind === 'project') {
    prop = h('select', { class: 'gcpr-in', id: 'gcpr-prop' });
    (D.properties || []).forEach(function(p){ var o = h('option', { value: p.id, text: p.label }); if (c.pid && p.id === 'j:' + c.pid) o.selected = true; prop.appendChild(o); });
    body.appendChild(field(D.portal === 'pm' ? 'Which property?' : 'Property / address', prop));
    body.appendChild(h('div', { class: 'gcpr-note', text: 'A different address? Call us at ' + OFFICE + ' and we will add it.' }));
    wt = h('select', { class: 'gcpr-in', id: 'gcpr-wt' }, [h('option', { value: '', text: 'Pick one…' })].concat((D.workTypes || []).map(function(w){ return h('option', { value: w.id, text: w.label }); })));
    body.appendChild(field('Type of work', wt));
  }
  var text = h('textarea', { class: 'gcpr-in', id: 'gcpr-text', maxlength: '3000', placeholder: kind === 'project' ? 'What do you need? (a few sentences is fine)' : 'What would you like changed?' });
  body.appendChild(field(kind === 'project' ? 'Describe the project' : 'What do you want changed?', text));
  var where = null;
  if (kind === 'change') { where = h('input', { class: 'gcpr-in', id: 'gcpr-where', type: 'text', maxlength: '160', placeholder: m === 'gc' ? 'e.g. 2nd floor, suite 210, grid C-4' : 'e.g. upstairs hall bathroom, back of the house' }); body.appendChild(field(m === 'gc' ? 'Where in the building?' : 'Where in the home?', where, true)); }
  /* photos / files */
  var chips = h('div', { class: 'gcpr-chips' }), fi = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, id: 'gcpr-files' });
  function drawChips(){ chips.innerHTML = ''; F.files.forEach(function(f, i){ chips.appendChild(h('span', { class: 'gcpr-chip' }, [h('span', { text: '📎 ' + f.name }), h('button', { type: 'button', 'aria-label': 'Remove ' + f.name, text: '×', on: { click: function(){ F.files.splice(i, 1); drawChips(); } } })])); }); }
  fi.addEventListener('change', function(){ Array.prototype.forEach.call(fi.files || [], function(f){ if (F.files.length < MAXF) F.files.push(f); }); fi.value = ''; drawChips(); if (F.files.length >= MAXF) err.textContent = 'Up to ' + MAXF + ' photos or files.'; });
  body.appendChild(field('Photos or files', h('div', { class: 'gcpr-f' }, [h('label', { class: 'gcpr-file' }, ['📷 Add photos or a PDF', fi]), chips, h('div', { class: 'gcpr-note', text: 'Up to 4, 4 MB each (big photos are made smaller for you).' })]), true));
  /* urgency */
  var emNote = h('div', { class: 'gcpr-em', hidden: true }, ['Is water coming in, a fire, or could anyone get hurt? Call us now: ', h('a', { href: 'tel:9015850944', text: OFFICE }), '. You can still send this too.']);
  var seg = h('div', { class: 'gcpr-seg', role: 'group', 'aria-label': 'How soon?' });
  [['normal', 'Normal'], ['soon', 'Soon'], ['emergency', '🚨 Emergency']].forEach(function(u){
    seg.appendChild(h('button', { type: 'button', class: u[0] === 'emergency' ? 'em' : '', 'data-u': u[0], 'aria-pressed': u[0] === F.urgency ? 'true' : 'false', text: u[1], on: { click: function(){ F.urgency = u[0]; Array.prototype.forEach.call(seg.children, function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-u') === F.urgency ? 'true' : 'false'); }); emNote.hidden = F.urgency !== 'emergency'; } } }));
  });
  body.appendChild(field('How soon?', seg)); body.appendChild(emNote);
  /* how to reach them */
  var ct = h('select', { class: 'gcpr-in', id: 'gcpr-contact' }, (D.contacts || []).map(function(x){ return h('option', { value: x.id, text: x.label }); }));
  var ctn = h('input', { class: 'gcpr-in', id: 'gcpr-ctnote', type: 'text', maxlength: '120', placeholder: 'Best time, or a different number / e-mail (optional)' });
  body.appendChild(field('Best way to reach you', h('div', { class: 'gcpr-f' }, [ct, ctn])));
  var nm = null;
  if (m === 'gc') { nm = h('input', { class: 'gcpr-in', id: 'gcpr-name', type: 'text', maxlength: '80', autocomplete: 'name', placeholder: 'Your full name' }); nm.value = ls('gc_g_name'); body.appendChild(field('Your name', nm)); }
  var send = h('button', { type: 'button', class: 'btn gold', id: 'gcpr-send', style: 'min-height:52px;font-size:17px', text: 'Send my request' });
  body.appendChild(err); body.appendChild(send);
  body.appendChild(h('div', { class: 'gcpr-note', text: 'No prices or dates are promised here — your request goes to your GrayCo team. ' + (D.left != null ? D.left + ' request' + (D.left === 1 ? '' : 's') + ' left today.' : '') }));
  send.addEventListener('click', function(){
    if (busy) return; err.textContent = '';
    if (preview()) { err.textContent = 'Preview — only the customer can send a request.'; return; }
    if (kind === 'project' && !prop.value) { err.textContent = 'Pick the property.'; return; }
    if (kind === 'project' && !wt.value) { err.textContent = 'Pick the type of work.'; wt.focus(); return; }
    if (text.value.trim().length < 5) { err.textContent = kind === 'project' ? 'Tell us what you need (a few words is fine).' : 'Tell us what you would like changed (a few words is fine).'; text.focus(); return; }
    if (nm && nm.value.trim().length < 2) { err.textContent = 'Type your name.'; nm.focus(); return; }
    if (nm) { try { localStorage.setItem('gc_g_name', nm.value.trim()); } catch (e) {} }
    busy = true; send.disabled = true; send.textContent = 'Sending…';
    var b = { action: kind, text: text.value, urgency: F.urgency, contact: ct.value, contactNote: ctn.value };
    if (where) b.where = where.value; if (prop) b.property = prop.value; if (wt) b.workType = wt.value; if (nm) b.name = nm.value;
    api(b).then(function(r){
      if (!(r.data && r.data.ok)) { busy = false; send.disabled = false; send.textContent = 'Send my request'; err.textContent = (r.data && r.data.error) || ('That did not go through — please call ' + OFFICE + '.'); return; }
      var id = r.data.request.id, files = F.files.slice(), bad = [];
      send.textContent = files.length ? 'Sending photos…' : 'Sending…';
      (function next(){
        var f = files.shift();
        if (!f) return done();
        readFile(f).then(function(d){ return api({ action: 'attach', id: id, file: d }).then(function(x){ if (!(x.data && x.data.ok)) bad.push(f.name + ': ' + ((x.data && x.data.error) || 'did not go')); }); }, function(e){ bad.push(f.name + ': ' + e); }).then(next);
      })();
      function done(){
        busy = false; body.innerHTML = '';
        body.appendChild(h('div', { class: 'gcpr-ok', id: 'gcpr-thanks' }, [h('b', { text: '✓ Thank you — we have your request.' }), h('div', { text: SHORTLY })]));
        if (F.urgency === 'emergency') body.appendChild(h('div', { class: 'gcpr-em' }, ['Emergency? Please also call us now: ', h('a', { href: 'tel:9015850944', text: OFFICE }), '.']));
        if (bad.length) body.appendChild(h('div', { class: 'gcpr-err', text: 'Your request was sent, but ' + bad.length + ' file' + (bad.length === 1 ? '' : 's') + ' did not go: ' + bad.join('; ') + '. You can send them in Messages.' }));
        body.appendChild(h('div', { class: 'gcpr-note', text: 'You can follow it under “My requests”.' }));
        body.appendChild(h('button', { type: 'button', class: 'btn', id: 'gcpr-done', text: 'Done', on: { click: close } }));
        load();
      }
    });
  });
  document.body.appendChild(sheet);
  try { document.body.style.overflow = 'hidden'; } catch (e) {}
  setTimeout(function(){ try { (prop || text).focus(); } catch (e) {} }, 50);
}

/* ── start / follow the page ── */
function key(){ var m = mode(); if (!m) return ''; return m === 'gc' ? 'g:' + gcTok() : 'c:' + (cur().pid || '') + ':' + (cur().session || cur().token || ''); }
function tick(){
  var k = key();
  if (!k) { if (card && card.parentNode) card.parentNode.removeChild(card); return; }
  if (k !== lastKey) { lastKey = k; D = null; showAll = false; load(); return; }
  if (card && !card.isConnected) place(); else if (card) place();
}
try {
  new MutationObserver(function(){ tick(); }).observe(document.getElementById('main'), { childList: true, subtree: false });
  var tb = document.getElementById('tabs'); if (tb) new MutationObserver(function(){ tick(); }).observe(tb, { attributes: true, subtree: true, attributeFilter: ['hidden', 'aria-selected'] });
} catch (e) {}
setInterval(tick, 1500); tick();
window.GCPortalReq = { open: open, reload: load, data: function(){ return D; } };
})();
