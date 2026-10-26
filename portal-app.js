/* GrayCo Portal — the working portal for companies that work with GrayCo (build 33.151).
   Loaded by portal.html only after the server says this sign-in / link is one of theirs.
   Everything goes through /.netlify/functions/portal-access with the signed-in session (x-portal-session).
   English / Español: every string is in L below; the choice is remembered on this device. */
(function(){
'use strict';
var FN = '/.netlify/functions/portal-access';
var OFFICE = '901-585-0944';   /* LEGAL2-patch */
var L = {
  en: {
    hi: 'Welcome', portal: 'GrayCo Portal', home: 'Home', jobs: 'Jobs', pay: 'Pay', papers: 'Papers', back: '‹ Back', close: 'Close',
    needs: 'Needs you', nothingNeeded: 'Nothing waiting on you. Thank you!', week: 'This week', noWeek: 'Nothing on the schedule this week.',
    money: 'Money', submitted: 'Submitted', approvedM: 'Approved', paidMonth: 'Paid this month', yourJobs: 'Your jobs', noJobs: 'No jobs with GrayCo yet. Your Project Manager adds you to a job, and it shows up here.',
    newScope: 'New scope', unread: 'new message', unreads: 'new messages', starts: 'starts', ends: 'ends', done: 'done',
    nScope: 'Sub agreement to sign', nCo: 'Change order to sign', nPunch: 'Punch item', nMsg: 'Messages from GrayCo', nCoiExp: 'Insurance certificate has run out — upload a new one', nCoiSoon: 'Insurance certificate runs out in {d} days — upload a new one', nW9: 'GrayCo needs your W-9',
    overview: 'Overview', scope: 'Scope', cos: 'Change orders', photos: 'Photos', progress: 'Progress', punch: 'Punch list', invoices: 'Invoices', messages: 'Messages',
    address: 'Address', maps: 'Open in Maps', po: 'PO#', dates: 'Dates', schedule: 'Your days on the schedule', site: 'Site notes', gate: 'Gate code', parking: 'Parking', hours: 'Work hours', dumpster: 'Dumpster', power: 'Power', water: 'Water', notes: 'Notes', none: '—',
    pm: 'Your Project Manager', call: 'Call', text: 'Text', email: 'E-mail', office: 'GrayCo office', customer: 'Customer',
    version: 'Version', date: 'Date', area: 'Area', desc: 'Work', qty: 'Qty', unit: 'Unit', meas: 'Measurement', included: 'Included', excluded: 'Not included', matGc: 'Material GrayCo provides', matSub: 'Material you provide',
    files: 'Plans, drawings and specs', open: 'Open', yourTotal: 'Your total for this scope', coTotal: 'Amount of this change order', accept: '✍️ Review & sign', acceptScope: '✍️ Review & sign', ask: 'Ask a question', accepted: 'Signed',
    signTitle: 'Sign', signAgreeScope: 'I agree to do this scope of work for {amt} as written above (sub agreement with GrayCo Construction Services, version {v}).', signAgreeCo: 'I agree to this change order for {amt} as written above (version {v}).',
    signName: 'Your full name', signDraw: 'Draw your signature (or leave it blank and sign with your typed name):', signClear: 'Clear signature', signBtn: 'Sign', signNeedName: 'Please type your full name.', signNeedAgree: 'Please tick the box to agree.', signedBy: 'Signed by {n}', signing: 'Signing…', asked: 'Question sent — your PM will answer in Messages',
    typeQ: 'Type your question', send: 'Send', cancel: 'Cancel', noScope: 'GrayCo has not sent a scope for this job yet.', noCo: 'No change orders.', confirmAccept: 'Accept this scope for {t}?',
    addPhotos: '📷 Add photos', photoNote: 'Note (optional)', noPhotos: 'No photos yet.', you: 'You', grayco: 'GrayCo',
    pct: '% done', postProgress: 'Post progress', progressNote: 'What got done today', noProgress: 'No progress posted yet.',
    noPunch: 'No punch items for you on this job.', markDone: 'Mark done with a photo', isDone: 'Done', due: 'due',
    newInvoice: '🧾 Send an invoice', amount: 'Amount', invNum: 'Your invoice #', againstScope: 'For', whole: 'This job', invFile: 'Invoice (PDF or photo)', invNote: 'Note (optional)',
    payRule: 'Invoices in by Wednesday are paid the Friday of the following week; later invoices are paid the Friday after that. GrayCo may mark an invoice Pay ASAP. Send invoices to invoices@grayco-cs.com (include the job name/PO).', stSubmitted: 'Submitted', stApproved: 'Approved', stScheduled: 'Scheduled for Friday pay', stPaid: 'Paid', stDeclined: 'Not approved — call the office', noInvoices: 'No invoices yet.', payOn: 'pay date', paidOn: 'paid',
    lien: 'A signed lien waiver is required for this job. Upload it under Papers.',
    msgPh: 'Write a message', noMsgs: 'No messages yet. Write to your Project Manager here.', read: 'Read', sentM: 'Sent', attach: '📎 Photo / file',
    w9: 'W-9', coi: 'Insurance certificate (COI)', agreement: 'Agreement with GrayCo', lienW: 'Lien waivers', onFile: 'On file', missing: 'Not on file', sentFile: 'Sent — GrayCo is filing it', expires: 'Expires', expired: 'Expired', upload: 'Upload', uploadNew: 'Upload new', expDate: 'Date it runs out', language: 'Language', score: 'Your GrayCo scorecard', scoreShow: 'Show my scorecard', scoreHide: 'Hide', scoreTips: 'How to raise it', scoreNote: 'From your on-time work, punch items, callbacks, paperwork and your PM\u2019s rating. Only you and GrayCo see it.',
    bidsTitle: 'GrayCo bids', bidsInvite: "You're invited to bid on GrayCo jobs at bids.grayco-cs.com.", bidsAccept: 'Accept invite', bidsPw: 'Choose a password for the bid site (8 or more characters)', bidsWaiting: 'Waiting for GrayCo approval. You get an e-mail when you can sign in.', bidsApproved: 'Approved — sign in with your e-mail and password.', bidsOpen: 'Open bids.grayco-cs.com', bidsOff: 'Bid site access is turned off. Call the office.', bidsNoEmail: 'GrayCo needs your e-mail on file first. Call the office.',
    signout: 'Sign out', saved: 'Sent to GrayCo', failed: 'That did not go through. Try again.', sending: 'Sending…', tooBig: 'That file is too big (4 MB at most).', pickFile: 'Pick a file first.',
    dlicense: 'GrayCo Construction Services · TN #85034 BCB · AR #0486990627 · MS #27769', jobsTo: 'Jobs to bid', loadFail: 'Could not load. Check your signal and try again.',
    awarded: 'Awarded', inprogress: 'In Progress', complete: 'Complete', bidding: 'Bidding'
  },
  es: {
    hi: 'Bienvenido', portal: 'Portal GrayCo', home: 'Inicio', jobs: 'Trabajos', pay: 'Pagos', papers: 'Papeles', back: '‹ Atrás', close: 'Cerrar',
    needs: 'Pendiente para usted', nothingNeeded: 'Nada pendiente. ¡Gracias!', week: 'Esta semana', noWeek: 'Nada en el calendario esta semana.',
    money: 'Dinero', submitted: 'Enviado', approvedM: 'Aprobado', paidMonth: 'Pagado este mes', yourJobs: 'Sus trabajos', noJobs: 'Todavía no tiene trabajos con GrayCo. Su Gerente de Proyecto lo agrega a un trabajo y aparece aquí.',
    newScope: 'Alcance nuevo', unread: 'mensaje nuevo', unreads: 'mensajes nuevos', starts: 'empieza', ends: 'termina', done: 'hecho',
    nScope: 'Acuerdo de subcontrato para firmar', nCo: 'Orden de cambio para firmar', nPunch: 'Pendiente de la lista final', nMsg: 'Mensajes de GrayCo', nCoiExp: 'El certificado de seguro venció — suba uno nuevo', nCoiSoon: 'El certificado de seguro vence en {d} días — suba uno nuevo', nW9: 'GrayCo necesita su W-9',
    overview: 'Resumen', scope: 'Alcance', cos: 'Órdenes de cambio', photos: 'Fotos', progress: 'Avance', punch: 'Lista final', invoices: 'Facturas', messages: 'Mensajes',
    address: 'Dirección', maps: 'Abrir en Mapas', po: 'PO#', dates: 'Fechas', schedule: 'Sus días en el calendario', site: 'Notas del sitio', gate: 'Código del portón', parking: 'Estacionamiento', hours: 'Horario de trabajo', dumpster: 'Contenedor de basura', power: 'Electricidad', water: 'Agua', notes: 'Notas', none: '—',
    pm: 'Su Gerente de Proyecto', call: 'Llamar', text: 'Mensaje de texto', email: 'Correo', office: 'Oficina de GrayCo', customer: 'Cliente',
    version: 'Versión', date: 'Fecha', area: 'Área', desc: 'Trabajo', qty: 'Cant.', unit: 'Unidad', meas: 'Medida', included: 'Incluido', excluded: 'No incluido', matGc: 'Material que pone GrayCo', matSub: 'Material que pone usted',
    files: 'Planos, dibujos y especificaciones', open: 'Abrir', yourTotal: 'Su total por este alcance', coTotal: 'Monto de esta orden de cambio', accept: '✍️ Revisar y firmar', acceptScope: '✍️ Revisar y firmar', ask: 'Hacer una pregunta', accepted: 'Firmado',
    signTitle: 'Firmar', signAgreeScope: 'Acepto hacer este alcance de trabajo por {amt} como está escrito arriba (acuerdo de subcontrato con GrayCo Construction Services, versión {v}).', signAgreeCo: 'Acepto esta orden de cambio por {amt} como está escrita arriba (versión {v}).',
    signName: 'Su nombre completo', signDraw: 'Dibuje su firma (o déjela en blanco y firme con su nombre escrito):', signClear: 'Borrar firma', signBtn: 'Firmar', signNeedName: 'Por favor escriba su nombre completo.', signNeedAgree: 'Por favor marque la casilla para aceptar.', signedBy: 'Firmado por {n}', signing: 'Firmando…', asked: 'Pregunta enviada — su gerente contestará en Mensajes',
    typeQ: 'Escriba su pregunta', send: 'Enviar', cancel: 'Cancelar', noScope: 'GrayCo todavía no ha enviado un alcance para este trabajo.', noCo: 'No hay órdenes de cambio.', confirmAccept: '¿Acepta este alcance para {t}?',
    addPhotos: '📷 Agregar fotos', photoNote: 'Nota (opcional)', noPhotos: 'Todavía no hay fotos.', you: 'Usted', grayco: 'GrayCo',
    pct: '% hecho', postProgress: 'Publicar avance', progressNote: 'Lo que se hizo hoy', noProgress: 'Todavía no hay avance publicado.',
    noPunch: 'No tiene pendientes en este trabajo.', markDone: 'Marcar hecho con una foto', isDone: 'Hecho', due: 'para el',
    newInvoice: '🧾 Enviar una factura', amount: 'Monto', invNum: 'Su factura #', againstScope: 'Por', whole: 'Este trabajo', invFile: 'Factura (PDF o foto)', invNote: 'Nota (opcional)',
    payRule: 'Las facturas recibidas antes del miércoles se pagan el viernes de la semana siguiente; las demás, el viernes posterior. GrayCo puede marcar una factura como Pay ASAP. Envíe las facturas a invoices@grayco-cs.com (con el nombre del trabajo y el PO).', stSubmitted: 'Enviada', stApproved: 'Aprobada', stScheduled: 'Programada para el pago del viernes', stPaid: 'Pagada', stDeclined: 'No aprobada — llame a la oficina', noInvoices: 'Todavía no hay facturas.', payOn: 'fecha de pago', paidOn: 'pagada',
    lien: 'Este trabajo requiere una renuncia de gravamen (lien waiver) firmada. Súbala en Papeles.',
    msgPh: 'Escriba un mensaje', noMsgs: 'Todavía no hay mensajes. Escríbale a su Gerente de Proyecto aquí.', read: 'Leído', sentM: 'Enviado', attach: '📎 Foto / archivo',
    w9: 'W-9', coi: 'Certificado de seguro (COI)', agreement: 'Acuerdo con GrayCo', lienW: 'Renuncias de gravamen', onFile: 'En archivo', missing: 'No está en archivo', sentFile: 'Enviado — GrayCo lo está archivando', expires: 'Vence', expired: 'Vencido', upload: 'Subir', uploadNew: 'Subir nuevo', expDate: 'Fecha en que vence', language: 'Idioma', score: 'Su calificación con GrayCo', scoreShow: 'Ver mi calificación', scoreHide: 'Ocultar', scoreTips: 'Cómo subirla', scoreNote: 'Según trabajos a tiempo, pendientes, llamadas de garantía, papeles y la calificación de su gerente. Solo usted y GrayCo la ven.',
    bidsTitle: 'Licitaciones GrayCo', bidsInvite: 'Está invitado a licitar trabajos de GrayCo en bids.grayco-cs.com.', bidsAccept: 'Aceptar invitación', bidsPw: 'Escoja una contraseña para el sitio de licitaciones (8 caracteres o más)', bidsWaiting: 'Esperando la aprobación de GrayCo. Recibirá un correo cuando pueda entrar.', bidsApproved: 'Aprobado — entre con su correo y su contraseña.', bidsOpen: 'Abrir bids.grayco-cs.com', bidsOff: 'El acceso al sitio de licitaciones está apagado. Llame a la oficina.', bidsNoEmail: 'GrayCo necesita su correo en archivo primero. Llame a la oficina.',
    signout: 'Salir', saved: 'Enviado a GrayCo', failed: 'No se pudo enviar. Intente otra vez.', sending: 'Enviando…', tooBig: 'El archivo es muy grande (4 MB como máximo).', pickFile: 'Escoja un archivo primero.',
    dlicense: 'GrayCo Construction Services · TN #85034 BCB · AR #0486990627 · MS #27769', jobsTo: 'Trabajos para licitar', loadFail: 'No se pudo cargar. Revise su señal e intente otra vez.',
    awarded: 'Adjudicado', inprogress: 'En progreso', complete: 'Terminado', bidding: 'Licitando'
  }
};
/* patch X10 */
Object.assign(L.en, { avail: 'My schedule & days off', availBtn: 'Open my calendar', availNote: 'Tap a day to mark it busy (you can’t work that day); tap again to clear it. Your PM sees it when scheduling.',
  busy: 'Busy', free: 'Open', scheduled: 'Scheduled', availSaved: 'Saved — your PM will see it', availLoad: 'Loading your calendar…', codes: 'Access codes', codesBtn: 'Show access codes',
  codesNote: 'Lockbox / gate / door codes show here only on the days you are scheduled on this job. Every look is logged. Never share them.', codesNone: 'No codes for this job.',
  codesNotToday: 'Codes show only on the days you are scheduled on this job.' });
Object.assign(L.es, { avail: 'Mi calendario y días libres', availBtn: 'Abrir mi calendario', availNote: 'Toque un día para marcarlo ocupado (no puede trabajar ese día); tóquelo otra vez para quitarlo. Su PM lo ve al programar.',
  busy: 'Ocupado', free: 'Libre', scheduled: 'Programado', availSaved: 'Guardado — su PM lo verá', availLoad: 'Cargando su calendario…', codes: 'Códigos de acceso', codesBtn: 'Mostrar códigos de acceso',
  codesNote: 'Los códigos de caja de llaves / portón / puerta aparecen aquí solo los días que usted está programado en este trabajo. Cada consulta queda registrada. Nunca los comparta.', codesNone: 'No hay códigos para este trabajo.',
  codesNotToday: 'Los códigos aparecen solo los días que usted está programado en este trabajo.' });
var X10_ES = { l: { ontime: 'A tiempo', punch: 'Lista de pendientes', callbacks: 'Llamadas de garantía', papers: 'Papeles', rating: 'Calificación del PM' },
  tips: { 'Upload a current insurance certificate (COI).': 'Suba un certificado de seguro (COI) vigente.', 'Send GrayCo your W-9.': 'Envíe su W-9 a GrayCo.', 'Great work — keep it up.': 'Excelente trabajo — siga así.',
    'Finish scheduled tasks by their end date — tell your PM early when something slips.': 'Termine las tareas programadas para su fecha final — avise a su PM a tiempo si algo se atrasa.' } };
function x10Es(txt){ if (LANG !== 'es') return txt; return String(txt || '').replace(/ of /g, ' de ').replace('scheduled tasks finished on time', 'tareas programadas terminadas a tiempo').replace('punch items closed within a week', 'pendientes cerrados en una semana').replace('open over a week', 'abiertos más de una semana')
  .replace('No callbacks', 'Sin llamadas de garantía').replace(/warranty callbacks?/, 'llamada(s) de garantía').replace(/ on (\d+) jobs?/, ' en $1 trabajo(s)').replace('COI current', 'COI vigente').replace('COI missing or expired', 'COI faltante o vencido').replace('W-9 on file', 'W-9 en archivo').replace('W-9 missing', 'W-9 faltante').replace(/^Average /, 'Promedio ').replace(/ from (\d+) jobs?/, ' de $1 trabajo(s)'); }
function availSheet(){
  var body = h('div', null, [h('div', { class: 'muted', text: t('availLoad') })]), sh = sheet(t('avail'), [body]), D = null;
  function paint(){
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'muted', text: t('availNote') }));
    var busyMap = {}; (D.busy || []).forEach(function(b){ busyMap[b.date] = b; });
    var sched = {}; (D.sched || []).forEach(function(x){ (sched[x.date] = sched[x.date] || []).push(x); });
    var start = new Date(D.today + 'T12:00:00'), grid = h('div', { class: 'gc-avail', style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:10px' });
    var lead = start.getDay(); for (var i = 0; i < lead; i++) grid.appendChild(h('div'));
    for (var k = 0; k < 56; k++) {
      var d = new Date(start.getTime() + k * 864e5), ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      (function(ymd, isB, sc, day){
        grid.appendChild(h('button', { type: 'button', 'data-day': ymd, 'aria-pressed': isB ? 'true' : 'false', 'aria-label': dt(ymd) + ' — ' + (isB ? t('busy') : sc ? t('scheduled') : t('free')),
          style: 'min-height:54px;border-radius:8px;border:1px solid ' + (isB ? '#b91c1c' : sc ? '#1d4ed8' : '#d6d0c0') + ';background:' + (isB ? '#fee2e2' : sc ? '#dbeafe' : '#fff') + ';font:600 13px Arial;cursor:pointer;padding:2px',
          on: { click: function(){ api('p-avail-set', { days: [ymd], busy: !isB }).then(function(r){ D = r; paint(); toast(t('availSaved')); }, function(e){ toast(e.message, true); }); } } },
          [h('div', { text: String(day) }), h('div', { style: 'font-size:10px', text: isB ? t('busy') : sc ? '🔨' : '' })]));
      })(ymd, !!busyMap[ymd], sched[ymd], d.getDate());
    }
    body.appendChild(grid);
    var list = (D.sched || []).slice(0, 30);
    if (list.length) body.appendChild(card(t('scheduled'), list.map(function(x){ return lateRow(x, h('div', { class: 'line' }, [h('span', { text: dts(x.date) + (x.time ? ' · ' + x.time : '') }), h('span', { text: x.job + (x.title ? ' — ' + x.title : '') })])); })));
  }
  api('p-avail').then(function(r){ D = r; paint(); }, function(e){ body.innerHTML = ''; body.appendChild(h('div', { class: 'muted', text: e.message || t('loadFail') })); });
  return sh;
}
function codesCard(pid){
  var box = h('div', { class: 'gc-codes' });
  box.appendChild(h('div', { class: 'muted', text: t('codesNote') }));
  var b = h('button', { type: 'button', class: 'btn', text: '🔐 ' + t('codesBtn'), on: { click: function(){ busy(b, true); api('p-codes', { projectId: pid }).then(function(r){ b.remove();
    if (!r.codes || !r.codes.length) { box.appendChild(h('div', { class: 'empty', text: r.why === 'not-today' ? t('codesNotToday') : t('codesNone') })); return; }
    r.codes.forEach(function(c){ box.appendChild(h('div', { class: 'line' }, [h('span', { text: c.label }), h('b', { style: 'font-size:20px;letter-spacing:2px', text: c.code })])); }); }, function(e){ busy(b, false); toast(e.message, true); }); } } });
  box.appendChild(b);
  return card(t('codes'), [box]);
}
var LANG = 'en', session = '', H = null, HOME = null, JOB = null, TAB = 'home', JTAB = 'overview', root = null;
function t(k, v){ var s = (L[LANG] && L[LANG][k]) || L.en[k] || k; if (v) Object.keys(v).forEach(function(x){ s = s.replace('{' + x + '}', v[x]); }); return s; }

/* ── tiny DOM helpers ── */
function safeUrl(u){ return /^(https:\/\/|tel:|sms:|mailto:|#|blob:)/i.test(String(u || '')); }
function h(tag, attrs, kids){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    var v = attrs[k]; if (v == null || v === false) return;
    if (k === 'text') el.textContent = v;
    else if (k === 'on') Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); });
    else if ((k === 'href' || k === 'src') && !safeUrl(v)) return;
    else el.setAttribute(k, v === true ? '' : String(v));
  });
  (kids || []).forEach(function(c){ if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function usd(n){ n = Number(n) || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function dt(s){ if (!s) return ''; var d = new Date(String(s).length === 10 ? s + 'T12:00:00' : s); return isNaN(d) ? '' : d.toLocaleDateString(LANG === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function dts(s){ if (!s) return ''; var d = new Date(String(s).length === 10 ? s + 'T12:00:00' : s); return isNaN(d) ? '' : d.toLocaleDateString(LANG === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function tm(s){ var d = new Date(s); return isNaN(d) ? '' : d.toLocaleString(LANG === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function telOf(p){ return 'tel:' + String(p || '').replace(/[^0-9+]/g, ''); }
function smsOf(p){ return 'sms:' + String(p || '').replace(/[^0-9+]/g, ''); }
function card(title, kids, cls){ return h('section', { class: 'card' + (cls ? ' ' + cls : '') }, [title ? h('h2', { text: title }) : null].concat(kids || [])); }
function pill(text, cls){ return h('span', { class: 'pill ' + (cls || 'now'), text: text }); }
function toast(msg, bad){ var x = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status', text: msg }); document.body.appendChild(x); setTimeout(function(){ if (x.parentNode) x.parentNode.removeChild(x); }, 3800); }
function statusWord(s){ var k = String(s || '').toLowerCase(); if (/progress/.test(k)) return t('inprogress'); if (/complete/.test(k)) return t('complete'); if (/bid/.test(k)) return t('bidding'); return t('awarded'); }
/* patch SUBTXT: "Can't make it / running late" under each of my coming days — it goes straight to my PM (and the office) */
Object.assign(L.en, { late: '⚠️ Can’t make it / running late', lateCant: 'Can’t make it', lateLate: 'Running late', lateOther: 'Something else', lateText: 'What is going on? Your PM gets this right away.', lateSend: 'Send to my PM', lateSent: 'Sent — your PM has it', lateNeed: 'Pick one or type a note.' });
Object.assign(L.es, { late: '⚠️ No puedo ir / voy tarde', lateCant: 'No puedo ir', lateLate: 'Voy tarde', lateOther: 'Otra cosa', lateText: '¿Qué pasa? Su PM lo recibe enseguida.', lateSend: 'Enviar a mi PM', lateSent: 'Enviado — su PM ya lo tiene', lateNeed: 'Elija una opción o escriba una nota.' });
function todayYmd(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function lateRow(x, line){
  if (!x || !x.pid || !x.date || x.date < todayYmd()) return line;
  var kind = '', wrap = h('div', { class: 'late-wrap' }), form = null;
  var btn = h('button', { type: 'button', class: 'btn late-btn', 'data-late': x.pid + '|' + x.date, text: t('late'), on: { click: function(){
    if (form) { form.remove(); form = null; return; }
    var ta = h('textarea', { rows: '3', 'aria-label': t('lateText'), placeholder: t('lateText'), class: 'late-ta' });
    var pick = function(k, el){ kind = k; Array.prototype.forEach.call(form.querySelectorAll('.late-k'), function(b){ b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); }); };
    var kb = function(k, label){ var b = h('button', { type: 'button', class: 'btn late-k', 'aria-pressed': 'false', text: label, on: { click: function(){ pick(k, b); } } }); return b; };
    var send = h('button', { type: 'button', class: 'btn gold', text: t('lateSend'), on: { click: function(){
      var txt = ta.value.trim(); if (!kind && !txt) { toast(t('lateNeed'), true); return; }
      send.disabled = true;
      api('p-late', { projectId: x.pid, day: x.date, time: x.time || '', title: x.title || '', kind: kind || 'other', text: txt }).then(function(){ toast(t('lateSent')); if (form) { form.remove(); form = null; } btn.textContent = '✓ ' + t('lateSent'); })
        .catch(function(e){ send.disabled = false; toast(e.message || 'Error', true); });
    } } });
    form = h('div', { class: 'late-form' }, [h('div', { class: 'late-ks' }, [kb('cant', t('lateCant')), kb('late', t('lateLate')), kb('other', t('lateOther'))]), ta, send]);
    wrap.appendChild(form);
  } } });
  wrap.insertBefore(line, null); wrap.appendChild(btn);
  return wrap;
}

/* ── the server ── */
function api(action, body){
  return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-session': session }, cache: 'no-store', credentials: 'omit', body: JSON.stringify(Object.assign({ action: action }, body || {})) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (r.status === 404 && /not active/i.test(j.error || '')) { H.ended(); throw new Error(j.error); } if (!r.ok || !j.ok) throw new Error(j.error || t('failed')); return j; }); });
}
/* a picked file → base64 (photos are made small first: longest side 1600 px, JPEG) */
function readFile(file){
  return new Promise(function(res, rej){
    if (!file) return rej(new Error(t('pickFile')));
    if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function(){
        var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var d = c.toDataURL('image/jpeg', 0.72); res({ name: (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg', data: d.split(',')[1] });
      };
      img.onerror = function(){ URL.revokeObjectURL(url); plain(); };
      img.src = url; return;
    }
    plain();
    function plain(){
      if (file.size > 4.5 * 1024 * 1024) return rej(new Error(t('tooBig')));
      var fr = new FileReader(); fr.onload = function(){ res({ name: file.name || 'file', data: String(fr.result).split(',')[1] }); }; fr.onerror = function(){ rej(new Error(t('failed'))); }; fr.readAsDataURL(file);
    }
  });
}
function upload(file, purpose, pid){ return readFile(file).then(function(f){ return api('p-upload', { projectId: pid || undefined, purpose: purpose, name: f.name, data: f.data }); }); }
function picker(accept, multiple, cb){ var i = h('input', { type: 'file', accept: accept, multiple: multiple ? true : null, style: 'display:none' }); i.addEventListener('change', function(){ cb(Array.prototype.slice.call(i.files || [])); i.remove(); }); document.body.appendChild(i); i.click(); }
function busy(btn, on){ if (!btn) return; btn.disabled = !!on; if (on) { btn.__t = btn.textContent; btn.textContent = t('sending'); } else if (btn.__t) btn.textContent = btn.__t; }

/* ── a sheet (full screen on a phone, centered on a computer) with a visible ‹ Back / ✕ ── */
function sheet(title, kids){
  var ov = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title });
  function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', key); }
  function key(e){ if (e.key === 'Escape') close(); }
  ov.appendChild(h('div', { class: 'sheet-in' }, [
    h('div', { class: 'sheet-top' }, [h('button', { type: 'button', class: 'back', text: t('back'), on: { click: close } }), h('b', { text: title }), h('button', { type: 'button', class: 'x', 'aria-label': t('close'), text: '✕', on: { click: close } })]),
    h('div', { class: 'sheet-body' }, kids)]));
  document.addEventListener('keydown', key);
  document.body.appendChild(ov);
  return { el: ov, close: close };
}
function field(label, input){ return h('label', { class: 'fld' }, [h('span', { text: label }), input]); }

/* ── HOME ── */
function needRow(n){
  var label, go = null;
  if (n.kind === 'scope') label = t('nScope') + ' — ' + n.job;
  else if (n.kind === 'co') label = t('nCo') + ' — ' + n.job;
  else if (n.kind === 'punch') label = t('nPunch') + ': ' + n.title + ' — ' + n.job;
  else if (n.kind === 'message') label = t('nMsg') + ' (' + n.count + ') — ' + n.job;
  else if (n.kind === 'coi-expired') label = t('nCoiExp');
  else if (n.kind === 'coi-expiring') label = t('nCoiSoon', { d: n.days });
  else if (n.kind === 'w9') label = t('nW9');
  if (n.pid) go = function(){ openJob(n.pid, n.kind === 'scope' ? 'scope' : n.kind === 'co' ? 'cos' : n.kind === 'punch' ? 'punch' : n.kind === 'message' ? 'messages' : 'overview'); };
  else go = function(){ goTab('papers'); };
  return h('button', { type: 'button', class: 'need', on: { click: go } }, [h('span', { class: 'dotg', 'aria-hidden': 'true' }), h('span', { text: label }), h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })]);
}
function jobRow(j){
  var tags = [];
  if (j.newScope) tags.push(pill(t('newScope')));
  if (j.unread) tags.push(pill(j.unread + ' ' + t(j.unread === 1 ? 'unread' : 'unreads'), 'due'));
  if (!tags.length) tags.push(pill(statusWord(j.status), 'ok'));
  var sub = [j.address, j.start ? t('starts') + ' ' + dt(j.start) : '', j.pct ? j.pct + '% ' + t('done') : ''].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'jobrow', 'data-job': j.id, on: { click: function(){ openJob(j.id, 'overview'); } } }, [h('span', { class: 'grow' }, [h('b', { text: j.name }), h('span', { class: 'muted', text: sub })]), h('span', { class: 'tags' }, tags)]);
}
function bidsCard(b){
  if (!b) return null;
  var kids = [];
  if (b.state === 'invite') {
    kids.push(h('p', { class: 'muted', text: t('bidsInvite') }));
    if (b.canAccept) kids.push(h('button', { type: 'button', class: 'btn gold', id: 'bidsAccept', text: t('bidsAccept'), on: { click: function(){
      var pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: '8', class: 'inp', id: 'bidsPw' });
      var go = h('button', { type: 'button', class: 'btn gold', text: t('bidsAccept') });
      var sh = sheet(t('bidsTitle'), [h('p', { text: t('bidsInvite') }), field(t('bidsPw'), pw), go]);
      go.addEventListener('click', function(){ busy(go, true); api('p-bids', { password: pw.value }).then(function(){ sh.close(); toast(t('bidsWaiting')); reloadHome(); }, function(e){ busy(go, false); toast(e.message, true); }); });
    } } }));
    else kids.push(h('p', { class: 'muted', text: t('bidsNoEmail') }));
  } else if (b.state === 'waiting') kids.push(h('div', { class: 'row' }, [h('span', { text: t('bidsWaiting') }), pill(t('bidsTitle'))]));
  else if (b.state === 'approved') kids.push(h('p', { class: 'muted', text: t('bidsApproved') }), h('a', { class: 'btn navy', href: b.url, target: '_blank', rel: 'noopener', text: t('bidsOpen') }));
  else if (b.state === 'off') kids.push(h('p', { class: 'muted', text: t('bidsOff') }));
  if (!kids.length) return null;
  return card(t('bidsTitle'), kids, 'bids');
}
function contactCard(title, name, phone, email){
  var ini = String(name || 'G').split(/\s+/).map(function(x){ return x[0] || ''; }).join('').slice(0, 2).toUpperCase();
  return card(null, [
    h('div', { class: 'pm' }, [h('div', { class: 'av', text: ini }), h('div', { class: 'grow' }, [h('div', { class: 'muted', text: title }), h('div', { class: 'big', text: name }),
      h('div', { class: 'sel' }, [h('a', { href: telOf(phone), text: phone }), email ? ' · ' : '', email ? h('a', { href: 'mailto:' + email, text: email }) : null])])]),
    h('div', { class: 'btns3' }, [h('a', { class: 'btn gold', href: telOf(phone), text: '📞 ' + t('call') }), h('a', { class: 'btn', href: smsOf(phone), text: '💬 ' + t('text') }), email ? h('a', { class: 'btn', href: 'mailto:' + email, text: '✉️ ' + t('email') }) : null])]);
}
function home(){
  var v = HOME, out = [];
  var needs = v.needs || [];
  out.push(card(t('needs'), needs.length ? needs.map(needRow) : [h('div', { class: 'empty', text: t('nothingNeeded') })], 'needs'));
  var m = v.money || {};
  out.push(card(t('money'), [h('div', { class: 'money3' }, [
    h('div', null, [h('span', { class: 'muted', text: t('submitted') }), h('b', { text: usd(m.submitted) })]),
    h('div', null, [h('span', { class: 'muted', text: t('approvedM') }), h('b', { text: usd(m.approved) })]),
    h('div', null, [h('span', { class: 'muted', text: t('paidMonth') }), h('b', { text: usd(m.paidMonth) })])]), h('div', { class: 'muted', text: t('payRule') }), h('div', { class: 'muted' }, [h('a', { href: 'mailto:invoices@grayco-cs.com', text: 'invoices@grayco-cs.com' })])]));   /* EMAILMAP-patch */
  var wk = v.week || [];
  out.push(card(t('week'), wk.length ? wk.map(function(x){ return lateRow(x, h('div', { class: 'line' }, [h('span', { text: dts(x.date) + (x.time ? ' · ' + x.time : '') }), h('span', { text: x.job + (x.title ? ' — ' + x.title : '') })])); }) : [h('div', { class: 'empty', text: t('noWeek') })]));
  out.push(card(t('avail'), [h('button', { type: 'button', class: 'btn', text: '📅 ' + t('availBtn'), on: { click: availSheet } })]));   /* patch X10 */
  out.push(card(t('yourJobs'), (v.jobs || []).length ? v.jobs.map(jobRow) : [h('div', { class: 'empty', text: t('noJobs') })]));
  var bc = bidsCard(v.bids); if (bc) out.push(bc);
  var pm = (v.jobs || [])[0] && v.jobs[0].pm;
  out.push(contactCard(pm && pm.name && pm.name !== 'GrayCo office' ? t('pm') : t('office'), pm ? pm.name : t('office'), pm ? pm.phone : OFFICE, pm ? pm.email : 'office@grayco-cs.com'));
  return out;
}
function jobsTab(){ return [card(t('yourJobs'), (HOME.jobs || []).length ? HOME.jobs.map(jobRow) : [h('div', { class: 'empty', text: t('noJobs') })])]; }

/* ── PAY ── */
function invRow(x){
  var st = x.state === 'paid' ? t('stPaid') : x.state === 'approved' ? (x.payDate ? t('stScheduled') : t('stApproved')) : x.state === 'declined' ? t('stDeclined') : t('stSubmitted');
  var steps = ['submitted', 'approved', 'scheduled', 'paid'], at = x.state === 'paid' ? 3 : x.state === 'approved' ? (x.payDate ? 2 : 1) : 0;
  var bar = h('ol', { class: 'track', 'aria-label': st }, steps.map(function(k, i){ return h('li', { class: i <= at ? 'on' : '' }, [h('span', { text: t(k === 'submitted' ? 'stSubmitted' : k === 'approved' ? 'stApproved' : k === 'scheduled' ? 'stScheduled' : 'stPaid') })]); }));
  var when = x.state === 'paid' ? t('paidOn') + ' ' + dt(x.paidDate) : x.payDate ? t('payOn') + ' ' + dt(x.payDate) : dt(x.submitted);
  return h('div', { class: 'inv' }, [h('div', { class: 'row' }, [h('span', null, [h('b', { text: usd(x.amount) }), ' ', h('span', { class: 'muted', text: [x.job, x.number ? '#' + x.number : '', x.po ? t('po') + ' ' + x.po : ''].filter(Boolean).join(' · ') })]), pill(st, x.state === 'paid' ? 'ok' : x.state === 'declined' ? 'due' : 'now')]),
    x.state !== 'declined' ? bar : null, h('div', { class: 'muted', text: when })]);
}
function payTab(){
  var inv = HOME.invoices || [];
  return [card(t('invoices'), [h('div', { class: 'how', text: t('payRule') }), (HOME.jobs || []).length ? h('button', { type: 'button', class: 'btn gold', id: 'payNewInv', text: t('newInvoice'), on: { click: function(){ invoiceSheet(null); } } }) : null]
    .concat(inv.length ? inv.map(invRow) : [h('div', { class: 'empty', text: t('noInvoices') })]))];
}
function invoiceSheet(pid){
  var jobs = HOME.jobs || [];
  var sel = h('select', { class: 'inp', id: 'invJob' }, jobs.map(function(j){ return h('option', { value: j.id, text: j.name }); }));
  if (pid) sel.value = pid;
  var scopeSel = h('select', { class: 'inp', id: 'invFor' }, [h('option', { value: '', text: t('whole') })]);
  function fillScopes(){
    scopeSel.innerHTML = ''; scopeSel.appendChild(h('option', { value: '', text: t('whole') }));
    var js = JOB && JOB.job && JOB.job.id === sel.value ? JOB : null;
    if (js) js.scopes.concat(js.cos).forEach(function(x){ scopeSel.appendChild(h('option', { value: x.id, text: x.title })); });
    poBox.value = js ? js.job.po : '';
  }
  var amt = h('input', { class: 'inp', id: 'invAmt', type: 'number', inputmode: 'decimal', min: '0', step: '0.01' });
  var num = h('input', { class: 'inp', id: 'invNum' });
  var poBox = h('input', { class: 'inp', id: 'invPo', readonly: true });
  var note = h('input', { class: 'inp', id: 'invNote' });
  var file = null, fname = h('span', { class: 'muted', text: '' });
  var pick = h('button', { type: 'button', class: 'btn', id: 'invPick', text: '📎 ' + t('invFile'), on: { click: function(){ picker('application/pdf,image/*', false, function(fs){ file = fs[0] || null; fname.textContent = file ? file.name : ''; }); } } });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'invSend', text: t('send') });
  sel.addEventListener('change', fillScopes);
  var sh = sheet(t('newInvoice'), [h('div', { class: 'how', text: t('payRule') }), field(t('jobs'), sel), field(t('againstScope'), scopeSel), field(t('amount'), amt), field(t('invNum'), num), field(t('po'), poBox), field(t('invNote'), note), h('div', { class: 'row' }, [pick, fname]), go]);
  fillScopes();
  go.addEventListener('click', function(){
    busy(go, true);
    (file ? upload(file, 'invoice', sel.value) : Promise.resolve(null)).then(function(u){
      return api('p-invoice', { projectId: sel.value, amount: amt.value, invNum: num.value, note: note.value, scopeId: scopeSel.value, uploadId: u ? u.id : undefined });
    }).then(function(r){ sh.close(); toast(t('saved') + ' · ' + t('payOn') + ' ' + dt(r.payDate)); reloadHome(); if (JOB) openJob(JOB.job.id, 'invoices'); }, function(e){ busy(go, false); toast(e.message, true); });
  });
}

/* ── PAPERS ── */
function paperRow(k, label, st, needsExp){
  var tag = st.sent ? pill(t('sentFile')) : st.onFile ? (st.days != null && st.days < 0 ? pill(t('expired') + ' ' + dt(st.exp), 'due') : st.days != null && st.days <= 30 ? pill(t('expires') + ' ' + dt(st.exp), 'now') : pill(t('onFile') + (st.exp ? ' · ' + t('expires') + ' ' + dt(st.exp) : ''), 'ok')) : pill(t('missing'), 'due');
  var btn = h('button', { type: 'button', class: 'btn', 'data-paper': k, text: st.onFile ? t('uploadNew') : t('upload'), on: { click: function(){ paperSheet(k, label, needsExp); } } });
  return h('div', { class: 'paper' }, [h('div', { class: 'row' }, [h('b', { text: label }), tag]), btn]);
}
function paperSheet(k, label, needsExp){
  var file = null, fname = h('span', { class: 'muted' });
  var exp = h('input', { class: 'inp', type: 'date', id: 'paperExp' });
  var pick = h('button', { type: 'button', class: 'btn', id: 'paperPick', text: '📎 ' + t('upload'), on: { click: function(){ picker('application/pdf,image/*', false, function(fs){ file = fs[0] || null; fname.textContent = file ? file.name : ''; }); } } });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'paperSend', text: t('send') });
  var sh = sheet(label, [h('div', { class: 'row' }, [pick, fname]), needsExp ? field(t('expDate'), exp) : null, go]);
  go.addEventListener('click', function(){
    if (!file) { toast(t('pickFile'), true); return; }
    busy(go, true);
    upload(file, k, null).then(function(u){ return api('p-paper', { paper: k, exp: exp.value, uploadId: u.id }); })
      .then(function(){ sh.close(); toast(t('saved')); reloadHome(); }, function(e){ busy(go, false); toast(e.message, true); });
  });
}
function papersTab(){
  var p = HOME.papers || {};
  var langBox = h('div', { class: 'btns' }, [h('button', { type: 'button', class: 'btn' + (LANG === 'en' ? ' navy' : ''), 'aria-pressed': LANG === 'en' ? 'true' : 'false', disabled: LANG === 'en', text: 'English', on: { click: function(){ setLang('en', true); } } }), h('button', { type: 'button', class: 'btn' + (LANG === 'es' ? ' navy' : ''), 'aria-pressed': LANG === 'es' ? 'true' : 'false', disabled: LANG === 'es', text: 'Español', on: { click: function(){ setLang('es', true); } } })]);
  return [card(t('papers'), [paperRow('w9', t('w9'), p.w9 || {}), paperRow('coi', t('coi'), p.coi || {}, true), paperRow('agreement', t('agreement'), p.agreement || {}), paperRow('lien', t('lienW'), { onFile: false, sent: (p.lien || {}).sent })]),
    card(t('language'), [langBox]), scoreCard()];
}

/* patch AUTO7: the scorecard — in Papers (the settings page), closed until they open it; only their own numbers */
var SCORE = null, scoreOpen = false;
function scoreCard(){
  var box = h('div', { class: 'gc-score' });
  function paint(){
    box.innerHTML = '';
    if (!scoreOpen) { box.appendChild(h('button', { type: 'button', class: 'btn', text: t('scoreShow'), on: { click: function(){ scoreOpen = true; if (!SCORE) api('p-score').then(function(j){ SCORE = j.score || null; paint(); }, function(){ SCORE = { err: true }; paint(); }); paint(); } } })); return; }
    if (!SCORE) { box.appendChild(h('div', { class: 'muted', text: '…' })); return; }
    if (SCORE.err) { box.appendChild(h('div', { class: 'muted', text: t('loadFail') })); return; }
    box.appendChild(h('div', { style: 'display:flex;align-items:baseline;gap:10px' }, [h('b', { style: 'font-size:34px', text: String(SCORE.score) }), h('span', { style: 'font-size:22px;font-weight:700', text: SCORE.letter })]));
    box.appendChild(h('div', { class: 'muted', text: t('scoreNote') }));
    (SCORE.parts || []).forEach(function(x){ box.appendChild(h('div', { style: 'margin-top:6px' }, [h('b', { text: (LANG === 'es' && X10_ES.l[x.k] || x.l) + ' — ' + x.pct + '%' }), h('div', { class: 'muted', text: x10Es(x.detail) })])); });
    if ((SCORE.tips || []).length) { box.appendChild(h('div', { style: 'margin-top:8px;font-weight:700', text: t('scoreTips') })); SCORE.tips.forEach(function(x){ box.appendChild(h('div', { text: '• ' + (LANG === 'es' && X10_ES.tips[x] || x10Es(x)) })); }); }
    box.appendChild(h('button', { type: 'button', class: 'btn', style: 'margin-top:8px', text: t('scoreHide'), on: { click: function(){ scoreOpen = false; paint(); } } }));
  }
  paint();
  return card(t('score'), [box]);
}

/* ── ONE JOB ── */
function jtabs(){
  var tabs = [['overview', 'overview'], ['scope', 'scope'], ['cos', 'cos'], ['photos', 'photos'], ['progress', 'progress'], ['punch', 'punch'], ['invoices', 'invoices'], ['messages', 'messages']];
  return h('div', { class: 'jtabs', role: 'tablist' }, tabs.map(function(x){
    var n = x[0] === 'messages' && JOB.unread ? ' (' + JOB.unread + ')' : x[0] === 'punch' ? ' (' + JOB.punch.filter(function(p){ return !p.done; }).length + ')' : '';
    return h('button', { type: 'button', role: 'tab', 'data-jtab': x[0], 'aria-selected': JTAB === x[0] ? 'true' : 'false', text: t(x[1]) + n, on: { click: function(){ JTAB = x[0]; drawJob(); } } });
  }));
}
function overview(){
  var j = JOB.job, s = j.site || {}, pm = JOB.pm || {}, out = [];
  out.push(card(null, [h('div', { class: 'big', text: j.name }),
    h('dl', { class: 'info' }, [h('dt', { text: t('address') }), h('dd', null, [j.address || t('none'), j.maps ? h('div', null, [h('a', { href: j.maps, target: '_blank', rel: 'noopener', class: 'lnk', text: '📍 ' + t('maps') })]) : null]),
      h('dt', { text: t('po') }), h('dd', { text: j.po || t('none') }), h('dt', { text: t('dates') }), h('dd', { text: [j.start ? t('starts') + ' ' + dt(j.start) : '', j.end ? t('ends') + ' ' + dt(j.end) : ''].filter(Boolean).join(' · ') || t('none') }),
      h('dt', { text: t('progress') }), h('dd', { text: (j.pct || 0) + '% ' + t('done') })]),
    JOB.lien && JOB.lien.required ? h('div', { class: 'how', text: t('lien') }) : null]));
  out.push(contactCard(t('pm'), pm.name, pm.phone, pm.email));
  if (j.customer) out.push(card(t('customer'), [h('div', { class: 'sel' }, [h('b', { text: j.customer.name }), j.customer.phone ? h('div', null, [h('a', { href: telOf(j.customer.phone), text: j.customer.phone })]) : null, j.customer.email ? h('div', null, [h('a', { href: 'mailto:' + j.customer.email, text: j.customer.email })]) : null])]));
  var sch = JOB.schedule || [];
  out.push(card(t('schedule'), sch.length ? sch.map(function(x){ return lateRow(x, h('div', { class: 'line' }, [h('span', { text: dts(x.date) }), h('span', { text: [x.time && x.endTime ? x.time + '–' + x.endTime : x.time, x.title].filter(Boolean).join(' · ') })])); }) : [h('div', { class: 'empty', text: t('noWeek') })]));
  var rows = [['gate', s.gate], ['parking', s.parking], ['hours', s.hours], ['dumpster', s.dumpster], ['power', s.power], ['water', s.water], ['notes', s.notes]].filter(function(x){ return x[1]; });
  out.push(codesCard(j.id || (JOB.job && JOB.job.id)));   /* patch X10 */
  out.push(card(t('site'), rows.length ? [h('dl', { class: 'info' }, [].concat.apply([], rows.map(function(x){ return [h('dt', { text: t(x[0]) }), h('dd', { text: x[1] })]; })))] : [h('div', { class: 'empty', text: t('none') })]));
  return out;
}
function scopeCard(x){
  var kids = [h('div', { class: 'row' }, [h('h2', { text: x.title || t(x.kind === 'co' ? 'cos' : 'scope') }), pill(x.status === 'accepted' ? t('accepted') : x.status === 'question' ? t('ask') : t('newScope'), x.status === 'accepted' ? 'ok' : 'now')]),
    h('div', { class: 'muted', text: t('version') + ' ' + x.version + ' · ' + dt(x.date) + (x.start ? ' · ' + t('starts') + ' ' + dt(x.start) : '') })];
  if (x.lines.length) kids.push(h('div', { class: 'tblw' }, [h('table', { class: 'tbl' }, [h('thead', null, [h('tr', null, [t('area'), t('desc'), t('meas'), t('qty'), t('unit')].map(function(c){ return h('th', { text: c }); }))]),
    h('tbody', null, x.lines.map(function(l){ return h('tr', null, [h('td', { text: l.area }), h('td', { text: l.desc }), h('td', { text: l.meas }), h('td', { text: l.qty === '' ? '' : String(l.qty) }), h('td', { text: l.unit })]); }))])]));
  [['included', x.included], ['excluded', x.excluded], ['matGc', x.matGc], ['matSub', x.matSub], ['notes', x.notes]].forEach(function(r){ if (r[1]) kids.push(h('div', { class: 'box' }, [h('b', { text: t(r[0]) }), h('p', { class: 'pre', text: r[1] })])); });
  if (x.files.length) kids.push(h('div', { class: 'box' }, [h('b', { text: t('files') })].concat(x.files.map(function(f){ return h('div', { class: 'doc' }, [h('span', { text: /pdf/.test(f.type) ? '📄' : '🖼️' }), h('span', { class: 'grow', text: f.name }), h('button', { type: 'button', class: 'btn', text: t('open'), on: { click: function(){ viewer(f); } } })]); }))));
  if (x.photos.length) kids.push(h('div', { class: 'pics' }, x.photos.map(function(p, i){ return h('button', { type: 'button', on: { click: function(){ lightbox(x.photos.map(function(q){ return { f: q.url }; }), i); } } }, [h('img', { src: p.url, alt: p.name, loading: 'lazy' })]); })));
  kids.push(h('div', { class: 'row total' }, [h('span', { class: 'muted', text: x.kind === 'co' ? t('coTotal') : t('yourTotal') }), h('b', { text: usd(x.total) })]));
  if (x.status !== 'accepted') {
    var acc = h('button', { type: 'button', class: 'btn gold', 'data-accept': x.id, text: x.kind === 'co' ? t('accept') : t('acceptScope') });
    acc.addEventListener('click', function(){ signSheet(x); });   /* patch AUTO6: signed, not just accepted */
    var askB = h('button', { type: 'button', class: 'btn', 'data-ask': x.id, text: t('ask'), on: { click: function(){
      var q = h('textarea', { class: 'inp', rows: '4', id: 'qText' }), go = h('button', { type: 'button', class: 'btn gold', id: 'qSend', text: t('send') });
      var sh = sheet(t('ask'), [field(t('typeQ'), q), go]);
      go.addEventListener('click', function(){ busy(go, true); api('p-scope', { id: x.id, op: 'question', text: q.value }).then(function(){ sh.close(); toast(t('asked')); openJob(JOB.job.id, 'messages'); }, function(e){ busy(go, false); toast(e.message, true); }); });
    } } });
    kids.push(h('div', { class: 'btns' }, [acc, askB]));
  } else kids.push(h('div', { class: 'muted', text: (x.signedName ? '✍️ ' + t('signedBy', { n: x.signedName }) : t('accepted')) + ' · ' + dt(x.acceptedAt) }));
  if (x.question) kids.push(h('div', { class: 'how', text: t('asked') }));
  return card(null, kids, 'scope');
}
/* ── patch AUTO6: sign a sub agreement / change order (typed name + drawn signature; the time, IP and version are
   recorded by the server). The pad is the customer portal's: points on a 600 × 200 pad. ── */
function makePad(){
  var cv = h('canvas', { class: 'sign-pad', width: '600', height: '200', 'aria-label': t('signDraw') });
  cv.style.cssText = 'width:100%;aspect-ratio:3/1;border:1px dashed #9AA5B1;border-radius:10px;background:#fff;touch-action:none;display:block';
  var ctx = cv.getContext('2d'), strokes = [], cur = null;
  function pt(e){ var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(600, (e.clientX - r.left) * 600 / r.width)), Math.max(0, Math.min(200, (e.clientY - r.top) * 200 / r.height))]; }
  function redraw(){ ctx.clearRect(0, 0, 600, 200); ctx.strokeStyle = '#0F1D2F'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach(function(st){ ctx.beginPath(); st.forEach(function(p, i){ if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); if (st.length === 1) ctx.lineTo(st[0][0] + 1, st[0][1]); ctx.stroke(); }); }
  cv.addEventListener('pointerdown', function(e){ if (strokes.length >= 38) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} cur = [pt(e)]; strokes.push(cur); redraw(); });
  cv.addEventListener('pointermove', function(e){ if (!cur || cur.length >= 590) return; e.preventDefault(); var p = pt(e), l = cur[cur.length - 1]; if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) < 2) return; cur.push(p); redraw(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ cv.addEventListener(n, function(){ cur = null; }); });
  return { el: cv, strokes: function(){ return strokes.map(function(st){ return st.map(function(p){ return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; }); }); }, clear: function(){ strokes = []; cur = null; redraw(); } };
}
function signSheet(x){
  var pad = makePad();
  var nm = h('input', { type: 'text', class: 'inp', id: 'signName', maxlength: '80', autocomplete: 'name' });
  var ag = h('input', { type: 'checkbox', id: 'signAgree' });
  var msg = h('div', { class: 'muted', id: 'signMsg', role: 'status' });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'signGo', text: t('signBtn') });
  var agreeTxt = t(x.kind === 'co' ? 'signAgreeCo' : 'signAgreeScope', { amt: usd(x.total), v: x.version });
  var esg = window.GCLegal ? window.GCLegal.esignBox({ base: '' }) : null;   /* LEGAL2-patch: E-SIGN consent before the signature */
  var sh = sheet(t('signTitle') + ' — ' + (x.title || t(x.kind === 'co' ? 'cos' : 'scope')), [
    window.gcDocHead ? window.gcDocHead() : null,   /* patch LOGO */
    h('div', { class: 'row total' }, [h('span', { class: 'muted', text: x.kind === 'co' ? t('coTotal') : t('yourTotal') }), h('b', { text: usd(x.total) })]),
    (esg ? esg.el : null), field(t('signName'), nm), h('div', { class: 'muted', text: t('signDraw') }), pad.el,
    h('button', { type: 'button', class: 'btn', text: t('signClear'), on: { click: function(){ pad.clear(); } } }),
    h('label', { class: 'fld', style: 'display:flex;gap:8px;align-items:flex-start' }, [ag, h('span', { text: agreeTxt })]), go, msg]);
  go.addEventListener('click', function(){
    if (!esg) { msg.textContent = 'The consent form did not load. Please refresh this page.'; return; } if (!esg.ok()) { msg.textContent = 'Tick the box to agree to do business electronically.'; esg.el.scrollIntoView({ block: 'center' }); return; }
    if (nm.value.trim().length < 3) { msg.textContent = t('signNeedName'); nm.focus(); return; }
    if (!ag.checked) { msg.textContent = t('signNeedAgree'); return; }
    busy(go, true); msg.textContent = t('signing');
    api('p-scope', { id: x.id, op: 'sign', version: x.version, signName: nm.value, agree: true, esignConsent: esg.record(), strokes: pad.strokes() }).then(function(){ sh.close(); toast('✍️ ' + t('accepted')); openJob(JOB.job.id, JTAB); reloadHome(); }, function(e){ busy(go, false); msg.textContent = e.message; toast(e.message, true); });
  });
  return sh;
}
function photosPane(){
  var box = card(t('photos'), [h('button', { type: 'button', class: 'btn gold', id: 'addPhotos', text: t('addPhotos'), on: { click: function(){ addPhotos(); } } }), h('div', { class: 'empty', id: 'phLoad', text: '…' })]);
  loadPhotos(JOB.job.id).then(function(list){
    var e = box.querySelector('#phLoad'); if (!e) return;
    if (!list.length) { e.textContent = t('noPhotos'); return; }
    e.remove();
    box.appendChild(h('div', { class: 'pics', id: 'grid' }, list.map(function(p, i){ return h('button', { type: 'button', 'aria-label': t('photos'), on: { click: function(){ lightbox(list, i); } } }, [h('img', { src: p.t, alt: '', loading: 'lazy' })]); })));
  });
  return [box];
}
/* GrayCo Photos (netlify/functions/sub-photos): this job's photos only, never one marked "hidden from subs".
   The portal gives this sign-in a short photos code; without GrayCo Photos set up, the photos GrayCo shared and your own. */
var PCODE = null;
function photosCode(){ if (PCODE !== null) return Promise.resolve(PCODE); return api('p-photos-code').then(function(r){ PCODE = r.code || ''; return PCODE; }, function(){ PCODE = ''; return ''; }); }
function gphotos(body){
  return photosCode().then(function(code){
    if (!code) return null;
    return fetch('/.netlify/functions/sub-photos', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sub-token': code }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; });
  });
}
function loadPhotos(pid){
  return gphotos({ action: 'photos', jobId: pid }).then(function(j){
    if (j && j.ok && Array.isArray(j.photos)) return j.photos.map(function(p){ return { t: p.t || p.thumb || p.f, f: p.f || p.url || p.t, at: p.at || '' }; }).filter(function(p){ return p.t && p.f; });
    return api('p-photos', { projectId: pid }).then(function(r){ return r.photos || []; }, function(){ return []; });
  });
}
/* a photo the sub took → the job's GrayCo Photos, tagged with the sub (false when GrayCo Photos is not there) */
function toGPhotos(file, pid, tag, note){
  return readFile(file).then(function(f){ return gphotos({ action: 'upload', jobId: pid, name: f.name, data: f.data, tag: tag || 'During', note: note || '' }); }).then(function(j){ return !!(j && j.ok); }, function(){ return false; });
}
function addPhotos(){
  var files = [], list = h('div', { class: 'muted', id: 'phList' }), note = h('input', { class: 'inp', id: 'phNote' });
  var pick = h('button', { type: 'button', class: 'btn', id: 'phPick', text: t('addPhotos'), on: { click: function(){ picker('image/*', true, function(fs){ files = fs; list.textContent = fs.map(function(f){ return f.name; }).join(', '); }); } } });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'phSend', text: t('send') });
  var sh = sheet(t('photos'), [pick, list, field(t('photoNote'), note), go]);
  go.addEventListener('click', function(){
    if (!files.length) { toast(t('pickFile'), true); return; }
    busy(go, true);
    var pid = JOB.job.id, sentG = 0;
    files.slice(0, 12).reduce(function(p, f){ return p.then(function(ids){ return toGPhotos(f, pid, 'During', note.value).then(function(okG){ if (okG) { sentG++; return ids; } return upload(f, 'photo', pid).then(function(u){ ids.push(u.id); return ids; }); }); }); }, Promise.resolve([]))
      .then(function(ids){ return api('p-photos-add', { projectId: pid, uploadIds: ids, gphotos: sentG, note: note.value }); })
      .then(function(){ sh.close(); toast(t('saved')); openJob(pid, 'photos'); }, function(e){ busy(go, false); toast(e.message, true); });
  });
}
function progressPane(){
  var pct = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(JOB.job.pct || 0), id: 'pgPct', class: 'range' });
  var pv = h('b', { text: (JOB.job.pct || 0) + '%' }); pct.addEventListener('input', function(){ pv.textContent = pct.value + '%'; });
  var note = h('textarea', { class: 'inp', rows: '3', id: 'pgNote' });
  var files = [], fl = h('span', { class: 'muted' });
  var pick = h('button', { type: 'button', class: 'btn', id: 'pgPick', text: t('addPhotos'), on: { click: function(){ picker('image/*', true, function(fs){ files = fs; fl.textContent = fs.length + ' 📷'; }); } } });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'pgSend', text: t('postProgress') });
  go.addEventListener('click', function(){
    busy(go, true); var pid = JOB.job.id;
    files.slice(0, 8).reduce(function(p, f){ return p.then(function(ids){ toGPhotos(f, pid, 'During', note.value); return upload(f, 'progress', pid).then(function(u){ ids.push(u.id); return ids; }); }); }, Promise.resolve([]))
      .then(function(ids){ return api('p-progress', { projectId: pid, pct: pct.value, note: note.value, uploadIds: ids }); })
      .then(function(){ toast(t('saved')); openJob(pid, 'progress'); }, function(e){ busy(go, false); toast(e.message, true); });
  });
  var hist = (JOB.progress || []).map(function(x){ return h('div', { class: 'post' }, [h('div', { class: 'row' }, [h('b', { text: x.pct + '% ' + t('done') }), h('span', { class: 'muted', text: tm(x.at) })]), x.note ? h('p', { text: x.note }) : null,
    x.photos.length ? h('div', { class: 'pics' }, x.photos.map(function(p, i){ return h('button', { type: 'button', on: { click: function(){ lightbox(x.photos.map(function(q){ return { f: q.url }; }), i); } } }, [h('img', { src: p.url, alt: '', loading: 'lazy' })]); })) : null]); });
  return [card(t('postProgress'), [h('div', { class: 'row' }, [h('span', { text: t('pct') }), pv]), pct, field(t('progressNote'), note), h('div', { class: 'row' }, [pick, fl]), go]),
    card(t('progress'), hist.length ? hist : [h('div', { class: 'empty', text: t('noProgress') })])];
}
function punchPane(){
  var items = JOB.punch || [];
  return [card(t('punch'), items.length ? items.map(function(x){
    var kids = [h('div', { class: 'row' }, [h('b', { text: x.item }), x.done ? pill(t('isDone') + (x.doneAt ? ' ' + dt(x.doneAt) : ''), 'ok') : pill(x.due ? t('due') + ' ' + dt(x.due) : (x.priority || ''), 'now')])];
    if (x.details) kids.push(h('p', { class: 'muted', text: x.details }));
    if (x.photo) kids.push(h('div', { class: 'pics' }, [h('button', { type: 'button', on: { click: function(){ lightbox([{ f: x.photo.url }], 0); } } }, [h('img', { src: x.photo.url, alt: '' })])]));
    if (!x.done) kids.push(h('button', { type: 'button', class: 'btn gold', 'data-punch': x.id, text: '📷 ' + t('markDone'), on: { click: function(ev){
      var b = ev.currentTarget;
      picker('image/*', false, function(fs){ if (!fs[0]) return; busy(b, true); var pid = JOB.job.id;
        toGPhotos(fs[0], pid, 'Punch', x.item);
        upload(fs[0], 'punch', pid).then(function(u){ return api('p-punch', { projectId: pid, punchId: x.id, uploadId: u.id }); }).then(function(){ toast(t('saved')); openJob(pid, 'punch'); reloadHome(); }, function(e){ busy(b, false); toast(e.message, true); }); });
    } } }));
    return h('div', { class: 'post' }, kids);
  }) : [h('div', { class: 'empty', text: t('noPunch') })])];
}
function invoicesPane(){
  return [card(t('invoices'), [h('div', { class: 'how', text: t('payRule') + (JOB.job.po ? ' ' + t('po') + ' ' + JOB.job.po : '') }), h('button', { type: 'button', class: 'btn gold', id: 'jobNewInv', text: t('newInvoice'), on: { click: function(){ invoiceSheet(JOB.job.id); } } })]
    .concat(JOB.invoices.length ? JOB.invoices.map(invRow) : [h('div', { class: 'empty', text: t('noInvoices') })]))];
}
var msgTimer = null;
function messagesPane(){
  var list = h('div', { class: 'msgs', id: 'msgList' }, [h('div', { class: 'empty', text: '…' })]);
  var box = h('textarea', { class: 'inp', rows: '2', id: 'msgText', placeholder: t('msgPh') });
  var files = [], fl = h('span', { class: 'muted' });
  var att = h('button', { type: 'button', class: 'btn', id: 'msgAttach', text: t('attach'), on: { click: function(){ picker('image/*,application/pdf', true, function(fs){ files = fs; fl.textContent = fs.map(function(f){ return f.name; }).join(', '); }); } } });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'msgSend', text: t('send') });
  var pid = JOB.job.id;
  function paint(ms){
    list.innerHTML = '';
    if (!ms.length) { list.appendChild(h('div', { class: 'empty', text: t('noMsgs') })); return; }
    ms.forEach(function(m){
      list.appendChild(h('div', { class: 'msg ' + (m.mine ? 'me' : 'them') }, [h('div', { class: 'who', text: (m.mine ? t('you') : m.by) + ' · ' + tm(m.at) }), m.text ? h('p', { text: m.text }) : null,
        m.files.length ? h('div', { class: 'mfiles' }, m.files.map(function(f){ return /^image\//.test(f.type) ? h('button', { type: 'button', class: 'mimg', on: { click: function(){ lightbox([{ f: f.url }], 0); } } }, [h('img', { src: f.url, alt: f.name })]) : h('button', { type: 'button', class: 'btn', text: '📄 ' + f.name, on: { click: function(){ viewer(f); } } }); })) : null,
        m.mine ? h('div', { class: 'rr', text: m.read ? '✓✓ ' + t('read') : '✓ ' + t('sentM') }) : null]));
    });
    list.scrollTop = list.scrollHeight;
  }
  function load(){ return api('p-msgs', { projectId: pid }).then(function(r){ paint(r.messages || []); JOB.unread = 0; var b = document.querySelector('[data-jtab="messages"]'); if (b) b.textContent = t('messages'); }, function(){}); }
  go.addEventListener('click', function(){
    if (!box.value.trim() && !files.length) return;
    busy(go, true);
    files.slice(0, 6).reduce(function(p, f){ return p.then(function(ids){ return upload(f, 'message', pid).then(function(u){ ids.push(u.id); return ids; }); }); }, Promise.resolve([]))
      .then(function(ids){ return api('p-send', { projectId: pid, text: box.value, uploadIds: ids }); })
      .then(function(){ box.value = ''; files = []; fl.textContent = ''; busy(go, false); return load(); }, function(e){ busy(go, false); toast(e.message, true); });
  });
  load();
  clearInterval(msgTimer); msgTimer = setInterval(function(){ if (JTAB === 'messages' && !document.hidden && document.getElementById('msgList')) load(); else clearInterval(msgTimer); }, 20000);
  return [card(t('messages'), [list, box, h('div', { class: 'row' }, [att, fl]), go])];
}
function paneFor(k){
  if (k === 'scope') return JOB.scopes.length ? JOB.scopes.map(scopeCard) : [card(t('scope'), [h('div', { class: 'empty', text: t('noScope') })])];
  if (k === 'cos') return JOB.cos.length ? JOB.cos.map(scopeCard) : [card(t('cos'), [h('div', { class: 'empty', text: t('noCo') })])];
  if (k === 'photos') return photosPane();
  if (k === 'progress') return progressPane();
  if (k === 'punch') return punchPane();
  if (k === 'invoices') return invoicesPane();
  if (k === 'messages') return messagesPane();
  return overview();
}
function drawJob(){
  var main = document.getElementById('main'); main.innerHTML = '';
  var wide = window.matchMedia('(min-width: 1000px)').matches;
  var bar = h('div', { class: 'jobbar' }, [h('button', { type: 'button', class: 'back', id: 'jobBack', text: t('back'), on: { click: function(){ JOB = null; draw(); } } }), h('b', { text: JOB.job.name })]);
  main.appendChild(bar);
  if (wide) {
    if (JTAB === 'overview') JTAB = 'scope';
    var left = h('aside', { class: 'col-l' }, overview());
    var right = h('section', { class: 'col-r' }, [jtabs()].concat(paneFor(JTAB)));
    main.appendChild(h('div', { class: 'two' }, [left, right]));
    var ov = right.querySelector('[data-jtab="overview"]'); if (ov) ov.style.display = 'none';
  } else {
    main.appendChild(jtabs());
    paneFor(JTAB).forEach(function(p){ if (p) main.appendChild(p); });
  }
  markTabs();
}
function openJob(pid, tab){
  JTAB = tab || 'overview';
  return api('p-job', { projectId: pid }).then(function(r){ JOB = r; TAB = 'jobs'; drawJob(); window.scrollTo(0, 0); }, function(e){ toast(e.message, true); });
}
function lightbox(list, i){
  var img = h('img', { alt: '' }), count = h('span');
  function show(){ img.src = list[i].f; count.textContent = (i + 1) + ' / ' + list.length; }
  var ov = h('div', { class: 'lb', role: 'dialog' }, [h('div', { class: 'top' }, [h('button', { type: 'button', text: t('back'), on: { click: close } }), count, h('button', { type: 'button', 'aria-label': t('close'), text: '✕', on: { click: close } })]),
    h('div', { class: 'ph' }, [img]), list.length > 1 ? h('div', { class: 'nav' }, [h('button', { type: 'button', text: '‹', on: { click: function(){ i = (i - 1 + list.length) % list.length; show(); } } }), h('button', { type: 'button', text: '›', on: { click: function(){ i = (i + 1) % list.length; show(); } } })]) : null]);
  function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', key); }
  function key(e){ if (e.key === 'Escape') close(); if (e.key === 'ArrowRight' && list.length > 1) { i = (i + 1) % list.length; show(); } if (e.key === 'ArrowLeft' && list.length > 1) { i = (i - 1 + list.length) % list.length; show(); } }
  document.addEventListener('keydown', key); show(); document.body.appendChild(ov);
}
function viewer(f){
  if (/pdf/.test(f.type)) {
    var sh = sheet(f.name, [window.gcDocHead ? window.gcDocHead() : null, h('iframe', { class: 'pdf', src: f.url, title: f.name }),   /* patch LOGO */ h('a', { class: 'btn', href: f.url, target: '_blank', rel: 'noopener', text: t('open') })]);
    sh.el.classList.add('wide'); return;
  }
  lightbox([{ f: f.url }], 0);
}

/* ── frame ── */
function markTabs(){ Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function(b){ b.setAttribute('aria-selected', b.getAttribute('data-tab') === TAB ? 'true' : 'false'); }); }
function goTab(k){ TAB = k; JOB = null; draw(); window.scrollTo(0, 0); }
function draw(){
  if (JOB) return drawJob();
  var main = document.getElementById('main'); main.innerHTML = '';
  var parts = TAB === 'jobs' ? jobsTab() : TAB === 'pay' ? payTab() : TAB === 'papers' ? papersTab() : home();
  var wide = window.matchMedia('(min-width: 1000px)').matches;
  if (wide && TAB === 'home') {
    main.appendChild(h('div', { class: 'two' }, [h('aside', { class: 'col-l' }, parts.slice(0, 3)), h('section', { class: 'col-r' }, parts.slice(3))]));
  } else parts.forEach(function(p){ if (p) main.appendChild(p); });
  markTabs();
}
function reloadHome(){ return api('p-home').then(function(r){ HOME = r; if (!JOB) draw(); paintHello(); }, function(){}); }
function paintHello(){
  var me = HOME.me || {};
  H.hello(t('hi') + ', ' + (String(me.name || '').split(/\s+/)[0] || ''), me.company + (me.trade ? ' · ' + me.trade : ''), '');
}
function setLang(l, tell){
  LANG = l === 'es' ? 'es' : 'en';
  try { localStorage.setItem('gc_lang', LANG); } catch (e) {}
  if (H && H.setLang) H.setLang(LANG);
  buildTabs();
  if (HOME) { paintHello(); if (JOB) drawJob(); else draw(); }
  if (tell) api('p-lang', { lang: LANG }).catch(function(){});
}
function buildTabs(){
  var nav = document.getElementById('tabs'); if (!nav) return;
  var inner = nav.querySelector('.in'); inner.innerHTML = '';
  inner.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
  [['home', t('home')], ['jobs', t('jobs')], ['pay', t('pay')], ['papers', t('papers')]].forEach(function(x){
    inner.appendChild(h('button', { type: 'button', role: 'tab', 'data-tab': x[0], 'aria-selected': TAB === x[0] ? 'true' : 'false', text: x[1], on: { click: function(){ goTab(x[0]); } } }));
  });
  nav.hidden = false;
}

/* portal.html calls this: host = { hello(big, small, sub), ended(), setLang(l) } */
window.GCPartner = {
  start: function(opts){
    session = opts.session; H = opts.host;
    var saved = ''; try { saved = localStorage.getItem('gc_lang') || ''; } catch (e) {}
    LANG = saved === 'es' || saved === 'en' ? saved : (opts.lang === 'es' ? 'es' : 'en');
    if (H.setLang) H.setLang(LANG);
    buildTabs();
    return api('p-home').then(function(r){
      HOME = r;
      if (!saved && r.lang && r.lang !== LANG) setLang(r.lang, false);
      paintHello(); draw();
      var m = /[#&]job=([A-Za-z0-9_.:-]{1,80})/.exec(location.hash || ''); if (m) openJob(m[1], 'overview');
      setInterval(function(){ if (!document.hidden && !document.querySelector('.sheet')) reloadHome(); }, 60000);
    }, function(e){ document.getElementById('main').innerHTML = ''; document.getElementById('main').appendChild(h('div', { class: 'off' }, [h('p', { text: e.message || t('loadFail') })])); });
  },
  setLang: setLang,
  _state: function(){ return { home: HOME, job: JOB, tab: TAB, jtab: JTAB, lang: LANG }; },
  L: L
};
})();
