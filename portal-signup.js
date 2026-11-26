/* portal-signup.js — patch PORTALSIGNUP (owner 11/23: "also be able to tell customers to sign up on portal.grayco-cs.com and their name
   will match to what we already have in our CRM system for their job address etc and that's a way they can sign up or we send them a link
   too, let them choose customer, subcontractor, supplier and other as choices").
   portal.grayco-cs.com's sign-in gets "New here? Sign up" → I am a: 🏠 Customer · 🔨 Subcontractor · 🧱 Supplier · ✉️ Other.
     · Subcontractor / Supplier → the existing sign-up (portal-app.js GCPartner.signup → the bid site's register, its e-mail confirm).
     · Customer → name, e-mail, mobile, job address (+ ZIP), optional PO / job # and the name on the contract → "Check your e-mail".
     · Other → name, e-mail, phone, a message → "Check your e-mail".
     · ?signup-confirm=<code> (the e-mail's button) → "Confirm my e-mail" (a tap — opening the page confirms nothing) → signed in, or
       "Thanks — GrayCo will connect your account to your job, usually within one business day."
     · ?signup=customer&job=<signed link> (from the CRM's 🔗 Portal sign-up link) → the customer form, tied to that job.
   The server is netlify/functions/portal-access.js (su-start / su-confirm) + _lib/portalsignup.js. Nothing here says whether a name, an
   address or a job exists. portal.html hands its sign-in helpers in as window.__gcDoor (marker PORTALSIGNUP there). */
(function(){
'use strict';
if (window.GCSignup) return;
var ACC = '/.netlify/functions/portal-access';
var T = {
  en: { newHere: '✨ New here? Sign up', title: 'Sign up for the GrayCo Portal', iam: 'I am a:', cust: '🏠 Customer', sub: '🔨 Subcontractor', sup: '🧱 Supplier', other: '✉️ Other',
    custWhy: 'Your own project page: updates, photos, documents and payments. Tell us who you are and where the job is — GrayCo connects you to your job.',
    linkNote: 'GrayCo sent you this link for your project. Fill in your details — we confirm your e-mail first.',
    otherWhy: 'Not a customer, sub or supplier? Send GrayCo a note — we confirm your e-mail first.',
    name: 'Your name', email: 'E-mail', mobile: 'Mobile number', phone: 'Phone (optional)', addr: 'What is the job address (or addresses) we are working on for you?', addrShort: 'Job address', addrMore: '+ Another address', addrN: 'Another job address', addrDel: 'Remove', zip: 'ZIP', po: 'PO or job number (optional)', contract: 'Company or name on the contract (optional)', msg: 'Your message',
    go: 'Sign up', send: 'Send', back: '‹ Back', toSignin: 'I already have an account — sign in', need: 'Please fill in: {f}', badEmail: 'Enter a valid e-mail address.', badPhone: 'Enter your 10-digit mobile number.',
    checkT: '✉️ Check your e-mail', again: 'Send it again', againDone: '✓ Sent again — check your e-mail', wait: 'Please wait a minute, then try again.', fail: 'That did not go through. Check your connection and try again.',
    confT: 'Confirm your e-mail', confWhy: 'Tap the button to confirm your e-mail and finish signing up.', confGo: 'Confirm my e-mail', confBusy: 'Confirming…', doneT: '✅ Thank you', home: 'Go to sign in',
    supT: 'Supplier sign-up', supWhy: 'Create your supplier account: GrayCo reviews it, then you see the jobs to quote, your purchase orders and bills.', supTrades: 'What you supply (e.g. lumber, roofing materials, windows)' },
  es: { newHere: '✨ ¿Nuevo aquí? Regístrese', title: 'Regístrese en el Portal GrayCo', iam: 'Yo soy:', cust: '🏠 Cliente', sub: '🔨 Subcontratista', sup: '🧱 Proveedor', other: '✉️ Otro',
    custWhy: 'Su propia página del proyecto: avances, fotos, documentos y pagos. Díganos quién es y dónde es el trabajo — GrayCo lo conecta con su trabajo.',
    linkNote: 'GrayCo le envió este enlace para su proyecto. Escriba sus datos — primero confirmamos su correo.',
    otherWhy: '¿No es cliente, subcontratista ni proveedor? Envíe una nota a GrayCo — primero confirmamos su correo.',
    name: 'Su nombre', email: 'Correo', mobile: 'Celular', phone: 'Teléfono (opcional)', addr: '¿Cuál es la dirección (o direcciones) del trabajo que hacemos para usted?', addrShort: 'Dirección del trabajo', addrMore: '+ Otra dirección', addrN: 'Otra dirección de trabajo', addrDel: 'Quitar', zip: 'Código postal', po: 'PO o número de trabajo (opcional)', contract: 'Empresa o nombre en el contrato (opcional)', msg: 'Su mensaje',
    go: 'Registrarme', send: 'Enviar', back: '‹ Atrás', toSignin: 'Ya tengo cuenta — entrar', need: 'Por favor llene: {f}', badEmail: 'Escriba un correo válido.', badPhone: 'Escriba su celular de 10 dígitos.',
    checkT: '✉️ Revise su correo', again: 'Enviar otra vez', againDone: '✓ Enviado otra vez — revise su correo', wait: 'Espere un minuto y vuelva a intentar.', fail: 'No se pudo enviar. Revise su conexión e intente otra vez.',
    confT: 'Confirme su correo', confWhy: 'Toque el botón para confirmar su correo y terminar su registro.', confGo: 'Confirmar mi correo', confBusy: 'Confirmando…', doneT: '✅ Gracias', home: 'Ir a entrar',
    supT: 'Registro de proveedor', supWhy: 'Cree su cuenta de proveedor: GrayCo la revisa y luego verá los trabajos para cotizar, sus órdenes de compra y facturas.', supTrades: 'Lo que usted vende (p. ej. madera, materiales de techo, ventanas)' }
};
function door(){ return window.__gcDoor || {}; }
function lang(){ try { return door().lang ? door().lang() : (document.documentElement.lang === 'es' ? 'es' : 'en'); } catch (e) { return 'en'; } }
function t(k, v){ var s = (T[lang()] || T.en)[k] || T.en[k] || k; if (v) Object.keys(v).forEach(function(x){ s = s.replace('{' + x + '}', v[x]); }); return s; }
function $(id){ return document.getElementById(id); }
function h(tag, attrs, kids){
  var el = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function(k){ var v = attrs[k]; if (v == null || v === false) return;
    if (k === 'text') el.textContent = v; else if (k === 'on') Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); }); else el.setAttribute(k, v === true ? '' : String(v)); });
  (kids || []).forEach(function(c){ if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function post(body){
  return fetch(ACC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'omit', body: JSON.stringify(body) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { status: r.status, data: j || {} }; }); });
}
function css(){
  if ($('gc-su2-css')) return;
  var st = document.createElement('style'); st.id = 'gc-su2-css';
  st.textContent = '.su2{max-width:520px;margin:0 auto;width:100%}.su2-kinds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'
    + '.su2-kinds button{min-height:76px;border:2px solid var(--edge,#E2DCCD);border-radius:14px;background:#fff;color:var(--navy,#0F1D2F);font:700 16px inherit;font-family:inherit;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;text-align:center}'
    + '.su2-kinds button:hover,.su2-kinds button:focus-visible{border-color:var(--gold,#D4A017)}'
    + '.su2-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}@media(min-width:620px){.su2-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.su2-grid.addr{grid-template-columns:minmax(0,1fr) 120px}}'
    + '.su2 .back{align-self:flex-start;background:none;border:none;color:var(--navy2,#1A3A5F);font:600 15px inherit;font-family:inherit;cursor:pointer;min-height:40px;padding:0}'
    + '.su2-note{background:var(--goldBg,#FCF0CF);border:1px solid var(--gold,#D4A017);border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.45}.su2-req{color:#8a1c1c}'
    + '#siNewHere{margin-top:2px}.su2-more{display:flex;flex-direction:column;gap:8px}.su2-addrrow{display:flex;gap:8px}.su2-addrrow .inp{flex:1 1 auto;min-width:0}.su2-addrrow .btn{flex:0 0 52px;min-height:44px}#su2AddAddr{align-self:flex-start}';
  document.head.appendChild(st);
}
function main(){ return $('main'); }
function chrome(){ try { $('tabs').hidden = true; $('hello').hidden = true; } catch (e) {} }
function screen(id, kids){ css(); chrome(); var m = main(); m.innerHTML = ''; var box = h('section', { class: 'card signin su2', id: id }, kids); m.appendChild(box); try { window.scrollTo(0, 0); } catch (e) {} return box; }
function toSignin(email){ cleanUrl(); if (door().signin) door().signin('pw', email || ''); else location.replace(location.pathname); }
function cleanUrl(){ try { if (/[?&](signup|signup-confirm|job)=/.test(location.search)) history.replaceState(null, '', location.pathname); } catch (e) {} }
function q(name){ var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search || ''); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; }
var JOB = '', KEEP = {};

/* ── I am a: ── */
function choose(){
  var box = screen('suChoose', [h('button', { type: 'button', class: 'back', id: 'suBackSignin', text: t('back'), on: { click: function(){ toSignin(); } } }),
    h('h2', { text: t('title') }), h('p', { class: 'muted', text: t('iam') })]);
  var g = h('div', { class: 'su2-kinds', role: 'group', 'aria-label': t('iam') });
  [['customer', t('cust')], ['sub', t('sub')], ['supplier', t('sup')], ['other', t('other')]].forEach(function(k){
    g.appendChild(h('button', { type: 'button', 'data-su-kind': k[0], text: k[1], on: { click: function(){ pick(k[0]); } } }));
  });
  box.appendChild(g);
  box.appendChild(h('button', { type: 'button', class: 'btn', id: 'suHaveAcct', text: t('toSignin'), on: { click: function(){ toSignin(); } } }));
}
function pick(kind){
  if (kind === 'customer') return form('customer');
  if (kind === 'other') return form('other');
  if (kind === 'sub') { if (door().subSignup) return door().subSignup(); return; }   /* the existing sign-up, as "New subcontractor?" opens it */
  if (kind === 'supplier') return supplier();
}
/* 🧱 Supplier: the same sign-up form (portal-app.js) as a supplier account (the bid site's register with acctType 'supplier') */
function supplier(){
  chrome(); main().innerHTML = '<div class="skel"></div>';
  var go = function(){
    if (!window.GCPartner || !window.GCPartner.signup) return;
    window.GCPartner.signup({ main: main(), lang: lang(), acctType: 'supplier', keep: door().keep || {}, back: function(email){ toSignin(email); },
      signedIn: function(s0, kind){ if (door().signedIn) door().signedIn(s0, kind); } });
    var box = $('signupBox'); if (!box) return;
    box.setAttribute('data-acct', 'supplier');
    var h2 = box.querySelector('h2'); if (h2) h2.textContent = t('supT');
    var why = h2 && h2.nextElementSibling; if (why && why.tagName === 'P') why.textContent = t('supWhy');
    var other = $('su_tradeOther'); if (other) other.setAttribute('placeholder', t('supTrades'));
  };
  if (window.GCPartner) return go();
  if (door().loadApp) door().loadApp(go);
}

/* ── the Customer / Other form ── */
function form(kind){
  var link = kind === 'customer' && !!JOB;
  var F = {};
  function inp(k, attrs){ var el = h(k === 'message' ? 'textarea' : 'input', Object.assign({ class: 'inp', id: 'su2_' + k, 'data-su2': k }, attrs || {})); if (KEEP[k] != null) el.value = KEEP[k]; el.addEventListener('input', function(){ KEEP[k] = el.value; }); F[k] = el; return el; }
  function fld(label, el, req){ return h('label', { class: 'fld' }, [h('span', null, [label, req ? h('span', { class: 'su2-req', 'aria-hidden': 'true', text: ' *' }) : null]), el]); }
  var err = h('div', { class: 'err', role: 'alert', id: 'su2Err' });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'su2Go', text: kind === 'other' ? t('send') : t('go') });
  var kids = [h('button', { type: 'button', class: 'back', id: 'su2Back', text: t('back'), on: { click: function(){ if (link) toSignin(); else choose(); } } }),
    h('h2', { text: kind === 'other' ? t('other') : t('cust') }),
    link ? h('div', { class: 'su2-note', id: 'su2LinkNote', text: t('linkNote') }) : h('p', { class: 'muted', text: kind === 'other' ? t('otherWhy') : t('custWhy') }),
    h('div', { class: 'su2-grid two' }, [fld(t('name'), inp('name', { autocomplete: 'name', maxlength: '80' }), true), fld(t('email'), inp('email', { type: 'email', inputmode: 'email', autocomplete: 'email', maxlength: '200' }), true)]),
    h('div', { class: 'su2-grid two' }, [fld(kind === 'other' ? t('phone') : t('mobile'), inp('phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '40' }), kind !== 'other')])];
  if (kind === 'customer') {
    kids.push(h('div', { class: 'su2-grid addr' }, [fld(t('addr'), inp('address', { autocomplete: 'street-address', maxlength: '160' }), true), fld(t('zip'), inp('zip', { inputmode: 'numeric', autocomplete: 'postal-code', maxlength: '10' }))]));
    /* patch PORTALJOBS2: more than one job address (a customer with several jobs) — "+ Another address", up to 10 */
    var more = h('div', { class: 'su2-more', id: 'su2More' });
    var addMore = function(val){
      var n = more.querySelectorAll('[data-su2-addr]').length; if (n >= 9) return null;
      var el = h('input', { class: 'inp', 'data-su2-addr': String(n + 2), maxlength: '160', autocomplete: 'off', 'aria-label': t('addrN') }); if (val) el.value = val;
      var row = h('div', { class: 'su2-addrrow' }, [el, h('button', { type: 'button', class: 'btn', 'aria-label': t('addrDel'), text: '✕', on: { click: function(){ row.remove(); keepMore(); } } })]);
      el.addEventListener('input', keepMore); more.appendChild(row); return el;
    };
    var keepMore = function(){ KEEP.addresses = [].map.call(more.querySelectorAll('[data-su2-addr]'), function(x){ return x.value; }); };
    (KEEP.addresses || []).forEach(function(a){ addMore(a); });
    kids.push(more, h('button', { type: 'button', class: 'btn', id: 'su2AddAddr', text: t('addrMore'), on: { click: function(){ var el = addMore(''); if (el) el.focus(); } } }));
    kids.push(h('div', { class: 'su2-grid two' }, [fld(t('po'), inp('po', { maxlength: '40' })), fld(t('contract'), inp('contractName', { maxlength: '120' }))]));
  } else kids.push(fld(t('msg'), inp('message', { maxlength: '2000', rows: '4' }), true));
  kids.push(err, go);
  screen(kind === 'other' ? 'su2Other' : 'su2Cust', kids).setAttribute('data-kind', kind);
  function v(k){ return F[k] ? String(F[k].value || '').trim() : ''; }
  go.addEventListener('click', function(){
    err.textContent = '';
    var need = [['name', t('name')], ['email', t('email')]].concat(kind === 'customer' ? [['phone', t('mobile')], ['address', t('addrShort')]] : [['message', t('msg')]]).filter(function(x){ return !v(x[0]); });
    if (need.length) { err.textContent = t('need', { f: need.map(function(x){ return x[1]; }).join(', ') }); F[need[0][0]].focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v('email'))) { err.textContent = t('badEmail'); F.email.focus(); return; }
    if (kind === 'customer' && v('phone').replace(/\D/g, '').length < 10) { err.textContent = t('badPhone'); F.phone.focus(); return; }
    var body = { action: 'su-start', kind: kind, name: v('name'), email: v('email').toLowerCase(), phone: v('phone'), lang: lang() };
    if (kind === 'customer') { body.address = v('address'); body.addresses = [].map.call(document.querySelectorAll('[data-su2-addr]'), function(x){ return String(x.value || '').trim(); }).filter(Boolean); body.zip = v('zip'); body.po = v('po'); body.contractName = v('contractName'); if (JOB) body.job = JOB; }
    else body.message = v('message');
    go.disabled = true;
    post(body).then(function(r){
      go.disabled = false;
      if (r.status === 429) { err.textContent = r.data.error || t('wait'); return; }
      if (r.status !== 200 || !r.data.ok) { err.textContent = r.data.error || t('fail'); return; }
      checkMail(body, r.data.message);
    }, function(){ go.disabled = false; err.textContent = t('fail'); });
  });
}
function checkMail(body, msg){
  var note = h('div', { class: 'muted', id: 'su2AgainNote', role: 'status' });
  var again = h('button', { type: 'button', class: 'btn', id: 'su2Again', text: t('again') });
  again.addEventListener('click', function(){
    again.disabled = true;
    post(body).then(function(r){ note.textContent = r.status === 429 ? t('wait') : t('againDone'); setTimeout(function(){ again.disabled = false; }, 60000); }, function(){ again.disabled = false; note.textContent = t('fail'); });
  });
  Object.keys(KEEP).forEach(function(k){ delete KEEP[k]; });
  screen('su2Check', [h('h2', { text: t('checkT') }), h('p', { id: 'su2CheckMsg', text: msg }), h('div', { class: 'muted', text: body.email }), again, note,
    h('button', { type: 'button', class: 'btn', id: 'su2ToSignin', text: t('home'), on: { click: function(){ toSignin(body.email); } } })]);
}

/* ── the confirm link ── */
function confirmScreen(code){
  var err = h('div', { class: 'err', role: 'alert', id: 'su2ConfErr' });
  var b = h('button', { type: 'button', class: 'btn gold', id: 'su2Confirm', text: t('confGo') });
  screen('su2Conf', [h('h2', { text: t('confT') }), h('p', { class: 'muted', text: t('confWhy') }), b, err]);
  b.addEventListener('click', function(){
    b.disabled = true; b.textContent = t('confBusy'); err.textContent = '';
    post({ action: 'su-confirm', token: code }).then(function(r){
      var d = r.data || {};
      if (r.status === 200 && d.ok && d.in && d.session) { cleanUrl(); if (door().signedIn) return door().signedIn(d.session, d.kind || 'customer'); return location.replace(location.pathname); }
      if (r.status === 200 && d.ok) { cleanUrl(); return done(d.message); }
      b.disabled = false; b.textContent = t('confGo'); err.textContent = d.error || t('fail');
    }, function(){ b.disabled = false; b.textContent = t('confGo'); err.textContent = t('fail'); });
  });
}
function done(msg){
  screen('su2Done', [h('h2', { text: t('doneT') }), h('p', { id: 'su2DoneMsg', text: msg }), h('button', { type: 'button', class: 'btn', id: 'su2DoneSignin', text: t('home'), on: { click: function(){ toSignin(); } } })]);
}

/* ── the sign-in screen gets "New here? Sign up" (added beside portal.html's own buttons — nothing of theirs is changed) ── */
function decorate(){
  var box = $('signinBox'); if (!box || $('siNewHere')) return;
  if (!$('siLogin') && !$('siEmail')) return;   /* only the e-mail + password step */
  css();
  var b = h('button', { type: 'button', class: 'btn navy', id: 'siNewHere', text: t('newHere'), on: { click: function(){ choose(); } } });
  var anchor = $('siSignup') || $('siForgot');
  if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor); else box.appendChild(b);
}
function watch(){
  var m = main(); if (!m || m.__su2) return; m.__su2 = true;
  try { new MutationObserver(function(){ decorate(); }).observe(m, { childList: true, subtree: false }); } catch (e) {}
  decorate();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

window.GCSignup = {
  wants: function(){ return !!(q('signup-confirm') || /^(customer|sub|supplier|other|1|)$/.test(q('signup')) && /[?&]signup=/.test(location.search)); },
  start: function(){
    watch();
    var code = q('signup-confirm');
    if (code) return confirmScreen(code);
    var kind = q('signup'), job = q('job');
    JOB = /^v1\.[A-Za-z0-9_.-]{10,260}$/.test(job) ? job : '';
    if (kind === 'customer' || JOB) return form('customer');
    if (kind === 'other') return form('other');
    if (kind === 'supplier') return supplier();
    if (kind === 'sub') return pick('sub');
    return choose();
  },
  choose: choose, decorate: decorate
};
})();
