/* ============================================================================
   GrayCo — RECEIPTS AND SUB INVOICES BY E-MAIL (patch OWNERTODO, part B).   netlify/functions/_lib/money-mail.js

   Owner (10/24): "invoices, receipts into crm — i have to finish that setup?"
   receipts@grayco-cs.com and invoices@grayco-cs.com are Google Groups (or aliases) whose member / routing copy is
   receipts@in.grayco-cs.com and invoices@in.grayco-cs.com — the same Resend receiving domain and webhook as bids@,
   leads@ and orders@, handled by bid-inbox.js, which hands such mail here.
   One e-mail → one record in gc_kv "gc_mail_money" { id, kind receipt | sub_invoice, at, from, fromName, subject,
   text, files[{ name, type, size, ref }], skipped[] }. Nothing is sent and nothing is booked here:
     · receipt     → the office To-Do "📧 Receipts e-mailed in": the CRM reads it with the 💳 receipt reader, the office
                     picks the job and taps ✅ Confirm → a pending expense (the usual approval);
     · sub_invoice → the CRM adds it to ▥ Invoices as a received sub invoice (like 📎 Upload Invoice), to approve.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const KEY = 'gc_mail_money', KEEP = 800;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function env(k){ return s(process.env[k]); }
function addrs(k, def){ return (env(k) || def).split(',').map(low).filter(Boolean); }
function receiptAddrs(){ return addrs('RECEIPT_INBOX_TO', 'receipts@in.grayco-cs.com,receipts@grayco-cs.com'); }
function invoiceAddrs(){ return addrs('INVOICE_INBOX_TO', 'invoices@in.grayco-cs.com,invoices@grayco-cs.com'); }
function hit(recipients, list, headers){
  if ((recipients || []).some(function(x){ return list.indexOf(low(x)) >= 0; })) return true;
  const lid = low((headers || {})['list-id']);   /* a Google Group keeps its own address in List-Id */
  return !!lid && list.some(function(w){ const p = w.split('@'); return p.length === 2 && lid.indexOf(p[0] + '.' + p[1]) >= 0; });
}
/* which money inbox an e-mail is for ('' = neither) */
function kindOf(recipients, headers){
  if (hit(recipients, receiptAddrs(), headers)) return 'receipt';
  if (hit(recipients, invoiceAddrs(), headers)) return 'sub_invoice';
  return '';
}
function mailId(mail){ return 'MM-' + crypto.createHash('sha256').update(s(mail.messageId) || s(mail.id) || (s(mail.subject) + '|' + s(mail.date) + '|' + s(mail.from && mail.from.email))).digest('hex').slice(0, 16); }

/* bid-inbox.js hands over the e-mail; deps = { storeFile(buf, type, name), kvListUpdate(key, fn) } */
async function fromEmail(mail, kind, deps){
  const id = mailId(mail);
  const files = [];
  for (const f of (mail.files || [])) {
    if (!/^(application\/pdf|image\/)/i.test(s(f.type))) continue;   /* a receipt or an invoice is a PDF or a photo */
    const st = await deps.storeFile(f.buf, f.type, f.name);
    if (!st.stored) throw new Error('could not keep ' + f.name + ' (' + (st.why || 'storage') + ')');
    files.push({ name: s(f.name).slice(0, 160), type: f.type, size: f.size, ref: st.ref });
  }
  if (!files.length) return { ok: true, ignored: 'no PDF or photo attached', kind: kind };
  const rec = { id: id, kind: kind, at: new Date().toISOString(), from: low(mail.from && mail.from.email).slice(0, 120), fromName: s(mail.from && mail.from.name).slice(0, 120),
    subject: s(mail.subject).slice(0, 200), text: s(mail.text).slice(0, 1500), files: files, skipped: (mail.skipped || []).slice(0, 8) };
  const has = function(l){ return l.some(function(x){ return x && s(x.id) === id; }); };
  const w = await deps.kvListUpdate(KEY, function(l){ return has(l) ? null : { list: l.concat([rec]).slice(-KEEP), check: has }; });
  if (!w.ok) throw new Error('could not save it (' + (w.error || 'busy') + ')');
  return { ok: true, kind: kind, id: id, files: files.length, already: !!w.unchanged };
}
module.exports = { fromEmail, kindOf, mailId, receiptAddrs, invoiceAddrs, KEY };
