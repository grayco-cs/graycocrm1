/* ── GrayCo brand: ONE source for every customer-facing output (patch AUT2, audit #4) ─────────────────────
   The company name, the ONE company address, phone, licenses and logo, and the e-mail shell:
     shell(html, { sender, portalUrl, preheader }) → the e-mail wrapped in the GrayCo header (logo), the body, the
       sender's signature (name, title, cell, e-mail, photo when there is one), the office line and the licenses.
       An e-mail that already has the shell (data-gc-shell) is returned as it is, so nothing is wrapped twice.
     senderFor(emailOrName) → { name, title, phone, email, photo } from the CRM's users list (gc_kv "users").
   Used by send-email.js (every template), portal.js (every approved e-mail), invoice-pdf.js, the portal page.
   The CRM page has the same constant: window.GC_BRAND (tail AUT2). */
'use strict';
const BRAND = {
  name: 'GrayCo Construction Services',
  legalName: 'GrayCo Construction Services, LLC',
  city: 'Bartlett', state: 'TN', zip: '38135',
  phone: '(901) 585-0944', phoneTel: '+19015850944',
  email: 'office@grayco-cs.com',
  web: 'https://grayco-cs.com',
  licenses: 'TN #85034 BCB · AR #0486990627 · MS #27769',
  logoPath: '/portal-logo.png',                 /* white logo: for dark bands */
  logoColorPath: '/grayco-logo-wide.jpg',       /* patch LOGO: the colour logo (420 x 254), for white e-mail headers */
  reviewUrl: 'https://share.google/quDuhdlL0ckxPLLY3',
  navy: '#0F1D2F', gold: '#D4A017', ink: '#14202E', cream: '#F5F1E8'
};
/* patch BILL (owner 10/23: "invoices should come from billing@, that's what should be on invoices too"): every
   customer / GC money e-mail (invoices, pay apps, statements, reminders, receipts) goes From and Reply-To billing@,
   and money documents show billing@ as the contact. One place: Netlify BILLING_EMAIL overrides the default. */
function billingEmail(){ const v = String(process.env.BILLING_EMAIL || '').trim().toLowerCase(); return /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/.test(v) ? v : 'billing@grayco-cs.com'; }
function billingFrom(){ return 'GrayCo Construction Services Billing <' + billingEmail() + '>'; }
/* a money kind: final_invoice, final_reminder, invoice, invoice_statement, pay_app, gcp_payapp_invoice, maint_invoice, receipt, … */
function isMoneyKind(kind){ return /(^|_)(final|invoice|pay_?app|payapp|receipt|payment|deposit|statement|lien|dunning|balance)(_|$)/i.test(String(kind || '')); }
function s(v){ return v == null ? '' : String(v).trim(); }
/* patch ADDR2 — the company address moves on a date (owner 10/21: "we are at 4007 Broadway for 1 more week, then we move
   to 4014"). ONE setting, gc_kv "gc_company_address" { current, next, switchOn (YYYY-MM-DD, Central) }, edited in
   ⚙ Admin → 🏢 Company address. Before switchOn every output shows `current`, on and after it `next`. Until the setting
   is read (or with no database) the defaults below apply. BRAND.address / BRAND.street follow it everywhere. */
const ADDRESS_DEFAULTS = { current: '5796 Ferguson Rd, Bartlett, TN 38134', next: '5796 Ferguson Rd, Bartlett, TN 38134', switchOn: '' };
let addrSetting = null, addrAt = 0, addrBusy = null;
function centralDay(d){
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date()); }
  catch (e) { return new Date((d || new Date()).getTime() - 6 * 3600e3).toISOString().slice(0, 10); }
}
function addressConfig(){
  const c = Object.assign({}, ADDRESS_DEFAULTS);
  const v = addrSetting || {};
  if (s(v.current)) c.current = s(v.current);
  if (s(v.next)) c.next = s(v.next);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s(v.switchOn))) c.switchOn = s(v.switchOn);
  if (v.switchOn === '') c.switchOn = '';
  return c;
}
/* the address on a given moment (default now) */
function companyAddress(when){
  if (!addrBusy && Date.now() - addrAt > 120e3) refreshAddress();
  const c = addressConfig();
  if (!c.next || !c.switchOn) return c.current;
  return centralDay(when ? new Date(when) : new Date()) >= c.switchOn ? c.next : c.current;
}
function companyStreet(when){ return companyAddress(when).split(',')[0].trim(); }
function refreshAddress(){
  const svc = s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!svc || typeof fetch !== 'function') { addrAt = Date.now(); return Promise.resolve(addressConfig()); }
  const base = s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, '');
  const H = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc };
  addrBusy = fetch(base + '/rest/v1/gc_kv?select=value&key=eq.gc_company_address', { headers: H }).then(function(r){ return r.ok ? r.json() : null; }).then(function(rows){
    if (Array.isArray(rows)) { let v = rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } addrSetting = v && typeof v === 'object' ? v : null; }
  }).catch(function(){}).then(function(){ addrAt = Date.now(); addrBusy = null; return addressConfig(); });
  return addrBusy;
}
Object.defineProperty(BRAND, 'address', { enumerable: true, get: function(){ return companyAddress(); } });
Object.defineProperty(BRAND, 'street', { enumerable: true, get: function(){ return companyStreet(); } });
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function siteBase(){
  const b = s(process.env.PORTAL_BASE_URL) || s(process.env.SITE_ORIGIN).split(',')[0] || 'https://crm.grayco-cs.com';
  return b.replace(/\/$/, '');
}
/* patch MAILLOGO: logos always come from the CRM site, which serves the real image files. PORTAL_BASE_URL can be
   portal.grayco-cs.com, which answers every path with the portal page — the e-mail showed a broken picture. */
function logoBase(){ return (s(process.env.LOGO_BASE_URL) || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function logoUrl(){ return logoBase() + BRAND.logoPath; }
function logoColorUrl(){ return logoBase() + BRAND.logoColorPath; }   /* patch LOGO: absolute https://crm.grayco-cs.com/grayco-logo-wide.jpg */
function directLines(){ return String(process.env.DOC_DIRECT_LINES || '').trim() !== '0'; }   /* patch LOGOALL2: on unless DOC_DIRECT_LINES=0 */
function isShelled(html){ return /data-gc-shell=/.test(String(html || '')); }
function telHref(p){ const d = s(p).replace(/\D/g, ''); return d.length === 10 ? 'tel:+1' + d : (d.length === 11 ? 'tel:+' + d : ''); }
function niceTel(p){ const d = s(p).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(p); }

/* the person who sends: name, title, cell, e-mail, photo (only a real https picture: e-mail programs block others) */
function cleanSender(u){
  if (!u) return null;
  const photo = s(u.photo || u.photoUrl || u.avatar);
  return { name: s(u.name), title: s(u.title) || (/admin|owner/i.test(s(u.role)) ? 'Owner' : (/office/i.test(s(u.role)) ? 'Office' : (s(u.role) ? s(u.role) : 'Project Manager'))),
    phone: niceTel(u.phone || u.cell || u.mobile), email: low(u.email), photo: /^https:\/\/[^\s"'<>]+$/i.test(photo) ? photo : '' };
}
function signatureHtml(sender){
  const x = cleanSender(sender);
  if (!x || !x.name) return '';
  const ph = x.photo ? '<td style="padding:0 14px 0 0;vertical-align:top"><img src="' + esc(x.photo) + '" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:28px;object-fit:cover"></td>' : '';
  const lines = ['<b style="font-size:15px;color:' + BRAND.ink + '">' + esc(x.name) + '</b>', '<span style="color:#55626F">' + esc(x.title) + ' · ' + BRAND.name + '</span>'];
  /* patch LOGOALL (owner 10/23): a staff member's own cell never goes on customer mail; the office line does. Netlify
     DOC_DIRECT_LINES=1 turns direct lines on. */
  /* patch LOGOALL2 (owner: "we can have 'this is your project manager's number'"): the sender's own line names them, so
     their phone may show (DOC_DIRECT_LINES=0 hides it); the company line is always the office */
  if (directLines() && x.phone && x.phone.replace(/\D/g, '') !== BRAND.phone.replace(/\D/g, '')) lines.push('<a href="' + esc(telHref(x.phone)) + '" style="color:' + BRAND.navy + ';text-decoration:none">📱 ' + esc(x.phone) + ' (direct)</a>');
  lines.push('<a href="' + esc(telHref(BRAND.phone)) + '" style="color:' + BRAND.navy + ';text-decoration:none">☎ Office ' + esc(BRAND.phone) + '</a>');
  if (x.email) lines.push('<a href="mailto:' + esc(x.email) + '" style="color:' + BRAND.navy + ';text-decoration:none">' + esc(x.email) + '</a>');
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border-top:1px solid #E5E0D3;padding-top:16px;width:100%"><tr>' + ph +
    '<td style="vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55">' + lines.join('<br>') + '</td></tr></table>';
}
/* patch LEGAL3 (counsel review F2: job e-mails carried no legal footer): ONE short confidentiality / accuracy footer, added here so every
   invoice, portal link, signed paper and proposal e-mail that goes through the shell carries it. shell(html, { legal: false }) leaves it off
   (GrayCo News has its own footer and unsubscribe line). The plain-text version is legalText(). DRAFT wording pending attorney review. */
function legalText(){
  return 'This email and any attachments are intended only for the named recipient and may contain confidential or privileged information. If you received it in error, please tell us and delete it. '
    + 'Amounts, dates and scope in this email are summaries and are subject to your signed agreement and our written invoices; an email alone does not change a signed agreement. '
    + BRAND.name + ' \u00b7 licensed GC ' + BRAND.licenses;
}
function legalFooterHtml(){
  return '<tr><td data-gc-legal="1" style="background:' + BRAND.cream + ';padding:12px 24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#6B7785">' + esc(legalText()) + '</td></tr>';
}
function bodyOf(html){
  const t = String(html || '');
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(t);
  return m ? m[1] : t.replace(/<!doctype[^>]*>/i, '').replace(/<\/?html[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/i, '');
}
/* the e-mail shell */
function shell(html, o){
  o = o || {};
  if (isShelled(html)) return String(html);
  const inner = bodyOf(html);
  const hasLogo = /portal-logo\.png|grayco-logo/i.test(inner);
  /* patch LOGOALL (owner 10/23: "should have our logo on it"): the logo header is centered, like every printed paper */
  /* patch LOGO: (owner 10/26: every document carries the logo): the colour logo at the LEFT, 0.7 in tall, GrayCo Construction Services · phone · licenses beside it, on white */
  /* patch LOGO2 (the 10/22 rule "always center the headers"): the colour logo centered, 0.7 in tall, the name / phone / licenses centered under it */
  const head = hasLogo ? '' : '<tr><td align="center" style="background:#ffffff;padding:14px 24px 10px;border-bottom:4px solid ' + BRAND.gold + ';text-align:center">' +
    '<img src="' + esc(o.logoUrl || logoColorUrl()) + '" alt="' + BRAND.name + '" width="111" height="67" style="display:block;margin:0 auto 6px;width:111px;height:67px;border:0">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;text-align:center"><div style="font-size:17px;font-weight:bold;color:' + BRAND.navy + '">' + BRAND.name + '</div>' +
    '<div style="font-size:12px;color:#55626F">' + BRAND.phone + ' · grayco-cs.com</div><div style="font-size:11px;color:#6B7785">' + BRAND.licenses + '</div></div></td></tr>';
  const sig = o.sender === false ? '' : signatureHtml(o.sender);
  const portal = o.portalUrl ? '<p style="margin:20px 0 0"><a href="' + esc(o.portalUrl) + '" style="display:inline-block;background:' + BRAND.navy + ';color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open my GrayCo project page</a></p>' : '';
  const pre = o.preheader ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(o.preheader) + '</div>' : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:' + BRAND.cream + '">' + pre +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-gc-shell="1" style="background:' + BRAND.cream + ';padding:18px 8px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E5E0D3">' + head +
    '<tr><td style="padding:22px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:' + BRAND.ink + '">' + inner + portal + sig + '</td></tr>' +
    '<tr><td style="background:' + BRAND.navy + ';padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#C9D3E0">' +
    '<b style="color:#ffffff">' + BRAND.legalName + '</b><br>' + BRAND.address + ' · <a href="' + telHref(BRAND.phone) + '" style="color:#C9D3E0;text-decoration:none">' + BRAND.phone + '</a> · <a href="mailto:' + BRAND.email + '" style="color:#C9D3E0;text-decoration:none">' + BRAND.email + '</a><br>' +
    '<span style="color:' + BRAND.gold + '">' + BRAND.licenses + '</span></td></tr>' + (o.legal === false ? '' : legalFooterHtml()) + '</table></td></tr></table></body></html>';
}

/* the CRM's users (gc_kv "users"), read with the service key, kept 5 minutes */
let usersCache = null;
async function users(){
  if (usersCache && Date.now() - usersCache.at < 300e3) return usersCache.list;
  const svc = s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const base = s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, '');
  if (!svc) return [];
  try {
    const H = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc };
    const r = await fetch(base + '/rest/v1/gc_kv?select=value&key=eq.users', { headers: H });
    if (!r.ok) return [];
    const rows = await r.json(); let v = rows && rows[0] ? rows[0].value : [];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
    usersCache = { at: Date.now(), list: Array.isArray(v) ? v : [] };
    return usersCache.list;
  } catch (e) { return []; }
}
function senderFromUsers(list, key){
  const k = low(key && (key.email || key.name) || key);
  if (!k) return null;
  const u = (list || []).find(function(x){ return x && (low(x.email) === k || low(x.name) === k); });
  return u ? cleanSender(u) : null;
}
async function senderFor(key, fallback){
  const k = typeof key === 'object' && key ? key : { email: key };
  const list = await users();
  return senderFromUsers(list, k.email) || senderFromUsers(list, k.name) || (fallback ? cleanSender(fallback) : null);
}
/* convenience: shell an e-mail for a sender (an address, a name, or { email, name }) */
async function shellFor(html, o){
  o = o || {};
  if (isShelled(html)) return String(html);
  let sender = o.sender;
  if (sender === undefined) sender = await senderFor({ email: o.email, name: o.name }, (o.email || o.name) ? { name: o.name, email: o.email } : null);
  if (sender && /^(office|billing|portal|news)@grayco-cs\.com$/.test(low(sender.email)) && !s(sender.phone)) sender = Object.assign({}, sender, { phone: BRAND.phone, title: sender.title || 'Office' });
  return shell(html, Object.assign({}, o, { sender: sender || { name: 'The GrayCo Office', title: 'Office', phone: BRAND.phone, email: BRAND.email } }));
}
/* every customer e-mail a function sends straight to Resend gets the shell too (one line in each function file:
   require('./_lib/brand.js').installResend()). Mail only to @grayco-cs.com (internal alerts) and mail that already
   has the shell are left as they are. The signature: the sending mailbox's office signature. */
const RESEND = 'https://api.resend.com/emails';
function installResend(){
  const g = global;
  if (typeof g.fetch !== 'function' || g.fetch.__gcBrand) return;
  const orig = g.fetch;
  const w = async function(url, init){
    try {
      if (String(url) === RESEND && init && typeof init.body === 'string' && /"html"/.test(init.body)) {
        const b = JSON.parse(init.body);
        const to = [].concat(b.to || []).map(low);
        if (b.html && !isShelled(b.html) && to.length && !to.every(function(x){ return /@grayco-cs\.com$/.test(x); })) {
          b.html = shell(b.html, { sender: { name: 'The GrayCo Office', title: 'Office', phone: BRAND.phone, email: BRAND.email } });
          if (typeof b.text === 'string' && b.text && b.text.indexOf(legalText()) < 0) b.text = b.text + '\n\n--\n' + legalText();   /* patch LEGAL3: plain-text part too */
          init = Object.assign({}, init, { body: JSON.stringify(b) });
        }
      }
    } catch (e) {}
    return orig.call(this, url, init);
  };
  w.__gcBrand = true; w.__orig = orig;
  g.fetch = w;
}
module.exports = { BRAND: BRAND, installResend: installResend, legalText: legalText, legalFooterHtml: legalFooterHtml, shell: shell, shellFor: shellFor, isShelled: isShelled, signatureHtml: signatureHtml, senderFor: senderFor, senderFromUsers: senderFromUsers, cleanSender: cleanSender,
  logoUrl: logoUrl, logoColorUrl: logoColorUrl, siteBase: siteBase, niceTel: niceTel, companyAddress: companyAddress, companyStreet: companyStreet, addressConfig: addressConfig, refreshAddress: refreshAddress, ADDRESS_DEFAULTS: ADDRESS_DEFAULTS,
  billingEmail: billingEmail, billingFrom: billingFrom, isMoneyKind: isMoneyKind, directLines: directLines,
  _setAddress: function(v){ addrSetting = v; addrAt = Date.now(); }, _reset: function(){ usersCache = null; addrSetting = null; addrAt = 0; } };
