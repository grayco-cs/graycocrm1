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
    bidDue: 'Bid due', bidOpenBid: 'Open & bid', bidsNone: 'No jobs to bid right now — GrayCo invites you when one fits your trade.', toBid: '📝 To bid', jobsNow: '🔨 Jobs I\'m on now', jobsNext: '✅ Awarded / coming up', jobsDone: '✔ Done', poHint: 'Use this PO at Home Depot, Lowe\'s and the supply house so it lands on the right job.',
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
    dlicense: 'GrayCo Construction Services · TN #85034 BCB · AR #0486990627 · MS #27769', jobsTo: 'Jobs to bid', loadFail: 'Could not load. Check your signal and try again.', retry: 'Try again',
    awarded: 'Awarded', inprogress: 'In Progress', complete: 'Complete', bidding: 'Bidding'
  },
  es: {
    hi: 'Bienvenido', portal: 'Portal GrayCo', home: 'Inicio', jobs: 'Trabajos', pay: 'Pagos', papers: 'Papeles', back: '‹ Atrás', close: 'Cerrar',
    needs: 'Pendiente para usted', nothingNeeded: 'Nada pendiente. ¡Gracias!', week: 'Esta semana', noWeek: 'Nada en el calendario esta semana.',
    bidDue: 'Fecha límite', bidOpenBid: 'Abrir y licitar', bidsNone: 'No hay trabajos para licitar ahora — GrayCo le invita cuando uno sea de su oficio.', toBid: '📝 Para licitar', jobsNow: '🔨 Trabajos en curso', jobsNext: '✅ Adjudicados / próximos', jobsDone: '✔ Terminados', poHint: 'Use este PO en Home Depot, Lowe\'s y el proveedor para que se cargue al trabajo correcto.',
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
    dlicense: 'GrayCo Construction Services · TN #85034 BCB · AR #0486990627 · MS #27769', jobsTo: 'Trabajos para licitar', loadFail: 'No se pudo cargar. Revise su señal e intente otra vez.', retry: 'Intentar otra vez',
    awarded: 'Adjudicado', inprogress: 'En progreso', complete: 'Terminado', bidding: 'Licitando'
  }
};
/* patch SUBPORTAL3 */
Object.assign(L.en, { invAttach: '📎 Attach your invoice PDF', invAttachHow: 'Attach your own invoice (PDF, or a photo of it — up to 15 MB) and enter the amount. GrayCo gets the file with the invoice.', tooBig15: 'That file is too big (15 MB at most).' });
Object.assign(L.es, { invAttach: '📎 Adjuntar su factura en PDF', invAttachHow: 'Adjunte su propia factura (PDF, o una foto — hasta 15 MB) y escriba el monto. GrayCo recibe el archivo con la factura.', tooBig15: 'El archivo es muy grande (15 MB como máximo).' });
Object.assign(L.en, { phCount: '{n} photos of this job', noDate: 'No date', jobDocs: 'Plans & documents', noDocs: 'No plans or documents shared with you yet. Ask your PM in Messages.' });
Object.assign(L.es, { phCount: '{n} fotos de este trabajo', noDate: 'Sin fecha', jobDocs: 'Planos y documentos', noDocs: 'Todavía no hay planos ni documentos para usted. Pregúntele a su PM en Mensajes.' });
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
/* patch SUBPHOTOS (owner 10/30): today's jobs on Home (address, Maps, customer, PO + Copy PO), "📍 I'm here", "📷 Add photos",
   "✅ Done for today" (all optional) — and the one rule: enough photos on the job before an invoice */
/* SUBAFTER (owner 11/10): After photos of the finished work before an invoice; send every photo; a video before an insurance job starts */
Object.assign(L.en, { phDuring: '🛠 During the job', phAfter: '📸 Finished work (After)', addAfter: '📸 Add finished-work photos (After)',
  tipDuring: 'Send all your photos as you work — they go straight into the job’s photos for GrayCo.',
  tipAfter: 'For your final invoice: take clear photos of the finished work, and send any photos from the job you haven’t sent yet. Good, well-lit photos help us show off your work.',
  afterRule: 'Finished-work (After) photos for your invoice: {have} of {need}',
  insTip: 'Tip for insurance jobs: before you start, take a short video of the work area — any damage or problems you see that are not part of your scope. It protects you and GrayCo if questions come up later about what was already there.' });
Object.assign(L.es, { phDuring: '🛠 Durante el trabajo', phAfter: '📸 Trabajo terminado (Después)', addAfter: '📸 Agregar fotos del trabajo terminado',
  tipDuring: 'Envíe todas sus fotos mientras trabaja — van directo a las fotos del trabajo para GrayCo.',
  tipAfter: 'Para su factura final: tome fotos claras del trabajo terminado y envíe las fotos del trabajo que aún no haya enviado. Las fotos buenas y con luz nos ayudan a mostrar su trabajo.',
  afterRule: 'Fotos del trabajo terminado (Después) para su factura: {have} de {need}',
  insTip: 'Consejo para trabajos de seguro: antes de empezar, grabe un video corto del área — cualquier daño o problema que vea que no sea parte de su trabajo. Le protege a usted y a GrayCo si luego hay preguntas sobre lo que ya estaba ahí.' });
Object.assign(L.en, { careT: '🤝 How we treat this customer', careX: 'This is an emergency loss (fire, water or board-up). The owner is going through a hard time. Be calm, kind and respectful: introduce yourself, say you\'re with GrayCo, and keep the site clean and quiet. Handle their belongings like they\'re irreplaceable and ask before moving or tossing anything. Don\'t discuss the cause, insurance, money or blame — send any questions to the GrayCo PM. Protect the home first (tarp, board-up, water stopped, doors secured). Your attitude on site is part of the job.' });
Object.assign(L.es, { careT: '🤝 Cómo tratamos a este cliente', careX: 'Esta es una pérdida de emergencia (incendio, agua o tapiado). El dueño está pasando por un momento difícil. Sea calmado, amable y respetuoso: preséntese, diga que viene de parte de GrayCo y mantenga el sitio limpio y tranquilo. Trate sus pertenencias como irremplazables y pregunte antes de mover o tirar algo. No hable de la causa, el seguro, el dinero ni de culpas — envíe cualquier pregunta al PM de GrayCo. Proteja la casa primero (lona, tapiado, agua detenida, puertas aseguradas). Su actitud en el sitio es parte del trabajo.' });   /* CARE (owner 11/11): compassion on emergency losses */
Object.assign(L.en, { today: 'Today', noToday: 'Nothing on the schedule today.', here: '📍 I’m here', doneDay: '✅ Done for today', hereSent: 'Checked in — thank you', doneSent: 'Marked done for today — thank you',
  copyPo: 'Copy PO', copied: 'PO copied', todayHint: 'Add today’s photos of your work.', photoRule: 'Photos for your invoice: {have} of {need}', photoRuleOk: 'Enough photos for your invoice ({have}).',
  takePhoto: '📷 Take a photo', choosePhotos: '🖼 Choose photos', custPhone: 'Customer' });
Object.assign(L.es, { today: 'Hoy', noToday: 'Nada en el calendario hoy.', here: '📍 Ya llegué', doneDay: '✅ Terminé por hoy', hereSent: 'Registrado — gracias', doneSent: 'Marcado terminado por hoy — gracias',
  copyPo: 'Copiar PO', copied: 'PO copiado', todayHint: 'Agregue las fotos de hoy de su trabajo.', photoRule: 'Fotos para su factura: {have} de {need}', photoRuleOk: 'Fotos suficientes para su factura ({have}).',
  takePhoto: '📷 Tomar foto', choosePhotos: '🖼 Elegir fotos', custPhone: 'Cliente' });
function copyPo(po){
  var ok = function(){ toast(t('copied') + ': ' + po); };
  try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(po).then(ok, function(){ fallback(); }); } catch (e) {}
  fallback();
  function fallback(){ var ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = po; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove(); }
}
function poRow(po){ return po ? h('span', { class: 'po-row' }, [h('b', { class: 'po', 'data-po': po, text: t('po') + ' ' + po }), ' ', h('button', { type: 'button', class: 'btn sm', 'data-copy-po': po, text: '📋 ' + t('copyPo'), on: { click: function(){ copyPo(po); } } })]) : null; }
function checkin(pid, op, btn){ busy(btn, true); api('p-checkin', { projectId: pid, op: op }).then(function(){ busy(btn, false); btn.textContent = '✓ ' + t(op === 'done' ? 'doneSent' : 'hereSent'); btn.disabled = true; }, function(e){ busy(btn, false); toast(e.message, true); }); }
function dayButtons(pid){
  var hb = h('button', { type: 'button', class: 'btn', 'data-here': pid, text: t('here') }); hb.addEventListener('click', function(){ checkin(pid, 'here', hb); });
  var db = h('button', { type: 'button', class: 'btn', 'data-doneday': pid, text: t('doneDay') }); db.addEventListener('click', function(){ checkin(pid, 'done', db); });
  return h('div', { class: 'btns3 daybtns' }, [hb, h('button', { type: 'button', class: 'btn gold', 'data-addph': pid, text: t('addPhotos'), on: { click: function(){ addPhotos(pid); } } }), db]);
}
function todayCard(x){
  var c = x.customer || {};
  return h('div', { class: 'post today-job', 'data-today': x.id }, [
    h('div', { class: 'row' }, [h('b', { text: x.name }), x.time ? h('span', { class: 'muted', text: x.time }) : null]),
    x.address ? h('div', null, [h('span', { text: x.address }), ' ', x.maps ? h('a', { href: x.maps, target: '_blank', rel: 'noopener', class: 'lnk', text: '📍 ' + t('maps') }) : null]) : null,
    c.name || c.phone ? h('div', null, [h('span', { class: 'muted', text: t('custPhone') + ': ' }), h('span', { text: c.name || '' }), c.phone ? ' · ' : '', c.phone ? h('a', { href: telOf(c.phone), 'data-cust-tel': x.id, text: '📞 ' + c.phone }) : null]) : null,
    poRow(x.po),
    h('div', { class: 'muted', text: t('todayHint') }),
    dayButtons(x.id),
    h('button', { type: 'button', class: 'lnk', text: t('open') + ' ›', on: { click: function(){ openJob(x.id, 'overview'); } } })]);
}
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
/* patch SUBSESS (owner 11/12: "keep subs signed in on portal"): "not active" signs the sub out only when it is real — this
   browser's copy is read again (another tab may have signed in anew), the session is checked (whoami) and the call is tried
   once more. No signal / a 5xx / a 429 never signs anyone out. */
var ENDED = false;
function notActiveRes(r, j){ return r.status === 404 && /not active/i.test((j && j.error) || ''); }
function stillIn(){
  var disk = ''; try { disk = localStorage.getItem('gc_portal_s') || ''; } catch (e) {}
  if (disk && disk !== session) { session = disk; return Promise.resolve(true); }
  return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-session': session }, cache: 'no-store', credentials: 'omit', body: JSON.stringify({ action: 'whoami' }) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return j && j.ok ? true : notActiveRes(r, j) ? false : null; }); }, function(){ return null; });
}
function api(action, body, again){
  return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-session': session }, cache: 'no-store', credentials: 'omit', body: JSON.stringify(Object.assign({ action: action }, body || {})) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
      if (notActiveRes(r, j)) {
        if (again) { ENDED = true; H.ended(); throw new Error(j.error); }
        return stillIn().then(function(yes){
          if (yes === true) return api(action, body, true);
          if (yes === null) throw new Error(t('failed'));   /* could not check: keep the sign-in */
          ENDED = true; H.ended(); throw new Error(j.error);
        });
      }
      if (!r.ok || !j.ok) throw new Error(j.error || t('failed')); return j; }); });
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
/* patch SUBPORTAL3: the sub's own invoice PDF (or a photo of it), up to 15 MB: a PDF / a big file goes straight to the CRM's file
   storage with a one-time link from the server (no 4 MB limit); a small photo the usual way (made small first) */
var BIG_MAX = 15 * 1024 * 1024;
function invoiceUpload(file, pid){
  if (!file) return Promise.resolve(null);
  if (file.size > BIG_MAX) return Promise.reject(new Error(t('tooBig15')));
  if (!/pdf/i.test(file.type || '') && !/\.pdf$/i.test(file.name || '') && file.size <= 4 * 1024 * 1024) return upload(file, 'invoice', pid);
  return bigUpload(file, 'invoice', pid).catch(function(e){ if (file.size <= 4.4 * 1024 * 1024 && !/15 MB|PDF or a photo/.test(e.message || '')) return upload(file, 'invoice', pid); throw e; });
}
function bigUpload(file, purpose, pid){
  var type = /\.pdf$/i.test(file.name || '') && !file.type ? 'application/pdf' : (file.type || '').toLowerCase();
  if (type === 'image/jpg') type = 'image/jpeg';
  return file.arrayBuffer().then(function(buf){
    return crypto.subtle.digest('SHA-256', buf).then(function(d){
      var hash = Array.prototype.map.call(new Uint8Array(d), function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
      return api('p-upload-url', { projectId: pid || undefined, hash: hash, type: type, size: file.size, name: file.name }).then(function(r){
        var put = r.exists ? Promise.resolve() : fetch(r.url, { method: 'PUT', headers: Object.assign({ 'Content-Type': type, 'x-upsert': 'false' }, r.apikey ? { apikey: r.apikey } : {}), body: buf, credentials: 'omit' })
          .then(function(x){ if (!x.ok && x.status !== 409) throw new Error(t('failed')); });
        return put.then(function(){ return api('p-upload-done', { projectId: pid || undefined, path: r.path, name: file.name, size: file.size, purpose: purpose }); });
      });
    });
  });
}
function upload(file, purpose, pid){ return readFile(file).then(function(f){ return api('p-upload', { projectId: pid || undefined, purpose: purpose, name: f.name, data: f.data }); }); }
function picker(accept, multiple, cb, cap){ var i = h('input', { type: 'file', accept: accept, multiple: multiple ? true : null, capture: cap || null, style: 'display:none' }); i.addEventListener('change', function(){ cb(Array.prototype.slice.call(i.files || [])); i.remove(); }); document.body.appendChild(i); i.click(); }
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
/* patch SUBBIDS (owner 11/11): 📋 Jobs to bid — GrayCo's open bid jobs and the sub's own bid, right here (p-bidjobs / p-bid-save).
   Not joined yet → "Join GrayCo bids" (p-bids: a password, then GrayCo approves the company). Papers first: W-9, GL, WC. */
Object.assign(L.en, { jobsToBid: '📋 Jobs to bid', bidsJoin: 'Join GrayCo bids', bidsJoinWhy: 'See GrayCo’s open jobs to bid and send your bids right here in your portal. Join once — GrayCo approves your company, then the jobs show up here.',
  bidsPwShort: 'Choose a password with at least 8 characters.', bidsLoading: 'Loading jobs to bid…', bidsNoneOpen: 'No jobs to bid right now — GrayCo invites you when one fits your trade.',
  daysLeft: '{n} days left', dayLeft: '1 day left', dueToday: 'Due today', pastDue: 'Past due', bidInvited: '📨 Invited', bidOpen: 'Open to bid', bidPending: '✓ Bid sent', bidAccepted: '🏆 Awarded', qaTitle: 'Questions about this job', qaYou: 'You asked', qaOther: 'A bidder asked', qaShared: 'answer to all bidders', qaWaiting: 'Waiting for GrayCo’s answer.', qaNone: 'No questions yet. Ask GrayCo anything about the job before you bid.', qaPh: 'e.g. Is the 2nd floor in this bid? Who supplies the paint?', qaAsk: 'Ask a question', qaNeed: 'Type your question.', qaSent: 'Question sent — GrayCo answers here.', qaLbl: 'Your question', bidAwardPm: 'Your GrayCo project manager', bidAwardNext: 'Next: GrayCo will send your sub agreement / scope to sign here in your GrayCo Portal.', bidAwardConfirm: 'Please confirm these before we finalize', bidRejected: 'Not selected', bidClosed: 'Closed',
  bidOpenBtn: 'Open & bid ›', bidSeeBtn: 'See my bid ›', plansLbl: 'Plans', planFiles: 'Plan files', scopeLbl: 'Scope of work', specsLbl: 'Specifications', notesLbl: 'Notes', tradesLbl: 'Trades', yourTradeScope: 'Scope for your trade',
  yourBid: 'Your bid', bidAmount: 'Bid amount ($)', bidNotes: 'Notes for GrayCo (what is included / not included, timing)', bidSubmit: 'Submit bid', bidUpdate: 'Update bid', bidSent: 'Bid sent to GrayCo', bidUpdated: 'Bid updated',
  bidDecided: 'GrayCo has decided on this bid — it can no longer be changed.', bidClosedNote: 'Bids are closed on this job.', bidSentOn: 'Sent {d}', bidUpdOn: 'updated {d}', amountNeed: 'Enter your bid amount.',
  papersOk: 'Papers on file: W-9, GL, WC', papersNeed: 'Before you can bid, GrayCo needs these papers on file:', papersMissing: 'missing', papersExpired: 'expired', papersHow: 'Upload them in My Documents on the bid site, or send them to GrayCo from Papers here.',
  papersOpen: 'Open My Documents', papersBlocked: 'The bid form opens once your papers are on file.', pW9: 'W-9', pGL: 'General liability (GL)', pWC: 'Workers’ comp (WC)', bidsSite: 'Open bids.grayco-cs.com' });
Object.assign(L.es, { jobsToBid: '📋 Trabajos para licitar', bidsJoin: 'Unirse a licitaciones GrayCo', bidsJoinWhy: 'Vea los trabajos abiertos de GrayCo y envíe sus ofertas aquí mismo en su portal. Únase una vez — GrayCo aprueba su compañía y los trabajos aparecen aquí.',
  bidsPwShort: 'Escoja una contraseña de al menos 8 caracteres.', bidsLoading: 'Cargando trabajos para licitar…', bidsNoneOpen: 'No hay trabajos para licitar ahora — GrayCo le invita cuando uno sea de su oficio.',
  daysLeft: 'Quedan {n} días', dayLeft: 'Queda 1 día', dueToday: 'Vence hoy', pastDue: 'Ya venció', bidInvited: '📨 Invitado', bidOpen: 'Abierto para licitar', bidPending: '✓ Oferta enviada', bidAccepted: '🏆 Adjudicada', qaTitle: 'Preguntas sobre este trabajo', qaYou: 'Usted preguntó', qaOther: 'Un licitante preguntó', qaShared: 'respuesta para todos', qaWaiting: 'Esperando la respuesta de GrayCo.', qaNone: 'Aún no hay preguntas. Pregunte a GrayCo lo que necesite antes de licitar.', qaPh: 'p. ej. ¿El 2.º piso está en esta oferta? ¿Quién pone la pintura?', qaAsk: 'Hacer una pregunta', qaNeed: 'Escriba su pregunta.', qaSent: 'Pregunta enviada — GrayCo contesta aquí.', qaLbl: 'Su pregunta', bidAwardPm: 'Su gerente de proyecto en GrayCo', bidAwardNext: 'Siguiente: GrayCo le enviará su contrato de subcontratista / el alcance para firmar aquí en su Portal GrayCo.', bidAwardConfirm: 'Por favor confirme esto antes de finalizar', bidRejected: 'No seleccionada', bidClosed: 'Cerrado',
  bidOpenBtn: 'Abrir y licitar ›', bidSeeBtn: 'Ver mi oferta ›', plansLbl: 'Planos', planFiles: 'Archivos de planos', scopeLbl: 'Alcance del trabajo', specsLbl: 'Especificaciones', notesLbl: 'Notas', tradesLbl: 'Oficios', yourTradeScope: 'Alcance para su oficio',
  yourBid: 'Su oferta', bidAmount: 'Monto de la oferta ($)', bidNotes: 'Notas para GrayCo (qué incluye / qué no, tiempos)', bidSubmit: 'Enviar oferta', bidUpdate: 'Actualizar oferta', bidSent: 'Oferta enviada a GrayCo', bidUpdated: 'Oferta actualizada',
  bidDecided: 'GrayCo ya decidió sobre esta oferta — ya no se puede cambiar.', bidClosedNote: 'Las ofertas están cerradas en este trabajo.', bidSentOn: 'Enviada {d}', bidUpdOn: 'actualizada {d}', amountNeed: 'Escriba el monto de su oferta.',
  papersOk: 'Papeles en archivo: W-9, GL, WC', papersNeed: 'Antes de licitar, GrayCo necesita estos papeles en archivo:', papersMissing: 'falta', papersExpired: 'vencido', papersHow: 'Súbalos en Mis Documentos del sitio de licitaciones, o envíelos a GrayCo desde Papeles aquí.',
  papersOpen: 'Abrir Mis Documentos', papersBlocked: 'El formulario de oferta se abre cuando sus papeles estén en archivo.', pW9: 'W-9', pGL: 'Responsabilidad general (GL)', pWC: 'Compensación al trabajador (WC)', bidsSite: 'Abrir bids.grayco-cs.com' });
/* patch PLANREQ (owner 11/12): 📩 Request plans / more info on a job — what they need + a note; the job's PM + estimator get an e-mail,
   a CRM message and a To-Do (portal-access p-bid-request → subportal.js). A big button when the job has no plans, a small link otherwise. */
Object.assign(L.en, { prBtn: '📩 Request plans / more info', prSmall: '📩 Request more info', prNoPlans: 'No plans posted yet. Ask GrayCo for them — the job’s PM / estimator gets your request right away.', prWhat: 'What do you need?',
  prPlans: 'Plans', prSpecs: 'Specs', prSitewalk: 'Site walk / access', prOther: 'Other', prNote: 'Note (optional)', prNotePh: 'e.g. which sheets, your trade, best time for a walk', prFrom: 'From (your profile)',
  prSend: 'Send request', prPickOne: 'Tick what you need.', prOtherNote: 'Write what you need.', prSent: 'Request sent — the job’s PM / estimator will get back to you.', prOpen: 'Request sent {d}',
  prWaiting: 'GrayCo has it — you will hear back here and by e-mail.', prPosted: 'Plans are now posted.', prAnswered: 'GrayCo answered', prSentNote: 'GrayCo sent what you asked for', prAgain: '📩 Ask for something else', prTag: '📩 Requested' });
Object.assign(L.es, { prBtn: '📩 Pedir planos / más información', prSmall: '📩 Pedir más información', prNoPlans: 'Todavía no hay planos. Pídalos a GrayCo — el gerente / estimador del trabajo recibe su pedido al instante.', prWhat: '¿Qué necesita?',
  prPlans: 'Planos', prSpecs: 'Especificaciones', prSitewalk: 'Visita al sitio / acceso', prOther: 'Otro', prNote: 'Nota (opcional)', prNotePh: 'p. ej. qué hojas, su oficio, mejor hora para la visita', prFrom: 'De (su perfil)',
  prSend: 'Enviar pedido', prPickOne: 'Marque lo que necesita.', prOtherNote: 'Escriba lo que necesita.', prSent: 'Pedido enviado — el gerente / estimador del trabajo le responderá.', prOpen: 'Pedido enviado {d}',
  prWaiting: 'GrayCo lo tiene — le responderán aquí y por correo.', prPosted: 'Los planos ya están publicados.', prAnswered: 'GrayCo contestó', prSentNote: 'GrayCo le envió lo que pidió', prAgain: '📩 Pedir otra cosa', prTag: '📩 Pedido' });
var PR_KEYS = ['plans', 'specs', 'sitewalk', 'other'];
/* patch PLANREQ-T (owner 11/12: "need to put what trades we are bidding on some places"): "✓ Your trade: Drywall" when the job wants it */
Object.assign(L.en, { yourTrade: 'Your trade', dTitle: 'Bid details', dWalk: 'Site walk / pre-bid', dQs: 'Questions due by', dStart: 'Start / duration', dReq: 'Requirements', dAlt: 'Alternates', dUnit: 'Unit prices requested', dContacts: 'Contacts', dHow: 'How to bid', dOwner: 'Bidding to', dLines: 'Price each line GrayCo asks for', dClosed: 'Bidding is closed — GrayCo is not taking new bids or changes.' });
Object.assign(L.es, { yourTrade: 'Su oficio', dTitle: 'Detalles de la oferta', dWalk: 'Visita / reunión previa', dQs: 'Preguntas hasta el', dStart: 'Inicio / duración', dReq: 'Requisitos', dAlt: 'Alternativas', dUnit: 'Precios unitarios', dContacts: 'Contactos', dHow: 'Cómo ofertar', dOwner: 'Ofertamos a', dLines: 'Ponga precio a cada línea que pide GrayCo', dClosed: 'Las ofertas están cerradas — GrayCo no recibe ofertas ni cambios nuevos.' });
/* patch PLANREQ-E: what GrayCo filled in on 📂 Manage → 📝 Details */
function detailsBox(j){
  var d = j.details || {}, w = d.siteWalk, r = d.requirements || {}, c = d.contacts || {}, rows = [];
  var req = [r.bond && 'Bond', r.prevailingWage && 'Prevailing wage / Davis-Bacon', r.certifiedPayroll && 'Certified payroll', r.coi && ('COI' + ([r.coiGl && 'GL ' + r.coiGl, r.coiWc && 'WC ' + r.coiWc, r.coiAuto && 'Auto ' + r.coiAuto].filter(Boolean).length ? ' (' + [r.coiGl && 'GL ' + r.coiGl, r.coiWc && 'WC ' + r.coiWc, r.coiAuto && 'Auto ' + r.coiAuto].filter(Boolean).join(', ') + ')' : '')), r.licenses && ('Licenses' + (r.licensesText ? ': ' + r.licensesText : '')), r.mbeWbe && ('MBE / WBE' + (r.mbeWbeText ? ': ' + r.mbeWbeText : ''))].filter(Boolean);
  if (d.ownerGc) rows.push(['dOwner', d.ownerGc]);
  if (w) rows.push(['dWalk', dt(w.date) + (w.time ? ' ' + w.time : '') + (w.location ? ' — ' + w.location : '') + (w.mandatory ? ' (!)' : '')]);
  if (d.questionsDue) rows.push(['dQs', dt(d.questionsDue)]);
  if (d.startDate || d.duration) rows.push(['dStart', [d.startDate ? dt(d.startDate) : '', d.duration].filter(Boolean).join(' · ')]);
  if (req.length) rows.push(['dReq', req.join(' · ')]);
  if ((d.alternates || []).length) rows.push(['dAlt', d.alternates.join(' · ')]);
  if ((d.unitPrices || []).length) rows.push(['dUnit', d.unitPrices.join(' · ')]);
  if (c.pmName || c.estName) rows.push(['dContacts', c.pmName && c.estName && String(c.pmName).toLowerCase() === String(c.estName).toLowerCase() ? 'PM & estimator ' + [c.pmName, c.pmPhone || c.estPhone, c.pmEmail || c.estEmail].filter(Boolean).join(' · ')   /* patch PLANREQ-J: once */
    : [c.pmName && ('PM ' + [c.pmName, c.pmPhone, c.pmEmail].filter(Boolean).join(' · ')), c.estName && [c.estName, c.estPhone, c.estEmail].filter(Boolean).join(' · ')].filter(Boolean).join(' | ')]);
  if (!rows.length && !d.instructions) return null;
  return h('div', { class: 'box', 'data-biddetails': j.id }, [h('b', { text: t('dTitle') }), h('dl', { class: 'info' }, [].concat.apply([], rows.map(function(x){ return [h('dt', { text: t(x[0]) }), h('dd', { text: x[1] })]; })))]
    .concat(d.instructions ? [h('b', { text: t('dHow') }), h('p', { class: 'pre', text: d.instructions })] : []));
}
function yourTrades(j){ var mine = ((BIDS && BIDS.me && BIDS.me.trades) || []).map(function(x){ return String(x).toLowerCase().trim(); }).filter(Boolean);
  return String(j.tradesSought || '').split(/\s*[,;\/]\s*/).filter(Boolean).filter(function(t0){ var a = t0.toLowerCase(); return mine.some(function(b){ return a.indexOf(b) > -1 || b.indexOf(a) > -1; }); }); }
function yourTradeTag(j){ var y = yourTrades(j); return y.length ? h('div', { class: 'yourtrade', 'data-yourtrade': j.id, text: '✓ ' + t('yourTrade') + ': ' + y.join(', ') }) : null; }
function prLbl(k){ return t({ plans: 'prPlans', specs: 'prSpecs', sitewalk: 'prSitewalk', other: 'prOther' }[k] || 'prOther'); }
function prIsOpen(q){ return !!q && q.status !== 'closed' && !q.closedAt && !q.notifiedAt; }
function planReqBox(j){
  var q = j.request, open = prIsOpen(q), has = (j.plansLinks || []).length || (j.plans || []).length, me = (BIDS && BIDS.me) || {};
  var kids = [], st = null;
  if (q && open) st = h('div', { 'data-prstatus': 'open' }, [h('b', { text: '✓ ' + t('prOpen', { d: dt(q.at) }) + ': ' + (q.needs || ['plans']).map(prLbl).join(', ') }), h('div', { class: 'muted', text: t('prWaiting') })]);
  else if (q && q.closedHow === 'answered') st = h('div', { 'data-prstatus': 'answered' }, [h('b', { text: '💬 ' + t('prAnswered') + ':' }), h('p', { class: 'pre', text: q.reply || '' })]);
  else if (q && q.closedHow === 'sent') st = h('div', { 'data-prstatus': 'sent', text: '✅ ' + t('prSentNote') + (q.sentNote ? ': ' + q.sentNote : '.') });
  else if (q && has) st = h('div', { 'data-prstatus': 'plans', text: '✅ ' + t('prPosted') });
  if (st) kids.push(st);
  var form = h('div', { class: 'prform', 'data-prform': j.id, style: 'display:none;flex-direction:column;gap:8px' });
  var boxes = PR_KEYS.map(function(k){ var c = h('input', { type: 'checkbox', 'data-prneed': k }); if (k === 'plans' && !has) c.checked = true; return { k: k, c: c, l: h('label', { class: 'prchk' }, [c, h('span', { text: prLbl(k) })]) }; });
  var note = h('textarea', { class: 'inp', rows: '3', maxlength: '1000', placeholder: t('prNotePh'), 'data-prnote': '1' }), err = h('div', { class: 'err', role: 'alert' });
  var go = h('button', { type: 'button', class: 'btn gold', 'data-prsend': j.id, text: t('prSend') });
  form.appendChild(h('b', { text: t('prWhat') })); form.appendChild(h('div', { class: 'prchks' }, boxes.map(function(b){ return b.l; })));
  form.appendChild(field(t('prNote'), note));
  form.appendChild(h('div', { class: 'muted', 'data-prfrom': '1', text: t('prFrom') + ': ' + [me.company, me.name, me.phone, me.email].filter(Boolean).join(' · ') }));
  form.appendChild(err); form.appendChild(go);
  go.addEventListener('click', function(){
    var needs = boxes.filter(function(b){ return b.c.checked; }).map(function(b){ return b.k; });
    err.textContent = '';
    if (!needs.length) { err.textContent = t('prPickOne'); return; }
    if (needs.length === 1 && needs[0] === 'other' && !String(note.value || '').trim()) { err.textContent = t('prOtherNote'); note.focus(); return; }
    busy(go, true);
    api('p-bid-request', { jobId: j.id, needs: needs, note: note.value }).then(function(r){ j.request = r.request || { status: 'open', needs: needs, at: new Date().toISOString() }; toast(t('prSent')); var nb = planReqBox(j); box.parentNode.replaceChild(nb, box); loadBids(true).then(paintBids); },
      function(e){ busy(go, false); err.textContent = e.message; toast(e.message, true); });
  });
  var openBtn = null;
  if (!open && j.canBid) {
    openBtn = h('button', { type: 'button', class: has ? 'linkbtn' : 'btn gold', 'data-propen': has ? 'small' : 'big', text: q ? t('prAgain') : has ? t('prSmall') : t('prBtn') });
    openBtn.addEventListener('click', function(){ form.style.display = 'flex'; openBtn.style.display = 'none'; try { note.focus(); } catch (e) {} });
    if (!has && !q) kids.push(h('div', { class: 'muted', text: t('prNoPlans') }));
    kids.push(openBtn, form);
  }
  if (!kids.length) return null;
  var box = h('div', { class: has ? 'prsmall' : 'box prbig', 'data-planreq': j.id }, kids);
  return box;
}
var BIDS = null, BIDS_AT = 0, bidBody = null;
function bidCss(){
  if (document.getElementById('gc-subbid-css')) return;
  var st = document.createElement('style'); st.id = 'gc-subbid-css';
  st.textContent = '.bidjob .bidlinks,.bidsheet .bidlinks{display:flex;flex-wrap:wrap;gap:6px}.bidlinks a{display:inline-flex;align-items:center;min-height:36px;font-size:14px;font-weight:600;padding:4px 12px;border:1px solid var(--edge);border-radius:999px;text-decoration:none;background:#fff;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.bidjob .scp{margin:0;font-size:14px;line-height:1.45;color:var(--ink);overflow-wrap:anywhere}.bidjob > .btn{width:100%}@media(min-width:700px){.bidjob > .btn{width:auto;align-self:flex-start;padding:0 18px}}' +
    '.bidpapers{border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.45;display:flex;flex-direction:column;gap:6px}.bidpapers.ok{background:var(--greenBg);color:var(--green);font-weight:600}.bidpapers.bad{background:#fdf1f1;border:1px solid #e7b4b4;color:#7a1a1a}' +
    '.bidpapers ul{margin:0;padding-left:18px}.bidpapers .btn{align-self:flex-start;min-height:40px;font-size:14px;padding:0 12px}.duesoon{color:#8a1c1c;font-weight:700}.bidform{display:flex;flex-direction:column;gap:10px}.bidform[aria-disabled="true"]{opacity:.55}' +
    '.bidsheet .mybid{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.bidsheet .mybid b{font-size:22px}.bidsheet .err{white-space:pre-wrap}' +
    '.prbig{background:#fffbeb;border:1px solid #e9c46a}.prbig > .btn{width:100%}.prchks{display:flex;flex-wrap:wrap;gap:8px}.prchk{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:4px 12px;border:1px solid var(--edge);border-radius:999px;background:#fff;font-size:15px}.prchk input{width:20px;height:20px}' +
    '.yourtrade{align-self:flex-start;background:var(--greenBg,#e7f6ec);color:var(--green,#166534);font-weight:800;font-size:13px;padding:3px 10px;border-radius:999px}' +
    '.linkbtn{background:none;border:0;padding:8px 0;min-height:40px;font:inherit;font-weight:700;color:var(--navy,#1b1640);text-decoration:underline;cursor:pointer;align-self:flex-start}.prsmall{display:flex;flex-direction:column;gap:6px}.bidjob .prtag{font-size:13px}';   /* patch PLANREQ */
  document.head.appendChild(st);
}
function daysTo(d){ if (!d) return null; var a = new Date(d + 'T12:00:00'), b = new Date(todayYmd() + 'T12:00:00'); return Math.round((a - b) / 864e5); }
function dueText(d){ var n = daysTo(d); if (n == null) return ''; return t('bidDue') + ' ' + dt(d) + ' · ' + (n < 0 ? t('pastDue') : n === 0 ? t('dueToday') : n === 1 ? t('dayLeft') : t('daysLeft', { n: n })); }
function bidPill(j){
  var b = j.myBid;
  if (b && b.status === 'accepted') return pill(t('bidAccepted'), 'ok');
  if (b && b.status === 'rejected') return pill(t('bidRejected'), 'skip');
  if (b) return pill(t('bidPending') + ' · ' + usd(b.amount), 'ok');
  if (!j.canBid) return pill(t('bidClosed'), 'skip');
  return j.invited ? pill(t('bidInvited'), 'due') : pill(t('bidOpen'));
}
function paperName(k){ return k === 'w9' ? t('pW9') : k === 'insurance_general' ? t('pGL') : k === 'insurance_workers_comp' ? t('pWC') : k; }
function papersBox(docs, url){
  docs = docs || {};
  if (docs.ok) return h('div', { class: 'bidpapers ok', 'data-bidpapers': 'ok', text: '✅ ' + t('papersOk') });
  var li = (docs.missing || []).map(function(k){ return h('li', { text: paperName(k) + ' — ' + t('papersMissing') }); }).concat((docs.expired || []).map(function(k){ return h('li', { text: paperName(k) + ' — ' + t('papersExpired') }); }));
  return h('div', { class: 'bidpapers bad', 'data-bidpapers': 'missing', role: 'note' }, [h('b', { text: '⚠️ ' + t('papersNeed') }), h('ul', null, li), h('span', { text: t('papersHow') }),
    h('div', { class: 'btns' }, [url ? h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener', text: '📄 ' + t('papersOpen') }) : null, h('button', { type: 'button', class: 'btn', text: t('papers'), on: { click: function(){ var s = document.querySelector('.sheet .x'); if (s) s.click(); goTab('papers'); } } })])]);
}
function planLinks(j){
  var a = (j.plansLinks || []).map(function(l){ return h('a', { href: l.url, target: '_blank', rel: 'noopener', 'data-planlink': '1', title: l.url, text: '🔗 ' + l.label }); });
  return a.length ? h('div', { class: 'bidlinks' }, a) : null;
}
function loadBids(force){
  if (!force && BIDS && Date.now() - BIDS_AT < 60000) return Promise.resolve(BIDS);
  return api('p-bidjobs').then(function(r){ BIDS = r; BIDS_AT = Date.now(); return r; });
}
function paintBids(){
  var body = bidBody; if (!body) return;
  body.innerHTML = '';
  var D = BIDS;
  if (!D) { body.appendChild(h('div', { class: 'muted', text: t('bidsLoading') })); return; }
  if (D.err) { body.appendChild(h('div', { class: 'muted', text: D.err })); return; }
  if (!D.approved) { body.appendChild(h('div', { class: 'muted', text: t('bidsWaiting') })); return; }
  body.appendChild(papersBox(D.docs, D.url));
  var J = D.jobs || [];
  if (!J.length) body.appendChild(h('div', { class: 'empty', text: t('bidsNoneOpen') }));
  J.forEach(function(j){
    var meta = [j.address, j.bidDueDate ? dueText(j.bidDueDate) : ''].filter(Boolean).join(' · '), n = daysTo(j.bidDueDate);
    var short = String(j.scope || (j.tradeScopes[0] || {}).scope || '').replace(/\s+/g, ' ').trim(); if (short.length > 170) short = short.slice(0, 168).replace(/\s+\S*$/, '') + '…';
    body.appendChild(h('div', { class: 'post bidjob', 'data-bidjob': j.id }, [
      h('div', { class: 'row' }, [h('b', { text: j.title }), bidPill(j)]),
      meta ? h('div', { class: 'muted' + (j.canBid && n != null && n <= 3 ? ' duesoon' : ''), text: meta }) : null,
      j.tradesSought ? h('div', { class: 'muted', text: t('tradesLbl') + ': ' + j.tradesSought }) : null,
      yourTradeTag(j),   /* patch PLANREQ-T */
      short ? h('p', { class: 'scp', text: short }) : null,
      planLinks(j),
      prIsOpen(j.request) ? h('div', { class: 'muted prtag', 'data-prtag': j.id, text: t('prTag') + ' · ' + dt(j.request.at) }) : null,   /* patch PLANREQ */
      h('button', { type: 'button', class: 'btn' + (j.canBid && !j.myBid ? ' gold' : ''), 'data-bidopen': j.id, text: j.myBid || !j.canBid ? t('bidSeeBtn') : t('bidOpenBtn'), on: { click: function(){ bidSheet(j); } } })]));
  });
  body.appendChild(h('a', { class: 'btn navy', href: D.url, target: '_blank', rel: 'noopener', text: t('bidsSite') }));
}
function bidSheet(j){
  var D = BIDS || {}, docs = D.docs || {}, b = j.myBid, kids = [];
  if (j.address) kids.push(h('div', { class: 'muted', text: j.address }));
  var yt = yourTradeTag(j); if (yt) kids.push(yt);   /* patch PLANREQ-T */
  var dbx = detailsBox(j); if (dbx) kids.push(dbx);   /* patch PLANREQ-E */
  if (j.biddingClosed) kids.push(h('div', { class: 'how', 'data-bidclosed': j.id, text: '⏸ ' + t('dClosed') }));
  kids.push(h('dl', { class: 'info' }, [j.bidDueDate ? h('dt', { text: t('bidDue') }) : null, j.bidDueDate ? h('dd', { text: dueText(j.bidDueDate).replace(t('bidDue') + ' ', '') }) : null,
    j.tradesSought ? h('dt', { text: t('tradesLbl') }) : null, j.tradesSought ? h('dd', { text: j.tradesSought }) : null]));
  (j.tradeScopes || []).forEach(function(x){ kids.push(h('div', { class: 'box', 'data-tradescope': x.trade || '' }, [h('b', { text: t('yourTradeScope') + (x.trade ? ' — ' + x.trade : '') }), x.scope ? h('p', { class: 'pre', text: x.scope }) : null].concat((x.files || []).map(function(f){   /* patch PLANREQ-C: the trade's scope files */
    return h('div', { class: 'doc', 'data-scopefile': f.name }, [h('span', { text: /pdf/.test(f.type) ? '📄' : /image/.test(f.type) ? '🖼️' : /sheet|excel|csv/.test(f.type) ? '📊' : /word/.test(f.type) ? '📝' : '📎' }), h('span', { class: 'grow' }, [h('span', { class: 'n', text: f.name })]), h('a', { class: 'btn', href: f.url, target: '_blank', rel: 'noopener', text: t('open') })]); })))); });
  [['scopeLbl', j.scope], ['specsLbl', j.specifications], ['notesLbl', j.notes]].forEach(function(r){ if (r[1]) kids.push(h('div', { class: 'box' }, [h('b', { text: t(r[0]) }), h('p', { class: 'pre', text: r[1] })])); });
  if ((j.plansLinks || []).length || (j.plans || []).length) kids.push(h('div', { class: 'box', 'data-bidplans': '1' }, [h('b', { text: t('plansLbl') }), planLinks(j)].concat((j.plans || []).map(function(f){
    return h('div', { class: 'doc' }, [h('span', { text: /pdf/.test(f.type) ? '📄' : /image/.test(f.type) ? '🖼️' : '📎' }), h('span', { class: 'grow' }, [h('span', { class: 'n', text: f.name }), f.category ? h('span', { class: 'muted', text: f.category }) : null]), h('a', { class: 'btn', href: f.url, target: '_blank', rel: 'noopener', text: t('open') })]); }))));
  var prb = planReqBox(j); if (prb) kids.push(prb);   /* patch PLANREQ */
  var sec = [h('div', { class: 'row' }, [h('h2', { text: t('yourBid') }), bidPill(j)])];
  if (b) sec.push(h('div', { class: 'mybid' }, [h('b', { text: usd(b.amount) }), h('span', { class: 'muted', text: t('bidSentOn', { d: dt(b.submittedAt) }) + (b.updatedAt && b.updatedAt.slice(0, 16) !== String(b.submittedAt || '').slice(0, 16) ? ' · ' + t('bidUpdOn', { d: dt(b.updatedAt) }) : '') })]));
  if (b && b.notes) sec.push(h('p', { class: 'pre muted', text: b.notes }));
  var decided = b && (b.status === 'accepted' || b.status === 'rejected');
  if (b && b.award) {   /* patch BIDSCOPE: 🏆 Awarded — the PM to call, the next step, what to confirm */
    var aw = b.award, pmL = [aw.pm && aw.pm.name, aw.pm && aw.pm.phone, aw.pm && aw.pm.email].filter(Boolean).join(' · ');
    sec.push(h('div', { class: 'box', 'data-bidaward': '1' }, [h('b', { text: t('bidAccepted') }),
      pmL ? h('p', { class: 'muted', text: t('bidAwardPm') + ': ' + pmL }) : null,
      aw.pm && aw.pm.phone ? h('a', { class: 'btn', href: 'tel:' + String(aw.pm.phone).replace(/[^\d+]/g, ''), text: '📞 ' + aw.pm.phone }) : null,
      h('p', { text: t('bidAwardNext') }),
      (aw.confirm || []).length ? h('div', null, [h('b', { text: t('bidAwardConfirm') + ':' }), h('ul', null, aw.confirm.map(function(x){ return h('li', { text: x }); }))]) : null]));
  }
  if (decided) sec.push(h('div', { class: 'how', text: t('bidDecided') }));
  else if (!j.canBid) sec.push(h('div', { class: 'how', text: t('bidClosedNote') }));
  else {
    sec.push(papersBox(docs, D.url));
    var blocked = !docs.ok;
    var amt = h('input', { class: 'inp', id: 'bidAmt', type: 'number', inputmode: 'decimal', min: '0', step: '0.01', disabled: blocked, placeholder: '0.00' });
    var nt = h('textarea', { class: 'inp', id: 'bidNotes', rows: '4', maxlength: '4000', disabled: blocked });
    var bf = ((j.details || {}).bidForm || []), have = {}; ((b && b.lines) || []).forEach(function(l){ have[l.id] = l; });   /* patch PLANREQ-E: the bid form's line items */
    var lineIn = bf.map(function(x){ var i = h('input', { class: 'inp', type: 'number', inputmode: 'decimal', step: '0.01', 'data-bidline': x.id, disabled: blocked, placeholder: '$' }); if (have[x.id] && have[x.id].amount != null) i.value = String(have[x.id].amount); return { x: x, i: i }; });
    if (b) { amt.value = String(b.amount); nt.value = b.notes || ''; }
    var err = h('div', { class: 'err', role: 'alert' });
    var go = h('button', { type: 'button', class: 'btn gold', id: 'bidSend', disabled: blocked, text: b ? t('bidUpdate') : t('bidSubmit') });
    sec.push(h('div', { class: 'bidform', 'aria-disabled': blocked ? 'true' : 'false' }, [blocked ? h('div', { class: 'muted', text: t('papersBlocked') }) : null, field(t('bidAmount'), amt)]
      .concat(lineIn.length ? [h('b', { text: t('dLines') })].concat(lineIn.map(function(l){ return field(l.x.item + (l.x.trade ? ' · ' + l.x.trade : '') + (l.x.unit ? ' (' + l.x.unit + ')' : ''), l.i); })) : [])
      .concat([field(t('bidNotes'), nt), err, go])));
    go.addEventListener('click', function(){
      err.textContent = '';
      if (!(Number(amt.value) > 0)) { err.textContent = t('amountNeed'); amt.focus(); return; }
      busy(go, true);
      api('p-bid-save', { jobId: j.id, amount: amt.value, notes: nt.value, lines: lineIn.map(function(l){ return { id: l.x.id, amount: l.i.value === '' ? null : l.i.value }; }) }).then(function(r){
        sh.close(); toast(r.created ? t('bidSent') : t('bidUpdated'));
        return loadBids(true).then(paintBids);
      }, function(e){ busy(go, false); err.textContent = e.message; toast(e.message, true); });
    });
  }
  kids.push(h('section', { class: 'card', 'data-mybid': '1' }, sec));
  /* patch BIDPOST: ❓ Ask a question — GrayCo (the person who posted the job / its PM) answers; the answer shows here */
  var qa = [h('h2', { text: '❓ ' + t('qaTitle') })];
  (j.questions || []).forEach(function(q){ qa.push(h('div', { class: 'box', 'data-bidq': q.id }, [h('b', { text: (q.mine ? t('qaYou') : t('qaOther')) + ' · ' + dt(q.at) }), h('p', { class: 'pre', text: q.body }),
    q.answer ? h('div', null, [h('b', { text: 'GrayCo' + (q.shared ? ' · ' + t('qaShared') : '') + ':' }), h('p', { class: 'pre', text: q.answer })]) : h('div', { class: 'muted', text: t('qaWaiting') })])); });
  if (!(j.questions || []).length) qa.push(h('div', { class: 'muted', text: t('qaNone') }));
  var qt = h('textarea', { class: 'inp', id: 'bidQ', rows: '3', maxlength: '4000', placeholder: t('qaPh') }), qerr = h('div', { class: 'err', role: 'alert' });
  var qgo = h('button', { type: 'button', class: 'btn', id: 'bidQSend', text: '❓ ' + t('qaAsk') });
  qgo.addEventListener('click', function(){
    qerr.textContent = ''; if (!String(qt.value || '').trim()) { qerr.textContent = t('qaNeed'); qt.focus(); return; }
    busy(qgo, true);
    api('p-bid-ask', { jobId: j.id, text: qt.value }).then(function(){ sh.close(); toast(t('qaSent')); return loadBids(true).then(paintBids); }, function(e){ busy(qgo, false); qerr.textContent = e.message; toast(e.message, true); });
  });
  qa.push(field(t('qaLbl'), qt), qerr, qgo);
  kids.push(h('section', { class: 'card', 'data-bidqa': j.id }, qa));
  var sh = sheet(j.title, [h('div', { class: 'bidsheet', 'data-bidsheet': j.id, style: 'display:flex;flex-direction:column;gap:12px' }, kids)]);
  return sh;
}
function bidsCard(b){
  if (!b) return null;
  bidCss();
  var kids = [];
  if (b.state === 'invite') {
    kids.push(h('p', { class: 'muted', text: t('bidsJoinWhy') }));
    if (b.canAccept) kids.push(h('button', { type: 'button', class: 'btn gold', id: 'bidsAccept', text: t('bidsJoin'), on: { click: function(){
      var pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: '8', class: 'inp', id: 'bidsPw' });
      var err = h('div', { class: 'err', role: 'alert' });
      var go = h('button', { type: 'button', class: 'btn gold', id: 'bidsJoinGo', text: t('bidsJoin') });
      var sh = sheet(t('bidsJoin'), [h('p', { text: t('bidsJoinWhy') }), b.email ? h('div', { class: 'muted', text: b.email }) : null, field(t('bidsPw'), pw), err, go]);
      go.addEventListener('click', function(){
        err.textContent = '';
        if (String(pw.value || '').length < 8) { err.textContent = t('bidsPwShort'); pw.focus(); return; }
        busy(go, true); api('p-bids', { password: pw.value }).then(function(){ sh.close(); toast(t('bidsWaiting')); BIDS = null; reloadHome(); }, function(e){ busy(go, false); err.textContent = e.message; toast(e.message, true); });
      });
    } } }));
    else kids.push(h('p', { class: 'muted', text: t('bidsNoEmail') }));
  } else if (b.state === 'waiting') kids.push(h('div', { class: 'row' }, [h('span', { text: t('bidsWaiting') }), pill(t('bidsTitle'))]));
  else if (b.state === 'approved') {
    bidBody = h('div', { class: 'bidlist', 'data-bidlist': '1', style: 'display:flex;flex-direction:column;gap:12px' });
    kids.push(bidBody);
    paintBids();
    loadBids(false).then(function(){ paintBids(); }, function(e){ if (!BIDS) { BIDS = { err: e.message || t('loadFail') }; BIDS_AT = Date.now() - 50000; } paintBids(); });
  }
  else if (b.state === 'off') kids.push(h('p', { class: 'muted', text: t('bidsOff') }));
  if (!kids.length) return null;
  return card(t('jobsToBid'), kids, 'bids');
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
  if ((v.today || []).length) out.push(card(t('today'), v.today.map(todayCard), 'today'));   /* patch SUBPHOTOS */
  out.push(card(t('needs'), needs.length ? needs.map(needRow) : [h('div', { class: 'empty', text: t('nothingNeeded') })], 'needs'));
  var m = v.money || {};
  out.push(card(t('money'), [h('div', { class: 'money3' }, [
    h('div', null, [h('span', { class: 'muted', text: t('submitted') }), h('b', { text: usd(m.submitted) })]),
    h('div', null, [h('span', { class: 'muted', text: t('approvedM') }), h('b', { text: usd(m.approved) })]),
    h('div', null, [h('span', { class: 'muted', text: t('paidMonth') }), h('b', { text: usd(m.paidMonth) })])]), h('div', { class: 'muted', text: t('payRule') }), h('div', { class: 'muted' }, [h('a', { href: 'mailto:invoices@grayco-cs.com', text: 'invoices@grayco-cs.com' })])]));   /* EMAILMAP-patch */
  var wk = v.week || [];
  out.push(card(t('week'), wk.length ? wk.map(function(x){ return lateRow(x, h('div', { class: 'line' }, [h('span', { text: dts(x.date) + (x.time ? ' · ' + x.time : '') }), h('span', { text: x.job + (x.title ? ' — ' + x.title : '') })])); }) : [h('div', { class: 'empty', text: t('noWeek') })]));
  out.push(card(t('avail'), [h('button', { type: 'button', class: 'btn', text: '📅 ' + t('availBtn'), on: { click: availSheet } })]));   /* patch X10 */
  /* SUBHOME3: To bid · Jobs I'm on now · Awarded / coming up · Done */
  var bc = bidsCard(v.bids); if (bc) out.push(bc);
  var G = jobGroups(v.jobs || []);
  if (!(v.jobs || []).length) out.push(card(t('yourJobs'), [h('div', { class: 'empty', text: t('noJobs') })]));
  if (G.now.length) out.push(card(t('jobsNow'), G.now.map(jobRowPo), 'jobs-now'));
  if (G.next.length) out.push(card(t('jobsNext'), G.next.map(jobRowPo), 'jobs-next'));
  if (G.done.length) out.push(card(t('jobsDone'), [h('details', null, [h('summary', { text: G.done.length + ' ' + t('jobsDone').replace(/^\W+/, '') })].concat(G.done.map(jobRow)))], 'jobs-done'));
  var pm = (v.jobs || [])[0] && v.jobs[0].pm;
  out.push(contactCard(pm && pm.name && pm.name !== 'GrayCo office' ? t('pm') : t('office'), pm ? pm.name : t('office'), pm ? pm.phone : OFFICE, pm ? pm.email : 'office@grayco-cs.com'));
  return out;
}
function jobGroups(list){
  var today = todayYmd(), G = { now: [], next: [], done: [] };
  list.forEach(function(j){ var st = String(j.status || '').toLowerCase();
    if (/complete|done|closed|finished|paid/.test(st) || (j.end && j.end < today && (j.pct || 0) >= 100)) G.done.push(j);
    else if ((j.start && j.start <= today) || (j.pct || 0) > 0 || /progress|active|started|working/.test(st)) G.now.push(j);
    else G.next.push(j); });
  return G;
}
function jobRowPo(j){ var row = jobRow(j); if (!j.po) return row; return h('div', { class: 'jobrow-po' }, [row, h('div', { class: 'muted', style: 'margin:2px 0 8px 4px' }, [poRow(j.po), ' ', h('span', { text: t('poHint') })])]); }
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
  var pick = h('button', { type: 'button', class: 'btn', id: 'invPick', text: t('invAttach'), on: { click: function(){ picker('application/pdf,image/*', false, function(fs){ file = fs[0] || null; if (file && file.size > BIG_MAX) { toast(t('tooBig15'), true); file = null; } fname.textContent = file ? file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' KB)' : ''; }); } } });   /* patch SUBPORTAL3 */
  var go = h('button', { type: 'button', class: 'btn gold', id: 'invSend', text: t('send') });
  sel.addEventListener('change', fillScopes);
  var sh = sheet(t('newInvoice'), [h('div', { class: 'how', text: t('payRule') }), field(t('jobs'), sel), field(t('againstScope'), scopeSel), field(t('amount'), amt), field(t('invNum'), num), field(t('po'), poBox), field(t('invNote'), note), h('div', { class: 'muted', text: t('invAttachHow') }), h('div', { class: 'row inv-attach' }, [pick, fname]), go]);
  fillScopes();
  go.addEventListener('click', function(){
    busy(go, true);
    (file ? invoiceUpload(file, sel.value) : Promise.resolve(null)).then(function(u){
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
      h('dt', { text: t('po') }), h('dd', null, [j.po ? poRow(j.po) : t('none')]), h('dt', { text: t('dates') }), h('dd', { text: [j.start ? t('starts') + ' ' + dt(j.start) : '', j.end ? t('ends') + ' ' + dt(j.end) : ''].filter(Boolean).join(' · ') || t('none') }),
      h('dt', { text: t('progress') }), h('dd', { text: (j.pct || 0) + '% ' + t('done') })]),
    JOB.lien && JOB.lien.required ? h('div', { class: 'how', text: t('lien') }) : null,
    JOB.photoRule ? h('div', { class: 'how photo-rule', text: JOB.photoRule.invoiceOk ? t('photoRuleOk', { have: JOB.photoRule.have }) : t('photoRule', { have: JOB.photoRule.have, need: JOB.photoRule.need }) }) : null,
    JOB.photoRule && JOB.photoRule.afterNeed > 0 && (JOB.photoRule.afterHave || 0) < JOB.photoRule.afterNeed ? h('div', { class: 'how photo-rule', id: 'afterRule', text: t('afterRule', { have: JOB.photoRule.afterHave || 0, need: JOB.photoRule.afterNeed }) }) : null,   /* SUBAFTER */
    JOB.care ? h('div', { class: 'how', id: 'careTip', role: 'note', style: 'background:#fff7ed;border-left:3px solid #f97316;padding:8px 10px;border-radius:6px;line-height:1.45' }, [h('b', { text: t('careT') }), h('div', { text: t('careX') })]) : null,   /* CARE */
    JOB.insurance ? h('div', { class: 'how', id: 'insTip', role: 'note', style: 'background:#eff6ff;border-left:3px solid #3b82f6;padding:6px 10px;border-radius:6px', text: '🎥 ' + t('insTip') }) : null,   /* SUBAFTER */
    dayButtons(j.id)]));   /* patch SUBPHOTOS */
  out.push(contactCard(t('pm'), pm.name, pm.phone, pm.email));
  if (j.customer && (j.customer.name || j.customer.phone || j.customer.email)) out.push(card(t('customer'), [h('div', { class: 'sel' }, [h('b', { text: j.customer.name }), j.customer.phone ? h('div', null, [h('a', { href: telOf(j.customer.phone), text: j.customer.phone })]) : null, j.customer.email ? h('div', null, [h('a', { href: 'mailto:' + j.customer.email, text: j.customer.email })]) : null])]));
  var sch = JOB.schedule || [];
  out.push(card(t('schedule'), sch.length ? sch.map(function(x){ return lateRow(x, h('div', { class: 'line' }, [h('span', { text: dts(x.date) }), h('span', { text: [x.time && x.endTime ? x.time + '–' + x.endTime : x.time, x.title].filter(Boolean).join(' · ') })])); }) : [h('div', { class: 'empty', text: t('noWeek') })]));
  var rows = [['gate', s.gate], ['parking', s.parking], ['hours', s.hours], ['dumpster', s.dumpster], ['power', s.power], ['water', s.water], ['notes', s.notes]].filter(function(x){ return x[1]; });
  out.push(codesCard(j.id || (JOB.job && JOB.job.id)));   /* patch X10 */
  /* patch SUBPORTAL3: the job's plans / drawings / specs and files shared with subs (opened in the portal) */
  var docs = JOB.docs || [];
  out.push(h('section', { class: 'card', 'data-subdocs': '1' }, [h('h2', { text: t('jobDocs') })].concat(docs.length ? docs.map(function(f){ return h('div', { class: 'doc' }, [h('span', { text: /pdf/.test(f.type) ? '📄' : /image/.test(f.type) ? '🖼️' : '📎' }), h('span', { class: 'grow', text: f.name }), h('button', { type: 'button', class: 'btn', 'data-subdoc': f.name, text: t('open'), on: { click: function(){ viewer(f); } } })]); }) : [h('div', { class: 'empty', text: t('noDocs') })])));
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
  var box = card(t('photos'), [h('div', { class: 'how', text: t('tipDuring') }), h('div', { class: 'btns3' }, [h('button', { type: 'button', class: 'btn gold', id: 'addPhotos', text: t('addPhotos'), on: { click: function(){ addPhotos(JOB.job.id); } } }),
    h('button', { type: 'button', class: 'btn gold', id: 'addAfter', text: t('addAfter'), on: { click: function(){ addPhotos(JOB.job.id, 'After'); } } })]), h('div', { class: 'empty', id: 'phLoad', text: '…' })]);   /* SUBAFTER */
  loadPhotos(JOB.job.id).then(function(list){
    var e = box.querySelector('#phLoad'); if (!e) return;
    if (!list.length) { e.textContent = t('noPhotos'); return; }
    e.remove();
    /* patch SUBPORTAL3: every photo of the job, newest day first, one group per day; the grid shows the small copies (lazy), a tap
       opens the picture */
    box.appendChild(h('div', { class: 'muted', id: 'phCount', text: t('phCount', { n: list.length }) }));
    var grid = h('div', { id: 'grid' }), day = null, row = null;
    list.forEach(function(p, i){
      var d = p.at || '';
      if (d !== day || !row) { day = d; grid.appendChild(h('div', { class: 'phday', 'data-phday': d || 'undated', text: d ? dt(d) : t('noDate') })); row = h('div', { class: 'pics' }); grid.appendChild(row); }
      row.appendChild(h('button', { type: 'button', 'aria-label': t('photos') + ' ' + (i + 1), class: 'ph' + (p.mine ? ' mine' : ''), on: { click: function(){ lightbox(list, i); } } },
        [h('img', { src: p.t, alt: '', loading: 'lazy', decoding: 'async', width: '160', height: '160' }), p.tag ? h('span', { class: 'phtag', text: p.tag }) : (p.mine ? h('span', { class: 'phtag', text: t('you') }) : null)]));
    });
    box.appendChild(grid);
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
/* patch SUBPORTAL3: one call — the portal's own server applies the GrayCo Photos rules (every photo of the job but "Hidden from subs") */
function loadPhotos(pid){
  return api('p-photos', { projectId: pid }).then(function(r){ return (r.photos || []).map(function(p){ return { t: p.t || p.f, f: p.f || p.t, at: p.at || '', tag: p.tag || '', mine: !!p.mine }; }).filter(function(p){ return p.t && p.f; }); }, function(){ return []; });
}
/* a photo the sub took → the job's GrayCo Photos, tagged with the sub (false when GrayCo Photos is not there) */
function toGPhotos(file, pid, tag, note){
  return Promise.all([readFile(file), thumbOf(file)]).then(function(x){ var f = x[0]; return gphotos({ action: 'upload', jobId: pid, name: f.name, data: f.data, thumb: x[1] || undefined, tag: tag || 'During', note: note || '' }); }).then(function(j){ return !!(j && j.ok); }, function(){ return false; });
}
/* patch SUBPORTAL3: a 400 px copy for the photo grids (JPEG / PNG / WebP the phone can draw; none for others) */
function thumbOf(file){
  return new Promise(function(res){
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return res('');
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function(){ try { var k = Math.min(1, 400 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.7).split(',')[1]); } catch (e) { res(''); } };
    img.onerror = function(){ URL.revokeObjectURL(url); res(''); };
    img.src = url;
  });
}
function addPhotos(pid0, tag0){
  var files = [], list = h('div', { class: 'muted', id: 'phList' }), note = h('input', { class: 'inp', id: 'phNote' }), tag = tag0 === 'After' ? 'After' : 'During';   /* SUBAFTER: During the job / Finished work (After) */
  var tip = h('div', { class: 'how', id: 'phTip', text: t(tag === 'After' ? 'tipAfter' : 'tipDuring') });
  var tb = function(k, l){ return h('button', { type: 'button', class: 'btn' + (tag === k ? ' gold' : ''), 'data-phtag': k, 'aria-pressed': tag === k ? 'true' : 'false', text: t(l), on: { click: function(){ tag = k; tip.textContent = t(k === 'After' ? 'tipAfter' : 'tipDuring'); Array.prototype.forEach.call(document.querySelectorAll('[data-phtag]'), function(b){ var on = b.getAttribute('data-phtag') === tag; b.className = 'btn' + (on ? ' gold' : ''); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); } } }); };
  var tagRow = h('div', { class: 'btns3' }, [tb('During', 'phDuring'), tb('After', 'phAfter')]);
  var add = function(fs){ files = files.concat(fs); list.textContent = files.map(function(f){ return f.name; }).join(', '); };
  var cam = h('button', { type: 'button', class: 'btn', id: 'phCam', text: t('takePhoto'), on: { click: function(){ picker('image/*', false, add, 'environment'); } } });   /* patch SUBPHOTOS: the phone's camera */
  var pick = h('button', { type: 'button', class: 'btn', id: 'phPick', text: t('choosePhotos'), on: { click: function(){ picker('image/*', true, add); } } });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'phSend', text: t('send') });
  var sh = sheet(t('photos'), [tagRow, tip, h('div', { class: 'btns3' }, [cam, pick]), list, field(t('photoNote'), note), go]);
  go.addEventListener('click', function(){
    if (!files.length) { toast(t('pickFile'), true); return; }
    busy(go, true);
    var pid = pid0 || JOB.job.id, sentG = 0;
    files.slice(0, 12).reduce(function(p, f){ return p.then(function(ids){ return toGPhotos(f, pid, tag, note.value).then(function(okG){ if (okG) { sentG++; return ids; } return upload(f, 'photo', pid).then(function(u){ ids.push(u.id); return ids; }); }); }); }, Promise.resolve([]))
      .then(function(ids){ return api('p-photos-add', { projectId: pid, uploadIds: ids, gphotos: sentG, note: note.value, tag: tag }); })
      .then(function(){ sh.close(); toast(t('saved')); if (JOB || !pid0) openJob(pid, 'photos'); else reloadHome(); }, function(e){ busy(go, false); toast(e.message, true); });
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

/* patch SUBSIGNUP (owner 11/11): "New subcontractor? Create your account" — from the portal's own sign-in screen. The bid site's
   register (netlify/functions/subportal.js): a sign-in + a sub profile that sees nothing until GrayCo approves it (Admin Approvals
   in the CRM) — unless the sub came from a job invite (?invite=…&job=…), which is approved at once. Then they sign in here. */
var SP = '/.netlify/functions/subportal';
Object.assign(L.en, { suTitle: 'Create your subcontractor account', suWhy: 'For subcontractors who want to work with GrayCo. GrayCo reviews every new account before you can see jobs or bid.',
  suFirst: 'First name', suLast: 'Last name', suCompany: 'Company name', suDba: 'DBA (optional)', suEmail: 'E-mail (this is your login)', suPhone: 'Mobile phone', suTrades: 'Your trade(s) — tap all that fit',
  suTradesPh: 'Drywall, paint, framing', suAddr: 'Business address', suCity: 'City', suState: 'State', suZip: 'ZIP', suLic: 'License numbers (optional)', suEin: 'EIN — last 4 digits (optional)',
  suPw: 'Password (8 or more characters)', suPw2: 'Password again', suAgree: 'I agree to the ', suAnd: ' and the ', suTerms: 'Sub Portal Terms of Use', suPriv: 'Sub Portal Privacy Notice', suGo: 'Create my account',
  suBack: '‹ Back to sign in', suNeed: 'Please fill in: {f}.', suEmailBad: 'Enter a valid e-mail address.', suPwShort: 'The password must be at least 8 characters.', suPwDiff: 'The two passwords do not match.',
  suAgreeNeed: 'Please agree to the Sub Portal Terms of Use and Privacy Notice.', suStateBad: 'Use the 2-letter state (TN, MS, AR …).', suEinBad: 'The EIN part is the last 4 digits only.',
  suDupT: 'Is your company already with GrayCo?', suDupX: 'We found a company that looks like yours. If one of these is you, sign in instead (or call GrayCo ' + OFFICE + ').', suDupWhy: 'matched on',
  suForce: 'That’s not us — create anyway', suTaken: 'That e-mail already has an account. Sign in with it — or tap “Forgot password? E-mail me a code”.', suSignin: 'Sign in',
  suDoneT: 'Account created', suDone: 'Thanks — GrayCo reviews new accounts (usually the same day). We’ll e-mail you when you’re approved. Then sign in here with your e-mail.',
  suDoneInv: 'Thanks — you came with a GrayCo invite, so your account is approved. Sign in here with your e-mail.', suInvited: 'You’re invited to bid on {j}.', suInvitedAny: 'You’re invited to bid on a GrayCo job.',
  suName: 'Your name', suCrew: 'Crew size (optional)', suTradeOther: 'Other trade(s) — type them here', suArea: 'Where you work (optional)', suAreaPh: 'Shelby, DeSoto, Fayette counties…',
  ppLater: 'I have it — will send later', ppUpload: 'Upload', ppExemptS: 'Exempt (sole proprietor)',
  ppT: '📎 Your papers — optional', ppWhy: 'Upload these now for faster approval — a PDF or a phone photo is fine. With your W-9, general liability and workers’ comp on file, GrayCo can approve you and you can bid right away. No files handy? Tick “I have it — will send later”.',
  ppW9: 'W-9', ppGl: 'General liability certificate (COI)', ppWc: 'Workers’ comp certificate (COI)', ppExp: 'Expiration date', ppExempt: 'Exempt / sole proprietor — upload the TN workers’ comp exemption form instead',
  ppLic: 'License', ppLicState: 'State', ppLicType: 'Type (e.g. Electrical, General)', ppLicNum: 'Number', ppLicAdd: '＋ Add another license', ppFile: 'File (PDF or photo, 50 MB at most)',
  ppExpNeed: 'Add the expiration date for: {f}.', ppBig: '{f} is over 50 MB.', ppUp: 'Uploading your papers…', ppDone: '📎 {n} paper(s) uploaded — GrayCo sees them with your request.', ppFail: 'Some papers did not upload ({f}). Sign in and add them in My Documents.' });
Object.assign(L.es, { suTitle: 'Cree su cuenta de subcontratista', suWhy: 'Para subcontratistas que quieren trabajar con GrayCo. GrayCo revisa cada cuenta nueva antes de que usted pueda ver trabajos o licitar.',
  suFirst: 'Nombre', suLast: 'Apellido', suCompany: 'Nombre de la compañía', suDba: 'DBA (opcional)', suEmail: 'Correo (es su usuario)', suPhone: 'Celular', suTrades: 'Su(s) oficio(s) — toque todos los que hace',
  suTradesPh: 'Tabla roca, pintura, estructura', suAddr: 'Dirección del negocio', suCity: 'Ciudad', suState: 'Estado', suZip: 'Código postal', suLic: 'Números de licencia (opcional)', suEin: 'EIN — últimos 4 dígitos (opcional)',
  suPw: 'Contraseña (8 caracteres o más)', suPw2: 'Repita la contraseña', suAgree: 'Acepto los ', suAnd: ' y el ', suTerms: 'Términos de uso del Portal de Subcontratistas', suPriv: 'Aviso de privacidad del Portal de Subcontratistas', suGo: 'Crear mi cuenta',
  suBack: '‹ Volver a entrar', suNeed: 'Por favor llene: {f}.', suEmailBad: 'Escriba un correo válido.', suPwShort: 'La contraseña debe tener al menos 8 caracteres.', suPwDiff: 'Las dos contraseñas no son iguales.',
  suAgreeNeed: 'Por favor acepte los Términos de uso y el Aviso de privacidad.', suStateBad: 'Use el estado de 2 letras (TN, MS, AR …).', suEinBad: 'Del EIN solo los últimos 4 dígitos.',
  suDupT: '¿Su compañía ya está con GrayCo?', suDupX: 'Encontramos una compañía que se parece a la suya. Si es usted, entre en su cuenta (o llame a GrayCo ' + OFFICE + ').', suDupWhy: 'coincide en',
  suForce: 'No somos nosotros — crear de todos modos', suTaken: 'Ese correo ya tiene una cuenta. Entre con él — o toque “¿Olvidó la contraseña? Envíenme un código”.', suSignin: 'Entrar',
  suDoneT: 'Cuenta creada', suDone: 'Gracias — GrayCo revisa las cuentas nuevas (normalmente el mismo día). Le enviaremos un correo cuando esté aprobada. Después entre aquí con su correo.',
  suDoneInv: 'Gracias — usted vino con una invitación de GrayCo, así que su cuenta está aprobada. Entre aquí con su correo.', suInvited: 'Está invitado a licitar en {j}.', suInvitedAny: 'Está invitado a licitar en un trabajo de GrayCo.',
  suName: 'Su nombre', suCrew: 'Tamaño de la cuadrilla (opcional)', suTradeOther: 'Otro(s) oficio(s) — escríbalos aquí', suArea: 'Dónde trabaja (opcional)', suAreaPh: 'Condados de Shelby, DeSoto, Fayette…',
  ppLater: 'Lo tengo — lo envío después', ppUpload: 'Subir', ppExemptS: 'Exento (propietario único)',
  ppT: '📎 Sus documentos — opcional', ppWhy: 'Súbalos ahora para una aprobación más rápida — un PDF o una foto del celular sirve. Con su W-9, el seguro de responsabilidad general y el de compensación de trabajadores, GrayCo puede aprobarlo y usted puede licitar de inmediato. ¿No los tiene a mano? Marque “Lo tengo — lo envío después”.',
  ppW9: 'W-9', ppGl: 'Certificado de responsabilidad general (COI)', ppWc: 'Certificado de compensación de trabajadores (COI)', ppExp: 'Fecha de vencimiento', ppExempt: 'Exento / propietario único — suba el formulario de exención de TN',
  ppLic: 'Licencia', ppLicState: 'Estado', ppLicType: 'Tipo (p. ej. Eléctrica, General)', ppLicNum: 'Número', ppLicAdd: '＋ Agregar otra licencia', ppFile: 'Archivo (PDF o foto, 50 MB máximo)',
  ppExpNeed: 'Agregue la fecha de vencimiento de: {f}.', ppBig: '{f} pasa de 50 MB.', ppUp: 'Subiendo sus documentos…', ppDone: '📎 {n} documento(s) subidos — GrayCo los ve con su solicitud.', ppFail: 'Algunos documentos no se subieron ({f}). Entre y agréguelos en Mis documentos.' });
var DUPWHY = { es: { 'company name': 'nombre de la compañía', address: 'dirección', phone: 'teléfono', EIN: 'EIN' } };
function suCss(){
  if (document.getElementById('gc-signup-css')) return;
  var st = document.createElement('style'); st.id = 'gc-signup-css';
  st.textContent = '.card.signup{max-width:680px;margin:0 auto;width:100%}.su-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}@media(min-width:620px){.su-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.su-grid .wide2{grid-column:1/-1}.su-grid.addr{grid-template-columns:minmax(0,1fr) 90px 120px}}' +
    '.su-agree{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45}.su-agree input{width:22px;height:22px;flex:0 0 22px;margin:1px 0 0}.su-dup{border:1px solid var(--gold);background:var(--goldBg);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:14px}' +
    '.su-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px}.su-chips .chip{border:1px solid var(--line,#d6d3cc);background:#fff;border-radius:999px;padding:7px 12px;font:600 14px inherit;min-height:38px;cursor:pointer}.su-chips .chip.on{background:var(--navy,#0F1D2F);color:#fff;border-color:var(--navy,#0F1D2F)}' +
    '.su-papers{border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;margin:0}.su-papers legend{font-weight:700;padding:0 6px}.pp-row{display:flex;flex-direction:column;gap:6px;padding:8px 0;border-top:1px dashed var(--line,#e5e7eb)}' +
    '.pp-row [hidden]{display:none!important}.pp-opts{display:flex;flex-wrap:wrap;gap:6px 14px}.pp-opt{display:flex;gap:6px;align-items:center;font-size:14px;min-height:34px}.pp-opt input{width:20px;height:20px;margin:0}.su-grid.lic{grid-template-columns:70px minmax(0,1fr) minmax(0,1fr)}' +
    '.su-dup ul{margin:0;padding-left:18px}.su-req{color:#8a1c1c}.su-done{display:flex;flex-direction:column;gap:12px;align-items:stretch;text-align:center}.su-done .big{font-size:22px}';
  document.head.appendChild(st);
}
function sp(body){
  return fetch(SP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'omit', body: JSON.stringify(body) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { status: r.status, data: j || {} }; }); });
}
/* patch SIGNUPPAPERS (owner 11/12: "either check they have insurance, W-9 and workman's comp, or they can enter it — PDF or any document …
   get good info from them, not too much though, just what I need: their trades and some basic stuff"): ONE short screen — company,
   contact, e-mail (login), cell, city / state, trades (GrayCo's list + Other), service area and crew size (optional), the language
   (the page's EN / ES switch) — and the papers: W-9, general liability, workers' comp each "I have it — will send later" / 📎 Upload
   (PDF, a photo, Word …; the expiry date for insurance) / for workers' comp "Exempt (sole proprietor)"; one optional license row.
   "Will send later" is recorded as what they say (not a paper on file); bids still need the real papers (the bid-papers check). */
var ACCEPT_DOCS = 'application/pdf,image/*,.heic,.heif,.doc,.docx,.rtf,.odt,.txt,.pages';
var SU_TRADES = ['Drywall', 'Paint', 'Framing', 'Flooring', 'Tile', 'Roofing', 'Siding', 'Electrical', 'Plumbing', 'HVAC', 'Concrete', 'Masonry', 'Insulation', 'Cabinets', 'Windows & Doors', 'Demolition', 'Landscaping', 'Cleaning'];
function signup(opts){
  opts = opts || {};
  if (opts.lang) LANG = opts.lang === 'es' ? 'es' : 'en';
  suCss();
  var main = opts.main || document.getElementById('main'), keep = opts.keep || {};
  main.innerHTML = '';
  var box = h('section', { class: 'card signin signup', id: 'signupBox' });
  main.appendChild(box);
  var F = {}, TR = keep.tradesPicked || {};
  function inp(k, attrs){ var el = h('input', Object.assign({ class: 'inp', id: 'su_' + k, 'data-su': k }, attrs || {})); if (keep[k] != null) el.value = keep[k]; el.addEventListener('input', function(){ keep[k] = el.value; }); F[k] = el; return el; }
  function req(label){ return h('span', null, [label, h('span', { class: 'su-req', 'aria-hidden': 'true', text: ' *' })]); }
  function fld(label, el, cls, required){ return h('label', { class: 'fld' + (cls ? ' ' + cls : '') }, [required ? req(label) : h('span', { text: label }), el]); }
  var inviteNote = h('div', { class: 'how', id: 'suInvite', hidden: true });
  var err = h('div', { class: 'err', role: 'alert', id: 'suErr' }), dup = h('div', { id: 'suDup' });
  var agree = h('input', { type: 'checkbox', id: 'su_agree', 'data-su': 'agree' }); agree.checked = !!keep.agree; agree.addEventListener('change', function(){ keep.agree = agree.checked; });
  var go = h('button', { type: 'button', class: 'btn gold', id: 'suGo', text: t('suGo') });
  box.appendChild(h('button', { type: 'button', class: 'back', id: 'suBack', style: 'align-self:flex-start', text: t('suBack'), on: { click: function(){ if (opts.back) opts.back(F.email && F.email.value.trim()); } } }));
  box.appendChild(h('h2', { text: t('suTitle') }));
  box.appendChild(h('p', { class: 'muted', text: t('suWhy') }));
  box.appendChild(inviteNote);
  box.appendChild(h('div', { class: 'su-grid' }, [fld(t('suCompany'), inp('company', { autocomplete: 'organization', maxlength: '120' }), '', true), fld(t('suName'), inp('name', { autocomplete: 'name', maxlength: '80' }), '', true),
    fld(t('suEmail'), inp('email', { type: 'email', inputmode: 'email', autocomplete: 'email', maxlength: '200' }), '', true), fld(t('suPhone'), inp('phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '40' }), '', true)]));
  box.appendChild(h('div', { class: 'su-grid addr' }, [fld(t('suCity'), inp('city', { autocomplete: 'address-level2', maxlength: '80' }), '', true), fld(t('suState'), inp('state', { autocomplete: 'address-level1', maxlength: '2', style: 'text-transform:uppercase' }), '', true),
    fld(t('suCrew'), inp('crew', { type: 'number', inputmode: 'numeric', min: '1', max: '999' }))]));
  /* trades: GrayCo's list (the CRM's trades when the server has them) + Other */
  var chips = h('div', { class: 'su-chips', id: 'suTrades', role: 'group' });
  function drawChips(list){
    chips.innerHTML = '';
    list.forEach(function(tr){ var b = h('button', { type: 'button', class: 'chip' + (TR[tr] ? ' on' : ''), 'data-su-trade': tr, 'aria-pressed': TR[tr] ? 'true' : 'false', text: tr });
      b.addEventListener('click', function(){ TR[tr] = !TR[tr]; keep.tradesPicked = TR; b.classList.toggle('on', !!TR[tr]); b.setAttribute('aria-pressed', TR[tr] ? 'true' : 'false'); }); chips.appendChild(b); });
  }
  drawChips(SU_TRADES);
  sp({ action: 'trade-list' }).then(function(r){ var l = r && r.data && r.data.trades; if (Array.isArray(l) && l.length) drawChips(l); }, function(){});
  box.appendChild(h('div', { class: 'fld' }, [req(t('suTrades')), chips, inp('tradeOther', { placeholder: t('suTradeOther'), maxlength: '120' })]));
  box.appendChild(fld(t('suArea'), inp('area', { placeholder: t('suAreaPh'), maxlength: '200' })));
  /* the papers */
  var pbox = h('fieldset', { class: 'su-papers', id: 'suPapers' });
  pbox.appendChild(h('legend', { text: t('ppT') }));
  pbox.appendChild(h('p', { class: 'how', id: 'ppWhy', text: t('ppWhy') }));
  function paperRow(k, label, exp, exempt){
    var name = 'pp_' + k, file = h('input', { type: 'file', class: 'inp', id: 'pp_' + k + 'f', accept: ACCEPT_DOCS, hidden: true }), date = exp ? h('input', { type: 'date', class: 'inp', id: 'pp_' + k + 'e', 'aria-label': t('ppExp') }) : null;
    var dateF = date ? fld(t('ppExp'), date) : null; if (dateF) dateF.hidden = true;
    var opts2 = [['later', t('ppLater')], ['upload', '📎 ' + t('ppUpload')]].concat(exempt ? [['exempt', t('ppExemptS')]] : []);
    var radios = h('div', { class: 'pp-opts' }, opts2.map(function(o){ var r = h('input', { type: 'radio', name: name, value: o[0], id: name + '_' + o[0] });
      r.addEventListener('change', function(){ file.hidden = !(o[0] === 'upload' || o[0] === 'exempt'); if (dateF) dateF.hidden = o[0] !== 'upload'; }); return h('label', { class: 'pp-opt' }, [r, h('span', { text: o[1] })]); }));
    return h('div', { class: 'pp-row', 'data-pp': k }, [h('b', { text: label }), radios, file, dateF]);
  }
  pbox.appendChild(paperRow('w9', t('ppW9'), false, false));
  pbox.appendChild(paperRow('gl', t('ppGl'), true, false));
  pbox.appendChild(paperRow('wc', t('ppWc'), true, true));
  pbox.appendChild(h('div', { class: 'pp-row', 'data-pp': 'lic' }, [h('b', { text: t('ppLic') }), h('div', { class: 'su-grid lic' }, [fld(t('ppLicState'), h('input', { class: 'inp', id: 'pp_ls', maxlength: '2', style: 'text-transform:uppercase' })),
    fld(t('ppLicType'), h('input', { class: 'inp', id: 'pp_lt', maxlength: '80' })), fld(t('ppLicNum'), h('input', { class: 'inp', id: 'pp_ln', maxlength: '60' }))]), h('input', { type: 'file', class: 'inp', id: 'pp_lf', accept: ACCEPT_DOCS })]));
  box.appendChild(pbox);
  box.appendChild(h('div', { class: 'su-grid' }, [fld(t('suPw'), inp('pw', { type: 'password', autocomplete: 'new-password', minlength: '8' }), '', true), fld(t('suPw2'), inp('pw2', { type: 'password', autocomplete: 'new-password', minlength: '8' }), '', true)]));
  box.appendChild(h('label', { class: 'su-agree' }, [agree, h('span', null, [t('suAgree'), h('a', { href: '#', 'data-href': '/sub-terms.html', text: t('suTerms') }), t('suAnd'), h('a', { href: '#', 'data-href': '/sub-privacy.html', text: t('suPriv') }), '.'])]));
  Array.prototype.forEach.call(box.querySelectorAll('a[data-href]'), function(a){ a.setAttribute('href', a.getAttribute('data-href')); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); });
  box.appendChild(dup); box.appendChild(err); box.appendChild(go);
  if (opts.invite) sp({ action: 'invite-info', invite: opts.invite, job: opts.job || '' }).then(function(r){
    if (!r.data || !r.data.ok) return;
    inviteNote.textContent = r.data.jobTitle ? t('suInvited', { j: r.data.jobTitle }) : t('suInvitedAny'); inviteNote.hidden = false;
    if (r.data.email && !F.email.value) { F.email.value = r.data.email; keep.email = r.data.email; }
  }, function(){});
  function v(k){ return String(F[k].value || '').trim(); }
  function choice(k){ var r = box.querySelector('input[name="pp_' + k + '"]:checked'); return r ? r.value : ''; }
  function papersPicked(){
    var out = [], bad = [], big = [], claimed = { w9: false, gl: false, wc: false, wcExempt: false };
    var g = function(id){ return document.getElementById(id) || { value: '', files: [] }; };
    var add = function(id, o, needExp, nm){ var f = g(id).files && g(id).files[0]; if (!f) return false; if (f.size > 50 * 1024 * 1024) { big.push(f.name); return true; } if (needExp && !o.expirationDate) { bad.push(nm); return true; } o.file = f; out.push(o); return true; };
    var c = choice('w9'); if (c === 'later') claimed.w9 = true; if (c === 'upload' && !add('pp_w9f', { type: 'w9', label: 'W-9' }, false, 'W-9')) claimed.w9 = true;
    c = choice('gl'); if (c === 'later') claimed.gl = true; if (c === 'upload' && !add('pp_glf', { type: 'insurance_general', label: 'General liability COI', expirationDate: g('pp_gle').value }, true, t('ppGl'))) claimed.gl = true;
    c = choice('wc'); if (c === 'later') claimed.wc = true;
    if (c === 'upload' && !add('pp_wcf', { type: 'insurance_workers_comp', label: 'Workers\' comp COI', expirationDate: g('pp_wce').value }, true, t('ppWc'))) claimed.wc = true;
    if (c === 'exempt') { claimed.wcExempt = true; add('pp_wcf', { type: 'insurance_workers_comp', label: 'Workers\' comp exemption (sole proprietor)', wcExempt: true }, false, t('ppWc')); }
    add('pp_lf', { type: 'license', licState: g('pp_ls').value.trim().toUpperCase(), licType: g('pp_lt').value.trim(), licNumber: g('pp_ln').value.trim() }, false, t('ppLic'));
    return { items: out, bad: bad, big: big, claimed: claimed };
  }
  function uploadPapers(token, picked){
    var done = [], failed = [];
    var one = function(o){
      return sp({ action: 'signup-upload', paperToken: token, name: o.file.name, size: o.file.size, type: o.file.type }).then(function(r){
        if (r.status !== 200 || !r.data.url) throw new Error((r.data && r.data.error) || 'upload');
        return fetch(r.data.url, { method: 'PUT', headers: { apikey: r.data.apikey || '', 'Content-Type': o.file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: o.file }).then(function(x){ if (!x.ok) throw new Error('upload ' + x.status);
          var it = Object.assign({}, o, { fileRef: r.data.path, fileName: o.file.name, fileSize: o.file.size, fileType: o.file.type }); delete it.file; done.push(it); });
      }).catch(function(){ failed.push(o.file.name); });
    };
    return picked.items.reduce(function(p, o){ return p.then(function(){ return one(o); }); }, Promise.resolve()).then(function(){
      if (!done.length) return { n: 0, failed: failed };
      return sp({ action: 'signup-papers', paperToken: token, items: done }).then(function(r){ return { n: r.status === 200 ? (r.data.saved || 0) : 0, failed: r.status === 200 ? failed : failed.concat(done.map(function(x){ return x.fileName; })) }; });
    });
  }
  function submit(force){
    err.textContent = ''; dup.innerHTML = '';
    var trades = Object.keys(TR).filter(function(k){ return TR[k]; }).concat(v('tradeOther').split(/[,;\n]+/).map(function(x){ return x.trim(); }).filter(Boolean)).slice(0, 30);
    var need = [['company', 'suCompany'], ['name', 'suName'], ['email', 'suEmail'], ['phone', 'suPhone'], ['city', 'suCity'], ['state', 'suState']].filter(function(x){ return !v(x[0]); });
    if (!trades.length) need.push(['tradeOther', 'suTrades']);
    if (need.length) { err.textContent = t('suNeed', { f: need.map(function(x){ return t(x[1]).replace(/ —.*$/, '').replace(/ \(.*\)$/, ''); }).join(', ') }); F[need[0][0]].focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v('email'))) { err.textContent = t('suEmailBad'); F.email.focus(); return; }
    if (!/^[A-Za-z]{2}$/.test(v('state'))) { err.textContent = t('suStateBad'); F.state.focus(); return; }
    if (String(F.pw.value).length < 8) { err.textContent = t('suPwShort'); F.pw.focus(); return; }
    if (F.pw.value !== F.pw2.value) { err.textContent = t('suPwDiff'); F.pw2.focus(); return; }
    if (!agree.checked) { err.textContent = t('suAgreeNeed'); agree.focus(); return; }
    var picked = papersPicked();
    if (picked.big.length) { err.textContent = t('ppBig', { f: picked.big.join(', ') }); return; }
    if (picked.bad.length) { err.textContent = t('ppExpNeed', { f: picked.bad.join(', ') }); return; }
    var body = { action: 'register', email: v('email').toLowerCase(), password: F.pw.value, force: force ? true : undefined,
      profile: { name: v('name'), company: v('company'), phone: v('phone'), trades: trades, businessCity: v('city'), businessState: v('state').toUpperCase(), serviceArea: v('area'),
        numEmployees: v('crew'), lang: LANG, papersClaimed: picked.claimed } };
    if (opts.invite) { body.invite = opts.invite; body.job = opts.job || ''; }
    busy(go, true);
    sp(body).then(function(r){
      busy(go, false);
      var d = r.data || {};
      if (r.status === 200 && d.duplicates && d.duplicates.length) {
        dup.appendChild(h('div', { class: 'su-dup', 'data-su-dup': '1' }, [h('b', { text: t('suDupT') }), h('span', { text: t('suDupX') }),
          h('ul', null, d.duplicates.map(function(x){ return h('li', { text: x.company + (x.dbaName ? ' (DBA ' + x.dbaName + ')' : '') + ' — ' + t('suDupWhy') + ' ' + (x.reasons || []).map(function(w){ return (DUPWHY[LANG] || {})[w] || w; }).join(', ') }); })),
          h('div', { class: 'btns' }, [h('button', { type: 'button', class: 'btn', id: 'suDupSignin', text: t('suSignin'), on: { click: function(){ if (opts.back) opts.back(v('email')); } } }),
            h('button', { type: 'button', class: 'btn gold', id: 'suForce', text: t('suForce'), on: { click: function(){ submit(true); } } })])]));
        dup.scrollIntoView({ block: 'center' });
        return;
      }
      if (r.status === 409) {
        dup.appendChild(h('div', { class: 'su-dup', 'data-su-taken': '1' }, [h('span', { text: t('suTaken') }), h('button', { type: 'button', class: 'btn gold', id: 'suTakenSignin', text: t('suSignin'), on: { click: function(){ if (opts.back) opts.back(v('email')); } } })]));
        return;
      }
      if (r.status !== 200 || !d.ok) { err.textContent = d.error || t('failed'); return; }
      if (picked.items.length && d.paperToken) {
        busy(go, true); err.textContent = t('ppUp');
        return uploadPapers(d.paperToken, picked).then(function(u){ busy(go, false); done(!!d.approved, body.email, u); });
      }
      done(!!d.approved, body.email);
    }, function(){ busy(go, false); err.textContent = t('loadFail'); });
  }
  go.addEventListener('click', function(){ submit(false); });
  function done(approved, email, pap){
    main.innerHTML = '';
    Object.keys(keep).forEach(function(k){ delete keep[k]; });
    main.appendChild(h('section', { class: 'card signin signup su-done', id: 'signupDone', 'data-approved': approved ? '1' : '0' }, [h('div', { class: 'big', text: '✅ ' + t('suDoneT') }),
      h('p', { text: approved ? t('suDoneInv') : t('suDone') }), email ? h('div', { class: 'muted', text: email }) : null,
      pap && pap.n ? h('p', { id: 'suPapersDone', text: t('ppDone', { n: pap.n }) }) : null, pap && pap.failed && pap.failed.length ? h('p', { class: 'err', id: 'suPapersFail', text: t('ppFail', { f: pap.failed.join(', ') }) }) : null,
      h('button', { type: 'button', class: 'btn gold', id: 'suDoneSignin', text: t('suSignin'), on: { click: function(){ if (opts.back) opts.back(email); } } })]));
    window.scrollTo(0, 0);
  }
  window.scrollTo(0, 0);
  return { el: box };
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
      document.addEventListener('visibilitychange', function(){ if (!document.hidden && !document.querySelector('.sheet')) reloadHome(); });   /* patch SUBSESS: phone awake again → fresh */
    }, function(e){
      if (ENDED) return;   /* signed out for real (H.ended showed that) */
      /* patch SUBSESS: could not load (no signal / a hiccup): still signed in — try again by itself */
      var main = document.getElementById('main'); main.innerHTML = '';
      var again = function(){ cleanup(); main.innerHTML = '<div class="skel"></div>'; window.GCPartner.start(opts); };
      var onShow = function(){ if (!document.hidden) again(); };
      var iv = setInterval(function(){ if (!document.hidden) again(); }, 15e3);
      var cleanup = function(){ clearInterval(iv); window.removeEventListener('online', again); document.removeEventListener('visibilitychange', onShow); };
      window.addEventListener('online', again); document.addEventListener('visibilitychange', onShow);
      main.appendChild(h('div', { class: 'off', id: 'pReconnect' }, [h('p', { text: e.message || t('loadFail') }), h('button', { type: 'button', class: 'btn gold', text: t('retry'), on: { click: again } })]));
    });
  },
  setLang: setLang,
  signup: signup,   /* patch SUBSIGNUP: portal.html's sign-in screen → "New subcontractor? Create your account" */
  _state: function(){ return { home: HOME, job: JOB, tab: TAB, jtab: JTAB, lang: LANG }; },
  L: L
};
})();
