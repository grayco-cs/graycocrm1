/* ============================================================================
   GrayCo — INVOICES E-MAILED TO WESLEY, NICK OR office@ (patch INVMAIL).   netlify/functions/_lib/invmail.js

   Owner (11/13): "all emails for invoices — make sure to read Nick, Wesley and office, and don't miss: if someone were to send
   me and Nick an invoice and not invoices@ or office@ then it shouldn't miss the invoice."

   Before this, an invoice reached the CRM's invoice intake only when it was addressed to invoices@ (the group → invoices@in, Resend
   → bid-inbox.js → money-mail.js). Mail to wjohnson@ / nthomas@ only:
     · the X9 e-mail-history routing copy (mail@in, X-GrayCo-Journal) was filed as JOB HISTORY or thrown away — never an invoice;
     · the 🌐 All GrayCo e-mail service-account sync (money-box.js) looked at it only when the subject said "invoice …" AND a file
       was attached, and only once GOOGLE_SA_EMAIL / GOOGLE_SA_KEY are set (they are not yet).

   Now every copy of the WATCHED mailboxes (INVMAIL_BOXES, default wjohnson@, nthomas@, office@grayco-cs.com) that reaches the CRM —
     (a) a Google routing-rule copy to invoicecopy@in.grayco-cs.com (INVMAIL_COPY_TO; docs/INVMAIL-SETUP.md),
     (b) the X9 history copy (mail@in) when one of the watched mailboxes is on it,
     (c) the 🌐 All GrayCo e-mail sync of those mailboxes (money-box.js, the full message + attachments, candidates only) —
   goes through ONE detector (detect below) and then into the SAME intake as invoices@ (money-mail.fromEmail: the sub invoice /
   supplier bill with its file, the job match, ✅ Approvals). One record per invoice however many of invoices@ / Wesley / Nick /
   office@ it came to (Message-ID, the file's SHA-256, or vendor + invoice # + amount); the record notes them (rec.cameTo, rec.vias).
     invoice  → money-mail (sub_invoice);   receipt → money-mail (receipt: 📧 Receipts e-mailed in, the receipts@ flow);
     maybe    → "📥 Possible invoices from e-mail" (gc_invmail_maybe) — ✓ It's an invoice / ✕ Not an invoice (the answer is
                remembered for that sender, gc_invmail_senders);
     anything else (GrayCo's own mail, newsletters, bids / leads, personal mail) → nothing is kept.
   "📭 not connected yet": gc_invmail_seen notes when mail of each watched mailbox was last seen, by which road.
   Nothing here sends anything (⏸ data-entry mode is never involved: it only reads).
   ========================================================================== */
'use strict';
const KV_MAYBE = 'gc_invmail_maybe', KV_SENDERS = 'gc_invmail_senders', KV_SEEN = 'gc_invmail_seen', MAYBE_KEEP = 300;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function env(k){ return s(process.env[k]); }
function nowIso(){ return new Date().toISOString(); }
function SI(){ return require('./subinv.js'); }
function MM(){ return require('./money-mail.js'); }
function L(){ return require('../bid-inbox.js')._lib; }

/* ── which mailboxes, which copy address ── */
function boxes(){ return (env('INVMAIL_BOXES') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com,office@grayco-cs.com').split(',').map(low).filter(Boolean); }
function copyAddrs(){ return (env('INVMAIL_COPY_TO') || 'invoicecopy@in.grayco-cs.com').split(',').map(low).filter(Boolean); }
const LABEL = { wjohnson: 'Wesley', nthomas: 'Nick', office: 'office@' };
function label(box){ const u = low(box).split('@')[0]; return LABEL[u] || low(box); }
function emailOf(x){ x = low(x && typeof x === 'object' ? (x.email || x.address) : x); const m = /<([^>]+)>/.exec(x); return m ? m[1] : x; }
/* the routing-rule copy: Resend's envelope recipient (the webhook's to / cc) is the copy address */
function isCopy(data, recipients){
  const want = copyAddrs(), d = data || {};
  const env0 = [].concat(d.to || [], d.cc || []).map(emailOf);
  return env0.some(function(e){ return want.indexOf(e) >= 0; }) || arr(recipients).map(low).some(function(e){ return want.indexOf(e) >= 0; });
}
/* the watched mailboxes this message was for (To, Cc, the delivery headers Google leaves on a routing copy) */
function watchedIn(mail, recipients){
  const H = (mail && mail.headers) || {}, want = boxes(), out = [];
  const all = arr(recipients).concat(arr(mail && mail.to).map(emailOf), arr(mail && mail.cc).map(emailOf),
    [H['x-gm-original-to'], H['x-original-to'], H['delivered-to'], H['x-forwarded-to'], H['envelope-to'], H.to, H.cc].join(',').split(',').map(emailOf));
  all.forEach(function(e){ e = low(e); if (want.indexOf(e) >= 0 && out.indexOf(e) < 0) out.push(e); });
  return out;
}

/* ── the detector ─────────────────────────────────────────────────────────── */
const STRONG = /\b(invoices?|inv\s*#|inv\.?\s*no\.?|statements?(\s+of\s+account)?|payment\s+due|past\s+due|amount\s+due|balance\s+due|pay\s*app(lication)?|remit(tance)?|payment\s+request|draw\s+request|final\s+notice)\b/i;
const WEAK = /\b(bills?|billing|net\s*\d{1,2}|due\s+date|overdue)\b/i;
const RECEIPT = /\b(receipts?|payment\s+(confirmation|received)|thank\s+you\s+for\s+your\s+payment|order\s+receipt|paid\s+in\s+full)\b/i;
const FILE_INV = /(invoice|\binv[\s_#.-]*\d|\bbill\b|statement|remit|pay[\s_-]*app)/i;
const FILE_RCPT = /receipt/i;
const PAPER_TEXT = /\b(invoice\s*(#|no\.?|number|date)|amount\s+due|balance\s+due|total\s+due|remit\s+(to|payment)|please\s+remit|bill\s+to|payment\s+terms|net\s*(10|15|30|45|60)\b|statement\s+date)/i;
const PAPER_WEAK = /\b(invoice|statement)\b/i;
const MONEY = /\$\s?\d[\d,]*\.\d{2}\b|\b\d{1,3}(,\d{3})*\.\d{2}\s*(usd)?\b/i;
const BID = /\b(invitation\s+to\s+bid|bid\s+(invite|invitation|request|due|date|results?)|request\s+for\s+(proposal|quote|bid)s?|rfp|rfq|itb|ifb|pre-?bid|addend(um|a)|plans?\s+and\s+specs|project\s+(lead|invite))\b/i;
const BOARDS = /(buildingconnected|planhub|isqft|constructconnect|dodge|bidclerk|smartbid|procore\.com.*bid|plangrid)/i;
const ESP = /(mailchimp|mcsv\.net|mcdlv\.net|rsgsv\.net|constantcontact|ctctcdn|hubspot|hs-?email|sendgrid\.net|klaviyo|mailgun|list-manage|exacttarget|marketo|mailjet|sendinblue|brevo|campaign)/i;
const BULK_FROM = /^(news|newsletter|marketing|promo(tions)?|deals|offers|specials|updates|announcements?|events?|webinars?)@/i;
function staff(e){ return /@([a-z0-9-]+\.)*grayco-cs\.com$/i.test(s(e)); }
function paperOf(f){
  const k = SI().kindOf(f.name, f.type);
  if (!k) return '';
  if (k === 'image' && (f.size || 0) < 20 * 1024 && /^(image|logo|outlook|signature|icon)/i.test(s(f.name))) return '';   /* a signature logo, not a paper */
  return k;
}
function fileText(f, k){ try { return f.buf ? s(SI().textOf(f.buf, k)).slice(0, 20000) : ''; } catch (e) { return ''; } }

/* mail → { verdict: invoice | receipt | maybe | ignore, score, reasons[], why, sender, known } ; ctx = { data, senders, threads } */
function detect(mail, ctx){
  ctx = ctx || {};
  const H = mail.headers || {}, from = low(mail.from && mail.from.email), fromName = s(mail.from && mail.from.name);
  const out = function(verdict, why, extra){ return Object.assign({ verdict: verdict, why: why, score: 0, reasons: [] }, extra || {}); };
  /* 1. never: GrayCo's own mail (a person or the CRM), automatic replies, bounces */
  if (H['x-grayco-crm'] || H['x-grayco-item']) return out('ignore', 'sent by the CRM');
  const fw = SI().forwarded(mail);
  if (staff(from) && !(fw && fw.email)) return out('ignore', 'GrayCo\'s own e-mail (from ' + from + ')');
  const a = low(H['auto-submitted']); if (a && a !== 'no' && !/auto-generated/.test(a)) return out('ignore', 'automatic reply');
  if (/^(out of office|automatic reply|auto(matic)?[- ]?reply|undeliverable|delivery status notification|mail delivery)/i.test(s(mail.subject))) return out('ignore', 'automatic reply');
  if (/^(mailer-daemon|postmaster)@/.test(from)) return out('ignore', 'bounce');
  const who = fw && fw.email ? { email: fw.email, name: fw.name } : { email: from, name: fromName };
  const subject = fw ? s(fw.subject) : s(mail.subject);
  const body = s(mail.text).slice(0, 12000);
  /* 2. the papers: invoice-able files, Google links, an invoice typed in the e-mail */
  const papers = []; arr(mail.files).forEach(function(f){ const k = paperOf(f); if (k) papers.push({ f: f, k: k }); });
  const links = SI().googleLinks(body + ' ' + s(mail.html).slice(0, 40000));
  let ptext = ''; papers.slice(0, 3).forEach(function(p){ if (/^(pdf|docx|doc|xlsx|xls|csv|txt)$/.test(p.k)) ptext += '\n' + fileText(p.f, p.k); });
  const names = papers.map(function(p){ return s(p.f.name); }).join(' | ');
  const bodyInvoice = /\b(invoice|amount\s+due|balance\s+due)\b/i.test(body) && MONEY.test(body);
  const hasPaper = papers.length > 0 || links.length > 0 || bodyInvoice;
  /* 3. who sent it: a sub / supplier / vendor on the CRM's lists (sub_match's e-mail and domain rules) */
  const data = ctx.data || {};
  const payees = arr(data.subs).concat(arr(data.vendors), SI().supplierRows(data.ccw_suppliers));
  const m = who.email ? SI().matchSub(payees, { email: who.email, name: who.name, vendor: '', hay: '' }) : null;
  const known = m && m.conf >= 92 ? m : null;
  const said = obj(ctx.senders)[low(who.email)] || null;
  /* 4. the score */
  let score = 0; const reasons = [];
  const sm = STRONG.exec(subject);
  if (sm) { score += 3; reasons.push('the subject says "' + sm[0] + '"'); } else if (WEAK.test(subject)) { score += 1; reasons.push('the subject mentions a bill'); }
  const fn = papers.find(function(p){ return FILE_INV.test(s(p.f.name)); });
  if (fn) { score += 3; reasons.push('the file "' + s(fn.f.name).slice(0, 60) + '"'); }
  if (PAPER_TEXT.test(ptext)) { score += 3; reasons.push('the attachment reads like an invoice (' + PAPER_TEXT.exec(ptext)[0].trim() + ')'); }
  else if (PAPER_WEAK.test(ptext)) { score += 2; reasons.push('the attachment says "invoice" / "statement"'); }
  else if (!papers.length && bodyInvoice) { score += 2; reasons.push('an invoice typed in the e-mail'); }
  if (!sm && /\b(invoice|statement|amount\s+due|balance\s+due|remit)\b/i.test(body)) { score += 1; reasons.push('the e-mail mentions an invoice'); }
  if (MONEY.test(ptext) || MONEY.test(body)) { score += 1; reasons.push('an amount'); }
  if (links.length && !papers.length) { score += 1; reasons.push('a Google Docs / Drive link'); }
  if (known) { score += 2; reasons.push('from ' + known.name + ' (on the CRM\'s sub / vendor list)'); }
  const refs = (s(H['in-reply-to']) + ' ' + s(H.references)).match(/<[^>]+>/g) || [];
  const onThread = refs.some(function(r){ return !!obj(ctx.threads)[r]; });
  if (onThread) { score += 3; reasons.push('a reply on an invoice thread'); }
  if (said && said.a === 'invoice') { score += 4; reasons.push('you said ' + who.email + ' sends invoices'); }
  const strongPaper = !!fn || PAPER_TEXT.test(ptext);
  /* 5. not for this intake: bids / leads (the bid inbox), newsletters / marketing, receipts (the receipts flow) */
  if (!sm && !strongPaper && (BID.test(subject) || BOARDS.test(who.email) || BOARDS.test(s(H['list-id'])))) return out('ignore', 'a bid / lead e-mail (the bid inbox handles those)', { score: score, reasons: reasons });
  const bulk = !!(H['list-unsubscribe'] || /^(bulk|list|junk)$/i.test(s(H.precedence)) || ESP.test(who.email + ' ' + s(H['list-id']) + ' ' + s(H['x-mailer']) + ' ' + s(H['return-path'])) || BULK_FROM.test(who.email));
  if (bulk && !(strongPaper || (sm && papers.length) || (said && said.a === 'invoice'))) return out('ignore', 'a newsletter / marketing e-mail', { score: score, reasons: reasons, bulk: true });
  const rc = RECEIPT.test(subject) || papers.some(function(p){ return FILE_RCPT.test(s(p.f.name)); });
  if (rc && !/\binvoice\b/i.test(subject) && !fn) {
    const paper = papers.some(function(p){ return p.k === 'pdf' || p.k === 'image'; });
    if (paper && (known || (said && said.a === 'invoice') || !bulk)) return out('receipt', 'a receipt' + (known ? ' from ' + known.name : '') + ' (→ 📧 Receipts e-mailed in)', { score: score, reasons: reasons.concat(['a receipt']), known: known });
    return out('ignore', 'a receipt with no PDF or photo (not a business receipt the CRM can read)', { score: score, reasons: reasons });
  }
  /* 6. the answer someone gave before for this sender */
  if (said && said.a === 'not' && !(sm && strongPaper)) return out('ignore', 'you said ' + who.email + ' does not send invoices', { score: score, reasons: reasons });
  /* 7. the verdict */
  const base = { score: score, reasons: reasons, known: known, sender: who.email, papers: papers.length, links: links.length };
  if (score >= 5 && hasPaper) return out('invoice', 'an invoice (' + reasons.slice(0, 3).join(' · ') + ')', base);
  if (score >= 3 && (hasPaper || (onThread && MONEY.test(body)))) return out('maybe', 'maybe an invoice (' + reasons.slice(0, 3).join(' · ') + ')', base);
  return out('ignore', 'not an invoice' + (reasons.length ? ' (only: ' + reasons.slice(0, 2).join(' · ') + ')' : ''), base);
}
/* the cheap look at a mailbox row (metadata only: from, subject, snippet, has a file) — worth fetching the whole message? */
function rowCandidate(r, ctx){
  if (!r || r.dir !== 'in' || !r.id) return false;
  if (arr(r.labels).some(function(l){ return l === 'SPAM' || l === 'TRASH' || l === 'DRAFT'; })) return false;
  const fwd = /^\s*(fwd?|fw)\s*:/i.test(s(r.subject));
  if (staff(r.from) && !fwd) return false;
  const subj = s(r.subject), snip = s(r.snippet);
  if (STRONG.test(subj) || RECEIPT.test(subj)) return true;
  if (WEAK.test(subj) && (r.att || MONEY.test(snip))) return true;
  if (r.att && (STRONG.test(snip) || /amount\s+due|balance\s+due|remit/i.test(snip))) return true;
  if (/docs\.google\.com|drive\.google\.com/.test(snip) && STRONG.test(snip)) return true;
  const said = obj(ctx && ctx.senders)[low(r.from)];
  if (said && said.a === 'invoice') return true;
  if (said && said.a === 'not') return false;
  if (r.att && ctx && ctx.knownEmail && ctx.knownEmail(low(r.from))) return true;   /* a file from a sub / supplier on the CRM's lists */
  return false;
}
/* the CRM's sub / supplier / vendor e-mails and domains (for the metadata look) */
function knownIndex(data){
  const em = {}, dom = {};
  const FREE = /@(gmail|yahoo|hotmail|outlook|live|aol|icloud|me|msn|comcast|att|bellsouth|sbcglobal|protonmail)\./i;
  arr(data && data.subs).concat(arr(data && data.vendors), SI().supplierRows(data && data.ccw_suppliers)).forEach(function(x){
    if (!x || x.deleted) return;
    [x.email, x.contactEmail, x.billingEmail, x.apEmail, x.email2, x.altEmail].map(low).filter(function(e){ return /@/.test(e); }).forEach(function(e){ em[e] = 1; if (!FREE.test(e) && !staff(e)) dom[e.split('@')[1]] = 1; });
  });
  return function(e){ e = low(e); return !!(em[e] || (!/@(gmail|yahoo|hotmail|outlook|live|aol|icloud)\./.test(e) && dom[e.split('@')[1]])); };
}

/* ── the private store (the inbox's own table, through bid-inbox) ── */
const NOSTORE = { get: async function(){ return null; }, cas: async function(){ throw new Error('database not configured'); } };
function store(deps){ if (deps && deps.kv) return deps.kv; if (!L().dbReady()) return NOSTORE; return { get: function(k){ return L().kvGet(k); }, cas: function(k, f){ return L().kvCas(k, f); } }; }
async function senders(deps){ try { return obj(await store(deps).get(KV_SENDERS)); } catch (e) { return {}; } }
/* "📭 not connected yet" until mail of each watched mailbox has been seen (written at most once an hour per mailbox and road) */
async function markSeen(list, road, deps){
  list = arr(list).map(low).filter(function(b){ return boxes().indexOf(b) >= 0; }); if (!list.length) return;
  const t = nowIso();
  try {
    await store(deps).cas(KV_SEEN, function(v){
      v = obj(v); let ch = false;
      list.forEach(function(b){ const x = v[b] = obj(v[b]); const last = x[road]; if (!last || Date.now() - Date.parse(last) > 3600e3) { x[road] = t; x.at = t; ch = true; } });
      return ch ? v : undefined;
    });
  } catch (e) {}
}
async function seen(deps){ try { return obj(await store(deps).get(KV_SEEN)); } catch (e) { return {}; } }

/* ── the intake: one copy of a watched mailbox's message ──
   o = { boxes: [watched addresses], road: 'copy' | 'history' | 'gmail', via, storeFile, moneyDeps(extra), kv?, gmail?: { box, id } } */
async function take(mail, o){
  o = o || {};
  const bx = arr(o.boxes).length ? arr(o.boxes) : boxes().slice(0, 0);
  await markSeen(bx, o.road || 'copy', o);
  const deps0 = o.moneyDeps({});
  let data = {}; try { data = (await deps0.crmData()) || {}; } catch (e) { data = {}; }
  const sd = await senders(o);
  let threads = {};
  const H = mail.headers || {};
  if (H['in-reply-to'] || H.references) {
    try { const cur = await deps0.kvListRead(MM().KEY); arr(cur && cur.list).forEach(function(x){ if (x && x.kind !== 'receipt') arr(x.mids).forEach(function(m){ threads[m] = 1; }); }); } catch (e) {}
  }
  let d = detect(mail, { data: data, senders: sd, threads: threads });
  /* also addressed to invoices@ / receipts@: exactly that inbox's way (whatever the detector thinks) */
  if ((o.kind === 'sub_invoice' || o.kind === 'receipt') && !(d.verdict === 'ignore' && /own e-mail|by the CRM|automatic|bounce/.test(d.why))) d = Object.assign({}, d, { verdict: o.kind === 'receipt' ? 'receipt' : 'invoice', why: 'also sent to ' + (o.kind === 'receipt' ? 'receipts@' : 'invoices@') });
  const via = s(o.via) || ((bx[0] || 'mailbox') + ' mailbox');
  if (d.verdict === 'invoice' || d.verdict === 'receipt') {
    const kind = d.verdict === 'receipt' ? 'receipt' : 'sub_invoice';
    const r = await MM().fromEmail(mail, kind, o.moneyDeps({ via: via, cameTo: bx }));
    /* the detector was sure but the intake found no invoice in it: never lost — it waits in 📥 Possible invoices */
    if (r && r.ignored && kind === 'sub_invoice') return Object.assign({ ok: true, invmail: 'maybe', why: d.why + ' — but ' + r.ignored, boxes: bx }, await addMaybe(mail, d, Object.assign({}, o, { via: via, boxes: bx }), deps0));
    return Object.assign({ invmail: d.verdict, why: d.why, boxes: bx }, r);
  }
  if (d.verdict === 'maybe') return Object.assign({ ok: true, invmail: 'maybe', why: d.why, boxes: bx }, await addMaybe(mail, d, Object.assign({}, o, { via: via, boxes: bx }), deps0));
  return { ok: true, invmail: 'ignore', ignored: d.why, boxes: bx };
}

/* ── 📥 Possible invoices from e-mail ── */
async function addMaybe(mail, d, o, deps0){
  const id = MM().mailId(mail);
  /* already filed (it reached invoices@ too, or someone answered for another copy) → only note the mailbox */
  try { const cur = await deps0.kvListRead(MM().KEY); if (arr(cur && cur.list).some(function(x){ return x && s(x.id) === id; })) { await MM().noteCame(deps0, id, MM().cameToOf(mail, { via: o.via, cameTo: o.boxes }), s(o.via), MM().midKey(mail.messageId)); return { already: true, id: id }; } } catch (e) {}
  const have = arr(await store(o).get(KV_MAYBE)).find(function(x){ return x && x.id === id; });
  const files = [];
  if (!have) {
    for (const f of arr(mail.files).slice(0, 8)) {
      const k = paperOf(f); if (!k || !f.buf) continue;
      const type = SI().typeFor(f.name, f.type);
      let st = null; try { st = await o.storeFile(f.buf, type, f.name); } catch (e) { st = null; }
      if (st && st.stored && st.ref) files.push({ name: s(f.name).slice(0, 160), type: type, size: f.size || f.buf.length, ref: st.ref, sha: st.hash || SI().fileHash(f.buf) });
      if (files.length >= 5) break;
    }
  }
  const t = nowIso();
  const fw = SI().forwarded(mail);
  const rec = { id: id, at: t, mid: MM().midKey(mail.messageId), from: low(fw && fw.email ? fw.email : mail.from && mail.from.email).slice(0, 120), fromName: s(fw && fw.email ? fw.name : mail.from && mail.from.name).slice(0, 120),
    subject: s(fw ? fw.subject : mail.subject).slice(0, 200), sent: s(mail.date).slice(0, 40), text: s(mail.text).slice(0, 6000), files: files, score: d.score, reasons: arr(d.reasons).slice(0, 6), why: d.why,
    cameTo: arr(o.boxes).slice(0, 6), vias: [s(o.via)], gmail: o.gmail ? [o.gmail] : [], status: 'open' };
  if (fw && fw.by) rec.forwardedBy = fw.by;
  await store(o).cas(KV_MAYBE, function(v){
    const l = arr(v), x = l.find(function(y){ return y && y.id === id; });
    if (x) { let ch = false; rec.cameTo.forEach(function(e){ x.cameTo = arr(x.cameTo); if (x.cameTo.indexOf(e) < 0) { x.cameTo.push(e); ch = true; } }); x.vias = arr(x.vias); if (rec.vias[0] && x.vias.indexOf(rec.vias[0]) < 0) { x.vias.push(rec.vias[0]); ch = true; } return ch ? l : undefined; }
    return l.concat([rec]).slice(-MAYBE_KEEP);
  });
  return { maybe: true, id: id, files: files.length };
}
async function maybeList(o){ return arr(await store(o).get(KV_MAYBE)); }
/* a stored file's bytes again (crm-files, service key) */
async function loadRef(ref, o){
  if (o && o.loadRef) return o.loadRef(ref);
  const m = /^sb:crm-files\/(.+)$/.exec(s(ref)); if (!m) return null;
  try { const r = await fetch(L().sbUrl() + '/storage/v1/object/crm-files/' + m[1], { headers: L().svcH() }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch (e) { return null; }
}
/* ✓ It's an invoice / ✕ Not an invoice — the answer is remembered for that sender */
async function decide(id, yes, who, o){
  o = o || {};
  const rec = (await maybeList(o)).find(function(x){ return x && x.id === s(id); });
  if (!rec) return { ok: false, code: 404, error: 'That e-mail is not on the list any more.' };
  if (rec.status !== 'open') return { ok: true, already: true, status: rec.status, mmId: rec.mmId || '' };
  let res = null;
  if (yes) {
    const files = [];
    for (const f of arr(rec.files)) { const buf = await loadRef(f.ref, o); if (buf && buf.length) files.push({ name: f.name, type: f.type, size: buf.length, buf: buf }); }
    if (arr(rec.files).length && !files.length) return { ok: false, code: 502, error: 'The attached file could not be read from storage — try again.' };
    const mail = { id: rec.id, messageId: rec.mid, from: { email: rec.from, name: rec.fromName }, to: [], cc: [], subject: rec.subject, text: rec.text, html: '', date: rec.sent || rec.at, files: files, skipped: [], headers: {} };
    res = await MM().fromEmail(mail, 'sub_invoice', o.moneyDeps({ via: arr(rec.vias)[0] || 'mailbox', cameTo: arr(rec.cameTo) }));
    if (res && res.ignored) return { ok: false, code: 422, error: 'The CRM could not keep it: ' + res.ignored };
  }
  const t = nowIso(), by = s(who && (who.name || who.email)).slice(0, 120);
  await store(o).cas(KV_MAYBE, function(v){ const l = arr(v), x = l.find(function(y){ return y && y.id === rec.id; }); if (!x) return undefined; x.status = yes ? 'yes' : 'no'; x.by = by; x.decidedAt = t; if (res && res.id) x.mmId = s(res.id); return l; });
  if (rec.from) await store(o).cas(KV_SENDERS, function(v){ v = obj(v); v[low(rec.from)] = { a: yes ? 'invoice' : 'not', by: by, at: t, name: s(rec.fromName).slice(0, 80) }; return v; });
  return { ok: true, status: yes ? 'yes' : 'no', mmId: res && res.id ? s(res.id) : '', route: res && res.route, sender: rec.from };
}

module.exports = { boxes, copyAddrs, label, isCopy, watchedIn, detect, rowCandidate, knownIndex, take, addMaybe, maybeList, decide, markSeen, seen, senders, loadRef,
  KV_MAYBE, KV_SENDERS, KV_SEEN };
