/* ============================================================================
   GrayCo — "💬 WHAT THE CUSTOMER SAID" in every lead / text / missed-call alert e-mail (patch LEADMAILMSG).
   netlify/functions/_lib/leadmsg.js

   Owner 10/28: "On these texts and leads I would like to see any messages or information customer shares in this
   email too". The alert e-mails (bid-alerts.js new lead / 🚨 emergency / 📞 missed call; missed-call.js text relay and
   existing-customer missed call) show a clear box near the top: the FULL message (not cut, line breaks kept, escaped)
   plus everything else the customer shared — name, phone, e-mail, address / city, service / type, urgency, the spoken
   reason from call screening, the website-form fields (need, company, project location, attachments / photo links),
   lead source / UTM. A follow-up text from the same number shows "Conversation so far": the last 10 messages both ways
   (customer + our replies), Central time, newest last.
   STAFF-ONLY e-mails. Even so, internal notes (EXISTING CUSTOMER, referral fees, PM notes) and insurance carrier / claim
   details are never put in the box.
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(x => x != null) : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cut(v, n){ v = s(v); return v.length > n ? v.slice(0, n) : v; }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function url(v){ v = s(v); return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : ''; }
const FULL = 8000;
/* an insurance carrier / claim never goes in the box */
const INSURER = /\b(carrier|insurer|insurance company|claim\s*(#|no|number))\b/i;

/* the form fields a customer typed (website-intake.js fileLead keeps them as leadExtra.said) — never carrier / claim # */
function shared(f){
  f = obj(f);
  const o = {};
  const put = (k, v, n) => { v = cut(v, n || 300); if (v) o[k] = v; };
  put('message', f.message, FULL);
  put('service', f.service); put('property', f.property); put('bestTime', f.bestTime, 120); put('damageDate', f.damageDate, 60);
  put('company', f.company, 120); put('project', f.project, 200); put('buildings', f.buildings, 120); put('plan', f.plan, 120); put('urgency', f.urgency, 60);
  put('howHeard', f.howHeard, 120); put('page', f.page, 300); put('position', f.position, 120);
  const links = [f.plansLink].concat(arr(f.photos), arr(f.attachments), arr(f.files)).map(x => url(x && typeof x === 'object' ? x.url || x.href : x)).filter(Boolean).slice(0, 20);
  if (links.length) o.links = links;
  const a = obj(f.attrib), at = {}; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gc', 'ref'].forEach(k => { if (s(a[k])) at[k] = cut(a[k], 120); });
  if (Object.keys(at).length) o.attrib = at;
  return o;
}

/* everything shown for one lead record (a raw lead item, or an alert entry with the raw item merged in) */
function collect(rec){
  rec = obj(rec);
  const le = obj(rec.leadExtra), said = obj(le.said), c = obj(rec.contact);
  let message = s(le.textBody) || s(said.message) || s(rec.message) || s(rec.scope);   /* a text: the customer's own words, without the "Text message <time>:" prefix */
  const rows = [];
  const add = (k, v) => { v = s(v); if (v && !INSURER.test(k)) rows.push([k, v]); };
  add('Name', c.name || le.contactName || rec.contactName);
  add('Phone', c.phone ? tidy(c.phone) : (le.smsFrom ? tidy(le.smsFrom) : ''));
  add('E-mail', c.email);
  add('Address', [s(rec.address), [s(rec.city), s(rec.state)].filter(Boolean).join(', '), s(rec.zip)].filter(Boolean).join(', '));
  add('Asked for', [s(rec.websiteForm || le.websiteForm), said.service].filter(Boolean).join(' — '));
  add('Type', rec.type || rec.leadKind);
  add('Property', said.property);
  add('Urgency', said.urgency || le.urgency || (rec.emergency ? 'Emergency' : ''));
  add('Said on the call', le.callerSaid || le.spokenReason || le.screenReason || le.callReason || le.reason);   /* patch CALLSCREEN: leadExtra.callerSaid */
  add('Best time to call', said.bestTime);
  add('Date of damage', said.damageDate);
  add('Company', said.company || le.company);
  add('Project / location', said.project);
  add('Buildings / size', said.buildings);
  add('Plan', said.plan);
  add('Applying for', said.position);
  add('How they heard of us', said.howHeard || le.howHeard);
  add('Lead source', [s(rec.source || le.leadSource), s(le.mkSource)].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(' · '));
  const at = obj(said.attrib || le.attrib);
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gc', 'ref'].filter(k => s(at[k])).map(k => k + '=' + s(at[k])).join(' · ');
  add('UTM / tracking', utm);
  add('Sent from page', said.page);
  const links = arr(said.links).concat(arr(rec.plansLinks).map(x => x && x.url), arr(rec.files).map(x => x && (x.url || x.link))).map(url).filter(Boolean);
  const uniq = links.filter((x, i) => links.indexOf(x) === i).slice(0, 20);
  return { message: cut(message, FULL), rows, links: uniq };
}
function boxHtml(info, head){
  info = info || {};
  if (!s(info.message) && !arr(info.rows).length && !arr(info.links).length) return '';
  return '<div class="gc-said" style="border:2px solid #d4a017;border-radius:8px;background:#fffbeb;padding:10px 12px;margin:8px 0">'
    + '<div style="font-weight:700;font-size:15px;margin-bottom:6px">' + esc(head || '💬 What the customer said') + '</div>'
    + (s(info.message) ? '<div style="white-space:pre-wrap;font-size:15px;line-height:1.45;color:#111;background:#fff;border-left:3px solid #d4a017;padding:8px 10px;margin-bottom:8px">' + esc(info.message) + '</div>' : '')
    + (arr(info.rows).length ? '<table style="border-collapse:collapse;font:13px Arial">' + info.rows.map(r => '<tr><td style="padding:2px 10px 2px 0;color:#555;vertical-align:top;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:2px 0;white-space:pre-wrap">' + esc(r[1]) + '</td></tr>').join('') + '</table>' : '')
    + (arr(info.links).length ? '<div style="font-size:13px;margin-top:6px"><b>Attachments / links:</b> ' + info.links.map((u, i) => '<a href="' + esc(u) + '" style="color:#241968">' + (i + 1) + '. ' + esc(u.length > 60 ? u.slice(0, 57) + '…' : u) + '</a>').join('<br>') + '</div>' : '')
    + '</div>';
}
function boxText(info){
  info = info || {};
  if (!s(info.message) && !arr(info.rows).length) return '';
  return '— What the customer said —\n' + (s(info.message) ? info.message + '\n' : '') + arr(info.rows).map(r => r[0] + ': ' + r[1]).join('\n') + (arr(info.links).length ? '\nLinks: ' + info.links.join(' ') : '') + '\n';
}

/* a text in (missed-call.js relay e-mail) */
function textInfo(o){
  o = obj(o);
  const rows = [];
  if (s(o.name)) rows.push(['Name', s(o.name)]);
  rows.push(['Phone', tidy(o.phone)]);
  if (s(o.kind)) rows.push(['Who', o.kind === 'sub' ? 'a sub' : o.kind === 'customer' ? 'a customer' : o.kind === 'lead' ? 'a lead' : s(o.kind)]);
  if (s(o.job)) rows.push(['Job', s(o.job)]);
  return { message: cut(o.body, FULL), rows, links: arr(o.media).map(url).filter(Boolean) };
}
/* the last 10 texts both ways with this number (gc_job_messages), Central time, newest last */
function central(iso){
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT'; } catch (e) { return s(iso).slice(0, 16).replace('T', ' ') + ' UTC'; }
}
function threadOf(msgs, ph, n){
  ph = phone10(ph);
  return arr(msgs).filter(m => m && (m.channel === 'sms' || m.source === 'sms') && (phone10(m.smsFrom) === ph || phone10(m.smsTo) === ph) && s(m.at))
    .sort((a, b) => s(a.at).localeCompare(s(b.at))).slice(-(n || 10));
}
function threadHtml(list){
  list = arr(list);
  if (list.length < 2) return '';
  return '<div class="gc-thread" style="border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;margin:8px 0;background:#f8fafc"><div style="font-weight:700;margin-bottom:4px">🧵 Conversation so far (last ' + list.length + ', newest last)</div>'
    + list.map(m => { const out = m.dir === 'out'; return '<div style="margin:6px 0;' + (out ? 'padding-left:24px' : '') + '"><div style="font-size:12px;color:#64748b">' + esc(central(m.at)) + ' — ' + (out ? 'GrayCo' + (s(m.authorName) && !/auto-answer/i.test(m.authorName) ? ' (' + esc(s(m.authorName).replace(/\s*📱.*$/, '')) + ')' : /auto-answer/i.test(s(m.authorName)) ? ' (auto-answer)' : '') : 'Customer') + '</div>'
      + '<div style="white-space:pre-wrap;background:' + (out ? '#e0f2fe' : '#fff') + ';border-radius:6px;padding:5px 8px;font-size:13px">' + esc(cut(m.text, 2000)) + '</div></div>'; }).join('')
    + '</div>';
}
function threadText(list){
  list = arr(list); if (list.length < 2) return '';
  return '— Conversation so far —\n' + list.map(m => central(m.at) + ' ' + (m.dir === 'out' ? 'GrayCo' : 'Customer') + ': ' + cut(m.text, 600)).join('\n') + '\n';
}

/* patch LEADMAILMSG (owner: call quickly from the e-mail): big tappable buttons — table-based, inline styles (Gmail iOS / Android / web) */
function btn(href, label, bg, fg){
  /* each button its own small table, inline-block, so they wrap on a phone instead of running off the screen */
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;vertical-align:top;margin:0 8px 8px 0"><tr><td bgcolor="' + bg + '" style="border-radius:8px;background:' + bg + '">'
    + '<a href="' + esc(href) + '" style="display:inline-block;padding:13px 18px;font:bold 17px Arial,sans-serif;white-space:nowrap;color:' + fg + ';text-decoration:none;border-radius:8px">' + esc(label) + '</a></td></tr></table>';
}
function buttons(o){
  o = obj(o);
  const d = phone10(o.phone), em = s(o.email);
  const cells = [];
  if (d.length === 10) { cells.push(btn('tel:+1' + d, '📞 Call ' + tidy(d), '#16a34a', '#ffffff')); cells.push(btn('sms:+1' + d, '💬 Text', '#0e7490', '#ffffff')); }
  if (/^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(em)) cells.push(btn('mailto:' + em, '✉️ E-mail', '#241968', '#ffffff'));
  if (!cells.length) return '';
  return '<div class="gc-callbtns" style="margin:10px 0 4px">' + cells.join('') + '</div>';
}
/* the phone / e-mail to call for a lead record (or an alert entry) */
function contactOf(rec){ rec = obj(rec); const c = obj(rec.contact), le = obj(rec.leadExtra); return { phone: phone10(c.phone || rec.phone || le.smsFrom || rec.smsFrom), email: s(c.email || rec.email) }; }
/* every phone number in the e-mail body becomes a tel: link (text only — never inside a tag or an existing link) */
const PH = /(^|[^\d+:\/=-])(\+?1[\s.-]?)?(\(\d{3}\)\s?|\b\d{3}[\s.-])(\d{3})[\s.-](\d{4})\b/g;
function telify(html){
  let inA = 0, inSkip = 0;
  return s(html).split(/(<[^>]*>)/).map(part => {
    if (part[0] === '<') {
      if (/^<a[\s>]/i.test(part)) inA++; else if (/^<\/a>/i.test(part)) inA = Math.max(0, inA - 1);
      if (/^<(style|title|head)[\s>]/i.test(part)) inSkip++; else if (/^<\/(style|title|head)>/i.test(part)) inSkip = Math.max(0, inSkip - 1);
      return part;
    }
    if (inA || inSkip) return part;
    return part.replace(PH, (m, pre, one, area, mid, last) => {
      const d = area.replace(/\D/g, '') + mid + last;
      return pre + '<a href="tel:+1' + d + '" style="color:#241968;font-weight:bold">' + m.slice(pre.length) + '</a>';
    });
  }).join('');
}

module.exports = { buttons, contactOf, telify, shared, collect, boxHtml, boxText, textInfo, threadOf, threadHtml, threadText, central, FULL };
