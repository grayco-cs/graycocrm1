/* ============================================================================
   GrayCo — WHAT A SUB (or supplier) SEES OF A BID JOB'S FILES AND LINKS.   netlify/functions/_lib/subvis.js   (patch BIDVIS)

   Owner (11/19): "Don't need people to see the invitation to bid publicly, just the plans, addendums and scopes if possible."

   Every plan file, spec file, scope file and plan-room link on a bid job can carry `subsVisible` (true / false), set by an
   admin with the "Visible to subs" toggle on the bid site. Not set → the default:
     · the GC's / owner's invitation to bid, the public solicitation page, the bid form, the notice to bidders, the
       instructions to bidders, a bid board's own page (BuildingConnected, SAM.gov, a government bid board) → HIDDEN;
     · plans, drawings, specs, addenda and GrayCo's own scopes (trade scopes, scope documents) → SHOWN.
   A name that says both (e.g. "ITB 26-014 Drawings.pdf") is a plan set → shown. Admins always see everything.

   const V = require('./_lib/subvis.js');
   V.visible(item, kind)        → true / false   (kind: 'plan' | 'spec' | 'link' | 'scope' | 'addendum')
   V.isSolicitation(item, kind) → what the default thinks (the toggle's starting point)
   V.notesFor(notes, hiddenLinks) → the job notes without the lines that carry a hidden link
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
const HIDE = /\b(solicitations?|invitations?(\s+(to|for)\s+bids?)?|invite\s+to\s+bid|itb|ifb|rfp|rfq|rfb|bid\s*forms?|proposal\s*forms?|forms?\s+of\s+(bid|proposal)|notices?\s+(to|of)\s+(bidders|contractors|bid|solicitation)|notice\s*&\s*documents|bid\s+notices?|advertisement(\s+for\s+bids)?|legal\s+notices?|instructions?\s+to\s+bidders|bid\s+bonds?|bidders?'?\s+(list|registration)|bid\s+tabulations?|bid\s+invite)\b/i;
const PLANWORD = /\b(plans?|drawings?|sheets?|blueprints?|addend\w*|specs?|specifications?|project\s+manual|scopes?)\b/i;
const BOARD = /^(government|buildingconnected|bid\s*board)$/i;
const HOST = /(^|\.)(buildingconnected\.com|sam\.gov|bidnetdirect\.com|bonfirehub\.com|demandstar\.com|publicpurchase\.com|planetbids\.com|ionwave\.net|bidsync\.com|periscopeholdings\.com)$/i;
function hostOf(u){ try { return new URL(s(u)).host; } catch (e) { return ''; } }
function isSolicitation(item, kind){
  if (!item || typeof item !== 'object') return false;
  if (kind === 'scope' || kind === 'addendum') return false;   /* GrayCo's own scopes and the addenda: shown */
  const text = [item.name, item.label, item.category, item.title].map(s).join(' ').replace(/[_\-.]+/g, ' ');
  const own = [item.name, item.label, item.title].map(s).join(' ').replace(/[_\-.]+/g, ' ');   /* a "scope" category is a guess; the name says what it is */
  if (HIDE.test(text) && !PLANWORD.test(own)) return true;
  if (kind === 'link') {
    if (BOARD.test(s(item.board)) && !PLANWORD.test(own)) return true;
    if (HOST.test(hostOf(item.url)) && !PLANWORD.test(own)) return true;
  }
  return false;
}
/* patch NOLINKS: a link a sub may see — only GrayCo's own plan set (too big to upload), never a plan room, a bid board or a solicitation */
const ROOM = /\b(plan\s*-?\s*rooms?|planrooms?|bid\s*rooms?|bid\s*boards?|solicitations?|bidding\s+documents?|bid\s+documents?|documents?\s+for\s+bid)\b/i;
function planSetLink(item){
  const own = [item.name, item.label, item.title].map(s).join(' ').replace(/[_\-.]+/g, ' ');
  if (!s(item.url) || s(item.board)) return false;
  if (/(^|\.)(drive\.google\.com|docs\.google\.com|dropbox\.com)$/i.test(hostOf(item.url))) return true;   /* patch DRIVEPLANS (owner 11/25): a Drive / Dropbox link GrayCo posts is plans, whatever its label */
  if (ROOM.test(own) || isSolicitation(item, 'link') || HOST.test(hostOf(item.url))) return false;
  return PLANWORD.test(own);
}
function visible(item, kind){
  if (!item || typeof item !== 'object') return false;
  if (kind === 'link') return item.subsVisible !== false && planSetLink(item);   /* patch NOLINKS (owner 11/24): no tick opens a plan room / solicitation link to subs (a 'hidden' tick still hides) */
  if (item.subsVisible === true) return true;
  if (item.subsVisible === false) return false;
  return !isSolicitation(item, kind);
}
function list(v, kind){ return Array.isArray(v) ? v.filter(function(x){ return visible(x, kind); }) : v; }
/* the job notes a sub sees: no line carrying a hidden link (the Lead Inbox writes "Government: https://…" lines) */
function notesFor(notes, hidden){
  const urls = (Array.isArray(hidden) ? hidden : []).map(function(l){ return s(l && l.url).replace(/[#?].*$/, ''); }).filter(Boolean);
  if (!s(notes)) return notes;
  return String(notes).split('\n').filter(function(line){
    const L = line.trim();
    /* patch NOTESCLEAN (owner 11/23 "take out they are GC"): never the GC / owner / bid # / "From GrayCo" / draft lines the Lead Inbox wrote */
    if (/^(from grayco construction services\b|draft from the crm lead inbox|gc:|owner:|bid #:|general contractor:)/i.test(L)) return false;
    if (urls.some(function(u){ return L.indexOf(u) > -1; })) return false;
    const m = /(https?:\/\/[^\s]+)/i.exec(L);
    if (m && isSolicitation({ label: L.replace(m[1], ''), board: L.split(':')[0].trim(), url: m[1] }, 'link')) return false;
    return true;
  }).join('\n');
}
module.exports = { visible, isSolicitation, planSetLink, list, notesFor, _re: { HIDE, PLANWORD } };
