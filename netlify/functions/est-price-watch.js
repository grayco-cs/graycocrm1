// netlify/functions/est-price-watch.js — patch EST3 (owner, 21 Oct 2026): "material price watch in estimate builder".
// Once a day (netlify.toml, about 7:20 AM Central): every OPEN estimate (draft, pending review, submitted / sent and not
// signed) is checked against the newest material prices — the Estimate Builder's Price Log (gc_kv "__est__gc_matlog_v2")
// and the Product library (gc_kv "selectionLibrary"). A material line whose newest price is more than 5% above the
// price the estimate uses, and that changed after the estimate was priced, is "up". Each estimator / PM gets ONE e-mail
// listing their affected open estimates — only when that list changed since the last e-mail (gc_kv
// "gc_est_price_watch"), never twice a day, nothing when nothing is up. GrayCo staff only; never a customer.
// Netlify does not let anyone call a scheduled function by its URL in production; as a second lock any call that is
// not the scheduler must come from a signed-in admin (?dry=1 shows what would be sent, sends nothing).
'use strict';
const crypto = require('crypto');
const GC_SB_DEFAULT_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const GC_SB_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
function hdr(event, name){
  const h = (event && event.headers) || {};
  const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; });
  return k ? String(h[k] == null ? '' : h[k]) : '';
}
/* the same staff check as every function, admins only */
async function isAdmin(event){
  const m = /^Bearer\s+(\S+)$/i.exec(hdr(event, 'authorization').trim());
  if (!m) return false;
  const url = (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || GC_SB_DEFAULT_ANON;
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return false;
    const u = await r.json();
    const email = String((u && u.email) || '').trim().toLowerCase();
    if (!email || !svc) return false;
    const s = await fetch(url + '/rest/v1/gc_staff?select=role,active&email=eq.' + encodeURIComponent(email), { headers: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(svc) ? { apikey: svc, Authorization: 'Bearer ' + svc } : { apikey: svc } });
    if (!s.ok) return false;
    const rows = await s.json();
    return !!(rows && rows[0] && rows[0].active !== false && String(rows[0].role || '').toLowerCase() === 'admin');
  } catch (e) { return false; }
}
function isScheduled(event){
  try { const b = JSON.parse((event && event.body) || '{}'); return !!(b && b.next_run); } catch (e) { return false; }
}

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function stamp(e){ const a = s(e && (e.updatedAt || e.updated_at)), b = s(e && e.savedAt); return a > b ? a : b; }
function nkey(t){ return low(t).replace(/["“”]/g, ' in ').replace(/[^a-z0-9./\- ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
const CLOSED = /^(won|lost|signed|accepted|approved|awarded|contract|declined|rejected|cancel+ed|dead|archived|closed|void|template)/i;
function isOpen(e){ return !CLOSED.test(s(e && e.status)) && !e.isTemplate && !e._isDraft && !/^draft_/.test(s(e.id)) && !e._promotedTo && !e._supersededBy; }
function deadIds(data){
  const d = {};
  let t = data.gc_tombstones; if (typeof t === 'string') { try { t = JSON.parse(t); } catch (e) { t = {}; } }
  Object.keys(t || {}).forEach(function(k){ if (k.indexOf('estimates:') === 0) d[k.slice(10)] = 1; });
  return d;
}
/* the newest price per material name */
function priceIndex(data){
  const idx = {};
  function put(name, price, at, src){ const k = nkey(name); price = num(price); at = s(at); if (!k || !(price > 0) || !at) return; const o = idx[k]; if (!o || at > o.at) idx[k] = { price: price, at: at, src: src, name: s(name) }; }
  arr(data.__est__gc_matlog_v2).forEach(function(m){ if (m && m.desc) put(m.desc, m.cost, m.lastSeen || m.invoiceDate || m.firstSeen, 'Price Log'); });
  arr(data.selectionLibrary).forEach(function(r){ if (!r || r.removed || r.price == null || r.price === '') return; put(s(r.name) || [s(r.brand), s(r.line)].filter(Boolean).join(' '), r.price, r.priceAt || r.at, 'Product library'); });
  return idx;
}
function linesOf(e){
  if (Array.isArray(e.lines) && e.lines.length) return e.lines.map(function(l){ return { id: s(l.id), desc: s(l.desc || l.name), type: s(l.type || 'material'), cost: num(l.cost != null ? l.cost : l.uc), okAt: s(l._priceOkAt) }; });
  return arr(e.mats).map(function(m){ return { id: s(m.id), desc: s(m.name || m.desc), type: 'material', cost: num(m.uc != null ? m.uc : m.cost), okAt: '' }; });
}
function flagsOf(e, idx){
  const since = s(e._pricedAt || e.firstSavedAt || e.createdAt || e.date), out = [];
  linesOf(e).forEach(function(l){
    if (!l.desc || !/^mat/.test(l.type) || !(l.cost > 0)) return;
    const hit = idx[nkey(l.desc)]; if (!hit) return;
    const at = l.okAt || since; if (at && hit.at <= at) return;
    if (hit.price > l.cost * 1.05 + 0.005) out.push({ desc: l.desc, old: l.cost, price: hit.price, pct: Math.round((hit.price / l.cost - 1) * 1000) / 10, src: hit.src, at: hit.at });
  });
  return out;
}
/* who hears about an estimate: its estimator and the job's PM (GrayCo addresses only) */
function people(data){
  const by = {};
  arr(data.users).forEach(function(u){ if (u && u.name && u.email && u.active !== false) by[low(u.name)] = low(u.email); });
  return by;
}
function digest(data){
  const idx = priceIndex(data), names = people(data), dead = deadIds(data);
  const projects = {}; arr(data.projects).forEach(function(p){ if (p && p.id) projects[s(p.id)] = p; });
  const seen = {}, per = {};
  arr(data.estimates).forEach(function(e){
    if (!e || !e.id || dead[s(e.id)] || !isOpen(e)) return;
    const o = seen[e.id]; if (o && stamp(o) >= stamp(e)) return; seen[e.id] = e;
  });
  Object.keys(seen).forEach(function(id){
    const e = seen[id], fl = flagsOf(e, idx); if (!fl.length) return;
    const p = projects[s(e.pid)] || null;
    const who = [names[low(e.estimator)], p ? names[low(p.pm)] : ''].filter(function(x){ return /@grayco-cs\.com$/.test(s(x)); });
    Array.from(new Set(who)).forEach(function(em){ (per[em] = per[em] || []).push({ id: s(e.id), name: s(e.name || e.num || 'Estimate'), job: p ? s(p.name) : '', po: p ? s(p.autoPO || p.po) : s(e.po), status: s(e.status) || 'Draft', flags: fl }); });
  });
  const out = {};
  Object.keys(per).forEach(function(em){
    const list = per[em].sort(function(a, b){ return a.name.localeCompare(b.name); });
    const hash = crypto.createHash('sha1').update(JSON.stringify(list.map(function(x){ return [x.id, x.flags.map(function(f){ return [nkey(f.desc), f.price]; })]; }))).digest('hex').slice(0, 16);
    out[em] = { list: list, hash: hash };
  });
  return out;
}
function mail(list, site){
  const n = list.length, lines = list.reduce(function(t, x){ return t + x.flags.length; }, 0);
  const subject = '💲 Material prices up on ' + n + ' open estimate' + (n === 1 ? '' : 's') + ' (' + lines + ' line' + (lines === 1 ? '' : 's') + ')';
  const rows = list.map(function(x){
    return '<tr><td style="padding:8px 10px;border-bottom:1px solid #eee"><b>' + esc(x.name) + '</b><br><span style="color:#555;font-size:13px">' + esc([x.status, x.job ? 'Job ' + x.job : '', x.po ? 'PO ' + x.po : ''].filter(Boolean).join(' · ')) + '</span>' +
      x.flags.map(function(f){ return '<br><span style="font-size:13px">⚠️ ' + esc(f.desc) + ': uses ' + money(f.old) + ', newest ' + money(f.price) + ' (+' + f.pct + '%, ' + esc(f.src) + ', ' + esc(f.at.slice(0, 10)) + ')</span>'; }).join('') + '</td></tr>';
  }).join('');
  const html = '<div style="font:14px Arial;color:#1b1640;max-width:640px"><div style="background:#241968;color:#fff;padding:14px 18px;font-weight:700;font-size:16px">GrayCo — material prices went up</div><div style="padding:6px 18px 18px">' +
    '<p>The newest price for these materials is more than 5% above what your open estimate' + (n === 1 ? ' uses' : 's use') + '. Open the estimate in the CRM (📐 Estimates) and press <b>Update to new price</b> on each ⚠️ line before it goes out or gets signed.</p>' +
    '<table style="width:100%;border-collapse:collapse;font:14px Arial">' + rows + '</table>' +
    '<p style="margin-top:18px"><a href="' + esc(site) + '/#estbuilder" style="background:#d4a017;color:#1b1640;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open 📐 Estimates</a></p>' +
    '<p style="color:#777;font-size:12px">One e-mail a day at most, only when the list changed. Sent to the estimator and the job\'s PM.</p></div></div>';
  const text = subject + '\n\n' + list.map(function(x){ return '- ' + x.name + (x.job ? ' (job ' + x.job + ')' : '') + '\n' + x.flags.map(function(f){ return '    ' + f.desc + ': ' + money(f.old) + ' -> ' + money(f.price) + ' (+' + f.pct + '%)'; }).join('\n'); }).join('\n') + '\n\n' + site + '/#estbuilder';
  return { subject: subject, html: html, text: text };
}
function sbUrl(){ return (process.env.SUPABASE_URL || GC_SB_DEFAULT_URL).replace(/\/$/, ''); }
function svcH(){ const k = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; const h = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k) ? { apikey: k, Authorization: 'Bearer ' + k } : { apikey: k }; return Object.assign(h, { 'Content-Type': 'application/json' }); }
async function kvPut(key, value){
  const r = await fetch(sbUrl() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign(svcH(), { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) });
  return r.ok;
}
function centralDay(ms){ try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } }
async function run(opts){
  opts = opts || {};
  const now = opts.now || Date.now(), day = centralDay(now);
  const portal = require('./portal.js');
  const data = await portal._core.kvRead(['estimates', '__est__gc_matlog_v2', 'selectionLibrary', 'users', 'projects', 'gc_tombstones', 'gc_est_price_watch']);
  let st = data.gc_est_price_watch; if (typeof st === 'string') { try { st = JSON.parse(st); } catch (e) { st = null; } }
  st = st && typeof st === 'object' ? st : {}; st.sent = st.sent && typeof st.sent === 'object' ? st.sent : {};
  const dg = digest(data), site = (process.env.CRM_URL || process.env.PORTAL_BASE_URL || 'https://crm.grayco-cs.com').replace(/\/$/, '');
  const out = { ok: true, day: day, people: Object.keys(dg).length, sent: [], skipped: [], dry: !!opts.dry };
  const key = process.env.RESEND_API_KEY;
  for (const em of Object.keys(dg)) {
    const prev = st.sent[em] || {};
    if (prev.hash === dg[em].hash) { out.skipped.push({ to: em, why: 'same list as the last e-mail' }); continue; }
    if (prev.day === day) { out.skipped.push({ to: em, why: 'already e-mailed today' }); continue; }
    const m = mail(dg[em].list, site);
    if (opts.dry) { out.sent.push({ to: em, subject: m.subject, estimates: dg[em].list.length, dry: true }); continue; }
    if (!key) { out.skipped.push({ to: em, why: 'RESEND_API_KEY is not set' }); continue; }
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EST_WATCH_FROM || 'GrayCo Estimates <noreply@grayco-cs.com>', to: [em], subject: require('./_lib/mailtag.js').tag(m.subject, [em], 'area:Estimates'), html: m.html, text: m.text, headers: { 'X-GrayCo-CRM': 'est-price-watch' } }) });
      if (r.ok) { st.sent[em] = { hash: dg[em].hash, day: day, at: new Date(now).toISOString(), n: dg[em].list.length }; out.sent.push({ to: em, subject: m.subject, estimates: dg[em].list.length }); }
      else out.skipped.push({ to: em, why: 'Resend answered ' + r.status });
    } catch (e) { out.skipped.push({ to: em, why: 'Resend unreachable' }); }
  }
  /* someone whose list emptied: forget the old hash, so the next rise is news again */
  Object.keys(st.sent).forEach(function(em){ if (!dg[em]) delete st.sent[em]; });
  if (!opts.dry) { st.at = new Date(now).toISOString(); try { await kvPut('gc_est_price_watch', st); } catch (e) { out.stateError = s(e && e.message); } }
  return out;
}
exports.handler = async function (event) {
  event = event || {};
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const sched = isScheduled(event);
  if (!sched && !(await isAdmin(event))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Admins only.' }) };
  if (!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not set.' }) };
  const qs = event.queryStringParameters || {};
  try {
    const out = await run({ dry: !sched && qs.dry === '1' });
    try { console.log('[est-price-watch]', JSON.stringify({ people: out.people, sent: out.sent.length, skipped: out.skipped.length })); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Could not check the prices: ' + (e && e.message || e) }) };
  }
};
exports._t = { digest: digest, priceIndex: priceIndex, flagsOf: flagsOf, mail: mail, run: run, nkey: nkey };
