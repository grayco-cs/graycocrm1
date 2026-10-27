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
     · sub_invoice → read and placed (patch SUBINV, _lib/subinv.js → rec.si): the CRM books a received sub invoice on the
                     job its address matches (+ the pending job cost), to approve — or asks "Match this invoice".
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

/* patch SUBINV: a sub's invoice comes as Word (.docx / .doc), PDF, a photo, Excel / CSV, a Google Doc / Sheet (attached or a
   link) or typed in the e-mail; a receipt is still a PDF or a photo (the CRM's 💳 receipt reader). */
function invoiceFile(f){ const k = SI().kindOf(f.name, f.type); return !!k && (k !== 'txt' || /inv|bill|statement/i.test(s(f.name))); }
function receiptFile(f){ return /^(application\/pdf|image\/)/i.test(s(f.type)) || /^(pdf|image)$/.test(SI().kindOf(f.name, f.type)); }
function SI(){ return require('./subinv.js'); }
/* the same file already came in (an invoices@ copy and the office@ mailbox, a re-forward): its SHA-256 */
/* patch MAILFIX: a copy the office SET ASIDE (gc_mail_money_done skip) never blocks the same file coming in again */
function seenFile(list, kind, hashes, id, done){
  if (!hashes.length) return null;
  done = done || {};
  return list.find(function(x){ return x && s(x.id) !== id && x.kind === kind && !(done[x.id] && done[x.id].skip) && (x.files || []).some(function(f){ return f && f.sha && hashes.indexOf(f.sha) >= 0; }); }) || null;
}

/* bid-inbox.js (and the office@ mailbox reader) hands over the e-mail;
   deps = { storeFile(buf, type, name), kvListUpdate(key, fn), kvListRead?(key), crmData?(), ai?, fetch?, driveExport?, via? } */
async function fromEmail(mail, kind, deps){
  const id = mailId(mail);
  const files = [], keep = [];
  for (const f of (mail.files || [])) {
    if (!(kind === 'receipt' ? receiptFile(f) : invoiceFile(f))) continue;
    const type = SI().typeFor(f.name, f.type);
    const st = await deps.storeFile(f.buf, type, f.name);
    if (!st.stored) throw new Error('could not keep ' + f.name + ' (' + (st.why || 'storage') + ')');
    const sha = st.hash || SI().fileHash(f.buf);
    files.push({ name: s(f.name).slice(0, 160), type: type, size: f.size, ref: st.ref, sha: sha });
    keep.push({ name: f.name, type: type, buf: f.buf, ref: st.ref, hash: sha });
  }
  const body = s(mail.text);
  const bodyInvoice = kind === 'sub_invoice' && !files.length && (SI().googleLinks(body + ' ' + s(mail.html)).length > 0 || (/\b(invoice|amount\s+due|balance\s+due)\b/i.test(body + ' ' + s(mail.subject)) && /\$?\s*\d[\d,]*\.\d{2}/.test(body)));
  if (!files.length && !bodyInvoice) return { ok: true, ignored: kind === 'receipt' ? 'no PDF or photo attached' : 'no invoice attached or typed in the e-mail', kind: kind };
  let cur = null; try { cur = deps.kvListRead ? await deps.kvListRead(KEY) : null; } catch (e) { cur = null; }
  const list = cur && Array.isArray(cur.list) ? cur.list : [];
  if (list.some(function(x){ return x && s(x.id) === id; })) return { ok: true, kind: kind, id: id, already: true };
  let done = {}; try { done = deps.doneRead ? (await deps.doneRead()) || {} : {}; } catch (e) { done = {}; }
  const same = deps.rerun ? null : seenFile(list, kind, files.map(function(f){ return f.sha; }), id, done);   /* a by-hand re-run: analyze's own duplicate check still flags a booked one */
  if (same) return { ok: true, kind: kind, id: id, already: true, sameFileAs: same.id };
  const rec = { id: id, kind: kind, at: new Date().toISOString(), from: low(mail.from && mail.from.email).slice(0, 120), fromName: s(mail.from && mail.from.name).slice(0, 120),
    subject: s(mail.subject).slice(0, 200), text: body.slice(0, 1500), files: files, skipped: (mail.skipped || []).slice(0, 8), via: s(deps.via) || (kind === 'receipt' ? 'receipts@' : 'invoices@') };
  if (kind === 'sub_invoice') {
    let data = {}; try { data = deps.crmData ? (await deps.crmData()) || {} : {}; } catch (e) { data = {}; }
    try { rec.si = await SI().analyze(mail, keep, { data: data, mailList: list.filter(function(x){ return !(x && done[x.id] && done[x.id].skip); }), selfId: id, ai: deps.ai, fetch: deps.fetch, driveExport: deps.driveExport, now: deps.now }); }
    catch (e) { rec.si = { v: 1, route: 'match', why: 'it could not be read (' + s(e && e.message).slice(0, 80) + ')', read: {}, top: [], at: rec.at }; }
    if (rec.si && rec.si.forwardedBy) { rec.forwardedBy = rec.si.forwardedBy; rec.from = rec.si.fromEmail || rec.from; rec.fromName = rec.si.fromName || rec.fromName; }
  }
  const has = function(l){ return l.some(function(x){ return x && s(x.id) === id; }); };
  const w = await deps.kvListUpdate(KEY, function(l){ return has(l) || (!deps.rerun && seenFile(l, kind, files.map(function(f){ return f.sha; }), id, done)) ? null : { list: l.concat([rec]).slice(-KEEP), check: has }; });
  if (!w.ok) throw new Error('could not save it (' + (w.error || 'busy') + ')');
  return { ok: true, kind: kind, id: id, files: files.length, already: !!w.unchanged, route: rec.si ? rec.si.route : undefined, why: rec.si ? rec.si.why : undefined,
    jobId: rec.si && rec.si.job ? s(rec.si.job.pid) : undefined, job: rec.si && rec.si.job ? s(rec.si.job.name || rec.si.job.address).slice(0, 80) : undefined };
}
/* the office@ mailbox (patch SUBINV): which money inbox a mailbox e-mail belongs to ('' = none) */
function kindFromWords(mail){
  const sub = s(mail.subject), names = (mail.files || []).map(function(f){ return s(f.name); }).join(' '), t = sub + ' ' + names;
  if (/\b(receipt|paid|payment\s+confirmation|order\s+receipt)\b/i.test(t) && !/\binvoice\b/i.test(t)) return 'receipt';
  if (/\b(invoice|inv\s*#|bill|statement|pay\s*app(lication)?|amount\s+due|balance\s+due)\b/i.test(t)) return 'sub_invoice';
  if (/\b(invoice|amount\s+due|balance\s+due)\b/i.test(s(mail.text).slice(0, 3000)) && ((mail.files || []).length || /docs\.google\.com|drive\.google\.com/.test(s(mail.text)))) return 'sub_invoice';
  return '';
}
module.exports = { fromEmail, seenFile, kindOf, mailId, receiptAddrs, invoiceAddrs, kindFromWords, KEY };
