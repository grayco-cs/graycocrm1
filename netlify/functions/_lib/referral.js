/* ── GrayCo — THE REFERRAL PROGRAM: STACKING CREDIT + ONE-TIME GIFT CODES (patch REF) ──────────────────────────
   Owner (10/21): "If someone gives us a referral we will give them between a $100 and $500 gift card for work from
   GrayCo, valid for anyone including gifts … once redeemed it will no longer be active." Then: "Referrals ADD UP into one
   credit balance per member … use the balance toward any GrayCo work … turn some or all of the balance into a one-time
   gift code … no expiration."

   MEMBERS   anyone: a customer in their portal, anyone on the website (website-intake.js type "referral"), or added in
             the CRM. Name, e-mail, phone, how they know us, a member code (R-XXXXXX) and their own link
             https://grayco-cs.com/?ref=R-XXXXXX (the website sends the code with every form).
   REFERRALS the people a member sends us (website / portal form, their link, "Referred by" on a CRM lead) → each one a
             GrayCo lead in Leads → 📥 Lead Inbox, "Referred by <member>"; the admins are told.
   CREDIT    when a referred job takes its first payment (Admin setting: or has a signed contract) the CRM PROPOSES
             $100–$500 of GrayCo credit for the member on the approvals list (owner rule: nothing to a customer without
             approval; suggested by the job's contract: under $10k $100, $10k–$25k $250, over $25k $500; the admin can
             change it). Approved → added to the member's ONE balance (a ledger: every credit, every use, every gift code).
             Credits STACK and NEVER EXPIRE. An admin can also add credit by hand (same approval).
   USE       staff apply all or part of a member's balance to an invoice or an estimate (the job's next invoice): the
             server deducts it ATOMICALLY (compare-and-set on the ledger) — never below zero, never twice — and the CRM
             puts it on the invoice as a payment "GrayCo credit — <member>". A customer can ask in their portal; the
             request goes to the office's To-Do.
   GIFT CODE the member turns some or all of the balance into a one-time code GC-XXXX-XXXX-XXXX for family or friends (in
             their portal, or an admin for them — through approval). The balance is deducted at once; the rest stays.
             Only the code's SHA-256 hash and last 4 are kept. Used once (on any job, by staff or in a portal), then dead
             ("This gift code was already used on <date>"); it never expires; an admin can cancel an unused code (the
             amount goes back to the member's balance). Code checks are rate-limited against guessing.
   STORE     service-only gc_lead_inbox_kv: gc_ref_members, gc_ref_referrals, gc_ref_ledger, gc_ref_cards (gift codes),
             gc_ref_settings, gc_ref_rl.
   ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');

const K = { members: 'gc_ref_members', referrals: 'gc_ref_referrals', ledger: 'gc_ref_ledger', cards: 'gc_ref_cards', settings: 'gc_ref_settings', rl: 'gc_ref_rl' };
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   /* 32 letters, no 0/O/1/I: 12 of them = 60 bits */
const MIN = 100, MAX = 500, GIFT_MIN = 10;
const RL = { ip: 8, all: 150 };   /* wrong codes per hour: per address, and for everybody together */
const OFFICE = '901-585-0944';
const AD_COPY = [
  { id: 'kitchen', label: 'Social post — new kitchen', autopilot: true, text: 'Need a new kitchen and don’t have the money? 🍳 Join the GrayCo Referral Program — every friend you refer earns you $100–$500 in GrayCo credit. Stack your credits and put them toward your kitchen, bathroom, floors, roof, maintenance or remodel. Credits never expire. Join free at grayco-cs.com/#referrals' },
  { id: 'stack', label: 'Social post — stack your credits', autopilot: true, text: 'Your friends need a contractor. You need a new bathroom. 🛁 Refer them to GrayCo and earn $100–$500 in GrayCo credit for every one who hires us. Credits stack, never expire, and work on any GrayCo project — or turn them into a gift code for family. Join free: grayco-cs.com/#referrals' },
  { id: 'short', label: 'Short ad (Google / Facebook)', autopilot: false, text: 'Refer a friend, earn $100–$500 in GrayCo credit. Credits stack and never expire — use them on your roof, kitchen, bath or remodel. Join free.' },
  { id: 'flyer', label: 'Flyer / door hanger blurb', autopilot: false, text: 'GRAYCO REFERRAL PROGRAM — Know someone who needs a roof, remodel or repair? Send them to GrayCo. When they hire us, you earn $100–$500 in GrayCo credit. Your credits add up and never expire: put them toward a new kitchen, bathroom, floors, roof or maintenance — or gift them to family as a one-time code. Join free at grayco-cs.com or ask your Project Manager. GrayCo Construction Services · 901-585-0944' }
];
const DEFAULTS = { tiers: [{ upTo: 10000, amount: 100 }, { upTo: 25000, amount: 250 }, { upTo: 0, amount: 500 }], trigger: 'first_payment', siteUrl: 'https://grayco-cs.com', adCopy: AD_COPY };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function cents(v){ return Math.round(num(v) * 100) / 100; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function isEmail(v){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(v)); }
function phone10(v){ let d = s(v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; }
function tidyPhone(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function now(){ return module.exports._now ? module.exports._now() : Date.now(); }
function nowIso(){ return new Date(now()).toISOString(); }
function sha(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function hex(n){ return crypto.randomBytes(n).toString('hex'); }
function money(n){ n = cents(n); return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
function day(iso){ const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }); }
function streetKey(a){ const m = /^\s*(\d+)\s+([A-Za-z]+)/.exec(s(a)); return m ? (m[1] + ' ' + m[2]).toLowerCase() : ''; }
function env(k){ return String(process.env[k] == null ? '' : process.env[k]).trim(); }
function replyTo(){ return env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com'; }
function first(n){ const w = s(n).replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/[\s,&]+/)[0] || ''; return /^[A-Za-z][A-Za-z'-]{0,20}$/.test(w) ? w[0].toUpperCase() + w.slice(1) : ''; }
function shortName(n){ const p = s(n).split(/\s+/).filter(Boolean); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0].toUpperCase() + '.' : s(n); }
function plain(msg){ return Object.assign(new Error(msg), { plain: msg }); }

/* the stores (lazy: each Netlify function is bundled on its own) */
function L(){ return require('../bid-inbox.js')._lib; }
function core(){ return require('../portal.js')._core; }
function WI(){ return require('../website-intake.js')._lib; }

/* ── codes ─────────────────────────────────────────────────────────────────── */
function letters(n){ const b = crypto.randomBytes(n); let o = ''; for (let i = 0; i < n; i++) o += ALPHA[b[i] & 31]; return o; }
function newCardCode(){ const x = letters(12); return 'GC-' + x.slice(0, 4) + '-' + x.slice(4, 8) + '-' + x.slice(8); }
/* "gc-abcd efgh-ijkl" / "GCABCDEFGHIJKL" → "ABCDEFGHIJKL" (12 letters of ALPHA), else '' */
function normCode(v){
  let t = s(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length === 14 && t.slice(0, 2) === 'GC') t = t.slice(2);
  if (t.length !== 12) return '';
  for (let i = 0; i < 12; i++) if (ALPHA.indexOf(t[i]) < 0) return '';
  return t;
}
function cardHash(norm){ return sha('gc-gift-card|' + norm); }
function newMemberCode(){ return 'R-' + letters(6); }
function normMemberCode(v){ const t = s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); const x = t.slice(0, 1) === 'R' && t.length === 7 ? t.slice(1) : ''; return x && x.split('').every(function(c){ return ALPHA.indexOf(c) >= 0; }) ? 'R-' + x : ''; }

/* ── settings ──────────────────────────────────────────────────────────────── */
function clamp(a){ a = Math.round(num(a)); return Math.max(MIN, Math.min(MAX, a || MIN)); }
function cleanSettings(v){
  v = v && typeof v === 'object' ? v : {};
  let tiers = arr(v.tiers).map(function(t){ return { upTo: Math.max(0, Math.round(num(t.upTo))), amount: clamp(t.amount) }; }).slice(0, 6);
  if (!tiers.length) tiers = DEFAULTS.tiers.map(function(t){ return Object.assign({}, t); });
  tiers.sort(function(a, b){ return (a.upTo || Infinity) - (b.upTo || Infinity); });
  const trigger = /^(first_payment|signed|manual)$/.test(s(v.trigger)) ? s(v.trigger) : DEFAULTS.trigger;
  const site = /^https:\/\/[a-z0-9.-]+(\/[^\s"<>]*)?$/i.test(s(v.siteUrl)) ? s(v.siteUrl).replace(/\/$/, '') : DEFAULTS.siteUrl;
  const saved = arr(v.adCopy);
  const adCopy = AD_COPY.map(function(d){ const x = saved.find(function(y){ return y.id === d.id; }) || {}; return { id: d.id, label: d.label, text: clip(s(x.text) || d.text, 1200), autopilot: x.autopilot == null ? d.autopilot : x.autopilot === true, edited: !!s(x.text) && s(x.text) !== d.text }; });
  const autoThanks = v.autoThanks !== false;   /* patch AUTOC 5 (owner 10/29 "yes 18"): won → credit + thank-you by itself */
  return { tiers, trigger, siteUrl: site, adCopy, autoThanks, updatedBy: s(v.updatedBy), updatedAt: s(v.updatedAt) };
}
async function settings(){ return cleanSettings(await L().kvGet(K.settings)); }
async function saveSettings(v, by){
  let out = null;
  await L().kvCas(K.settings, function(cur){ const merged = Object.assign({}, cur || {}, v || {}, { updatedBy: by, updatedAt: nowIso() }); out = cleanSettings(merged);
    return Object.assign({}, out, { adCopy: out.adCopy.map(function(a){ return { id: a.id, text: a.text, autopilot: a.autopilot }; }) }); });
  return out;
}
/* the suggested credit for a referred job's contract value */
function suggest(contract, st){
  st = st || cleanSettings(null); const c = num(contract);
  for (const t of st.tiers) if (!t.upTo || c < t.upTo) return t.amount;
  return st.tiers[st.tiers.length - 1].amount;
}
function memberLink(m, st){ return (st ? st.siteUrl : DEFAULTS.siteUrl) + '/?ref=' + encodeURIComponent(m.code) + '#referrals'; }
/* the Marketing Autopilot (mkt.js): one referral post a month, from the ads marked "Autopilot" (edited text wins) */
async function adForAutopilot(monthKey, usedTipIds){
  const st = await settings(); const list = st.adCopy.filter(function(a){ return a.autopilot && s(a.text); });
  if (!list.length) return null;
  const mk = s(monthKey).slice(0, 7);
  if ((Array.isArray(usedTipIds) ? usedTipIds : []).some(function(x){ return /^refad_/.test(s(x)) && s(x).slice(-8) === '_' + mk; })) return null;
  const n = parseInt(mk.slice(5, 7), 10) || 1, a = list[n % list.length];
  return { id: 'refad_' + a.id + '_' + mk, text: a.text };
}

/* ── members ───────────────────────────────────────────────────────────────── */
function pubMember(m, st){ return { id: m.id, code: m.code, name: m.name, email: m.email, phone: m.phone, how: m.how, source: m.source, createdAt: m.createdAt, link: memberLink(m, st), pid: s(m.pid) }; }
function sameMember(m, o){
  const e = low(o.email), p = phone10(o.phone);
  return !!((e && low(m.email) === e) || (p.length === 10 && phone10(m.phone) === p));
}
/* o: { name, email, phone, how, source, pid, by } → { member, created } */
async function upsertMember(o){
  o = o || {};
  const name = clip(o.name, 80), email = isEmail(o.email) ? low(o.email) : '', phone = phone10(o.phone).length === 10 ? tidyPhone(o.phone) : '';
  if (!name) throw plain('Please add your name.');
  if (!email && !phone) throw plain('Please add an e-mail address or a phone number.');
  let out = null, created = false;
  await L().kvCas(K.members, function(v){
    const list = arr(v), m = list.find(function(x){ return sameMember(x, { email, phone }); });
    if (m) {
      let ch = false;
      if (!m.email && email) { m.email = email; ch = true; }
      if (!m.phone && phone) { m.phone = phone; ch = true; }
      if (!m.how && s(o.how)) { m.how = clip(o.how, 120); ch = true; }
      if (!m.pid && s(o.pid)) { m.pid = s(o.pid); ch = true; }
      out = m; created = false;
      return ch ? list : undefined;
    }
    const codes = {}; list.forEach(function(x){ codes[x.code] = 1; });
    let code = newMemberCode(); while (codes[code]) code = newMemberCode();
    const rec = { id: 'RM_' + hex(5), code, name, email, phone, how: clip(o.how, 120), source: s(o.source) || 'crm', pid: s(o.pid), createdAt: nowIso(), createdBy: s(o.by) };
    out = rec; created = true;
    return list.concat([rec]);
  });
  return { member: out, created };
}
async function members(){ return arr(await L().kvGet(K.members)); }
async function memberById(id){ return (await members()).find(function(m){ return m.id === s(id); }) || null; }
async function memberByCode(code){ const c = normMemberCode(code); if (!c) return null; return (await members()).find(function(m){ return m.code === c; }) || null; }

/* ── referrals ─────────────────────────────────────────────────────────────── */
/* o: { member, name, email, phone, address, note, leadId, crmLeadId, via, by } → { referral, created } */
async function addReferral(o){
  const m = o.member; if (!m) throw new Error('no member');
  const email = isEmail(o.email) ? low(o.email) : '', phone = phone10(o.phone).length === 10 ? tidyPhone(o.phone) : '';
  let out = null, created = false;
  await L().kvCas(K.referrals, function(v){
    const list = arr(v);
    const hit = list.find(function(r){ return r.memberId === m.id && ((o.leadId && r.leadId === o.leadId) || (o.crmLeadId && r.crmLeadId === o.crmLeadId) || (email && r.email === email) || (phone && phone10(r.phone) === phone10(phone))); });
    if (hit) { out = hit; let ch = false; if (o.leadId && !hit.leadId) { hit.leadId = o.leadId; ch = true; } if (o.crmLeadId && !hit.crmLeadId) { hit.crmLeadId = o.crmLeadId; ch = true; } return ch ? list : undefined; }
    const rec = { id: 'RR_' + hex(5), memberId: m.id, memberName: m.name, name: clip(o.name, 80), email, phone, address: clip(o.address, 200), note: clip(o.note, 600),
      leadId: s(o.leadId), crmLeadId: s(o.crmLeadId), via: s(o.via) || 'crm', status: 'referred', createdAt: nowIso(), createdBy: s(o.by) };
    out = rec; created = true;
    return list.concat([rec]);
  });
  return { referral: out, created };
}
async function referrals(){ return arr(await L().kvGet(K.referrals)); }
async function patchReferral(id, fn){ let out = null; await L().kvCas(K.referrals, function(v){ const list = arr(v), r = list.find(function(x){ return x.id === id; }); if (!r) return undefined; if (fn(r) === false) return undefined; out = r; return list; }); return out; }

/* a referred person → a GrayCo lead in the Lead Inbox, "Referred by <member>"; the admins get the new-lead alert */
async function referralLead(m, o, how){
  const f = { type: 'estimate', name: clip(o.name, 80), email: isEmail(o.email) ? low(o.email) : '', phone: s(o.phone), address: clip(o.address, 200), city: clip(o.city, 60), state: s(o.state).toUpperCase().slice(0, 2), zip: s(o.zip).slice(0, 10),
    message: clip(('Referred by ' + m.name + ' (GrayCo referral program, member ' + m.code + ').') + (s(o.note) ? '\n\n' + s(o.note) : ''), 3000), company: '', service: clip(o.service, 120), property: '', bestTime: '', damageDate: '', carrier: '', claimFiled: '', claimNumber: '',
    project: '', bidDue: '', plansLink: '', buildings: '', plan: '', urgency: '', position: '', experience: '', availability: '', hp: '', token: '', turnstile: '', resume: null, via: 'referral', page: '' };
  const sid = sha('referral|' + m.id + '|' + low(f.email) + '|' + phone10(f.phone) + '|' + low(f.name)).slice(0, 24);
  const r = await WI().fileLead(f, { sid, source: 'Referral — ' + m.name, how: how || 'from the GrayCo referral program', title: 'Referral — ' + f.name + (s(f.address) ? ' — ' + s(f.address).split(',')[0] : '') + ' (by ' + m.name + ')',
    leadExtra: { referredBy: m.name, referredByMember: m.id, referredByCode: m.code, referredByEmail: m.email, referralProgram: true, leadSource: 'Referral — ' + m.name } });
  if (r.action === 'added') { try { await WI().alertLead(r.rec); } catch (e) {} }
  return r;
}

/* ── e-mail ────────────────────────────────────────────────────────────────── */
async function mailAdmins(subject, lines){
  const key = env('RESEND_API_KEY'); if (!key) return false;
  let to = []; try { to = await L().alertsApi().recipients(); } catch (e) {}
  if (!to.length) return false;
  const site = (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">' + esc(subject) + '</div><div style="padding:6px 18px 18px">'
    + lines.map(function(l){ return '<p>' + esc(l) + '</p>'; }).join('') + '<p><a href="' + esc(site) + '/#marketing" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open Marketing → 🎁 Referral program</a></p></div></div>';
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo CRM <noreply@grayco-cs.com>', to, subject: require('./mailtag.js').tag(subject, to, 'marketing referral'), html, text: subject + '\n\n' + lines.join('\n') + '\n\n' + site + '/#marketing', headers: { 'X-GrayCo-CRM': 'referral' } }) });
    return r.ok;
  } catch (e) { return false; }
}
async function mailMember(to, subject, html, text, cc){
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, why: 'RESEND_API_KEY is not set' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'GrayCo Construction Services <office@grayco-cs.com>', reply_to: replyTo(), to: [to], cc: Array.isArray(cc) && cc.length ? cc.slice(0, 5) : undefined, subject, html, text }) });
    return r.ok ? { ok: true } : { ok: false, why: 'Resend ' + r.status };
  } catch (e) { return { ok: false, why: 'Resend unreachable' }; }
}
const FOOT = '<p style="font-size:12px;color:#666">GrayCo Construction Services · ' + require('./brand.js').companyAddress() + ' · ' + OFFICE + ' · office@grayco-cs.com</p>';
function paras(t){ return s(t) ? '<p style="font-size:15px;line-height:1.55">' + s(t).split(/\n{2,}/).map(esc).join('</p><p style="font-size:15px;line-height:1.55">').replace(/\n/g, '<br>') + '</p>' : ''; }
/* the credit e-mail (a member earned credit) */
function creditHtml(o){
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b1640;max-width:560px">' + paras(o.intro)
    + '<div style="margin:18px 0;border-radius:16px;overflow:hidden;background:#1b1640;color:#fff;box-shadow:0 8px 24px rgba(27,22,64,.25)">'
    + '<div style="padding:22px 24px 6px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#d4a017;font-weight:700">GrayCo Referral Program</div>'
    + '<div style="padding:0 24px;font-size:30px;font-weight:700;font-family:Georgia,serif">+' + esc(money(o.amount)) + ' GrayCo credit</div>'
    + '<div style="padding:8px 24px 22px;font-size:14px;color:#e6e3f5;line-height:1.6">' + (o.balance != null ? 'Your credit balance: <b style="color:#fff">' + esc(money(o.balance)) + '</b><br>' : '')
    + 'Credits stack and never expire. Put them toward any GrayCo work — maintenance, roofs, kitchens, bathrooms, floors, remodels or new construction — or turn them into a one-time gift code for family and friends. Just ask your Project Manager, or see it in your GrayCo customer portal.</div>'
    + '</div>' + FOOT + '</div>';
}
/* a one-time gift code */
function cardHtml(o){
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b1640;max-width:560px">' + paras(o.intro)
    + '<div style="margin:18px 0;border-radius:16px;overflow:hidden;background:#1b1640;color:#fff;box-shadow:0 8px 24px rgba(27,22,64,.25)">'
    + '<div style="padding:22px 24px 6px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#d4a017;font-weight:700">GrayCo Construction Services</div>'
    + '<div style="padding:0 24px;font-size:30px;font-weight:700;font-family:Georgia,serif">Gift code · ' + esc(money(o.amount)) + '</div>'
    + '<div style="padding:8px 24px 0;font-size:14px;color:#e6e3f5">Good for ' + esc(money(o.amount)) + ' toward work by GrayCo Construction Services. One-time use.</div>'
    + '<div style="margin:18px 24px;padding:14px;border:2px dashed #d4a017;border-radius:10px;text-align:center;font:700 24px/1.2 Consolas,Menlo,monospace;letter-spacing:2px;color:#fff">' + esc(o.code) + '</div>'
    + '<div style="padding:0 24px 22px;font-size:12px;color:#c9c5e3;line-height:1.5">No expiration. Valid for anyone — use it yourself or give it to family and friends. The full value is used at once; once it is used, the code no longer works. Give the code to your GrayCo Project Manager or enter it in your GrayCo customer portal. Questions: ' + OFFICE + '.</div>'
    + '</div>' + FOOT + '</div>';
}
/* what an approver typed above the card (the approval shows the e-mail as text: intro, then the card) */
function introFromText(t){ return s(String(t || '').split(/\n*[ \t]*GrayCo (?:Construction Services|Referral Program)[ \t]*\n+[ \t]*(?:Gift code ·|\+\$)/)[0]); }
function introFor(name, why){ return (first(name) ? 'Hi ' + first(name) + ',' : 'Hello,') + '\n\n' + (why || 'Thank you from GrayCo Construction Services!'); }

/* ── the ledger: one balance per member ────────────────────────────────────── */
async function ledger(){ return arr(await L().kvGet(K.ledger)); }
function balanceOf(list, memberId){ return cents(arr(list).filter(function(e){ return e.memberId === memberId; }).reduce(function(t, e){ return t + num(e.amount); }, 0)); }
async function balance(memberId){ return balanceOf(await ledger(), memberId); }
function pubEntry(e){ return { id: e.id, memberId: e.memberId, type: e.type, amount: e.amount, at: e.at, by: s(e.by), note: s(e.note), referralId: s(e.referralId), referredName: s(e.referredName), pid: s(e.pid), invoiceId: s(e.invoiceId), cardId: s(e.cardId), last4: s(e.last4), appliedAt: s(e.appliedAt), appliedInvoiceId: s(e.appliedInvoiceId), memberName: s(e.memberName) }; }
/* add credit (an approved referral / an admin's) — once per approval */
async function earn(o){
  let entry = null, dup = null, bal = 0;
  await L().kvCas(K.ledger, function(v){
    const list = arr(v);
    dup = o.approvalId ? list.find(function(e){ return e.approvalId === o.approvalId && e.type === 'earn'; }) : null;
    if (dup) { bal = balanceOf(list, dup.memberId); return undefined; }
    entry = { id: 'RL_' + hex(6), memberId: o.memberId, memberName: s(o.memberName), type: 'earn', amount: cents(o.amount), at: nowIso(), by: clip(o.by, 80), note: clip(o.note, 300), referralId: s(o.referralId), referredName: s(o.referredName), approvalId: s(o.approvalId) };
    const next = list.concat([entry]); bal = balanceOf(next, o.memberId); return next;
  });
  return { entry: entry || dup, already: !!dup, balance: bal };
}
/* deduct: never below zero, never twice (compare-and-set on the whole ledger) — o: { memberId, amount, type, pid, invoiceId, by, note, cardId, last4, key } */
async function deduct(o){
  const amt = cents(o.amount);
  if (!(amt > 0)) return { ok: false, code: 400, error: 'Enter an amount above $0.' };
  let res = null;
  await L().kvCas(K.ledger, function(v){
    const list = arr(v);
    if (o.key) { const dup = list.find(function(e){ return e.key === o.key; }); if (dup) { res = { ok: true, entry: dup, already: true, balance: balanceOf(list, o.memberId) }; return undefined; } }
    const bal = balanceOf(list, o.memberId);
    if (amt > bal + 0.001) { res = { ok: false, code: 409, error: 'Only ' + money(bal) + ' of credit is left — that is less than ' + money(amt) + '.', balance: bal }; return undefined; }
    const e = { id: 'RL_' + hex(6), memberId: o.memberId, memberName: s(o.memberName), type: o.type, amount: -amt, at: nowIso(), by: clip(o.by, 80), note: clip(o.note, 300), pid: s(o.pid), invoiceId: s(o.invoiceId), cardId: s(o.cardId), last4: s(o.last4), key: s(o.key), appliedAt: '' };
    const next = list.concat([e]); res = { ok: true, entry: e, balance: balanceOf(next, o.memberId) }; return next;
  });
  return res || { ok: false, code: 503, error: 'Could not update the balance — try again.' };
}
/* staff: apply all or part of a member's credit to a job (an invoice, or the job's next invoice for an estimate) */
async function applyCredit(o){
  const m = await memberById(o.memberId); if (!m) return { code: 404, body: { ok: false, error: 'Pick the member.' } };
  if (!s(o.pid)) return { code: 400, body: { ok: false, error: 'Pick the job the credit is for.' } };
  const r = await deduct({ memberId: m.id, memberName: m.name, amount: o.amount, type: 'apply', pid: o.pid, invoiceId: o.invoiceId, by: o.by, note: o.note, key: o.key });
  if (!r.ok) return { code: r.code || 409, body: { ok: false, error: r.error, balance: r.balance } };
  return { code: 200, body: { ok: true, entry: pubEntry(r.entry), balance: r.balance, message: money(-r.entry.amount) + ' of ' + m.name + '’s GrayCo credit is on this job (' + money(r.balance) + ' left). It shows on the invoice as a payment.' } };
}

/* ── gift codes (from a member's balance) ─────────────────────────────────── */
function pubCard(c){ return { id: c.id, last4: c.last4, amount: c.amount, status: c.status, memberId: c.memberId, memberName: s(c.memberName), via: s(c.via), issuedAt: s(c.issuedAt), issuedBy: s(c.issuedBy),
  redeemedAt: s(c.redeemedAt), redeemedBy: s(c.redeemedBy), redeemedVia: s(c.redeemedVia), redeemedPid: s(c.redeemedPid), redeemedInvoiceId: s(c.redeemedInvoiceId),
  appliedAt: s(c.appliedAt), appliedInvoiceId: s(c.appliedInvoiceId), voidedAt: s(c.voidedAt), voidedBy: s(c.voidedBy), voidReason: s(c.voidReason), sentTo: s(c.sentTo), note: s(c.note) }; }
async function cards(){ return arr(await L().kvGet(K.cards)); }
/* the balance goes down first, then the code is made; if the code cannot be stored the amount goes back */
async function makeGift(o){
  const m = o.member, amount = cents(o.amount);
  if (!(amount >= GIFT_MIN)) return { ok: false, code: 400, error: 'A gift code is at least ' + money(GIFT_MIN) + '.' };
  const code = newCardCode(), norm = normCode(code), id = 'GCC_' + hex(6);
  const d = await deduct({ memberId: m.id, memberName: m.name, amount, type: 'gift', cardId: id, last4: norm.slice(-4), by: o.by, note: o.note, key: o.key });
  if (!d.ok) return d;
  if (d.already) return { ok: false, code: 409, error: 'That gift code was already made.' };
  try {
    await L().kvCas(K.cards, function(v){ return arr(v).concat([{ id, hash: cardHash(norm), last4: norm.slice(-4), amount, memberId: m.id, memberName: m.name, status: 'issued', via: s(o.via), issuedAt: nowIso(), issuedBy: clip(o.by, 80), sentTo: s(o.sentTo), note: clip(o.note, 300), ledgerId: d.entry.id }]); });
  } catch (e) {
    await L().kvCas(K.ledger, function(v){ return arr(v).concat([{ id: 'RL_' + hex(6), memberId: m.id, memberName: m.name, type: 'gift_void', amount, at: nowIso(), by: 'system', note: 'The gift code could not be stored — amount returned.', cardId: id }]); }).catch(function(){});
    return { ok: false, code: 503, error: 'Could not make the gift code — your credit was not used. Try again.' };
  }
  return { ok: true, code: code, card: { id, last4: norm.slice(-4), amount }, balance: d.balance };
}
async function giftMail(to, m, g, intro, subject, cc){
  const i = intro || introFor(m.name, 'Here is the GrayCo gift code you made from your referral credit (' + money(g.balance) + ' of credit left). Give it to family or friends — or use it yourself.');
  return mailMember(to, subject || ('Your ' + money(g.card.amount) + ' GrayCo gift code'), cardHtml({ amount: g.card.amount, code: g.code, intro: i }),
    i + '\n\n' + g.code + '\nGood for ' + money(g.card.amount) + ' toward work by GrayCo Construction Services. One-time use. No expiration. Valid for anyone.\n\nGrayCo Construction Services · ' + OFFICE, cc);
}
const TOO_MANY = 'Too many tries — please wait an hour, or call GrayCo ' + OFFICE + '.';
async function blocked(who){
  const v = (await L().kvGet(K.rl)) || {}, h = Math.floor(now() / 3600000);
  if (v.h !== h) return false;
  return (v.by && (v.by[sha(who).slice(0, 16)] || 0) >= RL.ip) || (v.all || 0) >= RL.all;
}
async function wrong(who){
  const h = Math.floor(now() / 3600000), k = sha(who).slice(0, 16);
  try { await L().kvCas(K.rl, function(v){ v = v && v.h === h ? v : { h, by: {}, all: 0 }; v.by = v.by || {}; v.by[k] = (v.by[k] || 0) + 1; v.all = (v.all || 0) + 1; return v; }); } catch (e) {}
}
/* check a code without using it */
async function check(code, who){
  if (await blocked(who)) return { code: 429, body: { ok: false, error: TOO_MANY } };
  const norm = normCode(code);
  const c = norm ? (await cards()).find(function(x){ return x.hash && x.hash === cardHash(norm); }) : null;
  if (!c) { await wrong(who); return { code: 404, body: { ok: false, error: norm ? 'That gift code was not found — check it and try again.' : 'That does not look like a GrayCo gift code (GC-XXXX-XXXX-XXXX).' } }; }
  return { code: 200, body: { ok: true, card: { last4: c.last4, amount: c.amount, status: c.status, usedAt: s(c.redeemedAt) }, usable: c.status === 'issued',
    message: c.status === 'issued' ? 'Good for ' + money(c.amount) + '. One-time use.' : c.status === 'redeemed' ? 'This gift code was already used on ' + day(c.redeemedAt) + '.' : c.status === 'void' ? 'This gift code was cancelled by GrayCo.' : 'This gift code is not active.' } };
}
/* use a code: one time, enforced here (compare-and-set) — o: { code, pid, invoiceId, by, via, who } */
async function redeem(o){
  const who = s(o.who) || 'unknown';
  if (await blocked(who)) return { code: 429, body: { ok: false, error: TOO_MANY } };
  const norm = normCode(o.code);
  if (!norm) { await wrong(who); return { code: 400, body: { ok: false, error: 'That does not look like a GrayCo gift code (GC-XXXX-XXXX-XXXX).' } }; }
  if (!s(o.pid)) return { code: 400, body: { ok: false, error: 'Pick the job the gift code is for.' } };
  const h = cardHash(norm), at = nowIso();
  let res = null;
  await L().kvCas(K.cards, function(v){
    const list = arr(v), c = list.find(function(x){ return x.hash && x.hash === h; });
    if (!c) { res = { code: 404, body: { ok: false, error: 'That gift code was not found — check it and try again.' } }; return undefined; }
    if (c.status === 'redeemed') { res = { code: 409, body: { ok: false, used: true, error: 'This gift code was already used on ' + day(c.redeemedAt) + '.' } }; return undefined; }
    if (c.status === 'void') { res = { code: 409, body: { ok: false, error: 'This gift code was cancelled by GrayCo.' } }; return undefined; }
    if (c.status !== 'issued') { res = { code: 409, body: { ok: false, error: 'This gift code is not active.' } }; return undefined; }
    c.status = 'redeemed'; c.redeemedAt = at; c.redeemedBy = clip(o.by, 80); c.redeemedVia = s(o.via) || 'crm'; c.redeemedPid = s(o.pid); c.redeemedInvoiceId = s(o.invoiceId); c.appliedAt = ''; c.applyClaim = '';
    res = { code: 200, body: { ok: true, card: pubCard(c), message: 'Gift code …' + c.last4 + ' for ' + money(c.amount) + ' is used on this job. It shows on the invoice as a payment.' } };
    return list;
  });
  if (res && res.code === 404) await wrong(who);
  return res || { code: 503, body: { ok: false, error: 'Could not check the code — try again.' } };
}
/* an unused code is cancelled: it stops working and its amount goes back to the member's balance */
async function voidCard(id, by, reason){
  let out = null, why = '';
  await L().kvCas(K.cards, function(v){ const list = arr(v), c = list.find(function(x){ return x.id === id; }); if (!c) { why = 'No such gift code.'; return undefined; } if (c.status !== 'issued') { why = c.status === 'redeemed' ? 'It was already used — it cannot be cancelled.' : 'It is not an active code.'; return undefined; }
    c.status = 'void'; c.voidedAt = nowIso(); c.voidedBy = clip(by, 80); c.voidReason = clip(reason, 200); out = c; return list; });
  if (!out) return { ok: false, error: why || 'Could not cancel it.' };
  const bal = out.memberId ? await earnBack(out, by) : null;
  return { ok: true, card: pubCard(out), balance: bal };
}
async function earnBack(c, by){
  let bal = 0;
  await L().kvCas(K.ledger, function(v){ const list = arr(v); if (list.some(function(e){ return e.type === 'gift_void' && e.cardId === c.id; })) { bal = balanceOf(list, c.memberId); return undefined; }
    const next = list.concat([{ id: 'RL_' + hex(6), memberId: c.memberId, memberName: s(c.memberName), type: 'gift_void', amount: cents(c.amount), at: nowIso(), by: clip(by, 80), note: 'Gift code …' + c.last4 + ' cancelled — back to the balance.', cardId: c.id, last4: c.last4 }]);
    bal = balanceOf(next, c.memberId); return next; });
  return bal;
}

/* ── the CRM puts credit / used codes on the invoice (one computer at a time) ── */
async function pending(){
  const cs = (await cards()).filter(function(c){ return c.status === 'redeemed' && !c.appliedAt; }).map(function(c){ return { id: c.id, kind: 'card', amount: c.amount, pid: c.redeemedPid, invoiceId: c.redeemedInvoiceId, label: 'Gift code …' + c.last4, by: c.redeemedBy, at: c.redeemedAt, last4: c.last4 }; });
  const ls = (await ledger()).filter(function(e){ return e.type === 'apply' && !e.appliedAt; }).map(function(e){ return { id: e.id, kind: 'credit', amount: -num(e.amount), pid: e.pid, invoiceId: e.invoiceId, label: 'GrayCo credit — ' + (s(e.memberName) || 'referral program'), by: e.by, at: e.at }; });
  return cs.concat(ls);
}
async function claimApply(id, by){
  const key = /^RL_/.test(s(id)) ? K.ledger : K.cards;
  let ok = false;
  await L().kvCas(key, function(v){
    const list = arr(v), c = list.find(function(x){ return x.id === id; });
    if (!c || c.appliedAt || (key === K.cards ? c.status !== 'redeemed' : c.type !== 'apply')) return undefined;
    if (c.applyClaim && now() - Date.parse(c.applyClaimAt || 0) < 5 * 60000 && c.applyClaim !== by) return undefined;
    c.applyClaim = by; c.applyClaimAt = nowIso(); ok = true; return list;
  });
  return { ok };
}
async function markApplied(id, invoiceId, by){
  const key = /^RL_/.test(s(id)) ? K.ledger : K.cards;
  let out = null;
  await L().kvCas(key, function(v){ const list = arr(v), c = list.find(function(x){ return x.id === id; }); if (!c || c.appliedAt || (key === K.cards ? c.status !== 'redeemed' : c.type !== 'apply')) return undefined;
    c.appliedAt = nowIso(); c.appliedBy = clip(by, 80); c.appliedInvoiceId = s(invoiceId); out = c; return list; });
  return out ? { id: out.id, appliedAt: out.appliedAt, appliedInvoiceId: out.appliedInvoiceId } : null;
}

/* ── approvals: credit for a member, or a gift code made for them (the admins approve) ── */
async function propose(o){
  const m = o.member, st = o.settings || await settings(), amount = clamp(o.amount || suggest(o.contract, st));
  const id = s(o.id) || ('appr_refcredit_' + (o.referral ? o.referral.id : 'm_' + hex(5)));
  const why = o.referral ? 'Thank you for referring ' + (first(o.referral.name || '') || 'a friend') + ' to GrayCo Construction Services! ' + money(amount) + ' of GrayCo credit has been added to your account.' : (s(o.note) || 'Thank you from GrayCo Construction Services! ' + money(amount) + ' of GrayCo credit has been added to your account.');
  const html = creditHtml({ amount, intro: introFor(m.name, why) });
  const ok = await core().queueApproval({ id, kind: 'refcredit', pid: '', jobName: '🎁 ' + money(amount) + ' referral credit for ' + m.name + (o.referral ? ' — referred ' + o.referral.name : ''), pm: null, to: m.email || '',
    subject: 'You earned ' + money(amount) + ' in GrayCo credit — thank you!', html, attachments: [],
    meta: { memberId: m.id, memberName: m.name, referralId: o.referral ? o.referral.id : '', referredName: o.referral ? o.referral.name : '', amount, contract: num(o.contract), pid: s(o.pid), by: s(o.by), manual: !o.referral, note: clip(o.note, 300) } });
  return { ok: !!ok, id, amount };
}
async function proposeGift(o){
  const m = o.member, amount = cents(o.amount), id = 'appr_refgift_' + hex(5);
  const html = cardHtml({ amount, code: 'GC-••••-••••-•••• (made when approved)', intro: introFor(m.name, s(o.note) || 'Here is a GrayCo gift code made from your referral credit. Give it to family or friends — or use it yourself.') });
  const ok = await core().queueApproval({ id, kind: 'refgift', pid: '', jobName: '🎟 ' + money(amount) + ' gift code from ' + m.name + '’s credit', pm: null, to: m.email || '', subject: 'Your ' + money(amount) + ' GrayCo gift code', html, attachments: [],
    meta: { memberId: m.id, memberName: m.name, amount, note: clip(o.note, 300), by: s(o.by) } });
  return { ok: !!ok, id, amount };
}
/* approved (portal.js aqSend → here) */
async function onApproved(item, nowStr){
  const m = item.meta || {}, by = s(((item.approvals || []).slice(-1)[0] || {}).by);
  const mem = await memberById(m.memberId); if (!mem) return { ok: false, error: 'That member is no longer in the referral program.' };
  if (item.kind === 'refgift') {
    const to = low(item.to); if (!isEmail(to)) return { ok: false, error: 'Add the member’s e-mail in "To" first — the gift code is e-mailed to them.' };
    const g = await makeGift({ member: mem, amount: m.amount, by: by + ' (approved)', via: 'crm', note: m.note, key: 'appr|' + item.id + '|' + s(item.claim), sentTo: to });
    if (!g.ok) return { ok: false, error: g.error };
    const r = await giftMail(to, mem, g, item.editedAt ? introFromText(item.text) : '', s(item.subject), item.cc);
    if (!r.ok) { await voidCard(g.card.id, 'system', 'the e-mail did not go out'); return { ok: false, error: 'The gift code e-mail did not go out (' + r.why + ') — the credit is back on the balance; approve it again.' }; }
    return { ok: true, cardId: g.card.id };
  }
  /* refcredit: the credit is the point; the e-mail tells them (when there is an address) */
  const amount = clamp(m.amount);
  const e = await earn({ memberId: mem.id, memberName: mem.name, amount, by: by, note: m.manual ? (s(m.note) || 'Added by hand') : 'Referral: ' + s(m.referredName), referralId: m.referralId, referredName: m.referredName, approvalId: item.id });
  if (m.referralId) { try { await patchReferral(m.referralId, function(r){ r.status = 'credited'; r.ledgerId = e.entry.id; r.creditedAt = nowIso(); r.credit = amount; }); } catch (x) {} }
  const to = low(item.to);
  if (isEmail(to) && !e.already) {
    const intro = item.editedAt ? introFromText(item.text) : introFor(mem.name, m.referredName ? 'Thank you for referring ' + (first(m.referredName) || 'a friend') + ' to GrayCo Construction Services! ' + money(amount) + ' of GrayCo credit has been added to your account.' : (s(m.note) || money(amount) + ' of GrayCo credit has been added to your account.'));
    await mailMember(to, s(item.subject) || 'You earned ' + money(amount) + ' in GrayCo credit', creditHtml({ amount, balance: e.balance, intro }), intro + '\n\n+' + money(amount) + ' GrayCo credit. Your balance: ' + money(e.balance) + '. Credits stack and never expire.', item.cc);
  }
  return { ok: true, credited: amount, balance: e.balance };
}
/* an admin changes a waiting credit / gift code's amount */
async function setAmount(approvalId, amount, by){
  let a = 0, hit = null;
  const r = await core().kvListUpdate(core().AQ_KEY, function(l){
    const x = l.find(function(y){ return s(y.id) === s(approvalId) && (y.kind === 'refcredit' || y.kind === 'refgift'); }); if (!x || x.status !== 'waiting') return null;
    a = x.kind === 'refcredit' ? clamp(amount) : cents(amount);
    x.meta = Object.assign({}, x.meta, { amount: a, amountBy: clip(by, 80), amountAt: nowIso() });
    x.subject = s(x.subject).replace(/\$[\d,.]+/, money(a));
    x.html = s(x.html).replace(/\+\$[\d,.]+ GrayCo credit/, '+' + money(a) + ' GrayCo credit').replace(/Gift code · \$[\d,.]+/, 'Gift code · ' + money(a)).replace(/Good for \$[\d,.]+ toward/g, 'Good for ' + money(a) + ' toward').replace(/\$[\d,.]+ of GrayCo credit has been added/, money(a) + ' of GrayCo credit has been added');
    x.text = s(x.text).replace(/\$[\d,.]+/g, money(a));
    x.updatedAt = nowIso(); hit = x;
    return { list: l, check: function(l2){ const z = l2.find(function(y){ return s(y.id) === s(approvalId); }); return !!(z && z.meta && z.meta.amount === a); }, result: x };
  });
  return r && r.ok && hit ? { ok: true, amount: a } : { ok: false, error: 'That one is not waiting for approval any more.' };
}

/* ── joining (website / portal / CRM) and referring ───────────────────────── */
/* o: { name, email, phone, how, source, pid, by, referred: { name, email, phone, address, city, state, zip, note } } */
async function join(o){
  const st = await settings();
  const j = await upsertMember(o);
  const m = j.member, out = { member: pubMember(m, st), created: j.created };
  const rf = o.referred || {};
  if (s(rf.name) && (isEmail(rf.email) || phone10(rf.phone).length === 10)) {
    out.referral = await refer(m, rf, { via: o.source || 'website', by: o.by, how: o.source === 'portal' ? 'from the customer portal (referral program)' : 'from the referral program on the website' });
  } else if (j.created) {
    try { await mailAdmins('🤝 New referral program member: ' + m.name, [m.name + ' joined the GrayCo referral program (' + (o.source || 'website') + ').', [m.email, m.phone].filter(Boolean).join(' · '), m.how ? 'How they know us: ' + m.how : '', 'Member code ' + m.code + ' — their link: ' + memberLink(m, st)].filter(Boolean)); } catch (e) {}
  }
  return out;
}
async function refer(m, rf, opt){
  opt = opt || {};
  if (!s(rf.name)) throw plain('Add the name of the person you are referring.');
  if (!isEmail(rf.email) && phone10(rf.phone).length !== 10) throw plain('Add their phone number or e-mail so we can reach them.');
  const lead = await referralLead(m, rf, opt.how);
  const r = await addReferral({ member: m, name: rf.name, email: rf.email, phone: rf.phone, address: [rf.address, rf.city, rf.state, rf.zip].filter(Boolean).join(', '), note: rf.note, leadId: lead.id, via: opt.via, by: opt.by });
  return { id: r.referral.id, leadId: lead.id, duplicate: lead.action !== 'added' || !r.created };
}
/* "🎁 Refer a friend" in the customer portal (portal-sign.js, patch AUTO5): the customer who referred is enrolled in the
   program (if they are not yet) and the friend's lead counts as their referral — credit follows when the friend pays */
async function fromPortalReferral(p, friend, leadId){
  const cu = custOf(p);
  if (!cu.name || (!isEmail(cu.email) && phone10(cu.phone).length !== 10)) return null;
  const j = await upsertMember({ name: cu.name, email: cu.email, phone: cu.phone, how: 'GrayCo customer', source: 'portal', pid: s(p.id), by: 'customer portal (Refer a friend)' });
  return (await addReferral({ member: j.member, name: friend.name, email: friend.email, phone: friend.phone, address: friend.address, note: friend.note, leadId: s(leadId), via: 'portal', by: 'customer portal' })).referral;
}
/* a lead the website made with ?ref=R-XXXXXX (any form): record the referral */
async function fromRefCode(code, f, lead){
  const m = await memberByCode(code); if (!m || !lead) return null;
  return (await addReferral({ member: m, name: f.name, email: f.email, phone: f.phone, address: f.address, note: 'Came in through ' + m.name + '’s referral link.', leadId: lead.id, via: 'link' })).referral;
}

/* ── the sweep (referral.js, hourly): referrals → their job → the first payment → credit proposed ── */
function projOf(data){ const dead = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ dead[s(x && typeof x === 'object' ? x.id : x)] = 1; }); return arr(data.projects).filter(function(p){ return p.id && !dead[s(p.id)] && p.deleted !== true; }); }
function pidOfInv(r){ return s(r && (r.pid || r.projectId || r.jobId || r.project_id)); }
function invoicesOf(data, p){ const seen = {}; return arr(data.invs).concat(arr(data.invoices)).filter(function(r){ const id = s(r.id); if (id && seen[id]) return false; if (id) seen[id] = 1; return pidOfInv(r) === s(p.id) || (!pidOfInv(r) && low(r.projectName || r.project || r.jobName) === low(p.name) && !!s(p.name)); }); }
function customerInv(r){ try { return core().isCustomerInvoice(r); } catch (e) { return !/sub|vendor|bill|expense|cost/.test(low(r.type)); } }
/* real money in (a payment made with credit or a gift code does not count as the referred customer paying) */
function paidSum(r){ return arr(r.payments).filter(function(x){ return !/gift|credit/i.test(s(x.method)); }).reduce(function(t, x){ return t + num(x.amount); }, 0) || num(r.amountPaid || r.paidAmount) || (typeof r.paid === 'number' ? r.paid : 0); }
function hasPayment(data, p){ return invoicesOf(data, p).some(function(r){ return customerInv(r) && (paidSum(r) > 0 || (/paid/.test(low(r.status)) && !/unpaid|partial/.test(low(r.status))) || r.paidInFull === true || r.paid === true); }); }
function contractOf(p){ return num(p.contract || p.contractAmount || p.contractValue || p.contractTotal || p.amount); }
function signed(p){ return !!(p.contractSigned || p.signedAt || p.signed === true || /active|in progress|scheduled|complete|signed|sold|won/i.test(s(p.status))) && contractOf(p) > 0; }
function created(p){ return Date.parse(s(p.created || p.createdAt || p.startDate || p.date)) || 0; }
/* the referred person's job: the Lead Inbox says (lead → job), or the same e-mail / phone / street, made after the referral */
function matchJob(data, r, inbox){
  const list = projOf(data);
  if (r.leadId) { const it = arr(inbox).find(function(x){ return x.id === r.leadId; }); if (it && s(it.pid)) { const p = list.find(function(x){ return s(x.id) === s(it.pid); }); if (p) return p; } }
  const e = low(r.email), ph = phone10(r.phone), sk = streetKey(r.address), since = (Date.parse(r.createdAt) || 0) - 3 * 86400000;
  const hits = list.filter(function(p){
    if (created(p) && created(p) < since) return false;
    const pe = [p.clientEmail, p.customerEmail, p.email, p.contactEmail].map(low), pp = [p.clientPhone, p.customerPhone, p.phone, p.contactPhone, p.cell].map(phone10);
    return (e && pe.indexOf(e) >= 0) || (ph.length === 10 && pp.indexOf(ph) >= 0) || (sk && streetKey(p.address || p.jobAddress) === sk);
  });
  hits.sort(function(a, b){ return created(b) - created(a); });
  return hits[0] || null;
}
/* "Referred by" typed on a CRM lead (Leads tab) that names a member → a referral, once */
function crmLeadReferrals(data, mems){
  const out = [];
  arr(data.leads).forEach(function(l){
    if (!l.id || l.deleted || l._deleted) return;
    const rb = low(l.referredBy || l.referrer || l.referredByEmail);
    if (!rb) return;
    const m = mems.find(function(x){ return low(x.name) === rb || (x.email && low(x.email) === rb) || low(l.referredByMember) === low(x.id); });
    if (m) out.push({ member: m, lead: l });
  });
  return out;
}
async function sweep(opt){
  opt = opt || {};
  const st = await settings(), out = { proposed: 0, matched: 0, linked: 0, checked: 0 };
  if (st.trigger === 'manual' && !opt.force) return Object.assign(out, { manual: true });
  const data = opt.data || await core().crmData(true);
  const mems = await members();
  for (const x of crmLeadReferrals(data, mems)) {
    const l = x.lead, c = l.contact || {};
    const r = await addReferral({ member: x.member, name: l.contactName || c.name || l.client || l.name, email: l.email || c.email || l.clientEmail, phone: l.phone || c.phone || l.clientPhone, address: l.address,
      crmLeadId: s(l.id), leadId: s(l.inboxId ? l.inboxId : ''), via: 'crm', note: 'From "Referred by" on the CRM lead ' + s(l.name) });
    if (r.created) out.linked++;
  }
  let inbox = []; try { inbox = arr(await L().kvGet(L().KV)); } catch (e) {}
  for (const r of await referrals()) {
    if (r.ledgerId || r.approvalId || r.status === 'credited' || r.status === 'closed') continue;
    out.checked++;
    const p = matchJob(data, r, inbox);
    if (!p) continue;
    if (s(r.pid) !== s(p.id)) { await patchReferral(r.id, function(z){ z.pid = s(p.id); z.jobName = s(p.name); z.status = 'job'; z.jobAt = z.jobAt || nowIso(); }); out.matched++; }
    const m = mems.find(function(x){ return x.id === r.memberId; }); if (!m) continue;
    /* patch AUTOC 5 (owner 10/29 "yes 18"): the referred lead became a job (won) → the credit is RECORDED and the member
       thanked by themselves (e-mail + a text when they have a mobile with consent). Admin → Referral settings autoThanks:false
       brings back the approval proposal below. Waits (marks nothing) while data-entry mode is on; never for history jobs. */
    if (st.autoThanks && wonJob(data, p) && !(p.importedHistory === true || p.noSend === true || p.historyOnly === true)) {
      let paused = true; try { paused = await require('./pause').isPaused(); } catch (e) {}
      if (paused) { out.waiting = (out.waiting || 0) + 1; continue; }
      const at = await autoThank({ member: m, referral: r, p: p, data: data, settings: st });
      if (at.ok) out.thanked = (out.thanked || 0) + 1;
      continue;
    }
    const ready = st.trigger === 'signed' ? signed(p) || hasPayment(data, p) : hasPayment(data, p);
    if (!ready) continue;
    const pr = await propose({ member: m, referral: r, contract: contractOf(p), pid: p.id, settings: st, by: 'automatic (' + (st.trigger === 'signed' ? 'contract signed' : 'first payment') + ')' });
    if (pr.ok) { await patchReferral(r.id, function(z){ z.status = 'paid'; z.approvalId = pr.id; z.proposedAt = nowIso(); z.suggested = pr.amount; z.pid = s(p.id); }); out.proposed++; }
  }
  return out;
}

/* patch AUTOC 5: "won" = a signed / sold / active job, or one that took a payment */
function wonJob(data, p){ return !!(p.contractSigned || p.signedAt || p.contractSignedAt || p.signed === true || /^(won|sold|signed|contract|approved|active|in[ _-]?progress|scheduled|complete|completed|closed)$/i.test(s(p.status))) || hasPayment(data, p); }
function thanksText(m, r, amount, bal){ return 'Hi ' + (first(m.name) || 'there') + ', thank you for referring ' + (first(r.name) || 'a friend') + ' to us! ' + money(amount) + ' of GrayCo credit is now on your account (balance ' + money(bal) + '). Use it on any GrayCo work or gift it to family.'; }
async function autoThank(o){
  const m = o.member, r = o.referral, p = o.p, amount = clamp(suggest(contractOf(p), o.settings));
  const e = await earn({ memberId: m.id, memberName: m.name, amount, by: 'automatic (referred job won)', note: 'Referral: ' + s(r.name), referralId: r.id, referredName: r.name, approvalId: 'auto_refcredit_' + r.id });
  await patchReferral(r.id, function(z){ z.status = 'credited'; z.ledgerId = e.entry && e.entry.id; z.creditedAt = z.creditedAt || nowIso(); z.credit = amount; z.pid = s(p.id); z.auto = true; });
  if (e.already) return { ok: true, already: true };
  const res = { ok: true, amount, balance: e.balance };
  const intro = introFor(m.name, 'Thank you for referring ' + (first(r.name) || 'a friend') + ' to GrayCo Construction Services! ' + money(amount) + ' of GrayCo credit has been added to your account.');
  if (isEmail(m.email)) { try { res.mail = await mailMember(low(m.email), 'Thank you! ' + money(amount) + ' in GrayCo credit for your referral', creditHtml({ amount, balance: e.balance, intro }), intro + '\n\n+' + money(amount) + ' GrayCo credit. Your balance: ' + money(e.balance) + '. Credits stack and never expire.'); } catch (x) { res.mail = { ok: false }; } }
  try { const CT = require('./custtext.js'); res.text = await CT.send({ ph: phone10(m.phone), text: thanksText(m, r, amount, e.balance), data: o.data, kind: 'refthanks', id: r.id, who: 'referral thank-you' }); } catch (x) { res.text = { ok: false, why: s(x && x.message) }; }
  /* a text that could not go now (after hours …) is not retried — the e-mail is the thank-you of record */
  try { await patchReferral(r.id, function(z){ z.thanksAt = nowIso(); z.thanksMail = !!(res.mail && res.mail.ok); z.thanksText = !!(res.text && res.text.ok); }); } catch (x) {}
  try { await mailAdmins('🎁 Referral credit recorded — ' + m.name + ' (+' + money(amount) + ')', [m.name + ' referred ' + s(r.name) + ', whose job "' + s(p.name) + '" is won. ' + money(amount) + ' of credit was recorded automatically (owner rule 10/29); their balance is ' + money(e.balance) + '.', 'Thank-you e-mail: ' + (res.mail && res.mail.ok ? 'sent' : 'not sent') + ' · text: ' + (res.text && res.text.ok ? 'sent' : 'not sent' + (res.text && res.text.why ? ' (' + res.text.why + ')' : '')) + '.']); } catch (x) {}
  return res;
}

/* ── the customer portal (portal.js action "referral"; the job comes from the link / session) ── */
function custOf(p){ return { name: s(p.client || p.customer || p.clientName), email: low(p.clientEmail || p.customerEmail || p.email), phone: s(p.clientPhone || p.customerPhone || p.phone) }; }
async function memberForJob(p){ const cu = custOf(p); return (await members()).find(function(x){ return (x.pid && x.pid === s(p.id)) || sameMember(x, cu); }) || null; }
function historyLine(e){
  const a = money(Math.abs(num(e.amount)));
  if (e.type === 'earn') return { at: e.at, amount: num(e.amount), text: e.referredName ? 'Earned ' + a + ' — you referred ' + shortName(e.referredName) : 'Earned ' + a + (s(e.note) && !/^Added by hand$/.test(e.note) ? ' — ' + clip(e.note, 80) : '') };
  if (e.type === 'apply') return { at: e.at, amount: num(e.amount), text: 'Used ' + a + ' on your GrayCo project' };
  if (e.type === 'gift') return { at: e.at, amount: num(e.amount), text: 'Gift code …' + s(e.last4) + ' made (' + a + ')' };
  if (e.type === 'gift_void') return { at: e.at, amount: num(e.amount), text: 'Gift code …' + s(e.last4) + ' cancelled — ' + a + ' back' };
  return { at: e.at, amount: num(e.amount), text: (num(e.amount) >= 0 ? 'Added ' : 'Removed ') + a + (s(e.note) ? ' — ' + clip(e.note, 80) : '') };
}
async function portalState(p){
  const st = await settings(), cu = custOf(p), m = await memberForJob(p);
  const out = { ok: true, program: { min: MIN, max: MAX, giftMin: GIFT_MIN, text: 'Every friend you refer earns you $100–$500 in GrayCo credit. Credits stack and never expire — put them toward your kitchen, bathroom, floors, roof, maintenance or remodel, or turn them into a gift code for family.' },
    member: null, balance: 0, history: [], referrals: [], codes: [], you: { name: cu.name, email: cu.email, phone: cu.phone } };
  if (!m) return out;
  const led = await ledger();
  out.member = { code: m.code, name: m.name, link: memberLink(m, st), since: m.createdAt, email: m.email };
  out.balance = balanceOf(led, m.id);
  out.history = led.filter(function(e){ return e.memberId === m.id; }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }).slice(0, 50).map(historyLine);
  out.referrals = (await referrals()).filter(function(r){ return r.memberId === m.id; }).map(function(r){ return { name: shortName(r.name), at: r.createdAt, status: r.status === 'credited' ? 'Credit earned' + (r.credit ? ' (' + money(r.credit) + ')' : '') : r.status === 'paid' ? 'Hired us — credit on its way' : r.status === 'job' ? 'Working with GrayCo' : 'Referred' }; });
  out.codes = (await cards()).filter(function(c){ return c.memberId === m.id && /issued|redeemed|void/.test(c.status); }).map(function(c){ return { last4: c.last4, amount: c.amount, status: c.status, issuedAt: c.issuedAt, usedAt: s(c.redeemedAt) }; });
  return out;
}
/* body: { op: 'state' | 'join' | 'refer' | 'gift' | 'use' | 'redeem', … } */
async function portal(data, p, body, ctx){
  ctx = ctx || {};
  const op = s(body.op) || 'state';
  try {
    if (op === 'state') return { code: 200, body: await portalState(p) };
    if (op === 'join' || op === 'refer') {
      const cu = custOf(p);
      const j = await upsertMember({ name: s(body.name) || cu.name, email: s(body.email) || cu.email, phone: s(body.phone) || cu.phone, how: s(body.how) || 'GrayCo customer', source: 'portal', pid: s(p.id), by: 'customer portal' });
      if (op === 'refer') await refer(j.member, body.referred || {}, { via: 'portal', by: 'customer portal', how: 'from the customer portal (referral program)' });
      else if (j.created) { try { await mailAdmins('🤝 New referral program member: ' + j.member.name, [j.member.name + ' joined the referral program from their customer portal (job ' + s(p.name) + ').', 'Member code ' + j.member.code + '.']); } catch (e) {} }
      return { code: 200, body: Object.assign(await portalState(p), { done: op === 'refer' ? 'Thank you! We will reach out to them — and you earn GrayCo credit when they hire us.' : 'You are in the GrayCo referral program.' }) };
    }
    const m = await memberForJob(p);
    if (op === 'gift') {
      if (!m) return { code: 400, body: { ok: false, error: 'Join the referral program first.' } };
      if (!isEmail(m.email)) return { code: 400, body: { ok: false, error: 'We need your e-mail address on file to send the gift code — call GrayCo ' + OFFICE + '.' } };
      const g = await makeGift({ member: m, amount: body.amount, by: m.name + ' (customer portal)', via: 'portal', sentTo: m.email, key: s(body.nonce) ? 'portal|' + m.id + '|' + clip(body.nonce, 40) : '' });
      if (!g.ok) return { code: g.code || 409, body: { ok: false, error: g.error } };
      await giftMail(m.email, m, g);
      return { code: 200, body: Object.assign(await portalState(p), { gift: { code: g.code, amount: g.card.amount }, done: 'Your ' + money(g.card.amount) + ' gift code is ready — it is shown here once and e-mailed to ' + m.email + '. ' + money(g.balance) + ' of credit is left.' }) };
    }
    if (op === 'use') {   /* a customer asks to use their credit on this job: the office applies it */
      if (!m) return { code: 400, body: { ok: false, error: 'Join the referral program first.' } };
      const bal = await balance(m.id), want = Math.min(cents(body.amount) || bal, bal);
      if (!(want > 0)) return { code: 400, body: { ok: false, error: 'You have no GrayCo credit yet.' } };
      await core().officeTodo('refuse_' + s(p.id) + '_' + Math.floor(now() / 3600000), '🎁 ' + m.name + ' asks to use ' + money(want) + ' of referral credit on ' + s(p.name), 'Marketing → 🎁 Referral program → Use credit: member ' + m.name + ' (' + m.code + '), job ' + s(p.name) + ', ' + money(want) + ' (balance ' + money(bal) + ').');
      return { code: 200, body: Object.assign(await portalState(p), { done: 'Got it — the GrayCo office will put ' + money(want) + ' of your credit on this job and you will see it on your invoice.' }) };
    }
    if (op === 'redeem') return await redeem({ code: body.code, pid: s(p.id), invoiceId: '', by: 'customer (portal)', via: 'portal', who: 'ip:' + s(ctx.ip) });
    return { code: 400, body: { ok: false, error: 'Bad request' } };
  } catch (e) {
    if (e && e.plain) return { code: 400, body: { ok: false, error: e.plain } };
    return { code: 503, body: { ok: false, error: 'We could not do that just now — please try again, or call GrayCo ' + OFFICE + '.' } };
  }
}

/* ── the CRM's view (Marketing → 🎁 Referral program) ─────────────────────── */
async function overview(){
  /* patch REFWHY: a part that cannot be read counts as empty (and is named), the answer still comes */
  const degraded = [];
  const safe = function(name, p, dflt){ return Promise.resolve().then(function(){ return p(); }).catch(function(e){ degraded.push(name + ': ' + s(e && e.message).slice(0, 80)); return dflt; }); };
  const st = await safe('settings', settings, cleanSettings(null));
  const [mems, refs, cs, led] = await Promise.all([safe('members', members, []), safe('referrals', referrals, []), safe('cards', cards, []), safe('ledger', ledger, [])]);
  let waiting = [];
  try { const cur = await core().kvListRead(core().AQ_KEY); waiting = arr(cur && cur.list).filter(function(x){ return (x.kind === 'refcredit' || x.kind === 'refgift') && x.status === 'waiting'; }).map(function(x){ const mm = x.meta || {}; return { id: x.id, kind: x.kind, to: x.to, amount: num(mm.amount), memberId: s(mm.memberId), memberName: s(mm.memberName), referredName: s(mm.referredName), contract: num(mm.contract), createdAt: x.createdAt }; }); } catch (e) {}
  const live = cs.filter(function(c){ return c.status === 'issued'; });
  const balances = mems.map(function(m){ return balanceOf(led, m.id); });
  return {
    degraded: degraded,   /* patch REFWHY */
    settings: st, min: MIN, max: MAX, giftMin: GIFT_MIN,
    members: mems.map(function(m, i){ const mine = refs.filter(function(r){ return r.memberId === m.id; });
      return Object.assign(pubMember(m, st), { referrals: mine.length, hired: mine.filter(function(r){ return /job|paid|credited/.test(r.status); }).length, balance: balances[i],
        earned: cents(led.filter(function(e){ return e.memberId === m.id && e.type === 'earn'; }).reduce(function(t, e){ return t + num(e.amount); }, 0)) }); })
      .sort(function(a, b){ return s(b.createdAt).localeCompare(s(a.createdAt)); }),
    referrals: refs.slice().sort(function(a, b){ return s(b.createdAt).localeCompare(s(a.createdAt)); }),
    ledger: led.slice().sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }).slice(0, 300).map(pubEntry),
    cards: cs.filter(function(c){ return /issued|redeemed|void/.test(c.status); }).map(pubCard).sort(function(a, b){ return s(b.issuedAt).localeCompare(s(a.issuedAt)); }),
    waiting,
    totals: { members: mems.length, referrals: refs.length, hired: refs.filter(function(r){ return /job|paid|credited/.test(r.status); }).length,
      earned: cents(led.filter(function(e){ return e.type === 'earn'; }).reduce(function(t, e){ return t + num(e.amount); }, 0)),
      used: cents(-led.filter(function(e){ return e.type === 'apply'; }).reduce(function(t, e){ return t + num(e.amount); }, 0)),
      balances: cents(balances.reduce(function(t, b){ return t + b; }, 0)),
      codesOut: live.length, codesValue: cents(live.reduce(function(a, c){ return a + c.amount; }, 0)),
      codesUsed: cs.filter(function(c){ return c.status === 'redeemed'; }).length,
      liability: cents(balances.reduce(function(t, b){ return t + b; }, 0) + live.reduce(function(a, c){ return a + c.amount; }, 0)) }
  };
}
async function lookup(last4){ const q = s(last4).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-4); if (q.length !== 4) return []; return (await cards()).filter(function(c){ return c.last4 === q && /issued|redeemed|void/.test(c.status); }).map(pubCard); }

module.exports = { wonJob, autoThank, thanksText, K, MIN, MAX, GIFT_MIN, RL, DEFAULTS, AD_COPY, normCode, cardHash, newCardCode, newMemberCode, normMemberCode, cleanSettings, settings, saveSettings, suggest, upsertMember, members, memberById, memberByCode, addReferral, referrals, patchReferral,
  join, refer, fromRefCode, fromPortalReferral, propose, proposeGift, onApproved, earn, deduct, applyCredit, balance, ledger, makeGift, check, redeem, pending, claimApply, markApplied, voidCard, sweep, setAmount, portal, portalState, overview, lookup,
  matchJob, hasPayment, cardHtml, creditHtml, memberLink, clamp, introFromText, adForAutopilot };
/* patch LOGOALL (owner 10/23: "should have our logo on it"): every customer / sub / GC e-mail this file sends
   straight to Resend gets the GrayCo shell (centered logo, office line, licenses). Internal @grayco-cs.com mail is untouched. */
try { require('./brand.js').installResend(); } catch (e) {}
