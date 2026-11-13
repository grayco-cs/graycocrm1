/* ── patch SUBINVMAKE (owner 11/13: "on subs portal make where they can manually enter an invoice if they don't have an
   invoice app — make it very simple for them, just enter the line items, make them write a description and it'll make a
   total for them from the line items, then it will make an invoice in our own system for them") ──────────────────────
   ✍️ Make an invoice, next to 🧾 Send an invoice in the sub portal. It is the SAME pipeline as an uploaded invoice
   (portal-access p-invoice): the same job check (only a job the sub is on), the same photo rule (_lib/subwork.js
   invoiceGate, gc_sub_portal_settings.invPhotoMin), the same gc_sub_event 'invoice' (invId SPI_<event id>, pay date by the
   sub pay rule) that the CRM files into Sub Invoices → ✅ Approvals (the job's PM) → Wesley / Nick → the job's P&L.
   What is new: the lines are checked and added up HERE (the client's total is only compared, never trusted), the invoice
   gets a number when the sub has none (SUB-<code>-<seq>), and a clean PDF is made here and stored like an upload (the
   CRM's crm-files bucket) — it is the invoice's file in the CRM, and the sub can download it from the portal.
   Agreement check (a warning, not a block): when the total is more than what is left on their accepted scope / change
   orders for the job (or the bid amount on their row), the sub must tick "send it anyway" — the PM sees it on approval.
   Pure helpers + handle(ctx, body, deps); portal-access.js wires it (p-invoice-make, p-invoice-pdf). */
'use strict';
const P = require('./invoice-pdf.js');

const MAX_LINES = 50, MAX_LINE = 1000000, MAX_TOTAL = 2000000, MAX_QTY = 100000, MIN_DESC = 3;
function s(v){ return v == null ? '' : String(v).trim(); }
function clip(v, n){ const t = s(v).replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n) : t; }
function num(v){ if (v == null || v === '') return NaN; if (typeof v === 'number') return isFinite(v) ? v : NaN; const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; }
function r2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function ymd(v){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(v)); if (!m) return ''; const d = new Date(v + 'T12:00:00Z'); return isNaN(d) || d.toISOString().slice(0, 10) !== v ? '' : v; }
function addDays(d, n){ const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/* the server's words, English / Español (the portal sends its language) */
const MSG = {
  en: { noLines: 'Add at least one line.', tooMany: 'At most ' + MAX_LINES + ' lines on one invoice.',
    desc: 'Line {n}: write what the work is (at least ' + MIN_DESC + ' letters).', qty: 'Line {n}: the quantity must be more than 0.',
    price: 'Line {n}: enter the price.', lineMax: 'Line {n}: one line can be at most $1,000,000.', lineZero: 'Line {n}: the line total must be more than $0.',
    totalMax: 'The invoice total can be at most $2,000,000.', mismatch: 'The total does not match the lines. Check the lines and send again.',
    date: 'Enter the invoice date (not more than a day ahead, not over a year back).', invNum: 'Your invoice # can use letters, numbers and - / . only.',
    over: 'This is more than what is left on your agreement for this job ({left} left of {agreement}). Tick "Send it anyway" if it is right — your PM will look at it.' },
  es: { noLines: 'Agregue al menos una línea.', tooMany: 'Como máximo ' + MAX_LINES + ' líneas en una factura.',
    desc: 'Línea {n}: escriba qué trabajo es (al menos ' + MIN_DESC + ' letras).', qty: 'Línea {n}: la cantidad debe ser mayor que 0.',
    price: 'Línea {n}: escriba el precio.', lineMax: 'Línea {n}: una línea puede ser de $1,000,000 como máximo.', lineZero: 'Línea {n}: el total de la línea debe ser mayor que $0.',
    totalMax: 'El total de la factura puede ser de $2,000,000 como máximo.', mismatch: 'El total no coincide con las líneas. Revise las líneas y envíela otra vez.',
    date: 'Escriba la fecha de la factura (no más de un día adelante, no más de un año atrás).', invNum: 'Su número de factura puede tener letras, números y - / . solamente.',
    over: 'Esto es más de lo que queda en su acuerdo para este trabajo (quedan {left} de {agreement}). Marque "Enviarla de todos modos" si está bien — su PM la revisará.' }
};
function msg(lang, k, v){ let t = (MSG[lang === 'es' ? 'es' : 'en'][k]) || MSG.en[k] || k; Object.keys(v || {}).forEach(function(x){ t = t.split('{' + x + '}').join(v[x]); }); return t; }

/* the lines, checked and added up on the server: [{ desc, qty, price }] (or amount for a one-off line) → { lines, total } */
function normLines(lines, lang){
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return { error: msg(lang, 'noLines') };
  if (list.length > MAX_LINES) return { error: msg(lang, 'tooMany') };
  const out = []; let total = 0;
  for (let i = 0; i < list.length; i++) {
    const l = list[i] && typeof list[i] === 'object' ? list[i] : {}, n = String(i + 1);
    const desc = clip(l.desc, 300);
    if (desc.replace(/[^A-Za-zÀ-ɏ]/g, '').length < MIN_DESC) return { error: msg(lang, 'desc', { n: n }), line: i };
    let qty = num(l.qty); if (s(l.qty) === '' || isNaN(qty)) qty = 1;
    if (!(qty > 0) || qty > MAX_QTY) return { error: msg(lang, 'qty', { n: n }), line: i };
    qty = Math.round(qty * 1000) / 1000;
    let price = num(l.price != null && s(l.price) !== '' ? l.price : l.amount);
    if (isNaN(price)) return { error: msg(lang, 'price', { n: n }), line: i };
    price = r2(price);
    const amount = r2(qty * price);
    if (!(amount > 0)) return { error: msg(lang, 'lineZero', { n: n }), line: i };
    if (amount > MAX_LINE) return { error: msg(lang, 'lineMax', { n: n }), line: i };
    total = r2(total + amount);
    out.push({ desc: desc, qty: qty, price: price, amount: amount });
  }
  if (total > MAX_TOTAL) return { error: msg(lang, 'totalMax') };
  return { lines: out, total: total };
}

/* SUB-<code>-<seq>: the code from the company name ("Zedd Drywall LLC" → ZD, "Acme" → ACME) */
function subCode(sub){
  const words = s(sub && (sub.company || sub.name)).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/)
    .filter(function(w){ return w && !/^(LLC|INC|CO|CORP|COMPANY|THE|AND|OF|LTD|PLLC|LP)$/.test(w); });
  let c = words.length > 1 ? words.map(function(w){ return w[0]; }).join('').slice(0, 4) : (words[0] || '').slice(0, 4);
  if (c.length < 2) c = (s(sub && sub.id).toUpperCase().replace(/[^A-Z0-9]/g, '') + 'XX').slice(-4);
  return c;
}
function nextNumber(sub, usedNums, madeCount){
  const used = new Set((usedNums || []).map(function(x){ return s(x).toUpperCase(); })), code = subCode(sub);
  let n = (Number(madeCount) || 0) + 1, out = '';
  do { out = 'SUB-' + code + '-' + String(n).padStart(3, '0'); n++; } while (used.has(out) && n < 100000);
  return out;
}

/* Bill to: the job's company (GrayCo Construction Services, or GrayCo Mitigation / Environmental for their jobs) */
function billTo(p, companies){
  const BR = require('./brand.js');
  let name = BR.BRAND.name, id = 'construction';
  try { const c = require('./cobrand.js').info(p, companies); if (c) { name = c.legal.replace(/,? *LLC\.?$/i, ''); id = c.id; } } catch (e) {}
  return { id: id, name: name, address: BR.BRAND.address, phone: BR.BRAND.phone, email: 'invoices@grayco-cs.com' };
}

/* what is left on the sub's agreement for this job: accepted scopes + change orders (else the bid amount on their row),
   less what they already invoiced on the job (not declined / void) */
function agreementState(o){
  const pid = s(o.pid);
  const acc = arr(o.scopes).filter(function(x){ return s(x.project_id) === pid && x.status === 'accepted'; });
  let agreement = r2(acc.reduce(function(t, x){ return t + (num(x.total) || 0); }, 0)), from = acc.length ? 'scopes' : '';
  if (!(agreement > 0)) { const b = num(o.row && o.row.bidAmt); if (b > 0) { agreement = r2(b); from = 'bid'; } }
  if (!(agreement > 0)) { const a = arr(o.job && o.job.subAgreements).filter(function(x){ return s(x.subId) === s(o.subId); })[0]; if (a && num(a.amount) > 0) { agreement = r2(num(a.amount)); from = 'agreement'; } }
  const invoiced = r2(arr(o.invoices).filter(function(x){ return s(x.pid) === pid && x.state !== 'declined' && x.state !== 'void'; }).reduce(function(t, x){ return t + (num(x.amount) || 0); }, 0));
  return { agreement: agreement, invoiced: invoiced, left: agreement > 0 ? r2(agreement - invoiced) : null, from: from };
}

/* ── the PDF: one page per ~25 lines, Letter, Helvetica (WinAnsi), GrayCo navy / gold — no dependencies ── */
function str(t){ return '(' + P.clean(t).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }
function wrap(t, size, maxW, bold){
  const words = P.clean(t).split(' '), out = []; let cur = '';
  words.forEach(function(w){
    const tryL = cur ? cur + ' ' + w : w;
    if (P.width(tryL, size, bold) <= maxW) { cur = tryL; return; }
    if (cur) out.push(cur);
    while (P.width(w, size, bold) > maxW && w.length > 1) { let k = w.length; while (k > 1 && P.width(w.slice(0, k), size, bold) > maxW) k--; out.push(w.slice(0, k)); w = w.slice(k); }
    cur = w;
  });
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
function niceDate(d){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(d)); if (!m) return s(d); return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1]; }
function qtyTxt(q){ return Number.isInteger(q) ? String(q) : String(q); }
/* doc = { number, date, from:{name, contact, address, phone, email}, billTo:{name, address, phone, email}, job:{name, address, po},
   lines:[{desc, qty, price, amount}], total, note, scope, made } → Buffer */
function buildPdf(doc){
  doc = doc || {};
  const PW = 612, PH = 792, L = 48, R = 564;
  const NAVY = '0.059 0.114 0.184', GOLD = '0.831 0.627 0.090', INK = '0.078 0.125 0.180', MUTED = '0.333 0.384 0.435', WHITE = '1 1 1';
  const pages = []; let ops = [];
  function text(x, y, t, size, bold, color){ ops.push('BT ' + (color || INK) + ' rg /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Td ' + str(t) + ' Tj ET'); }
  function textR(x, y, t, size, bold, color){ text(x - P.width(P.clean(t), size, bold), y, t, size, bold, color); }
  function rect(x, y, w, h, color){ ops.push(color + ' rg ' + x + ' ' + y + ' ' + w + ' ' + h + ' re f'); }
  function line(x1, y1, x2, y2, color, wd){ ops.push((color || MUTED) + ' RG ' + (wd || 0.6) + ' w ' + x1 + ' ' + y1 + ' m ' + x2 + ' ' + y2 + ' l S'); }
  const from = doc.from || {}, bill = doc.billTo || {}, job = doc.job || {};
  function foot(){ text(L, 26, 'Made in the GrayCo sub portal for ' + (from.name || 'the subcontractor') + (doc.made ? ' on ' + niceDate(doc.made) : '') + '  \xb7  Invoice ' + (doc.number || '') + '  \xb7  page ' + (pages.length + 1), 7.5, false, MUTED); }
  function newPage(){ foot(); pages.push(ops.join('\n')); ops = []; }

  /* the band: the sub's company and INVOICE */
  rect(0, PH - 96, PW, 96, NAVY);
  rect(0, PH - 100, PW, 4, GOLD);
  text(L, PH - 44, from.name || 'Subcontractor', 18, true, WHITE);
  if (from.contact && from.contact !== from.name) text(L, PH - 62, from.contact, 10, false, '0.80 0.84 0.90');
  textR(R, PH - 46, 'INVOICE', 24, true, GOLD);
  textR(R, PH - 64, '# ' + (doc.number || ''), 11, true, WHITE);
  textR(R, PH - 80, niceDate(doc.date), 10, false, '0.80 0.84 0.90');

  /* from / bill to */
  let y = PH - 130;
  text(L, y, 'FROM', 8, true, MUTED); text(320, y, 'BILL TO', 8, true, MUTED);
  y -= 15;
  const left = [[from.name, true]].concat(wrap(from.address || '', 10, 250).filter(Boolean).map(function(t){ return [t, false]; }));
  if (from.phone) left.push([from.phone, false]); if (from.email) left.push([from.email, false]);
  const right = [[bill.name, true]].concat(wrap(bill.address || '', 10, 240).filter(Boolean).map(function(t){ return [t, false]; }));
  if (bill.phone) right.push([bill.phone, false]); if (bill.email) right.push([bill.email, false]);
  let ly = y, ry = y;
  left.forEach(function(x){ if (x[0]) { text(L, ly, x[0], x[1] ? 11 : 10, x[1]); ly -= 14; } });
  right.forEach(function(x){ if (x[0]) { text(320, ry, x[0], x[1] ? 11 : 10, x[1]); ry -= 14; } });
  y = Math.min(ly, ry) - 10;

  /* the job */
  const jl = [['JOB', job.name]].concat(job.address ? [['ADDRESS', job.address]] : []).concat(job.po ? [['PO', job.po]] : []).concat(doc.scope ? [['FOR', doc.scope]] : []);
  const jh = jl.length * 14 + 12;
  rect(L, y - jh + 10, R - L, jh, '0.965 0.953 0.925');
  rect(L, y - jh + 10, 3, jh, GOLD);
  let jy = y - 4;
  jl.forEach(function(x){ text(L + 12, jy, x[0], 8, true, MUTED); wrap(x[1], 10, R - L - 90, x[0] === 'JOB').slice(0, 1).forEach(function(t){ text(L + 70, jy, t, 10, x[0] === 'JOB' || x[0] === 'PO'); }); jy -= 14; });
  y = y - jh - 8;

  /* lines */
  const cQ = 380, cP = 470;
  function head(){
    rect(L, y - 6, R - L, 22, NAVY);
    text(L + 8, y + 1, 'DESCRIPTION', 9, true, WHITE);
    textR(cQ + 20, y + 1, 'QTY', 9, true, WHITE);
    textR(cP + 10, y + 1, 'PRICE', 9, true, WHITE);
    textR(R - 8, y + 1, 'AMOUNT', 9, true, WHITE);
    y -= 26;
  }
  head();
  arr(doc.lines).forEach(function(ln, i){
    const rows = wrap(ln.desc || '', 10, cQ - L - 50);
    if (y - rows.length * 13 < 120) { newPage(); y = PH - 60; head(); }
    if (i % 2) rect(L, y - 4 - (rows.length - 1) * 13, R - L, rows.length * 13 + 5, '0.982 0.976 0.960');
    rows.forEach(function(t, k){
      text(L + 8, y, t, 10);
      if (k === 0) { textR(cQ + 20, y, qtyTxt(ln.qty), 10); textR(cP + 10, y, P.usd(ln.price), 10); textR(R - 8, y, P.usd(ln.amount), 10, true); }
      y -= 13;
    });
    y -= 5;
  });

  /* total */
  if (y < 150) { newPage(); y = PH - 60; }
  line(330, y + 8, R, y + 8, GOLD, 1.5);
  y -= 12;
  text(340, y, 'TOTAL', 13, true, NAVY); textR(R - 8, y, P.usd(doc.total), 14, true, NAVY);
  y -= 18;
  text(340, y, arr(doc.lines).length + (arr(doc.lines).length === 1 ? ' line' : ' lines'), 9, false, MUTED);
  y -= 24;
  if (s(doc.note)) {
    if (y < 120) { newPage(); y = PH - 60; }
    text(L, y, 'NOTE', 8, true, MUTED); y -= 14;
    wrap(doc.note, 10, R - L).slice(0, 12).forEach(function(t){ text(L, y, t, 10); y -= 13; });
    y -= 6;
  }
  if (y < 90) { newPage(); y = PH - 60; }
  wrap('Send questions about this invoice to ' + (bill.email || 'invoices@grayco-cs.com') + (bill.phone ? ' or ' + bill.phone : '') + '. GrayCo pays approved invoices by its sub pay schedule.', 9, R - L).forEach(function(t){ text(L, y, t, 9, false, MUTED); y -= 12; });
  newPage();

  /* assemble */
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = '<< /Producer (GrayCo sub portal) /Title ' + str('Invoice ' + (doc.number || '') + ' - ' + (from.name || '')) + ' >>';
  const kids = [];
  pages.forEach(function(c, i){
    const pn = 6 + i * 2, cn = pn + 1;
    kids.push(pn + ' 0 R');
    objs[pn] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cn + ' 0 R >>';
    objs[cn] = '<< /Length ' + Buffer.byteLength(c, 'latin1') + ' >>\nstream\n' + c + '\nendstream';
  });
  objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  for (let n = 1; n < objs.length; n++) { offs[n] = Buffer.byteLength(out, 'latin1'); out += n + ' 0 obj\n' + objs[n] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
  for (let n = 1; n < objs.length; n++) out += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

/* the sub's own details for the "From" block (their CRM record) */
function fromOf(sub){
  sub = sub || {};
  const addr = s(sub.address || sub.addr || sub.mailingAddress) || [s(sub.street), s(sub.city), [s(sub.state), s(sub.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { name: clip(sub.company || sub.name, 120) || 'Subcontractor', contact: clip(sub.contact, 80), address: clip(addr, 200), phone: clip(sub.phone || sub.cell, 40), email: clip(sub.email, 120) };
}

/* ── the action: op 'check' (the preview: totals, number, warnings — nothing stored) | 'send' ──
   deps: { Fail, today, photoState(ctx, p), invoices(ctx) (the portal's list), madeCount(sub) → {count, nums}, companies(),
           storeFile(b64, name), postEvent(row), newId(p), payDateFor(d), poOf(p), rowFor(p, sub) } */
async function handle(ctx, body, deps){
  const D = deps, sub = ctx.sub, lang = s(body.lang) === 'es' ? 'es' : 'en';
  const p = ctx.jobs.find(function(j){ return s(j.id) === s(body.projectId); });
  if (!p) throw D.Fail(404, 'That job is not one of yours.');
  const L = normLines(body.lines, lang);
  if (L.error) throw D.Fail(400, L.error, { line: L.line });
  if (body.total != null && s(body.total) !== '' && Math.abs(r2(num(body.total)) - L.total) > 0.009) throw D.Fail(400, msg(lang, 'mismatch'), { total: L.total });
  const today = D.today();
  const date = s(body.invDate) ? ymd(body.invDate) : today;
  if (!date || date > addDays(today, 1) || date < addDays(today, -366)) throw D.Fail(400, msg(lang, 'date'));
  const own = clip(body.invNum, 40);
  if (own && !/^[A-Za-z0-9][A-Za-z0-9 #\-\/.]{0,39}$/.test(own)) throw D.Fail(400, msg(lang, 'invNum'));
  const g = await D.photoState(ctx, p);
  const inv = await D.invoices(ctx);
  const ag = agreementState({ pid: p.id, scopes: ctx.scopes, invoices: inv, row: D.rowFor(p, sub), job: p, subId: sub.id });
  const over = ag.left != null && L.total > ag.left + 0.005;
  let scopeTitle = '';
  if (body.scopeId) { const sc = ctx.scopes.find(function(x){ return s(x.id) === s(body.scopeId) && s(x.project_id) === s(p.id); }); if (sc) scopeTitle = clip(sc.title, 120); }
  const made = await D.madeCount(sub);
  const number = own || nextNumber(sub, made.nums, made.count);
  const bill = billTo(p, await D.companies());
  const out = { ok: true, total: L.total, lines: L.lines, number: number, ownNumber: !!own, date: date, billTo: bill.name, company: bill.id,
    job: { name: s(p.name), address: s(p.address), po: D.poOf(p) }, from: fromOf(sub).name,
    photos: { ok: !!g.ok, need: g.need, have: g.have, message: g.message || '' },
    agreement: ag.agreement > 0 ? { agreement: ag.agreement, invoiced: ag.invoiced, left: ag.left, over: over } : null };
  if (s(body.op) !== 'send') return out;
  if (!g.ok) throw D.Fail(409, g.message, { photos: { need: g.need, have: g.have } });   /* the same rule as an uploaded invoice */
  if (over && body.okOver !== true) throw D.Fail(409, msg(lang, 'over', { left: P.usd(Math.max(0, ag.left)), agreement: P.usd(ag.agreement) }), { over: out.agreement });
  const note = clip(body.note, 500);
  const pdf = buildPdf({ number: number, date: date, from: fromOf(sub), billTo: bill, job: out.job, lines: L.lines, total: L.total, note: note, scope: scopeTitle, made: today });
  const safe = (number + ' ' + fromOf(sub).name).replace(/[^A-Za-z0-9 _.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const f = await D.storeFile(pdf.toString('base64'), 'Invoice ' + safe + '.pdf');
  const eid = D.newId('E');
  const recv = today;
  await D.postEvent({ id: eid, kind: 'invoice', project_id: s(p.id), sub_id: s(sub.id), data: { subName: s(sub.name || sub.company), invId: 'SPI_' + eid,
    amount: L.total, po: clip(D.poOf(p), 40), invNum: number, note: note, scopeId: clip(body.scopeId, 80), scopeTitle: scopeTitle,
    recvDate: recv, payDate: D.payDateFor(recv), files: [f],
    made: true, invDate: date, lines: L.lines, numbered: own ? 'sub' : 'auto', billTo: bill.name, company: bill.id,
    over: over ? { agreement: ag.agreement, invoiced: ag.invoiced, left: ag.left } : null } });
  return Object.assign(out, { id: 'SPI_' + eid, payDate: D.payDateFor(recv), pdf: { name: f.name, size: f.size } });
}

module.exports = { normLines: normLines, subCode: subCode, nextNumber: nextNumber, billTo: billTo, agreementState: agreementState, buildPdf: buildPdf, fromOf: fromOf, handle: handle,
  MAX_LINES: MAX_LINES, MAX_LINE: MAX_LINE, MAX_TOTAL: MAX_TOTAL };
