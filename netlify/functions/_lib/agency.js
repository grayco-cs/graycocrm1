/* ── GrayCo marketing AGENCY portal — the server side (patch AGY) ───────────────────────────────────────────────────
   Owner (10/23): "i want to build all of this so it works and malcolm can use and help manage and run it" — the
   marketing agency (AdVentures Media: Malcolm and team) gets its own page at crm.grayco-cs.com/agency, NOT a CRM
   sign-in: a CRM sign-in reads every customer, job and invoice. The agency page shows marketing numbers only.

   WHO GETS IN
   * Agency people: an admin adds them on the page (👥 Team), or AGENCY_EMAILS on Netlify (comma list) seeds them.
     They sign in with a link e-mailed to them (good for 1 hour) that becomes a 14-day session on that browser.
     Turning a person off (or taking them out of AGENCY_EMAILS) locks them out on their next click.
   * GrayCo staff: the CRM's own sign-in (same site, same browser) — admins also manage the team and the settings.

   WHAT THE AGENCY SEES (nothing that names a customer)
   * Results by lead source (from the CRM's own marketing math, _lib/mkcalc.js — the same numbers as Marketing →
     Dashboard): leads, appointments, estimates, jobs won, ad spend, cost per lead, cost per job. Revenue and return per
     dollar only when "Share revenue" is on (Settings, on by default); gross profit only when "Share profit" is on (off).
   * Recent leads as source · campaign · city/ZIP · stage — no name, no street, no phone.
   * Calls on the tracking numbers (Twilio + CallRail): source and time, the caller's last 4 digits only.
   * The marketing plan (what is done, who owns it, notes), the spend log, setup status, and notes back and forth.

   WHAT THE AGENCY CAN CHANGE
   * The plan: status, owner, due date, notes; add items. (Deleting an item: admins.)
   * Spend: add a month's spend for a channel (LSA, Google Ads management fee, print …) — it goes into the CRM's
     Marketing spend records (gc_mkt_v1 "spend", origin "agency"), so the CRM's dashboard counts it too. The agency
     can remove only what the agency entered.
   * Notes: a message to GrayCo (the admins get an e-mail), and GrayCo's notes e-mail the agency.
   Nothing here sends anything to customers and nothing changes an ad: ad changes stay in the CRM's 📈 Ads hub and
   go through ✅ Approvals.

   STORAGE: service-only gc_lead_inbox_kv "gc_agency_v1" = { members: { email: {…} }, plan: { id: {…} },
   notes: [ … ], settings: { shareRevenue, shareProfit, reportTo }, log: [ … ] }. Sessions are signed (HMAC), not stored.
   ENV: AGENCY_EMAILS (seed list), AGENCY_SECRET (optional; else derived from the service key), RESEND_API_KEY,
   OWNER_EMAILS, CRM_URL. */
'use strict';
const crypto = require('crypto');

const KEY = 'gc_agency_v1';
const LINK_MINUTES = 60, SESSION_DAYS = 14;
const STATUSES = ['todo', 'doing', 'waiting', 'done', 'skip'];
const OWNERS = ['GrayCo', 'Agency', 'CRM'];
const CHANNEL_CHOICES = ['Google Ads', 'Local Services Ads', 'Facebook/Instagram Ads', 'Google Business Profile', 'Nextdoor', 'Yard sign', 'Door hanger / postcard',
  'Agency fee', 'Call tracking (CallRail / Twilio)', 'Website', 'Other'];

/* the plan from the 10/22 website audit meeting and the follow-up (owner, 10/23) — seeded once, then edited on the page */
const PLAN_SEED = [
  { id: 'p01', phase: 1, owner: 'GrayCo', title: 'Deploy the search-ready website (page addresses, sitemap, business details)', how: 'website/README.md → Deploying. Link the grayco-cs.com Netlify site to this repo, base directory "website".' },
  { id: 'p02', phase: 1, owner: 'GrayCo', title: 'Google Search Console: verify by DNS, submit sitemap.xml, request indexing', how: 'website/SEO-SETUP.md step 2. Add the agency as a user (Settings → Users and permissions).' },
  { id: 'p03', phase: 1, owner: 'GrayCo', title: 'Bing Webmaster Tools: import from Google Search Console', how: 'website/SEO-SETUP.md step 3.' },
  { id: 'p04', phase: 1, owner: 'CRM', title: 'Website contact form sends every lead to the CRM with its source', how: 'Built (patch AGY). Done when the first website lead shows up here.', auto: 'website_lead' },
  { id: 'p05', phase: 1, owner: 'GrayCo', title: 'Twilio tracking numbers: one per source (truck, flyers, yard signs, Business Profile)', how: 'CRM → Marketing → 🔗 Tracked links, QR & numbers.', auto: 'twilio' },
  { id: 'p06', phase: 1, owner: 'Agency', title: 'Google Analytics 4: create the property, put the G- ID in the website editor', how: 'Website gear → Footer, Google & social links → Google Analytics Measurement ID. Give GrayCo admin access.' },
  { id: 'p07', phase: 1, owner: 'GrayCo', title: 'Website editor: set ADMIN_PASSWORD and ADMIN_EMAILS on Netlify', how: 'website/README.md → Editing from the website itself. Add the agency addresses to ADMIN_EMAILS.' },
  { id: 'p08', phase: 2, owner: 'Agency', title: 'GMB Everywhere audit: competitor categories, map rank by town, review gap', how: 'Post the findings in Notes: top 3 competitors per search, their categories, review counts.' },
  { id: 'p09', phase: 2, owner: 'Agency', title: 'Google Business Profile: categories, services, description, photos, service areas', how: 'Tracking number as primary, (901) 585-0944 as additional. Name / address / phone exactly as on the website.' },
  { id: 'p10', phase: 2, owner: 'GrayCo', title: 'Local Services Ads: apply (license, insurance, background checks)', how: 'Categories: General Contractor, Water Damage, Restoration. Log the weekly budget in Spend as "Local Services Ads".', auto: 'lsa' },
  { id: 'p11', phase: 2, owner: 'GrayCo', title: 'Reviews: review blitz from the CRM, match the top competitor\'s monthly pace', how: 'CRM → Marketing → 🧭 Marketing coach → review blitz.' },
  { id: 'p12', phase: 2, owner: 'Agency', title: 'Link Search Console ↔ Analytics ↔ Google Ads', how: 'Analytics → Admin → Product links.' },
  { id: 'p13', phase: 3, owner: 'Agency', title: 'Google Ads: commercial + restoration campaigns, connected to the CRM Ads hub', how: 'CRM admin: Marketing → 📈 Ads hub → Connect Google Ads. Final URL suffix utm_source=google&utm_medium=cpc&utm_campaign={campaignid}.', auto: 'gads' },
  { id: 'p14', phase: 3, owner: 'GrayCo', title: 'CallRail: sign up the month Google Ads starts; webhook to the CRM', how: 'docs/CALLRAIL.md. Website number swap + calls sent to Google Ads as conversions.', auto: 'callrail' },
  { id: 'p15', phase: 3, owner: 'Agency', title: 'Town / service pages where GrayCo ranks poorly on the map', how: 'e.g. Water Damage Collierville, General Contractor Germantown. Text goes through the website editor.' },
  { id: 'p16', phase: 4, owner: 'CRM', title: 'Monthly marketing report e-mailed on the 1st (admins, agency, bookkeeper)', how: 'Built (patch AGY). Settings → report recipients.', auto: 'report' },
  { id: 'p17', phase: 4, owner: 'GrayCo', title: 'QuickBooks: one expense account per marketing channel', how: 'Google Ads, LSA, Agency, Print, Call tracking — so the report matches the books.' },
  { id: 'p18', phase: 4, owner: 'GrayCo', title: 'Monthly 30-minute review with the agency using the report', how: 'Keep what pays, cut what does not. Notes from the meeting go in Notes.' },
];

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function num(v){ const x = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function clip(v, n){ return s(v).slice(0, n); }
function env(k){ return s(process.env[k]); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }
let nowFn = function(){ return Date.now(); };
function nowIso(){ return new Date(nowFn()).toISOString(); }
function site(){ return (env('CRM_URL') || 'https://crm.grayco-cs.com').replace(/\/$/, ''); }
function L(){ return require('../bid-inbox.js')._lib; }
function M(){ return require('./mkt.js'); }
function X(){ return require('./mkt2.js'); }
function C(){ return require('./mkcalc.js'); }
function money(v){ return '$' + Math.round(num(v)).toLocaleString('en-US'); }
function monthName(m){ const d = new Date(m + '-15T12:00:00Z'); return isNaN(d) ? m : d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
function prevMonth(iso){ const d = new Date(iso.slice(0, 7) + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); }

/* ── signing ── */
function secret(){ const own = env('AGENCY_SECRET'); const k = own.length >= 16 ? own : (env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')); return k ? crypto.createHmac('sha256', k).update('gc-agency-v1').digest() : null; }
function sign(body){ const k = secret(); return k ? crypto.createHmac('sha256', k).update(body).digest('base64url') : ''; }
function same(a, b){ a = Buffer.from(s(a)); b = Buffer.from(s(b)); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }
function makeToken(kind, email, ms){ const body = Buffer.from(JSON.stringify({ k: kind, e: low(email), x: nowFn() + ms })).toString('base64url'); const sig = sign(body); return sig ? body + '.' + sig : ''; }
function readToken(kind, t){
  t = s(t); const i = t.lastIndexOf('.'); if (i < 1) return null;
  const body = t.slice(0, i); if (!same(t.slice(i + 1), sign(body))) return null;
  let o; try { o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!o || o.k !== kind || !okEmail(o.e) || !(o.x > nowFn())) return null;
  return { email: o.e, exp: o.x };
}

/* ── the record ── */
function seedMembers(){ const out = {}; env('AGENCY_EMAILS').split(',').map(low).filter(okEmail).forEach(function(e){ out[e] = { email: e, name: '', company: 'Agency', active: true, addedBy: 'AGENCY_EMAILS', addedAt: nowIso() }; }); return out; }
function blank(){
  const plan = {}; PLAN_SEED.forEach(function(p, i){ plan[p.id] = Object.assign({ status: 'todo', due: '', notes: '', order: i, at: nowIso(), by: 'GrayCo' }, p); });
  return { members: {}, plan: plan, notes: [], settings: { shareRevenue: true, shareProfit: false, reportTo: '' }, log: [], seeded: nowIso() };
}
function norm(v){ v = v && typeof v === 'object' ? v : blank(); v.members = v.members || {}; v.plan = v.plan || {}; v.notes = arr(v.notes); v.settings = Object.assign({ shareRevenue: true, shareProfit: false, reportTo: '' }, v.settings || {}); v.log = arr(v.log); return v; }
async function read(){ return norm(await L().kvGet(KEY)); }
async function change(fn){
  let out;
  const r = await L().kvCas(KEY, function(v){ v = norm(v); out = fn(v); return out === false ? undefined : v; });
  if (r && r.ok === false) throw new Error('Could not save — try again.');
  return out;
}
function logIt(v, who, what){ v.log.push({ at: nowIso(), by: who.email, what: clip(what, 200) }); v.log = v.log.slice(-300); }

/* members: the record's list, plus AGENCY_EMAILS (a seed — the record wins when it names the same person) */
function memberOf(v, email){ const e = low(email); const m = v.members[e] || seedMembers()[e]; return m && m.active !== false ? m : null; }
function memberList(v){ const all = Object.assign({}, seedMembers(), v.members); return Object.keys(all).sort().map(function(k){ return all[k]; }); }

/* ── who is asking: an agency session, or CRM staff (passed in from agency.js after the staff check) ── */
async function whoFromSession(t){
  const tk = readToken('session', t); if (!tk) return null;
  const v = await read(), m = memberOf(v, tk.email); if (!m) return null;
  return { kind: 'agency', email: tk.email, name: s(m.name) || tk.email, company: s(m.company) || 'Agency', admin: false };
}

/* ── sign-in link ── */
async function sendLink(email){
  email = low(email); if (!okEmail(email)) return { ok: true };
  const v = await read(), m = memberOf(v, email); if (!m) return { ok: true };   /* same answer either way: no list of who is a member */
  const key = env('RESEND_API_KEY'), t = makeToken('link', email, LINK_MINUTES * 60e3); if (!key || !t) return { ok: false, error: 'E-mail is not set up on the CRM (RESEND_API_KEY).' };
  const link = site() + '/agency?k=' + encodeURIComponent(t);
  const html = shell('Your GrayCo marketing portal', '<p>Hi ' + esc(s(m.name).split(/\s+/)[0] || 'there') + ',</p><p>Here is your sign-in link to the <b>GrayCo marketing portal</b> — results by lead source, the marketing plan, spend and calls.</p>' +
    '<p style="margin:22px 0"><a href="' + esc(link) + '" style="background:#D4A017;color:#0F1D2F;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open the portal</a></p>' +
    '<p style="color:#55626F;font-size:13px">The link works for ' + LINK_MINUTES + ' minutes and keeps you signed in on that browser for ' + SESSION_DAYS + ' days. Didn\'t ask for it? Ignore this e-mail.</p>');
  const ok = await mail([email], 'Your GrayCo marketing portal sign-in link', html, 'GrayCo Marketing <portal@grayco-cs.com>');
  return { ok: true, sent: ok };
}
function exchange(k){
  const tk = readToken('link', k); if (!tk) return null;
  return { session: makeToken('session', tk.email, SESSION_DAYS * 864e5), email: tk.email, expires: new Date(nowFn() + SESSION_DAYS * 864e5).toISOString() };
}

/* ── e-mail ── */
function shell(title, inner){
  return '<div style="font-family:Arial,sans-serif;max-width:640px"><div style="background:#0F1D2F;padding:14px 18px"><img src="' + site() + '/portal-logo.png" alt="GrayCo" style="height:40px;background:#fff;border-radius:6px;padding:2px"></div>' +
    '<div style="padding:16px 18px;color:#14202E"><h2 style="margin:0 0 12px;font-size:19px">' + esc(title) + '</h2>' + inner +
    '<p style="color:#55626F;font-size:12px;margin-top:24px">GrayCo Construction Services · ' + esc(require('./brand.js').companyAddress()) + '</p></div></div>';
}
async function mail(to, subject, html, from){
  const key = env('RESEND_API_KEY'); to = Array.from(new Set(arr(to).map(low).filter(okEmail))); if (!key || !to.length) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from || 'GrayCo Marketing <portal@grayco-cs.com>', reply_to: env('REPLY_TO_ADMIN') || 'replies@grayco-cs.com', to: to, subject: subject, html: html }) });
    return !!(r && r.ok);
  } catch (e) { return false; }
}
async function adminEmails(){
  const out = [];
  try { const r = await L().sb('gc_staff?select=email,role,active&role=eq.admin'); if (r.ok) arr(await r.json()).forEach(function(x){ if (x && x.active !== false && x.email) out.push(low(x.email)); }); } catch (e) {}
  (env('OWNER_EMAILS') || 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com').split(',').forEach(function(e){ out.push(low(e)); });
  return Array.from(new Set(out.filter(okEmail)));
}

/* ── the numbers ── */
async function crm(){
  const d = await M().crmData(['leads', 'projects', 'invs', 'invoices', 'expenses', 'estimates']);
  const seen = {}, invs = arr(d.invs).concat(arr(d.invoices)).filter(function(x){ if (!x || !x.id || seen[x.id]) return false; seen[x.id] = 1; return true; });
  return { leads: arr(d.leads), projects: arr(d.projects), invs: invs, expenses: arr(d.expenses), estimates: arr(d.estimates) };
}
async function summary(o){
  o = o || {};
  const [d, doc] = await Promise.all([crm(), M().readDoc()]);
  const fix = {}; Object.keys(doc.srcfix || {}).forEach(function(k){ const r = doc.srcfix[k]; if (r && !r.del && r.key && r.channel) fix[r.key] = r.channel; });
  const spend = Object.keys(doc.spend || {}).map(function(k){ return doc.spend[k]; }).filter(function(x){ return x && !x.del; });
  const sum = C().build({ leads: d.leads, projects: d.projects, invs: d.invs, expenses: d.expenses, estimates: d.estimates, spend: spend, srcfix: fix, now: s(o.now) || nowIso().slice(0, 10), monthsBack: o.months || 12 });
  return { sum: sum, spend: spend, doc: doc };
}
/* what the agency may see of a summary */
function share(sum, settings, months){
  const rev = settings.shareRevenue !== false, gp = settings.shareProfit === true;
  const ch = sum.channels.map(function(c){
    const r = { channel: c.channel, leads: c.leads, appts: c.appts, estimates: c.estimates, won: c.won, lost: c.lost, closeRate: c.closeRate, spend: c.spend, cpl: c.cpl, costPerWon: c.costPerWon,
      clicks: c.clicks, impressions: c.impressions, cpc: c.cpc, medianDaysToClose: c.medianDaysToClose };
    if (rev) { r.revenue = c.revenue; r.avgJob = c.avgJob; r.roas = c.roas; }
    if (gp) { r.gp = c.gp; r.roi = c.roi; }
    return r;
  });
  const tot = Object.assign({}, sum.totals); if (!rev) delete tot.revenue; if (!gp) { delete tot.gp; delete tot.wonWithCosts; }
  const recent = sum.opps.filter(function(x){ return x.created; }).sort(function(a, b){ return a.created < b.created ? 1 : -1; }).slice(0, 80).map(function(x){
    const r = { date: x.created, source: x.source || '(not set)', campaign: x.campaign, city: x.city, zip: x.zip, kind: x.kind,
      stage: x.won ? 'Won' : x.lost ? 'Lost' : x.rank >= 2 ? 'Estimate' : x.rank >= 1 ? 'Appointment' : 'New' };
    if (rev && x.won) r.revenue = x.revenue;
    return r;
  });
  const camps = sum.campaigns.map(function(c){ const r = { channel: c.channel, campaign: c.campaign, spend: c.spend, clicks: c.clicks, impressions: c.impressions, ctr: c.ctr, cpc: c.cpc, platformConversions: c.platformConversions, crmLeads: c.crmLeads, crmWon: c.crmWon, crmCpl: c.crmCpl };
    if (rev) { r.crmRevenue = c.crmRevenue; r.roas = c.roas; } return r; });
  return { months: months || sum.months.length, from: sum.totals.from, to: sum.totals.to, channels: ch, totals: tot, thisMonth: sum.thisMonth, bySourceMonth: sum.bySourceMonth, campaigns: camps,
    kindMix: sum.kindMix.map(function(k){ const r = { kind: k.kind, leads: k.leads, won: k.won }; if (rev) r.revenue = k.revenue; return r; }),
    warnings: sum.warnings.filter(function(w){ return gp || !/costs recorded|profit/.test(w); }), recent: recent, shareRevenue: rev, shareProfit: gp };
}
/* one month: leads that came in that month (by source), how many are won so far, and that month's spend */
function monthTable(sum, spend, m, settings){
  const by = {};
  function row(ch){ return by[ch] || (by[ch] = { channel: ch, leads: 0, won: 0, revenue: 0, spend: 0 }); }
  sum.opps.forEach(function(o){ if (o.month !== m) return; const r = row(o.source || '(not set)'); r.leads++; if (o.won) { r.won++; r.revenue += o.revenue; } });
  spend.forEach(function(x){ const mo = s(x.month) || s(x.date).slice(0, 7); if (mo !== m || !(num(x.amount) > 0)) return; row(/local services|\blsa\b/i.test(s(x.channel)) ? 'Local Services Ads' : (C().normSource(x.channel) || s(x.channel) || 'Other')).spend += num(x.amount); });   /* LSA on its own line here (the CRM dashboard counts it in Google Ads) */
  const rows = Object.keys(by).map(function(k){ const r = by[k]; r.revenue = Math.round(r.revenue * 100) / 100; r.spend = Math.round(r.spend * 100) / 100;
    r.cpl = r.spend && r.leads ? Math.round(r.spend / r.leads * 100) / 100 : null; r.costPerWon = r.spend && r.won ? Math.round(r.spend / r.won * 100) / 100 : null;
    r.roas = r.spend && r.revenue ? Math.round(r.revenue / r.spend * 100) / 100 : null;
    if (settings && settings.shareRevenue === false) { delete r.revenue; delete r.roas; }
    return r; }).sort(function(a, b){ return b.spend - a.spend || b.leads - a.leads; });
  const t = rows.reduce(function(a, r){ a.leads += r.leads; a.won += r.won; a.spend += r.spend; a.revenue += r.revenue || 0; return a; }, { leads: 0, won: 0, spend: 0, revenue: 0 });
  t.spend = Math.round(t.spend * 100) / 100; t.revenue = Math.round(t.revenue * 100) / 100; t.cpl = t.spend && t.leads ? Math.round(t.spend / t.leads * 100) / 100 : null;
  if (settings && settings.shareRevenue === false) delete t.revenue;
  return { month: m, label: monthName(m), rows: rows, totals: t };
}

/* ── setup status: what is switched on, read from the CRM itself ── */
async function setup(v, doc){
  const out = {};
  try { const st = await X().adsStatus(); out.gads = { on: !!st.google.connected, note: st.google.connected ? 'Connected' + (st.google.lastSync ? ' · last pull ' + st.google.lastSync.slice(0, 10) : '') : st.google.configured ? 'Ready — an admin clicks Connect in the Ads hub' : 'Not set up on Netlify yet' };
    out.meta = { on: !!st.meta.connected, note: st.meta.connected ? 'Connected' : st.meta.configured ? 'Ready — an admin clicks Connect' : 'Not set up' }; } catch (e) {}
  const calls = await X().calls();
  const tn = arr(((doc.cfg && doc.cfg.main) || {}).trackNumbers).filter(function(x){ return x && x.number; });
  const tw = calls.filter(function(c){ return !c.callrail; }), cr = calls.filter(function(c){ return c.callrail; });
  out.twilio = { on: !!env('TWILIO_AUTH_TOKEN') && tn.length > 0, note: (env('TWILIO_AUTH_TOKEN') ? 'Twilio on' : 'Twilio not set up') + ' · ' + tn.length + ' tracking number' + (tn.length === 1 ? '' : 's') + (tw.length ? ' · last call ' + s(tw[tw.length - 1].at).slice(0, 10) : '') };
  out.callrail = { on: !!env('CALLRAIL_WEBHOOK_KEY') && cr.length > 0, note: env('CALLRAIL_WEBHOOK_KEY') ? (cr.length ? cr.length + ' call' + (cr.length === 1 ? '' : 's') + ' in · last ' + s(cr[cr.length - 1].at).slice(0, 10) : 'Webhook ready — no calls yet') : 'Not set up (CALLRAIL_WEBHOOK_KEY)' };
  let inbox = []; try { inbox = arr(await L().kvGet(L().KV)); } catch (e) {}
  const web = inbox.filter(function(x){ return x && x.websiteLead && x.origin === 'website'; }).sort(function(a, b){ return s(a.receivedAt || a.at) < s(b.receivedAt || b.at) ? 1 : -1; });
  out.website_lead = { on: web.length > 0, note: web.length ? web.length + ' website lead' + (web.length === 1 ? '' : 's') + ' in the Lead Inbox · last ' + s((web[0].leadExtra && web[0].leadExtra.receivedAt) || web[0].at).slice(0, 10) : 'No website lead yet' };
  const spend = Object.keys(doc.spend || {}).map(function(k){ return doc.spend[k]; }).filter(function(x){ return x && !x.del; });
  const lsa = spend.filter(function(x){ return /local services|\blsa\b/i.test(s(x.channel) + ' ' + s(x.campaign)); });
  out.lsa = { on: lsa.length > 0, note: lsa.length ? 'LSA spend logged (' + lsa.length + ' month' + (lsa.length === 1 ? '' : 's') + ')' : 'No LSA spend logged yet' };
  const rt = reportRecipients(v, []);
  out.report = { on: true, note: 'On the 1st at 8 AM Central to the admins' + (memberList(v).filter(function(m){ return m.active !== false; }).length ? ', the agency' : '') + (rt.length ? ' and ' + rt.join(', ') : '') };
  return out;
}

/* ── the plan ── */
function planList(v, sig){
  return Object.keys(v.plan).map(function(k){ return v.plan[k]; }).filter(function(p){ return p && !p.del; })
    .map(function(p){ const a = p.auto && sig && sig[p.auto]; return Object.assign({}, p, a ? { signal: a } : {}); })
    .sort(function(a, b){ return (a.phase || 9) - (b.phase || 9) || (a.order || 0) - (b.order || 0); });
}
function savePlan(v, who, b){
  const id = s(b.id) || ('p_' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'));
  const old = v.plan[id];
  if (!old && !s(b.title)) return { ok: false, error: 'Give the item a title.' };
  if (b.del === true) { if (!who.admin) return { ok: false, error: 'Only an admin can delete a plan item.' }; if (old) { old.del = true; old.at = nowIso(); old.by = who.email; } logIt(v, who, 'deleted plan item: ' + s(old && old.title)); return { ok: true }; }
  const p = old ? Object.assign({}, old) : { id: id, phase: 1, owner: who.kind === 'agency' ? 'Agency' : 'GrayCo', status: 'todo', order: Object.keys(v.plan).length, createdBy: who.email };
  if (b.title != null) p.title = clip(b.title, 200) || p.title;
  if (b.how != null) p.how = clip(b.how, 600);
  if (b.notes != null) p.notes = clip(b.notes, 2000);
  if (b.status != null && STATUSES.indexOf(s(b.status)) >= 0) { if (p.status !== s(b.status) && s(b.status) === 'done') p.doneAt = nowIso(); p.status = s(b.status); }
  if (b.owner != null && OWNERS.indexOf(s(b.owner)) >= 0) p.owner = s(b.owner);
  if (b.phase != null && [1, 2, 3, 4].indexOf(+b.phase) >= 0) p.phase = +b.phase;
  if (b.due != null) p.due = /^\d{4}-\d{2}-\d{2}$/.test(s(b.due)) ? s(b.due) : '';
  p.at = nowIso(); p.by = who.email;
  v.plan[id] = p;
  logIt(v, who, (old ? 'updated' : 'added') + ' plan item: ' + p.title + (b.status ? ' → ' + p.status : ''));
  return { ok: true, item: p };
}

/* ── spend (the CRM's marketing spend records) ── */
function spendView(spend, who){
  return spend.filter(function(x){ return num(x.amount) > 0; }).map(function(x){
    return { id: x.id, month: s(x.month) || s(x.date).slice(0, 7), channel: s(x.channel), campaign: s(x.campaign), amount: num(x.amount), origin: s(x.origin) || 'manual', note: s(x.note), by: s(x.enteredBy || ''),
      mine: s(x.origin) === 'agency' && (who.admin || who.kind === 'agency') };
  }).sort(function(a, b){ return a.month < b.month ? 1 : a.month > b.month ? -1 : (a.channel < b.channel ? -1 : 1); });
}
async function addSpend(who, b){
  const m = s(b.month), amount = Math.round(num(b.amount) * 100) / 100, channel = clip(b.channel, 60);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return { ok: false, error: 'Pick the month.' };
  if (!(amount > 0) || amount > 1e6) return { ok: false, error: 'Enter the amount spent.' };
  if (!channel) return { ok: false, error: 'Pick the channel.' };
  const id = 'ag_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const rec = { id: id, month: m, date: m + '-01', channel: channel, campaign: clip(b.campaign, 80), amount: amount, note: clip(b.note, 200), origin: 'agency', enteredBy: who.email, enteredAt: nowIso() };
  const w = await M().update(function(doc){ (doc.spend = doc.spend || {})[id] = rec; return [['spend', id]]; });
  if (!w.ok) return { ok: false, error: 'The CRM was busy — try again.' };
  await change(function(v){ logIt(v, who, 'added spend ' + channel + ' ' + m + ' ' + money(amount)); });
  return { ok: true, id: id };
}
async function delSpend(who, id){
  id = s(id); let why = '';
  const w = await M().update(function(doc){
    const r = doc.spend && doc.spend[id];
    if (!r || r.del) { why = 'Not found.'; return null; }
    if (s(r.origin) !== 'agency' && !who.admin) { why = 'Only spend entered on this page can be removed here.'; return null; }
    r.del = true; r.delBy = who.email; return [['spend', id]];
  });
  if (why) return { ok: false, error: why };
  if (!w.ok) return { ok: false, error: 'The CRM was busy — try again.' };
  await change(function(v){ logIt(v, who, 'removed spend ' + id); });
  return { ok: true };
}

/* ── calls (Twilio tracking numbers + CallRail), caller shown as the last 4 digits ── */
async function callList(){
  return (await X().calls()).slice(-300).reverse().map(function(c){
    return { at: s(c.at), source: s(c.source) || 'unknown', via: c.callrail ? 'CallRail' : 'Twilio', from: s(c.from).replace(/\D/g, '').slice(-4), duration: c.duration || null,
      answered: c.answered == null ? null : !!c.answered, firstCall: c.firstCall == null ? null : !!c.firstCall, keyword: s(c.keyword), campaign: s(c.campaign), lead: !!c.leadId };
  });
}

/* ── notes ── */
async function addNote(who, text){
  text = clip(text, 4000); if (!text) return { ok: false, error: 'Write something first.' };
  let note;
  const v = await change(function(v){ note = { id: 'n_' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), at: nowIso(), by: who.email, name: who.name || who.email, side: who.kind === 'agency' ? 'agency' : 'grayco', text: text }; v.notes.push(note); v.notes = v.notes.slice(-500); return v; });
  const to = note.side === 'agency' ? await adminEmails() : memberList(v).filter(function(m){ return m.active !== false; }).map(function(m){ return m.email; });
  const html = shell('New note on the marketing portal', '<p><b>' + esc(note.name) + '</b> wrote:</p><blockquote style="border-left:4px solid #D4A017;margin:0;padding:6px 12px;white-space:pre-wrap">' + esc(text) + '</blockquote>' +
    '<p style="margin-top:18px"><a href="' + site() + '/agency#notes" style="color:#1E2060;font-weight:bold">Open the marketing portal →</a></p>');
  const sent = await mail(to.filter(function(e){ return e !== low(who.email); }), 'GrayCo marketing: note from ' + note.name, html);
  return { ok: true, note: note, emailed: sent };
}

/* ── admin: members + settings ── */
function saveMember(v, who, b){
  const e = low(b.email); if (!okEmail(e)) return { ok: false, error: 'Enter their e-mail address.' };
  if (/@grayco-cs\.com$/.test(e)) return { ok: false, error: 'GrayCo staff use their CRM sign-in — no need to add them here.' };
  const old = v.members[e] || seedMembers()[e] || {};
  v.members[e] = { email: e, name: b.name != null ? clip(b.name, 80) : s(old.name), company: b.company != null ? clip(b.company, 80) : (s(old.company) || 'Agency'), active: b.active !== false,
    addedBy: s(old.addedBy) || who.email, addedAt: s(old.addedAt) || nowIso(), changedBy: who.email, changedAt: nowIso() };
  logIt(v, who, (b.active === false ? 'turned off ' : 'saved ') + 'agency member ' + e);
  return { ok: true, member: v.members[e] };
}
function saveSettings(v, who, b){
  if (b.shareRevenue != null) v.settings.shareRevenue = b.shareRevenue !== false;
  if (b.shareProfit != null) v.settings.shareProfit = b.shareProfit === true;
  if (b.reportTo != null) v.settings.reportTo = s(b.reportTo).split(/[,;\s]+/).map(low).filter(okEmail).slice(0, 10).join(',');
  logIt(v, who, 'settings: revenue ' + (v.settings.shareRevenue ? 'shared' : 'hidden') + ', profit ' + (v.settings.shareProfit ? 'shared' : 'hidden') + ', report to ' + (v.settings.reportTo || '(admins + agency)'));
  return { ok: true, settings: v.settings };
}
function reportRecipients(v, admins){
  return Array.from(new Set(arr(admins).concat(s(v.settings.reportTo).split(','), env('MKT_REPORT_TO').split(',')).map(low).filter(okEmail)));
}

/* ── the monthly report (also the "Preview report" button) ── */
async function report(o){
  o = o || {};
  const v = await read(), st = v.settings;
  const now = s(o.now) || nowIso().slice(0, 10), m = /^\d{4}-\d{2}$/.test(s(o.month)) ? s(o.month) : prevMonth(now);
  const S = await summary({ now: now, months: 12 });
  const mt = monthTable(S.sum, S.spend, m, st), sh = share(S.sum, st, 12);
  const pl = planList(v, null), open = pl.filter(function(p){ return p.status !== 'done' && p.status !== 'skip'; }), done = pl.filter(function(p){ return p.status === 'done' && s(p.doneAt).slice(0, 7) === m; });
  const rev = st.shareRevenue !== false;
  const th = function(t){ return '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #0F1D2F;font-size:12px">' + t + '</th>'; };
  const td = function(t, r){ return '<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px' + (r ? ';text-align:right' : '') + '">' + t + '</td>'; };
  const dash = function(x, f){ return x == null ? '—' : f(x); };
  let html = '<p>Leads that came in during <b>' + esc(mt.label) + '</b>, by source, with that month\'s spend. Jobs won are counted to the month the lead came in, so last month\'s numbers keep improving as jobs close.</p>';
  html += '<table style="border-collapse:collapse;width:100%"><tr>' + th('Source') + th('Leads') + th('Won') + (rev ? th('Revenue') : '') + th('Spend') + th('Cost / lead') + th('Cost / job') + (rev ? th('$ back per $1') : '') + '</tr>' +
    mt.rows.map(function(r){ return '<tr>' + td(esc(r.channel)) + td(r.leads, 1) + td(r.won, 1) + (rev ? td(money(r.revenue), 1) : '') + td(r.spend ? money(r.spend) : '—', 1) + td(dash(r.cpl, money), 1) + td(dash(r.costPerWon, money), 1) + (rev ? td(dash(r.roas, function(x){ return '$' + x.toFixed(2); }), 1) : '') + '</tr>'; }).join('') +
    '<tr style="font-weight:bold">' + td('Total') + td(mt.totals.leads, 1) + td(mt.totals.won, 1) + (rev ? td(money(mt.totals.revenue), 1) : '') + td(money(mt.totals.spend), 1) + td(dash(mt.totals.cpl, money), 1) + td('', 1) + (rev ? td('', 1) : '') + '</tr></table>';
  html += '<h3 style="font-size:15px;margin:22px 0 6px">Last 12 months</h3><p style="margin:0">' + sh.totals.leads + ' leads · ' + sh.totals.won + ' jobs won' + (rev ? ' · ' + money(sh.totals.revenue) + ' revenue' : '') + ' · ' + money(sh.totals.spend) + ' marketing spend' + (sh.totals.cpl ? ' · ' + money(sh.totals.cpl) + ' per lead' : '') + '.</p>';
  if (sh.warnings.length) html += '<ul style="color:#9a3412;font-size:13px">' + sh.warnings.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
  html += '<h3 style="font-size:15px;margin:22px 0 6px">The plan</h3><p style="margin:0">' + (done.length ? 'Done in ' + esc(mt.label) + ': ' + done.map(function(p){ return esc(p.title); }).join('; ') + '. ' : '') + open.length + ' item' + (open.length === 1 ? '' : 's') + ' open' + (open.length ? ' — next up: ' + open.slice(0, 4).map(function(p){ return esc(p.title) + ' (' + esc(p.owner) + ')'; }).join('; ') : '') + '.</p>';
  html += '<p style="margin-top:18px"><a href="' + site() + '/agency" style="color:#1E2060;font-weight:bold">Open the marketing portal →</a> · For the books: each spend line above matches a marketing expense; agency fees count as "Agency fee".</p>';
  return { ok: true, month: m, label: mt.label, subject: 'GrayCo marketing report — ' + mt.label, html: shell('Marketing report — ' + mt.label, html), table: mt };
}
async function sendReport(o){
  o = o || {};
  const v = await read(), r = await report(o);
  const admins = await adminEmails(), agency = memberList(v).filter(function(m){ return m.active !== false; }).map(function(m){ return m.email; });
  let to = reportRecipients(v, admins.concat(agency));
  if (!o.all) { try { const own = await require('./mktfeat.js').ownerReportRecipients(); to = to.filter(function(e){ return own.indexOf(e) < 0; }); } catch (e) {} }   /* patch MKTFEAT: the admins who get the owner's report (Marketing → 📬) get one marketing e-mail on the 1st, not two */
  const ok = to.length ? await mail(to, r.subject, r.html) : true;
  await change(function(v){ v.lastReport = { month: r.month, at: nowIso(), to: to, ok: ok }; });
  return { ok: ok, month: r.month, to: to };
}

module.exports = { KEY, PLAN_SEED, STATUSES, OWNERS, CHANNEL_CHOICES, read, change, whoFromSession, sendLink, exchange, makeToken, readToken, memberOf, memberList,
  summary, share, monthTable, setup, planList, savePlan, spendView, addSpend, delSpend, callList, addNote, saveMember, saveSettings, report, sendReport, adminEmails,
  _setNow: function(f){ nowFn = f || function(){ return Date.now(); }; } };
