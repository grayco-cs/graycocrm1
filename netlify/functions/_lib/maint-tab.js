/* ============================================================================
   GrayCo — the 🛠 MAINTENANCE TAB's server half (patches MAINTTAB + MAINTPLUS).   netlify/functions/_lib/maint-tab.js

   Owner 10/30: "I want to have a maintenance tab in the CRM to offer commercial maintenance plans and focus on reaching out
   to maintenance managers … this needs to be in pm office and admin tabs", "For all maintenance customers … all updates will
   be in the portal", "snow clean up will be on the priority list for each commercial maintenance customer, along with
   priority emergency mitigation services", and the program picks (tiers, Emergency Ready, condition report, make-ready,
   kits, auto-renew only with consent, referral credit per plan, reminders a month ahead to whoever sold the plan, repair
   quotes from every visit).

   Called by portal-plus.js (staff only, signed in to the CRM + on gc_staff). Nothing here sends anything by itself: every
   e-mail / portal post waits on ✅ Approvals (kinds maint_outreach, maint_repair, maint_reminder — the office approves;
   portal_post through portal.js autaiQueue). Texts: none (A2P is not registered — e-mail only).
     tab                 → contracts, the plan settings, prospects, property files (Emergency Ready), the ⭐ priority list
     prospect-save       → add / change one prospect (gc_kv "gc_maint_prospects", read again before every write); a log line;
                           a "next follow-up" date → a To-Do on the office list for the assigned person
     outreach            → an e-mail draft (a template the person edited) → ✅ Approvals (maint_outreach); stage → Contacted
     visit-post          → 📝 a visit update → a portal post on ✅ Approvals; "done" sets the last visit and plans the next one
                           by the plan's frequency; "+ repair found" lines → a repair quote (tier discount applied) on ✅
                           Approvals (maint_repair) and, once approved, in the portal
     snow-event          → ❄️ the priority list becomes the day's call order: a To-Do per customer (in order) + a "We're on our
                           way" portal post each, on ✅ Approvals
     settings-set        → tiers (discounts), kits, the make-ready price list, the outreach templates, commercial-first
     tier                → a customer's membership tier (every plan customer starts at Bronze)
     emready             → the Emergency Ready file for a property (shutoffs with photos, contacts, building info)
     pcr                 → the Yearly Property Condition Report PDF → the portal through ✅ Approvals (portal_post)
     visit-set           → the 🗓 MAINTENANCE SCHEDULE (gc_kv "gc_maint_visits", its own list — never the job schedule): move a
                           visit, or add one
     portfolio-save      → a property manager's portfolio (gc_kv "gc_maint_portfolios"): many properties, one contract view,
                           optional one combined invoice
     letter              → a roof certification (sale / refinance / insurance) or a workmanship warranty letter PDF from the
                           property's last inspection → the portal through ✅ Approvals
     pamphlet            → the printable one-page pamphlet (multifamily / commercial / residential / insurance) as a PDF
     pamphlet-mail       → the pamphlet as an e-mail draft (PDF attached) → ✅ Approvals (maint_outreach)
   ========================================================================== */
'use strict';
const M = require('./maint.js');
const PROS_KEY = 'gc_maint_prospects', PROPS_KEY = 'gc_maint_props', VISITS_KEY = 'gc_maint_visits', PORT_KEY = 'gc_maint_portfolios';
/* the Maintenance Schedule rows for a newly signed plan: one plan year, by its frequency */
function visitRows(c, p, from, areaDays){
  const prop = s(p && (p.address || p.jobAddress)) || s(p && p.name), area = M.routeArea(p && (p.address || p.jobAddress));
  const rows = M.planVisits(s(c.freq) || 'yearly', from || c.signedAt).map(function(d){ return M.onAreaDay(d, area, areaDays); }).map(function(d, i){ return { id: 'mv_' + s(c.id) + '_' + d, area: area, contractId: s(c.id), pid: s(c.pid), portfolioId: s(c.portfolioId), planId: s(c.planId), planName: s(c.planName),
    property: prop, customer: s(p && (p.client || p.clientName)), date: d, oncall: s(c.freq) === 'winter', pm: s(p && p.pm), soldBy: s(c.soldBy), sub: s(c.performer) === 'sub' ? s(c.sub) : '', status: 'planned', n: i + 1, createdAt: new Date().toISOString() }; });
  /* the 🔧 Handyman Day(s): their own visits, spread over the year, with the tasks the day covers */
  const hd = c.handyman && c.handyman.days > 0 ? c.handyman : null;
  if (hd && from !== 'no-hd') for (let k = 0; k < hd.days; k++) { const d = M.onAreaDay(M.nextYear(s(from || c.signedAt), Math.max(1, Math.round(12 / hd.days * k + 1))), area, areaDays);
    rows.push({ id: 'mv_' + s(c.id) + '_hd' + k + '_' + d, area: area, contractId: s(c.id), pid: s(c.pid), portfolioId: s(c.portfolioId), planId: s(c.planId), planName: '🔧 Handyman Day (' + s(c.planName) + ')', kind: 'handyman', hours: '8 AM – 5 PM',
      tasks: (Array.isArray(hd.tasks) ? hd.tasks : []).concat(Array.isArray(hd.other) ? hd.other : []), property: prop, customer: s(p && (p.client || p.clientName)), date: d, pm: s(p && p.pm), soldBy: s(c.soldBy), status: 'planned', n: k + 1, createdAt: new Date().toISOString() }); }
  return rows;
}
const STAGES = ['Prospect', 'Contacted', 'Free inspection booked', 'Inspection done', 'Proposal sent', 'Won', 'Lost'];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return Math.round(M.num(n) * 100) / 100; }
function usd(n){ return '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowIso(){ return new Date().toISOString(); }
function okEmail(e){ return /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(s(e)); }
function ymd(v){ const t = s(v); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; }
function rid(p){ return p + Date.now().toString(36) + require('crypto').randomBytes(3).toString('hex'); }
function textHtml(t){ return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14202E;font-size:15px;line-height:1.5;white-space:pre-wrap">' + esc(t) + '</div>'; }
function fill(t, v){ return s(t).replace(/\{\{(\w+)\}\}/g, function(_, k){ return v[k] != null ? String(v[k]) : ''; }); }
function cleanRefs(v){ return arr(v).map(function(f){ return { ref: s(f.ref), name: clip(f.name || 'photo.jpg', 120), type: clip(f.type || 'image/jpeg', 40) }; }).filter(function(f){ return /^sb:crm-files\/[A-Za-z0-9._\/-]+$/.test(f.ref); }).slice(0, 12); }

function cleanProspect(x, old){
  const o = Object.assign({}, old || {});
  ['company', 'contact', 'role', 'phone', 'email', 'properties', 'buildingType', 'source', 'notes', 'assigned', 'nextStep', 'address', 'pid', 'leadId', 'market'].forEach(function(k){ if (x[k] !== undefined) o[k] = clip(x[k], k === 'notes' ? 2000 : 200); });
  if (x.stage !== undefined) o.stage = STAGES.indexOf(s(x.stage)) >= 0 ? s(x.stage) : (o.stage || 'Prospect');
  if (x.nextAt !== undefined) o.nextAt = ymd(x.nextAt);
  o.stage = o.stage || 'Prospect'; o.market = o.market === 'residential' ? 'residential' : 'commercial';
  if (o.email && !okEmail(o.email)) o.email = '';
  return o;
}

function make(ctx){
  /* ctx: { core(), readAll(), listUpdate(key, fn), contractChange(id, fn), storePdf(buf, name), sel(), pmOf(d, p), carrierWords(p), scrub(t, w) } */
  const C = ctx.core;
  async function readExtra(){ const d = await C().kvRead([PROS_KEY, PROPS_KEY, VISITS_KEY, PORT_KEY]); return { prospects: arr(d[PROS_KEY]), props: d[PROPS_KEY] && typeof d[PROPS_KEY] === 'object' && !Array.isArray(d[PROPS_KEY]) ? d[PROPS_KEY] : {}, visits: arr(d[VISITS_KEY]), portfolios: arr(d[PORT_KEY]) }; }
  /* a signed plan → its year of visits on the Maintenance Schedule (once per contract) */
  async function scheduleFor(c, p){
    let ad = {}; try { ad = (await ctx.readAll()).settings.areaDays || {}; } catch (e) {}
    const rows = visitRows(c, p, null, ad); if (!rows.length) return 0;
    const r = await ctx.listUpdate(VISITS_KEY, function(l){ if (l.some(function(v){ return s(v.contractId) === s(c.id) && v.status !== 'cancelled'; })) return null;
      return { list: l.concat(rows), check: function(b){ return b.some(function(v){ return v.id === rows[0].id; }); } }; });
    return r.ok ? rows.length : 0;
  }
  async function saveSettings(A, patch, who){
    const clean = M.settingsOf(Object.assign({}, A.settings, patch, { catalog: M.CATALOG_V, known: A.settings.known }));
    clean.updatedAt = nowIso(); clean.by = who.email; delete clean.saved;
    const r = await ctx.kvPut(M.PLANS_KEY, clean);
    return r ? M.settingsOf(clean) : null;
  }
  function person(A, nameOrEmail){
    const k = low(nameOrEmail); if (!k) return null;
    const u = arr(A.data.users).find(function(x){ return low(x.email) === k || low(x.name) === k; });
    return u ? { name: s(u.name) || s(u.email), email: s(u.email) } : (okEmail(k) ? { name: k, email: k } : { name: s(nameOrEmail), email: '' });
  }

  async function act(body, who){
    const a = s(body.action), A = await ctx.readAll();
    const staffOk = !!(who.admin || who.office);
    if (a === 'tab') {
      const X = await readExtra();
      const gold = {}; A.list.forEach(function(c){ if (c.status === 'signed' && M.tierOf(c) === 'gold') { const p = ctx.findProject(A.data, c.pid) || {}; gold[s(c.pid)] = { pid: s(c.pid), name: s(p.client || p.name), since: s(c.signedAt) }; } });
      const ledger = [].concat.apply([], A.list.map(M.commissionLines));
      const comm = {}, area = {}; A.list.forEach(function(c){ if (c.status === 'signed' || c.status === 'quoted') comm[c.id] = M.commission(c); const p = ctx.findProject(A.data, c.pid); if (p && area[s(c.pid)] === undefined) area[s(c.pid)] = M.areaOf(p.address || p.jobAddress); });
      return { status: 200, out: { ok: true, ledger: ledger, routeAreas: M.ROUTE.map(function(r){ return r[0]; }), commission: comm, area: area, contracts: A.list, settings: A.settings, prospects: X.prospects, props: X.props, stages: STAGES, visits: X.visits, portfolios: X.portfolios,
        priority: M.priorityList(A.list, A.data.projects, A.settings), goldEntries: Object.keys(gold).map(function(k){ return gold[k]; }), letters: require('./maint-docs.js').lettersOf(A.settings.letters), audiences: Object.keys(require('./maint-docs.js').AUD) } };
    }
    if (a === 'area') return { status: 200, out: Object.assign({ ok: true }, M.areaOf(body.address)) };
    if (a === 'plan-prices') {   /* owner decision 1: the prices he fills in himself — a set price is no longer a placeholder */
      if (!staffOk) return { status: 403, out: { ok: false, error: 'Only an admin or the office changes prices.' } };
      const pr = body.prices && typeof body.prices === 'object' ? body.prices : {};
      const plans = A.settings.plans.map(function(x){ if (pr[x.id] == null || s(pr[x.id]) === '') return x; const v = M.num(pr[x.id]); return Object.assign({}, x, { price: Math.max(0, Math.min(100000, v)), priceSet: true }); });
      const st = await saveSettings(A, { plans: plans }, who);
      return st ? { status: 200, out: { ok: true, settings: st } } : { status: 502, out: { ok: false, error: 'Could not save.' } };
    }
    if (a === 'contract-set') {   /* owner decision 5: who sold it, self / sub, the sub, the costs (for the PM commission) */
      if (!staffOk) return { status: 403, out: { ok: false, error: 'Only an admin or the office changes this.' } };
      const r = await ctx.contractChange(s(body.contractId), function(c){ if (body.soldBy != null) c.soldBy = clip(body.soldBy, 120); if (body.performer != null) c.performer = s(body.performer) === 'sub' ? 'sub' : 'self';
        if (body.sub != null) c.sub = clip(body.sub, 80); if (body.subCost != null) c.subCost = money(body.subCost); if (body.cost != null) c.cost = money(body.cost); });
      return r.ok && r.result === 'ok' ? { status: 200, out: { ok: true, contract: r.c, commission: M.commission(r.c) } } : { status: 404, out: { ok: false, error: 'No such plan.' } };
    }
    if (a === 'invoice-paid') {   /* a payment collected → the seller's commission for that period is credited */
      if (!staffOk) return { status: 403, out: { ok: false, error: 'Only an admin or the office records payments.' } };
      const r = await ctx.contractChange(s(body.contractId), function(c){ let n = 0; c.invoices = arr(c.invoices).map(function(v){ if (s(v.year) !== s(body.year) || v.status === 'paid') return v; n++; return Object.assign({}, v, { status: 'paid', paidAt: ymd(body.date) || nowIso().slice(0, 10), paidBy: who.email }); }); if (!n) return 'none'; });
      return r.ok && r.result === 'ok' ? { status: 200, out: { ok: true, lines: M.commissionLines(r.c) } } : { status: 404, out: { ok: false, error: 'No such invoice.' } };
    }
    if (a === 'settings-set') {
      if (!staffOk) return { status: 403, out: { ok: false, error: 'Only an admin or the office changes these.' } };
      const v = body.set && typeof body.set === 'object' ? body.set : {}, patch = {};
      ['tiers', 'products', 'unitPrices', 'templates', 'letters', 'addOns', 'pamphletPhotos', 'handymanTasks', 'monthly', 'areaDays', 'yearly', 'yearlyDiscount', 'repairMargin', 'popularTier'].forEach(function(k){ if (v[k] !== undefined) patch[k] = v[k]; });   /* patch MAINTSETTINGS: + yearly prices / discount, repair margin, the popular tier */
      patch.changedBy = s(who && (who.name || who.email)); patch.changedAt = nowIso();   /* patch MAINTSETTINGS: last changed by / at */
      if (v.commercialFirst !== undefined) patch.commercialFirst = v.commercialFirst === true;
      const st = await saveSettings(A, patch, who);
      return st ? { status: 200, out: { ok: true, settings: st } } : { status: 502, out: { ok: false, error: 'Could not save.' } };
    }
    if (a === 'prospect-save') {
      const x = body.prospect && typeof body.prospect === 'object' ? body.prospect : null; if (!x) return { status: 400, out: { ok: false, error: 'Nothing to save.' } };
      if (!s(x.id) && !s(x.company) && !s(x.contact)) return { status: 400, out: { ok: false, error: 'Add a company or a contact name.' } };
      const id = s(x.id) || rid('mp_'), at = nowIso(); let rec = null;
      const r = await ctx.listUpdate(PROS_KEY, function(l){
        const i = l.findIndex(function(p){ return s(p.id) === id; });
        if (i < 0 && s(x.id)) return { list: null, result: 'missing' };
        const old = i >= 0 ? l[i] : { id: id, createdAt: at, createdBy: who.email, stage: 'Prospect', log: [] };
        rec = cleanProspect(x, old); rec.id = id; rec.updatedAt = at;
        const line = clip(body.log, 400); if (line) rec.log = arr(old.log).concat([{ at: at, by: who.name || who.email, what: line }]).slice(-80);
        if (i >= 0) l[i] = rec; else l.push(rec);
        return { list: l, check: function(b){ return b.some(function(p){ return s(p.id) === id && s(p.updatedAt) === at; }); }, result: 'ok' };
      });
      if (!r.ok || r.result !== 'ok') return { status: r.result === 'missing' ? 404 : 503, out: { ok: false, error: r.result === 'missing' ? 'That prospect was removed.' : 'Could not save — try again.' } };
      if (rec.nextAt) { const pp = person(A, rec.assigned);
        try { await C().officeTodo('maint_fu_' + id + '_' + rec.nextAt, '📞 Follow up ' + rec.nextAt + ' — ' + (rec.company || rec.contact) + (pp ? ' (' + pp.name + ')' : ''), (rec.nextStep || 'Next step') + ' · ' + [rec.contact, rec.phone, rec.email].filter(Boolean).join(' · ') + ' · 🛠 Maintenance → Prospects.'); } catch (e) {} }
      return { status: 200, out: { ok: true, prospect: rec } };
    }
    if (a === 'outreach') {
      const X = await readExtra(); let pr = s(body.prospectId) ? X.prospects.find(function(p){ return s(p.id) === s(body.prospectId); }) : null;
      const p = s(body.pid) ? ctx.findProject(A.data, s(body.pid)) : null;
      const to = s(body.to) || (pr ? pr.email : '') || (p ? s(p.clientEmail || p.customerEmail || p.email) : '');
      if (!okEmail(to)) return { status: 400, out: { ok: false, error: 'No e-mail address for this contact — add one first (texts are not used: e-mail only).' } };
      const tpl = A.settings.templates[s(body.template)] || A.settings.templates.plan;
      const me = person(A, who.email) || { name: who.name || who.email };
      const v = { first: s((pr && pr.contact) || (p && (p.client || p.clientName)) || '').split(/\s+/)[0] || 'there', property: s((pr && (pr.properties || pr.company)) || (p && (p.address || p.name)) || 'your property'), me: me.name, phone: '901-585-0944' };
      const subject = clip(s(body.subject) || fill(tpl.subject, v), 200), text = clip(s(body.body) || fill(tpl.body, v), 6000);
      const pm = pr ? person(A, pr.assigned) : (p ? ctx.pmOf(A.data, p) : null);
      const id = 'appr_mto_' + (pr ? pr.id : 'job' + s(body.pid)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + '_' + s(body.template || 'plan').replace(/\W/g, '') + '_' + Date.now().toString(36);
      const q = await C().queueApproval({ id: id, kind: 'maint_outreach', pid: p ? s(p.id) : '', jobName: pr ? (pr.company || pr.contact) : (p ? s(p.name) : 'Maintenance'), pm: pm && pm.email ? pm : null, to: to,
        title: '🛠 Maintenance outreach — ' + (pr ? (pr.company || pr.contact) : s(p && p.name)), subject: subject, html: textHtml(text), meta: { prospectId: pr ? pr.id : '', template: s(body.template), by: who.email, fromPm: !!(pm && /@grayco-cs\.com$/i.test(s(pm.email))) } });
      if (!q) return { status: 503, out: { ok: false, error: 'Could not put it on ✅ Approvals — try again.' } };
      if (pr) await ctx.listUpdate(PROS_KEY, function(l){ const i = l.findIndex(function(x){ return s(x.id) === pr.id; }); if (i < 0) return null; const c = l[i];
        if (c.stage === 'Prospect') c.stage = 'Contacted'; c.log = arr(c.log).concat([{ at: nowIso(), by: who.name || who.email, what: '✉ ' + (tpl.name || 'E-mail') + ' — on ✅ Approvals' }]).slice(-80); c.updatedAt = nowIso(); return { list: l }; });
      return { status: 200, out: { ok: true, id: id, queued: true } };
    }
    if (a === 'tier') {
      const t = low(body.tier); if (!M.TIERS[t]) return { status: 400, out: { ok: false, error: 'Bronze, Silver or Gold.' } };
      if (!staffOk) return { status: 403, out: { ok: false, error: 'Only an admin or the office changes a membership tier.' } };
      const ids = A.list.filter(function(c){ return s(c.pid) === s(body.pid) && c.status === 'signed'; }).map(function(c){ return c.id; });
      if (!ids.length) return { status: 404, out: { ok: false, error: 'No signed plan on this job.' } };
      for (const id of ids) await ctx.contractChange(id, function(c){ c.tier = t; c.history = arr(c.history).concat([{ at: nowIso(), by: who.name || who.email, what: 'Tier → ' + M.TIERS[t].name }]); });
      return { status: 200, out: { ok: true, tier: t } };
    }
    if (a === 'emready') {
      const pid = s(body.pid), p = ctx.findProject(A.data, pid); if (!p) return { status: 404, out: { ok: false, error: 'The job is not in the cloud yet.' } };
      const i = body.info && typeof body.info === 'object' ? body.info : {};
      const rec = { building: clip(i.building, 1500), contacts: arr(i.contacts).slice(0, 12).map(function(c){ return { name: clip(c.name, 80), role: clip(c.role, 80), phone: clip(c.phone, 30), email: clip(c.email, 120) }; }),
        shutoffs: arr(i.shutoffs).slice(0, 20).map(function(x){ return { what: clip(x.what, 60), location: clip(x.location, 300), photo: cleanRefs(x.photo ? [x.photo] : [])[0] || null }; }),
        photos: cleanRefs(i.photos), updatedAt: nowIso(), by: who.email };
      const r = await ctx.kvMerge(PROPS_KEY, function(v){ v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; v[pid] = Object.assign({}, v[pid] || {}, { emready: rec }); return v; });
      return r ? { status: 200, out: { ok: true, emready: rec } } : { status: 503, out: { ok: false, error: 'Could not save — try again.' } };
    }
    if (a === 'visit-post') {
      const c0 = A.list.find(function(c){ return s(c.id) === s(body.contractId); }); if (!c0 || c0.status !== 'signed') return { status: 404, out: { ok: false, error: 'No signed plan like that.' } };
      const p = ctx.findProject(A.data, c0.pid); if (!p) return { status: 404, out: { ok: false, error: 'The job is not in the cloud yet.' } };
      const text = clip(body.text, 1800), photos = cleanRefs(body.photos), at = nowIso();
      if (!text && !photos.length && !arr(body.repairs).length) return { status: 400, out: { ok: false, error: 'Write what was done (and add photos).' } };
      const tier = M.bestTier(A.list.filter(function(c){ return s(c.pid) === s(c0.pid) && c.status === 'signed'; }));
      const repairs = arr(body.repairs).slice(0, 12).map(function(x){ if (!(M.num(x.price) > 0) && M.num(x.cost) > 0) x = Object.assign({}, x, { price: M.repairPrice(x.cost, A.settings.repairMargin) });   /* patch MAINTSETTINGS: priced from its cost at the target margin */ const d = M.discounted(x.price, tier, A.settings.tiers); return { id: rid('rp_'), desc: clip(x.desc, 300), price: money(x.price), discount: d.discount, net: d.net, photo: cleanRefs(x.photo ? [x.photo] : [])[0] || null, at: at, status: 'waiting' }; }).filter(function(x){ return x.desc && x.price > 0; });
      let postId = '';
      if (text || photos.length) {
        const q = await C().autaiQueue({ kind: 'portal_post', projectId: s(c0.pid), text: '🛠 ' + s(c0.planName) + ' — visit ' + at.slice(0, 10) + (text ? '\n\n' + text : ''), photos: photos, by: who.name || who.email, source: 'maintenance' }, who);
        if (!q.out || !q.out.ok) return { status: q.status || 503, out: { ok: false, error: (q.out && q.out.error) || 'Could not put the update on ✅ Approvals.' } };
        postId = s(q.out.id);
      }
      let repairId = '';
      if (repairs.length) {
        const words = ctx.carrierWords(p), job = ctx.scrub(p.name, words) || 'your property', to = s(p.clientEmail || p.customerEmail || p.email);
        repairId = 'appr_mtr_' + c0.id + '_' + Date.now().toString(36);
        const total = money(repairs.reduce(function(t, x){ return t + x.net; }, 0));
        const html = '<p>Hi ' + esc(s(p.client).split(/\s+/)[0] || 'there') + ',</p><p>On your ' + esc(c0.planName) + ' visit we found ' + (repairs.length === 1 ? 'one thing' : repairs.length + ' things') + ' that need a repair. As a ' + esc(M.TIERS[tier].name) + ' member you get ' + A.settings.tiers[tier].discount + '% off:</p><ul>' +
          repairs.map(function(x){ return '<li>' + esc(x.desc) + ' — <s>' + esc(usd(x.price)) + '</s> <b>' + esc(usd(x.net)) + '</b></li>'; }).join('') + '</ul><p>Total: <b>' + esc(usd(total)) + '</b>. You can see it in your GrayCo Portal and reply or call us to go ahead:</p>' +
          '<p style="text-align:center;margin:22px 0"><a href="' + C().LINK_PH + '" style="background:#D4A017;color:#0F1D2F;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">See the repair quote</a></p>';
        const q2 = okEmail(to) ? await C().queueApproval({ id: repairId, kind: 'maint_repair', pid: s(c0.pid), jobName: job, pm: ctx.pmOf(A.data, p), to: to, subject: 'Repair quote from your maintenance visit — ' + job, html: html, meta: { contractId: c0.id, repairIds: repairs.map(function(x){ return x.id; }), total: total, tier: tier, by: who.email } }) : false;
        if (!q2) { repairId = ''; try { await C().officeTodo('maint_rep_' + c0.id + '_' + at.slice(0, 10), '🔧 Repair quote to send by hand — ' + job, repairs.map(function(x){ return x.desc + ' ' + usd(x.net); }).join('; ') + ' (no customer e-mail on file).'); } catch (e) {} }
        repairs.forEach(function(x){ x.approvalId = repairId; });
      }
      const isHd = !!s(body.visitId) && (await readExtra()).visits.some(function(v){ return v.id === s(body.visitId) && v.kind === 'handyman'; });
      const r = await ctx.contractChange(c0.id, function(c){
        const by = who.name || who.email;
        if (body.done !== false && isHd) { c.visits = arr(c.visits).concat([{ at: at, by: by, note: clip(text, 400), postId: postId, photos: photos.length, kind: 'handyman' }]); c.history = arr(c.history).concat([{ at: at, by: by, what: '🔧 Handyman Day done' }]); }
        else if (body.done !== false) { const v = { at: at, by: by, note: clip(text, 400), postId: postId, photos: photos.length };
          c.visits = arr(c.visits).concat([v]); c.lastVisit = at.slice(0, 10); c.nextVisit = M.nextFrom(s(c.freq) || (c.visitsPerYear >= 4 ? 'quarterly' : c.visitsPerYear >= 2 ? 'twice' : 'yearly'), at);
          c.history = arr(c.history).concat([{ at: at, by: by, what: 'Visit done' + (postId ? ' — update on ✅ Approvals' : '') }]); }
        if (repairs.length) c.repairs = arr(c.repairs).concat(repairs).slice(-60);
      });
      if (body.done !== false) {   /* the Maintenance Schedule: the visit done (the chosen one, else the earliest planned); none left → next year's */
        const today = at.slice(0, 10);
        await ctx.listUpdate(VISITS_KEY, function(l){
          let i = s(body.visitId) ? l.findIndex(function(v){ return v.id === s(body.visitId); }) : -1;
          if (i < 0) { const open = l.map(function(v, k){ return [v, k]; }).filter(function(x){ return s(x[0].contractId) === s(c0.id) && x[0].status === 'planned' && x[0].kind !== 'handyman'; }).sort(function(a, b){ return s(a[0].date) < s(b[0].date) ? -1 : 1; }); if (open.length) i = open[0][1]; }
          if (i >= 0) { l[i] = Object.assign({}, l[i], { status: 'done', doneAt: at, doneBy: who.name || who.email, note: clip(text, 300), postId: postId, tasksDone: (Array.isArray(body.tasksDone) ? body.tasksDone : []).map(function(x){ return clip(x, 120); }).slice(0, 40) }); }
          else l.push(Object.assign(visitRows(c0, p, at)[0] || {}, { id: 'mv_' + c0.id + '_' + today + '_x', date: today, status: 'done', doneAt: at, doneBy: who.name || who.email, note: clip(text, 300), postId: postId }));
          if (!l.some(function(v){ return s(v.contractId) === s(c0.id) && v.status === 'planned' && v.kind !== 'handyman'; })) { const next = r.c && r.c.nextVisit ? visitRows(Object.assign({}, c0, { freq: c0.freq || 'yearly', handyman: null }), p, new Date(Date.parse(r.c.nextVisit + 'T12:00:00Z') - 864e5 * 1).toISOString(), A.settings.areaDays) : [];
            next.forEach(function(v){ if (!l.some(function(x){ return x.id === v.id; })) l.push(v); }); }
          return { list: l };
        });
      }
      return { status: 200, out: { ok: true, postId: postId, repairId: repairId, contract: r.c } };
    }
    if (a === 'snow-event') {
      if (!staffOk) return { status: 403, out: { ok: false, error: 'An admin or the office starts a snow event.' } };
      const list = M.priorityList(A.list, A.data.projects, A.settings).filter(function(e){ return e.snow; }), day = nowIso().slice(0, 10);
      let todos = 0, posts = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        const ok = await C().officeTodo('maint_snow_' + day + '_' + e.pid, '❄️ Snow event ' + day + ' — #' + (i + 1) + ' ' + (e.name || e.job) + (e.commercial ? ' (commercial)' : '') + (e.pm ? ' · ' + e.pm : ''), [e.address, e.phone].filter(Boolean).join(' · ') + ' — call / crew order #' + (i + 1) + ' of ' + list.length + '. Lots, walks, entrances; salt / de-ice.');
        if (ok) todos++;
        const q = await C().autaiQueue({ kind: 'portal_post', projectId: e.pid, text: '❄️ Snow and ice are on the way. You are on GrayCo\'s priority list — we are on our way and will clear and treat your ' + (e.commercial ? 'lot, walks and entrances' : 'driveway and walks') + ' as soon as it is safe. Questions? Call 901-585-0944.', by: who.name || who.email, source: 'snow' }, who);
        if (q.out && q.out.ok) posts++;
      }
      return { status: 200, out: { ok: true, customers: list.length, todos: todos, posts: posts, order: list.map(function(e){ return e.pid; }) } };
    }
    if (a === 'pcr') {
      const pid = s(body.pid), p = ctx.findProject(A.data, pid); if (!p) return { status: 404, out: { ok: false, error: 'The job is not in the cloud yet.' } };
      const yr = new Date().getUTCFullYear(), systems = arr(body.systems).slice(0, 12).map(function(x){ const b = arr(x.budget).length ? x.budget : [x.y1, x.y2, x.y3, x.y4, x.y5];
        return { name: clip(x.name, 60), condition: clip(x.condition, 40), age: clip(x.age, 20), life: clip(x.life, 30), note: clip(x.note, 300), budget: [0, 1, 2, 3, 4].map(function(k){ return money(b && b[k]); }) }; }).filter(function(x){ return x.name; });
      if (!systems.length) return { status: 400, out: { ok: false, error: 'Add at least one system.' } };
      const words = ctx.carrierWords(p), job = ctx.scrub(p.name, words) || 'Property', S = ctx.sel(), b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: 'Property Condition Report ' + yr, bold: true, size: 13 }, { t: 'p', text: job }, s(p.address) ? { t: 'p', text: s(p.address) } : null, { t: 'gap', h: 6 }];
      systems.forEach(function(x){ b.push({ t: 'h', text: x.name }); b.push({ t: 'row', left: 'Condition', right: x.condition || '—' }); b.push({ t: 'row', left: 'Age', right: x.age || '—' }); b.push({ t: 'row', left: 'Remaining life', right: x.life || '—' }); if (x.note) b.push({ t: 'p', text: x.note }); b.push({ t: 'gap', h: 3 }); });
      b.push({ t: 'h', text: '5-year budget forecast' });
      [0, 1, 2, 3, 4].forEach(function(k){ const tot = systems.reduce(function(t, x){ return t + x.budget[k]; }, 0); b.push({ t: 'row', left: String(yr + k) + ' — ' + systems.filter(function(x){ return x.budget[k] > 0; }).map(function(x){ return x.name; }).join(', '), right: usd(tot) }); });
      b.push({ t: 'gap', h: 8 }); b.push({ t: 'p', text: 'Prepared by ' + (who.name || 'GrayCo') + ' · ' + new Date().toISOString().slice(0, 10) + ' · estimates for planning, not a bid.', size: 9, muted: true });
      let ref = ''; try { const pdf = S.buildPdf(b.filter(Boolean)); ref = await ctx.storePdf(pdf, 'Property Condition Report ' + yr + ' — ' + job + '.pdf'); } catch (e) { return { status: 500, out: { ok: false, error: 'Could not make the PDF.' } }; }
      const q = await C().autaiQueue({ kind: 'portal_post', projectId: pid, text: '📋 Your Property Condition Report for ' + yr + ' is ready: each system\'s condition and remaining life, and a 5-year budget forecast.' + (ref ? '' : ' (We will send the PDF separately.)'),
        photos: ref ? [{ ref: ref, name: 'Property Condition Report ' + yr + '.pdf', type: 'application/pdf' }] : [], by: who.name || who.email, source: 'condition-report' }, who);
      await ctx.kvMerge(PROPS_KEY, function(v){ v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; const o = v[pid] = Object.assign({}, v[pid] || {}); o.pcr = arr(o.pcr).concat([{ year: yr, at: nowIso(), by: who.email, ref: ref, systems: systems, postId: q.out && q.out.id }]).slice(-10); return v; });
      return { status: 200, out: { ok: !!(q.out && q.out.ok), postId: q.out && q.out.id, ref: ref } };
    }
    if (a === 'visit-set') {
      const c0 = A.list.find(function(c){ return s(c.id) === s(body.contractId); }); const d = ymd(body.date);
      if (!c0 || !d) return { status: 400, out: { ok: false, error: 'Pick the plan and a date (YYYY-MM-DD).' } };
      const p = ctx.findProject(A.data, c0.pid) || {};
      const r = await ctx.listUpdate(VISITS_KEY, function(l){
        const i = s(body.visitId) ? l.findIndex(function(v){ return v.id === s(body.visitId); }) : -1;
        if (i >= 0) l[i] = Object.assign({}, l[i], { date: d, movedBy: who.email, movedAt: nowIso() });
        else l.push(Object.assign(visitRows(Object.assign({}, c0, { freq: 'once' }), p, d + 'T12:00:00Z')[0], { id: 'mv_' + c0.id + '_' + d + '_' + Date.now().toString(36), date: d, addedBy: who.email }));
        return { list: l };
      });
      await ctx.contractChange(c0.id, function(c){ c.nextVisit = d; });
      return r.ok ? { status: 200, out: { ok: true } } : { status: 503, out: { ok: false, error: 'Could not save — try again.' } };
    }
    if (a === 'portfolio-save') {
      const x = body.portfolio && typeof body.portfolio === 'object' ? body.portfolio : {}; if (!s(x.name)) return { status: 400, out: { ok: false, error: 'Name the property manager / company.' } };
      const id = s(x.id) || rid('pf_'); let rec = null;
      const r = await ctx.listUpdate(PORT_KEY, function(l){ const i = l.findIndex(function(p){ return s(p.id) === id; }), old = i >= 0 ? l[i] : { id: id, createdAt: nowIso(), createdBy: who.email };
        rec = Object.assign({}, old, { name: clip(x.name, 120), contact: clip(x.contact, 120), email: okEmail(x.email) ? s(x.email) : s(old.email), phone: clip(x.phone, 40), combined: x.combined === true,
          pids: Array.isArray(x.pids) ? x.pids.map(s).filter(Boolean).slice(0, 200) : (Array.isArray(old.pids) ? old.pids : []), updatedAt: nowIso() });
        if (i >= 0) l[i] = rec; else l.push(rec); return { list: l }; });
      if (r.ok && rec) for (const c of A.list.filter(function(c){ return rec.pids.indexOf(s(c.pid)) >= 0 && s(c.portfolioId) !== id && !/^(cancelled|declined)$/.test(s(c.status)); })) await ctx.contractChange(c.id, function(y){ y.portfolioId = id; });
      return r.ok ? { status: 200, out: { ok: true, portfolio: rec } } : { status: 503, out: { ok: false, error: 'Could not save — try again.' } };
    }
    if (a === 'letter') {
      const pid = s(body.pid), p = ctx.findProject(A.data, pid); if (!p) return { status: 404, out: { ok: false, error: 'The job is not in the cloud yet.' } };
      const mine = A.list.filter(function(c){ return s(c.pid) === pid; }), visits = [].concat.apply([], mine.map(function(c){ return arr(c.visits); })).sort(function(a, b){ return s(a.at) < s(b.at) ? 1 : -1; });
      const last = visits[0] || null, words = ctx.carrierWords(p), f = body.fields && typeof body.fields === 'object' ? body.fields : {};
      const fields = { property: s(f.property) || s(p.address) || ctx.scrub(p.name, words), customer: s(f.customer) || s(p.client), date: new Date().toISOString().slice(0, 10),
        inspectedOn: s(f.inspectedOn) || (last ? s(last.at).slice(0, 10) : ''), inspector: s(f.inspector) || who.name || '', findings: ctx.scrub(s(f.findings) || (last ? s(last.note) : ''), words), years: s(f.years) || '5' };
      if (!fields.inspectedOn) return { status: 400, out: { ok: false, error: 'No inspection on file for this property yet — post a visit first, or type the inspection date.' } };
      const L = require('./maint-docs.js').letter(s(body.kind), fields, A.settings, ctx.sel()); if (!L) return { status: 400, out: { ok: false, error: 'Which letter?' } };
      const ref = await ctx.storePdf(L.pdf, L.name + ' — ' + fields.property + '.pdf');
      const q = await C().autaiQueue({ kind: 'portal_post', projectId: pid, text: '📄 ' + L.name + ' for ' + fields.property + (ref ? '' : ' (we will send the PDF separately)') + '.', photos: ref ? [{ ref: ref, name: L.name + '.pdf', type: 'application/pdf' }] : [], by: who.name || who.email, source: 'letter' }, who);
      return { status: 200, out: { ok: !!(q.out && q.out.ok), postId: q.out && q.out.id, ref: ref, pdf: body.preview ? L.pdf.toString('base64') : undefined } };
    }
    if (a === 'agreement') {   /* the blank Maintenance Agreement (DRAFT) for Forms & Docs / printing */
      const T = A.settings.tiers.bronze; return { status: 200, out: { ok: true, name: 'GrayCo Maintenance Agreement (DRAFT).pdf', pdf: require('./maint-docs.js').agreement({ customer: '', property: '', plans: [], tierName: T.name, discount: T.discount, autoRenew: false, date: nowIso().slice(0, 10) }, ctx.sel()).toString('base64') } };
    }
    if (a === 'pamphlet' || a === 'pamphlet-mail') {
      const D = require('./maint-docs.js'), aud = D.AUD[s(body.audience)] ? s(body.audience) : 'residential';
      const photos = [];   /* owner decision 11: up to 3 photos he picked (JPEG from the file storage) */
      for (const ref of (A.settings.pamphletPhotos && Array.isArray(A.settings.pamphletPhotos[aud]) ? A.settings.pamphletPhotos[aud] : []).slice(0, 3)) {
        try { const buf = await ctx.readFile(ref); const sz = buf && D.jpegSize(buf); photos.push(sz ? Object.assign({ bin: buf.toString('latin1') }, sz) : null); } catch (e) { photos.push(null); } }
      const pdf = D.pamphlet(aud, A.settings, ctx.sel(), null, photos);
      if (a === 'pamphlet') return { status: 200, out: { ok: true, name: 'GrayCo Maintenance — ' + D.AUD[aud].title + '.pdf', pdf: pdf.toString('base64') } };
      const to = s(body.to); if (!okEmail(to)) return { status: 400, out: { ok: false, error: 'Who should get it (e-mail)?' } };
      const ref = await ctx.storePdf(pdf, 'GrayCo Maintenance pamphlet (' + aud + ').pdf');
      const q = await C().queueApproval({ id: 'appr_mtp_' + aud + '_' + Date.now().toString(36), kind: 'maint_outreach', pid: s(body.pid), jobName: 'Maintenance pamphlet', pm: null, to: to, subject: clip(body.subject || D.AUD[aud].title + ' — GrayCo', 200),
        html: textHtml(s(body.body) || 'Hi,\n\nHere is our maintenance plan pamphlet (attached). Reply or call 901-585-0944 with any question.\n\nGrayCo Construction Services'),
        attachments: ref ? [{ kind: 'file', ref: ref, name: 'GrayCo Maintenance pamphlet.pdf' }] : [], meta: { pamphlet: aud, by: who.email } });
      return q ? { status: 200, out: { ok: true, queued: true, attached: !!ref } } : { status: 503, out: { ok: false, error: 'Could not put it on ✅ Approvals.' } };
    }
    return null;
  }
  return { act: act, scheduleFor: scheduleFor };
}
module.exports = { make, STAGES, PROS_KEY, PROPS_KEY, VISITS_KEY, PORT_KEY, visitRows, cleanProspect };
