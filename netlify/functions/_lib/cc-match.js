/* netlify/functions/_lib/cc-match.js — patch PHOTOLINK: is this CompanyCam project the same place as this CRM job?
   Used by companycam-sync (the 15-minute server run). An address is reduced to its house number + street name
   (lower case, "Street" = "St", "North" = "N", unit / apartment dropped); the city, state and ZIP never have to be
   written the same way, but two different ZIPs or two different street types (St vs Ave) are never the same place.
   No network, no secrets. */
'use strict';
const SUFFIX = { street: 'st', st: 'st', str: 'st', road: 'rd', rd: 'rd', avenue: 'ave', ave: 'ave', av: 'ave', drive: 'dr', dr: 'dr', drv: 'dr',
  lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct', boulevard: 'blvd', blvd: 'blvd', highway: 'hwy', hwy: 'hwy', place: 'pl', pl: 'pl',
  circle: 'cir', cir: 'cir', parkway: 'pkwy', pkwy: 'pkwy', cove: 'cv', cv: 'cv', terrace: 'ter', ter: 'ter', trail: 'trl', trl: 'trl',
  way: 'way', pike: 'pike', run: 'run', loop: 'loop', square: 'sq', sq: 'sq', crossing: 'xing', xing: 'xing', point: 'pt', pt: 'pt',
  bend: 'bnd', bnd: 'bnd', ridge: 'rdg', rdg: 'rdg', path: 'path', row: 'row', alley: 'aly', aly: 'aly' };
const DIR = { north: 'n', n: 'n', south: 's', s: 's', east: 'e', e: 'e', west: 'w', w: 'w', northeast: 'ne', ne: 'ne', northwest: 'nw', nw: 'nw',
  southeast: 'se', se: 'se', southwest: 'sw', sw: 'sw' };
const UNIT = { apt: 1, apartment: 1, unit: 1, ste: 1, suite: 1, bldg: 1, building: 1, lot: 1, fl: 1, floor: 1, rm: 1, room: 1 };
const STATES = /^(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|tennessee|mississippi|arkansas)$/;
const ORD = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th' };

function s(v){ return v == null ? '' : String(v).trim(); }
/* { num, name, suffix, zip } or null (no house number = not an address we can trust) */
function addrParts(a){
  if (a && typeof a === 'object') a = [a.street_address_1, a.street_address_2, a.city, a.state, a.postal_code].map(s).filter(Boolean).join(', ');
  const t = s(a).toLowerCase(); if (!t) return null;
  const zm = /\b(\d{5})(?:-\d{4})?\s*(?:,?\s*(?:usa|us|united states))?\s*$/.exec(t);
  const zip = zm ? zm[1] : '';
  const hasComma = t.indexOf(',') >= 0;
  const line = (hasComma ? t.split(',')[0] : t).replace(/#\s*\w+/g, ' ');
  const tok = line.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!tok.length || !/^\d+[a-z]?$/.test(tok[0])) return null;
  const num = tok[0];
  const name = []; let suffix = '';
  for (let i = 1; i < tok.length; i++) {
    let w = tok[i];
    if (UNIT[w]) break;
    if (!hasComma && zip && w === zip) break;
    if (!hasComma && STATES.test(w) && name.length) break;
    if (ORD[w]) w = ORD[w];
    if (DIR[w]) { if (!name.length || i === tok.length - 1 || SUFFIX[tok[i - 1]]) continue; w = DIR[w]; }
    if (SUFFIX[w] && name.length) { suffix = SUFFIX[w]; const nx = tok[i + 1]; if (nx && DIR[nx]) i++; break; }
    name.push(w);
    if (!hasComma && name.length >= 4) break;
  }
  if (!name.length) return null;
  return { num, name: name.join(' '), suffix, zip, noComma: !hasComma && !suffix };
}
/* the index key: house number + street name */
function addrKey(a){ const p = addrParts(a); return p ? p.num + ' ' + p.name : ''; }
/* the same place? (number + name the same; street type and ZIP the same when both say one) */
function sameAddr(a, b){
  const x = a && a.num ? a : addrParts(a), y = b && b.num ? b : addrParts(b);
  if (!x || !y) return false;
  if (x.num !== y.num || x.name !== y.name) return false;
  if (x.suffix && y.suffix && x.suffix !== y.suffix) return false;
  if (x.zip && y.zip && x.zip !== y.zip) return false;
  return true;
}
/* a job / project name, for the name match: letters + digits only, at least 4 of them */
function normName(n){ const k = s(n).toLowerCase().replace(/[^a-z0-9]/g, ''); return k.length >= 4 ? k : ''; }
module.exports = { addrParts, addrKey, sameAddr, normName };
