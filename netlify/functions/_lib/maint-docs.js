/* ============================================================================
   GrayCo — maintenance PAMPHLETS and roof LETTERS (patch MAINTPLUS, owner round 3).   netlify/functions/_lib/maint-docs.js

   · pamphlet(audience, settings) → a one-page printable PDF (the CRM's letterhead: logo, 5796 Ferguson Rd, Bartlett, TN 38134 ·
     901-585-0944) for 'multifamily' (property managers), 'commercial', 'residential' and 'insurance' (a residential version
     for restoration customers: prevention plans and priority emergency service). Each lists that audience's plans, the
     Bronze / Silver / Gold tiers, the Free Roof Inspection, the priority snow + emergency perk (commercial / multi-family)
     and a QR code to sign up / contact us. No prices (they are set per property) and never an insurance carrier's name.
   · letter(kind, fields, settings) → a roof certification (for a sale, a refinance, insurance) or a workmanship warranty
     letter from the property's last inspection; the words are editable templates (settings.letters).
   Pure (no network): selections.js buildPdf draws it; the caller stores / posts it through ✅ Approvals.
   ========================================================================== */
'use strict';
const M = require('./maint.js');
function s(v){ return v == null ? '' : String(v).trim(); }
const PHONE = '901-585-0944', EMAIL = 'info@grayco-cs.com';
const AUD = {
  multifamily: { title: 'Maintenance plans for property managers & multi-family', intro: 'One partner for every building in your portfolio: each property gets its own plan, the visits are on our schedule (not yours), and you get one contract view and one combined invoice if you like.',
    plans: ['c_roof', 'c_coat', 'c_hvac', 'c_gutter', 'c_wash', 'c_lot', 'c_ada', 'c_mready', 'c_ready', 'c_pcr', 'c_snow'], priority: true },
  commercial: { title: 'Commercial building maintenance plans', intro: 'Keep your roof, building envelope and grounds ahead of repairs — done by GrayCo\'s own crews, with a photo report after every visit.',
    plans: ['c_roof', 'c_coat', 'c_hvac', 'c_water', 'c_storm', 'c_gutter', 'c_env', 'c_wash', 'c_lot', 'c_ada', 'c_ready', 'c_pcr', 'c_snow'], priority: true },
  residential: { title: 'Home maintenance plans', intro: 'Protect your home and the work we did with a visit from GrayCo — small fixes on the spot and a photo report, so little things never become big repairs.',
    plans: ['roof', 'gutter', 'home', 'hvac', 'wash', 'deck', 'water', 'vent', 'storm', 'snow', 'whole'], priority: false },
  insurance: { title: 'After the restoration: keep it from happening again', intro: 'Your home has been put back together. These plans help prevent the next water, fire or storm loss — and plan members get priority emergency service.',
    plans: ['vent', 'water', 'roof', 'gutter', 'storm', 'hvac', 'home', 'whole'], priority: false, emergency: true }
};
function pamphlet(aud, settings, sel, link, photos){
  const a = AUD[aud] || AUD.residential, st = settings && settings.plans ? settings : M.settingsOf(settings), by = {}; st.plans.forEach(function(x){ by[x.id] = x; });
  const ph = (photos || []).slice(0, 3); while (ph.length < 3) ph.push(null);   /* owner decision 11: up to 3 photos; a quiet placeholder until he picks them */
  const b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: a.title, bold: true, size: 14 }, { t: 'p', text: a.intro }, { t: 'photos', photos: ph, h: 64, caption: 'Photo' }, { t: 'h', text: 'Plans' }];
  const L = a.plans.map(function(id){ return by[id]; }).filter(function(x){ return x && x.on !== false; }).map(function(x){ return x.name.replace(/[^\x20-\x7e\xa0-\xff]/g, '').trim() + ' (' + M.freqLabel(x.freq).replace(/, on call$/, '').toLowerCase() + ')'; });
  for (let i = 0; i < L.length; i += 2) b.push({ t: 'row', left: L[i], right: L[i + 1] || '' });   /* two a line: one page */
  b.push({ t: 'p', text: 'Prices are set for your property — ask for a free quote. FREE ROOF INSPECTION: a no-obligation photo report of what we found, what to watch, and what (if anything) needs attention.', size: 9 });
  b.push({ t: 'h', text: 'Membership: Bronze, Silver, Gold' });
  ['bronze', 'silver', 'gold'].forEach(function(k){ const t = st.tiers[k]; b.push({ t: 'row', left: t.name + ': ' + t.discount + '% off repairs', right: t.note ? 'yearly free-plan drawing' : (k === 'silver' ? '+1 service call a year' : 'every plan customer starts here') }); });
  if (a.priority) { b.push({ t: 'h', text: 'Priority list: snow + emergency' }); b.push({ t: 'p', text: 'Every commercial and multi-family plan customer is on our priority list for snow and ice clean-up and for emergency mitigation (water, fire, storm) — you are called first.' }); }
  if (a.emergency) { b.push({ t: 'h', text: 'Priority emergency service' }); b.push({ t: 'p', text: 'Plan members are first in line when water, fire or a storm strikes — 24/7, call ' + PHONE + '.' }); }
  b.push({ t: 'gap', h: 6 });
  b.push({ t: 'qr', text: link || ('https://grayco-cs.com/?utm_source=pamphlet&utm_medium=print&utm_campaign=maint-' + aud), size: 72, caption: 'Sign up or ask a question · Scan, call ' + PHONE + ' or e-mail ' + EMAIL });
  return sel.buildPdf(b);
}
const LETTERS = {
  cert_sale: { name: 'Roof certification — home / building sale', title: 'Roof Certification', body: 'To whom it may concern:\n\nGrayCo Construction Services inspected the roof at {{property}} on {{inspectedOn}}. Based on that inspection, the roof was in serviceable condition with no active leaks found, and we expect it to remain serviceable for the next {{years}} year(s) with normal maintenance.\n\nFindings: {{findings}}\n\nThis certification is provided for the sale of the property and is based on a visual inspection on the date above.' },
  cert_refi: { name: 'Roof certification — refinance', title: 'Roof Certification', body: 'To whom it may concern:\n\nGrayCo Construction Services inspected the roof at {{property}} on {{inspectedOn}} for a refinance. The roof was in serviceable condition with no active leaks found; we estimate a remaining useful life of about {{years}} year(s) with normal maintenance.\n\nFindings: {{findings}}' },
  cert_ins: { name: 'Roof certification — insurance', title: 'Roof Certification', body: 'To whom it may concern:\n\nGrayCo Construction Services inspected the roof at {{property}} on {{inspectedOn}}. At that time the roof covering, flashing and penetrations were in serviceable condition with no active leaks found. Estimated remaining life: about {{years}} year(s).\n\nFindings: {{findings}}' },
  warranty: { name: 'Workmanship warranty letter', title: 'Workmanship Warranty', body: 'Dear {{customer}},\n\nGrayCo Construction Services warrants its workmanship on the work at {{property}} for {{years}} year(s) from {{inspectedOn}}: if a leak or failure is caused by our workmanship, we will repair it at no charge. The plan\'s maintenance visits keep this warranty in good standing.\n\nNotes: {{findings}}' }
};
function lettersOf(v){ const o = v && typeof v === 'object' ? v : {}, out = {}; Object.keys(LETTERS).forEach(function(k){ const x = o[k] && typeof o[k] === 'object' ? o[k] : {}; out[k] = { name: LETTERS[k].name, title: s(x.title || LETTERS[k].title).slice(0, 80), body: s(x.body || LETTERS[k].body).slice(0, 5000) }; }); return out; }
function letter(kind, f, settings, sel){
  const L = lettersOf(settings && settings.letters)[kind]; if (!L) return null;
  const body = L.body.replace(/\{\{(\w+)\}\}/g, function(_, k){ return f[k] != null && s(f[k]) ? s(f[k]) : '—'; });
  const b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: L.title, bold: true, size: 14 }, { t: 'p', text: 'Date: ' + s(f.date) }, { t: 'gap', h: 6 }];
  body.split(/\n\n+/).forEach(function(par){ b.push({ t: 'p', text: par.replace(/\n/g, ' ') }); b.push({ t: 'gap', h: 4 }); });
  b.push({ t: 'gap', h: 10 }); b.push({ t: 'p', text: s(f.inspector) || 'GrayCo Construction Services', bold: true }); b.push({ t: 'p', text: 'GrayCo Construction Services · ' + PHONE + ' · ' + EMAIL, size: 9, muted: true });
  return { pdf: sel.buildPdf(b), name: L.name };
}
/* the MAINTENANCE AGREEMENT (owner decision 4) — DRAFT for the lawyer's review. o = { customer, property, plans: [{ planName,
   freq, price, includes, addOns }], tier, discount, autoRenew (true only when the customer ticked it), date, signed: { name, at } } */
function agreement(o, sel){
  const total = (o.plans || []).reduce(function(t, x){ return t + (Number(x.price) || 0); }, 0), usd = function(n){ return '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); };
  const b = [{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'p', text: 'MAINTENANCE AGREEMENT — DRAFT FOR LAWYER REVIEW', bold: true, size: 13 }, { t: 'p', text: 'Not final until reviewed by GrayCo\'s attorney.', size: 9, muted: true }, { t: 'gap', h: 4 },
    { t: 'row', left: 'Customer', right: s(o.customer) || '—' }, { t: 'row', left: 'Property', right: s(o.property) || '—' }, { t: 'row', left: 'Date', right: s(o.date) },
    { t: 'h', text: '1. Term' }, { t: 'p', text: 'One year from the date the customer signs. ' + (o.autoRenew ? 'The customer chose AUTO-RENEW: the agreement renews each year and GrayCo sends the renewal invoice; the customer can stop it any time by written notice (e-mail is fine) before the renewal date.' : 'It does NOT renew automatically: GrayCo asks the customer before each renewal.') },
    { t: 'h', text: '2. Services and frequency' }];
  (o.plans || []).forEach(function(x){ b.push({ t: 'row', left: s(x.planName), right: M.freqLabel(x.freq) + ' · ' + usd(x.price) + ' / year' }); if (x.includes) b.push({ t: 'p', text: s(x.includes), size: 9 }); });
  b.push({ t: 'h', text: '3. Price and payment' }); b.push({ t: 'p', text: 'Total ' + usd(total) + ' per year, invoiced per the plan\'s billing schedule (once, twice or four times a year) and due on receipt. GrayCo does not store card numbers; pay with the options on the invoice or in the GrayCo customer portal.' });
  b.push({ t: 'h', text: '4. Membership tier' }); b.push({ t: 'p', text: (s(o.tierName) || 'Bronze') + ' member: ' + (Number(o.discount) || 0) + '% off repairs found on plan visits (quoted separately and only done with the customer\'s OK).' });
  b.push({ t: 'h', text: '5. Cancellation' }); b.push({ t: 'p', text: 'Either party may end this agreement with written notice (e-mail is fine). No refund is owed for a visit already made; a prepaid period not yet served is refunded pro rata.' });
  b.push({ t: 'h', text: '6. Exclusions' }); b.push({ t: 'p', text: 'Repairs beyond the small touch-ups listed above, damage from storms, fire, flood or other casualty, code upgrades, hidden or pre-existing conditions, and work on systems not listed are not included and are quoted separately. This agreement does not change or replace any manufacturer warranty or insurance policy.' });
  b.push({ t: 'h', text: '7. Liability' }); b.push({ t: 'p', text: 'GrayCo carries general liability insurance and is responsible for damage caused by its own work. GrayCo is not liable for conditions it did not cause or for losses from a condition reported to the customer and not repaired. Liability under this agreement is limited to the fees paid in the current year, except where the law does not allow a limit.' });
  b.push({ t: 'gap', h: 8 }); b.push({ t: 'h', text: 'Signature' });
  b.push({ t: 'p', text: o.signed ? 'Signed by ' + s(o.signed.name) + ' on ' + s(o.signed.at) + ' in the GrayCo customer portal.' : 'To be signed in the GrayCo customer portal.' });
  return sel.buildPdf(b);
}
/* the JPEG's size (for a pamphlet photo) */
function jpegSize(buf){
  try { let i = 2; while (i < buf.length) { if (buf[i] !== 0xFF) return null; const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), gray: buf[i + 9] === 1 }; i += 2 + len; } } catch (e) {}
  return null;
}
module.exports = { agreement, jpegSize, AUD, pamphlet, LETTERS, lettersOf, letter };
