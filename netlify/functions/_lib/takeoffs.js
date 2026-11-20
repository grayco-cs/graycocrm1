/* patch MEASURE (owner 11/20: "i do want them to be able to use a measuring tool for plans with scale" · "write notes in the plan takeoff
   measure tool and save measurements when measured SF and LF etc.")
   One takeoff document per person + job + plan file, every page inside it, kept in the bid site's sp_rows store (collection 'takeoffs').
     owner  — a bid-site sub's profile id · 'gc' for GrayCo staff (saved to the job, shared by staff) · 'crm.<subId>' for a sub who
              opened a CRM job's plan from portal.grayco-cs.com (a signed measure ticket, see mint/read below)
     job    — the bid job id · 'crm.<projectId>' for a CRM job
     file   — a short hash of the plan file's name (the same file → the same takeoff on any phone or computer)
   Shape: { v: 2, file: { name, type }, pages: { "<n>": { ppf, label } }, items: [ { id, page, type, pts: [[x, y]…], name, note,
            height, depth, text } ], updatedAt, by }
     ppf = page units (PDF points / image pixels) per real foot; type = line (LF) · rect / area (SF + perimeter LF) · count (EA) · note.
     height (ft) on a line → wall SF = LF × height · depth (in) on an area → CY = SF × depth ÷ 12 ÷ 27.
   Nothing here holds a price. A takeoff is private to its owner; the server never lists one owner's takeoffs to another. */
'use strict';
const crypto = require('crypto');

const TYPES = ['line', 'rect', 'area', 'count', 'note'];
const MAX_ITEMS = 1500, MAX_PTS = 400;
function s(v){ return v == null ? '' : String(v); }
function n(v){ const x = Number(v); return isFinite(x) ? x : 0; }
function clip(v, k){ return s(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, k); }
function fileKey(name){ return crypto.createHash('sha1').update(s(name).trim().toLowerCase()).digest('hex').slice(0, 16); }
function rowId(owner, job, fkey){ return [owner, job, fkey].join(':'); }

function clean(doc, file){
  doc = doc && typeof doc === 'object' ? doc : {};
  const pages = {};
  Object.keys(doc.pages || {}).slice(0, 500).forEach(function(k){
    const pg = Math.round(n(k)); const p = doc.pages[k] || {};
    if (pg >= 1 && n(p.ppf) > 0 && n(p.ppf) < 1e6) pages[pg] = { ppf: n(p.ppf), label: clip(p.label, 40) };
  });
  const items = (Array.isArray(doc.items) ? doc.items : []).slice(0, MAX_ITEMS).map(function(m){
    if (!m || TYPES.indexOf(m.type) < 0) return null;
    const pts = (Array.isArray(m.pts) ? m.pts : []).slice(0, MAX_PTS).map(function(p){ return [Math.round(n(p && p[0]) * 100) / 100, Math.round(n(p && p[1]) * 100) / 100]; });
    if (!pts.length) return null;
    const o = { id: clip(m.id, 40) || 'm' + crypto.randomBytes(4).toString('hex'), page: Math.max(1, Math.round(n(m.page)) || 1), type: m.type, pts: pts,
      name: clip(m.name, 80), note: clip(m.note, 1000) };
    if (n(m.height) > 0) o.height = Math.min(1000, n(m.height));
    if (n(m.depth) > 0) o.depth = Math.min(1000, n(m.depth));
    if (m.type === 'note') o.text = clip(m.text, 1000);
    if (m.at) o.at = clip(m.at, 30);
    return o;
  }).filter(Boolean);
  return { v: 2, file: { name: clip(file && file.name, 200), type: clip(file && file.type, 60) }, pages: pages, items: items };
}

/* ── the math (the bid site's page uses the same formulas) ── */
function dist(a, b){ return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function pathLen(p){ let t = 0; for (let i = 1; i < p.length; i++) t += dist(p[i - 1], p[i]); return t; }
function ringPts(m){ if (m.type !== 'rect') return m.pts; const a = m.pts[0], b = m.pts[1] || a; return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; }
function areaPx(p){ let t = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; t += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(t) / 2; }
function qty(m, ppf){
  if (m.type === 'count') return { ea: m.pts.length };
  if (m.type === 'note' || !(ppf > 0)) return {};
  if (m.type === 'line') { const lf = pathLen(m.pts) / ppf; const o = { lf: lf }; if (m.height) o.wallSf = lf * m.height; return o; }
  const r = ringPts(m); if (r.length < 3) return {};
  const sf = areaPx(r) / (ppf * ppf), lf = (pathLen(r) + dist(r[r.length - 1], r[0])) / ppf;
  const o = { sf: sf, lf: lf }; if (m.depth) o.cy = sf * m.depth / 12 / 27; return o;
}
const DEF = { line: 'Line', rect: 'Area', area: 'Area', count: 'Count' };
/* totals grouped by name + unit, over one or more takeoff docs */
function totals(docs){
  const g = {}, order = [];
  function add(name, unit, v, note){ if (!(v > 0)) return; const k = name.toLowerCase() + '|' + unit; if (!g[k]) { g[k] = { name: name, unit: unit, qty: 0, n: 0, notes: [] }; order.push(k); } g[k].qty += v; g[k].n++; if (note && g[k].notes.length < 5) g[k].notes.push(note); }
  (docs || []).forEach(function(d){ (d.items || []).forEach(function(m){
    const ppf = d.pages && d.pages[m.page] && d.pages[m.page].ppf, q = qty(m, ppf), nm = s(m.name).trim() || DEF[m.type] || '';
    if (m.type === 'line') { add(nm, 'LF', q.lf, m.note); add(nm + ' (wall)', 'SF', q.wallSf); }
    else if (m.type === 'rect' || m.type === 'area') { add(nm, 'SF', q.sf, m.note); add(nm + ' (perimeter)', 'LF', q.lf); add(nm, 'CY', q.cy); }
    else if (m.type === 'count') add(nm, 'EA', q.ea, m.note);
  }); });
  return order.map(function(k){ const x = g[k]; return { name: x.name, unit: x.unit, qty: Math.round(x.qty * (x.unit === 'EA' ? 1 : 100)) / (x.unit === 'EA' ? 1 : 100), n: x.n, notes: x.notes }; });
}
function summaryText(rows){ return rows.map(function(r){ return '• ' + r.name + ': ' + r.qty.toLocaleString('en-US') + ' ' + r.unit + (r.notes.length ? ' — ' + r.notes.join('; ').slice(0, 200) : ''); }).join('\n'); }

/* ── a measure ticket: portal.grayco-cs.com → the bid site's measure tool for one CRM plan file (no bid-site sign-in needed).
   Signed with a key made from the server's own secret; it names the sub, the CRM job and the file, and lasts 12 hours. ── */
function key(){ return crypto.createHmac('sha256', 'measure-ticket|' + (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev')).update('v1').digest(); }
function b64(x){ return Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function mint(o, ms){
  const body = b64(JSON.stringify({ s: s(o.sub), p: s(o.pid), r: s(o.ref), n: clip(o.name, 160), t: clip(o.type, 60), j: clip(o.job, 160), e: Date.now() + (ms || 12 * 3600e3) }));
  return body + '.' + crypto.createHmac('sha256', key()).update(body).digest('hex').slice(0, 40);
}
function read(t){
  const m = /^([A-Za-z0-9_-]{10,3000})\.([0-9a-f]{40})$/.exec(s(t)); if (!m) return null;
  const want = crypto.createHmac('sha256', key()).update(m[1]).digest('hex').slice(0, 40);
  if (!crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[2]))) return null;
  let o; try { o = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; }
  if (!o || !(o.e > Date.now()) || !o.s || !o.p || !o.r) return null;
  return o;
}
module.exports = { clean, qty, totals, summaryText, fileKey, rowId, mint, read, TYPES };
