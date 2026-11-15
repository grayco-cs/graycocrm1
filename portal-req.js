/* GrayCo portal — patch PORTALREQ: "➕ Request a change", "🏗 Request a new project" and "My requests".
   On the customer portal's Home (a property manager signs in the same way and picks from their buildings) and on the GC's
   project page (#g=…). Everything goes through /.netlify/functions/portal-req with the page's own link code or signed-in
   session; the server checks every input (only their own jobs and properties — or a new address of THEIRS they type —
   10 requests a day, 4 photos / PDFs of 4 MB). English / Spanish follow the portal's EN / ES button (<html lang>).
   Nothing here promises a price or a time: "Someone from our team will be with you shortly." Never on the sub portal. */
(function(){
'use strict';
if (window.__GC_PREQ__) return; window.__GC_PREQ__ = true;
var FN = '/.netlify/functions/portal-req', OFFICE = '901-585-0944', EMERGENCY = '(901) 582-8255', EMERGENCY_TEL = 'tel:9015828255', MAX = 4 * 1024 * 1024, MAXF = 4;
var D = null, card = null, loading = false, lastKey = '', showAll = false, busy = false;

/* ── English / Spanish (the portal's own EN / ES: portal.html sets <html lang> and gc_lang) ── */
var S = {
  en: { shortly: 'Someone from our team will be with you shortly.', cardCust: '🛠 Need something?', cardPm: '🛠 Requests for your properties', cardGc: '🛠 Changes & new work',
    change: '➕ Request a change', project: '🏗 Request a new project', mine: 'My requests', none: 'Nothing yet. Ask for a change on this job, or for new work at any of your properties.',
    showAll: 'Show all {n}', file1: '{n} file', fileN: '{n} files', notPossible: 'Not possible: ',
    st_received: 'Received', st_pricing: 'Being priced', st_co_sent: 'Change order sent', st_reviewing: 'With our team', st_declined: 'Not possible',
    nx_pricing: 'We are working out the change order.', nx_co_sent: 'Your change order is ready — look it over and sign it in your portal.', nx_co_sent_gc: 'Your change order is ready — sign it under 📝 Change orders on this page.', nx_reviewing: 'Our team has your request.',
    u_normal: 'Normal', u_soon: 'Soon', u_emergency: '🚨 Emergency', c_call: 'Call me', c_text: 'Text me', c_email: 'E-mail me', c_portal: 'Message me in the portal',
    w_restoration: 'Restoration / mitigation', w_roofing: 'Roofing', w_buildout: 'Commercial build-out', w_commaint: 'Commercial maintenance', w_other: 'Other',
    forJob: 'For this job', changeIntro: '. Tell us what you would like changed; we will look at it and, if it changes the work, send you a change order to sign.', projIntro: 'New work at one of your properties. ',
    propPm: 'Which property?', prop: 'Property / address', newOpt: '＋ A different address', newAddr: 'The address (number, street, city)', newPh: 'e.g. 45 Oak Hollow Cv, Collierville TN 38017',
    newNote: 'Not listed? Pick “A different address” and type it.', wt: 'Type of work', pick: 'Pick one…', descProj: 'Describe the project', descChange: 'What do you want changed?',
    phProj: 'What do you need? (a few sentences is fine)', phChange: 'What would you like changed?', whereHome: 'Where in the home?', whereBldg: 'Where in the building?',
    phWhereHome: 'e.g. upstairs hall bathroom, back of the house', phWhereBldg: 'e.g. 2nd floor, suite 210, grid C-4', optional: ' (optional)',
    photos: 'Photos or files', addPhotos: '📷 Add photos or a PDF', photoNote: 'Up to 4, 4 MB each (big photos are made smaller for you).', upTo: 'Up to 4 photos or files.', remove: 'Remove ',
    soon: 'How soon?', em1: 'Is water coming in, a fire, or could anyone get hurt? Call us now: ', em2: '. You can still send this too.',
    reach: 'Best way to reach you', phCt: 'Best time, or a different number / e-mail (optional)', name: 'Your name', phName: 'Your full name',
    send: 'Send my request', sending: 'Sending…', sendingPhotos: 'Sending photos…', noPromise: 'No prices or dates are promised here — your request goes to your GrayCo team. ', left1: '1 request left today.', leftN: '{n} requests left today.',
    ePreview: 'Preview — only the customer can send a request.', eProp: 'Pick the property.', eWt: 'Pick the type of work.', eAddr: 'Type the full address (number, street, city).',
    eTextP: 'Tell us what you need (a few words is fine).', eTextC: 'Tell us what you would like changed (a few words is fine).', eName: 'Type your name.', eFail: 'That did not go through — please call ',
    thanks: '✓ Thank you — we have your request.', emAlso: 'Emergency? Please also call us now: ', filesBad: 'Your request was sent, but {n} file(s) did not go: ', filesBad2: '. You can send them in Messages.',
    follow: 'You can follow it under “My requests”.', done: 'Done', close: 'Close', noConn: 'No connection — check your signal and try again.', didNotGo: 'did not go',
    pdfBig: 'That PDF is over 4 MB — send a smaller one, or a photo of each page.', notFile: 'Send a photo or a PDF.', photoBig: 'That photo is too big — try another one.', cantRead: 'Could not read that file.', newBadge: 'new address' },
  es: { shortly: 'Alguien de nuestro equipo se comunicará con usted en breve.', cardCust: '🛠 ¿Necesita algo?', cardPm: '🛠 Solicitudes para sus propiedades', cardGc: '🛠 Cambios y trabajo nuevo',
    change: '➕ Pedir un cambio', project: '🏗 Pedir un proyecto nuevo', mine: 'Mis solicitudes', none: 'Todavía nada. Pida un cambio en este trabajo, o trabajo nuevo en cualquiera de sus propiedades.',
    showAll: 'Ver las {n}', file1: '{n} archivo', fileN: '{n} archivos', notPossible: 'No es posible: ',
    st_received: 'Recibida', st_pricing: 'Preparando el precio', st_co_sent: 'Orden de cambio enviada', st_reviewing: 'Con nuestro equipo', st_declined: 'No es posible',
    nx_pricing: 'Estamos preparando la orden de cambio.', nx_co_sent: 'Su orden de cambio está lista — revísela y fírmela en su portal.', nx_co_sent_gc: 'Su orden de cambio está lista — fírmela en 📝 Órdenes de cambio en esta página.', nx_reviewing: 'Nuestro equipo tiene su solicitud.',
    u_normal: 'Normal', u_soon: 'Pronto', u_emergency: '🚨 Emergencia', c_call: 'Llámeme', c_text: 'Envíeme un mensaje de texto', c_email: 'Envíeme un correo', c_portal: 'Escríbame en el portal',
    w_restoration: 'Restauración / mitigación', w_roofing: 'Techos', w_buildout: 'Acondicionamiento comercial', w_commaint: 'Mantenimiento comercial', w_other: 'Otro',
    forJob: 'Para este trabajo', changeIntro: '. Díganos qué quiere cambiar; lo revisaremos y, si cambia el trabajo, le enviaremos una orden de cambio para firmar.', projIntro: 'Trabajo nuevo en una de sus propiedades. ',
    propPm: '¿Qué propiedad?', prop: 'Propiedad / dirección', newOpt: '＋ Otra dirección', newAddr: 'La dirección (número, calle, ciudad)', newPh: 'p. ej. 45 Oak Hollow Cv, Collierville TN 38017',
    newNote: '¿No aparece? Escoja “Otra dirección” y escríbala.', wt: 'Tipo de trabajo', pick: 'Escoja uno…', descProj: 'Describa el proyecto', descChange: '¿Qué quiere cambiar?',
    phProj: '¿Qué necesita? (unas frases están bien)', phChange: '¿Qué le gustaría cambiar?', whereHome: '¿Dónde en la casa?', whereBldg: '¿Dónde en el edificio?',
    phWhereHome: 'p. ej. baño del pasillo de arriba, parte de atrás de la casa', phWhereBldg: 'p. ej. 2.º piso, suite 210, eje C-4', optional: ' (opcional)',
    photos: 'Fotos o archivos', addPhotos: '📷 Agregar fotos o un PDF', photoNote: 'Hasta 4, de 4 MB cada uno (las fotos grandes se achican solas).', upTo: 'Hasta 4 fotos o archivos.', remove: 'Quitar ',
    soon: '¿Qué tan pronto?', em1: '¿Entra agua, hay fuego, o alguien podría lastimarse? Llámenos ahora: ', em2: '. También puede enviar esto.',
    reach: 'La mejor forma de contactarle', phCt: 'Mejor hora, u otro número / correo (opcional)', name: 'Su nombre', phName: 'Su nombre completo',
    send: 'Enviar mi solicitud', sending: 'Enviando…', sendingPhotos: 'Enviando fotos…', noPromise: 'Aquí no se prometen precios ni fechas — su solicitud va a su equipo de GrayCo. ', left1: 'Le queda 1 solicitud hoy.', leftN: 'Le quedan {n} solicitudes hoy.',
    ePreview: 'Vista previa — solo el cliente puede enviar una solicitud.', eProp: 'Escoja la propiedad.', eWt: 'Escoja el tipo de trabajo.', eAddr: 'Escriba la dirección completa (número, calle, ciudad).',
    eTextP: 'Díganos qué necesita (unas palabras están bien).', eTextC: 'Díganos qué le gustaría cambiar (unas palabras están bien).', eName: 'Escriba su nombre.', eFail: 'No se pudo enviar — por favor llame al ',
    thanks: '✓ Gracias — recibimos su solicitud.', emAlso: '¿Emergencia? Por favor llámenos también ahora: ', filesBad: 'Su solicitud se envió, pero {n} archivo(s) no se pudieron enviar: ', filesBad2: '. Puede enviarlos en Mensajes.',
    follow: 'Puede seguirla en “Mis solicitudes”.', done: 'Listo', close: 'Cerrar', noConn: 'Sin conexión — revise su señal e intente otra vez.', didNotGo: 'no se envió',
    pdfBig: 'Ese PDF pesa más de 4 MB — envíe uno más pequeño, o una foto de cada página.', notFile: 'Envíe una foto o un PDF.', photoBig: 'Esa foto es muy grande — pruebe con otra.', cantRead: 'No se pudo leer ese archivo.', newBadge: 'dirección nueva' }
};
function lang(){ try { if (document.documentElement.lang === 'es') return 'es'; if (document.documentElement.lang === 'en') return 'en'; return localStorage.getItem('gc_lang') === 'es' ? 'es' : 'en'; } catch (e) { return 'en'; } }
function T(k, v){ var s = (S[lang()] || S.en)[k]; if (s == null) s = S.en[k] != null ? S.en[k] : k; if (v) Object.keys(v).forEach(function(x){ s = s.split('{' + x + '}').join(v[x]); }); return s; }

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
function dt(v){ var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString(lang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

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
  var hd = { 'Content-Type': 'application/json' }, m = mode(), extra = { lang: lang() };
  if (m === 'gc') hd['x-gc-token'] = gcTok();
  else { var c = cur(); if (c.session && !c.token) hd['x-portal-session'] = c.session; else hd['x-portal-token'] = c.token || ''; if (c.pid) extra.projectId = c.pid; }
  if (preview()) extra.preview = true;
  return fetch(FN, { method: 'POST', headers: hd, body: JSON.stringify(Object.assign(extra, body)), cache: 'no-store', credentials: 'omit' })
    .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { status: r.status, data: j || {} }; }); }, function(){ return { status: 0, data: { error: T('noConn') } }; });
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
    + '.gcpr-note{font-size:13px;color:var(--mute,#55626F)}.gcpr-new{font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;background:#E6EEF7;color:#1C3D63;margin-left:6px}#gcpr-sheet .sheet-in{max-height:92vh}@media (min-width:700px){#gcpr-sheet{align-items:center}#gcpr-sheet .sheet-in{border-radius:16px}}';
  document.head.appendChild(st);
}

/* ── the card on Home / on the GC page ── */
function statusLabel(r){ return T('st_' + r.status) || r.statusLabel; }
function nextText(r){
  if (r.status === 'received') return T('shortly');
  if (r.status === 'pricing') return T('nx_pricing') + ' ' + T('shortly');
  if (r.status === 'co_sent') return mode() === 'gc' ? T('nx_co_sent_gc') : T('nx_co_sent');
  if (r.status === 'reviewing') return T('nx_reviewing');
  return '';
}
function workLabel(id){ return T('w_' + (id || 'other')); }
function titleOf(r){ return r.kind === 'project' ? workLabel(r.workTypeId) + ' — ' + r.property : r.title; }
function itemEl(r){
  var it = h('div', { class: 'gcpr-it', 'data-preq': r.id });
  it.appendChild(h('div', { class: 'gcpr-row' }, [h('b', {}, [(r.kind === 'project' ? '🏗 ' : '➕ ') + titleOf(r), r.newAddress ? h('span', { class: 'gcpr-new', text: T('newBadge') }) : null]), h('span', { class: 'gcpr-st ' + r.status, text: statusLabel(r) })]));
  it.appendChild(h('div', { class: 'gcpr-m', text: [dt(r.at), r.kind === 'project' ? workLabel(r.workTypeId) : r.job, r.urgency !== 'normal' ? T('u_' + r.urgency) : '', r.files ? T(r.files === 1 ? 'file1' : 'fileN', { n: r.files }) : ''].filter(Boolean).join(' · ') }));
  var nx = nextText(r); if (nx) it.appendChild(h('div', { class: 'gcpr-m', text: nx }));
  if (r.status === 'declined' && r.note) it.appendChild(h('div', { class: 'gcpr-rep no', text: T('notPossible') + r.note }));
  (r.replies || []).forEach(function(x){ it.appendChild(h('div', { class: 'gcpr-rep' }, [h('div', { class: 'gcpr-m', text: x.by + ' · ' + dt(x.at) }), x.text])); });
  return it;
}
function paint(){
  css();
  var m = mode(); if (!m || !D) { if (card && card.parentNode) card.parentNode.removeChild(card); return; }
  var c = h('section', { class: 'card', id: 'gcpr-card', lang: lang() });
  /* patch GCPORTAL: the customer portal of a job we do as the SUB for a GC — "Request a change order" only (no "new project":
     a GC invites us to bid through its own plan room) */
  var gcv = m === 'customer' && cur().variant === 'gc';
  c.appendChild(h('h2', { text: gcv ? (lang() === 'es' ? '🛠 Órdenes de cambio' : '🛠 Change orders') : m === 'gc' ? T('cardGc') : D.portal === 'pm' ? T('cardPm') : T('cardCust') }));
  c.appendChild(h('div', { class: 'gcpr-acts' }, [
    h('button', { type: 'button', class: 'btn gold', id: 'gcpr-change', text: gcv ? (lang() === 'es' ? '➕ Solicitar una orden de cambio' : '➕ Request a change order') : T('change'), on: { click: function(){ open('change'); } } }),
    gcv ? null : h('button', { type: 'button', class: 'btn', id: 'gcpr-project', text: T('project'), on: { click: function(){ open('project'); } } })]));
  var list = D.requests || [];
  c.appendChild(h('h3', { style: 'margin:6px 0 0;font-size:15px', text: T('mine') + (list.length ? ' (' + list.length + ')' : '') }));
  if (!list.length) c.appendChild(h('div', { class: 'gcpr-note', text: gcv ? (lang() === 'es' ? 'Todavía nada. Pida una orden de cambio para este trabajo.' : 'Nothing yet. Ask for a change order on this job.') : T('none') }));
  var box = h('div', { id: 'gcpr-list' }); (showAll ? list : list.slice(0, 4)).forEach(function(r){ box.appendChild(itemEl(r)); }); c.appendChild(box);
  if (list.length > 4 && !showAll) c.appendChild(h('button', { type: 'button', class: 'btn', text: T('showAll', { n: list.length }), on: { click: function(){ showAll = true; paint(); } } }));
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
    if (isPdf) { if (f.size > MAX) return rej(T('pdfBig')); var r = new FileReader(); r.onload = function(){ res({ data: String(r.result).replace(/^data:[^;]*;/, 'data:application/pdf;'), name: f.name }); }; r.onerror = function(){ rej(T('cantRead')); }; r.readAsDataURL(f); return; }
    if (!/^image\//.test(f.type || '') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || '')) return rej(T('notFile'));
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function(){
      var k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); var d = c.toDataURL('image/jpeg', 0.82);
      if (d.length * 0.75 > MAX) return rej(T('photoBig'));
      res({ data: d, name: (f.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg' });
    };
    img.onerror = function(){ URL.revokeObjectURL(url); if (f.size <= MAX && f.type) { var r2 = new FileReader(); r2.onload = function(){ res({ data: r2.result, name: f.name }); }; r2.readAsDataURL(f); } else rej(T('cantRead')); };
    img.src = url;
  });
}
function close(){ var s = $('gcpr-sheet'); if (s) s.remove(); try { document.body.style.overflow = ''; } catch (e) {} }
function field(label, el, opt){ var id = el.id || (el.querySelector && (el.querySelector('input,select,textarea') || {}).id) || null; return h('div', { class: 'gcpr-f' }, [h('label', { for: id }, [label, opt ? h('span', { class: 'opt', text: T('optional') }) : null]), el]); }
function open(kind){
  if (!D) { load().then(function(){ if (D) open(kind); }); return; }
  css(); close();
  var m = mode(), c = cur(), F = { urgency: 'normal', files: [] };
  var sheet = h('div', { class: 'sheet', id: 'gcpr-sheet', role: 'dialog', 'aria-modal': 'true', lang: lang(), 'aria-label': kind === 'project' ? T('project') : T('change') });
  var inner = h('div', { class: 'sheet-in' }), body = h('div', { class: 'sheet-body' });
  inner.appendChild(h('div', { class: 'sheet-top' }, [h('span', { style: 'width:44px' }), h('b', { text: kind === 'project' ? T('project') : T('change') }), h('button', { type: 'button', class: 'x', 'aria-label': T('close'), text: '✕', on: { click: close } })]));
  inner.appendChild(body); sheet.appendChild(inner);
  sheet.addEventListener('click', function(e){ if (e.target === sheet) close(); });
  var err = h('div', { class: 'gcpr-err', role: 'alert' });
  var job = m === 'gc' ? ((window.GCGc.data() || {}).job || {}) : null;
  if (kind === 'change') body.appendChild(h('div', { class: 'gcpr-note', text: T('forJob') + (m === 'gc' && job.name ? ' — ' + job.name : '') + T('changeIntro') }));
  else body.appendChild(h('div', { class: 'gcpr-note', text: T('projIntro') + T('shortly') }));
  var prop = null, wt = null, na = null, naBox = null;
  if (kind === 'project') {
    prop = h('select', { class: 'gcpr-in', id: 'gcpr-prop' });
    (D.properties || []).forEach(function(p){ var o = h('option', { value: p.id, text: p.label }); if (c.pid && p.id === 'j:' + c.pid) o.selected = true; prop.appendChild(o); });
    prop.appendChild(h('option', { value: 'new', text: T('newOpt') }));
    if (!(D.properties || []).length) prop.value = 'new';
    body.appendChild(field(D.portal === 'pm' ? T('propPm') : T('prop'), prop));
    na = h('input', { class: 'gcpr-in', id: 'gcpr-newaddr', type: 'text', maxlength: '200', autocomplete: 'street-address', placeholder: T('newPh') });
    naBox = field(T('newAddr'), na); body.appendChild(naBox);
    var syncNa = function(){ naBox.hidden = prop.value !== 'new'; };
    prop.addEventListener('change', function(){ syncNa(); if (prop.value === 'new') try { na.focus(); } catch (e) {} }); syncNa();
    body.appendChild(h('div', { class: 'gcpr-note', text: T('newNote') }));
    wt = h('select', { class: 'gcpr-in', id: 'gcpr-wt' }, [h('option', { value: '', text: T('pick') })].concat((D.workTypes || []).map(function(w){ return h('option', { value: w.id, text: workLabel(w.id) }); })));
    body.appendChild(field(T('wt'), wt));
  }
  var text = h('textarea', { class: 'gcpr-in', id: 'gcpr-text', maxlength: '3000', placeholder: kind === 'project' ? T('phProj') : T('phChange') });
  body.appendChild(field(kind === 'project' ? T('descProj') : T('descChange'), text));
  var where = null;
  if (kind === 'change') { where = h('input', { class: 'gcpr-in', id: 'gcpr-where', type: 'text', maxlength: '160', placeholder: m === 'gc' ? T('phWhereBldg') : T('phWhereHome') }); body.appendChild(field(m === 'gc' ? T('whereBldg') : T('whereHome'), where, true)); }
  /* photos / files */
  var chips = h('div', { class: 'gcpr-chips' }), fi = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, id: 'gcpr-files' });
  function drawChips(){ chips.innerHTML = ''; F.files.forEach(function(f, i){ chips.appendChild(h('span', { class: 'gcpr-chip' }, [h('span', { text: '📎 ' + f.name }), h('button', { type: 'button', 'aria-label': T('remove') + f.name, text: '×', on: { click: function(){ F.files.splice(i, 1); drawChips(); } } })])); }); }
  fi.addEventListener('change', function(){ Array.prototype.forEach.call(fi.files || [], function(f){ if (F.files.length < MAXF) F.files.push(f); }); fi.value = ''; drawChips(); if (F.files.length >= MAXF) err.textContent = T('upTo'); });
  body.appendChild(field(T('photos'), h('div', { class: 'gcpr-f' }, [h('label', { class: 'gcpr-file' }, [T('addPhotos'), fi]), chips, h('div', { class: 'gcpr-note', text: T('photoNote') })]), true));
  /* urgency */
  var emNote = h('div', { class: 'gcpr-em', hidden: true }, [T('em1'), h('a', { href: EMERGENCY_TEL, text: EMERGENCY }), T('em2')]   /* patch CUSTPORTAL (owner 11/02): the 24/7 emergency line */);
  var seg = h('div', { class: 'gcpr-seg', role: 'group', 'aria-label': T('soon') });
  ['normal', 'soon', 'emergency'].forEach(function(u){
    seg.appendChild(h('button', { type: 'button', class: u === 'emergency' ? 'em' : '', 'data-u': u, 'aria-pressed': u === F.urgency ? 'true' : 'false', text: T('u_' + u), on: { click: function(){ F.urgency = u; Array.prototype.forEach.call(seg.children, function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-u') === F.urgency ? 'true' : 'false'); }); emNote.hidden = F.urgency !== 'emergency'; } } }));
  });
  body.appendChild(field(T('soon'), seg)); body.appendChild(emNote);
  /* how to reach them */
  var ct = h('select', { class: 'gcpr-in', id: 'gcpr-contact' }, (D.contacts || []).map(function(x){ return h('option', { value: x.id, text: T('c_' + x.id) }); }));
  var ctn = h('input', { class: 'gcpr-in', id: 'gcpr-ctnote', type: 'text', maxlength: '120', placeholder: T('phCt') });
  body.appendChild(field(T('reach'), h('div', { class: 'gcpr-f' }, [ct, ctn])));
  var nm = null;
  if (m === 'gc') { nm = h('input', { class: 'gcpr-in', id: 'gcpr-name', type: 'text', maxlength: '80', autocomplete: 'name', placeholder: T('phName') }); nm.value = ls('gc_g_name'); body.appendChild(field(T('name'), nm)); }
  var send = h('button', { type: 'button', class: 'btn gold', id: 'gcpr-send', style: 'min-height:52px;font-size:17px', text: T('send') });
  body.appendChild(err); body.appendChild(send);
  body.appendChild(h('div', { class: 'gcpr-note', text: T('noPromise') + (D.left != null ? T(D.left === 1 ? 'left1' : 'leftN', { n: D.left }) : '') }));
  send.addEventListener('click', function(){
    if (busy) return; err.textContent = '';
    if (preview()) { err.textContent = T('ePreview'); return; }
    if (kind === 'project' && !prop.value) { err.textContent = T('eProp'); return; }
    if (kind === 'project' && prop.value === 'new' && (na.value.trim().length < 8 || !/\d/.test(na.value))) { err.textContent = T('eAddr'); na.focus(); return; }
    if (kind === 'project' && !wt.value) { err.textContent = T('eWt'); wt.focus(); return; }
    if (text.value.trim().length < 5) { err.textContent = kind === 'project' ? T('eTextP') : T('eTextC'); text.focus(); return; }
    if (nm && nm.value.trim().length < 2) { err.textContent = T('eName'); nm.focus(); return; }
    if (nm) { try { localStorage.setItem('gc_g_name', nm.value.trim()); } catch (e) {} }
    busy = true; send.disabled = true; send.textContent = T('sending');
    var b = { action: kind, text: text.value, urgency: F.urgency, contact: ct.value, contactNote: ctn.value };
    if (where) b.where = where.value; if (prop) { b.property = prop.value; if (prop.value === 'new') b.newAddress = na.value; } if (wt) b.workType = wt.value; if (nm) b.name = nm.value;
    api(b).then(function(r){
      if (!(r.data && r.data.ok)) { busy = false; send.disabled = false; send.textContent = T('send'); err.textContent = (r.data && r.data.error) || (T('eFail') + OFFICE + '.'); return; }
      var id = r.data.request.id, files = F.files.slice(), bad = [];
      send.textContent = files.length ? T('sendingPhotos') : T('sending');
      (function next(){
        var f = files.shift();
        if (!f) return done();
        readFile(f).then(function(d){ return api({ action: 'attach', id: id, file: d }).then(function(x){ if (!(x.data && x.data.ok)) bad.push(f.name + ': ' + ((x.data && x.data.error) || T('didNotGo'))); }); }, function(e){ bad.push(f.name + ': ' + e); }).then(next);
      })();
      function done(){
        busy = false; body.innerHTML = '';
        body.appendChild(h('div', { class: 'gcpr-ok', id: 'gcpr-thanks' }, [h('b', { text: T('thanks') }), h('div', { text: T('shortly') })]));
        if (F.urgency === 'emergency') body.appendChild(h('div', { class: 'gcpr-em' }, [T('emAlso'), h('a', { href: EMERGENCY_TEL, text: EMERGENCY }), '.']));   /* patch CUSTPORTAL: the 24/7 emergency line */
        if (bad.length) body.appendChild(h('div', { class: 'gcpr-err', text: T('filesBad', { n: bad.length }) + bad.join('; ') + T('filesBad2') }));
        body.appendChild(h('div', { class: 'gcpr-note', text: T('follow') }));
        body.appendChild(h('button', { type: 'button', class: 'btn', id: 'gcpr-done', text: T('done'), on: { click: close } }));
        load();
      }
    });
  });
  document.body.appendChild(sheet);
  try { document.body.style.overflow = 'hidden'; } catch (e) {}
  setTimeout(function(){ try { (prop || text).focus(); } catch (e) {} }, 50);
}

/* ── start / follow the page (and its EN / ES button) ── */
function key(){ var m = mode(); if (!m) return ''; return m === 'gc' ? 'g:' + gcTok() : 'c:' + (cur().pid || '') + ':' + (cur().session || cur().token || ''); }
function tick(){
  var k = key();
  if (!k) { if (card && card.parentNode) card.parentNode.removeChild(card); return; }
  if (k !== lastKey) { lastKey = k; D = null; showAll = false; load(); return; }
  if (card && D && card.getAttribute('lang') !== lang()) return paint();
  if (card) place();
}
try {
  new MutationObserver(function(){ tick(); }).observe(document.getElementById('main'), { childList: true, subtree: false });
  var tb = document.getElementById('tabs'); if (tb) new MutationObserver(function(){ tick(); }).observe(tb, { attributes: true, subtree: true, attributeFilter: ['hidden', 'aria-selected'] });
  new MutationObserver(function(){ tick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
} catch (e) {}
setInterval(tick, 1500); tick();
window.GCPortalReq = { open: open, reload: load, data: function(){ return D; }, _i18n: S, _t: T };
})();
