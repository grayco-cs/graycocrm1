// netlify/functions/_lib/cobrand.js — patch COTRAIN (owner 11/12: "make sure everything is branded correctly"): what a GrayCo Mitigation /
// GrayCo Environmental job's customer sees and receives carries THAT company — the portal header and footer, the e-mails' sender name,
// subject, logo and "check made out to …". A Construction job is unchanged (info() → null). The company list (legal name, license,
// phone, logo) is gc_kv gc_companies, admins edit it in 🏢 Companies; the defaults below fill what is not set.
'use strict';
const JA = require('./job-auto.js');
const DEF = {
  mitigation: { legal: 'GrayCo Mitigation, LLC', short: 'Mitigation', logo: '/img/grayco-mitigation-logo.png', color: '#0e7490' },
  environmental: { legal: 'GrayCo Environmental, LLC', short: 'Environmental', logo: '/img/grayco-environmental-logo.png', color: '#15803d' }
};
const NAME0 = 'GrayCo Construction Services', LIC0 = 'TN #85034 BCB · AR #0486990627 · MS #27769', LIC0H = 'TN #85034 BCB &middot; AR #0486990627 &middot; MS #27769', LIC0U = 'TN #85034 BCB · AR #0486990627 · MS #27769';
function s(v){ return v == null ? '' : String(v).trim(); }
function list(companies){ let v = companies; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && Array.isArray(v.list) ? v.list : []; }
/* null for a Construction job; else { id, legal, short, license, phone, logo, color } (never an EIN) */
function info(p, companies){
  const co = JA.companyOf(p); if (co === 'construction' || !DEF[co]) return null;
  const sv = list(companies).filter(function(c){ return c && c.id === co; })[0] || {}, d = DEF[co];
  const logo = /^\/[\w./-]+\.(png|jpe?g|svg)$/i.test(s(sv.logo)) ? s(sv.logo).replace(/\.jpe?g$/i, '.png') : d.logo;
  return { id: co, legal: s(sv.legal) || d.legal, short: s(sv.short) || d.short, license: s(sv.license), phone: s(sv.phone), logo: logo, color: /^#[0-9a-f]{3,8}$/i.test(s(sv.color)) ? s(sv.color) : d.color };
}
function noLLC(c){ return c.legal.replace(/,? *LLC\.?$/i, ''); }
const GROUP_RX = /GrayCo Construction Services, LLC \((construction and restoration)\)/g;
function text(str, c){
  if (!c || typeof str !== 'string' || !str) return str;
  const keep = []; let t = str.replace(GROUP_RX, function(m){ keep.push(m); return '\u0001' + (keep.length - 1) + '\u0001'; });
  t = t.split(NAME0 + ', LLC').join(c.legal).split(NAME0).join(noLLC(c)).split(LIC0).join(c.license).split(LIC0H).join(c.license).split(LIC0U).join(c.license)
    .split('/portal-logo.png').join(c.logo).replace(/ · TIN #33-2106808/g, '');
  return t.replace(/\u0001(\d+)\u0001/g, function(m, i){ return keep[+i]; });
}
/* an outgoing e-mail (Resend payload) for that job */
function apply(payload, c){ if (!c || !payload) return payload; ['from', 'subject', 'html', 'text'].forEach(function(k){ if (typeof payload[k] === 'string') payload[k] = text(payload[k], c); }); return payload; }
module.exports = { DEF: DEF, info: info, text: text, apply: apply };
